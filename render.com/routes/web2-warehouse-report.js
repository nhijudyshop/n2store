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
//   • NCC + tên SP + ĐỊA DANH canonical → web2_products.supplier/name/region (join theo code).
//
// Phân cấp: ĐỊA DANH (HÀ NỘI/HƯƠNG CHÂU… = tab.label Sổ Order / web2_products.region)
//   là CHA của NCC và Sản phẩm. suppliers[] gom theo (region, supplier); regions[] rollup.
//
// Endpoints (mount /api/web2-warehouse-report):
//   GET /summary?from=YYYY-MM-DD&to=YYYY-MM-DD
//     → { success, range, totals, regions[], products[], suppliers[] }
//       products[i].region / suppliers[i].region = địa danh; regions[i] = rollup theo địa danh.
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
// Địa danh nhập hàng (HÀ NỘI / HƯƠNG CHÂU / …) = CHA của NCC + SP. Nguồn: tab.label
// trong Sổ Order (= web2_products.region sau kho-sync). Dùng làm nhóm trên cùng.
const UNKNOWN_REGION = '(Không rõ ĐĐ)';
const SUP_SEP = '\u0000'; // tách key (region, supplier) — NCC lồng trong địa danh

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
// Chuẩn hoá (name,variant) để join so-order row ↔ web2_products khi row CHƯA gắn
// matchedCode (mirror Web2ProductsCache._normalize / lib web2-so-order-qty._norm).
function _norm(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .trim();
}
function _nameKey(name, variant) {
    return _norm(name) + '|' + _norm(variant);
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
                    region: '',
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

        // ---------- Kho web2_products: code↔(name,variant) + canonical name/NCC/địa danh ----------
        // Load 1 lần: dùng để (a) resolve mã cho so-order row CHƯA gắn matchedCode → MERGE
        // mua vào ↔ bán ra theo CODE (fix audit #10), (b) lấy tên/NCC/địa danh canonical.
        const prodRes = await pool
            .query(`SELECT code, name, variant, supplier, region FROM web2_products`)
            .catch(() => ({ rows: [] }));
        const metaByCode = new Map(); // CODE → {name, supplier, region}
        const nameToCode = new Map(); // norm(name)|norm(variant) → CODE (first match wins)
        for (const pr of prodRes.rows || []) {
            if (!pr.code) continue;
            const cc = normCode(pr.code);
            metaByCode.set(cc, pr);
            const nk = _nameKey(pr.name, pr.variant);
            if (!nameToCode.has(nk)) nameToCode.set(nk, cc);
        }

        // ---------- MUA VÀO + CHƯA NHẬN (Sổ Order) ----------
        const soRes = await pool
            .query(`SELECT data FROM web2_so_order WHERE doc_id = $1`, [SO_DOC_ID])
            .catch(() => ({ rows: [] }));
        const soData = soRes.rows[0] && soRes.rows[0].data ? soRes.rows[0].data : null;
        if (soData && Array.isArray(soData.tabs)) {
            for (const tab of soData.tabs) {
                const rate = num(tab && tab.rate) || 1;
                const tabRegion = String((tab && tab.label) || '').trim(); // địa danh nhập hàng
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
                        const name = String((r && r.productName) || '').trim();
                        const variant = String((r && r.variant) || '').trim();
                        // Resolve mã: matchedCode (nếu có) → fallback join (name,variant)→kho.
                        // Nhờ vậy row chưa gắn mã vẫn MERGE với bán ra cùng SP (audit #10).
                        let code = normCode(r && r.matchedCode);
                        if (!code) code = nameToCode.get(_nameKey(name, variant)) || '';
                        const key = code ? 'C:' + code : 'N:' + _nameKey(name, variant);
                        const p = getP(key, {
                            code: code || null,
                            name,
                            variant,
                            supplier: String((r && r.supplier) || '').trim(),
                            region: tabRegion,
                        });
                        if (!p.name && name) p.name = name;
                        if (!p.variant && variant) p.variant = variant;
                        if (!p.supplier && r && r.supplier) p.supplier = String(r.supplier).trim();
                        if (!p.region && tabRegion) p.region = tabRegion;
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
                const qty = num(l && (l.quantity != null ? l.quantity : l.qty));
                if (qty <= 0) continue;
                const price = num(l && (l.priceUnit != null ? l.priceUnit : l.price));
                const disc = num(l && (l.discountAmount != null ? l.discountAmount : l.discount));
                const amount = qty * price - disc;
                const name = String((l && (l.productName || l.name)) || '').trim();
                let code = normCode(l && (l.productCode || l.product_code || l.code));
                if (!code) code = nameToCode.get(_nameKey(name, '')) || '';
                const key = code ? 'C:' + code : 'N:' + _nameKey(name, '');
                const p = getP(key, { code: code || null, name, variant: '' });
                p.sellQty += qty;
                p.sellAmount += amount;
            }
        }

        // ---------- Tên + NCC + địa danh canonical từ web2_products (đã load ở trên) ----------
        {
            for (const p of products.values()) {
                if (!p.code) continue;
                const m = metaByCode.get(normCode(p.code));
                if (!m) continue;
                if (m.name) p.name = m.name; // tên canonical kho
                if (m.supplier) p.supplier = String(m.supplier).trim(); // NCC canonical kho
                if (m.region) p.region = String(m.region).trim(); // địa danh canonical kho
            }
        }

        // ---------- chuẩn hoá + round ----------
        for (const p of products.values()) {
            if (!p.supplier) p.supplier = UNKNOWN_SUPPLIER;
            if (!p.region) p.region = UNKNOWN_REGION;
            if (!p.name) p.name = p.code || '(không tên)';
            p.buyAmount = Math.round(p.buyAmount);
            p.pendingAmount = Math.round(p.pendingAmount);
            p.sellAmount = Math.round(p.sellAmount);
        }

        const zeroCounts = () => ({
            buyQty: 0,
            buyAmount: 0,
            pendingQty: 0,
            pendingAmount: 0,
            sellQty: 0,
            sellAmount: 0,
        });
        const addCounts = (acc, p) => {
            acc.buyQty += p.buyQty;
            acc.buyAmount += p.buyAmount;
            acc.pendingQty += p.pendingQty;
            acc.pendingAmount += p.pendingAmount;
            acc.sellQty += p.sellQty;
            acc.sellAmount += p.sellAmount;
        };

        // ---------- gom theo NCC (lồng trong địa danh: key = region ∅ supplier) ----------
        const suppliers = new Map();
        // ---------- gom theo ĐỊA DANH (cha) ----------
        const regions = new Map();
        for (const p of products.values()) {
            const sKey = p.region + SUP_SEP + p.supplier;
            let s = suppliers.get(sKey);
            if (!s) {
                s = { region: p.region, supplier: p.supplier, productCount: 0, ...zeroCounts() };
                suppliers.set(sKey, s);
            }
            s.productCount += 1;
            addCounts(s, p);

            let g = regions.get(p.region);
            if (!g) {
                g = { region: p.region, productCount: 0, supplierSet: new Set(), ...zeroCounts() };
                regions.set(p.region, g);
            }
            g.productCount += 1;
            g.supplierSet.add(p.supplier);
            addCounts(g, p);
        }

        const rank = (x) => x.buyAmount + x.sellAmount + x.pendingAmount;
        const productList = [...products.values()].sort((a, b) => rank(b) - rank(a));
        const supplierList = [...suppliers.values()].sort((a, b) => rank(b) - rank(a));
        const regionList = [...regions.values()]
            .map((g) => {
                const { supplierSet, ...rest } = g;
                return { ...rest, supplierCount: supplierSet.size };
            })
            .sort((a, b) => rank(b) - rank(a));

        const totals = productList.reduce((t, p) => {
            addCounts(t, p);
            return t;
        }, zeroCounts());
        totals.productCount = productList.length;
        totals.supplierCount = supplierList.length;
        totals.regionCount = regionList.length;

        res.json({
            success: true,
            range: { from, to },
            totals,
            regions: regionList,
            products: productList,
            suppliers: supplierList,
        });
    } catch (e) {
        console.error('[WEB2-WAREHOUSE-REPORT] summary error:', e.message);
        res.status(500).json({ success: false, error: 'Internal error' });
    }
});

module.exports = router;
