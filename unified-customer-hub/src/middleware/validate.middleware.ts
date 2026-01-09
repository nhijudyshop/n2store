import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// Zod Validation Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Middleware factory để validate request với Zod schemas
 *
 * @example
 * ```typescript
 * router.post('/deposit',
 *   validate({
 *     body: depositSchema,
 *     params: z.object({ phone: z.string() })
 *   }),
 *   depositController
 * );
 * ```
 */
export function validate(schemas: ValidationSchemas) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate body
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }

      // Validate query
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }

      // Validate params
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          error: 'Validation Error',
          message: 'Dữ liệu không hợp lệ',
          details: formattedErrors,
        });
        return;
      }

      next(error);
    }
  };
}

/**
 * Helper để validate single value
 */
export function validateValue<T>(schema: ZodSchema<T>, value: unknown): T {
  return schema.parse(value);
}

/**
 * Helper để safe parse (không throw error)
 */
export function safeValidate<T>(
  schema: ZodSchema<T>,
  value: unknown
): { success: true; data: T } | { success: false; error: ZodError } {
  const result = schema.safeParse(value);
  return result;
}

export default validate;
