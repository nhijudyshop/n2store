// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — SẢN PHẨM TRONG CHIẾN DỊCH LIVESTREAM (campaign ⇄ product)
//
// Mục đích: cho phép user2 gắn SẢN PHẨM (web2_products) vào 1 CHIẾN DỊCH CHA
// (web2_live_parent_campaigns — bảng đã có trong web2-live-comments.js) để trang
// TV livestream (web2/live-tv) hiển thị ảnh to + tồn kho + chờ hàng + biến thể
// cho người live (user1) xem, đồng bộ realtime.
//
// QUYẾT ĐỊNH THIẾT KẾ:
//   • Bảng NỐI web2_campaign_products (KHÔNG nhét JSONB lên campaign) để JOIN
//     web2_products lấy stock/pending LIVE + SSE delta per-row + sort/pin được.
//   • "Số NCC báo" KHÔNG lưu ở đây — nó là web2_products.pending_qty (user chốt
//     2026-06-21). Bảng này chỉ quyết định SP NÀO lên TV + thứ tự + ghim.
//   • campaign_id trỏ web2_live_parent_campaigns.id (chiến dịch cha user-defined),
//     KHÔNG phải native_orders.live_campaign_id (hệ KPI/STT khác — đừng conflate).
//   • SSE topic RIÊNG 'web2:campaign-products' (membership đổi). Thay đổi tồn/chờ
//     hàng đã có topic 'web2:products' lo → TV subscribe CẢ HAI, ít noise.
//
// Endpoints (mount /api/web2-campaign-products):
//   GET    /?campaignId=X            → { success, items:[{...product, sort, pinned, addedAt}] }
//   POST   /  {campaignId, productCode | productCodes:[]} → add (upsert, sort cuối)
//   DELETE /  {campaignId, productCode}  (hoặc ?campaignId=&productCode=) → remove
//   PATCH  /reorder {campaignId, order:[code,...]}        → cập nhật sort
//   PATCH  /pin     {campaignId, productCode, pinned}     → ghim/bỏ ghim
// =====================================================

const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
const { recordAuditEvent } = require('../services/web2-audit-sink');
const { shelfStt } = require('../lib/web2-shelf-stt'); // STT kệ = campaign_stt ?? display_stt (1 nguồn)

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// -----------------------------------------------------
// SSE notifier (injected từ server.js). Topic 'web2:campaign-products'.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, campaignId) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:campaign-products',
            { action, campaignId: campaignId != null ? Number(campaignId) : null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[WEB2-CAMPAIGN-PRODUCTS] _notify failed:', e.message);
    }
}
// Broadcast trạng thái điều khiển màn TV (rows/cols/page) — topic riêng để live-tv
// + tab live-control khác lật trang/đổi layout realtime. Cùng hub web2 (_notifyClients).
function _notifyTvControl(control) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:live-tv-control', { ...control, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-CAMPAIGN-PRODUCTS] _notifyTvControl failed:', e.message);
    }
}

const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_campaign_products (
            id           BIGSERIAL PRIMARY KEY,
            campaign_id  BIGINT NOT NULL,
            product_code VARCHAR(40) NOT NULL,
            sort         INTEGER NOT NULL DEFAULT 0,
            pinned       BOOLEAN NOT NULL DEFAULT false,
            added_by     TEXT,
            added_at     BIGINT NOT NULL,
            UNIQUE (campaign_id, product_code)
        );
        CREATE INDEX IF NOT EXISTS idx_web2_campaign_products_cid
            ON web2_campaign_products (campaign_id, sort);
    `);
    // 2026-06-27: TOMBSTONE cho auto-add. Khi user ✕ xoá SP khỏi board → set
    // removed=true (KHÔNG hard-delete) để autoSyncPending KHÔNG tự thêm lại SP
    // "chờ hàng" đó. Re-add tay (POST /) sẽ un-tombstone. Idempotent (Render
    // restart chạy lần 2 = no-op).
    await pool.query(
        `ALTER TABLE web2_campaign_products
            ADD COLUMN IF NOT EXISTS removed BOOLEAN NOT NULL DEFAULT false`
    );
    // 2026-06-27: ĐIỀU KHIỂN MÀN TV per-campaign — layout (rows×cols) + trang đang
    // chiếu. live-control ghi (PATCH /control) → SSE web2:live-tv-control → live-tv
    // lật trang/đổi layout realtime cho viewer xem. 1 dòng / chiến dịch.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_live_tv_control (
            campaign_id  BIGINT PRIMARY KEY,
            rows         INTEGER NOT NULL DEFAULT 1,
            cols         INTEGER NOT NULL DEFAULT 4,
            page         INTEGER NOT NULL DEFAULT 0,
            updated_at   BIGINT
        );
    `);
    // 2026-06-27: ĐỊA DANH "CHO VƯỢT" — SP đúng địa danh này (hàng có sẵn, lấy về rồi
    // bán) được đặt VƯỢT NCC + báo hiệu badge. Vùng KHÁC = pre-order (bán mẫu trước,
    // đặt sau). Default 'HƯƠNG CHÂU'.
    await pool.query(
        `ALTER TABLE web2_live_tv_control
            ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'HƯƠNG CHÂU'`
    );
    _ensuredPools.add(pool);
}

// Map JOIN row (web2_campaign_products × web2_products) → object cho client.
// Field SP giữ đúng tên camelCase như Web2ProductsCache (code/name/imageUrl/stock/
// pendingQty/status/supplier/variant/returnQty/price) để consumer dùng chung shape.
// ĐỊA DANH từ prefix mã (HN=Hà Nội, HC=Hương Châu) — fallback khi region chưa set.
function regionFromCode(code) {
    const c = String(code || '').toUpperCase();
    if (c.startsWith('HN')) return 'HÀ NỘI';
    if (c.startsWith('HC')) return 'HƯƠNG CHÂU';
    return null;
}

function mapItem(row) {
    return {
        code: row.product_code,
        name: row.name || row.product_code,
        imageUrl: row.image_url || null,
        stock: Number(row.stock) || 0,
        pendingQty: Number(row.pending_qty) || 0,
        returnQty: Number(row.return_qty) || 0,
        status: row.status || 'DANG_BAN',
        supplier: row.supplier || null,
        // SP CHA–CON (Migration 070): parentCode = mã CHA (con trỏ về), isParent =
        // dòng aggregate. Màn TV/board gom các CON cùng CHA thành 1 card (nhiều biến
        // thể) qua Web2VariantGroup.group(..., {by:'parent'}). SP phẳng: parentCode=null.
        parentCode: row.parent_code || null,
        isParent: !!row.is_parent,
        // địa danh nhập hàng (Sổ Order: HÀ NỘI/HƯƠNG CHÂU) — cho chip lọc/badge picker.
        // Fallback prefix mã khi region rỗng (SP cũ chưa backfill).
        region: row.region || regionFromCode(row.product_code),
        variant: row.variant || null,
        price: Number(row.price || 0),
        // sold (GIỎ = TỔNG SL món trong giỏ KH draft) + newCust (MỚI = SL món của
        // khách CHƯA có SĐT & địa chỉ — 1 phần của GIỎ) gắn sau ở GET / (aggregate
        // native_orders draft). Default 0 cho path khác.
        sold: 0,
        newCust: 0,
        isActive: row.is_active == null ? true : !!row.is_active,
        // membership (campaign-product)
        sort: Number(row.sort) || 0,
        pinned: !!row.pinned,
        addedAt: Number(row.added_at) || 0,
        // SP đã bị xoá khỏi kho nhưng còn trong chiến dịch → name null
        missing: row.name == null,
    };
}

function actorOf(req) {
    return (
        (req.web2User && (req.web2User.display_name || req.web2User.username)) ||
        (req.body && String(req.body.userName || '').slice(0, 120)) ||
        null
    );
}

// Best-effort audit event-sink (web2_audit_events) — KHÔNG await, KHÔNG throw.
// Chỉ ghi hành động NGHIỆP VỤ (add/remove SP, set "số NCC báo") — bỏ qua reorder/pin
// (UI prefs, tránh nhiễu log khi đang live).
function _auditCampaign(req, action, campaignId, note) {
    recordAuditEvent(getPool(req), {
        entity: 'campaign',
        entityId: campaignId != null ? String(campaignId) : null,
        action,
        userId: req.body?.userId ?? req.web2User?.id ?? null,
        userName: actorOf(req),
        sourcePage: 'live-control',
        changes: note || {},
    });
}

// -----------------------------------------------------
// AUTO-ADD (2026-06-27): tự đồng bộ SP "chờ hàng" (Sổ Order) vào board livestream.
// Mỗi SP web2_products status='CHO_MUA' & pending_qty>0 (khớp ĐÚNG định nghĩa
// picker /api/web2-products/pending) mà CHƯA có trong chiến dịch → INSERT, MỚI
// NHẤT (updated_at DESC) lên TRÊN CÙNG. SP đã ✕ xoá (removed=true) = tombstone →
// KHÔNG tự thêm lại. Trả số dòng vừa thêm để caller broadcast SSE. Idempotent.
//
// sort: prepend lên đầu. base = MIN(sort) của row CÒN HIỂN THỊ (removed=false),
// =0 nếu trống. toAdd newest-first → newest nhận sort nhỏ nhất (base − len) =
// trên cùng, oldest = base − 1, đều nhỏ hơn mọi row visible hiện có.
async function autoSyncPending(pool, campaignId) {
    // GUARD: chỉ auto-add khi chiến dịch CHA tồn tại (tránh tạo orphan
    // campaign_products cho campaignId rác). Fail-open: query lỗi (bảng chưa
    // ensured lúc boot) → bỏ guard, vẫn chạy như cũ (KHÔNG chặn feature).
    try {
        const camp = await pool.query(
            `SELECT 1 FROM web2_live_parent_campaigns WHERE id = $1 LIMIT 1`,
            [campaignId]
        );
        if (!camp.rows.length) return { added: 0, purged: 0 };
    } catch (e) {
        /* bảng parent chưa tồn tại / lỗi tạm → fail-open */
    }
    // SELF-HEAL GHOST (2026-06-28): SP đã bị xoá khỏi KHO (web2_products) — qua nút
    // ✕ Xoá ở Kho SP HOẶC xoá row bên Số Order (adjust-pending ghost-cleanup khi
    // pending→0) — để lại cp row MỒ CÔI: LEFT JOIN web2_products → name=null →
    // "ghost" vẫn hiện trên board/TV (missing:true). Mọi product_code hợp lệ đều
    // được add từ nguồn web2_products (picker hoặc autoSync), nên thiếu HẲN ở kho =
    // SP thật sự đã xoá → hard-delete cp row (KHÔNG tombstone: SP không còn tồn tại,
    // tái tạo cùng mã sau này sẽ auto-add lại sạch). NOT EXISTS = NULL-safe + index.
    let purged = 0;
    try {
        const del = await pool.query(
            `DELETE FROM web2_campaign_products cp
              WHERE cp.campaign_id = $1
                AND NOT EXISTS (
                    SELECT 1 FROM web2_products p WHERE p.code = cp.product_code
                )`,
            [campaignId]
        );
        purged = del.rowCount | 0;
    } catch (e) {
        console.warn('[WEB2-CAMPAIGN-PRODUCTS] orphan purge failed:', e.message);
    }
    // LIMIT bound worst-case (CHO_MUA là working-set nhỏ, nhưng phòng tích tụ):
    // chỉ auto-add tối đa 300 SP chờ hàng mới nhất / lần. Đủ cho 1 phiên live.
    const pend = await pool.query(
        // is_parent = false: KHÔNG auto-add dòng CHA aggregate (Migration 070) — chỉ
        // các CON/SP phẳng bán được mới lên board; frontend gom CON cùng CHA thành 1 card.
        `SELECT code FROM web2_products
         WHERE status = 'CHO_MUA' AND pending_qty > 0 AND is_parent = false
         ORDER BY updated_at DESC NULLS LAST, code
         LIMIT 300`
    );
    if (!pend.rows.length) return { added: 0, purged };
    const ex = await pool.query(
        `SELECT product_code FROM web2_campaign_products WHERE campaign_id = $1`,
        [campaignId]
    );
    const existing = new Set(ex.rows.map((r) => r.product_code));
    const toAdd = pend.rows.map((r) => r.code).filter((c) => c && !existing.has(c));
    if (!toAdd.length) return { added: 0, purged };
    const minR = await pool.query(
        `SELECT COALESCE(MIN(sort), 0)::int AS m
           FROM web2_campaign_products WHERE campaign_id = $1 AND removed = false`,
        [campaignId]
    );
    const base = minR.rows[0].m | 0;
    const now = Date.now();
    let added = 0;
    for (let i = 0; i < toAdd.length; i++) {
        const sortVal = base - (toAdd.length - i); // i=0 (newest) → nhỏ nhất = top
        const ins = await pool.query(
            `INSERT INTO web2_campaign_products (campaign_id, product_code, sort, added_by, added_at)
             VALUES ($1, $2, $3, 'auto:so-order', $4)
             ON CONFLICT (campaign_id, product_code) DO NOTHING
             RETURNING id`,
            [campaignId, toAdd[i], sortVal, now]
        );
        if (ins.rows.length) added += 1;
    }
    return { added, purged };
}

// GET /?campaignId=X[&sync=1] — list SP của 1 chiến dịch, JOIN kho (LEFT để giữ
// SP đã xoá). sync=1 (chỉ live-control gửi) → autoSyncPending TRƯỚC khi list; TV
// (read-only) KHÔNG gửi sync nên không ghi DB. Chỉ trả row removed=false.
router.get('/', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const campaignId = Number(req.query.campaignId);
    if (!Number.isFinite(campaignId)) {
        return res.status(400).json({ success: false, error: 'campaignId required' });
    }
    try {
        await ensureTables(pool);
        // Auto-add SP chờ hàng (chỉ khi sync=1 → live-control). Broadcast nếu có
        // thêm để TV + tab khác refresh. KHÔNG throw (best-effort) → list vẫn chạy.
        if (req.query.sync === '1') {
            const sync = await autoSyncPending(pool, campaignId).catch((e) => {
                console.warn('[WEB2-CAMPAIGN-PRODUCTS] autoSync failed:', e.message);
                return { added: 0, purged: 0 };
            });
            // Broadcast khi có thêm SP chờ hàng MỚI hoặc dọn ghost (SP xoá khỏi kho)
            // → TV + tab khác refresh realtime, không kẹt ghost tới khi F5.
            if ((sync.added | 0) > 0 || (sync.purged | 0) > 0) _notify('auto-add', campaignId);
        }
        const r = await pool.query(
            `SELECT cp.product_code, cp.sort, cp.pinned, cp.added_at,
                    p.name, p.image_url, p.stock, p.pending_qty, p.return_qty,
                    p.status, p.supplier, p.variant, p.price, p.is_active, p.region,
                    p.parent_code, p.is_parent
             FROM web2_campaign_products cp
             LEFT JOIN web2_products p ON p.code = cp.product_code
             WHERE cp.campaign_id = $1 AND cp.removed = false
             ORDER BY cp.pinned DESC, cp.sort ASC, cp.added_at DESC`,
            [campaignId]
        );
        const items = r.rows.map(mapItem);
        // GIỎ (sold = TỔNG SL món trong giỏ KH draft) + MỚI (new_cust = SL món của
        // khách chưa SĐT & địa chỉ — 1 phần của GIỎ) per mã SP. Dùng cho board +
        // màn TV. Cùng pool web2Db (native_orders ⊂ web2Db). CÒN = max(0, NCC − GIỎ)
        // tính ở CLIENT (Web2LiveTvDisplay.khConModel); địa danh CHO VƯỢT → GIỎ
        // vượt NCC được (badge VƯỢT).
        const codes = [...new Set(items.map((it) => it.code).filter(Boolean))];
        if (codes.length) {
            const hr = await pool.query(
                `SELECT COALESCE(prod->>'productCode', prod->>'code') AS code,
                        SUM(COALESCE((prod->>'quantity')::numeric, (prod->>'qty')::numeric, 0)) AS sold,
                        SUM(COALESCE((prod->>'quantity')::numeric, (prod->>'qty')::numeric, 0))
                          FILTER (WHERE COALESCE(n.phone, '') = ''
                                    AND COALESCE(n.address, '') = '') AS new_cust
                 FROM native_orders n, jsonb_array_elements(n.products) prod
                 WHERE COALESCE(prod->>'productCode', prod->>'code') = ANY($1::text[])
                   AND n.status = 'draft'
                 GROUP BY 1`,
                [codes]
            );
            const soldMap = new Map();
            for (const row of hr.rows) {
                if (row.code)
                    soldMap.set(row.code, {
                        sold: Number(row.sold) || 0,
                        newCust: Number(row.new_cust) || 0, // MỚI = SL món của khách mới
                    });
            }
            for (const it of items) {
                const m = soldMap.get(it.code);
                if (m) {
                    it.sold = m.sold;
                    it.newCust = m.newCust;
                }
            }
        }
        res.json({ success: true, items });
    } catch (e) {
        console.error('[WEB2-CAMPAIGN-PRODUCTS] list error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST / {campaignId, productCode | productCodes:[]} — gắn SP vào chiến dịch.
// 2026-06-27: thêm tay → LÊN TRÊN CÙNG (sort = MIN(sort)−1, giảm dần). UPSERT
// un-tombstone (removed=false) → re-add SP đã ✕ xoá đưa lại lên đầu.
router.post('/', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const b = req.body || {};
    const campaignId = Number(b.campaignId);
    if (!Number.isFinite(campaignId)) {
        return res.status(400).json({ success: false, error: 'campaignId required' });
    }
    let codes = Array.isArray(b.productCodes)
        ? b.productCodes
        : b.productCode != null
          ? [b.productCode]
          : [];
    codes = [...new Set(codes.map((c) => String(c || '').trim()).filter(Boolean))].slice(0, 500);
    if (!codes.length) {
        return res.status(400).json({ success: false, error: 'productCode(s) required' });
    }
    const now = Date.now();
    const addedBy = actorOf(req);
    try {
        await ensureTables(pool);
        // Prepend lên đầu: base = MIN(sort) của row visible (=0 nếu trống); mỗi
        // code nhận sort giảm dần → code đầu danh sách nằm trên cùng.
        const minR = await pool.query(
            `SELECT COALESCE(MIN(sort), 0)::int AS m
               FROM web2_campaign_products WHERE campaign_id = $1 AND removed = false`,
            [campaignId]
        );
        let nextSort = (minR.rows[0].m | 0) - 1;
        let added = 0;
        for (const code of codes) {
            // UPSERT: SP mới → insert; SP đã tombstone (removed=true) → un-tombstone
            // + đưa lên đầu. ON CONFLICT vẫn move-to-top cho re-add tay.
            await pool.query(
                `INSERT INTO web2_campaign_products (campaign_id, product_code, sort, added_by, added_at)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (campaign_id, product_code)
                   DO UPDATE SET removed = false, sort = EXCLUDED.sort,
                                 added_at = EXCLUDED.added_at, added_by = EXCLUDED.added_by`,
                [campaignId, code, nextSort, addedBy, now]
            );
            nextSort -= 1;
            added += 1;
        }
        _notify('add', campaignId);
        if (added)
            _auditCampaign(req, 'add-products', campaignId, { added, codes: codes.slice(0, 20) });
        res.json({ success: true, added, total: codes.length });
    } catch (e) {
        console.error('[WEB2-CAMPAIGN-PRODUCTS] add error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE / {campaignId, productCode} (hoặc query) — gỡ SP khỏi chiến dịch.
// 2026-06-27: SOFT-DELETE (removed=true) thay vì hard-delete → tombstone để
// autoSyncPending KHÔNG tự thêm lại SP chờ hàng đã gỡ. Re-add tay (POST /)
// un-tombstone. Row vẫn ẩn khỏi GET (filter removed=false).
router.delete('/', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const campaignId = Number(req.body?.campaignId ?? req.query.campaignId);
    const code = String(req.body?.productCode ?? req.query.productCode ?? '').trim();
    if (!Number.isFinite(campaignId) || !code) {
        return res.status(400).json({ success: false, error: 'campaignId + productCode required' });
    }
    try {
        await ensureTables(pool);
        await pool.query(
            `UPDATE web2_campaign_products SET removed = true
             WHERE campaign_id = $1 AND product_code = $2`,
            [campaignId, code]
        );
        _notify('remove', campaignId);
        _auditCampaign(req, 'remove-product', campaignId, { code });
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-CAMPAIGN-PRODUCTS] remove error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// PATCH /reorder {campaignId, order:[code,...]} — cập nhật thứ tự (sort = index).
router.patch('/reorder', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const campaignId = Number(req.body?.campaignId);
    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    if (!Number.isFinite(campaignId) || !order.length) {
        return res.status(400).json({ success: false, error: 'campaignId + order[] required' });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        for (let i = 0; i < order.length; i++) {
            await client.query(
                `UPDATE web2_campaign_products SET sort = $3
                 WHERE campaign_id = $1 AND product_code = $2 AND removed = false`,
                [campaignId, String(order[i]).trim(), i]
            );
        }
        await client.query('COMMIT');
        _notify('reorder', campaignId);
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-CAMPAIGN-PRODUCTS] reorder error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        client.release();
    }
});

// PATCH /pin {campaignId, productCode, pinned} — ghim/bỏ ghim SP lên đầu TV.
router.patch('/pin', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const campaignId = Number(req.body?.campaignId);
    const code = String(req.body?.productCode || '').trim();
    if (!Number.isFinite(campaignId) || !code) {
        return res.status(400).json({ success: false, error: 'campaignId + productCode required' });
    }
    const pinned = !!req.body?.pinned;
    try {
        await ensureTables(pool);
        await pool.query(
            `UPDATE web2_campaign_products SET pinned = $3
             WHERE campaign_id = $1 AND product_code = $2 AND removed = false`,
            [campaignId, code, pinned]
        );
        _notify('pin', campaignId);
        res.json({ success: true, pinned });
    } catch (e) {
        console.error('[WEB2-CAMPAIGN-PRODUCTS] pin error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// PATCH /pending {campaignId, productCode, pendingQty} — set "SỐ NCC BÁO" tuyệt đối.
// Cập nhật web2_products.pending_qty + status (KHÔNG auto-delete ghost → SP giữ trên
// board). Broadcast trên web2:campaign-products (topic mà trang TV nghe) → TV cập nhật
// ngay. Dùng cho luồng live: user2 nhập số NCC báo → user1 thấy realtime.
router.patch('/pending', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const campaignId = Number(req.body?.campaignId);
    const code = String(req.body?.productCode || '').trim();
    const qty = Math.max(0, Math.floor(Number(req.body?.pendingQty)));
    if (!code || !Number.isFinite(qty)) {
        return res.status(400).json({ success: false, error: 'productCode + pendingQty required' });
    }
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `UPDATE web2_products
             SET pending_qty = $2,
                 status = CASE WHEN $2 > 0 THEN 'CHO_MUA'
                               WHEN stock > 0 THEN 'DANG_BAN'
                               ELSE status END,
                 updated_at = $3
             WHERE code = $1
             RETURNING pending_qty, stock, status`,
            [code, qty, Date.now()]
        );
        if (!r.rows.length)
            return res.status(404).json({ success: false, error: 'product not found' });
        _notify('pending', campaignId);
        _auditCampaign(req, 'set-pending', campaignId, { code, qty });
        // Cũng báo web2:products → Kho SP + consumer SP khác cũng sync số chờ hàng
        // (số NCC báo = pending_qty của web2_products), không chỉ trang TV/board.
        if (_notifyClients) {
            try {
                _notifyClients(
                    'web2:products',
                    { action: 'pending', code, ts: Date.now() },
                    'update'
                );
            } catch (e) {
                /* non-fatal */
            }
        }
        res.json({
            success: true,
            pendingQty: Number(r.rows[0].pending_qty) || 0,
            stock: Number(r.rows[0].stock) || 0,
            status: r.rows[0].status,
        });
    } catch (e) {
        console.error('[WEB2-CAMPAIGN-PRODUCTS] set pending error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// -----------------------------------------------------
// ĐIỀU KHIỂN MÀN TV (live-control ⇄ live-tv) — layout + trang đang chiếu.
// -----------------------------------------------------
const TV_DEFAULT = { rows: 1, cols: 4, page: 0, region: 'HƯƠNG CHÂU' };
function clampInt(v, min, max, dflt) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
}
function readControl(row) {
    return row
        ? {
              rows: Number(row.rows) || TV_DEFAULT.rows,
              cols: Number(row.cols) || TV_DEFAULT.cols,
              page: Math.max(0, Number(row.page) || 0),
              region: row.region || TV_DEFAULT.region,
          }
        : { ...TV_DEFAULT };
}

// GET /control?campaignId=X → { success, control:{rows,cols,page,region} } (default nếu chưa có).
router.get('/control', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const campaignId = Number(req.query.campaignId);
    if (!Number.isFinite(campaignId)) {
        return res.status(400).json({ success: false, error: 'campaignId required' });
    }
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT rows, cols, page, region FROM web2_live_tv_control WHERE campaign_id = $1`,
            [campaignId]
        );
        res.json({ success: true, control: readControl(r.rows[0]) });
    } catch (e) {
        console.error('[WEB2-CAMPAIGN-PRODUCTS] control get error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// PATCH /control?campaignId=X {rows?,cols?,page?,region?} — upsert phần được gửi,
// broadcast web2:live-tv-control. rows 1..6, cols 1..10, page ≥ 0, region = địa danh.
router.patch('/control', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const campaignId = Number(req.query.campaignId ?? req.body?.campaignId);
    if (!Number.isFinite(campaignId)) {
        return res.status(400).json({ success: false, error: 'campaignId required' });
    }
    const b = req.body || {};
    try {
        await ensureTables(pool);
        // Đọc hiện tại (hoặc default) rồi merge field được gửi → upsert tuyệt đối.
        const cur = await pool.query(
            `SELECT rows, cols, page, region FROM web2_live_tv_control WHERE campaign_id = $1`,
            [campaignId]
        );
        const base = readControl(cur.rows[0]);
        // CHỈ admin được đổi ĐỊA DANH CHO VƯỢT (quyết định vùng được đặt VƯỢT NCC +
        // cách tính CÒN). Non-admin (operator live) vẫn đổi layout/trang bình thường —
        // region của họ bị BỎ QUA (giữ base), không reject cả request để khỏi vỡ lật trang.
        const isAdminReq = String(req.web2User?.role || '').toLowerCase() === 'admin';
        const regionAllowed = isAdminReq && b.region != null;
        const next = {
            rows: b.rows != null ? clampInt(b.rows, 1, 6, base.rows) : base.rows,
            cols: b.cols != null ? clampInt(b.cols, 1, 10, base.cols) : base.cols,
            page: b.page != null ? Math.max(0, clampInt(b.page, 0, 9999, base.page)) : base.page,
            region: regionAllowed
                ? String(b.region).trim().slice(0, 80) || base.region
                : base.region,
        };
        await pool.query(
            `INSERT INTO web2_live_tv_control (campaign_id, rows, cols, page, region, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (campaign_id)
               DO UPDATE SET rows = EXCLUDED.rows, cols = EXCLUDED.cols, page = EXCLUDED.page,
                             region = EXCLUDED.region, updated_at = EXCLUDED.updated_at`,
            [campaignId, next.rows, next.cols, next.page, next.region, Date.now()]
        );
        _notifyTvControl({ campaignId, ...next });
        res.json({ success: true, control: next });
    } catch (e) {
        console.error('[WEB2-CAMPAIGN-PRODUCTS] control patch error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /cart-detail?code=X — chi tiết "GIỎ" / "KH MỚI" của 1 SP cho popup khi bấm
// số ở board. Mỗi dòng = 1 đơn draft chứa SP X (1 giỏ khách) + SL + KH có MỚI
// không (chưa SĐT & địa chỉ — cả 2 trống). Khớp ĐÚNG nguồn GIỎ/KH MỚI ở GET /
// (native_orders status='draft'). KHÔNG cần campaignId (giỏ global theo mã SP).
router.get('/cart-detail', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).json({ success: false, error: 'code required' });
    try {
        const r = await pool.query(
            `SELECT n.code AS order_code, n.display_stt, n.campaign_stt, n.customer_name, n.phone,
                    n.address, n.fb_user_id, n.fb_user_name, n.fb_page_id, n.created_at,
                    SUM(COALESCE((prod->>'quantity')::numeric, (prod->>'qty')::numeric, 0)) AS qty
             FROM native_orders n, jsonb_array_elements(n.products) prod
             WHERE COALESCE(prod->>'productCode', prod->>'code') = $1
               AND n.status = 'draft'
             GROUP BY n.id, n.code, n.display_stt, n.campaign_stt, n.customer_name, n.phone, n.address,
                      n.fb_user_id, n.fb_user_name, n.fb_page_id, n.created_at
             ORDER BY n.created_at DESC NULLS LAST`,
            [code]
        );
        const items = r.rows.map((row) => {
            const phone = String(row.phone || '').trim();
            const address = String(row.address || '').trim();
            return {
                orderCode: row.order_code,
                stt: shelfStt(row), // STT kệ = campaign_stt ?? display_stt (khớp tem + unit-scan)
                customerName: row.customer_name || null,
                phone: phone || null,
                address: address || null,
                fbId: row.fb_user_id || null,
                fbPageId: row.fb_page_id || null, // page để resolve avatar qua /api/fb-avatar
                fbName: row.fb_user_name || null,
                qty: Number(row.qty) || 0,
                isNewCust: !phone && !address, // KH mới = chưa có SĐT & địa chỉ
                createdAt: Number(row.created_at) || 0,
                avatar: null, // hash pancake (thường null) — FE fallback /api/fb-avatar
                comment: null,
            };
        });
        // Enrich comment livestream + page (cho avatar) theo fb_id từ
        // web2_live_comments (comment mới nhất / KH). Avatar pages.fm hầu hết null →
        // FE dựng URL /api/fb-avatar?id=fbId&page=pageId (page nơi KH là contact
        // Pancake → ảnh thật, như live-chat). Defensive: lỗi/thiếu bảng → bỏ qua.
        const fbIds = [...new Set(items.map((it) => it.fbId).filter(Boolean))];
        if (fbIds.length) {
            try {
                const cr = await pool.query(
                    `SELECT DISTINCT ON (fb_id) fb_id, avatar, message, page_id
                     FROM web2_live_comments
                     WHERE fb_id = ANY($1::text[])
                     ORDER BY fb_id, created_time DESC NULLS LAST`,
                    [fbIds]
                );
                const cmap = new Map();
                for (const row of cr.rows) {
                    cmap.set(String(row.fb_id), {
                        avatar: row.avatar || null,
                        comment: row.message || null,
                        pageId: row.page_id || null,
                    });
                }
                for (const it of items) {
                    const c = it.fbId && cmap.get(String(it.fbId));
                    if (c) {
                        it.avatar = c.avatar;
                        it.comment = c.comment;
                        // Page comment (nơi KH là contact Pancake) ưu tiên cho avatar.
                        if (c.pageId) it.fbPageId = c.pageId;
                    }
                }
            } catch (e) {
                console.warn('[WEB2-CAMPAIGN-PRODUCTS] cart-detail enrich failed:', e.message);
            }
        }
        res.json({ success: true, items });
    } catch (e) {
        console.error('[WEB2-CAMPAIGN-PRODUCTS] cart-detail error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.ensureTables = ensureTables;
