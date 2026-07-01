// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — 1 NGUỒN thuật toán + render phân trang.
// =====================================================================
// Web2Pagination — NGUỒN DUY NHẤT thuật toán pager "window quanh trang hiện tại
// + dấu …" cho Web 2.0. Trước đây COPY-PASTE ~10 render-module (page-builder,
// web2-products-render, native-orders-render, customers-render, bh-render,
// customer-wallet, supplier-debt, pbh/dlv/rf …) → drift.
//
// Thuật toán (giữ NGUYÊN bản canonical page-builder.js): window 5 trang quanh
// hiện tại (start=max(1,cur-2), end=min(total,start+4)); chèn trang 1 + "…" đầu
// khi start>1, trang cuối + "…" cuối khi end<total; nút ‹ / ›.
//
// API:
//   Web2Pagination.window(current, totalPages)
//     → { cur, total, items:[{type:'page',page,active}|{type:'ellipsis'}],
//         prevDisabled, nextDisabled }  — CHỈ thuật toán (cho trang có markup lạ).
//
//   Web2Pagination.html({ current, totalPages, total?, classes?, onClick?,
//                          infoText?, prevLabel?, nextLabel? }) → HTML string.
//     • classes: { btn:'page-btn', active:'active', info:'page-info', ellipsis? }
//     • onClick(page) → chuỗi attribute nút (vd `onclick="App.goPage(3)"` hoặc
//       `data-page="3"`). Mặc định `data-go="<page>"` (dùng với render()+onGo).
//     • infoText(cur,total,records) → chuỗi info cuối. Mặc định "<records> bản
//       ghi — trang cur/total" (nếu total records != null), else "trang cur/total".
//
//   Web2Pagination.render(el, opts) → el.innerHTML = html(opts) + (nếu dùng
//     data-go mặc định) wire click → opts.onGo(page).
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2Pagination) return;

    function windowOf(current, totalPages) {
        const total = Math.max(1, parseInt(totalPages, 10) || 1);
        const cur = Math.min(total, Math.max(1, parseInt(current, 10) || 1));
        const items = [];
        const start = Math.max(1, cur - 2);
        const end = Math.min(total, start + 4);
        if (start > 1) {
            items.push({ type: 'page', page: 1, active: cur === 1 });
            if (start > 2) items.push({ type: 'ellipsis' });
        }
        for (let p = start; p <= end; p++) {
            items.push({ type: 'page', page: p, active: p === cur });
        }
        if (end < total) {
            if (end < total - 1) items.push({ type: 'ellipsis' });
            items.push({ type: 'page', page: total, active: cur === total });
        }
        return { cur, total, items, prevDisabled: cur <= 1, nextDisabled: cur >= total };
    }

    function html(opts) {
        const o = opts || {};
        const w = windowOf(o.current, o.totalPages);
        const c = Object.assign(
            { btn: 'page-btn', active: 'active', info: 'page-info' },
            o.classes || {}
        );
        const ellipsisCls = c.ellipsis || c.info;
        const goAttr = (p) => (o.onClick ? o.onClick(p) : `data-go="${p}"`);
        const out = [];
        out.push(
            `<button class="${c.btn}" ${w.prevDisabled ? 'disabled' : ''} ${goAttr(w.cur - 1)}>${o.prevLabel || '‹'}</button>`
        );
        for (const it of w.items) {
            if (it.type === 'ellipsis') {
                out.push(`<span class="${ellipsisCls}">…</span>`);
            } else {
                out.push(
                    `<button class="${c.btn}${it.active ? ' ' + c.active : ''}" ${goAttr(it.page)}>${it.page}</button>`
                );
            }
        }
        out.push(
            `<button class="${c.btn}" ${w.nextDisabled ? 'disabled' : ''} ${goAttr(w.cur + 1)}>${o.nextLabel || '›'}</button>`
        );
        const records = o.total != null ? Number(o.total) : null;
        const info = o.infoText
            ? o.infoText(w.cur, w.total, records)
            : records != null
              ? `${records.toLocaleString('vi-VN')} bản ghi — trang ${w.cur}/${w.total}`
              : `trang ${w.cur}/${w.total}`;
        if (info) out.push(`<span class="${c.info}">${info}</span>`);
        return out.join('');
    }

    function render(el, opts) {
        if (!el) return;
        el.innerHTML = html(opts);
        if (opts && typeof opts.onGo === 'function') {
            el.querySelectorAll('button[data-go]').forEach((b) => {
                b.addEventListener('click', () => opts.onGo(parseInt(b.dataset.go, 10)));
            });
        }
    }

    global.Web2Pagination = { window: windowOf, html, render };
})(typeof window !== 'undefined' ? window : globalThis);
