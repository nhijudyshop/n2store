// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Tab Social Orders - Table Module
 * Table rendering, filtering, search
 */

function removeDiacritics(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
}

// Cache for order search fields to avoid recomputing removeDiacritics on every keystroke
const _searchFieldsCache = new Map();
function getOrderSearchFields(order) {
    const cacheKey = order.id + '_' + (order.updatedAt || 0);
    let cached = _searchFieldsCache.get(cacheKey);
    if (cached) return cached;

    cached = removeDiacritics(
        [order.id, order.customerName, order.phone, order.address, order.note]
            .filter(Boolean)
            .join(' ')
    );
    _searchFieldsCache.set(cacheKey, cached);

    // Keep cache size bounded
    if (_searchFieldsCache.size > 2000) {
        const firstKey = _searchFieldsCache.keys().next().value;
        _searchFieldsCache.delete(firstKey);
    }
    return cached;
}

// ===== TABLE RENDERING =====
// Diff-based render: reuse rows whose (id + updatedAt + selected + displayedStt) chưa đổi.
// Tránh phá + dựng lại toàn bộ DOM 164 rows × 11 cells mỗi lần filter/search.
// Dùng `order.stt || (index+1)` thay vì raw index để khi thêm đơn mới không force
// re-render toàn bộ rows chỉ vì index shift.
function _rowRenderKey(order, index) {
    const selected = SocialOrderState.selectedOrders.has(order.id) ? 1 : 0;
    const displayStt = order.stt || index + 1;
    return `${order.id}|${order.updatedAt || 0}|${selected}|${displayStt}`;
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    // One-time: bind delegated listeners cho cả tbody (thay thế 1800+ inline onclick)
    _bindTableDelegation(tbody);

    const orders = SocialOrderState.filteredOrders;

    if (orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="16" style="text-align: center; padding: 60px 20px;">
                    <div style="color: #9ca3af;">
                        <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>
                        <p style="margin: 0; font-size: 14px;">Không có đơn hàng nào</p>
                        <p style="margin: 8px 0 0; font-size: 13px;">Nhấn "Tạo đơn mới" để bắt đầu</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    // Map existing rows theo orderId (để tái sử dụng)
    const existing = new Map();
    tbody.querySelectorAll('tr[data-order-id]').forEach((tr) => {
        existing.set(tr.dataset.orderId, tr);
    });

    const fragment = document.createDocumentFragment();
    const parser = document.createElement('tbody');

    orders.forEach((order, index) => {
        const key = _rowRenderKey(order, index);
        const prev = existing.get(order.id);
        if (prev && prev.dataset.renderKey === key) {
            // Row không đổi → giữ nguyên DOM node (move từ tbody sang fragment)
            fragment.appendChild(prev);
        } else {
            // Tạo row mới
            parser.innerHTML = renderTableRow(order, index);
            const tr = parser.firstElementChild;
            if (tr) {
                tr.dataset.renderKey = key;
                fragment.appendChild(tr);
            }
        }
        existing.delete(order.id);
    });

    // existing còn lại = rows của order không còn trong filteredOrders → bị drop tự động
    // khi replaceChildren (những rows này không còn trong fragment)
    tbody.replaceChildren(fragment);

    // Column visibility is handled by CSS <style> element - no per-cell work needed

    // Update page info
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
        pageInfo.textContent = `Hiển thị 1 - ${orders.length} của ${SocialOrderState.orders.length}`;
    }
}

// ===== EVENT DELEGATION (1 listener trên tbody thay vì 11 onclick × 164 row) =====
let _tableDelegationBound = false;
function _bindTableDelegation(tbody) {
    if (_tableDelegationBound) return;
    tbody.addEventListener('click', _handleTableClick);
    tbody.addEventListener('change', _handleTableChange);
    _tableDelegationBound = true;
}

function _handleTableClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    // Checkbox dùng 'change' event, bỏ qua ở click handler
    if (action === 'toggle-select') return;

    const tr = target.closest('tr[data-order-id]');
    const orderId = tr?.dataset.orderId;

    switch (action) {
        case 'edit':
            if (typeof openEditOrderModal === 'function') openEditOrderModal(orderId);
            break;
        case 'cancel':
            // Gọi alias socialConfirmCancelOrder để tránh collision với tab1-fast-sale-workflow.js
            // (cả hai file define window.confirmCancelOrder; tab1 load sau nên đè lên bản inbox).
            if (typeof socialConfirmCancelOrder === 'function') socialConfirmCancelOrder(orderId);
            else if (typeof confirmCancelOrder === 'function') confirmCancelOrder(orderId);
            break;
        case 'restore':
            restoreOrder(orderId);
            break;
        case 'permanent-delete':
            confirmPermanentDeleteOrder(orderId);
            break;
        case 'sale':
            if (typeof openRetailSaleFromSocial === 'function') openRetailSaleFromSocial(orderId);
            break;
        case 'tag':
            if (typeof openTagModal === 'function') openTagModal(orderId);
            break;
        case 'copy-phone':
            if (typeof copyPhone === 'function') copyPhone(target.dataset.phone);
            break;
        case 'note-img-preview':
            e.stopPropagation();
            if (typeof openNoteImagePreview === 'function') {
                openNoteImagePreview(target.src || target.dataset.src);
            }
            break;
    }
}

function _handleTableChange(e) {
    const target = e.target;
    const action = target?.dataset?.action;
    if (action === 'toggle-select') {
        const orderId = target.dataset.orderId;
        if (orderId && typeof toggleOrderSelection === 'function') {
            toggleOrderSelection(orderId);
        }
    } else if (action === 'change-status') {
        const orderId = target.dataset.orderId;
        if (orderId && typeof changeSocialOrderStatus === 'function') {
            changeSocialOrderStatus(orderId, target.value);
        }
    }
}

function renderTableRow(order, index) {
    const isSelected = SocialOrderState.selectedOrders.has(order.id);
    const sourceConfig = SOURCE_CONFIG[order.source] || SOURCE_CONFIG.manual;
    const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;

    // Render tags
    let tagsHtml = '';
    if (order.tags && order.tags.length > 0) {
        tagsHtml = order.tags
            .map((tag) => {
                // Look up the full tag from state to get image
                const fullTag = SocialOrderState.tags.find((t) => t.id === tag.id);
                const hasImage = fullTag?.image || tag.image;
                const hoverAttrs = hasImage
                    ? `onmouseenter="showTagImageHover(this, '${tag.id}')" onmouseleave="hideTagImageHover()"`
                    : '';
                return `<span class="order-tag ${hasImage ? 'has-image' : ''}" style="background: ${tag.color};" ${hoverAttrs}>${tag.name}</span>`;
            })
            .join(' ');
    }

    // Render post link
    let postHtml = '';
    if (order.postUrl) {
        const icon =
            order.source === 'facebook_post'
                ? 'fa-facebook-f'
                : order.source === 'instagram'
                  ? 'fa-instagram'
                  : order.source === 'tiktok'
                    ? 'fa-tiktok'
                    : 'fa-link';
        postHtml = `
            <a href="${order.postUrl}" target="_blank" class="post-link" title="${order.postUrl}">
                <i class="fab ${icon}"></i>
                ${order.postLabel || 'Xem'}
            </a>
        `;
    } else {
        postHtml = '<span class="post-empty">—</span>';
    }

    // Render products summary
    const productCount = order.products?.length || 0;
    const productQty = order.totalQuantity || 0;
    const productsHtml = `
        <div style="font-size: 12px;">
            <strong>${productCount}</strong> SP
            <span style="color: #6b7280;">(${productQty} cái)</span>
        </div>
    `;

    // Chat button (disabled for now)
    const chatHtml = `
        <button class="chat-btn disabled" title="Chưa có thông tin Pancake" disabled>
            <i class="fas fa-comment-dots"></i>
        </button>
    `;

    return `
        <tr data-order-id="${order.id}">
            <td>
                <input type="checkbox"
                       class="order-checkbox"
                       data-order-id="${order.id}"
                       data-action="toggle-select"
                       ${isSelected ? 'checked' : ''}>
            </td>
            <td data-column="actions">
                <div class="action-buttons">
                    ${
                        order.status === 'cancelled'
                            ? `
                        <button class="btn-edit-icon" data-action="restore" title="Khôi phục đơn" style="color: #10b981;">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button class="tag-icon-btn-red" data-action="permanent-delete" title="Xóa vĩnh viễn">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    `
                            : `
                        <button class="btn-edit-icon" data-action="edit" title="Sửa đơn">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="tag-icon-btn-red" data-action="cancel" title="Hủy đơn" style="color: #f59e0b;">
                            <i class="fas fa-ban"></i>
                        </button>
                        <button class="btn-edit-icon" data-action="sale" title="Tạo phiếu bán hàng lẻ" style="color: #10b981;">
                            <i class="fas fa-receipt"></i>
                        </button>
                    `
                    }
                </div>
            </td>
            <td data-column="stt" style="text-align: center;">${order.stt || index + 1}</td>
            <td data-column="tag">
                <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                    <button class="tag-icon-btn" data-action="tag" title="Gán tag">
                        <i class="fas fa-tag"></i>
                    </button>
                    ${tagsHtml}
                </div>
            </td>
            <td data-column="note" style="max-width: 200px; font-size: 12px;">
                ${renderNoteCell(order)}
            </td>
            <td data-column="customer">
                <div class="customer-name">${order.customerName || '—'}</div>
            </td>
            <td data-column="phone">
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span>${order.phone || '—'}</span>
                    ${
                        order.phone
                            ? `
                        <button class="copy-phone-btn" data-action="copy-phone" data-phone="${order.phone}"
                                style="background: none; border: none; cursor: pointer; color: #9ca3af; padding: 2px;">
                            <i class="fas fa-copy" style="font-size: 11px;"></i>
                        </button>
                    `
                            : ''
                    }
                </div>
            </td>
            <td data-column="chat" style="text-align: center;">
                ${chatHtml}
            </td>
            <td data-column="products">
                ${productsHtml}
            </td>
            <td data-column="post">
                ${postHtml}
            </td>
            <td data-column="address" style="max-width: 200px; white-space: normal;">
                ${order.address || '—'}
            </td>
            <td data-column="total" style="text-align: right; font-weight: 600; color: #8b5cf6;">
                ${formatCurrency(order.totalAmount)}
            </td>
            <td data-column="created-date" style="font-size: 12px; color: #6b7280;">
                ${formatDate(order.createdAt)}
            </td>
            <td data-column="invoice-status" style="min-width: 160px;">
                ${typeof window.renderSocialInvoiceCell === 'function' ? window.renderSocialInvoiceCell(order) : '<span style="color: #9ca3af;">—</span>'}
            </td>
            <td data-column="status" style="text-align: center;">
                ${renderStatusCell(order, statusConfig)}
            </td>
        </tr>
    `;
}

// ===== NOTE CELL =====
function renderNoteCell(order) {
    const noteText = order.note || '';
    const noteImages = order.noteImages || [];
    if (!noteText && noteImages.length === 0) {
        return '<span style="color: #9ca3af;">—</span>';
    }
    let html = '';
    if (noteText) {
        const truncated = noteText.length > 50 ? noteText.substring(0, 50) + '...' : noteText;
        html += `<div style="color: #374151; white-space: normal; word-break: break-word;" title="${noteText.replace(/"/g, '&quot;')}">${truncated}</div>`;
    }
    if (noteImages.length > 0) {
        html += `<div style="display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap;">`;
        noteImages.forEach((img, i) => {
            if (i < 3) {
                html += `<div class="note-img-thumb-wrapper" style="position: relative; display: inline-block;">
                    <img src="${img}" class="note-img-thumb" data-action="note-img-preview" data-idx="${i}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb; cursor: pointer;"
                         onmouseenter="showNoteImageHover(this, this.src)"
                         onmouseleave="hideNoteImageHover()" />
                </div>`;
            }
        });
        if (noteImages.length > 3) {
            html += `<span style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: #f3f4f6; border-radius: 4px; font-size: 11px; color: #6b7280;">+${noteImages.length - 3}</span>`;
        }
        html += `</div>`;
    }
    return html;
}

// Hover preview for note images
let _noteHoverEl = null;

function showNoteImageHover(thumbEl, src) {
    hideNoteImageHover();
    const rect = thumbEl.getBoundingClientRect();
    _noteHoverEl = document.createElement('div');
    _noteHoverEl.style.cssText =
        'position: fixed; z-index: 99998; pointer-events: none; padding: 4px; background: white; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.25); border: 1px solid #e5e7eb; transition: opacity 0.15s;';

    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width: 300px; max-height: 300px; border-radius: 6px; display: block;';
    _noteHoverEl.appendChild(img);
    document.body.appendChild(_noteHoverEl);

    // Position: above or below the thumbnail
    img.onload = () => {
        if (!_noteHoverEl) return;
        const hoverRect = _noteHoverEl.getBoundingClientRect();
        let top = rect.top - hoverRect.height - 8;
        if (top < 8) {
            top = rect.bottom + 8;
        }
        let left = rect.left + rect.width / 2 - hoverRect.width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - hoverRect.width - 8));
        _noteHoverEl.style.top = top + 'px';
        _noteHoverEl.style.left = left + 'px';
    };

    // Initial position (before image loads)
    _noteHoverEl.style.top = rect.top - 200 + 'px';
    _noteHoverEl.style.left = rect.left + 'px';
}

function hideNoteImageHover() {
    if (_noteHoverEl) {
        _noteHoverEl.remove();
        _noteHoverEl = null;
    }
}

function openNoteImagePreview(src) {
    hideNoteImageHover();
    const overlay = document.createElement('div');
    overlay.style.cssText =
        'position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 99999; display: flex; align-items: center; justify-content: center; cursor: pointer;';
    overlay.onclick = () => overlay.remove();
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText =
        'max-width: 90vw; max-height: 90vh; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.3);';
    overlay.appendChild(img);
    document.body.appendChild(overlay);
}

// ===== FILTERING & SEARCH =====

// Debounce utility for search
let _searchDebounceTimer = null;
function debouncedTableSearch() {
    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => {
        performTableSearch();
    }, 250);
}

// Date filter state
let currentDateFilter = 'all';
let customDateFrom = null;
let customDateTo = null;

/**
 * Set date filter and update UI
 */
function setDateFilter(range) {
    currentDateFilter = range;

    // Update button states
    document.querySelectorAll('.date-filter-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.range === range);
    });

    // Hide custom date range if not custom
    if (range !== 'custom') {
        document.getElementById('customDateRange').style.display = 'none';
        customDateFrom = null;
        customDateTo = null;
    }

    performTableSearch();
}

/**
 * Toggle custom date range visibility
 */
function toggleCustomDateRange() {
    const container = document.getElementById('customDateRange');
    const isVisible = container.style.display !== 'none';

    if (isVisible) {
        container.style.display = 'none';
        setDateFilter('all');
    } else {
        container.style.display = 'flex';
        currentDateFilter = 'custom';

        // Update button states
        document.querySelectorAll('.date-filter-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.range === 'custom');
        });
    }
}

/**
 * Apply custom date range filter
 */
function applyCustomDateRange() {
    const fromInput = document.getElementById('dateFrom');
    const toInput = document.getElementById('dateTo');

    customDateFrom = fromInput.value ? new Date(fromInput.value) : null;
    customDateTo = toInput.value ? new Date(toInput.value + 'T23:59:59') : null;

    if (customDateFrom || customDateTo) {
        currentDateFilter = 'custom';
        performTableSearch();
    }
}

/**
 * Get date range based on filter selection
 */
function getDateRange(filter) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filter) {
        case 'today':
            return { from: today, to: new Date(today.getTime() + 86400000 - 1) };
        case 'yesterday':
            const yesterday = new Date(today.getTime() - 86400000);
            return { from: yesterday, to: new Date(today.getTime() - 1) };
        case '3days':
            return { from: new Date(today.getTime() - 3 * 86400000), to: now };
        case '7days':
            return { from: new Date(today.getTime() - 7 * 86400000), to: now };
        case '15days':
            return { from: new Date(today.getTime() - 15 * 86400000), to: now };
        case 'custom':
            return { from: customDateFrom, to: customDateTo };
        default:
            return { from: null, to: null };
    }
}

function performTableSearch() {
    const searchInput = document.getElementById('tableSearchInput');
    const statusFilter = document.getElementById('statusFilter');
    const sourceFilter = document.getElementById('sourceFilter');
    const tagFilter = document.getElementById('tagFilter');

    const searchTerm = removeDiacritics((searchInput?.value || '').trim());
    const statusValue = statusFilter?.value || 'all';
    const sourceValue = sourceFilter?.value || 'all';
    const tagValue = tagFilter?.value || 'all';

    // Get date range
    const dateRange = getDateRange(currentDateFilter);

    // Update state
    SocialOrderState.filters = {
        search: searchTerm,
        status: statusValue,
        source: sourceValue,
        tag: tagValue,
        dateFilter: currentDateFilter,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
    };

    // Filter orders
    SocialOrderState.filteredOrders = SocialOrderState.orders.filter((order) => {
        // Date filter
        if (dateRange.from || dateRange.to) {
            const orderDate = new Date(order.createdAt);
            if (dateRange.from && orderDate < dateRange.from) {
                return false;
            }
            if (dateRange.to && orderDate > dateRange.to) {
                return false;
            }
        }

        // Status filter
        if (statusValue !== 'all' && order.status !== statusValue) {
            return false;
        }

        // Source filter
        if (sourceValue !== 'all' && order.source !== sourceValue) {
            return false;
        }

        // Tag filter
        if (tagValue !== 'all') {
            const hasTag = order.tags?.some((t) => t.id === tagValue);
            if (!hasTag) return false;
        }

        // Search filter (accent-insensitive, cached)
        if (searchTerm) {
            if (!getOrderSearchFields(order).includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    // Update UI
    renderTable();
    updateSearchResultCount();
    updateSearchClearButton();

    // Update tag panel counts only if panel is open
    if (
        typeof renderTagPanelCards === 'function' &&
        typeof isTagPanelOpen !== 'undefined' &&
        isTagPanelOpen
    ) {
        renderTagPanelCards();
    }
}

function clearSearch() {
    const searchInput = document.getElementById('tableSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    performTableSearch();
}

function updateSearchResultCount() {
    const countEl = document.getElementById('searchResultCount');
    if (countEl) {
        countEl.textContent = SocialOrderState.filteredOrders.length;
    }
}

function updateSearchClearButton() {
    const clearBtn = document.getElementById('searchClearBtn');
    const searchInput = document.getElementById('tableSearchInput');
    if (clearBtn && searchInput) {
        clearBtn.classList.toggle('active', searchInput.value.length > 0);
    }
}

// ===== TAG FILTER =====
function populateTagFilter() {
    const tagFilter = document.getElementById('tagFilter');
    if (!tagFilter) return;

    // Keep "Tất cả" option
    tagFilter.innerHTML = '<option value="all" selected>Tất cả</option>';

    // Add tags
    SocialOrderState.tags.forEach((tag) => {
        const option = document.createElement('option');
        option.value = tag.id;
        option.textContent = tag.name;
        tagFilter.appendChild(option);
    });
}

// ===== SELECTION =====
function toggleOrderSelection(orderId) {
    if (SocialOrderState.selectedOrders.has(orderId)) {
        SocialOrderState.selectedOrders.delete(orderId);
    } else {
        SocialOrderState.selectedOrders.add(orderId);
    }
    updateSelectionUI();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.order-checkbox');

    if (selectAllCheckbox?.checked) {
        // Select all visible orders
        SocialOrderState.filteredOrders.forEach((order) => {
            SocialOrderState.selectedOrders.add(order.id);
        });
        checkboxes.forEach((cb) => (cb.checked = true));
    } else {
        // Deselect all
        SocialOrderState.selectedOrders.clear();
        checkboxes.forEach((cb) => (cb.checked = false));
    }

    updateSelectionUI();
}

function updateSelectionUI() {
    const count = SocialOrderState.selectedOrders.size;
    const actionSection = document.getElementById('actionButtonsSection');
    const countEl = document.getElementById('selectedOrdersCount');

    if (actionSection) {
        actionSection.style.display = count > 0 ? 'flex' : 'none';
    }

    if (countEl) {
        countEl.textContent = count;
    }

    // Update selectAll checkbox
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        const visibleCount = SocialOrderState.filteredOrders.length;
        selectAllCheckbox.checked = count > 0 && count === visibleCount;
        selectAllCheckbox.indeterminate = count > 0 && count < visibleCount;
    }

    // Refresh bulk action bar (cancel vs restore/permanent delete)
    if (typeof updateBulkActionBar === 'function') updateBulkActionBar();
}

// ===== UTILITY ACTIONS =====
function copyPhone(phone) {
    navigator.clipboard
        .writeText(phone)
        .then(() => {
            showNotification('Đã copy số điện thoại', 'success');
        })
        .catch(() => {
            showNotification('Không thể copy', 'error');
        });
}

// ===== CANCEL / RESTORE / PERMANENT DELETE =====
// Single pending action state — dispatched by confirmPendingAction()
let pendingAction = null; // { type, ids, single }

/**
 * Configure the confirm modal UI based on action type.
 * Optional reasonInput=true shows a textarea pre-filled with "HẾT HÀNG".
 */
function _showConfirmModal({
    titleText,
    titleColor,
    titleIcon,
    message,
    warning,
    info,
    btnText,
    btnIcon,
    btnColor,
    reasonInput,
}) {
    const modal = document.getElementById('confirmDeleteModal');
    if (!modal) return;

    const titleTextEl = document.getElementById('confirmDeleteTitleText');
    const titleIconEl = document.getElementById('confirmDeleteTitleIcon');
    const messageEl = document.getElementById('confirmDeleteMessage');
    const warningEl = document.getElementById('confirmDeleteWarning');
    const infoEl = document.getElementById('confirmDeleteInfo');
    const btnEl = document.getElementById('confirmDeleteButton');
    const btnIconEl = document.getElementById('confirmDeleteButtonIcon');
    const btnTextEl = document.getElementById('confirmDeleteButtonText');
    const reasonBlockEl = document.getElementById('confirmCancelReasonBlock');
    const reasonInputEl = document.getElementById('confirmCancelReason');

    if (titleTextEl) titleTextEl.textContent = titleText;
    if (titleIconEl) {
        titleIconEl.className = `fas ${titleIcon}`;
        titleIconEl.style.color = titleColor;
    }
    if (messageEl) messageEl.innerHTML = message;
    if (warningEl) warningEl.style.display = warning ? 'block' : 'none';
    if (infoEl) infoEl.style.display = info ? 'block' : 'none';
    if (btnIconEl) btnIconEl.className = `fas ${btnIcon}`;
    if (btnTextEl) btnTextEl.textContent = btnText;
    if (btnEl) btnEl.style.background = btnColor;

    if (reasonBlockEl) reasonBlockEl.style.display = reasonInput ? 'block' : 'none';
    if (reasonInput && reasonInputEl) {
        reasonInputEl.value = 'HẾT HÀNG';
        // Focus + select after modal opens
        setTimeout(() => {
            reasonInputEl.focus();
            reasonInputEl.select();
        }, 50);
    }

    modal.classList.add('show');
}

function closeConfirmDeleteModal() {
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) modal.classList.remove('show');
    pendingAction = null;
}

// ---- SINGLE: CANCEL ----
function confirmCancelOrder(orderId) {
    console.log('[CANCEL-DEBUG] 1️⃣ confirmCancelOrder called', { orderId });
    const order = SocialOrderState.orders.find((o) => o.id === orderId);
    if (!order) {
        console.warn('[CANCEL-DEBUG] ❌ Order not found in state:', orderId);
        return;
    }
    console.log('[CANCEL-DEBUG] 2️⃣ Found order:', {
        id: order.id,
        stt: order.stt,
        customerName: order.customerName,
        status: order.status,
        existingNote: order.note,
    });
    pendingAction = { type: 'cancel', ids: [orderId], single: true };
    console.log('[CANCEL-DEBUG] 3️⃣ pendingAction set:', pendingAction);
    _showConfirmModal({
        titleText: 'Xác nhận hủy đơn',
        titleColor: '#f59e0b',
        titleIcon: 'fa-ban',
        message: `Bạn có chắc muốn <strong>hủy</strong> đơn <strong>#${order.stt || orderId}</strong>?<br>
            <span style="color:#6b7280; font-size:13px;">Khách: ${order.customerName || 'N/A'}</span>`,
        warning: false,
        info: true,
        btnText: 'Hủy đơn',
        btnIcon: 'fa-ban',
        btnColor: '#f59e0b',
        reasonInput: true,
    });
    console.log('[CANCEL-DEBUG] 4️⃣ Modal opened, waiting for user confirm...');
}

// ---- SINGLE: PERMANENT DELETE ----
function confirmPermanentDeleteOrder(orderId) {
    const order = SocialOrderState.orders.find((o) => o.id === orderId);
    if (!order) return;
    pendingAction = { type: 'permanent_delete', ids: [orderId], single: true };
    _showConfirmModal({
        titleText: 'Xóa vĩnh viễn',
        titleColor: '#ef4444',
        titleIcon: 'fa-exclamation-triangle',
        message: `Bạn có chắc muốn <strong>xóa vĩnh viễn</strong> đơn <strong>#${order.stt || orderId}</strong>?<br>
            <span style="color:#6b7280; font-size:13px;">Khách: ${order.customerName || 'N/A'}</span>`,
        warning: true,
        info: false,
        btnText: 'Xóa vĩnh viễn',
        btnIcon: 'fa-trash-alt',
        btnColor: '#ef4444',
    });
}

// ---- SINGLE: RESTORE (no modal, instant action) ----
// Guard double-click: tránh fire API 2 lần khi click nhanh
const _restoreInFlight = new Set();
async function restoreOrder(orderId) {
    if (_restoreInFlight.has(orderId)) return;
    _restoreInFlight.add(orderId);
    try {
        const order = SocialOrderState.orders.find((o) => o.id === orderId);
        if (!order) return;

        order.status = 'draft';
        order.updatedAt = Date.now();
        saveSocialOrdersToStorage();

        if (typeof updateSocialOrder === 'function') {
            updateSocialOrder(orderId, { status: 'draft' }); // fire-and-forget
        }
        if (window.InboxHistory && typeof InboxHistory.logRestore === 'function') {
            InboxHistory.logRestore(order);
        }
        showNotification('Đã khôi phục đơn hàng', 'success');
        performTableSearch();
    } finally {
        _restoreInFlight.delete(orderId);
    }
}

// ---- DISPATCHER: confirm pending action from modal ----
// Guard double-click: tránh fire action (hủy/xóa) 2 lần khi click nhanh
let _isConfirmingAction = false;
function confirmPendingAction() {
    console.log('[CANCEL-DEBUG] 5️⃣ confirmPendingAction called', { pendingAction });
    if (_isConfirmingAction) {
        console.warn('[CANCEL-DEBUG] ⚠️ confirmPendingAction đang chạy, bỏ qua click trùng');
        return;
    }
    if (!pendingAction) {
        console.warn('[CANCEL-DEBUG] ❌ No pendingAction, closing modal');
        closeConfirmDeleteModal();
        return;
    }

    _isConfirmingAction = true;
    const confirmBtn = document.getElementById('confirmDeleteButton');
    if (confirmBtn) confirmBtn.disabled = true;
    try {
        // Read cancel reason from textarea (only used for cancel / bulk_cancel)
        let reason = '';
        if (pendingAction.type === 'cancel' || pendingAction.type === 'bulk_cancel') {
            const reasonEl = document.getElementById('confirmCancelReason');
            const rawValue = reasonEl ? reasonEl.value : '(textarea not found)';
            reason = (reasonEl && reasonEl.value ? reasonEl.value.trim() : '') || 'HẾT HÀNG';
            console.log('[CANCEL-DEBUG] 6️⃣ Reason read from textarea:', {
                rawValue,
                cleaned: reason,
                textareaFound: !!reasonEl,
            });
        }

        console.log('[CANCEL-DEBUG] 7️⃣ Dispatching action type:', pendingAction.type);
        switch (pendingAction.type) {
            case 'cancel':
            case 'bulk_cancel':
                _doCancel(pendingAction.ids, reason);
                break;
            case 'permanent_delete':
            case 'bulk_permanent_delete':
                _doPermanentDelete(pendingAction.ids);
                break;
            default:
                console.warn('[CANCEL-DEBUG] ❌ Unknown action type:', pendingAction.type);
        }
        closeConfirmDeleteModal();
        console.log('[CANCEL-DEBUG] ✅ confirmPendingAction done, modal closed');
    } finally {
        _isConfirmingAction = false;
        if (confirmBtn) confirmBtn.disabled = false;
    }
}

/**
 * Soft-cancel orders. Prepends "[HỦY: <reason>]" to existing note so the
 * reason is visible in the Đã hủy tab without adding a new DB column.
 */
function _doCancel(ids, reason) {
    console.log('[CANCEL-DEBUG] 8️⃣ _doCancel called', { ids, reason });
    const cleanReason = (reason || 'HẾT HÀNG').trim();
    const marker = `[HỦY: ${cleanReason}]`;
    console.log('[CANCEL-DEBUG] 9️⃣ Marker:', marker);
    let count = 0;

    ids.forEach((id) => {
        const order = SocialOrderState.orders.find((o) => o.id === id);
        if (!order) {
            console.warn('[CANCEL-DEBUG] ❌ Order not found for id:', id);
            return;
        }

        // Build new note: prepend marker, preserve any existing note below
        const existingNote = (order.note || '').trim();
        // If existing note already starts with a [HỦY: ...] marker, replace it
        const stripped = existingNote.replace(/^\[HỦY:[^\]]*\]\s*/i, '');
        const newNote = stripped ? `${marker}\n${stripped}` : marker;

        console.log('[CANCEL-DEBUG] 🔟 Note transform for order', id, {
            before: existingNote,
            stripped,
            after: newNote,
        });

        order.status = 'cancelled';
        order.note = newNote;
        order.updatedAt = Date.now();

        if (typeof updateSocialOrder === 'function') {
            console.log('[CANCEL-DEBUG] 📡 Calling updateSocialOrder (fire-and-forget)', {
                id,
                payload: { status: 'cancelled', note: newNote },
            });
            updateSocialOrder(id, { status: 'cancelled', note: newNote })
                .then((r) => console.log('[CANCEL-DEBUG] ✅ updateSocialOrder resolved for', id, r))
                .catch((e) =>
                    console.error('[CANCEL-DEBUG] ❌ updateSocialOrder FAILED for', id, e)
                );
        } else {
            console.warn('[CANCEL-DEBUG] ⚠️ updateSocialOrder is not a function');
        }
        if (window.InboxHistory && typeof InboxHistory.logCancel === 'function') {
            InboxHistory.logCancel(order, cleanReason);
            console.log('[CANCEL-DEBUG] 📝 History logged for', id);
        }
        count++;
    });

    saveSocialOrdersToStorage();
    console.log('[CANCEL-DEBUG] 💾 saveSocialOrdersToStorage done, count =', count);
    SocialOrderState.selectedOrders.clear();
    showNotification(
        count > 1 ? `Đã hủy ${count} đơn (${cleanReason})` : `Đã hủy đơn: ${cleanReason}`,
        'success'
    );
    performTableSearch();
    if (typeof updateSelectionUI === 'function') updateSelectionUI();
    console.log('[CANCEL-DEBUG] 🏁 _doCancel finished');
}

function _doPermanentDelete(ids) {
    const removed = SocialOrderState.orders
        .filter((o) => ids.includes(o.id))
        .map((o) => ({ ...o }));
    SocialOrderState.orders = SocialOrderState.orders.filter((o) => !ids.includes(o.id));
    SocialOrderState.selectedOrders.clear();
    saveSocialOrdersToStorage();

    // Fire-and-forget API call
    if (ids.length === 1) {
        if (typeof deleteSocialOrder === 'function') deleteSocialOrder(ids[0]);
    } else {
        if (typeof bulkDeleteSocialOrders === 'function') bulkDeleteSocialOrders(ids);
    }

    // Log
    if (window.InboxHistory) {
        if (ids.length === 1 && typeof InboxHistory.logPermanentDelete === 'function') {
            InboxHistory.logPermanentDelete(removed[0]);
        } else if (typeof InboxHistory.logBulkDelete === 'function') {
            InboxHistory.logBulkDelete(removed);
        }
    }

    showNotification(
        ids.length > 1 ? `Đã xóa vĩnh viễn ${ids.length} đơn` : 'Đã xóa vĩnh viễn đơn hàng',
        'success'
    );
    performTableSearch();
    if (typeof updateSelectionUI === 'function') updateSelectionUI();
}

// ---- BULK: CANCEL ----
function cancelSelectedOrders() {
    const count = SocialOrderState.selectedOrders.size;
    if (count === 0) return;
    const ids = [...SocialOrderState.selectedOrders];
    pendingAction = { type: 'bulk_cancel', ids, single: false };
    _showConfirmModal({
        titleText: 'Xác nhận hủy hàng loạt',
        titleColor: '#f59e0b',
        titleIcon: 'fa-ban',
        message: `Bạn có chắc muốn <strong>hủy ${count} đơn</strong> đã chọn?`,
        warning: false,
        info: true,
        btnText: `Hủy ${count} đơn`,
        btnIcon: 'fa-ban',
        btnColor: '#f59e0b',
        reasonInput: true,
    });
}

// ---- BULK: PERMANENT DELETE ----
function permanentDeleteSelectedOrders() {
    const count = SocialOrderState.selectedOrders.size;
    if (count === 0) return;
    const ids = [...SocialOrderState.selectedOrders];
    pendingAction = { type: 'bulk_permanent_delete', ids, single: false };
    _showConfirmModal({
        titleText: 'Xóa vĩnh viễn hàng loạt',
        titleColor: '#ef4444',
        titleIcon: 'fa-exclamation-triangle',
        message: `Bạn có chắc muốn <strong>xóa vĩnh viễn ${count} đơn</strong> đã chọn?`,
        warning: true,
        info: false,
        btnText: `Xóa ${count} đơn`,
        btnIcon: 'fa-trash-alt',
        btnColor: '#ef4444',
    });
}

// ---- BULK: RESTORE (instant) ----
function restoreSelectedOrders() {
    const count = SocialOrderState.selectedOrders.size;
    if (count === 0) return;
    const ids = [...SocialOrderState.selectedOrders];
    ids.forEach((id) => {
        const order = SocialOrderState.orders.find((o) => o.id === id);
        if (!order) return;
        order.status = 'draft';
        order.updatedAt = Date.now();
        if (typeof updateSocialOrder === 'function') {
            updateSocialOrder(id, { status: 'draft' });
        }
        if (window.InboxHistory && typeof InboxHistory.logRestore === 'function') {
            InboxHistory.logRestore(order);
        }
    });
    saveSocialOrdersToStorage();
    SocialOrderState.selectedOrders.clear();
    showNotification(`Đã khôi phục ${count} đơn`, 'success');
    performTableSearch();
    if (typeof updateSelectionUI === 'function') updateSelectionUI();
}

/**
 * Render bulk action buttons based on current status filter.
 * Called from updateSelectionUI() and performTableSearch().
 */
function updateBulkActionBar() {
    const container = document.getElementById('bulkActionButtons');
    if (!container) return;
    const statusFilter = document.getElementById('statusFilter');
    const currentFilter = statusFilter?.value || 'all';

    if (currentFilter === 'cancelled') {
        container.innerHTML = `
            <button class="btn-primary" onclick="restoreSelectedOrders()" style="background:#10b981;">
                <i class="fas fa-undo"></i> Khôi phục đã chọn
            </button>
            <button class="btn-primary" onclick="permanentDeleteSelectedOrders()" style="background:#ef4444;">
                <i class="fas fa-trash-alt"></i> Xóa vĩnh viễn đã chọn
            </button>
        `;
    } else {
        container.innerHTML = `
            <button class="btn-primary" onclick="cancelSelectedOrders()" style="background:#f59e0b;">
                <i class="fas fa-ban"></i> Hủy đơn đã chọn
            </button>
        `;
    }
}

// ===== STATUS EDIT (ADMIN ONLY) =====

/**
 * Check if current user is admin
 */
function _isAdminUser() {
    return window.authManager?.isAdminTemplate?.() || false;
}

/**
 * Render status cell - editable dropdown for admin, static badge for others
 */
function renderStatusCell(order, statusConfig) {
    if (_isAdminUser()) {
        const draftConfig = STATUS_CONFIG.draft;
        const orderConfig = STATUS_CONFIG.order;
        return `
            <select class="status-select-social"
                    data-order-id="${order.id}"
                    data-action="change-status"
                    style="background: ${statusConfig.bgColor}; color: ${statusConfig.textColor}; border: 1px solid ${statusConfig.color};">
                <option value="draft" ${order.status === 'draft' ? 'selected' : ''}
                    style="background: ${draftConfig.bgColor}; color: ${draftConfig.textColor};">
                    ${draftConfig.label}
                </option>
                <option value="order" ${order.status === 'order' ? 'selected' : ''}
                    style="background: ${orderConfig.bgColor}; color: ${orderConfig.textColor};">
                    ${orderConfig.label}
                </option>
            </select>
        `;
    }
    return `
        <span class="status-badge-social ${order.status}" style="background: ${statusConfig.bgColor}; color: ${statusConfig.textColor};">
            ${statusConfig.label}
        </span>
    `;
}

/**
 * Handle status change from dropdown (admin only)
 */
async function changeSocialOrderStatus(orderId, newStatus) {
    if (!_isAdminUser()) {
        showNotification('Bạn không có quyền thay đổi trạng thái', 'error');
        return;
    }

    const order = SocialOrderState.orders.find((o) => o.id === orderId);
    if (!order) return;

    const oldStatus = order.status;
    if (oldStatus === newStatus) return;

    // Update local state
    order.status = newStatus;
    saveSocialOrdersToStorage();

    // Sync to Firestore
    if (typeof updateSocialOrder === 'function') {
        await updateSocialOrder(orderId, { status: newStatus });
    }

    if (window.InboxHistory) InboxHistory.logStatusChange(order, oldStatus, newStatus);
    const statusLabel = STATUS_CONFIG[newStatus]?.label || newStatus;
    showNotification(`Đã chuyển trạng thái thành "${statusLabel}"`, 'success');

    // Re-render to update colors
    performTableSearch();
}

// ===== EXPORTS =====
window.renderTable = renderTable;
window.performTableSearch = performTableSearch;
window.debouncedTableSearch = debouncedTableSearch;
window.clearSearch = clearSearch;
window.setDateFilter = setDateFilter;
window.toggleCustomDateRange = toggleCustomDateRange;
window.applyCustomDateRange = applyCustomDateRange;
window.populateTagFilter = populateTagFilter;
window.toggleOrderSelection = toggleOrderSelection;
window.toggleSelectAll = toggleSelectAll;
window.copyPhone = copyPhone;
window.closeConfirmDeleteModal = closeConfirmDeleteModal;
window.confirmCancelOrder = confirmCancelOrder;
// Namespaced alias — tab1-fast-sale-workflow.js also defines a global confirmCancelOrder
// (index-based) and overrides ours when both scripts load on the same page (don-inbox).
// Row buttons call socialConfirmCancelOrder to avoid the collision.
window.socialConfirmCancelOrder = confirmCancelOrder;
window.confirmPermanentDeleteOrder = confirmPermanentDeleteOrder;
window.restoreOrder = restoreOrder;
window.confirmPendingAction = confirmPendingAction;
window.cancelSelectedOrders = cancelSelectedOrders;
window.permanentDeleteSelectedOrders = permanentDeleteSelectedOrders;
window.restoreSelectedOrders = restoreSelectedOrders;
window.updateBulkActionBar = updateBulkActionBar;
window.updateSearchResultCount = updateSearchResultCount;
window.changeSocialOrderStatus = changeSocialOrderStatus;
window.openNoteImagePreview = openNoteImagePreview;
