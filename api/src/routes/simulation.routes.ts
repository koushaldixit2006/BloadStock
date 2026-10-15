import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SimulationService } from '../services/simulation.service';
import { authenticate, requireRole } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validate';
import { IActor } from '../models/auditLog.model';

const router = Router();

const advanceSchema = z.object({
  hours: z.number().positive(),
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

// GET /api/v1/sim/clock
router.get('/clock', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const clock = await SimulationService.getClock();
    return res.status(200).json(clock);
  } catch (err) {
    return next(err);
  }
});

// POST /api/v1/sim/advance
router.post(
  '/advance',
  authenticate,
  requireRole('ADMIN'),
  validateRequest({ body: advanceSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const result = await SimulationService.advance(req.body.hours, getActor(user));
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/sim/reset
router.post(
  '/reset',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const result = await SimulationService.reset(getActor(user));
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
