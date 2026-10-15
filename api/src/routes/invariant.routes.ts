import { Router, Request, Response, NextFunction } from 'express';
import { InvariantService } from '../services/invariant.service';

const router = Router();

// GET /api/v1/invariants
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await InvariantService.verifyAll();
    const allPassed = results.every((r) => r.passed);
    return res.status(allPassed ? 200 : 422).json({
      status: allPassed ? 'PASSED' : 'VIOLATION_DETECTED',
      invariants: results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
