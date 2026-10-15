import { Router, Request, Response, NextFunction } from 'express';
import { Unit, Component, BloodGroup } from '../models/unit.model';
import { BloodRequest } from '../models/request.model';
import { Route } from '../models/route.model';
import { SimState } from '../models/simState.model';
import { FallbackPlannerService } from '../services/fallbackPlanner.service';
import { OptimizerClient } from '../services/optimizerClient';
import { authenticate } from '../middlewares/auth';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/v1/plans/compare
router.post('/compare', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const simState = await SimState.findOne({ key: 'current' }).lean();
    const referenceNow = simState?.virtualNow ? new Date(simState.virtualNow) : new Date();

    const [availableUnits, openRequests, routes] = await Promise.all([
      Unit.find({ status: 'AVAILABLE' }).lean(),
      BloodRequest.find({ status: 'OPEN' }).lean(),
      Route.find().lean(),
    ]);

    // 1. Compute Baseline Plan
    const fallbackUnits = availableUnits.map((u) => ({
      id: u.id,
      component: u.component as Component,
      group: u.group as BloodGroup,
      hospitalId: u.hospitalId,
      expiresAt: u.expiresAt,
      status: u.status,
    }));

    const fallbackRequests = openRequests.map((r) => ({
      id: r.id,
      component: r.component as Component,
      group: r.group as BloodGroup,
      hospitalId: r.hospitalId,
      unitsNeeded: r.unitsNeeded,
      neededBy: r.neededBy,
      urgency: r.urgency,
    }));

    const routeSnapshots = routes.map((r) => ({
      fromId: r.fromId,
      toId: r.toId,
      baseMinutes: r.baseMinutes,
      status: r.status,
      delayMinutes: r.delayMinutes,
    }));

    const baselinePlan = FallbackPlannerService.plan(
      fallbackUnits,
      fallbackRequests,
      routeSnapshots,
      referenceNow
    );

    // 2. Compute Optimized Plan via OptimizerClient
    let optimizedPlan: any;
    try {
      const payload = {
        units: availableUnits.map((u) => ({
          id: u.id,
          component: u.component,
          group: u.group,
          hospitalId: u.hospitalId,
          collectedAt: u.collectedAt.toISOString(),
          expiresAt: u.expiresAt.toISOString(),
          status: u.status,
        })),
        requests: openRequests.map((r) => ({
          id: r.id,
          hospitalId: r.hospitalId,
          component: r.component,
          group: r.group,
          unitsNeeded: r.unitsNeeded,
          neededBy: r.neededBy.toISOString(),
          urgency: r.urgency,
          status: r.status,
        })),
        routes: routeSnapshots,
        now: referenceNow.toISOString(),
        mode: 'optimized',
      };

      optimizedPlan = await OptimizerClient.getPlan(payload);
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Optimizer failed during comparison; returning baseline for both');
      optimizedPlan = { ...baselinePlan, source: 'fallback-baseline (optimizer unreachable)' };
    }

    // 3. Compute Deltas
    const baseMetrics = baselinePlan.metrics;
    const optMetrics = optimizedPlan.metrics;

    const deltas = {
      satisfiedDelta: optMetrics.satisfied - baseMetrics.satisfied,
      partialDelta: optMetrics.partial - baseMetrics.partial,
      unfulfilledDelta: optMetrics.unfulfilled - baseMetrics.unfulfilled,
      wastedUnitsDelta: optMetrics.wastedUnits - baseMetrics.wastedUnits,
      totalTransportMinutesDelta: optMetrics.totalTransportMinutes - baseMetrics.totalTransportMinutes,
      avgExpiryMarginMinutesDelta: Math.round((optMetrics.avgExpiryMarginMinutes - baseMetrics.avgExpiryMarginMinutes) * 10) / 10,
    };

    return res.status(200).json({
      baseline: baselinePlan,
      optimized: optimizedPlan,
      deltas,
      timestamp: referenceNow.toISOString(),
      disclaimer: 'Planning support only - not a clinical decision. Synthetic data.',
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
