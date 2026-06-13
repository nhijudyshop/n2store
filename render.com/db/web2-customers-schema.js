// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — kho KH riêng Web 2.0 (web2_customers @ web2Db). KHÔNG TPOS.
// =====================================================================
// web2_customers — KHO KHÁCH HÀNG RIÊNG của Web 2.0 (warehouse).
//
// ĐỘC LẬP HOÀN TOÀN với TPOS: KHÔNG tpos_id / tpos_data / sync 2 chiều.
// Nguồn dữ liệu: Pancake / Facebook (webhook đơn + chat) / nhập tay.
//   • id        = BIGSERIAL (tự sinh) — khoá nội bộ Web 2.0.
//   • phone     = UNIQUE (đã chuẩn hoá 10 số) — khoá dedup chính.
//   • fb_id     = PSID mặc định (legacy/1-page).
//   • fb_psids  = JSONB {page_id: psid} — multi-page (1 người = 1 PSID/Page).
//   • global_id = FB Global Account Id (BẮT BUỘC để gửi tin — xem
//                 reference_fb_psid_vs_globalid). KHÁC psid.
//
// Là NGUỒN duy nhất cho native-orders / fast-sale-orders / SePay match /
// balance-history / Customer 360. Mọi trang query bằng bất kỳ khoá nào
// (phone / fb_id / global_id / pancake_*) → nhận đủ identity + info.
//
// Beta (2026-06-07): được phép wipe/recreate schema sạch — KHÔNG giữ data cũ.
// =====================================================================

let _ready = false;

async function ensureWeb2CustomersSchema(pool) {
    if (_ready || !pool) return;
    try {
        // ── ONE-TIME MIGRATION (beta) ───────────────────────────────────
        // 1) Bảng web2_customers CŨ (TPOS-coupled, id=Partner Id, có cột
        //    tpos_raw) KHÔNG tương thích warehouse mới (id BIGSERIAL). Beta →
        //    DROP để tạo lại sạch. Phát hiện qua cột `tpos_raw`.
        // 2) web2_order_customers (kho KH đơn cũ) đã gộp vào warehouse → DROP.
        try {
            const old = await pool.query(`
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='web2_customers'
                      AND column_name='tpos_raw'
                ) AS is_old`);
            if (old.rows[0] && old.rows[0].is_old) {
                await pool.query('DROP TABLE IF EXISTS web2_customers CASCADE');
                console.log(
                    '[web2-customers-schema] dropped OLD TPOS-coupled web2_customers (beta recreate)'
                );
            }
        } catch (e) {
            console.warn('[web2-customers-schema] old-shape check skip:', e.message);
        }
        try {
            await pool.query('DROP TABLE IF EXISTS web2_order_customers CASCADE');
        } catch (e) {
            console.warn('[web2-customers-schema] drop web2_order_customers skip:', e.message);
        }

        // ── WAREHOUSE SCHEMA (warehouse mới, KHÔNG TPOS) ────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_customers (
                id            BIGSERIAL PRIMARY KEY,
                code          VARCHAR(40) UNIQUE,            -- KH-xxxxx (tuỳ chọn)
                name          VARCHAR(255) NOT NULL DEFAULT 'Khách hàng mới',
                phone         VARCHAR(20) UNIQUE,            -- chuẩn hoá 10 số (dedup chính)
                email         VARCHAR(255),
                address       TEXT,
                ward          VARCHAR(120),
                district      VARCHAR(120),
                city          VARCHAR(120),
                carrier       VARCHAR(60),                   -- nhà mạng SĐT (gợi ý gọi/zalo)
                status        VARCHAR(40) DEFAULT 'Normal',  -- Normal|Bom|Warning|Danger|VIP
                tier          VARCHAR(40),
                tags          JSONB NOT NULL DEFAULT '[]'::jsonb,
                aliases       JSONB NOT NULL DEFAULT '[]'::jsonb,
                alt_phones    JSONB NOT NULL DEFAULT '[]'::jsonb, -- SĐT phụ (phone chính UNIQUE, phụ không ghi đè)
                note          TEXT,
                -- FB / Messenger identity graph
                fb_id         VARCHAR(50),                   -- PSID mặc định (legacy/1-page)
                fb_psids      JSONB NOT NULL DEFAULT '{}'::jsonb, -- {page_id: psid} multi-page
                global_id     VARCHAR(50),                   -- FB Global Account Id (gửi tin)
                fb_page_id    VARCHAR(50),
                fb_name       VARCHAR(255),
                -- Pancake
                pancake_customer_id     VARCHAR(60),
                pancake_conversation_id VARCHAR(80),
                pancake_page_id         VARCHAR(60),
                -- Thống kê derived (cache)
                total_orders  INTEGER NOT NULL DEFAULT 0,
                total_spent   NUMERIC NOT NULL DEFAULT 0,
                bom_count     INTEGER NOT NULL DEFAULT 0,
                last_order_at BIGINT,
                -- Nguồn / audit
                source        VARCHAR(20) DEFAULT 'manual',  -- pancake|manual|import
                created_by    VARCHAR(100),
                history       JSONB NOT NULL DEFAULT '[]'::jsonb,
                is_active     BOOLEAN NOT NULL DEFAULT true,
                created_at    BIGINT NOT NULL,
                updated_at    BIGINT NOT NULL,
                synced_at     TIMESTAMP DEFAULT NOW()        -- giữ cho consumer cũ (SePay sort)
            );
            ALTER TABLE web2_customers ADD COLUMN IF NOT EXISTS alt_phones JSONB NOT NULL DEFAULT '[]'::jsonb;
            ALTER TABLE web2_customers ADD COLUMN IF NOT EXISTS alt_addresses JSONB NOT NULL DEFAULT '[]'::jsonb;
            CREATE INDEX IF NOT EXISTS idx_web2_customers_phone     ON web2_customers(phone);
            CREATE INDEX IF NOT EXISTS idx_web2_customers_fb_id     ON web2_customers(fb_id) WHERE fb_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_web2_customers_global_id ON web2_customers(global_id) WHERE global_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_web2_customers_pancake   ON web2_customers(pancake_customer_id) WHERE pancake_customer_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_web2_customers_active    ON web2_customers(is_active);
            CREATE INDEX IF NOT EXISTS idx_web2_customers_tags      ON web2_customers USING gin (tags);
            -- GIN cho alt_phones: tra cứu KH theo SĐT phụ (alt_phones ?| $list) dùng index,
            -- không seq-scan toàn bảng trên path enricher batch-by-phone (2026-06-13).
            CREATE INDEX IF NOT EXISTS idx_web2_customers_alt_phones ON web2_customers USING gin (alt_phones);
        `);
        // unaccent + trigram cho name ILIKE không dấu (best-effort, có thể bị chặn)
        try {
            await pool.query('CREATE EXTENSION IF NOT EXISTS unaccent;');
        } catch (e) {
            console.warn('[web2-customers-schema] unaccent skip:', e.message);
        }
        try {
            await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
            await pool.query(
                `CREATE INDEX IF NOT EXISTS idx_web2_customers_name_trgm
                 ON web2_customers USING gin (name gin_trgm_ops);`
            );
        } catch (e) {
            console.warn('[web2-customers-schema] pg_trgm skip:', e.message);
        }
        _ready = true;
        console.log('[web2-customers-schema] web2_customers warehouse ready (web2Db, no TPOS)');
    } catch (e) {
        console.error('[web2-customers-schema] ensureSchema failed:', e.message);
    }
}

// ─── Chuẩn hoá SĐT → 10 số đuôi (0xxxxxxxxx), STRICT ────────────────────
// MEDIUM-cleanup (2026-06-13): TC-phone-norm. Trước đây trả `s || null` →
// cho chuỗi <10 số (phone rác) lọt vào cột `phone` UNIQUE. Giờ:
//   strip non-digit → '84'+9số → '0'+9số → CHỈ trả khi đúng `^0\d{9}$`,
//   không hợp lệ → null. Mọi caller (write/lookup-exact/search) đều muốn
//   giá trị 10 số chuẩn hoặc null; `searchWeb2CustomersByPhone` tự dùng
//   `digits` thô cho suffix-LIKE nên không phụ thuộc junk passthrough.
function normPhone(p) {
    let s = String(p || '').replace(/\D/g, '');
    // '84' + 9 số (=11 digits, SĐT di động VN từ Pancake/FB) → '0' + 9 số.
    if (s.startsWith('84') && s.length === 11) s = '0' + s.slice(2);
    else if (s.length > 10) s = s.slice(-10);
    if (s && !s.startsWith('0') && s.length === 9) s = '0' + s;
    return /^0\d{9}$/.test(s) ? s : null;
}

function _historyEntry(action, extra = {}) {
    return {
        ts: Date.now(),
        action,
        userId: extra.userId || null,
        userName: extra.userName || '(hệ thống)',
        sourcePage: extra.sourcePage || null,
        note: extra.note || null,
    };
}

// ─── Upsert KH theo PHONE (warehouse, KHÔNG TPOS) ───────────────────────
// fields: { name, address, email, fbId, fbPageId, globalId, fbName,
//           pancakeCustomerId, pancakeConversationId, pancakePageId,
//           source, createdBy, ward, district, city, carrier, status }
// Trả { customerId, customerName, created }.
async function getOrCreateWeb2Customer(pool, phone, fields = {}) {
    const p = normPhone(phone);
    if (!p) return { customerId: null, customerName: null, created: false };
    const ex = await pool.query('SELECT id, name FROM web2_customers WHERE phone = $1 LIMIT 1', [
        p,
    ]);
    if (ex.rows.length) {
        // Cập nhật nhẹ field rỗng (không ghi đè dữ liệu sẵn có)
        if (fields && Object.keys(fields).length) {
            await pool.query(
                `UPDATE web2_customers SET
                    name      = CASE WHEN name IN ('', 'Khách hàng mới') THEN COALESCE($2, name) ELSE name END,
                    address   = COALESCE(NULLIF(address,''), $3, address),
                    email     = COALESCE(NULLIF(email,''), $4, email),
                    fb_id     = COALESCE(NULLIF(fb_id,''), $5, fb_id),
                    global_id = COALESCE(NULLIF(global_id,''), $6, global_id),
                    fb_page_id= COALESCE(NULLIF(fb_page_id,''), $7, fb_page_id),
                    synced_at = NOW(),
                    updated_at = $8
                 WHERE id = $1`,
                [
                    ex.rows[0].id,
                    fields.name || null,
                    fields.address || null,
                    fields.email || null,
                    fields.fbId || null,
                    fields.globalId || null,
                    fields.fbPageId || null,
                    Date.now(),
                ]
            );
        }
        return { customerId: ex.rows[0].id, customerName: ex.rows[0].name, created: false };
    }
    const now = Date.now();
    const r = await pool.query(
        `INSERT INTO web2_customers
            (name, phone, address, email, fb_id, global_id, fb_page_id, fb_name,
             pancake_customer_id, pancake_conversation_id, pancake_page_id,
             source, created_by, history, created_at, updated_at, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$15,NOW())
         ON CONFLICT (phone) DO UPDATE SET
            name = CASE WHEN web2_customers.name IN ('', 'Khách hàng mới')
                        THEN EXCLUDED.name ELSE web2_customers.name END,
            address = COALESCE(NULLIF(web2_customers.address,''), EXCLUDED.address),
            fb_id   = COALESCE(NULLIF(web2_customers.fb_id,''), EXCLUDED.fb_id),
            updated_at = EXCLUDED.updated_at,
            synced_at = NOW()
         RETURNING id, name`,
        [
            fields.name || 'Khách hàng mới',
            p,
            fields.address || null,
            fields.email || null,
            fields.fbId || null,
            fields.globalId || null,
            fields.fbPageId || null,
            fields.fbName || null,
            fields.pancakeCustomerId || null,
            fields.pancakeConversationId || null,
            fields.pancakePageId || null,
            fields.source || 'pancake',
            fields.createdBy || null,
            JSON.stringify([
                _historyEntry('create', { note: 'auto từ ' + (fields.source || 'đơn/chat') }),
            ]),
            now,
        ]
    );
    return { customerId: r.rows[0].id, customerName: r.rows[0].name, created: true };
}

// ─── Lookup KH theo fb_id (PSID) — native-orders FB fast path ───────────
async function findWeb2CustomerByFbId(pool, fbId) {
    if (!fbId) return null;
    const r = await pool.query(
        'SELECT id, name, phone, address FROM web2_customers WHERE fb_id = $1 LIMIT 1',
        [String(fbId)]
    );
    return r.rows[0] || null;
}

// ─── Link fb_id vào KH theo PHONE (chỉ khi fb_id trống) ─────────────────
async function linkWeb2CustomerFbId(pool, phone, fbId) {
    const p = normPhone(phone);
    if (!p || !fbId) return;
    try {
        await pool.query(
            `UPDATE web2_customers SET fb_id = $2, synced_at = NOW()
             WHERE phone = $1 AND (fb_id IS NULL OR fb_id = '')`,
            [p, String(fbId)]
        );
    } catch (e) {
        console.warn('[web2-customers] linkFbId fail:', e.message);
    }
}

// ─── Thêm SĐT PHỤ cho KH (phone chính KHÔNG ghi đè) ─────────────────────
// Tìm KH theo customerId HOẶC fbId. Nếu newPhone khác phone chính + chưa có
// trong alt_phones → append. "Ưu tiên kho KH là chính, thêm thông tin phụ".
// Trả về { added, primaryPhone } hoặc null nếu không tìm thấy KH.
async function addWeb2AltPhone(pool, { customerId, fbId, phone }) {
    const p = normPhone(phone);
    if (!p) return null;
    let row;
    try {
        if (customerId) {
            const r = await pool.query(
                'SELECT id, phone, alt_phones FROM web2_customers WHERE id = $1 LIMIT 1',
                [customerId]
            );
            row = r.rows[0];
        } else if (fbId) {
            const r = await pool.query(
                'SELECT id, phone, alt_phones FROM web2_customers WHERE fb_id = $1 LIMIT 1',
                [String(fbId)]
            );
            row = r.rows[0];
        }
    } catch (e) {
        console.warn('[web2-customers] addAltPhone lookup fail:', e.message);
        return null;
    }
    if (!row) return null;
    // Trùng phone chính → bỏ qua (đã là chính).
    if (row.phone && normPhone(row.phone) === p) return { added: false, primaryPhone: row.phone };
    let alt = Array.isArray(row.alt_phones) ? row.alt_phones.map(String) : [];
    if (alt.includes(p)) return { added: false, primaryPhone: row.phone };
    alt.push(p);
    try {
        await pool.query(
            `UPDATE web2_customers SET alt_phones = $2::jsonb, updated_at = $3 WHERE id = $1`,
            [row.id, JSON.stringify(alt), Date.now()]
        );
    } catch (e) {
        console.warn('[web2-customers] addAltPhone update fail:', e.message);
        return null;
    }
    return { added: true, primaryPhone: row.phone, altPhones: alt };
}

// ─── Lookup id theo phone — KHÔNG tạo mới ───────────────────────────────
async function lookupWeb2CustomerIdByPhone(pool, phone) {
    const p = normPhone(phone);
    if (!p) return null;
    try {
        const r = await pool.query('SELECT id FROM web2_customers WHERE phone = $1 LIMIT 1', [p]);
        return r.rows.length ? r.rows[0].id : null;
    } catch {
        return null;
    }
}

// ─── Tìm KH theo SĐT (partial/suffix) — KHO KH, THAY TPOS cho matcher SePay ──
// 2026-06-09: gỡ TPOS khỏi matcher. Khớp phone CHÍNH hoặc alt_phones theo đuôi.
// Gom theo PHONE CHÍNH của KH (ưu tiên kho KH — ví keyed theo phone chính dù
// khớp qua SĐT phụ). Trả CÙNG shape searchTposByPhone (để matcher dùng thẳng):
//   { success, uniquePhones: [{ phone, customers:[{id,name,phone,...}], count }], totalResults }
async function searchWeb2CustomersByPhone(pool, partialPhone) {
    const digits = String(partialPhone || '').replace(/\D/g, '');
    if (digits.length < 5) return { success: true, uniquePhones: [], totalResults: 0 };
    try {
        let rows = [];
        const norm = normPhone(digits);
        // Fast path: SĐT 10 số chuẩn → exact (dùng index idx_web2_customers_phone).
        if (norm && norm.length === 10 && digits.length >= 9) {
            const r = await pool.query(
                `SELECT id, name, phone, address, email FROM web2_customers WHERE phone = $1 LIMIT 50`,
                [norm]
            );
            rows = r.rows;
        }
        // Suffix match phone chính + alt_phones (khi chưa có exact hit).
        if (!rows.length) {
            const r = await pool.query(
                `SELECT id, name, phone, address, email FROM web2_customers
                 WHERE phone LIKE '%' || $1
                    OR EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(COALESCE(alt_phones,'[]'::jsonb)) ap
                        WHERE ap LIKE '%' || $1
                    )
                 LIMIT 50`,
                [digits]
            );
            rows = r.rows;
        }
        const phoneMap = new Map();
        for (const c of rows) {
            const np = normPhone(c.phone) || c.phone;
            if (!np) continue;
            if (!phoneMap.has(np)) phoneMap.set(np, []);
            phoneMap.get(np).push({
                id: c.id,
                name: c.name,
                phone: np,
                address: c.address,
                email: c.email,
            });
        }
        const uniquePhones = Array.from(phoneMap.entries()).map(([phone, customers]) => ({
            phone,
            customers,
            count: customers.length,
        }));
        return { success: true, uniquePhones, totalResults: rows.length };
    } catch (e) {
        console.warn('[web2-customers] searchWeb2CustomersByPhone error:', e.message);
        return { success: false, uniquePhones: [], totalResults: 0, error: e.message };
    }
}

// ─── Import 1 KH từ Pancake live-comment vào KHO — NON-DESTRUCTIVE ──────
// Quy tắc (user 2026-06-09): tự động thêm, KHÔNG đè dữ liệu cũ.
//   - Match KH có sẵn theo phone CHÍNH / alt_phones; fallback fb_id.
//   - Có match → KHÔNG ghi đè name/address. SĐT mới (khác chính + chưa có) →
//     append alt_phones. Địa chỉ mới (khác chính + chưa có) → append
//     alt_addresses. Field rỗng (address/fb_id/name placeholder) → điền.
//   - Không match → INSERT hàng mới (phone chính UNIQUE, cho phép null).
// Trả { customerId, created, addedPhone, addedAddress, matchedBy } | null.
async function importPancakeCustomerWeb2(
    pool,
    { phone, name, address, fbId, pageId, source = 'live_comment' } = {}
) {
    const p = normPhone(phone);
    const addr = String(address || '').trim();
    const nm = String(name || '').trim();
    const fid = fbId ? String(fbId) : null;
    if (!p && !fid) return null; // không đủ định danh

    let row = null;
    let matchedBy = null;
    try {
        if (p) {
            const r = await pool.query(
                `SELECT id, phone, name, address, fb_id, alt_phones, alt_addresses
                 FROM web2_customers
                 WHERE phone = $1
                    OR EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(COALESCE(alt_phones,'[]'::jsonb)) ap
                        WHERE ap = $1
                    )
                 LIMIT 1`,
                [p]
            );
            row = r.rows[0] || null;
            if (row) matchedBy = 'phone';
        }
        if (!row && fid) {
            const r = await pool.query(
                `SELECT id, phone, name, address, fb_id, alt_phones, alt_addresses
                 FROM web2_customers WHERE fb_id = $1 LIMIT 1`,
                [fid]
            );
            row = r.rows[0] || null;
            if (row) matchedBy = 'fb_id';
        }
    } catch (e) {
        console.warn('[web2-customers] importPancake lookup fail:', e.message);
        return null;
    }

    if (row) {
        const alt = Array.isArray(row.alt_phones) ? row.alt_phones.map(String) : [];
        const altAddr = Array.isArray(row.alt_addresses) ? row.alt_addresses.map(String) : [];
        let addedPhone = false;
        let addedAddress = false;
        if (p && normPhone(row.phone) !== p && !alt.includes(p)) {
            alt.push(p);
            addedPhone = true;
        }
        if (addr && String(row.address || '').trim() !== addr && !altAddr.includes(addr)) {
            altAddr.push(addr);
            addedAddress = true;
        }
        try {
            await pool.query(
                `UPDATE web2_customers SET
                    alt_phones    = $2::jsonb,
                    alt_addresses = $3::jsonb,
                    address  = COALESCE(NULLIF(address,''), $4),
                    name     = CASE WHEN name IN ('', 'Khách hàng mới')
                                    THEN COALESCE(NULLIF($5,''), name) ELSE name END,
                    fb_id    = COALESCE(NULLIF(fb_id,''), $6),
                    updated_at = $7, synced_at = NOW()
                 WHERE id = $1`,
                [
                    row.id,
                    JSON.stringify(alt),
                    JSON.stringify(altAddr),
                    addr || null,
                    nm || null,
                    fid,
                    Date.now(),
                ]
            );
        } catch (e) {
            console.warn('[web2-customers] importPancake merge fail:', e.message);
            return null;
        }
        return { customerId: row.id, created: false, addedPhone, addedAddress, matchedBy };
    }

    // Không match → tạo hàng mới
    const now = Date.now();
    try {
        const ins = await pool.query(
            `INSERT INTO web2_customers
                (name, phone, address, fb_id, fb_page_id, source, history, created_at, updated_at, synced_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8,NOW())
             ON CONFLICT (phone) DO NOTHING
             RETURNING id`,
            [
                nm || 'Khách hàng mới',
                p || null,
                addr || null,
                fid,
                pageId || null,
                source,
                JSON.stringify([_historyEntry('create', { note: 'auto import từ ' + source })]),
                now,
            ]
        );
        if (ins.rows[0]) {
            return {
                customerId: ins.rows[0].id,
                created: true,
                addedPhone: !!p,
                addedAddress: !!addr,
                matchedBy: null,
            };
        }
    } catch (e) {
        console.warn('[web2-customers] importPancake insert fail:', e.message);
    }
    // ON CONFLICT DO NOTHING (race) → re-lookup theo phone
    if (p) {
        try {
            const r = await pool.query('SELECT id FROM web2_customers WHERE phone = $1 LIMIT 1', [
                p,
            ]);
            if (r.rows[0]) return { customerId: r.rows[0].id, created: false, matchedBy: 'phone' };
        } catch {
            /* ignore */
        }
    }
    return null;
}

module.exports = {
    ensureWeb2CustomersSchema,
    getOrCreateWeb2Customer,
    findWeb2CustomerByFbId,
    linkWeb2CustomerFbId,
    lookupWeb2CustomerIdByPhone,
    searchWeb2CustomersByPhone,
    addWeb2AltPhone,
    importPancakeCustomerWeb2,
    normPhoneWeb2: normPhone,
    _historyEntry,
};
