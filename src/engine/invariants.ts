import { BloodRequest, InvariantCheck, Reservation, Unit } from '../types/domain';
import { getMinutesBetween, SAFETY_MARGIN_MINUTES } from './clock';
import { isCompatible } from './compatibility';

export interface InvariantContext {
  reservations: Reservation[];
  units: Unit[];
  requests: BloodRequest[];
  lockedInTransitReservationIds?: string[];
}

/**
 * Validates hard non-negotiable invariants across all active reservations.
 * If any invariant fails, operations or replanning updates are blocked.
 */
export function checkInvariants(ctx: InvariantContext): InvariantCheck[] {
  const { reservations, units, requests, lockedInTransitReservationIds } = ctx;

  const unitMap = new Map(units.map((u) => [u.id, u]));
  const requestMap = new Map(requests.map((r) => [r.id, r]));

  // Active reservations are RESERVED or IN_TRANSIT
  const activeReservations = reservations.filter(
    (r) => r.status === 'RESERVED' || r.status === 'IN_TRANSIT'
  );

  // 1. Invariant 1: No unit appears in more than one active reservation
  const unitReservationCounts = new Map<string, number>();
  let duplicateUnitId: string | null = null;

  for (const rsv of activeReservations) {
    const current = (unitReservationCounts.get(rsv.unitId) || 0) + 1;
    unitReservationCounts.set(rsv.unitId, current);
    if (current > 1) {
      duplicateUnitId = rsv.unitId;
      break;
    }
  }

  const invariant1: InvariantCheck = {
    name: 'Single Active Allocation',
    passed: duplicateUnitId === null,
    details: duplicateUnitId
      ? `Violation: Unit ${duplicateUnitId} is reserved in multiple active reservations.`
      : `All ${activeReservations.length} active allocations have strictly unique unit assignments.`,
    count: activeReservations.length,
  };

  // 2. Invariant 2: Every active reservation is compatible
  let incompatibleReservation: Reservation | null = null;
  let incompatibilityDetail = '';

  for (const rsv of activeReservations) {
    const unit = unitMap.get(rsv.unitId);
    const req = requestMap.get(rsv.requestId);

    if (!unit || !req) {
      incompatibleReservation = rsv;
      incompatibilityDetail = `Unit or request record missing for reservation ${rsv.id}.`;
      break;
    }

    if (unit.component !== req.component || !isCompatible(req.component, unit.group, req.group)) {
      incompatibleReservation = rsv;
      incompatibilityDetail = `Unit ${unit.id} (${unit.group} ${unit.component}) is incompatible with request ${req.id} (${req.group} ${req.component}).`;
      break;
    }
  }

  const invariant2: InvariantCheck = {
    name: 'Blood Group Compatibility',
    passed: incompatibleReservation === null,
    details: incompatibleReservation
      ? `Violation: ${incompatibilityDetail}`
      : `All ${activeReservations.length} active reservations adhere strictly to synthetic ABO/Rh compatibility.`,
  };

  // 3. Invariant 3: ETA before unit expiry with safety margin
  let expiredReservation: Reservation | null = null;
  let expiryViolationDetail = '';

  for (const rsv of activeReservations) {
    const unit = unitMap.get(rsv.unitId);
    if (!unit) continue;

    const marginMinutes = getMinutesBetween(rsv.eta, unit.expiresAt);
    if (marginMinutes < SAFETY_MARGIN_MINUTES) {
      expiredReservation = rsv;
      expiryViolationDetail = `Unit ${unit.id} expires at ${unit.expiresAt}, but ETA is ${rsv.eta} (margin: ${marginMinutes}m, required: >=${SAFETY_MARGIN_MINUTES}m).`;
      break;
    }
  }

  const invariant3: InvariantCheck = {
    name: 'Expiry Safety Margin Threshold',
    passed: expiredReservation === null,
    details: expiredReservation
      ? `Violation: ${expiryViolationDetail}`
      : `Every reservation arrives with at least ${SAFETY_MARGIN_MINUTES} min margin before expiry.`,
  };

  // 4. Invariant 4: IN_TRANSIT reservations were not changed by replanning
  let inTransitViolation: string | null = null;
  if (lockedInTransitReservationIds && lockedInTransitReservationIds.length > 0) {
    for (const lockedId of lockedInTransitReservationIds) {
      const match = reservations.find((r) => r.id === lockedId);
      if (!match || match.status !== 'IN_TRANSIT') {
        inTransitViolation = `In-transit reservation ${lockedId} was altered or cancelled.`;
        break;
      }
    }
  }

  const inTransitCount = reservations.filter((r) => r.status === 'IN_TRANSIT').length;
  const invariant4: InvariantCheck = {
    name: 'In-Transit Immutability',
    passed: inTransitViolation === null,
    details: inTransitViolation
      ? `Violation: ${inTransitViolation}`
      : `${inTransitCount} in-transit deliveries locked and protected from disruption.`,
    count: inTransitCount,
  };

  return [invariant1, invariant2, invariant3, invariant4];
}
