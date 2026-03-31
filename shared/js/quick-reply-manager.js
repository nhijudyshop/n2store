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
        this._repliesLoaded = false;
        this._repliesLoadedPromise = null;
        this.init();
    }

    init() {
        console.log('[QUICK-REPLY] 🚀 Initializing...');
        this.createModalDOM();
        this.createSettingsModalDOM();
        this.createTemplateInputModalDOM();
        this.createAutocompleteDOM();
        this.initFirebase();
        this._repliesLoadedPromise = this.loadReplies().then(() => {
            this._repliesLoaded = true;
        });
        this.attachEventListeners();
        this.setupAutocomplete();
    }

    async ensureRepliesLoaded() {
        if (!this._repliesLoaded && this._repliesLoadedPromise) {
            await this._repliesLoadedPromise;
        }
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

                        <!-- Image Upload Area -->
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">
                                Hình ảnh đính kèm
                            </label>
                            <div id="templateImageDropZone"
                                style="border: 2px dashed #e5e7eb; border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.2s; background: #f9fafb;"
                                onclick="document.getElementById('templateImageFileInput').click()">
                                <div id="templateImagePreviewContainer" style="display: none;">
                                    <img id="templateImagePreview" src="" alt="Preview" style="max-width: 100%; max-height: 150px; border-radius: 6px; margin-bottom: 8px;" />
                                    <div style="display: flex; justify-content: center; gap: 8px;">
                                        <button type="button" onclick="event.stopPropagation(); quickReplyManager.removeTemplateImage();"
                                            style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
                                            <i class="fas fa-trash"></i> Xóa ảnh
                                        </button>
                                    </div>
                                </div>
                                <div id="templateImagePlaceholder">
                                    <i class="fas fa-image" style="font-size: 32px; color: #9ca3af; margin-bottom: 8px;"></i>
                                    <p style="color: #6b7280; margin: 0; font-size: 13px;">Paste hình (Ctrl+V) hoặc click để chọn</p>
                                    <p style="color: #9ca3af; margin: 4px 0 0 0; font-size: 11px;">Hình sẽ được gửi trước, text gửi sau</p>
                                </div>
                            </div>
                            <input type="file" id="templateImageFileInput" accept="image/*" style="display: none;"
                                onchange="quickReplyManager.handleTemplateImageSelect(event)" />
                            <input type="hidden" id="templateInputImageUrl" value="" />
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
        this.setupTemplateImagePaste();
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

        // Try to load from IndexedDB first (faster)
        let stored = null;
        try {
            if (window.indexedDBStorage) {
                await window.indexedDBStorage.readyPromise;
                stored = await window.indexedDBStorage.getItem(this.STORAGE_KEY);
            }
        } catch (e) {
            console.warn('[QUICK-REPLY] ⚠️ IndexedDB read failed:', e);
        }

        // Fallback to localStorage if IndexedDB not available or empty
        if (!stored) {
            const localStored = localStorage.getItem(this.STORAGE_KEY);
            if (localStored) {
                try {
                    stored = JSON.parse(localStored);
                    // Migrate to IndexedDB
                    if (window.indexedDBStorage) {
                        await window.indexedDBStorage.setItem(this.STORAGE_KEY, stored);
                        localStorage.removeItem(this.STORAGE_KEY);
                        console.log('[QUICK-REPLY] 🔄 Migrated from localStorage to IndexedDB');
                    }
                } catch (e) {
                    console.error('[QUICK-REPLY] ❌ Error parsing localStorage:', e);
                }
            }
        }

        if (stored && Array.isArray(stored)) {
            this.replies = stored;
            console.log('[QUICK-REPLY] ✅ Loaded', this.replies.length, 'replies from cache');
            return;
        }

        // If no cache, load from Firebase and cache it
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

                    // Cache to IndexedDB
                    await this.saveToCache();

                    console.log('[QUICK-REPLY] ✅ Loaded', this.replies.length, 'replies from Firebase');
                    return;
                } else {
                    console.log('[QUICK-REPLY] ℹ️ No replies in Firebase, using defaults...');
                    this.replies = this.getDefaultReplies();
                    // Cache defaults to IndexedDB
                    await this.saveToCache();
                    return;
                }
            } catch (error) {
                console.error('[QUICK-REPLY] ❌ Firebase load error:', error);
                this.replies = this.getDefaultReplies();
                await this.saveToCache();
            }
        } else {
            console.log('[QUICK-REPLY] ⚠️ Firebase not available, using default replies');
            this.replies = this.getDefaultReplies();
            await this.saveToCache();
        }
    }

    async saveToCache() {
        try {
            if (window.indexedDBStorage) {
                await window.indexedDBStorage.setItem(this.STORAGE_KEY, this.replies);
                console.log('[QUICK-REPLY] 💾 Saved to IndexedDB cache');
            } else {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.replies));
                console.log('[QUICK-REPLY] 💾 Saved to localStorage (fallback)');
            }
        } catch (error) {
            console.error('[QUICK-REPLY] ❌ Failed to save cache:', error);
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
                shortcut: 'CAMON',
                topic: 'C.ƠN KH',
                topicColor: '#cec40c',
                message: 'Dạ hàng của mình đã được lên bill , cám ơn chị yêu đã ủng hộ shop ạ ❤️',
                imageUrl: 'https://content.pancake.vn/2-25/2025/5/21/2c82b1de2b01a5ad96990f2a14277eaa22d65293.jpg'
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

                // Clear cache and reload from Firebase to get fresh data
                console.log('[QUICK-REPLY] 🗑️ Clearing cache...');
                if (window.indexedDBStorage) {
                    await window.indexedDBStorage.removeItem(this.STORAGE_KEY);
                }
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

    async openModal(targetInputId) {
        console.log('[QUICK-REPLY] 📂 Opening modal for input:', targetInputId);

        this.targetInputId = targetInputId;

        // Ensure replies are loaded from IndexedDB before rendering
        await this.ensureRepliesLoaded();

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

        // Check if this reply has an imageUrl or contentId - send image first, then text
        if (reply.imageUrl || reply.contentId) {
            console.log('[QUICK-REPLY] 🖼️ Reply has image, sending...');
            this.closeModal();
            this.sendQuickReplyWithImage(reply);
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

    /**
     * Remove Vietnamese diacritics from text for easier matching
     * e.g., "CÁMƠN" -> "CAMON", "ĐỔI" -> "DOI"
     */
    removeVietnameseDiacritics(str) {
        if (!str) return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
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
            // Support multiple input IDs: orders-report uses chatReplyInput, inbox uses chatInput
            const chatInput = document.getElementById('chatReplyInput') || document.getElementById('chatInput');
            if (!chatInput) {
                console.log('[QUICK-REPLY] ⚠️ Chat input not found, autocomplete disabled');
                return;
            }

            this._autocompleteInput = chatInput;

            // Attach event listeners
            chatInput.addEventListener('input', (e) => this.handleAutocompleteInput(e));
            chatInput.addEventListener('keydown', (e) => this.handleAutocompleteKeydown(e));

            console.log('[QUICK-REPLY] ✅ Autocomplete setup on #' + chatInput.id);
        }, 1000);
    }

    async handleAutocompleteInput(e) {
        const input = e.target;
        const value = input.value;
        const cursorPos = input.selectionStart;

        // Ensure replies are loaded from IndexedDB before filtering
        await this.ensureRepliesLoaded();

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

        // =====================================================
        // AUTO-SEND: Check for exact /CAMON match (case-insensitive)
        // Immediately sends image + text without needing Enter
        // =====================================================
        if (query.toUpperCase() === 'CAMON') {
            console.log('[QUICK-REPLY] 🚀 Auto-sending /CAMON quick reply');
            this.hideAutocomplete();

            // Clear the entire input field
            input.value = '';
            input.style.height = 'auto';

            // Find the CAMON reply from loaded templates (uses cached contentId if available)
            const camonReply = this.replies.find(r =>
                this.removeVietnameseDiacritics(r.shortcut || '').toUpperCase() === 'CAMON'
            );
            if (camonReply) {
                this.sendQuickReplyWithImage(camonReply);
            } else {
                // Fallback if not found in templates
                this.sendQuickReplyWithImage({
                    imageUrl: 'https://content.pancake.vn/2-25/2025/5/21/2c82b1de2b01a5ad96990f2a14277eaa22d65293.jpg',
                    message: 'Dạ hàng của mình đã được lên bill , cám ơn chị yêu đã ủng hộ shop ạ ❤️'
                });
            }
            return;
        }

        // Filter suggestions - match with Vietnamese diacritics removed
        const queryNoDiacritics = this.removeVietnameseDiacritics(query.toLowerCase());
        this.currentSuggestions = this.replies.filter(reply => {
            // When query is empty (just "/"), show ALL replies including those without shortcut
            if (!query) return true;
            if (!reply.shortcut) return false;
            // Compare both original and diacritics-removed versions
            const shortcutLower = reply.shortcut.toLowerCase();
            const shortcutNoDiacritics = this.removeVietnameseDiacritics(shortcutLower);
            return shortcutLower.startsWith(query.toLowerCase()) ||
                shortcutNoDiacritics.startsWith(queryNoDiacritics);
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
            e.stopImmediatePropagation(); // Prevent chat send handler from firing
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

        // Position dropdown above input (input is at bottom of page)
        const dropdown = document.getElementById('quickReplyAutocomplete');
        const inputRect = inputElement.getBoundingClientRect();

        dropdown.style.left = inputRect.left + 'px';
        dropdown.style.bottom = (window.innerHeight - inputRect.top + 4) + 'px';
        dropdown.style.top = 'auto';
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
        const input = this._autocompleteInput || document.getElementById('chatReplyInput') || document.getElementById('chatInput');
        if (!input) return;

        // DEBUG: Log reply object to check if imageUrl exists
        console.log('[QUICK-REPLY] 📋 Selected reply:', JSON.stringify(reply, null, 2));
        console.log('[QUICK-REPLY] 🖼️ Has imageUrl?', !!reply.imageUrl, '→', reply.imageUrl);

        // Check if this reply has an imageUrl or contentId - send image first, then text
        if (reply.imageUrl || reply.contentId) {
            console.log('[QUICK-REPLY] 🖼️ Reply has image, sending...');
            this.hideAutocomplete();

            // Clear the entire input field
            input.value = '';
            input.style.height = 'auto';

            // Send image first, then text
            this.sendQuickReplyWithImage(reply);
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
     * Send quick reply with image + text (2 separate requests)
     * Per Pancake API docs: message and content_ids are MUTUALLY EXCLUSIVE
     *
     * Optimization: if reply has a cached contentId, skip download+upload and send directly.
     * On first send without contentId, upload once and cache it back to Firebase.
     *
     * @param {Object} reply - The quick reply object { id, imageUrl, message, contentId?, ... }
     */
    async sendQuickReplyWithImage(reply) {
        const { imageUrl, message, contentId: cachedContentId, id: replyId } = reply;
        console.log('[QUICK-REPLY] Sending with image:', imageUrl, 'cachedContentId:', cachedContentId || 'none');
        window.isQuickReplySending = true;

        if (!window.currentConversationId || !window.currentChatChannelId) {
            if (window.notificationManager) window.notificationManager.error('Thiếu thông tin cuộc hội thoại');
            window.isQuickReplySending = false;
            return;
        }

        try {
            const pdm = window.pancakeDataManager;
            if (!pdm) throw new Error('pancakeDataManager not available');

            const channelId = window.currentSendPageId || window.currentChatChannelId;
            const conversationId = window.currentConversationId;
            const pat = await pdm.getPageAccessToken(channelId);
            if (!pat) throw new Error('Không tìm thấy page_access_token');

            if (window.notificationManager) window.notificationManager.info('Đang gửi...', 3000);

            // Add employee signature
            let finalMessage = message;
            const displayName = window.authManager?.getUserInfo?.()?.displayName
                || window.authManager?.getAuthState?.()?.displayName;
            if (displayName) finalMessage = message + '\nNv. ' + displayName;

            // Step 1: Get content_id — from cache or upload
            let contentId = cachedContentId;
            let imageSent = false;

            if (!contentId && imageUrl) {
                // No cached contentId → download + upload (first time only)
                console.log('[QUICK-REPLY] No cached contentId, downloading + uploading...');
                const downloaded = await fetch(imageUrl);
                if (!downloaded.ok) throw new Error('Tải ảnh thất bại');
                const blob = await downloaded.blob();
                const ext = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
                const file = new File([blob], `quick-reply.${ext}`, { type: blob.type || `image/${ext}` });

                const uploadResult = await pdm.uploadMedia(channelId, file, pat);
                console.log('[QUICK-REPLY] Upload result:', uploadResult);

                if (uploadResult?.id) {
                    contentId = uploadResult.id;
                    // Cache contentId back to template for future sends
                    this._cacheContentId(replyId, contentId);
                } else {
                    console.warn('[QUICK-REPLY] Upload returned no id:', uploadResult);
                }
            } else if (contentId) {
                console.log('[QUICK-REPLY] ⚡ Using cached contentId:', contentId);
            }

            // Step 2: Send image with content_ids
            if (contentId) {
                const sendResult = await pdm.sendMessage(channelId, conversationId, {
                    action: 'reply_inbox', content_ids: [contentId]
                }, pat);
                console.log('[QUICK-REPLY] Image send result:', sendResult);

                if (sendResult?.success === false) {
                    const errMsg = sendResult.message || '';
                    if (sendResult.e_code === 10 || errMsg.includes('khoảng thời gian cho phép')) {
                        if (window.notificationManager) window.notificationManager.show('Không thể gửi (quá 24h). Vui lòng dùng COMMENT!', 'warning', 8000);
                        return;
                    }
                    // If cached contentId expired/invalid, try re-upload
                    if (cachedContentId && imageUrl) {
                        console.warn('[QUICK-REPLY] Cached contentId failed, re-uploading...');
                        const downloaded = await fetch(imageUrl);
                        if (downloaded.ok) {
                            const blob = await downloaded.blob();
                            const ext = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
                            const file = new File([blob], `quick-reply.${ext}`, { type: blob.type || `image/${ext}` });
                            const uploadResult = await pdm.uploadMedia(channelId, file, pat);
                            if (uploadResult?.id) {
                                const retryResult = await pdm.sendMessage(channelId, conversationId, {
                                    action: 'reply_inbox', content_ids: [uploadResult.id]
                                }, pat);
                                if (retryResult?.success !== false) {
                                    imageSent = true;
                                    this._cacheContentId(replyId, uploadResult.id);
                                }
                            }
                        }
                    }
                    if (!imageSent) console.warn('[QUICK-REPLY] Image send failed:', errMsg);
                } else {
                    imageSent = true;
                    console.log('[QUICK-REPLY] ✅ Image sent');
                }
            }

            // Step 3: Send text separately (message and content_ids are mutually exclusive)
            if (imageSent) await new Promise(r => setTimeout(r, 300));
            console.log('[QUICK-REPLY] Sending text...');
            const textResult = await pdm.sendMessage(channelId, conversationId, {
                action: 'reply_inbox', message: finalMessage
            }, pat);

            const textSent = textResult?.success !== false;
            if (textSent) console.log('[QUICK-REPLY] ✅ Text sent');

            // Notify user
            if (imageSent && textSent) {
                if (window.notificationManager) window.notificationManager.success('Đã gửi!', 2000);
            } else if (textSent) {
                if (window.notificationManager) window.notificationManager.show('Đã gửi tin nhắn (ảnh thất bại)', 'warning', 4000);
            } else {
                throw new Error(textResult?.message || 'Gửi thất bại');
            }

            // Refresh messages
            this._refreshMessagesAfterSend(channelId, conversationId);

        } catch (error) {
            console.error('[QUICK-REPLY] Error:', error);
            if (window.notificationManager) window.notificationManager.error('Lỗi: ' + error.message);
        } finally {
            setTimeout(() => { window.isQuickReplySending = false; }, 500);
        }
    }

    /**
     * Cache contentId back to template in memory + Firebase
     * So next send uses cached contentId directly (no download+upload)
     */
    async _cacheContentId(replyId, contentId) {
        if (!replyId || !contentId) return;
        const reply = this.replies.find(r => r.id === replyId);
        if (!reply) return;

        reply.contentId = contentId;
        console.log('[QUICK-REPLY] 💾 Caching contentId for reply', replyId, ':', contentId);

        // Save to cache + Firebase in background (don't block send)
        this.saveToCache().catch(() => {});
        if (this.db) {
            try {
                await this.saveReplies();
                console.log('[QUICK-REPLY] ✅ contentId saved to Firebase');
            } catch (e) {
                console.warn('[QUICK-REPLY] ⚠️ Failed to save contentId to Firebase:', e);
            }
        }
    }

    /** Refresh chat messages after quick reply send */
    _refreshMessagesAfterSend(channelId, conversationId) {
        setTimeout(async () => {
            try {
                const pdm = window.pancakeDataManager;
                if (!pdm || window.currentConversationId !== conversationId) return;
                pdm.clearMessagesCache?.(channelId, conversationId);
                const result = await pdm.fetchMessages(channelId, conversationId);
                if (result.messages?.length > 0 && window.currentConversationId === conversationId) {
                    const pageId = channelId;
                    const messages = result.messages.map(msg => {
                        const isFromPage = msg.from?.id === pageId;
                        return {
                            id: msg.id,
                            text: msg.original_message || (msg.message || '').replace(/<[^>]+>/g, ''),
                            time: window._parseTimestamp?.(msg.inserted_at) || new Date(msg.inserted_at),
                            sender: isFromPage ? 'shop' : 'customer',
                            senderName: msg.from?.name || '',
                            fromId: msg.from?.id || '',
                            attachments: msg.attachments || [],
                            reactions: (msg.attachments || []).filter(a => a.type === 'reaction'),
                            reactionSummary: msg.reaction_summary || msg.reactions || null,
                            isHidden: msg.is_hidden || false,
                            isRemoved: msg.is_removed || false,
                            canHide: msg.can_hide !== false,
                            canRemove: msg.can_remove !== false,
                            canLike: msg.can_like !== false,
                            userLikes: msg.user_likes || false,
                            privateReplyConversation: msg.private_reply_conversation || null,
                        };
                    });
                    window.allChatMessages = messages;
                    if (window.renderChatMessages) window.renderChatMessages(messages);
                }
            } catch (e) { /* ignore refresh error */ }
        }, 2000);
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
        this.openTemplateInputModal('Thêm mẫu tin nhắn', '', '', '', '', '');
    }

    openTemplateInputModal(title, shortcut = '', topic = '', topicColor = '', message = '', imageUrl = '') {
        const modal = document.getElementById('templateInputModal');
        const modalTitle = document.getElementById('templateInputModalTitle');
        const shortcutInput = document.getElementById('templateInputShortcut');
        const topicInput = document.getElementById('templateInputTopic');
        const colorInput = document.getElementById('templateInputColor');
        const messageInput = document.getElementById('templateInputMessage');
        const imageUrlInput = document.getElementById('templateInputImageUrl');

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

        // Handle image URL
        if (imageUrlInput) {
            imageUrlInput.value = imageUrl || '';
        }
        this.pendingTemplateImageBlob = null; // Clear any pending blob

        // Update image preview
        this.updateTemplateImagePreview(imageUrl);

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
        this.pendingTemplateImageBlob = null;
    }

    // =====================================================
    // TEMPLATE IMAGE HANDLING
    // =====================================================

    setupTemplateImagePaste() {
        // Wait for modal to be in DOM
        setTimeout(() => {
            const modal = document.getElementById('templateInputModal');
            if (modal) {
                modal.addEventListener('paste', (e) => this.handleTemplateImagePaste(e));
                console.log('[QUICK-REPLY] ✅ Template image paste listener attached');
            }
        }, 100);
    }

    handleTemplateImagePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) {
                    this.processTemplateImage(blob);
                }
                return;
            }
        }
    }

    handleTemplateImageSelect(event) {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            this.processTemplateImage(file);
        }
        // Reset input so the same file can be selected again
        event.target.value = '';
    }

    async processTemplateImage(blob) {
        console.log('[QUICK-REPLY] 🖼️ Processing template image...');

        // Store the blob for upload when saving
        this.pendingTemplateImageBlob = blob;

        // Show preview immediately using local URL
        const localUrl = URL.createObjectURL(blob);
        this.updateTemplateImagePreview(localUrl);

        // Clear the hidden imageUrl input since we'll upload on save
        const imageUrlInput = document.getElementById('templateInputImageUrl');
        if (imageUrlInput) {
            imageUrlInput.value = ''; // Will be set after upload
        }

        if (window.notificationManager) {
            window.notificationManager.info('Hình sẽ được upload khi lưu mẫu', 2000);
        }
    }

    updateTemplateImagePreview(imageUrl) {
        const previewContainer = document.getElementById('templateImagePreviewContainer');
        const previewImg = document.getElementById('templateImagePreview');
        const placeholder = document.getElementById('templateImagePlaceholder');

        if (imageUrl) {
            previewImg.src = imageUrl;
            previewContainer.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            previewImg.src = '';
            previewContainer.style.display = 'none';
            placeholder.style.display = 'block';
        }
    }

    removeTemplateImage() {
        console.log('[QUICK-REPLY] 🗑️ Removing template image');

        this.pendingTemplateImageBlob = null;

        const imageUrlInput = document.getElementById('templateInputImageUrl');
        if (imageUrlInput) {
            imageUrlInput.value = '';
        }

        // Also clear contentId when removing image from editing template
        if (this.currentEditingTemplateId !== null) {
            const reply = this.replies.find(r => r.id === this.currentEditingTemplateId);
            if (reply) delete reply.contentId;
        }

        this.updateTemplateImagePreview('');

        if (window.notificationManager) {
            window.notificationManager.info('Đã xóa hình ảnh', 2000);
        }
    }

    /** Convert blob to data URL for preview storage */
    _blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Upload template image via upload_contents API
     * Returns { contentId } — the content_id for sending with content_ids
     */
    async uploadTemplateImage(blob) {
        console.log('[QUICK-REPLY] 📤 Uploading template image via upload_contents...');

        try {
            const channelId = window.currentChatChannelId || window.currentSendPageId;
            if (!channelId) throw new Error('Không tìm thấy page ID để upload');

            const pdm = window.pancakeDataManager;
            if (!pdm) throw new Error('PancakeDataManager not available');

            const pat = await pdm.getPageAccessToken(channelId);
            if (!pat) throw new Error('Không tìm thấy page_access_token');

            // upload_contents returns { id: "content_id", attachment_type: "PHOTO" }
            const result = await pdm.uploadMedia(channelId, blob, pat);
            console.log('[QUICK-REPLY] ✅ Image uploaded:', result);

            if (result?.id) {
                return { contentId: result.id };
            }

            throw new Error('Upload không trả về content_id');
        } catch (error) {
            console.error('[QUICK-REPLY] ❌ Image upload failed:', error);
            throw error;
        }
    }

    async saveTemplateInput() {
        const shortcutInput = document.getElementById('templateInputShortcut');
        const topicInput = document.getElementById('templateInputTopic');
        const colorInput = document.getElementById('templateInputColor');
        const messageInput = document.getElementById('templateInputMessage');
        const imageUrlInput = document.getElementById('templateInputImageUrl');

        const shortcut = shortcutInput.value.trim();
        const topic = topicInput.value.trim();
        const topicColor = colorInput.value.trim() || '#6b7280';
        const message = messageInput.value.trim();
        let imageUrl = imageUrlInput?.value?.trim() || '';

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

        let contentId = null; // Pancake content_id for direct sending

        try {
            // Upload pending image if exists
            if (this.pendingTemplateImageBlob) {
                if (window.notificationManager) {
                    window.notificationManager.info('Đang upload hình ảnh...', 5000);
                }

                try {
                    const uploadResult = await this.uploadTemplateImage(this.pendingTemplateImageBlob);
                    contentId = uploadResult.contentId;
                    // Keep existing imageUrl for display, or use blob preview
                    if (!imageUrl) {
                        imageUrl = await this._blobToDataUrl(this.pendingTemplateImageBlob);
                    }
                    console.log('[QUICK-REPLY] ✅ Image uploaded, contentId:', contentId);
                } catch (uploadError) {
                    console.error('[QUICK-REPLY] ❌ Image upload failed:', uploadError);
                    if (window.notificationManager) {
                        window.notificationManager.error('Upload hình thất bại: ' + uploadError.message);
                    }
                    return;
                }
            }

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

                // Add imageUrl + contentId if exists
                if (imageUrl) newReply.imageUrl = imageUrl;
                if (contentId) newReply.contentId = contentId;

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
                    message: reply.message,
                    imageUrl: reply.imageUrl,
                    contentId: reply.contentId
                };

                reply.shortcut = shortcut;
                reply.topic = topic;
                reply.topicColor = topicColor;
                reply.message = message;

                // Handle imageUrl + contentId
                if (imageUrl) {
                    reply.imageUrl = imageUrl;
                } else {
                    delete reply.imageUrl;
                }
                if (contentId) {
                    reply.contentId = contentId;
                } else if (this.pendingTemplateImageBlob) {
                    delete reply.contentId;
                }
                // If no new image uploaded, keep existing contentId

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
                    if (oldValues.imageUrl) reply.imageUrl = oldValues.imageUrl;
                    else delete reply.imageUrl;
                    if (oldValues.contentId) reply.contentId = oldValues.contentId;
                    else delete reply.contentId;
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
            reply.message,
            reply.imageUrl || ''
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
