// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Cloud Sync — push call history + presence to Firestore for cross-device / admin visibility
// Collections:
//   phone_call_history        — per-call doc {username, ext, phone, name, direction, duration, timestamp, orderCode, outcome}
//   phone_presence/{username} — live presence {state, ext, since, callPhone, callName}
// Pattern: write-only from widget; management page reads

const PhoneCloudSync = (() => {
    const HISTORY_COLLECTION = 'phone_call_history';
    const PRESENCE_COLLECTION = 'phone_presence';
    const AUDIT_COLLECTION = 'phone_audit_log';

    let _db = null;
    let _presenceDocId = null;
    let _presenceTimer = null;

    function _getDb() {
        if (_db) return _db;
        try { if (window.firebase?.firestore) _db = firebase.firestore(); } catch {}
        return _db;
    }
    function _currentUser() {
        try { return window.authManager?.getAuthData?.()?.displayName || ''; } catch { return ''; }
    }
    function _serverTs() {
        try { return firebase.firestore.FieldValue.serverTimestamp(); } catch { return Date.now(); }
    }

    // Log one call entry to Firestore
    async function logCall(entry) {
        const db = _getDb(); if (!db) return;
        const user = _currentUser();
        const doc = {
            username: user,
            ext: entry.ext || '',
            phone: entry.phone || '',
            name: entry.name || '',
            direction: entry.direction || 'out', // out | in | missed
            duration: entry.duration || 0,
            orderCode: entry.orderCode || '',
            outcome: entry.outcome || '', // optional: success | voicemail | no-answer | busy | failed
            note: entry.note || '',
            timestamp: entry.timestamp || Date.now(),
            createdAt: _serverTs()
        };
        try {
            await db.collection(HISTORY_COLLECTION).add(doc);
        } catch (err) {
            console.warn('[PhoneCloudSync] logCall failed:', err.message);
        }
    }

    // Update outcome/note on the most recent call for this user + phone
    async function updateLastCallOutcome(phone, patch) {
        const db = _getDb(); if (!db) return;
        const user = _currentUser();
        try {
            const q = await db.collection(HISTORY_COLLECTION)
                .where('username', '==', user)
                .where('phone', '==', phone)
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();
            if (!q.empty) {
                await q.docs[0].ref.update(patch);
            }
        } catch (err) {
            console.warn('[PhoneCloudSync] updateLastCallOutcome failed:', err.message);
        }
    }

    // Update presence doc
    async function setPresence(state, extra = {}) {
        const db = _getDb(); if (!db) return;
        const user = _currentUser(); if (!user) return;
        _presenceDocId = user;
        const doc = {
            username: user,
            state, // offline | registered | calling | ringing | in-call
            ext: extra.ext || '',
            callPhone: extra.callPhone || '',
            callName: extra.callName || '',
            direction: extra.direction || '',
            since: Date.now(),
            updatedAt: _serverTs()
        };
        try {
            await db.collection(PRESENCE_COLLECTION).doc(user).set(doc, { merge: true });
        } catch (err) {
            console.warn('[PhoneCloudSync] setPresence failed:', err.message);
        }
    }

    // Heartbeat: keep presence alive
    function startHeartbeat(getCurrentState) {
        stopHeartbeat();
        _presenceTimer = setInterval(() => {
            try {
                const s = typeof getCurrentState === 'function' ? getCurrentState() : null;
                if (s) setPresence(s.state, s.extra || {});
            } catch {}
        }, 30000); // every 30s
    }
    function stopHeartbeat() {
        if (_presenceTimer) { clearInterval(_presenceTimer); _presenceTimer = null; }
    }

    async function clearPresence() {
        const db = _getDb(); if (!db || !_presenceDocId) return;
        try {
            await db.collection(PRESENCE_COLLECTION).doc(_presenceDocId).set({
                state: 'offline',
                updatedAt: _serverTs()
            }, { merge: true });
        } catch {}
    }

    // Audit log: admin actions (ext assignment changes, config updates, etc.)
    async function logAudit(action, detail) {
        const db = _getDb(); if (!db) return;
        try {
            await db.collection(AUDIT_COLLECTION).add({
                username: _currentUser(),
                action, // e.g. 'ext_assign', 'ext_unassign', 'config_update'
                detail: detail || {},
                timestamp: Date.now(),
                createdAt: _serverTs()
            });
        } catch (err) {
            console.warn('[PhoneCloudSync] logAudit failed:', err.message);
        }
    }

    // Auto clear presence on page unload
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => { try { clearPresence(); } catch {} });
    }

    return {
        logCall, updateLastCallOutcome,
        setPresence, startHeartbeat, stopHeartbeat, clearPresence,
        logAudit,
        getCurrentUser: _currentUser,
        HISTORY_COLLECTION, PRESENCE_COLLECTION, AUDIT_COLLECTION
    };
})();

if (typeof window !== 'undefined') window.PhoneCloudSync = PhoneCloudSync;
