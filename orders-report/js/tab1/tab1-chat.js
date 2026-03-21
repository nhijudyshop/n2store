// =====================================================
// tab1-chat.js - Chat Module Aggregator
// This file was split from a 6,665-line monolith into 5 sub-modules.
// It verifies all sub-modules loaded correctly and logs status.
// =====================================================
// Load order (defined in tab1-orders.html):
//   1. tab1-chat-core.js      - State, modals, selectors, mark-read, infinite scroll
//   2. tab1-chat-messages.js   - Render, send, queue, reply state
//   3. tab1-chat-facebook.js   - Facebook Token utils, Extension Bypass 24h fallback UI
//   4. tab1-chat-images.js     - Upload, paste, preview, compression
//   5. tab1-chat-realtime.js   - WebSocket, polling, live updates
//   6. tab1-chat.js            - This aggregator (loaded last)
// =====================================================

(function () {
    'use strict';

    console.log('[Tab1-Chat] Aggregator loading - verifying sub-modules...');

    // Required globals from each sub-module
    const checks = [
        // tab1-chat-core.js
        { name: 'tab1-chat-core', globals: ['openChatModal', 'closeChatModal', 'scrollToMessage', 'markChatAsRead'] },
        // tab1-chat-messages.js
        { name: 'tab1-chat-messages', globals: ['renderChatMessages', 'renderComments', 'sendMessage', 'sendComment', 'sendReplyComment'] },
        // tab1-chat-facebook.js
        { name: 'tab1-chat-facebook', globals: ['show24hFallbackPrompt', 'getFacebookPageToken'] },
        // tab1-chat-images.js
        { name: 'tab1-chat-images', globals: ['uploadImageWithCache', 'updateMultipleImagesPreview', 'clearAllImages', 'sendImageToChat', 'sendProductToChat'] },
        // tab1-chat-realtime.js
        { name: 'tab1-chat-realtime', globals: ['setupRealtimeMessages', 'cleanupRealtimeMessages', 'fetchAndUpdateMessages'] }
    ];

    let allPassed = true;

    checks.forEach(check => {
        const missing = check.globals.filter(g => typeof window[g] === 'undefined');
        if (missing.length > 0) {
            console.error(`[Tab1-Chat] ${check.name} MISSING globals:`, missing.join(', '));
            allPassed = false;
        } else {
            console.log(`[Tab1-Chat] ${check.name} OK`);
        }
    });

    // Check extension bridge module
    if (window.tab1ExtensionBridge) {
        console.log('[Tab1-Chat] tab1-extension-bridge OK');
    } else {
        console.warn('[Tab1-Chat] tab1-extension-bridge not loaded (Extension bypass unavailable)');
    }

    if (allPassed) {
        console.log('[Tab1-Chat] All sub-modules loaded successfully.');
    } else {
        console.error('[Tab1-Chat] Some sub-modules failed to load! Check script tags in tab1-orders.html.');
    }

    // Initialize Extension Bridge with discovered page IDs (delayed to let pancakeTokenManager load)
    setTimeout(() => {
        if (window.tab1ExtensionBridge && !window.tab1ExtensionBridge._initialized) {
            let pageIds = [];
            // Try to get page IDs from pancakeTokenManager
            if (window.pancakeTokenManager?.accountPages) {
                pageIds = Object.keys(window.pancakeTokenManager.accountPages);
            }
            // Fallback: try from pancakeDataManager
            if (pageIds.length === 0 && window.pancakeDataManager?.pageIds) {
                pageIds = window.pancakeDataManager.pageIds;
            }
            window.tab1ExtensionBridge.init(pageIds);
            console.log('[Tab1-Chat] Extension bridge initialized with', pageIds.length, 'page IDs');
        }
    }, 3000); // Wait 3s for token manager to load

    // Realtime connection status indicator
    function updateRealtimeStatusIndicator(connected) {
        const indicator = document.getElementById('realtimeStatusIndicator');
        if (!indicator) return;

        indicator.style.display = 'inline-flex';
        const icon = indicator.querySelector('i');
        if (connected) {
            icon.style.color = '#10b981'; // green
            indicator.title = 'Realtime: Đang kết nối';
        } else {
            icon.style.color = '#ef4444'; // red
            indicator.title = 'Realtime: Mất kết nối';
        }
    }

    // Listen for realtime status changes from RealtimeManager
    window.addEventListener('realtimeStatusChanged', (e) => {
        updateRealtimeStatusIndicator(e.detail?.connected);
    });

    // Listen for connection lost (max retries exceeded)
    window.addEventListener('realtimeConnectionLost', () => {
        updateRealtimeStatusIndicator(false);
        const indicator = document.getElementById('realtimeStatusIndicator');
        if (indicator) {
            indicator.title = 'Realtime: Mất kết nối (đã thử lại tối đa)';
        }
    });

    // Set initial state
    setTimeout(() => {
        const connected = window.realtimeManager?.isConnected || false;
        updateRealtimeStatusIndicator(connected);
    }, 1000);
})();
