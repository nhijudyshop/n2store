// =====================================================
// DATA LOADER - INVENTORY TRACKING
// Phase 2: Will be fully implemented
// =====================================================

/**
 * Load shipments data from Firestore
 */
async function loadShipmentsData() {
    console.log('[DATA] Loading shipments...');

    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');

    try {
        globalState.isLoading = true;

        if (!shipmentsRef) {
            console.warn('[DATA] Firestore not initialized');
            globalState.shipments = [];
            globalState.filteredShipments = [];
            // Show empty state when Firestore is not initialized
            if (loadingState) loadingState.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        // Add timeout to prevent infinite hanging
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), 15000)
        );

        const queryPromise = shipmentsRef
            .orderBy('ngayDiHang', 'desc')
            .get();

        const snapshot = await Promise.race([queryPromise, timeoutPromise]);

        globalState.shipments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`[DATA] Loaded ${globalState.shipments.length} shipments`);

        // Apply filters and render
        applyFiltersAndRender();

    } catch (error) {
        console.error('[DATA] Error loading shipments:', error);
        globalState.shipments = [];
        globalState.filteredShipments = [];
        // Hide loading and show empty state on error
        if (loadingState) loadingState.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        // Show error message
        if (window.toast) {
            toast.error('Không thể tải dữ liệu: ' + (error.message || 'Lỗi không xác định'));
        }
    } finally {
        globalState.isLoading = false;
    }
}

/**
 * Load prepayments data
 */
async function loadPrepaymentsData() {
    console.log('[DATA] Loading prepayments...');

    try {
        if (!prepaymentsRef) return;

        const snapshot = await prepaymentsRef
            .orderBy('ngay', 'desc')
            .get();

        globalState.prepayments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`[DATA] Loaded ${globalState.prepayments.length} prepayments`);

    } catch (error) {
        console.error('[DATA] Error loading prepayments:', error);
    }
}

/**
 * Load other expenses data
 */
async function loadOtherExpensesData() {
    console.log('[DATA] Loading other expenses...');

    try {
        if (!otherExpensesRef) return;

        const snapshot = await otherExpensesRef
            .orderBy('ngay', 'desc')
            .get();

        globalState.otherExpenses = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`[DATA] Loaded ${globalState.otherExpenses.length} other expenses`);

    } catch (error) {
        console.error('[DATA] Error loading other expenses:', error);
    }
}

/**
 * Apply filters and render
 */
function applyFiltersAndRender() {
    const { dateFrom, dateTo, ncc, product } = globalState.filters;

    let filtered = [...globalState.shipments];

    // Filter by date range
    if (dateFrom) {
        filtered = filtered.filter(s => s.ngayDiHang >= dateFrom);
    }
    if (dateTo) {
        filtered = filtered.filter(s => s.ngayDiHang <= dateTo);
    }

    // Filter by NCC
    if (ncc && ncc !== 'all') {
        filtered = filtered.filter(s =>
            s.hoaDon?.some(hd => String(hd.sttNCC) === String(ncc))
        );
    }

    // Filter by product code
    if (product) {
        const searchTerm = product.toLowerCase();
        filtered = filtered.filter(s =>
            s.hoaDon?.some(hd =>
                hd.sanPham?.some(sp =>
                    sp.maSP?.toLowerCase().includes(searchTerm) ||
                    sp.rawText?.toLowerCase().includes(searchTerm)
                )
            )
        );
    }

    globalState.filteredShipments = filtered;

    // Update filter count
    const filterCount = document.getElementById('filterCount');
    if (filterCount) {
        filterCount.textContent = `${filtered.length} dot hang`;
    }

    // Render shipments
    if (typeof renderShipments === 'function') {
        renderShipments(filtered);
    }

    // Update NCC filter options
    updateNCCFilterOptions();
}

/**
 * Update NCC filter dropdown options
 */
function updateNCCFilterOptions() {
    const filterNCC = document.getElementById('filterNCC');
    if (!filterNCC) return;

    // Get unique NCCs from all shipments
    const nccSet = new Set();
    globalState.shipments.forEach(s => {
        s.hoaDon?.forEach(hd => {
            if (hd.sttNCC) nccSet.add(hd.sttNCC);
        });
    });

    // Sort NCCs
    const nccs = Array.from(nccSet).sort((a, b) => a - b);

    // Keep current value
    const currentValue = filterNCC.value;

    // Rebuild options
    filterNCC.innerHTML = '<option value="all">Tat ca</option>';
    nccs.forEach(ncc => {
        const option = document.createElement('option');
        option.value = ncc;
        option.textContent = `NCC ${ncc}`;
        filterNCC.appendChild(option);
    });

    // Restore value if still valid
    if (currentValue && nccs.includes(parseInt(currentValue))) {
        filterNCC.value = currentValue;
    }
}

console.log('[DATA] Data loader initialized');
