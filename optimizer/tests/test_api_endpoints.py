from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from app.main import app, INTERNAL_SECRET
from app.models import UnitSnapshot, RequestSnapshot, RouteSnapshot, ReservationSnapshot

client = TestClient(app)
NOW = datetime.fromisoformat("2026-10-15T08:00:00")

def test_health_endpoint_public():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["service"] == "optimizer"

def test_protected_endpoints_require_secret_header():
    endpoints = [
        ("/v1/feasibility", {"units": [], "request": {"id": "R1", "hospitalId": "H1", "component": "RED_CELLS", "group": "O-", "neededBy": NOW.isoformat()}, "routes": [], "now": NOW.isoformat()}),
        ("/v1/plan", {"units": [], "requests": [], "routes": [], "now": NOW.isoformat(), "mode": "optimized"}),
        ("/v1/validate", {"reservations": [], "units": [], "requests": [], "routes": [], "now": NOW.isoformat()}),
    ]

    for path, payload in endpoints:
        # Without header -> 401
        res = client.post(path, json=payload)
        assert res.status_code == 401, f"Endpoint {path} did not return 401 without secret header"
        assert "Invalid or missing X-Internal-Secret header" in res.json()["detail"]

        # With wrong header -> 401
        res_wrong = client.post(path, json=payload, headers={"X-Internal-Secret": "wrong-secret"})
        assert res_wrong.status_code == 401

        # With correct header -> 200 OK
        res_auth = client.post(path, json=payload, headers={"X-Internal-Secret": INTERNAL_SECRET})
        assert res_auth.status_code == 200, f"Endpoint {path} failed with valid secret header: {res_auth.text}"

def test_feasibility_endpoint_response_shape_and_blocking_reasons():
    # 1 feasible unit, 1 incompatible unit, 1 expired unit
    u_feasible = {
        "id": "U-FEASIBLE", "component": "RED_CELLS", "group": "O-", "hospitalId": "H1",
        "collectedAt": (NOW - timedelta(days=5)).isoformat(),
        "expiresAt": (NOW + timedelta(days=20)).isoformat(),
        "status": "AVAILABLE"
    }
    u_incompat = {
        "id": "U-INCOMPAT", "component": "RED_CELLS", "group": "A+", "hospitalId": "H1",
        "collectedAt": (NOW - timedelta(days=5)).isoformat(),
        "expiresAt": (NOW + timedelta(days=20)).isoformat(),
        "status": "AVAILABLE"
    }
    u_expired = {
        "id": "U-EXPIRED", "component": "RED_CELLS", "group": "O-", "hospitalId": "H1",
        "collectedAt": (NOW - timedelta(days=40)).isoformat(),
        "expiresAt": (NOW - timedelta(minutes=10)).isoformat(),
        "status": "AVAILABLE"
    }

    req = {
        "id": "R-TEST", "hospitalId": "H1", "component": "RED_CELLS", "group": "O-",
        "unitsNeeded": 1, "neededBy": (NOW + timedelta(hours=3)).isoformat(),
        "urgency": "CRITICAL", "status": "OPEN"
    }
    routes = [
        {"fromId": "H1", "toId": "H1", "baseMinutes": 5, "status": "UP", "delayMinutes": 0}
    ]

    payload = {
        "units": [u_feasible, u_incompat, u_expired],
        "request": req,
        "routes": routes,
        "now": NOW.isoformat()
    }

    res = client.post("/v1/feasibility", json=payload, headers={"X-Internal-Secret": INTERNAL_SECRET})
    assert res.status_code == 200
    candidates = res.json()
    assert isinstance(candidates, list)
    assert len(candidates) == 3

    cand_map = {c["unitId"]: c for c in candidates}

    # Verify response shape keys
    for c in candidates:
        assert "unitId" in c
        assert "feasible" in c
        assert "blockingReasons" in c
        assert "eta" in c
        assert "expiryMarginMinutes" in c
        assert "transitMinutes" in c
        assert "fromHospitalId" in c
        assert "toHospitalId" in c

    # Assert Feasible unit
    assert cand_map["U-FEASIBLE"]["feasible"] is True
    assert len(cand_map["U-FEASIBLE"]["blockingReasons"]) == 0

    # Assert Incompatible unit
    assert cand_map["U-INCOMPAT"]["feasible"] is False
    assert any("Incompatible group: A+ cannot serve O-" in r for r in cand_map["U-INCOMPAT"]["blockingReasons"])

    # Assert Expired unit
    assert cand_map["U-EXPIRED"]["feasible"] is False
    assert any("Expires" in r and "before arrival" in r for r in cand_map["U-EXPIRED"]["blockingReasons"])

def test_validate_endpoint_invariants():
    unit1 = {
        "id": "U-1", "component": "RED_CELLS", "group": "O-", "hospitalId": "H1",
        "collectedAt": (NOW - timedelta(days=5)).isoformat(),
        "expiresAt": (NOW + timedelta(days=20)).isoformat(),
        "status": "AVAILABLE"
    }
    unit2 = {
        "id": "U-2", "component": "RED_CELLS", "group": "A+", "hospitalId": "H1",
        "collectedAt": (NOW - timedelta(days=5)).isoformat(),
        "expiresAt": (NOW + timedelta(minutes=25)).isoformat(),  # Expires in 25m! Violates 30m safety buffer
        "status": "AVAILABLE"
    }

    req_o_neg = {
        "id": "R-1", "hospitalId": "H1", "component": "RED_CELLS", "group": "O-",
        "unitsNeeded": 1, "neededBy": (NOW + timedelta(hours=2)).isoformat(),
        "urgency": "CRITICAL", "status": "OPEN"
    }

    routes = [
        {"fromId": "H1", "toId": "H1", "baseMinutes": 5, "status": "UP", "delayMinutes": 0}
    ]

    # Test Case 1: Valid clean reservation
    clean_payload = {
        "reservations": [
            {"id": "RSV-1", "unitId": "U-1", "requestId": "R-1", "isActive": True}
        ],
        "units": [unit1],
        "requests": [req_o_neg],
        "routes": routes,
        "now": NOW.isoformat()
    }
    res_clean = client.post("/v1/validate", json=clean_payload, headers={"X-Internal-Secret": INTERNAL_SECRET})
    assert res_clean.status_code == 200
    results = {r["name"]: r["passed"] for r in res_clean.json()}
    assert results["NO_DOUBLE_ALLOCATION"] is True
    assert results["ABO_RH_COMPATIBILITY"] is True
    assert results["EXPIRY_SAFETY_MARGIN"] is True

    # Test Case 2: Double allocation violation (two active reservations for U-1)
    double_payload = {
        "reservations": [
            {"id": "RSV-1", "unitId": "U-1", "requestId": "R-1", "isActive": True},
            {"id": "RSV-2", "unitId": "U-1", "requestId": "R-1", "isActive": True}
        ],
        "units": [unit1],
        "requests": [req_o_neg],
        "routes": routes,
        "now": NOW.isoformat()
    }
    res_double = client.post("/v1/validate", json=double_payload, headers={"X-Internal-Secret": INTERNAL_SECRET})
    results_double = {r["name"]: r for r in res_double.json()}
    assert results_double["NO_DOUBLE_ALLOCATION"]["passed"] is False
    assert "U-1" in results_double["NO_DOUBLE_ALLOCATION"]["details"]

    # Test Case 3: Incompatible group (U-2 is A+, request is O-)
    incompat_payload = {
        "reservations": [
            {"id": "RSV-3", "unitId": "U-2", "requestId": "R-1", "isActive": True}
        ],
        "units": [unit2],
        "requests": [req_o_neg],
        "routes": routes,
        "now": NOW.isoformat()
    }
    res_incompat = client.post("/v1/validate", json=incompat_payload, headers={"X-Internal-Secret": INTERNAL_SECRET})
    results_incompat = {r["name"]: r for r in res_incompat.json()}
    assert results_incompat["ABO_RH_COMPATIBILITY"]["passed"] is False
    assert "U-2 (A+) -> R-1 (O-)" in results_incompat["ABO_RH_COMPATIBILITY"]["details"]

    # Test Case 4: Insufficient expiry margin (U-2 expires in 25 min, required >= 30 min)
    assert results_incompat["EXPIRY_SAFETY_MARGIN"]["passed"] is False
