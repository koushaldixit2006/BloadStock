import json
import httpx
from datetime import datetime
from pymongo import MongoClient

INTERNAL_SECRET = "bloodstock-dev-secret-key-32chars-min"
OPTIMIZER_URL = "http://127.0.0.1:8000/v1/plan"

def main():
    # 1. Fetch seed snapshot from MongoDB
    client = MongoClient("mongodb://127.0.0.1:27017/bloodstock?replicaSet=rs0")
    db = client["bloodstock"]

    units_docs = list(db["units"].find().sort("id", 1))
    requests_docs = list(db["bloodrequests"].find().sort("id", 1))
    routes_docs = list(db["routes"].find().sort([("fromId", 1), ("toId", 1)]))
    sim_doc = db["simstates"].find_one({"key": "current"})

    now = sim_doc["virtualNow"].isoformat() if sim_doc and "virtualNow" in sim_doc else "2026-10-15T08:00:00Z"

    units_payload = [
        {
            "id": u["id"],
            "component": u["component"],
            "group": u["group"],
            "hospitalId": u["hospitalId"],
            "collectedAt": u["collectedAt"].isoformat() if isinstance(u["collectedAt"], datetime) else u["collectedAt"],
            "expiresAt": u["expiresAt"].isoformat() if isinstance(u["expiresAt"], datetime) else u["expiresAt"],
            "status": u["status"]
        } for u in units_docs
    ]

    requests_payload = [
        {
            "id": r["id"],
            "hospitalId": r["hospitalId"],
            "component": r["component"],
            "group": r["group"],
            "unitsNeeded": r["unitsNeeded"],
            "neededBy": r["neededBy"].isoformat() if isinstance(r["neededBy"], datetime) else r["neededBy"],
            "urgency": r["urgency"],
            "status": r["status"]
        } for r in requests_docs
    ]

    routes_payload = [
        {
            "fromId": rt["fromId"],
            "toId": rt["toId"],
            "baseMinutes": rt["baseMinutes"],
            "status": rt["status"],
            "delayMinutes": rt.get("delayMinutes", 0)
        } for rt in routes_docs
    ]

    headers = {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET
    }

    # 2. Call POST /v1/plan with mode="baseline"
    payload_baseline = {
        "units": units_payload,
        "requests": requests_payload,
        "routes": routes_payload,
        "now": now,
        "mode": "baseline"
    }
    with httpx.Client(timeout=10.0) as http_client:
        resp_base = http_client.post(OPTIMIZER_URL, json=payload_baseline, headers=headers)
        assert resp_base.status_code == 200, f"Baseline call failed: {resp_base.status_code} {resp_base.text}"
        data_base = resp_base.json()

    # 3. Call POST /v1/plan with mode="optimized"
    payload_optimized = {
        "units": units_payload,
        "requests": requests_payload,
        "routes": routes_payload,
        "now": now,
        "mode": "optimized"
    }
    with httpx.Client(timeout=10.0) as http_client:
        resp_opt = http_client.post(OPTIMIZER_URL, json=payload_optimized, headers=headers)
        assert resp_opt.status_code == 200, f"Optimized call failed: {resp_opt.status_code} {resp_opt.text}"
        data_opt = resp_opt.json()

    # 4. Print Results
    m_base = data_base["metrics"]
    m_opt = data_opt["metrics"]

    # Extract allocations for R-102 and R-105
    r102_base = next((a["allocatedUnitIds"] for a in data_base["assignments"] if a["requestId"] == "R-102"), [])
    r105_base = next((a["allocatedUnitIds"] for a in data_base["assignments"] if a["requestId"] == "R-105"), [])

    r102_opt = next((a["allocatedUnitIds"] for a in data_opt["assignments"] if a["requestId"] == "R-102"), [])
    r105_opt = next((a["allocatedUnitIds"] for a in data_opt["assignments"] if a["requestId"] == "R-105"), [])

    print("================================================================================")
    print("HTTP POST /v1/plan - EVALUATION ON SEED DATA (6 Requests, 122 Units, 25 Routes)")
    print("================================================================================")
    print(f"Timestamp Reference (Now): {now}\n")

    print("--- BASELINE MODE (Greedy Nearest First) ---")
    print(f"Source:                 {data_base['source']}")
    print(f"Satisfied Requests:     {m_base['satisfied']} / {len(requests_payload)}")
    print(f"Partial Requests:       {m_base['partial']}")
    print(f"Unfulfilled Requests:   {m_base['unfulfilled']}")
    print(f"Wasted Units (<=72h):   {m_base['wastedUnits']}")
    print(f"Total Transport Mins:   {m_base['totalTransportMinutes']} min")
    print(f"Avg Expiry Margin:      {m_base['avgExpiryMarginMinutes']} min")
    print(f"R-102 Allocated Units:  {r102_base}")
    print(f"R-105 Allocated Units:  {r105_base}")
    if data_base["unfulfilled"]:
        print(f"Unfulfilled details:    {data_base['unfulfilled']}")

    print("\n--- OPTIMIZED MODE (OR-Tools SimpleMinCostFlow) ---")
    print(f"Source:                 {data_opt['source']}")
    print(f"Satisfied Requests:     {m_opt['satisfied']} / {len(requests_payload)}")
    print(f"Partial Requests:       {m_opt['partial']}")
    print(f"Unfulfilled Requests:   {m_opt['unfulfilled']}")
    print(f"Wasted Units (<=72h):   {m_opt['wastedUnits']}")
    print(f"Total Transport Mins:   {m_opt['totalTransportMinutes']} min")
    print(f"Avg Expiry Margin:      {m_opt['avgExpiryMarginMinutes']} min")
    print(f"R-102 Allocated Units:  {r102_opt}")
    print(f"R-105 Allocated Units:  {r105_opt}")
    if data_opt["unfulfilled"]:
        print(f"Unfulfilled details:    {data_opt['unfulfilled']}")

    print("\n================================================================================")
    print(f"COMPARISON ASSERTION: optimized.satisfied ({m_opt['satisfied']}) > baseline.satisfied ({m_base['satisfied']})")
    assert m_opt["satisfied"] > m_base["satisfied"], f"Assertion Failed: {m_opt['satisfied']} <= {m_base['satisfied']}"
    print("RESULT: SUCCESS - Global Min-Cost Flow solver achieves superior fulfillment!")
    print("================================================================================")

if __name__ == "__main__":
    main()
