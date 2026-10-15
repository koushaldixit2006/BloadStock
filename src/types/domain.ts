export type BloodGroup = 'O-' | 'O+' | 'A-' | 'A+' | 'B-' | 'B+' | 'AB-' | 'AB+';

export type Component = 'RED_CELLS' | 'PLATELETS' | 'PLASMA';

export type UnitStatus = 'AVAILABLE' | 'RESERVED' | 'IN_TRANSIT' | 'EXPIRED' | 'USED';

export interface Hospital {
  id: string;
  name: string;
  shortName: string;
  coords: { x: number; y: number }; // Percentage 0-100 or SVG viewBox coordinates
  tier: 'Regional Hub' | 'General Hospital' | 'Heart Institute' | 'Care Centre' | 'Trauma Centre';
}

export interface Unit {
  id: string; // e.g. U-20481
  component: Component;
  group: BloodGroup;
  hospitalId: string;
  collectedAt: string; // ISO 8601
  expiresAt: string;   // ISO 8601
  status: UnitStatus;
  reservedForRequestId?: string;
}

export type UrgencyLevel = 'ROUTINE' | 'URGENT' | 'CRITICAL';

export type RequestStatus = 'OPEN' | 'PLANNED' | 'PARTIAL' | 'UNFULFILLED' | 'CANCELLED';

export interface BloodRequest {
  id: string; // e.g. R-1039
  hospitalId: string;
  component: Component;
  group: BloodGroup;
  unitsNeeded: number;
  neededBy: string; // ISO 8601
  urgency: UrgencyLevel;
  status: RequestStatus;
  createdAt: string; // ISO 8601
  clinicalContext?: string;
}

export type ReservationStatus = 'RESERVED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface Reservation {
  id: string; // e.g. RSV-8821
  unitId: string;
  requestId: string;
  fromHospitalId: string;
  toHospitalId: string;
  dispatchAt: string;
  eta: string;
  status: ReservationStatus;
  createdAt: string;
  transitMinutes: number;
}

export type RouteStatus = 'UP' | 'DOWN';

export interface Route {
  fromId: string;
  toId: string;
  baseMinutes: number;
  status: RouteStatus;
  delayMinutes: number;
}

export type SimEventType =
  | 'INIT'
  | 'CLOCK_ADVANCED'
  | 'RESERVATION_CREATED'
  | 'RESERVATION_CANCELLED'
  | 'RESERVATION_DISPATCHED'
  | 'RESERVATION_DELIVERED'
  | 'REQUEST_CREATED'
  | 'REQUEST_CANCELLED'
  | 'TRANSPORT_FAILURE'
  | 'TRANSPORT_RESTORED'
  | 'DEMAND_SPIKE'
  | 'NEW_STOCK'
  | 'DOUBLE_ALLOCATION_PREVENTED'
  | 'REPLAN_EXECUTED'
  | 'RESET_DATA';

export interface SimEvent {
  id: string;
  ts: string;
  type: SimEventType;
  description: string;
  payload?: Record<string, unknown>;
}

export interface PlanOption {
  unitId: string;
  fromHospitalId: string;
  toHospitalId: string;
  eta: string;
  transitMinutes: number;
  expiryMarginMinutes: number;
  feasible: boolean;
  blockingReasons: string[];
  cost: number;
  explanation: string;
  rank: number;
  unit: Unit;
}

export interface PlanAssignment {
  requestId: string;
  allocatedUnitIds: string[];
  options: PlanOption[];
  explanation: string;
  isComplete: boolean;
}

export interface PlanMetrics {
  satisfiedRequests: number;
  partialRequests: number;
  unfulfilledRequests: number;
  wastedUnits72h: number; // units expiring unused within 72h
  totalTransportMinutes: number;
  avgExpiryMarginMinutes: number;
}

export interface PlanResult {
  planType: 'baseline' | 'optimized';
  assignments: PlanAssignment[];
  unfulfilled: { requestId: string; reason: string }[];
  metrics: PlanMetrics;
  generatedAt: string;
}

export interface InvariantCheck {
  name: string;
  passed: boolean;
  details: string;
  count?: number;
}

export interface ReplanDiff {
  added: { unitId: string; requestId: string; from: string; to: string }[];
  removed: { unitId: string; requestId: string; reason: string }[];
  rerouted: { unitId: string; requestId: string; oldFrom: string; newFrom: string }[];
  unchanged: { unitId: string; requestId: string }[];
}
