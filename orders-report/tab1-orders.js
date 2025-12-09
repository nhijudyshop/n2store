// =====================================================
// GLOBAL VARIABLES
// =====================================================

/**
 * Format time to Vietnam timezone (GMT+7) with relative display
 * @param {string|Date} dateInput - Date string or Date object (UTC or any timezone)
 * @param {boolean} showFullDate - If true, always show full date instead of relative time
 * @returns {string} Formatted time string in Vietnamese
 */
window.formatTimeVN = function (dateInput, showFullDate = false) {
    if (!dateInput) return '';

    // Parse input date
    let date;
    if (typeof dateInput === 'string') {
        // Handle ISO string without timezone (assume UTC)
        if (!dateInput.includes('Z') && !dateInput.includes('+') && !dateInput.includes('-', 10)) {
            date = new Date(dateInput + 'Z');
        } else {
            date = new Date(dateInput);
        }
    } else {
        date = new Date(dateInput);
    }

    if (isNaN(date.getTime())) return '';

    // Vietnam timezone offset: UTC+7
    const vnOffset = 7 * 60 * 60 * 1000; // 7 hours in milliseconds
    const vnDate = new Date(date.getTime() + vnOffset);

    // Current time in Vietnam
    const nowVN = new Date(Date.now() + vnOffset);

    // Calculate difference
    const diffMs = nowVN - vnDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Show relative time if not showFullDate and within 7 days
    if (!showFullDate) {
        if (diffMins < 0) return 'Vừa xong'; // Future time (clock sync issue)
        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 7) return `${diffDays} ngày trước`;
    }

    // Format full date in Vietnam timezone
    // Format: dd/MM/yyyy HH:mm
    const day = String(vnDate.getUTCDate()).padStart(2, '0');
    const month = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
    const year = vnDate.getUTCFullYear();
    const hours = String(vnDate.getUTCHours()).padStart(2, '0');
    const minutes = String(vnDate.getUTCMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// Global variables
let allData = [];
let filteredData = [];
let displayedData = [];
let currentPage = 1;
const itemsPerPage = 50;
let selectedOrderIds = new Set();
let isLoading = false;
let loadingAborted = false;
let employeeRanges = []; // Employee STT ranges

// Expose data for other modules
window.getAllOrders = () => allData;

// Search State
let searchQuery = "";
let searchTimeout = null;

// Tag Management State
let availableTags = [];
let currentEditingOrderId = null;

// Bulk Tag Assignment State
let bulkTagSTTSet = new Set(); // Set of STT numbers
let selectedBulkTagId = null;
let selectedBulkTagName = null;

// Edit Modal State
let currentEditOrderData = null;
let currentChatOrderDetails = [];
let currentChatOrderId = null;
let currentChatProductsRef = null;
let currentOrderTags = [];
let pendingDeleteTagIndex = -1; // Track which tag is pending deletion on backspace
let currentPastedImage = null; // Track pasted image for chat reply (deprecated - use array below)
let uploadedImagesData = []; // Track uploaded images data (array for multiple images)

// Purchase Comment Highlight State
window.purchaseCommentId = null; // Store the Facebook_CommentId from the order to highlight in comment modal
window.purchaseFacebookPostId = null; // Store Facebook_PostId
window.purchaseFacebookASUserId = null; // Store Facebook_ASUserId

// =====================================================
// FIREBASE DATABASE REFERENCE FOR NOTE TRACKING
// =====================================================
// Note: Firebase is already initialized in config.js which loads before this file
let database = null;
try {
    database = firebase.database();
    console.log('[NOTE-TRACKER] Firebase database reference obtained');
} catch (error) {
    console.error('[NOTE-TRACKER] Firebase database reference error:', error);
}

// =====================================================
// REALTIME TAG SYNC - Firebase & WebSocket
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
        // Get current order data
        const order = allData.find(o => o.Id === orderId);
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

        console.log('[TAG-REALTIME] Preparing to emit:', {
            orderId,
            orderCode: order.Code,
            STT: order.SessionIndex,
            tagsCount: normalizedTags.length,
            tags: normalizedTags,
            updatedBy: userName
        });

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

        console.log('[TAG-REALTIME] ✅ Tag update emitted successfully to Firebase:', refPath);
        console.log('[TAG-REALTIME] Data written:', updateData);
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
        console.log('[TAG-REALTIME] Listeners already setup, skipping...');
        return;
    }

    // 1. Setup Firebase listener
    if (database) {
        const refPath = `tag_updates`;
        console.log('[TAG-REALTIME] Setting up Firebase listener on:', refPath);

        // Get current user name
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        const currentUserName = auth && auth.displayName ? auth.displayName : 'Unknown';
        console.log('[TAG-REALTIME] Current user:', currentUserName);

        // Listen for tag updates
        database.ref(refPath).on('child_changed', (snapshot) => {
            const updateData = snapshot.val();
            console.log('[TAG-REALTIME] Firebase tag update received:', updateData);

            // Only process if update is from another user
            if (updateData.updatedBy !== currentUserName) {
                handleRealtimeTagUpdate(updateData, 'firebase');
            } else {
                console.log('[TAG-REALTIME] Skipping own update');
            }
        });

        database.ref(refPath).on('child_added', (snapshot) => {
            const updateData = snapshot.val();

            // Only process if timestamp is recent (within last 5 seconds)
            // This prevents showing notifications for old data when first connecting
            if (updateData.timestamp && (Date.now() - updateData.timestamp < 5000)) {
                console.log('[TAG-REALTIME] Firebase new tag update:', updateData);

                // Only process if update is from another user
                if (updateData.updatedBy !== currentUserName) {
                    handleRealtimeTagUpdate(updateData, 'firebase');
                } else {
                    console.log('[TAG-REALTIME] Skipping own update');
                }
            }
        });

        tagListenersSetup = true;
        console.log('[TAG-REALTIME] ✅ Firebase listeners setup complete');
    }

    // 2. Setup WebSocket listener (for future backend support)
    window.addEventListener('realtimeOrderTagsUpdate', (event) => {
        const updateData = event.detail;
        console.log('[TAG-REALTIME] WebSocket tag update received:', updateData);
        handleRealtimeTagUpdate(updateData, 'websocket');
    });
}

/**
 * Handle realtime TAG update from Firebase or WebSocket
 */
function handleRealtimeTagUpdate(updateData, source) {
    const { orderId, orderCode, STT, tags, updatedBy } = updateData;

    console.log(`[TAG-REALTIME] Processing update from ${source}:`, updateData);

    // ✅ Validate tags - treat undefined/null as empty array for "delete all tags" case
    const normalizedTags = tags === undefined || tags === null ? [] : tags;
    if (!Array.isArray(normalizedTags)) {
        console.error('[TAG-REALTIME] Invalid tags data (not an array):', tags);
        console.error('[TAG-REALTIME] Full updateData:', updateData);
        return;
    }

    console.log('[TAG-REALTIME] Normalized tags:', normalizedTags);

    // Check if this order is in current view
    const orderExists = allData.find(o => o.Id === orderId);
    if (!orderExists) {
        console.log('[TAG-REALTIME] Order not in current view, skipping update');
        return;
    }

    // 🚨 CONFLICT RESOLUTION: Check if user is currently editing this order's tags
    if (currentEditingOrderId === orderId) {
        console.warn('[TAG-REALTIME] Conflict detected: User is editing this order!');

        // Close modal and show warning
        const modal = document.getElementById('tagModal');
        if (modal && modal.style.display !== 'none') {
            closeTagModal();

            // DISABLED: Removed notification
            // if (window.notificationManager) {
            //     window.notificationManager.show(
            //         `⚠️ ${updatedBy} vừa cập nhật TAG cho đơn ${orderCode} (STT: ${STT}). Modal đã được đóng để tránh conflict.`,
            //         'warning',
            //         6000
            //     );
            // }
        }
    }

    // Update order in table (use normalizedTags)
    const updatedOrderData = { Tags: JSON.stringify(normalizedTags) };
    updateOrderInTable(orderId, updatedOrderData);

    // DISABLED: Removed notification
    // Show notification
    // const sourceIcon = source === 'firebase' ? '🔥' : '⚡';
    // let message;

    // if (normalizedTags.length === 0) {
    //     // Case: All tags removed
    //     message = `${sourceIcon} ${updatedBy} đã xóa hết TAG cho đơn ${orderCode} (STT: ${STT})`;
    // } else {
    //     // Case: Tags added/updated
    //     const tagNames = normalizedTags.map(t => t.Name).join(', ');
    //     message = `${sourceIcon} ${updatedBy} đã cập nhật TAG cho đơn ${orderCode} (STT: ${STT}): ${tagNames}`;
    // }

    // if (window.notificationManager) {
    //     window.notificationManager.show(message, 'info', 4000);
    // } else {
    //     console.log('[TAG-REALTIME] Notification:', message);
    // }
}

/**
 * Cleanup Firebase listeners when changing campaign
 */
function cleanupTagRealtimeListeners() {
    if (database) {
        const refPath = `tag_updates`;
        database.ref(refPath).off();
        console.log('[TAG-REALTIME] Cleaned up Firebase listeners for:', refPath);
    }
}

/**
 * TEST FUNCTION - Check if TAG listeners are working
 * Call from Console: testTagListeners()
 */
window.testTagListeners = function () {
    console.log('=== TAG REALTIME LISTENER TEST ===');
    console.log('1. Firebase:', database ? '✅ Available' : '❌ Not available');
    console.log('2. Listeners setup:', tagListenersSetup ? '✅ Yes' : '❌ No');

    const auth = window.authManager ? window.authManager.getAuthState() : null;
    const currentUser = auth && auth.displayName ? auth.displayName : 'Unknown';
    console.log('3. Current user:', currentUser);

    console.log('4. Orders loaded:', allData ? allData.length : 0);

    if (database) {
        console.log('\n🔥 Setting up test listener...');

        // Add a one-time listener to test
        database.ref('tag_updates').once('value', (snapshot) => {
            console.log('✅ Firebase connection working!');
            console.log('Total TAG updates in database:', snapshot.numChildren());
        });

        // Listen for any changes
        const testRef = database.ref('tag_updates');
        const testListener = (snapshot) => {
            console.log('🔥🔥🔥 FIREBASE EVENT TRIGGERED! 🔥🔥🔥');
            console.log('Event type: child_changed');
            console.log('Data:', snapshot.val());
        };

        testRef.on('child_changed', testListener);
        console.log('✅ Test listener attached');
        console.log('Now save a TAG and watch for 🔥 events...');

        // Cleanup after 30 seconds
        setTimeout(() => {
            testRef.off('child_changed', testListener);
            console.log('🧹 Test listener removed');
        }, 30000);
    }

    console.log('\n=== TEST COMPLETE ===');
};

// =====================================================
// INITIALIZATION
// =====================================================
window.addEventListener("DOMContentLoaded", async function () {
    console.log("[CACHE] Clearing all cache on page load...");
    if (window.cacheManager) {
        window.cacheManager.clear("orders");
        window.cacheManager.clear("campaigns");
    }

    // ⚠️ QUAN TRỌNG: Set default dates TRƯỚC KHI load campaigns
    // Vì auto-load cần dates để fetch orders
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    document.getElementById("endDate").value = formatDateTimeLocal(now);
    document.getElementById("startDate").value =
        formatDateTimeLocal(thirtyDaysAgo);

    // Event listeners
    document
        .getElementById("loadCampaignsBtn")
        .addEventListener("click", handleLoadCampaigns);
    document
        .getElementById("clearCacheBtn")
        .addEventListener("click", handleClearCache);
    document
        .getElementById("selectAll")
        .addEventListener("change", handleSelectAll);
    document
        .getElementById("campaignFilter")
        .addEventListener("change", handleCampaignChange);

    // Event listener for employee campaign selector
    const employeeCampaignSelector = document.getElementById('employeeCampaignSelector');
    if (employeeCampaignSelector) {
        employeeCampaignSelector.addEventListener('change', function (e) {
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (selectedOption && selectedOption.dataset.campaign) {
                const campaign = JSON.parse(selectedOption.dataset.campaign);
                console.log(`[EMPLOYEE] Campaign changed in drawer, loading ranges for: ${campaign.displayName}`);
                loadEmployeeRangesForCampaign(campaign.displayName);
            } else {
                console.log('[EMPLOYEE] Loading general employee ranges');
                loadEmployeeRangesForCampaign(null);
            }
        });
    }

    // Initialize TPOS Token Manager Firebase connection
    if (window.tokenManager) {
        console.log('[TOKEN] Retrying Firebase initialization for TokenManager...');
        if (window.tokenManager.retryFirebaseInit()) {
            console.log('[TOKEN] ✅ Firebase connection established');
        } else {
            console.warn('[TOKEN] ⚠️ Firebase still not available, using localStorage only');
        }
    }

    // Initialize Pancake Token Manager & Data Manager
    // IMPORTANT: Wait for this to complete before loading campaigns
    // so that chat columns can display properly on first render
    let pancakeInitialized = false;
    if (window.pancakeTokenManager && window.pancakeDataManager) {
        console.log('[PANCAKE] Initializing Pancake managers...');

        // Initialize token manager first
        window.pancakeTokenManager.initialize();

        // Then initialize data manager and WAIT for it
        try {
            pancakeInitialized = await window.pancakeDataManager.initialize();
            if (pancakeInitialized) {
                console.log('[PANCAKE] ✅ PancakeDataManager initialized successfully');
                // Set chatDataManager alias for compatibility
                window.chatDataManager = window.pancakeDataManager;
            } else {
                console.warn('[PANCAKE] ⚠️ PancakeDataManager initialization failed');
                console.warn('[PANCAKE] Please set JWT token in Pancake Settings');
            }
        } catch (error) {
            console.error('[PANCAKE] ❌ Error initializing PancakeDataManager:', error);
        }
    } else {
        console.warn('[PANCAKE] ⚠️ Pancake managers not available');
    }
    // Initialize Realtime Manager
    if (window.RealtimeManager) {
        console.log('[REALTIME] Initializing RealtimeManager...');
        window.realtimeManager = new RealtimeManager();
        window.realtimeManager.initialize();
    } else {
        console.warn('[REALTIME] ⚠️ RealtimeManager class not found');
    }

    // 🔥 Setup TAG realtime listeners on page load
    // This ensures listeners are active even if user doesn't change campaign
    if (database) {
        console.log('[TAG-REALTIME] Setting up Firebase TAG listeners on page load...');
        setupTagRealtimeListeners();
    } else {
        console.warn('[TAG-REALTIME] Firebase not available, listeners not setup');
    }

    // Scroll to top button
    const scrollBtn = document.getElementById("scrollToTopBtn");
    const tableWrapper = document.getElementById("tableWrapper");

    tableWrapper.addEventListener("scroll", function () {
        if (tableWrapper.scrollTop > 300) {
            scrollBtn.classList.add("show");
        } else {
            scrollBtn.classList.remove("show");
        }
    });

    scrollBtn.addEventListener("click", function () {
        tableWrapper.scrollTo({ top: 0, behavior: "smooth" });
    });

    // 🎯 TỰ ĐỘNG TẢI 1000 ĐƠN HÀNG ĐẦU TIÊN VÀ CHIẾN DỊCH MỚI NHẤT
    // Tags sẽ được load SAU KHI load xong đơn hàng và hiển thị bảng
    // NOTE: chatDataManager is now available (pancakeDataManager) for chat column rendering
    console.log('[AUTO-LOAD] Tự động tải campaigns từ 1000 đơn hàng đầu tiên...');
    console.log('[AUTO-LOAD] chatDataManager available:', !!window.chatDataManager);
    await loadCampaignList(0, document.getElementById("startDate").value, document.getElementById("endDate").value, true);

    // Search functionality
    const searchInput = document.getElementById("tableSearchInput");
    const searchClearBtn = document.getElementById("searchClearBtn");

    searchInput.addEventListener("input", function (e) {
        handleTableSearch(e.target.value);
    });

    searchClearBtn.addEventListener("click", function () {
        searchInput.value = "";
        handleTableSearch("");
        searchInput.focus();
    });

    // Clear search on Escape
    searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            searchInput.value = "";
            handleTableSearch("");
        }
    });

    // Load employee table from Firestore
    // loadAndRenderEmployeeTable(); // Moved to syncEmployeeRanges

    // Check admin permission
    checkAdminPermission();

    // ⚠️ DISABLED: syncEmployeeRanges() - No longer needed!
    // Employee ranges are now loaded per-campaign in handleCampaignChange()
    // syncEmployeeRanges() would overwrite campaign-specific ranges with general config
    // syncEmployeeRanges();

    // Close modals when clicking outside
    window.addEventListener('click', function (event) {
        const tagModal = document.getElementById('tagModal');
        if (event.target === tagModal) {
            closeTagModal();
            if (window.quickTagManager) {
                window.quickTagManager.closeAllDropdowns();
            }
        }
    });

    // Keyboard shortcuts for tag modal
    document.addEventListener('keydown', function (event) {
        const tagModal = document.getElementById('tagModal');
        if (tagModal && tagModal.classList.contains('show')) {
            // Ctrl+Enter to save tags
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                saveOrderTags();
            }
            // ESC to close without saving
            else if (event.key === 'Escape') {
                event.preventDefault();
                closeTagModal();
            }
            // Tab to save and close
            else if (event.key === 'Tab') {
                const tagSearchInput = document.getElementById('tagSearchInput');
                // Only trigger if we're at the input and no dropdown is focused
                if (document.activeElement === tagSearchInput || !document.activeElement || document.activeElement === document.body) {
                    event.preventDefault();
                    saveOrderTags();
                }
            }
        }
    });
});

// =====================================================
// EMPLOYEE RANGE MANAGEMENT FUNCTIONS
// =====================================================
async function loadAndRenderEmployeeTable() {
    try {
        // Initialize user loader
        if (window.userEmployeeLoader) {
            await window.userEmployeeLoader.initialize();
            const users = await window.userEmployeeLoader.loadUsers();

            if (users.length > 0) {
                renderEmployeeTable(users);
            } else {
                console.warn('[EMPLOYEE] No users found');
                const tbody = document.getElementById('employeeAssignmentBody');
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> Không tìm thấy nhân viên nào</td></tr>';
            }
        } else {
            console.error('[EMPLOYEE] userEmployeeLoader not available');
        }
    } catch (error) {
        console.error('[EMPLOYEE] Error loading employee table:', error);
        const tbody = document.getElementById('employeeAssignmentBody');
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ef4444;">Lỗi tải danh sách nhân viên</td></tr>';
    }
}

function renderEmployeeTable(users) {
    const tbody = document.getElementById('employeeAssignmentBody');

    // Use global employeeRanges which is synced from Firebase
    let savedRanges = {};
    if (employeeRanges && employeeRanges.length > 0) {
        employeeRanges.forEach(range => {
            savedRanges[range.name] = { start: range.start, end: range.end };
        });
    }

    // Render table rows
    let html = '';
    users.forEach(user => {
        const savedRange = savedRanges[user.displayName] || { start: '', end: '' };

        html += `
            <tr>
                <td style="padding: 8px;">${user.displayName}</td>
                <td style="padding: 8px; text-align: center;">
                    <input type="number"
                        class="employee-range-input"
                        data-user-id="${user.id}"
                        data-user-name="${user.displayName}"
                        data-field="start"
                        value="${savedRange.start}"
                        placeholder="Từ"
                        style="width: 80px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center;">
                </td>
                <td style="padding: 8px; text-align: center;">
                    <input type="number"
                        class="employee-range-input"
                        data-user-id="${user.id}"
                        data-user-name="${user.displayName}"
                        data-field="end"
                        value="${savedRange.end}"
                        placeholder="Đến"
                        style="width: 80px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center;">
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Sanitize campaign name for Firebase path (remove invalid chars: . $ # [ ] /)
function sanitizeCampaignName(campaignName) {
    if (!campaignName) return null;
    // Replace invalid Firebase key characters with underscore
    // Note: Forward slash (/) is allowed in Firebase keys
    return campaignName
        .replace(/[.$#\[\]]/g, '_')
        .trim();
}

function applyEmployeeRanges() {
    const inputs = document.querySelectorAll('.employee-range-input');
    const rangesMap = {};

    // Collect ranges from inputs
    inputs.forEach(input => {
        const userName = input.getAttribute('data-user-name');
        const field = input.getAttribute('data-field');
        const value = input.value.trim();

        if (!rangesMap[userName]) {
            rangesMap[userName] = {};
        }

        rangesMap[userName][field] = value ? parseInt(value) : null;
    });

    // Build employee ranges array
    const newRanges = [];

    Object.keys(rangesMap).forEach(userName => {
        const range = rangesMap[userName];

        // Only include if both start and end are filled
        if (range.start !== null && range.end !== null && range.start > 0 && range.end > 0) {
            // Find user ID from input attribute
            const input = document.querySelector(`.employee-range-input[data-user-name="${userName}"]`);
            const userId = input ? input.getAttribute('data-user-id') : null;

            newRanges.push({
                id: userId,
                name: userName,
                start: range.start,
                end: range.end
            });
        }
    });

    // Determine save logic based on selected campaign
    const campaignSelector = document.getElementById('employeeCampaignSelector');
    let campaignInfo = '(cấu hình chung)';

    if (campaignSelector && campaignSelector.value) {
        // Get selected campaign data
        const selectedOption = campaignSelector.options[campaignSelector.selectedIndex];
        if (selectedOption && selectedOption.dataset.campaign) {
            const campaign = JSON.parse(selectedOption.dataset.campaign);
            const sanitizedName = sanitizeCampaignName(campaign.displayName);
            campaignInfo = `cho chiến dịch "${campaign.displayName}"`;

            console.log(`[EMPLOYEE] Saving ranges for campaign: ${campaign.displayName} (key: ${sanitizedName})`);

            // Load current campaign configs, update the specific campaign, then save
            if (database) {
                database.ref('settings/employee_ranges_by_campaign').once('value')
                    .then((snapshot) => {
                        const allCampaignRanges = snapshot.val() || {};

                        // Update this campaign's ranges
                        allCampaignRanges[sanitizedName] = newRanges;

                        // Save back to Firebase
                        return database.ref('settings/employee_ranges_by_campaign').set(allCampaignRanges);
                    })
                    .then(() => {
                        if (window.notificationManager) {
                            window.notificationManager.show(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`, 'success');
                        } else {
                            alert(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`);
                        }
                        toggleEmployeeDrawer();
                    })
                    .catch((error) => {
                        console.error('[EMPLOYEE] Error saving ranges to Firebase:', error);
                        alert('❌ Lỗi khi lưu lên Firebase: ' + error.message);
                    });
            } else {
                alert('❌ Lỗi: Không thể kết nối Firebase');
            }
            return; // Exit early for campaign-specific save
        }
    }

    // Save general config (default path)
    if (database) {
        database.ref('settings/employee_ranges').set(newRanges)
            .then(() => {
                if (window.notificationManager) {
                    window.notificationManager.show(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`, 'success');
                } else {
                    alert(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`);
                }
                toggleEmployeeDrawer();
            })
            .catch((error) => {
                console.error('[EMPLOYEE] Error saving ranges to Firebase:', error);
                alert('❌ Lỗi khi lưu lên Firebase: ' + error.message);
            });
    } else {
        alert('❌ Lỗi: Không thể kết nối Firebase');
    }
}

function getEmployeeName(stt) {
    if (!stt || employeeRanges.length === 0) return null;

    const sttNum = parseInt(stt);
    if (isNaN(sttNum)) return null;

    for (const range of employeeRanges) {
        if (sttNum >= range.start && sttNum <= range.end) {
            return range.name;
        }
    }

    return null;
}

function populateEmployeeCampaignSelector() {
    const select = document.getElementById('employeeCampaignSelector');
    if (!select) return;

    // Get campaigns from the main campaign filter
    const mainCampaignSelect = document.getElementById('campaignFilter');
    if (!mainCampaignSelect) {
        console.log('[EMPLOYEE] Main campaign filter not found');
        return;
    }

    // Clear and add default option
    select.innerHTML = '<option value="">Cấu hình chung (tất cả chiến dịch)</option>';

    // Copy campaigns from main filter
    const options = mainCampaignSelect.querySelectorAll('option');
    options.forEach(option => {
        if (option.value !== '') {
            const newOption = document.createElement('option');
            newOption.value = option.value;
            newOption.textContent = option.textContent;
            newOption.dataset.campaign = option.dataset.campaign;
            select.appendChild(newOption);
        }
    });

    console.log(`[EMPLOYEE] Populated campaign selector with ${select.options.length - 1} campaigns`);
}

function toggleEmployeeDrawer() {
    const drawer = document.getElementById('employeeDrawer');
    const overlay = document.getElementById('employeeDrawerOverlay');

    if (drawer && overlay) {
        const isActive = drawer.classList.contains('active');

        if (isActive) {
            // Close drawer
            drawer.classList.remove('active');
            overlay.classList.remove('active');
        } else {
            // Open drawer - Reload table to show latest data
            populateEmployeeCampaignSelector();
            loadAndRenderEmployeeTable();
            drawer.classList.add('active');
            overlay.classList.add('active');
        }
    }
}

function toggleControlBar() {
    const controlBar = document.getElementById('controlBar');
    const btn = document.getElementById('toggleControlBarBtn');

    if (controlBar && btn) {
        const isHidden = controlBar.style.display === 'none';

        if (isHidden) {
            controlBar.style.display = 'flex'; // Or 'block' depending on layout, but flex is used in inline style in html sometimes. Let's check original css. 
            // The original div.filter-section likely has display: flex in CSS. 
            // Let's assume removing style.display will revert to CSS class definition, or set to '' to clear inline style.
            controlBar.style.display = '';

            btn.innerHTML = '<i class="fas fa-sliders-h"></i> Ẩn bộ lọc';
        } else {
            controlBar.style.display = 'none';
            btn.innerHTML = '<i class="fas fa-sliders-h"></i> Hiển thị bộ lọc';
        }
    }
}

function checkAdminPermission() {
    const btn = document.getElementById('employeeSettingsBtn');
    if (btn) {
        // Check if user is admin (checkLogin === 0)
        const isAdmin = window.authManager && window.authManager.hasPermission(0);
        if (!isAdmin) {
            btn.style.display = 'none';
        } else {
            btn.style.display = 'inline-flex';
        }
    }
}

function loadEmployeeRangesForCampaign(campaignName = null) {
    if (!database) {
        console.log('[EMPLOYEE] Database not initialized');
        return Promise.resolve();
    }

    if (campaignName) {
        // Load from campaign-specific config (object with campaign names as keys)
        const sanitizedName = sanitizeCampaignName(campaignName);
        console.log(`[EMPLOYEE] Loading ranges for campaign: ${campaignName} (key: ${sanitizedName})`);

        return database.ref('settings/employee_ranges_by_campaign').once('value')
            .then((snapshot) => {
                const allCampaignRanges = snapshot.val() || {};
                const data = allCampaignRanges[sanitizedName];

                if (data && data.length > 0) {
                    employeeRanges = data;
                    console.log(`[EMPLOYEE] ✅ Loaded ${employeeRanges.length} ranges for campaign: ${campaignName}`);
                } else {
                    // If no campaign-specific ranges found, fall back to general config
                    console.log('[EMPLOYEE] No campaign-specific ranges found, falling back to general config');
                    return database.ref('settings/employee_ranges').once('value')
                        .then((snapshot) => {
                            employeeRanges = snapshot.val() || [];
                            console.log(`[EMPLOYEE] ✅ Loaded ${employeeRanges.length} ranges from general config (fallback)`);
                        });
                }

                // Update employee table if drawer is open
                const drawer = document.getElementById('employeeDrawer');
                if (drawer && drawer.classList.contains('active')) {
                    loadAndRenderEmployeeTable();
                }
            })
            .catch((error) => {
                console.error('[EMPLOYEE] Error loading ranges:', error);
            });
    } else {
        // Load general config
        console.log('[EMPLOYEE] Loading general employee ranges');

        return database.ref('settings/employee_ranges').once('value')
            .then((snapshot) => {
                employeeRanges = snapshot.val() || [];
                console.log(`[EMPLOYEE] ✅ Loaded ${employeeRanges.length} ranges from general config`);

                // Update employee table if drawer is open
                const drawer = document.getElementById('employeeDrawer');
                if (drawer && drawer.classList.contains('active')) {
                    loadAndRenderEmployeeTable();
                }
            })
            .catch((error) => {
                console.error('[EMPLOYEE] Error loading ranges:', error);
            });
    }
}

function syncEmployeeRanges() {
    if (!database) return;

    const rangesRef = database.ref('settings/employee_ranges');
    rangesRef.on('value', (snapshot) => {
        const data = snapshot.val();
        employeeRanges = data || [];
        console.log(`[EMPLOYEE] Synced ${employeeRanges.length} ranges from Firebase`);

        // Re-apply filter to current view
        performTableSearch();
    });
}

// =====================================================
// TAG MANAGEMENT FUNCTIONS
// =====================================================
async function loadAvailableTags() {
    try {
        const cached = window.cacheManager.get("tags", "tags");
        if (cached) {
            console.log("[TAG] Using cached tags");
            availableTags = cached;
            window.availableTags = availableTags; // Export to window
            populateTagFilter(); // Populate filter dropdown
            populateBulkTagDropdown(); // Populate bulk tag dropdown
            return;
        }

        console.log("[TAG] Loading tags from API...");
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(
            "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$top=320&$count=true",
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
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        availableTags = data.value || [];
        window.availableTags = availableTags; // Export to window
        window.cacheManager.set("tags", availableTags, "tags");
        console.log(`[TAG] Loaded ${availableTags.length} tags from API`);
        populateTagFilter(); // Populate filter dropdown
        populateBulkTagDropdown(); // Populate bulk tag dropdown
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

        // Use $top=1000 to ensure we get all tags (current count ~302)
        const response = await API_CONFIG.smartFetch(
            "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$format=json&$count=true&$top=1000",
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
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const newTags = data.value || [];

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
        populateBulkTagDropdown();

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
        populateBulkTagDropdown();

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
    const tagFilterOptions = document.getElementById('tagFilterOptions');
    if (!tagFilterOptions) {
        console.log('[TAG-FILTER] tagFilterOptions element not found');
        return;
    }

    // Clear existing options
    tagFilterOptions.innerHTML = '';

    // Add "Tất cả" option
    const allOption = document.createElement('div');
    allOption.className = 'dropdown-option selected';
    allOption.dataset.value = 'all';
    allOption.innerHTML = '<span>Tất cả</span>';
    allOption.onclick = () => selectTagFilter('all', 'Tất cả');
    tagFilterOptions.appendChild(allOption);

    // Add tag options
    if (availableTags && availableTags.length > 0) {
        availableTags.forEach(tag => {
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.dataset.value = tag.Id;

            // Create color dot
            const colorDot = tag.Color ? `<span style="width: 10px; height: 10px; background-color: ${tag.Color}; border-radius: 50%; display: inline-block;"></span>` : '';

            option.innerHTML = `${colorDot} <span>${tag.Name || 'Unnamed Tag'}</span>`;
            option.onclick = () => selectTagFilter(tag.Id, tag.Name);
            tagFilterOptions.appendChild(option);
        });
        console.log(`[TAG-FILTER] Populated ${availableTags.length} tags in filter dropdown`);
    } else {
        console.log('[TAG-FILTER] No tags available to populate');
    }
}

// --- Searchable Dropdown Functions ---

function toggleTagDropdown() {
    const container = document.getElementById('tagFilterContainer');
    const input = document.getElementById('tagFilterInput');
    if (container) {
        container.classList.toggle('show');
        if (container.classList.contains('show') && input) {
            input.focus();
        }
    }
}

function showTagDropdown() {
    const container = document.getElementById('tagFilterContainer');
    if (container) container.classList.add('show');
}

function hideTagDropdown() {
    const container = document.getElementById('tagFilterContainer');
    if (container) container.classList.remove('show');
}

function filterTagDropdown() {
    const input = document.getElementById('tagFilterInput');
    const filter = input.value.toLowerCase();
    const options = document.getElementById('tagFilterOptions').getElementsByClassName('dropdown-option');

    for (let i = 0; i < options.length; i++) {
        const span = options[i].getElementsByTagName("span")[0];
        if (span) {
            const txtValue = span.textContent || span.innerText;
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
                options[i].style.display = "";
            } else {
                options[i].style.display = "none";
            }
        }
    }
}

function selectTagFilter(value, name) {
    // Update hidden input
    const hiddenInput = document.getElementById('tagFilter');
    if (hiddenInput) hiddenInput.value = value;

    // Update selected display
    const selectedDisplay = document.getElementById('tagFilterSelected');
    if (selectedDisplay) {
        selectedDisplay.innerHTML = `<span>${name || 'Tất cả'}</span> <i class="fas fa-chevron-down"></i>`;
    }

    // Update selected class in options
    const options = document.getElementById('tagFilterOptions').getElementsByClassName('dropdown-option');
    for (let i = 0; i < options.length; i++) {
        if (options[i].dataset.value == value) {
            options[i].classList.add('selected');
        } else {
            options[i].classList.remove('selected');
        }
    }

    // Hide dropdown
    hideTagDropdown();

    // Trigger search
    performTableSearch();
}

// Close dropdown when clicking outside
window.addEventListener('click', function (e) {
    const dropdown = document.getElementById('tagFilterDropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        hideTagDropdown();
    }
});

function openTagModal(orderId, orderCode) {
    currentEditingOrderId = orderId;
    const order = allData.find((o) => o.Id === orderId);
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

// =====================================================
// BULK TAG ASSIGNMENT FUNCTIONS
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

    // Split by comma or space
    const parts = input.split(/[,\s]+/).filter(p => p.trim());

    parts.forEach(part => {
        part = part.trim();

        // Check if it's a range (e.g., "5-10")
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    sttNumbers.add(i);
                }
            }
        } else {
            // Single number
            const num = parseInt(part);
            if (!isNaN(num)) {
                sttNumbers.add(num);
            }
        }
    });

    return sttNumbers;
}

/**
 * Handle STT input keydown events
 */
function handleBulkTagSTTInput(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const input = document.getElementById('bulkTagSTTInput');
        const value = input.value.trim();

        if (value) {
            // Parse and add STT numbers to set
            const newSTTs = parseBulkSTTInput(value);
            newSTTs.forEach(stt => bulkTagSTTSet.add(stt));

            // Clear input and update display
            input.value = '';
            updateBulkTagSTTDisplay();
        }
    }
}

/**
 * Update STT pills display
 */
function updateBulkTagSTTDisplay() {
    const container = document.getElementById('bulkTagSTTDisplay');

    if (bulkTagSTTSet.size === 0) {
        container.innerHTML = '';
        return;
    }

    // Sort STT numbers
    const sortedSTTs = Array.from(bulkTagSTTSet).sort((a, b) => a - b);

    // Create pills
    container.innerHTML = sortedSTTs.map(stt => `
        <span style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: #dbeafe;
            color: #1e40af;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        ">
            ${stt}
            <button
                onclick="removeBulkSTT(${stt})"
                style="
                    background: none;
                    border: none;
                    color: #1e40af;
                    cursor: pointer;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    font-size: 14px;
                "
                title="Xóa STT ${stt}">
                ×
            </button>
        </span>
    `).join('');
}

/**
 * Remove a single STT from the set
 */
function removeBulkSTT(stt) {
    bulkTagSTTSet.delete(stt);
    updateBulkTagSTTDisplay();
}

/**
 * Clear all STT numbers
 */
function clearBulkTagSTT() {
    bulkTagSTTSet.clear();
    document.getElementById('bulkTagSTTInput').value = '';
    updateBulkTagSTTDisplay();
}

/**
 * Populate bulk tag dropdown with available tags
 */
function populateBulkTagDropdown() {
    const container = document.getElementById('bulkTagOptions');
    if (!container) {
        console.log('[BULK-TAG] bulkTagOptions element not found');
        return;
    }

    // Clear existing options
    container.innerHTML = '';

    // Add tag options
    if (availableTags && availableTags.length > 0) {
        availableTags.forEach(tag => {
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.dataset.value = tag.Id;

            // Create color dot
            const colorDot = tag.Color ?
                `<span style="width: 10px; height: 10px; background-color: ${tag.Color}; border-radius: 50%; display: inline-block; margin-right: 6px;"></span>` :
                '';

            option.innerHTML = `${colorDot}<span>${tag.Name || 'Unnamed Tag'}</span>`;
            option.onclick = () => selectBulkTag(tag.Id, tag.Name, tag.Color);
            container.appendChild(option);
        });
        console.log(`[BULK-TAG] Populated ${availableTags.length} tags in dropdown`);
    } else {
        container.innerHTML = '<div style="padding: 8px; color: #9ca3af; text-align: center;">Không có tag nào</div>';
    }
}

/**
 * Refresh tags for bulk tag dropdown
 */
async function refreshBulkTagDropdown() {
    const container = document.getElementById('bulkTagOptions');
    if (!container) return;

    try {
        // Show loading state
        container.innerHTML = '<div style="padding: 12px; color: #6b7280; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Đang tải tags...</div>';

        console.log("[BULK-TAG] Fetching tags from API...");
        const headers = await window.tokenManager.getAuthHeader();

        // Fetch từ API với $top=1000
        const response = await API_CONFIG.smartFetch(
            "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$format=json&$count=true&$top=1000",
            {
                method: "GET",
                headers: {
                    ...headers,
                    accept: "application/json",
                    "content-type": "application/json"
                },
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const newTags = data.value || [];

        console.log(`[BULK-TAG] Fetched ${newTags.length} tags from API`);

        // Update global tags
        availableTags = newTags;
        window.availableTags = availableTags;
        window.cacheManager.set("tags", availableTags, "tags");

        // Save to Firebase
        if (database) {
            await database.ref('settings/tags').set(newTags);
            console.log('[BULK-TAG] Saved tags to Firebase settings/tags');
        }

        // Update both dropdowns
        populateTagFilter();
        populateBulkTagDropdown();

        console.log('[BULK-TAG] Tags refreshed successfully');

    } catch (error) {
        console.error("[BULK-TAG] Error refreshing tags:", error);
        container.innerHTML = '<div style="padding: 12px; color: #ef4444; text-align: center;"><i class="fas fa-exclamation-triangle"></i> Lỗi tải tags</div>';

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi tải tags: ${error.message}`, 3000);
        }
    }
}

/**
 * Toggle bulk tag dropdown
 */
async function toggleBulkTagDropdown() {
    const container = document.getElementById('bulkTagContainer');
    const input = document.getElementById('bulkTagSearchInput');

    if (container) {
        const isOpening = !container.classList.contains('show');

        if (isOpening) {
            // Fetch fresh tags before opening
            container.classList.add('show');
            await refreshBulkTagDropdown();
            if (input) input.focus();
        } else {
            // Just close
            container.classList.remove('show');
        }
    }
}

/**
 * Filter bulk tag dropdown based on search input
 */
function filterBulkTagDropdown() {
    const input = document.getElementById('bulkTagSearchInput');
    const filter = input.value.toLowerCase();
    const options = document.querySelectorAll('#bulkTagOptions .dropdown-option');

    options.forEach(option => {
        const text = option.textContent.toLowerCase();
        option.style.display = text.includes(filter) ? '' : 'none';
    });
}

/**
 * Select a tag from bulk tag dropdown
 */
function selectBulkTag(tagId, tagName, tagColor) {
    selectedBulkTagId = tagId;
    selectedBulkTagName = tagName;

    // Update selected display
    const selected = document.getElementById('bulkTagSelected');
    const colorDot = tagColor ?
        `<span style="width: 10px; height: 10px; background-color: ${tagColor}; border-radius: 50%; display: inline-block; margin-right: 6px;"></span>` :
        '';

    selected.innerHTML = `
        <span>${colorDot}${tagName}</span>
        <i class="fas fa-chevron-down"></i>
    `;

    // Update hidden input
    document.getElementById('bulkTagValue').value = tagId;

    // Close dropdown
    document.getElementById('bulkTagContainer').classList.remove('show');

    // Clear search
    document.getElementById('bulkTagSearchInput').value = '';
    filterBulkTagDropdown();
}

/**
 * Execute bulk tag assignment
 */
async function executeBulkTagAssignment() {
    // Validate inputs
    if (bulkTagSTTSet.size === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng nhập STT cần gán tag', 3000);
        } else {
            alert('Vui lòng nhập STT cần gán tag');
        }
        return;
    }

    if (!selectedBulkTagId) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn tag cần gán', 3000);
        } else {
            alert('Vui lòng chọn tag cần gán');
        }
        return;
    }

    try {
        showLoading(true);

        // Get selected tag info
        const selectedTag = availableTags.find(t => t.Id === selectedBulkTagId);
        if (!selectedTag) {
            throw new Error('Tag không tồn tại');
        }

        // Find orders matching STT in displayedData (current view)
        const sttArray = Array.from(bulkTagSTTSet);
        const matchingOrders = displayedData.filter(order =>
            sttArray.includes(order.SessionIndex)
        );

        if (matchingOrders.length === 0) {
            throw new Error(`Không tìm thấy đơn hàng nào có STT: ${sttArray.join(', ')} trong bảng hiện tại`);
        }

        console.log(`[BULK-TAG] Found ${matchingOrders.length} orders matching STT:`, sttArray);

        // Process each order
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (const order of matchingOrders) {
            try {
                // Get current tags
                const currentTags = order.Tags ? JSON.parse(order.Tags) : [];

                // Check if tag already exists
                const tagExists = currentTags.some(t => t.Id === selectedBulkTagId);
                if (tagExists) {
                    console.log(`[BULK-TAG] Tag already exists for order ${order.Code} (STT ${order.SessionIndex})`);
                    successCount++; // Count as success since tag is already there
                    continue;
                }

                // Add new tag
                const updatedTags = [
                    ...currentTags,
                    {
                        Id: selectedTag.Id,
                        Name: selectedTag.Name,
                        Color: selectedTag.Color
                    }
                ];

                // Call API to assign tag
                const headers = await window.tokenManager.getAuthHeader();
                const response = await API_CONFIG.smartFetch(
                    "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
                    {
                        method: "POST",
                        headers: {
                            ...headers,
                            "Content-Type": "application/json",
                            Accept: "application/json"
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

                // Update local data
                const updatedData = { Tags: JSON.stringify(updatedTags) };
                updateOrderInTable(order.Id, updatedData);

                // Emit Firebase update
                await emitTagUpdateToFirebase(order.Id, updatedTags);

                successCount++;
                console.log(`[BULK-TAG] Successfully tagged order ${order.Code} (STT ${order.SessionIndex})`);

            } catch (error) {
                console.error(`[BULK-TAG] Error tagging order ${order.Code}:`, error);
                errorCount++;
                errors.push(`STT ${order.SessionIndex} (${order.Code}): ${error.message}`);
            }
        }

        // Clear cache
        window.cacheManager.clear("orders");

        showLoading(false);

        // Show result notification
        if (successCount > 0 && errorCount === 0) {
            if (window.notificationManager) {
                window.notificationManager.success(
                    `Đã gán tag "${selectedBulkTagName}" cho ${successCount} đơn hàng thành công!`,
                    3000
                );
            } else {
                alert(`Đã gán tag cho ${successCount} đơn hàng thành công!`);
            }

            // Clear inputs after success
            clearBulkTagSTT();
            selectedBulkTagId = null;
            selectedBulkTagName = null;
            document.getElementById('bulkTagSelected').innerHTML = `
                <span style="color: #9ca3af;">-- Chọn tag --</span>
                <i class="fas fa-chevron-down"></i>
            `;
            document.getElementById('bulkTagValue').value = '';

        } else if (successCount > 0 && errorCount > 0) {
            if (window.notificationManager) {
                window.notificationManager.warning(
                    `Đã gán tag cho ${successCount} đơn. Lỗi: ${errorCount} đơn`,
                    4000
                );
            } else {
                alert(`Thành công: ${successCount} đơn\nLỗi: ${errorCount} đơn\n\n${errors.join('\n')}`);
            }
        } else {
            throw new Error(`Không thể gán tag cho bất kỳ đơn hàng nào.\n\n${errors.join('\n')}`);
        }

    } catch (error) {
        console.error("[BULK-TAG] Error in bulk tag assignment:", error);
        showLoading(false);

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi gán tag hàng loạt: ${error.message}`, 5000);
        } else {
            alert(`Lỗi gán tag hàng loạt:\n${error.message}`);
        }
    }
}

// =====================================================
// TABLE SEARCH & FILTERING
// =====================================================
function handleTableSearch(query) {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchQuery = query.trim().toLowerCase();
        document
            .getElementById("searchClearBtn")
            .classList.toggle("active", !!searchQuery);
        performTableSearch();
    }, 300);
}

// =====================================================
// MERGE ORDERS BY PHONE NUMBER
// =====================================================
function mergeOrdersByPhone(orders) {
    if (!orders || orders.length === 0) return orders;

    // Normalize phone numbers (remove spaces, dots, dashes, country code)
    const normalizePhone = (phone) => {
        if (!phone) return '';
        // Remove all non-digit characters
        let cleaned = phone.replace(/\D/g, '');
        // Handle Vietnam country code: replace leading 84 with 0
        if (cleaned.startsWith('84')) {
            cleaned = '0' + cleaned.substring(2);
        }
        return cleaned;
    };

    // Group orders by normalized phone number
    const phoneGroups = new Map();

    orders.forEach(order => {
        const normalizedPhone = normalizePhone(order.Telephone);
        if (!normalizedPhone) {
            // If no phone number, treat as individual order
            if (!phoneGroups.has(`no_phone_${order.Id}`)) {
                phoneGroups.set(`no_phone_${order.Id}`, []);
            }
            phoneGroups.get(`no_phone_${order.Id}`).push(order);
        } else {
            if (!phoneGroups.has(normalizedPhone)) {
                phoneGroups.set(normalizedPhone, []);
            }
            phoneGroups.get(normalizedPhone).push(order);
        }
    });

    // Merge orders in each group
    const mergedOrders = [];

    phoneGroups.forEach((groupOrders, phone) => {
        if (groupOrders.length === 1) {
            // Only one order with this phone, no merging needed
            mergedOrders.push(groupOrders[0]);
        } else {
            // Multiple orders with same phone number - merge them
            // Sort by SessionIndex (STT) to find the order with largest STT
            const sortedOrders = [...groupOrders].sort((a, b) => {
                const sttA = parseInt(a.SessionIndex) || 0;
                const sttB = parseInt(b.SessionIndex) || 0;
                return sttB - sttA; // Descending order (largest first)
            });

            // Order with largest STT becomes the target (will receive all products)
            const targetOrder = sortedOrders[0];
            const sourceOrders = sortedOrders.slice(1); // Orders with smaller STT (will lose products)

            // Collect all unique values
            const allCodes = [];
            const allNames = new Set();
            const allAddresses = new Set();
            const allNotes = [];
            const allSTTs = [];
            let totalAmount = 0;
            let totalQuantity = 0;
            const allIds = [];
            let earliestDate = targetOrder.DateCreated;

            groupOrders.forEach(order => {
                allCodes.push(order.Code);
                if (order.Name && order.Name.trim()) allNames.add(order.Name.trim());
                if (order.Address && order.Address.trim()) allAddresses.add(order.Address.trim());
                if (order.Note && order.Note.trim()) allNotes.push(order.Note.trim());
                if (order.SessionIndex) allSTTs.push(order.SessionIndex);
                totalAmount += (order.TotalAmount || 0);
                totalQuantity += (order.TotalQuantity || 0);
                allIds.push(order.Id);

                // Keep earliest date
                if (new Date(order.DateCreated) < new Date(earliestDate)) {
                    earliestDate = order.DateCreated;
                }
            });

            // Group orders by customer name to handle single vs multi-customer scenarios
            const customerGroups = new Map();
            groupOrders.forEach(order => {
                const name = order.Name?.trim() || 'Unknown';
                if (!customerGroups.has(name)) {
                    customerGroups.set(name, []);
                }
                customerGroups.get(name).push(order);
            });

            // Determine if single or multi-customer
            const uniqueCustomerCount = customerGroups.size;
            const isSingleCustomer = uniqueCustomerCount === 1;

            // Store original orders with necessary chat info AND amount/quantity for display
            const originalOrders = groupOrders.map(order => ({
                Id: order.Id,
                Name: order.Name,
                Code: order.Code,
                SessionIndex: order.SessionIndex,
                Facebook_ASUserId: order.Facebook_ASUserId,
                Facebook_PostId: order.Facebook_PostId,
                Telephone: order.Telephone,
                TotalAmount: order.TotalAmount || 0,
                TotalQuantity: order.TotalQuantity || 0
            }));

            // Create customer groups info for rendering
            const customerGroupsInfo = Array.from(customerGroups.entries()).map(([name, orders]) => {
                // Sort orders by STT to get largest
                const sortedOrders = [...orders].sort((a, b) => {
                    const sttA = parseInt(a.SessionIndex) || 0;
                    const sttB = parseInt(b.SessionIndex) || 0;
                    return sttB - sttA; // Descending order (largest first)
                });

                return {
                    name,
                    orderCount: orders.length,
                    orders: sortedOrders.map(o => ({
                        id: o.Id,
                        stt: o.SessionIndex,
                        psid: o.Facebook_ASUserId,
                        channelId: window.chatDataManager ? window.chatDataManager.parseChannelId(o.Facebook_PostId) : null,
                        code: o.Code
                    }))
                };
            });

            // Create merged order
            const mergedOrder = {
                ...targetOrder, // Use target order as base
                Code: allCodes.join(' + '),
                Name: Array.from(allNames).join(' / '),
                Address: Array.from(allAddresses).join(' | '),
                Note: allNotes.length > 0 ? allNotes.join(' | ') : targetOrder.Note,
                TotalAmount: totalAmount,
                TotalQuantity: totalQuantity,
                DateCreated: earliestDate,
                Id: allIds.join('_'), // Combine IDs for checkbox handling
                OriginalIds: allIds, // Store original IDs for reference
                MergedCount: groupOrders.length, // Track how many orders were merged
                SessionIndex: allSTTs.length > 1 ? allSTTs.join(' + ') : (targetOrder.SessionIndex || ''),
                AllSTTs: allSTTs, // Store all STT for reference
                // NEW: Store merge info for product transfer
                TargetOrderId: targetOrder.Id, // Order with largest STT (will receive products)
                SourceOrderIds: sourceOrders.map(o => o.Id), // Orders with smaller STT (will lose products)
                TargetSTT: targetOrder.SessionIndex,
                SourceSTTs: sourceOrders.map(o => o.SessionIndex),
                IsMerged: true, // Flag to identify merged orders
                // NEW: Customer grouping info for message/comment rendering
                OriginalOrders: originalOrders, // Store original orders with chat info
                IsSingleCustomer: isSingleCustomer, // true if all orders have same customer name
                UniqueCustomerCount: uniqueCustomerCount, // Number of unique customers
                CustomerGroups: customerGroupsInfo // Grouped by customer with sorted orders
            };

            mergedOrders.push(mergedOrder);
        }
    });

    return mergedOrders;
}

function performTableSearch() {
    // Apply search filter
    let tempData = searchQuery
        ? allData.filter((order) => matchesSearchQuery(order, searchQuery))
        : [...allData];

    // Apply Employee STT Range Filter
    // Check if user is admin (checkLogin === 0)
    let isAdmin = window.authManager && window.authManager.hasPermission(0);

    const auth = window.authManager ? window.authManager.getAuthState() : null;
    const currentUserType = auth && auth.userType ? auth.userType : null;
    const currentDisplayName = auth && auth.displayName ? auth.displayName : null;
    const currentUserId = auth && auth.id ? auth.id : null;

    // Fallback: Check username string for Admin
    if (!isAdmin && currentUserType) {
        const lowerName = currentUserType.toLowerCase();
        if (lowerName.includes('admin') || lowerName.includes('quản trị') || lowerName.includes('administrator')) {
            isAdmin = true;
            console.log('[FILTER] User identified as Admin by name check');
        }
    }

    if (!isAdmin && employeeRanges.length > 0) {
        console.log('[FILTER] Current user:', currentDisplayName || currentUserType, 'ID:', currentUserId);

        let userRange = null;

        // 1. Try matching by ID first (most reliable)
        if (currentUserId) {
            userRange = employeeRanges.find(r => r.id === currentUserId);
            if (userRange) console.log('[FILTER] Matched by ID');
        }

        // 2. If not found, try matching by Display Name (Exact match)
        if (!userRange && currentDisplayName) {
            userRange = employeeRanges.find(r => r.name === currentDisplayName);
            if (userRange) console.log('[FILTER] Matched by Display Name');
        }

        // 3. If not found, try matching by User Type (Legacy)
        if (!userRange && currentUserType) {
            userRange = employeeRanges.find(r => r.name === currentUserType);
            if (userRange) console.log('[FILTER] Matched by User Type');
        }

        // 4. If not found, try matching by short name (before "-")
        if (!userRange && currentUserType) {
            const shortName = currentUserType.split('-')[0].trim();
            userRange = employeeRanges.find(r => r.name === shortName);
            if (userRange) console.log('[FILTER] Matched by Short Name:', shortName);
        }

        if (userRange) {
            const debugInfo = `
🔍 THÔNG TIN DEBUG:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Tài khoản hiện tại: ${currentDisplayName || currentUserType}
🆔 User ID: ${currentUserId || 'Không có'}
🔐 Là Admin? ${isAdmin ? 'CÓ' : 'KHÔNG'}
📊 STT được phân: ${userRange.start} - ${userRange.end}
👥 Tên trong setting: ${userRange.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Đang áp dụng filter cho bạn!
            `.trim();

            console.log(debugInfo);

            // Alert removed as per user request
            // if (!window._filterDebugShown) {
            //     alert(debugInfo);
            //     window._filterDebugShown = true;
            // }

            tempData = tempData.filter(order => {
                const stt = parseInt(order.SessionIndex);
                if (isNaN(stt)) return false;
                return stt >= userRange.start && stt <= userRange.end;
            });
            console.log(`[FILTER] Applied STT range ${userRange.start}-${userRange.end} for ${currentDisplayName || currentUserType}`);
        } else {
            console.log('[FILTER] No range found for user:', currentDisplayName || currentUserType);
        }
    } else if (isAdmin) {
        console.log('[FILTER] User is Admin - NO FILTER APPLIED');
    }

    // Apply conversation status filter (Merged Messages & Comments)
    const conversationFilter = document.getElementById('conversationFilter')?.value || 'all';

    if (window.pancakeDataManager && conversationFilter !== 'all') {
        tempData = tempData.filter(order => {
            const msgUnread = window.pancakeDataManager.getMessageUnreadInfoForOrder(order);
            const cmmUnread = window.pancakeDataManager.getCommentUnreadInfoForOrder(order);

            const hasUnreadMessage = msgUnread.hasUnread;
            const hasUnreadComment = cmmUnread.hasUnread;

            if (conversationFilter === 'unread') {
                return hasUnreadMessage || hasUnreadComment;
            } else if (conversationFilter === 'read') {
                return !hasUnreadMessage && !hasUnreadComment;
            }
            return true;
        });
    }

    // Apply Status Filter
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    if (statusFilter !== 'all') {
        tempData = tempData.filter(order => {
            if (statusFilter === 'Draft') {
                return order.Status === 'Draft';
            } else if (statusFilter === 'Confirmed') {
                return order.Status !== 'Draft';
            }
            return true;
        });
    }

    // Apply TAG filter
    const tagFilter = document.getElementById('tagFilter')?.value || 'all';

    if (tagFilter !== 'all') {
        tempData = tempData.filter(order => {
            if (!order.Tags) return false;

            try {
                const orderTags = JSON.parse(order.Tags);
                if (!Array.isArray(orderTags) || orderTags.length === 0) return false;

                // Check if the order has the selected tag
                // Convert both to string to handle type mismatch (tagFilter is string, tag.Id might be number)
                return orderTags.some(tag => String(tag.Id) === String(tagFilter));
            } catch (e) {
                return false;
            }
        });
    }

    filteredData = tempData;

    // Priority sorting: STT → Phone → Name
    if (searchQuery) {
        filteredData.sort((a, b) => {
            const searchLower = searchQuery.toLowerCase();
            const aStt = String(a.SessionIndex || '').toLowerCase();
            const bStt = String(b.SessionIndex || '').toLowerCase();
            const aPhone = (a.Telephone || '').toLowerCase();
            const bPhone = (b.Telephone || '').toLowerCase();
            const aName = (a.Name || '').toLowerCase();
            const bName = (b.Name || '').toLowerCase();

            // Priority 1: STT exact match
            const aSttMatch = aStt === searchLower;
            const bSttMatch = bStt === searchLower;
            if (aSttMatch && !bSttMatch) return -1;
            if (!aSttMatch && bSttMatch) return 1;

            // Priority 2: STT starts with
            const aSttStarts = aStt.startsWith(searchLower);
            const bSttStarts = bStt.startsWith(searchLower);
            if (aSttStarts && !bSttStarts) return -1;
            if (!aSttStarts && bSttStarts) return 1;

            // Priority 3: STT contains
            const aSttContains = aStt.includes(searchLower);
            const bSttContains = bStt.includes(searchLower);
            if (aSttContains && !bSttContains) return -1;
            if (!aSttContains && bSttContains) return 1;

            // Priority 4: Phone starts with
            const aPhoneStarts = aPhone.startsWith(searchLower);
            const bPhoneStarts = bPhone.startsWith(searchLower);
            if (aPhoneStarts && !bPhoneStarts) return -1;
            if (!aPhoneStarts && bPhoneStarts) return 1;

            // Priority 5: Phone contains
            const aPhoneContains = aPhone.includes(searchLower);
            const bPhoneContains = bPhone.includes(searchLower);
            if (aPhoneContains && !bPhoneContains) return -1;
            if (!aPhoneContains && bPhoneContains) return 1;

            // Priority 6: Name starts with
            const aNameStarts = aName.startsWith(searchLower);
            const bNameStarts = bName.startsWith(searchLower);
            if (aNameStarts && !bNameStarts) return -1;
            if (!aNameStarts && bNameStarts) return 1;

            // Priority 7: Name contains
            const aNameContains = aName.includes(searchLower);
            const bNameContains = bName.includes(searchLower);
            if (aNameContains && !bNameContains) return -1;
            if (!aNameContains && bNameContains) return 1;

            // Default: keep original order
            return 0;
        });
    }

    // NOTE: Visual merging disabled - each order shows as separate row
    // Merge products button (mergeProductsBtn) still works independently
    // filteredData = mergeOrdersByPhone(filteredData);

    displayedData = filteredData;
    renderTable();
    updateStats();
    updatePageInfo();
    updateSearchResultCount();
}

function matchesSearchQuery(order, query) {
    const searchableText = [
        String(order.SessionIndex || ''), // STT - Priority field
        order.Code,
        order.Name,
        order.Telephone,
        order.Address,
        order.Note,
        order.StatusText,
    ]
        .join(" ")
        .toLowerCase();
    const normalizedText = removeVietnameseTones(searchableText);
    const normalizedQuery = removeVietnameseTones(query);
    return (
        searchableText.includes(query) ||
        normalizedText.includes(normalizedQuery)
    );
}

function removeVietnameseTones(str) {
    if (!str) return "";
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D");
}

function updateSearchResultCount() {
    document.getElementById("searchResultCount").textContent =
        filteredData.length.toLocaleString("vi-VN");
}

function highlightSearchText(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// =====================================================
// DATA FETCHING & CAMPAIGN LOADING
// =====================================================
function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function convertToUTC(dateTimeLocal) {
    if (!dateTimeLocal) {
        console.error("[DATE] Empty date value provided to convertToUTC");
        throw new Error("Date value is required");
    }

    const date = new Date(dateTimeLocal);

    if (isNaN(date.getTime())) {
        console.error("[DATE] Invalid date value:", dateTimeLocal);
        throw new Error(`Invalid date value: ${dateTimeLocal}`);
    }

    return date.toISOString();
}

async function handleLoadCampaigns() {
    // Validate dates
    const startDateValue = document.getElementById("startDate").value;
    const endDateValue = document.getElementById("endDate").value;

    if (!startDateValue || !endDateValue) {
        if (window.notificationManager) {
            window.notificationManager.error("Vui lòng chọn khoảng thời gian (Từ ngày - Đến ngày)", 3000);
        } else {
            alert("Vui lòng chọn khoảng thời gian (Từ ngày - Đến ngày)");
        }
        return;
    }

    const skip = parseInt(document.getElementById("skipRangeFilter").value) || 0;
    await loadCampaignList(skip, startDateValue, endDateValue);
}

async function loadCampaignList(skip = 0, startDateLocal = null, endDateLocal = null, autoLoad = false) {
    try {
        showLoading(true);

        let url;
        if (startDateLocal && endDateLocal) {
            // Sử dụng date filter với skip - Tải 3000 đơn hàng
            const startDate = convertToUTC(startDateLocal);
            const endDate = convertToUTC(endDateLocal);
            const filter = `(DateCreated ge ${startDate} and DateCreated le ${endDate})`;
            // OPTIMIZATION: Only fetch necessary fields for campaign list
            url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=3000&$skip=${skip}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}&$count=true&$select=LiveCampaignId,LiveCampaignName,DateCreated`;

            console.log(`[CAMPAIGNS] Loading campaigns with skip=${skip}, date range: ${startDateLocal} to ${endDateLocal}, autoLoad=${autoLoad}`);
        } else {
            // Fallback: không có date filter - Tải 3000 đơn hàng
            // OPTIMIZATION: Only fetch necessary fields for campaign list
            url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=3000&$skip=${skip}&$orderby=DateCreated desc&$count=true&$select=LiveCampaignId,LiveCampaignName,DateCreated`;

            console.log(`[CAMPAIGNS] Loading campaigns with skip=${skip}, no date filter, autoLoad=${autoLoad}`);
        }

        const headers = await window.tokenManager.getAuthHeader();
        const response = await API_CONFIG.smartFetch(url, {
            headers: { ...headers, accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const orders = data.value || [];
        const totalCount = data["@odata.count"] || 0;

        console.log(`[CAMPAIGNS] Loaded ${orders.length} orders out of ${totalCount} total`);

        // 🎯 BƯỚC 1: GỘP CÁC CHIẾN DỊCH THEO LiveCampaignId
        const campaignsByCampaignId = new Map(); // key: LiveCampaignId, value: { name, dates: Set }

        orders.forEach((order) => {
            if (!order.LiveCampaignId) return;

            // Lấy ngày từ DateCreated (bỏ phần giờ)
            const dateCreated = new Date(order.DateCreated);
            const dateKey = `${dateCreated.getFullYear()}-${String(dateCreated.getMonth() + 1).padStart(2, '0')}-${String(dateCreated.getDate()).padStart(2, '0')}`;

            if (!campaignsByCampaignId.has(order.LiveCampaignId)) {
                campaignsByCampaignId.set(order.LiveCampaignId, {
                    campaignId: order.LiveCampaignId,
                    campaignName: order.LiveCampaignName || "Không có tên",
                    dates: new Set(),
                    latestDate: order.DateCreated
                });
            }

            const campaign = campaignsByCampaignId.get(order.LiveCampaignId);
            campaign.dates.add(dateKey);

            // Keep latest date for sorting
            if (new Date(order.DateCreated) > new Date(campaign.latestDate)) {
                campaign.latestDate = order.DateCreated;
            }
        });

        // 🎯 HÀM PARSE NGÀY TỪ TÊN CHIẾN DỊCH
        function extractCampaignDate(campaignName) {
            // Tìm pattern: DD/MM/YY hoặc DD/MM/YYYY (ví dụ: "11/11/25", "15/11/2025")
            const match = campaignName.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (!match) return null;

            let day = match[1].padStart(2, '0');
            let month = match[2].padStart(2, '0');
            let year = match[3];

            // Normalize year: convert YY → YYYY (assume 20YY)
            if (year.length === 2) {
                year = '20' + year;
            }

            // Return normalized format: DD/MM/YYYY
            return `${day}/${month}/${year}`;
        }

        // 🎯 BƯỚC 2: GỘP CÁC CHIẾN DỊCH THEO NGÀY TRONG TÊN
        // Ví dụ: "HOUSE 11/11/25" + "STORE 11/11/25" → "11/11/25 - HOUSE + STORE"
        const campaignsByDateKey = new Map(); // key: ngày từ tên (ví dụ: "11/11/25")

        Array.from(campaignsByCampaignId.values()).forEach(campaign => {
            const dateKey = extractCampaignDate(campaign.campaignName);

            // Sử dụng dateKey hoặc tên gốc nếu không parse được
            const groupKey = dateKey || campaign.campaignName;

            if (!campaignsByDateKey.has(groupKey)) {
                campaignsByDateKey.set(groupKey, {
                    campaignIds: [],
                    campaignNames: [],
                    dates: new Set(),
                    latestDate: campaign.latestDate,
                    dateKey: dateKey
                });
            }

            const merged = campaignsByDateKey.get(groupKey);
            merged.campaignIds.push(campaign.campaignId);
            merged.campaignNames.push(campaign.campaignName);
            campaign.dates.forEach(d => merged.dates.add(d));

            // Keep latest date
            if (new Date(campaign.latestDate) > new Date(merged.latestDate)) {
                merged.latestDate = campaign.latestDate;
            }
        });

        // 🎯 BƯỚC 3: TẠO DANH SÁCH CAMPAIGNS ĐÃ GỘP
        const mergedCampaigns = [];

        // Sort by latest date descending
        const sortedCampaigns = Array.from(campaignsByDateKey.values())
            .sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));

        sortedCampaigns.forEach(campaign => {
            const dates = Array.from(campaign.dates).sort((a, b) => b.localeCompare(a));

            // Tạo display name
            let displayName;
            const uniqueNames = [...new Set(campaign.campaignNames)];

            if (campaign.dateKey) {
                // Có ngày từ tên → hiển thị ngày + danh sách loại chiến dịch
                const types = uniqueNames.map(name => {
                    // Extract prefix (HOUSE, STORE, etc.) - lấy phần trước dấu cách đầu tiên
                    const prefix = name.split(' ')[0];
                    return prefix;
                }).filter((v, i, a) => a.indexOf(v) === i); // unique types

                const typeStr = types.join(' + ');

                if (dates.length === 1) {
                    displayName = `${campaign.dateKey} - ${typeStr} (${dates[0]})`;
                } else {
                    displayName = `${campaign.dateKey} - ${typeStr} (${dates.length} ngày: ${dates.join(', ')})`;
                }
            } else {
                // Không parse được ngày → giữ tên gốc
                if (dates.length === 1) {
                    displayName = `${uniqueNames[0]} (${dates[0]})`;
                } else {
                    displayName = `${uniqueNames[0]} (${dates.length} ngày: ${dates.join(', ')})`;
                }
            }

            mergedCampaigns.push({
                campaignId: campaign.campaignIds[0], // For backward compatibility
                campaignIds: campaign.campaignIds, // Array of all merged campaign IDs
                displayName: displayName,
                dates: dates,
                latestDate: campaign.latestDate,
                count: dates.length
            });
        });

        console.log(`[CAMPAIGNS] Found ${mergedCampaigns.length} unique campaigns (merged from ${orders.length} orders)`);

        showLoading(false);

        // Populate dropdown với autoLoad parameter
        await populateCampaignFilter(mergedCampaigns, autoLoad);

        // Hiển thị thông báo (chỉ khi không auto-load để tránh spam)
        if (!autoLoad) {
            if (window.notificationManager) {
                window.notificationManager.success(
                    `Tải thành công ${mergedCampaigns.length} chiến dịch từ ${orders.length} đơn hàng (${skip + 1}-${skip + orders.length}/${totalCount})`,
                    3000
                );
            } else {
                showInfoBanner(`✅ Tải thành công ${mergedCampaigns.length} chiến dịch từ ${orders.length} đơn hàng`);
            }
        }

    } catch (error) {
        console.error("[CAMPAIGNS] Error loading campaigns:", error);
        showLoading(false);

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi khi tải danh sách chiến dịch: ${error.message}`, 4000);
        } else {
            alert("Lỗi khi tải danh sách chiến dịch: " + error.message);
        }
    }
}

async function populateCampaignFilter(campaigns, autoLoad = false) {
    const select = document.getElementById("campaignFilter");
    select.innerHTML = '<option value="">-- Chọn chiến dịch --</option>';
    campaigns.forEach((campaign, index) => {
        const option = document.createElement("option");
        // Sử dụng index làm value vì campaignId giờ là array
        option.value = index;
        option.textContent = campaign.displayName;
        option.dataset.campaign = JSON.stringify(campaign);
        select.appendChild(option);
    });

    if (campaigns.length > 0) {
        // Select first campaign by default
        select.value = 0;

        // Manually update selectedCampaign state without triggering search
        const selectedOption = select.options[select.selectedIndex];
        selectedCampaign = selectedOption?.dataset.campaign
            ? JSON.parse(selectedOption.dataset.campaign)
            : null;

        // ⭐ Load employee ranges for the selected campaign TRƯỚC KHI load dữ liệu
        if (selectedCampaign?.displayName) {
            console.log(`[EMPLOYEE] Auto-loading employee ranges for: ${selectedCampaign.displayName}`);
            await loadEmployeeRangesForCampaign(selectedCampaign.displayName);

            // ⭐ Re-render bảng nếu đã có dữ liệu (để apply employee ranges ngay)
            if (allData.length > 0) {
                console.log(`[EMPLOYEE] Re-rendering table with ${employeeRanges.length} employee ranges`);
                performTableSearch();
            }
        }

        if (autoLoad) {
            // 🎯 TỰ ĐỘNG TẢI DỮ LIỆU NGAY LẬP TỨC
            console.log('[AUTO-LOAD] Tự động tải dữ liệu chiến dịch:', campaigns[0].displayName);

            // Hiển thị thông báo đang tải
            if (window.notificationManager) {
                window.notificationManager.info(
                    `Đang tải dữ liệu chiến dịch: ${campaigns[0].displayName}`,
                    2000,
                    'Tự động tải'
                );
            }

            // Trigger search explicitly
            await handleSearch();

            // 🎯 AUTO-CONNECT REALTIME SERVER
            if (window.realtimeManager) {
                console.log('[AUTO-CONNECT] Connecting to Realtime Server (24/7)...');
                window.realtimeManager.connectServerMode();
            }
        } else {
            console.log('[MANUAL-SELECT] Đã chọn chiến dịch đầu tiên (chờ người dùng bấm Tải):', campaigns[0].displayName);
        }
    }
}

async function handleCampaignChange() {
    const select = document.getElementById("campaignFilter");
    const selectedOption = select.options[select.selectedIndex];
    selectedCampaign = selectedOption?.dataset.campaign
        ? JSON.parse(selectedOption.dataset.campaign)
        : null;

    // 🔥 Cleanup old Firebase TAG listeners
    cleanupTagRealtimeListeners();

    // ⭐ QUAN TRỌNG: Load employee ranges TRƯỚC KHI load dữ liệu
    // để đảm bảo bảng được phân chia đúng ngay từ đầu
    if (selectedCampaign?.displayName) {
        console.log(`[EMPLOYEE] Loading employee ranges for campaign: ${selectedCampaign.displayName}`);
        await loadEmployeeRangesForCampaign(selectedCampaign.displayName);
    } else {
        console.log('[EMPLOYEE] Loading general employee ranges (no campaign selected)');
        await loadEmployeeRangesForCampaign(null);
    }

    // Tự động load dữ liệu khi chọn chiến dịch
    if (selectedCampaign?.campaignId || selectedCampaign?.campaignIds) {
        await handleSearch();

        // 🎯 AUTO-CONNECT REALTIME SERVER
        if (window.realtimeManager) {
            console.log('[AUTO-CONNECT] Connecting to Realtime Server (24/7)...');
            window.realtimeManager.connectServerMode();
        }

        // 🔥 Setup new Firebase TAG listeners for this campaign
        setupTagRealtimeListeners();
    }
}

async function reloadTableData() {
    const btn = document.getElementById('reloadTableBtn');
    const icon = btn ? btn.querySelector('i') : null;

    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');

    try {
        if (!selectedCampaign?.campaignId && !selectedCampaign?.campaignIds) {
            if (window.notificationManager) {
                window.notificationManager.warning("Vui lòng chọn chiến dịch trước khi tải lại");
            } else {
                alert("Vui lòng chọn chiến dịch trước khi tải lại");
            }
            return;
        }

        await handleSearch();

        if (window.notificationManager) {
            window.notificationManager.success("Đã tải lại dữ liệu bảng thành công");
        }
    } catch (error) {
        console.error("Error reloading table:", error);
        if (window.notificationManager) {
            window.notificationManager.error("Lỗi khi tải lại dữ liệu: " + error.message);
        } else {
            alert("Lỗi khi tải lại dữ liệu: " + error.message);
        }
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
    }
}

async function handleSearch() {
    if (!selectedCampaign?.campaignId && !selectedCampaign?.campaignIds) {
        alert("Vui lòng chọn chiến dịch");
        return;
    }

    // Validate dates
    const startDateValue = document.getElementById("startDate").value;
    const endDateValue = document.getElementById("endDate").value;

    if (!startDateValue || !endDateValue) {
        alert("Vui lòng chọn khoảng thời gian (Từ ngày - Đến ngày)");
        return;
    }

    // Abort any ongoing background loading
    if (isLoadingInBackground) {
        console.log('[PROGRESSIVE] Aborting background loading for new search...');
        loadingAborted = true;
        // Wait a bit for background loading to stop
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    window.cacheManager.clear("orders");
    searchQuery = "";
    document.getElementById("tableSearchInput").value = "";
    document.getElementById("searchClearBtn").classList.remove("active");
    allData = [];
    await fetchOrders();
}

// Progressive loading state
let isLoadingInBackground = false;


async function fetchOrders() {
    try {
        showLoading(true);
        loadingAborted = false;

        const startDate = convertToUTC(
            document.getElementById("startDate").value,
        );
        const endDate = convertToUTC(document.getElementById("endDate").value);

        // Xử lý campaignId có thể là array (nhiều campaigns cùng ngày) hoặc single value
        const campaignIds = selectedCampaign.campaignIds || (Array.isArray(selectedCampaign.campaignId) ? selectedCampaign.campaignId : [selectedCampaign.campaignId]);

        // Tạo filter cho nhiều campaign IDs
        let campaignFilter;
        if (campaignIds.length === 1) {
            campaignFilter = `LiveCampaignId eq ${campaignIds[0]}`;
        } else {
            // Tạo filter dạng: (LiveCampaignId eq 123 or LiveCampaignId eq 456 or ...)
            const campaignConditions = campaignIds.map(id => `LiveCampaignId eq ${id}`).join(' or ');
            campaignFilter = `(${campaignConditions})`;
        }

        const filter = `(DateCreated ge ${startDate} and DateCreated le ${endDate}) and ${campaignFilter}`;
        console.log(`[FETCH] Fetching orders for ${campaignIds.length} campaign(s): ${campaignIds.join(', ')}`);

        const PAGE_SIZE = 1000; // API fetch size for background loading
        const INITIAL_PAGE_SIZE = 50; // Smaller size for instant first load
        const UPDATE_EVERY = 200; // Update UI every 200 orders
        let skip = 0;
        let hasMore = true;
        allData = [];
        const headers = await window.tokenManager.getAuthHeader();

        // ===== PHASE 1: Load first batch and show immediately =====
        console.log('[PROGRESSIVE] Loading first batch...');
        const firstUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView?$top=${INITIAL_PAGE_SIZE}&$skip=${skip}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}&$count=true`;
        const firstResponse = await fetch(firstUrl, {
            headers: { ...headers, accept: "application/json" },
        });
        if (!firstResponse.ok) throw new Error(`HTTP ${firstResponse.status}`);
        const firstData = await firstResponse.json();
        const firstOrders = firstData.value || [];
        totalCount = firstData["@odata.count"] || 0;

        allData = firstOrders;
        // Show UI immediately with first batch
        document.getElementById("statsBar").style.display = "flex";
        document.getElementById("tableContainer").style.display = "block";
        document.getElementById("searchSection").classList.add("active");

        performTableSearch(); // Apply merging and filters immediately
        updateSearchResultCount();
        showInfoBanner(
            `⏳ Đã tải ${allData.length}/${totalCount} đơn hàng. Đang tải thêm...`,
        );
        sendDataToTab2();

        // Load conversations and comment conversations for first batch
        console.log('[PROGRESSIVE] Loading conversations for first batch...');
        if (window.chatDataManager) {
            // Collect unique channel IDs from orders (parse from Facebook_PostId)
            const channelIds = [...new Set(
                allData
                    .map(order => window.chatDataManager.parseChannelId(order.Facebook_PostId))
                    .filter(id => id) // Remove null/undefined
            )];
            console.log('[PROGRESSIVE] Found channel IDs:', channelIds);

            // FIX: fetchConversations now uses Type="all" to fetch both messages and comments in 1 request
            // No need to call both methods anymore - this reduces API calls by 50%!
            // Force refresh (true) to always fetch fresh data when searching
            await window.chatDataManager.fetchConversations(true, channelIds);

            // Fetch Pancake conversations for unread info
            if (window.pancakeDataManager) {
                console.log('[PANCAKE] Fetching conversations for unread info...');
                await window.pancakeDataManager.fetchConversations(true);
                console.log('[PANCAKE] ✅ Conversations fetched');
            }

            performTableSearch(); // Re-apply filters and merge with new chat data
        }

        // Load tags in background
        loadAvailableTags().catch(err => console.error('[TAGS] Error loading tags:', err));

        // Detect edited notes using Firebase snapshots (fast, no API spam!)
        detectEditedNotes().then(() => {
            // Re-apply filters and merge with noteEdited flags
            performTableSearch();
            console.log('[NOTE-TRACKER] Table re-rendered with edit indicators');
        }).catch(err => console.error('[NOTE-TRACKER] Error detecting edited notes:', err));

        // Hide loading overlay after first batch
        showLoading(false);

        // ===== PHASE 2: Continue loading remaining orders in background =====
        hasMore = firstOrders.length === INITIAL_PAGE_SIZE;
        skip += INITIAL_PAGE_SIZE;

        if (hasMore) {
            isLoadingInBackground = true;
            console.log('[PROGRESSIVE] Starting background loading...');

            // Run background loading
            (async () => {
                try {
                    let lastUpdateCount = allData.length; // Track when we last updated

                    while (hasMore && !loadingAborted) {
                        const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView?$top=${PAGE_SIZE}&$skip=${skip}&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}`;
                        const response = await API_CONFIG.smartFetch(url, {
                            headers: { ...headers, accept: "application/json" },
                        });
                        if (!response.ok) {
                            console.error(`[PROGRESSIVE] Error fetching batch at skip=${skip}`);
                            break;
                        }

                        const data = await response.json();
                        const orders = data.value || [];

                        if (orders.length > 0) {
                            allData = allData.concat(orders);

                            // Update table every UPDATE_EVERY orders OR if this is the last batch
                            const shouldUpdate =
                                allData.length - lastUpdateCount >= UPDATE_EVERY ||
                                orders.length < PAGE_SIZE;

                            if (shouldUpdate) {
                                console.log(`[PROGRESSIVE] Updating table: ${allData.length}/${totalCount} orders`);
                                performTableSearch(); // Apply merging, employee filtering, and all other filters
                                updateSearchResultCount();
                                showInfoBanner(
                                    `⏳ Đã tải ${allData.length}/${totalCount} đơn hàng. Đang tải thêm...`,
                                );
                                sendDataToTab2();
                                lastUpdateCount = allData.length;
                            }
                        }

                        hasMore = orders.length === PAGE_SIZE;
                        skip += PAGE_SIZE;

                        // Small delay to allow UI interaction
                        if (hasMore) {
                            await new Promise((resolve) => setTimeout(resolve, 100));
                        }
                    }

                    // Final update
                    if (!loadingAborted) {
                        console.log('[PROGRESSIVE] Background loading completed');
                        performTableSearch(); // Final merge and render
                        updateSearchResultCount();
                        showInfoBanner(
                            `✅ Đã tải và hiển thị TOÀN BỘ ${filteredData.length} đơn hàng.`,
                        );
                        sendDataToTab2();
                    }

                } catch (error) {
                    console.error('[PROGRESSIVE] Background loading error:', error);
                } finally {
                    isLoadingInBackground = false;
                }
            })();
        } else {
            // No more data, we're done
            showInfoBanner(
                `✅ Đã tải và hiển thị TOÀN BỘ ${filteredData.length} đơn hàng.`,
            );
        }

    } catch (error) {
        console.error("Error fetching data:", error);

        // Better error messages
        let errorMessage = "Lỗi khi tải dữ liệu: ";
        if (error.message.includes("Invalid date")) {
            errorMessage += "Ngày tháng không hợp lệ. Vui lòng kiểm tra lại khoảng thời gian.";
        } else if (error.message.includes("Date value is required")) {
            errorMessage += "Vui lòng chọn khoảng thời gian (Từ ngày - Đến ngày).";
        } else {
            errorMessage += error.message;
        }

        if (window.notificationManager) {
            window.notificationManager.error(errorMessage, 4000);
        } else {
            alert(errorMessage);
        }

        showLoading(false);
    }
}

// =====================================================
// MANUAL ASSIGN "GIỎ TRỐNG" TAG (FOR SELECTED ORDERS)
// =====================================================
async function assignEmptyCartTagToSelected() {
    try {
        // Lấy danh sách đơn hàng đã được chọn
        const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]:checked');
        const selectedOrderIds = Array.from(checkboxes).map(cb => cb.value);

        if (selectedOrderIds.length === 0) {
            if (window.notificationManager) {
                window.notificationManager.warning('Vui lòng chọn ít nhất 1 đơn hàng', 3000);
            } else {
                alert('Vui lòng chọn ít nhất 1 đơn hàng');
            }
            return;
        }

        console.log(`[ASSIGN-TAG] Processing ${selectedOrderIds.length} selected orders...`);

        // Load tags nếu chưa có
        if (availableTags.length === 0) {
            console.log('[ASSIGN-TAG] Loading tags...');
            await loadAvailableTags();
        }

        // Tìm tag "GIỎ TRỐNG" trong availableTags
        const emptyCartTag = availableTags.find(tag =>
            tag.Name && tag.Name.toUpperCase() === "GIỎ TRỐNG"
        );

        if (!emptyCartTag) {
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy tag "GIỎ TRỐNG" trong hệ thống', 4000);
            } else {
                alert('Không tìm thấy tag "GIỎ TRỐNG" trong hệ thống');
            }
            return;
        }

        console.log('[ASSIGN-TAG] Found "GIỎ TRỐNG" tag:', emptyCartTag);

        // Lọc các đơn hàng có TotalQuantity = 0 và chưa có tag "GIỎ TRỐNG"
        const ordersNeedingTag = allData.filter(order => {
            // Phải nằm trong danh sách selected
            if (!selectedOrderIds.includes(order.Id)) return false;

            // Check TotalQuantity = 0
            if (order.TotalQuantity !== 0) return false;

            // Check xem đã có tag "GIỎ TRỐNG" chưa
            if (order.Tags) {
                try {
                    const tags = JSON.parse(order.Tags);
                    if (Array.isArray(tags)) {
                        const hasEmptyCartTag = tags.some(tag =>
                            tag.Name && tag.Name.toUpperCase() === "GIỎ TRỐNG"
                        );
                        if (hasEmptyCartTag) return false; // Đã có tag rồi
                    }
                } catch (e) {
                    // Parse error, coi như chưa có tag
                }
            }

            return true; // Cần thêm tag
        });

        if (ordersNeedingTag.length === 0) {
            console.log('[ASSIGN-TAG] No selected orders with TotalQuantity = 0 need "GIỎ TRỐNG" tag');

            // Đếm số đơn có số lượng > 0
            const nonZeroCount = allData.filter(order =>
                selectedOrderIds.includes(order.Id) && order.TotalQuantity > 0
            ).length;

            let message = '';
            if (nonZeroCount > 0) {
                message = `${nonZeroCount} đơn đã chọn có số lượng > 0, không cần gán tag "GIỎ TRỐNG"`;
            } else {
                message = 'Các đơn đã chọn đã có tag "GIỎ TRỐNG" rồi';
            }

            if (window.notificationManager) {
                window.notificationManager.info(message, 3000);
            } else {
                alert(message);
            }
            return;
        }

        console.log(`[ASSIGN-TAG] Found ${ordersNeedingTag.length} orders needing "GIỎ TRỐNG" tag`);

        // Thông báo cho user
        if (window.notificationManager) {
            window.notificationManager.info(
                `Đang gán tag "GIỎ TRỐNG" cho ${ordersNeedingTag.length} đơn hàng...`,
                3000
            );
        }

        // Gán tag cho từng order (với delay để tránh spam API)
        let successCount = 0;
        let failCount = 0;

        for (const order of ordersNeedingTag) {
            try {
                // Lấy tags hiện tại của order
                let currentTags = [];
                if (order.Tags) {
                    try {
                        currentTags = JSON.parse(order.Tags);
                    } catch (e) {
                        currentTags = [];
                    }
                }

                // Thêm tag "GIỎ TRỐNG"
                const newTags = [
                    ...currentTags,
                    {
                        Id: emptyCartTag.Id,
                        Name: emptyCartTag.Name,
                        Color: emptyCartTag.Color
                    }
                ];

                // Call API để gán tag
                const headers = await window.tokenManager.getAuthHeader();
                const payload = {
                    Tags: newTags.map(tag => ({
                        Id: tag.Id,
                        Color: tag.Color,
                        Name: tag.Name,
                    })),
                    OrderId: order.Id,
                };

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
                    }
                );

                if (response.ok) {
                    // Cập nhật tags trong allData
                    const updatedData = { Tags: JSON.stringify(newTags) };
                    updateOrderInTable(order.Id, updatedData);
                    successCount++;
                    console.log(`[ASSIGN-TAG] ✓ Tagged order ${order.Code}`);
                } else {
                    failCount++;
                    console.error(`[ASSIGN-TAG] ✗ Failed to tag order ${order.Code}: HTTP ${response.status}`);
                }

                // Delay 500ms giữa các requests để tránh spam API
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                failCount++;
                console.error(`[ASSIGN-TAG] ✗ Error tagging order ${order.Code}:`, error);
            }
        }

        // Thông báo kết quả
        console.log(`[ASSIGN-TAG] Completed: ${successCount} success, ${failCount} failed`);

        if (window.notificationManager) {
            if (successCount > 0) {
                window.notificationManager.success(
                    `Đã gán tag "GIỎ TRỐNG" cho ${successCount} đơn hàng${failCount > 0 ? ` (${failCount} lỗi)` : ''}`,
                    4000
                );
            }
            if (failCount > 0 && successCount === 0) {
                window.notificationManager.error(
                    `Không thể gán tag cho ${failCount} đơn hàng`,
                    4000
                );
            }
        }

        // Clear cache và refresh UI
        if (successCount > 0) {
            window.cacheManager.clear("orders");
            renderTable();
        }

    } catch (error) {
        console.error('[ASSIGN-TAG] Error in assignEmptyCartTagToSelected:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`, 4000);
        }
    }
}

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

function renderTable() {
    if (displayedData.length === 0) {
        const tbody = document.getElementById("tableBody");
        tbody.innerHTML =
            '<tr><td colspan="18" style="text-align: center; padding: 40px;">Không có dữ liệu</td></tr>';
        return;
    }

    // Check if user is admin
    let isAdmin = window.authManager && window.authManager.hasPermission(0);

    // Fallback: Check username string for Admin
    const auth = window.authManager ? window.authManager.getAuthState() : null;
    const currentUserType = auth && auth.userType ? auth.userType : null;
    if (!isAdmin && currentUserType) {
        const lowerName = currentUserType.toLowerCase();
        if (lowerName.includes('admin') || lowerName.includes('quản trị') || lowerName.includes('administrator')) {
            isAdmin = true;
        }
    }

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
}

function renderAllOrders() {
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
    // Check if we have more data to render
    if (renderedCount >= displayedData.length) return;

    const tbody = document.getElementById("tableBody");
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
}

function renderByEmployee() {
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

    // Hide the default table container
    const tableContainer = document.getElementById('tableContainer');
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
                                <th data-column="stt">STT</th>
                                <th data-column="employee" style="width: 90px;">Nhân viên</th>
                                <th data-column="tag">TAG</th>
                                <th data-column="order-code">Mã ĐH</th>
                                <th data-column="customer">Khách hàng</th>
                                <th data-column="messages">Tin nhắn</th>
                                <th data-column="comments">Bình luận</th>
                                <th data-column="phone">SĐT</th>
                                <th data-column="qr" style="width: 50px; text-align: center;">QR</th>
                                <th data-column="debt" style="width: 100px; text-align: right;">Công Nợ</th>
                                <th data-column="address">Địa chỉ</th>
                                <th data-column="notes">Ghi chú</th>
                                <th data-column="total">Tổng tiền</th>
                                <th data-column="quantity">SL</th>
                                <th data-column="created-date">Ngày tạo</th>
                                <th data-column="status">Trạng thái</th>
                                <th data-column="actions">Thao tác</th>
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

    return `
        <tr class="${rowClass} ${mergedClass}">
            <td><input type="checkbox" value="${order.Id}" ${selectedOrderIds.has(order.Id) ? 'checked' : ''} /></td>
            <td data-column="stt">
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span>${order.SessionIndex || ""}</span>
                    ${mergedIcon}
                </div>
            </td>
            <td data-column="employee" style="text-align: center;">${employeeHTML}</td>
            <td data-column="tag">
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                    <button class="tag-icon-btn" onclick="openTagModal('${order.Id}', '${order.Code}'); event.stopPropagation();" title="Quản lý tag" style="padding: 2px 6px;">
                        <i class="fas fa-tags"></i>
                    </button>
                    ${tagsHTML}
                </div>
            </td>
            <td data-column="order-code">
                <span>${highlight(order.Code)}</span>
            </td>
            <td data-column="customer"><div>${highlight(order.Name)}</div>${partnerStatusHTML}</td>
            ${messagesHTML}
            ${commentsHTML}
            <td data-column="phone" style="text-align: center;">${highlight(order.Telephone)}</td>
            <td data-column="qr" style="text-align: center;">${renderQRColumn(order.Telephone)}</td>
            <td data-column="debt" style="text-align: right;">${renderDebtColumn(order.Telephone)}</td>
            <td data-column="address">${highlight(order.Address)}</td>
            <td data-column="notes">${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(order.Note) : highlight(order.Note)}</td>
            ${renderMergedTotalColumn(order)}
            ${renderMergedQuantityColumn(order)}
            <td data-column="created-date">${new Date(order.DateCreated).toLocaleString("vi-VN")}</td>
            <td data-column="status"><span class="status-badge ${order.Status === "Draft" ? "status-draft" : "status-order"}" style="cursor: pointer;" onclick="openOrderStatusModal('${order.Id}', '${order.Status}')" data-order-id="${order.Id}" title="Click để thay đổi trạng thái">${highlight(order.StatusText || order.Status)}</span></td>
            <td data-column="actions">
                ${isMerged ? `
                    <div class="merged-edit-dropdown" style="position: relative; display: inline-block;">
                        <button class="btn-edit-icon" onclick="toggleMergedEditDropdown(this, event)" title="Chọn đơn hàng để chỉnh sửa">
                            <i class="fas fa-edit"></i>
                            <i class="fas fa-caret-down" style="font-size: 10px; margin-left: 2px;"></i>
                        </button>
                        <div class="merged-edit-options" style="display: none; position: absolute; right: 0; top: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; min-width: 100px;">
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
            </td>
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

// =====================================================
// MERGED ORDER COLUMNS - Messages & Comments (STT-based)
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

        if (window.chatDataManager && channelId && psid) {
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

        const unreadBadge = hasUnread ? '<span style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%; flex-shrink: 0;"></span>' : '';
        const fontWeight = hasUnread ? '600' : '400';
        const color = hasUnread ? '#111827' : '#6b7280';

        // Always show unread count if > 0
        const unreadText = unreadCount > 0 ? `<span style="font-size: 10px; color: #ef4444; font-weight: 600; margin-left: 4px;">${unreadCount} tin mới</span>` : '';

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
        return tags
            .map(
                (tag) =>
                    `<div style="margin-bottom: 2px;"><span class="order-tag" style="background-color: ${tag.Color || "#6b7280"}; cursor: pointer;" onclick="openTagModal('${orderId}', '${orderCode}'); event.stopPropagation();" title="Quản lý tag">${tag.Name || ""}</span></div>`,
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
    localStorage.setItem("tab1_filter_data", JSON.stringify(filterData));
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
    const checkedCount = selectedOrderIds.size;

    if (checkedCount > 0) {
        actionButtonsSection.style.display = 'flex';
        selectedCountSpan.textContent = checkedCount.toLocaleString('vi-VN');
    } else {
        actionButtonsSection.style.display = 'none';
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

let hasUnsavedOrderChanges = false;

// Toggle merged order edit dropdown
function toggleMergedEditDropdown(button, event) {
    event.stopPropagation();
    const dropdown = button.parentElement;
    const options = dropdown.querySelector('.merged-edit-options');

    // Close all other dropdowns first
    document.querySelectorAll('.merged-edit-options').forEach(opt => {
        if (opt !== options) opt.style.display = 'none';
    });

    // Toggle this dropdown
    options.style.display = options.style.display === 'none' ? 'block' : 'none';
}

// Close all merged edit dropdowns
function closeMergedEditDropdown() {
    document.querySelectorAll('.merged-edit-options').forEach(opt => {
        opt.style.display = 'none';
    });
}

// Close dropdown when clicking outside
document.addEventListener('click', function (e) {
    if (!e.target.closest('.merged-edit-dropdown')) {
        closeMergedEditDropdown();
    }
});

async function openEditModal(orderId) {
    currentEditOrderId = orderId;
    hasUnsavedOrderChanges = false; // Reset dirty flag
    const modal = document.getElementById("editOrderModal");
    modal.classList.add("show");
    switchEditTab("info");
    document.getElementById("editModalBody").innerHTML =
        `<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Đang tải dữ liệu đơn hàng...</div></div>`;
    try {
        await fetchOrderData(orderId);
    } catch (error) {
        showErrorState(error.message);
    }
}

async function fetchOrderData(orderId) {
    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
    });
    if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    currentEditOrderData = await response.json();
    updateModalWithData(currentEditOrderData);
}

function updateModalWithData(data) {
    document.getElementById("modalOrderCode").textContent = data.Code || "";
    document.getElementById("lastUpdated").textContent = new Date(
        data.LastUpdated,
    ).toLocaleString("vi-VN");
    document.getElementById("productCount").textContent =
        data.Details?.length || 0;
    switchEditTab("info");

    // 🔄 Refresh inline search UI after data is loaded
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
        refreshInlineSearchUI();
    }, 100);
}

function switchEditTab(tabName) {
    document
        .querySelectorAll(".edit-tab-btn")
        .forEach((btn) => btn.classList.remove("active"));
    const activeTab = document.querySelector(
        `.edit-tab-btn[onclick*="${tabName}"]`,
    );
    if (activeTab) activeTab.classList.add("active");
    renderTabContent(tabName);
    if (tabName === "products") initInlineSearchAfterRender();
}

function renderTabContent(tabName) {
    const body = document.getElementById("editModalBody");
    if (!currentEditOrderData) {
        body.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div></div>`;
        return;
    }
    const renderers = {
        info: renderInfoTab,
        products: renderProductsTab,
        delivery: renderDeliveryTab,
        live: renderLiveTab,
        invoices: renderInvoicesTab,
        invoice_history: renderInvoiceHistoryTab,
        history: renderHistoryTab,
    };
    body.innerHTML = renderers[tabName]
        ? renderers[tabName](currentEditOrderData)
        : `<div class="empty-state"><p>Tab không tồn tại</p></div>`;
}

function renderInfoTab(data) {
    return `
        <div class="info-card">
            <h4><i class="fas fa-user"></i> Thông tin khách hàng</h4>
            <div class="info-grid">
                <div class="info-field"><div class="info-label">Tên khách hàng</div><div class="info-value highlight">${data.Name || ""}</div></div>
                <div class="info-field">
                    <div class="info-label">Điện thoại</div>
                    <div class="info-value">
                        <input type="text" class="form-control" value="${data.Telephone || ""}" 
                            onchange="updateOrderInfo('Telephone', this.value)" 
                            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                </div>
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Địa chỉ đầy đủ</div>
                    <div class="info-value">
                        <textarea class="form-control" 
                            onchange="updateOrderInfo('Address', this.value)" 
                            style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; min-height: 60px; resize: vertical;">${data.Address || ""}</textarea>
                    </div>
                </div>
                <div class="info-field" style="grid-column: 1 / -1; margin-top: 10px; border-top: 1px solid #eee; padding-top: 10px;">
                    <div class="info-label" style="color: #2563eb; font-weight: 600;">Tra cứu địa chỉ</div>
                    <div class="info-value">
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="text" id="fullAddressLookupInput" class="form-control" placeholder="Nhập địa chỉ đầy đủ (VD: 28/6 phạm văn chiêu...)" 
                                style="flex: 1; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px;"
                                onkeydown="if(event.key === 'Enter') handleFullAddressLookup()">
                            <button type="button" class="btn-primary" onclick="handleFullAddressLookup()" style="padding: 6px 12px; background: #059669; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-magic"></i> Tìm Full
                            </button>
                        </div>
                        <div id="addressLookupResults" style="display: none; border: 1px solid #e5e7eb; border-radius: 4px; max-height: 400px; overflow-y: auto; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <!-- Results will be populated here -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="info-card">
            <h4><i class="fas fa-shopping-cart"></i> Thông tin đơn hàng</h4>
            <div class="info-grid">
                <div class="info-field"><div class="info-label">Mã đơn</div><div class="info-value highlight">${data.Code || ""}</div></div>
                <div class="info-field"><div class="info-label">Trạng thái</div><div class="info-value"><span class="status-badge-large ${data.Status === "Draft" ? "status-badge-draft" : "status-badge-order"}">${data.StatusText || data.Status || ""}</span></div></div>
                <div class="info-field"><div class="info-label">Tổng tiền</div><div class="info-value highlight">${(data.TotalAmount || 0).toLocaleString("vi-VN")}đ</div></div>
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Ghi chú</div>
                    <div class="info-value">${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(data.Note || "") : (data.Note || "")}</div>
                </div>
            </div>
        </div>`;
}

function updateOrderInfo(field, value) {
    if (!currentEditOrderData) return;
    currentEditOrderData[field] = value;
    hasUnsavedOrderChanges = true; // Set dirty flag

    // Show quick feedback
    if (window.showSaveIndicator) {
        showSaveIndicator("success", "Đã cập nhật thông tin (chưa lưu)");
    } else if (window.notificationManager) {
        window.notificationManager.show("Đã cập nhật thông tin (chưa lưu)", "info");
    }
}

function renderProductsTab(data) {
    const inlineSearchHTML = `
        <div class="product-search-inline">
            <div class="search-input-wrapper">
                <i class="fas fa-search search-icon"></i>
                <input type="text" id="inlineProductSearch" class="inline-search-input" placeholder="Tìm sản phẩm theo tên hoặc mã..." autocomplete="off">
            </div>
            <div id="inlineSearchResults" class="inline-search-results"></div>
        </div>`;

    if (!data.Details || data.Details.length === 0) {
        return `<div class="info-card">${inlineSearchHTML}<div class="empty-state"><i class="fas fa-box-open"></i><p>Chưa có sản phẩm</p></div></div>`;
    }

    const productsHTML = data.Details.map(
        (p, i) => `
        <tr class="product-row" data-index="${i}">
            <td>${i + 1}</td>
            <td>${p.ImageUrl ? `<img src="${p.ImageUrl}" class="product-image">` : ""}</td>
            <td><div>${p.ProductNameGet || p.ProductName}</div><div style="font-size: 11px; color: #6b7280;">Mã: ${p.ProductCode || "N/A"}</div></td>
            <td style="text-align: center;"><div class="quantity-controls"><button onclick="updateProductQuantity(${i}, -1)" class="qty-btn"><i class="fas fa-minus"></i></button><input type="number" class="quantity-input" value="${p.Quantity || 1}" onchange="updateProductQuantity(${i}, 0, this.value)" min="1"><button onclick="updateProductQuantity(${i}, 1)" class="qty-btn"><i class="fas fa-plus"></i></button></div></td>
            <td style="text-align: right;">${(p.Price || 0).toLocaleString("vi-VN")}đ</td>
            <td style="text-align: right; font-weight: 600;">${((p.Quantity || 0) * (p.Price || 0)).toLocaleString("vi-VN")}đ</td>
            <td><input type="text" class="note-input" value="${p.Note || ""}" onchange="updateProductNote(${i}, this.value)"></td>
            <td style="text-align: center;"><div class="action-buttons"><button onclick="editProductDetail(${i})" class="btn-product-action btn-edit-item" title="Sửa"><i class="fas fa-edit"></i></button><button onclick="removeProduct(${i})" class="btn-product-action btn-delete-item" title="Xóa"><i class="fas fa-trash"></i></button></div></td>
        </tr>`,
    ).join("");

    return `
        <div class="info-card">
            ${inlineSearchHTML}
            <h4 style="margin-top: 24px;"><i class="fas fa-box"></i> Danh sách sản phẩm (${data.Details.length})</h4>
            <table class="products-table">
                <thead><tr><th>#</th><th>Ảnh</th><th>Sản phẩm</th><th style="text-align: center;">SL</th><th style="text-align: right;">Đơn giá</th><th style="text-align: right;">Thành tiền</th><th>Ghi chú</th><th style="text-align: center;">Thao tác</th></tr></thead>
                <tbody id="productsTableBody">${productsHTML}</tbody>
                <tfoot style="background: #f9fafb; font-weight: 600;"><tr><td colspan="3" style="text-align: right;">Tổng cộng:</td><td style="text-align: center;" id="totalQuantity">${data.TotalQuantity || 0}</td><td></td><td style="text-align: right; color: #3b82f6;" id="totalAmount">${(data.TotalAmount || 0).toLocaleString("vi-VN")}đ</td><td colspan="2"></td></tr></tfoot>
            </table>
        </div>`;
}

function renderDeliveryTab(data) {
    return `<div class="empty-state"><p>Thông tin giao hàng</p></div>`;
}
function renderLiveTab(data) {
    // Display live stream information if available
    const liveInfo = data.CRMTeam || {};
    const hasLiveInfo = liveInfo && liveInfo.Name;

    if (!hasLiveInfo) {
        return `
            <div class="empty-state">
                <i class="fas fa-video" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                <p style="color: #6b7280; margin-bottom: 8px;">Không có thông tin chiến dịch live</p>
                <p style="color: #9ca3af; font-size: 13px;">Đơn hàng này chưa được liên kết với chiến dịch live nào</p>
            </div>
        `;
    }

    return `
        <div class="info-card">
            <h4><i class="fas fa-video"></i> Thông tin Livestream</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Tên chiến dịch</div>
                    <div class="info-value highlight">${liveInfo.Name || 'N/A'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Mã chiến dịch</div>
                    <div class="info-value">${liveInfo.Code || 'N/A'}</div>
                </div>
                ${liveInfo.Description ? `
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Mô tả</div>
                    <div class="info-value">${liveInfo.Description}</div>
                </div>
                ` : ''}
            </div>
        </div>
        <div class="info-card">
            <h4><i class="fas fa-info-circle"></i> Thông tin bổ sung</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Người phụ trách</div>
                    <div class="info-value">${data.User?.Name || 'N/A'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Thời gian tạo đơn</div>
                    <div class="info-value">${data.CreatedDate ? new Date(data.CreatedDate).toLocaleString('vi-VN') : 'N/A'}</div>
                </div>
            </div>
        </div>
    `;
}
function renderInvoicesTab(data) {
    // Display invoice/payment information
    const hasInvoice = data.InvoiceNumber || data.InvoiceDate;

    return `
        <div class="info-card">
            <h4><i class="fas fa-file-invoice-dollar"></i> Thông tin hóa đơn & thanh toán</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Số hóa đơn</div>
                    <div class="info-value highlight">${data.InvoiceNumber || 'Chưa xuất hóa đơn'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Ngày xuất hóa đơn</div>
                    <div class="info-value">${data.InvoiceDate ? new Date(data.InvoiceDate).toLocaleString('vi-VN') : 'N/A'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Tổng tiền</div>
                    <div class="info-value highlight" style="color: #059669; font-weight: 700;">
                        ${(data.TotalAmount || 0).toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Đã thanh toán</div>
                    <div class="info-value" style="color: ${data.PaidAmount > 0 ? '#059669' : '#6b7280'};">
                        ${(data.PaidAmount || 0).toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Còn lại</div>
                    <div class="info-value" style="color: ${(data.TotalAmount - (data.PaidAmount || 0)) > 0 ? '#ef4444' : '#059669'};">
                        ${((data.TotalAmount || 0) - (data.PaidAmount || 0)).toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Trạng thái thanh toán</div>
                    <div class="info-value">
                        <span class="status-badge-large ${data.PaidAmount >= data.TotalAmount ? 'status-badge-paid' :
            data.PaidAmount > 0 ? 'status-badge-partial' : 'status-badge-unpaid'
        }">
                            ${data.PaidAmount >= data.TotalAmount ? 'Đã thanh toán' :
            data.PaidAmount > 0 ? 'Thanh toán một phần' : 'Chưa thanh toán'
        }
                        </span>
                    </div>
                </div>
            </div>
        </div>
        
        ${data.PaymentMethod ? `
        <div class="info-card">
            <h4><i class="fas fa-credit-card"></i> Phương thức thanh toán</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Phương thức</div>
                    <div class="info-value">${data.PaymentMethod}</div>
                </div>
                ${data.PaymentNote ? `
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Ghi chú thanh toán</div>
                    <div class="info-value">${data.PaymentNote}</div>
                </div>
                ` : ''}
            </div>
        </div>
        ` : ''}
        
        ${!hasInvoice ? `
        <div class="empty-state">
            <i class="fas fa-file-invoice" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
            <p style="color: #9ca3af; font-size: 13px;">Đơn hàng chưa có hóa đơn chi tiết</p>
        </div>
        ` : ''}
    `;
}
async function renderHistoryTab(data) {
    // Show loading state initially
    const loadingHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">Đang tải lịch sử chỉnh sửa...</div>
        </div>
    `;

    // Return loading first, then fetch data
    setTimeout(async () => {
        try {
            await fetchAndDisplayAuditLog(data.Id);
        } catch (error) {
            console.error('[AUDIT LOG] Error fetching audit log:', error);
            document.getElementById('editModalBody').innerHTML = `
                <div class="empty-state" style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>Không thể tải lịch sử chỉnh sửa</p>
                    <p style="font-size: 13px; color: #6b7280;">${error.message}</p>
                    <button class="btn-primary" style="margin-top: 16px;" onclick="switchEditTab('history')">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    }, 100);

    return loadingHTML;
}

async function renderInvoiceHistoryTab(data) {
    const loadingHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">Đang tải lịch sử hóa đơn...</div>
        </div>
    `;

    // Return loading first, then fetch data
    setTimeout(async () => {
        try {
            const partnerId = data.PartnerId || (data.Partner && data.Partner.Id);
            if (!partnerId) {
                throw new Error("Không tìm thấy thông tin khách hàng (PartnerId)");
            }
            await fetchAndDisplayInvoiceHistory(partnerId);
        } catch (error) {
            console.error('[INVOICE HISTORY] Error:', error);
            document.getElementById('editModalBody').innerHTML = `
                <div class="empty-state" style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>Không thể tải lịch sử hóa đơn</p>
                    <p style="font-size: 13px; color: #6b7280;">${error.message}</p>
                    <button class="btn-primary" style="margin-top: 16px;" onclick="switchEditTab('invoice_history')">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    }, 100);

    return loadingHTML;
}

async function fetchAndDisplayInvoiceHistory(partnerId) {
    // Calculate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetOrdersByPartnerId?partnerId=${partnerId}&fromDate=${startDate.toISOString()}&toDate=${endDate.toISOString()}`;

    console.log('[INVOICE HISTORY] Fetching history for partner:', partnerId);

    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[INVOICE HISTORY] Received data:', data);
    document.getElementById('editModalBody').innerHTML = renderInvoiceHistoryTable(data.value || []);
}

function renderInvoiceHistoryTable(invoices) {
    if (invoices.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-file-invoice" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                <p style="color: #6b7280; margin-bottom: 8px;">Không có lịch sử hóa đơn</p>
                <p style="color: #9ca3af; font-size: 13px;">Khách hàng chưa có đơn hàng nào trong 30 ngày qua</p>
            </div>
        `;
    }

    const rows = invoices.map((inv, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><a href="https://tomato.tpos.vn/#/app/fastsaleorder/invoiceform1?id=${inv.Id}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">${inv.Number || 'N/A'}</a></td>
            <td style="text-align: right; font-weight: 600;">${(inv.AmountTotal || 0).toLocaleString('vi-VN')}đ</td>
            <td style="text-align: center;">
                <span class="status-badge-large ${inv.State === 'completed' ? 'status-badge-paid' : 'status-badge-order'}">
                    ${inv.ShowState || inv.State || 'N/A'}
                </span>
            </td>
            <td>${inv.DateInvoice ? new Date(inv.DateInvoice).toLocaleString('vi-VN') : 'N/A'}</td>
        </tr>
    `).join('');

    return `
        <div class="info-card">
            <h4><i class="fas fa-history"></i> Lịch sử hóa đơn (30 ngày gần nhất)</h4>
            <div class="table-wrapper" style="max-height: 400px; overflow-y: auto;">
                <table class="table" style="margin-top: 16px; width: 100%;">
                    <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                        <tr>
                            <th style="width: 50px;">#</th>
                            <th>Mã hóa đơn</th>
                            <th style="text-align: right;">Tổng tiền</th>
                            <th style="text-align: center;">Trạng thái</th>
                            <th>Ngày tạo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function fetchAndDisplayAuditLog(orderId) {
    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/AuditLog/ODataService.GetAuditLogEntity?entityName=SaleOnline_Order&entityId=${orderId}&skip=0&take=50`;

    console.log('[AUDIT LOG] Fetching audit log for order:', orderId);

    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const auditData = await response.json();
    console.log('[AUDIT LOG] Received audit log:', auditData);

    // Display the audit log
    document.getElementById('editModalBody').innerHTML = renderAuditLogTimeline(auditData.value || []);
}

function renderAuditLogTimeline(auditLogs) {
    if (auditLogs.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-history" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                <p style="color: #6b7280; margin-bottom: 8px;">Chưa có lịch sử chỉnh sửa</p>
                <p style="color: #9ca3af; font-size: 13px;">Các thay đổi trên đơn hàng sẽ được ghi lại tại đây</p>
            </div>
        `;
    }

    // Map action to icon and color
    const actionConfig = {
        'CREATE': { icon: 'plus-circle', color: '#3b82f6', label: 'Tạo mới' },
        'UPDATE': { icon: 'edit', color: '#8b5cf6', label: 'Cập nhật' },
        'DELETE': { icon: 'trash', color: '#ef4444', label: 'Xóa' },
        'APPROVE': { icon: 'check-circle', color: '#10b981', label: 'Phê duyệt' },
        'REJECT': { icon: 'x-circle', color: '#ef4444', label: 'Từ chối' }
    };

    return `
        <div class="history-timeline">
            <div class="timeline-header">
                <h4><i class="fas fa-history"></i> Lịch sử thay đổi</h4>
                <span class="timeline-count">${auditLogs.length} thay đổi</span>
            </div>
            <div class="timeline-content">
                ${auditLogs.map((log, index) => {
        const config = actionConfig[log.Action] || { icon: 'circle', color: '#6b7280', label: log.Action };
        const date = new Date(log.DateCreated);
        const description = formatAuditDescription(log.Description);

        return `
                        <div class="timeline-item ${index === 0 ? 'timeline-item-latest' : ''}">
                            <div class="timeline-marker" style="background: ${config.color};">
                                <i class="fas fa-${config.icon}"></i>
                            </div>
                            <div class="timeline-card">
                                <div class="timeline-card-header">
                                    <div>
                                        <div class="timeline-action">
                                            <span class="action-badge" style="background: ${config.color};">${config.label}</span>
                                            ${log.Code ? `<span class="action-code">${log.Code}</span>` : ''}
                                        </div>
                                        <div class="timeline-user">
                                            <i class="fas fa-user"></i> ${log.UserName || 'Hệ thống'}
                                        </div>
                                    </div>
                                    <div class="timeline-date">
                                        <i class="fas fa-clock"></i>
                                        ${date.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}
                                    </div>
                                </div>
                                ${description ? `
                                <div class="timeline-details">
                                    ${description}
                                </div>
                                ` : ''}
                                ${log.TransactionId ? `
                                <div class="timeline-meta">
                                    <i class="fas fa-fingerprint"></i>
                                    <span style="font-family: monospace; font-size: 11px; color: #9ca3af;">
                                        ${log.TransactionId.substring(0, 8)}...
                                    </span>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
        
        <div class="audit-summary">
            <h4><i class="fas fa-chart-bar"></i> Thống kê</h4>
            <div class="audit-stats">
                <div class="audit-stat-item">
                    <div class="audit-stat-value">${auditLogs.length}</div>
                    <div class="audit-stat-label">Tổng thay đổi</div>
                </div>
                <div class="audit-stat-item">
                    <div class="audit-stat-value">${[...new Set(auditLogs.map(l => l.UserName))].length}</div>
                    <div class="audit-stat-label">Người chỉnh sửa</div>
                </div>
                <div class="audit-stat-item">
                    <div class="audit-stat-value">
                        ${auditLogs.length > 0 ? new Date(auditLogs[0].DateCreated).toLocaleDateString('vi-VN') : 'N/A'}
                    </div>
                    <div class="audit-stat-label">Cập nhật cuối</div>
                </div>
            </div>
        </div>
    `;
}

function formatAuditDescription(description) {
    if (!description) return '';

    // Try to decode encoded strings first
    if (window.DecodingUtility) {
        // Find potential encoded strings (long, no spaces, Base64URL chars)
        description = description.replace(/\b([A-Za-z0-9\-_=]{20,})\b/g, (match) => {
            // Check if it can be decoded
            const decoded = window.DecodingUtility.decodeProductLine(match);
            if (decoded) {
                // Use the utility to format it
                return window.DecodingUtility.formatNoteWithDecodedData(match);
            }
            return match;
        });
    }

    // Replace \r\n with <br> and format the text
    let formatted = description
        .replace(/\r\n/g, '<br>')
        .replace(/\n/g, '<br>');

    // Highlight changes with arrows (=>)
    formatted = formatted.replace(/(\d+(?:,\d+)*(?:\.\d+)?)\s*=>\s*(\d+(?:,\d+)*(?:\.\d+)?)/g,
        '<span class="change-from">$1</span> <i class="fas fa-arrow-right" style="color: #6b7280; font-size: 10px;"></i> <span class="change-to">$2</span>');

    // Highlight product codes and names (e.g., "0610 A3 ÁO TN HT")
    formatted = formatted.replace(/(\d{4}\s+[A-Z0-9]+\s+[^:]+):/g,
        '<strong style="color: #3b82f6;">$1</strong>:');

    // Highlight "Thêm chi tiết"
    formatted = formatted.replace(/Thêm chi tiết/g,
        '<span style="color: #10b981; font-weight: 600;"><i class="fas fa-plus-circle"></i> Thêm chi tiết</span>');

    // Highlight "Xóa chi tiết"  
    formatted = formatted.replace(/Xóa chi tiết/g,
        '<span style="color: #ef4444; font-weight: 600;"><i class="fas fa-minus-circle"></i> Xóa chi tiết</span>');

    return formatted;
}

function showErrorState(message) {
    document.getElementById("editModalBody").innerHTML =
        `<div class="empty-state" style="color: #ef4444;"><i class="fas fa-exclamation-triangle"></i><p>Lỗi: ${message}</p><button class="btn-primary" onclick="fetchOrderData('${currentEditOrderId}')">Thử lại</button></div>`;
}

function closeEditModal() {
    if (hasUnsavedOrderChanges) {
        // Use custom confirm popup since native confirm may be blocked
        window.notificationManager.confirm(
            "Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn đóng không?",
            "Cảnh báo"
        ).then(result => {
            if (result) {
                forceCloseEditModal();
            }
        });
        return;
    }
    forceCloseEditModal();
}

function forceCloseEditModal() {
    document.getElementById("editOrderModal").classList.remove("show");
    currentEditOrderData = null;
    currentEditOrderId = null;
    hasUnsavedOrderChanges = false;
}

function printOrder() {
    window.print();
}

// =====================================================
// IN-MODAL PRODUCT EDITING (NEW FUNCTIONS)
// =====================================================
function updateProductQuantity(index, change, value = null) {
    const product = currentEditOrderData.Details[index];
    let newQty =
        value !== null ? parseInt(value, 10) : (product.Quantity || 0) + change;
    if (newQty < 1) newQty = 1;
    product.Quantity = newQty;

    const row = document.querySelector(
        `#productsTableBody tr[data-index='${index}']`,
    );
    if (row) {
        row.querySelector(".quantity-input").value = newQty;
        row.querySelector("td:nth-child(6)").textContent =
            (newQty * (product.Price || 0)).toLocaleString("vi-VN") + "đ";
    }
    recalculateTotals();
    showSaveIndicator("success", "Số lượng đã cập nhật");

    // 🔄 Refresh inline search UI to reflect quantity change
    refreshInlineSearchUI();
}

function updateProductNote(index, note) {
    currentEditOrderData.Details[index].Note = note;
    showSaveIndicator("success", "Ghi chú đã cập nhật");
}

async function removeProduct(index) {
    const product = currentEditOrderData.Details[index];
    const confirmed = await window.notificationManager.confirm(
        `Xóa sản phẩm "${product.ProductNameGet || product.ProductName}"?`,
        "Xác nhận xóa"
    );
    if (!confirmed) return;

    // Remove product from array
    currentEditOrderData.Details.splice(index, 1);

    // Recalculate totals BEFORE re-rendering
    recalculateTotals();

    // Re-render products tab with updated data
    switchEditTab("products");

    showSaveIndicator("success", "Đã xóa sản phẩm");

    // 🔄 Refresh inline search UI to remove green highlight and badge
    refreshInlineSearchUI();
}

function editProductDetail(index) {
    const row = document.querySelector(
        `#productsTableBody tr[data-index='${index}']`,
    );
    const product = currentEditOrderData.Details[index];
    const priceCell = row.querySelector("td:nth-child(5)");
    const actionCell = row.querySelector("td:nth-child(8) .action-buttons");
    priceCell.innerHTML = `<input type="number" class="edit-input" id="price-edit-${index}" value="${product.Price || 0}">`;
    actionCell.innerHTML = `
        <button onclick="saveProductDetail(${index})" class="btn-product-action btn-save-item" title="Lưu"><i class="fas fa-check"></i></button>
        <button onclick="cancelProductDetail(${index})" class="btn-product-action btn-cancel-item" title="Hủy"><i class="fas fa-times"></i></button>`;
    document.getElementById(`price-edit-${index}`).focus();
}

function saveProductDetail(index) {
    const product = currentEditOrderData.Details[index];
    const newPrice = parseInt(document.getElementById(`price-edit-${index}`).value, 10) || 0;

    // Update price
    product.Price = newPrice;

    // Recalculate totals BEFORE re-rendering
    recalculateTotals();

    // Re-render products tab with updated data
    switchEditTab("products");

    showSaveIndicator("success", "Giá đã cập nhật");

    // 🔄 Refresh inline search UI (in case price affects display)
    refreshInlineSearchUI();
}

function cancelProductDetail() {
    switchEditTab("products");
}

function recalculateTotals() {
    let totalQty = 0;
    let totalAmount = 0;
    currentEditOrderData.Details.forEach((p) => {
        totalQty += p.Quantity || 0;
        totalAmount += (p.Quantity || 0) * (p.Price || 0);
    });
    currentEditOrderData.TotalQuantity = totalQty;
    currentEditOrderData.TotalAmount = totalAmount;

    // Update DOM elements if they exist (may not exist if tab is not rendered yet)
    const totalQuantityEl = document.getElementById("totalQuantity");
    const totalAmountEl = document.getElementById("totalAmount");
    const productCountEl = document.getElementById("productCount");

    if (totalQuantityEl) {
        totalQuantityEl.textContent = totalQty;
    }
    if (totalAmountEl) {
        totalAmountEl.textContent = totalAmount.toLocaleString("vi-VN") + "đ";
    }
    if (productCountEl) {
        productCountEl.textContent = currentEditOrderData.Details.length;
    }
}

async function saveAllOrderChanges() {
    console.log('[SAVE DEBUG] saveAllOrderChanges called at:', new Date().toISOString());

    // Use custom confirm popup since native confirm may be blocked
    const userConfirmed = await window.notificationManager.confirm(
        "Lưu tất cả thay đổi cho đơn hàng này?",
        "Xác nhận lưu"
    );
    console.log('[SAVE DEBUG] User confirmed:', userConfirmed);

    if (!userConfirmed) return;

    let notifId = null;

    try {
        // Show loading notification
        if (window.notificationManager) {
            notifId = window.notificationManager.saving("Đang lưu đơn hàng...");
        }

        // Prepare payload
        const payload = prepareOrderPayload(currentEditOrderData);

        // Validate payload (optional but recommended)
        const validation = validatePayloadBeforePUT(payload);
        if (!validation.valid) {
            throw new Error(
                `Payload validation failed: ${validation.errors.join(", ")}`,
            );
        }

        console.log("[SAVE] Payload to send:", payload);
        console.log(
            "[SAVE] Payload size:",
            JSON.stringify(payload).length,
            "bytes",
        );

        // Get auth headers
        const headers = await window.tokenManager.getAuthHeader();

        // PUT request
        const response = await API_CONFIG.smartFetch(
            `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${currentEditOrderId})`,
            {
                method: "PUT",
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(payload),
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[SAVE] Error response:", errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Success
        if (window.notificationManager && notifId) {
            window.notificationManager.remove(notifId);
            window.notificationManager.success("Đã lưu thành công!", 2000);
        }

        hasUnsavedOrderChanges = false; // Reset dirty flag after save

        // Clear cache và reload data từ API
        window.cacheManager.clear("orders");

        // 🔒 Preserve Tags từ dữ liệu cũ trước khi fetch
        const existingOrder = allData.find(order => order.Id === currentEditOrderId);
        const preservedTags = existingOrder ? existingOrder.Tags : null;

        await fetchOrderData(currentEditOrderId);

        // 🔄 Restore Tags nếu API không trả về
        if (currentEditOrderData && !currentEditOrderData.Tags && preservedTags) {
            currentEditOrderData.Tags = preservedTags;
        }

        // 🔄 CẬP NHẬT BẢNG CHÍNH VỚI DỮ LIỆU MỚI
        updateOrderInTable(currentEditOrderId, currentEditOrderData);

        // 🔄 Refresh inline search UI after save and reload
        refreshInlineSearchUI();

        console.log("[SAVE] Order saved successfully ✓");
    } catch (error) {
        console.error("[SAVE] Error:", error);

        if (window.notificationManager) {
            if (notifId) {
                window.notificationManager.remove(notifId);
            }
            window.notificationManager.error(
                `Lỗi khi lưu: ${error.message}`,
                5000,
            );
        }
    }
}

// =====================================================
// PREPARE PAYLOAD FOR PUT REQUEST
// =====================================================
function prepareOrderPayload(orderData) {
    console.log("[PAYLOAD] Preparing payload for PUT request...");

    // Clone dữ liệu để không ảnh hưởng original
    const payload = JSON.parse(JSON.stringify(orderData));

    // THÊM @odata.context
    if (!payload["@odata.context"]) {
        payload["@odata.context"] =
            "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity";
        console.log("[PAYLOAD] ✓ Added @odata.context");
    }

    // ✅ CRITICAL FIX: XỬ LÝ DETAILS ARRAY
    if (payload.Details && Array.isArray(payload.Details)) {
        payload.Details = payload.Details.map((detail, index) => {
            const cleaned = { ...detail };

            // ✅ XÓA Id nếu null/undefined
            if (
                !cleaned.Id ||
                cleaned.Id === null ||
                cleaned.Id === undefined
            ) {
                delete cleaned.Id;
                console.log(
                    `[PAYLOAD FIX] Detail[${index}]: Removed Id:null for ProductId:`,
                    cleaned.ProductId,
                );
            } else {
                console.log(
                    `[PAYLOAD] Detail[${index}]: Keeping existing Id:`,
                    cleaned.Id,
                );
            }

            // Đảm bảo OrderId match
            cleaned.OrderId = payload.Id;

            return cleaned;
        });
    }

    // Statistics
    const newDetailsCount = payload.Details?.filter((d) => !d.Id).length || 0;
    const existingDetailsCount =
        payload.Details?.filter((d) => d.Id).length || 0;

    const summary = {
        orderId: payload.Id,
        orderCode: payload.Code,
        topLevelFields: Object.keys(payload).length,
        detailsCount: payload.Details?.length || 0,
        newDetails: newDetailsCount,
        existingDetails: existingDetailsCount,
        hasContext: !!payload["@odata.context"],
        hasPartner: !!payload.Partner,
        hasUser: !!payload.User,
        hasCRMTeam: !!payload.CRMTeam,
        hasRowVersion: !!payload.RowVersion,
    };

    console.log("[PAYLOAD] ✓ Payload prepared successfully:", summary);

    // Validate critical fields
    if (!payload.RowVersion) {
        console.warn("[PAYLOAD] ⚠️ WARNING: Missing RowVersion!");
    }
    if (!payload["@odata.context"]) {
        console.error("[PAYLOAD] ❌ ERROR: Missing @odata.context!");
    }

    // ✅ VALIDATION: Check for Id: null
    const detailsWithNullId =
        payload.Details?.filter(
            (d) =>
                d.hasOwnProperty("Id") && (d.Id === null || d.Id === undefined),
        ) || [];

    if (detailsWithNullId.length > 0) {
        console.error(
            "[PAYLOAD] ❌ ERROR: Found details with null Id:",
            detailsWithNullId,
        );
        throw new Error(
            "Payload contains details with null Id - this will cause API error",
        );
    }

    return payload;
}

// =====================================================
// INLINE PRODUCT SEARCH
// =====================================================
let inlineSearchTimeout = null;

function initInlineSearchAfterRender() {
    setTimeout(() => {
        const searchInput = document.getElementById("inlineProductSearch");
        if (searchInput && typeof initInlineProductSearch === "function") {
            initInlineProductSearch();
        }

        // 🔄 Refresh inline search UI when switching to products tab
        refreshInlineSearchUI();
    }, 100);
}

function initInlineProductSearch() {
    const searchInput = document.getElementById("inlineProductSearch");
    if (!searchInput) return;
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim();
        if (inlineSearchTimeout) clearTimeout(inlineSearchTimeout);
        if (query.length < 2) {
            hideInlineResults();
            return;
        }
        inlineSearchTimeout = setTimeout(() => performInlineSearch(query), 500);
    });
}

async function performInlineSearch(query) {
    const resultsDiv = document.getElementById("inlineSearchResults");
    const searchInput = document.getElementById("inlineProductSearch");
    searchInput.classList.add("searching");
    resultsDiv.className = "inline-search-results loading show";
    resultsDiv.innerHTML = `<div class="inline-search-loading"></div>`;
    try {
        if (!window.productSearchManager.isLoaded)
            await window.productSearchManager.fetchExcelProducts();
        const results = window.productSearchManager.search(query, 20);
        displayInlineResults(results);
    } catch (error) {
        resultsDiv.className = "inline-search-results empty show";
        resultsDiv.innerHTML = `<div style="color: #ef4444;">Lỗi: ${error.message}</div>`;
    } finally {
        searchInput.classList.remove("searching");
    }
}

function displayInlineResults(results) {
    const resultsDiv = document.getElementById("inlineSearchResults");
    if (!results || results.length === 0) {
        resultsDiv.className = "inline-search-results empty show";
        resultsDiv.innerHTML = `<div>Không tìm thấy sản phẩm</div>`;
        return;
    }
    resultsDiv.className = "inline-search-results show";

    // Check which products are already in the order
    const productsInOrder = new Map();
    if (currentEditOrderData && currentEditOrderData.Details) {
        currentEditOrderData.Details.forEach(detail => {
            productsInOrder.set(detail.ProductId, detail.Quantity || 0);
        });
    }

    resultsDiv.innerHTML = results
        .map((p) => {
            const isInOrder = productsInOrder.has(p.Id);
            const currentQty = productsInOrder.get(p.Id) || 0;
            const itemClass = isInOrder ? 'inline-result-item in-order' : 'inline-result-item';
            const buttonIcon = isInOrder ? 'fa-check' : 'fa-plus';
            const buttonText = isInOrder ? 'Thêm nữa' : 'Thêm';

            return `
        <div class="${itemClass}" onclick="addProductToOrderFromInline(${p.Id})" data-product-id="${p.Id}">
            ${isInOrder ? `<div class="inline-result-quantity-badge"><i class="fas fa-shopping-cart"></i> SL: ${currentQty}</div>` : ''}
            ${p.ImageUrl ? `<img src="${p.ImageUrl}" class="inline-result-image">` : `<div class="inline-result-image placeholder"><i class="fas fa-image"></i></div>`}
            <div class="inline-result-info">
                <div class="inline-result-name">${p.Name}</div>
                <div class="inline-result-code">Mã: ${p.Code}</div>
            </div>
            <div class="inline-result-price">${(p.Price || 0).toLocaleString("vi-VN")}đ</div>
            <button class="inline-result-add" onclick="event.stopPropagation(); addProductToOrderFromInline(${p.Id})">
                <i class="fas ${buttonIcon}"></i> ${buttonText}
            </button>
        </div>`;
        })
        .join("");
}

function hideInlineResults() {
    const resultsDiv = document.getElementById("inlineSearchResults");
    if (resultsDiv) resultsDiv.classList.remove("show");
}

// =====================================================
// HIGHLIGHT PRODUCT ROW AFTER UPDATE
// =====================================================
function highlightProductRow(index) {
    // Wait for DOM to update
    setTimeout(() => {
        const row = document.querySelector(
            `#productsTableBody tr[data-index="${index}"]`,
        );
        if (!row) return;

        // Add highlight class
        row.classList.add("product-row-highlight");

        // Scroll to the row
        row.scrollIntoView({ behavior: "smooth", block: "center" });

        // Remove highlight after animation
        setTimeout(() => {
            row.classList.remove("product-row-highlight");
        }, 2000);
    }, 100);
}

// =====================================================
// UPDATE PRODUCT ITEM UI AFTER ADDING TO ORDER
// =====================================================
function updateProductItemUI(productId) {
    // Find the product item in search results
    const productItem = document.querySelector(
        `.inline-result-item[data-product-id="${productId}"]`
    );

    if (!productItem) return;

    // Add animation
    productItem.classList.add("just-added");

    // Remove animation class after it completes
    setTimeout(() => {
        productItem.classList.remove("just-added");
    }, 500);

    // Get updated quantity from order
    let updatedQty = 0;
    if (currentEditOrderData && currentEditOrderData.Details) {
        const product = currentEditOrderData.Details.find(
            p => p.ProductId == productId
        );
        updatedQty = product ? (product.Quantity || 0) : 0;
    }

    // Update the item to show it's in order
    if (!productItem.classList.contains("in-order")) {
        productItem.classList.add("in-order");
    }

    // Update or add quantity badge
    let badge = productItem.querySelector(".inline-result-quantity-badge");
    if (!badge) {
        badge = document.createElement("div");
        badge.className = "inline-result-quantity-badge";
        productItem.insertBefore(badge, productItem.firstChild);
    }

    badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${updatedQty}`;

    // Update button
    const button = productItem.querySelector(".inline-result-add");
    if (button) {
        const icon = button.querySelector("i");
        if (icon) {
            icon.className = "fas fa-check";
        }
        // Update button text
        const textNode = Array.from(button.childNodes).find(
            node => node.nodeType === Node.TEXT_NODE
        );
        if (textNode) {
            textNode.textContent = " Thêm nữa";
        }
    }

    console.log(`[UI UPDATE] Product ${productId} UI updated with quantity: ${updatedQty}`);
}

// =====================================================
// REFRESH INLINE SEARCH UI AFTER ANY DATA CHANGE
// =====================================================
function refreshInlineSearchUI() {
    // Get all product items currently displayed in search results
    const productItems = document.querySelectorAll('.inline-result-item');

    if (productItems.length === 0) {
        console.log('[REFRESH UI] No search results to refresh');
        return;
    }

    console.log(`[REFRESH UI] Refreshing ${productItems.length} items in search results`);

    // Create a map of current quantities
    const productsInOrder = new Map();
    if (currentEditOrderData && currentEditOrderData.Details) {
        currentEditOrderData.Details.forEach(detail => {
            productsInOrder.set(detail.ProductId, detail.Quantity || 0);
        });
    }

    // Update each product item
    productItems.forEach(item => {
        const productId = parseInt(item.getAttribute('data-product-id'));
        if (!productId) return;

        const isInOrder = productsInOrder.has(productId);
        const currentQty = productsInOrder.get(productId) || 0;

        // Update classes
        if (isInOrder) {
            if (!item.classList.contains('in-order')) {
                item.classList.add('in-order');
            }
        } else {
            item.classList.remove('in-order');
        }

        // Update or remove badge
        let badge = item.querySelector('.inline-result-quantity-badge');

        if (isInOrder && currentQty > 0) {
            // Product is in order - show/update badge
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'inline-result-quantity-badge';
                item.insertBefore(badge, item.firstChild);
            }
            badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${currentQty}`;
        } else if (badge) {
            // Product removed from order - remove badge
            badge.remove();
        }

        // Update button
        const button = item.querySelector('.inline-result-add');
        if (button) {
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = isInOrder ? 'fas fa-check' : 'fas fa-plus';
            }

            // Update button text
            const textNode = Array.from(button.childNodes).find(
                node => node.nodeType === Node.TEXT_NODE
            );
            if (textNode) {
                textNode.textContent = isInOrder ? ' Thêm nữa' : ' Thêm';
            }
        }
    });

    console.log('[REFRESH UI] UI refresh completed');
}

async function addProductToOrderFromInline(productId) {
    let notificationId = null;

    try {
        // Show loading notification
        if (window.notificationManager) {
            notificationId = window.notificationManager.show(
                "Đang tải thông tin sản phẩm...",
                "info",
                0,
                {
                    showOverlay: true,
                    persistent: true,
                    icon: "package",
                },
            );
        }

        // Get full product details from API
        console.log(
            "[INLINE ADD] Fetching full product details for ID:",
            productId,
        );
        const fullProduct =
            await window.productSearchManager.getFullProductDetails(productId);

        if (!fullProduct) {
            throw new Error("Không tìm thấy thông tin sản phẩm");
        }

        console.log("[INLINE ADD] Full product details:", fullProduct);

        // Close loading notification
        if (window.notificationManager && notificationId) {
            window.notificationManager.remove(notificationId);
        }

        // Ensure Details is an array
        if (!currentEditOrderData.Details) {
            currentEditOrderData.Details = [];
        }

        // Check if product already exists in order
        const existingProductIndex = currentEditOrderData.Details.findIndex(
            (p) => p.ProductId == productId,
        );

        if (existingProductIndex > -1) {
            // Product exists - increase quantity
            const existingProduct =
                currentEditOrderData.Details[existingProductIndex];
            const oldQty = existingProduct.Quantity || 0;
            const newQty = oldQty + 1;

            updateProductQuantity(existingProductIndex, 1);

            console.log(
                `[INLINE ADD] Product already exists, increased quantity: ${oldQty} → ${newQty}`,
            );

            showSaveIndicator(
                "success",
                `${existingProduct.ProductNameGet || existingProduct.ProductName} (SL: ${oldQty} → ${newQty})`,
            );

            highlightProductRow(existingProductIndex);
        } else {
            // ============================================
            // QUAN TRỌNG: Product mới - THÊM ĐẦY ĐỦ COMPUTED FIELDS
            // ============================================
            const newProduct = {
                // ============================================
                // REQUIRED FIELDS
                // ============================================
                // ✅ KHÔNG có Id: null cho sản phẩm mới
                ProductId: fullProduct.Id,
                Quantity: 1,
                Price:
                    fullProduct.PriceVariant ||
                    fullProduct.ListPrice ||
                    fullProduct.StandardPrice ||
                    0,
                Note: null,
                UOMId: fullProduct.UOM?.Id || 1,
                Factor: 1,
                Priority: 0,
                OrderId: currentEditOrderData.Id,
                LiveCampaign_DetailId: null,
                ProductWeight: 0,

                // ============================================
                // COMPUTED FIELDS - PHẢI CÓ!
                // ============================================
                ProductName: fullProduct.Name || fullProduct.NameTemplate,
                ProductNameGet:
                    fullProduct.NameGet ||
                    `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                UOMName: fullProduct.UOM?.Name || "Cái",
                ImageUrl: fullProduct.ImageUrl,
                IsOrderPriority: null,
                QuantityRegex: null,
                IsDisabledLiveCampaignDetail: false,

                // Creator ID
                CreatedById:
                    currentEditOrderData.UserId ||
                    currentEditOrderData.CreatedById,
            };

            currentEditOrderData.Details.push(newProduct);
            showSaveIndicator("success", "Đã thêm sản phẩm");
            console.log(
                "[INLINE ADD] Product added with computed fields:",
                newProduct,
            );
        }

        // ⚠️ QUAN TRỌNG: KHÔNG xóa input và KHÔNG ẩn results 
        // Điều này cho phép user tiếp tục thêm sản phẩm khác từ cùng danh sách gợi ý
        // document.getElementById("inlineProductSearch").value = "";
        // hideInlineResults();

        // Update UI to show product was added
        updateProductItemUI(productId);

        // Chỉ focus lại vào input để tiện thao tác
        const searchInput = document.getElementById("inlineProductSearch");
        if (searchInput) {
            searchInput.focus();
            // Select text để user có thể tiếp tục search hoặc giữ nguyên
            searchInput.select();
        }

        // Recalculate totals BEFORE re-rendering
        recalculateTotals();

        // ✅ FIX: Use switchEditTab instead of renderTabContent to re-init event listeners
        switchEditTab("products");
    } catch (error) {
        console.error("[INLINE ADD] Error:", error);

        // Close loading and show error
        if (window.notificationManager) {
            if (notificationId) {
                window.notificationManager.remove(notificationId);
            }
            window.notificationManager.error(
                "Không thể tải thông tin sản phẩm: " + error.message,
                4000,
            );
        } else {
            alert("Lỗi: " + error.message);
        }
    }
}

// ============================================
// 3. VALIDATION HELPER (Optional)
// ============================================
function validatePayloadBeforePUT(payload) {
    const errors = [];

    // Check @odata.context
    if (!payload["@odata.context"]) {
        errors.push("Missing @odata.context");
    }

    // Check required fields
    if (!payload.Id) errors.push("Missing Id");
    if (!payload.Code) errors.push("Missing Code");
    if (!payload.RowVersion) errors.push("Missing RowVersion");

    // Check Details
    if (payload.Details && Array.isArray(payload.Details)) {
        payload.Details.forEach((detail, index) => {
            if (!detail.ProductId) {
                errors.push(`Detail[${index}]: Missing ProductId`);
            }

            // Check computed fields (should exist for all products)
            const requiredComputedFields = [
                "ProductName",
                "ProductCode",
                "UOMName",
            ];
            requiredComputedFields.forEach((field) => {
                if (!detail[field]) {
                    errors.push(
                        `Detail[${index}]: Missing computed field ${field}`,
                    );
                }
            });
        });
    }

    if (errors.length > 0) {
        console.error("[VALIDATE] Payload validation errors:", errors);
        return { valid: false, errors };
    }

    console.log("[VALIDATE] Payload is valid ✓");
    return { valid: true, errors: [] };
}

// Debug payload trước khi gửi API
function debugPayloadBeforeSend(payload) {
    console.group("🔍 PAYLOAD DEBUG");

    console.log("Order Info:", {
        id: payload.Id,
        code: payload.Code,
        detailsCount: payload.Details?.length || 0,
    });

    if (payload.Details) {
        console.log("\n📦 Details Analysis:");

        const detailsWithId = payload.Details.filter((d) => d.Id);
        const detailsWithoutId = payload.Details.filter((d) => !d.Id);
        const detailsWithNullId = payload.Details.filter(
            (d) =>
                d.hasOwnProperty("Id") && (d.Id === null || d.Id === undefined),
        );

        console.log(`  ✅ Details with valid Id: ${detailsWithId.length}`);
        console.log(
            `  ✅ Details without Id (new): ${detailsWithoutId.length}`,
        );
        console.log(
            `  ${detailsWithNullId.length > 0 ? "❌" : "✅"} Details with null Id: ${detailsWithNullId.length}`,
        );

        if (detailsWithNullId.length > 0) {
            console.error("\n❌ FOUND DETAILS WITH NULL ID:");
            detailsWithNullId.forEach((d, i) => {
                console.error(
                    `  Detail[${i}]: ProductId=${d.ProductId}, Id=${d.Id}`,
                );
            });
        }

        console.log("\n📋 Details List:");
        payload.Details.forEach((d, i) => {
            console.log(
                `  [${i}] ${d.Id ? "✅" : "🆕"} ProductId=${d.ProductId}, Id=${d.Id || "N/A"}`,
            );
        });
    }

    console.groupEnd();

    // Return validation result
    const hasNullIds =
        payload.Details?.some(
            (d) =>
                d.hasOwnProperty("Id") && (d.Id === null || d.Id === undefined),
        ) || false;

    return {
        valid: !hasNullIds,
        message: hasNullIds
            ? "Payload has details with null Id"
            : "Payload is valid",
    };
}

// =====================================================
// MESSAGE HANDLER FOR CROSS-TAB COMMUNICATION
// =====================================================
window.addEventListener("message", function (event) {
    // Handle request for orders data from product assignment tab
    if (event.data.type === "REQUEST_ORDERS_DATA") {
        console.log('📨 Nhận request orders data, allData length:', allData.length);

        // Check if data is loaded
        if (!allData || allData.length === 0) {
            console.log('⚠️ allData chưa có dữ liệu, sẽ retry sau 1s');
            // Retry after 1 second
            setTimeout(() => {
                if (allData && allData.length > 0) {
                    sendOrdersDataToTab3();
                } else {
                    console.log('❌ Vẫn chưa có dữ liệu sau khi retry');
                }
            }, 1000);
            return;
        }

        sendOrdersDataToTab3();
    }
});

function sendOrdersDataToTab3() {
    // Prepare orders data with STT (SessionIndex)
    const ordersDataToSend = allData.map((order, index) => ({
        stt: order.SessionIndex || (index + 1).toString(), // Use SessionIndex as STT
        orderId: order.Id,
        orderCode: order.Code,
        customerName: order.PartnerName || order.Name,
        phone: order.PartnerPhone || order.Telephone,
        address: order.PartnerAddress || order.Address,
        totalAmount: order.TotalAmount || order.AmountTotal || 0,
        quantity: order.TotalQuantity || order.Details?.reduce((sum, d) => sum + (d.Quantity || d.ProductUOMQty || 0), 0) || 0,
        note: order.Note,
        state: order.Status || order.State,
        dateOrder: order.DateCreated || order.DateOrder,
        Tags: order.Tags, // Tags JSON array for overview aggregation
        LiveCampaignName: order.LiveCampaignName, // Campaign name for overview filtering
        products: order.Details?.map(d => ({
            id: d.ProductId,
            name: d.ProductName,
            nameGet: d.ProductNameGet,
            code: d.ProductCode,
            quantity: d.Quantity || d.ProductUOMQty || 0,
            price: d.Price || 0,
            imageUrl: d.ImageUrl,
            uom: d.UOMName
        })) || []
    }));

    // Save to localStorage for persistence
    localStorage.setItem('ordersData', JSON.stringify(ordersDataToSend));

    // Send to product assignment tab via parent window forwarding
    // Updated to avoid "SecurityError: Blocked a frame with origin 'null'"
    if (window.parent) {
        window.parent.postMessage({
            type: 'ORDERS_DATA_RESPONSE', // Changed to match main.html handler
            orders: ordersDataToSend
        }, '*');
        console.log(`📤 Đã gửi ${ordersDataToSend.length} đơn hàng về parent để forward sang tab 3`);
    }
}

// =====================================================
// CHAT MODAL FUNCTIONS
// =====================================================
// Make these global so they can be accessed from other modules (e.g., chat-modal-products.js)
window.currentChatChannelId = null;
window.currentChatPSID = null;
window.currentConversationId = null;  // Lưu conversation ID cho reply

// Module-scoped variables (not needed externally)
let currentChatType = null;
let currentChatCursor = null;
window.allChatMessages = []; // Make global for WebSocket access
let skipWebhookUpdate = false; // Flag to skip webhook updates right after sending message
let isSendingMessage = false; // Flag to prevent double message sending
window.allChatComments = []; // Make global for WebSocket access
let isLoadingMoreMessages = false;
let currentOrder = null;  // Lưu order hiện tại để gửi reply
let currentParentCommentId = null;  // Lưu parent comment ID
let currentPostId = null; // Lưu post ID của comment đang reply
window.availableChatPages = []; // Cache pages for selector
window.currentSendPageId = null; // Page ID selected for SENDING messages (independent from view)

// =====================================================
// PAGE SELECTOR FUNCTIONS
// =====================================================

/**
 * Populate SEND page selector dropdown (for sending messages)
 * @param {string} currentPageId - Current page ID to pre-select
 */
window.populateSendPageSelector = async function (currentPageId) {
    console.log('[SEND-PAGE] Populating send page selector, current:', currentPageId);

    const select = document.getElementById('chatSendPageSelect');
    if (!select) {
        console.warn('[SEND-PAGE] Select element not found');
        return;
    }

    // Show loading state
    select.innerHTML = '<option value="">Đang tải...</option>';
    select.disabled = true;

    try {
        // Use cached pages if available
        let pages = window.availableChatPages;
        if (!pages || pages.length === 0) {
            // Fetch pages if not cached
            if (window.pancakeDataManager) {
                await window.pancakeDataManager.fetchPages();
                pages = await window.pancakeDataManager.fetchPagesWithUnreadCount();
                window.availableChatPages = pages;
            }
        }

        if (!pages || pages.length === 0) {
            select.innerHTML = '<option value="">Không có page</option>';
            select.disabled = true;
            return;
        }

        // Build options
        let optionsHtml = '';
        pages.forEach(page => {
            const isSelected = page.page_id === currentPageId ? 'selected' : '';
            optionsHtml += `<option value="${page.page_id}" ${isSelected}>${page.page_name}</option>`;
        });

        select.innerHTML = optionsHtml;
        select.disabled = false;

        // Set current send page
        window.currentSendPageId = currentPageId;

        // If current page not in list, add it as first option
        if (currentPageId && !pages.find(p => p.page_id === currentPageId)) {
            const currentOption = document.createElement('option');
            currentOption.value = currentPageId;
            currentOption.textContent = `Page ${currentPageId}`;
            currentOption.selected = true;
            select.insertBefore(currentOption, select.firstChild);
        }

        console.log('[SEND-PAGE] ✅ Populated with', pages.length, 'pages, selected:', currentPageId);

    } catch (error) {
        console.error('[SEND-PAGE] ❌ Error:', error);
        select.innerHTML = '<option value="">Lỗi tải</option>';
        select.disabled = true;
    }
};

/**
 * Handle SEND page selection change
 * @param {string} pageId - Selected page ID for sending
 */
window.onSendPageChanged = function (pageId) {
    console.log('[SEND-PAGE] Send page changed to:', pageId);

    if (!pageId) return;

    // Update send page ID (independent from view page)
    window.currentSendPageId = pageId;

    // Show notification
    const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
    const pageName = selectedPage?.page_name || pageId;

    if (window.notificationManager) {
        window.notificationManager.show(`Sẽ gửi tin nhắn từ page: ${pageName}`, 'info', 2000);
    }

    console.log('[SEND-PAGE] ✅ Updated currentSendPageId to:', pageId);
};

/**
 * Populate VIEW page selector dropdown with pages from Pancake API
 * @param {string} currentPageId - Current page ID to pre-select
 */
window.populateChatPageSelector = async function (currentPageId) {
    console.log('[PAGE-SELECTOR] Populating page selector, current:', currentPageId);

    const select = document.getElementById('chatPageSelect');
    if (!select) {
        console.warn('[PAGE-SELECTOR] Select element not found');
        return;
    }

    // Show loading state
    select.innerHTML = '<option value="">Đang tải pages...</option>';
    select.disabled = true;

    try {
        // Ensure pages are fetched first (for page names)
        if (window.pancakeDataManager) {
            await window.pancakeDataManager.fetchPages();
        }

        // Fetch pages with unread count
        const pagesWithUnread = window.pancakeDataManager ?
            await window.pancakeDataManager.fetchPagesWithUnreadCount() : [];

        if (pagesWithUnread.length === 0) {
            select.innerHTML = '<option value="">Không có page nào</option>';
            select.disabled = true;
            return;
        }

        // Cache pages
        window.availableChatPages = pagesWithUnread;

        // Build options
        let optionsHtml = '';
        pagesWithUnread.forEach(page => {
            const isSelected = page.page_id === currentPageId ? 'selected' : '';
            const unreadBadge = page.unread_conv_count > 0 ? ` (${page.unread_conv_count})` : '';
            optionsHtml += `<option value="${page.page_id}" ${isSelected}>${page.page_name}${unreadBadge}</option>`;
        });

        select.innerHTML = optionsHtml;
        select.disabled = false;

        // If current page not in list, add it as first option
        if (currentPageId && !pagesWithUnread.find(p => p.page_id === currentPageId)) {
            const currentOption = document.createElement('option');
            currentOption.value = currentPageId;
            currentOption.textContent = `Page ${currentPageId}`;
            currentOption.selected = true;
            select.insertBefore(currentOption, select.firstChild);
        }

        console.log('[PAGE-SELECTOR] ✅ Populated with', pagesWithUnread.length, 'pages');

    } catch (error) {
        console.error('[PAGE-SELECTOR] ❌ Error populating:', error);
        select.innerHTML = '<option value="">Lỗi tải pages</option>';
        select.disabled = true;
    }
};

/**
 * Handle page selection change
 * @param {string} pageId - Selected page ID
 */
window.onChatPageChanged = async function (pageId) {
    console.log('[PAGE-SELECTOR] Page changed to:', pageId);

    if (!pageId) return;

    // Update currentChatChannelId to use selected page
    const oldChannelId = window.currentChatChannelId;
    window.currentChatChannelId = pageId;

    // Show notification
    const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
    const pageName = selectedPage?.page_name || pageId;

    if (window.notificationManager) {
        window.notificationManager.show(`Đang tải tin nhắn từ page: ${pageName}...`, 'info', 2000);
    }

    console.log('[PAGE-SELECTOR] ✅ Updated currentChatChannelId to:', pageId);

    // Reload messages/comments for the new page
    await window.reloadChatForSelectedPage(pageId);
};

/**
 * Reload messages/comments when page is changed
 * @param {string} pageId - New page ID to load messages from
 */
window.reloadChatForSelectedPage = async function (pageId) {
    console.log('[PAGE-RELOAD] Reloading chat for page:', pageId);

    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    const psid = window.currentChatPSID;
    if (!psid) {
        console.error('[PAGE-RELOAD] No PSID available');
        return;
    }

    // Show loading
    const loadingText = currentChatType === 'comment' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    try {
        if (currentChatType === 'comment') {
            // Fetch comments for new page
            const response = await window.chatDataManager.fetchComments(pageId, psid);
            window.allChatComments = response.comments || [];
            currentChatCursor = response.after;

            console.log(`[PAGE-RELOAD] Loaded ${window.allChatComments.length} comments from page ${pageId}`);

            // Update parent comment ID if available
            if (window.allChatComments.length > 0) {
                const rootComment = window.allChatComments.find(c => !c.ParentId) || window.allChatComments[0];
                if (rootComment && rootComment.Id) {
                    currentParentCommentId = getFacebookCommentId(rootComment);
                    console.log(`[PAGE-RELOAD] Updated parent comment ID: ${currentParentCommentId}`);
                }
            }

            renderComments(window.allChatComments, true);
        } else {
            // Fetch messages for new page
            const response = await window.chatDataManager.fetchMessages(pageId, psid);
            window.allChatMessages = response.messages || [];
            currentChatCursor = response.after;

            console.log(`[PAGE-RELOAD] Loaded ${window.allChatMessages.length} messages from page ${pageId}`);

            renderChatMessages(window.allChatMessages, true);

            // Re-setup infinite scroll
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();
        }

        // Update conversationId for new page
        if (currentOrder && window.pancakeDataManager) {
            const facebookPsid = currentOrder.Facebook_ASUserId;
            if (facebookPsid) {
                const conversation = window.pancakeDataManager.getConversationByUserId(facebookPsid);
                if (conversation && conversation.customers && conversation.customers.length > 0) {
                    const customerUuid = conversation.customers[0].id;
                    try {
                        const inboxPreview = await window.pancakeDataManager.fetchInboxPreview(pageId, customerUuid);
                        if (inboxPreview.success) {
                            // Use appropriate conversationId based on current chat type
                            if (currentChatType === 'comment') {
                                window.currentConversationId = inboxPreview.commentConversationId
                                    || inboxPreview.inboxConversationId
                                    || inboxPreview.conversationId;
                            } else {
                                window.currentConversationId = inboxPreview.inboxConversationId
                                    || inboxPreview.conversationId;
                            }
                            window.currentInboxConversationId = inboxPreview.inboxConversationId;
                            window.currentCommentConversationId = inboxPreview.commentConversationId;
                            console.log('[PAGE-RELOAD] ✅ Updated conversationIds:', {
                                using: window.currentConversationId,
                                inbox: window.currentInboxConversationId,
                                comment: window.currentCommentConversationId
                            });
                        }
                    } catch (error) {
                        console.warn('[PAGE-RELOAD] Could not fetch inbox_preview:', error);
                    }
                }
            }
        }

        // Show success notification
        const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
        const pageName = selectedPage?.page_name || pageId;
        if (window.notificationManager) {
            window.notificationManager.show(`✅ Đã tải tin nhắn từ page: ${pageName}`, 'success', 2000);
        }

    } catch (error) {
        console.error('[PAGE-RELOAD] Error loading chat:', error);
        const errorText = currentChatType === 'comment' ? 'Lỗi khi tải bình luận' : 'Lỗi khi tải tin nhắn';
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${errorText}</p>
                <p style="font-size: 12px; color: #9ca3af;">${error.message}</p>
            </div>`;
    }
};

// =====================================================
// AVATAR ZOOM MODAL
// =====================================================
window.openAvatarZoom = function (avatarUrl, senderName) {
    // Remove existing modal if any
    const existingModal = document.getElementById('avatar-zoom-modal');
    if (existingModal) existingModal.remove();

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'avatar-zoom-modal';
    modal.innerHTML = `
        <div class="avatar-zoom-overlay" onclick="closeAvatarZoom()" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            cursor: zoom-out;
            animation: fadeIn 0.2s ease-out;
        ">
            <div style="text-align: center;">
                <img src="${avatarUrl}" 
                     alt="${senderName}"
                     style="
                        max-width: 90vw;
                        max-height: 80vh;
                        border-radius: 16px;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                        animation: zoomIn 0.3s ease-out;
                     "
                     onclick="event.stopPropagation();"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><circle cx=%22100%22 cy=%22100%22 r=%22100%22 fill=%22%23e5e7eb%22/><circle cx=%22100%22 cy=%2280%22 r=%2235%22 fill=%22%239ca3af%22/><ellipse cx=%22100%22 cy=%22160%22 rx=%2255%22 ry=%2240%22 fill=%22%239ca3af%22/></svg>'"
                />
                <p style="color: white; font-size: 16px; margin-top: 16px; font-weight: 500;">${senderName}</p>
                <button onclick="closeAvatarZoom()" style="
                    margin-top: 12px;
                    padding: 10px 24px;
                    background: white;
                    color: #111827;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    <i class="fas fa-times" style="margin-right: 6px;"></i>Đóng
                </button>
            </div>
        </div>
    `;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    `;
    modal.appendChild(style);

    document.body.appendChild(modal);

    // Close on Escape key
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            closeAvatarZoom();
            document.removeEventListener('keydown', escHandler);
        }
    });
};

window.closeAvatarZoom = function () {
    const modal = document.getElementById('avatar-zoom-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 200);
    }
};

window.openChatModal = async function (orderId, channelId, psid, type = 'message') {
    console.log('[CHAT] Opening modal:', { orderId, channelId, psid, type });
    if (!channelId || !psid) {
        alert('Không có thông tin tin nhắn cho đơn hàng này');
        return;
    }

    // Reset pagination state
    window.currentChatChannelId = channelId;
    window.currentChatPSID = psid;
    currentChatType = type;
    currentChatCursor = null;
    window.allChatMessages = [];
    window.allChatComments = [];
    isLoadingMoreMessages = false;
    currentOrder = null;
    currentChatOrderId = null;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Get order info
    // First try to find order by exact ID match
    let order = allData.find(o => o.Id === orderId);
    // If not found, check if this orderId is in a merged order's OriginalIds
    if (!order) {
        order = allData.find(o => o.IsMerged && o.OriginalIds && o.OriginalIds.includes(orderId));
    }
    if (!order) {
        alert('Không tìm thấy đơn hàng');
        return;
    }

    // Lưu order hiện tại
    currentOrder = order;
    currentChatOrderId = orderId;

    // Update modal title based on type
    const titleText = type === 'comment' ? 'Bình luận' : 'Tin nhắn';
    document.getElementById('chatModalTitle').textContent = `${titleText} với ${order.Name}`;
    document.getElementById('chatModalSubtitle').textContent = `SĐT: ${order.Telephone || 'N/A'} • Mã ĐH: ${order.Code}`;

    // Show modal
    document.getElementById('chatModal').classList.add('show');

    // Populate page selectors with current channelId
    window.populateChatPageSelector(channelId);  // View page selector
    window.populateSendPageSelector(channelId);  // Send page selector (independent)

    // Initialize chat modal products with order data
    // Fetch full order data with product details (including Facebook_PostId, Facebook_ASUserId, Facebook_CommentId)
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
        const response = await API_CONFIG.smartFetch(apiUrl, {
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
        if (response.ok) {
            const fullOrderData = await response.json();

            // Store Facebook data for highlighting purchase comment
            window.purchaseFacebookPostId = fullOrderData.Facebook_PostId || null;
            window.purchaseFacebookASUserId = fullOrderData.Facebook_ASUserId || null;
            window.purchaseCommentId = fullOrderData.Facebook_CommentId || null;

            console.log('[CHAT] Order Facebook data loaded:', {
                PostId: window.purchaseFacebookPostId,
                ASUserId: window.purchaseFacebookASUserId,
                CommentId: window.purchaseCommentId
            });
        }
    } catch (error) {
        console.error('[CHAT] Error loading order details:', error);
        // Reset Facebook data on error
        window.purchaseFacebookPostId = null;
        window.purchaseFacebookASUserId = null;
        window.purchaseCommentId = null;
    }

    // Show loading
    const modalBody = document.getElementById('chatModalBody');
    const loadingText = type === 'comment' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    // Show/hide reply container and mark as read button
    // Show/hide reply container and mark as read button
    const replyContainer = document.getElementById('chatReplyContainer');
    const markReadBtn = document.getElementById('chatMarkReadBtn');

    // Always show reply container for both comment and message
    replyContainer.style.display = 'block';
    const chatInput = document.getElementById('chatReplyInput');
    chatInput.value = '';

    // Reset pasted image and uploaded images array
    currentPastedImage = null;
    window.currentPastedImage = null;
    window.uploadedImagesData = [];
    window.isUploadingImages = false;
    const previewContainer = document.getElementById('chatImagePreviewContainer');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';
    }

    // Remove old listener to avoid duplicates (if any) and add new one
    chatInput.removeEventListener('paste', handleChatInputPaste);
    chatInput.addEventListener('paste', handleChatInputPaste);

    // Remove old Enter key listener and add new one with proper event handling
    chatInput.removeEventListener('keydown', handleChatInputKeyDown);
    chatInput.addEventListener('keydown', handleChatInputKeyDown);

    // Add input event listener for auto-resize
    chatInput.removeEventListener('input', handleChatInputInput);
    chatInput.addEventListener('input', handleChatInputInput);

    if (type === 'comment') {
        markReadBtn.style.display = 'none';

        // Disable input and send button by default for comments
        // Only enable when replying to a specific comment
        const chatSendBtn = document.getElementById('chatSendBtn');
        chatInput.disabled = true;
        chatInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
        chatInput.style.background = '#f3f4f6';
        chatInput.style.cursor = 'not-allowed';
        if (chatSendBtn) {
            chatSendBtn.disabled = true;
            chatSendBtn.style.opacity = '0.5';
            chatSendBtn.style.cursor = 'not-allowed';
        }
    } else {
        markReadBtn.style.display = 'none'; // Keep hidden for now or show if needed

        // Re-enable input and send button for chat (message mode)
        // Reset to default state in case it was disabled from previous comment modal
        const chatSendBtn = document.getElementById('chatSendBtn');
        chatInput.disabled = false;
        chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
        chatInput.style.background = '#f9fafb';
        chatInput.style.cursor = 'text';
        chatInput.style.opacity = '1';
        if (chatSendBtn) {
            chatSendBtn.disabled = false;
            chatSendBtn.style.opacity = '1';
            chatSendBtn.style.cursor = 'pointer';
            chatSendBtn.title = 'Gửi tin nhắn';
        }
    }

    // Ensure send button is in correct state after modal initialization
    updateSendButtonState();

    // Fetch messages or comments based on type
    try {
        if (type === 'comment') {
            // Fetch initial comments with pagination support
            const response = await window.chatDataManager.fetchComments(channelId, psid);
            window.allChatComments = response.comments || [];
            currentChatCursor = response.after; // Store cursor for next page

            // Update customer UUID from response if not already set
            if (response.customerId && !window.currentCustomerUUID) {
                window.currentCustomerUUID = response.customerId;
                console.log(`[CHAT] ✅ Updated currentCustomerUUID from comments response: ${window.currentCustomerUUID}`);
            }

            // Lấy parent comment ID từ comment đầu tiên (comment gốc)
            if (window.allChatComments.length > 0) {
                // Tìm comment gốc (parent comment) - thường là comment không có ParentId hoặc comment đầu tiên
                const rootComment = window.allChatComments.find(c => !c.ParentId) || window.allChatComments[0];
                if (rootComment && rootComment.Id) {
                    currentParentCommentId = getFacebookCommentId(rootComment);
                    console.log(`[CHAT] Got parent comment ID: ${currentParentCommentId} (from ${rootComment.Id})`);

                    // Debug log to help identify correct field
                    console.log('[CHAT] Root comment object:', rootComment);
                }
            }

            // Construct conversationId from postId and parentCommentId
            // Format: postId_commentId (e.g., "1382798016618291_817929370998475")
            const facebookPostId = order.Facebook_PostId || currentPostId;
            if (facebookPostId && currentParentCommentId) {
                // Check if currentParentCommentId already has format postId_commentId
                if (currentParentCommentId.includes('_')) {
                    // Already a full conversation ID, use as-is
                    window.currentConversationId = currentParentCommentId;
                    console.log(`[CHAT] Using currentParentCommentId as conversationId: ${window.currentConversationId}`);
                } else {
                    // Just a comment ID, need to prepend postId
                    const postId = extractPostId(facebookPostId);
                    window.currentConversationId = `${postId}_${currentParentCommentId}`;
                    console.log(`[CHAT] Constructed conversationId for comment: ${window.currentConversationId} (from ${facebookPostId})`);
                }
            } else {
                // Fallback: Try to get from Pancake data manager
                if (window.pancakeDataManager) {
                    const pancakeCommentInfo = window.pancakeDataManager.getLastCommentForOrder(order);
                    if (pancakeCommentInfo && pancakeCommentInfo.conversationId) {
                        window.currentConversationId = pancakeCommentInfo.conversationId;
                        console.log(`[CHAT] Got conversationId from Pancake: ${window.currentConversationId}`);
                    }
                }
            }

            console.log(`[CHAT] Initial load: ${window.allChatComments.length} comments, cursor: ${currentChatCursor}`);

            renderComments(window.allChatComments, true);

            // Fetch inbox_preview for comment modal - lấy customer ID từ conversations
            const facebookPsid = order.Facebook_ASUserId;
            // facebookPostId đã được khai báo ở trên (dòng 6426)
            let pancakeCustomerUuid = null;

            console.log('[CHAT-MODAL] 🔍 Starting inbox_preview fetch for COMMENT...');
            console.log('[CHAT-MODAL] - Facebook PSID:', facebookPsid);
            console.log('[CHAT-MODAL] - Facebook PostId:', facebookPostId);

            if (window.pancakeDataManager && facebookPostId) {
                const facebookName = order.Facebook_UserName;
                console.log('[CHAT-MODAL] 🔍 Searching conversation by Facebook Name:', facebookName, 'post_id:', facebookPostId);
                try {
                    // Dùng searchConversations() để tìm conversation
                    const searchResult = await window.pancakeDataManager.searchConversations(facebookName);

                    if (searchResult.conversations.length > 0) {
                        console.log('[CHAT-MODAL] Found', searchResult.conversations.length, 'conversations with name:', facebookName);

                        // Cho COMMENT: match theo post_id để lấy đúng customer UUID
                        // Lấy TẤT CẢ conversations matching post_id (có thể có nhiều)
                        const matchingConversations = searchResult.conversations.filter(conv => {
                            return conv.type === 'COMMENT' && conv.post_id === facebookPostId;
                        });

                        console.log('[CHAT-MODAL] Matching conversations with post_id:', matchingConversations.length);

                        if (matchingConversations.length > 0) {
                            // Collect tất cả customer UUIDs từ các conversations
                            const allCustomerUuids = [];
                            matchingConversations.forEach(conv => {
                                if (conv.customers && conv.customers.length > 0) {
                                    conv.customers.forEach(c => {
                                        if (c.id && !allCustomerUuids.includes(c.id)) {
                                            allCustomerUuids.push(c.id);
                                        }
                                    });
                                }
                            });

                            if (allCustomerUuids.length > 0) {
                                // Lưu tất cả UUIDs
                                pancakeCustomerUuid = allCustomerUuids[0]; // Dùng cái đầu tiên
                                window.currentCustomerUUIDs = allCustomerUuids; // Lưu tất cả
                                window.currentCustomerUUID = pancakeCustomerUuid;
                                console.log('[CHAT-MODAL] ✅ Found', allCustomerUuids.length, 'customer UUIDs from', matchingConversations.length, 'conversations:', allCustomerUuids);
                            }
                        } else {
                            console.warn('[CHAT-MODAL] ⚠️ No COMMENT conversation matched post_id:', facebookPostId);
                        }
                    }
                } catch (searchError) {
                    console.error('[CHAT-MODAL] ❌ Error searching conversations:', searchError);
                }
            } else {
                console.warn('[CHAT-MODAL] ⚠️ Missing pancakeDataManager or facebookPostId');
            }

            // Nếu vẫn chưa có customer UUID, log warning
            if (!pancakeCustomerUuid) {
                console.warn('[CHAT-MODAL] ⚠️ No customer UUID found after search');
            }

            // Fetch inbox_preview nếu có customer UUID và lưu conversationId
            if (pancakeCustomerUuid) {
                try {
                    const inboxPreview = await window.pancakeDataManager.fetchInboxPreview(channelId, pancakeCustomerUuid);
                    if (inboxPreview.success) {
                        // Cho COMMENT: ưu tiên dùng commentConversationId
                        // Fallback: inboxConversationId hoặc conversationId (backwards compatible)
                        window.currentConversationId = inboxPreview.commentConversationId
                            || inboxPreview.inboxConversationId
                            || inboxPreview.conversationId;

                        // Store cả 2 loại để linh hoạt sử dụng
                        window.currentInboxConversationId = inboxPreview.inboxConversationId;
                        window.currentCommentConversationId = inboxPreview.commentConversationId;

                        console.log('[CHAT-MODAL] ✅ Got conversationIds from inbox_preview:');
                        console.log('  - inbox_conv_id:', window.currentInboxConversationId);
                        console.log('  - comment_conv_id:', window.currentCommentConversationId);
                        console.log('  - Using for COMMENT:', window.currentConversationId);
                    } else {
                        console.warn('[CHAT-MODAL] ⚠️ Failed to get conversationId from inbox_preview');
                    }
                } catch (inboxError) {
                    console.error('[CHAT-MODAL] ❌ inbox_preview fetch error:', inboxError);
                }
            } else {
                console.warn('[CHAT-MODAL] ⚠️ Cannot fetch inbox_preview - missing customer UUID');
            }

            // Setup infinite scroll for comments
            setupChatInfiniteScroll();

            // Setup new message indicator listener
            setupNewMessageIndicatorListener();
        } else {
            // Fetch messages
            const chatInfo = window.chatDataManager.getLastMessageForOrder(order);

            // Get conversation ID from Pancake inbox_preview API
            if (window.pancakeDataManager) {
                // Tìm conversation trong cache (giống logic của modal comment)
                let pancakeCustomerUuid = null;
                let conversation = null;

                // Tìm conversation của user này trong inbox cache bằng PSID
                if (window.pancakeDataManager.inboxMapByPSID) {
                    conversation = window.pancakeDataManager.inboxMapByPSID.get(String(psid));

                    if (!conversation) {
                        // Thử tìm bằng FBID
                        conversation = window.pancakeDataManager.inboxMapByFBID.get(String(psid));
                    }

                    if (conversation) {
                        console.log('[CHAT-MODAL] ✅ Found conversation in inbox cache');
                    } else {
                        console.log('[CHAT-MODAL] ℹ️ Conversation not found in cache - will try to search');
                    }
                } else {
                    console.log('[CHAT-MODAL] ℹ️ Inbox map not initialized');
                }

                // Lấy customer UUID từ conversation trong cache
                if (conversation && conversation.customers && conversation.customers.length > 0) {
                    pancakeCustomerUuid = conversation.customers[0].id;
                    console.log('[CHAT-MODAL] ✅ Got customer UUID from cache:', pancakeCustomerUuid);
                }

                // Nếu không tìm thấy trong cache, search trực tiếp theo tên Facebook (giống logic của comment modal)
                if (!pancakeCustomerUuid) {
                    const facebookName = order.Facebook_UserName;
                    const facebookPsid = order.Facebook_ASUserId;
                    const facebookPostId = order.Facebook_PostId; // Format: pageId_postId
                    console.log('[CHAT-MODAL] 🔍 Searching conversation by Facebook Name:', facebookName, 'fb_id:', facebookPsid, 'post_id:', facebookPostId);
                    try {
                        // Dùng searchConversations() để tìm conversation
                        const searchResult = await window.pancakeDataManager.searchConversations(facebookName);

                        if (searchResult.conversations.length > 0) {
                            console.log('[CHAT-MODAL] Found', searchResult.conversations.length, 'conversations with name:', facebookName);

                            // Match logic khác nhau cho INBOX vs COMMENT
                            if (type === 'comment' && facebookPostId) {
                                // Cho COMMENT: match theo post_id để lấy đúng customer UUID
                                // post_id format: pageId_postId (e.g., "270136663390370_1672237127083024")
                                // Lấy TẤT CẢ conversations matching post_id (có thể có nhiều)
                                const matchingConversations = searchResult.conversations.filter(conv => {
                                    return conv.type === 'COMMENT' && conv.post_id === facebookPostId;
                                });

                                if (matchingConversations.length > 0) {
                                    // Collect tất cả customer UUIDs từ các conversations
                                    const allCustomerUuids = [];
                                    matchingConversations.forEach(conv => {
                                        if (conv.customers && conv.customers.length > 0) {
                                            conv.customers.forEach(c => {
                                                if (c.id && !allCustomerUuids.includes(c.id)) {
                                                    allCustomerUuids.push(c.id);
                                                }
                                            });
                                        }
                                    });

                                    if (allCustomerUuids.length > 0) {
                                        // Lưu tất cả UUIDs, sẽ thử lần lượt
                                        pancakeCustomerUuid = allCustomerUuids[0]; // Dùng cái đầu tiên
                                        window.currentCustomerUUIDs = allCustomerUuids; // Lưu tất cả
                                        window.currentCustomerUUID = pancakeCustomerUuid;
                                        console.log('[CHAT-MODAL] ✅ Found', allCustomerUuids.length, 'customer UUIDs from', matchingConversations.length, 'conversations:', allCustomerUuids);
                                    }
                                    conversation = matchingConversations[0]; // Lấy conversation đầu tiên
                                }
                            } else {
                                // Cho INBOX: match theo fb_id/from_psid
                                conversation = searchResult.conversations.find(conv => {
                                    // Only match INBOX type for messages
                                    if (conv.type !== 'INBOX') return false;

                                    // Check in customers array
                                    const hasMatchingCustomer = conv.customers?.some(c => c.fb_id === facebookPsid);

                                    // Check in from.id
                                    const hasMatchingFrom = conv.from?.id === facebookPsid;

                                    // Check in from_psid
                                    const hasMatchingPsid = conv.from_psid === facebookPsid;

                                    return hasMatchingCustomer || hasMatchingFrom || hasMatchingPsid;
                                });

                                if (conversation && conversation.customers && conversation.customers.length > 0) {
                                    pancakeCustomerUuid = conversation.customers[0].id;
                                    window.currentCustomerUUID = pancakeCustomerUuid;
                                    console.log('[CHAT-MODAL] ✅ Matched INBOX conversation - customer UUID:', pancakeCustomerUuid);
                                }
                            }

                            if (!pancakeCustomerUuid) {
                                console.warn('[CHAT-MODAL] ⚠️ No conversation matched for type:', type, 'in', searchResult.conversations.length, 'results');
                            }
                        }
                    } catch (searchError) {
                        console.error('[CHAT-MODAL] ❌ Error searching conversations:', searchError);
                    }
                }

                // Fetch inbox_preview nếu có customer UUID
                if (pancakeCustomerUuid) {
                    try {
                        const inboxPreview = await window.pancakeDataManager.fetchInboxPreview(channelId, pancakeCustomerUuid);
                        if (inboxPreview.success) {
                            // Cho MESSAGE: ưu tiên dùng inboxConversationId
                            // Fallback: conversationId (backwards compatible)
                            window.currentConversationId = inboxPreview.inboxConversationId
                                || inboxPreview.conversationId;

                            // Store cả 2 loại để linh hoạt sử dụng
                            window.currentInboxConversationId = inboxPreview.inboxConversationId;
                            window.currentCommentConversationId = inboxPreview.commentConversationId;

                            console.log('[CHAT-MODAL] ✅ Got conversationIds from inbox_preview:');
                            console.log('  - inbox_conv_id:', window.currentInboxConversationId);
                            console.log('  - comment_conv_id:', window.currentCommentConversationId);
                            console.log('  - Using for MESSAGE:', window.currentConversationId);
                        } else {
                            console.log(`[CHAT-MODAL] ℹ️ Could not get conversationId from inbox_preview`);
                        }
                    } catch (inboxError) {
                        console.error('[CHAT-MODAL] ❌ inbox_preview fetch error:', inboxError);
                    }
                } else {
                    console.warn('[CHAT-MODAL] ⚠️ Cannot fetch inbox_preview - missing customer UUID after search');
                }
            } else {
                console.log('[CHAT-MODAL] ℹ️ PancakeDataManager not available');
            }

            if (chatInfo.hasUnread) {
                markReadBtn.style.display = 'inline-flex';
            }

            // Fetch initial messages with pagination support
            // Pass customerId to avoid 400 Bad Request from Pancake API
            const response = await window.chatDataManager.fetchMessages(channelId, psid, window.currentConversationId, window.currentCustomerUUID);
            window.allChatMessages = response.messages || [];
            currentChatCursor = response.after; // Store cursor for next page

            // Update customer UUID from response if not already set
            if (response.customerId && !window.currentCustomerUUID) {
                window.currentCustomerUUID = response.customerId;
                console.log(`[CHAT] ✅ Updated currentCustomerUUID from messages response: ${window.currentCustomerUUID}`);
            }

            console.log(`[CHAT] Initial load: ${window.allChatMessages.length} messages, cursor: ${currentChatCursor}`);

            renderChatMessages(window.allChatMessages, true);

            // Setup infinite scroll for messages
            setupChatInfiniteScroll();

            // Setup new message indicator listener
            setupNewMessageIndicatorListener();
        }

        /* LEGACY CODE REMOVED
        // Initialize Chat Product State
        initChatProductSearch();
     
        // Firebase Sync Logic - Shared products across all orders
        if (database) {
            currentChatProductsRef = database.ref('order_products/shared');
            currentChatProductsRef.on('value', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    console.log('[CHAT-FIREBASE] Loaded shared products from Firebase:', data);
                    currentChatOrderDetails = data;
                    renderChatProductsPanel();
                } else {
                    console.log('[CHAT-FIREBASE] No shared data in Firebase, initializing from order details');
                    // If no data in Firebase, initialize from order and save to shared
                    currentChatOrderDetails = order.Details ? JSON.parse(JSON.stringify(order.Details)) : [];
                    renderChatProductsPanel();
                    // Save initial state to shared Firebase path
                    saveChatProductsToFirebase('shared', currentChatOrderDetails);
                }
            });
        } else {
            // Fallback if no firebase
            currentChatOrderDetails = order.Details ? JSON.parse(JSON.stringify(order.Details)) : [];
            renderChatProductsPanel();
        }
        */



    } catch (error) {
        console.error(`[CHAT] Error loading ${type}:`, error);
        const errorText = type === 'comment' ? 'Lỗi khi tải bình luận' : 'Lỗi khi tải tin nhắn';
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${errorText}</p>
                <p style="font-size: 12px; color: #9ca3af;">${error.message}</p>
            </div>`;
    }
}

window.closeChatModal = async function () {
    // Cleanup unsaved held products
    if (typeof window.cleanupHeldProducts === 'function') {
        await window.cleanupHeldProducts();
    }

    document.getElementById('chatModal').classList.remove('show');

    // Clean up scroll listener
    const modalBody = document.getElementById('chatModalBody');
    if (modalBody) {
        modalBody.removeEventListener('scroll', handleChatScroll);
    }

    // Reset pagination state
    window.currentChatChannelId = null;
    window.currentChatPSID = null;
    currentChatType = null;
    currentChatCursor = null;
    window.allChatMessages = [];
    window.allChatComments = [];
    window.chatMessagesById = {}; // Clear messages map for reply functionality
    isLoadingMoreMessages = false;
    currentOrder = null;
    currentChatOrderId = null;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Reset image upload state
    currentPastedImage = null;
    window.currentPastedImage = null;
    window.uploadedImagesData = [];
    window.isUploadingImages = false;

    // Reset purchase comment highlight state
    window.purchaseCommentId = null;
    window.purchaseFacebookPostId = null;
    window.purchaseFacebookASUserId = null;

    // Hide reply preview
    const replyPreviewContainer = document.getElementById('chatReplyPreviewContainer');
    if (replyPreviewContainer) {
        replyPreviewContainer.style.display = 'none';
    }

    // Detach Firebase listener
    if (currentChatProductsRef) {
        currentChatProductsRef.off();
        currentChatProductsRef = null;
    }
}

/**
 * Upload image with Firebase cache check
 * Returns uploaded image data or error
 * @param {Blob} imageBlob - Image blob to upload
 * @param {string|number} productId - Product ID (optional, for cache)
 * @param {string} productName - Product name (optional, for cache)
 * @param {string} channelId - Channel ID for Pancake upload
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
window.uploadImageWithCache = async function uploadImageWithCache(imageBlob, productId, productName, channelId) {
    try {
        let contentUrl = null;
        let contentId = null;
        let dimensions = null;

        // Check Firebase cache if productId exists
        if (productId && window.firebaseImageCache) {
            console.log('[UPLOAD-CACHE] Checking Firebase cache for product:', productId);

            const cached = await window.firebaseImageCache.get(productId);

            if (cached && cached.content_url) {
                // ✅ CACHE HIT
                console.log('[UPLOAD-CACHE] ✅ Cache HIT! Reusing:', cached.content_url);
                contentUrl = cached.content_url;
                dimensions = await getImageDimensions(imageBlob);

                return {
                    success: true,
                    data: {
                        content_url: contentUrl,
                        content_id: null,
                        width: dimensions.width,
                        height: dimensions.height,
                        cached: true
                    }
                };
            }
        }

        // Cache miss or no productId - Upload to Pancake
        console.log('[UPLOAD-CACHE] Uploading to Pancake...');

        const [uploadResult, dims] = await Promise.all([
            window.pancakeDataManager.uploadImage(channelId, imageBlob),
            getImageDimensions(imageBlob)
        ]);

        contentUrl = uploadResult.content_url;
        contentId = uploadResult.id;
        dimensions = dims;

        console.log('[UPLOAD-CACHE] Upload success:', contentUrl);

        // Save to Firebase cache if productId exists
        if (productId && productName && window.firebaseImageCache) {
            console.log('[UPLOAD-CACHE] Saving to Firebase cache...');
            await window.firebaseImageCache.set(productId, productName, contentUrl)
                .catch(err => {
                    console.warn('[UPLOAD-CACHE] Cache save failed (non-critical):', err);
                });
        }

        return {
            success: true,
            data: {
                content_url: contentUrl,
                content_id: contentId,
                width: dimensions.width,
                height: dimensions.height,
                cached: false
            }
        };

    } catch (error) {
        console.error('[UPLOAD-CACHE] Upload failed:', error);
        return {
            success: false,
            error: error.message || 'Upload failed'
        };
    }
}

/**
 * Handle paste event on chat input
 * NOW: Upload immediately after paste
 */
function handleChatInputPaste(event) {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    let hasImage = false;

    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            hasImage = true;
            event.preventDefault(); // Prevent default paste to avoid clearing text input

            const blob = item.getAsFile();
            currentPastedImage = blob;

            // Disable text input when image is present
            const chatInput = document.getElementById('chatReplyInput');
            if (chatInput) {
                chatInput.disabled = true;
                chatInput.style.opacity = '0.6';
                chatInput.style.cursor = 'not-allowed';
                chatInput.placeholder = 'Xóa hoặc gửi ảnh để nhập tin nhắn...';
            }

            // Show preview with loading state
            const reader = new FileReader();
            reader.onload = async function (e) {
                const previewContainer = document.getElementById('chatImagePreviewContainer');
                if (!previewContainer) return;

                // Show preview with loading overlay
                previewContainer.style.display = 'flex';
                previewContainer.style.alignItems = 'center';
                previewContainer.style.justifyContent = 'space-between';

                previewContainer.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; position: relative;">
                        <img id="pastedImagePreview" src="${e.target.result}" style="height: 50px; border-radius: 4px; border: 1px solid #ddd; opacity: 0.5;">
                        <div id="uploadOverlay" style="position: absolute; left: 0; top: 0; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.8);">
                            <i class="fas fa-spinner fa-spin" style="color: #3b82f6;"></i>
                        </div>
                        <span id="uploadStatus" style="font-size: 12px; color: #3b82f6;">Đang tải lên Pancake...</span>
                    </div>
                    <button onclick="clearPastedImage()" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 16px;">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                // Upload immediately
                const productId = null; // Paste doesn't have productId
                const productName = null;
                const channelId = window.currentChatChannelId;

                if (!channelId) {
                    console.warn('[PASTE] No channelId available, skipping upload');
                    updateUploadPreviewUI(false, 'Không thể upload: Thiếu thông tin', false);
                    return;
                }

                const result = await uploadImageWithCache(blob, productId, productName, channelId);

                // Initialize array if needed
                if (!window.uploadedImagesData) {
                    window.uploadedImagesData = [];
                }

                if (result.success) {
                    // Upload success - ADD to array (not replace)
                    window.uploadedImagesData.push({
                        ...result.data,
                        blob: blob,
                        productId: productId,
                        productName: productName
                    });
                    updateMultipleImagesPreview(); // NEW: Update preview with all images
                } else {
                    // Upload failed - still show in preview with error
                    window.uploadedImagesData.push({
                        blob: blob,
                        productId: productId,
                        productName: productName,
                        error: result.error,
                        uploadFailed: true
                    });
                    updateMultipleImagesPreview();
                }
            };
            reader.readAsDataURL(blob);
            break; // Only handle first image
        }
    }
}

/**
 * NEW: Update preview UI for multiple images (horizontal scroll)
 */
window.updateMultipleImagesPreview = function updateMultipleImagesPreview() {
    const previewContainer = document.getElementById('chatImagePreviewContainer');
    if (!previewContainer) return;

    if (!window.uploadedImagesData || window.uploadedImagesData.length === 0) {
        // No images - hide preview
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';

        // Re-enable text input
        const chatInput = document.getElementById('chatReplyInput');
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.style.opacity = '1';
            chatInput.style.cursor = 'text';
            chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
        }
        return;
    }

    // Show preview with horizontal scroll
    previewContainer.style.display = 'block';
    previewContainer.style.overflowX = 'auto';
    previewContainer.style.whiteSpace = 'nowrap';
    previewContainer.style.padding = '8px';
    previewContainer.style.background = '#f9fafb';
    previewContainer.style.borderRadius = '4px';

    let html = '<div style="display: flex; gap: 8px; align-items: flex-start;">';

    window.uploadedImagesData.forEach((imageData, index) => {
        const imageUrl = imageData.blob ? URL.createObjectURL(imageData.blob) : '';
        const isUploading = !imageData.content_url && !imageData.uploadFailed;
        const isSuccess = imageData.content_url && !imageData.uploadFailed;
        const isFailed = imageData.uploadFailed;
        const isCached = imageData.cached;

        html += `
            <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; position: relative;">
                <!-- Image preview -->
                <div style="position: relative; width: 80px; height: 80px;">
                    <img src="${imageUrl}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 2px solid ${isFailed ? '#ef4444' : isSuccess ? '#10b981' : '#3b82f6'}; opacity: ${isUploading ? '0.5' : '1'};">

                    ${isUploading ? `
                        <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.8);">
                            <i class="fas fa-spinner fa-spin" style="color: #3b82f6;"></i>
                        </div>
                    ` : ''}

                    <!-- Delete button (top-right) -->
                    <button onclick="removeImageAtIndex(${index})" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #ef4444; color: white; border: 2px solid white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; padding: 0;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Status text -->
                <span style="font-size: 10px; max-width: 80px; text-align: center; white-space: normal; line-height: 1.2;">
                    ${isUploading ? '<span style="color: #3b82f6;">Đang tải...</span>' :
                isFailed ? `<span style="color: #ef4444;">${imageData.error || 'Lỗi'}</span><br><button onclick="retryUploadAtIndex(${index})" style="margin-top: 2px; padding: 2px 6px; font-size: 9px; background: #3b82f6; color: white; border: none; border-radius: 3px; cursor: pointer;">Retry</button>` :
                    isCached ? '<span style="color: #10b981;"><i class="fas fa-recycle"></i> Đã có sẵn</span>' :
                        `<span style="color: #10b981;"><i class="fas fa-check"></i> ${Math.round((imageData.blob?.size || 0) / 1024)} KB</span>`}
                </span>
            </div>
        `;
    });

    html += `
        <!-- Clear all button -->
        <button onclick="clearAllImages()" style="margin-left: 8px; padding: 8px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; align-self: center; white-space: normal; font-size: 12px;">
            <i class="fas fa-trash"></i><br>Xóa tất cả
        </button>
    </div>`;

    previewContainer.innerHTML = html;

    // Disable text input when images are present
    const chatInput = document.getElementById('chatReplyInput');
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.style.opacity = '0.6';
        chatInput.style.cursor = 'not-allowed';
        chatInput.placeholder = 'Xóa hoặc gửi ảnh để nhập tin nhắn...';
    }

    // Update send button state based on upload status
    updateSendButtonState();
};

/**
 * Update send button state - disable if any image is still uploading
 */
function updateSendButtonState() {
    const sendBtn = document.getElementById('chatSendBtn');
    if (!sendBtn) return;

    // Check if any image is still uploading
    const hasUploadingImages = window.uploadedImagesData && window.uploadedImagesData.some(img =>
        !img.content_url && !img.uploadFailed
    );

    if (hasUploadingImages) {
        // Disable send button
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.cursor = 'not-allowed';
        sendBtn.title = 'Đang tải ảnh... Vui lòng đợi';
        window.isUploadingImages = true;
    } else {
        // Enable send button
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        sendBtn.style.cursor = 'pointer';
        sendBtn.title = 'Gửi tin nhắn';
        window.isUploadingImages = false;
    }
}

/**
 * Update upload preview UI based on upload result (DEPRECATED - use updateMultipleImagesPreview)
 */
window.updateUploadPreviewUI = function updateUploadPreviewUI(success, message, cached) {
    const preview = document.getElementById('pastedImagePreview');
    const overlay = document.getElementById('uploadOverlay');
    const status = document.getElementById('uploadStatus');

    if (!preview || !overlay || !status) return;

    if (success) {
        // Success - show normal preview
        preview.style.opacity = '1';
        overlay.style.display = 'none';

        if (cached) {
            status.innerHTML = '<i class="fas fa-recycle" style="color: #10b981; margin-right: 4px;"></i>Ảnh đã có sẵn';
            status.style.color = '#10b981';
        } else {
            status.innerHTML = '<i class="fas fa-check-circle" style="color: #10b981; margin-right: 4px;"></i>' + message;
            status.style.color = '#10b981';
        }
    } else {
        // Failed - show error with retry option
        preview.style.opacity = '1';
        overlay.style.display = 'none';
        status.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #ef4444; margin-right: 4px;"></i>${message} <button onclick="retryUpload()" style="margin-left: 6px; padding: 2px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">Retry</button>`;
        status.style.color = '#ef4444';
    }
}

/**
 * NEW: Remove a single image at index
 */
window.removeImageAtIndex = function (index) {
    if (!window.uploadedImagesData || index < 0 || index >= window.uploadedImagesData.length) return;

    // Revoke blob URL if exists
    const imageData = window.uploadedImagesData[index];
    if (imageData.blob) {
        URL.revokeObjectURL(URL.createObjectURL(imageData.blob));
    }

    // Remove from array
    window.uploadedImagesData.splice(index, 1);

    // Update preview
    updateMultipleImagesPreview();

    console.log('[REMOVE-IMAGE] Removed image at index', index, '- remaining:', window.uploadedImagesData.length);
};

/**
 * NEW: Clear all images
 */
window.clearAllImages = function () {
    // Revoke all blob URLs
    if (window.uploadedImagesData) {
        window.uploadedImagesData.forEach(imageData => {
            if (imageData.blob) {
                URL.revokeObjectURL(URL.createObjectURL(imageData.blob));
            }
        });
    }

    // Clear array
    window.uploadedImagesData = [];

    // Update preview (will hide it)
    updateMultipleImagesPreview();

    console.log('[CLEAR-ALL-IMAGES] Cleared all images');
};

/**
 * NEW: Retry upload at specific index (for failed uploads)
 */
window.retryUploadAtIndex = async function (index) {
    if (!window.uploadedImagesData || index < 0 || index >= window.uploadedImagesData.length) return;

    const imageData = window.uploadedImagesData[index];
    if (!imageData.blob) return;

    console.log('[RETRY-UPLOAD] Retrying upload at index', index);

    // Mark as uploading
    window.uploadedImagesData[index] = {
        blob: imageData.blob,
        productId: imageData.productId,
        productName: imageData.productName
    };
    updateMultipleImagesPreview();

    // Retry upload
    const channelId = window.currentChatChannelId;
    if (!channelId) {
        window.uploadedImagesData[index].uploadFailed = true;
        window.uploadedImagesData[index].error = 'Không thể upload: Thiếu thông tin';
        updateMultipleImagesPreview();
        return;
    }

    const result = await window.uploadImageWithCache(
        imageData.blob,
        imageData.productId,
        imageData.productName,
        channelId
    );

    if (result.success) {
        // Update with success data
        window.uploadedImagesData[index] = {
            ...result.data,
            blob: imageData.blob,
            productId: imageData.productId,
            productName: imageData.productName
        };
    } else {
        // Update with error
        window.uploadedImagesData[index] = {
            blob: imageData.blob,
            productId: imageData.productId,
            productName: imageData.productName,
            error: result.error,
            uploadFailed: true
        };
    }

    updateMultipleImagesPreview();
};

/**
 * Retry upload when failed (DEPRECATED - use retryUploadAtIndex)
 */
window.retryUpload = async function () {
    if (!currentPastedImage) return;

    const status = document.getElementById('uploadStatus');
    const overlay = document.getElementById('uploadOverlay');
    const preview = document.getElementById('pastedImagePreview');

    if (status && overlay && preview) {
        status.textContent = 'Đang thử lại...';
        status.style.color = '#3b82f6';
        overlay.style.display = 'flex';
        preview.style.opacity = '0.5';
    }

    const productId = window.currentPastedImageProductId || null;
    const productName = window.currentPastedImageProductName || null;
    const channelId = window.currentChatChannelId;

    const result = await uploadImageWithCache(currentPastedImage, productId, productName, channelId);

    if (result.success) {
        uploadedImageData = result.data;
        window.uploadedImageData = result.data;
        updateUploadPreviewUI(true, `${Math.round(currentPastedImage.size / 1024)} KB`, result.data.cached);
    } else {
        uploadedImageData = null;
        window.uploadedImageData = null;
        updateUploadPreviewUI(false, result.error, false);
    }
};

/**
 * Clear pasted image (UI only - keeps uploaded image on Pancake/Firebase)
 */
window.clearPastedImage = function () {
    // NEW: Use clearAllImages for multiple images
    clearAllImages();

    // Legacy cleanup
    currentPastedImage = null;
    window.currentPastedImage = null;
    window.currentPastedImageProductId = null;
    window.currentPastedImageProductName = null;

    console.log('[CLEAR-IMAGE] Cleared all images (UI only - images still on Pancake/Firebase)');
}

// Message Queue Management
window.chatMessageQueue = window.chatMessageQueue || [];
window.chatIsProcessingQueue = false;

// Reply Message State
window.currentReplyingToMessage = null; // Stores the message being replied to

/**
 * Auto-resize textarea based on content
 */
function autoResizeTextarea(textarea) {
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height based on scrollHeight, but don't exceed max-height
    const maxHeight = 120; // matches max-height in CSS
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = newHeight + 'px';
}

/**
 * Handle Enter key in chat input - prevent double submission, allow Shift+Enter for newlines
 */
function handleChatInputKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        // Skip if autocomplete is active (let quick-reply-manager handle the Enter)
        if (window.quickReplyManager && window.quickReplyManager.autocompleteActive) {
            console.log('[CHAT] Enter pressed but autocomplete is active, skipping sendReplyComment');
            return; // Don't prevent default - let quick-reply-manager handle it
        }

        event.preventDefault(); // Prevent default form submission and double trigger
        event.stopPropagation(); // Stop event bubbling

        // Call sendReplyComment only once
        window.sendReplyComment();
    }
    // Shift+Enter will use default behavior (insert newline)
    // After newline is inserted, resize will happen via input event
}

/**
 * Handle input event for auto-resize
 */
function handleChatInputInput(event) {
    autoResizeTextarea(event.target);
}

/**
 * Set a message to reply to by ID (lookup from chatMessagesById map)
 */
window.setReplyMessageById = function (messageId) {
    const message = window.chatMessagesById?.[messageId];
    if (message) {
        window.setReplyMessage(message);
    } else {
        console.warn('[REPLY] Message not found in map:', messageId);
    }
};

/**
 * Set a message to reply to
 */
window.setReplyMessage = function (message) {
    window.currentReplyingToMessage = message;

    // Show reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    const previewText = document.getElementById('chatReplyPreviewText');

    if (previewContainer && previewText) {
        // Extract text from message (handle both text and HTML)
        const messageText = extractMessageText(message);
        const truncated = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;

        // Get sender name and Facebook ID
        const senderName = message.FromName || message.from?.name || 'Khách hàng';
        const fbId = message.From?.id || message.from?.id || message.FromId || null;

        // Get timestamp
        const timestamp = message.CreatedTime || message.updated_at || message.created_at;
        let timeStr = '';
        if (timestamp) {
            const date = new Date(timestamp);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            timeStr = `${day}/${month}/${year} ${hours}:${minutes}`;
        }

        // Verify fb_id matches current conversation's customer (if available)
        if (fbId && window.currentChatPSID && fbId !== window.currentChatPSID) {
            console.warn('[REPLY] ⚠️ Facebook ID mismatch!', {
                messageFbId: fbId,
                conversationPSID: window.currentChatPSID
            });
        }

        // Display with timestamp
        previewText.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
                <div style="flex: 1; min-width: 0;">
                    <strong>${senderName}:</strong> ${truncated}
                </div>
                ${timeStr ? `<div style="color: #6b7280; font-size: 12px; white-space: nowrap; flex-shrink: 0;">${timeStr}</div>` : ''}
            </div>
        `;
        previewContainer.style.display = 'block';
    }

    // Focus input
    const input = document.getElementById('chatReplyInput');
    if (input) input.focus();

    console.log('[REPLY] Set reply to message:', message.id || message.Id, 'fb_id:', fbId, 'at', timestamp);
};

/**
 * Cancel replying to a message
 */
window.cancelReplyMessage = function () {
    window.currentReplyingToMessage = null;

    // Hide reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }

    console.log('[REPLY] Cancelled reply');
};

/**
 * Cancel replying to a comment
 */
window.cancelReplyComment = function () {
    // Clear reply state
    currentParentCommentId = null;
    currentPostId = null;

    // Hide reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }

    // Reset input and disable it (only allow replying to comments)
    const input = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (input) {
        input.value = ''; // Clear input content
        input.disabled = true;
        input.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
        input.style.background = '#f3f4f6';
        input.style.cursor = 'not-allowed';
    }

    // Disable send button
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.cursor = 'not-allowed';
    }

    console.log('[REPLY] Cancelled comment reply');
};

/**
 * Cancel reply - works for both messages and comments
 */
window.cancelReply = function () {
    // Check if we're in comment or message mode
    if (currentChatType === 'comment') {
        window.cancelReplyComment();
    } else {
        window.cancelReplyMessage();
    }
};

/**
 * Extract text from message object (handles both text and HTML)
 */
function extractMessageText(message) {
    // Try different message fields
    let text = message.message || message.Message || message.text || '';

    // If HTML, extract text
    if (text.includes('<')) {
        const div = document.createElement('div');
        div.innerHTML = text;
        text = div.textContent || div.innerText || '';
    }

    return text.trim();
}

/**
 * Show/Hide sending indicator in chat modal
 */
window.showChatSendingIndicator = function (text = 'Đang gửi...', queueCount = 0) {
    const indicator = document.getElementById('chatSendingIndicator');
    const textSpan = document.getElementById('chatSendingText');
    const queueSpan = document.getElementById('chatQueueCount');

    if (indicator) {
        indicator.style.display = 'flex';
        if (textSpan) textSpan.textContent = text;
        if (queueSpan) {
            if (queueCount > 0) {
                queueSpan.textContent = `+${queueCount}`;
                queueSpan.style.display = 'block';
            } else {
                queueSpan.style.display = 'none';
            }
        }
    }
}

window.hideChatSendingIndicator = function () {
    const indicator = document.getElementById('chatSendingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

/**
 * Process message queue
 */
async function processChatMessageQueue() {
    if (window.chatIsProcessingQueue || window.chatMessageQueue.length === 0) {
        return;
    }

    window.chatIsProcessingQueue = true;

    while (window.chatMessageQueue.length > 0) {
        const queueCount = window.chatMessageQueue.length - 1;
        showChatSendingIndicator('Đang gửi...', queueCount);

        const messageData = window.chatMessageQueue.shift();
        try {
            // Route to correct function based on chatType
            if (messageData.chatType === 'message') {
                await sendMessageInternal(messageData);
            } else if (messageData.chatType === 'comment') {
                await sendCommentInternal(messageData);
            } else {
                console.error('[QUEUE] Unknown chatType:', messageData.chatType);
                throw new Error('Unknown chatType: ' + messageData.chatType);
            }
        } catch (error) {
            console.error('[QUEUE] Error sending:', error);
            // Continue with next message even if this one fails
        }
    }

    window.chatIsProcessingQueue = false;
    hideChatSendingIndicator();
}

// =====================================================
// PUBLIC API - Message Modal
// =====================================================

/**
 * Send message (MESSAGE modal only)
 * Public wrapper - adds to queue
 */
window.sendMessage = async function () {
    if (isSendingMessage) {
        console.log('[MESSAGE] Already sending, skipping duplicate call');
        return;
    }

    // Check if images are still uploading
    if (window.isUploadingImages) {
        alert('Ảnh đang được tải lên. Vui lòng đợi cho đến khi tải xong.');
        console.warn('[MESSAGE] Cannot send while images are uploading');
        return;
    }

    isSendingMessage = true;

    try {
        const messageInput = document.getElementById('chatReplyInput');
        let message = messageInput.value.trim();

        // Add signature
        if (message) {
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;
            if (displayName) {
                message = message + '\nNv. ' + displayName;
            }
        }

        // Validate - skip if quick reply is sending
        const hasImages = (window.uploadedImagesData && window.uploadedImagesData.length > 0);
        if (!message && !hasImages) {
            // Don't show alert if quick reply is currently sending
            if (window.isQuickReplySending) {
                console.log('[MESSAGE] Skipping validation - quick reply is sending');
                return;
            }
            alert('Vui lòng nhập tin nhắn hoặc dán ảnh!');
            return;
        }

        // Validate required info
        if (!currentOrder || !window.currentConversationId || !window.currentChatChannelId) {
            alert('Thiếu thông tin để gửi tin nhắn. Vui lòng đóng và mở lại modal.');
            console.error('[MESSAGE] Missing required info');
            return;
        }

        // Capture replied message ID
        const repliedMessageId = window.currentReplyingToMessage ?
            (window.currentReplyingToMessage.id || window.currentReplyingToMessage.Id || null) : null;

        // Add to queue - use currentSendPageId for sending (independent from view page)
        const sendPageId = window.currentSendPageId || window.currentChatChannelId;
        console.log('[MESSAGE] Adding to queue', { repliedMessageId, imageCount: window.uploadedImagesData?.length || 0, sendPageId });
        window.chatMessageQueue.push({
            message,
            uploadedImagesData: window.uploadedImagesData || [],
            order: currentOrder,
            conversationId: window.currentConversationId,
            channelId: sendPageId,
            chatType: 'message', // EXPLICITLY set to message
            repliedMessageId: repliedMessageId,
            customerId: window.currentCustomerUUID // Add customer_id for Pancake API
        });

        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';

        // Clear images
        if (window.clearAllImages) {
            window.clearAllImages();
        }

        // Legacy cleanup
        currentPastedImage = null;
        window.currentPastedImage = null;
        window.currentPastedImageProductId = null;
        window.currentPastedImageProductName = null;

        // Clear reply state
        window.cancelReply();

        // Process queue
        processChatMessageQueue();
    } finally {
        setTimeout(() => {
            isSendingMessage = false;
        }, 100);
    }
};

// =====================================================
// PUBLIC API - Comment Modal
// =====================================================

/**
 * Send comment reply (COMMENT modal only)
 * Public wrapper - adds to queue
 */
window.sendComment = async function () {
    if (isSendingMessage) {
        console.log('[COMMENT] Already sending, skipping duplicate call');
        return;
    }

    // Check if images are still uploading
    if (window.isUploadingImages) {
        alert('Ảnh đang được tải lên. Vui lòng đợi cho đến khi tải xong.');
        console.warn('[COMMENT] Cannot send while images are uploading');
        return;
    }

    isSendingMessage = true;

    try {
        const messageInput = document.getElementById('chatReplyInput');
        let message = messageInput.value.trim();

        // Add signature
        if (message) {
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;
            if (displayName) {
                message = message + '\nNv. ' + displayName;
            }
        }

        // Validate - skip if quick reply is sending
        const hasImages = (window.uploadedImagesData && window.uploadedImagesData.length > 0);
        if (!message && !hasImages) {
            // Don't show alert if quick reply is currently sending
            if (window.isQuickReplySending) {
                console.log('[COMMENT] Skipping validation - quick reply is sending');
                return;
            }
            alert('Vui lòng nhập bình luận hoặc dán ảnh!');
            return;
        }

        // Validate required info
        // Note: conversationId will be built from order data in sendCommentInternal, so it's OK if null here
        if (!currentOrder || !window.currentChatChannelId) {
            alert('Thiếu thông tin để gửi bình luận. Vui lòng đóng và mở lại modal.');
            console.error('[COMMENT] Missing required info');
            return;
        }

        // Add to queue - use currentSendPageId for sending (independent from view page)
        const sendPageId = window.currentSendPageId || window.currentChatChannelId;
        console.log('[COMMENT] Adding to queue', { imageCount: window.uploadedImagesData?.length || 0, sendPageId });
        window.chatMessageQueue.push({
            message,
            uploadedImagesData: window.uploadedImagesData || [],
            order: currentOrder,
            conversationId: window.currentConversationId,
            channelId: sendPageId,
            chatType: 'comment', // EXPLICITLY set to comment
            parentCommentId: currentParentCommentId,
            postId: currentPostId || currentOrder.Facebook_PostId,
            customerId: window.currentCustomerUUID // Add customer_id for Pancake API
        });

        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';

        // Clear images
        if (window.clearAllImages) {
            window.clearAllImages();
        }

        // Legacy cleanup
        currentPastedImage = null;
        window.currentPastedImage = null;
        window.currentPastedImageProductId = null;
        window.currentPastedImageProductName = null;

        // Clear reply state (for nested comments)
        if (window.cancelReply) {
            window.cancelReply();
        }

        // Process queue
        processChatMessageQueue();
    } finally {
        setTimeout(() => {
            isSendingMessage = false;
        }, 100);
    }
};

// =====================================================
// LEGACY WRAPPER - For backwards compatibility
// =====================================================

/**
 * Legacy wrapper - routes to correct function based on currentChatType
 * @deprecated Use window.sendMessage() or window.sendComment() directly
 */
window.sendReplyComment = async function () {
    console.log('[LEGACY] sendReplyComment called, routing to:', currentChatType);

    // Route to correct function based on chat type
    if (currentChatType === 'message') {
        return window.sendMessage();
    } else if (currentChatType === 'comment') {
        return window.sendComment();
    } else {
        console.error('[LEGACY] Unknown currentChatType:', currentChatType);
        alert('Lỗi: Không xác định được loại modal (message/comment)');
    }
};

/**
 * Get image dimensions from blob/file
 * @param {Blob|File} blob
 * @returns {Promise<{width: number, height: number}>}
 */
function getImageDimensions(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = function () {
            URL.revokeObjectURL(url);
            resolve({
                width: img.naturalWidth,
                height: img.naturalHeight
            });
        };

        img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

// =====================================================
// MESSAGE MODAL - Send message functions
// =====================================================

/**
 * Send message (MESSAGE modal only)
 * Called by queue processor
 */
async function sendMessageInternal(messageData) {
    const { message, uploadedImagesData, order, conversationId, channelId, repliedMessageId, customerId } = messageData;

    try {
        // Get Pancake token
        const token = await window.pancakeTokenManager.getToken();
        if (!token) {
            throw new Error('Không tìm thấy Pancake token. Vui lòng cài đặt token trong Settings.');
        }

        showChatSendingIndicator('Đang gửi tin nhắn...');

        // Step 1: Process multiple images
        let imagesDataArray = [];
        if (uploadedImagesData && uploadedImagesData.length > 0) {
            console.log('[MESSAGE] Processing', uploadedImagesData.length, 'images');
            showChatSendingIndicator(`Đang xử lý ${uploadedImagesData.length} ảnh...`);

            for (let i = 0; i < uploadedImagesData.length; i++) {
                const imageData = uploadedImagesData[i];

                try {
                    // Check if image was already uploaded successfully
                    if (imageData.content_url && !imageData.uploadFailed) {
                        console.log(`[MESSAGE] Image ${i + 1}: Using pre-uploaded:`, imageData.content_url);
                        imagesDataArray.push(imageData);
                    } else if (imageData.blob) {
                        // Retry upload
                        console.log(`[MESSAGE] Image ${i + 1}: Retrying upload...`);
                        showChatSendingIndicator(`Đang tải ảnh ${i + 1}/${uploadedImagesData.length}...`);

                        const result = await window.uploadImageWithCache(
                            imageData.blob,
                            imageData.productId || null,
                            imageData.productName || null,
                            channelId
                        );

                        if (!result.success) {
                            throw new Error(`Ảnh ${i + 1} upload failed: ${result.error || 'Unknown error'}`);
                        }

                        console.log(`[MESSAGE] Image ${i + 1}: Uploaded:`, result.data.content_url);
                        imagesDataArray.push(result.data);
                    }
                } catch (uploadError) {
                    console.error(`[MESSAGE] Image ${i + 1} processing failed:`, uploadError);
                    throw new Error(`Tải ảnh ${i + 1} thất bại: ${uploadError.message}`);
                }
            }

            console.log('[MESSAGE] All images processed:', imagesDataArray.length);
        }

        // Step 2: Build FormData payload (INBOX uses multipart/form-data)
        const formData = new FormData();
        formData.append('action', 'reply_inbox');
        formData.append('message', message);

        // Add send_by_platform (optional, but Pancake might expect it)
        // Note: Real Pancake doesn't seem to use this field, but keeping for compatibility
        // formData.append('send_by_platform', 'web');

        // Add multiple images data
        if (imagesDataArray.length > 0) {
            console.log('[MESSAGE] Adding', imagesDataArray.length, 'images to FormData');

            // For multiple images, we need to append arrays as JSON strings or individual fields
            // Based on Pancake API, images might be sent differently
            // Let's try appending as comma-separated values or individual entries
            const contentUrls = [];
            const contentIds = [];
            const dimensions = [];

            imagesDataArray.forEach((imageData) => {
                contentUrls.push(imageData.content_url);
                contentIds.push(imageData.content_id || imageData.id || '');
                dimensions.push(JSON.stringify({
                    width: imageData.image_data?.width || imageData.width || 0,
                    height: imageData.image_data?.height || imageData.height || 0
                }));
            });

            // Append as arrays (check if Pancake accepts this format)
            formData.append('content_urls', JSON.stringify(contentUrls));
            formData.append('content_ids', JSON.stringify(contentIds));
            formData.append('dimensions', JSON.stringify(dimensions));
        }

        // Add replied_message_id if exists
        if (repliedMessageId) {
            formData.append('replied_message_id', repliedMessageId);
            console.log('[MESSAGE] Adding replied_message_id:', repliedMessageId);
        }

        // Step 3: Send message
        // IMPORTANT: customer_id is REQUIRED by Pancake API (as shown in real browser network request)
        let queryParams = `access_token=${token}`;
        if (customerId) {
            queryParams += `&customer_id=${customerId}`;
        }
        const replyUrl = window.API_CONFIG.buildUrl.pancake(
            `pages/${channelId}/conversations/${conversationId}/messages`,
            queryParams
        );

        console.log('[MESSAGE] Sending message...');
        console.log('[MESSAGE] URL:', replyUrl);
        console.log('[MESSAGE] FormData fields:', Array.from(formData.entries()).map(([k, v]) => `${k}: ${v}`).join(', '));

        const replyResponse = await API_CONFIG.smartFetch(replyUrl, {
            method: 'POST',
            body: formData // FormData automatically sets Content-Type with boundary
        });

        if (!replyResponse.ok) {
            const errorText = await replyResponse.text();
            console.error('[MESSAGE] Send failed:', errorText);
            throw new Error(`Gửi tin nhắn thất bại: ${replyResponse.status} ${replyResponse.statusText}`);
        }

        const replyData = await replyResponse.json();
        console.log('[MESSAGE] Response:', replyData);

        if (!replyData.success) {
            console.error('[MESSAGE] API Error:', replyData);
            const errorMessage = replyData.error || replyData.message || replyData.reason || 'Unknown error';
            throw new Error('Gửi tin nhắn thất bại: ' + errorMessage);
        }

        // Step 4: Optimistic UI update
        const now = new Date().toISOString();
        skipWebhookUpdate = true;

        const tempMessage = {
            Id: `temp_${Date.now()}`,
            id: `temp_${Date.now()}`,
            Message: message,
            CreatedTime: now,
            IsOwner: true,
            is_temp: true
        };

        // Add image attachments
        if (imagesDataArray && imagesDataArray.length > 0) {
            tempMessage.Attachments = imagesDataArray.map(img => ({
                Type: 'image',
                Payload: { Url: img.content_url }
            }));
        }

        window.allChatMessages.push(tempMessage);
        renderChatMessages(window.allChatMessages, true);

        console.log('[MESSAGE] Added optimistic message to UI');

        // Step 5: Refresh messages from API
        setTimeout(async () => {
            try {
                if (window.currentChatPSID) {
                    const response = await window.chatDataManager.fetchMessages(channelId, window.currentChatPSID);
                    if (response.messages && response.messages.length > 0) {
                        window.allChatMessages = response.messages;
                        renderChatMessages(window.allChatMessages, false);
                        console.log('[MESSAGE] Replaced temp messages with real data');
                    }
                }
            } finally {
                skipWebhookUpdate = false;
            }
        }, 300);

        // Success notification
        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã gửi tin nhắn thành công!', 'success');
        }

        console.log('[MESSAGE] ✅ Sent successfully');

    } catch (error) {
        console.error('[MESSAGE] ❌ Error:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi khi gửi tin nhắn: ' + error.message, 'error');
        } else {
            alert('❌ Lỗi khi gửi tin nhắn: ' + error.message);
        }
        throw error;
    }
}

// =====================================================
// COMMENT MODAL - Send comment functions
// =====================================================

/**
 * Send comment reply (COMMENT modal only)
 * Called by queue processor
 */
async function sendCommentInternal(commentData) {
    const { message, uploadedImagesData, order, conversationId, channelId, parentCommentId, postId, customerId } = commentData;

    try {
        // Get Pancake token
        const token = await window.pancakeTokenManager.getToken();
        if (!token) {
            throw new Error('Không tìm thấy Pancake token. Vui lòng cài đặt token trong Settings.');
        }

        showChatSendingIndicator('Đang gửi bình luận...');

        // Step 1: Process single image (comments only support 1 image)
        let imageData = null;
        if (uploadedImagesData && uploadedImagesData.length > 0) {
            const firstImage = uploadedImagesData[0];
            console.log('[COMMENT] Processing image');
            showChatSendingIndicator('Đang xử lý ảnh...');

            try {
                if (firstImage.content_url && !firstImage.uploadFailed) {
                    console.log('[COMMENT] Using pre-uploaded image:', firstImage.content_url);
                    imageData = firstImage;
                } else if (firstImage.blob) {
                    console.log('[COMMENT] Uploading image...');
                    const result = await window.uploadImageWithCache(
                        firstImage.blob,
                        firstImage.productId || null,
                        firstImage.productName || null,
                        channelId
                    );

                    if (!result.success) {
                        throw new Error(`Upload failed: ${result.error || 'Unknown error'}`);
                    }

                    console.log('[COMMENT] Image uploaded:', result.data.content_url);
                    imageData = result.data;
                }
            } catch (uploadError) {
                console.error('[COMMENT] Image processing failed:', uploadError);
                throw new Error(`Tải ảnh thất bại: ${uploadError.message}`);
            }
        }

        // Step 2: Build conversationId and validate order data
        const facebookName = order.Facebook_UserName;
        const facebookASUserId = order.Facebook_ASUserId;
        const facebookCommentId = order.Facebook_CommentId;
        const facebookPostId = order.Facebook_PostId;

        if (!facebookName || !facebookASUserId || !facebookCommentId || !facebookPostId) {
            throw new Error('Thiếu thông tin: Facebook_UserName, Facebook_ASUserId, Facebook_CommentId, hoặc Facebook_PostId');
        }

        // Use channelId from dropdown selection, or extract from order if not available
        const pageId = channelId || facebookPostId.split('_')[0];
        console.log('[COMMENT] Using pageId from selection:', pageId, '(channelId param:', channelId, ')');

        // For message_id: use parentCommentId if replying to specific comment, otherwise use order's comment ID
        let messageId;
        if (parentCommentId) {
            // Replying to a specific comment - use parentCommentId
            messageId = parentCommentId;
            console.log('[COMMENT] Using parentCommentId as messageId:', messageId);
        } else {
            // Replying to root comment or no specific parent - use order's comment ID
            const commentIds = facebookCommentId.split(',').map(id => id.trim());
            messageId = commentIds[0];
            console.log('[COMMENT] Using order comment ID as messageId:', messageId);
        }

        // IMPORTANT: For private_replies, conversationId MUST equal message_id!
        // This matches the real Pancake API format (e.g., both are "1573633073980967_1544674883102468")
        const finalConversationId = messageId;

        console.log('[COMMENT] Message ID:', messageId);
        console.log('[COMMENT] ConversationId (same as messageId):', finalConversationId);
        console.log('[COMMENT] Param conversationId:', conversationId);

        // Step 3: Prepare payload data from order (no need to fetch search/inbox_preview)
        // As per real API calls, thread_id_preview and thread_key_preview are null
        const threadId = null;
        const threadKey = null;
        const fromId = facebookASUserId;

        console.log('[COMMENT] Using data from order:', {
            pageId,
            conversationId: finalConversationId,
            fromId,
            threadId: 'null (as per real API)',
            threadKey: 'null (as per real API)'
        });

        // Step 4: Send both private_replies and reply_inbox in parallel
        showChatSendingIndicator('Đang gửi bình luận và tin nhắn...');

        // IMPORTANT: customer_id is REQUIRED by Pancake API (as shown in real browser network request)
        let queryParams = `access_token=${token}`;
        if (customerId) {
            queryParams += `&customer_id=${customerId}`;
        }
        const apiUrl = window.API_CONFIG.buildUrl.pancake(
            `pages/${pageId}/conversations/${finalConversationId}/messages`,
            queryParams
        );

        // Prepare private_replies payload (JSON)
        const privateRepliesPayload = {
            action: 'private_replies',
            message_id: messageId,
            thread_id_preview: threadId,
            thread_key_preview: threadKey,
            from_id: fromId,
            need_thread_id: false,
            message: message,
            post_id: facebookPostId
        };

        if (imageData) {
            privateRepliesPayload.content_url = imageData.content_url;
            privateRepliesPayload.content_id = imageData.id || imageData.content_id;
            privateRepliesPayload.width = imageData.image_data?.width || imageData.width || 0;
            privateRepliesPayload.height = imageData.image_data?.height || imageData.height || 0;
        }

        // Prepare reply_inbox payload (FormData)
        const replyInboxFormData = new FormData();
        replyInboxFormData.append('action', 'reply_inbox');
        replyInboxFormData.append('message', message);
        replyInboxFormData.append('thread_id', 'null');

        if (imageData) {
            const contentUrls = [imageData.content_url];
            const contentIds = [imageData.id || imageData.content_id || ''];
            const dimensions = [JSON.stringify({
                width: imageData.image_data?.width || imageData.width || 0,
                height: imageData.image_data?.height || imageData.height || 0
            })];

            replyInboxFormData.append('content_urls', JSON.stringify(contentUrls));
            replyInboxFormData.append('content_ids', JSON.stringify(contentIds));
            replyInboxFormData.append('dimensions', JSON.stringify(dimensions));
        }

        console.log('[COMMENT] Sending BOTH actions in parallel...');
        console.log('[COMMENT] 1. private_replies payload:', privateRepliesPayload);
        console.log('[COMMENT] 2. reply_inbox with thread_id=null');

        // Send both requests in parallel (non-blocking)
        const results = await Promise.allSettled([
            // Request 1: private_replies (JSON)
            API_CONFIG.smartFetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(privateRepliesPayload)
            }).then(async (response) => {
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`private_replies failed: ${response.status} - ${errorText}`);
                }
                const data = await response.json();
                if (!data.success) {
                    throw new Error(`private_replies API error: ${data.error || data.message || 'Unknown'}`);
                }
                return { action: 'private_replies', success: true, data };
            }),

            // Request 2: reply_inbox (FormData)
            API_CONFIG.smartFetch(apiUrl, {
                method: 'POST',
                body: replyInboxFormData
            }).then(async (response) => {
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`reply_inbox failed: ${response.status} - ${errorText}`);
                }
                const data = await response.json();
                if (!data.success) {
                    throw new Error(`reply_inbox API error: ${data.error || data.message || 'Unknown'}`);
                }
                return { action: 'reply_inbox', success: true, data };
            })
        ]);

        // Check results
        const privateRepliesResult = results[0];
        const replyInboxResult = results[1];

        let privateRepliesSuccess = false;
        let replyInboxSuccess = false;

        console.log('[COMMENT] === Results ===');

        if (privateRepliesResult.status === 'fulfilled') {
            console.log('[COMMENT] ✅ private_replies succeeded:', privateRepliesResult.value);
            privateRepliesSuccess = true;
        } else {
            console.warn('[COMMENT] ❌ private_replies failed:', privateRepliesResult.reason?.message || privateRepliesResult.reason);
        }

        if (replyInboxResult.status === 'fulfilled') {
            console.log('[COMMENT] ✅ reply_inbox succeeded:', replyInboxResult.value);
            replyInboxSuccess = true;
        } else {
            console.warn('[COMMENT] ❌ reply_inbox failed:', replyInboxResult.reason?.message || replyInboxResult.reason);
        }

        // At least one must succeed
        if (!privateRepliesSuccess && !replyInboxSuccess) {
            console.error('[COMMENT] ❌ Both actions failed!');
            throw new Error('Cả 2 actions đều thất bại: private_replies và reply_inbox');
        }

        console.log('[COMMENT] ✅ At least one action succeeded (private_replies:', privateRepliesSuccess, ', reply_inbox:', replyInboxSuccess, ')');

        // Step 6: Sync comments (ONLY for comments!)
        console.log('[COMMENT] Syncing comments...');
        const syncUrl = window.API_CONFIG.buildUrl.pancake(
            `pages/${pageId}/sync_comments`,
            `access_token=${token}`
        );

        const syncFormData = new FormData();
        syncFormData.append('post_id', facebookPostId);

        const syncResponse = await API_CONFIG.smartFetch(syncUrl, {
            method: 'POST',
            body: syncFormData
        });

        if (!syncResponse.ok) {
            console.warn('[COMMENT] Sync comments failed, but comment was sent');
        } else {
            const syncData = await syncResponse.json();
            console.log('[COMMENT] Sync response:', syncData);
        }

        // Step 6: Optimistic UI update
        const now = new Date().toISOString();
        skipWebhookUpdate = true;

        const tempComment = {
            Id: `temp_${Date.now()}`,
            Message: message,
            From: {
                Name: 'Me',
                Id: channelId
            },
            CreatedTime: now,
            is_temp: true,
            ParentId: parentCommentId
        };

        window.allChatComments.push(tempComment);
        renderComments(window.allChatComments, true);

        console.log('[COMMENT] Added optimistic comment to UI');

        // Step 6: Refresh comments from API
        setTimeout(async () => {
            try {
                if (window.currentChatPSID) {
                    const response = await window.chatDataManager.fetchComments(channelId, window.currentChatPSID);
                    if (response.comments && response.comments.length > 0) {
                        window.allChatComments = window.allChatComments.filter(c => !c.is_temp);

                        response.comments.forEach(newComment => {
                            const exists = window.allChatComments.some(c => c.Id === newComment.Id);
                            if (!exists) {
                                window.allChatComments.push(newComment);
                            }
                        });

                        renderComments(window.allChatComments, false);
                        console.log('[COMMENT] Replaced temp comments with real data');
                    }
                }
            } finally {
                skipWebhookUpdate = false;
            }
        }, 300);

        // Success notification
        if (window.notificationManager) {
            if (privateRepliesSuccess && replyInboxSuccess) {
                window.notificationManager.show('✅ Đã gửi cả bình luận và tin nhắn inbox thành công!', 'success');
            } else if (privateRepliesSuccess) {
                window.notificationManager.show('✅ Đã gửi bình luận thành công! (Inbox message lỗi)', 'success');
            } else if (replyInboxSuccess) {
                window.notificationManager.show('✅ Đã gửi tin nhắn inbox thành công! (Comment reply lỗi)', 'success');
            }
        }

        console.log('[COMMENT] ✅ Sent successfully (private_replies:', privateRepliesSuccess, ', reply_inbox:', replyInboxSuccess, ')');

    } catch (error) {
        console.error('[COMMENT] ❌ Error:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi khi gửi bình luận: ' + error.message, 'error');
        } else {
            alert('❌ Lỗi khi gửi bình luận: ' + error.message);
        }
        throw error;
    }
}

/**
 * Handle click on "Trả lời" button in comment list
 * @param {string} commentId - ID of the comment being replied to
 * @param {string} postId - Post ID of the comment
 */
function handleReplyToComment(commentId, postId) {
    console.log(`[CHAT] Replying to comment: ${commentId}, post: ${postId}`);

    // Set current parent comment ID
    // Look up the comment in allChatComments to get the full object
    const comment = window.allChatComments.find(c => c.Id === commentId);

    if (comment) {
        // Use helper to get the correct ID (FacebookId, OriginalId, etc.)
        currentParentCommentId = getFacebookCommentId(comment);
        console.log(`[CHAT] Selected parent comment ID: ${currentParentCommentId} (from ${comment.Id})`);
    } else {
        // Fallback if comment not found in local list (shouldn't happen often)
        currentParentCommentId = commentId;
        console.warn(`[CHAT] Could not find comment object for ${commentId}, using raw ID`);
    }

    // Set current post ID (if available)
    if (postId && postId !== 'undefined' && postId !== 'null') {
        currentPostId = postId;
    } else {
        currentPostId = null;
    }

    // Show reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    const previewText = document.getElementById('chatReplyPreviewText');

    if (previewContainer && previewText && comment) {
        // Extract comment text (handle both text and HTML)
        let commentText = comment.Message || comment.message || comment.text || '';

        // If HTML, extract text content
        if (commentText.includes('<')) {
            const div = document.createElement('div');
            div.innerHTML = commentText;
            commentText = div.textContent || div.innerText || '';
        }

        // Get sender name and Facebook ID
        const senderName = comment.FromName || comment.from?.name || 'Khách hàng';
        const fbId = comment.From?.id || comment.from?.id || comment.FromId || null;

        // Get timestamp (use CreatedTime or updated_at)
        const timestamp = comment.CreatedTime || comment.updated_at || comment.created_at;
        let timeStr = '';
        if (timestamp) {
            const date = new Date(timestamp);
            // Format: DD/MM/YYYY HH:mm
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            timeStr = `${day}/${month}/${year} ${hours}:${minutes}`;
        }

        // Verify fb_id matches current conversation's customer (if available)
        if (fbId && window.currentChatPSID && fbId !== window.currentChatPSID) {
            console.warn('[REPLY] ⚠️ Facebook ID mismatch!', {
                commentFbId: fbId,
                conversationPSID: window.currentChatPSID
            });
        }

        // Show preview with sender name and truncated message
        const maxLength = 100;
        const truncatedText = commentText.length > maxLength
            ? commentText.substring(0, maxLength) + '...'
            : commentText;

        // Display with timestamp
        previewText.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
                <div style="flex: 1; min-width: 0;">
                    <strong>${senderName}:</strong> ${truncatedText}
                </div>
                ${timeStr ? `<div style="color: #6b7280; font-size: 12px; white-space: nowrap; flex-shrink: 0;">${timeStr}</div>` : ''}
            </div>
        `;
        previewContainer.style.display = 'block';

        console.log('[REPLY] Showing preview for comment:', senderName, 'fb_id:', fbId, truncatedText, 'at', timeStr);
    }

    // Focus input and enable it for replying
    const input = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (input) {
        // Enable input and send button
        input.disabled = false;
        input.style.cursor = 'text';
        input.style.background = '#f9fafb';
        input.focus();
        input.placeholder = `Nhập nội dung trả lời...`;

        // Enable send button
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';
        }

        // Add visual feedback (optional)
        input.style.borderColor = '#3b82f6';
        setTimeout(() => {
            input.style.borderColor = '#d1d5db';
        }, 1000);
    }
}

function renderChatMessages(messages, scrollToBottom = false) {
    const modalBody = document.getElementById('chatModalBody');

    if (!messages || messages.length === 0) {
        modalBody.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <p>Chưa có tin nhắn</p>
            </div>`;
        return;
    }

    // Format time helper - use global formatTimeVN
    const formatTime = window.formatTimeVN;

    // Sort messages by timestamp - oldest first (newest at bottom like Messenger/Zalo)
    const sortedMessages = messages.slice().sort((a, b) => {
        const timeA = new Date(a.inserted_at || a.CreatedTime || 0).getTime();
        const timeB = new Date(b.inserted_at || b.CreatedTime || 0).getTime();
        return timeA - timeB; // Ascending: oldest first, newest last (at bottom)
    });

    // Initialize map to store messages by ID for reply functionality
    if (!window.chatMessagesById) {
        window.chatMessagesById = {};
    }

    const messagesHTML = sortedMessages.map(msg => {
        // Store message in map for reply button lookup
        const msgId = msg.id || msg.Id || null;
        if (msgId) {
            window.chatMessagesById[msgId] = msg;
        }
        // Determine isOwner by comparing from.id with page_id (Pancake API format)
        const pageId = window.currentChatChannelId || msg.page_id || null;
        const fromId = msg.from?.id || msg.FromId || null;
        const isOwner = msg.IsOwner !== undefined ? msg.IsOwner : (fromId === pageId);
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

        // Get avatar URL - prioritize direct URL from Pancake API
        const cachedToken = window.pancakeTokenManager?.token || null;
        // Check for direct avatar URL from Pancake (avatar, picture, profile_picture fields)
        const directAvatar = msg.from?.avatar || msg.from?.picture || msg.from?.profile_picture || msg.avatar || null;
        const avatarUrl = window.pancakeDataManager?.getAvatarUrl(fromId, pageId, cachedToken, directAvatar) ||
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
        const senderName = msg.from?.name || msg.FromName || '';
        // Admin name for page messages (Pancake API returns from.admin_name for staff-sent messages)
        const adminName = msg.from?.admin_name || null;

        // Get message text - prioritize original_message (plain text from Pancake API)
        let messageText = msg.original_message || msg.message || msg.Message || '';

        // If message is HTML (from Pancake's "message" field), strip HTML tags
        if (messageText && messageText.includes('<div>')) {
            messageText = messageText.replace(/<[^>]*>/g, '').trim();
        }

        let content = '';
        if (messageText) {
            // Escape HTML to prevent XSS and display issues
            let escapedMessage = messageText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>')
                .replace(/\r/g, '');

            // Convert URLs to clickable links
            const urlRegex = /(https?:\/\/[^\s<]+)/g;
            escapedMessage = escapedMessage.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">$1</a>');

            content = `<p class="chat-message-text">${escapedMessage}</p>`;
        }

        // Handle attachments (images and audio)
        if (msg.Attachments && msg.Attachments.length > 0) {
            msg.Attachments.forEach(att => {
                if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                    content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.Payload.Url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
            });
        }

        // Handle Pancake API format attachments (lowercase 'attachments')
        if (msg.attachments && msg.attachments.length > 0) {
            msg.attachments.forEach(att => {
                // Audio: mime_type = "audio/mp4", file_url
                if (att.mime_type === 'audio/mp4' && att.file_url) {
                    content += `
                        <div class="chat-audio-message" style="display: flex; align-items: center; background: #f3f4f6; padding: 10px 14px; border-radius: 20px; margin-top: 8px;">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 10px; font-size: 16px;"></i>
                            <audio controls style="height: 36px; flex: 1;">
                                <source src="${att.file_url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
                // Photo: type = "photo", url
                else if (att.type === 'photo' && att.url) {
                    content += `<img src="${att.url}" class="chat-message-image" loading="lazy" style="max-width: 100%; border-radius: 8px; margin-top: 8px; cursor: pointer;" onclick="window.open('${att.url}', '_blank')" />`;
                }
                // Image with mime_type
                else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                    content += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" style="max-width: 100%; border-radius: 8px; margin-top: 8px; cursor: pointer;" onclick="window.open('${att.file_url}', '_blank')" />`;
                }
                // Link attachment with comment (private reply preview from Pancake)
                else if (att.type === 'link' && att.comment) {
                    const commentFrom = att.comment.from || '';
                    const commentContent = att.comment.content || '';
                    const postName = att.name || '';
                    const postUrl = att.url || '#';
                    // Show post thumbnail if available
                    const thumbnail = att.post_attachments?.[0]?.url || '';
                    content += `
                        <div class="chat-link-attachment" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-top: 8px; overflow: hidden;">
                            ${thumbnail ? `<img src="${thumbnail}" style="width: 100%; max-height: 120px; object-fit: cover; border-bottom: 1px solid #e2e8f0;" loading="lazy" />` : ''}
                            <div style="padding: 10px 12px;">
                                <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0;"><i class="fas fa-comment" style="margin-right: 6px;"></i>Bình luận từ ${commentFrom}</p>
                                <p style="font-size: 13px; color: #1e293b; margin: 0 0 6px 0; font-weight: 500;">"${commentContent}"</p>
                                <a href="${postUrl}" target="_blank" style="font-size: 11px; color: #3b82f6; text-decoration: none; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <i class="fas fa-external-link-alt" style="margin-right: 4px;"></i>${postName || 'Xem bài viết'}
                                </a>
                            </div>
                        </div>`;
                }
                // Video attachment
                else if ((att.type === 'video_inline' || att.type === 'video_direct_response' || att.type === 'video') && att.url) {
                    content += `
                        <div class="chat-video-attachment" style="margin-top: 8px;">
                            <img src="${att.url}" style="max-width: 100%; border-radius: 8px; cursor: pointer;" onclick="window.open('${att.url}', '_blank')" loading="lazy" />
                        </div>`;
                }
            });
        }

        // Reply button for customer messages
        const messageId = msg.id || msg.Id || null;
        const replyButton = !isOwner && messageId ? `
            <span class="message-reply-btn"
                  onclick="window.setReplyMessageById('${messageId}')"
                  style="cursor: pointer; color: #3b82f6; margin-left: 8px; font-weight: 500;">
                Trả lời
            </span>
        ` : '';

        // Avatar HTML - only show for customer messages (not owner)
        const avatarHTML = !isOwner ? `
            <img src="${avatarUrl}"
                 alt="${senderName}"
                 title="Click để phóng to - ${senderName}"
                 class="avatar-loading chat-avatar-clickable"
                 style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0; margin-right: 12px; border: 2px solid #e5e7eb; background: #f3f4f6; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;"
                 onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)'"
                 onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
                 onclick="openAvatarZoom('${avatarUrl}', '${senderName.replace(/'/g, "\\'")}'); event.stopPropagation();"
                 onload="this.classList.remove('avatar-loading')"
                 onerror="this.classList.remove('avatar-loading'); this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><circle cx=%2224%22 cy=%2224%22 r=%2224%22 fill=%22%23e5e7eb%22/><circle cx=%2224%22 cy=%2218%22 r=%228%22 fill=%22%239ca3af%22/><ellipse cx=%2224%22 cy=%2238%22 rx=%2213%22 ry=%2210%22 fill=%22%239ca3af%22/></svg>'"
            />
        ` : '';

        return `
            <div class="chat-message ${alignClass}" style="display: flex; align-items: flex-start;">
                ${!isOwner ? avatarHTML : ''}
                <div style="flex: 1; ${isOwner ? 'display: flex; justify-content: flex-end;' : ''}">
                    <div class="chat-bubble ${bgClass}">
                        ${!isOwner && senderName ? `<p style="font-size: 11px; font-weight: 600; color: #6b7280; margin: 0 0 4px 0;">${senderName}</p>` : ''}
                        ${isOwner && adminName ? `<p style="font-size: 10px; font-weight: 500; color: #9ca3af; margin: 0 0 4px 0; text-align: right;"><i class="fas fa-user-tie" style="margin-right: 4px; font-size: 9px;"></i>${adminName}</p>` : ''}
                        ${content}
                        <p class="chat-message-time">
                            ${formatTime(msg.inserted_at || msg.CreatedTime)}
                            ${replyButton}
                        </p>
                    </div>
                </div>
            </div>`;
    }).join('');

    // Add loading indicator at top based on pagination state
    let loadingIndicator = '';
    if (currentChatCursor) {
        // Still have more messages to load
        loadingIndicator = `
            <div id="chatLoadMoreIndicator" style="
                text-align: center;
                padding: 16px 12px;
                color: #6b7280;
                font-size: 13px;
                background: linear-gradient(to bottom, #f9fafb 0%, transparent 100%);
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-arrow-up" style="margin-right: 6px; color: #3b82f6;"></i>
                <span style="font-weight: 500;">Cuộn lên để tải thêm tin nhắn</span>
            </div>`;
    } else if (window.allChatMessages.length > 0 && !currentChatCursor) {
        // No more messages (reached the beginning)
        loadingIndicator = `
            <div style="
                text-align: center;
                padding: 16px 12px;
                color: #9ca3af;
                font-size: 12px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-check-circle" style="margin-right: 6px; color: #10b981;"></i>
                Đã tải hết tin nhắn cũ
            </div>`;
    }

    // Check if user is at bottom before render (within 100px threshold)
    // CHANGED: Check scrollToBottom parameter OR current position
    const wasAtBottom = scrollToBottom || (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
    const previousScrollHeight = modalBody.scrollHeight;
    const previousScrollTop = modalBody.scrollTop;

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${messagesHTML}</div>`;

    // Only auto-scroll if explicitly requested OR user was already at bottom
    if (wasAtBottom) {
        // Use requestAnimationFrame to ensure DOM has updated before scrolling
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modalBody.scrollTop = modalBody.scrollHeight;
                // Hide new message indicator when scrolled to bottom
                const indicator = document.getElementById('chatNewMessageIndicator');
                if (indicator) indicator.style.display = 'none';
            });
        });
    } else {
        // Preserve scroll position (adjust for new content added at top)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newScrollHeight = modalBody.scrollHeight;
                const heightDiff = newScrollHeight - previousScrollHeight;
                modalBody.scrollTop = previousScrollTop + heightDiff;

                // Show new message indicator if there's new content at bottom
                if (heightDiff > 0) {
                    showNewMessageIndicator();
                }
            });
        });
    }
}

function renderComments(comments, scrollToBottom = false) {
    const modalBody = document.getElementById('chatModalBody');

    if (!comments || comments.length === 0) {
        modalBody.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <p>Chưa có bình luận</p>
            </div>`;
        return;
    }

    // Format time helper - use global formatTimeVN
    const formatTime = window.formatTimeVN;

    // Sort comments by timestamp - oldest first (newest at bottom like Messenger/Zalo)
    const sortedComments = comments.slice().sort((a, b) => {
        const timeA = new Date(a.CreatedTime || a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.CreatedTime || b.updated_at || b.created_at || 0).getTime();
        return timeA - timeB; // Ascending: oldest first, newest last (at bottom)
    });

    // Helper function to check if comment is the purchase comment
    const isPurchaseComment = (comment) => {
        if (!window.purchaseCommentId) return false;

        // Get comment ID (handle different formats)
        const commentId = comment.FacebookId || comment.OriginalId || comment.Id || comment.id;

        // Facebook_CommentId format: "postId_commentId" (e.g., "1672237127083024_2168976250601862")
        // Extract just the comment ID part for comparison
        const purchaseIdParts = window.purchaseCommentId.split('_');
        const purchaseCommentOnlyId = purchaseIdParts.length > 1 ? purchaseIdParts[purchaseIdParts.length - 1] : window.purchaseCommentId;

        // Check if this comment matches the purchase comment
        if (commentId === window.purchaseCommentId) return true;
        if (commentId === purchaseCommentOnlyId) return true;

        // Also check if commentId contains the purchase comment ID
        if (commentId && commentId.includes(purchaseCommentOnlyId)) return true;

        // Check full format match (postId_commentId)
        const fullCommentId = `${comment.PostId || ''}_${commentId}`;
        if (fullCommentId === window.purchaseCommentId) return true;

        return false;
    };

    const commentsHTML = sortedComments.map(comment => {
        const isOwner = comment.IsOwner;
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

        // Check if this is the purchase comment (comment where user made the order)
        const isPurchase = isPurchaseComment(comment);
        const purchaseHighlightClass = isPurchase ? 'purchase-comment-highlight' : '';
        const purchaseBadge = isPurchase ? '<span class="purchase-badge"><i class="fas fa-shopping-cart"></i> Bình luận đặt hàng</span>' : '';

        let content = '';
        if (comment.Message) {
            content = `<p class="chat-message-text">${comment.Message}</p>`;
        }

        // Handle attachments (images and audio) for comments
        if (comment.Attachments && comment.Attachments.length > 0) {
            comment.Attachments.forEach(att => {
                if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                    content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.Payload.Url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
            });
        }

        // Handle Pancake API format attachments for comments
        if (comment.attachments && comment.attachments.length > 0) {
            comment.attachments.forEach(att => {
                if (att.mime_type === 'audio/mp4' && att.file_url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.file_url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                    content += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" />`;
                }
            });
        }

        // Status badge for unread comments
        const statusBadge = comment.Status === 30
            ? '<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">Mới</span>'
            : '';

        // Render nested replies if any
        let repliesHTML = '';
        if (comment.Messages && comment.Messages.length > 0) {
            repliesHTML = comment.Messages.map(reply => {
                const replyIsOwner = reply.IsOwner;
                const replyAlignClass = replyIsOwner ? 'chat-message-right' : 'chat-message-left';
                const replyBgClass = replyIsOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

                let replyContent = '';
                if (reply.Message) {
                    replyContent = `<p class="chat-message-text">${reply.Message}</p>`;
                }

                // Handle attachments in replies
                if (reply.Attachments && reply.Attachments.length > 0) {
                    reply.Attachments.forEach(att => {
                        if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                            replyContent += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                        } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                            replyContent += `
                                <div class="chat-audio-message">
                                    <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                                    <audio controls style="max-width: 100%; height: 32px;">
                                        <source src="${att.Payload.Url}" type="audio/mp4">
                                        Trình duyệt không hỗ trợ phát audio
                                    </audio>
                                </div>`;
                        }
                    });
                }

                // Handle Pancake API format in replies
                if (reply.attachments && reply.attachments.length > 0) {
                    reply.attachments.forEach(att => {
                        if (att.mime_type === 'audio/mp4' && att.file_url) {
                            replyContent += `
                                <div class="chat-audio-message">
                                    <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                                    <audio controls style="max-width: 100%; height: 32px;">
                                        <source src="${att.file_url}" type="audio/mp4">
                                        Trình duyệt không hỗ trợ phát audio
                                    </audio>
                                </div>`;
                        } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                            replyContent += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" />`;
                        }
                    });
                }

                return `
                    <div class="chat-message ${replyAlignClass}" style="margin-left: 24px; margin-top: 8px;">
                        <div class="chat-bubble ${replyBgClass}" style="font-size: 13px;">
                            ${replyContent}
                            <p class="chat-message-time">${formatTime(reply.CreatedTime)}</p>
                        </div>
                    </div>`;
            }).join('');
        }

        return `
            <div class="chat-message ${alignClass} ${purchaseHighlightClass}" data-comment-id="${comment.Id || comment.id || ''}">
                ${purchaseBadge}
                <div class="chat-bubble ${bgClass}">
                    ${content}
                    <p class="chat-message-time">
                        ${formatTime(comment.CreatedTime)} ${statusBadge}
                        ${!isOwner ? `<span class="reply-btn" onclick="handleReplyToComment('${comment.Id}', '${comment.PostId || ''}')" style="cursor: pointer; color: #3b82f6; margin-left: 8px; font-weight: 500;">Trả lời</span>` : ''}
                    </p>
                </div>
            </div>
            ${repliesHTML}`;
    }).join('');

    // Add loading indicator at top based on pagination state
    let loadingIndicator = '';
    if (currentChatCursor) {
        // Still have more comments to load
        loadingIndicator = `
            <div id="chatLoadMoreIndicator" style="
                text-align: center;
                padding: 16px 12px;
                color: #6b7280;
                font-size: 13px;
                background: linear-gradient(to bottom, #f9fafb 0%, transparent 100%);
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-arrow-up" style="margin-right: 6px; color: #3b82f6;"></i>
                <span style="font-weight: 500;">Cuộn lên để tải thêm bình luận</span>
            </div>`;
    } else if (window.allChatComments.length > 0 && !currentChatCursor) {
        // No more comments (reached the beginning)
        loadingIndicator = `
            <div style="
                text-align: center;
                padding: 16px 12px;
                color: #9ca3af;
                font-size: 12px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-check-circle" style="margin-right: 6px; color: #10b981;"></i>
                Đã tải hết bình luận cũ
            </div>`;
    }

    // Add post/video context at the top if available
    let postContext = '';
    if (comments[0] && comments[0].Object) {
        const obj = comments[0].Object;
        postContext = `
            <div style="
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 16px;
            ">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
                    <i class="fas fa-video"></i> ${obj.ObjectType === 1 ? 'Video' : 'Bài viết'} Live
                </div>
                <div style="font-size: 13px; font-weight: 500; color: #1f2937;">
                    ${obj.Description || obj.Title || 'Không có mô tả'}
                </div>
            </div>`;
    }

    // Check if user is at bottom before render (within 100px threshold)
    // CHANGED: Check scrollToBottom parameter OR current position
    const wasAtBottom = scrollToBottom || (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
    const previousScrollHeight = modalBody.scrollHeight;
    const previousScrollTop = modalBody.scrollTop;

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${postContext}${commentsHTML}</div>`;

    // Check if there's a purchase comment to scroll to (only on initial load)
    const purchaseCommentElement = modalBody.querySelector('.purchase-comment-highlight');

    // Only auto-scroll if explicitly requested OR user was already at bottom
    if (wasAtBottom) {
        // Use requestAnimationFrame to ensure DOM has updated before scrolling
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Priority: scroll to purchase comment if exists, otherwise scroll to bottom
                if (purchaseCommentElement && scrollToBottom) {
                    // Scroll to purchase comment with smooth behavior
                    purchaseCommentElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                    console.log('[CHAT] Scrolled to purchase comment');
                } else {
                    modalBody.scrollTop = modalBody.scrollHeight;
                }
                // Hide new message indicator when scrolled to bottom
                const indicator = document.getElementById('chatNewMessageIndicator');
                if (indicator) indicator.style.display = 'none';
            });
        });
    } else {
        // Preserve scroll position (adjust for new content added at top)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newScrollHeight = modalBody.scrollHeight;
                const heightDiff = newScrollHeight - previousScrollHeight;
                modalBody.scrollTop = previousScrollTop + heightDiff;

                // Show new message indicator if there's new content at bottom
                if (heightDiff > 0) {
                    showNewMessageIndicator();
                }
            });
        });
    }
}

// =====================================================
// NEW MESSAGE INDICATOR
// =====================================================

/**
 * Show visual indicator for new messages (without flash animation)
 */
function showNewMessageIndicator() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Check if indicator already exists
    let indicator = document.getElementById('chatNewMessageIndicator');

    if (!indicator) {
        // Create indicator element
        indicator = document.createElement('div');
        indicator.id = 'chatNewMessageIndicator';
        indicator.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 20px;
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: white;
                border-radius: 24px;
                font-size: 13px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(59, 130, 246, 0.5)';"
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.4)';">
                <i class="fas fa-arrow-down" style="font-size: 12px;"></i>
                <span>Tin nhắn mới</span>
            </div>
        `;

        // Position indicator at bottom center
        indicator.style.cssText = `
            position: absolute;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10;
            display: none;
        `;

        // Scroll to bottom when clicked
        indicator.onclick = () => {
            modalBody.scrollTo({
                top: modalBody.scrollHeight,
                behavior: 'smooth'
            });
            indicator.style.display = 'none';
        };

        // Append to modal body's parent to position it correctly
        const chatModal = document.getElementById('chatModal');
        const modalContent = chatModal?.querySelector('.modal-body');
        if (modalContent) {
            modalContent.style.position = 'relative';
            modalContent.appendChild(indicator);
        }
    }

    // Show indicator with smooth appearance (no flash)
    indicator.style.display = 'block';
}

/**
 * Setup scroll listener to auto-hide indicator when user scrolls to bottom
 */
function setupNewMessageIndicatorListener() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    modalBody.addEventListener('scroll', () => {
        const isAtBottom = (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
        const indicator = document.getElementById('chatNewMessageIndicator');

        if (indicator && isAtBottom) {
            indicator.style.display = 'none';
        }
    });
}

// =====================================================
// INFINITE SCROLL FOR MESSAGES & COMMENTS
// =====================================================

function setupChatInfiniteScroll() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Remove existing listener to avoid duplicates
    modalBody.removeEventListener('scroll', handleChatScroll);

    // Add scroll listener
    modalBody.addEventListener('scroll', handleChatScroll);
}

async function handleChatScroll(event) {
    const modalBody = event.target;

    // Check if scrolled to top (or near top)
    const isNearTop = modalBody.scrollTop < 100;

    // Only load more if:
    // 1. Near the top of the scroll
    // 2. Not already loading
    // 3. Have a cursor for more data
    if (isNearTop && !isLoadingMoreMessages && currentChatCursor) {
        if (currentChatType === 'message') {
            await loadMoreMessages();
        } else if (currentChatType === 'comment') {
            await loadMoreComments();
        }
    }
}

async function loadMoreMessages() {
    if (!window.currentChatChannelId || !window.currentChatPSID || !currentChatCursor) {
        return;
    }

    isLoadingMoreMessages = true;

    try {
        const modalBody = document.getElementById('chatModalBody');
        const loadMoreIndicator = document.getElementById('chatLoadMoreIndicator');

        // Show loading state with better visual feedback
        if (loadMoreIndicator) {
            loadMoreIndicator.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px; color: #3b82f6;"></i>
                <span style="font-weight: 500; color: #3b82f6;">Đang tải thêm tin nhắn...</span>
            `;
            loadMoreIndicator.style.background = 'linear-gradient(to bottom, #eff6ff 0%, transparent 100%)';
        }

        console.log(`[CHAT] Loading more messages with cursor: ${currentChatCursor}`);

        // Fetch more messages using the cursor
        const response = await window.chatDataManager.fetchMessages(
            window.currentChatChannelId,
            window.currentChatPSID,
            currentChatCursor
        );

        // Get scroll height before updating
        const scrollHeightBefore = modalBody.scrollHeight;
        const scrollTopBefore = modalBody.scrollTop;

        // Append older messages to the beginning of the array
        const newMessages = response.messages || [];
        if (newMessages.length > 0) {
            window.allChatMessages = [...window.allChatMessages, ...newMessages];
            console.log(`[CHAT] ✅ Loaded ${newMessages.length} more messages. Total: ${window.allChatMessages.length}`);
        } else {
            console.log(`[CHAT] ⚠️ No new messages loaded. Reached end or empty batch.`);
        }

        // Update cursor for next page (null = no more messages)
        currentChatCursor = response.after;
        if (currentChatCursor) {
            console.log(`[CHAT] 📄 Next cursor available: ${currentChatCursor.substring(0, 20)}...`);
        } else {
            console.log(`[CHAT] 🏁 No more messages. Reached the beginning of conversation.`);
        }

        // Re-render with all messages, don't scroll to bottom
        renderChatMessages(window.allChatMessages, false);

        // Restore scroll position (adjust for new content height)
        setTimeout(() => {
            const scrollHeightAfter = modalBody.scrollHeight;
            const heightDifference = scrollHeightAfter - scrollHeightBefore;
            modalBody.scrollTop = scrollTopBefore + heightDifference;
        }, 50);

    } catch (error) {
        console.error('[CHAT] Error loading more messages:', error);
    } finally {
        isLoadingMoreMessages = false;
    }
}

async function loadMoreComments() {
    if (!window.currentChatChannelId || !window.currentChatPSID || !currentChatCursor) {
        return;
    }

    isLoadingMoreMessages = true;

    try {
        const modalBody = document.getElementById('chatModalBody');
        const loadMoreIndicator = document.getElementById('chatLoadMoreIndicator');

        // Show loading state with better visual feedback
        if (loadMoreIndicator) {
            loadMoreIndicator.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px; color: #3b82f6;"></i>
                <span style="font-weight: 500; color: #3b82f6;">Đang tải thêm bình luận...</span>
            `;
            loadMoreIndicator.style.background = 'linear-gradient(to bottom, #eff6ff 0%, transparent 100%)';
        }

        console.log(`[CHAT] Loading more comments with cursor: ${currentChatCursor}`);

        // Fetch more comments using the cursor
        const response = await window.chatDataManager.fetchComments(
            window.currentChatChannelId,
            window.currentChatPSID,
            currentChatCursor
        );

        // Get scroll height before updating
        const scrollHeightBefore = modalBody.scrollHeight;
        const scrollTopBefore = modalBody.scrollTop;

        // Append older comments to the beginning of the array
        const newComments = response.comments || [];
        if (newComments.length > 0) {
            window.allChatComments = [...window.allChatComments, ...newComments];
            console.log(`[CHAT] ✅ Loaded ${newComments.length} more comments. Total: ${window.allChatComments.length}`);
        } else {
            console.log(`[CHAT] ⚠️ No new comments loaded. Reached end or empty batch.`);
        }

        // Update cursor for next page (null = no more comments)
        currentChatCursor = response.after;
        if (currentChatCursor) {
            console.log(`[CHAT] 📄 Next cursor available: ${currentChatCursor.substring(0, 20)}...`);
        } else {
            console.log(`[CHAT] 🏁 No more comments. Reached the beginning.`);
        }

        // Re-render with all comments, don't scroll to bottom
        renderComments(window.allChatComments, false);

        // Restore scroll position (adjust for new content height)
        setTimeout(() => {
            const scrollHeightAfter = modalBody.scrollHeight;
            const heightDifference = scrollHeightAfter - scrollHeightBefore;
            modalBody.scrollTop = scrollTopBefore + heightDifference;
        }, 50);

    } catch (error) {
        console.error('[CHAT] Error loading more comments:', error);
    } finally {
        isLoadingMoreMessages = false;
    }
}

window.markChatAsRead = async function () {
    if (!window.currentChatChannelId || !window.currentChatPSID) return;

    try {
        const markReadBtn = document.getElementById('chatMarkReadBtn');
        markReadBtn.disabled = true;
        markReadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

        await window.chatDataManager.markAsSeen(window.currentChatChannelId, window.currentChatPSID);

        // Hide button
        markReadBtn.style.display = 'none';
        markReadBtn.disabled = false;
        markReadBtn.innerHTML = '<i class="fas fa-check"></i> Đánh dấu đã đọc';

        // Re-render table to update UI
        renderTable();

        if (window.notificationManager) {
            window.notificationManager.success('Đã đánh dấu tin nhắn là đã đọc', 2000);
        }
    } catch (error) {
        console.error('[CHAT] Error marking as read:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi khi đánh dấu đã đọc: ' + error.message, 3000);
        }
    }
}

// =====================================================
// PRODUCT ENCODING/DECODING UTILITIES (for Note verification)
// =====================================================
const ENCODE_KEY = 'live';
const BASE_TIME = 1704067200000; // 2024-01-01 00:00:00 UTC

/**
 * Base64URL decode
 * @param {string} str - Base64URL encoded string
 * @returns {string} Decoded string
 */
function base64UrlDecode(str) {
    const padding = '='.repeat((4 - str.length % 4) % 4);
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
    const binary = atob(base64);
    return new TextDecoder().decode(
        Uint8Array.from(binary, c => c.charCodeAt(0))
    );
}

/**
 * Generate short checksum (6 characters)
 * @param {string} str - String to checksum
 * @returns {string} Checksum in base36 (6 chars)
 */
function shortChecksum(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 6);
}

/**
 * XOR decryption with key
 * @param {string} encoded - Base64 encoded encrypted text
 * @param {string} key - Decryption key
 * @returns {string} Decrypted text
 */
function xorDecrypt(encoded, key) {
    // Decode from base64
    const encrypted = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const keyBytes = new TextEncoder().encode(key);
    const decrypted = new Uint8Array(encrypted.length);

    for (let i = 0; i < encrypted.length; i++) {
        decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
    }

    return new TextDecoder().decode(decrypted);
}

/**
 * Decode product line - supports both old and new formats
 * NEW FORMAT: Base64URL, comma separator, orderId, checksum
 * OLD FORMAT: Base64, pipe separator, no orderId
 * @param {string} encoded - Encoded string
 * @param {number} expectedOrderId - Expected order ID (for verification in new format)
 * @returns {object|null} { orderId?, productCode, quantity, price, timestamp } or null if invalid
 */
function decodeProductLine(encoded, expectedOrderId = null) {
    try {
        // Detect format by checking for Base64URL characters
        const isNewFormat = encoded.includes('-') || encoded.includes('_') || (!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='));

        if (isNewFormat) {
            // ===== NEW FORMAT: Base64URL + orderId + checksum =====
            try {
                // Base64URL decode
                const decrypted = base64UrlDecode(encoded);

                // XOR decrypt
                const fullData = xorDecrypt(decrypted, ENCODE_KEY);

                // Parse
                const parts = fullData.split(',');
                if (parts.length !== 6) {
                    // Not new format, fallback to old format
                    throw new Error('Not new format');
                }

                const [orderId, productCode, quantity, price, relativeTime, checksum] = parts;

                // Verify checksum
                const data = `${orderId},${productCode},${quantity},${price},${relativeTime}`;
                if (checksum !== shortChecksum(data)) {
                    console.debug('[DECODE] Checksum mismatch - data may be corrupted');
                    return null;
                }

                // Verify order ID if provided
                if (expectedOrderId !== null && orderId !== expectedOrderId.toString()) {
                    console.debug(`[DECODE] OrderId mismatch: encoded=${orderId}, expected=${expectedOrderId}`);
                    return null;
                }

                // Convert relative timestamp back to absolute
                const timestamp = parseInt(relativeTime) * 1000 + BASE_TIME;

                return {
                    orderId: parseInt(orderId),
                    productCode,
                    quantity: parseInt(quantity),
                    price: parseFloat(price),
                    timestamp
                };
            } catch (newFormatError) {
                // Fallback to old format
                console.debug('[DECODE] New format decode failed, trying old format...');
            }
        }

        // ===== OLD FORMAT: Base64 + pipe separator =====
        const decoded = xorDecrypt(encoded, ENCODE_KEY);
        const parts = decoded.split('|');

        // Support both old format (3 parts) and old format with timestamp (4 parts)
        if (parts.length !== 3 && parts.length !== 4) return null;

        const result = {
            productCode: parts[0],
            quantity: parseInt(parts[1]),
            price: parseFloat(parts[2])
        };

        // Add timestamp if present
        if (parts.length === 4) {
            result.timestamp = parseInt(parts[3]);
        }

        return result;
    } catch (error) {
        console.debug('[DECODE] Decode error:', error);
        return null;
    }
}

// =====================================================
// NOTE EDITED DETECTION VIA FIREBASE SNAPSHOT
// =====================================================

/**
 * Load all note snapshots from Firebase
 * @returns {Promise<Object>} - Map of orderId -> snapshot data
 */
async function loadNoteSnapshots() {
    if (!database) {
        console.warn('[NOTE-TRACKER] Firebase not initialized');
        return {};
    }

    try {
        console.log('[NOTE-TRACKER] Loading note snapshots from Firebase...');
        const snapshot = await database.ref('order_notes_snapshot').once('value');
        const data = snapshot.val() || {};

        // Clean up expired snapshots (older than 30 days)
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        const cleanedData = {};
        let expiredCount = 0;

        Object.keys(data).forEach(orderId => {
            const snapshot = data[orderId];
            if (snapshot.timestamp && snapshot.timestamp > thirtyDaysAgo) {
                cleanedData[orderId] = snapshot;
            } else {
                expiredCount++;
                // Delete expired snapshot
                database.ref(`order_notes_snapshot/${orderId}`).remove();
            }
        });

        console.log(`[NOTE-TRACKER] Loaded ${Object.keys(cleanedData).length} snapshots, cleaned ${expiredCount} expired`);
        return cleanedData;
    } catch (error) {
        console.error('[NOTE-TRACKER] Error loading snapshots:', error);
        return {};
    }
}

/**
 * Check if note contains VALID encoded products (belongs to this order)
 * Verifies orderId to prevent cross-order copy attacks
 * @param {string} note - Order note
 * @param {number} expectedOrderId - Order ID to verify against
 * @returns {boolean} - True if has valid encoded products belonging to this order
 */
function hasValidEncodedProducts(note, expectedOrderId) {
    if (!note || !note.trim()) return false;

    const lines = note.split('\n');
    let foundValid = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // Quick pattern check (NEW format: Base64URL - compact, no padding)
        const isNewFormat = /^[A-Za-z0-9_-]{40,65}$/.test(trimmed);

        // Quick pattern check (OLD format: Base64 with padding)
        const isOldFormat = /^[A-Za-z0-9+/]{50,80}={0,2}$/.test(trimmed);

        if (!isNewFormat && !isOldFormat) {
            continue; // Not an encoded line
        }

        try {
            // ===== NEW FORMAT: Has orderId → Verify! =====
            if (isNewFormat) {
                // Decode with expectedOrderId to verify
                const decoded = decodeProductLine(trimmed, expectedOrderId);

                if (decoded && decoded.orderId === expectedOrderId) {
                    // ✅ Valid encoded product for THIS order
                    foundValid = true;
                    console.log(`[NOTE-TRACKER] ✅ Valid encoded line for order #${expectedOrderId}`);
                } else {
                    // ⚠️ Encoded line from ANOTHER order (copy attack) or decode failed
                    // Try decode without verification to see original orderId
                    const decodedNoCheck = decodeProductLine(trimmed, null);
                    if (decodedNoCheck && decodedNoCheck.orderId) {
                        console.warn(
                            `[NOTE-TRACKER] ⚠️ Order #${expectedOrderId} contains COPIED encoded line from Order #${decodedNoCheck.orderId} - REJECTED`
                        );
                    } else {
                        console.warn(
                            `[NOTE-TRACKER] ⚠️ Order #${expectedOrderId} has invalid encoded line (checksum fail or corrupted)`
                        );
                    }
                }
            }

            // ===== OLD FORMAT: No orderId → Accept for backward compatibility =====
            else if (isOldFormat) {
                const decoded = decodeProductLine(trimmed);
                if (decoded && decoded.productCode) {
                    // Old format doesn't have orderId to verify
                    // Accept as valid (backward compatibility)
                    foundValid = true;
                    console.log(`[NOTE-TRACKER] ℹ️ Found old format encoded line (no orderId verification available)`);
                }
            }

        } catch (e) {
            // Decode failed, not a valid encoded line
            console.debug(`[NOTE-TRACKER] Failed to decode line: ${trimmed.substring(0, 20)}...`);
            continue;
        }
    }

    return foundValid;
}

/**
 * Compare current notes with snapshots and detect edits
 * @param {Array} orders - Array of order objects
 * @param {Object} snapshots - Map of orderId -> snapshot
 * @returns {Promise<void>}
 */
async function compareAndUpdateNoteStatus(orders, snapshots) {
    if (!orders || orders.length === 0) return;

    console.log('[NOTE-TRACKER] Comparing notes with snapshots...');

    let editedCount = 0;
    let newSnapshotsToSave = {};

    orders.forEach(order => {
        const orderId = order.Id;
        const currentNote = (order.Note || '').trim();
        const snapshot = snapshots[orderId];

        if (snapshot) {
            // Compare with existing snapshot
            const savedNote = (snapshot.note || '').trim();

            if (currentNote !== savedNote) {
                // Note has been edited!
                order.noteEdited = true;
                editedCount++;
                console.log(`[NOTE-TRACKER] ✏️ Edited: STT ${order.SessionIndex}, "${savedNote}" → "${currentNote}"`);
            } else {
                order.noteEdited = false;
            }
        } else {
            // No snapshot exists - only save if note has valid encoded products
            order.noteEdited = false;

            // ✅ NEW: Verify orderId in encoded products to prevent cross-order copy
            if (hasValidEncodedProducts(currentNote, orderId)) {
                // Has valid encoded products belonging to THIS order → Save snapshot
                console.log(`[NOTE-TRACKER] 📸 Saving snapshot for order #${orderId} (has valid encoded products)`);

                newSnapshotsToSave[orderId] = {
                    note: currentNote,
                    code: order.Code,
                    stt: order.SessionIndex,
                    timestamp: Date.now()
                };
            } else {
                // No valid encoded products → Skip saving snapshot
                if (currentNote) {
                    console.log(`[NOTE-TRACKER] ⏭️ Skipping order #${orderId} (no valid encoded products)`);
                }
            }
        }
    });

    // Save new snapshots in batch
    if (Object.keys(newSnapshotsToSave).length > 0) {
        await saveNoteSnapshots(newSnapshotsToSave);
    }

    console.log(`[NOTE-TRACKER] ✅ Found ${editedCount} edited notes out of ${orders.length} orders`);
}

/**
 * Save note snapshots to Firebase
 * @param {Object} snapshots - Map of orderId -> snapshot data
 * @returns {Promise<void>}
 */
async function saveNoteSnapshots(snapshots) {
    if (!database) {
        console.warn('[NOTE-TRACKER] Firebase not initialized');
        return;
    }

    try {
        const updates = {};
        Object.keys(snapshots).forEach(orderId => {
            updates[`order_notes_snapshot/${orderId}`] = snapshots[orderId];
        });

        await database.ref().update(updates);
        console.log(`[NOTE-TRACKER] Saved ${Object.keys(snapshots).length} new snapshots to Firebase`);
    } catch (error) {
        console.error('[NOTE-TRACKER] Error saving snapshots:', error);
    }
}

/**
 * Main function to detect edited notes using Firebase snapshots
 * Call this after loading orders
 */
async function detectEditedNotes() {
    if (!allData || allData.length === 0) {
        console.log('[NOTE-TRACKER] No data to check');
        return;
    }

    console.log('[NOTE-TRACKER] Starting note edit detection for', allData.length, 'orders...');

    // Load snapshots from Firebase (1 call for all orders)
    const snapshots = await loadNoteSnapshots();

    // Compare and update note status
    await compareAndUpdateNoteStatus(allData, snapshots);

    console.log('[NOTE-TRACKER] Note edit detection completed');
}

/**
 * Helper to extract the correct Facebook Comment ID from a comment object
 * Prioritizes FacebookId, OriginalId, then checks if Id is not a Mongo ID
 */
function getFacebookCommentId(comment) {
    if (!comment) return null;

    // 1. Explicit fields
    if (comment.PlatformId) return comment.PlatformId;
    if (comment.FacebookId) return comment.FacebookId;
    if (comment.OriginalId) return comment.OriginalId;
    if (comment.SocialId) return comment.SocialId;

    // 2. Check if Id is NOT a Mongo ID (24 hex chars)
    // Facebook IDs are usually numeric or have underscores
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(comment.Id);
    if (comment.Id && !isMongoId) {
        return comment.Id;
    }

    // 3. Fallback to Id if nothing else found (might fail if it's internal)
    return comment.Id;
}

/**
 * Helper to extract just the post ID from a Facebook post identifier
 * Facebook_PostId format: "pageId_postId" (e.g., "117267091364524_1382798016618291")
 * Returns: just the postId part (e.g., "1382798016618291")
 */
function extractPostId(facebookPostId) {
    if (!facebookPostId) return null;

    // If it contains underscore, it's in format pageId_postId
    if (facebookPostId.includes('_')) {
        const parts = facebookPostId.split('_');
        // Return the second part (postId)
        return parts.length >= 2 ? parts[1] : facebookPostId;
    }

    // Otherwise return as-is (already just the postId)
    return facebookPostId;
}
// =====================================================
// REALTIME UI UPDATES
// =====================================================
window.addEventListener('realtimeConversationUpdate', function (event) {
    const conversation = event.detail;
    if (!conversation) return;

    // console.log('[TAB1] Handling realtime update:', conversation);

    let psid = conversation.from_psid || (conversation.customers && conversation.customers[0]?.fb_id);
    let pageId = conversation.page_id;

    // Fallback: Extract from conversation.id (format: pageId_psid)
    if ((!psid || !pageId) && conversation.id && conversation.id.includes('_')) {
        const parts = conversation.id.split('_');
        if (parts.length === 2) {
            if (!pageId) pageId = parts[0];
            if (!psid) psid = parts[1];
        }
    }

    if (!psid) return;

    // 1. UPDATE DATA MANAGERS (Crucial for filters to work)
    if (window.pancakeDataManager) {
        const convType = conversation.type || 'INBOX';
        if (convType === 'INBOX') {
            if (psid) window.pancakeDataManager.inboxMapByPSID.set(psid, conversation);
            if (conversation.from && conversation.from.id) window.pancakeDataManager.inboxMapByFBID.set(conversation.from.id, conversation);
        } else if (convType === 'COMMENT') {
            if (psid) window.pancakeDataManager.commentMapByPSID.set(psid, conversation);
            if (conversation.from && conversation.from.id) window.pancakeDataManager.commentMapByFBID.set(conversation.from.id, conversation);
        }
    }

    // NEW: Check if chat modal is open for THIS conversation
    const chatModal = document.getElementById('chatModal');
    const isChatModalOpen = chatModal && chatModal.style.display !== 'none';

    if (isChatModalOpen && window.currentChatPSID) {
        const conversationPsid = conversation.from_psid || conversation.customers?.[0]?.fb_id;
        const conversationId = conversation.id;

        // IMPORTANT: Only update if this is THE conversation currently open in modal
        const isCurrentConversation =
            conversationPsid === window.currentChatPSID ||
            conversationId === window.currentChatConversationId;

        if (isCurrentConversation) {
            console.log('[REALTIME] Update for OPEN chat modal - fetching new messages for PSID:', conversationPsid);

            // Prevent fetch if we're currently sending (skipWebhookUpdate flag)
            if (!window.skipWebhookUpdate) {
                // Async fetch new messages without blocking table update
                fetchAndAppendNewMessages(conversation).catch(err => {
                    console.error('[REALTIME] Error fetching new messages:', err);
                });
            } else {
                console.log('[REALTIME] Skipping fetch - currently sending message');
            }
        } else {
            console.log('[REALTIME] Update for DIFFERENT conversation - only updating table');
        }
    }

    // 2. CHECK FILTER
    // If filtering by read/unread, we MUST re-run search to show/hide rows
    const currentFilter = document.getElementById('conversationFilter') ? document.getElementById('conversationFilter').value : 'all';
    if (currentFilter === 'unread' || currentFilter === 'read') {
        console.log(`[TAB1] Realtime update with filter '${currentFilter}' - Triggering re-search`);
        performTableSearch();
        return; // Stop here, let search handle the rendering
    }

    const message = conversation.snippet || '';
    const unreadCount = conversation.unread_count || 0;
    const isUnread = unreadCount > 0 || !conversation.seen;
    const type = conversation.type || 'INBOX'; // INBOX or COMMENT

    // Find matching orders in displayedData
    // Match both PSID and PageID (via Facebook_PostId which starts with PageID)
    const matchingOrders = displayedData.filter(o => {
        const matchesPsid = o.Facebook_ASUserId === psid;
        // If we have a pageId, check if Facebook_PostId starts with it
        const matchesPage = pageId ? (o.Facebook_PostId && o.Facebook_PostId.startsWith(pageId)) : true;
        return matchesPsid && matchesPage;
    });

    if (matchingOrders.length === 0) return;

    console.log(`[TAB1] Updating ${matchingOrders.length} rows for PSID ${psid} on Page ${pageId}`);

    matchingOrders.forEach(order => {
        // Find row
        const checkbox = document.querySelector(`input[value="${order.Id}"]`);
        if (!checkbox) return;
        const row = checkbox.closest('tr');
        if (!row) return;

        // Determine column based on type
        const colType = type === 'INBOX' ? 'messages' : 'comments';
        const cell = row.querySelector(`td[data-column="${colType}"]`);

        if (cell) {
            // Construct HTML directly
            const fontWeight = isUnread ? '700' : '400';
            const color = isUnread ? '#111827' : '#6b7280';
            const unreadBadge = isUnread ? `<span class="unread-badge"></span>` : '';
            const unreadText = unreadCount > 0 ? `<span style="font-size: 11px; color: #ef4444; font-weight: 600;">${unreadCount} tin mới</span>` : '';

            // Truncate message
            let displayMessage = message;
            if (displayMessage.length > 30) displayMessage = displayMessage.substring(0, 30) + '...';

            // Update innerHTML
            cell.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${unreadBadge}
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 13px; font-weight: ${fontWeight}; color: ${color};">
                            ${displayMessage}
                        </span>
                        ${unreadText}
                    </div>
                </div>
            `;

            // Add click event and styling
            // Use separate modals: openChatModal for messages, openCommentModal for comments
            const clickHandler = type === 'INBOX'
                ? `openChatModal('${order.Id}', '${pageId}', '${psid}')`
                : `openCommentModal('${order.Id}', '${pageId}', '${psid}')`;

            const tooltipText = type === 'INBOX'
                ? 'Click để xem toàn bộ tin nhắn'
                : 'Click để xem bình luận';

            cell.setAttribute('onclick', clickHandler);
            cell.style.cursor = 'pointer';
            cell.title = tooltipText;

            // Highlight
            row.classList.add('product-row-highlight');
            setTimeout(() => row.classList.remove('product-row-highlight'), 2000);
        }
    });

    // 🔄 UPDATE ALL DATA & RE-FILTER IF NEEDED
    // Even if the order is not currently displayed (filtered out), we need to update its state in allData
    // and check if it should now be displayed based on current filters.

    // 1. Update PancakeDataManager Cache (Crucial for performTableSearch)
    if (window.pancakeDataManager) {
        // We need to manually update the cache because performTableSearch uses getMessageUnreadInfoForOrder
        // which reads from this cache.
        // The conversation object from the event has the structure we need.

        // We need to find where to put it. 
        // PancakeDataManager stores conversations in inboxMapByPSID and inboxMapByFBID
        // We can try to call a method to update it, or manually set it if exposed.
        // Looking at PancakeDataManager, it doesn't seem to have a public 'updateConversation' method 
        // that takes a raw payload easily without fetching.
        // However, we can try to update the map if we can access it, but it's better to rely on 
        // what we have.

        // Actually, let's just update the order's internal state if possible, OR
        // since performTableSearch calls window.pancakeDataManager.getMessageUnreadInfoForOrder(order),
        // and that function looks up in inboxMapByPSID.

        // Let's try to update the map directly if possible, or add a helper in PancakeDataManager.
        // Since we can't easily modify PancakeDataManager right now without switching files,
        // let's assume for now we can't easily update the private maps if they are not exposed.

        // WAIT: window.pancakeDataManager.inboxMapByPSID is likely accessible.
        if (window.pancakeDataManager.inboxMapByPSID) {
            window.pancakeDataManager.inboxMapByPSID.set(String(psid), conversation);
        }
    }

    // 2. Check if we need to refresh the table (if order was hidden but now matches filter)
    const conversationFilter = document.getElementById('conversationFilter')?.value || 'all';

    // Only care if we are filtering by 'unread'
    if (conversationFilter === 'unread') {
        // Check if any matching order is NOT in displayedData
        // We need to find orders in allData that match this PSID/PageID
        const allMatchingOrders = allData.filter(o => {
            const matchesPsid = o.Facebook_ASUserId === psid;
            const matchesPage = pageId ? (o.Facebook_PostId && o.Facebook_PostId.startsWith(pageId)) : true;
            return matchesPsid && matchesPage;
        });

        const hiddenOrders = allMatchingOrders.filter(o => !displayedData.includes(o));

        if (hiddenOrders.length > 0) {
            console.log(`[TAB1] Found ${hiddenOrders.length} hidden orders matching realtime update. Refreshing table...`);

            // We need to ensure the filter logic sees them as "unread".
            // Since we updated the PancakeDataManager cache above, performTableSearch should now
            // correctly identify them as unread.

            performTableSearch();

            // After refresh, highlight them
            setTimeout(() => {
                hiddenOrders.forEach(order => {
                    const checkbox = document.querySelector(`input[value="${order.Id}"]`);
                    if (checkbox) {
                        const row = checkbox.closest('tr');
                        if (row) {
                            row.classList.add('product-row-highlight');
                            setTimeout(() => row.classList.remove('product-row-highlight'), 2000);
                        }
                    }
                });
            }, 100);
        }
    }
});

// =====================================================
// INCREMENTAL MESSAGE UPDATE HELPERS
// =====================================================

/**
 * Fetch only NEW messages and append to chat (WebSocket triggered)
 */
async function fetchAndAppendNewMessages(conversation) {
    try {
        const channelId = window.currentChatChannelId;
        const psid = window.currentChatPSID;
        const chatType = window.currentChatType || 'message';

        if (!channelId || !psid) {
            console.log('[REALTIME] Missing channelId or psid, cannot fetch');
            return;
        }

        // Get last message/comment ID from current list
        let lastId = null;
        if (chatType === 'message' && window.allChatMessages && window.allChatMessages.length > 0) {
            const lastMsg = window.allChatMessages[window.allChatMessages.length - 1];
            lastId = lastMsg.id || lastMsg.Id;
        } else if (chatType === 'comment' && window.allChatComments && window.allChatComments.length > 0) {
            const lastComment = window.allChatComments[window.allChatComments.length - 1];
            lastId = lastComment.id || lastComment.Id;
        }

        console.log('[REALTIME] Fetching messages after ID:', lastId);

        let newItems = [];

        if (chatType === 'message') {
            // Fetch ALL messages (API doesn't support 'after' parameter yet)
            const response = await window.chatDataManager.fetchMessages(channelId, psid, null);

            if (response && response.messages) {
                // Filter to only get messages we don't have yet
                const existingIds = new Set(window.allChatMessages.map(m => m.id || m.Id));
                newItems = response.messages.filter(msg => {
                    const msgId = msg.id || msg.Id;
                    return !existingIds.has(msgId);
                });
            }
        } else {
            // Fetch ALL comments
            const response = await window.chatDataManager.fetchComments(channelId, psid, null);

            if (response && response.comments) {
                // Filter to only get comments we don't have yet
                const existingIds = new Set(window.allChatComments.map(c => c.id || c.Id));
                newItems = response.comments.filter(comment => {
                    const commentId = comment.id || comment.Id;
                    return !existingIds.has(commentId);
                });
            }
        }

        if (newItems.length > 0) {
            console.log('[REALTIME] Got', newItems.length, 'new items');

            // Add to global array
            if (chatType === 'message') {
                window.allChatMessages.push(...newItems);
            } else {
                window.allChatComments.push(...newItems);
            }

            // Incremental render (NEW)
            appendNewMessages(newItems, chatType);
        } else {
            console.log('[REALTIME] No new items found');
        }

    } catch (error) {
        console.error('[REALTIME] Error fetching new messages:', error);
    }
}

/**
 * Create DOM element for a single message (without re-rendering all)
 */
function createMessageElement(msg, chatType = 'message') {
    const div = document.createElement('div');
    const isOwner = msg.IsOwner || msg.is_owner;

    div.className = `chat-message ${isOwner ? 'chat-message-right' : 'chat-message-left'}`;
    div.dataset.messageId = msg.id || msg.Id;

    const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

    let content = '';

    // Message text
    if (msg.Message || msg.message) {
        const messageText = msg.Message || msg.message;
        content += `<p class="chat-message-text">${messageText}</p>`;
    }

    // Attachments (capital A - messages)
    if (msg.Attachments && msg.Attachments.length > 0) {
        msg.Attachments.forEach(att => {
            if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy">`;
            } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                content += `<div class="chat-audio-message">
                    <audio controls><source src="${att.Payload.Url}" type="audio/mp4"></audio>
                </div>`;
            }
        });
    }

    // attachments (lowercase a - comments)
    if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach(att => {
            if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                content += `<img src="${att.file_url}" class="chat-message-image" loading="lazy">`;
            } else if (att.mime_type === 'audio/mp4' && att.file_url) {
                content += `<div class="chat-audio-message">
                    <audio controls><source src="${att.file_url}" type="audio/mp4"></audio>
                </div>`;
            }
        });
    }

    // Format time - use global formatTimeVN
    const formatTime = window.formatTimeVN;

    const timeStr = formatTime(msg.CreatedTime || msg.created_at);

    div.innerHTML = `
        <div class="chat-bubble ${bgClass}">
            ${content}
            <p class="chat-message-time">${timeStr}</p>
        </div>
    `;

    return div;
}

/**
 * Append new messages to chat (incremental update)
 */
function appendNewMessages(messages, chatType = 'message') {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) {
        console.warn('[APPEND] No modal body found');
        return;
    }

    const container = modalBody.querySelector('.chat-messages-container');
    if (!container) {
        console.warn('[APPEND] No messages container found');
        return;
    }

    // Check if user is at bottom (before adding new messages)
    const wasAtBottom = modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100;

    // Create document fragment for batch append (better performance)
    const fragment = document.createDocumentFragment();

    messages.forEach(msg => {
        const msgEl = createMessageElement(msg, chatType);
        fragment.appendChild(msgEl);
    });

    // Append all at once
    container.appendChild(fragment);

    // Smart scroll - only auto-scroll if user was already at bottom
    if (wasAtBottom) {
        requestAnimationFrame(() => {
            modalBody.scrollTop = modalBody.scrollHeight;

            // Hide new message indicator
            const indicator = document.getElementById('chatNewMessageIndicator');
            if (indicator) indicator.style.display = 'none';
        });
    } else {
        // Show "new messages" indicator if user scrolled up
        showNewMessageIndicator();
    }

    console.log('[APPEND] Added', messages.length, 'new messages to DOM');
}

// =====================================================
// QUICK ADD PRODUCT LOGIC
// =====================================================
let quickAddSelectedProducts = [];
let quickAddSearchTimeout = null;

function openQuickAddProductModal() {
    // Update UI - Global List
    document.getElementById('targetOrdersCount').textContent = "Danh sách chung";

    // Reset state
    quickAddSelectedProducts = [];
    renderQuickAddSelectedProducts();
    document.getElementById('quickProductSearch').value = '';
    document.getElementById('quickProductSuggestions').style.display = 'none';

    // Show modal
    document.getElementById('quickAddProductModal').style.display = 'block';
    document.getElementById('quickAddProductModal').classList.add('show');
    document.getElementById('quickAddProductBackdrop').style.display = 'block';

    // Focus search
    setTimeout(() => {
        document.getElementById('quickProductSearch').focus();
    }, 100);

    // Initialize search manager if needed
    if (window.enhancedProductSearchManager && !window.enhancedProductSearchManager.isLoaded) {
        window.enhancedProductSearchManager.fetchExcelProducts();
    }
}

function closeQuickAddProductModal() {
    document.getElementById('quickAddProductModal').style.display = 'none';
    document.getElementById('quickAddProductModal').classList.remove('show');
    document.getElementById('quickAddProductBackdrop').style.display = 'none';
}

// Search Input Handler
const quickProductSearchEl = document.getElementById('quickProductSearch');
if (quickProductSearchEl) {
    quickProductSearchEl.addEventListener('input', function (e) {
        const query = e.target.value;

        if (quickAddSearchTimeout) clearTimeout(quickAddSearchTimeout);

        if (!query || query.trim().length < 2) {
            const suggestionsEl = document.getElementById('quickProductSuggestions');
            if (suggestionsEl) suggestionsEl.style.display = 'none';
            return;
        }

        quickAddSearchTimeout = setTimeout(() => {
            if (window.enhancedProductSearchManager) {
                const results = window.enhancedProductSearchManager.search(query, 10);
                renderQuickAddSuggestions(results);
            }
        }, 300);
    });
}

// Hide suggestions on click outside
document.addEventListener('click', function (e) {
    const suggestions = document.getElementById('quickProductSuggestions');
    const searchInput = document.getElementById('quickProductSearch');

    if (suggestions && searchInput && e.target !== searchInput && !suggestions.contains(e.target)) {
        suggestions.style.display = 'none';
    }
});

function renderQuickAddSuggestions(products) {
    const suggestionsEl = document.getElementById('quickProductSuggestions');

    if (products.length === 0) {
        suggestionsEl.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                <i class="fas fa-search" style="font-size: 20px; opacity: 0.5; margin-bottom: 8px;"></i>
                <p style="margin: 0; font-size: 13px;">Không tìm thấy sản phẩm</p>
            </div>
        `;
        suggestionsEl.style.display = 'block';
        return;
    }

    suggestionsEl.innerHTML = products.map(product => {
        const imageUrl = product.ImageUrl || (product.Thumbnails && product.Thumbnails[0]);
        return `
            <div class="suggestion-item" onclick="addQuickProduct(${product.Id})" style="
                display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid #f3f4f6;
            " onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                <div style="width: 40px; height: 40px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                    ${imageUrl
                ? `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <i class="fas fa-box" style="color: #9ca3af; display: none;"></i>`
                : `<i class="fas fa-box" style="color: #9ca3af;"></i>`
            }
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 500; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${product.Name}</div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                        ${product.Code ? `<span style="font-size: 11px; color: #6b7280; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${product.Code}</span>` : ''}
                        <span style="font-size: 12px; font-weight: 600; color: #8b5cf6;">${(product.Price || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                </div>
                <i class="fas fa-plus-circle" style="color: #8b5cf6; font-size: 18px;"></i>
            </div>
        `;
    }).join('');

    suggestionsEl.style.display = 'block';
}

async function addQuickProduct(productId) {
    // Check if already added
    const existing = quickAddSelectedProducts.find(p => p.Id === productId);
    if (existing) {
        existing.Quantity += 1;
        renderQuickAddSelectedProducts();
        document.getElementById('quickProductSuggestions').style.display = 'none';
        document.getElementById('quickProductSearch').value = '';
        return;
    }

    // Get product details
    let product = null;
    if (window.enhancedProductSearchManager) {
        // Try to get from Excel cache first
        product = window.enhancedProductSearchManager.getFromExcel(productId);

        // If not full details, try to fetch
        if (product && !product.HasFullDetails) {
            try {
                const fullProduct = await window.enhancedProductSearchManager.getFullProductDetails(productId);
                product = { ...product, ...fullProduct };
            } catch (e) {
                console.warn("Could not fetch full details", e);
            }
        }
    }

    if (!product) return;

    quickAddSelectedProducts.push({
        Id: product.Id,
        Name: product.Name,
        Code: product.Code || product.DefaultCode || '',
        Price: product.Price || 0,
        ImageUrl: product.ImageUrl,
        Quantity: 1
    });

    renderQuickAddSelectedProducts();
    document.getElementById('quickProductSuggestions').style.display = 'none';
    document.getElementById('quickProductSearch').value = '';
    document.getElementById('quickProductSearch').focus();
}

function removeQuickProduct(index) {
    quickAddSelectedProducts.splice(index, 1);
    renderQuickAddSelectedProducts();
}

function updateQuickProductQuantity(index, change) {
    const product = quickAddSelectedProducts[index];
    const newQty = product.Quantity + change;

    if (newQty <= 0) {
        removeQuickProduct(index);
    } else {
        product.Quantity = newQty;
        renderQuickAddSelectedProducts();
    }
}

function clearSelectedProducts() {
    quickAddSelectedProducts = [];
    renderQuickAddSelectedProducts();
}

function renderQuickAddSelectedProducts() {
    const container = document.getElementById('selectedProductsList');
    const countEl = document.getElementById('selectedProductsCount');
    const clearBtn = document.getElementById('clearAllProductsBtn');

    countEl.textContent = quickAddSelectedProducts.length;
    clearBtn.style.display = quickAddSelectedProducts.length > 0 ? 'block' : 'none';

    if (quickAddSelectedProducts.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px 0; color: #9ca3af;">
                <i class="fas fa-basket-shopping" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                <p style="margin: 0; font-weight: 500;">Chưa có sản phẩm nào</p>
                <p style="margin: 4px 0 0 0; font-size: 13px;">Tìm kiếm và chọn sản phẩm để thêm</p>
            </div>
        `;
        return;
    }

    container.innerHTML = quickAddSelectedProducts.map((product, index) => {
        const imageUrl = product.ImageUrl;
        const total = (product.Price * product.Quantity).toLocaleString('vi-VN');

        return `
            <div class="selected-product-item" style="
                display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid #f3f4f6; background: white;
            ">
                <div style="width: 48px; height: 48px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                    ${imageUrl
                ? `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <i class="fas fa-box" style="color: #9ca3af; display: none;"></i>`
                : `<i class="fas fa-box" style="color: #9ca3af;"></i>`
            }
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 500; color: #1f2937; margin-bottom: 4px;">${product.Name}</div>
                    <div style="font-size: 12px; color: #6b7280;">${product.Code || 'No Code'}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="display: flex; align-items: center; border: 1px solid #e5e7eb; border-radius: 6px;">
                        <button onclick="updateQuickProductQuantity(${index}, -1)" style="padding: 4px 8px; background: none; border: none; cursor: pointer; color: #6b7280;">-</button>
                        <span style="font-size: 13px; font-weight: 600; min-width: 24px; text-align: center;">${product.Quantity}</span>
                        <button onclick="updateQuickProductQuantity(${index}, 1)" style="padding: 4px 8px; background: none; border: none; cursor: pointer; color: #6b7280;">+</button>
                    </div>
                    <div style="font-size: 13px; font-weight: 600; color: #374151; min-width: 80px; text-align: right;">
                        ${total}đ
                    </div>
                    <button onclick="removeQuickProduct(${index})" style="padding: 6px; background: none; border: none; cursor: pointer; color: #ef4444; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function saveSelectedProductsToOrders() {
    if (quickAddSelectedProducts.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning("Vui lòng chọn ít nhất một sản phẩm!");
        } else {
            alert("Vui lòng chọn ít nhất một sản phẩm!");
        }
        return;
    }

    showLoading(true);

    try {
        // Initialize Firebase if needed
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        const db = firebase.database();
        const ref = db.ref(`chat_products/shared`);

        // Get existing products first to merge quantities
        const snapshot = await ref.once('value');
        const existingProducts = snapshot.val() || {};

        // Merge new products
        quickAddSelectedProducts.forEach(newProduct => {
            if (existingProducts[newProduct.Id]) {
                // Update quantity
                existingProducts[newProduct.Id].Quantity = (existingProducts[newProduct.Id].Quantity || 0) + newProduct.Quantity;
            } else {
                // Add new
                existingProducts[newProduct.Id] = {
                    Id: newProduct.Id,
                    Name: newProduct.Name,
                    Code: newProduct.Code,
                    Price: newProduct.Price,
                    Quantity: newProduct.Quantity,
                    ImageUrl: newProduct.ImageUrl || '',
                    AddedAt: firebase.database.ServerValue.TIMESTAMP
                };
            }
        });

        // Save back to Firebase
        await ref.set(existingProducts);

        showLoading(false);
        closeQuickAddProductModal();

        if (window.notificationManager) {
            window.notificationManager.success(`Đã thêm sản phẩm vào danh sách chung!`);
        } else {
            alert(`✅ Đã thêm sản phẩm vào danh sách chung!`);
        }

    } catch (error) {
        console.error("Error saving products:", error);
        showLoading(false);
        if (window.notificationManager) {
            window.notificationManager.error("Lỗi khi lưu sản phẩm: " + error.message);
        } else {
            alert("❌ Lỗi khi lưu sản phẩm: " + error.message);
        }
    }
}
// =====================================================
// CHAT SHOPPING CART LOGIC
// =====================================================

/* LEGACY CODE REMOVED
function renderChatProductsPanel() {
    const listContainer = document.getElementById("chatProductList");
    const countBadge = document.getElementById("chatProductCountBadge");
    const totalEl = document.getElementById("chatOrderTotal");
 
    if (!listContainer) return;
 
    // Update Count & Total
    const totalQty = currentChatOrderDetails.reduce((sum, p) => sum + (p.Quantity || 0), 0);
    const totalAmount = currentChatOrderDetails.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);
 
    if (countBadge) countBadge.textContent = `${totalQty} sản phẩm`;
    if (totalEl) totalEl.textContent = `${totalAmount.toLocaleString("vi-VN")}đ`;
 
    // Empty State
    if (currentChatOrderDetails.length === 0) {
        listContainer.innerHTML = `
            <div class="chat-empty-cart" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <i class="fas fa-box-open" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                <p style="font-size: 14px; margin: 0;">Chưa có sản phẩm nào</p>
                <p style="font-size: 12px; margin-top: 4px;">Tìm kiếm để thêm sản phẩm vào đơn</p>
            </div>`;
        return;
    }
 
    // Render List
    listContainer.innerHTML = currentChatOrderDetails.map((p, index) => `
        <div class="chat-product-card" style="
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
            display: flex;
            gap: 12px;
            transition: all 0.2s;
        ">
            <!-- Image -->
            <div style="
                width: 48px;
                height: 48px;
                border-radius: 6px;
                background: #f1f5f9;
                overflow: hidden;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                ${p.ImageUrl
            ? `<img src="${p.ImageUrl}" style="width: 100%; height: 100%; object-fit: cover;">`
            : `<i class="fas fa-image" style="color: #cbd5e1;"></i>`}
            </div>
 
            <!-- Content -->
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${p.ProductName || p.Name || 'Sản phẩm'}
                    </div>
                    <button onclick="removeChatProduct(${index})" style="
                        background: none;
                        border: none;
                        color: #ef4444;
                        cursor: pointer;
                        padding: 4px;
                        margin-top: -4px;
                        margin-right: -4px;
                        opacity: 0.6;
                        transition: opacity 0.2s;
                    " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
                    Mã: ${p.ProductCode || p.Code || 'N/A'}
                </div>
 
                <!-- Controls -->
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 13px; font-weight: 700; color: #3b82f6;">
                        ${(p.Price || 0).toLocaleString("vi-VN")}đ
                    </div>
                    
                    <div style="display: flex; align-items: center; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                        <button onclick="updateChatProductQuantity(${index}, -1)" style="
                            width: 24px;
                            height: 24px;
                            border: none;
                            background: #f8fafc;
                            color: #64748b;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 10px;
                        "><i class="fas fa-minus"></i></button>
                        <input type="number" value="${p.Quantity || 1}" onchange="updateChatProductQuantity(${index}, 0, this.value)" style="
                            width: 32px;
                            height: 24px;
                            border: none;
                            border-left: 1px solid #e2e8f0;
                            border-right: 1px solid #e2e8f0;
                            text-align: center;
                            font-size: 12px;
                            font-weight: 600;
                            color: #1e293b;
                            -moz-appearance: textfield;
                        ">
                        <button onclick="updateChatProductQuantity(${index}, 1)" style="
                            width: 24px;
                            height: 24px;
                            border: none;
                            background: #f8fafc;
                            color: #64748b;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 10px;
                        "><i class="fas fa-plus"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `).join("");
}
*/

// --- Search Logic ---
var chatSearchTimeout = null;

function initChatProductSearch() {
    const input = document.getElementById("chatInlineProductSearch");
    console.log("[CHAT-SEARCH] Initializing search. Input found:", !!input);

    if (!input) {
        console.error("[CHAT-SEARCH] Search input not found!");
        return;
    }

    // Prevent duplicate listeners using a custom flag
    if (input.dataset.searchInitialized === "true") {
        console.log("[CHAT-SEARCH] Search already initialized for this input");
        return;
    }

    input.dataset.searchInitialized = "true";

    input.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        console.log("[CHAT-SEARCH] Input event:", query);

        if (chatSearchTimeout) clearTimeout(chatSearchTimeout);

        if (query.length < 2) {
            const resultsDiv = document.getElementById("chatInlineSearchResults");
            if (resultsDiv) resultsDiv.style.display = "none";
            return;
        }

        chatSearchTimeout = setTimeout(() => performChatProductSearch(query), 300);
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
        const dropdown = document.getElementById("chatInlineSearchResults");
        const searchContainer = input.closest('.chat-product-search-inline');
        if (dropdown && searchContainer && !searchContainer.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });
}

async function performChatProductSearch(query) {
    console.log("[CHAT-SEARCH] Performing search for:", query);
    const resultsDiv = document.getElementById("chatInlineSearchResults");
    if (!resultsDiv) {
        console.error("[CHAT-SEARCH] Results div not found!");
        return;
    }

    // Force styles to ensure visibility
    resultsDiv.style.display = "block";
    resultsDiv.style.zIndex = "1000";
    resultsDiv.innerHTML = `<div style="padding: 12px; text-align: center; color: #64748b; font-size: 13px;"><i class="fas fa-spinner fa-spin"></i> Đang tìm kiếm...</div>`;

    try {
        if (!window.productSearchManager) {
            throw new Error("ProductSearchManager not available");
        }

        if (!window.productSearchManager.isLoaded) {
            console.log("[CHAT-SEARCH] Loading products...");
            await window.productSearchManager.fetchExcelProducts();
        }

        const results = window.productSearchManager.search(query, 10);
        console.log("[CHAT-SEARCH] Results found:", results.length);
        displayChatSearchResults(results);
    } catch (error) {
        console.error("[CHAT-SEARCH] Error:", error);
        resultsDiv.innerHTML = `<div style="padding: 12px; text-align: center; color: #ef4444; font-size: 13px;">Lỗi: ${error.message}</div>`;
    }
}

function displayChatSearchResults(results) {
    const resultsDiv = document.getElementById("chatInlineSearchResults");
    if (!resultsDiv) return;

    // Ensure visibility and styling
    resultsDiv.style.display = "block";
    resultsDiv.style.zIndex = "1000";
    resultsDiv.style.maxHeight = "400px";
    resultsDiv.style.overflowY = "auto";
    resultsDiv.style.width = "600px"; // Make it wider like the screenshot
    resultsDiv.style.left = "-16px"; // Align with container padding
    resultsDiv.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)";

    if (!results || results.length === 0) {
        resultsDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 14px;">Không tìm thấy sản phẩm phù hợp</div>`;
        return;
    }

    // Check existing products
    const productsInOrder = new Map();
    currentChatOrderDetails.forEach(d => {
        productsInOrder.set(d.ProductId, d.Quantity || 0);
    });

    resultsDiv.innerHTML = results.map(p => {
        const isInOrder = productsInOrder.has(p.Id);
        const currentQty = productsInOrder.get(p.Id) || 0;

        return `
        <div class="chat-search-item ${isInOrder ? 'in-order' : ''}" data-product-id="${p.Id}" onclick="window.chatProductManager?.addProductFromSearch(${p.Id})" style="
            padding: 12px 16px;
            border-bottom: 1px solid #f1f5f9;
            display: flex;
            align-items: center;
            gap: 16px;
            background: white;
            transition: background 0.2s;
            cursor: pointer;
            position: relative; /* For badge positioning */
        " onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
            
            ${isInOrder ? `
            <div class="chat-search-qty-badge" style="
                position: absolute;
                top: 4px;
                right: 4px;
                background: #10b981;
                color: white;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                font-weight: 600;
                z-index: 10;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            "><i class="fas fa-shopping-cart"></i> SL: ${currentQty}</div>
            ` : ''}

            <!-- Image -->
            <div style="
                width: 48px; 
                height: 48px; 
                border-radius: 6px; 
                background: #f1f5f9; 
                overflow: hidden; 
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid #e2e8f0;
            ">
                ${(p.ImageUrl || (p.Thumbnails && p.Thumbnails[0]) || p.Parent?.ImageUrl)
                ? `<img src="${p.ImageUrl || (p.Thumbnails && p.Thumbnails[0]) || p.Parent?.ImageUrl}" style="width: 100%; height: 100%; object-fit: cover;">`
                : `<i class="fas fa-image" style="color: #cbd5e1; font-size: 20px;"></i>`}
            </div>

            <!-- Info -->
            <div style="flex: 1; min-width: 0;">
                <div style="
                    font-size: 14px; 
                    font-weight: 600; 
                    color: #1e293b; 
                    margin-bottom: 4px;
                    white-space: nowrap; 
                    overflow: hidden; 
                    text-overflow: ellipsis;
                ">${p.Name}</div>
                <div style="font-size: 12px; color: #64748b;">
                    Mã: <span style="font-family: monospace; color: #475569;">${p.Code || 'N/A'}</span>
                </div>
            </div>

            <!-- Price -->
            <div style="
                font-size: 14px; 
                font-weight: 700; 
                color: #10b981; 
                text-align: right;
                min-width: 80px;
            ">
                ${(p.Price || 0).toLocaleString("vi-VN")}đ
            </div>

            <!-- Add Button -->
            <button style="
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: none;
                background: ${isInOrder ? '#dcfce7' : '#f1f5f9'};
                color: ${isInOrder ? '#10b981' : '#64748b'};
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
            " onmouseover="this.style.background='${isInOrder ? '#dcfce7' : '#e2e8f0'}'" onmouseout="this.style.background='${isInOrder ? '#dcfce7' : '#f1f5f9'}'">
                <i class="fas ${isInOrder ? 'fa-check' : 'fa-plus'}"></i>
            </button>
        </div>`;
    }).join("");
}

function updateChatProductItemUI(productId) {
    const item = document.querySelector(`.chat-search-item[data-product-id="${productId}"]`);
    if (!item) return;

    // Add animation class (assuming CSS exists or we add inline style for animation)
    item.style.transition = "background 0.3s";
    item.style.background = "#dcfce7";
    setTimeout(() => {
        item.style.background = "white";
    }, 500);

    // Update quantity badge
    const existing = currentChatOrderDetails.find(d => d.ProductId == productId);
    const qty = existing ? existing.Quantity : 0;

    let badge = item.querySelector('.chat-search-qty-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'chat-search-qty-badge';
        badge.style.cssText = `
            position: absolute;
            top: 4px;
            right: 4px;
            background: #10b981;
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            font-weight: 600;
            z-index: 10;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        item.appendChild(badge);
    }
    badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${qty}`;

    // Update button
    const btn = item.querySelector('button');
    if (btn) {
        btn.style.background = '#dcfce7';
        btn.style.color = '#10b981';
        btn.innerHTML = '<i class="fas fa-check"></i>';
    }

    if (!item.classList.contains('in-order')) {
        item.classList.add('in-order');
    }
}

// =====================================================
// FIREBASE SYNC HELPER
// =====================================================
function saveChatProductsToFirebase(orderId, products) {
    if (!database || !orderId) return;
    const ref = database.ref('order_products/' + orderId);
    ref.set(products).catch(err => console.error("[CHAT-FIREBASE] Save error:", err));
}

/* LEGACY CODE REMOVED
async function addChatProductFromSearch(productId) {
    // Show loading state on the clicked item
    const searchItem = document.querySelector(`.chat-search-item[onclick*="${productId}"]`);
    const originalContent = searchItem ? searchItem.innerHTML : '';
    if (searchItem) {
        searchItem.innerHTML = `<div style="text-align: center; width: 100%; color: #6366f1;"><i class="fas fa-spinner fa-spin"></i> Đang tải thông tin...</div>`;
        searchItem.style.pointerEvents = 'none';
    }
 
    try {
        // 1. Fetch full details from TPOS (Required)
        const fullProduct = await window.productSearchManager.getFullProductDetails(productId);
        if (!fullProduct) throw new Error("Không tìm thấy thông tin sản phẩm");
 
        // Logic to inherit image from Product Template if missing (Variant logic)
        if ((!fullProduct.ImageUrl || fullProduct.ImageUrl === "") && (!fullProduct.Thumbnails || fullProduct.Thumbnails.length === 0)) {
            if (fullProduct.ProductTmplId) {
                try {
                    console.log(`[CHAT-ADD] Fetching product template ${fullProduct.ProductTmplId} for image fallback`);
                    // Construct Template URL
                    const templateApiUrl = window.productSearchManager.PRODUCT_API_BASE.replace('/Product', '/ProductTemplate');
                    const url = `${templateApiUrl}(${fullProduct.ProductTmplId})?$expand=Images`;
 
                    const headers = await window.tokenManager.getAuthHeader();
                    const response = await fetch(url, {
                        method: "GET",
                        headers: headers,
                    });
 
                    if (response.ok) {
                        const templateData = await response.json();
                        if (templateData.ImageUrl) fullProduct.ImageUrl = templateData.ImageUrl;
                    }
                } catch (e) {
                    console.warn(`[CHAT-ADD] Failed to fetch product template ${fullProduct.ProductTmplId}`, e);
                }
            }
        }
 
        // 2. Check if already exists
        const existingIndex = currentChatOrderDetails.findIndex(p => p.ProductId === productId);
 
        if (existingIndex >= 0) {
            // Increase quantity
            currentChatOrderDetails[existingIndex].Quantity = (currentChatOrderDetails[existingIndex].Quantity || 0) + 1;
        } else {
            // 3. Create new product object using EXACT logic from addProductToOrderFromInline
            const newProduct = {
                ProductId: fullProduct.Id,
                Quantity: 1,
                Price: fullProduct.PriceVariant || fullProduct.ListPrice || fullProduct.StandardPrice || 0,
                Note: null,
                UOMId: fullProduct.UOM?.Id || 1,
                Factor: 1,
                Priority: 0,
                OrderId: currentChatOrderId, // Use current chat order ID
                LiveCampaign_DetailId: null,
                ProductWeight: 0,
 
                // COMPUTED FIELDS
                ProductName: fullProduct.Name || fullProduct.NameTemplate,
                ProductNameGet: fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                UOMName: fullProduct.UOM?.Name || "Cái",
                ImageUrl: fullProduct.ImageUrl || (fullProduct.Thumbnails && fullProduct.Thumbnails[0]) || fullProduct.Parent?.ImageUrl || '',
                IsOrderPriority: null,
                QuantityRegex: null,
                IsDisabledLiveCampaignDetail: false,
 
                // Additional fields for chat UI compatibility if needed
                Name: fullProduct.Name,
                Code: fullProduct.DefaultCode || fullProduct.Barcode
            };
 
            currentChatOrderDetails.push(newProduct);
        }
 
        renderChatProductsPanel();
        saveChatProductsToFirebase('shared', currentChatOrderDetails);
 
        // Update UI for the added item
        updateChatProductItemUI(productId);
 
        // Clear search input and keep focus
        const searchInput = document.getElementById("chatProductSearchInput");
        if (searchInput) {
            searchInput.value = ''; // Clear input
            searchInput.focus();
        }
 
    } catch (error) {
        console.error("Error adding product:", error);
        if (searchItem) {
            searchItem.innerHTML = originalContent;
            searchItem.style.pointerEvents = 'auto';
        }
        alert("Lỗi khi thêm sản phẩm: " + error.message);
    }
}
*/

// --- Action Logic ---

/* LEGACY CODE REMOVED
function updateChatProductQuantity(index, delta, specificValue = null) {
    if (index < 0 || index >= currentChatOrderDetails.length) return;
 
    if (specificValue !== null) {
        const val = parseInt(specificValue);
        if (val > 0) currentChatOrderDetails[index].Quantity = val;
    } else {
        const newQty = (currentChatOrderDetails[index].Quantity || 0) + delta;
        if (newQty > 0) currentChatOrderDetails[index].Quantity = newQty;
    }
 
    renderChatProductsPanel();
    saveChatProductsToFirebase('shared', currentChatOrderDetails);
}
*/

/* LEGACY CODE REMOVED
function removeChatProduct(index) {
    if (confirm("Bạn có chắc muốn xóa sản phẩm này?")) {
        currentChatOrderDetails.splice(index, 1);
        renderChatProductsPanel();
        saveChatProductsToFirebase('shared', currentChatOrderDetails);
    }
}
*/

// =====================================================
// MERGE ORDER PRODUCTS API FUNCTIONS
// =====================================================

/**
 * Get order details with products from API
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} Order data with Details array
 */
async function getOrderDetails(orderId) {
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;

        const response = await API_CONFIG.smartFetch(apiUrl, {
            headers: {
                ...headers,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[MERGE-API] Fetched order ${orderId} with ${data.Details?.length || 0} products`);
        return data;
    } catch (error) {
        console.error(`[MERGE-API] Error fetching order ${orderId}:`, error);
        throw error;
    }
}

/**
 * Update order with full payload via API
 * @param {Object} orderData - Full order data (fetched from API)
 * @param {Array} newDetails - New Details array to set
 * @param {number} totalAmount - Total amount
 * @param {number} totalQuantity - Total quantity
 * @returns {Promise<Object>} Updated order data
 */
async function updateOrderWithFullPayload(orderData, newDetails, totalAmount, totalQuantity) {
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderData.Id})`;

        // Clone order data and prepare payload (same approach as prepareOrderPayload)
        const payload = JSON.parse(JSON.stringify(orderData));

        // Add @odata.context (CRITICAL for PUT request)
        if (!payload["@odata.context"]) {
            payload["@odata.context"] = "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity";
        }

        // Update Details with new products
        payload.Details = (newDetails || []).map(detail => {
            const cleaned = { ...detail };

            // Remove Id if null/undefined (for new details)
            if (!cleaned.Id || cleaned.Id === null || cleaned.Id === undefined) {
                delete cleaned.Id;
            }

            // Ensure OrderId matches
            cleaned.OrderId = orderData.Id;

            return cleaned;
        });

        // Update totals
        payload.TotalAmount = totalAmount || 0;
        payload.TotalQuantity = totalQuantity || 0;

        console.log(`[MERGE-API] Preparing PUT payload for order ${orderData.Id}:`, {
            detailsCount: payload.Details.length,
            totalAmount: payload.TotalAmount,
            totalQuantity: payload.TotalQuantity,
            hasContext: !!payload["@odata.context"],
            hasRowVersion: !!payload.RowVersion
        });

        const response = await API_CONFIG.smartFetch(apiUrl, {
            method: 'PUT',
            headers: {
                ...headers,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[MERGE-API] PUT failed:`, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Handle empty response body (PUT often returns 200 OK with no content)
        let data = null;
        const responseText = await response.text();
        if (responseText && responseText.trim()) {
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.log(`[MERGE-API] Response is not JSON, treating as success`);
            }
        }

        console.log(`[MERGE-API] ✅ Updated order ${orderData.Id} with ${newDetails.length} products`);
        return data || { success: true, orderId: orderData.Id };
    } catch (error) {
        console.error(`[MERGE-API] Error updating order ${orderData.Id}:`, error);
        throw error;
    }
}

/**
 * Execute product merge for a single merged order
 * @param {Object} mergedOrder - Merged order object with TargetOrderId and SourceOrderIds
 * @returns {Promise<Object>} Merge result
 */
async function executeMergeOrderProducts(mergedOrder) {
    if (!mergedOrder.IsMerged || !mergedOrder.TargetOrderId || !mergedOrder.SourceOrderIds || mergedOrder.SourceOrderIds.length === 0) {
        console.log('[MERGE-API] Not a merged order or no source orders to merge');
        return { success: false, message: 'Not a merged order' };
    }

    try {
        console.log(`[MERGE-API] Starting merge for phone ${mergedOrder.Telephone}`);
        console.log(`[MERGE-API] Target: STT ${mergedOrder.TargetSTT} (${mergedOrder.TargetOrderId})`);
        console.log(`[MERGE-API] Sources: STT ${mergedOrder.SourceSTTs.join(', ')} (${mergedOrder.SourceOrderIds.length} orders)`);

        // Step 1: Fetch all order details
        const targetOrderData = await getOrderDetails(mergedOrder.TargetOrderId);
        const sourceOrdersData = await Promise.all(
            mergedOrder.SourceOrderIds.map(id => getOrderDetails(id))
        );

        // Step 2: Collect all products and merge by ProductId
        const productMap = new Map(); // key: ProductId, value: product detail

        // Add target order products first
        (targetOrderData.Details || []).forEach(detail => {
            const key = detail.ProductId;
            if (productMap.has(key)) {
                // Same product exists, merge quantity
                const existing = productMap.get(key);
                existing.Quantity = (existing.Quantity || 0) + (detail.Quantity || 0);
                existing.Price = detail.Price; // Keep latest price
            } else {
                productMap.set(key, { ...detail });
            }
        });

        // Add source order products
        sourceOrdersData.forEach((sourceOrder, index) => {
            const sourceProducts = sourceOrder.Details || [];
            console.log(`[MERGE-API] Source STT ${mergedOrder.SourceSTTs[index]}: ${sourceProducts.length} products`);

            sourceProducts.forEach(detail => {
                const key = detail.ProductId;
                if (productMap.has(key)) {
                    // Same product exists, merge quantity
                    const existing = productMap.get(key);
                    existing.Quantity = (existing.Quantity || 0) + (detail.Quantity || 0);
                    console.log(`[MERGE-API] Merged duplicate ProductId ${key}: new qty = ${existing.Quantity}`);
                } else {
                    productMap.set(key, { ...detail });
                }
            });
        });

        // Convert map to array
        const allProducts = Array.from(productMap.values());

        // Calculate totals from merged products
        let totalAmount = 0;
        let totalQuantity = 0;
        allProducts.forEach(p => {
            totalAmount += (p.Price || 0) * (p.Quantity || 0);
            totalQuantity += (p.Quantity || 0);
        });

        console.log(`[MERGE-API] Total products to merge: ${allProducts.length}`);
        console.log(`[MERGE-API] Total amount: ${totalAmount}, Total quantity: ${totalQuantity}`);

        // Step 3: Update target order with all products (using full payload)
        await updateOrderWithFullPayload(targetOrderData, allProducts, totalAmount, totalQuantity);
        console.log(`[MERGE-API] ✅ Updated target order STT ${mergedOrder.TargetSTT} with ${allProducts.length} products`);

        // Step 4: Clear products from source orders (using full payload)
        for (let i = 0; i < mergedOrder.SourceOrderIds.length; i++) {
            const sourceOrder = sourceOrdersData[i];
            const sourceSTT = mergedOrder.SourceSTTs[i];

            await updateOrderWithFullPayload(sourceOrder, [], 0, 0);
            console.log(`[MERGE-API] ✅ Cleared products from source order STT ${sourceSTT}`);
        }

        console.log(`[MERGE-API] ✅ Merge completed successfully!`);
        return {
            success: true,
            message: `Đã gộp ${sourceOrdersData.length} đơn vào STT ${mergedOrder.TargetSTT}`,
            targetSTT: mergedOrder.TargetSTT,
            sourceSTTs: mergedOrder.SourceSTTs,
            totalProducts: allProducts.length
        };

    } catch (error) {
        console.error('[MERGE-API] Error during merge:', error);
        return {
            success: false,
            message: 'Lỗi: ' + error.message,
            error: error
        };
    }
}

/**
 * Execute product merge for all merged orders in current displayed data
 * @returns {Promise<Object>} Bulk merge result
 */
async function executeBulkMergeOrderProducts() {
    try {
        // Group orders by phone number to find duplicates
        const phoneGroups = new Map();
        displayedData.forEach(order => {
            const phone = order.Telephone?.trim();
            if (phone) {
                if (!phoneGroups.has(phone)) {
                    phoneGroups.set(phone, []);
                }
                phoneGroups.get(phone).push(order);
            }
        });

        // Find phone numbers with multiple orders (need merging)
        const mergeableGroups = [];
        phoneGroups.forEach((orders, phone) => {
            if (orders.length > 1) {
                // Sort by SessionIndex (STT) descending - target is highest STT
                orders.sort((a, b) => (b.SessionIndex || 0) - (a.SessionIndex || 0));
                const targetOrder = orders[0];
                const sourceOrders = orders.slice(1);

                mergeableGroups.push({
                    Telephone: phone,
                    TargetOrderId: targetOrder.Id,
                    TargetSTT: targetOrder.SessionIndex,
                    SourceOrderIds: sourceOrders.map(o => o.Id),
                    SourceSTTs: sourceOrders.map(o => o.SessionIndex),
                    IsMerged: true // For compatibility with executeMergeOrderProducts
                });
            }
        });

        if (mergeableGroups.length === 0) {
            if (window.notificationManager) {
                window.notificationManager.show('Không có đơn hàng nào trùng SĐT cần gộp sản phẩm.', 'warning');
            }
            return { success: false, message: 'No duplicate phone orders found' };
        }

        const totalSourceOrders = mergeableGroups.reduce((sum, g) => sum + g.SourceOrderIds.length, 0);
        const confirmMsg = `Tìm thấy ${mergeableGroups.length} SĐT trùng (${totalSourceOrders + mergeableGroups.length} đơn).\n\n` +
            `Hành động này sẽ:\n` +
            `- Gộp sản phẩm từ đơn STT nhỏ → đơn STT lớn\n` +
            `- Xóa sản phẩm khỏi ${totalSourceOrders} đơn nguồn`;

        const confirmed = await window.notificationManager.confirm(confirmMsg, "Xác nhận gộp sản phẩm");
        if (!confirmed) {
            return { success: false, message: 'Cancelled by user' };
        }

        // Show loading indicator
        if (window.notificationManager) {
            window.notificationManager.show(`Đang gộp sản phẩm cho ${mergeableGroups.length} SĐT...`, 'info');
        }

        // Execute merge for each phone group
        const results = [];
        for (let i = 0; i < mergeableGroups.length; i++) {
            const group = mergeableGroups[i];
            console.log(`[MERGE-BULK] Processing ${i + 1}/${mergeableGroups.length}: Phone ${group.Telephone}`);

            const result = await executeMergeOrderProducts(group);
            results.push({ order: group, result });

            // Small delay to avoid rate limiting
            if (i < mergeableGroups.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Count successes and failures
        const successCount = results.filter(r => r.result.success).length;
        const failureCount = results.length - successCount;

        // Show summary using custom notification
        if (window.notificationManager) {
            if (failureCount > 0) {
                // Show detailed failure info
                const failedPhones = results.filter(r => !r.result.success).map(r => r.order.Telephone).join(', ');
                window.notificationManager.show(
                    `⚠️ Gộp ${successCount}/${results.length} đơn. Thất bại: ${failedPhones}`,
                    'warning',
                    8000
                );
            } else {
                window.notificationManager.show(
                    `✅ Đã gộp sản phẩm thành công cho ${successCount} đơn hàng!`,
                    'success',
                    5000
                );
            }
        }
        // Refresh table - fetch fresh data from API and re-render
        try {
            // Reload orders data from current campaign
            await fetchOrders();
            // renderTable and updateStats are called inside fetchOrders flow
        } catch (refreshError) {
            console.warn('[MERGE-BULK] Could not auto-refresh, please reload manually:', refreshError);
            // Fallback: just re-render with current data
            renderTable();
            updateStats();
        }

        return {
            success: true,
            totalOrders: results.length,
            successCount,
            failureCount,
            results
        };

    } catch (error) {
        console.error('[MERGE-BULK] Error during bulk merge:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi khi gộp sản phẩm: ' + error.message, 'error', 5000);
        }
        return { success: false, message: error.message, error };
    }
}

// Make function globally accessible
window.executeMergeOrderProducts = executeMergeOrderProducts;
window.executeBulkMergeOrderProducts = executeBulkMergeOrderProducts;





// =====================================================
// ADDRESS LOOKUP LOGIC
// =====================================================
async function handleAddressLookup() {
    const input = document.getElementById('addressLookupInput');
    const resultsContainer = document.getElementById('addressLookupResults');
    const keyword = input.value.trim();

    if (!keyword) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng nhập từ khóa tìm kiếm', 'warning');
        } else {
            alert('Vui lòng nhập từ khóa tìm kiếm');
        }
        return;
    }

    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> Đang tìm kiếm...</div>';

    try {
        // Use the global searchByName function from api-handler.js which returns data without DOM manipulation
        if (typeof window.searchByName !== 'function') {
            throw new Error('Hàm tìm kiếm không khả dụng (api-handler.js chưa được tải)');
        }

        const items = await window.searchByName(keyword);

        if (!items || items.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #ef4444;">Không tìm thấy kết quả phù hợp</div>';
            return;
        }

        resultsContainer.innerHTML = items.map(item => {
            // Determine display name and type label
            let displayName = item.name || item.ward_name || item.district_name || '';
            let typeLabel = '';
            let fullAddress = displayName; // Default to display name
            let subText = '';

            if (item.type === 'province') {
                typeLabel = 'Tỉnh/Thành phố';
            } else if (item.type === 'district') {
                typeLabel = 'Quận/Huyện';
                if (item.province_name) {
                    fullAddress = `${displayName}, ${item.province_name}`;
                }
            } else if (item.type === 'ward') {
                typeLabel = 'Phường/Xã';
                // Try to construct better address if fields exist
                if (item.district_name && item.province_name) {
                    fullAddress = `${displayName}, ${item.district_name}, ${item.province_name}`;
                } else if (item.merger_details) {
                    // Use merger details as context since district_name is missing
                    subText = `<div style="font-size: 10px; color: #9ca3af; font-style: italic;">${item.merger_details}</div>`;
                    // Construct full address with province
                    if (item.province_name) {
                        fullAddress = `${displayName}, ${item.province_name}`;
                        // Append district info from merger details if possible (simple heuristic)
                        // This is optional, but helps if the user wants the "old" district name in the text
                        fullAddress += ` (${item.merger_details})`;
                    }
                } else if (item.address) {
                    fullAddress = item.address;
                }
            }

            return `
            <div class="address-result-item" 
                 onclick="selectAddress('${fullAddress.replace(/'/g, "\\'")}', '${item.type}')"
                 style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500; color: #374151;">${displayName}</div>
                    <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${typeLabel}</div>
                    ${subText}
                </div>
                <i class="fas fa-chevron-right" style="font-size: 12px; color: #d1d5db;"></i>
            </div>
            `;
        }).join('');

        // Add hover effect via JS since we are injecting HTML
        const resultItems = resultsContainer.querySelectorAll('.address-result-item');
        resultItems.forEach(item => {
            item.onmouseover = () => item.style.backgroundColor = '#f9fafb';
            item.onmouseout = () => item.style.backgroundColor = 'white';
        });

    } catch (error) {
        console.error('Address lookup error:', error);
        resultsContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: #ef4444;">Lỗi: ${error.message}</div>`;
    }
}

async function handleFullAddressLookup() {
    const input = document.getElementById('fullAddressLookupInput');
    const resultsContainer = document.getElementById('addressLookupResults');

    if (!input || !resultsContainer) return;

    const keyword = input.value.trim();
    if (!keyword) {
        alert('Vui lòng nhập địa chỉ đầy đủ');
        return;
    }

    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> Đang phân tích địa chỉ...</div>';

    try {
        if (typeof window.searchFullAddress !== 'function') {
            throw new Error('Hàm tìm kiếm không khả dụng (api-handler.js chưa được tải)');
        }

        const response = await window.searchFullAddress(keyword);

        if (!response || !response.data || response.data.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #ef4444;">Không tìm thấy kết quả phù hợp</div>';
            return;
        }

        // The API returns data in a simple format: { address: "...", note: "..." }

        const items = response.data;
        resultsContainer.innerHTML = items.map(item => {
            const fullAddress = item.address;

            return `
            <div class="address-result-item" 
                 onclick="selectAddress('${fullAddress.replace(/'/g, "\\'")}', 'full')"
                 style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500; color: #374151;">${item.address}</div>
                    ${item.note ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${item.note}</div>` : ''}
                </div>
                <i class="fas fa-check" style="font-size: 12px; color: #059669;"></i>
            </div>
            `;
        }).join('');

        const resultItems = resultsContainer.querySelectorAll('.address-result-item');
        resultItems.forEach(item => {
            item.onmouseover = () => item.style.backgroundColor = '#f9fafb';
            item.onmouseout = () => item.style.backgroundColor = 'white';
        });

    } catch (error) {
        console.error('Full address lookup error:', error);
        resultsContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: #ef4444;">Lỗi: ${error.message}</div>`;
    }
}

async function selectAddress(fullAddress, type) {
    const addressTextarea = document.querySelector('textarea[onchange*="updateOrderInfo(\'Address\'"]');
    if (addressTextarea) {
        let newAddress = fullAddress;

        // Logic to append or replace
        if (addressTextarea.value && addressTextarea.value.trim() !== '') {
            // Check if the textarea contains the new address already
            if (!addressTextarea.value.includes(fullAddress)) {
                // Confirm with user using custom popup
                const replaceAddress = await window.notificationManager.confirm(
                    'Bạn có muốn thay thế địa chỉ hiện tại không?\n\nĐồng ý: Thay thế\nHủy: Nối thêm vào sau',
                    'Chọn cách cập nhật địa chỉ'
                );
                if (replaceAddress) {
                    newAddress = fullAddress;
                } else {
                    newAddress = addressTextarea.value + ', ' + fullAddress;
                }
            }
        }

        addressTextarea.value = newAddress;
        updateOrderInfo('Address', newAddress);

        // Hide results and clear input
        document.getElementById('addressLookupResults').style.display = 'none';
        document.getElementById('addressLookupInput').value = '';

        if (window.notificationManager) {
            window.notificationManager.show('Đã cập nhật địa chỉ', 'success');
        }
    }
}

// =====================================================
// PRODUCT STATS MODAL FUNCTIONS
// =====================================================

/**
 * Open the product stats modal and load previous stats if available
 */
function openProductStatsModal() {
    const modal = document.getElementById('productStatsModal');
    if (modal) {
        modal.classList.add('show');
        // Load previous stats from Firebase if available
        loadStatsFromFirebase();
    }
}

/**
 * Close the product stats modal
 */
function closeProductStatsModal() {
    const modal = document.getElementById('productStatsModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const modal = document.getElementById('productStatsModal');
    if (modal && event.target === modal) {
        closeProductStatsModal();
    }
});

/**
 * Get current campaign ID for Firebase storage
 */
function getStatsCampaignId() {
    if (selectedCampaign && selectedCampaign.campaignId) {
        return selectedCampaign.campaignId;
    }
    return 'no_campaign';
}

/**
 * Load stats from Firebase for current campaign
 */
async function loadStatsFromFirebase() {
    const modalBody = document.getElementById('productStatsModalBody');
    const campaignId = getStatsCampaignId();

    try {
        const statsRef = window.firebase.database().ref(`product_stats/${campaignId}`);
        const snapshot = await statsRef.once('value');
        const data = snapshot.val();

        if (data && data.statsHtml) {
            // Show campaign info
            const campaignInfo = data.campaignName
                ? `<div class="stats-campaign-info"><i class="fas fa-video"></i>Chiến dịch: ${data.campaignName} | Cập nhật: ${new Date(data.updatedAt).toLocaleString('vi-VN')}</div>`
                : '';
            modalBody.innerHTML = campaignInfo + data.statsHtml;
        } else {
            modalBody.innerHTML = `
                <div class="stats-empty-state">
                    <i class="fas fa-chart-pie"></i>
                    <p>Chưa có dữ liệu thống kê. Bấm nút "Thống kê" để bắt đầu.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('[PRODUCT-STATS] Error loading from Firebase:', error);
        modalBody.innerHTML = `
            <div class="stats-empty-state">
                <i class="fas fa-chart-pie"></i>
                <p>Bấm nút "Thống kê" để bắt đầu</p>
            </div>
        `;
    }
}

/**
 * Save stats to Firebase for current campaign
 */
async function saveStatsToFirebase(statsHtml, summaryData) {
    const campaignId = getStatsCampaignId();
    const campaignName = selectedCampaign ? selectedCampaign.campaignName : '';

    try {
        const statsRef = window.firebase.database().ref(`product_stats/${campaignId}`);
        await statsRef.set({
            campaignId: campaignId,
            campaignName: campaignName,
            statsHtml: statsHtml,
            totalProducts: summaryData.totalProducts,
            totalQuantity: summaryData.totalQuantity,
            totalOrders: summaryData.totalOrders,
            updatedAt: new Date().toISOString()
        });
        console.log('[PRODUCT-STATS] Saved to Firebase successfully');
    } catch (error) {
        console.error('[PRODUCT-STATS] Error saving to Firebase:', error);
    }
}

/**
 * Run product statistics on all orders in allData
 */
async function runProductStats() {
    const modalBody = document.getElementById('productStatsModalBody');
    const runBtn = document.querySelector('.btn-run-stats');

    // Show loading state
    modalBody.innerHTML = `
        <div class="stats-loading">
            <div class="spinner"></div>
            <p>Đang thống kê sản phẩm...</p>
        </div>
    `;

    if (runBtn) {
        runBtn.disabled = true;
        runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
    }

    try {
        // Check if allData exists
        if (!allData || allData.length === 0) {
            modalBody.innerHTML = `
                <div class="stats-empty-state">
                    <i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i>
                    <p>Không có dữ liệu đơn hàng. Vui lòng tải dữ liệu trước.</p>
                </div>
            `;
            return;
        }

        // Build product statistics
        const productStats = new Map(); // key: ProductCode, value: { name, nameGet, imageUrl, sttList: [{stt, qty}] }
        const orderSet = new Set(); // Track unique orders
        let totalQuantity = 0;

        allData.forEach((order) => {
            const stt = order.SessionIndex || '';
            if (!stt) return; // Skip orders without STT

            orderSet.add(stt);

            const details = order.Details || [];
            details.forEach((product) => {
                const productCode = product.ProductCode || 'N/A';
                const quantity = product.Quantity || product.ProductUOMQty || 1;
                totalQuantity += quantity;

                if (!productStats.has(productCode)) {
                    productStats.set(productCode, {
                        code: productCode,
                        name: product.ProductName || '',
                        nameGet: product.ProductNameGet || product.ProductName || '',
                        imageUrl: product.ImageUrl || '',
                        sttList: [],
                        totalQty: 0
                    });
                }

                const stat = productStats.get(productCode);
                stat.sttList.push({ stt: stt, qty: quantity });
                stat.totalQty += quantity;
            });
        });

        // Sort products by total quantity (descending)
        const sortedProducts = Array.from(productStats.values()).sort((a, b) => b.totalQty - a.totalQty);

        // Summary data
        const summaryData = {
            totalProducts: sortedProducts.length,
            totalQuantity: totalQuantity,
            totalOrders: orderSet.size
        };

        // Build HTML table
        const tableRowsHtml = sortedProducts.map((product) => {
            // Build STT list string with quantity
            const sttListStr = product.sttList.map(item => {
                if (item.qty > 1) {
                    return `${item.stt}<span class="stats-stt-qty">(${item.qty})</span>`;
                }
                return item.stt;
            }).join(', ');

            // Product image
            const imageHtml = product.imageUrl
                ? `<img src="${product.imageUrl}" class="stats-product-image" alt="${product.code}" onerror="this.style.display='none'">`
                : `<div class="stats-product-image-placeholder"><i class="fas fa-image"></i></div>`;

            return `
                <tr>
                    <td>
                        <div class="stats-product-info">
                            ${imageHtml}
                            <div class="stats-product-details">
                                <div class="stats-product-code">[${product.code}]</div>
                                <div class="stats-product-name">${product.nameGet || product.name}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="stats-quantity-badge">${product.totalQty}</span>
                    </td>
                    <td>
                        <div class="stats-stt-list">${sttListStr}</div>
                    </td>
                </tr>
            `;
        }).join('');

        const statsHtml = `
            <div class="stats-summary-header" onclick="toggleStatsSummary(this)">
                <i class="fas fa-chevron-down toggle-icon"></i>
                <i class="fas fa-list-alt"></i>
                <span class="stats-summary-content">TỔNG CỘNG: ${summaryData.totalProducts} sản phẩm</span>
                <div class="stats-summary-values">
                    <span>${summaryData.totalQuantity.toLocaleString('vi-VN')} món</span>
                    <span>${summaryData.totalOrders.toLocaleString('vi-VN')} đơn hàng</span>
                </div>
            </div>
            <div class="stats-table-container">
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>SẢN PHẨM</th>
                            <th>SỐ LƯỢNG</th>
                            <th>MÃ ĐƠN HÀNG (STT)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
        `;

        // Show campaign info
        const campaignName = selectedCampaign ? selectedCampaign.campaignName : 'Không có chiến dịch';
        const campaignInfo = `<div class="stats-campaign-info"><i class="fas fa-video"></i>Chiến dịch: ${campaignName} | Cập nhật: ${new Date().toLocaleString('vi-VN')}</div>`;

        modalBody.innerHTML = campaignInfo + statsHtml;

        // Save to Firebase
        await saveStatsToFirebase(statsHtml, summaryData);

        if (window.notificationManager) {
            window.notificationManager.show(`Đã thống kê ${summaryData.totalProducts} sản phẩm từ ${summaryData.totalOrders} đơn hàng`, 'success');
        }

    } catch (error) {
        console.error('[PRODUCT-STATS] Error running stats:', error);
        modalBody.innerHTML = `
            <div class="stats-empty-state">
                <i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>
                <p>Lỗi khi thống kê: ${error.message}</p>
            </div>
        `;
    } finally {
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.innerHTML = '<i class="fas fa-play"></i> Thống kê';
        }
    }
}

/**
 * Toggle stats summary collapse/expand
 */
function toggleStatsSummary(element) {
    element.classList.toggle('collapsed');
    const tableContainer = element.nextElementSibling;
    if (tableContainer) {
        tableContainer.style.display = element.classList.contains('collapsed') ? 'none' : 'block';
    }
}

// Make functions globally accessible
window.openProductStatsModal = openProductStatsModal;
window.closeProductStatsModal = closeProductStatsModal;
window.runProductStats = runProductStats;
window.toggleStatsSummary = toggleStatsSummary;

// =====================================================
// QR CODE MAPPING FOR ORDERS
// Mapping giữa SĐT và mã QR từ balance-history
// =====================================================

const QR_CACHE_KEY = 'orders_phone_qr_cache';
const QR_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

/**
 * Normalize phone number for consistent lookup
 * @param {string} phone - Raw phone number
 * @returns {string} Normalized phone number
 */
function normalizePhoneForQR(phone) {
    if (!phone) return '';
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    // Handle Vietnam country code: replace leading 84 with 0
    if (cleaned.startsWith('84') && cleaned.length > 9) {
        cleaned = '0' + cleaned.substring(2);
    }
    return cleaned;
}

/**
 * Get QR cache from localStorage
 * @returns {Object} Cache object { phone: { uniqueCode, createdAt, synced } }
 */
function getQRCache() {
    try {
        const cache = localStorage.getItem(QR_CACHE_KEY);
        return cache ? JSON.parse(cache) : {};
    } catch (e) {
        console.error('[QR] Error reading cache:', e);
        return {};
    }
}

/**
 * Save QR cache to localStorage
 * @param {Object} cache - Cache object to save
 */
function saveQRCache(cache) {
    try {
        localStorage.setItem(QR_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error('[QR] Error saving cache:', e);
    }
}

/**
 * Generate unique QR code (same format as balance-history)
 * Format: N2 + 16 characters (total 18 chars) - Base36 encoded
 * @returns {string} Unique code like "N2ABCD1234EFGH5678"
 */
function generateUniqueCode() {
    const timestamp = Date.now().toString(36).toUpperCase().slice(-8); // 8 chars
    const random = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 chars
    const sequence = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0'); // 2 chars
    return `N2${timestamp}${random}${sequence}`; // N2 (2) + 8 + 6 + 2 = 18 chars
}

/**
 * Get QR code for phone from cache
 * @param {string} phone - Phone number
 * @returns {string|null} Unique code or null
 */
function getQRFromCache(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return null;

    const cache = getQRCache();
    return cache[normalizedPhone]?.uniqueCode || null;
}

/**
 * Save QR code to cache
 * @param {string} phone - Phone number
 * @param {string} uniqueCode - QR unique code
 * @param {boolean} synced - Whether synced to API
 */
function saveQRToCache(phone, uniqueCode, synced = false) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone || !uniqueCode) return;

    const cache = getQRCache();
    cache[normalizedPhone] = {
        uniqueCode: uniqueCode,
        createdAt: new Date().toISOString(),
        synced: synced
    };
    saveQRCache(cache);
}

/**
 * Fetch QR codes from balance-history API and populate cache
 * Called once when page loads
 */
async function syncQRFromBalanceHistory() {
    try {
        console.log('[QR] Syncing from balance-history API...');
        const response = await fetch(`${QR_API_URL}/api/sepay/customer-info`);
        const result = await response.json();

        if (result.success && result.data) {
            const cache = getQRCache();
            let newCount = 0;

            result.data.forEach(item => {
                if (item.customer_phone && item.unique_code) {
                    const normalizedPhone = normalizePhoneForQR(item.customer_phone);
                    if (normalizedPhone && !cache[normalizedPhone]) {
                        cache[normalizedPhone] = {
                            uniqueCode: item.unique_code,
                            createdAt: item.updated_at || new Date().toISOString(),
                            synced: true
                        };
                        newCount++;
                    }
                }
            });

            saveQRCache(cache);
            console.log(`[QR] ✅ Synced ${newCount} new phone-QR mappings from balance-history`);
        }
    } catch (error) {
        console.error('[QR] Failed to sync from balance-history:', error);
    }
}

/**
 * Save QR mapping to balance-history API
 * @param {string} phone - Phone number
 * @param {string} uniqueCode - QR unique code
 */
async function syncQRToBalanceHistory(phone, uniqueCode) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone || !uniqueCode) return;

    try {
        const response = await fetch(`${QR_API_URL}/api/sepay/customer-info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uniqueCode: uniqueCode,
                customerName: '',
                customerPhone: normalizedPhone
            })
        });

        const result = await response.json();

        if (result.success) {
            // Update cache to mark as synced
            saveQRToCache(normalizedPhone, uniqueCode, true);
            console.log(`[QR] ✅ Synced to balance-history: ${normalizedPhone} → ${uniqueCode}`);
        } else {
            console.error('[QR] Failed to sync to balance-history:', result.error);
        }
    } catch (error) {
        console.error('[QR] Error syncing to balance-history:', error);
    }
}

/**
 * Get or create QR code for a phone number
 * @param {string} phone - Phone number
 * @returns {string|null} Unique code or null if no phone
 */
function getOrCreateQRForPhone(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return null;

    // 1. Check cache first
    let uniqueCode = getQRFromCache(normalizedPhone);

    if (!uniqueCode) {
        // 2. Create new code
        uniqueCode = generateUniqueCode();

        // 3. Save to cache
        saveQRToCache(normalizedPhone, uniqueCode, false);

        // 4. Sync to balance-history API (async, don't wait)
        syncQRToBalanceHistory(normalizedPhone, uniqueCode);

        console.log(`[QR] Created new QR for ${normalizedPhone}: ${uniqueCode}`);
    }

    return uniqueCode;
}

/**
 * Copy QR code to clipboard
 * @param {string} phone - Phone number to get QR for
 */
async function copyQRCode(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) {
        showNotification('Không có số điện thoại', 'warning');
        return;
    }

    const uniqueCode = getOrCreateQRForPhone(normalizedPhone);

    if (!uniqueCode) {
        showNotification('Không thể tạo mã QR', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(uniqueCode);
        showNotification('Đã copy QR', 'success');
    } catch (error) {
        // Fallback for older browsers
        try {
            const textarea = document.createElement('textarea');
            textarea.value = uniqueCode;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showNotification('Đã copy QR', 'success');
        } catch (fallbackError) {
            console.error('[QR] Copy failed:', fallbackError);
            showNotification('Không thể copy', 'error');
        }
    }
}

/**
 * Render QR column HTML
 * @param {string} phone - Phone number
 * @returns {string} HTML string for QR column
 */
function renderQRColumn(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);

    if (!normalizedPhone) {
        // No phone number - show disabled button
        return `
            <button class="btn-qr" disabled title="Không có SĐT" style="
                padding: 4px 10px;
                border: none;
                border-radius: 4px;
                cursor: not-allowed;
                background: #e5e7eb;
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
            ">
                QR
            </button>
        `;
    }

    // Check if QR exists in cache
    const existingQR = getQRFromCache(normalizedPhone);
    const hasQR = !!existingQR;

    return `
        <button class="btn-qr ${hasQR ? 'has-qr' : ''}"
                onclick="showOrderQRModal('${normalizedPhone}'); event.stopPropagation();"
                title="${hasQR ? 'Xem QR: ' + existingQR : 'Tạo QR mới'}"
                style="
                    padding: 4px 10px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    background: ${hasQR ? '#10b981' : '#3b82f6'};
                    color: white;
                    font-size: 11px;
                    font-weight: 600;
                    transition: all 0.2s;
                "
                onmouseover="this.style.opacity='0.8'"
                onmouseout="this.style.opacity='1'">
            QR
        </button>
    `;
}

/**
 * Show notification (uses existing notification system if available)
 * @param {string} message - Message to show
 * @param {string} type - 'success', 'error', 'warning', 'info'
 */
function showNotification(message, type = 'info') {
    // Try to use existing notification system
    if (window.NotificationManager && window.NotificationManager.show) {
        window.NotificationManager.show(message, type);
        return;
    }

    // Fallback: create simple toast notification
    const toast = document.createElement('div');
    toast.className = `qr-toast qr-toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
    `;

    document.body.appendChild(toast);

    // Auto remove after 2 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Add CSS animation for toast
const toastStyle = document.createElement('style');
toastStyle.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(toastStyle);

// Initialize: Sync QR data from balance-history when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Delay sync to let page load first
    setTimeout(() => {
        syncQRFromBalanceHistory();
    }, 2000);
});

// =====================================================
// QR MODAL FUNCTIONS
// =====================================================

// Bank configuration (same as balance-history)
const QR_BANK_CONFIG = {
    bin: '970416',
    name: 'ACB',
    accountNo: '93616',
    accountName: 'LAI THUY YEN NHI'
};

/**
 * Generate VietQR URL for bank transfer
 * @param {string} uniqueCode - Unique transaction code
 * @param {number} amount - Transfer amount (optional)
 * @returns {string} VietQR image URL
 */
function generateVietQRUrl(uniqueCode, amount = 0) {
    const baseUrl = 'https://img.vietqr.io/image';
    let url = `${baseUrl}/${QR_BANK_CONFIG.bin}-${QR_BANK_CONFIG.accountNo}-compact2.png`;

    const params = new URLSearchParams();
    if (amount > 0) {
        params.append('amount', amount);
    }
    params.append('addInfo', uniqueCode);
    params.append('accountName', QR_BANK_CONFIG.accountName);

    return `${url}?${params.toString()}`;
}

/**
 * Show QR Modal for a phone number
 * @param {string} phone - Phone number
 */
function showOrderQRModal(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) {
        showNotification('Không có số điện thoại', 'warning');
        return;
    }

    // Get or create QR code
    const uniqueCode = getOrCreateQRForPhone(normalizedPhone);
    if (!uniqueCode) {
        showNotification('Không thể tạo mã QR', 'error');
        return;
    }

    // Generate QR URL
    const qrUrl = generateVietQRUrl(uniqueCode);

    // Get modal elements
    const modal = document.getElementById('orderQRModal');
    const modalBody = document.getElementById('orderQRModalBody');

    // Render modal content
    modalBody.innerHTML = `
        <img src="${qrUrl}" alt="QR Code" style="width: 280px; max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">

        <div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; text-align: left; font-size: 13px;">
            <div style="margin-bottom: 8px;">
                <strong>Ngân hàng:</strong> ${QR_BANK_CONFIG.name}<br>
                <strong>Số TK:</strong> ${QR_BANK_CONFIG.accountNo}<br>
                <strong>Chủ TK:</strong> ${QR_BANK_CONFIG.accountName}
            </div>
            <div style="padding: 8px; background: white; border: 2px dashed #dee2e6; border-radius: 6px; font-family: monospace; font-size: 13px; font-weight: bold; color: #495057; text-align: center;">
                ${uniqueCode}
            </div>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button onclick="copyQRCodeFromModal('${uniqueCode}')" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
                <i class="fas fa-copy"></i> Copy mã
            </button>
            <button onclick="copyQRImageUrl('${qrUrl}')" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
                <i class="fas fa-image"></i> Copy URL
            </button>
        </div>

        <div style="margin-top: 12px; padding: 10px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; font-size: 12px; color: #92400e; text-align: left;">
            <strong>Lưu ý:</strong> Khách hàng cần nhập đúng mã <strong>${uniqueCode}</strong> khi chuyển khoản.
        </div>
    `;

    // Show modal
    modal.style.display = 'flex';
}

/**
 * Close QR Modal
 */
function closeOrderQRModal() {
    const modal = document.getElementById('orderQRModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Copy QR code from modal
 * @param {string} uniqueCode - QR code to copy
 */
async function copyQRCodeFromModal(uniqueCode) {
    try {
        await navigator.clipboard.writeText(uniqueCode);
        showNotification('Đã copy QR', 'success');
    } catch (error) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = uniqueCode;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Đã copy QR', 'success');
    }
}

/**
 * Copy QR image URL
 * @param {string} url - URL to copy
 */
async function copyQRImageUrl(url) {
    try {
        await navigator.clipboard.writeText(url);
        showNotification('Đã copy URL', 'success');
    } catch (error) {
        showNotification('Không thể copy', 'error');
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const modal = document.getElementById('orderQRModal');
    if (modal && event.target === modal) {
        closeOrderQRModal();
    }
});

// =====================================================
// DEBT (CÔNG NỢ) FUNCTIONS
// =====================================================

const DEBT_CACHE_KEY = 'orders_phone_debt_cache';
const DEBT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get debt cache from localStorage
 * @returns {Object} Cache object { phone: { totalDebt, lastFetched } }
 */
function getDebtCache() {
    try {
        const cache = localStorage.getItem(DEBT_CACHE_KEY);
        return cache ? JSON.parse(cache) : {};
    } catch (e) {
        console.error('[DEBT] Error reading cache:', e);
        return {};
    }
}

/**
 * Save debt cache to localStorage
 * @param {Object} cache - Cache object to save
 */
function saveDebtCache(cache) {
    try {
        localStorage.setItem(DEBT_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error('[DEBT] Error saving cache:', e);
    }
}

/**
 * Get cached debt for a phone number
 * @param {string} phone - Phone number
 * @returns {number|null} Total debt or null if not cached/expired
 */
function getCachedDebt(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return null;

    const cache = getDebtCache();
    const cached = cache[normalizedPhone];

    if (cached && (Date.now() - cached.lastFetched) < DEBT_CACHE_TTL) {
        return cached.totalDebt;
    }

    return null;
}

/**
 * Save debt to cache
 * @param {string} phone - Phone number
 * @param {number} totalDebt - Total debt amount
 */
function saveDebtToCache(phone, totalDebt) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return;

    const cache = getDebtCache();
    cache[normalizedPhone] = {
        totalDebt: totalDebt,
        lastFetched: Date.now()
    };
    saveDebtCache(cache);
}

/**
 * Fetch debt from API for a phone number
 * @param {string} phone - Phone number
 * @returns {Promise<number>} Total debt
 */
async function fetchDebtForPhone(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return 0;

    try {
        const response = await fetch(`${QR_API_URL}/api/sepay/debt-summary?phone=${encodeURIComponent(normalizedPhone)}`);
        const result = await response.json();

        if (result.success && result.data) {
            const totalDebt = result.data.total_debt || 0;
            saveDebtToCache(normalizedPhone, totalDebt);
            return totalDebt;
        }
    } catch (error) {
        console.error('[DEBT] Error fetching:', error);
    }

    return 0;
}

/**
 * Format currency for display
 * @param {number} amount - Amount
 * @returns {string} Formatted string
 */
function formatDebtCurrency(amount) {
    if (!amount || amount === 0) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

/**
 * Render debt column HTML
 * @param {string} phone - Phone number
 * @returns {string} HTML string for debt column
 */
function renderDebtColumn(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);

    if (!normalizedPhone) {
        return `<span style="color: #9ca3af;">-</span>`;
    }

    // Check cache first
    const cachedDebt = getCachedDebt(normalizedPhone);

    if (cachedDebt !== null) {
        // Has cached value
        const color = cachedDebt > 0 ? '#10b981' : '#9ca3af';
        return `<span style="color: ${color}; font-weight: 500; font-size: 12px;">${formatDebtCurrency(cachedDebt)}</span>`;
    }

    // No cache - show loading and fetch async
    fetchDebtForPhone(normalizedPhone).then(debt => {
        // Update all cells with this phone number after fetch
        updateDebtCells(normalizedPhone, debt);
    });

    return `<span class="debt-loading" data-phone="${normalizedPhone}" style="color: #9ca3af; font-size: 11px;"><i class="fas fa-spinner fa-spin"></i></span>`;
}

/**
 * Update all debt cells with a specific phone number
 * @param {string} phone - Normalized phone number
 * @param {number} debt - Debt amount
 */
function updateDebtCells(phone, debt) {
    const color = debt > 0 ? '#10b981' : '#9ca3af';
    const html = `<span style="color: ${color}; font-weight: 500; font-size: 12px;">${formatDebtCurrency(debt)}</span>`;

    // Find all loading cells with this phone and update them
    document.querySelectorAll(`.debt-loading[data-phone="${phone}"]`).forEach(cell => {
        cell.outerHTML = html;
    });
}

/**
 * Batch fetch debts for multiple phones (call after table render)
 * @param {Array<string>} phones - Array of phone numbers
 */
async function batchFetchDebts(phones) {
    const uniquePhones = [...new Set(phones.map(p => normalizePhoneForQR(p)).filter(p => p))];
    const uncachedPhones = uniquePhones.filter(p => getCachedDebt(p) === null);

    if (uncachedPhones.length === 0) return;

    console.log(`[DEBT] Batch fetching ${uncachedPhones.length} phones...`);

    // Fetch in parallel (limit to 10 concurrent)
    const batchSize = 10;
    for (let i = 0; i < uncachedPhones.length; i += batchSize) {
        const batch = uncachedPhones.slice(i, i + batchSize);
        await Promise.all(batch.map(phone => fetchDebtForPhone(phone)));
    }
}

// Make QR and Debt functions globally accessible
window.copyQRCode = copyQRCode;
window.getOrCreateQRForPhone = getOrCreateQRForPhone;
window.renderQRColumn = renderQRColumn;
window.syncQRFromBalanceHistory = syncQRFromBalanceHistory;
window.showOrderQRModal = showOrderQRModal;
window.closeOrderQRModal = closeOrderQRModal;
window.copyQRCodeFromModal = copyQRCodeFromModal;
window.copyQRImageUrl = copyQRImageUrl;
window.renderDebtColumn = renderDebtColumn;
window.fetchDebtForPhone = fetchDebtForPhone;
window.batchFetchDebts = batchFetchDebts;
