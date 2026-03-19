/**
 * Tab Social Orders - Panel Module
 * Right-side tag grouping panel with toggle, pin, and tag management
 */

// ===== STATE =====
const SOCIAL_PANEL_PIN_KEY = 'socialTagPanelPinned';
let isTagPanelOpen = false;
let isTagPanelPinned = false;
let activePanelTagId = null; // null = show all

// ===== PRESET COLORS =====
const TAG_PRESET_COLORS = [
    '#ef4444',
    '#f59e0b',
    '#10b981',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#f97316',
    '#14b8a6',
    '#6366f1',
    '#a855f7',
    '#e11d48',
    '#84cc16',
    '#06b6d4',
    '#7c3aed',
    '#db2777',
];

// ===== TAG IMAGE STATE =====
let pendingNewTagImage = null; // base64 image for new tag being added
let pendingEditTagImages = {}; // { tagId: base64 } for tags being edited
let hoveredImageTagId = null; // tag ID whose image area mouse is hovering over

// ===== INIT =====
function initTagPanel() {
    // Read pin state from localStorage
    const pinned = localStorage.getItem(SOCIAL_PANEL_PIN_KEY);
    isTagPanelPinned = pinned === 'true';

    // If pinned, auto-open panel
    if (isTagPanelPinned) {
        openTagPanel();
    }
}

// ===== TOGGLE PANEL =====
function toggleTagPanel() {
    if (isTagPanelOpen) {
        closeTagPanel();
    } else {
        openTagPanel();
    }
}

function openTagPanel() {
    const panel = document.getElementById('tagPanel');
    if (!panel) return;

    panel.classList.add('open');
    isTagPanelOpen = true;

    // Update toggle button
    const toggleBtn = document.getElementById('btnToggleTagPanel');
    if (toggleBtn) toggleBtn.classList.add('active');

    // Update pin button
    updatePinButtonUI();

    // Render cards
    renderTagPanelCards();

    // Show overlay on mobile
    const overlay = document.getElementById('tagPanelOverlay');
    if (overlay && window.innerWidth <= 1024) {
        overlay.classList.add('show');
    }
}

function closeTagPanel() {
    // Don't close if pinned
    if (isTagPanelPinned) return;

    const panel = document.getElementById('tagPanel');
    if (!panel) return;

    panel.classList.remove('open');
    isTagPanelOpen = false;

    // Update toggle button
    const toggleBtn = document.getElementById('btnToggleTagPanel');
    if (toggleBtn) toggleBtn.classList.remove('active');

    // Hide overlay on mobile
    const overlay = document.getElementById('tagPanelOverlay');
    if (overlay) overlay.classList.remove('show');
}

// Force close (even if pinned - used by close button)
function forceCloseTagPanel() {
    isTagPanelPinned = false;
    localStorage.setItem(SOCIAL_PANEL_PIN_KEY, 'false');

    const panel = document.getElementById('tagPanel');
    if (!panel) return;

    panel.classList.remove('open');
    isTagPanelOpen = false;

    const toggleBtn = document.getElementById('btnToggleTagPanel');
    if (toggleBtn) toggleBtn.classList.remove('active');

    const overlay = document.getElementById('tagPanelOverlay');
    if (overlay) overlay.classList.remove('show');
}

// ===== PIN =====
function togglePinTagPanel() {
    isTagPanelPinned = !isTagPanelPinned;
    localStorage.setItem(SOCIAL_PANEL_PIN_KEY, isTagPanelPinned.toString());
    updatePinButtonUI();

    if (isTagPanelPinned) {
        showNotification('Đã ghim panel', 'success');
    } else {
        showNotification('Đã bỏ ghim panel', 'success');
    }
}

function updatePinButtonUI() {
    const pinBtn = document.getElementById('btnPinPanel');
    if (!pinBtn) return;

    if (isTagPanelPinned) {
        pinBtn.classList.add('pinned');
        pinBtn.title = 'Bỏ ghim panel';
    } else {
        pinBtn.classList.remove('pinned');
        pinBtn.title = 'Ghim panel';
    }
}

// ===== DAY FILTER STATE =====
let activeTagDayFilter = 0; // 0 = no filter, 3/5/7/10 = filter by days

function onTagDayFilterChange() {
    const checkboxes = document.querySelectorAll('#tagPanelDayFilters input[type="checkbox"]');
    let maxDays = 0;
    checkboxes.forEach((cb) => {
        if (cb.checked) {
            const val = parseInt(cb.value);
            if (val > maxDays) maxDays = val;
        }
    });
    // Only allow one checked at a time (radio-like behavior)
    const clickedCb = event.target;
    if (clickedCb.checked) {
        checkboxes.forEach((cb) => {
            if (cb !== clickedCb) cb.checked = false;
        });
        activeTagDayFilter = parseInt(clickedCb.value);
    } else {
        activeTagDayFilter = 0;
    }
    renderTagPanelCards();
}

/**
 * Get tags that have at least one order created >= N days ago
 */
function getTagsWithOldOrders(days) {
    if (!days || days <= 0) return null; // no filter
    const now = Date.now();
    const threshold = now - days * 24 * 60 * 60 * 1000;
    const qualifiedTagIds = new Set();

    SocialOrderState.orders.forEach((order) => {
        if (!order.tags || order.tags.length === 0) return;
        const orderDate = order.createdAt || 0;
        if (orderDate <= threshold) {
            order.tags.forEach((t) => qualifiedTagIds.add(t.id));
        }
    });

    return qualifiedTagIds;
}

/**
 * Count orders per tag that are older than N days
 */
function getTagOldOrderCounts(days) {
    const counts = {};
    if (!days || days <= 0) return counts;
    const now = Date.now();
    const threshold = now - days * 24 * 60 * 60 * 1000;

    SocialOrderState.tags.forEach((tag) => {
        counts[tag.id] = 0;
    });
    SocialOrderState.orders.forEach((order) => {
        const orderDate = order.createdAt || 0;
        if (orderDate <= threshold) {
            (order.tags || []).forEach((t) => {
                if (counts[t.id] !== undefined) counts[t.id]++;
            });
        }
    });
    return counts;
}

// ===== RENDER TAG CARDS =====
function renderTagPanelCards() {
    const body = document.getElementById('tagPanelBody');
    if (!body) return;

    const searchInput = document.getElementById('tagPanelSearchInput');
    const searchTerm = removeDiacritics((searchInput?.value || '').trim());

    const counts = getTagOrderCounts();
    const totalOrders = SocialOrderState.orders.length;

    // Day filter: get qualified tag IDs
    const dayFilterTagIds = getTagsWithOldOrders(activeTagDayFilter);
    const oldCounts = activeTagDayFilter > 0 ? getTagOldOrderCounts(activeTagDayFilter) : null;

    let html = '';

    // "All" card (show if no day filter active and no search or matches "tất cả")
    if (
        !activeTagDayFilter &&
        (!searchTerm ||
            removeDiacritics('tất cả').includes(searchTerm) ||
            'tat ca'.includes(searchTerm))
    ) {
        html += `
            <div class="tag-panel-card ${activePanelTagId === null ? 'active' : ''}"
                 onclick="filterByPanelTag(null)">
                <div class="tag-panel-card-icon" style="background: #6b7280;">
                    <i class="fas fa-globe"></i>
                </div>
                <div class="tag-panel-card-info">
                    <div class="tag-panel-card-name">TẤT CẢ</div>
                    <div class="tag-panel-card-count">${totalOrders} đơn hàng</div>
                </div>
            </div>
        `;
    }

    // "No tag" card (hide when day filter is active)
    if (
        !activeTagDayFilter &&
        (!searchTerm ||
            removeDiacritics('chưa gán tag').includes(searchTerm) ||
            'chua gan tag'.includes(searchTerm))
    ) {
        const noTagCount = SocialOrderState.orders.filter(
            (o) => !o.tags || o.tags.length === 0
        ).length;
        html += `
            <div class="tag-panel-card ${activePanelTagId === '__no_tag__' ? 'active' : ''}"
                 onclick="filterByPanelTag('__no_tag__')">
                <div class="tag-panel-card-icon" style="background: #d1d5db;">
                    <i class="fas fa-tag" style="color: #6b7280;"></i>
                </div>
                <div class="tag-panel-card-info">
                    <div class="tag-panel-card-name">CHƯA GÁN TAG</div>
                    <div class="tag-panel-card-count">${noTagCount} đơn hàng</div>
                </div>
            </div>
        `;
    }

    // "Tag không có đơn" card (hide when day filter is active)
    if (
        !activeTagDayFilter &&
        (!searchTerm ||
            removeDiacritics('tag không có đơn').includes(searchTerm) ||
            'tag khong co don'.includes(searchTerm))
    ) {
        const tagsWithOrders = new Set();
        SocialOrderState.orders.forEach((order) => {
            (order.tags || []).forEach((t) => tagsWithOrders.add(t.id));
        });
        const zeroOrderTags = SocialOrderState.tags.filter((t) => !tagsWithOrders.has(t.id));
        const zeroCount = zeroOrderTags.length;
        const isZeroActive = activePanelTagId === '__zero_order__';
        html += `
            <div class="tag-panel-card ${isZeroActive ? 'active' : ''}"
                 onclick="filterByPanelTag('__zero_order__')">
                <div class="tag-panel-card-icon" style="background: #fecaca;">
                    <i class="fas fa-box-open" style="color: #ef4444;"></i>
                </div>
                <div class="tag-panel-card-info">
                    <div class="tag-panel-card-name">TAG KHÔNG CÓ ĐƠN</div>
                    <div class="tag-panel-card-count">${zeroCount} tag</div>
                </div>
            </div>
        `;

        // Show sub-list of zero-order tags when active
        if (isZeroActive && zeroOrderTags.length > 0) {
            html += `<div class="zero-order-tags-list">`;
            html += `
                <div class="zero-order-tags-header">
                    <span>${zeroCount} tag không có đơn</span>
                    <button class="zero-order-delete-all" onclick="event.stopPropagation(); deleteAllZeroOrderTags()" title="Xóa toàn bộ tag không có đơn">
                        <i class="fas fa-trash-alt"></i> Xóa toàn bộ
                    </button>
                </div>
            `;
            zeroOrderTags.forEach((tag) => {
                html += `
                    <div class="zero-order-tag-item">
                        <div class="zero-order-tag-icon" style="background: ${tag.color};">
                            ${
                                tag.image
                                    ? `<img src="${tag.image}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`
                                    : `<i class="fas fa-tag"></i>`
                            }
                        </div>
                        <span class="zero-order-tag-name">${tag.name}</span>
                        <button class="zero-order-tag-delete" onclick="event.stopPropagation(); deletePanelTag('${tag.id}')" title="Xóa tag ${tag.name}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                `;
            });
            html += `</div>`;
        } else if (isZeroActive && zeroOrderTags.length === 0) {
            html += `<div class="zero-order-tags-empty">Tất cả tag đều có đơn hàng</div>`;
        }
    }

    // Tag cards (filtered by search and day filter)
    SocialOrderState.tags.forEach((tag) => {
        if (searchTerm && !removeDiacritics(tag.name).includes(searchTerm)) return;

        // Day filter: skip tags that don't have old orders
        if (dayFilterTagIds && !dayFilterTagIds.has(tag.id)) return;

        const count = counts[tag.id] || 0;
        const oldCount = oldCounts ? oldCounts[tag.id] || 0 : 0;
        const hoverAttrs = tag.image
            ? `onmouseenter="showTagImageHover(this, '${tag.id}')" onmouseleave="hideTagImageHover()"`
            : '';

        const dayInfo =
            activeTagDayFilter > 0 && oldCount > 0
                ? `<span style="color:#ef4444; font-weight:600;"> (${oldCount} ≥${activeTagDayFilter}N)</span>`
                : '';

        html += `
            <div class="tag-panel-card ${activePanelTagId === tag.id ? 'active' : ''}"
                 onclick="filterByPanelTag('${tag.id}')" ${hoverAttrs}>
                <div class="tag-panel-card-icon" style="background: ${tag.color};">
                    ${
                        tag.image
                            ? `<img src="${tag.image}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`
                            : `<i class="fas fa-tag"></i>`
                    }
                </div>
                <div class="tag-panel-card-info">
                    <div class="tag-panel-card-name">${tag.name}</div>
                    <div class="tag-panel-card-count">${count} đơn hàng${dayInfo}</div>
                </div>
                <button class="tag-panel-card-delete" onclick="event.stopPropagation(); deletePanelTag('${tag.id}')" title="Xóa tag">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
    });

    if (!html) {
        html = '<div class="tag-panel-no-result">Không tìm thấy tag</div>';
    }

    body.innerHTML = html;
}

// ===== FILTER TAG PANEL CARDS =====
function filterTagPanelCards() {
    renderTagPanelCards();
}

function getTagOrderCounts() {
    const counts = {};
    SocialOrderState.tags.forEach((tag) => {
        counts[tag.id] = 0;
    });

    SocialOrderState.orders.forEach((order) => {
        (order.tags || []).forEach((t) => {
            if (counts[t.id] !== undefined) counts[t.id]++;
        });
    });

    return counts;
}

// ===== FILTER BY PANEL TAG =====
function filterByPanelTag(tagId) {
    activePanelTagId = tagId;

    const tagFilter = document.getElementById('tagFilter');
    if (tagFilter) {
        if (tagId === null || tagId === '__no_tag__' || tagId === '__zero_order__') {
            tagFilter.value = 'all';
        } else {
            tagFilter.value = tagId;
        }
    }

    // For "no tag" filter, we need custom logic since performTableSearch doesn't support it natively
    if (tagId === '__no_tag__') {
        performTableSearchWithNoTag();
    } else if (tagId === '__zero_order__') {
        // Show tags with zero orders - display tag list only, no table filter
        performTableSearchWithZeroOrderTags();
    } else {
        performTableSearch();
    }

    // Update active card UI
    renderTagPanelCards();
}

/**
 * Delete a tag directly from the panel sidebar (with confirmation)
 */
function deletePanelTag(tagId) {
    // Reuse the existing deleteTag function which shows confirmation modal
    deleteTag(tagId);
}

// Custom search that filters orders with no tags
function performTableSearchWithNoTag() {
    const searchInput = document.getElementById('tableSearchInput');
    const statusFilter = document.getElementById('statusFilter');
    const sourceFilter = document.getElementById('sourceFilter');

    const searchTerm = removeDiacritics((searchInput?.value || '').trim());
    const statusValue = statusFilter?.value || 'all';
    const sourceValue = sourceFilter?.value || 'all';

    const dateRange = getDateRange(currentDateFilter);

    SocialOrderState.filters = {
        search: searchTerm,
        status: statusValue,
        source: sourceValue,
        tag: 'all',
        dateFilter: currentDateFilter,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
    };

    SocialOrderState.filteredOrders = SocialOrderState.orders.filter((order) => {
        // Date filter
        if (dateRange.from || dateRange.to) {
            const orderDate = new Date(order.createdAt);
            if (dateRange.from && orderDate < dateRange.from) return false;
            if (dateRange.to && orderDate > dateRange.to) return false;
        }
        // Status filter
        if (statusValue !== 'all' && order.status !== statusValue) return false;
        // Source filter
        if (sourceValue !== 'all' && order.source !== sourceValue) return false;
        // No tag filter
        if (order.tags && order.tags.length > 0) return false;
        // Search filter (accent-insensitive)
        if (searchTerm) {
            const searchFields = removeDiacritics(
                [order.id, order.customerName, order.phone, order.address, order.note]
                    .filter(Boolean)
                    .join(' ')
            );
            if (!searchFields.includes(searchTerm)) return false;
        }
        return true;
    });

    renderTable();
    updateSearchResultCount();
    updateSearchClearButton();
}

// When "Tag không có đơn" is selected - just show all orders, the sub-list is rendered in the panel
function performTableSearchWithZeroOrderTags() {
    performTableSearch();
}

// ===== TAG MANAGEMENT MODAL =====
let tagManageModalCreated = false;
let editingTagId = null;

function openTagManageModal() {
    if (!tagManageModalCreated) {
        createTagManageModal();
        tagManageModalCreated = true;
    }

    renderTagManageList();

    const modal = document.getElementById('tagManageModal');
    if (modal) modal.classList.add('show');

    // Init paste listener (once)
    initTagImagePasteListener();
}

function closeTagManageModal() {
    const modal = document.getElementById('tagManageModal');
    if (modal) modal.classList.remove('show');
    editingTagId = null;
}

function createTagManageModal() {
    const modal = document.createElement('div');
    modal.id = 'tagManageModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i class="fas fa-cog"></i> Quản Lý Tags</h3>
                <button class="modal-close" onclick="closeTagManageModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="tag-manage-list" id="tagManageList"></div>
                <div class="tag-add-form" id="tagAddForm">
                    <input type="color" id="newTagColor" value="#8b5cf6" title="Chọn màu">
                    <input type="text" id="newTagName" placeholder="Tên tag mới..."
                           onkeydown="if(event.key==='Enter') addNewTag()">
                    <div class="tag-image-paste-area" id="newTagImagePaste"
                         onclick="triggerTagImageUpload('new')"
                         title="Dán (Ctrl+V) hoặc click để chọn ảnh">
                        <span class="tag-image-paste-placeholder" id="newTagImagePlaceholder">
                            <i class="fas fa-image"></i>
                        </span>
                    </div>
                    <input type="file" id="newTagImageFile" accept="image/*" style="display:none"
                           onchange="handleTagImageFileSelect(event, 'new')">
                    <button onclick="addNewTag()">
                        <i class="fas fa-plus"></i> Thêm
                    </button>
                </div>
                <div class="color-presets" id="colorPresets">
                    ${TAG_PRESET_COLORS.map(
                        (c) => `
                        <div class="color-preset" style="background: ${c};"
                             onclick="selectPresetColor('${c}')" title="${c}"></div>
                    `
                    ).join('')}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="closeTagManageModal()">Đóng</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function renderTagManageList() {
    const list = document.getElementById('tagManageList');
    if (!list) return;

    if (SocialOrderState.tags.length === 0) {
        list.innerHTML =
            '<div style="text-align: center; color: #9ca3af; padding: 20px;">Chưa có tag nào</div>';
        return;
    }

    list.innerHTML = SocialOrderState.tags
        .map((tag) => {
            const isEditing = editingTagId === tag.id;
            const tagImage = tag.image || null;
            const editImage =
                pendingEditTagImages[tag.id] !== undefined
                    ? pendingEditTagImages[tag.id]
                    : tagImage;
            return `
            <div class="tag-manage-item" data-tag-id="${tag.id}">
                <input type="color" class="tag-manage-color" value="${tag.color}"
                       style="width: 28px; height: 28px; border: none; border-radius: 6px; cursor: pointer;"
                       ${isEditing ? '' : 'disabled'}
                       onchange="updateTagColor('${tag.id}', this.value)">
                <div class="tag-manage-name">
                    ${
                        isEditing
                            ? `<input type="text" value="${tag.name}" id="editTagName_${tag.id}"
                                  onkeydown="if(event.key==='Enter') saveTagEdit('${tag.id}')">`
                            : tag.name
                    }
                </div>
                <div class="tag-manage-image">
                    ${
                        isEditing
                            ? `<div class="tag-image-paste-area ${editImage ? 'has-image' : ''}" id="editTagImagePaste_${tag.id}"
                                onclick="triggerTagImageUpload('${tag.id}')"
                                title="Dán (Ctrl+V) hoặc click để chọn ảnh">
                               ${
                                   editImage
                                       ? `<img src="${editImage}" class="tag-image-thumb">
                                      <button class="tag-image-remove" onclick="event.stopPropagation(); removeTagImage('${tag.id}')" title="Xóa ảnh">&times;</button>`
                                       : `<span class="tag-image-paste-placeholder"><i class="fas fa-image"></i></span>`
                               }
                           </div>
                           <input type="file" id="editTagImageFile_${tag.id}" accept="image/*" style="display:none"
                                  onchange="handleTagImageFileSelect(event, '${tag.id}')">`
                            : `<div class="tag-image-paste-area ${tagImage ? 'has-image' : ''}"
                                onmouseenter="setHoveredImageTag('${tag.id}')"
                                onmouseleave="setHoveredImageTag(null)"
                                onclick="triggerTagImageUpload('${tag.id}')"
                                title="Dán (Ctrl+V) hoặc click để chọn ảnh">
                               ${
                                   tagImage
                                       ? `<img src="${tagImage}" class="tag-image-thumb">
                                      <button class="tag-image-remove" onclick="event.stopPropagation(); directRemoveTagImage('${tag.id}')" title="Xóa ảnh">&times;</button>`
                                       : `<span class="tag-image-paste-placeholder"><i class="fas fa-image"></i></span>`
                               }
                           </div>
                           <input type="file" id="editTagImageFile_${tag.id}" accept="image/*" style="display:none"
                                  onchange="handleTagImageFileSelect(event, '${tag.id}')">`
                    }
                </div>
                <div class="tag-manage-actions">
                    ${
                        isEditing
                            ? `<button class="btn-edit-tag" onclick="saveTagEdit('${tag.id}')" title="Lưu">
                               <i class="fas fa-check"></i>
                           </button>
                           <button class="btn-delete-tag" onclick="cancelTagEdit()" title="Hủy">
                               <i class="fas fa-times"></i>
                           </button>`
                            : `<button class="btn-edit-tag" onclick="startTagEdit('${tag.id}')" title="Sửa">
                               <i class="fas fa-edit"></i>
                           </button>
                           <button class="btn-delete-tag" onclick="deleteTag('${tag.id}')" title="Xóa">
                               <i class="fas fa-trash"></i>
                           </button>`
                    }
                </div>
            </div>
        `;
        })
        .join('');
}

function selectPresetColor(color) {
    const colorInput = document.getElementById('newTagColor');
    if (colorInput) colorInput.value = color;

    // Update preset selection UI
    document.querySelectorAll('.color-preset').forEach((el) => {
        el.classList.toggle('selected', el.style.background === color);
    });
}

function addNewTag() {
    const nameInput = document.getElementById('newTagName');
    const colorInput = document.getElementById('newTagColor');

    const name = (nameInput?.value || '').trim();
    const color = colorInput?.value || '#8b5cf6';

    if (!name) {
        showNotification('Vui lòng nhập tên tag', 'warning');
        nameInput?.focus();
        return;
    }

    // Check duplicate name
    if (SocialOrderState.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
        showNotification('Tag này đã tồn tại', 'warning');
        return;
    }

    // Generate ID
    const id =
        'tag_' +
        name
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '') +
        '_' +
        Date.now();

    const newTag = { id, name, color };
    if (pendingNewTagImage) {
        newTag.image = pendingNewTagImage;
    }
    SocialOrderState.tags.push(newTag);

    // Save
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Update UI
    renderTagManageList();
    populateTagFilter();
    if (isTagPanelOpen) renderTagPanelCards();

    // Clear input
    nameInput.value = '';
    pendingNewTagImage = null;
    clearNewTagImagePreview();

    showNotification(`Đã thêm tag "${name}"`, 'success');
}

function startTagEdit(tagId) {
    editingTagId = tagId;
    renderTagManageList();

    // Focus input
    setTimeout(() => {
        const input = document.getElementById(`editTagName_${tagId}`);
        if (input) {
            input.focus();
            input.select();
        }
    }, 50);
}

function cancelTagEdit() {
    if (editingTagId) delete pendingEditTagImages[editingTagId];
    editingTagId = null;
    renderTagManageList();
}

function saveTagEdit(tagId) {
    const input = document.getElementById(`editTagName_${tagId}`);
    const newName = (input?.value || '').trim();

    if (!newName) {
        showNotification('Tên tag không được để trống', 'warning');
        return;
    }

    const tag = SocialOrderState.tags.find((t) => t.id === tagId);
    if (!tag) return;

    // Get color from the color input
    const colorInput = document.querySelector(
        `.tag-manage-item[data-tag-id="${tagId}"] input[type="color"]`
    );
    if (colorInput) tag.color = colorInput.value;

    tag.name = newName;

    // Update image if changed during edit
    if (pendingEditTagImages[tagId] !== undefined) {
        if (pendingEditTagImages[tagId]) {
            tag.image = pendingEditTagImages[tagId];
        } else {
            delete tag.image;
        }
        delete pendingEditTagImages[tagId];
    }

    editingTagId = null;

    // Save
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Also update tags embedded in orders
    updateTagInOrders(tagId, newName, tag.color, tag.image);

    // Update UI
    renderTagManageList();
    populateTagFilter();
    if (isTagPanelOpen) renderTagPanelCards();

    showNotification('Đã cập nhật tag', 'success');
}

function updateTagColor(tagId, newColor) {
    const tag = SocialOrderState.tags.find((t) => t.id === tagId);
    if (tag) tag.color = newColor;
}

// ===== DELETE TAG WITH CONFIRMATION MODAL =====
let _pendingDeleteTagId = null;

function deleteTag(tagId) {
    const tag = SocialOrderState.tags.find((t) => t.id === tagId);
    if (!tag) return;

    _pendingDeleteTagId = tagId;

    // Count affected orders
    const affectedCount = SocialOrderState.orders.filter(
        (o) => o.tags && o.tags.some((t) => t.id === tagId)
    ).length;

    // Build tag preview HTML
    const tagImage = tag.image
        ? `<img src="${tag.image}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover; margin-bottom: 8px;">`
        : '';
    const tagInfoHtml = `
        ${tagImage}
        <div style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px; background: ${tag.color}; color: #fff; font-weight: 600; font-size: 16px;">
            ${tag.name}
        </div>
    `;

    const messageHtml =
        affectedCount > 0
            ? `Tag này đang được gán cho <strong>${affectedCount} đơn hàng</strong>. Tag sẽ bị gỡ khỏi tất cả đơn hàng.`
            : `Tag này chưa được gán cho đơn hàng nào.`;

    // Populate modal
    document.getElementById('confirmDeleteTagInfo').innerHTML = tagInfoHtml;
    document.getElementById('confirmDeleteTagMessage').innerHTML = messageHtml;

    // Show modal
    document.getElementById('confirmDeleteTagModal').classList.add('show');
}

function closeConfirmDeleteTagModal() {
    document.getElementById('confirmDeleteTagModal').classList.remove('show');
    _pendingDeleteTagId = null;
}

function confirmDeleteTag() {
    const tagId = _pendingDeleteTagId;
    if (!tagId) return;

    const tag = SocialOrderState.tags.find((t) => t.id === tagId);
    const tagName = tag ? tag.name : 'Unknown';

    // Close modal immediately
    closeConfirmDeleteTagModal();

    // Remove from tag list
    SocialOrderState.tags = SocialOrderState.tags.filter((t) => t.id !== tagId);

    // Remove from all orders (local state only, batch Firestore update below)
    const affectedOrderIds = [];
    SocialOrderState.orders.forEach((order) => {
        if (order.tags && order.tags.some((t) => t.id === tagId)) {
            order.tags = order.tags.filter((t) => t.id !== tagId);
            order.updatedAt = Date.now();
            affectedOrderIds.push(order.id);
        }
    });

    // Save local storage + show notification IMMEDIATELY (optimistic UI)
    saveSocialOrdersToStorage();
    saveSocialTagsToStorage();
    showNotification(`Đã xóa tag "${tagName}"`, 'success');

    // Update UI immediately
    renderTagManageList();
    populateTagFilter();
    performTableSearch();
    if (isTagPanelOpen) renderTagPanelCards();

    // Reset filter if deleted tag was active
    if (activePanelTagId === tagId) {
        activePanelTagId = null;
    }

    // Fire-and-forget: sync to Firestore in background
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }
    if (affectedOrderIds.length > 0 && typeof bulkUpdateSocialOrderTags === 'function') {
        bulkUpdateSocialOrderTags(affectedOrderIds, tagId);
    }
}

function updateTagInOrders(tagId, newName, newColor, newImage) {
    const affectedOrders = [];
    SocialOrderState.orders.forEach((order) => {
        if (order.tags) {
            const tag = order.tags.find((t) => t.id === tagId);
            if (tag) {
                tag.name = newName;
                tag.color = newColor;
                if (newImage) {
                    tag.image = newImage;
                } else {
                    delete tag.image;
                }
                order.updatedAt = Date.now();
                affectedOrders.push(order);
            }
        }
    });

    if (affectedOrders.length > 0) {
        saveSocialOrdersToStorage();
        performTableSearch();
        // Batch sync affected orders to Firestore
        if (typeof bulkUpdateSocialOrderTagsData === 'function') {
            bulkUpdateSocialOrderTagsData(affectedOrders.map((o) => ({ id: o.id, tags: o.tags })));
        }
    }
}

// ===== TAG IMAGE FUNCTIONS =====

/**
 * Handle paste event on the tag manage modal for image paste
 */
let _tagImagePasteListenerInit = false;
function initTagImagePasteListener() {
    if (_tagImagePasteListenerInit) return;
    const modal = document.getElementById('tagManageModal');
    if (!modal) return;
    _tagImagePasteListenerInit = true;

    modal.addEventListener('paste', function (e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                e.preventDefault();
                const file = items[i].getAsFile();
                processTagImageFile(file);
                break;
            }
        }
    });
}

/**
 * Determine which tag is being targeted for image paste.
 * Priority: hoveredImageTagId > editingTagId > new tag form
 */
function processTagImageFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const base64 = e.target.result;

        compressTagImage(base64, (compressed) => {
            if (hoveredImageTagId) {
                // Mouse is hovering over a tag's image area - directly save
                directSaveTagImage(hoveredImageTagId, compressed);
            } else if (editingTagId) {
                // Tag is in edit mode
                pendingEditTagImages[editingTagId] = compressed;
                renderTagManageList();
                setTimeout(() => {
                    const input = document.getElementById(`editTagName_${editingTagId}`);
                    if (input) input.focus();
                }, 50);
            } else {
                // Adding new tag
                pendingNewTagImage = compressed;
                updateNewTagImagePreview();
            }
        });
    };
    reader.readAsDataURL(file);
}

/**
 * Compress image to reduce storage size
 */
function compressTagImage(base64, callback) {
    const img = new Image();
    img.onload = function () {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 200;
        let w = img.width;
        let h = img.height;

        if (w > MAX_SIZE || h > MAX_SIZE) {
            if (w > h) {
                h = Math.round((h * MAX_SIZE) / w);
                w = MAX_SIZE;
            } else {
                w = Math.round((w * MAX_SIZE) / h);
                h = MAX_SIZE;
            }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = function () {
        callback(base64); // fallback to original
    };
    img.src = base64;
}

/**
 * Update the new tag image preview in the add form
 */
function updateNewTagImagePreview() {
    const pasteArea = document.getElementById('newTagImagePaste');
    if (!pasteArea) return;

    if (pendingNewTagImage) {
        pasteArea.classList.add('has-image');
        pasteArea.innerHTML = `
            <img src="${pendingNewTagImage}" class="tag-image-thumb">
            <button class="tag-image-remove" onclick="event.stopPropagation(); clearNewTagImage()" title="Xóa ảnh">&times;</button>
        `;
    } else {
        pasteArea.classList.remove('has-image');
        pasteArea.innerHTML = `<span class="tag-image-paste-placeholder" id="newTagImagePlaceholder"><i class="fas fa-image"></i></span>`;
    }
}

function clearNewTagImage() {
    pendingNewTagImage = null;
    updateNewTagImagePreview();
}

function clearNewTagImagePreview() {
    updateNewTagImagePreview();
}

/**
 * Trigger file input for image upload
 */
function triggerTagImageUpload(tagId) {
    const fileInput =
        tagId === 'new'
            ? document.getElementById('newTagImageFile')
            : document.getElementById(`editTagImageFile_${tagId}`);
    if (fileInput) fileInput.click();
}

/**
 * Handle file selection from input
 */
function handleTagImageFileSelect(event, tagId) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        compressTagImage(e.target.result, (compressed) => {
            if (tagId === 'new') {
                pendingNewTagImage = compressed;
                updateNewTagImagePreview();
            } else if (editingTagId === tagId) {
                // Tag is in edit mode - store as pending
                pendingEditTagImages[tagId] = compressed;
                renderTagManageList();
            } else {
                // Tag is NOT in edit mode - save directly
                directSaveTagImage(tagId, compressed);
            }
        });
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    event.target.value = '';
}

/**
 * Remove image from a tag being edited
 */
function removeTagImage(tagId) {
    pendingEditTagImages[tagId] = null; // null means explicitly removed
    renderTagManageList();
}

/**
 * Show tag image hover preview (used in manage list and table)
 */
let _tagImageHoverEl = null;

function showTagImageHover(el, tagId) {
    const tag = SocialOrderState.tags.find((t) => t.id === tagId);
    if (!tag || !tag.image) return;

    hideTagImageHover();

    const rect = el.getBoundingClientRect();
    _tagImageHoverEl = document.createElement('div');
    _tagImageHoverEl.className = 'tag-image-hover-popup';

    const img = document.createElement('img');
    img.src = tag.image;
    _tagImageHoverEl.appendChild(img);

    // Add tag name label
    const label = document.createElement('div');
    label.className = 'tag-image-hover-label';
    label.style.cssText = 'background:' + tag.color;
    label.textContent = tag.name;
    _tagImageHoverEl.appendChild(label);

    document.body.appendChild(_tagImageHoverEl);

    // Position above element
    img.onload = () => {
        if (!_tagImageHoverEl) return;
        const hoverRect = _tagImageHoverEl.getBoundingClientRect();
        let top = rect.top - hoverRect.height - 8;
        if (top < 8) top = rect.bottom + 8;
        let left = rect.left + rect.width / 2 - hoverRect.width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - hoverRect.width - 8));
        _tagImageHoverEl.style.top = top + 'px';
        _tagImageHoverEl.style.left = left + 'px';
    };

    // Initial position
    _tagImageHoverEl.style.top = rect.top - 220 + 'px';
    _tagImageHoverEl.style.left = rect.left + 'px';
}

function hideTagImageHover() {
    if (_tagImageHoverEl) {
        _tagImageHoverEl.remove();
        _tagImageHoverEl = null;
    }
}

/**
 * Track which tag's image area the mouse is hovering over.
 * Used by paste handler to know which tag to assign the image to.
 */
function setHoveredImageTag(tagId) {
    hoveredImageTagId = tagId;
}

/**
 * Directly save an image to a tag without entering edit mode.
 * Used when pasting/uploading while hovering over a tag's image area.
 */
function directSaveTagImage(tagId, imageBase64) {
    const tag = SocialOrderState.tags.find((t) => t.id === tagId);
    if (!tag) return;

    tag.image = imageBase64;

    // Save to storage + Firebase
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Update tags embedded in orders
    updateTagInOrders(tagId, tag.name, tag.color, tag.image);

    // Update UI
    renderTagManageList();
    if (isTagPanelOpen) renderTagPanelCards();

    showNotification(`Đã cập nhật ảnh cho tag "${tag.name}"`, 'success');
}

/**
 * Directly remove an image from a tag without entering edit mode.
 */
function directRemoveTagImage(tagId) {
    const tag = SocialOrderState.tags.find((t) => t.id === tagId);
    if (!tag) return;

    delete tag.image;

    // Save to storage + Firebase
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Update tags embedded in orders
    updateTagInOrders(tagId, tag.name, tag.color, undefined);

    // Update UI
    renderTagManageList();
    if (isTagPanelOpen) renderTagPanelCards();

    showNotification(`Đã xóa ảnh tag "${tag.name}"`, 'success');
}

// ===== DELETE ALL ZERO-ORDER TAGS =====
function deleteAllZeroOrderTags() {
    const tagsWithOrders = new Set();
    SocialOrderState.orders.forEach((order) => {
        (order.tags || []).forEach((t) => tagsWithOrders.add(t.id));
    });
    const zeroOrderTags = SocialOrderState.tags.filter((t) => !tagsWithOrders.has(t.id));

    if (zeroOrderTags.length === 0) {
        showNotification('Không có tag nào cần xóa', 'info');
        return;
    }

    const names = zeroOrderTags.map((t) => t.name).join(', ');
    if (!confirm(`Xóa toàn bộ ${zeroOrderTags.length} tag không có đơn?\n\n${names}`)) return;

    const idsToRemove = new Set(zeroOrderTags.map((t) => t.id));
    SocialOrderState.tags = SocialOrderState.tags.filter((t) => !idsToRemove.has(t.id));

    // Save
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Update UI
    populateTagFilter();
    performTableSearch();
    if (isTagPanelOpen) renderTagPanelCards();

    showNotification(`Đã xóa ${zeroOrderTags.length} tag không có đơn`, 'success');
}

// ===== EXPORTS =====
window.initTagPanel = initTagPanel;
window.toggleTagPanel = toggleTagPanel;
window.forceCloseTagPanel = forceCloseTagPanel;
window.togglePinTagPanel = togglePinTagPanel;
window.renderTagPanelCards = renderTagPanelCards;
window.filterByPanelTag = filterByPanelTag;
window.openTagManageModal = openTagManageModal;
window.closeTagManageModal = closeTagManageModal;
window.addNewTag = addNewTag;
window.startTagEdit = startTagEdit;
window.cancelTagEdit = cancelTagEdit;
window.saveTagEdit = saveTagEdit;
window.updateTagColor = updateTagColor;
window.deleteTag = deleteTag;
window.closeConfirmDeleteTagModal = closeConfirmDeleteTagModal;
window.confirmDeleteTag = confirmDeleteTag;
window.selectPresetColor = selectPresetColor;
window.triggerTagImageUpload = triggerTagImageUpload;
window.handleTagImageFileSelect = handleTagImageFileSelect;
window.removeTagImage = removeTagImage;
window.clearNewTagImage = clearNewTagImage;
window.showTagImageHover = showTagImageHover;
window.hideTagImageHover = hideTagImageHover;
window.initTagImagePasteListener = initTagImagePasteListener;
window.setHoveredImageTag = setHoveredImageTag;
window.directSaveTagImage = directSaveTagImage;
window.directRemoveTagImage = directRemoveTagImage;
window.filterTagPanelCards = filterTagPanelCards;
window.onTagDayFilterChange = onTagDayFilterChange;
window.deletePanelTag = deletePanelTag;
window.performTableSearchWithZeroOrderTags = performTableSearchWithZeroOrderTags;
window.deleteAllZeroOrderTags = deleteAllZeroOrderTags;
