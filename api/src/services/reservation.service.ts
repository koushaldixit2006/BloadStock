import mongoose, { ClientSession } from 'mongoose';
import { Reservation, IReservation } from '../models/reservation.model';
import { Unit } from '../models/unit.model';
import { BloodRequest } from '../models/request.model';
import { Route } from '../models/route.model';
import { Plan } from '../models/plan.model';
import { SimState } from '../models/simState.model';
import { RulesService } from './rules.service';
import { AuditService } from './audit.service';
import { InvariantService } from './invariant.service';
import { IActor } from '../models/auditLog.model';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableEntityError,
} from '../errors/appError';
import { logger } from '../utils/logger';

export interface CommitParams {
  planId: string;
  assignmentIds?: string[];
  idempotencyKey?: string;
  actor: IActor;
}

export class ReservationService {
  /**
   * Executes an atomic commit of a planning recommendation.
   * Features zero-trust server-side re-validation, optimistic concurrency checks,
   * database-level double-booking protection, transient error retries, and cryptographic audit logging.
   */
  static async commit(params: CommitParams): Promise<{
    status: string;
    planId: string;
    reservations: IReservation[];
    isReplay: boolean;
    disclaimer: string;
  }> {
    const { planId, idempotencyKey, actor } = params;

    // 1. Idempotency Check
    if (idempotencyKey) {
      const existingReservations = await Reservation.find({ idempotencyKey }).lean();
      if (existingReservations.length > 0) {
        logger.info({ idempotencyKey }, 'Idempotent reservation replay detected');
        return {
          status: 'SUCCESS',
          planId,
          reservations: existingReservations as unknown as IReservation[],
          isReplay: true,
          disclaimer: 'Planning support only - not a clinical decision. Synthetic data.',
        };
      }
    }

    // 2. Load and validate Plan
    const plan = await Plan.findOne({ planId }).lean();
    if (!plan) {
      throw new NotFoundError(`Plan ${planId} not found`);
    }

    if (new Date(plan.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestError(`Plan ${planId} has expired; generate fresh recommendations`);
    }

    // 3. Extract assignments to commit
    let assignments = plan.assignments as Array<{
      requestId: string;
      allocatedUnitIds: string[];
      options?: Array<{
        unitId: string;
        eta: string;
        transitMinutes: number;
        fromHospitalId: string;
        toHospitalId: string;
      }>;
    }>;

    if (params.assignmentIds && params.assignmentIds.length > 0) {
      assignments = assignments.filter((a) => params.assignmentIds!.includes(a.requestId));
    }

    const allAllocatedUnits = assignments.flatMap((a) => a.allocatedUnitIds || []);
    if (allAllocatedUnits.length === 0) {
      throw new BadRequestError('The specified plan contains no unit allocations to reserve');
    }

    // 4. Fetch reference time from simulation clock or system clock
    const simState = await SimState.findOne({ key: 'current' }).lean();
    const referenceNow = simState?.virtualNow ? new Date(simState.virtualNow) : new Date();

    // 5. Zero-Trust Server-Side Re-validation
    const requestIds = assignments.map((a) => a.requestId);
    const [requests, units, routes] = await Promise.all([
      BloodRequest.find({ id: { $in: requestIds } }).lean(),
      Unit.find({ id: { $in: allAllocatedUnits } }).lean(),
      Route.find().lean(),
    ]);

    const requestMap = new Map(requests.map((r) => [r.id, r]));
    const unitMap = new Map(units.map((u) => [u.id, u]));

    // Route matrix lookup: `${fromId}->${toId}`
    const routeMap = new Map(routes.map((r) => [`${r.fromId}->${r.toId}`, r]));

    for (const assignment of assignments) {
      const request = requestMap.get(assignment.requestId);
      if (!request) {
        throw new NotFoundError(`Request ${assignment.requestId} does not exist`);
      }

      // COORDINATOR Role Scoping: Can only commit reservations destined for their assigned hospital
      if (actor.role === 'COORDINATOR' && actor.hospitalId && request.hospitalId !== actor.hospitalId) {
        throw new ForbiddenError(
          `Coordinator from hospital ${actor.hospitalId} cannot commit reservations for ${request.hospitalId}`
        );
      }

      if (request.status === 'CANCELLED') {
        throw new BadRequestError(`Cannot commit units for cancelled request ${request.id}`);
      }

      for (const unitId of assignment.allocatedUnitIds) {
        const unit = unitMap.get(unitId);
        if (!unit) {
          throw new NotFoundError(`Allocated unit ${unitId} not found in inventory`);
        }

        if (unit.status !== 'AVAILABLE') {
          throw new ConflictError(`Unit ${unitId} is not available (current status: ${unit.status})`);
        }

        const routeKey = `${unit.hospitalId}->${request.hospitalId}`;
        const route = routeMap.get(routeKey);

        if (!route) {
          throw new UnprocessableEntityError(`No transport route exists from ${unit.hospitalId} to ${request.hospitalId}`);
        }

        // Re-evaluate candidate clinical viability independently
        const candidateEval = RulesService.evaluateCandidate(unit, request, routes, referenceNow);
        if (!candidateEval.feasible) {
          throw new UnprocessableEntityError(
            `Unit ${unitId} failed independent clinical validation: ${candidateEval.blockingReasons.join(', ')}`
          );
        }
      }
    }

    // 6. Transactional Execution with Transient Error Retry Loop (up to 3 attempts)
    const committedReservations: IReservation[] = [];
    const maxRetries = 3;
    let attempt = 0;

    while (true) {
      attempt++;
      const session: ClientSession = await mongoose.startSession();
      session.startTransaction();

      try {
        committedReservations.length = 0;

        for (const assignment of assignments) {
          const request = requestMap.get(assignment.requestId)!;

          for (const unitId of assignment.allocatedUnitIds) {
            const unit = unitMap.get(unitId)!;

            // ATOMIC CLAIM: Update unit status only if still AVAILABLE.
            // Increments version for optimistic concurrency tracking.
            const claimedUnit = await Unit.findOneAndUpdate(
              { id: unit.id, status: 'AVAILABLE' },
              { $set: { status: 'RESERVED', reservedForRequestId: request.id }, $inc: { version: 1 } },
              { new: true, session }
            );

            if (!claimedUnit) {
              throw new ConflictError(`Unit ${unit.id} is no longer available; already claimed by another request`);
            }

            // Calculate timing
            const routeKey = `${unit.hospitalId}->${request.hospitalId}`;
            const route = routeMap.get(routeKey)!;
            const transitMinutes =
              unit.hospitalId === request.hospitalId
                ? 5
                : route.baseMinutes + (route.delayMinutes || 0);

            const dispatchAt = new Date(
              referenceNow.getTime() + RulesService.getDispatchBufferMinutes() * 60 * 1000
            );
            const eta = new Date(dispatchAt.getTime() + transitMinutes * 60 * 1000);

            const reservationCount = await Reservation.countDocuments({}, { session });
            const reservationId = `RSV-${1000 + reservationCount + committedReservations.length + 1}`;

            const createdReservations = await Reservation.create(
              [
                {
                  id: reservationId,
                  unitId: unit.id,
                  requestId: request.id,
                  fromHospitalId: unit.hospitalId,
                  toHospitalId: request.hospitalId,
                  dispatchAt,
                  eta,
                  transitMinutes,
                  status: 'RESERVED',
                  isActive: true,
                  idempotencyKey: idempotencyKey || undefined,
                },
              ],
              { session }
            );

            const newReservation = createdReservations[0]!;
            committedReservations.push(newReservation);

            // Audit event for each reservation
            await AuditService.append(
              {
                actor,
                action: 'RESERVATION_COMMITTED',
                entity: 'Reservation',
                entityId: newReservation.id,
                diff: {
                  unitId: unit.id,
                  requestId: request.id,
                  fromHospitalId: unit.hospitalId,
                  toHospitalId: request.hospitalId,
                  eta: eta.toISOString(),
                },
                timestamp: referenceNow,
              },
              session
            );
          }

          // Update Request Status based on cumulative active reservations
          const totalActiveForReq = await Reservation.countDocuments(
            { requestId: request.id, isActive: true },
            { session }
          );

          const newReqStatus =
            totalActiveForReq >= request.unitsNeeded ? 'PLANNED' : 'PARTIAL';

          await BloodRequest.updateOne(
            { id: request.id },
            { $set: { status: newReqStatus } },
            { session }
          );

          await AuditService.append(
            {
              actor,
              action: 'REQUEST_STATUS_UPDATED',
              entity: 'BloodRequest',
              entityId: request.id,
              diff: { status: newReqStatus, activeReservations: totalActiveForReq },
              timestamp: referenceNow,
            },
            session
          );
        }

        await session.commitTransaction();
        break; // Successfully committed transaction!
      } catch (err: any) {
        await session.abortTransaction();

        if (err instanceof ConflictError || err instanceof BadRequestError || err instanceof NotFoundError || err instanceof ForbiddenError || err instanceof UnprocessableEntityError) {
          throw err;
        }

        // Check if MongoDB error is a duplicate key on active reservation index or idempotency (code 11000)
        if (err.code === 11000) {
          throw new ConflictError('A concurrent transaction has already reserved this unit (duplicate key collision)');
        }

        const isTransient =
          err.hasErrorLabel?.('TransientTransactionError') ||
          err.message?.includes('WriteConflict') ||
          err.code === 112;

        if (isTransient) {
          if (attempt < maxRetries) {
            logger.warn({ attempt, err: err.message }, 'Transient transaction error encountered; retrying commit');
            await new Promise((resolve) => setTimeout(resolve, 50 * Math.pow(2, attempt)));
            continue;
          }
          throw new ConflictError('Unit is no longer available due to concurrent reservation contention');
        }

        throw err;
      } finally {
        await session.endSession();
      }
    }

    // 7. Post-Commit Hard Invariant Watchdog
    await InvariantService.assertAll();

    return {
      status: 'SUCCESS',
      planId,
      reservations: committedReservations,
      isReplay: false,
      disclaimer: 'Planning support only - not a clinical decision. Synthetic data.',
    };
  }

  /**
   * Dispatches a reservation (RESERVED -> IN_TRANSIT).
   * Note: isActive remains true; the unit is in transit.
   */
  static async dispatch(reservationId: string, actor: IActor): Promise<IReservation> {
    const reservation = await Reservation.findOne({ id: reservationId });
    if (!reservation) {
      throw new NotFoundError(`Reservation ${reservationId} not found`);
    }

    if (actor.role === 'COORDINATOR' && actor.hospitalId) {
      if (
        reservation.fromHospitalId !== actor.hospitalId &&
        reservation.toHospitalId !== actor.hospitalId
      ) {
        throw new ForbiddenError('Coordinator can only dispatch transfers involving their hospital');
      }
    }

    if (reservation.status !== 'RESERVED') {
      throw new BadRequestError(`Cannot dispatch reservation in status ${reservation.status}`);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      reservation.status = 'IN_TRANSIT';
      reservation.isActive = true;
      await reservation.save({ session });

      await Unit.updateOne(
        { id: reservation.unitId },
        { $set: { status: 'IN_TRANSIT' } },
        { session }
      );

      await AuditService.append(
        {
          actor,
          action: 'RESERVATION_DISPATCHED',
          entity: 'Reservation',
          entityId: reservation.id,
          diff: { status: 'IN_TRANSIT', unitId: reservation.unitId },
        },
        session
      );

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }

    await InvariantService.assertAll();
    return reservation;
  }

  /**
   * Delivers a reservation (IN_TRANSIT -> DELIVERED).
   * Note: isActive transitions to false. Unit transitions to USED.
   */
  static async deliver(reservationId: string, actor: IActor): Promise<IReservation> {
    const reservation = await Reservation.findOne({ id: reservationId });
    if (!reservation) {
      throw new NotFoundError(`Reservation ${reservationId} not found`);
    }

    if (actor.role === 'COORDINATOR' && actor.hospitalId) {
      if (reservation.toHospitalId !== actor.hospitalId) {
        throw new ForbiddenError('Only the receiving hospital coordinator can confirm delivery');
      }
    }

    if (reservation.status !== 'IN_TRANSIT') {
      throw new BadRequestError(`Cannot deliver reservation in status ${reservation.status}; must be IN_TRANSIT`);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      reservation.status = 'DELIVERED';
      reservation.isActive = false;
      await reservation.save({ session });

      await Unit.updateOne(
        { id: reservation.unitId },
        { $set: { status: 'USED' } },
        { session }
      );

      // Check request completion
      const deliveredCount = await Reservation.countDocuments(
        { requestId: reservation.requestId, status: 'DELIVERED' },
        { session }
      );
      const reqDoc = await BloodRequest.findOne({ id: reservation.requestId }, null, { session });
      if (reqDoc && deliveredCount >= reqDoc.unitsNeeded) {
        reqDoc.status = 'PLANNED';
        await reqDoc.save({ session });
      }

      await AuditService.append(
        {
          actor,
          action: 'RESERVATION_DELIVERED',
          entity: 'Reservation',
          entityId: reservation.id,
          diff: { status: 'DELIVERED', unitId: reservation.unitId },
        },
        session
      );

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }

    await InvariantService.assertAll();
    return reservation;
  }

  /**
   * Cancels a reservation, freeing the unit back to AVAILABLE.
   */
  static async cancel(reservationId: string, actor: IActor): Promise<IReservation> {
    const reservation = await Reservation.findOne({ id: reservationId });
    if (!reservation) {
      throw new NotFoundError(`Reservation ${reservationId} not found`);
    }

    if (actor.role === 'COORDINATOR' && actor.hospitalId) {
      if (
        reservation.fromHospitalId !== actor.hospitalId &&
        reservation.toHospitalId !== actor.hospitalId
      ) {
        throw new ForbiddenError('Coordinator can only cancel transfers involving their hospital');
      }
    }

    if (reservation.status === 'DELIVERED' || reservation.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot cancel reservation in status ${reservation.status}`);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      reservation.status = 'CANCELLED';
      reservation.isActive = false;
      await reservation.save({ session });

      await Unit.updateOne(
        { id: reservation.unitId },
        { $set: { status: 'AVAILABLE', reservedForRequestId: null }, $inc: { version: 1 } },
        { session }
      );

      // Recalculate request status
      const activeCount = await Reservation.countDocuments(
        { requestId: reservation.requestId, isActive: true },
        { session }
      );
      const reqDoc = await BloodRequest.findOne({ id: reservation.requestId }, null, { session });
      if (reqDoc && reqDoc.status !== 'CANCELLED') {
        reqDoc.status = activeCount === 0 ? 'OPEN' : 'PARTIAL';
        await reqDoc.save({ session });
      }

      await AuditService.append(
        {
          actor,
          action: 'RESERVATION_CANCELLED',
          entity: 'Reservation',
          entityId: reservation.id,
          diff: { status: 'CANCELLED', unitId: reservation.unitId },
        },
        session
      );

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }

    await InvariantService.assertAll();
    return reservation;
  }

  /**
   * Lists reservations with role scoping and status filters.
   */
  static async list(
    query: { status?: string; hospitalId?: string; requestId?: string },
    actor: IActor
  ) {
    const filter: Record<string, unknown> = {};

    if (query.status) filter.status = query.status;
    if (query.requestId) filter.requestId = query.requestId;

    if (actor.role === 'COORDINATOR' && actor.hospitalId) {
      filter.$or = [{ fromHospitalId: actor.hospitalId }, { toHospitalId: actor.hospitalId }];
    } else if (query.hospitalId) {
      filter.$or = [{ fromHospitalId: query.hospitalId }, { toHospitalId: query.hospitalId }];
    }

    return Reservation.find(filter).sort({ createdAt: -1 }).lean();
  }

  /**
   * Retrieves reservation details and its associated audit trail.
   */
  static async getById(reservationId: string, actor: IActor) {
    const reservation = await Reservation.findOne({ id: reservationId }).lean();
    if (!reservation) {
      throw new NotFoundError(`Reservation ${reservationId} not found`);
    }

    if (actor.role === 'COORDINATOR' && actor.hospitalId) {
      if (
        reservation.fromHospitalId !== actor.hospitalId &&
        reservation.toHospitalId !== actor.hospitalId
      ) {
        throw new ForbiddenError('Coordinator can only view transfers involving their hospital');
      }
    }

    const auditTrail = await AuditService.list({
      entity: 'Reservation',
      entityId: reservation.id,
      limit: 50,
    });

    return {
      ...reservation,
      auditTrail: auditTrail.items,
    };
  }
}
