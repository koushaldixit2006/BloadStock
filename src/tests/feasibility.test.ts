import { describe, expect, it } from 'vitest';
import { createInitialRoutes } from '../data/transportMatrix';
import { addMinutesToIso } from '../engine/clock';
import { evaluateCandidate, FeasibilityContext } from '../engine/feasibility';
import { BloodRequest, Unit } from '../types/domain';

describe('Feasibility Checks & Transparency', () => {
  const baseTime = '2026-10-15T08:00:00.000Z';
  const routes = createInitialRoutes();
  const ctx: FeasibilityContext = { now: baseTime, routes };

  const validRequest: BloodRequest = {
    id: 'R-TEST',
    hospitalId: 'H1', // Pink City General
    component: 'RED_CELLS',
    group: 'O+',
    unitsNeeded: 1,
    neededBy: addMinutesToIso(baseTime, 120), // 2 hours
    urgency: 'URGENT',
    status: 'OPEN',
    createdAt: baseTime,
  };

  const validUnit: Unit = {
    id: 'U-TEST',
    component: 'RED_CELLS',
    group: 'O+',
    hospitalId: 'H1', // local
    collectedAt: addMinutesToIso(baseTime, -86400),
    expiresAt: addMinutesToIso(baseTime, 10 * 86400), // 10 days
    status: 'AVAILABLE',
  };

  it('marks a valid compatible unit as feasible with 0 blocking reasons', () => {
    const res = evaluateCandidate(validUnit, validRequest, ctx);
    expect(res.feasible).toBe(true);
    expect(res.blockingReasons).toHaveLength(0);
    expect(res.expiryMarginMinutes).toBeGreaterThan(0);
  });

  it('triggers blocking reason when unit is already reserved', () => {
    const unit: Unit = {
      ...validUnit,
      status: 'RESERVED',
      reservedForRequestId: 'R-OTHER',
    };
    const res = evaluateCandidate(unit, validRequest, ctx);
    expect(res.feasible).toBe(false);
    expect(res.blockingReasons).toContain('Already reserved for R-OTHER');
  });

  it('triggers blocking reason for incompatible blood group', () => {
    const unit: Unit = {
      ...validUnit,
      group: 'AB+', // AB+ cannot give red cells to O+
    };
    const res = evaluateCandidate(unit, validRequest, ctx);
    expect(res.feasible).toBe(false);
    expect(res.blockingReasons[0]).toMatch(/Incompatible group/);
  });

  it('triggers blocking reason when transport route is DOWN', () => {
    const downRoutes = routes.map((r) =>
      r.fromId === 'H2' && r.toId === 'H1' ? { ...r, status: 'DOWN' as const } : r
    );
    const unitAtH2: Unit = {
      ...validUnit,
      hospitalId: 'H2',
    };
    const res = evaluateCandidate(unitAtH2, validRequest, { ...ctx, routes: downRoutes });
    expect(res.feasible).toBe(false);
    expect(res.blockingReasons[0]).toMatch(/is down/);
  });

  it('triggers blocking reason when unit expires before arrival', () => {
    // Transit from H2 to H1 is 25m + 15m buffer = 40m arrival
    // If unit expires in 20m, it expires before arrival!
    const shortLifeUnit: Unit = {
      ...validUnit,
      hospitalId: 'H2',
      expiresAt: addMinutesToIso(baseTime, 20),
    };
    const res = evaluateCandidate(shortLifeUnit, validRequest, ctx);
    expect(res.feasible).toBe(false);
    expect(res.blockingReasons.some((r) => r.includes('Expires') && r.includes('before arrival'))).toBe(true);
  });

  it('triggers blocking reason when safety margin (30 min) is breached', () => {
    // Arrival from H2 to H1 is at +40m.
    // If unit expires at +50m, margin is only 10m (violates 30m safety margin requirement)
    const tightMarginUnit: Unit = {
      ...validUnit,
      hospitalId: 'H2',
      expiresAt: addMinutesToIso(baseTime, 50),
    };
    const res = evaluateCandidate(tightMarginUnit, validRequest, ctx);
    expect(res.feasible).toBe(false);
    expect(res.blockingReasons.some((r) => r.includes('safety margin threshold'))).toBe(true);
  });

  it('triggers blocking reason when ETA is after request needed-by deadline', () => {
    const tightDeadlineReq: BloodRequest = {
      ...validRequest,
      hospitalId: 'H5', // Rampura
      neededBy: addMinutesToIso(baseTime, 30), // Needs in 30m
    };
    // From H2 to H5 is 75m + 15m = 90m travel!
    const farUnit: Unit = {
      ...validUnit,
      hospitalId: 'H2',
    };
    const res = evaluateCandidate(farUnit, tightDeadlineReq, ctx);
    expect(res.feasible).toBe(false);
    expect(res.blockingReasons.some((r) => r.includes('after needed-by'))).toBe(true);
  });
});
