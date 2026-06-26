// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — BÁO CÁO KHO (warehouse report)
// Tổng hợp MUA VÀO (Sổ Order) vs BÁN RA (PBH) theo Sản phẩm và theo NCC,
// có lọc khoảng ngày. Consumer: web2/report-warehouse/.
//
// Nguồn dữ liệu (đều ở web2Db):
//   • MUA VÀO  → web2_so_order (1 doc JSONB doc_id='main', shape {tabs[].shipments[].rows[]}).
//                Đơn vị tiền per-row = costPrice × tab.rate (VND). Lọc theo shipment.date.
//                  - Đã nhận (mua vào) = SL nhận THẬT (mirror lib/web2-so-order-qty.js):
//                      received → qty ; partial_received → min(qtyReceived, qty) ; draft → 0.
//                  - Chưa nhận         = phần chưa về kho = qty − SL nhận thật:
//                      draft → qty ; partial_received → qty − min(qtyReceived, qty) ; received → 0.
//                  - cancelled → loại hoàn toàn.
//                Đã nhận + Chưa nhận = tổng đặt (trừ huỷ) → cộng dồn nhất quán.
//   • BÁN RA   → fast_sale_orders state='done' (Hoàn thành), order_lines[]. Lọc theo date_invoice (GMT+7).
//   • NCC + tên SP canonical → web2_products.supplier/name (join theo code).
//
// Endpoints (mount /api/web2-warehouse-report):
//   GET /summary?from=YYYY-MM-DD&to=YYYY-MM-DD → { success, range, totals, products[], suppliers[] }
//
// Read-only — không mutation, không SSE publish. Frontend tự reload qua SSE
// topic web2:so-order / web2:fast-sale-orders.
// =====================================================

const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

// Gate MỀM (analytics tồn kho/giá vốn — nhạy cảm). Enforce 401 khi WEB2_AUTH_ENFORCE='1'.
router.use(requireWeb2AuthSoft);

const SO_DOC_ID = 'main';
const UNKNOWN_SUPPLIER = '(Không rõ NCC)';

// SL ĐÃ NHẬN THẬT của 1 row so-order (mirror render.com/lib/web2-so-order-qty.js — nguồn
// canonical, dùng chung supplier-wallet/purchase-refund). partial_received nhận 2/10 → 2,
// KHÔNG phải 10 (qtyReceived persist trên row qua updateRow lúc nhận hàng).
function receivedQtyOf(r, orderedQty) {
    const st = (r && r.status) || 'draft';
    if (st === 'received') return orderedQty;
    if (st === 'partial_received') return Math.min(num(r && r.qtyReceived), orderedQty);
    return 0; // draft (+ legacy 'ordered') → chưa nhận
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
function normCode(c) {
    return String(c || '')
        .trim()
        .toUpperCase();
}
function isYmd(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}
// Hôm nay theo GMT+7 (server có thể chạy TZ=Asia/Saigon hoặc UTC → cộng tay cho chắc).
function todayYmdGmt7() {
    return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDaysYmd(ymd, delta) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
}

// GET /summary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/summary', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        let to = isYmd(req.query.to) ? req.query.to : todayYmdGmt7();
        let from = isYmd(req.query.from) ? req.query.from : addDaysYmd(to, -29);
        if (from > to) {
            const t = from;
            from = to;
            to = t;
        }

        // key SP → bucket. code-keyed merge mua vào ↔ bán ra; rows chưa gắn mã → name-keyed.
        const products = new Map();
        const getP = (key, seed) => {
            let p = products.get(key);
            if (!p) {
                p = {
                    code: null,
                    name: '',
                    variant: '',
                    supplier: '',
                    buyQty: 0,
                    buyAmount: 0,
                    pendingQty: 0,
                    pendingAmount: 0,
                    sellQty: 0,
                    sellAmount: 0,
                    ...(seed || {}),
                };
                products.set(key, p);
            }
            return p;
        };

        const soCodes = new Set();
        const sellCodes = new Set();

        // ---------- MUA VÀO + CHƯA NHẬN (Sổ Order) ----------
        const soRes = await pool
            .query(`SELECT data FROM web2_so_order WHERE doc_id = $1`, [SO_DOC_ID])
            .catch(() => ({ rows: [] }));
        const soData = soRes.rows[0] && soRes.rows[0].data ? soRes.rows[0].data : null;
        if (soData && Array.isArray(soData.tabs)) {
            for (const tab of soData.tabs) {
                const rate = num(tab && tab.rate) || 1;
                const shipments = Array.isArray(tab && tab.shipments) ? tab.shipments : [];
                for (const sh of shipments) {
                    const d = String((sh && sh.date) || '').slice(0, 10);
                    if (!isYmd(d) || d < from || d > to) continue;
                    const rows = Array.isArray(sh && sh.rows) ? sh.rows : [];
                    for (const r of rows) {
                        const status = String((r && r.status) || 'draft');
                        if (status === 'cancelled') continue;
                        const qty = num(r && r.qty);
                        if (qty <= 0) continue;
                        const costVnd = num(r && r.costPrice) * rate;
                        const code = normCode(r && r.matchedCode);
                        const name = String((r && r.productName) || '').trim();
                        const variant = String((r && r.variant) || '').trim();
                        const key = code
                            ? 'C:' + code
                            : 'N:' + name.toLowerCase() + '|' + variant.toLowerCase();
                        const p = getP(key, {
                            code: code || null,
                            name,
                            variant,
                            supplier: String((r && r.supplier) || '').trim(),
                        });
                        if (code) soCodes.add(code);
                        if (!p.name && name) p.name = name;
                        if (!p.variant && variant) p.variant = variant;
                        if (!p.supplier && r && r.supplier) p.supplier = String(r.supplier).trim();
                        // Tách chính xác đã-nhận vs chưa-nhận theo SL nhận thật.
                        const recvQty = receivedQtyOf(r, qty);
                        const pendQty = qty - recvQty;
                        if (recvQty > 0) {
                            p.buyQty += recvQty;
                            p.buyAmount += recvQty * costVnd;
                        }
                        if (pendQty > 0) {
                            p.pendingQty += pendQty;
                            p.pendingAmount += pendQty * costVnd;
                        }
                    }
                }
            }
        }

        // ---------- BÁN RA (PBH Hoàn thành) ----------
        const sellRes = await pool
            .query(
                `SELECT order_lines FROM fast_sale_orders
                 WHERE state = 'done'
                   AND (date_invoice AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date`,
                [from, to]
            )
            .catch(() => ({ rows: [] }));
        for (const row of sellRes.rows) {
            const lines = Array.isArray(row.order_lines) ? row.order_lines : [];
            for (const l of lines) {
                const code = normCode(l && (l.productCode || l.product_code || l.code));
                const qty = num(l && (l.quantity != null ? l.quantity : l.qty));
                if (qty <= 0) continue;
                const price = num(l && (l.priceUnit != null ? l.priceUnit : l.price));
                const disc = num(l && (l.discountAmount != null ? l.discountAmount : l.discount));
                const amount = qty * price - disc;
                const name = String((l && (l.productName || l.name)) || '').trim();
                const key = code ? 'C:' + code : 'N:' + name.toLowerCase() + '|';
                const p = getP(key, { code: code || null, name, variant: '' });
                if (code) sellCodes.add(code);
                if (!p.name && name) p.name = name;
                p.sellQty += qty;
                p.sellAmount += amount;
            }
        }

        // ---------- Tên + NCC canonical từ web2_products ----------
        const allCodes = [...new Set([...soCodes, ...sellCodes])];
        if (allCodes.length) {
            const pr = await pool
                .query(
                    `SELECT code, name, supplier FROM web2_products WHERE code = ANY($1::text[])`,
                    [allCodes]
                )
                .catch(() => ({ rows: [] }));
            const meta = new Map(pr.rows.map((x) => [normCode(x.code), x]));
            for (const p of products.values()) {
                if (!p.code) continue;
                const m = meta.get(normCode(p.code));
                if (!m) continue;
                if (m.name) p.name = m.name; // tên canonical kho
                if (m.supplier) p.supplier = String(m.supplier).trim(); // NCC canonical kho
            }
        }

        // ---------- chuẩn hoá + round ----------
        for (const p of products.values()) {
            if (!p.supplier) p.supplier = UNKNOWN_SUPPLIER;
            if (!p.name) p.name = p.code || '(không tên)';
            p.buyAmount = Math.round(p.buyAmount);
            p.pendingAmount = Math.round(p.pendingAmount);
            p.sellAmount = Math.round(p.sellAmount);
        }

        // ---------- gom theo NCC ----------
        const suppliers = new Map();
        for (const p of products.values()) {
            let s = suppliers.get(p.supplier);
            if (!s) {
                s = {
                    supplier: p.supplier,
                    productCount: 0,
                    buyQty: 0,
                    buyAmount: 0,
                    pendingQty: 0,
                    pendingAmount: 0,
                    sellQty: 0,
                    sellAmount: 0,
                };
                suppliers.set(p.supplier, s);
            }
            s.productCount += 1;
            s.buyQty += p.buyQty;
            s.buyAmount += p.buyAmount;
            s.pendingQty += p.pendingQty;
            s.pendingAmount += p.pendingAmount;
            s.sellQty += p.sellQty;
            s.sellAmount += p.sellAmount;
        }

        const rank = (x) => x.buyAmount + x.sellAmount + x.pendingAmount;
        const productList = [...products.values()].sort((a, b) => rank(b) - rank(a));
        const supplierList = [...suppliers.values()].sort((a, b) => rank(b) - rank(a));

        const totals = productList.reduce(
            (t, p) => {
                t.buyQty += p.buyQty;
                t.buyAmount += p.buyAmount;
                t.pendingQty += p.pendingQty;
                t.pendingAmount += p.pendingAmount;
                t.sellQty += p.sellQty;
                t.sellAmount += p.sellAmount;
                return t;
            },
            { buyQty: 0, buyAmount: 0, pendingQty: 0, pendingAmount: 0, sellQty: 0, sellAmount: 0 }
        );
        totals.productCount = productList.length;
        totals.supplierCount = supplierList.length;

        res.json({
            success: true,
            range: { from, to },
            totals,
            products: productList,
            suppliers: supplierList,
        });
    } catch (e) {
        console.error('[WEB2-WAREHOUSE-REPORT] summary error:', e.message);
        res.status(500).json({ success: false, error: 'Internal error' });
    }
});

module.exports = router;
