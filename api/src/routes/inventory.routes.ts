import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Unit } from '../models/unit.model';
import { validateRequest } from '../middlewares/validate';
import { NotFoundError } from '../errors/appError';

const router = Router();

const unitsQuerySchema = z.object({
  hospitalId: z.string().optional(),
  component: z.enum(['RED_CELLS', 'PLATELETS', 'PLASMA']).optional(),
  group: z.string().optional(),
  status: z.enum(['AVAILABLE', 'RESERVED', 'IN_TRANSIT', 'EXPIRED', 'DISPATCHED']).optional(),
  expiresWithinHours: z.string().transform((v) => parseFloat(v)).optional(),
  q: z.string().optional(),
  sortBy: z.string().default('expiresAt'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  page: z.string().transform((v) => parseInt(v, 10)).default('1'),
  limit: z.string().transform((v) => parseInt(v, 10)).default('50'),
});

// GET /api/v1/units
router.get(
  '/units',
  validateRequest({ query: unitsQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        hospitalId,
        component,
        group,
        status,
        expiresWithinHours,
        q,
        sortBy,
        sortOrder,
        page,
        limit,
      } = req.query as any;

      const filter: any = {};
      if (hospitalId) filter.hospitalId = hospitalId;
      if (component) filter.component = component;
      if (group) filter.group = group;
      if (status) filter.status = status;

      if (expiresWithinHours !== undefined && !isNaN(expiresWithinHours)) {
        const threshold = new Date(Date.now() + expiresWithinHours * 3600000);
        filter.expiresAt = { $lte: threshold };
      }

      if (q) {
        filter.$or = [
          { id: { $regex: q, $options: 'i' } },
          { group: { $regex: q, $options: 'i' } },
        ];
      }

      const sortDir = sortOrder === 'desc' ? -1 : 1;
      const sortOptions: any = { [sortBy]: sortDir };

      const skip = (page - 1) * limit;
      const [units, total] = await Promise.all([
        Unit.find(filter).sort(sortOptions).skip(skip).limit(limit).lean(),
        Unit.countDocuments(filter),
      ]);

      return res.status(200).json({
        data: units,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/v1/units/:id
router.get('/units/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = await Unit.findOne({ id: req.params.id }).lean();
    if (!unit) {
      throw new NotFoundError(`Blood unit ${req.params.id} not found`);
    }
    return res.status(200).json(unit);
  } catch (err) {
    return next(err);
  }
});

// GET /api/v1/inventory/summary
router.get('/inventory/summary', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await Unit.aggregate([
      {
        $group: {
          _id: {
            hospitalId: '$hospitalId',
            component: '$component',
            group: '$group',
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          hospitalId: '$_id.hospitalId',
          component: '$_id.component',
          group: '$_id.group',
          status: '$_id.status',
          count: 1,
        },
      },
      {
        $sort: { hospitalId: 1, component: 1, group: 1 },
      },
    ]);

    return res.status(200).json(summary);
  } catch (err) {
    return next(err);
  }
});

export default router;
