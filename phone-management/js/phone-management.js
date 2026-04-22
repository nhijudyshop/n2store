// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Management — admin page controller (Render Postgres backend)
// Tabs: dashboard / extensions / staff / history / stats / live / contacts / recordings / config / audit

const PM = (() => {
    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall';
    const LIVE_POLL_MS = 5000; // poll Live tab every 5s

    // State
    let currentTab = 'dashboard';
    let users = [];
    let assignments = {};
    let extensions = [];
    let dbConfig = null;
    let historyCache = [];
    let historyPage = 1;
    const HISTORY_PAGE_SIZE = 50;
    let livePollTimer = null;
    const charts = {};

    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

    // === FETCH HELPERS ===
    async function apiGet(path) {
        try {
            const r = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
        } catch (err) {
            console.warn('[PM] GET', path, err.message);
            return { success: false, error: err.message };
        }
    }
    async function apiSend(path, method, body) {
        try {
            const r = await fetch(`${API_BASE}${path}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
        } catch (err) {
            console.warn('[PM]', method, path, err.message);
            return { success: false, error: err.message };
        }
    }

    // === FORMAT HELPERS ===
    function _toMs(ts) {
        // Postgres BIGINT comes back as string — parseInt to get number
        if (ts == null) return 0;
        if (ts instanceof Date) return ts.getTime();
        if (typeof ts === 'number') return ts;
        const n = parseInt(ts, 10);
        return isNaN(n) ? 0 : n;
    }
    function _fmtDateTime(ts) {
        const ms = _toMs(ts); if (!ms) return '';
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '';
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    function _fmtDuration(sec) { const n = parseInt(sec, 10) || 0; if (!n) return '—'; const m = Math.floor(n/60), s = n%60; return `${m}:${String(s).padStart(2,'0')}`; }
    function _fmtPhone(s) { const d = String(s || '').replace(/[^\d+]/g,''); if (d.length === 10) return d.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3'); return d; }
    function _relTime(ts) { const ms = _toMs(ts); if (!ms) return ''; const diff = Date.now() - ms; if (diff < 60000) return 'vừa xong'; if (diff < 3600000) return `${Math.floor(diff/60000)} phút`; if (diff < 86400000) return `${Math.floor(diff/3600000)} giờ`; return `${Math.floor(diff/86400000)} ngày`; }
    function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
    function _dirIcon(d) { const cls = d === 'in' ? 'in' : d === 'missed' ? 'missed' : 'out'; const ch = d === 'in' ? '↙' : d === 'missed' ? '✕' : '↗'; return `<span class="pm-dir-icon ${cls}">${ch}</span>`; }
    function _initialsAvatar(name) { return (name || '?').split(/\s+/).map(p => p[0]).slice(-2).join('').toUpperCase(); }
    function _iconsRefresh() { if (window.lucide?.createIcons) window.lucide.createIcons(); }

    // === AUTH ===
    async function _waitForAuth(maxMs = 5000) {
        const start = Date.now();
        while (Date.now() - start < maxMs) {
            const a = window.authManager?.getAuthData?.();
            if (a) return a;
            await new Promise(r => setTimeout(r, 150));
        }
        return null;
    }
    function _hasAdminAccess(auth) {
        if (!auth) return false;
        const userType = (localStorage.getItem('userType') || '').toLowerCase();
        if (userType.startsWith('admin')) return true;
        if (auth.isAdmin === true) return true;
        if (auth.roleTemplate === 'admin') return true;
        if (auth.checkLogin === 0) return true;
        const perms = auth.detailedPermissions?.['phone-management'];
        if (perms && Object.values(perms).some(v => v === true)) return true;
        return false;
    }

    async function init() {
        const auth = await _waitForAuth();
        if (!auth) { location.href = '../index.html'; return; }
        if (!_hasAdminAccess(auth)) {
            $('#accessDenied').style.display = 'flex';
            return;
        }
        $('#mainContainer').style.display = 'block';
        $('#pmUserChip').innerHTML = `👋 ${_esc(auth.displayName || auth.email || 'Admin')}`;

        _setupTabs();
        _setupMobileDropdown();
        _setupLiveFilters();
        await _loadInitial();

        switchTab('dashboard');
        _iconsRefresh();
    }

    async function _loadInitial() {
        // PBX config
        const cfg = await apiGet('/phone-config');
        if (cfg?.success && cfg.config) { dbConfig = cfg.config; extensions = cfg.config.sip_extensions || []; }
        if (!extensions.length) {
            try { const c = JSON.parse(localStorage.getItem('phoneWidget_dbConfig') || '{}'); extensions = c.sip_extensions || []; dbConfig = dbConfig || c; } catch {}
        }

        // Users from Firestore (user-employee-loader)
        try {
            if (window.userEmployeeLoader) {
                await window.userEmployeeLoader.initialize();
                users = await window.userEmployeeLoader.loadUsers();
            }
        } catch { users = []; }

        // Ext assignments from Render
        const as = await apiGet('/ext-assignments');
        if (as?.success) { assignments = as.assignments || {}; }

        // Populate user filter dropdowns
        const userOpts = users.map(u => `<option value="${_esc(u.displayName)}">${_esc(u.displayName)}</option>`).join('');
        const histUserSel = $('#histUser'); if (histUserSel) histUserSel.innerHTML = '<option value="">Tất cả nhân viên</option>' + userOpts;
        const recUserSel = $('#recUser'); if (recUserSel) recUserSel.innerHTML = '<option value="">Tất cả nhân viên</option>' + userOpts;

        // Default date range
        const today = new Date(); const past = new Date(Date.now() - 30*86400000);
        const iso = d => d.toISOString().slice(0,10);
        if ($('#histFrom')) $('#histFrom').value = iso(past);
        if ($('#histTo')) $('#histTo').value = iso(today);
    }

    // === TABS ===
    function _setupTabs() {
        $$('.pm-tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    }
    function _setupMobileDropdown() {
        const dd = $('#pmMobileDropdown'); if (!dd) return;
        const tabs = [
            ['dashboard', 'Tổng quan'], ['extensions', 'Extensions'], ['staff', 'Nhân viên'],
            ['history', 'Lịch sử'], ['stats', 'Thống kê'], ['live', 'Live'],
            ['contacts', 'Danh bạ'], ['recordings', 'Ghi âm'], ['config', 'Cấu hình'], ['audit', 'Audit']
        ];
        dd.innerHTML = tabs.map(([id, label]) => `
            <div class="mobile-dropdown-item" data-tab="${id}" onclick="PM.switchTab('${id}'); PM.closeMobileDropdown();">
                <span>${label}</span>
            </div>
        `).join('');
    }
    function _setupLiveFilters() {
        $('#extSearch')?.addEventListener('input', () => { if (currentTab === 'extensions') renderExtensions(); });
        $('#staffSearch')?.addEventListener('input', () => { if (currentTab === 'staff') renderStaff(); });
        $('#staffFilterRole')?.addEventListener('change', () => { if (currentTab === 'staff') renderStaff(); });
        $('#contactSearch')?.addEventListener('input', () => {
            const f = $('#contactSearch').value.toLowerCase();
            $$('#contactsTableBody tr').forEach(tr => {
                const txt = tr.textContent.toLowerCase();
                tr.style.display = !f || txt.includes(f) ? '' : 'none';
            });
        });
        $('#recSearch')?.addEventListener('input', () => { if (currentTab === 'recordings') loadRecordings(); });
        $('#recUser')?.addEventListener('change', () => { if (currentTab === 'recordings') loadRecordings(); });
    }
    function toggleMobileDropdown() {
        const dd = $('#pmMobileDropdown'); const ov = $('#pmMobileOverlay'); if (!dd) return;
        const open = !dd.classList.contains('open');
        dd.classList.toggle('open', open);
        if (ov) ov.classList.toggle('open', open);
    }
    function closeMobileDropdown() { $('#pmMobileDropdown')?.classList.remove('open'); $('#pmMobileOverlay')?.classList.remove('open'); }

    function switchTab(id) {
        currentTab = id;
        $$('.pm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
        $$('.pm-tabview').forEach(v => v.classList.toggle('active', v.dataset.tabview === id));
        const title = { dashboard: 'Tổng quan', extensions: 'Extensions', staff: 'Nhân viên', history: 'Lịch sử', stats: 'Thống kê', live: 'Live', contacts: 'Danh bạ', recordings: 'Ghi âm', config: 'Cấu hình', audit: 'Audit log' }[id] || '';
        const mtitle = $('#pmMobileTitle'); if (mtitle) mtitle.textContent = title;
        // Stop live polling when leaving Live tab
        if (id !== 'live' && livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
        _renderCurrentTab();
        _iconsRefresh();
    }

    function _renderCurrentTab() {
        switch (currentTab) {
            case 'dashboard': return loadDashboard();
            case 'extensions': return renderExtensions();
            case 'staff': return renderStaff();
            case 'history': return applyHistoryFilters();
            case 'stats': return loadStats();
            case 'live': return startLive();
            case 'contacts': return loadContacts();
            case 'recordings': return switchRecSubtab(_recSubtab || 'cloud');
            case 'config': return renderConfig();
            case 'audit': return loadAudit();
        }
    }

    function refresh() {
        historyCache = []; historyPage = 1;
        _loadInitial().then(() => _renderCurrentTab());
    }

    // === DASHBOARD ===
    async function loadDashboard() {
        $('#kpiTotalExt').textContent = extensions.length;

        // Presence
        const pres = await apiGet('/presence');
        let online = 0, inCall = 0;
        (pres.rows || []).forEach(p => {
            if (p.state === 'registered' || p.state === 'in-call' || p.state === 'ringing') online++;
            if (p.state === 'in-call') inCall++;
        });
        $('#kpiOnline').textContent = online;
        $('#kpiInCall').textContent = inCall;

        // Calls today
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const th = await apiGet(`/call-history?from=${todayStart.getTime()}&limit=2000`);
        const rows = th.rows || [];
        let total = rows.length, missed = 0, durSum = 0, durCount = 0;
        rows.forEach(c => { if (c.direction === 'missed') missed++; if (c.duration) { durSum += c.duration; durCount++; } });
        $('#kpiCallsToday').textContent = total;
        $('#kpiMissedToday').textContent = missed;
        $('#kpiAvgDur').textContent = durCount ? _fmtDuration(Math.round(durSum/durCount)) : '—';

        _loadWeekChart();
        _loadTopAgents();
        _loadRecentCalls();
        _loadExtSummary();
    }

    async function _loadWeekChart() {
        const ctx = $('#chartCallsWeek'); if (!ctx) return;
        const days = []; const labels = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i*86400000); d.setHours(0,0,0,0);
            days.push({ start: d.getTime(), end: d.getTime() + 86400000 });
            labels.push(`${d.getDate()}/${d.getMonth()+1}`);
        }
        const r = await apiGet(`/call-history?from=${days[0].start}&limit=5000`);
        const rows = r.rows || [];
        const out = Array(7).fill(0), incoming = Array(7).fill(0), miss = Array(7).fill(0);
        rows.forEach(c => {
            const idx = days.findIndex(d => c.timestamp >= d.start && c.timestamp < d.end);
            if (idx >= 0) {
                if (c.direction === 'missed') miss[idx]++;
                else if (c.direction === 'in') incoming[idx]++;
                else out[idx]++;
            }
        });
        if (charts.week) charts.week.destroy();
        charts.week = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [
                { label: 'Gọi đi', data: out, backgroundColor: '#22c55e' },
                { label: 'Gọi đến', data: incoming, backgroundColor: '#3b82f6' },
                { label: 'Nhỡ', data: miss, backgroundColor: '#ef4444' }
            ]},
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } }
        });
    }

    async function _loadTopAgents() {
        const container = $('#topAgentsList'); if (!container) return;
        const weekAgo = Date.now() - 7*86400000;
        const r = await apiGet(`/call-history?from=${weekAgo}&limit=5000`);
        const byUser = {};
        (r.rows || []).forEach(c => { if (c.username) byUser[c.username] = (byUser[c.username] || 0) + 1; });
        const sorted = Object.entries(byUser).sort((a,b) => b[1]-a[1]).slice(0,5);
        container.innerHTML = sorted.length
            ? sorted.map(([name, n], i) => `<div class="pm-compact-item"><div class="pm-compact-main"><div class="pm-compact-name">#${i+1} ${_esc(name)}</div><div class="pm-compact-meta"><span>Ext ${assignments[name] || '—'}</span></div></div><div class="pm-compact-value">${n}</div></div>`).join('')
            : '<div style="text-align:center;color:#94a3b8;padding:14px;font-size:12px">Chưa có cuộc gọi trong 7 ngày qua</div>';
    }

    async function _loadRecentCalls() {
        const container = $('#recentCalls'); if (!container) return;
        const r = await apiGet('/call-history?limit=8');
        const rows = r.rows || [];
        container.innerHTML = rows.length
            ? rows.map(c => `
                <div class="pm-compact-item">
                    ${_dirIcon(c.direction)}
                    <div class="pm-compact-main">
                        <div class="pm-compact-name">${_esc(c.name || _fmtPhone(c.phone))}</div>
                        <div class="pm-compact-meta"><span>${_esc(c.username)}</span><span>• Ext ${c.ext || '—'}</span><span>• ${_relTime(c.timestamp)}</span></div>
                    </div>
                    <span class="pm-badge gray">${_fmtDuration(c.duration)}</span>
                </div>
            `).join('')
            : '<div style="text-align:center;color:#94a3b8;padding:14px;font-size:12px">Chưa có cuộc gọi nào</div>';
    }

    function _loadExtSummary() {
        const container = $('#extSummary'); if (!container) return;
        const assignCount = Object.keys(assignments).length;
        const unassigned = extensions.filter(e => !Object.values(assignments).map(String).includes(String(e.ext)));
        container.innerHTML = `
            <div class="pm-compact-item"><div class="pm-compact-main"><div class="pm-compact-name">Tổng ext</div></div><div class="pm-compact-value">${extensions.length}</div></div>
            <div class="pm-compact-item"><div class="pm-compact-main"><div class="pm-compact-name">Đã gán</div></div><div class="pm-compact-value">${assignCount}</div></div>
            <div class="pm-compact-item"><div class="pm-compact-main"><div class="pm-compact-name">Còn trống</div></div><div class="pm-compact-value">${unassigned.length}</div></div>
        `;
    }

    // === EXTENSIONS ===
    async function renderExtensions() {
        const body = $('#extTableBody'); if (!body) return;
        if (!extensions.length) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px">Chưa có extension nào.</td></tr>'; return; }

        const lh = await apiGet('/call-history?limit=500');
        const lastByExt = {};
        (lh.rows || []).forEach(c => { if (c.ext && !lastByExt[c.ext]) lastByExt[c.ext] = c; });
        const p = await apiGet('/presence');
        const presenceByUser = {};
        (p.rows || []).forEach(r => { presenceByUser[r.username] = r; });

        const userByExt = {};
        Object.entries(assignments).forEach(([name, ext]) => { userByExt[ext] = name; });
        const filter = ($('#extSearch').value || '').trim().toLowerCase();

        body.innerHTML = extensions.filter(e => {
            if (!filter) return true;
            const user = userByExt[e.ext] || '';
            return String(e.ext).includes(filter) || (e.label || '').toLowerCase().includes(filter) || user.toLowerCase().includes(filter);
        }).map((e, idx) => {
            const user = userByExt[e.ext] || '';
            const presence = user ? presenceByUser[user] : null;
            const state = presence?.state || 'offline';
            const stateBadge = state === 'in-call' ? '<span class="pm-badge orange">📞 Đang gọi</span>' : state === 'ringing' ? '<span class="pm-badge blue">📳 Đổ chuông</span>' : state === 'registered' ? '<span class="pm-badge green">● Online</span>' : '<span class="pm-badge gray">Offline</span>';
            const last = lastByExt[e.ext];
            const userOpts = ['<option value="">— Chưa gán —</option>']
                .concat(users.map(u => `<option value="${_esc(u.displayName)}" ${user === u.displayName ? 'selected' : ''}>${_esc(u.displayName)}</option>`)).join('');
            return `
                <tr data-ext="${e.ext}">
                    <td>${idx + 1}</td>
                    <td class="mono"><b>${e.ext}</b></td>
                    <td>${_esc(e.label || '—')}</td>
                    <td><select class="pm-input" style="min-width:0" onchange="PM.assignExt('${e.ext}', this.value)">${userOpts}</select></td>
                    <td>${stateBadge}</td>
                    <td>${last ? `<div><b>${_esc(last.name || _fmtPhone(last.phone))}</b></div><div style="font-size:11px;color:#94a3b8">${_relTime(last.timestamp)} • ${_fmtDuration(last.duration)}</div>` : '—'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="PM.viewExtHistory('${e.ext}')" title="Xem lịch sử"><i data-lucide="list"></i></button>
                        ${user ? `<button class="btn btn-sm btn-outline" onclick="PM.assignExt('${e.ext}', '')" title="Bỏ gán"><i data-lucide="user-x"></i></button>` : ''}
                    </td>
                </tr>`;
        }).join('');
        _iconsRefresh();
    }

    async function assignExt(ext, username) {
        try {
            if (username) {
                // Conflict check: if someone else has this ext, unassign them first
                for (const [n, e] of Object.entries(assignments)) {
                    if (n !== username && String(e) === String(ext)) {
                        if (!confirm(`Ext ${ext} đang gán cho ${n}. Chuyển sang ${username}?`)) { renderExtensions(); return; }
                        await apiSend(`/ext-assignments/${encodeURIComponent(n)}`, 'PUT', { ext: '' });
                    }
                }
                await apiSend(`/ext-assignments/${encodeURIComponent(username)}`, 'PUT', { ext });
                await apiSend('/audit-log', 'POST', { username: window.authManager?.getAuthData?.()?.displayName || '', action: 'ext_assign', detail: { target: username, newExt: ext }, timestamp: Date.now() });
            } else {
                const owner = Object.entries(assignments).find(([,v]) => String(v) === String(ext));
                if (owner) {
                    await apiSend(`/ext-assignments/${encodeURIComponent(owner[0])}`, 'PUT', { ext: '' });
                    await apiSend('/audit-log', 'POST', { username: window.authManager?.getAuthData?.()?.displayName || '', action: 'ext_unassign', detail: { target: owner[0], prevExt: ext }, timestamp: Date.now() });
                }
            }
            // Refresh local cache
            const as = await apiGet('/ext-assignments');
            if (as?.success) assignments = as.assignments || {};
            renderExtensions();
        } catch (e) { alert('Lỗi: ' + e.message); }
    }

    let _extHistoryFilter = null;
    function viewExtHistory(ext) {
        $('#histUser').value = '';
        switchTab('history');
        setTimeout(() => { _extHistoryFilter = ext; applyHistoryFilters(); setTimeout(() => { _extHistoryFilter = null; }, 100); }, 100);
    }
    function openAddExtension() {
        alert('Thêm ext mới: cập nhật qua Render API PUT /api/oncall/phone-config key=sip_extensions');
    }

    // === STAFF ===
    async function renderStaff() {
        const body = $('#staffTableBody'); if (!body) return;
        const filter = ($('#staffSearch').value || '').toLowerCase();
        const roleFilter = $('#staffFilterRole').value;

        const weekAgo = Date.now() - 7*86400000;
        const r = await apiGet(`/call-history?from=${weekAgo}&limit=5000`);
        const countByUser = {};
        (r.rows || []).forEach(c => { if (c.username) countByUser[c.username] = (countByUser[c.username] || 0) + 1; });
        const pr = await apiGet('/presence');
        const presenceByUser = {};
        (pr.rows || []).forEach(row => { presenceByUser[row.username] = row; });

        const filtered = users.filter(u => {
            if (filter && !u.displayName.toLowerCase().includes(filter)) return false;
            if (roleFilter === 'admin' && u.checkLogin !== 0) return false;
            if (roleFilter === 'user' && u.checkLogin === 0) return false;
            return true;
        });

        body.innerHTML = filtered.map((u, idx) => {
            const ext = assignments[u.displayName] || '';
            const presence = presenceByUser[u.displayName];
            const state = presence?.state || 'offline';
            const stateBadge = state === 'in-call' ? '<span class="pm-badge orange">Đang gọi</span>' : state === 'registered' ? '<span class="pm-badge green">Online</span>' : '<span class="pm-badge gray">Offline</span>';
            const extOpts = ['<option value="">— Chưa gán —</option>']
                .concat(extensions.map(e => `<option value="${e.ext}" ${String(ext) === String(e.ext) ? 'selected' : ''}>Ext ${e.ext}${e.label && e.label !== 'Ext ' + e.ext ? ' · ' + _esc(e.label) : ''}</option>`)).join('');
            return `
                <tr>
                    <td>${idx+1}</td>
                    <td><div style="display:flex;align-items:center;gap:8px"><div class="pm-live-avatar" style="width:26px;height:26px;font-size:10px">${_esc(_initialsAvatar(u.displayName))}</div><b>${_esc(u.displayName)}</b></div></td>
                    <td>${u.checkLogin === 0 ? '<span class="pm-badge purple">Admin</span>' : '<span class="pm-badge gray">NV</span>'}</td>
                    <td><select class="pm-input" style="min-width:0" onchange="PM.assignUser('${_esc(u.displayName)}', this.value)">${extOpts}</select></td>
                    <td><b>${countByUser[u.displayName] || 0}</b></td>
                    <td>${stateBadge}${presence?.state === 'in-call' && presence?.call_phone ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">với ${_esc(presence.call_name || _fmtPhone(presence.call_phone))}</div>` : ''}</td>
                    <td><button class="btn btn-sm btn-outline" onclick="PM.viewUserHistory('${_esc(u.displayName)}')" title="Xem lịch sử"><i data-lucide="list"></i></button></td>
                </tr>`;
        }).join('');
        _iconsRefresh();
    }

    async function assignUser(username, ext) {
        try {
            if (ext) {
                for (const [n, e] of Object.entries(assignments)) {
                    if (n !== username && String(e) === String(ext)) {
                        if (!confirm(`Ext ${ext} đang gán cho ${n}. Chuyển sang ${username}?`)) { renderStaff(); return; }
                        await apiSend(`/ext-assignments/${encodeURIComponent(n)}`, 'PUT', { ext: '' });
                    }
                }
            }
            await apiSend(`/ext-assignments/${encodeURIComponent(username)}`, 'PUT', { ext: ext || '' });
            await apiSend('/audit-log', 'POST', { username: window.authManager?.getAuthData?.()?.displayName || '', action: ext ? 'ext_assign' : 'ext_unassign', detail: { target: username, newExt: ext }, timestamp: Date.now() });
            const as = await apiGet('/ext-assignments');
            if (as?.success) assignments = as.assignments || {};
            renderStaff();
        } catch (e) { alert('Lỗi: ' + e.message); }
    }

    function viewUserHistory(username) {
        switchTab('history');
        setTimeout(() => { $('#histUser').value = username; applyHistoryFilters(); }, 50);
    }

    // === HISTORY ===
    async function applyHistoryFilters() {
        const body = $('#historyTableBody'); if (!body) return;
        body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:20px">Đang tải...</td></tr>';

        const from = $('#histFrom').value ? new Date($('#histFrom').value).getTime() : 0;
        const to = $('#histTo').value ? new Date($('#histTo').value).getTime() + 86400000 : Date.now() + 86400000;
        const dir = $('#histDirection').value;
        const user = $('#histUser').value;
        const phone = ($('#histPhone').value || '').trim();

        const qs = new URLSearchParams();
        qs.set('from', from); qs.set('to', to); qs.set('limit', 1000);
        if (dir) qs.set('direction', dir);
        if (user) qs.set('username', user);
        if (phone) qs.set('phone', phone);
        if (_extHistoryFilter) qs.set('ext', _extHistoryFilter);

        const r = await apiGet(`/call-history?${qs}`);
        if (r?.success) {
            historyCache = r.rows || [];
            historyPage = 1;
            _renderHistoryPage();
        } else {
            body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#ef4444;padding:20px">Lỗi: ${_esc(r.error || 'unknown')}</td></tr>`;
        }
    }

    function _renderHistoryPage() {
        const body = $('#historyTableBody');
        const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
        const pageItems = historyCache.slice(start, start + HISTORY_PAGE_SIZE);
        body.innerHTML = pageItems.length
            ? pageItems.map(c => `
                <tr>
                    <td>${_fmtDateTime(c.timestamp)}</td>
                    <td>${_dirIcon(c.direction)}</td>
                    <td>${_esc(c.username || '—')}</td>
                    <td class="mono">${c.ext || '—'}</td>
                    <td class="mono">${_fmtPhone(c.phone)}</td>
                    <td>${_esc(c.name || '—')}</td>
                    <td class="mono">${_fmtDuration(c.duration)}</td>
                    <td>${c.order_code ? `<a href="../orders-report/tab1-orders.html?q=${encodeURIComponent(c.order_code)}">${_esc(c.order_code)}</a>` : '—'}</td>
                    <td>${c.outcome ? `<span class="pm-badge ${c.outcome === 'success' ? 'green' : 'gray'}">${_esc(c.outcome)}</span>` : ''}${c.note ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">${_esc(c.note)}</div>` : ''}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:20px">Không có kết quả</td></tr>';
        const pager = $('#historyPager');
        const totalPages = Math.ceil(historyCache.length / HISTORY_PAGE_SIZE) || 1;
        pager.innerHTML = `
            <button ${historyPage <= 1 ? 'disabled' : ''} onclick="PM.gotoHistoryPage(${historyPage-1})">← Trước</button>
            <span>Trang ${historyPage} / ${totalPages} (${historyCache.length} cuộc gọi)</span>
            <button ${historyPage >= totalPages ? 'disabled' : ''} onclick="PM.gotoHistoryPage(${historyPage+1})">Sau →</button>
        `;
    }
    function gotoHistoryPage(p) { historyPage = p; _renderHistoryPage(); }

    function exportHistoryCSV() {
        if (!historyCache.length) { alert('Không có dữ liệu để export'); return; }
        const headers = ['Thời gian','Hướng','Nhân viên','Ext','Số','Khách','Thời lượng (giây)','Đơn','Kết quả','Ghi chú'];
        const rows = historyCache.map(c => [
            _fmtDateTime(c.timestamp), c.direction || '', c.username || '', c.ext || '',
            c.phone || '', c.name || '', c.duration || 0, c.order_code || '', c.outcome || '', c.note || ''
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `phone-history-${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }

    // === STATS ===
    async function loadStats() {
        const range = parseInt($('#statsRange').value || '30', 10);
        const since = Date.now() - range * 86400000;
        const r = await apiGet(`/call-history?from=${since}&limit=10000`);
        const data = r.rows || [];

        const byDay = {};
        for (let i = 0; i < range; i++) {
            const d = new Date(Date.now() - i*86400000); d.setHours(0,0,0,0);
            byDay[d.getTime()] = { out: 0, in: 0, missed: 0 };
        }
        data.forEach(c => {
            const d = new Date(c.timestamp); d.setHours(0,0,0,0);
            const k = d.getTime();
            if (byDay[k]) {
                const key = c.direction === 'missed' ? 'missed' : c.direction === 'in' ? 'in' : 'out';
                byDay[k][key]++;
            }
        });
        const sortedDays = Object.keys(byDay).map(Number).sort((a,b) => a-b);
        const labels = sortedDays.map(t => { const d = new Date(t); return `${d.getDate()}/${d.getMonth()+1}`; });
        const outData = sortedDays.map(t => byDay[t].out);
        const inData = sortedDays.map(t => byDay[t].in);
        const missedData = sortedDays.map(t => byDay[t].missed);

        if (charts.daily) charts.daily.destroy();
        charts.daily = new Chart($('#chartDaily'), {
            type: 'line', data: { labels, datasets: [
                { label: 'Đi', data: outData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.1)', tension: .3 },
                { label: 'Đến', data: inData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.1)', tension: .3 },
                { label: 'Nhỡ', data: missedData, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.1)', tension: .3 }
            ]},
            options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
        });

        const dirCount = { Đi: 0, Đến: 0, Nhỡ: 0 };
        data.forEach(c => { const k = c.direction === 'missed' ? 'Nhỡ' : c.direction === 'in' ? 'Đến' : 'Đi'; dirCount[k]++; });
        if (charts.dir) charts.dir.destroy();
        charts.dir = new Chart($('#chartDirection'), {
            type: 'doughnut',
            data: { labels: Object.keys(dirCount), datasets: [{ data: Object.values(dirCount), backgroundColor: ['#22c55e','#3b82f6','#ef4444'] }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        const hourly = Array(24).fill(0);
        data.forEach(c => { const h = new Date(c.timestamp).getHours(); hourly[h]++; });
        if (charts.hourly) charts.hourly.destroy();
        charts.hourly = new Chart($('#chartHourly'), {
            type: 'bar',
            data: { labels: Array.from({length:24}, (_,i) => `${i}h`), datasets: [{ label: 'Cuộc gọi', data: hourly, backgroundColor: '#8b5cf6' }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
        });

        const durByUser = {};
        data.forEach(c => { if (!c.username || !c.duration) return; if (!durByUser[c.username]) durByUser[c.username] = { sum: 0, cnt: 0 }; durByUser[c.username].sum += c.duration; durByUser[c.username].cnt++; });
        const avgEntries = Object.entries(durByUser).map(([u, v]) => [u, Math.round(v.sum/v.cnt)]).sort((a,b) => b[1]-a[1]).slice(0,10);
        if (charts.avgDur) charts.avgDur.destroy();
        charts.avgDur = new Chart($('#chartAvgDur'), {
            type: 'bar',
            data: { labels: avgEntries.map(e => e[0]), datasets: [{ label: 'TB (giây)', data: avgEntries.map(e => e[1]), backgroundColor: '#f59e0b' }] },
            options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
        });

        const byPhone = {};
        data.forEach(c => { if (!c.phone) return; const k = c.phone; if (!byPhone[k]) byPhone[k] = { phone: k, name: c.name, count: 0, dur: 0 }; byPhone[k].count++; byPhone[k].dur += (c.duration || 0); if (c.name && !byPhone[k].name) byPhone[k].name = c.name; });
        const top = Object.values(byPhone).sort((a,b) => b.count-a.count).slice(0,10);
        $('#topContacts').innerHTML = top.length
            ? top.map((t,i) => `<div class="pm-compact-item"><div class="pm-compact-main"><div class="pm-compact-name">#${i+1} ${_esc(t.name || _fmtPhone(t.phone))}</div><div class="pm-compact-meta"><span>${_fmtPhone(t.phone)}</span><span>• ${_fmtDuration(Math.round(t.dur))}</span></div></div><div class="pm-compact-value">${t.count}</div></div>`).join('')
            : '<div style="text-align:center;color:#94a3b8;padding:14px">Chưa có dữ liệu</div>';
    }

    // === LIVE (polling) ===
    async function startLive() {
        if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
        const grid = $('#liveGrid'); if (!grid) return;
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:24px">Đang tải trạng thái...</div>';
        await _refreshLive();
        livePollTimer = setInterval(_refreshLive, LIVE_POLL_MS);
    }
    async function _refreshLive() {
        const grid = $('#liveGrid'); if (!grid) return;
        const r = await apiGet('/presence');
        const byUser = {};
        (r.rows || []).forEach(row => { byUser[row.username] = row; });
        const merged = users.map(u => byUser[u.displayName] || { username: u.displayName, state: 'offline', ext: assignments[u.displayName] || '' });
        grid.innerHTML = merged.map(p => {
            const name = p.username;
            const stateLabel = p.state === 'in-call' ? 'Đang gọi' : p.state === 'ringing' ? 'Đổ chuông' : p.state === 'registered' ? 'Online' : 'Offline';
            return `
                <div class="pm-live-card ${p.state || 'offline'}">
                    <div class="pm-live-head">
                        <div class="pm-live-avatar">${_esc(_initialsAvatar(name))}</div>
                        <div class="pm-live-name">${_esc(name)}</div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <span class="pm-live-ext">Ext ${p.ext || '—'}</span>
                        <span class="pm-live-state ${p.state || 'offline'}">${stateLabel}</span>
                    </div>
                    ${p.state === 'in-call' && p.call_phone ? `<div class="pm-live-call-info">📞 ${_esc(p.call_name || _fmtPhone(p.call_phone))}</div>` : ''}
                    ${p.since && p.state !== 'offline' ? `<div class="pm-live-since">Từ ${_relTime(p.since)}</div>` : ''}
                </div>`;
        }).join('');
        _iconsRefresh();
    }

    // === CONTACTS ===
    async function loadContacts() {
        const body = $('#contactsTableBody'); if (!body) return;
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">Đang tải...</td></tr>';
        const r = await apiGet('/contacts');
        const rows = r.rows || [];
        body.innerHTML = rows.length
            ? rows.map(c => `
                <tr>
                    <td><b>${_esc(c.name)}</b></td>
                    <td class="mono">${_fmtPhone(c.phone)}</td>
                    <td>${c.tag ? `<span class="pm-badge blue">${_esc(c.tag)}</span>` : ''}</td>
                    <td>${_esc(c.note || '')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="PM.copyToClipboard('${_esc(c.phone)}')" title="Copy"><i data-lucide="copy"></i></button>
                        <button class="btn btn-sm btn-outline" onclick="PM.deleteContact(${c.id})" title="Xoá"><i data-lucide="trash-2"></i></button>
                    </td>
                </tr>
            `).join('')
            : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">Danh bạ trống</td></tr>';
        _iconsRefresh();
    }
    async function openAddContact() {
        const name = prompt('Tên liên hệ:'); if (!name) return;
        const phone = prompt('Số điện thoại:'); if (!phone) return;
        const tag = prompt('Nhãn (tuỳ chọn):') || '';
        const note = prompt('Ghi chú (tuỳ chọn):') || '';
        const r = await apiSend('/contacts', 'POST', { name, phone, tag, note, created_by: window.authManager?.getAuthData?.()?.displayName || '' });
        if (r?.success) loadContacts(); else alert('Lỗi: ' + (r?.error || 'unknown'));
    }
    async function deleteContact(id) {
        if (!confirm('Xoá liên hệ này?')) return;
        const r = await apiSend(`/contacts/${id}`, 'DELETE');
        if (r?.success) loadContacts(); else alert('Lỗi: ' + (r?.error || 'unknown'));
    }
    function copyToClipboard(s) { navigator.clipboard.writeText(s).catch(() => {}); }

    // === RECORDINGS (cloud Render DB + OnCallCX portal link) ===
    let _recSubtab = 'cloud';
    const CLOUD_REC_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall/call-recordings';

    function switchRecSubtab(key) {
        _recSubtab = key;
        document.querySelectorAll('.rec-subtab').forEach(b => b.classList.toggle('active', b.dataset.subtab === key));
        document.querySelectorAll('.rec-subview').forEach(v => {
            v.style.display = v.dataset.subview === key ? '' : 'none';
        });
        if (key === 'cloud') loadRecordings();
        else loadOncallCdrs();
    }

    async function loadRecordings() {
        const body = $('#recTableBody'); if (!body) return;
        body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px">Đang tải...</td></tr>';
        try {
            const search = ($('#recSearch')?.value || '').trim();
            const userFilter = $('#recUser')?.value || '';
            const params = new URLSearchParams();
            if (search) params.set('phone', search);
            if (userFilter) params.set('username', userFilter);
            params.set('limit', '500');
            const r = await fetch(`${CLOUD_REC_API}?${params.toString()}`).then(r => r.json()).catch(() => ({}));
            const recs = Array.isArray(r.rows) ? r.rows : [];
            const filtered = search
                ? recs.filter(x => {
                    const hay = `${x.phone || ''} ${x.name || ''} ${x.username || ''}`.toLowerCase();
                    return hay.includes(search.toLowerCase());
                })
                : recs;
            const countBadge = $('#recCloudCount'); if (countBadge) countBadge.textContent = filtered.length ? String(filtered.length) : '';

            if (!filtered.length) {
                body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px">
                    Chưa có ghi âm nào trên Render DB.<br>
                    <small>Mọi cuộc gọi sẽ tự động upload khi kết thúc — thử gọi rồi quay lại.</small>
                </td></tr>`;
                return;
            }
            body.innerHTML = filtered.map(r => {
                const sizeKB = Math.round((r.size_bytes || 0) / 1024);
                return `
                <tr data-rec-id="${r.id}">
                    <td>${_fmtDateTime(parseInt(r.timestamp, 10))}</td>
                    <td>${_esc(r.username || '—')}</td>
                    <td class="mono">${r.ext || '—'}</td>
                    <td class="mono">${_fmtPhone(r.phone)}</td>
                    <td>${_esc(r.name || '—')}</td>
                    <td class="mono">${_fmtDuration(r.duration)}</td>
                    <td style="font-size:11px;color:#64748b">${sizeKB} KB<br><span style="font-family:'SF Mono',monospace;font-size:10px">${_esc(r.mime_type || '')}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="PM.playRecording(${r.id})" title="Phát"><i data-lucide="play"></i></button>
                        <button class="btn btn-sm btn-outline" onclick="PM.downloadRecording(${r.id})" title="Tải về"><i data-lucide="download"></i></button>
                        <button class="btn btn-sm btn-outline" onclick="PM.deleteRecording(${r.id})" title="Xoá"><i data-lucide="trash-2"></i></button>
                    </td>
                </tr>
                `;
            }).join('');
            _iconsRefresh();

            // Storage stats footer
            const totalBytes = filtered.reduce((s, r) => s + (r.size_bytes || 0), 0);
            const mb = (totalBytes / 1024 / 1024).toFixed(2);
            const existing = document.getElementById('recStorageFooter');
            if (existing) existing.remove();
            const footer = document.createElement('div');
            footer.id = 'recStorageFooter';
            footer.style.cssText = 'text-align:center;padding:10px;font-size:11px;color:#64748b;background:#f8fafc;border-top:1px solid #e2e8f0';
            footer.textContent = `Tổng ${filtered.length} ghi âm • ${mb} MB (Render DB) • Lưu vô thời hạn`;
            body.closest('.pm-panel')?.appendChild(footer);
        } catch (err) {
            body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ef4444;padding:20px">Lỗi: ${_esc(err.message)}</td></tr>`;
        }
    }

    // === OnCallCX Portal → Render DB sync preview ===
    // Portal pbx-ucaas.oncallcx.vn chỉ chấp nhận IP VN consumer ISP (chặn datacenter).
    // Local sync daemon trên máy admin push data lên Render DB với username=oncallcx-portal-sync.
    // Tab này preview các file đó — play/download qua existing /call-recordings/:id/audio endpoint.
    async function loadOncallCdrs() {
        const body = $('#recOncallCdrBody'); if (!body) return;
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px">Đang tải...</td></tr>';
        try {
            const r = await fetch(`${CLOUD_REC_API}?username=oncallcx-portal-sync&limit=200`).then(r => r.json()).catch(() => ({}));
            const rows = Array.isArray(r.rows) ? r.rows : [];
            if (!rows.length) {
                body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px">
                    Chưa có ghi âm nào từ OnCallCX portal trên Render DB.<br>
                    <small>Chạy <code>bash scripts/install-oncallcx-sync.sh</code> trên máy admin để kích hoạt local sync.</small>
                </td></tr>`;
                return;
            }
            body.innerHTML = rows.map(rec => {
                const sizeKB = Math.round((rec.size_bytes || 0) / 1024);
                return `
                <tr data-rec-id="${rec.id}">
                    <td>${_fmtDateTime(parseInt(rec.timestamp, 10))}</td>
                    <td class="mono">${rec.ext || '—'}</td>
                    <td class="mono">${_fmtPhone(rec.phone)}</td>
                    <td><span class="pm-badge ${rec.direction === 'in' ? 'blue' : 'gray'}">${rec.direction === 'in' ? 'Vào' : 'Ra'}</span></td>
                    <td class="mono">${_fmtDuration(rec.duration)}</td>
                    <td style="font-size:11px;color:#64748b">${sizeKB} KB</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="PM.playRecording(${rec.id})" title="Nghe"><i data-lucide="play"></i></button>
                        <a href="${CLOUD_REC_API}/${rec.id}/audio" download="call-${rec.id}.wav" class="btn btn-sm btn-outline" title="Tải"><i data-lucide="download"></i></a>
                    </td>
                </tr>
                `;
            }).join('');
            _iconsRefresh();
        } catch (err) {
            body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:20px">Lỗi: ${_esc(err.message)}</td></tr>`;
        }
    }

    function _cloudAudioUrl(id) { return `${CLOUD_REC_API}/${id}/audio`; }

    function playRecording(id) {
        _openPlayerModal({ id, url: _cloudAudioUrl(id) });
    }
    function _openPlayerModal(r) {
        const existing = document.getElementById('recPlayerModal'); if (existing) existing.remove();
        // Lookup row metadata from the currently rendered table for nicer display
        const row = document.querySelector(`tr[data-rec-id="${r.id}"]`);
        const cells = row ? row.querySelectorAll('td') : [];
        const when = cells[0]?.textContent || '';
        const user = cells[1]?.textContent || '';
        const ext = cells[2]?.textContent || '';
        const phone = cells[3]?.textContent || '';
        const name = cells[4]?.textContent || '';
        const dur = cells[5]?.textContent || '';
        const wrap = document.createElement('div');
        wrap.id = 'recPlayerModal';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
        wrap.innerHTML = `
            <div style="background:#fff;border-radius:12px;padding:20px;width:min(480px,90vw);box-shadow:0 24px 60px rgba(0,0,0,.4)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <h3 style="margin:0;font-size:14px;color:#0f172a">🎙 ${_esc(name || phone)}</h3>
                    <button onclick="this.closest('#recPlayerModal').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:#94a3b8;line-height:1">×</button>
                </div>
                <div style="font-size:11px;color:#64748b;margin-bottom:10px">
                    ${_esc(when)} · ${_esc(user)} · Ext ${_esc(ext)} · ${_esc(dur)}
                </div>
                <audio controls autoplay style="width:100%" src="${r.url}"></audio>
                <div style="margin-top:10px;text-align:right">
                    <a href="${r.url}" download="call-${r.id}.webm" class="btn btn-sm btn-outline" style="text-decoration:none;margin-right:6px"><i data-lucide="download"></i> Tải về</a>
                    <button class="btn btn-sm btn-danger" onclick="PM.deleteRecording(${r.id}); this.closest('#recPlayerModal').remove();"><i data-lucide="trash-2"></i> Xoá</button>
                </div>
            </div>
        `;
        wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
        document.body.appendChild(wrap);
        _iconsRefresh();
    }

    function downloadRecording(id) {
        const a = document.createElement('a'); a.href = _cloudAudioUrl(id); a.download = `call-${id}.webm`;
        document.body.appendChild(a); a.click(); a.remove();
    }

    async function deleteRecording(id) {
        if (!confirm('Xoá ghi âm này trên Render DB? Hành động không thể hoàn tác.')) return;
        try {
            const r = await fetch(`${CLOUD_REC_API}/${id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            loadRecordings();
        } catch (err) { alert('Lỗi: ' + err.message); }
    }

    // === CONFIG ===
    function renderConfig() {
        $('#cfgPbxDomain').value = dbConfig?.pbx_domain || 'pbx-ucaas.oncallcx.vn';
        $('#cfgWsUrl').value = dbConfig?.ws_url || '';
        const body = $('#cfgExtPoolBody');
        body.innerHTML = extensions.length
            ? extensions.map((e, idx) => `
                <tr data-ext-idx="${idx}">
                    <td class="mono"><b>${e.ext}</b></td>
                    <td><input class="pm-input" style="min-width:120px;font-size:12px" value="${_esc(e.label || '')}" data-field="label"></td>
                    <td><input class="pm-input" style="min-width:200px;font-size:11px;font-family:'SF Mono',monospace" value="${_esc(e.authId || '')}" data-field="authId" placeholder="authId từ OnCallCX" autocomplete="off"></td>
                    <td style="display:flex;gap:4px;align-items:center">
                        <input class="pm-input" type="text" style="min-width:200px;font-size:11px;font-family:'SF Mono',monospace;-webkit-text-security:disc;-moz-text-security:disc;text-security:disc" value="${_esc(e.password || '')}" data-field="password" placeholder="••••••••" autocomplete="off" data-lpignore="true" data-form-type="other">
                        <button class="btn btn-sm btn-outline" onclick="PM.toggleExtPwd(this)" title="Hiện/ẩn"><i data-lucide="eye"></i></button>
                        <button class="btn btn-sm" style="background:#22c55e" onclick="PM.saveExt(${idx})" title="Lưu"><i data-lucide="check"></i></button>
                    </td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px">Chưa tải được ext pool</td></tr>';
        _iconsRefresh();
        try {
            const p = JSON.parse(localStorage.getItem('phoneMgmt_prefs') || '{}');
            $('#cfgAutoAnswer').checked = !!p.autoAnswer;
            $('#cfgRecordLocal').checked = !!p.recordLocal;
            $('#cfgPopupOnRing').checked = p.popupOnRing !== false;
            $('#cfgDesktopNotify').checked = !!p.desktopNotify;
        } catch {}
    }
    function saveLocalConfig() {
        const prefs = {
            autoAnswer: $('#cfgAutoAnswer').checked,
            recordLocal: true, // always-on; giữ key cho backward compat với phone-recording.js cũ
            popupOnRing: $('#cfgPopupOnRing').checked,
            desktopNotify: $('#cfgDesktopNotify').checked
        };
        localStorage.setItem('phoneMgmt_prefs', JSON.stringify(prefs));
    }

    function toggleExtPwd(btn) {
        const input = btn.closest('td').querySelector('input[data-field="password"]');
        if (!input) return;
        // Toggle CSS text-security instead of input type — keeps type=text so browser
        // password manager doesn't offer to save (not a real login form).
        const masked = input.style.webkitTextSecurity !== 'none';
        const val = masked ? 'none' : 'disc';
        input.style.webkitTextSecurity = val;
        input.style.mozTextSecurity = val;
        input.style.textSecurity = val;
    }

    async function saveExt(idx) {
        const row = document.querySelector(`tr[data-ext-idx="${idx}"]`); if (!row) return;
        const label = row.querySelector('[data-field="label"]').value.trim();
        const authId = row.querySelector('[data-field="authId"]').value.trim();
        const password = row.querySelector('[data-field="password"]').value;
        if (!authId || !password) { alert('authId và password không được trống'); return; }
        const updated = [...extensions];
        updated[idx] = { ...updated[idx], label, authId, password };
        const r = await apiSend('/phone-config', 'PUT', { key: 'sip_extensions', value: updated });
        if (r?.success) {
            extensions = updated;
            if (dbConfig) dbConfig.sip_extensions = updated;
            try { localStorage.setItem('phoneWidget_dbConfig', JSON.stringify(dbConfig || { sip_extensions: updated })); } catch {}
            await apiSend('/audit-log', 'POST', {
                username: window.authManager?.getAuthData?.()?.displayName || '',
                action: 'config_update',
                detail: { ext: updated[idx].ext, field: 'credentials' },
                timestamp: Date.now()
            });
            const saveBtn = row.querySelector('button[onclick*="saveExt"]');
            if (saveBtn) { saveBtn.style.background = '#15803d'; saveBtn.innerHTML = '<i data-lucide="check-check"></i>'; _iconsRefresh(); setTimeout(() => { saveBtn.style.background = '#22c55e'; saveBtn.innerHTML = '<i data-lucide="check"></i>'; _iconsRefresh(); }, 1500); }
        } else {
            alert('Lỗi lưu: ' + (r?.error || 'unknown'));
        }
    }

    // === AUDIT ===
    async function loadAudit() {
        const body = $('#auditTableBody'); if (!body) return;
        body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px">Đang tải...</td></tr>';
        const action = $('#auditAction').value;
        const qs = action ? `?action=${encodeURIComponent(action)}` : '';
        const r = await apiGet(`/audit-log${qs}`);
        const rows = r.rows || [];
        body.innerHTML = rows.length
            ? rows.map(row => `
                <tr>
                    <td>${_fmtDateTime(row.timestamp)}</td>
                    <td><b>${_esc(row.username || '—')}</b></td>
                    <td><span class="pm-badge ${row.action === 'ext_assign' ? 'green' : row.action === 'ext_unassign' ? 'red' : 'gray'}">${_esc(row.action)}</span></td>
                    <td style="font-size:11.5px;color:#475569">${_esc(JSON.stringify(row.detail || {}))}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px">Không có audit log</td></tr>';
    }

    // Boot
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 100);

    return {
        switchTab, refresh,
        toggleMobileDropdown, closeMobileDropdown,
        loadStats, loadAudit,
        assignExt, assignUser,
        viewExtHistory, viewUserHistory,
        openAddExtension, openAddContact, deleteContact, copyToClipboard,
        applyHistoryFilters, exportHistoryCSV, gotoHistoryPage,
        saveLocalConfig, saveExt, toggleExtPwd,
        switchRecSubtab, loadRecordings,
        playRecording, downloadRecording, deleteRecording,
        // OnCallCX portal — preview Render DB rows synced from local daemon
        loadOncallCdrs
    };
})();

if (typeof window !== 'undefined') window.PM = PM;
