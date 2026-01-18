// =====================================================
// RENDERING & UI UPDATES
// =====================================================

// 🔄 CẬP NHẬT ORDER TRONG BẢNG SAU KHI SAVE
function updateOrderInTable(orderId, updatedOrderData) {
    console.log('[UPDATE] Updating order in table:', orderId);

    // Lọc bỏ các trường undefined để tránh ghi đè dữ liệu có sẵn (như Tags)
    const cleanedData = Object.keys(updatedOrderData).reduce((acc, key) => {
        if (updatedOrderData[key] !== undefined) {
            acc[key] = updatedOrderData[key];
        }
        return acc;
    }, {});

    // 1. Tìm và cập nhật trong allData
    const indexInAll = allData.findIndex(order => order.Id === orderId);
    if (indexInAll !== -1) {
        allData[indexInAll] = { ...allData[indexInAll], ...cleanedData };
        console.log('[UPDATE] Updated in allData at index:', indexInAll);
    }

    // 2. Tìm và cập nhật trong filteredData
    const indexInFiltered = filteredData.findIndex(order => order.Id === orderId);
    if (indexInFiltered !== -1) {
        filteredData[indexInFiltered] = { ...filteredData[indexInFiltered], ...cleanedData };
        console.log('[UPDATE] Updated in filteredData at index:', indexInFiltered);
    }

    // 3. Tìm và cập nhật trong displayedData
    const indexInDisplayed = displayedData.findIndex(order => order.Id === orderId);
    if (indexInDisplayed !== -1) {
        displayedData[indexInDisplayed] = { ...displayedData[indexInDisplayed], ...cleanedData };
        console.log('[UPDATE] Updated in displayedData at index:', indexInDisplayed);
    }

    // 4. Re-apply all filters and re-render table
    // This ensures realtime filter updates (e.g., removing a tag will hide the order if filtering by that tag)
    performTableSearch();

    // 5. Cập nhật stats (nếu tổng tiền thay đổi)
    updateStats();

    // 6. Highlight row vừa được cập nhật
    // highlightUpdatedRow(orderId); // DISABLED: Removed auto-scroll and highlight

    console.log('[UPDATE] ✓ Table updated successfully');
}

// 🌟 HIGHLIGHT ROW VỪA CẬP NHẬT
// DISABLED: Removed auto-scroll and highlight functionality
// function highlightUpdatedRow(orderId) {
//     setTimeout(() => {
//         // Tìm row trong bảng
//         const rows = document.querySelectorAll('#tableBody tr');
//         rows.forEach(row => {
//             const checkbox = row.querySelector('input[type="checkbox"]');
//             if (checkbox && checkbox.value === orderId) {
//                 // Thêm class highlight
//                 row.classList.add('product-row-highlight');

//                 // Scroll vào view (nếu cần)
//                 row.scrollIntoView({ behavior: 'smooth', block: 'center' });

//                 // Remove highlight sau 2 giây
//                 setTimeout(() => {
//                     row.classList.remove('product-row-highlight');
//                 }, 2000);
//             }
//         });
//     }, 100);
// }

// =====================================================
// TABLE SORTING FUNCTIONS
// =====================================================

/**
 * Apply sorting to displayedData based on currentSortColumn and currentSortDirection
 */
function applySorting() {
    if (!currentSortColumn || !currentSortDirection) return;

    const sortableColumns = {
        'phone': { field: 'Telephone', type: 'string' },
        'address': { field: 'Address', type: 'string' },
        'debt': { field: null, type: 'debt' }, // Special: get from cache
        'total': { field: 'TotalAmount', type: 'number' },
        'quantity': { field: 'TotalQuantity', type: 'number' }
    };

    const config = sortableColumns[currentSortColumn];
    if (!config) return;

    displayedData.sort((a, b) => {
        let aVal, bVal;

        if (config.type === 'debt') {
            // Get debt from cache
            aVal = getCachedDebt(a.Telephone) || 0;
            bVal = getCachedDebt(b.Telephone) || 0;
        } else if (config.type === 'number') {
            aVal = Number(a[config.field]) || 0;
            bVal = Number(b[config.field]) || 0;
        } else {
            // String type
            aVal = (a[config.field] || '').toString().trim();
            bVal = (b[config.field] || '').toString().trim();
        }

        // Sorting logic
        if (config.type === 'string') {
            // Empty strings first when ascending
            const aEmpty = !aVal;
            const bEmpty = !bVal;

            if (currentSortDirection === 'asc') {
                if (aEmpty && !bEmpty) return -1;
                if (!aEmpty && bEmpty) return 1;
                if (aEmpty && bEmpty) return 0;
                return aVal.localeCompare(bVal, 'vi');
            } else {
                if (aEmpty && !bEmpty) return 1;
                if (!aEmpty && bEmpty) return -1;
                if (aEmpty && bEmpty) return 0;
                return bVal.localeCompare(aVal, 'vi');
            }
        } else {
            // Number type (including debt)
            if (currentSortDirection === 'asc') {
                return aVal - bVal;
            } else {
                return bVal - aVal;
            }
        }
    });
}

/**
 * Handle column header click for sorting
 * @param {string} column - Column name (phone, address, debt, total, quantity)
 */
function handleSortClick(column) {
    const sortableColumns = ['phone', 'address', 'debt', 'total', 'quantity'];
    if (!sortableColumns.includes(column)) return;

    if (currentSortColumn === column) {
        // Same column: cycle asc → desc → null
        if (currentSortDirection === 'asc') {
            currentSortDirection = 'desc';
        } else if (currentSortDirection === 'desc') {
            currentSortDirection = null;
            currentSortColumn = null;
        }
    } else {
        // Different column: reset and start with asc
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }

    // Update header icons
    updateSortIcons();

    // Re-apply sorting and render
    if (currentSortColumn && currentSortDirection) {
        displayedData = [...filteredData];
        applySorting();
    } else {
        displayedData = [...filteredData];
    }
    renderTable();
}

/**
 * Update sort icons on table headers (supports multiple tables)
 */
function updateSortIcons() {
    const sortableColumns = ['phone', 'address', 'debt', 'total', 'quantity'];

    sortableColumns.forEach(col => {
        // Find all headers with this column (main table + employee tables)
        const headers = document.querySelectorAll(`th[data-column="${col}"]`);

        headers.forEach(th => {
            // Remove existing icon
            const existingIcon = th.querySelector('.sort-icon');
            if (existingIcon) existingIcon.remove();

            // Add new icon
            const icon = document.createElement('span');
            icon.className = 'sort-icon';
            icon.style.marginLeft = '4px';
            icon.style.fontSize = '10px';

            if (currentSortColumn === col) {
                if (currentSortDirection === 'asc') {
                    icon.innerHTML = '▲';
                    icon.style.color = '#3b82f6';
                } else if (currentSortDirection === 'desc') {
                    icon.innerHTML = '▼';
                    icon.style.color = '#3b82f6';
                }
            } else {
                icon.innerHTML = '⇅';
                icon.style.color = '#9ca3af';
            }

            th.appendChild(icon);
        });
    });
}

/**
 * Reset sorting state
 */
function resetSorting() {
    currentSortColumn = null;
    currentSortDirection = null;
    updateSortIcons();
}

/**
 * Initialize sortable headers using event delegation
 */
function initSortableHeaders() {
    const sortableColumns = ['phone', 'address', 'debt', 'total', 'quantity'];

    // Use event delegation on document for dynamically created tables
    document.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-column]');
        if (!th) return;

        const column = th.getAttribute('data-column');
        if (sortableColumns.includes(column)) {
            handleSortClick(column);
        }
    });

    // Initialize icons after table loads
    setTimeout(updateSortIcons, 500);
}

// Initialize on DOM ready (only once)
let sortableHeadersInitialized = false;
document.addEventListener('DOMContentLoaded', () => {
    if (!sortableHeadersInitialized) {
        sortableHeadersInitialized = true;
        initSortableHeaders();
    }
});

function renderTable() {
    if (displayedData.length === 0) {
        const tbody = document.getElementById("tableBody");
        tbody.innerHTML =
            '<tr><td colspan="18" style="text-align: center; padding: 40px;">Không có dữ liệu</td></tr>';
        return;
    }

    // Check if user has admin access via checkLogin level (0 = admin)
    // hasPermission(0) returns true only if checkLogin === 0
    let isAdmin = window.authManager?.hasPermission(0) || false;

    // Group by employee if ranges are configured AND user is NOT admin
    if (!isAdmin && employeeRanges.length > 0) {
        renderByEmployee();
    } else {
        renderAllOrders();
    }

    // Apply column visibility after rendering
    if (window.columnVisibility) {
        window.columnVisibility.initialize();
    }

    // Update sort icons after rendering
    updateSortIcons();

    // Re-apply pending customer highlights after table render
    if (window.newMessagesNotifier && window.newMessagesNotifier.reapply) {
        // Small delay to ensure DOM is fully updated
        setTimeout(() => window.newMessagesNotifier.reapply(), 100);
    }
}

function renderAllOrders() {
    // Set rendering flag to prevent loadMoreRows() from running during render
    isRendering = true;

    const tableContainer = document.getElementById('tableContainer');

    // Show the default table wrapper
    const defaultTableWrapper = tableContainer.querySelector('.table-wrapper');
    if (defaultTableWrapper) {
        defaultTableWrapper.style.display = 'block';
    }

    // Remove any existing employee sections
    const existingSections = tableContainer.querySelectorAll('.employee-section');
    existingSections.forEach(section => section.remove());

    // Render all orders in the default table
    const tbody = document.getElementById("tableBody");

    // INFINITE SCROLL: Render only first batch
    renderedCount = INITIAL_RENDER_COUNT;
    const initialData = displayedData.slice(0, renderedCount);
    tbody.innerHTML = initialData.map(createRowHTML).join("");

    // Add spacer if there are more items
    if (displayedData.length > renderedCount) {
        const spacer = document.createElement('tr');
        spacer.id = 'table-spacer';
        spacer.innerHTML = `<td colspan="18" style="text-align: center; padding: 20px; color: #6b7280;">
            <i class="fas fa-spinner fa-spin"></i> Đang tải thêm...
        </td>`;
        tbody.appendChild(spacer);
    }

    // ⚠️ DISABLED: batchFetchDebts - API limit 200 phones per request
    // const phonesToFetch = initialData.map(order => order.Telephone).filter(Boolean);
    // if (phonesToFetch.length > 0 && typeof batchFetchDebts === 'function') {
    //     batchFetchDebts(phonesToFetch);
    // }

    // Clear rendering flag after render is complete
    isRendering = false;
}

// =====================================================
// INFINITE SCROLL LOGIC
// =====================================================
const INITIAL_RENDER_COUNT = 50;
const LOAD_MORE_COUNT = 50;
let renderedCount = 0;

document.addEventListener('DOMContentLoaded', () => {
    const tableWrapper = document.getElementById("tableWrapper");
    if (tableWrapper) {
        tableWrapper.addEventListener('scroll', handleTableScroll);
    }
});

function handleTableScroll(e) {
    const { scrollTop, scrollHeight, clientHeight } = e.target;

    // Check if scrolled near bottom (within 200px)
    if (scrollTop + clientHeight >= scrollHeight - 200) {
        loadMoreRows();
    }
}

function loadMoreRows() {
    // Prevent appending during active render or if we have no more data
    if (isRendering || renderedCount >= displayedData.length) return;

    const tbody = document.getElementById("tableBody");
    if (!tbody) return; // Safety check

    const spacer = document.getElementById("table-spacer");

    // Remove spacer temporarily
    if (spacer) spacer.remove();

    // Calculate next batch
    const nextBatch = displayedData.slice(renderedCount, renderedCount + LOAD_MORE_COUNT);
    renderedCount += nextBatch.length;

    // Append new rows
    const fragment = document.createDocumentFragment();
    nextBatch.forEach(order => {
        const tr = document.createElement('tr');
        // Use a temporary container to parse HTML string
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<table><tbody>${createRowHTML(order)}</tbody></table>`;
        const newRow = tempDiv.querySelector('tr');
        if (newRow) {
            fragment.appendChild(newRow);
        }
    });

    tbody.appendChild(fragment);

    // Apply column visibility to newly added rows
    if (window.columnVisibility) {
        const settings = window.columnVisibility.load();
        window.columnVisibility.apply(settings);
    }

    // Add spacer back if still have more
    if (renderedCount < displayedData.length) {
        const newSpacer = document.createElement('tr');
        newSpacer.id = 'table-spacer';
        newSpacer.innerHTML = `<td colspan="18" style="text-align: center; padding: 20px; color: #6b7280;">
            <i class="fas fa-spinner fa-spin"></i> Đang tải thêm...
        </td>`;
        tbody.appendChild(newSpacer);
    }

    // ⚠️ DISABLED: batchFetchDebts - API limit 200 phones per request
    // const phonesToFetch = nextBatch.map(order => order.Telephone).filter(Boolean);
    // if (phonesToFetch.length > 0 && typeof batchFetchDebts === 'function') {
    //     batchFetchDebts(phonesToFetch);
    // }

    // Re-apply pending customer highlights to newly loaded rows
    if (window.newMessagesNotifier && window.newMessagesNotifier.reapply) {
        setTimeout(() => window.newMessagesNotifier.reapply(), 50);
    }
}

function renderByEmployee() {
    // Set rendering flag to prevent any race conditions
    isRendering = true;

    const tableContainer = document.getElementById('tableContainer');

    // If background loading is in progress, show loading placeholder and wait for completion
    // This ensures employee sections show complete data
    if (isLoadingInBackground) {
        console.log('[EMPLOYEE-VIEW] Waiting for background loading to complete...');

        // Hide the default table
        const defaultTableWrapper = tableContainer.querySelector('.table-wrapper');
        if (defaultTableWrapper) {
            defaultTableWrapper.style.display = 'none';
        }

        // Remove existing employee sections
        const existingSections = tableContainer.querySelectorAll('.employee-section');
        existingSections.forEach(section => section.remove());

        // Show loading placeholder
        let loadingPlaceholder = tableContainer.querySelector('.employee-loading-placeholder');
        if (!loadingPlaceholder) {
            loadingPlaceholder = document.createElement('div');
            loadingPlaceholder.className = 'employee-loading-placeholder';
            loadingPlaceholder.style.cssText = 'text-align: center; padding: 60px 20px; color: #6b7280;';
            loadingPlaceholder.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 16px; display: block;"></i>
                <div style="font-size: 16px; font-weight: 500;">Đang tải dữ liệu đơn hàng...</div>
                <div style="font-size: 13px; margin-top: 8px;">Vui lòng đợi cho tới khi tải xong toàn bộ dữ liệu</div>
            `;
            tableContainer.appendChild(loadingPlaceholder);
        }

        isRendering = false;
        return; // performTableSearch() will be called again when loading completes
    }

    // Remove loading placeholder if exists
    const loadingPlaceholder = tableContainer.querySelector('.employee-loading-placeholder');
    if (loadingPlaceholder) {
        loadingPlaceholder.remove();
    }

    // Group data by employee
    const dataByEmployee = {};

    // Initialize groups for each employee
    employeeRanges.forEach(range => {
        dataByEmployee[range.name] = [];
    });

    // Add "Khác" category for orders without employee
    dataByEmployee['Khác'] = [];

    // Group orders by employee
    displayedData.forEach(order => {
        const employeeName = getEmployeeName(order.SessionIndex) || 'Khác';
        if (!dataByEmployee[employeeName]) {
            dataByEmployee[employeeName] = [];
        }
        dataByEmployee[employeeName].push(order);
    });

    // Get ordered list of employees
    const orderedEmployees = employeeRanges.map(r => r.name).filter(name => dataByEmployee[name].length > 0);

    // Add "Khác" at the end if it has data
    if (dataByEmployee['Khác'].length > 0) {
        orderedEmployees.push('Khác');
    }

    // Hide the default table container (tableContainer already declared above)
    const defaultTableWrapper = tableContainer.querySelector('.table-wrapper');
    if (defaultTableWrapper) {
        defaultTableWrapper.style.display = 'none';
    }

    // Remove existing employee sections
    const existingSections = tableContainer.querySelectorAll('.employee-section');
    existingSections.forEach(section => section.remove());

    // Render each employee section
    orderedEmployees.forEach(employeeName => {
        const orders = dataByEmployee[employeeName];
        const totalAmount = orders.reduce((sum, order) => sum + (order.TotalAmount || 0), 0);
        const totalQuantity = orders.reduce((sum, order) => sum + (order.TotalQuantity || 0), 0);

        const section = document.createElement('div');
        section.className = 'employee-section';

        section.innerHTML = `
            <div class="employee-header">
                <div>
                    <div class="employee-name">
                        <i class="fas fa-user-circle"></i> ${employeeName}
                    </div>
                    <div class="employee-stats">
                        ${orders.length} đơn hàng • ${totalQuantity} sản phẩm • ${totalAmount.toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="employee-total">
                    ${orders.length} đơn
                </div>
            </div>
            <div class="employee-table-wrapper">
                <div class="table-wrapper">
                    <table class="table">
                        <thead>
                            <tr>
                                <th><input type="checkbox" class="employee-select-all" data-employee="${employeeName}" /></th>
                                <th data-column="actions">Thao tác</th>
                                <th data-column="stt">STT</th>
                                <th data-column="employee" style="width: 90px;">Nhân viên</th>
                                <th data-column="tag">TAG</th>
                                <th data-column="order-code">Mã ĐH</th>
                                <th data-column="customer">Khách hàng</th>
                                <th data-column="phone">SĐT</th>
                                <th data-column="messages">Tin nhắn</th>
                                <th data-column="comments">Bình luận</th>
                                <th data-column="qr" style="width: 50px; text-align: center;">QR</th>
                                <th data-column="debt" style="width: 100px; text-align: right;">Công Nợ</th>
                                <th data-column="address">Địa chỉ</th>
                                <th data-column="notes">Ghi chú</th>
                                <th data-column="total">Tổng tiền</th>
                                <th data-column="quantity">SL</th>
                                <th data-column="created-date">Ngày tạo</th>
                                <th data-column="status">Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${orders.map(createRowHTML).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        tableContainer.appendChild(section);
    });

    // Add event listeners for employee select all checkboxes
    const employeeSelectAlls = tableContainer.querySelectorAll('.employee-select-all');
    employeeSelectAlls.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            const section = this.closest('.employee-section');
            const checkboxes = section.querySelectorAll('tbody input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = this.checked);
            updateActionButtons();
        });
    });

    // ⚠️ DISABLED: batchFetchDebts - API limit 200 phones per request
    // const phonesToFetch = displayedData.map(order => order.Telephone).filter(Boolean);
    // if (phonesToFetch.length > 0 && typeof batchFetchDebts === 'function') {
    //     batchFetchDebts(phonesToFetch);
    // }

    // Clear rendering flag after render is complete
    isRendering = false;
}

function createRowHTML(order) {
    if (!order || !order.Id) return "";
    let tagsHTML = "";
    if (order.Tags) {
        try {
            const tags = JSON.parse(order.Tags);
            if (Array.isArray(tags)) {
                tagsHTML = parseOrderTags(order.Tags, order.Id, order.Code);
            }
        } catch (e) { }
    }
    const partnerStatusHTML = formatPartnerStatus(order.PartnerStatusText, order.PartnerId);
    const highlight = (text) => highlightSearchText(text || "", searchQuery);

    // Get messages and comments columns
    const messagesHTML = renderMessagesColumn(order);
    const commentsHTML = renderCommentsColumn(order);

    // Add watermark class for edited notes
    const rowClass = order.noteEdited ? 'note-edited' : '';

    // Check for merged orders
    const isMerged = order.MergedCount && order.MergedCount > 1;
    const mergedClass = isMerged ? 'merged-order-row' : '';
    const mergedIcon = isMerged ? '<i class="fas fa-link merged-icon" title="Đơn gộp"></i>' : '';

    // Get employee name for STT
    const employeeName = getEmployeeName(order.SessionIndex);
    const employeeHTML = employeeName
        ? `<span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${employeeName}</span>`
        : '<span style="color: #9ca3af;">−</span>';

    // Build actions cell HTML
    const actionsHTML = `
            <td data-column="actions">
                ${isMerged ? `
                    <div class="merged-edit-dropdown" style="position: relative; display: inline-block;">
                        <button class="btn-edit-icon" onclick="toggleMergedEditDropdown(this, event)" title="Chọn đơn hàng để chỉnh sửa">
                            <i class="fas fa-edit"></i>
                            <i class="fas fa-caret-down" style="font-size: 10px; margin-left: 2px;"></i>
                        </button>
                        <div class="merged-edit-options" style="display: none; position: absolute; left: 0; top: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; min-width: 100px;">
                            ${order.OriginalOrders.sort((a, b) => (parseInt(b.SessionIndex) || 0) - (parseInt(a.SessionIndex) || 0)).map(o => `
                                <div onclick="openEditModal('${o.Id}'); closeMergedEditDropdown(); event.stopPropagation();"
                                     style="padding: 8px 12px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #f3f4f6; transition: background 0.2s;"
                                     onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='white'">
                                    <span style="font-weight: 500;">STT ${o.SessionIndex}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : `
                    <button class="btn-edit-icon" onclick="openEditModal('${order.Id}')" title="Chỉnh sửa đơn hàng">
                        <i class="fas fa-edit"></i>
                    </button>
                `}
                ${order.noteEdited ? '<span class="note-edited-badge" style="margin-left: 4px;" title="Ghi chú đã được sửa">✏️</span>' : ''}
            </td>`;

    // Extract pageId from Facebook_PostId (format: pageId_postId)
    const pageId = order.Facebook_PostId ? order.Facebook_PostId.split('_')[0] : '';

    return `
        <tr class="${rowClass} ${mergedClass}" data-psid="${order.Facebook_ASUserId || ''}" data-page-id="${pageId}" data-order-id="${order.Id}">
            <td><input type="checkbox" value="${order.Id}" ${selectedOrderIds.has(order.Id) ? 'checked' : ''} /></td>
            ${actionsHTML}
            <td data-column="stt">
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <span>${order.SessionIndex || ""}</span>
                    ${mergedIcon}
                    ${ordersWithKPIBase.has(order.Id) ? '<span class="kpi-base-indicator" title="Đã lưu BASE tính KPI"><i class="fas fa-lock" style="color: #10b981; font-size: 10px;"></i></span>' : ''}
                </div>
            </td>
            <td data-column="employee" style="text-align: center;">${employeeHTML}</td>
            <td data-column="tag">
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                    <div style="display: flex; gap: 2px;">
                        <button class="tag-icon-btn" onclick="openTagModal('${order.Id}', '${order.Code}'); event.stopPropagation();" title="Quản lý tag" style="padding: 2px 6px;">
                            <i class="fas fa-tags"></i>
                        </button>
                        <button class="quick-tag-btn" onclick="quickAssignTag('${order.Id}', '${order.Code}', 'xử lý'); event.stopPropagation();" title="Xử lý + định danh">
                            <i class="fas fa-clock"></i>
                        </button>
                        <button class="quick-tag-btn quick-tag-ok" onclick="quickAssignTag('${order.Id}', '${order.Code}', 'ok'); event.stopPropagation();" title="OK + định danh">
                            <i class="fas fa-check"></i>
                        </button>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">${tagsHTML}</div>
                </div>
            </td>
            <td data-column="order-code">
                <span>${highlight(order.Code)}</span>
            </td>
            <td data-column="customer"><div class="customer-name">${highlight(order.Name)}</div>${partnerStatusHTML}</td>
            <td data-column="phone" style="text-align: center;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                    ${order.Telephone ? `<i class="fas fa-copy copy-phone-btn" onclick="copyPhoneNumber('${order.Telephone}'); event.stopPropagation();" title="Copy SĐT" style="cursor: pointer; color: #9ca3af; font-size: 11px;"></i>` : ''}
                    <span>${highlight(order.Telephone)}</span>
                </div>
            </td>
            ${messagesHTML}
            ${commentsHTML}
            <td data-column="qr" style="text-align: center;">${renderQRColumn(order.Telephone)}</td>
            <td data-column="debt" style="text-align: right;">${renderDebtColumn(order.Telephone)}</td>
            <td data-column="address">${highlight(order.Address)}</td>
            <td data-column="notes">${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(order.Note) : highlight(order.Note)}</td>
            ${renderMergedTotalColumn(order)}
            ${renderMergedQuantityColumn(order)}
            <td data-column="created-date">${new Date(order.DateCreated).toLocaleString("vi-VN")}</td>
            <td data-column="status"><span class="status-badge ${order.Status === "Draft" ? "status-draft" : "status-order"}" style="cursor: pointer;" onclick="openOrderStatusModal('${order.Id}', '${order.Status}')" data-order-id="${order.Id}" title="Click để thay đổi trạng thái">${highlight(order.StatusText || order.Status)}</span></td>
        </tr>`;
}

// Helper: Format message preview with icon
function formatMessagePreview(chatInfo) {
    let displayMessage = '−'; // Default to dash
    let messageIcon = '';

    if (chatInfo.attachments && chatInfo.attachments.length > 0) {
        // Has attachments (images, files, etc.)
        const attachment = chatInfo.attachments[0];
        if (attachment.Type === 'image' || attachment.Type === 'photo') {
            displayMessage = 'Đã gửi ảnh';
            messageIcon = '📷';
        } else if (attachment.Type === 'video') {
            displayMessage = 'Đã gửi video';
            messageIcon = '🎥';
        } else if (attachment.Type === 'file') {
            displayMessage = 'Đã gửi file';
            messageIcon = '📎';
        } else if (attachment.Type === 'audio') {
            displayMessage = 'Đã gửi audio';
            messageIcon = '🎵';
        } else if (attachment.Type === 'sticker' || attachment.type === 'sticker' || attachment.sticker_id) {
            displayMessage = 'Đã gửi sticker';
            messageIcon = '🧸';
        } else if (attachment.Type === 'animated_image_share' || attachment.type === 'animated_image_share') {
            displayMessage = 'Đã gửi GIF';
            messageIcon = '🎞️';
        } else {
            displayMessage = 'Đã gửi tệp';
            messageIcon = '📎';
        }
    } else if (chatInfo.message) {
        // Text message
        displayMessage = chatInfo.message;
    }

    // Truncate message
    if (displayMessage.length > 30) {
        displayMessage = displayMessage.substring(0, 30) + '...';
    }

    // Return formatted message with icon
    return messageIcon ? `${messageIcon} ${displayMessage}` : displayMessage;
}

// Helper: Render multi-customer messages/comments (merged order with different customers)
// Shows multiple lines, one per customer with their largest STT
function renderMultiCustomerMessages(order, columnType = 'messages') {
    const rows = [];

    // For each customer group, find order with largest STT and get its message
    order.CustomerGroups.forEach(customerGroup => {
        // Get the order with largest STT (already sorted in customerGroups)
        const largestSTTOrder = customerGroup.orders[0]; // First order is largest STT

        // Find full order object from OriginalOrders
        const fullOrder = order.OriginalOrders.find(o => o.Id === largestSTTOrder.id);
        if (!fullOrder || !largestSTTOrder.psid || !largestSTTOrder.channelId) {
            return; // Skip this customer if no valid data
        }

        // Get message or comment
        const messageInfo = columnType === 'messages'
            ? window.chatDataManager.getLastMessageForOrder(fullOrder)
            : window.chatDataManager.getLastCommentForOrder(largestSTTOrder.channelId, largestSTTOrder.psid, fullOrder);

        // Format message preview
        const displayMessage = formatMessagePreview(messageInfo);
        const unreadBadge = messageInfo.hasUnread ? '<span class="unread-badge"></span>' : '';
        const fontWeight = messageInfo.hasUnread ? '700' : '400';
        const color = messageInfo.hasUnread ? '#111827' : '#6b7280';

        // Create click handler - use separate modals for messages and comments
        const clickHandler = columnType === 'messages'
            ? `openChatModal('${largestSTTOrder.id}', '${largestSTTOrder.channelId}', '${largestSTTOrder.psid}')`
            : `openCommentModal('${largestSTTOrder.id}', '${largestSTTOrder.channelId}', '${largestSTTOrder.psid}')`;

        rows.push(`
            <div class="multi-customer-message-row" onclick="${clickHandler}" style="border-bottom: 1px solid #e5e7eb; padding: 6px 8px; cursor: pointer; transition: background-color 0.2s;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 3px; font-weight: 500;">
                    ${customerGroup.name} • STT ${largestSTTOrder.stt}
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${unreadBadge}
                    <span style="font-size: 13px; font-weight: ${fontWeight}; color: ${color};">
                        ${displayMessage}
                    </span>
                </div>
                ${messageInfo.unreadCount > 0 ? `<div style="font-size: 11px; color: #ef4444; font-weight: 600; margin-top: 2px;">${messageInfo.unreadCount} tin mới</div>` : ''}
            </div>
        `);
    });

    // If no rows, show dash
    if (rows.length === 0) {
        return `<td data-column="${columnType}" style="text-align: center; color: #9ca3af;">−</td>`;
    }

    return `
        <td data-column="${columnType}" style="padding: 0; vertical-align: top;">
            <div style="max-height: 200px; overflow-y: auto;">
                ${rows.join('')}
            </div>
        </td>
    `;
}

// Helper: Render single customer message/comment (merged order with same customer)
// Shows only the message/comment from the order with largest STT
function renderSingleCustomerMessage(order, columnType = 'messages') {
    // Get the order with largest STT (stored in TargetOrderId)
    const targetOrder = order.OriginalOrders.find(o => o.Id === order.TargetOrderId);

    if (!targetOrder || !targetOrder.Facebook_ASUserId) {
        return `<td data-column="${columnType}" style="text-align: center; color: #9ca3af;">−</td>`;
    }

    // Get chat info for this specific order
    const chatInfo = window.chatDataManager.getChatInfoForOrder(targetOrder);

    if (!chatInfo.psid || !chatInfo.channelId) {
        return `<td data-column="${columnType}" style="text-align: center; color: #9ca3af;">−</td>`;
    }

    // Get message or comment based on type
    const messageInfo = columnType === 'messages'
        ? window.chatDataManager.getLastMessageForOrder(targetOrder)
        : window.chatDataManager.getLastCommentForOrder(chatInfo.channelId, chatInfo.psid, targetOrder);

    // Render using the existing renderChatColumnWithData function
    // But we need to pass the targetOrder ID for the click handler
    return renderChatColumnWithData(targetOrder, messageInfo, chatInfo.channelId, chatInfo.psid, columnType);
}

// Render messages column only (not comments)
function renderMessagesColumn(order) {
    if (!window.chatDataManager) {
        console.log('[CHAT RENDER] chatDataManager not available');
        return '<td data-column="messages" style="text-align: center; color: #9ca3af;">−</td>';
    }

    // Show loading indicator when conversations are being fetched
    if (isLoadingConversations) {
        return '<td data-column="messages" style="text-align: center; color: #9ca3af;" title="Đang tải tin nhắn..."><i class="fas fa-spinner fa-spin" style="font-size: 12px; color: #667eea;"></i></td>';
    }

    // Check if this is a merged order - always show STT-based format
    if (order.IsMerged && order.OriginalOrders && order.OriginalOrders.length > 1) {
        return renderMergedMessagesColumn(order, 'messages');
    }

    // Get chat info for order
    const orderChatInfo = window.chatDataManager.getChatInfoForOrder(order);

    // Debug log first few orders
    if (order.SessionIndex && order.SessionIndex <= 3) {
        console.log(`[CHAT RENDER] Order ${order.Code}:`, {
            Facebook_ASUserId: order.Facebook_ASUserId,
            Facebook_PostId: order.Facebook_PostId,
            channelId: orderChatInfo.channelId,
            psid: orderChatInfo.psid,
            hasChat: orderChatInfo.hasChat
        });
    }

    // If no PSID or Channel ID, show dash
    if (!orderChatInfo.psid || !orderChatInfo.channelId) {
        return '<td data-column="messages" style="text-align: center; color: #9ca3af;">−</td>';
    }

    const messageInfo = window.chatDataManager.getLastMessageForOrder(order);
    const channelId = orderChatInfo.channelId;
    const psid = orderChatInfo.psid;

    // Always render with clickable cell (even when showing "-") as long as we have channelId and psid
    // This allows users to open the modal even when there are no messages yet
    return renderChatColumnWithData(order, messageInfo, channelId, psid, 'messages');
}

// Render comments column only (not messages)
function renderCommentsColumn(order) {
    if (!window.chatDataManager) {
        console.log('[CHAT RENDER] chatDataManager not available');
        return '<td data-column="comments" style="text-align: center; color: #9ca3af;">−</td>';
    }

    // Show loading indicator when conversations are being fetched
    if (isLoadingConversations) {
        return '<td data-column="comments" style="text-align: center; color: #9ca3af;" title="Đang tải bình luận..."><i class="fas fa-spinner fa-spin" style="font-size: 12px; color: #667eea;"></i></td>';
    }

    // Check if this is a merged order - always show STT-based format
    if (order.IsMerged && order.OriginalOrders && order.OriginalOrders.length > 1) {
        return renderMergedMessagesColumn(order, 'comments');
    }

    // Get chat info for order
    const orderChatInfo = window.chatDataManager.getChatInfoForOrder(order);

    // If no PSID or Channel ID, show dash
    if (!orderChatInfo.psid || !orderChatInfo.channelId) {
        return '<td data-column="comments" style="text-align: center; color: #9ca3af;">−</td>';
    }

    const commentInfo = window.chatDataManager.getLastCommentForOrder(orderChatInfo.channelId, orderChatInfo.psid, order);
    const channelId = orderChatInfo.channelId;
    const psid = orderChatInfo.psid;

    // Always render with clickable cell (even when showing "-") as long as we have channelId and psid
    // This allows users to open the modal even when there are no comments yet
    return renderChatColumnWithData(order, commentInfo, channelId, psid, 'comments');
}

// #region ═══════════════════════════════════════════════════════════════════════
// ║                    SECTION 9: MERGED ORDER COLUMNS                          ║
// ║                            search: #MERGED                                  ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// MERGED ORDER COLUMNS - Messages & Comments (STT-based) #MERGED
// =====================================================

// Render merged messages/comments column with individual STT values
function renderMergedMessagesColumn(order, columnType = 'messages') {
    // Debug log
    console.log('[renderMergedMessagesColumn]', {
        columnType,
        IsMerged: order.IsMerged,
        OriginalOrdersCount: order.OriginalOrders?.length,
        OriginalOrders: order.OriginalOrders
    });

    // Check if user wants to show message content (from column visibility settings)
    const columnSettings = window.columnVisibility?.load() || {};
    const showContent = columnSettings.messagesContent !== false; // Default true

    // Sort by STT descending (largest first)
    const sortedOrders = [...order.OriginalOrders].sort((a, b) =>
        (parseInt(b.SessionIndex) || 0) - (parseInt(a.SessionIndex) || 0)
    );

    const rows = sortedOrders.map(originalOrder => {
        // Get chat info for this specific order
        const chatInfo = window.chatDataManager ? window.chatDataManager.getChatInfoForOrder(originalOrder) : null;
        const channelId = chatInfo?.channelId || window.chatDataManager?.parseChannelId(originalOrder.Facebook_PostId);
        const psid = originalOrder.Facebook_ASUserId;

        // Get message or comment info - always show something even without chat info
        let displayMessage = '−';
        let hasUnread = false;
        let unreadCount = 0;

        // If user disabled content display, always show "-" (no preview, no badge)
        if (!showContent) {
            displayMessage = '–';
        } else if (window.chatDataManager && channelId && psid) {
            const msgInfo = columnType === 'messages'
                ? window.chatDataManager.getLastMessageForOrder(originalOrder)
                : window.chatDataManager.getLastCommentForOrder(channelId, psid, originalOrder);

            if (msgInfo && (msgInfo.message || msgInfo.content || msgInfo.text)) {
                displayMessage = formatMessagePreview(msgInfo);
                hasUnread = msgInfo.hasUnread || false;
                unreadCount = msgInfo.unreadCount || 0;
            }
        }

        // Create click handler - always allow click if we have channelId and psid
        const clickHandler = channelId && psid
            ? (columnType === 'messages'
                ? `openChatModal('${originalOrder.Id}', '${channelId}', '${psid}')`
                : `openCommentModal('${originalOrder.Id}', '${channelId}', '${psid}')`)
            : '';

        const cursorStyle = clickHandler ? 'cursor: pointer;' : 'cursor: default;';
        const hoverStyle = clickHandler ? `onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'"` : '';

        // Only show unread indicators if content display is enabled
        const unreadBadge = (showContent && hasUnread) ? '<span style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%; flex-shrink: 0;"></span>' : '';
        const fontWeight = (showContent && hasUnread) ? '600' : '400';
        const color = (showContent && hasUnread) ? '#111827' : '#6b7280';

        // Always show unread count if > 0 (only when content display is enabled)
        const unreadText = (showContent && unreadCount > 0) ? `<span style="font-size: 10px; color: #ef4444; font-weight: 600; margin-left: 4px;">${unreadCount} tin mới</span>` : '';

        return `
            <div class="merged-detail-row" ${clickHandler ? `onclick="${clickHandler}; event.stopPropagation();"` : ''} 
                 style="display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e5e7eb; padding: 6px 8px; min-height: 28px; ${cursorStyle} transition: background 0.2s;"
                 ${hoverStyle}>
                <span style="font-size: 11px; color: #6b7280; font-weight: 500; min-width: 55px; flex-shrink: 0;">STT ${originalOrder.SessionIndex}:</span>
                ${unreadBadge}
                <span style="font-size: 12px; font-weight: ${fontWeight}; color: ${color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">${displayMessage}</span>
                ${unreadText}
            </div>
        `;
    }).join('');

    return `<td data-column="${columnType}" style="padding: 0; vertical-align: top;">${rows}</td>`;
}

// =====================================================
// MERGED ORDER COLUMNS - Quantity & Total Amount
// =====================================================

// Render merged quantity column with individual STT values
function renderMergedQuantityColumn(order) {
    // Non-merged orders: simple display
    if (!order.IsMerged || !order.OriginalOrders || order.OriginalOrders.length <= 1) {
        return `<td data-column="quantity">${order.TotalQuantity || 0}</td>`;
    }

    // Sort by STT descending (largest first)
    const sortedOrders = [...order.OriginalOrders].sort((a, b) =>
        (parseInt(b.SessionIndex) || 0) - (parseInt(a.SessionIndex) || 0)
    );

    const rows = sortedOrders.map(o => `
        <div class="merged-detail-row" onclick="openEditModal('${o.Id}'); event.stopPropagation();" 
             style="display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e5e7eb; padding: 6px 8px; min-height: 28px; cursor: pointer; transition: background 0.2s;"
             onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
            <span style="font-size: 11px; color: #6b7280; font-weight: 500; min-width: 55px; flex-shrink: 0;">STT ${o.SessionIndex}:</span>
            <span style="font-weight: 600;">${o.TotalQuantity || 0}</span>
        </div>
    `).join('');

    return `<td data-column="quantity" style="padding: 0; vertical-align: top;">${rows}</td>`;
}

// Render merged total amount column with individual STT values
function renderMergedTotalColumn(order) {
    // Non-merged orders: simple display
    if (!order.IsMerged || !order.OriginalOrders || order.OriginalOrders.length <= 1) {
        return `<td data-column="total">${(order.TotalAmount || 0).toLocaleString("vi-VN")}đ</td>`;
    }

    // Sort by STT descending (largest first)
    const sortedOrders = [...order.OriginalOrders].sort((a, b) =>
        (parseInt(b.SessionIndex) || 0) - (parseInt(a.SessionIndex) || 0)
    );

    const rows = sortedOrders.map(o => `
        <div class="merged-detail-row" onclick="openEditModal('${o.Id}'); event.stopPropagation();" 
             style="display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e5e7eb; padding: 6px 8px; min-height: 28px; cursor: pointer; transition: background 0.2s;"
             onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
            <span style="font-size: 11px; color: #6b7280; font-weight: 500; min-width: 55px; flex-shrink: 0;">STT ${o.SessionIndex}:</span>
            <span style="font-weight: 600; color: #3b82f6;">${(o.TotalAmount || 0).toLocaleString("vi-VN")}đ</span>
        </div>
    `).join('');

    return `<td data-column="total" style="padding: 0; vertical-align: top;">${rows}</td>`;
}

// Helper function to render chat column with data (for both messages and comments)
function renderChatColumnWithData(order, chatInfo, channelId, psid, columnType = 'messages') {
    // Format message based on type
    let displayMessage = '−'; // Default to dash
    let messageIcon = '';

    if (chatInfo.attachments && chatInfo.attachments.length > 0) {
        // Has attachments (images, files, etc.)
        const attachment = chatInfo.attachments[0];
        if (attachment.Type === 'image' || attachment.Type === 'photo') {
            displayMessage = 'Đã gửi ảnh';
            messageIcon = '📷';
        } else if (attachment.Type === 'video') {
            displayMessage = 'Đã gửi video';
            messageIcon = '🎥';
        } else if (attachment.Type === 'file') {
            displayMessage = 'Đã gửi file';
            messageIcon = '📎';
        } else if (attachment.Type === 'audio') {
            displayMessage = 'Đã gửi audio';
            messageIcon = '🎵';
        } else if (attachment.Type === 'sticker' || attachment.type === 'sticker' || attachment.sticker_id) {
            displayMessage = 'Đã gửi sticker';
            messageIcon = '🧸';
        } else if (attachment.Type === 'animated_image_share' || attachment.type === 'animated_image_share') {
            displayMessage = 'Đã gửi GIF';
            messageIcon = '🎞️';
        } else {
            displayMessage = 'Đã gửi tệp';
            messageIcon = '📎';
        }
    } else if (chatInfo.message) {
        // Text message
        displayMessage = chatInfo.message;
    }

    // Truncate message
    if (displayMessage.length > 30) {
        displayMessage = displayMessage.substring(0, 30) + '...';
    }

    // Styling based on unread status
    const isUnread = chatInfo.hasUnread;
    const fontWeight = isUnread ? '700' : '400';
    const color = isUnread ? '#111827' : '#6b7280';
    const unreadBadge = isUnread ? `<span class="unread-badge"></span>` : '';

    // Click handler
    // For merged orders, use the TargetOrderId (order with largest STT) instead of the combined Id
    const orderIdToUse = order.IsMerged && order.TargetOrderId ? order.TargetOrderId : order.Id;
    // Use separate modals: openChatModal for messages, openCommentModal for comments
    const clickHandler = columnType === 'messages'
        ? `openChatModal('${orderIdToUse}', '${channelId}', '${psid}')`
        : `openCommentModal('${orderIdToUse}', '${channelId}', '${psid}')`;

    const tooltipText = columnType === 'comments'
        ? 'Click để xem bình luận'
        : 'Click để xem toàn bộ tin nhắn';

    return `
        <td data-column="${columnType}" onclick="${clickHandler}" style="cursor: pointer;" title="${tooltipText}">
            <div style="display: flex; align-items: center; gap: 6px;">
                ${unreadBadge}
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 13px; font-weight: ${fontWeight}; color: ${color};">
                        ${messageIcon} ${displayMessage}
                    </span>
                    ${chatInfo.unreadCount > 0 ? `<span style="font-size: 11px; color: #ef4444; font-weight: 600;">${chatInfo.unreadCount} tin mới</span>` : ''}
                </div>
            </div>
        </td>`;
}

function parseOrderTags(tagsJson, orderId, orderCode) {
    try {
        const tags = JSON.parse(tagsJson);
        if (!Array.isArray(tags) || tags.length === 0) return "";

        // Escape function for safe onclick attributes
        const escapeAttr = (str) => String(str).replace(/'/g, "\\'").replace(/"/g, "&quot;");

        return tags
            .map(
                (tag) =>
                    `<div style="display: inline-flex; align-items: center; gap: 2px;">
                        <span class="order-tag" style="background-color: ${tag.Color || "#6b7280"}; cursor: pointer;" onclick="openTagModal('${escapeAttr(orderId)}', '${escapeAttr(orderCode)}'); event.stopPropagation();" title="Quản lý tag">${tag.Name || ""}</span>
                        <button class="tag-remove-btn" onclick="quickRemoveTag('${escapeAttr(orderId)}', '${escapeAttr(orderCode)}', '${escapeAttr(tag.Id)}'); event.stopPropagation();" title="Xóa tag này">×</button>
                    </div>`,
            )
            .join("");
    } catch (e) {
        return "";
    }
}

function formatPartnerStatus(statusText, partnerId) {
    if (!statusText) return "";
    const statusColors = {
        "Bình thường": "#5cb85c",
        "Bom hàng": "#d1332e",
        "Cảnh báo": "#f0ad4e",
        "Khách sỉ": "#5cb85c",
        "Nguy hiểm": "#d9534f",
        "Thân thiết": "#5bc0de",
        Vip: "#337ab7",
        VIP: "#5bc0deff",
    };
    const color = statusColors[statusText] || "#6b7280";
    const cursorStyle = partnerId ? 'cursor: pointer;' : '';
    const onclickAttr = partnerId ? `onclick="openPartnerStatusModal('${partnerId}', '${statusText}')"` : '';
    const titleAttr = partnerId ? 'title="Click để thay đổi trạng thái"' : '';
    const dataAttr = partnerId ? `data-partner-id="${partnerId}"` : '';

    return `<span class="partner-status" style="background-color: ${color}; ${cursorStyle}" ${onclickAttr} ${titleAttr} ${dataAttr}>${statusText}</span>`;
}

// --- Partner Status Modal Logic ---

const PARTNER_STATUS_OPTIONS = [
    { value: "#5cb85c", text: "Bình thường" },
    { value: "#d1332e", text: "Bom hàng" },
    { value: "#f0ad4e", text: "Cảnh báo" },
    { value: "#5cb85c", text: "Khách sỉ" },
    { value: "#d9534f", text: "Nguy hiểm" },
    { value: "#5bc0de", text: "Thân thiết" },
    { value: "#337ab7", text: "Vip" },
    { value: "#5bc0deff", text: "VIP" }
];

function openPartnerStatusModal(partnerId, currentStatus) {
    const modal = document.getElementById('partnerStatusModal');
    const container = document.getElementById('partnerStatusOptions');
    if (!modal || !container) return;

    // Populate options
    container.innerHTML = '';
    PARTNER_STATUS_OPTIONS.forEach(option => {
        const btn = document.createElement('div');
        btn.className = 'status-btn';
        if (option.text === currentStatus) btn.classList.add('selected');

        btn.innerHTML = `
            <span class="status-color-dot" style="background-color: ${option.value};"></span>
            <span class="status-text">${option.text}</span>
        `;
        btn.onclick = () => updatePartnerStatus(partnerId, option.value, option.text);
        container.appendChild(btn);
    });

    modal.classList.add('show');
}

function closePartnerStatusModal() {
    const modal = document.getElementById('partnerStatusModal');
    if (modal) modal.classList.remove('show');
}

async function updatePartnerStatus(partnerId, color, text) {
    closePartnerStatusModal();

    // Optimistic update (optional, but good for UX)
    // For now, we'll wait for API success to ensure consistency

    try {
        const url = `${API_CONFIG.WORKER_URL}/api/odata/Partner(${partnerId})/ODataService.UpdateStatus`;
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'content-type': 'application/json;charset=UTF-8',
                'accept': 'application/json, text/plain, */*'
            },
            body: JSON.stringify({ status: `${color}_${text}` })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Success
        window.notificationManager.show('Cập nhật trạng thái thành công', 'success');

        // Update local data
        allData.forEach(order => {
            if (String(order.PartnerId) === String(partnerId)) {
                order.PartnerStatus = text;
                order.PartnerStatusText = text;
            }
        });

        // Inline UI Update
        const badges = document.querySelectorAll(`.partner-status[data-partner-id="${partnerId}"]`);
        badges.forEach(badge => {
            badge.style.backgroundColor = color;
            badge.innerText = text;
            badge.setAttribute('onclick', `openPartnerStatusModal('${partnerId}', '${text}')`);
        });

    } catch (error) {
        console.error('[PARTNER] Update status failed:', error);
        window.notificationManager.show('Cập nhật trạng thái thất bại: ' + error.message, 'error');
    }
}

// --- Order Status Modal Logic ---

const ORDER_STATUS_OPTIONS = [
    { value: "Đơn hàng", text: "Đơn hàng", color: "#5cb85c" },
    { value: "Hủy", text: "Huỷ bỏ", color: "#d1332e" },
    { value: "Nháp", text: "Nháp", color: "#f0ad4e" }
];

function openOrderStatusModal(orderId, currentStatus) {
    const modal = document.getElementById('orderStatusModal');
    const container = document.getElementById('orderStatusOptions');
    if (!modal || !container) return;

    // Populate options
    container.innerHTML = '';
    ORDER_STATUS_OPTIONS.forEach(option => {
        const btn = document.createElement('div');
        btn.className = 'status-btn';
        if (option.value === currentStatus) btn.classList.add('selected');

        btn.innerHTML = `
            <span class="status-color-dot" style="background-color: ${option.color};"></span>
            <span class="status-text">${option.text}</span>
        `;
        btn.onclick = () => updateOrderStatus(orderId, option.value, option.text, option.color);
        container.appendChild(btn);
    });

    modal.classList.add('show');
}

function closeOrderStatusModal() {
    const modal = document.getElementById('orderStatusModal');
    if (modal) modal.classList.remove('show');
}

async function updateOrderStatus(orderId, newValue, newText, newColor) {
    closeOrderStatusModal();

    try {
        const url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/OdataService.UpdateStatusSaleOnline?Id=${orderId}&Status=${encodeURIComponent(newValue)}`;
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'content-type': 'application/json;charset=utf-8',
                'accept': '*/*'
            },
            body: null
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Success
        window.notificationManager.show('Cập nhật trạng thái đơn hàng thành công', 'success');

        // Update local data
        allData.forEach(order => {
            if (String(order.Id) === String(orderId)) {
                order.Status = newValue;
                order.StatusText = newText;
            }
        });

        // Inline UI Update
        const badges = document.querySelectorAll(`.status-badge[data-order-id="${orderId}"]`);
        badges.forEach(badge => {
            badge.className = `status-badge ${newValue === "Draft" ? "status-draft" : "status-order"}`;
            // Update color manually if needed, or rely on class. 
            // The existing logic uses classes, but we might want to force the color if it's custom.
            // For now, let's just update the text and rely on re-render or class.
            // Actually, the user provided specific colors for the options.
            // Let's apply the color directly for immediate feedback.
            badge.style.backgroundColor = newColor; // This might override class styles
            badge.innerText = newText || newValue;
            badge.setAttribute('onclick', `openOrderStatusModal('${orderId}', '${newValue}')`);
        });

        // If we want to be safe and consistent with filters:
        // performTableSearch(); // Optional, but inline is faster.

    } catch (error) {
        console.error('[ORDER] Update status failed:', error);
        window.notificationManager.show('Cập nhật trạng thái thất bại: ' + error.message, 'error');
    }
}

function updateStats() {
    const totalAmount = displayedData.reduce(
        (sum, order) => sum + (order.TotalAmount || 0),
        0,
    );

    // Calculate merged order statistics
    const mergedOrders = displayedData.filter(order => order.IsMerged === true);
    const totalOriginalOrders = displayedData.reduce((sum, order) => {
        return sum + (order.MergedCount || 1);
    }, 0);

    // Update total orders count
    document.getElementById("totalOrdersCount").textContent =
        filteredData.length.toLocaleString("vi-VN");

    // Update merged orders info
    const mergedInfoElement = document.getElementById("mergedOrdersInfo");
    if (mergedOrders.length > 0) {
        mergedInfoElement.textContent =
            `${mergedOrders.length} đơn gộp (${totalOriginalOrders} đơn gốc)`;
        mergedInfoElement.style.color = "#f59e0b"; // Orange color for emphasis
    } else {
        mergedInfoElement.textContent = "-";
        mergedInfoElement.style.color = "#9ca3af"; // Gray color
    }

    document.getElementById("displayedOrdersCount").textContent =
        displayedData.length.toLocaleString("vi-VN");
    document.getElementById("totalAmountSum").textContent =
        totalAmount.toLocaleString("vi-VN") + "đ";
    document.getElementById("loadingProgress").textContent = "100%";
}

function updatePageInfo() {
    const totalDisplayed = displayedData.length;
    const totalFiltered = filteredData.length;
    document.getElementById("pageInfo").textContent =
        `Hiển thị ${totalDisplayed.toLocaleString("vi-VN")} / ${totalFiltered.toLocaleString("vi-VN")}`;
    document.getElementById("scrollHint").textContent =
        totalDisplayed > 0 ? "✅ Đã hiển thị tất cả" : "";
}

// =====================================================
// EVENT HANDLERS & HELPERS
// =====================================================
function sendDataToTab2() {
    const filterData = {
        startDate: convertToUTC(document.getElementById("startDate").value),
        endDate: convertToUTC(document.getElementById("endDate").value),
        campaignId: selectedCampaign?.campaignId || null,
        campaignName: selectedCampaign?.displayName || "",
        data: allData,
        totalRecords: allData.length,
        timestamp: new Date().toISOString(),
    };
    if (window.parent)
        window.parent.postMessage(
            { type: "FILTER_CHANGED", filter: filterData },
            "*",
        );

    // Save to localStorage with quota handling
    try {
        localStorage.setItem("tab1_filter_data", JSON.stringify(filterData));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.warn('[TAB1] localStorage quota exceeded, clearing old data...');
            // Clear old data and try again
            localStorage.removeItem("tab1_filter_data");
            try {
                // If still too large, save only metadata (no data array)
                const lightData = { ...filterData, data: [], dataSkipped: true };
                localStorage.setItem("tab1_filter_data", JSON.stringify(lightData));
                console.log('[TAB1] Saved lightweight filter data (without orders array)');
            } catch (e2) {
                console.error('[TAB1] Failed to save even lightweight data:', e2);
            }
        } else {
            console.error('[TAB1] localStorage error:', e);
        }
    }
}

// =====================================================
// HELPER: CHECK IF ORDER SHOULD BE SELECTABLE
// =====================================================
// =====================================================
// HELPER: CHECK IF ORDER SHOULD BE SELECTABLE
// =====================================================
// SELECTION MANAGEMENT (STATE-BASED)
// =====================================================


function isOrderSelectable(orderId) {
    const order = allData.find(o => o.Id === orderId);
    if (!order) return true; // Nếu không tìm thấy, cho phép select

    // Kiểm tra số lượng = 0
    if (order.TotalQuantity === 0) {
        console.log(`[SELECT] Skipping order ${order.Code}: TotalQuantity = 0`);
        return false;
    }

    // Kiểm tra tag "GIỎ TRỐNG"
    if (order.Tags) {
        try {
            const tags = JSON.parse(order.Tags);
            if (Array.isArray(tags)) {
                const hasEmptyCartTag = tags.some(tag =>
                    tag.Name && tag.Name.toUpperCase() === "GIỎ TRỐNG"
                );
                if (hasEmptyCartTag) {
                    console.log(`[SELECT] Skipping order ${order.Code}: Has "GIỎ TRỐNG" tag`);
                    return false;
                }
            }
        } catch (e) {
            // Nếu parse lỗi, cho phép select
        }
    }

    return true;
}

function handleSelectAll() {
    const isChecked = document.getElementById("selectAll").checked;

    if (isChecked) {
        // Select ALL displayed data (not just visible rows)
        displayedData.forEach(order => {
            selectedOrderIds.add(order.Id);
        });
    } else {
        // Deselect ALL
        selectedOrderIds.clear();
    }

    // Update visible checkboxes
    const checkboxes = document.querySelectorAll('#tableBody input[type="checkbox"]');
    checkboxes.forEach((cb) => {
        cb.checked = isChecked;
    });

    // Also update employee select all checkboxes
    const employeeSelectAlls = document.querySelectorAll('.employee-select-all');
    employeeSelectAlls.forEach(cb => {
        cb.checked = isChecked;
    });

    // Trigger update action buttons
    updateActionButtons();
}

// Global event listener for checkbox changes (Delegation)
document.addEventListener('change', function (e) {
    if (e.target.matches('tbody input[type="checkbox"]')) {
        const orderId = e.target.value;
        if (e.target.checked) {
            selectedOrderIds.add(orderId);
        } else {
            selectedOrderIds.delete(orderId);
            // Uncheck "Select All" if one is unchecked
            document.getElementById("selectAll").checked = false;
        }
        updateActionButtons();
    }
});

// =====================================================
// UPDATE ACTION BUTTONS VISIBILITY
// =====================================================
function updateActionButtons() {
    const actionButtonsSection = document.getElementById('actionButtonsSection');
    const selectedCountSpan = document.getElementById('selectedOrdersCount');
    const createSaleButtonBtn = document.getElementById('createSaleButtonBtn');
    const createFastSaleBtn = document.getElementById('createFastSaleBtn');
    const checkedCount = selectedOrderIds.size;

    if (checkedCount > 0) {
        actionButtonsSection.style.display = 'flex';
        selectedCountSpan.textContent = checkedCount.toLocaleString('vi-VN');
    } else {
        actionButtonsSection.style.display = 'none';
    }

    // Show "Tạo nút bán hàng" button only when exactly 1 order is selected
    if (createSaleButtonBtn) {
        createSaleButtonBtn.style.display = checkedCount === 1 ? 'flex' : 'none';
    }

    // Show "Tạo nhanh PBH" button when more than 1 order is selected
    if (createFastSaleBtn) {
        createFastSaleBtn.style.display = checkedCount > 1 ? 'flex' : 'none';
    }
}

async function handleClearCache() {
    const confirmed = await window.notificationManager.confirm(
        "Bạn có chắc muốn xóa toàn bộ cache?",
        "Xác nhận xóa cache"
    );
    if (confirmed) {
        window.cacheManager.clear("orders");
        window.cacheManager.clear("campaigns");
        window.notificationManager.success("Đã xóa cache");
        location.reload();
    }
}

function showLoading(show) {
    document.getElementById("loadingOverlay").classList.toggle("show", show);
}

function showInfoBanner(text) {
    const banner = document.getElementById("infoBanner");
    document.getElementById("infoText").textContent = text;
    banner.style.display = "flex";
    setTimeout(() => (banner.style.display = "none"), 5000);
}

function showSaveIndicator(type, message) {
    const indicator = document.getElementById("saveIndicator");
    const text = document.getElementById("saveIndicatorText");
    const icon = indicator.querySelector("i");
    indicator.className = "save-indicator " + type;
    text.textContent = message;
    icon.className =
        type === "success"
            ? "fas fa-check-circle"
            : "fas fa-exclamation-circle";
    indicator.classList.add("show");
    setTimeout(() => indicator.classList.remove("show"), 3000);
}

// ===============================================
// EDIT ORDER MODAL
// ===============================================
(function initEditModal() {
    if (document.getElementById("editOrderModal")) return;
    const modalHTML = `
        <div id="editOrderModal" class="edit-modal">
            <div class="edit-modal-content">
                <div class="edit-modal-header">
                    <h3><i class="fas fa-edit"></i> Sửa đơn hàng <span class="order-code" id="modalOrderCode">...</span></h3>
                    <button class="edit-modal-close" onclick="closeEditModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="edit-tabs">
                    <button class="edit-tab-btn active" onclick="switchEditTab('info')"><i class="fas fa-user"></i> Thông tin liên hệ</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('products')"><i class="fas fa-box"></i> Sản phẩm (<span id="productCount">0</span>)</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('delivery')"><i class="fas fa-shipping-fast"></i> Thông tin giao hàng</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('live')"><i class="fas fa-video"></i> Lịch sử đơn live</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('invoices')"><i class="fas fa-file-invoice-dollar"></i> Thông tin hóa đơn</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('invoice_history')"><i class="fas fa-history"></i> Lịch sử hóa đơn</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('history')"><i class="fas fa-clock"></i> Lịch sử chỉnh sửa</button>
                </div>
                <div class="edit-modal-body" id="editModalBody"><div class="loading-state"><div class="loading-spinner"></div></div></div>
                <div class="edit-modal-footer">
                    <div class="modal-footer-left"><i class="fas fa-info-circle"></i> Cập nhật lần cuối: <span id="lastUpdated">...</span></div>
                    <div class="modal-footer-right">
                        <button class="btn-modal btn-modal-print" onclick="printOrder()"><i class="fas fa-print"></i> In đơn</button>
                        <button class="btn-modal btn-modal-cancel" onclick="closeEditModal()"><i class="fas fa-times"></i> Đóng</button>
                        <button class="btn-modal btn-modal-save" onclick="saveAllOrderChanges()"><i class="fas fa-save"></i> Lưu tất cả thay đổi</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
})();

