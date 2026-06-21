// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Cấu hình TAG đơn hàng — CRUD bảng web2_order_tags qua /api/web2-order-tags.
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
    function renderTriggerSelect() {
        const sel = $('otfTrigger');
        if (!sel) return;
        let html = '';
        for (const [group, items] of groupedTriggers()) {
            html += `<optgroup label="${esc(group)}">`;
            html += items
                .map((t) => `<option value="${esc(t.id)}">${esc(t.label)} (${esc(t.id)})</option>`)
                .join('');
            html += `</optgroup>`;
        }
        sel.innerHTML = html;
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
        grid.innerHTML = '<div class="ot-empty">Đang tải…</div>';
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
                    </div>
                    <div class="ot-card-foot">
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
        icons();
    }
    function openModal() {
        $('otModal').classList.add('active');
        updatePreview();
        icons();
    }
    function closeModal() {
        $('otModal').classList.remove('active');
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

    async function removeTag(code) {
        const ok = window.Popup
            ? await window.Popup.danger('Xoá thẻ này? Đơn sẽ không còn gắn thẻ này nữa.', {
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
