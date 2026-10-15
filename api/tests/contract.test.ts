import { RulesService } from '../src/services/rules.service';
import { Component, BloodGroup } from '../src/models/unit.model';

describe('Contract Test: RulesService vs Optimizer Clinical Rules', () => {
  const components: Component[] = ['RED_CELLS', 'PLATELETS', 'PLASMA'];
  const groups: BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

  it('1. Compatibility contract: 192 combinations match rules exactly', () => {
    const rawRules = RulesService.loadRules();

    for (const comp of components) {
      for (const donor of groups) {
        for (const recipient of groups) {
          const tsResult = RulesService.isCompatible(comp, donor, recipient);
          const rawExpected = rawRules.compatibility[comp][recipient]?.includes(donor) ?? false;

          expect(tsResult).toBe(rawExpected);
        }
      }
    }
  });

  it('2. Exact reason texts match optimizer on boundary cases', () => {
    const now = new Date('2026-10-15T08:00:00Z');
    const routes = [
      { fromId: 'H1', toId: 'H3', baseMinutes: 20, status: 'UP', delayMinutes: 0 },
      { fromId: 'H4', toId: 'H3', baseMinutes: 40, status: 'DOWN', delayMinutes: 0 },
      { fromId: 'H1', toId: 'H1', baseMinutes: 5, status: 'UP', delayMinutes: 0 },
    ];

    // Case A: Expires before arrival (15m buffer + 20m transit = 35m arrival; unit expires in 30m -> 5m before arrival)
    const candA = RulesService.evaluateCandidate(
      {
        id: 'U-EXP',
        component: 'PLATELETS',
        group: 'O-',
        hospitalId: 'H1',
        expiresAt: new Date(now.getTime() + 30 * 60000), // expires in 30m
        status: 'AVAILABLE',
      },
      {
        id: 'R-TEST',
        component: 'PLATELETS',
        group: 'O-',
        hospitalId: 'H3',
        neededBy: new Date(now.getTime() + 120 * 60000),
        urgency: 'CRITICAL',
      },
      routes,
      now
    );
    expect(candA.feasible).toBe(false);
    expect(candA.blockingReasons).toContain('Expires 5 min before arrival');

    // Case B: Insufficient safety margin (arrives in 35m, expires in 64m -> 29m margin < 30m safety margin)
    const candB = RulesService.evaluateCandidate(
      {
        id: 'U-MARGIN',
        component: 'PLATELETS',
        group: 'O-',
        hospitalId: 'H1',
        expiresAt: new Date(now.getTime() + 64 * 60000),
        status: 'AVAILABLE',
      },
      {
        id: 'R-TEST',
        component: 'PLATELETS',
        group: 'O-',
        hospitalId: 'H3',
        neededBy: new Date(now.getTime() + 120 * 60000),
        urgency: 'CRITICAL',
      },
      routes,
      now
    );
    expect(candB.feasible).toBe(false);
    expect(candB.blockingReasons).toContain(
      'Insufficient safety margin: arrives 29 min before expiry, requires at least 30 min'
    );

    // Case C: Arrives after needed-by (transit 35m, needed in 10m -> arrives 25 min after needed-by)
    const candC = RulesService.evaluateCandidate(
      {
        id: 'U-LATE',
        component: 'RED_CELLS',
        group: 'O-',
        hospitalId: 'H1',
        expiresAt: new Date(now.getTime() + 24 * 3600000),
        status: 'AVAILABLE',
      },
      {
        id: 'R-LATE',
        component: 'RED_CELLS',
        group: 'O-',
        hospitalId: 'H3',
        neededBy: new Date(now.getTime() + 10 * 60000),
        urgency: 'URGENT',
      },
      routes,
      now
    );
    expect(candC.feasible).toBe(false);
    expect(candC.blockingReasons).toContain('Arrives 25 min after needed-by');

    // Case D: Route is down
    const candD = RulesService.evaluateCandidate(
      {
        id: 'U-DOWN',
        component: 'RED_CELLS',
        group: 'O-',
        hospitalId: 'H4',
        expiresAt: new Date(now.getTime() + 24 * 3600000),
        status: 'AVAILABLE',
      },
      {
        id: 'R-DOWN',
        component: 'RED_CELLS',
        group: 'O-',
        hospitalId: 'H3',
        neededBy: new Date(now.getTime() + 120 * 60000),
        urgency: 'URGENT',
      },
      routes,
      now
    );
    expect(candD.feasible).toBe(false);
    expect(candD.blockingReasons).toContain('Route Sawai Care Hospital to Amber Heart Institute is down');

    // Case E: Incompatible group
    const candE = RulesService.evaluateCandidate(
      {
        id: 'U-INCOMPAT',
        component: 'RED_CELLS',
        group: 'A+',
        hospitalId: 'H1',
        expiresAt: new Date(now.getTime() + 24 * 3600000),
        status: 'AVAILABLE',
      },
      {
        id: 'R-INCOMPAT',
        component: 'RED_CELLS',
        group: 'O-',
        hospitalId: 'H1',
        neededBy: new Date(now.getTime() + 120 * 60000),
        urgency: 'CRITICAL',
      },
      routes,
      now
    );
    expect(candE.feasible).toBe(false);
    expect(candE.blockingReasons).toContain('Incompatible group: A+ cannot serve O-');
  });
});
