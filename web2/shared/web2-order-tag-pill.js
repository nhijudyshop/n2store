// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Web2OrderTagPill — NGUỒN DUY NHẤT render "pill" cho TAG đơn hàng (auto theo trigger).
// Dùng ở: cột "Thẻ" trang native-orders + preview ở trang Cấu hình web2/order-tags.
// Tag shape: { code, name, color, icon?, trigger? }. color = hex (#rrggbb).
// KHÔNG fork — trang nào cần hiển thị tag đơn thì load script này rồi gọi.
(function (global) {
    'use strict';

    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (global.Web2Escape?.escapeHtml) return global.Web2Escape.escapeHtml(s);
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Chuẩn hoá hex 3/6 ký tự → '#rrggbb'. Sai → màu xám mặc định.
    function normHex(c) {
        let s = String(c || '').trim();
        if (/^#?[0-9a-fA-F]{3}$/.test(s)) {
            s = s.replace('#', '');
            s = '#' + s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
        } else if (/^#?[0-9a-fA-F]{6}$/.test(s)) {
            s = s[0] === '#' ? s : '#' + s;
        } else {
            return '#6b7280';
        }
        return s.toLowerCase();
    }

    function rgb(hex) {
        const h = normHex(hex).slice(1);
        return [
            parseInt(h.slice(0, 2), 16),
            parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16),
        ];
    }

    // Text màu đậm (đọc trên nền tint nhạt). Dùng chính màu pill nhưng tối lại nếu quá sáng.
    function textColor(hex) {
        const [r, g, b] = rgb(hex);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        // Quá sáng (vàng) → text tối #92400e-ish; còn lại dùng chính màu (đã đủ đậm).
        return lum > 0.72 ? '#7c5e00' : normHex(hex);
    }

    function rgba(hex, a) {
        const [r, g, b] = rgb(hex);
        return `rgba(${r},${g},${b},${a})`;
    }

    // HTML 1 pill. opts.small → cỡ nhỏ hơn (dùng trong bảng dày).
    function html(tag, opts = {}) {
        if (!tag) return '';
        const name = tag.name || tag.code || '';
        if (!name) return '';
        const color = normHex(tag.color);
        const icon = tag.icon
            ? `<i data-lucide="${escapeHtml(tag.icon)}" style="width:11px;height:11px;flex:0 0 auto;"></i>`
            : '';
        const title = tag.trigger
            ? ` title="${escapeHtml(name)} — trigger: ${escapeHtml(tag.trigger)}"`
            : ` title="${escapeHtml(name)}"`;
        const pad = opts.small ? '1px 6px' : '2px 8px';
        const fs = opts.small ? '11px' : '11.5px';
        // opts.enter → thêm class w2-otag-enter để chạy animation "pop vào" (web2-effects.css).
        // Chỉ caller biết pill nào MỚI mới truyền enter:true (tránh re-animate khi render lại).
        const enterCls = opts.enter ? ' w2-otag-enter' : '';
        return (
            `<span class="w2-otag${enterCls}"${title} style="` +
            `display:inline-flex;align-items:center;gap:4px;` +
            `padding:${pad};border-radius:999px;font-size:${fs};font-weight:700;line-height:1.4;` +
            `white-space:nowrap;background:${rgba(color, 0.13)};color:${textColor(color)};` +
            `border:1px solid ${rgba(color, 0.34)};">` +
            `${icon}<span>${escapeHtml(name)}</span></span>`
        );
    }

    // HTML danh sách pills (wrap). tags = array of tag objects.
    function listHtml(tags, opts = {}) {
        if (!Array.isArray(tags) || !tags.length) return '';
        const inner = tags.map((t) => html(t, opts)).join('');
        return `<span class="w2-otag-list" style="display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;">${inner}</span>`;
    }

    global.Web2OrderTagPill = { html, listHtml, normHex, textColor };
})(typeof window !== 'undefined' ? window : globalThis);
