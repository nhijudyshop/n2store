// unified-customer-hub/src/utils/schemas.ts

import { z } from 'zod';
import { normalizePhone } from './phone-normalizer.js';

export const phoneSchema = z.string()
  .refine(
    (val) => {
      try {
        normalizePhone(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid phone number format' }
  )
  .transform((val) => normalizePhone(val));

// Other common schemas can be added here
