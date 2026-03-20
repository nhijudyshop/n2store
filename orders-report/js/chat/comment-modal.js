// =====================================================
// COMMENT MODAL - Redirect to Unified Chat Modal
// =====================================================
// This file previously contained a separate comment modal (800+ lines).
// It has been replaced by the unified chat modal in tab1-chat-*.js modules.
// Only the redirect function remains as a bridge for existing onclick handlers.

/**
 * Open the Comment Modal
 * Redirects to unified chat modal with COMMENT type
 */
window.openCommentModal = async function (orderId, channelId, psid) {
    console.log('[COMMENT MODAL] Redirecting to unified chat modal with COMMENT type:', { orderId, channelId, psid });
    return window.openChatModal(orderId, channelId, psid, 'comment');
};

console.log('[COMMENT MODAL] Module loaded (redirect only)');
