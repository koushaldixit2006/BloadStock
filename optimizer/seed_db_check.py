import json
import httpx
from datetime import datetime
from pymongo import MongoClient
from app.models import UnitSnapshot, RequestSnapshot, RouteSnapshot, PlanRequest
from app.planner import solve_baseline, solve_optimized

def main():
    client = MongoClient("mongodb://127.0.0.1:27017/bloodstock?replicaSet=rs0")
    db = client["bloodstock"]

    units_docs = list(db["units"].find())
    requests_docs = list(db["bloodrequests"].find())
    routes_docs = list(db["routes"].find())
    sim_doc = db["simstates"].find_one({"key": "current"})

    now = sim_doc["virtualNow"] if sim_doc else datetime.fromisoformat("2026-10-15T08:00:00Z")

    units = [
        UnitSnapshot(
            id=u["id"],
            component=u["component"],
            group=u["group"],
            hospitalId=u["hospitalId"],
            collectedAt=u["collectedAt"],
            expiresAt=u["expiresAt"],
            status=u["status"]
        ) for u in units_docs
    ]

    requests = [
        RequestSnapshot(
            id=r["id"],
            hospitalId=r["hospitalId"],
            component=r["component"],
            group=r["group"],
            unitsNeeded=r["unitsNeeded"],
            neededBy=r["neededBy"],
            urgency=r["urgency"],
            status=r["status"]
        ) for r in requests_docs
    ]

    routes = [
        RouteSnapshot(
            fromId=rt["fromId"],
            toId=rt["toId"],
            baseMinutes=rt["baseMinutes"],
            status=rt["status"],
            delayMinutes=rt.get("delayMinutes", 0)
        ) for rt in routes_docs
    ]

    req_base = PlanRequest(units=units, requests=requests, routes=routes, now=now, mode="baseline")
    res_base = solve_baseline(req_base)

    req_opt = PlanRequest(units=units, requests=requests, routes=routes, now=now, mode="optimized")
    res_opt = solve_optimized(req_opt)

    print("=== SEED DATA COMPARISON ===")
    print(f"Baseline:  satisfied={res_base.metrics.satisfied}, partial={res_base.metrics.partial}, unfulfilled={res_base.metrics.unfulfilled}")
    print(f"Optimized: satisfied={res_opt.metrics.satisfied}, partial={res_opt.metrics.partial}, unfulfilled={res_opt.metrics.unfulfilled}")

if __name__ == "__main__":
    main()
