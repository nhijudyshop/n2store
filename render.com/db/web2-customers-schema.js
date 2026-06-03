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
                status_text  VARCHAR(100),
                date_created TIMESTAMP,
                tpos_raw     JSONB,                       -- snapshot field gốc TPOS
                synced_at    TIMESTAMP DEFAULT NOW(),
                created_at   TIMESTAMP DEFAULT NOW()
            );
            -- Search index: phone exact/suffix + name (ILIKE) qua trigram.
            CREATE INDEX IF NOT EXISTS idx_web2_customers_phone ON web2_customers(phone);
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

module.exports = { ensureWeb2CustomersSchema, upsertWeb2Customer };
