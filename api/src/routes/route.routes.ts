import { Router, Request, Response, NextFunction } from 'express';
import { Route } from '../models/route.model';

const router = Router();

// GET /api/v1/routes
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const routes = await Route.find().sort({ fromId: 1, toId: 1 }).lean();
    return res.status(200).json(routes);
  } catch (err) {
    return next(err);
  }
});

export default router;
