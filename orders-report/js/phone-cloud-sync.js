// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Cloud Sync — push call history + presence + audit to Render Postgres REST API
// Endpoints:
//   POST /api/oncall/call-history, PATCH /api/oncall/call-history (update last for user+phone)
//   POST /api/oncall/presence
//   POST /api/oncall/audit-log

const PhoneCloudSync = (() => {
    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall';
    let _presenceTimer = null;
    let _lastPresence = null;

    function _currentUser() {
        try { return window.authManager?.getAuthData?.()?.displayName || ''; } catch { return ''; }
    }

    async function _post(path, body) {
        try {
            const r = await fetch(`${API_BASE}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok) { const t = await r.text().catch(() => ''); console.warn('[PhoneCloudSync]', path, r.status, t); return null; }
            return await r.json().catch(() => ({}));
        } catch (err) {
            console.warn('[PhoneCloudSync] POST', path, err.message);
            return null;
        }
    }
    async function _patch(path, body) {
        try {
            const r = await fetch(`${API_BASE}${path}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok) return null;
            return await r.json().catch(() => ({}));
        } catch (err) {
            console.warn('[PhoneCloudSync] PATCH', path, err.message);
            return null;
        }
    }

    async function logCall(entry) {
        const user = _currentUser();
        await _post('/call-history', {
            username: user,
            ext: entry.ext || null,
            phone: entry.phone || '',
            name: entry.name || null,
            direction: entry.direction || 'out',
            duration: entry.duration || 0,
            orderCode: entry.orderCode || null,
            outcome: entry.outcome || null,
            note: entry.note || null,
            timestamp: entry.timestamp || Date.now()
        });
    }

    async function updateLastCallOutcome(phone, patch) {
        const user = _currentUser();
        if (!user || !phone) return;
        await _patch('/call-history', {
            username: user,
            phone: phone,
            outcome: patch.outcome || null,
            note: patch.note || null
        });
    }

    async function setPresence(state, extra = {}) {
        const user = _currentUser(); if (!user) return;
        _lastPresence = {
            username: user,
            state,
            ext: extra.ext || null,
            callPhone: extra.callPhone || null,
            callName: extra.callName || null,
            direction: extra.direction || null,
            since: Date.now()
        };
        await _post('/presence', _lastPresence);
    }

    function startHeartbeat(getCurrentState) {
        stopHeartbeat();
        _presenceTimer = setInterval(() => {
            try {
                const s = typeof getCurrentState === 'function' ? getCurrentState() : null;
                if (s) setPresence(s.state, s.extra || {});
            } catch {}
        }, 30000);
    }
    function stopHeartbeat() {
        if (_presenceTimer) { clearInterval(_presenceTimer); _presenceTimer = null; }
    }

    async function clearPresence() {
        const user = _currentUser(); if (!user) return;
        await _post('/presence', { username: user, state: 'offline', since: Date.now() });
    }

    async function logAudit(action, detail) {
        await _post('/audit-log', {
            username: _currentUser(),
            action,
            detail: detail || {},
            timestamp: Date.now()
        });
    }

    // Best-effort clear presence on unload (use sendBeacon for reliability)
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
            try {
                const user = _currentUser(); if (!user) return;
                const blob = new Blob([JSON.stringify({ username: user, state: 'offline', since: Date.now() })], { type: 'application/json' });
                navigator.sendBeacon?.(`${API_BASE}/presence`, blob);
            } catch {}
        });
    }

    return {
        logCall, updateLastCallOutcome,
        setPresence, startHeartbeat, stopHeartbeat, clearPresence,
        logAudit,
        getCurrentUser: _currentUser,
        API_BASE
    };
})();

if (typeof window !== 'undefined') window.PhoneCloudSync = PhoneCloudSync;
