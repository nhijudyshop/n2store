// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Cấu hình TAG Đơn Web (giỏ hàng/đơn hàng) — CRUD bảng web2_order_tags qua /api/web2-order-tags.
// Mỗi thẻ gắn 1 trigger (registry server). Hiển thị card + modal có live preview pill.
// Pill render dùng chung Web2OrderTagPill (cùng renderer với cột "Thẻ" native-orders).
(function () {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        (window.WEB2_CONFIG && window.WEB2_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = WORKER + '/api/web2-order-tags';

    const SWATCHES = [
        '#16a34a',
        '#dc2626',
        '#f59e0b',
        '#0068ff',
        '#7c3aed',
        '#0891b2',
        '#db2777',
        '#475569',
        '#ca8a04',
        '#15803d',
    ];

    const STATE = {
        records: [],
        triggers: [], // [{id,label,group,desc}]
        triggerById: new Map(),
        editingCode: null,
    };
    // Expose FULL dataset cho widget AI (Web2AiPageRegistry) — không chỉ DOM phân trang.
    window.Web2OrderTagsApp = { STATE };

    // ---------- helpers ----------
    function $(id) {
        return document.getElementById(id);
    }
    function esc(s) {
        if (window.Web2Escape?.escapeHtml) return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }
    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[${type}] ${msg}`);
    }
    function authHeaders() {
        try {
            if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders() || {};
        } catch {
            /* ignore */
        }
        return {};
    }
    async function apiGet(path) {
        const r = await fetch(API + path, { headers: { ...authHeaders() } });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        return data;
    }
    async function apiSend(method, path, body) {
        const r = await fetch(API + path, {
            method,
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        return data;
    }
    function icons() {
        if (window.lucide) window.lucide.createIcons();
    }

    // ---------- triggers ----------
    async function loadTriggers() {
        try {
            const data = await apiGet('/triggers');
            STATE.triggers = data.triggers || [];
        } catch (e) {
            console.warn('[order-tags] loadTriggers fail:', e.message);
            STATE.triggers = [];
        }
        STATE.triggerById = new Map(STATE.triggers.map((t) => [t.id, t]));
        renderTriggerSelect();
        renderTriggerReference();
    }
    function groupedTriggers() {
        const groups = new Map();
        for (const t of STATE.triggers) {
            if (!groups.has(t.group)) groups.set(t.group, []);
            groups.get(t.group).push(t);
        }
        return groups;
    }
    // Trigger đã được thẻ KHÁC dùng (loại exceptCode = thẻ đang sửa). Mỗi trigger
    // chỉ 1 thẻ → ẩn khỏi picker để khỏi tạo trùng (server cũng chặn 409).
    function usedTriggers(exceptCode) {
        return new Set(STATE.records.filter((r) => r.code !== exceptCode).map((r) => r.trigger));
    }
    function renderTriggerSelect(exceptCode) {
        const sel = $('otfTrigger');
        if (!sel) return;
        const used = usedTriggers(exceptCode);
        let html = '';
        for (const [group, items] of groupedTriggers()) {
            const avail = items.filter((t) => !used.has(t.id));
            if (!avail.length) continue;
            html += `<optgroup label="${esc(group)}">`;
            html += avail
                .map((t) => `<option value="${esc(t.id)}">${esc(t.label)} (${esc(t.id)})</option>`)
                .join('');
            html += `</optgroup>`;
        }
        sel.innerHTML = html || '<option value="">(đã dùng hết trigger)</option>';
    }
    function renderTriggerReference() {
        const box = $('otTriggerList');
        if (!box) return;
        let html = '';
        for (const [group, items] of groupedTriggers()) {
            html += `<div class="ot-trig-group"><h4>${esc(group)}</h4>`;
            html += items
                .map(
                    (t) =>
                        `<div class="ot-trig-item"><code>${esc(t.id)}</code><span><strong>${esc(t.label)}</strong> — ${esc(t.desc)}</span></div>`
                )
                .join('');
            html += `</div>`;
        }
        box.innerHTML = html || '<div class="ot-empty">Không tải được trigger.</div>';
    }

    // ---------- list ----------
    async function load() {
        const grid = $('otGrid');
        if (window.Web2Skeleton) {
            window.Web2Skeleton.cards(grid, { count: 8 });
        } else {
            grid.innerHTML = '<div class="ot-empty">Đang tải…</div>';
        }
        try {
            const data = await apiGet('/list');
            STATE.records = data.records || [];
            renderCards();
        } catch (e) {
            grid.innerHTML = `<div class="ot-empty">Lỗi tải dữ liệu: ${esc(e.message)}</div>`;
            notify('Lỗi tải TAG: ' + e.message, 'error');
        }
    }

    function pill(rec) {
        return window.Web2OrderTagPill
            ? window.Web2OrderTagPill.html({
                  name: rec.name,
                  color: rec.color,
                  icon: rec.icon,
                  trigger: rec.trigger,
              })
            : esc(rec.name);
    }

    function renderCards() {
        const grid = $('otGrid');
        $('otCount').textContent = `${STATE.records.length} thẻ`;
        if (!STATE.records.length) {
            grid.innerHTML =
                '<div class="ot-empty">Chưa có thẻ nào. Bấm <strong>Thêm thẻ</strong> để tạo.</div>';
            return;
        }
        grid.innerHTML = STATE.records
            .map((r) => {
                const t = STATE.triggerById.get(r.trigger);
                const desc = t ? esc(t.desc) : '<em>Trigger không còn tồn tại</em>';
                const accent = window.Web2OrderTagPill
                    ? window.Web2OrderTagPill.normHex(r.color)
                    : '#6b7280';
                return `
                <div class="ot-card ${r.isActive ? '' : 'is-off'}" style="--ot-accent:${accent}">
                    <div class="ot-card-top">
                        ${pill(r)}
                        <span class="ot-card-trigger">${esc(t ? t.label : r.trigger)}</span>
                    </div>
                    <div class="ot-card-desc">${desc}</div>
                    <div class="ot-card-meta">
                        <span><i data-lucide="hash" style="width:11px;height:11px;"></i> ${esc(r.code)}</span>
                        <span>·</span>
                        <span>Ưu tiên ${r.priority}</span>
                        <span>·</span>
                        <span style="color:${r.isActive ? '#16a34a' : '#94a3b8'};font-weight:600;">
                            ${r.isActive ? 'Đang dùng' : 'Tạm tắt'}
                        </span>
                        ${
                            r.code === 'soan_hang'
                                ? `<span>·</span><span style="color:${r.printEnabled ? '#16a34a' : '#ef4444'};font-weight:600;">🖨 In ${r.printEnabled ? 'BẬT' : 'TẮT'}</span>`
                                : ''
                        }
                    </div>
                    <div class="ot-card-foot">
                        <button class="web2-btn web2-btn-default web2-btn-xs" data-act="history" data-code="${esc(r.code)}" title="Lịch sử thao tác">
                            <i data-lucide="history" style="width:13px;height:13px;"></i>
                        </button>
                        ${
                            r.code === 'soan_hang'
                                ? `<button class="web2-btn web2-btn-default web2-btn-xs" data-act="printtoggle" data-code="${esc(r.code)}" title="${r.printEnabled ? 'TẮT in ra giấy (vẫn gắn tag)' : 'BẬT in ra giấy'}" style="color:${r.printEnabled ? '#16a34a' : '#ef4444'}">
                            <i data-lucide="printer" style="width:13px;height:13px;"></i>
                        </button>`
                                : ''
                        }
                        <button class="web2-btn web2-btn-default web2-btn-xs" data-act="toggle" data-code="${esc(r.code)}" title="${r.isActive ? 'Tạm tắt' : 'Bật lại'}">
                            <i data-lucide="${r.isActive ? 'toggle-right' : 'toggle-left'}" style="width:13px;height:13px;"></i>
                        </button>
                        <button class="web2-btn web2-btn-primary web2-btn-xs" data-act="edit" data-code="${esc(r.code)}" title="Sửa">
                            <i data-lucide="pencil" style="width:13px;height:13px;"></i>
                        </button>
                        <button class="web2-btn web2-btn-danger web2-btn-xs" data-act="delete" data-code="${esc(r.code)}" title="Xoá">
                            <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                        </button>
                    </div>
                </div>`;
            })
            .join('');
        icons();
        grid.querySelectorAll('button[data-act]').forEach((b) => {
            b.addEventListener('click', () => {
                const code = b.dataset.code;
                if (b.dataset.act === 'edit') openEdit(code);
                else if (b.dataset.act === 'delete') removeTag(code);
                else if (b.dataset.act === 'toggle') toggleTag(code);
                else if (b.dataset.act === 'printtoggle') togglePrint(code);
                else if (b.dataset.act === 'history') openHistory(code);
            });
        });
    }

    // ---------- modal ----------
    function readForm() {
        return {
            code: $('otfCode').value.trim(),
            name: $('otfName').value.trim(),
            trigger: $('otfTrigger').value,
            color: $('otfColor').value.trim(),
            icon: $('otfIcon').value.trim() || null,
            priority: parseInt($('otfPriority').value, 10) || 0,
            isActive: $('otfActive').checked,
        };
    }
    // ---------- icon picker ----------
    // Icon hay dùng cho tag đơn — hiện mặc định khi chưa gõ tìm.
    const COMMON_ICONS = [
        'clock',
        'hourglass',
        'timer',
        'alarm-clock',
        'receipt',
        'file-text',
        'alert-triangle',
        'triangle-alert',
        'alert-circle',
        'circle-alert',
        'alert-octagon',
        'shield-alert',
        'ban',
        'octagon-x',
        'package',
        'package-x',
        'package-check',
        'package-search',
        'box',
        'boxes',
        'truck',
        'map-pin',
        'map-pin-off',
        'map',
        'phone',
        'phone-off',
        'user',
        'users',
        'tag',
        'tags',
        'bookmark',
        'flag',
        'check',
        'check-check',
        'circle-check',
        'badge-check',
        'badge-alert',
        'x',
        'circle-x',
        'dollar-sign',
        'credit-card',
        'wallet',
        'banknote',
        'coins',
        'hand-coins',
        'shopping-cart',
        'shopping-bag',
        'store',
        'warehouse',
        'split',
        'git-merge',
        'printer',
        'calendar',
        'calendar-clock',
        'flame',
        'star',
        'heart',
        'gift',
        'send',
        'inbox',
        'radio',
        'bell',
        'zap',
        'sparkles',
        'crown',
        'gem',
    ];
    let _iconNamesCache = null;
    function allIconNames() {
        if (_iconNamesCache) return _iconNamesCache;
        const L = window.lucide;
        const set = new Set();
        const toKebab = (s) =>
            s
                .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
                .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
                .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
                .toLowerCase();
        try {
            let keys = [];
            if (L && L.icons && typeof L.icons === 'object') keys = Object.keys(L.icons);
            else if (L) keys = Object.keys(L);
            for (const k of keys) {
                if (!/^[A-Z]/.test(k) || k === 'Icon') continue;
                set.add(toKebab(k));
            }
        } catch {
            /* lucide chưa load → fallback COMMON */
        }
        _iconNamesCache = [...set].sort();
        return _iconNamesCache;
    }
    function renderIconPreview() {
        const box = $('otfIconPreview');
        const clr = $('otfIconClear');
        if (!box) return;
        const v = $('otfIcon').value.trim();
        if (v) {
            box.classList.remove('empty');
            box.innerHTML = `<i data-lucide="${esc(v)}"></i>`;
            if (clr) clr.hidden = false;
        } else {
            box.classList.add('empty');
            box.innerHTML = `<i data-lucide="image"></i>`;
            if (clr) clr.hidden = true;
        }
        icons();
    }
    function renderIconGrid(query) {
        const grid = $('otfIconGrid');
        if (!grid) return;
        const q = (query || '').trim().toLowerCase();
        const cur = $('otfIcon').value.trim();
        let list;
        if (!q) {
            const valid = new Set(allIconNames());
            list = valid.size ? COMMON_ICONS.filter((n) => valid.has(n)) : COMMON_ICONS.slice();
        } else {
            const all = allIconNames();
            const src = all.length ? all : COMMON_ICONS;
            list = src.filter((n) => n.includes(q)).slice(0, 120);
        }
        if (!list.length) {
            grid.innerHTML = `<div class="ot-icon-empty">Không tìm thấy icon "${esc(q)}"</div>`;
            grid.hidden = false;
            return;
        }
        grid.innerHTML = list
            .map(
                (n) =>
                    `<button type="button" class="ot-icon-opt ${n === cur ? 'sel' : ''}" data-icon="${esc(n)}" title="${esc(n)}"><i data-lucide="${esc(n)}"></i></button>`
            )
            .join('');
        grid.hidden = false;
        icons();
    }
    function setupIconPicker() {
        const input = $('otfIcon');
        const grid = $('otfIconGrid');
        const clr = $('otfIconClear');
        if (!input || !grid) return;
        let t = null;
        input.addEventListener('focus', () => renderIconGrid(input.value));
        input.addEventListener('input', () => {
            renderIconPreview();
            if (t) clearTimeout(t);
            t = setTimeout(() => renderIconGrid(input.value), 130);
        });
        input.addEventListener('blur', () => setTimeout(() => (grid.hidden = true), 200));
        // mousedown (trước blur của input) để click chọn không bị đóng grid sớm.
        grid.addEventListener('mousedown', (e) => {
            const b = e.target.closest('.ot-icon-opt');
            if (!b) return;
            e.preventDefault();
            input.value = b.dataset.icon;
            renderIconPreview();
            grid.hidden = true;
            updatePreview();
        });
        if (clr)
            clr.addEventListener('click', () => {
                input.value = '';
                renderIconPreview();
                updatePreview();
                input.focus();
            });
    }

    function updatePreview() {
        const f = readForm();
        $('otfPreview').innerHTML = window.Web2OrderTagPill
            ? window.Web2OrderTagPill.html({
                  name: f.name || 'Tên thẻ',
                  color: f.color,
                  icon: f.icon,
                  trigger: f.trigger,
              })
            : esc(f.name);
        const t = STATE.triggerById.get(f.trigger);
        $('otfTriggerDesc').textContent = t ? t.desc : '—';
        renderIconPreview();
        icons();
    }
    function openModal() {
        $('otModal').classList.add('active');
        updatePreview();
        icons();
    }
    function closeModal() {
        $('otModal').classList.remove('active');
        const g = $('otfIconGrid');
        if (g) g.hidden = true;
        STATE.editingCode = null;
    }
    function fillForm(rec) {
        $('otfCode').value = rec.code || '';
        $('otfName').value = rec.name || '';
        $('otfTrigger').value = rec.trigger || (STATE.triggers[0] && STATE.triggers[0].id) || '';
        $('otfColor').value = window.Web2OrderTagPill
            ? window.Web2OrderTagPill.normHex(rec.color || '#6b7280')
            : rec.color || '#6b7280';
        $('otfIcon').value = rec.icon || '';
        $('otfPriority').value = rec.priority != null ? rec.priority : 50;
        $('otfActive').checked = rec.isActive !== false;
    }
    function openCreate() {
        STATE.editingCode = null;
        $('otModalTitle').textContent = 'Thêm thẻ';
        renderTriggerSelect(null); // ẩn trigger đã dùng
        fillForm({ color: SWATCHES[0], priority: (STATE.records.length + 1) * 10 });
        $('otfCode').disabled = false;
        openModal();
        setTimeout(() => $('otfCode').focus(), 60);
    }
    function openEdit(code) {
        const rec = STATE.records.find((r) => r.code === code);
        if (!rec) return;
        STATE.editingCode = code;
        $('otModalTitle').textContent = 'Sửa thẻ: ' + code;
        renderTriggerSelect(code); // giữ trigger hiện tại, ẩn trigger thẻ khác dùng
        fillForm(rec);
        $('otfCode').disabled = true;
        openModal();
    }

    async function saveModal() {
        const f = readForm();
        if (!f.code || !f.name || !f.trigger) {
            notify('Cần Mã + Tên + Trigger', 'error');
            return;
        }
        const btn = $('otModalSave');
        if (btn.disabled) return;
        btn.disabled = true;
        try {
            if (STATE.editingCode) {
                await apiSend('PATCH', '/update/' + encodeURIComponent(STATE.editingCode), {
                    name: f.name,
                    trigger: f.trigger,
                    color: f.color,
                    icon: f.icon,
                    priority: f.priority,
                    isActive: f.isActive,
                });
                notify('Đã lưu thẻ', 'success');
            } else {
                await apiSend('POST', '/create', f);
                notify('Đã tạo thẻ ' + f.code, 'success');
            }
            closeModal();
            load();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
        }
    }

    // Lịch sử thao tác per-thẻ — module shared auto-load qua sidebar.
    function openHistory(code) {
        window.Web2AuditLog?.openRecord?.({
            entity: 'order-tag',
            entityId: code,
            title: 'Lịch sử thẻ: ' + code,
        });
    }

    async function toggleTag(code) {
        const rec = STATE.records.find((r) => r.code === code);
        if (!rec) return;
        try {
            await apiSend('PATCH', '/update/' + encodeURIComponent(code), {
                isActive: !rec.isActive,
            });
            load();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    // Toggle CHỨC NĂNG IN GIẤY (riêng thẻ soan_hang). TÁCH khỏi is_active: tắt in vẫn gắn
    // + hiện tag, chỉ KHÔNG in ra giấy. Bấm nút "In Phiếu Soạn Hàng" luôn gắn tag.
    async function togglePrint(code) {
        const rec = STATE.records.find((r) => r.code === code);
        if (!rec) return;
        try {
            await apiSend('PATCH', '/update/' + encodeURIComponent(code), {
                printEnabled: !rec.printEnabled,
            });
            notify(
                rec.printEnabled ? 'Đã TẮT in phiếu soạn hàng' : 'Đã BẬT in phiếu soạn hàng',
                'success'
            );
            load();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function removeTag(code) {
        const ok = window.Popup
            ? await window.Popup.danger('Xoá thẻ này? Đơn/giỏ sẽ không còn gắn thẻ này nữa.', {
                  title: `Xoá "${code}"?`,
                  okText: 'Xoá',
              })
            : confirm(`Xoá thẻ ${code}?`);
        if (!ok) return;
        try {
            await apiSend('DELETE', '/delete/' + encodeURIComponent(code));
            notify('Đã xoá thẻ', 'success');
            load();
        } catch (e) {
            notify('Lỗi xoá: ' + e.message, 'error');
        }
    }

    // ---------- wire ----------
    function renderSwatches() {
        const box = $('otfSwatches');
        if (!box) return;
        box.innerHTML = SWATCHES.map(
            (c) =>
                `<span class="ot-swatch" data-color="${c}" style="background:${c}" title="${c}"></span>`
        ).join('');
        box.querySelectorAll('.ot-swatch').forEach((s) => {
            s.addEventListener('click', () => {
                $('otfColor').value = s.dataset.color;
                updatePreview();
            });
        });
    }

    function wire() {
        $('otReload').addEventListener('click', load);
        $('otAdd').addEventListener('click', openCreate);
        $('otModalClose').addEventListener('click', closeModal);
        $('otModalCancel').addEventListener('click', closeModal);
        $('otModalSave').addEventListener('click', saveModal);
        $('otModal').addEventListener('click', (e) => {
            if (e.target === $('otModal')) closeModal();
        });
        ['otfName', 'otfColor', 'otfIcon'].forEach((id) =>
            $(id).addEventListener('input', updatePreview)
        );
        $('otfTrigger').addEventListener('change', updatePreview);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && $('otModal').classList.contains('active')) closeModal();
        });
        renderSwatches();
        setupIconPicker();
    }

    function subscribeSSE() {
        if (!window.Web2SSE?.subscribe) return;
        let t = null;
        window.Web2SSE.subscribe('web2:order-tags', () => {
            if (t) clearTimeout(t);
            t = setTimeout(() => {
                t = null;
                load();
            }, 500);
        });
    }

    function init() {
        if (window.Web2Sidebar) Web2Sidebar.mount('#web2Aside', { activeRoute: 'ordertag' });
        icons();
        wire();
        loadTriggers().then(load);
        subscribeSSE();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
