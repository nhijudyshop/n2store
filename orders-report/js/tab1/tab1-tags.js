// #region ═══════════════════════════════════════════════════════════════════════
// ║                        SECTION 5: TAG MANAGEMENT                            ║
// ║                            search: #TAG                                     ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// TAG MANAGEMENT FUNCTIONS #TAG
// =====================================================

// Helper function to fetch all tags with pagination (TPOS max $top=1000)
async function fetchAllTagsWithPagination(headers) {
    const PAGE_SIZE = 1000;
    let allTags = [];
    let skip = 0;
    let totalCount = 0;

    // First request to get count and first batch
    const firstResponse = await API_CONFIG.smartFetch(
        `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$top=${PAGE_SIZE}&$skip=0&$count=true`,
        {
            method: "GET",
            headers: {
                ...headers,
                accept: "application/json",
                "content-type": "application/json",
            },
        },
    );

    if (!firstResponse.ok) {
        throw new Error(`HTTP ${firstResponse.status}`);
    }

    const firstData = await firstResponse.json();
    allTags = firstData.value || [];
    totalCount = firstData["@odata.count"] || allTags.length;

    console.log(`[TAG] First batch: ${allTags.length} tags, total count: ${totalCount}`);

    // If more tags exist, fetch remaining with pagination
    if (totalCount > PAGE_SIZE) {
        skip = PAGE_SIZE;

        while (skip < totalCount) {
            console.log(`[TAG] Fetching more tags with skip=${skip}...`);

            const response = await API_CONFIG.smartFetch(
                `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$top=${PAGE_SIZE}&$skip=${skip}&$count=true`,
                {
                    method: "GET",
                    headers: {
                        ...headers,
                        accept: "application/json",
                        "content-type": "application/json",
                    },
                },
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} at skip=${skip}`);
            }

            const data = await response.json();
            const batchTags = data.value || [];

            if (batchTags.length === 0) {
                break; // No more tags
            }

            allTags = allTags.concat(batchTags);
            skip += PAGE_SIZE;

            console.log(`[TAG] Fetched ${batchTags.length} more tags, total now: ${allTags.length}`);
        }
    }

    console.log(`[TAG] Pagination complete: ${allTags.length}/${totalCount} tags fetched`);
    return allTags;
}

async function loadAvailableTags() {
    try {
        const cached = window.cacheManager.get("tags", "tags");
        if (cached) {
            console.log("[TAG] Using cached tags");
            availableTags = cached;
            window.availableTags = availableTags; // Export to window
            populateTagFilter(); // Populate filter dropdown
            return;
        }

        console.log("[TAG] Loading tags from API...");
        const headers = await window.tokenManager.getAuthHeader();

        // Use pagination helper to fetch all tags
        availableTags = await fetchAllTagsWithPagination(headers);

        window.availableTags = availableTags; // Export to window
        window.cacheManager.set("tags", availableTags, "tags");
        console.log(`[TAG] Loaded ${availableTags.length} tags from API`);
        populateTagFilter(); // Populate filter dropdown
    } catch (error) {
        console.error("[TAG] Error loading tags:", error);
        availableTags = [];
        window.availableTags = availableTags; // Export to window
    }
}

async function refreshTags() {
    const btn = document.querySelector('.tag-btn-refresh');
    const icon = btn ? btn.querySelector('i') : null;

    try {
        if (btn) btn.disabled = true;
        if (icon) icon.classList.add('fa-spin');

        console.log("[TAG] Refreshing tags from TPOS...");
        const headers = await window.tokenManager.getAuthHeader();

        // Use pagination helper to fetch all tags (TPOS max $top=1000)
        const newTags = await fetchAllTagsWithPagination(headers);

        console.log(`[TAG] Fetched ${newTags.length} tags from TPOS`);

        // Save to Firebase
        if (database) {
            await database.ref('settings/tags').set(newTags);
            console.log('[TAG] Saved tags to Firebase settings/tags');
        }

        // Update local state
        availableTags = newTags;
        window.availableTags = availableTags;
        window.cacheManager.set("tags", availableTags, "tags");

        // Update UI
        populateTagFilter();

        // Clear search input and render full tag list
        const searchInput = document.getElementById("tagSearchInput");
        if (searchInput) {
            searchInput.value = "";
        }

        // Update current order tags with new tag info (if modal is open)
        if (currentOrderTags && currentOrderTags.length > 0) {
            currentOrderTags = currentOrderTags.map(selectedTag => {
                const updatedTag = newTags.find(t => t.Id === selectedTag.Id);
                return updatedTag ? { Id: updatedTag.Id, Name: updatedTag.Name, Color: updatedTag.Color } : selectedTag;
            });
            updateSelectedTagsDisplay();
        }

        // Render tag list without search filter
        renderTagList("");

        if (window.notificationManager) {
            window.notificationManager.success(`Đã cập nhật ${newTags.length} tags thành công!`);
        } else {
            alert(`✅ Đã cập nhật ${newTags.length} tags thành công!`);
        }

    } catch (error) {
        console.error("[TAG] Error refreshing tags:", error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi cập nhật tags: ${error.message}`);
        } else {
            alert(`❌ Lỗi cập nhật tags: ${error.message}`);
        }
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
    }
}

// Open Create Tag Modal
function openCreateTagModal() {
    const modal = document.getElementById('createTagModal');
    if (modal) {
        modal.style.display = 'flex';

        // Reset form
        document.getElementById('newTagName').value = '';
        document.getElementById('newTagColor').value = '#3b82f6';
        document.getElementById('newTagColorHex').value = '#3b82f6';
        document.getElementById('colorPreview').style.background = '#3b82f6';

        // Hide status message
        const status = document.getElementById('createTagStatus');
        if (status) {
            status.style.display = 'none';
        }

        // Setup color input sync (only once)
        const colorInput = document.getElementById('newTagColor');
        if (colorInput && !colorInput.dataset.listenerAdded) {
            colorInput.addEventListener('input', function () {
                const color = this.value;
                document.getElementById('newTagColorHex').value = color;
                document.getElementById('colorPreview').style.background = color;
            });
            colorInput.dataset.listenerAdded = 'true';
        }

        // Focus on name input
        setTimeout(() => {
            document.getElementById('newTagName').focus();
        }, 100);
    }
}

// Close Create Tag Modal
function closeCreateTagModal() {
    const modal = document.getElementById('createTagModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Generate Random Color for auto-create tag
function generateRandomColor() {
    const colors = [
        '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
        '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
        '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
        '#ec4899', '#f43f5e', '#78716c', '#737373', '#71717a'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Auto-create tag when search yields no results and user presses Enter
async function autoCreateAndAddTag(tagName) {
    if (!tagName || tagName.trim() === '') return;

    const name = tagName.trim().toUpperCase(); // Convert to uppercase for consistency
    const color = generateRandomColor();

    try {
        // Show loading notification
        if (window.notificationManager) {
            window.notificationManager.info(`Đang tạo tag "${name}"...`);
        }

        console.log('[AUTO-CREATE-TAG] Creating tag:', { name, color });

        // Get auth headers
        const headers = await window.tokenManager.getAuthHeader();

        // Create tag via API
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
        console.log('[AUTO-CREATE-TAG] Tag created successfully:', newTag);

        // Remove @odata.context from newTag (Firebase doesn't allow keys with dots)
        if (newTag['@odata.context']) {
            delete newTag['@odata.context'];
        }

        // Update local tags list
        if (Array.isArray(availableTags)) {
            availableTags.push(newTag);
            window.availableTags = availableTags;
            window.cacheManager.set("tags", availableTags, "tags");
        }

        // Save to Firebase
        if (database) {
            await database.ref('settings/tags').set(availableTags);
            console.log('[AUTO-CREATE-TAG] Saved updated tags to Firebase');
        }

        // Update filter dropdowns
        populateTagFilter();

        // Add the new tag to current selection
        currentOrderTags.push({
            Id: newTag.Id,
            Name: newTag.Name,
            Color: newTag.Color
        });

        // Clear search input and update UI
        const searchInput = document.getElementById("tagSearchInput");
        if (searchInput) {
            searchInput.value = "";
        }
        updateSelectedTagsDisplay();
        renderTagList("");

        // Show success notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã tạo và thêm tag "${name}"!`);
        }

        console.log('[AUTO-CREATE-TAG] Tag added to order selection');

    } catch (error) {
        console.error('[AUTO-CREATE-TAG] Error creating tag:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi tạo tag: ' + error.message);
        }
    }
}

// =====================================================
// QUICK TAG FEATURE - Load user identifier and quick assign
// =====================================================

/**
 * Load current user identifier from Firestore
 */
async function loadCurrentUserIdentifier() {
    try {
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        if (!auth || !auth.username) {
            console.warn('[QUICK-TAG] No auth or username available');
            return;
        }

        // Get Firestore instance
        const db = firebase.firestore();
        if (!db) {
            console.warn('[QUICK-TAG] Firestore not available');
            return;
        }

        // Load user data from Firestore
        const userDoc = await db.collection('users').doc(auth.username).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            currentUserIdentifier = userData.identifier || null;
            console.log('[QUICK-TAG] Loaded user identifier:', currentUserIdentifier);
        } else {
            console.warn('[QUICK-TAG] User document not found:', auth.username);
        }
    } catch (error) {
        console.error('[QUICK-TAG] Error loading user identifier:', error);
    }
}

/**
 * Quick assign tag to order
 * @param {string} orderId - Order ID
 * @param {string} orderCode - Order code for display
 * @param {string} tagPrefix - Tag prefix ("xử lý" or "ok")
 */
async function quickAssignTag(orderId, orderCode, tagPrefix) {
    // Check if identifier is loaded
    if (!currentUserIdentifier) {
        if (window.notificationManager) {
            window.notificationManager.warning('Chưa có tên định danh. Vui lòng cập nhật trong Quản lý User.');
        }
        return;
    }

    const tagName = `${tagPrefix} ${currentUserIdentifier}`.toUpperCase();

    try {
        // Show loading
        if (window.notificationManager) {
            window.notificationManager.info(`Đang gán tag "${tagName}"...`);
        }

        // Check if tag exists in availableTags
        let existingTag = availableTags.find(t => t.Name.toUpperCase() === tagName);

        // If tag doesn't exist in local cache, fetch ALL tags from API using pagination
        if (!existingTag) {
            console.log('[QUICK-TAG] Tag not found in local cache, fetching ALL tags from API with pagination...');
            const headers = await window.tokenManager.getAuthHeader();

            // Use pagination helper to fetch ALL tags (TPOS max $top=1000)
            try {
                availableTags = await fetchAllTagsWithPagination(headers);
                window.availableTags = availableTags;
                window.cacheManager.set("tags", availableTags, "tags");
                console.log(`[QUICK-TAG] Refreshed ${availableTags.length} tags from API (with pagination)`);

                // Check again after refresh
                existingTag = availableTags.find(t => t.Name.toUpperCase() === tagName);
                if (existingTag) {
                    console.log('[QUICK-TAG] Found tag after refresh:', existingTag.Name);
                }
            } catch (fetchError) {
                console.warn('[QUICK-TAG] Failed to fetch fresh tags:', fetchError);
            }
        }

        // If tag still doesn't exist after refresh, create it
        if (!existingTag) {
            console.log('[QUICK-TAG] Tag not found after refresh, creating:', tagName);
            const color = generateRandomColor();
            const headers = await window.tokenManager.getAuthHeader();

            const createResponse = await API_CONFIG.smartFetch(
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
                {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'accept': 'application/json, text/plain, */*',
                        'content-type': 'application/json;charset=UTF-8',
                    },
                    body: JSON.stringify({
                        Name: tagName,
                        Color: color
                    })
                }
            );

            if (!createResponse.ok) {
                // Handle "tag already exists" error (400) - fetch fresh and find the tag
                if (createResponse.status === 400) {
                    console.log('[QUICK-TAG] Create returned 400 (tag may already exist), fetching fresh tags...');
                    try {
                        const freshHeaders = await window.tokenManager.getAuthHeader();
                        availableTags = await fetchAllTagsWithPagination(freshHeaders);
                        window.availableTags = availableTags;
                        window.cacheManager.set("tags", availableTags, "tags");

                        existingTag = availableTags.find(t => t.Name.toUpperCase() === tagName);
                        if (existingTag) {
                            console.log('[QUICK-TAG] Found existing tag after 400 error:', existingTag.Name);
                        } else {
                            throw new Error(`Tag "${tagName}" đã tồn tại nhưng không tìm thấy trong hệ thống`);
                        }
                    } catch (fetchError) {
                        console.error('[QUICK-TAG] Failed to recover from 400 error:', fetchError);
                        throw new Error(`Lỗi tạo tag: ${createResponse.status} - Tag có thể đã tồn tại`);
                    }
                } else {
                    throw new Error(`Lỗi tạo tag: ${createResponse.status}`);
                }
            } else {
                existingTag = await createResponse.json();

                // Remove @odata.context
                if (existingTag['@odata.context']) {
                    delete existingTag['@odata.context'];
                }

                // Update local tags list
                availableTags.push(existingTag);
                window.availableTags = availableTags;
                window.cacheManager.set("tags", availableTags, "tags");

                // Save to Firebase
                if (database) {
                    await database.ref('settings/tags').set(availableTags);
                }

                // Update dropdowns
                populateTagFilter();

                console.log('[QUICK-TAG] Created new tag:', existingTag);
            }
        }

        // Get current order from data - O(1) via OrderStore with fallback
        const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
        if (!order) {
            throw new Error('Không tìm thấy đơn hàng');
        }

        // Parse existing tags
        let orderTags = [];
        try {
            if (order.Tags) {
                orderTags = JSON.parse(order.Tags);
                if (!Array.isArray(orderTags)) orderTags = [];
            }
        } catch (e) {
            orderTags = [];
        }

        // Remove opposite tag if exists (xử lý <-> ok)
        const oppositePrefix = tagPrefix.toLowerCase() === 'xử lý' ? 'OK' : 'XỬ LÝ';
        const oppositeTagName = `${oppositePrefix} ${currentUserIdentifier}`.toUpperCase();
        const oppositeTagIndex = orderTags.findIndex(t => t.Name && t.Name.toUpperCase() === oppositeTagName);

        if (oppositeTagIndex !== -1) {
            const removedTag = orderTags[oppositeTagIndex];
            orderTags.splice(oppositeTagIndex, 1);
            console.log('[QUICK-TAG] Removed opposite tag:', removedTag.Name);
        }

        // Check if tag already assigned
        if (orderTags.some(t => t.Id === existingTag.Id)) {
            if (window.notificationManager) {
                window.notificationManager.info(`Tag "${tagName}" đã được gán cho đơn này rồi.`);
            }
            return;
        }

        // Add new tag to order tags
        orderTags.push({
            Id: existingTag.Id,
            Name: existingTag.Name,
            Color: existingTag.Color
        });

        // Assign tag via API
        const headers = await window.tokenManager.getAuthHeader();
        const assignResponse = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    Tags: orderTags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                    OrderId: orderId
                })
            }
        );

        if (!assignResponse.ok) {
            throw new Error(`Lỗi gán tag: ${assignResponse.status}`);
        }

        // Update order in table
        const updatedData = { Tags: JSON.stringify(orderTags) };
        updateOrderInTable(orderId, updatedData);

        // Emit Firebase realtime update
        await emitTagUpdateToFirebase(orderId, orderTags);

        // Clear cache
        window.cacheManager.clear("orders");

        // Success notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã gán tag "${tagName}" cho đơn ${orderCode}!`, 2000);
        }

        console.log('[QUICK-TAG] Tag assigned successfully:', tagName, 'to order:', orderCode);

    } catch (error) {
        console.error('[QUICK-TAG] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`);
        }
    }
}

/**
 * Quick remove tag from order
 * @param {string} orderId - Order ID
 * @param {string} orderCode - Order code for display
 * @param {string} tagId - Tag ID to remove
 */
async function quickRemoveTag(orderId, orderCode, tagId) {
    try {
        console.log('[QUICK-TAG] Removing tag:', { orderId, orderCode, tagId });

        // Get current order from data - O(1) via OrderStore with fallback
        const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
        if (!order) {
            throw new Error('Không tìm thấy đơn hàng');
        }

        // Parse existing tags
        let orderTags = [];
        try {
            if (order.Tags) {
                orderTags = JSON.parse(order.Tags);
                if (!Array.isArray(orderTags)) orderTags = [];
            }
        } catch (e) {
            orderTags = [];
        }

        console.log('[QUICK-TAG] Current tags:', orderTags);

        // Find tag to remove (compare as string to handle both number and string IDs)
        const tagIdStr = String(tagId);
        const tagToRemove = orderTags.find(t => String(t.Id) === tagIdStr);
        if (!tagToRemove) {
            console.warn('[QUICK-TAG] Tag not found in order:', tagId, 'Available:', orderTags.map(t => t.Id));
            return;
        }

        // Remove tag from list
        orderTags = orderTags.filter(t => String(t.Id) !== tagIdStr);

        // Show loading
        if (window.notificationManager) {
            window.notificationManager.info(`Đang xóa tag "${tagToRemove.Name}"...`);
        }

        // Assign updated tags via API
        const headers = await window.tokenManager.getAuthHeader();
        const assignResponse = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    Tags: orderTags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                    OrderId: orderId
                })
            }
        );

        if (!assignResponse.ok) {
            throw new Error(`Lỗi xóa tag: ${assignResponse.status}`);
        }

        // Update order in table
        const updatedData = { Tags: JSON.stringify(orderTags) };
        updateOrderInTable(orderId, updatedData);

        // Emit Firebase realtime update
        await emitTagUpdateToFirebase(orderId, orderTags);

        // Clear cache
        window.cacheManager.clear("orders");

        // Success notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã xóa tag "${tagToRemove.Name}" khỏi đơn ${orderCode}!`, 2000);
        }

        console.log('[QUICK-TAG] Tag removed successfully:', tagToRemove.Name, 'from order:', orderCode);

    } catch (error) {
        console.error('[QUICK-TAG] Error removing tag:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`);
        }
    }
}

// Update Color Preview
function updateColorPreview() {
    const hexInput = document.getElementById('newTagColorHex');
    const colorInput = document.getElementById('newTagColor');
    const preview = document.getElementById('colorPreview');

    let hex = hexInput.value.trim();

    // Add # if missing
    if (hex && !hex.startsWith('#')) {
        hex = '#' + hex;
    }

    // Validate hex color (3 or 6 digits)
    const validHex = /^#([0-9A-F]{3}){1,2}$/i.test(hex);

    if (validHex) {
        colorInput.value = hex;
        preview.style.background = hex;
        hexInput.style.borderColor = '#d1d5db';
    } else if (hex === '#') {
        // Just started typing
        hexInput.style.borderColor = '#d1d5db';
    } else {
        // Invalid hex
        hexInput.style.borderColor = '#ef4444';
    }
}

// Select Preset Color
function selectPresetColor(color) {
    document.getElementById('newTagColor').value = color;
    document.getElementById('newTagColorHex').value = color;
    document.getElementById('colorPreview').style.background = color;
}

// Create New Tag
async function createNewTag() {
    const nameInput = document.getElementById('newTagName');
    const colorInput = document.getElementById('newTagColor');
    const statusDiv = document.getElementById('createTagStatus');
    const createBtn = document.getElementById('createTagBtn');

    const name = nameInput.value.trim();
    const color = colorInput.value;

    // Validate
    if (!name) {
        statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Vui lòng nhập tên tag';
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fef3c7';
        statusDiv.style.color = '#92400e';
        nameInput.focus();
        return;
    }

    // Validate color
    const validHex = /^#([0-9A-F]{3}){1,2}$/i.test(color);
    if (!validHex) {
        statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Màu không hợp lệ';
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fef3c7';
        statusDiv.style.color = '#92400e';
        return;
    }

    try {
        // Disable button
        createBtn.disabled = true;
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';

        // Show loading status
        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo tag...';
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#dbeafe';
        statusDiv.style.color = '#1e40af';

        console.log('[CREATE-TAG] Creating tag:', { name, color });

        // Get auth headers
        const headers = await window.tokenManager.getAuthHeader();

        // Create tag via API (through Cloudflare proxy)
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
        console.log('[CREATE-TAG] Tag created successfully:', newTag);

        // Remove @odata.context from newTag (Firebase doesn't allow keys with dots)
        if (newTag['@odata.context']) {
            delete newTag['@odata.context'];
            console.log('[CREATE-TAG] Removed @odata.context from newTag');
        }

        // Show success status
        statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Tạo tag thành công!';
        statusDiv.style.background = '#d1fae5';
        statusDiv.style.color = '#065f46';

        // Update local tags list
        if (Array.isArray(availableTags)) {
            availableTags.push(newTag);
            window.availableTags = availableTags;
            window.cacheManager.set("tags", availableTags, "tags");
        }

        // Save to Firebase
        if (database) {
            await database.ref('settings/tags').set(availableTags);
            console.log('[CREATE-TAG] Saved updated tags to Firebase');
        }

        // Update UI
        populateTagFilter();

        // Clear search and render updated tag list
        const searchInput = document.getElementById("tagSearchInput");
        if (searchInput) {
            searchInput.value = "";
        }
        renderTagList("");

        // Show notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã tạo tag "${name}" thành công!`);
        }

        // Close modal after 1 second
        setTimeout(() => {
            closeCreateTagModal();
        }, 1000);

    } catch (error) {
        console.error('[CREATE-TAG] Error creating tag:', error);
        statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Lỗi: ' + error.message;
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fee2e2';
        statusDiv.style.color = '#991b1b';

        if (window.notificationManager) {
            window.notificationManager.error('Lỗi tạo tag: ' + error.message);
        }
    } finally {
        // Re-enable button
        createBtn.disabled = false;
        createBtn.innerHTML = '<i class="fas fa-check"></i> Tạo tag';
    }
}

function populateTagFilter() {
    // Call the inline script function if available
    if (typeof populateTagFilterOptions === 'function') {
        populateTagFilterOptions();
    }
    // Update excluded tags display on main page
    if (typeof updateExcludedTagsMainDisplay === 'function') {
        updateExcludedTagsMainDisplay();
    }
    console.log('[TAG-FILTER] populateTagFilter called');
}

function openTagModal(orderId, orderCode) {
    currentEditingOrderId = orderId;
    // O(1) via OrderStore with fallback
    const order = window.OrderStore?.get(orderId) || allData.find((o) => o.Id === orderId);
    currentOrderTags = order && order.Tags ? JSON.parse(order.Tags) : [];

    renderTagList();
    updateSelectedTagsDisplay();
    document.getElementById("tagModal").classList.add("show");

    // Auto-refresh tags when modal opens
    refreshTags();

    // Focus on search input
    setTimeout(() => {
        document.getElementById("tagSearchInput").focus();
    }, 100);
}

function closeTagModal() {
    document.getElementById("tagModal").classList.remove("show");
    document.getElementById("tagSearchInput").value = "";
    currentEditingOrderId = null;
    currentOrderTags = [];
    pendingDeleteTagIndex = -1;
}

function renderTagList(searchQuery = "") {
    const tagList = document.getElementById("tagList");
    if (availableTags.length === 0) {
        tagList.innerHTML = `<div class="no-tags-message"><i class="fas fa-exclamation-circle"></i><p>Không có tag nào</p></div>`;
        return;
    }

    // Filter out selected tags and apply search query
    const filteredTags = availableTags.filter((tag) => {
        // Don't show already selected tags
        const isSelected = currentOrderTags.some((t) => t.Id === tag.Id);
        if (isSelected) return false;

        // Apply search filter
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            tag.Name.toLowerCase().includes(query) ||
            tag.NameNosign.toLowerCase().includes(query)
        );
    });

    if (filteredTags.length === 0) {
        tagList.innerHTML = `<div class="no-tags-message"><i class="fas fa-search"></i><p>Không tìm thấy tag phù hợp</p></div>`;
        return;
    }

    tagList.innerHTML = filteredTags
        .map((tag, index) => {
            const isFirstItem = index === 0;
            return `
            <div class="tag-dropdown-item ${isFirstItem ? 'highlighted' : ''}" onclick="toggleTag(${tag.Id})" data-tag-id="${tag.Id}">
                <div class="tag-item-name">${tag.Name}</div>
            </div>`;
        })
        .join("");
}

function toggleTag(tagId) {
    const tag = availableTags.find((t) => t.Id === tagId);
    if (!tag) return;

    const existingIndex = currentOrderTags.findIndex((t) => t.Id === tagId);
    if (existingIndex >= 0) {
        currentOrderTags.splice(existingIndex, 1);
    } else {
        currentOrderTags.push({ Id: tag.Id, Name: tag.Name, Color: tag.Color });
    }

    updateSelectedTagsDisplay();
    renderTagList(document.getElementById("tagSearchInput").value);
}

function updateSelectedTagsDisplay() {
    const container = document.getElementById("selectedTagsPills");
    if (currentOrderTags.length === 0) {
        container.innerHTML = '';
        pendingDeleteTagIndex = -1;
        return;
    }
    container.innerHTML = currentOrderTags
        .map(
            (tag, index) => {
                const isPendingDelete = index === pendingDeleteTagIndex;
                const bgColor = isPendingDelete ? '#ef4444' : '#3b82f6'; // Red if pending delete, blue otherwise
                return `
        <span class="selected-tag-pill ${isPendingDelete ? 'deletion-pending' : ''}" style="background-color: ${bgColor}" data-tag-index="${index}">
            ${tag.Name}
            <button class="selected-tag-remove" onclick="event.stopPropagation(); removeTag(${index})" title="Xóa tag">
                ✕
            </button>
        </span>`;
            }
        )
        .join("");
}

function filterTags() {
    renderTagList(document.getElementById("tagSearchInput").value);
}

function removeTag(index) {
    if (index >= 0 && index < currentOrderTags.length) {
        currentOrderTags.splice(index, 1);
        pendingDeleteTagIndex = -1;
        updateSelectedTagsDisplay();
        renderTagList(document.getElementById("tagSearchInput").value);
    }
}

function handleTagInputKeydown(event) {
    const inputValue = document.getElementById("tagSearchInput").value;

    if (event.key === 'Enter') {
        event.preventDefault();

        // Find the highlighted tag (first one in the list)
        const highlightedTag = document.querySelector('.tag-dropdown-item.highlighted');
        if (highlightedTag) {
            const tagId = highlightedTag.getAttribute('data-tag-id');
            if (tagId) {
                toggleTag(parseInt(tagId));
                // Clear search input after selecting
                document.getElementById("tagSearchInput").value = "";
                // Re-render to show all available tags again
                renderTagList("");
                pendingDeleteTagIndex = -1;
            }
        } else if (inputValue.trim() !== '') {
            // No matching tag found - auto-create new tag with the search term
            autoCreateAndAddTag(inputValue);
        }
    } else if (event.key === 'Backspace' && inputValue === '') {
        event.preventDefault();

        if (currentOrderTags.length === 0) return;

        if (pendingDeleteTagIndex >= 0) {
            // Second backspace - delete the tag
            removeTag(pendingDeleteTagIndex);
        } else {
            // First backspace - mark last tag for deletion
            pendingDeleteTagIndex = currentOrderTags.length - 1;
            updateSelectedTagsDisplay();
        }
    } else {
        // Any other key resets the pending delete
        if (pendingDeleteTagIndex >= 0) {
            pendingDeleteTagIndex = -1;
            updateSelectedTagsDisplay();
        }
    }
}

function toggleQuickAccess(tagName, buttonElement) {
    if (!window.quickTagManager) {
        console.error('[TAG] Quick tag manager not available');
        return;
    }

    const isActive = window.quickTagManager.toggleQuickTag(tagName);

    // Update button state
    if (isActive) {
        buttonElement.classList.add('active');
        buttonElement.title = 'Bỏ khỏi chọn nhanh';
        if (window.notificationManager) {
            window.notificationManager.show(`⭐ Đã thêm "${tagName}" vào chọn nhanh`, 'success');
        }
    } else {
        buttonElement.classList.remove('active');
        buttonElement.title = 'Thêm vào chọn nhanh';
        if (window.notificationManager) {
            window.notificationManager.show(`Đã bỏ "${tagName}" khỏi chọn nhanh`, 'info');
        }
    }

    console.log(`[TAG] Quick access toggled for "${tagName}": ${isActive ? 'ADDED' : 'REMOVED'}`);
}

async function saveOrderTags() {
    if (!currentEditingOrderId) return;
    try {
        showLoading(true);
        const payload = {
            Tags: currentOrderTags.map((tag) => ({
                Id: tag.Id,
                Color: tag.Color,
                Name: tag.Name,
            })),
            OrderId: currentEditingOrderId,
        };
        const headers = await window.tokenManager.getAuthHeader();
        const response = await API_CONFIG.smartFetch(
            "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
            {
                method: "POST",
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(payload),
            },
        );
        if (!response.ok)
            throw new Error(
                `HTTP ${response.status}: ${await response.text()}`,
            );

        // 🔄 Cập nhật tags trong data
        const updatedData = { Tags: JSON.stringify(currentOrderTags) };
        updateOrderInTable(currentEditingOrderId, updatedData);

        // 🔥 Emit TAG update to Firebase for realtime sync
        await emitTagUpdateToFirebase(currentEditingOrderId, currentOrderTags);

        window.cacheManager.clear("orders");
        showLoading(false);
        closeTagModal();

        if (window.notificationManager) {
            window.notificationManager.success(
                `Đã gán ${currentOrderTags.length} tag cho đơn hàng thành công!`,
                2000
            );
        } else {
            showInfoBanner(
                `✅ Đã gán ${currentOrderTags.length} tag cho đơn hàng thành công!`,
            );
        }
    } catch (error) {
        console.error("[TAG] Error saving tags:", error);
        showLoading(false);

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi khi lưu tag: ${error.message}`, 4000);
        } else {
            alert(`Lỗi khi lưu tag:\n${error.message}`);
        }
    }
}

