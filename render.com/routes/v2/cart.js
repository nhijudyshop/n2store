// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Giỏ TPOS panel = native_orders.products (status='draft')
//
// REFACTOR 2026-05-22: 1 nguồn dữ liệu — giỏ TPOS panel + Đơn Web (modal/list) đều
// đọc/ghi cùng `native_orders.products`. Bỏ web2_cart_items (legacy, không còn ghi).
//
// Lý do: trước đây cart_items ↔ native_orders.products là 2 nguồn, mỗi action phải
// sync 2 chiều → sinh bug stale noc, dual-write race. Khi PBH tạo, ta chỉ cần
// chuyển native_order.status → 'confirmed' (đã có sẵn ở fast-sale-orders.js) →
// TPOS panel tự ẩn (filter status='draft').
//
// URL semantic GIỮ NGUYÊN backward-compat:
//   :commentId trong URL = customerId (fbUserId). Frontend pass `customer.id`.
//   Một customer N TPOS comments → 1 draft order = 1 cart.
//
// Tables:
//   native_orders            — source of truth (products JSONB + status)
//   web2_cart_history        — append-only audit log mọi add/remove/clear/PBH
// =====================================================

const express = require('express');
const router = express.Router();
// Hardening 2026-06-29: gate auth cho cart WRITE (tạo/sửa đơn live). Soft (chỉ 401
// khi WEB2_AUTH_ENFORCE=1). Frontend cart đã gửi x-web2-token (Phase 1).
const { requireWeb2AuthSoft } = require('../../middleware/web2-auth');

// KPI helpers (Sprint 1) — emit forecast events khi cart mutates.
// Sai sót ở KPI = không-blocking → wrap try/catch.
const kpiModule = require('./kpi');

// Auto-gán/nhả ĐƠN VỊ (per-unit QR) khi giỏ đổi qua cart drag — luồng livestream
// CHÍNH (kéo SP vào comment). reconcile = đồng bộ unit theo products; free = nhả hết
// khi xoá đơn. Fire-and-forget, không chặn response. Đối xứng hook ở native-orders
// (create-manual/PATCH/cancel) — trước đây cart.js BỎ SÓT nên đơn live không auto-gán.
function _reconcileUnits(pool, orderId) {
    if (!orderId) return;
    try {
        require('../web2-product-units')
            .reconcileOrderUnits(pool, orderId)
            .catch(() => {});
    } catch (_) {}
}
function _freeUnits(pool, orderId) {
    if (!orderId) return;
    try {
        require('../web2-product-units')
            .freeOrderUnits(pool, orderId)
            .catch(() => {});
    } catch (_) {}
}

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}

// Fire-and-forget emit. Resolve beneficiary by campaign_name + campaign_stt từ
// native_orders row. Lookup tại emit time (immutable post-emit).
async function _emitCartKpi(pool, draft, body, evType, qtyDelta, product) {
    try {
        const fullRow = draft.live_campaign_name
            ? draft
            : (
                  await pool.query(
                      'SELECT live_campaign_name, live_campaign_id, campaign_stt FROM native_orders WHERE code = $1',
                      [draft.code]
                  )
              ).rows[0] || {};
        const campaignName = fullRow.live_campaign_name || draft.live_campaign_name || null;
        const campaignId =
            fullRow.live_campaign_id || draft.live_campaign_id || kpiModule.SYNTHETIC_NO_CAMPAIGN;
        const campaignStt = fullRow.campaign_stt ?? draft.campaign_stt ?? null;
        const user = body.user || {};
        const actorId = Number(user.id);
        if (!Number.isFinite(actorId)) return; // skip nếu actor không có numeric id
        const beneficiary = await kpiModule.resolveBeneficiary(pool, {
            campaign_name: campaignName,
            campaign_stt: campaignStt,
            actor_user_id: actorId,
            actor_name: user.name || null,
        });
        await kpiModule.emitKpiEvent(pool, {
            event_type: evType,
            actor_user_id: actorId,
            actor_name: user.name || null,
            ...beneficiary,
            order_code: draft.code,
            order_campaign_stt: campaignStt,
            customer_id: draft.fb_user_id || draft.fbUserId || '',
            product_code: product.code || product.productCode || '',
            qty_delta: qtyDelta,
            source: 'livestream',
            campaign_id: campaignId,
            source_page: 'tpos-pancake',
            client_event_id: body.clientEventId || null,
            raw_payload: { product_name: product.name },
        });
    } catch (e) {
        console.warn('[web2-cart] KPI emit failed:', e.message);
    }
}

let _migrationDone = false;
async function ensureSchema(pool) {
    if (_migrationDone || !pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_cart_history (
            id BIGSERIAL PRIMARY KEY,
            comment_id TEXT NOT NULL,
            customer_name TEXT,
            customer_phone TEXT,
            page_id TEXT,
            product_code TEXT NOT NULL,
            product_name TEXT,
            action TEXT NOT NULL,
            qty_before INTEGER,
            qty_after INTEGER,
            user_id TEXT,
            user_name TEXT,
            source_page TEXT DEFAULT 'tpos-pancake',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_w2_cart_hist_comment
            ON web2_cart_history(comment_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_w2_cart_hist_created
            ON web2_cart_history(created_at DESC);
    `);
    _migrationDone = true;
    console.log('[web2-cart] schema ready (history-only, products live in native_orders)');
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.web2Db || req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'schema-init: ' + e.message });
    }
});

function _notifyCart(customerId) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:cart', { commentId: customerId, ts: Date.now() }, 'update');
    } catch {}
}

function _notifyNativeOrders(action, code) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:native-orders',
            { action, code: code || null, ts: Date.now() },
            'update'
        );
    } catch {}
}

async function _logHistory(pool, payload) {
    try {
        await pool.query(
            `INSERT INTO web2_cart_history
             (comment_id, customer_name, customer_phone, page_id, product_code, product_name,
              action, qty_before, qty_after, user_id, user_name)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                payload.comment_id,
                payload.customer_name || null,
                payload.customer_phone || null,
                payload.page_id || null,
                payload.product_code,
                payload.product_name || null,
                payload.action,
                payload.qty_before ?? null,
                payload.qty_after ?? null,
                payload.user_id || null,
                payload.user_name || null,
            ]
        );
    } catch (e) {
        console.warn('[web2-cart] history log fail:', e.message);
    }
}

// Trần SL/dòng: chống tràn cột INTEGER total_quantity (parallel bug crm_team_id INT4
// tràn FB Page Id → BIGINT). qty client > 2^31 làm UPDATE total_quantity throw.
// 100k đủ rộng cho mọi đơn thật. (audit vòng 5)
const MAX_LINE_QTY = 100000;

// Lấy giá trị qty từ product (chấp nhận cả 'quantity' lẫn 'qty' cho back-compat
// với native-orders modal cũ ghi 'quantity' và cart cũ ghi 'qty').
function _qtyOf(p) {
    const n = Number(p?.quantity ?? p?.qty);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

function _totalsOf(products) {
    let qty = 0,
        amt = 0;
    for (const p of products || []) {
        const q = _qtyOf(p);
        qty += q;
        amt += q * (Number(p.price) || 0);
    }
    return { qty, amt };
}

// Build product object cho native_orders.products[].
// Ghi CẢ `quantity` lẫn `qty` để vừa khớp native-orders modal (quantity) vừa
// khớp legacy PBH/sync code (qty). Khi đọc luôn dùng _qtyOf().
// Ghi CẢ `code` lẫn `productCode` để products /usage SQL + saveEdit modal khớp
// (modal trước viết `productCode`, cart cũ viết `code`).
// fbCommentId: comment_id thật của row vừa drop — native-orders dùng để fetch
// livestream snapshot thumbnail per-line trong modal sửa đơn.
function _buildProduct(input, qty, user, fbCommentId) {
    return {
        code: input.code,
        productCode: input.code, // alias cho native-orders modal compat
        name: input.name || null,
        imageUrl: input.imageUrl || input.image_url || null,
        price: Number(input.price) || 0,
        quantity: qty,
        qty: qty,
        addedAt: Date.now(),
        addedBy: user?.name || null,
        fbCommentId: fbCommentId || null,
        // Nguồn thêm: 'livestream' = drag từ TPOS-Pancake panel (chốt live).
        // SP thêm trực tiếp từ native-orders modal sẽ không có field này → coi như direct.
        source: 'livestream',
    };
}

// #2 cross-page (2026-07-01): 1 KH có PSID KHÁC NHAU mỗi page (PSID FB page-scoped).
// Draft có thể gộp cross-page (from-comment merge theo customer_id) nhưng lưu
// fb_user_id = PSID của page tạo ĐẦU. Cart op (remove/patch/GET/counts) đến từ page
// KHÁC dùng PSID khác → phải resolve web2 customer_id để tìm được draft đã gộp.
// Nguồn map PSID→customer: web2_customers.fb_id (mặc định) HOẶC fb_psids {page:psid}
// (populate lúc tạo đơn ở native-orders.js). Best-effort → null nếu KH lạ.
async function _resolveWeb2CustomerId(pool, psid) {
    if (!psid) return null;
    try {
        const r = await pool.query(
            `SELECT id FROM web2_customers
             WHERE fb_id = $1
                OR EXISTS (
                    SELECT 1 FROM jsonb_each_text(COALESCE(fb_psids, '{}'::jsonb)) e
                    WHERE e.value = $1
                )
             LIMIT 1`,
            [psid]
        );
        return r.rows[0]?.id ?? null;
    } catch (_) {
        return null;
    }
}

// Tìm draft native_order theo PSID (= fb_user_id) HOẶC web2 customer_id (cross-page).
// Đây là source of truth cho TPOS panel cart.
// F1 fix (audit #4 2026-07-01): path /add TRUYỀN liveCampaignId → chỉ khớp draft CÙNG
// chiến dịch (IS NOT DISTINCT FROM = null-safe). Trước đây tìm theo fb_user_id thôi →
// kéo SP của chiến dịch B vào KH đang có draft mở ở chiến dịch A bị NỐI NHẦM vào A
// (sai campaign_stt + KPI + filter). Khi không khớp (draft A ≠ campaign B) → caller
// rơi xuống _createDraftViaFromComment tạo draft B mới, khớp semantics /from-comment.
// campaignId === undefined (remove/clear/commit/counts) → hành vi cũ: mọi draft của KH.
// #2: thêm nhánh customer_id → cart page-B tìm được giỏ đã gộp từ page-A.
async function _findDraft(pool, customerId, campaignId) {
    const scoped = campaignId !== undefined;
    const cid = await _resolveWeb2CustomerId(pool, customerId);
    const r = await pool.query(
        `SELECT * FROM native_orders
         WHERE status = 'draft'
           AND (fb_user_id = $1 OR ($2::bigint IS NOT NULL AND customer_id = $2))
         ${scoped ? 'AND live_campaign_id IS NOT DISTINCT FROM $3' : ''}
         ORDER BY created_at DESC
         LIMIT 1`,
        scoped ? [customerId, cid, campaignId || null] : [customerId, cid]
    );
    return r.rows[0] || null;
}

// Tạo draft native_order qua /from-comment (đầy đủ self-heal + idempotency check)
// Loopback HTTP để dùng đúng business rules của native-orders.
async function _createDraftViaFromComment(req, customerId, customer, fbContext, user) {
    const NATIVE_API =
        req.app.locals.web2BaseUrl ||
        process.env.SELF_URL ||
        'http://localhost:' + (process.env.PORT || 3000);
    const fc = fbContext || {};
    const fetchFn = global.fetch || (await import('node-fetch')).default;
    const r = await fetchFn(`${NATIVE_API}/api/native-orders/from-comment`, {
        method: 'POST',
        // Forward token của request gốc (cart frontend đã gửi) → from-comment (đã gate
        // requireWeb2AuthSoft) chấp nhận self-call này. Thiếu token + ENFORCE=1 → 401.
        headers: {
            'Content-Type': 'application/json',
            ...(req.headers['x-web2-token'] ? { 'x-web2-token': req.headers['x-web2-token'] } : {}),
        },
        body: JSON.stringify({
            fbUserId: customerId,
            fbUserName: customer?.name || fc.fbUserName || null,
            fbPageId: fc.fbPageId || null,
            fbPageName: fc.fbPageName || null,
            fbPostId: fc.fbPostId || null,
            fbCommentId: fc.fbCommentId || null,
            liveCampaignId: fc.liveCampaignId || null,
            liveCampaignName: fc.liveCampaignName || null,
            message: fc.message || '',
            phone: customer?.phone || '',
            address: customer?.address || '',
            createdBy: user?.id || null,
            createdByName: user?.name || null,
        }),
    });
    const data = await r.json();
    if (!data?.order) throw new Error('from-comment did not return order');
    return data.order;
}

// =====================================================
// READ endpoints
// =====================================================

// GET /:commentId — list items trong cart (= products array của draft native_order)
router.get('/:commentId', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const draft = await _findDraft(pool, req.params.commentId);
        if (!draft) return res.json({ success: true, items: [], native_order_code: null });
        const items = (draft.products || []).map((p) => ({
            id: p.code,
            comment_id: req.params.commentId,
            customer_id: req.params.commentId,
            customer_name: draft.customer_name || draft.fb_user_name,
            customer_phone: draft.phone,
            page_id: draft.fb_page_id,
            product_code: p.code,
            product_name: p.name,
            product_image_url: p.imageUrl || p.image_url,
            price: Number(p.price) || 0,
            qty: _qtyOf(p),
            added_by_name: p.addedBy || null,
            added_at: p.addedAt ? new Date(p.addedAt).toISOString() : null,
            fb_comment_id: p.fbCommentId || null,
            native_order_code: draft.code,
        }));
        res.json({ success: true, items, native_order_code: draft.code });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Shared cho GET + POST /batch/counts — trả qty của draft order theo customer.
// #2 cross-page: badge của PSID page-B phải phản ánh giỏ đã gộp (lưu dưới PSID page-A
// cùng customer). Map mỗi PSID → web2 customer_id (fb_id | fb_psids), rồi tìm draft
// theo (fb_user_id OR customer_id) và gán count về ĐÚNG PSID được hỏi.
async function _batchCounts(pool, ids) {
    if (!ids.length) return {};
    // 1) PSID → customer_id
    const psidToCid = {};
    try {
        const cm = await pool.query(
            `SELECT id, fb_id, fb_psids FROM web2_customers
             WHERE fb_id = ANY($1::text[])
                OR EXISTS (
                    SELECT 1 FROM jsonb_each_text(COALESCE(fb_psids, '{}'::jsonb)) e
                    WHERE e.value = ANY($1::text[])
                )`,
            [ids]
        );
        const idSet = new Set(ids);
        for (const row of cm.rows) {
            if (row.fb_id && idSet.has(row.fb_id)) psidToCid[row.fb_id] = row.id;
            for (const psid of Object.values(row.fb_psids || {})) {
                if (idSet.has(psid)) psidToCid[psid] = row.id;
            }
        }
    } catch (_) {
        /* web2_customers thiếu / lỗi → chỉ khớp theo fb_user_id */
    }
    const cids = [...new Set(Object.values(psidToCid))];
    // 2) draft theo (fb_user_id ∈ ids) OR (customer_id ∈ cids)
    const r = await pool.query(
        `SELECT fb_user_id, customer_id, products, total_quantity
         FROM native_orders
         WHERE status = 'draft'
           AND (fb_user_id = ANY($1::text[])
                OR ($2::bigint[] IS NOT NULL AND customer_id = ANY($2::bigint[])))`,
        [ids, cids.length ? cids : null]
    );
    const byPsid = {};
    const byCid = {};
    for (const row of r.rows) {
        const products = Array.isArray(row.products) ? row.products : [];
        const totalQty = Number(row.total_quantity) || products.reduce((s, p) => s + _qtyOf(p), 0);
        const val = { items: products.length, qty: totalQty };
        if (row.fb_user_id) byPsid[row.fb_user_id] = val;
        if (row.customer_id != null) byCid[row.customer_id] = val;
    }
    // 3) gán về PSID được hỏi (ưu tiên draft trực tiếp theo PSID, fallback customer)
    const counts = {};
    for (const psid of ids) {
        const cid = psidToCid[psid];
        const val = byPsid[psid] || (cid != null ? byCid[cid] : null);
        if (val) counts[psid] = val;
    }
    return counts;
}

// GET /batch/counts?commentIds=fbUid1,fbUid2,...
// Trả qty của draft order cho mỗi customer (fbUserId).
router.get('/batch/counts', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const ids = String(req.query.commentIds || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const counts = await _batchCounts(pool, ids);
        res.json({ success: true, counts });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /batch/counts  body: { commentIds: [...] }
// Như GET nhưng nhận ids qua body — tránh URL quá dài khi nhiều ids (≤200).
router.post('/batch/counts', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const raw = Array.isArray(req.body?.commentIds) ? req.body.commentIds : [];
        const ids = raw.map((s) => String(s).trim()).filter(Boolean);
        const counts = await _batchCounts(pool, ids);
        res.json({ success: true, counts });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Anti-race (audit 2026-06-23 HIGH): read-modify-write trên products JSONB PHẢI atomic.
// 2 request đồng thời (2 tab/máy thêm SP khác nhau, hoặc sửa qty cùng SP) nếu SELECT
// rồi UPDATE rời nhau → last-write-wins NUỐT thay đổi của request kia (lost update).
// Khoá row native_orders bằng SELECT … FOR UPDATE trong 1 transaction → serialize hoá.
// fn(client, lockedRow) nhận row đã khoá (products TƯƠI đọc trong lock) + chạy UPDATE/DELETE
// qua client. Row không tồn tại → trả {row:null} (caller tự xử, không mở transaction thừa).
// ⚠ Mọi _notify*/SSE/log để NGOÀI fn (sau COMMIT) — không broadcast khi có thể ROLLBACK.
async function _withDraftLock(pool, code, fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query('SELECT * FROM native_orders WHERE code = $1 FOR UPDATE', [
            code,
        ]);
        const row = r.rows[0];
        if (!row) {
            await client.query('ROLLBACK');
            return { row: null, result: null };
        }
        const result = await fn(client, row);
        await client.query('COMMIT');
        return { row, result };
    } catch (e) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}
        throw e;
    } finally {
        client.release();
    }
}

// =====================================================
// WRITE endpoints — direct mutation trên native_orders.products
// =====================================================

// POST /:commentId/add  body: { product, customer, user, qty?, fbContext, page_id? }
// Tạo draft order nếu chưa có + append SP vào products array.
router.post('/:commentId/add', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const b = req.body || {};
        const p = b.product || {};
        if (!p.code)
            return res.status(400).json({ success: false, error: 'product.code bắt buộc' });
        const cust = b.customer || {};
        const user = b.user || {};
        const qtyAdd = Math.min(MAX_LINE_QTY, Math.max(1, Number(b.qty) || 1));
        const customerId = req.params.commentId;

        // 1. Lấy hoặc tạo draft — SCOPE theo chiến dịch của comment bị thả vào (F1):
        // draft khác chiến dịch → coi như chưa có → tạo draft mới cho ĐÚNG chiến dịch.
        let draft = await _findDraft(pool, customerId, b.fbContext?.liveCampaignId || null);
        if (!draft) {
            const order = await _createDraftViaFromComment(
                req,
                customerId,
                cust,
                b.fbContext,
                user
            );
            // Re-fetch row để có raw DB shape (products JSONB)
            const r = await pool.query('SELECT * FROM native_orders WHERE code = $1', [order.code]);
            draft = r.rows[0];
        }
        if (!draft) {
            return res.status(500).json({ success: false, error: 'failed to obtain draft order' });
        }

        // 2. Merge SP vào products (qty++ nếu trùng code). Match cả 'code' lẫn
        // 'productCode' vì products[] cũ có thể chỉ có productCode (từ modal).
        // TRONG lock (SELECT … FOR UPDATE) → 2 add đồng thời không nuốt nhau.
        let qtyBefore = 0;
        let qtyAfter = qtyAdd;
        const fbCommentIdMeta = b.fbContext?.fbCommentId || null;
        const { row: lockedRow } = await _withDraftLock(pool, draft.code, async (client, lr) => {
            const products = Array.isArray(lr.products) ? [...lr.products] : [];
            const codeOf = (x) => x?.code || x?.productCode || null;
            const idx = products.findIndex((x) => codeOf(x) === p.code);
            if (idx >= 0) {
                qtyBefore = _qtyOf(products[idx]);
                qtyAfter = qtyBefore + qtyAdd;
                products[idx] = {
                    ...products[idx],
                    code: products[idx].code || p.code,
                    productCode: products[idx].productCode || p.code,
                    name: products[idx].name || p.name || null,
                    imageUrl: products[idx].imageUrl || p.imageUrl || p.image_url || null,
                    price: Number(p.price) || products[idx].price || 0,
                    quantity: qtyAfter,
                    qty: qtyAfter,
                    addedAt: Date.now(),
                    addedBy: user.name || products[idx].addedBy,
                    // Cập nhật fbCommentId nếu re-add từ comment mới (hoặc giữ cũ).
                    fbCommentId: fbCommentIdMeta || products[idx].fbCommentId || null,
                    // Re-add qua cart drag → đánh dấu (hoặc nâng cấp) thành livestream.
                    source: products[idx].source || 'livestream',
                };
            } else {
                qtyAfter = qtyAdd;
                products.push(_buildProduct(p, qtyAdd, user, fbCommentIdMeta));
            }
            const t = _totalsOf(products);
            await client.query(
                `UPDATE native_orders
                 SET products = $1::jsonb,
                     total_quantity = $2,
                     total_amount = $3,
                     updated_at = $4
                 WHERE code = $5`,
                [JSON.stringify(products), t.qty, t.amt, Date.now(), lr.code]
            );
        });
        if (!lockedRow) {
            return res
                .status(500)
                .json({ success: false, error: 'draft order disappeared during add' });
        }

        // Anti-lag: history log + KPI emit fire-and-forget (audit-only, errors
        // swallowed inside). Cắt 20-50ms khỏi response → drop UX mượt hơn.
        _logHistory(pool, {
            comment_id: customerId,
            customer_name: cust.name,
            customer_phone: cust.phone,
            page_id: b.page_id,
            product_code: p.code,
            product_name: p.name,
            action: 'add',
            qty_before: qtyBefore,
            qty_after: qtyAfter,
            user_id: user.id,
            user_name: user.name,
        });

        _notifyCart(customerId);
        _notifyNativeOrders('update', draft.code);
        _reconcileUnits(pool, draft.id); // AUTO-GÁN unit theo giỏ (luồng live chính)
        // Sprint 1: KPI forecast emit (livestream source). qtyDelta = qtyAdd
        // (sự kiện logic: NV add qtyAdd units, dù có merge với line cũ hay không).
        _emitCartKpi(pool, draft, b, 'forecast_add', qtyAdd, p);
        res.json({
            success: true,
            qty: qtyAfter,
            native_order_code: draft.code,
        });
    } catch (e) {
        console.error('[web2-cart] add error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:commentId/:productCode/remove  body: { user }
// Xóa SP khỏi products. Nếu products còn lại = [] → DELETE native_order.
router.post('/:commentId/:productCode/remove', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const customerId = req.params.commentId;
        const productCode = req.params.productCode;
        const user = (req.body && req.body.user) || {};

        const draft = await _findDraft(pool, customerId);
        if (!draft) return res.json({ success: true, alreadyRemoved: true });
        const nativeOrderCode = draft.code;

        // Lọc SP TRONG lock (SELECT … FOR UPDATE) → remove + add/qty đồng thời không nuốt nhau.
        let removed = null;
        let nativeDeleted = false;
        const { row: lockedRow } = await _withDraftLock(pool, draft.code, async (client, lr) => {
            const products = Array.isArray(lr.products) ? lr.products : [];
            removed = products.find((p) => (p.code || p.productCode) === productCode);
            if (!removed) return; // SP không còn → no-op (alreadyRemoved)
            const newProducts = products.filter((p) => (p.code || p.productCode) !== productCode);
            if (newProducts.length === 0) {
                // Cart rỗng → xóa luôn native_order (UX: kéo nhầm rồi undo → đơn biến mất)
                await client.query(`DELETE FROM native_orders WHERE code = $1`, [lr.code]);
                nativeDeleted = true;
            } else {
                const t = _totalsOf(newProducts);
                await client.query(
                    `UPDATE native_orders
                     SET products = $1::jsonb,
                         total_quantity = $2,
                         total_amount = $3,
                         updated_at = $4
                     WHERE code = $5`,
                    [JSON.stringify(newProducts), t.qty, t.amt, Date.now(), lr.code]
                );
            }
        });
        if (!lockedRow || !removed) return res.json({ success: true, alreadyRemoved: true });
        // Notify SAU commit (anti-phantom): chỉ broadcast khi mutation đã chốt.
        _notifyNativeOrders(nativeDeleted ? 'delete' : 'update', draft.code);
        // Đơn bị xoá (remove SP cuối) → nhả hết unit; còn → reconcile (nhả SP vừa gỡ).
        if (nativeDeleted) _freeUnits(pool, draft.id);
        else _reconcileUnits(pool, draft.id);

        _logHistory(pool, {
            comment_id: customerId,
            customer_name: draft.customer_name,
            customer_phone: draft.phone,
            page_id: draft.fb_page_id,
            product_code: productCode,
            product_name: removed.name,
            action: 'remove',
            qty_before: _qtyOf(removed),
            qty_after: 0,
            user_id: user.id,
            user_name: user.name,
        });
        _notifyCart(customerId);
        // Sprint 1: KPI forecast emit — qty_delta negative
        const removedQty = _qtyOf(removed);
        _emitCartKpi(pool, draft, req.body || {}, 'forecast_remove', -removedQty, {
            code: productCode,
            name: removed.name,
        });
        res.json({
            success: true,
            native_order_code: nativeOrderCode,
            native_deleted: nativeDeleted,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:commentId/clear  body: { user, reason? }
// Xóa hết SP của khách = DELETE draft native_order (tương đương xóa đơn).
router.post('/:commentId/clear', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const customerId = req.params.commentId;
        const user = (req.body && req.body.user) || {};
        const reason = (req.body && req.body.reason) || 'clear-order';

        const draft = await _findDraft(pool, customerId);
        if (!draft) return res.json({ success: true, removed: 0 });
        const products = Array.isArray(draft.products) ? draft.products : [];

        await pool.query(`DELETE FROM native_orders WHERE code = $1`, [draft.code]);
        _notifyNativeOrders('delete', draft.code);
        _freeUnits(pool, draft.id); // xoá giỏ → nhả hết unit về IN_STOCK

        // Fire-and-forget history logs (anti-lag)
        for (const p of products) {
            _logHistory(pool, {
                comment_id: customerId,
                customer_name: draft.customer_name,
                customer_phone: draft.phone,
                page_id: draft.fb_page_id,
                product_code: p.code,
                product_name: p.name,
                action: reason,
                qty_before: _qtyOf(p),
                qty_after: 0,
                user_id: user.id,
                user_name: user.name,
            });
        }
        _notifyCart(customerId);
        res.json({
            success: true,
            removed: products.length,
            native_order_code: draft.code,
            native_deleted: true,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// PATCH /:commentId/:productCode  body: { qty, user }  — update qty cho 1 SP
router.patch('/:commentId/:productCode', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const customerId = req.params.commentId;
        const productCode = req.params.productCode;
        const b = req.body || {};
        const user = b.user || {};
        const newQty = Math.min(MAX_LINE_QTY, Math.max(1, Number(b.qty) || 1));

        const draft = await _findDraft(pool, customerId);
        if (!draft) return res.status(404).json({ success: false, error: 'no draft order' });

        // Cập nhật qty TRONG lock (SELECT … FOR UPDATE) → 2 patch / patch+add đồng thời
        // không nuốt nhau (lost update). newQty là giá trị TUYỆT ĐỐI (set, không delta).
        let qtyBefore = 0;
        let productName = null;
        let notFound = false;
        const { row: lockedRow } = await _withDraftLock(pool, draft.code, async (client, lr) => {
            const products = Array.isArray(lr.products) ? [...lr.products] : [];
            const idx = products.findIndex((p) => (p.code || p.productCode) === productCode);
            if (idx < 0) {
                notFound = true;
                return;
            }
            qtyBefore = _qtyOf(products[idx]);
            products[idx] = {
                ...products[idx],
                quantity: newQty,
                qty: newQty,
                updatedAt: Date.now(),
            };
            productName = products[idx].name;
            const t = _totalsOf(products);
            await client.query(
                `UPDATE native_orders
                 SET products = $1::jsonb,
                     total_quantity = $2,
                     total_amount = $3,
                     updated_at = $4
                 WHERE code = $5`,
                [JSON.stringify(products), t.qty, t.amt, Date.now(), lr.code]
            );
        });
        if (!lockedRow) return res.status(404).json({ success: false, error: 'no draft order' });
        if (notFound) return res.status(404).json({ success: false, error: 'product not in cart' });

        _logHistory(pool, {
            comment_id: customerId,
            customer_name: draft.customer_name,
            customer_phone: draft.phone,
            page_id: draft.fb_page_id,
            product_code: productCode,
            product_name: productName,
            action: 'qty-change',
            qty_before: qtyBefore,
            qty_after: newQty,
            user_id: user.id,
            user_name: user.name,
        });
        _notifyCart(customerId);
        _notifyNativeOrders('update', draft.code);
        _reconcileUnits(pool, draft.id); // đổi SL → gán thêm / nhả bớt unit
        res.json({ success: true, qty: newQty, native_order_code: draft.code });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:commentId/commit — DEPRECATED no-op (back-compat).
// Trước đây fire sau 5s undo để chuyển từ cart_items → native_order. Bây giờ /add
// ghi thẳng vào native_orders nên không cần commit nữa. Vẫn return success cho
// frontend cũ chưa update.
router.post('/:commentId/commit', requireWeb2AuthSoft, async (req, res) => {
    const draft = await _findDraft(
        req.app.locals.web2Db || req.app.locals.chatDb,
        req.params.commentId
    );
    res.json({
        success: true,
        deprecated: true,
        native_order_code: draft?.code || null,
        items: Array.isArray(draft?.products) ? draft.products.length : 0,
    });
});

// =====================================================
// History
// =====================================================

// GET /:commentId/history?limit=N
router.get('/:commentId/history', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const limit = Math.min(Number(req.query.limit) || 200, 1000);
        const r = await pool.query(
            `SELECT id, customer_name, customer_phone, product_code, product_name,
                    action, qty_before, qty_after, user_name, created_at
             FROM web2_cart_history
             WHERE comment_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [req.params.commentId, limit]
        );
        res.json({ success: true, items: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /history/all?limit=500 — toàn shop, dùng cho audit page
router.get('/history/all', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const limit = Math.min(Number(req.query.limit) || 500, 5000);
        const r = await pool.query(
            `SELECT id, comment_id, customer_name, customer_phone, product_code, product_name,
                    action, qty_before, qty_after, user_name, created_at
             FROM web2_cart_history
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
        );
        res.json({ success: true, items: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// Helper exported — gọi từ fast-sale-orders khi PBH tạo thành công.
//
// SAU REFACTOR: PBH route đã UPDATE native_orders.status = 'confirmed' rồi nên
// TPOS panel tự ẩn (filter status='draft'). Hàm này chỉ còn:
//   - Log audit history với reason='pbh-created'
//   - Fire SSE web2:cart để badge tpos panel refresh ngay (không đợi SSE
//     web2:native-orders propagate)
// Giữ signature cũ để fast-sale-orders.js không cần đổi.
// =====================================================
async function clearCartByCustomerId(pool, customerId, opts) {
    if (!pool || !customerId) return { removed: 0 };
    opts = opts || {};
    try {
        // Log audit từ draft đã chuyển status='confirmed'. Lookup theo PBH context
        // nếu có, fallback fb_user_id để ghi history rõ ràng.
        const orderQ = opts.nativeOrderCode
            ? await pool.query(`SELECT * FROM native_orders WHERE code = $1`, [
                  opts.nativeOrderCode,
              ])
            : await pool.query(
                  `SELECT * FROM native_orders
                   WHERE fb_user_id = $1
                   ORDER BY updated_at DESC LIMIT 1`,
                  [customerId]
              );
        const order = orderQ.rows[0];
        const products = order && Array.isArray(order.products) ? order.products : [];
        for (const p of products) {
            await _logHistory(pool, {
                comment_id: customerId,
                customer_name: order.customer_name,
                customer_phone: order.phone,
                page_id: order.fb_page_id,
                product_code: p.code,
                product_name: p.name,
                action: opts.reason || 'pbh-created',
                qty_before: _qtyOf(p),
                qty_after: 0,
                user_id: null,
                user_name: opts.pbhNumber ? `PBH ${opts.pbhNumber}` : null,
            });
        }
        _notifyCart(customerId);
        return { removed: products.length };
    } catch (e) {
        console.warn('[web2-cart] clearCartByCustomerId fail:', e.message);
        return { removed: 0, error: e.message };
    }
}

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.clearCartByCustomerId = clearCartByCustomerId;
