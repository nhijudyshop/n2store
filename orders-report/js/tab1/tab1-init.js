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
            console.log(`[STORAGE] Current localStorage usage: ${totalSizeMB} MB`);

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
                    console.log(`[STORAGE] Removed: ${key}`);
                });

                console.log(`[STORAGE] ✅ Cleaned ${keysToClean.length} items`);
            }
        } catch (e) {
            console.warn('[STORAGE] Error checking localStorage:', e);
        }
    })();

    console.log("[CACHE] Clearing all cache on page load...");
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
    // ⚡ OPTIMIZED: Start Pancake init in PARALLEL with orders loading
    // Chat columns will show "-" initially, then re-render when Pancake is ready
    let pancakeInitPromise = null;
    if (window.pancakeTokenManager && window.pancakeDataManager) {
        console.log('[PANCAKE] Initializing Pancake managers (background)...');

        // Initialize token manager first (sync)
        window.pancakeTokenManager.initialize();

        // Start data manager init but DON'T WAIT - run in parallel with orders loading
        pancakeInitPromise = window.pancakeDataManager.initialize()
            .then(success => {
                if (success) {
                    console.log('[PANCAKE] ✅ PancakeDataManager initialized (background)');
                    // Set chatDataManager alias for compatibility
                    window.chatDataManager = window.pancakeDataManager;
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
    // Initialize Realtime Manager
    if (window.RealtimeManager) {
        console.log('[REALTIME] Initializing RealtimeManager...');
        window.realtimeManager = new RealtimeManager();
        window.realtimeManager.initialize();
    } else {
        console.warn('[REALTIME] ⚠️ RealtimeManager class not found');
    }

    // ⚡ OPTIMIZATION FIX: Defer TAG/KPI BASE listeners to reduce initial blocking
    // Previous: Setup immediately, blocking DOMContentLoaded
    // New: Defer by 1 second to allow UI to render first
    if (database) {
        setTimeout(() => {
            console.log('[TAG-REALTIME] Setting up Firebase TAG listeners (deferred)...');
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
    console.log('[AUTO-LOAD] Khởi tạo App...');
    console.log('[AUTO-LOAD] chatDataManager available:', !!window.chatDataManager);

    // ⚡ OPTIMIZATION FIX: Make initializeApp() non-blocking
    // Previous: await initializeApp() blocked everything
    // New: Run in background, show loading indicator
    initializeApp().then(() => {
        console.log('[APP] ✅ Initialization complete');
    }).catch(err => {
        console.error('[APP] ❌ Initialization failed:', err);
        alert('Lỗi khởi tạo ứng dụng. Vui lòng refresh lại trang.');
    });

    // ⚡ PHASE 1 OPTIMIZATION: After orders loaded, wait for Pancake and re-render chat columns
    if (pancakeInitPromise) {
        pancakeInitPromise.then(success => {
            if (success && allData.length > 0 && window.chatDataManager) {
                console.log('[PANCAKE] Re-rendering table with chat data after background init...');
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
            console.log('[TAB1] 🔑 Token requested, responding...');
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
                console.log('[TAB1] ✅ Token sent successfully');
            } catch (error) {
                console.error('[TAB1] ❌ Error getting token:', error);
                window.parent.postMessage({
                    type: 'TOKEN_RESPONSE',
                    requestId: event.data.requestId,
                    error: error.message
                }, '*');
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
let appInitialized = false; // Guard flag
// ⚡ OPTIMIZATION FIX: Track Firebase wait attempts to prevent infinite loops
let firebaseWaitAttempts = 0;
const MAX_FIREBASE_WAIT_ATTEMPTS = 20; // 20 × 500ms = 10 seconds max

async function initializeApp() {
    // Prevent duplicate initialization
    if (appInitialized) {
        console.log('[APP] Already initialized, skipping...');
        return;
    }
    appInitialized = true;

    try {
        console.log('[APP] 🚀 Initializing...');

        // 1. Wait for Firebase to be ready (with timeout)
        if (typeof firebase === 'undefined' || !firebase.database) {
            firebaseWaitAttempts++;

            if (firebaseWaitAttempts >= MAX_FIREBASE_WAIT_ATTEMPTS) {
                console.error('[APP] ❌ Firebase failed to load after 10 seconds');
                appInitialized = false;
                alert('Không thể kết nối Firebase. Vui lòng kiểm tra kết nối mạng và refresh lại trang.');
                return;
            }

            console.log(`[APP] Waiting for Firebase... (attempt ${firebaseWaitAttempts}/${MAX_FIREBASE_WAIT_ATTEMPTS})`);
            appInitialized = false; // Reset flag so it can retry
            setTimeout(initializeApp, 500);
            return;
        }

        // Reset counter on successful Firebase connection
        firebaseWaitAttempts = 0;

        // Set current user ID
        window.campaignManager = window.campaignManager || {
            allCampaigns: {},
            activeCampaignId: null,
            activeCampaign: null,
            currentUserId: null,
            initialized: false
        };
        window.campaignManager.currentUserId = getCurrentUserId();
        console.log('[APP] User ID:', window.campaignManager.currentUserId);

        // 2. Load data in PARALLEL for speed
        console.log('[APP] Loading data in parallel...');
        const [campaigns, activeCampaignId, _] = await Promise.all([
            loadAllCampaigns(),
            loadActiveCampaignId(),
            loadEmployeeRangesForCampaign(null) // Load employee ranges in parallel
        ]);
        console.log('[APP] Data loaded - Campaigns:', Object.keys(campaigns).length, 'Active:', activeCampaignId);

        // 3. ⭐ CHECK ACTIVE CAMPAIGN FIRST (Fast path)
        if (activeCampaignId && campaigns[activeCampaignId]) {
            const campaign = campaigns[activeCampaignId];
            console.log('[APP] Found active campaign:', campaign.name);

            // Check if campaign has dates
            if (campaign.customStartDate) {
                // ✅ Happy path - Load ngay!
                console.log('[APP] ✅ Fast path - Campaign has dates, loading orders...');
                await continueAfterCampaignSelect(activeCampaignId);
                return;
            } else {
                // ❌ Campaign doesn't have dates
                console.log('[APP] ⚠️ Campaign has no dates, showing modal...');
                showCampaignNoDatesModal(activeCampaignId);
                return;
            }
        }

        // 4. No active campaign → Check localStorage fallback first
        const savedFilterData = localStorage.getItem('orders_tab1_filter_data');
        if (savedFilterData) {
            try {
                const filterData = JSON.parse(savedFilterData);
                if (filterData.startDate && filterData.endDate) {
                    console.log('[APP] Found saved filter data in localStorage, using it...');

                    // Convert UTC dates to local datetime-local format
                    const startDate = new Date(filterData.startDate);
                    const endDate = new Date(filterData.endDate);

                    // Set date inputs
                    document.getElementById('customStartDate').value = formatDateTimeLocal(startDate);
                    document.getElementById('customEndDate').value = formatDateTimeLocal(endDate);

                    // Update label with date range or campaign name
                    const label = document.getElementById('activeCampaignLabel');
                    if (label) {
                        if (filterData.campaignName) {
                            label.innerHTML = `<i class="fas fa-bullhorn"></i> ${filterData.campaignName}`;
                        } else {
                            const startDisplay = startDate.toLocaleDateString('vi-VN');
                            const endDisplay = endDate.toLocaleDateString('vi-VN');
                            label.innerHTML = `<i class="fas fa-calendar-check"></i> ${startDisplay} - ${endDisplay}`;
                        }
                    }

                    // Fetch orders with saved dates (use window.fetchOrders from tab1-campaign.js)
                    if (typeof window.fetchOrders === 'function') {
                        await window.fetchOrders();
                    } else if (typeof fetchOrders === 'function') {
                        await fetchOrders();
                    }
                    return;
                }
            } catch (e) {
                console.warn('[APP] Error parsing saved filter data:', e);
            }
        }

        if (Object.keys(campaigns).length === 0) {
            // No campaigns exist
            console.log('[APP] No campaigns found, showing create modal...');
            showNoCampaignsModal();
            return;
        }

        // 5. Auto-select the most recent campaign (by creation time or name)
        const campaignEntries = Object.entries(campaigns);
        // Sort by timestamp in ID (campaign_TIMESTAMP) or by customStartDate
        campaignEntries.sort((a, b) => {
            // Extract timestamp from ID if format is campaign_TIMESTAMP
            const timestampA = parseInt(a[0].replace('campaign_', '')) || 0;
            const timestampB = parseInt(b[0].replace('campaign_', '')) || 0;
            return timestampB - timestampA; // Most recent first
        });

        const [latestCampaignId, latestCampaign] = campaignEntries[0];
        console.log('[APP] Auto-selecting most recent campaign:', latestCampaign.name);

        // Check if campaign has dates
        if (latestCampaign.customStartDate) {
            // Save as active and load
            await saveActiveCampaign(latestCampaignId);
            await continueAfterCampaignSelect(latestCampaignId);
        } else {
            // Campaign doesn't have dates, show modal to set dates
            console.log('[APP] Most recent campaign has no dates, showing modal...');
            showCampaignNoDatesModal(latestCampaignId);
        }

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
        console.log('[APP] continueAfterCampaignSelect:', campaignId);

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
        const modalCustomStartDate = document.getElementById('modalCustomStartDate');
        const modalCustomEndDate = document.getElementById('modalCustomEndDate');

        if (customStartDateInput) customStartDateInput.value = startDate;
        if (customEndDateInput) customEndDateInput.value = endDate;
        if (startDateInput) startDateInput.value = startDate;
        if (endDateInput) endDateInput.value = endDate;
        if (modalCustomStartDate) modalCustomStartDate.value = startDate;
        if (modalCustomEndDate) modalCustomEndDate.value = endDate;

        console.log('[APP] Dates set:', startDate, '->', endDate);

        // Set selectedCampaign to custom mode
        selectedCampaign = { isCustom: true };

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
        console.log('[APP] 📊 Loading employee ranges for campaign:', campaign.name);
        if (typeof loadEmployeeRangesForCampaign === 'function') {
            await loadEmployeeRangesForCampaign(campaign.name);
        } else {
            console.warn('[APP] loadEmployeeRangesForCampaign function not available');
        }

        // ⭐ FETCH ORDERS (1 lần duy nhất)
        console.log('[APP] ⭐ Fetching orders...');
        await handleSearch();

        // Connect realtime
        if (window.realtimeManager) {
            console.log('[APP] Connecting to Realtime Server...');
            window.realtimeManager.connectServerMode();
        }

        console.log('[APP] ✅ Initialization complete for campaign:', campaign.name);

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

