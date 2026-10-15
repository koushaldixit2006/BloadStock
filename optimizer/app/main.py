import os
import time
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from .models import (
    FeasibilityRequest,
    FeasibilityCandidate,
    PlanRequest,
    PlanResponse,
    ValidateRequest,
    InvariantResult
)
from .feasibility import evaluate_all_candidates, get_route_details
from .planner import solve_baseline, solve_optimized
from .rules import is_compatible, get_safety_margin_minutes

INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "bloodstock-dev-secret-key-32chars-min")

app = FastAPI(
    title="BloodStock Optimizer Service",
    description="Stateless optimization engine for blood unit transfer and allocation recommendations.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_internal_secret(secret: Optional[str]):
    if not secret or secret != INTERNAL_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Internal-Secret header"
        )

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "optimizer",
        "timestamp": time.time()
    }

@app.post("/v1/feasibility", response_model=List[FeasibilityCandidate])
def evaluate_feasibility_endpoint(
    req: FeasibilityRequest,
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret")
):
    verify_internal_secret(x_internal_secret)
    return evaluate_all_candidates(req.units, req.request, req.routes, req.now)

@app.post("/v1/plan", response_model=PlanResponse)
def generate_plan_endpoint(
    req: PlanRequest,
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret")
):
    verify_internal_secret(x_internal_secret)
    if req.mode == "baseline":
        return solve_baseline(req)
    else:
        return solve_optimized(req)

@app.post("/v1/validate", response_model=List[InvariantResult])
def validate_invariants_endpoint(
    req: ValidateRequest,
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret")
):
    verify_internal_secret(x_internal_secret)
    results: List[InvariantResult] = []
    safety_margin = get_safety_margin_minutes()

    unit_map = {u.id: u for u in req.units}
    req_map = {r.id: r for r in req.requests}

    # 1. Invariant: NO_DOUBLE_ALLOCATION
    active_reservations = [r for r in req.reservations if r.is_active]
    seen_units = set()
    double_booked_units = set()
    for res in active_reservations:
        if res.unit_id in seen_units:
            double_booked_units.add(res.unit_id)
        seen_units.add(res.unit_id)

    double_passed = len(double_booked_units) == 0
    results.append(
        InvariantResult(
            name="NO_DOUBLE_ALLOCATION",
            passed=double_passed,
            details="All active units have at most one reservation" if double_passed
                    else f"Duplicate active reservations found for unit(s): {', '.join(sorted(double_booked_units))}"
        )
    )

    # 2. Invariant: ABO_RH_COMPATIBILITY
    incompatible_pairs = []
    for res in req.reservations:
        unit = unit_map.get(res.unit_id)
        request = req_map.get(res.request_id)
        if unit and request:
            if unit.component != request.component or not is_compatible(request.component, unit.group, request.group):
                incompatible_pairs.append(f"{unit.id} ({unit.group}) -> {request.id} ({request.group})")
        elif not unit:
            incompatible_pairs.append(f"Missing unit {res.unit_id}")
        elif not request:
            incompatible_pairs.append(f"Missing request {res.request_id}")

    compat_passed = len(incompatible_pairs) == 0
    results.append(
        InvariantResult(
            name="ABO_RH_COMPATIBILITY",
            passed=compat_passed,
            details="All reservations satisfy ABO/Rh clinical compatibility" if compat_passed
                    else f"Incompatible pairings detected: {'; '.join(incompatible_pairs)}"
        )
    )

    # 3. Invariant: EXPIRY_SAFETY_MARGIN
    margin_violations = []
    for res in req.reservations:
        unit = unit_map.get(res.unit_id)
        request = req_map.get(res.request_id)
        if unit and request:
            from_h = res.from_hospital_id or unit.hospital_id
            to_h = res.to_hospital_id or request.hospital_id
            dispatch_buffer, transit, _, _ = get_route_details(req.routes, from_h, to_h)
            total_transit = dispatch_buffer + transit
            eta = res.eta or (req.now + timedelta(minutes=total_transit))
            margin_min = int((unit.expires_at - eta).total_seconds() / 60)
            if margin_min < safety_margin:
                margin_violations.append(
                    f"{unit.id} arrives at {eta.isoformat()}, expires at {unit.expires_at.isoformat()} (margin {margin_min}m < {safety_margin}m)"
                )

    margin_passed = len(margin_violations) == 0
    results.append(
        InvariantResult(
            name="EXPIRY_SAFETY_MARGIN",
            passed=margin_passed,
            details=f"All reservations arrive with at least {safety_margin} min safety buffer before expiration" if margin_passed
                    else f"Safety margin violated: {'; '.join(margin_violations)}"
        )
    )

    # 4. Invariant: ROUTE_UP
    route_violations = []
    for res in req.reservations:
        unit = unit_map.get(res.unit_id)
        request = req_map.get(res.request_id)
        if unit and request and unit.hospital_id != request.hospital_id:
            from_h = res.from_hospital_id or unit.hospital_id
            to_h = res.to_hospital_id or request.hospital_id
            _, _, route_up, err = get_route_details(req.routes, from_h, to_h)
            if not route_up and err:
                route_violations.append(f"{res.id or res.unit_id}: {err}")

    route_passed = len(route_violations) == 0
    results.append(
        InvariantResult(
            name="ROUTE_UP",
            passed=route_passed,
            details="All transit routes are active (UP)" if route_passed
                    else f"Down routes used: {'; '.join(route_violations)}"
        )
    )

    return results
