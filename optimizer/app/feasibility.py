from datetime import datetime, timedelta
from typing import List, Tuple, Optional
from .models import UnitSnapshot, RequestSnapshot, RouteSnapshot, FeasibilityCandidate
from .rules import is_compatible, get_safety_margin_minutes, get_dispatch_buffer_minutes, HOSPITAL_NAMES

def get_route_details(
    routes: List[RouteSnapshot],
    from_id: str,
    to_id: str
) -> Tuple[int, int, bool, Optional[str]]:
    """
    Returns (dispatch_buffer_minutes, transit_minutes, is_up, error_reason).
    Intra-hospital transfers take 5 minutes with 0 dispatch buffer.
    """
    if from_id == to_id:
        return 0, 5, True, None

    dispatch_buffer = get_dispatch_buffer_minutes()
    matching = next((r for r in routes if r.from_id == from_id and r.to_id == to_id), None)
    
    if not matching:
        from_name = HOSPITAL_NAMES.get(from_id, from_id)
        to_name = HOSPITAL_NAMES.get(to_id, to_id)
        return dispatch_buffer, 9999, False, f"Route {from_name} to {to_name} not found"

    if matching.status == "DOWN":
        from_name = HOSPITAL_NAMES.get(from_id, from_id)
        to_name = HOSPITAL_NAMES.get(to_id, to_id)
        return dispatch_buffer, 9999, False, f"Route {from_name} to {to_name} is down"

    transit = matching.base_minutes + matching.delay_minutes
    return dispatch_buffer, transit, True, None

def evaluate_candidate(
    unit: UnitSnapshot,
    request: RequestSnapshot,
    routes: List[RouteSnapshot],
    now: datetime
) -> FeasibilityCandidate:
    """
    Strict 6-step feasibility evaluation in specified order:
    1. Status AVAILABLE
    2. ABO/Rh Compatibility from rules.json
    3. Route UP
    4. ETA Calculation
    5. Expiration vs arrival + safety margin
    6. Arrival vs neededBy deadline
    """
    blocking_reasons: List[str] = []
    safety_margin = get_safety_margin_minutes()

    # 1. Status check
    if unit.status != "AVAILABLE":
        if unit.reserved_for_request_id:
            blocking_reasons.append(f"Already reserved for {unit.reserved_for_request_id}")
        else:
            blocking_reasons.append(f"Unit status is {unit.status}")

    # 2. Compatibility check
    if unit.component != request.component:
        blocking_reasons.append(
            f"Incompatible component: unit is {unit.component}, request is for {request.component}"
        )
    elif not is_compatible(request.component, unit.group, request.group):
        blocking_reasons.append(
            f"Incompatible group: {unit.group} cannot serve {request.group}"
        )

    # 3. Route check & ETA calculation
    dispatch_buffer, transit_mins, route_up, route_err = get_route_details(
        routes, unit.hospital_id, request.hospital_id
    )
    if not route_up and route_err:
        blocking_reasons.append(route_err)

    total_transit_minutes = dispatch_buffer + (transit_mins if transit_mins < 9000 else 60)
    eta = now + timedelta(minutes=total_transit_minutes)

    # 4. Expiry margin calculation
    diff_seconds = (unit.expires_at - eta).total_seconds()
    expiry_margin_minutes = int(diff_seconds / 60)

    # 5. Expiry safety margin check
    if eta >= unit.expires_at:
        overstay_min = int((eta - unit.expires_at).total_seconds() / 60)
        blocking_reasons.append(f"Expires {overstay_min} min before arrival")
    elif expiry_margin_minutes < safety_margin:
        shortfall = safety_margin - expiry_margin_minutes
        blocking_reasons.append(
            f"Insufficient safety margin: arrives {expiry_margin_minutes} min before expiry, requires at least {safety_margin} min"
        )

    # 6. Needed-by deadline check
    if eta > request.needed_by:
        lateness_min = int((eta - request.needed_by).total_seconds() / 60)
        blocking_reasons.append(f"Arrives {lateness_min} min after needed-by")

    feasible = len(blocking_reasons) == 0

    return FeasibilityCandidate(
        unit_id=unit.id,
        feasible=feasible,
        blocking_reasons=blocking_reasons,
        eta=eta,
        expiry_margin_minutes=expiry_margin_minutes,
        transit_minutes=total_transit_minutes,
        from_hospital_id=unit.hospital_id,
        to_hospital_id=request.hospital_id
    )

def evaluate_all_candidates(
    units: List[UnitSnapshot],
    request: RequestSnapshot,
    routes: List[RouteSnapshot],
    now: datetime
) -> List[FeasibilityCandidate]:
    return [evaluate_candidate(u, request, routes, now) for u in units]
