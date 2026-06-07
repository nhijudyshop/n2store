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
        // 2026-06-01: Tách cột "Ghi chú" thành 2:
        //   - customerComment (cũ note): auto-captured comment từ FB tpos-pancake, read-only
        //   - userNote: ghi chú NV tự ghi (size, đóng gói, etc) qua modal sửa đơn
        // Default both ẨN — user toggle qua "Hiện/ẩn cột" nếu cần.
        { key: 'customerComment', label: 'Khách comment' },
        { key: 'userNote', label: 'Ghi chú đơn' },
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
        customerComment: false, // (cũ 'note') auto FB comment — mặc định ẨN
        userNote: false, // ghi chú NV — mặc định ẨN
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
        // 2026-06-04: tab kênh đơn — 'web2_livestream' (mặc định) | 'web2_inbox'.
        // (2026-06-05: prefix web2_ — 'inbox'/'livestream' trần dễ nhầm Pancake/
        // icon/field source/hệ khác. Phải khớp data-channel ở index.html.)
        channel: 'web2_livestream',
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

    // Badge nhỏ inline cạnh product code — phân biệt nguồn add SP:
    //   'livestream' — drag từ TPOS-Pancake inventory panel (chốt live).
    //   'native'     — add trực tiếp từ picker trong modal sửa đơn.
    //   undefined    — SP cũ (trước migration), không hiển thị badge.
    function _renderSourceBadge(source) {
        if (source === 'livestream') {
            return `<span class="product-source-badge src-live" title="SP được kéo từ TPOS-Pancake (livestream)"><i data-lucide="radio"></i>Livestream</span>`;
        }
        if (source === 'native') {
            return `<span class="product-source-badge src-native" title="SP thêm trực tiếp từ modal sửa đơn"><i data-lucide="hand"></i>Trực tiếp</span>`;
        }
        return '';
    }

    // ---------- Livestream snapshot per product line ----------
    // SP có fbCommentId (kéo từ TPOS-Pancake) → fetch thumbnail snapshot từ
    // livestream tại đúng moment comment. Cache module-wide để khỏi re-fetch.
    // 3 trạng thái cache: undefined (chưa fetch), null (đã fetch nhưng không
    // có thumbnail bytea), object (có thumbnail self-served).
    const RENDER_API = 'https://n2store-fallback.onrender.com';
    const _snapCache = new Map(); // commentId → snap | null
    const _snapPendingFetch = new Set(); // commentIds đang/đã queue fetch
    let _snapFetchTimer = null;

    function _queueSnapFetch(commentId, onDone) {
        if (!commentId) return;
        if (_snapCache.has(commentId)) {
            onDone?.();
            return;
        }
        _snapPendingFetch.add(commentId);
        if (_snapFetchTimer) return;
        _snapFetchTimer = setTimeout(() => _flushSnapFetch(onDone), 150);
    }

    async function _flushSnapFetch(onDone) {
        _snapFetchTimer = null;
        const ids = Array.from(_snapPendingFetch);
        _snapPendingFetch.clear();
        if (!ids.length) return;
        try {
            const r = await fetch(
                `${RENDER_API}/api/livestream/snapshots/by-comment-ids?commentIds=${encodeURIComponent(ids.join(','))}`,
                { credentials: 'omit' }
            );
            const d = await r.json();
            const map = (d && d.byCommentId) || {};
            for (const id of ids) {
                const snap = map[id];
                if (
                    snap &&
                    typeof snap.thumbnailUrl === 'string' &&
                    snap.thumbnailUrl.includes('/api/livestream/snapshot/')
                ) {
                    _snapCache.set(id, snap);
                } else {
                    _snapCache.set(id, null);
                }
            }
        } catch (e) {
            console.warn('[native-orders] fetch snapshots fail:', e.message);
            for (const id of ids) {
                if (!_snapCache.has(id)) _snapCache.set(id, null);
            }
        }
        onDone?.();
    }

    // Render block "BÌNH LUẬN" read-only cho modal sửa đơn. Hiển thị `o.note`
    // (auto-captured FB comment với format `[time] [Page] message`) cạnh
    // thumbnail snapshot (nếu có) từ `o.fbCommentId`. Trả '' nếu không có
    // note (đơn tạo manual không qua FB).
    function _renderCommentReadonlyBlock(o) {
        const noteText = (o.note || '').trim();
        const cid = o.fbCommentId || null;
        if (!noteText && !cid) return '';
        // Queue fetch snap nếu có commentId → re-render modal khi xong (giống
        // line thumbnail flow). Find modal node sau khi flush + re-render block.
        if (cid && !_snapCache.has(cid)) {
            _queueSnapFetch(cid, () => {
                const slot = document.querySelector('#commentReadonlyBlock');
                if (!slot) return;
                const snap = _snapCache.get(cid);
                const thumb = snap ? _renderCommentThumbHtml(snap) : '';
                const thumbSlot = slot.querySelector('.comment-thumb-slot');
                if (thumbSlot) thumbSlot.innerHTML = thumb;
            });
        }
        const snap = cid ? _snapCache.get(cid) : null;
        const thumbHtml = snap ? _renderCommentThumbHtml(snap) : '';
        const labelText = noteText ? 'Bình luận khách' : 'Bình luận khách (chưa có)';
        return `
            <div class="field-row" id="commentReadonlyBlock">
                <label>${labelText}</label>
                <div class="comment-readonly-wrap">
                    <div class="comment-thumb-slot">${thumbHtml}</div>
                    <div class="comment-readonly-text" title="Nội dung comment auto-lưu từ FB — read-only">${escapeHtml(noteText) || '<em style="color:#94a3b8;">(không có nội dung)</em>'}</div>
                </div>
            </div>`;
    }

    function _renderCommentThumbHtml(snap) {
        if (!snap?.thumbnailUrl) return '';
        const url = snap.thumbnailUrl;
        const offsetText =
            Number.isFinite(snap.offsetSeconds) && snap.offsetSeconds >= 0
                ? `${Math.floor(snap.offsetSeconds / 60)}m${snap.offsetSeconds % 60}s`
                : '';
        const liveUrl = snap.livestreamUrl || '';
        const tip = `Thumbnail livestream${offsetText ? ' @ ' + offsetText : ''} · Click để xem lớn`;
        return `<img src="${escapeHtml(url)}"
                     alt=""
                     loading="lazy"
                     class="comment-snap-thumb"
                     data-snap-url="${escapeHtml(url)}"
                     data-snap-live-url="${escapeHtml(liveUrl)}"
                     data-snap-offset="${offsetText}"
                     title="${escapeHtml(tip)}"
                     onclick="NativeOrdersApp.openSnapLightbox(this)" />`;
    }

    function _renderLineSnapThumb(commentId) {
        if (!commentId) return '';
        const snap = _snapCache.get(commentId);
        if (!snap) return '';
        const url = snap.thumbnailUrl;
        const offsetText =
            Number.isFinite(snap.offsetSeconds) && snap.offsetSeconds >= 0
                ? `${Math.floor(snap.offsetSeconds / 60)}m${snap.offsetSeconds % 60}s`
                : '';
        const liveUrl = snap.livestreamUrl || '';
        const tipParts = ['Thumbnail từ livestream'];
        if (offsetText) tipParts.push(`@ ${offsetText}`);
        tipParts.push('Click để xem lớn');
        return `<img src="${escapeHtml(url)}"
                     alt=""
                     loading="lazy"
                     class="line-snap-thumb"
                     data-snap-url="${escapeHtml(url)}"
                     data-snap-live-url="${escapeHtml(liveUrl)}"
                     data-snap-offset="${offsetText}"
                     title="${escapeHtml(tipParts.join(' · '))}"
                     onclick="NativeOrdersApp.openSnapLightbox(this)" />`;
    }

    // Lightbox đơn giản cho snapshot — full-screen overlay click-to-close.
    function openSnapLightbox(imgEl) {
        if (!imgEl?.dataset) return;
        const url = imgEl.dataset.snapUrl;
        if (!url) return;
        const liveUrl = imgEl.dataset.snapLiveUrl || '';
        const offset = imgEl.dataset.snapOffset || '';
        const existing = document.querySelector('.native-snap-lightbox');
        if (existing) existing.remove();
        const lb = document.createElement('div');
        lb.className = 'native-snap-lightbox';
        lb.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;';
        lb.innerHTML = `
            <img src="${escapeHtml(url)}" alt=""
                 style="max-width:92vw;max-height:78vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.6);cursor:default;background:#111;" />
            <div style="margin-top:14px;display:flex;align-items:center;gap:12px;color:#fff;font-size:13px;">
                ${offset ? `<span style="background:rgba(255,255,255,0.15);padding:4px 10px;border-radius:6px;">@ ${escapeHtml(offset)}</span>` : ''}
                ${liveUrl ? `<a href="${escapeHtml(liveUrl)}" target="_blank" rel="noopener" style="background:#3b82f6;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;">▶ Xem live tại giây này</a>` : ''}
                <button type="button" class="snap-lb-close" style="background:#475569;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;">Đóng</button>
            </div>
        `;
        const close = () => lb.remove();
        lb.addEventListener('click', (e) => {
            if (e.target === lb || e.target.classList?.contains('snap-lb-close')) close();
        });
        document.body.appendChild(lb);
        // Stop click bubbling on inner controls
        lb.querySelectorAll('img, a').forEach((el) => {
            el.addEventListener('click', (e) => e.stopPropagation());
        });
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
        confirmed: { label: 'Đơn hàng', icon: 'check' },
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

    // ====================================================================
    // Customer side-panel — slide-in từ phải viewport. Hover avatar 500ms
    // → fetch + slide-in. Mouse rời avatar VÀ panel → 250ms delay → ẩn.
    // KHÔNG overlap row content (panel ở right edge, fixed position).
    // 3-source data: Pancake conversation + customers table + TPOS Partner live.
    // ====================================================================
    const _custPanelCache = new Map(); // fbUserId → { data, ts }
    const _CUST_PANEL_TTL = 15 * 60 * 1000;
    let _custPanelEl = null;
    let _custPanelShowTimer = null;
    let _custPanelHideTimer = null;
    let _custPanelAbort = null;
    let _custPanelToken = 0;
    let _custPanelActiveFbId = null;

    function _ensureCustPanelEl() {
        if (_custPanelEl) return _custPanelEl;
        const el = document.createElement('aside');
        el.id = 'nativeCustSidePanel';
        el.className = 'native-cust-panel';
        el.setAttribute('aria-hidden', 'true');
        // Hover panel → keep visible
        el.addEventListener('mouseenter', () => {
            clearTimeout(_custPanelHideTimer);
        });
        el.addEventListener('mouseleave', () => {
            _scheduleCustPanelHide(250);
        });
        document.body.appendChild(el);
        _custPanelEl = el;
        return el;
    }

    function _showCustPanel() {
        const el = _ensureCustPanelEl();
        el.classList.add('is-open');
        el.setAttribute('aria-hidden', 'false');
    }

    function _hideCustPanel() {
        if (!_custPanelEl) return;
        _custPanelEl.classList.remove('is-open');
        _custPanelEl.setAttribute('aria-hidden', 'true');
        _custPanelActiveFbId = null;
    }

    function _scheduleCustPanelHide(delay = 250) {
        clearTimeout(_custPanelHideTimer);
        _custPanelHideTimer = setTimeout(_hideCustPanel, delay);
    }

    function _renderCustPanelContent({ loading, data, error, fallback }) {
        const el = _ensureCustPanelEl();
        if (loading) {
            el.innerHTML = `
                <header class="ncp-head">
                    <div class="ncp-skeleton-avatar"></div>
                    <div style="flex:1;">
                        <div class="ncp-skeleton-line" style="width:60%;"></div>
                        <div class="ncp-skeleton-line" style="width:40%;margin-top:6px;height:10px;"></div>
                    </div>
                    <button class="ncp-close" type="button" aria-label="Đóng">×</button>
                </header>
                <div class="ncp-body">
                    <div class="ncp-skeleton-block"></div>
                    <div class="ncp-skeleton-block" style="margin-top:8px;height:60px;"></div>
                </div>
            `;
            el.querySelector('.ncp-close')?.addEventListener('click', _hideCustPanel);
            return;
        }
        if (error) {
            el.innerHTML = `
                <header class="ncp-head">
                    <div style="flex:1;font-weight:600;color:#dc2626;">Lỗi tải dữ liệu</div>
                    <button class="ncp-close" type="button" aria-label="Đóng">×</button>
                </header>
                <div class="ncp-body">
                    <div style="color:#dc2626;font-size:13px;">${escapeHtml(error)}</div>
                    <div style="margin-top:10px;color:#6b7280;font-size:12.5px;">${escapeHtml(fallback?.name || '—')} · ${escapeHtml(fallback?.phone || '')}</div>
                </div>
            `;
            el.querySelector('.ncp-close')?.addEventListener('click', _hideCustPanel);
            return;
        }
        const d = data || {};
        const name = d.name || fallback?.name || '—';
        const phone = d.phone || fallback?.phone || '';
        const avatar = d.avatar || null;
        const tags = Array.isArray(d.tags) ? d.tags : [];
        const tposAddress = d.tposAddress;
        const tposStatus = d.tposStatus;
        const tposTotalSpent = d.tposTotalSpent != null ? Number(d.tposTotalSpent) : null;
        const tposReturned = d.tposReturnedOrders;
        const messageCount = d.message_count ?? null;
        const orderCount = d.order_count ?? null;
        const successOrders = d.success_order_count ?? null;
        const lastInteraction = d.last_interaction_at;
        const lastSent = d.last_sent_by?.name || null;
        const note = d.note;
        const formatTime = (t) => {
            if (!t) return '';
            const dt = new Date(t);
            return Number.isFinite(dt.getTime()) ? dt.toLocaleString('vi-VN') : '';
        };
        const initial = (name || '?').charAt(0).toUpperCase();
        el.innerHTML = `
            <header class="ncp-head">
                ${avatar ? `<img class="ncp-avatar" src="${escapeHtml(avatar)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ncp-avatar ncp-avatar-fallback',textContent:'${escapeHtml(initial)}'}))">` : `<div class="ncp-avatar ncp-avatar-fallback">${escapeHtml(initial)}</div>`}
                <div style="flex:1;min-width:0;">
                    <div class="ncp-name">${escapeHtml(name)}</div>
                    ${phone ? `<div class="ncp-phone">📞 ${escapeHtml(phone)}</div>` : ''}
                    ${tposStatus && tposStatus !== 'Bình thường' ? `<div style="margin-top:4px;"><span class="ncp-status-bad">${escapeHtml(tposStatus)}</span></div>` : ''}
                </div>
                <button class="ncp-close" type="button" aria-label="Đóng">×</button>
            </header>
            <div class="ncp-body">
                ${
                    tposAddress
                        ? `<section class="ncp-section">
                    <div class="ncp-section-label">📍 Địa chỉ (TPOS)</div>
                    <div class="ncp-section-value">${escapeHtml(tposAddress)}</div>
                </section>`
                        : ''
                }
                ${
                    tags.length
                        ? `<section class="ncp-section">
                    <div class="ncp-section-label">🏷️ Tags</div>
                    <div class="ncp-tags">${tags
                        .slice(0, 10)
                        .map(
                            (t) =>
                                `<span class="ncp-tag">${escapeHtml(t.text || t.name || t)}</span>`
                        )
                        .join('')}</div>
                </section>`
                        : ''
                }
                <section class="ncp-section">
                    <div class="ncp-section-label">📊 Hoạt động</div>
                    <div class="ncp-stats">
                        ${messageCount !== null ? `<div class="ncp-stat"><span class="ncp-stat-num">${messageCount}</span><span class="ncp-stat-lbl">tin nhắn</span></div>` : ''}
                        ${orderCount !== null ? `<div class="ncp-stat"><span class="ncp-stat-num">${orderCount}</span><span class="ncp-stat-lbl">đơn (Pancake)</span></div>` : ''}
                        ${successOrders !== null ? `<div class="ncp-stat"><span class="ncp-stat-num" style="color:#16a34a;">${successOrders}</span><span class="ncp-stat-lbl">chốt thành công</span></div>` : ''}
                        ${tposReturned != null && tposReturned > 0 ? `<div class="ncp-stat"><span class="ncp-stat-num" style="color:#dc2626;">${tposReturned}</span><span class="ncp-stat-lbl">đơn trả</span></div>` : ''}
                    </div>
                    ${tposTotalSpent && tposTotalSpent > 0 ? `<div style="margin-top:8px;padding:6px 8px;background:#f0fdf4;border-radius:5px;color:#166534;font-size:12.5px;">💰 Tổng đã chi: <strong>${tposTotalSpent.toLocaleString('vi-VN')}đ</strong></div>` : ''}
                </section>
                ${
                    lastInteraction
                        ? `<section class="ncp-section">
                    <div class="ncp-section-label">⏱️ Tương tác cuối</div>
                    <div class="ncp-section-value">${escapeHtml(formatTime(lastInteraction))}${lastSent ? ` <span style="color:#9ca3af;">· NV: ${escapeHtml(lastSent)}</span>` : ''}</div>
                </section>`
                        : ''
                }
                ${
                    note
                        ? `<section class="ncp-section ncp-section-note">
                    <div class="ncp-section-label">📝 Ghi chú Pancake</div>
                    <div class="ncp-section-value">${escapeHtml(note)}</div>
                </section>`
                        : ''
                }
                <footer class="ncp-foot">
                    Nguồn: Pancake (live) + TPOS Partner (địa chỉ live) + Customer 360 (lịch sử)
                </footer>
            </div>
        `;
        el.querySelector('.ncp-close')?.addEventListener('click', _hideCustPanel);
    }

    async function _fetchCustomerPanelData(fbUserId, fbPageId, phone, token) {
        const cached = _custPanelCache.get(fbUserId);
        if (cached && Date.now() - cached.ts < _CUST_PANEL_TTL) return cached.data;
        if (_custPanelAbort) {
            try {
                _custPanelAbort.abort();
            } catch {}
        }
        _custPanelAbort = new AbortController();
        const signal = _custPanelAbort.signal;
        try {
            const pancakeUrl = `${WORKER_URL}/api/pancake/conversations?pages[${encodeURIComponent(fbPageId)}]=0&from_psid=${encodeURIComponent(fbUserId)}&limit=1&mode=OR&unread_first=false`;
            const customerUrl = phone
                ? `${WORKER_URL}/api/web2/customers/search?search=${encodeURIComponent(phone)}&limit=1`
                : null;
            const tposLiveUrl = phone
                ? `${WORKER_URL}/api/web2/customer-tpos/${encodeURIComponent(phone)}`
                : null;
            const [pancakeD, customerD, tposLiveD] = await Promise.all([
                fetch(pancakeUrl, { credentials: 'include', signal })
                    .then((r) => r.json())
                    .catch(() => null),
                customerUrl
                    ? fetch(customerUrl, { credentials: 'include', signal })
                          .then((r) => r.json())
                          .catch(() => null)
                    : Promise.resolve(null),
                tposLiveUrl
                    ? fetch(tposLiveUrl, { credentials: 'include', signal })
                          .then((r) => r.json())
                          .catch(() => null)
                    : Promise.resolve(null),
            ]);
            if (token !== _custPanelToken) return null;
            const conv = (pancakeD?.conversations || [])[0] || null;
            const tposCust = (customerD?.customers || customerD?.data || [])[0] || null;
            const tposLive = tposLiveD?.customer || null;
            const cust = conv ? (conv.customers || [])[0] || conv.from || {} : {};
            const enriched = {
                name: tposLive?.name || cust.name || conv?.from?.name || tposCust?.name,
                phone:
                    conv?.recent_phone_numbers?.[0]?.phone_number ||
                    tposLive?.phone ||
                    tposCust?.phone ||
                    phone,
                avatar: cust.avatar_url || cust.avatar,
                tags: conv?.tags || [],
                last_interaction_at: conv?.last_customer_interactive_at || conv?.updated_at,
                message_count: conv?.message_count,
                last_sent_by: conv?.last_sent_by,
                success_order_count: cust.success_order_count,
                order_count: cust.order_count,
                note: conv?.extra_info?.note,
                tposAddress: tposLive?.address || tposCust?.address,
                tposCustomerId: tposLive?.id || tposCust?.id,
                tposStatus: tposLive?.status || tposCust?.status,
                tposReturnedOrders: tposCust?.returned_orders,
                tposTotalSpent: tposCust?.total_spent,
            };
            _custPanelCache.set(fbUserId, { data: enriched, ts: Date.now() });
            return enriched;
        } catch (e) {
            if (e.name === 'AbortError') return null;
            throw e;
        }
    }

    function _onCustAvatarEnter(target) {
        const fbUserId = target.dataset.fbUserId;
        const fbPageId = target.dataset.fbPageId;
        const fallback = {
            name: target.dataset.customerName,
            phone: target.dataset.customerPhone,
        };
        if (!fbUserId) return;
        clearTimeout(_custPanelHideTimer);
        // Nếu panel đang mở với CÙNG KH → no-op
        if (_custPanelActiveFbId === fbUserId && _custPanelEl?.classList.contains('is-open')) {
            return;
        }
        clearTimeout(_custPanelShowTimer);
        // 500ms hover delay — buộc user phải có intent rõ ràng
        _custPanelShowTimer = setTimeout(async () => {
            const token = ++_custPanelToken;
            _custPanelActiveFbId = fbUserId;
            _showCustPanel();
            const cached = _custPanelCache.get(fbUserId);
            if (cached && Date.now() - cached.ts < _CUST_PANEL_TTL) {
                _renderCustPanelContent({ data: cached.data, fallback });
                return;
            }
            _renderCustPanelContent({ loading: true });
            try {
                const data = await _fetchCustomerPanelData(
                    fbUserId,
                    fbPageId,
                    fallback.phone,
                    token
                );
                if (token !== _custPanelToken) return;
                _renderCustPanelContent({ data, fallback });
            } catch (e) {
                if (token !== _custPanelToken) return;
                _renderCustPanelContent({ error: e.message, fallback });
            }
        }, 500);
    }

    function _onCustAvatarLeave() {
        clearTimeout(_custPanelShowTimer);
        // 250ms grace period — cho user di chuột vào panel.
        // Mouseenter trên panel → cancel timer (panel listener handle).
        _scheduleCustPanelHide(250);
    }

    // 2026-06-01: Thủ công lấy info KH từ TPOS qua Facebook_ASUserId
    // (cho đơn từ tpos-pancake có FB ID nhưng rỗng phone/address/name).
    // Endpoint backend (web2-customer-tpos.js) tự upsert customers table + link
    // fb_id, sau đó PATCH native_order với name/phone/address để row cập nhật.
    // UI-first: badge "Đang lấy..." optimistic, lỗi → rollback, success → render.
    async function fetchCustomerFromTpos(code, fbUserId) {
        if (!fbUserId) {
            notify('Đơn này chưa có FB ID — không lookup được', 'warning');
            return;
        }
        const order = STATE.orders.find((x) => x.code === code);
        if (!order) {
            notify(`Không tìm thấy đơn ${code}`, 'error');
            return;
        }

        const apply = () => {
            // Mark đang loading bằng cách disable button (render attribute)
            const btn = document.querySelector(`button.tpos-fetch-tpos-btn[onclick*="'${code}'"]`);
            if (btn) {
                btn.disabled = true;
                btn.innerHTML =
                    '<i data-lucide="loader-2" style="width:11px;height:11px;animation:spin 1s linear infinite;"></i> Đang lấy...';
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }
        };

        const run = async () => {
            // Pass crmTeamId từ order — backend cần để query chatomni/info/{crmTeamId}_{fbUserId}
            const crmTeamId = order?.crmTeamId || '';
            const lookupUrl =
                `${WORKER_URL}/api/web2/customer-tpos/by-fb-id/${encodeURIComponent(fbUserId)}` +
                (crmTeamId ? `?crmTeamId=${encodeURIComponent(crmTeamId)}` : '');
            const r = await fetch(lookupUrl, { credentials: 'include' });
            const data = await r.json().catch(() => ({}));
            if (!r.ok || data.success === false) {
                throw new Error(data.error || `Lookup TPOS lỗi ${r.status}`);
            }
            const tposCust = data.customer;
            if (!tposCust) {
                throw new Error(
                    'TPOS không có đơn nào với FB ID này — KH chưa từng order qua TPOS'
                );
            }
            // PATCH native_order với info mới (chỉ fill field còn rỗng,
            // không ghi đè data user đã sửa thủ công).
            const patchFields = {};
            if (!order.customerName && tposCust.name) patchFields.customerName = tposCust.name;
            if (!order.phone && tposCust.phone) patchFields.phone = tposCust.phone;
            if (!order.address && tposCust.address) patchFields.address = tposCust.address;
            if (Object.keys(patchFields).length === 0) {
                return { tposCust, patchedOrder: order, noop: true };
            }
            const resp = await window.NativeOrdersApi.update(code, patchFields);
            return { tposCust, patchedOrder: resp?.order || null };
        };

        const onSuccess = (result) => {
            if (result?.noop) {
                notify('TPOS không có info mới — đơn đã đủ data', 'info');
                renderRows(); // re-enable button
                return;
            }
            if (result?.patchedOrder) {
                const idx = STATE.orders.findIndex((x) => x.code === code);
                if (idx !== -1) STATE.orders[idx] = result.patchedOrder;
                const filled = [];
                if (result.tposCust?.name && !order.customerName) filled.push('tên');
                if (result.tposCust?.phone && !order.phone) filled.push('SĐT');
                if (result.tposCust?.address && !order.address) filled.push('địa chỉ');
                notify(
                    filled.length ? `Đã lấy ${filled.join(' + ')} từ TPOS` : 'Đã sync với TPOS',
                    'success'
                );
            } else {
                notify('TPOS trả về rỗng', 'warning');
            }
            renderRows();
            // Invalidate panel cache cho fbUserId này để hover tiếp sau hiện data mới
            if (_custPanelCache?.has(fbUserId)) _custPanelCache.delete(fbUserId);
        };

        const rollback = () => {
            // Re-render để khôi phục button (apply() đã tạm disable button DOM)
            renderRows();
        };

        // KHÔNG dùng successMsg — Web2Optimistic fire nó NGAY sau apply() (trước backend).
        // Lấy TPOS cần notify thực sự khi backend confirm có data → notify trong onSuccess.
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => null,
                apply,
                run,
                onSuccess,
                rollback,
                errLabel: `lấy TPOS cho ${code}`,
            });
        } else {
            apply();
            try {
                const result = await run();
                onSuccess(result);
            } catch (e) {
                rollback();
                notify('Lỗi lấy TPOS: ' + e.message, 'error');
            }
        }
    }

    // Hiển thị modal hướng dẫn user đăng nhập Facebook (business.facebook.com)
    // liên kết với Pancake — gọi khi gửi tin nhắn lỗi 24h hoặc extension chưa
    // ready. Một lần per page-load (flag tránh spam).
    function _showFbBusinessLoginPrompt(reasonText) {
        notify(reasonText, 'error');
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
        // Fallback nếu không có Popup
        if (confirm(reasonText + '\n\nMở business.facebook.com để đăng nhập?')) {
            window.open(
                'https://business.facebook.com/latest/inbox/all',
                '_blank',
                'noopener,noreferrer'
            );
        }
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
                const sourceBadge = _renderSourceBadge(l.source);
                return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${img}</td>
                    <td>
                        <div class="expand-name">${escapeHtml(l.name || '—')}</div>
                        <div class="expand-code">${escapeHtml(l.productCode || '')}${sourceBadge}</div>
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
            cancelled: { label: 'Đã hủy', cls: 'cancelled' },
            delivered: { label: 'Đã giao', cls: 'delivered' },
        };
        const m = map[s] || { label: s || '—', cls: '' };
        return `<span class="tpos-status-text ${m.cls}">${m.label}</span>`;
    }

    // 2026-06-04: badge phái sinh từ PBH liên kết (server /load gắn pbh* fields):
    //   - "Đã thanh toán" khi COD còn lại = 0 (ví đủ trả hết / đã thanh toán).
    //   - "Đã đối soát" khi PBH đã đóng gói xong (fulfillment ∈ packed/shipped/delivered).
    const RECONCILED_STATES = new Set(['packed', 'shipped', 'delivered']);
    function orderDerivedBadges(o) {
        const out = [];
        if (/pbh\s*shop|shop/i.test(o.pbhCarrierName || '')) {
            out.push(`<span class="no-shop-badge" title="Bán tại shop">🏪 PBH SHOP</span>`);
        }
        const paid = Number(o.pbhTotal) > 0 && Number(o.pbhResidual) <= 0;
        if (paid) {
            out.push(
                `<span class="no-paid-badge" title="Ví đủ trả / đã thanh toán — COD còn lại 0₫">✓ Đã thanh toán</span>`
            );
        }
        if (RECONCILED_STATES.has(o.pbhFulfillmentState)) {
            out.push(
                `<span class="no-reconciled-badge" title="Đã đối soát đóng gói (${escapeHtml(o.pbhFulfillmentState)})">📦 Đã đối soát</span>`
            );
        }
        // 2026-06-05: cờ "KH báo đã CK" (web2_payment_signals). Soft marker — KH
        // nhắn "CK XONG"/"ĐÃ CK" trong inbox Pancake, CHƯA phải xác nhận tiền thật.
        if (o.ckSignal) {
            const confirmed = o.ckSignal.status === 'confirmed';
            // Click badge → mở web2-ck-review (đối chiếu GD SePay + duyệt). Prefill
            // SĐT/tên từ đơn (data-ck-*). Pending mới clickable; confirmed chỉ xem.
            const clickable = o.ckSignal.id
                ? ` data-ck-review="${o.ckSignal.id}" data-ck-phone="${escapeHtml(o.phone || '')}" data-ck-name="${escapeHtml(o.customerName || '')}" style="cursor:pointer"`
                : '';
            out.push(
                `<span class="no-ck-badge${confirmed ? ' ck-confirmed' : ''}"${clickable} title="KH báo đã chuyển khoản (${escapeHtml(o.ckSignal.keyword || '')}${confirmed ? ' — đã xác nhận' : ' — bấm để đối chiếu & duyệt'}). Đối soát tiền vẫn qua SePay.">💸 KH báo đã CK</span>`
            );
        }
        // [2026-06-05] Số lần in bill — cảnh báo tránh in trùng (soạn hàng lặp).
        const pc = Number(o.printCount) || 0;
        if (pc > 0) {
            out.push(
                `<span class="no-print-badge" title="Bill/Phiếu soạn hàng đã in ${pc} lần — tránh in lại gây soạn hàng trùng" style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;font-size:11px;font-weight:700;padding:0 5px;border-radius:999px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;">${pc}</span>`
            );
        }
        return out.length ? `<div class="no-derived-badges">${out.join('')}</div>` : '';
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

    // STT hiển thị CHUẨN (dùng chung list + in bill — phải khớp nhau):
    //   - "1 + 2" nếu đơn GỘP (mergedDisplayStt array length > 1)
    //   - "31-2" nếu đơn TÁCH (splitIndex > 0)
    //   - campaignStt (per-campaign 1..n) cho đơn thường — KHÔNG dùng displayStt
    //     (global sequence) vì list hiển thị campaignStt → bill phải giống.
    function computeOrderStt(o) {
        if (Array.isArray(o.mergedDisplayStt) && o.mergedDisplayStt.length > 1) {
            return o.mergedDisplayStt
                .map((n) => parseInt(n, 10))
                .filter(Number.isFinite)
                .sort((a, b) => a - b)
                .join(' + ');
        }
        const base = o.campaignStt ?? o.displayStt ?? o.sessionIndex ?? '';
        return o.splitIndex && o.splitIndex > 0 ? `${base}-${o.splitIndex}` : base;
    }

    // ============================================================
    // Phương thức giao hàng — auto-detect (offline) + lưu lại + chỉnh tay
    // Hiện badge ở cột Địa chỉ; click để đổi tay; đổi địa chỉ → tự nhận lại
    // (trừ khi đã chỉnh tay). value/label lưu vào native_orders qua PATCH.
    // ============================================================
    let _deliveryOptsCache = null;
    function _deliveryOpts() {
        const DMP = window.DeliveryMethodPicker;
        if (!DMP) return [];
        if (_deliveryOptsCache) return _deliveryOptsCache;
        // OPTIONS hardcoded sẵn (đồng bộ với dropdown tạo PBH). Nạp async để
        // đồng bộ option backend nếu admin có override.
        _deliveryOptsCache = DMP.OPTIONS || [];
        if (DMP.getOptionsAsync) {
            DMP.getOptionsAsync()
                .then((opts) => {
                    if (Array.isArray(opts) && opts.length) _deliveryOptsCache = opts;
                })
                .catch(() => {});
        }
        return _deliveryOptsCache;
    }
    // Nhận diện offline (sync) — { value, label, short, confidence, note } | null
    function _detectDelivery(address) {
        const DMP = window.DeliveryMethodPicker;
        if (!DMP || !DMP.pickOffline) return null;
        const r = DMP.pickOffline(address || '', _deliveryOpts());
        if (!r || !r.option) return null;
        return {
            value: r.option.value,
            label: r.option.label,
            short: r.option.short || r.option.label,
            confidence: r.confidence,
            note: r.note || '',
        };
    }
    function _deliveryShort(value, label) {
        const opt = _deliveryOpts().find((o) => o.value === value);
        return (opt && (opt.short || opt.label)) || label || value || '';
    }
    // Codes đã chốt giá trị (đã lưu/đã chọn) — không lazy-persist nữa.
    const _deliveryPersisted = new Set();
    // Build badge HTML cho cột địa chỉ. Ưu tiên giá trị đã lưu; nếu chưa có →
    // detect offline để HIỂN THỊ (không tự PATCH, tránh SSE storm cross-tab —
    // chỉ lưu khi user chọn tay hoặc đổi địa chỉ). Click badge → menu đổi tay.
    function _deliveryBadgeHtml(o) {
        if (!window.DeliveryMethodPicker) return '';
        let value = o.deliveryMethod || null;
        let label = o.deliveryMethodLabel || null;
        const manual = o.deliveryMethodManual === true;
        let cls = 'is-saved';
        let title = 'Phương thức giao hàng đã lưu — bấm để đổi';
        if (!value) {
            const det = _detectDelivery(o.address || '');
            if (det) {
                value = det.value;
                label = det.label;
                cls = det.confidence === 'high' ? 'is-auto-ok' : 'is-auto-low';
                title = 'Tự nhận diện: ' + (det.note || det.label) + ' — bấm để đổi tay (sẽ lưu)';
            }
        } else if (manual) {
            cls = 'is-manual';
            title = 'Đã chọn tay — bấm để đổi';
        }
        if (!value) return '';
        const short = escapeHtml(_deliveryShort(value, label));
        const icon = manual ? 'hand' : 'truck';
        return `<span class="no-delivery-badge ${cls}" title="${escapeHtml(title)}"
            onclick="event.stopPropagation();NativeOrdersApp.openDeliveryMenu('${escapeHtml(o.code)}', this)">
            <i data-lucide="${icon}" style="width:10px;height:10px;"></i>${short}${manual ? ' ✎' : ''}
        </span>`;
    }

    // Build HTML cho 1 order — return string: main row + (optional) expand row.
    // Tách ra để renderRows có thể diff per-code và chỉ thay row thay đổi.
    function _buildOrderHtml(o) {
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
        // Hiển thị STT:
        //   - 2026-06-02 (user spec): ưu tiên campaignStt (per-campaign 1..n, reset
        //     theo campaign group key) thay vì displayStt (global sequence không bao
        //     giờ reset → "1 đơn STT 7" sau khi xóa data cũ → confusing).
        //   - "1 + 2" nếu là đơn gộp (mergedDisplayStt array length > 1)
        //   - "31-2" nếu là đơn tách (splitIndex > 0) — chia sẻ STT với các đơn cùng split family
        //   - "31" cho đơn thường
        const sttValue = computeOrderStt(o);
        // is-split-family: visually nhóm các đơn cùng display_stt với split_index > 0.
        // splitTopcap / splitBotcap để border-radius hợp lý: 33-1 chỉ bo trên, 33-2 chỉ bo dưới.
        const splitClass = o.splitIndex && o.splitIndex > 0 ? ' is-split-family' : '';
        const mainRow = `
                <tr class="order-row${splitClass} ${isExpanded ? 'is-expanded' : ''}" data-code="${escapeHtml(o.code)}"
                    data-stt-group="${o.splitIndex && o.splitIndex > 0 ? escapeHtml(String(o.displayStt)) : ''}"
                    data-split-index="${o.splitIndex || 0}"
                    data-fb-user-id="${escapeHtml(o.fbUserId || '')}"
                    data-fb-page-id="${escapeHtml(o.fbPageId || '')}"
                    onclick="NativeOrdersApp.toggleExpand('${escapeHtml(o.code)}')" style="cursor:pointer;">
                    <td class="col-check" onclick="event.stopPropagation();">
                        <div class="tpos-check-stt">
                            <input type="checkbox" class="row-check" value="${escapeHtml(o.code)}">
                            <span class="tpos-row-stt">${sttValue}</span>
                            <!-- 2026-06-01: trạng thái đơn moved into STT cell (per user) -->
                            <div class="tpos-row-status-inline">${tposStatusText(o.status)}</div>
                            ${orderDerivedBadges(o)}
                        </div>
                    </td>
                    <td class="col-actions" onclick="event.stopPropagation();">
                        <div class="tpos-row-actions tpos-row-actions-grid">
                            <button class="tpos-btn tpos-btn-primary tpos-btn-xs" title="Sửa"
                                onclick="event.stopPropagation();NativeOrdersApp.openEdit('${escapeHtml(o.code)}')">
                                <i data-lucide="pencil" style="width:12px;height:12px;"></i>
                            </button>
                            ${(() => {
                                // 3-state action buttons (slot sau "Sửa"):
                                //   - cancelled: nút "Tạo PBH" (sẽ tạo PBH mới số HĐ mới, không đụng PBH cũ)
                                //   - confirmed: KHÔNG có button trong slot này. "Huỷ PBH" (cancelPbh)
                                //     đã bỏ vì trùng chức năng với "Huỷ đơn" (cancelOrder, slot cuối)
                                //     khác mỗi scope: cancelOrder huỷ cả đơn web + PBH + restock,
                                //     cancelPbh chỉ huỷ PBH giữ đơn web — UX confusing, user yêu cầu
                                //     gom về 1 nút huỷ duy nhất (cancelOrder).
                                //     Muốn thêm PBH ở confirmed → "Tách đơn" tạo native-order con.
                                //   - draft: chỉ createPbh (user spec 2026-06-02: bỏ nút
                                //     "Xác nhận đơn" — workflow gom lại 1 bước, click Tạo
                                //     PBH = vừa confirm vừa tạo PBH luôn + deduct stock).
                                if (o.status === 'cancelled') {
                                    return `<button class="tpos-btn tpos-btn-success tpos-btn-xs" title="Tạo PBH mới (đơn đã huỷ — sẽ tạo PBH mới với số HĐ mới, KHÔNG đụng PBH cũ)"
                                onclick="event.stopPropagation();NativeOrdersApp.createPbh('${escapeHtml(o.code)}')">
                                <i data-lucide="receipt" style="width:12px;height:12px;"></i>
                            </button>`;
                                }
                                if (o.status === 'confirmed') {
                                    // 2026-06-04: slot 2 cho đơn confirmed = nút Huỷ đơn (X) — dời
                                    // lên đây theo yêu cầu (bỏ In PBH per-row vì trùng "In bill").
                                    return `<button class="tpos-btn tpos-btn-warning tpos-btn-xs" title="Huỷ đơn (PBH liên kết tự cancel + restock)"
                                onclick="event.stopPropagation();NativeOrdersApp.cancelOrder('${escapeHtml(o.code)}')">
                                <i data-lucide="x-octagon" style="width:12px;height:12px;"></i>
                            </button>`;
                                }
                                // draft (default)
                                return `<button class="tpos-btn tpos-btn-success tpos-btn-xs" title="Tạo PBH"
                                onclick="event.stopPropagation();NativeOrdersApp.createPbh('${escapeHtml(o.code)}')">
                                <i data-lucide="receipt" style="width:12px;height:12px;"></i>
                            </button>`;
                            })()}
                            ${
                                o.customerId
                                    ? `<button class="tpos-btn tpos-btn-default tpos-btn-xs" title="Khách hàng 360° (id ${o.customerId})" style="color:#7c3aed;"
                                onclick="event.stopPropagation();NativeOrdersApp.openCustomer(${o.customerId})">
                                <i data-lucide="user-circle" style="width:12px;height:12px;"></i>
                            </button>`
                                    : '<span class="tpos-action-placeholder"></span>'
                            }
                            ${
                                o.status === 'draft' || o.status === 'confirmed'
                                    ? `<button class="tpos-btn tpos-btn-default tpos-btn-xs" title="Tách đơn (tạo đơn mới ${sttValue}-N với giỏ rỗng — cùng khách. Đơn mới sẽ là draft → có thể Tạo PBH riêng)" style="color:#0ea5e9;"
                                onclick="event.stopPropagation();NativeOrdersApp.splitOrder('${escapeHtml(o.code)}')">
                                <i data-lucide="split-square-vertical" style="width:12px;height:12px;"></i>
                            </button>`
                                    : ''
                            }
                            ${/* 2026-06-04: nút Huỷ đơn (X) đã dời lên slot 2 cho confirmed. */ ''}
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
                        <div class="cust-with-avatar">
                            <div class="tpos-customer-avatar-wrap"
                                 data-fb-user-id="${escapeHtml(o.fbUserId || '')}"
                                 data-fb-page-id="${escapeHtml(o.fbPageId || '')}"
                                 data-customer-name="${escapeHtml(o.customerName || '')}"
                                 data-customer-phone="${escapeHtml(o.phone || '')}"
                                 onmouseenter="NativeOrdersApp.onCustAvatarEnter(this)"
                                 onmouseleave="NativeOrdersApp.onCustAvatarLeave(this)">
                                ${renderAvatar(o)}
                            </div>
                            <div class="tpos-customer-cell" style="flex:1;min-width:0;">
                                <div class="tpos-customer-name-row">
                                    ${
                                        o.customerName
                                            ? `<span class="tpos-customer-name">${escapeHtml(o.customerName)}</span>`
                                            : `<span class="tpos-customer-name tpos-customer-stranger" title="Đơn chưa có tên KH — hover avatar hoặc bấm nút TPOS bên dưới">Khách lạ</span>`
                                    }
                                    ${statusPill}
                                    <span class="no-wallet-pill" data-w2wallet-phone="${escapeHtml(o.phone || '')}"></span>
                                    ${
                                        (!o.customerName || !o.phone || !o.address) && o.fbUserId
                                            ? `<button class="tpos-fetch-tpos-btn"
                                                onclick="event.stopPropagation();NativeOrdersApp.fetchCustomerFromTpos('${escapeHtml(o.code)}', '${escapeHtml(o.fbUserId)}')"
                                                title="Lấy SĐT + địa chỉ + tên từ TPOS (search theo FB ID)">
                                            <i data-lucide="download-cloud" style="width:11px;height:11px;"></i> Lấy TPOS
                                        </button>`
                                            : ''
                                    }
                                </div>
                                ${mergedPhoneHtml}
                            </div>
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
                    <td class="col-address">
                        <div class="no-addr-text">${escapeHtml(o.address || '')}</div>
                        ${_deliveryBadgeHtml(o)}
                    </td>
                    <td class="col-money tpos-cell-money">${total}${mergedQtyHtml}</td>
                    <td class="col-qty tpos-cell-center">${qty || ''}</td>
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
                    <td class="col-customerComment">${
                        o.note
                            ? `<div class="tpos-note-cell" title="${escapeHtml(o.note)}">${escapeHtml(o.note)}</div>`
                            : '<span class="tpos-count-empty">—</span>'
                    }</td>
                    <td class="col-userNote">${
                        o.userNote
                            ? `<div class="tpos-note-cell" title="${escapeHtml(o.userNote)}">${escapeHtml(o.userNote)}</div>`
                            : '<span class="tpos-count-empty">—</span>'
                    }</td>
                    <td class="col-employee">${escapeHtml(o.assignedEmployeeName || o.createdByName || '—')}</td>
                    <td class="col-time tpos-date-cell center" title="${escapeHtml(formatFullTime(o.createdAt))}">
                        ${time.date}/${new Date(Number(o.createdAt)).getFullYear()}<br>${time.hour}
                    </td>
                </tr>`;
        return isExpanded ? mainRow + _renderExpandRow(o) : mainRow;
    }

    // Signature cho 1 row — gồm mọi field hiển thị + trạng thái expand. SSE ping
    // với cùng signature → reuse DOM element (no flicker, no image reload).
    function _rowSignature(o) {
        const expanded = STATE.expandedOrders.has(o.code) ? '1' : '0';
        const products = (o.products || [])
            .map(
                (p) =>
                    `${p.productCode || ''}|${p.quantity || 0}|${p.imageUrl || ''}|${p.name || ''}|${p.price || 0}`
            )
            .join(';');
        return [
            o.code,
            o.displayStt ?? '',
            o.splitIndex || 0,
            JSON.stringify(o.mergedDisplayStt || ''),
            o.status,
            o.customerName || '',
            o.phone || '',
            o.address || '',
            o.note || '',
            o.totalQuantity || 0,
            Number(o.totalAmount) || 0,
            Number(o.deposit) || 0,
            o.commentCount || 0,
            o.messageCount || 0,
            o.partnerStatus || '',
            o.customerId || '',
            JSON.stringify(o.tags || []),
            o.deliveryMethod || '',
            o.deliveryMethodManual ? '1' : '0',
            o.pbhResidual ?? '',
            o.pbhTotal ?? '',
            o.pbhFulfillmentState || '',
            o.pbhCarrierName || '',
            expanded,
            products,
            o.updatedAt || 0,
        ].join('||');
    }

    function renderRows() {
        const orders = STATE.orders;
        const tb = tbody();
        if (!orders.length) {
            tb.replaceChildren();
            tb.insertAdjacentHTML(
                'beforeend',
                `<tr><td colspan="16" class="empty-row">Không có đơn nào khớp bộ lọc</td></tr>`
            );
            tb._rowSigs = new Map();
            return;
        }
        if (!tb._rowSigs) tb._rowSigs = new Map();
        const sigs = tb._rowSigs;
        // Index existing DOM elements by code (main row + expand-row).
        const existing = new Map();
        Array.from(tb.children).forEach((el) => {
            const code = el.dataset?.code || el.dataset?.for;
            if (!code) return;
            if (!existing.has(code)) existing.set(code, []);
            existing.get(code).push(el);
        });

        const fragment = document.createDocumentFragment();
        const newCodes = new Set();
        let rebuiltCount = 0;
        for (const o of orders) {
            newCodes.add(o.code);
            const sig = _rowSignature(o);
            const oldSig = sigs.get(o.code);
            if (oldSig === sig && existing.has(o.code)) {
                // Reuse existing DOM — move to fragment (no flicker, no image reload).
                existing.get(o.code).forEach((el) => fragment.appendChild(el));
            } else {
                // Build new HTML for this order and parse to nodes
                const html = _buildOrderHtml(o);
                const tmp = document.createElement('tbody');
                tmp.innerHTML = html;
                while (tmp.firstChild) fragment.appendChild(tmp.firstChild);
                sigs.set(o.code, sig);
                rebuiltCount++;
            }
        }
        // Clean up sigs for codes no longer present
        for (const code of Array.from(sigs.keys())) {
            if (!newCodes.has(code)) sigs.delete(code);
        }
        // Single atomic swap
        tb.replaceChildren(fragment);

        // Lucide only re-processes <i data-lucide> nodes (idempotent skip <svg>).
        // Reused rows already have <svg> rendered → no work; new rows get icons created.
        if (window.lucide) lucide.createIcons();
        if (window.Web2NewMsgBadge?.reapply) window.Web2NewMsgBadge.reapply();
        // Số dư ví KH cho row có SĐT (chỉ hiện khi > 0).
        window.Web2WalletBalance?.attachBalances?.(tb);
        // Tab Inbox: đơn chưa có fb_id → resolve avatar theo SĐT (chạy nền).
        if (STATE.channel === 'web2_inbox') {
            setTimeout(() => _hydrateInboxAvatars(), 0);
        }
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

    let _prevTotal = 0;
    function renderCounters() {
        const totalStr = STATE.total.toLocaleString('vi-VN');
        counter().textContent = `${totalStr} đơn`;
        // Count-up animation on the searchCount pill (numeric-only — keeps the
        // suffix safe). Only when delta exists and not the first render.
        if (window.Web2Effects?.countUp && _prevTotal > 0 && _prevTotal !== STATE.total) {
            window.Web2Effects.countUp(searchCount(), _prevTotal, STATE.total, 600);
        } else {
            searchCount().textContent = totalStr;
        }
        _prevTotal = STATE.total;
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
        // CHỈ wipe tbody khi chưa có row nào — để giữ DOM nodes cho diff render
        // (SSE-driven reload bảo toàn DOM, sig diff chỉ thay row thay đổi).
        const tb = tbody();
        const hasExistingRows = tb && tb.querySelector('tr.order-row');
        if (!hasExistingRows) {
            tb.innerHTML = `<tr><td colspan="16" class="loading-row">
                <div class="spinner"></div>Đang tải dữ liệu...
            </td></tr>`;
        }
        try {
            const resp = await window.NativeOrdersApi.list({
                status: STATE.status,
                channel: STATE.channel || undefined,
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
            // Chỉ hiển thị error row nếu chưa có dữ liệu (first load failed). SSE
            // refresh fail → giữ DOM cũ + toast notify.
            if (!hasExistingRows) {
                tbody().innerHTML = `<tr><td colspan="16" class="empty-row" style="color:#ef4444;">
                    Lỗi tải dữ liệu: ${escapeHtml(e.message)}
                </td></tr>`;
            }
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

        // LOCK edit khi status='confirmed' (đã PBH thành công). User phải hủy
        // PBH hoặc tạo đơn mới (drag SP lại) để chỉnh sửa SP.
        const isLocked = o.status === 'confirmed';
        const lockBanner = isLocked
            ? `<div class="lock-banner" style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 14px;margin-bottom:14px;display:flex;gap:12px;align-items:flex-start;">
                <i data-lucide="lock" style="width:20px;height:20px;color:#92400e;flex-shrink:0;margin-top:1px;"></i>
                <div style="flex:1;font-size:13px;color:#78350f;line-height:1.5;">
                    <strong>Đơn đã tạo PBH — không thể chỉnh sửa giỏ sản phẩm.</strong><br>
                    Để sửa SP, hãy <strong>hủy PBH</strong> rồi mở lại, hoặc <strong>kéo SP mới</strong> từ TPOS panel lên cùng khách để tạo đơn mới (PBH mới).
                </div>
                <button type="button" class="btn-primary" style="background:#dc2626;font-size:12px;padding:6px 12px;flex-shrink:0;" onclick="NativeOrdersApp.cancelPbhFromEdit('${escapeHtml(code)}')">
                    <i data-lucide="x-circle" style="width:14px;height:14px;"></i> Hủy PBH
                </button>
            </div>`
            : '';

        modalTitle().innerHTML = `<i data-lucide="${isLocked ? 'lock' : 'pencil'}"></i><span>${isLocked ? 'Xem đơn' : 'Chỉnh sửa đơn'} ${escapeHtml(code)}</span>`;
        modalBody().innerHTML =
            lockBanner +
            `
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
            ${_renderCommentReadonlyBlock(o)}
            <div class="field-row">
                <label>Ghi chú</label>
                <textarea id="editUserNote" placeholder="Ghi chú nội bộ (size, màu, yêu cầu KH…)">${escapeHtml(o.userNote || '')}</textarea>
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
            <div class="products-section${isLocked ? ' is-locked' : ''}">
                <div class="products-header">
                    <span class="products-title">
                        <i data-lucide="${isLocked ? 'lock' : 'package'}"></i>
                        Sản phẩm trong đơn ${isLocked ? '(đã khóa)' : ''}
                    </span>
                    <span class="products-totals" id="editProductsTotals">—</span>
                </div>

                ${
                    isLocked
                        ? ''
                        : `<div class="product-picker">
                    <div class="search-wrapper" style="flex:1;max-width:100%;">
                        <i data-lucide="search" class="search-icon"></i>
                        <input type="text" id="productPickerInput" class="search-input"
                               placeholder="Tìm theo mã SP hoặc tên… (gõ ≥ 2 ký tự)"
                               autocomplete="off">
                    </div>
                    <a class="btn-ghost" href="../web2/products/index.html" target="_blank" rel="noopener"
                       title="Mở kho để thêm SP mới">
                        <i data-lucide="external-link"></i> Kho SP
                    </a>
                </div>
                <div class="product-picker-results" id="productPickerResults" style="display:none;"></div>`
                }

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
            box.innerHTML = `<div class="picker-empty">Kho SP trống — <a href="../web2/products/index.html" target="_blank">mở kho tạo SP</a></div>`;
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
            box.innerHTML = `<div class="picker-empty">Không tìm thấy SP khớp "${escapeHtml(q)}". <a href="../web2/products/index.html" target="_blank">Mở kho →</a></div>`;
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
            // KPI Sprint 0: capture WHO added cho audit + ledger event emit.
            // userInfo từ Web2UserInfo (server-validated Web2Auth token).
            const userInfo = window.Web2UserInfo?.get('native-orders') || {};
            EDIT_LINES.push({
                productCode: code,
                name,
                price,
                quantity: 1,
                imageUrl,
                note: '',
                total: price,
                addedAt: Date.now(),
                // Nguồn: 'native' = SP add trực tiếp từ picker trong modal sửa đơn.
                source: 'native',
                addedBy: userInfo.userName || null,
                addedById: userInfo.userId || null,
                // Idempotency UUID — server emit KPI event với key unique theo cái này
                clientEventId: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
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

        // Lock check: re-derive từ STATE.editingCode + orders (cùng logic openEdit)
        const editingOrder = STATE.editingCode
            ? STATE.orders.find((x) => x.code === STATE.editingCode)
            : null;
        const isLocked = editingOrder?.status === 'confirmed';

        if (!EDIT_LINES.length) {
            tb.innerHTML = `<tr><td colspan="7" class="empty-lines">${isLocked ? 'Đơn không có sản phẩm.' : 'Chưa có sản phẩm — gõ mã/tên SP ở trên để tìm và thêm'}</td></tr>`;
            if (totals) totals.textContent = '0 SP · 0đ';
            return;
        }

        // Queue fetch snapshot cho mọi line có fbCommentId chưa cache.
        // Khi fetch xong → re-render để hiện thumbnail.
        const needsSnap = EDIT_LINES.filter((l) => l.fbCommentId && !_snapCache.has(l.fbCommentId));
        if (needsSnap.length) {
            needsSnap.forEach((l) => _queueSnapFetch(l.fbCommentId, () => renderOrderLines()));
        }

        let totalQty = 0,
            totalAmount = 0;
        tb.innerHTML = EDIT_LINES.map((l, i) => {
            const qty = Number(l.quantity) || 0;
            const price = Number(l.price) || 0;
            const amount = qty * price;
            totalQty += qty;
            totalAmount += amount;
            const snapThumb = _renderLineSnapThumb(l.fbCommentId);
            const img = l.imageUrl
                ? `<img src="${escapeHtml(l.imageUrl)}" class="line-img" onerror="this.style.display='none';this.nextElementSibling.style.setProperty('display','inline-flex');">
                   <span class="line-img-ph" style="display:none;"><i data-lucide="image"></i></span>${snapThumb}`
                : `<span class="line-img-ph"><i data-lucide="image"></i></span>${snapThumb}`;
            // Locked → disable qty buttons + remove button, hiển thị read-only.
            const qtyCell = isLocked
                ? `<div class="qty-ctl" style="opacity:0.6;pointer-events:none;">
                       <span style="font-weight:600;padding:0 10px;">${qty}</span>
                   </div>`
                : `<div class="qty-ctl">
                       <button onclick="NativeOrdersApp.changeLineQty(${i}, -1)"><i data-lucide="minus"></i></button>
                       <input type="number" min="1" value="${qty}" onchange="NativeOrdersApp.setLineQty(${i}, this.value)">
                       <button onclick="NativeOrdersApp.changeLineQty(${i}, 1)"><i data-lucide="plus"></i></button>
                   </div>`;
            const actionCell = isLocked
                ? `<span title="Đơn đã PBH — không thể xóa SP" style="opacity:0.4;"><i data-lucide="lock"></i></span>`
                : `<button class="btn-action act-delete" title="Xóa" onclick="NativeOrdersApp.removeLine(${i})"><i data-lucide="trash-2"></i></button>`;
            // Ghi chú SP — ALWAYS editable (kể cả khi locked). User cần ghi
            // size/màu/yêu cầu đóng gói lên line ngay cả sau khi đã PBH.
            const noteCell = `
                <div class="line-note-wrap" style="margin-top:4px;">
                    <input type="text" class="line-note-input"
                        value="${escapeHtml(l.note || '')}"
                        placeholder="Ghi chú SP (size/màu/đóng gói…)"
                        oninput="NativeOrdersApp.setLineNote(${i}, this.value)"
                        style="width:100%;padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;color:#475569;background:#f8fafc;"
                    />
                </div>`;
            const sourceBadge = _renderSourceBadge(l.source);
            return `
                <tr data-idx="${i}">
                    <td>${i + 1}</td>
                    <td>${img}</td>
                    <td>
                        <div class="line-name">${escapeHtml(l.name || '—')}</div>
                        <div class="line-code">${escapeHtml(l.productCode || '')}${sourceBadge}</div>
                        ${noteCell}
                    </td>
                    <td>${qtyCell}</td>
                    <td class="line-price">${price.toLocaleString('vi-VN')}đ</td>
                    <td class="line-amount">${amount.toLocaleString('vi-VN')}đ</td>
                    <td>${actionCell}</td>
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

    // Cập nhật ghi chú SP — KHÔNG re-render (giữ caret position khi đang gõ).
    // EDIT_LINES[idx].note sẽ được saveEdit gửi lên backend.
    function setLineNote(idx, val) {
        const line = EDIT_LINES[idx];
        if (!line) return;
        line.note = val || null;
    }

    // UI-first: modal đóng + danh sách update NGAY, PATCH chạy background.
    // Lỗi → rollback order về snapshot cũ + re-render + show error toast.
    function saveEdit() {
        if (!STATE.editingCode) return;
        const code = STATE.editingCode;
        const editingOrder = STATE.orders.find((x) => x.code === code);
        if (!editingOrder) return;
        const fields = {
            customerName: $('#editCustomerName').value.trim(),
            phone: $('#editPhone').value.trim(),
            address: $('#editAddress').value.trim(),
            userNote: $('#editUserNote')?.value?.trim() || '',
            status: $('#editStatus').value,
        };
        fields.products = EDIT_LINES.map((l) => ({
            productCode: l.productCode,
            name: l.name,
            price: Number(l.price) || 0,
            quantity: Number(l.quantity) || 0,
            imageUrl: l.imageUrl || null,
            note: l.note || null,
            total: (Number(l.price) || 0) * (Number(l.quantity) || 0),
            addedAt: l.addedAt || Date.now(),
            source: l.source || undefined,
            fbCommentId: l.fbCommentId || undefined,
            addedBy: l.addedBy || undefined,
            addedById: l.addedById || undefined,
            clientEventId: l.clientEventId || undefined,
        }));
        const editorInfo = window.Web2UserInfo?.get('native-orders') || {};
        fields._editor = {
            userId: editorInfo.userId || null,
            userName: editorInfo.userName || null,
            sourcePage: editorInfo.sourcePage || 'native-orders',
        };

        // Đổi địa chỉ → tự nhận lại phương thức giao hàng (trừ khi đã chỉnh tay).
        const addrChanged = (editingOrder.address || '') !== fields.address;
        let reDetected = null;
        if (addrChanged && !editingOrder.deliveryMethodManual) {
            reDetected = _detectDelivery(fields.address);
            if (reDetected) {
                fields.deliveryMethod = reDetected.value;
                fields.deliveryMethodLabel = reDetected.label;
                fields.deliveryMethodManual = false;
            }
        }

        // Optimistic order shape: merge fields vào order cũ.
        const optimisticOrder = {
            ...editingOrder,
            customerName: fields.customerName,
            phone: fields.phone,
            address: fields.address,
            userNote: fields.userNote,
            status: fields.status,
            ...(reDetected
                ? {
                      deliveryMethod: reDetected.value,
                      deliveryMethodLabel: reDetected.label,
                      deliveryMethodManual: false,
                  }
                : {}),
            products: fields.products,
            totalQuantity: fields.products.reduce((s, p) => s + (Number(p.quantity) || 0), 0),
            totalAmount: fields.products.reduce(
                (s, p) => s + (Number(p.quantity) || 0) * (Number(p.price) || 0),
                0
            ),
        };

        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => ({ ...editingOrder, products: [...(editingOrder.products || [])] }),
                apply: () => {
                    const idx = STATE.orders.findIndex((x) => x.code === code);
                    if (idx !== -1) STATE.orders[idx] = optimisticOrder;
                    renderRows();
                    closeEdit();
                },
                run: async () => {
                    return await window.NativeOrdersApi.update(code, fields);
                },
                onSuccess: (resp) => {
                    if (resp?.order) {
                        const idx = STATE.orders.findIndex((x) => x.code === code);
                        if (idx !== -1) STATE.orders[idx] = resp.order;
                        renderRows();
                    }
                },
                rollback: (prev) => {
                    if (!prev) return;
                    const idx = STATE.orders.findIndex((x) => x.code === code);
                    if (idx !== -1) STATE.orders[idx] = prev;
                    renderRows();
                },
                successMsg: 'Đã lưu',
                errLabel: `lưu đơn ${code}`,
            });
        } else {
            // Fallback nếu helper chưa load — keep old behavior.
            (async () => {
                try {
                    const resp = await window.NativeOrdersApi.update(code, fields);
                    const idx = STATE.orders.findIndex((x) => x.code === code);
                    if (idx !== -1 && resp.order) STATE.orders[idx] = resp.order;
                    renderRows();
                    notify('Đã lưu', 'success');
                    closeEdit();
                } catch (e) {
                    notify('Lỗi lưu: ' + e.message, 'error');
                }
            })();
        }
    }

    // UI-first: badge status đổi NGAY, PATCH chạy background. Lỗi → rollback.
    function quickStatus(code, status) {
        const order = STATE.orders.find((x) => x.code === code);
        if (!order) return;
        const prevStatus = order.status;
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => prevStatus,
                apply: () => {
                    order.status = status;
                    renderRows();
                },
                run: async () => {
                    return await window.NativeOrdersApi.update(code, { status });
                },
                onSuccess: (resp) => {
                    if (resp?.order) {
                        const idx = STATE.orders.findIndex((x) => x.code === code);
                        if (idx !== -1) STATE.orders[idx] = resp.order;
                        renderRows();
                    }
                },
                rollback: (prev) => {
                    order.status = prev;
                    renderRows();
                },
                successMsg: `Đã chuyển "${STATUS_META[status]?.label || status}"`,
                errLabel: `chuyển trạng thái ${code}`,
            });
        } else {
            (async () => {
                try {
                    const resp = await window.NativeOrdersApi.update(code, { status });
                    const idx = STATE.orders.findIndex((x) => x.code === code);
                    if (idx !== -1 && resp.order) STATE.orders[idx] = resp.order;
                    renderRows();
                    notify(`Đã chuyển "${STATUS_META[status]?.label || status}"`, 'success');
                } catch (e) {
                    notify('Lỗi: ' + e.message, 'error');
                }
            })();
        }
    }

    // ── Phương thức giao hàng: menu chọn tay ──────────────────────────
    // Mở popover ngay cạnh badge với danh sách option. Chọn → setDeliveryMethod.
    let _deliveryMenuEl = null;
    function _closeDeliveryMenu() {
        if (_deliveryMenuEl) {
            _deliveryMenuEl.remove();
            _deliveryMenuEl = null;
            document.removeEventListener('click', _closeDeliveryMenu, true);
        }
    }
    function openDeliveryMenu(code, anchorEl) {
        _closeDeliveryMenu();
        const order = STATE.orders.find((x) => x.code === code);
        if (!order) return;
        const opts = _deliveryOpts();
        if (!opts.length) return;
        const cur = order.deliveryMethod || _detectDelivery(order.address || '')?.value || '';
        const menu = document.createElement('div');
        menu.className = 'no-delivery-menu';
        menu.innerHTML =
            `<div class="no-delivery-menu-head">Phương thức giao hàng</div>` +
            opts
                .map(
                    (o) =>
                        `<button type="button" class="no-delivery-menu-item${o.value === cur ? ' is-current' : ''}"
                        onclick="event.stopPropagation();NativeOrdersApp.setDeliveryMethod('${escapeHtml(code)}','${escapeHtml(o.value)}')">
                        ${escapeHtml(o.short || o.label)}${o.value === cur ? ' ✓' : ''}
                    </button>`
                )
                .join('') +
            `<button type="button" class="no-delivery-menu-item no-delivery-menu-redetect"
                onclick="event.stopPropagation();NativeOrdersApp.setDeliveryMethod('${escapeHtml(code)}','__auto__')">
                ↻ Tự nhận lại theo địa chỉ</button>`;
        document.body.appendChild(menu);
        const rect = anchorEl.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
        menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 240)}px`;
        _deliveryMenuEl = menu;
        // Đóng khi click ngoài (capture, ở tick sau để né click hiện tại)
        setTimeout(() => document.addEventListener('click', _closeDeliveryMenu, true), 0);
    }
    // Chọn tay (manual=true) hoặc '__auto__' để re-detect offline (manual=false).
    function setDeliveryMethod(code, value) {
        _closeDeliveryMenu();
        const order = STATE.orders.find((x) => x.code === code);
        if (!order) return;
        const isAuto = value === '__auto__';
        let nextVal, nextLabel, nextManual;
        if (isAuto) {
            const det = _detectDelivery(order.address || '');
            if (!det) {
                notify('Không nhận diện được khu vực từ địa chỉ', 'warning');
                return;
            }
            nextVal = det.value;
            nextLabel = det.label;
            nextManual = false;
        } else {
            const opt = _deliveryOpts().find((o) => o.value === value);
            if (!opt) return;
            nextVal = opt.value;
            nextLabel = opt.label;
            nextManual = true;
        }
        const prev = {
            deliveryMethod: order.deliveryMethod,
            deliveryMethodLabel: order.deliveryMethodLabel,
            deliveryMethodManual: order.deliveryMethodManual,
        };
        const apply = () => {
            order.deliveryMethod = nextVal;
            order.deliveryMethodLabel = nextLabel;
            order.deliveryMethodManual = nextManual;
            _deliveryPersisted.add(code); // đã có giá trị → không lazy-persist nữa
            renderRows();
        };
        const payload = {
            deliveryMethod: nextVal,
            deliveryMethodLabel: nextLabel,
            deliveryMethodManual: nextManual,
        };
        const successMsg = isAuto
            ? 'Đã tự nhận lại phương thức'
            : `Đã chọn ${_deliveryShort(nextVal, nextLabel)}`;
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => prev,
                apply,
                run: async () => window.NativeOrdersApi.update(code, payload),
                onSuccess: (resp) => {
                    if (resp?.order) {
                        const idx = STATE.orders.findIndex((x) => x.code === code);
                        if (idx !== -1) STATE.orders[idx] = resp.order;
                        renderRows();
                    }
                },
                rollback: (p) => {
                    order.deliveryMethod = p.deliveryMethod;
                    order.deliveryMethodLabel = p.deliveryMethodLabel;
                    order.deliveryMethodManual = p.deliveryMethodManual;
                    renderRows();
                },
                successMsg,
                errLabel: `lưu phương thức giao ${code}`,
            });
        } else {
            apply();
            window.NativeOrdersApi.update(code, payload)
                .then(() => notify(successMsg, 'success'))
                .catch((e) => notify('Lỗi: ' + e.message, 'error'));
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

    async function createPbh(code, opts = {}) {
        // shopMode: mở modal PBH nhưng phương thức giao = "BÁN HÀNG SHOP" + DISABLE
        // (không cho đổi), ship = 0. Dùng cho nút "PBH SHOP" (bán tại shop).
        const shopMode = opts.shopMode === true;
        // Custom popup: show order summary + optional deposit/delivery overrides
        const src = STATE.orders.find((o) => o.code === code);
        if (!src) {
            notify('Không tìm thấy đơn ' + code, 'error');
            return;
        }
        // Đơn "Đơn hàng" (confirmed) đã có PBH → KHÔNG tạo PBH/PBH SHOP lại.
        if (src.status !== 'draft') {
            notify(
                'Đơn "Đơn hàng" đã có PBH — không tạo lại. Chỉ đơn Nháp tạo được PBH.',
                'warning'
            );
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
        // 2026-06-04: auto-detect 2 method (offline fuzzy + Goong) cross-validate.
        const picked = DMP
            ? DMP.pickRobust
                ? await DMP.pickRobust(src.address || '', deliveryOpts)
                : DMP.pick(src.address || '', deliveryOpts)
            : null;
        const pickedValue = picked?.option?.value || '';
        const pickedHint = (() => {
            if (!picked) return '';
            const opt = picked.option?.label ? escapeHtml(picked.option.label) : '';
            const g = picked.methods?.goong;
            if (picked.confidence === 'conflict') {
                return `⚠️ <strong>CẦN KIỂM TRA</strong> — 2 nguồn lệch: offline → <strong>${escapeHtml(picked.methods?.offline?.label || opt)}</strong>; Goong (${escapeHtml(g?.district || '')}, ${escapeHtml(g?.province || '')}) → <strong>${escapeHtml(g?.zone || '?')}</strong>`;
            }
            if (picked.confidence === 'high') {
                const src2 = picked.source === 'both' ? '✅ 2 nguồn khớp' : '🎯 khớp khu vực';
                return `${src2} — <strong>${escapeHtml(picked.matched?.slice(0, 4).join(', ') || opt)}</strong>`;
            }
            return `📦 ${escapeHtml(picked.note || 'Độ tin cậy thấp — kiểm tra lại')}`;
        })();
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
                    <div><strong>STT:</strong> ${src.campaignStt ?? src.displayStt ?? '—'}</div>
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
            title: shopMode ? `Tạo PBH SHOP từ ${code}` : `Tạo PBH từ ${code}`,
            iconType: 'info',
            iconName: 'receipt',
            html,
            okText: shopMode ? 'Tạo PBH SHOP' : 'Tạo PBH',
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
                // shopMode: ép "BÁN HÀNG SHOP" + disable dropdown + ship = 0.
                if (shopMode && sel) {
                    let shopOpt = Array.from(sel.options).find((o) =>
                        /pbh\s*shop|bán\s*hàng\s*shop|shop/i.test(o.textContent || '')
                    );
                    if (!shopOpt) {
                        shopOpt = document.createElement('option');
                        shopOpt.value = 'PBH SHOP';
                        shopOpt.textContent = 'BÁN HÀNG SHOP';
                        shopOpt.dataset.price = '0';
                        sel.insertBefore(shopOpt, sel.firstChild);
                    }
                    sel.value = shopOpt.value;
                    sel.disabled = true;
                    sel.style.background = '#f1f5f9';
                    sel.style.cursor = 'not-allowed';
                    if (priceInput) {
                        priceInput.value = 0;
                    }
                }
            },
            collect: (root) => {
                const sel = root.querySelector('#pbhDeliveryMethod');
                const selectedOpt = sel ? sel.options[sel.selectedIndex] : null;
                return {
                    deposit: Number(root.querySelector('#pbhDeposit').value) || 0,
                    deliveryPrice: Number(root.querySelector('#pbhDeliveryPrice').value) || 0,
                    paymentAmount: Number(root.querySelector('#pbhPaymentAmount').value) || 0,
                    dateInvoice: _dateInputToIsoWithNowTime(
                        root.querySelector('#pbhDateInvoice').value
                    ),
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
    // Convert input[type=date] value ('YYYY-MM-DD') → full ISO với current local
    // time. Tránh bug "Ngày HĐ" hiển thị 07:00 do PG parse 'YYYY-MM-DD' = midnight UTC.
    // Pass-through nếu input đã có time component (datetime-local hoặc full ISO).
    function _dateInputToIsoWithNowTime(raw) {
        if (!raw) return null;
        if (String(raw).includes('T') || String(raw).includes(' ')) return raw;
        const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return raw;
        const now = new Date();
        const d = new Date(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            now.getHours(),
            now.getMinutes(),
            now.getSeconds()
        );
        return d.toISOString();
    }

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

    // Gộp 2+ Đơn Web cùng SĐT → 1 Đơn Web mới (STT "1 + 2"). KHÔNG tạo PBH.
    // Đơn gốc bị xóa, đơn mới hiện trong list như Đơn Web bình thường — user
    // có thể click "Tạo PBH" sau hoặc dùng bulk Tạo PBH hàng loạt.
    async function bulkMergeOrders() {
        const codes = getSelectedCodes();
        if (codes.length < 2) {
            notify('Cần chọn ít nhất 2 đơn để gộp', 'warning');
            return;
        }
        const orders = codes.map((c) => STATE.orders.find((o) => o.code === c)).filter(Boolean);
        if (orders.length !== codes.length) {
            notify('Không tìm thấy đơn trong state', 'error');
            return;
        }
        // Preflight: cùng SĐT (KHÔNG cần validate đủ address/products vì chỉ gộp)
        const phones = new Set(orders.map((o) => (o.phone || '').trim()));
        if (phones.size > 1) {
            notify(
                `Phải cùng SĐT. Đang có ${phones.size} SĐT: ${Array.from(phones).join(', ')}`,
                'error'
            );
            return;
        }
        const phone = Array.from(phones)[0] || '(chưa có SĐT)';
        const customerName = orders[0].customerName || '';
        const stts = orders
            .map((o) => Number(o.displayStt) || 0)
            .filter(Boolean)
            .sort((a, b) => a - b);
        const totalQty = orders.reduce(
            (s, o) => s + (o.products || []).reduce((q, p) => q + (Number(p.quantity) || 0), 0),
            0
        );
        const totalAmt = orders.reduce(
            (s, o) =>
                s +
                (o.products || []).reduce(
                    (q, p) => q + (Number(p.quantity) || 0) * (Number(p.price) || 0),
                    0
                ),
            0
        );

        const proceed = window.Popup
            ? await window.Popup.confirm(
                  `Gộp ${orders.length} Đơn Web của KH ${customerName} (${phone}) thành 1 đơn?\n\n` +
                      `STT mới hiển thị: "${stts.join(' + ')}"\n` +
                      `Tổng SL: ${totalQty} sản phẩm — ${Number(totalAmt).toLocaleString('vi-VN')}đ\n\n` +
                      `⚠️ Các đơn gốc (${codes.join(', ')}) sẽ BỊ XÓA và thay bằng 1 Đơn Web mới (chưa tạo PBH).`,
                  { title: 'Gộp Đơn Web', okText: 'Gộp đơn', type: 'warning' }
              )
            : confirm(`Gộp ${orders.length} đơn thành 1?`);
        if (!proceed) return;

        try {
            const r = await fetch(`${WORKER_URL}/api/native-orders/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codes }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            notify(
                `✅ Đã gộp ${orders.length} đơn → ${data.order.code} (STT ${data.mergedStts.join(' + ')})`,
                'success'
            );
            unselectAllOrders();
            load();
        } catch (e) {
            notify('Lỗi gộp đơn: ' + e.message, 'error');
        }
    }

    // In bill thermal 80mm cho các đơn được chọn (tạo PBH-shape object trong RAM,
    // không lưu DB — dùng Web2Bill template). Hữu ích preview trước khi tạo PBH.
    // 2026-06-04: Thêm đơn Inbox — nhập KH (tìm từ kho web2 → autofill tên/SĐT/địa
    // chỉ), tạo đơn channel='web2_inbox'.
    // 2026-06-05: picker SP inline (giỏ ngay trong modal, KHÔNG bắt buộc) + bind
    // fbId từ KH để avatar/hội thoại Pancake hoạt động (xem create-manual backend).
    async function openAddInboxOrder() {
        const overlay = document.createElement('div');
        overlay.className = 'no-add-modal-overlay';
        overlay.innerHTML = `
          <div class="no-add-modal no-add-modal--wide">
            <div class="no-add-modal-head">
              <strong><i data-lucide="inbox"></i> Thêm đơn Inbox</strong>
              <button class="no-add-close" type="button" aria-label="Đóng">✕</button>
            </div>
            <div class="no-add-modal-body">
              <label>Khách hàng (gõ tên / SĐT — lấy từ kho KH)</label>
              <div class="no-add-search-wrap">
                <input type="text" id="noAddCustSearch" placeholder="Gõ tên hoặc SĐT để tìm khách (không dấu vẫn nhận)..." autocomplete="off" />
                <div class="no-add-suggest" id="noAddSuggest" hidden></div>
              </div>
              <div class="no-add-row">
                <div><label>Tên</label><input type="text" id="noAddName" /></div>
                <div><label>SĐT</label><input type="text" id="noAddPhone" /></div>
              </div>
              <label>Địa chỉ</label>
              <input type="text" id="noAddAddress" />

              <div class="no-add-prod-section">
                <label>Sản phẩm vào giỏ <span class="no-add-prod-hint">(tuỳ chọn — tạo đơn trống cũng được)</span></label>
                <div class="no-add-search-wrap">
                  <input type="text" id="noAddProdSearch" placeholder="Tìm SP theo mã / tên để thêm vào giỏ..." autocomplete="off" />
                  <div class="no-add-suggest" id="noAddProdSuggest" hidden></div>
                </div>
                <div class="no-add-cart" id="noAddCart"></div>
              </div>
            </div>
            <div class="no-add-modal-foot">
              <span class="no-add-cart-total" id="noAddCartTotal"></span>
              <button class="no-add-cancel" type="button">Huỷ</button>
              <button class="no-add-create" type="button"><i data-lucide="check"></i> <span class="no-add-create-label">Tạo đơn</span></button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        if (window.lucide) lucide.createIcons();
        let selectedCustomerId = null;
        let selectedFbId = null;
        const cart = []; // [{productCode,name,price,quantity,total,imageUrl}]
        const close = () => overlay.remove();
        overlay.querySelector('.no-add-close').onclick = close;
        overlay.querySelector('.no-add-cancel').onclick = close;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        // ---- Customer search ----
        const searchInp = overlay.querySelector('#noAddCustSearch');
        const suggest = overlay.querySelector('#noAddSuggest');
        let timer = null;
        searchInp.addEventListener('input', () => {
            clearTimeout(timer);
            const q = searchInp.value.trim();
            if (q.length < 2) {
                suggest.hidden = true;
                return;
            }
            timer = setTimeout(async () => {
                try {
                    const r = await fetch(
                        `${WORKER_URL}/api/web2/customers/search?search=${encodeURIComponent(q)}&limit=8`,
                        { credentials: 'include' }
                    );
                    const j = await r.json();
                    const rows = j.data || [];
                    if (!rows.length) {
                        suggest.innerHTML =
                            '<div class="no-add-suggest-empty">Không tìm thấy — nhập tay bên dưới</div>';
                        suggest.hidden = false;
                        return;
                    }
                    suggest.innerHTML = rows
                        .map(
                            (c) =>
                                `<button type="button" class="no-add-suggest-item" data-id="${c.id || ''}" data-fbid="${escapeHtml(c.fbId || '')}" data-name="${escapeHtml(c.name || '')}" data-phone="${escapeHtml(c.phone || '')}" data-address="${escapeHtml(c.address || '')}"><strong>${escapeHtml(c.name || '—')}</strong> · ${escapeHtml(c.phone || '')}<div class="no-add-suggest-addr">${escapeHtml(c.address || '')}</div></button>`
                        )
                        .join('');
                    suggest.hidden = false;
                } catch (e) {
                    suggest.hidden = true;
                }
            }, 280);
        });
        suggest.addEventListener('click', (e) => {
            const item = e.target.closest('.no-add-suggest-item');
            if (!item) return;
            overlay.querySelector('#noAddName').value = item.dataset.name || '';
            overlay.querySelector('#noAddPhone').value = item.dataset.phone || '';
            overlay.querySelector('#noAddAddress').value = item.dataset.address || '';
            selectedCustomerId = item.dataset.id || null;
            selectedFbId = item.dataset.fbid || null;
            suggest.hidden = true;
            searchInp.value = item.dataset.name || item.dataset.phone || '';
        });

        // ---- Product picker (inline cart) ----
        const prodInp = overlay.querySelector('#noAddProdSearch');
        const prodSuggest = overlay.querySelector('#noAddProdSuggest');
        const cartEl = overlay.querySelector('#noAddCart');
        const totalEl = overlay.querySelector('#noAddCartTotal');
        const createLabel = overlay.querySelector('.no-add-create-label');
        let prodCache = null; // lazy-loaded full product list

        const renderCart = () => {
            if (!cart.length) {
                cartEl.innerHTML =
                    '<div class="no-add-cart-empty">Chưa có SP — tạo đơn trống cũng được.</div>';
            } else {
                cartEl.innerHTML = cart
                    .map(
                        (l, i) => `
                        <div class="no-add-cart-row" data-i="${i}">
                            <div class="no-add-cart-info">
                                <div class="no-add-cart-name">${escapeHtml(l.name)}</div>
                                <div class="no-add-cart-code">${escapeHtml(l.productCode)} · ${(l.price || 0).toLocaleString('vi-VN')}đ</div>
                            </div>
                            <input type="number" class="no-add-cart-qty" min="1" value="${l.quantity}" data-i="${i}" />
                            <div class="no-add-cart-line-total">${(l.total || 0).toLocaleString('vi-VN')}đ</div>
                            <button type="button" class="no-add-cart-rm" data-i="${i}" title="Xoá">✕</button>
                        </div>`
                    )
                    .join('');
            }
            const totalQty = cart.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
            const totalAmt = cart.reduce((s, l) => s + (Number(l.total) || 0), 0);
            totalEl.textContent = cart.length
                ? `${totalQty} SP · ${totalAmt.toLocaleString('vi-VN')}đ`
                : '';
            createLabel.textContent = cart.length ? `Tạo đơn (${totalQty} SP)` : 'Tạo đơn';
        };
        renderCart();

        const addToCart = (p) => {
            const existing = cart.find((l) => l.productCode === p.code);
            if (existing) {
                existing.quantity = (Number(existing.quantity) || 0) + 1;
                existing.total = existing.quantity * existing.price;
            } else {
                const userInfo = window.Web2UserInfo?.get('native-orders') || {};
                cart.push({
                    productCode: p.code,
                    name: p.name || p.code,
                    price: Number(p.price) || 0,
                    quantity: 1,
                    total: Number(p.price) || 0,
                    imageUrl: p.imageUrl || null,
                    note: '',
                    source: 'native',
                    addedBy: userInfo.userName || null,
                    addedById: userInfo.userId || null,
                });
            }
            renderCart();
        };

        const renderProdResults = (q) => {
            if (prodCache === null) {
                prodSuggest.innerHTML = '<div class="no-add-suggest-empty">Đang tải kho SP…</div>';
                prodSuggest.hidden = false;
                return;
            }
            const qn = stripVi(q);
            const filtered = qn
                ? prodCache.filter(
                      (p) => stripVi(p.code).includes(qn) || stripVi(p.name).includes(qn)
                  )
                : prodCache;
            const items = filtered.slice(0, 12);
            if (!items.length) {
                prodSuggest.innerHTML =
                    '<div class="no-add-suggest-empty">Không tìm thấy SP khớp.</div>';
                prodSuggest.hidden = false;
                return;
            }
            prodSuggest.innerHTML = items
                .map(
                    (p) =>
                        `<button type="button" class="no-add-suggest-item no-add-prod-item" data-code="${escapeHtml(p.code)}"><strong>${escapeHtml(p.name || p.code)}</strong> · ${(p.price || 0).toLocaleString('vi-VN')}đ<div class="no-add-suggest-addr">Mã: ${escapeHtml(p.code)}</div></button>`
                )
                .join('');
            prodSuggest.hidden = false;
        };

        const ensureProdCache = async () => {
            if (prodCache !== null) return;
            try {
                const resp = await window.NativeOrdersApi.searchProducts({
                    search: '',
                    limit: 1000,
                });
                prodCache = resp.products || [];
            } catch (e) {
                console.warn('[inbox-add] product cache load failed:', e.message);
                prodCache = [];
            }
        };

        let prodTimer = null;
        prodInp.addEventListener('focus', async () => {
            await ensureProdCache();
            if (prodInp.value.trim().length >= 1) renderProdResults(prodInp.value.trim());
        });
        prodInp.addEventListener('input', () => {
            clearTimeout(prodTimer);
            const q = prodInp.value.trim();
            if (!q) {
                prodSuggest.hidden = true;
                return;
            }
            prodTimer = setTimeout(async () => {
                await ensureProdCache();
                renderProdResults(q);
            }, 200);
        });
        prodSuggest.addEventListener('click', (e) => {
            const item = e.target.closest('.no-add-prod-item');
            if (!item) return;
            const code = item.dataset.code;
            const p = (prodCache || []).find((x) => x.code === code);
            if (p) addToCart(p);
            prodInp.value = '';
            prodSuggest.hidden = true;
            prodInp.focus();
        });
        // Cart row interactions (qty change + remove)
        cartEl.addEventListener('input', (e) => {
            const qtyInp = e.target.closest('.no-add-cart-qty');
            if (!qtyInp) return;
            const i = Number(qtyInp.dataset.i);
            const line = cart[i];
            if (!line) return;
            const v = Math.max(1, parseInt(qtyInp.value, 10) || 1);
            line.quantity = v;
            line.total = v * line.price;
            renderCart();
        });
        cartEl.addEventListener('click', (e) => {
            const rm = e.target.closest('.no-add-cart-rm');
            if (!rm) return;
            const i = Number(rm.dataset.i);
            cart.splice(i, 1);
            renderCart();
        });
        // Đóng suggest khi click ngoài
        overlay.addEventListener('click', (e) => {
            if (!e.target.closest('#noAddProdSearch') && !e.target.closest('#noAddProdSuggest')) {
                prodSuggest.hidden = true;
            }
            if (!e.target.closest('#noAddCustSearch') && !e.target.closest('#noAddSuggest')) {
                suggest.hidden = true;
            }
        });

        overlay.querySelector('.no-add-create').onclick = async () => {
            const name = overlay.querySelector('#noAddName').value.trim();
            const phone = overlay.querySelector('#noAddPhone').value.trim();
            const address = overlay.querySelector('#noAddAddress').value.trim();
            if (!name && !phone) {
                notify('Cần tên hoặc SĐT khách', 'warning');
                return;
            }
            const btn = overlay.querySelector('.no-add-create');
            btn.disabled = true;
            try {
                const resp = await window.NativeOrdersApi.createManual({
                    customerName: name,
                    phone,
                    address,
                    customerId: selectedCustomerId,
                    fbUserId: selectedFbId || undefined,
                    products: cart.map((l) => ({
                        productCode: l.productCode,
                        name: l.name,
                        price: l.price,
                        quantity: l.quantity,
                        total: l.total,
                        imageUrl: l.imageUrl,
                        note: l.note,
                        source: l.source,
                        addedBy: l.addedBy,
                        addedById: l.addedById,
                    })),
                });
                const code = resp.order?.code;
                notify(
                    cart.length
                        ? `Đã tạo đơn inbox ${code} (${cart.length} SP)`
                        : `Đã tạo đơn inbox ${code}`,
                    'success'
                );
                close();
                await load();
            } catch (e) {
                btn.disabled = false;
                notify('Lỗi tạo đơn: ' + e.message, 'error');
            }
        };
        setTimeout(() => searchInp.focus(), 50);
    }

    async function bulkPrintBills() {
        const codes = getSelectedCodes();
        if (!codes.length) {
            notify('Chưa chọn đơn nào để in', 'warning');
            return;
        }
        if (!window.Web2Bill) {
            notify('Web2Bill chưa load — kiểm tra script', 'error');
            return;
        }
        const orders = codes.map((c) => STATE.orders.find((o) => o.code === c)).filter(Boolean);
        if (!orders.length) {
            notify('Không tìm thấy đơn', 'error');
            return;
        }
        // MỖI đơn in ĐÚNG LOẠI theo trạng thái (chọn mix trạng thái được):
        //   - NHÁP (draft)     → PHIẾU SOẠN HÀNG (modal, mở TUẦN TỰ từng đơn)
        //   - Đơn hàng (confirmed)/PBH → bill PBH (gộp 1 lần)
        const drafts = orders.filter((o) => o.status === 'draft');
        const others = orders.filter((o) => o.status !== 'draft');

        // Phí ship: tra giá theo phương thức giao của đơn (DeliveryMethodPicker,
        // option.value === o.deliveryMethod). PBH SHOP/bán tại shop → 0. Fallback
        // parse "(20k)" trong label. → bill cộng ship vào TỔNG + COD (giống PBH thật).
        const DMP = window.DeliveryMethodPicker;
        const deliveryOpts = DMP && DMP.getOptionsAsync ? await DMP.getOptionsAsync() : [];
        const shipPriceOf = (o) => {
            if (/pbh\s*shop|bán\s*hàng\s*shop|shop/i.test(o.pbhCarrierName || '')) return 0;
            if (o.deliveryMethod && deliveryOpts.length) {
                const opt = deliveryOpts.find((x) => x.value === o.deliveryMethod);
                if (opt) return Number(opt.price) || 0;
            }
            const m = (o.deliveryMethodLabel || '').match(/\((\d+)\s*k\)/i);
            return m ? parseInt(m[1], 10) * 1000 : 0;
        };

        // Dựng PBH-shape cho Web2Bill từ native order.
        const buildPbhShape = (o) => {
            const lines = (o.products || []).map((p) => ({
                productName: p.name || p.productName || '',
                quantity: Number(p.quantity) || 0,
                priceUnit: Number(p.price) || 0,
                uomName: p.uomName || 'Cái',
                note: p.note || '',
            }));
            const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
            const totalAmount = lines.reduce((s, l) => s + l.quantity * l.priceUnit, 0);
            const ship = shipPriceOf(o);
            const finalTotal = totalAmount + ship;
            return {
                number: o.code,
                displayStt: computeOrderStt(o), // STT khớp list (gộp "1 + 2", campaignStt)
                mergedDisplayStt: null,
                createdByName: o.assignedEmployeeName || o.createdByName || '', // NV bán
                partner: {
                    name: o.customerName || '',
                    phone: o.phone || '',
                    address: o.address || '',
                },
                orderLines: lines,
                totals: { quantity: totalQty, untaxed: totalAmount, total: finalTotal },
                payment: { amount: 0, residual: finalTotal }, // COD = SP + ship
                delivery: { price: ship, carrierName: o.pbhCarrierName || '' }, // ship + detect PBH SHOP
                channel: o.channel || '', // 'web2_inbox' → bill ghi "PBH INBOX"
                comment: o.note || '',
                dateInvoice: o.createdAt || new Date().toISOString(),
            };
        };

        // In bill PBH cho đơn đã xác nhận (gộp 1 lần).
        // Ghi số lần in (print_count) → tránh in trùng. Bump local + re-render
        // badge. Lỗi mạng → bỏ qua (không chặn in).
        const markPrinted = (codes) => {
            const arr = (Array.isArray(codes) ? codes : [codes]).filter(Boolean);
            if (!arr.length || !window.NativeOrdersApi?.markPrinted) return;
            window.NativeOrdersApi.markPrinted(arr)
                .then((r) => {
                    const counts = (r && r.counts) || {};
                    arr.forEach((c) => {
                        const o = STATE.orders.find((x) => x.code === c);
                        if (o)
                            o.printCount = counts[c] != null ? counts[c] : (o.printCount || 0) + 1;
                    });
                    renderRows();
                })
                .catch(() => {});
        };

        const printConfirmedBills = () => {
            if (!others.length) return;
            const pbhs = others.map(buildPbhShape);
            if (pbhs.length === 1) window.Web2Bill.openPrint(pbhs[0]);
            else window.Web2Bill.openCombinedPrint(pbhs);
            markPrinted(others.map((o) => o.code));
            notify(`Đang in ${pbhs.length} bill PBH...`, 'info');
        };

        // Đơn nháp → mở Phiếu Soạn Hàng TUẦN TỰ (đóng đơn này mở đơn kế); xong
        // hết mới in bill PBH cho đơn đã xác nhận. Không nháp → in bill ngay.
        if (drafts.length && window.NativeOrdersPackingSlip) {
            if (others.length)
                notify(
                    `${drafts.length} đơn nháp (soạn hàng) + ${others.length} đơn in bill PBH`,
                    'info'
                );
            let i = 0;
            const openNext = () => {
                if (i >= drafts.length) {
                    printConfirmedBills();
                    return;
                }
                const o = drafts[i++];
                window.NativeOrdersPackingSlip.open(o, {
                    sttDisplay: computeOrderStt(o),
                    onClose: openNext,
                    onPrint: (od) => markPrinted([od.code]),
                });
            };
            openNext();
        } else {
            printConfirmedBills();
        }
    }

    // Bulk send template message — port từ orders-report MessageTemplateManager.
    // Lookup order data → convert sang shape mà Web2MsgTemplate hiểu →
    // delegate cho `Web2MsgTemplate.open({orders})`. Module này tự handle UI
    // template + send loop + global_id resolution + extension fallback chain.
    async function bulkSendMessage() {
        const codes = getSelectedCodes();
        if (!codes.length) {
            notify('Chưa chọn đơn nào', 'warning');
            return;
        }
        if (!window.Web2MsgTemplate?.open) {
            notify('Web2MsgTemplate chưa load — kiểm tra script', 'error');
            return;
        }
        const rawOrders = codes.map((c) => STATE.orders.find((o) => o.code === c)).filter(Boolean);
        if (!rawOrders.length) {
            notify('Không tìm thấy đơn', 'error');
            return;
        }
        // Bỏ qua đơn SL=0 (giỏ trống — chưa nhập sản phẩm hoặc draft rỗng). Gửi
        // tin nhắn "đã đặt sản phẩm gồm: ..." cho đơn không sản phẩm rất kỳ.
        const orders = [];
        let skippedEmpty = 0;
        for (const o of rawOrders) {
            const totalQty = (o.products || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
            if (totalQty <= 0) {
                skippedEmpty++;
                continue;
            }
            orders.push(o);
        }
        if (skippedEmpty > 0) {
            notify(
                `Bỏ qua ${skippedEmpty} đơn SL=0 (giỏ trống) · còn ${orders.length} đơn để gửi`,
                'info'
            );
        }
        if (!orders.length) {
            notify('Tất cả đơn được chọn đều SL=0 — không có gì để gửi', 'warning');
            return;
        }
        // Convert sang shape Web2MsgTemplate cần. Conversation lookup: nếu order
        // chưa có conversationId (truth nguồn từ Pancake), fetch nhanh qua Web2Chat.
        const enriched = [];
        for (const o of orders) {
            const lines = (o.products || []).map((p) => ({
                productName: p.name || p.productName || p.productCode || '?',
                qty: Number(p.quantity) || 1,
                price: Number(p.price) || 0,
            }));
            let conversationId = null;
            let customerUuid = null;
            let threadId = null;
            if (window.Web2Chat && o.fbPageId && o.fbUserId) {
                try {
                    const r = await window.Web2Chat.fetchConversations(o.fbPageId, o.fbUserId);
                    if (r?.ok && r.conversations?.length) {
                        const conv = r.conversations[0];
                        conversationId = conv.id || null;
                        customerUuid = r.customerUuid || conv.customers?.[0]?.id || null;
                        threadId = conv.thread_id || conv.threadId || null;
                    }
                } catch (_) {
                    /* skip */
                }
            }
            const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
            enriched.push({
                code: o.code,
                customerName: o.customerName || '',
                fbUserName: o.fbUserName || '',
                phone: o.phone || '',
                address: o.address || '',
                fbPageId: o.fbPageId || '',
                fbUserId: o.fbUserId || '',
                conversationId,
                customerUuid,
                threadId,
                lines,
                total,
            });
        }
        await window.Web2MsgTemplate.open({ orders: enriched });
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
        const allSel = codes.map((c) => STATE.orders.find((o) => o.code === c)).filter(Boolean);
        if (allSel.length === 0) {
            notify('Không tìm thấy đơn', 'error');
            return;
        }
        // Đơn "Đơn hàng" (status confirmed) ĐÃ CÓ PBH → KHÔNG tạo PBH lại. Chỉ
        // đơn Nháp mới tạo được PBH.
        const orders = allSel.filter((o) => o.status === 'draft');
        const skipped = allSel.length - orders.length;
        if (orders.length === 0) {
            notify('Đơn "Đơn hàng" đã có PBH — không tạo PBH lại (chỉ đơn Nháp).', 'warning');
            return;
        }
        if (skipped > 0)
            notify(
                `Bỏ qua ${skipped} đơn "Đơn hàng" (đã có PBH) — tạo PBH cho ${orders.length} đơn Nháp`,
                'info'
            );
        const DMP = window.DeliveryMethodPicker;
        // Phase 17: load backend options once for both per-row pick + dropdown
        const deliveryOpts = DMP ? await DMP.getOptionsAsync() : [];

        // Compute per-row validation + auto-picked delivery option
        const rows = orders.map((o) => {
            const v = validateOrderForPbh(o);
            // Bulk: dùng pickOffline (fuzzy + province) — KHÔNG gọi Goong per-row
            // để tránh đốt quota; cross-check Goong chỉ ở tạo PBH đơn lẻ.
            const pick = DMP ? (DMP.pickOffline || DMP.pick)(o.address || '', deliveryOpts) : null;
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
                    dateInvoice: _dateInputToIsoWithNowTime(
                        root.querySelector('#bulkDateInvoice').value
                    ),
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
                if (!resp.ok || !data.success) {
                    // Prefer server-side message (vi-VN) over error code; nếu over_sell có
                    // violations thì gom vào message để row-error hiển thị tốt hơn.
                    let msg = data.message || data.error || `HTTP ${resp.status}`;
                    if (data.error === 'over_sell' && Array.isArray(data.violations)) {
                        msg +=
                            ' [' +
                            data.violations
                                .map((v) => `${v.code}:${v.requested}/${v.available}`)
                                .join(', ') +
                            ']';
                    }
                    throw new Error(msg);
                }
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

    async function cancelPbh(code) {
        const ok = await w2pConfirm(
            `Huỷ PBH đã tạo từ đơn ${code}? Trạng thái đơn web sẽ về Nháp, hành động không phục hồi tự động.`,
            {
                title: `Huỷ PBH ${code}?`,
                okText: 'Huỷ PBH',
                cancelText: 'Đóng',
                type: 'error',
            }
        );
        if (!ok) return;
        try {
            const resp = await fetch(
                `${WORKER_URL}/api/fast-sale-orders/by-source/${encodeURIComponent(code)}/cancel`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' } }
            );
            const data = await resp.json();
            if (!resp.ok || !data.success) throw new Error(data.error || `HTTP ${resp.status}`);
            notify(`Đã huỷ PBH ${data.order?.number || ''}`, 'success');
            await load();
        } catch (e) {
            notify('Lỗi huỷ PBH: ' + e.message, 'error');
            console.error('[cancelPbh]', e);
        }
    }

    // Gọi từ nút "Hủy PBH" trong banner lock của modal edit. Sau khi hủy PBH,
    // status đơn về 'cancelled' → user phải kéo SP mới để tạo native_order
    // mới (status='draft') vì current đã thành 'cancelled' (sync ngược).
    async function cancelPbhFromEdit(code) {
        await cancelPbh(code);
        closeEdit();
    }

    async function _doCreatePbh(code, extras) {
        try {
            const body = { nativeOrderCode: code, ...extras };
            // 2026-06-06: KH có SP "Thu về 1 phần" chờ → hỏi thêm vào bill 0đ.
            try {
                const ord = STATE.orders.find((o) => o.code === code);
                if (ord?.phone && window.NativeReturnBill?.collect) {
                    const rb = await window.NativeReturnBill.collect(ord.phone);
                    if (rb && rb.returnLines.length) {
                        body.returnLines = rb.returnLines;
                        body.returnCodes = rb.returnCodes;
                    }
                }
            } catch (e) {
                console.warn('[createPbh] return-bill check fail:', e);
            }
            const r = await fetch(`${WORKER_URL}/api/fast-sale-orders/from-native-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await r.json();
            if (!r.ok || !data.success) {
                // Server trả: { error: 'over_sell', message: '...', violations: [{code, requested, available}] }
                // hoặc { error: 'missing_phone', message: '...' } v.v. Ưu tiên message Vietnamese.
                const baseMsg = data.message || data.error || `HTTP ${r.status}`;
                if (
                    data.error === 'over_sell' &&
                    Array.isArray(data.violations) &&
                    data.violations.length
                ) {
                    // Show popup với detail violations nếu có Popup, fallback toast.
                    const list = data.violations
                        .map((v) => `• ${v.code}: cần ${v.requested}, kho còn ${v.available}`)
                        .join('\n');
                    if (window.Popup?.error) {
                        await window.Popup.error(
                            `${baseMsg}\n\n${list}\n\nNhập thêm tồn kho ở trang Sản Phẩm rồi thử lại.`,
                            {
                                title: 'Không đủ tồn kho',
                                okText: 'Đã hiểu',
                            }
                        );
                    } else {
                        notify(`${baseMsg}\n${list}`, 'error');
                    }
                    return;
                }
                throw new Error(baseMsg);
            }
            const isIdempotent = data.idempotent;
            const pbh = data.order;
            notify(
                `${isIdempotent ? 'PBH đã tồn tại' : 'Đã tạo PBH'}: ${pbh.number} (STT ${pbh.displayStt})`,
                'success'
            );
            // Celebrate fresh PBH creations (skip on idempotent — was already created)
            if (!isIdempotent && window.Web2Effects?.confetti) {
                window.Web2Effects.confetti({ particleCount: 80, spread: 70 });
            }
            await load();
        } catch (e) {
            notify('Lỗi tạo PBH: ' + e.message, 'error');
            console.error('[createPbh]', e);
        }
    }

    // 2026-06-04: PBH SHOP — bán tại shop. Tạo PBH cho các đơn đã chọn với
    // ship = 0, phương thức "PBH SHOP" (in lên phiếu + badge). Logic thu hộ
    // (trừ ví) giống PBH thường — server tự trừ ví khi tạo. Không cần địa chỉ.
    async function bulkCreatePbhShop() {
        const codes = getSelectedCodes();
        if (!codes.length) {
            notify('Chưa chọn đơn nào', 'warning');
            return;
        }
        // Đơn "Đơn hàng" (confirmed) ĐÃ CÓ PBH → KHÔNG tạo PBH SHOP lại. Chỉ đơn
        // Nháp + có sản phẩm (bán tại shop không bắt buộc địa chỉ).
        const selOrders = codes.map((c) => STATE.orders.find((x) => x.code === c)).filter(Boolean);
        const confirmedCount = selOrders.filter((o) => o.status !== 'draft').length;
        const valid = selOrders
            .filter((o) => {
                if (o.status !== 'draft') return false;
                const qty = (o.products || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
                return (o.products || []).length > 0 && qty > 0;
            })
            .map((o) => o.code);
        if (!valid.length) {
            notify(
                confirmedCount
                    ? 'Đơn "Đơn hàng" đã có PBH — không tạo PBH SHOP lại (chỉ đơn Nháp).'
                    : 'Đơn đã chọn chưa có sản phẩm',
                'warning'
            );
            return;
        }
        if (confirmedCount)
            notify(
                `Bỏ qua ${confirmedCount} đơn "Đơn hàng" (đã có PBH) — PBH SHOP cho ${valid.length} đơn Nháp`,
                'info'
            );
        // 1 đơn → mở MODAL "Tạo PBH SHOP" (giống Tạo PBH, phương thức = BÁN HÀNG
        // SHOP disable, ship 0) để xem/chỉnh cọc/ngày trước khi tạo.
        if (valid.length === 1) {
            return createPbh(valid[0], { shopMode: true });
        }
        const ok = await w2pConfirm(
            `Tạo PBH SHOP (bán tại shop) cho ${valid.length} đơn?\nPhí ship = 0, phương thức = "PBH SHOP". Khách có ví sẽ tự trừ thu hộ.`,
            { title: 'PBH SHOP', okText: 'Tạo PBH SHOP', cancelText: 'Đóng', type: 'info' }
        );
        if (!ok) return;
        const isoDate = new Date().toISOString();
        let done = 0,
            fail = 0;
        for (const code of valid) {
            try {
                const r = await fetch(`${WORKER_URL}/api/fast-sale-orders/from-native-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nativeOrderCode: code,
                        deliveryPrice: 0,
                        carrierName: 'PBH SHOP',
                        dateInvoice: isoDate,
                    }),
                });
                const data = await r.json();
                if (!r.ok || !data.success) throw new Error(data.message || data.error || 'lỗi');
                done++;
            } catch (e) {
                fail++;
                console.warn('[bulkCreatePbhShop]', code, e.message);
            }
        }
        notify(
            `PBH SHOP: tạo ${done}/${valid.length} đơn${fail ? `, lỗi ${fail}` : ''}`,
            fail ? 'warning' : 'success'
        );
        unselectAllOrders();
        await load();
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

    // Tách đơn nháp — tạo thêm 1 đơn mới cùng KH/SĐT/địa chỉ, giỏ trống. Original
    // giữ products. Server backfill split_index=1 cho original (nếu lần đầu) và
    // assign split_index=N+1 cho đơn mới. Hiển thị "<STT>-N" cho cả 2.
    async function splitOrder(code) {
        const src = STATE.orders.find((o) => o.code === code);
        if (!src) {
            notify('Không tìm thấy đơn ' + code, 'error');
            return;
        }
        const sttDisplay =
            src.splitIndex && src.splitIndex > 0
                ? `${src.displayStt}-${src.splitIndex}`
                : String(src.displayStt ?? '');
        const ok = await w2pConfirm(
            `Tách thêm 1 đơn nháp từ ${code} (STT ${sttDisplay}) cho KH ${src.customerName || '—'}?\n\n` +
                `Đơn mới sẽ có giỏ hàng RỖNG, cùng SĐT/địa chỉ. STT đơn mới: ${src.displayStt}-N (N = max split index hiện tại + 1).`,
            {
                title: `Tách đơn ${code}?`,
                okText: 'Tách',
                cancelText: 'Đóng',
                type: 'info',
            }
        );
        if (!ok) return;
        try {
            const r = await fetch(
                `${WORKER_URL}/api/native-orders/${encodeURIComponent(code)}/split-order`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                }
            );
            const data = await r.json();
            if (!r.ok || !data.success)
                throw new Error(data.message || data.error || `HTTP ${r.status}`);
            notify(
                `Đã tách: ${data.source.code} (STT ${data.source.displayStt}-${data.source.splitIndex || 1}) + ${data.created.code} (STT ${data.created.displayStt}-${data.created.splitIndex})`,
                'success'
            );
            await load();
        } catch (e) {
            notify('Lỗi tách đơn: ' + e.message, 'error');
            console.error('[splitOrder]', e);
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
                    // Yellow-flash the row so user notices the live update
                    if (window.Web2Effects?.highlightRow) {
                        const code = msg.order.code || msg.code;
                        const row = code
                            ? document.querySelector(
                                  `tr.order-row[data-code="${CSS.escape(code)}"]`
                              )
                            : null;
                        if (row) window.Web2Effects.highlightRow(row);
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

    // ---------- SSE subscription cho data CRUD (Web2SSE bridge) ----------
    // Server side gọi notifyClients('web2:native-orders', { action, code, ts })
    // sau mỗi POST/PATCH/DELETE → client tự reload list.
    // Khác với rtConnect (chuyên về Pancake messages), SSE bridge này dành
    // riêng cho data sync giữa các máy cùng xem trang Đơn Web.
    let _sseUnsubscribe = null;
    let _sseUnsubCk = null; // web2:payment-signals (badge "KH báo đã CK")
    let _sseReloadTimer = null;
    function _scheduleReload(reason) {
        // Debounce 600ms để gom nhiều mutation gần nhau thành 1 reload.
        if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
        _sseReloadTimer = setTimeout(() => {
            _sseReloadTimer = null;
            console.log('[NativeOrders-SSE] reload:', reason);
            load();
        }, 600);
    }
    function _sseConnect() {
        if (!window.Web2SSE?.subscribe) {
            console.warn('[NativeOrders-SSE] Web2SSE not loaded — skip realtime data sync');
            return;
        }
        if (_sseUnsubscribe) return;
        // Đơn web đổi → reload (badge state, total, …).
        _sseUnsubscribe = window.Web2SSE.subscribe('web2:native-orders', (msg) =>
            _scheduleReload(`native-orders ${msg.data?.action || ''} ${msg.data?.code || ''}`)
        );
        // KH nhắn "đã ck"/"ck xong" (signal mới) HOẶC watcher tự khớp tiền → badge
        // "💸 KH báo đã CK" hiện/đổi xanh LIVE, không cần refresh tay.
        _sseUnsubCk = window.Web2SSE.subscribe('web2:payment-signals', (msg) =>
            _scheduleReload(`payment-signal ${msg.data?.action || ''}`)
        );
    }

    // ---------- Init ----------
    async function _loadAndRenderScopeBanner() {
        try {
            const data = await window.NativeOrdersApi.getKpiScope();
            if (!data?.success) return;
            // Admin / no assignments → no banner (sees all)
            if (data.access !== 'restricted' || !Array.isArray(data.scope) || !data.scope.length) {
                return;
            }
            // Render banner trên đầu page (sau header)
            const banner = document.createElement('div');
            banner.id = 'kpiScopeBanner';
            banner.style.cssText =
                'background:#dbeafe;color:#1e40af;padding:8px 16px;border-bottom:1px solid #93c5fd;' +
                'font-size:13px;display:flex;align-items:center;gap:8px;';
            const summary = data.scope
                .map(
                    (s) =>
                        `<strong>${escapeHtml(s.campaign_name)}</strong> STT ${s.fromSTT}-${s.toSTT}`
                )
                .join(' · ');
            banner.innerHTML = `<i data-lucide="filter" style="width:14px;height:14px;"></i>
                <span>Bạn chỉ thấy đơn trong khoảng được phân công: ${summary}</span>`;
            const tabNav = document.querySelector('.tab-navigation, .web2-page-tabs');
            if (tabNav?.parentElement) {
                tabNav.parentElement.insertBefore(banner, tabNav.nextSibling);
            } else {
                document.body.insertBefore(banner, document.body.firstChild);
            }
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.warn('[native-orders] scope banner load fail:', e.message);
        }
    }

    function init() {
        if (window.lucide) lucide.createIcons();
        // Sprint 3 KPI: load + render scope banner (NV được phân khoảng → hiển thị)
        _loadAndRenderScopeBanner();
        // Phase 14: hydrate customerId filter from URL
        const urlParams = new URLSearchParams(location.search);
        const urlCid = parseInt(urlParams.get('customerId'), 10);
        if (Number.isFinite(urlCid)) STATE.customerId = urlCid;
        // Hydrate search box from `?search=...` (vd link từ web2-products usage popover)
        const urlSearch = urlParams.get('search');
        if (urlSearch) {
            const inp = document.getElementById('filterSearch');
            if (inp) inp.value = urlSearch;
            STATE.search = urlSearch;
        }
        rtConnect();
        _sseConnect();

        // 2026-06-05: click badge "💸 KH báo đã CK" → web2-ck-review (đối chiếu GD
        // SePay + duyệt). Delegated vì badge render động trong bảng.
        document.addEventListener('click', (e) => {
            const badge = e.target.closest?.('[data-ck-review]');
            if (!badge || !window.Web2CkReview) return;
            e.stopPropagation();
            window.Web2CkReview.openReview({
                signalId: Number(badge.dataset.ckReview),
                phone: badge.dataset.ckPhone || '',
                name: badge.dataset.ckName || '',
                onDone: () => load(),
            });
        });

        // Apply/Clear/Refresh/Export buttons removed in single-row layout —
        // filters now auto-apply on change (debounced for search input).
        // Reset STT button removed 2026-06-02 — STT giờ auto reset theo campaign
        // (logic backend MAX+1 scoped by campaign group), không cần thao tác thủ công.
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
        // 2026-06-04: tab kênh đơn (Livestream / Inbox) + nút Thêm đơn inbox.
        $('#channelTabs')?.addEventListener('click', (e) => {
            const tab = e.target.closest('.no-channel-tab');
            if (!tab) return;
            $('#channelTabs')
                .querySelectorAll('.no-channel-tab')
                .forEach((t) => t.classList.remove('is-active'));
            tab.classList.add('is-active');
            STATE.channel = tab.dataset.channel;
            const addBtn = $('#btnAddInboxOrder');
            if (addBtn) addBtn.style.display = STATE.channel === 'web2_inbox' ? '' : 'none';
            STATE.page = 1;
            load();
        });
        $('#btnAddInboxOrder')?.addEventListener('click', openAddInboxOrder);
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
        $('#ordersBulkPbhShop')?.addEventListener('click', bulkCreatePbhShop);
        $('#ordersBulkMerge')?.addEventListener('click', bulkMergeOrders);
        $('#ordersBulkPrintBill')?.addEventListener('click', bulkPrintBills);
        $('#ordersBulkSendMessage')?.addEventListener('click', bulkSendMessage);
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
            // 2026-06-01: Web 2.0 aggregate (native + PBH + refunds) thay legacy.
            // Backend shape: {success, native:[], pbh:[], refund:[],
            //   totals:{native:{count,amount}, pbh:{count,amount}, refund:{count,amount}, net},
            //   summary:{totalNative, totalNativeAmount, totalPbh, totalPbhAmount, ...},
            //   orders:[{source,number,date,state,totalAmount,itemCount}]}.
            // Items trong native[]/pbh[] có shape: {source, number, date, state,
            //   totalAmount, itemCount} — KHÔNG có .code (PBH dùng .number, đơn web cũng dùng .number).
            // 2026-06-02 fix: cũ đọc summary.native.count → undefined → "Cannot read
            // properties of undefined" — chuyển sang totals.native.count + tổng item shape.
            const r = await fetch(`${WORKER_URL}/api/web2/customer-orders/${customerId}?limit=20`);
            const data = await r.json();
            if (!data?.success) throw new Error(data?.error || `HTTP ${r.status}`);
            const native = Array.isArray(data.native) ? data.native : [];
            const pbh = Array.isArray(data.pbh) ? data.pbh : [];
            const totals = data.totals || {};
            const nativeTotal = totals.native || { count: native.length, amount: 0 };
            const pbhTotal = totals.pbh || { count: pbh.length, amount: 0 };
            const refundTotal = totals.refund || { count: 0, amount: 0 };
            const renderRow = (label, items) => `
                <div style="margin-bottom:14px;">
                    <div style="font-weight:600;margin-bottom:6px;color:#111827;">${label} (${items.length})</div>
                    ${
                        items.length === 0
                            ? '<div style="color:#9ca3af;font-style:italic;">Không có đơn</div>'
                            : `<table style="width:100%;border-collapse:collapse;font-size:12px;">
                                <thead><tr style="background:#f9fafb;text-align:left;">
                                    <th style="padding:6px 8px;">Mã</th>
                                    <th style="padding:6px 8px;">SL SP</th>
                                    <th style="padding:6px 8px;text-align:right;">Tổng</th>
                                    <th style="padding:6px 8px;">Trạng thái</th>
                                    <th style="padding:6px 8px;">Ngày</th>
                                </tr></thead>
                                <tbody>
                                ${items
                                    .slice(0, 10)
                                    .map(
                                        (it) => `<tr style="border-top:1px solid #e5e7eb;">
                                            <td style="padding:6px 8px;font-weight:600;">${escapeHtml(it.number || it.code || '—')}</td>
                                            <td style="padding:6px 8px;">${it.itemCount ?? it.totalQuantity ?? '—'}</td>
                                            <td style="padding:6px 8px;text-align:right;">${money(it.totalAmount ?? it.amountTotal ?? 0)}</td>
                                            <td style="padding:6px 8px;">${escapeHtml(it.state || it.status || '—')}</td>
                                            <td style="padding:6px 8px;color:#6b7280;">${it.date ? new Date(it.date).toLocaleDateString('vi-VN') : '—'}</td>
                                        </tr>`
                                    )
                                    .join('')}
                                </tbody>
                            </table>`
                    }
                </div>`;
            const refundBlock =
                refundTotal.count > 0
                    ? `<div style="background:#fee2e2;color:#991b1b;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
                       <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Trả hàng</div>
                       <div style="font-size:18px;font-weight:700;">${refundTotal.count}</div>
                       <div style="font-size:11px;">${money(refundTotal.amount)}</div>
                   </div>`
                    : '';
            body.innerHTML = `
                <div style="display:flex;gap:14px;margin-bottom:16px;flex-wrap:wrap;">
                    <div style="background:#ede9fe;color:#5b21b6;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Đơn web (NW)</div>
                        <div style="font-size:18px;font-weight:700;">${nativeTotal.count}</div>
                        <div style="font-size:11px;">${money(nativeTotal.amount)}</div>
                    </div>
                    <div style="background:#dbeafe;color:#1e40af;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Phiếu bán hàng (HD)</div>
                        <div style="font-size:18px;font-weight:700;">${pbhTotal.count}</div>
                        <div style="font-size:11px;">${money(pbhTotal.amount)}</div>
                    </div>
                    ${refundBlock}
                </div>
                ${renderRow('Đơn web', native)}
                ${renderRow('PBH', pbh)}
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
     * Web2Chat client is loaded via index.html (`web2/shared/web2-chat-client.js`).
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

    /**
     * Build the avatar + info HTML used inside `.w2-inbox-header`. Extracted
     * so we can re-render only the header when the user clicks a different
     * conversation in the sidebar (see `_applyChatHeaderForOrder`).
     */
    function _renderChatHeaderInner(order) {
        const initials = (order.customerName || order.fbUserName || '?')
            .trim()
            .split(/\s+/)
            .slice(-2)
            .map((s) => s.charAt(0).toUpperCase())
            .join('');
        const phoneHtml = order.phone
            ? `<span class="w2-chat-phone" data-phone="${escapeHtml(order.phone)}" title="Click để copy SĐT">📞 ${escapeHtml(order.phone)} <i data-lucide="copy" style="width:11px;height:11px;display:inline;margin-left:2px;vertical-align:middle;opacity:0.55;"></i></span>`
            : `<span style="color:#cbd5e1;">không SĐT</span>`;
        const tagsHtml =
            Array.isArray(order.tags) && order.tags.length
                ? order.tags
                      .slice(0, 4)
                      .map(
                          (t) =>
                              `<span style="background:#f0fdf4;color:#166534;font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid #bbf7d0;">${escapeHtml(t)}</span>`
                      )
                      .join('')
                : '';
        const avatarHtml =
            order.fbUserId && order.fbPageId
                ? `<img src="${escapeHtml(_avatarUrl(order.fbUserId, order.fbPageId))}" alt="${escapeHtml(order.customerName || order.fbUserName || '?')}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);" loading="eager" onerror="this.outerHTML='<div style=&quot;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:14px;&quot;>${escapeHtml(initials).replace(/'/g, '&#39;')}</div>'" />`
                : `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:14px;">${escapeHtml(initials)}</div>`;
        const codeBadge = order.code
            ? `<span style="background:#e0e7ff;color:#4338ca;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;">${escapeHtml(order.code)}</span>`
            : '';
        const pageBadge = order.fbPageId
            ? `<span style="background:#dbeafe;color:#1e40af;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;">Page …${escapeHtml(String(order.fbPageId).slice(-6))}</span>`
            : '';
        const infoHtml = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                <strong style="font-size:15px;color:#0f172a;">${escapeHtml(order.customerName || order.fbUserName || '—')}</strong>
                ${codeBadge}
                ${tagsHtml}
            </div>
            <div style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                ${phoneHtml}
                ${pageBadge}
            </div>`;
        return { avatarHtml, infoHtml };
    }

    /**
     * Swap the avatar + info section of the open chat modal in-place to
     * reflect a different customer/order. Sidebar, message thread and
     * action buttons stay mounted — only the header content changes, so
     * scroll position, search input, and WebSocket subscriptions survive.
     */
    function _applyChatHeaderForOrder(order) {
        const { avatarHtml, infoHtml } = _renderChatHeaderInner(order);
        const av = document.getElementById('w2ChatHeaderAvatar');
        const info = document.getElementById('w2ChatHeaderInfo');
        if (av) av.innerHTML = avatarHtml;
        if (info) info.innerHTML = infoHtml;
        if (window.lucide?.createIcons) window.lucide.createIcons();
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
        // Apply pop entrance to overlay + card (only on first open of this modal session)
        modal.classList.add('w2fx-backdrop');
        const { avatarHtml, infoHtml } = _renderChatHeaderInner(order);
        const totalEarn = order.amountTotal || order.total;
        const totalHtml = totalEarn
            ? `<div style="align-self:center;font-size:12px;color:#64748b;margin-right:6px;">Tổng đơn: <strong style="color:#15803d;font-size:13px;">${(Number(totalEarn) || 0).toLocaleString('vi-VN')}đ</strong></div>`
            : '';

        modal.innerHTML = `
            <div class="w2p-card w2fx-pop w2-inbox-card" style="width:96vw;height:92vh;max-width:1600px;display:flex;flex-direction:column;overflow:hidden;">
                <div class="w2-inbox-grid">
                    <aside class="w2-inbox-sidebar" id="w2InboxSidebar">
                        ${_renderInboxSidebarShell()}
                    </aside>
                    <main class="w2-inbox-center">
                        <div class="w2-inbox-header">
                            <div id="w2ChatHeaderAvatar" style="flex-shrink:0;display:flex;align-items:center;">${avatarHtml}</div>
                            <div id="w2ChatHeaderInfo" style="flex:1;min-width:0;">${infoHtml}</div>
                            <div style="display:flex;gap:4px;flex-shrink:0;align-items:center;">
                                <button type="button" class="w2-inbox-icon-btn" title="Lịch sử mua" data-action="open-history"><i data-lucide="history" style="width:14px;height:14px;"></i></button>
                                <button type="button" class="w2-inbox-icon-btn" title="Thông tin khách" data-action="toggle-info"><i data-lucide="user" style="width:14px;height:14px;"></i></button>
                                <button type="button" class="w2-inbox-icon-btn" title="Đơn liên quan" data-action="open-orders"><i data-lucide="package" style="width:14px;height:14px;"></i></button>
                                <button type="button" class="w2-inbox-icon-btn" data-action="open-pancake" title="Mở đầy đủ trong TPOS × Pancake"><i data-lucide="external-link" style="width:14px;height:14px;"></i></button>
                                <button onclick="NativeOrdersApp._closeInteractions()" title="Đóng" style="width:30px;height:30px;background:transparent;border:1px solid transparent;font-size:18px;cursor:pointer;color:#94a3b8;line-height:1;border-radius:6px;margin-left:4px;">×</button>
                            </div>
                        </div>
                        <div class="w2-inbox-tabs">
                            <button class="interactions-tab ${tab === 'messages' ? 'is-active' : ''}" data-tab="messages">
                                <i data-lucide="message-circle" style="width:14px;height:14px;"></i> Tin nhắn
                                ${Number(order.messageCount) > 0 ? `<span class="w2-inbox-tab-badge ${tab === 'messages' ? 'is-active' : ''}">${order.messageCount}</span>` : ''}
                            </button>
                            <button class="interactions-tab ${tab === 'comments' ? 'is-active' : ''}" data-tab="comments">
                                <i data-lucide="message-square" style="width:14px;height:14px;"></i> Bình luận
                                ${Number(order.commentCount) > 0 ? `<span class="w2-inbox-tab-badge ${tab === 'comments' ? 'is-active' : ''}">${order.commentCount}</span>` : ''}
                            </button>
                            <div style="flex:1;"></div>
                            ${totalHtml}
                        </div>
                        <div id="interactionsBody" class="w2p-scroll-area" style="flex:1;min-height:0;padding:0;background:#ebebeb;">${
                            tab === 'messages'
                                ? _renderMessagesPanel(order)
                                : _renderCommentsPanel(order)
                        }</div>
                    </main>
                    <aside class="w2-inbox-right" id="w2InboxRight">
                        ${_renderInboxRightPanel(order, 'create')}
                    </aside>
                </div>
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

        _ensureChatModalCss();
        if (window.lucide) lucide.createIcons();

        // Wire header buttons (always present). Phone click uses delegation
        // because the header info DOM is re-built when user switches to a
        // different conversation via _switchChatToCustomer.
        const headerInfo = modal.querySelector('#w2ChatHeaderInfo');
        headerInfo?.addEventListener('click', (e) => {
            const phoneEl = e.target.closest('.w2-chat-phone');
            if (!phoneEl) return;
            const phone = phoneEl.dataset.phone || '';
            if (!phone) return;
            navigator.clipboard?.writeText(phone).then(
                () => notify('Đã copy SĐT: ' + phone, 'success'),
                () => notify('Không copy được', 'error')
            );
        });
        const pancakeBtn = modal.querySelector('[data-action="open-pancake"]');
        pancakeBtn?.addEventListener('click', () => {
            if (!order.fbUserId || !order.fbPageId) {
                notify('Đơn không có Facebook user/page ID', 'warning');
                return;
            }
            const url = `../tpos-pancake/index.html?focusFbUserId=${encodeURIComponent(order.fbUserId)}&focusPageId=${encodeURIComponent(order.fbPageId)}${order.liveCampaignId ? '&focusCampaign=' + encodeURIComponent(order.liveCampaignId) : ''}`;
            window.open(url, '_blank', 'noopener');
        });

        // Wire send + reply button handlers per current tab
        if (tab === 'messages') {
            // Lazy-load conversation thread (async, non-blocking)
            _loadAndRenderThread(order);
            // Lazy-load the left sidebar conversation list for this page.
            _loadInboxSidebar(order);
            _wireQuickReplyTags();
            _wireRightPanelTabs(order);
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
            // Quick reply: button opens picker, `/shortcut` triggers autocomplete
            const qrBtn = modal.querySelector('[data-action="open-quick-reply"]');
            qrBtn?.addEventListener('click', () => {
                window.Web2QuickReply?.openModal({
                    onSelect: (reply) => {
                        const ta = document.getElementById('msgInput');
                        if (!ta) return;
                        ta.value =
                            (reply.message || '') + (window.Web2QuickReply?.signature() || '');
                        ta.focus();
                    },
                });
            });
            if (input && window.Web2QuickReply?.attachAutocomplete) {
                window.Web2QuickReply.attachAutocomplete(input, {
                    onAutoSend: () => _handleSendMessage(order),
                });
            }
            // Toolbar actions
            modal
                .querySelector('[data-action="refresh-thread"]')
                ?.addEventListener('click', () => _loadAndRenderThread(order));
            modal.querySelector('[data-action="scroll-bottom"]')?.addEventListener('click', () => {
                const t = document.getElementById('msgThread');
                if (!t) return;
                t.scrollTop = t.scrollHeight;
                const jb = document.getElementById('msgJumpBottom');
                if (jb) jb.style.display = 'none';
                if (_chatState) _chatState.missedSince = 0;
            });
            modal
                .querySelector('[data-action="insert-signature"]')
                ?.addEventListener('click', () => {
                    const ta = document.getElementById('msgInput');
                    if (!ta) return;
                    const sig = window.Web2QuickReply?.signature?.() || '\nNv. ';
                    const before = ta.value;
                    ta.value = (before + sig).trimStart();
                    ta.focus();
                    ta.setSelectionRange(ta.value.length, ta.value.length);
                });
            // Đính kèm tệp / hình ảnh (gửi qua extension UPLOAD_INBOX_PHOTO → REPLY)
            const fileInput = modal.querySelector('#msgFileInput');
            const imageInput = modal.querySelector('#msgImageInput');
            modal
                .querySelector('[data-action="attach-file"]')
                ?.addEventListener('click', () => fileInput?.click());
            modal
                .querySelector('[data-action="attach-image"]')
                ?.addEventListener('click', () => imageInput?.click());
            fileInput?.addEventListener('change', (e) => {
                if (e.target.files[0]) _setPendingAttachment(e.target.files[0]);
            });
            imageInput?.addEventListener('change', (e) => {
                if (e.target.files[0]) _setPendingAttachment(e.target.files[0]);
            });
            // Delegate "↩ trả lời" button on bubbles (rendered dynamically)
            modal.addEventListener('click', (e) => {
                const replyBtn = e.target.closest('[data-action="reply-to"]');
                if (replyBtn) {
                    e.stopPropagation();
                    _setReplyTarget(replyBtn.dataset.msgId);
                }
            });
            // Escape clears reply target
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && _chatState?.replyTo) {
                    e.preventDefault();
                    _setReplyTarget(null);
                }
            });
        } else if (tab === 'comments') {
            // Sidebar shows page-wide conv list regardless of which tab is
            // active — load it here too. Without this the sidebar stayed
            // as the loading skeleton when the user opened comments first.
            _loadInboxSidebar(order);
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

    // ─── INBOX SIDEBAR + RIGHT PANEL (Pancake-style 3-col layout) ───
    //
    // The chat modal is now a full inbox shell: left column lists every
    // conversation for the order's page (real-time via WS), centre column
    // hosts the existing chat thread, right column holds customer info +
    // a Pancake-style create-order form. See
    // `docs/plans/native-orders-pancake-inbox.md` for the phased spec
    // mapped from the live Pancake admin inbox DOM.

    function _renderInboxSidebarShell() {
        return `
            <div class="w2-inbox-sb-head">
                <div class="w2-inbox-sb-search">
                    <i data-lucide="search" style="width:13px;height:13px;color:#94a3b8;"></i>
                    <input type="text" id="w2InboxSearch" placeholder="Tìm kiếm" autocomplete="off" />
                </div>
                <div class="w2-inbox-sb-filter-wrap">
                    <button class="w2-inbox-sb-filter" type="button" id="w2InboxFilterBtn" title="Bộ lọc">
                        <i data-lucide="sliders-horizontal" style="width:12px;height:12px;"></i>
                        <span id="w2InboxFilterLabel">Lọc theo</span>
                        <span class="w2-inbox-sb-filter-count" id="w2InboxFilterCount" hidden></span>
                    </button>
                    <div class="w2-inbox-sb-filter-menu w2-fm-pancake" id="w2InboxFilterMenu" hidden>
                        <div class="w2-fm-col w2-fm-col-cats">
                            <div class="w2-fm-section">Thẻ hội thoại</div>
                            <button type="button" class="w2-fm-cat" data-cat="include-tags">
                                <i data-lucide="tag" style="width:13px;height:13px;color:#7c3aed;"></i>
                                <span class="w2-fm-cat-label">Có chứa thẻ</span>
                                <span class="w2-fm-cat-count" data-for="include-tags"></span>
                                <i data-lucide="chevron-right" style="width:13px;height:13px;color:#94a3b8;"></i>
                            </button>
                            <button type="button" class="w2-fm-cat" data-cat="exclude-tags">
                                <i data-lucide="tag" style="width:13px;height:13px;color:#94a3b8;"></i>
                                <span class="w2-fm-cat-label">Loại trừ thẻ</span>
                                <span class="w2-fm-cat-count" data-for="exclude-tags"></span>
                                <i data-lucide="chevron-right" style="width:13px;height:13px;color:#94a3b8;"></i>
                            </button>
                            <div class="w2-fm-divider"></div>
                            <div class="w2-fm-section">Điều kiện</div>
                            <button type="button" class="w2-fm-cat" data-cat="conditions">
                                <i data-lucide="puzzle" style="width:13px;height:13px;color:#7c3aed;"></i>
                                <span class="w2-fm-cat-label">Điều kiện</span>
                                <span class="w2-fm-cat-count" data-for="conditions"></span>
                                <i data-lucide="chevron-right" style="width:13px;height:13px;color:#94a3b8;"></i>
                            </button>
                            <div class="w2-fm-divider"></div>
                            <button type="button" class="w2-fm-reset" id="w2InboxFilterReset">
                                <i data-lucide="rotate-ccw" style="width:12px;height:12px;"></i> Xoá bộ lọc
                            </button>
                        </div>
                        <div class="w2-fm-col w2-fm-col-sub" id="w2InboxFilterSub"></div>
                    </div>
                </div>
            </div>
            <div class="w2-inbox-sb-list" id="w2InboxConvList">
                <div class="w2-inbox-sb-empty">
                    <div class="w2-chat-skeleton-bubble" style="height:60px;border-radius:8px;margin:4px 8px;"></div>
                    <div class="w2-chat-skeleton-bubble" style="height:60px;border-radius:8px;margin:4px 8px;"></div>
                    <div class="w2-chat-skeleton-bubble" style="height:60px;border-radius:8px;margin:4px 8px;"></div>
                    <div class="w2-chat-skeleton-bubble" style="height:60px;border-radius:8px;margin:4px 8px;"></div>
                </div>
            </div>`;
    }

    function _renderInboxRightPanel(order, _defaultTab = 'info') {
        // Right panel shows customer + current-order context only.
        // Order creation lives in web 2.0's tpos-pancake page — not
        // re-implemented here per user direction.
        return `
            <div class="w2-inbox-right-tabs">
                <button class="w2-inbox-right-tab is-active" data-rtab="info">Thông tin</button>
            </div>
            <div class="w2-inbox-right-body" id="w2InboxRightBody">
                ${_renderInfoTab(order)}
            </div>`;
    }

    function _renderInfoTab(order) {
        const phone = order.phone || '';
        const initial = (order.customerName || order.fbUserName || '?')
            .trim()
            .charAt(0)
            .toUpperCase();
        // Use the Pancake avatar proxy when we have both fb_user_id + fb_page_id;
        // the <img onerror> swap falls back to the gradient+initial placeholder.
        // The onerror string lives inside double-quoted attribute, so the inner
        // class attribute uses &quot; (matches header avatar's escape pattern).
        const safeInitial = escapeHtml(initial).replace(/'/g, '&#39;');
        const avatarFallback = `<div class="w2-customer-card-avatar">${safeInitial}</div>`;
        const avatarHtml =
            order.fbUserId && order.fbPageId
                ? `<img class="w2-customer-card-avatar" src="${escapeHtml(_avatarUrl(order.fbUserId, order.fbPageId))}" alt="${escapeHtml(order.customerName || order.fbUserName || '?')}" style="object-fit:cover;" loading="lazy" onerror="this.outerHTML='<div class=&quot;w2-customer-card-avatar&quot;>${safeInitial}</div>'" />`
                : avatarFallback;
        return `
            <div class="w2-section">
                <div class="w2-section-title-row">
                    <span class="w2-section-title"><i data-lucide="user" style="width:13px;height:13px;"></i> Khách hàng</span>
                    <div style="display:flex;gap:4px;">
                        <button class="w2-inbox-icon-btn" title="Sửa khách"><i data-lucide="pen" style="width:12px;height:12px;"></i></button>
                    </div>
                </div>
                <div class="w2-form-row w2-form-row-2col">
                    <input class="w2-input" type="text" placeholder="Tên khách" value="${escapeHtml(order.customerName || order.fbUserName || '')}" readonly />
                    <input class="w2-input" type="text" placeholder="SĐT" value="${escapeHtml(phone)}" readonly />
                </div>
                <input class="w2-input" type="text" placeholder="Địa chỉ" value="${escapeHtml(order.address || '')}" readonly />
                <div class="w2-customer-card">
                    ${avatarHtml}
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:12px;color:#0f172a;">${escapeHtml(order.customerName || order.fbUserName || '—')}</div>
                        <div style="font-size:11px;color:#64748b;">${escapeHtml(phone || '—')} ${phone ? '<span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;margin-left:3px;">Mobifone</span>' : ''}</div>
                    </div>
                </div>
            </div>

            <div class="w2-section">
                <div class="w2-section-title"><i data-lucide="receipt" style="width:13px;height:13px;"></i> Đơn hiện tại</div>
                <div class="w2-info-row"><span class="w2-info-label">Mã đơn</span><span class="w2-info-val"><strong>${escapeHtml(order.code)}</strong></span></div>
                <div class="w2-info-row"><span class="w2-info-label">Trạng thái</span><span class="w2-info-val">${escapeHtml(order.status || '—')}</span></div>
                <div class="w2-info-row"><span class="w2-info-label">Tổng tiền</span><span class="w2-info-val"><strong style="color:#15803d;">${(Number(order.amountTotal || order.total) || 0).toLocaleString('vi-VN')}đ</strong></span></div>
                <div class="w2-info-row"><span class="w2-info-label">Tags</span><span class="w2-info-val">${(order.tags || []).map((t) => `<span style="background:#f0fdf4;color:#166534;font-size:10px;font-weight:600;padding:1px 7px;border-radius:999px;border:1px solid #bbf7d0;margin-right:3px;">${escapeHtml(t)}</span>`).join('') || '—'}</span></div>
            </div>

            <div class="w2-section">
                <div class="w2-section-title"><i data-lucide="sticky-note" style="width:13px;height:13px;"></i> Ghi chú nội bộ</div>
                <textarea class="w2-info-note" placeholder="Thêm ghi chú..." rows="3">${escapeHtml(order.note || '')}</textarea>
            </div>

            <div class="w2-section">
                <div class="w2-section-title"><i data-lucide="history" style="width:13px;height:13px;"></i> Lịch sử đơn</div>
                <div id="w2PastOrdersList" style="font-size:12px;color:#94a3b8;text-align:center;padding:14px 0;">
                    (chưa kết nối — sẽ load đơn cũ của SĐT này)
                </div>
            </div>`;
    }

    /**
     * Quick-reply colour-coded tag chips rendered just above the input.
     * Tags come from the user's saved set (Pancake stores them in localStorage
     * keyed by page_id; for now we read whatever Web 1.0 wrote there. The
     * Phase 4 work is to manage these via the settings page).
     */
    const W2_DEFAULT_QUICK_TAGS = [
        {
            label: 'NV My KH đặt',
            tpl: 'Dạ shop xác nhận đơn của mình ạ. Nv.My',
            color: 'rgba(33, 68, 247, 0.4)',
        },
        {
            label: 'NV My CK + Gấp',
            tpl: 'Dạ ck giúp shop để gửi gấp nha ạ. Nv.My',
            color: 'rgba(33, 68, 247, 0.4)',
        },
        {
            label: 'NHẮC KHÁCH',
            tpl: 'Dạ mình nhắc nhẹ khách iu ơi 💕',
            color: 'rgba(241, 71, 255, 0.4)',
        },
        {
            label: 'XIN ĐỊA CHỈ',
            tpl: 'Dạ chị iu xác nhận giúp e địa chỉ + sđt nha ạ 🌷',
            color: 'rgba(18, 101, 10, 0.4)',
        },
        { label: 'NV . BO', tpl: '', color: 'rgba(10, 241, 238, 0.4)' },
        { label: 'NJD ƠI', tpl: '', color: 'rgba(146, 84, 222, 0.4)' },
        { label: 'NV. Lài', tpl: '', color: 'rgba(244, 241, 24, 0.4)' },
        { label: 'NV. Hạnh 🌷', tpl: '', color: 'rgba(75, 147, 68, 0.4)' },
        { label: 'Nv.Huyền 🐣', tpl: '', color: 'rgba(247, 200, 33, 0.4)' },
        { label: 'Nv. Duyên', tpl: '', color: 'rgba(33, 200, 247, 0.4)' },
        { label: 'XỬ LÝ BC', tpl: '', color: 'rgba(244, 80, 24, 0.4)' },
        { label: 'BOOM', tpl: '', color: 'rgba(247, 33, 33, 0.4)' },
        { label: 'CHECK IB', tpl: '', color: 'rgba(140, 84, 33, 0.4)' },
        { label: 'Nv My', tpl: 'Nv.My', color: 'rgba(33, 68, 247, 0.4)' },
    ];

    function _loadQuickTags() {
        try {
            const raw = localStorage.getItem('w2_quick_reply_tags');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) return parsed;
            }
        } catch {
            /* ignore */
        }
        return W2_DEFAULT_QUICK_TAGS;
    }

    function _renderQuickReplyTags() {
        const tags = _loadQuickTags();
        return `<div class="w2-quick-reply-row">
            ${tags
                .map(
                    (t) =>
                        `<button class="w2-quick-tag" data-tpl="${escapeHtml(t.tpl || t.label)}" style="background:${t.color};">${escapeHtml(t.label)}</button>`
                )
                .join('')}
        </div>`;
    }

    /**
     * Bind clicks on the quick-reply tag chips so a single click pastes the
     * template + employee signature into #msgInput and focuses it.
     */
    function _wireQuickReplyTags() {
        document.querySelectorAll('.w2-quick-tag').forEach((btn) => {
            btn.addEventListener('click', () => {
                const ta = document.getElementById('msgInput');
                if (!ta) return;
                const tpl = btn.getAttribute('data-tpl') || '';
                const sig = window.Web2QuickReply?.signature?.() || '';
                ta.value = (tpl + (tpl.endsWith(sig) || !sig ? '' : '\n' + sig)).trim();
                ta.focus();
                // Cursor at end so the user can edit
                ta.selectionStart = ta.selectionEnd = ta.value.length;
            });
        });
    }

    /**
     * Right column currently only has a single rendered tab (Thông tin);
     * the Tạo đơn slot is an external link to web 2.0's order-creation
     * page since web 2.0 already owns that flow. Kept the helper so a
     * future "Lịch sử" or "Ghi chú dài" tab can drop in easily.
     */
    function _wireRightPanelTabs(_order) {
        // No-op for now. The Thông tin tab is rendered by default and the
        // Tạo đơn link is a plain <a target=_blank>.
    }

    /**
     * Pull the conversation list and render rows into the sidebar.
     *
     * Multi-page: fetch from EVERY page the user has a JWT for (House,
     * Store, … in localStorage `pancake_all_accounts`) so the sidebar
     * isn't artificially scoped to the order's page. The WS handler
     * already accepts cross-page events, so this just brings the
     * initial list (and fallback poll) in line with realtime coverage.
     * Highlights the row that matches the currently-open order's customer.
     */
    function _getSidebarPageIds(order) {
        const set = new Set();
        if (order && order.fbPageId) set.add(String(order.fbPageId));
        // Every page across every saved account — covers House + Store
        // even when `Web2Chat.getAllPageAccessTokens` only has 1 page.
        try {
            const accs = JSON.parse(localStorage.getItem('pancake_all_accounts') || '{}');
            for (const v of Object.values(accs)) {
                const pages = Array.isArray(v?.pages) ? v.pages : [];
                for (const p of pages) {
                    const pid = p?.id || p?.page_id || p?.pageId;
                    if (pid) set.add(String(pid));
                }
            }
        } catch {
            /* tolerate; fall back to order.fbPageId only */
        }
        // Page-access-token map is a useful secondary source when the
        // multi-account JSON is empty (older installs).
        const pat = window.Web2Chat?.getAllPageAccessTokens?.() || {};
        for (const k of Object.keys(pat)) set.add(String(k));
        return [...set].filter(Boolean);
    }

    async function _fetchConvsMerged(pageIds, limitPerPage) {
        if (!pageIds.length) return { ok: false, reason: 'no_pages', conversations: [] };
        const settled = await Promise.allSettled(
            pageIds.map((pid) =>
                window.Web2Chat.fetchConversationsByPage(pid, { limit: limitPerPage })
            )
        );
        const all = [];
        for (const r of settled) {
            if (r.status !== 'fulfilled' || !r.value?.ok) continue;
            for (const c of r.value.conversations || []) all.push(c);
        }
        // Dedupe by conv id (a customer might appear in multiple pages
        // under different conv IDs — that's fine, two rows). Sort by
        // updated_at desc, top 50 to mirror the single-page cap.
        const byId = new Map();
        for (const c of all) {
            const k = String(c.id || '');
            if (!k) continue;
            const cur = byId.get(k);
            if (!cur) {
                byId.set(k, c);
                continue;
            }
            const t1 = new Date(c.updated_at || c.last_sent_at || 0).getTime();
            const t2 = new Date(cur.updated_at || cur.last_sent_at || 0).getTime();
            if (t1 > t2) byId.set(k, c);
        }
        const merged = [...byId.values()].sort((a, b) => {
            const ta = new Date(a.updated_at || a.last_sent_at || 0).getTime();
            const tb = new Date(b.updated_at || b.last_sent_at || 0).getTime();
            return tb - ta;
        });
        return { ok: true, conversations: merged.slice(0, 50) };
    }

    // ============ INBOX-ONLY: resolve hội thoại Pancake theo SĐT ============
    // Đơn inbox tay thường CHƯA có fb_id (khác đơn livestream — luôn có sẵn
    // fbUserId/fbPageId). Khi chỉ có SĐT, search hội thoại Pancake theo SĐT để
    // lấy psid + page + avatar → hiện avatar ở list + mở đúng đoạn hội thoại.
    // KHÔNG đụng logic đơn livestream: các nhánh dùng helper này đều gate bằng
    // "order thiếu fbPageId" (đơn livestream luôn có fbPageId → không bao giờ vào).
    const _inboxPhoneCache = new Map(); // normPhone -> Promise|resolved|null

    function _normPhone(p) {
        let s = String(p || '').replace(/\D/g, '');
        if (!s) return '';
        if (s.length === 11 && s.startsWith('84')) s = '0' + s.slice(2);
        else if (!s.startsWith('0') && s.length >= 9) s = '0' + s.slice(-9);
        return s;
    }

    async function _resolveInboxConvByPhone(phone) {
        const norm = _normPhone(phone);
        if (!norm || norm.length < 8) return null;
        const cached = _inboxPhoneCache.get(norm);
        if (cached !== undefined) return cached; // promise hoặc value (kể cả null đã cache)
        const job = (async () => {
            if (!window.Web2Chat?.searchConversations) return null;
            if (window.Web2Chat.syncFromRenderDB) {
                try {
                    await window.Web2Chat.syncFromRenderDB();
                } catch {
                    /* tolerate */
                }
            }
            const pageIds = _getSidebarPageIds({});
            if (!pageIds.length) return null;
            const settled = await Promise.allSettled(
                pageIds.map((pid) => window.Web2Chat.searchConversations(pid, norm))
            );
            let best = null;
            const tail9 = norm.slice(-9);
            for (let i = 0; i < settled.length; i++) {
                const r = settled[i];
                if (r.status !== 'fulfilled' || !r.value?.ok) continue;
                const convs = r.value.conversations || [];
                for (const c of convs) {
                    const cust = c.customers?.[0] || c.from || {};
                    const cphone = _normPhone(cust.phone || cust.phone_number || '');
                    const phoneMatch = cphone && (cphone === norm || cphone.endsWith(tail9));
                    // Nhiều kết quả mà SĐT không khớp → bỏ (tránh nhận nhầm khách khác).
                    if (!phoneMatch && convs.length > 1) continue;
                    const fbId = String(cust.fb_id || cust.id || c.from_customer_id || '');
                    if (!fbId) continue;
                    const isInbox = (c.type || '').toUpperCase() === 'INBOX';
                    const cand = {
                        fbId,
                        pageId: String(c.page_id || c.fb_page_id || pageIds[i] || ''),
                        conversationId: c.id || null,
                        name: cust.name || cust.full_name || c.name || '',
                        avatarUrl: c.from?.avatar_url || cust.avatar_url || '',
                        phoneMatch: !!phoneMatch,
                        isInbox,
                    };
                    // Ưu tiên: SĐT khớp > INBOX type > kết quả đầu.
                    if (
                        !best ||
                        (cand.phoneMatch && !best.phoneMatch) ||
                        (cand.phoneMatch === best.phoneMatch && cand.isInbox && !best.isInbox)
                    ) {
                        best = cand;
                    }
                }
            }
            return best;
        })();
        _inboxPhoneCache.set(norm, job);
        const res = await job;
        // Cache giá trị thật. Nếu KHÔNG tìm thấy → xoá khỏi cache để lần sau (vd
        // sau khi token sẵn sàng / mở chat) có thể thử lại.
        if (res) _inboxPhoneCache.set(norm, res);
        else _inboxPhoneCache.delete(norm);
        return res;
    }

    // Sau khi render danh sách đơn inbox: với các row có SĐT nhưng chưa có fb_id,
    // resolve avatar theo SĐT rồi gắn ảnh + lưu fb context vào order in-memory để
    // mở chat tức thì. Chạy nền (không chặn render). Chỉ chạy ở tab Inbox.
    let _inboxAvatarHydrating = false;
    async function _hydrateInboxAvatars() {
        if (STATE.channel !== 'web2_inbox' || _inboxAvatarHydrating) return;
        const tb = tbody();
        if (!tb) return;
        const wraps = [...tb.querySelectorAll('.tpos-customer-avatar-wrap')].filter(
            (w) =>
                !w.dataset.fbUserId &&
                (w.dataset.customerPhone || '').trim() &&
                w.dataset.avatarHydrated !== '1'
        );
        if (!wraps.length) return;
        _inboxAvatarHydrating = true;
        try {
            for (const wrap of wraps.slice(0, 40)) {
                wrap.dataset.avatarHydrated = '1';
                const phone = wrap.dataset.customerPhone;
                const code = wrap.closest('tr')?.dataset?.code;
                let r = null;
                try {
                    r = await _resolveInboxConvByPhone(phone);
                } catch {
                    /* tolerate */
                }
                if (!r || !r.fbId) continue;
                const o = STATE.orders.find((x) => x.code === code);
                if (o) {
                    o.fbUserId = o.fbUserId || r.fbId;
                    o.fbPageId = o.fbPageId || r.pageId;
                }
                wrap.dataset.fbUserId = r.fbId;
                wrap.dataset.fbPageId = r.pageId;
                const av = wrap.querySelector('.cust-avatar');
                if (av && !av.querySelector('.cust-avatar-img')) {
                    const url = r.avatarUrl || _avatarUrl(r.fbId, r.pageId);
                    if (url) {
                        const initial = av.textContent.trim();
                        av.innerHTML =
                            `<span class="cust-avatar-initial">${escapeHtml(initial)}</span>` +
                            `<img class="cust-avatar-img" src="${escapeHtml(url)}" alt="" loading="lazy" onload="this.classList.add('loaded')" onerror="this.remove()">`;
                    }
                }
            }
        } finally {
            _inboxAvatarHydrating = false;
        }
    }

    async function _loadInboxSidebar(order) {
        const list = document.getElementById('w2InboxConvList');
        if (!list) return;
        // Sidebar is independent of the order's page — like tpos-pancake's
        // PancakeColumnManager + pancake.vn merge mode, it loads ALL pages
        // the user has access to so any customer chat is reachable even
        // when modal was opened from a single-page order.
        if (!window.Web2Chat?.fetchConversationsByPage) {
            list.innerHTML =
                '<div class="w2-inbox-sb-empty" style="padding:24px;color:#94a3b8;font-size:12px;text-align:center;">Web2Chat chưa hỗ trợ list theo page</div>';
            return;
        }
        // Wait for the account sync that the chat panel kicks off — without
        // a JWT this list call would 401. The sync is cached so this is a
        // single-flight Promise the second caller awaits.
        if (window.Web2Chat.syncFromRenderDB) {
            try {
                await window.Web2Chat.syncFromRenderDB();
            } catch {
                /* tolerate; sidebar will show no_jwt error if it really is missing */
            }
        }
        try {
            const pageIds = _getSidebarPageIds(order);
            const res = await _fetchConvsMerged(pageIds, 50);
            if (!res.ok || !res.conversations.length) {
                list.innerHTML = `<div class="w2-inbox-sb-empty" style="padding:24px;color:#94a3b8;font-size:12px;text-align:center;">Chưa có hội thoại${res.reason ? ` (${escapeHtml(res.reason)})` : ''}</div>`;
                return;
            }
            list.innerHTML = res.conversations.map((c) => _convRowHtml(c, order)).join('');
            if (window.lucide?.createIcons) window.lucide.createIcons();
            // Auto-scroll to active row
            const active = list.querySelector('.w2-inbox-conv.is-active');
            if (active) active.scrollIntoView({ block: 'center' });
            // Wire row clicks — switch chat to that customer (and stay in
            // the same modal; we re-trigger _loadAndRenderThread with a
            // synthetic order-like object containing the customer info).
            list.querySelectorAll('.w2-inbox-conv').forEach((row) => {
                row.addEventListener('click', () => {
                    const fbId = row.dataset.fbId;
                    const cName = row.dataset.cName;
                    const rowPage = row.dataset.pageId || '';
                    if (!fbId) return;
                    _switchChatToCustomer(order, fbId, cName, rowPage);
                    // Mark row read locally
                    row.classList.remove('is-unread');
                    row.querySelector('.w2-inbox-conv-badge')?.remove();
                });
            });
            // Subscribe to page-wide WS so the sidebar updates without a
            // full re-fetch when new messages arrive in other conversations.
            _wireSidebarRealtime(order);
            // Wire the search input — server-side conversation search via
            // Pancake's POST /api/v1/pages/{pageId}/conversations/search.
            _wireSidebarSearch(order, res.conversations);
            // Wire the "Lọc theo" dropdown + apply current filter.
            _wireSidebarFilter(order);
            _applySidebarFilter();
        } catch (e) {
            console.warn('[NativeOrders] sidebar load failed:', e.message);
            list.innerHTML = `<div class="w2-inbox-sb-empty" style="padding:24px;color:#dc2626;font-size:12px;text-align:center;">Lỗi tải: ${escapeHtml(e.message)}</div>`;
        }
    }

    /**
     * Sidebar search: debounce 300ms after the user stops typing, then
     * hit `Web2Chat.searchConversations(pageId, query)` and rebuild the
     * list with the results. Empty query → restore the original page
     * list. AbortController cancels an in-flight request when a newer
     * keystroke arrives so we never render stale data on top of fresh.
     */
    let _searchAbort = null;
    let _searchTimer = null;
    function _wireSidebarSearch(order, baselineConvs) {
        const input = document.getElementById('w2InboxSearch');
        if (!input || !window.Web2Chat?.searchConversations) return;
        // Idempotent — bail if already wired.
        if (input.dataset.searchWired === '1') return;
        input.dataset.searchWired = '1';

        const doSearch = async (query) => {
            const list = document.getElementById('w2InboxConvList');
            if (!list) return;
            if (_searchAbort) _searchAbort.abort();
            if (!query.trim()) {
                // Empty query → restore baseline page list
                list.innerHTML = baselineConvs.map((c) => _convRowHtml(c, order)).join('');
                _bindConvRowClicks(list, order);
                if (window.lucide?.createIcons) window.lucide.createIcons();
                _applySidebarFilter();
                return;
            }
            // Đơn inbox tay chưa bind page (order.fbPageId rỗng) → KHÔNG gọi
            // server search (cần pageId). Lọc client-side trên baseline đa-page
            // đã load để user tìm đúng hội thoại theo tên/SĐT.
            if (!order.fbPageId) {
                const qn = stripVi(query.trim());
                const matched = baselineConvs.filter((c) => {
                    const cust = c.customers?.[0] || c.from || {};
                    const hay = stripVi(
                        [
                            cust.name,
                            cust.full_name,
                            cust.phone,
                            c.snippet,
                            c.last_message?.message,
                            c.last_message_text,
                        ]
                            .filter(Boolean)
                            .join(' ')
                    );
                    return hay.includes(qn);
                });
                if (!matched.length) {
                    list.innerHTML = `<div class="w2-inbox-sb-empty" style="padding:24px;color:#94a3b8;font-size:12px;text-align:center;">Không có hội thoại khớp "${escapeHtml(query)}"<br><span style="font-size:11px;">Xoá ô tìm để xem tất cả hội thoại.</span></div>`;
                    return;
                }
                list.innerHTML = matched.map((c) => _convRowHtml(c, order)).join('');
                _bindConvRowClicks(list, order);
                if (window.lucide?.createIcons) window.lucide.createIcons();
                _applySidebarFilter();
                return;
            }
            _searchAbort = new AbortController();
            // Visual hint: dim the list while we wait
            list.style.opacity = '0.55';
            try {
                const res = await window.Web2Chat.searchConversations(
                    order.fbPageId,
                    query.trim(),
                    { signal: _searchAbort.signal }
                );
                if (res.reason === 'aborted') return; // newer keystroke superseded
                if (!res.ok) {
                    list.innerHTML = `<div class="w2-inbox-sb-empty" style="padding:24px;color:#dc2626;font-size:12px;text-align:center;">Lỗi tìm: ${escapeHtml(res.reason || 'unknown')}</div>`;
                    return;
                }
                if (!res.conversations.length) {
                    list.innerHTML = `<div class="w2-inbox-sb-empty" style="padding:24px;color:#94a3b8;font-size:12px;text-align:center;">Không có kết quả cho "${escapeHtml(query)}"</div>`;
                    return;
                }
                list.innerHTML = res.conversations.map((c) => _convRowHtml(c, order)).join('');
                _bindConvRowClicks(list, order);
                if (window.lucide?.createIcons) window.lucide.createIcons();
                _applySidebarFilter();
            } finally {
                list.style.opacity = '';
            }
        };

        input.addEventListener('input', () => {
            const v = input.value;
            if (_searchTimer) clearTimeout(_searchTimer);
            _searchTimer = setTimeout(() => doSearch(v), 300);
        });
        // Enter triggers immediate fire (no wait for debounce)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (_searchTimer) clearTimeout(_searchTimer);
                doSearch(input.value);
            }
        });

        // Đơn inbox tay chưa bind hội thoại → tự điền ô tìm (ưu tiên SĐT vì khớp
        // chính xác hơn tên) để list lọc sẵn đúng hội thoại, user chỉ việc click.
        if (!order.fbPageId) {
            const seed = (order.phone || order.customerName || '').trim();
            if (seed) {
                input.value = seed;
                doSearch(seed);
            }
        }
    }

    // ---------- Sidebar filter (Lọc theo) ----------
    // Client-side row filter applied on top of whatever is currently in
    // `#w2InboxConvList` (initial load, search results, or merged poll
    // updates). Decoupled from search so a user can search "0123" then
    // narrow to unread, or filter unread and then search.
    // Pancake-style filter state: tag include/exclude + conditions, all AND-combined.
    // Untagged is modelled as a pseudo-tag id "__untagged" inside the
    // include/exclude sets so the existing AND logic handles it uniformly.
    const UNTAGGED = '__untagged';
    const _filter = {
        includeTags: new Set(), // tag IDs (or UNTAGGED) — pass if row has ANY
        excludeTags: new Set(), // tag IDs (or UNTAGGED) — pass if row has NONE
        conditions: new Set(), // 'unread'|'read'|'unreplied'|'has-phone'|'has-live'
    };
    const _CONDITION_LABELS = {
        unread: 'Chưa đọc',
        read: 'Đã đọc',
        unreplied: 'Chưa trả lời',
        'has-phone': 'Có SĐT',
        'has-live': 'Có đơn livestream',
    };
    // Tag dictionary from Pancake page settings: { [id]: { id, text, color } }.
    // Populated lazily on first filter-menu open per page.
    const _pageTagDict = new Map(); // pageId → Map<id, tagObj>
    let _activeSubCat = null; // 'include-tags'|'exclude-tags'|'conditions'|null
    let _currentPageId = null;

    // Persisted filter state per-page so reopening the modal restores
    // the user's selection. Pancake itself resets filteredTag/Type to
    // ALL/false on reload (Redux memory only); we go one better.
    const _LS_FILTER = 'n2store_native_inbox_filter_v1';

    function _loadFilterStateFor(pageId) {
        _filter.includeTags.clear();
        _filter.excludeTags.clear();
        _filter.conditions.clear();
        if (!pageId) return;
        try {
            const raw = localStorage.getItem(_LS_FILTER);
            if (!raw) return;
            const obj = JSON.parse(raw);
            const entry = obj?.[pageId];
            if (!entry) return;
            (entry.includeTags || []).forEach((t) => _filter.includeTags.add(String(t)));
            (entry.excludeTags || []).forEach((t) => _filter.excludeTags.add(String(t)));
            (entry.conditions || []).forEach((c) => _filter.conditions.add(String(c)));
        } catch {
            /* ignore corrupt */
        }
    }

    function _persistFilterState() {
        if (!_currentPageId) return;
        try {
            const raw = localStorage.getItem(_LS_FILTER);
            const obj = raw ? JSON.parse(raw) || {} : {};
            const total =
                _filter.includeTags.size + _filter.excludeTags.size + _filter.conditions.size;
            if (total === 0) {
                delete obj[_currentPageId];
            } else {
                obj[_currentPageId] = {
                    includeTags: Array.from(_filter.includeTags),
                    excludeTags: Array.from(_filter.excludeTags),
                    conditions: Array.from(_filter.conditions),
                };
            }
            localStorage.setItem(_LS_FILTER, JSON.stringify(obj));
        } catch {
            /* quota — non-critical */
        }
    }

    function _filterActiveCount() {
        return _filter.includeTags.size + _filter.excludeTags.size + _filter.conditions.size;
    }

    function _rowMatchesFilter(row) {
        const unread = row.classList.contains('is-unread');
        const tagged = Number(row.dataset.tagCount || 0) > 0;
        const hasPhone = row.dataset.hasPhone === '1';
        const hasLive = row.dataset.hasLive === '1';
        const replied = row.dataset.replied === '1';
        const rowTagIds = (row.dataset.tagIds || '').split(',').filter(Boolean);

        // Tag include: pass if includeTags empty, else row must have at least
        // one of the included tags (or UNTAGGED matches if row has no tags).
        if (_filter.includeTags.size > 0) {
            let ok = false;
            if (_filter.includeTags.has(UNTAGGED) && rowTagIds.length === 0) ok = true;
            if (!ok) {
                for (const id of rowTagIds) {
                    if (_filter.includeTags.has(id)) {
                        ok = true;
                        break;
                    }
                }
            }
            if (!ok) return false;
        }
        // Tag exclude: pass if row has none of the excluded tags.
        if (_filter.excludeTags.size > 0) {
            if (_filter.excludeTags.has(UNTAGGED) && rowTagIds.length === 0) return false;
            for (const id of rowTagIds) {
                if (_filter.excludeTags.has(id)) return false;
            }
        }
        // Conditions AND-combined.
        for (const cond of _filter.conditions) {
            switch (cond) {
                case 'unread':
                    if (!unread) return false;
                    break;
                case 'read':
                    if (unread) return false;
                    break;
                case 'unreplied':
                    if (replied) return false;
                    break;
                case 'tagged':
                    if (!tagged) return false;
                    break;
                case 'has-phone':
                    if (!hasPhone) return false;
                    break;
                case 'has-live':
                    if (!hasLive) return false;
                    break;
            }
        }
        return true;
    }

    function _applySidebarFilter() {
        const list = document.getElementById('w2InboxConvList');
        if (!list) return;
        const rows = list.querySelectorAll('.w2-inbox-conv');
        let visible = 0;
        rows.forEach((row) => {
            const show = _rowMatchesFilter(row);
            row.style.display = show ? '' : 'none';
            if (show) visible += 1;
        });
        const existingHint = list.querySelector('[data-filter-empty]');
        if (existingHint) existingHint.remove();
        if (rows.length > 0 && visible === 0 && _filterActiveCount() > 0) {
            const empty = document.createElement('div');
            empty.dataset.filterEmpty = '1';
            empty.style.cssText =
                'padding:24px;color:#94a3b8;font-size:12px;text-align:center;font-style:italic;';
            empty.textContent = 'Không có hội thoại nào khớp bộ lọc';
            list.appendChild(empty);
        }
        _updateFilterButtonVisual();
        _updateFilterCatCounts();
    }

    function _updateFilterButtonVisual() {
        const btn = document.getElementById('w2InboxFilterBtn');
        const countEl = document.getElementById('w2InboxFilterCount');
        if (!btn || !countEl) return;
        const n = _filterActiveCount();
        btn.classList.toggle('is-active', n > 0);
        if (n > 0) {
            countEl.removeAttribute('hidden');
            countEl.textContent = String(n);
        } else {
            countEl.setAttribute('hidden', '');
            countEl.textContent = '';
        }
    }

    function _updateFilterCatCounts() {
        const menu = document.getElementById('w2InboxFilterMenu');
        if (!menu) return;
        const map = {
            'include-tags': _filter.includeTags.size,
            'exclude-tags': _filter.excludeTags.size,
            conditions: _filter.conditions.size,
        };
        menu.querySelectorAll('.w2-fm-cat-count').forEach((el) => {
            const key = el.dataset.for;
            const n = map[key] || 0;
            el.textContent = n > 0 ? String(n) : '';
        });
    }

    /**
     * Render the right-hand sub-panel content based on which category the
     * user clicked. Tag pickers (include/exclude) share a list renderer.
     */
    function _renderFilterSub(cat) {
        const sub = document.getElementById('w2InboxFilterSub');
        if (!sub) return;
        _activeSubCat = cat;
        document
            .querySelectorAll('#w2InboxFilterMenu .w2-fm-cat')
            .forEach((b) => b.classList.toggle('is-active', b.dataset.cat === cat));
        if (cat === 'include-tags' || cat === 'exclude-tags') {
            sub.innerHTML = _renderFilterSubTags(cat);
            _wireFilterSubTags(cat);
        } else if (cat === 'conditions') {
            sub.innerHTML = _renderFilterSubConditions();
            _wireFilterSubConditions();
        } else {
            sub.innerHTML =
                '<div class="w2-fm-sub-placeholder">Chọn nhóm điều kiện bên trái để xem tuỳ chọn.</div>';
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function _tagDictForCurrentPage() {
        return _pageTagDict.get(_currentPageId) || new Map();
    }

    function _renderFilterSubTags(cat) {
        const set = cat === 'include-tags' ? _filter.includeTags : _filter.excludeTags;
        const dict = _tagDictForCurrentPage();
        const tags = Array.from(dict.values()).sort((a, b) =>
            String(a.text || '').localeCompare(String(b.text || ''), 'vi')
        );
        const untaggedChecked = set.has(UNTAGGED);
        const rows = [
            `<label class="w2-fm-row" data-tagid="${UNTAGGED}">
                <input type="checkbox" ${untaggedChecked ? 'checked' : ''} />
                <span class="w2-fm-tag-chip w2-fm-tag-chip-empty">Không gắn thẻ</span>
            </label>`,
        ];
        for (const tag of tags) {
            const id = String(tag.id);
            const checked = set.has(id);
            const color = tag.color || '#94a3b8';
            const text = escapeHtml(tag.text || `Thẻ #${id}`);
            rows.push(
                `<label class="w2-fm-row" data-tagid="${escapeHtml(id)}">
                    <input type="checkbox" ${checked ? 'checked' : ''} />
                    <span class="w2-fm-tag-chip" style="background:${escapeHtml(color)};">${text}</span>
                </label>`
            );
        }
        const body = tags.length
            ? rows.join('')
            : `<div class="w2-fm-sub-empty">Đang tải danh sách thẻ…</div>`;
        return `
            <div class="w2-fm-sub-search">
                <i class="w2-fm-sub-search-icon" data-lucide="search" style="width:13px;height:13px;"></i>
                <input type="text" placeholder="Tìm kiếm thẻ" data-tag-search />
            </div>
            <div class="w2-fm-sub-list" data-tag-list>${body}</div>`;
    }

    function _wireFilterSubTags(cat) {
        const sub = document.getElementById('w2InboxFilterSub');
        if (!sub) return;
        const set = cat === 'include-tags' ? _filter.includeTags : _filter.excludeTags;
        const list = sub.querySelector('[data-tag-list]');
        const search = sub.querySelector('[data-tag-search]');
        list?.addEventListener('change', (e) => {
            const row = e.target.closest('.w2-fm-row');
            if (!row) return;
            const id = row.dataset.tagid;
            if (e.target.checked) set.add(id);
            else set.delete(id);
            _applySidebarFilter();
            _persistFilterState();
        });
        search?.addEventListener('input', () => {
            const q = (search.value || '').trim().toLowerCase();
            list.querySelectorAll('.w2-fm-row').forEach((row) => {
                const txt = row.textContent.toLowerCase();
                row.style.display = !q || txt.includes(q) ? '' : 'none';
            });
        });
    }

    function _renderFilterSubConditions() {
        const items = Object.entries(_CONDITION_LABELS)
            .map(([key, label]) => {
                const checked = _filter.conditions.has(key);
                return `<label class="w2-fm-row" data-cond="${escapeHtml(key)}">
                    <input type="checkbox" ${checked ? 'checked' : ''} />
                    <span>${escapeHtml(label)}</span>
                </label>`;
            })
            .join('');
        return `<div class="w2-fm-sub-list">${items}</div>`;
    }

    function _wireFilterSubConditions() {
        const sub = document.getElementById('w2InboxFilterSub');
        sub?.addEventListener('change', (e) => {
            const row = e.target.closest('.w2-fm-row[data-cond]');
            if (!row) return;
            const key = row.dataset.cond;
            if (e.target.checked) _filter.conditions.add(key);
            else _filter.conditions.delete(key);
            _applySidebarFilter();
            _persistFilterState();
        });
    }

    /**
     * Load page tag definitions via Web2Chat.fetchPageSettings + merge any
     * tag IDs seen on rendered convs (so we still show numeric placeholders
     * if the settings call fails). Re-renders the open sub-panel.
     */
    async function _loadPageTagsForFilter(pageId) {
        if (!pageId) return;
        _currentPageId = pageId;
        // Seed dictionary with IDs collected from rendered rows — covers
        // the case where settings call later fails / is slow.
        if (!_pageTagDict.has(pageId)) _pageTagDict.set(pageId, new Map());
        const dict = _pageTagDict.get(pageId);
        document.querySelectorAll('#w2InboxConvList .w2-inbox-conv').forEach((row) => {
            (row.dataset.tagIds || '')
                .split(',')
                .filter(Boolean)
                .forEach((id) => {
                    if (!dict.has(id)) dict.set(id, { id, text: `Thẻ #${id}`, color: '#94a3b8' });
                });
        });
        if (!window.Web2Chat?.fetchPageSettings) return;
        try {
            const res = await window.Web2Chat.fetchPageSettings(pageId);
            if (!res.ok) return;
            const tags = res.settings?.tags;
            if (!Array.isArray(tags)) return;
            for (const t of tags) {
                if (t && t.id != null) {
                    dict.set(String(t.id), {
                        id: String(t.id),
                        text: t.text || `Thẻ #${t.id}`,
                        color: t.color || '#94a3b8',
                    });
                }
            }
            // Refresh open sub-panel so newly-loaded names/colors show.
            if (_activeSubCat === 'include-tags' || _activeSubCat === 'exclude-tags') {
                _renderFilterSub(_activeSubCat);
            }
        } catch (e) {
            console.warn('[NativeOrders] loadPageTagsForFilter failed:', e.message);
        }
    }

    function _wireSidebarFilter(order) {
        const btn = document.getElementById('w2InboxFilterBtn');
        const menu = document.getElementById('w2InboxFilterMenu');
        if (!btn || !menu) return;
        // Page context refresh — runs every time a sidebar reloads even if
        // listeners are already wired, so switching to a different page
        // picks up that page's stored filter.
        const nextPageId = order?.fbPageId || null;
        if (nextPageId !== _currentPageId) {
            _currentPageId = nextPageId;
            _loadFilterStateFor(_currentPageId);
        }
        if (btn.dataset.filterWired === '1') return;
        btn.dataset.filterWired = '1';

        const close = () => menu.setAttribute('hidden', '');
        const open = () => {
            menu.removeAttribute('hidden');
            // Default to the most useful panel: conditions list.
            if (!_activeSubCat) _renderFilterSub('conditions');
            else _renderFilterSub(_activeSubCat);
            // Lazy-load page tags for the tag pickers.
            _loadPageTagsForFilter(_currentPageId);
        };

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.hasAttribute('hidden')) open();
            else close();
        });
        menu.addEventListener('click', (e) => {
            const cat = e.target.closest('.w2-fm-cat');
            if (cat) {
                e.stopPropagation();
                _renderFilterSub(cat.dataset.cat);
                return;
            }
            const reset = e.target.closest('#w2InboxFilterReset');
            if (reset) {
                _filter.includeTags.clear();
                _filter.excludeTags.clear();
                _filter.conditions.clear();
                _applySidebarFilter();
                _persistFilterState();
                if (_activeSubCat) _renderFilterSub(_activeSubCat);
            }
        });
        // Close on outside click (capture so popup-internal clicks reach handlers first)
        document.addEventListener(
            'click',
            (e) => {
                if (!menu.parentElement?.contains(e.target)) close();
            },
            { capture: true }
        );
        _updateFilterButtonVisual();
        _updateFilterCatCounts();
    }

    /**
     * Shared click binding for sidebar rows — extracted so both initial
     * render and search-result render reuse the same handler instead of
     * duplicating the logic.
     */
    function _bindConvRowClicks(list, order) {
        list.querySelectorAll('.w2-inbox-conv').forEach((row) => {
            row.addEventListener('click', () => {
                const fbId = row.dataset.fbId;
                const cName = row.dataset.cName;
                const rowPage = row.dataset.pageId || '';
                if (!fbId) return;
                _switchChatToCustomer(order, fbId, cName, rowPage);
                row.classList.remove('is-unread');
                row.querySelector('.w2-inbox-conv-badge')?.remove();
            });
        });
    }

    /**
     * Format any timestamp as `HH:mm` in GMT+7 (Asia/Ho_Chi_Minh).
     *
     * Pancake's API returns timestamps like `"2026-05-15T03:03:57.107000"`
     * — ISO-shaped but WITHOUT a 'Z' suffix or offset. Per the ECMAScript
     * spec, JS parses a date-time without a timezone as **local time**, so
     * a browser in GMT+7 would record this as 03:03 GMT+7 (= 20:03 UTC
     * the day before). Pancake actually stores them in UTC, so we
     * normalise by appending 'Z' when the input is a string with no
     * explicit offset.
     */
    function _fmtVnTime(ts) {
        if (!ts) return '';
        let parseInput = ts;
        if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ts)) {
            const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(ts);
            if (!hasZone) parseInput = ts + 'Z';
        }
        const d = new Date(parseInput);
        if (Number.isNaN(d.getTime())) return '';
        try {
            return d.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
            });
        } catch {
            return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
    }

    function _convRowHtml(c, currentOrder) {
        const cust = c.customers?.[0] || c.from || {};
        const fbId = String(cust.fb_id || cust.id || c.from_customer_id || '');
        const cName = cust.name || cust.full_name || 'Khách';
        const lastMsg =
            (c.last_message?.message || c.last_message_text || c.snippet || '').slice(0, 120) ||
            '(không có nội dung)';
        const updated = c.updated_at || c.last_sent_at || c.inserted_at;
        const time = _fmtVnTime(updated);
        const isActive =
            String(currentOrder.fbUserId || '') === fbId &&
            String(currentOrder.fbPageId || '') === String(c.page_id || c.fb_page_id || '');
        const unread = c.unread_count || c.unread || 0;
        const tagList = Array.isArray(c.tags) ? c.tags : [];
        const tagCount = tagList.length;
        const tagIdsStr = tagList.map((t) => String(t)).join(',');
        const hasPhone = c.has_phone === true ? 1 : 0;
        const hasLive = c.has_livestream_order === true ? 1 : 0;
        // "Đã trả lời" = tin cuối do admin/page gửi. Pancake lưu
        // last_sent_by.admin_name khi admin reply; fallback so sánh id với
        // page_id (admin gửi qua page-level token, id sẽ là page_id).
        const lsb = c.last_sent_by || {};
        const repliedByAdmin =
            !!lsb.admin_name || (lsb.id && String(lsb.id) === String(c.page_id || ''));
        const replied = repliedByAdmin ? 1 : 0;
        // Avatar fetch needs the conv's OWN page id — sidebar is now
        // multi-page so House/Store rows coexist. Hardcoding
        // currentOrder.fbPageId (the modal opener) breaks the avatar
        // for every row coming from a different page.
        const rowPageId = String(c.page_id || c.fb_page_id || currentOrder.fbPageId || '');
        const avatarUrl =
            c.from?.avatar_url ||
            cust.avatar_url ||
            (fbId && rowPageId ? _avatarUrl(fbId, rowPageId) : '');
        const initial = (cName || '?').trim().charAt(0).toUpperCase();
        const avatarHtml = avatarUrl
            ? `<img class="w2-inbox-conv-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(cName)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;w2-inbox-conv-avatar&quot; style=&quot;display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:700;&quot;>${escapeHtml(initial)}</div>'" />`
            : `<div class="w2-inbox-conv-avatar" style="display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:700;">${escapeHtml(initial)}</div>`;
        return `<div class="w2-inbox-conv ${isActive ? 'is-active' : ''} ${unread ? 'is-unread' : ''}" data-fb-id="${escapeHtml(fbId)}" data-c-name="${escapeHtml(cName)}" data-conv-id="${escapeHtml(c.id || '')}" data-page-id="${escapeHtml(rowPageId)}" data-tag-count="${tagCount}" data-tag-ids="${escapeHtml(tagIdsStr)}" data-has-phone="${hasPhone}" data-has-live="${hasLive}" data-replied="${replied}">
            ${avatarHtml}
            <div class="w2-inbox-conv-body">
                <div class="w2-inbox-conv-top">
                    <span class="w2-inbox-conv-name">${escapeHtml(cName)}</span>
                    <span class="w2-inbox-conv-time">${escapeHtml(time)}</span>
                </div>
                <div class="w2-inbox-conv-preview">${escapeHtml(lastMsg)}</div>
            </div>
            ${unread ? `<span class="w2-inbox-conv-badge" title="${unread} chưa đọc"></span>` : ''}
        </div>`;
    }

    /**
     * Sidebar real-time: when a new message lands in any conversation on
     * this page, find the matching `.w2-inbox-conv` row, refresh its
     * preview/time, bump it to the top, and increment the unread badge
     * (unless that conversation is the one currently open in the chat
     * panel — that one is being read live so it stays read).
     */
    let _sidebarWsSub = null;
    let _sidebarPollTimer = null;
    let _sidebarPollOrder = null; // kept so we can resume polling if WS drops
    const _SIDEBAR_POLL_MS = 12_000;
    const _SIDEBAR_POLL_CHECK_MS = 5_000;

    /**
     * Polling vs realtime philosophy:
     *   • Render broker keeps a WS to pancake.vn and forwards
     *     `pages:update_conversation` (reliable) + `pages:new_message`
     *     (when FB socket creds available).
     *   • When `Web2Realtime.isConnected()` is true the sidebar is fed
     *     LIVE from those events — `_handleSidebarWsEvent` already
     *     bumps rows, marks unread, prepends new conv rows. Running a
     *     12s poll on top of that is wasted bandwidth + Pancake quota.
     *   • Polling becomes useful ONLY when WS is down (broker
     *     restarting, network blip, etc.). We monitor connection
     *     state every 5s and flip polling on/off accordingly.
     *
     * Net result: in the steady-state happy path zero polls fire —
     * pure realtime. The poll loop self-activates only as fallback.
     */
    function _startSidebarPoll(order) {
        if (_sidebarPollTimer) clearInterval(_sidebarPollTimer);
        if (!order?.fbPageId || !window.Web2Chat?.fetchConversationsByPage) return;
        _sidebarPollOrder = order;
        // Watchdog: every 5s, decide whether to poll now. If WS is up
        // OR Web2Realtime hasn't loaded, skip (event-driven). If WS
        // dropped, fire a single poll to keep the sidebar fresh.
        // Tracks last-poll timestamp so even when WS bounces we don't
        // hammer the API faster than _SIDEBAR_POLL_MS.
        let lastPollAt = 0;
        _sidebarPollTimer = setInterval(() => {
            const list = document.getElementById('w2InboxConvList');
            if (!list) return; // modal closed (teardown clears interval anyway)
            const wsUp = !!window.Web2Realtime?.isConnected?.();
            if (wsUp) return; // realtime is feeding the sidebar — no poll needed
            const now = Date.now();
            if (now - lastPollAt < _SIDEBAR_POLL_MS) return; // throttle fallback polls
            lastPollAt = now;
            console.log('[NativeOrders] WS down → fallback poll');
            _pollSidebarOnce(_sidebarPollOrder);
        }, _SIDEBAR_POLL_CHECK_MS);
    }

    async function _pollSidebarOnce(order) {
        const list = document.getElementById('w2InboxConvList');
        if (!list) return; // modal closed → next interval no-ops (cleared in _teardownChatState)
        try {
            // Same multi-page coverage as _loadInboxSidebar — without
            // this the fallback poll would shrink the sidebar back to
            // a single page whenever WS drops.
            const pageIds = _getSidebarPageIds(order);
            const res = await _fetchConvsMerged(pageIds, 50);
            if (!res.ok || !res.conversations?.length) return;
            _mergeSidebarConvs(res.conversations, order);
        } catch (e) {
            console.warn('[NativeOrders] sidebar poll failed:', e.message);
        }
    }

    /**
     * Merge a fresh conversation list into the existing sidebar DOM:
     *   - update preview + time on existing rows
     *   - mark `.is-unread` (+ spawn badge) when last_message changed
     *     AND the row isn't the conversation currently open
     *   - render brand-new conversation rows + bind their click handler
     *   - reorder to match server order via documentFragment append
     *     (existing DOM nodes are MOVED, not recreated — scroll +
     *     hover survive)
     */
    function _mergeSidebarConvs(serverConvs, order) {
        const list = document.getElementById('w2InboxConvList');
        if (!list) return;
        const existing = new Map();
        list.querySelectorAll('.w2-inbox-conv').forEach((el) => {
            const key = el.dataset.convId || el.dataset.fbId;
            if (key) existing.set(key, el);
        });

        const orderedRows = [];
        for (const c of serverConvs) {
            const convId = String(c.id || '');
            const cust = c.customers?.[0] || c.from || {};
            const fbId = String(cust.fb_id || cust.id || c.from_customer_id || '');
            const key = convId || fbId;
            if (!key) continue;
            let row = existing.get(key);
            const newPreview =
                (c.last_message?.message || c.last_message_text || c.snippet || '').slice(0, 120) ||
                '(không có nội dung)';
            const newTime = _fmtVnTime(c.updated_at || c.last_sent_at || c.inserted_at);
            const isOpenConv = _chatState?.convId && String(_chatState.convId) === convId;

            if (row) {
                const previewEl = row.querySelector('.w2-inbox-conv-preview');
                const timeEl = row.querySelector('.w2-inbox-conv-time');
                const oldPreview = previewEl?.textContent || '';
                if (oldPreview !== newPreview) {
                    if (previewEl) previewEl.textContent = newPreview;
                    if (!isOpenConv) {
                        row.classList.add('is-unread');
                        if (!row.querySelector('.w2-inbox-conv-badge')) {
                            const dot = document.createElement('span');
                            dot.className = 'w2-inbox-conv-badge';
                            dot.title = 'Tin nhắn mới';
                            row.appendChild(dot);
                        }
                    }
                }
                if (timeEl && timeEl.textContent !== newTime) timeEl.textContent = newTime;
            } else {
                const tmp = document.createElement('div');
                tmp.innerHTML = _convRowHtml(c, order);
                row = tmp.firstElementChild;
                row?.addEventListener('click', () => {
                    const customerId = row.dataset.fbId;
                    const cName = row.dataset.cName;
                    if (!customerId) return;
                    _switchChatToCustomer(order, customerId, cName);
                    row.classList.remove('is-unread');
                    row.querySelector('.w2-inbox-conv-badge')?.remove();
                });
            }
            if (row) orderedRows.push(row);
        }

        // DocumentFragment.appendChild moves existing nodes — no rebuild.
        const frag = document.createDocumentFragment();
        for (const r of orderedRows) frag.appendChild(r);
        list.appendChild(frag);
        // Re-apply filter so newly-arrived rows respect the user's choice.
        _applySidebarFilter();
    }

    function _wireSidebarRealtime(order) {
        if (_sidebarWsSub?.unsubscribe) {
            try {
                _sidebarWsSub.unsubscribe();
            } catch {
                /* ignore */
            }
        }
        // Polling backstop — self-deactivates while WS is connected
        // (see _startSidebarPoll's watchdog). When WS drops it kicks
        // in automatically; when WS recovers it goes quiet again.
        _startSidebarPoll(order);

        if (!window.Web2Realtime?.subscribe) {
            console.warn('[NativeOrders] Web2Realtime not loaded → polling-only');
            return;
        }
        _sidebarWsSub = window.Web2Realtime.subscribe({
            types: ['pages:new_message', 'pages:update_conversation'],
            onEvent: (evt) => _handleSidebarWsEvent(evt, order),
            debounceMs: 80,
        });
        // Multi-account pool: push every Pancake account the browser
        // knows about (from localStorage `pancake_all_accounts`) so the
        // Render broker can spawn one WS per account, covering ALL
        // pages instead of just the 1 page a single account can reach.
        // Broker deduplicates pages and persists creds in
        // `realtime_accounts` for auto-reconnect after restarts.
        if (window.Web2Realtime?.startMulti) {
            window.Web2Realtime.startMulti()
                .then((r) => {
                    if (!r.ok) {
                        console.warn('[NativeOrders] Web2Realtime.startMulti →', r.reason);
                        // Fallback to single-account start with all PATs
                        const known = Object.keys(
                            window.Web2Chat?.getAllPageAccessTokens?.() || {}
                        );
                        const all = Array.from(
                            new Set([order.fbPageId, ...known].filter(Boolean).map(String))
                        );
                        if (all.length) window.Web2Realtime.start({ pageIds: all });
                    } else {
                        console.log(
                            `[NativeOrders] ✓ pool: ${r.poolSize} account(s), ${r.totalPages} page(s)`,
                            r.plan
                        );
                    }
                })
                .catch((e) => console.warn('[NativeOrders] startMulti err:', e.message));
        }
    }

    function _handleSidebarWsEvent(evt, order) {
        const list = document.getElementById('w2InboxConvList');
        if (!list) return;
        // The broker forwards two distinct payload shapes:
        //   pages:new_message        → payload.message = { conversation_id, from, message, ... }
        //   pages:update_conversation → payload.conversation = { id, from, last_message, customers, ... }
        //                              + payload.page_id
        // Normalise to a single "msg-like" object so the rest of this
        // handler doesn't have to care which event fired.
        const conv = evt.payload?.conversation;
        const m =
            evt.payload?.message ||
            (conv
                ? {
                      conversation_id: conv.id,
                      from: conv.from || conv.last_message?.from,
                      page_id: evt.payload?.page_id,
                      message: conv.last_message?.message || conv.snippet || conv.last_message_text,
                      inserted_at:
                          conv.last_sent_at || conv.last_message?.inserted_at || conv.updated_at,
                      customer: conv.customers?.[0],
                      to: conv.customers?.[0] ? { id: conv.customers[0].fb_id } : undefined,
                  }
                : evt.payload || {});
        const convId = String(m.conversation_id || m.conversationId || conv?.id || '');
        const pageId = String(m.page_id || evt.payload?.page_id || order.fbPageId || '');
        // Visible breadcrumb so the browser console makes it obvious that
        // the realtime path is alive when a customer event lands.
        console.log(
            `[NativeOrders][RT] ${evt.type} conv=${convId.slice(-12)} page=${pageId.slice(-6)}`
        );
        // For incoming, `from.id` is the customer's PSID. For outgoing
        // (admin staff replying), `from.id` equals the page id.
        const fromId = String(m.from?.id || '');
        const isOutgoing =
            !!(m.from_admin || m.is_admin || m.from?.admin_id) ||
            (fromId && pageId && fromId === pageId);
        // Customer PSID for the row key (sender for incoming, recipient
        // for outgoing → fall back to to-field if available).
        const fbId = isOutgoing
            ? String(m.to?.id || m.customer?.fb_id || m.customer?.id || '')
            : fromId;
        const lastText = (m.message || m.text || m.snippet || '').slice(0, 120) || '(media)';
        const time = _fmtVnTime(m.inserted_at || m.created_time || m.timestamp || Date.now());

        // Find row by convId first, else by fbId
        let row =
            (convId &&
                list.querySelector(`.w2-inbox-conv[data-conv-id="${CSS.escape(convId)}"]`)) ||
            (fbId && list.querySelector(`.w2-inbox-conv[data-fb-id="${CSS.escape(fbId)}"]`));

        const isCurrentlyOpen = _chatState?.convId && String(_chatState.convId) === convId;

        if (row) {
            // Update preview + time
            const preview = row.querySelector('.w2-inbox-conv-preview');
            const timeEl = row.querySelector('.w2-inbox-conv-time');
            if (preview) preview.textContent = lastText;
            if (timeEl) timeEl.textContent = time;
            // Mark unread for incoming messages on conversations NOT
            // currently being viewed
            if (!isOutgoing && !isCurrentlyOpen) {
                row.classList.add('is-unread');
                if (!row.querySelector('.w2-inbox-conv-badge')) {
                    const dot = document.createElement('span');
                    dot.className = 'w2-inbox-conv-badge';
                    dot.title = 'Tin nhắn mới';
                    row.appendChild(dot);
                }
            }
            // Bump to top of list
            if (list.firstChild !== row) list.prepend(row);
        } else if (fbId) {
            // First-time-seen conversation — prepend a minimal row.
            // Use the event's page_id (sidebar is now multi-page so a
            // new Store conv must NOT inherit the modal-opener's House
            // page_id, otherwise avatar URL + filter mismatch).
            const synthetic = {
                id: convId,
                customers: [{ fb_id: fbId, name: m.from?.name || 'Khách' }],
                from: m.from,
                last_message: { message: lastText },
                updated_at: m.inserted_at || Date.now(),
                page_id: pageId || order.fbPageId,
                unread_count: isOutgoing ? 0 : 1,
            };
            const tmp = document.createElement('div');
            tmp.innerHTML = _convRowHtml(synthetic, order);
            const newRow = tmp.firstElementChild;
            if (newRow) {
                newRow.addEventListener('click', () => {
                    const customerId = newRow.dataset.fbId;
                    const cName = newRow.dataset.cName;
                    const rowPage = newRow.dataset.pageId || '';
                    if (!customerId) return;
                    _switchChatToCustomer(order, customerId, cName, rowPage);
                    newRow.classList.remove('is-unread');
                    newRow.querySelector('.w2-inbox-conv-badge')?.remove();
                });
                list.prepend(newRow);
            }
        }
    }

    /**
     * When user clicks a sidebar row, swap the chat to that conversation.
     * Keeps the modal + sidebar mounted. We synthesise an order-shaped
     * object so the existing render path can reuse — when the clicked row
     * is a different customer, we clear order-specific fields (code,
     * phone, tags, totals) because we don't have an order for them, and
     * re-skin the header + right-panel in place. Same customer click is
     * treated as a "refresh thread" no-rebuild.
     */
    async function _switchChatToCustomer(originalOrder, fbId, customerName, clickedPageId) {
        const isSameCustomer = String(originalOrder.fbUserId || '') === String(fbId);
        // Cross-page click: sidebar is multi-page, so a customer row may
        // belong to a different page than the order's. Honour the row's
        // own page so the chat panel fetches messages from the right
        // place (Pancake `/api/v1/pages/{pageId}/...`).
        const effectivePageId = clickedPageId || originalOrder.fbPageId || '';
        const synthetic = isSameCustomer
            ? { ...originalOrder, fbPageId: effectivePageId || originalOrder.fbPageId }
            : {
                  ...originalOrder,
                  fbUserId: fbId,
                  fbPageId: effectivePageId,
                  customerName: customerName || '',
                  fbUserName: customerName || '',
                  // Different customer — clear order-bound context so the
                  // header/right-panel reflect "khách lẻ, chưa có đơn"
                  // instead of misleadingly showing the original order.
                  phone: '',
                  code: '',
                  amountTotal: 0,
                  total: 0,
                  status: '',
                  tags: [],
                  address: '',
                  note: '',
                  messageCount: 0,
                  commentCount: 0,
              };
        // Highlight clicked row
        document
            .querySelectorAll('.w2-inbox-conv')
            .forEach((r) => r.classList.toggle('is-active', r.dataset.fbId === fbId));
        // If user clicked a conv while on the Bình luận tab, jump back to
        // Tin nhắn — comments are tied to the original order's post, not
        // page-wide per customer, so loading the conv's messages is the
        // sensible action. _renderInteractionsModal re-renders the body
        // and re-calls _loadAndRenderThread for us; bail out early to
        // avoid double-loading.
        if (_interactionsState && _interactionsState.tab !== 'messages') {
            _interactionsState.tab = 'messages';
            _renderInteractionsModal(synthetic, 'messages');
            return;
        }
        // Update middle chat header to match the clicked customer.
        _applyChatHeaderForOrder(synthetic);
        // Update right panel info — only when actually switching customers.
        if (!isSameCustomer) {
            const rightBody = document.getElementById('w2InboxRightBody');
            if (rightBody) {
                rightBody.innerHTML = _renderInfoTab(synthetic);
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }
            // Strip tab badges (Tin nhắn/Bình luận count) — they belong
            // to the original order and don't apply to a different customer.
            document
                .querySelectorAll('#orderInteractionsModal .interactions-tab .w2-inbox-tab-badge')
                .forEach((el) => el.remove());
        }
        // Re-render the message panel by re-calling load
        await _loadAndRenderThread(synthetic);
    }

    function _renderMessagesPanel(order) {
        // Đơn inbox tạo tay có thể CHƯA bind fb context (khác đơn livestream).
        // Vẫn render đầy đủ shell (msgThread + input) để user chọn hội thoại từ
        // sidebar đa-page bên trái — _switchChatToCustomer sẽ bind page+psid khi
        // click. _loadAndRenderThread hiển thị prompt "chọn hội thoại" khi unbound.
        return `
            <div style="display:flex;flex-direction:column;height:100%;position:relative;">
                <div id="msgThread" class="w2p-scroll-area" style="position:relative;flex:1;min-height:0;background:#ebebeb;padding:14px 22px;display:flex;flex-direction:column;gap:4px;font-size:14px;color:#1d2939;font-family:Roboto,Helvetica,Arial,sans-serif;">
                    <div style="color:#94a3b8;font-style:italic;text-align:center;padding:60px 0;">
                        <i data-lucide="loader" style="width:24px;height:24px;display:block;margin:0 auto 10px;animation:spin 1s linear infinite;"></i>
                        Đang tải hội thoại…
                    </div>
                </div>
                <button type="button" id="msgJumpBottom" style="display:none;position:absolute;bottom:120px;left:50%;transform:translateX(-50%);background:#7c3aed;color:#fff;border:none;font-size:11px;font-weight:600;padding:6px 14px;border-radius:999px;cursor:pointer;box-shadow:0 4px 14px rgba(124,58,237,0.35);z-index:5;">↓ <span id="msgJumpCount">0</span> tin mới</button>
                ${_renderQuickReplyTags()}
                <div style="border-top:1px solid #e5e7eb;background:#fff;padding:10px 18px 12px;">
                    <div id="msgReplyBar" style="display:none;"></div>
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:8px;">
                        <button type="button" class="w2-chat-tool" data-action="refresh-thread" title="Tải lại hội thoại">
                            <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
                        </button>
                        <button type="button" class="w2-chat-tool" data-action="scroll-bottom" title="Cuộn xuống cuối">
                            <i data-lucide="arrow-down" style="width:14px;height:14px;"></i>
                        </button>
                        <button type="button" class="w2-chat-tool" data-action="open-quick-reply" title="Mở danh sách mẫu trả lời">
                            <i data-lucide="zap" style="width:14px;height:14px;color:#7c3aed;"></i>
                        </button>
                        <button type="button" class="w2-chat-tool" data-action="insert-signature" title="Chèn chữ ký nhân viên">
                            <i data-lucide="user-check" style="width:14px;height:14px;"></i>
                        </button>
                        <button type="button" class="w2-chat-tool" data-action="attach-file" title="Đính kèm tệp / âm thanh">
                            <i data-lucide="paperclip" style="width:14px;height:14px;"></i>
                        </button>
                        <button type="button" class="w2-chat-tool" data-action="attach-image" title="Đính kèm hình ảnh">
                            <i data-lucide="image" style="width:14px;height:14px;"></i>
                        </button>
                        <input type="file" id="msgFileInput" style="display:none;">
                        <input type="file" id="msgImageInput" accept="image/*" style="display:none;">
                        <div style="flex:1;"></div>
                        <small style="color:#94a3b8;font-size:11px;">
                            ${_hasExtension() ? `🚀 <strong style="color:#7c3aed;">N2 Extension v${_extensionVersion}</strong> (bypass 24h)` : 'Gửi qua Pancake API'}
                        </small>
                    </div>
                    <div id="msgAttachPreview" style="display:none;align-items:center;margin-bottom:8px;"></div>
                    <div style="display:flex;gap:8px;align-items:flex-end;">
                        <textarea id="msgInput" rows="2" placeholder="Nhập tin nhắn gửi cho khách… (Enter để gửi, /shortcut để chèn mẫu)" style="flex:1;padding:9px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;resize:none;min-height:42px;max-height:180px;line-height:1.45;"></textarea>
                        <button class="tpos-btn tpos-btn-primary" data-action="send-message" title="Gửi tin nhắn (Enter)" style="height:42px;padding:0 18px;font-weight:600;display:inline-flex;align-items:center;gap:6px;">
                            <i data-lucide="send" style="width:14px;height:14px;"></i> Gửi
                        </button>
                    </div>
                </div>
            </div>`;
    }

    // -----------------------------------------------------
    // Chat thread state + rendering helpers (shared by initial
    // load, scroll-up load older, and WS auto-append paths).
    // -----------------------------------------------------

    let _chatState = null; // { order, pageId, convId, customerId, msgIds:Set, msgs:[], cursor, loadingOlder, hasMore, wsSub, missedSince, replyTo }

    // Attachment đang chọn để gửi (ảnh/âm thanh/video/tệp) — gửi qua extension
    // (UPLOAD_INBOX_PHOTO → REPLY_INBOX_PHOTO). Đồng bộ với tpos-pancake.
    let _pendingAttachment = null; // { file, kind } với kind ∈ PHOTO|AUDIO|VIDEO|FILE

    function _attachmentKind(file) {
        const t = (file && file.type) || '';
        if (t.startsWith('image/')) return 'PHOTO';
        if (t.startsWith('audio/')) return 'AUDIO';
        if (t.startsWith('video/')) return 'VIDEO';
        return 'FILE';
    }

    function _fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error('Đọc tệp thất bại'));
            r.readAsDataURL(file);
        });
    }

    function _attachLabel(kind) {
        return kind === 'AUDIO'
            ? '[Âm thanh]'
            : kind === 'VIDEO'
              ? '[Video]'
              : kind === 'FILE'
                ? '[Tệp]'
                : '[Hình ảnh]';
    }

    function _setPendingAttachment(file) {
        if (!file) return;
        _pendingAttachment = { file, kind: _attachmentKind(file) };
        const wrap = document.getElementById('msgAttachPreview');
        if (!wrap) return;
        if (_pendingAttachment.kind === 'PHOTO') {
            const reader = new FileReader();
            reader.onload = (e) => {
                wrap.innerHTML = `<img src="${e.target.result}" style="max-width:90px;max-height:70px;border-radius:6px;object-fit:cover;"><button type="button" id="msgAttachRemove" style="margin-left:8px;border:none;background:#ef4444;color:#fff;border-radius:50%;width:20px;height:20px;cursor:pointer;line-height:1;">×</button>`;
                wrap.style.display = 'flex';
                wrap.querySelector('#msgAttachRemove')?.addEventListener(
                    'click',
                    _clearPendingAttachment
                );
            };
            reader.readAsDataURL(file);
        } else {
            const icon =
                _pendingAttachment.kind === 'AUDIO'
                    ? '🎵'
                    : _pendingAttachment.kind === 'VIDEO'
                      ? '🎬'
                      : '📎';
            const kb = Math.max(1, Math.round((file.size || 0) / 1024));
            wrap.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;padding:6px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;max-width:240px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${icon} ${escapeHtml(file.name || 'tệp')} <small style="color:#94a3b8;">(${kb} KB)</small></span><button type="button" id="msgAttachRemove" style="margin-left:8px;border:none;background:#ef4444;color:#fff;border-radius:50%;width:20px;height:20px;cursor:pointer;line-height:1;">×</button>`;
            wrap.style.display = 'flex';
            wrap.querySelector('#msgAttachRemove')?.addEventListener(
                'click',
                _clearPendingAttachment
            );
        }
    }

    function _clearPendingAttachment() {
        _pendingAttachment = null;
        const wrap = document.getElementById('msgAttachPreview');
        if (wrap) {
            wrap.style.display = 'none';
            wrap.innerHTML = '';
        }
        const fi = document.getElementById('msgFileInput');
        const ii = document.getElementById('msgImageInput');
        if (fi) fi.value = '';
        if (ii) ii.value = '';
    }

    /**
     * Set the "replying to" target. Pass null to clear.
     * Highlights the source bubble briefly and renders the reply bar
     * above the input.
     */
    function _setReplyTarget(msgId) {
        if (!_chatState) return;
        if (!msgId) {
            _chatState.replyTo = null;
            _renderReplyBar();
            return;
        }
        const m = _chatState.msgs.find((x) => String(x.id) === String(msgId));
        if (!m) return;
        _chatState.replyTo = {
            id: m.id,
            from: m.from?.name || (m.from_admin ? 'Tôi' : 'Khách'),
            text: _msgPlain(m.message || m.text || '').slice(0, 80),
            hasMedia: Array.isArray(m.attachments) && m.attachments.length > 0,
        };
        _renderReplyBar();
        // Highlight source bubble briefly
        document
            .querySelectorAll('.w2-chat-row.is-replying-target')
            .forEach((el) => el.classList.remove('is-replying-target'));
        const row = document.querySelector(
            `.w2-chat-row[data-msg-id="${CSS.escape(String(m.id))}"]`
        );
        if (row) {
            row.classList.add('is-replying-target');
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            setTimeout(() => row.classList.remove('is-replying-target'), 1800);
        }
        document.getElementById('msgInput')?.focus();
    }

    function _renderReplyBar() {
        const host = document.getElementById('msgReplyBar');
        if (!host) return;
        const r = _chatState?.replyTo;
        if (!r) {
            host.innerHTML = '';
            host.style.display = 'none';
            return;
        }
        host.style.display = '';
        const preview = r.text || (r.hasMedia ? '[Đính kèm]' : '[Tin nhắn]');
        host.innerHTML = `<div class="w2-chat-reply-bar">
            <i data-lucide="corner-up-left" style="width:14px;height:14px;color:#7c3aed;"></i>
            <span class="preview">Trả lời <strong>${escapeHtml(r.from)}</strong>${escapeHtml(preview)}</span>
            <button type="button" data-action="cancel-reply" title="Huỷ trả lời">×</button>
        </div>`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        host.querySelector('[data-action="cancel-reply"]')?.addEventListener('click', () =>
            _setReplyTarget(null)
        );
    }

    function _msgPlain(raw) {
        if (!raw) return '';
        // Pancake/FB messages arrive as either plain text or partial HTML.
        // We need to preserve visual line breaks coming from any of:
        //   - real \n / \r\n / \r / U+2028 / U+2029 line separators
        //   - <br> tags
        //   - block-level boundaries (</p>, </div>, </li>, </h*>) — closing
        //     tag carries the break; opening tag of a non-first sibling also
        //     starts a new line.
        const normalized = String(raw)
            .replace(/\r\n?/g, '\n')
            .replace(/[\u2028\u2029]/g, '\n')
            // Pancake often emits `<br key='n_0' />`, `<br key="..." />`, etc.
            // — match any attributes after `<br`.
            .replace(/<br\b[^>]*>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
            .replace(/<(p|div|li|h[1-6])(\s[^>]*)?>/gi, '\n');
        const tmp = document.createElement('div');
        tmp.innerHTML = normalized;
        const text = tmp.textContent || tmp.innerText || '';
        // Collapse runs of 3+ blank lines to a single blank line; trim ends.
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    function _msgTimestamp(m) {
        const t = m.inserted_at || m.created_time || m.timestamp;
        if (!t) return 0;
        const d = new Date(t);
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }

    function _dateLabel(ts) {
        if (!ts) return '';
        let parseInput = ts;
        if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ts)) {
            if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)) parseInput = ts + 'Z';
        }
        const d = new Date(parseInput);
        // Compare in GMT+7 explicitly so the day-boundary doesn't drift
        // when the user's machine sits in another TZ.
        const vnFmt = (date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        const todayKey = vnFmt(new Date());
        const yestKey = vnFmt(new Date(Date.now() - 86_400_000));
        const dKey = vnFmt(d);
        if (dKey === todayKey) return 'HÔM NAY';
        if (dKey === yestKey) return 'HÔM QUA';
        return d.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Asia/Ho_Chi_Minh',
        });
    }

    const _NON_CORS_MEDIA =
        /(?:scontent|video)[\w.-]*\.fbcdn\.net|content\.pancake\.vn|firebasestorage\.googleapis\.com/i;

    function _workerProxy(url) {
        const base =
            window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        return _NON_CORS_MEDIA.test(url)
            ? `${base}/api/image-proxy?url=${encodeURIComponent(url)}`
            : url;
    }

    function _renderQuotedReply(att) {
        const fromName = att.from?.name || att.from?.admin_name || 'Tin nhắn';
        const text = _msgPlain(att.message || '');
        let preview = '';
        const qAtt = att.attachments?.[0];
        if (qAtt) {
            const qUrl = qAtt.url || qAtt.file_url || qAtt.preview_url || '';
            const qType = (qAtt.type || '').toLowerCase();
            if (qType === 'photo' || qType === 'image' || qAtt.mime_type?.startsWith('image/')) {
                preview = `<img src="${escapeHtml(qUrl)}" style="max-width:48px;max-height:48px;border-radius:4px;object-fit:cover;margin-top:3px;display:block;" loading="lazy" />`;
            } else if (qType === 'video') {
                preview = `<span style="font-size:10px;opacity:0.7;">🎬 Video</span>`;
            } else if (qType === 'audio') {
                preview = `<span style="font-size:10px;opacity:0.7;">🎙 Audio</span>`;
            }
        }
        const body = text
            ? `<div style="font-size:11px;opacity:0.85;line-height:1.35;max-height:32px;overflow:hidden;white-space:pre-wrap;">${escapeHtml(text.slice(0, 120))}</div>`
            : preview ||
              `<span style="font-size:10px;opacity:0.6;font-style:italic;">[Tin nhắn]</span>`;
        return `<div class="w2-chat-quoted">
            <div class="w2-chat-quoted-from">↩ ${escapeHtml(fromName)}</div>
            ${body}
        </div>`;
    }

    function _renderImage(att, url) {
        const safe = escapeHtml(_workerProxy(url));
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:block;margin-top:4px;"><img src="${safe}" style="max-width:240px;max-height:300px;border-radius:8px;display:block;object-fit:cover;cursor:zoom-in;" loading="lazy" /></a>`;
    }

    function _renderSticker(att, url) {
        const safe = escapeHtml(_workerProxy(url));
        return `<img src="${safe}" alt="Sticker" style="width:120px;height:120px;margin-top:2px;display:block;" loading="lazy" onerror="this.outerHTML='<span style=&quot;font-size:42px;display:inline-block;padding:6px;&quot;>🎨</span>'" />`;
    }

    function _renderVideo(att) {
        // Pancake: { type:'video', url:<thumbnail>, video_data:{ url:<real .mp4> } }
        const videoUrl = att.video_data?.url || att.video_url || '';
        const poster = att.thumbnail_url || att.preview_url || att.url || '';
        if (!videoUrl) return '';
        const play = escapeHtml(_workerProxy(videoUrl));
        const orig = escapeHtml(videoUrl);
        const posterAttr = poster ? ` poster="${escapeHtml(_workerProxy(poster))}"` : '';
        const mime = att.mime_type || 'video/mp4';
        return `<video controls playsinline preload="metadata"${posterAttr} style="max-width:280px;max-height:360px;border-radius:8px;display:block;background:#000;margin-top:4px;">
            <source src="${play}" type="${mime}">
            <source src="${orig}" type="${mime}">
        </video>`;
    }

    function _renderAudio(att, url) {
        const safe = escapeHtml(_workerProxy(url));
        return `<audio controls preload="metadata" style="margin-top:4px;max-width:260px;display:block;height:34px;"><source src="${safe}" type="${escapeHtml(att.mime_type || 'audio/mpeg')}"></audio>`;
    }

    function _renderFile(att, url) {
        const name = att.name || att.filename || 'Tệp đính kèm';
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:4px;padding:6px 10px;background:rgba(0,0,0,0.05);border-radius:6px;font-size:11px;color:inherit;text-decoration:none;">📄 ${escapeHtml(name)}</a>`;
    }

    function _renderAddress(att) {
        const full = att.full_address || att.address || '';
        if (!full) return '';
        return `<div style="background:rgba(0,0,0,0.06);padding:6px 10px;border-radius:8px;margin-top:4px;font-size:12px;display:flex;align-items:flex-start;gap:6px;">
            <span>📍</span>
            <span style="flex:1;line-height:1.42;">${escapeHtml(full)}</span>
        </div>`;
    }

    function _renderAdClick(att) {
        const post = att.post_attachments?.[0];
        const thumb = post?.url || '';
        const desc = post?.description || '';
        const adUrl = att.url || '';
        return `<a href="${escapeHtml(adUrl)}" target="_blank" rel="noopener" style="display:block;margin-top:4px;text-decoration:none;color:inherit;background:rgba(0,0,0,0.05);border-radius:8px;padding:6px;max-width:240px;">
            <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:#7c3aed;margin-bottom:4px;">
                <span>📣 Click từ Quảng cáo</span>
            </div>
            ${thumb ? `<img src="${escapeHtml(_workerProxy(thumb))}" style="width:100%;max-height:140px;border-radius:6px;display:block;object-fit:cover;" loading="lazy" />` : ''}
            ${desc ? `<div style="font-size:11px;margin-top:4px;color:#475569;line-height:1.35;">${escapeHtml(desc.slice(0, 100))}${desc.length > 100 ? '…' : ''}</div>` : ''}
        </a>`;
    }

    function _renderLinkPreview(att) {
        // Pancake link attachment shape: { url: <FB post permalink>,
        // name, post_attachments: [{ url: <real CDN image>, type, image_data }] }.
        // `att.url` (https://facebook.com/{pageId}_{postId}) is the POST link,
        // NOT the image — using it as <img src> renders broken. The real
        // image lives in post_attachments[0].url on content.pancake.vn.
        const post = att.post_attachments?.[0];
        const thumb = post?.url || '';
        const href = att.url || post?.url || '';
        const title = att.name || post?.title || post?.description || 'Bài viết';
        const inner = `${thumb ? `<img src="${escapeHtml(_workerProxy(thumb))}" style="width:100%;max-height:160px;border-radius:6px;display:block;object-fit:cover;" loading="lazy" />` : ''}
            <div style="font-size:12px;margin-top:4px;font-weight:600;line-height:1.35;color:#1d2939;">${escapeHtml(title.slice(0, 80))}${title.length > 80 ? '…' : ''}</div>`;
        return href
            ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:block;margin-top:4px;background:rgba(0,0,0,0.05);border-radius:8px;padding:6px;max-width:240px;text-decoration:none;color:inherit;">${inner}</a>`
            : `<div style="margin-top:4px;background:rgba(0,0,0,0.05);border-radius:8px;padding:6px;max-width:240px;">${inner}</div>`;
    }

    function _renderTemplate() {
        return `<div style="background:rgba(0,0,0,0.06);padding:5px 10px;border-radius:8px;margin-top:4px;font-size:11px;display:inline-flex;align-items:center;gap:5px;">
            <span>📋</span><span>Tin nhắn dạng template</span>
        </div>`;
    }

    function _renderAudioCall(att) {
        const dur = Number(att.duration) || 0;
        const min = Math.floor(dur / 60);
        const sec = dur % 60;
        const durStr = min > 0 ? `${min}p ${sec}s` : `${sec}s`;
        return `<div style="background:rgba(0,0,0,0.06);padding:6px 10px;border-radius:8px;margin-top:4px;font-size:12px;display:inline-flex;align-items:center;gap:6px;">
            <span>📞</span>
            <span>Cuộc gọi audio${dur > 0 ? ' · ' + durStr : ''}</span>
        </div>`;
    }

    function _renderSystemMessage(att) {
        const msg = att.message || '';
        return `<div style="font-size:11px;color:#94a3b8;font-style:italic;text-align:center;padding:4px 0;">— ${escapeHtml(msg)} —</div>`;
    }

    function _renderAttachment(att) {
        const type = (att.type || '').toLowerCase();
        const url = att.url || att.file_url || att.preview_url || att.payload?.url || att.src || '';
        if (type === 'replied_message') return _renderQuotedReply(att);
        if (type === 'reaction') return ''; // handled separately
        if (type === 'like' || type === 'thumbsup')
            return `<div style="font-size:32px;margin-top:2px;">👍</div>`;
        if (type === 'address') return _renderAddress(att);
        if (type === 'ad_click') return _renderAdClick(att);
        if (type === 'link') return _renderLinkPreview(att);
        if (type === 'template') return _renderTemplate();
        if (type === 'fb_audio_call') return _renderAudioCall(att);
        if (type === 'system_message') return _renderSystemMessage(att);
        if (!url) return '';
        if (type === 'sticker' || att.sticker_id || type === 'animated_image_url')
            return _renderSticker(att, url);
        if (type === 'photo' || type === 'image' || att.mime_type?.startsWith('image/'))
            return _renderImage(att, url);
        if (type === 'video' || att.mime_type?.startsWith('video/')) return _renderVideo(att);
        if (type === 'audio' || att.mime_type?.startsWith('audio/')) return _renderAudio(att, url);
        if (type === 'file' || type === 'document') return _renderFile(att, url);
        return '';
    }

    const REACTION_EMOJIS = {
        LIKE: '👍',
        LOVE: '❤️',
        HAHA: '😆',
        WOW: '😮',
        SAD: '😢',
        ANGRY: '😠',
        CARE: '🤗',
    };

    function _renderReactions(m) {
        // Pancake puts reactions either as a top-level `reactions[]` array
        // or as attachments[type=reaction], or as a reaction_summary object.
        const list = [];
        if (Array.isArray(m.reactions)) {
            for (const r of m.reactions) {
                const e = r.emoji || r.reaction || REACTION_EMOJIS[r.type] || '❤️';
                list.push(e);
            }
        }
        if (Array.isArray(m.attachments)) {
            for (const a of m.attachments) {
                if ((a.type || '').toLowerCase() === 'reaction') {
                    list.push(a.emoji || a.reaction || '❤️');
                }
            }
        }
        const summary =
            m.reaction_summary ||
            (typeof m.reactions === 'object' && !Array.isArray(m.reactions) ? m.reactions : null);
        let summaryHtml = '';
        if (summary && typeof summary === 'object') {
            const parts = Object.entries(summary)
                .filter(([, c]) => Number(c) > 0)
                .map(
                    ([type, c]) =>
                        `<span style="font-size:11px;">${REACTION_EMOJIS[type] || '👍'}${Number(c) > 1 ? ' ' + c : ''}</span>`
                );
            if (parts.length) summaryHtml = parts.join('');
        }
        if (!list.length && !summaryHtml) return '';
        const emojis = list.slice(0, 5).join('');
        return `<div class="w2-chat-reactions">${emojis}${summaryHtml}</div>`;
    }

    function _avatarUrl(fbId, pageId) {
        if (!fbId || !pageId) return '';
        const base =
            window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const jwt = window.Web2Chat?.getJwt() || '';
        const params = new URLSearchParams({ id: fbId, page: pageId });
        if (jwt) params.set('token', jwt);
        return `${base}/api/fb-avatar?${params.toString()}`;
    }

    function _avatarInitial(name) {
        const s = String(name || '?').trim();
        return s ? s.split(/\s+/).slice(-1)[0].charAt(0).toUpperCase() : '?';
    }

    /**
     * Render small 28px avatar — shown only when `show` is true (last of
     * a consecutive incoming group, Messenger-style). When false, returns
     * an empty placeholder so subsequent messages in the group align.
     */
    function _avatarHtml(m, pageId, show) {
        if (!show) return `<div style="width:28px;flex-shrink:0;"></div>`;
        const fbId = m.from?.id;
        const name = m.from?.name || '';
        const url = _avatarUrl(fbId, pageId);
        const initial = _avatarInitial(name);
        if (!url) {
            return `<div style="width:28px;height:28px;border-radius:50%;background:#e2e8f0;color:#475569;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${escapeHtml(initial)}</div>`;
        }
        const onerrFallback = `this.outerHTML='<div style=\\'width:28px;height:28px;border-radius:50%;background:#e2e8f0;color:#475569;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;\\'>${escapeHtml(initial).replace(/'/g, '&#39;')}</div>'`;
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#e2e8f0;" loading="lazy" onerror="${onerrFallback}" />`;
    }

    function _bubbleHtml(m, pageId, opts = {}) {
        const isOutgoing = m.from?.id === pageId || m.from_admin || m.is_admin;
        const txt = _msgPlain(m.message || m.text || m.content || '');
        const time = m.inserted_at || m.created_time || m.timestamp;
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        const isRemoved = !!m.is_removed;
        const isHidden = !!m.is_hidden;

        // System message: render as centered note instead of bubble
        const sysAtt = atts.find((a) => (a.type || '').toLowerCase() === 'system_message');
        if (sysAtt && !txt && atts.length === 1) {
            return `<div class="w2-chat-row is-system" style="align-self:center;margin:4px 0;">${_renderSystemMessage(sysAtt)}</div>`;
        }

        // Find quoted reply (rendered above the bubble content)
        const replyAtt = atts.find((a) => (a.type || '').toLowerCase() === 'replied_message');
        const replyHtml = replyAtt ? _renderQuotedReply(replyAtt) : '';

        // Render every non-reply, non-reaction attachment
        const mediaHtml = atts
            .filter((a) => !['replied_message', 'reaction'].includes((a.type || '').toLowerCase()))
            .map(_renderAttachment)
            .filter(Boolean)
            .join('');

        // Detect sticker-only bubble — strip background to look like Messenger
        const stickerOnly =
            mediaHtml &&
            !txt &&
            atts.every(
                (a) =>
                    ['sticker', 'animated_image_url', 'reaction'].includes(
                        (a.type || '').toLowerCase()
                    ) || a.sticker_id
            );

        const removedBadge = isRemoved
            ? `<div style="font-size:11px;font-style:italic;opacity:0.7;padding:2px 0;">🗑 Tin nhắn đã được thu hồi</div>`
            : '';
        const hiddenBadge =
            isHidden && !isRemoved
                ? `<div style="font-size:10px;opacity:0.65;padding:2px 0;">🙈 Tin nhắn đã ẩn</div>`
                : '';

        const inner = isRemoved
            ? removedBadge
            : txt
              ? `<div style="white-space:pre-wrap;word-break:break-word;line-height:1.42;">${escapeHtml(txt)}</div>${hiddenBadge}`
              : mediaHtml || replyHtml
                ? hiddenBadge
                : `<div style="opacity:0.6;font-style:italic;font-size:11px;">(không có nội dung)</div>`;

        const timeStr = _fmtVnTime(time);

        const reactionsHtml = _renderReactions(m);
        const replyBtn = m.id
            ? `<button class="w2-chat-reply-btn" data-action="reply-to" data-msg-id="${escapeHtml(m.id)}" title="Trả lời tin này"><i data-lucide="corner-up-left" style="width:11px;height:11px;"></i></button>`
            : '';

        // Pancake colour scheme (live-inspected): outgoing is light-green
        // #dcf8c6 with black text and a uniform 12px radius; incoming is
        // pure white with asymmetric 12/12/12/4 radius (Messenger style).
        const bubbleStyle = stickerOnly
            ? `background:transparent;border:0;padding:0;box-shadow:none;`
            : `background:${isOutgoing ? '#dcf8c6' : '#ffffff'};color:#1d2939;padding:6px 12px;border-radius:${isOutgoing ? '12px' : '12px 12px 12px 4px'};border:1px solid ${isOutgoing ? '#cdebb5' : '#ececec'};`;

        // Avatar for incoming bubbles only (Messenger style — show on the
        // last of a consecutive group of same-sender messages).
        const showAvatar = !isOutgoing && opts.showAvatar !== false;
        const avatarHtml = !isOutgoing
            ? `<div class="w2-chat-avatar-slot" style="align-self:flex-end;">${_avatarHtml(m, pageId, showAvatar)}</div>`
            : '';

        return `<div class="w2-chat-row ${isOutgoing ? 'is-out' : 'is-in'}" data-msg-id="${escapeHtml(m.id || '')}" style="display:flex;flex-direction:column;align-items:${isOutgoing ? 'flex-end' : 'flex-start'};margin:2px 0;position:relative;">
            <div class="w2-chat-bubble-wrap" style="display:flex;align-items:flex-end;gap:6px;${isOutgoing ? 'flex-direction:row-reverse;' : ''}max-width:80%;">
                ${avatarHtml}
                <div class="w2-chat-bubble" data-msg-id="${escapeHtml(m.id || '')}" style="${bubbleStyle}font-size:13px;">${replyHtml}${inner}${mediaHtml}</div>
                ${replyBtn}
            </div>
            ${reactionsHtml}
            ${timeStr ? `<div class="w2-chat-time" style="font-size:10px;color:#94a3b8;margin-top:2px;${isOutgoing ? 'padding-right:8px;' : 'padding-left:38px;'}">${escapeHtml(timeStr)}</div>` : ''}
        </div>`;
    }

    function _dateSeparatorHtml(label) {
        return `<div class="w2-chat-daysep" style="display:flex;align-items:center;gap:10px;align-self:stretch;margin:10px 0 4px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;">
            <span style="flex:1;height:1px;background:linear-gradient(to right,transparent,#e5e7eb);"></span>
            <span style="background:#fff;padding:3px 12px;border-radius:999px;border:1px solid #e5e7eb;">${escapeHtml(label)}</span>
            <span style="flex:1;height:1px;background:linear-gradient(to left,transparent,#e5e7eb);"></span>
        </div>`;
    }

    // Inject reusable chat styles on first render
    function _ensureChatModalCss() {
        if (document.getElementById('w2-chat-modal-css')) return;
        const css = `
            .w2-chat-tool {
                width: 30px; height: 30px; border-radius: 6px; border: 1px solid #e2e8f0;
                background: #fff; cursor: pointer; color: #64748b;
                display: inline-flex; align-items: center; justify-content: center;
                transition: all 0.15s ease;
            }
            .w2-chat-tool:hover { background: #f1f5f9; color: #0f172a; border-color: #cbd5e1; }
            .w2-chat-phone { cursor: pointer; user-select: none; transition: color 0.15s; }
            .w2-chat-phone:hover { color: #7c3aed; }

            /* Thread container — keep native scroll behaviour. Inspected
               Pancake.vn's own admin inbox (rc-virtual-list backed) and they
               run plain overflow:auto with zero containment, zero smooth-
               scroll lib, zero content-visibility. Native scroll on a
               small DOM (~25–60 bubbles) lands at 60 FPS without any of
               those, and the previous heavier rules were actually causing
               the "không mượt mắt nhìn" feel (content-visibility's
               measure-as-you-scroll, contain: paint repaint scope, etc.).
               scroll-behavior: smooth only applies to programmatic
               scrollTo()/scrollIntoView() so it does not slow wheel input. */
            #msgThread { scroll-behavior: smooth; }
            .w2-chat-row { flex-shrink: 0; }

            .w2-chat-bubble {
                box-shadow: 0 1px 2px rgba(15,23,42,0.06);
                line-height: 1.42;
                word-break: break-word;
            }

            /* ─── INBOX 3-COL SHELL — Pancake palette ─────────────
               Tokens captured live from pancake.vn admin inbox:
                 font-family   Roboto, Helvetica, Arial, sans-serif
                 body          14px / #1d2939 on #fff
                 conv-row      86px tall, unread bg #dde1e7
                 search input  14px, transparent inside #f5f6f8 capsule
                 filter btn    #eaecf0 bg, #344054 text, 32px height
                 chat header   68px, white, border-bottom 1px #ddd
                 incoming bub  #fff, radius 12 12 12 4
                 outgoing bub  #dcf8c6 (light-green), radius 12px
                 day separator centered pill
            */
            .w2-inbox-card {
                background: #fff;
                font-family: Roboto, Helvetica, Arial, sans-serif;
                color: #1d2939;
                font-size: 14px;
            }
            .w2-inbox-grid {
                flex: 1;
                display: grid;
                grid-template-columns: 320px 1fr 380px;
                min-height: 0;
            }
            .w2-inbox-sidebar {
                border-right: 1px solid #dddddd;
                display: flex;
                flex-direction: column;
                min-height: 0;
                background: #fff;
            }
            .w2-inbox-sb-head {
                padding: 12px;
                border-bottom: 1px solid #dddddd;
                display: flex;
                gap: 8px;
                align-items: center;
                flex-shrink: 0;
                background: #fff;
            }
            .w2-inbox-sb-search {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 6px;
                background: #f5f6f8;
                border: 1px solid #e6e8ed;
                border-radius: 6px;
                padding: 0 10px;
                height: 32px;
                box-sizing: border-box;
            }
            .w2-inbox-sb-search input {
                flex: 1;
                background: transparent;
                border: 0;
                outline: 0;
                font-size: 14px;
                color: #1d2939;
                min-width: 0;
                font-family: inherit;
                height: 100%;
            }
            .w2-inbox-sb-search input::placeholder { color: #98a2b3; }
            .w2-inbox-sb-filter {
                border: 0;
                background: #eaecf0;
                color: #344054;
                font-size: 14px;
                font-weight: 500;
                padding: 0 12px;
                height: 32px;
                border-radius: 6px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                flex-shrink: 0;
                font-family: inherit;
            }
            .w2-inbox-sb-filter:hover { background: #dfe2e7; color: #1d2939; }
            .w2-inbox-sb-filter.is-active {
                background: #ede9fe;
                color: #6d28d9;
                font-weight: 600;
            }
            .w2-inbox-sb-filter-count {
                background: #7c3aed;
                color: #fff;
                font-size: 11px;
                font-weight: 700;
                min-width: 16px;
                height: 16px;
                padding: 0 5px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .w2-inbox-sb-filter-count[hidden] { display: none; }
            .w2-inbox-sb-filter-wrap { position: relative; flex-shrink: 0; }
            /* Pancake-style 2-column filter popover — anchored to the
               filter button. Pancake floats the popup to the right of
               the sidebar so it doesn't get clipped; we mirror that by
               anchoring left: 0 of the button (popup extends rightward
               into the chat area). */
            .w2-fm-pancake {
                position: absolute;
                top: calc(100% + 6px);
                left: 0;
                background: #fff;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
                z-index: 30;
                display: flex;
                min-width: 540px;
                max-width: 640px;
                overflow: hidden;
            }
            .w2-fm-pancake[hidden] { display: none; }
            .w2-fm-col-cats {
                width: 240px;
                flex-shrink: 0;
                padding: 6px 4px;
                background: #fafafa;
                border-right: 1px solid #eef2f6;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .w2-fm-col-sub {
                flex: 1;
                min-width: 280px;
                max-height: 420px;
                display: flex;
                flex-direction: column;
                background: #fff;
            }
            .w2-fm-section {
                padding: 8px 10px 4px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #94a3b8;
            }
            .w2-fm-divider {
                height: 1px;
                background: #e2e8f0;
                margin: 4px 6px;
            }
            .w2-fm-cat {
                border: 0;
                background: transparent;
                text-align: left;
                padding: 9px 10px;
                font-size: 13px;
                font-family: inherit;
                color: #1d2939;
                cursor: pointer;
                border-radius: 6px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .w2-fm-cat:hover { background: #eef2f6; }
            .w2-fm-cat.is-active { background: #ede9fe; color: #6d28d9; font-weight: 600; }
            .w2-fm-cat-label { flex: 1; }
            .w2-fm-cat-count {
                background: #e0e7ff;
                color: #4338ca;
                font-size: 10px;
                font-weight: 700;
                padding: 1px 6px;
                border-radius: 999px;
                min-width: 18px;
                text-align: center;
            }
            .w2-fm-cat-count:empty { display: none; }
            .w2-fm-reset {
                border: 0;
                background: transparent;
                text-align: left;
                padding: 8px 10px;
                font-size: 12px;
                font-family: inherit;
                color: #64748b;
                cursor: pointer;
                border-radius: 6px;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .w2-fm-reset:hover { background: #f1f5f9; color: #1d2939; }
            .w2-fm-sub-search {
                padding: 10px;
                border-bottom: 1px solid #eef2f6;
                position: relative;
            }
            .w2-fm-sub-search input {
                width: 100%;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 6px 10px 6px 28px;
                font-size: 12px;
                font-family: inherit;
                outline: none;
                background: #fff;
            }
            .w2-fm-sub-search input:focus { border-color: #c4b5fd; box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12); }
            .w2-fm-sub-search-icon {
                position: absolute;
                left: 18px;
                top: 50%;
                transform: translateY(-50%);
                color: #94a3b8;
                pointer-events: none;
            }
            .w2-fm-sub-list {
                flex: 1;
                overflow-y: auto;
                padding: 4px 6px;
            }
            .w2-fm-sub-empty {
                padding: 24px 12px;
                font-size: 12px;
                color: #94a3b8;
                text-align: center;
                font-style: italic;
            }
            .w2-fm-row {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 8px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            }
            .w2-fm-row:hover { background: #f8fafc; }
            .w2-fm-row input[type="checkbox"] {
                width: 14px;
                height: 14px;
                accent-color: #7c3aed;
                cursor: pointer;
            }
            .w2-fm-tag-chip {
                display: inline-block;
                padding: 3px 10px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 600;
                color: #fff;
                line-height: 1.4;
            }
            .w2-fm-tag-chip-empty {
                background: transparent;
                color: #64748b;
                border: 1px dashed #cbd5e1;
            }
            .w2-fm-sub-placeholder {
                padding: 60px 16px;
                color: #94a3b8;
                font-size: 12px;
                text-align: center;
                font-style: italic;
            }
            .w2-inbox-sb-list {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 0;
                background: #fff;
            }
            .w2-inbox-sb-empty { padding: 6px 0; }
            .w2-inbox-conv {
                display: flex;
                gap: 10px;
                padding: 12px;
                cursor: pointer;
                position: relative;
                background: #fff;
                transition: background 0.12s ease;
                min-height: 86px;
                box-sizing: border-box;
                align-items: center;
            }
            .w2-inbox-conv:hover { background: #f5f6f8; }
            .w2-inbox-conv.is-active { background: #e6f7ff; }
            .w2-inbox-conv.is-active:hover { background: #d3efff; }
            .w2-inbox-conv.is-unread { background: #dde1e7; }
            .w2-inbox-conv.is-unread:hover { background: #d2d7df; }
            .w2-inbox-conv.is-unread .w2-inbox-conv-name { font-weight: 600; }
            .w2-inbox-conv.is-unread .w2-inbox-conv-preview { color: #1d2939; font-weight: 500; }
            .w2-inbox-conv-avatar {
                width: 48px; height: 48px;
                border-radius: 50%;
                object-fit: cover;
                flex-shrink: 0;
                background: #e6e8ed;
            }
            .w2-inbox-conv-body { flex: 1; min-width: 0; }
            .w2-inbox-conv-top {
                display: flex; align-items: center; justify-content: space-between;
                font-size: 14px; font-weight: 400; color: #1d2939;
                margin-bottom: 4px;
                gap: 6px;
            }
            .w2-inbox-conv-name {
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                min-width: 0;
            }
            .w2-inbox-conv-time { font-size: 12px; color: #98a2b3; font-weight: 400; flex-shrink: 0; }
            .w2-inbox-conv-preview {
                font-size: 13px; color: #667085;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                line-height: 1.35;
            }
            .w2-inbox-conv-badge {
                position: absolute;
                top: 14px; right: 14px;
                width: 8px; height: 8px;
                border-radius: 50%;
                background: #f04438;
            }

            /* ─── INBOX CENTRE (chat panel) — Pancake palette ───── */
            .w2-inbox-center {
                display: flex;
                flex-direction: column;
                min-height: 0;
                background: #ebebeb; /* Pancake's chat-area neutral gray */
            }
            .w2-inbox-header {
                padding: 4px 12px 6px;
                border-bottom: 1px solid #dddddd;
                display: flex;
                align-items: center;
                gap: 10px;
                background: #ffffff;
                flex-shrink: 0;
                height: 68px;
                box-sizing: border-box;
            }
            .w2-inbox-icon-btn {
                width: 30px; height: 30px;
                border: 1px solid #e2e8f0;
                background: #fff;
                color: #475569;
                cursor: pointer;
                border-radius: 6px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
            }
            .w2-inbox-icon-btn:hover { background: #f1f5f9; color: #0f172a; border-color: #cbd5e1; }
            .w2-inbox-tabs {
                display: flex;
                border-bottom: 1px solid #e5e7eb;
                background: #fff;
                padding: 0 12px;
                flex-shrink: 0;
            }
            .interactions-tab {
                padding: 10px 16px;
                border: none;
                background: transparent;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                color: #64748b;
                border-bottom: 3px solid transparent;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                margin-bottom: -1px;
            }
            .interactions-tab.is-active { color: #7c3aed; border-bottom-color: #7c3aed; }
            .w2-inbox-tab-badge {
                background: #cbd5e1;
                color: #fff;
                padding: 1px 7px;
                border-radius: 9px;
                font-size: 10px;
                font-weight: 700;
                min-width: 18px;
                text-align: center;
            }
            .w2-inbox-tab-badge.is-active { background: #7c3aed; }

            /* ─── INBOX RIGHT PANEL ─────────────────────────────── */
            .w2-inbox-right {
                border-left: 1px solid #e5e7eb;
                display: flex;
                flex-direction: column;
                min-height: 0;
                background: #fff;
            }
            .w2-inbox-right-tabs {
                display: flex;
                border-bottom: 1px solid #e5e7eb;
                background: #fff;
                padding: 0 16px;
                flex-shrink: 0;
            }
            .w2-inbox-right-tab {
                padding: 12px 14px;
                background: transparent;
                border: none;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                color: #64748b;
                border-bottom: 3px solid transparent;
                margin-bottom: -1px;
            }
            .w2-inbox-right-tab.is-active { color: #7c3aed; border-bottom-color: #7c3aed; }
            .w2-inbox-right-body {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                padding: 4px 0 80px;
                background: #fff;
            }
            .w2-section {
                padding: 12px 16px;
                border-bottom: 1px solid #f1f5f9;
            }
            .w2-section-title {
                font-size: 11px;
                font-weight: 700;
                color: #475569;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                display: inline-flex;
                align-items: center;
                gap: 5px;
            }
            .w2-section-title-row {
                display: flex; align-items: center; justify-content: space-between;
                margin-bottom: 8px;
            }
            .w2-section-action {
                font-size: 11px; color: #7c3aed; text-decoration: none; font-weight: 600;
            }
            .w2-section-action:hover { text-decoration: underline; }
            .w2-info-row {
                display: flex; gap: 10px; font-size: 12px;
                padding: 4px 0;
                color: #0f172a;
            }
            .w2-info-label { width: 72px; color: #64748b; flex-shrink: 0; }
            .w2-info-val { flex: 1; min-width: 0; word-break: break-word; }
            .w2-info-note {
                width: 100%; box-sizing: border-box;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 6px 8px;
                font-size: 12px;
                font-family: inherit;
                resize: vertical;
                margin-top: 6px;
            }
            .w2-input {
                width: 100%; box-sizing: border-box;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 7px 9px;
                font-size: 12px;
                color: #0f172a;
                outline: 0;
                font-family: inherit;
            }
            .w2-input:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }
            .w2-form-row { margin-top: 6px; }
            .w2-form-row-2col {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px;
            }
            .w2-select-trigger {
                width: 100%; box-sizing: border-box;
                background: #fff;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 7px 9px;
                font-size: 12px;
                color: #94a3b8;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-top: 6px;
            }
            .w2-customer-card {
                margin-top: 10px;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                cursor: pointer;
            }
            .w2-customer-card-avatar {
                width: 32px; height: 32px;
                border-radius: 50%;
                background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
                color: #fff;
                font-size: 13px;
                font-weight: 700;
                display: flex; align-items: center; justify-content: center;
                flex-shrink: 0;
            }
            .w2-line-table-head {
                display: flex; gap: 6px;
                font-size: 10px; color: #64748b;
                text-transform: uppercase; letter-spacing: 0.3px;
                font-weight: 700;
                padding: 6px 0;
                border-bottom: 1px solid #e2e8f0;
            }
            .w2-line-table-body { min-height: 80px; padding: 8px 0; }
            .w2-line-empty {
                text-align: center;
                color: #94a3b8;
                font-size: 12px;
                padding: 24px 0;
            }
            .w2-product-add {
                display: flex; gap: 6px;
                margin-top: 6px;
            }
            .w2-product-search {
                flex: 1; display: flex; align-items: center; gap: 6px;
                background: #f1f5f9;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 6px 9px;
            }
            .w2-product-search input {
                flex: 1; background: transparent; border: 0; outline: 0;
                font-size: 12px;
            }
            .w2-btn {
                border: 1px solid #e2e8f0; background: #fff; color: #475569;
                font-size: 12px; font-weight: 600;
                padding: 6px 12px; border-radius: 6px;
                cursor: pointer;
                display: inline-flex; align-items: center; gap: 4px;
            }
            .w2-btn-light:hover { background: #f1f5f9; }
            .w2-btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
            .w2-btn-primary:hover { background: #1d4ed8; }
            .w2-btn-primary-lg {
                background: #2563eb; color: #fff; border-color: #2563eb;
                font-size: 13px; padding: 8px 16px;
            }
            .w2-btn-primary-lg:hover { background: #1d4ed8; }
            .w2-checkbox {
                display: inline-flex; align-items: center; gap: 5px;
                font-size: 12px; cursor: pointer; user-select: none;
            }
            .w2-totals {
                margin-top: 10px;
                display: flex; flex-direction: column; gap: 4px;
            }
            .w2-total-row {
                display: flex; justify-content: space-between;
                font-size: 12px; color: #475569;
            }
            .w2-total-row strong { color: #0f172a; }
            .w2-inbox-right-foot {
                position: absolute;
                bottom: 0; left: 0; right: 0;
                padding: 10px 16px;
                background: #fff;
                border-top: 1px solid #e5e7eb;
                display: flex; align-items: center; justify-content: space-between;
                font-size: 14px;
            }

            /* ─── QUICK REPLY TAG ROW ───────────────────────────── */
            .w2-quick-reply-row {
                display: flex; flex-wrap: wrap; gap: 3px;
                padding: 6px 10px;
                background: #fff;
                border-top: 1px solid #f1f5f9;
                flex-shrink: 0;
            }
            .w2-quick-tag {
                color: #fff;
                font-size: 10px;
                font-weight: 600;
                padding: 3px 9px;
                border-radius: 3px;
                border: 0;
                cursor: pointer;
                text-shadow: 0 1px 1px rgba(0,0,0,0.15);
                line-height: 1.2;
            }
            .w2-quick-tag:hover { filter: brightness(0.92); }

            /* Make the right panel scroll container relative so the
               sticky footer (.w2-inbox-right-foot) can anchor inside it. */
            .w2-inbox-right { position: relative; }

            /* Skeleton bubbles shown while Pancake API is in flight */
            .w2-chat-skeleton-bubble {
                background: linear-gradient(90deg, #eef2f7 0%, #f8fafc 50%, #eef2f7 100%);
                background-size: 200% 100%;
                animation: w2ChatShimmer 1.2s linear infinite;
            }
            @keyframes w2ChatShimmer {
                0%   { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
            .w2-chat-bubble img { display: block; }
            .w2-chat-bubble audio { width: 240px; }

            /* Quoted reply preview inside bubble */
            .w2-chat-quoted {
                background: rgba(0,0,0,0.06);
                border-left: 3px solid rgba(255,255,255,0.55);
                padding: 5px 8px;
                border-radius: 6px;
                margin-bottom: 5px;
                opacity: 0.92;
            }
            .w2-chat-row.is-in .w2-chat-quoted {
                border-left-color: #7c3aed;
                background: #f1f5f9;
            }
            .w2-chat-quoted-from {
                font-size: 10px;
                font-weight: 700;
                margin-bottom: 2px;
                opacity: 0.85;
            }

            /* Floating reactions strip below bubble */
            .w2-chat-reactions {
                display: inline-flex;
                gap: 2px;
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 999px;
                padding: 1px 6px;
                margin-top: -8px;
                margin-bottom: 2px;
                box-shadow: 0 2px 6px rgba(15,23,42,0.1);
                font-size: 12px;
                z-index: 2;
                align-self: flex-end;
            }
            .w2-chat-row.is-in .w2-chat-reactions { align-self: flex-start; }

            /* Hover reply button */
            .w2-chat-reply-btn {
                opacity: 0;
                width: 22px; height: 22px;
                background: #fff;
                border: 1px solid #e2e8f0;
                border-radius: 50%;
                color: #64748b;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: opacity 0.15s, color 0.15s, background 0.15s;
                flex-shrink: 0;
            }
            .w2-chat-row:hover .w2-chat-reply-btn { opacity: 1; }
            .w2-chat-reply-btn:hover { background: #ede9fe; color: #7c3aed; }

            /* "Replying to X" bar above input */
            .w2-chat-reply-bar {
                display: flex;
                align-items: center;
                gap: 8px;
                background: #f1f5f9;
                border-left: 3px solid #7c3aed;
                padding: 6px 10px;
                border-radius: 6px;
                margin-bottom: 6px;
                font-size: 12px;
                color: #475569;
            }
            .w2-chat-reply-bar .preview {
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .w2-chat-reply-bar .preview strong { color: #7c3aed; margin-right: 6px; }
            .w2-chat-reply-bar button {
                width: 22px; height: 22px;
                background: transparent;
                border: 0;
                cursor: pointer;
                color: #94a3b8;
                font-size: 16px;
                line-height: 1;
            }
            .w2-chat-reply-bar button:hover { color: #b91c1c; }

            /* Highlighted message when being replied to */
            .w2-chat-row.is-replying-target .w2-chat-bubble {
                outline: 2px solid #fbbf24;
                outline-offset: 2px;
                animation: w2ChatHighlight 0.7s ease-in-out;
            }
            @keyframes w2ChatHighlight {
                0%, 100% { outline-color: #fbbf24; }
                50%      { outline-color: #f59e0b; }
            }

            #orderInteractionsModal .w2p-card { background:#fff; }
            #msgInput:focus {
                outline: none;
                border-color: #7c3aed !important;
                box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
            }
        `;
        const el = document.createElement('style');
        el.id = 'w2-chat-modal-css';
        el.textContent = css;
        document.head.appendChild(el);
    }

    /**
     * Render the cached message list into the thread element with date
     * separators. Preserves scroll-from-bottom behaviour: pass
     * `anchor: 'bottom'` for initial / new message; pass `anchor: 'top'`
     * for prepend after scroll-load-older.
     */
    // Build HTML for one logical message slot (date separator if needed +
    // bubble). `prevMsg` and `nextMsg` are siblings used to decide whether
    // to emit a new date separator + whether to show the avatar.
    function _bubbleSlotHtml(m, prevMsg, nextMsg, pageId) {
        const parts = [];
        const ts = _msgTimestamp(m);
        const label = _dateLabel(ts);
        const prevLabel = prevMsg ? _dateLabel(_msgTimestamp(prevMsg)) : '';
        if (label && label !== prevLabel) parts.push(_dateSeparatorHtml(label));
        const isOutgoing = m.from?.id === pageId || m.from_admin || m.is_admin;
        const nextOutgoing =
            nextMsg && (nextMsg.from?.id === pageId || nextMsg.from_admin || nextMsg.is_admin);
        const sameSenderNext = nextMsg && !nextOutgoing && nextMsg.from?.id === m.from?.id;
        const showAvatar = !isOutgoing && !sameSenderNext;
        parts.push(_bubbleHtml(m, pageId, { showAvatar }));
        return parts.join('');
    }

    function _loadOlderIndicatorHtml() {
        return `<div id="msgLoadOlder" style="align-self:center;font-size:11px;color:#7c3aed;padding:4px 0;cursor:pointer;">↑ Cuộn lên để tải tin cũ hơn</div>`;
    }

    /**
     * Initial render only — wipes the thread and rebuilds it from
     * `_chatState.msgs`. Avoid calling for incremental updates; use
     * `_appendBubbleDom` / `_prependBubblesDom` instead which only
     * touch the new DOM nodes and don't reflow the existing thread.
     */
    function _renderChatThread(anchor) {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl || !_chatState) return;
        // Enable layout/paint containment so scrolling doesn't repaint
        // the surrounding modal chrome.
        // Removed inline `contain` + `will-change` — see _ensureChatModalCss
        // header note. Native scroll on a small DOM doesn't need them and
        // they were contributing to the visual jank the user reported.
        const { msgs, pageId } = _chatState;
        if (!msgs.length) {
            threadEl.innerHTML = `<div style="color:#94a3b8;font-size:12px;padding:30px 0;text-align:center;font-style:italic;">Hội thoại trống. Gõ tin nhắn để bắt đầu.</div>`;
            return;
        }
        const prevScrollHeight = threadEl.scrollHeight;
        const prevScrollTop = threadEl.scrollTop;
        const parts = [];
        if (_chatState.hasMore) parts.push(_loadOlderIndicatorHtml());
        for (let i = 0; i < msgs.length; i++) {
            parts.push(_bubbleSlotHtml(msgs[i], msgs[i - 1], msgs[i + 1], pageId));
        }
        threadEl.innerHTML = parts.join('');
        if (anchor === 'top') {
            requestAnimationFrame(() => {
                threadEl.scrollTop = threadEl.scrollHeight - prevScrollHeight + prevScrollTop;
            });
        } else {
            requestAnimationFrame(() => {
                threadEl.scrollTop = threadEl.scrollHeight;
                requestAnimationFrame(() => {
                    threadEl.scrollTop = threadEl.scrollHeight;
                });
            });
        }
    }

    /**
     * Append a single new (or just-arrived) message bubble without
     * touching the existing DOM. Re-evaluates the last bubble's avatar
     * state so consecutive-group collapsing stays consistent.
     */
    function _appendBubbleDom(msg) {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl || !_chatState) return;
        const { msgs, pageId } = _chatState;
        const idx = msgs.indexOf(msg);
        if (idx < 0) return;
        const prev = msgs[idx - 1];
        const html = _bubbleSlotHtml(msg, prev, null, pageId);

        // If the previously-last visible bubble was an incoming row showing
        // an avatar but the new bubble is from the same sender, hide its
        // avatar (it's no longer the group's tail).
        if (prev && !(prev.from?.id === pageId || prev.from_admin || prev.is_admin)) {
            const sameSender = prev.from?.id === msg.from?.id;
            if (sameSender) {
                const prevRow = threadEl.querySelector(
                    `.w2-chat-row[data-msg-id="${CSS.escape(String(prev.id || ''))}"]`
                );
                const slot = prevRow?.querySelector('.w2-chat-avatar-slot');
                if (slot) slot.innerHTML = '<div style="width:28px;flex-shrink:0;"></div>';
            }
        }

        threadEl.insertAdjacentHTML('beforeend', html);
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    /**
     * Prepend N older messages without rebuilding the thread. Preserves
     * the user's visible scroll position by adjusting scrollTop by the
     * inserted block's height.
     */
    function _prependBubblesDom(olderMsgs) {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl || !_chatState || !olderMsgs?.length) return;
        const { msgs, pageId } = _chatState;
        // olderMsgs are already merged at the head of msgs[]
        const prevScrollHeight = threadEl.scrollHeight;
        const prevScrollTop = threadEl.scrollTop;
        const parts = [];
        for (let i = 0; i < olderMsgs.length; i++) {
            const m = olderMsgs[i];
            // prevMsg here = msgs[i-1] (i.e. one older than current m); for
            // the very first message it's null.
            const prev = i > 0 ? olderMsgs[i - 1] : null;
            // nextMsg here = the message that comes AFTER m in the merged
            // list, which is olderMsgs[i+1] OR (if last older) the first
            // existing msg before the merge, found at msgs[olderMsgs.length]
            const next = i + 1 < olderMsgs.length ? olderMsgs[i + 1] : msgs[olderMsgs.length];
            parts.push(_bubbleSlotHtml(m, prev, next, pageId));
        }

        // Update the first existing bubble's avatar visibility if its
        // sender now has an older sibling in the same group.
        const firstExisting = msgs[olderMsgs.length];
        const lastOlder = olderMsgs[olderMsgs.length - 1];
        if (
            firstExisting &&
            lastOlder &&
            !(firstExisting.from?.id === pageId || firstExisting.from_admin) &&
            lastOlder.from?.id === firstExisting.from?.id
        ) {
            // firstExisting is no longer the head of its group — but we
            // already render avatar only on the tail, so no DOM change
            // needed for it. The tail-rule already covered this.
        }

        const wrapper = document.createElement('div');
        wrapper.innerHTML = parts.join('');
        // Remove the existing "load older" indicator (we'll re-insert at top
        // afterward if more remain).
        const oldIndicator = document.getElementById('msgLoadOlder');
        if (oldIndicator) oldIndicator.remove();

        const frag = document.createDocumentFragment();
        while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
        threadEl.insertBefore(frag, threadEl.firstChild);
        if (_chatState.hasMore) {
            threadEl.insertAdjacentHTML('afterbegin', _loadOlderIndicatorHtml());
        }
        // Restore scroll so the previously-visible bubble stays where the
        // user's eye was.
        requestAnimationFrame(() => {
            threadEl.scrollTop = threadEl.scrollHeight - prevScrollHeight + prevScrollTop;
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    let _scrollRafPending = false;
    function _attachScrollLoader() {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl || !_chatState) return;
        threadEl.addEventListener('scroll', _onScrollRaw, { passive: true });
    }

    /**
     * Cheap pre-fetch skeleton. Renders 5 alternating-side placeholder
     * bubbles with the shimmer animation already defined on `.w2-chat-
     * skeleton-bubble`. Keeps the same flex column layout as the real
     * thread so swapping in the real messages doesn't reflow the modal.
     */
    function _skeletonThreadHtml() {
        const rows = [
            { side: 'in', w: '62%' },
            { side: 'out', w: '48%' },
            { side: 'in', w: '75%' },
            { side: 'out', w: '40%' },
            { side: 'in', w: '55%' },
        ];
        return rows
            .map((r) => {
                const align = r.side === 'in' ? 'flex-start' : 'flex-end';
                const radius = r.side === 'in' ? '14px 14px 14px 4px' : '14px 14px 4px 14px';
                return `<div style="display:flex;justify-content:${align};margin:2px 0;">
                    <div class="w2-chat-skeleton-bubble" style="width:${r.w};max-width:80%;height:32px;border-radius:${radius};"></div>
                </div>`;
            })
            .join('');
    }
    function _onScrollRaw() {
        if (_scrollRafPending) return;
        _scrollRafPending = true;
        requestAnimationFrame(() => {
            _scrollRafPending = false;
            _onChatScroll();
        });
    }
    function _onChatScroll() {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl || !_chatState) return;
        if (threadEl.scrollTop < 80 && _chatState.hasMore && !_chatState.loadingOlder) {
            _loadOlderMessages();
        }
        const nearBottom = threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 40;
        const jump = document.getElementById('msgJumpBottom');
        if (jump && nearBottom && jump.style.display !== 'none') {
            jump.style.display = 'none';
            _chatState.missedSince = 0;
        }
    }

    async function _loadOlderMessages() {
        if (!_chatState || _chatState.loadingOlder) return;
        _chatState.loadingOlder = true;
        const indicator = document.getElementById('msgLoadOlder');
        if (indicator)
            indicator.innerHTML = `<span style="color:#7c3aed;">⏳ Đang tải tin cũ…</span>`;
        try {
            const cursor = _chatState.cursor || _chatState.msgs.length;
            const r = await window.Web2Chat.fetchMessages(
                _chatState.pageId,
                _chatState.convId,
                _chatState.customerId,
                { currentCount: cursor }
            );
            if (!r.ok) {
                _chatState.hasMore = false;
                indicator?.remove();
                return;
            }
            const incoming = r.messages || [];
            const fresh = incoming.filter((m) => m.id && !_chatState.msgIds.has(m.id));
            if (!fresh.length) {
                _chatState.hasMore = false;
                indicator?.remove();
                return;
            }
            for (const m of fresh) _chatState.msgIds.add(m.id);
            _chatState.msgs = [...fresh, ..._chatState.msgs];
            _chatState.cursor = cursor + fresh.length;
            // Incremental DOM prepend — keeps the existing 25-55 bubbles
            // untouched (no reflow), inserts only the N new ones.
            _prependBubblesDom(fresh);
        } catch (e) {
            console.warn('[NativeOrders] loadOlder failed:', e.message);
        } finally {
            _chatState.loadingOlder = false;
        }
    }

    /**
     * Optimistically append a just-sent outgoing message to the thread so
     * the user sees their bubble instantly without waiting for the next
     * fetchMessages round-trip. Marked with a temp id; if a real WS event
     * later carries the same content, the id-dedup map prevents double-render.
     */
    function _appendOutgoing(text) {
        if (!_chatState) return null;
        const fake = {
            id: 'local_' + Date.now(),
            from: { id: _chatState.pageId, name: 'You' },
            from_admin: true,
            message: text,
            inserted_at: new Date().toISOString(),
            attachments: [],
        };
        _chatState.msgs.push(fake);
        _chatState.msgIds.add(fake.id);
        // Append only the new bubble (no full re-render)
        _appendBubbleDom(fake);
        const t = document.getElementById('msgThread');
        if (t) t.scrollTop = t.scrollHeight;
        return fake.id; // caller giữ id để rollback (gỡ bong bóng nếu gửi thất bại)
    }

    /**
     * Gỡ 1 bong bóng outgoing tạm (UI-first rollback) — xoá khỏi _chatState.msgs,
     * msgIds và DOM. Dùng khi gửi thất bại cả 2 route để khôi phục trạng thái.
     */
    function _removeOutgoing(localId) {
        if (!localId || !_chatState) return;
        const idx = _chatState.msgs.findIndex((m) => m.id === localId);
        if (idx >= 0) _chatState.msgs.splice(idx, 1);
        _chatState.msgIds?.delete?.(localId);
        const row = document.querySelector(
            `.w2-chat-row[data-msg-id="${CSS.escape(String(localId))}"]`
        );
        if (row) row.remove();
    }

    function _onIncomingWsMessage(payload) {
        if (!_chatState) return;
        // Pancake broker forwards two distinct WS event shapes; normalise:
        //   pages:new_message        → payload.message = { id, conversation_id, message, from, … }
        //   pages:update_conversation → payload.conversation = { id, last_message: { id, message, from, … } }
        // Last_message often lacks conversation_id — inject it. The
        // sidebar handler does the same dance in _handleSidebarWsEvent.
        let m;
        let convId;
        if (payload?.message) {
            m = payload.message;
            convId = m.conversation_id || m.conversationId;
        } else if (payload?.conversation?.last_message) {
            convId = payload.conversation.id;
            m = { ...payload.conversation.last_message, conversation_id: convId };
        } else {
            return;
        }
        if (!m) return;
        if (convId && String(convId) !== String(_chatState.convId)) return;
        if (m.id && _chatState.msgIds.has(m.id)) return;
        if (m.id) _chatState.msgIds.add(m.id);
        _chatState.msgs.push(m);
        const threadEl = document.getElementById('msgThread');
        if (!threadEl) return;
        const nearBottom = threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 80;
        // Append-only DOM patch (no full re-render of existing thread)
        _appendBubbleDom(m);
        if (nearBottom) {
            requestAnimationFrame(() => {
                threadEl.scrollTop = threadEl.scrollHeight;
            });
        } else {
            _chatState.missedSince = (_chatState.missedSince || 0) + 1;
            const jump = document.getElementById('msgJumpBottom');
            const cnt = document.getElementById('msgJumpCount');
            if (jump && cnt) {
                cnt.textContent = String(_chatState.missedSince);
                jump.style.display = '';
            }
        }
    }

    function _teardownChatState() {
        if (_chatState?.wsSub?.unsubscribe) {
            try {
                _chatState.wsSub.unsubscribe();
            } catch {
                /* ignore */
            }
        }
        if (_sidebarWsSub?.unsubscribe) {
            try {
                _sidebarWsSub.unsubscribe();
            } catch {
                /* ignore */
            }
            _sidebarWsSub = null;
        }
        if (_sidebarPollTimer) {
            clearInterval(_sidebarPollTimer);
            _sidebarPollTimer = null;
        }
        _chatState = null;
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
        // Đơn inbox tay chưa bind fb page/user. Thử resolve hội thoại theo SĐT
        // (logic riêng tab Inbox) → nếu thấy thì bind psid+page rồi load thread
        // bình thường. Không thấy → prompt mời chọn hội thoại từ sidebar (đã tự
        // search theo tên/SĐT). Đơn livestream luôn có fbPageId nên không vào đây.
        if (!order.fbPageId || !order.fbUserId) {
            if (order.phone) {
                let r = null;
                try {
                    r = await _resolveInboxConvByPhone(order.phone);
                } catch {
                    /* tolerate → prompt bên dưới */
                }
                if (r && r.fbId && r.pageId) {
                    const synthetic = {
                        ...order,
                        fbUserId: r.fbId,
                        fbPageId: r.pageId,
                        fbUserName: order.customerName || r.name || '',
                    };
                    const o = STATE.orders.find((x) => x.code === order.code);
                    if (o) {
                        o.fbUserId = o.fbUserId || r.fbId;
                        o.fbPageId = o.fbPageId || r.pageId;
                    }
                    _applyChatHeaderForOrder(synthetic);
                    return _loadAndRenderThread(synthetic); // load thread thật
                }
            }
            threadEl.innerHTML = `<div style="color:#94a3b8;font-size:12px;padding:40px 18px;text-align:center;line-height:1.6;">
                <i data-lucide="mouse-pointer-click" style="width:30px;height:30px;display:block;margin:0 auto 10px;color:#cbd5e1;"></i>
                Không tìm thấy hội thoại Facebook theo SĐT.<br>
                Chọn đúng hội thoại của khách ở <strong>danh sách bên trái</strong> để bắt đầu chat.
            </div>`;
            if (window.lucide?.createIcons) window.lucide.createIcons();
            return;
        }
        // Skeleton: show shimmering placeholder bubbles immediately so the
        // modal doesn't feel empty during the ~150–350ms it takes for
        // fetchConversations + fetchMessages to round-trip the Pancake
        // proxy. Replaced as soon as the real thread is rendered.
        threadEl.innerHTML = _skeletonThreadHtml();

        // Auto-sync accounts + page tokens from Render DB once per session.
        // Web 1.0 maintains this store; pulling it lets web 2.0 reuse the
        // same JWT pool and page_access_tokens without re-prompting the
        // user. Cached after first call so the cost is paid only once.
        if (window.Web2Chat.syncFromRenderDB) {
            try {
                await window.Web2Chat.syncFromRenderDB();
            } catch {
                /* network failure — fall through to localStorage-only flow */
            }
        }
        // If we still have no PAT for this specific page, try minting one
        // from any account that admins the page. Multi-account fallback
        // mirrors web 1.0's behaviour.
        if (
            order.fbPageId &&
            !window.Web2Chat.getPageAccessToken(order.fbPageId) &&
            window.Web2Chat.generatePageAccessToken
        ) {
            try {
                await window.Web2Chat.generatePageAccessToken(order.fbPageId);
            } catch {
                /* will surface as "no tokens" below */
            }
        }

        if (!window.Web2Chat.hasTokensFor(order.fbPageId)) {
            threadEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:14px;text-align:center;line-height:1.5;">
                Chưa cấu hình token Pancake cho page <code>${escapeHtml(order.fbPageId)}</code>.<br>
                <a href="../web2/pancake-settings/index.html" target="_blank" style="color:#7c3aed;">Mở Cấu hình Pancake (Web 2.0) →</a>
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
            const conv = inboxConvs[0];
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
            // Init shared state. Pancake returns oldest-first within a page.
            _teardownChatState();
            const msgs = msgRes.messages || [];
            const ids = new Set();
            for (const m of msgs) if (m.id) ids.add(m.id);
            _chatState = {
                order,
                pageId: order.fbPageId,
                convId: conv.id,
                customerId,
                msgs,
                msgIds: ids,
                cursor: msgs.length, // next page-load uses current_count = msgs.length
                hasMore: msgs.length > 0, // assume more until server returns nothing
                loadingOlder: false,
                missedSince: 0,
            };
            _renderChatThread('bottom');
            _attachScrollLoader();
            // Live update: WS append for the open conversation. Subscribe
            // to BOTH event types — `pages:update_conversation` fires
            // reliably from Pancake's Phoenix channel (broker captures
            // it 24/7) and carries `conversation.last_message`, whereas
            // `pages:new_message` rarely fires without FB socket creds.
            // Both flow through `_onIncomingWsMessage` which de-dupes by
            // message id, so subscribing twice is harmless.
            if (window.Web2Realtime?.subscribe) {
                _chatState.wsSub = window.Web2Realtime.subscribe({
                    types: ['pages:new_message', 'pages:update_conversation'],
                    onEvent: (m) => _onIncomingWsMessage(m.payload),
                    debounceMs: 0,
                });
            }
            const jumpBtn = document.getElementById('msgJumpBottom');
            jumpBtn?.addEventListener('click', () => {
                const t = document.getElementById('msgThread');
                if (!t) return;
                t.scrollTop = t.scrollHeight;
                jumpBtn.style.display = 'none';
                if (_chatState) _chatState.missedSince = 0;
            });
        } catch (e) {
            threadEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:14px;">Lỗi tải hội thoại: ${escapeHtml(e.message)}</div>`;
        }
    }

    async function _handleSendMessage(order) {
        const input = document.getElementById('msgInput');
        if (!input) return;
        const text = input.value.trim();
        const att = _pendingAttachment; // { file, kind } | null
        if (!text && !att) {
            notify('Vui lòng nhập tin nhắn', 'warning');
            return;
        }
        // Capture trước khi _setReplyTarget(null) xoá — gửi nền vẫn cần reply target.
        const replyToId = _chatState?.replyTo?.id || undefined;

        // UI-FIRST: hiện bong bóng + clear ô nhập NGAY (trước mọi await) → gửi chạy
        // nền. Không disable input (gõ tiếp được). Lỗi cả 2 route → _restore() gỡ
        // bong bóng + bật lại text vào ô để gửi lại.
        const fakeId = _appendOutgoing(text || _attachLabel(att?.kind));
        input.value = '';
        _setReplyTarget(null);
        _clearPendingAttachment();
        const _restore = () => {
            _removeOutgoing(fakeId);
            if (input && !input.value.trim()) {
                input.value = text;
                input.focus();
            }
            if (att) _setPendingAttachment(att.file);
        };

        // Try extension bridge first (bypasses Pancake 24h rule via FB Business)
        if (_hasExtension()) {
            try {
                // FB messaging/send/ cần OTHER_USER_FBID là FB Global ID (account thật, vd
                // 100001957832900), KHÔNG phải PSID (page-scoped id như 25717004554573583).
                // Gửi PSID → FB silent-reject với 1545012 "Tạm thời không thực hiện được".
                // Pancake luôn resolve global_id qua extension trước khi send.
                //
                // Handler signature (web2-extension/background/facebook/global-id.js#L67):
                //   GET_GLOBAL_ID_FOR_CONV cần {pageId, threadId, customerName} —
                //   KHÔNG nhận convId/fbUserId. Không có threadId+customerName → reject.
                let globalUserId = order._fbGlobalUserId;
                // ROUTE 1: Pancake API (nhanh, reliable — Pancake biết global_id
                // từ webhook trước). Endpoint messages?customer_id trả `customers[]`
                // có field `global_id` (FB account thật). Cùng nguồn Pancake UI dùng.
                if (!globalUserId && input.dataset.conversationId && window.Web2Chat) {
                    try {
                        const msgRes = await window.Web2Chat.fetchMessages(
                            order.fbPageId,
                            input.dataset.conversationId,
                            input.dataset.customerId || null
                        );
                        if (msgRes?.ok) {
                            const cust =
                                msgRes.customers?.find?.(
                                    (c) => c?.fb_id === order.fbUserId || c?.global_id
                                ) || msgRes.customers?.[0];
                            const gid =
                                cust?.global_id ||
                                msgRes.conversation?.page_customer?.global_id ||
                                null;
                            if (gid && String(gid) !== String(order.fbUserId)) {
                                globalUserId = String(gid);
                                order._fbGlobalUserId = globalUserId;
                                console.log(
                                    '[NativeOrders] globalUserId via Pancake API:',
                                    globalUserId,
                                    '(psid was',
                                    order.fbUserId + ')'
                                );
                            }
                        }
                    } catch (papiErr) {
                        console.warn(
                            '[NativeOrders] Pancake API global_id fetch failed:',
                            papiErr?.message || papiErr
                        );
                    }
                }
                // ROUTE 2: Extension GraphQL fallback (chậm hơn, fail nếu FB doc_ids
                // chưa load). Chỉ chạy nếu Pancake API không trả global_id.
                if (
                    !globalUserId &&
                    order.fbPageId &&
                    (input.dataset.threadId || order.customerName)
                ) {
                    try {
                        const gidResp = await _extensionRequest(
                            'GET_GLOBAL_ID_FOR_CONV',
                            {
                                pageId: order.fbPageId,
                                threadId: input.dataset.threadId || '',
                                customerName: order.customerName || order.fbUserName || '',
                                isBusiness: true,
                            },
                            30000
                        );
                        globalUserId =
                            gidResp?.data?.globalId ||
                            gidResp?.data?.globalUserId ||
                            gidResp?.data?.payload?.globalUserId;
                        if (globalUserId) {
                            order._fbGlobalUserId = globalUserId;
                            console.log(
                                '[NativeOrders] globalUserId via extension:',
                                globalUserId,
                                '(psid was',
                                order.fbUserId + ')'
                            );
                        } else {
                            console.warn(
                                '[NativeOrders] GET_GLOBAL_ID_FOR_CONV returned no id:',
                                gidResp
                            );
                        }
                    } catch (gidErr) {
                        console.warn(
                            '[NativeOrders] GET_GLOBAL_ID_FOR_CONV threw:',
                            gidErr?.message || gidErr
                        );
                    }
                }
                // Pancake convId format: 't_' + threadId (vd 't_32546288751686299').
                // Ours là pageId_psid (vd '270136663390370_25717004554573583') — chỉ dùng
                // internally bởi Pancake API, nhưng SW REPLY_INBOX_PHOTO không đụng convId
                // khi build POST tới FB. Vẫn nên truyền đúng format cho debug clarity.
                const swConvId = input.dataset.threadId
                    ? 't_' + input.dataset.threadId
                    : input.dataset.conversationId || '';
                // Upload attachment lên FB (qua extension) → fbId, rồi gửi kèm. Extension
                // hỗ trợ PHOTO/AUDIO/VIDEO/FILE; data-URL để SW fetch được mọi context.
                let files = [];
                let attachmentType = 'SEND_TEXT_ONLY';
                if (att && att.file) {
                    const dataUrl = await _fileToDataUrl(att.file);
                    const up = await _extensionRequest(
                        'UPLOAD_INBOX_PHOTO',
                        {
                            pageId: order.fbPageId,
                            photoUrl: dataUrl,
                            name: att.file.name || 'attachment',
                        },
                        60000
                    );
                    const fbId = up?.data?.fbId;
                    if (!up.ok || !fbId) {
                        // Upload thất bại → KHÔNG fallback Pancake (native-orders không có
                        // Pancake upload) → restore + báo.
                        _restore();
                        notify(
                            'Gửi tệp thất bại (extension upload): ' + (up?.error || 'unknown'),
                            'error'
                        );
                        return;
                    }
                    files = [fbId];
                    attachmentType = att.kind || 'FILE';
                }
                const r = await _extensionRequest('REPLY_INBOX_PHOTO', {
                    pageId: order.fbPageId,
                    globalUserId: globalUserId || order.fbUserId,
                    threadId: input.dataset.threadId || '',
                    convId: swConvId,
                    customerName: order.customerName || order.fbUserName || '',
                    conversationUpdatedTime: order.updatedAt
                        ? new Date(order.updatedAt).getTime()
                        : Date.now(),
                    message: text,
                    attachmentType,
                    files,
                    platform: 'facebook',
                    isBusiness: true,
                    repliedMessageId: replyToId,
                });
                if (r.ok) {
                    // Bong bóng đã hiện ở apply (UI-first) → chỉ cần báo.
                    notify('Đã gửi qua N2 Extension (bypass 24h)', 'success');
                    if (window.Web2NewMsgBadge?.clearPendingForCustomer) {
                        window.Web2NewMsgBadge.clearPendingForCustomer(order.fbUserId);
                    }
                    return;
                }
                console.warn('[NativeOrders] Extension send failed, fallback Pancake:', r.error);
            } catch (e) {
                console.warn('[NativeOrders] Extension bridge error, fallback Pancake:', e.message);
            }
        }

        // Fallback: Web2Chat client (Pancake Public API, subject to 24h rule).
        // Attachment cũng gửi được qua đây: upload_contents → content_id → sendMessage.
        if (!_hasChatClient() || !window.Web2Chat.hasTokensFor(order.fbPageId)) {
            _restore();
            notify('Chưa có Extension và chưa cấu hình token Pancake cho page này.', 'error');
            return;
        }
        let conversationId = input.dataset.conversationId;
        let customerId = input.dataset.customerId || null;
        if (!conversationId) {
            let r = { conversations: [] };
            try {
                r = await window.Web2Chat.fetchConversations(order.fbPageId, order.fbUserId);
            } catch (e) {
                console.warn('[NativeOrders] fetchConversations failed:', e?.message || e);
            }
            const list = r.conversations || [];
            if (list[0]) {
                conversationId = list[0].id;
                customerId = r.customerUuid || list[0]?.customers?.[0]?.id || customerId;
            }
        }
        if (!conversationId) {
            _restore();
            notify('Chưa tìm thấy hội thoại với khách.', 'error');
            return;
        }
        // Upload attachment lên Pancake (nếu có) → content_id để gửi kèm.
        let pancakeAttachments;
        if (att && att.file) {
            const up =
                typeof window.Web2Chat.uploadMedia === 'function'
                    ? await window.Web2Chat.uploadMedia(order.fbPageId, att.file)
                    : { ok: false, reason: 'uploadMedia unavailable' };
            if (!up.ok || !up.id) {
                _restore();
                notify('Upload tệp lên Pancake thất bại: ' + (up.reason || 'unknown'), 'error');
                return;
            }
            pancakeAttachments = [{ content_id: up.id }];
        }
        let sendRes;
        try {
            sendRes = await window.Web2Chat.sendMessage(order.fbPageId, conversationId, {
                text,
                action: 'reply_inbox',
                customerId,
                repliedMessageId: replyToId,
                attachments: pancakeAttachments,
            });
        } catch (e) {
            sendRes = { ok: false, reason: e?.message || 'send threw' };
        }
        if (sendRes.ok) {
            // Bong bóng đã hiện ở apply (UI-first) → chỉ cần báo.
            notify('Đã gửi tin nhắn', 'success');
            if (window.Web2NewMsgBadge?.clearPendingForCustomer) {
                window.Web2NewMsgBadge.clearPendingForCustomer(order.fbUserId);
            }
            return;
        }
        // Lỗi cả 2 route → gỡ bong bóng tạm + bật lại text + báo / prompt FB Business.
        _restore();
        const reason = String(sendRes.reason || 'unknown');
        const is24h = /e_?code.*10|2018278|24h|ngoài khoảng thời gian/i.test(reason);
        const extMissing = /extension.*not|chưa kết nối|not.*connected/i.test(reason);
        if (is24h || extMissing) {
            _showFbBusinessLoginPrompt(
                is24h
                    ? 'Quá 24h và extension chưa lấy được session FB Business. Đăng nhập Facebook (business.facebook.com) liên kết với Pancake để extension scrape được session, rồi thử lại.'
                    : 'Extension chưa kết nối. Đăng nhập Facebook (business.facebook.com) liên kết với Pancake để extension hoạt động.'
            );
        } else {
            notify('Lỗi gửi tin nhắn: ' + reason, 'error');
        }
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
        _teardownChatState();
    }

    // Hook for realtime refresh — called from WS event handler
    function _refreshInteractionsIfOpen(updatedOrder) {
        if (!_interactionsState || _interactionsState.code !== updatedOrder.code) return;
        // Merge updated fields into the live STATE entry (broadcast may carry newer data)
        const idx = STATE.orders.findIndex((o) => o.code === updatedOrder.code);
        if (idx !== -1) STATE.orders[idx] = { ...STATE.orders[idx], ...updatedOrder };
        _renderInteractionsModal(STATE.orders[idx] || updatedOrder, _interactionsState.tab);
    }

    // confirmDraft() đã xóa 2026-06-02 (user spec): workflow gom 1 bước, chỉ
    // dùng nút "Tạo PBH" (vừa confirm vừa tạo PBH luôn + deduct stock).

    // Tạo PBH bổ sung (tách đơn) — call /from-native-order với split=true.
    // Backend tự tăng split_index → PBH thứ 2 hiển thị STT '24-2', thứ 3 '24-3'.
    async function splitPbh(code) {
        if (!code) return;
        const src = STATE.orders.find((o) => o.code === code);
        if (!src) return notify('Không tìm thấy đơn ' + code, 'error');
        if (src.status !== 'confirmed') {
            return notify(
                `Đơn ${code} chưa confirmed — bấm "Tạo PBH" thường thay vì split`,
                'warning'
            );
        }
        const ok = await w2pConfirm(
            `Tách đơn ${code} (STT ${src.displayStt})?\n\n` +
                `→ Tạo PBH thứ 2 với CÙNG sản phẩm + KH (clone đơn gốc).\n` +
                `→ PBH mới có STT '${src.displayStt}-2' (hoặc -3, -4 nếu tách thêm).\n` +
                `→ Stock sẽ trừ thêm 1 lần (validate over-sell — fail nếu thiếu kho).`,
            { confirmText: 'Tách đơn', cancelText: 'Hủy' }
        );
        if (!ok) return;
        try {
            const url = `${window.NativeOrdersApi._getBaseUrl().replace('/native-orders', '')}/fast-sale-orders/from-native-order`;
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nativeOrderCode: code, split: true }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) {
                if (data?.error === 'over_sell') {
                    const viol = (data.violations || [])
                        .map((v) => `${v.code}: cần ${v.requested}, kho ${v.available}`)
                        .join('\n');
                    throw new Error(`Tách đơn thất bại — over-sell:\n${viol}`);
                }
                throw new Error(data.error || `HTTP ${r.status}`);
            }
            const splitIdx = data.order?.splitIndex || '?';
            notify(
                `✓ Tách đơn xong: PBH ${data.order?.number} (STT ${src.displayStt}-${splitIdx})`,
                'success'
            );
            await load();
        } catch (e) {
            console.error('[splitPbh]', e);
            notify(`Tách đơn thất bại: ${e.message}`, 'error');
        }
    }

    // Huỷ đơn web — status='cancelled'. Tự sync sang PBH (cancel + restock
    // nếu PBH active). Khác cancelPbh: cancelPbh chỉ hủy PBH, giữ đơn web
    // draft để tạo lại. cancelOrder hủy NGUYÊN ĐƠN luôn — không tạo lại.
    async function cancelOrder(code) {
        if (!code) return;
        const src = STATE.orders.find((o) => o.code === code);
        if (!src) return notify('Không tìm thấy đơn ' + code, 'error');
        if (src.status === 'cancelled') {
            return notify(`Đơn ${code} đã ở trạng thái cancelled`, 'warning');
        }
        const reasonRes = await (window.Popup?.prompt?.(`Lý do huỷ đơn ${code}?`, {
            defaultValue: '',
            okText: 'Huỷ đơn',
            cancelText: 'Quay lại',
        }) || Promise.resolve(prompt(`Lý do huỷ đơn ${code}:`, '')));
        if (reasonRes === null || reasonRes === undefined || reasonRes === false) return;
        const reason = String(reasonRes || '').trim();
        const ok = await w2pConfirm(
            `Xác nhận HUỶ ĐƠN ${code}?\n\n${src.status === 'confirmed' ? '⚠️ Đơn đang confirmed có PBH liên kết — PBH sẽ bị cancel + tự trả tồn về kho.' : '→ Status chuyển sang cancelled.'}\n\nHành động không thể undo (phải tạo đơn mới).`,
            { confirmText: 'Huỷ đơn', cancelText: 'Không' }
        );
        if (!ok) return;
        try {
            // `NativeOrdersApi._getBaseUrl()` không tồn tại — IIFE đóng kín
            // const `BASE`. Dùng WORKER_URL trực tiếp như cancelPbh + createPbh.
            const r = await fetch(
                `${WORKER_URL}/api/native-orders/${encodeURIComponent(code)}/cancel`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason: reason || null }),
                }
            );
            const data = await r.json();
            if (!r.ok || !data.success) {
                throw new Error(data.error || `HTTP ${r.status}`);
            }
            const synced = data.pbhSync?.synced || 0;
            notify(
                data.idempotent
                    ? `Đơn ${code} đã cancelled trước đó`
                    : `✓ Huỷ đơn ${code}${synced ? ` + sync ${synced} PBH` : ''}`,
                'success'
            );
            // SSE sẽ tự reload, nhưng update local cho responsive UX.
            if (data.order) {
                const i = STATE.orders.findIndex((o) => o.code === code);
                if (i >= 0) STATE.orders[i] = data.order;
                renderOrders();
            }
        } catch (e) {
            console.error('[cancelOrder]', e);
            notify(`Huỷ đơn thất bại: ${e.message}`, 'error');
        }
    }

    window.NativeOrdersApp = {
        openEdit,
        quickStatus,
        openDeliveryMenu,
        setDeliveryMethod,
        createPbh,
        cancelPbh,
        cancelPbhFromEdit,
        setLineNote,
        cancelOrder,
        splitPbh,
        splitOrder,
        removeOrder,
        bulkCreatePbh,
        bulkSendMessage,
        // Exposed for Web2MsgTemplate (port từ orders-report) — gọi extension
        // qua window.postMessage bridge với promise wrapper + timeout.
        _extensionRequest,
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
        // Livestream snapshot per-line — click thumbnail mở lightbox
        openSnapLightbox,
        // Customer side-panel (slide-in từ phải khi hover avatar 500ms)
        onCustAvatarEnter: _onCustAvatarEnter,
        onCustAvatarLeave: _onCustAvatarLeave,
        // 2026-06-01: nút "Lấy TPOS" thủ công khi đơn từ tpos-pancake rỗng phone/address
        fetchCustomerFromTpos,
        // Debug surface — inspect realtime + chat state from devtools.
        // Verify realtime is WS-driven (not polling): open chat then run
        // `NativeOrdersApp._debug.injectFakeMessage('hello')` — bubble
        // should appear instantly; if not, WS path is broken.
        _debug: {
            get chatState() {
                return _chatState;
            },
            get realtimeStatus() {
                return {
                    wsConnected: !!window.Web2Realtime?.isConnected(),
                    wsUrl: window.Web2Realtime?._internal?.WS_URL,
                    subscriberCount: window.Web2Realtime?._internal?.subscribers?.length,
                };
            },
            injectFakeMessage(text) {
                if (!_chatState) return { ok: false, reason: 'no_chat_open' };
                _onIncomingWsMessage({
                    conversation: {
                        id: _chatState.convId,
                        last_message: {
                            id: 'fake_' + Date.now(),
                            message: text || 'fake realtime test',
                            inserted_at: new Date().toISOString().replace('Z', ''),
                            from: { id: _chatState.customerId, name: 'Test Khách' },
                        },
                    },
                });
                return { ok: true, convId: _chatState.convId };
            },
            // Inspect livestream snapshot cache (per-line thumbnails từ TPOS-Pancake).
            get snapCache() {
                return Object.fromEntries(_snapCache);
            },
            // Simulate khi EDIT_LINES có fbCommentId — inject vào current modal +
            // re-render. Test wiring không cần thật sự kéo SP từ TPOS.
            simulateLineCommentId(idx, commentId) {
                if (!EDIT_LINES[idx]) return { err: 'no line at idx ' + idx };
                EDIT_LINES[idx].fbCommentId = commentId;
                renderOrderLines();
                return { ok: true, line: EDIT_LINES[idx] };
            },
        },
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
