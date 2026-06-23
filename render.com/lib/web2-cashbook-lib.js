// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Sổ quỹ: schema + helpers dùng chung.
// =====================================================================
// Tách schema + helper (ensureSchema, nextCode, saveImage, filter) khỏi route
// web2-cashbook.js để file route < 800 dòng. Pure logic, không đụng req/res.
// =====================================================================

'use strict';

const now = () => Date.now();

const TYPES = ['receipt', 'payment_cn', 'payment_kd'];
const FUNDS = ['cash', 'bank', 'ewallet'];

// Loại mặc định (seed idempotent). source_code chỉ gắn cho receipt + payment_kd.
const DEFAULT_CATEGORIES = {
    receipt: [
        'Thu tiền khách hàng',
        'Thu hoàn tiền NCC',
        'Thu từ đối tác giao hàng',
        'Rút tiền ngân hàng',
        'Thu nhập khác',
        'Thu nội bộ',
        'Chuyển/Nạp',
    ],
    payment_cn: [
        'Chi ăn uống + tiệc + đi chơi',
        'Chi từ thiện + cúng dường',
        'Chi đi chợ hàng ngày',
        'Chi xây + sửa nhà',
        'Chi phí khác',
        'Chuyển/Rút',
    ],
    payment_kd: [
        'Chi trả tiền NCC',
        'Chi phí vận chuyển',
        'Chi phí mặt bằng',
        'Chi lương nhân viên',
        'Chi nội bộ',
        'Chi phí khác',
        'Chuyển/Rút',
    ],
};

async function ensureSchema(pool) {
    if (!pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_cashbook_images (
            id          SERIAL PRIMARY KEY,
            mime        VARCHAR(40) NOT NULL DEFAULT 'image/jpeg',
            data        BYTEA NOT NULL,
            created_at  BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS web2_cashbook_vouchers (
            id                  SERIAL PRIMARY KEY,
            code                VARCHAR(20) UNIQUE NOT NULL,
            type                VARCHAR(12) NOT NULL,
            fund_type           VARCHAR(10) NOT NULL DEFAULT 'cash',
            category            VARCHAR(160),
            amount              BIGINT NOT NULL DEFAULT 0,
            note                TEXT,
            source_code         VARCHAR(40),
            object_type         VARCHAR(20),
            person_name         VARCHAR(160),
            person_code         VARCHAR(60),
            phone               VARCHAR(30),
            address             TEXT,
            collector           VARCHAR(120),
            account_name        VARCHAR(120),
            account_number      VARCHAR(40),
            transfer_content    TEXT,
            branch              VARCHAR(60),
            image_id            INTEGER REFERENCES web2_cashbook_images(id) ON DELETE SET NULL,
            status              VARCHAR(12) NOT NULL DEFAULT 'paid',
            voucher_time        TIMESTAMPTZ NOT NULL,
            cancelled_at        BIGINT,
            cancel_reason       TEXT,
            created_by          VARCHAR(120),
            created_by_username VARCHAR(60),
            created_by_user_id  INTEGER,
            created_at          BIGINT NOT NULL,
            updated_at          BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_w2cb_time   ON web2_cashbook_vouchers(voucher_time DESC);
        CREATE INDEX IF NOT EXISTS idx_w2cb_type   ON web2_cashbook_vouchers(type);
        CREATE INDEX IF NOT EXISTS idx_w2cb_fund   ON web2_cashbook_vouchers(fund_type);
        CREATE INDEX IF NOT EXISTS idx_w2cb_status ON web2_cashbook_vouchers(status);
        CREATE TABLE IF NOT EXISTS web2_cashbook_categories (
            id          SERIAL PRIMARY KEY,
            type        VARCHAR(12) NOT NULL,
            name        VARCHAR(160) NOT NULL,
            source_code VARCHAR(40),
            sort_order  INTEGER NOT NULL DEFAULT 0,
            active      BOOLEAN NOT NULL DEFAULT TRUE,
            created_at  BIGINT NOT NULL,
            UNIQUE (type, name)
        );
        CREATE TABLE IF NOT EXISTS web2_cashbook_sources (
            code        VARCHAR(40) PRIMARY KEY,
            name        VARCHAR(160) NOT NULL,
            is_default  BOOLEAN NOT NULL DEFAULT FALSE,
            created_at  BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS web2_cashbook_counters (
            prefix      VARCHAR(8) PRIMARY KEY,
            seq         INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS web2_cashbook_audit (
            id          SERIAL PRIMARY KEY,
            voucher_id  INTEGER NOT NULL,
            voucher_code VARCHAR(20),
            action      VARCHAR(20) NOT NULL,
            changes     JSONB NOT NULL DEFAULT '{}'::jsonb,
            user_name   VARCHAR(120),
            username    VARCHAR(60),
            user_id     INTEGER,
            created_at  BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_w2cb_audit_voucher ON web2_cashbook_audit(voucher_id);
    `);
    const t = now();
    for (const type of TYPES) {
        const list = DEFAULT_CATEGORIES[type] || [];
        for (let i = 0; i < list.length; i++) {
            await pool
                .query(
                    `INSERT INTO web2_cashbook_categories (type, name, sort_order, created_at)
                     VALUES ($1,$2,$3,$4) ON CONFLICT (type, name) DO NOTHING`,
                    [type, list[i], i, t]
                )
                .catch(() => {});
        }
    }
}

// Sinh mã phiếu atomic theo prefix (chạy trong transaction caller).
async function nextCode(client, type, fundType) {
    let prefix;
    if (type === 'receipt') {
        prefix = fundType === 'bank' ? 'TNH' : fundType === 'ewallet' ? 'TVD' : 'TTM';
    } else if (type === 'payment_cn') {
        prefix = 'CCN';
    } else {
        prefix = 'CKD';
    }
    const r = await client.query(
        `INSERT INTO web2_cashbook_counters (prefix, seq) VALUES ($1, 1)
         ON CONFLICT (prefix) DO UPDATE SET seq = web2_cashbook_counters.seq + 1
         RETURNING seq`,
        [prefix]
    );
    return prefix + String(r.rows[0].seq).padStart(6, '0');
}

// Lưu ảnh base64 dataUrl → trả image_id (hoặc null).
async function saveImage(client, dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    const mime = m[1].slice(0, 40);
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length || buf.length > 8 * 1024 * 1024) return null; // trần 8MB
    const r = await client.query(
        `INSERT INTO web2_cashbook_images (mime, data, created_at) VALUES ($1,$2,$3) RETURNING id`,
        [mime, buf, now()]
    );
    return r.rows[0].id;
}

function cleanAmount(v) {
    const n = Math.round(Number(v) || 0);
    return n > 0 ? n : 0;
}

// Build WHERE từ query filter (start/end/type/fund/status/category/source/q).
function buildVoucherFilter(q) {
    const where = [];
    const params = [];
    let i = 1;
    if (q.start) {
        where.push(`voucher_time >= $${i++}`);
        params.push(new Date(`${String(q.start).slice(0, 10)}T00:00:00+07:00`).toISOString());
    }
    if (q.end) {
        where.push(`voucher_time <= $${i++}`);
        params.push(new Date(`${String(q.end).slice(0, 10)}T23:59:59+07:00`).toISOString());
    }
    if (TYPES.includes(q.type)) {
        where.push(`type = $${i++}`);
        params.push(q.type);
    }
    if (FUNDS.includes(q.fund)) {
        where.push(`fund_type = $${i++}`);
        params.push(q.fund);
    }
    if (q.status === 'paid' || q.status === 'cancelled') {
        where.push(`status = $${i++}`);
        params.push(q.status);
    }
    if (q.category) {
        where.push(`category = $${i++}`);
        params.push(String(q.category).slice(0, 160));
    }
    if (q.source) {
        where.push(`source_code = $${i++}`);
        params.push(String(q.source).slice(0, 40));
    }
    if (q.q) {
        where.push(
            `(code ILIKE $${i} OR category ILIKE $${i} OR note ILIKE $${i} OR person_name ILIKE $${i})`
        );
        params.push(`%${String(q.q).slice(0, 80)}%`);
        i++;
    }
    return { whereSql: where.length ? 'WHERE ' + where.join(' AND ') : '', params, nextIdx: i };
}

module.exports = {
    TYPES,
    FUNDS,
    DEFAULT_CATEGORIES,
    ensureSchema,
    nextCode,
    saveImage,
    cleanAmount,
    buildVoucherFilter,
};
