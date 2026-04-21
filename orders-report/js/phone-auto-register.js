// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Auto-Register — treo 10 line với server-side lock singleton
// Chỉ 1 máy giữ lock cùng lúc (tránh multi-contact conflict phá routing PBX)
// Admin bấm "Bật" → nếu máy khác đang giữ → confirm takeover → force acquire → máy cũ auto-stop
// Heartbeat 20s giữ lock; không heartbeat >90s → lock coi như expired, máy khác có thể take

const PhoneAutoRegister = (() => {
    const API_BASE = 'https://n2store-fallback.onrender.com/api/oncall';
    const PREF_KEY = 'phoneAutoRegister_enabled_v2'; // local preference
    const SESSION_KEY = 'phoneAutoRegister_session'; // unique session id per tab
    const HEARTBEAT_MS = 20000;
    const POLL_MS = 15000;
    const START_STAGGER_MS = 200;
    const DEFAULTS = {
        pbx_domain: 'pbx-ucaas.oncallcx.vn',
        ws_url: 'wss://45-76-155-207.sslip.io/ws'
    };

    const uas = new Map(); // ext → { ua, registered, lastError, ext }
    let extensions = [];
    let dbConfig = null;
    let myExt = null;
    let sessionId = null;
    let started = false;
    let heartbeatTimer = null;
    let pollTimer = null;
    const statusListeners = [];

    function _getSessionId() {
        if (sessionId) return sessionId;
        try {
            sessionId = sessionStorage.getItem(SESSION_KEY);
            if (!sessionId) {
                sessionId = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
                sessionStorage.setItem(SESSION_KEY, sessionId);
            }
        } catch { sessionId = Math.random().toString(36).slice(2); }
        return sessionId;
    }

    function _currentUser() {
        try { return window.authManager?.getAuthData?.()?.displayName || ''; } catch { return ''; }
    }
    function _deviceLabel() {
        const ua = navigator.userAgent || '';
        const m = ua.match(/\(([^)]+)\)/);
        return (m ? m[1] : ua).slice(0, 60);
    }
    function _isAdmin() {
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

    // Local preference: "I want to be the auto-register holder"
    function isPreferenceOn() {
        try { return localStorage.getItem(PREF_KEY) === 'true'; } catch { return false; }
    }
    function _setPreference(on) {
        try { localStorage.setItem(PREF_KEY, on ? 'true' : 'false'); } catch {}
    }

    // === LOCK API ===
    async function _getLock() {
        try {
            const r = await fetch(`${API_BASE}/auto-register-lock`, { cache: 'no-store' });
            if (!r.ok) return null;
            return await r.json();
        } catch { return null; }
    }
    async function _takeLock({ force = false } = {}) {
        try {
            const r = await fetch(`${API_BASE}/auto-register-lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session: _getSessionId(), user: _currentUser(), device: _deviceLabel(), force })
            });
            return await r.json();
        } catch (err) { return { success: false, error: err.message }; }
    }
    async function _heartbeat() {
        try {
            const r = await fetch(`${API_BASE}/auto-register-lock/heartbeat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session: _getSessionId() })
            });
            return await r.json();
        } catch { return { success: false }; }
    }
    async function _releaseLock() {
        try {
            await fetch(`${API_BASE}/auto-register-lock`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session: _getSessionId() })
            });
        } catch {}
    }

    // === CORE ===
    async function _loadConfig() {
        try {
            const r = await fetch(`${API_BASE}/phone-config`);
            const d = await r.json();
            if (d?.success && d.config) { dbConfig = d.config; extensions = d.config.sip_extensions || []; return; }
        } catch {}
        try {
            const c = JSON.parse(localStorage.getItem('phoneWidget_dbConfig') || '{}');
            dbConfig = c; extensions = c.sip_extensions || [];
        } catch {}
    }

    function _notifyStatus() {
        const s = getStatus();
        statusListeners.forEach(fn => { try { fn(s); } catch {} });
    }
    function onStatus(fn) { if (typeof fn === 'function') statusListeners.push(fn); }

    // Start UAs (called after lock acquired)
    async function _spawnUAs() {
        if (typeof JsSIP === 'undefined') { console.warn('[PhoneAutoRegister] JsSIP not loaded'); return; }
        await _loadConfig();
        if (!extensions.length) { console.warn('[PhoneAutoRegister] no extensions in config'); return; }
        try {
            if (window.PhoneExtAssignment) {
                await Promise.race([
                    window.PhoneExtAssignment.init(),
                    new Promise(r => setTimeout(r, 3000))
                ]);
            }
        } catch {}
        myExt = window.PhoneExtAssignment?.getMyExt?.() || '';

        const wsUrl = dbConfig?.ws_url || DEFAULTS.ws_url;
        const domain = dbConfig?.pbx_domain || DEFAULTS.pbx_domain;
        const toStart = extensions.filter(e => String(e.ext) !== String(myExt));

        toStart.forEach((ext, idx) => {
            setTimeout(() => _startOneUA(ext, wsUrl, domain), idx * START_STAGGER_MS);
        });
        started = true;
        console.log(`[PhoneAutoRegister] spawned ${toStart.length} background UAs (skip my ext ${myExt || 'none'})`);
    }

    function _scheduleRetry(entry, ext, wsUrl, domain, reason) {
        if (entry._retryTimer) clearTimeout(entry._retryTimer);
        entry._retryAttempt = (entry._retryAttempt || 0) + 1;
        const delay = Math.min(5000 * Math.pow(2, Math.min(entry._retryAttempt - 1, 5)), 60000);
        console.log(`[PhoneAutoRegister] ext ${ext.ext} retry ${Math.round(delay/1000)}s #${entry._retryAttempt} (${reason})`);
        entry._retryTimer = setTimeout(() => {
            entry._retryTimer = null;
            try {
                const conn = entry.ua && (entry.ua.isConnected?.() || entry.ua.transport?.isConnected?.());
                if (entry.ua && conn) {
                    entry.ua.register();
                } else {
                    try { entry.ua?.stop(); } catch {}
                    uas.delete(ext.ext);
                    _startOneUA(ext, wsUrl, domain);
                }
            } catch (err) { _scheduleRetry(entry, ext, wsUrl, domain, 'err'); }
        }, delay);
    }

    function _startOneUA(ext, wsUrl, domain) {
        if (uas.has(ext.ext)) return;
        const entry = { ua: null, registered: false, lastError: null, ext: ext.ext };
        uas.set(ext.ext, entry);
        try {
            const socket = new JsSIP.WebSocketInterface(wsUrl);
            const ua = new JsSIP.UA({
                sockets: [socket],
                uri: `sip:${ext.ext}@${domain}`,
                authorization_user: ext.authId,
                password: ext.password,
                display_name: ext.ext,
                register: true,
                register_expires: 120,
                session_timers: false,
                no_answer_timeout: 120,
                connection_recovery_min_interval: 2,
                connection_recovery_max_interval: 30
            });
            entry.ua = ua;
            ua.on('connected', () => {});
            ua.on('disconnected', () => { entry.registered = false; _notifyStatus(); _scheduleRetry(entry, ext, wsUrl, domain, 'ws_disc'); });
            ua.on('registered', () => {
                entry.registered = true; entry.lastError = null;
                entry._retryAttempt = 0;
                if (entry._retryTimer) { clearTimeout(entry._retryTimer); entry._retryTimer = null; }
                _notifyStatus();
            });
            ua.on('unregistered', () => { entry.registered = false; _notifyStatus(); _scheduleRetry(entry, ext, wsUrl, domain, 'unreg'); });
            ua.on('registrationFailed', (e) => {
                entry.registered = false; entry.lastError = e.cause;
                _notifyStatus();
                if (!String(e.cause || '').toLowerCase().includes('authentication')) {
                    _scheduleRetry(entry, ext, wsUrl, domain, 'reg_fail');
                }
            });
            ua.on('newRTCSession', (evt) => {
                if (evt.originator !== 'remote') return;
                try { evt.session.terminate({ status_code: 486, reason_phrase: 'Busy Here' }); } catch {}
            });
            ua.start();
        } catch (err) {
            entry.lastError = err.message;
            console.warn('[PhoneAutoRegister] UA start failed', ext.ext, err.message);
            _scheduleRetry(entry, ext, wsUrl, domain, 'start_err');
        }
    }

    function _stopAllUAs() {
        uas.forEach(entry => { try { entry.ua?.stop(); } catch {} });
        uas.clear();
        started = false;
    }

    function _startHeartbeat() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(async () => {
            const r = await _heartbeat();
            if (r && r.lost) {
                // Someone else took the lock
                console.warn('[PhoneAutoRegister] lock lost — stopping');
                _stopAllUAs();
                clearInterval(heartbeatTimer); heartbeatTimer = null;
                _notifyStatus();
            }
        }, HEARTBEAT_MS);
    }
    function _stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; } }

    function _startPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(async () => {
            // If we want preference ON but we're not currently running → try to acquire if free
            const wantOn = isPreferenceOn();
            const haveStarted = started;
            if (wantOn && !haveStarted) {
                const lock = await _getLock();
                if (lock && (!lock.locked || lock.holder_session === _getSessionId())) {
                    const t = await _takeLock({});
                    if (t.success && t.taken) { await _spawnUAs(); _startHeartbeat(); _notifyStatus(); }
                }
            } else if (!wantOn && haveStarted) {
                _stopAllUAs(); _stopHeartbeat(); _releaseLock(); _notifyStatus();
            }
        }, POLL_MS);
    }

    // === PUBLIC API ===
    async function enable({ force = null } = {}) {
        // Request to become the holder
        const lock = await _getLock();
        if (!lock) throw new Error('Không kết nối được Render server');
        const mySession = _getSessionId();
        if (lock.locked && lock.holder_session !== mySession && force === null) {
            // Conflict — caller must decide
            return { conflict: true, holder_user: lock.holder_user, holder_device: lock.holder_device, started_at: lock.started_at };
        }
        const t = await _takeLock({ force: force === true });
        if (!t.success) return { conflict: true, ...t };
        _setPreference(true);
        if (!started) await _spawnUAs();
        _startHeartbeat();
        _notifyStatus();
        return { conflict: false, taken: true, forced: !!t.forced };
    }

    async function disable() {
        _setPreference(false);
        _stopAllUAs();
        _stopHeartbeat();
        await _releaseLock();
        _notifyStatus();
    }

    function getStatus() {
        return {
            started,
            preferenceOn: isPreferenceOn(),
            isAdmin: _isAdmin(),
            sessionId: _getSessionId(),
            myExt,
            total: uas.size,
            registered: Array.from(uas.values()).filter(e => e.registered).length,
            details: Array.from(uas.values()).map(e => ({ ext: e.ext, registered: e.registered, error: e.lastError }))
        };
    }
    async function getRemoteLock() { return _getLock(); }

    // Legacy compat
    function isEnabled() { return isPreferenceOn(); }
    function setEnabled(b) { return b ? enable() : disable(); }

    // === AUTO-BOOT ===
    // On page load: if preference ON, try to take (no force). If conflict, stay off until user takes action.
    if (typeof window !== 'undefined') {
        setTimeout(async () => {
            _startPolling();
            if (!isPreferenceOn()) return;
            const lock = await _getLock();
            if (!lock) return;
            const mySession = _getSessionId();
            if (!lock.locked || lock.holder_session === mySession) {
                const t = await _takeLock({});
                if (t.success && t.taken) { await _spawnUAs(); _startHeartbeat(); _notifyStatus(); }
            }
            // else: someone else holds — wait, do nothing (user must explicitly takeover)
        }, 6000);
        window.addEventListener('beforeunload', () => {
            _stopAllUAs();
            try {
                const blob = new Blob([JSON.stringify({ session: _getSessionId() })], { type: 'application/json' });
                navigator.sendBeacon?.(`${API_BASE}/auto-register-lock`, blob); // best-effort release
            } catch {}
        });
    }

    return {
        // Primary
        enable, disable, getStatus, getRemoteLock, onStatus,
        // Legacy compat
        start: enable, stop: disable, isEnabled, setEnabled,
        // Helpers
        isAdmin: _isAdmin, isPreferenceOn, getSessionId: _getSessionId
    };
})();

if (typeof window !== 'undefined') window.PhoneAutoRegister = PhoneAutoRegister;
