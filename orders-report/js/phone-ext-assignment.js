// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Ext Assignment — map nhân viên ↔ extension
// Storage: Render Postgres qua /api/oncall/ext-assignments (GET/PUT/DELETE)
// Pattern: localStorage cache + polling fallback (Postgres không có realtime)

const PhoneExtAssignment = (() => {
    const API_BASE = 'https://n2store-fallback.onrender.com/api/oncall';
    const STORAGE_KEY = 'phoneExtAssignments_v2';
    const POLL_INTERVAL = 15000; // 15s

    let _data = {}; // { [displayName]: ext }
    let _readyPromise = null;
    let _pollTimer = null;
    const _listeners = [];

    function _loadFromLocalStorage() {
        try {
            const s = localStorage.getItem(STORAGE_KEY);
            if (s) _data = JSON.parse(s) || {};
        } catch {}
    }
    function _saveToLocalStorage() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); } catch {}
    }

    async function _fetchFromServer() {
        try {
            const r = await fetch(`${API_BASE}/ext-assignments`, { cache: 'no-store' });
            if (!r.ok) return false;
            const d = await r.json();
            if (d?.success && d.assignments) {
                const prev = JSON.stringify(_data);
                _data = d.assignments;
                _saveToLocalStorage();
                if (JSON.stringify(_data) !== prev) _notify();
                return true;
            }
        } catch (err) {
            console.warn('[PhoneExtAssignment] fetch failed:', err.message);
        }
        return false;
    }

    function _startPolling() {
        if (_pollTimer) return;
        _pollTimer = setInterval(_fetchFromServer, POLL_INTERVAL);
    }
    function stopPolling() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } }

    function _notify() { _listeners.forEach(fn => { try { fn(_data); } catch {} }); }
    function onChange(fn) { if (typeof fn === 'function') _listeners.push(fn); }

    async function init() {
        if (_readyPromise) return _readyPromise;
        _readyPromise = (async () => {
            _loadFromLocalStorage(); // show cached immediately
            const ok = await _fetchFromServer();
            if (!ok) console.warn('[PhoneExtAssignment] using local cache (server unreachable)');
            _startPolling();
            return _data;
        })();
        return _readyPromise;
    }

    function getCurrentUserName() {
        try { return window.authManager?.getAuthData?.()?.displayName || ''; } catch { return ''; }
    }
    function isAdmin() {
        try {
            const auth = window.authManager?.getAuthData?.();
            const userType = (localStorage.getItem('userType') || '').toLowerCase();
            if (userType.startsWith('admin')) return true;
            if (auth?.isAdmin === true) return true;
            if (auth?.roleTemplate === 'admin') return true;
            if (auth?.checkLogin === 0) return true;
            return false;
        } catch { return false; }
    }

    function getMyExt() { return _data[getCurrentUserName()] || ''; }
    function getAll() { return { ..._data }; }
    function getUserForExt(ext) {
        for (const [name, e] of Object.entries(_data)) {
            if (String(e) === String(ext)) return name;
        }
        return '';
    }

    async function setAssignment(displayName, ext) {
        if (!displayName) return;
        const prevExt = _data[displayName] || '';
        // Optimistic local update
        const next = { ..._data };
        if (ext) next[displayName] = String(ext);
        else delete next[displayName];
        _data = next;
        _saveToLocalStorage();
        _notify();

        try {
            const r = await fetch(`${API_BASE}/ext-assignments/${encodeURIComponent(displayName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ext: ext || '', assigned_by: getCurrentUserName() })
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            try { window.PhoneCloudSync?.logAudit?.(ext ? 'ext_assign' : 'ext_unassign', { target: displayName, prevExt, newExt: ext || '' }); } catch {}
            // Re-fetch to stay in sync with server
            _fetchFromServer();
        } catch (err) {
            // Rollback local cache
            if (prevExt) _data[displayName] = prevExt; else delete _data[displayName];
            _saveToLocalStorage(); _notify();
            console.error('[PhoneExtAssignment] save failed:', err.message);
            throw err;
        }
    }
    async function removeAssignment(displayName) { return setAssignment(displayName, null); }

    // === ADMIN MODAL ===
    let modalEl = null;
    async function openModal() {
        if (!isAdmin()) { alert('Chỉ admin mới có quyền phân chia extension.'); return; }
        await init();
        if (modalEl) { modalEl.style.display = 'flex'; renderModal(); return; }
        const wrap = document.createElement('div');
        wrap.id = 'pwAssignModal';
        wrap.innerHTML = `
            <style>
            #pwAssignModal{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;
                background:rgba(0,0,0,.6);backdrop-filter:blur(4px);animation:pwa-fade .2s}
            @keyframes pwa-fade{from{opacity:0}to{opacity:1}}
            .pwa-box{background:linear-gradient(180deg,#1e293b,#0f172a);color:#e2e8f0;border-radius:14px;
                width:min(560px,92vw);max-height:85vh;display:flex;flex-direction:column;
                box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08);
                font-family:-apple-system,'Segoe UI',sans-serif}
            .pwa-head{display:flex;justify-content:space-between;align-items:center;
                padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
            .pwa-title{font-size:15px;font-weight:700;color:#f1f5f9}
            .pwa-sub{font-size:11px;color:#94a3b8;margin-top:2px}
            .pwa-close{background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;
                padding:4px 10px;border-radius:6px;line-height:1}
            .pwa-close:hover{color:#f1f5f9;background:rgba(255,255,255,.06)}
            .pwa-body{flex:1;overflow-y:auto;padding:10px 0}
            .pwa-body::-webkit-scrollbar{width:5px}
            .pwa-body::-webkit-scrollbar-thumb{background:rgba(148,163,184,.3);border-radius:3px}
            .pwa-row{display:flex;align-items:center;gap:12px;padding:10px 18px;
                border-bottom:1px solid rgba(255,255,255,.04);transition:background .12s}
            .pwa-row:hover{background:rgba(59,130,246,.05)}
            .pwa-name{flex:1;font-size:13px;font-weight:600;color:#f1f5f9;min-width:0;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .pwa-name .pwa-role{font-size:10px;color:#94a3b8;margin-left:6px;font-weight:400}
            .pwa-select{background:#0f172a;border:1px solid rgba(148,163,184,.25);color:#f1f5f9;
                padding:6px 10px;border-radius:8px;font-size:12px;cursor:pointer;outline:none;
                font-family:'SF Mono',monospace;min-width:140px}
            .pwa-select:focus{border-color:#3b82f6}
            .pwa-current{font-size:11px;color:#4ade80;min-width:46px;text-align:center;
                font-family:'SF Mono',monospace;font-weight:600}
            .pwa-foot{padding:12px 18px;border-top:1px solid rgba(255,255,255,.07);
                display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8}
            .pwa-msg{color:#4ade80;opacity:0;transition:opacity .3s}
            .pwa-msg.show{opacity:1}
            .pwa-empty{padding:40px 20px;text-align:center;color:#64748b;font-size:12px}
            </style>
            <div class="pwa-box">
                <div class="pwa-head">
                    <div>
                        <div class="pwa-title">Phân chia Extension cho nhân viên</div>
                        <div class="pwa-sub">Dữ liệu lưu trên Render Postgres — auto-sync mỗi 15s</div>
                    </div>
                    <button class="pwa-close" onclick="PhoneExtAssignment.closeModal()">×</button>
                </div>
                <div class="pwa-body" id="pwaBody"><div class="pwa-empty">Đang tải danh sách...</div></div>
                <div class="pwa-foot">
                    <span>Tự động lưu khi chọn</span>
                    <span class="pwa-msg" id="pwaMsg">✓ Đã lưu</span>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);
        modalEl = wrap;
        wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
        await renderModal();
    }

    async function renderModal() {
        const body = document.getElementById('pwaBody'); if (!body) return;
        const loader = window.userEmployeeLoader;
        let users = [];
        if (loader) {
            try {
                if (!loader.initialized) await loader.initialize();
                users = await loader.loadUsers();
            } catch (e) { console.warn('[PhoneExtAssignment] loadUsers failed:', e.message); }
        }
        if (!users.length) {
            body.innerHTML = '<div class="pwa-empty">Không tải được danh sách nhân viên</div>';
            return;
        }

        let extensions = [];
        try {
            const raw = localStorage.getItem('phoneWidget_dbConfig');
            if (raw) extensions = (JSON.parse(raw).sip_extensions || []);
        } catch {}
        if (!extensions.length) extensions = [{ ext: '101', label: 'Ext 101' }];

        const extOptions = (currentExt) => {
            let opts = '<option value="">— Chưa gán —</option>';
            extensions.forEach(e => {
                opts += `<option value="${e.ext}" ${String(currentExt) === String(e.ext) ? 'selected' : ''}>Ext ${e.ext}${e.label && e.label !== 'Ext ' + e.ext ? ' · ' + e.label : ''}</option>`;
            });
            return opts;
        };

        body.innerHTML = users.map(u => {
            const role = u.checkLogin === 0 ? 'Admin' : 'Nhân viên';
            const assignedExt = _data[u.displayName] || '';
            return `
                <div class="pwa-row" data-name="${escapeAttr(u.displayName)}">
                    <div class="pwa-name">${escapeHtml(u.displayName)}<span class="pwa-role">· ${role}</span></div>
                    <span class="pwa-current" data-role="current">${assignedExt ? 'Ext ' + assignedExt : '—'}</span>
                    <select class="pwa-select" onchange="PhoneExtAssignment._onSelectChange(this)">
                        ${extOptions(assignedExt)}
                    </select>
                </div>`;
        }).join('');
    }

    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
    function escapeAttr(s) { return escapeHtml(s); }

    async function _onSelectChange(selectEl) {
        const row = selectEl.closest('.pwa-row'); if (!row) return;
        const name = row.getAttribute('data-name');
        const ext = selectEl.value;
        let conflictUser = '';
        if (ext) {
            for (const [n, e] of Object.entries(_data)) {
                if (n !== name && String(e) === String(ext)) { conflictUser = n; break; }
            }
        }
        if (conflictUser) {
            const ok = confirm(`Ext ${ext} đang được gán cho ${conflictUser}. Chuyển sang ${name}?`);
            if (!ok) { selectEl.value = _data[name] || ''; return; }
            await setAssignment(conflictUser, null);
        }
        try {
            await setAssignment(name, ext);
            const cur = row.querySelector('[data-role="current"]');
            if (cur) cur.textContent = ext ? 'Ext ' + ext : '—';
            flashSaved();
            if (conflictUser) renderModal();
        } catch (err) {
            alert('Lỗi lưu: ' + err.message);
        }
    }

    function flashSaved() {
        const msg = document.getElementById('pwaMsg'); if (!msg) return;
        msg.classList.add('show');
        setTimeout(() => msg.classList.remove('show'), 1200);
    }

    function closeModal() { if (modalEl) modalEl.style.display = 'none'; }

    // Auto-init
    if (typeof window !== 'undefined') {
        setTimeout(() => init(), 500);
    }

    return {
        init, getMyExt, getAll, getUserForExt,
        setAssignment, removeAssignment,
        getCurrentUserName, isAdmin,
        openModal, closeModal,
        onChange, stopPolling,
        _onSelectChange
    };
})();

if (typeof window !== 'undefined') window.PhoneExtAssignment = PhoneExtAssignment;
