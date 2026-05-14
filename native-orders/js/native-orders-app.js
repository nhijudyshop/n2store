// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Native Orders — main app logic.
 * Render bảng + filter + pagination + edit modal + delete.
 * UI style được match với orders-report (tabs + gradient pills + table đẹp).
 */

(function () {
    'use strict';

    // Phase 16: column visibility config — declared BEFORE STATE so the
    // STATE.colVisibility initializer (which calls loadColVisibility()) can
    // read COL_DEFAULT without hitting TDZ.
    const COL_KEYS = [
        { key: 'actions', label: 'Thao tác' },
        { key: 'stt', label: 'STT (cột riêng)' },
        { key: 'code', label: 'Mã đơn' },
        { key: 'channel', label: 'Kênh' },
        { key: 'customer', label: 'Tên khách' },
        { key: 'phone', label: 'SĐT (cột riêng)' },
        { key: 'address', label: 'Địa chỉ' },
        { key: 'money', label: 'Tổng tiền' },
        { key: 'qty', label: 'SL (cột riêng)' },
        { key: 'status', label: 'Trạng thái' },
        { key: 'message', label: 'Tin nhắn' },
        { key: 'comment', label: 'Bình luận' },
        { key: 'note', label: 'Ghi chú' },
        { key: 'employee', label: 'Nhân viên' },
        { key: 'time', label: 'Ngày tạo' },
    ];
    const COL_DEFAULT = {
        actions: true,
        stt: false, // STT đã hợp nhất vào cột check
        code: false,
        channel: false,
        customer: true,
        phone: false, // merged into customer
        address: true,
        money: true,
        qty: false, // merged into money
        status: true,
        message: true,
        comment: true,
        note: true,
        employee: false,
        time: false,
        // Merge flags
        mergeNameSdt: true,
        mergeTotalQty: true,
    };

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
        // Campaign filter (multi-select). Empty array = "all"; explicit array of campaign IDs
        // = filter to those (use '__no_campaign__' for orders without a campaign).
        // On boot, restored from localStorage `tpos_selected_campaigns` (set by tpos-pancake).
        selectedCampaignIds: [],
        availableCampaigns: [], // [{id, name, count, lastOrderAt}]
        // Phase 14: scope list to a single Customer 360 record (parsed from URL).
        customerId: null,
        // Phase 16: per-column visibility + merge flags (persisted in localStorage).
        // Defaults per user request:
        //   show: actions, stt, customer (with merged phone), address, money (with merged qty)
        //   hide: code, channel, phone, qty, status, employee, time
        colVisibility: loadColVisibility(),
    };
    function loadColVisibility() {
        try {
            const raw = localStorage.getItem('nativeOrdersColVisibility_v3');
            if (raw) {
                const parsed = JSON.parse(raw);
                return { ...COL_DEFAULT, ...parsed };
            }
        } catch {
            /* fallthrough to default */
        }
        return { ...COL_DEFAULT };
    }
    function saveColVisibility() {
        try {
            localStorage.setItem(
                'nativeOrdersColVisibility_v3',
                JSON.stringify(STATE.colVisibility)
            );
        } catch {
            /* ignore quota */
        }
    }
    function applyColumnVisibility() {
        // Inject (or replace) a <style> block that hides th/td matching hidden cols.
        let styleEl = document.getElementById('nativeOrdersColStyle');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'nativeOrdersColStyle';
            document.head.appendChild(styleEl);
        }
        const hidden = COL_KEYS.filter((c) => !STATE.colVisibility[c.key]).map(
            (c) => `.col-${c.key}`
        );
        styleEl.textContent = hidden.length
            ? `${hidden.join(', ')} { display: none !important; }`
            : '';
    }
    function renderColumnTogglePanel() {
        const panel = document.getElementById('columnTogglePanel');
        if (!panel) return;
        const colList = COL_KEYS.map(
            (c) => `
            <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">
                <input type="checkbox" data-col="${c.key}" ${STATE.colVisibility[c.key] ? 'checked' : ''}>
                <span>${escapeHtml(c.label)}</span>
            </label>`
        ).join('');
        panel.innerHTML = `
            <div style="font-weight:700;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Cột</div>
            ${colList}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0;">
            <div style="font-weight:700;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Gộp cột</div>
            <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">
                <input type="checkbox" data-merge="mergeNameSdt" ${STATE.colVisibility.mergeNameSdt ? 'checked' : ''}>
                <span>Hiện SĐT trong cột Tên khách</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">
                <input type="checkbox" data-merge="mergeTotalQty" ${STATE.colVisibility.mergeTotalQty ? 'checked' : ''}>
                <span>Hiện SL trong cột Tổng tiền</span>
            </label>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0;">
            <button type="button" id="colResetDefaults" style="font-size:11px;background:transparent;border:1px solid #e5e7eb;color:#475569;padding:4px 10px;border-radius:6px;cursor:pointer;">Khôi phục mặc định</button>`;

        // Wire checkboxes
        panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const colKey = cb.dataset.col;
                const mergeKey = cb.dataset.merge;
                if (colKey) STATE.colVisibility[colKey] = cb.checked;
                if (mergeKey) STATE.colVisibility[mergeKey] = cb.checked;
                saveColVisibility();
                applyColumnVisibility();
                if (mergeKey) renderRows(); // merge requires re-render to inject phone/qty
            });
        });
        panel.querySelector('#colResetDefaults')?.addEventListener('click', () => {
            STATE.colVisibility = { ...COL_DEFAULT };
            saveColVisibility();
            applyColumnVisibility();
            renderRows();
            renderColumnTogglePanel(); // re-render the panel itself
        });
    }
    function toggleColumnPanel() {
        const panel = document.getElementById('columnTogglePanel');
        if (!panel) return;
        const visible = panel.style.display !== 'none';
        if (visible) {
            panel.style.display = 'none';
        } else {
            renderColumnTogglePanel();
            panel.style.display = 'block';
        }
    }

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
        else if (type === 'error' && window.Popup) window.Popup.error(msg);
        else console.log(`[${type}]`, msg);
    }
    function w2pConfirm(msg, opts) {
        return window.Popup ? window.Popup.confirm(msg, opts) : Promise.resolve(confirm(msg));
    }
    function w2pAlert(msg, opts) {
        if (window.Popup) return window.Popup.alert(msg, opts);
        alert(msg);
        return Promise.resolve();
    }

    // ---------- Render ----------
    function _renderExpandRow(o) {
        const lines = Array.isArray(o.products) ? o.products : [];
        if (!lines.length) {
            return `
                <tr class="expand-row" data-for="${escapeHtml(o.code)}">
                    <td colspan="16">
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
                <td colspan="16">
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

    // TPOS Trạng thái column uses PLAIN TEXT (not pill). Color varies by status:
    // draft → gray #808080, others → blue/red as appropriate. fw 700, fs 14px.
    function tposStatusText(s) {
        const map = {
            draft: { label: 'Nháp', cls: '' },
            confirmed: { label: 'Đơn hàng', cls: 'confirmed' },
            cancelled: { label: 'Huỷ bỏ', cls: 'cancelled' },
            delivered: { label: 'Đã giao', cls: 'delivered' },
        };
        const m = map[s] || { label: s || '—', cls: '' };
        return `<span class="tpos-status-text ${m.cls}">${m.label}</span>`;
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
            tbody().innerHTML = `<tr><td colspan="16" class="empty-row">
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

                // When merge mode is on, embed the merged sibling info inside the
                // primary cell so user still sees it even though sibling column is hidden.
                const mergeNameSdt = STATE.colVisibility.mergeNameSdt;
                const mergeTotalQty = STATE.colVisibility.mergeTotalQty;
                const mergedPhoneHtml =
                    mergeNameSdt && o.phone
                        ? `<a href="tel:${escapeHtml(o.phone)}" class="tpos-phone-link" style="font-size:11px;color:#6b7280;font-weight:500;" onclick="event.stopPropagation();">${escapeHtml(o.phone)}</a>`
                        : '';
                const mergedQtyHtml =
                    mergeTotalQty && qty
                        ? `<div style="font-size:11px;color:#6b7280;font-weight:500;">SL: ${qty}</div>`
                        : '';
                const sttValue = o.displayStt ?? o.sessionIndex ?? '';
                const mainRow = `
                <tr class="order-row ${isExpanded ? 'is-expanded' : ''}" data-code="${escapeHtml(o.code)}"
                    data-fb-user-id="${escapeHtml(o.fbUserId || '')}"
                    data-fb-page-id="${escapeHtml(o.fbPageId || '')}"
                    onclick="NativeOrdersApp.toggleExpand('${escapeHtml(o.code)}')" style="cursor:pointer;">
                    <td class="col-check" onclick="event.stopPropagation();">
                        <div class="tpos-check-stt">
                            <input type="checkbox" class="row-check" value="${escapeHtml(o.code)}">
                            <span class="tpos-row-stt">${sttValue}</span>
                        </div>
                    </td>
                    <td class="col-actions" onclick="event.stopPropagation();">
                        <div class="tpos-row-actions tpos-row-actions-grid">
                            <button class="tpos-btn tpos-btn-primary tpos-btn-xs" title="Sửa"
                                onclick="event.stopPropagation();NativeOrdersApp.openEdit('${escapeHtml(o.code)}')">
                                <i data-lucide="pencil" style="width:12px;height:12px;"></i>
                            </button>
                            <button class="tpos-btn tpos-btn-success tpos-btn-xs" title="Tạo PBH"
                                onclick="event.stopPropagation();NativeOrdersApp.createPbh('${escapeHtml(o.code)}')">
                                <i data-lucide="receipt" style="width:12px;height:12px;"></i>
                            </button>
                            ${
                                o.customerId
                                    ? `<button class="tpos-btn tpos-btn-default tpos-btn-xs" title="Khách hàng 360° (id ${o.customerId})" style="color:#7c3aed;"
                                onclick="event.stopPropagation();NativeOrdersApp.openCustomer(${o.customerId})">
                                <i data-lucide="user-circle" style="width:12px;height:12px;"></i>
                            </button>`
                                    : '<span class="tpos-action-placeholder"></span>'
                            }
                            <button class="tpos-btn tpos-btn-danger tpos-btn-xs" title="Xóa"
                                onclick="event.stopPropagation();NativeOrdersApp.removeOrder('${escapeHtml(o.code)}')">
                                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                            </button>
                        </div>
                    </td>
                    <td class="col-stt tpos-cell-center"><strong>${sttValue}</strong></td>
                    <td class="col-code tpos-cell-center">
                        <div class="tpos-code-cell" style="align-items:center;">
                            <span class="tpos-code-main" onclick="event.stopPropagation();NativeOrdersApp.copyCode('${escapeHtml(o.code)}')">${escapeHtml(o.code)}</span>
                            ${campaignName ? `<span class="tpos-code-sub">${escapeHtml(campaignName)}</span>` : ''}
                            ${tagBadges ? `<div class="tpos-code-tags">${tagBadges}</div>` : `<div class="tpos-code-tags"><button class="tpos-tag-trigger" onclick="event.stopPropagation();NativeOrdersApp.openEdit('${escapeHtml(o.code)}')"><i data-lucide="tag" style="width:11px;height:11px;"></i></button></div>`}
                        </div>
                    </td>
                    <td class="col-channel tpos-cell-center">
                        <div class="tpos-channel-cell" style="align-items:center;">
                            <span class="tpos-channel-name">${escapeHtml(o.fbUserName || '—')}</span>
                            ${o.fbCommentId ? `<span class="tpos-channel-link">Bình luận</span>` : ''}
                        </div>
                    </td>
                    <td class="col-customer">
                        <div class="tpos-customer-cell">
                            <div class="tpos-customer-name-row">
                                <span class="tpos-customer-name">${escapeHtml(o.customerName || '—')}</span>
                                ${statusPill}
                            </div>
                            ${mergedPhoneHtml}
                        </div>
                    </td>
                    <td class="col-phone tpos-cell-center" onclick="event.stopPropagation();">
                        ${
                            o.phone
                                ? `
                          <div class="tpos-phone-cell" style="align-items:center;">
                            <a href="tel:${escapeHtml(o.phone)}" class="tpos-phone-link">${escapeHtml(o.phone)}</a>
                            ${carrier ? `<span class="tpos-carrier">${carrier}</span>` : ''}
                          </div>
                        `
                                : '—'
                        }
                    </td>
                    <td class="col-address">${escapeHtml(o.address || '')}</td>
                    <td class="col-money tpos-cell-money">${total}${mergedQtyHtml}</td>
                    <td class="col-qty tpos-cell-center">${qty || ''}</td>
                    <td class="col-status">${tposStatusText(o.status)}</td>
                    <td class="col-message tpos-cell-center" onclick="event.stopPropagation();NativeOrdersApp.openInteractions('${escapeHtml(o.code)}','messages')">
                        <span class="tpos-count-pill tpos-count-msg ${Number(o.messageCount) > 0 ? '' : 'is-empty'}" title="Mở tin nhắn">
                            <i data-lucide="message-circle" style="width:11px;height:11px;"></i>
                            ${Number(o.messageCount) > 0 ? o.messageCount : '0'}
                        </span>
                    </td>
                    <td class="col-comment tpos-cell-center" onclick="event.stopPropagation();NativeOrdersApp.openInteractions('${escapeHtml(o.code)}','comments')">
                        <span class="tpos-count-pill tpos-count-cmt ${Number(o.commentCount) > 0 ? '' : 'is-empty'}" title="${o.commentCount || 0} bình luận">
                            <i data-lucide="message-square" style="width:11px;height:11px;"></i>
                            ${o.commentCount || 0}
                        </span>
                    </td>
                    <td class="col-note">${
                        o.note
                            ? `<div class="tpos-note-cell" title="${escapeHtml(o.note)}">${escapeHtml(o.note)}</div>`
                            : '<span class="tpos-count-empty">—</span>'
                    }</td>
                    <td class="col-employee">${escapeHtml(o.assignedEmployeeName || o.createdByName || '—')}</td>
                    <td class="col-time tpos-date-cell center" title="${escapeHtml(formatFullTime(o.createdAt))}">
                        ${time.date}/${new Date(Number(o.createdAt)).getFullYear()}<br>${time.hour}
                    </td>
                </tr>`;
                return isExpanded ? mainRow + _renderExpandRow(o) : mainRow;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
        // Re-apply new-message badges idempotently after every render
        if (window.Web2NewMsgBadge?.reapply) window.Web2NewMsgBadge.reapply();
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

    // Phase 14: filter chip when scoping to a Customer 360 id
    function renderCustomerChip() {
        let chip = document.getElementById('nativeOrdersCustomerChip');
        if (!STATE.customerId) {
            if (chip) chip.remove();
            return;
        }
        if (!chip) {
            chip = document.createElement('div');
            chip.id = 'nativeOrdersCustomerChip';
            chip.style.cssText =
                'display:inline-flex;align-items:center;gap:8px;padding:6px 12px;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;border-radius:999px;font-size:12px;font-weight:600;margin:8px 0 12px 0;';
            const anchor = $('#searchInfo') || controlBar() || tbody()?.closest('table');
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(chip, anchor);
            else document.body.appendChild(chip);
        }
        chip.innerHTML = `
            <i data-lucide="user-circle" style="width:14px;height:14px;color:#7c3aed;"></i>
            Đang lọc theo Khách hàng #${STATE.customerId}
            <button onclick="NativeOrdersApp.clearCustomerFilter()" title="Bỏ lọc" style="background:transparent;border:none;color:#5b21b6;cursor:pointer;font-size:14px;line-height:1;padding:0 0 0 6px;">×</button>`;
        if (window.lucide) lucide.createIcons();
    }

    function filterByCustomer(customerId) {
        if (!customerId) return;
        STATE.customerId = Number(customerId);
        STATE.page = 1;
        const url = new URL(location.href);
        url.searchParams.set('customerId', String(customerId));
        history.replaceState(null, '', url.toString());
        const modalEl = document.getElementById('customer360Modal');
        if (modalEl) modalEl.style.display = 'none';
        load();
    }

    function clearCustomerFilter() {
        STATE.customerId = null;
        STATE.page = 1;
        const url = new URL(location.href);
        url.searchParams.delete('customerId');
        history.replaceState(null, '', url.toString());
        load();
    }

    // ---------- Data load ----------
    async function load() {
        if (STATE.loading) return;
        STATE.loading = true;
        tbody().innerHTML = `<tr><td colspan="16" class="loading-row">
            <div class="spinner"></div>Đang tải dữ liệu...
        </td></tr>`;
        try {
            const resp = await window.NativeOrdersApi.list({
                status: STATE.status,
                search: STATE.search || undefined,
                page: STATE.page,
                limit: STATE.limit,
                campaignIds: STATE.selectedCampaignIds.length
                    ? STATE.selectedCampaignIds
                    : undefined,
                customerId: STATE.customerId || undefined,
            });
            STATE.orders = resp.orders || [];
            STATE.total = resp.total || 0;
            renderRows();
            renderPagination();
            renderCounters();
            renderCustomerChip();
        } catch (e) {
            console.error(e);
            tbody().innerHTML = `<tr><td colspan="16" class="empty-row" style="color:#ef4444;">
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
        STATE.selectedCampaignIds = [];
        saveCampaignSelection();
        renderCampaignDropdown();
        renderCampaignLabel();
        STATE.page = 1;
        load();
    }

    async function resetStt() {
        const renumber = await w2pConfirm(
            'Đồng ý để RENUMBER toàn bộ đơn hiện có (1, 2, 3...) theo thứ tự ngày tạo.\n' +
                'Huỷ để chỉ reset bộ đếm — đơn cũ giữ STT, đơn MỚI tiếp theo bắt đầu từ 1.',
            {
                title: 'Reset STT',
                type: 'warning',
                okText: 'Renumber tất cả',
                cancelText: 'Chỉ reset bộ đếm',
            }
        );
        try {
            const r = await fetch(`${WORKER_URL}/api/native-orders/reset-stt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ renumber }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            const msg =
                data.mode === 'renumber'
                    ? `Đã renumber ${data.renumbered} đơn — STT 1..${data.renumbered}`
                    : 'Đã reset bộ đếm — đơn mới sẽ có STT từ 1';
            await w2pAlert(msg, { type: 'success' });
            load();
        } catch (err) {
            console.error('[NativeOrders] resetStt error:', err);
            await w2pAlert('Lỗi reset STT: ' + err.message, { type: 'error' });
        }
    }

    // ---------- Campaign filter ----------
    const CAMPAIGN_STORAGE_KEY = 'native_orders_selected_campaigns';
    const TPOS_PANCAKE_KEY = 'tpos_selected_campaigns';

    function loadCampaignSelection() {
        // Priority: own key (per-page selection) > shared tpos-pancake key (cross-page sync)
        try {
            const own = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
            if (own != null) return JSON.parse(own) || [];
        } catch (_) {
            /* ignore */
        }
        try {
            const shared = localStorage.getItem(TPOS_PANCAKE_KEY);
            return shared ? JSON.parse(shared) || [] : [];
        } catch (_) {
            return [];
        }
    }

    function saveCampaignSelection() {
        try {
            localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(STATE.selectedCampaignIds));
        } catch (_) {
            /* ignore quota */
        }
    }

    async function loadAvailableCampaigns() {
        try {
            const resp = await window.NativeOrdersApi.campaigns();
            STATE.availableCampaigns = resp.campaigns || [];
            renderCampaignDropdown();
        } catch (e) {
            console.warn('[native-orders] campaigns fetch failed:', e.message);
            const list = $('#campaignList');
            if (list)
                list.innerHTML = `<div style="padding:8px;color:#ef4444;font-size:12px;">Lỗi tải: ${escapeHtml(e.message)}</div>`;
        }
    }

    function renderCampaignDropdown() {
        const list = $('#campaignList');
        if (!list) return;
        if (STATE.availableCampaigns.length === 0) {
            list.innerHTML =
                '<div style="padding:8px;color:#9ca3af;font-size:12px;">Chưa có chiến dịch nào</div>';
            return;
        }
        const sel = new Set(STATE.selectedCampaignIds);
        const html = STATE.availableCampaigns
            .map((c) => {
                const checked = sel.has(c.id) ? 'checked' : '';
                return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;font-size:13px;border-radius:4px;" data-id="${escapeHtml(c.id)}">
                    <input type="checkbox" class="campaign-check" data-id="${escapeHtml(c.id)}" ${checked} style="margin:0;">
                    <span style="flex:1;">${escapeHtml(c.name)}</span>
                    <span style="color:#9ca3af;font-size:11px;">${c.count}</span>
                </label>`;
            })
            .join('');
        list.innerHTML = html;
    }

    function renderCampaignLabel() {
        const label = $('#filterCampaignLabel');
        if (!label) return;
        const ids = STATE.selectedCampaignIds;
        if (ids.length === 0) {
            label.textContent = 'Tất cả';
            return;
        }
        if (ids.length === 1) {
            const c = STATE.availableCampaigns.find((x) => x.id === ids[0]);
            label.textContent = c
                ? c.name.slice(0, 28) + (c.name.length > 28 ? '…' : '')
                : '1 chiến dịch';
            return;
        }
        label.textContent = `${ids.length} chiến dịch`;
    }

    function toggleCampaignDropdown(force) {
        const dd = $('#filterCampaignDropdown');
        if (!dd) return;
        const isOpen = dd.style.display !== 'none';
        const next = typeof force === 'boolean' ? force : !isOpen;
        dd.style.display = next ? 'block' : 'none';
    }

    function syncFromTposPancake() {
        try {
            const shared = localStorage.getItem(TPOS_PANCAKE_KEY);
            const ids = shared ? JSON.parse(shared) || [] : [];
            STATE.selectedCampaignIds = ids;
            saveCampaignSelection();
            renderCampaignDropdown();
            renderCampaignLabel();
            STATE.page = 1;
            load();
            notify(
                ids.length
                    ? `Đã đồng bộ ${ids.length} chiến dịch từ Tpos-Pancake`
                    : 'Tpos-Pancake chưa chọn chiến dịch — hiển thị tất cả',
                'info'
            );
        } catch (e) {
            notify('Lỗi đồng bộ: ' + e.message, 'error');
        }
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

    // Phase 15: validate that an order has the minimum data to convert to PBH.
    // Returns { ok: true } or { ok: false, missing: ['SĐT','Địa chỉ','Sản phẩm',...] }
    function validateOrderForPbh(o) {
        const missing = [];
        if (!o?.phone || !String(o.phone).trim()) missing.push('SĐT');
        if (!o?.address || !String(o.address).trim()) missing.push('Địa chỉ');
        const products = Array.isArray(o?.products) ? o.products : [];
        const totalQty = products.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
        if (products.length === 0 || totalQty === 0) missing.push('Sản phẩm');
        return { ok: missing.length === 0, missing };
    }

    async function createPbh(code) {
        // Custom popup: show order summary + optional deposit/delivery overrides
        const src = STATE.orders.find((o) => o.code === code);
        if (!src) {
            notify('Không tìm thấy đơn ' + code, 'error');
            return;
        }
        // Phase 15: block creation when phone or address is missing — user must
        // fill these via the Edit modal first.
        const v = validateOrderForPbh(src);
        if (!v.ok) {
            if (window.Popup) {
                await window.Popup.error(
                    `Đơn ${code} chưa có ${v.missing.join(' và ')}. Vui lòng bổ sung trước khi tạo PBH.`,
                    { title: 'Thiếu thông tin', okText: 'Đã hiểu' }
                );
            } else {
                alert(`Đơn ${code} thiếu ${v.missing.join(' và ')} — không thể tạo PBH.`);
            }
            return;
        }
        // validateOrderForPbh already blocked empty-products orders above —
        // here products are guaranteed non-empty so totals will be > 0.
        const totals = (src.products || []).reduce(
            (acc, p) => {
                const q = Number(p.quantity) || 0;
                const price = Number(p.price) || 0;
                acc.qty += q;
                acc.amount += q * price;
                return acc;
            },
            { qty: 0, amount: 0 }
        );
        if (!window.Popup) {
            // Fallback for any environment without popup loaded yet
            if (!confirm(`Tạo Phiếu Bán Hàng (PBH) từ đơn ${code}?`)) return;
            return _doCreatePbh(code, {});
        }
        // Build a custom modal with form fields (deposit, deliveryPrice, paymentAmount, comment)
        const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

        // Resolve delivery option list + auto-pick by address.
        // Phase 17: prefer backend-driven options (single source of truth =
        // /api/web2/deliverycarrier/list). Falls back to hardcoded OPTIONS
        // if API fails — both pick() + getOptionsAsync() handle this safely.
        const DMP = window.DeliveryMethodPicker;
        const deliveryOpts = DMP ? await DMP.getOptionsAsync() : [];
        const picked = DMP ? DMP.pick(src.address || '', deliveryOpts) : null;
        const pickedValue = picked?.option?.value || '';
        const pickedHint = picked
            ? picked.hits > 0
                ? `🎯 Tự chọn theo địa chỉ — khớp khu vực: <strong>${escapeHtml(picked.matched.slice(0, 4).join(', '))}</strong>`
                : `📦 Không khớp khu vực HCM — mặc định <strong>SHIP TỈNH</strong>`
            : '';
        const deliveryDropdownHtml = DMP
            ? `<label style="display:flex;flex-direction:column;gap:4px;font-weight:600;grid-column:1/-1;">
                Phương thức giao hàng
                <select id="pbhDeliveryMethod"
                    style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;background:#fff;">
                    ${deliveryOpts
                        .map(
                            (o) =>
                                `<option value="${escapeHtml(o.value)}" data-price="${o.price || 0}" ${o.value === pickedValue ? 'selected' : ''}>${escapeHtml(o.label)}${o.price ? ' — ' + fmt(o.price) + 'đ' : ''}</option>`
                        )
                        .join('')}
                </select>
                ${pickedHint ? `<small style="color:#64748b;font-weight:500;font-size:11px;line-height:1.4;">${pickedHint}</small>` : ''}
            </label>`
            : '';

        const html = `
            <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;color:#334155;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;background:#f8fafc;border-radius:8px;padding:12px;">
                    <div><strong>Đơn nguồn:</strong> ${escapeHtml(src.code)}</div>
                    <div><strong>STT:</strong> ${src.displayStt ?? '—'}</div>
                    <div><strong>Khách:</strong> ${escapeHtml(src.customerName || '—')}</div>
                    <div><strong>SĐT:</strong> ${escapeHtml(src.phone || '—')}</div>
                    <div style="grid-column:1/-1;"><strong>Địa chỉ:</strong> ${escapeHtml(src.address || '—')}</div>
                    <div><strong>SL sản phẩm:</strong> ${totals.qty}</div>
                    <div style="text-align:right;color:#10b981;font-weight:700;">${fmt(totals.amount)}đ</div>
                </div>
                ${deliveryDropdownHtml}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                        Đặt cọc
                        <input id="pbhDeposit" type="number" min="0" step="1000" value="${Number(src.deposit) || 0}"
                            style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                        Phí giao hàng
                        <input id="pbhDeliveryPrice" type="number" min="0" step="1000" value="${picked?.option?.price || 0}"
                            style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                        Đã thanh toán
                        <input id="pbhPaymentAmount" type="number" min="0" step="1000" value="0"
                            style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                        Ngày HĐ
                        <input id="pbhDateInvoice" type="date" value="${new Date().toISOString().slice(0, 10)}"
                            style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                    </label>
                </div>
                <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                    Ghi chú
                    <textarea id="pbhComment" rows="2" placeholder="Ghi chú nội bộ (tùy chọn)"
                        style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;resize:vertical;"></textarea>
                </label>
            </div>
        `;
        const submit = await openCustomFormPopup({
            title: `Tạo PBH từ ${code}`,
            iconType: 'info',
            iconName: 'receipt',
            html,
            okText: 'Tạo PBH',
            cancelText: 'Huỷ',
            // Wire dropdown change → auto-fill Phí giao hàng so user sees price react live.
            onMount: (root) => {
                const sel = root.querySelector('#pbhDeliveryMethod');
                const priceInput = root.querySelector('#pbhDeliveryPrice');
                if (sel && priceInput) {
                    sel.addEventListener('change', () => {
                        const opt = sel.options[sel.selectedIndex];
                        const price = Number(opt.dataset.price || 0);
                        priceInput.value = price;
                    });
                }
            },
            collect: (root) => {
                const sel = root.querySelector('#pbhDeliveryMethod');
                const selectedOpt = sel ? sel.options[sel.selectedIndex] : null;
                return {
                    deposit: Number(root.querySelector('#pbhDeposit').value) || 0,
                    deliveryPrice: Number(root.querySelector('#pbhDeliveryPrice').value) || 0,
                    paymentAmount: Number(root.querySelector('#pbhPaymentAmount').value) || 0,
                    dateInvoice: root.querySelector('#pbhDateInvoice').value || null,
                    comment: root.querySelector('#pbhComment').value.trim() || null,
                    // Carrier name = label without trailing price part, used by PBH print/delivery flow
                    carrierName: selectedOpt
                        ? selectedOpt.textContent.replace(/\s*—\s*[\d.,]+đ\s*$/, '').trim()
                        : null,
                };
            },
        });
        if (!submit) return;
        await _doCreatePbh(code, submit);
    }

    // Renders a form-style popup matching Popup styling. Returns the
    // result of `opts.collect(rootEl)` on OK, or null on cancel/Escape.
    async function openCustomFormPopup(opts) {
        return new Promise((resolve) => {
            const root = document.createElement('div');
            // Uses shared .w2p-overlay class (no backdrop blur — see
            // docs/web2-modal-conventions.md for why).
            root.className = 'w2p-overlay';
            root.innerHTML = `
                <div class="w2p-card" style="max-width:${opts.maxWidth || 520}px;">
                    <div style="padding:18px 20px 14px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:12px;">
                        <div style="width:40px;height:40px;border-radius:50%;background:#dbeafe;color:#1e40af;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i data-lucide="${opts.iconName || 'edit-3'}" style="width:22px;height:22px;"></i>
                        </div>
                        <strong style="font-size:15px;color:#0f172a;line-height:1.3;">${escapeHtml(opts.title)}</strong>
                    </div>
                    <div class="w2p-form-body" style="padding:16px 20px;">${opts.html}</div>
                    <div style="padding:12px 20px 18px;display:flex;justify-content:flex-end;gap:8px;">
                        <button type="button" data-action="cancel" style="padding:8px 16px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">${escapeHtml(opts.cancelText || 'Huỷ')}</button>
                        <button type="button" data-action="ok" ${opts.okDisabled ? 'disabled' : ''} style="padding:8px 16px;border-radius:8px;border:1px solid transparent;background:${opts.okDisabled ? '#cbd5e1' : '#7c3aed'};color:#fff;font-size:13px;font-weight:600;cursor:${opts.okDisabled ? 'not-allowed' : 'pointer'};font-family:inherit;">${escapeHtml(opts.okText || 'OK')}</button>
                    </div>
                </div>`;
            document.body.appendChild(root);
            if (window.lucide) lucide.createIcons();
            if (typeof opts.onMount === 'function') {
                try {
                    opts.onMount(root);
                } catch (e) {
                    console.warn('[customFormPopup] onMount failed', e);
                }
            }
            const cleanup = () => {
                root.remove();
                document.removeEventListener('keydown', onKey);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                }
            };
            document.addEventListener('keydown', onKey);
            root.addEventListener('click', (e) => {
                if (e.target === root) {
                    cleanup();
                    resolve(null);
                }
            });
            root.querySelector('[data-action="cancel"]').addEventListener('click', () => {
                cleanup();
                resolve(null);
            });
            root.querySelector('[data-action="ok"]').addEventListener('click', () => {
                let result = null;
                try {
                    result = opts.collect ? opts.collect(root) : true;
                } catch (e) {
                    console.warn('[customFormPopup] collect failed', e);
                }
                cleanup();
                resolve(result);
            });
            // Focus first input/select/textarea
            setTimeout(() => {
                const first = root.querySelector('input, textarea, select');
                if (first) first.focus();
            }, 30);
        });
    }

    // Phase 15: bulk action bar — toggle visibility + count based on checked rows.
    function getSelectedCodes() {
        return Array.from(document.querySelectorAll('#ordersTbody .row-check:checked')).map(
            (c) => c.value
        );
    }
    function updateBulkBar() {
        const codes = getSelectedCodes();
        const bar = $('#ordersBulkBar');
        if (!bar) return;
        if (codes.length === 0) {
            bar.style.display = 'none';
        } else {
            bar.style.display = 'flex';
            const countEl = $('#ordersBulkCount');
            if (countEl) countEl.textContent = String(codes.length);
        }
    }
    function unselectAllOrders() {
        document.querySelectorAll('#ordersTbody .row-check:checked').forEach((c) => {
            c.checked = false;
        });
        const ca = $('#checkAll');
        if (ca) ca.checked = false;
        updateBulkBar();
    }

    // Phase 15: bulk-create PBH. Opens a management modal that lists every
    // selected order with its readiness status; user can apply shared
    // delivery / date / note OR per-row override (just delivery for now),
    // then submit creates PBH sequentially with a live progress bar.
    async function bulkCreatePbh() {
        const codes = getSelectedCodes();
        if (codes.length === 0) {
            notify('Chưa chọn đơn nào', 'warning');
            return;
        }
        const orders = codes.map((c) => STATE.orders.find((o) => o.code === c)).filter(Boolean);
        if (orders.length === 0) {
            notify('Không tìm thấy đơn', 'error');
            return;
        }
        const DMP = window.DeliveryMethodPicker;
        // Phase 17: load backend options once for both per-row pick + dropdown
        const deliveryOpts = DMP ? await DMP.getOptionsAsync() : [];

        // Compute per-row validation + auto-picked delivery option
        const rows = orders.map((o) => {
            const v = validateOrderForPbh(o);
            const pick = DMP ? DMP.pick(o.address || '', deliveryOpts) : null;
            const totalQty = (o.products || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
            const totalAmt = (o.products || []).reduce(
                (s, p) => s + (Number(p.quantity) || 0) * (Number(p.price) || 0),
                0
            );
            return {
                code: o.code,
                customerName: o.customerName || '—',
                phone: o.phone || '',
                address: o.address || '',
                totalQty,
                totalAmt,
                valid: v.ok,
                missing: v.missing,
                pickedValue: pick?.option?.value || '',
                pickedLabel: pick?.option?.label || '',
                pickedPrice: pick?.option?.price || 0,
            };
        });
        const validCount = rows.filter((r) => r.valid).length;
        const invalidCount = rows.length - validCount;

        const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
        const today = new Date().toISOString().slice(0, 10);

        const rowsHtml = rows
            .map(
                (r) => `
            <tr style="border-top:1px solid #f1f5f9;${r.valid ? '' : 'background:#fef2f2;'}">
                <td style="padding:8px 6px;font-weight:600;">${escapeHtml(r.code)}</td>
                <td style="padding:8px 6px;">${escapeHtml(r.customerName)}</td>
                <td style="padding:8px 6px;color:${r.phone ? '#0f172a' : '#dc2626'};">${escapeHtml(r.phone || '⚠ thiếu')}</td>
                <td style="padding:8px 6px;color:${r.address ? '#0f172a' : '#dc2626'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.address || '')}">${escapeHtml(r.address || '⚠ thiếu')}</td>
                <td style="padding:8px 6px;text-align:center;color:${r.totalQty > 0 ? '#0f172a' : '#dc2626'};">${r.totalQty > 0 ? r.totalQty : '⚠ 0'}</td>
                <td style="padding:8px 6px;text-align:right;color:#10b981;font-weight:600;">${fmt(r.totalAmt)}đ</td>
                <td style="padding:8px 6px;text-align:center;">
                    ${r.valid ? '<span style="color:#10b981;">✓ Sẵn sàng</span>' : `<span style="color:#dc2626;">⚠ Thiếu ${escapeHtml(r.missing.join(', '))}</span>`}
                </td>
            </tr>`
            )
            .join('');

        const html = `
            <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;color:#334155;">
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:999px;font-weight:600;font-size:12px;">✓ ${validCount} sẵn sàng</span>
                    ${invalidCount > 0 ? `<span style="background:#fee2e2;color:#991b1b;padding:4px 10px;border-radius:999px;font-weight:600;font-size:12px;">⚠ ${invalidCount} thiếu SĐT / địa chỉ / sản phẩm</span>` : ''}
                </div>
                <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">
                        <thead style="background:#f8fafc;">
                            <tr>
                                <th style="padding:8px 6px;text-align:left;width:130px;">Mã</th>
                                <th style="padding:8px 6px;text-align:left;width:110px;">Khách</th>
                                <th style="padding:8px 6px;text-align:left;width:100px;">SĐT</th>
                                <th style="padding:8px 6px;text-align:left;">Địa chỉ</th>
                                <th style="padding:8px 6px;text-align:center;width:50px;">SL</th>
                                <th style="padding:8px 6px;text-align:right;width:90px;">Tổng</th>
                                <th style="padding:8px 6px;text-align:center;width:130px;">Trạng thái</th>
                            </tr>
                        </thead>
                    </table>
                    <!-- Body in own .w2p-scroll-area (GPU layer + contain:paint).
                         See docs/web2-modal-conventions.md. -->
                    <div class="w2p-scroll-area" style="max-height:240px;">
                        <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">
                            <colgroup>
                                <col style="width:130px;">
                                <col style="width:110px;">
                                <col style="width:100px;">
                                <col>
                                <col style="width:50px;">
                                <col style="width:90px;">
                                <col style="width:130px;">
                            </colgroup>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>
                <fieldset style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin:0;">
                    <legend style="padding:0 8px;font-weight:700;color:#475569;font-size:12px;">Cài đặt áp dụng cho TẤT CẢ đơn hợp lệ</legend>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
                        <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;grid-column:1/-1;">
                            <span style="display:flex;align-items:center;gap:6px;">
                                Phương thức giao hàng
                                <small style="color:#64748b;font-weight:400;">(mặc định: auto-pick theo từng đơn)</small>
                            </span>
                            <select id="bulkDeliveryMethod"
                                style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;background:#fff;">
                                <option value="" selected>— Auto-pick theo địa chỉ từng đơn —</option>
                                ${deliveryOpts
                                    .map(
                                        (o) =>
                                            `<option value="${escapeHtml(o.value)}" data-price="${o.price || 0}">${escapeHtml(o.label)}${o.price ? ' — ' + fmt(o.price) + 'đ' : ''}</option>`
                                    )
                                    .join('')}
                            </select>
                        </label>
                        <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                            Ngày HĐ
                            <input id="bulkDateInvoice" type="date" value="${today}"
                                style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                        </label>
                        <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                            Ghi chú chung (áp cho tất cả)
                            <input id="bulkComment" type="text" placeholder="Tuỳ chọn"
                                style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                        </label>
                    </div>
                </fieldset>
                <div id="bulkProgress" style="display:none;font-size:12px;color:#475569;">
                    <div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
                        <div id="bulkProgressBar" style="height:100%;background:#7c3aed;width:0;transition:width 200ms;"></div>
                    </div>
                    <div id="bulkProgressLabel" style="margin-top:6px;"></div>
                </div>
            </div>`;

        const submit = await openCustomFormPopup({
            title: `Tạo PBH hàng loạt — ${codes.length} đơn`,
            iconName: 'layers',
            html,
            okText: validCount > 0 ? `Tạo ${validCount} PBH` : 'Không có đơn hợp lệ',
            cancelText: 'Đóng',
            okDisabled: validCount === 0,
            maxWidth: 760,
            collect: (root) => {
                const sel = root.querySelector('#bulkDeliveryMethod');
                const selectedOpt = sel?.options?.[sel.selectedIndex];
                return {
                    sharedDeliveryValue: sel?.value || '',
                    sharedDeliveryLabel: selectedOpt
                        ? selectedOpt.textContent.replace(/\s*—\s*[\d.,]+đ\s*$/, '').trim()
                        : '',
                    sharedDeliveryPrice: Number(selectedOpt?.dataset?.price || 0),
                    dateInvoice: root.querySelector('#bulkDateInvoice').value || null,
                    comment: root.querySelector('#bulkComment').value.trim() || null,
                };
            },
        });
        if (!submit || validCount === 0) return;

        // Submit sequentially with live progress (modal stays open showing progress)
        // We re-open a simple progress popup since the form is dismissed
        const progressModal = document.createElement('div');
        progressModal.className = 'w2p-overlay';
        progressModal.innerHTML = `
            <div class="w2p-card" style="max-width:480px;padding:22px 26px;">
                <strong style="font-size:15px;color:#0f172a;display:block;margin-bottom:12px;">Đang tạo PBH…</strong>
                <div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
                    <div id="pgBar" style="height:100%;background:#7c3aed;width:0;transition:width 200ms;"></div>
                </div>
                <div id="pgLabel" style="margin-top:8px;font-size:12px;color:#475569;">0 / ${validCount}</div>
                <ul id="pgList" style="margin:10px 0 0;padding:0;list-style:none;max-height:180px;overflow:auto;font-size:12px;"></ul>
            </div>`;
        document.body.appendChild(progressModal);

        const validRows = rows.filter((r) => r.valid);
        const results = [];
        for (let i = 0; i < validRows.length; i++) {
            const r = validRows[i];
            const extras = {
                deposit: 0,
                paymentAmount: 0,
                dateInvoice: submit.dateInvoice,
                comment: submit.comment,
            };
            // Resolve delivery: shared override OR per-row auto-pick
            if (submit.sharedDeliveryValue) {
                extras.deliveryPrice = submit.sharedDeliveryPrice;
                extras.carrierName = submit.sharedDeliveryLabel;
            } else {
                extras.deliveryPrice = r.pickedPrice;
                extras.carrierName = r.pickedLabel
                    ? r.pickedLabel.replace(/\s*—\s*[\d.,]+đ\s*$/, '').trim()
                    : null;
            }
            try {
                const resp = await fetch(`${WORKER_URL}/api/fast-sale-orders/from-native-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nativeOrderCode: r.code, ...extras }),
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) throw new Error(data.error || `HTTP ${resp.status}`);
                results.push({ code: r.code, pbh: data.order.number, ok: true });
                progressModal
                    .querySelector('#pgList')
                    .insertAdjacentHTML(
                        'beforeend',
                        `<li style="color:#065f46;padding:2px 0;">✓ ${escapeHtml(r.code)} → ${escapeHtml(data.order.number)}</li>`
                    );
            } catch (e) {
                results.push({ code: r.code, ok: false, error: e.message });
                progressModal
                    .querySelector('#pgList')
                    .insertAdjacentHTML(
                        'beforeend',
                        `<li style="color:#991b1b;padding:2px 0;">✗ ${escapeHtml(r.code)} — ${escapeHtml(e.message)}</li>`
                    );
            }
            const done = i + 1;
            const pct = Math.round((done / validRows.length) * 100);
            progressModal.querySelector('#pgBar').style.width = pct + '%';
            progressModal.querySelector('#pgLabel').textContent = `${done} / ${validRows.length}`;
        }

        const okCount = results.filter((r) => r.ok).length;
        const failCount = results.length - okCount;
        progressModal.remove();
        notify(
            `Đã tạo ${okCount}/${validRows.length} PBH${failCount ? ` (${failCount} lỗi)` : ''}${invalidCount ? ` — ${invalidCount} đơn bỏ qua (thiếu data)` : ''}`,
            failCount ? 'warning' : 'success'
        );
        unselectAllOrders();
        await load();
    }

    async function _doCreatePbh(code, extras) {
        try {
            const body = { nativeOrderCode: code, ...extras };
            const r = await fetch(`${WORKER_URL}/api/fast-sale-orders/from-native-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            const isIdempotent = data.idempotent;
            const pbh = data.order;
            notify(
                `${isIdempotent ? 'PBH đã tồn tại' : 'Đã tạo PBH'}: ${pbh.number} (STT ${pbh.displayStt})`,
                'success'
            );
            await load();
        } catch (e) {
            notify('Lỗi tạo PBH: ' + e.message, 'error');
            console.error('[createPbh]', e);
        }
    }

    async function removeOrder(code) {
        if (
            !(await w2pConfirm(`Hành động không thể hoàn tác.`, {
                title: `Xóa đơn ${code}?`,
                okText: 'Xoá đơn',
                cancelText: 'Đóng',
                type: 'error',
            }))
        )
            return;
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

    // ---------- Realtime WebSocket — auto refresh khi có đơn mới/update ----------
    const RT = { ws: null, reconnectAttempts: 0, debouncedReload: null };
    function rtConnect() {
        if (RT.ws && RT.ws.readyState <= 1) return;
        try {
            RT.ws = new WebSocket('wss://n2store-fallback.onrender.com');
        } catch (e) {
            console.warn('[NativeOrders-RT] WS create failed:', e.message);
            return setTimeout(rtConnect, 5000);
        }
        RT.ws.onopen = () => {
            RT.reconnectAttempts = 0;
            console.log('[NativeOrders-RT] ✓ connected');
        };
        RT.ws.onclose = () => {
            const delay = Math.min(30000, 1000 * Math.pow(2, RT.reconnectAttempts++));
            setTimeout(rtConnect, delay);
        };
        RT.ws.onerror = (e) => console.warn('[NativeOrders-RT] error', e);
        RT.ws.onmessage = (evt) => {
            let msg;
            try {
                msg = JSON.parse(evt.data);
            } catch {
                return;
            }
            if (!msg.type) return;
            // Events that affect this page: native_order:* + fast_sale_order:created (auto-promote)
            if (
                msg.type === 'native_order:created' ||
                msg.type === 'native_order:updated' ||
                msg.type === 'native_order:deleted'
            ) {
                rtScheduleReload(msg);
                // Phase 18: if the interactions modal is open for this order,
                // refresh its content live (no need to wait for table reload).
                if (msg.order && msg.type === 'native_order:updated') {
                    try {
                        _refreshInteractionsIfOpen(msg.order);
                    } catch (e) {
                        console.warn('[NativeOrders-RT] refresh interactions failed:', e.message);
                    }
                }
            }
        };
    }
    function rtScheduleReload(msg) {
        // Debounce 500ms — many events trong burst → reload 1 lần
        if (RT.debouncedReload) clearTimeout(RT.debouncedReload);
        RT.debouncedReload = setTimeout(() => {
            console.log('[NativeOrders-RT] reload triggered by', msg.type, msg.action || '');
            load();
            // Visual notification
            if (msg.action === 'comment-merged' && msg.order) {
                notify(
                    `📝 Đã gộp comment vào đơn ${msg.order.code} (${msg.order.commentCount} comments)`,
                    'info'
                );
            } else if (msg.action === 'created' && msg.order) {
                notify(`🆕 Đơn mới ${msg.order.code} (${msg.order.customerName})`, 'info');
            }
        }, 500);
    }

    // ---------- Init ----------
    function init() {
        if (window.lucide) lucide.createIcons();
        // Phase 14: hydrate customerId filter from URL
        const urlParams = new URLSearchParams(location.search);
        const urlCid = parseInt(urlParams.get('customerId'), 10);
        if (Number.isFinite(urlCid)) STATE.customerId = urlCid;
        rtConnect();

        // Apply/Clear/Refresh/Export buttons removed in single-row layout —
        // filters now auto-apply on change (debounced for search input).
        $('#btnResetStt')?.addEventListener('click', resetStt);
        let searchDebounce = null;
        $('#filterSearch')?.addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => applyFilters(), 350);
        });
        $('#filterSearch')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchDebounce);
                applyFilters();
            }
        });
        // Auto-apply when Status / Limit dropdowns change
        $('#filterStatus')?.addEventListener('change', applyFilters);
        $('#filterLimit')?.addEventListener('change', applyFilters);
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

        // Campaign filter wiring
        STATE.selectedCampaignIds = loadCampaignSelection();
        renderCampaignLabel();
        loadAvailableCampaigns();

        $('#filterCampaignBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCampaignDropdown();
        });
        document.addEventListener('click', (e) => {
            const dd = $('#filterCampaignDropdown');
            const btn = $('#filterCampaignBtn');
            if (!dd || !btn) return;
            if (dd.style.display === 'none') return;
            if (btn.contains(e.target) || dd.contains(e.target)) return;
            toggleCampaignDropdown(false);
        });
        $('#campaignList')?.addEventListener('change', (e) => {
            const cb = e.target.closest('.campaign-check');
            if (!cb) return;
            const id = cb.getAttribute('data-id');
            const set = new Set(STATE.selectedCampaignIds);
            if (cb.checked) set.add(id);
            else set.delete(id);
            STATE.selectedCampaignIds = Array.from(set);
            saveCampaignSelection();
            renderCampaignLabel();
            STATE.page = 1;
            load();
        });
        $('#campaignSelectAll')?.addEventListener('click', () => {
            STATE.selectedCampaignIds = STATE.availableCampaigns.map((c) => c.id);
            saveCampaignSelection();
            renderCampaignDropdown();
            renderCampaignLabel();
            STATE.page = 1;
            load();
        });
        $('#campaignSelectNone')?.addEventListener('click', () => {
            STATE.selectedCampaignIds = [];
            saveCampaignSelection();
            renderCampaignDropdown();
            renderCampaignLabel();
            STATE.page = 1;
            load();
        });
        $('#campaignSyncTpos')?.addEventListener('click', syncFromTposPancake);
        // Live cross-tab sync — when tpos-pancake updates its selection, refresh ours
        window.addEventListener('storage', (e) => {
            if (e.key === TPOS_PANCAKE_KEY) {
                // Only auto-sync if user hasn't made an own selection (own key still null)
                if (localStorage.getItem(CAMPAIGN_STORAGE_KEY) == null) {
                    syncFromTposPancake();
                }
            }
        });

        // Check-all + per-row check + bulk bar
        $('#checkAll')?.addEventListener('change', (e) => {
            document.querySelectorAll('#ordersTbody .row-check').forEach((c) => {
                c.checked = e.target.checked;
            });
            updateBulkBar();
        });
        // Per-row checkbox event delegation
        $('#ordersTbody')?.addEventListener('change', (e) => {
            if (e.target?.classList?.contains('row-check')) updateBulkBar();
        });
        $('#ordersBulkPbh')?.addEventListener('click', bulkCreatePbh);
        $('#ordersBulkUnselect')?.addEventListener('click', unselectAllOrders);

        // Phase 16: column show/hide toggle
        applyColumnVisibility();
        $('#btnColumnToggle')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleColumnPanel();
        });
        // Click outside the panel → close it
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('columnTogglePanel');
            if (!panel || panel.style.display === 'none') return;
            if (!panel.contains(e.target) && e.target?.id !== 'btnColumnToggle') {
                panel.style.display = 'none';
            }
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

    async function openCustomer(customerId) {
        if (!customerId) return;
        let modal = document.getElementById('customer360Modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'customer360Modal';
            modal.style.cssText =
                'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto;';
            modal.innerHTML = `
                <div style="background:#fff;border-radius:10px;max-width:760px;width:100%;padding:0;box-shadow:0 16px 48px rgba(0,0,0,0.15);">
                    <div style="padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <strong id="c360Title" style="font-size:14px;color:#1f2937;flex:1;">Khách hàng 360°</strong>
                        <button id="c360FilterBtn" class="tpos-btn tpos-btn-default tpos-btn-sm" style="color:#7c3aed;" title="Lọc tất cả đơn web của khách này">
                            <i data-lucide="filter" style="width:12px;height:12px;"></i> Lọc đơn
                        </button>
                        <button id="c360Close" style="background:transparent;border:none;font-size:18px;cursor:pointer;color:#6b7280;">×</button>
                    </div>
                    <div id="c360Body" style="padding:16px;font-size:13px;color:#374151;">Đang tải…</div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
            modal.querySelector('#c360Close').addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        const filterBtn = modal.querySelector('#c360FilterBtn');
        if (filterBtn) filterBtn.onclick = () => filterByCustomer(customerId);
        modal.style.display = 'flex';
        const body = modal.querySelector('#c360Body');
        const title = modal.querySelector('#c360Title');
        title.textContent = `Khách hàng #${customerId} — Đơn web + PBH`;
        body.innerHTML = '<div style="color:#6b7280;">Đang tải aggregation…</div>';
        const money = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
        try {
            const r = await fetch(`${WORKER_URL}/api/v2/customers/${customerId}/orders?limit=20`);
            const data = await r.json();
            if (!data?.success) throw new Error(data?.error || `HTTP ${r.status}`);
            const { native, pbh, summary } = data;
            const renderRow = (label, items, codeKey, totalKey, stateKey) => `
                <div style="margin-bottom:14px;">
                    <div style="font-weight:600;margin-bottom:6px;color:#111827;">${label} (${items.length})</div>
                    ${
                        items.length === 0
                            ? '<div style="color:#9ca3af;font-style:italic;">Không có đơn</div>'
                            : `<table style="width:100%;border-collapse:collapse;font-size:12px;">
                                <thead><tr style="background:#f9fafb;text-align:left;">
                                    <th style="padding:6px 8px;">Mã</th>
                                    <th style="padding:6px 8px;">SL</th>
                                    <th style="padding:6px 8px;text-align:right;">Tổng</th>
                                    <th style="padding:6px 8px;">Trạng thái</th>
                                    <th style="padding:6px 8px;">Chiến dịch</th>
                                </tr></thead>
                                <tbody>
                                ${items
                                    .slice(0, 10)
                                    .map(
                                        (it) => `<tr style="border-top:1px solid #e5e7eb;">
                                            <td style="padding:6px 8px;font-weight:600;">${escapeHtml(it[codeKey])}</td>
                                            <td style="padding:6px 8px;">${it.totalQuantity ?? '—'}</td>
                                            <td style="padding:6px 8px;text-align:right;">${money(it[totalKey])}</td>
                                            <td style="padding:6px 8px;">${escapeHtml(it[stateKey] || '—')}</td>
                                            <td style="padding:6px 8px;color:#6b7280;">${escapeHtml(it.liveCampaign?.name || '—')}</td>
                                        </tr>`
                                    )
                                    .join('')}
                                </tbody>
                            </table>`
                    }
                </div>`;
            body.innerHTML = `
                <div style="display:flex;gap:14px;margin-bottom:16px;flex-wrap:wrap;">
                    <div style="background:#ede9fe;color:#5b21b6;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Đơn web (NW)</div>
                        <div style="font-size:18px;font-weight:700;">${summary.native.count}</div>
                        <div style="font-size:11px;">${money(summary.native.totalAmount)}</div>
                    </div>
                    <div style="background:#dbeafe;color:#1e40af;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Phiếu bán hàng (HD)</div>
                        <div style="font-size:18px;font-weight:700;">${summary.pbh.count}</div>
                        <div style="font-size:11px;">${money(summary.pbh.totalAmount)}</div>
                    </div>
                </div>
                ${renderRow('Đơn web', native, 'code', 'totalAmount', 'status')}
                ${renderRow('PBH', pbh, 'number', 'amountTotal', 'state')}
            `;
        } catch (e) {
            body.innerHTML = `<div style="color:#dc2626;">Lỗi tải dữ liệu: ${escapeHtml(e.message)}</div>`;
        }
    }

    // ---------- Interactions modal: Tin nhắn + Bình luận ----------
    // Phase 18b: chat + reply directly in modal via lazy-loaded Pancake API.
    // Realtime-aware: subscribes to native_order:updated and refreshes the
    // open modal when the same order changes.
    let _interactionsState = null; // { code, tab, scrollY }

    /**
     * Web2Chat client is loaded via index.html (`web2-shared/web2-chat-client.js`).
     * No shared code with Web 1.0 — token config is read directly from
     * localStorage keys that the user already configured in tpos-pancake.
     */
    function _hasChatClient() {
        return !!window.Web2Chat;
    }

    async function openInteractions(code, initialTab = 'messages') {
        const order = STATE.orders.find((o) => o.code === code);
        if (!order) {
            notify('Không tìm thấy đơn ' + code, 'error');
            return;
        }
        _interactionsState = { code, tab: initialTab };
        _renderInteractionsModal(order, initialTab);
    }

    function _renderInteractionsModal(order, tab) {
        let modal = document.getElementById('orderInteractionsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'orderInteractionsModal';
            modal.className = 'w2p-overlay';
            document.body.appendChild(modal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) _closeInteractions();
            });
        }
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="w2p-card" style="max-width:720px;">
                <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:#ede9fe;color:#5b21b6;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i data-lucide="messages-square" style="width:20px;height:20px;"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <strong style="font-size:14px;color:#0f172a;display:block;">${escapeHtml(order.customerName || order.fbUserName || '—')}</strong>
                        <div style="font-size:11px;color:#6b7280;">
                            ${escapeHtml(order.code)} · ${order.phone ? '📞 ' + escapeHtml(order.phone) : 'không SĐT'}
                            ${order.fbUserId ? ' · 👤 ' + escapeHtml(String(order.fbUserId).slice(-12)) : ''}
                        </div>
                    </div>
                    <button onclick="NativeOrdersApp._closeInteractions()" style="background:transparent;border:none;font-size:18px;cursor:pointer;color:#6b7280;line-height:1;">×</button>
                </div>
                <div style="display:flex;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
                    <button class="interactions-tab ${tab === 'messages' ? 'is-active' : ''}" data-tab="messages" style="flex:1;padding:10px 14px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:600;color:${tab === 'messages' ? '#7c3aed' : '#475569'};border-bottom:2px solid ${tab === 'messages' ? '#7c3aed' : 'transparent'};display:inline-flex;align-items:center;justify-content:center;gap:6px;">
                        <i data-lucide="message-circle" style="width:14px;height:14px;"></i> Tin nhắn
                        ${Number(order.messageCount) > 0 ? `<span style="background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:9px;font-size:11px;font-weight:700;">${order.messageCount}</span>` : ''}
                    </button>
                    <button class="interactions-tab ${tab === 'comments' ? 'is-active' : ''}" data-tab="comments" style="flex:1;padding:10px 14px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:600;color:${tab === 'comments' ? '#7c3aed' : '#475569'};border-bottom:2px solid ${tab === 'comments' ? '#7c3aed' : 'transparent'};display:inline-flex;align-items:center;justify-content:center;gap:6px;">
                        <i data-lucide="message-square" style="width:14px;height:14px;"></i> Bình luận
                        ${Number(order.commentCount) > 0 ? `<span style="background:#ede9fe;color:#5b21b6;padding:1px 6px;border-radius:9px;font-size:11px;font-weight:700;">${order.commentCount}</span>` : ''}
                    </button>
                </div>
                <div id="interactionsBody" class="w2p-scroll-area" style="max-height:480px;padding:14px 18px;">${
                    tab === 'messages' ? _renderMessagesPanel(order) : _renderCommentsPanel(order)
                }</div>
            </div>`;

        // Wire tab clicks
        modal.querySelectorAll('.interactions-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                const newTab = btn.dataset.tab;
                if (newTab === _interactionsState.tab) return;
                _interactionsState.tab = newTab;
                _renderInteractionsModal(order, newTab);
            });
        });

        if (window.lucide) lucide.createIcons();

        // Wire send + reply button handlers per current tab
        if (tab === 'messages') {
            // Lazy-load conversation thread (async, non-blocking)
            _loadAndRenderThread(order);
            const sendBtn = modal.querySelector('[data-action="send-message"]');
            sendBtn?.addEventListener('click', () => _handleSendMessage(order));
            // Enter to send (Shift+Enter for newline)
            const input = modal.querySelector('#msgInput');
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    _handleSendMessage(order);
                }
            });
        } else if (tab === 'comments') {
            modal.querySelectorAll('[data-action="reply-comment"]').forEach((btn) => {
                btn.addEventListener('click', () =>
                    _handleReplyComment(order, btn.dataset.cid, btn.dataset.input, 'public')
                );
            });
            modal.querySelectorAll('[data-action="private-reply"]').forEach((btn) => {
                btn.addEventListener('click', () =>
                    _handleReplyComment(order, btn.dataset.cid, btn.dataset.input, 'private')
                );
            });
            // Ctrl/Cmd+Enter in reply textareas → send (default to public)
            modal.querySelectorAll('textarea[id^="replyCmt-"]').forEach((ta) => {
                ta.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        const cid = ta.parentElement?.querySelector('[data-action="reply-comment"]')
                            ?.dataset?.cid;
                        if (cid) _handleReplyComment(order, cid, ta.id, 'public');
                    }
                });
            });
        }
    }

    // ---- n2store-extension bridge: bypass 24h rule via FB Business Suite ----
    // Extension content script (manifest: nhijudyshop.github.io + *.workers.dev)
    // listens on window.postMessage with type matching INBOUND_TYPES, forwards
    // to its service worker which calls Facebook Business GraphQL (REPLY_INBOX_PHOTO,
    // SEND_COMMENT, SEND_PRIVATE_REPLY). FB Business rules differ from Pancake's
    // 24h policy — extension can send outside the standard window.
    let _extensionReady = false;
    let _extensionVersion = null;
    window.addEventListener('message', (e) => {
        const m = e.data;
        if (!m || typeof m !== 'object') return;
        if (m.type === 'EXTENSION_LOADED' || m.type === 'EXTENSION_VERSION') {
            _extensionReady = true;
            _extensionVersion = m.version || m.payload?.version || 'unknown';
            console.log('[NativeOrders] n2store-extension ready v' + _extensionVersion);
        }
    });
    function _hasExtension() {
        return _extensionReady;
    }

    /**
     * Send a request to the extension via window.postMessage bridge.
     * @param {string} type  — e.g. 'REPLY_INBOX_PHOTO', 'SEND_COMMENT', 'SEND_PRIVATE_REPLY'
     * @param {object} data  — payload (pageId, globalUserId, message, ...)
     * @param {number} timeoutMs
     * @returns {Promise<{ok:boolean, data?, error?}>}
     */
    function _extensionRequest(type, data, timeoutMs = 30000) {
        return new Promise((resolve) => {
            const taskId = `nw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const SUCCESS = type + '_SUCCESS';
            const FAILURE = type + '_FAILURE';
            let done = false;
            const onMsg = (e) => {
                const m = e.data;
                if (!m || typeof m !== 'object') return;
                if (m.taskId && m.taskId !== taskId) return;
                if (m.type === SUCCESS) {
                    done = true;
                    window.removeEventListener('message', onMsg);
                    resolve({ ok: true, data: m });
                } else if (m.type === FAILURE) {
                    done = true;
                    window.removeEventListener('message', onMsg);
                    resolve({ ok: false, error: m.error || 'Extension reported failure' });
                }
            };
            window.addEventListener('message', onMsg);
            window.postMessage({ ...data, type, taskId }, '*');
            setTimeout(() => {
                if (!done) {
                    window.removeEventListener('message', onMsg);
                    resolve({ ok: false, error: 'Extension timeout' });
                }
            }, timeoutMs);
        });
    }

    function _renderMessagesPanel(order) {
        if (!order.fbUserId || !order.fbPageId) {
            return `<div style="color:#94a3b8;font-style:italic;padding:24px 0;text-align:center;">
                <i data-lucide="user-x" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#cbd5e1;"></i>
                Đơn không có Facebook user ID hoặc page ID — không thể chat.
            </div>`;
        }
        const pancakeUrl = `../tpos-pancake/index.html?focusFbUserId=${encodeURIComponent(order.fbUserId)}${order.fbPageId ? '&focusPageId=' + encodeURIComponent(order.fbPageId) : ''}${order.liveCampaignId ? '&focusCampaign=' + encodeURIComponent(order.liveCampaignId) : ''}`;
        return `
            <div style="display:flex;flex-direction:column;gap:10px;min-height:280px;">
                <div id="msgThread" class="w2p-scroll-area" style="flex:1;min-height:200px;max-height:300px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:6px;font-size:12px;color:#475569;">
                    <div style="color:#94a3b8;font-style:italic;text-align:center;padding:30px 0;">
                        <i data-lucide="loader" style="width:18px;height:18px;display:block;margin:0 auto 6px;animation:spin 1s linear infinite;"></i>
                        Đang tải hội thoại…
                    </div>
                </div>
                <div style="display:flex;gap:6px;align-items:flex-end;">
                    <textarea id="msgInput" rows="2" placeholder="Nhập tin nhắn gửi cho khách… (Enter để gửi, Shift+Enter xuống dòng)" style="flex:1;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;min-height:38px;max-height:140px;"></textarea>
                    <button class="tpos-btn tpos-btn-primary tpos-btn-sm" data-action="send-message" title="Gửi tin nhắn (reply_inbox)" style="height:38px;">
                        <i data-lucide="send" style="width:13px;height:13px;"></i> Gửi
                    </button>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                    <small style="color:#94a3b8;font-size:11px;">
                        ${_hasExtension() ? `🚀 <strong style="color:#7c3aed;">N2 Extension v${_extensionVersion}</strong> sẽ gửi (bypass rule 24h)` : 'Gửi qua Pancake API → Messenger của khách'}
                    </small>
                    <a href="${pancakeUrl}" target="_blank" rel="noopener" style="font-size:11px;color:#7c3aed;text-decoration:none;">
                        Mở đầy đủ trong TPOS × Pancake →
                    </a>
                </div>
            </div>`;
    }

    /**
     * After Messages tab renders, lazy-load Pancake API + fetch conversation history.
     * Stores conversationId/customerId on #msgInput for the Send button.
     */
    async function _loadAndRenderThread(order) {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl) return;
        if (!_hasChatClient()) {
            threadEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:14px;text-align:center;">Web2Chat client chưa load.</div>`;
            return;
        }
        if (!window.Web2Chat.hasTokensFor(order.fbPageId)) {
            threadEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:14px;text-align:center;line-height:1.5;">
                Chưa cấu hình token Pancake cho page <code>${escapeHtml(order.fbPageId)}</code>.<br>
                <a href="../tpos-pancake/index.html" target="_blank" style="color:#7c3aed;">Mở TPOS × Pancake để đăng nhập + lấy token →</a>
            </div>`;
            return;
        }
        try {
            const convRes = await window.Web2Chat.fetchConversations(
                order.fbPageId,
                order.fbUserId
            );
            const conversations = convRes.conversations || [];
            if (!convRes.ok || conversations.length === 0) {
                const reason = convRes.reason ? ` (${convRes.reason})` : '';
                threadEl.innerHTML = `<div style="color:#94a3b8;font-size:12px;padding:30px 0;text-align:center;font-style:italic;">Chưa có hội thoại với khách${reason}. Gõ tin nhắn để bắt đầu.</div>`;
                return;
            }
            // Pancake returns BOTH inbox conversations and comment "conversations"
            // mixed together. The messages endpoint only returns content for INBOX
            // type; COMMENT type rows are placeholders for comment threads.
            const inboxConvs = conversations.filter(
                (c) => (c.type || '').toUpperCase() === 'INBOX'
            );
            if (inboxConvs.length === 0) {
                const commentCount = conversations.length;
                threadEl.innerHTML = `<div style="color:#94a3b8;font-size:12px;padding:24px 12px;text-align:center;line-height:1.5;">
                    <i data-lucide="message-square-off" style="width:28px;height:28px;display:block;margin:0 auto 6px;color:#cbd5e1;"></i>
                    Khách chưa có tin nhắn inbox với page này.<br>
                    <span style="font-size:11px;">Có ${commentCount} comment trên các post — chuyển sang tab <strong>Bình luận</strong> để trả lời.</span>
                </div>`;
                if (window.lucide?.createIcons) window.lucide.createIcons();
                return;
            }
            const conv = inboxConvs[0]; // most recent inbox thread
            const customerId = convRes.customerUuid || conv?.customers?.[0]?.id || null;
            const input = document.getElementById('msgInput');
            if (input) {
                input.dataset.conversationId = conv.id;
                input.dataset.customerId = customerId || '';
                input.dataset.threadId = conv?.thread_id || conv?.threadId || '';
            }
            const msgRes = await window.Web2Chat.fetchMessages(order.fbPageId, conv.id, customerId);
            if (!msgRes.ok) {
                threadEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:14px;text-align:center;">Lỗi tải tin nhắn: ${escapeHtml(msgRes.reason || 'unknown')}</div>`;
                return;
            }
            const messages = (msgRes.messages || []).slice(-30);
            if (!messages.length) {
                threadEl.innerHTML = `<div style="color:#94a3b8;font-size:12px;padding:30px 0;text-align:center;font-style:italic;">Hội thoại trống. Gõ tin nhắn để bắt đầu.</div>`;
                return;
            }
            // Pancake stores message text with HTML wrappers (<div>, <br />, …).
            // Render as plain text — turn <br> into newlines, drop other tags.
            const _msgPlain = (raw) => {
                if (!raw) return '';
                const tmp = document.createElement('div');
                tmp.innerHTML = String(raw).replace(/<br\s*\/?>/gi, '\n');
                return (tmp.textContent || tmp.innerText || '').trim();
            };
            threadEl.innerHTML = messages
                .map((m) => {
                    const isOutgoing = m.from?.id === order.fbPageId || m.from_admin || m.is_admin;
                    const txt = _msgPlain(m.message || m.text || m.content || '');
                    const time = m.inserted_at || m.created_time || m.timestamp;
                    const atts = Array.isArray(m.attachments) ? m.attachments : [];
                    const imgs = atts
                        .filter((a) => {
                            const t = (a.type || '').toLowerCase();
                            return t === 'photo' || t === 'image' || t === 'sticker';
                        })
                        .map((a) => a.url || a.preview_url || a.thumb_url)
                        .filter(Boolean);
                    const imgHtml = imgs
                        .slice(0, 4)
                        .map(
                            (u) =>
                                `<a href="${escapeHtml(u)}" target="_blank" rel="noopener" style="display:block;margin-top:4px;"><img src="${escapeHtml(u)}" style="max-width:180px;max-height:240px;border-radius:6px;border:1px solid rgba(255,255,255,0.3);display:block;" loading="lazy" /></a>`
                        )
                        .join('');
                    const fileAtts = atts
                        .filter(
                            (a) =>
                                !['photo', 'image', 'sticker'].includes(
                                    (a.type || '').toLowerCase()
                                )
                        )
                        .map(
                            (a) =>
                                `<div style="font-size:11px;opacity:0.8;margin-top:3px;">📎 ${escapeHtml(a.name || a.type || 'attachment')}</div>`
                        )
                        .join('');
                    const inner = txt
                        ? `<div style="white-space:pre-wrap;">${escapeHtml(txt)}</div>`
                        : imgs.length === 0 && atts.length === 0
                          ? `<div style="opacity:0.6;font-style:italic;">(không có nội dung)</div>`
                          : '';
                    return `<div style="align-self:${isOutgoing ? 'flex-end' : 'flex-start'};max-width:80%;background:${isOutgoing ? '#7c3aed' : '#fff'};color:${isOutgoing ? '#fff' : '#0f172a'};padding:6px 10px;border-radius:${isOutgoing ? '10px 10px 2px 10px' : '10px 10px 10px 2px'};font-size:12px;border:1px solid ${isOutgoing ? '#7c3aed' : '#e5e7eb'};">${inner}${imgHtml}${fileAtts}${time ? `<div style="font-size:9px;opacity:0.65;margin-top:3px;">${new Date(time).toLocaleString('vi-VN')}</div>` : ''}</div>`;
                })
                .join('');
            threadEl.scrollTop = threadEl.scrollHeight;
        } catch (e) {
            threadEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:14px;">Lỗi tải hội thoại: ${escapeHtml(e.message)}</div>`;
        }
    }

    async function _handleSendMessage(order) {
        const input = document.getElementById('msgInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) {
            notify('Vui lòng nhập tin nhắn', 'warning');
            return;
        }
        input.disabled = true;

        // Try extension bridge first (bypasses Pancake 24h rule via FB Business)
        if (_hasExtension()) {
            try {
                // FB Business Suite uses a "global" user id distinct from the regular
                // fbUserId in some flows; resolve once per order then cache on the order.
                let globalUserId = order._fbGlobalUserId;
                if (!globalUserId && order.fbPageId && input.dataset.conversationId) {
                    try {
                        const gidResp = await _extensionRequest(
                            'GET_GLOBAL_ID_FOR_CONV',
                            {
                                pageId: order.fbPageId,
                                convId: input.dataset.conversationId,
                                fbUserId: order.fbUserId,
                            },
                            8000
                        );
                        globalUserId =
                            gidResp?.data?.globalUserId ||
                            gidResp?.data?.globalId ||
                            gidResp?.data?.payload?.globalUserId;
                        if (globalUserId) order._fbGlobalUserId = globalUserId;
                    } catch {
                        /* fall back to fbUserId below */
                    }
                }
                const r = await _extensionRequest('REPLY_INBOX_PHOTO', {
                    pageId: order.fbPageId,
                    globalUserId: globalUserId || order.fbUserId,
                    threadId: input.dataset.threadId || '',
                    convId: input.dataset.conversationId || '',
                    message: text,
                    attachmentType: 'SEND_TEXT_ONLY',
                    platform: 'facebook',
                    isBusiness: true,
                });
                if (r.ok) {
                    input.value = '';
                    notify('Đã gửi qua N2 Extension (bypass 24h)', 'success');
                    setTimeout(() => _loadAndRenderThread(order), 1500);
                    if (window.Web2NewMsgBadge?.clearPendingForCustomer) {
                        window.Web2NewMsgBadge.clearPendingForCustomer(order.fbUserId);
                    }
                    input.disabled = false;
                    input.focus();
                    return;
                }
                console.warn('[NativeOrders] Extension send failed, fallback Pancake:', r.error);
            } catch (e) {
                console.warn('[NativeOrders] Extension bridge error, fallback Pancake:', e.message);
            }
        }

        // Fallback: Web2Chat client (Pancake Public API, subject to 24h rule)
        if (!_hasChatClient() || !window.Web2Chat.hasTokensFor(order.fbPageId)) {
            input.disabled = false;
            notify('Chưa có Extension và chưa cấu hình token Pancake cho page này.', 'error');
            return;
        }
        let conversationId = input.dataset.conversationId;
        let customerId = input.dataset.customerId || null;
        if (!conversationId) {
            const r = await window.Web2Chat.fetchConversations(order.fbPageId, order.fbUserId);
            const list = r.conversations || [];
            if (list[0]) {
                conversationId = list[0].id;
                customerId = r.customerUuid || list[0]?.customers?.[0]?.id || customerId;
            }
        }
        if (!conversationId) {
            input.disabled = false;
            notify('Chưa tìm thấy hội thoại với khách.', 'error');
            return;
        }
        const sendRes = await window.Web2Chat.sendMessage(order.fbPageId, conversationId, {
            text,
            action: 'reply_inbox',
            customerId,
        });
        if (sendRes.ok) {
            input.value = '';
            notify('Đã gửi tin nhắn', 'success');
            _loadAndRenderThread(order);
            if (window.Web2NewMsgBadge?.clearPendingForCustomer) {
                window.Web2NewMsgBadge.clearPendingForCustomer(order.fbUserId);
            }
        } else {
            notify('Lỗi gửi tin nhắn: ' + (sendRes.reason || 'unknown'), 'error');
        }
        input.disabled = false;
        input.focus();
    }

    async function _handleReplyComment(order, commentId, inputId, mode) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const text = input.value.trim();
        if (!text) {
            notify('Vui lòng nhập nội dung trả lời', 'warning');
            return;
        }
        input.disabled = true;

        // Try extension first (bypasses 24h via FB Business)
        if (_hasExtension()) {
            try {
                const extType = mode === 'private' ? 'SEND_PRIVATE_REPLY' : 'SEND_COMMENT';
                const r = await _extensionRequest(extType, {
                    pageId: order.fbPageId,
                    postId: order.fbPostId,
                    commentId,
                    message: text,
                    globalUserId: order.fbUserId,
                });
                if (r.ok) {
                    input.value = '';
                    notify(
                        (mode === 'private' ? '📨 Đã gửi DM ' : '💬 Đã trả lời comment ') +
                            'qua N2 Extension',
                        'success'
                    );
                    input.disabled = false;
                    return;
                }
                console.warn('[NativeOrders] Extension reply failed, fallback Pancake:', r.error);
            } catch (e) {
                console.warn('[NativeOrders] Extension bridge error, fallback Pancake:', e.message);
            }
        }

        // Fallback: Web2Chat client → /pages/:id/comments/:id/replies (Public API)
        if (!_hasChatClient() || !window.Web2Chat.hasTokensFor(order.fbPageId)) {
            input.disabled = false;
            notify('Chưa có Extension và chưa cấu hình token Pancake cho page này.', 'error');
            return;
        }
        const replyRes = await window.Web2Chat.replyComment(order.fbPageId, commentId, {
            text,
            mode: mode === 'private' ? 'private' : 'public',
        });
        if (replyRes.ok) {
            input.value = '';
            notify(
                mode === 'private'
                    ? 'Đã gửi tin nhắn riêng (Web2Chat)'
                    : 'Đã trả lời bình luận (Web2Chat)',
                'success'
            );
        } else {
            notify('Lỗi: ' + (replyRes.reason || 'unknown'), 'error');
        }
        input.disabled = false;
    }

    function _renderCommentsPanel(order) {
        const ids = Array.isArray(order.commentIds) ? order.commentIds : [];
        if (ids.length === 0) {
            return `<div style="color:#94a3b8;font-style:italic;padding:24px 0;text-align:center;">
                <i data-lucide="message-square-off" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#cbd5e1;"></i>
                Chưa có bình luận nào trong đơn.
            </div>`;
        }
        // Parse comment lines from `note` (each merge appends "[timestamp] message")
        const noteLines = order.note
            ? order.note
                  .split('---')
                  .map((s) => s.trim())
                  .filter(Boolean)
            : [];
        const pancakeUrl = (commentId) =>
            `../tpos-pancake/index.html?focusCommentId=${encodeURIComponent(commentId)}${order.fbPageId ? '&focusPageId=' + encodeURIComponent(order.fbPageId) : ''}`;
        const fbPermalink = (commentId) => {
            const postId = order.fbPostId || '';
            const postShort = postId.includes('_') ? postId.split('_').pop() : postId;
            const cmtShort = String(commentId).includes('_')
                ? String(commentId).split('_').pop()
                : commentId;
            if (postShort && cmtShort) {
                return `https://www.facebook.com/${order.fbPageId || ''}/posts/${postShort}?comment_id=${cmtShort}`;
            }
            return `https://www.facebook.com/${commentId}`;
        };
        const canReply = !!order.fbPageId;
        return `
            <div style="display:flex;flex-direction:column;gap:10px;">
                ${ids
                    .map((cid, i) => {
                        const noteLine = noteLines[i] || '';
                        const replyInputId = `replyCmt-${i}`;
                        return `
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;">
                        <code style="font-size:11px;color:#6b7280;font-family:'JetBrains Mono',Menlo,monospace;">#${escapeHtml(String(cid).slice(-16))}</code>
                        <div style="display:inline-flex;gap:6px;">
                            <a href="${fbPermalink(cid)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#3b82f6;text-decoration:none;padding:4px 8px;border:1px solid #dbeafe;border-radius:4px;">
                                <i data-lucide="facebook" style="width:11px;height:11px;"></i> Facebook
                            </a>
                            <a href="${pancakeUrl(cid)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#7c3aed;text-decoration:none;padding:4px 8px;border:1px solid #ede9fe;border-radius:4px;">
                                <i data-lucide="external-link" style="width:11px;height:11px;"></i> TPOS Pancake
                            </a>
                        </div>
                    </div>
                    ${
                        noteLine
                            ? `<div style="font-size:13px;color:#334155;line-height:1.5;white-space:pre-wrap;margin-bottom:8px;">${escapeHtml(noteLine)}</div>`
                            : '<div style="font-size:11px;color:#94a3b8;font-style:italic;margin-bottom:8px;">(chưa có nội dung trong note)</div>'
                    }
                    ${
                        canReply
                            ? `<div class="reply-row" style="display:flex;gap:6px;align-items:flex-end;border-top:1px dashed #e5e7eb;padding-top:8px;">
                        <textarea id="${replyInputId}" rows="1" placeholder="Trả lời bình luận này…" style="flex:1;padding:6px 10px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;font-family:inherit;resize:vertical;min-height:28px;max-height:120px;"></textarea>
                        <button class="tpos-btn tpos-btn-success tpos-btn-xs" data-action="reply-comment" data-cid="${escapeHtml(cid)}" data-input="${replyInputId}" title="Trả lời công khai (action=reply_comment)">
                            <i data-lucide="reply" style="width:11px;height:11px;"></i>
                        </button>
                        <button class="tpos-btn tpos-btn-primary tpos-btn-xs" data-action="private-reply" data-cid="${escapeHtml(cid)}" data-input="${replyInputId}" title="Trả lời riêng (DM khách qua Messenger)">
                            <i data-lucide="send" style="width:11px;height:11px;"></i>
                        </button>
                    </div>`
                            : ''
                    }
                </div>`;
                    })
                    .join('')}
                ${canReply ? '' : '<div style="background:#fef3c7;color:#92400e;font-size:11px;padding:8px 12px;border-radius:4px;">⚠ Đơn không có fb_page_id → không thể trả lời. Mở trong TPOS × Pancake.</div>'}
            </div>`;
    }

    function _closeInteractions() {
        const modal = document.getElementById('orderInteractionsModal');
        if (modal) modal.style.display = 'none';
        _interactionsState = null;
    }

    // Hook for realtime refresh — called from WS event handler
    function _refreshInteractionsIfOpen(updatedOrder) {
        if (!_interactionsState || _interactionsState.code !== updatedOrder.code) return;
        // Merge updated fields into the live STATE entry (broadcast may carry newer data)
        const idx = STATE.orders.findIndex((o) => o.code === updatedOrder.code);
        if (idx !== -1) STATE.orders[idx] = { ...STATE.orders[idx], ...updatedOrder };
        _renderInteractionsModal(STATE.orders[idx] || updatedOrder, _interactionsState.tab);
    }

    window.NativeOrdersApp = {
        openEdit,
        quickStatus,
        removeOrder,
        createPbh,
        bulkCreatePbh,
        unselectAllOrders,
        copyCode,
        goPage,
        toggleFilter,
        toggleExpand,
        openCustomer,
        filterByCustomer,
        clearCustomerFilter,
        // Phase 18: interactions modal (Tin nhắn + Bình luận)
        openInteractions,
        _closeInteractions,
        _refreshInteractionsIfOpen,
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
