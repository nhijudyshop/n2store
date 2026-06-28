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
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
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
    `);
    _ensuredPools.add(pool);
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
        createdAt: Number(r.created_at) || null,
        updatedAt: Number(r.updated_at) || null,
    };
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

        // Thông tin SP (tên/giá/ảnh) — best-effort
        let product = null;
        try {
            const p = (
                await pool.query(
                    `SELECT code, name, price, image_url, supplier, region FROM web2_products WHERE code = $1`,
                    [unit.productCode]
                )
            ).rows[0];
            if (p)
                product = {
                    code: p.code,
                    name: p.name,
                    price: Number(p.price) || 0,
                    imageUrl: p.image_url || null,
                    supplier: p.supplier || null,
                    region: p.region || null,
                };
        } catch (_) {}

        // Đơn ĐANG MỞ chứa product_code này (kệ STT để bỏ vào) — gợi ý FIFO
        const orders = await _openOrdersForProduct(pool, unit.productCode);
        res.json({ success: true, unit, product, orders });
    } catch (e) {
        console.error('[WEB2-PRODUCT-UNITS] /resolve error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Đơn native_orders đang mở (≠ cancelled) chứa product_code + số đã gán/đặt.
async function _openOrdersForProduct(pool, productCode) {
    const rows = (
        await pool.query(
            `SELECT id, order_code, customer_name, phone, campaign_stt, display_stt,
                    live_campaign_id, live_campaign_name, status, products
             FROM native_orders
             WHERE status NOT IN ('cancelled')
               AND EXISTS (
                 SELECT 1 FROM jsonb_array_elements(COALESCE(products,'[]'::jsonb)) e
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
            stt: r.campaign_stt != null ? r.campaign_stt : r.display_stt,
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
                `SELECT id, order_code, customer_name, phone, campaign_stt, display_stt, products
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

router.initializeNotifiers = initializeNotifiers;
router.ensureTables = ensureTables;
module.exports = router;
