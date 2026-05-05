// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// TAB1 — CUSTOMER PREFERENCES (per-phone, persistent)
// API:
//   - CustomerPrefs.getNickname(phone) / setNickname(phone, name)
//   - CustomerPrefs.isDoNotCall(phone) / setDoNotCall(phone, bool)
//   - CustomerPrefs.getAll() — for admin view
// Persist localStorage `n2s_customer_prefs_v1` (no TTL — manual cleanup).
// Sync Firebase RTDB path `customer_prefs/{normalized_phone}` để đa máy.
// =====================================================

(function () {
    'use strict';
    if (window.__customerPrefsLoaded) return;
    window.__customerPrefsLoaded = true;

    const LS_KEY = 'n2s_customer_prefs_v1';
    const FB_PATH = 'customer_prefs';

    // _store: { [normalizedPhone]: { nickname, doNotCall, updatedAt, updatedBy } }
    let _store = {};
    let _firebaseRef = null;
    let _saveTimer = null;

    function _normalizePhone(phone) {
        if (!phone) return '';
        let p = String(phone)
            .replace(/[\s\-()+]/g, '')
            .trim();
        if (p.startsWith('84') && p.length >= 11) p = '0' + p.substring(2);
        return p;
    }

    function _load() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) _store = JSON.parse(raw) || {};
        } catch (e) {
            _store = {};
        }
    }

    function _saveLocal() {
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
            try {
                localStorage.setItem(LS_KEY, JSON.stringify(_store));
            } catch (e) {}
        }, 300);
    }

    function _setupFirebaseSync() {
        try {
            if (typeof firebase === 'undefined' || !firebase.database) return;
            _firebaseRef = firebase.database().ref(FB_PATH);
            // Listener: merge remote → local on any update
            _firebaseRef.on('value', (snap) => {
                const remote = snap.val() || {};
                let changed = false;
                for (const [phone, data] of Object.entries(remote)) {
                    if (!data) continue;
                    const local = _store[phone];
                    // Last-write-wins by updatedAt
                    if (!local || (data.updatedAt || 0) > (local.updatedAt || 0)) {
                        _store[phone] = data;
                        changed = true;
                    }
                }
                if (changed) {
                    _saveLocal();
                    _broadcastChange();
                }
            });
            console.log('[CUSTOMER-PREFS] Firebase sync attached');
        } catch (e) {
            console.warn('[CUSTOMER-PREFS] Firebase sync failed (offline ok):', e?.message);
        }
    }

    function _emitFirebase(phone, data) {
        try {
            if (!_firebaseRef) return;
            _firebaseRef
                .child(phone)
                .set(data)
                .catch(() => {});
        } catch (e) {}
    }

    function _broadcastChange() {
        try {
            window.dispatchEvent(
                new CustomEvent('customerPrefsChanged', { detail: { store: _store } })
            );
        } catch (e) {}
    }

    function _getCurrentUser() {
        try {
            return window.authManager?.getAuthState?.()?.displayName || 'Unknown';
        } catch (e) {
            return 'Unknown';
        }
    }

    // ===== Public API =====

    // DEPRECATED: nickname giờ source-of-truth = TPOS Partner.Name (parse suffix
    // " - X" từ order.Name trong allData). API này giữ no-op để tránh break
    // legacy callers, nhưng KHÔNG còn persist nickname riêng.
    function getNickname() {
        return '';
    }
    function setNickname() {}

    function isDoNotCall(phone) {
        const k = _normalizePhone(phone);
        return !!_store[k]?.doNotCall;
    }

    function setDoNotCall(phone, doNotCall) {
        const k = _normalizePhone(phone);
        if (!k) return;
        const existing = _store[k] || {};
        const data = {
            ...existing,
            doNotCall: !!doNotCall,
            updatedAt: Date.now(),
            updatedBy: _getCurrentUser(),
        };
        _store[k] = data;
        _saveLocal();
        _emitFirebase(k, data);
        _broadcastChange();
    }

    function getAll() {
        return JSON.parse(JSON.stringify(_store));
    }

    // DEPRECATED: TPOS Partner.Name là source of truth. Bảng render `order.Name`
    // thẳng. Hàm này giữ no-op trả về fallbackName cho legacy callers.
    function getDisplayName(_phone, fallbackName) {
        return fallbackName || '';
    }

    // ===== Init =====

    _load();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _setupFirebaseSync);
    } else {
        _setupFirebaseSync();
    }

    window.CustomerPrefs = {
        getNickname,
        setNickname,
        isDoNotCall,
        setDoNotCall,
        getAll,
        getDisplayName,
        _normalizePhone,
    };
})();
