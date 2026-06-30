// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — 1 NGUỒN trạng thái SP.
/**
 * Web2ProductStatus — NGUỒN DUY NHẤT cho trạng thái SP Web 2.0
 * (CHO_MUA / MUA_1_PHAN / HET_HANG / DANG_BAN / Tạm dừng).
 *
 * Trước đây label/icon/màu của status bị FORK ở nhiều nơi (web2-products-render,
 * web2-product-detail, live-chat picker, so-order...) → dễ drift (chỗ "Chờ hàng",
 * chỗ "CHỜ HÀNG", màu khác nhau). Gộp về đây: META là 1 nguồn nhãn/icon, mỗi
 * surface render theo CSS riêng nhưng KHÔNG tự đặt lại nhãn/màu nữa.
 *
 * API:
 *   Web2ProductStatus.meta(status)        → {label, short, icon, tone}
 *   Web2ProductStatus.isChoHang(status)   → bool (status === 'CHO_MUA')
 *   Web2ProductStatus.isMua1Phan(status)  → bool
 *   Web2ProductStatus.isHetHang(status)   → bool
 *   Web2ProductStatus.tableBadge(p)       → badge bảng Kho SP (web2/products)
 *   Web2ProductStatus.pill(p)             → pill trang chi tiết SP
 *   Web2ProductStatus.chip(p)             → chip góc card live-chat (CHỈ status đặc biệt)
 */
(function (global) {
    'use strict';

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function num(v) {
        return Number(v) || 0;
    }

    // META — 1 nguồn nhãn + icon + tone cho từng trạng thái.
    var META = {
        CHO_MUA: { label: 'CHỜ HÀNG', short: 'Chờ hàng', icon: 'clock', tone: 'pending' },
        MUA_1_PHAN: {
            label: 'MUA 1 PHẦN',
            short: 'Mua 1 phần',
            icon: 'package-2',
            tone: 'partial',
        },
        HET_HANG: { label: 'HẾT HÀNG', short: 'Hết hàng', icon: 'archive', tone: 'gone' },
        DANG_BAN: { label: 'Đang bán', short: 'Đang bán', icon: 'check', tone: 'ok' },
        _PAUSED: { label: 'Tạm dừng', short: 'Tạm dừng', icon: 'pause', tone: 'off' },
    };
    // Các status "đặc biệt" (khác bình thường) — chip live-chat chỉ hiện mấy cái này.
    var SPECIAL = { CHO_MUA: 1, MUA_1_PHAN: 1, HET_HANG: 1 };

    function meta(status) {
        return META[status] || META.DANG_BAN;
    }
    function isChoHang(status) {
        return status === 'CHO_MUA';
    }
    function isMua1Phan(status) {
        return status === 'MUA_1_PHAN';
    }
    function isHetHang(status) {
        return status === 'HET_HANG';
    }

    // Badge bảng Kho SP (web2/products) — GIỮ NGUYÊN markup cũ (active-badge).
    function tableBadge(p) {
        var s = p && p.status;
        if (s === 'CHO_MUA') {
            var pendingTxt = num(p.pendingQty) > 0 ? ' (×' + num(p.pendingQty) + ')' : '';
            return (
                '<span class="active-badge active-pending" title="Chờ Mua hàng từ NCC' +
                (p.supplier ? ' ' + esc(p.supplier) : '') +
                '"><i data-lucide="clock"></i>CHỜ HÀNG' +
                pendingTxt +
                '</span>'
            );
        }
        if (s === 'MUA_1_PHAN') {
            var stock = num(p.stock),
                pend = num(p.pendingQty);
            return (
                '<span class="active-badge" style="background:#fef3c7;color:#92400e;border-color:#fcd34d;" title="Đã nhận ' +
                stock +
                ' cái, còn ' +
                pend +
                ' cái chờ mua tiếp từ NCC ' +
                esc(p.supplier || '?') +
                '"><i data-lucide="package-2"></i>MUA 1 PHẦN <span style="opacity:0.85;font-weight:500;margin-left:4px;">(' +
                stock +
                ' đã nhận · ' +
                pend +
                ' chờ)</span></span>'
            );
        }
        if (s === 'HET_HANG') {
            return '<span class="active-badge" style="background:#f3f4f6;color:#6b7280;border-color:#d1d5db;" title="Đã bán hết — nhập lại từ Số Order để bán tiếp"><i data-lucide="archive"></i>HẾT HÀNG</span>';
        }
        return p && p.isActive
            ? '<span class="active-badge active-yes"><i data-lucide="check"></i>Đang bán</span>'
            : '<span class="active-badge active-no"><i data-lucide="pause"></i>Tạm dừng</span>';
    }

    // Pill trang chi tiết SP (web2/products detail) — GIỮ NGUYÊN markup cũ (w2pd-pill).
    function pill(p) {
        var s = p && p.status,
            stock = num(p.stock);
        if (s === 'CHO_MUA')
            return (
                '<span class="w2pd-pill warn"><i data-lucide="clock"></i>Chờ hàng' +
                (num(p.pendingQty) > 0 ? ' ×' + num(p.pendingQty) : '') +
                '</span>'
            );
        if (s === 'MUA_1_PHAN')
            return (
                '<span class="w2pd-pill warn"><i data-lucide="package-2"></i>Mua 1 phần (' +
                stock +
                ' nhận · ' +
                num(p.pendingQty) +
                ' chờ)</span>'
            );
        if (s === 'HET_HANG')
            return '<span class="w2pd-pill off"><i data-lucide="archive"></i>Hết hàng</span>';
        if (p && p.isActive)
            return '<span class="w2pd-pill ok"><i data-lucide="check"></i>Đang bán</span>';
        return '<span class="w2pd-pill off"><i data-lucide="pause"></i>Tạm dừng</span>';
    }

    // Chip góc card live-chat Kho SP — CHỈ hiện cho status đặc biệt (chờ hàng /
    // mua 1 phần / hết hàng). DANG_BAN/Tạm dừng → '' (không làm rối panel).
    function chip(p) {
        var s = p && p.status;
        if (!SPECIAL[s]) return '';
        var m = meta(s);
        var extra = s === 'CHO_MUA' && num(p.pendingQty) > 0 ? ' ×' + num(p.pendingQty) : '';
        return (
            '<span class="inv-status-badge inv-status-' +
            m.tone +
            '" title="' +
            esc(m.short) +
            (p.supplier ? ' · NCC ' + esc(p.supplier) : '') +
            '"><i data-lucide="' +
            m.icon +
            '"></i>' +
            esc(m.short) +
            extra +
            '</span>'
        );
    }

    global.Web2ProductStatus = {
        META: META,
        meta: meta,
        isChoHang: isChoHang,
        isMua1Phan: isMua1Phan,
        isHetHang: isHetHang,
        tableBadge: tableBadge,
        pill: pill,
        chip: chip,
    };
})(typeof window !== 'undefined' ? window : this);
