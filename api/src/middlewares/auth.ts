import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { UnauthorizedError, ForbiddenError } from '../errors/appError';
import { UserRole } from '../models/user.model';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token required'));
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return next(new UnauthorizedError('Authentication token required'));
  }

  try {
    const payload = AuthService.verifyAccessToken(token);
    req.user = payload;
    return next();
  } catch {
    return next(new UnauthorizedError('Invalid or expired authentication token'));
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`Forbidden: Requires role ${allowedRoles.join(' or ')}`));
    }

    return next();
  };
}

export function scopeCoordinatorHospital(getHospitalId: (req: Request) => string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Admins can manage any hospital
    if (req.user.role === 'ADMIN') {
      return next();
    }

    // Coordinators can only manage their own hospital
    if (req.user.role === 'COORDINATOR') {
      const targetHospitalId = getHospitalId(req);
      if (targetHospitalId && targetHospitalId !== req.user.hospitalId) {
        return next(
          new ForbiddenError(`Coordinator is restricted to hospital ${req.user.hospitalId}`)
        );
      }
      return next();
    }

    // Viewers cannot perform modifying actions
    if (req.method !== 'GET') {
      return next(new ForbiddenError('Viewers have read-only access'));
    }

    return next();
  };
}
