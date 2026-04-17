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
        globalState.nccList = suppliers.map(s => ({
            id: `ncc_${s.stt_ncc}`,
            sttNCC: s.stt_ncc,
            tenNCC: s.ten_ncc,
            datHang: [],
            dotHang: []
        }));

        // Sort by sttNCC
        globalState.nccList.sort((a, b) => (a.sttNCC || 0) - (b.sttNCC || 0));
        globalState.filteredNCCList = [...globalState.nccList];

        console.log(`[DATA] Loaded ${globalState.nccList.length} NCC documents`);

        // Load order bookings, shipments, and product images
        await Promise.all([
            loadAndAttachOrderBookings(),
            loadAndAttachShipments(),
            loadProductImages()
        ]);

        // Flatten data for backward compatibility
        flattenNCCData();

        // Update NCC filter options
        updateNCCFilterOptions();

        // Apply filters and render
        if (typeof applyFiltersAndRender === 'function') {
            applyFiltersAndRender();
        }

        // Setup realtime sync for product images (cross-device)
        setupProductImagesRealtimeSync();

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

        // Attach to nccList
        bookings.forEach(b => {
            const ncc = globalState.nccList.find(n => n.sttNCC === b.sttNCC);
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

        // Attach to nccList
        shipments.forEach(s => {
            const ncc = globalState.nccList.find(n => n.sttNCC === s.sttNCC);
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
        globalState.productImages = images.map(img => ({
            ...img,
            urls: typeof img.urls === 'string' ? JSON.parse(img.urls) : (img.urls || [])
        }));
        console.log(`[DATA] Loaded ${globalState.productImages.length} product image groups`);
    } catch (error) {
        console.error('[DATA] Error loading product images:', error);
        globalState.productImages = [];
    }
}

/**
 * Setup SSE realtime listener for product images
 * When another device saves images, this device auto-updates
 */
function setupProductImagesRealtimeSync() {
    if (typeof RealtimeClient === 'undefined') {
        console.log('[DATA] RealtimeClient not available, skipping realtime sync for product images');
        return;
    }

    try {
        const client = new RealtimeClient('https://n2store-fallback.onrender.com');
        client.connect(['product_images']);

        client.on('product_images', (data) => {
            console.log('[DATA] Product images updated via SSE');

            if (data && data.data) {
                // Full update: replace all product images
                globalState.productImages = data.data.map(img => ({
                    ...img,
                    urls: typeof img.urls === 'string' ? JSON.parse(img.urls) : (img.urls || [])
                }));
            } else {
                // Deleted or partial update: reload from API
                loadProductImages();
            }

            // Re-render table to reflect new images
            if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
        });

        console.log('[DATA] Product images realtime sync enabled');
    } catch (error) {
        console.error('[DATA] Error setting up product images realtime sync:', error);
    }
}

/**
 * Get product images for a specific NCC
 * Returns matching urls array
 */
function getProductImagesForNcc(ncc) {
    if (!ncc) return [];
    const nccNum = parseInt(ncc);
    const images = globalState.productImages || [];
    const match = images.find(img => img.ncc === nccNum);
    return match ? (match.urls || []) : [];
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

    console.log(`[DATA] Flattened: ${globalState.orderBookings.length} datHang, ${globalState.shipments.length} shipments`);
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
    return globalState.nccList.find(ncc => ncc.sttNCC === sttNCC);
}

/**
 * Get NCC document by document ID (ncc_1, ncc_2, etc.)
 */
function getNCCByDocId(docId) {
    return globalState.nccList.find(ncc => ncc.id === docId);
}

/**
 * Get or create NCC document (via API)
 */
async function getOrCreateNCC(sttNCC) {
    const existing = getNCCById(sttNCC);
    if (existing) return existing;

    // Create via API
    await suppliersApi.create(sttNCC, null);

    const newNCC = {
        id: `ncc_${sttNCC}`,
        sttNCC: sttNCC,
        datHang: [],
        dotHang: []
    };

    globalState.nccList.push(newNCC);
    globalState.nccList.sort((a, b) => (a.sttNCC || 0) - (b.sttNCC || 0));

    console.log(`[DATA] Created new NCC: ncc_${sttNCC}`);
    return newNCC;
}

/**
 * Get all datHang (order bookings) flattened from all NCCs
 */
function getAllDatHang() {
    const all = [];
    globalState.nccList.forEach(ncc => {
        (ncc.datHang || []).forEach(dh => {
            all.push({
                ...dh,
                sttNCC: ncc.sttNCC,
                nccDocId: ncc.id,
                id: dh.id || `${ncc.id}_dh_${dh.ngayDatHang}`
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
    globalState.nccList.forEach(ncc => {
        (ncc.dotHang || []).forEach(dot => {
            all.push({
                ...dot,
                sttNCC: ncc.sttNCC,
                nccDocId: ncc.id,
                id: dot.id || `${ncc.id}_dot_${dot.ngayDiHang}`
            });
        });
    });
    return all.sort((a, b) => new Date(b.ngayDiHang) - new Date(a.ngayDiHang));
}

/**
 * Normalize product data to new structure with backward compatibility
 */
function normalizeProductData(product) {
    if (!product) return product;

    if (product.mauSac !== undefined) {
        return {
            ...product,
            tongSoLuong: product.tongSoLuong ||
                        (product.mauSac && product.mauSac.length > 0
                            ? product.mauSac.reduce((sum, c) => sum + (c.soLuong || 0), 0)
                            : product.soLuong || 0)
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
        aiExtracted: product.aiExtracted || false
    };
}

/**
 * Get all dotHang restructured as shipments (grouped by ngayDiHang)
 */
function getAllDotHangAsShipments() {
    const allDotHang = getAllDotHang();

    const byDate = {};
    allDotHang.forEach(dot => {
        const date = dot.ngayDiHang;
        if (!byDate[date]) {
            byDate[date] = {
                id: `ship_${date}`,
                ngayDiHang: date,
                kienHang: [],
                hoaDon: [],
                tongKien: 0,
                tongKg: 0,
                tongTienHoaDon: 0,
                tongSoMon: 0,
                tongMonThieu: 0,
                chiPhiHangVe: [],
                tongChiPhi: 0
            };
        }

        byDate[date].hoaDon.push({
            id: dot.id,
            sttNCC: dot.sttNCC,
            tenNCC: dot.tenNCC,
            sanPham: (dot.sanPham || []).map(normalizeProductData),
            tongTienHD: dot.tongTienHD || 0,
            tongMon: dot.tongMon || 0,
            soMonThieu: dot.soMonThieu || 0,
            ghiChuThieu: dot.ghiChuThieu || '',
            anhHoaDon: dot.anhHoaDon || [],
            anhSanPham: dot.anhSanPham || {},
            ghiChu: dot.ghiChu || ''
        });

        if (dot.kienHang && dot.kienHang.length > 0) {
            byDate[date].kienHang.push(...dot.kienHang);
        }
        if (dot.chiPhiHangVe && dot.chiPhiHangVe.length > 0) {
            byDate[date].chiPhiHangVe.push(...dot.chiPhiHangVe);
        }
    });

    const shipments = Object.values(byDate).map(ship => {
        ship.tongKien = ship.kienHang.length;
        ship.tongKg = ship.kienHang.reduce((sum, k) => sum + (k.soKg || 0), 0);
        ship.tongTienHoaDon = ship.hoaDon.reduce((sum, hd) => sum + (hd.tongTienHD || 0), 0);
        ship.tongSoMon = ship.hoaDon.reduce((sum, hd) => sum + (hd.tongMon || 0), 0);
        ship.tongMonThieu = ship.hoaDon.reduce((sum, hd) => sum + (hd.soMonThieu || 0), 0);
        ship.tongChiPhi = ship.chiPhiHangVe.reduce((sum, c) => sum + (c.soTien || 0), 0);
        ship.kienHang = ship.kienHang.map((k, idx) => ({ ...k, stt: idx + 1 }));
        return ship;
    });

    return shipments.sort((a, b) => new Date(b.ngayDiHang) - new Date(a.ngayDiHang));
}

/**
 * Find specific datHang in an NCC
 */
function findDatHang(sttNCC, datHangId) {
    const ncc = getNCCById(sttNCC);
    if (!ncc) return null;
    return (ncc.datHang || []).find(dh => dh.id === datHangId);
}

/**
 * Find specific dotHang in an NCC
 */
function findDotHang(sttNCC, dotHangId) {
    const ncc = getNCCById(sttNCC);
    if (!ncc) return null;
    return (ncc.dotHang || []).find(dot => dot.id === dotHangId);
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

    const nccs = globalState.nccList
        .map(ncc => ncc.sttNCC)
        .filter(Boolean)
        .sort((a, b) => a - b);

    if (filterNCC) {
        const currentValue = filterNCC.value;
        filterNCC.innerHTML = '<option value="all">Tất cả</option>';
        nccs.forEach(ncc => {
            const nccDoc = getNCCById(ncc);
            const tenNCC = getNCCDisplayName(nccDoc);
            const option = document.createElement('option');
            option.value = ncc;
            option.textContent = tenNCC ? `NCC ${ncc} - ${tenNCC}` : `NCC ${ncc}`;
            filterNCC.appendChild(option);
        });
        if (currentValue && nccs.includes(parseInt(currentValue))) {
            filterNCC.value = currentValue;
        }
    }

    if (filterBookingNCC) {
        const currentValue = filterBookingNCC.value;
        filterBookingNCC.innerHTML = '<option value="all">Tất cả NCC</option>';
        nccs.forEach(ncc => {
            const nccDoc = getNCCById(ncc);
            const tenNCC = getNCCDisplayName(nccDoc);
            const option = document.createElement('option');
            option.value = ncc;
            option.textContent = tenNCC ? `NCC ${ncc} - ${tenNCC}` : `NCC ${ncc}`;
            filterBookingNCC.appendChild(option);
        });
        if (currentValue && nccs.includes(parseInt(currentValue))) {
            filterBookingNCC.value = currentValue;
        }
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
