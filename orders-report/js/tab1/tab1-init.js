// #region ═══════════════════════════════════════════════════════════════════════
// ║                        SECTION 3: INITIALIZATION                            ║
// ║                            search: #INIT                                    ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// INITIALIZATION #INIT
// =====================================================
window.addEventListener("DOMContentLoaded", async function () {
    // Apply orders table font size from settings
    const ordersTableFontSize = localStorage.getItem("ordersTableFontSize") || "14";
    document.documentElement.style.setProperty("--orders-table-font-size", `${ordersTableFontSize}px`);

    // Listen for font size changes from parent window
    window.addEventListener("storage", (e) => {
        if (e.key === "ordersTableFontSize") {
            document.documentElement.style.setProperty("--orders-table-font-size", `${e.newValue}px`);
        }
    });

    // 🧹 Clean up localStorage if near quota to prevent QuotaExceededError
    (function cleanupLocalStorageIfNeeded() {
        try {
            // Estimate current localStorage usage
            let totalSize = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    totalSize += localStorage[key].length + key.length;
                }
            }
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

            // If over 4MB (localStorage limit is usually 5-10MB), clean up
            if (totalSize > 4 * 1024 * 1024) {
                console.warn('[STORAGE] ⚠️ localStorage near quota, cleaning up...');

                // Keys to clean (low priority / can be regenerated)
                const keysToClean = [];
                for (let key in localStorage) {
                    if (localStorage.hasOwnProperty(key)) {
                        // Clean Firebase websocket failure logs
                        if (key.startsWith('firebase:')) {
                            keysToClean.push(key);
                        }
                        // Clean old standard price cache (large data)
                        if (key === 'standard_price_cache' && localStorage[key].length > 500000) {
                            keysToClean.push(key);
                        }
                        // Clean old product cache
                        if (key === 'product_excel_cache' && localStorage[key].length > 500000) {
                            keysToClean.push(key);
                        }
                    }
                }

                keysToClean.forEach(key => {
                    localStorage.removeItem(key);
                });
            }
        } catch (e) {
            console.warn('[STORAGE] Error checking localStorage:', e);
        }
    })();

    if (window.cacheManager) {
        window.cacheManager.clear("orders");
        window.cacheManager.clear("campaigns");
    }

    // Check and complete any pending held products cleanup from previous session
    if (typeof window.checkPendingHeldCleanup === 'function') {
        window.checkPendingHeldCleanup();
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

    // 🎯 Event listener for custom date filter - auto-search when date changes
    document
        .getElementById("customStartDate")
        .addEventListener("change", handleCustomDateChange);

    // 🎯 Event listener for custom end date - trigger search when manually changed
    const customEndDateInput = document.getElementById("customEndDate");
    if (customEndDateInput) {
        customEndDateInput.addEventListener("change", handleCustomEndDateChange);
    }

    // Event listener for employee campaign selector
    const employeeCampaignSelector = document.getElementById('employeeCampaignSelector');
    if (employeeCampaignSelector) {
        employeeCampaignSelector.addEventListener('change', function (e) {
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (selectedOption && selectedOption.dataset.campaign) {
                const campaign = JSON.parse(selectedOption.dataset.campaign);
                loadEmployeeRangesForCampaign(campaign.displayName).then(() => {
                    // Re-render table with new ranges
                    if (window.userEmployeeLoader && window.userEmployeeLoader.getUsers().length > 0) {
                        renderEmployeeTable(window.userEmployeeLoader.getUsers());
                    }
                });
            }
        });
    }

    // Initialize TPOS Token Manager Firebase connection
    if (window.tokenManager) {
        if (!window.tokenManager.retryFirebaseInit()) {
            console.warn('[TOKEN] Firebase still not available, using localStorage only');
        }
    }

    // Initialize Pancake Token Manager & Data Manager
    // ⚡ OPTIMIZED: Start Pancake init in PARALLEL with orders loading
    // Chat columns will show "-" initially, then re-render when Pancake is ready
    let pancakeInitPromise = null;
    if (window.pancakeTokenManager && window.pancakeDataManager) {
        // Initialize token manager first (sync)
        window.pancakeTokenManager.initialize();

        // Start data manager init but DON'T WAIT - run in parallel with orders loading
        pancakeInitPromise = window.pancakeDataManager.initialize()
            .then(async success => {
                if (success) {
                    // Set chatDataManager alias for compatibility
                    window.chatDataManager = window.pancakeDataManager;
                    // Connect WebSocket for realtime messages
                    _connectRealtimeWebSocket();
                } else {
                    console.warn('[PANCAKE] ⚠️ PancakeDataManager initialization failed');
                    console.warn('[PANCAKE] Please set JWT token in Pancake Settings');
                }
                return success;
            })
            .catch(error => {
                console.error('[PANCAKE] ❌ Error initializing PancakeDataManager:', error);
                return false;
            });
    } else {
        console.warn('[PANCAKE] ⚠️ Pancake managers not available');
    }
    // Initialize Realtime Manager (instance already created by realtime-manager.js)
    if (window.realtimeManager) {
        window.realtimeManager.initialize();
    } else {
        console.warn('[REALTIME] ⚠️ RealtimeManager not available');
    }

    // Connect WebSocket to Pancake for realtime messages
    async function _connectRealtimeWebSocket() {
        const ptm = window.pancakeTokenManager;
        const pdm = window.pancakeDataManager;
        if (!ptm || !pdm || !window.realtimeManager) return;
        try {
            const token = await ptm.getToken();
            if (!token) return;
            const decoded = ptm.decodeToken(token);
            const userId = decoded?.uid || decoded?.user_id || decoded?.id;
            const pageIds = pdm.pageIds || [];
            if (!userId || !pageIds.length) {
                console.warn('[REALTIME] Missing userId or pageIds for WebSocket');
                return;
            }
            await window.realtimeManager.initWebSocket({ accessToken: token, userId, pageIds });
        } catch (e) {
            console.warn('[REALTIME] WebSocket connect error:', e.message);
        }
    }

    // =====================================================
    // OFFLINE PENDING CUSTOMERS - Fetch from server on startup
    // =====================================================
    async function _fetchOfflinePendingCustomers() {
        try {
            const API_BASE = 'https://n2store-fallback.onrender.com';
            const resp = await fetch(`${API_BASE}/api/realtime/pending-customers?limit=500`);
            if (!resp.ok) return;
            const data = await resp.json();
            if (!data.success || !data.customers?.length) return;

            // Transform server format → notifier format
            const pending = data.customers.map(c => ({
                psid: c.psid,
                pageId: c.page_id,
                inboxCount: c.type === 'INBOX' ? (c.message_count || 1) : 0,
                commentCount: c.type === 'COMMENT' ? (c.message_count || 1) : 0,
                snippet: c.last_message_snippet || '',
                timestamp: c.last_message_time ? new Date(c.last_message_time).getTime() : Date.now(),
            }));

            // Group by psid (server may have separate INBOX + COMMENT rows)
            const grouped = new Map();
            pending.forEach(p => {
                const existing = grouped.get(p.psid);
                if (existing) {
                    existing.inboxCount += p.inboxCount;
                    existing.commentCount += p.commentCount;
                    if (p.timestamp > existing.timestamp) {
                        existing.snippet = p.snippet;
                        existing.timestamp = p.timestamp;
                    }
                } else {
                    grouped.set(p.psid, { ...p });
                }
            });

            window.newMessagesNotifier?.setPendingCustomers([...grouped.values()]);
        } catch (e) {
            console.warn('[Init] Failed to fetch offline pending:', e.message);
        }
    }

    // Re-fetch pending on WebSocket reconnect (may have missed events)
    window.addEventListener('realtimeStatusChanged', (e) => {
        if (e.detail.connected) {
            setTimeout(() => _fetchOfflinePendingCustomers(), 2000);
        }
    });

    // ⚡ OPTIMIZATION FIX: Defer TAG/KPI BASE listeners to reduce initial blocking
    // Previous: Setup immediately, blocking DOMContentLoaded
    // New: Defer by 1 second to allow UI to render first
    if (database) {
        setTimeout(() => {
            setupTagRealtimeListeners();

            // TEMPORARILY DISABLED - KPI BASE feature
            // console.log('[KPI-BASE] Setting up KPI BASE listeners (deferred)...');
            // setupKPIBaseRealtimeListener();
            // preloadKPIBaseStatus(); // Preload BASE status for all orders
        }, 1000); // Defer 1 second
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

    // 🎯 ĐƠN GIẢN HÓA: Dùng Campaign System mới (merged)
    // Flow: Load campaigns → Check active → Fetch orders (1 lần duy nhất)

    // ⚡ OPTIMIZATION FIX: Make initializeApp() non-blocking
    // Previous: await initializeApp() blocked everything
    // New: Run in background, show loading indicator
    initializeApp().then(() => {
        // Fetch offline pending customers after table is rendered
        _fetchOfflinePendingCustomers();
    }).catch(err => {
        console.error('[APP] ❌ Initialization failed:', err);
        alert('Lỗi khởi tạo ứng dụng. Vui lòng refresh lại trang.');
    });

    // ⚡ PHASE 1 OPTIMIZATION: After orders loaded, wait for Pancake and re-render chat columns
    if (pancakeInitPromise) {
        pancakeInitPromise.then(success => {
            if (success && allData.length > 0 && window.chatDataManager) {
                // Re-render table to show chat columns now that chatDataManager is ready
                performTableSearch();
            }
        });
    }

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

    // ⚡ NEW: Listen for token requests from Overview tab (via main.html)
    window.addEventListener('message', async function (event) {
        if (event.data.type === 'REQUEST_TOKEN') {
            try {
                if (!window.tokenManager) {
                    throw new Error('tokenManager not available');
                }
                const token = await window.tokenManager.getToken();
                window.parent.postMessage({
                    type: 'TOKEN_RESPONSE',
                    requestId: event.data.requestId,
                    token: token
                }, '*');
            } catch (error) {
                console.error('[TAB1] ❌ Error getting token:', error);
                window.parent.postMessage({
                    type: 'TOKEN_RESPONSE',
                    requestId: event.data.requestId,
                    error: error.message
                }, '*');
            }
        }

        // Handle orders data request from Tab3 (fallback when IndexedDB unavailable)
        if (event.data.type === 'REQUEST_ORDERS_DATA') {
            const rawOrders = window.getAllOrders ? window.getAllOrders() : [];
            // Transform to Tab3-compatible format
            const orders = rawOrders.map((order, index) => ({
                stt: order.SessionIndex || (index + 1).toString(),
                orderId: order.Id,
                orderCode: order.Code,
                customerName: order.PartnerName || order.Name,
                phone: order.PartnerPhone || order.Telephone,
                address: order.PartnerAddress || order.Address,
                totalAmount: order.TotalAmount || order.AmountTotal || 0,
                quantity: order.TotalQuantity || 0,
                note: order.Note,
                state: order.Status || order.State,
                dateOrder: order.DateCreated || order.DateOrder,
                Tags: order.Tags,
                liveCampaignName: order.LiveCampaignName
            }));
            window.parent.postMessage({
                type: 'ORDERS_DATA_RESPONSE_TAB3',
                orders: orders
            }, '*');
        }

        // Handle orders data request from Overview tab
        if (event.data.type === 'REQUEST_ORDERS_DATA_FROM_OVERVIEW') {
            const orders = window.getAllOrders ? window.getAllOrders() : [];
            // Get current table name from campaign manager
            const campaign = window.campaignManager?.activeCampaign;
            const tableName = campaign?.name || localStorage.getItem('orders_table_name') || 'Bảng 1';

            // Serialize ProcessingTagState data for overview statistics
            const ptagData = {};
            if (window.ProcessingTagState) {
                for (const [code, data] of window.ProcessingTagState.getAllOrders()) {
                    ptagData[code] = {
                        category: data.category,
                        subTag: data.subTag,
                        subState: data.subState,
                        flags: data.flags || [],
                        tTags: data.tTags || []
                    };
                }
            }

            window.parent.postMessage({
                type: 'ORDERS_DATA_RESPONSE_OVERVIEW',
                orders: orders,
                tableName: tableName,
                processingTags: ptagData
            }, '*');
        }

        // Handle retail sale from Social tab
        if (event.data.type === 'OPEN_RETAIL_SALE_FROM_SOCIAL') {
            openSaleModalFromSocialOrder(event.data.orderData);
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
// INITIALIZE APP (MERGED & OPTIMIZED FLOW)
// =====================================================
/**
 * Hàm khởi tạo tối ưu - Load campaign trước, sau đó fetch orders 1 lần duy nhất
 * Flow:
 *   1. Wait for Firebase
 *   2. Load data parallel (campaigns, activeCampaignId, employeeRanges)
 *   3. Check active campaign FIRST (fast path)
 *   4. If no dates → show modal
 *   5. Fetch orders 1 lần duy nhất
 */
/**
 * Wait for Firebase auth state to resolve (handles incognito/new sessions)
 * Returns the current user (or null if not authenticated)
 */
function waitForAuthState() {
    return new Promise((resolve) => {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            resolve(null);
            return;
        }
        // If auth already resolved, return immediately
        const currentUser = firebase.auth().currentUser;
        if (currentUser !== undefined) {
            // currentUser is null (not logged in) or a user object - either way auth has resolved
            // But we still need to wait for onAuthStateChanged to fire at least once
        }
        // Use onAuthStateChanged to wait for auth to fully initialize
        const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
            unsubscribe(); // Unsubscribe immediately after first call
            resolve(user);
        });
        // Timeout after 5 seconds to avoid blocking forever
        setTimeout(() => {
            unsubscribe();
            resolve(firebase.auth().currentUser);
        }, 5000);
    });
}

let appInitialized = false; // Guard flag
// ⚡ OPTIMIZATION FIX: Track Firebase wait attempts to prevent infinite loops
let firebaseWaitAttempts = 0;
const MAX_FIREBASE_WAIT_ATTEMPTS = 20; // 20 × 500ms = 10 seconds max

async function initializeApp() {
    // Prevent duplicate initialization
    if (appInitialized) {
        return;
    }
    appInitialized = true;

    try {
        // 1. Wait for Firebase to be ready (with timeout)
        if (typeof firebase === 'undefined' || !firebase.database) {
            firebaseWaitAttempts++;

            if (firebaseWaitAttempts >= MAX_FIREBASE_WAIT_ATTEMPTS) {
                console.error('[APP] ❌ Firebase failed to load after 10 seconds');
                appInitialized = false;
                alert('Không thể kết nối Firebase. Vui lòng kiểm tra kết nối mạng và refresh lại trang.');
                return;
            }

            appInitialized = false; // Reset flag so it can retry
            setTimeout(initializeApp, 500);
            return;
        }

        // Reset counter on successful Firebase connection
        firebaseWaitAttempts = 0;

        // 1.5. Wait for Firebase Auth to resolve (critical for incognito tabs)
        // Without this, currentUser is null and we get a wrong userId from localStorage
        const authUser = await waitForAuthState();

        // Set current user ID
        window.campaignManager = window.campaignManager || {
            allCampaigns: {},
            activeCampaignId: null,
            activeCampaign: null,
            currentUserId: null,
            initialized: false
        };
        window.campaignManager.currentUserId = getCurrentUserId();

        // 2. Load data in PARALLEL for speed
        const [campaigns, activeCampaignId, _] = await Promise.all([
            loadAllCampaigns(),
            loadActiveCampaignId(),
            Promise.resolve() // Employee ranges loaded per-campaign, not globally
        ]);

        // 3. ⭐ CHECK ACTIVE CAMPAIGN FIRST (Fast path)
        if (activeCampaignId && campaigns[activeCampaignId]) {
            const campaign = campaigns[activeCampaignId];

            // Check if campaign has dates
            if (campaign.customStartDate) {
                // ✅ Happy path - Load ngay!
                await continueAfterCampaignSelect(activeCampaignId);
                return;
            } else {
                // ❌ Campaign doesn't have dates
                showCampaignNoDatesModal(activeCampaignId);
                return;
            }
        }

        // 4. No active campaign → Check if campaigns exist to show selection
        if (Object.keys(campaigns).length > 0) {
            // Campaigns exist but no active campaign saved → show selection modal
            showSelectCampaignModal();
            return;
        }

        // 5. No campaigns exist at all → show create modal
        showNoCampaignsModal();

    } catch (error) {
        console.error('[APP] ❌ Initialization error:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi khởi tạo: ' + error.message);
        }
    }
}

/**
 * Get current user ID (helper)
 */
function getCurrentUserId() {
    // Try to get from Firebase auth
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        return firebase.auth().currentUser.uid;
    }
    // Fallback to localStorage or generate one
    let userId = localStorage.getItem('orders_campaign_user_id');
    if (!userId) {
        userId = 'user_' + Date.now();
        localStorage.setItem('orders_campaign_user_id', userId);
    }
    return userId;
}

/**
 * Load active campaign ID from Firestore
 * Note: Must use Firestore to match saveActiveCampaign() in tab1-campaign-system.js
 */
async function loadActiveCampaignId() {
    try {
        const db = firebase.firestore();
        const userId = window.campaignManager.currentUserId;
        const docSnapshot = await db.collection('user_preferences').doc(userId).get();
        const activeCampaignId = docSnapshot.exists ? docSnapshot.data().activeCampaignId : null;

        window.campaignManager.activeCampaignId = activeCampaignId;
        if (activeCampaignId && window.campaignManager.allCampaigns[activeCampaignId]) {
            window.campaignManager.activeCampaign = window.campaignManager.allCampaigns[activeCampaignId];
        }

        return activeCampaignId;
    } catch (error) {
        console.error('[APP] Error loading active campaign:', error);
        return null;
    }
}

/**
 * Continue after user selects/creates a campaign
 * This function handles:
 * - Setting dates from campaign
 * - Updating UI
 * - Fetching orders (1 time only)
 * - Connecting realtime
 */
async function continueAfterCampaignSelect(campaignId) {
    try {
        const campaign = window.campaignManager.allCampaigns[campaignId];
        if (!campaign) {
            console.error('[APP] Campaign not found:', campaignId);
            return;
        }

        // Set global state
        window.campaignManager.activeCampaignId = campaignId;
        window.campaignManager.activeCampaign = campaign;
        window.campaignManager.initialized = true;

        // Get dates from campaign
        const startDate = campaign.customStartDate;
        const endDate = campaign.customEndDate || '';

        // Set dates to all input fields
        const customStartDateInput = document.getElementById('customStartDate');
        const customEndDateInput = document.getElementById('customEndDate');
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');

        if (customStartDateInput) customStartDateInput.value = startDate;
        if (customEndDateInput) customEndDateInput.value = endDate;
        if (startDateInput) startDateInput.value = startDate;
        if (endDateInput) endDateInput.value = endDate;

        // Set selectedCampaign to custom mode
        selectedCampaign = { isCustom: true };

        // Check if date mode is enabled - override campaign dates
        if (typeof window.initDateMode === 'function') {
            const dateModeActive = await window.initDateMode();
            // date mode active - using date mode dates instead of campaign dates
        }

        // Update UI label
        updateActiveCampaignLabel(campaign.name);

        // Update modal dropdown
        const modalSelect = document.getElementById('modalUserCampaignSelect');
        if (modalSelect) {
            modalSelect.value = campaignId;
        }

        // Show notification
        if (window.notificationManager) {
            const startDisplay = new Date(startDate).toLocaleDateString('vi-VN');
            const endDisplay = endDate ? new Date(endDate).toLocaleDateString('vi-VN') : 'N/A';
            window.notificationManager.info(
                `Đang tải đơn hàng: ${startDisplay} - ${endDisplay}`,
                2000
            );
        }

        // ⭐ CRITICAL: Load employee ranges for this campaign BEFORE fetching orders
        // This ensures the filter works correctly from the start
        if (typeof loadEmployeeRangesForCampaign === 'function') {
            await loadEmployeeRangesForCampaign(campaign.name);
        } else {
            console.warn('[APP] loadEmployeeRangesForCampaign function not available');
        }


        // ⭐ FETCH ORDERS (1 lần duy nhất)
        await handleSearch();

        // Connect realtime
        if (window.realtimeManager) {
            window.realtimeManager.connectServerMode();
        }

    } catch (error) {
        console.error('[APP] ❌ Error in continueAfterCampaignSelect:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi tải chiến dịch: ' + error.message);
        }
    }
}

/**
 * Update active campaign label in UI
 */
function updateActiveCampaignLabel(name) {
    const label = document.getElementById('activeCampaignLabel');
    if (label) {
        label.innerHTML = `<i class="fas fa-bullhorn"></i> ${name}`;
    }
}
// Export to window for inline HTML scripts
window.updateActiveCampaignLabel = updateActiveCampaignLabel;

