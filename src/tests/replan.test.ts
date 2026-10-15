import { describe, expect, it } from 'vitest';
import { generateSeedRequests, generateSeedUnits, INITIAL_SIM_TIME } from '../data/seed';
import { createInitialRoutes } from '../data/transportMatrix';
import { addMinutesToIso } from '../engine/clock';
import { executeReplan, ReplanState } from '../engine/replan';
import { Reservation } from '../types/domain';

describe('Replanning Engine and Invariant Enforcement', () => {
  const routes = createInitialRoutes();
  const baseTime = INITIAL_SIM_TIME;
  const units = generateSeedUnits(baseTime);
  const requests = generateSeedRequests(baseTime);

  // Set up an active state with an IN_TRANSIT reservation and a RESERVED reservation
  const inTransitRsv: Reservation = {
    id: 'RSV-IN-TRANSIT',
    unitId: 'U-10003',
    requestId: 'R-102',
    fromHospitalId: 'H2',
    toHospitalId: 'H1',
    dispatchAt: addMinutesToIso(baseTime, -10),
    eta: addMinutesToIso(baseTime, 20),
    status: 'IN_TRANSIT',
    createdAt: addMinutesToIso(baseTime, -25),
    transitMinutes: 25,
  };

  const reservedRsv: Reservation = {
    id: 'RSV-NORMAL',
    unitId: 'U-10004',
    requestId: 'R-103',
    fromHospitalId: 'H1',
    toHospitalId: 'H5',
    dispatchAt: addMinutesToIso(baseTime, 15),
    eta: addMinutesToIso(baseTime, 50),
    status: 'RESERVED',
    createdAt: baseTime,
    transitMinutes: 35,
  };

  const initialState: ReplanState = {
    units: units.map((u) => {
      if (u.id === inTransitRsv.unitId) return { ...u, status: 'IN_TRANSIT' as const };
      if (u.id === reservedRsv.unitId) return { ...u, status: 'RESERVED' as const, reservedForRequestId: reservedRsv.requestId };
      return u;
    }),
    requests,
    reservations: [inTransitRsv, reservedRsv],
    routes,
    simTime: baseTime,
  };

  it('preserves IN_TRANSIT reservation across TRANSPORT_FAILURE and all invariants pass', () => {
    // Break the route H2 -> H1 that the in-transit reservation is on
    const result = executeReplan(initialState, {
      type: 'TRANSPORT_FAILURE',
      params: {
        fromId: 'H2',
        toId: 'H1',
        action: 'SET_DOWN',
      },
    });

    expect(result.success).toBe(true);
    expect(result.invariants.every((i) => i.passed)).toBe(true);

    // IN_TRANSIT reservation must remain locked and unchanged!
    const inTransit = result.nextState.reservations.find((r) => r.id === inTransitRsv.id);
    expect(inTransit).toBeDefined();
    expect(inTransit?.status).toBe('IN_TRANSIT');
  });

  it('handles DEMAND_SPIKE scenario and satisfies invariants', () => {
    const result = executeReplan(initialState, {
      type: 'DEMAND_SPIKE',
      params: {
        hospitalId: 'H5',
        component: 'RED_CELLS',
        group: 'O-',
        unitsNeeded: 2,
        urgency: 'CRITICAL',
        minutesNeededIn: 60,
        clinicalContext: 'Mass casualty trauma incoming.',
      },
    });

    expect(result.success).toBe(true);
    expect(result.invariants.every((i) => i.passed)).toBe(true);
    expect(result.nextState.requests.length).toBe(initialState.requests.length + 1);
  });

  it('handles CANCELLATION scenario, releases units and satisfies invariants', () => {
    const result = executeReplan(initialState, {
      type: 'CANCELLATION',
      params: {
        requestId: 'R-103',
      },
    });

    expect(result.success).toBe(true);
    expect(result.invariants.every((i) => i.passed)).toBe(true);

    // Unit U-10004 previously reserved for R-103 should now be released to AVAILABLE
    const unit10004 = result.nextState.units.find((u) => u.id === reservedRsv.unitId);
    expect(unit10004?.status).toBe('AVAILABLE');
    expect(unit10004?.reservedForRequestId).toBeUndefined();
  });

  it('handles NEW_STOCK scenario and integrates new units into network', () => {
    const result = executeReplan(initialState, {
      type: 'NEW_STOCK',
      params: {
        hospitalId: 'H4',
        component: 'PLATELETS',
        group: 'O-',
        count: 3,
        shelfLifeHours: 72,
      },
    });

    expect(result.success).toBe(true);
    expect(result.invariants.every((i) => i.passed)).toBe(true);
    expect(result.nextState.units.length).toBe(initialState.units.length + 3);
  });
});
