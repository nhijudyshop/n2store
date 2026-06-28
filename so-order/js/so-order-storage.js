// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — IndexedDB cache + data API (tabs/shipments/rows/trash/columns).
//
// Tách module (2026-06-19): file gốc 962 dòng → 2 module <800 dòng (MOVE-only):
//   - so-order-storage.js (FILE NÀY): data layer — IndexedDB cache +
//     tabs/shipments/rows/trash/columns API. Expose `window.SoOrderStorage`.
//   - so-order-storage-sync.js: Sync sub-system (init/_loadFromServer/
//     _subscribeSSE/pullOnce/pushToFirestore) — gắn `window.SoOrderStorage.Sync`.
//     Load SAU file này. Truy cập internal data-layer qua `SoOrderStorage._internal`.
//
// C8 (2026-06-13): nguồn chuẩn chuyển từ Firestore `web2_so_order/main` →
// Postgres `web2_so_order` (`/api/web2-so-order`, optimistic version, auth, SSE).
// Firestore chỉ còn dùng cho migration 1 lần (Sync._migrateFromFirestore).
//
// Schema (IDB key `so_order_storage:main`, Postgres web2_so_order.data JSONB):
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
    // 2026-06-28: activeTabId (tab địa danh ĐANG XEM) là trạng thái UI RIÊNG TỪNG MÁY,
    // KHÔNG đồng bộ qua doc web2_so_order (trước đây nằm trong state → chuyển tab máy A
    // làm máy B nhảy tab). Lưu riêng localStorage per-device + áp lại sau mỗi load/pull.
    const ACTIVE_TAB_KEY = 'soOrder_activeTabId_v1';
    function _getLocalActiveTab() {
        try {
            return localStorage.getItem(ACTIVE_TAB_KEY) || null;
        } catch {
            return null;
        }
    }
    function _setLocalActiveTab(id) {
        try {
            if (id) localStorage.setItem(ACTIVE_TAB_KEY, id);
        } catch {
            /* localStorage không khả dụng — bỏ qua */
        }
    }
    // Ghi đè activeTabId của data (đến từ server/IDB) bằng tab per-device. Idempotent.
    function _applyLocalActiveTab(data) {
        if (!data || !Array.isArray(data.tabs) || !data.tabs.length) return data;
        const local = _getLocalActiveTab();
        if (local && data.tabs.find((t) => t.id === local)) data.activeTabId = local;
        else if (!data.activeTabId || !data.tabs.find((t) => t.id === data.activeTabId))
            data.activeTabId = data.tabs[0].id;
        return data;
    }

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
                    // Ẩn/hiện cụm field thông tin lô nâng cao (ETA/Đợt/Số Kiện/
                    // Tổng KG/Tiền HĐ/Tiền tệ) trong modal tạo đơn. Mặc định ẩn.
                    showShipMeta: false,
                    footer: { discount: 0, shipping: 0 },
                    columnVisibility: { ...DEFAULT_COLUMNS },
                    shipments: [],
                },
                {
                    id: 'huongchau',
                    label: 'HƯƠNG CHÂU',
                    currency: 'CNY',
                    rate: 3500,
                    showShipMeta: false,
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
        // Backfill toggle ẩn/hiện field thông tin lô (mặc định ẩn cho tab cũ).
        if (tab.showShipMeta === undefined) tab.showShipMeta = false;
        // Per-field thông tin lô (2026-06-16): mỗi field 1 flag riêng. Backfill từ
        // showShipMeta gộp cho tab cũ — bool true → bật cả 6, false → tắt cả 6.
        if (!tab.shipMetaFields || typeof tab.shipMetaFields !== 'object') {
            const all = !!tab.showShipMeta;
            tab.shipMetaFields = {
                eta: all,
                batch: all,
                caseCount: all,
                weightKg: all,
                contractAmount: all,
                contractCurrency: all,
            };
        }
        // Heal shipment shape
        for (const sh of tab.shipments) {
            if (!Array.isArray(sh.rows)) sh.rows = [];
            if (sh.collapsed == null) sh.collapsed = false;
            if (!sh.date) sh.date = new Date().toISOString().slice(0, 10);
            if (!sh.contractCurrency) sh.contractCurrency = tab.currency || 'VND';
            // 2026-06-16: discount/shipping per-ĐƠN (orderAdjustments). Init map +
            // nhớ giá trị legacy per-shipment để migrate SAU khi backfill invoiceGroupId.
            if (!sh.orderAdjustments || typeof sh.orderAdjustments !== 'object') {
                sh.orderAdjustments = {};
            }
            const _legacyDisc = Number(sh.discount) || 0;
            const _legacyShip = Number(sh.shipping) || 0;
            delete sh.discount;
            delete sh.shipping;
            // P1 2026-05-30: backfill invoiceGroupId cho rows cũ chưa có.
            // Gộp các rows kế nhau cùng supplier (heuristic: nhiều khả năng
            // được tạo cùng 1 đợt) → 1 group. Đổi supplier → group mới.
            let lastSupplier = null;
            let curGroup = null;
            for (const r of sh.rows) {
                // 2026-06-16: 'ordered' (Đã Đặt) khai tử → về 'draft' (chưa nhận =
                // chưa nợ NCC). Chỉ "Nhận hàng" tạo received/partial_received.
                if (r.status === 'ordered') r.status = 'draft';
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
            // Migrate legacy discount/ship per-shipment → gán vào ĐƠN ĐẦU TIÊN của lô.
            if ((_legacyDisc || _legacyShip) && !Object.keys(sh.orderAdjustments).length) {
                const firstGid = sh.rows[0] ? sh.rows[0].invoiceGroupId || sh.rows[0].id : null;
                if (firstGid) {
                    sh.orderAdjustments[firstGid] = {
                        discount: _legacyDisc,
                        shipping: _legacyShip,
                    };
                }
            }
            // 2026-06-17: migrate legacy KG/kiện/Tiền HĐ ở cấp LÔ → ĐƠN ĐẦU TIÊN
            // (giờ per-đơn). Chỉ chạy 1 lần: sau khi migrate, clear field cấp lô để
            // header (tính TỔNG từ các đơn) không cộng đôi. (Beta: contractAmount
            // giữ NGUYÊN giá trị — phần lớn lô có contractCurrency == tab.currency.)
            const _legacyW = Number(sh.weightKg) || 0;
            const _legacyC = Number(sh.caseCount) || 0;
            const _legacyCA = Number(sh.contractAmount) || 0;
            const _metaMigrated = Object.values(sh.orderAdjustments).some(
                (a) =>
                    Number(a.weightKg) ||
                    0 ||
                    Number(a.caseCount) ||
                    0 ||
                    Number(a.contractAmount) ||
                    0
            );
            if ((_legacyW || _legacyC || _legacyCA) && !_metaMigrated) {
                const firstGid = sh.rows[0] ? sh.rows[0].invoiceGroupId || sh.rows[0].id : null;
                if (firstGid) {
                    const cur = sh.orderAdjustments[firstGid] || {};
                    sh.orderAdjustments[firstGid] = {
                        discount: Number(cur.discount) || 0,
                        shipping: Number(cur.shipping) || 0,
                        weightKg: _legacyW,
                        caseCount: _legacyC,
                        contractAmount: _legacyCA,
                    };
                    // Clear field cấp lô → tránh cộng đôi (header dùng TỔNG các đơn).
                    sh.weightKg = 0;
                    sh.caseCount = 0;
                    sh.contractAmount = 0;
                }
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

    // P1 2026-05-30: Persistent storage chuyển từ localStorage → IndexedDB
    // qua Web2IdbStore. Reason: dữ liệu Web 2.0 có khả năng grow lớn (nhiều
    // shipments với base64 images) → vượt 5-10MB localStorage cap.
    //
    // Sync API (load/save) giữ NGUYÊN — caller không cần await. Layer này
    // dùng cached in-memory state + async background persist:
    //   - load(): async return Promise<state> — caller phải await
    //   - save(state): sync — schedule debounced async IDB write
    //   - Sync memory cache `_cachedState` để sync code path đọc nhanh
    //
    // Migrate path: lần đầu open() Web2IdbStore với migrateFromLs sẽ tự
    // copy `localStorage.soOrder_v1` → IDB key `so_order_storage:main` rồi
    // xóa LS. Idempotent (chạy 1 lần duy nhất).
    let _idbStore = null;
    function _getStore() {
        if (_idbStore) return _idbStore;
        const root = typeof window !== 'undefined' ? window : globalThis;
        if (!root.Web2IdbStore) {
            console.warn('[SoOrderStorage] Web2IdbStore not loaded — fallback localStorage only');
            return null;
        }
        _idbStore = root.Web2IdbStore.open('so_order_storage', {
            migrateFromLs: STORAGE_KEY,
        });
        return _idbStore;
    }

    let _cachedState = null; // in-memory mirror, sync access
    let _writeTimer = null;
    const WRITE_DEBOUNCE_MS = 150;

    async function _read() {
        try {
            const store = _getStore();
            let data = null;
            if (store) {
                data = await store.get();
            }
            // IDB đã có data (migrate xong / đã ghi trước đó) → dọn legacy LS key
            // để tránh stale fallback đọc bản cũ về sau. CHỈ remove khi CHẮC CHẮN
            // IDB có data (data != null). Nếu migrate fail → store.get() trả null
            // → KHÔNG remove, fallback LS bên dưới vẫn dùng được.
            if (store && data != null) {
                try {
                    if (localStorage.getItem(STORAGE_KEY) != null) {
                        localStorage.removeItem(STORAGE_KEY);
                    }
                } catch {
                    /* localStorage không khả dụng — bỏ qua */
                }
            }
            // Fallback localStorage nếu IDB unavailable HOẶC chưa migrate (rare).
            if (!data) {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    try {
                        data = JSON.parse(raw);
                    } catch {
                        data = null;
                    }
                }
            }
            if (!data) {
                _cachedState = _defaultState();
                return _cachedState;
            }
            // Heal partials so the rest of the app never has to null-check
            if (!Array.isArray(data.tabs) || !data.tabs.length) data.tabs = _defaultState().tabs;
            if (!data.activeTabId || !data.tabs.find((t) => t.id === data.activeTabId)) {
                data.activeTabId = data.tabs[0].id;
            }
            // Tab đang xem = per-device (đè giá trị đến từ server/IDB).
            _applyLocalActiveTab(data);
            const globalColVis = data.columnVisibility;
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
            // Purge trash > 7 ngày
            if (Array.isArray(data.trash) && data.trash.length) {
                const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
                const before = data.trash.length;
                data.trash = data.trash.filter((e) => Number(e?.deletedAt) > cutoff);
                if (data.trash.length !== before) mutated = true;
            }
            _cachedState = data;
            if (mutated) _write(data);
            return data;
        } catch (e) {
            console.warn('[SoOrderStorage] read failed:', e.message);
            _cachedState = _defaultState();
            return _cachedState;
        }
    }

    // Sync API — caller không cần await. Schedule debounced async IDB write.
    function _write(state) {
        _cachedState = state;
        if (_writeTimer) clearTimeout(_writeTimer);
        _writeTimer = setTimeout(async () => {
            _writeTimer = null;
            try {
                const store = _getStore();
                if (store) {
                    await store.set(state);
                } else {
                    // Fallback localStorage nếu IDB không khả dụng
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                }
            } catch (e) {
                console.error('[SoOrderStorage] write failed:', e.message);
            }
        }, WRITE_DEBOUNCE_MS);
        return true;
    }

    // Flush pending IDB write — dùng khi tab unload để không mất last edits.
    async function _flushWrite() {
        if (!_writeTimer) return;
        clearTimeout(_writeTimer);
        _writeTimer = null;
        if (!_cachedState) return;
        try {
            const store = _getStore();
            if (store) await store.set(_cachedState);
            else localStorage.setItem(STORAGE_KEY, JSON.stringify(_cachedState));
        } catch (e) {
            console.error('[SoOrderStorage] flush write failed:', e.message);
        }
    }

    // ------ PUBLIC API ------

    const SoOrderStorage = {
        // Async load — returns Promise<state>. Caller must await.
        // P1 2026-05-30: chuyển từ sync localStorage sang async IDB.
        load() {
            return _read();
        },

        // Sync cached state nếu đã load 1 lần (after first load() resolved).
        // Caller dùng cho code path không thể await (event handlers re-read).
        loadCached() {
            return _applyLocalActiveTab(_cachedState || _defaultState());
        },

        save(state) {
            return _write(state);
        },

        flush() {
            return _flushWrite();
        },

        getActiveTab(state) {
            return state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
        },

        setActiveTab(state, tabId) {
            if (state.tabs.find((t) => t.id === tabId)) {
                state.activeTabId = tabId;
                _setLocalActiveTab(tabId); // per-device — KHÔNG đồng bộ sang máy khác
                _write(state);
            }
            return state;
        },

        // Expose helper để render/sync áp lại tab per-device sau pull.
        applyLocalActiveTab(state) {
            return _applyLocalActiveTab(state);
        },
        setLocalActiveTab(id) {
            _setLocalActiveTab(id);
        },

        addTab(state, { label, currency, rate, showShipMeta, shipMetaFields }) {
            const id = _mkId();
            state.tabs.push({
                id,
                label: label || 'Tab mới',
                currency: currency || 'VND',
                rate: Number(rate) || 1,
                showShipMeta: !!showShipMeta,
                shipMetaFields: shipMetaFields || null, // normalize() backfill nếu null
                footer: { discount: 0, shipping: 0 },
                shipments: [],
            });
            state.activeTabId = id;
            _setLocalActiveTab(id); // tab mới active trên máy này (per-device)
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
                // 2026-06-16: giảm giá / phí ship PER-ĐƠN (per invoiceGroupId), KHÔNG
                // còn per-shipment. Map { [invoiceGroupId]: { discount, shipping } }.
                // Header lô + footer = TỔNG các đơn. Xem setOrderAdjustment / totals.
                orderAdjustments: {},
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
            // 2026-06-16: discount/shipping ĐÃ chuyển per-đơn (orderAdjustments) —
            // KHÔNG còn nhận patch ở shipment level. Dùng setOrderAdjustment().
            if (patch.collapsed !== undefined) sh.collapsed = !!patch.collapsed;
            _write(state);
            return true;
        },

        // 2026-06-17: meta PER-ĐƠN (invoiceGroupId) — tổng KG, số kiện, Tiền HĐ,
        // giảm giá, phí ship riêng cho TỪNG NCC/đơn trong lô (1 lô gồm nhiều NCC →
        // mỗi NCC ship riêng, cân riêng, HĐ riêng). Trước đây KG/kiện/HĐ ở cấp LÔ;
        // giờ chuyển per-đơn, lô header = TỔNG. discount/shipping/contractAmount
        // theo CURRENCY của tab (footer/nợ tự convert sang VND).
        setOrderAdjustment(
            state,
            tabId,
            shipmentId,
            invoiceGroupId,
            { discount, shipping, weightKg, caseCount, contractAmount } = {}
        ) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            if (!sh || !invoiceGroupId) return false;
            if (!sh.orderAdjustments || typeof sh.orderAdjustments !== 'object') {
                sh.orderAdjustments = {};
            }
            const d = Number(discount) || 0;
            const s = Number(shipping) || 0;
            const w = Number(weightKg) || 0;
            const c = Number(caseCount) || 0;
            const ca = Number(contractAmount) || 0;
            if (d === 0 && s === 0 && w === 0 && c === 0 && ca === 0) {
                delete sh.orderAdjustments[invoiceGroupId]; // tất cả 0 → không lưu rác
            } else {
                sh.orderAdjustments[invoiceGroupId] = {
                    discount: d,
                    shipping: s,
                    weightKg: w,
                    caseCount: c,
                    contractAmount: ca,
                };
            }
            _write(state);
            return true;
        },

        // Meta của 1 đơn (invoiceGroupId) — { discount, shipping, weightKg,
        // caseCount, contractAmount } theo currency tab.
        getOrderAdjustment(sh, invoiceGroupId) {
            const a = sh && sh.orderAdjustments && sh.orderAdjustments[invoiceGroupId];
            return {
                discount: Number(a?.discount) || 0,
                shipping: Number(a?.shipping) || 0,
                weightKg: Number(a?.weightKg) || 0,
                caseCount: Number(a?.caseCount) || 0,
                contractAmount: Number(a?.contractAmount) || 0,
            };
        },

        // Tổng meta của 1 LÔ = Σ các đơn (chỉ đơn còn row sống → tránh entry mồ côi
        // inflate tổng). Đơn vị tiền = currency của tab (caller tự convert VND).
        getShipmentAdjustTotals(sh) {
            const adj = (sh && sh.orderAdjustments) || {};
            const liveGroups = new Set((sh?.rows || []).map((r) => r.invoiceGroupId || r.id));
            let discount = 0;
            let shipping = 0;
            let weightKg = 0;
            let caseCount = 0;
            let contractAmount = 0;
            for (const [gid, a] of Object.entries(adj)) {
                if (!liveGroups.has(gid)) continue;
                discount += Number(a.discount) || 0;
                shipping += Number(a.shipping) || 0;
                weightKg += Number(a.weightKg) || 0;
                caseCount += Number(a.caseCount) || 0;
                contractAmount += Number(a.contractAmount) || 0;
            }
            return { discount, shipping, weightKg, caseCount, contractAmount };
        },

        deleteShipment(state, tabId, shipmentId) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            tab.shipments = tab.shipments.filter((s) => s.id !== shipmentId);
            _write(state);
            return true;
        },

        // Trash system (2026-05-30): lô đã nhận đủ hàng được soft delete
        // vào `state.trash` thay vì xoá vĩnh viễn. Retention 7 ngày — sau
        // đó auto purge khi load state. User có thể restore về tab gốc
        // trước khi hết hạn.
        TRASH_RETENTION_MS: 7 * 24 * 60 * 60 * 1000,

        softDeleteShipment(state, tabId, shipmentId) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return null;
            const idx = tab.shipments.findIndex((s) => s.id === shipmentId);
            if (idx === -1) return null;
            const sh = tab.shipments[idx];
            tab.shipments.splice(idx, 1);
            if (!Array.isArray(state.trash)) state.trash = [];
            const entry = {
                id:
                    'trash-' +
                    Date.now().toString(36) +
                    '-' +
                    Math.random().toString(36).slice(2, 7),
                tabId,
                tabLabel: tab.label || tabId,
                shipment: sh,
                deletedAt: Date.now(),
            };
            state.trash.push(entry);
            _write(state);
            return entry;
        },

        getTrash(state) {
            return Array.isArray(state.trash) ? state.trash : [];
        },

        restoreFromTrash(state, trashId) {
            if (!Array.isArray(state.trash)) return false;
            const idx = state.trash.findIndex((e) => e.id === trashId);
            if (idx === -1) return false;
            const entry = state.trash[idx];
            // Tab gốc đã bị xoá? → restore vào tab đầu tiên còn lại.
            let tab = state.tabs.find((t) => t.id === entry.tabId);
            if (!tab) tab = state.tabs[0];
            if (!tab) return false;
            tab.shipments.push(entry.shipment);
            state.trash.splice(idx, 1);
            _write(state);
            return true;
        },

        purgeFromTrash(state, trashId) {
            if (!Array.isArray(state.trash)) return false;
            const before = state.trash.length;
            state.trash = state.trash.filter((e) => e.id !== trashId);
            if (state.trash.length === before) return false;
            _write(state);
            return true;
        },

        // Drop entries past retention. Returns true nếu có purge.
        purgeOldTrash(state, retentionMs) {
            if (!Array.isArray(state.trash) || !state.trash.length) return false;
            const cutoff = Date.now() - (retentionMs || 7 * 24 * 60 * 60 * 1000);
            const before = state.trash.length;
            state.trash = state.trash.filter((e) => Number(e.deletedAt) > cutoff);
            if (state.trash.length === before) return false;
            _write(state);
            return true;
        },

        updateTab(state, tabId, patch) {
            const tab = state.tabs.find((t) => t.id === tabId);
            if (!tab) return false;
            if (patch.label !== undefined) tab.label = patch.label;
            if (patch.currency !== undefined) tab.currency = patch.currency;
            if (patch.rate !== undefined) tab.rate = Number(patch.rate) || 1;
            if (patch.showShipMeta !== undefined) tab.showShipMeta = !!patch.showShipMeta;
            if (patch.shipMetaFields !== undefined) tab.shipMetaFields = patch.shipMetaFields;
            _write(state);
            return true;
        },

        deleteTab(state, tabId) {
            if (state.tabs.length <= 1) return false; // keep at least 1
            state.tabs = state.tabs.filter((t) => t.id !== tabId);
            if (state.activeTabId === tabId) {
                state.activeTabId = state.tabs[0].id;
                _setLocalActiveTab(state.activeTabId);
            }
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
                // category = loại SP theo món, ngăn ' + ' (vd "Áo + Quần"). Web2VariantPicker.
                category: rowData.category || '',
                // productGroupId: nhóm các dòng CON cùng 1 SP nhiều biến thể (→ Kho tạo
                // 1 CHA + N con). KHÁC invoiceGroupId (nhóm cả ĐƠN). null = SP phẳng.
                productGroupId: rowData.productGroupId || null,
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
    // Internal bridge cho Sync sub-system (so-order-storage-sync.js).
    // Sync layer cần đọc/ghi `_cachedState` + truy cập `_getStore` của data
    // layer này. Vì cả 2 là IIFE-private, expose qua _internal (KHÔNG phải
    // public API — callers app KHÔNG dùng; chỉ Sync file load sau truy cập).
    // -----------------------------------------------------------
    SoOrderStorage._internal = {
        getStore: _getStore,
        getCachedState() {
            return _cachedState;
        },
        setCachedState(state) {
            _cachedState = state;
        },
    };

    if (typeof window !== 'undefined') window.SoOrderStorage = SoOrderStorage;
})();
