// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Shared helper: đọc SL đã NHẬN THẬT từ web2_so_order.
//
// Nguồn sự thật SERVER cho cap over-refund ví NCC. Dùng chung bởi:
//   - routes/purchase-refund.js     (/quick-refund — branch rowReturns)
//   - routes/web2-supplier-wallet.js (/tx type=return — partial return)
//
// Tách thành lib riêng (không nằm trong route) để tránh circular require:
// purchase-refund.js đã `require('./web2-supplier-wallet')`, nên supplier-wallet
// KHÔNG được require ngược purchase-refund. Cả hai cùng require lib này.
//
// ⚠ SL NHẬN, KHÔNG phải SL ĐẶT: trần trả NCC = số đã NHẬN (received), không phải
// số đặt (ordered). Row partial_received nhận 2/10 thì chỉ được trả tối đa 2.
// Công thức received KHỚP 1:1 với client aggregateSuppliers (supplier-wallet-api.js):
//   status != received|partial_received        → 0 (chưa nhận, không trả được)
//   status == received                          → row.qty (nhận đủ số đặt)
//   status == partial_received                  → min(row.qtyReceived, row.qty)
// Dùng row.qty (ordered) làm trần TỪNG sai (audit 2026-06-21 #1): partial nhận 2/10
// nhưng cap=10 → over-refund 8 đơn vị chưa nhận → mint ví NCC.
//
// Vì sao server-authoritative: trần phải tính lại MỖI lần từ so-order (client không
// sửa được). TRƯỚC đây cap dựa `rowReturns[rid].ordered` do CLIENT gửi → thiếu/0 thì
// guard no-op nhưng newQty vẫn ghi returned_row_ids vô hạn → trả vượt, mint ví NCC.
// =====================================================

/**
 * Build map String(rowId) → Σ SL ĐÃ NHẬN (received qty) từ web2_so_order doc 'main'.
 *
 * rowId = so-order row `r.id` — TRÙNG với key của rowReturns gửi từ client
 * (supplier-wallet-actions confirmReturn: rowReturns[r.rowId], r.rowId = row.id).
 *
 * @param {{query: Function}} client - Pool hoặc PoolClient (chạy TRONG transaction caller).
 * @returns {Promise<Map<string, number>>} rowId(String) → SL đã nhận (Σ).
 *   Rỗng nếu bảng chưa tồn tại / lỗi đọc — caller xử lý "không tra được SL" theo
 *   policy thận trọng (fallback pin/client, hoặc reject nếu không nguồn nào).
 */
// Tỷ giá fallback → VND (mirror frontend SW.FALLBACK_RATES supplier-wallet-state.js).
// Dùng để quy cost ngoại tệ về VND server-side khi cap amount over-refund.
const FALLBACK_RATES_VND = {
    VND: 1,
    CNY: 3500,
    USD: 26000,
    EUR: 28000,
    JPY: 170,
    KRW: 18,
    THB: 720,
};
function _rateToVnd(currency, tab) {
    if (!currency || currency === 'VND') return 1;
    if (tab && tab.currency === currency)
        return Number(tab.rate) || FALLBACK_RATES_VND[currency] || 1;
    return FALLBACK_RATES_VND[currency] || 1;
}

// MIRROR client Web2ProductsCache._normalize (web2-products-cache.js): lowercase →
// NFD → bỏ dấu kết hợp → đ→d → trim. PHẢI khớp 1:1 để map (name,variant)→code
// server-side trùng kết quả client (so-order row ↔ web2_products). Lệch chuẩn hoá =
// không match = fail-open (không cap) → an toàn 1 chiều (không block nhầm).
function _norm(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .trim();
}

/**
 * Build map String(rowId) → { received, costVnd } từ web2_so_order doc 'main'.
 *
 * `costVnd` = costPrice × rateToVnd(tab.currency, tab) — đơn giá VND THẬT của dòng
 * (mirror supplier-wallet-api.js aggregateSuppliers). Dùng làm trần AMOUNT khi hoàn
 * NCC (audit #2 2026-06-23): amount ≤ Σ(qty × costVnd). KHÔNG tin amount client gửi.
 *
 * @param {{query: Function}} client
 * @returns {Promise<Map<string, {received:number, costVnd:number}>>}
 */
async function loadSoOrderReceivedMap(client) {
    const map = new Map();
    let r;
    try {
        r = await client.query(`SELECT data FROM web2_so_order WHERE doc_id = 'main' LIMIT 1`);
    } catch (e) {
        return map;
    }
    const data = r.rows[0]?.data;
    const tabs = data && Array.isArray(data.tabs) ? data.tabs : [];
    for (const tab of tabs) {
        const rate = _rateToVnd(tab && tab.currency, tab);
        const shipments = tab && Array.isArray(tab.shipments) ? tab.shipments : [];
        for (const sh of shipments) {
            const rows = sh && Array.isArray(sh.rows) ? sh.rows : [];
            for (const row of rows) {
                if (!row || row.id == null) continue;
                const st = row.status || 'draft';
                if (st !== 'received' && st !== 'partial_received') continue; // chưa nhận → không trả
                const orderedQty = Number(row.qty) || 0;
                const recv =
                    st === 'partial_received'
                        ? Math.min(Number(row.qtyReceived) || 0, orderedQty)
                        : orderedQty;
                if (!(recv > 0)) continue;
                const costVnd = (Number(row.costPrice) || 0) * rate;
                const rid = String(row.id);
                const prev = map.get(rid) || { received: 0, costVnd };
                map.set(rid, { received: prev.received + recv, costVnd: costVnd || prev.costVnd });
            }
        }
    }
    return map;
}

// Backward-compat: chỉ trả qty (Σ received) — wrapper quanh loadSoOrderReceivedMap.
async function loadSoOrderReceivedQtyMap(client) {
    const full = await loadSoOrderReceivedMap(client);
    const map = new Map();
    for (const [rid, v] of full) map.set(rid, v.received);
    return map;
}

/**
 * Build map String(productCode) → MAX costVnd từ web2_so_order, join sang
 * web2_products bằng (name, variant) chuẩn-hoá (mirror client _normalize).
 *
 * Dùng cho cost-cap quick/bulk refund KHÔNG gửi rowReturns (UI chính gửi products
 * keyed by CODE). Hoàn NCC = giá NHẬP (cost), KHÔNG phải giá bán retail mà UI gửi →
 * cap amount ≤ Σ(qty × costByCode[code]). MAX cost giữa các đợt = trần rộng nhất
 * (không block nhầm refund hợp lệ). KHÔNG match được code → bỏ (caller fail-open).
 *
 * @param {{query: Function}} client - Pool/PoolClient (chạy TRONG transaction caller).
 * @returns {Promise<Map<string, number>>} productCode → costVnd (MAX). Rỗng nếu lỗi đọc.
 */
async function loadSoOrderCostByCodeMap(client) {
    const map = new Map();
    // 1) web2_products: (name|variant chuẩn-hoá) → code. 1 query toàn kho.
    let prodRows;
    try {
        prodRows = await client.query(`SELECT code, name, variant FROM web2_products`);
    } catch (e) {
        return map;
    }
    const codeByKey = new Map();
    for (const p of prodRows.rows || []) {
        if (!p.code) continue;
        const key = _norm(p.name) + '|' + _norm(p.variant || '');
        if (!codeByKey.has(key)) codeByKey.set(key, p.code);
    }
    // 2) so-order rows đã NHẬN → costVnd → gộp MAX theo code.
    let r;
    try {
        r = await client.query(`SELECT data FROM web2_so_order WHERE doc_id = 'main' LIMIT 1`);
    } catch (e) {
        return map;
    }
    const data = r.rows[0]?.data;
    const tabs = data && Array.isArray(data.tabs) ? data.tabs : [];
    for (const tab of tabs) {
        const rate = _rateToVnd(tab && tab.currency, tab);
        const shipments = tab && Array.isArray(tab.shipments) ? tab.shipments : [];
        for (const sh of shipments) {
            const rows = sh && Array.isArray(sh.rows) ? sh.rows : [];
            for (const row of rows) {
                if (!row) continue;
                const st = row.status || 'draft';
                if (st !== 'received' && st !== 'partial_received') continue;
                const costVnd = (Number(row.costPrice) || 0) * rate;
                if (!(costVnd > 0)) continue;
                const key = _norm(row.productName) + '|' + _norm(row.variant || '');
                const code = codeByKey.get(key);
                if (!code) continue;
                const prev = map.get(code) || 0;
                if (costVnd > prev) map.set(code, costVnd);
            }
        }
    }
    return map;
}

/**
 * Build map productCode → [{ rowId, received, costVnd }] — các dòng so-order ĐÃ NHẬN
 * gom theo CODE (join (name,variant) chuẩn-hoá → web2_products.code, mirror client).
 *
 * Dùng cho cap quick-refund NCC theo CODE (purchase-refund không gửi rowReturns):
 * cap qty ≤ Σ(received − đã trả từng row), cap amount ≤ Σ(alloc × costVnd), và ghi
 * returned_row_ids per-row → đồng bộ với đường ví NCC /tx (cùng đọc remaining).
 * KHÔNG match được code → bỏ (caller fail-open per-code, không chặn refund hợp lệ).
 *
 * @param {{query: Function}} client
 * @returns {Promise<Map<string, Array<{rowId:string, received:number, costVnd:number}>>>}
 */
async function loadSoOrderReceivedRowsByCode(client) {
    const map = new Map();
    let prodRows;
    try {
        prodRows = await client.query(`SELECT code, name, variant FROM web2_products`);
    } catch (e) {
        return map;
    }
    const codeByKey = new Map();
    for (const p of prodRows.rows || []) {
        if (!p.code) continue;
        const key = _norm(p.name) + '|' + _norm(p.variant || '');
        if (!codeByKey.has(key)) codeByKey.set(key, p.code);
    }
    let r;
    try {
        r = await client.query(`SELECT data FROM web2_so_order WHERE doc_id = 'main' LIMIT 1`);
    } catch (e) {
        return map;
    }
    const data = r.rows[0]?.data;
    const tabs = data && Array.isArray(data.tabs) ? data.tabs : [];
    for (const tab of tabs) {
        const rate = _rateToVnd(tab && tab.currency, tab);
        const shipments = tab && Array.isArray(tab.shipments) ? tab.shipments : [];
        for (const sh of shipments) {
            const rows = sh && Array.isArray(sh.rows) ? sh.rows : [];
            for (const row of rows) {
                if (!row || row.id == null) continue;
                const st = row.status || 'draft';
                if (st !== 'received' && st !== 'partial_received') continue;
                const orderedQty = Number(row.qty) || 0;
                const received =
                    st === 'partial_received'
                        ? Math.min(Number(row.qtyReceived) || 0, orderedQty)
                        : orderedQty;
                if (!(received > 0)) continue;
                const key = _norm(row.productName) + '|' + _norm(row.variant || '');
                const code = codeByKey.get(key);
                if (!code) continue;
                const costVnd = (Number(row.costPrice) || 0) * rate;
                if (!map.has(code)) map.set(code, []);
                map.get(code).push({ rowId: String(row.id), received, costVnd });
            }
        }
    }
    return map;
}

module.exports = {
    loadSoOrderReceivedQtyMap,
    loadSoOrderReceivedMap,
    loadSoOrderCostByCodeMap,
    loadSoOrderReceivedRowsByCode,
};
