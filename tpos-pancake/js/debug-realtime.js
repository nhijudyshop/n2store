// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// DEBUG REALTIME - Script để debug và enable WebSocket
// =====================================================

console.log('='.repeat(60));
console.log('🔍 REALTIME DEBUG TOOL');
console.log('='.repeat(60));

// 1. Kiểm tra trạng thái hiện tại
function checkRealtimeStatus() {
    console.log('\n📊 Current Status:');
    console.log('─'.repeat(60));

    if (!window.realtimeManager) {
        console.error('❌ realtimeManager not found!');
        return false;
    }

    // Read directly from localStorage since chatAPISettings was removed
    const realtimeEnabled = localStorage.getItem('tpos_chat_realtime_enabled') !== 'false';
    const realtimeMode = localStorage.getItem('tpos_chat_realtime_mode') || 'server';
    const isWSConnected = window.realtimeManager.isConnected;

    console.log(`API Source: Pancake (ChatOmni removed)`);
    console.log(`Realtime Enabled: ${realtimeEnabled}`);
    console.log(`Realtime Mode: ${realtimeMode}`);
    console.log(`WebSocket Connected: ${isWSConnected}`);

    return true;
}

// 2. Enable Realtime Browser Mode
function enableRealtimeBrowserMode() {
    console.log('\n🔧 Enabling Realtime Browser Mode...');
    console.log('─'.repeat(60));

    // Set realtime mode to browser
    console.log('  → Setting realtime mode to browser...');
    localStorage.setItem('tpos_chat_realtime_mode', 'browser');

    // Enable realtime
    console.log('  → Enabling realtime...');
    localStorage.setItem('tpos_chat_realtime_enabled', 'true');

    console.log('✅ Realtime Browser Mode Enabled!');
    console.log('⚠️  Please refresh the page to see WebSocket in Network tab');
}

// 3. Manually connect WebSocket (for testing)
async function manualConnectWebSocket() {
    console.log('\n🔌 Manually connecting WebSocket...');
    console.log('─'.repeat(60));

    if (!window.realtimeManager) {
        console.error('❌ realtimeManager not found!');
        return;
    }

    try {
        await window.realtimeManager.connect();
        console.log('✅ Connection initiated. Check Network tab for WebSocket.');
    } catch (error) {
        console.error('❌ Connection failed:', error);
    }
}

// 4. Check localStorage
function checkLocalStorage() {
    console.log('\n💾 LocalStorage Status:');
    console.log('─'.repeat(60));

    const apiSource = localStorage.getItem('tpos_chat_api_source');
    const realtimeEnabled = localStorage.getItem('tpos_chat_realtime_enabled');
    const realtimeMode = localStorage.getItem('tpos_chat_realtime_mode');

    console.log(`chat_api_source: ${apiSource || '(not set - default: pancake)'}`);
    console.log(`chat_realtime_enabled: ${realtimeEnabled || '(not set - default: true)'}`);
    console.log(`chat_realtime_mode: ${realtimeMode || '(not set - default: server)'}`);
}

// 5. Watch WebSocket Events
function watchWebSocketEvents() {
    console.log('\n👁️  Watching for WebSocket events...');
    console.log('─'.repeat(60));

    // Listen for realtime conversation updates
    window.addEventListener('realtimeConversationUpdate', (e) => {
        console.log('📨 [REALTIME UPDATE]', e.detail);
    });

    // Listen for API source changes
    window.addEventListener('chatApiSourceChanged', (e) => {
        console.log('🔄 [API SOURCE CHANGED]', e.detail);
    });

    console.log('✅ Event listeners attached. Updates will be logged here.');
}

// 6. Main Menu
function showMenu() {
    console.log('\n📋 Available Commands:');
    console.log('─'.repeat(60));
    console.log('window.debugRealtime.checkStatus()       - Check current status');
    console.log('window.debugRealtime.checkStorage()      - Check localStorage');
    console.log('window.debugRealtime.enableBrowser()     - Enable Browser Mode');
    console.log('window.debugRealtime.connect()           - Manually connect WebSocket');
    console.log('window.debugRealtime.watch()             - Watch WebSocket events');
    console.log('window.debugRealtime.disconnect()        - Disconnect WebSocket');
    console.log('='.repeat(60));
}

// Export functions to window
window.debugRealtime = {
    checkStatus: checkRealtimeStatus,
    checkStorage: checkLocalStorage,
    enableBrowser: enableRealtimeBrowserMode,
    connect: manualConnectWebSocket,
    watch: watchWebSocketEvents,
    disconnect: () => {
        if (window.realtimeManager) {
            window.realtimeManager.disconnect();
            console.log('✅ WebSocket disconnected');
        }
    }
};

// Auto-run on load
setTimeout(() => {
    showMenu();
    checkRealtimeStatus();
    checkLocalStorage();
}, 500);
