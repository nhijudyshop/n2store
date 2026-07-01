// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — quy tắc HIỂN THỊ màn TV livestream.
// =====================================================
// Web2LiveTvDisplay — NGUỒN DUY NHẤT quy tắc trình bày SP trên màn TV + preview.
//
// Dùng chung cho live-tv (màn viewer) VÀ live-control (mini-TV preview) để KHÔNG
// drift: ngưỡng cảnh báo + thứ tự đẩy hết-hàng-xuống-cuối + phân trang phải GIỐNG
// nhau ở 2 nơi (nếu không, preview ở control khác trang thật trên TV).
//
// Khái niệm "card" = 1 group (theo mã SP, từ Web2VariantGroup.group(..., {by:'code'})).
// Trạng thái card gộp từ biến thể (#2 2026-06-30): stock=Σ tồn, choHang=Σ max(0,giỏ−tồn),
// con=Σ max(0,tồn−giỏ), newCust=Σ KH mới. soldOut khi có tồn mà CÒN ≤ 0 (giỏ ≥ tồn).
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
    // #2 2026-06-30: gộp theo TỒN thật (stock). CHỜ HÀNG = max(0, GIỎ − TỒN);
    // CÒN = max(0, TỒN − GIỎ). Bỏ NCC gõ tay.
    function cardState(g) {
        var stock = 0,
            sold = 0,
            choHang = 0,
            con = 0,
            returnQty = 0,
            newCust = 0,
            allCust = 0;
        var vs = (g && g.variants) || [];
        for (var i = 0; i < vs.length; i++) {
            var v = vs[i];
            var st = Number(v.stock) || 0;
            var s = Number(v.sold) || 0;
            var rq = Number(v.returnQty != null ? v.returnQty : v.return_qty) || 0;
            stock += st;
            sold += s;
            returnQty += rq;
            // CHỜ HÀNG trừ thu về chờ duyệt (sắp về kho) → không đặt dư NCC.
            choHang += Math.max(0, s - st - rq);
            con += Math.max(0, st - s);
            newCust += Number(v.newCust) || 0;
            allCust += Number(v.allCust) || 0;
        }
        // Fallback khi group có sẵn tổng (từ Web2VariantGroup).
        if (!vs.length && g) {
            stock = Number(g.totalStock) || 0;
            sold = Number(g.totalSold) || 0;
            choHang = Math.max(0, sold - stock);
            con = Math.max(0, stock - sold);
            newCust = Number(g.totalNewCust) || 0;
            allCust = Number(g.totalAllCust) || 0;
        }
        var soldOut = stock > 0 && con <= 0; // hết tồn (giỏ ≥ tồn)
        return {
            stock: stock,
            sold: sold,
            choHang: choHang,
            con: con,
            returnQty: returnQty,
            newCust: newCust,
            allCust: allCust,
            soldOut: soldOut,
            // "Sắp hết": còn bán được ít so với tồn (GIỎ>0 & CÒN ≤ 30% TỒN, tối thiểu 1).
            low:
                !soldOut &&
                con > 0 &&
                sold > 0 &&
                con <= Math.max(1, Math.round(stock * LOW_RATIO)),
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

    // Mô hình TỒN / GIỎ / MỚI / CHỜ HÀNG cho 1 BIẾN THỂ (NGUỒN DUY NHẤT, dùng CHUNG
    // board + TV + preview). Định nghĩa user 2026-06-30 (#2 — bỏ NCC gõ tay):
    //   • TỒN = tồn kho thật (web2_products.stock).
    //   • GIỎ = TỔNG SL món trong giỏ KH draft (chưa lên PBH; PBH đã trừ tồn → không
    //     tính lại). MỚI = SL món của khách CHƯA có SĐT & địa chỉ (1 PHẦN của GIỎ).
    //   • CHỜ HÀNG = max(0, GIỎ − TỒN) = cần đặt thêm NCC (giỏ vượt tồn thật).
    //   (Bỏ NCC gõ tay + CÒN-cũ + VƯỢT + địa danh cho-vượt — chờ hàng tính đồng đều
    //    mọi SP; Kho web2_products là nguồn quản số liệu.)
    // ⚠ 1-NGUỒN CÔNG THỨC "CHỜ HÀNG" (giỏ−tồn): `sold`(GIỎ) = Σ SL draft mỗi code —
    //   khớp `held` (tag cho_hang, web2-order-tags-service.js) + `demand` (/restock-needed,
    //   web2-products.js). Đổi định nghĩa giỏ-vượt-tồn → sửa CẢ 3 cho khớp.
    // ponytail: param selectedRegion gỡ (M10, 2026-07-01) — region không tới phép tính.
    function khConModel(v) {
        var stock = Number(v && v.stock) || 0; // TỒN thật
        var gio = Number(v && v.sold) || 0; // GIỎ nháp
        var moi = Number(v && v.newCust) || 0; // MỚI = SL món khách mới
        // Hàng THU VỀ chờ duyệt (shipper_gui) — sắp cộng kho khi duyệt → giảm CHỜ HÀNG
        // (không đặt dư NCC). Audit gap live-control↔returns.
        var retQty = Number((v && (v.returnQty != null ? v.returnQty : v.return_qty)) || 0);
        var choHang = Math.max(0, gio - stock - retQty); // cần đặt thêm (trừ thu về sắp về)
        var con = Math.max(0, stock - gio); // còn bán được từ tồn
        return {
            stock: stock,
            gio: gio,
            moi: moi,
            choHang: choHang,
            con: con,
            returnQty: retQty, // thu về chờ duyệt (hiển thị phụ)
            pending: Number(v && v.pendingQty) || 0, // "đã đặt NCC" (Sổ Order) — hiển thị phụ
        };
    }

    global.Web2LiveTvDisplay = {
        LOW_RATIO: LOW_RATIO,
        HOT_THRESHOLD: HOT_THRESHOLD,
        cardState: cardState,
        orderForDisplay: orderForDisplay,
        paginate: paginate,
        khConModel: khConModel,
    };
})(typeof window !== 'undefined' ? window : this);
