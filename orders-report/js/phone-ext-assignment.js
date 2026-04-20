// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Ext Assignment — map nhân viên ↔ extension
// Firestore: phone_ext_assignments/assignments { data: { [displayName]: ext }, lastUpdated }
// Pattern: Firebase as Source of Truth + Realtime Listener (theo docs/architecture/DATA-SYNCHRONIZATION.md)

const PhoneExtAssignment = (() => {
    const COLLECTION = 'phone_ext_assignments';
    const DOC_ID = 'assignments';
    const STORAGE_KEY = 'phoneExtAssignments_v1';

    // State
    let _data = {}; // { [displayName]: ext }
    let _db = null;
    let _isListening = false;
    let _unsub = null;
    let _readyPromise = null;
    const _listeners = [];

    function _getDb() {
        if (_db) return _db;
        try { if (window.firebase?.firestore) _db = firebase.firestore(); } catch {}
        return _db;
    }
    function _getDocRef() {
        const db = _getDb(); if (!db) return null;
        return db.collection(COLLECTION).doc(DOC_ID);
    }

    function _loadFromLocalStorage() {
        try {
            const s = localStorage.getItem(STORAGE_KEY);
            if (s) { _data = JSON.parse(s) || {}; }
        } catch {}
    }
    function _saveToLocalStorage() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); } catch {}
    }

    async function _loadFromFirestore() {
        const ref = _getDocRef(); if (!ref) return false;
        try {
            const snap = await ref.get();
            if (snap.exists) {
                const raw = snap.data() || {};
                _data = raw.data || {};
                _saveToLocalStorage();
                return true;
            }
        } catch (err) {
            console.warn('[PhoneExtAssignment] Firestore load failed:', err.message);
        }
        return false;
    }

    function _setupRealtimeListener() {
        const ref = _getDocRef(); if (!ref || _unsub) return;
        _unsub = ref.onSnapshot(snap => {
            if (snap.exists) {
                _isListening = true;
                const raw = snap.data() || {};
                _data = raw.data || {};
                _saveToLocalStorage();
                _notify();
                _isListening = false;
            }
        }, err => console.warn('[PhoneExtAssignment] listener error:', err.message));
    }

    function _notify() { _listeners.forEach(fn => { try { fn(_data); } catch {} }); }
    function onChange(fn) { if (typeof fn === 'function') _listeners.push(fn); }

    async function init() {
        if (_readyPromise) return _readyPromise;
        _readyPromise = (async () => {
            const loaded = await _loadFromFirestore();
            if (!loaded) _loadFromLocalStorage();
            _setupRealtimeListener();
            return _data;
        })();
        return _readyPromise;
    }

    function getCurrentUserName() {
        try {
            const auth = window.authManager?.getAuthData?.();
            return auth?.displayName || '';
        } catch { return ''; }
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
        const ref = _getDocRef(); if (!ref) return;
        const prevExt = _data[displayName] || '';
        const next = { ..._data };
        if (ext) next[displayName] = String(ext);
        else delete next[displayName];
        _data = next;
        _saveToLocalStorage();
        try {
            await ref.set({ data: _data, lastUpdated: Date.now() }, { merge: true });
            try { window.PhoneCloudSync?.logAudit?.(ext ? 'ext_assign' : 'ext_unassign', { target: displayName, prevExt, newExt: ext || '' }); } catch {}
        } catch (err) {
            console.error('[PhoneExtAssignment] save failed:', err.message);
            throw err;
        }
    }
    async function removeAssignment(displayName) { return setAssignment(displayName, null); }

    // === ADMIN MODAL ===
    let modalEl = null;
    async function openModal() {
        if (!isAdmin()) {
            alert('Chỉ admin mới có quyền phân chia extension.');
            return;
        }
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
            .pwa-conflict{color:#fbbf24;font-size:11px;margin-left:6px}
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
                        <div class="pwa-sub">Mỗi nhân viên gán 1 extension — widget sẽ tự chọn khi đăng nhập</div>
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

        // Get extensions list from phone widget dbConfig (cached in localStorage)
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
        // Check conflict: another user already has this ext
        let conflictUser = '';
        if (ext) {
            for (const [n, e] of Object.entries(_data)) {
                if (n !== name && String(e) === String(ext)) { conflictUser = n; break; }
            }
        }
        if (conflictUser) {
            const ok = confirm(`Ext ${ext} đang được gán cho ${conflictUser}. Chuyển sang ${name}?`);
            if (!ok) {
                selectEl.value = _data[name] || '';
                return;
            }
            // Remove from the other user
            await setAssignment(conflictUser, null);
        }
        await setAssignment(name, ext);
        const cur = row.querySelector('[data-role="current"]');
        if (cur) cur.textContent = ext ? 'Ext ' + ext : '—';
        flashSaved();
        // Re-render list so the conflict row also updates
        if (conflictUser) renderModal();
    }

    function flashSaved() {
        const msg = document.getElementById('pwaMsg'); if (!msg) return;
        msg.classList.add('show');
        setTimeout(() => msg.classList.remove('show'), 1200);
    }

    function closeModal() { if (modalEl) modalEl.style.display = 'none'; }

    // Auto-init when auth + firebase available
    function _tryInit() {
        if (window.firebase?.firestore && !_readyPromise) {
            init();
        } else {
            setTimeout(_tryInit, 500);
        }
    }
    if (typeof window !== 'undefined') {
        setTimeout(_tryInit, 500);
    }

    return {
        init, getMyExt, getAll, getUserForExt,
        setAssignment, removeAssignment,
        getCurrentUserName, isAdmin,
        openModal, closeModal,
        onChange,
        _onSelectChange // internal, referenced from inline onchange
    };
})();

if (typeof window !== 'undefined') window.PhoneExtAssignment = PhoneExtAssignment;
