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
    const nccInput = document.getElementById('filterNCC');
    const btnApply = document.getElementById('btnApplyFilter');
    const btnClear = document.getElementById('btnClearFilter');

    // Set default date range (current month)
    if (dateFromInput && !dateFromInput.value) {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFromInput.value = firstDay.toISOString().split('T')[0];
    }
    if (dateToInput && !dateToInput.value) {
        dateToInput.value = new Date().toISOString().split('T')[0];
    }

    // Event listeners
    btnApply?.addEventListener('click', applyFilters);
    btnClear?.addEventListener('click', clearFilters);

    // Auto-apply on enter
    [dateFromInput, dateToInput, nccInput].forEach(input => {
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                applyFilters();
            }
        });
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
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterNCC').value = '';
    document.getElementById('filterProductCode').value = '';

    globalState.filters = {};
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

    // Filter by NCC
    if (filters.ncc) {
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
            countEl.textContent = `${total} dot hang`;
        } else {
            countEl.textContent = `${filtered}/${total} dot hang`;
        }
    }
}

console.log('[FILTER] Filters initialized');
