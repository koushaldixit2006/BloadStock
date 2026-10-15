import {
  BloodRequest,
  InvariantCheck,
  PlanResult,
  ReplanDiff,
  Reservation,
  Route,
  SimEvent,
  Unit,
} from '../types/domain';
import { getHospitalName } from '../data/hospitals';
import { findRoute } from '../data/transportMatrix';
import { addMinutesToIso, getMinutesBetween, SAFETY_MARGIN_MINUTES } from './clock';
import { FeasibilityContext } from './feasibility';
import { checkInvariants } from './invariants';
import { planOptimized } from './planner';
import {
  CancellationParams,
  DemandSpikeParams,
  NewStockParams,
  TransportFailureParams,
} from './scenarios';

export interface ReplanState {
  units: Unit[];
  requests: BloodRequest[];
  reservations: Reservation[];
  routes: Route[];
  simTime: string;
}

export interface ReplanExecutionResult {
  nextState: ReplanState;
  plan: PlanResult;
  diff: ReplanDiff;
  invariants: InvariantCheck[];
  event: SimEvent;
  success: boolean;
  errorMessage?: string;
}

/**
 * Executes a scenario mutation, locks in-transit deliveries, releases affected reservations,
 * re-runs the global optimizer, computes transparent diffs, and strictly enforces invariants.
 */
export function executeReplan(
  currentState: ReplanState,
  scenario:
    | { type: 'TRANSPORT_FAILURE'; params: TransportFailureParams }
    | { type: 'DEMAND_SPIKE'; params: DemandSpikeParams }
    | { type: 'CANCELLATION'; params: CancellationParams }
    | { type: 'NEW_STOCK'; params: NewStockParams }
    | { type: 'MANUAL_REPLAN' }
): ReplanExecutionResult {
  const { simTime } = currentState;
  let units = currentState.units.map((u) => ({ ...u }));
  let requests = currentState.requests.map((r) => ({ ...r }));
  let reservations = currentState.reservations.map((r) => ({ ...r }));
  let routes = currentState.routes.map((rt) => ({ ...rt }));

  // 1. Lock in-transit reservation IDs
  const lockedInTransitIds = reservations
    .filter((r) => r.status === 'IN_TRANSIT')
    .map((r) => r.id);

  let simEvent: SimEvent;
  const eventId = `EVT-${Date.now().toString().slice(-6)}`;

  // 2. Apply Scenario Mutations
  if (scenario.type === 'TRANSPORT_FAILURE') {
    const { fromId, toId, action, delayMinutes = 0 } = scenario.params;
    routes = routes.map((rt) => {
      if ((rt.fromId === fromId && rt.toId === toId) || (rt.fromId === toId && rt.toId === fromId)) {
        if (action === 'SET_DOWN') {
          return { ...rt, status: 'DOWN' };
        } else {
          return { ...rt, delayMinutes: rt.delayMinutes + delayMinutes };
        }
      }
      return rt;
    });

    const routeStr = `${getHospitalName(fromId)} ↔ ${getHospitalName(toId)}`;
    const desc =
      action === 'SET_DOWN'
        ? `Route failure: ${routeStr} is now DOWN due to highway obstruction.`
        : `Transport delay: +${delayMinutes}m added to ${routeStr} route.`;

    simEvent = {
      id: eventId,
      ts: simTime,
      type: 'TRANSPORT_FAILURE',
      description: desc,
      payload: { ...scenario.params },
    };

    // Release any RESERVED (not in-transit) units on this affected route if it is now down or invalid
    reservations = reservations.map((rsv) => {
      if (rsv.status !== 'RESERVED') return rsv;

      const isAffectedRoute =
        (rsv.fromHospitalId === fromId && rsv.toHospitalId === toId) ||
        (rsv.fromHospitalId === toId && rsv.toHospitalId === fromId);

      if (isAffectedRoute) {
        const rt = findRoute(routes, rsv.fromHospitalId, rsv.toHospitalId);
        if (!rt || rt.status === 'DOWN') {
          // Release reservation
          units = units.map((u) =>
            u.id === rsv.unitId ? { ...u, status: 'AVAILABLE', reservedForRequestId: undefined } : u
          );
          return { ...rsv, status: 'CANCELLED' };
        } else {
          // Recalculate ETA with new delay
          const newEta = addMinutesToIso(simTime, 15 + rt.baseMinutes + rt.delayMinutes);
          const unit = units.find((u) => u.id === rsv.unitId);
          const req = requests.find((rq) => rq.id === rsv.requestId);

          if (
            unit &&
            req &&
            (getMinutesBetween(newEta, unit.expiresAt) < SAFETY_MARGIN_MINUTES ||
              new Date(newEta) > new Date(req.neededBy))
          ) {
            // Cannot make it anymore -> cancel and release
            units = units.map((u) =>
              u.id === rsv.unitId ? { ...u, status: 'AVAILABLE', reservedForRequestId: undefined } : u
            );
            return { ...rsv, status: 'CANCELLED' };
          }
          return { ...rsv, eta: newEta, transitMinutes: rt.baseMinutes + rt.delayMinutes };
        }
      }
      return rsv;
    });
  } else if (scenario.type === 'DEMAND_SPIKE') {
    const { hospitalId, component, group, unitsNeeded, urgency, minutesNeededIn, clinicalContext } =
      scenario.params;
    const newReqId = `R-${Math.floor(1000 + Math.random() * 9000)}`;
    const neededBy = addMinutesToIso(simTime, minutesNeededIn);

    const newRequest: BloodRequest = {
      id: newReqId,
      hospitalId,
      component,
      group,
      unitsNeeded,
      neededBy,
      urgency,
      status: 'OPEN',
      createdAt: simTime,
      clinicalContext: clinicalContext || `Demand surge: urgent emergency intake at ${getHospitalName(hospitalId)}.`,
    };

    requests = [newRequest, ...requests];

    simEvent = {
      id: eventId,
      ts: simTime,
      type: 'DEMAND_SPIKE',
      description: `Emergency demand spike: ${unitsNeeded}x ${group} ${component} (${urgency}) requested at ${getHospitalName(hospitalId)}.`,
      payload: { ...scenario.params, requestId: newReqId },
    };
  } else if (scenario.type === 'CANCELLATION') {
    const { requestId } = scenario.params;
    requests = requests.map((rq) =>
      rq.id === requestId ? { ...rq, status: 'CANCELLED' } : rq
    );

    // Release all RESERVED units for this request
    reservations = reservations.map((rsv) => {
      if (rsv.requestId === requestId && rsv.status === 'RESERVED') {
        units = units.map((u) =>
          u.id === rsv.unitId ? { ...u, status: 'AVAILABLE', reservedForRequestId: undefined } : u
        );
        return { ...rsv, status: 'CANCELLED' };
      }
      return rsv;
    });

    simEvent = {
      id: eventId,
      ts: simTime,
      type: 'REQUEST_CANCELLED',
      description: `Request ${requestId} cancelled. Associated reserved units immediately released to network.`,
      payload: { requestId },
    };
  } else if (scenario.type === 'NEW_STOCK') {
    const { hospitalId, component, group, count, shelfLifeHours } = scenario.params;
    const newUnits: Unit[] = [];
    const baseNum = Math.floor(20000 + Math.random() * 9000);

    for (let i = 0; i < count; i++) {
      const uId = `U-${baseNum + i}`;
      newUnits.push({
        id: uId,
        component,
        group,
        hospitalId,
        collectedAt: simTime,
        expiresAt: addMinutesToIso(simTime, shelfLifeHours * 60),
        status: 'AVAILABLE',
      });
    }

    units = [...newUnits, ...units];

    simEvent = {
      id: eventId,
      ts: simTime,
      type: 'NEW_STOCK',
      description: `New stock arrival: ${count} unit(s) of ${group} ${component} received at ${getHospitalName(hospitalId)}.`,
      payload: { ...scenario.params },
    };
  } else {
    simEvent = {
      id: eventId,
      ts: simTime,
      type: 'REPLAN_EXECUTED',
      description: 'Manual global re-optimization triggered.',
    };
  }

  // 3. Snapshot prior active allocations for diff calculation
  const priorAllocations = new Map<string, { unitId: string; from: string; to: string }>();
  for (const rsv of currentState.reservations) {
    if (rsv.status === 'RESERVED' || rsv.status === 'IN_TRANSIT') {
      priorAllocations.set(rsv.requestId, {
        unitId: rsv.unitId,
        from: rsv.fromHospitalId,
        to: rsv.toHospitalId,
      });
    }
  }

  // 4. Run Global Optimizer with updated state
  const ctx: FeasibilityContext = { now: simTime, routes };
  const optimizedPlan = planOptimized(units, requests, ctx);

  // 5. Compute Diff
  const diff: ReplanDiff = {
    added: [],
    removed: [],
    rerouted: [],
    unchanged: [],
  };

  const newAllocations = new Map<string, { unitId: string; from: string; to: string }>();
  for (const assignment of optimizedPlan.assignments) {
    for (const opt of assignment.options) {
      newAllocations.set(`${assignment.requestId}-${opt.unitId}`, {
        unitId: opt.unitId,
        from: opt.fromHospitalId,
        to: opt.toHospitalId,
      });

      const prior = priorAllocations.get(assignment.requestId);
      if (!prior) {
        diff.added.push({
          unitId: opt.unitId,
          requestId: assignment.requestId,
          from: opt.fromHospitalId,
          to: opt.toHospitalId,
        });
      } else if (prior.unitId === opt.unitId && prior.from === opt.fromHospitalId) {
        diff.unchanged.push({
          unitId: opt.unitId,
          requestId: assignment.requestId,
        });
      } else if (prior.from !== opt.fromHospitalId) {
        diff.rerouted.push({
          unitId: opt.unitId,
          requestId: assignment.requestId,
          oldFrom: prior.from,
          newFrom: opt.fromHospitalId,
        });
      }
    }
  }

  for (const [reqId, prior] of priorAllocations.entries()) {
    const isStillAllocated = optimizedPlan.assignments.some(
      (a) => a.requestId === reqId && a.allocatedUnitIds.includes(prior.unitId)
    );
    if (!isStillAllocated) {
      diff.removed.push({
        unitId: prior.unitId,
        requestId: reqId,
        reason: 'Superseded or released by replan optimization',
      });
    }
  }

  // 6. Invariant Validation
  const invariants = checkInvariants({
    reservations,
    units,
    requests,
    lockedInTransitReservationIds: lockedInTransitIds,
  });

  const allPassed = invariants.every((i) => i.passed);

  return {
    nextState: {
      units,
      requests,
      reservations,
      routes,
      simTime,
    },
    plan: optimizedPlan,
    diff,
    invariants,
    event: simEvent,
    success: allPassed,
    errorMessage: allPassed ? undefined : 'Invariant verification failed during replanning update.',
  };
}
