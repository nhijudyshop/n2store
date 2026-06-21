// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — Sync sub-system (server load + SSE + push). Tách từ
// so-order-storage.js (2026-06-19, MOVE-only). Gắn `window.SoOrderStorage.Sync`.
//
// LOAD ORDER: file này PHẢI load SAU so-order-storage.js (data layer) — nó
// truy cập data-layer internal qua `SoOrderStorage._internal` (getStore /
// getCachedState / setCachedState) và gắn `.Sync` lên `window.SoOrderStorage`.
//
// -----------------------------------------------------------
// Firestore sync layer — independent of the localStorage CRUD
// (data layer) so the page works offline. Doc: `web2_so_order/main`.
// -----------------------------------------------------------
//
// C8 (2026-06-13): Sync layer chuyển từ Firestore → Postgres web2Db
// (`/api/web2-so-order`). GIỮ NGUYÊN 5 method public
// (init/pullOnce/pushToFirestore/flush/teardown) → so-order-app.js KHÔNG đổi.
// Cải thiện: single source Postgres, optimistic concurrency qua `version`
// (hết last-write-wins — ghi đè stale → 409 báo conflict), auth (enforce),
// SSE `web2:so-order` realtime push (thay pull-on-focus đơn thuần).
// Migration 1 LẦN: server rỗng + Firestore còn data → copy lên server.

(function () {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const SoOrderStorage = root.SoOrderStorage;
    if (!SoOrderStorage || !SoOrderStorage._internal) {
        console.error(
            '[SoOrderStorage.Sync] so-order-storage.js chưa load — sync layer bị bỏ qua.'
        );
        return;
    }
    const _internal = SoOrderStorage._internal;
    const _getStore = _internal.getStore;

    const SO_API_BASE =
        (typeof window !== 'undefined' &&
            (window.API_CONFIG?.WORKER_URL || window.LiveState?.workerUrl)) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const PUSH_DEBOUNCE_MS = 400;

    function _soAuthHeaders(extra) {
        const h = { 'Content-Type': 'application/json', ...(extra || {}) };
        try {
            if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(h);
            const t = JSON.parse(localStorage.getItem('web2_auth') || '{}')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* ignore */
        }
        return h;
    }

    const Sync = {
        _onRemoteUpdate: null,
        _onConflict: null,
        _localLastUpdated: 0,
        _localVersion: 0, // optimistic concurrency token (server bump mỗi save)
        _pushTimer: null,
        _pendingState: null,
        _sseUnsub: null,

        async init(onRemoteUpdate, onConflict) {
            this._onRemoteUpdate = onRemoteUpdate || null;
            this._onConflict = onConflict || null;
            try {
                const loaded = await this._loadFromServer();
                if (loaded && !loaded.empty) {
                    _internal.setCachedState(loaded.data);
                    const store = _getStore();
                    if (store) await store.set(loaded.data);
                    this._localLastUpdated = loaded.lastUpdated || 0;
                    this._localVersion = loaded.version || 0;
                }
                // C8-cleanup (2026-06-13): bỏ migration Firestore (đã migrate xong;
                // server Postgres là nguồn chuẩn). Server rỗng → dùng state mặc định.
                this._subscribeSSE();
                return true;
            } catch (e) {
                console.warn('[SoOrderStorage.Sync] init failed:', e.message);
                return false;
            }
        },

        async _loadFromServer() {
            try {
                const r = await fetch(`${SO_API_BASE}/api/web2-so-order/get`, {
                    headers: _soAuthHeaders(),
                });
                if (!r.ok) return null;
                const j = await r.json();
                if (!j || !j.success) return null;
                if (j.empty || !j.data) return { empty: true };
                return {
                    data: j.data,
                    lastUpdated: j.lastUpdated || 0,
                    version: j.version || 0,
                };
            } catch (e) {
                console.warn('[SoOrderStorage.Sync] load failed:', e.message);
                return null;
            }
        },

        _subscribeSSE() {
            try {
                if (this._sseUnsub || !window.Web2SSE || !window.Web2SSE.subscribe) return;
                this._sseUnsub = window.Web2SSE.subscribe('web2:so-order', (evt) => {
                    // Bỏ qua event do chính mình vừa ghi (version <= local).
                    const v = Number(evt && evt.data && evt.data.version) || 0;
                    if (v && v <= this._localVersion) return;
                    this.pullOnce();
                });
            } catch {
                /* ignore */
            }
        },

        // Pull latest from server (SSE remote change / visibilitychange/focus).
        // Áp dụng chỉ khi server version > local (không đè local edit in-flight).
        async pullOnce() {
            const loaded = await this._loadFromServer();
            if (!loaded || loaded.empty) return false;
            if ((loaded.version || 0) <= this._localVersion) return false;
            // Server mới hơn. Có local pending push HOẶC edit chưa lưu (_pendingState
            // còn sau 409) → conflict thay vì đè (audit r7: thêm _pendingState để edit
            // giữ-sau-409 không bị tab-focus pullOnce ghi đè mất).
            if ((this._pushTimer || this._pendingState) && this._onConflict) {
                // BẢO THỦ: hủy timer debounce để KHÔNG auto-push đè stale (push đó
                // chắc chắn 409 vì baseVersion đã cũ — vừa lãng phí vừa gây
                // double-notify). GIỮ NGUYÊN _pendingState: edit chưa lưu của user
                // không bị mất — conflictHandler chỉ cảnh báo (không rebase/merge),
                // user tự quyết refresh hay giữ. Mutation kế tiếp sẽ re-arm timer
                // (vì _pushTimer=null) và flush _pendingState với version mới.
                clearTimeout(this._pushTimer);
                this._pushTimer = null;
                this._onConflict({ data: loaded.data, lastUpdated: loaded.lastUpdated });
                return false;
            }
            this._localVersion = loaded.version || 0;
            this._localLastUpdated = loaded.lastUpdated || 0;
            _internal.setCachedState(loaded.data);
            const store = _getStore();
            if (store) await store.set(loaded.data);
            if (this._onRemoteUpdate) this._onRemoteUpdate(loaded.data);
            return true;
        },

        // Debounced push (giữ TÊN pushToFirestore — giờ ghi Postgres). Gom mutation
        // liên tiếp thành 1 write sau PUSH_DEBOUNCE_MS.
        pushToFirestore(state) {
            this._pendingState = state;
            if (this._pushTimer) return true;
            this._pushTimer = setTimeout(() => {
                this._pushTimer = null;
                this._flushPending();
            }, PUSH_DEBOUNCE_MS);
            return true;
        },

        async _flushPending() {
            if (!this._pendingState) return;
            const stateSnapshot = this._pendingState;
            this._pendingState = null;
            try {
                const r = await fetch(`${SO_API_BASE}/api/web2-so-order/save`, {
                    method: 'POST',
                    headers: _soAuthHeaders(),
                    body: JSON.stringify({
                        data: stateSnapshot,
                        baseVersion: this._localVersion,
                    }),
                });
                const j = await r.json().catch(() => ({}));
                if (j && j.success) {
                    this._localVersion = j.version || this._localVersion + 1;
                    this._localLastUpdated = j.lastUpdated || Date.now();
                } else if (r.status === 409 && j && j.conflict && j.server) {
                    // Máy khác vừa ghi giữa chừng → cập nhật version + báo conflict
                    // (giữ behavior cũ: user chọn refresh / giữ chỉnh sửa). Lần push
                    // kế tiếp dùng version mới → thắng (last-writer sau khi user biết).
                    this._localVersion = j.server.version || this._localVersion;
                    this._localLastUpdated = j.server.lastUpdated || this._localLastUpdated;
                    // audit r7: KHÔI PHỤC _pendingState — trước đây edit của user bị
                    // null ở đầu hàm rồi DROP luôn ở nhánh 409 → mất trắng (pullOnce
                    // tab-focus sau đó đè SO.state vì _pushTimer=null). Giữ lại để
                    // mutation kế tiếp flush với version mới; pullOnce nay cũng guard
                    // theo _pendingState nên KHÔNG đè khi còn edit chưa lưu.
                    this._pendingState = stateSnapshot;
                    if (this._onConflict)
                        this._onConflict({
                            data: j.server.data,
                            lastUpdated: j.server.lastUpdated,
                        });
                } else {
                    console.warn('[SoOrderStorage.Sync] push failed:', (j && j.error) || r.status);
                }
            } catch (e) {
                console.warn('[SoOrderStorage.Sync] push failed:', e.message);
            }
        },

        // Force-flush pending debounced write (visibilitychange→hidden / beforeunload).
        async flush() {
            if (!this._pushTimer) return;
            clearTimeout(this._pushTimer);
            this._pushTimer = null;
            await this._flushPending();
        },

        teardown() {
            if (this._pushTimer) {
                clearTimeout(this._pushTimer);
                this._pushTimer = null;
            }
            if (this._sseUnsub) {
                try {
                    this._sseUnsub();
                } catch {
                    /* ignore */
                }
                this._sseUnsub = null;
            }
        },
    };

    SoOrderStorage.Sync = Sync;
})();
