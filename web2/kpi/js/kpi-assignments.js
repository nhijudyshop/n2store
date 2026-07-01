// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// KPI Assignments — admin chia khoảng STT đơn cho NV theo chiến dịch.
// API: /api/web2/kpi/employee-ranges/:campaignName (PUT/GET/history) — bảng RIÊNG
//      web2_kpi_assignments trên web2Db (tách khỏi Web 1.0 campaign_employee_ranges
//      từ 2026-06-09 — fix cross-pool: resolver web2Db không đọc được chatDb).
// Range item: { userId, userName, fromSTT, toSTT }
// Lookup at emit time → web2_kpi_events.beneficiary_user_id.

(function () {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const USERS_API = `${WORKER}/api/web2-users`;
    const CAMPAIGNS_API = `${WORKER}/api/web2/kpi`;
    // KPI-2PAGE-1: phân công theo CHIẾN DỊCH CHA (span 2 page) — nguồn = chiến dịch cha
    // (web2_live_parent_campaigns) thay vì campaign per-page. key = parent campaign_id.
    const PARENT_CAMPAIGNS_API = `${WORKER}/api/web2-live-comments/campaigns`;

    const STATE = {
        users: [], // [{id, username, displayName, role, isActive}]
        campaigns: [], // [{id, name, count}] — chiến dịch CHA
        currentCampaign: null, // selected PARENT campaign_id (string)
        currentCampaignLabel: null, // tên chiến dịch cha (cho label/history)
        ranges: [], // [{userId, userName, fromSTT, toSTT}]
        totalOrders: 0,
        history: [],
    };

    // ─────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────
    function $(sel) {
        return document.querySelector(sel);
    }
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }
    function fmtDate(ts) {
        if (window.Web2Format) return window.Web2Format.dateTime(ts);
        if (!ts) return '';
        const d = ts instanceof Date ? ts : new Date(ts);
        return d.toLocaleString('vi-VN');
    }
    function notify(msg, kind) {
        if (window.notificationManager?.show) {
            window.notificationManager.show(msg, kind || 'info');
        } else {
            console.log('[KPI]', kind, msg);
        }
    }
    // Token admin cho PUT employee-ranges. Web2Auth lưu token ở 'web2_auth'.
    function authToken() {
        try {
            const t = window.Web2Auth?.getStored?.()?.token;
            if (t) return t;
            const raw = localStorage.getItem('web2_users_session');
            if (raw) return JSON.parse(raw)?.token || '';
        } catch (_) {}
        return '';
    }

    // ─────────────────────────────────────────────────────────
    // Load data
    // ─────────────────────────────────────────────────────────
    async function loadUsers() {
        try {
            // 3H19 FIX (2026-06-12): GET /list gate HARD (H9) — thiếu token là 401
            // → dropdown NV rỗng, trang phân công chết. Gửi x-web2-token như PUT.
            const r = await fetch(`${USERS_API}/list?limit=500&includeInactive=0`, {
                headers: { 'x-web2-token': authToken() },
            });
            if (r.status === 401) {
                notify('Cần đăng nhập Web 2.0 (admin) để xem danh sách nhân viên', 'error');
            }
            const d = await r.json();
            STATE.users = (d.users || []).map((u) => ({
                id: u.id,
                username: u.username,
                displayName: u.display_name || u.displayName || u.username,
                role: u.role,
                isActive: u.is_active !== false,
            }));
        } catch (e) {
            console.warn('[kpi-assign] load users fail:', e.message);
            STATE.users = [];
        }
    }

    async function loadCampaigns() {
        try {
            // Chiến dịch CHA: { data: [{id, name, note, post_count, comment_count}] }
            const r = await fetch(PARENT_CAMPAIGNS_API, {
                headers: { 'x-web2-token': authToken() },
            });
            const d = await r.json();
            STATE.campaigns = (d.data || d.campaigns || []).map((c) => ({
                id: c.id,
                name: c.name || c.label || String(c.id),
                count: Number(c.comment_count) || 0,
                postCount: Number(c.post_count) || 0,
            }));
        } catch (e) {
            console.warn('[kpi-assign] load campaigns fail:', e.message);
            STATE.campaigns = [];
        }
    }

    async function loadRanges(campaignName) {
        try {
            const r = await fetch(
                `${CAMPAIGNS_API}/employee-ranges/${encodeURIComponent(campaignName)}`,
                { headers: { 'x-web2-token': authToken() } } // route nay đã gate auth
            );
            if (r.status === 404) {
                STATE.ranges = [];
                return;
            }
            const d = await r.json();
            STATE.ranges = (d.employeeRanges || d.employee_ranges || []).map((rg) => ({
                userId: rg.userId ?? rg.id ?? '',
                userName: rg.userName || rg.name || '',
                fromSTT: Number(rg.fromSTT ?? rg.from ?? rg.start) || 0,
                toSTT: Number(rg.toSTT ?? rg.to ?? rg.end) || 0,
            }));
        } catch (e) {
            console.warn('[kpi-assign] load ranges fail:', e.message);
            STATE.ranges = [];
        }
    }

    async function loadHistory(campaignName) {
        try {
            const r = await fetch(
                `${CAMPAIGNS_API}/employee-ranges/${encodeURIComponent(campaignName)}/history`,
                { headers: { 'x-web2-token': authToken() } } // route nay đã gate auth
            );
            const d = await r.json();
            STATE.history = d.history || [];
        } catch (e) {
            console.warn('[kpi-assign] load history fail:', e.message);
            STATE.history = [];
        }
    }

    async function loadTotalOrders(campaignId) {
        // Số liệu tham khảo từ list chiến dịch cha (comment_count) — hiển thị coverage.
        const c = STATE.campaigns.find((x) => String(x.id) === String(campaignId));
        STATE.totalOrders = c ? Number(c.count) || 0 : 0;
    }

    // ─────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────
    function renderCampaignDropdown() {
        const sel = $('#caCampaignSelect');
        const opts = ['<option value="">— Chọn chiến dịch cha —</option>'];
        for (const c of STATE.campaigns) {
            if (c.id == null) continue;
            const label = c.name || String(c.id);
            opts.push(
                `<option value="${escapeHtml(String(c.id))}">${escapeHtml(label)} (${c.postCount || 0} bài)</option>`
            );
        }
        sel.innerHTML = opts.join('');
    }

    function renderRangesTable() {
        const tb = $('#caRangesBody');
        if (!STATE.ranges.length) {
            tb.innerHTML = `<tr class="kpi-empty-row"><td colspan="6">Chưa có phân công. Click "Thêm" để bắt đầu.</td></tr>`;
            return;
        }
        const html = STATE.ranges.map((r, i) => {
            const from = r.fromSTT || 0;
            const to = r.toSTT || 0;
            const count = Math.max(0, to - from + 1);
            const userOpts = STATE.users
                .map(
                    (u) =>
                        `<option value="${u.id}" ${String(u.id) === String(r.userId) ? 'selected' : ''}>${escapeHtml(u.displayName)} (${escapeHtml(u.username)})</option>`
                )
                .join('');
            return `<tr data-idx="${i}">
                <td>${i + 1}</td>
                <td>
                    <select class="ca-user-select" data-field="user">
                        <option value="">— Chọn nhân viên —</option>
                        ${userOpts}
                    </select>
                </td>
                <td><input type="number" min="1" value="${from}" data-field="from" /></td>
                <td><input type="number" min="1" value="${to}" data-field="to" /></td>
                <td class="kpi-row-count">${count}</td>
                <td>
                    <button class="kpi-row-delete" data-action="delete" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            </tr>`;
        });
        tb.innerHTML = html.join('');
        if (window.lucide) lucide.createIcons();
        wireRowEvents();
    }

    function wireRowEvents() {
        $('#caRangesBody')
            .querySelectorAll('select.ca-user-select')
            .forEach((sel) => {
                sel.addEventListener('change', (e) => {
                    const tr = e.target.closest('tr');
                    const idx = Number(tr.dataset.idx);
                    const uid = e.target.value;
                    const u = STATE.users.find((x) => String(x.id) === String(uid));
                    STATE.ranges[idx].userId = uid;
                    STATE.ranges[idx].userName = u?.displayName || '';
                    validateRanges();
                });
            });
        $('#caRangesBody')
            .querySelectorAll('input[type=number]')
            .forEach((inp) => {
                inp.addEventListener('input', (e) => {
                    const tr = e.target.closest('tr');
                    const idx = Number(tr.dataset.idx);
                    const field = e.target.dataset.field;
                    const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                    if (field === 'from') STATE.ranges[idx].fromSTT = v;
                    if (field === 'to') STATE.ranges[idx].toSTT = v;
                    // Update count cell
                    const countCell = tr.querySelector('.kpi-row-count');
                    const f = STATE.ranges[idx].fromSTT;
                    const t = STATE.ranges[idx].toSTT;
                    countCell.textContent = t >= f ? t - f + 1 : 0;
                    validateRanges();
                });
            });
        $('#caRangesBody')
            .querySelectorAll('[data-action=delete]')
            .forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    const tr = e.target.closest('tr');
                    const idx = Number(tr.dataset.idx);
                    STATE.ranges.splice(idx, 1);
                    renderRangesTable();
                    renderStats();
                    validateRanges();
                });
            });
    }

    function renderStats() {
        const total = STATE.totalOrders;
        const assigned = STATE.ranges.reduce(
            (s, r) => s + Math.max(0, (r.toSTT || 0) - (r.fromSTT || 0) + 1),
            0
        );
        $('#caStats').innerHTML =
            `Tổng đơn campaign: <strong>${total}</strong> · Đã phân công: <strong>${assigned}</strong>`;
    }

    function renderHistory() {
        const root = $('#caHistoryList');
        if (!STATE.history.length) {
            root.innerHTML = `<div class="kpi-empty">Chưa có thay đổi nào.</div>`;
            return;
        }
        const html = STATE.history.slice(0, 20).map((h) => {
            const before = Array.isArray(h.ranges_before) ? h.ranges_before.length : 0;
            const after = Array.isArray(h.ranges_after) ? h.ranges_after.length : 0;
            return `<div class="kpi-history-item">
                <div class="kpi-history-item-head">
                    <span class="kpi-history-item-user">${escapeHtml(h.user_name || h.userName || '(ẩn danh)')}</span>
                    <span>${fmtDate(h.created_at || h.createdAt)}</span>
                </div>
                <div>${escapeHtml(h.action || 'update')}: ${before} → ${after} ranges</div>
            </div>`;
        });
        root.innerHTML = html.join('');
    }

    function validateRanges() {
        const warn = $('#caWarning');
        const errors = [];

        // Sort copy by fromSTT for overlap check
        const sorted = STATE.ranges
            .filter((r) => r.userId && r.fromSTT > 0 && r.toSTT >= r.fromSTT)
            .map((r) => ({ ...r }))
            .sort((a, b) => a.fromSTT - b.fromSTT);

        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const cur = sorted[i];
            // Server (PUT /employee-ranges) reject MỌI overlap — kể cả cùng user.
            if (cur.fromSTT <= prev.toSTT) {
                errors.push(
                    `Trùng STT giữa ${prev.userName} (${prev.fromSTT}-${prev.toSTT}) và ${cur.userName} (${cur.fromSTT}-${cur.toSTT})`
                );
            }
        }

        for (const r of STATE.ranges) {
            if (r.userId && r.fromSTT > r.toSTT && r.toSTT > 0) {
                errors.push(`${r.userName}: STT từ (${r.fromSTT}) > đến (${r.toSTT})`);
            }
        }

        if (errors.length) {
            warn.hidden = false;
            warn.className = 'kpi-warning-banner error';
            warn.innerHTML = '<strong>Sai sót:</strong><br>' + errors.map(escapeHtml).join('<br>');
            return false;
        }
        warn.hidden = true;
        warn.className = 'kpi-warning-banner';
        warn.innerHTML = '';
        return true;
    }

    // ─────────────────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────────────────
    async function onCampaignChange(id) {
        STATE.currentCampaign = id; // = parent campaign_id (string)
        const c = STATE.campaigns.find((x) => String(x.id) === String(id));
        STATE.currentCampaignLabel = c ? c.name : id;
        if (!id) {
            $('#caSection').hidden = true;
            return;
        }
        $('#caSection').hidden = false;
        await Promise.all([loadRanges(id), loadHistory(id)]);
        loadTotalOrders(id);
        renderRangesTable();
        renderStats();
        renderHistory();
    }

    function onAddRow() {
        STATE.ranges.push({
            userId: '',
            userName: '',
            fromSTT: 0,
            toSTT: 0,
        });
        renderRangesTable();
        renderStats();
    }

    async function onSave() {
        if (!STATE.currentCampaign) {
            notify('Chưa chọn chiến dịch', 'error');
            return;
        }
        if (!validateRanges()) {
            notify('Có lỗi trong khoảng STT — xem cảnh báo bên dưới', 'error');
            return;
        }
        const valid = STATE.ranges.filter((r) => r.userId && r.fromSTT > 0 && r.toSTT >= r.fromSTT);
        const editor = window.Web2UserInfo?.get('web2-kpi-assignments') || {};
        const saveBtn = $('#caSaveBtn');
        if (saveBtn?.disabled) return; // tránh double-submit
        if (saveBtn) saveBtn.disabled = true;
        try {
            const r = await fetch(
                `${CAMPAIGNS_API}/employee-ranges/${encodeURIComponent(STATE.currentCampaign)}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'x-web2-token': authToken() },
                    body: JSON.stringify({
                        employeeRanges: valid,
                        userId: editor.userId,
                        userName: editor.userName,
                        campaignLabel: STATE.currentCampaignLabel || STATE.currentCampaign,
                    }),
                }
            );
            const d = await r.json().catch(() => ({}));
            if (r.status === 401 || r.status === 403) {
                throw new Error('Cần đăng nhập admin để lưu phân công KPI');
            }
            if (!r.ok) {
                throw new Error(d.error || d.message || 'Lỗi không xác định');
            }
            const warn = $('#caWarning');
            warn.hidden = false;
            warn.className = 'kpi-warning-banner success';
            warn.innerHTML = '<strong>✓ Đã lưu</strong> ' + valid.length + ' khoảng STT.';
            notify('Đã lưu phân công', 'success');
            // Reload history to show this change
            await loadHistory(STATE.currentCampaign);
            renderHistory();
        } catch (e) {
            notify('Lỗi lưu: ' + e.message, 'error');
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    // ─────────────────────────────────────────────────────────
    // Init
    // ─────────────────────────────────────────────────────────
    async function init() {
        await Promise.all([loadUsers(), loadCampaigns()]);
        renderCampaignDropdown();
        $('#caCampaignSelect').addEventListener('change', (e) => onCampaignChange(e.target.value));
        $('#caAddBtn').addEventListener('click', onAddRow);
        $('#caSaveBtn').addEventListener('click', onSave);

        // Auto-select first campaign if URL has ?campaign=
        const urlParam = new URLSearchParams(location.search).get('campaign');
        if (urlParam) {
            const sel = $('#caCampaignSelect');
            sel.value = urlParam;
            onCampaignChange(urlParam);
        }

        // Audit SSE 2026-06-25: admin khác lưu phân khoảng STT (PUT /employee-ranges
        // → broadcast 'web2:kpi-dashboard') → reload ranges + history của chiến dịch
        // đang xem để không phải F5. Debounce 600ms gom burst.
        if (window.Web2SSE?.subscribe) {
            let _sseT = null;
            window.Web2SSE.subscribe('web2:kpi-dashboard', () => {
                clearTimeout(_sseT);
                _sseT = setTimeout(async () => {
                    if (!STATE.currentCampaign) return;
                    await loadRanges(STATE.currentCampaign);
                    await loadHistory(STATE.currentCampaign);
                    renderRangesTable();
                    renderStats();
                    renderHistory();
                }, 600);
            });
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
