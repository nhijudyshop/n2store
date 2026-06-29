// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Drawer "chi tiết" TỔNG HỢP 1 thẻ — bấm nút mắt cạnh 1 thẻ ở bộ lọc Thẻ (native-orders).
// Slide-in từ phải (giống panel chi tiết trang Sản phẩm): liệt kê MỌI đơn trên trang đang
// mang thẻ đó (STT + KH + SĐT) + sản phẩm liên quan với thẻ SP (chờ hàng / âm mã / hết hàng /
// mua 1 phần → tag.detail.products mà server gắn ở /load). Data 100% từ STATE.orders (client).
// Nút đáy "Lọc bảng theo thẻ này" → NO.applyTagFilter(trigger). Bấm 1 đơn → cuộn tới + nhấp nháy.
(function (global) {
    'use strict';
    const NO = (global.NativeOrders = global.NativeOrders || {});
    // Thẻ có chi tiết SP (server gắn tag.detail.products) — khớp PRODUCT_DETAIL_TRIGGERS server.
    const PRODUCT_TAGS = new Set(['cho_hang', 'am_ma', 'het_hang', 'mua_1_phan']);

    function esc(s) {
        if (NO.escapeHtml) return NO.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function ensureStyles() {
        if (document.getElementById('no-tagagg-css')) return;
        const st = document.createElement('style');
        st.id = 'no-tagagg-css';
        st.textContent = `
        .no-tagagg-ov{position:fixed;inset:0;z-index:10070;background:rgba(15,23,42,.35);
            opacity:0;visibility:hidden;transition:opacity .18s ease;}
        .no-tagagg-ov.open{opacity:1;visibility:visible;}
        .no-tagagg-panel{position:absolute;top:0;right:0;height:100%;width:420px;max-width:94vw;
            background:#fff;box-shadow:-12px 0 40px rgba(15,23,42,.22);display:flex;flex-direction:column;
            transform:translateX(100%);transition:transform .22s cubic-bezier(.16,1,.3,1);
            font-family:Inter,system-ui,sans-serif;}
        .no-tagagg-ov.open .no-tagagg-panel{transform:translateX(0);}
        .no-tagagg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;
            padding:16px 18px;border-bottom:1px solid #eef2f7;background:#f8fafc;}
        .no-tagagg-titlewrap{display:inline-flex;align-items:center;gap:8px;font-size:16px;color:#0f172a;}
        .no-tagagg-dot{width:11px;height:11px;border-radius:999px;flex:0 0 auto;}
        .no-tagagg-sub{font-size:12px;color:#64748b;margin-top:3px;font-weight:600;}
        .no-tagagg-x{border:0;background:#fff;border:1px solid #e2e8f0;border-radius:8px;width:32px;height:32px;
            cursor:pointer;color:#475569;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;}
        .no-tagagg-x:hover{background:#f1f5f9;}
        .no-tagagg-x i{width:16px;height:16px;}
        .no-tagagg-body{flex:1;overflow:auto;padding:10px 14px;}
        .no-tagagg-order{border:1px solid #eef1f6;border-radius:10px;padding:9px 11px;margin-bottom:8px;cursor:pointer;
            transition:border-color .12s,background .12s;}
        .no-tagagg-order:hover{border-color:#bcdcff;background:#f6faff;}
        .no-tagagg-order.flash{animation:noTagAggFlash 1.1s ease;}
        @keyframes noTagAggFlash{0%,100%{background:#fff;}30%{background:#fff7ed;}}
        .no-tagagg-orow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
        .no-tagagg-stt{font-weight:800;color:#0068ff;background:#e8f2ff;border-radius:6px;padding:1px 8px;font-size:12.5px;white-space:nowrap;}
        .no-tagagg-cust{font-weight:700;color:#1e293b;font-size:13.5px;}
        .no-tagagg-phone{font-size:12px;color:#64748b;}
        .no-tagagg-prods{margin-top:6px;display:flex;flex-direction:column;gap:3px;}
        .no-tagagg-prod{font-size:12.5px;color:#334155;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
        .no-tagagg-pcode{font-family:ui-monospace,monospace;font-weight:700;color:#b45309;font-size:11.5px;}
        .no-tagagg-prod b{color:#dc2626;}
        .no-tagagg-empty{padding:30px 10px;text-align:center;color:#94a3b8;font-size:13px;}
        .no-tagagg-foot{padding:12px 14px;border-top:1px solid #eef2f7;background:#f8fafc;}
        .no-tagagg-filter{width:100%;height:40px;border:0;background:#0068ff;color:#fff;border-radius:9px;
            font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;}
        .no-tagagg-filter:hover{background:#0056d6;}
        .no-tagagg-filter i{width:15px;height:15px;}
        /* highlight hàng khi bấm 1 đơn trong drawer (cuộn tới + nhấp nháy) */
        #ordersTbody tr.no-row-flash>td{animation:noTagAggRowFlash 1.4s ease;}
        @keyframes noTagAggRowFlash{0%,100%{background:transparent;}25%{background:#fef3c7;}}`;
        document.head.appendChild(st);
    }

    let _ov = null;
    function ensureDrawer() {
        if (_ov && _ov.isConnected) return _ov;
        const ov = document.createElement('div');
        ov.id = 'noTagAggOverlay';
        ov.className = 'no-tagagg-ov';
        ov.innerHTML = `<div class="no-tagagg-panel" role="dialog" aria-modal="true">
                <div class="no-tagagg-head">
                    <div><div class="no-tagagg-titlewrap" id="noTagAggTitle"></div>
                        <div class="no-tagagg-sub" id="noTagAggSub"></div></div>
                    <button class="no-tagagg-x" id="noTagAggClose" title="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="no-tagagg-body" id="noTagAggBody"></div>
                <div class="no-tagagg-foot">
                    <button class="no-tagagg-filter" id="noTagAggFilter"><i data-lucide="filter"></i> Lọc bảng theo thẻ này</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            if (e.target === ov) close();
        });
        ov.querySelector('#noTagAggClose').addEventListener('click', close);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && ov.classList.contains('open')) close();
        });
        _ov = ov;
        return ov;
    }
    function close() {
        if (_ov) _ov.classList.remove('open');
    }

    // Số liên quan tới thẻ SP: chờ hàng → SL chờ; âm mã → vượt tồn; còn lại → SL đơn.
    function prodQty(p) {
        if (p.pendingQty != null) return p.pendingQty;
        if (p.orderQty != null) return p.orderQty;
        return '';
    }

    NO.openTagAggregateDetail = function openTagAggregateDetail(trigger) {
        if (!trigger) return;
        ensureStyles();
        const ov = ensureDrawer();
        const orders = (NO.STATE.orders || []).filter((o) =>
            (o.autoTags || []).some((t) => t && t.trigger === trigger)
        );
        const sum = (NO._tagSummary ? NO._tagSummary() : []).find((x) => x.trigger === trigger) || {
            label: trigger,
            color: '#6b7280',
        };
        const isProd = PRODUCT_TAGS.has(trigger);
        let prodCount = 0;
        const rowsHtml = orders
            .map((o) => {
                const stt = NO.computeOrderStt ? NO.computeOrderStt(o) : o.displayStt || '';
                const tag = (o.autoTags || []).find((t) => t.trigger === trigger);
                const prods =
                    isProd && tag && tag.detail && Array.isArray(tag.detail.products)
                        ? tag.detail.products
                        : [];
                prodCount += prods.length;
                const prodHtml = prods
                    .map((p) => {
                        const q = prodQty(p);
                        return `<div class="no-tagagg-prod"><span class="no-tagagg-pcode">${esc(p.code || '')}</span>${esc(p.name || '')}${q !== '' ? ` <b>×${esc(q)}</b>` : ''}</div>`;
                    })
                    .join('');
                return `<div class="no-tagagg-order" data-code="${esc(o.code)}">
                    <div class="no-tagagg-orow">
                        <span class="no-tagagg-stt">STT ${esc(stt)}</span>
                        <span class="no-tagagg-cust">${esc(o.customerName || 'Khách lạ')}</span>
                        ${o.phone ? `<span class="no-tagagg-phone">${esc(o.phone)}</span>` : ''}
                    </div>
                    ${prodHtml ? `<div class="no-tagagg-prods">${prodHtml}</div>` : ''}
                </div>`;
            })
            .join('');
        ov.querySelector('#noTagAggTitle').innerHTML =
            `<span class="no-tagagg-dot" style="background:${esc(sum.color)};"></span><b>${esc(sum.label)}</b>`;
        ov.querySelector('#noTagAggSub').textContent =
            `${orders.length} đơn` + (isProd ? ` · ${prodCount} sản phẩm` : '') + ' (trang này)';
        ov.querySelector('#noTagAggBody').innerHTML =
            rowsHtml ||
            '<div class="no-tagagg-empty">Không có đơn nào mang thẻ này trên trang.</div>';
        ov.querySelector('#noTagAggFilter').onclick = () => {
            close();
            if (NO.applyTagFilter) NO.applyTagFilter(trigger);
        };
        // Bấm 1 đơn → đóng drawer + cuộn tới hàng + nhấp nháy (định vị nhanh trong bảng).
        ov.querySelectorAll('.no-tagagg-order').forEach((el) =>
            el.addEventListener('click', () => {
                const code = el.getAttribute('data-code');
                close();
                const row = document.querySelector(
                    `#ordersTbody tr.order-row[data-code="${window.CSS && CSS.escape ? CSS.escape(code) : code}"]`
                );
                if (row) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.classList.add('no-row-flash');
                    setTimeout(() => row.classList.remove('no-row-flash'), 1400);
                }
            })
        );
        ov.classList.add('open');
        if (global.lucide) global.lucide.createIcons();
    };
})(typeof window !== 'undefined' ? window : globalThis);
