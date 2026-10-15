import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuditService } from '../services/audit.service';
import { authenticate, requireRole } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validate';

const router = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  entity: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
});

// GET /api/v1/audit
router.get(
  '/',
  authenticate,
  requireRole('ADMIN'),
  validateRequest({ query: listQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const logs = await AuditService.list(req.query as any);
      return res.status(200).json(logs);
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/v1/audit/verify
router.get('/verify', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const verification = await AuditService.verify();
    return res.status(200).json(verification);
  } catch (err) {
    return next(err);
  }
});

export default router;
