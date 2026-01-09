// unified-customer-hub/src/modules/customer/customer.routes.ts

import { Router } from 'express';
import { getCustomer360 } from './customer.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { getCustomerSchema } from './customer.schema.js';

const router = Router();

router.get(
  '/:phone/360',
  validate(getCustomerSchema),
  requirePermission('customer', 'read'),
  getCustomer360
);

// Placeholder for other customer routes
// router.post('/', validate(createCustomerSchema), requirePermission('customer', 'create'), createCustomer);
// router.put('/:phone', validate(updateCustomerSchema), requirePermission('customer', 'update'), updateCustomer);

export default router;
