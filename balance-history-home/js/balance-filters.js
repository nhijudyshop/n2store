// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// BALANCE HISTORY HOME - FILTERS MODULE
// Filter system, date range, search, quick filters, type chips (In/Out)
// =====================================================

// NOTE: Depends on balance-core.js for state (filters, currentPage, currentQuickFilter)
//       and helpers (formatDateDisplay, updateDateDisplayInputs, parseDateDisplay, loadData, loadStatistics)

// Set Default Current Month (last 30 days)
function setDefaultCurrentMonth() {
    const today = new Date();

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 29);

    const startYear = startDate.getFullYear();
    const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
    const startDay = String(startDate.getDate()).padStart(2, '0');
    const firstDay = `${startYear}-${startMonth}-${startDay}`;

    const endYear = today.getFullYear();
    const endMonth = String(today.getMonth() + 1).padStart(2, '0');
    const endDay = String(today.getDate()).padStart(2, '0');
    const lastDay = `${endYear}-${endMonth}-${endDay}`;

    document.getElementById('filterStartDate').value = firstDay;
    document.getElementById('filterEndDate').value = lastDay;
    updateDateDisplayInputs(firstDay, lastDay);

    filters.startDate = firstDay;
    filters.endDate = lastDay;
}

// Quick Filter Date Ranges
function getQuickFilterDates(filterType) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate, endDate;

    switch (filterType) {
        case 'today':
            startDate = new Date(today);
            endDate = new Date(today);
            break;
        case 'yesterday':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(startDate);
            break;
        case 'thisWeek': {
            startDate = new Date(today);
            const dayOfWeek = startDate.getDay();
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            startDate.setDate(startDate.getDate() + diffToMonday);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            break;
        }
        case 'lastWeek': {
            startDate = new Date(today);
            const lastWeekDay = startDate.getDay();
            const diffToLastMonday = lastWeekDay === 0 ? -13 : -6 - lastWeekDay;
            startDate.setDate(startDate.getDate() + diffToLastMonday);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            break;
        }
        case 'thisMonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case 'lastMonth':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;
        case 'last7days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 6);
            endDate = new Date(today);
            break;
        case 'last30days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 29);
            endDate = new Date(today);
            break;
        default:
            return null;
    }

    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };
}

// Apply Quick Filter
function applyQuickFilter(filterType) {
    const dates = getQuickFilterDates(filterType);
    if (!dates) return;

    document.getElementById('filterStartDate').value = dates.startDate;
    document.getElementById('filterEndDate').value = dates.endDate;
    updateDateDisplayInputs(dates.startDate, dates.endDate);

    filters.startDate = dates.startDate;
    filters.endDate = dates.endDate;

    document.querySelectorAll('.btn-quick-filter').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-filter="${filterType}"]`)?.classList.add('active');

    currentQuickFilter = filterType;

    currentPage = 1;
    loadData();
    loadStatistics();
}

// Apply Filters - reads form values into filters state
function applyFilters() {
    const typeEl = document.getElementById('filterType');
    const gatewayEl = document.getElementById('filterGateway');
    const amountEl = document.getElementById('filterAmount');

    filters.type = typeEl ? typeEl.value : (filters.type || '');
    filters.gateway = gatewayEl ? gatewayEl.value : '';
    filters.startDate = document.getElementById('filterStartDate').value;
    filters.endDate = document.getElementById('filterEndDate').value;
    filters.search = document.getElementById('filterSearch').value;
    filters.amount = amountEl ? parseAmountInput(amountEl.value) : '';
}

// Parse amount input (supports 100000, 100k, 1m, 1.5tr)
function parseAmountInput(input) {
    if (!input) return '';
    let normalized = input.trim().toLowerCase();

    if (normalized.endsWith('k')) {
        const num = parseFloat(normalized.slice(0, -1).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000));
    }
    if (normalized.endsWith('m')) {
        const num = parseFloat(normalized.slice(0, -1).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000000));
    }
    if (normalized.endsWith('tr')) {
        const num = parseFloat(normalized.slice(0, -2).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000000));
    }

    const numericOnly = normalized.replace(/[^\d]/g, '');
    return numericOnly || '';
}

// Reset Filters to default
function resetFilters() {
    const typeEl = document.getElementById('filterType');
    const gatewayEl = document.getElementById('filterGateway');
    const amountEl = document.getElementById('filterAmount');

    if (typeEl) typeEl.value = '';
    if (gatewayEl) gatewayEl.value = '';
    document.getElementById('filterSearch').value = '';
    if (amountEl) amountEl.value = '';

    setDefaultCurrentMonth();

    document.querySelectorAll('.btn-quick-filter').forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-filter="last30days"]')?.classList.add('active');
    currentQuickFilter = 'last30days';

    filters.type = '';
    filters.gateway = '';
    filters.search = '';
    filters.amount = '';

    // Reset type chips
    document.querySelectorAll('.type-chips .chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.type-chips .chip[data-type="all"]')?.classList.add('active');
}

// =====================================================
// TYPE FILTER CHIPS (Tất cả / Tiền vào / Tiền ra)
// =====================================================

function setupTypeChips() {
    const chips = document.querySelectorAll('.type-chips .chip');
    if (chips.length === 0) return;

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.type-chips .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const type = chip.dataset.type;
            filters.type = type === 'all' ? '' : type;
            currentPage = 1;
            loadData();
        });
    });
}

window.setupTypeChips = setupTypeChips;
