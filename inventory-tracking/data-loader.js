// =====================================================
// DATA LOADER - INVENTORY TRACKING
// Phase 2: Will be fully implemented
// =====================================================

/**
 * Load shipments data from Firestore
 */
async function loadShipmentsData() {
    console.log('[DATA] Loading shipments...');

    try {
        globalState.isLoading = true;

        if (!shipmentsRef) {
            console.warn('[DATA] Firestore not initialized');
            return;
        }

        const snapshot = await shipmentsRef
            .orderBy('ngayDiHang', 'desc')
            .get();

        globalState.shipments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`[DATA] Loaded ${globalState.shipments.length} shipments`);

        // Update NCC filter options
        updateNCCFilterOptions();

        // Apply filters and render
        if (typeof applyFiltersAndRender === 'function') {
            applyFiltersAndRender();
        }

    } catch (error) {
        console.error('[DATA] Error loading shipments:', error);
        throw error;
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

// Note: applyFiltersAndRender is defined in filters.js

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
