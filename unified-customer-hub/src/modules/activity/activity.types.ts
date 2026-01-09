// unified-customer-hub/src/modules/activity/activity.types.ts

import type { CustomerActivity } from '@prisma/client';

export interface ActivityFilter {
  type?: string; // WALLET, TICKET, ORDER, CUSTOMER, BANK_TRANSFER
  days?: number; // Number of days to look back
}

export interface CustomerActivityWithMeta extends CustomerActivity {
  // Potentially add more computed fields for frontend display
}

export interface CustomerActivityPagination {
  limit: number;
  offset: number;
}
