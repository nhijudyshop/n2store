// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Bảng điều khiển TRƯỢT PHẢI (thay chip "Thẻ" trên toolbar). Toggle = nút ở MÉP PHẢI màn hình.
// Drawer KHÔNG modal (bảng vẫn thao tác được) — tab:
//   • Thẻ     : danh sách thẻ trên trang. Bấm 1 thẻ = lọc bảng (client-side). Bấm ▸ = bung
//               chi tiết tổng hợp (mọi đơn STT + KH + SP liên quan với thẻ SP chờ hàng/âm mã…).
//   • Thống kê: tổng đơn/tiền/SL + theo trạng thái + theo thẻ (bấm = lọc nhanh) + cảnh báo.
// Data 100% từ STATE.orders (client). Dùng chung NO._tagSummary / _visibleOrders / applyTagFilter /
// computeOrderStt. Mở rộng thêm tab khác về sau chỉ cần thêm vào TABS + 1 hàm render<Tab>().
(function (global) {
    'use strict';
    const NO = (global.NativeOrders = global.NativeOrders || {});
    const PRODUCT_TAGS = new Set(['cho_hang', 'am_ma', 'het_hang', 'mua_1_phan']);
    const TABS = [
        { key: 'tags', label: 'Thẻ', icon: 'tag' },
        { key: 'products', label: 'Sản phẩm', icon: 'package' },
        { key: 'stats', label: 'Thống kê', icon: 'bar-chart-3' },
    ];
    let _tab = 'tags';
    let _open = false;
    const _expanded = new Set(); // triggers đang bung chi tiết trong tab Thẻ
    const _prodExpanded = new Set(); // sản phẩm đang bung (xem đơn nào chứa) trong tab Sản phẩm
    let _prodSearch = ''; // text tìm sản phẩm (tab Sản phẩm)

    function esc(s) {
        if (NO.escapeHtml) return NO.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }
    const vnd = (n) => Number(n || 0).toLocaleString('vi-VN');
    const tagSummary = () => (NO._tagSummary ? NO._tagSummary() : []);

    function ensureStyles() {
        if (document.getElementById('no-cd-css')) return;
        const st = document.createElement('style');
        st.id = 'no-cd-css';
        st.textContent = `
        .no-cd-toggle{position:fixed;right:0;top:46%;transform:translateY(-50%);z-index:10060;
            display:inline-flex;flex-direction:column;align-items:center;gap:4px;
            background:#0068ff;color:#fff;border:0;border-radius:12px 0 0 12px;padding:14px 9px;cursor:pointer;
            box-shadow:-4px 4px 16px rgba(0,104,255,.32);font-weight:800;font-size:11.5px;letter-spacing:.4px;
            font-family:Inter,system-ui,sans-serif;transition:padding .15s,background .15s;}
        .no-cd-toggle:hover{padding-right:14px;background:#0056d6;}
        .no-cd-toggle i{width:18px;height:18px;}
        .no-cd-toggle.hidden{display:none;}
        .no-cd-toggle .no-cd-badge{background:#fff;color:#0068ff;border-radius:999px;font-size:10px;
            min-width:16px;height:16px;line-height:16px;padding:0 4px;font-weight:800;}
        .no-cd-panel{position:fixed;top:0;right:0;height:100vh;width:392px;max-width:94vw;z-index:10061;
            background:#fff;box-shadow:-14px 0 44px rgba(15,23,42,.20);display:flex;flex-direction:column;
            transform:translateX(100%);transition:transform .22s cubic-bezier(.16,1,.3,1);
            font-family:Inter,system-ui,sans-serif;}
        .no-cd-panel.open{transform:translateX(0);}
        .no-cd-head{display:flex;align-items:center;gap:6px;padding:10px 10px 0 14px;border-bottom:1px solid #eef2f7;}
        .no-cd-tabs{display:flex;gap:4px;flex:1;}
        .no-cd-tab{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;cursor:pointer;
            padding:10px 12px;font-size:13.5px;font-weight:700;color:#64748b;border-bottom:2.5px solid transparent;}
        .no-cd-tab i{width:15px;height:15px;}
        .no-cd-tab:hover{color:#334155;}
        .no-cd-tab.active{color:#0068ff;border-bottom-color:#0068ff;}
        .no-cd-x{border:1px solid #e2e8f0;background:#fff;border-radius:8px;width:32px;height:32px;cursor:pointer;
            color:#475569;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;margin-bottom:8px;}
        .no-cd-x:hover{background:#f1f5f9;}
        .no-cd-x i{width:16px;height:16px;}
        .no-cd-body{flex:1;overflow:auto;padding:10px 12px 18px;}
        /* ── tab Thẻ ── */
        .no-cd-tagrow{display:flex;align-items:center;gap:8px;padding:8px 9px;border-radius:9px;cursor:pointer;
            border:1px solid transparent;}
        .no-cd-tagrow:hover{background:#f4f8ff;}
        .no-cd-tagrow.active{background:#e8f2ff;border-color:#bfdbfe;}
        .no-cd-dot{width:11px;height:11px;border-radius:999px;flex:0 0 auto;}
        .no-cd-tagname{flex:1;font-size:13.5px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .no-cd-tagcount{flex:0 0 auto;font-size:11px;font-weight:800;color:#64748b;background:#f1f5f9;border-radius:999px;padding:1px 8px;}
        .no-cd-chev{flex:0 0 auto;width:26px;height:26px;border:0;background:transparent;border-radius:7px;cursor:pointer;
            color:#94a3b8;display:inline-flex;align-items:center;justify-content:center;}
        .no-cd-chev:hover{background:#eef2f7;color:#475569;}
        .no-cd-chev i{width:16px;height:16px;transition:transform .15s;}
        .no-cd-chev.open i{transform:rotate(90deg);}
        .no-cd-detail{margin:2px 4px 8px 22px;padding-left:10px;border-left:2px solid #e5e7eb;display:flex;flex-direction:column;gap:7px;}
        .no-cd-order{cursor:pointer;}
        .no-cd-orow{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
        .no-cd-stt{font-weight:800;color:#0068ff;background:#e8f2ff;border-radius:6px;padding:0 7px;font-size:12px;white-space:nowrap;}
        .no-cd-cust{font-weight:700;color:#334155;font-size:12.5px;}
        .no-cd-phone{font-size:11.5px;color:#94a3b8;}
        .no-cd-order:hover .no-cd-cust{color:#0068ff;}
        .no-cd-prod{font-size:12px;color:#475569;margin-left:2px;}
        .no-cd-pcode{font-family:ui-monospace,monospace;font-weight:700;color:#b45309;font-size:11px;}
        .no-cd-prod b{color:#dc2626;}
        .no-cd-clear{margin:2px 0 8px;}
        /* ── tab Thống kê ── */
        .no-cd-secttitle{font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#94a3b8;margin:14px 4px 7px;}
        .no-cd-statgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .no-cd-stat{background:#f8fafc;border:1px solid #eef1f6;border-radius:11px;padding:11px 12px;}
        .no-cd-stat .v{font-size:18px;font-weight:800;color:#0f172a;}
        .no-cd-stat .l{font-size:11.5px;color:#64748b;font-weight:600;margin-top:2px;}
        .no-cd-chips{display:flex;flex-wrap:wrap;gap:7px;}
        .no-cd-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;background:#fff;border-radius:999px;
            padding:5px 11px;font-size:12.5px;font-weight:700;color:#334155;cursor:pointer;}
        .no-cd-chip:hover{border-color:#bfdbfe;background:#f4f8ff;}
        .no-cd-chip.active{background:#0068ff;border-color:#0068ff;color:#fff;}
        .no-cd-chip .c{font-weight:800;opacity:.85;}
        /* ── tab Sản phẩm ── */
        .no-cd-search{position:sticky;top:-10px;z-index:2;background:#fff;display:flex;align-items:center;gap:8px;
            border:1px solid #d8dee9;border-radius:10px;padding:0 11px;height:40px;margin:0 0 8px;}
        .no-cd-search i{width:15px;height:15px;color:#94a3b8;flex:0 0 auto;}
        .no-cd-search input{flex:1;border:0;outline:0;font-size:13.5px;color:#1e293b;background:transparent;}
        .no-cd-prodhead{font-size:11.5px;color:#64748b;font-weight:700;padding:2px 4px 8px;}
        .no-cd-prodrow{display:flex;align-items:center;gap:8px;padding:8px 8px;border-radius:9px;cursor:pointer;border:1px solid transparent;}
        .no-cd-prodrow:hover{background:#f4f8ff;border-color:#e6eefc;}
        .no-cd-prodmain{flex:1;min-width:0;}
        .no-cd-pname{font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .no-cd-pqty{flex:0 0 auto;font-size:12.5px;font-weight:800;color:#dc2626;background:#fef2f2;border-radius:999px;padding:1px 9px;}
        .no-cd-pord{flex:0 0 auto;font-size:11px;font-weight:700;color:#64748b;background:#f1f5f9;border-radius:999px;padding:1px 8px;}
        .no-cd-empty{padding:24px 10px;text-align:center;color:#94a3b8;font-size:13px;}
        /* highlight hàng khi bấm 1 đơn trong drawer (cuộn tới + nhấp nháy) */
        #ordersTbody tr.no-row-flash>td{animation:noCdRowFlash 1.4s ease;}
        @keyframes noCdRowFlash{0%,100%{background:transparent;}25%{background:#fef3c7;}}`;
        document.head.appendChild(st);
    }

    let _toggle = null,
        _panel = null;
    function ensureDom() {
        ensureStyles();
        if (_toggle && _toggle.isConnected && _panel && _panel.isConnected) return;
        _toggle = document.createElement('button');
        _toggle.id = 'noControlToggle';
        _toggle.className = 'no-cd-toggle';
        _toggle.type = 'button';
        _toggle.title = 'Bảng điều khiển: Thẻ + Thống kê';
        _toggle.innerHTML = `<i data-lucide="panel-right-open"></i><span>THẺ</span><span class="no-cd-badge" id="noCdBadge" style="display:none;"></span>`;
        _toggle.addEventListener('click', toggle);
        document.body.appendChild(_toggle);

        _panel = document.createElement('div');
        _panel.id = 'noControlPanel';
        _panel.className = 'no-cd-panel';
        _panel.innerHTML = `
            <div class="no-cd-head">
                <div class="no-cd-tabs" id="noCdTabs">
                    ${TABS.map((t) => `<button class="no-cd-tab${t.key === _tab ? ' active' : ''}" data-tab="${t.key}"><i data-lucide="${t.icon}"></i>${esc(t.label)}</button>`).join('')}
                </div>
                <button class="no-cd-x" id="noCdClose" title="Đóng"><i data-lucide="x"></i></button>
            </div>
            <div class="no-cd-body" id="noCdBody"></div>`;
        document.body.appendChild(_panel);
        _panel.querySelector('#noCdClose').addEventListener('click', close);
        _panel.querySelector('#noCdTabs').addEventListener('click', (e) => {
            const tb = e.target.closest('[data-tab]');
            if (!tb) return;
            _tab = tb.getAttribute('data-tab');
            _panel
                .querySelectorAll('.no-cd-tab')
                .forEach((el) =>
                    el.classList.toggle('active', el.getAttribute('data-tab') === _tab)
                );
            render();
        });
        // Delegation cho body (tag rows / chevron / order / chip thống kê).
        _panel.querySelector('#noCdBody').addEventListener('click', onBodyClick);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && _open) close();
        });
    }

    function onBodyClick(e) {
        const chev = e.target.closest('[data-expand]');
        if (chev) {
            const tr = chev.getAttribute('data-expand');
            if (_expanded.has(tr)) _expanded.delete(tr);
            else _expanded.add(tr);
            render();
            return;
        }
        const order = e.target.closest('[data-order]');
        if (order) {
            scrollToOrder(order.getAttribute('data-order'));
            return;
        }
        const pexp = e.target.closest('[data-pexpand]');
        if (pexp) {
            const k = pexp.getAttribute('data-pexpand');
            if (_prodExpanded.has(k)) _prodExpanded.delete(k);
            else _prodExpanded.add(k);
            renderProductList(); // chỉ list → giữ ô tìm
            return;
        }
        const filt = e.target.closest('[data-filter]');
        if (filt) {
            const tr = filt.getAttribute('data-filter');
            const next = NO.STATE.tagFilter === tr ? '' : tr; // bấm lại thẻ đang lọc → bỏ lọc
            if (NO.applyTagFilter) NO.applyTagFilter(next);
            else {
                NO.STATE.tagFilter = next;
                NO.renderRows();
                NO.renderCounters();
            }
            render();
        }
    }

    function scrollToOrder(code) {
        const row = document.querySelector(
            `#ordersTbody tr.order-row[data-code="${window.CSS && CSS.escape ? CSS.escape(code) : code}"]`
        );
        if (!row) return;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('no-row-flash');
        setTimeout(() => row.classList.remove('no-row-flash'), 1400);
    }

    function prodQty(p) {
        if (p.pendingQty != null) return p.pendingQty;
        if (p.orderQty != null) return p.orderQty;
        return '';
    }

    // Chi tiết tổng hợp 1 thẻ (bung trong tab Thẻ): đơn STT + KH + SP liên quan.
    function tagDetailHtml(trigger) {
        const orders = (NO.STATE.orders || []).filter((o) =>
            (o.autoTags || []).some((t) => t && t.trigger === trigger)
        );
        const isProd = PRODUCT_TAGS.has(trigger);
        if (!orders.length) return '<div class="no-cd-detail"><i>Không có đơn nào.</i></div>';
        const items = orders
            .map((o) => {
                const stt = NO.computeOrderStt ? NO.computeOrderStt(o) : o.displayStt || '';
                const tag = (o.autoTags || []).find((t) => t.trigger === trigger);
                const prods =
                    isProd && tag && tag.detail && Array.isArray(tag.detail.products)
                        ? tag.detail.products
                        : [];
                const ph = prods
                    .map((p) => {
                        const q = prodQty(p);
                        return `<div class="no-cd-prod"><span class="no-cd-pcode">${esc(p.code || '')}</span> ${esc(p.name || '')}${q !== '' ? ` <b>×${esc(q)}</b>` : ''}</div>`;
                    })
                    .join('');
                return `<div class="no-cd-order" data-order="${esc(o.code)}" title="Bấm để cuộn tới đơn trong bảng">
                    <div class="no-cd-orow"><span class="no-cd-stt">STT ${esc(stt)}</span>
                        <span class="no-cd-cust">${esc(o.customerName || 'Khách lạ')}</span>
                        ${o.phone ? `<span class="no-cd-phone">${esc(o.phone)}</span>` : ''}</div>
                    ${ph}</div>`;
            })
            .join('');
        return `<div class="no-cd-detail">${items}</div>`;
    }

    function renderTagsTab() {
        const tags = tagSummary();
        const cur = NO.STATE.tagFilter || '';
        const allRow = `<div class="no-cd-tagrow${cur === '' ? ' active' : ''}" data-filter="" style="margin-bottom:4px;">
                <i data-lucide="${cur === '' ? 'check' : 'layout-list'}" style="width:15px;height:15px;color:#0068ff;"></i>
                <span class="no-cd-tagname">Tất cả</span></div>`;
        if (!tags.length)
            return allRow + '<div class="no-cd-empty">Trang này chưa có thẻ nào.</div>';
        const rows = tags
            .map((t) => {
                const isOpen = _expanded.has(t.trigger);
                return `<div class="no-cd-tagrow${cur === t.trigger ? ' active' : ''}" data-filter="${esc(t.trigger)}" title="Bấm để lọc bảng theo thẻ này">
                    <span class="no-cd-dot" style="background:${esc(t.color)};"></span>
                    <span class="no-cd-tagname">${esc(t.label)}</span>
                    <span class="no-cd-tagcount">${t.count}</span>
                    <button class="no-cd-chev${isOpen ? ' open' : ''}" data-expand="${esc(t.trigger)}" title="Xem chi tiết các đơn"><i data-lucide="chevron-right"></i></button>
                </div>${isOpen ? tagDetailHtml(t.trigger) : ''}`;
            })
            .join('');
        return allRow + rows;
    }

    // ── tab Sản phẩm ── gom MỌI sản phẩm trong tất cả giỏ/đơn trên trang theo mã.
    function aggregateProducts() {
        const map = new Map();
        for (const o of NO.STATE.orders || []) {
            const stt = NO.computeOrderStt ? NO.computeOrderStt(o) : o.displayStt || '';
            for (const p of o.products || []) {
                const code = p.productCode || p.product_code || p.code || '';
                const name = p.name || p.productName || '';
                const key = (code || name).toLowerCase();
                if (!key) continue;
                let e = map.get(key);
                if (!e) {
                    e = { code, name, totalQty: 0, orders: [] };
                    map.set(key, e);
                }
                const q = Number(p.quantity) || 0;
                e.totalQty += q;
                e.orders.push({
                    code: o.code,
                    stt,
                    customerName: o.customerName || 'Khách lạ',
                    qty: q,
                });
            }
        }
        return [...map.values()].sort((a, b) => b.totalQty - a.totalQty);
    }

    function renderProductsTab() {
        // Ô tìm STICKY trên cùng; danh sách re-render riêng (#noCdProdList) để KHÔNG mất focus.
        return `<div class="no-cd-search"><i data-lucide="search"></i>
                <input id="noCdProdSearch" type="text" placeholder="Tìm sản phẩm (mã hoặc tên)…" value="${esc(_prodSearch)}" autocomplete="off"></div>
            <div id="noCdProdList"></div>`;
    }

    function renderProductList() {
        const list = document.getElementById('noCdProdList');
        if (!list) return;
        const q = _prodSearch.trim().toLowerCase();
        let prods = aggregateProducts();
        if (q) prods = prods.filter((p) => (p.code + ' ' + p.name).toLowerCase().includes(q));
        if (!prods.length) {
            list.innerHTML = '<div class="no-cd-empty">Không có sản phẩm khớp.</div>';
            return;
        }
        const totalQty = prods.reduce((s, p) => s + p.totalQty, 0);
        const head = `<div class="no-cd-prodhead">${prods.length} loại SP · ${vnd(totalQty)} cái${q ? ' (đã lọc)' : ''}</div>`;
        list.innerHTML =
            head +
            prods
                .map((p) => {
                    const key = (p.code || p.name).toLowerCase();
                    const open = _prodExpanded.has(key);
                    const ords = open
                        ? `<div class="no-cd-detail">${p.orders
                              .map(
                                  (o) =>
                                      `<div class="no-cd-order" data-order="${esc(o.code)}" title="Cuộn tới đơn"><div class="no-cd-orow"><span class="no-cd-stt">STT ${esc(o.stt)}</span><span class="no-cd-cust">${esc(o.customerName)}</span><b style="color:#dc2626;">×${esc(o.qty)}</b></div></div>`
                              )
                              .join('')}</div>`
                        : '';
                    return `<div class="no-cd-prodrow" data-pexpand="${esc(key)}" title="Bấm xem đơn nào chứa SP này">
                        <div class="no-cd-prodmain">
                            <div class="no-cd-pcode">${esc(p.code || '—')}</div>
                            <div class="no-cd-pname">${esc(p.name || '')}</div>
                        </div>
                        <span class="no-cd-pqty">×${vnd(p.totalQty)}</span>
                        <span class="no-cd-pord">${p.orders.length} đơn</span>
                        <button class="no-cd-chev${open ? ' open' : ''}" data-pexpand="${esc(key)}"><i data-lucide="chevron-right"></i></button>
                    </div>${ords}`;
                })
                .join('');
        if (global.lucide) global.lucide.createIcons();
    }

    function renderStatsTab() {
        const orders = NO.STATE.orders || [];
        const n = orders.length;
        const money = orders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
        const qty = orders.reduce((s, o) => s + (Number(o.totalQuantity) || 0), 0);
        const byStatus = { draft: 0, confirmed: 0, cancelled: 0, delivered: 0 };
        for (const o of orders) if (byStatus[o.status] != null) byStatus[o.status]++;
        const cur = NO.STATE.tagFilter || '';
        const tags = tagSummary();
        const card = (v, l) =>
            `<div class="no-cd-stat"><div class="v">${v}</div><div class="l">${l}</div></div>`;
        const tagChips = tags.length
            ? `<div class="no-cd-chips">${tags
                  .map(
                      (t) =>
                          `<button class="no-cd-chip${cur === t.trigger ? ' active' : ''}" data-filter="${esc(t.trigger)}"><span class="no-cd-dot" style="background:${esc(t.color)};"></span>${esc(t.label)} <span class="c">${t.count}</span></button>`
                  )
                  .join('')}</div>`
            : '<div class="no-cd-empty">Chưa có thẻ.</div>';
        return `
            <div class="no-cd-secttitle">Tổng quan (trang này)</div>
            <div class="no-cd-statgrid">
                ${card(vnd(n), 'đơn')}
                ${card(vnd(money) + 'đ', 'tổng tiền')}
                ${card(vnd(qty), 'sản phẩm')}
                ${card(vnd(byStatus.draft), 'giỏ hàng')}
            </div>
            <div class="no-cd-secttitle">Theo trạng thái</div>
            <div class="no-cd-statgrid">
                ${card(vnd(byStatus.draft), 'Giỏ hàng')}
                ${card(vnd(byStatus.confirmed), 'Đơn hàng')}
                ${card(vnd(byStatus.delivered), 'Đã giao')}
                ${card(vnd(byStatus.cancelled), 'Đã hủy')}
            </div>
            <div class="no-cd-secttitle">Theo thẻ — bấm để lọc</div>
            ${tagChips}`;
    }

    function render() {
        if (!_panel) return;
        const body = _panel.querySelector('#noCdBody');
        body.innerHTML =
            _tab === 'stats'
                ? renderStatsTab()
                : _tab === 'products'
                  ? renderProductsTab()
                  : renderTagsTab();
        if (global.lucide) global.lucide.createIcons();
        if (_tab === 'products') {
            const inp = document.getElementById('noCdProdSearch');
            if (inp) {
                inp.addEventListener('input', () => {
                    _prodSearch = inp.value;
                    renderProductList(); // chỉ re-render list → giữ focus ô tìm
                });
            }
            renderProductList();
        }
    }

    function updateBadge() {
        const b = document.getElementById('noCdBadge');
        if (!b) return;
        const cur = NO.STATE.tagFilter || '';
        if (!cur) {
            b.style.display = 'none';
            return;
        }
        b.style.display = '';
        b.textContent = '1';
    }

    function open() {
        ensureDom();
        _open = true;
        _panel.classList.add('open');
        _toggle.classList.add('hidden');
        render();
    }
    function close() {
        _open = false;
        if (_panel) _panel.classList.remove('open');
        if (_toggle) _toggle.classList.remove('hidden');
    }
    function toggle() {
        _open ? close() : open();
    }

    // Gọi sau mỗi load (render.js) + sau applyTagFilter → cập nhật badge + nội dung nếu đang mở.
    NO.refreshControlDrawer = function refreshControlDrawer() {
        updateBadge();
        if (_open) render();
    };
    NO.toggleControlDrawer = toggle;
    NO.openControlDrawer = open;

    // Tạo nút toggle ngay khi script load (kể cả khi chưa load xong data).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureDom);
    } else {
        ensureDom();
    }
})(typeof window !== 'undefined' ? window : globalThis);
