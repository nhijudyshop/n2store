/**
 * Tab1 Orders - Bulk Tag Management Module
 * Bulk tag assignment and deletion operations
 *
 * Dependencies: tab1-core.js, tab1-firebase.js, tab1-tags.js
 * Exports: Bulk tag functions via window object
 */

// =====================================================
// BULK TAG STATE VARIABLES
// =====================================================

// Bulk Tag Assign Modal State
let bulkTagModalData = [];
let selectedBulkTagModalRows = new Set();
const BULK_TAG_DRAFT_KEY = 'bulkTagModalDraft';

// Bulk Tag Delete Modal State
let bulkTagDeleteModalData = [];
let selectedBulkTagDeleteModalRows = new Set();
const BULK_TAG_DELETE_DRAFT_KEY = 'bulkTagDeleteModalDraft';

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Parse STT input string into array of numbers
 * Supports formats: "1, 2, 3", "1-5", "1, 5-10, 15"
 */
function parseBulkSTTInput(input) {
    const sttNumbers = new Set();

    if (!input || !input.trim()) {
        return sttNumbers;
    }

    const parts = input.split(/[,\s]+/).filter(p => p.trim());

    parts.forEach(part => {
        part = part.trim();

        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    sttNumbers.add(i);
                }
            }
        } else {
            const num = parseInt(part);
            if (!isNaN(num)) {
                sttNumbers.add(num);
            }
        }
    });

    return sttNumbers;
}

/**
 * Normalize phone numbers for comparison
 */
function normalizePhoneForBulkTag(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('84')) {
        cleaned = '0' + cleaned.substring(2);
    }
    return cleaned;
}

// =====================================================
// BULK TAG ASSIGN - LOCALSTORAGE
// =====================================================

function saveBulkTagToLocalStorage() {
    try {
        const dataToSave = bulkTagModalData.map(tag => ({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor,
            sttList: tag.sttList || [],
            errorMessage: tag.errorMessage || null
        }));
        localStorage.setItem(BULK_TAG_DRAFT_KEY, JSON.stringify(dataToSave));
        console.log("[BULK-TAG-MODAL] Saved draft to localStorage:", dataToSave);
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error saving to localStorage:", error);
    }
}

function loadBulkTagFromLocalStorage() {
    try {
        const savedData = localStorage.getItem(BULK_TAG_DRAFT_KEY);
        if (!savedData) return false;

        const parsedData = JSON.parse(savedData);
        if (!Array.isArray(parsedData) || parsedData.length === 0) return false;

        bulkTagModalData = parsedData.map(tag => ({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor,
            sttList: tag.sttList || [],
            errorMessage: tag.errorMessage || null
        }));

        selectedBulkTagModalRows.clear();
        bulkTagModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagModalRows.add(tag.tagId);
            }
        });

        console.log("[BULK-TAG-MODAL] Loaded draft from localStorage:", bulkTagModalData);
        return true;
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error loading from localStorage:", error);
        return false;
    }
}

function clearBulkTagLocalStorage() {
    try {
        localStorage.removeItem(BULK_TAG_DRAFT_KEY);
        console.log("[BULK-TAG-MODAL] Cleared localStorage draft");
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error clearing localStorage:", error);
    }
}

// =====================================================
// BULK TAG ASSIGN - MODAL FUNCTIONS
// =====================================================

async function showBulkTagModal() {
    console.log("[BULK-TAG-MODAL] Opening bulk tag modal");

    const hasStoredData = loadBulkTagFromLocalStorage();

    if (!hasStoredData) {
        bulkTagModalData = [];
        selectedBulkTagModalRows.clear();
    }

    updateBulkTagModalTable();
    updateBulkTagModalRowCount();
    updateSelectAllCheckbox();
    document.getElementById('bulkTagModalSearchInput').value = '';

    await loadBulkTagModalOptions();

    document.getElementById('bulkTagModal').classList.add('show');
}

function closeBulkTagModal() {
    if (bulkTagModalData.length > 0) {
        saveBulkTagToLocalStorage();
    }

    document.getElementById('bulkTagModal').classList.remove('show');
    document.getElementById('bulkTagModalSearchDropdown').classList.remove('show');
}

async function loadBulkTagModalOptions() {
    try {
        if (!availableTags || availableTags.length === 0) {
            await loadAvailableTags();
        }
        populateBulkTagModalDropdown();
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error loading tags:", error);
    }
}

function populateBulkTagModalDropdown() {
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');
    const searchValue = document.getElementById('bulkTagModalSearchInput').value.toLowerCase().trim();

    const tags = window.availableTags || availableTags || [];

    console.log("[BULK-TAG-MODAL] Populating dropdown, tags count:", tags.length);

    if (!tags || tags.length === 0) {
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
                Đang tải danh sách tag...
                <br><br>
                <button onclick="refreshBulkTagModalDropdown()" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i> Tải lại
                </button>
            </div>
        `;
        return;
    }

    const filteredTags = tags.filter(tag =>
        tag.Name && tag.Name.toLowerCase().includes(searchValue)
    );

    if (filteredTags.length === 0) {
        const escapedSearch = searchValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                Không tìm thấy tag "${escapedSearch}" - <b style="color: #10b981;">Nhấn Enter để tạo</b>
            </div>
        `;
        return;
    }

    const addedTagIds = new Set(bulkTagModalData.map(t => t.tagId));
    const displayTags = filteredTags.slice(0, 100);

    let firstAvailableFound = false;

    dropdown.innerHTML = displayTags.map(tag => {
        const isAdded = addedTagIds.has(tag.Id);
        const tagName = tag.Name.replace(/'/g, "\\'").replace(/"/g, "&quot;");

        let isHighlighted = false;
        if (!isAdded && !firstAvailableFound) {
            isHighlighted = true;
            firstAvailableFound = true;
        }

        return `
            <div class="bulk-tag-search-option ${isAdded ? 'disabled' : ''} ${isHighlighted ? 'highlighted' : ''}"
                 data-tag-id="${tag.Id}"
                 data-tag-name="${tagName}"
                 data-tag-color="${tag.Color || '#6b7280'}"
                 onclick="${isAdded ? '' : `addTagToBulkTagModal('${tag.Id}', '${tagName}', '${tag.Color || '#6b7280'}')`}">
                <span class="tag-color-dot" style="background-color: ${tag.Color || '#6b7280'}"></span>
                <span class="tag-name">${tag.Name}</span>
                ${isAdded ? '<span class="tag-added">Đã thêm</span>' : ''}
            </div>
        `;
    }).join('');

    if (filteredTags.length > 100) {
        dropdown.innerHTML += `
            <div style="padding: 10px 14px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb;">
                Hiển thị 100/${filteredTags.length} tag. Nhập từ khóa để lọc.
            </div>
        `;
    }
}

function showBulkTagModalDropdown() {
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');
    populateBulkTagModalDropdown();
    dropdown.classList.add('show');
}

async function refreshBulkTagModalDropdown() {
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');

    dropdown.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #9ca3af;">
            <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
            Đang tải danh sách tag...
        </div>
    `;

    try {
        await loadAvailableTags();
        populateBulkTagModalDropdown();
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error refreshing tags:", error);
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
                Lỗi tải danh sách tag
                <br><br>
                <button onclick="refreshBulkTagModalDropdown()" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i> Thử lại
                </button>
            </div>
        `;
    }
}

function filterBulkTagModalOptions() {
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');
    populateBulkTagModalDropdown();
    dropdown.classList.add('show');
}

function handleBulkTagModalSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const searchValue = document.getElementById('bulkTagModalSearchInput').value.trim();

        const highlightedTag = document.querySelector('.bulk-tag-search-option.highlighted');

        if (highlightedTag) {
            const tagId = highlightedTag.getAttribute('data-tag-id');
            const tagName = highlightedTag.getAttribute('data-tag-name');
            const tagColor = highlightedTag.getAttribute('data-tag-color');
            addTagToBulkTagModal(tagId, tagName, tagColor);
        } else if (searchValue !== '') {
            autoCreateAndAddTagToBulkModal(searchValue);
        }
    } else if (event.key === 'Escape') {
        document.getElementById('bulkTagModalSearchDropdown').classList.remove('show');
        document.getElementById('bulkTagModalSearchInput').blur();
    }
}

async function autoCreateAndAddTagToBulkModal(tagName) {
    if (!tagName || tagName.trim() === '') return;

    const name = tagName.trim().toUpperCase();
    const color = generateRandomColor();

    try {
        if (window.notificationManager) {
            window.notificationManager.info(`Đang tạo tag "${name}"...`);
        }

        console.log('[BULK-TAG-MODAL] Creating tag:', { name, color });

        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'accept': 'application/json, text/plain, */*',
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({
                    Name: name,
                    Color: color
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const newTag = await response.json();
        console.log('[BULK-TAG-MODAL] Tag created successfully:', newTag);

        if (newTag['@odata.context']) {
            delete newTag['@odata.context'];
        }

        if (Array.isArray(availableTags)) {
            const existsInAvailable = availableTags.some(t => t.Id === newTag.Id);
            if (!existsInAvailable) {
                availableTags.push(newTag);
                window.availableTags = availableTags;
                console.log('[BULK-TAG-MODAL] Added new tag directly to availableTags:', newTag.Name);
            }
        }

        window.cacheManager.clear("tags");
        window.cacheManager.set("tags", availableTags, "tags");
        console.log('[BULK-TAG-MODAL] Updated tags cache with new tag');

        populateTagFilter();
        populateBulkTagModalDropdown();

        addTagToBulkTagModal(newTag.Id, newTag.Name, newTag.Color);

        if (window.notificationManager) {
            window.notificationManager.success(`Đã tạo và thêm tag "${name}"!`);
        }

        console.log('[BULK-TAG-MODAL] Tag created and added to bulk modal');

    } catch (error) {
        console.error('[BULK-TAG-MODAL] Error creating tag:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi tạo tag: ' + error.message);
        }
    }
}

function addTagToBulkTagModal(tagId, tagName, tagColor) {
    console.log("[BULK-TAG-MODAL] Adding tag:", tagName);

    if (bulkTagModalData.some(t => t.tagId === tagId)) {
        return;
    }

    bulkTagModalData.push({
        tagId: tagId,
        tagName: tagName,
        tagColor: tagColor,
        sttList: []
    });

    updateBulkTagModalTable();
    updateBulkTagModalRowCount();
    populateBulkTagModalDropdown();

    document.getElementById('bulkTagModalSearchInput').value = '';
    document.getElementById('bulkTagModalSearchDropdown').classList.remove('show');
}

function removeTagFromBulkTagModal(tagId) {
    bulkTagModalData = bulkTagModalData.filter(t => t.tagId !== tagId);
    selectedBulkTagModalRows.delete(tagId);

    updateBulkTagModalTable();
    updateBulkTagModalRowCount();
    populateBulkTagModalDropdown();
}

function clearAllBulkTagRows() {
    if (bulkTagModalData.length === 0) return;

    if (confirm('Bạn có chắc muốn xóa tất cả tag đã thêm?')) {
        bulkTagModalData = [];
        selectedBulkTagModalRows.clear();
        document.getElementById('bulkTagSelectAllCheckbox').checked = false;

        clearBulkTagLocalStorage();

        updateBulkTagModalTable();
        updateBulkTagModalRowCount();
        populateBulkTagModalDropdown();
    }
}

function updateBulkTagModalRowCount() {
    const countEl = document.getElementById('bulkTagRowCount');
    countEl.textContent = `${bulkTagModalData.length} tag đã thêm`;
}

function toggleBulkTagSelectAll(checked) {
    if (checked) {
        bulkTagModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagModalRows.add(tag.tagId);
            }
        });
    } else {
        selectedBulkTagModalRows.clear();
    }

    updateBulkTagModalTable();
}

function toggleBulkTagRowSelection(tagId) {
    const tagData = bulkTagModalData.find(t => t.tagId === tagId);
    if (!tagData || tagData.sttList.length === 0) return;

    if (selectedBulkTagModalRows.has(tagId)) {
        selectedBulkTagModalRows.delete(tagId);
    } else {
        selectedBulkTagModalRows.add(tagId);
    }

    updateBulkTagModalTable();
    updateSelectAllCheckbox();
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('bulkTagSelectAllCheckbox');
    const tagsWithSTT = bulkTagModalData.filter(t => t.sttList.length > 0);

    if (tagsWithSTT.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedBulkTagModalRows.size === tagsWithSTT.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedBulkTagModalRows.size > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

function addSTTToBulkTagRow(tagId, inputElement) {
    const sttValue = inputElement.value.trim();
    if (!sttValue) return;

    const stt = parseInt(sttValue);
    if (isNaN(stt) || stt <= 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('STT phải là số nguyên dương', 2000);
        }
        return;
    }

    const tagData = bulkTagModalData.find(t => t.tagId === tagId);
    if (!tagData) return;

    const order = displayedData.find(o => o.SessionIndex === stt);
    if (!order) {
        if (window.notificationManager) {
            window.notificationManager.warning(`STT ${stt} không tồn tại trong danh sách hiện tại`, 2000);
        }
        return;
    }

    if (tagData.sttList.includes(stt)) {
        if (window.notificationManager) {
            window.notificationManager.warning(`STT ${stt} đã được thêm`, 2000);
        }
        inputElement.value = '';
        return;
    }

    tagData.sttList.push(stt);
    inputElement.value = '';

    updateBulkTagModalTable();

    setTimeout(() => {
        const newInput = document.querySelector(`.bulk-tag-row[data-tag-id="${tagId}"] .bulk-tag-stt-input`);
        if (newInput) {
            newInput.focus();
        }
    }, 10);
}

function handleBulkTagSTTInputKeydown(event, tagId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addSTTToBulkTagRow(tagId, event.target);
    }
}

function removeSTTFromBulkTagRow(tagId, stt) {
    const tagData = bulkTagModalData.find(t => t.tagId === tagId);
    if (!tagData) return;

    tagData.sttList = tagData.sttList.filter(s => s !== stt);

    if (tagData.sttList.length === 0) {
        selectedBulkTagModalRows.delete(tagId);
    }

    updateBulkTagModalTable();
    updateSelectAllCheckbox();
}

function updateBulkTagModalTable() {
    const tableBody = document.getElementById('bulkTagTableBody');

    if (bulkTagModalData.length === 0) {
        tableBody.innerHTML = `
            <div class="bulk-tag-empty-state">
                <i class="fas fa-inbox"></i>
                <p>Chưa có tag nào được thêm. Hãy tìm kiếm và thêm tag.</p>
            </div>
        `;
        return;
    }

    tableBody.innerHTML = bulkTagModalData.map(tagData => {
        const isSelected = selectedBulkTagModalRows.has(tagData.tagId);
        const sttArray = tagData.sttList || [];
        const sttCount = sttArray.length;
        const hasError = tagData.errorMessage && tagData.errorMessage.length > 0;

        const sttPillsHtml = sttArray.map(stt => {
            const order = displayedData.find(o => o.SessionIndex === stt);
            const customerName = order ? (order.Name || order.PartnerName || 'N/A') : 'N/A';
            return `
                <div class="bulk-tag-stt-pill">
                    <span class="stt-number">STT ${stt}</span>
                    <span class="customer-name">${customerName}</span>
                    <button class="remove-stt" onclick="removeSTTFromBulkTagRow('${tagData.tagId}', ${stt})" title="Xóa STT">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');

        const errorHtml = hasError ? `
            <div class="bulk-tag-row-error">
                ${tagData.errorMessage}
            </div>
        ` : '';

        return `
            <div class="bulk-tag-row ${isSelected ? 'selected' : ''} ${hasError ? 'has-error' : ''}" data-tag-id="${tagData.tagId}">
                <div class="bulk-tag-row-tag">
                    <input type="checkbox"
                           ${isSelected ? 'checked' : ''}
                           ${sttCount === 0 ? 'disabled' : ''}
                           onchange="toggleBulkTagRowSelection('${tagData.tagId}')"
                           title="${sttCount === 0 ? 'Thêm STT trước khi chọn' : 'Chọn để gán tag'}">
                    <div class="bulk-tag-row-tag-info">
                        <span class="tag-color-dot" style="background-color: ${tagData.tagColor}"></span>
                        <span class="tag-name">${tagData.tagName}</span>
                    </div>
                    ${errorHtml}
                </div>
                <div class="bulk-tag-row-stt">
                    <div class="bulk-tag-stt-pills">
                        ${sttPillsHtml || '<span style="color: #9ca3af; font-size: 13px;">Chưa có STT nào</span>'}
                    </div>
                    <div class="bulk-tag-stt-input-wrapper">
                        <input type="number"
                               class="bulk-tag-stt-input"
                               placeholder="Nhập STT và Enter"
                               onkeydown="handleBulkTagSTTInputKeydown(event, '${tagData.tagId}')">
                        <span class="bulk-tag-stt-counter">(${sttCount})</span>
                    </div>
                </div>
                <div class="bulk-tag-row-action">
                    <button class="bulk-tag-remove-row-btn" onclick="removeTagFromBulkTagModal('${tagData.tagId}')" title="Xóa tag này">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// BULK TAG ASSIGN - EXECUTE
// =====================================================

async function executeBulkTagModalAssignment() {
    console.log("[BULK-TAG-MODAL] Executing bulk tag assignment");

    const selectedTags = bulkTagModalData.filter(t =>
        selectedBulkTagModalRows.has(t.tagId) && t.sttList.length > 0
    );

    if (selectedTags.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn ít nhất một tag có STT để gán', 3000);
        } else {
            alert('Vui lòng chọn ít nhất một tag có STT để gán');
        }
        return;
    }

    try {
        showLoading(true);

        const successResults = [];
        const failedResults = [];

        for (const selectedTag of selectedTags) {
            const tagInfo = {
                Id: parseInt(selectedTag.tagId, 10),
                Name: selectedTag.tagName,
                Color: selectedTag.tagColor
            };

            const sttArray = selectedTag.sttList || [];
            const successSTT = [];
            const failedSTT = [];
            let failReason = null;

            const matchingOrders = displayedData.filter(order =>
                sttArray.includes(order.SessionIndex)
            );

            if (matchingOrders.length === 0) {
                console.warn(`[BULK-TAG-MODAL] No orders found for tag "${tagInfo.Name}"`);
                continue;
            }

            console.log(`[BULK-TAG-MODAL] Processing tag "${tagInfo.Name}" for ${matchingOrders.length} orders`);

            for (const order of matchingOrders) {
                try {
                    const rawTags = order.Tags ? JSON.parse(order.Tags) : [];
                    const currentTags = rawTags.map(t => ({
                        Id: parseInt(t.Id, 10),
                        Name: t.Name,
                        Color: t.Color
                    }));

                    // Check if order has "ĐÃ GỘP KO CHỐT" tag
                    const hasBlockedTag = currentTags.some(t => t.Name === "ĐÃ GỘP KO CHỐT");
                    if (hasBlockedTag) {
                        console.log(`[BULK-TAG-MODAL] Order ${order.Code} has blocked tag, finding replacement...`);

                        const originalSTT = order.SessionIndex;
                        const normalizedPhone = normalizePhoneForBulkTag(order.Telephone);

                        if (!normalizedPhone) {
                            failedSTT.push(order.SessionIndex);
                            failReason = 'Đơn có tag "ĐÃ GỘP KO CHỐT" và không có SĐT';
                            continue;
                        }

                        const samePhoneOrders = displayedData.filter(o =>
                            o.Id !== order.Id && normalizePhoneForBulkTag(o.Telephone) === normalizedPhone
                        );

                        if (samePhoneOrders.length === 0) {
                            failedSTT.push(order.SessionIndex);
                            failReason = 'Không tìm thấy đơn thay thế cùng SĐT';
                            continue;
                        }

                        const replacementOrder = samePhoneOrders.sort((a, b) =>
                            b.SessionIndex - a.SessionIndex
                        )[0];

                        const replacementRawTags = replacementOrder.Tags ? JSON.parse(replacementOrder.Tags) : [];
                        const replacementCurrentTags = replacementRawTags.map(t => ({
                            Id: parseInt(t.Id, 10),
                            Name: t.Name,
                            Color: t.Color
                        }));

                        const tagExistsOnReplacement = replacementCurrentTags.some(t => t.Id === tagInfo.Id);
                        if (tagExistsOnReplacement) {
                            successSTT.push({
                                original: originalSTT,
                                redirectTo: replacementOrder.SessionIndex,
                                redirected: true
                            });
                            continue;
                        }

                        const replacementUpdatedTags = [
                            ...replacementCurrentTags,
                            { Id: tagInfo.Id, Name: tagInfo.Name, Color: tagInfo.Color }
                        ];

                        try {
                            const authHeaders = await window.tokenManager.getAuthHeader();
                            const response = await fetch(
                                "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
                                {
                                    method: "POST",
                                    headers: {
                                        ...authHeaders,
                                        "Content-Type": "application/json",
                                        "Accept": "application/json"
                                    },
                                    body: JSON.stringify({
                                        Tags: replacementUpdatedTags,
                                        OrderId: replacementOrder.Id
                                    }),
                                }
                            );

                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}`);
                            }

                            const updatedData = { Tags: JSON.stringify(replacementUpdatedTags) };
                            updateOrderInTable(replacementOrder.Id, updatedData);
                            await emitTagUpdateToFirebase(replacementOrder.Id, replacementUpdatedTags);

                            successSTT.push({
                                original: originalSTT,
                                redirectTo: replacementOrder.SessionIndex,
                                redirected: true
                            });

                        } catch (apiError) {
                            failedSTT.push(order.SessionIndex);
                            failReason = failReason || `Lỗi API khi gán cho đơn thay thế: ${apiError.message}`;
                        }

                        continue;
                    }

                    const tagExists = currentTags.some(t => t.Id === tagInfo.Id);
                    if (tagExists) {
                        successSTT.push(order.SessionIndex);
                        continue;
                    }

                    const updatedTags = [
                        ...currentTags,
                        { Id: tagInfo.Id, Name: tagInfo.Name, Color: tagInfo.Color }
                    ];

                    const authHeaders = await window.tokenManager.getAuthHeader();
                    const response = await fetch(
                        "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
                        {
                            method: "POST",
                            headers: {
                                ...authHeaders,
                                "Content-Type": "application/json",
                                "Accept": "application/json"
                            },
                            body: JSON.stringify({
                                Tags: updatedTags,
                                OrderId: order.Id
                            }),
                        }
                    );

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const updatedData = { Tags: JSON.stringify(updatedTags) };
                    updateOrderInTable(order.Id, updatedData);
                    await emitTagUpdateToFirebase(order.Id, updatedTags);

                    successSTT.push(order.SessionIndex);
                    console.log(`[BULK-TAG-MODAL] Successfully tagged order ${order.Code}`);

                } catch (error) {
                    console.error(`[BULK-TAG-MODAL] Error tagging order ${order.Code}:`, error);
                    failedSTT.push(order.SessionIndex);
                    failReason = failReason || `Lỗi API: ${error.message}`;
                }
            }

            const normalSTT = successSTT.filter(s => typeof s === 'number');
            const redirectedSTT = successSTT.filter(s => typeof s === 'object' && s.redirected);

            if (successSTT.length > 0) {
                successResults.push({
                    tagName: tagInfo.Name,
                    tagColor: tagInfo.Color,
                    sttList: normalSTT.sort((a, b) => a - b),
                    redirectedList: redirectedSTT.sort((a, b) => a.original - b.original)
                });
            }

            if (failedSTT.length > 0) {
                failedResults.push({
                    tagName: tagInfo.Name,
                    tagColor: tagInfo.Color,
                    sttList: failedSTT.sort((a, b) => a - b),
                    reason: failReason || 'Lỗi không xác định'
                });
            }

            const tagDataInModal = bulkTagModalData.find(t => t.tagId === selectedTag.tagId);
            if (tagDataInModal) {
                const successOriginalSTTs = [
                    ...normalSTT,
                    ...redirectedSTT.map(r => r.original)
                ];
                tagDataInModal.sttList = tagDataInModal.sttList.filter(stt => !successOriginalSTTs.includes(stt));

                if (failedSTT.length > 0) {
                    tagDataInModal.errorMessage = `⚠️ STT ${failedSTT.join(', ')} - ${failReason}`;
                } else {
                    tagDataInModal.errorMessage = null;
                }
            }
        }

        window.cacheManager.clear("orders");

        bulkTagModalData = bulkTagModalData.filter(tag => tag.sttList.length > 0);

        selectedBulkTagModalRows.clear();
        bulkTagModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagModalRows.add(tag.tagId);
            }
        });

        if (bulkTagModalData.length > 0) {
            saveBulkTagToLocalStorage();
        } else {
            clearBulkTagLocalStorage();
        }

        const totalSuccess = successResults.reduce((sum, r) => sum + r.sttList.length + (r.redirectedList?.length || 0), 0);
        const totalFailed = failedResults.reduce((sum, r) => sum + r.sttList.length, 0);

        if (totalSuccess > 0 || totalFailed > 0) {
            await saveBulkTagHistory({
                success: successResults,
                failed: failedResults
            });
        }

        showLoading(false);

        updateBulkTagModalTable();
        updateBulkTagModalRowCount();
        updateSelectAllCheckbox();

        showBulkTagResultModal(successResults, failedResults);

    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error in bulk tag assignment:", error);
        showLoading(false);

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`, 5000);
        } else {
            alert(`Lỗi: ${error.message}`);
        }
    }
}

// =====================================================
// BULK TAG ASSIGN - HISTORY
// =====================================================

async function saveBulkTagHistory(results) {
    try {
        const timestamp = Date.now();
        const dateFormatted = new Date(timestamp).toLocaleString('vi-VN');

        let username = 'Unknown';
        try {
            if (currentUserIdentifier) {
                username = currentUserIdentifier;
            } else {
                const tokenData = window.tokenManager?.getTokenData?.();
                username = tokenData?.DisplayName || tokenData?.name || 'Unknown';
            }
        } catch (e) {
            console.warn("[BULK-TAG-MODAL] Could not get username:", e);
        }

        const historyEntry = {
            timestamp: timestamp,
            dateFormatted: dateFormatted,
            username: username,
            results: results,
            summary: {
                totalSuccess: results.success.reduce((sum, r) => sum + r.sttList.length, 0),
                totalFailed: results.failed.reduce((sum, r) => sum + r.sttList.length, 0)
            }
        };

        const historyRef = database.ref(`bulkTagHistory/${timestamp}`);
        await historyRef.set(historyEntry);

        console.log("[BULK-TAG-MODAL] History saved to Firebase:", historyEntry);
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error saving history:", error);
    }
}

function showBulkTagResultModal(successResults, failedResults) {
    const totalSuccess = successResults.reduce((sum, r) => sum + r.sttList.length + (r.redirectedList?.length || 0), 0);
    const totalFailed = failedResults.reduce((sum, r) => sum + r.sttList.length, 0);

    let successHtml = '';
    if (successResults.length > 0) {
        successHtml = `
            <div class="bulk-tag-result-section success">
                <div class="bulk-tag-result-section-header">
                    <i class="fas fa-check-circle"></i>
                    <span>Thành công (${totalSuccess} đơn)</span>
                </div>
                <div class="bulk-tag-result-section-body">
                    ${successResults.map(r => {
                        const normalSttDisplay = r.sttList.length > 0 ? `STT ${r.sttList.join(', ')}` : '';
                        const redirectedDisplay = r.redirectedList?.length > 0
                            ? r.redirectedList.map(rd => `${rd.original} → ${rd.redirectTo}`).join(', ')
                            : '';

                        let sttDisplay = '';
                        if (normalSttDisplay && redirectedDisplay) {
                            sttDisplay = `${normalSttDisplay}, ${redirectedDisplay}`;
                        } else if (normalSttDisplay) {
                            sttDisplay = normalSttDisplay;
                        } else if (redirectedDisplay) {
                            sttDisplay = `STT ${redirectedDisplay}`;
                        }

                        const redirectNote = r.redirectedList?.length > 0
                            ? `<div class="redirect-note" style="font-size: 11px; color: #6b7280; margin-top: 2px;">↳ Chuyển sang đơn cùng SĐT</div>`
                            : '';

                        return `
                            <div class="bulk-tag-result-item">
                                <span class="tag-color-dot" style="background-color: ${r.tagColor}"></span>
                                <span class="tag-name">${r.tagName}:</span>
                                <span class="stt-list">${sttDisplay}</span>
                                ${redirectNote}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    let failedHtml = '';
    if (failedResults.length > 0) {
        failedHtml = `
            <div class="bulk-tag-result-section failed">
                <div class="bulk-tag-result-section-header">
                    <i class="fas fa-times-circle"></i>
                    <span>Thất bại (${totalFailed} đơn)</span>
                </div>
                <div class="bulk-tag-result-section-body">
                    ${failedResults.map(r => `
                        <div class="bulk-tag-result-item">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${r.sttList.join(', ')}</span>
                            <div class="fail-reason">→ ${r.reason}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const modalHtml = `
        <div class="bulk-tag-result-modal" id="bulkTagResultModal">
            <div class="bulk-tag-result-modal-content">
                <div class="bulk-tag-result-modal-header">
                    <h3><i class="fas fa-clipboard-list"></i> Kết Quả Gán Tag</h3>
                    <button class="bulk-tag-result-modal-close" onclick="closeBulkTagResultModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="bulk-tag-result-modal-body">
                    ${successHtml}
                    ${failedHtml}
                    ${totalSuccess === 0 && totalFailed === 0 ? '<p style="text-align: center; color: #9ca3af;">Không có kết quả nào</p>' : ''}
                </div>
                <div class="bulk-tag-result-modal-footer">
                    <button class="bulk-tag-btn-confirm" onclick="closeBulkTagResultModal()">
                        <i class="fas fa-check"></i> Đóng
                    </button>
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('bulkTagResultModal');
    if (existingModal) {
        existingModal.remove();
    }

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    setTimeout(() => {
        document.getElementById('bulkTagResultModal').classList.add('show');
    }, 10);
}

function closeBulkTagResultModal() {
    const modal = document.getElementById('bulkTagResultModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

async function showBulkTagHistoryModal() {
    console.log("[BULK-TAG-MODAL] Opening history modal");

    const historyBody = document.getElementById('bulkTagHistoryModalBody');
    historyBody.innerHTML = `
        <div class="bulk-tag-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải lịch sử...</p>
        </div>
    `;

    document.getElementById('bulkTagHistoryModal').classList.add('show');

    try {
        const historyRef = database.ref('bulkTagHistory');
        const snapshot = await historyRef.orderByKey().limitToLast(50).once('value');
        const historyData = snapshot.val();

        if (!historyData) {
            historyBody.innerHTML = `
                <div class="bulk-tag-history-empty">
                    <i class="fas fa-history"></i>
                    <p>Chưa có lịch sử gán tag nào</p>
                </div>
            `;
            return;
        }

        const historyArray = Object.values(historyData).sort((a, b) => b.timestamp - a.timestamp);

        historyBody.innerHTML = `
            <div class="bulk-tag-history-list">
                ${historyArray.map((entry, index) => renderBulkTagHistoryItem(entry, index)).join('')}
            </div>
        `;

    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error loading history:", error);
        historyBody.innerHTML = `
            <div class="bulk-tag-history-empty">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                <p>Lỗi tải lịch sử: ${error.message}</p>
            </div>
        `;
    }
}

function renderBulkTagHistoryItem(entry, index) {
    const { dateFormatted, username, results, summary } = entry;

    let successHtml = '';
    if (results.success && results.success.length > 0) {
        successHtml = `
            <div class="bulk-tag-history-success">
                <div class="bulk-tag-history-success-title">
                    <i class="fas fa-check-circle"></i>
                    Thành công (${summary.totalSuccess} đơn):
                </div>
                <div class="bulk-tag-history-tag-list">
                    ${results.success.map(r => `
                        <div class="bulk-tag-history-tag-item">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor || '#6b7280'}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${r.sttList.join(', ')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let failedHtml = '';
    if (results.failed && results.failed.length > 0) {
        failedHtml = `
            <div class="bulk-tag-history-failed">
                <div class="bulk-tag-history-failed-title">
                    <i class="fas fa-times-circle"></i>
                    Thất bại (${summary.totalFailed} đơn):
                </div>
                <div class="bulk-tag-history-tag-list">
                    ${results.failed.map(r => `
                        <div class="bulk-tag-history-tag-item failed">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor || '#6b7280'}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${r.sttList.join(', ')}</span>
                            <div class="fail-reason">→ ${r.reason}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    return `
        <div class="bulk-tag-history-item" id="bulkTagHistoryItem${index}">
            <div class="bulk-tag-history-header" onclick="toggleBulkTagHistoryItem(${index})">
                <div class="history-info">
                    <div class="history-time">
                        <i class="fas fa-clock"></i>
                        ${dateFormatted}
                    </div>
                    <div class="history-user">
                        <i class="fas fa-user"></i>
                        ${username || 'Unknown'}
                    </div>
                </div>
                <div class="history-summary">
                    <span class="success-count"><i class="fas fa-check"></i> ${summary.totalSuccess}</span>
                    <span class="failed-count"><i class="fas fa-times"></i> ${summary.totalFailed}</span>
                    <i class="fas fa-chevron-down expand-icon"></i>
                </div>
            </div>
            <div class="bulk-tag-history-body">
                ${successHtml}
                ${failedHtml}
            </div>
        </div>
    `;
}

function toggleBulkTagHistoryItem(index) {
    const item = document.getElementById(`bulkTagHistoryItem${index}`);
    if (item) {
        item.classList.toggle('expanded');
    }
}

function closeBulkTagHistoryModal() {
    document.getElementById('bulkTagHistoryModal').classList.remove('show');
}

// =====================================================
// BULK TAG DELETE - LOCALSTORAGE
// =====================================================

function saveBulkTagDeleteToLocalStorage() {
    try {
        const dataToSave = bulkTagDeleteModalData.map(tag => ({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor,
            sttList: tag.sttList || [],
            errorMessage: tag.errorMessage || null
        }));
        localStorage.setItem(BULK_TAG_DELETE_DRAFT_KEY, JSON.stringify(dataToSave));
        console.log("[BULK-TAG-DELETE] Saved draft to localStorage:", dataToSave);
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error saving to localStorage:", error);
    }
}

function loadBulkTagDeleteFromLocalStorage() {
    try {
        const savedData = localStorage.getItem(BULK_TAG_DELETE_DRAFT_KEY);
        if (!savedData) return false;

        const parsedData = JSON.parse(savedData);
        if (!Array.isArray(parsedData) || parsedData.length === 0) return false;

        bulkTagDeleteModalData = parsedData.map(tag => ({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor,
            sttList: tag.sttList || [],
            errorMessage: tag.errorMessage || null
        }));

        selectedBulkTagDeleteModalRows.clear();
        bulkTagDeleteModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagDeleteModalRows.add(tag.tagId);
            }
        });

        console.log("[BULK-TAG-DELETE] Loaded draft from localStorage:", bulkTagDeleteModalData);
        return true;
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error loading from localStorage:", error);
        return false;
    }
}

function clearBulkTagDeleteLocalStorage() {
    try {
        localStorage.removeItem(BULK_TAG_DELETE_DRAFT_KEY);
        console.log("[BULK-TAG-DELETE] Cleared localStorage draft");
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error clearing localStorage:", error);
    }
}

// =====================================================
// BULK TAG DELETE - MODAL FUNCTIONS
// =====================================================

async function showBulkTagDeleteModal() {
    console.log("[BULK-TAG-DELETE] Opening bulk tag delete modal");

    const hasStoredData = loadBulkTagDeleteFromLocalStorage();

    if (!hasStoredData) {
        bulkTagDeleteModalData = [];
        selectedBulkTagDeleteModalRows.clear();
    }

    updateBulkTagDeleteModalTable();
    updateBulkTagDeleteModalRowCount();
    updateBulkTagDeleteSelectAllCheckbox();
    document.getElementById('bulkTagDeleteModalSearchInput').value = '';

    await loadBulkTagDeleteModalOptions();

    document.getElementById('bulkTagDeleteModal').classList.add('show');
}

function closeBulkTagDeleteModal() {
    if (bulkTagDeleteModalData.length > 0) {
        saveBulkTagDeleteToLocalStorage();
    }

    document.getElementById('bulkTagDeleteModal').classList.remove('show');
    document.getElementById('bulkTagDeleteModalSearchDropdown').classList.remove('show');
}

async function loadBulkTagDeleteModalOptions() {
    try {
        if (!availableTags || availableTags.length === 0) {
            await loadAvailableTags();
        }
        populateBulkTagDeleteModalDropdown();
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error loading tags:", error);
    }
}

function populateBulkTagDeleteModalDropdown() {
    const dropdown = document.getElementById('bulkTagDeleteModalSearchDropdown');
    const searchValue = document.getElementById('bulkTagDeleteModalSearchInput').value.toLowerCase().trim();

    const tags = window.availableTags || availableTags || [];

    if (!tags || tags.length === 0) {
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
                Đang tải danh sách tag...
                <br><br>
                <button onclick="refreshBulkTagDeleteModalDropdown()" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i> Tải lại
                </button>
            </div>
        `;
        return;
    }

    const filteredTags = tags.filter(tag =>
        tag.Name && tag.Name.toLowerCase().includes(searchValue)
    );

    if (filteredTags.length === 0) {
        const escapedSearch = searchValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                Không tìm thấy tag "${escapedSearch}"
            </div>
        `;
        return;
    }

    const addedTagIds = new Set(bulkTagDeleteModalData.map(t => t.tagId));
    const displayTags = filteredTags.slice(0, 100);

    let firstAvailableFound = false;

    dropdown.innerHTML = displayTags.map(tag => {
        const isAdded = addedTagIds.has(tag.Id);
        const tagName = tag.Name.replace(/'/g, "\\'").replace(/"/g, "&quot;");

        let isHighlighted = false;
        if (!isAdded && !firstAvailableFound) {
            isHighlighted = true;
            firstAvailableFound = true;
        }

        return `
            <div class="bulk-tag-search-option ${isAdded ? 'disabled' : ''} ${isHighlighted ? 'highlighted' : ''}"
                 data-tag-id="${tag.Id}"
                 data-tag-name="${tagName}"
                 data-tag-color="${tag.Color || '#6b7280'}"
                 onclick="${isAdded ? '' : `addTagToBulkTagDeleteModal('${tag.Id}', '${tagName}', '${tag.Color || '#6b7280'}')`}">
                <span class="tag-color-dot" style="background-color: ${tag.Color || '#6b7280'}"></span>
                <span class="tag-name">${tag.Name}</span>
                ${isAdded ? '<span class="tag-added">Đã thêm</span>' : ''}
            </div>
        `;
    }).join('');

    if (filteredTags.length > 100) {
        dropdown.innerHTML += `
            <div style="padding: 10px 14px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb;">
                Hiển thị 100/${filteredTags.length} tag. Nhập từ khóa để lọc.
            </div>
        `;
    }
}

function showBulkTagDeleteModalDropdown() {
    const dropdown = document.getElementById('bulkTagDeleteModalSearchDropdown');
    populateBulkTagDeleteModalDropdown();
    dropdown.classList.add('show');
}

async function refreshBulkTagDeleteModalDropdown() {
    const dropdown = document.getElementById('bulkTagDeleteModalSearchDropdown');

    dropdown.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #9ca3af;">
            <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
            Đang tải danh sách tag...
        </div>
    `;

    try {
        await loadAvailableTags();
        populateBulkTagDeleteModalDropdown();
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error refreshing tags:", error);
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
                Lỗi tải danh sách tag
                <br><br>
                <button onclick="refreshBulkTagDeleteModalDropdown()" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i> Thử lại
                </button>
            </div>
        `;
    }
}

function filterBulkTagDeleteModalOptions() {
    const dropdown = document.getElementById('bulkTagDeleteModalSearchDropdown');
    populateBulkTagDeleteModalDropdown();
    dropdown.classList.add('show');
}

function handleBulkTagDeleteModalSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();

        const highlightedTag = document.querySelector('#bulkTagDeleteModal .bulk-tag-search-option.highlighted');

        if (highlightedTag) {
            const tagId = highlightedTag.getAttribute('data-tag-id');
            const tagName = highlightedTag.getAttribute('data-tag-name');
            const tagColor = highlightedTag.getAttribute('data-tag-color');
            addTagToBulkTagDeleteModal(tagId, tagName, tagColor);
        }
    } else if (event.key === 'Escape') {
        document.getElementById('bulkTagDeleteModalSearchDropdown').classList.remove('show');
        document.getElementById('bulkTagDeleteModalSearchInput').blur();
    }
}

function addTagToBulkTagDeleteModal(tagId, tagName, tagColor) {
    console.log("[BULK-TAG-DELETE] Adding tag:", tagName);

    if (bulkTagDeleteModalData.some(t => t.tagId === tagId)) {
        return;
    }

    bulkTagDeleteModalData.push({
        tagId: tagId,
        tagName: tagName,
        tagColor: tagColor,
        sttList: []
    });

    updateBulkTagDeleteModalTable();
    updateBulkTagDeleteModalRowCount();
    populateBulkTagDeleteModalDropdown();

    document.getElementById('bulkTagDeleteModalSearchInput').value = '';
    document.getElementById('bulkTagDeleteModalSearchDropdown').classList.remove('show');
}

function removeTagFromBulkTagDeleteModal(tagId) {
    bulkTagDeleteModalData = bulkTagDeleteModalData.filter(t => t.tagId !== tagId);
    selectedBulkTagDeleteModalRows.delete(tagId);

    updateBulkTagDeleteModalTable();
    updateBulkTagDeleteModalRowCount();
    populateBulkTagDeleteModalDropdown();
}

function clearAllBulkTagDeleteRows() {
    if (bulkTagDeleteModalData.length === 0) return;

    if (confirm('Bạn có chắc muốn xóa tất cả tag đã thêm?')) {
        bulkTagDeleteModalData = [];
        selectedBulkTagDeleteModalRows.clear();
        document.getElementById('bulkTagDeleteSelectAllCheckbox').checked = false;

        clearBulkTagDeleteLocalStorage();

        updateBulkTagDeleteModalTable();
        updateBulkTagDeleteModalRowCount();
        populateBulkTagDeleteModalDropdown();
    }
}

function updateBulkTagDeleteModalRowCount() {
    const countEl = document.getElementById('bulkTagDeleteRowCount');
    countEl.textContent = `${bulkTagDeleteModalData.length} tag đã thêm`;
}

function toggleBulkTagDeleteSelectAll(checked) {
    if (checked) {
        bulkTagDeleteModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagDeleteModalRows.add(tag.tagId);
            }
        });
    } else {
        selectedBulkTagDeleteModalRows.clear();
    }

    updateBulkTagDeleteModalTable();
}

function toggleBulkTagDeleteRowSelection(tagId) {
    const tagData = bulkTagDeleteModalData.find(t => t.tagId === tagId);
    if (!tagData || tagData.sttList.length === 0) return;

    if (selectedBulkTagDeleteModalRows.has(tagId)) {
        selectedBulkTagDeleteModalRows.delete(tagId);
    } else {
        selectedBulkTagDeleteModalRows.add(tagId);
    }

    updateBulkTagDeleteModalTable();
    updateBulkTagDeleteSelectAllCheckbox();
}

function updateBulkTagDeleteSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('bulkTagDeleteSelectAllCheckbox');
    const tagsWithSTT = bulkTagDeleteModalData.filter(t => t.sttList.length > 0);

    if (tagsWithSTT.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedBulkTagDeleteModalRows.size === tagsWithSTT.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedBulkTagDeleteModalRows.size > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

function addSTTToBulkTagDeleteRow(tagId, inputElement) {
    const sttValue = inputElement.value.trim();
    if (!sttValue) return;

    const stt = parseInt(sttValue);
    if (isNaN(stt) || stt <= 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('STT phải là số nguyên dương', 2000);
        }
        return;
    }

    const tagData = bulkTagDeleteModalData.find(t => t.tagId === tagId);
    if (!tagData) return;

    const order = displayedData.find(o => o.SessionIndex === stt);
    if (!order) {
        if (window.notificationManager) {
            window.notificationManager.warning(`STT ${stt} không tồn tại trong danh sách hiện tại`, 2000);
        }
        return;
    }

    if (tagData.sttList.includes(stt)) {
        if (window.notificationManager) {
            window.notificationManager.warning(`STT ${stt} đã được thêm`, 2000);
        }
        inputElement.value = '';
        return;
    }

    tagData.sttList.push(stt);
    inputElement.value = '';

    updateBulkTagDeleteModalTable();

    setTimeout(() => {
        const newInput = document.querySelector(`#bulkTagDeleteModal .bulk-tag-row[data-tag-id="${tagId}"] .bulk-tag-stt-input`);
        if (newInput) {
            newInput.focus();
        }
    }, 10);
}

function handleBulkTagDeleteSTTInputKeydown(event, tagId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addSTTToBulkTagDeleteRow(tagId, event.target);
    }
}

function removeSTTFromBulkTagDeleteRow(tagId, stt) {
    const tagData = bulkTagDeleteModalData.find(t => t.tagId === tagId);
    if (!tagData) return;

    tagData.sttList = tagData.sttList.filter(s => s !== stt);

    if (tagData.sttList.length === 0) {
        selectedBulkTagDeleteModalRows.delete(tagId);
    }

    updateBulkTagDeleteModalTable();
    updateBulkTagDeleteSelectAllCheckbox();
}

function updateBulkTagDeleteModalTable() {
    const tableBody = document.getElementById('bulkTagDeleteTableBody');

    if (bulkTagDeleteModalData.length === 0) {
        tableBody.innerHTML = `
            <div class="bulk-tag-empty-state">
                <i class="fas fa-inbox"></i>
                <p>Chưa có tag nào được thêm. Hãy tìm kiếm và thêm tag cần xóa.</p>
            </div>
        `;
        return;
    }

    tableBody.innerHTML = bulkTagDeleteModalData.map(tagData => {
        const isSelected = selectedBulkTagDeleteModalRows.has(tagData.tagId);
        const sttArray = tagData.sttList || [];
        const sttCount = sttArray.length;
        const hasError = tagData.errorMessage && tagData.errorMessage.length > 0;

        const sttPillsHtml = sttArray.map(stt => {
            const order = displayedData.find(o => o.SessionIndex === stt);
            const customerName = order ? (order.Name || order.PartnerName || 'N/A') : 'N/A';
            return `
                <div class="bulk-tag-stt-pill">
                    <span class="stt-number">STT ${stt}</span>
                    <span class="customer-name">${customerName}</span>
                    <button class="remove-stt" onclick="removeSTTFromBulkTagDeleteRow('${tagData.tagId}', ${stt})" title="Xóa STT">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');

        const errorHtml = hasError ? `
            <div class="bulk-tag-row-error">
                ${tagData.errorMessage}
            </div>
        ` : '';

        return `
            <div class="bulk-tag-row ${isSelected ? 'selected' : ''} ${hasError ? 'has-error' : ''}" data-tag-id="${tagData.tagId}">
                <div class="bulk-tag-row-tag">
                    <input type="checkbox"
                           ${isSelected ? 'checked' : ''}
                           ${sttCount === 0 ? 'disabled' : ''}
                           onchange="toggleBulkTagDeleteRowSelection('${tagData.tagId}')"
                           title="${sttCount === 0 ? 'Thêm STT trước khi chọn' : 'Chọn để xóa tag'}">
                    <div class="bulk-tag-row-tag-info">
                        <span class="tag-color-dot" style="background-color: ${tagData.tagColor}"></span>
                        <span class="tag-name">${tagData.tagName}</span>
                    </div>
                    ${errorHtml}
                </div>
                <div class="bulk-tag-row-stt">
                    <div class="bulk-tag-stt-pills">
                        ${sttPillsHtml || '<span style="color: #9ca3af; font-size: 13px;">Chưa có STT nào</span>'}
                    </div>
                    <div class="bulk-tag-stt-input-wrapper">
                        <input type="number"
                               class="bulk-tag-stt-input"
                               placeholder="Nhập STT và Enter"
                               onkeydown="handleBulkTagDeleteSTTInputKeydown(event, '${tagData.tagId}')">
                        <span class="bulk-tag-stt-counter">(${sttCount})</span>
                    </div>
                </div>
                <div class="bulk-tag-row-action">
                    <button class="bulk-tag-remove-row-btn" onclick="removeTagFromBulkTagDeleteModal('${tagData.tagId}')" title="Xóa tag này">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// BULK TAG DELETE - EXECUTE
// =====================================================

async function executeBulkTagDeleteModalRemoval() {
    console.log("[BULK-TAG-DELETE] Executing bulk tag removal");

    const selectedTags = bulkTagDeleteModalData.filter(t =>
        selectedBulkTagDeleteModalRows.has(t.tagId) && t.sttList.length > 0
    );

    if (selectedTags.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn ít nhất một tag có STT để xóa', 3000);
        } else {
            alert('Vui lòng chọn ít nhất một tag có STT để xóa');
        }
        return;
    }

    try {
        showLoading(true);

        const successResults = [];
        const failedResults = [];

        for (const selectedTag of selectedTags) {
            const tagInfo = {
                Id: parseInt(selectedTag.tagId, 10),
                Name: selectedTag.tagName,
                Color: selectedTag.tagColor
            };

            const sttArray = selectedTag.sttList || [];
            const successSTT = [];
            const failedSTT = [];
            let failReason = null;

            const matchingOrders = displayedData.filter(order =>
                sttArray.includes(order.SessionIndex)
            );

            if (matchingOrders.length === 0) {
                console.warn(`[BULK-TAG-DELETE] No orders found for tag "${tagInfo.Name}"`);
                continue;
            }

            for (const order of matchingOrders) {
                try {
                    const rawTags = order.Tags ? JSON.parse(order.Tags) : [];
                    const currentTags = rawTags.map(t => ({
                        Id: parseInt(t.Id, 10),
                        Name: t.Name,
                        Color: t.Color
                    }));

                    const hasTag = currentTags.some(t => t.Id === tagInfo.Id);
                    if (!hasTag) {
                        failedSTT.push(order.SessionIndex);
                        failReason = failReason || `Đơn không có tag "${tagInfo.Name}"`;
                        continue;
                    }

                    const updatedTags = currentTags.filter(t => t.Id !== tagInfo.Id);

                    const authHeaders = await window.tokenManager.getAuthHeader();
                    const response = await fetch(
                        "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
                        {
                            method: "POST",
                            headers: {
                                ...authHeaders,
                                "Content-Type": "application/json",
                                "Accept": "application/json"
                            },
                            body: JSON.stringify({
                                Tags: updatedTags,
                                OrderId: order.Id
                            }),
                        }
                    );

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const updatedData = { Tags: JSON.stringify(updatedTags) };
                    updateOrderInTable(order.Id, updatedData);
                    await emitTagUpdateToFirebase(order.Id, updatedTags);

                    successSTT.push(order.SessionIndex);

                } catch (error) {
                    console.error(`[BULK-TAG-DELETE] Error removing tag from order ${order.Code}:`, error);
                    failedSTT.push(order.SessionIndex);
                    failReason = failReason || `Lỗi API: ${error.message}`;
                }
            }

            if (successSTT.length > 0) {
                successResults.push({
                    tagName: tagInfo.Name,
                    tagColor: tagInfo.Color,
                    sttList: successSTT.sort((a, b) => a - b)
                });
            }

            if (failedSTT.length > 0) {
                failedResults.push({
                    tagName: tagInfo.Name,
                    tagColor: tagInfo.Color,
                    sttList: failedSTT.sort((a, b) => a - b),
                    reason: failReason || 'Lỗi không xác định'
                });
            }

            const tagDataInModal = bulkTagDeleteModalData.find(t => t.tagId === selectedTag.tagId);
            if (tagDataInModal) {
                tagDataInModal.sttList = tagDataInModal.sttList.filter(stt => !successSTT.includes(stt));

                if (failedSTT.length > 0) {
                    tagDataInModal.errorMessage = `⚠️ STT ${failedSTT.join(', ')} - ${failReason}`;
                } else {
                    tagDataInModal.errorMessage = null;
                }
            }
        }

        window.cacheManager.clear("orders");

        bulkTagDeleteModalData = bulkTagDeleteModalData.filter(tag => tag.sttList.length > 0);

        selectedBulkTagDeleteModalRows.clear();
        bulkTagDeleteModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagDeleteModalRows.add(tag.tagId);
            }
        });

        if (bulkTagDeleteModalData.length > 0) {
            saveBulkTagDeleteToLocalStorage();
        } else {
            clearBulkTagDeleteLocalStorage();
        }

        const totalSuccess = successResults.reduce((sum, r) => sum + r.sttList.length, 0);
        const totalFailed = failedResults.reduce((sum, r) => sum + r.sttList.length, 0);

        if (totalSuccess > 0 || totalFailed > 0) {
            await saveBulkTagDeleteHistory({
                success: successResults,
                failed: failedResults
            });
        }

        showLoading(false);

        updateBulkTagDeleteModalTable();
        updateBulkTagDeleteModalRowCount();
        updateBulkTagDeleteSelectAllCheckbox();

        showBulkTagDeleteResultModal(successResults, failedResults);

    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error in bulk tag removal:", error);
        showLoading(false);

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`, 5000);
        } else {
            alert(`Lỗi: ${error.message}`);
        }
    }
}

// =====================================================
// BULK TAG DELETE - HISTORY
// =====================================================

async function saveBulkTagDeleteHistory(results) {
    try {
        const timestamp = Date.now();
        const dateFormatted = new Date(timestamp).toLocaleString('vi-VN');

        let username = 'Unknown';
        try {
            if (currentUserIdentifier) {
                username = currentUserIdentifier;
            } else {
                const tokenData = window.tokenManager?.getTokenData?.();
                username = tokenData?.DisplayName || tokenData?.name || 'Unknown';
            }
        } catch (e) {
            console.warn("[BULK-TAG-DELETE] Could not get username:", e);
        }

        const historyEntry = {
            timestamp: timestamp,
            dateFormatted: dateFormatted,
            username: username,
            results: results,
            summary: {
                totalSuccess: results.success.reduce((sum, r) => sum + r.sttList.length, 0),
                totalFailed: results.failed.reduce((sum, r) => sum + r.sttList.length, 0)
            }
        };

        const historyRef = database.ref(`bulkTagDeleteHistory/${timestamp}`);
        await historyRef.set(historyEntry);

        console.log("[BULK-TAG-DELETE] History saved to Firebase:", historyEntry);
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error saving history:", error);
    }
}

function showBulkTagDeleteResultModal(successResults, failedResults) {
    const totalSuccess = successResults.reduce((sum, r) => sum + r.sttList.length, 0);
    const totalFailed = failedResults.reduce((sum, r) => sum + r.sttList.length, 0);

    let successHtml = '';
    if (successResults.length > 0) {
        successHtml = `
            <div class="bulk-tag-result-section success">
                <div class="bulk-tag-result-section-header">
                    <i class="fas fa-check-circle"></i>
                    <span>Xóa thành công (${totalSuccess} đơn)</span>
                </div>
                <div class="bulk-tag-result-section-body">
                    ${successResults.map(r => `
                        <div class="bulk-tag-result-item">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${r.sttList.join(', ')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let failedHtml = '';
    if (failedResults.length > 0) {
        failedHtml = `
            <div class="bulk-tag-result-section failed">
                <div class="bulk-tag-result-section-header">
                    <i class="fas fa-times-circle"></i>
                    <span>Thất bại (${totalFailed} đơn)</span>
                </div>
                <div class="bulk-tag-result-section-body">
                    ${failedResults.map(r => `
                        <div class="bulk-tag-result-item">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${r.sttList.join(', ')}</span>
                            <div class="fail-reason">→ ${r.reason}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const modalHtml = `
        <div class="bulk-tag-result-modal bulk-tag-delete-result" id="bulkTagDeleteResultModal">
            <div class="bulk-tag-result-modal-content">
                <div class="bulk-tag-result-modal-header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
                    <h3><i class="fas fa-clipboard-list"></i> Kết Quả Xóa Tag</h3>
                    <button class="bulk-tag-result-modal-close" onclick="closeBulkTagDeleteResultModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="bulk-tag-result-modal-body">
                    ${successHtml}
                    ${failedHtml}
                    ${totalSuccess === 0 && totalFailed === 0 ? '<p style="text-align: center; color: #9ca3af;">Không có kết quả nào</p>' : ''}
                </div>
                <div class="bulk-tag-result-modal-footer">
                    <button class="bulk-tag-btn-confirm" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);" onclick="closeBulkTagDeleteResultModal()">
                        <i class="fas fa-check"></i> Đóng
                    </button>
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('bulkTagDeleteResultModal');
    if (existingModal) {
        existingModal.remove();
    }

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    setTimeout(() => {
        document.getElementById('bulkTagDeleteResultModal').classList.add('show');
    }, 10);
}

function closeBulkTagDeleteResultModal() {
    const modal = document.getElementById('bulkTagDeleteResultModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

async function showBulkTagDeleteHistoryModal() {
    console.log("[BULK-TAG-DELETE] Opening history modal");

    const historyBody = document.getElementById('bulkTagDeleteHistoryModalBody');
    historyBody.innerHTML = `
        <div class="bulk-tag-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải lịch sử...</p>
        </div>
    `;

    document.getElementById('bulkTagDeleteHistoryModal').classList.add('show');

    try {
        const historyRef = database.ref('bulkTagDeleteHistory');
        const snapshot = await historyRef.orderByKey().limitToLast(50).once('value');
        const historyData = snapshot.val();

        if (!historyData) {
            historyBody.innerHTML = `
                <div class="bulk-tag-history-empty">
                    <i class="fas fa-history"></i>
                    <p>Chưa có lịch sử xóa tag nào</p>
                </div>
            `;
            return;
        }

        const historyArray = Object.values(historyData).sort((a, b) => b.timestamp - a.timestamp);

        historyBody.innerHTML = `
            <div class="bulk-tag-history-list">
                ${historyArray.map((entry, index) => renderBulkTagDeleteHistoryItem(entry, index)).join('')}
            </div>
        `;

    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error loading history:", error);
        historyBody.innerHTML = `
            <div class="bulk-tag-history-empty">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                <p>Lỗi tải lịch sử: ${error.message}</p>
            </div>
        `;
    }
}

function renderBulkTagDeleteHistoryItem(entry, index) {
    const { dateFormatted, username, results, summary } = entry;

    let successHtml = '';
    if (results.success && results.success.length > 0) {
        successHtml = `
            <div class="bulk-tag-history-success">
                <div class="bulk-tag-history-success-title">
                    <i class="fas fa-check-circle"></i>
                    Xóa thành công (${summary.totalSuccess} đơn):
                </div>
                <div class="bulk-tag-history-tag-list">
                    ${results.success.map(r => `
                        <div class="bulk-tag-history-tag-item">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor || '#6b7280'}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${r.sttList.join(', ')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let failedHtml = '';
    if (results.failed && results.failed.length > 0) {
        failedHtml = `
            <div class="bulk-tag-history-failed">
                <div class="bulk-tag-history-failed-title">
                    <i class="fas fa-times-circle"></i>
                    Thất bại (${summary.totalFailed} đơn):
                </div>
                <div class="bulk-tag-history-tag-list">
                    ${results.failed.map(r => `
                        <div class="bulk-tag-history-tag-item failed">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor || '#6b7280'}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${r.sttList.join(', ')}</span>
                            <div class="fail-reason">→ ${r.reason}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    return `
        <div class="bulk-tag-history-item" id="bulkTagDeleteHistoryItem${index}">
            <div class="bulk-tag-history-header" onclick="toggleBulkTagDeleteHistoryItem(${index})">
                <div class="history-info">
                    <div class="history-time">
                        <i class="fas fa-clock"></i>
                        ${dateFormatted}
                    </div>
                    <div class="history-user">
                        <i class="fas fa-user"></i>
                        ${username || 'Unknown'}
                    </div>
                </div>
                <div class="history-summary">
                    <span class="success-count"><i class="fas fa-check"></i> ${summary.totalSuccess}</span>
                    <span class="failed-count"><i class="fas fa-times"></i> ${summary.totalFailed}</span>
                    <i class="fas fa-chevron-down expand-icon"></i>
                </div>
            </div>
            <div class="bulk-tag-history-body">
                ${successHtml}
                ${failedHtml}
            </div>
        </div>
    `;
}

function toggleBulkTagDeleteHistoryItem(index) {
    const item = document.getElementById(`bulkTagDeleteHistoryItem${index}`);
    if (item) {
        item.classList.toggle('expanded');
    }
}

function closeBulkTagDeleteHistoryModal() {
    document.getElementById('bulkTagDeleteHistoryModal').classList.remove('show');
}

// =====================================================
// EVENT LISTENER FOR DROPDOWN CLOSE
// =====================================================

document.addEventListener('click', function (event) {
    const searchWrapper = document.querySelector('.bulk-tag-search-wrapper');
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');

    if (searchWrapper && dropdown && !searchWrapper.contains(event.target)) {
        dropdown.classList.remove('show');
    }

    const deleteSearchWrapper = document.querySelector('#bulkTagDeleteModal .bulk-tag-search-wrapper');
    const deleteDropdown = document.getElementById('bulkTagDeleteModalSearchDropdown');

    if (deleteSearchWrapper && deleteDropdown && !deleteSearchWrapper.contains(event.target)) {
        deleteDropdown.classList.remove('show');
    }
});

// =====================================================
// EXPORTS
// =====================================================

// Bulk Tag Assign
window.parseBulkSTTInput = parseBulkSTTInput;
window.normalizePhoneForBulkTag = normalizePhoneForBulkTag;
window.saveBulkTagToLocalStorage = saveBulkTagToLocalStorage;
window.loadBulkTagFromLocalStorage = loadBulkTagFromLocalStorage;
window.clearBulkTagLocalStorage = clearBulkTagLocalStorage;
window.showBulkTagModal = showBulkTagModal;
window.closeBulkTagModal = closeBulkTagModal;
window.loadBulkTagModalOptions = loadBulkTagModalOptions;
window.populateBulkTagModalDropdown = populateBulkTagModalDropdown;
window.showBulkTagModalDropdown = showBulkTagModalDropdown;
window.refreshBulkTagModalDropdown = refreshBulkTagModalDropdown;
window.filterBulkTagModalOptions = filterBulkTagModalOptions;
window.handleBulkTagModalSearchKeydown = handleBulkTagModalSearchKeydown;
window.autoCreateAndAddTagToBulkModal = autoCreateAndAddTagToBulkModal;
window.addTagToBulkTagModal = addTagToBulkTagModal;
window.removeTagFromBulkTagModal = removeTagFromBulkTagModal;
window.clearAllBulkTagRows = clearAllBulkTagRows;
window.updateBulkTagModalRowCount = updateBulkTagModalRowCount;
window.toggleBulkTagSelectAll = toggleBulkTagSelectAll;
window.toggleBulkTagRowSelection = toggleBulkTagRowSelection;
window.updateSelectAllCheckbox = updateSelectAllCheckbox;
window.addSTTToBulkTagRow = addSTTToBulkTagRow;
window.handleBulkTagSTTInputKeydown = handleBulkTagSTTInputKeydown;
window.removeSTTFromBulkTagRow = removeSTTFromBulkTagRow;
window.updateBulkTagModalTable = updateBulkTagModalTable;
window.executeBulkTagModalAssignment = executeBulkTagModalAssignment;
window.saveBulkTagHistory = saveBulkTagHistory;
window.showBulkTagResultModal = showBulkTagResultModal;
window.closeBulkTagResultModal = closeBulkTagResultModal;
window.showBulkTagHistoryModal = showBulkTagHistoryModal;
window.renderBulkTagHistoryItem = renderBulkTagHistoryItem;
window.toggleBulkTagHistoryItem = toggleBulkTagHistoryItem;
window.closeBulkTagHistoryModal = closeBulkTagHistoryModal;

// Bulk Tag Delete
window.saveBulkTagDeleteToLocalStorage = saveBulkTagDeleteToLocalStorage;
window.loadBulkTagDeleteFromLocalStorage = loadBulkTagDeleteFromLocalStorage;
window.clearBulkTagDeleteLocalStorage = clearBulkTagDeleteLocalStorage;
window.showBulkTagDeleteModal = showBulkTagDeleteModal;
window.closeBulkTagDeleteModal = closeBulkTagDeleteModal;
window.loadBulkTagDeleteModalOptions = loadBulkTagDeleteModalOptions;
window.populateBulkTagDeleteModalDropdown = populateBulkTagDeleteModalDropdown;
window.showBulkTagDeleteModalDropdown = showBulkTagDeleteModalDropdown;
window.refreshBulkTagDeleteModalDropdown = refreshBulkTagDeleteModalDropdown;
window.filterBulkTagDeleteModalOptions = filterBulkTagDeleteModalOptions;
window.handleBulkTagDeleteModalSearchKeydown = handleBulkTagDeleteModalSearchKeydown;
window.addTagToBulkTagDeleteModal = addTagToBulkTagDeleteModal;
window.removeTagFromBulkTagDeleteModal = removeTagFromBulkTagDeleteModal;
window.clearAllBulkTagDeleteRows = clearAllBulkTagDeleteRows;
window.updateBulkTagDeleteModalRowCount = updateBulkTagDeleteModalRowCount;
window.toggleBulkTagDeleteSelectAll = toggleBulkTagDeleteSelectAll;
window.toggleBulkTagDeleteRowSelection = toggleBulkTagDeleteRowSelection;
window.updateBulkTagDeleteSelectAllCheckbox = updateBulkTagDeleteSelectAllCheckbox;
window.addSTTToBulkTagDeleteRow = addSTTToBulkTagDeleteRow;
window.handleBulkTagDeleteSTTInputKeydown = handleBulkTagDeleteSTTInputKeydown;
window.removeSTTFromBulkTagDeleteRow = removeSTTFromBulkTagDeleteRow;
window.updateBulkTagDeleteModalTable = updateBulkTagDeleteModalTable;
window.executeBulkTagDeleteModalRemoval = executeBulkTagDeleteModalRemoval;
window.saveBulkTagDeleteHistory = saveBulkTagDeleteHistory;
window.showBulkTagDeleteResultModal = showBulkTagDeleteResultModal;
window.closeBulkTagDeleteResultModal = closeBulkTagDeleteResultModal;
window.showBulkTagDeleteHistoryModal = showBulkTagDeleteHistoryModal;
window.renderBulkTagDeleteHistoryItem = renderBulkTagDeleteHistoryItem;
window.toggleBulkTagDeleteHistoryItem = toggleBulkTagDeleteHistoryItem;
window.closeBulkTagDeleteHistoryModal = closeBulkTagDeleteHistoryModal;

console.log('[TAB1-BULK-TAGS] Module loaded');
