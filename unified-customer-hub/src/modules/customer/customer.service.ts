// unified-customer-hub/src/modules/customer/customer.service.ts

import { db } from '../../config/database.js';
import { normalizePhone } from '../../utils/phone-normalizer.js';
import { Customer360View, CustomerDetail, WalletWithBalances, VirtualCreditWithDaysRemaining } from './customer.types.js';
import { calculateDaysRemaining } from '../../utils/date-utils.js'; // Assuming this utility exists or will be created

/**
 * Retrieves a comprehensive 360-degree view of a customer.
 * Aggregates data from customers, wallets, virtual credits, and tickets.
 */
export async function getCustomer360View(inputPhone: string): Promise<Customer360View | null> {
  const phone = normalizePhone(inputPhone);

  // Fetch customer and wallet data
  const { rows: customerRows } = await db.query<CustomerDetail & WalletWithBalances>(`
    SELECT
      c.*,
      w.real_balance,
      w.virtual_balance,
      (COALESCE(w.real_balance, 0) + COALESCE(w.virtual_balance, 0)) AS total_balance,
      w.is_frozen,
      w.frozen_reason,
      w.id as wallet_id
    FROM customers c
    LEFT JOIN wallets w ON c.id = w.customer_id
    WHERE c.phone = $1
  `, [phone]);

  if (customerRows.length === 0) {
    return null;
  }

  const customerData = customerRows[0];

  // Fetch active virtual credits
  const { rows: virtualCreditsRows } = await db.query<VirtualCreditWithDaysRemaining>(`
    SELECT
      vc.*
    FROM virtual_credits vc
    WHERE vc.wallet_id = $1 AND vc.status = 'ACTIVE' AND vc.remaining_amount > 0
    ORDER BY vc.expires_at ASC
  `, [customerData.wallet_id]);

  const activeVirtualCredits = virtualCreditsRows.map(vc => ({
    ...vc,
    days_remaining: calculateDaysRemaining(vc.expires_at.toISOString()) // Assuming ISO string for date-utils
  }));


  // Fetch ticket counts
  const { rows: ticketCountsRows } = await db.query<{ pending_tickets_count: number; total_tickets_count: number }>(`
    SELECT
      COUNT(CASE WHEN t.status IN ('PENDING_GOODS', 'PENDING_FINANCE') THEN 1 END)::INTEGER AS pending_tickets_count,
      COUNT(t.id)::INTEGER AS total_tickets_count
    FROM tickets t
    WHERE t.customer_id = $1
  `, [customerData.id]);

  const { pending_tickets_count, total_tickets_count } = ticketCountsRows[0];

  // Calculate additional stats
  const avg_order_value = customerData.successful_orders > 0
    ? (Number(customerData.total_spent) / customerData.successful_orders)
    : 0;
  const last_order_days_ago = customerData.last_order_date
    ? calculateDaysRemaining(customerData.last_order_date.toISOString())
    : null;

  return {
    customer: {
      ...customerData,
      phone: normalizePhone(customerData.phone), // Ensure phone is normalized on output
    },
    wallet: {
      id: customerData.wallet_id,
      customer_id: customerData.id,
      phone: normalizePhone(customerData.phone), // Ensure phone is normalized on output
      real_balance: customerData.real_balance,
      virtual_balance: customerData.virtual_balance,
      total_deposited: 0, // Not fetched, placeholder
      total_withdrawn: 0, // Not fetched, placeholder
      total_virtual_issued: 0, // Not fetched, placeholder
      total_virtual_used: 0, // Not fetched, placeholder
      total_virtual_expired: 0, // Not fetched, placeholder
      created_at: new Date(), // Placeholder
      updated_at: new Date(), // Placeholder
      is_frozen: customerData.is_frozen,
      frozen_reason: customerData.frozen_reason,
      frozen_at: null, // Placeholder
      frozen_by: null, // Placeholder
      total_balance: customerData.total_balance,
    },
    active_virtual_credits: activeVirtualCredits,
    pending_tickets_count: pending_tickets_count,
    total_tickets_count: total_tickets_count,
    stats: {
      avg_order_value: parseFloat(avg_order_value.toFixed(2)),
      last_order_days_ago: last_order_days_ago,
    },
  };
}

// Placeholder for other customer service functions
export function getCustomerByPhone(phone: string) {
  // ...
}

export function updateCustomer(phone: string, updates: any) {
  // ...
}
