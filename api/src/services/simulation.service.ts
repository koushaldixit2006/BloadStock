import { SimState } from '../models/simState.model';
import { Unit } from '../models/unit.model';
import { Reservation } from '../models/reservation.model';
import { AuditService } from './audit.service';
import { IActor } from '../models/auditLog.model';
import { runSeed, INITIAL_SIM_TIME } from './seed.service';
import { logger } from '../utils/logger';

export class SimulationService {
  /**
   * Retrieves the current virtual simulation clock.
   */
  static async getClock(): Promise<{
    simNow: Date;
    isPaused: boolean;
    speedMultiplier: number;
    activeScenario?: string;
  }> {
    let state = await SimState.findOne({ key: 'current' });
    if (!state) {
      state = await SimState.create({
        key: 'current',
        virtualNow: new Date(INITIAL_SIM_TIME),
        isPaused: false,
        speedMultiplier: 1,
      });
    }

    const clockResult: {
      simNow: Date;
      isPaused: boolean;
      speedMultiplier: number;
      activeScenario?: string;
    } = {
      simNow: state.virtualNow,
      isPaused: state.isPaused,
      speedMultiplier: state.speedMultiplier,
    };

    if (state.activeScenario) {
      clockResult.activeScenario = state.activeScenario;
    }

    return clockResult;
  }

  /**
   * Advances the virtual simulation clock by a given number of hours.
   * Runs the automated perishability expiry job marking past-due units and reservations as EXPIRED.
   */
  static async advance(
    hours: number,
    actor: IActor
  ): Promise<{
    simNow: Date;
    advancedHours: number;
    expiredUnitsCount: number;
    expiredUnitIds: string[];
    expiredReservationsCount: number;
  }> {
    let state = await SimState.findOne({ key: 'current' });
    if (!state) {
      state = await SimState.create({
        key: 'current',
        virtualNow: new Date(INITIAL_SIM_TIME),
        isPaused: false,
        speedMultiplier: 1,
      });
    }

    const previousTime = new Date(state.virtualNow);
    const newVirtualNow = new Date(previousTime.getTime() + hours * 3600 * 1000);
    state.virtualNow = newVirtualNow;
    await state.save();

    // Automated Expiry Job: Mark units past expiresAt as EXPIRED
    const newlyExpiredUnits = await Unit.find({
      status: 'AVAILABLE',
      expiresAt: { $lte: newVirtualNow },
    });

    const expiredUnitIds: string[] = [];
    for (const unit of newlyExpiredUnits) {
      unit.status = 'EXPIRED';
      await unit.save();
      expiredUnitIds.push(unit.id);

      await AuditService.append({
        actor: { id: 'SYSTEM', role: 'SYSTEM' },
        action: 'UNIT_EXPIRED_BY_CLOCK_ADVANCE',
        entity: 'Unit',
        entityId: unit.id,
        diff: { expiresAt: unit.expiresAt.toISOString(), simNow: newVirtualNow.toISOString() },
        timestamp: newVirtualNow,
      });
    }

    // Mark reservations as EXPIRED if their unit expired or ETA has passed without delivery
    const expiredReservations = await Reservation.find({
      isActive: true,
      eta: { $lt: newVirtualNow },
      status: 'RESERVED',
    });

    for (const res of expiredReservations) {
      res.status = 'EXPIRED';
      res.isActive = false;
      await res.save();

      await AuditService.append({
        actor: { id: 'SYSTEM', role: 'SYSTEM' },
        action: 'RESERVATION_EXPIRED_BY_CLOCK_ADVANCE',
        entity: 'Reservation',
        entityId: res.id,
        diff: { unitId: res.unitId, requestId: res.requestId },
        timestamp: newVirtualNow,
      });
    }

    await AuditService.append({
      actor,
      action: 'SIMULATION_CLOCK_ADVANCED',
      entity: 'SimState',
      entityId: 'current',
      diff: {
        from: previousTime.toISOString(),
        to: newVirtualNow.toISOString(),
        advancedHours: hours,
        expiredUnits: expiredUnitIds.length,
        expiredReservations: expiredReservations.length,
      },
      timestamp: newVirtualNow,
    });

    logger.info(
      { simNow: newVirtualNow.toISOString(), expiredUnits: expiredUnitIds.length },
      'Simulation clock advanced'
    );

    return {
      simNow: newVirtualNow,
      advancedHours: hours,
      expiredUnitsCount: expiredUnitIds.length,
      expiredUnitIds,
      expiredReservationsCount: expiredReservations.length,
    };
  }

  /**
   * Resets the entire simulation to the initial deterministic seed state.
   */
  static async reset(actor: IActor) {
    const seedResult = await runSeed();

    await AuditService.append({
      actor,
      action: 'SIMULATION_RESET_TO_GENESIS',
      entity: 'SimState',
      entityId: 'current',
      diff: { initialSimTime: INITIAL_SIM_TIME, units: seedResult.units },
      timestamp: new Date(INITIAL_SIM_TIME),
    });

    logger.info('Simulation reset to deterministic baseline seed');
    return {
      status: 'SUCCESS',
      message: 'Simulation database reseeded to deterministic baseline',
      counts: seedResult,
    };
  }
}
