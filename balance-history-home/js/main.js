// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// BALANCE HISTORY HOME - MAIN INIT
// Khởi tạo page Home: set default date, wire event listeners,
// load data + statistics, auto-connect SSE.
// =====================================================
//
// Script load order (defined in index.html):
//   1. config.js               - CONFIG.API_BASE_URL
//   2. room-codes.js           - window.ROOM_CODES (placeholder)
//   3. balance-core.js         - state, helpers, data loading, SSE
//   4. balance-filters.js      - filter system + type chips
//   5. balance-table.js        - table rendering + room dropdown handler
//   6. main.js (this file)     - init + event wiring
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Set default date range (last 30 days)
    setDefaultCurrentMonth();

    // Wire all event listeners
    setupEventListeners();
    setupTypeChips();

    // Load initial data
    await Promise.all([
        loadData(),
        loadStatistics(),
    ]);
});

// Auto-connect SSE on page load (slight delay so DOM is fully ready)
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        connectRealtimeUpdates();
    }, 1000);
});

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {
    // Quick filter buttons (today / yesterday / thisWeek / ...)
    document.querySelectorAll('.btn-quick-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.getAttribute('data-filter');
            applyQuickFilter(filterType);
        });
    });

    // Toggle filters container (collapsible)
    const toggleBtn = document.getElementById('toggleFiltersBtn');
    const filtersContainer = document.getElementById('filtersContainer');
    if (toggleBtn && filtersContainer) {
        toggleBtn.addEventListener('click', () => {
            const isHidden = filtersContainer.hasAttribute('hidden');
            if (isHidden) {
                filtersContainer.removeAttribute('hidden');
                toggleBtn.textContent = 'Ẩn bộ lọc';
            } else {
                filtersContainer.setAttribute('hidden', '');
                toggleBtn.textContent = 'Hiện bộ lọc';
            }
        });
    }

    // Real-time search with debounce
    const filterSearchInput = document.getElementById('filterSearch');
    if (filterSearchInput) {
        let searchTimeout;
        filterSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filters.search = e.target.value;
                currentPage = 1;
                loadData();
            }, 500);
        });
    }

    // Apply filters button
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
            currentPage = 1;
            applyFilters();
            loadData();
            loadStatistics();
            document.querySelectorAll('.btn-quick-filter').forEach(btn => btn.classList.remove('active'));
        });
    }

    // Reset filters button
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            resetFilters();
            currentPage = 1;
            loadData();
            loadStatistics();
        });
    }

    // Pagination
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                loadData();
            }
        });
    }
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                loadData();
            }
        });
    }

    // Enter key in filter inputs → apply filters
    document.querySelectorAll('.filter-input, .filter-select').forEach(el => {
        el.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && applyFiltersBtn) {
                applyFiltersBtn.click();
            }
        });
    });

    // Date input changes — sync display + clear quick filter active state
    const startDateEl = document.getElementById('filterStartDate');
    const endDateEl = document.getElementById('filterEndDate');
    const startDisplay = document.getElementById('filterStartDateDisplay');
    const endDisplay = document.getElementById('filterEndDateDisplay');

    if (startDateEl) {
        startDateEl.addEventListener('change', (e) => {
            document.querySelectorAll('.btn-quick-filter').forEach(btn => btn.classList.remove('active'));
            if (startDisplay) startDisplay.value = formatDateDisplay(e.target.value);
        });
    }
    if (endDateEl) {
        endDateEl.addEventListener('change', (e) => {
            document.querySelectorAll('.btn-quick-filter').forEach(btn => btn.classList.remove('active'));
            if (endDisplay) endDisplay.value = formatDateDisplay(e.target.value);
        });
    }

    if (startDisplay) {
        startDisplay.addEventListener('blur', () => {
            const parsed = parseDateDisplay(startDisplay.value);
            if (parsed && startDateEl) {
                startDisplay.value = formatDateDisplay(parsed);
                startDateEl.value = parsed;
                document.querySelectorAll('.btn-quick-filter').forEach(btn => btn.classList.remove('active'));
            }
        });
    }
    if (endDisplay) {
        endDisplay.addEventListener('blur', () => {
            const parsed = parseDateDisplay(endDisplay.value);
            if (parsed && endDateEl) {
                endDisplay.value = formatDateDisplay(parsed);
                endDateEl.value = parsed;
                document.querySelectorAll('.btn-quick-filter').forEach(btn => btn.classList.remove('active'));
            }
        });
    }
}
