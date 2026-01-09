// unified-customer-hub/src/modules/activity/activity.service.ts

import { db } from '../../config/database.js';
import { normalizePhone } from '../../utils/phone-normalizer.js';
import { CustomerActivityWithMeta, ActivityFilter } from './activity.types.js';

export async function getCustomerActivities(
  inputPhone: string,
  filters: ActivityFilter,
  limit: number = 20,
  offset: number = 0
): Promise<{ activities: CustomerActivityWithMeta[]; total: number }> {
  const phone = normalizePhone(inputPhone);

  let whereClauses: string[] = ['ca.phone = $1'];
  let queryParams: any[] = [phone];
  let paramIndex = 2;

  if (filters.type) {
    whereClauses.push(`ca.activity_type = $${paramIndex}`);
    queryParams.push(filters.type);
    paramIndex++;
  }

  if (filters.days) {
    whereClauses.push(`ca.created_at >= NOW() - INTERVAL '${filters.days} days'`);
  }

  const whereCondition = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Get total count
  const { rows: countRows } = await db.query<{ count: string }>(`
    SELECT COUNT(*) FROM customer_activities ca ${whereCondition}
  `, queryParams);
  const total = parseInt(countRows[0].count, 10);

  // Get activities
  const { rows: activitiesRows } = await db.query<CustomerActivityWithMeta>(`
    SELECT
      ca.*
    FROM customer_activities ca
    ${whereCondition}
    ORDER BY ca.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...queryParams, limit, offset]);

  return {
    activities: activitiesRows,
    total: total,
  };
}
