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
//   GET    /api/fast-sale-orders/:number       — get by Number (NJ-...)
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
const web2WalletService = require('../services/web2-wallet-service');

// 2026-06-04: trừ ví khách khi tạo PBH (thu hộ). Trừ min(số dư ví, COD còn lại),
// ghi wallet_deducted để hoàn khi huỷ. Best-effort: lỗi ví KHÔNG chặn tạo PBH.
// Trả { deducted, residualAfter } để cập nhật PBH + native order.
async function _applyWalletToPbh(pool, phone, pbhRow) {
    const out = { deducted: 0, residualAfter: Number(pbhRow.residual || 0) };
    if (!phone || out.residualAfter <= 0) return out;
    try {
        const wallet = await web2WalletService.getWallet(pool, phone);
        const balance = wallet ? Number(wallet.balance) || 0 : 0;
        const deduct = Math.min(balance, out.residualAfter);
        if (deduct <= 0) return out;
        await web2WalletService.processWithdraw(
            pool,
            phone,
            deduct,
            'native-order-pbh',
            pbhRow.number,
            `Thu hộ PBH ${pbhRow.number}`
        );
        out.deducted = deduct;
        out.residualAfter = out.residualAfter - deduct;
    } catch (e) {
        console.warn('[FAST-SALE-ORDERS] wallet deduct skip:', e.message);
    }
    return out;
}

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
            'merge',
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
const { lookupCustomerIdByPhone } = require('../services/web2-order-customer-service'); // web2_order_customers (web2Db)

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
                number          VARCHAR(50)  UNIQUE NOT NULL,    -- NJ-YYYYMMDD-XXXX
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

            -- Migration 075: Gộp đơn (merge orders) — lưu array display_stt
            -- của các PBH gốc đã merge → client hiển thị "STT 1 + STT 2"
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS merged_display_stt JSONB;

            -- Migration 077: Stock restore idempotency
            -- Mark TRUE sau khi cancel PBH đã trả tồn về cho web2_products → tránh
            -- restock 2 lần nếu /cancel bị gọi lặp (idempotent retry).
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN DEFAULT FALSE;

            -- Migration 078: PBH split index — cho phép 1 native-order tạo nhiều PBH
            -- (tách đơn). Khi từ-native-order với ?split=true:
            --   PBH đầu  : split_index = 1
            --   PBH thứ 2: split_index = 2 (UI hiển thị STT "24-2")
            -- Định danh group qua source_id (cùng native_order).
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS split_index INTEGER DEFAULT 1;
            CREATE INDEX IF NOT EXISTS idx_fso_source_split
                ON fast_sale_orders(source_type, source_id, split_index);

            -- Migration 076: Đối soát đóng gói (PBH fulfillment workflow)
            -- State chạy SONG SONG state PBH (state vẫn là kế toán: draft/confirmed/done/cancel).
            -- fulfillment_state vận hành kho: pending|picking|picked|packed|shipped|delivered|cancelled.
            -- picked_lines: array {productCode, picked_qty, last_scan_at}.
            -- Stock đã trừ tại lúc tạo PBH (line ~1019 below) — reconcile KHÔNG trừ lại.
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS fulfillment_state VARCHAR(20) DEFAULT 'pending';
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS fulfillment_picked_lines JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS fulfillment_packed_at BIGINT;
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS fulfillment_shipped_at BIGINT;
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS fulfillment_delivered_at BIGINT;
            -- 2026-06-04: số tiền đã trừ từ VÍ khách khi tạo PBH (thu hộ). Lưu lại
            -- để HOÀN khi huỷ đơn (refund vào ví, idempotent: set lại 0 sau hoàn).
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS wallet_deducted NUMERIC(15,2) NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS idx_fso_fulfillment_state ON fast_sale_orders(fulfillment_state);

            -- [2026-06-05] channel kênh đơn (web2_inbox/web2_livestream) copy từ
            -- native_order khi tạo PBH → bill in từ trang PBH cũng ghi "PBH INBOX".
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS channel VARCHAR(30);
            -- Backfill PBH cũ (chưa có channel) từ native_orders theo source_code.
            -- Idempotent: chỉ update row channel IS NULL.
            UPDATE fast_sale_orders f SET channel = n.channel
                FROM native_orders n
                WHERE f.source_type = 'native_order' AND f.source_code = n.code
                  AND f.channel IS NULL AND n.channel IS NOT NULL;

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

            -- Migration 080: lịch sử PBH (audit log).
            -- Log mọi mutation: create, state-change (cancel/done/...), update fields,
            -- print, sync-from-native, ... với snapshot products + user + source page.
            CREATE TABLE IF NOT EXISTS fast_sale_order_history (
                id          BIGSERIAL PRIMARY KEY,
                pbh_number  VARCHAR(40) NOT NULL,
                action      VARCHAR(40) NOT NULL,
                changes     JSONB NOT NULL DEFAULT '{}'::jsonb,
                user_id     VARCHAR(100),
                user_name   VARCHAR(255),
                source_page VARCHAR(60),
                created_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_fsoh_pbh     ON fast_sale_order_history(pbh_number, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_fsoh_created ON fast_sale_order_history(created_at DESC);
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
        mergedDisplayStt: row.merged_display_stt || null,
        splitIndex: row.split_index != null ? Number(row.split_index) : 1,
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
            walletDeducted: Number(row.wallet_deducted || 0),
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
        channel: row.channel || null, // [2026-06-05] kênh đơn → bill "PBH INBOX"
        printCount: row.print_count,
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        // Migration 074 — Customer 360 link (Phase 12)
        customerId: row.customer_id != null ? Number(row.customer_id) : null,
        // Migration 076 — Fulfillment / Reconcile
        fulfillment: {
            state: row.fulfillment_state || 'pending',
            pickedLines: row.fulfillment_picked_lines || [],
            packedAt: row.fulfillment_packed_at != null ? Number(row.fulfillment_packed_at) : null,
            shippedAt:
                row.fulfillment_shipped_at != null ? Number(row.fulfillment_shipped_at) : null,
            deliveredAt:
                row.fulfillment_delivered_at != null ? Number(row.fulfillment_delivered_at) : null,
        },
    };
}

async function nextNumber(pool) {
    // NJ-YYYYMMDD-XXXX (VN timezone)
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 3600 * 1000);
    const datePart = `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1, 2)}${pad(vn.getUTCDate(), 2)}`;
    const prefix = `NJ-${datePart}-`;
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

// Log 1 row vào fast_sale_order_history. Best-effort.
async function _logPbhHistory(pool, pbhNumber, action, changes, user, sourcePage) {
    if (!pool || !pbhNumber) return;
    try {
        await pool.query(
            `INSERT INTO fast_sale_order_history (pbh_number, action, changes, user_id, user_name, source_page, created_at)
             VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
            [
                pbhNumber,
                action,
                JSON.stringify(changes || {}),
                user?.id || null,
                user?.name || null,
                sourcePage || null,
                Date.now(),
            ]
        );
    } catch (e) {
        console.warn('[FAST-SALE-ORDERS] _logPbhHistory failed:', e.message);
    }
}
function _extractPbhUser(req) {
    const b = req.body || {};
    return {
        id: b.userId || b.createdBy || req.headers['x-user-id'] || null,
        name: b.userName || b.createdByName || req.headers['x-user-name'] || null,
    };
}
function _extractPbhSourcePage(req) {
    return req.body?.sourcePage || req.headers['x-source-page'] || null;
}

// Validate stock TRƯỚC khi tạo PBH (block over-sell).
// Trả về array violations [{code, requested, available}] — empty = OK.
// Bỏ qua line có productCode null hoặc qty <= 0 (vd phí ship, item free).
async function validateStock(pool, lines) {
    const arr = Array.isArray(lines) ? lines : [];
    const need = new Map(); // code → totalRequested (gộp duplicate code trong cùng đơn)
    for (const l of arr) {
        const code = l.productCode || l.product_code || l.code;
        const qty = Number(l.quantity || l.qty || 0);
        if (!code || qty <= 0) continue;
        need.set(code, (need.get(code) || 0) + qty);
    }
    if (need.size === 0) return [];
    const codes = [...need.keys()];
    const r = await pool.query(
        `SELECT code, stock FROM web2_products WHERE code = ANY($1::text[])`,
        [codes]
    );
    const stockMap = new Map(r.rows.map((row) => [row.code, Number(row.stock) || 0]));
    const violations = [];
    for (const [code, requested] of need) {
        const available = stockMap.has(code) ? stockMap.get(code) : 0;
        if (requested > available) {
            violations.push({ code, requested, available });
        }
    }
    return violations;
}

// Restock 1 PBH (đã cancel) → trả tồn về web2_products. Idempotent:
// chỉ chạy nếu stock_restored=FALSE, sau khi xong SET stock_restored=TRUE.
// Trả về { restored: number_of_lines, items: [{code, qty}] }.
async function restockOrderLines(pool, orderRow) {
    if (!orderRow || orderRow.stock_restored === true) {
        return { restored: 0, items: [], skipped: 'already_restored' };
    }
    const lines = Array.isArray(orderRow.order_lines) ? orderRow.order_lines : [];
    const now = Date.now();
    const items = [];
    for (const line of lines) {
        const code = line.productCode || line.product_code || line.code;
        const qty = Number(line.quantity || line.qty || 0);
        if (!code || qty <= 0) continue;
        await pool.query(
            `UPDATE web2_products SET stock = stock + $1, updated_at = $2 WHERE code = $3`,
            [qty, now, code]
        );
        items.push({ code, qty });
    }
    await pool.query(
        `UPDATE fast_sale_orders SET stock_restored = TRUE, date_updated = NOW() WHERE id = $1`,
        [orderRow.id]
    );
    return { restored: items.length, items };
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`
            UPDATE fast_sale_orders AS o
            SET customer_id = c.id
            FROM web2_order_customers AS c
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
// Body: { numbers: ['NJ-...', 'NJ-...'] }
// -----------------------------------------------------
async function _bulkStateChange(req, res, newState) {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
// POST /merge — gộp 2+ PBH draft cùng KH thành 1 PBH mới
// Body: { numbers: ['NJ-...', 'NJ-...'] }
// Logic:
//   - Validate: ≥2 numbers, tất cả tồn tại, tất cả state=draft, cùng partner_phone
//   - Combine order_lines (concat), sum total_quantity + amount_*
//   - INSERT PBH mới với:
//       source_code = "NJ-A+NJ-B" (join '+')
//       merged_display_stt = [stt_a, stt_b] (lưu để client hiển thị "1 + 2")
//   - DELETE PBHs gốc
//   - Notify SSE web2:fast-sale-orders + web2:customer-wallet (cross-bc B2)
// -----------------------------------------------------
router.post('/merge', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const numbers = Array.isArray(req.body?.numbers) ? req.body.numbers : null;
    if (!numbers || numbers.length < 2) {
        return res.status(400).json({ error: 'Cần ít nhất 2 số PBH để gộp' });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');

        // Fetch all source PBHs
        const placeholders = numbers.map((_, i) => `$${i + 1}`).join(',');
        const src = await client.query(
            `SELECT * FROM fast_sale_orders WHERE number IN (${placeholders})`,
            numbers
        );
        if (src.rows.length !== numbers.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: `Tìm thấy ${src.rows.length}/${numbers.length} PBH — có đơn không tồn tại`,
            });
        }

        // Validate: all draft + same partner_phone
        const notDraft = src.rows.filter((r) => r.state !== 'draft');
        if (notDraft.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Chỉ gộp được PBH ở trạng thái 'draft'. Đơn không hợp lệ: ${notDraft.map((r) => r.number).join(', ')}`,
            });
        }
        const phones = new Set(src.rows.map((r) => r.partner_phone || ''));
        if (phones.size > 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Phải cùng SĐT khách. Đang có ${phones.size} SĐT khác nhau: ${Array.from(phones).join(', ')}`,
            });
        }

        // Combine fields
        const baseRow = src.rows[0]; // dùng row đầu làm template (partner info, address, ...)
        const sortedRows = src.rows.sort(
            (a, b) => (Number(a.display_stt) || 0) - (Number(b.display_stt) || 0)
        );
        const combinedLines = [];
        let totalQty = 0;
        let totalUntaxed = 0;
        let totalDiscount = 0;
        let totalAmount = 0;
        let totalShipping = 0;
        for (const r of sortedRows) {
            const lines = Array.isArray(r.order_lines) ? r.order_lines : [];
            combinedLines.push(...lines);
            totalQty += Number(r.total_quantity) || 0;
            totalUntaxed += Number(r.amount_untaxed) || 0;
            totalDiscount += Number(r.amount_discount) || 0;
            totalAmount += Number(r.amount_total) || 0;
            totalShipping += Number(r.delivery_price) || 0;
        }
        const mergedStts = sortedRows.map((r) => Number(r.display_stt) || 0).filter(Boolean);
        const mergedSourceCode = sortedRows.map((r) => r.number).join('+');
        const combinedComment = sortedRows
            .map((r) => (r.comment ? `[${r.number}] ${r.comment}` : null))
            .filter(Boolean)
            .join('\n---\n');

        // Generate new PBH number
        const today = new Date();
        const ymd = `${today.getFullYear()}${pad(today.getMonth() + 1, 2)}${pad(today.getDate(), 2)}`;
        const todayCountQ = await client.query(
            `SELECT COUNT(*)::int AS n FROM fast_sale_orders WHERE number LIKE $1`,
            [`NJ-${ymd}-%`]
        );
        const nextSeq = pad(todayCountQ.rows[0].n + 1, 4);
        const newNumber = `NJ-${ymd}-${nextSeq}`;

        const ins = await client.query(
            `INSERT INTO fast_sale_orders (
                number, display_stt, source,
                partner_id, partner_code, partner_name, partner_phone, partner_address, partner_email,
                city_code, city_name, district_code, district_name, ward_code, ward_name,
                order_lines, total_quantity, amount_untaxed, amount_discount, amount_total,
                delivery_price, carrier_id, carrier_name,
                state, source_type, source_code, merged_display_stt,
                live_campaign_id, live_campaign_name, customer_id, comment
            ) VALUES (
                $1, nextval('fast_sale_orders_display_stt_seq'), 'NATIVE_WEB',
                $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13,
                $14, $15, $16, $17, $18,
                $19, $20, $21,
                'draft', 'merged', $22, $23,
                $24, $25, $26, $27
            ) RETURNING *`,
            [
                newNumber,
                baseRow.partner_id,
                baseRow.partner_code,
                baseRow.partner_name,
                baseRow.partner_phone,
                baseRow.partner_address,
                baseRow.partner_email,
                baseRow.city_code,
                baseRow.city_name,
                baseRow.district_code,
                baseRow.district_name,
                baseRow.ward_code,
                baseRow.ward_name,
                JSON.stringify(combinedLines),
                totalQty,
                totalUntaxed,
                totalDiscount,
                totalAmount,
                totalShipping,
                baseRow.carrier_id,
                baseRow.carrier_name,
                mergedSourceCode,
                JSON.stringify(mergedStts),
                baseRow.live_campaign_id,
                baseRow.live_campaign_name,
                baseRow.customer_id,
                combinedComment,
            ]
        );

        // Delete source PBHs
        await client.query(
            `DELETE FROM fast_sale_orders WHERE number IN (${placeholders})`,
            numbers
        );

        await client.query('COMMIT');
        const newOrder = mapRow(ins.rows[0]);
        if (req.app.locals.broadcastToClients) {
            req.app.locals.broadcastToClients({
                type: 'pbh:merged',
                merged: numbers,
                order: newOrder,
            });
        }
        _notify('merge', newOrder.number);
        res.json({
            success: true,
            mergedFrom: numbers,
            mergedStts,
            order: newOrder,
        });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[FAST-SALE-ORDERS] merge error:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// -----------------------------------------------------
// GET /load — list with filter + paging
// -----------------------------------------------------
const _kpiModuleFS = require('./v2/kpi');
router.get('/load', _kpiModuleFS.applyKpiScope, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
        // Sprint 3 KPI: scope filter via source_code IN (native_orders matching range).
        // PBH không có campaign_stt trực tiếp → match qua source_code → native_orders row.
        // Merged PBH có source_code = "A+B+C" — chấp nhận miss; cleanest fix là store
        // campaign_stt array nhưng overkill cho giai đoạn này.
        if (req.kpiScope && req.kpiScope.length) {
            const scopeFrag = _kpiModuleFS.buildScopeWhere(req.kpiScope, params.length + 1);
            params.push(...scopeFrag.params);
            conds.push(`source_code IN (
                SELECT code FROM native_orders WHERE ${scopeFrag.clause}
            )`);
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

// =====================================================
// GET /api/fast-sale-orders/:number/history?limit=N
// Trả timeline mọi mutation: create-from-native, cancel, state-change, ...
// Đặt TRƯỚC route /:number để Express không match nhầm.
// =====================================================
router.get('/:number/history', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const num = req.params.number;
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const r = await pool.query(
            `SELECT id, pbh_number, action, changes, user_id, user_name, source_page, created_at
             FROM fast_sale_order_history
             WHERE pbh_number = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [num, limit]
        );
        res.json({
            success: true,
            history: r.rows.map((row) => ({
                id: row.id,
                pbhNumber: row.pbh_number,
                action: row.action,
                changes: row.changes,
                userId: row.user_id,
                userName: row.user_name,
                sourcePage: row.source_page,
                createdAt: Number(row.created_at),
            })),
        });
    } catch (e) {
        console.error('[FAST-SALE-ORDERS] history error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /:number — single PBH
// -----------------------------------------------------
router.get('/:number', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.partnerPhone && !b.partnerName) {
            return res.status(400).json({ error: 'partnerPhone or partnerName required' });
        }
        const number = await nextNumber(pool);
        const lines = Array.isArray(b.orderLines) ? b.orderLines : [];
        // Stock guard cho manual create — same logic as from-native-order.
        if (b.force !== true) {
            const violations = await validateStock(pool, lines);
            if (violations.length > 0) {
                return res.status(400).json({
                    error: 'over_sell',
                    message: 'Tạo PBH thất bại: số lượng vượt tồn kho ở 1 hoặc nhiều SP',
                    violations,
                });
            }
        } else {
            console.warn(`[FAST-SALE-ORDERS] manual create: stock check BYPASSED (force=true)`);
        }
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
        // Stock deduction — same logic as /from-native-order (line 1283).
        // Trừ stock atomic, clamp tại 0. Best-effort: lỗi không chặn flow.
        try {
            const now = Date.now();
            for (const line of lines) {
                const code = line.productCode || line.product_code;
                const qty = Number(line.quantity || line.qty) || 0;
                if (!code || qty <= 0) continue;
                await pool.query(
                    `UPDATE web2_products
                     SET stock = GREATEST(0, stock - $1), updated_at = $2
                     WHERE code = $3`,
                    [qty, now, code]
                );
            }
        } catch (e) {
            console.warn('[FAST-SALE-ORDERS] manual create stock deduct warn:', e.message);
        }

        const o = mapRow(r.rows[0]);
        if (req.app.locals.broadcastToClients)
            req.app.locals.broadcastToClients({ type: 'pbh:created', order: o, manual: true });
        _notify('create', o.number);
        // SSE notify web2:products để products page refresh stock
        if (_notifyClients) {
            try {
                _notifyClients(
                    'web2:products',
                    { action: 'pbh-stock-deduct', code: null, ts: Date.now() },
                    'update'
                );
            } catch {}
        }
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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

        // Idempotency vs split mode:
        // - Default (b.split !== true): nếu native-order đã có PBH → return existing (idempotent).
        // - Split mode (b.split === true): cho phép tạo PBH thứ 2, 3... với split_index tăng dần.
        //   UI hiển thị STT format "24-2", "24-3" để phân biệt.
        // - Cancelled exception: nếu native-order ở status='cancelled', LUÔN tạo PBH mới
        //   (số HĐ mới) — KHÔNG trả PBH cũ idempotent. PBH cũ giữ nguyên state='cancel'
        //   (đã sync khi cancelOrder chạy). User yêu cầu behavior này để có thể re-issue
        //   PBH mới cho đơn đã huỷ mà không phải tạo native-order mới.
        const existsQ = await pool.query(
            `SELECT *, COUNT(*) OVER() AS sibling_count FROM fast_sale_orders
             WHERE source_type = 'native_order' AND source_id = $1
             ORDER BY split_index ASC, date_created ASC`,
            [src.id]
        );
        const existingPbhs = existsQ.rows;
        const splitMode = b.split === true || src.status === 'cancelled';
        if (existingPbhs.length > 0 && !splitMode) {
            return res.json({
                success: true,
                order: mapRow(existingPbhs[0]),
                idempotent: true,
                note: 'Đã có PBH. Gửi ?split=true để tạo PBH bổ sung (tách đơn).',
            });
        }
        const splitIndex = existingPbhs.length + 1; // 1 = PBH đầu, ≥2 = tách đơn.

        // 2026-06-04: HỢP NHẤT 1 mã NJ/đơn — PBH number = mã đơn web (NJ-...) thay vì
        // counter HD riêng. Bill barcode = số PBH = mã đơn web → reconcile quét 1 mã ăn hết.
        // PBH đầu (splitIndex 1) = src.code; tách/re-issue (≥2) = src.code-N giữ unique.
        const number = splitIndex === 1 ? src.code : `${src.code}-${splitIndex}`;
        // Lines: ưu tiên b.orderLines nếu client truyền (tách đơn chỉ subset SP);
        // fallback toàn bộ products của native-order.
        const sourceLines =
            Array.isArray(b.orderLines) && b.orderLines.length > 0
                ? b.orderLines
                : src.products || [];
        // Back-compat: native_orders.products[] có thể có 2 shape khác nhau
        // (cart v2 ghi 'code'+'qty', modal saveEdit ghi 'productCode'+'quantity').
        // COALESCE cả 2 fallback chain.
        const lines = sourceLines.map((p, idx) => ({
            position: idx + 1,
            productId: p.productId || p.product_id || null,
            productCode: p.productCode || p.product_code || p.code || null,
            productName: p.productName || p.product_name || p.name || null,
            uomId: p.uomId || p.uom_id || null,
            uomName: p.uomName || p.uom_name || null,
            quantity: Number(p.quantity || p.qty || 0),
            priceUnit: Number(p.priceUnit ?? p.price ?? 0),
            discount: Number(p.discount || 0),
            discountAmount: Number(p.discountAmount || p.discount_amount || 0),
            imageUrl: p.imageUrl || p.image_url || null,
            note: p.note || null,
        }));
        // Stock guard: block over-sell. Có thể bypass với `force: true` (vd admin
        // tạo PBH gấp khi đang chờ nhập hàng) — log để traceable.
        if (b.force !== true) {
            const violations = await validateStock(pool, lines);
            if (violations.length > 0) {
                return res.status(400).json({
                    error: 'over_sell',
                    message: 'Tạo PBH thất bại: số lượng vượt tồn kho ở 1 hoặc nhiều SP',
                    violations,
                });
            }
        } else {
            console.warn(
                `[FAST-SALE-ORDERS] from-native-order: stock check BYPASSED (force=true) nativeOrder=${src.code}`
            );
        }
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
                customer_id, split_index, carrier_name, channel
            ) VALUES (
                -- PBH display_stt = native_order.display_stt (giữ đồng bộ với
                -- bên native-orders). Hiển thị "{native.stt}-{split_index}"
                -- (vd 35-4 = PBH thứ 4 cho native STT 35). Trước đây dùng
                -- nextval('fast_sale_orders_display_stt_seq') → STT lệch.
                -- Fallback nextval nếu native không có display_stt (manual PBH).
                $1, COALESCE($43::integer, nextval('fast_sale_orders_display_stt_seq')), 'NATIVE_WEB',
                COALESCE($2::timestamptz, NOW()),
                $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14,
                $15::jsonb, $16,
                $17, $18, $19, $20,
                $21, $22, $23,
                $24, $25,
                'done', 'native_order', $26, $27,
                $28, $29,
                $30, $31, $32, $33,
                $34, $35, $36,
                $37, $38::jsonb, $39, $40,
                $41, $42, $44, $45
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
                splitIndex,
                src.display_stt || null, // $43 — sync STT từ native-order
                b.carrierName || null, // $44 — phương thức giao (vd "PBH SHOP") → bill + badge
                src.channel || null, // $45 — kênh đơn → bill "PBH INBOX" khi in từ trang PBH
            ]
        );

        // Mark source order as converted — bump status sang 'confirmed' khi vừa tạo PBH.
        // - draft → confirmed (đơn nháp giờ đã có PBH active)
        // - cancelled → confirmed (re-issue PBH cho đơn đã huỷ: đơn quay về Đơn hàng)
        // confirmed → giữ nguyên (đã ở state đúng)
        if (src.status === 'draft' || src.status === 'cancelled') {
            await pool.query(
                `UPDATE native_orders SET status = 'confirmed', updated_at = $1 WHERE id = $2`,
                [Date.now(), src.id]
            );
            // SSE notify để native-orders UI tự refresh status badge từ "Huỷ bỏ" → "Đơn hàng"
            if (req.app.locals.web2RealtimeSseNotify) {
                try {
                    req.app.locals.web2RealtimeSseNotify(
                        'web2:native-orders',
                        {
                            action: 'status-bumped',
                            code: src.code,
                            from: src.status,
                            to: 'confirmed',
                            ts: Date.now(),
                        },
                        'update'
                    );
                } catch {}
            }
        }

        // Sprint 1 KPI: emit actual_confirmed cho từng product trong native order.
        // Dùng products[] CỦA native_orders (có source field), không order_lines (đã strip).
        // Fire-and-forget — KPI lỗi không chặn flow.
        try {
            const kpiModule = require('./v2/kpi');
            const editor = (req.body && req.body._editor) || {};
            const actorId = Number(editor.userId || src.created_by);
            const pbhNumber = r.rows[0]?.number || r.rows[0]?.code;
            if (Number.isFinite(actorId) && pbhNumber) {
                const campaignName = src.live_campaign_name || null;
                const campaignId = src.live_campaign_id || kpiModule.SYNTHETIC_NO_CAMPAIGN;
                const campaignStt = src.campaign_stt ?? null;
                const beneficiary = await kpiModule.resolveBeneficiary(pool, {
                    campaign_name: campaignName,
                    campaign_stt: campaignStt,
                    actor_user_id: actorId,
                    actor_name: editor.userName || src.created_by_name || null,
                });
                const nativeProducts = Array.isArray(src.products) ? src.products : [];
                for (const p of nativeProducts) {
                    const code = p.productCode || p.code;
                    const qty = Number(p.quantity ?? p.qty) || 0;
                    if (!code || qty <= 0) continue;
                    // Deterministic client_event_id theo PBH number → revoke/reissue dedup tự nhiên
                    await kpiModule.emitKpiEvent(pool, {
                        event_type: 'actual_confirmed',
                        actor_user_id: actorId,
                        actor_name: editor.userName || src.created_by_name || null,
                        ...beneficiary,
                        order_code: src.code,
                        order_campaign_stt: campaignStt,
                        customer_id: src.fb_user_id || '',
                        product_code: code,
                        qty_delta: qty,
                        source: p.source || 'native',
                        campaign_id: campaignId,
                        source_page: 'fastsaleorder-invoice',
                        client_event_id: `pbh_${pbhNumber}_${code}`,
                        raw_payload: { product_name: p.name, pbh_number: pbhNumber },
                    });
                }
            }
        } catch (e) {
            console.warn('[FAST-SALE-ORDERS] KPI emit (confirm) failed:', e.message);
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
        // SSE notify web2:products → products page refresh stock
        if (_notifyClients) {
            try {
                _notifyClients(
                    'web2:products',
                    { action: 'pbh-stock-deduct', code: null, ts: Date.now() },
                    'update'
                );
            } catch {}
        }

        // 2026-06-04: THU HỘ — trừ ví khách (nếu có số dư) cho phần COD còn lại.
        // Trừ thật khỏi ví (idempotent theo PBH number), giảm residual = COD còn lại.
        // Ví đủ trả hết → native order coi như "đã thanh toán" (residual=0).
        const wlt = await _applyWalletToPbh(pool, src.phone, r.rows[0]);
        if (wlt.deducted > 0) {
            const upd = await pool.query(
                `UPDATE fast_sale_orders
                 SET payment_amount = COALESCE(payment_amount,0) + $1,
                     residual = $2,
                     cash_on_delivery = $2,
                     wallet_deducted = $1,
                     date_updated = NOW()
                 WHERE id = $3 RETURNING *`,
                [wlt.deducted, wlt.residualAfter, r.rows[0].id]
            );
            if (upd.rows[0]) r.rows[0] = upd.rows[0];
            // SSE ví → pill số dư + ví KH refresh
            if (_notifyClients) {
                try {
                    _notifyClients(
                        `web2:wallet:${String(src.phone).replace(/\D/g, '')}`,
                        { action: 'pbh-deduct', phone: src.phone, ts: Date.now() },
                        'update'
                    );
                } catch {}
            }
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

        // Tự xóa cart bên TPOS panel (Kho SP) khi PBH tạo thành công.
        // Cart gắn theo customer (fbUserId) → query native_order.fb_user_id để biết
        // customerId. Soft delete tất cả cart_items active của customer này.
        try {
            const fbUserId = src.fb_user_id;
            if (fbUserId) {
                const cartRoute = require('./v2/cart');
                if (cartRoute.clearCartByCustomerId) {
                    await cartRoute.clearCartByCustomerId(pool, fbUserId, {
                        reason: 'pbh-created',
                        nativeOrderCode: src.code,
                        pbhNumber: o.number,
                    });
                }
            }
        } catch (e) {
            console.warn('[FAST-SALE-ORDERS] auto-clear cart fail:', e.message);
        }

        await _logPbhHistory(
            pool,
            o.number,
            'create-from-native',
            {
                sourceCode: src.code,
                splitIndex: o.splitIndex,
                products: o.orderLines?.map((l) => ({
                    code: l.productCode,
                    name: l.productName,
                    qty: l.quantity,
                    priceUnit: l.priceUnit,
                })),
                totalAmount: o.totals?.total,
                state: o.state,
                dateInvoice: o.dateInvoice,
            },
            _extractPbhUser(req),
            _extractPbhSourcePage(req) || 'native-orders'
        );
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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

// 2-way sync: PBH state change → propagate ngược về native_orders linked.
// Map: draft→draft, confirmed→confirmed, done→confirmed (PBH 'done' = native 'confirmed' UX),
//      cancel→cancelled. PBH 'done' shouldn't bump native back to draft, treat as confirmed.
const PBH_TO_NATIVE_STATUS = {
    draft: 'draft',
    confirmed: 'confirmed',
    done: 'confirmed',
    cancel: 'cancelled',
};
async function syncNativeOrderStatusFromPbh(pool, pbhRow, newState) {
    const native = PBH_TO_NATIVE_STATUS[newState];
    if (!native || !pbhRow?.source_code || pbhRow.source_type !== 'native_order') {
        return { synced: 0 };
    }
    // source_code có thể là 'NJ-A' hoặc 'NJ-A+NJ-B+...' khi merged.
    const codes = String(pbhRow.source_code)
        .split('+')
        .map((s) => s.trim())
        .filter(Boolean);
    if (codes.length === 0) return { synced: 0 };
    try {
        const r = await pool.query(
            `UPDATE native_orders
             SET status = $1, updated_at = $2
             WHERE code = ANY($3::text[]) AND status <> $1
             RETURNING code`,
            [native, Date.now(), codes]
        );
        if (r.rows.length > 0) {
            console.log(
                `[PBH→NATIVE-SYNC] PBH ${pbhRow.number} state=${newState} → native status=${native} (${r.rows.length} đơn web)`
            );
        }
        return { synced: r.rows.length, codes: r.rows.map((x) => x.code) };
    } catch (e) {
        console.warn('[PBH→NATIVE-SYNC] fail:', e.message);
        return { synced: 0, error: e.message };
    }
}
function _wsEmit(req, type, order) {
    if (req.app.locals.broadcastToClients) {
        req.app.locals.broadcastToClients({ type, order });
    }
}
router.post('/:number/cancel', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        // Lấy state cũ + lines + source_* TRƯỚC khi đổi state — quyết định có
        // restock + sync ngược native_order.status không. source_type/source_code
        // bắt buộc để syncNativeOrderStatusFromPbh tìm đơn web revert về cancelled.
        const prev = await pool.query(
            `SELECT id, state, stock_restored, order_lines, source_type, source_code
             FROM fast_sale_orders WHERE number = $1`,
            [req.params.number]
        );
        if (prev.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const prevRow = prev.rows[0];
        const wasNotCancelled = prevRow.state !== 'cancel';

        const r = await _stateChange(pool, req.params.number, 'cancel');
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const o = mapRow(r.rows[0]);

        // Restock: chỉ chạy nếu PBH lần đầu cancel (tránh restock 2 lần idempotent retry).
        // restockOrderLines tự skip nếu stock_restored=TRUE → safe khi /cancel gọi lại.
        let restockSummary = null;
        if (wasNotCancelled) {
            try {
                restockSummary = await restockOrderLines(pool, prevRow);
                console.log(
                    `[FAST-SALE-ORDERS] cancel ${o.number} → restocked ${restockSummary.restored} lines`
                );
                // SSE notify web2:products → products page refresh stock
                if (restockSummary.restored > 0 && _notifyClients) {
                    try {
                        _notifyClients(
                            'web2:products',
                            { action: 'pbh-cancel-restock', code: null, ts: Date.now() },
                            'update'
                        );
                    } catch {}
                }
            } catch (e) {
                console.error('[FAST-SALE-ORDERS] restock fail:', e.message);
            }
        }

        // Sync ngược: PBH cancel → native-orders status='cancelled' (cho single + merged).
        let nativeSync = null;
        if (wasNotCancelled) {
            nativeSync = await syncNativeOrderStatusFromPbh(pool, prevRow, 'cancel');
            if (nativeSync.synced > 0 && req.app.locals.web2RealtimeSseNotify) {
                try {
                    req.app.locals.web2RealtimeSseNotify(
                        'web2:native-orders',
                        {
                            action: 'pbh-state-sync',
                            state: 'cancel',
                            codes: nativeSync.codes,
                            ts: Date.now(),
                        },
                        'update'
                    );
                } catch {}
            }
        }
        _wsEmit(req, 'pbh:cancelled', o);
        _notify('cancel', o.number);
        if (wasNotCancelled) {
            await _logPbhHistory(
                pool,
                o.number,
                'cancel',
                {
                    prevState: prevRow.state,
                    restoredLines: restockSummary?.restored || 0,
                    nativeSync: nativeSync?.codes || null,
                    reason: req.body?.reason || null,
                },
                _extractPbhUser(req),
                _extractPbhSourcePage(req) || 'fastsaleorder-invoice'
            );
            // Sprint 1 KPI: emit actual_revoked cho mọi actual_confirmed events liên
            // quan đến đơn này. Idempotent qua client_event_id='revoke_<id>'.
            _emitRevokeKpi(pool, prevRow.source_code || null, req).catch((e) =>
                console.warn('[FAST-SALE-ORDERS] KPI revoke emit failed:', e.message)
            );
        }
        res.json({ success: true, order: o, restock: restockSummary, nativeSync });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Sprint 1 helper — revoke KPI cho 1 order. Tìm mọi actual_confirmed events
// chưa bị revoke, emit actual_revoked với cùng beneficiary + qty_delta âm.
async function _emitRevokeKpi(pool, orderCode, req) {
    if (!orderCode) return;
    const kpiModule = require('./v2/kpi');
    const editor = (req?.body && req.body._editor) || _extractPbhUser(req) || {};
    const actorId = Number(editor.userId || editor.user_id) || Number(editor.id) || null;
    const events = await pool.query(
        `SELECT e.id, e.product_code, e.qty_delta, e.beneficiary_user_id, e.beneficiary_name,
                e.customer_id, e.source, e.campaign_id, e.order_campaign_stt
         FROM web2_kpi_events e
         WHERE e.order_code = $1 AND e.event_type = 'actual_confirmed'
           AND NOT EXISTS (
               SELECT 1 FROM web2_kpi_events r
               WHERE r.event_type = 'actual_revoked'
                 AND r.revokes_event_id = e.id
           )`,
        [orderCode]
    );
    for (const ev of events.rows) {
        await kpiModule.emitKpiEvent(pool, {
            event_type: 'actual_revoked',
            actor_user_id: actorId || ev.beneficiary_user_id,
            actor_name: editor.userName || editor.user_name || null,
            beneficiary_user_id: ev.beneficiary_user_id,
            beneficiary_name: ev.beneficiary_name,
            beneficiary_source: 'assignment',
            order_code: orderCode,
            order_campaign_stt: ev.order_campaign_stt,
            customer_id: ev.customer_id,
            product_code: ev.product_code,
            qty_delta: -ev.qty_delta,
            source: ev.source,
            campaign_id: ev.campaign_id,
            source_page: 'fastsaleorder-invoice',
            client_event_id: `revoke_${ev.id}`,
            revokes_event_id: ev.id,
            raw_payload: { reason: req?.body?.reason || 'pbh-cancel' },
        });
    }
}

// POST /by-source/:nativeOrderCode/cancel
// Tìm PBH có source_code = :nativeOrderCode (state != 'cancel') → cancel.
// Đồng thời revert native_orders.status từ 'confirmed' về 'draft' để
// row bên native-orders quay lại trạng thái "có thể tạo PBH lại".
// Dùng bởi nút "Huỷ PBH" trong native-orders.
router.post('/by-source/:nativeOrderCode/cancel', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    const code = req.params.nativeOrderCode;
    if (!code) return res.status(400).json({ error: 'nativeOrderCode required' });
    try {
        await ensureTables(pool);
        const found = await pool.query(
            `SELECT id, number, state, stock_restored, order_lines FROM fast_sale_orders
             WHERE source_code = $1 AND state <> 'cancel'
             ORDER BY date_created DESC LIMIT 1`,
            [code]
        );
        if (found.rows.length === 0) {
            return res.status(404).json({ error: 'PBH chưa tồn tại cho đơn web này' });
        }
        const prevRow = found.rows[0];
        const number = prevRow.number;
        const r = await _stateChange(pool, number, 'cancel');
        if (r.rows.length === 0) return res.status(404).json({ error: 'PBH biến mất khi cancel' });
        const o = mapRow(r.rows[0]);

        // Restock — query trước WHERE state <> 'cancel' nên chắc chắn cần restock.
        let restockSummary = null;
        try {
            restockSummary = await restockOrderLines(pool, prevRow);
            console.log(
                `[FAST-SALE-ORDERS] cancel-by-source ${number} → restocked ${restockSummary.restored} lines`
            );
            if (restockSummary.restored > 0 && _notifyClients) {
                try {
                    _notifyClients(
                        'web2:products',
                        { action: 'pbh-cancel-restock', code: null, ts: Date.now() },
                        'update'
                    );
                } catch {}
            }
        } catch (e) {
            console.error('[FAST-SALE-ORDERS] restock fail:', e.message);
        }

        // Revert native_orders.status — chỉ revert nếu đang là 'confirmed'.
        await pool.query(
            `UPDATE native_orders SET status = 'draft', updated_at = $1
             WHERE code = $2 AND status = 'confirmed'`,
            [Date.now(), code]
        );

        _wsEmit(req, 'pbh:cancelled', o);
        _notify('cancel', o.number);

        // Cũng emit cho native-orders để row update ngay (status badge đổi)
        if (req.app.locals.web2RealtimeSseNotify) {
            try {
                req.app.locals.web2RealtimeSseNotify(
                    'web2:native-orders',
                    {
                        action: 'pbh-cancelled',
                        code,
                        pbhNumber: number,
                        ts: Date.now(),
                    },
                    'update'
                );
            } catch {
                /* ignore */
            }
        }

        // Sprint 1 KPI: revoke actual events for this native order
        _emitRevokeKpi(pool, code, req).catch((e) =>
            console.warn('[FAST-SALE-ORDERS] KPI revoke (by-source) failed:', e.message)
        );

        res.json({ success: true, order: o, nativeOrderCode: code, restock: restockSummary });
    } catch (e) {
        console.error('[FAST-SALE-ORDERS] cancel-by-source error:', e.message);
        res.status(500).json({ error: e.message });
    }
});
router.post('/:number/confirm', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const r = await _stateChange(pool, req.params.number, 'done');
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const o = mapRow(r.rows[0]);
        // Sync ngược: PBH done → native-orders confirmed (cả single + merged)
        const nativeSync = await syncNativeOrderStatusFromPbh(pool, r.rows[0], 'done');
        if (nativeSync.synced > 0 && req.app.locals.web2RealtimeSseNotify) {
            try {
                req.app.locals.web2RealtimeSseNotify(
                    'web2:native-orders',
                    {
                        action: 'pbh-state-sync',
                        state: 'done',
                        codes: nativeSync.codes,
                        ts: Date.now(),
                    },
                    'update'
                );
            } catch {}
        }
        _wsEmit(req, 'pbh:confirmed', o);
        _notify('confirm', o.number);
        res.json({ success: true, order: o, nativeSync });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.post('/:number/print', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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

router.initializeNotifiers = initializeNotifiers;
// Export restock helper cho cross-module reuse (vd reconcile /return-failed).
router.restockOrderLines = restockOrderLines;
router.validateStock = validateStock;
module.exports = router;
