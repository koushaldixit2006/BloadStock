import { BloodGroup, Component, UrgencyLevel } from '../types/domain';

export type ScenarioType = 'TRANSPORT_FAILURE' | 'DEMAND_SPIKE' | 'CANCELLATION' | 'NEW_STOCK';

export interface TransportFailureParams {
  fromId: string;
  toId: string;
  action: 'SET_DOWN' | 'ADD_DELAY';
  delayMinutes?: number;
}

export interface DemandSpikeParams {
  hospitalId: string;
  component: Component;
  group: BloodGroup;
  unitsNeeded: number;
  urgency: UrgencyLevel;
  minutesNeededIn: number;
  clinicalContext?: string;
}

export interface CancellationParams {
  requestId: string;
}

export interface NewStockParams {
  hospitalId: string;
  component: Component;
  group: BloodGroup;
  count: number;
  shelfLifeHours: number;
}
