import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ScenarioService } from '../services/scenario.service';
import { authenticate, requireRole } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validate';
import { IActor } from '../models/auditLog.model';

const router = Router();

const transportFailureSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  down: z.boolean().optional(),
  delayMinutes: z.number().int().min(0).optional(),
});

const demandSpikeSchema = z.object({
  hospitalId: z.string().min(1),
  component: z.enum(['RED_CELLS', 'PLATELETS', 'PLASMA']),
  group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  units: z.number().int().min(1),
  urgency: z.enum(['ROUTINE', 'URGENT', 'CRITICAL']),
});

const cancellationSchema = z.object({
  requestId: z.string().min(1),
});

const newStockSchema = z.object({
  hospitalId: z.string().min(1),
  component: z.enum(['RED_CELLS', 'PLATELETS', 'PLASMA']),
  group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  units: z.number().int().min(1),
});

function getActor(user: { userId: string; role: any; hospitalId?: string | null | undefined }): IActor {
  const actor: IActor = {
    id: user.userId,
    role: user.role,
  };
  if (user.hospitalId) {
    actor.hospitalId = user.hospitalId;
  }
  return actor;
}

// POST /api/v1/scenarios/transport-failure
router.post(
  '/transport-failure',
  authenticate,
  requireRole('ADMIN'),
  validateRequest({ body: transportFailureSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const result = await ScenarioService.handleTransportFailure(req.body, getActor(user));
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/scenarios/demand-spike
router.post(
  '/demand-spike',
  authenticate,
  requireRole('ADMIN'),
  validateRequest({ body: demandSpikeSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const result = await ScenarioService.handleDemandSpike(req.body, getActor(user));
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/scenarios/cancellation
router.post(
  '/cancellation',
  authenticate,
  requireRole('ADMIN'),
  validateRequest({ body: cancellationSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const result = await ScenarioService.handleCancellation(req.body, getActor(user));
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/scenarios/new-stock
router.post(
  '/new-stock',
  authenticate,
  requireRole('ADMIN'),
  validateRequest({ body: newStockSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const result = await ScenarioService.handleNewStock(req.body, getActor(user));
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
