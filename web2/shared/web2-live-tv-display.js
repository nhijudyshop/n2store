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

    var LOW_THRESHOLD = 5; // CÒN ≤ 5 (mà > 0) = "sắp hết" → viền cảnh báo
    var HOT_THRESHOLD = 3; // KH mới ≥ 3 = "hot" → viền nổi bật

    // Tính trạng thái 1 card (group) từ các biến thể.
    function cardState(g) {
        var ncc = 0,
            sold = 0,
            con = 0,
            newCust = 0;
        var vs = (g && g.variants) || [];
        for (var i = 0; i < vs.length; i++) {
            var v = vs[i];
            var n = Number(v.pendingQty) || 0;
            var s = Number(v.sold) || 0;
            ncc += n;
            sold += s;
            con += Math.max(0, n - s);
            newCust += Number(v.newCust) || 0;
        }
        // Fallback khi group có sẵn tổng (totalNewCust từ Web2VariantGroup).
        if (!vs.length && g) {
            ncc = Number(g.totalPending) || 0;
            sold = Number(g.totalSold) || 0;
            con = Math.max(0, ncc - sold);
            newCust = Number(g.totalNewCust) || 0;
        }
        var soldOut = ncc > 0 && con <= 0;
        return {
            ncc: ncc,
            sold: sold,
            con: con,
            newCust: newCust,
            soldOut: soldOut,
            low: !soldOut && con > 0 && con <= LOW_THRESHOLD,
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

    global.Web2LiveTvDisplay = {
        LOW_THRESHOLD: LOW_THRESHOLD,
        HOT_THRESHOLD: HOT_THRESHOLD,
        cardState: cardState,
        orderForDisplay: orderForDisplay,
        paginate: paginate,
    };
})(typeof window !== 'undefined' ? window : this);
