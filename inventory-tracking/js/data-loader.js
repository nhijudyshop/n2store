// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// DATA LOADER - INVENTORY TRACKING
// Migrated from Firestore SDK to REST API (api-client.js)
// =====================================================

/**
 * Load all NCC (supplier) data from PostgreSQL via API
 * Builds nccList for backward compatibility
 */
async function loadNCCData() {
    console.log('[DATA] Loading NCC data from API...');

    try {
        globalState.isLoading = true;

        // Load suppliers from API
        const suppliers = await suppliersApi.getAll();

        // Build nccList structure (backward compatible with old Firestore format)
        globalState.nccList = suppliers.map((s) => ({
            id: `ncc_${s.stt_ncc}`,
            sttNCC: s.stt_ncc,
            tenNCC: s.ten_ncc,
            datHang: [],
            dotHang: [],
        }));

        // Sort by sttNCC
        globalState.nccList.sort((a, b) => (a.sttNCC || 0) - (b.sttNCC || 0));
        globalState.filteredNCCList = [...globalState.nccList];

        console.log(`[DATA] Loaded ${globalState.nccList.length} NCC documents`);

        // Load order bookings, shipments, and product images
        await Promise.all([
            loadAndAttachOrderBookings(),
            loadAndAttachShipments(),
            loadProductImages(),
            loadHiddenNccs(),
        ]);

        // Flatten data for backward compatibility
        flattenNCCData();

        // Update NCC filter options
        updateNCCFilterOptions();

        // Apply filters and render
        if (typeof applyFiltersAndRender === 'function') {
            applyFiltersAndRender();
        }

        // Setup realtime sync (product images + all inventory CRUD entities)
        setupInventoryRealtimeSync();
    } catch (error) {
        console.error('[DATA] Error loading NCC data:', error);
        throw error;
    } finally {
        globalState.isLoading = false;
    }
}

/**
 * Load order bookings from API and attach to nccList
 */
async function loadAndAttachOrderBookings() {
    try {
        const result = await orderBookingsApi.getAll({ limit: 500 });
        const bookings = result.data.map(pgToBooking);

        // Attach to nccList — match by sttNCC (if > 0) or tenNCC
        bookings.forEach((b) => {
            let ncc;
            if (b.sttNCC > 0) {
                ncc = globalState.nccList.find((n) => n.sttNCC === b.sttNCC);
            } else if (b.tenNCC) {
                ncc = globalState.nccList.find((n) => n.tenNCC === b.tenNCC);
            }
            if (ncc) {
                ncc.datHang.push(b);
            }
        });

        console.log(`[DATA] Loaded ${bookings.length} order bookings`);
    } catch (error) {
        console.error('[DATA] Error loading order bookings:', error);
    }
}

/**
 * Load shipments from API and attach to nccList
 */
async function loadAndAttachShipments() {
    try {
        const result = await shipmentsApi.getAll({ limit: 500 });
        const shipments = result.data.map(pgToShipment);

        // Attach to nccList — match by sttNCC (if > 0) or tenNCC
        shipments.forEach((s) => {
            let ncc;
            if (s.sttNCC > 0) {
                ncc = globalState.nccList.find((n) => n.sttNCC === s.sttNCC);
            } else if (s.tenNCC) {
                ncc = globalState.nccList.find((n) => n.tenNCC === s.tenNCC);
            }
            if (ncc) {
                ncc.dotHang.push(s);
            }
        });

        console.log(`[DATA] Loaded ${shipments.length} shipments`);
    } catch (error) {
        console.error('[DATA] Error loading shipments:', error);
    }
}

/**
 * Load product images from API (independent of shipments)
 */
async function loadProductImages() {
    try {
        const images = await productImagesApi.getAll();
        globalState.productImages = images.map((img) => ({
            ...img,
            ngayDiHang: img.ngay_di_hang ? String(img.ngay_di_hang).split('T')[0] : null,
            dotSo: img.dot_so || 1,
            urls: typeof img.urls === 'string' ? JSON.parse(img.urls) : img.urls || [],
        }));
        console.log(`[DATA] Loaded ${globalState.productImages.length} product image groups`);
    } catch (error) {
        console.error('[DATA] Error loading product images:', error);
        globalState.productImages = [];
    }
}

/**
 * Load hidden-NCC map from API. Stored on globalState so table-renderer can
 * read synchronously while rendering. Map key: `${shipmentId}_${nccKey}`.
 */
async function loadHiddenNccs() {
    try {
        const rows = await hiddenNccsApi.getAll();
        const map = {};
        rows.forEach((r) => {
            map[`${r.shipment_id}_${r.ncc_key}`] = {
                hiddenBy: r.hidden_by || null,
                createdAt: r.created_at || null,
            };
        });
        globalState.hiddenNccs = map;
        console.log(`[DATA] Loaded ${rows.length} hidden NCC entries`);
    } catch (error) {
        console.error('[DATA] Error loading hidden NCCs:', error);
        globalState.hiddenNccs = globalState.hiddenNccs || {};
    }
}

/**
 * Setup SSE realtime sync for inventory tracking (single shared connection).
 *
 * Subscribes to 6 topics on the Web 1.0 SSE hub. Each topic maps to a
 * different reload path so we don't re-fetch everything on every change:
 *
 *   product_images           → image-only refresh (modal warns on conflict)
 *   inventory_shipments      → full reload (shipment ↔ supplier ↔ booking linkage)
 *   inventory_order_bookings → full reload (same nested store)
 *   inventory_suppliers      → full reload (supplier list drives both tabs)
 *   inventory_prepayments    → finance tab refresh
 *   inventory_other_expenses → finance tab refresh
 *
 * Debounce 300ms on the "reload all" path because a single user action
 * (vd save shipment) may fire shipments + suppliers events back-to-back.
 */
// Cửa sổ bỏ qua echo SSE do CHÍNH máy này vừa ghi (tránh self-reload làm văng
// modal/edit đang mở). Mọi mutation qua apiFetch() đóng dấu window.__inventoryLastLocalWrite.
const _SELF_WRITE_SUPPRESS_MS = 3000;
function _inventorySelfWroteRecently() {
    return Date.now() - (window.__inventoryLastLocalWrite || 0) < _SELF_WRITE_SUPPRESS_MS;
}

// Trang "bận" khi có modal đang mở (openModal đặt body.overflow='hidden') hoặc
// đang có ô sửa inline (.inline-edit-input). Khi bận thì hoãn reload/re-render
// để không vẽ lại bảng làm văng thao tác đang dở của user.
function _inventoryUiBusy() {
    return (
        document.body.style.overflow === 'hidden' ||
        !!document.querySelector('.inline-edit-input')
    );
}
if (typeof window !== 'undefined') {
    window._inventoryUiBusy = _inventoryUiBusy;
}

function setupInventoryRealtimeSync() {
    if (typeof RealtimeClient === 'undefined') {
        console.log('[DATA] RealtimeClient not available, skipping inventory realtime sync');
        return;
    }

    // ② Idempotent: đã có client rồi thì KHÔNG mở connection thứ 2.
    // loadNCCData() gọi hàm này ở cuối mỗi lần (kể cả SSE-triggered reload) → guard
    // biến các lần sau thành no-op → đúng 1 SSE connection suốt phiên (hết rò rỉ).
    if (window._inventoryRealtimeClient) return;

    try {
        const client = new RealtimeClient('https://chatomni-proxy.nhijudyshop.workers.dev');
        client.connect([
            'product_images',
            'inventory_suppliers',
            'inventory_order_bookings',
            'inventory_shipments',
            'inventory_prepayments',
            'inventory_other_expenses',
            'inventory_hidden_nccs',
        ]);
        window._inventoryRealtimeClient = client;

        // --- Product images: optimistic in-memory update, image-manager hook ---
        let _imgTimer = null;
        let _imgLatest = null;
        const _applyImages = (data) => {
            if (data && data.data) {
                globalState.productImages = data.data.map((img) => ({
                    ...img,
                    ngayDiHang: img.ngay_di_hang ? String(img.ngay_di_hang).split('T')[0] : null,
                    dotSo: img.dot_so || 1,
                    urls: typeof img.urls === 'string' ? JSON.parse(img.urls) : img.urls || [],
                }));
            } else {
                loadProductImages();
            }
            // ③ Hoãn vẽ lại bảng nếu đang mở modal/sửa inline (state ảnh đã cập nhật
            //    ở trên; chỉ trì hoãn phần render để không văng thao tác đang dở).
            const _renderImages = () => {
                if (_inventoryUiBusy()) {
                    setTimeout(_renderImages, 800);
                    return;
                }
                if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
            };
            _renderImages();
            if (typeof ImageManager !== 'undefined' && ImageManager._onExternalUpdate) {
                ImageManager._onExternalUpdate();
            }
        };
        client.on('product_images', (data) => {
            _imgLatest = data;
            if (_imgTimer) clearTimeout(_imgTimer);
            _imgTimer = setTimeout(() => {
                _imgTimer = null;
                _applyImages(_imgLatest);
            }, 200);
        });

        // --- Shared "reload everything" path for shipments / bookings / suppliers ---
        // We don't try to merge partial events into local state because the
        // nested ncc → datHang/dotHang structure plus aggregated shipments make
        // a partial patch surprisingly error-prone. A single full reload from
        // API is fast (< 1s for current data volumes) and always correct.
        let _allTimer = null;
        let _allReconcileScheduled = false;
        const reloadAll = () => {
            if (_allTimer) clearTimeout(_allTimer);
            _allTimer = setTimeout(() => {
                _allTimer = null;
                // ① Echo do CHÍNH máy này vừa ghi → bỏ qua (save đã optimistic render).
                //    Vẫn hẹn 1 lần reconcile sau cửa sổ, phòng MÁY KHÁC đổi dữ liệu
                //    rơi đúng cửa sổ thì vẫn được nạp lại (giữ sync đa máy).
                if (_inventorySelfWroteRecently()) {
                    if (!_allReconcileScheduled) {
                        _allReconcileScheduled = true;
                        const wait =
                            _SELF_WRITE_SUPPRESS_MS -
                            (Date.now() - (window.__inventoryLastLocalWrite || 0)) +
                            200;
                        setTimeout(
                            () => {
                                _allReconcileScheduled = false;
                                reloadAll();
                            },
                            Math.max(200, wait)
                        );
                    }
                    return;
                }
                // ③ Đang mở modal / sửa inline → hoãn tới khi user xong.
                //    Dùng lại _allTimer để nhiều event không sinh nhiều chuỗi poll.
                if (_inventoryUiBusy()) {
                    _allTimer = setTimeout(reloadAll, 800);
                    return;
                }
                if (globalState.isLoading) return; // skip if a manual reload is mid-flight
                console.log('[DATA] SSE → reloading inventory data');
                loadNCCData().catch((e) => console.error('[DATA] SSE-triggered reload failed:', e));
            }, 300);
        };
        ['inventory_shipments', 'inventory_order_bookings', 'inventory_suppliers'].forEach((t) => {
            client.on(t, (data) => {
                console.log(`[DATA] SSE event ${t}:`, data?.action || '');
                reloadAll();
            });
        });

        // --- Finance tab: prepayments + other expenses ---
        let _finTimer = null;
        let _finReconcileScheduled = false;
        const reloadFinance = () => {
            if (_finTimer) clearTimeout(_finTimer);
            _finTimer = setTimeout(() => {
                _finTimer = null;
                if (typeof loadFinanceData !== 'function') return;
                // ① Echo của chính mình → bỏ qua + reconcile (xem reloadAll).
                if (_inventorySelfWroteRecently()) {
                    if (!_finReconcileScheduled) {
                        _finReconcileScheduled = true;
                        const wait =
                            _SELF_WRITE_SUPPRESS_MS -
                            (Date.now() - (window.__inventoryLastLocalWrite || 0)) +
                            200;
                        setTimeout(
                            () => {
                                _finReconcileScheduled = false;
                                reloadFinance();
                            },
                            Math.max(200, wait)
                        );
                    }
                    return;
                }
                // ③ Đang sửa inline (cost/payment) → hoãn (dùng lại _finTimer).
                if (_inventoryUiBusy()) {
                    _finTimer = setTimeout(reloadFinance, 800);
                    return;
                }
                console.log('[DATA] SSE → reloading finance data');
                loadFinanceData().catch((e) =>
                    console.error('[DATA] SSE-triggered finance reload failed:', e)
                );
            }, 300);
        };
        ['inventory_prepayments', 'inventory_other_expenses'].forEach((t) => {
            client.on(t, (data) => {
                console.log(`[DATA] SSE event ${t}:`, data?.action || '');
                reloadFinance();
            });
        });

        // --- Hidden NCC checkbox: patch in-memory map + re-render rows ---
        // No reload of shipments — only the visibility class changes.
        let _hiddenTimer = null;
        client.on('inventory_hidden_nccs', (data) => {
            const action = data?.action;
            const sid = data?.shipment_id;
            const nccKey = data?.ncc_key;
            if (!sid || !nccKey) return;
            globalState.hiddenNccs = globalState.hiddenNccs || {};
            const key = `${sid}_${nccKey}`;
            if (action === 'hide') {
                globalState.hiddenNccs[key] = {
                    hiddenBy: data?.hidden_by || null,
                    createdAt: Date.now(),
                };
            } else if (action === 'show') {
                delete globalState.hiddenNccs[key];
            }
            // Debounce — burst of changes on the same shipment is common.
            if (_hiddenTimer) clearTimeout(_hiddenTimer);
            _hiddenTimer = setTimeout(() => {
                _hiddenTimer = null;
                if (typeof window.applyHiddenNccsToDom === 'function') {
                    window.applyHiddenNccsToDom();
                }
            }, 150);
        });

        console.log(
            '[DATA] Inventory realtime sync enabled (7 topics, debounced 300ms reload paths)'
        );
    } catch (error) {
        console.error('[DATA] Error setting up inventory realtime sync:', error);
    }
}

/**
 * Get product images for a specific NCC within a shipment batch.
 * Image Manager maps by (đợt, ncc) — date is just a storage detail.
 * Match priority:
 *   1. Exact (đợt, ncc) — wins when the user uploaded a per-đợt image
 *   2. Any image for this NCC — fallback when only one đợt's image exists
 *      (covers legacy data + the common case where a NCC reuses the same
 *      product photo across đợt). The previous strict-only version made
 *      đợt 2 rows look empty for NCCs whose images were stored under đợt 1.
 *
 * `ngayDiHang` kept for backward compatibility but unused.
 */
function getProductImagesForNcc(ncc, ngayDiHang, dotSo) {
    if (!ncc) return [];
    const nccNum = parseInt(ncc);
    const images = globalState.productImages || [];
    const dotNum = dotSo ? parseInt(dotSo, 10) : null;

    if (dotNum) {
        const byDot = images.find((img) => img.ncc === nccNum && (img.dotSo || 1) === dotNum);
        if (byDot) return byDot.urls || [];

        // Fallback: pick the candidate whose đợt is numerically closest to the
        // requested one, tie-breaking towards lower đợt (older batch). This
        // is more intuitive than "most recent date" — if user has đợt 1 and
        // đợt 3 entries for NCC X, viewing đợt 2 should show đợt 1 (closer
        // by 1) rather than whichever happens to have the newer date.
        const candidates = images
            .filter((img) => img.ncc === nccNum)
            .map((img) => ({ img, dist: Math.abs((img.dotSo || 1) - dotNum) }))
            .sort((a, b) => {
                if (a.dist !== b.dist) return a.dist - b.dist;
                return (a.img.dotSo || 1) - (b.img.dotSo || 1);
            });
        return candidates[0] ? candidates[0].img.urls || [] : [];
    }

    const any = images.find((img) => img.ncc === nccNum);
    return any ? any.urls || [] : [];
}

/**
 * Flatten NCC data into shipments and orderBookings for backward compatibility
 */
function flattenNCCData() {
    // Flatten orderBookings (datHang) from all NCCs
    globalState.orderBookings = getAllDatHang();
    globalState.filteredOrderBookings = [...globalState.orderBookings];

    // Flatten shipments (dotHang) from all NCCs - restructure to old format
    globalState.shipments = getAllDotHangAsShipments();
    globalState.filteredShipments = [...globalState.shipments];

    console.log(
        `[DATA] Flattened: ${globalState.orderBookings.length} datHang, ${globalState.shipments.length} shipments`
    );

    // Audit raw vs aggregated totals to surface DB/aggregation duplication issues.
    if (typeof auditShipmentsData === 'function') {
        try {
            auditShipmentsData();
        } catch (e) {
            console.error('[AUDIT] failed:', e);
        }
    }

    // Rebuild đợt section tabs from current data (idempotent — safe to call
    // on every CRUD). Must happen BEFORE the stats bar so the active dotSo
    // is resolved when stats compute.
    if (window.DotTabs?.render) {
        try {
            window.DotTabs.render();
        } catch (e) {
            console.error('[DOT-TABS] render failed:', e);
        }
    }

    // Keep the horizontal stats bar in sync with any data mutation
    // (chi phí, tiền HĐ, tổng món, kiện/KG, payment changes, etc.)
    if (typeof updateInventoryStatsBar === 'function') {
        updateInventoryStatsBar();
    }
}

/**
 * Audit raw DB dotHang rows vs aggregated shipment groups.
 * Surfaces three classes of issues:
 *   1. DUPLICATE rows: same (date, dotSo, sttNCC) appearing >1 time (Postgres dedup PK missing?)
 *   2. CP duplication: chiPhiHangVe stored on >1 NCC row per đợt (should be only first row)
 *   3. Aggregate drift: sum(raw.tongTienHD) ≠ sum(shipment.tongTienHoaDon)
 * Outputs a single console.group so user can copy/paste back if numbers feel wrong.
 */
function auditShipmentsData() {
    const allDotHang = getAllDotHang();
    const shipments = globalState.shipments || [];

    const dupKeyCount = {};
    let rawTongKg = 0;
    let rawHD = 0;
    let rawCP = 0;
    let cpDuplicatedRows = 0;
    const cpByDotSo = {};

    allDotHang.forEach((d) => {
        const key = `${d.ngayDiHang}|${d.dotSo || 1}|${d.sttNCC || 0}|${d.tenNCC || ''}`;
        dupKeyCount[key] = (dupKeyCount[key] || 0) + 1;
        rawTongKg += parseFloat(d.tongKg) || 0;
        const products = d.sanPham || [];
        const _q = window.getProductEffectiveQty || ((p) => p.tongSoLuong || p.soLuong || 0);
        const hd =
            products.length > 0
                ? products.reduce((s, p) => s + _q(p) * (parseFloat(p.giaDonVi) || 0), 0)
                : parseFloat(d.tongTienHD) || 0;
        rawHD += hd;
        const cp = parseFloat(d.tongChiPhi) || 0;
        rawCP += cp;
        const cpHas = Array.isArray(d.chiPhiHangVe) && d.chiPhiHangVe.length > 0;
        if (cpHas) {
            const dotKey = `${d.ngayDiHang}|${d.dotSo || 1}`;
            cpByDotSo[dotKey] = (cpByDotSo[dotKey] || 0) + 1;
            if (cpByDotSo[dotKey] > 1) cpDuplicatedRows++;
        }
    });

    const duplicateKeys = Object.entries(dupKeyCount).filter(([, n]) => n > 1);

    // Aggregated (what stats bar consumes)
    let aggKg = 0;
    let aggHD = 0;
    let aggCP = 0;
    shipments.forEach((s) => {
        aggKg += parseFloat(s.tongKg) || 0;
        aggHD += parseFloat(s.tongTienHoaDon) || 0;
        aggCP += parseFloat(s.tongChiPhi) || 0;
    });

    console.groupCollapsed(`[AUDIT] inventory_shipments — raw vs aggregated (click to expand)`);
    console.log('Raw rows:', allDotHang.length, '| Aggregated shipment groups:', shipments.length);
    console.log('Tổng KG  — raw:', rawTongKg.toFixed(2), '| aggregated:', aggKg.toFixed(2));
    console.log('Tổng HĐ  — raw:', rawHD.toFixed(2), '| aggregated:', aggHD.toFixed(2));
    console.log('Tổng CP  — raw:', rawCP.toFixed(2), '| aggregated:', aggCP.toFixed(2));
    if (duplicateKeys.length > 0) {
        console.warn(
            `⚠ ${duplicateKeys.length} (date, dotSo, NCC) keys appear >1 time — DB duplicate rows`
        );
        console.table(
            duplicateKeys.slice(0, 30).map(([key, n]) => {
                const [date, dotSo, sttNCC, tenNCC] = key.split('|');
                return { date, dotSo, sttNCC, tenNCC, count: n };
            })
        );
    }
    if (cpDuplicatedRows > 0) {
        console.warn(
            `⚠ ${cpDuplicatedRows} dot rows store chiPhiHangVe redundantly (should be first NCC only per đợt)`
        );
    }
    if (Math.abs(rawHD - aggHD) > 0.5) {
        console.warn(`⚠ Tổng HĐ drift: raw=${rawHD.toFixed(2)} vs agg=${aggHD.toFixed(2)}`);
    }
    if (Math.abs(rawCP - aggCP) > 0.5) {
        console.warn(`⚠ Tổng CP drift: raw=${rawCP.toFixed(2)} vs agg=${aggCP.toFixed(2)}`);
    }
    console.groupEnd();
}

/**
 * List of distinct dotSo values present in current shipments, sorted ASC.
 * Used by the đợt section tabs.
 */
function getAvailableDotSoList() {
    const set = new Set();
    (globalState.shipments || []).forEach((s) => {
        const n = parseInt(s.dotSo, 10);
        if (Number.isFinite(n) && n > 0) set.add(n);
    });
    return [...set].sort((a, b) => a - b);
}

/**
 * Legacy function for backward compatibility
 */
async function loadShipmentsData() {
    console.log('[DATA] Loading shipments (via loadNCCData)...');
    await loadNCCData();
}

/**
 * Get NCC document by sttNCC
 */
function getNCCById(sttNCC) {
    return globalState.nccList.find((ncc) => ncc.sttNCC === sttNCC);
}

/**
 * Get NCC document by document ID (ncc_1, ncc_2, etc.)
 */
function getNCCByDocId(docId) {
    return globalState.nccList.find((ncc) => ncc.id === docId);
}

/**
 * Get or create NCC document (via API)
 */
async function getOrCreateNCC(sttNCC, tenNCC) {
    // For sttNCC > 0, lookup by number. For sttNCC=0, lookup by tenNCC.
    let existing;
    if (sttNCC > 0) {
        existing = getNCCById(sttNCC);
    } else if (tenNCC) {
        existing = globalState.nccList.find((ncc) => ncc.tenNCC === tenNCC);
    }
    if (existing) return existing;

    // Create via API — use tenNCC as identifier when sttNCC=0
    const nccId = sttNCC > 0 ? sttNCC : `name_${tenNCC}`;
    await suppliersApi.create(sttNCC, tenNCC || null);

    const newNCC = {
        id: `ncc_${nccId}`,
        sttNCC: sttNCC,
        tenNCC: tenNCC || '',
        datHang: [],
        dotHang: [],
    };

    globalState.nccList.push(newNCC);
    globalState.nccList.sort((a, b) => (a.sttNCC || 0) - (b.sttNCC || 0));

    console.log(`[DATA] Created new NCC: ncc_${nccId}`);
    return newNCC;
}

/**
 * Get all datHang (order bookings) flattened from all NCCs
 */
function getAllDatHang() {
    const all = [];
    globalState.nccList.forEach((ncc) => {
        (ncc.datHang || []).forEach((dh) => {
            all.push({
                ...dh,
                sttNCC: ncc.sttNCC,
                nccDocId: ncc.id,
                id: dh.id || `${ncc.id}_dh_${dh.ngayDatHang}`,
            });
        });
    });
    return all.sort((a, b) => new Date(b.ngayDatHang) - new Date(a.ngayDatHang));
}

/**
 * Get all dotHang (shipments) flattened from all NCCs
 */
function getAllDotHang() {
    const all = [];
    globalState.nccList.forEach((ncc) => {
        (ncc.dotHang || []).forEach((dot) => {
            all.push({
                ...dot,
                sttNCC: ncc.sttNCC,
                nccDocId: ncc.id,
                id: dot.id || `${ncc.id}_dot_${dot.ngayDiHang}`,
            });
        });
    });
    return all.sort((a, b) => {
        const dateDiff = new Date(b.ngayDiHang) - new Date(a.ngayDiHang);
        if (dateDiff !== 0) return dateDiff;
        return (b.dotSo || 1) - (a.dotSo || 1);
    });
}

/**
 * Normalize product data to new structure with backward compatibility
 */
function normalizeProductData(product) {
    if (!product) return product;

    if (product.mauSac !== undefined) {
        return {
            ...product,
            tongSoLuong:
                product.tongSoLuong ||
                (product.mauSac && product.mauSac.length > 0
                    ? product.mauSac.reduce((sum, c) => sum + (c.soLuong || 0), 0)
                    : product.soLuong || 0),
        };
    }

    return {
        maSP: product.maSP || '',
        moTa: product.tenHang || '',
        mauSac: [],
        tongSoLuong: product.soLuong || 0,
        soMau: product.soMau || 0,
        soLuong: product.soLuong || 0,
        giaDonVi: product.giaDonVi || 0,
        thanhTien: product.thanhTien || 0,
        rawText: product.rawText || '',
        dataSource: 'legacy',
        aiExtracted: product.aiExtracted || false,
    };
}

/**
 * Get all dotHang restructured as shipments (grouped by ngayDiHang + dotSo)
 * Each (date, dotSo) combination is a distinct shipment group
 */
/**
 * Filter CK payments to an đợt's date window [ngayBatDau, ngayKetThuc] (inclusive).
 * Open-ended on either side when that bound is missing (null/empty) → keeps legacy
 * "count all" behavior until the user sets dates. A payment with no/invalid ngayTT
 * is kept (can't be excluded by date it doesn't have).
 * Used by every per-đợt TT total + the per-day running balance chain.
 */
function paymentsInDotWindow(payments, ngayBatDau, ngayKetThuc) {
    if (!Array.isArray(payments) || payments.length === 0) return [];
    const lo = ngayBatDau ? new Date(ngayBatDau).getTime() : -Infinity;
    const hi = ngayKetThuc ? new Date(ngayKetThuc).getTime() : Infinity;
    if (lo === -Infinity && hi === Infinity) return payments;
    return payments.filter((p) => {
        const t = p && p.ngayTT ? new Date(p.ngayTT).getTime() : NaN;
        if (!Number.isFinite(t)) return true; // no usable date → don't drop it
        return t >= lo && t <= hi;
    });
}
if (typeof window !== 'undefined') {
    window.paymentsInDotWindow = paymentsInDotWindow;
}

/**
 * True nếu ngày (YYYY-MM-DD) nằm trong khoảng đợt [ngayBatDau, ngayKetThuc] (bao gồm 2 đầu).
 * Open-ended khi thiếu 1/2 đầu. Đây là BỘ LỌC NGÀY DUY NHẤT của module (thay cho
 * bộ lọc 30 ngày cũ đã bỏ) — dùng cho danh sách shipment + tổng HĐ/CP của đợt.
 */
function dateInDotWindow(dateStr, ngayBatDau, ngayKetThuc) {
    const lo = ngayBatDau ? new Date(ngayBatDau).getTime() : -Infinity;
    const hi = ngayKetThuc ? new Date(ngayKetThuc).getTime() : Infinity;
    if (lo === -Infinity && hi === Infinity) return true;
    const t = dateStr ? new Date(dateStr).getTime() : NaN;
    if (!Number.isFinite(t)) return true; // không có ngày → không loại
    return t >= lo && t <= hi;
}
if (typeof window !== 'undefined') {
    window.dateInDotWindow = dateInDotWindow;
}

function getAllDotHangAsShipments() {
    const allDotHang = getAllDotHang();

    const byKey = {};
    allDotHang.forEach((dot) => {
        const date = dot.ngayDiHang;
        const dotSo = dot.dotSo || 1;
        const key = `${date}__${dotSo}`;
        if (!byKey[key]) {
            byKey[key] = {
                id: `ship_${date}_d${dotSo}`,
                ngayDiHang: date,
                dotSo: dotSo,
                kienHang: [],
                hoaDon: [],
                tongKien: 0,
                tongKg: 0,
                tongTienHoaDon: 0,
                tongSoMon: 0,
                tongMonThieu: 0,
                chiPhiHangVe: [],
                tongChiPhi: 0,
                ghiChuAdmin: '',
                // Payment data is per-đợt (synced across all NCC rows in the group).
                // Take the first non-empty value we encounter — backend keeps rows in sync.
                thanhToanCK: [],
                tiGia: 0,
                ngayBatDau: null, // per-đợt CK window start (inclusive)
                ngayKetThuc: null, // per-đợt CK window end (inclusive)
                _dotIds: [], // all real DB row IDs for this đợt (used when writing, if ever needed)
            };
        }

        byKey[key].hoaDon.push({
            id: dot.id,
            sttNCC: dot.sttNCC,
            tenNCC: dot.tenNCC,
            sanPham: (dot.sanPham || []).map(normalizeProductData),
            tongTienHD: dot.tongTienHD || 0,
            tongMon: dot.tongMon || 0,
            soMonThieu: dot.soMonThieu || 0,
            ghiChuThieu: dot.ghiChuThieu || '',
            anhHoaDon: dot.anhHoaDon || [],
            ghiChu: dot.ghiChu || '',
            createdAt: dot.createdAt || null,
        });

        if (dot.kienHang && dot.kienHang.length > 0) {
            dot.kienHang.forEach((k, idx) => {
                byKey[key].kienHang.push({ ...k, _dotId: dot.id, _dotKienIdx: idx });
            });
        }
        // chiPhiHangVe is per-đợt (same value mirrored across NCC rows for legacy reasons).
        // Take the first non-empty — concat would N× duplicate costs.
        if (
            (!byKey[key].chiPhiHangVe || byKey[key].chiPhiHangVe.length === 0) &&
            Array.isArray(dot.chiPhiHangVe) &&
            dot.chiPhiHangVe.length > 0
        ) {
            byKey[key].chiPhiHangVe = [...dot.chiPhiHangVe];
        }
        // ghiChuAdmin same semantics — first non-empty wins.
        if (!byKey[key].ghiChuAdmin && dot.ghiChuAdmin) {
            byKey[key].ghiChuAdmin = dot.ghiChuAdmin;
        }

        // Absorb per-đợt payment data from whichever row carries it.
        byKey[key]._dotIds.push(dot.id);
        if (
            (!byKey[key].thanhToanCK || byKey[key].thanhToanCK.length === 0) &&
            Array.isArray(dot.thanhToanCK) &&
            dot.thanhToanCK.length > 0
        ) {
            byKey[key].thanhToanCK = dot.thanhToanCK;
        }
        if (!byKey[key].tiGia && dot.tiGia) {
            byKey[key].tiGia = parseFloat(dot.tiGia) || 0;
        }
        // CK date window — first non-empty wins (per-đợt, synced across rows).
        if (!byKey[key].ngayBatDau && dot.ngayBatDau) byKey[key].ngayBatDau = dot.ngayBatDau;
        if (!byKey[key].ngayKetThuc && dot.ngayKetThuc) byKey[key].ngayKetThuc = dot.ngayKetThuc;
    });

    // Helper fallback nếu table-renderer chưa load (bootstrap order an toàn).
    const _qtyOf = (p) => {
        if (window.getProductEffectiveQty) return window.getProductEffectiveQty(p);
        const t = parseInt(p.tongSoLuong) || 0;
        if (t > 0) return t;
        const mauSum = Array.isArray(p.mauSac)
            ? p.mauSac.reduce((s, m) => s + (parseInt(m.soLuong) || 0), 0)
            : 0;
        if (mauSum > 0) return mauSum;
        return parseInt(p.soLuong) || 0;
    };
    const _amtOf = (p) => _qtyOf(p) * (parseFloat(p.giaDonVi) || 0);

    // Recompute hd-level totals from products để tránh tongTienHD/tongMon stale
    // (vd biến thể chưa nhập SL → tongSoLuong=0 nhưng soLuong=35 → tổng đúng = soLuong).
    Object.values(byKey).forEach((ship) => {
        ship.hoaDon.forEach((hd) => {
            const products = hd.sanPham || [];
            if (products.length > 0) {
                hd.tongTienHD = products.reduce((s, p) => s + _amtOf(p), 0);
                hd.tongMon = products.reduce((s, p) => s + _qtyOf(p), 0);
            }
        });
    });

    const shipments = Object.values(byKey).map((ship) => {
        // Sort NCC invoices by createdAt ASC (cũ trên, mới dưới) — phản ánh thứ tự nhập.
        // Fallback to id-as-string compare khi không có timestamp.
        ship.hoaDon.sort((a, b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (ta !== tb) return ta - tb;
            return String(a.id || '').localeCompare(String(b.id || ''));
        });
        ship.tongKien = ship.kienHang.length;
        ship.tongKg = ship.kienHang.reduce((sum, k) => sum + (k.soKg || 0), 0);
        ship.tongTienHoaDon = ship.hoaDon.reduce((sum, hd) => sum + (hd.tongTienHD || 0), 0);
        ship.tongSoMon = ship.hoaDon.reduce((sum, hd) => sum + (hd.tongMon || 0), 0);
        ship.tongMonThieu = ship.hoaDon.reduce((sum, hd) => sum + (hd.soMonThieu || 0), 0);
        ship.tongChiPhi = ship.chiPhiHangVe.reduce((sum, c) => sum + (c.soTien || 0), 0);
        ship.kienHang = ship.kienHang.map((k, idx) => ({ ...k, stt: idx + 1 }));
        return ship;
    });

    // Sort by date DESC, then dotSo DESC (đợt mới nhất trên cùng)
    return shipments.sort((a, b) => {
        const dateDiff = new Date(b.ngayDiHang) - new Date(a.ngayDiHang);
        if (dateDiff !== 0) return dateDiff;
        return (b.dotSo || 1) - (a.dotSo || 1);
    });
}

/**
 * Aggregate every shipment by dotSo alone (logical "đợt hàng" spans multiple delivery dates).
 * Used by the Payment CK slide-over panel.
 * Returns: [{ dotSo, ngayDiHangList[], tongTienHoaDon, tongChiPhi, thanhToanCK, tiGia }]
 */
function getAllDotsAggregated() {
    // Xây từ shipments ĐÃ GỘP theo (ngày, đợt): CP đã khử trùng lặp NCC
    // (first-non-empty trong getAllDotHangAsShipments), HĐ đã recompute từ sản phẩm.
    // → tránh bug cộng tong_chi_phi trên MỌI dòng NCC (chi phí lưu nhân bản → ×N).
    // Mỗi shipment = 1 nhóm (ngày, đợt) nên HĐ/CP của ngày đó đã đúng, không cần
    // cộng lại theo dòng. Sau đó áp khoảng ngày của đợt (bộ lọc DUY NHẤT) lên HĐ/CP.
    const ships = getAllDotHangAsShipments();
    const byDot = {};

    ships.forEach((sh) => {
        const dotSo = sh.dotSo || 1;
        if (!byDot[dotSo]) {
            byDot[dotSo] = {
                dotSo,
                thanhToanCK: [],
                tiGia: 0,
                ngayBatDau: null,
                ngayKetThuc: null,
                _dotIds: [],
                _hdByDate: {},
                _cpByDate: {},
            };
        }
        const entry = byDot[dotSo];
        // Absorb per-đợt scalars (first non-empty).
        if (
            (!entry.thanhToanCK || entry.thanhToanCK.length === 0) &&
            Array.isArray(sh.thanhToanCK) &&
            sh.thanhToanCK.length > 0
        ) {
            entry.thanhToanCK = sh.thanhToanCK;
        }
        if (!entry.tiGia && sh.tiGia) entry.tiGia = parseFloat(sh.tiGia) || 0;
        if (!entry.ngayBatDau && sh.ngayBatDau) entry.ngayBatDau = sh.ngayBatDau;
        if (!entry.ngayKetThuc && sh.ngayKetThuc) entry.ngayKetThuc = sh.ngayKetThuc;
        if (Array.isArray(sh._dotIds)) entry._dotIds.push(...sh._dotIds);
        const ngay = sh.ngayDiHang;
        if (ngay) {
            entry._hdByDate[ngay] =
                (entry._hdByDate[ngay] || 0) + (parseFloat(sh.tongTienHoaDon) || 0);
            entry._cpByDate[ngay] =
                (entry._cpByDate[ngay] || 0) + (parseFloat(sh.tongChiPhi) || 0);
        }
    });

    return Object.values(byDot)
        .map((entry) => {
            const inWin = (d) =>
                typeof dateInDotWindow === 'function'
                    ? dateInDotWindow(d, entry.ngayBatDau, entry.ngayKetThuc)
                    : true;
            const allDates = new Set([
                ...Object.keys(entry._hdByDate),
                ...Object.keys(entry._cpByDate),
            ]);
            const winDates = [...allDates].filter(inWin);
            const hdByDate = {};
            const cpByDate = {};
            let tongTienHoaDon = 0;
            let tongChiPhi = 0;
            winDates.forEach((d) => {
                const hd = entry._hdByDate[d] || 0;
                const cp = entry._cpByDate[d] || 0;
                tongTienHoaDon += hd;
                tongChiPhi += cp;
                if (hd > 0) hdByDate[d] = hd;
                if (cp > 0) cpByDate[d] = cp;
            });
            return {
                dotSo: entry.dotSo,
                ngayDiHangList: winDates.sort((a, b) => new Date(b) - new Date(a)),
                tongTienHoaDon,
                tongChiPhi,
                thanhToanCK: entry.thanhToanCK,
                tiGia: entry.tiGia,
                ngayBatDau: entry.ngayBatDau,
                ngayKetThuc: entry.ngayKetThuc,
                _dotIds: entry._dotIds,
                hdByDate,
                cpByDate,
            };
        })
        .sort((a, b) => a.dotSo - b.dotSo);
}

/**
 * Find specific datHang in an NCC
 */
function findDatHang(sttNCC, datHangId) {
    const ncc = getNCCById(sttNCC);
    if (!ncc) return null;
    return (ncc.datHang || []).find((dh) => dh.id === datHangId);
}

/**
 * Find specific dotHang in an NCC
 */
function findDotHang(sttNCC, dotHangId) {
    const ncc = getNCCById(sttNCC);
    if (!ncc) return null;
    return (ncc.dotHang || []).find((dot) => dot.id === dotHangId);
}

/**
 * Load prepayments data from API
 */
async function loadPrepaymentsData() {
    console.log('[DATA] Loading prepayments from API...');
    try {
        const rows = await prepaymentsApi.getAll();
        globalState.prepayments = rows.map(pgToPrepayment);
        console.log(`[DATA] Loaded ${globalState.prepayments.length} prepayments`);
    } catch (error) {
        console.error('[DATA] Error loading prepayments:', error);
    }
}

/**
 * Load other expenses data from API
 */
async function loadOtherExpensesData() {
    console.log('[DATA] Loading other expenses from API...');
    try {
        const rows = await otherExpensesApi.getAll();
        globalState.otherExpenses = rows.map(pgToOtherExpense);
        console.log(`[DATA] Loaded ${globalState.otherExpenses.length} other expenses`);
    } catch (error) {
        console.error('[DATA] Error loading other expenses:', error);
    }
}

/**
 * Update NCC filter dropdown options
 */
function updateNCCFilterOptions() {
    const filterNCC = document.getElementById('filterNCC');
    const filterBookingNCC = document.getElementById('filterBookingNCC');

    // Build NCC options: use tenNCC as display, sttNCC or tenNCC as value
    const nccOptions = globalState.nccList
        .filter((ncc) => ncc.sttNCC > 0 || ncc.tenNCC)
        .map((ncc) => ({
            value: ncc.sttNCC > 0 ? String(ncc.sttNCC) : ncc.tenNCC,
            label: ncc.tenNCC || `NCC ${ncc.sttNCC}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    if (filterNCC) {
        const currentValue = filterNCC.value;
        filterNCC.innerHTML = '<option value="all">Tất cả</option>';
        nccOptions.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            filterNCC.appendChild(option);
        });
        filterNCC.value = currentValue || 'all';
    }

    // Refresh datalist của NCC search box (compact input bên cạnh đợt tabs).
    if (window.NCCSearch?.populate) window.NCCSearch.populate();

    if (filterBookingNCC) {
        const currentValue = filterBookingNCC.value;
        filterBookingNCC.innerHTML = '<option value="all">Tất cả NCC</option>';
        nccOptions.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            filterBookingNCC.appendChild(option);
        });
        filterBookingNCC.value = currentValue || 'all';
    }
}

/**
 * Get display name for NCC from most recent entries
 */
function getNCCDisplayName(ncc) {
    if (!ncc) return '';
    if (ncc.tenNCC) return ncc.tenNCC;
    const lastDatHang = (ncc.datHang || []).slice(-1)[0];
    const lastDotHang = (ncc.dotHang || []).slice(-1)[0];
    return lastDatHang?.tenNCC || lastDotHang?.tenNCC || '';
}

/**
 * Generate unique ID
 */
function generateId(prefix = 'id') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
}

console.log('[DATA] Data loader initialized (API mode)');
