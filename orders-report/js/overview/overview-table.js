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
        const snapshot = await database.collection(FIREBASE_PATH).get();
        const tables = {};
        snapshot.forEach(doc => {
            tables[doc.id] = doc.data();
        });

        const selector = document.getElementById('tableSelector');
        selector.innerHTML = '<option value="">-- Chọn bảng --</option>';

        // Only extract metadata for dropdown (don't keep full orders in memory)
        const tableMetadata = {};

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
        });

        // Store metadata globally for later reference
        window._tableMetadata = tableMetadata;

        console.log(`[REPORT] ✅ Loaded ${Object.keys(tables).length} table metadata from Firebase`);

        // Select current table if exists
        if (currentTableName) {
            // Check if currentTableName option exists in dropdown
            let optionExists = tableMetadata[currentTableName] !== undefined;

            // If current table not in Firebase yet, add it to dropdown
            if (!optionExists) {
                const currentOrders = getActiveOrders();
                if (currentOrders.length > 0) {
                    const newOption = document.createElement('option');
                    newOption.value = currentTableName;
                    newOption.textContent = `${currentTableName} (${currentOrders.length} đơn - hiện tại)`;
                    selector.appendChild(newOption);
                    console.log(`[REPORT] ➕ Added current table "${currentTableName}" to dropdown (not in Firebase yet)`);
                }
            }

            selector.value = currentTableName;

            // Load full data for current table from Firebase (Chi tiết đã tải tab)
            if (optionExists) {
                console.log(`[REPORT] 📥 Loading full data for Chi tiết đã tải: ${currentTableName}`);
                await loadTableDataFromFirebase(currentTableName);
            } else {
                // Campaign not in Firebase yet - show empty state for Chi tiết đã tải
                console.log(`[REPORT] ⚠️ Campaign "${currentTableName}" not in Firebase - Chi tiết đã tải will show empty`);
                delete cachedOrderDetails[currentTableName];
                updateTableHelperUI(true);
                updateCachedCountBadge();
                renderCachedDetailsTab();
            }

        }
    } catch (error) {
        console.error('[REPORT] ❌ Error loading tables:', error);
    } finally {
        isLoadingTables = false;
    }
}

// Populate cache from already-loaded Firebase data (unified data source)
function populateCacheFromFirebaseData(tableName, firebaseData) {
    if (!firebaseData) {
        console.log(`[REPORT] ⚠️ No Firebase data to populate for: ${tableName}`);
        return;
    }

    console.log(`[REPORT] 📦 Populating cache for "${tableName}" with ${firebaseData.orders?.length || 0} orders`);

    cachedOrderDetails[tableName] = {
        tableName: firebaseData.tableName || tableName,
        orders: firebaseData.orders || [],
        fetchedAt: firebaseData.fetchedAt,
        totalOrders: firebaseData.totalOrders,
        successCount: firebaseData.successCount,
        errorCount: firebaseData.errorCount
    };

    // Update Firebase status
    firebaseTableName = tableName;
    firebaseDataFetchedAt = firebaseData.fetchedAt;

    // Hide helper - data exists in Firebase
    updateTableHelperUI(false);

    console.log(`[REPORT] ✅ Cache populated: ${cachedOrderDetails[tableName]?.orders?.length || 0} orders`);
}

// Handle table selection change (affects all tabs via unified data)
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

    // Load cached data from Firebase for Chi tiết đã tải tab
    await loadTableDataFromFirebase(selectedTable);
}

// Load table data from Firebase (unified data source for all tabs)
async function loadTableDataFromFirebase(tableName) {
    if (!tableName) return false;

    console.log(`[REPORT] 📥 Loading Firebase data for table: ${tableName}`);

    // Show loading indicator immediately
    showCachedDetailsLoading();

    // Try loading from Firebase
    const firebaseData = await loadFromFirebase(tableName);

    if (firebaseData) {
        populateCacheFromFirebaseData(tableName, firebaseData);
        console.log(`[REPORT] ✅ Loaded ${firebaseData.orders?.length || 0} orders from Firebase for: ${tableName}`);
    } else {
        console.log(`[REPORT] ⚠️ No Firebase data for table: ${tableName} - need to fetch`);
        delete cachedOrderDetails[tableName];

        firebaseTableName = null;
        firebaseDataFetchedAt = null;
        updateTableHelperUI(true);
    }

    // Update all UI from unified data
    updateCachedCountBadge();
    renderCachedDetailsTab();
    updateStats();

    // Load employee ranges from Firebase and render statistics
    await loadEmployeeRanges();
    renderStatistics();

    return !!(firebaseData?.orders?.length);
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
