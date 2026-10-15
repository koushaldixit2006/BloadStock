from datetime import datetime, timedelta
import pytest
from app.models import UnitSnapshot, RequestSnapshot, RouteSnapshot, PlanRequest
from app.feasibility import evaluate_candidate
from app.planner import solve_baseline, solve_optimized

NOW = datetime.fromisoformat("2026-10-15T08:00:00")

def get_hero_scenario_data():
    # Routes matrix between H1, H3, H5
    routes = [
        RouteSnapshot(fromId="H1", toId="H3", baseMinutes=20, status="UP"),
        RouteSnapshot(fromId="H5", toId="H3", baseMinutes=45, status="UP"),
        RouteSnapshot(fromId="H3", toId="H3", baseMinutes=5, status="UP"),
    ]

    # Request R-101 at Amber Heart Institute (H3)
    request = RequestSnapshot(
        id="R-101",
        hospitalId="H3",
        component="PLATELETS",
        group="O-",
        unitsNeeded=1,
        neededBy=NOW + timedelta(hours=2),
        urgency="CRITICAL",
        status="OPEN"
    )

    # Unit U-10001: Nearest (H1, 20m transit), but expires in 30 minutes!
    unit_nearest = UnitSnapshot(
        id="U-10001",
        component="PLATELETS",
        group="O-",
        hospitalId="H1",
        collectedAt=NOW - timedelta(days=4),
        expiresAt=NOW + timedelta(minutes=30),
        status="AVAILABLE"
    )

    # Unit U-10002: Farther (H5, 45m transit), expires in 28 hours
    unit_farther = UnitSnapshot(
        id="U-10002",
        component="PLATELETS",
        group="O-",
        hospitalId="H5",
        collectedAt=NOW - timedelta(days=3),
        expiresAt=NOW + timedelta(hours=28),
        status="AVAILABLE"
    )

    return routes, request, [unit_nearest, unit_farther]

def test_hero_scenario_feasibility():
    routes, request, units = get_hero_scenario_data()
    unit_nearest, unit_farther = units[0], units[1]

    # Evaluate nearest unit U-10001
    cand_nearest = evaluate_candidate(unit_nearest, request, routes, NOW)
    assert cand_nearest.feasible is False
    assert any("Expires 5 min before arrival" in r for r in cand_nearest.blocking_reasons)
    assert cand_nearest.transit_minutes == 35  # 15 dispatch + 20 transit

    # Evaluate farther unit U-10002
    cand_farther = evaluate_candidate(unit_farther, request, routes, NOW)
    assert cand_farther.feasible is True
    assert len(cand_farther.blocking_reasons) == 0
    assert cand_farther.transit_minutes == 60  # 15 dispatch + 45 transit
    assert cand_farther.expiry_margin_minutes == 1620  # 28h - 1h transit = 27h = 1620m

def test_hero_scenario_planner_selection_and_explanation():
    routes, request, units = get_hero_scenario_data()

    for solver_func, mode_name in [(solve_baseline, "baseline"), (solve_optimized, "optimized")]:
        plan_req = PlanRequest(
            units=units,
            requests=[request],
            routes=routes,
            now=NOW,
            mode=mode_name
        )
        res = solver_func(plan_req)

        assert len(res.assignments) == 1
        assignment = res.assignments[0]
        assert assignment.request_id == "R-101"
        assert assignment.is_complete is True
        # Farther unit U-10002 MUST be chosen because U-10001 is infeasible!
        assert assignment.allocated_unit_ids == ["U-10002"]

        # Explanation MUST mention U-10001 rejection reason
        explanation = assignment.explanation
        assert "Chosen over nearer unit U-10001" in explanation
        assert "expires 5 min before arrival" in explanation.lower()
