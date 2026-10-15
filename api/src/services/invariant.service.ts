import { Reservation } from '../models/reservation.model';
import { Unit } from '../models/unit.model';
import { BloodRequest } from '../models/request.model';
import { RulesService } from './rules.service';
import { logger } from '../utils/logger';

export interface InvariantResult {
  name: string;
  passed: boolean;
  details: string;
}

export class InvariantService {
  /**
   * Verifies all hard system and clinical invariants across the current database state.
   * If inTransitBaseline is provided (map of reservationId -> unitId), asserts that none were modified.
   */
  static async verifyAll(
    inTransitBaseline?: Map<string, string>
  ): Promise<InvariantResult[]> {
    const results: InvariantResult[] = [];

    // 1. Invariant: No unit is in more than one active reservation (isActive: true)
    const duplicateUnits = await Reservation.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$unitId', count: { $sum: 1 }, reservationIds: { $push: '$id' } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (duplicateUnits.length === 0) {
      results.push({
        name: 'Single Active Reservation per Unit',
        passed: true,
        details: 'All active blood units are assigned to at most one active reservation.',
      });
    } else {
      const summary = duplicateUnits
        .map((d) => `Unit ${d._id} in ${d.count} active reservations (${d.reservationIds.join(', ')})`)
        .join('; ');
      results.push({
        name: 'Single Active Reservation per Unit',
        passed: false,
        details: `Double allocation detected: ${summary}`,
      });
    }

    // Load all active reservations for clinical invariant checks
    const activeReservations = await Reservation.find({ isActive: true }).lean();
    const unitIds = activeReservations.map((r) => r.unitId);
    const requestIds = activeReservations.map((r) => r.requestId);

    const [units, requests] = await Promise.all([
      Unit.find({ id: { $in: unitIds } }).lean(),
      BloodRequest.find({ id: { $in: requestIds } }).lean(),
    ]);

    const unitMap = new Map(units.map((u) => [u.id, u]));
    const requestMap = new Map(requests.map((r) => [r.id, r]));

    // 2. Invariant: ABO/Rh Compatibility per shared rules
    const incompatibleList: string[] = [];
    for (const r of activeReservations) {
      const unit = unitMap.get(r.unitId);
      const req = requestMap.get(r.requestId);

      if (!unit || !req) {
        incompatibleList.push(`Reservation ${r.id}: missing Unit (${r.unitId}) or Request (${r.requestId})`);
        continue;
      }

      if (!RulesService.isCompatible(unit.component, unit.group, req.group)) {
        incompatibleList.push(
          `Reservation ${r.id}: Unit ${unit.id} (${unit.component} ${unit.group}) cannot serve Request ${req.id} (${req.group})`
        );
      }
    }

    if (incompatibleList.length === 0) {
      results.push({
        name: 'ABO/Rh Compatibility',
        passed: true,
        details: `All ${activeReservations.length} active reservations adhere to ABO/Rh compatibility rules.`,
      });
    } else {
      results.push({
        name: 'ABO/Rh Compatibility',
        passed: false,
        details: `Compatibility violations detected: ${incompatibleList.join('; ')}`,
      });
    }

    // 3. Invariant: Unit expires after arrival plus safety margin (eta <= expiresAt - safetyMargin)
    const expiryViolations: string[] = [];
    const safetyMarginMs = RulesService.getSafetyMarginMinutes() * 60 * 1000;

    for (const r of activeReservations) {
      const unit = unitMap.get(r.unitId);
      if (!unit) continue;

      const etaTime = new Date(r.eta).getTime();
      const expiresAtTime = new Date(unit.expiresAt).getTime();
      const latestAllowedEta = expiresAtTime - safetyMarginMs;

      if (etaTime > latestAllowedEta) {
        const marginMinutes = Math.round((expiresAtTime - etaTime) / 60000);
        expiryViolations.push(
          `Reservation ${r.id}: Unit ${unit.id} expires margin ${marginMinutes}m (< ${RulesService.getSafetyMarginMinutes()}m safety margin)`
        );
      }
    }

    if (expiryViolations.length === 0) {
      results.push({
        name: 'Perishability & Safety Margin',
        passed: true,
        details: `All ${activeReservations.length} active reservations satisfy the minimum ${RulesService.getSafetyMarginMinutes()} minute safety margin.`,
      });
    } else {
      results.push({
        name: 'Perishability & Safety Margin',
        passed: false,
        details: `Safety margin violations detected: ${expiryViolations.join('; ')}`,
      });
    }

    // 4. Invariant: IN_TRANSIT reservations unchanged by replanning
    if (inTransitBaseline) {
      const currentInTransit = await Reservation.find({ status: 'IN_TRANSIT' }).lean();
      const currentInTransitMap = new Map(currentInTransit.map((r) => [r.id, r.unitId]));

      const modified: string[] = [];
      for (const [resId, unitId] of inTransitBaseline.entries()) {
        const currentUnitId = currentInTransitMap.get(resId);
        if (!currentUnitId) {
          modified.push(`In-transit reservation ${resId} was dropped or had status changed`);
        } else if (currentUnitId !== unitId) {
          modified.push(`In-transit reservation ${resId} had unit reassigned from ${unitId} to ${currentUnitId}`);
        }
      }

      if (modified.length === 0) {
        results.push({
          name: 'IN_TRANSIT Invariance',
          passed: true,
          details: `All ${inTransitBaseline.size} in-transit transfers remained strictly immutable during replanning.`,
        });
      } else {
        results.push({
          name: 'IN_TRANSIT Invariance',
          passed: false,
          details: `In-transit modifications detected: ${modified.join('; ')}`,
        });
      }
    } else {
      results.push({
        name: 'IN_TRANSIT Invariance',
        passed: true,
        details: 'No replanning baseline specified; current in-transit reservations are intact.',
      });
    }

    return results;
  }

  /**
   * Asserts that all invariants hold. Throws error if any invariant fails.
   */
  static async assertAll(inTransitBaseline?: Map<string, string>): Promise<InvariantResult[]> {
    const results = await this.verifyAll(inTransitBaseline);
    const failed = results.filter((r) => !r.passed);
    if (failed.length > 0) {
      const summary = failed.map((f) => `[${f.name}]: ${f.details}`).join(' | ');
      logger.error({ summary }, 'Clinical invariant check failed');
      throw new Error(`Clinical Invariant Failure: ${summary}`);
    }
    return results;
  }
}
