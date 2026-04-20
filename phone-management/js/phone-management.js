// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Management — admin page controller
// Tabs: dashboard / extensions / staff / history / stats / live / contacts / recordings / config / audit

const PM = (() => {
    const HISTORY_COLLECTION = 'phone_call_history';
    const PRESENCE_COLLECTION = 'phone_presence';
    const AUDIT_COLLECTION = 'phone_audit_log';
    const CONTACTS_COLLECTION = 'phone_contacts';
    const RENDER_PHONE_CONFIG = 'https://n2store-fallback.onrender.com/api/oncall/phone-config';

    // State
    let db = null;
    let currentTab = 'dashboard';
    let users = [];
    let assignments = {};
    let extensions = [];
    let dbConfig = null;
    let historyCache = [];
    let historyPage = 1;
    const HISTORY_PAGE_SIZE = 50;
    let presenceUnsub = null;
    const charts = {};

    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

    function _fmtDateTime(ts) {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    function _fmtTimeOnly(ts) { const d = ts.toDate ? ts.toDate() : new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
    function _fmtDuration(sec) { if (!sec) return '—'; const m = Math.floor(sec/60), s = sec%60; return `${m}:${String(s).padStart(2,'0')}`; }
    function _fmtPhone(s) { const d = String(s || '').replace(/[^\d+]/g,''); if (d.length === 10) return d.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3'); return d; }
    function _relTime(ts) { const t = ts?.toDate ? ts.toDate().getTime() : (ts || Date.now()); const diff = Date.now() - t; if (diff < 60000) return 'vừa xong'; if (diff < 3600000) return `${Math.floor(diff/60000)} phút`; if (diff < 86400000) return `${Math.floor(diff/3600000)} giờ`; return `${Math.floor(diff/86400000)} ngày`; }
    function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
    function _dirIcon(d) { const cls = d === 'in' ? 'in' : d === 'missed' ? 'missed' : 'out'; const ch = d === 'in' ? '↙' : d === 'missed' ? '✕' : '↗'; return `<span class="pm-dir-icon ${cls}">${ch}</span>`; }
    function _initialsAvatar(name) { return (name || '?').split(/\s+/).map(p => p[0]).slice(-2).join('').toUpperCase(); }
    function _iconsRefresh() { if (window.lucide?.createIcons) window.lucide.createIcons(); }

    // === AUTH CHECK + INIT ===
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
        // Multiple admin detection paths (align with navigation-modern.js)
        const userType = (localStorage.getItem('userType') || '').toLowerCase();
        if (userType.startsWith('admin')) return true;
        if (auth.isAdmin === true) return true;
        if (auth.roleTemplate === 'admin') return true;
        if (auth.checkLogin === 0) return true;
        // Per-page permission check
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

        try { if (window.firebase?.firestore) db = firebase.firestore(); } catch (e) { console.error(e); }

        _setupTabs();
        _setupMobileDropdown();
        _setupLiveFilters();
        await _loadInitial();

        // Default tab
        switchTab('dashboard');
        _iconsRefresh();
    }

    async function _loadInitial() {
        // Load PBX config
        try {
            const r = await fetch(RENDER_PHONE_CONFIG); const d = await r.json();
            if (d?.success && d.config) { dbConfig = d.config; extensions = d.config.sip_extensions || []; }
        } catch { dbConfig = null; }
        if (!extensions.length) {
            // fallback from localStorage
            try { const c = JSON.parse(localStorage.getItem('phoneWidget_dbConfig') || '{}'); extensions = c.sip_extensions || []; dbConfig = dbConfig || c; } catch {}
        }

        // Load users
        try {
            if (window.userEmployeeLoader) {
                await window.userEmployeeLoader.initialize();
                users = await window.userEmployeeLoader.loadUsers();
            }
        } catch (e) { users = []; }

        // Load assignments
        try {
            if (window.PhoneExtAssignment) {
                await window.PhoneExtAssignment.init();
                assignments = window.PhoneExtAssignment.getAll();
                window.PhoneExtAssignment.onChange((data) => { assignments = data; _renderCurrentTab(); });
            }
        } catch {}

        // Populate history/recording user filters
        const userOpts = users.map(u => `<option value="${_esc(u.displayName)}">${_esc(u.displayName)}</option>`).join('');
        const histUserSel = $('#histUser'); if (histUserSel) histUserSel.innerHTML = '<option value="">Tất cả nhân viên</option>' + userOpts;
        const recUserSel = $('#recUser'); if (recUserSel) recUserSel.innerHTML = '<option value="">Tất cả nhân viên</option>' + userOpts;

        // Default history date range: last 30 days
        const today = new Date(); const past = new Date(Date.now() - 30*86400000);
        const iso = d => d.toISOString().slice(0,10);
        $('#histFrom').value = iso(past); $('#histTo').value = iso(today);
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
    }

    function toggleMobileDropdown() { const dd = $('#pmMobileDropdown'); const ov = $('#pmMobileOverlay'); if (!dd) return; const open = !dd.classList.contains('open'); dd.classList.toggle('open', open); if (ov) ov.classList.toggle('open', open); }
    function closeMobileDropdown() { $('#pmMobileDropdown')?.classList.remove('open'); $('#pmMobileOverlay')?.classList.remove('open'); }

    function switchTab(id) {
        currentTab = id;
        $$('.pm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
        $$('.pm-tabview').forEach(v => v.classList.toggle('active', v.dataset.tabview === id));
        const title = { dashboard: 'Tổng quan', extensions: 'Extensions', staff: 'Nhân viên', history: 'Lịch sử', stats: 'Thống kê', live: 'Live', contacts: 'Danh bạ', recordings: 'Ghi âm', config: 'Cấu hình', audit: 'Audit log' }[id] || '';
        const mtitle = $('#pmMobileTitle'); if (mtitle) mtitle.textContent = title;
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
            case 'recordings': return loadRecordings();
            case 'config': return renderConfig();
            case 'audit': return loadAudit();
        }
    }

    function refresh() {
        // Reset caches + reload current tab
        historyCache = []; historyPage = 1;
        _loadInitial().then(() => _renderCurrentTab());
    }

    // === DASHBOARD ===
    async function loadDashboard() {
        $('#kpiTotalExt').textContent = extensions.length;
        $('#kpiOnline').textContent = '...';
        $('#kpiInCall').textContent = '...';
        $('#kpiCallsToday').textContent = '...';
        $('#kpiMissedToday').textContent = '...';
        $('#kpiAvgDur').textContent = '...';

        // Presence count
        try {
            const snap = await db.collection(PRESENCE_COLLECTION).get();
            let online = 0, inCall = 0;
            snap.forEach(d => {
                const s = d.data();
                if (s.state === 'registered' || s.state === 'in-call' || s.state === 'ringing') online++;
                if (s.state === 'in-call') inCall++;
            });
            $('#kpiOnline').textContent = online;
            $('#kpiInCall').textContent = inCall;
        } catch { $('#kpiOnline').textContent = '—'; $('#kpiInCall').textContent = '—'; }

        // Calls today
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        try {
            const snap = await db.collection(HISTORY_COLLECTION).where('timestamp', '>=', todayStart.getTime()).get();
            let total = 0, missed = 0, durSum = 0, durCount = 0;
            snap.forEach(d => {
                const c = d.data(); total++;
                if (c.direction === 'missed') missed++;
                if (c.duration) { durSum += c.duration; durCount++; }
            });
            $('#kpiCallsToday').textContent = total;
            $('#kpiMissedToday').textContent = missed;
            $('#kpiAvgDur').textContent = durCount ? _fmtDuration(Math.round(durSum/durCount)) : '—';
        } catch {
            $('#kpiCallsToday').textContent = '—'; $('#kpiMissedToday').textContent = '—'; $('#kpiAvgDur').textContent = '—';
        }

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
            days.push({ start: d.getTime(), end: d.getTime() + 86400000, label: `${d.getDate()}/${d.getMonth()+1}` });
            labels.push(`${d.getDate()}/${d.getMonth()+1}`);
        }
        try {
            const snap = await db.collection(HISTORY_COLLECTION).where('timestamp', '>=', days[0].start).get();
            const countsOut = Array(7).fill(0), countsIn = Array(7).fill(0), countsMissed = Array(7).fill(0);
            snap.forEach(d => {
                const c = d.data();
                const idx = days.findIndex(day => c.timestamp >= day.start && c.timestamp < day.end);
                if (idx >= 0) {
                    if (c.direction === 'missed') countsMissed[idx]++;
                    else if (c.direction === 'in') countsIn[idx]++;
                    else countsOut[idx]++;
                }
            });
            if (charts.week) charts.week.destroy();
            charts.week = new Chart(ctx, {
                type: 'bar',
                data: { labels, datasets: [
                    { label: 'Gọi đi', data: countsOut, backgroundColor: '#22c55e' },
                    { label: 'Gọi đến', data: countsIn, backgroundColor: '#3b82f6' },
                    { label: 'Nhỡ', data: countsMissed, backgroundColor: '#ef4444' }
                ]},
                options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } }
            });
        } catch {}
    }

    async function _loadTopAgents() {
        const container = $('#topAgentsList'); if (!container) return;
        try {
            const weekAgo = Date.now() - 7*86400000;
            const snap = await db.collection(HISTORY_COLLECTION).where('timestamp', '>=', weekAgo).get();
            const byUser = {};
            snap.forEach(d => { const c = d.data(); if (!c.username) return; byUser[c.username] = (byUser[c.username] || 0) + 1; });
            const sorted = Object.entries(byUser).sort((a,b) => b[1]-a[1]).slice(0,5);
            container.innerHTML = sorted.length
                ? sorted.map(([name, n], i) => `<div class="pm-compact-item"><div class="pm-compact-main"><div class="pm-compact-name">#${i+1} ${_esc(name)}</div><div class="pm-compact-meta"><span>Ext ${assignments[name] || '—'}</span></div></div><div class="pm-compact-value">${n}</div></div>`).join('')
                : '<div style="text-align:center;color:#94a3b8;padding:14px;font-size:12px">Chưa có cuộc gọi trong 7 ngày qua</div>';
        } catch { container.innerHTML = '<div style="color:#ef4444;padding:14px">Lỗi tải dữ liệu</div>'; }
    }

    async function _loadRecentCalls() {
        const container = $('#recentCalls'); if (!container) return;
        try {
            const snap = await db.collection(HISTORY_COLLECTION).orderBy('timestamp','desc').limit(8).get();
            const rows = []; snap.forEach(d => rows.push(d.data()));
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
        } catch (e) { container.innerHTML = '<div style="color:#ef4444;padding:14px">Lỗi: ' + e.message + '</div>'; }
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

    // === EXTENSIONS TAB ===
    async function renderExtensions() {
        const body = $('#extTableBody'); if (!body) return;
        if (!extensions.length) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px">Chưa có extension nào. Kiểm tra cấu hình Render API.</td></tr>'; return; }
        // Last-call per ext
        const lastByExt = {};
        try {
            const snap = await db.collection(HISTORY_COLLECTION).orderBy('timestamp','desc').limit(500).get();
            snap.forEach(d => { const c = d.data(); if (c.ext && !lastByExt[c.ext]) lastByExt[c.ext] = c; });
        } catch {}
        // Presence
        const presenceByUser = {};
        try {
            const snap = await db.collection(PRESENCE_COLLECTION).get();
            snap.forEach(d => presenceByUser[d.id] = d.data());
        } catch {}

        const userByExt = {};
        Object.entries(assignments).forEach(([name, ext]) => { userByExt[ext] = name; });
        const filter = ($('#extSearch').value || '').trim().toLowerCase();

        const rows = extensions.filter(e => {
            if (!filter) return true;
            const user = userByExt[e.ext] || '';
            return e.ext.includes(filter) || (e.label || '').toLowerCase().includes(filter) || user.toLowerCase().includes(filter);
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
                    <td><select class="pm-input" style="min-width:0" data-ext="${e.ext}" onchange="PM.assignExt('${e.ext}', this.value)">${userOpts}</select></td>
                    <td>${stateBadge}</td>
                    <td>${last ? `<div><b>${_esc(last.name || _fmtPhone(last.phone))}</b></div><div style="font-size:11px;color:#94a3b8">${_relTime(last.timestamp)} • ${_fmtDuration(last.duration)}</div>` : '—'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="PM.viewExtHistory('${e.ext}')" title="Xem lịch sử"><i data-lucide="list"></i></button>
                        ${user ? `<button class="btn btn-sm btn-outline" onclick="PM.assignExt('${e.ext}', '')" title="Bỏ gán"><i data-lucide="user-x"></i></button>` : ''}
                    </td>
                </tr>`;
        }).join('');
        body.innerHTML = rows;
        _iconsRefresh();
    }

    async function assignExt(ext, username) {
        if (!window.PhoneExtAssignment) return;
        try {
            if (username) {
                // Conflict check
                for (const [n, e] of Object.entries(assignments)) {
                    if (n !== username && String(e) === String(ext)) {
                        if (!confirm(`Ext ${ext} đang gán cho ${n}. Chuyển sang ${username}?`)) { renderExtensions(); return; }
                        await window.PhoneExtAssignment.setAssignment(n, null);
                    }
                }
                // Also unassign if this user had another ext
                const prev = assignments[username];
                if (prev && String(prev) !== String(ext)) {
                    // will be overridden below
                }
                await window.PhoneExtAssignment.setAssignment(username, ext);
            } else {
                // Remove assignment for whoever holds this ext
                const owner = Object.entries(assignments).find(([,v]) => String(v) === String(ext));
                if (owner) await window.PhoneExtAssignment.setAssignment(owner[0], null);
            }
            assignments = window.PhoneExtAssignment.getAll();
            renderExtensions();
        } catch (e) { alert('Lỗi: ' + e.message); }
    }

    function viewExtHistory(ext) {
        $('#histUser').value = '';
        switchTab('history');
        // Use phone filter as "ext:" prefix (client-side will filter by ext)
        setTimeout(() => {
            // We add a fake filter via a state flag
            _extHistoryFilter = ext;
            applyHistoryFilters();
            setTimeout(() => { _extHistoryFilter = null; }, 100);
        }, 100);
    }
    let _extHistoryFilter = null;

    function openAddExtension() {
        alert('Thêm ext mới: cập nhật qua Render API PUT /api/oncall/phone-config key=sip_extensions');
    }

    // === STAFF TAB ===
    async function renderStaff() {
        const body = $('#staffTableBody'); if (!body) return;
        const filter = ($('#staffSearch').value || '').toLowerCase();
        const roleFilter = $('#staffFilterRole').value;

        // Fetch call counts per user this week
        const weekAgo = Date.now() - 7*86400000;
        const countByUser = {};
        try {
            const snap = await db.collection(HISTORY_COLLECTION).where('timestamp', '>=', weekAgo).get();
            snap.forEach(d => { const c = d.data(); if (!c.username) return; countByUser[c.username] = (countByUser[c.username] || 0) + 1; });
        } catch {}
        // Presence
        const presenceByUser = {};
        try {
            const snap = await db.collection(PRESENCE_COLLECTION).get();
            snap.forEach(d => presenceByUser[d.id] = d.data());
        } catch {}

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
                    <td>${stateBadge}${presence?.state === 'in-call' && presence?.callPhone ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">với ${_esc(presence.callName || _fmtPhone(presence.callPhone))}</div>` : ''}</td>
                    <td><button class="btn btn-sm btn-outline" onclick="PM.viewUserHistory('${_esc(u.displayName)}')" title="Xem lịch sử"><i data-lucide="list"></i></button></td>
                </tr>`;
        }).join('');
        _iconsRefresh();
    }

    async function assignUser(username, ext) {
        if (!window.PhoneExtAssignment) return;
        try {
            if (ext) {
                for (const [n, e] of Object.entries(assignments)) {
                    if (n !== username && String(e) === String(ext)) {
                        if (!confirm(`Ext ${ext} đang gán cho ${n}. Chuyển sang ${username}?`)) { renderStaff(); return; }
                        await window.PhoneExtAssignment.setAssignment(n, null);
                    }
                }
                await window.PhoneExtAssignment.setAssignment(username, ext);
            } else {
                await window.PhoneExtAssignment.setAssignment(username, null);
            }
            assignments = window.PhoneExtAssignment.getAll();
            renderStaff();
        } catch (e) { alert('Lỗi: ' + e.message); }
    }

    function viewUserHistory(username) {
        switchTab('history');
        setTimeout(() => { $('#histUser').value = username; applyHistoryFilters(); }, 50);
    }

    // === HISTORY TAB ===
    async function applyHistoryFilters() {
        const body = $('#historyTableBody'); if (!body) return;
        body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:20px">Đang tải...</td></tr>';

        const from = $('#histFrom').value ? new Date($('#histFrom').value).getTime() : 0;
        const to = $('#histTo').value ? new Date($('#histTo').value).getTime() + 86400000 : Date.now() + 86400000;
        const dir = $('#histDirection').value;
        const user = $('#histUser').value;
        const phone = ($('#histPhone').value || '').trim();

        try {
            let q = db.collection(HISTORY_COLLECTION)
                .where('timestamp', '>=', from)
                .where('timestamp', '<', to)
                .orderBy('timestamp', 'desc')
                .limit(500);
            const snap = await q.get();
            historyCache = [];
            snap.forEach(d => historyCache.push({ id: d.id, ...d.data() }));
            // Client-side filters
            historyCache = historyCache.filter(c => {
                if (dir && c.direction !== dir) return false;
                if (user && c.username !== user) return false;
                if (phone && !String(c.phone || '').includes(phone)) return false;
                if (_extHistoryFilter && String(c.ext) !== String(_extHistoryFilter)) return false;
                return true;
            });
            historyPage = 1;
            _renderHistoryPage();
        } catch (e) {
            body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#ef4444;padding:20px">Lỗi: ${_esc(e.message)}</td></tr>`;
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
                    <td>${c.orderCode ? `<a href="../orders-report/tab1-orders.html?q=${encodeURIComponent(c.orderCode)}">${_esc(c.orderCode)}</a>` : '—'}</td>
                    <td>${c.outcome ? `<span class="pm-badge ${c.outcome === 'success' ? 'green' : 'gray'}">${_esc(c.outcome)}</span>` : ''}${c.note ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">${_esc(c.note)}</div>` : ''}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:20px">Không có kết quả</td></tr>';
        // Pager
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
            _fmtDateTime(c.timestamp),
            c.direction || '',
            c.username || '',
            c.ext || '',
            c.phone || '',
            c.name || '',
            c.duration || 0,
            c.orderCode || '',
            c.outcome || '',
            c.note || ''
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `phone-history-${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }

    // === STATISTICS TAB ===
    async function loadStats() {
        const range = parseInt($('#statsRange').value || '30', 10);
        const since = Date.now() - range * 86400000;
        let data = [];
        try {
            const snap = await db.collection(HISTORY_COLLECTION).where('timestamp', '>=', since).get();
            snap.forEach(d => data.push(d.data()));
        } catch (e) { console.warn(e); return; }

        // Daily chart
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

        // Direction pie
        const dirCount = { Đi: 0, Đến: 0, Nhỡ: 0 };
        data.forEach(c => { const k = c.direction === 'missed' ? 'Nhỡ' : c.direction === 'in' ? 'Đến' : 'Đi'; dirCount[k]++; });
        if (charts.dir) charts.dir.destroy();
        charts.dir = new Chart($('#chartDirection'), {
            type: 'doughnut',
            data: { labels: Object.keys(dirCount), datasets: [{ data: Object.values(dirCount), backgroundColor: ['#22c55e','#3b82f6','#ef4444'] }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // Hourly
        const hourly = Array(24).fill(0);
        data.forEach(c => { const h = new Date(c.timestamp).getHours(); hourly[h]++; });
        if (charts.hourly) charts.hourly.destroy();
        charts.hourly = new Chart($('#chartHourly'), {
            type: 'bar',
            data: { labels: Array.from({length:24}, (_,i) => `${i}h`), datasets: [{ label: 'Cuộc gọi', data: hourly, backgroundColor: '#8b5cf6' }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
        });

        // Avg duration per user
        const durByUser = {};
        data.forEach(c => {
            if (!c.username || !c.duration) return;
            if (!durByUser[c.username]) durByUser[c.username] = { sum: 0, cnt: 0 };
            durByUser[c.username].sum += c.duration; durByUser[c.username].cnt++;
        });
        const avgEntries = Object.entries(durByUser).map(([u, v]) => [u, Math.round(v.sum/v.cnt)]).sort((a,b) => b[1]-a[1]).slice(0,10);
        if (charts.avgDur) charts.avgDur.destroy();
        charts.avgDur = new Chart($('#chartAvgDur'), {
            type: 'bar',
            data: { labels: avgEntries.map(e => e[0]), datasets: [{ label: 'TB (giây)', data: avgEntries.map(e => e[1]), backgroundColor: '#f59e0b' }] },
            options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
        });

        // Top contacts
        const byPhone = {};
        data.forEach(c => { if (!c.phone) return; const k = c.phone; if (!byPhone[k]) byPhone[k] = { phone: k, name: c.name, count: 0, dur: 0 }; byPhone[k].count++; byPhone[k].dur += (c.duration || 0); if (c.name && !byPhone[k].name) byPhone[k].name = c.name; });
        const top = Object.values(byPhone).sort((a,b) => b.count-a.count).slice(0,10);
        $('#topContacts').innerHTML = top.length
            ? top.map((t,i) => `<div class="pm-compact-item"><div class="pm-compact-main"><div class="pm-compact-name">#${i+1} ${_esc(t.name || _fmtPhone(t.phone))}</div><div class="pm-compact-meta"><span>${_fmtPhone(t.phone)}</span><span>• ${_fmtDuration(Math.round(t.dur))}</span></div></div><div class="pm-compact-value">${t.count}</div></div>`).join('')
            : '<div style="text-align:center;color:#94a3b8;padding:14px">Chưa có dữ liệu</div>';
    }

    // === LIVE TAB ===
    function startLive() {
        if (presenceUnsub) { presenceUnsub(); presenceUnsub = null; }
        const grid = $('#liveGrid'); if (!grid || !db) return;
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:24px">Đang tải trạng thái...</div>';
        presenceUnsub = db.collection(PRESENCE_COLLECTION).onSnapshot(snap => {
            const items = [];
            snap.forEach(d => items.push({ id: d.id, ...d.data() }));
            // Include all users, not just those with presence doc
            const byUser = Object.fromEntries(items.map(i => [i.id, i]));
            const merged = users.map(u => byUser[u.displayName] || { id: u.displayName, username: u.displayName, state: 'offline', ext: assignments[u.displayName] || '' });
            grid.innerHTML = merged.map(p => {
                const name = p.username || p.id;
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
                        ${p.state === 'in-call' && p.callPhone ? `<div class="pm-live-call-info">📞 ${_esc(p.callName || _fmtPhone(p.callPhone))}</div>` : ''}
                        ${p.since && p.state !== 'offline' ? `<div class="pm-live-since">Từ ${_relTime(p.since)}</div>` : ''}
                    </div>`;
            }).join('');
            _iconsRefresh();
        });
    }

    // === CONTACTS TAB ===
    async function loadContacts() {
        const body = $('#contactsTableBody'); if (!body) return;
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">Đang tải...</td></tr>';
        try {
            const snap = await db.collection(CONTACTS_COLLECTION).orderBy('name').get();
            const rows = [];
            snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
            body.innerHTML = rows.length
                ? rows.map(c => `
                    <tr>
                        <td><b>${_esc(c.name)}</b></td>
                        <td class="mono">${_fmtPhone(c.phone)}</td>
                        <td>${c.tag ? `<span class="pm-badge blue">${_esc(c.tag)}</span>` : ''}</td>
                        <td>${_esc(c.note || '')}</td>
                        <td>
                            <button class="btn btn-sm btn-outline" onclick="PM.copyToClipboard('${_esc(c.phone)}')" title="Copy"><i data-lucide="copy"></i></button>
                            <button class="btn btn-sm btn-outline" onclick="PM.deleteContact('${c.id}')" title="Xoá"><i data-lucide="trash-2"></i></button>
                        </td>
                    </tr>
                `).join('')
                : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">Danh bạ trống</td></tr>';
            _iconsRefresh();
        } catch { body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:20px">Lỗi tải dữ liệu</td></tr>'; }
    }
    async function openAddContact() {
        const name = prompt('Tên liên hệ:'); if (!name) return;
        const phone = prompt('Số điện thoại:'); if (!phone) return;
        const tag = prompt('Nhãn (tuỳ chọn):') || '';
        const note = prompt('Ghi chú (tuỳ chọn):') || '';
        try {
            await db.collection(CONTACTS_COLLECTION).add({ name, phone: phone.replace(/[^\d+]/g,''), tag, note, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            loadContacts();
        } catch (e) { alert('Lỗi: ' + e.message); }
    }
    async function deleteContact(id) {
        if (!confirm('Xoá liên hệ này?')) return;
        try { await db.collection(CONTACTS_COLLECTION).doc(id).delete(); loadContacts(); } catch (e) { alert('Lỗi: ' + e.message); }
    }
    function copyToClipboard(s) { navigator.clipboard.writeText(s).catch(() => {}); }

    // === RECORDINGS TAB (placeholder — local only) ===
    async function loadRecordings() {
        // Recording functionality needs MediaRecorder hookup in phone-widget.
        // For now just show any records from IndexedDB if widget stored any.
        const body = $('#recTableBody'); if (!body) return;
        // Will be populated once phone-widget MediaRecorder is enabled
        if (body.children.length === 1 && body.children[0].textContent.includes('Chưa có')) return; // already set
    }

    // === CONFIG TAB ===
    function renderConfig() {
        $('#cfgPbxDomain').value = dbConfig?.pbx_domain || 'pbx-ucaas.oncallcx.vn';
        $('#cfgWsUrl').value = dbConfig?.ws_url || '';
        // Ext pool
        const body = $('#cfgExtPoolBody');
        body.innerHTML = extensions.length
            ? extensions.map(e => `
                <tr>
                    <td class="mono"><b>${e.ext}</b></td>
                    <td>${_esc(e.label || '')}</td>
                    <td class="mono" style="font-size:11px">${_esc(e.authId || '')}</td>
                    <td class="mono" style="font-size:11px">${e.password ? '••••••••' : '—'}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px">Chưa tải được ext pool</td></tr>';
        // Load local prefs
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
            recordLocal: $('#cfgRecordLocal').checked,
            popupOnRing: $('#cfgPopupOnRing').checked,
            desktopNotify: $('#cfgDesktopNotify').checked
        };
        localStorage.setItem('phoneMgmt_prefs', JSON.stringify(prefs));
    }

    // === AUDIT TAB ===
    async function loadAudit() {
        const body = $('#auditTableBody'); if (!body) return;
        body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px">Đang tải...</td></tr>';
        const action = $('#auditAction').value;
        try {
            let q = db.collection(AUDIT_COLLECTION).orderBy('timestamp', 'desc').limit(200);
            const snap = await q.get();
            const rows = []; snap.forEach(d => rows.push(d.data()));
            const filtered = action ? rows.filter(r => r.action === action) : rows;
            body.innerHTML = filtered.length
                ? filtered.map(r => `
                    <tr>
                        <td>${_fmtDateTime(r.timestamp)}</td>
                        <td><b>${_esc(r.username || '—')}</b></td>
                        <td><span class="pm-badge ${r.action === 'ext_assign' ? 'green' : r.action === 'ext_unassign' ? 'red' : 'gray'}">${_esc(r.action)}</span></td>
                        <td style="font-size:11.5px;color:#475569">${_esc(JSON.stringify(r.detail || {}))}</td>
                    </tr>
                `).join('')
                : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px">Không có audit log</td></tr>';
        } catch (e) { body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#ef4444;padding:20px">Lỗi: ${_esc(e.message)}</td></tr>`; }
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
        saveLocalConfig
    };
})();

if (typeof window !== 'undefined') window.PM = PM;
