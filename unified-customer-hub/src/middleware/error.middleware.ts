import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Custom Error Classes
// ═══════════════════════════════════════════════════════════════════════════════

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} với ID "${identifier}" không tồn tại`
      : `${resource} không tồn tại`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Không có quyền truy cập') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Không có quyền thực hiện hành động này') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Error Response Interface
// ═══════════════════════════════════════════════════════════════════════════════

interface ErrorResponse {
  error: string;
  message: string;
  code: string;
  details?: unknown;
  stack?: string;
  requestId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Global Error Handler Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
    userId: req.user?.id,
  });

  // Build error response
  let response: ErrorResponse;

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    response = {
      error: 'Validation Error',
      message: 'Dữ liệu không hợp lệ',
      code: 'VALIDATION_ERROR',
      details: formattedErrors,
      requestId: req.requestId,
    };

    res.status(400).json(response);
    return;
  }

  // Handle AppError (our custom errors)
  if (err instanceof AppError) {
    response = {
      error: err.name,
      message: err.message,
      code: err.code,
      details: err.details,
      requestId: req.requestId,
    };

    // Include stack trace in development
    if (env.isDevelopment) {
      response.stack = err.stack;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle PostgreSQL errors
  if ('code' in err && typeof (err as { code: unknown }).code === 'string') {
    const pgError = err as { code: string; detail?: string; constraint?: string };

    // Unique constraint violation
    if (pgError.code === '23505') {
      response = {
        error: 'Conflict',
        message: 'Dữ liệu đã tồn tại',
        code: 'DUPLICATE_ENTRY',
        details: { constraint: pgError.constraint },
        requestId: req.requestId,
      };
      res.status(409).json(response);
      return;
    }

    // Foreign key violation
    if (pgError.code === '23503') {
      response = {
        error: 'Bad Request',
        message: 'Dữ liệu tham chiếu không hợp lệ',
        code: 'FOREIGN_KEY_VIOLATION',
        requestId: req.requestId,
      };
      res.status(400).json(response);
      return;
    }

    // Check constraint violation
    if (pgError.code === '23514') {
      response = {
        error: 'Bad Request',
        message: 'Dữ liệu vi phạm ràng buộc',
        code: 'CHECK_CONSTRAINT_VIOLATION',
        details: { constraint: pgError.constraint },
        requestId: req.requestId,
      };
      res.status(400).json(response);
      return;
    }

    // Immutable table violation (our custom trigger)
    if (pgError.code === 'P0001' && err.message.includes('immutable')) {
      response = {
        error: 'Forbidden',
        message: 'Không thể sửa đổi dữ liệu này',
        code: 'IMMUTABLE_DATA',
        requestId: req.requestId,
      };
      res.status(403).json(response);
      return;
    }
  }

  // Default: Internal Server Error
  response = {
    error: 'Internal Server Error',
    message: env.isProduction ? 'Lỗi hệ thống, vui lòng thử lại sau' : err.message,
    code: 'INTERNAL_ERROR',
    requestId: req.requestId,
  };

  if (env.isDevelopment) {
    response.stack = err.stack;
  }

  res.status(500).json(response);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Async Handler Wrapper (để bắt lỗi trong async functions)
// ═══════════════════════════════════════════════════════════════════════════════

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Not Found Handler
// ═══════════════════════════════════════════════════════════════════════════════

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} không tồn tại`,
    code: 'ENDPOINT_NOT_FOUND',
    requestId: req.requestId,
  });
}

export default errorHandler;
