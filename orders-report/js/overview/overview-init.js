// =====================================================
// OVERVIEW - INIT: Page Initialization
// Independent from Tab1 - loads everything from Firebase
// =====================================================

// INITIALIZATION
// =====================================================
document.addEventListener('DOMContentLoaded', async function () {
    console.log('[REPORT] Page loaded, initializing (independent mode)...');

    // Initialize analysis tab visibility based on permissions
    if (typeof initAnalysisTabVisibility === 'function') {
        initAnalysisTabVisibility();
    }

    // Reset fetching state on page load
    if (typeof isFetching !== 'undefined') isFetching = false;
    const fetchBtn = document.getElementById('btnBatchFetch');
    if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = '<i class="fas fa-download"></i> Lấy chi tiết đơn hàng';
    }

    // 1. Load settings in parallel
    await Promise.all([
        loadEmployeeRanges(),
        loadAvailableTagsFromFirebase(),
        loadTrackedTags()
    ]);
    console.log('[REPORT] 📊 Statistics settings loaded');

    // 2. Load campaign from Firebase (independent of Tab1)
    const campaignInfo = await loadActiveCampaignFromFirebase();
    if (campaignInfo?.activeCampaign?.name) {
        currentTableName = campaignInfo.activeCampaign.name;
        console.log('[REPORT] 📋 Active campaign from Firebase:', currentTableName);
    } else {
        // Fallback: load default table name
        currentTableName = await loadDefaultTableNameFromFirebase();
        console.log('[REPORT] 📋 Default table name:', currentTableName);
    }

    // 3. Load available tables dropdown
    await loadAvailableTables();

    // 4. Load data for current campaign from Firebase
    const hasData = await loadTableDataFromFirebase(currentTableName);

    // 5. If no data → show modal for fetch
    if (!hasData) {
        console.log('[REPORT] ⚠️ No data for current campaign, user can fetch manually');
        // Don't auto-open modal on init, just show helper message
    }

    // 6. Render UI (loadTableDataFromFirebase already calls updateStats + renderStatistics)
    updateCachedCountBadge();
    renderCachedDetailsTab();

    // Initialize discount stats UI
    if (window.discountStatsUI) {
        window.discountStatsUI.init();
        console.log('[REPORT] 💰 Discount Stats UI initialized');
    }

    console.log(`[REPORT] 🎉 Init complete (independent). cachedOrders for "${currentTableName}": ${cachedOrderDetails[currentTableName]?.orders?.length || 0}`);
});

// =====================================================
// EXPORT FUNCTIONS
// =====================================================
window.reportModule = {
    getAllOrders: () => getActiveOrders(),
    getCachedDetails: () => cachedOrderDetails,
    getCurrentCampaign: () => currentCampaignName,
    getCurrentTableName: () => currentTableName,
    fetchOrderData: fetchOrderData,
    refreshData: refreshAllData,
    startBatchFetch: startBatchFetch
};

// Expose for discount stats
if (typeof cachedOrderDetails !== 'undefined') {
    window.cachedOrderDetails = cachedOrderDetails;
}

// Expose permission functions
if (typeof canViewAnalysis !== 'undefined') window.canViewAnalysis = canViewAnalysis;
if (typeof canEditAnalysis !== 'undefined') window.canEditAnalysis = canEditAnalysis;
if (typeof currentTableName !== 'undefined') window.currentTableName = currentTableName;
