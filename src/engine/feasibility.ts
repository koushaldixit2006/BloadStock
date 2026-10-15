import { BloodRequest, PlanOption, Route, Unit } from '../types/domain';
import { getHospitalName } from '../data/hospitals';
import { findRoute } from '../data/transportMatrix';
import { addMinutesToIso, DISPATCH_BUFFER_MINUTES, getMinutesBetween, SAFETY_MARGIN_MINUTES } from './clock';
import { isCompatible } from './compatibility';

export interface FeasibilityContext {
  now: string;
  routes: Route[];
}

/**
 * Evaluates a candidate unit against a request with strict ordered checks.
 * Infeasible candidates are NEVER discarded; all blocking reasons are returned
 * to provide full operational transparency for clinical decision support.
 */
export function evaluateCandidate(
  unit: Unit,
  request: BloodRequest,
  ctx: FeasibilityContext
): PlanOption {
  const blockingReasons: string[] = [];
  const fromHospitalId = unit.hospitalId;
  const toHospitalId = request.hospitalId;

  // 1. Status Check
  if (unit.status !== 'AVAILABLE') {
    if (unit.reservedForRequestId) {
      blockingReasons.push(`Already reserved for ${unit.reservedForRequestId}`);
    } else if (unit.status === 'EXPIRED') {
      blockingReasons.push('Unit is expired');
    } else if (unit.status === 'IN_TRANSIT') {
      blockingReasons.push('Unit is currently in transit');
    } else {
      blockingReasons.push(`Unit status is ${unit.status}`);
    }
  }

  // 2. Component & Blood Group Compatibility Check
  if (unit.component !== request.component) {
    blockingReasons.push(`Incompatible component: ${unit.component} cannot fulfill ${request.component} request`);
  }

  const compatible = isCompatible(request.component, unit.group, request.group);
  if (!compatible) {
    blockingReasons.push(`Incompatible group: ${unit.group} cannot serve ${request.group}`);
  }

  // 3. Route Check & Transit Duration
  let transitMinutes = 5; // Default for intra-hospital
  let routeIsDown = false;

  if (fromHospitalId !== toHospitalId) {
    const route = findRoute(ctx.routes, fromHospitalId, toHospitalId);
    if (!route || route.status === 'DOWN') {
      routeIsDown = true;
      const fromName = getHospitalName(fromHospitalId);
      const toName = getHospitalName(toHospitalId);
      blockingReasons.push(`Route ${fromName} to ${toName} is down`);
    } else {
      transitMinutes = route.baseMinutes + route.delayMinutes;
    }
  }

  // 4. Calculate ETA
  // ETA = now + dispatchBuffer(15 min) + route minutes + delay
  const totalTravelMinutes = DISPATCH_BUFFER_MINUTES + transitMinutes;
  const eta = addMinutesToIso(ctx.now, totalTravelMinutes);

  // 5. Expiry Check (must arrive with at least SAFETY_MARGIN_MINUTES before expiry)
  // eta <= unit.expiresAt minus safety margin(30 min)
  const minutesUntilExpiryFromNow = getMinutesBetween(ctx.now, unit.expiresAt);
  const minutesFromEtaToExpiry = getMinutesBetween(eta, unit.expiresAt);
  const expiryMarginMinutes = minutesFromEtaToExpiry - SAFETY_MARGIN_MINUTES;

  if (minutesUntilExpiryFromNow <= 0) {
    blockingReasons.push('Unit has already expired');
  } else if (minutesFromEtaToExpiry < 0) {
    const minsBeforeArrival = Math.abs(minutesFromEtaToExpiry);
    blockingReasons.push(`Expires ${minsBeforeArrival} min before arrival`);
  } else if (expiryMarginMinutes < 0) {
    const deficit = Math.abs(expiryMarginMinutes);
    blockingReasons.push(`Expires ${deficit} min before safety margin threshold (30 min requirement)`);
  }

  // 6. Urgency Deadline Check
  // eta <= request.neededBy
  const minutesFromEtaToNeeded = getMinutesBetween(eta, request.neededBy);
  if (minutesFromEtaToNeeded < 0) {
    const lateMinutes = Math.abs(minutesFromEtaToNeeded);
    blockingReasons.push(`Arrives ${lateMinutes} min after needed-by`);
  }

  const feasible = blockingReasons.length === 0 && !routeIsDown;

  // Cost calculation for ranking:
  // Base cost is transit time.
  // Intra-hospital receives a bonus (lower cost).
  // Lower expiry margin adds penalty so we don't risk near-expiry units unless necessary.
  let cost = transitMinutes;
  if (!feasible) {
    cost += 10000;
  }

  return {
    unitId: unit.id,
    fromHospitalId,
    toHospitalId,
    eta,
    transitMinutes,
    expiryMarginMinutes,
    feasible,
    blockingReasons,
    cost,
    explanation: feasible
      ? `Feasible transfer (${transitMinutes}m transit, ${Math.max(0, Math.floor(expiryMarginMinutes / 60))}h ${Math.abs(expiryMarginMinutes) % 60}m expiry safety margin)`
      : blockingReasons.join('; '),
    rank: 0,
    unit,
  };
}
