// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
// =====================================================
// WEB 2.0 — PER-UNIT PRODUCT TRACKING (mã đơn vị + QR riêng/món)
// =====================================================
// Mỗi MÓN VẬT LÝ của 1 SP có 1 mã đơn vị riêng (vd KHOAODEN-017) + QR riêng.
// Sinh lúc NHẬN HÀNG (so-order) → in tem dán lên từng món → quét ngoài để biết
// SP của NCC nào / đợt nào / đã in mấy lần / thuộc đơn nào (kệ STT).
//
// Đặc tả & quyết định: docs/web2/PER-UNIT-QR-PLAN.md
//   - serial CẤP SERVER (atomic, advisory-lock theo product_code) → KHÔNG đua-race
//     (vá lớp lỗi sinh-trùng client-side mà audit Web2ProductCode đã chứng minh).
//   - serial GLOBAL theo product_code (đợt12→001-010, đợt15→011-018) → KHÔNG trùng
//     giữa các đợt; 1 SP nhận của NHIỀU NCC vẫn truy đúng nguồn (supplier+shipment_id).
//   - mint IDEMPOTENT theo (product_code, shipment_id): gọi lại (reprint) trả unit cũ,
//     chỉ top-up khi qty tăng → in lại KHÔNG sinh mã mới.
//   - STT kệ = native_orders.campaign_stt (per chiến dịch, bounded) — KHÔNG bin-pool mới.
//   - QR mã hóa URL ngắn .../web2/unit-scan/?u=<id> (frontend dựng URL từ id trả về).
//
// Pool: web2Db || chatDb (Web 2.0). SSE topic: web2:product-units.
// =====================================================

const express = require('express');
const { requireWeb2AuthSoft, requireWeb2Admin } = require('../middleware/web2-auth');
const { shelfStt } = require('../lib/web2-shelf-stt'); // STT kệ = campaign_stt ?? display_stt (1 nguồn)
const router = express.Router();

const MAX_MINT_QTY = 500; // trần qty/lần mint (SL/SP hiếm khi >100; 500 là biên an toàn)
const VALID_STATUS = new Set(['IN_STOCK', 'ASSIGNED', 'PACKED', 'SHIPPED', 'RETURNED']);

// ── SSE notifier (injected từ server.js) ─────────────────────────────
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, payload) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:product-units', { action, ts: Date.now(), ...payload }, 'update');
    } catch (e) {
        console.warn('[WEB2-PRODUCT-UNITS] _notify failed:', e.message);
    }
}

function _getDb(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}
function _userName(req) {
    const b = req.body || {};
    return b.userName || b.createdByName || req.headers['x-user-name'] || null;
}

// ── ensureTables (idempotent mỗi boot/handler, key theo pool) ─────────
const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (!pool || _ensuredPools.has(pool)) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_product_units (
            id             SERIAL PRIMARY KEY,
            unit_code      VARCHAR(48) UNIQUE NOT NULL,
            product_code   VARCHAR(40) NOT NULL,
            seq            INTEGER NOT NULL,
            supplier       VARCHAR(255),
            shipment_id    VARCHAR(120),
            print_count    INTEGER NOT NULL DEFAULT 0,
            status         VARCHAR(20) NOT NULL DEFAULT 'IN_STOCK',
            order_id       INTEGER,
            order_code     VARCHAR(60),
            order_stt      INTEGER,
            customer_name  VARCHAR(255),
            customer_phone VARCHAR(40),
            created_by     VARCHAR(120),
            created_at     BIGINT NOT NULL,
            updated_at     BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_w2pu_product  ON web2_product_units(product_code);
        CREATE INDEX IF NOT EXISTS idx_w2pu_status   ON web2_product_units(status);
        CREATE INDEX IF NOT EXISTS idx_w2pu_order    ON web2_product_units(order_id);
        CREATE INDEX IF NOT EXISTS idx_w2pu_shipment ON web2_product_units(product_code, shipment_id);

        CREATE TABLE IF NOT EXISTS web2_product_unit_events (
            id             SERIAL PRIMARY KEY,
            unit_id        INTEGER NOT NULL,
            unit_code      VARCHAR(48) NOT NULL,
            event          VARCHAR(20) NOT NULL,
            order_id       INTEGER,
            order_code     VARCHAR(60),
            order_stt      INTEGER,
            customer_name  VARCHAR(255),
            customer_phone VARCHAR(40),
            note           TEXT,
            user_name      VARCHAR(120),
            created_at     BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_w2pue_unit ON web2_product_unit_events(unit_id, created_at DESC);

        -- KHO RỚT XẢ (clearance): cờ override thủ công. NULL = AUTO (tính lúc đọc,
        -- derived/lazy — KHÔNG cron); 'KEEP' = ép giữ kho chính; 'CLEARANCE' = ép xả.
        ALTER TABLE web2_product_units ADD COLUMN IF NOT EXISTS clearance_state VARCHAR(12);
    `);
    _ensuredPools.add(pool);
}

// Kho rớt xả — config (derived, không cron). Aging tier theo ngày-từ-chiến-dịch-xong.
const CLEARANCE_GRACE_MS = 24 * 60 * 60 * 1000; // 1 ngày ân hạn sau khi chiến dịch xong
const DAY_MS = 24 * 60 * 60 * 1000;
const CLEARANCE_DONE_RATIO = 0.7; // chiến dịch "xong" khi da_doi_soat > 70% tổng đơn (chưa huỷ)

// CTE dùng chung cho /clearance — settlement THEO CHIẾN DỊCH (live_campaign_id, có thể
// gồm nhiều ngày liên tục). Logic (user spec 2026-06-29):
//   • da_doi_soat(đơn) = MỌI PBH của đơn (fast_sale_orders, source_type='native_order',
//     bỏ bill huỷ) đã packed/shipped/delivered (BOOL_AND). = đơn đã đối soát.
//   • chiến dịch "xong" = da_doi_soat > 70% tổng đơn (chưa huỷ) của chiến dịch.
//   • SP → chiến dịch GẦN NHẤT từng chứa SP (DISTINCT ON pcode, last_at DESC). Còn live
//     mới đang bán SP thì chiến dịch gần nhất CHƯA xong → giữ kho chính (không xả nhầm).
//   • anchor = đơn cuối (MAX created_at, bigint ms) của chiến dịch đó → +1 ngày ân hạn.
// Bỏ NO_CAMPAIGN (đơn inbox/thủ công không campaign) khỏi clearance — rớt xả là khái
// niệm của livestream. SP chưa từng vào campaign nào → giữ kho chính.
const CLEARANCE_CTE = `
    pbh AS (
        SELECT source_code,
               BOOL_AND(COALESCE(fulfillment_state IN ('packed','shipped','delivered'), false)) AS all_reconciled
        FROM fast_sale_orders
        WHERE source_type='native_order' AND state <> 'cancel'
        GROUP BY source_code
    ),
    ord AS (
        SELECT no.id, no.live_campaign_id AS cid, no.created_at, no.products,
               COALESCE(pbh.all_reconciled, false) AS reconciled
        FROM native_orders no
        LEFT JOIN pbh ON pbh.source_code = no.code
        WHERE no.live_campaign_id IS NOT NULL AND no.status <> 'cancelled'
    ),
    camp AS (
        SELECT cid, MAX(created_at) AS last_at,
               (COUNT(*) > 0 AND COUNT(*) FILTER (WHERE reconciled)::float / COUNT(*) > ${CLEARANCE_DONE_RATIO}) AS done
        FROM ord GROUP BY cid
    ),
    prodcamp AS (
        SELECT DISTINCT COALESCE(e->>'productCode', e->>'code') AS pcode, o.cid
        FROM ord o,
             jsonb_array_elements(CASE WHEN jsonb_typeof(o.products)='array' THEN o.products ELSE '[]'::jsonb END) e
        WHERE COALESCE(e->>'productCode', e->>'code') IS NOT NULL
    ),
    prod AS (
        SELECT DISTINCT ON (pc.pcode) pc.pcode, c.done, c.last_at AS anchor_at
        FROM prodcamp pc JOIN camp c ON c.cid = pc.cid
        ORDER BY pc.pcode, c.last_at DESC NULLS LAST
    )`;
function _clearanceTier(daysSince) {
    if (daysSince >= 90) return 'THANH_LY'; // >90 ngày → thanh lý
    if (daysSince >= 30) return 'XA_MANH'; // 30-90 → xả mạnh
    return 'RUOT_XA'; // <30 → rớt xả thường
}

async function _logEvent(client, unit, event, extra = {}) {
    try {
        await client.query(
            `INSERT INTO web2_product_unit_events
                (unit_id, unit_code, event, order_id, order_code, order_stt,
                 customer_name, customer_phone, note, user_name, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                unit.id,
                unit.unit_code,
                event,
                extra.order_id ?? null,
                extra.order_code ?? null,
                extra.order_stt ?? null,
                extra.customer_name ?? null,
                extra.customer_phone ?? null,
                extra.note ?? null,
                extra.user_name ?? null,
                Date.now(),
            ]
        );
    } catch (e) {
        console.warn('[WEB2-PRODUCT-UNITS] _logEvent failed:', e.message);
    }
}

function _pad(n) {
    return String(n).padStart(3, '0');
}
function mapUnit(r) {
    return {
        id: r.id,
        unitCode: r.unit_code,
        productCode: r.product_code,
        seq: r.seq,
        supplier: r.supplier || null,
        shipmentId: r.shipment_id || null,
        printCount: Number(r.print_count) || 0,
        status: r.status,
        orderId: r.order_id || null,
        orderCode: r.order_code || null,
        orderStt: r.order_stt || null,
        customerName: r.customer_name || null,
        customerPhone: r.customer_phone || null,
        clearanceState: r.clearance_state || null,
        createdAt: Number(r.created_at) || null,
        updatedAt: Number(r.updated_at) || null,
    };
}

// =====================================================================
// ensureUnits(pool, productCode, target, opts) — ĐẢM BẢO tổng unit của SP = target.
// Logic SL (user chốt 2026-06-29): có bao nhiêu số lượng SP → SP-001..SP-target.
// TOP-UP ONLY: thiếu thì mint thêm (seq tiếp theo), ĐỦ rồi → no-op, KHÔNG xoá
// (unit là tem vật lý + có thể đã gán đơn). Serial global per product_code, 3 số
// (SL < 1000). Advisory-lock per product_code → race-free. Idempotent (gọi nhiều
// lần an toàn). Dùng bởi web2-products (tạo/sửa SP) + so-order + Kho SP print.
// ⚠ Giả định units liền mạch (count == maxSeq) — đúng vì KHÔNG có endpoint xoá unit.
// =====================================================================
async function ensureUnits(pool, productCode, target, opts = {}) {
    productCode = String(productCode || '').trim();
    target = Math.max(0, Math.min(MAX_MINT_QTY, Math.round(Number(target) || 0)));
    if (!productCode || !target) return { created: 0, total: 0, units: [] };
    const supplier = (opts.supplier || '').trim() || null;
    const createdBy = (opts.createdBy || '').trim() || null;
    const shipmentId = (opts.shipmentId || '').trim() || null;
    const note = opts.note || 'auto theo SL';
    await ensureTables(pool);
    const client = await pool.connect();
    let created = 0;
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['w2pu:' + productCode]);
        const agg = (
            await client.query(
                `SELECT COUNT(*)::int AS c, COALESCE(MAX(seq),0)::int AS m
                   FROM web2_product_units WHERE product_code = $1`,
                [productCode]
            )
        ).rows[0];
        let total = agg.c || 0;
        let maxSeq = agg.m || 0;
        if (total < target) {
            const now = Date.now();
            const need = target - total;
            for (let i = 1; i <= need; i++) {
                const seq = maxSeq + i;
                const unitCode = `${productCode}-${_pad(seq)}`;
                const r = await client.query(
                    `INSERT INTO web2_product_units
                        (unit_code, product_code, seq, supplier, shipment_id, created_by, created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
                     ON CONFLICT (unit_code) DO NOTHING RETURNING *`,
                    [unitCode, productCode, seq, supplier, shipmentId, createdBy, now]
                );
                if (r.rows[0]) {
                    await _logEvent(client, r.rows[0], 'MINT', { note, user_name: createdBy });
                    created++;
                    total++;
                }
            }
        }
        await client.query('COMMIT');
        if (created) _notify('mint', { productCode, created, total });
        const units = (
            await pool.query(
                `SELECT * FROM web2_product_units WHERE product_code = $1 ORDER BY seq ASC`,
                [productCode]
            )
        ).rows.map(mapUnit);
        return { created, total, units };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-PRODUCT-UNITS] ensureUnits error:', productCode, e.message);
        return { created: 0, total: 0, units: [], error: e.message };
    } finally {
        client.release();
    }
}

// ensureUnitsForCodes(pool, codes) — đọc SL (stock+pending_qty) từ web2_products
// cho từng mã rồi ensureUnits(code, SL). Bỏ qua SP cha (units theo SKU con). Gọi
// fire-and-forget sau COMMIT ở web2-products (tạo/sửa SL) → units có sẵn TRƯỚC khi
// SP vào giỏ (reconcile cần unit để gán STT).
async function ensureUnitsForCodes(pool, codes) {
    const list = [...new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean))];
    if (!list.length) return;
    try {
        await ensureTables(pool);
        const rows = (
            await pool.query(
                `SELECT code, COALESCE(stock,0) + COALESCE(pending_qty,0) AS total, supplier
                   FROM web2_products
                  WHERE code = ANY($1::text[]) AND COALESCE(is_parent,false) = false`,
                [list]
            )
        ).rows;
        for (const r of rows) {
            const target = Number(r.total) || 0;
            if (target > 0)
                await ensureUnits(pool, r.code, target, {
                    supplier: r.supplier,
                    note: 'auto theo SL kho',
                });
        }
    } catch (e) {
        console.error('[WEB2-PRODUCT-UNITS] ensureUnitsForCodes error:', e.message);
    }
}

// =====================================================================
// POST /mint — cấp N unit cho (product_code, shipment_id). IDEMPOTENT.
// body: { product_code, supplier?, shipment_id?, qty, createdBy? }
// → { success, units:[{id, unitCode, seq, ...}], created, reused }
// =====================================================================
router.post('/mint', requireWeb2AuthSoft, async (req, res) => {
    const pool = _getDb(req);
    const b = req.body || {};
    const productCode = (b.product_code || b.productCode || '').trim();
    const shipmentId = (b.shipment_id || b.shipmentId || '').trim() || null;
    const supplier = (b.supplier || '').trim() || null;
    const qty = Math.max(0, Math.min(MAX_MINT_QTY, Math.round(Number(b.qty) || 0)));
    const createdBy = (b.createdBy || _userName(req) || '').trim() || null;
    if (!productCode) return res.status(400).json({ error: 'Thiếu product_code' });
    if (!qty) return res.status(400).json({ error: 'qty phải > 0' });

    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        // Serialize mint theo product_code (advisory-xact-lock auto-release on commit)
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['w2pu:' + productCode]);

        // Unit đã có cho (product_code, shipment_id) — idempotent
        const existing = (
            await client.query(
                `SELECT * FROM web2_product_units
                 WHERE product_code = $1 AND COALESCE(shipment_id,'') = COALESCE($2,'')
                 ORDER BY seq ASC`,
                [productCode, shipmentId]
            )
        ).rows;

        let created = 0;
        if (existing.length < qty) {
            const need = qty - existing.length;
            const maxSeq =
                (
                    await client.query(
                        `SELECT COALESCE(MAX(seq),0) AS m FROM web2_product_units WHERE product_code = $1`,
                        [productCode]
                    )
                ).rows[0].m || 0;
            const now = Date.now();
            for (let i = 1; i <= need; i++) {
                const seq = maxSeq + i;
                const unitCode = `${productCode}-${_pad(seq)}`;
                const r = await client.query(
                    `INSERT INTO web2_product_units
                        (unit_code, product_code, seq, supplier, shipment_id, created_by, created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
                     ON CONFLICT (unit_code) DO NOTHING
                     RETURNING *`,
                    [unitCode, productCode, seq, supplier, shipmentId, createdBy, now]
                );
                if (r.rows[0]) {
                    await _logEvent(client, r.rows[0], 'MINT', {
                        note: shipmentId,
                        user_name: createdBy,
                    });
                    existing.push(r.rows[0]);
                    created++;
                }
            }
        }
        await client.query('COMMIT');
        const units = existing.slice(0, Math.max(qty, existing.length)).map(mapUnit);
        if (created) _notify('mint', { productCode, shipmentId, created });
        res.json({ success: true, units, created, reused: units.length - created });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-PRODUCT-UNITS] /mint error:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// =====================================================================
// POST /ensure — đảm bảo units = SL (stock+pending) của SP, đọc TỪ web2_products.
// body: { product_code } hoặc { productCodes:[...] }. Server tự tính target (SL kho)
// → top-up mint → trả units. Dùng bởi Kho SP / so-order khi in (self-heal nếu SP
// tạo trước feature này hoặc SL vừa tăng). KHÔNG cần truyền qty (1 nguồn = SL kho).
// =====================================================================
router.post('/ensure', requireWeb2AuthSoft, async (req, res) => {
    const pool = _getDb(req);
    const b = req.body || {};
    const codes = Array.isArray(b.productCodes)
        ? b.productCodes
        : [b.product_code || b.productCode].filter(Boolean);
    if (!codes.length) return res.status(400).json({ error: 'Thiếu product_code' });
    try {
        await ensureUnitsForCodes(pool, codes);
        const list = [...new Set(codes.map((c) => String(c || '').trim()).filter(Boolean))];
        const rows = (
            await pool.query(
                `SELECT * FROM web2_product_units WHERE product_code = ANY($1::text[]) ORDER BY product_code, seq ASC`,
                [list]
            )
        ).rows.map(mapUnit);
        const byCode = {};
        for (const u of rows) (byCode[u.productCode] = byCode[u.productCode] || []).push(u);
        res.json({ success: true, byCode, units: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================================
// GET /resolve?u=<id>  hoặc  ?code=<unit_code>
// → unit + product info + đơn ĐANG MỞ cần SP này (kệ STT để định tuyến)
// =====================================================================
router.get('/resolve', async (req, res) => {
    const pool = _getDb(req);
    try {
        await ensureTables(pool);
        const id = req.query.u || req.query.id;
        const code = req.query.code;
        let unitRow;
        if (id != null && /^\d+$/.test(String(id))) {
            unitRow = (
                await pool.query(`SELECT * FROM web2_product_units WHERE id = $1`, [Number(id)])
            ).rows[0];
        } else if (code) {
            unitRow = (
                await pool.query(`SELECT * FROM web2_product_units WHERE unit_code = $1`, [
                    String(code).trim(),
                ])
            ).rows[0];
        }
        if (!unitRow) return res.status(404).json({ error: 'Không tìm thấy đơn vị (unit)' });
        const unit = mapUnit(unitRow);

        // Thông tin SP (tên/giá/ảnh/tồn/NCC) — best-effort
        let product = null;
        let pendingQty = 0;
        let stock = 0;
        try {
            const p = (
                await pool.query(
                    `SELECT code, name, price, image_url, supplier, region, stock, pending_qty FROM web2_products WHERE code = $1`,
                    [unit.productCode]
                )
            ).rows[0];
            if (p) {
                pendingQty = Number(p.pending_qty) || 0;
                stock = Number(p.stock) || 0;
                product = {
                    code: p.code,
                    name: p.name,
                    price: Number(p.price) || 0,
                    imageUrl: p.image_url || null,
                    supplier: p.supplier || null,
                    region: p.region || null,
                    stock,
                };
            }
        } catch (_) {}

        // Đơn ĐANG MỞ chứa product_code này (kệ STT để bỏ vào) — gợi ý FIFO
        const orders = await _openOrdersForProduct(pool, unit.productCode);
        // Cờ rớt xả (badge): ép CLEARANCE, hoặc IN_STOCK + không đơn nào còn thiếu
        // (ứng viên xả; ân hạn/tier chính xác tính ở trang /clearance).
        const noOpenDemand = orders.length > 0 && !orders.some((o) => o.remaining > 0);
        const clearance = {
            state: unit.clearanceState || null,
            isClearance:
                unit.clearanceState === 'CLEARANCE' ||
                (unit.status === 'IN_STOCK' && unit.clearanceState !== 'KEEP' && noOpenDemand),
            manual: unit.clearanceState === 'CLEARANCE',
        };
        // Số liệu LIVE của SP (giống live-control): bán (GIỎ = Σ SL món trong giỏ KH
        // draft) + mới (KH chưa SĐT & địa chỉ) + NCC (web2_products.pending_qty) + còn
        // = max(0, NCC − bán). Quét tem thấy ngay SP đang bán thế nào. (Cùng query
        // web2-campaign-products dùng cho board live-control.)
        let metrics = { ncc: pendingQty, sold: 0, newCust: 0, con: pendingQty, stock };
        try {
            const hr = await pool.query(
                `SELECT SUM(COALESCE((prod->>'quantity')::numeric,(prod->>'qty')::numeric,0)) AS sold,
                        SUM(COALESCE((prod->>'quantity')::numeric,(prod->>'qty')::numeric,0))
                          FILTER (WHERE COALESCE(n.phone,'')='' AND COALESCE(n.address,'')='') AS new_cust
                 FROM native_orders n, jsonb_array_elements(
                        CASE WHEN jsonb_typeof(n.products)='array' THEN n.products ELSE '[]'::jsonb END
                      ) prod
                 WHERE COALESCE(prod->>'productCode', prod->>'code') = $1 AND n.status = 'draft'`,
                [unit.productCode]
            );
            const sold = Number(hr.rows[0] && hr.rows[0].sold) || 0;
            metrics = {
                ncc: pendingQty,
                sold,
                newCust: Number(hr.rows[0] && hr.rows[0].new_cust) || 0,
                con: Math.max(0, pendingQty - sold),
                stock,
            };
        } catch (_) {}
        res.json({ success: true, unit, product, orders, clearance, metrics });
    } catch (e) {
        console.error('[WEB2-PRODUCT-UNITS] /resolve error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Đơn native_orders đang mở (≠ cancelled) chứa product_code + số đã gán/đặt.
async function _openOrdersForProduct(pool, productCode) {
    const rows = (
        await pool.query(
            `SELECT id, code AS order_code, customer_name, phone, campaign_stt, display_stt,
                    live_campaign_id, live_campaign_name, status, products
             FROM native_orders
             WHERE status NOT IN ('cancelled')
               AND EXISTS (
                 SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(products)='array' THEN products ELSE '[]'::jsonb END) e
                 WHERE COALESCE(e->>'productCode', e->>'code') = $1
               )
             ORDER BY campaign_stt ASC NULLS LAST, created_at ASC
             LIMIT 50`,
            [productCode]
        )
    ).rows;
    if (!rows.length) return [];
    // Đếm unit ĐÃ GÁN cho từng đơn (cùng product_code) → tính "còn thiếu"
    const ids = rows.map((r) => r.id);
    const assignedMap = {};
    try {
        const a = (
            await pool.query(
                `SELECT order_id, COUNT(*) AS c FROM web2_product_units
                 WHERE product_code = $1 AND order_id = ANY($2::int[])
                   AND status IN ('ASSIGNED','PACKED','SHIPPED')
                 GROUP BY order_id`,
                [productCode, ids]
            )
        ).rows;
        for (const r of a) assignedMap[r.order_id] = Number(r.c) || 0;
    } catch (_) {}
    return rows.map((r) => {
        const products = Array.isArray(r.products) ? r.products : [];
        const line = products.find((p) => (p.productCode || p.code) === productCode);
        const orderedQty = line ? Number(line.quantity || line.qty) || 0 : 0;
        const assignedQty = assignedMap[r.id] || 0;
        return {
            orderId: r.id,
            orderCode: r.order_code,
            stt: shelfStt(r),
            campaignSttRaw: r.campaign_stt,
            displayStt: r.display_stt,
            customerName: r.customer_name || null,
            customerPhone: r.phone || null,
            campaignName: r.live_campaign_name || null,
            status: r.status,
            orderedQty,
            assignedQty,
            remaining: Math.max(0, orderedQty - assignedQty),
        };
    });
}

// =====================================================================
// GET /by-product/:code — list qr1..qrN của 1 SP (kèm trạng thái/đơn)
// =====================================================================
router.get('/by-product/:code', async (req, res) => {
    const pool = _getDb(req);
    try {
        await ensureTables(pool);
        const code = String(req.params.code || '').trim();
        if (!code) return res.status(400).json({ error: 'Thiếu code' });
        const rows = (
            await pool.query(
                `SELECT * FROM web2_product_units WHERE product_code = $1 ORDER BY seq ASC`,
                [code]
            )
        ).rows;
        res.json({ success: true, units: rows.map(mapUnit) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================================
// POST /by-orders { orderIds:[...] } — serials đơn vị ĐÃ GÁN theo (đơn, SP).
// → { success, byOrder: { [orderId]: { [productCode]: ['001','002'] } } }
// Cho native-orders hiển thị "-xxx" sau mã SP (khớp STT khi quét tem).
// =====================================================================
router.post('/by-orders', requireWeb2AuthSoft, async (req, res) => {
    const pool = _getDb(req);
    const ids = Array.isArray(req.body?.orderIds)
        ? req.body.orderIds.map(Number).filter(Number.isInteger).slice(0, 500)
        : [];
    if (!ids.length) return res.json({ success: true, byOrder: {} });
    try {
        await ensureTables(pool);
        const rows = (
            await pool.query(
                `SELECT order_id, product_code, seq FROM web2_product_units
                 WHERE order_id = ANY($1::int[]) AND status IN ('ASSIGNED','PACKED','SHIPPED')
                 ORDER BY product_code, seq`,
                [ids]
            )
        ).rows;
        const byOrder = {};
        for (const r of rows) {
            byOrder[r.order_id] = byOrder[r.order_id] || {};
            (byOrder[r.order_id][r.product_code] = byOrder[r.order_id][r.product_code] || []).push(
                _pad(r.seq)
            );
        }
        res.json({ success: true, byOrder });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================================
// GET /sort-manifest — đơn ĐANG CHỜ XẾP KỆ (units status ASSIGNED) gom theo STT.
// Cho "Bàn chia hàng" (web2/sort-station): quét món → biết STT + theo dõi đủ/thiếu
// từng kệ → manifest mang ra 1 lượt. → { success, orders:[{orderId, orderCode, stt,
// customerName, customerPhone, needed, products:[{code,name,qty,codes:[unitCode...]}], unitIds:[...] }],
// totalUnits, totalOrders }. PII (tên/SĐT) → requireWeb2AuthSoft.
// =====================================================================
router.get('/sort-manifest', requireWeb2AuthSoft, async (req, res) => {
    const pool = _getDb(req);
    try {
        await ensureTables(pool);
        const rows = (
            await pool.query(
                `SELECT u.order_id, u.order_code, u.order_stt, u.customer_name, u.customer_phone,
                        u.product_code, COALESCE(p.name, u.product_code) AS product_name,
                        COUNT(*)::int AS cnt, array_agg(u.id ORDER BY u.seq) AS unit_ids,
                        array_agg(u.unit_code ORDER BY u.seq) AS unit_codes
                   FROM web2_product_units u
                   LEFT JOIN web2_products p ON p.code = u.product_code
                  WHERE u.status = 'ASSIGNED' AND u.order_id IS NOT NULL
                  GROUP BY u.order_id, u.order_code, u.order_stt, u.customer_name,
                           u.customer_phone, u.product_code, p.name
                  ORDER BY u.order_stt ASC NULLS LAST, u.product_code`
            )
        ).rows;
        const byOrder = new Map();
        for (const r of rows) {
            let o = byOrder.get(r.order_id);
            if (!o) {
                o = {
                    orderId: r.order_id,
                    orderCode: r.order_code,
                    stt: r.order_stt != null ? Number(r.order_stt) : null,
                    customerName: r.customer_name || null,
                    customerPhone: r.customer_phone || null,
                    needed: 0,
                    products: [],
                    unitIds: [],
                };
                byOrder.set(r.order_id, o);
            }
            o.needed += r.cnt;
            o.products.push({
                code: r.product_code,
                name: r.product_name,
                qty: r.cnt,
                codes: r.unit_codes || [], // mã tem CỤ THỂ của (đơn, SP) — biết tem nào vào STT này
            });
            o.unitIds.push(...(r.unit_ids || []).map(Number));
        }
        const orders = [...byOrder.values()]
            .sort((a, b) => (a.stt == null ? 1e9 : a.stt) - (b.stt == null ? 1e9 : b.stt))
            .slice(0, 1000);
        // TAG đơn cho từng STT (CHỜ HÀNG / PHIẾU BÁN HÀNG…). Tái dùng engine native-orders
        // (enrichOrdersTags) → tag kệ KHỚP tag "Đơn Web", KHÔNG drift. Lọc kpi_user (KPI
        // attribution — không hợp màn xếp kệ + tránh lộ NV). Defensive: lỗi → autoTags=[].
        try {
            const ids = orders.map((o) => o.orderId).filter(Boolean);
            if (ids.length) {
                const no = require('./native-orders');
                const noRows = (
                    await pool.query(`SELECT * FROM native_orders WHERE id = ANY($1)`, [ids])
                ).rows.map(no.mapRowToOrder);
                await no.enrichOrdersTags(pool, noRows);
                const tagsById = new Map(
                    noRows.map((o) => [
                        o.id,
                        (o.autoTags || []).filter((t) => t.trigger !== 'kpi_user'),
                    ])
                );
                for (const o of orders) o.autoTags = tagsById.get(o.orderId) || [];
            }
        } catch (e) {
            console.warn('[WEB2-PRODUCT-UNITS] sort-manifest tag enrich failed:', e.message);
            for (const o of orders) if (!o.autoTags) o.autoTags = [];
        }
        const totalUnits = orders.reduce((s, o) => s + o.needed, 0);
        res.json({ success: true, orders, totalUnits, totalOrders: orders.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================================
// GET /:id/events — lịch sử 1 unit (MINT/PRINT/ASSIGN/...) — "tất cả đơn của qrN"
// =====================================================================
router.get('/:id/events', async (req, res) => {
    const pool = _getDb(req);
    try {
        await ensureTables(pool);
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'id không hợp lệ' });
        const rows = (
            await pool.query(
                `SELECT * FROM web2_product_unit_events WHERE unit_id = $1 ORDER BY created_at DESC, id DESC`,
                [id]
            )
        ).rows;
        res.json({
            success: true,
            events: rows.map((r) => ({
                id: r.id,
                event: r.event,
                orderCode: r.order_code,
                orderStt: r.order_stt,
                customerName: r.customer_name,
                customerPhone: r.customer_phone,
                note: r.note,
                userName: r.user_name,
                createdAt: Number(r.created_at),
            })),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================================
// POST /reprint — đánh dấu đã in (print_count++ + event PRINT)
// body: { unitIds:[...] }  hoặc { unitCodes:[...] }
// =====================================================================
router.post('/reprint', requireWeb2AuthSoft, async (req, res) => {
    const pool = _getDb(req);
    const b = req.body || {};
    const ids = Array.isArray(b.unitIds) ? b.unitIds.filter((x) => Number.isInteger(x)) : [];
    const codes = Array.isArray(b.unitCodes) ? b.unitCodes.map((x) => String(x).trim()) : [];
    if (!ids.length && !codes.length)
        return res.status(400).json({ error: 'Thiếu unitIds/unitCodes' });
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const rows = (
            await client.query(
                `UPDATE web2_product_units
                    SET print_count = print_count + 1, updated_at = $3
                  WHERE id = ANY($1::int[]) OR unit_code = ANY($2::text[])
                  RETURNING *`,
                [ids.length ? ids : [0], codes.length ? codes : [''], Date.now()]
            )
        ).rows;
        for (const r of rows)
            await _logEvent(client, r, 'PRINT', {
                note: 'in lần ' + r.print_count,
                user_name: _userName(req),
            });
        await client.query('COMMIT');
        if (rows.length) _notify('reprint', { count: rows.length });
        res.json({ success: true, updated: rows.map(mapUnit) });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// =====================================================================
// POST /assign — gán unit → đơn (kệ STT). body: { unitId|unitCode, orderId }
// → set order_*/customer_*/status=ASSIGNED + event ASSIGN; trả unit + "đủ hàng?"
// =====================================================================
router.post('/assign', requireWeb2AuthSoft, async (req, res) => {
    const pool = _getDb(req);
    const b = req.body || {};
    const unitId = Number.isInteger(b.unitId) ? b.unitId : null;
    const unitCode = (b.unitCode || '').trim() || null;
    const orderId = Number.isInteger(b.orderId) ? b.orderId : Number(b.orderId);
    if (!unitId && !unitCode) return res.status(400).json({ error: 'Thiếu unitId/unitCode' });
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'Thiếu orderId' });
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const unit = (
            await client.query(
                `SELECT * FROM web2_product_units WHERE ${unitId ? 'id = $1' : 'unit_code = $1'} FOR UPDATE`,
                [unitId || unitCode]
            )
        ).rows[0];
        if (!unit) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Không tìm thấy unit' });
        }
        const order = (
            await client.query(
                `SELECT id, code AS order_code, customer_name, phone, campaign_stt, display_stt, products
                 FROM native_orders WHERE id = $1`,
                [orderId]
            )
        ).rows[0];
        if (!order) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Không tìm thấy đơn' });
        }
        const stt = order.campaign_stt != null ? order.campaign_stt : order.display_stt;
        const updated = (
            await client.query(
                `UPDATE web2_product_units
                    SET status='ASSIGNED', order_id=$2, order_code=$3, order_stt=$4,
                        customer_name=$5, customer_phone=$6, updated_at=$7
                  WHERE id=$1 RETURNING *`,
                [
                    unit.id,
                    order.id,
                    order.order_code,
                    stt,
                    order.customer_name || null,
                    order.phone || null,
                    Date.now(),
                ]
            )
        ).rows[0];
        await _logEvent(client, updated, 'ASSIGN', {
            order_id: order.id,
            order_code: order.order_code,
            order_stt: stt,
            customer_name: order.customer_name,
            customer_phone: order.phone,
            user_name: _userName(req),
        });
        await client.query('COMMIT');

        // "Đơn đủ hàng?" — so unit đã gán vs tổng qty đặt của đơn
        const full = await _orderFulfillment(pool, order);
        _notify('assign', { unitId: unit.id, orderId: order.id, stt });
        res.json({
            success: true,
            unit: mapUnit(updated),
            stt,
            order: { id: order.id, code: order.order_code, stt },
            fulfillment: full,
        });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-PRODUCT-UNITS] /assign error:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// Tính độ đủ hàng của 1 đơn: Σ qty đặt vs Σ unit đã gán (theo product_code).
async function _orderFulfillment(pool, order) {
    const products = Array.isArray(order.products) ? order.products : [];
    const totalOrdered = products.reduce((s, p) => s + (Number(p.quantity || p.qty) || 0), 0);
    const assigned =
        Number(
            (
                await pool.query(
                    `SELECT COUNT(*) AS c FROM web2_product_units
                     WHERE order_id = $1 AND status IN ('ASSIGNED','PACKED','SHIPPED')`,
                    [order.id]
                )
            ).rows[0].c
        ) || 0;
    return { totalOrdered, assigned, complete: totalOrdered > 0 && assigned >= totalOrdered };
}

// =====================================================================
// POST /:id/status — chuyển trạng thái (PACKED/SHIPPED/RETURNED/IN_STOCK...)
// body: { status, unassign? }
// =====================================================================
router.post('/:id/status', requireWeb2AuthSoft, async (req, res) => {
    const pool = _getDb(req);
    const id = Number(req.params.id);
    const status = String(req.body?.status || '')
        .trim()
        .toUpperCase();
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id không hợp lệ' });
    if (!VALID_STATUS.has(status)) return res.status(400).json({ error: 'status không hợp lệ' });
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const clearOrder =
            req.body?.unassign === true || status === 'RETURNED' || status === 'IN_STOCK';
        const updated = (
            await client.query(
                `UPDATE web2_product_units
                    SET status=$2, updated_at=$3
                        ${clearOrder ? ', order_id=NULL, order_code=NULL, order_stt=NULL, customer_name=NULL, customer_phone=NULL' : ''}
                  WHERE id=$1 RETURNING *`,
                [id, status, Date.now()]
            )
        ).rows[0];
        if (!updated) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Không tìm thấy unit' });
        }
        await _logEvent(
            client,
            updated,
            clearOrder && status !== 'RETURNED' ? 'UNASSIGN' : status,
            {
                user_name: _userName(req),
            }
        );
        await client.query('COMMIT');
        _notify('status', { unitId: id, status });
        res.json({ success: true, unit: mapUnit(updated) });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// =====================================================================
// GET /clearance — KHO HÀNG RỚT XẢ (derived/lazy, KHÔNG cron).
// THEO CHIẾN DỊCH (user spec 2026-06-29): unit IN_STOCK của SP mà chiến dịch GẦN
// NHẤT chứa SP đó đã "xong" (da_doi_soat > 70% tổng đơn) + đã qua 1 ngày → ứng viên
// xả. Còn live mới đang bán SP → chiến dịch gần nhất chưa xong → giữ kho chính.
// Cờ clearance_state ép KEEP/CLEARANCE (thủ công). Chi tiết logic: xem CLEARANCE_CTE.
// Tier theo ngày-từ-chiến-dịch-xong: <30 RỚT XẢ · 30-90 XẢ MẠNH · >90 THANH LÝ.
// → group theo SP + summary giá-trị-kẹt mỗi tier (value-trapped).
// =====================================================================
router.get('/clearance', async (req, res) => {
    const pool = _getDb(req);
    try {
        await ensureTables(pool);
        const now = Date.now();
        const graceBefore = now - CLEARANCE_GRACE_MS; // anchor < graceBefore ⟺ chiến dịch xong + qua 1 ngày
        const rows = (
            await pool.query(
                `
            WITH ${CLEARANCE_CTE}
            SELECT u.*, COALESCE(pr.price,0) AS price, pr.name AS pname, pr.image_url AS pimg,
                   prod.anchor_at AS last_order_at
            FROM web2_product_units u
            LEFT JOIN prod ON prod.pcode = u.product_code
            LEFT JOIN web2_products pr ON pr.code = u.product_code
            WHERE u.status='IN_STOCK'
              AND COALESCE(u.clearance_state,'') <> 'KEEP'
              AND (
                  u.clearance_state='CLEARANCE'
                  OR (prod.pcode IS NOT NULL AND prod.done = true AND prod.anchor_at < $1)
              )
            ORDER BY u.product_code, u.seq`,
                [graceBefore]
            )
        ).rows;

        const groups = {};
        const tiers = {
            RUOT_XA: { count: 0, value: 0 },
            XA_MANH: { count: 0, value: 0 },
            THANH_LY: { count: 0, value: 0 },
        };
        let totalValue = 0;
        for (const r of rows) {
            const price = Number(r.price) || 0;
            const lastAt = Number(r.last_order_at) || Number(r.created_at) || now;
            const days = Math.max(0, Math.floor((now - lastAt) / DAY_MS));
            const tier = _clearanceTier(days);
            const g =
                groups[r.product_code] ||
                (groups[r.product_code] = {
                    productCode: r.product_code,
                    name: r.pname || r.product_code,
                    price,
                    imageUrl: r.pimg || null,
                    units: [],
                });
            g.units.push({
                id: r.id,
                unitCode: r.unit_code,
                supplier: r.supplier || null,
                shipmentId: r.shipment_id || null,
                days,
                tier,
                manual: r.clearance_state === 'CLEARANCE',
            });
            tiers[tier].count++;
            tiers[tier].value += price;
            totalValue += price;
        }
        res.json({
            success: true,
            now,
            graceMs: CLEARANCE_GRACE_MS,
            totalCount: rows.length,
            totalValue,
            tiers,
            groups: Object.values(groups),
        });
    } catch (e) {
        console.error('[WEB2-PRODUCT-UNITS] /clearance error:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /:id/clearance — ép cờ: { state: 'KEEP' | 'CLEARANCE' | 'AUTO' }
//   KEEP = giữ kho chính (đưa ngược về); CLEARANCE = ép xả; AUTO/null = tính tự động.
// ADMIN-ONLY (2026-06-29): công cụ sửa nhầm — chỉ admin chuyển SP rớt xả ↔ bình thường.
router.post('/:id/clearance', requireWeb2Admin, async (req, res) => {
    const pool = _getDb(req);
    const id = Number(req.params.id);
    let state = req.body?.state;
    if (state === 'AUTO' || state === '' || state === undefined) state = null;
    if (state != null && !['KEEP', 'CLEARANCE'].includes(state))
        return res.status(400).json({ error: 'state phải KEEP | CLEARANCE | AUTO' });
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id không hợp lệ' });
    try {
        await ensureTables(pool);
        const r = (
            await pool.query(
                `UPDATE web2_product_units SET clearance_state=$2, updated_at=$3 WHERE id=$1 RETURNING *`,
                [id, state, Date.now()]
            )
        ).rows[0];
        if (!r) return res.status(404).json({ error: 'Không tìm thấy unit' });
        _notify('clearance', { unitId: id, state });
        res.json({ success: true, unit: mapUnit(r) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================================
// AUTO-ASSIGN theo GIỎ (KHÔNG cần nút Gán). Khi SP vào giỏ (native_orders.products)
// → mỗi món gán 1 đơn vị. Chọn unit ƯU TIÊN: ÍT lịch sử bỏ-giỏ (đếm event ASSIGN)
// nhất → rồi seq (00x) NHỎ nhất. Idempotent + reconcile: thiếu → gán thêm; dư / rời
// giỏ / đơn huỷ → NHẢ (UNASSIGN, seq cao nhả trước → giữ 001 ổn định). Quét unit ra
// STT giỏ hiện tại + đầy đủ lịch sử (events). Best-effort — caller bọc try.
// =====================================================================
async function reconcileOrderUnits(pool, orderId) {
    orderId = Number(orderId);
    if (!pool || !Number.isInteger(orderId)) return { assigned: 0, unassigned: 0 };
    await ensureTables(pool);
    const client = await pool.connect();
    let assigned = 0;
    let unassigned = 0;
    try {
        await client.query('BEGIN');
        const order = (
            await client.query(
                `SELECT id, code AS order_code, customer_name, phone, campaign_stt, display_stt,
                        status, products
                 FROM native_orders WHERE id=$1 FOR UPDATE`,
                [orderId]
            )
        ).rows[0];
        if (!order) {
            await client.query('ROLLBACK');
            return { assigned, unassigned };
        }
        const stt = shelfStt(order); // STT kệ đóng dấu lên unit (campaign_stt ?? display_stt)
        const cancelled = order.status === 'cancelled';
        // cartMap: productCode -> qty (đơn huỷ → giỏ rỗng → nhả hết unit của đơn).
        const cart = {};
        if (!cancelled) {
            for (const p of Array.isArray(order.products) ? order.products : []) {
                const code = String(p.productCode || p.code || '').trim();
                if (!code) continue;
                cart[code] = (cart[code] || 0) + (Number(p.quantity || p.qty) || 0);
            }
        }
        // Unit đang gán cho đơn này (group theo product_code).
        const curByCode = {};
        for (const u of (
            await client.query(
                `SELECT * FROM web2_product_units WHERE order_id=$1 AND status='ASSIGNED'
                 ORDER BY product_code, seq`,
                [orderId]
            )
        ).rows) {
            (curByCode[u.product_code] = curByCode[u.product_code] || []).push(u);
        }

        for (const code of new Set([...Object.keys(cart), ...Object.keys(curByCode)])) {
            const want = cart[code] || 0;
            const have = (curByCode[code] || []).length;
            if (have < want) {
                // GÁN THÊM: chọn unit available SEQ NHỎ NHẤT trước (user 2026-06-29:
                // lấy AO-001..AO-max theo thứ tự; unit bị bỏ khỏi giỏ → quay lại pool →
                // lần gán sau TÁI DÙNG seq nhỏ đó TRƯỚC số chưa dùng cao hơn — vd 002
                // freed thì add tiếp lấy 002, không nhảy 007). Available = IN_STOCK hoặc
                // gán cho đơn đã huỷ. SKIP LOCKED → 2 giỏ thêm cùng SP song song không
                // giành trùng unit.
                const pick = (
                    await client.query(
                        `SELECT u.* FROM web2_product_units u
                         WHERE u.product_code=$1 AND u.status IN ('IN_STOCK','ASSIGNED')
                           AND u.order_id IS DISTINCT FROM $2
                           AND NOT EXISTS (
                             SELECT 1 FROM native_orders o
                              WHERE o.id=u.order_id AND o.status NOT IN ('cancelled'))
                         ORDER BY u.seq ASC
                         LIMIT $3 FOR UPDATE OF u SKIP LOCKED`,
                        [code, orderId, want - have]
                    )
                ).rows;
                for (const u of pick) {
                    const upd = (
                        await client.query(
                            `UPDATE web2_product_units SET status='ASSIGNED', order_id=$2,
                                order_code=$3, order_stt=$4, customer_name=$5, customer_phone=$6,
                                updated_at=$7 WHERE id=$1 RETURNING *`,
                            [
                                u.id,
                                orderId,
                                order.order_code,
                                stt,
                                order.customer_name || null,
                                order.phone || null,
                                Date.now(),
                            ]
                        )
                    ).rows[0];
                    await _logEvent(client, upd, 'ASSIGN', {
                        order_id: orderId,
                        order_code: order.order_code,
                        order_stt: stt,
                        customer_name: order.customer_name,
                        customer_phone: order.phone,
                        note: 'auto (giỏ)',
                    });
                    assigned++;
                }
            } else if (have > want) {
                // NHẢ BỚT (giảm SL / rời giỏ / huỷ): nhả unit seq CAO trước → giữ 001 ổn định.
                const extras = (curByCode[code] || [])
                    .slice()
                    .sort((a, b) => b.seq - a.seq)
                    .slice(0, have - want);
                for (const u of extras) {
                    const upd = (
                        await client.query(
                            `UPDATE web2_product_units SET status='IN_STOCK', order_id=NULL,
                                order_code=NULL, order_stt=NULL, customer_name=NULL,
                                customer_phone=NULL, updated_at=$2 WHERE id=$1 RETURNING *`,
                            [u.id, Date.now()]
                        )
                    ).rows[0];
                    await _logEvent(client, upd, 'UNASSIGN', { note: 'auto (rời giỏ)' });
                    unassigned++;
                }
            }
        }
        // Sync denorm (STT/code/customer) cho unit ĐÃ gán nếu đơn đổi SAU khi gán (sửa
        // SĐT/tên/STT) → quét luôn ra dữ liệu TƯƠI, không snapshot cũ. Chỉ update khi
        // khác (IS DISTINCT) → idempotent, không ghi thừa mỗi reconcile.
        if (!cancelled) {
            await client.query(
                `UPDATE web2_product_units
                    SET order_stt=$2, order_code=$3, customer_name=$4, customer_phone=$5,
                        updated_at=$6
                  WHERE order_id=$1 AND status='ASSIGNED'
                    AND (order_stt IS DISTINCT FROM $2 OR order_code IS DISTINCT FROM $3
                         OR customer_name IS DISTINCT FROM $4 OR customer_phone IS DISTINCT FROM $5)`,
                [
                    orderId,
                    stt,
                    order.order_code,
                    order.customer_name || null,
                    order.phone || null,
                    Date.now(),
                ]
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.warn('[WEB2-PRODUCT-UNITS] reconcileOrderUnits failed:', e.message);
    } finally {
        client.release();
    }
    if (assigned || unassigned) _notify('assign-auto', { orderId, assigned, unassigned });
    return { assigned, unassigned };
}

// NHẢ HẾT đơn vị của 1 đơn (dùng khi XOÁ đơn — cart clear / remove SP cuối → đơn bị
// DELETE, reconcile không thấy đơn để nhả). Set ASSIGNED → IN_STOCK + event UNASSIGN.
async function freeOrderUnits(pool, orderId) {
    orderId = Number(orderId);
    if (!pool || !Number.isInteger(orderId)) return 0;
    await ensureTables(pool);
    const client = await pool.connect();
    let n = 0;
    try {
        await client.query('BEGIN');
        const rows = (
            await client.query(
                `UPDATE web2_product_units SET status='IN_STOCK', order_id=NULL, order_code=NULL,
                    order_stt=NULL, customer_name=NULL, customer_phone=NULL, updated_at=$2
                  WHERE order_id=$1 AND status='ASSIGNED' RETURNING id, unit_code`,
                [orderId, Date.now()]
            )
        ).rows;
        for (const u of rows) {
            await _logEvent(client, { id: u.id, unit_code: u.unit_code }, 'UNASSIGN', {
                note: 'auto (xoá đơn)',
            });
            n++;
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.warn('[WEB2-PRODUCT-UNITS] freeOrderUnits failed:', e.message);
    } finally {
        client.release();
    }
    if (n) _notify('assign-auto', { orderId, unassigned: n });
    return n;
}

// POST /assign-auto { orderId } — reconcile đơn vị cho 1 đơn theo giỏ (manual/test;
// luồng chính gọi reconcileOrderUnits trực tiếp từ native-orders sau khi lưu đơn).
router.post('/assign-auto', requireWeb2AuthSoft, async (req, res) => {
    const pool = _getDb(req);
    const orderId = Number(req.body?.orderId);
    if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'Thiếu orderId' });
    try {
        const r = await reconcileOrderUnits(pool, orderId);
        res.json({ success: true, ...r });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
router.ensureTables = ensureTables;
router.reconcileOrderUnits = reconcileOrderUnits;
router.freeOrderUnits = freeOrderUnits;
router.ensureUnits = ensureUnits;
router.ensureUnitsForCodes = ensureUnitsForCodes;
module.exports = router;
