import { Router, Request, Response, NextFunction } from 'express';
import { Unit } from '../models/unit.model';
import { BloodRequest } from '../models/request.model';
import { Route } from '../models/route.model';
import { SimState } from '../models/simState.model';
import { RulesService } from '../services/rules.service';

const router = Router();

// GET /api/v1/metrics/overview
router.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const simState = await SimState.findOne({ key: 'current' }).lean();
    const now = simState?.virtualNow ? new Date(simState.virtualNow) : new Date();

    const [availableUnits, openRequests, routes] = await Promise.all([
      Unit.find({ status: 'AVAILABLE' }).lean(),
      BloodRequest.find({ status: 'OPEN' }).lean(),
      Route.find().lean(),
    ]);

    // 1. Units expiring within 24 hours
    const threshold24h = new Date(now.getTime() + 24 * 3600000);
    const unitsExpiring24h = availableUnits.filter(
      (u) => u.expiresAt.getTime() <= threshold24h.getTime()
    ).length;

    // 2. Open urgent/critical requests
    const openUrgentRequests = openRequests.filter(
      (r) => r.urgency === 'CRITICAL' || r.urgency === 'URGENT'
    ).length;

    // 3. Feasible transfers & infeasible requests calculation
    let feasibleTransfers = 0;
    let infeasibleRequests = 0;

    for (const r of openRequests) {
      let requestHasFeasibleUnit = false;
      for (const u of availableUnits) {
        const candidate = RulesService.evaluateCandidate(u, r, routes, now);
        if (candidate.feasible) {
          feasibleTransfers++;
          requestHasFeasibleUnit = true;
        }
      }
      if (!requestHasFeasibleUnit) {
        infeasibleRequests++;
      }
    }

    // 4. Stock vs demand by group and component
    const stockVsDemandByGroup: Record<
      string,
      { stock: number; demand: number }
    > = {};

    for (const u of availableUnits) {
      const key = `${u.component}:${u.group}`;
      if (!stockVsDemandByGroup[key]) {
        stockVsDemandByGroup[key] = { stock: 0, demand: 0 };
      }
      stockVsDemandByGroup[key].stock++;
    }

    for (const r of openRequests) {
      const key = `${r.component}:${r.group}`;
      if (!stockVsDemandByGroup[key]) {
        stockVsDemandByGroup[key] = { stock: 0, demand: 0 };
      }
      stockVsDemandByGroup[key].demand += r.unitsNeeded;
    }

    return res.status(200).json({
      unitsExpiring24h,
      openUrgentRequests,
      feasibleTransfers,
      infeasibleRequests,
      stockVsDemandByGroup,
      totalAvailableUnits: availableUnits.length,
      totalOpenRequests: openRequests.length,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
