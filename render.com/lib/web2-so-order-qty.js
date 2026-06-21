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
async function loadSoOrderReceivedQtyMap(client) {
    const map = new Map(); // String(rowId) → receivedQty (Σ)
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
                const st = row.status || 'draft';
                if (st !== 'received' && st !== 'partial_received') continue; // chưa nhận → không trả
                const orderedQty = Number(row.qty) || 0;
                const recv =
                    st === 'partial_received'
                        ? Math.min(Number(row.qtyReceived) || 0, orderedQty)
                        : orderedQty;
                if (!(recv > 0)) continue;
                const rid = String(row.id);
                map.set(rid, (map.get(rid) || 0) + recv);
            }
        }
    }
    return map;
}

module.exports = { loadSoOrderReceivedQtyMap };
