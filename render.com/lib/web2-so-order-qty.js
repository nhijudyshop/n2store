// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Shared helper: đọc SL đã mua/nhận THẬT từ web2_so_order.
//
// Nguồn sự thật SERVER cho cap over-refund ví NCC. Dùng chung bởi:
//   - routes/purchase-refund.js     (/quick-refund — branch rowReturns)
//   - routes/web2-supplier-wallet.js (/tx type=return — partial return)
//
// Tách thành lib riêng (không nằm trong route) để tránh circular require:
// purchase-refund.js đã `require('./web2-supplier-wallet')`, nên supplier-wallet
// KHÔNG được require ngược purchase-refund. Cả hai cùng require lib này.
//
// Vì sao server-authoritative: TRƯỚC đây trần (cap) over-refund dựa vào
// `rowReturns[rid].ordered` do CLIENT gửi → thiếu/0/non-numeric thì guard no-op
// nhưng newQty vẫn ghi vào returned_row_ids KHÔNG giới hạn → caller gọi API trực
// tiếp (hoặc 2 modal/2 máy) trả vượt SL đã mua, mint ví NCC vô hạn. SL đã mua THẬT
// nằm trong web2_so_order.data (tabs→shipments→rows[].{id,qty}); helper này đọc doc
// 'main' và build map rowId(String) → Σ purchasedQty để caller dùng làm trần.
// =====================================================

/**
 * Build map String(rowId) → Σ purchasedQty từ web2_so_order doc 'main'.
 *
 * rowId = so-order row `r.id` — TRÙNG với key của rowReturns gửi từ client
 * (supplier-wallet-actions confirmReturn: rowReturns[r.rowId], r.rowId = row.id),
 * và khớp Web2SoOrderUtils.parseReceivedItems (flatten tabs→shipments→rows).
 *
 * @param {{query: Function}} client - Pool hoặc PoolClient (chạy TRONG transaction caller).
 * @returns {Promise<Map<string, number>>} rowId(String) → purchasedQty (Σ).
 *   Rỗng nếu bảng chưa tồn tại / lỗi đọc — caller xử lý "không tra được SL" theo
 *   policy thận trọng (reject thay vì cho trả vô hạn).
 */
async function loadSoOrderRowQtyMap(client) {
    const map = new Map(); // String(rowId) → purchasedQty (Σ)
    let r;
    try {
        r = await client.query(`SELECT data FROM web2_so_order WHERE doc_id = 'main' LIMIT 1`);
    } catch (e) {
        return map;
    }
    const data = r.rows[0]?.data;
    const tabs = data && Array.isArray(data.tabs) ? data.tabs : [];
    for (const tab of tabs) {
        const shipments = tab && Array.isArray(tab.shipments) ? tab.shipments : [];
        for (const sh of shipments) {
            const rows = sh && Array.isArray(sh.rows) ? sh.rows : [];
            for (const row of rows) {
                if (!row || row.id == null) continue;
                const rid = String(row.id);
                const qty = Number(row.qty || 0);
                if (!(qty > 0)) continue;
                map.set(rid, (map.get(rid) || 0) + qty);
            }
        }
    }
    return map;
}

module.exports = { loadSoOrderRowQtyMap };
