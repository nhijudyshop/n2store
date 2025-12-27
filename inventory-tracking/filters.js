// =====================================================
// FILTERS - INVENTORY TRACKING
// Phase 5: Filter shipments by date range, NCC, etc.
// =====================================================

/**
 * Initialize filters
 */
function initFilters() {
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const nccSelect = document.getElementById('filterNCC');
    const productInput = document.getElementById('filterProduct');
    const btnClear = document.getElementById('btnClearFilters');

    // Quick date buttons
    const btn7Days = document.getElementById('btn7Days');
    const btn15Days = document.getElementById('btn15Days');
    const btn30Days = document.getElementById('btn30Days');

    // Set default date range (last 30 days)
    if (dateFromInput && !dateFromInput.value) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        dateFromInput.value = thirtyDaysAgo.toISOString().split('T')[0];
    }
    if (dateToInput && !dateToInput.value) {
        dateToInput.value = new Date().toISOString().split('T')[0];
    }

    // Event listeners for quick date buttons
    btn7Days?.addEventListener('click', () => setQuickDateRange(7, btn7Days));
    btn15Days?.addEventListener('click', () => setQuickDateRange(15, btn15Days));
    btn30Days?.addEventListener('click', () => setQuickDateRange(30, btn30Days));

    // Event listeners for real-time filtering
    dateFromInput?.addEventListener('change', () => {
        clearQuickDateButtonActive();
        applyFilters();
    });
    dateToInput?.addEventListener('change', () => {
        clearQuickDateButtonActive();
        applyFilters();
    });
    nccSelect?.addEventListener('change', applyFilters);

    // Product search with debounce
    let searchTimeout;
    productInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            globalState.searchQuery = productInput.value.trim();
            applyFiltersAndRender();
        }, 300);
    });

    // Clear button
    btnClear?.addEventListener('click', clearFilters);

    // Auto-apply on enter
    [dateFromInput, dateToInput, productInput].forEach(input => {
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                applyFilters();
            }
        });
    });

    // Initialize with 30 days active
    btn30Days?.classList.add('active');
}

/**
 * Set quick date range
 */
function setQuickDateRange(days, activeBtn) {
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');

    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - days);

    if (dateFromInput) {
        dateFromInput.value = pastDate.toISOString().split('T')[0];
    }
    if (dateToInput) {
        dateToInput.value = now.toISOString().split('T')[0];
    }

    // Update active button state
    clearQuickDateButtonActive();
    activeBtn?.classList.add('active');

    applyFilters();
}

/**
 * Clear active state from all quick date buttons
 */
function clearQuickDateButtonActive() {
    document.querySelectorAll('.btn-quick-date').forEach(btn => {
        btn.classList.remove('active');
    });
}

/**
 * Apply filters to data
 */
function applyFilters() {
    const dateFrom = document.getElementById('filterDateFrom')?.value;
    const dateTo = document.getElementById('filterDateTo')?.value;
    const ncc = document.getElementById('filterNCC')?.value?.trim();

    globalState.filters = {
        dateFrom,
        dateTo,
        ncc
    };

    applyFiltersAndRender();
}

/**
 * Clear all filters
 */
function clearFilters() {
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const nccSelect = document.getElementById('filterNCC');
    const productInput = document.getElementById('filterProduct');

    // Reset to 30 days range
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (dateFromInput) dateFromInput.value = thirtyDaysAgo.toISOString().split('T')[0];
    if (dateToInput) dateToInput.value = now.toISOString().split('T')[0];
    if (nccSelect) nccSelect.value = 'all';
    if (productInput) productInput.value = '';

    // Set 30N button as active
    clearQuickDateButtonActive();
    document.getElementById('btn30Days')?.classList.add('active');

    globalState.filters = {
        dateFrom: thirtyDaysAgo.toISOString().split('T')[0],
        dateTo: now.toISOString().split('T')[0],
        ncc: 'all'
    };
    globalState.searchQuery = '';

    applyFiltersAndRender();
}

/**
 * Apply filters and render
 */
function applyFiltersAndRender() {
    const { shipments, filters, searchQuery } = globalState;

    let filtered = [...shipments];

    // Filter by date range
    if (filters.dateFrom) {
        filtered = filtered.filter(s => s.ngayDiHang >= filters.dateFrom);
    }
    if (filters.dateTo) {
        filtered = filtered.filter(s => s.ngayDiHang <= filters.dateTo);
    }

    // Filter by NCC (skip if "all" is selected)
    if (filters.ncc && filters.ncc !== 'all') {
        const nccNum = parseInt(filters.ncc);
        filtered = filtered.filter(s =>
            (s.hoaDon || []).some(hd => hd.sttNCC === nccNum)
        );
    }

    // Filter by product code search
    if (searchQuery) {
        const query = searchQuery.toUpperCase();
        filtered = filtered.filter(s =>
            (s.hoaDon || []).some(hd =>
                (hd.sanPham || []).some(p =>
                    (p.maSP || '').toUpperCase().includes(query) ||
                    (p.rawText || '').toUpperCase().includes(query)
                )
            )
        );
    }

    globalState.filteredShipments = filtered;

    // Render based on current tab
    if (globalState.currentTab === 'tracking') {
        renderShipments(filtered);
    } else {
        renderFinanceTable();
    }

    // Update count
    updateFilterCount(filtered.length, shipments.length);
}

/**
 * Update filter count display
 */
function updateFilterCount(filtered, total) {
    const countEl = document.getElementById('filterCount');
    if (countEl) {
        if (filtered === total) {
            countEl.textContent = `${total} đợt hàng`;
        } else {
            countEl.textContent = `${filtered}/${total} đợt hàng`;
        }
    }
}

console.log('[FILTER] Filters initialized');
