import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { authenticate, requireRole } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validate';
import { authLimiter } from '../middlewares/rateLimiter';
import { config } from '../config';
import { User } from '../models/user.model';
import { NotFoundError } from '../errors/appError';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['ADMIN', 'COORDINATOR', 'VIEWER']),
  hospitalId: z.string().optional().nullable(),
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// POST /api/v1/auth/login
router.post(
  '/login',
  authLimiter,
  validateRequest({ body: loginSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const { user, accessToken, refreshToken } = await AuthService.login(email, password);

      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

      return res.status(200).json({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          hospitalId: user.hospitalId,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/auth/refresh
router.post('/refresh', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    const { accessToken, newRefreshToken, user } = await AuthService.refresh(token);

    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hospitalId: user.hospitalId,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    const authHeader = req.headers.authorization;
    let userId = req.user?.userId;

    if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
      const tokenParts = authHeader.split(' ');
      if (tokenParts[1]) {
        try {
          const payload = AuthService.verifyAccessToken(tokenParts[1]);
          userId = payload.userId;
        } catch {
          // Ignore token expiration on logout
        }
      }
    }

    if (userId) {
      await AuthService.logout(userId, token);
    }

    res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, maxAge: 0 });
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    return next(err);
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOne({ id: req.user!.userId }).lean();
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hospitalId: user.hospitalId,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/v1/auth/register (ADMIN only)
router.post(
  '/register',
  authenticate,
  requireRole('ADMIN'),
  validateRequest({ body: registerSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const newUser = await AuthService.register(req.body);
      return res.status(201).json({
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          hospitalId: newUser.hospitalId,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
