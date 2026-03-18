// =====================================================
// QUICK REPLY MANAGER - Fast Message Templates for Chat
// Adapted for standalone Inbox API (InboxPancakeAPI)
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
        this.pendingTemplateImageBlob = null;
        this.currentEditingTemplateId = null;
        this.init();
    }

    init() {
        console.log('[QUICK-REPLY] Initializing...');
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
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                this.db = firebase.firestore();
                console.log('[QUICK-REPLY] Firebase Firestore initialized');
            } else {
                console.warn('[QUICK-REPLY] Firebase not available, using localStorage only');
            }
        } catch (error) {
            console.error('[QUICK-REPLY] Firebase init error:', error);
        }
    }

    // =====================================================
    // DOM CREATION
    // =====================================================

    createModalDOM() {
        if (document.getElementById('quickReplyModal')) return;
        const html = `
            <div class="quick-reply-overlay" id="quickReplyModal">
                <div class="quick-reply-modal">
                    <div class="quick-reply-header">
                        <h3><i class="fas fa-comment-dots"></i> Mẫu trả lời nhanh</h3>
                        <button class="quick-reply-close" id="quickReplyClose"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="quick-reply-table-header">
                        <div class="qr-col-stt">STT</div>
                        <div class="qr-col-shortcut">Ký tự tắt</div>
                        <div class="qr-col-topic">Chủ đề</div>
                        <div class="qr-col-message">Tin nhắn</div>
                    </div>
                    <div class="quick-reply-body" id="quickReplyBody"></div>
                    <div class="quick-reply-footer">
                        <div class="quick-reply-footer-info"><span id="quickReplyCount">0</span> mẫu tin nhắn</div>
                        <div class="quick-reply-footer-actions">
                            <button onclick="quickReplyManager.openSettings()"><i class="fas fa-cog"></i> Cài đặt</button>
                            <button onclick="quickReplyManager.closeModal()"><i class="fas fa-times"></i> Đóng</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    createSettingsModalDOM() {
        if (document.getElementById('quickReplySettingsModal')) return;
        const html = `
            <div class="quick-reply-overlay" id="quickReplySettingsModal">
                <div class="quick-reply-modal" style="max-width: 700px;">
                    <div class="quick-reply-header">
                        <h3><i class="fas fa-cog"></i> Quản lý mẫu tin nhắn</h3>
                        <button class="quick-reply-close" onclick="quickReplyManager.closeSettings()"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="quick-reply-body" id="quickReplySettingsBody" style="padding: 20px;">
                        <button onclick="quickReplyManager.addNewTemplate()" style="width:100%;padding:12px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:white;border:none;border-radius:8px;font-weight:600;margin-bottom:16px;cursor:pointer;">
                            <i class="fas fa-plus"></i> Thêm mẫu mới
                        </button>
                        <div id="settingsTemplateList"></div>
                    </div>
                    <div class="quick-reply-footer">
                        <div class="quick-reply-footer-info">Quản lý danh sách mẫu tin nhắn</div>
                        <div class="quick-reply-footer-actions">
                            <button onclick="quickReplyManager.closeSettings()"><i class="fas fa-check"></i> Xong</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    createTemplateInputModalDOM() {
        if (document.getElementById('templateInputModal')) return;
        const html = `
            <div class="quick-reply-overlay" id="templateInputModal" style="display:none;">
                <div class="quick-reply-modal" style="max-width:600px;">
                    <div class="quick-reply-header">
                        <h3 id="templateInputModalTitle"><i class="fas fa-edit"></i> Thêm mẫu tin nhắn</h3>
                        <button class="quick-reply-close" onclick="quickReplyManager.closeTemplateInputModal()"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="quick-reply-body" style="padding:20px;">
                        <div style="margin-bottom:16px;">
                            <label style="display:block;margin-bottom:6px;font-weight:600;color:#374151;font-size:14px;">Ký tự tắt <span style="color:#ef4444;">*</span></label>
                            <input type="text" id="templateInputShortcut" placeholder="VD: CAMON, STK" style="width:100%;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;" />
                        </div>
                        <div style="margin-bottom:16px;">
                            <label style="display:block;margin-bottom:6px;font-weight:600;color:#374151;font-size:14px;">Chủ đề</label>
                            <input type="text" id="templateInputTopic" placeholder="Có thể bỏ trống" style="width:100%;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;" />
                        </div>
                        <div style="margin-bottom:16px;">
                            <label style="display:block;margin-bottom:6px;font-weight:600;color:#374151;font-size:14px;">Mã màu</label>
                            <input type="text" id="templateInputColor" placeholder="VD: #3add99" style="width:100%;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;" />
                        </div>
                        <div style="margin-bottom:16px;">
                            <label style="display:block;margin-bottom:6px;font-weight:600;color:#374151;font-size:14px;">Hình ảnh đính kèm</label>
                            <div id="templateImageDropZone" style="border:2px dashed #e5e7eb;border-radius:8px;padding:20px;text-align:center;cursor:pointer;background:#f9fafb;" onclick="document.getElementById('templateImageFileInput').click()">
                                <div id="templateImagePreviewContainer" style="display:none;">
                                    <img id="templateImagePreview" src="" alt="Preview" style="max-width:100%;max-height:150px;border-radius:6px;margin-bottom:8px;" />
                                    <div style="display:flex;justify-content:center;gap:8px;">
                                        <button type="button" onclick="event.stopPropagation();quickReplyManager.removeTemplateImage();" style="padding:6px 12px;background:#ef4444;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">
                                            <i class="fas fa-trash"></i> Xóa ảnh
                                        </button>
                                    </div>
                                </div>
                                <div id="templateImagePlaceholder">
                                    <i class="fas fa-image" style="font-size:32px;color:#9ca3af;margin-bottom:8px;"></i>
                                    <p style="color:#6b7280;margin:0;font-size:13px;">Paste hình (Ctrl+V) hoặc click để chọn</p>
                                </div>
                            </div>
                            <input type="file" id="templateImageFileInput" accept="image/*" style="display:none;" onchange="quickReplyManager.handleTemplateImageSelect(event)" />
                            <input type="hidden" id="templateInputImageUrl" value="" />
                        </div>
                        <div style="margin-bottom:16px;">
                            <label style="display:block;margin-bottom:6px;font-weight:600;color:#374151;font-size:14px;">Nội dung tin nhắn <span style="color:#ef4444;">*</span></label>
                            <textarea id="templateInputMessage" placeholder="Nhập nội dung tin nhắn" rows="6" style="width:100%;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;resize:vertical;font-family:inherit;line-height:1.5;"></textarea>
                        </div>
                    </div>
                    <div class="quick-reply-footer">
                        <div class="quick-reply-footer-actions" style="width:100%;display:flex;gap:8px;justify-content:flex-end;">
                            <button onclick="quickReplyManager.closeTemplateInputModal()" style="padding:10px 20px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
                                <i class="fas fa-times"></i> Hủy
                            </button>
                            <button id="templateInputSaveBtn" onclick="quickReplyManager.saveTemplateInput()" style="padding:10px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
                                <i class="fas fa-check"></i> Lưu
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        this.setupTemplateImagePaste();
    }

    createAutocompleteDOM() {
        if (document.getElementById('quickReplyAutocomplete')) return;
        document.body.insertAdjacentHTML('beforeend', '<div class="quick-reply-autocomplete" id="quickReplyAutocomplete"></div>');
    }

    // =====================================================
    // EVENT LISTENERS
    // =====================================================

    attachEventListeners() {
        document.getElementById('quickReplyClose')?.addEventListener('click', () => this.closeModal());
        document.getElementById('quickReplyModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'quickReplyModal') this.closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen()) this.closeModal();
        });
    }

    // =====================================================
    // LOAD / SAVE REPLIES
    // =====================================================

    async loadReplies() {
        // Try localStorage first
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                this.replies = JSON.parse(stored);
                console.log('[QUICK-REPLY] Loaded', this.replies.length, 'replies from localStorage');
                return;
            }
        } catch (e) {}

        // Try Firebase
        if (this.db) {
            try {
                const snapshot = await this.db.collection(this.FIREBASE_COLLECTION).orderBy('id', 'asc').get();
                if (!snapshot.empty) {
                    this.replies = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
                    this.saveToCache();
                    console.log('[QUICK-REPLY] Loaded', this.replies.length, 'replies from Firebase');
                    return;
                }
            } catch (error) {
                console.error('[QUICK-REPLY] Firebase load error:', error);
            }
        }

        // Use defaults
        this.replies = this.getDefaultReplies();
        this.saveToCache();
    }

    saveToCache() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.replies));
        } catch (e) {}
    }

    getDefaultReplies() {
        return [
            { id: 1, shortcut: '', topic: 'CHỐT ĐƠN', topicColor: '#3add99', message: 'Dạ mình xem okee shop chốt đơn cho c nhaa' },
            { id: 2, shortcut: 'CAMON', topic: 'C.ƠN KH', topicColor: '#cec40c', message: 'Dạ hàng của mình đã được lên bill , cám ơn chị yêu đã ủng hộ shop ạ' },
            { id: 3, shortcut: 'STK', topic: 'STK NGÂN HÀNG', topicColor: '#969894', message: 'Dạ em gửi mình số tài khoản ạ\nNGÂN HÀNG: ACB\nSTK: 93616\nTÊN: LẠI THỤY YẾN NHI' },
            { id: 4, shortcut: 'XIN', topic: 'XIN SDT & Đ/C', topicColor: '#138809', message: 'Dạ mình cho shop xin thông tin SĐT & ĐỊA CHỈ ạ' }
        ];
    }

    async saveReplies() {
        if (this.db) {
            try {
                const batch = this.db.batch();
                const existingDocs = await this.db.collection(this.FIREBASE_COLLECTION).get();
                existingDocs.docs.forEach(doc => batch.delete(doc.ref));
                this.replies.forEach(reply => {
                    const docRef = this.db.collection(this.FIREBASE_COLLECTION).doc();
                    const data = { ...reply };
                    delete data.docId;
                    batch.set(docRef, data);
                });
                await batch.commit();
                // Clear cache and reload
                localStorage.removeItem(this.STORAGE_KEY);
                await this.loadReplies();
            } catch (error) {
                console.error('[QUICK-REPLY] Firebase save error:', error);
                throw error;
            }
        } else {
            this.saveToCache();
        }
    }

    // =====================================================
    // MODAL OPEN / CLOSE
    // =====================================================

    async openModal(targetInputId) {
        this.targetInputId = targetInputId;
        await this.ensureRepliesLoaded();
        document.getElementById('quickReplyModal')?.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.renderReplies();
    }

    closeModal() {
        document.getElementById('quickReplyModal')?.classList.remove('active');
        document.body.style.overflow = 'auto';
        this.targetInputId = null;
    }

    isModalOpen() {
        return document.getElementById('quickReplyModal')?.classList.contains('active');
    }

    // =====================================================
    // RENDER REPLIES
    // =====================================================

    renderReplies() {
        const bodyEl = document.getElementById('quickReplyBody');
        const countEl = document.getElementById('quickReplyCount');
        if (countEl) countEl.textContent = this.replies.length;

        if (this.replies.length === 0) {
            bodyEl.innerHTML = '<div class="quick-reply-empty"><i class="fas fa-comment-slash"></i><p>Chưa có mẫu tin nhắn nào</p></div>';
            return;
        }

        bodyEl.innerHTML = this.replies.map((reply, index) => {
            const topicHTML = reply.topic ? `<span class="quick-reply-topic" style="background-color:${reply.topicColor || '#6b7280'}">${this.escapeHtml(reply.topic)}</span>` : '';
            const preview = reply.message.length > 80 ? reply.message.substring(0, 80) + '...' : reply.message;
            return `
                <div class="quick-reply-item" onclick="quickReplyManager.selectReply(${reply.id})">
                    <div class="qr-col-stt">${index + 1}.</div>
                    <div class="qr-col-shortcut"><span class="quick-reply-shortcut">${this.escapeHtml(reply.shortcut)}</span></div>
                    <div class="qr-col-topic">${topicHTML}</div>
                    <div class="qr-col-message"><span class="quick-reply-message" title="${this.escapeHtml(reply.message)}">${this.escapeHtml(preview)}</span></div>
                </div>`;
        }).join('');
    }

    selectReply(replyId) {
        const reply = this.replies.find(r => r.id === replyId);
        if (!reply) return;

        if (reply.imageUrl) {
            this.closeModal();
            this.sendQuickReplyWithImage(reply.imageUrl, reply.message);
            return;
        }
        this.insertToInput(reply.message);
    }

    insertToInput(message) {
        const inputId = this.targetInputId || 'chatInput';
        const inputEl = document.getElementById(inputId);
        if (!inputEl) return;

        const current = inputEl.value || '';
        inputEl.value = current ? `${current}\n${message}` : message;
        this.closeModal();
        inputEl.focus();
        if (inputEl.setSelectionRange) {
            inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
        }
        showToast('Đã chèn tin nhắn mẫu', 'success');
    }

    // =====================================================
    // SEND QUICK REPLY WITH IMAGE (adapted for new API)
    // =====================================================

    async sendQuickReplyWithImage(imageUrl, message) {
        const chat = window.inboxChat;
        const api = window.inboxPancakeAPI;
        const tm = window.inboxTokenManager;

        if (!chat?.activeConvId) {
            showToast('Chọn cuộc hội thoại trước', 'error');
            return;
        }

        const conv = chat.data.getConversation(chat.activeConvId);
        if (!conv) return;

        try {
            const pageId = conv.pageId;
            const convId = conv.id;
            const pat = await chat._getPageAccessTokenWithFallback(pageId);
            if (!pat) {
                showToast('Không có page_access_token', 'error');
                return;
            }

            showToast('Đang gửi tin nhắn...', 'info');

            // Send text message via Pancake API
            const textPayload = { action: 'reply_inbox', message: message };
            await api.sendMessage(pageId, convId, textPayload, pat);

            showToast('Đã gửi tin nhắn', 'success');

            // Reload messages
            setTimeout(() => {
                api.clearMessagesCache(pageId, convId);
                chat.loadMessages(conv);
            }, 2000);

        } catch (error) {
            console.error('[QUICK-REPLY] Send error:', error);
            showToast('Lỗi: ' + error.message, 'error');
        }
    }

    // =====================================================
    // AUTOCOMPLETE
    // =====================================================

    setupAutocomplete() {
        setTimeout(() => {
            const chatInput = document.getElementById('chatInput');
            if (!chatInput) return;
            this._autocompleteInput = chatInput;
            chatInput.addEventListener('input', (e) => this.handleAutocompleteInput(e));
            chatInput.addEventListener('keydown', (e) => this.handleAutocompleteKeydown(e));
            console.log('[QUICK-REPLY] Autocomplete setup on #chatInput');
        }, 1000);
    }

    async handleAutocompleteInput(e) {
        const input = e.target;
        const value = input.value;
        const cursorPos = input.selectionStart;
        await this.ensureRepliesLoaded();

        const textBeforeCursor = value.substring(0, cursorPos);
        const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

        if (lastSlashIndex === -1) { this.hideAutocomplete(); return; }

        const query = textBeforeCursor.substring(lastSlashIndex + 1);
        if (query.includes(' ') || query.includes('\n')) { this.hideAutocomplete(); return; }

        const queryNorm = this.removeVietnameseDiacritics(query.toLowerCase());
        this.currentSuggestions = this.replies.filter(reply => {
            if (!query) return true;
            if (!reply.shortcut) return false;
            const scLower = reply.shortcut.toLowerCase();
            const scNorm = this.removeVietnameseDiacritics(scLower);
            return scLower.startsWith(query.toLowerCase()) || scNorm.startsWith(queryNorm);
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
            this.selectedSuggestionIndex = Math.min(this.selectedSuggestionIndex + 1, this.currentSuggestions.length - 1);
            this.renderAutocomplete();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, 0);
            this.renderAutocomplete();
        } else if (e.key === 'Enter' && this.selectedSuggestionIndex >= 0) {
            e.preventDefault();
            const selected = this.currentSuggestions[this.selectedSuggestionIndex];
            if (selected) this.applyAutocompleteSuggestion(selected);
        } else if (e.key === 'Escape') {
            this.hideAutocomplete();
        }
    }

    showAutocomplete(inputElement, query, slashIndex) {
        this.autocompleteActive = true;
        this.selectedSuggestionIndex = 0;
        const dropdown = document.getElementById('quickReplyAutocomplete');
        const rect = inputElement.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        dropdown.style.top = 'auto';
        dropdown.style.width = Math.max(400, rect.width) + 'px';
        dropdown.style.display = 'block';
        this.renderAutocomplete();
    }

    renderAutocomplete() {
        const dropdown = document.getElementById('quickReplyAutocomplete');
        dropdown.innerHTML = this.currentSuggestions.map((reply, index) => {
            const isSelected = index === this.selectedSuggestionIndex;
            const topicHTML = reply.topic ? `<span class="quick-reply-topic" style="background-color:${reply.topicColor || '#6b7280'};font-size:10px;padding:2px 6px;">${this.escapeHtml(reply.topic)}</span>` : '';
            const preview = reply.message.length > 60 ? reply.message.substring(0, 60) + '...' : reply.message;
            return `
                <div class="autocomplete-item ${isSelected ? 'selected' : ''}" data-index="${index}" onclick="quickReplyManager.selectAutocompleteSuggestion(${index})">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-weight:600;color:#667eea;min-width:80px;">/${this.escapeHtml(reply.shortcut)}</span>
                        ${topicHTML}
                    </div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px;">${this.escapeHtml(preview)}</div>
                </div>`;
        }).join('');
    }

    selectAutocompleteSuggestion(index) {
        const selected = this.currentSuggestions[index];
        if (selected) this.applyAutocompleteSuggestion(selected);
    }

    applyAutocompleteSuggestion(reply) {
        const input = this._autocompleteInput || document.getElementById('chatInput');
        if (!input) return;

        if (reply.imageUrl) {
            this.hideAutocomplete();
            input.value = '';
            input.style.height = 'auto';
            this.sendQuickReplyWithImage(reply.imageUrl, reply.message);
            return;
        }

        const value = input.value;
        const cursorPos = input.selectionStart;
        const textAfterCursor = value.substring(cursorPos);
        const textBeforeCursor = value.substring(0, cursorPos);
        const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

        const newValue = value.substring(0, lastSlashIndex) + reply.message + textAfterCursor;
        input.value = newValue;
        const newPos = lastSlashIndex + reply.message.length;
        input.setSelectionRange(newPos, newPos);

        this.hideAutocomplete();
        input.focus();
    }

    hideAutocomplete() {
        this.autocompleteActive = false;
        this.selectedSuggestionIndex = -1;
        this.currentSuggestions = [];
        const dropdown = document.getElementById('quickReplyAutocomplete');
        if (dropdown) dropdown.style.display = 'none';
    }

    // =====================================================
    // SETTINGS
    // =====================================================

    openSettings() {
        document.getElementById('quickReplySettingsModal')?.classList.add('active');
        this.renderSettingsList();
    }

    closeSettings() {
        document.getElementById('quickReplySettingsModal')?.classList.remove('active');
        if (this.isModalOpen()) this.renderReplies();
    }

    renderSettingsList() {
        const listEl = document.getElementById('settingsTemplateList');
        if (!listEl) return;

        if (this.replies.length === 0) {
            listEl.innerHTML = '<p style="text-align:center;color:#9ca3af;padding:20px;">Chưa có mẫu tin nhắn nào</p>';
            return;
        }

        listEl.innerHTML = this.replies.map(reply => {
            const topicHTML = reply.topic ? `<span class="quick-reply-topic" style="background-color:${reply.topicColor || '#6b7280'};font-size:11px;padding:3px 8px;margin-left:8px;">${this.escapeHtml(reply.topic)}</span>` : '';
            return `
                <div style="background:white;border:2px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                        <div style="flex:1;">
                            <div style="display:flex;align-items:center;margin-bottom:6px;">
                                <strong style="color:#667eea;">/${this.escapeHtml(reply.shortcut || '')}</strong>${topicHTML}
                            </div>
                            <div style="font-size:13px;color:#6b7280;line-height:1.5;max-height:60px;overflow:hidden;">${this.escapeHtml(reply.message.substring(0, 100))}${reply.message.length > 100 ? '...' : ''}</div>
                        </div>
                        <div style="display:flex;gap:8px;margin-left:12px;">
                            <button onclick="quickReplyManager.editTemplate(${reply.id})" style="padding:6px 12px;background:#667eea;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-edit"></i> Sửa</button>
                            <button onclick="quickReplyManager.deleteTemplate(${reply.id})" style="padding:6px 12px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-trash"></i> Xóa</button>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }

    addNewTemplate() {
        this.currentEditingTemplateId = null;
        this.openTemplateInputModal('Thêm mẫu tin nhắn', '', '', '', '', '');
    }

    openTemplateInputModal(title, shortcut = '', topic = '', topicColor = '', message = '', imageUrl = '') {
        const modal = document.getElementById('templateInputModal');
        if (!modal) return;
        document.getElementById('templateInputModalTitle').innerHTML = `<i class="fas fa-edit"></i> ${title}`;
        document.getElementById('templateInputShortcut').value = shortcut;
        document.getElementById('templateInputTopic').value = topic;
        document.getElementById('templateInputColor').value = topicColor;
        document.getElementById('templateInputMessage').value = message;
        const imageUrlInput = document.getElementById('templateInputImageUrl');
        if (imageUrlInput) imageUrlInput.value = imageUrl || '';
        this.pendingTemplateImageBlob = null;
        this.updateTemplateImagePreview(imageUrl);
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('templateInputShortcut').focus(), 100);
    }

    closeTemplateInputModal() {
        const modal = document.getElementById('templateInputModal');
        if (modal) modal.style.display = 'none';
        this.currentEditingTemplateId = null;
        this.pendingTemplateImageBlob = null;
    }

    // =====================================================
    // TEMPLATE IMAGE HANDLING
    // =====================================================

    setupTemplateImagePaste() {
        setTimeout(() => {
            const modal = document.getElementById('templateInputModal');
            if (modal) modal.addEventListener('paste', (e) => this.handleTemplateImagePaste(e));
        }, 100);
    }

    handleTemplateImagePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) this.processTemplateImage(blob);
                return;
            }
        }
    }

    handleTemplateImageSelect(event) {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) this.processTemplateImage(file);
        event.target.value = '';
    }

    processTemplateImage(blob) {
        this.pendingTemplateImageBlob = blob;
        const localUrl = URL.createObjectURL(blob);
        this.updateTemplateImagePreview(localUrl);
        const imageUrlInput = document.getElementById('templateInputImageUrl');
        if (imageUrlInput) imageUrlInput.value = '';
        showToast('Hình sẽ được upload khi lưu mẫu', 'info');
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
        this.pendingTemplateImageBlob = null;
        const imageUrlInput = document.getElementById('templateInputImageUrl');
        if (imageUrlInput) imageUrlInput.value = '';
        this.updateTemplateImagePreview('');
        showToast('Đã xóa hình ảnh', 'info');
    }

    async uploadTemplateImage(blob) {
        const api = window.inboxPancakeAPI;
        const chat = window.inboxChat;
        if (!api || !chat) throw new Error('API not available');

        const conv = chat.activeConvId ? chat.data.getConversation(chat.activeConvId) : null;
        const pageId = conv?.pageId || chat.data.pageIds?.[0];
        if (!pageId) throw new Error('Không tìm thấy page ID');

        const pat = await chat._getPageAccessTokenWithFallback(pageId);
        if (!pat) throw new Error('Không có page_access_token');

        const result = await api.uploadMedia(pageId, blob, pat);
        if (result?.content_url) return result.content_url;
        throw new Error('Upload không trả về URL');
    }

    async saveTemplateInput() {
        const shortcut = document.getElementById('templateInputShortcut').value.trim();
        const topic = document.getElementById('templateInputTopic').value.trim();
        const topicColor = document.getElementById('templateInputColor').value.trim() || '#6b7280';
        const message = document.getElementById('templateInputMessage').value.trim();
        let imageUrl = document.getElementById('templateInputImageUrl')?.value?.trim() || '';

        if (!shortcut) { showToast('Nhập ký tự tắt', 'warning'); return; }
        if (!message) { showToast('Nhập nội dung tin nhắn', 'warning'); return; }

        try {
            if (this.pendingTemplateImageBlob) {
                showToast('Đang upload hình ảnh...', 'info');
                try {
                    imageUrl = await this.uploadTemplateImage(this.pendingTemplateImageBlob);
                } catch (e) {
                    showToast('Upload hình thất bại: ' + e.message, 'error');
                    return;
                }
            }

            if (this.currentEditingTemplateId === null) {
                const maxId = this.replies.length > 0 ? Math.max(...this.replies.map(r => r.id)) : 0;
                const newReply = { id: maxId + 1, shortcut, topic, topicColor, message };
                if (imageUrl) newReply.imageUrl = imageUrl;
                this.replies.push(newReply);
            } else {
                const reply = this.replies.find(r => r.id === this.currentEditingTemplateId);
                if (!reply) return;
                reply.shortcut = shortcut;
                reply.topic = topic;
                reply.topicColor = topicColor;
                reply.message = message;
                if (imageUrl) reply.imageUrl = imageUrl;
                else delete reply.imageUrl;
            }

            await this.saveReplies();
            this.renderSettingsList();
            this.closeTemplateInputModal();
            showToast('Đã lưu mẫu tin nhắn', 'success');
        } catch (error) {
            showToast('Lỗi khi lưu', 'error');
            console.error('[QUICK-REPLY] Save error:', error);
        }
    }

    editTemplate(id) {
        const reply = this.replies.find(r => r.id === id);
        if (!reply) return;
        this.currentEditingTemplateId = id;
        this.openTemplateInputModal('Chỉnh sửa mẫu tin nhắn', reply.shortcut, reply.topic, reply.topicColor, reply.message, reply.imageUrl || '');
    }

    async deleteTemplate(id) {
        const reply = this.replies.find(r => r.id === id);
        if (!reply) return;
        if (!confirm(`Xóa mẫu "${reply.shortcut || reply.topic}"?`)) return;

        this.replies = this.replies.filter(r => r.id !== id);
        try {
            await this.saveReplies();
            this.renderSettingsList();
            showToast('Đã xóa mẫu tin nhắn', 'success');
        } catch (error) {
            showToast('Lỗi khi xóa', 'error');
        }
    }

    // =====================================================
    // UTILITIES
    // =====================================================

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    removeVietnameseDiacritics(str) {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }
}

// =====================================================
// INITIALIZE
// =====================================================

function initQuickReplyManager() {
    const quickReplyManager = new QuickReplyManager();
    window.quickReplyManager = quickReplyManager;
    console.log('[QUICK-REPLY] Manager initialized');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuickReplyManager);
} else {
    initQuickReplyManager();
}
