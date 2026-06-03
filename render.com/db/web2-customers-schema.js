// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — schema web2_customers (kho KH riêng Web 2.0, trong web2Db).
// =====================================================================
// web2_customers — danh bạ KH riêng của Web 2.0, NẰM TRONG web2Db
// (n2store-web2-db). Thay thế phụ thuộc bảng `customers` Web 1.0 cho
// chức năng tìm/Gán KH ở balance-history.
//
// Nguồn data: TPOS Partner (master thật). web2_customers là shadow độc lập
// với `customers` của Web 1.0 — upsert khi:
//   • Gán KH thủ công (on-demand)
//   • Search theo SĐT trả về từ TPOS (self-populate)
//   • Full sync định kỳ (admin endpoint)
//
// id = TPOS Partner Id (BIGINT) — ổn định, là khóa chính.
// =====================================================================

let _ready = false;

async function ensureWeb2CustomersSchema(pool) {
    if (_ready || !pool) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_customers (
                id           BIGINT PRIMARY KEY,          -- TPOS Partner Id
                phone        VARCHAR(20),                 -- normalized 10-digit (đuôi)
                name         VARCHAR(255) NOT NULL,
                email        VARCHAR(255),
                address      TEXT,
                fb_id        VARCHAR(50),                 -- Facebook user id (cho native-orders lookup)
                status_text  VARCHAR(100),
                date_created TIMESTAMP,
                tpos_raw     JSONB,                       -- snapshot field gốc TPOS
                synced_at    TIMESTAMP DEFAULT NOW(),
                created_at   TIMESTAMP DEFAULT NOW()
            );
            -- 2026-06-03: gộp kho KH — thêm fb_id để 5 route đơn hàng dùng chung
            -- web2_customers thay bảng `customers` copy.
            ALTER TABLE web2_customers ADD COLUMN IF NOT EXISTS fb_id VARCHAR(50);
            -- Search index: phone exact/suffix + fb_id.
            CREATE INDEX IF NOT EXISTS idx_web2_customers_phone ON web2_customers(phone);
            CREATE INDEX IF NOT EXISTS idx_web2_customers_fb_id ON web2_customers(fb_id) WHERE fb_id IS NOT NULL;
        `);
        // Trigram cho name ILIKE nhanh — bọc try riêng vì extension có thể bị chặn.
        try {
            await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
            await pool.query(
                `CREATE INDEX IF NOT EXISTS idx_web2_customers_name_trgm
                 ON web2_customers USING gin (name gin_trgm_ops);`
            );
        } catch (e) {
            console.warn('[web2-customers-schema] pg_trgm index skip:', e.message);
        }
        _ready = true;
        console.log('[web2-customers-schema] web2_customers ready (web2Db)');
    } catch (e) {
        console.error('[web2-customers-schema] ensureSchema failed:', e.message);
    }
}

// Upsert 1 KH từ TPOS partner shape ({id,name,phone,email,address,status,dateCreated})
async function upsertWeb2Customer(pool, c) {
    if (!pool || !c || !c.id) return;
    try {
        await pool.query(
            `INSERT INTO web2_customers
                (id, phone, name, email, address, status_text, date_created, tpos_raw, synced_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())
             ON CONFLICT (id) DO UPDATE SET
                phone        = EXCLUDED.phone,
                name         = EXCLUDED.name,
                email        = EXCLUDED.email,
                address      = EXCLUDED.address,
                status_text  = EXCLUDED.status_text,
                date_created = EXCLUDED.date_created,
                tpos_raw     = EXCLUDED.tpos_raw,
                synced_at    = NOW()`,
            [
                c.id,
                c.phone ? String(c.phone).replace(/\D/g, '').slice(-10) : null,
                c.name || c.displayName || '(không tên)',
                c.email || null,
                c.address || null,
                c.status || c.statusText || null,
                c.dateCreated || null,
                JSON.stringify(c.raw || c),
            ]
        );
    } catch (e) {
        console.warn('[web2-customers-schema] upsert fail id=' + c.id + ':', e.message);
    }
}

function normPhone(p) {
    let s = String(p || '').replace(/\D/g, '');
    if (s.length > 10) s = s.slice(-10);
    if (s && !s.startsWith('0') && s.length === 9) s = '0' + s;
    return s.length === 10 ? s : s || null;
}

// Get/create KH trong web2_customers theo PHONE (thay getOrCreateCustomerFromTPOS
// bản Web 1.0). Trả { customerId: <TPOS Partner Id>, customerName }.
// id = TPOS Partner Id (khác scheme với customers.id cũ — native_orders.customer_id
// nay ref web2_customers.id).
async function getOrCreateWeb2Customer(pool, phone, tposData = null) {
    const p = normPhone(phone);
    if (!p) return { customerId: null, customerName: null };
    // 1. Đã có trong web2_customers?
    const ex = await pool.query(
        'SELECT id, name FROM web2_customers WHERE phone = $1 ORDER BY synced_at DESC LIMIT 1',
        [p]
    );
    if (ex.rows.length) {
        return { customerId: ex.rows[0].id, customerName: ex.rows[0].name, created: false };
    }
    // 2. Fetch TPOS theo phone → upsert
    let data = tposData;
    if (!data || !data.id) {
        try {
            const { searchCustomerByPhone } = require('../services/tpos-customer-service');
            const r = await searchCustomerByPhone(p);
            if (r?.success && r.customer?.id) data = r.customer;
        } catch (e) {
            console.warn('[web2-customers] getOrCreate TPOS lookup fail:', e.message);
        }
    }
    if (!data || !data.id) return { customerId: null, customerName: null };
    await upsertWeb2Customer(pool, data);
    return { customerId: data.id, customerName: data.name, created: true };
}

// Lookup KH theo fb_id (native-orders FB fast path)
async function findWeb2CustomerByFbId(pool, fbId) {
    if (!fbId) return null;
    const r = await pool.query(
        'SELECT id, name, phone, address FROM web2_customers WHERE fb_id = $1 LIMIT 1',
        [String(fbId)]
    );
    return r.rows[0] || null;
}

// Link fb_id vào KH theo PHONE (web2_customers.id là TPOS id, nên link theo phone)
async function linkWeb2CustomerFbId(pool, phone, fbId) {
    const p = normPhone(phone);
    if (!p || !fbId) return;
    try {
        await pool.query(
            `UPDATE web2_customers SET fb_id = $2
             WHERE phone = $1 AND (fb_id IS NULL OR fb_id = '')`,
            [p, String(fbId)]
        );
    } catch (e) {
        console.warn('[web2-customers] linkFbId fail:', e.message);
    }
}

// Lookup id (TPOS) theo phone — KHÔNG tạo mới (fallback nhẹ).
async function lookupWeb2CustomerIdByPhone(pool, phone) {
    const p = normPhone(phone);
    if (!p) return null;
    try {
        const r = await pool.query(
            'SELECT id FROM web2_customers WHERE phone = $1 ORDER BY synced_at DESC LIMIT 1',
            [p]
        );
        return r.rows.length ? r.rows[0].id : null;
    } catch {
        return null;
    }
}

module.exports = {
    ensureWeb2CustomersSchema,
    upsertWeb2Customer,
    getOrCreateWeb2Customer,
    findWeb2CustomerByFbId,
    linkWeb2CustomerFbId,
    lookupWeb2CustomerIdByPhone,
    normPhoneWeb2: normPhone,
};
