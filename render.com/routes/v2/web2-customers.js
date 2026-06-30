// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — route kho KH warehouse (web2_customers, web2Db). KHÔNG TPOS.
// =====================================================================
// /api/web2/customers — KHO KHÁCH HÀNG RIÊNG Web 2.0 (warehouse).
// ĐỘC LẬP TPOS: không lookup/push/sync TPOS. Nguồn: Pancake/FB/nhập tay.
//
//   GET    /list                       — list + search/filter/paginate (CRUD)
//   GET    /search?search=&limit=       — autocomplete (id,phone,name,address,fbId)
//   GET    /:phone                      — 1 KH theo SĐT
//   GET    /by-phone/:phone/orders      — lịch sử đơn (native + PBH)
//   GET    /:phone/fb-conversation      — resolve SĐT → ngữ cảnh chat FB
//   POST   /create                      — tạo KH (CRUD)
//   POST   /upsert                      — upsert theo SĐT (chat → "Thêm KH")
//   POST   /enrich-fb                   — link fb_id vào kho (Web2Chat tự gọi)
//   POST   /harvest-comments            — gom KH từ comment livestream (Force extract)
//   POST   /merge                       — gộp 2 KH trùng
//   PATCH  /:id                         — sửa KH (mọi trang Web 2.0)
//   DELETE /:id                         — xoá/soft-archive KH
//
// SSE: _notify('web2:customers', …) sau mỗi mutation (realtime đa tab/máy).
// =====================================================================

const express = require('express');
// 3H14 (2026-06-12): mutation kho KH gate SOFT — enforce khi env WEB2_AUTH_ENFORCE=1.
const { requireWeb2AuthSoft } = require('../../middleware/web2-auth');
const { recordAuditEvent } = require('../../services/web2-audit-sink');
const router = express.Router();
const {
    getOrCreateWeb2Customer,
    findWeb2CustomerByFbId,
    linkWeb2CustomerFbId,
    addWeb2AltPhone,
    importPancakeCustomerWeb2,
    normPhoneWeb2,
    _historyEntry,
} = require('../../db/web2-customers-schema');

// ─── SSE notifier (wired ở server.js: initializeNotifiers) ──────────────
let _notifyClients = null;
function initializeNotifiers(fn) {
    _notifyClients = fn;
}
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:customers', { action, id: id || null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[web2-customers] _notify failed:', e.message);
    }
}
// EVENT-SINK audit toàn bộ (2026-06-22): ghi web2_audit_events cho thao tác KH có
// user (tạo/sửa/lưu trữ/xoá/gộp). Bỏ qua import/harvest/enrich tự động (không user).
function _auditCustomer(req, action, id, changes) {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    recordAuditEvent(pool, {
        entity: 'customer',
        entityId: id != null ? String(id) : null,
        action,
        userId: req.web2User?.id ?? (req.body?.userId || null),
        userName: req.web2User?.display_name || req.body?.userName || null,
        sourcePage: 'customers',
        changes: changes || {},
    });
}

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// Chuẩn hoá SĐT từ comment/Pancake (vd '84912345678', '+84912345678') về dạng
// VN nội địa '0xxxxxxxxx' TRƯỚC khi đưa qua normPhoneWeb2 + INSERT. Lý do:
// normPhoneWeb2 (schema) chỉ slice(-10) → '84912345678' (11 số) → '4912345678'
// (mất số 0 đầu, SAI). Ở đây chuyển '84'+9 số → '0'+9 số rồi mới normalize.
// Trả null nếu không đủ điều kiện (để caller bỏ qua / dùng giá trị gốc an toàn).
function normPancakePhone(raw) {
    let s = String(raw || '').replace(/[^\d]/g, ''); // bỏ '+', khoảng trắng, ký tự
    // '84' + 9 số (=11 digits) → '0' + 9 số (số di động VN chuẩn).
    if (s.startsWith('84') && s.length === 11) s = '0' + s.slice(2);
    return normPhoneWeb2(s);
}

// Đảm bảo UNIQUE partial index trên fb_id (idempotent, chạy 1 lần). Cần cho
// `ON CONFLICT (fb_id) WHERE fb_id IS NOT NULL DO NOTHING` ở _harvestOneComment:
// schema gốc chỉ có CREATE INDEX (non-unique) trên fb_id → 2 harvest đồng thời
// cùng fb_id (chưa có trong DB) có thể INSERT trùng. Guard try/catch: nếu đã có
// dữ liệu trùng fb_id, CREATE UNIQUE INDEX fail → log + bỏ qua (INSERT vẫn chạy,
// chỉ là conflict target có thể chưa active cho tới khi dedupe xong).
let _fbIdUniqueEnsured = false;
async function _ensureFbIdUniqueIndex(db) {
    if (_fbIdUniqueEnsured) return;
    try {
        await db.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_web2_customers_fb_id_unique
             ON web2_customers (fb_id) WHERE fb_id IS NOT NULL`
        );
        _fbIdUniqueEnsured = true;
    } catch (e) {
        // Trùng fb_id sẵn có → không tạo được unique index. Không chặn request.
        console.warn(
            '[web2-customers] ensure fb_id unique index skip (có thể có fb_id trùng):',
            e.message
        );
    }
}

// Chuẩn hoá danh sách SĐT phụ: bỏ rỗng/không hợp lệ, KHÔNG trùng phone chính,
// dedupe. 1 KH nhiều SĐT → phone chính UNIQUE, các SĐT khác vào alt_phones.
function sanitizeAltPhones(raw, primaryPhone) {
    if (!Array.isArray(raw)) return [];
    const primary = normPhoneWeb2(primaryPhone);
    const out = [];
    for (const p of raw) {
        const n = normPhoneWeb2(p);
        if (!n) continue;
        if (primary && n === primary) continue;
        if (!out.includes(n)) out.push(n);
    }
    return out;
}

// Chuẩn hoá danh sách ĐỊA CHỈ phụ: trim, bỏ rỗng, KHÔNG trùng address chính,
// dedupe. 1 KH nhiều địa chỉ → address chính + các địa chỉ khác vào alt_addresses.
function sanitizeAltAddresses(raw, primaryAddress) {
    if (!Array.isArray(raw)) return [];
    const primary = String(primaryAddress || '').trim();
    const out = [];
    for (const a of raw) {
        const s = String(a || '').trim();
        if (!s) continue;
        if (primary && s === primary) continue;
        if (!out.includes(s)) out.push(s);
    }
    return out;
}

// Hàng search gọn (autocomplete) — giữ shape cũ cho frontend hiện tại.
function rowToLite(r) {
    return {
        id: r.id,
        phone: r.phone || '',
        name: r.name || '',
        address: r.address || '',
        email: r.email || '',
        fbId: r.fb_id || '',
        status: r.status || 'Normal', // 1 nguồn chung — modal/lookup hiển thị trạng thái
        tier: r.tier || null,
    };
}

// Bản đầy đủ (list + detail).
function rowToFull(r) {
    return {
        id: Number(r.id),
        code: r.code || null,
        name: r.name || '',
        phone: r.phone || '',
        email: r.email || '',
        address: r.address || '',
        ward: r.ward || null,
        district: r.district || null,
        city: r.city || null,
        carrier: r.carrier || null,
        status: r.status || 'Normal',
        tier: r.tier || null,
        tags: Array.isArray(r.tags) ? r.tags : [],
        aliases: Array.isArray(r.aliases) ? r.aliases : [],
        altPhones: Array.isArray(r.alt_phones) ? r.alt_phones : [],
        altAddresses: Array.isArray(r.alt_addresses) ? r.alt_addresses : [],
        note: r.note || null,
        fbId: r.fb_id || null,
        fbPsids: r.fb_psids || {},
        globalId: r.global_id || null,
        fbPageId: r.fb_page_id || null,
        fbName: r.fb_name || null,
        pancakeCustomerId: r.pancake_customer_id || null,
        pancakeConversationId: r.pancake_conversation_id || null,
        pancakePageId: r.pancake_page_id || null,
        totalOrders: Number(r.total_orders || 0),
        totalSpent: Number(r.total_spent || 0),
        bomCount: Number(r.bom_count || 0),
        lastOrderAt: r.last_order_at != null ? Number(r.last_order_at) : null,
        source: r.source || null,
        createdBy: r.created_by || null,
        history: Array.isArray(r.history) ? r.history : [],
        isActive: !!r.is_active,
        createdAt: r.created_at != null ? Number(r.created_at) : null,
        updatedAt: r.updated_at != null ? Number(r.updated_at) : null,
    };
}

// ─── GET /list — list + search/filter/paginate (CRUD UI) ────────────────
// Auth (soft → 401 khi WEB2_AUTH_ENFORCE=1): dump toàn bộ kho KH (PII tên/SĐT/
// địa chỉ/fb_id) không auth = rò rỉ. (audit 2026-06-30)
router.get('/list', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    if (!db) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        const { search, status, tier, source, tag, activeOnly } = req.query;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const offset = (page - 1) * limit;

        // Build WHERE clause; `useUnaccent` toggles accent-insensitive name match
        // (cho phép gõ "huynh thanh dat" tìm ra "Huỳnh Thành Đạt").
        const buildWhere = (useUnaccent) => {
            const conds = [];
            const params = [];
            if (activeOnly === 'true' || activeOnly === '1') conds.push('is_active = true');
            if (search) {
                params.push(`%${search}%`);
                const i = params.length;
                const nameMatch = useUnaccent
                    ? `unaccent(name) ILIKE unaccent($${i})`
                    : `name ILIKE $${i}`;
                // alt_phones (JSONB): tra cứu theo SĐT phụ cũng phải ra KH (2026-06-13)
                const altMatch = `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(alt_phones,'[]'::jsonb)) ap WHERE ap ILIKE $${i})`;
                conds.push(
                    `(phone ILIKE $${i} OR ${nameMatch} OR fb_id ILIKE $${i} OR global_id ILIKE $${i} OR ${altMatch})`
                );
            }
            if (status) {
                params.push(status);
                conds.push(`status = $${params.length}`);
            }
            if (tier) {
                params.push(tier);
                conds.push(`tier = $${params.length}`);
            }
            if (source) {
                params.push(source);
                conds.push(`source = $${params.length}`);
            }
            if (tag) {
                params.push(JSON.stringify([tag]));
                conds.push(`tags @> $${params.length}::jsonb`);
            }
            return { where: conds.length ? 'WHERE ' + conds.join(' AND ') : '', params };
        };

        const runQueries = async (useUnaccent) => {
            const { where, params } = buildWhere(useUnaccent);
            const countR = await db.query(
                `SELECT COUNT(*)::int n FROM web2_customers ${where}`,
                params
            );
            const lp = [...params, limit, offset];
            const listR = await db.query(
                `SELECT * FROM web2_customers ${where}
                 ORDER BY updated_at DESC NULLS LAST, id DESC
                 LIMIT $${lp.length - 1} OFFSET $${lp.length}`,
                lp
            );
            return { total: countR.rows[0].n, rows: listR.rows };
        };

        let result;
        try {
            result = await runQueries(true);
        } catch (unaccentErr) {
            // unaccent extension chưa cài → fallback accent-sensitive ILIKE
            console.warn('[web2-customers] list unaccent fallback:', unaccentErr.message);
            result = await runQueries(false);
        }
        const { total, rows } = result;
        const r = { rows };
        res.json({
            success: true,
            data: r.rows.map(rowToFull),
            total,
            page,
            limit,
            hasMore: offset + r.rows.length < total,
        });
    } catch (e) {
        console.error('[web2-customers] list error:', e.message);
        res.status(500).json({ success: false, error: e.message, data: [] });
    }
});

// ─── POST /batch-by-fbid {fbIds:[...]} → {data:{fbId: customer}} ────────
// Cho enricher tpos-pancake đọc kho KH warehouse theo fb_id (PSID) hàng loạt
// (thay /api/v2/customers/batch của Web 1.0). 1 SĐT = 1 KH, nhưng fb_id riêng.
// Auth (soft → 401 khi WEB2_AUTH_ENFORCE=1): lộ PII KH (tên/SĐT/địa chỉ/fb_id)
// không auth = rò rỉ. Mọi caller đã gắn x-web2-token (customer-store, native-orders,
// live-api, comments-mobile postJson đã vá). (audit r2 2026-06-21)
router.post('/batch-by-fbid', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const fbIds = Array.isArray(req.body?.fbIds) ? req.body.fbIds.map(String).filter(Boolean) : [];
    if (!fbIds.length) return res.json({ success: true, data: {} });
    const ids = fbIds.slice(0, 500); // cap
    try {
        // Match fb_id (primary) HOẶC fb_psids (multi-account: 1 SĐT nhiều FB) — key
        // của fb_psids chứa từng fbId (backfill từ Web1 customers ghi {fbId:fbId}).
        const r = await db.query(
            `SELECT id, fb_id, name, phone, address, status, global_id, fb_psids
             FROM web2_customers WHERE fb_id = ANY($1) OR fb_psids ?| $1`,
            [ids]
        );
        const want = new Set(ids);
        const map = {};
        for (const row of r.rows) {
            const lite = rowToLite(row);
            if (row.fb_id && want.has(row.fb_id)) map[row.fb_id] = lite;
            const psids = row.fb_psids || {};
            for (const key of Object.keys(psids)) {
                if (want.has(key)) map[key] = lite;
            }
        }
        res.json({ success: true, data: map });
    } catch (e) {
        console.error('[web2-customers] batch-by-fbid error:', e.message);
        res.status(500).json({ success: false, error: e.message, data: {} });
    }
});

// ─── POST /batch-by-phone {phones:[...]} → {data:{phone: partner-like}} ─
// Cho enricher balance-history/customer-wallet đọc status/info KH theo phone
// hàng loạt (thay PartnerCustomerApi.listByPhones của TPOS). Shape partner-
// compat (Id/Name/Phone/Status/Address) để frontend không phải đổi nhiều.
// Auth (soft): lộ PII KH theo SĐT không auth = rò rỉ. (audit r2 2026-06-21)
router.post('/batch-by-phone', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const raw = Array.isArray(req.body?.phones) ? req.body.phones : [];
    const phones = raw.map((p) => normPhoneWeb2(p)).filter(Boolean);
    if (!phones.length) return res.json({ success: true, data: {} });
    const list = phones.slice(0, 500);
    try {
        // Match cả phone chính LẪN alt_phones (SĐT phụ) — tra theo số phụ vẫn ra KH (2026-06-13).
        // `alt_phones ?| $1` dùng GIN index idx_web2_customers_alt_phones (BitmapOr với
        // index phone) → không seq-scan toàn bảng 64k rows trên path enricher.
        const r = await db.query(
            `SELECT id, phone, name, address, status, alt_phones
             FROM web2_customers
             WHERE phone = ANY($1) OR alt_phones ?| $1`,
            [list]
        );
        const toCompat = (row, phone) => ({
            Id: row.id,
            Name: row.name || '',
            Phone: phone,
            Status: row.status || '',
            Address: row.address || '',
        });
        const map = {};
        // Phone chính trước (ưu tiên cao hơn alt khi 1 số là chính của KH này, phụ của KH khác)
        for (const row of r.rows) {
            if (row.phone && list.includes(row.phone) && !map[row.phone]) {
                map[row.phone] = toCompat(row, row.phone);
            }
        }
        // Rồi map các SĐT phụ được hỏi → KH tương ứng (chỉ fill khi chưa có từ phone chính)
        const requested = new Set(list);
        for (const row of r.rows) {
            const alts = Array.isArray(row.alt_phones) ? row.alt_phones : [];
            for (const alt of alts) {
                if (alt && requested.has(alt) && !map[alt]) {
                    map[alt] = toCompat(row, alt);
                }
            }
        }
        res.json({ success: true, data: map });
    } catch (e) {
        console.error('[web2-customers] batch-by-phone error:', e.message);
        res.status(500).json({ success: false, error: e.message, data: {} });
    }
});

// ─── GET /search?search=...&limit=8 — autocomplete (warehouse only) ─────
// Auth (soft): lộ PII KH qua autocomplete không auth = rò rỉ. (audit 2026-06-30)
router.get('/search', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const q = String(req.query.search || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 50);
    if (q.length < 2) return res.json({ success: true, data: [] });
    try {
        const like = `%${q}%`;
        let r;
        try {
            // accent-insensitive name + phone/fb match + alt_phones (SĐT phụ)
            r = await db.query(
                `SELECT id, phone, name, email, address, fb_id
                 FROM web2_customers
                 WHERE unaccent(name) ILIKE unaccent($1) OR phone ILIKE $1 OR fb_id ILIKE $1
                    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(alt_phones,'[]'::jsonb)) ap WHERE ap ILIKE $1)
                 ORDER BY updated_at DESC NULLS LAST
                 LIMIT $2`,
                [like, limit]
            );
        } catch (unaccentErr) {
            console.warn('[web2-customers] unaccent fallback:', unaccentErr.message);
            r = await db.query(
                `SELECT id, phone, name, email, address, fb_id
                 FROM web2_customers
                 WHERE name ILIKE $1 OR phone ILIKE $1 OR fb_id ILIKE $1
                    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(alt_phones,'[]'::jsonb)) ap WHERE ap ILIKE $1)
                 ORDER BY updated_at DESC NULLS LAST
                 LIMIT $2`,
                [like, limit]
            );
        }
        res.json({ success: true, data: r.rows.map(rowToLite) });
    } catch (e) {
        console.error('[web2-customers] search error:', e.message);
        res.status(500).json({ success: false, error: e.message, data: [] });
    }
});

// ─── GET /lookup-deep?q=...&live=1 — FALLBACK 3 TẦNG ───────────────────
// (user 2026-06-09) Khi search Kho KH trống → tìm tiếp ở dữ liệu Pancake:
//   tier2: bảng web2_live_comments (poller đã sync sẵn ~30s)
//   tier3 (chỉ khi live=1 & tier2 trống): pollNow() fetch comment livestream
//          ĐANG chạy ngay → re-search tier2.
// Mọi KH tìm được → tự động import NON-DESTRUCTIVE vào web2_customers
// (importPancakeCustomerWeb2: không đè, SĐT/địa chỉ mới → alt_phones/alt_addresses).
// Trả { success, tier, imported:[{customer, created, addedPhone, addedAddress}],
//       livePolled }. tier = 'live_comments' | 'live_fetch' | 'none'.
// Auth (soft): lookup-deep trả PII KH (tên/SĐT/địa chỉ) không auth = rò rỉ. (audit 2026-06-30)
router.get('/lookup-deep', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    if (!db) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const q = String(req.query.q || req.query.search || '').trim();
    const allowLive = String(req.query.live || '') === '1';
    if (q.length < 2) {
        return res.json({ success: true, tier: 'none', imported: [], livePolled: false });
    }
    const digits = q.replace(/\D/g, '');
    const isPhoneLike = digits.length >= 4;

    // Search web2_live_comments theo SĐT (digits) HOẶC tên (unaccent ILIKE).
    // Gom 1 KH/(phone|fb_id), ưu tiên comment mới nhất.
    async function searchLiveComments() {
        const like = `%${q}%`;
        const sqlBase = (nameMatch) => `
            SELECT DISTINCT ON (COALESCE(NULLIF(phone,''), fb_id))
                   fb_id, customer_name, phone, address, page_id
            FROM web2_live_comments
            WHERE (${isPhoneLike ? `regexp_replace(phone,'\\D','','g') ILIKE $2 OR ` : ''}${nameMatch})
            ORDER BY COALESCE(NULLIF(phone,''), fb_id), created_time DESC
            LIMIT 50`;
        const params = [like];
        if (isPhoneLike) params.push(`%${digits}%`);
        try {
            return (await db.query(sqlBase('unaccent(customer_name) ILIKE unaccent($1)'), params))
                .rows;
        } catch (e) {
            console.warn('[web2-customers] lookup-deep unaccent fallback:', e.message);
            return (await db.query(sqlBase('customer_name ILIKE $1'), params)).rows;
        }
    }

    try {
        let rows = await searchLiveComments();
        let tier = rows.length ? 'live_comments' : 'none';
        let livePolled = false;

        // Tier 3: fetch livestream ĐANG chạy ngay rồi tìm lại.
        if (!rows.length && allowLive) {
            try {
                const poller = require('../../services/web2-livestream-poller');
                const r = await poller.pollNow();
                livePolled = !!r?.ran;
            } catch (e) {
                console.warn('[web2-customers] lookup-deep pollNow fail:', e.message);
            }
            if (livePolled) {
                rows = await searchLiveComments();
                if (rows.length) tier = 'live_fetch';
            }
        }

        // Auto-import từng KH (non-destructive) → trả về row đầy đủ.
        const imported = [];
        for (const c of rows) {
            const r = await importPancakeCustomerWeb2(db, {
                // normPancakePhone: '84xxx' từ live_comments → '0xxx' trước import.
                phone: normPancakePhone(c.phone) || c.phone,
                name: c.customer_name,
                address: c.address,
                fbId: c.fb_id,
                pageId: c.page_id,
                source: 'live_comment',
            });
            if (!r || !r.customerId) continue;
            const full = await db.query('SELECT * FROM web2_customers WHERE id = $1', [
                r.customerId,
            ]);
            if (full.rows.length) {
                imported.push({
                    customer: rowToFull(full.rows[0]),
                    created: r.created,
                    addedPhone: !!r.addedPhone,
                    addedAddress: !!r.addedAddress,
                    matchedBy: r.matchedBy || null,
                });
            }
        }
        if (imported.length) _notify('import', imported[0].customer.id);
        res.json({ success: true, tier, imported, livePolled });
    } catch (e) {
        console.error('[web2-customers] lookup-deep error:', e.message);
        res.status(500).json({ success: false, error: e.message, tier: 'none', imported: [] });
    }
});

// ─── GET /by-phone/:phone/orders — lịch sử đơn (native + PBH) ───────────
// Auth (soft): lịch sử đơn theo SĐT là PII KH không auth = rò rỉ. (audit 2026-06-30)
router.get('/by-phone/:phone/orders', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    let phone = String(req.params.phone || '').replace(/\D/g, '');
    if (phone && !phone.startsWith('0')) phone = '0' + phone.slice(-9);
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
    try {
        const [nwRes, pbhRes] = await Promise.all([
            db.query(
                `SELECT code, display_stt, status, customer_name, phone, total_amount,
                        total_quantity, live_campaign_id, live_campaign_name, created_at, updated_at
                 FROM native_orders
                 WHERE phone = $1
                 ORDER BY created_at DESC LIMIT $2`,
                [phone, limit]
            ),
            db.query(
                `SELECT number, display_stt, state, partner_name, partner_phone, amount_total,
                        total_quantity, live_campaign_id, live_campaign_name,
                        date_invoice, date_created, date_updated
                 FROM fast_sale_orders
                 WHERE partner_phone = $1
                 ORDER BY date_created DESC LIMIT $2`,
                [phone, limit]
            ),
        ]);
        const native = nwRes.rows.map((r) => ({
            code: r.code,
            displayStt: r.display_stt,
            status: r.status,
            customerName: r.customer_name,
            phone: r.phone,
            totalAmount: Number(r.total_amount || 0),
            totalQuantity: r.total_quantity,
            liveCampaign: { id: r.live_campaign_id, name: r.live_campaign_name },
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));
        const pbh = pbhRes.rows.map((r) => ({
            number: r.number,
            displayStt: r.display_stt,
            state: r.state,
            partnerName: r.partner_name,
            partnerPhone: r.partner_phone,
            amountTotal: Number(r.amount_total || 0),
            totalQuantity: r.total_quantity,
            liveCampaign: { id: r.live_campaign_id, name: r.live_campaign_name },
            dateInvoice: r.date_invoice,
            dateCreated: r.date_created,
            dateUpdated: r.date_updated,
        }));
        res.json({
            success: true,
            data: { native, pbh, summary: { nativeCount: native.length, pbhCount: pbh.length } },
        });
    } catch (e) {
        console.error('[web2-customers] by-phone orders error:', e.message);
        res.status(500).json({ success: false, error: e.message, data: { native: [], pbh: [] } });
    }
});

// ─── GET /:phone/fb-conversation — SĐT → ngữ cảnh chat FB ───────────────
// Auth (soft): resolve SĐT → ngữ cảnh chat FB là PII không auth = rò rỉ. (audit 2026-06-30)
router.get('/:phone/fb-conversation', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const phone = String(req.params.phone || '')
        .replace(/\D/g, '')
        .slice(-10);
    if (!phone) return res.json({ success: true, found: false, reason: 'invalid_phone' });
    try {
        // 1) native_orders — fb_page_id + fb_user_id đi cùng nhau (đáng tin nhất)
        const no = await db.query(
            `SELECT fb_page_id, fb_user_id, fb_user_name
               FROM native_orders
              WHERE (phone = $1 OR phone LIKE '%' || $1)
                AND fb_user_id IS NOT NULL AND fb_page_id IS NOT NULL
              ORDER BY id DESC LIMIT 1`,
            [phone]
        );
        if (no.rows.length) {
            const r = no.rows[0];
            return res.json({
                success: true,
                found: true,
                source: 'native_orders',
                pageId: r.fb_page_id,
                psid: r.fb_user_id,
                name: r.fb_user_name || null,
            });
        }
        // 2) web2_customers — fb_page_id + fb_id nếu có, fallback psid-only
        const wc = await db.query(
            `SELECT fb_id, fb_page_id, name FROM web2_customers
              WHERE phone = $1 AND fb_id IS NOT NULL AND fb_id <> '' LIMIT 1`,
            [phone]
        );
        if (wc.rows.length) {
            return res.json({
                success: true,
                found: true,
                source: 'web2_customers',
                pageId: wc.rows[0].fb_page_id || null,
                psid: wc.rows[0].fb_id,
                name: wc.rows[0].name || null,
            });
        }
        res.json({ success: true, found: false, reason: 'no_fb_link' });
    } catch (e) {
        console.error('[web2-customers] fb-conversation:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── GET /:phone — 1 KH theo SĐT (warehouse only) ──────────────────────
// Auth (soft): 1 KH theo SĐT = PII (tên/địa chỉ/fb_id) không auth = rò rỉ. (audit 2026-06-30)
router.get('/:phone', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const phone = normPhoneWeb2(req.params.phone);
    if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
    try {
        const r = await db.query('SELECT * FROM web2_customers WHERE phone = $1 LIMIT 1', [phone]);
        if (r.rows.length) {
            return res.json({ success: true, customer: rowToLite(r.rows[0]), source: 'local' });
        }
        res.json({ success: true, customer: null });
    } catch (e) {
        console.error('[web2-customers] get error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /create — tạo KH mới (CRUD UI) ───────────────────────────────
router.post('/create', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const b = req.body || {};
    const phone = normPhoneWeb2(b.phone);
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    // MEDIUM-cleanup (2026-06-13): TC-phone-norm. Client GỬI phone nhưng không
    // normalize được thành 10 số (0xxxxxxxxx) → reject thay vì lưu rác/null vào
    // cột UNIQUE. Không gửi phone (KH FB-only) → phone=null, vẫn cho tạo.
    if (b.phone !== undefined && String(b.phone).trim() !== '' && !phone) {
        return res
            .status(400)
            .json({ success: false, error: 'SĐT không hợp lệ (cần 10 số dạng 0xxxxxxxxx)' });
    }
    try {
        const now = Date.now();
        const altPhones = sanitizeAltPhones(b.altPhones, phone);
        const altAddresses = sanitizeAltAddresses(b.altAddresses, b.address);
        const r = await db.query(
            `INSERT INTO web2_customers
                (code, name, phone, email, address, ward, district, city, carrier,
                 status, tier, tags, alt_phones, alt_addresses, note, fb_id, global_id, fb_page_id,
                 source, created_by, history, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$22)
             RETURNING *`,
            [
                b.code || null,
                name,
                phone,
                b.email || null,
                b.address || null,
                b.ward || null,
                b.district || null,
                b.city || null,
                b.carrier || null,
                b.status || 'Normal',
                b.tier || null,
                JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
                JSON.stringify(altPhones),
                JSON.stringify(altAddresses),
                b.note || null,
                b.fbId || null,
                b.globalId || null,
                b.fbPageId || null,
                b.source || 'manual',
                b.userId || b.createdBy || null,
                JSON.stringify([
                    _historyEntry('create', { userId: b.userId, userName: b.userName }),
                ]),
                now,
            ]
        );
        _notify('create', r.rows[0].id);
        _auditCustomer(req, 'create', r.rows[0].id, { name: r.rows[0].name });
        res.json({ success: true, customer: rowToFull(r.rows[0]) });
    } catch (e) {
        if (e.code === '23505') {
            return res.status(409).json({ success: false, error: 'SĐT hoặc mã KH đã tồn tại' });
        }
        console.error('[web2-customers] create error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /upsert — upsert theo SĐT (chat → "Thêm KH"). KHÔNG TPOS. ─────
router.post('/upsert', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const b = req.body || {};
    const phone = normPhoneWeb2(b.phone);
    const name = b.name !== undefined ? String(b.name).trim() : undefined;
    const address = b.address !== undefined ? String(b.address).trim() : undefined;
    if (!phone) return res.status(400).json({ success: false, error: 'thiếu/không hợp lệ phone' });
    if (!name && !address) {
        return res.status(400).json({ success: false, error: 'cần ít nhất name hoặc address' });
    }
    try {
        const r = await getOrCreateWeb2Customer(db, phone, {
            name,
            address,
            fbId: b.fbId || undefined,
            source: b.source || 'manual',
        });
        _notify(r.created ? 'create' : 'update', r.customerId);
        res.json({ success: true, id: r.customerId, created: r.created, phone });
    } catch (e) {
        console.error('[web2-customers] upsert error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /enrich-fb — link fb_id vào kho (Web2Chat tự gọi). KHÔNG TPOS. ─
// Body: { fbId(psid), name?, phone?, globalId?, fbPageId? }. Idempotent.
router.post('/enrich-fb', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const fbId = String(req.body?.fbId || '').trim();
    const name = String(req.body?.name || '').trim();
    const phone = normPhoneWeb2(req.body?.phone);
    if (!fbId) return res.json({ success: true, action: 'no_fbid' });
    try {
        // 1) Đã có fb_id trong kho → bỏ qua.
        const existing = await findWeb2CustomerByFbId(db, fbId);
        if (existing) return res.json({ success: true, action: 'exists', id: existing.id });

        // 2) Có phone → upsert theo phone + link fb_id.
        if (phone) {
            const goc = await getOrCreateWeb2Customer(db, phone, {
                name: name || undefined,
                fbId,
                globalId: req.body?.globalId || undefined,
                fbPageId: req.body?.fbPageId || undefined,
                source: 'pancake',
            });
            await linkWeb2CustomerFbId(db, phone, fbId);
            _notify('update', goc.customerId);
            return res.json({ success: true, action: 'linked_by_phone', id: goc.customerId });
        }

        // 3) Không phone → tạo KH FB-only (warehouse độc lập, không cần TPOS).
        const now = Date.now();
        const ins = await db.query(
            `INSERT INTO web2_customers (name, fb_id, global_id, fb_page_id, source, history, created_at, updated_at)
             VALUES ($1,$2,$3,$4,'pancake',$5::jsonb,$6,$6)
             RETURNING id`,
            [
                name || 'Khách FB',
                fbId,
                req.body?.globalId || null,
                req.body?.fbPageId || null,
                JSON.stringify([_historyEntry('create', { note: 'FB-only từ chat' })]),
                now,
            ]
        );
        _notify('create', ins.rows[0].id);
        res.json({ success: true, action: 'created_fb_only', id: ins.rows[0].id });
    } catch (e) {
        console.error('[web2-customers] enrich-fb:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /merge — gộp 2 KH trùng (keep primary, di chuyển đơn + xoá phụ) ─
// Body: { primaryId, secondaryId }. Repoint native_orders/fast_sale_orders.
router.post('/merge', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const primaryId = parseInt(req.body?.primaryId, 10);
    const secondaryId = parseInt(req.body?.secondaryId, 10);
    if (!Number.isFinite(primaryId) || !Number.isFinite(secondaryId) || primaryId === secondaryId) {
        return res
            .status(400)
            .json({ success: false, error: 'primaryId/secondaryId không hợp lệ' });
    }
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const [pr, sr] = await Promise.all([
            client.query('SELECT * FROM web2_customers WHERE id = $1', [primaryId]),
            client.query('SELECT * FROM web2_customers WHERE id = $1', [secondaryId]),
        ]);
        if (!pr.rows.length || !sr.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'KH không tồn tại' });
        }
        const p = pr.rows[0];
        const s = sr.rows[0];
        // Survivorship: giữ field primary, lấp field rỗng từ secondary; gộp tags/aliases.
        const mergedTags = Array.from(
            new Set([...(p.tags || []), ...(s.tags || [])].map((t) => JSON.stringify(t)))
        ).map((t) => JSON.parse(t));
        const mergedAliases = Array.from(new Set([...(p.aliases || []), ...(s.aliases || [])]));
        // MEDIUM-cleanup (2026-06-13): TRƯỚC đây merge VỨT phone phụ (COALESCE giữ
        // phone primary) + KHÔNG gộp alt_phones/alt_addresses/fb_psids → mất danh
        // tính KH phụ. Giờ gộp đủ; phone secondary (nếu primary đã có phone khác)
        // → đẩy vào alt_phones để ví (web2_customer_wallets keyed by phone, KHÔNG
        // bị xoá khi DELETE customer) vẫn truy được qua overlay.
        const _norm = (x) => String(x || '').trim();
        const altPhones = new Set([
            ...(Array.isArray(p.alt_phones) ? p.alt_phones.map(_norm) : []),
            ...(Array.isArray(s.alt_phones) ? s.alt_phones.map(_norm) : []),
        ]);
        if (_norm(s.phone) && _norm(s.phone) !== _norm(p.phone)) altPhones.add(_norm(s.phone));
        altPhones.delete('');
        altPhones.delete(_norm(p.phone)); // phone chính không nằm trong alt
        const altAddresses = new Set([
            ...(Array.isArray(p.alt_addresses) ? p.alt_addresses.map(_norm) : []),
            ...(Array.isArray(s.alt_addresses) ? s.alt_addresses.map(_norm) : []),
        ]);
        if (_norm(s.address) && _norm(s.address) !== _norm(p.address))
            altAddresses.add(_norm(s.address));
        altAddresses.delete('');
        altAddresses.delete(_norm(p.address));
        const mergedFbPsids = { ...(s.fb_psids || {}), ...(p.fb_psids || {}) }; // primary thắng

        // Ghi nhận ví phụ (nếu còn số dư) vào history để truy vết.
        let walletNote = '';
        if (_norm(s.phone) && _norm(s.phone) !== _norm(p.phone)) {
            try {
                const w = await client.query(
                    'SELECT balance FROM web2_customer_wallets WHERE phone = $1',
                    [_norm(s.phone)]
                );
                const bal = Number(w.rows[0]?.balance || 0);
                if (bal !== 0)
                    walletNote = ` · ví phụ ${_norm(s.phone)} còn ${bal}đ (giữ trong alt_phones)`;
            } catch (_) {}
        }
        const hist = Array.isArray(p.history) ? p.history.slice() : [];
        hist.push(
            _historyEntry('merge', { note: `gộp KH #${secondaryId} (${s.name})${walletNote}` })
        );
        await client.query(
            `UPDATE web2_customers SET
                name      = CASE WHEN name IN ('','Khách hàng mới') THEN $2 ELSE name END,
                phone     = COALESCE(phone, $3),
                email     = COALESCE(NULLIF(email,''), $4),
                address   = COALESCE(NULLIF(address,''), $5),
                fb_id     = COALESCE(NULLIF(fb_id,''), $6),
                global_id = COALESCE(NULLIF(global_id,''), $7),
                tags      = $8::jsonb,
                aliases   = $9::jsonb,
                alt_phones    = $15::jsonb,
                alt_addresses = $16::jsonb,
                fb_psids      = $17::jsonb,
                total_orders = total_orders + $10,
                total_spent  = total_spent + $11,
                bom_count    = bom_count + $12,
                history   = $13::jsonb,
                updated_at = $14
             WHERE id = $1`,
            [
                primaryId,
                s.name,
                s.phone,
                s.email,
                s.address,
                s.fb_id,
                s.global_id,
                JSON.stringify(mergedTags),
                JSON.stringify(mergedAliases),
                Number(s.total_orders || 0),
                Number(s.total_spent || 0),
                Number(s.bom_count || 0),
                JSON.stringify(hist),
                Date.now(),
                JSON.stringify([...altPhones]),
                JSON.stringify([...altAddresses]),
                JSON.stringify(mergedFbPsids),
            ]
        );
        // Repoint đơn (best-effort, native_orders/fast_sale_orders dùng customer_id).
        await client.query('UPDATE native_orders SET customer_id = $1 WHERE customer_id = $2', [
            primaryId,
            secondaryId,
        ]);
        await client.query('UPDATE fast_sale_orders SET customer_id = $1 WHERE customer_id = $2', [
            primaryId,
            secondaryId,
        ]);
        await client.query('DELETE FROM web2_customers WHERE id = $1', [secondaryId]);
        await client.query('COMMIT');
        _notify('merge', primaryId);
        _auditCustomer(req, 'merge', primaryId, {});
        res.json({ success: true, primaryId, merged: secondaryId });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[web2-customers] merge error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        client.release();
    }
});

// ─── PATCH /:id — sửa KH (mọi trang). KHÔNG TPOS. :id = web2_customers.id ─
router.patch('/:id', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: 'id không hợp lệ' });
    }
    const b = req.body || {};
    const sets = [];
    const params = [id];
    const setCol = (col, val) => {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
    };
    // MEDIUM-cleanup (2026-06-13): bug "name rỗng + phone rác <10 số ghi thẳng".
    // Chỉ validate khi client GỬI field (undefined = không đổi → giữ nguyên).
    if (b.name !== undefined) {
        const nm = String(b.name).trim();
        if (!nm) return res.status(400).json({ success: false, error: 'name không được rỗng' });
        setCol('name', nm);
    }
    if (b.phone !== undefined) {
        // TC-phone-norm: phone gửi lên phải normalize được thành 10 số 0xxxxxxxxx.
        // Cho phép xoá phone (gửi '' / null) → set null; gửi giá trị rác → reject.
        const raw = String(b.phone == null ? '' : b.phone).trim();
        if (raw === '') {
            setCol('phone', null);
        } else {
            const np = normPhoneWeb2(b.phone);
            if (!np) {
                return res.status(400).json({
                    success: false,
                    error: 'SĐT không hợp lệ (cần 10 số dạng 0xxxxxxxxx)',
                });
            }
            setCol('phone', np);
        }
    }
    if (b.email !== undefined) setCol('email', b.email || null);
    if (b.address !== undefined) setCol('address', b.address || null);
    if (b.ward !== undefined) setCol('ward', b.ward || null);
    if (b.district !== undefined) setCol('district', b.district || null);
    if (b.city !== undefined) setCol('city', b.city || null);
    if (b.carrier !== undefined) setCol('carrier', b.carrier || null);
    if (b.status !== undefined) setCol('status', b.status || 'Normal');
    if (b.tier !== undefined) setCol('tier', b.tier || null);
    if (b.note !== undefined) setCol('note', b.note || null);
    if (b.fbId !== undefined) setCol('fb_id', b.fbId || null);
    if (b.globalId !== undefined) setCol('global_id', b.globalId || null);
    if (b.fbPageId !== undefined) setCol('fb_page_id', b.fbPageId || null);
    if (Array.isArray(b.tags)) {
        params.push(JSON.stringify(b.tags));
        sets.push(`tags = $${params.length}::jsonb`);
    }
    const hasAltPhones = Array.isArray(b.altPhones);
    const hasAltAddresses = Array.isArray(b.altAddresses);
    if (!sets.length && !hasAltPhones && !hasAltAddresses) {
        return res.status(400).json({ success: false, error: 'không có field nào để sửa' });
    }
    params.push(Date.now());
    sets.push(`updated_at = $${params.length}`);
    try {
        // Cần phone + address hiện tại để dedupe alt_phones/alt_addresses + history.
        const cur = await db.query(
            'SELECT history, phone, address FROM web2_customers WHERE id = $1',
            [id]
        );
        if (!cur.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
        if (hasAltPhones) {
            // Phone chính = giá trị mới (nếu đang đổi) hoặc giá trị hiện tại.
            const primary = b.phone !== undefined ? normPhoneWeb2(b.phone) : cur.rows[0].phone;
            params.push(JSON.stringify(sanitizeAltPhones(b.altPhones, primary)));
            sets.push(`alt_phones = $${params.length}::jsonb`);
        }
        if (hasAltAddresses) {
            // Địa chỉ chính = giá trị mới (nếu đang đổi) hoặc hiện tại.
            const primaryAddr = b.address !== undefined ? b.address : cur.rows[0].address;
            params.push(JSON.stringify(sanitizeAltAddresses(b.altAddresses, primaryAddr)));
            sets.push(`alt_addresses = $${params.length}::jsonb`);
        }
        const hist = Array.isArray(cur.rows[0].history) ? cur.rows[0].history.slice() : [];
        hist.push(_historyEntry('update', { userId: b.userId, userName: b.userName }));
        params.push(JSON.stringify(hist));
        sets.push(`history = $${params.length}::jsonb`);
        const r = await db.query(
            `UPDATE web2_customers SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
            params
        );
        _notify('update', id);
        _auditCustomer(req, 'update', id, {});
        res.json({ success: true, customer: rowToFull(r.rows[0]) });
    } catch (e) {
        if (e.code === '23505') {
            return res.status(409).json({ success: false, error: 'SĐT đã tồn tại ở KH khác' });
        }
        console.error('[web2-customers] patch error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── DELETE /:id — xoá KH (guard: nếu có đơn → soft-archive is_active=false) ─
router.delete('/:id', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: 'id không hợp lệ' });
    }
    const force = req.query.force === 'true' || req.query.force === '1';
    try {
        const linked = await db.query(
            `SELECT (SELECT COUNT(*) FROM native_orders WHERE customer_id = $1)::int
                  + (SELECT COUNT(*) FROM fast_sale_orders WHERE customer_id = $1)::int AS n`,
            [id]
        );
        const orderCount = linked.rows[0]?.n || 0;
        if (orderCount > 0 && !force) {
            // Soft-archive thay vì xoá cứng (giữ liên kết đơn).
            await db.query(
                'UPDATE web2_customers SET is_active = false, updated_at = $2 WHERE id = $1',
                [id, Date.now()]
            );
            _notify('archive', id);
            _auditCustomer(req, 'archive', id, { orderCount });
            return res.json({ success: true, archived: true, orderCount });
        }
        await db.query('DELETE FROM web2_customers WHERE id = $1', [id]);
        _notify('delete', id);
        _auditCustomer(req, 'delete', id, {});
        res.json({ success: true, deleted: true });
    } catch (e) {
        console.error('[web2-customers] delete error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /add-alt-phone {fbId?|customerId?, phone} ────────────────────
// KH đã có trong kho (theo fbId/id) nhưng SĐT mới khác phone chính → lưu vào
// alt_phones (KHÔNG ghi đè phone chính). "Ưu tiên kho KH, thêm SĐT phụ".
router.post('/add-alt-phone', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    const phone = req.body?.phone;
    const fbId = req.body?.fbId;
    const customerId = req.body?.customerId;
    if (!phone || (!fbId && !customerId)) {
        return res
            .status(400)
            .json({ success: false, error: 'phone + (fbId|customerId) required' });
    }
    try {
        const r = await addWeb2AltPhone(pool, { customerId, fbId, phone });
        if (!r) return res.json({ success: false, error: 'customer not found' });
        if (r.added) _notify('alt-phone', customerId || null);
        res.json({ success: true, ...r });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /harvest-comments — gom KH từ comment livestream vào kho ──────
// Body: { comments: [{ fbId, name, phone, globalId, fbPageId }] }
// "Lấy luôn thông tin KH comment fill vào kho cho đầy đủ". QUY TẮC (user
// 2026-06-09): KHÔNG ghi đè SĐT/địa chỉ/tên sẵn có. Trùng SĐT → thêm vào
// alt_phones (phone chính giữ nguyên, vẫn là CHÍNH). Field rỗng mới fill.
// KH chưa có trong kho → tạo mới. Idempotent, best-effort từng comment.
router.post('/harvest-comments', requireWeb2AuthSoft, async (req, res) => {
    const db = getPool(req);
    const list = Array.isArray(req.body?.comments) ? req.body.comments : [];
    const stats = { created: 0, linked: 0, altAdded: 0, filled: 0, skipped: 0, processed: 0 };
    if (!list.length) return res.json({ success: true, ...stats });

    // Đảm bảo conflict target cho ON CONFLICT (fb_id) ... DO NOTHING tồn tại.
    await _ensureFbIdUniqueIndex(db);

    const seen = new Set(); // dedupe input theo fbId|phone
    for (const raw of list) {
        const fbId = String(raw?.fbId || '').trim();
        const name = String(raw?.name || '').trim();
        // normPancakePhone: xử lý '84xxx' từ comment trước khi lưu (xem helper).
        const phone = normPancakePhone(raw?.phone);
        if (!fbId && !phone) {
            stats.skipped++;
            continue;
        }
        const dk = fbId + '|' + (phone || '');
        if (seen.has(dk)) continue;
        seen.add(dk);
        stats.processed++;
        try {
            const r = await _harvestOneComment(db, {
                fbId,
                name,
                phone,
                globalId: raw?.globalId,
                fbPageId: raw?.fbPageId,
            });
            if (r === 'created') stats.created++;
            else if (r === 'linked') stats.linked++;
            else if (r === 'alt') stats.altAdded++;
            else if (r === 'filled') stats.filled++;
            else stats.skipped++;
        } catch (e) {
            stats.skipped++;
            console.warn('[web2-customers] harvest one fail:', e.message);
        }
    }
    if (stats.created || stats.linked || stats.altAdded || stats.filled) _notify('harvest', null);
    res.json({ success: true, ...stats });
});

// Xử lý 1 comment → kho KH. KHÔNG ghi đè dữ liệu chính sẵn có. Trả về:
// 'created' | 'linked' | 'alt' | 'filled' | 'skip'.
async function _harvestOneComment(db, { fbId, name, phone, globalId, fbPageId }) {
    // 1) Đã có KH theo fb_id? → bổ sung KHÔNG ghi đè.
    const existing = fbId ? await findWeb2CustomerByFbId(db, fbId) : null;
    if (existing) {
        let touched = null;
        if (phone) {
            const exPhone = normPhoneWeb2(existing.phone);
            if (!exPhone) {
                // phone chính đang rỗng → fill (không phải ghi đè)
                await db.query(
                    `UPDATE web2_customers SET phone=$2, updated_at=$3
                     WHERE id=$1 AND (phone IS NULL OR phone='')`,
                    [existing.id, phone, Date.now()]
                );
                touched = 'filled';
            } else if (exPhone !== phone) {
                // khác phone chính → thêm vào alt_phones (giữ chính)
                const a = await addWeb2AltPhone(db, { customerId: existing.id, phone });
                if (a?.added) touched = 'alt';
            }
        }
        // tên rỗng/placeholder → fill (không đè tên thật)
        if (name) {
            const exName = String(existing.name || '').trim();
            if (!exName || exName === 'Khách hàng mới' || exName === 'Khách FB') {
                await db.query(`UPDATE web2_customers SET name=$2, updated_at=$3 WHERE id=$1`, [
                    existing.id,
                    name,
                    Date.now(),
                ]);
                touched = touched || 'filled';
            }
        }
        return touched || 'skip';
    }

    // 2) Chưa có theo fb_id. Có SĐT → upsert theo phone (fill rỗng + link fb_id).
    //    getOrCreate chỉ fill field RỖNG, không ghi đè dữ liệu chính.
    if (phone) {
        const goc = await getOrCreateWeb2Customer(db, phone, {
            name: name || undefined,
            fbId: fbId || undefined,
            globalId: globalId || undefined,
            fbPageId: fbPageId || undefined,
            source: 'live-comment',
        });
        if (fbId) await linkWeb2CustomerFbId(db, phone, fbId);
        return goc.created ? 'created' : 'linked';
    }

    // 3) Chỉ có fb_id (không SĐT) → tạo KH FB-only (đủ tên + fb_id).
    if (fbId) {
        const now = Date.now();
        const ins = await db.query(
            // ON CONFLICT (fb_id) WHERE fb_id IS NOT NULL: target khớp partial
            // unique index idx_web2_customers_fb_id_unique → KHÔNG tạo KH trùng
            // fb_id khi 2 harvest đồng thời. (Nhánh này chỉ chạy khi có fb_id.)
            `INSERT INTO web2_customers (name, fb_id, global_id, fb_page_id, source, history, created_at, updated_at)
             VALUES ($1,$2,$3,$4,'live-comment',$5::jsonb,$6,$6)
             ON CONFLICT (fb_id) WHERE fb_id IS NOT NULL DO NOTHING
             RETURNING id`,
            [
                name || 'Khách FB',
                fbId,
                globalId || null,
                fbPageId || null,
                JSON.stringify([_historyEntry('create', { note: 'live-comment harvest' })]),
                now,
            ]
        );
        return ins.rows.length ? 'created' : 'skip';
    }
    return 'skip';
}

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
