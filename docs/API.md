# BloodStock API Contract & Frontend Integration Guide

This guide describes how the BloodStock frontend prototype connects to the backend services.

## Overview
- **Base URL**: `http://localhost:3001/api/v1`
- **CORS**: Configured for `http://localhost:5173` with credentials support (`include`).
- **Authentication**: JWT Bearer token in `Authorization: Bearer <token>` header, with rotating refresh token stored in an `httpOnly` secure cookie (`bloodstock_refresh`).
- **Disclaimer Banner**: All planning responses contain the mandatory clinical disclaimer:
  `"Planning support only - not a clinical decision. Synthetic data."`

---

## TypeScript Types
Import types from `@bloodstock/types` or directly from `api/src/types`:
```typescript
import {
  BloodGroup,
  Component,
  UrgencyLevel,
  PlanResponse,
  CommitRequest,
  CommitResponse,
  ScenarioResponse,
  InvariantResult,
} from '@bloodstock/types';
```

---

## Key Endpoints for Frontend `planningService`

### 1. Authentication
- `POST /api/v1/auth/login`
  - Body: `{ email: "coordinator1@bloodstock.local", password: "CoordPass123!" }`
  - Response (200): `{ accessToken: string, user: { id, email, role, hospitalId, name } }`
- `GET /api/v1/auth/me`
  - Headers: `Authorization: Bearer <accessToken>`
  - Response (200): Profile of currently authenticated user.

### 2. Reference & Inventory
- `GET /api/v1/hospitals`: Returns 5 fictional hospitals with coordinates.
- `GET /api/v1/routes`: Returns network route graph with status (`UP` / `DOWN`) and transit times.
- `GET /api/v1/units`: Returns blood inventory filtered by `hospitalId`, `component`, `group`, `status`, `expiresWithinHours`, `q`.
- `GET /api/v1/inventory/summary`: Inventory counts grouped by hospital, component, and group.

### 3. Blood Requests
- `GET /api/v1/requests`: Returns open and planned clinical requests.
- `POST /api/v1/requests`: Create a new request (Coordinators can only create for their assigned hospital).
- `POST /api/v1/requests/:id/cancel`: Cancel request and automatically release any reserved units.

### 4. Recommendations (Decision Support Only)
- `POST /api/v1/requests/:id/recommendations`
  - **Read-Only**: Strictly zero database mutations; does not alter blood unit statuses or create reservations.
  - Calls optimizer (with automatic fallback to TypeScript baseline if optimizer is unreachable).
  - Returns:
    - `planId`: Unique identifier for the recommendation plan.
    - `assignments`: Detailed candidate ranking for each unit needed.
    - `options`: List of candidate units with exact `blockingReasons` for infeasible units (e.g. `"Expires 5 min before arrival"`).
    - `explanation`: Human-readable justification (e.g., `"Chosen over nearer unit U-10001 because that unit expires 5 min before arrival"`).
    - `disclaimer`: `"Planning support only - not a clinical decision. Synthetic data."`

### 5. Atomic Reservation Commit
- `POST /api/v1/reservations/commit`
  - Body:
    ```json
    {
      "planId": "PLAN-A0207AF9",
      "idempotencyKey": "client-uuid-or-nanoid"
    }
    ```
  - Re-validates clinical compatibility, expiry margin $\ge 30$m, and route status server-side.
  - Atomically claims units in a MongoDB replica set transaction (`status: AVAILABLE -> RESERVED`).
  - Guaranteed double-allocation prevention via database-level unique partial index on `{ unitId: 1 }` where `{ isActive: true }`.
  - Replaying the same `idempotencyKey` returns the original result without duplicate records.

### 6. Transfer Lifecycle
- `POST /api/v1/reservations/:id/dispatch`: Move transfer to `IN_TRANSIT`. Unit remains locked (`isActive: true`).
- `POST /api/v1/reservations/:id/deliver`: Confirm delivery. Unit becomes `USED`, `isActive` becomes `false`.
- `POST /api/v1/reservations/:id/cancel`: Cancel transfer and release unit back to `AVAILABLE`.

### 7. Scenarios & Invariant Verification
- `POST /api/v1/scenarios/transport-failure`: `{ fromId, toId, down: true }`
  - Releases affected `RESERVED` units while keeping `IN_TRANSIT` units immutable.
  - Replans open requests and returns a diff `{ added, removed, rerouted, unchanged }`.
- `GET /api/v1/invariants`: Real-time watchdog checking all 4 hard clinical and operational invariants.
- `GET /api/v1/audit/verify`: Cryptographic verification of the SHA-256 hash-chain audit log.
