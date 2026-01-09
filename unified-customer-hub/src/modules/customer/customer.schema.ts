// unified-customer-hub/src/modules/customer/customer.schema.ts

import { z } from 'zod';
import { phoneSchema } from '../../utils/schemas.js';

// Schema for fetching a single customer or the 360 view
export const getCustomerSchema = z.object({
  phone: phoneSchema,
});

// Schema for updating a customer
export const updateCustomerSchema = z.object({
  phone: phoneSchema,
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(255).optional(),
  addresses: z.array(z.object({
    id: z.number().int().optional(),
    address: z.string().min(1),
    ward: z.string().min(1),
    district: z.string().min(1),
    city: z.string().min(1),
    is_default: z.boolean().optional(),
    label: z.string().optional(),
  })).optional(),
  status: z.enum(['active', 'warning', 'danger', 'blocked']).optional(),
  tier: z.enum(['normal', 'silver', 'gold', 'vip', 'blacklist']).optional(),
  tags: z.array(z.string().min(1)).optional(),
  internal_note: z.string().optional(),
});

export type GetCustomerSchema = z.infer<typeof getCustomerSchema>;
export type UpdateCustomerSchema = z.infer<typeof updateCustomerSchema>;
