// unified-customer-hub/src/modules/customer/customer.controller.ts

import { Request, Response, NextFunction } from 'express';
import { getCustomer360View } from './customer.service.js';
import { normalizePhone } from '../../utils/phone-normalizer.js';
import { CustomerError } from './customer.errors.js'; // Assuming this exists or will be created

export async function getCustomer360(req: Request, res: Response, next: NextFunction) {
  try {
    const phone = normalizePhone(req.params.phone);
    const customer360 = await getCustomer360View(phone);

    if (!customer360) {
      throw CustomerError.notFound(phone); // Assuming CustomerError has a notFound method
    }

    res.status(200).json({
      success: true,
      data: customer360,
    });
  } catch (error) {
    next(error);
  }
}

// Placeholder for other customer controller functions
export function createCustomer(req: Request, res: Response, next: NextFunction) {
  // ...
}

export function updateCustomer(req: Request, res: Response, next: NextFunction) {
  // ...
}
