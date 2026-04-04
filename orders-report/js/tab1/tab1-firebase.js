// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// #region ═══════════════════════════════════════════════════════════════════════
// ║                   SECTION 2: FIREBASE & REALTIME TAG SYNC                   ║
// ║                            search: #FIREBASE                                ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// FIREBASE DATABASE REFERENCE FOR NOTE TRACKING #FIREBASE
// =====================================================
// Note: Firebase is already initialized in config.js which loads before this file
let database = null;
try {
    database = firebase.database();
} catch (error) {
    console.error('[NOTE-TRACKER] Firebase Realtime Database reference error:', error);
}

// Firestore reference for settings migration (employee_ranges, campaigns, etc.)
let firestoreDb = null;
try {
    firestoreDb = firebase.firestore();
    window.firestoreDb = firestoreDb; // Expose globally for debugging
} catch (error) {
    console.error('[TAB1] Firestore reference error:', error);
}

// =====================================================
// FILTER PREFERENCES - Firebase Sync #FIREBASE
// =====================================================

/**
 * Get current user ID for filter preferences (per-user storage)
 * @returns {string} - User ID from Firebase auth or localStorage fallback
 */
function getFilterPrefsUserId() {
    // Try to get from Firebase auth
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        return firebase.auth().currentUser.uid;
    }
    // Try to get from window.campaignManager (initialized in HTML)
    if (window.campaignManager && window.campaignManager.currentUserId) {
        return window.campaignManager.currentUserId;
    }
    // Fallback to localStorage
    let userId = localStorage.getItem('orders_campaign_user_id');
    if (!userId) {
        userId = 'user_' + Date.now();
        localStorage.setItem('orders_campaign_user_id', userId);
    }
    return userId;
}

/**
 * Get filter preferences Firebase path for current user
 * @returns {string} - Firebase path like "user_preferences/{userId}/filter_preferences"
 */
function getFilterPrefsPath() {
    const userId = getFilterPrefsUserId();
    return `user_preferences/${userId}/filter_preferences`;
}

/**
 * [DEPRECATED] Save filter preferences to Firebase (per-user)
 * Dates are now stored in campaign objects directly.
 * This function is kept as a no-op stub for backward compatibility.
 */
async function saveFilterPreferencesToFirebase(prefs) {
    // No-op: Dates are now stored in campaign objects
    return;
}

/**
 * [DEPRECATED] Load filter preferences from Firebase (per-user)
 * Dates are now loaded from campaign objects directly.
 * This function is kept as a no-op stub for backward compatibility.
 */
async function loadFilterPreferencesFromFirebase() {
    // No-op: Dates are now loaded from campaign objects
    return null;
}

// =====================================================
// REALTIME TAG SYNC - Firebase & WebSocket #FIREBASE
// =====================================================
let tagListenersSetup = false; // Flag to prevent duplicate listener setup

/**
 * Emit TAG update to Firebase for realtime sync across users
 */
async function emitTagUpdateToFirebase(orderId, tags) {
    if (!database) {
        console.warn('[TAG-REALTIME] Firebase not available, skipping emit');
        return;
    }

    try {
        // Get current order data - O(1) via OrderStore with fallback
        const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
        if (!order) {
            console.warn('[TAG-REALTIME] Order not found in allData:', orderId);
            return;
        }

        // Get current user display name from authManager
        let userName = 'Unknown User';
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        if (auth && auth.displayName) {
            userName = auth.displayName;
        }

        // ✅ Validate and normalize tags array
        const normalizedTags = Array.isArray(tags) ? tags : [];

        // Emit to Firebase
        const updateData = {
            orderId: orderId,
            orderCode: order.Code || 'Unknown',
            STT: order.SessionIndex || 0,
            tags: normalizedTags, // Array of tag objects (can be empty array)
            updatedBy: userName,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        // Write to Firebase path: /tag_updates/{orderId}
        const refPath = `tag_updates/${orderId}`;
        await database.ref(refPath).set(updateData);

    } catch (error) {
        console.error('[TAG-REALTIME] ❌ Error emitting tag update:', error);
        console.error('[TAG-REALTIME] Error stack:', error.stack);
    }
}

/**
 * Setup Firebase & WebSocket listeners for realtime TAG updates
 */
function setupTagRealtimeListeners() {
    // Prevent duplicate setup
    if (tagListenersSetup) {
        return;
    }

    // 1. Setup Firebase listener
    if (database) {
        const refPath = `tag_updates`;
        // ═══════════════════════════════════════════════════════════════════
        // PHASE D: startAt(now) - Chỉ lắng nghe updates MỚI từ thời điểm này
        // Không tải toàn bộ lịch sử tag_updates cũ (có thể 10,000+ records)
        // ═══════════════════════════════════════════════════════════════════
        const startTime = Date.now();
        // Get current user name
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        const currentUserName = auth && auth.displayName ? auth.displayName : 'Unknown';
        // ═══════════════════════════════════════════════════════════════════
        // PHASE D: Query với orderByChild + startAt để chỉ nhận updates mới
        // ═══════════════════════════════════════════════════════════════════
        const tagUpdatesRef = database.ref(refPath).orderByChild('timestamp').startAt(startTime);

        // Listen for tag updates (child_changed on existing entries)
        tagUpdatesRef.on('child_changed', (snapshot) => {
            const updateData = snapshot.val();
            // Only process if update is from another user
            if (updateData.updatedBy !== currentUserName) {
                handleRealtimeTagUpdate(updateData, 'firebase');
            } else {
            }
        });

        // Listen for NEW tag updates (child_added after startTime)
        // Nhờ startAt(startTime), Firebase chỉ gửi các entries mới
        tagUpdatesRef.on('child_added', (snapshot) => {
            const updateData = snapshot.val();
            // Only process if update is from another user
            if (updateData.updatedBy !== currentUserName) {
                handleRealtimeTagUpdate(updateData, 'firebase');
            } else {
            }
        });

        tagListenersSetup = true;
    }

    // 2. Setup WebSocket listener (for future backend support)
    window.addEventListener('realtimeOrderTagsUpdate', (event) => {
        const updateData = event.detail;
        handleRealtimeTagUpdate(updateData, 'websocket');
    });
}

/**
 * Handle realtime TAG update from Firebase or WebSocket
 */
function handleRealtimeTagUpdate(updateData, source) {
    const { orderId, orderCode, STT, tags, updatedBy } = updateData;

    // ✅ Validate tags - treat undefined/null as empty array for "delete all tags" case
    const normalizedTags = tags === undefined || tags === null ? [] : tags;
    if (!Array.isArray(normalizedTags)) {
        console.error('[TAG-REALTIME] Invalid tags data (not an array):', tags);
        console.error('[TAG-REALTIME] Full updateData:', updateData);
        return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE A OPTIMIZATION: Sử dụng OrderStore O(1) lookup thay vì findIndex
    // ═══════════════════════════════════════════════════════════════════

    // ✅ FIX SCROLL ISSUE: Check if order is in DISPLAYED data (after employee filter)
    // This prevents unnecessary re-renders for orders not in current user's view
    const orderInDisplayed = displayedData.find(o => o.Id === orderId);
    if (!orderInDisplayed) {
        // Still update OrderStore and allData silently for data consistency

        // Update via OrderStore O(1)
        if (window.OrderStore && window.OrderStore.isInitialized) {
            window.OrderStore.update(orderId, { Tags: JSON.stringify(normalizedTags) });
        } else {
            // Fallback to findIndex if OrderStore not ready
            const indexInAll = allData.findIndex(o => o.Id === orderId);
            if (indexInAll !== -1) {
                allData[indexInAll].Tags = JSON.stringify(normalizedTags);
            }
        }
        return;
    }

    // 🚨 CONFLICT RESOLUTION: Check if user is currently editing this order's tags
    if (currentEditingOrderId === orderId) {
        console.warn('[TAG-REALTIME] Conflict detected: User is editing this order!');

        // Close modal and show warning
        const modal = document.getElementById('tagModal');
        if (modal && modal.style.display !== 'none') {
            closeTagModal();
        }
    }

    // ✅ SIMPLIFIED: Always update TAG cell realtime (removed tag filter check)
    // updateTagCellOnly() only updates innerHTML of cell - NO scroll jump
    // Data arrays are updated inside updateTagCellOnly()
    updateTagCellOnly(orderId, orderCode, normalizedTags);
}

/**
 * Update only the TAG cell in DOM without re-rendering entire table
 * This preserves scroll position when realtime tag updates occur
 *
 * PHASE A OPTIMIZED: Sử dụng OrderStore O(1) thay vì 3x findIndex O(n)
 */
function updateTagCellOnly(orderId, orderCode, tags) {
    // 1. Update data arrays first
    const tagsJson = JSON.stringify(tags);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE A OPTIMIZATION: Sử dụng OrderStore O(1) lookup
    // Thay vì 3 lần findIndex O(n), chỉ cần 1 lần OrderStore.update O(1)
    // ═══════════════════════════════════════════════════════════════════

    if (window.OrderStore && window.OrderStore.isInitialized) {
        // O(1) update - cập nhật trong OrderStore
        window.OrderStore.update(orderId, { Tags: tagsJson });
    }

    // Vẫn cập nhật filteredData và displayedData vì chúng là các arrays riêng
    // (không share reference với OrderStore trong trường hợp filter đã tạo copies mới)
    const indexInFiltered = filteredData.findIndex(order => order.Id === orderId);
    if (indexInFiltered !== -1) {
        filteredData[indexInFiltered].Tags = tagsJson;
    }

    const indexInDisplayed = displayedData.findIndex(order => order.Id === orderId);
    if (indexInDisplayed !== -1) {
        displayedData[indexInDisplayed].Tags = tagsJson;
    }

    // 2. Find the row in DOM by checkbox value
    const checkbox = document.querySelector(`#tableBody input[type="checkbox"][value="${orderId}"]`);
    if (!checkbox) {
        // Order might be in employee section tables
        const allCheckboxes = document.querySelectorAll(`input[type="checkbox"][value="${orderId}"]`);
        if (allCheckboxes.length === 0) {
            return;
        }
    }

    const row = checkbox ? checkbox.closest('tr') : document.querySelector(`input[type="checkbox"][value="${orderId}"]`)?.closest('tr');
    if (!row) {
        return;
    }

    // 3. Find the TAG cell
    const tagCell = row.querySelector('td[data-column="tag"]');
    if (!tagCell) {
        return;
    }

    // 4. Generate new tag HTML
    const tagsHTML = parseOrderTags(tagsJson, orderId, orderCode);

    // 5. Update only the tag cell content (preserve buttons)
    tagCell.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
            <div style="display: flex; gap: 2px;">
                <button class="tag-icon-btn" onclick="openTagModal('${orderId}', '${orderCode}'); event.stopPropagation();" title="Quản lý tag" style="padding: 2px 6px;">
                    <i class="fas fa-tags"></i>
                </button>
                <button class="quick-tag-btn" onclick="quickAssignTag('${orderId}', '${orderCode}', 'xử lý'); event.stopPropagation();" title="Xử lý + định danh">
                    <i class="fas fa-clock"></i>
                </button>
                <button class="quick-tag-btn quick-tag-ok" onclick="quickAssignTag('${orderId}', '${orderCode}', 'ok'); event.stopPropagation();" title="OK + định danh">
                    <i class="fas fa-check"></i>
                </button>
            </div>
            ${tagsHTML}
        </div>
    `;

}

/**
 * Cleanup Firebase listeners when changing campaign
 */
function cleanupTagRealtimeListeners() {
    if (database) {
        const refPath = `tag_updates`;
        database.ref(refPath).off();
    }
}

/**
 * TEST FUNCTION - Check if TAG listeners are working
 * Call from Console: testTagListeners()
 */
window.testTagListeners = function () {
    const auth = window.authManager ? window.authManager.getAuthState() : null;
    const currentUser = auth && auth.displayName ? auth.displayName : 'Unknown';
    if (database) {
        // Add a one-time listener to test
        database.ref('tag_updates').once('value', (snapshot) => {
        });

        // Listen for any changes
        const testRef = database.ref('tag_updates');
        const testListener = (snapshot) => {
        };

        testRef.on('child_changed', testListener);
        // Cleanup after 30 seconds
        setTimeout(() => {
            testRef.off('child_changed', testListener);
        }, 30000);
    }

};

// =====================================================
// KPI BASE STATUS PRELOAD #FIREBASE
// =====================================================

/**
 * Preload KPI BASE status for all orders
 * This allows synchronous checking in createRowHTML
 */
async function preloadKPIBaseStatus() {
    if (!database) {
        console.warn('[KPI-BASE] Firebase database not available');
        return;
    }

    try {
        const snapshot = await database.ref('kpi_base').once('value');
        const allBases = snapshot.val() || {};

        // Clear and rebuild the cache
        ordersWithKPIBase.clear();
        for (const orderId in allBases) {
            ordersWithKPIBase.add(orderId);
        }

        // Re-render table if data is already loaded
        if (allData && allData.length > 0) {
            performTableSearch();
        }
    } catch (error) {
        console.error('[KPI-BASE] Error preloading BASE status:', error);
    }
}

/**
 * Setup realtime listener for KPI BASE changes
 */
function setupKPIBaseRealtimeListener() {
    if (!database) return;

    // Cleanup existing listener before setting up new one
    cleanupKPIBaseRealtimeListener();

    // Store reference for cleanup
    kpiBaseRef = database.ref('kpi_base');

    kpiBaseRef.on('child_added', (snapshot) => {
        const orderId = snapshot.key;
        ordersWithKPIBase.add(orderId);
        // Update the specific row if visible
        updateKPIBaseIndicator(orderId, true);
    });

    kpiBaseRef.on('child_removed', (snapshot) => {
        const orderId = snapshot.key;
        ordersWithKPIBase.delete(orderId);
        // Update the specific row if visible
        updateKPIBaseIndicator(orderId, false);
    });

}

/**
 * Update KPI BASE indicator for a specific order row
 */
function updateKPIBaseIndicator(orderId, hasBase) {
    // Find the row by order ID
    const checkbox = document.querySelector(`input[type="checkbox"][value="${orderId}"]`);
    if (!checkbox) return;

    const row = checkbox.closest('tr');
    if (!row) return;

    const sttCell = row.querySelector('td[data-column="stt"]');
    if (!sttCell) return;

    // Check if indicator already exists
    let indicator = sttCell.querySelector('.kpi-base-indicator');

    if (hasBase && !indicator) {
        // Add indicator
        const div = sttCell.querySelector('div') || sttCell;
        const indicatorEl = document.createElement('span');
        indicatorEl.className = 'kpi-base-indicator';
        indicatorEl.title = 'Đã lưu BASE tính KPI';
        indicatorEl.innerHTML = '<i class="fas fa-lock" style="color: #10b981; font-size: 10px;"></i>';
        indicatorEl.style.marginLeft = '4px';
        div.appendChild(indicatorEl);
    } else if (!hasBase && indicator) {
        // Remove indicator
        indicator.remove();
    }
}

// Store KPI Base reference for cleanup
let kpiBaseRef = null;

/**
 * Cleanup KPI Base realtime listeners to prevent memory leaks
 */
function cleanupKPIBaseRealtimeListener() {
    if (kpiBaseRef) {
        kpiBaseRef.off();
        kpiBaseRef = null;
    }
}

// Cleanup all Firebase listeners on page unload
window.addEventListener('beforeunload', () => {
    cleanupTagRealtimeListeners();
    cleanupKPIBaseRealtimeListener();
});

// Export cleanup function for external use
window.cleanupKPIBaseRealtimeListener = cleanupKPIBaseRealtimeListener;

