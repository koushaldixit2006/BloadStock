import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/appError';
import { logger } from '../utils/logger';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected internal error occurred';
  let details: any = {};

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = err.message || 'Invalid or expired authentication token';
  } else if (err.code === 11000) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'A resource with this key already exists';
    details = err.keyValue || {};
  } else if (err.statusCode && typeof err.statusCode === 'number') {
    statusCode = err.statusCode;
    code = err.code || 'BAD_REQUEST';
    message = err.message || 'Request error';
    details = err.details || {};
  } else {
    // Log unexpected exceptions internally with full stack trace
    logger.error({ err, reqId: req.id, url: req.url, method: req.method }, 'Unhandled Exception');
  }

  // Consistent error response format without leaking stack traces
  return res.status(statusCode).json({
    error: {
      code,
      message,
      details,
    },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  return res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
      details: {},
    },
  });
}
