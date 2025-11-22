// =====================================================
// QUICK REPLY MANAGER - Fast Message Templates for Chat
// =====================================================

class QuickReplyManager {
    constructor() {
        this.replies = [];
        this.targetInputId = null;
        this.STORAGE_KEY = 'quickReplies';
        this.autocompleteActive = false;
        this.selectedSuggestionIndex = -1;
        this.currentSuggestions = [];
        this.init();
    }

    init() {
        console.log('[QUICK-REPLY] 🚀 Initializing...');
        this.createModalDOM();
        this.createAutocompleteDOM();
        this.loadReplies();
        this.attachEventListeners();
        this.setupAutocomplete();
    }

    createModalDOM() {
        if (document.getElementById('quickReplyModal')) {
            console.log('[QUICK-REPLY] ⚠️ Modal already exists');
            return;
        }

        const modalHTML = `
            <div class="quick-reply-overlay" id="quickReplyModal">
                <div class="quick-reply-modal">
                    <!-- Header -->
                    <div class="quick-reply-header">
                        <h3>
                            <i class="fas fa-comment-dots"></i>
                            Mẫu trả lời nhanh
                        </h3>
                        <button class="quick-reply-close" id="quickReplyClose">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Table Header -->
                    <div class="quick-reply-table-header">
                        <div class="qr-col-stt">STT</div>
                        <div class="qr-col-shortcut">Ký tự tắt</div>
                        <div class="qr-col-topic">Chủ đề</div>
                        <div class="qr-col-message">Tin nhắn</div>
                    </div>

                    <!-- Body -->
                    <div class="quick-reply-body" id="quickReplyBody">
                        <!-- Replies will be rendered here -->
                    </div>

                    <!-- Footer -->
                    <div class="quick-reply-footer">
                        <div class="quick-reply-footer-info">
                            <span id="quickReplyCount">0</span> mẫu tin nhắn
                        </div>
                        <div class="quick-reply-footer-actions">
                            <button onclick="quickReplyManager.closeModal()">
                                <i class="fas fa-times"></i> Đóng
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        console.log('[QUICK-REPLY] ✅ Modal DOM created');
    }

    attachEventListeners() {
        document.getElementById('quickReplyClose')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('quickReplyModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'quickReplyModal') {
                this.closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen()) {
                this.closeModal();
            }
        });

        console.log('[QUICK-REPLY] ✅ Event listeners attached');
    }

    loadReplies() {
        // Try to load from localStorage
        const stored = localStorage.getItem(this.STORAGE_KEY);

        if (stored) {
            try {
                this.replies = JSON.parse(stored);
                console.log('[QUICK-REPLY] ✅ Loaded', this.replies.length, 'replies from localStorage');
            } catch (e) {
                console.error('[QUICK-REPLY] ❌ Error parsing stored replies:', e);
                this.replies = this.getDefaultReplies();
            }
        } else {
            // Use default replies
            this.replies = this.getDefaultReplies();
            this.saveReplies();
            console.log('[QUICK-REPLY] ✅ Loaded default replies');
        }
    }

    getDefaultReplies() {
        return [
            {
                id: 1,
                shortcut: '',
                topic: 'CHỐT ĐƠN',
                topicColor: '#3add99',
                message: 'Dạ mình xem okee shop chốt đơn cho c nhaa 😍'
            },
            {
                id: 2,
                shortcut: 'CÁMƠN',
                topic: 'C.ƠN KH',
                topicColor: '#cec40c',
                message: 'Dạ hàng của mình đã được lên bill , cám ơn chị yêu đã ủng hộ shop ạ ❤️'
            },
            {
                id: 3,
                shortcut: 'STK',
                topic: 'STK NGÂN HÀNG',
                topicColor: '#969894',
                message: 'Dạ em gửi mình số tài khoản ạ ❗\nNGÂN HÀNG: ACB\nSTK: 93616\nTÊN: LẠI THỤY YẾN NHI\n⛔ MÌNH LƯU Ý khi chuyển khoản kèm nội dung ❌TÊN FB +5 SDTĐUÔI ❌chụp gửi qua giúp em nhé ☺️✉️'
            },
            {
                id: 4,
                shortcut: 'XIN',
                topic: 'XIN SDT & Đ/C',
                topicColor: '#138809',
                message: 'Dạ mình cho shop xin thông tin SĐT & ĐỊA CHỈ ạ ❤️'
            },
            {
                id: 5,
                shortcut: 'ĐỔI',
                topic: 'Đ/C ĐỔI TRẢ',
                topicColor: '#30caff',
                message: '❌❌KHÁCH GỬI HÀNG ĐỔI TRẢ VUI LÒNG RA BƯU CỤC GỬI LÊN GIÚP SHOP THEO THÔNG TIN DƯỚI ĐÂY👇\nNgười Gửi: (TÊN FB + SĐT KHÁCH ĐẶT HÀNG)\nNgười Nhận: NHI JUDY\nĐịa chi: 28/6 PHẠM VĂN CHIÊU P8 GÒ VẤP\nSđt: 0908888674\n\n⛔ LƯU Ý : - HÀNG CÒN TEM MẠC KHÔNG QUA GIẶC - LÀ\n- ĐẦY ĐỦ PHỤ KIỆN ĐI KÈM\n( KHÁCH VUI LÒNG GỬI ĐẦY ĐỦ ĐỂ ĐC ĐỔI TRẢ Ạ )\n\n🆘 HÀNG KHÁCH GỬI LÊN SẼ ĐƯỢC TRỪ TIỀN VÀO ĐƠN TIẾP THEO CỦA KHÁCH 🆘'
            },
            {
                id: 6,
                shortcut: 'TP',
                topic: 'ĐÔI TRẢ TP',
                topicColor: '#8c0db1',
                message: '- ĐƠN SAU BÊN EM ĐI ĐƠN TRỪ TIỀN THU VỀ CHO MÌNH C NHÉ ♦️\n📌 LƯU Ý : hàng chưa qua giặc là , còn tem mác và đầy đủ phụ kiện đi kèm nếu có giúp SHOP ạ\n📌 Hàng đổi trong vòng 3 ngày kể từ ngày nhận hàng\n\nHÀNG GIAO ĐẾN MÌNH ĐƯA CHO SHIPPER MANG VỀ GIÚP SHOP AH 📍📍'
            },
            {
                id: 7,
                shortcut: 'XEM',
                topic: 'XEM HÀNG',
                topicColor: '#5b0001',
                message: 'Dạ c , hàng bên em đi không đồng kiểm hàng trước khi nhận ạ 📌 Nhưng mình nhận hàng cứ yên tâm giúp e nha hàng có vấn đề mình inbox hoặc gọi hottline để bên em sẽ giải quyết đổi trả cho mình ạ . 🌺'
            },
            {
                id: 8,
                shortcut: 'live',
                topic: '',
                topicColor: '',
                message: 'dạ bên e còn live gộp đơn ạ, mình xem live shopping thêm c nha, dạ trường hợp mình cần đi đơn trước hỗ trợ ib giúp shop c nha'
            },
            {
                id: 9,
                shortcut: '.',
                topic: 'NHẮC KHÁCH',
                topicColor: '#ea62f5',
                message: 'Dạ đơn mình có hàng đổi trả thu về , ship giao đến c báo anh hỗ trợ chụp hoặc quay video lại gửi cho shop giúp em nha để tránh trường hợp hàng thu về bị thất lạc . Em cám ơn c nhiều ạ ❤️'
            },
            {
                id: 10,
                shortcut: 'khach_hoi',
                topic: '',
                topicColor: '',
                message: 'Dạ mẫu shop nhận hàng về 1-2 ngày , chị lấy e nhận về hàng cho TY nha 😍'
            },
            {
                id: 11,
                shortcut: 'chot_don_ord',
                topic: '',
                topicColor: '',
                message: 'Dạ e chốt mình\nVề hàng thơi gian dự kiến 1-2 ngày\n❌ Mình đặt inbox đã có hàng , đừng đặt trên live tránh trường hợp trùng mẫu - trùng đơn nhé\n❌ Lưu ý: Hàng sẽ về sớm hơn hoặc chậm hơn dự kiến vài ngày\n❌ HÀNG ĐÃ ĐĂT INBOX , KHÁCH HỖ TRỢ KHÔNG HỦY GIUP SHOP Ạ ❌'
            },
            {
                id: 12,
                shortcut: 'QL',
                topic: '',
                topicColor: '',
                message: 'Dạ e gửi bill qua lấy cho mình , đơn hàng mình có vấn đề gì liên hệ qua SDT quản lí 0977774305 nhé c ạ ❤️ Em cám ơn'
            }
        ];
    }

    saveReplies() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.replies));
            console.log('[QUICK-REPLY] ✅ Saved', this.replies.length, 'replies to localStorage');
        } catch (e) {
            console.error('[QUICK-REPLY] ❌ Error saving replies:', e);
        }
    }

    openModal(targetInputId) {
        console.log('[QUICK-REPLY] 📂 Opening modal for input:', targetInputId);

        this.targetInputId = targetInputId;

        const modal = document.getElementById('quickReplyModal');
        modal?.classList.add('active');
        document.body.style.overflow = 'hidden';

        this.renderReplies();
    }

    closeModal() {
        console.log('[QUICK-REPLY] 🚪 Closing modal');

        const modal = document.getElementById('quickReplyModal');
        modal?.classList.remove('active');
        document.body.style.overflow = 'auto';

        this.targetInputId = null;
    }

    isModalOpen() {
        return document.getElementById('quickReplyModal')?.classList.contains('active');
    }

    renderReplies() {
        const bodyEl = document.getElementById('quickReplyBody');
        const countEl = document.getElementById('quickReplyCount');

        if (countEl) {
            countEl.textContent = this.replies.length;
        }

        if (this.replies.length === 0) {
            bodyEl.innerHTML = `
                <div class="quick-reply-empty">
                    <i class="fas fa-comment-slash"></i>
                    <p>Chưa có mẫu tin nhắn nào</p>
                </div>
            `;
            return;
        }

        const repliesHTML = this.replies.map((reply, index) => {
            const topicHTML = reply.topic ? `
                <span class="quick-reply-topic" style="background-color: ${reply.topicColor || '#6b7280'}">
                    ${this.escapeHtml(reply.topic)}
                </span>
            ` : '';

            // Preview first 80 characters
            const messagePreview = reply.message.length > 80
                ? reply.message.substring(0, 80) + '...'
                : reply.message;

            return `
                <div class="quick-reply-item" onclick="quickReplyManager.selectReply(${reply.id})">
                    <div class="qr-col-stt">${index + 1}.</div>
                    <div class="qr-col-shortcut">
                        <span class="quick-reply-shortcut">${this.escapeHtml(reply.shortcut)}</span>
                    </div>
                    <div class="qr-col-topic">
                        ${topicHTML}
                    </div>
                    <div class="qr-col-message">
                        <span class="quick-reply-message" title="${this.escapeHtml(reply.message)}">
                            ${this.escapeHtml(messagePreview)}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        bodyEl.innerHTML = repliesHTML;
        console.log('[QUICK-REPLY] ✅ Rendered', this.replies.length, 'replies');
    }

    selectReply(replyId) {
        const reply = this.replies.find(r => r.id === replyId);

        if (!reply) {
            console.error('[QUICK-REPLY] ❌ Reply not found:', replyId);
            return;
        }

        console.log('[QUICK-REPLY] ✅ Selected reply:', reply.shortcut || reply.id);

        this.insertToInput(reply.message);
    }

    insertToInput(message) {
        if (!this.targetInputId) {
            console.error('[QUICK-REPLY] ❌ No target input specified');
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy ô nhập liệu');
            }
            return;
        }

        const inputElement = document.getElementById(this.targetInputId);

        if (!inputElement) {
            console.error('[QUICK-REPLY] ❌ Target input not found:', this.targetInputId);
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy ô nhập liệu');
            }
            return;
        }

        // Insert message
        const currentValue = inputElement.value || '';
        const newValue = currentValue ? `${currentValue}\n${message}` : message;
        inputElement.value = newValue;

        console.log('[QUICK-REPLY] ✅ Inserted message to input');

        // Show notification
        if (window.notificationManager) {
            window.notificationManager.success('Đã chèn tin nhắn mẫu', 2000);
        }

        // Close modal
        this.closeModal();

        // Focus input
        inputElement.focus();

        // Move cursor to end
        if (inputElement.setSelectionRange) {
            const len = inputElement.value.length;
            inputElement.setSelectionRange(len, len);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =====================================================
    // AUTOCOMPLETE FEATURE
    // =====================================================

    createAutocompleteDOM() {
        if (document.getElementById('quickReplyAutocomplete')) {
            return;
        }

        const autocompleteHTML = `
            <div class="quick-reply-autocomplete" id="quickReplyAutocomplete">
                <!-- Suggestions will be rendered here -->
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', autocompleteHTML);
        console.log('[QUICK-REPLY] ✅ Autocomplete DOM created');
    }

    setupAutocomplete() {
        // Wait for DOM to be ready
        setTimeout(() => {
            const chatInput = document.getElementById('chatReplyInput');
            if (!chatInput) {
                console.log('[QUICK-REPLY] ⚠️ chatReplyInput not found, autocomplete disabled');
                return;
            }

            // Attach event listeners
            chatInput.addEventListener('input', (e) => this.handleAutocompleteInput(e));
            chatInput.addEventListener('keydown', (e) => this.handleAutocompleteKeydown(e));

            console.log('[QUICK-REPLY] ✅ Autocomplete setup complete');
        }, 1000);
    }

    handleAutocompleteInput(e) {
        const input = e.target;
        const value = input.value;
        const cursorPos = input.selectionStart;

        // Find the last / before cursor
        const textBeforeCursor = value.substring(0, cursorPos);
        const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

        if (lastSlashIndex === -1) {
            this.hideAutocomplete();
            return;
        }

        // Get text after /
        const query = textBeforeCursor.substring(lastSlashIndex + 1);

        // Check if there's a space after / (means query ended)
        if (query.includes(' ') || query.includes('\n')) {
            this.hideAutocomplete();
            return;
        }

        // Filter suggestions
        this.currentSuggestions = this.replies.filter(reply => {
            if (!reply.shortcut) return false;
            return reply.shortcut.toLowerCase().startsWith(query.toLowerCase());
        });

        if (this.currentSuggestions.length > 0) {
            this.showAutocomplete(input, query, lastSlashIndex);
        } else {
            this.hideAutocomplete();
        }
    }

    handleAutocompleteKeydown(e) {
        if (!this.autocompleteActive) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedSuggestionIndex = Math.min(
                this.selectedSuggestionIndex + 1,
                this.currentSuggestions.length - 1
            );
            this.renderAutocomplete();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, 0);
            this.renderAutocomplete();
        } else if (e.key === 'Enter' && this.selectedSuggestionIndex >= 0) {
            e.preventDefault();
            const selected = this.currentSuggestions[this.selectedSuggestionIndex];
            if (selected) {
                this.applyAutocompleteSuggestion(selected);
            }
        } else if (e.key === 'Escape') {
            this.hideAutocomplete();
        }
    }

    showAutocomplete(inputElement, query, slashIndex) {
        this.autocompleteActive = true;
        this.selectedSuggestionIndex = 0;

        // Position dropdown below input
        const dropdown = document.getElementById('quickReplyAutocomplete');
        const inputRect = inputElement.getBoundingClientRect();

        dropdown.style.left = inputRect.left + 'px';
        dropdown.style.top = (inputRect.bottom + 4) + 'px';
        dropdown.style.width = Math.max(400, inputRect.width) + 'px';
        dropdown.style.display = 'block';

        this.renderAutocomplete();
    }

    renderAutocomplete() {
        const dropdown = document.getElementById('quickReplyAutocomplete');

        const suggestionsHTML = this.currentSuggestions.map((reply, index) => {
            const isSelected = index === this.selectedSuggestionIndex;
            const topicHTML = reply.topic ? `
                <span class="quick-reply-topic" style="background-color: ${reply.topicColor || '#6b7280'}; font-size: 10px; padding: 2px 6px;">
                    ${this.escapeHtml(reply.topic)}
                </span>
            ` : '';

            const messagePreview = reply.message.length > 60
                ? reply.message.substring(0, 60) + '...'
                : reply.message;

            return `
                <div class="autocomplete-item ${isSelected ? 'selected' : ''}"
                     data-index="${index}"
                     onclick="quickReplyManager.selectAutocompleteSuggestion(${index})">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 600; color: #667eea; min-width: 80px;">/${this.escapeHtml(reply.shortcut)}</span>
                        ${topicHTML}
                    </div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                        ${this.escapeHtml(messagePreview)}
                    </div>
                </div>
            `;
        }).join('');

        dropdown.innerHTML = suggestionsHTML;
    }

    selectAutocompleteSuggestion(index) {
        const selected = this.currentSuggestions[index];
        if (selected) {
            this.applyAutocompleteSuggestion(selected);
        }
    }

    applyAutocompleteSuggestion(reply) {
        const input = document.getElementById('chatReplyInput');
        if (!input) return;

        const value = input.value;
        const cursorPos = input.selectionStart;
        const textBeforeCursor = value.substring(0, cursorPos);
        const textAfterCursor = value.substring(cursorPos);

        // Find the / that triggered autocomplete
        const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

        // Replace from / to cursor with the message
        const newValue = value.substring(0, lastSlashIndex) + reply.message + textAfterCursor;
        input.value = newValue;

        // Set cursor position after inserted text
        const newCursorPos = lastSlashIndex + reply.message.length;
        input.setSelectionRange(newCursorPos, newCursorPos);

        this.hideAutocomplete();
        input.focus();

        console.log('[QUICK-REPLY] ✅ Applied autocomplete:', reply.shortcut);
    }

    hideAutocomplete() {
        this.autocompleteActive = false;
        this.selectedSuggestionIndex = -1;
        this.currentSuggestions = [];

        const dropdown = document.getElementById('quickReplyAutocomplete');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }
}

// =====================================================
// INITIALIZE
// =====================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuickReplyManager);
} else {
    initQuickReplyManager();
}

function initQuickReplyManager() {
    console.log('%c🚀 QUICK REPLY MANAGER', 'background: #667eea; color: white; padding: 8px; font-weight: bold;');
    const quickReplyManager = new QuickReplyManager();
    window.quickReplyManager = quickReplyManager;
    console.log('✅ QuickReplyManager initialized and ready');
}
