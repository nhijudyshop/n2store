/* =====================================================
   INBOX MAIN - App initialization + Column Resizer
   ===================================================== */

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.showToast = showToast;

// Compatibility shim for tab1-pancake-settings.js (uses notificationManager.show)
window.notificationManager = {
    show: (message, type) => showToast(message, type),
    error: (message) => showToast(message, 'error'),
    success: (message) => showToast(message, 'success'),
    info: (message) => showToast(message, 'info'),
    warning: (message) => showToast(message, 'warning')
};

/* =====================================================
   COLUMN RESIZER - Draggable dividers between columns
   ===================================================== */

function initColumnResizer() {
    const handles = document.querySelectorAll('.resize-handle');

    handles.forEach(handle => {
        let startX = 0;
        let leftCol = null;
        let rightCol = null;
        let leftWidth = 0;
        let rightWidth = 0;

        function onMouseDown(e) {
            e.preventDefault();
            leftCol = document.getElementById(handle.dataset.left);
            rightCol = document.getElementById(handle.dataset.right);
            if (!leftCol || !rightCol) return;

            startX = e.clientX;
            leftWidth = leftCol.getBoundingClientRect().width;
            rightWidth = rightCol.getBoundingClientRect().width;

            handle.classList.add('dragging');
            document.body.classList.add('col-resizing');

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        function onMouseMove(e) {
            const dx = e.clientX - startX;
            const newLeftW = leftWidth + dx;
            const newRightW = rightWidth - dx;

            // Enforce min widths
            const leftMin = parseInt(getComputedStyle(leftCol).minWidth) || 200;
            const rightMin = parseInt(getComputedStyle(rightCol).minWidth) || 200;

            if (newLeftW < leftMin || newRightW < rightMin) return;

            // For col1 (fixed width) -> set width directly
            if (leftCol.classList.contains('inbox-col-conversations') ||
                leftCol.classList.contains('inbox-col-info')) {
                leftCol.style.width = newLeftW + 'px';
                leftCol.style.minWidth = newLeftW + 'px';
            } else {
                // col2 is flex:1, so we set flex-basis
                leftCol.style.flex = '0 0 ' + newLeftW + 'px';
                leftCol.style.minWidth = '300px';
            }

            if (rightCol.classList.contains('inbox-col-conversations') ||
                rightCol.classList.contains('inbox-col-info')) {
                rightCol.style.width = newRightW + 'px';
                rightCol.style.minWidth = newRightW + 'px';
            } else {
                rightCol.style.flex = '0 0 ' + newRightW + 'px';
                rightCol.style.minWidth = '300px';
            }
        }

        function onMouseUp() {
            handle.classList.remove('dragging');
            document.body.classList.remove('col-resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        handle.addEventListener('mousedown', onMouseDown);

        // Touch support
        handle.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            onMouseDown({ clientX: touch.clientX, preventDefault: () => e.preventDefault() });

            function onTouchMove(e2) {
                onMouseMove({ clientX: e2.touches[0].clientX });
            }
            function onTouchEnd() {
                onMouseUp();
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
            }
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
        }, { passive: false });
    });
}

/* =====================================================
   INIT APP - Async for Pancake API initialization
   ===================================================== */

async function initInboxApp() {
    // Show loading state in conversation list
    const convList = document.getElementById('conversationList');
    if (convList) {
        convList.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">
                <div class="loading-spinner"></div>
                <p style="margin-top: 0.5rem;">Đang kết nối Pancake...</p>
            </div>
        `;
    }

    // Initialize Lucide icons early
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Initialize column resizer
    initColumnResizer();

    // Initialize data manager with Pancake API
    const dataManager = new InboxDataManager();
    await dataManager.init();

    // Initialize chat controller
    const chatController = new InboxChatController(dataManager);
    chatController.init();
    window.inboxChat = chatController;

    // Initialize order controller
    const orderController = new InboxOrderController(dataManager);
    orderController.init();
    window.inboxOrders = orderController;

    // Initialize WebSocket real-time (like tpos-pancake)
    const socketConnected = await chatController.initializeWebSocket();
    if (!socketConnected) {
        console.log('[Inbox] WebSocket unavailable, using polling fallback');
        chatController.startAutoRefresh();
    }

    // Update page unread counts
    chatController.updatePageUnreadCounts();

    // Fetch pending customers from Render DB (merge unread data)
    dataManager.fetchPendingFromServer();

    // Listen for account changes from Pancake Settings modal
    window.addEventListener('pancakeAccountChanged', async () => {
        showToast('Đang chuyển tài khoản...', 'info');
        chatController.closeWebSocket();
        await dataManager.init();
        chatController.renderPageSelector();
        chatController.renderConversationList();
        chatController.renderGroupStats();
        chatController.updatePageUnreadCounts();
        await chatController.initializeWebSocket();
        showToast('Đã chuyển tài khoản thành công', 'success');
    });

    // Re-initialize Lucide icons after rendering
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // ===== Apply Permission-based UI Restrictions =====
    if (typeof PermissionHelper !== 'undefined') {
        PermissionHelper.applyUIRestrictions('inbox');
    }

    console.log('[Inbox] App initialized successfully with Pancake API + WebSocket');
}

// ===== Pancake Extension Bridge (before DOM ready, catch early EXTENSION_LOADED) =====
window.pancakeExtension = { connected: false };
window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.type === 'EXTENSION_LOADED' && e.data?.from === 'EXTENSION') {
        window.pancakeExtension.connected = true;
        console.log('[Inbox] Pancake Extension connected');
        if (typeof showToast === 'function') showToast('Pancake Extension đã kết nối', 'success');

        // Pre-initialize pages so extension warms up Facebook sessions
        const dm = window.inboxChat?.data;
        if (dm) {
            const pageIds = Object.keys(dm.pages || {});
            if (pageIds.length) {
                window.postMessage({ type: 'PREINITIALIZE_PAGES', pageIds }, '*');
                console.log('[Inbox] Sent PREINITIALIZE_PAGES:', pageIds);
            }
        }
    }
    if (e.data?.type === 'REPLY_INBOX_PHOTO_SUCCESS') {
        console.log('[Inbox] Extension send success:', e.data);
    }
    if (e.data?.type === 'REPLY_INBOX_PHOTO_FAILURE') {
        console.warn('[Inbox] Extension send failed:', e.data);
    }
});

// Wait for DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInboxApp);
} else {
    initInboxApp();
}
