// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 lib.
// =====================================================================
// WEB 2.0 — STT KỆ (put-wall) = 1 NGUỒN DUY NHẤT
// =====================================================================
// Quy ước: "STT kệ" của 1 đơn = native_orders.campaign_stt (1..N, reset theo
// CHIẾN DỊCH livestream — số nhỏ, tái dùng mỗi phiên → hợp làm số ô kệ vật lý),
// fallback display_stt (số đơn GLOBAL) khi đơn chưa có campaign_stt.
//
// MỌI nơi hiển thị/đóng dấu STT kệ PHẢI dùng hàm này để KHÔNG lệch số:
//   - tem vật lý: web2_product_units.order_stt (gán khi reconcile)
//   - unit-scan: hero "Đã ở kệ N" + danh sách đơn chờ + danh sách tem
//   - board/TV (web2-campaign-products /cart-detail → live-control, live-tv popup giỏ)
// Bug 2026-06-29: board hiện display_stt còn tem dùng campaign_stt → lệch số.
// Gom về 1 hàm để không drift lại.
//
// Nhận row snake_case (DB) hoặc camelCase (đã map). Trả Number | null.
function shelfStt(row) {
    if (!row) return null;
    const c = row.campaign_stt != null ? row.campaign_stt : row.campaignStt;
    const d = row.display_stt != null ? row.display_stt : row.displayStt;
    if (c != null) return Number(c);
    if (d != null) return Number(d);
    return null;
}

// Snippet SQL tương đương — cho ORDER BY / SELECT khi cần tính ngay trong query.
// (NULLS LAST giữ đơn thiếu STT xuống cuối, khớp FIFO put-wall.)
const SHELF_STT_SQL = 'COALESCE(campaign_stt, display_stt)';

module.exports = { shelfStt, SHELF_STT_SQL };
