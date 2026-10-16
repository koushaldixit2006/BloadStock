from datetime import datetime, timedelta
import json
from pathlib import Path
import pytest
from app.models import UnitSnapshot, RequestSnapshot, RouteSnapshot, PlanRequest
from app.planner import solve_baseline, solve_optimized, format_expiry_margin
from app.rules import is_compatible

NOW = datetime.fromisoformat("2026-10-15T08:00:00")

def get_complete_symmetric_routes():
    hospital_ids = ["H1", "H2", "H3", "H4", "H5"]
    base_matrix = {
        "H1": {"H1": 5, "H2": 25, "H3": 20, "H4": 30, "H5": 35},
        "H2": {"H1": 25, "H2": 5, "H3": 55, "H4": 40, "H5": 75},
        "H3": {"H1": 20, "H2": 55, "H3": 5, "H4": 65, "H5": 45},
        "H4": {"H1": 30, "H2": 40, "H3": 65, "H4": 5, "H5": 50},
        "H5": {"H1": 35, "H2": 75, "H3": 45, "H4": 50, "H5": 5},
    }
    routes = []
    for f in hospital_ids:
        for t in hospital_ids:
            routes.append(
                RouteSnapshot(fromId=f, toId=t, baseMinutes=base_matrix[f][t], status="UP")
            )
    return routes

# --- 1. Contention Test: Baseline FAILS, Optimized WINS ---
def test_contention_baseline_fails_optimized_wins():
    routes = get_complete_symmetric_routes()

    # R1: At H1, needs A+ Red Cells (accepts A+ or O+). Urgency: CRITICAL
    # R2: At H4, needs O+ Red Cells (ONLY accepts O+). Urgency: URGENT
    r1 = RequestSnapshot(
        id="R-CONTEND-1", hospitalId="H1", component="RED_CELLS", group="A+",
        unitsNeeded=1, neededBy=NOW + timedelta(hours=2), urgency="CRITICAL"
    )
    r2 = RequestSnapshot(
        id="R-CONTEND-2", hospitalId="H4", component="RED_CELLS", group="O+",
        unitsNeeded=1, neededBy=NOW + timedelta(hours=3), urgency="URGENT"
    )

    # U1: O+ unit at H1. Near to R1 (5m transit), can also reach H4 (30m + 15m = 45m).
    u1_o_pos = UnitSnapshot(
        id="U-CONTEND-O1", component="RED_CELLS", group="O+", hospitalId="H1",
        collectedAt=NOW - timedelta(days=5), expiresAt=NOW + timedelta(days=20), status="AVAILABLE"
    )
    # U2: A+ unit at H2. Transit to H1 is 25m + 15m = 40m. INCOMPATIBLE with R2!
    u2_a_pos = UnitSnapshot(
        id="U-CONTEND-A2", component="RED_CELLS", group="A+", hospitalId="H2",
        collectedAt=NOW - timedelta(days=5), expiresAt=NOW + timedelta(days=20), status="AVAILABLE"
    )

    req_base = PlanRequest(
        units=[u1_o_pos, u2_a_pos], requests=[r1, r2], routes=routes, now=NOW, mode="baseline"
    )
    res_base = solve_baseline(req_base)

    req_opt = PlanRequest(
        units=[u1_o_pos, u2_a_pos], requests=[r1, r2], routes=routes, now=NOW, mode="optimized"
    )
    res_opt = solve_optimized(req_opt)

    # Baseline's greedy nearest choice for R1 takes U1 (5m < 40m), leaving R2 with NO compatible unit!
    assert res_base.assignments[0].allocated_unit_ids == ["U-CONTEND-O1"]
    assert res_base.assignments[1].allocated_unit_ids == []
    assert res_base.metrics.satisfied == 1
    assert res_base.metrics.unfulfilled == 1

    # Optimized global solver assigns U2 to R1 and U1 to R2, satisfying BOTH requests!
    assert res_opt.assignments[0].allocated_unit_ids == ["U-CONTEND-A2"]
    assert res_opt.assignments[1].allocated_unit_ids == ["U-CONTEND-O1"]
    assert res_opt.metrics.satisfied == 2
    assert res_opt.metrics.unfulfilled == 0

    # Key assertion: Optimized strictly outperforms Baseline
    assert res_opt.metrics.satisfied > res_base.metrics.satisfied

# --- 2. Scarcity Tests ---
def test_scarcity_critical_beats_urgent_for_last_unit():
    routes = get_complete_symmetric_routes()

    # Only 1 scarce unit exists
    u1 = UnitSnapshot(
        id="U-SCARCE-1", component="RED_CELLS", group="O-", hospitalId="H1",
        collectedAt=NOW - timedelta(days=5), expiresAt=NOW + timedelta(days=10), status="AVAILABLE"
    )

    # 1 CRITICAL request and 1 URGENT request compete for U-SCARCE-1
    r_crit = RequestSnapshot(
        id="R-CRIT", hospitalId="H1", component="RED_CELLS", group="O-",
        unitsNeeded=1, neededBy=NOW + timedelta(hours=2), urgency="CRITICAL"
    )
    r_urg = RequestSnapshot(
        id="R-URG", hospitalId="H1", component="RED_CELLS", group="O-",
        unitsNeeded=1, neededBy=NOW + timedelta(hours=2), urgency="URGENT"
    )

    for solver, mode_name in [(solve_baseline, "baseline"), (solve_optimized, "optimized")]:
        plan_req = PlanRequest(
            units=[u1], requests=[r_crit, r_urg], routes=routes, now=NOW, mode=mode_name
        )
        res = solver(plan_req)

        # CRITICAL must get the unit
        crit_assign = next(a for a in res.assignments if a.request_id == "R-CRIT")
        assert crit_assign.allocated_unit_ids == ["U-SCARCE-1"]
        assert crit_assign.is_complete is True

        # URGENT must be unfulfilled
        urg_assign = next(a for a in res.assignments if a.request_id == "R-URG")
        assert urg_assign.allocated_unit_ids == []
        assert urg_assign.is_complete is False

        # URGENT lands in unfulfilled with reasons
        assert any(u.request_id == "R-URG" for u in res.unfulfilled)

        # Metrics verification
        assert res.metrics.satisfied == 1
        assert res.metrics.partial == 0
        assert res.metrics.unfulfilled == 1

def test_partial_fulfillment_three_needed_two_available():
    routes = get_complete_symmetric_routes()

    # 2 units available
    u1 = UnitSnapshot(
        id="U-PART-1", component="RED_CELLS", group="A+", hospitalId="H1",
        collectedAt=NOW - timedelta(days=5), expiresAt=NOW + timedelta(days=10), status="AVAILABLE"
    )
    u2 = UnitSnapshot(
        id="U-PART-2", component="RED_CELLS", group="A+", hospitalId="H1",
        collectedAt=NOW - timedelta(days=5), expiresAt=NOW + timedelta(days=10), status="AVAILABLE"
    )

    # Request needs 3 units
    r_three = RequestSnapshot(
        id="R-NEED-3", hospitalId="H1", component="RED_CELLS", group="A+",
        unitsNeeded=3, neededBy=NOW + timedelta(hours=4), urgency="URGENT"
    )

    for solver, mode_name in [(solve_baseline, "baseline"), (solve_optimized, "optimized")]:
        plan_req = PlanRequest(
            units=[u1, u2], requests=[r_three], routes=routes, now=NOW, mode=mode_name
        )
        res = solver(plan_req)

        assert len(res.assignments) == 1
        assign = res.assignments[0]
        # Partial fulfillment: 2 allocated, isComplete is False
        assert set(assign.allocated_unit_ids) == {"U-PART-1", "U-PART-2"}
        assert assign.is_complete is False

        # Lands in unfulfilled list citing shortfall
        assert len(res.unfulfilled) == 1
        assert res.unfulfilled[0].request_id == "R-NEED-3"

        # Metrics: partial = 1, satisfied = 0, unfulfilled = 0
        assert res.metrics.satisfied == 0
        assert res.metrics.partial == 1
        assert res.metrics.unfulfilled == 0

# --- 3. Explanation Text Formatting Tests ---
def test_explanation_formatting_helpers():
    routes = get_complete_symmetric_routes()

    # Margin formatting > 48h
    margin_minutes = 25 * 24 * 60 + 15 * 60  # 25 days 15 hours
    assert format_expiry_margin(margin_minutes) == "25d 15h"

    # Margin formatting < 48h
    assert format_expiry_margin(300) == "5h 0m"
    assert format_expiry_margin(45) == "45m"

    # Local stock explanation test (source == destination)
    u_local = UnitSnapshot(
        id="U-LOCAL-1", component="RED_CELLS", group="O-", hospitalId="H1",
        collectedAt=NOW - timedelta(days=5), expiresAt=NOW + timedelta(days=25), status="AVAILABLE"
    )
    r_local = RequestSnapshot(
        id="R-LOCAL-1", hospitalId="H1", component="RED_CELLS", group="O-",
        unitsNeeded=1, neededBy=NOW + timedelta(hours=2), urgency="CRITICAL"
    )
    plan_req = PlanRequest(
        units=[u_local], requests=[r_local], routes=routes, now=NOW, mode="optimized"
    )
    res = solve_optimized(plan_req)
    explanation = res.assignments[0].explanation
    assert "Local stock at Pink City General, no transfer needed" in explanation
    assert "24d 23h" in explanation  # Formatted margin > 48h (25d minus 5m transit)

# --- 4. Route Matrix Completeness and Symmetry ---
def test_route_matrix_completeness_and_symmetry():
    routes = get_complete_symmetric_routes()
    hospital_ids = ["H1", "H2", "H3", "H4", "H5"]

    # All 5 x 5 = 25 routes must exist
    assert len(routes) == 25

    route_map = {(r.from_id, r.to_id): r for r in routes}

    for f in hospital_ids:
        for t in hospital_ids:
            # Directed pair must exist
            assert (f, t) in route_map, f"Missing route from {f} to {t}"
            # Reverse pair must exist with identical baseMinutes (symmetry)
            assert (t, f) in route_map, f"Missing reverse route from {t} to {f}"
            assert route_map[(f, t)].base_minutes == route_map[(t, f)].base_minutes, (
                f"Asymmetric route between {f} and {t}: {route_map[(f, t)].base_minutes} != {route_map[(t, f)].base_minutes}"
            )

# --- 5. Seeded Data Optimality & R-102/R-105 Contention Tests ---
def test_seeded_data_optimized_satisfied_gte_baseline():
    snapshot_path = Path(__file__).parent / "seed_snapshot.json"
    assert snapshot_path.exists(), "seed_snapshot.json must exist in tests directory"

    with open(snapshot_path, "r") as f:
        data = json.load(f)

    now = datetime.fromisoformat(data["now"].replace("Z", "+00:00") if "Z" in data["now"] else data["now"])
    units = [
        UnitSnapshot(
            id=u["id"],
            component=u["component"],
            group=u["group"],
            hospitalId=u["hospitalId"],
            collectedAt=datetime.fromisoformat(u["collectedAt"].replace("Z", "+00:00") if "Z" in u["collectedAt"] else u["collectedAt"]),
            expiresAt=datetime.fromisoformat(u["expiresAt"].replace("Z", "+00:00") if "Z" in u["expiresAt"] else u["expiresAt"]),
            status=u["status"]
        ) for u in data["units"]
    ]
    requests = [
        RequestSnapshot(
            id=r["id"],
            hospitalId=r["hospitalId"],
            component=r["component"],
            group=r["group"],
            unitsNeeded=r["unitsNeeded"],
            neededBy=datetime.fromisoformat(r["neededBy"].replace("Z", "+00:00") if "Z" in r["neededBy"] else r["neededBy"]),
            urgency=r["urgency"],
            status=r["status"]
        ) for r in data["requests"]
    ]
    routes = [
        RouteSnapshot(
            fromId=rt["fromId"],
            toId=rt["toId"],
            baseMinutes=rt["baseMinutes"],
            status=rt["status"],
            delayMinutes=rt.get("delayMinutes", 0)
        ) for rt in data["routes"]
    ]

    req_base = PlanRequest(units=units, requests=requests, routes=routes, now=now, mode="baseline")
    res_base = solve_baseline(req_base)

    req_opt = PlanRequest(units=units, requests=requests, routes=routes, now=now, mode="optimized")
    res_opt = solve_optimized(req_opt)

    # Core assertion: Optimized must satisfy at least as many requests as baseline (6 >= 5 on seeded data)
    assert res_opt.metrics.satisfied >= res_base.metrics.satisfied
    assert res_opt.metrics.satisfied == 6
    assert res_base.metrics.satisfied == 5


def test_r102_r105_contention_optimized_beats_baseline():
    routes = get_complete_symmetric_routes()

    # R-102: At H1, needs 2 units of A+ Red Cells. Urgency: URGENT
    r102 = RequestSnapshot(
        id="R-102", hospitalId="H1", component="RED_CELLS", group="A+",
        unitsNeeded=2, neededBy=NOW + timedelta(hours=4), urgency="URGENT"
    )

    # R-105: At H2, needs 1 unit of B+ Red Cells. Urgency: ROUTINE
    r105 = RequestSnapshot(
        id="R-105", hospitalId="H2", component="RED_CELLS", group="B+",
        unitsNeeded=1, neededBy=NOW + timedelta(hours=8), urgency="ROUTINE"
    )

    # U-10005: O+ unit at H1. Compatible with BOTH A+ and B+!
    u10005 = UnitSnapshot(
        id="U-10005", component="RED_CELLS", group="O+", hospitalId="H1",
        collectedAt=NOW - timedelta(days=10), expiresAt=NOW + timedelta(days=30), status="AVAILABLE"
    )

    # U-10006: A+ unit at H1. Compatible ONLY with A+!
    u10006 = UnitSnapshot(
        id="U-10006", component="RED_CELLS", group="A+", hospitalId="H1",
        collectedAt=NOW - timedelta(days=10), expiresAt=NOW + timedelta(days=30), status="AVAILABLE"
    )

    # U-10007: A+ unit at H3. Compatible ONLY with A+! (Transit H3->H1 is 20m base + 15m buffer = 35m)
    u10007 = UnitSnapshot(
        id="U-10007", component="RED_CELLS", group="A+", hospitalId="H3",
        collectedAt=NOW - timedelta(days=10), expiresAt=NOW + timedelta(days=30), status="AVAILABLE"
    )

    units = [u10005, u10006, u10007]
    requests = [r102, r105]

    req_base = PlanRequest(units=units, requests=requests, routes=routes, now=NOW, mode="baseline")
    res_base = solve_baseline(req_base)

    req_opt = PlanRequest(units=units, requests=requests, routes=routes, now=NOW, mode="optimized")
    res_opt = solve_optimized(req_opt)

    # In baseline: R-102 (URGENT) greedily takes U-10005 and U-10006 (local 5m).
    # R-105 (ROUTINE) is starved because U-10007 is incompatible with B+.
    assert res_base.assignments[0].allocated_unit_ids == ["U-10005", "U-10006"]
    assert res_base.assignments[1].allocated_unit_ids == []
    assert res_base.metrics.satisfied == 1
    assert res_base.metrics.unfulfilled == 1

    # In optimized: OR-Tools SimpleMinCostFlow globally routes U-10006 and U-10007 to R-102,
    # freeing U-10005 to fulfill R-105. Both requests are 100% satisfied!
    assert res_opt.assignments[0].allocated_unit_ids == ["U-10006", "U-10007"]
    assert res_opt.assignments[1].allocated_unit_ids == ["U-10005"]
    assert res_opt.metrics.satisfied == 2
    assert res_opt.metrics.unfulfilled == 0

    # Core assertion: Optimized strictly beats baseline on contention
    assert res_opt.metrics.satisfied > res_base.metrics.satisfied
