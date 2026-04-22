// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// TAB1 FILTER PERSISTENCE (IndexedDB, per-account)
// =====================================================
// Persists tab1 filters to IndexedDB scoped per logged-in user so that
// hard reload (Cmd+Shift+R) restores the exact filter state.
//
// Filters covered:
//   - Search input (tableSearchInput)              -- TTL 30 min idle
//   - conversationFilter / statusFilter / fulfillmentFilter <select>
//   - TAG filter (orderTableSelectedTags)
//   - Excluded TAG filter (orderTableExcludedTags)
//   - Chốt Đơn / Tag XL: ProcessingTagState._activeFilter + _activeFlagFilters
//   - Chốt Đơn panel pinned state
//   - "Lọc theo ngày" (dateModeToggle) toggle state
//
// Storage: window.indexedDBStorage (DB "N2StoreDB", store "key_value_store")
// Key shape: tab1_filters_v1__<userIdentifier>
//
// Migration: on first load (no IDB entry exists), reads existing localStorage
// keys and seeds the IDB snapshot. After 7 days the legacy LS keys are removed.
// =====================================================

(function () {
    const KEY_PREFIX = 'tab1_filters_v1__';
    const SAVE_DEBOUNCE_MS = 400;
    const SEARCH_TTL_MS = 30 * 60 * 1000;            // 30 minutes idle → drop search query
    const LS_CLEANUP_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days → remove legacy LS keys

    // Legacy localStorage keys we migrate from / clean up later
    const LEGACY_LS_KEYS = [
        'orderTableSelectedTags',
        'orderTableExcludedTags',
        'ptag_active_filter_v1',
        'ptag_active_flag_filters_v1',
        'ptag_panel_pinned',
    ];
    // Global flag (in localStorage) so only the FIRST user on this browser
    // seeds their snapshot from legacy LS. Subsequent accounts start clean,
    // ensuring true per-account isolation. Removed when LS cleanup runs.
    const MIGRATION_MARKER_LS = 'tab1_filter_persist_migrated_at';

    // ---------- helpers ----------

    function _userIdentifier() {
        try {
            const auth = window.authManager?.getAuthState?.() || window.authManager?.getAuthData?.();
            if (auth) {
                if (auth.userType) {
                    return auth.userType.includes('-') ? auth.userType.split('-')[0] : auth.userType;
                }
                if (auth.username) return auth.username;
                if (auth.uid) return auth.uid;
            }
        } catch (e) { /* ignore */ }
        return 'guest';
    }

    function _key() { return KEY_PREFIX + _userIdentifier(); }

    function _idbReady() {
        return !!(window.indexedDBStorage && typeof window.indexedDBStorage.setItem === 'function');
    }

    async function _idbGet(key) {
        if (!_idbReady()) return null;
        try { return await window.indexedDBStorage.getItem(key); } catch (e) { return null; }
    }
    async function _idbSet(key, value) {
        if (!_idbReady()) return false;
        try { await window.indexedDBStorage.setItem(key, value); return true; } catch (e) { return false; }
    }

    // ---------- snapshot collection ----------

    function _getSelectValue(id) {
        const el = document.getElementById(id);
        return el ? el.value : null;
    }

    function _collect() {
        const ptagState = window.ProcessingTagState || {};
        const activeFlagFilters = ptagState._activeFlagFilters instanceof Set
            ? [...ptagState._activeFlagFilters]
            : Array.isArray(ptagState._activeFlagFilters) ? ptagState._activeFlagFilters : [];

        const dateModeToggle = document.getElementById('dateModeToggle');

        return {
            v: 1,
            savedAt: Date.now(),
            search: {
                query: (typeof window.searchQuery === 'string' && window.searchQuery)
                    || (document.getElementById('tableSearchInput')?.value || ''),
                savedAt: Date.now(),
            },
            selects: {
                conversationFilter: _getSelectValue('conversationFilter'),
                statusFilter: _getSelectValue('statusFilter'),
                fulfillmentFilter: _getSelectValue('fulfillmentFilter'),
            },
            tags: {
                selected: (typeof window.getSelectedTagFilters === 'function' && window.getSelectedTagFilters()) || [],
                excluded: (typeof window.getExcludedTagFilters === 'function' && window.getExcludedTagFilters()) || [],
            },
            ptag: {
                activeFilter: ptagState._activeFilter ?? null,
                activeFlagFilters,
                panelPinned: !!ptagState._panelPinned,
                excluded: (typeof window.getExcludedPtagXlFilters === 'function' && window.getExcludedPtagXlFilters()) || [],
            },
            dateFilter: {
                enabled: dateModeToggle ? !!dateModeToggle.checked : null,
            },
        };
    }

    // ---------- snapshot apply ----------

    function _setSelectValue(id, value) {
        if (value == null) return false;
        const el = document.getElementById(id);
        if (!el) return false;
        // Only set if option exists, otherwise leave default
        const hasOption = Array.from(el.options || []).some(o => o.value === value);
        if (!hasOption) return false;
        el.value = value;
        return true;
    }

    function _applySnapshot(snap) {
        if (!snap || typeof snap !== 'object') return;

        // 1) Search query (with TTL)
        try {
            const s = snap.search || {};
            // Search query is now persisted indefinitely across refreshes
            // (TTL removed per user request — only cleared explicitly via the X button)
            if (s.query) {
                const input = document.getElementById('tableSearchInput');
                if (input) input.value = s.query;
                if (typeof window.searchQuery !== 'undefined') {
                    try { window.searchQuery = String(s.query).toLowerCase(); } catch (e) {}
                }
                const clearBtn = document.getElementById('searchClearBtn');
                if (clearBtn) clearBtn.classList.toggle('active', !!s.query);
            }
        } catch (e) { console.warn('[FILTER-PERSIST] apply search err:', e); }

        // 2) Select dropdowns
        try {
            const sel = snap.selects || {};
            _setSelectValue('conversationFilter', sel.conversationFilter);
            _setSelectValue('statusFilter', sel.statusFilter);
            _setSelectValue('fulfillmentFilter', sel.fulfillmentFilter);
        } catch (e) { console.warn('[FILTER-PERSIST] apply selects err:', e); }

        // 3) TAG filters: write through to localStorage so existing getters return them
        try {
            const t = snap.tags || {};
            if (Array.isArray(t.selected)) {
                localStorage.setItem('orderTableSelectedTags', JSON.stringify(t.selected));
            }
            if (Array.isArray(t.excluded)) {
                localStorage.setItem('orderTableExcludedTags', JSON.stringify(t.excluded));
            }
        } catch (e) { console.warn('[FILTER-PERSIST] apply tags err:', e); }

        // 4) Chốt Đơn / Tag XL state — restore into ProcessingTagState if present,
        //    otherwise mirror into localStorage so the IIFE picks it up on init.
        try {
            const p = snap.ptag || {};
            // Mirror to LS first (so the ProcessingTagState IIFE getters that read LS at startup work)
            if (p.activeFilter == null) {
                localStorage.removeItem('ptag_active_filter_v1');
            } else {
                localStorage.setItem('ptag_active_filter_v1', String(p.activeFilter));
            }
            if (Array.isArray(p.activeFlagFilters)) {
                localStorage.setItem('ptag_active_flag_filters_v1', JSON.stringify(p.activeFlagFilters));
            }
            localStorage.setItem('ptag_panel_pinned', JSON.stringify(!!p.panelPinned));

            if (Array.isArray(p.excluded)) {
                localStorage.setItem('orderTableExcludedPtagXl', JSON.stringify(p.excluded));
            }

            // If state object already exists, also patch it in-memory (it has been initialized
            // earlier from LS, so this is mostly idempotent — kept for safety on hot reload).
            if (window.ProcessingTagState) {
                window.ProcessingTagState._activeFilter = p.activeFilter ?? null;
                window.ProcessingTagState._activeFlagFilters = new Set(
                    Array.isArray(p.activeFlagFilters) ? p.activeFlagFilters : []
                );
                window.ProcessingTagState._panelPinned = !!p.panelPinned;
            }
        } catch (e) { console.warn('[FILTER-PERSIST] apply ptag err:', e); }

        // 5) "Lọc theo ngày" toggle
        try {
            const d = snap.dateFilter || {};
            if (typeof d.enabled === 'boolean') {
                const cb = document.getElementById('dateModeToggle');
                if (cb && cb.checked !== d.enabled) cb.checked = d.enabled;
            }
        } catch (e) { /* optional element */ }
    }

    // ---------- migration from legacy localStorage ----------

    function _readLegacyLSAsSnapshot() {
        const lsGet = (k, def) => {
            try { const v = localStorage.getItem(k); return v == null ? def : v; }
            catch (e) { return def; }
        };
        const json = (k, def) => {
            try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
            catch (e) { return def; }
        };

        return {
            v: 1,
            savedAt: Date.now(),
            migratedAt: Date.now(),
            search: { query: '', savedAt: 0 }, // memory-only previously → nothing to migrate
            selects: {
                conversationFilter: null,
                statusFilter: null,
                fulfillmentFilter: null,
            },
            tags: {
                selected: json('orderTableSelectedTags', []),
                excluded: json('orderTableExcludedTags', []),
            },
            ptag: {
                activeFilter: (function () {
                    const v = lsGet('ptag_active_filter_v1', null);
                    return v && v !== 'null' ? v : null;
                })(),
                activeFlagFilters: json('ptag_active_flag_filters_v1', []),
                panelPinned: json('ptag_panel_pinned', false),
                excluded: json('orderTableExcludedPtagXl', []),
            },
            dateFilter: { enabled: null },
        };
    }

    async function _maybeCleanupLegacyLS(snap) {
        if (!snap || !snap.migratedAt) return;
        if ((Date.now() - snap.migratedAt) < LS_CLEANUP_AFTER_MS) return;
        if (snap._lsCleanedUp) return;
        try {
            for (const k of LEGACY_LS_KEYS) localStorage.removeItem(k);
            localStorage.removeItem(MIGRATION_MARKER_LS);
            snap._lsCleanedUp = true;
            await _idbSet(_key(), snap);
            console.log('[FILTER-PERSIST] Legacy localStorage keys cleaned up after 7 days');
        } catch (e) { console.warn('[FILTER-PERSIST] LS cleanup error:', e); }
    }

    // ---------- public API ----------

    let _saveTimer = null;
    let _ready = false;

    function scheduleSave() {
        if (!_ready) return; // do not save before init has applied previous snapshot
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(async () => {
            const snap = _collect();
            // Preserve migration metadata if present
            try {
                const existing = await _idbGet(_key());
                if (existing && existing.migratedAt) snap.migratedAt = existing.migratedAt;
                if (existing && existing._lsCleanedUp) snap._lsCleanedUp = true;
            } catch (e) {}
            await _idbSet(_key(), snap);
        }, SAVE_DEBOUNCE_MS);
    }

    async function init() {
        try {
            // Wait for IndexedDB to be ready
            if (window.indexedDBStorage?.readyPromise) {
                try { await window.indexedDBStorage.readyPromise; } catch (e) {}
            }
            if (!_idbReady()) {
                console.warn('[FILTER-PERSIST] IndexedDB not available — disabled');
                _ready = true; // still mark ready so saves are no-ops without spamming
                return;
            }

            const key = _key();
            let snap = await _idbGet(key);

            // First-run migration — only the FIRST account on this browser inherits
            // legacy localStorage filters. Subsequent accounts get a clean snapshot
            // so per-account isolation is preserved.
            if (!snap) {
                const alreadyMigrated = !!localStorage.getItem(MIGRATION_MARKER_LS);
                if (!alreadyMigrated) {
                    snap = _readLegacyLSAsSnapshot();
                    try { localStorage.setItem(MIGRATION_MARKER_LS, String(Date.now())); } catch (e) {}
                    console.log('[FILTER-PERSIST] Migrated legacy LS filters into IndexedDB (first account)');
                } else {
                    snap = {
                        v: 1,
                        savedAt: Date.now(),
                        migratedAt: parseInt(localStorage.getItem(MIGRATION_MARKER_LS), 10) || Date.now(),
                        search: { query: '', savedAt: 0 },
                        selects: { conversationFilter: null, statusFilter: null, fulfillmentFilter: null },
                        tags: { selected: [], excluded: [] },
                        ptag: { activeFilter: null, activeFlagFilters: [], panelPinned: false },
                        dateFilter: { enabled: null },
                    };
                    console.log('[FILTER-PERSIST] Fresh snapshot (account has no prior IDB data)');
                }
                await _idbSet(key, snap);
            }

            _applySnapshot(snap);
            await _maybeCleanupLegacyLS(snap);
            _ready = true;
            console.log('[FILTER-PERSIST] ✅ Initialized for user:', _userIdentifier());
        } catch (e) {
            console.error('[FILTER-PERSIST] init error:', e);
            _ready = true;
        }
    }

    window.FilterPersistence = {
        init,
        scheduleSave,
        _collect,
        _applySnapshot,
        _key,
    };
})();
