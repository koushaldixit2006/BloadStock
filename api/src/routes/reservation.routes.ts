import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ReservationService } from '../services/reservation.service';
import { authenticate, requireRole } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validate';
import { IActor } from '../models/auditLog.model';

const router = Router();

const commitSchema = z.object({
  planId: z.string().min(1),
  assignmentIds: z.array(z.string()).optional(),
  idempotencyKey: z.string().optional(),
});

const listQuerySchema = z.object({
  status: z.enum(['RESERVED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'EXPIRED']).optional(),
  hospitalId: z.string().optional(),
  requestId: z.string().optional(),
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

// POST /api/v1/reservations/commit
router.post(
  '/commit',
  authenticate,
  requireRole('ADMIN', 'COORDINATOR'),
  validateRequest({ body: commitSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const result = await ReservationService.commit({
        planId: req.body.planId,
        assignmentIds: req.body.assignmentIds,
        idempotencyKey: req.body.idempotencyKey,
        actor: getActor(user),
      });

      return res.status(201).json(result);
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/v1/reservations
router.get(
  '/',
  authenticate,
  validateRequest({ query: listQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const reservations = await ReservationService.list(
        req.query as any,
        getActor(user)
      );
      return res.status(200).json(reservations);
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/v1/reservations/:id
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const reservation = await ReservationService.getById(
      req.params.id as string,
      getActor(user)
    );
    return res.status(200).json(reservation);
  } catch (err) {
    return next(err);
  }
});

// POST /api/v1/reservations/:id/dispatch
router.post(
  '/:id/dispatch',
  authenticate,
  requireRole('ADMIN', 'COORDINATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const updated = await ReservationService.dispatch(
        req.params.id as string,
        getActor(user)
      );
      return res.status(200).json(updated);
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/reservations/:id/deliver
router.post(
  '/:id/deliver',
  authenticate,
  requireRole('ADMIN', 'COORDINATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const updated = await ReservationService.deliver(
        req.params.id as string,
        getActor(user)
      );
      return res.status(200).json(updated);
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/reservations/:id/cancel
router.post(
  '/:id/cancel',
  authenticate,
  requireRole('ADMIN', 'COORDINATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const updated = await ReservationService.cancel(
        req.params.id as string,
        getActor(user)
      );
      return res.status(200).json(updated);
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
