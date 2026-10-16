import httpx
import json
from datetime import datetime
from pymongo import MongoClient

INTERNAL_SECRET = "bloodstock-dev-secret-key-32chars-min"
OPTIMIZER_URL = "http://127.0.0.1:8000/v1/plan"

def main():
    client = MongoClient("mongodb://127.0.0.1:27017/bloodstock?replicaSet=rs0")
    db = client["bloodstock"]

    units_docs = list(db["units"].find().sort("id", 1))
    requests_docs = list(db["bloodrequests"].find().sort("id", 1))
    routes_docs = list(db["routes"].find().sort([("fromId", 1), ("toId", 1)]))
    sim_doc = db["simstates"].find_one({"key": "current"})

    now = sim_doc["virtualNow"].isoformat() if sim_doc and "virtualNow" in sim_doc else "2026-10-15T08:00:00Z"
    now_dt = datetime.fromisoformat(now.replace("Z", "+00:00") if "Z" in now else now)

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

    with httpx.Client(timeout=10.0) as http_client:
        resp_base = http_client.post(OPTIMIZER_URL, json={
            "units": units_payload, "requests": requests_payload, "routes": routes_payload, "now": now, "mode": "baseline"
        }, headers=headers).json()

        resp_opt = http_client.post(OPTIMIZER_URL, json={
            "units": units_payload, "requests": requests_payload, "routes": routes_payload, "now": now, "mode": "optimized"
        }, headers=headers).json()

    unit_dict = {u["id"]: u for u in units_payload}

    # Weights defaults
    w_transport = 10.0
    w_fefo = 5.0
    w_expiry = 2.0
    fefo_cap_hours = 72.0

    print("=========================================================================================")
    print("METRICS COMPARISON: BASELINE vs OPTIMIZED (WITH 72H FEFO CAP)")
    print("=========================================================================================")
    m_base = resp_base["metrics"]
    m_opt = resp_opt["metrics"]
    print(f"BASELINE:  Satisfied={m_base['satisfied']}/6 | Partial={m_base['partial']} | Unfulfilled={m_base['unfulfilled']} | WastedUnits={m_base['wastedUnits']} | TotalTransportMinutes={m_base['totalTransportMinutes']}m")
    print(f"OPTIMIZED: Satisfied={m_opt['satisfied']}/6 | Partial={m_opt['partial']} | Unfulfilled={m_opt['unfulfilled']} | WastedUnits={m_opt['wastedUnits']} | TotalTransportMinutes={m_opt['totalTransportMinutes']}m")

    print("\n=========================================================================================")
    print("PER-REQUEST ALLOCATION & TRANSIT TABLE (WITH CAPPED FEFO BREAKDOWN)")
    print("=========================================================================================")
    print(f"{'Req ID':<8} {'Mode':<10} {'Unit':<10} {'From':<6} {'To':<6} {'Transit':<8} {'RawExp(h)':<10} {'Cost (Tr/FEFO72/Marg/Tot)':<26}")
    print("-" * 90)

    for r in requests_payload:
        rid = r["id"]
        # Baseline
        base_assign = next((a for a in resp_base["assignments"] if a["requestId"] == rid), None)
        base_units = base_assign["allocatedUnitIds"] if base_assign else []
        if not base_units:
            print(f"{rid:<8} {'BASELINE':<10} {'UNFULFILLED':<10} {'-':<6} {r['hospitalId']:<6} {'0m':<8} {'-':<10} {'-':<26}")
        for uid in base_units:
            cand = next((c for c in base_assign["options"] if c["unitId"] == uid), None)
            u = unit_dict[uid]
            exp_dt = datetime.fromisoformat(u["expiresAt"].replace("Z", "+00:00") if "Z" in u["expiresAt"] else u["expiresAt"])
            h_exp = max(0.0, (exp_dt - now_dt).total_seconds() / 3600.0)
            fefo_h = min(h_exp, fefo_cap_hours)
            tr = cand["transitMinutes"] if cand else 0
            marg = cand["expiryMarginMinutes"] if cand else 0
            c_tr = int(round(tr * w_transport))
            c_fefo = int(round(fefo_h * w_fefo))
            c_marg = int(round((w_expiry * 1000.0) / (marg + 1)))
            tot = c_tr + c_fefo + c_marg
            print(f"{rid:<8} {'BASELINE':<10} {uid:<10} {u['hospitalId']:<6} {r['hospitalId']:<6} {f'{tr}m':<8} {f'{h_exp:.1f}h':<10} {f'{c_tr}/{c_fefo}/{c_marg} = {tot}':<26}")

        # Optimized
        opt_assign = next((a for a in resp_opt["assignments"] if a["requestId"] == rid), None)
        opt_units = opt_assign["allocatedUnitIds"] if opt_assign else []
        if not opt_units:
            print(f"{rid:<8} {'OPTIMIZED':<10} {'UNFULFILLED':<10} {'-':<6} {r['hospitalId']:<6} {'0m':<8} {'-':<10} {'-':<26}")
        for uid in opt_units:
            cand = next((c for c in opt_assign["options"] if c["unitId"] == uid), None)
            u = unit_dict[uid]
            exp_dt = datetime.fromisoformat(u["expiresAt"].replace("Z", "+00:00") if "Z" in u["expiresAt"] else u["expiresAt"])
            h_exp = max(0.0, (exp_dt - now_dt).total_seconds() / 3600.0)
            fefo_h = min(h_exp, fefo_cap_hours)
            tr = cand["transitMinutes"] if cand else 0
            marg = cand["expiryMarginMinutes"] if cand else 0
            c_tr = int(round(tr * w_transport))
            c_fefo = int(round(fefo_h * w_fefo))
            c_marg = int(round((w_expiry * 1000.0) / (marg + 1)))
            tot = c_tr + c_fefo + c_marg
            print(f"{rid:<8} {'OPTIMIZED':<10} {uid:<10} {u['hospitalId']:<6} {r['hospitalId']:<6} {f'{tr}m':<8} {f'{h_exp:.1f}h':<10} {f'{c_tr}/{c_fefo}/{c_marg} = {tot}':<26}")
        print("-" * 90)

if __name__ == "__main__":
    main()
