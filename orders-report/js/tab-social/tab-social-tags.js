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
function filterTags() {
    const input = document.getElementById('tagSearchInput');
    const term = input?.value || '';
    highlightedTagIndex = -1;
    renderTagList(term);
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

    const orderIndex = SocialOrderState.orders.findIndex((o) => o.id === currentTagOrderId);
    if (orderIndex > -1) {
        SocialOrderState.orders[orderIndex].tags = [...selectedTags];
        SocialOrderState.orders[orderIndex].updatedAt = Date.now();

        showNotification('Đã cập nhật tags', 'success');
        performTableSearch(); // Re-render table
    }

    closeTagModal();
}

// ===== BULK TAG MODAL =====
function showBulkTagModal() {
    const count = SocialOrderState.selectedOrders.size;

    if (count === 0) {
        showNotification('Vui lòng chọn ít nhất 1 đơn hàng', 'warning');
        return;
    }

    // For now, just show a simple alert
    // TODO: Implement proper bulk tag modal
    alert(`Gán tag cho ${count} đơn đã chọn\n\n(Tính năng đang phát triển)`);
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

// ===== EXPORTS =====
window.openTagModal = openTagModal;
window.closeTagModal = closeTagModal;
window.toggleTagSelection = toggleTagSelection;
window.removeSelectedTag = removeSelectedTag;
window.filterTags = filterTags;
window.handleTagInputKeydown = handleTagInputKeydown;
window.saveOrderTags = saveOrderTags;
window.showBulkTagModal = showBulkTagModal;
