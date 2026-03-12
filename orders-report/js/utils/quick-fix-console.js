// =====================================================
// QUICK FIX SCRIPT FOR TAB 2
// Copy toàn bộ script này và paste vào Console (F12)
// =====================================================

(function() {
    console.log('%c🔧 TAB 2 QUICK FIX SCRIPT', 'background: #667eea; color: white; padding: 8px; font-weight: bold; font-size: 14px;');
    console.log('Starting diagnostic and auto-fix...\n');

    // Step 1: Check localStorage
    console.log('📦 Step 1: Checking localStorage...');
    const storedData = n2store.getItem('orders_tab1_filter_data');
    
    if (!storedData) {
        console.log('%c❌ PROBLEM FOUND: No data in localStorage', 'color: #ef4444; font-weight: bold;');
        console.log('🔍 DIAGNOSIS: Tab 1 chưa gửi dữ liệu');
        console.log('✅ SOLUTION: Vào Tab 1 → Chọn chiến dịch → Bấm "Tìm kiếm"');
        console.log('\n📝 Các bước cần làm:');
        console.log('1. Chuyển sang Tab "Quản lý đơn hàng"');
        console.log('2. Chọn một chiến dịch trong dropdown');
        console.log('3. Chọn khoảng thời gian');
        console.log('4. Bấm nút "Tìm kiếm"');
        console.log('5. Đợi dữ liệu tải xong');
        console.log('6. Quay lại Tab "Thống Kê"');
        return;
    }

    console.log('✅ Found data in localStorage');

    // Step 2: Parse and validate data
    console.log('\n📊 Step 2: Parsing and validating data...');
    let data;
    try {
        data = JSON.parse(storedData);
        console.log('✅ Data parsed successfully');
    } catch (error) {
        console.log('%c❌ ERROR: Failed to parse data', 'color: #ef4444; font-weight: bold;');
        console.error('Parse error:', error);
        console.log('✅ SOLUTION: Clear corrupted data and search again');
        n2store.removeItem('orders_tab1_filter_data');
        return;
    }

    // Validate data structure
    console.log('🔍 Validating data structure...');
    const validation = {
        hasData: !!data,
        hasCampaignName: !!data.campaignName,
        hasTotalRecords: data.totalRecords !== undefined,
        hasDataArray: Array.isArray(data.data),
        dataLength: data.data ? data.data.length : 0
    };

    console.log('Validation results:', validation);

    if (!validation.hasDataArray) {
        console.log('%c❌ ERROR: data.data is not an array', 'color: #ef4444; font-weight: bold;');
        console.log('Data structure:', typeof data.data);
        return;
    }

    if (validation.dataLength === 0) {
        console.log('%c⚠️ WARNING: data.data is empty', 'color: #f59e0b; font-weight: bold;');
        console.log('✅ SOLUTION: Chiến dịch không có đơn hàng trong khoảng thời gian đã chọn');
        return;
    }

    console.log(`✅ Data is valid with ${validation.dataLength} orders`);

    // Step 3: Display data info
    console.log('\n📋 Step 3: Data Summary:');
    console.log('Campaign:', data.campaignName);
    console.log('Total Records:', data.totalRecords);
    console.log('Orders in array:', data.data.length);
    console.log('Timestamp:', data.timestamp);

    // Step 4: Check if handleDataFromTab1 exists
    console.log('\n🔍 Step 4: Checking handleDataFromTab1 function...');
    if (typeof handleDataFromTab1 !== 'function') {
        console.log('%c❌ ERROR: handleDataFromTab1 function not found', 'color: #ef4444; font-weight: bold;');
        console.log('This script must be run on tab2-statistics.html page');
        return;
    }
    console.log('✅ handleDataFromTab1 function exists');

    // Step 5: Check global variables
    console.log('\n🔍 Step 5: Checking global variables...');
    console.log('allOrdersData:', Array.isArray(window.allOrdersData) ? `Array(${window.allOrdersData.length})` : typeof window.allOrdersData);
    console.log('sessionRanges:', Array.isArray(window.sessionRanges) ? `Array(${window.sessionRanges.length})` : typeof window.sessionRanges);

    // Step 6: Try to load the data
    console.log('\n🚀 Step 6: Attempting to load data...');
    try {
        handleDataFromTab1(data);
        
        // Wait a bit and check if it worked
        setTimeout(() => {
            console.log('\n✅ Checking results...');
            
            const filterBanner = document.getElementById('filterInfoBanner');
            const noDataMsg = document.getElementById('noFilterMessage');
            
            if (filterBanner && filterBanner.style.display !== 'none') {
                console.log('%c🎉 SUCCESS! Data loaded and displayed!', 'background: #10b981; color: white; padding: 8px; font-weight: bold; font-size: 14px;');
                console.log('\n📊 Current state:');
                console.log('- Campaign:', document.getElementById('infoCampaignName')?.textContent);
                console.log('- Total orders:', document.getElementById('infoTotalRecords')?.textContent);
                console.log('- Sync time:', document.getElementById('lastSyncTime')?.textContent);
                console.log('- allOrdersData length:', window.allOrdersData?.length);
                
                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
                    lucide.createIcons();
                    console.log('✅ Icons re-initialized');
                }
            } else {
                console.log('%c⚠️ Data loaded but UI not updated', 'color: #f59e0b; font-weight: bold;');
                console.log('Check the console for errors');
            }
        }, 500);
        
    } catch (error) {
        console.log('%c❌ ERROR: Failed to load data', 'color: #ef4444; font-weight: bold;');
        console.error('Error details:', error);
        console.log('\n🔍 Common solutions:');
        console.log('1. Refresh the page (F5)');
        console.log('2. Clear cache: localStorage.clear()');
        console.log('3. Go back to Tab 1 and search again');
    }

    console.log('\n' + '='.repeat(50));
    console.log('Script execution completed');
    console.log('='.repeat(50));
})();

// Additional helper functions you can call manually:

// 1. Force reload data
window.forceReloadData = function() {
    const data = JSON.parse(n2store.getItem('orders_tab1_filter_data'));
    if (data && typeof handleDataFromTab1 === 'function') {
        handleDataFromTab1(data);
        console.log('✅ Data reloaded');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
        console.log('❌ No data or function not found');
    }
};

// 2. Clear all data (WARNING: This will also clear bearer tokens!)
window.clearAllData = function() {
    if (confirm('⚠️ This will clear ALL data including bearer tokens. Continue?')) {
        localStorage.clear();
        sessionStorage.clear();
        console.log('✅ All data cleared (including tokens). Please reload page.');
    }
};

// 3. Show current state
window.showCurrentState = function() {
    console.log('Current State:');
    console.log('- allOrdersData:', window.allOrdersData?.length || 0, 'items');
    console.log('- localStorage:', n2store.getItem('orders_tab1_filter_data') ? 'Has data' : 'Empty');
    console.log('- filterInfoBanner visible:', document.getElementById('filterInfoBanner')?.style.display !== 'none');
};

console.log('\n💡 Available helper functions:');
console.log('- forceReloadData() - Force reload data from localStorage');
console.log('- clearAllData() - Clear all storage');
console.log('- showCurrentState() - Show current state');
