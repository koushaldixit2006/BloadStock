from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime

class UnitSnapshot(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    component: str
    group: str
    hospital_id: str = Field(alias="hospitalId")
    collected_at: datetime = Field(alias="collectedAt")
    expires_at: datetime = Field(alias="expiresAt")
    status: str
    reserved_for_request_id: Optional[str] = Field(default=None, alias="reservedForRequestId")

class RequestSnapshot(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    hospital_id: str = Field(alias="hospitalId")
    component: str
    group: str
    units_needed: int = Field(alias="unitsNeeded", default=1)
    needed_by: datetime = Field(alias="neededBy")
    urgency: Literal["ROUTINE", "URGENT", "CRITICAL"] = "ROUTINE"
    status: str = "OPEN"
    created_at: Optional[datetime] = Field(default=None, alias="createdAt")
    clinical_context: Optional[str] = Field(default=None, alias="clinicalContext")

class RouteSnapshot(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_id: str = Field(alias="fromId")
    to_id: str = Field(alias="toId")
    base_minutes: int = Field(alias="baseMinutes")
    status: Literal["UP", "DOWN"] = "UP"
    delay_minutes: int = Field(alias="delayMinutes", default=0)

class ReservationSnapshot(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = None
    unit_id: str = Field(alias="unitId")
    request_id: str = Field(alias="requestId")
    from_hospital_id: Optional[str] = Field(default=None, alias="fromHospitalId")
    to_hospital_id: Optional[str] = Field(default=None, alias="toHospitalId")
    eta: Optional[datetime] = None
    is_active: bool = Field(default=True, alias="isActive")
    status: Optional[str] = None

# --- Feasibility ---
class FeasibilityRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    units: List[UnitSnapshot]
    request: RequestSnapshot
    routes: List[RouteSnapshot]
    now: datetime

class FeasibilityCandidate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    unit_id: str = Field(alias="unitId")
    feasible: bool
    blocking_reasons: List[str] = Field(alias="blockingReasons", default_factory=list)
    eta: datetime
    expiry_margin_minutes: int = Field(alias="expiryMarginMinutes")
    transit_minutes: int = Field(alias="transitMinutes")
    from_hospital_id: str = Field(alias="fromHospitalId")
    to_hospital_id: str = Field(alias="toHospitalId")

# --- Planning ---
class PlanWeights(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    w_transport: float = Field(default=10.0, alias="wTransport")
    w_fefo: float = Field(default=5.0, alias="wFefo")
    w_expiry_penalty: float = Field(default=2.0, alias="wExpiryPenalty")
    w_unfilled_critical: float = Field(default=1000000.0, alias="wUnfilledCritical")
    w_unfilled_urgent: float = Field(default=500000.0, alias="wUnfilledUrgent")
    w_unfilled_routine: float = Field(default=100000.0, alias="wUnfilledRoutine")
    fefo_cap_hours: float = Field(default=72.0, alias="fefoCapHours")

class PlanRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    units: List[UnitSnapshot]
    requests: List[RequestSnapshot]
    routes: List[RouteSnapshot]
    now: datetime
    mode: Literal["baseline", "optimized"] = "optimized"
    weights: Optional[PlanWeights] = None

class PlanAssignment(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    request_id: str = Field(alias="requestId")
    allocated_unit_ids: List[str] = Field(alias="allocatedUnitIds", default_factory=list)
    options: List[FeasibilityCandidate] = Field(default_factory=list)
    explanation: str = ""
    is_complete: bool = Field(alias="isComplete", default=False)

class UnfulfilledItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    request_id: str = Field(alias="requestId")
    reasons: List[str] = Field(default_factory=list)

class PlanMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    satisfied: int
    partial: int
    unfulfilled: int
    wasted_units: int = Field(alias="wastedUnits")
    total_transport_minutes: int = Field(alias="totalTransportMinutes")
    avg_expiry_margin_minutes: float = Field(alias="avgExpiryMarginMinutes")

class PlanResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    assignments: List[PlanAssignment]
    unfulfilled: List[UnfulfilledItem] = Field(default_factory=list)
    metrics: PlanMetrics
    source: str
    disclaimer: str = "Planning support only - not a clinical decision. Synthetic data."

# --- Validation ---
class ValidateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reservations: List[ReservationSnapshot]
    units: List[UnitSnapshot]
    requests: List[RequestSnapshot]
    routes: List[RouteSnapshot]
    now: datetime

class InvariantResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    passed: bool
    details: str
