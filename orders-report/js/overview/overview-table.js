// =====================================================
// OVERVIEW - TABLE: Table Selection & Management
// =====================================================

// TABLE SELECTION & MANAGEMENT
// =====================================================

// Load available tables from Firebase (metadata only for dropdown)
async function loadAvailableTables() {
    if (!database) {
        console.error('[REPORT] Firebase not available');
        return;
    }

    // Prevent multiple simultaneous loads
    if (isLoadingTables) {
        console.log('[REPORT] ⏭️ Skipping loadAvailableTables - already loading');
        return;
    }

    isLoadingTables = true;

    // Show loading indicator immediately
    showCachedDetailsLoading();

    try {
        // Load both report tables and campaigns in parallel
        const [tablesSnapshot, campaignsSnapshot] = await Promise.all([
            database.collection(FIREBASE_PATH).get(),
            database.collection('campaigns').get().catch(() => null)
        ]);

        const tables = {};
        tablesSnapshot.forEach(doc => {
            tables[doc.id] = doc.data();
        });

        const selector = document.getElementById('tableSelector');
        selector.innerHTML = '<option value="">-- Chọn bảng --</option>';

        // Only extract metadata for dropdown (don't keep full orders in memory)
        const tableMetadata = {};
        const addedNames = new Set(); // Track names to avoid duplicates

        Object.keys(tables).forEach(safeTableName => {
            const tableData = tables[safeTableName];
            const originalName = tableData.tableName || safeTableName.replace(/_/g, ' ');
            const orderCount = tableData.totalOrders || tableData.orders?.length || 0;
            const fetchedAt = tableData.fetchedAt ? new Date(tableData.fetchedAt).toLocaleString('vi-VN') : '';
            const isSavedCopy = tableData.isSavedCopy || false;
            const originalCampaign = tableData.originalCampaign || null;

            // Store only metadata (not full orders array)
            tableMetadata[originalName] = {
                tableName: originalName,
                safeTableName: safeTableName,
                orderCount: orderCount,
                fetchedAt: tableData.fetchedAt,
                isSavedCopy: isSavedCopy,
                originalCampaign: originalCampaign
            };

            // Display with emoji: 📌 for main, 💾 for saved copy
            const icon = isSavedCopy ? '💾' : '📌';
            const typeLabel = isSavedCopy ? 'Bản lưu' : 'Chính';

            const option = document.createElement('option');
            option.value = originalName;
            option.textContent = `${icon} ${originalName} (${orderCount} đơn - ${fetchedAt}) [${typeLabel}]`;
            option.dataset.isSavedCopy = isSavedCopy;
            selector.appendChild(option);
            addedNames.add(originalName);
        });

        // Also add campaigns from Tab1 that don't have report data yet
        if (campaignsSnapshot) {
            campaignsSnapshot.forEach(doc => {
                const campaign = doc.data();
                const campaignName = campaign.name;
                if (campaignName && !addedNames.has(campaignName)) {
                    const option = document.createElement('option');
                    option.value = campaignName;
                    option.textContent = `⭐ ${campaignName} (chưa có dữ liệu)`;
                    selector.appendChild(option);
                    addedNames.add(campaignName);
                    tableMetadata[campaignName] = {
                        tableName: campaignName,
                        safeTableName: campaignName.replace(/[.$#\[\]\/]/g, '_'),
                        orderCount: 0,
                        fetchedAt: null,
                        isSavedCopy: false
                    };
                }
            });
        }

        // Store metadata globally for later reference
        window._tableMetadata = tableMetadata;

        console.log(`[REPORT] ✅ Loaded ${Object.keys(tables).length} tables + ${addedNames.size - Object.keys(tables).length} campaigns from Firebase`);

        // Select current table if exists
        if (currentTableName) {
            // Check if currentTableName option exists in dropdown
            let optionExists = tableMetadata[currentTableName] !== undefined;

            // If current table not in Firebase yet, add it to dropdown
            if (!optionExists && allOrders.length > 0) {
                const newOption = document.createElement('option');
                newOption.value = currentTableName;
                newOption.textContent = `${currentTableName} (${allOrders.length} đơn - hiện tại)`;
                selector.appendChild(newOption);
                console.log(`[REPORT] ➕ Added current table "${currentTableName}" to dropdown (not in Firebase yet)`);
            }

            selector.value = currentTableName;

            // Load full data for current table from Firebase (Chi tiết đã tải tab)
            if (optionExists) {
                console.log(`[REPORT] 📥 Loading full data for Chi tiết đã tải: ${currentTableName}`);
                await loadTableDataFromFirebase(currentTableName);

                // Update dropdown text with actual loaded count (fixes stale metadata in dropdown)
                const actualCount = cachedOrderDetails[currentTableName]?.orders?.length || 0;
                const selectedOption = Array.from(selector.options).find(o => o.value === currentTableName);
                if (selectedOption && actualCount > 0) {
                    const fetchedAt = cachedOrderDetails[currentTableName]?.fetchedAt
                        ? new Date(cachedOrderDetails[currentTableName].fetchedAt).toLocaleString('vi-VN') : '';
                    const isSavedCopy = selectedOption.dataset.isSavedCopy === 'true';
                    const icon = isSavedCopy ? '💾' : '📌';
                    const typeLabel = isSavedCopy ? 'Bản lưu' : 'Chính';
                    selectedOption.textContent = `${icon} ${currentTableName} (${actualCount} đơn - ${fetchedAt}) [${typeLabel}]`;
                }
            } else {
                // Campaign not in Firebase yet - show empty state for Chi tiết đã tải
                console.log(`[REPORT] ⚠️ Campaign "${currentTableName}" not in Firebase - Chi tiết đã tải will show empty`);
                delete cachedOrderDetails[currentTableName];
                updateTableHelperUI(true);
                updateCachedCountBadge();
                renderCachedDetailsTab();
            }

            // Reset the flag
            justReceivedFromTab1 = false;
        }
    } catch (error) {
        console.error('[REPORT] ❌ Error loading tables:', error);
    } finally {
        isLoadingTables = false;
    }
}

// Populate cache from already-loaded Firebase data
// NOTE: This function ONLY updates cachedOrderDetails for "Chi tiết đã tải" tab
// It does NOT touch allOrders - allOrders comes from Tab1 only
function populateCacheFromFirebaseData(tableName, firebaseData) {
    if (!firebaseData) {
        console.log(`[REPORT] ⚠️ No Firebase data to populate for: ${tableName}`);
        return;
    }

    console.log(`[REPORT] 📦 Populating cache (Chi tiết đã tải) for "${tableName}" with ${firebaseData.orders?.length || 0} orders`);

    // Update cache for "Chi tiết đã tải" tab ONLY
    // Use actual orders.length as authoritative count (not stale metadata)
    const actualOrders = firebaseData.orders || [];
    cachedOrderDetails[tableName] = {
        tableName: firebaseData.tableName || tableName,
        orders: actualOrders,
        fetchedAt: firebaseData.fetchedAt,
        totalOrders: actualOrders.length,
        successCount: actualOrders.length,
        errorCount: firebaseData.errorCount || 0
    };

    // DO NOT set allOrders here - allOrders comes from Tab1 only!
    // allOrders is for "Tổng quan" tab
    // cachedOrderDetails is for "Chi tiết đã tải" tab

    // Update Firebase status
    firebaseTableName = tableName;
    firebaseDataFetchedAt = firebaseData.fetchedAt;

    // Hide helper - data exists in Firebase
    updateTableHelperUI(false);

    console.log(`[REPORT] ✅ Cache populated (Chi tiết đã tải): ${cachedOrderDetails[tableName]?.orders?.length || 0} orders`);
}

// Handle table selection change
// NOTE: This only affects Chi tiết đã tải tab, NOT Tổng quan tab
// Tổng quan always shows data from Tab1 (allOrders)
async function handleTableChange() {
    const selector = document.getElementById('tableSelector');
    const selectedTable = selector.value;

    if (!selectedTable) {
        console.log('[REPORT] No table selected');
        userManuallySelectedTable = false;
        return;
    }

    console.log(`[REPORT] 📋 User manually switching to table: ${selectedTable} (Chi tiết đã tải only)`);
    userManuallySelectedTable = true; // Mark that user manually selected a table
    currentTableName = selectedTable;

    // Load cached data from Firebase for Chi tiết đã tải tab (force reload on manual selection)
    await loadTableDataFromFirebase(selectedTable, { force: true });
}

// Load table data from Firebase (for "Chi tiết đã tải" tab ONLY)
// NOTE: This does NOT affect allOrders - allOrders comes from Tab1
// Includes dedup logic to prevent triple-loading on page init
async function loadTableDataFromFirebase(tableName, options = {}) {
    if (!tableName) return;

    const forceReload = options.force || false;

    // DEDUP 1: If data already loaded for this table, skip (unless forced)
    if (!forceReload && _firebaseLoadedTable === tableName && cachedOrderDetails[tableName]?.orders?.length > 0) {
        console.log(`[REPORT] ⏭️ Firebase data already loaded for "${tableName}", skipping duplicate load`);
        return;
    }

    // DEDUP 2: If a load is already in flight for this table, await existing promise
    if (_firebaseLoadPromise && _firebaseLoadedTable === tableName) {
        console.log(`[REPORT] ⏭️ Firebase load already in progress for "${tableName}", awaiting existing promise`);
        return _firebaseLoadPromise;
    }

    // Start the actual load
    _firebaseLoadedTable = tableName;
    _firebaseLoadPromise = _doLoadTableDataFromFirebase(tableName);

    try {
        await _firebaseLoadPromise;
    } finally {
        _firebaseLoadPromise = null;
    }
}

// Internal: actual Firebase load logic with error handling
async function _doLoadTableDataFromFirebase(tableName) {
    console.log(`[REPORT] 📥 Loading Firebase data for table: ${tableName} (Chi tiết đã tải)`);

    // Show loading indicator immediately
    showCachedDetailsLoading();

    try {
        // Try loading from Firebase
        const firebaseData = await loadFromFirebase(tableName);

        if (firebaseData) {
            // Use the common function to populate cache (Chi tiết đã tải only)
            populateCacheFromFirebaseData(tableName, firebaseData);
            console.log(`[REPORT] ✅ Loaded ${firebaseData.orders?.length || 0} orders from Firebase for: ${tableName}`);
        } else {
            console.log(`[REPORT] ⚠️ No Firebase data for table: ${tableName} - need to fetch`);
            // Clear cache for this table (Chi tiết đã tải will show empty message)
            delete cachedOrderDetails[tableName];

            // Update Firebase status - show helper that this campaign needs fetching
            firebaseTableName = null;
            firebaseDataFetchedAt = null;
            updateTableHelperUI(true);
        }
    } catch (error) {
        console.error(`[REPORT] ❌ Error loading Firebase data for "${tableName}":`, error);
        // Don't clear existing cache on error - keep stale data if available
        _firebaseLoadedTable = null; // Allow retry
    } finally {
        // ALWAYS update UI regardless of success/failure (prevents stuck spinner)
        updateCachedCountBadge();
        renderCachedDetailsTab();

        // Update statistics (with error handling)
        try {
            await loadEmployeeRanges();
            renderStatistics();
        } catch (err) {
            console.warn('[REPORT] Statistics render failed:', err);
        }
    }
}

// Save cached data to localStorage (only metadata, not full orders)
function saveCachedData() {
    try {
        // Only save metadata to avoid quota exceeded
        const metadata = {};
        for (const tableName in cachedOrderDetails) {
            const data = cachedOrderDetails[tableName];
            metadata[tableName] = {
                tableName: data.tableName,
                fetchedAt: data.fetchedAt,
                totalOrders: data.totalOrders,
                successCount: data.successCount,
                errorCount: data.errorCount,
                orderCount: data.orders?.length || 0
            };
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
        console.log('[REPORT] ✅ Saved metadata to localStorage');
        updateCachedCountBadge();
    } catch (e) {
        console.error('[REPORT] ❌ Error saving to localStorage:', e);
        console.log('[REPORT] Skipping localStorage, data too large. Using Firebase only.');
    }
}

// Update badge count
function updateCachedCountBadge() {
    const badge = document.getElementById('cachedCountBadge');
    const currentData = cachedOrderDetails[currentTableName];
    badge.textContent = currentData?.orders?.length || 0;

    // Also update save report button state
    updateSaveReportButton();
}

/**
 * Add a table option to dropdown if it doesn't exist (without clearing dropdown)
 * This prevents race conditions where dropdown gets cleared while being updated
 */
function addTableOptionIfNotExists(tableName, orderCount) {
    const selector = document.getElementById('tableSelector');
    if (!selector || !tableName) return;

    // Check if option already exists
    for (let option of selector.options) {
        if (option.value === tableName) {
            // Update text if order count changed
            if (orderCount > 0) {
                option.textContent = `${tableName} (${orderCount} đơn - hiện tại)`;
            }
            return; // Already exists
        }
    }

    // Add new option
    const newOption = document.createElement('option');
    newOption.value = tableName;
    newOption.textContent = orderCount > 0
        ? `${tableName} (${orderCount} đơn - hiện tại)`
        : `${tableName} (hiện tại)`;
    selector.appendChild(newOption);
    console.log(`[REPORT] ➕ Added table option: ${tableName}`);
}

// =====================================================
