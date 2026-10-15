import { Router, Request, Response, NextFunction } from 'express';
import { Hospital } from '../models/hospital.model';

const router = Router();

// GET /api/v1/hospitals
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const hospitals = await Hospital.find().sort({ id: 1 }).lean();
    return res.status(200).json(hospitals);
  } catch (err) {
    return next(err);
  }
});

export default router;
