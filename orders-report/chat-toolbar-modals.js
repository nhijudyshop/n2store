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

// =====================================================
// STICKER PICKER MODAL FUNCTIONS
// =====================================================

// Open Sticker Picker Modal
function openStickerPickerModal() {
    const modal = document.getElementById('stickerPickerModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        console.log('[STICKER-PICKER] Modal opened');
    }
}

// Close Sticker Picker Modal
function closeStickerPickerModal() {
    const modal = document.getElementById('stickerPickerModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        console.log('[STICKER-PICKER] Modal closed');
    }
}

// Switch between Emoji and Sticker tabs
function switchStickerTab(tabName) {
    console.log('[STICKER-PICKER] Switching to tab:', tabName);

    // Update tab buttons
    const tabButtons = document.querySelectorAll('.sticker-tab-btn');
    tabButtons.forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update tab content
    const emojiContent = document.getElementById('emojiTabContent');
    const stickerContent = document.getElementById('stickerTabContent');

    if (tabName === 'emoji') {
        emojiContent.classList.add('active');
        stickerContent.classList.remove('active');
    } else if (tabName === 'sticker') {
        emojiContent.classList.remove('active');
        stickerContent.classList.add('active');
    }
}

// Insert Emoji/Sticker into chat input
function insertStickerEmoji(emoji) {
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

        console.log('[STICKER-PICKER] Inserted emoji:', emoji);
    }
    // Don't close modal, allow multiple emoji selections
}

// Search Sticker/Emoji
function searchSticker(query) {
    const searchQuery = query.toLowerCase().trim();
    const emojiItems = document.querySelectorAll('.emoji-item');
    const categories = document.querySelectorAll('.emoji-category');

    emojiItems.forEach(item => {
        const emoji = item.textContent.trim();
        const title = (item.getAttribute('title') || '').toLowerCase();

        if (searchQuery === '' || title.includes(searchQuery)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });

    // Hide/show categories based on visible items
    categories.forEach(category => {
        const visibleItems = category.querySelectorAll('.emoji-item[style*="display: flex"], .emoji-item:not([style*="display: none"])');
        if (searchQuery !== '' && visibleItems.length === 0) {
            category.style.display = 'none';
        } else {
            category.style.display = 'block';
        }
    });

    console.log('[STICKER-PICKER] Searching for:', searchQuery);
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
        if (e.target.classList.contains('sticker-picker-overlay')) {
            if (e.target.id === 'stickerPickerModal') closeStickerPickerModal();
        }
    });

    // Close modals on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeEmojiPickerModal();
            closePhotoLibraryModal();
            closeStickerPickerModal();
        }
    });
});
