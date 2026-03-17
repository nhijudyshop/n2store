// =====================================================
// OVERVIEW - EVENTS: Message Listeners & Communication
// =====================================================

// MESSAGE LISTENER - Only keep TABLE_NAME_CHANGED (sync 1 chiều from Tab1)
// All other postMessage dependencies have been removed
// =====================================================
window.addEventListener('message', async function (event) {
    // Handle table name change notification from tab1 (sync 1 chiều)
    if (event.data.type === 'TABLE_NAME_CHANGED') {
        console.log('[REPORT] 📬 Table name changed in tab1:', event.data.tableName);

        const newTableName = event.data.tableName;

        // If user has manually selected a different table, don't override
        if (userManuallySelectedTable && currentTableName && currentTableName !== newTableName) {
            console.log(`[REPORT] ⚠️ User manually selected "${currentTableName}", not switching to tab1's "${newTableName}"`);
            if (typeof addTableOptionIfNotExists === 'function') addTableOptionIfNotExists(newTableName, 0);
            return;
        }

        currentTableName = newTableName;

        // Update selector
        addTableOptionIfNotExists(newTableName, 0);
        const selector = document.getElementById('tableSelector');
        if (selector) {
            selector.value = currentTableName;
        }

        // Load data from Firebase (not from Tab1)
        if (currentTableName) {
            await loadTableDataFromFirebase(currentTableName);
        }
    }
});

// =====================================================
