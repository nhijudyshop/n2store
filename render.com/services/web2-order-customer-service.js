// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// WEB2 ORDER-CUSTOMER SERVICE — adapter mỏng cho kho KH warehouse Web 2.0.
//
// Target bảng: web2_customers (warehouse DUY NHẤT, web2Db) — KHÔNG TPOS.
// (2026-06-07: gộp web2_order_customers vào warehouse, bỏ enrich/sync TPOS.)
//
// Web 2.0 ĐỘC LẬP — KHÔNG liên quan TPOS lẫn Web 1.0. Upsert thẳng warehouse.
// KHÔNG cross-import customer-creation-service.js (Web 1.0, chatDb).
// =====================================================================

const {
    getOrCreateWeb2Customer,
    lookupWeb2CustomerIdByPhone,
    normPhoneWeb2,
} = require('../db/web2-customers-schema');

const TABLE = 'web2_customers';

// Chuẩn hoá SĐT (giữ tên cũ normalizePhone cho caller).
function normalizePhone(phone) {
    return normPhoneWeb2(phone);
}

/**
 * Get/create KH trong web2_customers theo phone (warehouse Web 2.0, KHÔNG TPOS/Web1).
 * `data` (nếu có) chỉ dùng làm name/address gợi ý.
 * @returns {Promise<{customerId:number, created:boolean, customerName:string}>}
 */
async function getOrCreateWeb2OrderCustomer(db, phone, data = null) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error('Invalid phone number');
    const fields = data
        ? {
              name: data.name || undefined,
              address: data.address || undefined,
              email: data.email || undefined,
              fbId: data.fb_id || data.psid || undefined,
              source: data.source || 'pancake',
          }
        : { source: 'pancake' };
    const r = await getOrCreateWeb2Customer(db, normalized, fields);
    return {
        customerId: r.customerId,
        created: !!r.created,
        customerName: r.customerName,
    };
}

/**
 * Lookup id theo phone — KHÔNG tạo mới.
 */
async function lookupCustomerIdByPhone(db, phone) {
    return lookupWeb2CustomerIdByPhone(db, phone);
}

module.exports = {
    getOrCreateWeb2OrderCustomer,
    lookupCustomerIdByPhone,
    normalizePhone,
    WEB2_ORDER_CUSTOMERS_TABLE: TABLE,
};
