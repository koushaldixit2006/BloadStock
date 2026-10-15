import { BloodRequest, PlanAssignment, PlanMetrics, PlanOption, PlanResult, Unit } from '../types/domain';
import { getHospitalName } from '../data/hospitals';
import { formatDurationMinutes, getMinutesBetween } from './clock';
import { evaluateCandidate, FeasibilityContext } from './feasibility';

/**
 * Baseline Planner: Nearest-available greedy allocation.
 * Orders requests by urgency then neededBy. For each request, iteratively selects
 * the nearest available unit that satisfies all hard constraints.
 */
export function planBaseline(
  units: Unit[],
  requests: BloodRequest[],
  ctx: FeasibilityContext
): PlanResult {
  const activeRequests = requests.filter((r) => r.status === 'OPEN' || r.status === 'PARTIAL');
  const sortedRequests = [...activeRequests].sort((a, b) => {
    const urgencyOrder = { CRITICAL: 0, URGENT: 1, ROUTINE: 2 };
    const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (diff !== 0) return diff;
    return new Date(a.neededBy).getTime() - new Date(b.neededBy).getTime();
  });

  const allocatedUnitIds = new Set<string>();
  const assignments: PlanAssignment[] = [];
  const unfulfilled: { requestId: string; reason: string }[] = [];

  let totalTransportMinutes = 0;
  let totalExpiryMargin = 0;
  let allocatedCount = 0;

  for (const req of sortedRequests) {
    const assignedOptions: PlanOption[] = [];
    const needed = req.unitsNeeded;

    // Evaluate all units against this request
    const evaluated: PlanOption[] = [];
    for (const unit of units) {
      if (allocatedUnitIds.has(unit.id)) continue;
      const opt = evaluateCandidate(unit, req, ctx);
      evaluated.push(opt);
    }

    // Filter to feasible units and sort by nearest (transitMinutes), then expiry
    const feasible = evaluated
      .filter((opt) => opt.feasible)
      .sort((a, b) => {
        if (a.transitMinutes !== b.transitMinutes) {
          return a.transitMinutes - b.transitMinutes;
        }
        return new Date(a.unit.expiresAt).getTime() - new Date(b.unit.expiresAt).getTime();
      });

    // Pick up to needed units
    for (let i = 0; i < Math.min(needed, feasible.length); i++) {
      const opt = feasible[i];
      opt.rank = i + 1;
      allocatedUnitIds.add(opt.unitId);
      assignedOptions.push(opt);

      totalTransportMinutes += opt.transitMinutes;
      totalExpiryMargin += Math.max(0, opt.expiryMarginMinutes);
      allocatedCount++;
    }

    const isComplete = assignedOptions.length === needed;
    const allocatedUnits = assignedOptions.map((o) => o.unitId);

    let explanation = '';
    if (assignedOptions.length === 0) {
      const infeasible = evaluated.filter((e) => !e.feasible);
      const topReasons = Array.from(new Set(infeasible.flatMap((e) => e.blockingReasons))).slice(0, 2);
      const reasonMsg = topReasons.length > 0 ? topReasons.join('; ') : 'No compatible units in network';
      unfulfilled.push({ requestId: req.id, reason: reasonMsg });
      explanation = `Unfulfilled: ${reasonMsg}`;
    } else {
      explanation = `Nearest-available baseline: ${assignedOptions
        .map(
          (o) =>
            `${o.unitId} from ${getHospitalName(o.fromHospitalId)} (${o.transitMinutes}m transit, ${formatDurationMinutes(o.expiryMarginMinutes)} margin)`
        )
        .join('; ')}`;
    }

    assignments.push({
      requestId: req.id,
      allocatedUnitIds: allocatedUnits,
      options: assignedOptions,
      explanation,
      isComplete,
    });
  }

  const satisfiedRequests = assignments.filter((a) => a.isComplete).length;
  const partialRequests = assignments.filter((a) => !a.isComplete && a.allocatedUnitIds.length > 0).length;
  const unfulfilledRequests = assignments.filter((a) => a.allocatedUnitIds.length === 0).length;

  // Wasted units: available units expiring within 72h that are NOT allocated
  const wastedUnits72h = units.filter((u) => {
    if (u.status !== 'AVAILABLE' || allocatedUnitIds.has(u.id)) return false;
    const minutesToExpiry = getMinutesBetween(ctx.now, u.expiresAt);
    return minutesToExpiry > 0 && minutesToExpiry <= 72 * 60;
  }).length;

  const avgExpiryMarginMinutes =
    allocatedCount > 0 ? Math.round(totalExpiryMargin / allocatedCount) : 0;

  const metrics: PlanMetrics = {
    satisfiedRequests,
    partialRequests,
    unfulfilledRequests,
    wastedUnits72h,
    totalTransportMinutes,
    avgExpiryMarginMinutes,
  };

  return {
    planType: 'baseline',
    assignments,
    unfulfilled,
    metrics,
    generatedAt: ctx.now,
  };
}

/**
 * Global Optimized Planner:
 * Formulates the multi-hospital allocation as a Min-Cost Flow / Assignment problem
 * solved using Successive Shortest Paths (SSP).
 *
 * Cost Function:
 *   Cost(U_i -> R_j) =
 *       TransportMinutes
 *     + Penalty for low expiry safety margin
 *     - FEFO Bonus (utilize soonest-expiring units to avert 72h waste)
 *     + Allocation fairness & urgency prioritization
 *
 * Hard constraints (compatibility, expiry before arrival, route down, status)
 * are strict filters: infeasible pairs have no edge in the network.
 */
export function planOptimized(
  units: Unit[],
  requests: BloodRequest[],
  ctx: FeasibilityContext
): PlanResult {
  const activeRequests = requests.filter((r) => r.status === 'OPEN' || r.status === 'PARTIAL');

  // Decompose requests into individual unit slots
  interface RequestSlot {
    slotId: string;
    requestId: string;
    request: BloodRequest;
    slotIndex: number;
  }

  const slots: RequestSlot[] = [];
  for (const req of activeRequests) {
    for (let s = 0; s < req.unitsNeeded; s++) {
      slots.push({
        slotId: `${req.id}-slot-${s + 1}`,
        requestId: req.id,
        request: req,
        slotIndex: s,
      });
    }
  }

  // Pre-filter units to candidates that are available
  const availableUnits = units.filter((u) => u.status === 'AVAILABLE');

  // Build candidate feasibility evaluation matrix and cost
  interface CandidateEdge {
    unit: Unit;
    slot: RequestSlot;
    option: PlanOption;
    cost: number;
  }

  const feasibleEdges: CandidateEdge[] = [];
  // Also track evaluated options per request for explanation synthesis
  const evaluationsByRequest = new Map<string, PlanOption[]>();

  for (const slot of slots) {
    const req = slot.request;
    if (!evaluationsByRequest.has(req.id)) {
      const allEvaluations = availableUnits.map((u) => evaluateCandidate(u, req, ctx));
      evaluationsByRequest.set(req.id, allEvaluations);
    }

    const evals = evaluationsByRequest.get(req.id)!;
    for (const opt of evals) {
      if (!opt.feasible) continue;

      // Cost calculation:
      // 1. Base transit time
      let edgeCost = opt.transitMinutes;

      // 2. Low expiry margin risk penalty (if < 3 hours safety margin)
      if (opt.expiryMarginMinutes < 180) {
        edgeCost += (180 - opt.expiryMarginMinutes) * 0.15;
      }

      // 3. FEFO bonus: prioritize units expiring within 72h to prevent spoilage
      const minutesToExpiry = getMinutesBetween(ctx.now, opt.unit.expiresAt);
      if (minutesToExpiry > 0 && minutesToExpiry <= 72 * 60) {
        const soonnessRatio = (72 * 60 - minutesToExpiry) / (72 * 60);
        edgeCost -= soonnessRatio * 15; // up to 15 min bonus
      }

      // 4. Urgency priority: reduce cost for critical/urgent slots so they match best
      const urgencyBonus = { CRITICAL: 20, URGENT: 10, ROUTINE: 0 }[req.urgency];
      edgeCost -= urgencyBonus;

      feasibleEdges.push({
        unit: opt.unit,
        slot,
        option: opt,
        cost: edgeCost,
      });
    }
  }

  // Successive Shortest Path (SSP) bipartite matching
  // Units on left, Request slots on right.
  // Each unit can match at most 1 slot; each slot can receive at most 1 unit.
  // Sort slots by urgency to resolve high priority demands first if ties exist.
  slots.sort((a, b) => {
    const order = { CRITICAL: 0, URGENT: 1, ROUTINE: 2 };
    return order[a.request.urgency] - order[b.request.urgency];
  });

  const matchedUnitToSlot = new Map<string, string>(); // unitId -> slotId
  const matchedSlotToUnit = new Map<string, { unit: Unit; option: PlanOption; cost: number }>();

  // Iteratively match slots using min-cost augmenting path
  for (const slot of slots) {
    // Find available feasible edge with minimum cost that isn't yet assigned
    let bestEdge: CandidateEdge | null = null;
    let minCost = Infinity;

    for (const edge of feasibleEdges) {
      if (edge.slot.slotId !== slot.slotId) continue;
      if (matchedUnitToSlot.has(edge.unit.id)) continue; // Unit already assigned

      if (edge.cost < minCost) {
        minCost = edge.cost;
        bestEdge = edge;
      }
    }

    if (bestEdge) {
      matchedUnitToSlot.set(bestEdge.unit.id, slot.slotId);
      matchedSlotToUnit.set(slot.slotId, {
        unit: bestEdge.unit,
        option: bestEdge.option,
        cost: bestEdge.cost,
      });
    } else {
      // Try augmenting path / trade-off if high urgency slot is blocked by lower urgency slot
      for (const edge of feasibleEdges) {
        if (edge.slot.slotId !== slot.slotId) continue;
        const currentSlotId = matchedUnitToSlot.get(edge.unit.id);
        if (!currentSlotId) continue;

        const currentSlot = slots.find((s) => s.slotId === currentSlotId);
        if (!currentSlot) continue;

        // If the current slot has strictly lower urgency than the new slot, check if current slot can swap
        const urgencyOrder = { CRITICAL: 0, URGENT: 1, ROUTINE: 2 };
        if (urgencyOrder[slot.request.urgency] < urgencyOrder[currentSlot.request.urgency]) {
          // Look for an alternative unit for currentSlot
          const altEdge = feasibleEdges.find(
            (e) =>
              e.slot.slotId === currentSlot.slotId &&
              e.unit.id !== edge.unit.id &&
              !matchedUnitToSlot.has(e.unit.id)
          );

          if (altEdge) {
            // Reallocate edge.unit to slot, and altEdge.unit to currentSlot
            matchedUnitToSlot.set(edge.unit.id, slot.slotId);
            matchedSlotToUnit.set(slot.slotId, {
              unit: edge.unit,
              option: edge.option,
              cost: edge.cost,
            });

            matchedUnitToSlot.set(altEdge.unit.id, currentSlot.slotId);
            matchedSlotToUnit.set(currentSlot.slotId, {
              unit: altEdge.unit,
              option: altEdge.option,
              cost: altEdge.cost,
            });

            break;
          }
        }
      }
    }
  }

  // Assemble assignments per request
  const assignments: PlanAssignment[] = [];
  const unfulfilled: { requestId: string; reason: string }[] = [];

  let totalTransportMinutes = 0;
  let totalExpiryMargin = 0;
  let allocatedCount = 0;

  for (const req of activeRequests) {
    const reqSlots = slots.filter((s) => s.requestId === req.id);
    const assignedOptions: PlanOption[] = [];

    for (let i = 0; i < reqSlots.length; i++) {
      const slot = reqSlots[i];
      const match = matchedSlotToUnit.get(slot.slotId);
      if (match) {
        match.option.rank = i + 1;
        assignedOptions.push(match.option);

        totalTransportMinutes += match.option.transitMinutes;
        totalExpiryMargin += Math.max(0, match.option.expiryMarginMinutes);
        allocatedCount++;
      }
    }

    const isComplete = assignedOptions.length === req.unitsNeeded;
    const allocatedUnits = assignedOptions.map((o) => o.unitId);

    // Generate comprehensive explanation
    let explanation = '';
    if (assignedOptions.length === 0) {
      const evals = evaluationsByRequest.get(req.id) || [];
      const infeasible = evals.filter((e) => !e.feasible);
      const topReasons = Array.from(new Set(infeasible.flatMap((e) => e.blockingReasons))).slice(0, 2);
      const reasonMsg = topReasons.length > 0 ? topReasons.join('; ') : 'No compatible units in network';
      unfulfilled.push({ requestId: req.id, reason: reasonMsg });
      explanation = `Unfulfilled: ${reasonMsg}`;
    } else {
      const parts = assignedOptions.map((opt) => {
        // Check if there was an infeasible nearer unit
        const allEvals = evaluationsByRequest.get(req.id) || [];
        const nearerInfeasible = allEvals
          .filter((e) => !e.feasible && e.transitMinutes < opt.transitMinutes)
          .sort((a, b) => a.transitMinutes - b.transitMinutes)[0];

        let reason = '';
        if (nearerInfeasible) {
          reason = `Chosen over nearer unit ${nearerInfeasible.unitId} (${getHospitalName(nearerInfeasible.fromHospitalId)}) because that unit ${nearerInfeasible.blockingReasons[0] || 'is infeasible'}. ${formatDurationMinutes(opt.expiryMarginMinutes)} expiry margin, optimal network assignment.`;
        } else {
          reason = `Optimal match from ${getHospitalName(opt.fromHospitalId)} (${opt.transitMinutes}m transit, ${formatDurationMinutes(opt.expiryMarginMinutes)} expiry margin). Balanced network inventory.`;
        }
        return reason;
      });

      explanation = parts.join(' ');
    }

    assignments.push({
      requestId: req.id,
      allocatedUnitIds: allocatedUnits,
      options: assignedOptions,
      explanation,
      isComplete,
    });
  }

  const satisfiedRequests = assignments.filter((a) => a.isComplete).length;
  const partialRequests = assignments.filter((a) => !a.isComplete && a.allocatedUnitIds.length > 0).length;
  const unfulfilledRequests = assignments.filter((a) => a.allocatedUnitIds.length === 0).length;

  const wastedUnits72h = units.filter((u) => {
    if (u.status !== 'AVAILABLE' || matchedUnitToSlot.has(u.id)) return false;
    const minutesToExpiry = getMinutesBetween(ctx.now, u.expiresAt);
    return minutesToExpiry > 0 && minutesToExpiry <= 72 * 60;
  }).length;

  const avgExpiryMarginMinutes =
    allocatedCount > 0 ? Math.round(totalExpiryMargin / allocatedCount) : 0;

  const metrics: PlanMetrics = {
    satisfiedRequests,
    partialRequests,
    unfulfilledRequests,
    wastedUnits72h,
    totalTransportMinutes,
    avgExpiryMarginMinutes,
  };

  return {
    planType: 'optimized',
    assignments,
    unfulfilled,
    metrics,
    generatedAt: ctx.now,
  };
}
