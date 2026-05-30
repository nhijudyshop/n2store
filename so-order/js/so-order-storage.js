// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Sổ Order — localStorage persistence + Firestore sync.
//
// Schema (localStorage key = `soOrder_v1`, Firestore doc = `web2_so_order/main`):
//   {
//     tabs: [
//       {
//         id, label, currency, rate, footer: {discount, shipping},
//         columnVisibility: { supplier: true, stt: true, ... },  // PER-TAB
//         shipments: [
//           { id, date (YYYY-MM-DD), batch, caseCount, weightKg,
//             contractAmount, contractCurrency, collapsed (bool),
//             rows: [...] },
//           ...
//         ],
//       },
//       ...
//     ],
//     activeTabId: string,
//   }
//
// Rows shape:
//   { id, supplier, productName, variant, qty, sellPrice, costPrice,
//     productImage, invoiceImage, note, costNote, status,
//     createdAt, updatedAt }
//
// `note` = GHI CHÚ (sales-side); `costNote` = GHI CHÚ CP (cost/purchasing-side).
//
// Sync model — local-first (so-order only — không áp dụng cho web2-products,
// orders-report, ...):
//   1. Load Firestore lần đầu khi init → seed localStorage + state
//   2. Mọi mutation → write localStorage ngay, push Firestore async (debounced)
//   3. KHÔNG dùng onSnapshot — tránh re-render khi local writes echo về
//   4. Cross-device pull qua `pullOnce()` được gọi trên visibilitychange/focus
//   5. Trước khi tab ẩn / unload → flush() pending debounced write
//
// Tradeoff: nếu máy A và máy B cùng mở so-order, sửa ở A → B phải switch tab
// hoặc refresh để pull. Chấp nhận được vì Sổ Order là tài liệu edit tuần tự
// (không phải chat realtime). Lý do drop realtime: onSnapshot fire trên local
// pending writes → mất focus input/dropdown trên mỗi mutation → UI giật.

(function () {
    'use strict';

    const STORAGE_KEY = 'soOrder_v1';

    const DEFAULT_COLUMNS = {
        supplier: true,
        stt: true,
        productName: true,
        variant: true,
        qty: true,
        sellPrice: true,
        costPrice: true,
        productImage: true,
        invoiceImage: true,
        note: true,
        costNote: true,
        status: true,
        actions: true,
    };

    function _mkId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function _defaultState() {
        return {
            tabs: [
                {
                    id: 'hanoi',
                    label: 'HÀ NỘI',
                    currency: 'VND',
                    rate: 1,
                    footer: { discount: 0, shipping: 0 },
                    columnVisibility: { ...DEFAULT_COLUMNS },
                    shipments: [],
                },
                {
                    id: 'huongchau',
                    label: 'HƯƠNG CHÂU',
                    currency: 'CNY',
                    rate: 3500,
                    footer: { discount: 0, shipping: 0 },
                    columnVisibility: { ...DEFAULT_COLUMNS },
                    shipments: [],
                },
            ],
            activeTabId: 'hanoi',
        };
    }

    function _migrateTab(tab, globalColumnVisibility) {
        // Legacy flat `rows[]` → one synthetic shipment so the UI can
        // show old data without losing it.
        if (!Array.isArray(tab.shipments)) tab.shipments = [];
        if (Array.isArray(tab.rows) && tab.rows.length) {
            tab.shipments.push({
                id: _mkId(),
                date: new Date().toISOString().slice(0, 10),
                batch: '',
                caseCount: 0,
                weightKg: 0,
                contractAmount: 0,
                contractCurrency: tab.currency || 'VND',
                collapsed: false,
                rows: tab.rows,
            });
            delete tab.rows;
        }
        // Per-tab column visibility: seed from old top-level setting if
        // user had configured one before this migration, else default.
        if (!tab.columnVisibility) {
            tab.columnVisibility = { ...DEFAULT_COLUMNS, ...(globalColumnVisibility || {}) };
        } else {
            tab.columnVisibility = { ...DEFAULT_COLUMNS, ...tab.columnVisibility };
        }
        // Heal shipment shape
        for (const sh of tab.shipments) {
            if (!Array.isArray(sh.rows)) sh.rows = [];
            if (sh.collapsed == null) sh.collapsed = false;
            if (!sh.date) sh.date = new Date().toISOString().slice(0, 10);
            if (!sh.contractCurrency) sh.contractCurrency = tab.currency || 'VND';
            // P1 2026-05-30: backfill invoiceGroupId cho rows cũ chưa có.
            // Gộp các rows kế nhau cùng supplier (heuristic: nhiều khả năng
            // được tạo cùng 1 đợt) → 1 group. Đổi supplier → group mới.
            let lastSupplier = null;
            let curGroup = null;
            for (const r of sh.rows) {
                if (r.invoiceGroupId) {
                    lastSupplier = r.supplier || '';
                    curGroup = r.invoiceGroupId;
                    continue;
                }
                const supplier = r.supplier || '';
                if (supplier !== lastSupplier || !curGroup) {
                    curGroup = _mkId();
                    lastSupplier = supplier;
                }
                r.invoiceGroupId = curGroup;
            }
        }
        // First-visit default: collapse every shipment except the newest
        // (sort by date desc, keep first one expanded). Subsequent loads
        // skip this branch because `uiInitialized` is true. Toggles by
        // the user during the session are preserved across reloads.
        if (!tab.uiInitialized && tab.shipments.length > 0) {
            const sorted = [...tab.shipments].sort((a, b) =>
                String(b.date).localeCompare(String(a.date))
            );
            const newestId = sorted[0].id;
            for (const sh of tab.shipments) sh.collapsed = sh.id !== newestId;
            tab.uiInitialized = true;
        } else if (!tab.uiInitialized) {
            // Tab has zero shipments — still flip the flag so the first
            // shipment user adds isn't retroactively auto-collapsed.
            tab.uiInitialized = true;
        }
    }

    function _read() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return _defaultState();
            const data = JSON.parse(raw);
            // Heal partials so the rest of the app never has to null-check
            if (!Array.isArray(data.tabs) || !data.tabs.length) data.tabs = _defaultState().tabs;
            if (!data.activeTabId || !data.tabs.find((t) => t.id === data.activeTabId)) {
                data.activeTabId = data.tabs[0].id;
            }
            const globalColVis = data.columnVisibility; // legacy top-level
            let mutated = false;
            for (const tab of data.tabs) {
                if (!tab.footer) tab.footer = { discount: 0, shipping: 0 };
                const before = JSON.stringify({ ui: tab.uiInitialized, c: tab.columnVisibility });
                _migrateTab(tab, globalColVis);
                const after = JSON.stringify({ ui: tab.uiInitialized, c: tab.columnVisibility });
                if (before !== after) mutated = true;
            }
            if (data.columnVisibility) {
                mutated = true;
                delete data.columnVisibility;
            }
            // Persist migration so the auto-collapse-on-first-visit only
            // runs once and uiInitialized stays true across reloads.
            if (mutated) _write(data);
            return data;
        } catch (e) {
            console.warn('[SoOrderStorage] read failed:', e.message);
            return _defaultState();
        }
    }

    function _write(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            return true;
        } catch (e) {
            console.error('[SoOrderStorage] write failed:', e.message);
            return false;
        }
    }

    // ------ PUBLIC API ------

    const SoOrderStorage = {
        load() {
            return _read();
        },

        save(state) {
            return _write(state);
        },

        getActiveTab(state) {
            return state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
        },

        setActiveTab(state, tabId) {
            if (state.tabs.find((t) => t.id === tabId)) {
                state.activeTabId = tabId;
                _write(state);
            }
            return state;
        },

        addTab(state, { label, currency, rate }) {
            const id = _mkId();
            state.tabs.push({
                id,
                label: label || 'Tab mới',
                currency: currency || 'VND',
                rate: Number(rate) || 1,
                footer: { discount: 0, shipping: 0 },
                shipments: [],
            });
            state.activeTabId = id;
            _write(state);
            return id;
        },

        // ------ SHIPMENTS ------

        // Find a shipment by date+batch (both must match). Used to
        // auto-group new rows into existing shipments when the user
        // re-enters the same NGÀY + ĐỢT.
        findShipment(tab, { date, batch }) {
            const d = String(date || '').trim();
            const b = String(batch || '').trim();
            return tab.shipments.find((s) => String(s.date) === d && String(s.batch || '') === b);
        },

        addShipment(state, tabId, meta) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return null;
            const sh = {
                id: _mkId(),
                date: meta.date || new Date().toISOString().slice(0, 10),
                batch: meta.batch || '',
                caseCount: Number(meta.caseCount) || 0,
                weightKg: Number(meta.weightKg) || 0,
                contractAmount: Number(meta.contractAmount) || 0,
                contractCurrency: meta.contractCurrency || tab.currency || 'VND',
                // P1 2026-05-29: ETA (Expected Delivery Date). Hiển thị badge
                // "📦 còn N ngày" / "⚠️ quá hạn" trên shipment header. Nullable.
                expectedDeliveryDate: meta.expectedDeliveryDate || null,
                collapsed: false,
                rows: [],
            };
            tab.shipments.push(sh);
            _write(state);
            return sh;
        },

        updateShipment(state, tabId, shipmentId, patch) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            if (!sh) return false;
            if (patch.date !== undefined) sh.date = patch.date;
            if (patch.batch !== undefined) sh.batch = patch.batch;
            if (patch.caseCount !== undefined) sh.caseCount = Number(patch.caseCount) || 0;
            if (patch.weightKg !== undefined) sh.weightKg = Number(patch.weightKg) || 0;
            if (patch.contractAmount !== undefined)
                sh.contractAmount = Number(patch.contractAmount) || 0;
            if (patch.contractCurrency !== undefined) sh.contractCurrency = patch.contractCurrency;
            if (patch.expectedDeliveryDate !== undefined)
                sh.expectedDeliveryDate = patch.expectedDeliveryDate || null;
            if (patch.collapsed !== undefined) sh.collapsed = !!patch.collapsed;
            _write(state);
            return true;
        },

        deleteShipment(state, tabId, shipmentId) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            tab.shipments = tab.shipments.filter((s) => s.id !== shipmentId);
            _write(state);
            return true;
        },

        updateTab(state, tabId, patch) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            if (patch.label !== undefined) tab.label = patch.label;
            if (patch.currency !== undefined) tab.currency = patch.currency;
            if (patch.rate !== undefined) tab.rate = Number(patch.rate) || 1;
            _write(state);
            return true;
        },

        deleteTab(state, tabId) {
            if (state.tabs.length <= 1) return false; // keep at least 1
            state.tabs = state.tabs.filter((t) => t.id !== tabId);
            if (state.activeTabId === tabId) state.activeTabId = state.tabs[0].id;
            _write(state);
            return true;
        },

        addRow(state, tabId, shipmentId, rowData) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return null;
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            if (!sh) return null;
            const now = Date.now();
            const row = {
                id: _mkId(),
                // P1 2026-05-30: invoiceGroupId nhóm các rows tạo cùng 1 lần
                // (1 modal submit) → share invoiceImage + render cell merged
                // (rowspan). Nếu caller không pass → tạo group mới riêng cho
                // row này.
                invoiceGroupId: rowData.invoiceGroupId || _mkId(),
                supplier: rowData.supplier || '',
                productName: rowData.productName || '',
                variant: rowData.variant || '',
                qty: Number(rowData.qty) || 0,
                sellPrice: Number(rowData.sellPrice) || 0,
                costPrice: Number(rowData.costPrice) || 0,
                productImage: rowData.productImage || '',
                invoiceImage: rowData.invoiceImage || '',
                note: rowData.note || '',
                costNote: rowData.costNote || '',
                status: rowData.status || 'draft',
                createdAt: now,
                updatedAt: now,
            };
            sh.rows.push(row);
            _write(state);
            return row;
        },

        // P1 2026-05-30: helper update invoiceImage cho toàn bộ rows cùng
        // invoiceGroupId trong shipment — dùng khi user dán ảnh vào 1 cell
        // merged. Trả về số rows được update.
        updateInvoiceImageForGroup(state, tabId, shipmentId, invoiceGroupId, imageUrl) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return 0;
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            if (!sh) return 0;
            let n = 0;
            const now = Date.now();
            for (const r of sh.rows) {
                if (r.invoiceGroupId === invoiceGroupId) {
                    r.invoiceImage = imageUrl || '';
                    r.updatedAt = now;
                    n++;
                }
            }
            if (n) _write(state);
            return n;
        },

        updateRow(state, tabId, shipmentId, rowId, patch) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            if (!sh) return false;
            const row = sh.rows.find((r) => r.id === rowId);
            if (!row) return false;
            Object.assign(row, patch, { updatedAt: Date.now() });
            _write(state);
            return true;
        },

        deleteRow(state, tabId, shipmentId, rowId) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            if (!sh) return false;
            sh.rows = sh.rows.filter((r) => r.id !== rowId);
            _write(state);
            return true;
        },

        moveRow(state, tabId, fromShipmentId, toShipmentId, rowId) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            const from = tab.shipments.find((s) => s.id === fromShipmentId);
            const to = tab.shipments.find((s) => s.id === toShipmentId);
            if (!from || !to) return false;
            const row = from.rows.find((r) => r.id === rowId);
            if (!row) return false;
            from.rows = from.rows.filter((r) => r.id !== rowId);
            to.rows.push(row);
            _write(state);
            return true;
        },

        updateFooter(state, tabId, patch) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            tab.footer = { ...tab.footer, ...patch };
            _write(state);
            return true;
        },

        setColumnVisibility(state, tabId, columnKey, visible) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            if (!tab.columnVisibility) tab.columnVisibility = { ...DEFAULT_COLUMNS };
            tab.columnVisibility[columnKey] = !!visible;
            _write(state);
            return true;
        },

        getColumnVisibility(tab) {
            return {
                ...DEFAULT_COLUMNS,
                ...(tab && tab.columnVisibility ? tab.columnVisibility : {}),
            };
        },

        DEFAULT_COLUMNS,
    };

    // -----------------------------------------------------------
    // Firestore sync layer — independent of the localStorage CRUD
    // above so the page works offline. Doc: `web2_so_order/main`.
    // -----------------------------------------------------------

    const FIRESTORE_COLLECTION = 'web2_so_order';
    const FIRESTORE_DOC = 'main';

    const PUSH_DEBOUNCE_MS = 400;

    const Sync = {
        _db: null,
        _onRemoteUpdate: null,
        _localLastUpdated: 0,
        _pushTimer: null,
        _pendingState: null,
        _onConflict: null,

        async init(onRemoteUpdate, onConflict) {
            this._onRemoteUpdate = onRemoteUpdate || null;
            this._onConflict = onConflict || null;
            try {
                if (typeof firebase === 'undefined' || !firebase.firestore) {
                    console.warn('[SoOrderStorage.Sync] Firebase not loaded — local-only mode');
                    return false;
                }
                this._db = firebase.firestore();
                const loaded = await this._loadFromFirestore();
                if (loaded) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded.data));
                    this._localLastUpdated = loaded.lastUpdated || 0;
                }
                return true;
            } catch (e) {
                console.warn('[SoOrderStorage.Sync] init failed:', e.message);
                return false;
            }
        },

        async _loadFromFirestore() {
            if (!this._db) return null;
            try {
                const docRef = this._db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);
                const snap = await docRef.get();
                if (!snap.exists) return null;
                const payload = snap.data() || {};
                if (!payload.data) return null;
                return { data: payload.data, lastUpdated: payload.lastUpdated || 0 };
            } catch (e) {
                console.warn('[SoOrderStorage.Sync] load failed:', e.message);
                return null;
            }
        },

        // Pull latest from Firestore. Call on visibilitychange/focus.
        // Applies update only when remote is newer than what this client
        // last wrote (so it doesn't clobber in-flight local edits).
        async pullOnce() {
            const loaded = await this._loadFromFirestore();
            if (!loaded) return false;
            if (loaded.lastUpdated <= this._localLastUpdated) return false;
            // Remote is newer. If user has uncommitted local changes pending
            // a debounced push, flag a conflict instead of overwriting.
            if (this._pushTimer && this._onConflict) {
                this._onConflict(loaded);
                return false;
            }
            this._localLastUpdated = loaded.lastUpdated;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded.data));
            if (this._onRemoteUpdate) this._onRemoteUpdate(loaded.data);
            return true;
        },

        // Debounced push — gom nhiều mutation liên tiếp thành 1 write.
        // Called from app's pushSync() after every mutation. Safe to call
        // repeatedly; only fires after PUSH_DEBOUNCE_MS of quiet.
        pushToFirestore(state) {
            if (!this._db) return false;
            this._pendingState = state;
            if (this._pushTimer) return true;
            this._pushTimer = setTimeout(() => {
                this._pushTimer = null;
                this._flushPending();
            }, PUSH_DEBOUNCE_MS);
            return true;
        },

        async _flushPending() {
            if (!this._db || !this._pendingState) return;
            const stateSnapshot = this._pendingState;
            this._pendingState = null;
            const ts = Date.now();
            try {
                const docRef = this._db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);
                await docRef.set({ data: stateSnapshot, lastUpdated: ts }, { merge: true });
                this._localLastUpdated = ts;
            } catch (e) {
                console.warn('[SoOrderStorage.Sync] push failed:', e.message);
            }
        },

        // Force-flush any pending debounced write immediately.
        // Call on visibilitychange→hidden / beforeunload so user doesn't
        // lose the last few edits when closing the tab.
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
        },
    };

    SoOrderStorage.Sync = Sync;

    if (typeof window !== 'undefined') window.SoOrderStorage = SoOrderStorage;
})();
