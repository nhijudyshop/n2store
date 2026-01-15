/**
 * =====================================================
 * CUSTOMER CREATION SERVICE
 * =====================================================
 *
 * Dịch vụ tạo/cập nhật khách hàng với thông tin đầy đủ từ TPOS
 *
 * Functions:
 *   - getOrCreateCustomerFromTPOS(db, phone, tposData) - Tạo/update customer với TPOS data
 *   - updateCustomerFromTPOS(db, customerId, tposData) - Update customer từ TPOS
 *   - ensureCustomerWithTPOS(db, phone) - Đảm bảo customer tồn tại (auto-fetch TPOS nếu cần)
 *
 * Created: 2026-01-12
 * =====================================================
 */

const { searchCustomerByPhone, normalizePhone } = require('./tpos-customer-service');

// =====================================================
// CUSTOMER CREATION FUNCTIONS
// =====================================================

/**
 * Get or create customer with full TPOS data
 *
 * @param {Object} db - Database connection
 * @param {string} phone - Customer phone number
 * @param {Object|null} tposData - TPOS customer data (optional, will fetch if not provided)
 * @returns {Promise<{customerId: number, created: boolean, customerName: string}>}
 */
async function getOrCreateCustomerFromTPOS(db, phone, tposData = null) {
    const normalized = normalizePhone(phone);

    if (!normalized) {
        throw new Error('Invalid phone number');
    }

    // 1. Check if customer exists
    let result = await db.query('SELECT id, name FROM customers WHERE phone = $1', [normalized]);

    if (result.rows.length > 0) {
        const existing = result.rows[0];

        // Customer exists - update with TPOS data if provided
        if (tposData && tposData.id) {
            await db.query(`
                UPDATE customers SET
                    name = COALESCE($2, name),
                    address = COALESCE($3, address),
                    tpos_id = COALESCE($4, tpos_id),
                    tpos_data = COALESCE($5, tpos_data),
                    status = COALESCE($6, status),
                    updated_at = CURRENT_TIMESTAMP
                WHERE phone = $1
            `, [
                normalized,
                tposData.name,
                tposData.address,
                tposData.id?.toString(),
                JSON.stringify(tposData),
                tposData.status
            ]);
            console.log(`[CUSTOMER-SERVICE] Updated customer ${normalized} with TPOS data (ID: ${tposData.id}, Status: ${tposData.status || 'N/A'})`);
        }

        return {
            customerId: existing.id,
            created: false,
            customerName: tposData?.name || existing.name
        };
    }

    // 2. Customer not exists - fetch TPOS data if not provided
    if (!tposData) {
        console.log(`[CUSTOMER-SERVICE] No TPOS data provided, fetching from TPOS for ${normalized}`);
        try {
            const tposResult = await searchCustomerByPhone(normalized);

            if (tposResult.success && tposResult.customer) {
                tposData = tposResult.customer;
                console.log(`[CUSTOMER-SERVICE] Got TPOS data: ${tposData.name} (ID: ${tposData.id})`);
            }
        } catch (tposError) {
            console.error(`[CUSTOMER-SERVICE] TPOS fetch failed for ${normalized}:`, tposError.message);
            // Continue without TPOS data - will use defaults
        }
    }

    // 3. Create customer with full TPOS data
    const name = tposData?.name || 'Khách hàng mới';
    const address = tposData?.address || null;
    const tposId = tposData?.id?.toString() || null;
    const tposDataJson = tposData ? JSON.stringify(tposData) : null;
    // Lấy status từ TPOS, default là 'Bình thường' nếu không có
    const status = tposData?.status || 'Bình thường';

    result = await db.query(`
        INSERT INTO customers (phone, name, address, tpos_id, tpos_data, status, tier, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'new', CURRENT_TIMESTAMP)
        ON CONFLICT (phone) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, customers.name),
            address = COALESCE(EXCLUDED.address, customers.address),
            tpos_id = COALESCE(EXCLUDED.tpos_id, customers.tpos_id),
            tpos_data = COALESCE(EXCLUDED.tpos_data, customers.tpos_data),
            status = COALESCE(EXCLUDED.status, customers.status),
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, name
    `, [normalized, name, address, tposId, tposDataJson, status]);

    const newCustomer = result.rows[0];
    console.log(`[CUSTOMER-SERVICE] Created customer: ${name} (${normalized}) - ID: ${newCustomer.id}, TPOS: ${tposId || 'N/A'}`);

    return {
        customerId: newCustomer.id,
        created: true,
        customerName: newCustomer.name
    };
}

/**
 * Update existing customer with TPOS data
 *
 * @param {Object} db - Database connection
 * @param {number} customerId - Customer ID in database
 * @param {Object} tposData - TPOS customer data
 * @returns {Promise<boolean>} Success status
 */
async function updateCustomerFromTPOS(db, customerId, tposData) {
    if (!customerId || !tposData) {
        return false;
    }

    try {
        await db.query(`
            UPDATE customers SET
                name = COALESCE($2, name),
                address = COALESCE($3, address),
                tpos_id = COALESCE($4, tpos_id),
                tpos_data = COALESCE($5, tpos_data),
                status = COALESCE($6, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [
            customerId,
            tposData.name,
            tposData.address,
            tposData.id?.toString(),
            JSON.stringify(tposData),
            tposData.status
        ]);

        console.log(`[CUSTOMER-SERVICE] Updated customer ID ${customerId} with TPOS data (Status: ${tposData.status || 'N/A'})`);
        return true;
    } catch (error) {
        console.error(`[CUSTOMER-SERVICE] Error updating customer ${customerId}:`, error);
        return false;
    }
}

/**
 * Ensure customer exists for a phone number
 * If not exists, fetch from TPOS and create
 *
 * @param {Object} db - Database connection
 * @param {string} phone - Phone number
 * @returns {Promise<{customerId: number, customerName: string, created: boolean}>}
 */
async function ensureCustomerWithTPOS(db, phone) {
    const normalized = normalizePhone(phone);

    if (!normalized) {
        throw new Error('Invalid phone number');
    }

    // Check if customer exists
    const existing = await db.query('SELECT id, name FROM customers WHERE phone = $1', [normalized]);

    if (existing.rows.length > 0) {
        return {
            customerId: existing.rows[0].id,
            customerName: existing.rows[0].name,
            created: false
        };
    }

    // Customer not exists - fetch from TPOS and create
    console.log(`[CUSTOMER-SERVICE] Customer ${normalized} not found, fetching from TPOS...`);

    const tposResult = await searchCustomerByPhone(normalized);
    const tposData = tposResult.success ? tposResult.customer : null;

    return await getOrCreateCustomerFromTPOS(db, normalized, tposData);
}

/**
 * Batch ensure customers exist for multiple phones
 * Useful for migration and cron jobs
 *
 * @param {Object} db - Database connection
 * @param {string[]} phones - Array of phone numbers
 * @returns {Promise<{success: number, failed: number, results: array}>}
 */
async function batchEnsureCustomers(db, phones) {
    const results = [];
    let success = 0;
    let failed = 0;

    for (const phone of phones) {
        try {
            const result = await ensureCustomerWithTPOS(db, phone);
            results.push({ phone, ...result, error: null });
            success++;
        } catch (error) {
            results.push({ phone, error: error.message });
            failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[CUSTOMER-SERVICE] Batch complete: ${success} success, ${failed} failed`);
    return { success, failed, results };
}

/**
 * Get customer info by phone, including TPOS refresh if needed
 *
 * @param {Object} db - Database connection
 * @param {string} phone - Phone number
 * @param {boolean} forceRefresh - Force refresh from TPOS
 * @returns {Promise<Object|null>} Customer data
 */
async function getCustomerByPhone(db, phone, forceRefresh = false) {
    const normalized = normalizePhone(phone);

    if (!normalized) {
        return null;
    }

    // Get from database
    const result = await db.query(`
        SELECT id, phone, name, address, tpos_id, tpos_data, status, tier, created_at, updated_at
        FROM customers
        WHERE phone = $1
    `, [normalized]);

    if (result.rows.length === 0) {
        return null;
    }

    const customer = result.rows[0];

    // Force refresh from TPOS if requested
    if (forceRefresh) {
        const tposResult = await searchCustomerByPhone(normalized);

        if (tposResult.success && tposResult.customer) {
            await updateCustomerFromTPOS(db, customer.id, tposResult.customer);
            customer.tpos_data = tposResult.customer;
            customer.name = tposResult.customer.name || customer.name;
            customer.address = tposResult.customer.address || customer.address;
        }
    }

    return customer;
}

module.exports = {
    getOrCreateCustomerFromTPOS,
    updateCustomerFromTPOS,
    ensureCustomerWithTPOS,
    batchEnsureCustomers,
    getCustomerByPhone,
    normalizePhone
};
