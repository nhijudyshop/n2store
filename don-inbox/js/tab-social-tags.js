// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Tab Social Orders - Tags Module
 * Tag management functionality
 */

// ===== TAG MODAL STATE =====
let currentTagOrderId = null;
let selectedTags = [];
let highlightedTagIndex = -1;

// ===== OPEN TAG MODAL =====
function openTagModal(orderId) {
    currentTagOrderId = orderId;

    const order = SocialOrderState.orders.find((o) => o.id === orderId);
    if (!order) {
        showNotification('Không tìm thấy đơn hàng', 'error');
        return;
    }

    // Copy current tags
    selectedTags = [...(order.tags || [])];

    // Render
    renderSelectedTagsPills();
    renderTagList();

    // Show modal
    const modal = document.getElementById('tagModal');
    if (modal) {
        modal.classList.add('show');
        // Focus search input
        setTimeout(() => {
            document.getElementById('tagSearchInput')?.focus();
        }, 100);
    }
}

function closeTagModal() {
    const modal = document.getElementById('tagModal');
    if (modal) {
        modal.classList.remove('show');
    }

    currentTagOrderId = null;
    selectedTags = [];
    highlightedTagIndex = -1;
    isBulkTagMode = false;

    // Clear search
    const searchInput = document.getElementById('tagSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
}

// ===== RENDER SELECTED TAGS PILLS =====
function renderSelectedTagsPills() {
    const container = document.getElementById('selectedTagsPills');
    if (!container) return;

    if (selectedTags.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = selectedTags
        .map(
            (tag) => `
        <span class="selected-tag-pill" style="background: ${tag.color};">
            ${tag.name}
            <button class="selected-tag-remove" onclick="removeSelectedTag('${tag.id}')">&times;</button>
        </span>
    `
        )
        .join('');
}

// ===== RENDER TAG LIST =====
function renderTagList(filterTerm = '') {
    const container = document.getElementById('tagList');
    if (!container) return;

    const term = filterTerm.toLowerCase().trim();

    // Filter tags
    let filteredTags = SocialOrderState.tags;
    if (term) {
        filteredTags = SocialOrderState.tags.filter((t) => t.name.toLowerCase().includes(term));
    }

    if (filteredTags.length === 0) {
        container.innerHTML = `
            <div class="no-tags-message">
                <i class="fas fa-tags"></i>
                <p>Không tìm thấy tag nào</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredTags
        .map((tag, index) => {
            const isSelected = selectedTags.some((t) => t.id === tag.id);
            const isHighlighted = index === highlightedTagIndex;

            return `
            <div class="tag-dropdown-item ${isHighlighted ? 'highlighted' : ''}" 
                 onclick="toggleTagSelection('${tag.id}')"
                 data-tag-id="${tag.id}">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                           style="width: 16px; height: 16px; cursor: pointer;"
                           onclick="event.stopPropagation(); toggleTagSelection('${tag.id}')">
                    <div class="tag-item-color" style="background: ${tag.color};"></div>
                    <span class="tag-item-name">${tag.name}</span>
                </div>
            </div>
        `;
        })
        .join('');
}

// ===== TOGGLE TAG SELECTION =====
function toggleTagSelection(tagId) {
    const tag = SocialOrderState.tags.find((t) => t.id === tagId);
    if (!tag) return;

    const index = selectedTags.findIndex((t) => t.id === tagId);
    if (index > -1) {
        // Remove
        selectedTags.splice(index, 1);
    } else {
        // Add
        selectedTags.push({ ...tag });
    }

    renderSelectedTagsPills();
    renderTagList(document.getElementById('tagSearchInput')?.value || '');
}

function removeSelectedTag(tagId) {
    selectedTags = selectedTags.filter((t) => t.id !== tagId);
    renderSelectedTagsPills();
    renderTagList(document.getElementById('tagSearchInput')?.value || '');
}

// ===== FILTER TAGS =====
let _tagFilterTimer = null;
function filterTags() {
    if (_tagFilterTimer) clearTimeout(_tagFilterTimer);
    _tagFilterTimer = setTimeout(() => {
        const input = document.getElementById('tagSearchInput');
        const term = input?.value || '';
        highlightedTagIndex = -1;
        renderTagList(term);
    }, 150);
}

// ===== KEYBOARD NAVIGATION =====
function handleTagInputKeydown(event) {
    const tagItems = document.querySelectorAll('.tag-dropdown-item');
    const maxIndex = tagItems.length - 1;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            highlightedTagIndex = Math.min(highlightedTagIndex + 1, maxIndex);
            renderTagList(document.getElementById('tagSearchInput')?.value || '');
            break;

        case 'ArrowUp':
            event.preventDefault();
            highlightedTagIndex = Math.max(highlightedTagIndex - 1, 0);
            renderTagList(document.getElementById('tagSearchInput')?.value || '');
            break;

        case 'Enter':
            event.preventDefault();
            if (highlightedTagIndex >= 0 && tagItems[highlightedTagIndex]) {
                const tagId = tagItems[highlightedTagIndex].dataset.tagId;
                toggleTagSelection(tagId);
            }
            break;

        case 'Backspace':
            if (event.target.value === '' && selectedTags.length > 0) {
                // Remove last tag
                selectedTags.pop();
                renderSelectedTagsPills();
                renderTagList();
            }
            break;
    }
}

// ===== SAVE TAGS =====
function saveOrderTags() {
    if (!currentTagOrderId) return;

    // Handle bulk mode
    if (isBulkTagMode) {
        saveBulkTags();
        return;
    }

    const orderIndex = SocialOrderState.orders.findIndex((o) => o.id === currentTagOrderId);
    if (orderIndex > -1) {
        const oldTags = [...(SocialOrderState.orders[orderIndex].tags || [])];
        SocialOrderState.orders[orderIndex].tags = [...selectedTags];
        SocialOrderState.orders[orderIndex].updatedAt = Date.now();
        saveSocialOrdersToStorage();
        // Fire-and-forget: sync to Firestore
        updateSocialOrderTags(currentTagOrderId, [...selectedTags]);
        if (window.InboxHistory) InboxHistory.logTagChange(SocialOrderState.orders[orderIndex], oldTags, selectedTags);

        showNotification('Đã cập nhật tags', 'success');
        performTableSearch(); // Re-render table
    }

    closeTagModal();
}

// ===== BULK TAG MODAL =====
let isBulkTagMode = false;

function showBulkTagModal() {
    const count = SocialOrderState.selectedOrders.size;

    if (count === 0) {
        showNotification('Vui lòng chọn ít nhất 1 đơn hàng', 'warning');
        return;
    }

    isBulkTagMode = true;
    currentTagOrderId = '__bulk__';

    // Start with empty tags for bulk mode
    selectedTags = [];

    // Render
    renderSelectedTagsPills();
    renderTagList();

    // Update modal title hint
    const modal = document.getElementById('tagModal');
    if (modal) {
        modal.classList.add('show');
        // Focus search input
        setTimeout(() => {
            document.getElementById('tagSearchInput')?.focus();
        }, 100);
    }
}

function saveBulkTags() {
    if (!isBulkTagMode || selectedTags.length === 0) {
        closeTagModal();
        return;
    }

    let updatedCount = 0;
    SocialOrderState.selectedOrders.forEach(orderId => {
        const orderIndex = SocialOrderState.orders.findIndex(o => o.id === orderId);
        if (orderIndex > -1) {
            // Merge tags (add new, keep existing)
            const existingTags = SocialOrderState.orders[orderIndex].tags || [];
            const existingIds = new Set(existingTags.map(t => t.id));
            const newTags = [...existingTags];
            selectedTags.forEach(tag => {
                if (!existingIds.has(tag.id)) {
                    newTags.push({ ...tag });
                }
            });
            SocialOrderState.orders[orderIndex].tags = newTags;
            SocialOrderState.orders[orderIndex].updatedAt = Date.now();
            // Fire-and-forget: sync to Firestore
            updateSocialOrderTags(orderId, newTags);
            updatedCount++;
        }
    });

    saveSocialOrdersToStorage();
    if (window.InboxHistory) InboxHistory.logBulkTagChange([...SocialOrderState.selectedOrders], selectedTags);
    showNotification(`Đã gán tags cho ${updatedCount} đơn hàng`, 'success');
    performTableSearch();

    isBulkTagMode = false;
    closeTagModal();
}

// ===== KEYBOARD SHORTCUT FOR SAVE =====
document.addEventListener('keydown', function (e) {
    // Ctrl + Enter to save tags
    if (e.ctrlKey && e.key === 'Enter') {
        const tagModal = document.getElementById('tagModal');
        if (tagModal && tagModal.classList.contains('show')) {
            saveOrderTags();
        }
    }
});

// ===== BULK REMOVE TAG MODAL =====
let bulkRemoveTagsToDelete = new Set(); // tag IDs user ticked

function showBulkRemoveTagModal() {
    const selectedOrderIds = [...SocialOrderState.selectedOrders];
    if (selectedOrderIds.length === 0) {
        showNotification('Vui lòng chọn ít nhất 1 đơn hàng', 'warning');
        return;
    }

    bulkRemoveTagsToDelete.clear();

    const countEl = document.getElementById('bulkRemoveTagCount');
    if (countEl) countEl.textContent = selectedOrderIds.length;

    renderBulkRemoveTagList(selectedOrderIds);
    updateBulkRemoveConfirmBtn();

    const modal = document.getElementById('bulkRemoveTagModal');
    if (modal) modal.classList.add('show');
}

function renderBulkRemoveTagList(selectedOrderIds) {
    const container = document.getElementById('bulkRemoveTagList');
    if (!container) return;

    // Build map: tagId -> { tag, count }
    const tagMap = new Map();
    selectedOrderIds.forEach((id) => {
        const order = SocialOrderState.orders.find((o) => o.id === id);
        (order?.tags || []).forEach((t) => {
            if (!t || !t.id) return;
            if (!tagMap.has(t.id)) tagMap.set(t.id, { tag: t, count: 0 });
            tagMap.get(t.id).count++;
        });
    });

    if (tagMap.size === 0) {
        container.innerHTML = `
            <div class="no-tags-message">
                <i class="fas fa-tags"></i>
                <p>Các đơn đã chọn không có tag nào</p>
            </div>
        `;
        return;
    }

    container.innerHTML = [...tagMap.values()]
        .map(({ tag, count }) => {
            const isChecked = bulkRemoveTagsToDelete.has(tag.id);
            return `
                <div class="tag-dropdown-item"
                     onclick="toggleRemoveTagSelection('${tag.id}')"
                     data-tag-id="${tag.id}">
                    <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                        <input type="checkbox" ${isChecked ? 'checked' : ''}
                               style="width: 16px; height: 16px; cursor: pointer;"
                               onclick="event.stopPropagation(); toggleRemoveTagSelection('${tag.id}')">
                        <div class="tag-item-color" style="background: ${tag.color};"></div>
                        <span class="tag-item-name">${tag.name}</span>
                        <span style="margin-left: auto; color: #6b7280; font-size: 12px;">${count} đơn</span>
                    </div>
                </div>
            `;
        })
        .join('');
}

function toggleRemoveTagSelection(tagId) {
    if (bulkRemoveTagsToDelete.has(tagId)) {
        bulkRemoveTagsToDelete.delete(tagId);
    } else {
        bulkRemoveTagsToDelete.add(tagId);
    }
    renderBulkRemoveTagList([...SocialOrderState.selectedOrders]);
    updateBulkRemoveConfirmBtn();
}

function updateBulkRemoveConfirmBtn() {
    const btn = document.getElementById('bulkRemoveTagConfirmBtn');
    const cnt = document.getElementById('bulkRemoveTagSelectedCount');
    if (cnt) cnt.textContent = bulkRemoveTagsToDelete.size;
    if (btn) {
        const enabled = bulkRemoveTagsToDelete.size > 0;
        btn.disabled = !enabled;
        btn.style.opacity = enabled ? '1' : '0.5';
        btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }
}

function confirmBulkRemoveTags() {
    if (bulkRemoveTagsToDelete.size === 0) return;

    const orderIds = [...SocialOrderState.selectedOrders];
    const removedIds = new Set(bulkRemoveTagsToDelete);
    let updatedOrderCount = 0;
    let totalRemoved = 0;

    orderIds.forEach((id) => {
        const idx = SocialOrderState.orders.findIndex((o) => o.id === id);
        if (idx < 0) return;
        const oldTags = SocialOrderState.orders[idx].tags || [];
        const newTags = oldTags.filter((t) => !removedIds.has(t.id));
        if (newTags.length === oldTags.length) return; // không có tag nào bị xóa ở đơn này
        SocialOrderState.orders[idx].tags = newTags;
        SocialOrderState.orders[idx].updatedAt = Date.now();
        // Fire-and-forget: sync to Firestore
        if (typeof updateSocialOrderTags === 'function') {
            updateSocialOrderTags(id, newTags);
        }
        updatedOrderCount++;
        totalRemoved += oldTags.length - newTags.length;
    });

    if (typeof saveSocialOrdersToStorage === 'function') saveSocialOrdersToStorage();

    if (window.InboxHistory?.logBulkTagRemove) {
        window.InboxHistory.logBulkTagRemove(orderIds, [...removedIds]);
    }

    if (updatedOrderCount > 0) {
        showNotification(`Đã gỡ ${totalRemoved} tag khỏi ${updatedOrderCount} đơn`, 'success');
    } else {
        showNotification('Không có tag nào bị gỡ', 'info');
    }

    if (typeof performTableSearch === 'function') performTableSearch();
    closeBulkRemoveTagModal();
}

function closeBulkRemoveTagModal() {
    bulkRemoveTagsToDelete.clear();
    const modal = document.getElementById('bulkRemoveTagModal');
    if (modal) modal.classList.remove('show');
}

// ===== EXPORTS =====
window.openTagModal = openTagModal;
window.closeTagModal = closeTagModal;
window.toggleTagSelection = toggleTagSelection;
window.removeSelectedTag = removeSelectedTag;
window.filterTags = filterTags;
window.handleTagInputKeydown = handleTagInputKeydown;
window.saveOrderTags = saveOrderTags;
window.showBulkTagModal = showBulkTagModal;
window.saveBulkTags = saveBulkTags;
window.showBulkRemoveTagModal = showBulkRemoveTagModal;
window.toggleRemoveTagSelection = toggleRemoveTagSelection;
window.confirmBulkRemoveTags = confirmBulkRemoveTags;
window.closeBulkRemoveTagModal = closeBulkRemoveTagModal;
