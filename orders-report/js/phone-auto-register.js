// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Auto-Register — register tất cả extension còn lại (không phải ext chính của user)
// Mục đích: bất kỳ máy nào mở main.html → 10 line luôn online trên PBX dashboard
// Background UAs chỉ keep registration; không handle media. Incoming call:
//   - Primary widget (ext được gán) ring bình thường
//   - Background UAs silent — PBX fork sẽ auto-CANCEL chúng khi primary answer

const PhoneAutoRegister = (() => {
    const API_BASE = 'https://n2store-fallback.onrender.com/api/oncall';
    const STATE_KEY = 'phoneAutoRegister_enabled_v1';
    const DEFAULTS = {
        pbx_domain: 'pbx-ucaas.oncallcx.vn',
        ws_url: 'wss://45-76-155-207.sslip.io/ws'
    };
    const START_STAGGER_MS = 200;

    const uas = new Map(); // ext → { ua, registered, lastError, ext }
    let extensions = [];
    let dbConfig = null;
    let myExt = null;
    let started = false;

    function isEnabled() {
        const v = localStorage.getItem(STATE_KEY);
        return v === null || v === 'true'; // default ON
    }
    function setEnabled(b) {
        localStorage.setItem(STATE_KEY, String(!!b));
        if (b && !started) start();
        else if (!b) stop();
    }

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

    function _getMyAssignedExt() {
        try { return window.PhoneExtAssignment?.getMyExt?.() || ''; } catch { return ''; }
    }

    async function start() {
        if (started) return;
        if (!isEnabled()) { console.log('[PhoneAutoRegister] disabled via localStorage'); return; }
        if (typeof JsSIP === 'undefined') { console.warn('[PhoneAutoRegister] JsSIP not loaded'); return; }

        await _loadConfig();
        if (!extensions.length) { console.warn('[PhoneAutoRegister] no extensions in config'); return; }

        // Wait for ext-assignment to finish so we can skip my primary ext
        try {
            if (window.PhoneExtAssignment) {
                await Promise.race([
                    window.PhoneExtAssignment.init(),
                    new Promise(r => setTimeout(r, 3000))
                ]);
            }
        } catch {}
        myExt = _getMyAssignedExt();

        const wsUrl = dbConfig?.ws_url || DEFAULTS.ws_url;
        const domain = dbConfig?.pbx_domain || DEFAULTS.pbx_domain;

        // Stagger UA start to avoid burst
        const toStart = extensions.filter(e => String(e.ext) !== String(myExt));
        toStart.forEach((ext, idx) => {
            setTimeout(() => _startOneUA(ext, wsUrl, domain), idx * START_STAGGER_MS);
        });
        started = true;
        console.log(`[PhoneAutoRegister] starting ${toStart.length} background registrations (skip my ext ${myExt || 'none'})`);
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
            ua.on('registered', () => { entry.registered = true; entry.lastError = null; });
            ua.on('unregistered', () => { entry.registered = false; });
            ua.on('registrationFailed', (e) => { entry.registered = false; entry.lastError = e.cause; });
            ua.on('newRTCSession', (evt) => {
                if (evt.originator !== 'remote') return;
                // Background UA — let PBX fork handle cancellation when primary answers.
                // Don't answer, don't terminate. JsSIP sends 180 Ringing automatically.
                // If primary answers → PBX sends CANCEL → JsSIP cleans up.
                // If no primary answers → JsSIP no_answer_timeout kicks in (120s).
                try {
                    evt.session.on('ended', () => {});
                    evt.session.on('failed', () => {});
                } catch {}
            });
            ua.start();
        } catch (err) {
            entry.lastError = err.message;
            console.warn('[PhoneAutoRegister] start failed', ext.ext, err.message);
        }
    }

    function stop() {
        uas.forEach(entry => { try { entry.ua?.stop(); } catch {} });
        uas.clear();
        started = false;
    }

    function getStatus() {
        return {
            started, enabled: isEnabled(), myExt,
            total: uas.size,
            registered: Array.from(uas.values()).filter(e => e.registered).length,
            details: Array.from(uas.values()).map(e => ({ ext: e.ext, registered: e.registered, error: e.lastError }))
        };
    }

    // Auto-start after main widget registers primary ext (delay 8s)
    if (typeof window !== 'undefined') {
        setTimeout(() => { if (isEnabled()) start(); }, 8000);
        window.addEventListener('beforeunload', stop);
    }

    return { start, stop, isEnabled, setEnabled, getStatus };
})();

if (typeof window !== 'undefined') window.PhoneAutoRegister = PhoneAutoRegister;
