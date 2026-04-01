// ============================================
// CHECKBOX HANDLING & QUICK REPLY
// Extracted from tab1-orders.html
// ============================================

// Handle checkbox selection
document.addEventListener('DOMContentLoaded', function () {
    const selectAllCheckbox = document.getElementById('selectAll');

    // Individual checkbox change
    document.addEventListener('change', function (e) {
        if (e.target.matches('tbody input[type="checkbox"]')) {
            // Call global updateActionButtons from tab1-orders.js
            if (typeof updateActionButtons === 'function') {
                updateActionButtons();
            }

            // Update select all checkbox state
            const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            const someChecked = Array.from(checkboxes).some(cb => cb.checked);

            if (selectAllCheckbox) {
                selectAllCheckbox.checked = allChecked;
                selectAllCheckbox.indeterminate = someChecked && !allChecked;
            }
        }
    });
});

/**
 * Open quick reply modal for inserting into chat input
 */
window.openChatTemplateModal = function() {
    if (!window.quickReplyManager) {
        console.error('❌ QuickReplyManager not initialized');
        if (window.notificationManager) {
            window.notificationManager.error('Hệ thống chưa sẵn sàng, vui lòng thử lại');
        }
        return;
    }

    // Open quick reply modal with target input
    window.quickReplyManager.openModal('chatReplyInput');

};

