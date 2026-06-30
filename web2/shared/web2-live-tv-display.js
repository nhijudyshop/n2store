// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — quy tắc HIỂN THỊ màn TV livestream.
// =====================================================
// Web2LiveTvDisplay — NGUỒN DUY NHẤT quy tắc trình bày SP trên màn TV + preview.
//
// Dùng chung cho live-tv (màn viewer) VÀ live-control (mini-TV preview) để KHÔNG
// drift: ngưỡng cảnh báo + thứ tự đẩy hết-hàng-xuống-cuối + phân trang phải GIỐNG
// nhau ở 2 nơi (nếu không, preview ở control khác trang thật trên TV).
//
// Khái niệm "card" = 1 group (theo mã SP, từ Web2VariantGroup.group(..., {by:'code'})).
// Trạng thái card tính gộp từ các biến thể: ncc=Σ pendingQty, con=Σ max(0, ncc-giỏ),
// newCust=Σ KH mới. soldOut khi ĐÃ báo NCC mà CÒN ≤ 0.
// =====================================================
(function (global) {
    'use strict';
    if (global.Web2LiveTvDisplay) return;

    // "Sắp hết" theo TỈ LỆ (tùy tình hình), KHÔNG phải số cứng: CÒN ≤ 30% số NCC báo
    // và ĐÃ bán bớt (GIỎ>0). Vd tổng 6 còn 4 (67%) → KHÔNG sắp hết; tổng 6 còn ≤2 mới
    // sắp hết. (Trước đây cứng CÒN≤5 → 6 còn 4 bị báo nhầm "sắp hết".)
    var LOW_RATIO = 0.3;
    var HOT_THRESHOLD = 3; // KH mới ≥ 3 = "hot" → viền nổi bật

    // Tính trạng thái 1 card (group) từ các biến thể.
    function cardState(g) {
        var ncc = 0,
            sold = 0,
            con = 0,
            newCust = 0,
            allCust = 0;
        var vs = (g && g.variants) || [];
        for (var i = 0; i < vs.length; i++) {
            var v = vs[i];
            var n = Number(v.pendingQty) || 0;
            var s = Number(v.sold) || 0;
            ncc += n;
            sold += s;
            con += Math.max(0, n - s);
            newCust += Number(v.newCust) || 0;
            allCust += Number(v.allCust) || 0;
        }
        // Fallback khi group có sẵn tổng (totalNewCust từ Web2VariantGroup).
        if (!vs.length && g) {
            ncc = Number(g.totalPending) || 0;
            sold = Number(g.totalSold) || 0;
            con = Math.max(0, ncc - sold);
            newCust = Number(g.totalNewCust) || 0;
            allCust = Number(g.totalAllCust) || 0;
        }
        var soldOut = ncc > 0 && con <= 0;
        return {
            ncc: ncc,
            sold: sold,
            con: con,
            newCust: newCust,
            allCust: allCust,
            soldOut: soldOut,
            // "Sắp hết" tỉ lệ: đã bán bớt (GIỎ>0) & CÒN ≤ 30% NCC (tối thiểu 1).
            // Vd NCC 6: ngưỡng = round(1.8)=2 → CÒN 4 KHÔNG sắp hết, CÒN ≤2 mới sắp hết.
            low: !soldOut && con > 0 && sold > 0 && con <= Math.max(1, Math.round(ncc * LOW_RATIO)),
            hot: newCust >= HOT_THRESHOLD,
        };
    }

    // Thứ tự trình bày: GHIM trước (giữ nguyên, không bị đẩy dù hết), rồi SP còn
    // hàng (giữ thứ tự), rồi SP HẾT HÀNG dồn xuống cuối — để không chiếm trang đầu.
    function orderForDisplay(groups) {
        var pinned = [],
            live = [],
            out = [];
        (groups || []).forEach(function (g) {
            if (g && g.pinned) pinned.push(g);
            else if (cardState(g).soldOut) out.push(g);
            else live.push(g);
        });
        return pinned.concat(live, out);
    }

    // Phân trang theo layout. Trả { ordered, perPage, totalPages, page(clamped),
    // pageGroups }. Áp orderForDisplay TRƯỚC khi cắt trang.
    function paginate(groups, rows, cols, page) {
        var ordered = orderForDisplay(groups || []);
        var perPage = Math.max(1, (Number(rows) || 1) * (Number(cols) || 1));
        var total = ordered.length;
        var totalPages = Math.max(1, Math.ceil(total / perPage));
        var p = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
        var start = p * perPage;
        return {
            ordered: ordered,
            perPage: perPage,
            totalPages: totalPages,
            page: p,
            pageGroups: ordered.slice(start, start + perPage),
        };
    }

    function normRegion(s) {
        return String(s == null ? '' : s)
            .trim()
            .toUpperCase();
    }

    // Mô hình GIỎ / MỚI / CÒN cho 1 BIẾN THỂ (NGUỒN DUY NHẤT, dùng CHUNG board + TV
    // + preview để không lệch). Định nghĩa user 2026-06-27:
    //   • GIỎ = TỔNG số lượng món trong giỏ KH (mọi khách).
    //   • MỚI = số lượng món của khách CHƯA có SĐT & địa chỉ (1 PHẦN của GIỎ).
    //   • CÒN = max(0, NCC − GIỎ).
    //   • Địa danh CHO VƯỢT (SP đúng địa danh đang chọn = hàng có sẵn "lấy về rồi
    //     bán"): GIỎ được VƯỢT NCC → vuot = max(0, GIỎ − NCC) (báo hiệu trên cột GIỎ,
    //     để biết đặt thêm bao nhiêu). Địa danh KHÔNG chọn = pre-order (bán mẫu trước,
    //     đặt về sau): vuot = 0, không báo VƯỢT (đặt vượt là chuyện bình thường).
    function khConModel(v, selectedRegion) {
        var ncc = Number(v && v.pendingQty) || 0;
        var gio = Number(v && v.sold) || 0; // GIỎ = tổng SL món
        var moi = Number(v && v.newCust) || 0; // MỚI = SL món của khách mới
        var isVuotRegion = !!(
            selectedRegion && normRegion(v && v.region) === normRegion(selectedRegion)
        );
        var con = Math.max(0, ncc - gio);
        var vuot = isVuotRegion ? Math.max(0, gio - ncc) : 0;
        return {
            isVuotRegion: isVuotRegion,
            ncc: ncc,
            gio: gio,
            moi: moi,
            con: con,
            vuot: vuot, // >0 = GIỎ vượt NCC (chỉ địa danh CHO VƯỢT, không phải pre-order)
        };
    }

    global.Web2LiveTvDisplay = {
        LOW_RATIO: LOW_RATIO,
        HOT_THRESHOLD: HOT_THRESHOLD,
        cardState: cardState,
        orderForDisplay: orderForDisplay,
        paginate: paginate,
        normRegion: normRegion,
        khConModel: khConModel,
    };
})(typeof window !== 'undefined' ? window : this);
