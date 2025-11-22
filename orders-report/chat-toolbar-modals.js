// =====================================================
// CHAT TOOLBAR MODALS - Emoji, Photo Library, Quick Reply
// =====================================================

// Open Emoji Picker Modal
function openEmojiPickerModal() {
    const modal = document.getElementById('emojiPickerModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// Close Emoji Picker Modal
function closeEmojiPickerModal() {
    const modal = document.getElementById('emojiPickerModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Insert Emoji into Chat Input
function insertEmoji(emoji) {
    const input = document.getElementById('chatReplyInput');
    if (input) {
        const cursorPos = input.selectionStart;
        const textBefore = input.value.substring(0, cursorPos);
        const textAfter = input.value.substring(cursorPos);
        input.value = textBefore + emoji + textAfter;

        // Move cursor after emoji
        const newCursorPos = cursorPos + emoji.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
        input.focus();
    }
    // Don't close modal, allow multiple emoji selections
}

// Open Photo Library Modal
function openPhotoLibraryModal() {
    const modal = document.getElementById('photoLibraryModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// Close Photo Library Modal
function closePhotoLibraryModal() {
    const modal = document.getElementById('photoLibraryModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Select Photo (placeholder - will need actual implementation)
function selectPhoto(photoUrl) {
    console.log('[PHOTO] Selected photo:', photoUrl);
    // TODO: Implement photo sending logic
    alert('Chức năng gửi ảnh đang được phát triển');
    closePhotoLibraryModal();
}

// Open Quick Reply Modal (using existing message template manager)
function openQuickReplyModal() {
    if (window.messageTemplateManager) {
        // Get current order from chat modal
        const orderId = window.currentChatOrderId;
        if (orderId) {
            const order = allData.find(o => o.Id === orderId);
            window.messageTemplateManager.openModal(order);
        } else {
            window.messageTemplateManager.openModal();
        }
    } else {
        console.error('[QUICK-REPLY] messageTemplateManager not available');
        alert('Chức năng tin nhắn mẫu chưa sẵn sàng');
    }
}

// Search Emoji
function searchEmoji(query) {
    const searchQuery = query.toLowerCase().trim();
    const emojiItems = document.querySelectorAll('.emoji-item');

    emojiItems.forEach(item => {
        const emoji = item.textContent;
        const keywords = item.dataset.keywords || '';

        if (searchQuery === '' || keywords.includes(searchQuery) || emoji.includes(searchQuery)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Initialize modals when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    console.log('[TOOLBAR-MODALS] Initializing...');

    // Close modals when clicking outside
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('toolbar-modal-overlay')) {
            if (e.target.id === 'emojiPickerModal') closeEmojiPickerModal();
            if (e.target.id === 'photoLibraryModal') closePhotoLibraryModal();
        }
    });

    // Close modals on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeEmojiPickerModal();
            closePhotoLibraryModal();
        }
    });
});
