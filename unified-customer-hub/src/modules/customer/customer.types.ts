// unified-customer-hub/src/modules/customer/customer.types.ts

// Define interfaces for Customer and Customer360View based on the schema and aggregated data

import type { Customer, Wallet, VirtualCredit, Ticket } from '@prisma/client';

// Extend Prisma's Customer type if needed, or define a new one for specific API responses
export type CustomerDetail = Customer & {
  total_orders: number;
  successful_orders: number;
  returned_orders: number;
  total_spent: number;
  return_rate: number;
  days_since_last_order: number | null;
  rfm_recency: number;
  rfm_frequency: number;
  rfm_monetary: number;
  rfm_segment: string | null;
  internal_note: string | null;
  created_by: number | null;
};

export type WalletWithBalances = Wallet & {
  total_balance: number;
};

export type VirtualCreditWithDaysRemaining = VirtualCredit & {
  days_remaining: number;
};

export interface Customer360View {
  customer: CustomerDetail;
  wallet: WalletWithBalances;
  active_virtual_credits: VirtualCreditWithDaysRemaining[];
  pending_tickets_count: number;
  total_tickets_count: number;
  stats: {
    avg_order_value: number;
    last_order_days_ago: number | null;
  };
}

export interface CustomerFilter {
  phone?: string;
  name?: string;
  status?: string;
  tier?: string;
  tags?: string[];
}

export interface CustomerPagination {
  limit: number;
  offset: number;
}
