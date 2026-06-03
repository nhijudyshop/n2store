// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// WEB2 ORDER-CUSTOMER SERVICE — kho KH đơn hàng Web 2.0 (Pancake/FB)
//
// Target bảng: web2_order_customers (trong web2Db) — đổi tên từ `customers`
// (2026-06-03) để tránh nhầm với bảng customers Web 1.0 (chatDb) và với
// web2_customers (kho TPOS-synced cho search/sửa).
//
// Đây là kho riêng của native-orders / fast-sale-orders / web2-customer-tpos:
//   nguồn dữ liệu Pancake/Facebook (webhook đơn) — schema giàu:
//   id, phone(UNIQUE), name, address, email, fb_id, pancake_data,
//   status, tier, tpos_id, tpos_data, aliases, created_at, updated_at.
//
// Tách hoàn toàn khỏi services/customer-creation-service.js (Web 1.0, bảng
// `customers` ở chatDb) — KHÔNG cross-import (CLAUDE.md rule #4).
// =====================================================================

const { searchCustomerByPhone, normalizePhone } = require('./tpos-customer-service');

const TABLE = 'web2_order_customers';

/**
 * Get/create KH trong web2_order_customers (theo phone), enrich từ TPOS nếu có.
 * @returns {Promise<{customerId:number, created:boolean, customerName:string}>}
 */
async function getOrCreateCustomerFromTPOS(db, phone, tposData = null) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error('Invalid phone number');

    // 1. Đã tồn tại?
    let result = await db.query(`SELECT id, name FROM ${TABLE} WHERE phone = $1`, [normalized]);
    if (result.rows.length > 0) {
        const existing = result.rows[0];
        if (tposData && tposData.id) {
            await db.query(
                `UPDATE ${TABLE} SET
                    name      = COALESCE($2, name),
                    address   = COALESCE($3, address),
                    tpos_id   = COALESCE($4, tpos_id),
                    tpos_data = COALESCE($5, tpos_data),
                    status    = COALESCE($6, status),
                    updated_at = NOW()
                 WHERE phone = $1`,
                [
                    normalized,
                    tposData.name,
                    tposData.address,
                    tposData.id?.toString(),
                    JSON.stringify(tposData),
                    tposData.status || null,
                ]
            );
        }
        return {
            customerId: existing.id,
            created: false,
            customerName: tposData?.name || existing.name,
        };
    }

    // 2. Chưa có → fetch TPOS nếu chưa truyền
    if (!tposData) {
        try {
            const r = await searchCustomerByPhone(normalized);
            if (r.success && r.customer) tposData = r.customer;
        } catch (e) {
            console.error(`[web2-order-customer] TPOS fetch fail ${normalized}:`, e.message);
        }
    }

    // 3. Insert
    const name = tposData?.name || 'Khách hàng mới';
    const address = tposData?.address || null;
    const tposId = tposData?.id?.toString() || null;
    const tposDataJson = tposData ? JSON.stringify(tposData) : null;
    const status = tposData?.status || null;

    result = await db.query(
        `INSERT INTO ${TABLE} (phone, name, address, tpos_id, tpos_data, status, tier, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'new', NOW(), NOW())
         ON CONFLICT (phone) DO UPDATE SET
            name      = COALESCE(EXCLUDED.name, ${TABLE}.name),
            address   = COALESCE(EXCLUDED.address, ${TABLE}.address),
            tpos_id   = COALESCE(EXCLUDED.tpos_id, ${TABLE}.tpos_id),
            tpos_data = COALESCE(EXCLUDED.tpos_data, ${TABLE}.tpos_data),
            status    = COALESCE(EXCLUDED.status, ${TABLE}.status),
            updated_at = NOW()
         RETURNING id, name`,
        [normalized, name, address, tposId, tposDataJson, status]
    );
    const c = result.rows[0];
    return { customerId: c.id, created: true, customerName: c.name };
}

/**
 * Update KH theo id với TPOS data.
 */
async function updateCustomerFromTPOS(db, customerId, tposData) {
    if (!customerId || !tposData) return false;
    try {
        await db.query(
            `UPDATE ${TABLE} SET
                name      = COALESCE($2, name),
                address   = COALESCE($3, address),
                tpos_id   = COALESCE($4, tpos_id),
                tpos_data = COALESCE($5, tpos_data),
                updated_at = NOW()
             WHERE id = $1`,
            [
                customerId,
                tposData.name,
                tposData.address,
                tposData.id?.toString(),
                JSON.stringify(tposData),
            ]
        );
        return true;
    } catch (e) {
        console.error(`[web2-order-customer] update ${customerId} fail:`, e.message);
        return false;
    }
}

/**
 * Lookup id theo phone — KHÔNG tạo mới.
 */
async function lookupCustomerIdByPhone(db, phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const r = await db.query(`SELECT id FROM ${TABLE} WHERE phone = $1 LIMIT 1`, [normalized]);
    return r.rows.length ? r.rows[0].id : null;
}

module.exports = {
    getOrCreateCustomerFromTPOS,
    updateCustomerFromTPOS,
    lookupCustomerIdByPhone,
    normalizePhone,
    WEB2_ORDER_CUSTOMERS_TABLE: TABLE,
};
