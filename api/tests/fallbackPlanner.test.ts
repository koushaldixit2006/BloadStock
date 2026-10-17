import { FallbackPlannerService } from '../src/services/fallbackPlanner.service';
import { Component, BloodGroup } from '../src/models/unit.model';

describe('FallbackPlannerService Unit Tests', () => {
  it('marks a unit allocated to another request as infeasible with "Allocated to R-xxx in this plan"', () => {
    const now = new Date('2026-10-15T08:00:00.000Z');

    // 1 available O+ Red Cell unit at H1
    const units = [
      {
        id: 'U-SHARED-1',
        component: 'RED_CELLS' as Component,
        group: 'O+' as BloodGroup,
        hospitalId: 'H1',
        expiresAt: new Date('2026-10-25T08:00:00.000Z'),
        status: 'AVAILABLE',
      },
    ];

    // Two requests that both can accept O+ Red Cells:
    // R-CRIT: CRITICAL urgency, needs 1 A+ Red Cells at H1
    // R-ROUT: ROUTINE urgency, needs 1 B+ Red Cells at H1
    const requests = [
      {
        id: 'R-CRIT',
        component: 'RED_CELLS' as Component,
        group: 'A+' as BloodGroup,
        hospitalId: 'H1',
        unitsNeeded: 1,
        neededBy: new Date('2026-10-15T12:00:00.000Z'),
        urgency: 'CRITICAL',
      },
      {
        id: 'R-ROUT',
        component: 'RED_CELLS' as Component,
        group: 'B+' as BloodGroup,
        hospitalId: 'H1',
        unitsNeeded: 1,
        neededBy: new Date('2026-10-15T16:00:00.000Z'),
        urgency: 'ROUTINE',
      },
    ];

    const routes = [
      {
        fromId: 'H1',
        toId: 'H1',
        baseMinutes: 5,
        status: 'UP',
        delayMinutes: 0,
      },
    ];

    const plan = FallbackPlannerService.plan(units, requests, routes, now);

    // R-CRIT should receive U-SHARED-1
    const critAssignment = plan.assignments.find((a) => a.requestId === 'R-CRIT');
    expect(critAssignment).toBeDefined();
    expect(critAssignment?.allocatedUnitIds).toEqual(['U-SHARED-1']);

    // R-ROUT should not receive U-SHARED-1
    const routAssignment = plan.assignments.find((a) => a.requestId === 'R-ROUT');
    expect(routAssignment).toBeDefined();
    expect(routAssignment?.allocatedUnitIds).toEqual([]);

    // In R-ROUT's options, U-SHARED-1 must be marked feasible: false
    const sharedOption = routAssignment?.options.find((o: any) => o.unitId === 'U-SHARED-1');
    expect(sharedOption).toBeDefined();
    expect(sharedOption?.feasible).toBe(false);
    expect(sharedOption?.blockingReasons).toContain('Allocated to R-CRIT in this plan');
  });
});
