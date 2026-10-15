# BloodStock Backend — Perishable Blood Logistics & Regional Planning Engine

> **Planning Support Only** — This tool provides regional transfer planning and decision support. It does **not** make clinical decisions. All inventory, hospital network, and clinical request data are synthetic.
> Mandatory Disclaimer Header: `"Planning support only - not a clinical decision. Synthetic data."`

---

## 1. System Architecture

BloodStock backend consists of three core services orchestrated via `docker-compose`:

```
                          +-------------------------------------------------------+
                          |                   Client / Clinician                  |
                          +-------------------------------------------------------+
                                                     |
                                            HTTPS (Authenticated)
                                                     v
+---------------------------------------------------------------------------------------------------------+
| API Service (Node.js 20 + Express + Strict TypeScript)                                                   |
|                                                                                                         |
|  [Auth & RBAC: ADMIN | COORDINATOR (scoped) | VIEWER] -> [Validation (Zod)] -> [Simulation Clock]      |
|                                                                                                         |
|  [Controllers & Services]                                                                               |
|    - Recommendation Orchestrator (Circuit Breaker: 5s timeout, 1 retry, fallback)                       |
|    - Independent Rule Engine (Validates ABO/Rh group, shelf life, safety margins)                       |
|    - Atomic Unit Claim Engine (MongoDB Replica Set Transaction + Version Check)                         |
|    - Audit Logger (Cryptographic hash-chain: seq, prevHash, hash SHA256)                                |
|    - Dynamic Scenario Engine & Invariant Watchdog (Zero trust, 4 hard clinical invariants)              |
+---------------------------------------------------------------------------------------------------------+
           |                                                                      |
           | Internal HTTP (Shared Secret)                                        | Mongo Driver (ACID Transactions)
           v                                                                      v
+------------------------------------------+        +-----------------------------------------------------+
| Optimizer Service                        |        | MongoDB 7 (Single-Node Replica Set: rs0)            |
| (Python 3.11 + FastAPI + OR-Tools)       |        |                                                     |
|                                          |        | - Collections: hospitals, routes, units, requests,  |
| - Feasibility Filter (with block reason) |        |                reservations, plans, simState,       |
| - Google OR-Tools MinCostFlow Solver     |        |                audit_logs, users                    |
| - Baseline Greedy Fallback               |        | - Indexes: Partial unique on active reservations,   |
|                                          |        |            TTL on plans, idempotencyKey, compound   |
+------------------------------------------+        +-----------------------------------------------------+
           ^                                                                      ^
           |                                                                      |
           +-------------------------- /shared/rules.json ------------------------+
                             (Single Source of Truth - Synthetic)
```

1. **`api`** (Node.js 20, Express, Strict TypeScript):
   - Authentication (Argon2, rotating JWT in httpOnly cookies, RBAC).
   - Validation (Zod on all bodies, queries, and params).
   - Inventory, requests, reservations lifecycle (`RESERVED` &rarr; `IN_TRANSIT` &rarr; `DELIVERED`).
   - Transactional atomic reservation engine with idempotency and double-allocation protection.
   - Dynamic scenario engine, simulation clock, and perishability auto-expiry job.
   - Append-only cryptographic audit log with SHA-256 hash chaining.
2. **`optimizer`** (Python 3.11, FastAPI, Pydantic, Google OR-Tools):
   - Stateless optimization service.
   - Feasibility candidate evaluator returning exact clinical blocking reasons.
   - Dual planners: baseline nearest-available heuristic and global min-cost flow.
   - Protected via internal shared secret header `X-Internal-Secret`.
3. **`mongo`** (MongoDB 7):
   - Single-node replica set `rs0` supporting multi-document ACID transactions.
   - Critical partial unique index: `{ unitId: 1 }` with `{ partialFilterExpression: { isActive: true } }`.

---

## 2. Shared Clinical Rules & Trust Model

### Single Source of Truth (`/shared/rules.json`)
Both the Node API and Python Optimizer mount `/shared/rules.json`:
- **Components**: `RED_CELLS` (42-day shelf life), `PLATELETS` (5-day shelf life), `PLASMA` (30-day shelf life).
- **Safety Margin**: $30\text{ minutes}$ (arrival must precede expiration by at least 30 minutes).
- **Dispatch Buffer**: $15\text{ minutes}$ (packaging and dispatch preparation delay).
- **Compatibility**: Strict component-specific ABO and Rh(D) compatibility matrices.

### Zero-Trust Philosophy
1. **Never Trust the Optimizer**: The optimizer returns *recommendations only*. Before writing any reservation to the database, the API independently re-validates ABO/Rh compatibility, route availability, transit times, and expiry safety margins.
2. **Circuit Breaker & Fallback**: Calls to the optimizer have a 5,000ms timeout with 1 retry. If the optimizer is offline or times out, the API immediately falls back to its built-in TypeScript baseline planner and marks responses with `source: "fallback-baseline"`.
3. **Defense-in-Depth Concurrency Protection**:
   - Level 1: Atomic `findOneAndUpdate({ id: unitId, status: "AVAILABLE" }, { $set: { status: "RESERVED" }, $inc: { version: 1 } })` within a replica set transaction.
   - Level 2: Database-level unique partial index on `{ unitId: 1 }` where `{ isActive: true }`. Under concurrency contention, colliding claims receive HTTP `409 Conflict`.

---

## 3. OR-Tools Solver & Cost Function

The optimizer uses **Google OR-Tools SimpleMinCostFlow** to solve global allocation across all open requests simultaneously:
- **Supply Nodes**: Each available unit is a supply node with capacity $1$.
- **Demand Nodes**: Each open request is a demand node with capacity equal to `unitsNeeded`.
- **Infeasible Arcs Filtered**: Hard clinical constraints (incompatibility, route down, expiry before arrival) are treated as absolute filters. Infeasible edges are **never** created in the graph.
- **Unfilled Slack Arc**: An explicit overflow arc per request with a heavy penalty weighted by urgency:
  - $\text{Penalty}_{\text{CRITICAL}} = 5,000$
  - $\text{Penalty}_{\text{URGENT}} = 2,000$
  - $\text{Penalty}_{\text{ROUTINE}} = 800$
- **Edge Cost**:
  $$\text{Cost}(u, r) = \text{transitMinutes} + \text{marginPenalty} - \text{FEFO\_bonus}$$
  - $\text{marginPenalty}$: Penalizes units arriving with $< 3\text{ hours}$ expiry safety margin.
  - $\text{FEFO\_bonus}$: Encourages allocating the soonest-expiring feasible unit to eliminate waste.
  - Deterministic tie-breaking by unique unit ID.

---

## 4. Cryptographic Audit Log & Tamper Detection

All state mutations (reservations, dispatches, deliveries, cancellations, clock advances, and scenario disruptions) are recorded in an append-only audit log:
- **Fields**: `seq`, `timestamp`, `actor`, `action`, `entity`, `entityId`, `diff`, `prevHash`, `hash`.
- **Hash Formula**: $\text{hash} = \text{SHA256}(\text{prevHash} + \text{canonicalJson}(\text{payload}))$.
- **Integrity Verification**: `GET /api/v1/audit/verify` traverses the entire log from `seq: 1` to $N$. If any record or sequence is modified directly in MongoDB, the verification endpoint pinpoints the exact tampered sequence number and reason.

---

## 5. Demo Credentials

| Role | Email | Password | Scope |
|---|---|---|---|
| **ADMIN** | `admin@bloodstock.local` | `AdminPass123!` | System-wide access, scenarios, audit verification, sim clock |
| **COORDINATOR** | `coordinator1@bloodstock.local` | `CoordPass123!` | Amber Heart Institute (`H3`) — requests, recommendations, reservations |
| **VIEWER** | `viewer@bloodstock.local` | `ViewerPass123!` | Read-only observer across all hospitals |

---

## 6. Setup & Execution

### Prerequisites
- Node.js 20+
- Python 3.11+
- MongoDB 7 running as a single-node replica set `rs0` on port 27017 (or Docker Compose)

### Running with Docker Compose
```bash
docker compose up --build -d
docker compose ps
```

### Running Locally (Native Background Tasks)
```bash
# 1. Start MongoDB Replica Set
cd api && npm run mongo:local

# 2. Seed Database
cd api && npm run seed

# 3. Start Optimizer Service
cd optimizer && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 4. Start API Service
cd api && npm run dev
```

### Running Test Suites
```bash
# Run API Jest test suite (9 suites, 38 tests including 50-request concurrency race)
cd api && npm test

# Run Optimizer Pytest suite (21 tests)
cd optimizer && python -m pytest -v
```

---

## 7. End-to-End Verification Walkthrough (cURL / PowerShell)

### Step 1: Coordinator Login
```powershell
$login = curl.exe -s -X POST http://localhost:3001/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"coordinator1@bloodstock.local","password":"CoordPass123!"}' | ConvertFrom-Json

$token = $login.accessToken
Write-Host "Logged in as:" $login.user.name
```

### Step 2: Create Critical Request at Amber Heart (H3)
```powershell
$req = curl.exe -s -X POST http://localhost:3001/api/v1/requests `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{"hospitalId":"H3","component":"PLATELETS","group":"O-","unitsNeeded":1,"neededBy":"2026-10-15T10:00:00.000Z","urgency":"CRITICAL"}' | ConvertFrom-Json

$requestId = $req.id
Write-Host "Created Request:" $requestId
```

### Step 3: Get Recommendations (Hero Scenario)
```powershell
curl.exe -s -X POST "http://localhost:3001/api/v1/requests/$requestId/recommendations" `
  -H "Authorization: Bearer $token"
```
*Observe*: Nearest unit `U-10001` at Pink City is marked **infeasible** with exact reason: `"Expires 5 min before arrival"`. Farther feasible unit `U-10002` from Rampura is recommended with explanation and disclaimer.

### Step 4: Commit Recommendation
```powershell
$planId = "PLAN-..." # from step 3
$commit = curl.exe -s -X POST http://localhost:3001/api/v1/reservations/commit `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{`"planId`":`"$planId`",`"idempotencyKey`":`"demo-key-1`"}"

Write-Host "Reservation Result:" $commit
```

### Step 5: Double-Booking Prevention (409 Conflict)
```powershell
# Attempting to commit the same plan again without idempotency key returns 409 Conflict
curl.exe -s -X POST http://localhost:3001/api/v1/reservations/commit `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{`"planId`":`"$planId`"}"
```

### Step 6: Verify Cryptographic Audit Chain
```powershell
curl.exe -s http://localhost:3001/api/v1/audit/verify
# Output: {"valid":true,"totalVerified":5}
```

### Step 7: Swagger UI API Documentation
Open `http://localhost:3001/docs` in your browser to interact with the interactive OpenAPI 3.0 documentation.
