import { BloodRequest, InvariantCheck, PlanResult, Reservation, Route, Unit } from '../types/domain';
import { checkInvariants } from '../engine/invariants';
import { planBaseline, planOptimized } from '../engine/planner';
import { executeReplan, ReplanExecutionResult, ReplanState } from '../engine/replan';
import {
  CancellationParams,
  DemandSpikeParams,
  NewStockParams,
  TransportFailureParams,
} from '../engine/scenarios';

/**
 * Service interface decoupling planning logic from UI components.
 * This can be backed by the pure local TS solver or an external API / solver microservice.
 */
export interface IPlanningService {
  getBaselinePlan(units: Unit[], requests: BloodRequest[], routes: Route[], simTime: string): PlanResult;
  getOptimizedPlan(units: Unit[], requests: BloodRequest[], routes: Route[], simTime: string): PlanResult;
  verifyInvariants(reservations: Reservation[], units: Unit[], requests: BloodRequest[]): InvariantCheck[];
  runScenario(
    state: ReplanState,
    scenario:
      | { type: 'TRANSPORT_FAILURE'; params: TransportFailureParams }
      | { type: 'DEMAND_SPIKE'; params: DemandSpikeParams }
      | { type: 'CANCELLATION'; params: CancellationParams }
      | { type: 'NEW_STOCK'; params: NewStockParams }
      | { type: 'MANUAL_REPLAN' }
  ): ReplanExecutionResult;
}

export class PlanningService implements IPlanningService {
  getBaselinePlan(units: Unit[], requests: BloodRequest[], routes: Route[], simTime: string): PlanResult {
    return planBaseline(units, requests, { now: simTime, routes });
  }

  getOptimizedPlan(units: Unit[], requests: BloodRequest[], routes: Route[], simTime: string): PlanResult {
    return planOptimized(units, requests, { now: simTime, routes });
  }

  verifyInvariants(reservations: Reservation[], units: Unit[], requests: BloodRequest[]): InvariantCheck[] {
    return checkInvariants({ reservations, units, requests });
  }

  runScenario(
    state: ReplanState,
    scenario:
      | { type: 'TRANSPORT_FAILURE'; params: TransportFailureParams }
      | { type: 'DEMAND_SPIKE'; params: DemandSpikeParams }
      | { type: 'CANCELLATION'; params: CancellationParams }
      | { type: 'NEW_STOCK'; params: NewStockParams }
      | { type: 'MANUAL_REPLAN' }
  ): ReplanExecutionResult {
    return executeReplan(state, scenario);
  }
}

export const planningService = new PlanningService();
