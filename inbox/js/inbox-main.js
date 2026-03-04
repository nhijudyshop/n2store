/* =====================================================
   INBOX MAIN - App initialization
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

// Make showToast available globally
window.showToast = showToast;

/**
 * Initialize the Inbox app
 */
function initInboxApp() {
    // Initialize data manager
    const dataManager = new InboxDataManager();
    dataManager.init();

    // Initialize chat controller
    const chatController = new InboxChatController(dataManager);
    chatController.init();
    window.inboxChat = chatController;

    // Initialize order controller
    const orderController = new InboxOrderController(dataManager);
    orderController.init();
    window.inboxOrders = orderController;

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    console.log('[Inbox] App initialized successfully');
}

// Wait for DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInboxApp);
} else {
    initInboxApp();
}
