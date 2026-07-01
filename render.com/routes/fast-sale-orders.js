// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// FAST SALE ORDERS (PBH — Phiếu Bán Hàng) REST API
// PBH nội bộ Web 2.0 (bảng fast_sale_orders) — KHÔNG đồng bộ hệ ngoài.
// Nguồn DUY NHẤT: native_order (convert qua /from-native-order). Tạo tay đã gỡ (410).
// =====================================================
//
// Endpoints:
//   GET    /api/fast-sale-orders/health
//   GET    /api/fast-sale-orders/load          — list with filter + paging
//   GET    /api/fast-sale-orders/:number       — get by Number (NJ-...)
//   POST   /api/fast-sale-orders               — (VÔ HIỆU 410) tạo tay đã gỡ — chỉ /from-native-order
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
const { withTransaction } = require('../db/with-transaction');
// audit r6 (2026-06-21): gate MỌI mutation PBH/stock (POST/PATCH/DELETE) bằng
// requireWeb2AuthSoft (401 khi WEB2_AUTH_ENFORCE=1). Trước đây route tiền/tồn này
// hoàn toàn KHÔNG auth → bất kỳ ai biết worker URL đều tạo/huỷ/xác nhận PBH + trừ
// kho. Client đã gửi x-web2-token (deploy trước). GET (đọc) vẫn mở.
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

// Postgres unique_violation error code — dùng để retry khi sinh số PBH trùng
// (2 request đồng thời cùng tính ra cùng 1 number → 1 INSERT thắng, cái còn lại
// nhận 23505 → recompute number + thử lại). Xem _isUniqueViolation + retry loops.
const PG_UNIQUE_VIOLATION = '23505';
const MAX_NUMBER_RETRIES = 5;
function _isUniqueViolation(err) {
    return err && err.code === PG_UNIQUE_VIOLATION;
}

// 2026-06-04: trừ ví khách khi tạo PBH (thu hộ). Trừ min(số dư ví, COD còn lại),
// ghi wallet_deducted để hoàn khi huỷ. Best-effort: lỗi ví KHÔNG chặn tạo PBH.
// Trả { deducted, residualAfter } để cập nhật PBH + native order.
// MED-9 NOTE (2026-06-18): GIỮ module-private — KHÔNG export ra router. Hàm đọc
// balance qua getWallet (không lock) rồi processWithdraw (lock FOR UPDATE + chặn
// "Số dư không đủ") → 2 call đồng thời KHÔNG over-deduct (call sau bị reject, catch
// nuốt). Idempotency cấp PBH do unique PBH number. Nếu cần dùng ngoài file → đi qua
// applyWalletToUnpaidPbhs (wrapper transaction + SKIP LOCKED), đừng export hàm này.
// refId: idempotency key của LẦN trừ này. Lúc TẠO PBH dùng bare pbh.number (trừ 1
// lần, retry create-endpoint không double-trừ). Khi ÁP LẠI ví sau (deposit về →
// applyWalletToUnpaidPbhs) caller PHẢI truyền refId UNIQUE → là lần trừ MỚI THẬT
// (không bị dedupe nuốt = ghi khống wallet_deducted → over-mint lúc huỷ refund).
async function _applyWalletToPbh(pool, phone, pbhRow, performedBy, refId) {
    const out = { deducted: 0, residualAfter: Number(pbhRow.residual || 0) };
    if (!phone || out.residualAfter <= 0) return out;
    try {
        const wallet = await web2WalletService.getWallet(pool, phone);
        const balance = wallet ? Number(wallet.balance) || 0 : 0;
        const deduct = Math.min(balance, out.residualAfter);
        if (deduct <= 0) return out;
        const wr = await web2WalletService.processWithdraw(
            pool,
            phone,
            deduct,
            'native-order-pbh',
            refId || pbhRow.number,
            `Thu hộ PBH ${pbhRow.number}`,
            performedBy || '(tạo PBH)' // performed_by — audit ai trừ ví
        );
        // FIX audit R2 (HIGH over-mint): nếu processWithdraw bị DEDUPE (alreadyProcessed)
        // → ví KHÔNG bị trừ thật → KHÔNG ghi nhận deducted (giữ 0). Trước đây bỏ qua cờ
        // này → caller += wallet_deducted = khống → huỷ PBH refund quá tay = mint ví.
        if (wr && wr.alreadyProcessed) return out;
        out.deducted = deduct;
        out.residualAfter = out.residualAfter - deduct;
    } catch (e) {
        console.warn('[FAST-SALE-ORDERS] wallet deduct skip:', e.message);
    }
    return out;
}

// 2026-06-06: Áp số dư ví (theo SĐT) vào các PBH CHƯA trả của khách. Dùng khi
// tiền CK về SAU lúc tạo PBH (tạo lúc ví trống → residual = nguyên đơn; CK về →
// tự trừ tiếp → đơn thành "đã thanh toán"). Reuse _applyWalletToPbh (trừ
// min(ví, residual) → TRẢ GÓP nếu thiếu). Ưu tiên PBH campaign MỚI NHẤT trước
// (date_created DESC), hết ví thì dừng. An toàn: bounded bởi residual + balance
// → chạy lại chỉ áp phần dư (không trừ quá / không cộng-trùng). performed_by audit.
// Trả { appliedCount, totalDeducted, codes[] }. Best-effort (catch — KHÔNG ném).
async function applyWalletToUnpaidPbhs(pool, phone, performedBy) {
    const result = { appliedCount: 0, totalDeducted: 0, codes: [] };
    if (!pool || !phone) return result;
    try {
        // HIGH RACE FIX (2026-06-10): bọc read-list + loop trừ ví trong 1 transaction
        // và lock list PBH cần áp ví bằng FOR UPDATE SKIP LOCKED. 2 deposit SePay gần
        // nhau cùng SĐT → cái đầu giữ row lock các PBH chưa trả; cái sau SKIP LOCKED
        // chỉ thấy PBH chưa bị lock → KHÔNG double-apply ví. Wallet FOR UPDATE bên
        // trong processWithdraw cũng nằm trong cùng client → serialize chặt số dư.
        await withTransaction(pool, async (client) => {
            const { rows } = await client.query(
                `SELECT id, number, source_type, source_code, residual, partner_name
                 FROM fast_sale_orders
                 WHERE partner_phone = $1 AND state <> 'cancel' AND COALESCE(residual,0) > 0
                 ORDER BY date_created DESC NULLS LAST
                 FOR UPDATE SKIP LOCKED`,
                [phone]
            );
            let _reapplyIdx = 0;
            for (const pbh of rows) {
                const wallet = await web2WalletService.getWallet(client, phone);
                if (!wallet || Number(wallet.balance) <= 0) break; // hết ví → dừng
                // refId UNIQUE per lần áp (KHÁC bare number của lần trừ lúc tạo PBH) →
                // là lần trừ MỚI THẬT, không bị dedupe nuốt. Bounded an toàn bởi
                // balance + residual (FOR UPDATE) nên chạy lại chỉ áp phần dư.
                const wlt = await _applyWalletToPbh(
                    client,
                    phone,
                    pbh,
                    performedBy || '(CK tự thanh toán)',
                    `${pbh.number}:reapply:${Date.now()}-${_reapplyIdx++}`
                );
                if (wlt.deducted > 0) {
                    await client.query(
                        `UPDATE fast_sale_orders
                         SET payment_amount = COALESCE(payment_amount,0) + $1,
                             residual = $2,
                             cash_on_delivery = $2,
                             wallet_deducted = COALESCE(wallet_deducted,0) + $1,
                             date_updated = NOW()
                         WHERE id = $3`,
                        [wlt.deducted, wlt.residualAfter, pbh.id]
                    );
                    result.appliedCount++;
                    result.totalDeducted += wlt.deducted;
                    result.codes.push({
                        number: pbh.number,
                        source_code: pbh.source_code,
                        deducted: wlt.deducted,
                        residual: wlt.residualAfter,
                    });
                }
            }
        });
        if (result.totalDeducted > 0) {
            console.log(
                `[FAST-SALE-ORDERS] applyWalletToUnpaidPbhs ${phone}: ${result.appliedCount} PBH, -${result.totalDeducted}đ`
            );
            if (_notifyClients) {
                const digits = String(phone).replace(/\D/g, '');
                try {
                    _notifyClients(
                        'web2:fast-sale-orders',
                        { action: 'wallet-applied', phone, ts: Date.now() },
                        'update'
                    );
                    _notifyClients(
                        'web2:native-orders',
                        { action: 'wallet-applied', phone, ts: Date.now() },
                        'update'
                    );
                    _notifyClients(
                        `web2:wallet:${digits}`,
                        { action: 'pbh-deduct', phone, ts: Date.now() },
                        'update'
                    );
                    _notifyClients(
                        'web2:customer-wallet',
                        { action: 'deduct', phone, ts: Date.now() },
                        'update'
                    );
                } catch (e) {
                    /* ignore */
                }
            }
        }
    } catch (e) {
        console.warn('[FAST-SALE-ORDERS] applyWalletToUnpaidPbhs failed:', e.message);
    }
    return result;
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
const { lookupCustomerIdByPhone } = require('../services/web2-order-customer-service'); // web2_customers (web2Db)

// -----------------------------------------------------
// Schema + auto-migrate
// -----------------------------------------------------
const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    // MIGRATION (ĐẶT ĐẦU): DROP crm_team_id + crm_team_name — di tích hệ cũ,
    // không consumer nào đọc (xác nhận 2026-06-12); sau khi tách độc lập giá trị nhét
    // vào là FB Page Id (15 chữ số) trùng lặp fb_page_id và từng tràn INT4
    // gây 500. Page của PBH đọc từ đơn nguồn (fb_page_id/fb_page_name).
    // + ADD updated_at: cascade snapshot SP (web2-products PATCH, 8d89d1c06)
    // và migration 078 ghi cột này nhưng schema CHƯA TỪNG có → edit SP 500
    // "column updated_at does not exist" (lộ ra sau khi H13 đổi cascade từ
    // nuốt-lỗi sang throw — bug user báo 2026-06-12).
    try {
        await pool.query(
            `ALTER TABLE IF EXISTS fast_sale_orders ADD COLUMN IF NOT EXISTS updated_at BIGINT;
             ALTER TABLE IF EXISTS fast_sale_orders DROP COLUMN IF EXISTS crm_team_id;
             ALTER TABLE IF EXISTS fast_sale_orders DROP COLUMN IF EXISTS crm_team_name;`
        );
    } catch (e) {
        console.warn('[FAST-SALE-ORDERS] migrate head warn:', e.message);
    }
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

            -- [2026-06-23] returned_line_qty {productCode: qty} — SL của TỪNG SP đã
            -- được THU VỀ 1 PHẦN (thu_ve_1_phan) khi PBH còn sống. restockOrderLines
            -- trừ phần này khỏi qty restock lúc cancel → SP đã trả KHÔNG bị cộng kho
            -- 2 lần (1 lần lúc tạo phiếu trả + 1 lần lúc cancel PBH). Browser-test
            -- CROSS-FLOW 2 bắt: trả 1/2 → cancel → kho 50→51 (+1 ảo).
            ALTER TABLE fast_sale_orders
                ADD COLUMN IF NOT EXISTS returned_line_qty JSONB NOT NULL DEFAULT '{}'::jsonb;

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
        _ensuredPools.add(pool);
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
    // [2026-06-23] SP đã thu về 1 phần (thu_ve_1_phan) khi PBH còn sống ĐÃ được cộng
    // kho lúc tạo phiếu trả → trừ khỏi qty restock để KHÔNG cộng 2 lần (over-restock).
    const returnedMap =
        orderRow.returned_line_qty && typeof orderRow.returned_line_qty === 'object'
            ? orderRow.returned_line_qty
            : {};
    // FIX audit #9: GỘP qty theo CODE TRƯỚC, rồi mới trừ returned_line_qty[code] ĐÚNG 1 LẦN.
    // Trước đây trừ per-LINE → PBH có 2 dòng cùng mã (vd dòng bán + dòng returnLine append
    // từ native) bị trừ returned 2 lần → under-restock (tồn rò rỉ khi hủy PBH).
    const needByCode = new Map();
    for (const line of lines) {
        const code = line.productCode || line.product_code || line.code;
        const qty = Number(line.quantity || line.qty || 0);
        if (!code || qty <= 0) continue;
        needByCode.set(code, (needByCode.get(code) || 0) + qty);
    }
    for (const [code, totalQty] of needByCode) {
        const alreadyReturned = Number(returnedMap[code]) || 0;
        const restockQty = Math.max(0, totalQty - alreadyReturned);
        if (restockQty <= 0) continue;
        // HỦY PBH → hoàn kho. Nếu SP đã bị đánh HẾT HÀNG do bán hết trước đó, có tồn
        // lại → un-retire: status về DANG_BAN/MUA_1_PHAN + is_active=true (logic mới
        // 2026-06-28). CHỈ đụng status='HET_HANG' → KHÔNG ghi đè SP user tự "Tạm dừng"
        // (is_active=false nhưng status≠HET_HANG). CASE đọc giá trị TRƯỚC update.
        await pool.query(
            `UPDATE web2_products
                SET stock = stock + $1,
                    status = CASE WHEN status = 'HET_HANG' AND stock + $1 > 0
                                  THEN (CASE WHEN COALESCE(pending_qty, 0) > 0 THEN 'MUA_1_PHAN' ELSE 'DANG_BAN' END)
                                  ELSE status END,
                    is_active = CASE WHEN status = 'HET_HANG' AND stock + $1 > 0 THEN true ELSE is_active END,
                    updated_at = $2
              WHERE code = $3`,
            [restockQty, now, code]
        );
        items.push({ code, qty: restockQty });
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
router.post('/backfill-customer-links', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`
            UPDATE fast_sale_orders AS o
            SET customer_id = c.id
            FROM web2_customers AS c
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
// CHỈ dùng cho bulk-confirm. Bulk-cancel có handler riêng (C1 fix 2026-06-11):
// cancel hàng loạt PHẢI restock + hoàn ví + sync native từng PBH như /cancel
// đơn lẻ — UPDATE state trần làm mất tồn + mất tiền ví.
async function _bulkStateChange(req, res, newState) {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const numbers = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
        if (!numbers.length) return res.status(400).json({ error: 'numbers required' });

        // Guard: confirm only from draft
        const allowedSource = newState === 'done' ? `state = 'draft'` : `state != 'cancel'`;
        const r = await pool.query(
            `UPDATE fast_sale_orders SET state = $1, date_updated = NOW()
             WHERE number = ANY($2::text[]) AND ${allowedSource}
             RETURNING *`,
            [newState, numbers]
        );
        const orders = r.rows.map(mapRow);
        // FIX audit R2 (#6): bulk-confirm (done) ĐỒNG BỘ native_orders như /confirm đơn lẻ.
        // Trước đây thiếu → nếu bật lại nút bulk, đơn web linked không cập nhật trạng thái.
        if (newState === 'done') {
            for (const row of r.rows) {
                try {
                    const sr = await syncNativeOrderStatusFromPbh(pool, row, 'done');
                    if (sr.synced && _notifyClients) {
                        try {
                            _notifyClients(
                                'web2:native-orders',
                                { action: 'bulk-confirm-sync', pbh: row.number, ts: Date.now() },
                                'update'
                            );
                        } catch (e) {}
                    }
                } catch (e) {
                    console.warn('[FAST-SALE-ORDERS] bulk-confirm native sync skip:', e.message);
                }
            }
        }
        // 3W4: WS broadcast đã gỡ — SSE _notify bên dưới là kênh realtime duy nhất.
        if (orders.length) _notify(newState === 'done' ? 'bulk-confirm' : 'bulk-cancel', null);
        res.json({ success: true, changed: orders.length, requested: numbers.length, orders });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
router.post('/bulk-confirm', requireWeb2AuthSoft, (req, res) => _bulkStateChange(req, res, 'done'));

// C1 CRITICAL FIX (2026-06-11): bulk-cancel xử lý TỪNG PBH như /:number/cancel.
// Trước đây chỉ UPDATE state='cancel' hàng loạt → KHÔNG restock, KHÔNG hoàn ví,
// KHÔNG sync native; và vì state đã thành 'cancel' nên /cancel đơn lẻ sau đó
// (guard state !== 'cancel') không bao giờ restock nữa → mất tồn + mất tiền ví.
// Giờ: mỗi PBH 1 transaction (lock FOR UPDATE → restock + hoàn wallet_deducted
// + set state) qua _cancelPbhInTx (dùng chung với /cancel). Trả kết quả per-number.
router.post('/bulk-cancel', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const numbers = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
        if (!numbers.length) return res.status(400).json({ error: 'numbers required' });
        const user = _extractPbhUser(req);
        const performedBy = user.name || user.id || '(bulk huỷ PBH)';
        const orders = [];
        const results = [];
        let restockedAny = false;
        for (const number of numbers) {
            try {
                const tx = await withTransaction(pool, (client) =>
                    _cancelPbhInTx(client, number, performedBy)
                );
                if (tx.notFound) {
                    results.push({ number, success: false, error: 'Not found' });
                    continue;
                }
                if (tx.wasNotCancelled) {
                    orders.push(mapRow(tx.updRow));
                    if (tx.restock?.restored > 0) restockedAny = true;
                    // Post-commit side-effects — giống /:number/cancel.
                    const nativeSync = await syncNativeOrderStatusFromPbh(
                        pool,
                        tx.prevRow,
                        'cancel'
                    );
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
                    if (tx.walletRefunded > 0 && _notifyClients && tx.prevRow.partner_phone) {
                        try {
                            _notifyClients(
                                `web2:wallet:${String(tx.prevRow.partner_phone).replace(/\D/g, '')}`,
                                {
                                    action: 'pbh-cancel-refund',
                                    phone: tx.prevRow.partner_phone,
                                    ts: Date.now(),
                                },
                                'update'
                            );
                        } catch {}
                    }
                    await _logPbhHistory(
                        pool,
                        number,
                        'cancel',
                        {
                            prevState: tx.prevRow.state,
                            restoredLines: tx.restock?.restored || 0,
                            walletRefunded: tx.walletRefunded || 0,
                            nativeSync: nativeSync?.codes || null,
                            bulk: true,
                        },
                        user,
                        _extractPbhSourcePage(req) || 'fastsaleorder-invoice'
                    );
                    _emitRevokeKpi(pool, tx.prevRow.source_code || null, req).catch((e) =>
                        console.warn(
                            '[FAST-SALE-ORDERS] KPI revoke (bulk-cancel) failed:',
                            e.message
                        )
                    );
                }
                results.push({
                    number,
                    success: true,
                    skipped: !tx.wasNotCancelled,
                    restocked: tx.restock?.restored || 0,
                    walletRefunded: tx.walletRefunded || 0,
                });
            } catch (e) {
                results.push({ number, success: false, error: e.message });
            }
        }
        if (restockedAny && _notifyClients) {
            try {
                _notifyClients(
                    'web2:products',
                    { action: 'pbh-cancel-restock', code: null, ts: Date.now() },
                    'update'
                );
            } catch {}
        }
        // 3W4: WS broadcast đã gỡ — SSE _notify là kênh realtime duy nhất.
        if (orders.length) _notify('bulk-cancel', null);
        res.json({
            success: true,
            changed: orders.length,
            requested: numbers.length,
            orders,
            results,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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
router.post('/merge', requireWeb2AuthSoft, async (req, res) => {
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

        // Fetch all source PBHs.
        // 3H1 FIX (2026-06-12): FOR UPDATE — serialize với /cancel|/bulk-cancel|DELETE
        // (đều lock FOR UPDATE). Cancel commit trước → SELECT này thấy state='cancel'
        // tươi → reject 400 bên dưới; merge lock trước → cancel chờ tới khi merge
        // commit (row nguồn đã bị DELETE → cancel thành notFound). Hết cảnh đơn vừa
        // huỷ + restock vẫn chui vào PBH gộp làm tồn kho dôi.
        const placeholders = numbers.map((_, i) => `$${i + 1}`).join(',');
        const src = await client.query(
            `SELECT * FROM fast_sale_orders WHERE number IN (${placeholders}) FOR UPDATE`,
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
        // 3C1 FIX (2026-06-12): carry tiền từ PBH nguồn sang PBH gộp. Trước đây
        // INSERT bỏ 5 cột này → rơi về DEFAULT 0: wallet_deducted của nguồn biến
        // mất vĩnh viễn (DELETE raw không hoàn, cancel PBH gộp hoàn 0đ) và
        // residual/COD về 0 → mất khoản phải thu. Cộng dồn từng cột — mỗi row
        // nguồn tự giữ invariant residual của nó nên tổng vẫn đúng.
        let totalPayment = 0;
        let totalDeposit = 0;
        let totalResidual = 0;
        let totalCod = 0;
        let totalWalletDeducted = 0;
        for (const r of sortedRows) {
            const lines = Array.isArray(r.order_lines) ? r.order_lines : [];
            combinedLines.push(...lines);
            totalQty += Number(r.total_quantity) || 0;
            totalUntaxed += Number(r.amount_untaxed) || 0;
            totalDiscount += Number(r.amount_discount) || 0;
            totalAmount += Number(r.amount_total) || 0;
            totalShipping += Number(r.delivery_price) || 0;
            totalPayment += Number(r.payment_amount) || 0;
            totalDeposit += Number(r.deposit) || 0;
            totalResidual += Number(r.residual) || 0;
            totalCod += Number(r.cash_on_delivery) || 0;
            totalWalletDeducted += Number(r.wallet_deducted) || 0;
        }
        // BUG FIX (2026-06-24): gộp 2 PBH cùng productCode trước đây để order_lines
        // có DÒNG TRÙNG mã → reconcile (1-bucket/mã, cap theo dòng ĐẦU) không đóng gói
        // được + restockOrderLines trừ returnedMap[code] LẶP mỗi dòng. Dedupe theo mã:
        // cộng dồn quantity + discountAmount, dòng KHÔNG mã (phí ship/free) giữ riêng.
        // Totals tiền là row-level (cộng ở trên) nên line-money chỉ để hiển thị.
        const _lineByCode = new Map();
        const combinedLinesDeduped = [];
        for (const ln of combinedLines) {
            const code = ln && (ln.productCode || ln.code);
            if (!code) {
                combinedLinesDeduped.push(ln);
                continue;
            }
            const key = String(code).trim().toLowerCase();
            const ex = _lineByCode.get(key);
            if (ex) {
                ex.quantity = (Number(ex.quantity) || 0) + (Number(ln.quantity) || 0);
                ex.discountAmount =
                    (Number(ex.discountAmount) || 0) + (Number(ln.discountAmount) || 0);
            } else {
                const copy = { ...ln };
                _lineByCode.set(key, copy);
                combinedLinesDeduped.push(copy);
            }
        }
        const mergedStts = sortedRows.map((r) => Number(r.display_stt) || 0).filter(Boolean);
        const mergedSourceCode = sortedRows.map((r) => r.number).join('+');
        const combinedComment = sortedRows
            .map((r) => (r.comment ? `[${r.number}] ${r.comment}` : null))
            .filter(Boolean)
            .join('\n---\n');

        // Generate new PBH number + INSERT với retry-on-unique-violation.
        // MEDIUM RACE FIX (2026-06-10): COUNT(*) sinh số không atomic — 2 merge
        // đồng thời cùng ngày tính ra cùng newNumber → UNIQUE violation. Mỗi lần
        // thử dùng SAVEPOINT để statement lỗi không abort cả transaction merge;
        // 23505 → recompute COUNT + thử số kế tiếp (≤ MAX_NUMBER_RETRIES lần).
        const today = new Date();
        const ymd = `${today.getFullYear()}${pad(today.getMonth() + 1, 2)}${pad(today.getDate(), 2)}`;
        let ins = null;
        let lastErr = null;
        for (let attempt = 0; attempt < MAX_NUMBER_RETRIES; attempt++) {
            const todayCountQ = await client.query(
                `SELECT COUNT(*)::int AS n FROM fast_sale_orders WHERE number LIKE $1`,
                [`NJ-${ymd}-%`]
            );
            const nextSeq = pad(todayCountQ.rows[0].n + 1 + attempt, 4);
            const newNumber = `NJ-${ymd}-${nextSeq}`;
            await client.query('SAVEPOINT merge_insert');
            try {
                ins = await client.query(
                    `INSERT INTO fast_sale_orders (
                        number, display_stt, source,
                        partner_id, partner_code, partner_name, partner_phone, partner_address, partner_email,
                        city_code, city_name, district_code, district_name, ward_code, ward_name,
                        order_lines, total_quantity, amount_untaxed, amount_discount, amount_total,
                        delivery_price, carrier_id, carrier_name,
                        state, source_type, source_code, merged_display_stt,
                        live_campaign_id, live_campaign_name, customer_id, comment,
                        payment_amount, deposit, residual, cash_on_delivery, wallet_deducted
                    ) VALUES (
                        $1, nextval('fast_sale_orders_display_stt_seq'), 'NATIVE_WEB',
                        $2, $3, $4, $5, $6, $7,
                        $8, $9, $10, $11, $12, $13,
                        $14, $15, $16, $17, $18,
                        $19, $20, $21,
                        'draft', 'merged', $22, $23,
                        $24, $25, $26, $27,
                        $28, $29, $30, $31, $32
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
                        JSON.stringify(combinedLinesDeduped),
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
                        totalPayment,
                        totalDeposit,
                        totalResidual,
                        totalCod,
                        totalWalletDeducted,
                    ]
                );
                await client.query('RELEASE SAVEPOINT merge_insert');
                break;
            } catch (insErr) {
                await client.query('ROLLBACK TO SAVEPOINT merge_insert');
                if (_isUniqueViolation(insErr)) {
                    lastErr = insErr;
                    continue; // số trùng — thử số kế tiếp
                }
                throw insErr;
            }
        }
        if (!ins) {
            throw lastErr || new Error('Không sinh được số PBH gộp (race retry exhausted)');
        }

        // Delete source PBHs
        await client.query(
            `DELETE FROM fast_sale_orders WHERE number IN (${placeholders})`,
            numbers
        );

        await client.query('COMMIT');
        const newOrder = mapRow(ins.rows[0]);
        // 3W4: WS broadcast đã gỡ — SSE _notify là kênh realtime duy nhất.
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
// GET /batch?numbers=NJ-1,NJ-2 — full detail nhiều PBH trong 1 query (chống N+1
// khi in nhiều PBH, bulkPrint). PHẢI đặt TRƯỚC /:number (nếu không 'batch' bị
// match như :number). Trả { success, orders: [...] }.
// -----------------------------------------------------
router.get('/batch', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const numbers = String(req.query.numbers || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 200);
        if (!numbers.length) return res.json({ success: true, orders: [] });
        const r = await pool.query('SELECT * FROM fast_sale_orders WHERE number = ANY($1)', [
            numbers,
        ]);
        res.json({ success: true, orders: r.rows.map(mapRow) });
    } catch (e) {
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
// POST / — manual create  (VÔ HIỆU HOÁ 2026-06-23)
// -----------------------------------------------------
// 1 NGUỒN TẠO PBH DUY NHẤT = trang Đơn Web (native-orders) qua /from-native-order
// (user chốt: "chỉ cho 1 nguồn tạo PBH là ở native-orders thôi"). Tạo tay trực tiếp
// đã bị gỡ để tránh PBH mồ côi không gắn Đơn Web. Trả 410 (giống /refunds/from-pbh).
// Code cũ giữ lại bên dưới (unreachable) để tham chiếu logic stock/wallet nếu cần.
router.post('/', requireWeb2AuthSoft, async (req, res) => {
    return res.status(410).json({
        error: 'manual_create_disabled',
        message: 'Tạo PBH thủ công đã bị gỡ. Tạo PBH từ trang Đơn Web (native-orders).',
    });
    /* eslint-disable no-unreachable */
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.partnerPhone && !b.partnerName) {
            return res.status(400).json({ error: 'partnerPhone or partnerName required' });
        }
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

        // MEDIUM RACE FIX (2026-06-10): nextNumber() không atomic — 2 manual create
        // đồng thời cùng ngày sinh cùng number → UNIQUE violation. Retry: nếu INSERT
        // nhận 23505, recompute nextNumber() rồi thử lại (≤ MAX_NUMBER_RETRIES lần).
        // H3 HIGH FIX (2026-06-11): INSERT PBH + trừ stock web2_products PHẢI atomic
        // (giống nhánh from-native-order). Trước đây INSERT pool.query rời rồi loop
        // UPDATE stock best-effort (lỗi nuốt warn) — crash/lỗi giữa = PBH có nhưng
        // stock chưa trừ. Giờ gộp cả 2 vào 1 withTransaction: COMMIT/ROLLBACK cùng nhau.
        let r = null;
        let lastErr = null;
        for (let attempt = 0; attempt < MAX_NUMBER_RETRIES; attempt++) {
            const number = await nextNumber(pool);
            try {
                r = await withTransaction(pool, async (client) => {
                    // audit d-fix #5 (2026-06-21): re-check tồn DƯỚI advisory lock theo MÃ
                    // SP bên TRONG transaction — giống nhánh from-native-order. validateStock
                    // ngoài txn (line ~1331) KHÔNG serialize 2 manual create cùng 1 SP → cả 2
                    // qua check rồi cùng trừ → GREATEST(0,...) nuốt âm = OVER-SELL thầm lặng.
                    // Khoá theo code (sort tránh deadlock) + so tổng cần với tồn tươi.
                    if (b.force !== true) {
                        const needMap = new Map();
                        for (const line of lines) {
                            const c = line.productCode || line.product_code;
                            const q = Number(line.quantity || line.qty) || 0;
                            if (!c || q <= 0) continue;
                            needMap.set(c, (needMap.get(c) || 0) + q);
                        }
                        const sortedCodes = [...needMap.keys()].sort();
                        for (const c of sortedCodes) {
                            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                                'web2_product_stock:' + c,
                            ]);
                        }
                        if (sortedCodes.length) {
                            const sres = await client.query(
                                `SELECT code, stock FROM web2_products WHERE code = ANY($1::text[])`,
                                [sortedCodes]
                            );
                            const sMap = new Map(
                                sres.rows.map((row) => [row.code, Number(row.stock) || 0])
                            );
                            const viol = [];
                            for (const [c, reqd] of needMap) {
                                const avail = sMap.has(c) ? sMap.get(c) : 0;
                                if (reqd > avail)
                                    viol.push({ code: c, requested: reqd, available: avail });
                            }
                            if (viol.length) {
                                const err = new Error('over_sell');
                                err.__overSell = viol;
                                throw err;
                            }
                        }
                    }
                    const insRes = await client.query(
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
                        assigned_user_id, assigned_user_name,
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
                        $42, $43,
                        $44, $45::jsonb, $46, $47,
                        $48
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
                            b.assignedUserId || null,
                            b.assignedUserName || null,
                            b.comment || null,
                            JSON.stringify(b.tags || []),
                            b.createdBy || null,
                            b.createdByName || null,
                            customerId,
                        ]
                    );
                    // Trừ stock TRONG cùng transaction với INSERT PBH → atomic
                    // (same logic as /from-native-order). Clamp tại 0. Lỗi →
                    // ROLLBACK cả PBH (không còn nuốt warn để lệch tồn).
                    const stockNow = Date.now();
                    for (const line of lines) {
                        const code = line.productCode || line.product_code;
                        const qty = Number(line.quantity || line.qty) || 0;
                        if (!code || qty <= 0) continue;
                        await client.query(
                            `UPDATE web2_products
                             SET stock = GREATEST(0, stock - $1), updated_at = $2
                             WHERE code = $3`,
                            [qty, stockNow, code]
                        );
                    }
                    return insRes;
                });
                break; // transaction commit OK → thoát retry loop
            } catch (insErr) {
                if (_isUniqueViolation(insErr)) {
                    lastErr = insErr;
                    continue; // number trùng — recompute + thử lại
                }
                throw insErr;
            }
        }
        if (!r) {
            throw lastErr || new Error('Không sinh được số PBH (race retry exhausted)');
        }

        // 2026-06-09: Trừ ví dư (theo SĐT) vào PBH vừa tạo NGAY — không chờ CK mới.
        // KH có số dư ví sẵn → PBH tạo tay tự "đã thanh toán" phần ví phủ được.
        // Best-effort, idempotent theo PBH number (wallet_deducted). KHÔNG chặn tạo PBH.
        if (b.partnerPhone && b.state !== 'cancel') {
            try {
                const wlt = await _applyWalletToPbh(
                    pool,
                    b.partnerPhone,
                    r.rows[0],
                    b.createdByName || b.createdBy || '(ví dư tự trừ khi tạo PBH)'
                );
                if (wlt.deducted > 0) {
                    const upd = await pool.query(
                        `UPDATE fast_sale_orders
                         SET payment_amount = COALESCE(payment_amount,0) + $1,
                             residual = $2,
                             cash_on_delivery = $2,
                             wallet_deducted = COALESCE(wallet_deducted,0) + $1,
                             date_updated = NOW()
                         WHERE id = $3 RETURNING *`,
                        [wlt.deducted, wlt.residualAfter, r.rows[0].id]
                    );
                    if (upd.rows[0]) r.rows[0] = upd.rows[0];
                    if (_notifyClients) {
                        try {
                            _notifyClients(
                                `web2:wallet:${String(b.partnerPhone).replace(/\D/g, '')}`,
                                { action: 'pbh-deduct', phone: b.partnerPhone, ts: Date.now() },
                                'update'
                            );
                        } catch {}
                    }
                }
            } catch (e) {
                console.warn('[FAST-SALE-ORDERS] manual create wallet deduct skip:', e.message);
            }
        }

        const o = mapRow(r.rows[0]);
        // 3W4: WS broadcast đã gỡ — SSE _notify là kênh realtime duy nhất.
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
        // audit d-fix #5: over_sell từ recheck dưới lock → 400 (client xử lý
        // data.error==='over_sell' + violations), không phải 500.
        if (e && e.__overSell) {
            return res.status(400).json({
                error: 'over_sell',
                message: 'Tạo PBH thất bại: số lượng vượt tồn kho ở 1 hoặc nhiều SP',
                violations: e.__overSell,
            });
        }
        console.error('[FAST-SALE-ORDERS] create error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /from-native-order — convert NativeOrder → PBH
// Body: { nativeOrderCode, dateInvoice?, deliveryPrice?, deposit?, ...overrides }
// -----------------------------------------------------
router.post('/from-native-order', requireWeb2AuthSoft, async (req, res) => {
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
        // BUG FIX (2026-06-24): đơn ĐÃ nằm trong PBH GỘP (merge-to-pbh) có source_id=NULL
        // (merged PBH spans nhiều member) nên existsQ theo source_id KHÔNG thấy → trước
        // đây tạo PBH thứ 2 = double trừ kho + double trừ ví (stale-tab/direct-API).
        // Bắt theo source_code membership giống cancel route (native-orders.js:119-122).
        // FIX audit R2 (#4): chạy CẢ khi split=true (chỉ bỏ qua khi src đã 'cancelled' =
        // re-PBH sau huỷ). Trước đây `&& !splitMode` → split=true bỏ qua guard → member
        // của PBH gộp mint được PBH riêng = double trừ kho + ví.
        if (existingPbhs.length === 0 && src.status !== 'cancelled') {
            const mergedQ = await pool.query(
                `SELECT * FROM fast_sale_orders
                 WHERE source_type = 'native_order' AND state <> 'cancel'
                   AND (source_code = $1 OR source_code LIKE $2
                        OR source_code LIKE $3 OR source_code LIKE $4)
                 ORDER BY split_index ASC, date_created ASC LIMIT 1`,
                [src.code, `${src.code}+%`, `%+${src.code}+%`, `%+${src.code}`]
            );
            if (mergedQ.rows.length) {
                return res.json({
                    success: true,
                    order: mapRow(mergedQ.rows[0]),
                    idempotent: true,
                    note: 'Đơn đã nằm trong PBH gộp — không tạo PBH riêng.',
                });
            }
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
        // 2026-06-21: CHẶN PBH khi đơn có SP "chờ hàng" (web2_products.status='CHO_MUA').
        // User rule: đơn chứa SP chờ hàng → KHÔNG tạo được PBH, phải tạo Phiếu soạn hàng.
        // Defense-in-depth (frontend cũng chặn qua o.hasChoHang). Chỉ check dòng BÁN
        // (lines hiện tại, TRƯỚC khi append returnLines 0đ). force=true bỏ qua (giống stock).
        if (b.force !== true) {
            const saleCodes = [...new Set(lines.map((l) => l.productCode).filter(Boolean))];
            if (saleCodes.length) {
                const chQ = await pool.query(
                    `SELECT code FROM web2_products WHERE code = ANY($1::text[]) AND status = 'CHO_MUA'`,
                    [saleCodes]
                );
                if (chQ.rows.length) {
                    return res.status(400).json({
                        error: 'cho_hang_blocked',
                        message:
                            'Đơn có sản phẩm chờ hàng — không tạo được PBH. Hãy tạo Phiếu soạn hàng.',
                        choHangCodes: chQ.rows.map((r) => r.code),
                    });
                }
            }
        }
        // 2026-06-06: THU VỀ 1 PHẦN — SP khách đã thu về (web2_returns, bill_status
        // 'queued') lên bill này với giá 0đ (đổi/bù trừ). Frontend native-orders
        // truyền b.returnLines [{productCode, productName, quantity}] + b.returnCodes.
        // Append vào lines TRƯỚC stock guard → vẫn validate + trừ kho như dòng bán
        // bình thường (hàng đã thu về kho nên đủ tồn; net 0 = exchange). Additive:
        // không có returnLines → flow cũ y nguyên.
        const returnLines = Array.isArray(b.returnLines) ? b.returnLines : [];
        let _rpos = lines.length;
        for (const rl of returnLines) {
            const q = Number(rl.quantity || rl.qty || 0);
            if (!rl.productCode || q <= 0) continue;
            _rpos += 1;
            lines.push({
                position: _rpos,
                productId: null,
                productCode: rl.productCode,
                productName: rl.productName || rl.name || null,
                uomId: null,
                uomName: null,
                quantity: q,
                priceUnit: 0,
                discount: 0,
                discountAmount: 0,
                imageUrl: null,
                note: 'Thu về 0đ',
            });
        }
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

        // MEDIUM FIX (2026-06-10): INSERT PBH + trừ stock web2_products PHẢI atomic.
        // Trước đây INSERT bằng pool.query rồi MỚI loop UPDATE stock (best-effort) —
        // crash giữa = PBH có nhưng stock chưa trừ. Giờ gộp cả 2 vào 1 withTransaction:
        // COMMIT cùng nhau hoặc ROLLBACK cùng nhau. Kèm retry-on-unique-violation cho
        // number (split re-issue / 2 request đồng thời cùng native-order có thể trùng).
        let r = null;
        {
            let insertNumber = number;
            let lockedSplitIndex = splitIndex;
            let lastErr = null;
            for (let attempt = 0; attempt < MAX_NUMBER_RETRIES; attempt++) {
                try {
                    r = await withTransaction(pool, async (client) => {
                        // A1 (2026-06-13): advisory lock theo source_id → serialize các
                        // /from-native-order đồng thời cùng 1 native-order. Chống
                        // double-submit (double-click / 2 máy) tạo 2 PBH cho 1 đơn:
                        // request thứ 2 ĐỢI request 1 COMMIT, re-check thấy PBH đã có →
                        // trả idempotent thay vì INSERT thêm. (Trước đây check ngoài
                        // transaction → 2 request cùng thấy 0 PBH → cùng INSERT → request
                        // 2 dính 23505 number → bump suffix → thành 2 PBH trùng đơn.)
                        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                            `web2_pbh_src:${src.id}`,
                        ]);
                        if (attempt === 0) {
                            const sib = await client.query(
                                `SELECT * FROM fast_sale_orders
                                 WHERE source_type = 'native_order' AND source_id = $1
                                 ORDER BY split_index ASC, date_created ASC`,
                                [src.id]
                            );
                            if (sib.rows.length > 0 && !splitMode) {
                                return { __idempotent: true, rows: [sib.rows[0]] };
                            }
                            // Recompute splitIndex/number DƯỚI lock (fresh) — split đồng
                            // thời cũng được serialize → index liên tục, number không trùng.
                            lockedSplitIndex = sib.rows.length + 1;
                            insertNumber =
                                lockedSplitIndex === 1
                                    ? src.code
                                    : `${src.code}-${lockedSplitIndex}`;
                        }
                        // audit r6 L-fix (2026-06-21): re-check tồn DƯỚI lock theo MÃ SP
                        // bên TRONG transaction. advisory lock theo source_id KHÔNG
                        // serialize 2 PBH khác native-order cùng 1 SP → cả 2 qua
                        // validateStock (ngoài txn) rồi cùng trừ → GREATEST(0,...) nuốt
                        // âm = OVER-SELL thầm lặng. Khoá theo code (sort tránh deadlock)
                        // + so tổng cần với tồn tươi; thiếu → throw (force=true vẫn bypass).
                        if (b.force !== true) {
                            const needMap = new Map();
                            for (const line of lines) {
                                const c = line.productCode;
                                const q = Number(line.quantity) || 0;
                                if (!c || q <= 0) continue;
                                needMap.set(c, (needMap.get(c) || 0) + q);
                            }
                            const sortedCodes = [...needMap.keys()].sort();
                            for (const c of sortedCodes) {
                                await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                                    'web2_product_stock:' + c,
                                ]);
                            }
                            if (sortedCodes.length) {
                                const sres = await client.query(
                                    `SELECT code, stock FROM web2_products WHERE code = ANY($1::text[])`,
                                    [sortedCodes]
                                );
                                const sMap = new Map(
                                    sres.rows.map((row) => [row.code, Number(row.stock) || 0])
                                );
                                const viol = [];
                                for (const [c, reqd] of needMap) {
                                    const avail = sMap.has(c) ? sMap.get(c) : 0;
                                    if (reqd > avail)
                                        viol.push({ code: c, requested: reqd, available: avail });
                                }
                                if (viol.length) {
                                    const err = new Error('over_sell');
                                    err.__overSell = viol;
                                    throw err;
                                }
                            }
                        }
                        const insRes = await client.query(
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
                assigned_user_id, assigned_user_name,
                comment, tags, created_by, created_by_name,
                customer_id, split_index, carrier_name, channel
            ) VALUES (
                -- PBH display_stt = native_order.display_stt (giữ đồng bộ với
                -- bên native-orders). Hiển thị "{native.stt}-{split_index}"
                -- (vd 35-4 = PBH thứ 4 cho native STT 35). Trước đây dùng
                -- nextval('fast_sale_orders_display_stt_seq') → STT lệch.
                -- Fallback nextval nếu native không có display_stt (manual PBH).
                $1, COALESCE($42::integer, nextval('fast_sale_orders_display_stt_seq')), 'NATIVE_WEB',
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
                $34, $35,
                $36, $37::jsonb, $38, $39,
                $40, $41, $43, $44
            ) RETURNING *`,
                            [
                                insertNumber,
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
                                src.assigned_employee_id,
                                src.assigned_employee_name,
                                src.note,
                                JSON.stringify(src.tags || []),
                                b.createdBy || src.created_by,
                                b.createdByName || src.created_by_name,
                                customerId,
                                lockedSplitIndex,
                                src.display_stt || null, // $42 — sync STT từ native-order
                                b.carrierName || null, // $43 — phương thức giao (vd "PBH SHOP") → bill + badge
                                src.channel || null, // $44 — kênh đơn → bill "PBH INBOX" khi in từ trang PBH
                            ]
                        );
                        // Trừ stock TRONG cùng transaction với INSERT PBH → atomic.
                        // Clamp tại 0 nếu over-sell. Idempotent: route return sớm nếu
                        // PBH đã tồn tại (không split) nên chỉ deduct 1 lần lúc tạo mới.
                        const stockNow = Date.now();
                        for (const line of lines) {
                            const code = line.productCode;
                            const qty = Number(line.quantity) || 0;
                            if (!code || qty <= 0) continue;
                            // BÁN HẾT → HẾT HÀNG (logic mới 2026-06-28): tồn về 0 +
                            // hết hàng chờ → HET_HANG + is_active=false (tự ẩn Kho SP +
                            // bảng live; còn ở gợi ý Số Order để nhập lại).
                            await client.query(
                                `UPDATE web2_products
                                 SET stock = GREATEST(0, stock - $1),
                                     status = CASE WHEN GREATEST(0, stock - $1) = 0 AND COALESCE(pending_qty, 0) = 0 AND is_active = true
                                                   THEN 'HET_HANG' ELSE status END,
                                     is_active = CASE WHEN GREATEST(0, stock - $1) = 0 AND COALESCE(pending_qty, 0) = 0 AND is_active = true
                                                      THEN false ELSE is_active END,
                                     updated_at = $2
                                 WHERE code = $3`,
                                [qty, stockNow, code]
                            );
                        }
                        return insRes;
                    });
                    break; // transaction commit OK → thoát retry loop
                } catch (txErr) {
                    if (_isUniqueViolation(txErr)) {
                        // number trùng → tăng split suffix rồi thử lại. Giữ đúng quy ước
                        // "src.code-N". [5] (2026-06-13): bump CẢ lockedSplitIndex để
                        // split_index khớp suffix number (tránh lệch khi retry hiếm).
                        lastErr = txErr;
                        lockedSplitIndex = lockedSplitIndex + 1;
                        insertNumber = `${src.code}-${lockedSplitIndex}`;
                        continue;
                    }
                    throw txErr;
                }
            }
            if (!r) {
                throw (
                    lastErr ||
                    new Error('Không sinh được số PBH từ native-order (race retry exhausted)')
                );
            }
            // A1: request thua race → re-check dưới lock thấy PBH đã có → trả idempotent
            // (KHÔNG chạy tiếp các bước mark-converted/returnCodes — đã chạy ở request đầu).
            if (r.__idempotent) {
                return res.json({
                    success: true,
                    order: mapRow(r.rows[0]),
                    idempotent: true,
                    note: 'Đã có PBH (race-checked). Gửi ?split=true để tạo PBH bổ sung (tách đơn).',
                });
            }
        }

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

        // 2026-06-06: đánh dấu phiếu thu về (queued) đã lên bill → bill_status='consumed'.
        // Fire-and-forget — không chặn flow tạo PBH.
        const returnCodes = Array.isArray(b.returnCodes) ? b.returnCodes : [];
        if (returnCodes.length) {
            const pbhNumber = r.rows[0]?.number || src.code;
            for (const rc of returnCodes) {
                try {
                    await pool.query(
                        `UPDATE web2_returns SET bill_status='consumed', consumed_pbh_code=$1, updated_at=$2
                         WHERE code=$3 AND bill_status='queued'`,
                        [pbhNumber, Date.now(), rc]
                    );
                } catch (e) {
                    console.warn('[from-native-order] mark return consumed fail:', e.message);
                }
            }
            try {
                req.app.locals.web2RealtimeSseNotify?.(
                    'web2:returns',
                    { action: 'consumed', ts: Date.now() },
                    'update'
                );
            } catch {}
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

        // Stock đã trừ TRONG transaction cùng INSERT PBH (xem withTransaction phía
        // trên) → atomic. Chỉ còn SSE notify cho products page refresh stock.
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
        // BUG FIX (2026-06-24): withdraw + UPDATE wallet_deducted PHẢI atomic. Trước đây
        // _applyWalletToPbh(pool) → processWithdraw COMMIT riêng rồi pool.query(UPDATE) rời
        // → crash/lỗi giữa = ví bị trừ nhưng wallet_deducted=0 → cancel sau hoàn 0đ (mất
        // tiền). Truyền client → runWithTx reuse client → 2 thao tác cùng commit/rollback
        // (giống applyWalletToUnpaidPbhs). Ví lỗi KHÔNG chặn PBH đã tạo (giữ semantics cũ).
        let walletDeductedNow = 0;
        try {
            await withTransaction(pool, async (client) => {
                // FIX audit R2 (#1 race): LOCK + RE-READ PBH row TRƯỚC khi trừ ví. Trước đây
                // dùng r.rows[0].residual STALE (từ INSERT RETURNING) + KHÔNG lock row → chạy
                // SONG SONG với applyWalletToUnpaidPbhs (deposit về, FOR UPDATE SKIP LOCKED bắt
                // được PBH này vì TX2 chưa lock) → 2 đường cùng trừ ví theo residual GỐC = ví
                // bị trừ > số đơn nợ + residual bị clobber. Lock + dùng residual TƯƠI →
                // 2 đường serialize trên cùng row, đường sau chỉ trừ phần dư.
                const fresh = await client.query(
                    `SELECT * FROM fast_sale_orders WHERE id = $1 FOR UPDATE`,
                    [r.rows[0].id]
                );
                const pbhFresh = fresh.rows[0];
                if (!pbhFresh || pbhFresh.state === 'cancel') return;
                const wlt = await _applyWalletToPbh(
                    client,
                    src.phone,
                    pbhFresh,
                    req.body?._editor?.userName || req.body?.userName || null
                );
                if (wlt.deducted > 0) {
                    const upd = await client.query(
                        `UPDATE fast_sale_orders
                         SET payment_amount = COALESCE(payment_amount,0) + $1,
                             residual = $2,
                             cash_on_delivery = $2,
                             wallet_deducted = COALESCE(wallet_deducted,0) + $1,
                             date_updated = NOW()
                         WHERE id = $3 RETURNING *`,
                        [wlt.deducted, wlt.residualAfter, r.rows[0].id]
                    );
                    if (upd.rows[0]) r.rows[0] = upd.rows[0];
                    walletDeductedNow = wlt.deducted;
                }
            });
        } catch (e) {
            // Rollback → ví + wallet_deducted nhất quán (cả 2 không đổi); chỉ log, KHÔNG
            // ném (PBH đã commit ở transaction trên không được rớt vì lỗi thu hộ ví).
            console.warn('[FAST-SALE-ORDERS] from-native-order wallet apply failed:', e.message);
        }
        if (walletDeductedNow > 0 && _notifyClients) {
            // SSE ví → pill số dư + ví KH refresh
            try {
                _notifyClients(
                    `web2:wallet:${String(src.phone).replace(/\D/g, '')}`,
                    { action: 'pbh-deduct', phone: src.phone, ts: Date.now() },
                    'update'
                );
            } catch {}
        }

        const o = mapRow(r.rows[0]);
        _notify('from-native-order', o.number);
        // 3W4: thay WS native_order:updated cũ — notify thẳng topic native-orders
        // để trang Đơn Web biết source order đã promoted-to-confirmed.
        if (_notifyClients) {
            try {
                _notifyClients(
                    'web2:native-orders',
                    { action: 'promoted-to-confirmed', code: src.code, ts: Date.now() },
                    'update'
                );
            } catch {}
        }

        // Tự xóa cart bên panel Kho SP khi PBH tạo thành công.
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
        // audit r6 L-fix: over-sell phát hiện dưới lock trong txn → trả 400 đúng
        // format over_sell (client đã xử lý data.error==='over_sell' + violations).
        if (e && e.__overSell) {
            return res.status(400).json({
                error: 'over_sell',
                message: 'Tạo PBH thất bại: số lượng vượt tồn kho ở 1 hoặc nhiều SP',
                violations: e.__overSell,
            });
        }
        console.error('[FAST-SALE-ORDERS] from-native-order error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// PATCH /:number — update mutable fields
// -----------------------------------------------------
router.patch('/:number', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        // H2 (2026-06-11): state đổi qua PATCH cũng phải qua state-machine —
        // 'cancel' là terminal (stock đã restock + ví đã hoàn, không quay lại).
        if (b.state !== undefined) {
            const curQ = await pool.query(`SELECT state FROM fast_sale_orders WHERE number = $1`, [
                req.params.number,
            ]);
            if (curQ.rows.length === 0) return res.status(404).json({ error: 'Not found' });
            if (!_isValidPbhTransition(curQ.rows[0].state, b.state)) {
                return res.status(409).json({
                    error: 'invalid_state_transition',
                    message: `Không thể chuyển PBH từ '${curQ.rows[0].state}' sang '${b.state}'`,
                    from: curQ.rows[0].state,
                    to: b.state,
                });
            }
            // FIX 2026-06-23: 'cancel'/'done' có SIDE-EFFECT (restock + HOÀN VÍ + sync
            // native_orders + KPI). PATCH chỉ bare-UPDATE cột state → bỏ sót hết side-effect
            // (mất tiền/lệch kho/đơn web orphan). BẮT BUỘC qua endpoint riêng.
            if (b.state === 'cancel' || b.state === 'done') {
                return res.status(400).json({
                    error: 'state_change_via_patch_forbidden',
                    message: `Đổi state '${b.state}' phải qua endpoint riêng (restock/hoàn ví/sync), không qua PATCH.`,
                    useEndpoint: `/api/fast-sale-orders/${req.params.number}/${b.state === 'cancel' ? 'cancel' : 'confirm'}`,
                });
            }
        }
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
        // audit d-fix #6 (2026-06-21): KHÔNG cho sửa orderLines qua PATCH.
        // Stock được trừ lúc tạo PBH theo order_lines gốc; PATCH overwrite order_lines
        // mà KHÔNG điều chỉnh tồn → (a) thêm/ tăng dòng = oversell thầm lặng (không trừ),
        // (b) cancel sau đó restock theo qty PATCH'd (sai) → lệch tồn vĩnh viễn không
        // audit. Hiện KHÔNG client nào PATCH orderLines (sửa dòng = huỷ + tạo lại PBH).
        // Nếu sau cần sửa dòng tại chỗ: phải làm trong transaction (FOR UPDATE PBH +
        // advisory lock per code + áp delta tồn + oversell check), KHÔNG mở lại đường này.
        if (b.orderLines !== undefined) {
            return res.status(400).json({
                error: 'order_lines_immutable',
                message:
                    'Không sửa được sản phẩm của PBH qua PATCH (gây lệch tồn kho). Huỷ PBH rồi tạo lại.',
            });
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
// H2 HIGH FIX (2026-06-11): state-machine guard. Trước đây _stateChange UPDATE
// vô điều kiện → PBH 'cancel' confirm được thành 'done' mà stock KHÔNG trừ lại
// (đã restock lúc cancel) + ví KHÔNG trừ lại (đã hoàn). 'cancel' là TERMINAL —
// muốn bán lại phải tạo PBH mới (re-issue qua from-native-order). Transition
// sai → 409 invalid_state_transition. Same-state = no-op idempotent (cho phép).
const PBH_STATE_TRANSITIONS = {
    draft: ['confirmed', 'done', 'cancel'],
    confirmed: ['done', 'cancel'],
    done: ['cancel'],
    cancel: [], // terminal
};
function _isValidPbhTransition(from, to) {
    if (from === to) return true; // idempotent no-op
    return (PBH_STATE_TRANSITIONS[from] || []).includes(to);
}
async function _stateChange(pool, number, newState) {
    return withTransaction(pool, async (client) => {
        const prev = await client.query(
            `SELECT state FROM fast_sale_orders WHERE number = $1 FOR UPDATE`,
            [number]
        );
        if (prev.rows.length === 0) return { rows: [] };
        const from = prev.rows[0].state;
        if (!_isValidPbhTransition(from, newState)) {
            return { rows: [], invalidTransition: { from, to: newState } };
        }
        return client.query(
            `UPDATE fast_sale_orders SET state = $1, date_updated = NOW() WHERE number = $2 RETURNING *`,
            [newState, number]
        );
    });
}

// H1 HIGH FIX (2026-06-11): hoàn wallet_deducted về ví KH khi huỷ PBH (schema
// comment migration ghi rõ "lưu lại để HOÀN khi huỷ" nhưng chưa đường cancel
// nào hoàn). PHẢI gọi trong transaction với row fast_sale_orders ĐÃ LOCK
// FOR UPDATE bởi caller. Idempotent + chống cộng đôi với
// _refundWalletForNativeOrder (native-orders.js): CẢ 2 đường đều theo pattern
// "lock row + chỉ hoàn khi wallet_deducted > 0 + zero-out trong CÙNG transaction"
// → đường nào chạy trước zero-out trước, đường sau thấy 0 → tự loại trừ nhau.
// processDeposit tự normalizePhone (84xxx → 0xxx) — cùng ví với lúc trừ
// (_applyWalletToPbh cũng truyền raw phone qua processWithdraw → cùng normalize).
// Lỗi ví: THROW để caller ROLLBACK toàn bộ (không nuốt — giữ nguyên tử huỷ+hoàn).
async function _refundWalletDeductedForPbh(client, pbhRow, performedBy) {
    const amt = Number(pbhRow.wallet_deducted) || 0;
    if (amt <= 0 || !pbhRow.partner_phone) return 0;
    await web2WalletService.processDeposit(
        client,
        pbhRow.partner_phone,
        amt,
        null,
        `Hoàn ví huỷ PBH ${pbhRow.number}`,
        null,
        null,
        null,
        performedBy || '(huỷ PBH)'
    );
    await client.query(`UPDATE fast_sale_orders SET wallet_deducted = 0 WHERE id = $1`, [
        pbhRow.id,
    ]);
    return amt;
}

// Huỷ 1 PBH trong transaction: lock FOR UPDATE → set state='cancel' → restock
// (idempotent qua stock_restored) → hoàn wallet_deducted (idempotent qua zero-out).
// Dùng chung bởi /:number/cancel, /by-source/:code/cancel và /bulk-cancel.
async function _cancelPbhInTx(client, number, performedBy) {
    const prev = await client.query(
        `SELECT id, number, state, stock_restored, order_lines, source_type, source_code,
                partner_phone, wallet_deducted, returned_line_qty
         FROM fast_sale_orders WHERE number = $1 FOR UPDATE`,
        [number]
    );
    if (prev.rows.length === 0) return { notFound: true };
    const pr = prev.rows[0];
    const notCancelled = pr.state !== 'cancel';
    const upd = await client.query(
        `UPDATE fast_sale_orders SET state = 'cancel', date_updated = NOW()
         WHERE number = $1 RETURNING *`,
        [number]
    );
    if (upd.rows.length === 0) return { notFound: true };
    let restock = null;
    let walletRefunded = 0;
    // 3H3 FIX (2026-06-12): gate theo CỜ idempotent thay vì state. Trước đây
    // `if (notCancelled)` → PBH bị sync set state='cancel' (huỷ đơn web cũ)
    // mà CHƯA restock/hoàn ví thì mọi đường cancel sau đều skip vĩnh viễn.
    // restockOrderLines tự idempotent (stock_restored), _refundWalletDeducted
    // tự idempotent (zero-out) → chạy lại an toàn, PBH kẹt cũ tự lành.
    const needRestock = pr.stock_restored !== true;
    const needRefund = (Number(pr.wallet_deducted) || 0) > 0;
    if (needRestock || needRefund) {
        // restockOrderLines dùng client (cùng transaction) → atomic với UPDATE state.
        restock = await restockOrderLines(client, pr);
        walletRefunded = await _refundWalletDeductedForPbh(client, pr, performedBy);
        if (walletRefunded > 0) upd.rows[0].wallet_deducted = 0; // row trả về phản ánh zero-out
        console.log(
            `[FAST-SALE-ORDERS] cancel ${pr.number} → restocked ${restock.restored} lines, wallet refund ${walletRefunded}đ`
        );
    }
    // FIX audit R2 (#2 delivery desync): huỷ PBH → huỷ luôn phiếu giao hàng linked
    // (cùng transaction) để board giao hàng + KPI dlv_* không hiện đơn LIVE cho PBH
    // đã huỷ (đã restock + hoàn ví). CHỈ huỷ DLV chưa giao/chưa trả/chưa huỷ.
    // ⚠ SAVEPOINT BẮT BUỘC: lỗi UPDATE (vd bảng delivery_invoices vắng ở vài env) làm
    // ABORT cả transaction → restock + hoàn ví phía trên bị ROLLBACK (catch JS không cứu
    // được tx Postgres đã poison). ROLLBACK TO SAVEPOINT để 1 lỗi sync delivery KHÔNG
    // kéo đổ cancel (best-effort trong cùng tx).
    let deliveryCancelled = 0;
    try {
        await client.query('SAVEPOINT dlv_sync');
        const dlv = await client.query(
            `UPDATE delivery_invoices
             SET state = 'cancel',
                 state_history = COALESCE(state_history, '[]'::jsonb) || jsonb_build_object(
                     'from', state, 'to', 'cancel', 'at', extract(epoch from now()) * 1000, 'by', '(huỷ PBH nguồn)'),
                 date_updated = NOW()
             WHERE fso_number = $1 AND state NOT IN ('delivered', 'returned', 'cancel')
             RETURNING number`,
            [pr.number]
        );
        deliveryCancelled = dlv.rows.length;
        if (deliveryCancelled && _notifyClients) {
            try {
                _notifyClients(
                    'web2:delivery',
                    { action: 'cancel-from-pbh', pbh: pr.number, ts: Date.now() },
                    'update'
                );
            } catch (e) {}
        }
    } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT dlv_sync').catch(() => {});
        console.warn('[FAST-SALE-ORDERS] cancel: delivery sync skip:', e.message);
    }
    // [2026-07-01] Huỷ PBH → phiếu THU VỀ đã lên bill này (bill_status='consumed',
    // consumed_pbh_code = số PBH) PHẢI revert về 'queued' → món thu về RE-xuất hiện
    // trên bill lần sau (khách vẫn cần trả, hàng đã restock ở dòng 0đ phía trên). Không
    // revert = "mất dấu" món thu về sau khi huỷ đơn đổi. Idempotent (WHERE
    // bill_status='consumed'). SAVEPOINT best-effort — lỗi KHÔNG kéo đổ cancel.
    let returnsReverted = 0;
    try {
        await client.query('SAVEPOINT rtn_revert');
        const rr = await client.query(
            `UPDATE web2_returns
             SET bill_status = 'queued', consumed_pbh_code = NULL, updated_at = $2
             WHERE consumed_pbh_code = $1 AND bill_status = 'consumed' AND status = 'active'
             RETURNING code`,
            [pr.number, Date.now()]
        );
        returnsReverted = rr.rows.length;
        if (returnsReverted && _notifyClients) {
            try {
                _notifyClients(
                    'web2:returns',
                    { action: 'revert-consumed', pbh: pr.number, ts: Date.now() },
                    'update'
                );
            } catch (e) {}
        }
        if (returnsReverted) {
            console.log(
                `[FAST-SALE-ORDERS] cancel ${pr.number} → revert ${returnsReverted} phiếu thu về về 'queued'`
            );
        }
    } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT rtn_revert').catch(() => {});
        console.warn('[FAST-SALE-ORDERS] cancel: return-revert skip:', e.message);
    }
    return {
        prevRow: pr,
        wasNotCancelled: notCancelled,
        updRow: upd.rows[0],
        restock,
        walletRefunded,
        deliveryCancelled,
        returnsReverted,
    };
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
// 3W4: helper _wsEmit (WS broadcast) đã gỡ — mọi call site đều có _notify SSE kế bên.
router.post('/:number/cancel', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        // MEDIUM FIX (2026-06-10) + H1 (2026-06-11): đổi state='cancel' + restock +
        // hoàn wallet_deducted PHẢI atomic trong 1 transaction (lock FOR UPDATE,
        // idempotent qua stock_restored + zero-out wallet_deducted). Logic chung
        // /cancel + /by-source + /bulk-cancel: xem _cancelPbhInTx.
        const user = _extractPbhUser(req);
        const cancelTx = await withTransaction(pool, (client) =>
            _cancelPbhInTx(client, req.params.number, user.name || user.id || '(huỷ PBH)')
        );
        if (cancelTx.notFound) return res.status(404).json({ error: 'Not found' });
        const prevRow = cancelTx.prevRow;
        const wasNotCancelled = cancelTx.wasNotCancelled;
        const restockSummary = cancelTx.restock;
        const r = { rows: [cancelTx.updRow] };
        const o = mapRow(r.rows[0]);

        // SSE notify web2:products → products page refresh stock (sau commit).
        if (wasNotCancelled && restockSummary && restockSummary.restored > 0 && _notifyClients) {
            try {
                _notifyClients(
                    'web2:products',
                    { action: 'pbh-cancel-restock', code: null, ts: Date.now() },
                    'update'
                );
            } catch {}
        }
        // SSE ví → pill số dư + trang Ví KH refresh (sau commit hoàn ví).
        if (cancelTx.walletRefunded > 0 && _notifyClients && prevRow.partner_phone) {
            try {
                _notifyClients(
                    `web2:wallet:${String(prevRow.partner_phone).replace(/\D/g, '')}`,
                    { action: 'pbh-cancel-refund', phone: prevRow.partner_phone, ts: Date.now() },
                    'update'
                );
            } catch {}
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
        _notify('cancel', o.number);
        if (wasNotCancelled) {
            await _logPbhHistory(
                pool,
                o.number,
                'cancel',
                {
                    prevState: prevRow.state,
                    restoredLines: restockSummary?.restored || 0,
                    walletRefunded: cancelTx.walletRefunded || 0,
                    nativeSync: nativeSync?.codes || null,
                    reason: req.body?.reason || null,
                },
                user,
                _extractPbhSourcePage(req) || 'fastsaleorder-invoice'
            );
            // Sprint 1 KPI: emit actual_revoked cho mọi actual_confirmed events liên
            // quan đến đơn này. Idempotent qua client_event_id='revoke_<id>'.
            _emitRevokeKpi(pool, prevRow.source_code || null, req).catch((e) =>
                console.warn('[FAST-SALE-ORDERS] KPI revoke emit failed:', e.message)
            );
        }
        res.json({
            success: true,
            order: o,
            restock: restockSummary,
            walletRefunded: cancelTx.walletRefunded || 0,
            nativeSync,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Sprint 1 helper — revoke KPI cho 1 order. Tìm mọi actual_confirmed events
// chưa bị revoke, emit actual_revoked với cùng beneficiary + qty_delta âm.
async function _emitRevokeKpi(pool, orderCode, req) {
    if (!orderCode) return;
    // FIX audit R2 (#2): PBH GỘP có source_code = 'NJ-A+NJ-B'. KPI actual_confirmed phát
    // theo TỪNG mã native (order_code = src.code). Phải TÁCH '+' + revoke theo ANY mã thành
    // viên, nếu không huỷ PBH gộp KHÔNG thu hồi KPI → actual_confirmed phồng vĩnh viễn.
    const codes = String(orderCode)
        .split('+')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!codes.length) return;
    const kpiModule = require('./v2/kpi');
    const editor = (req?.body && req.body._editor) || _extractPbhUser(req) || {};
    const actorId = Number(editor.userId || editor.user_id) || Number(editor.id) || null;
    const events = await pool.query(
        `SELECT e.id, e.order_code, e.product_code, e.qty_delta, e.beneficiary_user_id, e.beneficiary_name,
                e.customer_id, e.source, e.campaign_id, e.order_campaign_stt
         FROM web2_kpi_events e
         WHERE e.order_code = ANY($1::text[]) AND e.event_type = 'actual_confirmed'
           AND NOT EXISTS (
               SELECT 1 FROM web2_kpi_events r
               WHERE r.event_type = 'actual_revoked'
                 AND r.revokes_event_id = e.id
           )`,
        [codes]
    );
    for (const ev of events.rows) {
        await kpiModule.emitKpiEvent(pool, {
            event_type: 'actual_revoked',
            actor_user_id: actorId || ev.beneficiary_user_id,
            actor_name: editor.userName || editor.user_name || null,
            beneficiary_user_id: ev.beneficiary_user_id,
            beneficiary_name: ev.beneficiary_name,
            beneficiary_source: 'assignment',
            order_code: ev.order_code || codes[0],
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
router.post('/by-source/:nativeOrderCode/cancel', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    const code = req.params.nativeOrderCode;
    if (!code) return res.status(400).json({ error: 'nativeOrderCode required' });
    try {
        await ensureTables(pool);
        // MEDIUM FIX (2026-06-10) + H1 (2026-06-11): đổi state='cancel' + restock +
        // hoàn wallet_deducted atomic (logic chung _cancelPbhInTx — giống /:number/cancel).
        // Native cancelOrder cũng có đường hoàn ví riêng (_refundWalletForNativeOrder)
        // nhưng cả 2 đều "lock row + chỉ hoàn khi wallet_deducted>0 + zero-out cùng tx"
        // → không cộng đôi.
        const user = _extractPbhUser(req);
        const byTx = await withTransaction(pool, async (client) => {
            // BUG FIX (2026-06-24): 1 native-order có thể tách thành NHIỀU PBH
            // (migration 078, split_index 1,2,3…). Trước đây LIMIT 1 → chỉ huỷ PBH
            // mới nhất, các split còn lại GIỮ trừ kho + wallet_deducted (không restock)
            // → tồn kẹt vĩnh viễn. Giờ huỷ HẾT PBH còn sống của đơn web này.
            const found = await client.query(
                `SELECT number FROM fast_sale_orders
                 WHERE source_code = $1 AND state <> 'cancel'
                 ORDER BY date_created DESC
                 FOR UPDATE`,
                [code]
            );
            if (found.rows.length === 0) return { notFound: true };
            const userLabel = user.name || user.id || '(huỷ PBH theo đơn web)';
            let last = null;
            const restockAgg = { restored: 0, items: [] };
            for (const prow of found.rows) {
                const one = await _cancelPbhInTx(client, prow.number, userLabel);
                last = one;
                if (one && one.restock) {
                    restockAgg.restored += one.restock.restored || 0;
                    if (Array.isArray(one.restock.items))
                        restockAgg.items.push(...one.restock.items);
                }
            }
            // Trả PBH huỷ cuối cho response shape cũ + restock GỘP tất cả split + count.
            return { ...last, restock: restockAgg, cancelledCount: found.rows.length };
        });
        if (byTx.notFound) {
            return res.status(404).json({ error: 'PBH chưa tồn tại cho đơn web này' });
        }
        const prevRow = byTx.prevRow;
        const number = prevRow.number;
        const r = { rows: [byTx.updRow] };
        const o = mapRow(r.rows[0]);
        const restockSummary = byTx.restock;

        // SSE notify web2:products → products page refresh stock (sau commit).
        if (restockSummary && restockSummary.restored > 0 && _notifyClients) {
            try {
                _notifyClients(
                    'web2:products',
                    { action: 'pbh-cancel-restock', code: null, ts: Date.now() },
                    'update'
                );
            } catch {}
        }
        // SSE ví → pill số dư + trang Ví KH refresh (sau commit hoàn ví).
        if (byTx.walletRefunded > 0 && _notifyClients && prevRow.partner_phone) {
            try {
                _notifyClients(
                    `web2:wallet:${String(prevRow.partner_phone).replace(/\D/g, '')}`,
                    { action: 'pbh-cancel-refund', phone: prevRow.partner_phone, ts: Date.now() },
                    'update'
                );
            } catch {}
        }

        // Revert native_orders.status — chỉ revert nếu đang là 'confirmed'.
        await pool.query(
            `UPDATE native_orders SET status = 'draft', updated_at = $1
             WHERE code = $2 AND status = 'confirmed'`,
            [Date.now(), code]
        );

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

        res.json({
            success: true,
            order: o,
            nativeOrderCode: code,
            restock: restockSummary,
            walletRefunded: byTx.walletRefunded || 0,
        });
    } catch (e) {
        console.error('[FAST-SALE-ORDERS] cancel-by-source error:', e.message);
        res.status(500).json({ error: e.message });
    }
});
router.post('/:number/confirm', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const r = await _stateChange(pool, req.params.number, 'done');
        // H2: transition sai (vd cancel → done: stock đã restock + ví đã hoàn,
        // confirm lại sẽ bán mà không trừ gì) → 409.
        if (r.invalidTransition) {
            return res.status(409).json({
                error: 'invalid_state_transition',
                message: `Không thể chuyển PBH từ '${r.invalidTransition.from}' sang 'done' — đơn đã huỷ phải tạo PBH mới`,
                from: r.invalidTransition.from,
                to: r.invalidTransition.to,
            });
        }
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
        _notify('confirm', o.number);
        res.json({ success: true, order: o, nativeSync });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.post('/:number/print', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `UPDATE fast_sale_orders SET print_count = print_count + 1, date_updated = NOW() WHERE number = $1 RETURNING *`,
            [req.params.number]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const o = mapRow(r.rows[0]);
        _notify('print', o.number);
        res.json({ success: true, order: o });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// DELETE /:number — hard delete (draft only by default)
// -----------------------------------------------------
router.delete('/:number', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const force = req.query.force === '1';
        // MEDIUM FIX (2026-06-11): xoá PBH phải TRẢ TỒN + HOÀN VÍ trước khi DELETE
        // (manual create đã trừ stock + có thể đã trừ wallet_deducted lúc tạo —
        // xoá trần = mất tồn + mất tiền ví). Trong 1 transaction: lock FOR UPDATE
        // → restock (idempotent qua stock_restored, skip nếu đã cancel/restored)
        // → hoàn wallet_deducted (idempotent qua zero-out) → DELETE.
        const user = _extractPbhUser(req);
        const delTx = await withTransaction(pool, async (client) => {
            const prev = await client.query(
                `SELECT id, number, state, stock_restored, order_lines,
                        partner_phone, wallet_deducted, source_type, source_code, returned_line_qty
                 FROM fast_sale_orders WHERE number = $1 FOR UPDATE`,
                [req.params.number]
            );
            if (prev.rows.length === 0) return { notFound: true };
            const pr = prev.rows[0];
            if (!force && pr.state !== 'draft') return { notDeletable: true };
            let restock = null;
            if (pr.state !== 'cancel') {
                // restockOrderLines tự skip nếu stock_restored=TRUE.
                restock = await restockOrderLines(client, pr);
            }
            const walletRefunded = await _refundWalletDeductedForPbh(
                client,
                pr,
                user.name || user.id || '(xoá PBH)'
            );
            await client.query(`DELETE FROM fast_sale_orders WHERE id = $1`, [pr.id]);
            return { prevRow: pr, restock, walletRefunded };
        });
        if (delTx.notFound || delTx.notDeletable) {
            return res
                .status(404)
                .json({ error: 'Not found or not deletable (state ≠ draft, use force=1)' });
        }
        if (delTx.restock && delTx.restock.restored > 0 && _notifyClients) {
            try {
                _notifyClients(
                    'web2:products',
                    { action: 'pbh-delete-restock', code: null, ts: Date.now() },
                    'update'
                );
            } catch {}
        }
        if (delTx.walletRefunded > 0 && _notifyClients && delTx.prevRow.partner_phone) {
            try {
                _notifyClients(
                    `web2:wallet:${String(delTx.prevRow.partner_phone).replace(/\D/g, '')}`,
                    {
                        action: 'pbh-delete-refund',
                        phone: delTx.prevRow.partner_phone,
                        ts: Date.now(),
                    },
                    'update'
                );
            } catch {}
        }
        // FIX 2026-06-23: sync ngược native_orders → 'cancelled' (single + merged) như
        // /cancel. Trước đây DELETE PBH bỏ sót → Đơn Web kẹt 'confirmed' (orphan: nhìn
        // active, re-convert được, KPI không revoke). syncNativeOrderStatusFromPbh tách
        // source_code '+' nên xử lý cả PBH gộp.
        try {
            const nativeSync = await syncNativeOrderStatusFromPbh(pool, delTx.prevRow, 'cancel');
            if (nativeSync.synced > 0 && req.app.locals.web2RealtimeSseNotify) {
                req.app.locals.web2RealtimeSseNotify(
                    'web2:native-orders',
                    {
                        action: 'pbh-delete-sync',
                        state: 'cancel',
                        codes: nativeSync.codes,
                        ts: Date.now(),
                    },
                    'update'
                );
            }
        } catch (e) {
            console.warn('[FAST-SALE-ORDERS] DELETE native-sync warn:', e.message);
        }
        _notify('delete', req.params.number);
        res.json({
            success: true,
            restock: delTx.restock,
            walletRefunded: delTx.walletRefunded || 0,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /reset-stt — atomic seq restart
// -----------------------------------------------------
router.post('/reset-stt', requireWeb2AuthSoft, async (req, res) => {
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
// Export cho hook CK/SePay (web2-balance-history.linkTransaction, sepay-webhook-core)
// gọi sau khi cộng ví → tự áp vào PBH chưa trả của SĐT.
router.applyWalletToUnpaidPbhs = applyWalletToUnpaidPbhs;

module.exports = router;
// 3H3 (2026-06-12): export cho native-orders /:code/cancel huỷ PBH liên kết
// ĐÚNG NGHĨA (restock + hoàn ví idempotent) trong cùng transaction, thay vì
// chỉ mirror state qua syncPbhStateFromNativeOrder.
module.exports._cancelPbhInTx = _cancelPbhInTx;
// 2026-06-23: export cho reconcile /return-failed sync ngược native_orders →
// 'cancelled' (giống /cancel route) — trước đây return-failed bỏ sót sync này.
module.exports.syncNativeOrderStatusFromPbh = syncNativeOrderStatusFromPbh;
