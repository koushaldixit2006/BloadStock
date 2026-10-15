import { describe, expect, it } from 'vitest';
import { generateSeedRequests, generateSeedUnits, INITIAL_SIM_TIME } from '../data/seed';
import { createInitialRoutes } from '../data/transportMatrix';
import { FeasibilityContext } from '../engine/feasibility';
import { planBaseline, planOptimized } from '../engine/planner';

describe('Planning Engines (Baseline vs Optimized)', () => {
  const routes = createInitialRoutes();
  const ctx: FeasibilityContext = { now: INITIAL_SIM_TIME, routes };
  const units = generateSeedUnits(INITIAL_SIM_TIME);
  const requests = generateSeedRequests(INITIAL_SIM_TIME);

  it('Critical O- platelet request (R-101) picks the farther feasible hospital', () => {
    // R-101 is at Sawai Care (H4), requesting 1x O- PLATELETS needed in 2 hours
    // Near unit at Pink City (H1) expires in 35 min and arrives after expiry.
    // Farther unit at Rampura (H5) is 50 min away and expires in 28 hours.
    const baselinePlan = planBaseline(units, requests, ctx);
    const optimizedPlan = planOptimized(units, requests, ctx);

    const baselineR101 = baselinePlan.assignments.find((a) => a.requestId === 'R-101');
    const optimizedR101 = optimizedPlan.assignments.find((a) => a.requestId === 'R-101');

    expect(baselineR101).toBeDefined();
    expect(optimizedR101).toBeDefined();

    expect(baselineR101?.allocatedUnitIds).toHaveLength(1);
    expect(optimizedR101?.allocatedUnitIds).toHaveLength(1);

    // Both should allocate the feasible unit (U-10002 at H5) and reject U-10001 (which expires)
    expect(baselineR101?.allocatedUnitIds[0]).toBe('U-10002');
    expect(optimizedR101?.allocatedUnitIds[0]).toBe('U-10002');

    // Source hospital must be H5 (Rampura Trauma Centre, 50 min transit), not H1
    expect(baselineR101?.options[0].fromHospitalId).toBe('H5');
    expect(optimizedR101?.options[0].fromHospitalId).toBe('H5');
  });

  it('neither baseline nor optimized planner ever double-allocates a unit', () => {
    const baselinePlan = planBaseline(units, requests, ctx);
    const optimizedPlan = planOptimized(units, requests, ctx);

    const checkNoDoubleAllocation = (assignments: typeof baselinePlan.assignments) => {
      const seenUnits = new Set<string>();
      for (const a of assignments) {
        for (const uId of a.allocatedUnitIds) {
          expect(seenUnits.has(uId)).toBe(false);
          seenUnits.add(uId);
        }
      }
    };

    checkNoDoubleAllocation(baselinePlan.assignments);
    checkNoDoubleAllocation(optimizedPlan.assignments);
  });

  it('optimized plan is never worse than baseline on satisfied requests for the seed data', () => {
    const baselinePlan = planBaseline(units, requests, ctx);
    const optimizedPlan = planOptimized(units, requests, ctx);

    expect(optimizedPlan.metrics.satisfiedRequests).toBeGreaterThanOrEqual(
      baselinePlan.metrics.satisfiedRequests
    );
    expect(optimizedPlan.metrics.unfulfilledRequests).toBeLessThanOrEqual(
      baselinePlan.metrics.unfulfilledRequests
    );
  });

  it('all assigned units across both plans satisfy expiry safety margin', () => {
    const baselinePlan = planBaseline(units, requests, ctx);
    const optimizedPlan = planOptimized(units, requests, ctx);

    for (const a of baselinePlan.assignments) {
      for (const opt of a.options) {
        expect(opt.expiryMarginMinutes).toBeGreaterThanOrEqual(0);
      }
    }

    for (const a of optimizedPlan.assignments) {
      for (const opt of a.options) {
        expect(opt.expiryMarginMinutes).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
