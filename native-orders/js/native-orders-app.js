// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Native Orders — main app logic.
 * Render bảng + filter + pagination + edit modal + delete.
 * UI style được match với orders-report (tabs + gradient pills + table đẹp).
 */

(function () {
    'use strict';

    const STATE = {
        orders: [],
        total: 0,
        page: 1,
        limit: 200,
        status: 'all',
        search: '',
        editingCode: null,
        loading: false,
        filterVisible: true,
        expandedOrders: new Set(), // codes of rows currently expanded
    };

    // ---------- DOM ----------
    const $ = (sel) => document.querySelector(sel);
    const tbody = () => $('#ordersTbody');
    const counter = () => $('#totalCounter');
    const searchCount = () => $('#searchResultCount');
    const pag = () => $('#pagination');
    const modal = () => $('#editModal');
    const modalBody = () => $('#editModalBody');
    const modalTitle = () => $('#editModalTitle');
    const controlBar = () => $('#controlBar');
    const toggleLabel = () => $('#toggleControlBarLabel');

    // ---------- Helpers ----------
    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    function formatTimeSplit(ms) {
        if (!ms) return { date: '', hour: '' };
        const d = new Date(Number(ms));
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return { date: `${day}/${month}`, hour: `${hour}:${min}` };
    }
    function formatFullTime(ms) {
        if (!ms) return '';
        return new Date(Number(ms)).toLocaleString('vi-VN');
    }

    const STATUS_META = {
        draft: { label: 'Nháp', icon: 'file' },
        confirmed: { label: 'Đã xác nhận', icon: 'check' },
        cancelled: { label: 'Đã hủy', icon: 'x' },
        delivered: { label: 'Đã giao', icon: 'truck' },
    };
    function statusBadge(status) {
        const meta = STATUS_META[status] || { label: status || '—', icon: 'help-circle' };
        return `<span class="status-badge status-${status || 'draft'}">
            <i data-lucide="${meta.icon}"></i>${meta.label}
        </span>`;
    }

    // Gradient color for avatar placeholder (consistent per name)
    function avatarColor(name) {
        const colors = [
            '#6366f1',
            '#8b5cf6',
            '#ec4899',
            '#ef4444',
            '#f59e0b',
            '#10b981',
            '#3b82f6',
            '#06b6d4',
            '#a855f7',
        ];
        const s = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return colors[s % colors.length];
    }
    function firstChar(name) {
        return ((name || '?').trim().charAt(0) || '?').toUpperCase();
    }

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    // Render avatar: FB proxy image overlaid on colored initial; on error the
    // img element removes itself so the initial stays visible underneath.
    function renderAvatar(o) {
        const color = avatarColor(o.customerName);
        const char = firstChar(o.customerName);
        if (!o.fbUserId) {
            return `<div class="cust-avatar" style="background:${color};">${char}</div>`;
        }
        // CF Worker /api/fb-avatar expects ?id= + &page= (not &page_id=).
        // Same signature as tpos-pancake (SharedUtils.getAvatarUrl) + orders-report (tab1-table.js).
        const url = `${WORKER_URL}/api/fb-avatar?id=${encodeURIComponent(o.fbUserId)}${o.fbPageId ? '&page=' + encodeURIComponent(o.fbPageId) : ''}`;
        return `
            <div class="cust-avatar" style="background:${color};">
                <span class="cust-avatar-initial">${char}</span>
                <img class="cust-avatar-img" src="${url}" alt="" loading="lazy"
                     onload="this.classList.add('loaded')"
                     onerror="this.remove()">
            </div>`;
    }

    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[${type}]`, msg);
    }

    // ---------- Render ----------
    function _renderExpandRow(o) {
        const lines = Array.isArray(o.products) ? o.products : [];
        if (!lines.length) {
            return `
                <tr class="expand-row" data-for="${escapeHtml(o.code)}">
                    <td colspan="13">
                        <div class="expand-empty">
                            <i data-lucide="package-x"></i>
                            Đơn chưa có sản phẩm —
                            <a href="#" onclick="event.preventDefault();event.stopPropagation();NativeOrdersApp.openEdit('${escapeHtml(o.code)}')">Bấm Sửa để thêm →</a>
                        </div>
                    </td>
                </tr>`;
        }
        const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
        const totalAmt = lines.reduce(
            (s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0),
            0
        );
        const rows = lines
            .map((l, i) => {
                const qty = Number(l.quantity) || 0;
                const price = Number(l.price) || 0;
                const amount = qty * price;
                const img = l.imageUrl
                    ? `<img src="${escapeHtml(l.imageUrl)}" class="expand-img" onerror="this.style.display='none';this.nextElementSibling.style.setProperty('display','inline-flex');">
                   <span class="expand-img-ph" style="display:none;"><i data-lucide="image"></i></span>`
                    : `<span class="expand-img-ph"><i data-lucide="image"></i></span>`;
                return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${img}</td>
                    <td>
                        <div class="expand-name">${escapeHtml(l.name || '—')}</div>
                        <div class="expand-code">${escapeHtml(l.productCode || '')}</div>
                    </td>
                    <td class="expand-qty">${qty}</td>
                    <td class="expand-price">${price.toLocaleString('vi-VN')}đ</td>
                    <td class="expand-amount">${amount.toLocaleString('vi-VN')}đ</td>
                </tr>`;
            })
            .join('');
        return `
            <tr class="expand-row" data-for="${escapeHtml(o.code)}">
                <td colspan="13">
                    <div class="expand-wrap">
                        <div class="expand-header">
                            <span class="expand-title"><i data-lucide="package"></i>Sản phẩm trong đơn ${escapeHtml(o.code)}</span>
                            <span class="expand-totals">${totalQty} SP · ${totalAmt.toLocaleString('vi-VN')}đ</span>
                        </div>
                        <table class="expand-table">
                            <thead>
                                <tr>
                                    <th style="width:40px;">#</th>
                                    <th style="width:56px;">ẢNH</th>
                                    <th>SẢN PHẨM</th>
                                    <th style="width:60px;">SL</th>
                                    <th style="width:120px;">ĐƠN GIÁ</th>
                                    <th style="width:130px;">THÀNH TIỀN</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </td>
            </tr>`;
    }

    // TPOS renders status as a Bootstrap pill (.label.label-primary), NOT plain text.
    // Default = label-primary blue; cancelled = label-danger red; delivered = label-success.
    function tposStatusText(s) {
        const map = {
            draft:     { label: 'Nháp',     cls: 'tpos-label-primary' },
            confirmed: { label: 'Đơn hàng', cls: 'tpos-label-info' },
            cancelled: { label: 'Huỷ bỏ',   cls: 'tpos-label-danger' },
            delivered: { label: 'Đã giao',  cls: 'tpos-label-success' },
        };
        const m = map[s] || { label: s || '—', cls: 'tpos-label-default' };
        return `<span class="tpos-label ${m.cls}">${m.label}</span>`;
    }

    // VN phone carrier prefix → label
    const CARRIER_PREFIXES = {
        Viettel: /^(086|096|097|098|032|033|034|035|036|037|038|039)/,
        Mobifone: /^(089|090|093|070|079|077|076|078)/,
        Vinaphone: /^(088|091|094|083|084|085|081|082)/,
        Vietnamobile: /^(092|056|058)/,
        Gmobile: /^(099|059)/,
    };
    function detectCarrier(phone) {
        if (!phone) return '';
        const p = String(phone).replace(/\D/g, '');
        for (const [name, re] of Object.entries(CARRIER_PREFIXES)) {
            if (re.test(p)) return name;
        }
        return '';
    }

    function renderRows() {
        const orders = STATE.orders;
        if (!orders.length) {
            tbody().innerHTML = `<tr><td colspan="13" class="empty-row">
                Không có đơn nào khớp bộ lọc
            </td></tr>`;
            return;
        }
        tbody().innerHTML = orders
            .map((o) => {
                const time = formatTimeSplit(o.createdAt);
                const isExpanded = STATE.expandedOrders.has(o.code);
                const carrier = detectCarrier(o.phone);
                const status = (o.partnerStatus || '').trim();
                const statusPill =
                    status === 'Bom hàng'
                        ? `<span class="tpos-label tpos-label-danger m-l-xs">Bom hàng</span>`
                        : status === 'Cảnh báo'
                          ? `<span class="tpos-label tpos-label-warning m-l-xs">Cảnh báo</span>`
                          : status === 'Nguy hiểm'
                            ? `<span class="tpos-label tpos-label-danger m-l-xs">Nguy hiểm</span>`
                            : `<span class="tpos-label tpos-label-success m-l-xs">Bình thường</span>`;
                const tagBadges = (o.tags || [])
                    .map((t) => {
                        const txt = typeof t === 'string' ? t : t.name || t.label || '';
                        if (!txt) return '';
                        const upper = txt.toUpperCase();
                        let cls = 'tpos-label-default';
                        if (/CỌC|COC/.test(upper)) cls = 'tpos-label-coc';
                        else if (/BOOM/.test(upper)) cls = 'tpos-label-boom';
                        else if (/GIỎ|GIO/.test(upper)) cls = 'tpos-label-warning';
                        return `<span class="tpos-label ${cls}">${escapeHtml(txt)}</span>`;
                    })
                    .join('');
                const total = Number(o.totalAmount || 0).toLocaleString('vi-VN');
                const qty = Number(o.totalQuantity || 0);
                const campaignName = o.liveCampaignName || '';

                const mainRow = `
                <tr class="order-row ${isExpanded ? 'is-expanded' : ''}" data-code="${escapeHtml(o.code)}"
                    onclick="NativeOrdersApp.toggleExpand('${escapeHtml(o.code)}')" style="cursor:pointer;">
                    <td onclick="event.stopPropagation();"><input type="checkbox" class="row-check" value="${escapeHtml(o.code)}"></td>
                    <td onclick="event.stopPropagation();">
                        <div class="tpos-row-actions">
                            <button class="tpos-btn tpos-btn-primary tpos-btn-xs" title="Sửa"
                                onclick="event.stopPropagation();NativeOrdersApp.openEdit('${escapeHtml(o.code)}')">
                                <i data-lucide="pencil" style="width:12px;height:12px;"></i>
                            </button>
                            <button class="tpos-btn tpos-btn-danger tpos-btn-xs" title="Xóa"
                                onclick="event.stopPropagation();NativeOrdersApp.removeOrder('${escapeHtml(o.code)}')">
                                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                            </button>
                        </div>
                    </td>
                    <td class="tpos-cell-center">${o.sessionIndex ?? ''}</td>
                    <td class="tpos-cell-center">
                        <div class="tpos-code-cell" style="align-items:center;">
                            <span class="tpos-code-main" onclick="event.stopPropagation();NativeOrdersApp.copyCode('${escapeHtml(o.code)}')">${escapeHtml(o.code)}</span>
                            ${campaignName ? `<span class="tpos-code-sub">${escapeHtml(campaignName)}</span>` : ''}
                            ${tagBadges ? `<div class="tpos-code-tags">${tagBadges}</div>` : `<div class="tpos-code-tags"><button class="tpos-tag-trigger" onclick="event.stopPropagation();NativeOrdersApp.openEdit('${escapeHtml(o.code)}')"><i data-lucide="tag" style="width:11px;height:11px;"></i></button></div>`}
                        </div>
                    </td>
                    <td>
                        <div class="tpos-channel-cell">
                            <span class="tpos-channel-name">${escapeHtml(o.fbUserName || '—')}</span>
                            ${o.fbCommentId ? `<span class="tpos-channel-link">Bình luận</span>` : ''}
                        </div>
                    </td>
                    <td>
                        <div class="tpos-customer-cell">
                            <span class="tpos-customer-name">${escapeHtml(o.customerName || '—')}</span>
                            <div class="tpos-customer-row2">
                                ${o.phone ? `<span class="tpos-mini-icon tpos-mini-phone" title="${escapeHtml(o.phone)}"><i data-lucide="phone" style="width:9px;height:9px;"></i></span>` : ''}
                                <span class="tpos-mini-icon tpos-mini-person" title="Khách"><i data-lucide="user" style="width:9px;height:9px;"></i></span>
                                ${statusPill}
                            </div>
                        </div>
                    </td>
                    <td class="tpos-cell-center" onclick="event.stopPropagation();">
                        ${
                            o.phone
                                ? `
                          <div class="tpos-phone-cell" style="align-items:center;">
                            <a href="tel:${escapeHtml(o.phone)}" class="tpos-phone-link">${escapeHtml(o.phone)}</a>
                            ${carrier ? `<span class="tpos-label tpos-label-primary">${carrier}</span>` : ''}
                          </div>
                        `
                                : '—'
                        }
                    </td>
                    <td>${escapeHtml(o.address || '')}</td>
                    <td class="tpos-cell-money">${total}</td>
                    <td class="tpos-cell-center">${qty || ''}</td>
                    <td class="tpos-cell-center">${tposStatusText(o.status)}</td>
                    <td>${escapeHtml(o.assignedEmployeeName || o.createdByName || '—')}</td>
                    <td class="tpos-date-cell center" title="${escapeHtml(formatFullTime(o.createdAt))}">
                        ${time.date}/${new Date(Number(o.createdAt)).getFullYear()}<br>${time.hour}
                    </td>
                </tr>`;
                return isExpanded ? mainRow + _renderExpandRow(o) : mainRow;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    function toggleExpand(code) {
        // Surgical DOM update — don't re-render the whole tbody (that would
        // destroy avatar <img> elements and cause a visible flicker while
        // they reload from cache). Only touch the one row + its expand sibling.
        const tb = tbody();
        const mainRow = tb?.querySelector(`tr.order-row[data-code="${CSS.escape(code)}"]`);
        if (!mainRow) return;

        const isExpanded = STATE.expandedOrders.has(code);
        const caret = mainRow.querySelector('.expand-caret');

        const swapCaret = (name) => {
            if (!caret) return;
            const next = document.createElement('i');
            next.setAttribute('data-lucide', name);
            next.className = 'expand-caret';
            caret.replaceWith(next);
        };

        if (isExpanded) {
            STATE.expandedOrders.delete(code);
            mainRow.classList.remove('is-expanded');
            swapCaret('chevron-right');
            tb.querySelector(`tr.expand-row[data-for="${CSS.escape(code)}"]`)?.remove();
        } else {
            STATE.expandedOrders.add(code);
            mainRow.classList.add('is-expanded');
            swapCaret('chevron-down');
            const order = STATE.orders.find((x) => x.code === code);
            if (order) mainRow.insertAdjacentHTML('afterend', _renderExpandRow(order));
        }
        // Convert the newly inserted <i data-lucide> nodes only — existing
        // SVGs (avatars, status icons, etc.) in other rows stay untouched.
        if (window.lucide) lucide.createIcons();
    }

    function renderPagination() {
        const totalPages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        const cur = STATE.page;
        const html = [];
        html.push(
            `<button class="page-btn" ${cur === 1 ? 'disabled' : ''} onclick="NativeOrdersApp.goPage(${cur - 1})">‹</button>`
        );
        const start = Math.max(1, cur - 2);
        const end = Math.min(totalPages, start + 4);
        if (start > 1) {
            html.push(`<button class="page-btn" onclick="NativeOrdersApp.goPage(1)">1</button>`);
            if (start > 2) html.push(`<span class="page-info">…</span>`);
        }
        for (let p = start; p <= end; p++) {
            html.push(
                `<button class="page-btn ${p === cur ? 'active' : ''}" onclick="NativeOrdersApp.goPage(${p})">${p}</button>`
            );
        }
        if (end < totalPages) {
            if (end < totalPages - 1) html.push(`<span class="page-info">…</span>`);
            html.push(
                `<button class="page-btn" onclick="NativeOrdersApp.goPage(${totalPages})">${totalPages}</button>`
            );
        }
        html.push(
            `<button class="page-btn" ${cur >= totalPages ? 'disabled' : ''} onclick="NativeOrdersApp.goPage(${cur + 1})">›</button>`
        );
        html.push(
            `<span class="page-info">${STATE.total.toLocaleString('vi-VN')} đơn — trang ${cur}/${totalPages}</span>`
        );
        pag().innerHTML = html.join('');
    }

    function renderCounters() {
        const totalStr = STATE.total.toLocaleString('vi-VN');
        counter().textContent = `${totalStr} đơn`;
        searchCount().textContent = totalStr;
    }

    // ---------- Data load ----------
    async function load() {
        if (STATE.loading) return;
        STATE.loading = true;
        tbody().innerHTML = `<tr><td colspan="11" class="loading-row">
            <div class="spinner"></div>Đang tải dữ liệu...
        </td></tr>`;
        try {
            const resp = await window.NativeOrdersApi.list({
                status: STATE.status,
                search: STATE.search || undefined,
                page: STATE.page,
                limit: STATE.limit,
            });
            STATE.orders = resp.orders || [];
            STATE.total = resp.total || 0;
            renderRows();
            renderPagination();
            renderCounters();
        } catch (e) {
            console.error(e);
            tbody().innerHTML = `<tr><td colspan="11" class="empty-row" style="color:#ef4444;">
                Lỗi tải dữ liệu: ${escapeHtml(e.message)}
            </td></tr>`;
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        } finally {
            STATE.loading = false;
        }
    }

    // ---------- Filter handlers ----------
    function applyFilters() {
        STATE.search = $('#filterSearch').value.trim();
        STATE.status = $('#filterStatus').value;
        STATE.limit = parseInt($('#filterLimit').value, 10) || 200;
        STATE.page = 1;
        load();
    }
    function clearFilters() {
        $('#filterSearch').value = '';
        $('#filterStatus').value = 'all';
        $('#filterLimit').value = '200';
        STATE.search = '';
        STATE.status = 'all';
        STATE.limit = 200;
        STATE.page = 1;
        load();
    }

    function toggleFilter() {
        STATE.filterVisible = !STATE.filterVisible;
        const bar = controlBar();
        const label = toggleLabel();
        if (STATE.filterVisible) {
            bar?.classList.remove('hidden');
            if (label) label.textContent = 'Ẩn bộ lọc';
        } else {
            bar?.classList.add('hidden');
            if (label) label.textContent = 'Hiển thị bộ lọc';
        }
    }

    // ---------- Modal (edit) ----------
    // Working copy of current order's lines while modal is open.
    let EDIT_LINES = [];

    function openEdit(code) {
        const o = STATE.orders.find((x) => x.code === code);
        if (!o) return;
        STATE.editingCode = code;
        EDIT_LINES = Array.isArray(o.products) ? o.products.map((p) => ({ ...p })) : [];

        modalTitle().innerHTML = `<i data-lucide="pencil"></i><span>Chỉnh sửa đơn ${escapeHtml(code)}</span>`;
        modalBody().innerHTML = `
            <div class="field-row-grid">
                <div class="field-row">
                    <label>Tên khách</label>
                    <input id="editCustomerName" value="${escapeHtml(o.customerName || '')}" placeholder="Tên khách hàng">
                </div>
                <div class="field-row">
                    <label>Số điện thoại</label>
                    <input id="editPhone" value="${escapeHtml(o.phone || '')}" placeholder="0901234567">
                </div>
            </div>
            <div class="field-row">
                <label>Địa chỉ</label>
                <input id="editAddress" value="${escapeHtml(o.address || '')}" placeholder="Địa chỉ giao hàng">
            </div>
            <div class="field-row">
                <label>Ghi chú</label>
                <textarea id="editNote" placeholder="Nội dung comment / ghi chú">${escapeHtml(o.note || '')}</textarea>
            </div>
            <div class="field-row">
                <label>Trạng thái</label>
                <select id="editStatus">
                    ${['draft', 'confirmed', 'cancelled', 'delivered']
                        .map(
                            (s) =>
                                `<option value="${s}" ${s === o.status ? 'selected' : ''}>${STATUS_META[s].label}</option>`
                        )
                        .join('')}
                </select>
            </div>

            <!-- ========== PRODUCTS SECTION ========== -->
            <div class="products-section">
                <div class="products-header">
                    <span class="products-title">
                        <i data-lucide="package"></i>
                        Sản phẩm trong đơn
                    </span>
                    <span class="products-totals" id="editProductsTotals">—</span>
                </div>

                <div class="product-picker">
                    <div class="search-wrapper" style="flex:1;max-width:100%;">
                        <i data-lucide="search" class="search-icon"></i>
                        <input type="text" id="productPickerInput" class="search-input"
                               placeholder="Tìm theo mã SP hoặc tên… (gõ ≥ 2 ký tự)"
                               autocomplete="off">
                    </div>
                    <a class="btn-ghost" href="../web2-products/index.html" target="_blank" rel="noopener"
                       title="Mở kho để thêm SP mới">
                        <i data-lucide="external-link"></i> Kho SP
                    </a>
                </div>
                <div class="product-picker-results" id="productPickerResults" style="display:none;"></div>

                <div class="order-lines-wrapper">
                    <table class="order-lines-table">
                        <thead>
                            <tr>
                                <th style="width:48px;">#</th>
                                <th style="width:56px;">ẢNH</th>
                                <th>SẢN PHẨM</th>
                                <th style="width:120px;">SL</th>
                                <th style="width:120px;">ĐƠN GIÁ</th>
                                <th style="width:130px;">THÀNH TIỀN</th>
                                <th style="width:56px;"></th>
                            </tr>
                        </thead>
                        <tbody id="orderLinesTbody"></tbody>
                    </table>
                </div>
            </div>

            <details class="fb-context">
                <summary>Facebook context (read-only) — trace về comment nguồn</summary>
                <div class="fb-context-body">
                    fbUserId: ${escapeHtml(o.fbUserId || '—')}<br>
                    fbPageId: ${escapeHtml(o.fbPageId || '—')}<br>
                    fbPostId: ${escapeHtml(o.fbPostId || '—')}<br>
                    fbCommentId: ${escapeHtml(o.fbCommentId || '—')}<br>
                    crmTeamId: ${escapeHtml(o.crmTeamId || '—')}<br>
                    sessionIndex: ${escapeHtml(o.sessionIndex || '—')}<br>
                    source: ${escapeHtml(o.source || 'NATIVE_WEB')}
                </div>
            </details>
        `;

        // Wire picker + lines
        renderOrderLines();

        // Load product cache in background (so typing is instant)
        EDIT_PRODUCTS_CACHE = null;
        loadEditProductsCache();

        const pickerInput = $('#productPickerInput');
        pickerInput?.addEventListener('input', (e) => {
            searchPickerProducts(e.target.value.trim());
        });
        // Show first 20 on focus (empty query) so user can browse without typing
        pickerInput?.addEventListener('focus', () => {
            searchPickerProducts(pickerInput.value.trim());
        });
        document.addEventListener('click', _pickerOutsideClick);

        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
    function closeEdit() {
        STATE.editingCode = null;
        EDIT_LINES = [];
        document.removeEventListener('click', _pickerOutsideClick);
        modal().classList.remove('active');
    }

    // ---------- Product picker helpers ----------
    // All active products cached once per modal open — search is client-side
    // so Vietnamese diacritics don't matter ("ao nau" matches "ÁO NÂU M").
    let EDIT_PRODUCTS_CACHE = null;

    function _pickerOutsideClick(e) {
        const picker = $('#productPickerResults');
        if (!picker) return;
        if (!e.target.closest('.product-picker') && !e.target.closest('#productPickerResults')) {
            picker.style.display = 'none';
        }
    }

    // Strip Vietnamese diacritics + đ/Đ → lowercased plain ASCII
    function stripVi(s) {
        return (s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();
    }

    async function loadEditProductsCache() {
        try {
            const resp = await window.NativeOrdersApi.searchProducts({ search: '', limit: 1000 });
            EDIT_PRODUCTS_CACHE = resp.products || [];
        } catch (e) {
            console.warn('[picker] loadEditProductsCache failed:', e.message);
            EDIT_PRODUCTS_CACHE = [];
        }
    }

    function _renderPickItem(p) {
        const existing = EDIT_LINES.find((l) => l.productCode === p.code);
        const qtyBadge = existing
            ? `<span class="pick-qty-badge"><i data-lucide="shopping-cart"></i>SL: ${existing.quantity}</span>`
            : '';
        const img = p.imageUrl
            ? `<img src="${escapeHtml(p.imageUrl)}" class="pick-img" onerror="this.style.display='none';this.nextElementSibling.style.setProperty('display','inline-flex');">
               <span class="pick-img-ph" style="display:none;"><i data-lucide="image"></i></span>`
            : `<span class="pick-img-ph"><i data-lucide="image"></i></span>`;
        return `
            <div class="pick-item ${existing ? 'in-order' : ''}" data-code="${escapeHtml(p.code)}">
                ${qtyBadge}
                ${img}
                <div class="pick-info">
                    <div class="pick-name">${escapeHtml(p.name)}</div>
                    <div class="pick-code">Mã: ${escapeHtml(p.code)}</div>
                </div>
                <div class="pick-price">${(p.price || 0).toLocaleString('vi-VN')}đ</div>
                <button class="pick-add-btn" onclick="NativeOrdersApp.addLineFromPicker('${escapeHtml(p.code)}')"><i data-lucide="plus"></i></button>
            </div>`;
    }

    function searchPickerProducts(q) {
        const box = $('#productPickerResults');
        if (!box) return;

        // Cache still loading
        if (EDIT_PRODUCTS_CACHE === null) {
            box.innerHTML = `<div class="picker-loading"><div class="spinner"></div>Đang tải kho SP...</div>`;
            box.style.display = 'block';
            return;
        }
        if (!EDIT_PRODUCTS_CACHE.length) {
            box.innerHTML = `<div class="picker-empty">Kho SP trống — <a href="../web2-products/index.html" target="_blank">mở kho tạo SP</a></div>`;
            box.style.display = 'block';
            return;
        }

        const qn = stripVi(q);
        const filtered = qn
            ? EDIT_PRODUCTS_CACHE.filter(
                  (p) => stripVi(p.code).includes(qn) || stripVi(p.name).includes(qn)
              )
            : EDIT_PRODUCTS_CACHE;
        const items = filtered.slice(0, 20);

        if (!items.length) {
            box.innerHTML = `<div class="picker-empty">Không tìm thấy SP khớp "${escapeHtml(q)}". <a href="../web2-products/index.html" target="_blank">Mở kho →</a></div>`;
            box.style.display = 'block';
            return;
        }
        box.innerHTML = items.map(_renderPickItem).join('');
        box.style.display = 'block';
        if (window.lucide) lucide.createIcons();
    }

    function addLineFromPicker(code) {
        const box = $('#productPickerResults');
        const item = box?.querySelector(`.pick-item[data-code="${CSS.escape(code)}"]`);
        if (!item) return;
        // Reconstruct minimal product from DOM
        const name = item.querySelector('.pick-name')?.textContent.trim();
        const priceText = item.querySelector('.pick-price')?.textContent || '0';
        const price = Number(priceText.replace(/[^\d]/g, '')) || 0;
        const imgEl = item.querySelector('.pick-img');
        const imageUrl = imgEl?.getAttribute('src') || null;

        const existing = EDIT_LINES.find((l) => l.productCode === code);
        if (existing) {
            existing.quantity = (Number(existing.quantity) || 0) + 1;
            existing.total = existing.quantity * existing.price;
        } else {
            EDIT_LINES.push({
                productCode: code,
                name,
                price,
                quantity: 1,
                imageUrl,
                note: '',
                total: price,
                addedAt: Date.now(),
            });
        }
        renderOrderLines();

        // Update badge on the picked item
        const badge = item.querySelector('.pick-qty-badge');
        const newQty = EDIT_LINES.find((l) => l.productCode === code).quantity;
        if (badge) {
            badge.innerHTML = `<i data-lucide="shopping-cart"></i>SL: ${newQty}`;
        } else {
            item.classList.add('in-order');
            item.insertAdjacentHTML(
                'afterbegin',
                `<span class="pick-qty-badge"><i data-lucide="shopping-cart"></i>SL: ${newQty}</span>`
            );
        }
        if (window.lucide) lucide.createIcons();
    }

    function renderOrderLines() {
        const tb = $('#orderLinesTbody');
        const totals = $('#editProductsTotals');
        if (!tb) return;

        if (!EDIT_LINES.length) {
            tb.innerHTML = `<tr><td colspan="7" class="empty-lines">Chưa có sản phẩm — gõ mã/tên SP ở trên để tìm và thêm</td></tr>`;
            if (totals) totals.textContent = '0 SP · 0đ';
            return;
        }

        let totalQty = 0,
            totalAmount = 0;
        tb.innerHTML = EDIT_LINES.map((l, i) => {
            const qty = Number(l.quantity) || 0;
            const price = Number(l.price) || 0;
            const amount = qty * price;
            totalQty += qty;
            totalAmount += amount;
            const img = l.imageUrl
                ? `<img src="${escapeHtml(l.imageUrl)}" class="line-img" onerror="this.style.display='none';this.nextElementSibling.style.setProperty('display','inline-flex');">
                   <span class="line-img-ph" style="display:none;"><i data-lucide="image"></i></span>`
                : `<span class="line-img-ph"><i data-lucide="image"></i></span>`;
            return `
                <tr data-idx="${i}">
                    <td>${i + 1}</td>
                    <td>${img}</td>
                    <td>
                        <div class="line-name">${escapeHtml(l.name || '—')}</div>
                        <div class="line-code">${escapeHtml(l.productCode || '')}</div>
                    </td>
                    <td>
                        <div class="qty-ctl">
                            <button onclick="NativeOrdersApp.changeLineQty(${i}, -1)"><i data-lucide="minus"></i></button>
                            <input type="number" min="1" value="${qty}" onchange="NativeOrdersApp.setLineQty(${i}, this.value)">
                            <button onclick="NativeOrdersApp.changeLineQty(${i}, 1)"><i data-lucide="plus"></i></button>
                        </div>
                    </td>
                    <td class="line-price">${price.toLocaleString('vi-VN')}đ</td>
                    <td class="line-amount">${amount.toLocaleString('vi-VN')}đ</td>
                    <td>
                        <button class="btn-action act-delete" title="Xóa" onclick="NativeOrdersApp.removeLine(${i})"><i data-lucide="trash-2"></i></button>
                    </td>
                </tr>`;
        }).join('');

        if (totals) {
            totals.textContent = `${totalQty} SP · ${totalAmount.toLocaleString('vi-VN')}đ`;
        }
        if (window.lucide) lucide.createIcons();
    }

    function changeLineQty(idx, delta) {
        const line = EDIT_LINES[idx];
        if (!line) return;
        const nextQty = Math.max(1, (Number(line.quantity) || 0) + delta);
        line.quantity = nextQty;
        line.total = nextQty * (Number(line.price) || 0);
        renderOrderLines();
    }

    function setLineQty(idx, val) {
        const line = EDIT_LINES[idx];
        if (!line) return;
        const q = Math.max(1, parseInt(val, 10) || 1);
        line.quantity = q;
        line.total = q * (Number(line.price) || 0);
        renderOrderLines();
    }

    function removeLine(idx) {
        EDIT_LINES.splice(idx, 1);
        renderOrderLines();
    }

    async function saveEdit() {
        if (!STATE.editingCode) return;
        const fields = {
            customerName: $('#editCustomerName').value.trim(),
            phone: $('#editPhone').value.trim(),
            address: $('#editAddress').value.trim(),
            note: $('#editNote').value.trim(),
            status: $('#editStatus').value,
            // Send current working copy — backend recomputes totalQuantity/totalAmount.
            products: EDIT_LINES.map((l) => ({
                productCode: l.productCode,
                name: l.name,
                price: Number(l.price) || 0,
                quantity: Number(l.quantity) || 0,
                imageUrl: l.imageUrl || null,
                note: l.note || null,
                total: (Number(l.price) || 0) * (Number(l.quantity) || 0),
                addedAt: l.addedAt || Date.now(),
            })),
        };
        try {
            const resp = await window.NativeOrdersApi.update(STATE.editingCode, fields);
            const idx = STATE.orders.findIndex((x) => x.code === STATE.editingCode);
            if (idx !== -1 && resp.order) STATE.orders[idx] = resp.order;
            renderRows();
            notify('Đã lưu', 'success');
            closeEdit();
        } catch (e) {
            notify('Lỗi lưu: ' + e.message, 'error');
        }
    }

    async function quickStatus(code, status) {
        try {
            const resp = await window.NativeOrdersApi.update(code, { status });
            const idx = STATE.orders.findIndex((x) => x.code === code);
            if (idx !== -1 && resp.order) STATE.orders[idx] = resp.order;
            renderRows();
            notify(`Đã chuyển "${STATUS_META[status]?.label || status}"`, 'success');
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function removeOrder(code) {
        if (!confirm(`Xóa đơn ${code}? Hành động không thể hoàn tác.`)) return;
        try {
            await window.NativeOrdersApi.remove(code);
            STATE.orders = STATE.orders.filter((x) => x.code !== code);
            STATE.total = Math.max(0, STATE.total - 1);
            renderRows();
            renderPagination();
            renderCounters();
            notify(`Đã xóa ${code}`, 'success');
        } catch (e) {
            notify('Lỗi xóa: ' + e.message, 'error');
        }
    }

    function copyCode(code) {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(code).then(() => notify(`Đã copy ${code}`, 'success'));
        }
    }

    function goPage(p) {
        const totalPages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        STATE.page = Math.min(Math.max(1, p), totalPages);
        load();
    }

    // ---------- Init ----------
    function init() {
        if (window.lucide) lucide.createIcons();

        $('#btnApplyFilter')?.addEventListener('click', applyFilters);
        $('#btnClearFilter')?.addEventListener('click', clearFilters);
        $('#btnRefresh')?.addEventListener('click', load);
        $('#filterSearch')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
        $('#filterSearchClear')?.addEventListener('click', () => {
            const el = $('#filterSearch');
            if (el) {
                el.value = '';
                STATE.search = '';
                STATE.page = 1;
                load();
            }
        });
        $('#filterStatus')?.addEventListener('change', applyFilters);
        $('#filterLimit')?.addEventListener('change', applyFilters);

        // Check-all
        $('#checkAll')?.addEventListener('change', (e) => {
            document.querySelectorAll('.row-check').forEach((c) => {
                c.checked = e.target.checked;
            });
        });

        // Modal — click overlay KHÔNG đóng modal (tránh mất data khi nhập dở).
        // Chỉ X / Hủy / ESC mới đóng.
        $('#btnCloseModal')?.addEventListener('click', closeEdit);
        $('#btnCancelEdit')?.addEventListener('click', closeEdit);
        $('#btnSaveEdit')?.addEventListener('click', saveEdit);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal()?.classList.contains('active')) closeEdit();
        });

        // First load
        load();
    }

    window.NativeOrdersApp = {
        openEdit,
        quickStatus,
        removeOrder,
        copyCode,
        goPage,
        toggleFilter,
        toggleExpand,
        // Product picker + line management (inline onclicks)
        addLineFromPicker,
        changeLineQty,
        setLineQty,
        removeLine,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
