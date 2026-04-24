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
    function renderRows() {
        const orders = STATE.orders;
        if (!orders.length) {
            tbody().innerHTML = `<tr><td colspan="11" class="empty-row">
                Không có đơn nào khớp bộ lọc
            </td></tr>`;
            return;
        }
        tbody().innerHTML = orders
            .map((o) => {
                const time = formatTimeSplit(o.createdAt);
                const fbShort = o.fbUserId
                    ? `${o.fbUserId.slice(0, 6)}…${o.fbUserId.slice(-4)}`
                    : '';
                return `
                <tr data-code="${escapeHtml(o.code)}">
                    <td class="col-check"><input type="checkbox" class="row-check" value="${escapeHtml(o.code)}"></td>
                    <td class="col-actions">
                        <div class="row-actions">
                            <button class="btn-action act-edit" title="Sửa" onclick="NativeOrdersApp.openEdit('${escapeHtml(o.code)}')">
                                <i data-lucide="pencil"></i>
                            </button>
                            <button class="btn-action act-confirm" title="Xác nhận" onclick="NativeOrdersApp.quickStatus('${escapeHtml(o.code)}','confirmed')">
                                <i data-lucide="check-circle"></i>
                            </button>
                            <button class="btn-action act-cancel" title="Hủy" onclick="NativeOrdersApp.quickStatus('${escapeHtml(o.code)}','cancelled')">
                                <i data-lucide="x-circle"></i>
                            </button>
                            <button class="btn-action act-delete" title="Xóa" onclick="NativeOrdersApp.removeOrder('${escapeHtml(o.code)}')">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </td>
                    <td>
                        <span class="code-badge" title="Click để copy" onclick="NativeOrdersApp.copyCode('${escapeHtml(o.code)}')">
                            <i data-lucide="package-open"></i>${escapeHtml(o.code)}
                        </span>
                    </td>
                    <td class="stt-cell">${o.sessionIndex ?? '—'}</td>
                    <td>
                        <div class="customer-cell">
                            ${renderAvatar(o)}
                            <div class="cust-info">
                                <div class="cust-name">${escapeHtml(o.customerName || '—')}</div>
                                ${o.fbUserId ? `<div class="cust-sub"><i data-lucide="facebook"></i>${fbShort}</div>` : ''}
                            </div>
                        </div>
                    </td>
                    <td class="phone-cell">${
                        o.phone
                            ? `<a href="tel:${escapeHtml(o.phone)}" title="Gọi">${escapeHtml(o.phone)}</a>`
                            : '—'
                    }</td>
                    <td><div class="address-cell" title="${escapeHtml(o.address || '')}">${escapeHtml(o.address || '—')}</div></td>
                    <td><div class="note-cell" title="${escapeHtml(o.note || '')}">${escapeHtml(o.note || '—')}</div></td>
                    <td>${statusBadge(o.status)}</td>
                    <td class="time-cell" title="${escapeHtml(formatFullTime(o.createdAt))}">
                        <span class="time-date">${time.date}</span>
                        <span class="time-hour"> ${time.hour}</span>
                    </td>
                    <td class="creator-cell" title="${escapeHtml(o.createdBy || '')}">${escapeHtml(o.createdByName || o.createdBy || '—')}</td>
                </tr>`;
            })
            .join('');
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
    let EDIT_SEARCH_DEBOUNCE;

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
        const pickerInput = $('#productPickerInput');
        pickerInput?.addEventListener('input', (e) => {
            clearTimeout(EDIT_SEARCH_DEBOUNCE);
            const q = e.target.value.trim();
            if (q.length < 2) {
                $('#productPickerResults').style.display = 'none';
                return;
            }
            EDIT_SEARCH_DEBOUNCE = setTimeout(() => searchPickerProducts(q), 300);
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
    function _pickerOutsideClick(e) {
        const picker = $('#productPickerResults');
        if (!picker) return;
        if (!e.target.closest('.product-picker') && !e.target.closest('#productPickerResults')) {
            picker.style.display = 'none';
        }
    }

    async function searchPickerProducts(q) {
        const box = $('#productPickerResults');
        if (!box) return;
        box.innerHTML = `<div class="picker-loading"><div class="spinner"></div>Đang tìm...</div>`;
        box.style.display = 'block';
        try {
            const resp = await window.NativeOrdersApi.searchProducts({ search: q, limit: 20 });
            const items = resp.products || [];
            if (!items.length) {
                box.innerHTML = `<div class="picker-empty">Không tìm thấy SP khớp "${escapeHtml(q)}". <a href="../web2-products/index.html" target="_blank">Mở kho →</a></div>`;
                return;
            }
            box.innerHTML = items
                .map((p) => {
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
                })
                .join('');
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            box.innerHTML = `<div class="picker-empty" style="color:#ef4444;">Lỗi: ${escapeHtml(e.message)}</div>`;
        }
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
