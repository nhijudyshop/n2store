// unified-customer-hub/src/modules/activity/activity.controller.ts

import { Request, Response, NextFunction } from 'express';
import { getCustomerActivities } from './activity.service.js';
import { normalizePhone } from '../../utils/phone-normalizer.js';
import { z } from 'zod'; // Assuming Zod for validation

// Define a schema for query parameters for validation
const getCustomerActivitiesQuerySchema = z.object({
  type: z.string().optional(),
  days: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  offset: z.string().transform(Number).optional(),
});

export async function listCustomerActivities(req: Request, res: Response, next: NextFunction) {
  try {
    const phone = normalizePhone(req.params.phone);
    const { type, days, limit, offset } = getCustomerActivitiesQuerySchema.parse(req.query);

    const activities = await getCustomerActivities(
      phone,
      { type, days },
      limit || 20, // Default limit
      offset || 0  // Default offset
    );

    res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    next(error);
  }
}
