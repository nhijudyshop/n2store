// =====================================================
// OVERVIEW - EVENTS: Message Listeners & Communication
// =====================================================

// MESSAGE LISTENER - Receive data from tab1
// =====================================================
window.addEventListener('message', function (event) {
    // Handle orders data response
    if (event.data.type === 'ORDERS_DATA_RESPONSE_OVERVIEW') {
        console.log('[REPORT] Received orders data:', event.data.orders?.length || 0);
        console.log('[REPORT] Received campaign name:', event.data.tableName);
        console.log('[REPORT] User manually selected table:', userManuallySelectedTable);

        // Mark that we received data from Tab1 (for retry logic)
        dataReceivedFromTab1 = true;

        // Check if campaign is selected in Tab 1
        if (!event.data.tableName) {
            console.log('[REPORT] ⚠️ No campaign selected in Tab 1');
            setRefreshLoading(false);
            return;
        }

        const tab1TableName = event.data.tableName;

        // If user has manually selected a table from dropdown, don't override their selection
        if (userManuallySelectedTable && currentTableName && currentTableName !== tab1TableName) {
            console.log(`[REPORT] ⚠️ User manually selected "${currentTableName}", ignoring tab1 data for "${tab1TableName}"`);

            // Still add tab1's table to dropdown if not exists (don't clear dropdown)
            addTableOptionIfNotExists(tab1TableName, event.data.orders?.length || 0);

            // Stop loading state but keep current selection
            setRefreshLoading(false);
            return;
        }

        allOrders = event.data.orders || [];
        currentTableName = tab1TableName;
        justReceivedFromTab1 = true; // Prevent auto-load from Firebase

        // Update selector - add option if not exists, update text, then select
        addTableOptionIfNotExists(currentTableName, allOrders.length);
        const selector = document.getElementById('tableSelector');
        if (selector) {
            selector.value = currentTableName;
        }

        // Detect campaign name from first order (for backward compatibility)
        if (allOrders.length > 0) {
            const rawCampaign = allOrders[0].LiveCampaignName || allOrders[0].liveCampaignName || 'Unknown';
            currentCampaignName = rawCampaign.replace(/[.$#\[\]\/]/g, '_').trim();
            console.log('[REPORT] Current campaign:', currentCampaignName);
        }

        console.log('[REPORT] Using table name for mapping:', currentTableName);

        // Update UI
        updateStats();
        updateCachedCountBadge();
        renderCachedDetailsTab();

        // ⚡ OPTIMIZATION FIX: Render statistics from allOrders immediately
        // Load employee ranges and render statistics with proper async handling
        loadEmployeeRanges().then(() => {
            // ⚡ FIX: Use allOrders as single source of truth for statistics
            console.log('[REPORT] 📊 Rendering statistics from Tab1 data (allOrders)...');
            renderStatisticsFromAllOrders(); // New function that uses allOrders
        }).catch(err => {
            console.error('[REPORT] ❌ Error loading employee ranges:', err);
        });

        // Check Firebase status for this table
        checkFirebaseStatus();

        // ⚡ OPTIMIZATION FIX: AWAIT Firebase load to prevent race condition
        // Load Firebase data for "Chi tiết đã tải" tab (separate from allOrders)
        if (currentTableName) {
            loadTableDataFromFirebase(currentTableName).then(() => {
                console.log('[REPORT] ✅ Firebase data loaded for "Chi tiết đã tải" tab');
            }).catch(err => {
                console.warn('[REPORT] ⚠️ Failed to load Firebase data:', err);
            });
        }

        // Stop loading state
        setRefreshLoading(false);
    }

    // Handle table name change notification from tab1
    if (event.data.type === 'TABLE_NAME_CHANGED') {
        console.log('[REPORT] 📬 Table name changed in tab1:', event.data.tableName);

        const newTableName = event.data.tableName;

        // If user has manually selected a different table, don't override
        if (userManuallySelectedTable && currentTableName && currentTableName !== newTableName) {
            console.log(`[REPORT] ⚠️ User manually selected "${currentTableName}", not switching to tab1's "${newTableName}"`);
            // Just add the new table option if it doesn't exist (don't reset dropdown)
            addTableOptionIfNotExists(newTableName, 0);
            return;
        }

        currentTableName = newTableName;

        // Update selector - add option if not exists, then select it
        addTableOptionIfNotExists(newTableName, 0);
        const selector = document.getElementById('tableSelector');
        if (selector) {
            selector.value = currentTableName;
        }

        // Load Firebase data for the new table
        if (currentTableName) {
            loadTableDataFromFirebase(currentTableName);
        }
    }
});

// =====================================================
