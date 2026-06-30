// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared.
// =====================================================
// Web2ProductGroup — MODULE DÙNG CHUNG cho khái niệm SP CHA–CON (sản phẩm, SP con,
// SP cha). Mọi trang liên quan sản phẩm (Kho SP, Sổ Order, …) THAM CHIẾU module này
// để GOM + RENDER nhất quán, KHÔNG fork logic.
//
// Dựa trên Web2VariantGroup (gom theo parent_code / fallback name+supplier+region).
// Module này thêm: suy ra MÃ CHA hiển thị + khung BẢNG CON (drawer) khi expand.
//
// API (window.Web2ProductGroup):
//   group(products, opts)   → Web2VariantGroup.group(products, {by:'parent', ...opts})
//                             (mặc định by:'parent' — gom cha-con). Trả [] nếu thiếu dep.
//   commonPrefix(codes[])   → tiền tố CHUNG dài nhất các mã (vd HCQUAN2JT2+HCQUAN3SH29
//                             → "HCQUAN").
//   parentCode(variants[])  → MÃ CHA hiển thị: parent_code thật (mọi con cùng cha)
//                             ưu tiên; nếu chưa có → commonPrefix(mã con) khi ≥3 ký tự;
//                             else ''. variants = group.variants ([{code, orig}]) hoặc
//                             mảng product thô.
//   childPanelHtml(opts)    → HTML 1 <tr> "drawer" chứa BẢNG CON (khi expand 1 cha):
//                             rãnh tím + header "N biến thể con của <tên>" + <table>
//                             card. TRANG tự cấp `colHeaders` + `rowsHtml` (cột riêng
//                             mỗi trang) → khung & style đồng nhất, nội dung tuỳ trang.
//     opts: { key, name, count, colspan=12, colHeaders:[...string], rowsHtml:string }
//
// CSS đi kèm: web2/shared/web2-product-group.css (class w2pg-*). Trang dùng module
// PHẢI load file css này.
// =====================================================
(function (global) {
    'use strict';
    if (global.Web2ProductGroup) return;

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (global.Web2Escape && global.Web2Escape.escapeHtml)
            return global.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    // Gom cha-con (mặc định by:'parent'). Đi qua Web2VariantGroup — 1 nguồn gom.
    function group(products, opts) {
        const VG = global.Web2VariantGroup;
        if (!VG || !VG.group) return [];
        return VG.group(products || [], Object.assign({ by: 'parent' }, opts || {}));
    }

    // Tiền tố chung dài nhất của mảng chuỗi.
    function commonPrefix(arr) {
        if (!arr || !arr.length) return '';
        let p = String(arr[0] || '');
        for (const s of arr) {
            const t = String(s || '');
            let i = 0;
            while (i < p.length && i < t.length && p[i] === t[i]) i++;
            p = p.slice(0, i);
            if (!p) break;
        }
        return p;
    }

    // Mã CHA hiển thị: parent_code thật (mọi con cùng 1 cha) → ưu tiên; else tiền tố
    // chung mã con (≥3 ký tự) cho SP phẳng cùng tên; else ''.
    function parentCode(variants) {
        const list = variants || [];
        if (!list.length) return '';
        const codeOf = (v) => v.code || (v.orig && v.orig.code) || '';
        const parentOf = (v) => (v.orig && v.orig.parentCode) || v.parentCode || '';
        const reals = list.map(parentOf).filter(Boolean);
        if (reals.length === list.length && new Set(reals).size === 1) return reals[0];
        const lcp = commonPrefix(list.map(codeOf).filter(Boolean));
        return lcp.length >= 3 ? lcp : '';
    }

    // Khung BẢNG CON (drawer) khi expand 1 SP cha. Trang cấp colHeaders + rowsHtml.
    function childPanelHtml(o) {
        o = o || {};
        const colspan = Number(o.colspan) || 12;
        const heads = (o.colHeaders || [])
            .map((h) => `<th>${h == null ? '' : esc(h)}</th>`)
            .join('');
        return `
                <tr class="w2pg-drawer" data-group-key="${esc(o.key || '')}">
                    <td colspan="${colspan}">
                        <div class="w2pg-panel">
                            <div class="w2pg-panel-head"><i data-lucide="git-branch"></i>${Number(o.count) || 0} biến thể con của <strong>${esc(o.name || '')}</strong></div>
                            <table class="w2pg-table">
                                <thead><tr>${heads}</tr></thead>
                                <tbody>${o.rowsHtml || ''}</tbody>
                            </table>
                        </div>
                    </td>
                </tr>`;
    }

    global.Web2ProductGroup = { group, commonPrefix, parentCode, childPanelHtml };
})(typeof window !== 'undefined' ? window : this);
