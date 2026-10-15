from datetime import datetime, timedelta
import pytest
from app.models import UnitSnapshot, RequestSnapshot, RouteSnapshot
from app.feasibility import evaluate_candidate

NOW = datetime.fromisoformat("2026-10-15T08:00:00")

def make_route(from_h="H1", to_h="H3", base_mins=20, status="UP", delay=0):
    return [RouteSnapshot(fromId=from_h, toId=to_h, baseMinutes=base_mins, status=status, delayMinutes=delay)]

def make_request(hospital="H3", comp="RED_CELLS", group="A+", needed_by=None, urgency="URGENT"):
    if needed_by is None:
        needed_by = NOW + timedelta(hours=4)
    return RequestSnapshot(
        id="R-TEST",
        hospitalId=hospital,
        component=comp,
        group=group,
        unitsNeeded=1,
        neededBy=needed_by,
        urgency=urgency,
        status="OPEN"
    )

def make_unit(hospital="H1", comp="RED_CELLS", group="A+", expires_at=None, status="AVAILABLE", reserved_for=None):
    if expires_at is None:
        expires_at = NOW + timedelta(days=5)
    return UnitSnapshot(
        id="U-TEST",
        component=comp,
        group=group,
        hospitalId=hospital,
        collectedAt=NOW - timedelta(days=2),
        expiresAt=expires_at,
        status=status,
        reservedForRequestId=reserved_for
    )

# --- 1. Boundary Tests (+- 1 minute around 30 min safety margin) ---
def test_safety_margin_boundary_conditions():
    # Dispatch buffer 15m + transit 20m = 35m total transit. ETA = NOW + 35m
    routes = make_route("H1", "H3", 20)
    req = make_request("H3", "RED_CELLS", "A+")

    # Case A: exactly 29 minutes margin (35 + 29 = 64 minutes after NOW) -> INFEASIBLE
    unit_29m = make_unit("H1", "RED_CELLS", "A+", expires_at=NOW + timedelta(minutes=64))
    res_29m = evaluate_candidate(unit_29m, req, routes, NOW)
    assert res_29m.feasible is False
    assert res_29m.expiry_margin_minutes == 29
    assert any("Insufficient safety margin" in r for r in res_29m.blocking_reasons)

    # Case B: exactly 30 minutes margin (35 + 30 = 65 minutes after NOW) -> FEASIBLE
    unit_30m = make_unit("H1", "RED_CELLS", "A+", expires_at=NOW + timedelta(minutes=65))
    res_30m = evaluate_candidate(unit_30m, req, routes, NOW)
    assert res_30m.feasible is True
    assert res_30m.expiry_margin_minutes == 30
    assert len(res_30m.blocking_reasons) == 0

    # Case C: exactly 31 minutes margin (35 + 31 = 66 minutes after NOW) -> FEASIBLE
    unit_31m = make_unit("H1", "RED_CELLS", "A+", expires_at=NOW + timedelta(minutes=66))
    res_31m = evaluate_candidate(unit_31m, req, routes, NOW)
    assert res_31m.feasible is True
    assert res_31m.expiry_margin_minutes == 31
    assert len(res_31m.blocking_reasons) == 0

# --- 2. Blocking Reasons Trigger Correctly ---
def test_blocking_reason_status_not_available():
    routes = make_route("H1", "H3", 20)
    req = make_request("H3", "RED_CELLS", "A+")

    # Reserved for another request
    unit_reserved = make_unit("H1", "RED_CELLS", "A+", status="RESERVED", reserved_for="R-1039")
    res = evaluate_candidate(unit_reserved, req, routes, NOW)
    assert res.feasible is False
    assert any("Already reserved for R-1039" in r for r in res.blocking_reasons)

    # General non-available status
    unit_expired = make_unit("H1", "RED_CELLS", "A+", status="EXPIRED")
    res_exp = evaluate_candidate(unit_expired, req, routes, NOW)
    assert res_exp.feasible is False
    assert any("Unit status is EXPIRED" in r for r in res_exp.blocking_reasons)

def test_blocking_reason_incompatible_group():
    routes = make_route("H1", "H3", 20)
    # Recipient O- requires O- red cells. O+ is incompatible!
    req = make_request("H3", "RED_CELLS", "O-")
    unit = make_unit("H1", "RED_CELLS", "O+")
    res = evaluate_candidate(unit, req, routes, NOW)
    assert res.feasible is False
    assert any("Incompatible group: O+ cannot serve O-" in r for r in res.blocking_reasons)

def test_blocking_reason_route_down():
    routes = make_route("H4", "H3", 65, status="DOWN")
    req = make_request("H3", "RED_CELLS", "A+")
    unit = make_unit("H4", "RED_CELLS", "A+")
    res = evaluate_candidate(unit, req, routes, NOW)
    assert res.feasible is False
    assert any("Route Sawai Care Hospital to Amber Heart Institute is down" in r for r in res.blocking_reasons)

def test_blocking_reason_expires_before_arrival():
    # Transit = 15m buffer + 20m = 35m. Arrives at NOW + 35m.
    # Unit expires at NOW + 20m.
    routes = make_route("H1", "H3", 20)
    req = make_request("H3", "RED_CELLS", "A+")
    unit = make_unit("H1", "RED_CELLS", "A+", expires_at=NOW + timedelta(minutes=20))
    res = evaluate_candidate(unit, req, routes, NOW)
    assert res.feasible is False
    assert any("Expires 15 min before arrival" in r for r in res.blocking_reasons)

def test_blocking_reason_arrives_after_needed_by():
    # Transit = 35m. Arrives at NOW + 35m.
    # Request needed within 20m.
    routes = make_route("H1", "H3", 20)
    req = make_request("H3", "RED_CELLS", "A+", needed_by=NOW + timedelta(minutes=20))
    unit = make_unit("H1", "RED_CELLS", "A+", expires_at=NOW + timedelta(days=2))
    res = evaluate_candidate(unit, req, routes, NOW)
    assert res.feasible is False
    assert any("Arrives 15 min after needed-by" in r for r in res.blocking_reasons)
