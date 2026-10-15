import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { BloodRequest } from '../models/request.model';
import { Unit, Component, BloodGroup } from '../models/unit.model';
import { Route } from '../models/route.model';
import { Plan } from '../models/plan.model';
import { SimState } from '../models/simState.model';
import { Reservation } from '../models/reservation.model';
import { AuditService } from '../services/audit.service';
import { InvariantService } from '../services/invariant.service';
import { authenticate, requireRole } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validate';
import { OptimizerClient } from '../services/optimizerClient';
import { FallbackPlannerService } from '../services/fallbackPlanner.service';
import { NotFoundError, BadRequestError, ForbiddenError } from '../errors/appError';
import { logger } from '../utils/logger';

const router = Router();

const createRequestSchema = z.object({
  hospitalId: z.string().optional(),
  component: z.enum(['RED_CELLS', 'PLATELETS', 'PLASMA']),
  group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  unitsNeeded: z.number().int().min(1).default(1),
  neededBy: z.string().datetime(),
  urgency: z.enum(['ROUTINE', 'URGENT', 'CRITICAL']).default('ROUTINE'),
  clinicalContext: z.string().optional(),
});

const listRequestsQuerySchema = z.object({
  hospitalId: z.string().optional(),
  status: z.enum(['OPEN', 'FULFILLED', 'PARTIALLY_FULFILLED', 'CANCELLED', 'EXPIRED']).optional(),
  urgency: z.enum(['ROUTINE', 'URGENT', 'CRITICAL']).optional(),
  component: z.enum(['RED_CELLS', 'PLATELETS', 'PLASMA']).optional(),
});

// POST /api/v1/requests
router.post(
  '/',
  authenticate,
  requireRole('ADMIN', 'COORDINATOR'),
  validateRequest({ body: createRequestSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      let hospitalId = req.body.hospitalId;

      if (user.role === 'COORDINATOR') {
        if (!user.hospitalId) {
          throw new ForbiddenError('Coordinator user has no assigned hospital');
        }
        if (hospitalId && hospitalId !== user.hospitalId) {
          throw new ForbiddenError(`Coordinators can only create requests for hospital ${user.hospitalId}`);
        }
        hospitalId = user.hospitalId;
      } else if (!hospitalId) {
        throw new BadRequestError('hospitalId is required for ADMIN requests');
      }

      // Generate request ID: R-XXXX
      const totalCount = await BloodRequest.countDocuments();
      const requestId = `R-${1000 + totalCount + 1}`;

      const newRequest = await BloodRequest.create({
        id: requestId,
        hospitalId,
        component: req.body.component,
        group: req.body.group,
        unitsNeeded: req.body.unitsNeeded,
        neededBy: new Date(req.body.neededBy),
        urgency: req.body.urgency,
        clinicalContext: req.body.clinicalContext || '',
        status: 'OPEN',
      });

      return res.status(201).json(newRequest);
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/v1/requests
router.get(
  '/',
  validateRequest({ query: listRequestsQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: any = {};
      const { hospitalId, status, urgency, component } = req.query as any;

      if (hospitalId) filter.hospitalId = hospitalId;
      if (status) filter.status = status;
      if (urgency) filter.urgency = urgency;
      if (component) filter.component = component;

      const requests = await BloodRequest.find(filter).sort({ neededBy: 1 }).lean();
      return res.status(200).json(requests);
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/v1/requests/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const request = await BloodRequest.findOne({ id: req.params.id }).lean();
    if (!request) {
      throw new NotFoundError(`Blood request ${req.params.id} not found`);
    }
    return res.status(200).json(request);
  } catch (err) {
    return next(err);
  }
});

// POST /api/v1/requests/:id/cancel
router.post(
  '/:id/cancel',
  authenticate,
  requireRole('ADMIN', 'COORDINATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await BloodRequest.findOne({ id: req.params.id });
      if (!request) {
        throw new NotFoundError(`Blood request ${req.params.id} not found`);
      }

      if (req.user!.role === 'COORDINATOR' && request.hospitalId !== req.user!.hospitalId) {
        throw new ForbiddenError(`Coordinator cannot cancel requests for hospital ${request.hospitalId}`);
      }

      if (request.status === 'CANCELLED' || (request.status as string) === 'FULFILLED') {
        throw new BadRequestError(`Cannot cancel request in status ${request.status}`);
      }

      request.status = 'CANCELLED';
      await request.save();

      // Find any active RESERVED units for this request and release them (IN_TRANSIT remains intact)
      const activeReservations = await Reservation.find({
        requestId: request.id,
        status: 'RESERVED',
        isActive: true,
      });

      for (const resDoc of activeReservations) {
        resDoc.status = 'CANCELLED';
        resDoc.isActive = false;
        await resDoc.save();

        await Unit.updateOne(
          { id: resDoc.unitId },
          { $set: { status: 'AVAILABLE', reservedForRequestId: null }, $inc: { version: 1 } }
        );

        const actor = {
          id: req.user!.userId,
          role: req.user!.role,
          ...(req.user!.hospitalId ? { hospitalId: req.user!.hospitalId } : {}),
        };

        await AuditService.append({
          actor,
          action: 'RESERVATION_CANCELLED_WITH_REQUEST',
          entity: 'Reservation',
          entityId: resDoc.id,
          diff: { unitId: resDoc.unitId, requestId: request.id },
        });
      }

      const reqActor = {
        id: req.user!.userId,
        role: req.user!.role,
        ...(req.user!.hospitalId ? { hospitalId: req.user!.hospitalId } : {}),
      };

      await AuditService.append({
        actor: reqActor,
        action: 'REQUEST_CANCELLED',
        entity: 'BloodRequest',
        entityId: request.id,
        diff: { releasedUnits: activeReservations.map((r) => r.unitId) },
      });

      await InvariantService.assertAll();

      return res.status(200).json(request);
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/requests/:id/recommendations
router.post(
  '/:id/recommendations',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await BloodRequest.findOne({ id: req.params.id }).lean();
      if (!request) {
        throw new NotFoundError(`Blood request ${req.params.id} not found`);
      }

      // 1. Fetch simulation clock reference or current time
      const simState = await SimState.findOne({ key: 'current' }).lean();
      const referenceNow = simState?.virtualNow ? new Date(simState.virtualNow) : new Date();

      // 2. Fetch all AVAILABLE units and all routes
      const [availableUnits, routes] = await Promise.all([
        Unit.find({ status: 'AVAILABLE' }).lean(),
        Route.find().lean(),
      ]);

      const unitSnapshots = availableUnits.map((u) => ({
        id: u.id,
        component: u.component as Component,
        group: u.group as BloodGroup,
        hospitalId: u.hospitalId,
        collectedAt: u.collectedAt.toISOString(),
        expiresAt: u.expiresAt.toISOString(),
        status: u.status,
      }));

      const routeSnapshots = routes.map((r) => ({
        fromId: r.fromId,
        toId: r.toId,
        baseMinutes: r.baseMinutes,
        status: r.status,
        delayMinutes: r.delayMinutes,
      }));

      const requestSnapshot = {
        id: request.id,
        hospitalId: request.hospitalId,
        component: request.component,
        group: request.group,
        unitsNeeded: request.unitsNeeded,
        neededBy: request.neededBy.toISOString(),
        urgency: request.urgency,
        status: request.status,
      };

      let planResult: any = null;
      let planSource = 'optimizer-min-cost-flow';

      // 3. Attempt optimizer call with fallback
      try {
        const payload = {
          units: unitSnapshots,
          requests: [requestSnapshot],
          routes: routeSnapshots,
          now: referenceNow.toISOString(),
          mode: 'optimized',
        };

        planResult = await OptimizerClient.getPlan(payload);
        planSource = planResult.source || 'optimizer-min-cost-flow';
      } catch (optimizerErr: any) {
        logger.warn(
          { err: optimizerErr.message, requestId: request.id },
          'Optimizer unavailable or failed; executing fallback baseline planner'
        );

        const fallbackUnits = availableUnits.map((u) => ({
          id: u.id,
          component: u.component as Component,
          group: u.group as BloodGroup,
          hospitalId: u.hospitalId,
          expiresAt: u.expiresAt,
          status: u.status,
        }));

        const fallbackRequest = {
          id: request.id,
          component: request.component as Component,
          group: request.group as BloodGroup,
          hospitalId: request.hospitalId,
          unitsNeeded: request.unitsNeeded,
          neededBy: request.neededBy,
          urgency: request.urgency,
        };

        planResult = FallbackPlannerService.plan(
          fallbackUnits,
          [fallbackRequest],
          routes.map((r) => ({
            fromId: r.fromId,
            toId: r.toId,
            baseMinutes: r.baseMinutes,
            status: r.status,
            delayMinutes: r.delayMinutes,
          })),
          referenceNow
        );
        planSource = 'fallback-baseline';
      }

      // 4. Save plan document to plans collection with TTL (30 min)
      const planId = `PLAN-${randomUUID().slice(0, 8).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await Plan.create({
        planId,
        requestIds: [request.id],
        mode: planSource === 'fallback-baseline' ? 'baseline' : 'optimized',
        source: planSource,
        assignments: planResult.assignments,
        metrics: planResult.metrics,
        expiresAt,
      });

      return res.status(200).json({
        planId,
        requestId: request.id,
        mode: planSource === 'fallback-baseline' ? 'baseline' : 'optimized',
        source: planSource,
        assignments: planResult.assignments,
        unfulfilled: planResult.unfulfilled || [],
        metrics: planResult.metrics,
        disclaimer: 'Planning support only - not a clinical decision. Synthetic data.',
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
