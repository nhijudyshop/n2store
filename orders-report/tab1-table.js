/**
 * TAB1-TABLE.JS - Table Rendering Module
 * Handles table rendering, infinite scroll, row creation, stats
 * Depends on: tab1-core.js
 */

// =====================================================
// TABLE RENDERING CONSTANTS
// =====================================================
const INITIAL_RENDER_COUNT = 50;
const LOAD_MORE_COUNT = 50;

// Module state
let renderedCount = 0;
let isLoadingMore = false;

// =====================================================
// MAIN RENDER FUNCTION
// =====================================================
function renderTable() {
    const state = window.tab1State;
    const displayedData = state.displayedData;
    const isAdmin = window.isAdminUser || false;

    // Reset rendered count
    renderedCount = 0;

    if (!displayedData || displayedData.length === 0) {
        const tbody = document.getElementById('tableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="20" style="text-align: center; padding: 40px; color: #6b7280;">
                        <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>
                        Không có đơn hàng nào
                    </td>
                </tr>`;
        }
        updateStats();
        updatePageInfo();
        return;
    }

    // Check render mode: by employee or all
    if (isAdmin && window.employeeRanges && window.employeeRanges.length > 0) {
        renderByEmployee();
    } else {
        renderAllOrders();
    }

    // Update stats and page info
    updateStats();
    updatePageInfo();
    updateActionButtons();

    // Update sort icons
    if (typeof updateSortIcons === 'function') {
        updateSortIcons();
    }
}

// =====================================================
// RENDER ALL ORDERS (Single Table with Infinite Scroll)
// =====================================================
function renderAllOrders() {
    const state = window.tab1State;
    const displayedData = state.displayedData;
    const selectedOrderIds = state.selectedOrderIds;

    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    // Initial render - only first batch
    const initialData = displayedData.slice(0, INITIAL_RENDER_COUNT);
    renderedCount = initialData.length;

    // Build HTML for initial rows
    const rowsHTML = initialData.map((order, index) => {
        return createRowHTML(order, index, selectedOrderIds);
    }).join('');

    tbody.innerHTML = rowsHTML;

    // Setup infinite scroll if more data
    if (displayedData.length > INITIAL_RENDER_COUNT) {
        setupInfiniteScroll();
    }

    console.log(`[TABLE] Rendered ${renderedCount}/${displayedData.length} orders`);
}

// =====================================================
// RENDER BY EMPLOYEE (Grouped Tables)
// =====================================================
function renderByEmployee() {
    const state = window.tab1State;
    const displayedData = state.displayedData;
    const selectedOrderIds = state.selectedOrderIds;
    const employeeRanges = window.employeeRanges || [];

    const container = document.getElementById('employeeTablesContainer') || document.getElementById('tableBody')?.parentElement;
    if (!container) return;

    // Group orders by employee
    const employeeGroups = {};
    const unassignedOrders = [];

    displayedData.forEach(order => {
        const stt = parseInt(order.SessionIndex) || 0;
        let assigned = false;

        for (const range of employeeRanges) {
            const from = parseInt(range.from) || 0;
            const to = parseInt(range.to) || 999999;
            if (stt >= from && stt <= to) {
                const key = range.name || `${from}-${to}`;
                if (!employeeGroups[key]) {
                    employeeGroups[key] = {
                        name: range.name,
                        from: from,
                        to: to,
                        orders: []
                    };
                }
                employeeGroups[key].orders.push(order);
                assigned = true;
                break;
            }
        }

        if (!assigned) {
            unassignedOrders.push(order);
        }
    });

    // Build HTML for each employee section
    let html = '';

    Object.keys(employeeGroups).sort().forEach(key => {
        const group = employeeGroups[key];
        const ordersHTML = group.orders.slice(0, INITIAL_RENDER_COUNT).map((order, index) => {
            return createRowHTML(order, index, selectedOrderIds);
        }).join('');

        html += `
            <div class="employee-section" data-employee="${key}">
                <div class="employee-header" onclick="toggleEmployeeSection('${key}')">
                    <span class="employee-name">
                        <i class="fas fa-user"></i> ${group.name || key}
                        <span class="order-count">(${group.orders.length} đơn)</span>
                    </span>
                    <span class="employee-range">STT ${group.from} - ${group.to}</span>
                    <i class="fas fa-chevron-down toggle-icon"></i>
                </div>
                <div class="employee-orders">
                    <table class="orders-table">
                        <thead>
                            ${getTableHeaderHTML()}
                        </thead>
                        <tbody>
                            ${ordersHTML}
                        </tbody>
                    </table>
                </div>
            </div>`;
    });

    // Add unassigned orders if any
    if (unassignedOrders.length > 0) {
        const unassignedHTML = unassignedOrders.slice(0, INITIAL_RENDER_COUNT).map((order, index) => {
            return createRowHTML(order, index, selectedOrderIds);
        }).join('');

        html += `
            <div class="employee-section" data-employee="unassigned">
                <div class="employee-header" onclick="toggleEmployeeSection('unassigned')">
                    <span class="employee-name">
                        <i class="fas fa-question-circle"></i> Chưa phân công
                        <span class="order-count">(${unassignedOrders.length} đơn)</span>
                    </span>
                    <i class="fas fa-chevron-down toggle-icon"></i>
                </div>
                <div class="employee-orders">
                    <table class="orders-table">
                        <thead>
                            ${getTableHeaderHTML()}
                        </thead>
                        <tbody>
                            ${unassignedHTML}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    // If using employeeTablesContainer
    const tablesContainer = document.getElementById('employeeTablesContainer');
    if (tablesContainer) {
        tablesContainer.innerHTML = html;
        tablesContainer.style.display = 'block';
        // Hide main table
        const mainTable = document.getElementById('ordersTable');
        if (mainTable) mainTable.style.display = 'none';
    } else {
        // Fallback: replace tbody content with a message
        const tbody = document.getElementById('tableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="20">${html}</td></tr>`;
        }
    }

    renderedCount = displayedData.length;
    console.log(`[TABLE] Rendered ${Object.keys(employeeGroups).length} employee sections`);
}

// =====================================================
// CREATE ROW HTML
// =====================================================
function createRowHTML(order, index, selectedOrderIds) {
    const isSelected = selectedOrderIds && selectedOrderIds.has(order.Id);
    const isMerged = order.IsMerged && order.OriginalOrders && order.OriginalOrders.length > 1;

    // Get formatted values
    const stt = order.SessionIndex || (index + 1);
    const phone = order.Telephone || order.PartnerPhone || '';
    const customerName = order.Name || order.PartnerName || '';
    const address = order.Address || order.PartnerAddress || '';
    const quantity = order.TotalQuantity || 0;
    const total = (order.TotalAmount || 0).toLocaleString('vi-VN') + 'đ';
    const status = order.StatusText || order.Status || '';

    // Tags HTML
    const tagsHTML = typeof parseOrderTags === 'function'
        ? parseOrderTags(order.Tags, order.Id, order.Code)
        : '';

    // Partner status
    const partnerStatusHTML = typeof formatPartnerStatus === 'function'
        ? formatPartnerStatus(order.PartnerStatusText || order.PartnerStatus, order.PartnerId)
        : '';

    // Messages column
    const messagesHTML = typeof renderMessagesColumn === 'function'
        ? renderMessagesColumn(order)
        : '<td>-</td>';

    // Comments column
    const commentsHTML = typeof renderCommentsColumn === 'function'
        ? renderCommentsColumn(order)
        : '<td>-</td>';

    // Merged order handling
    const mergedClass = isMerged ? 'merged-order' : '';
    const mergedBadge = isMerged
        ? `<span class="merged-badge" title="${order.MergedCount || order.OriginalOrders.length} đơn gộp">
             <i class="fas fa-layer-group"></i> ${order.MergedCount || order.OriginalOrders.length}
           </span>`
        : '';

    // Edit button/dropdown for merged orders
    let editButtonHTML;
    if (isMerged) {
        const optionsHTML = order.OriginalOrders.map(o =>
            `<div class="merged-edit-option" onclick="openEditModal('${o.Id}'); event.stopPropagation();">
                STT ${o.SessionIndex} - ${o.Code}
            </div>`
        ).join('');

        editButtonHTML = `
            <div class="merged-edit-dropdown">
                <button class="btn-edit-order" onclick="toggleMergedEditDropdown(this, event)" title="Chọn đơn để sửa">
                    <i class="fas fa-edit"></i>
                </button>
                <div class="merged-edit-options" style="display: none;">
                    ${optionsHTML}
                </div>
            </div>`;
    } else {
        editButtonHTML = `
            <button class="btn-edit-order" onclick="openEditModal('${order.Id}')" title="Sửa đơn hàng">
                <i class="fas fa-edit"></i>
            </button>`;
    }

    return `
        <tr class="${mergedClass}" data-order-id="${order.Id}">
            <td>
                <input type="checkbox" value="${order.Id}" ${isSelected ? 'checked' : ''}>
            </td>
            <td class="stt-cell">${stt}${mergedBadge}</td>
            <td data-column="phone">${phone}</td>
            <td>${customerName}</td>
            <td data-column="address" title="${address}">${truncateText(address, 50)}</td>
            <td class="tags-cell">${tagsHTML}</td>
            ${messagesHTML}
            ${commentsHTML}
            <td data-column="quantity">${isMerged ? renderMergedQuantityColumn(order).replace(/<\/?td[^>]*>/g, '') : quantity}</td>
            <td data-column="total">${isMerged ? renderMergedTotalColumn(order).replace(/<\/?td[^>]*>/g, '') : total}</td>
            <td class="status-cell">${partnerStatusHTML}</td>
            <td class="actions-cell">${editButtonHTML}</td>
        </tr>`;
}

// =====================================================
// INFINITE SCROLL
// =====================================================
function setupInfiniteScroll() {
    const tableContainer = document.querySelector('.table-container') || document.querySelector('.orders-table-wrapper');
    if (!tableContainer) return;

    // Remove existing listener
    tableContainer.removeEventListener('scroll', handleTableScroll);

    // Add new listener
    tableContainer.addEventListener('scroll', handleTableScroll);
}

function handleTableScroll(event) {
    const container = event.target;
    const { scrollTop, scrollHeight, clientHeight } = container;

    // Check if near bottom (within 200px)
    if (scrollHeight - scrollTop - clientHeight < 200 && !isLoadingMore) {
        loadMoreRows();
    }
}

function loadMoreRows() {
    const state = window.tab1State;
    const displayedData = state.displayedData;
    const selectedOrderIds = state.selectedOrderIds;

    if (renderedCount >= displayedData.length) return;

    isLoadingMore = true;

    const nextBatch = displayedData.slice(renderedCount, renderedCount + LOAD_MORE_COUNT);
    const rowsHTML = nextBatch.map((order, index) => {
        return createRowHTML(order, renderedCount + index, selectedOrderIds);
    }).join('');

    const tbody = document.getElementById('tableBody');
    if (tbody) {
        tbody.insertAdjacentHTML('beforeend', rowsHTML);
    }

    renderedCount += nextBatch.length;
    isLoadingMore = false;

    console.log(`[TABLE] Loaded more: ${renderedCount}/${displayedData.length}`);
}

// =====================================================
// STATS & PAGE INFO
// =====================================================
function updateStats() {
    const state = window.tab1State;
    const displayedData = state.displayedData;
    const filteredData = state.filteredData;

    const totalAmount = displayedData.reduce((sum, order) => sum + (order.TotalAmount || 0), 0);

    // Merged orders stats
    const mergedOrders = displayedData.filter(order => order.IsMerged === true);
    const totalOriginalOrders = displayedData.reduce((sum, order) => {
        return sum + (order.MergedCount || 1);
    }, 0);

    // Update DOM elements
    const totalOrdersEl = document.getElementById('totalOrdersCount');
    const mergedInfoEl = document.getElementById('mergedOrdersInfo');
    const displayedOrdersEl = document.getElementById('displayedOrdersCount');
    const totalAmountEl = document.getElementById('totalAmountSum');
    const loadingProgressEl = document.getElementById('loadingProgress');

    if (totalOrdersEl) {
        totalOrdersEl.textContent = filteredData.length.toLocaleString('vi-VN');
    }

    if (mergedInfoEl) {
        if (mergedOrders.length > 0) {
            mergedInfoEl.textContent = `${mergedOrders.length} đơn gộp (${totalOriginalOrders} đơn gốc)`;
            mergedInfoEl.style.color = '#f59e0b';
        } else {
            mergedInfoEl.textContent = '-';
            mergedInfoEl.style.color = '#9ca3af';
        }
    }

    if (displayedOrdersEl) {
        displayedOrdersEl.textContent = displayedData.length.toLocaleString('vi-VN');
    }

    if (totalAmountEl) {
        totalAmountEl.textContent = totalAmount.toLocaleString('vi-VN') + 'đ';
    }

    if (loadingProgressEl) {
        loadingProgressEl.textContent = '100%';
    }
}

function updatePageInfo() {
    const state = window.tab1State;
    const displayedData = state.displayedData;
    const filteredData = state.filteredData;

    const pageInfoEl = document.getElementById('pageInfo');
    const scrollHintEl = document.getElementById('scrollHint');

    if (pageInfoEl) {
        pageInfoEl.textContent = `Hiển thị ${displayedData.length.toLocaleString('vi-VN')} / ${filteredData.length.toLocaleString('vi-VN')}`;
    }

    if (scrollHintEl) {
        scrollHintEl.textContent = displayedData.length > 0 ? '✅ Đã hiển thị tất cả' : '';
    }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function getTableHeaderHTML() {
    return `
        <tr>
            <th><input type="checkbox" id="selectAll" onchange="handleSelectAll()"></th>
            <th>STT</th>
            <th data-column="phone" style="cursor: pointer;">SĐT</th>
            <th>Khách hàng</th>
            <th data-column="address" style="cursor: pointer;">Địa chỉ</th>
            <th>Tags</th>
            <th data-column="messages">Tin nhắn</th>
            <th data-column="comments">Bình luận</th>
            <th data-column="quantity" style="cursor: pointer;">SL</th>
            <th data-column="total" style="cursor: pointer;">Tổng tiền</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
        </tr>`;
}

function toggleEmployeeSection(key) {
    const section = document.querySelector(`.employee-section[data-employee="${key}"]`);
    if (section) {
        section.classList.toggle('collapsed');
    }
}

// =====================================================
// SELECTION MANAGEMENT
// =====================================================
function handleSelectAll() {
    const state = window.tab1State;
    const displayedData = state.displayedData;
    const selectedOrderIds = state.selectedOrderIds;

    const isChecked = document.getElementById('selectAll')?.checked;

    if (isChecked) {
        displayedData.forEach(order => {
            selectedOrderIds.add(order.Id);
        });
    } else {
        selectedOrderIds.clear();
    }

    // Update visible checkboxes
    const checkboxes = document.querySelectorAll('#tableBody input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
    });

    updateActionButtons();
}

function updateActionButtons() {
    const state = window.tab1State;
    const selectedOrderIds = state.selectedOrderIds;

    const actionSection = document.getElementById('actionButtonsSection');
    const selectedCountSpan = document.getElementById('selectedOrdersCount');
    const createSaleBtn = document.getElementById('createSaleButtonBtn');
    const createFastSaleBtn = document.getElementById('createFastSaleBtn');

    const count = selectedOrderIds.size;

    if (actionSection) {
        actionSection.style.display = count > 0 ? 'flex' : 'none';
    }

    if (selectedCountSpan) {
        selectedCountSpan.textContent = count.toLocaleString('vi-VN');
    }

    if (createSaleBtn) {
        createSaleBtn.style.display = count === 1 ? 'flex' : 'none';
    }

    if (createFastSaleBtn) {
        createFastSaleBtn.style.display = count > 1 ? 'flex' : 'none';
    }
}

// =====================================================
// EXPORTS
// =====================================================
window.renderTable = renderTable;
window.renderAllOrders = renderAllOrders;
window.renderByEmployee = renderByEmployee;
window.createRowHTML = createRowHTML;
window.handleSelectAll = handleSelectAll;
window.updateActionButtons = updateActionButtons;
window.updateStats = updateStats;
window.updatePageInfo = updatePageInfo;
window.toggleEmployeeSection = toggleEmployeeSection;
window.loadMoreRows = loadMoreRows;

// Placeholder exports for functions defined elsewhere
window.parseOrderTags = window.parseOrderTags || function() { return ''; };
window.formatPartnerStatus = window.formatPartnerStatus || function() { return ''; };
window.renderMessagesColumn = window.renderMessagesColumn || function() { return '<td>-</td>'; };
window.renderCommentsColumn = window.renderCommentsColumn || function() { return '<td>-</td>'; };
window.renderMergedQuantityColumn = window.renderMergedQuantityColumn || function() { return '<td>0</td>'; };
window.renderMergedTotalColumn = window.renderMergedTotalColumn || function() { return '<td>0đ</td>'; };

console.log('[TAB1-TABLE] Module loaded');
