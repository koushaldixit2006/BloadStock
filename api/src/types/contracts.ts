export type BloodGroup = 'O-' | 'O+' | 'A-' | 'A+' | 'B-' | 'B+' | 'AB-' | 'AB+';
export type Component = 'RED_CELLS' | 'PLATELETS' | 'PLASMA';
export type UrgencyLevel = 'ROUTINE' | 'URGENT' | 'CRITICAL';
export type RequestStatus = 'OPEN' | 'PLANNED' | 'PARTIAL' | 'UNFULFILLED' | 'CANCELLED';
export type UnitStatus = 'AVAILABLE' | 'RESERVED' | 'IN_TRANSIT' | 'EXPIRED' | 'USED';
export type ReservationStatus = 'RESERVED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED' | 'EXPIRED';
export type UserRole = 'ADMIN' | 'COORDINATOR' | 'VIEWER' | 'SYSTEM';

export interface Hospital {
  id: string;
  name: string;
  shortName: string;
  coords: { x: number; y: number };
  tier: string;
}

export interface Route {
  fromId: string;
  toId: string;
  baseMinutes: number;
  status: 'UP' | 'DOWN';
  delayMinutes: number;
}

export interface Unit {
  id: string;
  component: Component;
  group: BloodGroup;
  hospitalId: string;
  collectedAt: string | Date;
  expiresAt: string | Date;
  status: UnitStatus;
  version: number;
  reservedForRequestId?: string | null;
}

export interface BloodRequest {
  id: string;
  hospitalId: string;
  component: Component;
  group: BloodGroup;
  unitsNeeded: number;
  neededBy: string | Date;
  urgency: UrgencyLevel;
  status: RequestStatus;
  clinicalContext?: string;
  createdAt: string | Date;
}

export interface Reservation {
  id: string;
  unitId: string;
  requestId: string;
  fromHospitalId: string;
  toHospitalId: string;
  dispatchAt: string | Date;
  eta: string | Date;
  transitMinutes: number;
  status: ReservationStatus;
  isActive: boolean;
  idempotencyKey?: string;
  createdAt: string | Date;
}

export interface FeasibilityOption {
  unitId: string;
  feasible: boolean;
  blockingReasons: string[];
  eta: string;
  expiryMarginMinutes: number;
  transitMinutes: number;
  fromHospitalId: string;
  toHospitalId: string;
}

export interface RecommendationAssignment {
  requestId: string;
  allocatedUnitIds: string[];
  options: FeasibilityOption[];
  explanation: string;
  isComplete: boolean;
}

export interface PlanResponse {
  planId: string;
  requestId?: string;
  mode: 'baseline' | 'optimized';
  source: string;
  assignments: RecommendationAssignment[];
  unfulfilled: Array<{ requestId: string; reasons: string[] }>;
  metrics: {
    satisfied: number;
    partial: number;
    unfulfilled: number;
    wastedUnits?: number;
    totalTransportMinutes?: number;
    avgExpiryMarginMinutes?: number;
  };
  disclaimer: string;
}

export interface CommitRequest {
  planId: string;
  assignmentIds?: string[];
  idempotencyKey?: string;
}

export interface CommitResponse {
  status: string;
  planId: string;
  reservations: Reservation[];
  isReplay: boolean;
  disclaimer: string;
}

export interface InvariantResult {
  name: string;
  passed: boolean;
  details: string;
}

export interface ScenarioDiff {
  added: Array<Record<string, unknown>>;
  removed: Array<Record<string, unknown>>;
  rerouted: Array<Record<string, unknown>>;
  unchanged: Array<Record<string, unknown>>;
}

export interface ScenarioResponse {
  scenario: string;
  diff: ScenarioDiff;
  invariants: InvariantResult[];
  plan: Record<string, unknown>;
  disclaimer: string;
}
