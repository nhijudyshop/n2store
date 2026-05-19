// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// FAST SALE ORDERS (PBH — Phiếu Bán Hàng) REST API
// Mirror TPOS FastSaleOrder cho Web 2.0 nội bộ.
// Source có thể là native_order (convert) hoặc manual create.
// =====================================================
//
// Endpoints:
//   GET    /api/fast-sale-orders/health
//   GET    /api/fast-sale-orders/load          — list with filter + paging
//   GET    /api/fast-sale-orders/:number       — get by Number (HD-...)
//   POST   /api/fast-sale-orders               — create (manual)
//   POST   /api/fast-sale-orders/from-native-order  — convert NativeOrder → PBH
//   PATCH  /api/fast-sale-orders/:number       — update mutable fields
//   POST   /api/fast-sale-orders/:number/cancel
//   POST   /api/fast-sale-orders/:number/confirm
//   POST   /api/fast-sale-orders/:number/print — increment print count
//   DELETE /api/fast-sale-orders/:number       — hard delete (draft only)
//   POST   /api/fast-sale-orders/reset-stt     — reset display STT counter

const express = require('express');
const router = express.Router();

// -----------------------------------------------------
// SSE notifier — broadcast topic 'web2:fast-sale-orders' sau mỗi DB mutation.
// Page web2/fastsaleorder-invoice/ subscribe để tự refresh khi PBH thay đổi.
// Xem docs/web2/SSE-REALTIME.md.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, number) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:fast-sale-orders',
            { action, number: number || null, ts: Date.now() },
            'update'
        );
        // PHASE B2: cross-broadcast cho customer-wallet (Ví KH). PBH create /
        // confirm / cancel / print ảnh hưởng tổng tiền + công nợ KH → page Ví KH
        // tự refresh thay vì chờ poll wallet:all.
        const walletAffectingActions = new Set([
            'create',
            'from-native-order',
            'confirm',
            'cancel',
            'delete',
            'update',
            'bulk-confirm',
            'bulk-cancel',
        ]);
        if (walletAffectingActions.has(action)) {
            _notifyClients(
                'web2:customer-wallet',
                { action, number: number || null, ts: Date.now(), from: 'web2:fast-sale-orders' },
                'update'
            );
        }
    } catch (e) {
        console.warn('[FAST-SALE-ORDERS] _notify failed:', e.message);
    }
}
const { lookupCustomerIdByPhone } = require('../utils/customer-helpers');

// -----------------------------------------------------
// Schema + auto-migrate
// -----------------------------------------------------
let _ready = false;
async function ensureTables(pool) {
    if (_ready) return;
    try {
        await pool.query(`
            -- Migration 070: FastSaleOrder (PBH) schema
            CREATE TABLE IF NOT EXISTS fast_sale_orders (
                id              BIGSERIAL PRIMARY KEY,
                number          VARCHAR(50)  UNIQUE NOT NULL,    -- HD-YYYYMMDD-XXXX
                display_stt     INTEGER,
                source          VARCHAR(30)  NOT NULL DEFAULT 'NATIVE_WEB',

                -- Dates
                date_invoice    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                date_created    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                date_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                -- Partner snapshot
                partner_id        INTEGER,
                partner_code      VARCHAR(60),
                partner_name      VARCHAR(255),
                partner_phone     VARCHAR(40),
                partner_address   TEXT,
                partner_email     VARCHAR(255),

                -- Address breakdown
                city_code      VARCHAR(20),
                city_name      VARCHAR(120),
                district_code  VARCHAR(20),
                district_name  VARCHAR(120),
                ward_code      VARCHAR(20),
                ward_name      VARCHAR(120),

                -- Order lines + totals
                order_lines     JSONB    DEFAULT '[]'::jsonb,
                total_quantity  INTEGER  DEFAULT 0,
                amount_untaxed  NUMERIC(15,2) DEFAULT 0,
                amount_tax      NUMERIC(15,2) DEFAULT 0,
                amount_discount NUMERIC(15,2) DEFAULT 0,
                amount_total    NUMERIC(15,2) DEFAULT 0,

                -- Payment
                payment_amount  NUMERIC(15,2) DEFAULT 0,
                deposit         NUMERIC(15,2) DEFAULT 0,
                residual        NUMERIC(15,2) DEFAULT 0,

                -- Delivery
                delivery_price     NUMERIC(15,2) DEFAULT 0,
                cash_on_delivery   NUMERIC(15,2) DEFAULT 0,
                carrier_id         INTEGER,
                carrier_name       VARCHAR(150),
                tracking_ref       VARCHAR(255),
                delivery_note      TEXT,

                -- State machine
                state          VARCHAR(30)  NOT NULL DEFAULT 'draft',  -- draft|confirmed|done|cancel
                show_state     VARCHAR(60),

                -- Source link
                source_type    VARCHAR(20),     -- 'native_order' | 'manual'
                source_id      BIGINT,
                source_code    VARCHAR(40),

                -- Live campaign + warehouse + company
                live_campaign_id    VARCHAR(100),
                live_campaign_name  VARCHAR(255),
                warehouse_id        INTEGER,
                warehouse_name      VARCHAR(150),
                company_id          INTEGER,
                company_name        VARCHAR(150),

                -- CRM + assignment
                crm_team_id          INTEGER,
                crm_team_name        VARCHAR(150),
                assigned_user_id     VARCHAR(100),
                assigned_user_name   VARCHAR(255),

                -- Misc
                comment        TEXT,
                tags           JSONB    DEFAULT '[]'::jsonb,
                print_count    INTEGER  NOT NULL DEFAULT 0,
                created_by     VARCHAR(100),
                created_by_name VARCHAR(255)
            );

            -- Migration 074: Customer 360 cross-system FK (Phase 12)
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS customer_id INTEGER;

            CREATE INDEX IF NOT EXISTS idx_fso_date_invoice ON fast_sale_orders(date_invoice DESC);
            CREATE INDEX IF NOT EXISTS idx_fso_partner_phone ON fast_sale_orders(partner_phone);
            CREATE INDEX IF NOT EXISTS idx_fso_state ON fast_sale_orders(state);
            CREATE INDEX IF NOT EXISTS idx_fso_source ON fast_sale_orders(source_type, source_id);
            CREATE INDEX IF NOT EXISTS idx_fso_source_code ON fast_sale_orders(source_code);
            CREATE INDEX IF NOT EXISTS idx_fso_partner_id ON fast_sale_orders(partner_id);
            CREATE INDEX IF NOT EXISTS idx_fso_display_stt ON fast_sale_orders(display_stt DESC);
            CREATE INDEX IF NOT EXISTS idx_fso_live_campaign ON fast_sale_orders(live_campaign_id);
            CREATE INDEX IF NOT EXISTS idx_fso_customer_id ON fast_sale_orders(customer_id);

            -- STT sequence
            CREATE SEQUENCE IF NOT EXISTS fast_sale_orders_display_stt_seq START 1;
        `);
        _ready = true;
        console.log('[FAST-SALE-ORDERS] Tables created/verified (migration 070)');
    } catch (e) {
        console.error('[FAST-SALE-ORDERS] migration error:', e.message);
    }
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
function pad(n, w) {
    const s = String(n);
    return s.length >= w ? s : '0'.repeat(w - s.length) + s;
}

function mapRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        number: row.number,
        displayStt: row.display_stt,
        source: row.source,
        dateInvoice: row.date_invoice,
        dateCreated: row.date_created,
        dateUpdated: row.date_updated,
        partner: {
            id: row.partner_id,
            code: row.partner_code,
            name: row.partner_name,
            phone: row.partner_phone,
            address: row.partner_address,
            email: row.partner_email,
        },
        addressDetail: {
            cityCode: row.city_code,
            cityName: row.city_name,
            districtCode: row.district_code,
            districtName: row.district_name,
            wardCode: row.ward_code,
            wardName: row.ward_name,
        },
        orderLines: row.order_lines || [],
        totals: {
            quantity: row.total_quantity,
            untaxed: Number(row.amount_untaxed || 0),
            tax: Number(row.amount_tax || 0),
            discount: Number(row.amount_discount || 0),
            total: Number(row.amount_total || 0),
        },
        payment: {
            amount: Number(row.payment_amount || 0),
            deposit: Number(row.deposit || 0),
            residual: Number(row.residual || 0),
        },
        delivery: {
            price: Number(row.delivery_price || 0),
            cashOnDelivery: Number(row.cash_on_delivery || 0),
            carrierId: row.carrier_id,
            carrierName: row.carrier_name,
            trackingRef: row.tracking_ref,
            note: row.delivery_note,
        },
        state: row.state,
        showState: row.show_state,
        source: row.source,
        sourceLink: {
            type: row.source_type,
            id: row.source_id,
            code: row.source_code,
        },
        liveCampaign: { id: row.live_campaign_id, name: row.live_campaign_name },
        warehouse: { id: row.warehouse_id, name: row.warehouse_name },
        company: { id: row.company_id, name: row.company_name },
        crmTeam: { id: row.crm_team_id, name: row.crm_team_name },
        assignedUser: { id: row.assigned_user_id, name: row.assigned_user_name },
        comment: row.comment,
        tags: row.tags || [],
        printCount: row.print_count,
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        // Migration 074 — Customer 360 link (Phase 12)
        customerId: row.customer_id != null ? Number(row.customer_id) : null,
    };
}

async function nextNumber(pool) {
    // HD-YYYYMMDD-XXXX (VN timezone)
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 3600 * 1000);
    const datePart = `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1, 2)}${pad(vn.getUTCDate(), 2)}`;
    const prefix = `HD-${datePart}-`;
    const r = await pool.query(
        `SELECT number FROM fast_sale_orders WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`,
        [prefix + '%']
    );
    let seq = 1;
    if (r.rows.length > 0) {
        const m = r.rows[0].number.match(/-(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
    }
    return prefix + pad(seq, 4);
}

function computeTotals(lines, deposit, deliveryPrice) {
    const arr = Array.isArray(lines) ? lines : [];
    let qty = 0,
        untaxed = 0,
        discount = 0,
        tax = 0;
    for (const l of arr) {
        const q = Number(l.quantity) || 0;
        const p = Number(l.priceUnit ?? l.price ?? 0);
        const d = Number(l.discountAmount ?? l.discount ?? 0);
        const lineTotal = q * p - d;
        qty += q;
        untaxed += q * p;
        discount += d;
        tax += Number(l.tax ?? 0);
    }
    const total = untaxed - discount + tax + (Number(deliveryPrice) || 0);
    const residual = Math.max(0, total - (Number(deposit) || 0));
    return { qty, untaxed, discount, tax, total, residual };
}

// -----------------------------------------------------
// POST /backfill-customer-links — Phase 12 admin one-shot
// Link existing fast_sale_orders → customers by partner_phone match.
// Idempotent: only updates where customer_id IS NULL.
// -----------------------------------------------------
router.post('/backfill-customer-links', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`
            UPDATE fast_sale_orders AS o
            SET customer_id = c.id
            FROM customers AS c
            WHERE o.customer_id IS NULL
              AND o.partner_phone IS NOT NULL
              AND o.partner_phone <> ''
              AND c.phone = o.partner_phone
            RETURNING o.number
        `);
        res.json({
            success: true,
            linked: r.rows.length,
            numbers: r.rows.slice(0, 50).map((x) => x.number),
        });
    } catch (e) {
        console.error('[FAST-SALE-ORDERS] backfill-customer-links error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /health
// -----------------------------------------------------
router.get('/health', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM fast_sale_orders');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// -----------------------------------------------------
// GET /export — CSV download (Excel-compatible, UTF-8 BOM)
// -----------------------------------------------------
router.get('/export', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).send('DB unavailable');
    try {
        await ensureTables(pool);
        const { state, search, customerId } = req.query;
        const conds = [];
        const params = [];
        if (state) {
            params.push(state);
            conds.push(`state = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(
                `(partner_name ILIKE $${i} OR partner_phone ILIKE $${i} OR number ILIKE $${i} OR source_code ILIKE $${i})`
            );
        }
        if (customerId) {
            const cid = parseInt(customerId, 10);
            if (Number.isFinite(cid)) {
                params.push(cid);
                conds.push(`customer_id = $${params.length}`);
            }
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const r = await pool.query(
            `SELECT * FROM fast_sale_orders ${where} ORDER BY date_invoice DESC LIMIT 10000`,
            params
        );

        // CSV header
        const STATE_LABEL = {
            draft: 'Nháp',
            confirmed: 'Đã xác nhận',
            done: 'Hoàn thành',
            cancel: 'Đã hủy',
        };
        const headers = [
            'STT',
            'Số HĐ',
            'Ngày HĐ',
            'Khách hàng',
            'SĐT',
            'Địa chỉ',
            'Tỉnh/TP',
            'Quận/Huyện',
            'Phường/Xã',
            'Tổng SL',
            'Tổng tiền',
            'Đã thanh toán',
            'Đặt cọc',
            'Còn nợ',
            'Phí giao',
            'COD',
            'Hãng VC',
            'Tracking',
            'Trạng thái',
            'Số lần in',
            'Đơn nguồn',
            'Chiến dịch',
            'Kho',
            'NV bán',
        ];

        function esc(v) {
            if (v == null) return '';
            const s = String(v);
            // CSV escape: wrap in quotes if contains comma/newline/quote
            if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
            return s;
        }
        function fmtDate(d) {
            if (!d) return '';
            const dt = new Date(d);
            return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
        }

        const rows = r.rows.map((row) =>
            [
                row.display_stt || '',
                row.number,
                fmtDate(row.date_invoice),
                row.partner_name || '',
                row.partner_phone || '',
                row.partner_address || '',
                row.city_name || '',
                row.district_name || '',
                row.ward_name || '',
                row.total_quantity || 0,
                Number(row.amount_total || 0),
                Number(row.payment_amount || 0),
                Number(row.deposit || 0),
                Number(row.residual || 0),
                Number(row.delivery_price || 0),
                Number(row.cash_on_delivery || 0),
                row.carrier_name || '',
                row.tracking_ref || '',
                STATE_LABEL[row.state] || row.state,
                row.print_count || 0,
                row.source_code || '',
                row.live_campaign_name || '',
                row.warehouse_name || '',
                row.assigned_user_name || row.created_by_name || '',
            ]
                .map(esc)
                .join(',')
        );

        // UTF-8 BOM (﻿) cho Excel hiển thị đúng tiếng Việt
        const csv = '﻿' + headers.join(',') + '\n' + rows.join('\n');
        const filename = `pbh-export-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (e) {
        console.error('[FAST-SALE-ORDERS] export error:', e.message);
        res.status(500).send('Export failed: ' + e.message);
    }
});

// -----------------------------------------------------
// POST /bulk-confirm + /bulk-cancel — batch state change
// Body: { numbers: ['HD-...', 'HD-...'] }
// -----------------------------------------------------
async function _bulkStateChange(req, res, newState) {
    const pool = req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const numbers = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
        if (!numbers.length) return res.status(400).json({ error: 'numbers required' });

        // Guard: confirm only from draft, cancel only from non-cancel
        const allowedSource = newState === 'done' ? `state = 'draft'` : `state != 'cancel'`;
        const r = await pool.query(
            `UPDATE fast_sale_orders SET state = $1, date_updated = NOW()
             WHERE number = ANY($2::text[]) AND ${allowedSource}
             RETURNING *`,
            [newState, numbers]
        );
        const orders = r.rows.map(mapRow);
        // Broadcast batch event
        if (req.app.locals.broadcastToClients && orders.length) {
            req.app.locals.broadcastToClients({
                type: newState === 'done' ? 'pbh:bulk-confirmed' : 'pbh:bulk-cancelled',
                count: orders.length,
                numbers: orders.map((o) => o.number),
            });
        }
        if (orders.length) _notify(newState === 'done' ? 'bulk-confirm' : 'bulk-cancel', null);
        res.json({ success: true, changed: orders.length, requested: numbers.length, orders });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
router.post('/bulk-confirm', (req, res) => _bulkStateChange(req, res, 'done'));
router.post('/bulk-cancel', (req, res) => _bulkStateChange(req, res, 'cancel'));

// -----------------------------------------------------
// GET /load — list with filter + paging
// -----------------------------------------------------
router.get('/load', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const { state, search, limit, page, customerId } = req.query;
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        if (state) {
            params.push(state);
            conds.push(`state = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(
                `(partner_name ILIKE $${i} OR partner_phone ILIKE $${i} OR number ILIKE $${i} OR source_code ILIKE $${i})`
            );
        }
        // Phase 14: filter by Customer 360 link
        if (customerId) {
            const cid = parseInt(customerId, 10);
            if (Number.isFinite(cid)) {
                params.push(cid);
                conds.push(`customer_id = $${params.length}`);
            }
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM fast_sale_orders ${where}`,
            params
        );
        const total = countR.rows[0].n;

        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM fast_sale_orders ${where}
             ORDER BY date_invoice DESC, id DESC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );

        res.json({
            success: true,
            orders: listR.rows.map(mapRow),
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < total,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /:number — single PBH
// -----------------------------------------------------
router.get('/:number', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT * FROM fast_sale_orders WHERE number = $1', [
            req.params.number,
        ]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, order: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST / — manual create
// -----------------------------------------------------
router.post('/', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.partnerPhone && !b.partnerName) {
            return res.status(400).json({ error: 'partnerPhone or partnerName required' });
        }
        const number = await nextNumber(pool);
        const lines = Array.isArray(b.orderLines) ? b.orderLines : [];
        const totals = computeTotals(lines, b.deposit, b.deliveryPrice);
        // Phase 12: link to Customer 360 by phone (no auto-create)
        const customerId = b.partnerPhone
            ? await lookupCustomerIdByPhone(pool, b.partnerPhone)
            : null;

        const r = await pool.query(
            `INSERT INTO fast_sale_orders (
                number, display_stt, source,
                date_invoice,
                partner_id, partner_code, partner_name, partner_phone, partner_address, partner_email,
                city_code, city_name, district_code, district_name, ward_code, ward_name,
                order_lines, total_quantity,
                amount_untaxed, amount_tax, amount_discount, amount_total,
                payment_amount, deposit, residual,
                delivery_price, cash_on_delivery, carrier_id, carrier_name, tracking_ref, delivery_note,
                state, show_state,
                source_type, source_id, source_code,
                live_campaign_id, live_campaign_name,
                warehouse_id, warehouse_name, company_id, company_name,
                crm_team_id, crm_team_name, assigned_user_id, assigned_user_name,
                comment, tags, created_by, created_by_name,
                customer_id
            ) VALUES (
                $1, nextval('fast_sale_orders_display_stt_seq'), $2,
                COALESCE($3::timestamptz, NOW()),
                $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15,
                $16::jsonb, $17,
                $18, $19, $20, $21,
                $22, $23, $24,
                $25, $26, $27, $28, $29, $30,
                $31, $32,
                $33, $34, $35,
                $36, $37,
                $38, $39, $40, $41,
                $42, $43, $44, $45,
                $46, $47::jsonb, $48, $49,
                $50
            ) RETURNING *`,
            [
                number,
                b.source || 'NATIVE_WEB',
                b.dateInvoice || null,
                b.partnerId || null,
                b.partnerCode || null,
                b.partnerName || null,
                b.partnerPhone || null,
                b.partnerAddress || null,
                b.partnerEmail || null,
                b.cityCode || null,
                b.cityName || null,
                b.districtCode || null,
                b.districtName || null,
                b.wardCode || null,
                b.wardName || null,
                JSON.stringify(lines),
                totals.qty,
                totals.untaxed,
                totals.tax,
                totals.discount,
                totals.total,
                b.paymentAmount || 0,
                b.deposit || 0,
                totals.residual,
                b.deliveryPrice || 0,
                b.cashOnDelivery || 0,
                b.carrierId || null,
                b.carrierName || null,
                b.trackingRef || null,
                b.deliveryNote || null,
                b.state || 'draft',
                b.showState || null,
                b.sourceType || 'manual',
                b.sourceId || null,
                b.sourceCode || null,
                b.liveCampaignId || null,
                b.liveCampaignName || null,
                b.warehouseId || null,
                b.warehouseName || null,
                b.companyId || null,
                b.companyName || null,
                b.crmTeamId || null,
                b.crmTeamName || null,
                b.assignedUserId || null,
                b.assignedUserName || null,
                b.comment || null,
                JSON.stringify(b.tags || []),
                b.createdBy || null,
                b.createdByName || null,
                customerId,
            ]
        );
        const o = mapRow(r.rows[0]);
        if (req.app.locals.broadcastToClients)
            req.app.locals.broadcastToClients({ type: 'pbh:created', order: o, manual: true });
        _notify('create', o.number);
        res.json({ success: true, order: o });
    } catch (e) {
        console.error('[FAST-SALE-ORDERS] create error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /from-native-order — convert NativeOrder → PBH
// Body: { nativeOrderCode, dateInvoice?, deliveryPrice?, deposit?, ...overrides }
// -----------------------------------------------------
router.post('/from-native-order', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.nativeOrderCode && !b.nativeOrderId) {
            return res.status(400).json({ error: 'nativeOrderCode or nativeOrderId required' });
        }

        // Fetch source native_order
        const srcQ = b.nativeOrderId
            ? await pool.query('SELECT * FROM native_orders WHERE id = $1', [b.nativeOrderId])
            : await pool.query('SELECT * FROM native_orders WHERE code = $1', [b.nativeOrderCode]);
        if (srcQ.rows.length === 0)
            return res.status(404).json({ error: 'Native order not found' });
        const src = srcQ.rows[0];

        // Idempotency: already converted?
        const exists = await pool.query(
            `SELECT * FROM fast_sale_orders WHERE source_type = 'native_order' AND source_id = $1 LIMIT 1`,
            [src.id]
        );
        if (exists.rows.length > 0) {
            return res.json({ success: true, order: mapRow(exists.rows[0]), idempotent: true });
        }

        const number = await nextNumber(pool);
        // Map native_orders.products → fast_sale_orders.order_lines (same shape).
        const lines = (src.products || []).map((p, idx) => ({
            position: idx + 1,
            productId: p.productId || p.product_id || null,
            productCode: p.productCode || p.product_code || p.code || null,
            productName: p.productName || p.product_name || p.name || null,
            uomId: p.uomId || p.uom_id || null,
            uomName: p.uomName || p.uom_name || null,
            quantity: Number(p.quantity || 0),
            priceUnit: Number(p.priceUnit ?? p.price ?? 0),
            discount: Number(p.discount || 0),
            discountAmount: Number(p.discountAmount || p.discount_amount || 0),
            imageUrl: p.imageUrl || p.image_url || null,
            note: p.note || null,
        }));
        const totals = computeTotals(lines, b.deposit ?? src.deposit, b.deliveryPrice);
        // Phase 12: inherit customer_id from source NativeOrder; fall back to phone lookup
        let customerId = src.customer_id || null;
        if (!customerId && src.phone) {
            customerId = await lookupCustomerIdByPhone(pool, src.phone);
        }

        const r = await pool.query(
            `INSERT INTO fast_sale_orders (
                number, display_stt, source,
                date_invoice,
                partner_id, partner_code, partner_name, partner_phone, partner_address, partner_email,
                city_code, city_name, district_code, district_name, ward_code, ward_name,
                order_lines, total_quantity,
                amount_untaxed, amount_tax, amount_discount, amount_total,
                payment_amount, deposit, residual,
                delivery_price, cash_on_delivery,
                state, source_type, source_id, source_code,
                live_campaign_id, live_campaign_name,
                warehouse_id, warehouse_name, company_id, company_name,
                crm_team_id, assigned_user_id, assigned_user_name,
                comment, tags, created_by, created_by_name,
                customer_id
            ) VALUES (
                $1, nextval('fast_sale_orders_display_stt_seq'), 'NATIVE_WEB',
                COALESCE($2::timestamptz, NOW()),
                $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14,
                $15::jsonb, $16,
                $17, $18, $19, $20,
                $21, $22, $23,
                $24, $25,
                'draft', 'native_order', $26, $27,
                $28, $29,
                $30, $31, $32, $33,
                $34, $35, $36,
                $37, $38::jsonb, $39, $40,
                $41
            ) RETURNING *`,
            [
                number,
                b.dateInvoice || null,
                src.partner_id,
                src.partner_code,
                src.customer_name,
                src.phone,
                src.address,
                src.email,
                src.city_code,
                src.city_name,
                src.district_code,
                src.district_name,
                src.ward_code,
                src.ward_name,
                JSON.stringify(lines),
                totals.qty,
                totals.untaxed,
                totals.tax,
                totals.discount,
                totals.total,
                b.paymentAmount || 0,
                b.deposit ?? Number(src.deposit || 0),
                totals.residual,
                b.deliveryPrice || 0,
                b.cashOnDelivery || 0,
                src.id,
                src.code,
                src.live_campaign_id,
                src.live_campaign_name,
                src.warehouse_id,
                src.warehouse_name,
                src.company_id,
                src.company_name,
                src.crm_team_id,
                src.assigned_employee_id,
                src.assigned_employee_name,
                src.note,
                JSON.stringify(src.tags || []),
                b.createdBy || src.created_by,
                b.createdByName || src.created_by_name,
                customerId,
            ]
        );

        // Optional: mark source order as converted (update status to 'confirmed' if was 'draft')
        if (src.status === 'draft') {
            await pool.query(
                `UPDATE native_orders SET status = 'confirmed', updated_at = $1 WHERE id = $2`,
                [Date.now(), src.id]
            );
        }

        // Stock deduction — atomic across all lines. Clamp tại 0 nếu over-sell.
        // Idempotent: route đã return sớm ở line 687 nếu PBH đã tồn tại,
        // nên chỉ deduct 1 lần lúc tạo mới. Best-effort: lỗi không chặn flow.
        try {
            const now = Date.now();
            for (const line of lines) {
                const code = line.productCode;
                const qty = Number(line.quantity) || 0;
                if (!code || qty <= 0) continue;
                await pool.query(
                    `UPDATE web2_products
                     SET stock = GREATEST(0, stock - $1), updated_at = $2
                     WHERE code = $3`,
                    [qty, now, code]
                );
            }
        } catch (e) {
            console.warn('[FAST-SALE-ORDERS] stock deduction warn:', e.message);
        }

        const o = mapRow(r.rows[0]);
        if (req.app.locals.broadcastToClients) {
            req.app.locals.broadcastToClients({
                type: 'pbh:created',
                order: o,
                sourceNativeCode: src.code,
            });
            // Cũng emit native_order:updated cho native-orders page biết source status đã đổi
            req.app.locals.broadcastToClients({
                type: 'native_order:updated',
                action: 'promoted-to-confirmed',
                code: src.code,
            });
        }
        _notify('from-native-order', o.number);
        res.json({ success: true, order: o });
    } catch (e) {
        console.error('[FAST-SALE-ORDERS] from-native-order error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// PATCH /:number — update mutable fields
// -----------------------------------------------------
router.patch('/:number', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const allowed = {
            partnerName: 'partner_name',
            partnerPhone: 'partner_phone',
            partnerAddress: 'partner_address',
            partnerEmail: 'partner_email',
            cityCode: 'city_code',
            cityName: 'city_name',
            districtCode: 'district_code',
            districtName: 'district_name',
            wardCode: 'ward_code',
            wardName: 'ward_name',
            paymentAmount: 'payment_amount',
            deposit: 'deposit',
            deliveryPrice: 'delivery_price',
            cashOnDelivery: 'cash_on_delivery',
            carrierId: 'carrier_id',
            carrierName: 'carrier_name',
            trackingRef: 'tracking_ref',
            deliveryNote: 'delivery_note',
            state: 'state',
            showState: 'show_state',
            liveCampaignId: 'live_campaign_id',
            liveCampaignName: 'live_campaign_name',
            warehouseId: 'warehouse_id',
            warehouseName: 'warehouse_name',
            crmTeamId: 'crm_team_id',
            crmTeamName: 'crm_team_name',
            assignedUserId: 'assigned_user_id',
            assignedUserName: 'assigned_user_name',
            comment: 'comment',
            tags: 'tags',
        };
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            if (b[k] === undefined) continue;
            params.push(k === 'tags' ? JSON.stringify(b[k]) : b[k]);
            sets.push(`${col} = $${params.length}`);
        }
        // Special: orderLines triggers recompute
        if (Array.isArray(b.orderLines)) {
            const totals = computeTotals(b.orderLines, b.deposit, b.deliveryPrice);
            params.push(JSON.stringify(b.orderLines));
            sets.push(`order_lines = $${params.length}::jsonb`);
            params.push(totals.qty);
            sets.push(`total_quantity = $${params.length}`);
            params.push(totals.untaxed);
            sets.push(`amount_untaxed = $${params.length}`);
            params.push(totals.tax);
            sets.push(`amount_tax = $${params.length}`);
            params.push(totals.discount);
            sets.push(`amount_discount = $${params.length}`);
            params.push(totals.total);
            sets.push(`amount_total = $${params.length}`);
            params.push(totals.residual);
            sets.push(`residual = $${params.length}`);
        }
        if (sets.length === 0) return res.status(400).json({ error: 'No update fields' });
        // Phase 12: when partnerPhone is updated, re-link customer_id
        if (b.partnerPhone !== undefined) {
            const cid = b.partnerPhone ? await lookupCustomerIdByPhone(pool, b.partnerPhone) : null;
            params.push(cid);
            sets.push(`customer_id = $${params.length}`);
        }
        sets.push(`date_updated = NOW()`);
        params.push(req.params.number);
        const r = await pool.query(
            `UPDATE fast_sale_orders SET ${sets.join(', ')} WHERE number = $${params.length} RETURNING *`,
            params
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const o = mapRow(r.rows[0]);
        _notify('update', o.number);
        res.json({ success: true, order: o });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /:number/cancel + /:number/confirm + /:number/print
// -----------------------------------------------------
async function _stateChange(pool, number, newState) {
    return pool.query(
        `UPDATE fast_sale_orders SET state = $1, date_updated = NOW() WHERE number = $2 RETURNING *`,
        [newState, number]
    );
}
function _wsEmit(req, type, order) {
    if (req.app.locals.broadcastToClients) {
        req.app.locals.broadcastToClients({ type, order });
    }
}
router.post('/:number/cancel', async (req, res) => {
    const pool = req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const r = await _stateChange(pool, req.params.number, 'cancel');
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const o = mapRow(r.rows[0]);
        _wsEmit(req, 'pbh:cancelled', o);
        _notify('cancel', o.number);
        res.json({ success: true, order: o });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.post('/:number/confirm', async (req, res) => {
    const pool = req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const r = await _stateChange(pool, req.params.number, 'done');
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const o = mapRow(r.rows[0]);
        _wsEmit(req, 'pbh:confirmed', o);
        _notify('confirm', o.number);
        res.json({ success: true, order: o });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.post('/:number/print', async (req, res) => {
    const pool = req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `UPDATE fast_sale_orders SET print_count = print_count + 1, date_updated = NOW() WHERE number = $1 RETURNING *`,
            [req.params.number]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const o = mapRow(r.rows[0]);
        _wsEmit(req, 'pbh:printed', o);
        _notify('print', o.number);
        res.json({ success: true, order: o });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// DELETE /:number — hard delete (draft only by default)
// -----------------------------------------------------
router.delete('/:number', async (req, res) => {
    const pool = req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const force = req.query.force === '1';
        const guard = force ? '' : `AND state = 'draft'`;
        const r = await pool.query(
            `DELETE FROM fast_sale_orders WHERE number = $1 ${guard} RETURNING number`,
            [req.params.number]
        );
        if (r.rows.length === 0) {
            return res
                .status(404)
                .json({ error: 'Not found or not deletable (state ≠ draft, use force=1)' });
        }
        _notify('delete', req.params.number);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /reset-stt — atomic seq restart
// -----------------------------------------------------
router.post('/reset-stt', async (req, res) => {
    const pool = req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const renumber = req.body?.renumber === true;
        if (renumber) {
            await pool.query('ALTER SEQUENCE fast_sale_orders_display_stt_seq RESTART WITH 1');
            await pool.query(`
                DO $$
                DECLARE r RECORD;
                BEGIN
                    FOR r IN SELECT id FROM fast_sale_orders ORDER BY date_invoice ASC, id ASC LOOP
                        UPDATE fast_sale_orders SET display_stt = nextval('fast_sale_orders_display_stt_seq') WHERE id = r.id;
                    END LOOP;
                END $$;
            `);
            const c = await pool.query('SELECT COUNT(*)::int AS n FROM fast_sale_orders');
            _notify('reset-stt-renumber', null);
            return res.json({ success: true, mode: 'renumber', renumbered: c.rows[0].n });
        }
        await pool.query('ALTER SEQUENCE fast_sale_orders_display_stt_seq RESTART WITH 1');
        res.json({ success: true, mode: 'sequence-only' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
