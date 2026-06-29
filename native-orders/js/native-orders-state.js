// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — shared namespace + STATE + config (cols/channel) + DOM/base helpers (escapeHtml, notify, avatar). MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // Phase 16: column visibility config — declared BEFORE STATE so the
    // STATE.colVisibility initializer (which calls loadColVisibility()) can
    // read COL_DEFAULT without hitting TDZ.
    NO.COL_KEYS = [
        { key: 'actions', label: 'Thao tác' },
        { key: 'stt', label: 'STT (cột riêng)' },
        { key: 'code', label: 'Mã đơn' },
        { key: 'tag', label: 'Thẻ (auto)' },
        { key: 'channel', label: 'Kênh' },
        { key: 'customer', label: 'Tên khách' },
        { key: 'phone', label: 'SĐT (cột riêng)' },
        { key: 'address', label: 'Địa chỉ' },
        { key: 'money', label: 'Tổng tiền' },
        { key: 'qty', label: 'SL (cột riêng)' },
        { key: 'status', label: 'Trạng thái' },
        { key: 'message', label: 'Tin nhắn' },
        { key: 'comment', label: 'Bình luận' },
        // 2026-06-01: Tách cột "Ghi chú" thành 2:
        //   - customerComment (cũ note): auto-captured comment từ FB web2-pancake, read-only
        //   - userNote: ghi chú NV tự ghi (size, đóng gói, etc) qua modal sửa đơn
        // Default both ẨN — user toggle qua "Hiện/ẩn cột" nếu cần.
        { key: 'customerComment', label: 'Khách comment' },
        { key: 'userNote', label: 'Ghi chú đơn' },
        { key: 'employee', label: 'Nhân viên' },
        { key: 'time', label: 'Ngày tạo' },
    ];

    NO.COL_DEFAULT = {
        actions: true,
        stt: false, // STT đã hợp nhất vào cột check
        code: false,
        tag: true, // cột Thẻ (auto theo trigger) — bật mặc định

        channel: false,
        customer: true,
        phone: false, // merged into customer
        address: true,
        money: true,
        qty: false, // merged into money
        status: true,
        message: true,
        comment: false, // Bình luận — mặc định ẨN (xem comment trong modal chat cột info)
        customerComment: false, // (cũ 'note') auto FB comment — mặc định ẨN
        userNote: false, // ghi chú NV — mặc định ẨN
        employee: false,
        time: false,
        // Merge flags
        mergeNameSdt: true,
        mergeTotalQty: true,
    };

    // ⚠ Dùng literal trực tiếp (KHÔNG ref const ngoài) — restoreChannel() được gọi
    // trong object literal STATE phía trên, chạy TRƯỚC khi các const module-scope
    // bên dưới khởi tạo → ref const sẽ ném TDZ "Cannot access before initialization".
    NO.restoreChannel = function restoreChannel() {
        try {
            const v = localStorage.getItem('native_orders_channel');
            if (v === 'web2_inbox' || v === 'web2_livestream') return v;
        } catch {
            /* fallthrough */
        }
        return 'web2_livestream';
    };

    NO.saveChannel = function saveChannel(ch) {
        try {
            localStorage.setItem('native_orders_channel', ch);
        } catch {
            /* best-effort */
        }
    };

    NO.loadColVisibility = function loadColVisibility() {
        try {
            const raw = localStorage.getItem('nativeOrdersColVisibility_v3');
            if (raw) {
                const parsed = JSON.parse(raw);
                return { ...NO.COL_DEFAULT, ...parsed };
            }
        } catch {
            /* fallthrough to default */
        }
        return { ...NO.COL_DEFAULT };
    };

    NO.saveColVisibility = function saveColVisibility() {
        try {
            localStorage.setItem(
                'nativeOrdersColVisibility_v3',
                JSON.stringify(NO.STATE.colVisibility)
            );
        } catch {
            /* ignore quota */
        }
    };

    NO.STATE = {
        orders: [],
        total: 0,
        page: 1,
        limit: 200,
        status: 'all',
        // 2026-06-29: lọc theo THẺ (autoTags) — client-side. '' = tất cả, else = trigger.
        // Tags tính server-side SAU phân trang nên không lọc DB được → lọc trên trang đã tải
        // (giống KPI health bar). Options tự dựng từ autoTags của orders đã tải.
        tagFilter: '',
        // 2026-06-04: tab kênh đơn — 'web2_livestream' (mặc định) | 'web2_inbox'.
        // (2026-06-05: prefix web2_ — 'inbox'/'livestream' trần dễ nhầm Pancake/
        // icon/field source/hệ khác. Phải khớp data-channel ở index.html.)
        // 2026-06-09: nhớ tab đang chọn qua refresh (localStorage).
        channel: NO.restoreChannel(),
        search: '',
        editingCode: null,
        loading: false,
        filterVisible: true,
        expandedOrders: new Set(), // codes of rows currently expanded
        // Lọc theo BÀI VIẾT riêng lẻ (multi-select). Mảng các campaign ID
        // ('__no_campaign__' cho đơn không campaign). Mặc định khi rỗng → tự
        // chọn 2 bài mới nhất (House + Store) ở reconcileCampaignSelection().
        // Loại trừ 2 chiều với chiến dịch CHA (parentCampaignId = nhóm bài).
        selectedCampaignIds: [],
        availableCampaigns: [], // [{id, name, count, lastOrderAt}]
        // Phase 14: scope list to a single Customer 360 record (parsed from URL).
        customerId: null,
        // Phase 16: per-column visibility + merge flags (persisted in localStorage).
        // Defaults per user request:
        //   show: actions, stt, customer (with merged phone), address, money (with merged qty)
        //   hide: code, channel, phone, qty, status, employee, time
        colVisibility: NO.loadColVisibility(),
    };

    NO.applyColumnVisibility = function applyColumnVisibility() {
        // Inject (or replace) a <style> block that hides th/td matching hidden cols.
        let styleEl = document.getElementById('nativeOrdersColStyle');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'nativeOrdersColStyle';
            document.head.appendChild(styleEl);
        }
        const hidden = NO.COL_KEYS.filter((c) => !NO.STATE.colVisibility[c.key]).map(
            (c) => `.col-${c.key}`
        );
        styleEl.textContent = hidden.length
            ? `${hidden.join(', ')} { display: none !important; }`
            : '';
    };

    NO.renderColumnTogglePanel = function renderColumnTogglePanel() {
        const panel = document.getElementById('columnTogglePanel');
        if (!panel) return;
        const colList = NO.COL_KEYS.map(
            (c) => `
            <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">
                <input type="checkbox" data-col="${c.key}" ${NO.STATE.colVisibility[c.key] ? 'checked' : ''}>
                <span>${NO.escapeHtml(c.label)}</span>
            </label>`
        ).join('');
        panel.innerHTML = `
            <div style="font-weight:700;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Cột</div>
            ${colList}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0;">
            <div style="font-weight:700;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Gộp cột</div>
            <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">
                <input type="checkbox" data-merge="mergeNameSdt" ${NO.STATE.colVisibility.mergeNameSdt ? 'checked' : ''}>
                <span>Hiện SĐT trong cột Tên khách</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">
                <input type="checkbox" data-merge="mergeTotalQty" ${NO.STATE.colVisibility.mergeTotalQty ? 'checked' : ''}>
                <span>Hiện SL trong cột Tổng tiền</span>
            </label>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0;">
            <button type="button" id="colResetDefaults" style="font-size:11px;background:transparent;border:1px solid #e5e7eb;color:#475569;padding:4px 10px;border-radius:6px;cursor:pointer;">Khôi phục mặc định</button>`;

        // Wire checkboxes
        panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const colKey = cb.dataset.col;
                const mergeKey = cb.dataset.merge;
                if (colKey) NO.STATE.colVisibility[colKey] = cb.checked;
                if (mergeKey) NO.STATE.colVisibility[mergeKey] = cb.checked;
                NO.saveColVisibility();
                NO.applyColumnVisibility();
                if (mergeKey) NO.renderRows(); // merge requires re-render to inject phone/qty
            });
        });
        panel.querySelector('#colResetDefaults')?.addEventListener('click', () => {
            NO.STATE.colVisibility = { ...NO.COL_DEFAULT };
            NO.saveColVisibility();
            NO.applyColumnVisibility();
            NO.renderRows();
            NO.renderColumnTogglePanel(); // re-render the panel itself
        });
    };

    NO.toggleColumnPanel = function toggleColumnPanel() {
        const panel = document.getElementById('columnTogglePanel');
        if (!panel) return;
        const visible = panel.style.display !== 'none';
        if (visible) {
            panel.style.display = 'none';
        } else {
            NO.renderColumnTogglePanel();
            panel.style.display = 'block';
        }
    };

    // ---------- DOM ----------
    NO.$ = (sel) => document.querySelector(sel);

    NO.tbody = () => NO.$('#ordersTbody');

    NO.counter = () => NO.$('#totalCounter');

    NO.searchCount = () => NO.$('#searchResultCount');

    NO.pag = () => NO.$('#pagination');

    NO.modal = () => NO.$('#editModal');

    NO.modalBody = () => NO.$('#editModalBody');

    NO.modalTitle = () => NO.$('#editModalTitle');

    NO.controlBar = () => NO.$('#controlBar');

    NO.toggleLabel = () => NO.$('#toggleControlBarLabel');

    // ---------- Helpers ----------
    NO.escapeHtml = function escapeHtml(s) {
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    };

    // Badge nhỏ inline cạnh product code — phân biệt nguồn add SP:
    //   'livestream' — drag từ WEB2-Pancake inventory panel (chốt live).
    //   'native'     — add trực tiếp từ picker trong modal sửa đơn.
    //   undefined    — SP cũ (trước migration), không hiển thị badge.
    NO._renderSourceBadge = function _renderSourceBadge(source) {
        if (source === 'livestream') {
            return `<span class="product-source-badge src-live" title="SP được kéo từ WEB2-Pancake (livestream)"><i data-lucide="radio"></i>Livestream</span>`;
        }
        if (source === 'native') {
            return `<span class="product-source-badge src-native" title="SP thêm trực tiếp từ modal sửa đơn"><i data-lucide="hand"></i>Trực tiếp</span>`;
        }
        return '';
    };

    NO.formatTimeSplit = function formatTimeSplit(ms) {
        if (!ms) return { date: '', hour: '' };
        const d = new Date(Number(ms));
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return { date: `${day}/${month}`, hour: `${hour}:${min}` };
    };

    NO.formatFullTime = function formatFullTime(ms) {
        if (!ms) return '';
        return new Date(Number(ms)).toLocaleString('vi-VN');
    };

    NO.STATUS_META = {
        draft: { label: 'Giỏ hàng', icon: 'shopping-cart' }, // chưa PBH = giỏ hàng
        confirmed: { label: 'Đơn hàng', icon: 'check' },
        cancelled: { label: 'Đã hủy', icon: 'x' },
        delivered: { label: 'Đã giao', icon: 'truck' },
    };

    NO.statusBadge = function statusBadge(status) {
        const meta = NO.STATUS_META[status] || { label: status || '—', icon: 'help-circle' };
        return `<span class="status-badge status-${status || 'draft'}">
            <i data-lucide="${meta.icon}"></i>${meta.label}
        </span>`;
    };

    // Gradient color for avatar placeholder (consistent per name)
    NO.avatarColor = function avatarColor(name) {
        const colors = [
            '#2a96ff',
            '#2a96ff',
            '#ec4899',
            '#ef4444',
            '#f59e0b',
            '#10b981',
            '#3b82f6',
            '#06b6d4',
            '#2a96ff',
        ];
        const s = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return colors[s % colors.length];
    };

    NO.firstChar = function firstChar(name) {
        return ((name || '?').trim().charAt(0) || '?').toUpperCase();
    };

    NO.WORKER_URL =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    // FB user id hợp lệ là chuỗi SỐ (PSID/global id). Các giá trị "rác" như
    // 'NEW_FB_DOES_NOT_EXIST', 'TEST_FB_*', '' → coi như KHÔNG có fb context.
    // Quan trọng: /api/fb-avatar trả SVG silhouette (HTTP 200) cho id không tồn
    // tại → img load OK, che mất chữ cái đầu + chặn hydrate avatar theo SĐT.
    NO._isRealFbId = function _isRealFbId(id) {
        return /^\d{5,}$/.test(String(id || '').trim());
    };

    // Render avatar: FB proxy image overlaid on colored initial; on error the
    // img element removes itself so the initial stays visible underneath.
    NO.renderAvatar = function renderAvatar(o) {
        const color = NO.avatarColor(o.customerName);
        const char = NO.firstChar(o.customerName);
        if (!NO._isRealFbId(o.fbUserId)) {
            return `<div class="cust-avatar" style="background:${color};">${char}</div>`;
        }
        // CF Worker /api/fb-avatar expects ?id= + &page= (not &page_id=).
        // Same signature as web2-pancake (SharedUtils.getAvatarUrl) + orders-report (tab1-table.js).
        const url = `${NO.WORKER_URL}/api/fb-avatar?id=${encodeURIComponent(o.fbUserId)}${o.fbPageId ? '&page=' + encodeURIComponent(o.fbPageId) : ''}`;
        return `
            <div class="cust-avatar" style="background:${color};">
                <span class="cust-avatar-initial">${char}</span>
                <img class="cust-avatar-img" src="${url}" alt="" loading="lazy"
                     onload="this.classList.add('loaded')"
                     onerror="this.remove()">
            </div>`;
    };

    NO.notify = function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else if (type === 'error' && window.Popup) window.Popup.error(msg);
        else console.log(`[${type}]`, msg);
    };

    // Hiển thị modal hướng dẫn user đăng nhập Facebook (business.facebook.com)
    // liên kết với Pancake — gọi khi gửi tin nhắn lỗi 24h hoặc extension chưa
    // ready. Một lần per page-load (flag tránh spam).
    NO._showFbBusinessLoginPrompt = function _showFbBusinessLoginPrompt(reasonText) {
        NO.notify(reasonText, 'error');
        if (window.__fbLoginPromptShown) return;
        window.__fbLoginPromptShown = true;
        if (window.Popup?.confirm) {
            window.Popup.confirm(
                reasonText +
                    '\n\nCác bước:\n' +
                    '1. Mở business.facebook.com ở tab mới\n' +
                    '2. Đăng nhập Facebook cùng quyền page với Pancake\n' +
                    '3. Quay lại đây và gửi lại',
                {
                    title: '🔐 Cần đăng nhập Facebook',
                    okText: 'Mở Facebook Business',
                    cancelText: 'Đóng',
                    type: 'warning',
                }
            ).then((ok) => {
                if (ok) {
                    window.open(
                        'https://business.facebook.com/latest/inbox/all',
                        '_blank',
                        'noopener,noreferrer'
                    );
                }
            });
            return;
        }
        // Fallback nếu KHÔNG có Popup (audit r9: trước đây vẫn gọi window.Popup.confirm
        // → TypeError 'reading confirm of undefined' vì nhánh này chạy CHÍNH KHI Popup
        // vắng). Dùng confirm() native — Popup không có nên native là lựa chọn duy nhất.
        if (confirm(reasonText + '\n\nMở business.facebook.com để đăng nhập?')) {
            window.open(
                'https://business.facebook.com/latest/inbox/all',
                '_blank',
                'noopener,noreferrer'
            );
        }
    };

    NO.w2pConfirm = function w2pConfirm(msg, opts) {
        return window.Popup.confirm(msg, opts);
    };

    NO.w2pAlert = function w2pAlert(msg, opts) {
        return window.Popup.alert(msg, opts);
    };

    // Admin check (chỉ ẩn/hiện UI — server vẫn gate độc lập). ƯU TIÊN role từ
    // Web2Auth (hệ auth Web 2.0); fallback loginindex_auth / userType (Web 1.0).
    // Mirror web2/shared/web2-sidebar.js `_isAdmin`. Dùng cho nút xoá đơn inbox rỗng.
    NO.isAdmin = function isAdmin() {
        try {
            const w2user = window.Web2Auth?.getStored ? window.Web2Auth.getStored()?.user : null;
            if (w2user && w2user.role) {
                return String(w2user.role).toLowerCase() === 'admin';
            }
            const authStr =
                localStorage.getItem('loginindex_auth') ||
                sessionStorage.getItem('loginindex_auth') ||
                '{}';
            const auth = JSON.parse(authStr);
            const userType = localStorage.getItem('userType') || '';
            return (
                auth.isAdmin === true ||
                auth.roleTemplate === 'admin' ||
                userType.startsWith('admin')
            );
        } catch {
            return false;
        }
    };
})();
