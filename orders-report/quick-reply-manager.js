// =====================================================
// QUICK REPLY MANAGER - Fast Message Templates for Chat
// =====================================================

class QuickReplyManager {
    constructor() {
        this.replies = [];
        this.targetInputId = null;
        this.STORAGE_KEY = 'quickReplies';
        this.FIREBASE_COLLECTION = 'quickReplies';
        this.autocompleteActive = false;
        this.selectedSuggestionIndex = -1;
        this.currentSuggestions = [];
        this.db = null;
        this.init();
    }

    init() {
        console.log('[QUICK-REPLY] 🚀 Initializing...');
        this.createModalDOM();
        this.createSettingsModalDOM();
        this.createTemplateInputModalDOM();
        this.createAutocompleteDOM();
        this.initFirebase();
        this.loadReplies();
        this.attachEventListeners();
        this.setupAutocomplete();
    }

    initFirebase() {
        try {
            // Check if Firebase is initialized
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                this.db = firebase.firestore();
                console.log('[QUICK-REPLY] ✅ Firebase Firestore initialized');
            } else {
                console.warn('[QUICK-REPLY] ⚠️ Firebase not available, using localStorage only');
            }
        } catch (error) {
            console.error('[QUICK-REPLY] ❌ Firebase init error:', error);
        }
    }

    createSettingsModalDOM() {
        if (document.getElementById('quickReplySettingsModal')) {
            return;
        }

        const settingsHTML = `
            <div class="quick-reply-overlay" id="quickReplySettingsModal">
                <div class="quick-reply-modal" style="max-width: 700px;">
                    <!-- Header -->
                    <div class="quick-reply-header">
                        <h3>
                            <i class="fas fa-cog"></i>
                            Quản lý mẫu tin nhắn
                        </h3>
                        <button class="quick-reply-close" onclick="quickReplyManager.closeSettings()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="quick-reply-body" id="quickReplySettingsBody" style="padding: 20px;">
                        <button onclick="quickReplyManager.addNewTemplate()"
                                style="width: 100%; padding: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 8px; font-weight: 600; margin-bottom: 16px; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.3)'"
                                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            <i class="fas fa-plus"></i> Thêm mẫu mới
                        </button>
                        <div id="settingsTemplateList"></div>
                    </div>

                    <!-- Footer -->
                    <div class="quick-reply-footer">
                        <div class="quick-reply-footer-info">
                            Quản lý danh sách mẫu tin nhắn
                        </div>
                        <div class="quick-reply-footer-actions">
                            <button onclick="quickReplyManager.closeSettings()">
                                <i class="fas fa-check"></i> Xong
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', settingsHTML);
        console.log('[QUICK-REPLY] ✅ Settings modal DOM created');
    }

    createTemplateInputModalDOM() {
        if (document.getElementById('templateInputModal')) {
            return;
        }

        const inputModalHTML = `
            <div class="quick-reply-overlay" id="templateInputModal" style="display: none;">
                <div class="quick-reply-modal" style="max-width: 600px;">
                    <!-- Header -->
                    <div class="quick-reply-header">
                        <h3 id="templateInputModalTitle">
                            <i class="fas fa-edit"></i>
                            Thêm mẫu tin nhắn
                        </h3>
                        <button class="quick-reply-close" onclick="quickReplyManager.closeTemplateInputModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="quick-reply-body" style="padding: 20px;">
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">
                                Ký tự tắt <span style="color: #ef4444;">*</span>
                            </label>
                            <input type="text" id="templateInputShortcut" placeholder="VD: CÁMƠN, STK"
                                style="width: 100%; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
                                onfocus="this.style.borderColor='#667eea';"
                                onblur="this.style.borderColor='#e5e7eb';" />
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">
                                Chủ đề
                            </label>
                            <input type="text" id="templateInputTopic" placeholder="Có thể bỏ trống"
                                style="width: 100%; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
                                onfocus="this.style.borderColor='#667eea';"
                                onblur="this.style.borderColor='#e5e7eb';" />
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">
                                Mã màu
                            </label>
                            <input type="text" id="templateInputColor" placeholder="VD: #3add99"
                                style="width: 100%; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
                                onfocus="this.style.borderColor='#667eea';"
                                onblur="this.style.borderColor='#e5e7eb';" />
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">
                                Nội dung tin nhắn <span style="color: #ef4444;">*</span>
                            </label>
                            <textarea id="templateInputMessage" placeholder="Nhập nội dung tin nhắn (Shift+Enter để xuống dòng)" rows="6"
                                style="width: 100%; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s; resize: vertical; font-family: inherit; line-height: 1.5;"
                                onfocus="this.style.borderColor='#667eea';"
                                onblur="this.style.borderColor='#e5e7eb';"></textarea>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="quick-reply-footer">
                        <div class="quick-reply-footer-actions" style="width: 100%; display: flex; gap: 8px; justify-content: flex-end;">
                            <button onclick="quickReplyManager.closeTemplateInputModal()"
                                style="padding: 10px 20px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.background='#e5e7eb';"
                                onmouseout="this.style.background='#f3f4f6';">
                                <i class="fas fa-times"></i> Hủy
                            </button>
                            <button id="templateInputSaveBtn" onclick="quickReplyManager.saveTemplateInput()"
                                style="padding: 10px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)';"
                                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                                <i class="fas fa-check"></i> Lưu
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', inputModalHTML);
        console.log('[QUICK-REPLY] ✅ Template input modal DOM created');
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
                            <button onclick="quickReplyManager.openSettings()">
                                <i class="fas fa-cog"></i> Cài đặt
                            </button>
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

    async loadReplies() {
        console.log('[QUICK-REPLY] 📥 Loading replies...');

        // Try to load from localStorage first (faster)
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                this.replies = JSON.parse(stored);
                console.log('[QUICK-REPLY] ✅ Loaded', this.replies.length, 'replies from localStorage (cached)');
                return;
            } catch (e) {
                console.error('[QUICK-REPLY] ❌ Error parsing localStorage:', e);
                // Continue to Firebase if localStorage is corrupted
            }
        }

        // If no localStorage, load from Firebase and cache it
        if (this.db) {
            try {
                console.log('[QUICK-REPLY] 🔄 Loading from Firebase...');
                const snapshot = await this.db.collection(this.FIREBASE_COLLECTION)
                    .orderBy('id', 'asc')
                    .get();

                if (!snapshot.empty) {
                    this.replies = snapshot.docs.map(doc => ({
                        ...doc.data(),
                        docId: doc.id // Keep Firestore doc ID for updates
                    }));

                    // Cache to localStorage
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.replies));

                    console.log('[QUICK-REPLY] ✅ Loaded', this.replies.length, 'replies from Firebase');
                    return;
                } else {
                    console.log('[QUICK-REPLY] ℹ️ No replies in Firebase, using defaults...');
                    this.replies = this.getDefaultReplies();
                    // Cache defaults to localStorage
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.replies));
                    return;
                }
            } catch (error) {
                console.error('[QUICK-REPLY] ❌ Firebase load error:', error);
                this.replies = this.getDefaultReplies();
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.replies));
            }
        } else {
            console.log('[QUICK-REPLY] ⚠️ Firebase not available, using default replies');
            this.replies = this.getDefaultReplies();
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.replies));
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
                message: 'Dạ hàng của mình đã được lên bill , cám ơn chị yêu đã ủng hộ shop ạ ❤️',
                imageUrl: 'https://content.pancake.vn/2-25/2025/5/21/2c82b1de2b01a5ad96990f2a14277eaa22d65093.jpg'
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

    async saveReplies() {
        console.log('[QUICK-REPLY] 💾 Saving replies to Firebase...');

        // Save to Firebase
        if (this.db) {
            try {
                console.log('[QUICK-REPLY] 🔄 Syncing to Firebase...');

                // Use batch write for better performance
                const batch = this.db.batch();

                // Delete all existing documents first
                const existingDocs = await this.db.collection(this.FIREBASE_COLLECTION).get();
                existingDocs.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });

                // Add all current replies
                this.replies.forEach(reply => {
                    const docRef = this.db.collection(this.FIREBASE_COLLECTION).doc();
                    const replyData = { ...reply };
                    delete replyData.docId; // Remove docId before saving
                    batch.set(docRef, replyData);
                });

                await batch.commit();
                console.log('[QUICK-REPLY] ✅ Synced', this.replies.length, 'replies to Firebase');

                // Clear localStorage and reload from Firebase to get fresh data
                console.log('[QUICK-REPLY] 🗑️ Clearing localStorage cache...');
                localStorage.removeItem(this.STORAGE_KEY);

                console.log('[QUICK-REPLY] 🔄 Reloading from Firebase...');
                await this.loadReplies();

            } catch (error) {
                console.error('[QUICK-REPLY] ❌ Firebase save error:', error);
                throw error; // Throw error so user knows save failed
            }
        } else {
            console.error('[QUICK-REPLY] ❌ Firebase not available, cannot save');
            throw new Error('Firebase không khả dụng');
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

        // Check if this reply has an imageUrl - send image first, then text
        if (reply.imageUrl) {
            console.log('[QUICK-REPLY] 🖼️ Reply has imageUrl, sending image first then text');
            this.closeModal();
            this.sendQuickReplyWithImage(reply.imageUrl, reply.message);
            return;
        }

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

        // Check if this reply has an imageUrl - send image first, then text
        if (reply.imageUrl) {
            console.log('[QUICK-REPLY] 🖼️ Reply has imageUrl, sending image first then text');
            this.hideAutocomplete();

            // Clear the input (remove the /COMMAND text)
            const value = input.value;
            const cursorPos = input.selectionStart;
            const textBeforeCursor = value.substring(0, cursorPos);
            const lastSlashIndex = textBeforeCursor.lastIndexOf('/');
            const textAfterCursor = value.substring(cursorPos);
            input.value = value.substring(0, lastSlashIndex) + textAfterCursor;

            // Send image first, then text
            this.sendQuickReplyWithImage(reply.imageUrl, reply.message);
            return;
        }

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

    /**
     * Send quick reply with image - sends image first, then text message
     * @param {string} imageUrl - URL of the image to send
     * @param {string} message - Text message to send after the image
     */
    async sendQuickReplyWithImage(imageUrl, message) {
        console.log('[QUICK-REPLY] 🚀 Sending quick reply with image');
        console.log('[QUICK-REPLY] Image URL:', imageUrl);
        console.log('[QUICK-REPLY] Message:', message);

        // Check if we have the required info
        if (!window.currentConversationId || !window.currentChatChannelId) {
            console.error('[QUICK-REPLY] ❌ Missing conversation info');
            if (window.notificationManager) {
                window.notificationManager.error('Không thể gửi: Thiếu thông tin cuộc hội thoại');
            }
            return;
        }

        try {
            // Get Pancake token
            const token = await window.pancakeTokenManager.getToken();
            if (!token) {
                throw new Error('Không tìm thấy Pancake token');
            }

            const channelId = window.currentSendPageId || window.currentChatChannelId;
            const conversationId = window.currentConversationId;
            const customerId = window.currentCustomerUUID;

            // Show loading indicator
            if (window.notificationManager) {
                window.notificationManager.info('Đang gửi hình ảnh...', 3000);
            }

            // Step 1: Send the IMAGE first
            console.log('[QUICK-REPLY] 📤 Sending image...');
            const imageFormData = new FormData();
            imageFormData.append('action', 'reply_inbox');
            imageFormData.append('message', ''); // Empty message, just image
            imageFormData.append('content_urls', JSON.stringify([imageUrl]));

            let queryParams = `access_token=${token}`;
            if (customerId) {
                queryParams += `&customer_id=${customerId}`;
            }

            const apiUrl = window.API_CONFIG.buildUrl.pancake(
                `pages/${channelId}/conversations/${conversationId}/messages`,
                queryParams
            );

            const imageResponse = await API_CONFIG.smartFetch(apiUrl, {
                method: 'POST',
                body: imageFormData
            });

            if (!imageResponse.ok) {
                const errorText = await imageResponse.text();
                console.error('[QUICK-REPLY] ❌ Image send failed:', errorText);
                throw new Error('Gửi hình ảnh thất bại');
            }

            const imageResult = await imageResponse.json();
            console.log('[QUICK-REPLY] ✅ Image sent:', imageResult);

            // Step 2: Wait a moment then send the TEXT message
            console.log('[QUICK-REPLY] ⏳ Waiting before sending text...');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Add employee signature
            let finalMessage = message;
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;
            if (displayName) {
                finalMessage = message + '\nNv. ' + displayName;
            }

            console.log('[QUICK-REPLY] 📤 Sending text message...');
            const textFormData = new FormData();
            textFormData.append('action', 'reply_inbox');
            textFormData.append('message', finalMessage);

            const textResponse = await API_CONFIG.smartFetch(apiUrl, {
                method: 'POST',
                body: textFormData
            });

            if (!textResponse.ok) {
                const errorText = await textResponse.text();
                console.error('[QUICK-REPLY] ❌ Text send failed:', errorText);
                throw new Error('Gửi tin nhắn thất bại');
            }

            const textResult = await textResponse.json();
            console.log('[QUICK-REPLY] ✅ Text sent:', textResult);

            // Success notification
            if (window.notificationManager) {
                window.notificationManager.success('Đã gửi tin nhắn cảm ơn!', 3000);
            }

            // Refresh messages in UI
            setTimeout(async () => {
                try {
                    if (window.currentChatPSID && window.chatDataManager) {
                        const response = await window.chatDataManager.fetchMessages(channelId, window.currentChatPSID);
                        if (response.messages && response.messages.length > 0) {
                            window.allChatMessages = response.messages;
                            if (window.renderChatMessages) {
                                window.renderChatMessages(window.allChatMessages, false);
                            }
                            console.log('[QUICK-REPLY] ✅ Messages refreshed');
                        }
                    }
                } catch (refreshError) {
                    console.warn('[QUICK-REPLY] ⚠️ Failed to refresh messages:', refreshError);
                }
            }, 300);

        } catch (error) {
            console.error('[QUICK-REPLY] ❌ Error:', error);
            if (window.notificationManager) {
                window.notificationManager.error('Lỗi: ' + error.message);
            }
        }
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

    // =====================================================
    // SETTINGS MANAGEMENT
    // =====================================================

    openSettings() {
        console.log('[QUICK-REPLY] ⚙️ Opening settings...');

        const modal = document.getElementById('quickReplySettingsModal');
        modal?.classList.add('active');

        this.renderSettingsList();
    }

    closeSettings() {
        console.log('[QUICK-REPLY] ⚙️ Closing settings...');

        const modal = document.getElementById('quickReplySettingsModal');
        modal?.classList.remove('active');

        // Reload main modal if it's open
        if (this.isModalOpen()) {
            this.renderReplies();
        }
    }

    renderSettingsList() {
        const listEl = document.getElementById('settingsTemplateList');
        if (!listEl) return;

        if (this.replies.length === 0) {
            listEl.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">Chưa có mẫu tin nhắn nào</p>';
            return;
        }

        const itemsHTML = this.replies.map((reply, index) => {
            const topicHTML = reply.topic ? `
                <span class="quick-reply-topic" style="background-color: ${reply.topicColor || '#6b7280'}; font-size: 11px; padding: 3px 8px; margin-left: 8px;">
                    ${this.escapeHtml(reply.topic)}
                </span>
            ` : '';

            return `
                <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; margin-bottom: 6px;">
                                <strong style="color: #667eea;">/${this.escapeHtml(reply.shortcut || '')}</strong>
                                ${topicHTML}
                            </div>
                            <div style="font-size: 13px; color: #6b7280; line-height: 1.5; max-height: 60px; overflow: hidden;">
                                ${this.escapeHtml(reply.message.substring(0, 100))}${reply.message.length > 100 ? '...' : ''}
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; margin-left: 12px;">
                            <button onclick="quickReplyManager.editTemplate(${reply.id})"
                                    style="padding: 6px 12px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                <i class="fas fa-edit"></i> Sửa
                            </button>
                            <button onclick="quickReplyManager.deleteTemplate(${reply.id})"
                                    style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                <i class="fas fa-trash"></i> Xóa
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        listEl.innerHTML = itemsHTML;
    }

    addNewTemplate() {
        // Open modal for adding new template
        this.currentEditingTemplateId = null; // null means adding new
        this.openTemplateInputModal('Thêm mẫu tin nhắn', '', '', '', '');
    }

    openTemplateInputModal(title, shortcut = '', topic = '', topicColor = '', message = '') {
        const modal = document.getElementById('templateInputModal');
        const modalTitle = document.getElementById('templateInputModalTitle');
        const shortcutInput = document.getElementById('templateInputShortcut');
        const topicInput = document.getElementById('templateInputTopic');
        const colorInput = document.getElementById('templateInputColor');
        const messageInput = document.getElementById('templateInputMessage');

        if (!modal) {
            console.error('[QUICK-REPLY] Template input modal not found');
            return;
        }

        // Set values
        modalTitle.innerHTML = `<i class="fas fa-edit"></i> ${title}`;
        shortcutInput.value = shortcut;
        topicInput.value = topic;
        colorInput.value = topicColor;
        messageInput.value = message;

        // Add keyboard event listener
        const handleKeyDown = (e) => {
            // Escape to close
            if (e.key === 'Escape') {
                this.closeTemplateInputModal();
            }
            // Ctrl+Enter or Cmd+Enter to save
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.saveTemplateInput();
            }
        };

        // Remove old listener if exists and add new one
        modal.removeEventListener('keydown', this._templateInputKeyHandler);
        this._templateInputKeyHandler = handleKeyDown;
        modal.addEventListener('keydown', this._templateInputKeyHandler);

        // Show modal
        modal.style.display = 'flex';

        // Focus on first input
        setTimeout(() => shortcutInput.focus(), 100);
    }

    closeTemplateInputModal() {
        const modal = document.getElementById('templateInputModal');
        if (modal) {
            modal.style.display = 'none';
            // Remove keyboard event listener
            if (this._templateInputKeyHandler) {
                modal.removeEventListener('keydown', this._templateInputKeyHandler);
            }
        }
        this.currentEditingTemplateId = null;
    }

    async saveTemplateInput() {
        const shortcutInput = document.getElementById('templateInputShortcut');
        const topicInput = document.getElementById('templateInputTopic');
        const colorInput = document.getElementById('templateInputColor');
        const messageInput = document.getElementById('templateInputMessage');

        const shortcut = shortcutInput.value.trim();
        const topic = topicInput.value.trim();
        const topicColor = colorInput.value.trim() || '#6b7280';
        const message = messageInput.value.trim();

        // Validation
        if (!shortcut) {
            alert('Vui lòng nhập ký tự tắt!');
            shortcutInput.focus();
            return;
        }

        if (!message) {
            alert('Vui lòng nhập nội dung tin nhắn!');
            messageInput.focus();
            return;
        }

        try {
            if (this.currentEditingTemplateId === null) {
                // Adding new template
                const maxId = this.replies.length > 0 ? Math.max(...this.replies.map(r => r.id)) : 0;

                const newReply = {
                    id: maxId + 1,
                    shortcut: shortcut,
                    topic: topic,
                    topicColor: topicColor,
                    message: message
                };

                this.replies.push(newReply);
                await this.saveReplies();
                this.renderSettingsList();

                if (window.notificationManager) {
                    window.notificationManager.success('Đã thêm mẫu tin nhắn mới!');
                }

                console.log('[QUICK-REPLY] ✅ Added new template:', shortcut);
            } else {
                // Editing existing template
                const reply = this.replies.find(r => r.id === this.currentEditingTemplateId);
                if (!reply) {
                    alert('Không tìm thấy mẫu tin nhắn!');
                    return;
                }

                // Backup old values for rollback
                const oldValues = {
                    shortcut: reply.shortcut,
                    topic: reply.topic,
                    topicColor: reply.topicColor,
                    message: reply.message
                };

                reply.shortcut = shortcut;
                reply.topic = topic;
                reply.topicColor = topicColor;
                reply.message = message;

                try {
                    await this.saveReplies();
                    this.renderSettingsList();

                    if (window.notificationManager) {
                        window.notificationManager.success('Đã cập nhật mẫu tin nhắn!');
                    }

                    console.log('[QUICK-REPLY] ✅ Updated template:', this.currentEditingTemplateId);
                } catch (error) {
                    // Rollback if save failed
                    reply.shortcut = oldValues.shortcut;
                    reply.topic = oldValues.topic;
                    reply.topicColor = oldValues.topicColor;
                    reply.message = oldValues.message;
                    throw error;
                }
            }

            // Close modal on success
            this.closeTemplateInputModal();
        } catch (error) {
            if (window.notificationManager) {
                window.notificationManager.error('Lỗi khi lưu vào Firebase!');
            }
            console.error('[QUICK-REPLY] ❌ Failed to save template:', error);
        }
    }

    editTemplate(id) {
        const reply = this.replies.find(r => r.id === id);
        if (!reply) return;

        // Set current editing ID and open modal with template data
        this.currentEditingTemplateId = id;
        this.openTemplateInputModal(
            'Chỉnh sửa mẫu tin nhắn',
            reply.shortcut,
            reply.topic,
            reply.topicColor,
            reply.message
        );
    }

    async deleteTemplate(id) {
        const reply = this.replies.find(r => r.id === id);
        if (!reply) return;

        if (!confirm(`Xóa mẫu "${reply.shortcut || reply.topic}"?`)) {
            return;
        }

        // Backup for rollback
        const deletedReply = { ...reply };
        const oldReplies = [...this.replies];

        this.replies = this.replies.filter(r => r.id !== id);

        try {
            await this.saveReplies();
            this.renderSettingsList();

            if (window.notificationManager) {
                window.notificationManager.success('Đã xóa mẫu tin nhắn!');
            }

            console.log('[QUICK-REPLY] ✅ Deleted template:', id);
        } catch (error) {
            // Rollback if save failed
            this.replies = oldReplies;

            if (window.notificationManager) {
                window.notificationManager.error('Lỗi khi lưu vào Firebase!');
            }
            console.error('[QUICK-REPLY] ❌ Failed to delete template:', error);
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
