from datetime import datetime, timedelta
from typing import List, Dict, Set, Tuple, Optional
from ortools.graph.python import min_cost_flow
from .models import (
    UnitSnapshot,
    RequestSnapshot,
    RouteSnapshot,
    PlanRequest,
    PlanResponse,
    PlanAssignment,
    UnfulfilledItem,
    PlanMetrics,
    FeasibilityCandidate,
    PlanWeights
)
from .feasibility import evaluate_candidate, evaluate_all_candidates
from .rules import HOSPITAL_NAMES

def get_urgency_rank(urgency: str) -> int:
    ranks = {"CRITICAL": 0, "URGENT": 1, "ROUTINE": 2}
    return ranks.get(urgency, 3)

def get_unfilled_penalty(urgency: str, weights: PlanWeights) -> int:
    if urgency == "CRITICAL":
        return int(weights.w_unfilled_critical)
    elif urgency == "URGENT":
        return int(weights.w_unfilled_urgent)
    else:
        return int(weights.w_unfilled_routine)

def compute_cost_integer(
    candidate: FeasibilityCandidate,
    unit: UnitSnapshot,
    now: datetime,
    weights: PlanWeights
) -> int:
    """
    OR-Tools requires integer costs.
    Cost = transport_minutes * w_transport + fefo_hours * w_fefo + expiry_margin_penalty
    Scaled and rounded to an integer.
    """
    transport_cost = int(round(candidate.transit_minutes * weights.w_transport))
    
    # FEFO: sooner expiring units have lower cost, so they are prioritized
    hours_to_expiry = max(0.0, (unit.expires_at - now).total_seconds() / 3600.0)
    fefo_cost = int(round(hours_to_expiry * weights.w_fefo))
    
    # Margin penalty: closer to 30 min safety margin receives slight penalty
    margin_penalty = int(round((weights.w_expiry_penalty * 1000.0) / (candidate.expiry_margin_minutes + 1)))
    
    return transport_cost + fefo_cost + margin_penalty

def format_expiry_margin(margin_minutes: int) -> str:
    if margin_minutes < 0:
        return f"{margin_minutes}m"
    if margin_minutes >= 48 * 60:
        days = margin_minutes // (24 * 60)
        hours = (margin_minutes % (24 * 60)) // 60
        return f"{days}d {hours}h"
    hours = margin_minutes // 60
    mins = margin_minutes % 60
    if hours > 0:
        return f"{hours}h {mins}m"
    return f"{mins}m"

def generate_assignment_explanation(
    allocated_candidates: List[FeasibilityCandidate],
    all_candidates: List[FeasibilityCandidate],
    request: RequestSnapshot,
    mode: str
) -> str:
    if not allocated_candidates:
        return f"No feasible units found for {request.urgency} request {request.id}."

    solver_tag = "Global min-cost flow" if mode == "optimized" else "Baseline nearest-available"

    if len(allocated_candidates) == 1:
        chosen = allocated_candidates[0]
        from_name = HOSPITAL_NAMES.get(chosen.from_hospital_id, chosen.from_hospital_id)
        to_name = HOSPITAL_NAMES.get(chosen.to_hospital_id, chosen.to_hospital_id)
        time_str = format_expiry_margin(chosen.expiry_margin_minutes)

        nearer_rejected = [
            c for c in all_candidates
            if c.transit_minutes < chosen.transit_minutes
            and not c.feasible
            and not any("Incompatible" in br for br in c.blocking_reasons)
        ]
        nearer_rejected.sort(key=lambda c: c.transit_minutes)

        reason_prefix = ""
        if nearer_rejected:
            nearer = nearer_rejected[0]
            blocking_str = nearer.blocking_reasons[0] if nearer.blocking_reasons else "infeasible"
            reason_prefix = f"Chosen over nearer unit {nearer.unit_id} because that unit {blocking_str.lower()}. "

        if chosen.from_hospital_id == chosen.to_hospital_id:
            transfer_str = f"Local stock at {from_name}, no transfer needed"
        else:
            transfer_str = f"from {from_name} to {to_name} (transit {chosen.transit_minutes}m)"

        return (
            f"{reason_prefix}{solver_tag}: {transfer_str}. "
            f"{time_str} safety margin, fulfills {request.urgency} request."
        )
    else:
        hospitals_involved: List[str] = []
        for c in allocated_candidates:
            hname = HOSPITAL_NAMES.get(c.from_hospital_id, c.from_hospital_id)
            if hname not in hospitals_involved:
                hospitals_involved.append(hname)

        if len(hospitals_involved) == 1:
            if allocated_candidates[0].from_hospital_id == request.hospital_id:
                location_str = f"Local stock at {hospitals_involved[0]}, no transfer needed"
            else:
                location_str = f"{len(allocated_candidates)} units from {hospitals_involved[0]}"
        elif len(hospitals_involved) == 2:
            location_str = f"{len(allocated_candidates)} units from {hospitals_involved[0]} and {hospitals_involved[1]}"
        else:
            location_str = f"{len(allocated_candidates)} units from {', '.join(hospitals_involved[:-1])} and {hospitals_involved[-1]}"

        details = [f"{c.unit_id} ({format_expiry_margin(c.expiry_margin_minutes)} margin)" for c in allocated_candidates]
        return (
            f"{solver_tag}: {location_str} [{', '.join(details)}]. "
            f"Fulfills {len(allocated_candidates)} of {request.units_needed} units for {request.urgency} request."
        )

def calculate_metrics(
    assignments: List[PlanAssignment],
    requests: List[RequestSnapshot],
    units: List[UnitSnapshot],
    candidates_by_unit_req: Dict[Tuple[str, str], FeasibilityCandidate],
    now: datetime
) -> PlanMetrics:
    satisfied = 0
    partial = 0
    unfulfilled = 0
    total_transport_minutes = 0
    all_margins: List[int] = []
    allocated_units_set: Set[str] = set()

    for a in assignments:
        req = next((r for r in requests if r.id == a.request_id), None)
        needed = req.units_needed if req else 1
        allocated_count = len(a.allocated_unit_ids)

        if allocated_count >= needed:
            satisfied += 1
        elif allocated_count > 0:
            partial += 1
        else:
            unfulfilled += 1

        for uid in a.allocated_unit_ids:
            allocated_units_set.add(uid)
            cand = candidates_by_unit_req.get((uid, a.request_id))
            if cand:
                total_transport_minutes += cand.transit_minutes
                all_margins.append(cand.expiry_margin_minutes)

    # Wasted units: available units expiring within 72 hours from now not assigned to any request
    horizon_72h = now + timedelta(hours=72)
    wasted_units = sum(
        1 for u in units
        if u.status == "AVAILABLE"
        and u.id not in allocated_units_set
        and u.expires_at <= horizon_72h
    )

    avg_margin = (
        round(sum(all_margins) / len(all_margins), 1)
        if all_margins else 0.0
    )

    return PlanMetrics(
        satisfied=satisfied,
        partial=partial,
        unfulfilled=unfulfilled,
        wasted_units=wasted_units,
        total_transport_minutes=total_transport_minutes,
        avg_expiry_margin_minutes=avg_margin
    )

# --- BASELINE SOLVER ---
def solve_baseline(req: PlanRequest) -> PlanResponse:
    weights = req.weights or PlanWeights()
    
    # Sort requests by urgency (CRITICAL > URGENT > ROUTINE), then neededBy, then ID
    sorted_requests = sorted(
        req.requests,
        key=lambda r: (get_urgency_rank(r.urgency), r.needed_by, r.id)
    )

    unit_map = {u.id: u for u in req.units}
    assigned_units: Set[str] = set()
    assignments: List[PlanAssignment] = []
    unfulfilled_list: List[UnfulfilledItem] = []
    candidates_by_unit_req: Dict[Tuple[str, str], FeasibilityCandidate] = {}

    for r in sorted_requests:
        candidate_options: List[FeasibilityCandidate] = []
        for u in req.units:
            cand = evaluate_candidate(u, r, req.routes, req.now)
            candidate_options.append(cand)
            candidates_by_unit_req[(u.id, r.id)] = cand

        # Feasible unassigned candidates
        feasible_candidates = [
            c for c in candidate_options
            if c.feasible and c.unit_id not in assigned_units
        ]
        # Baseline priority: nearest transit first, then FEFO, then ID
        feasible_candidates.sort(
            key=lambda c: (
                c.transit_minutes,
                unit_map[c.unit_id].expires_at,
                c.unit_id
            )
        )

        allocated_ids: List[str] = []
        for c in feasible_candidates[:r.units_needed]:
            allocated_ids.append(c.unit_id)
            assigned_units.add(c.unit_id)

        is_complete = len(allocated_ids) >= r.units_needed
        if not is_complete:
            shortfall = r.units_needed - len(allocated_ids)
            reasons = [
                f"Missing {shortfall} compatible unit(s) meeting transit & 30m safety margin"
            ]
            unfulfilled_list.append(UnfulfilledItem(request_id=r.id, reasons=reasons))

        explanation = ""
        if allocated_ids:
            allocated_cands = [c for c in candidate_options if c.unit_id in allocated_ids]
            explanation = generate_assignment_explanation(
                allocated_cands, candidate_options, r, mode="baseline"
            )
        else:
            explanation = f"No feasible units found for {r.urgency} request {r.id}."

        assignments.append(
            PlanAssignment(
                request_id=r.id,
                allocated_unit_ids=allocated_ids,
                options=candidate_options,
                explanation=explanation,
                is_complete=is_complete
            )
        )

    # Sort assignments back by request id or original request order
    req_order = {r.id: idx for idx, r in enumerate(req.requests)}
    assignments.sort(key=lambda a: req_order.get(a.request_id, 0))

    metrics = calculate_metrics(
        assignments, req.requests, req.units, candidates_by_unit_req, req.now
    )

    return PlanResponse(
        assignments=assignments,
        unfulfilled=unfulfilled_list,
        metrics=metrics,
        source="optimizer-greedy-baseline"
    )

# --- OPTIMIZED SOLVER (OR-Tools SimpleMinCostFlow) ---
def solve_optimized(req: PlanRequest) -> PlanResponse:
    weights = req.weights or PlanWeights()
    smcf = min_cost_flow.SimpleMinCostFlow()

    # Deterministic sorting of inputs by ID
    sorted_units = sorted(req.units, key=lambda u: u.id)
    sorted_requests = sorted(req.requests, key=lambda r: r.id)
    unit_map = {u.id: u for u in sorted_units}

    U = len(sorted_units)
    R = len(sorted_requests)
    total_demand = sum(r.units_needed for r in sorted_requests)

    # Node indices:
    # 0 .. U-1: Units
    # U .. U+R-1: Requests
    # T = U + R: Unused Units Sink
    # S = U + R + 1: Unfilled Requests Supply
    T_NODE = U + R
    S_NODE = U + R + 1

    # Node Supplies:
    # Each unit has supply 1
    for i in range(U):
        smcf.set_node_supply(i, 1)

    # Each request has demand (negative supply)
    for j, r in enumerate(sorted_requests):
        smcf.set_node_supply(U + j, -r.units_needed)

    # S node supply = total_demand
    smcf.set_node_supply(S_NODE, total_demand)

    # T node demand = U (negative supply)
    smcf.set_node_supply(T_NODE, -U)

    # Balancing arc from S to T with 0 cost and capacity max(U, total_demand)
    smcf.add_arc_with_capacity_and_unit_cost(S_NODE, T_NODE, max(U, total_demand) + 10, 0)

    # Arcs from Unit i to T (unused unit option at cost 0)
    for i in range(U):
        smcf.add_arc_with_capacity_and_unit_cost(i, T_NODE, 1, 0)

    # Arcs from S to Request j (unfilled request option at heavy urgency-weighted penalty)
    for j, r in enumerate(sorted_requests):
        penalty = get_unfilled_penalty(r.urgency, weights)
        smcf.add_arc_with_capacity_and_unit_cost(S_NODE, U + j, r.units_needed, penalty)

    # Bipartite Arcs: Unit i -> Request j (ONLY if FEASIBLE!)
    arc_to_candidate: Dict[int, Tuple[str, str, FeasibilityCandidate]] = {}
    candidates_by_unit_req: Dict[Tuple[str, str], FeasibilityCandidate] = {}
    candidates_by_request: Dict[str, List[FeasibilityCandidate]] = {r.id: [] for r in sorted_requests}

    for j, r in enumerate(sorted_requests):
        for i, u in enumerate(sorted_units):
            cand = evaluate_candidate(u, r, req.routes, req.now)
            candidates_by_unit_req[(u.id, r.id)] = cand
            candidates_by_request[r.id].append(cand)

            if cand.feasible:
                cost_int = compute_cost_integer(cand, u, req.now, weights)
                arc_idx = smcf.add_arc_with_capacity_and_unit_cost(i, U + j, 1, cost_int)
                arc_to_candidate[arc_idx] = (u.id, r.id, cand)

    # Solve the Min-Cost Flow
    solve_status = smcf.solve()

    if solve_status != smcf.OPTIMAL:
        # Fallback to baseline solver if min-cost flow fails unexpectedly
        fallback = solve_baseline(req)
        fallback.source = "optimizer-min-cost-flow-fallback"
        return fallback

    # Extract allocations from flow
    allocated_by_request: Dict[str, List[str]] = {r.id: [] for r in sorted_requests}
    for arc_idx, (uid, rid, _) in arc_to_candidate.items():
        if smcf.flow(arc_idx) > 0:
            allocated_by_request[rid].append(uid)

    assignments: List[PlanAssignment] = []
    unfulfilled_list: List[UnfulfilledItem] = []

    for r in sorted_requests:
        allocated = allocated_by_request[r.id]
        # Sort allocated units deterministically
        allocated.sort()
        options = candidates_by_request[r.id]
        is_complete = len(allocated) >= r.units_needed

        if not is_complete:
            shortfall = r.units_needed - len(allocated)
            unfulfilled_list.append(
                UnfulfilledItem(
                    request_id=r.id,
                    reasons=[f"Shortfall of {shortfall} unit(s) meeting compatibility and safety margins"]
                )
            )

        explanation = ""
        if allocated:
            allocated_cands = [c for c in options if c.unit_id in allocated]
            explanation = generate_assignment_explanation(
                allocated_cands, options, r, mode="optimized"
            )
        else:
            explanation = f"Global solver could not find feasible allocation for {r.urgency} request {r.id}."

        assignments.append(
            PlanAssignment(
                request_id=r.id,
                allocated_unit_ids=allocated,
                options=options,
                explanation=explanation,
                is_complete=is_complete
            )
        )

    # Re-order assignments to match input requests order
    req_order = {r.id: idx for idx, r in enumerate(req.requests)}
    assignments.sort(key=lambda a: req_order.get(a.request_id, 0))

    metrics = calculate_metrics(
        assignments, req.requests, req.units, candidates_by_unit_req, req.now
    )

    return PlanResponse(
        assignments=assignments,
        unfulfilled=unfulfilled_list,
        metrics=metrics,
        source="optimizer-min-cost-flow"
    )
