import { Route } from '../models/route.model';
import { Reservation } from '../models/reservation.model';
import { Unit, Component, BloodGroup } from '../models/unit.model';
import { BloodRequest, UrgencyLevel } from '../models/request.model';
import { SimState } from '../models/simState.model';
import { RulesService } from './rules.service';
import { OptimizerClient } from './optimizerClient';
import { FallbackPlannerService } from './fallbackPlanner.service';
import { InvariantService, InvariantResult } from './invariant.service';
import { AuditService } from './audit.service';
import { IActor } from '../models/auditLog.model';
import { NotFoundError } from '../errors/appError';
import { logger } from '../utils/logger';

export interface ScenarioDiff {
  added: Array<Record<string, unknown>>;
  removed: Array<Record<string, unknown>>;
  rerouted: Array<Record<string, unknown>>;
  unchanged: Array<Record<string, unknown>>;
}

export interface ScenarioResult {
  scenario: string;
  diff: ScenarioDiff;
  invariants: InvariantResult[];
  plan: Record<string, unknown>;
  disclaimer: string;
}

export class ScenarioService {
  /**
   * Helper to run optimizer or fallback replanning across open requests.
   */
  private static async replanOpenRequests(referenceNow: Date) {
    const [openRequests, availableUnits, routes] = await Promise.all([
      BloodRequest.find({ status: { $in: ['OPEN', 'PARTIAL'] } }).lean(),
      Unit.find({ status: 'AVAILABLE' }).lean(),
      Route.find().lean(),
    ]);

    if (openRequests.length === 0) {
      return {
        assignments: [],
        unfulfilled: [],
        metrics: { satisfied: 0, partial: 0, unfulfilled: 0 },
        source: 'none',
      };
    }

    const unitSnapshots = availableUnits.map((u) => ({
      id: u.id,
      component: u.component as Component,
      group: u.group as BloodGroup,
      hospitalId: u.hospitalId,
      collectedAt: u.collectedAt.toISOString(),
      expiresAt: u.expiresAt.toISOString(),
      status: u.status,
    }));

    const routeSnapshots = routes.map((r) => ({
      fromId: r.fromId,
      toId: r.toId,
      baseMinutes: r.baseMinutes,
      status: r.status,
      delayMinutes: r.delayMinutes,
    }));

    const requestSnapshots = openRequests.map((r) => ({
      id: r.id,
      hospitalId: r.hospitalId,
      component: r.component,
      group: r.group,
      unitsNeeded: r.unitsNeeded,
      neededBy: r.neededBy.toISOString(),
      urgency: r.urgency,
      status: r.status,
    }));

    try {
      const plan = await OptimizerClient.getPlan({
        units: unitSnapshots,
        requests: requestSnapshots,
        routes: routeSnapshots,
        now: referenceNow.toISOString(),
        mode: 'optimized',
      });
      return plan;
    } catch (err: any) {
      logger.warn(
        { err: err.message },
        'Optimizer unavailable during scenario replan; executing fallback baseline planner'
      );
      const fallbackUnits = availableUnits.map((u) => ({
        id: u.id,
        component: u.component as Component,
        group: u.group as BloodGroup,
        hospitalId: u.hospitalId,
        expiresAt: u.expiresAt,
        status: u.status,
      }));
      const fallbackRequests = openRequests.map((r) => ({
        id: r.id,
        component: r.component as Component,
        group: r.group as BloodGroup,
        hospitalId: r.hospitalId,
        unitsNeeded: r.unitsNeeded,
        neededBy: r.neededBy,
        urgency: r.urgency,
      }));
      return FallbackPlannerService.plan(
        fallbackUnits,
        fallbackRequests,
        routes.map((r) => ({
          fromId: r.fromId,
          toId: r.toId,
          baseMinutes: r.baseMinutes,
          status: r.status,
          delayMinutes: r.delayMinutes,
        })),
        referenceNow
      );
    }
  }

  /**
   * Transport Failure Scenario:
   * Sets route DOWN or adds transit delay.
   * Releases affected RESERVED units (never IN_TRANSIT), triggers replanning,
   * calculates diff and verifies invariants.
   */
  static async handleTransportFailure(
    params: { fromId: string; toId: string; down?: boolean; delayMinutes?: number },
    actor: IActor
  ): Promise<ScenarioResult> {
    const { fromId, toId, down, delayMinutes } = params;

    const route = await Route.findOne({ fromId, toId });
    if (!route) {
      throw new NotFoundError(`Route from ${fromId} to ${toId} not found`);
    }

    const simState = await SimState.findOne({ key: 'current' }).lean();
    const referenceNow = simState?.virtualNow ? new Date(simState.virtualNow) : new Date();

    // Capture baseline of existing active reservations before disruption
    const preActiveReservations = await Reservation.find({ isActive: true }).lean();
    const inTransitBaseline = new Map(
      preActiveReservations.filter((r) => r.status === 'IN_TRANSIT').map((r) => [r.id, r.unitId])
    );

    // Apply Route Disruption
    const oldStatus = route.status;
    const oldDelay = route.delayMinutes;

    if (down !== undefined) {
      route.status = down ? 'DOWN' : 'UP';
    }
    if (delayMinutes !== undefined) {
      route.delayMinutes = delayMinutes;
    }
    await route.save();

    await AuditService.append({
      actor,
      action: 'SCENARIO_TRANSPORT_FAILURE',
      entity: 'Route',
      entityId: `${fromId}->${toId}`,
      diff: {
        old: { status: oldStatus, delayMinutes: oldDelay },
        new: { status: route.status, delayMinutes: route.delayMinutes },
      },
      timestamp: referenceNow,
    });

    // Find RESERVED transfers on this disrupted route (IN_TRANSIT is strictly preserved)
    const affectedReserved = await Reservation.find({
      fromHospitalId: fromId,
      toHospitalId: toId,
      status: 'RESERVED',
      isActive: true,
    });

    const removedList: Array<Record<string, unknown>> = [];

    for (const res of affectedReserved) {
      res.status = 'CANCELLED';
      res.isActive = false;
      await res.save();

      await Unit.updateOne(
        { id: res.unitId },
        { $set: { status: 'AVAILABLE', reservedForRequestId: null }, $inc: { version: 1 } }
      );

      await BloodRequest.updateOne({ id: res.requestId }, { $set: { status: 'OPEN' } });

      removedList.push({
        reservationId: res.id,
        unitId: res.unitId,
        requestId: res.requestId,
        reason: route.status === 'DOWN' ? 'Route is down' : `Excess delay (${route.delayMinutes}m)`,
      });

      await AuditService.append({
        actor,
        action: 'RESERVATION_DISRUPTED_BY_SCENARIO',
        entity: 'Reservation',
        entityId: res.id,
        diff: { unitId: res.unitId, requestId: res.requestId },
        timestamp: referenceNow,
      });
    }

    // Replan
    const newPlan = await this.replanOpenRequests(referenceNow);

    // Compute Diff: added, removed, rerouted, unchanged
    const unchangedList = preActiveReservations
      .filter((r) => r.status === 'IN_TRANSIT' || (r.fromHospitalId !== fromId || r.toHospitalId !== toId))
      .map((r) => ({ reservationId: r.id, unitId: r.unitId, requestId: r.requestId, status: r.status }));

    const reroutedList: Array<Record<string, unknown>> = [];
    const addedList: Array<Record<string, unknown>> = [];

    const newAssignments = (newPlan.assignments || []) as Array<{
      requestId: string;
      allocatedUnitIds: string[];
      options?: Array<{ unitId: string; fromHospitalId: string; toHospitalId: string }>;
    }>;

    for (const assignment of newAssignments) {
      const wasDisrupted = removedList.some((rem) => rem.requestId === assignment.requestId);
      for (const unitId of assignment.allocatedUnitIds) {
        const option = assignment.options?.find((o) => o.unitId === unitId);
        const item = {
          requestId: assignment.requestId,
          unitId,
          fromHospitalId: option?.fromHospitalId,
          toHospitalId: option?.toHospitalId,
        };
        if (wasDisrupted) {
          reroutedList.push(item);
        } else {
          addedList.push(item);
        }
      }
    }

    // Verify invariants, including IN_TRANSIT immutability
    const invariants = await InvariantService.verifyAll(inTransitBaseline);

    return {
      scenario: 'TRANSPORT_FAILURE',
      diff: {
        added: addedList,
        removed: removedList,
        rerouted: reroutedList,
        unchanged: unchangedList,
      },
      invariants,
      plan: newPlan,
      disclaimer: 'Planning support only - not a clinical decision. Synthetic data.',
    };
  }

  /**
   * Demand Spike Scenario:
   * Injects sudden batch of urgent requests and replans.
   */
  static async handleDemandSpike(
    params: {
      hospitalId: string;
      component: Component;
      group: BloodGroup;
      units: number;
      urgency: UrgencyLevel;
    },
    actor: IActor
  ): Promise<ScenarioResult> {
    const simState = await SimState.findOne({ key: 'current' }).lean();
    const referenceNow = simState?.virtualNow ? new Date(simState.virtualNow) : new Date();

    const inTransitBaseline = new Map(
      (await Reservation.find({ status: 'IN_TRANSIT' }).lean()).map((r) => [r.id, r.unitId])
    );

    const totalRequests = await BloodRequest.countDocuments();
    const requestId = `R-${1000 + totalRequests + 1}`;

    const newRequest = await BloodRequest.create({
      id: requestId,
      hospitalId: params.hospitalId,
      component: params.component,
      group: params.group,
      unitsNeeded: params.units,
      urgency: params.urgency,
      neededBy: new Date(referenceNow.getTime() + 4 * 60 * 60 * 1000), // 4h from now
      status: 'OPEN',
      clinicalContext: 'Scenario-injected demand spike emergency',
    });

    await AuditService.append({
      actor,
      action: 'SCENARIO_DEMAND_SPIKE',
      entity: 'BloodRequest',
      entityId: newRequest.id,
      diff: { unitsNeeded: params.units, urgency: params.urgency, hospitalId: params.hospitalId },
      timestamp: referenceNow,
    });

    const newPlan = await this.replanOpenRequests(referenceNow);
    const invariants = await InvariantService.verifyAll(inTransitBaseline);

    return {
      scenario: 'DEMAND_SPIKE',
      diff: {
        added: (newPlan.assignments || []) as Array<Record<string, unknown>>,
        removed: [],
        rerouted: [],
        unchanged: (await Reservation.find({ isActive: true }).lean()).map((r) => ({
          reservationId: r.id,
          unitId: r.unitId,
          status: r.status,
        })),
      },
      invariants,
      plan: newPlan,
      disclaimer: 'Planning support only - not a clinical decision. Synthetic data.',
    };
  }

  /**
   * Cancellation Scenario:
   * Releases any RESERVED allocations for the request, cancels request, and replans.
   */
  static async handleCancellation(
    params: { requestId: string },
    actor: IActor
  ): Promise<ScenarioResult> {
    const request = await BloodRequest.findOne({ id: params.requestId });
    if (!request) {
      throw new NotFoundError(`Request ${params.requestId} not found`);
    }

    const simState = await SimState.findOne({ key: 'current' }).lean();
    const referenceNow = simState?.virtualNow ? new Date(simState.virtualNow) : new Date();

    const inTransitBaseline = new Map(
      (await Reservation.find({ status: 'IN_TRANSIT' }).lean()).map((r) => [r.id, r.unitId])
    );

    request.status = 'CANCELLED';
    await request.save();

    // Release any RESERVED units tied to this request (IN_TRANSIT remains intact)
    const reservedToRelease = await Reservation.find({
      requestId: request.id,
      status: 'RESERVED',
      isActive: true,
    });

    const removedList: Array<Record<string, unknown>> = [];
    for (const res of reservedToRelease) {
      res.status = 'CANCELLED';
      res.isActive = false;
      await res.save();

      await Unit.updateOne(
        { id: res.unitId },
        { $set: { status: 'AVAILABLE', reservedForRequestId: null }, $inc: { version: 1 } }
      );

      removedList.push({ reservationId: res.id, unitId: res.unitId });
    }

    await AuditService.append({
      actor,
      action: 'SCENARIO_CANCELLATION',
      entity: 'BloodRequest',
      entityId: request.id,
      diff: { releasedReservations: removedList.length },
      timestamp: referenceNow,
    });

    const newPlan = await this.replanOpenRequests(referenceNow);
    const invariants = await InvariantService.verifyAll(inTransitBaseline);

    return {
      scenario: 'CANCELLATION',
      diff: {
        added: (newPlan.assignments || []) as Array<Record<string, unknown>>,
        removed: removedList,
        rerouted: [],
        unchanged: (await Reservation.find({ isActive: true }).lean()).map((r) => ({
          reservationId: r.id,
          unitId: r.unitId,
          status: r.status,
        })),
      },
      invariants,
      plan: newPlan,
      disclaimer: 'Planning support only - not a clinical decision. Synthetic data.',
    };
  }

  /**
   * New Stock Scenario:
   * Injects new available blood units into inventory and replans.
   */
  static async handleNewStock(
    params: { hospitalId: string; component: Component; group: BloodGroup; units: number },
    actor: IActor
  ): Promise<ScenarioResult> {
    const simState = await SimState.findOne({ key: 'current' }).lean();
    const referenceNow = simState?.virtualNow ? new Date(simState.virtualNow) : new Date();

    const inTransitBaseline = new Map(
      (await Reservation.find({ status: 'IN_TRANSIT' }).lean()).map((r) => [r.id, r.unitId])
    );

    const shelfLifeDays = RulesService.getShelfLifeDays(params.component);
    const expiresAt = new Date(referenceNow.getTime() + shelfLifeDays * 24 * 60 * 60 * 1000);

    const unitCount = await Unit.countDocuments();
    const newUnits: Array<Record<string, unknown>> = [];

    for (let i = 1; i <= params.units; i++) {
      const unitId = `U-${20000 + unitCount + i}`;
      const doc = await Unit.create({
        id: unitId,
        component: params.component,
        group: params.group,
        hospitalId: params.hospitalId,
        collectedAt: referenceNow,
        expiresAt,
        status: 'AVAILABLE',
        version: 0,
      });
      newUnits.push(doc.toObject() as unknown as Record<string, unknown>);
    }

    await AuditService.append({
      actor,
      action: 'SCENARIO_NEW_STOCK',
      entity: 'Unit',
      entityId: `${params.hospitalId}:${params.component}:${params.group}`,
      diff: { count: params.units, expiresAt: expiresAt.toISOString() },
      timestamp: referenceNow,
    });

    const newPlan = await this.replanOpenRequests(referenceNow);
    const invariants = await InvariantService.verifyAll(inTransitBaseline);

    return {
      scenario: 'NEW_STOCK',
      diff: {
        added: (newPlan.assignments || []) as Array<Record<string, unknown>>,
        removed: [],
        rerouted: [],
        unchanged: (await Reservation.find({ isActive: true }).lean()).map((r) => ({
          reservationId: r.id,
          unitId: r.unitId,
          status: r.status,
        })),
      },
      invariants,
      plan: newPlan,
      disclaimer: 'Planning support only - not a clinical decision. Synthetic data.',
    };
  }
}
