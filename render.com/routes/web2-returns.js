// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// WEB 2.0 — THU VỀ (Goods Return) REST API
// =====================================================================
// Phiếu thu về hàng từ khách. Mô hình (chốt 2026-06-06):
//
//   CHA = cách hàng về (quyết định TỒN KHO):
//     - khach_gui   : + kho THẬT ngay (stock += qty)            → stock_status='applied'
//     - shipper_gui : + kho THU VỀ chờ duyệt (return_qty += qty) → stock_status='pending'
//                     Duyệt xong → return_qty → stock. Badge "Thu về" ở Kho SP.
//                     Treo > 20 ngày → notification (xem v2/notifications scan).
//
//   VÍ LUÔN CỘNG NGAY ở cả 2 cách (chỉ tồn kho mới khác).
//
//   CON (sub_type):
//     - khong_nhan_hang : hoàn CẢ ĐƠN cũ (chọn PBH/Đơn Web của KH).
//                         Ví chỉ cộng nếu đơn đó đã trừ ví (wallet_deducted > 0).
//                         reason: khach_boom | khong_lien_lac | sai_dia_chi | doi_y | khac (+ reason_note).
//     - thu_ve_1_phan   : chọn SP lẻ trong kho. Ví = Σ(giá bán × SL) cộng ngay.
//                         Vào danh sách chờ → khi tạo PBH ở native-orders, SP lên
//                         bill giá 0đ (bill_status='queued' → 'consumed').
//
// Pool: web2Db (n2store-web2-db). KHÔNG đụng bảng Web 1.0.
// =====================================================================

const express = require('express');
const router = express.Router();
const web2WalletService = require('../services/web2-wallet-service');
const { withTransaction } = require('../db/with-transaction');
// Auth gate cho các handler ghi (POST/DELETE). requireWeb2AuthSoft 401 khi
// WEB2_AUTH_ENFORCE=1 (đang BẬT prod). Đồng bộ với sibling money routers
// (web2-supplier-wallet.js, web2-payment-signals.js). GET reads để mở.
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
const { recordAuditEvent } = require('../services/web2-audit-sink');
// Refresh tồn SP CHA sau khi thu về ghi tồn CON (stock/return_qty). Nếu không, badge
// "Thu về"/tồn trên dòng cha ở Kho SP bị stale. Best-effort, post-commit (audit gap).
const web2ProductsRouter = require('./web2-products');
async function _recomputeParents(pool, items) {
    try {
        const codes = [...new Set((items || []).map((it) => it && it.productCode).filter(Boolean))];
        if (codes.length && web2ProductsRouter.recomputeParentsForCodes) {
            await web2ProductsRouter.recomputeParentsForCodes(pool, codes);
        }
    } catch (e) {
        console.warn('[WEB2-RETURNS] _recomputeParents failed:', e.message);
    }
}

// -----------------------------------------------------
// SSE notifier — injected từ server.js via initializeNotifiers().
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, code, _extra) {
    if (!_notifyClients) return;
    try {
        // Audit SSE 2026-06-25: KHÔNG spread _extra (chỉ từng mang { phone }) vào
        // payload broadcast 'web2:returns' — lệch convention {action,id,ts} + lộ SĐT
        // KH cho mọi subscriber (client chỉ reload tab, không đọc payload). SĐT chỉ
        // đi qua _notifyWallet → topic riêng 'web2:wallet:<phone>'.
        _notifyClients('web2:returns', { action, code: code || null, ts: Date.now() }, 'update');
        // Thu về đổi tồn kho → Kho SP tự refresh (badge thu về, tồn).
        _notifyClients(
            'web2:products',
            { action: 'return-' + action, code: null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[WEB2-RETURNS] _notify failed:', e.message);
    }
}
function _notifyWallet(phone) {
    if (!_notifyClients || !phone) return;
    try {
        _notifyClients(
            `web2:wallet:${phone}`,
            { action: 'return-credit', phone, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[WEB2-RETURNS] _notifyWallet failed:', e.message);
    }
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
const METHODS = new Set(['khach_gui', 'shipper_gui']);
const SUB_TYPES = new Set(['khong_nhan_hang', 'thu_ve_1_phan', 'cod_shipper']);
// [2026-07-01] Thêm lý do hàng LỖI (shop/vận chuyển chịu) — lái disposition mặc định
// 'giu_rieng' (không nhập kho bán) ở frontend. Backend chỉ cần chấp nhận là reason hợp lệ.
const REASONS = new Set([
    'khach_boom',
    'khong_lien_lac',
    'sai_dia_chi',
    'doi_y',
    'hang_loi',
    'giao_sai',
    'hu_van_chuyen',
    'khac',
]);
// Disposition: hàng thu về xử lý thế nào với TỒN KHO BÁN ĐƯỢC.
//   nhap_ban  → cộng kho bán (mặc định — hàng còn tốt)
//   giu_rieng → KHÔNG cộng kho bán (hàng lỗi/giữ riêng kiểm) — reuse gate stock_applied=FALSE
//   huy       → KHÔNG cộng kho (write-off) — cũng skip stock
const DISPOSITIONS = new Set(['nhap_ban', 'giu_rieng', 'huy']);
// Hình thức hoàn (thu_ve_1_phan/đổi/không-đơn-gốc): ví/công nợ = cộng ví; tiền mặt/CK =
// KHÔNG cộng ví (đưa tiền tay), chỉ ghi nhận. khong_nhan_hang LUÔN theo ví/công nợ
// (đối xứng vòng đời PBH — không đổi path đã hardened).
const REFUND_METHODS = new Set(['vi', 'cong_no', 'tien_mat', 'ck']);
const FEE_BEARERS = new Set(['shop', 'khach']);
// Lý do "Vấn đề shipper" (Sửa COD shipper gọi). 'tru_cong_no_khach' → trừ ví khách.
const SHIPPER_REASONS = new Set([
    'tinh_sai_ship',
    'tru_cong_no_khach',
    'giam_gia_le_tien',
    'khach_nhan_1_phan',
    'tra_hang_don_cu',
]);
const OVERDUE_DAYS = 20;

function normPhone(p) {
    if (!p) return null;
    let s = String(p).replace(/\D/g, '');
    if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
    return s || null;
}

function mapRow(r) {
    if (!r) return null;
    return {
        id: Number(r.id),
        code: r.code,
        phone: r.phone,
        customerName: r.customer_name,
        customerId: r.customer_id != null ? Number(r.customer_id) : null,
        method: r.method,
        subType: r.sub_type,
        reason: r.reason || null,
        reasonNote: r.reason_note || null,
        sourceOrderCode: r.source_order_code || null,
        sourceOrderType: r.source_order_type || null,
        items: r.items || [],
        issue: r.issue || 'van_de_khach',
        codReduction: Number(r.cod_reduction || 0),
        payableCarrier: Number(r.payable_carrier || 0),
        totalAmount: Number(r.total_amount || 0),
        walletCredited: Number(r.wallet_credited || 0),
        walletTxId: r.wallet_tx_id != null ? Number(r.wallet_tx_id) : null,
        stockStatus: r.stock_status,
        approvedAt: r.approved_at != null ? Number(r.approved_at) : null,
        approvedBy: r.approved_by || null,
        billStatus: r.bill_status || null,
        consumedPbhCode: r.consumed_pbh_code || null,
        disposition: r.disposition || 'nhap_ban',
        returnShippingFee: Number(r.return_shipping_fee || 0),
        feeBearer: r.fee_bearer || null,
        refundMethod: r.refund_method || 'vi',
        isExchange: r.is_exchange === true,
        replacementItems: r.replacement_items || [],
        exchangeDiff: Number(r.exchange_diff || 0),
        customerBear: Number(r.customer_bear || 0),
        status: r.status,
        note: r.note || null,
        history: r.history || [],
        createdAt: Number(r.created_at),
        updatedAt: Number(r.updated_at),
        createdBy: r.created_by || null,
        createdByName: r.created_by_name || null,
    };
}

function _user(req) {
    // ƯU TIÊN identity từ token (req.web2User do requireWeb2AuthSoft gắn) —
    // không tin userId/userName client gửi (audit history spoofable). Fallback
    // body/header chỉ khi chưa enforce auth (soft mode, không có token).
    if (req.web2User) {
        return {
            id: req.web2User.id || null,
            name: req.web2User.display_name || req.web2User.username || '(ẩn danh)',
        };
    }
    const b = req.body || {};
    return {
        id: b.userId || req.headers['x-user-id'] || null,
        name: b.userName || req.headers['x-user-name'] || '(ẩn danh)',
    };
}

// EVENT-SINK audit toàn bộ (2026-06-22): ghi web2_audit_events sau thao tác phiếu
// trả hàng (tạo/duyệt). Best-effort, post-commit.
function _auditReturn(req, action, code, note) {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    const u = _user(req);
    recordAuditEvent(pool, {
        entity: 'return',
        entityId: code,
        action,
        userId: u.id,
        userName: u.name,
        sourcePage: 'fastsaleorder-refund',
        changes: note ? { note } : {},
    });
}

// -----------------------------------------------------
// Auto-create table on first request (idempotent)
// -----------------------------------------------------
const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    // ALTER ADD COLUMN mới đặt ĐẦU (rule web2-wallet-isolation regression): cột
    // return_qty trên web2_products = tồn kho thu về chờ duyệt (shipper_gui).
    await pool.query(`
        ALTER TABLE IF EXISTS web2_products
            ADD COLUMN IF NOT EXISTS return_qty INTEGER NOT NULL DEFAULT 0;
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_returns (
            id                BIGSERIAL PRIMARY KEY,
            code              VARCHAR(40) UNIQUE NOT NULL,
            phone             VARCHAR(40),
            customer_name     VARCHAR(255),
            customer_id       BIGINT,
            method            VARCHAR(20) NOT NULL,      -- khach_gui | shipper_gui
            sub_type          VARCHAR(20) NOT NULL,      -- khong_nhan_hang | thu_ve_1_phan
            reason            VARCHAR(20),               -- khach_boom | khong_lien_lac | sai_dia_chi | doi_y | khac
            reason_note       TEXT,
            source_order_code VARCHAR(40),               -- cho khong_nhan_hang
            source_order_type VARCHAR(20),               -- native | pbh
            items             JSONB NOT NULL DEFAULT '[]'::jsonb,
            total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
            wallet_credited   NUMERIC(14,2) NOT NULL DEFAULT 0,
            wallet_tx_id      BIGINT,
            stock_status      VARCHAR(20) NOT NULL DEFAULT 'applied', -- applied | pending | approved
            approved_at       BIGINT,
            approved_by       VARCHAR(255),
            bill_status       VARCHAR(20),               -- queued | consumed | null
            consumed_pbh_code VARCHAR(40),
            status            VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | cancelled
            note              TEXT,
            history           JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at        BIGINT NOT NULL,
            updated_at        BIGINT NOT NULL,
            created_by        VARCHAR(100),
            created_by_name   VARCHAR(255)
        );
        CREATE INDEX IF NOT EXISTS idx_web2_returns_phone   ON web2_returns(phone);
        CREATE INDEX IF NOT EXISTS idx_web2_returns_created ON web2_returns(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_web2_returns_stock   ON web2_returns(stock_status);
        CREATE INDEX IF NOT EXISTS idx_web2_returns_bill    ON web2_returns(bill_status);
        CREATE INDEX IF NOT EXISTS idx_web2_returns_status  ON web2_returns(status);
    `);
    // [2026-06-07] Vấn đề (khách/shipper) + COD flow (Sửa COD shipper gọi).
    //   issue: van_de_khach (thu hàng về kho) | van_de_shipper (sửa COD, không kho)
    //   cod_reduction: số COD giảm (shipper); payable_carrier: phải trả ĐVVC = cod_reduction.
    await pool.query(`
        ALTER TABLE IF EXISTS web2_returns
            ADD COLUMN IF NOT EXISTS issue          VARCHAR(20) DEFAULT 'van_de_khach',
            ADD COLUMN IF NOT EXISTS cod_reduction  NUMERIC(14,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS payable_carrier NUMERIC(14,2) NOT NULL DEFAULT 0;
    `);
    // Snapshot per-PBH wallet_deducted lúc tạo phiếu khong_nhan_hang. Khi huỷ
    // phiếu phải trả ĐÚNG số tiền gốc về TỪNG PBH (không dồn lump lên PBH đầu →
    // PBH #2..N kẹt 0, cancel sau không hoàn ví). Mảng [{id, walletDeducted}].
    await pool.query(`
        ALTER TABLE IF EXISTS web2_returns
            ADD COLUMN IF NOT EXISTS pbh_wallet_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    // [2026-06-23] stock_applied: kho CÓ thật sự được cộng lúc tạo phiếu không.
    // Native order chưa convert PBH = chưa trừ kho → create gate skip _applyStock →
    // stock_applied=FALSE → DELETE PHẢI skip trừ kho (đối xứng). Default TRUE: phiếu
    // CŨ đều đã cộng kho thật → huỷ vẫn trừ đúng. (browser-test bắt regression vòng 4)
    await pool.query(`
        ALTER TABLE IF EXISTS web2_returns
            ADD COLUMN IF NOT EXISTS stock_applied BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    // [2026-07-01] Mở rộng nghiệp vụ (audit đổi-trả): disposition hàng lỗi, phí ship
    // 2 chiều + bên chịu, hình thức hoàn, đổi hàng (thu_ve_1_phan + replacement).
    //   disposition          — nhap_ban | giu_rieng | huy (giu_rieng/huy → skip stock bán)
    //   return_shipping_fee  — phí ship hoàn (GHI NHẬN để báo cáo; chưa auto trừ ví)
    //   fee_bearer           — shop | khach (ai chịu phí)
    //   refund_method        — vi | cong_no | tien_mat | ck (tien_mat/ck → không cộng ví)
    //   is_exchange          — TRUE = phiếu đổi hàng (thu_ve_1_phan + replacement_items)
    //   replacement_items    — [{productCode,productName,quantity,price}] SP khách đổi lấy
    //   exchange_diff        — chênh lệch (replacement − returned); >0 khách bù, <0 shop hoàn
    await pool.query(`
        ALTER TABLE IF EXISTS web2_returns
            ADD COLUMN IF NOT EXISTS disposition         VARCHAR(20) DEFAULT 'nhap_ban',
            ADD COLUMN IF NOT EXISTS return_shipping_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS fee_bearer          VARCHAR(10),
            ADD COLUMN IF NOT EXISTS refund_method       VARCHAR(20) DEFAULT 'vi',
            ADD COLUMN IF NOT EXISTS is_exchange         BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS replacement_items   JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS exchange_diff       NUMERIC(14,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS customer_bear       NUMERIC(14,2) NOT NULL DEFAULT 0;
    `);
    // 3H2 (2026-06-12): backstop chống 2 phiếu "không nhận hàng" active cùng 1
    // đơn nguồn (double-submit/2 user = cộng ví + cộng kho ×2). Pre-check trong
    // transaction là lớp 1; index này là lớp chốt khi race. try/catch riêng:
    // data cũ lỡ có dup thì index fail — không chặn boot (warn để dọn tay).
    try {
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_web2_returns_knh_active
            ON web2_returns(source_order_code)
            WHERE status = 'active' AND sub_type = 'khong_nhan_hang'
        `);
    } catch (e) {
        console.warn('[WEB2-RETURNS] uq_web2_returns_knh_active create failed:', e.message);
    }
    _ensuredPools.add(pool);
}

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// Sinh code TV-YYYYMMDD-XXXX (sequence theo ngày).
// AUDIT 2026-06-20 #LOW8: sinh code TV-YYYYMMDD-NNNN bằng MAX+1. Race 2 create cùng
// lúc → 23505 (code UNIQUE) → caller (van_de_shipper/khach branch) đã bọc retry-on-23505
// (RETRY_MAX=5) re-gọi _genCode → seq mới. Đây là chiến lược concurrency CỐ Ý &
// đúng (audit xác nhận acceptable) — KHÔNG đổi sang sequence/counter (sequence không
// reset theo ngày; counter cần seed-from-legacy + migration, rủi ro hơn lợi).
async function _genCode(pool) {
    const d = new Date();
    const ymd =
        d.getFullYear().toString() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
    const prefix = `TV-${ymd}-`;
    const r = await pool.query(
        `SELECT code FROM web2_returns WHERE code LIKE $1 ORDER BY code DESC LIMIT 1`,
        [prefix + '%']
    );
    let seq = 1;
    if (r.rows[0]) {
        const last = parseInt(String(r.rows[0].code).slice(prefix.length), 10);
        if (Number.isFinite(last)) seq = last + 1;
    }
    return prefix + String(seq).padStart(4, '0');
}

// Áp tồn kho cho 1 list item theo method. delta>0 = cộng.
// khach_gui → stock; shipper_gui → return_qty.
// PERF: gom theo code (cộng dồn) → 1 UPDATE batch thay N round-trip (chống N+1 trong
// transaction; đơn 30 dòng = 30 query). `sign` đồng nhất 1 chiều/lần gọi nên cộng dồn
// trước GREATEST(0,…) cho kết quả y hệt vòng lặp tuần tự. `${col}` từ nhánh cố định (an toàn).
async function _applyStock(client, items, method, sign) {
    const col = method === 'shipper_gui' ? 'return_qty' : 'stock';
    const deltas = new Map();
    for (const it of items || []) {
        const code = it.productCode;
        const qty = Number(it.quantity) || 0;
        if (!code || qty <= 0) continue;
        deltas.set(code, (deltas.get(code) || 0) + sign * qty);
    }
    if (!deltas.size) return;
    const params = [Date.now()];
    const valuesSql = [...deltas.entries()]
        .map(([code, delta]) => {
            params.push(code, delta);
            return `($${params.length - 1}::text, $${params.length}::numeric)`;
        })
        .join(',');
    await client.query(
        `UPDATE web2_products AS p
         SET ${col} = GREATEST(0, COALESCE(p.${col}, 0) + v.delta), updated_at = $1
         FROM (VALUES ${valuesSql}) AS v(code, delta)
         WHERE p.code = v.code`,
        params
    );
}

// Hoàn (cộng lại) wallet_deducted về 1 PBH khi huỷ phiếu KNH, CAP ≤ amount_total
// của PBH đó → wallet_deducted không vượt giá trị đơn (chống over-refund khi cancel
// PBH sau). Trả về số thực cộng; warn nếu phải cap (phần dư kẹt = under-refund an toàn).
async function _restoreCapped(client, pbhId, add, returnCode) {
    if (!(add > 0) || !pbhId) return 0;
    const r = await client.query(
        `SELECT COALESCE(wallet_deducted,0)::numeric AS wd, COALESCE(amount_total,0)::numeric AS tot
         FROM fast_sale_orders WHERE id = $1 FOR UPDATE`,
        [pbhId]
    );
    if (!r.rows[0]) return 0;
    const cur = Number(r.rows[0].wd) || 0;
    const tot = Number(r.rows[0].tot) || 0;
    const room = Math.max(0, tot - cur);
    const applied = Math.min(add, room);
    if (applied > 0) {
        await client.query(
            `UPDATE fast_sale_orders SET wallet_deducted = wallet_deducted + $1, date_updated = NOW() WHERE id = $2`,
            [applied, pbhId]
        );
    }
    if (applied < add) {
        console.warn(
            `[WEB2-RETURNS] _restoreCapped: huỷ ${returnCode} — dư ${add - applied} không cộng lại PBH#${pbhId} (đã đầy amount_total). Kiểm tra ví tay nếu cần.`
        );
    }
    return applied;
}

// Lấy items + wallet_deducted của 1 đơn cũ (cho khong_nhan_hang / boom).
async function _resolveSourceOrder(pool, code, type) {
    if (type === 'pbh') {
        // NOTE: fast_sale_orders dùng cột `amount_total` (KHÔNG phải total_amount).
        const r = await pool.query(
            `SELECT order_lines, amount_total, wallet_deducted, partner_phone,
                    cash_on_delivery, delivery_price
             FROM fast_sale_orders WHERE number = $1 LIMIT 1`,
            [code]
        );
        if (!r.rows[0]) return null;
        const row = r.rows[0];
        const lines = Array.isArray(row.order_lines) ? row.order_lines : [];
        return {
            items: lines.map((l) => ({
                productCode: l.productCode || l.product_code || l.code,
                productName: l.productName || l.product_name || l.name || '',
                quantity: Number(l.quantity || l.qty) || 0,
                price: Number(l.priceUnit || l.price || 0),
            })),
            totalAmount: Number(row.amount_total) || 0,
            walletDeducted: Number(row.wallet_deducted) || 0,
            cod: Number(row.cash_on_delivery) || 0,
            ship: Number(row.delivery_price) || 0,
        };
    }
    // native order
    const r = await pool.query(
        `SELECT products, total_amount, phone FROM native_orders WHERE code = $1 LIMIT 1`,
        [code]
    );
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    const prods = Array.isArray(row.products) ? row.products : [];
    // wallet đã trừ nằm trên (các) PBH liên kết native order này.
    let walletDeducted = 0;
    try {
        const w = await pool.query(
            // Filter state<>'cancel': PBH đã huỷ đã hoàn ví khi cancel → KHÔNG
            // cộng wallet_deducted của nó vào lần hoàn này (tránh hoàn ví dư).
            `SELECT COALESCE(SUM(wallet_deducted),0)::numeric AS s
             FROM fast_sale_orders
             WHERE source_type='native_order' AND source_code = $1
               AND state <> 'cancel'`,
            [code]
        );
        walletDeducted = Number(w.rows[0]?.s) || 0;
    } catch {}
    return {
        items: prods.map((p) => ({
            productCode: p.productCode || p.code,
            productName: p.productName || p.name || '',
            quantity: Number(p.quantity || p.qty) || 0,
            price: Number(p.price || p.priceUnit || 0),
        })),
        totalAmount: Number(row.total_amount) || 0,
        walletDeducted,
        cod: 0, // native_orders không lưu COD (tính qua delivery method)
        ship: 0,
    };
}

// =====================================================
// GET /api/web2-returns/health
// =====================================================
router.get('/health', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM web2_returns');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// =====================================================
// GET /api/web2-returns/list?search&status&stockStatus&page&limit
// =====================================================
router.get('/list', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const {
            search,
            status,
            stockStatus,
            method,
            issue,
            from,
            to,
            page = 1,
            limit = 100,
        } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;
        const conds = [];
        const params = [];
        if (status) {
            params.push(status);
            conds.push(`status = $${params.length}`);
        }
        if (stockStatus) {
            params.push(stockStatus);
            conds.push(`stock_status = $${params.length}`);
        }
        if (method === 'khach_gui' || method === 'shipper_gui') {
            params.push(method);
            conds.push(`method = $${params.length}`);
        }
        if (issue === 'van_de_khach' || issue === 'van_de_shipper') {
            params.push(issue);
            conds.push(`issue = $${params.length}`);
        }
        // Lọc theo khoảng ngày tạo (epoch ms). from/to = timestamp đầu/cuối ngày (client set).
        const fromTs = Number(from);
        if (Number.isFinite(fromTs) && fromTs > 0) {
            params.push(fromTs);
            conds.push(`created_at >= $${params.length}`);
        }
        const toTs = Number(to);
        if (Number.isFinite(toTs) && toTs > 0) {
            params.push(toTs);
            conds.push(`created_at <= $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(`(code ILIKE $${i} OR phone ILIKE $${i} OR customer_name ILIKE $${i})`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM web2_returns ${where}`,
            params
        );
        const total = countR.rows[0].n;
        const listParams = [...params, limitNum, offset];
        const r = await pool.query(
            `SELECT * FROM web2_returns ${where}
             ORDER BY created_at DESC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );
        res.json({
            success: true,
            returns: r.rows.map(mapRow),
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + r.rows.length < total,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/web2-returns/pending — list shipper_gui chờ duyệt
// =====================================================
router.get('/pending', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT * FROM web2_returns
             WHERE method = 'shipper_gui' AND stock_status = 'pending' AND status = 'active'
             ORDER BY created_at ASC`
        );
        const now = Date.now();
        const overdueMs = OVERDUE_DAYS * 24 * 3600 * 1000;
        const items = r.rows.map((row) => {
            const m = mapRow(row);
            m.overdue = now - m.createdAt > overdueMs;
            m.ageDays = Math.floor((now - m.createdAt) / (24 * 3600 * 1000));
            return m;
        });
        res.json({ success: true, items, overdueDays: OVERDUE_DAYS });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/web2-returns/queued-by-phone/:phone
// SP thu_ve_1_phan chờ lên bill 0đ cho 1 KH (native-orders gọi).
// =====================================================
router.get('/queued-by-phone/:phone', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const phone = normPhone(req.params.phone);
        if (!phone) return res.json({ success: true, items: [], returns: [] });
        const r = await pool.query(
            `SELECT * FROM web2_returns
             WHERE phone = $1 AND sub_type = 'thu_ve_1_phan'
               AND bill_status = 'queued' AND status = 'active'
             ORDER BY created_at ASC`,
            [phone]
        );
        // Gộp item theo productCode để hiện gợi ý + danh sách dòng bill 0đ.
        const flat = [];
        for (const row of r.rows) {
            for (const it of row.items || []) {
                flat.push({
                    returnCode: row.code,
                    productCode: it.productCode,
                    productName: it.productName,
                    quantity: Number(it.quantity) || 0,
                });
            }
        }
        res.json({ success: true, returns: r.rows.map(mapRow), items: flat });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/web2-returns/on-order/:code
// SP THU VỀ đã lên bill của 1 đơn (native code hoặc PBH number) — để IN vào
// bill PBH cho SHIPPER thu lại. Nguồn: web2_returns.consumed_pbh_code = số PBH
// của đơn (đã 'consumed' khi tạo PBH) + fallback queued-by-phone nếu in trước
// khi consume. Trả items [{productCode, productName, quantity}] gộp theo mã.
// =====================================================
router.get('/on-order/:code', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const code = String(req.params.code || '').trim();
        if (!code) return res.json({ success: true, items: [] });
        // PBH number(s) của đơn (native → nhiều PBH LIVE; hoặc code CHÍNH LÀ số PBH).
        // Loại PBH đã huỷ (state<>'cancel') — audit MEDIUM (không lấy phiếu của PBH huỷ).
        let numbers = [code];
        try {
            const pbhs = await pool.query(
                `SELECT number FROM fast_sale_orders
                 WHERE ((source_type='native_order' AND source_code=$1) OR number=$1)
                   AND state <> 'cancel'`,
                [code]
            );
            for (const row of pbhs.rows) if (row.number) numbers.push(row.number);
        } catch {}
        numbers = [...new Set(numbers)];
        // CHỈ phiếu ĐÃ được gắn vào PBH của đơn NÀY (consumed_pbh_code). BỎ nhánh
        // fallback theo SĐT (audit CRITICAL/MEDIUM: match toàn bộ queued của KH → in
        // nhầm phiếu đơn khác lên mọi bill + orphan hiện khắp nơi). Phiếu queued được
        // xử lý lúc TẠO PBH qua collect() — bill in lại chỉ hiện đúng phần đã gộp.
        const r = await pool.query(
            `SELECT code, items FROM web2_returns
             WHERE sub_type='thu_ve_1_phan' AND status='active'
               AND consumed_pbh_code = ANY($1::text[])
             ORDER BY created_at ASC`,
            [numbers]
        );
        // Gộp theo productCode để bill gọn.
        const byCode = new Map();
        for (const row of r.rows) {
            for (const it of row.items || []) {
                if (!it.productCode) continue;
                const q = Number(it.quantity) || 0;
                if (q <= 0) continue;
                const prev = byCode.get(it.productCode);
                if (prev) prev.quantity += q;
                else
                    byCode.set(it.productCode, {
                        productCode: it.productCode,
                        productName: it.productName || '',
                        quantity: q,
                    });
            }
        }
        res.json({ success: true, items: [...byCode.values()] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/web2-returns/source-order/:type/:code
// Trả danh sách SP + wallet_deducted của 1 đơn cũ (để picker "Khách không
// nhận hàng" xem được SP sẽ hoàn). type = native | pbh.
// =====================================================
router.get('/source-order/:type/:code', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const type = req.params.type === 'pbh' ? 'pbh' : 'native';
        const src = await _resolveSourceOrder(pool, req.params.code, type);
        if (!src) return res.status(404).json({ error: 'Đơn không tồn tại' });
        res.json({
            success: true,
            items: src.items.filter((x) => x.productCode && x.quantity > 0),
            totalAmount: src.totalAmount,
            walletDeducted: src.walletDeducted,
            cod: src.cod || 0,
            ship: src.ship || 0,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/web2-returns/:code
// =====================================================
router.get('/:code', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT * FROM web2_returns WHERE code = $1', [req.params.code]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, return: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/web2-returns  — tạo phiếu thu về
// Body:
//   phone, customerName, customerId
//   method: khach_gui | shipper_gui
//   subType: khong_nhan_hang | thu_ve_1_phan
//   reason, reasonNote                          (khong_nhan_hang)
//   sourceOrderCode, sourceOrderType            (khong_nhan_hang)
//   items: [{productCode, productName, quantity, price}]  (thu_ve_1_phan)
//   note
// =====================================================
router.post('/', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const b = req.body || {};
    const method = String(b.method || '').trim();
    const subType = String(b.subType || '').trim();
    if (!METHODS.has(method)) return res.status(400).json({ error: 'method invalid' });
    if (!SUB_TYPES.has(subType)) return res.status(400).json({ error: 'subType invalid' });
    const phone = normPhone(b.phone);
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const user = _user(req);
    const issue = b.issue === 'van_de_shipper' ? 'van_de_shipper' : 'van_de_khach';
    // [2026-07-01] Mở rộng nghiệp vụ đổi-trả (van_de_khach flow):
    //   disposition   → giu_rieng/huy = hàng lỗi, KHÔNG cộng kho bán (reuse gate stock_applied=FALSE)
    //   refundMethod  → tien_mat/ck = KHÔNG cộng ví (trả tiền tay, chỉ ghi nhận)
    //   isExchange    → phiếu đổi hàng: thu_ve_1_phan + replacementItems (SP đổi lấy, bán ở PBH sau)
    //   returnShippingFee/feeBearer → GHI NHẬN phí ship 2 chiều để báo cáo (chưa auto trừ ví)
    const disposition = DISPOSITIONS.has(b.disposition) ? b.disposition : 'nhap_ban';
    const skipStock = disposition === 'giu_rieng' || disposition === 'huy';
    const returnShippingFee = Math.max(0, Number(b.returnShippingFee) || 0);
    const feeBearer = FEE_BEARERS.has(b.feeBearer) ? b.feeBearer : null;
    // refund_method chỉ lái ví cho thu_ve_1_phan (fresh credit). khong_nhan_hang LUÔN
    // theo ví/công nợ (đối xứng vòng đời PBH — không đổi path đã hardened).
    const refundMethod =
        subType === 'thu_ve_1_phan' && REFUND_METHODS.has(b.refundMethod) ? b.refundMethod : 'vi';
    const creditToWallet = refundMethod === 'vi' || refundMethod === 'cong_no';
    // [2026-07-01] "Khách chịu" (₫): số tiền KHÔNG hoàn (khách chịu lỗ 1 phần, vd hàng
    // lỗi do khách). CHỈ thu_ve_1_phan. Hoàn ví THẬT = walletCredit − customerBear (clamp 0);
    // phần customerBear shop giữ lại. wallet_deducted của PBH VẪN settle FULL (món đã trả).
    const customerBear = subType === 'thu_ve_1_phan' ? Math.max(0, Number(b.customerBear) || 0) : 0;
    const isExchange = b.isExchange === true && subType === 'thu_ve_1_phan';
    const replacementItems =
        isExchange && Array.isArray(b.replacementItems)
            ? b.replacementItems
                  .map((it) => ({
                      productCode: String(it.productCode || '').trim(),
                      productName: it.productName || '',
                      quantity: Number(it.quantity) || 0,
                      price: Number(it.price) || 0,
                  }))
                  .filter((it) => it.productCode && it.quantity > 0)
            : [];
    try {
        await ensureTables(pool);

        // ===== VẤN ĐỀ SHIPPER — Sửa COD (Shipper gọi) =====
        // Chỉ ghi nhận COD giảm + Phải trả ĐVVC. KHÔNG đụng kho. Ví chỉ trừ khi
        // lý do = 'tru_cong_no_khach'. Xem docs/dev-log 2026-06-07.
        if (issue === 'van_de_shipper') {
            const reasonS = SHIPPER_REASONS.has(b.reason) ? b.reason : 'tinh_sai_ship';
            const sCode = String(b.sourceOrderCode || '').trim();
            const sType = b.sourceOrderType === 'native' ? 'native' : 'pbh';
            if (!sCode) return res.status(400).json({ error: 'sourceOrderCode required' });
            const codReduction = Math.max(0, Number(b.codReduction) || 0);
            if (codReduction <= 0)
                return res.status(400).json({ error: 'codReduction > 0 required' });
            const doWithdraw = reasonS === 'tru_cong_no_khach';

            // ATOMIC (audit r6 CRITICAL fix): trừ ví + INSERT phiếu trong CÙNG
            // transaction. TRƯỚC đây processWithdraw(pool) commit ngay rồi INSERT
            // riêng (pool.query) → nếu INSERT fail (lỗi non-23505 / hết retry) thì
            // ví ĐÃ trừ mà KHÔNG có phiếu → khách mất tiền không dấu vết. Nay bọc
            // withTransaction; retry-on-23505 (_genCode MAX+1 không atomic) tạo
            // transaction MỚI mỗi lần → rollback cả withdraw nếu insert fail.
            // Mirror đúng pattern van_de_khach bên dưới (processWithdraw nhận client).
            const SHIPPER_RETRY_MAX = 5;
            let insRow;
            let code;
            for (let attempt = 0; ; attempt++) {
                code = await _genCode(pool);
                const now = Date.now();
                const hist = [
                    {
                        ts: now,
                        action: 'create',
                        userId: user.id,
                        userName: user.name,
                        note: `van_de_shipper / ${reasonS} / COD-${codReduction}`,
                    },
                ];
                try {
                    insRow = await withTransaction(pool, async (client) => {
                        let walletTxId = null;
                        let walletCredited = 0;
                        if (doWithdraw) {
                            let wd;
                            try {
                                wd = await web2WalletService.processWithdraw(
                                    client,
                                    phone,
                                    codReduction,
                                    'return-cod',
                                    sCode,
                                    `Trừ công nợ khách (Sửa COD) đơn ${sCode}`,
                                    user.name
                                );
                            } catch (e) {
                                if (String(e.message).includes('Số dư không đủ')) {
                                    const err = new Error('Ví khách không đủ để trừ công nợ');
                                    err.httpStatus = 400;
                                    throw err;
                                }
                                throw e;
                            }
                            // FIX audit R2: lần "Sửa COD / trừ công nợ" THỨ 2 cho CÙNG đơn bị
                            // dedupe nuốt (referenceId=sCode, type return-cod) → ví KHÔNG trừ
                            // thật nhưng phiếu vẫn ghi walletCredited=-codReduction → lệch sổ +
                            // huỷ phiếu sau processDeposit(+codReduction) = over-refund. Chặn:
                            // đã có phiếu trừ công nợ cho đơn này → reject, không tạo phiếu khống.
                            if (wd?.alreadyProcessed) {
                                const err = new Error(
                                    `Đơn ${sCode} đã có phiếu Sửa COD trừ công nợ khách — không trừ lần 2`
                                );
                                err.httpStatus = 409;
                                throw err;
                            }
                            walletTxId = wd?.transaction?.id || null;
                            walletCredited = -codReduction; // âm = đã trừ ví
                        }
                        const r = await client.query(
                            `INSERT INTO web2_returns
                              (code, phone, customer_name, customer_id, method, sub_type, issue, reason,
                               source_order_code, source_order_type, items, total_amount, wallet_credited,
                               wallet_tx_id, cod_reduction, payable_carrier, stock_status, status, note,
                               history, created_at, updated_at, created_by, created_by_name)
                             VALUES ($1,$2,$3,$4,'shipper_gui','cod_shipper','van_de_shipper',$5,$6,$7,'[]'::jsonb,0,$8,$9,$10,$10,'applied','active',$11,$12::jsonb,$13,$13,$14,$15)
                             RETURNING *`,
                            [
                                code,
                                phone,
                                b.customerName || null,
                                b.customerId || null,
                                reasonS,
                                sCode,
                                sType,
                                walletCredited,
                                walletTxId,
                                codReduction,
                                b.note || null,
                                JSON.stringify(hist),
                                now,
                                user.id,
                                user.name,
                            ]
                        );
                        return r.rows[0];
                    });
                    break;
                } catch (e) {
                    if (e && e.httpStatus) {
                        return res.status(e.httpStatus).json({ error: e.message });
                    }
                    if (e && e.code === '23505' && attempt < SHIPPER_RETRY_MAX) continue;
                    throw e;
                }
            }
            if (doWithdraw) _notifyWallet(phone);
            _notify('create', code, { phone });
            _auditReturn(req, 'create', code, 'Tạo phiếu trả hàng');
            return res.json({ success: true, return: mapRow(insRow) });
        }

        // 1) Resolve items + wallet credit amount theo sub_type.
        let items = [];
        let totalAmount = 0;
        let walletCredit = 0;
        let reason = null;
        let reasonNote = null;
        let sourceOrderCode = null;
        let sourceOrderType = null;

        if (subType === 'khong_nhan_hang') {
            reason = REASONS.has(b.reason) ? b.reason : 'khach_boom';
            reasonNote = reason === 'khac' ? (b.reasonNote || '').toString().slice(0, 500) : null;
            sourceOrderCode = String(b.sourceOrderCode || '').trim();
            sourceOrderType = b.sourceOrderType === 'pbh' ? 'pbh' : 'native';
            if (!sourceOrderCode)
                return res.status(400).json({ error: 'sourceOrderCode required' });
            const src = await _resolveSourceOrder(pool, sourceOrderCode, sourceOrderType);
            if (!src) return res.status(404).json({ error: 'Đơn nguồn không tồn tại' });
            items = src.items.filter((x) => x.productCode && x.quantity > 0);
            totalAmount = src.totalAmount;
            // Ví: chỉ cộng nếu đơn đó đã trừ ví.
            walletCredit = src.walletDeducted > 0 ? src.walletDeducted : 0;
        } else {
            // thu_ve_1_phan — chọn SP trong 1 đơn của khách (lưu nguồn để truy vết).
            sourceOrderCode = b.sourceOrderCode ? String(b.sourceOrderCode).trim() : null;
            sourceOrderType =
                b.sourceOrderType === 'pbh'
                    ? 'pbh'
                    : b.sourceOrderType === 'native'
                      ? 'native'
                      : null;
            const raw = Array.isArray(b.items) ? b.items : [];
            items = raw
                .map((it) => ({
                    productCode: String(it.productCode || '').trim(),
                    productName: it.productName || '',
                    quantity: Number(it.quantity) || 0,
                    price: Number(it.price) || 0,
                }))
                .filter((it) => it.productCode && it.quantity > 0);
            if (!items.length) return res.status(400).json({ error: 'items required' });

            // SERVER-VALIDATE giá ví (MONEY): KHÔNG tin giá client gửi. Nếu có
            // sourceOrderCode → resolve đơn nguồn, lấy giá + SL THẬT theo
            // productCode; cap giá mỗi dòng ≤ giá trong đơn, cap SL ≤ SL đã mua,
            // và cap TỔNG walletCredit ≤ wallet_deducted của đơn (số tiền KH
            // thực trả từ ví). Không có sourceOrderCode → KHÔNG cộng ví (tránh
            // mint balance bằng giá bịa), chỉ ghi nhận hàng về kho.
            if (sourceOrderCode) {
                const src = await _resolveSourceOrder(pool, sourceOrderCode, sourceOrderType);
                if (!src) return res.status(404).json({ error: 'Đơn nguồn không tồn tại' });
                const srcByCode = new Map();
                for (const s of src.items || []) {
                    if (!s.productCode) continue;
                    const prev = srcByCode.get(s.productCode);
                    srcByCode.set(s.productCode, {
                        price: Number(s.price) || 0,
                        quantity: (prev?.quantity || 0) + (Number(s.quantity) || 0),
                    });
                }
                items = items
                    .map((it) => {
                        const ref = srcByCode.get(it.productCode);
                        if (!ref) return { ...it, price: 0, quantity: 0 };
                        return {
                            ...it,
                            price: Math.min(it.price, ref.price),
                            quantity: Math.min(it.quantity, ref.quantity),
                        };
                    })
                    .filter((it) => it.quantity > 0);
                if (!items.length)
                    return res.status(400).json({ error: 'SP không khớp đơn nguồn' });
                totalAmount = items.reduce((s, it) => s + it.price * it.quantity, 0);
                // Cap tổng cộng ví theo số tiền đơn đã trừ ví (không hoàn quá).
                // ⚠ walletCredit = số tiền cần QUYẾT TOÁN với PBH nguồn (settle wallet_deducted)
                // BẤT KỂ hình thức hoàn. refundMethod=tien_mat/ck chỉ SKIP bước cộng vào SỐ DƯ ví
                // (dưới, tại processDeposit) — vẫn phải decrement wallet_deducted của PBH để huỷ
                // PBH sau KHÔNG hoàn ví 2 lần. Xem creditToWallet ở processDeposit + INSERT.
                const capped = Math.min(totalAmount, Number(src.walletDeducted) || 0);
                walletCredit = capped > 0 ? capped : 0;
            } else {
                // Không truy được đơn nguồn → ghi nhận hàng về, KHÔNG cộng ví.
                totalAmount = items.reduce((s, it) => s + it.price * it.quantity, 0);
                walletCredit = 0;
            }
        }
        items = items.map((it) => ({ ...it, amount: (Number(it.price) || 0) * it.quantity }));

        const stockStatus = method === 'shipper_gui' ? 'pending' : 'applied';
        // billStatus (bill 0đ queued) tính TRONG transaction sau khi biết sourceDeductedStock
        // + skipStock: chỉ queue khi hàng THẬT SỰ vào kho bán được (khach_gui, không skip).
        // shipper_gui → queue lúc DUYỆT (approve) sau khi return_qty→stock.

        // Idempotency/dedupe cho thu_ve_1_phan: chữ ký item-set ổn định (sort
        // theo productCode + quantity) + cửa sổ ngắn để chặn double-submit /
        // retry cộng ví + cộng kho 2 lần (uq_web2_returns_knh_active chỉ phủ
        // khong_nhan_hang). Pre-check chạy TRONG transaction trước khi cộng ví.
        const DEDUPE_WINDOW_MS = 60 * 1000;
        const partialSig =
            subType === 'thu_ve_1_phan'
                ? items
                      .map((it) => `${it.productCode}:${it.quantity}`)
                      .sort()
                      .join('|')
                : null;

        // 2) Transaction ATOMIC: insert phiếu + áp tồn kho + CỘNG VÍ trong CÙNG
        // 1 client transaction. processDeposit nhận client → runWithTx chạy
        // trực tiếp trên client (không lồng transaction). Nếu cộng ví fail →
        // toàn bộ rollback (phiếu + kho không bị tạo lẻ) → trả lỗi rõ ràng,
        // không còn cửa sổ "phiếu+kho có nhưng ví chưa cộng" như khi cộng ví
        // SAU commit. _genCode retry on 23505 (race trùng code).
        const RETRY_MAX = 5;
        let inserted;
        let walletCreditedFinal = false;
        for (let attempt = 0; ; attempt++) {
            const code = await _genCode(pool);
            const now = Date.now();
            try {
                inserted = await withTransaction(pool, async (client) => {
                    // 3H2 FIX (2026-06-12): gắn vòng đời PBH nguồn cho phiếu
                    // "không nhận hàng" — TRONG cùng transaction:
                    //  1) chặn 2 phiếu active cùng đơn nguồn (pre-check + unique
                    //     index backstop uq_web2_returns_knh_active);
                    //  2) lock PBH nguồn FOR UPDATE, đọc wallet_deducted TƯƠI
                    //     làm số tiền cộng ví (chống race với cancel vừa hoàn);
                    //  3) sau khi cộng ví + áp kho → zero-out wallet_deducted +
                    //     SET stock_restored=TRUE để cancel/bulk-cancel/DELETE
                    //     PBH về sau KHÔNG double hoàn ví + double restock.
                    let knhPbhIds = [];
                    let pbhWalletSnapshot = [];
                    if (subType === 'khong_nhan_hang') {
                        const dup = await client.query(
                            `SELECT code FROM web2_returns
                             WHERE source_order_code = $1 AND sub_type = 'khong_nhan_hang'
                               AND status = 'active' LIMIT 1`,
                            [sourceOrderCode]
                        );
                        if (dup.rows[0]) {
                            const err = new Error(
                                `Đã có phiếu thu về ${dup.rows[0].code} (active) cho đơn ${sourceOrderCode}`
                            );
                            err.httpStatus = 409;
                            throw err;
                        }
                        const lockQ =
                            sourceOrderType === 'pbh'
                                ? await client.query(
                                      `SELECT id, wallet_deducted, returned_line_qty FROM fast_sale_orders
                                       WHERE number = $1 FOR UPDATE`,
                                      [sourceOrderCode]
                                  )
                                : await client.query(
                                      `SELECT id, wallet_deducted, returned_line_qty FROM fast_sale_orders
                                       WHERE source_type = 'native_order' AND source_code = $1
                                         AND state <> 'cancel'
                                       ORDER BY id FOR UPDATE`,
                                      [sourceOrderCode]
                                  );
                        knhPbhIds = lockQ.rows.map((r) => r.id);
                        // Snapshot giá trị wallet_deducted GỐC từng PBH → huỷ
                        // phiếu trả ĐÚNG về từng PBH (không dồn lump rows[0]).
                        pbhWalletSnapshot = lockQ.rows.map((r) => ({
                            id: Number(r.id),
                            walletDeducted: Number(r.wallet_deducted) || 0,
                        }));
                        const freshDeducted = lockQ.rows.reduce(
                            (s, r) => s + (Number(r.wallet_deducted) || 0),
                            0
                        );
                        walletCredit = freshDeducted > 0 ? freshDeducted : 0;
                        // FIX audit #2/#7: KNH restock chỉ phần CHƯA trả. SP đã thu về 1
                        // phần (thu_ve_1_phan) đã cộng kho + ghi returned_line_qty trên PBH
                        // nguồn → trừ ra để không restock 2 lần (phantom stock). Gán items =
                        // NET (full − returned/code) để _applyStock + record + huỷ-phiếu đối
                        // xứng (huỷ KNH đảo đúng phần net đã cộng).
                        const knhReturnedByCode = {};
                        for (const r of lockQ.rows) {
                            const rlq =
                                r.returned_line_qty && typeof r.returned_line_qty === 'object'
                                    ? r.returned_line_qty
                                    : {};
                            for (const [c, q] of Object.entries(rlq)) {
                                knhReturnedByCode[c] =
                                    (knhReturnedByCode[c] || 0) + (Number(q) || 0);
                            }
                        }
                        const _byCode = new Map();
                        for (const it of items) {
                            const c = it.productCode;
                            const q = Number(it.quantity) || 0;
                            if (!c || q <= 0) continue;
                            const prev = _byCode.get(c);
                            if (prev) prev.quantity += q;
                            else _byCode.set(c, { ...it, quantity: q });
                        }
                        items = [..._byCode.values()]
                            .map((it) => ({
                                ...it,
                                quantity: Math.max(
                                    0,
                                    it.quantity - (Number(knhReturnedByCode[it.productCode]) || 0)
                                ),
                            }))
                            .filter((it) => it.quantity > 0);
                    }
                    // FIX 2026-06-23 (#1 audit money): thu_ve_1_phan TRƯỚC ĐÂY cộng ví
                    // nhưng KHÔNG trừ wallet_deducted của PBH nguồn → huỷ/xoá/return-failed
                    // PBH về sau hoàn LẠI full wallet_deducted = HOÀN VÍ 2 LẦN. Fix đối xứng
                    // KNH nhưng TRỪ MỘT PHẦN: lock PBH nguồn FOR UPDATE, re-cap theo số TƯƠI,
                    // trừ walletCredit (clamp 0) phân bổ theo từng PBH, snapshot {id,dec} để
                    // DELETE phiếu trả cộng lại. KHÔNG set stock_restored (chỉ trả 1 phần).
                    // ⚠ KNOWN-LIMITATION (cập nhật audit 2026-06-26):
                    //   • pbh-source: thu_ve_1_phan GHI returned_line_qty[code] lên PBH nguồn
                    //     (dưới, ~L949) → restockOrderLines TRỪ ra khi huỷ PBH. Per-code
                    //     aggregation (audit #9, fast-sale-orders.js) đã chặn under-restock khi
                    //     PBH có dòng trùng mã. ⇒ over-restock partial-then-cancel ĐÃ được xử lý.
                    //   • CÒN LẠI (defer, cần focused + integration test seeded flow):
                    //     - audit #6: native-source thu_ve_1_phan KHÔNG ghi returned_line_qty lên
                    //       PBH live của native → huỷ PBH đó restock cả phần đã trả (over-restock).
                    //     - audit #2/#7: KNH (khong_nhan_hang) full-return SAU 1 phiếu thu_ve_1_phan
                    //       restock FULL order_lines, không trừ returned_line_qty → +partialQty thừa.
                    //   Xem docs/web2/FLOW-AUDIT-2026-06-26.md để fix có chủ đích (đụng money/stock).
                    if (subType === 'thu_ve_1_phan' && walletCredit > 0 && sourceOrderCode) {
                        const lockQ =
                            sourceOrderType === 'pbh'
                                ? await client.query(
                                      `SELECT id, wallet_deducted FROM fast_sale_orders
                                       WHERE number = $1 FOR UPDATE`,
                                      [sourceOrderCode]
                                  )
                                : await client.query(
                                      `SELECT id, wallet_deducted FROM fast_sale_orders
                                       WHERE source_type = 'native_order' AND source_code = $1
                                         AND state <> 'cancel'
                                       ORDER BY id FOR UPDATE`,
                                      [sourceOrderCode]
                                  );
                        const freshTotal = lockQ.rows.reduce(
                            (s, r) => s + (Number(r.wallet_deducted) || 0),
                            0
                        );
                        // Re-cap theo số TƯƠI (chống race: cancel/return khác vừa trừ).
                        walletCredit = Math.min(walletCredit, freshTotal);
                        let remaining = walletCredit;
                        const decs = [];
                        for (const r of lockQ.rows) {
                            if (remaining <= 0) break;
                            const avail = Number(r.wallet_deducted) || 0;
                            if (avail <= 0) continue;
                            const dec = Math.min(avail, remaining);
                            await client.query(
                                `UPDATE fast_sale_orders
                                 SET wallet_deducted = GREATEST(0, wallet_deducted - $2), date_updated = NOW()
                                 WHERE id = $1`,
                                [r.id, dec]
                            );
                            decs.push({ id: Number(r.id), dec });
                            remaining -= dec;
                        }
                        pbhWalletSnapshot = decs; // {id, dec} — DELETE phiếu trả cộng lại
                    }
                    // Dedupe thu_ve_1_phan: chặn phiếu active trùng (cùng phone +
                    // item-set) trong cửa sổ ngắn → tránh double-credit/double-stock
                    // khi double-submit/retry. So sánh chữ ký item-set đã sort.
                    if (subType === 'thu_ve_1_phan' && partialSig) {
                        const recent = await client.query(
                            `SELECT code, items FROM web2_returns
                             WHERE phone = $1 AND sub_type = 'thu_ve_1_phan'
                               AND status = 'active' AND created_at > $2`,
                            [phone, now - DEDUPE_WINDOW_MS]
                        );
                        for (const rr of recent.rows) {
                            const sig = (Array.isArray(rr.items) ? rr.items : [])
                                .map((x) => `${x.productCode}:${Number(x.quantity) || 0}`)
                                .sort()
                                .join('|');
                            if (sig === partialSig) {
                                const err = new Error(
                                    `Đã có phiếu thu về ${rr.code} (active) trùng SP vừa tạo`
                                );
                                err.httpStatus = 409;
                                throw err;
                            }
                        }
                    }
                    // FIX 2026-06-23 (audit vòng 4): kho CHỈ bị trừ khi tạo PBH
                    // (from-native-order / merge-to-pbh). Native order CHƯA convert
                    // sang PBH = CHƯA trừ kho → restock nó = BƠM TỒN ẢO. Chỉ restock
                    // khi nguồn THỰC SỰ đã trừ kho (có ≥1 PBH state<>'cancel'). pbh
                    // type: PBH luôn đã trừ kho → restock. native type: phải có PBH live.
                    let sourceDeductedStock = true;
                    if (sourceOrderType === 'native' && sourceOrderCode) {
                        if (subType === 'khong_nhan_hang') {
                            sourceDeductedStock = knhPbhIds.length > 0;
                        } else {
                            const pbhChk = await client.query(
                                `SELECT 1 FROM fast_sale_orders
                                 WHERE source_type = 'native_order' AND source_code = $1
                                   AND state <> 'cancel' LIMIT 1`,
                                [sourceOrderCode]
                            );
                            sourceDeductedStock = pbhChk.rows.length > 0;
                        }
                    }
                    // Disposition giu_rieng/huy (hàng lỗi/write-off) → KHÔNG nhập kho bán:
                    // reuse gate stock_applied=FALSE để create + DELETE đối xứng (không trừ
                    // kho ảo lúc huỷ). Ví vẫn cộng bình thường (khách vẫn được hoàn tiền).
                    if (skipStock) sourceDeductedStock = false;
                    if (sourceDeductedStock) {
                        await _applyStock(client, items, method, +1);
                    }
                    // thu_ve_1_phan cộng kho +qty NGAY, nhưng PBH vẫn còn order_lines đủ →
                    // cancel PBH sau restock cả dòng đã trả = kho +qty LẦN 2. Ghi qty đã trả
                    // vào returned_line_qty của PBH LIVE → restockOrderLines trừ ra.
                    // FIX audit #6: TRƯỚC chỉ làm cho pbh-source → native-source (trả theo mã
                    // native nhưng có PBH live) bị bỏ sót → huỷ PBH đó over-restock. Giờ xử lý
                    // CẢ pbh + native: resolve PBH live, phân bổ qty đã trả per-code (greedy
                    // theo SL dòng còn trống mỗi PBH cho trường hợp 1 native → nhiều PBH).
                    if (subType === 'thu_ve_1_phan' && sourceOrderCode && sourceDeductedStock) {
                        const pbhRows =
                            sourceOrderType === 'pbh'
                                ? await client.query(
                                      `SELECT id, order_lines, returned_line_qty FROM fast_sale_orders
                                       WHERE number = $1 FOR UPDATE`,
                                      [sourceOrderCode]
                                  )
                                : await client.query(
                                      `SELECT id, order_lines, returned_line_qty FROM fast_sale_orders
                                       WHERE source_type = 'native_order' AND source_code = $1
                                         AND state <> 'cancel'
                                       ORDER BY id FOR UPDATE`,
                                      [sourceOrderCode]
                                  );
                        // qty cần phân bổ per-code (gộp items trùng mã).
                        const remaining = {};
                        for (const it of items) {
                            const c = it.productCode;
                            const q = Number(it.quantity) || 0;
                            if (c && q > 0) remaining[c] = (remaining[c] || 0) + q;
                        }
                        for (const pbh of pbhRows.rows) {
                            const rlq =
                                pbh.returned_line_qty && typeof pbh.returned_line_qty === 'object'
                                    ? { ...pbh.returned_line_qty }
                                    : {};
                            // SL dòng của PBH này theo code (để cap room còn trống).
                            const lineQty = {};
                            for (const l of Array.isArray(pbh.order_lines) ? pbh.order_lines : []) {
                                const c = l.productCode || l.product_code || l.code;
                                const q = Number(l.quantity || l.qty) || 0;
                                if (c && q > 0) lineQty[c] = (lineQty[c] || 0) + q;
                            }
                            let changed = false;
                            for (const c of Object.keys(remaining)) {
                                if (remaining[c] <= 0) continue;
                                // pbh-source: cap theo dòng PBH; nhiều PBH native: greedy theo room.
                                const room = Math.max(0, (lineQty[c] || 0) - (Number(rlq[c]) || 0));
                                const alloc =
                                    pbhRows.rows.length === 1
                                        ? remaining[c] // 1 PBH → ghi hết phần còn lại
                                        : Math.min(remaining[c], room);
                                if (alloc > 0) {
                                    rlq[c] = (Number(rlq[c]) || 0) + alloc;
                                    remaining[c] -= alloc;
                                    changed = true;
                                }
                            }
                            if (changed) {
                                await client.query(
                                    `UPDATE fast_sale_orders
                                     SET returned_line_qty = $2::jsonb, date_updated = NOW()
                                     WHERE id = $1`,
                                    [pbh.id, JSON.stringify(rlq)]
                                );
                            }
                        }
                    }
                    // bill 0đ queue khi:
                    //  - thu_ve_1_phan + khach_gui + CÓ đơn gốc (không đơn gốc/orphan → KHÔNG có
                    //    PBH nào consume → kẹt queued mãi, audit LOW → chặn bằng !!sourceOrderCode)
                    //  - VÀ (hàng vào kho bán được: sourceDeductedStock) HOẶC (đổi hàng: isExchange
                    //    luôn cần shipper thu lại món cũ dù hàng lỗi giu_rieng — audit MEDIUM fix).
                    // shipper_gui → queue khi DUYỆT (approve).
                    const billStatus =
                        subType === 'thu_ve_1_phan' &&
                        method === 'khach_gui' &&
                        sourceOrderCode &&
                        (sourceDeductedStock || isExchange)
                            ? 'queued'
                            : null;
                    // Chênh lệch đổi hàng = giá trị SP đổi lấy − giá trị SP trả (chỉ để ghi
                    // nhận/hiển thị; tiền thực chốt ở PBH đổi dùng ví đã cộng để cấn trừ).
                    const exchangeDiff = isExchange
                        ? replacementItems.reduce((s, it) => s + it.price * it.quantity, 0) -
                          (Number(totalAmount) || 0)
                        : 0;
                    const hist = [
                        {
                            ts: now,
                            action: 'create',
                            userId: user.id,
                            userName: user.name,
                            note: `${method} / ${subType}${reason ? ' / ' + reason : ''}${isExchange ? ' / đổi hàng' : ''}${skipStock ? ' / ' + disposition : ''}`,
                        },
                    ];
                    // Cộng ví TRONG cùng transaction (client) — atomic với phiếu+kho.
                    // creditToWallet=false (tien_mat/ck): SKIP cộng số dư ví (trả tiền tay)
                    // NHƯNG PBH nguồn ĐÃ được settle (decs ở trên) → không double-refund khi
                    // huỷ PBH. wallet_credited lưu 0 (không có gì để đảo ở ví khi huỷ phiếu).
                    // customerBear: hoàn ví THẬT = walletCredit − khách chịu (clamp 0); PBH vẫn
                    // settle FULL (decs ở trên dùng walletCredit gốc — món đã trả về đủ).
                    const depositAmt = Math.max(0, walletCredit - customerBear);
                    let walletTxId = null;
                    if (depositAmt > 0 && creditToWallet) {
                        const dep = await web2WalletService.processDeposit(
                            client,
                            phone,
                            depositAmt,
                            // FIX audit R2 (#8): sourceId = mã phiếu trả → reference_type
                            // 'balance_history' + reference_id=code → idempotent (MED-6 in-tx
                            // dedup), không còn dựa hoàn toàn vào row lock. Defense thêm cạnh
                            // code UNIQUE của web2_returns.
                            code,
                            `Thu về ${code}`,
                            b.customerId || null,
                            null,
                            null,
                            user.name
                        );
                        walletTxId = dep?.transaction?.id || null;
                    }
                    const ins = await client.query(
                        `INSERT INTO web2_returns
                          (code, phone, customer_name, customer_id, method, sub_type, issue, reason, reason_note,
                           source_order_code, source_order_type, items, total_amount, wallet_credited,
                           wallet_tx_id, stock_status, bill_status, status, note, history, created_at, updated_at,
                           created_by, created_by_name, pbh_wallet_snapshot, stock_applied,
                           disposition, return_shipping_fee, fee_bearer, refund_method, is_exchange,
                           replacement_items, exchange_diff, customer_bear)
                         VALUES ($1,$2,$3,$4,$5,$6,'van_de_khach',$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,'active',$17,$18::jsonb,$19,$19,$20,$21,$22::jsonb,$23,
                                 $24,$25,$26,$27,$28,$29::jsonb,$30,$31)
                         RETURNING *`,
                        [
                            code,
                            phone,
                            b.customerName || null,
                            b.customerId || null,
                            method,
                            subType,
                            reason,
                            reasonNote,
                            sourceOrderCode,
                            sourceOrderType,
                            JSON.stringify(items),
                            totalAmount,
                            // Ví CỘNG THẬT (số dư) = walletCredit − customerBear, chỉ khi hoàn
                            // qua ví/công nợ. tien_mat/ck → 0 (PBH đã settle qua decs; huỷ phiếu
                            // chỉ đảo PBH, không đảo ví). Đây cũng là số DELETE sẽ rút lại.
                            creditToWallet ? depositAmt : 0,
                            walletTxId,
                            stockStatus,
                            billStatus,
                            b.note || null,
                            JSON.stringify(hist),
                            now,
                            user.id,
                            user.name,
                            JSON.stringify(pbhWalletSnapshot),
                            // FIX 2026-06-23 (browser-test bắt regression vòng 4): ghi
                            // stock CÓ THẬT SỰ được cộng không (sourceDeductedStock).
                            // Native-only (no PBH) = gate skip _applyStock → FALSE → DELETE
                            // PHẢI skip trừ kho (nếu không huỷ phiếu sẽ trừ kho ảo = mất hàng).
                            sourceDeductedStock,
                            disposition,
                            returnShippingFee,
                            feeBearer,
                            refundMethod,
                            isExchange,
                            JSON.stringify(replacementItems),
                            exchangeDiff,
                            customerBear,
                        ]
                    );
                    // 3H2: đánh dấu PBH nguồn đã quyết toán qua phiếu thu về.
                    if (knhPbhIds.length) {
                        await client.query(
                            `UPDATE fast_sale_orders
                             SET wallet_deducted = 0, stock_restored = TRUE, date_updated = NOW()
                             WHERE id = ANY($1::bigint[])`,
                            [knhPbhIds]
                        );
                    }
                    return ins.rows[0];
                });
                walletCreditedFinal = depositAmt > 0 && creditToWallet;
                break;
            } catch (e) {
                if (e && e.httpStatus) {
                    return res.status(e.httpStatus).json({ error: e.message });
                }
                // 3H2: race 2 phiếu cùng đơn nguồn lọt qua pre-check → unique
                // index backstop bắn 23505 — trả 409 thay vì retry vô ích.
                if (e && e.code === '23505' && e.constraint === 'uq_web2_returns_knh_active') {
                    return res.status(409).json({
                        error: `Đã có phiếu thu về active cho đơn ${sourceOrderCode}`,
                    });
                }
                // Trùng code (race _genCode không atomic) → retry với code mới.
                if (e && e.code === '23505' && attempt < RETRY_MAX) continue;
                throw e;
            }
        }

        if (walletCreditedFinal) _notifyWallet(phone);
        await _recomputeParents(pool, inserted.items);
        _notify('create', inserted.code, { phone });
        _auditReturn(req, 'create', inserted.code, 'Tạo phiếu trả hàng');
        res.json({ success: true, return: mapRow(inserted) });
    } catch (e) {
        console.error('[WEB2-RETURNS] create error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/web2-returns/:code/approve
// Duyệt shipper_gui pending → return_qty chuyển sang stock thật.
// =====================================================
router.post('/:code/approve', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const user = _user(req);
    try {
        await ensureTables(pool);
        const now = Date.now();
        let approvedItems = [];
        // FOR UPDATE: lock record return TRƯỚC khi check trạng thái + cộng stock.
        // Chống 2 admin double-approve (stock cộng 2 lần). Re-check guard SAU khi
        // lock — admin thua race sẽ thấy stock_status='approved' → reject.
        try {
            await withTransaction(pool, async (client) => {
                const cur = await client.query(
                    'SELECT * FROM web2_returns WHERE code = $1 FOR UPDATE',
                    [req.params.code]
                );
                if (!cur.rows[0]) {
                    const err = new Error('Not found');
                    err.httpStatus = 404;
                    throw err;
                }
                const row = cur.rows[0];
                if (row.status !== 'active') {
                    const err = new Error('Phiếu đã huỷ');
                    err.httpStatus = 400;
                    throw err;
                }
                if (row.method !== 'shipper_gui' || row.stock_status !== 'pending') {
                    const err = new Error('Phiếu không ở trạng thái chờ duyệt');
                    err.httpStatus = 400;
                    throw err;
                }
                const items = Array.isArray(row.items) ? row.items : [];
                approvedItems = items;
                // return_qty → stock cho từng SP. CHỈ khi create thật sự đã cộng
                // return_qty (stock_applied). Native-only (gate skip) → return_qty chưa
                // tăng → duyệt mà cộng stock = bơm tồn ảo → skip. (đối xứng DELETE)
                // Duyệt "thu về" → return_qty → stock (batch VALUES, gom theo mã: 1 query
                // thay N — audit #HIGH). Un-retire HET_HANG → DANG_BAN/MUA_1_PHAN + hiện lại.
                // CHỈ khi create thật sự đã cộng return_qty (stock_applied). Native-only (gate
                // skip) → return_qty chưa tăng → duyệt cộng stock = tồn ảo → skip (đối xứng DELETE).
                const approveDeltas = new Map();
                if (row.stock_applied !== false) {
                    for (const it of items) {
                        const qty = Number(it.quantity) || 0;
                        if (!it.productCode || qty <= 0) continue;
                        approveDeltas.set(
                            it.productCode,
                            (approveDeltas.get(it.productCode) || 0) + qty
                        );
                    }
                }
                if (approveDeltas.size) {
                    const params = [now];
                    const valuesSql = [...approveDeltas.entries()]
                        .map(([code, qty]) => {
                            params.push(code, qty);
                            return `($${params.length - 1}::text, $${params.length}::int)`;
                        })
                        .join(',');
                    await client.query(
                        `UPDATE web2_products AS p
                         SET return_qty = GREATEST(0, COALESCE(p.return_qty, 0) - v.qty),
                             stock = p.stock + v.qty,
                             status = CASE WHEN p.status = 'HET_HANG' AND p.stock + v.qty > 0
                                           THEN (CASE WHEN COALESCE(p.pending_qty, 0) > 0 THEN 'MUA_1_PHAN' ELSE 'DANG_BAN' END)
                                           ELSE p.status END,
                             is_active = CASE WHEN p.status = 'HET_HANG' AND p.stock + v.qty > 0 THEN true ELSE p.is_active END,
                             updated_at = $1
                         FROM (VALUES ${valuesSql}) AS v(code, qty)
                         WHERE p.code = v.code`,
                        params
                    );
                }
                const hist = Array.isArray(row.history) ? row.history : [];
                hist.push({ ts: now, action: 'approve', userId: user.id, userName: user.name });
                // shipper_gui thu_ve_1_phan: hàng GIỜ mới vào kho bán → mở hàng đợi bill 0đ
                // (lúc create shipper_gui = null, không queue sớm khi chưa duyệt — audit #HIGH).
                // Đổi hàng (is_exchange) LUÔN cần shipper thu lại món cũ dù hàng lỗi
                // (stock_applied=false do giu_rieng) → vẫn queue khi duyệt (audit MEDIUM).
                const newBillStatus =
                    row.sub_type === 'thu_ve_1_phan' &&
                    (row.stock_applied !== false || row.is_exchange === true) &&
                    row.source_order_code &&
                    row.bill_status == null
                        ? 'queued'
                        : row.bill_status;
                await client.query(
                    `UPDATE web2_returns
                     SET stock_status = 'approved', approved_at = $1, approved_by = $2,
                         history = $3::jsonb, bill_status = $5, updated_at = $1
                     WHERE code = $4`,
                    [now, user.name, JSON.stringify(hist), req.params.code, newBillStatus]
                );
            });
        } catch (e) {
            if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
            throw e;
        }
        await _recomputeParents(pool, approvedItems);
        _notify('approve', req.params.code);
        _auditReturn(req, 'approve', req.params.code, 'Duyệt phiếu trả hàng');
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-RETURNS] approve error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/web2-returns/:code/mark-consumed
// Body: { pbhCode } — native-orders gọi sau khi tạo PBH dùng SP queued.
// =====================================================
router.post('/:code/mark-consumed', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `UPDATE web2_returns
             SET bill_status = 'consumed', consumed_pbh_code = $1, updated_at = $2
             WHERE code = $3 AND bill_status = 'queued'
             RETURNING code`,
            [req.body?.pbhCode || null, Date.now(), req.params.code]
        );
        if (!r.rows[0]) return res.status(404).json({ error: 'Not found or already consumed' });
        _notify('consumed', req.params.code);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// DELETE /api/web2-returns/:code — huỷ phiếu + rollback ví/kho
// =====================================================
router.delete('/:code', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const user = _user(req);
    // "Từ chối" hàng shipper gửi về (lỗi/không đúng) = huỷ phiếu pending với cờ decline
    // + lý do. Đảo kho/ví Y HỆT huỷ thường (pending → trả return_qty, hoàn ví) — chỉ khác
    // NHÃN action trong history để phân biệt "từ chối nhận" vs "huỷ do tạo nhầm".
    const _declined = (req.body && req.body.declined) === true;
    const _declineReason =
        req.body && req.body.reason ? String(req.body.reason).slice(0, 300) : null;
    try {
        await ensureTables(pool);
        // FOR UPDATE: lock record TRƯỚC khi check trạng thái + rollback kho/ví.
        // Chống 2 request huỷ đồng thời cùng pass guard (kho trừ 2 lần + ví rút
        // 2 lần). Revert ví chạy TRONG cùng transaction (processWithdraw/
        // processDeposit nhận client → runWithTx chạy trực tiếp trên client) —
        // crash giữa chừng → rollback toàn bộ, không còn cửa sổ "phiếu huỷ +
        // kho đã trừ nhưng ví chưa revert". Ví không đủ số dư để thu hồi →
        // 409, KHÔNG huỷ phiếu (an toàn tiền hơn lệch ví im lặng).
        let cancelledPhone = null;
        let walletReverted = false;
        let cancelledItems = [];
        try {
            await withTransaction(pool, async (client) => {
                const cur = await client.query(
                    'SELECT * FROM web2_returns WHERE code = $1 FOR UPDATE',
                    [req.params.code]
                );
                if (!cur.rows[0]) {
                    const err = new Error('Not found');
                    err.httpStatus = 404;
                    throw err;
                }
                const row = cur.rows[0];
                if (row.status !== 'active') {
                    // Idempotent: đã huỷ rồi → 409, KHÔNG đụng kho/ví lần 2.
                    const err = new Error('Phiếu đã huỷ');
                    err.httpStatus = 409;
                    throw err;
                }
                // FIX 2026-06-23 (audit vòng 4): chặn huỷ phiếu thu_ve_1_phan ĐÃ lên
                // bill 0đ (bill_status='consumed'). SP đã được XUẤT LẠI qua PBH đổi →
                // huỷ phiếu thu về sẽ trừ kho LẦN 2 (net âm/clamp 0 = mất hàng) +
                // re-add wallet_deducted cho PBH nguồn dù KH đã nhận hàng đổi = lệch
                // kho + over-refund ví. Muốn đảo: huỷ PBH đổi (consumed_pbh_code) trước.
                if (row.bill_status === 'consumed') {
                    const err = new Error(
                        `Phiếu đã lên bill đổi ${row.consumed_pbh_code || ''} — huỷ PBH đổi đó trước, không huỷ phiếu thu về trực tiếp`
                    );
                    err.httpStatus = 409;
                    throw err;
                }
                const items = Array.isArray(row.items) ? row.items : [];
                cancelledItems = items;
                const now = Date.now();
                // Rollback tồn kho — CHỈ khi lúc tạo phiếu kho ĐÃ thật sự được cộng
                // (stock_applied). Native order chưa convert PBH = create gate skip
                // _applyStock (stock_applied=FALSE) → huỷ phiếu KHÔNG trừ kho (nếu trừ
                // = mất hàng ảo; browser-test bắt: tạo giữ 50 → huỷ rớt 48). Phiếu cũ
                // stock_applied default TRUE → huỷ vẫn trừ đúng.
                //  - applied / approved → đã vào stock thật → trừ stock.
                //  - pending → đang ở return_qty → trừ return_qty.
                if (row.stock_applied !== false) {
                    if (row.stock_status === 'pending') {
                        await _applyStock(client, items, 'shipper_gui', -1);
                    } else {
                        for (const it of items) {
                            const qty = Number(it.quantity) || 0;
                            if (!it.productCode || qty <= 0) continue;
                            // Huỷ thu về → rút lại tồn đã cộng. Nếu SP ĐANG BÁN về 0 +
                            // hết chờ → HET_HANG + ẩn (logic mới 2026-06-28). Guard
                            // is_active=true → không đụng SP user tự "Tạm dừng".
                            await client.query(
                                `UPDATE web2_products
                                 SET stock = GREATEST(0, stock - $1),
                                     status = CASE WHEN GREATEST(0, stock - $1) = 0 AND COALESCE(pending_qty, 0) = 0 AND is_active = true
                                                   THEN 'HET_HANG' ELSE status END,
                                     is_active = CASE WHEN GREATEST(0, stock - $1) = 0 AND COALESCE(pending_qty, 0) = 0 AND is_active = true
                                                      THEN false ELSE is_active END,
                                     updated_at = $2
                                 WHERE code = $3`,
                                [qty, now, it.productCode]
                            );
                        }
                    }
                }
                // Rollback ví TRONG transaction: credited>0 (đã cộng) → rút lại;
                // credited<0 (đã trừ — vd Sửa COD trừ công nợ khách) → hoàn lại.
                const credited = Number(row.wallet_credited) || 0;
                if (credited !== 0 && row.phone) {
                    if (credited > 0) {
                        try {
                            await web2WalletService.processWithdraw(
                                client,
                                row.phone,
                                credited,
                                'return',
                                req.params.code,
                                `Huỷ thu về ${req.params.code}`,
                                user.name
                            );
                        } catch (e) {
                            if (String(e.message).includes('Số dư không đủ')) {
                                const err = new Error('Ví không đủ số dư để thu hồi — xử lý tay');
                                err.httpStatus = 409;
                                throw err;
                            }
                            throw e;
                        }
                    } else {
                        await web2WalletService.processDeposit(
                            client,
                            row.phone,
                            -credited,
                            // FIX audit R2 (#8): sourceId riêng cho hoàn-ví-huỷ → idempotent
                            // (huỷ phiếu 2 lần không hoàn ví 2 lần).
                            `rtn-cancel:${req.params.code}`,
                            `Hoàn ví huỷ phiếu COD ${req.params.code}`,
                            row.customer_id || null,
                            null,
                            null,
                            user.name
                        );
                    }
                    walletReverted = true;
                }
                const hist = Array.isArray(row.history) ? row.history : [];
                hist.push({
                    ts: now,
                    action: _declined ? 'decline' : 'cancel',
                    userId: user.id,
                    userName: user.name,
                    note: _declineReason || undefined,
                });
                const upd = await client.query(
                    `UPDATE web2_returns SET status = 'cancelled', history = $1::jsonb, updated_at = $2
                     WHERE code = $3 AND status = 'active' RETURNING code`,
                    [JSON.stringify(hist), now, req.params.code]
                );
                if (!upd.rows[0]) {
                    const err = new Error('Phiếu đã huỷ');
                    err.httpStatus = 409;
                    throw err;
                }
                // 3H2: phiếu khong_nhan_hang lúc TẠO đã zero-out wallet_deducted
                // + SET stock_restored=TRUE trên PBH nguồn. Huỷ phiếu = kho bị
                // trừ lại + ví bị rút lại (ở trên) → trả cờ về như cũ để vòng
                // đời PBH (cancel sau này) lại restock/hoàn ví đúng.
                if (row.sub_type === 'khong_nhan_hang' && row.source_order_code) {
                    // Mirror filter create-time (state <> 'cancel') trên native →
                    // không re-attach wallet_deducted lên PBH đã huỷ (cancel flow
                    // không còn với tới → under-refund vĩnh viễn).
                    const lockQ =
                        row.source_order_type === 'pbh'
                            ? await client.query(
                                  // BUG FIX (2026-06-24): thiếu `state <> 'cancel'` ở nhánh pbh
                                  // (2 nhánh kia + comment 1309-1311 đều có) → re-arm
                                  // wallet_deducted/stock_restored lên PBH ĐÃ HUỶ → cancel sau
                                  // double-refund ví + phantom-restock. Mirror native branch.
                                  `SELECT id FROM fast_sale_orders WHERE number = $1 AND state <> 'cancel' FOR UPDATE`,
                                  [row.source_order_code]
                              )
                            : await client.query(
                                  `SELECT id FROM fast_sale_orders
                                   WHERE source_type = 'native_order' AND source_code = $1
                                     AND state <> 'cancel'
                                   ORDER BY id FOR UPDATE`,
                                  [row.source_order_code]
                              );
                    if (lockQ.rows.length) {
                        const liveIds = new Set(lockQ.rows.map((r) => Number(r.id)));
                        await client.query(
                            `UPDATE fast_sale_orders
                             SET stock_restored = FALSE, date_updated = NOW()
                             WHERE id = ANY($1::bigint[])`,
                            [[...liveIds]]
                        );
                        const creditedBack = Number(row.wallet_credited) || 0;
                        if (creditedBack > 0) {
                            // Trả ĐÚNG giá trị gốc về TỪNG PBH theo snapshot lúc tạo
                            // (không dồn lump rows[0] → PBH #2..N kẹt 0). Chỉ PBH
                            // còn lock được (state<>'cancel') mới restore.
                            const snap = Array.isArray(row.pbh_wallet_snapshot)
                                ? row.pbh_wallet_snapshot
                                : [];
                            const restorable = snap.filter(
                                (s) => liveIds.has(Number(s.id)) && Number(s.walletDeducted) > 0
                            );
                            if (restorable.length) {
                                for (const s of restorable) {
                                    await client.query(
                                        `UPDATE fast_sale_orders SET wallet_deducted = $1 WHERE id = $2`,
                                        [Number(s.walletDeducted) || 0, Number(s.id)]
                                    );
                                }
                                // Phòng lệch (snapshot thiếu / PBH mới): nếu tổng
                                // restore < creditedBack, dồn phần dư về PBH đầu
                                // còn live để cancel sau vẫn hoàn đủ tổng.
                                const restored = restorable.reduce(
                                    (s2, s) => s2 + (Number(s.walletDeducted) || 0),
                                    0
                                );
                                const remainder = creditedBack - restored;
                                if (remainder > 0) {
                                    // FIX audit 2026-07-01 (over-refund edge): CAP phần dồn
                                    // ≤ (amount_total − wallet_deducted hiện tại) của PBH đầu
                                    // → wallet_deducted KHÔNG vượt giá trị đơn → cancel PBH sau
                                    // KHÔNG hoàn ví quá số KH thực trả. Nếu không đủ chỗ (đã đầy)
                                    // → warn (phần dư kẹt, chấp nhận under-refund > over-refund).
                                    await _restoreCapped(
                                        client,
                                        lockQ.rows[0].id,
                                        remainder,
                                        row.code
                                    );
                                }
                            } else {
                                // Không có snapshot khớp (data cũ) → fallback về PBH đầu,
                                // NHƯNG cap ≤ amount_total (chống over-refund như trên).
                                await _restoreCapped(
                                    client,
                                    lockQ.rows[0].id,
                                    creditedBack,
                                    row.code
                                );
                            }
                        }
                    }
                } else if (row.sub_type === 'thu_ve_1_phan' && row.source_order_code) {
                    // FIX over-restock reverse: huỷ phiếu trả 1 phần → TRỪ LẠI returned_line_qty
                    // trên PBH nguồn (đối xứng tăng lúc tạo) để cancel PBH sau restock ĐỦ phần
                    // chưa-trả. (stock đã un-restock ở block _applyStock(-1) phía trên.)
                    // FIX audit #6 (reverse): mở rộng cho CẢ native-source (de-allocate greedy
                    // qua các PBH live), không chỉ pbh — đối xứng với create-side.
                    if (row.stock_applied !== false) {
                        const pbhRows =
                            row.source_order_type === 'pbh'
                                ? await client.query(
                                      `SELECT id, returned_line_qty FROM fast_sale_orders
                                       WHERE number = $1 FOR UPDATE`,
                                      [row.source_order_code]
                                  )
                                : await client.query(
                                      `SELECT id, returned_line_qty FROM fast_sale_orders
                                       WHERE source_type = 'native_order' AND source_code = $1
                                         AND state <> 'cancel'
                                       ORDER BY id FOR UPDATE`,
                                      [row.source_order_code]
                                  );
                        const remaining = {};
                        for (const it of items) {
                            const c = it.productCode;
                            const q = Number(it.quantity) || 0;
                            if (c && q > 0) remaining[c] = (remaining[c] || 0) + q;
                        }
                        for (const pbh of pbhRows.rows) {
                            const rlq =
                                pbh.returned_line_qty && typeof pbh.returned_line_qty === 'object'
                                    ? { ...pbh.returned_line_qty }
                                    : {};
                            let changed = false;
                            for (const c of Object.keys(remaining)) {
                                if (remaining[c] <= 0) continue;
                                const cur = Number(rlq[c]) || 0;
                                const dealloc = Math.min(remaining[c], cur);
                                if (dealloc > 0) {
                                    rlq[c] = cur - dealloc;
                                    remaining[c] -= dealloc;
                                    changed = true;
                                }
                            }
                            if (changed) {
                                await client.query(
                                    `UPDATE fast_sale_orders
                                     SET returned_line_qty = $2::jsonb, date_updated = NOW()
                                     WHERE id = $1`,
                                    [pbh.id, JSON.stringify(rlq)]
                                );
                            }
                        }
                    }
                    // FIX 2026-06-23 (#1 audit): huỷ phiếu trả 1 phần → CỘNG LẠI phần
                    // wallet_deducted đã trừ về từng PBH nguồn (snapshot {id,dec}). Chỉ
                    // PBH còn live (state<>'cancel') mới cộng lại; PBH đã huỷ thì cancel
                    // đã hoàn ví rồi → KHÔNG re-attach (tránh over-refund). Không đụng
                    // stock_restored (trả 1 phần — _applyStock(-1) lo phần SP trả lại).
                    const snap = Array.isArray(row.pbh_wallet_snapshot)
                        ? row.pbh_wallet_snapshot
                        : [];
                    const decs = snap.filter((s) => Number(s.dec) > 0);
                    if (decs.length) {
                        const liveQ = await client.query(
                            `SELECT id FROM fast_sale_orders
                             WHERE id = ANY($1::bigint[]) AND state <> 'cancel' FOR UPDATE`,
                            [decs.map((s) => Number(s.id))]
                        );
                        const liveIds = new Set(liveQ.rows.map((r) => Number(r.id)));
                        for (const s of decs) {
                            if (!liveIds.has(Number(s.id))) continue;
                            await client.query(
                                `UPDATE fast_sale_orders
                                 SET wallet_deducted = wallet_deducted + $1, date_updated = NOW()
                                 WHERE id = $2`,
                                [Number(s.dec) || 0, Number(s.id)]
                            );
                        }
                    }
                }
                cancelledPhone = row.phone;
            });
        } catch (e) {
            if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
            throw e;
        }

        if (walletReverted) _notifyWallet(cancelledPhone);
        await _recomputeParents(pool, cancelledItems);
        _notify('cancel', req.params.code, { phone: cancelledPhone });
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-RETURNS] delete error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
