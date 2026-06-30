// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// WEB 2.0 — KHO SP · Drawer chi tiết sản phẩm (slide-in phải)
// =====================================================================
// Bấm vào 1 dòng SP (ngoài các nút thao tác) → drawer trượt từ phải với
// 4 tab:
//   • Tổng quan — NCC, biến thể/tồn, giá mua/bán, trạng thái, ghi chú, in tem
//   • Đơn hàng  — đơn web đang chứa SP (reuse usage data, gom theo chiến dịch)
//   • Lịch sử   — timeline mọi mutation (tên user + diff field)
//   • Sửa       — form inline sửa nhanh (name/giá/tồn/note/trạng thái)
//
// Tách file riêng (không nhét vào web2-products-app.js vốn đã lớn). Lấy data
// qua window.Web2ProductsApp (getProduct/getUsage/PROXY_BASE) + window.Web2ProductsApi.
// Anti-lag theo docs/web2/MODAL-ANTI-LAG.md (transform/opacity, passive scroll).
(function () {
    'use strict';

    const TABS = [
        { id: 'overview', label: 'Tổng quan', icon: 'info' },
        { id: 'orders', label: 'Đơn hàng', icon: 'shopping-cart' },
        { id: 'history', label: 'Lịch sử', icon: 'history' },
        { id: 'edit', label: 'Sửa', icon: 'pencil' },
    ];

    let _els = null; // { overlay, drawer } khi đang mở
    let _currentCode = null;
    const _loaded = {}; // tab id → đã load chưa (cho lazy fetch)

    // ── helpers ──────────────────────────────────────────────────────
    function app() {
        return window.Web2ProductsApp || {};
    }
    function api() {
        return window.Web2ProductsApi || {};
    }
    function proxyBase() {
        return app().PROXY_BASE || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    }
    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[detail:${type}]`, msg);
    }
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s); // 1 nguồn
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtVnd(n) {
        if (window.Web2Format && window.Web2Format.vnd) return window.Web2Format.vnd(n);
        const v = Number(n) || 0;
        return v.toLocaleString('vi-VN') + 'đ';
    }
    // 2026-06-16: giá gốc ngoại tệ (suy ngược VND/origin_rate) cho SP nhập từ tab
    // so-order ≠ VND. Trả chuỗi "≈ 221 CNY" hoặc '' (SP nhập VND).
    function originHint(vnd, p) {
        const cur = p && p.originCurrency ? String(p.originCurrency).toUpperCase() : '';
        const rate = Number(p && p.originRate) || 0;
        if (!cur || cur === 'VND' || rate <= 0) return '';
        const dec = cur === 'JPY' || cur === 'KRW' ? 0 : 2;
        const amt = ((Number(vnd) || 0) / rate).toLocaleString('vi-VN', {
            minimumFractionDigits: dec,
            maximumFractionDigits: dec,
        });
        return `≈ ${amt} ${cur}`;
    }
    function fmtTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        if (isNaN(d)) return '';
        return d.toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh', // quy tắc 10 GMT+7
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    function safeImg(url) {
        const s = String(url || '').trim();
        if (!s) return '';
        if (/^(https?:|data:image\/)/i.test(s)) return s;
        return '';
    }
    function icons() {
        if (window.lucide) window.lucide.createIcons();
    }

    // ── open / close ─────────────────────────────────────────────────
    function open(code) {
        const product = app().getProduct?.(code);
        if (!product) {
            notify('Không tìm thấy sản phẩm', 'error');
            return;
        }
        close(true); // dọn drawer cũ (nếu có) không animation
        _currentCode = code;
        for (const k of Object.keys(_loaded)) delete _loaded[k];

        const overlay = document.createElement('div');
        overlay.className = 'w2pd-overlay';

        const drawer = document.createElement('aside');
        drawer.className = 'w2pd-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-label', 'Chi tiết sản phẩm');
        drawer.innerHTML = _shellHtml(product);

        document.body.appendChild(overlay);
        document.body.appendChild(drawer);
        _els = { overlay, drawer };

        // Lock scroll trên main-content (scroll thật của trang) — overscroll
        // contain trên body drawer chặn scroll-chaining phần còn lại.
        const main = document.querySelector('.main-content');
        if (main) {
            drawer.dataset.prevMainOverflow = main.style.overflow || '';
            main.style.overflow = 'hidden';
        }

        // wire events
        overlay.addEventListener('click', () => close());
        drawer.querySelector('.w2pd-close').addEventListener('click', () => close());
        drawer.querySelectorAll('.w2pd-tab').forEach((btn) => {
            btn.addEventListener('click', () => _activateTab(btn.dataset.tab));
        });
        _escHandler = (e) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', _escHandler);

        icons();
        // trigger slide-in (next frame để transition chạy)
        requestAnimationFrame(() => {
            overlay.classList.add('is-open');
            drawer.classList.add('is-open');
        });

        // highlight row
        document
            .querySelectorAll('#productsTbody tr.w2pd-row-active')
            .forEach((tr) => tr.classList.remove('w2pd-row-active'));
        document
            .querySelector(`#productsTbody tr[data-code="${cssEscape(code)}"]`)
            ?.classList.add('w2pd-row-active');

        _activateTab('overview');
    }

    let _escHandler = null;
    function close(immediate) {
        document
            .querySelectorAll('#productsTbody tr.w2pd-row-active')
            .forEach((tr) => tr.classList.remove('w2pd-row-active'));
        if (_escHandler) {
            document.removeEventListener('keydown', _escHandler);
            _escHandler = null;
        }
        if (!_els) {
            // còn drawer rác từ lần trước
            document.querySelectorAll('.w2pd-overlay, .w2pd-drawer').forEach((el) => el.remove());
            return;
        }
        const { overlay, drawer } = _els;
        const main = document.querySelector('.main-content');
        if (main) main.style.overflow = drawer.dataset.prevMainOverflow || '';
        _els = null;
        _currentCode = null;
        if (immediate) {
            overlay.remove();
            drawer.remove();
            return;
        }
        overlay.classList.remove('is-open');
        drawer.classList.remove('is-open');
        const done = () => {
            overlay.remove();
            drawer.remove();
        };
        drawer.addEventListener('transitionend', done, { once: true });
        setTimeout(done, 360); // fallback nếu transitionend không fire
    }

    function cssEscape(s) {
        if (window.CSS?.escape) return window.CSS.escape(s);
        return String(s).replace(/[^a-zA-Z0-9_-]/g, (m) => '\\' + m);
    }

    // ── shell (header + tabs + empty panes) ──────────────────────────
    function _shellHtml(p) {
        const img = safeImg(p.imageUrl);
        const head = img
            ? `<img class="w2pd-head-img" src="${esc(img)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';"><span class="w2pd-head-img-ph" style="display:none;"><i data-lucide="image"></i></span>`
            : `<span class="w2pd-head-img-ph"><i data-lucide="image"></i></span>`;
        const tabs = TABS.map(
            (t) =>
                `<button class="w2pd-tab" type="button" data-tab="${t.id}"><i data-lucide="${t.icon}"></i>${esc(t.label)}<span class="w2pd-tab-badge" data-badge="${t.id}" hidden></span></button>`
        ).join('');
        const panes = TABS.map((t) => `<div class="w2pd-pane" data-pane="${t.id}"></div>`).join('');
        return `
            <div class="w2pd-head">
                ${head}
                <div class="w2pd-head-info">
                    <div class="w2pd-head-name">${esc(p.name)}</div>
                    <div class="w2pd-head-code">${esc(p.code)}</div>
                </div>
                <button class="w2pd-close" type="button" aria-label="Đóng">×</button>
            </div>
            <nav class="w2pd-tabs">${tabs}</nav>
            <div class="w2pd-body">${panes}</div>`;
    }

    function _pane(id) {
        return _els?.drawer.querySelector(`.w2pd-pane[data-pane="${id}"]`);
    }
    function _activateTab(id) {
        if (!_els) return;
        _els.drawer.querySelectorAll('.w2pd-tab').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.tab === id);
        });
        _els.drawer.querySelectorAll('.w2pd-pane').forEach((pn) => {
            pn.classList.toggle('is-active', pn.dataset.pane === id);
        });
        if (!_loaded[id]) {
            _loaded[id] = true;
            _renderTab(id);
        }
    }

    function _renderTab(id) {
        const p = app().getProduct?.(_currentCode);
        if (!p) return;
        if (id === 'overview') _renderOverview(p);
        else if (id === 'orders') _renderOrders(p);
        else if (id === 'history') _renderHistory(p);
        else if (id === 'edit') _renderEdit(p);
    }

    // ── Tab: Tổng quan ───────────────────────────────────────────────
    function _renderOverview(p) {
        const pane = _pane('overview');
        if (!pane) return;
        const stock = Number(p.stock || 0);
        const stockColor = stock === 0 ? '#dc2626' : stock < 5 ? '#d97706' : '#15803d';
        // Pill trạng thái — 1 NGUỒN window.Web2ProductStatus (khỏi drift với bảng Kho SP).
        const statusPill = (window.Web2ProductStatus && window.Web2ProductStatus.pill(p)) || '';

        pane.innerHTML = `
            <div class="w2pd-grid">
                <div class="w2pd-stat">
                    <div class="w2pd-stat-label"><i data-lucide="truck"></i>NCC / Nguồn</div>
                    <div class="w2pd-stat-value">${esc(p.supplier || 'KHO')}</div>
                </div>
                <div class="w2pd-stat">
                    <div class="w2pd-stat-label"><i data-lucide="layers"></i>Biến thể</div>
                    <div class="w2pd-stat-value">${esc(p.variant || '—')}</div>
                </div>
                <div class="w2pd-stat">
                    <div class="w2pd-stat-label"><i data-lucide="package"></i>Tồn kho</div>
                    <div class="w2pd-stat-value" style="color:${stockColor};">${stock}${Number(p.returnQty) > 0 ? ` <span style="font-size:11px;color:#0058da;">(+${Number(p.returnQty)} thu về)</span>` : ''}</div>
                </div>
                <div class="w2pd-stat">
                    <div class="w2pd-stat-label"><i data-lucide="activity"></i>Trạng thái</div>
                    <div class="w2pd-stat-value">${statusPill}</div>
                </div>
                <div class="w2pd-stat">
                    <div class="w2pd-stat-label"><i data-lucide="shopping-bag"></i>Giá mua</div>
                    <div class="w2pd-stat-value buy">${fmtVnd(p.originalPrice)}${(() => {
                        const h = originHint(p.originalPrice, p);
                        return h
                            ? `<span style="display:block;font-size:11px;font-weight:600;color:#64748b;margin-top:2px;">${esc(h)}</span>`
                            : '';
                    })()}</div>
                </div>
                <div class="w2pd-stat">
                    <div class="w2pd-stat-label"><i data-lucide="tag"></i>Giá bán</div>
                    <div class="w2pd-stat-value sell">${fmtVnd(p.price)}${(() => {
                        const h = originHint(p.price, p);
                        return h
                            ? `<span style="display:block;font-size:11px;font-weight:600;color:#64748b;margin-top:2px;">${esc(h)}</span>`
                            : '';
                    })()}</div>
                </div>
                <div class="w2pd-stat span2">
                    <div class="w2pd-stat-label"><i data-lucide="sticky-note"></i>Ghi chú</div>
                    <div class="w2pd-stat-value" style="font-weight:500;font-size:13px;">${esc(p.note || '—')}</div>
                </div>
                ${
                    Number(p.printCount) > 0
                        ? `<div class="w2pd-stat span2"><div class="w2pd-stat-label"><i data-lucide="printer"></i>Đã in tem</div><div class="w2pd-stat-value" style="font-size:13px;">${Number(p.printCount)} lần</div></div>`
                        : ''
                }
            </div>
            <div class="w2pd-form-actions">
                <button class="w2pd-btn w2pd-btn-save" type="button" data-act="print"><i data-lucide="printer"></i>In tem</button>
                <button class="w2pd-btn w2pd-btn-ghost" type="button" data-act="copy"><i data-lucide="copy"></i>Copy mã</button>
            </div>`;
        pane.querySelector('[data-act="print"]')?.addEventListener('click', () => {
            app().printBarcode?.(p.code);
        });
        pane.querySelector('[data-act="copy"]')?.addEventListener('click', () => {
            app().copyCode?.(p.code);
        });
        icons();
    }

    // ── Tab: Đơn hàng (usage) ────────────────────────────────────────
    async function _renderOrders(p) {
        const pane = _pane('orders');
        if (!pane) return;
        pane.innerHTML = `<div class="w2pd-loading"><i data-lucide="loader"></i> Đang tải đơn hàng...</div>`;
        icons();

        let entries = app().getUsage?.(p.code);
        if (!Array.isArray(entries)) {
            try {
                const r = await api().usage?.([p.code]);
                entries = r?.usage?.[p.code] || [];
            } catch (e) {
                pane.innerHTML = `<div class="w2pd-empty" style="color:#dc2626;">Lỗi tải: ${esc(e.message)}</div>`;
                return;
            }
        }
        _setBadge('orders', entries.length);
        if (!entries.length) {
            pane.innerHTML = `<div class="w2pd-empty"><i data-lucide="inbox" style="width:28px;height:28px;opacity:.4;"></i><div style="margin-top:8px;">Chưa có đơn web nào dùng SP này.</div></div>`;
            icons();
            return;
        }

        // gom theo chiến dịch (campaignId | fbPostId)
        const groups = new Map();
        for (const e of entries) {
            const k = e.campaignId || e.fbPostId || '__none__';
            if (!groups.has(k)) groups.set(k, { name: e.campaignName || e.fbPostId, items: [] });
            groups.get(k).items.push(e);
        }
        const statusColors = { draft: '#64748b', confirmed: '#0ea5e9', sent: '#16a34a' };
        const statusLabels = { draft: 'Giỏ hàng', confirmed: 'Đơn hàng', sent: 'Đã gửi' };
        let totalQty = 0;
        entries.forEach((e) => (totalQty += Number(e.qty) || 0));

        let html = `<div style="font-size:13px;color:var(--gray-500,#6b7280);margin-bottom:12px;">
            <strong style="color:#0058da;">${entries.length}</strong> đơn · tổng <strong style="color:#0058da;">${totalQty}</strong> cái</div>`;
        for (const [, g] of groups) {
            html += `<div class="w2pd-camp"><div class="w2pd-camp-title"><i data-lucide="megaphone"></i>${esc(g.name || '(không có chiến dịch)')}</div>`;
            for (const it of g.items) {
                const stt =
                    it.mergedDisplayStt && it.mergedDisplayStt.length
                        ? it.mergedDisplayStt.join('+')
                        : it.displayStt || '?';
                const col = statusColors[it.status] || '#64748b';
                const lbl = statusLabels[it.status] || it.status || '';
                html += `<a class="w2pd-order" href="../../native-orders/index.html?search=${encodeURIComponent(it.orderCode || '')}" target="_blank" rel="noopener" title="Mở đơn ${esc(it.orderCode || '')}">
                    <span class="w2pd-order-stt">STT ${esc(String(stt))}</span>
                    <span class="w2pd-order-cust"><strong>${esc(it.customerName || '?')}</strong>${it.phone ? ' · ' + esc(it.phone) : ''}</span>
                    <span class="w2pd-order-qty">×${esc(String(it.qty ?? 0))}</span>
                    <span class="w2pd-order-status" style="background:${col}20;color:${col};">${esc(lbl)}</span>
                </a>`;
            }
            html += `</div>`;
        }
        pane.innerHTML = html;
        icons();
    }

    // ── Tab: Lịch sử ─────────────────────────────────────────────────
    const ACTION_META = {
        create: { label: 'Tạo mới', color: '#16a34a', icon: 'plus-circle' },
        update: { label: 'Cập nhật', color: '#3b82f6', icon: 'pencil' },
        delete: { label: 'Xoá', color: '#dc2626', icon: 'trash-2' },
        'stock-adjust': { label: 'Điều chỉnh tồn', color: '#f59e0b', icon: 'package' },
        'toggle-active': { label: 'Đổi trạng thái', color: '#2a96ff', icon: 'toggle-left' },
        'confirm-purchase': { label: 'Mua hàng', color: '#0ea5e9', icon: 'shopping-cart' },
        'upsert-pending': { label: 'Đặt nháp', color: '#94a3b8', icon: 'clock' },
    };
    async function _renderHistory(p) {
        const pane = _pane('history');
        if (!pane) return;
        pane.innerHTML = `<div class="w2pd-loading"><i data-lucide="loader"></i> Đang tải lịch sử...</div>`;
        icons();
        try {
            // Audit (2026-06-20): gắn x-web2-token cho consistency với mọi API khác
            // (phòng WEB2_AUTH_ENFORCE mở rộng sang GET → tránh 401 im lặng).
            const authH =
                window.Web2Auth && window.Web2Auth.authHeaders
                    ? window.Web2Auth.authHeaders({ Accept: 'application/json' })
                    : { Accept: 'application/json' };
            const r = await fetch(
                `${proxyBase()}/api/web2-products/${encodeURIComponent(p.code)}/history?limit=100`,
                { headers: authH }
            );
            const data = await r.json();
            const list = data?.history || [];
            _setBadge('history', list.length);
            if (!list.length) {
                pane.innerHTML = `<div class="w2pd-empty">Chưa có lịch sử nào.</div>`;
                return;
            }
            pane.innerHTML = list.map(_histEntryHtml).join('');
            icons();
        } catch (e) {
            pane.innerHTML = `<div class="w2pd-empty" style="color:#dc2626;">Lỗi tải: ${esc(e.message)}</div>`;
        }
    }
    function _histEntryHtml(h) {
        const am = ACTION_META[h.action] || { label: h.action, color: '#64748b', icon: 'circle' };
        let changesHtml = '';
        if (h.action === 'create' || h.action === 'delete') {
            const snap = h.changes?.snapshot || h.changes || {};
            const keys = ['code', 'name', 'variant', 'price', 'originalPrice', 'stock', 'note'];
            changesHtml = keys
                .filter((k) => snap[k] != null && snap[k] !== '' && snap[k] !== 0)
                .map(
                    (k) =>
                        `<div class="w2pd-hist-field"><span class="w2pd-hist-field-name">${esc(k)}</span>: <span class="w2pd-hist-after">${esc(String(snap[k]).slice(0, 60))}</span></div>`
                )
                .join('');
        } else {
            const fmt = (v) => {
                if (v == null || v === '') return '<em>(rỗng)</em>';
                const s = String(v);
                if (s.startsWith('data:image')) return '<em>(ảnh)</em>';
                return esc(s.slice(0, 80));
            };
            changesHtml = Object.entries(h.changes || {})
                .map(([field, diff]) => {
                    if (!diff || typeof diff !== 'object' || !('before' in diff)) return '';
                    return `<div class="w2pd-hist-field"><span class="w2pd-hist-field-name">${esc(field)}</span>: <span class="w2pd-hist-before">${fmt(diff.before)}</span> <i data-lucide="arrow-right" style="width:11px;height:11px;color:#94a3b8;"></i> <span class="w2pd-hist-after">${fmt(diff.after)}</span></div>`;
                })
                .join('');
            if (!changesHtml)
                changesHtml = `<div class="w2pd-hist-field" style="color:#94a3b8;font-style:italic;">(không có thay đổi field)</div>`;
        }
        const user = h.userName || h.userId ? esc(h.userName || h.userId) : '<em>không rõ</em>';
        const source = h.sourcePage
            ? `<span class="w2pd-hist-source">${esc(h.sourcePage)}</span>`
            : '';
        return `<div class="w2pd-hist">
            <div class="w2pd-hist-marker" style="background:${am.color}20;color:${am.color};"><i data-lucide="${am.icon}" style="width:14px;height:14px;"></i></div>
            <div class="w2pd-hist-body">
                <div class="w2pd-hist-meta">
                    <strong style="color:${am.color};">${esc(am.label)}</strong>
                    <span class="w2pd-hist-user"><i data-lucide="user"></i>${user}</span>
                    ${source}
                    <span class="w2pd-hist-time">${fmtTime(h.createdAt)}</span>
                </div>
                ${changesHtml}
            </div>
        </div>`;
    }

    // ── Tab: Sửa chi tiết (inline form) ──────────────────────────────
    function _renderEdit(p) {
        const pane = _pane('edit');
        if (!pane) return;
        pane.innerHTML = `
            <div class="w2pd-form-field">
                <label>Tên sản phẩm</label>
                <input type="text" data-f="name" value="${esc(p.name || '')}" />
            </div>
            <div class="w2pd-form-row">
                <div class="w2pd-form-field">
                    <label>Giá mua (đ)</label>
                    <input type="text" inputmode="numeric" data-w2num data-f="originalPrice" value="${Number(p.originalPrice) || 0}" />
                </div>
                <div class="w2pd-form-field">
                    <label>Giá bán (đ)</label>
                    <input type="text" inputmode="numeric" data-w2num data-f="price" value="${Number(p.price) || 0}" />
                </div>
            </div>
            <div class="w2pd-form-row">
                <div class="w2pd-form-field">
                    <label>Tồn kho</label>
                    <input type="number" data-f="stock" value="${Number(p.stock) || 0}" />
                </div>
                <div class="w2pd-form-field">
                    <label>Trạng thái</label>
                    <select data-f="isActive">
                        <option value="true"${p.isActive ? ' selected' : ''}>Đang bán</option>
                        <option value="false"${!p.isActive ? ' selected' : ''}>Tạm dừng</option>
                    </select>
                </div>
            </div>
            <div class="w2pd-form-field">
                <label>Ghi chú</label>
                <textarea data-f="note" rows="2">${esc(p.note || '')}</textarea>
            </div>
            <div class="w2pd-form-actions">
                <button class="w2pd-btn w2pd-btn-save" type="button" data-act="save"><i data-lucide="save"></i>Lưu thay đổi</button>
                <button class="w2pd-btn w2pd-btn-ghost" type="button" data-act="full" title="Form đầy đủ (ảnh, biến thể, mã, NCC)"><i data-lucide="settings-2"></i></button>
            </div>
            <div class="w2pd-form-hint">Ảnh, biến thể, mã, NCC → bấm nút ⚙ mở form đầy đủ.</div>`;
        if (window.Web2NumberInput) Web2NumberInput.attachAll(pane); // format giá ngay khi gõ (1.000)
        pane.querySelector('[data-act="save"]')?.addEventListener('click', () => _saveEdit(p.code));
        pane.querySelector('[data-act="full"]')?.addEventListener('click', () => {
            close();
            app().openEdit?.(p.code);
        });
        icons();
    }

    async function _saveEdit(code) {
        const pane = _pane('edit');
        if (!pane) return;
        const val = (f) => pane.querySelector(`[data-f="${f}"]`)?.value;
        // Đọc số tiền đã format (1.000) đúng giá trị thật qua Web2NumberInput.
        const valNum = (f) => {
            const el = pane.querySelector(`[data-f="${f}"]`);
            return (window.Web2NumberInput ? Web2NumberInput.getValue(el) : Number(el?.value)) || 0;
        };
        const name = (val('name') || '').trim();
        if (!name) return notify('Thiếu tên sản phẩm', 'error');

        // Chỉ PATCH field THỰC SỰ đổi so với bản gốc. Tránh gửi `stock` khi user
        // không sửa — SP đang CHỜ HÀNG (pending_qty>0) có stock<pending sẽ bị
        // server chặn 409 nếu PATCH stock (web2-products.js:675).
        const orig = app().getProduct?.(code) || {};
        const next = {
            name,
            price: valNum('price'),
            originalPrice: valNum('originalPrice'),
            stock: Number(val('stock')) || 0,
            note: (val('note') || '').trim() || null,
            isActive: val('isActive') === 'true',
        };
        const origNorm = {
            name: orig.name || '',
            price: Number(orig.price) || 0,
            originalPrice: Number(orig.originalPrice) || 0,
            stock: Number(orig.stock) || 0,
            note: (orig.note || '').trim() || null,
            isActive: !!orig.isActive,
        };
        const changed = {};
        for (const k of Object.keys(next)) {
            if (next[k] !== origNorm[k]) changed[k] = next[k];
        }
        if (!Object.keys(changed).length) {
            notify('Không có thay đổi nào', 'info');
            return;
        }
        const u = window.Web2UserInfo?.get?.('products-detail') || {};
        const payload = {
            ...changed,
            // Khi PATCH stock (absolute set) → kèm expectedStock = tồn bản gốc để
            // backend bắt stale-stock 409 (write đồng thời), tránh lost-update.
            ...(changed.stock !== undefined ? { expectedStock: origNorm.stock } : {}),
            userId: u.userId || null,
            userName: u.userName || null,
            sourcePage: 'products-detail',
        };

        const headEl = () => _els?.drawer?.querySelector('.w2pd-head-name');
        const prevName = orig.name || '';

        // Áp dụng thành công lên drawer + invalidate cache tab (gọi khi UPDATE ok).
        const _applySaved = () => {
            // Chống stale callback: user mở SP KHÁC trong lúc await → KHÔNG đè drawer mới.
            if (_currentCode !== code) return;
            const head = headEl();
            if (head) head.textContent = name;
            _loaded.overview = false;
            _loaded.history = false;
        };

        // UI-first (convention): cập nhật header tên NGAY, PATCH background, rollback
        // header nếu lỗi. expectedStock 409 / validation strict → rollback + toast lỗi.
        if (window.Web2Optimistic?.run) {
            const head0 = headEl();
            Web2Optimistic.run({
                snapshot: () => prevName,
                apply: () => {
                    if (_currentCode === code && head0) head0.textContent = name;
                },
                run: async () => {
                    const resp = await api().update?.(code, payload);
                    if (resp && resp.success === false)
                        throw new Error(resp.error || 'Update thất bại');
                    return resp;
                },
                onSuccess: () => _applySaved(),
                rollback: (prev) => {
                    if (_currentCode === code) {
                        const h = headEl();
                        if (h) h.textContent = prev || '';
                    }
                },
                successMsg: 'Đã lưu thay đổi',
                errLabel: `lưu SP ${code}`,
            });
            return;
        }

        // Legacy await path (helper chưa sẵn) — giữ loading state.
        const btn = pane.querySelector('[data-act="save"]');
        const origBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="loader"></i>Đang lưu...`;
            icons();
        }
        try {
            const resp = await api().update?.(code, payload);
            if (resp && resp.success === false) throw new Error(resp.error || 'Update thất bại');
            notify('Đã lưu thay đổi', 'success');
            _applySaved();
        } catch (e) {
            notify('Lỗi lưu: ' + (e.message || e), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origBtnHtml;
                icons();
            }
        }
    }

    // ── badge số trên tab ────────────────────────────────────────────
    function _setBadge(tabId, n) {
        const b = _els?.drawer.querySelector(`.w2pd-tab-badge[data-badge="${tabId}"]`);
        if (!b) return;
        if (n > 0) {
            b.textContent = String(n);
            b.hidden = false;
        } else {
            b.hidden = true;
        }
    }

    // ── delegated row click (self-wire) ──────────────────────────────
    function _wireRowClick() {
        const tbody = document.getElementById('productsTbody');
        if (!tbody || tbody.dataset.w2pdWired) return;
        tbody.dataset.w2pdWired = '1';
        tbody.addEventListener('click', (e) => {
            // bỏ qua khi bấm vào phần tử tương tác (nút thao tác, checkbox, badge…)
            if (
                e.target.closest(
                    'button, a, input, label, select, .code-badge, .usage-badge, .row-actions'
                )
            )
                return;
            const tr = e.target.closest('tr[data-code]');
            if (!tr) return;
            open(tr.dataset.code);
        });
    }

    // tbody (#productsTbody) là phần tử cố định — renderRows() chỉ thay innerHTML
    // (children), KHÔNG thay chính tbody. Listener delegated trên tbody sống mãi
    // → wire 1 lần. Retry vài nhịp phòng app init() chạy sau script này.
    function _ensureWired(tries) {
        _wireRowClick();
        const tb = document.getElementById('productsTbody');
        if ((!tb || !tb.dataset.w2pdWired) && tries > 0) {
            setTimeout(() => _ensureWired(tries - 1), 300);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => _ensureWired(10));
    } else {
        _ensureWired(10);
    }

    window.Web2ProductDetail = { open, close };
})();
