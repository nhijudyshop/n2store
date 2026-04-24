// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE CHAT WINDOW - Message display and input
// =====================================================

const PancakeChatWindow = {
    selectedImage: null,

    /**
     * Render chat window for a conversation
     */
    renderChatWindow(conv) {
        const chatWindow = document.getElementById('pkChatWindow');
        if (!chatWindow) return;
        const state = window.PancakeState;
        const { escapeHtml } = window.SharedUtils;

        const name = conv.from?.name || conv.customers?.[0]?.name || 'Unknown';
        const avatar = this._getChatAvatarHtml(conv);
        const location = conv.customers?.[0]?.address?.province || '';
        const isComment = conv.type === 'COMMENT' || /^\d+_\d+$/.test(conv.id);

        chatWindow.innerHTML = `
            <div class="pk-chat-header">
                <div class="pk-chat-header-left">
                    ${avatar}
                    <div class="pk-chat-info">
                        <div class="pk-chat-name">
                            <span>${escapeHtml(name)}</span>
                            ${location ? `<span class="pk-location-badge"><i data-lucide="map-pin"></i> ${escapeHtml(location)}</span>` : ''}
                        </div>
                        <div class="pk-chat-status">${escapeHtml(this._getChatStatus(conv))}</div>
                    </div>
                </div>
                <div class="pk-chat-header-right">
                    ${
                        isComment && state.serverMode === 'n2store'
                            ? `
                    <button class="pk-header-btn pk-private-reply-btn" id="pkPrivateReplyBtn" title="Gửi tin nhắn riêng (Private Reply)">
                        <i data-lucide="mail"></i><span class="pk-btn-label">Private Reply</span>
                    </button>`
                            : ''
                    }
                    <button class="pk-header-btn" title="Liên kết"><i data-lucide="link"></i></button>
                    <button class="pk-header-btn" title="Lịch sử"><i data-lucide="history"></i></button>
                </div>
            </div>
            ${this._renderCustomerStatsBar(conv)}
            <div class="pk-chat-messages" id="pkChatMessages">
                <div class="pk-loading"><div class="pk-loading-spinner"></div><p style="margin-top:10px;color:#666;">Đang tải tin nhắn...</p></div>
            </div>
            <button class="pk-scroll-to-bottom" id="pkScrollToBottom" title="Cuộn xuống tin nhắn mới nhất">
                <i data-lucide="chevron-down"></i>
                <span class="pk-new-msg-badge" id="pkNewMsgBadge">0</span>
            </button>
            <div class="pk-quick-reply-bar" id="pkQuickReplyBar">${this.renderQuickReplies()}</div>
            <div class="pk-reply-from"><i data-lucide="reply"></i><span>Trả lời từ <strong>NhiJudy Store</strong></span></div>
            <div class="pk-chat-input-container">
                <div class="pk-input-actions">
                    <button class="pk-input-btn" title="Đính kèm"><i data-lucide="paperclip"></i></button>
                    <button class="pk-input-btn" id="pkImageBtn" title="Hình ảnh"><i data-lucide="image"></i></button>
                    <input type="file" id="pkImageInput" accept="image/*" style="display:none;">
                    <button class="pk-input-btn" id="pkEmojiBtn" title="Emoji"><i data-lucide="smile"></i></button>
                </div>
                <div id="pkEmojiPicker" class="pk-emoji-picker" style="display:none;">
                    <div class="pk-emoji-categories">
                        <button class="pk-emoji-cat active" data-category="recent" title="Gần đây">🕐</button>
                        <button class="pk-emoji-cat" data-category="smileys" title="Mặt cười">😊</button>
                        <button class="pk-emoji-cat" data-category="gestures" title="Cử chỉ">👋</button>
                        <button class="pk-emoji-cat" data-category="hearts" title="Trái tim">❤️</button>
                        <button class="pk-emoji-cat" data-category="animals" title="Động vật">🐱</button>
                        <button class="pk-emoji-cat" data-category="food" title="Đồ ăn">🍔</button>
                        <button class="pk-emoji-cat" data-category="objects" title="Đồ vật">💡</button>
                    </div>
                    <div class="pk-emoji-grid" id="pkEmojiGrid"></div>
                </div>
                <div class="pk-chat-input-wrapper">
                    <div id="pkImagePreview" class="pk-image-preview" style="display:none;">
                        <img id="pkPreviewImg" src=""><button class="pk-preview-remove" id="pkRemovePreview">×</button>
                    </div>
                    <textarea id="pkChatInput" class="pk-chat-input" placeholder="Nhập tin nhắn..." rows="1"></textarea>
                </div>
                <button class="pk-send-btn" id="pkSendBtn" title="Gửi"><i data-lucide="send"></i></button>
            </div>`;

        if (typeof lucide !== 'undefined') lucide.createIcons();
        this._loadMessages(conv);
        this._bindChatInputEvents();
        this._bindScrollEvents();
    },

    /**
     * Render messages in chat area
     */
    renderMessages() {
        const container = document.getElementById('pkChatMessages');
        if (!container) return;
        const state = window.PancakeState;
        const { escapeHtml } = window.SharedUtils;

        if (state.messages.length === 0) {
            container.innerHTML = `<div class="pk-empty-state"><i data-lucide="message-circle"></i><h3>Chưa có tin nhắn</h3></div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const sorted = [...state.messages].sort((a, b) => {
            const tA = new Date(a.inserted_at || a.created_time || 0).getTime();
            const tB = new Date(b.inserted_at || b.created_time || 0).getTime();
            return tA - tB;
        });

        const grouped = this._groupMessagesByDate(sorted);
        let html = '';
        for (const [date, msgs] of Object.entries(grouped)) {
            html += `<div class="pk-date-separator"><span>${date}</span></div>`;
            html += msgs.map((msg) => this._renderMessage(msg)).join('');
        }
        container.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        if (state.isScrolledToBottom) {
            container.scrollTop = container.scrollHeight;
        } else {
            state.newMessageCount++;
            this._updateScrollButtonBadge();
        }
    },

    _renderMessage(msg) {
        const state = window.PancakeState;
        const { escapeHtml } = window.SharedUtils;
        const isOutgoing = msg.from?.id === state.activeConversation?.page_id;
        const text = msg.message || msg.text || '';
        const time = this._formatMessageTime(msg.inserted_at || msg.created_time);
        const attachments = msg.attachments || [];
        const reactions = attachments.filter((a) => a.type === 'reaction');
        const media = attachments.filter((a) => a.type !== 'reaction');

        let attHtml = media
            .map((att) => {
                if (
                    att.type === 'image' ||
                    att.type === 'photo' ||
                    att.mime_type?.startsWith('image/')
                ) {
                    const url = att.url || att.file_url || att.preview_url || att.image_data?.url;
                    return url
                        ? `<div class="pk-message-image"><img src="${url}" alt="Image" onclick="window.open('${url}','_blank')" loading="lazy"></div>`
                        : '';
                }
                if (att.type === 'sticker' || att.sticker_id) {
                    const url = att.url || att.file_url || att.preview_url;
                    return url
                        ? `<div class="pk-message-sticker"><img src="${url}" alt="Sticker" loading="lazy"></div>`
                        : '';
                }
                if (att.type === 'video' || att.mime_type?.startsWith('video/')) {
                    const url = att.url || att.file_url;
                    return url
                        ? `<div class="pk-message-video"><video controls src="${url}" preload="metadata"></video></div>`
                        : '';
                }
                if (att.type === 'audio' || att.mime_type?.startsWith('audio/')) {
                    const url = att.url || att.file_url;
                    return url
                        ? `<div class="pk-message-audio"><audio controls src="${url}" preload="metadata"></audio></div>`
                        : '';
                }
                if (att.type === 'file' || att.type === 'document') {
                    const url = att.url || att.file_url;
                    const name = att.name || att.filename || 'Tệp đính kèm';
                    return url
                        ? `<div class="pk-message-file"><a href="${url}" target="_blank"><i data-lucide="file-text"></i><span>${escapeHtml(name)}</span></a></div>`
                        : '';
                }
                if (att.type === 'like' || att.type === 'thumbsup') {
                    return '<div class="pk-message-like"><span class="pk-like-icon">👍</span></div>';
                }
                if (att.type === 'animated_image_url' || att.type === 'animated_image_share') {
                    const url = att.url || att.file_url;
                    return url
                        ? `<div class="pk-message-sticker"><img src="${url}" alt="GIF" loading="lazy"></div>`
                        : '';
                }
                return '';
            })
            .join('');

        let reactionsHtml =
            reactions.length > 0
                ? `<span class="pk-message-reactions">${reactions.map((r) => r.emoji || '❤️').join('')}</span>`
                : '';

        const sender = isOutgoing ? msg.sender_action_name || 'Nv.My' : '';

        return `
            <div class="pk-message ${isOutgoing ? 'outgoing' : 'incoming'}">
                ${attHtml}
                ${
                    text
                        ? `<div class="pk-message-bubble"><div class="pk-message-text">${escapeHtml(this._parseMessageHtml(text))}</div>${reactionsHtml}</div>`
                        : reactionsHtml
                          ? `<div class="pk-message-bubble">${reactionsHtml}</div>`
                          : ''
                }
                <div class="pk-message-meta">
                    <span class="pk-message-time">${time}</span>
                    ${sender ? `<span class="pk-message-sender">${escapeHtml(sender)}</span>` : ''}
                    ${isOutgoing ? `<span class="pk-message-status"><i data-lucide="check-check"></i></span>` : ''}
                </div>
            </div>`;
    },

    renderQuickReplies() {
        const qr = window.PancakeState.quickReplies;
        const { escapeHtml } = window.SharedUtils;
        const row1 = qr.slice(0, 7);
        const row2 = qr.slice(7);
        return `
            <div class="pk-quick-reply-row">${row1.map((q) => `<button class="pk-quick-reply-btn ${q.color}" data-template="${escapeHtml(q.template)}">${escapeHtml(q.label)}</button>`).join('')}</div>
            <div class="pk-quick-reply-row">${row2.map((q) => `<button class="pk-quick-reply-btn ${q.color}" data-template="${escapeHtml(q.template)}">${escapeHtml(q.label)}</button>`).join('')}</div>`;
    },

    // =====================================================
    // SEND MESSAGE
    // =====================================================

    async sendMessage() {
        const chatInput = document.getElementById('pkChatInput');
        const state = window.PancakeState;
        if (!chatInput || !state.activeConversation) return;

        const text = chatInput.value.trim();
        const hasImage = !!this.selectedImage;
        if (!text && !hasImage) return;

        chatInput.value = '';
        chatInput.style.height = 'auto';
        const sendBtn = document.getElementById('pkSendBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i data-lucide="loader" class="pk-spin"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        const tempMsg = {
            id: 'temp_' + Date.now(),
            message: text || '[Hình ảnh]',
            from: { id: state.activeConversation.page_id, name: 'You' },
            inserted_at: new Date().toISOString(),
            _temp: true,
        };
        state.messages.push(tempMsg);
        state.isScrolledToBottom = true;
        this.renderMessages();
        this.scrollToBottom();

        try {
            const pageId = state.activeConversation.page_id;
            const convId = state.activeConversation.id;
            const customerId = state.activeConversation.customers?.[0]?.id || null;
            const action =
                state.activeConversation.type === 'COMMENT' ? 'reply_comment' : 'reply_inbox';
            let contentIds = [];
            let attachmentId = null;
            let attachmentType = null;

            if (hasImage) {
                if (state.serverMode === 'n2store') {
                    const up = await window.PancakeAPI.uploadMediaN2Store(
                        pageId,
                        this.selectedImage
                    );
                    if (up.success && up.attachment_id) {
                        attachmentId = up.attachment_id;
                        attachmentType = up.attachment_type;
                    } else throw new Error('Upload ảnh thất bại');
                } else {
                    const up = await window.PancakeAPI.uploadMedia(pageId, this.selectedImage);
                    if (up.success && up.id) {
                        contentIds = [up.id];
                        attachmentType = up.attachment_type;
                    } else throw new Error('Upload ảnh thất bại');
                }
                this._clearImagePreview();
            }

            let sent;
            if (state.serverMode === 'n2store') {
                sent = await window.PancakeAPI.sendMessageN2Store(
                    pageId,
                    convId,
                    text,
                    action,
                    attachmentId,
                    attachmentType
                );
            } else {
                sent = await window.PancakeAPI.sendMessage(pageId, convId, {
                    text,
                    action,
                    customerId,
                    content_ids: contentIds,
                    attachment_type: attachmentType,
                });
            }

            state.messages = state.messages.filter((m) => m.id !== tempMsg.id);
            if (sent) state.messages.push(sent);
            state.isScrolledToBottom = true;
            this.renderMessages();
            this.scrollToBottom();

            if (state.activeConversation) {
                state.activeConversation.snippet = text || '[Hình ảnh]';
                state.activeConversation.updated_at = new Date().toISOString();
                window.PancakeConversationList.renderConversationList();
            }
        } catch (error) {
            state.messages = state.messages.filter((m) => m.id !== tempMsg.id);
            this.renderMessages();
            alert(`Lỗi gửi tin nhắn: ${error.message || 'Vui lòng thử lại'}`);
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i data-lucide="send"></i>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    },

    // =====================================================
    // IMAGE UPLOAD
    // =====================================================

    handleImageUpload(file) {
        if (!file?.type.startsWith('image/')) return;
        this.selectedImage = file;
        const preview = document.getElementById('pkImagePreview');
        const previewImg = document.getElementById('pkPreviewImg');
        if (preview && previewImg) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImg.src = e.target.result;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    },

    _clearImagePreview() {
        this.selectedImage = null;
        const preview = document.getElementById('pkImagePreview');
        const previewImg = document.getElementById('pkPreviewImg');
        const input = document.getElementById('pkImageInput');
        if (preview) preview.style.display = 'none';
        if (previewImg) previewImg.src = '';
        if (input) input.value = '';
    },

    // =====================================================
    // EMOJI PICKER
    // =====================================================

    bindEmojiPicker() {
        const emojiBtn = document.getElementById('pkEmojiBtn');
        const picker = document.getElementById('pkEmojiPicker');
        const grid = document.getElementById('pkEmojiGrid');
        const chatInput = document.getElementById('pkChatInput');
        if (!emojiBtn || !picker || !grid) return;

        if (!window.PancakeState.emojiData) {
            window.PancakeState.emojiData = {
                recent: JSON.parse(localStorage.getItem('tpos_pk_recent_emojis') || 'null') || [
                    '😊',
                    '👍',
                    '❤️',
                    '😂',
                    '🙏',
                    '😍',
                    '🔥',
                    '✨',
                ],
                smileys: [
                    '😀',
                    '😃',
                    '😄',
                    '😁',
                    '😆',
                    '😅',
                    '🤣',
                    '😂',
                    '🙂',
                    '😊',
                    '😇',
                    '🥰',
                    '😍',
                    '🤩',
                    '😘',
                    '😗',
                    '😚',
                    '😙',
                    '🥲',
                    '😋',
                    '😛',
                    '😜',
                    '🤪',
                    '😝',
                    '🤑',
                    '🤗',
                    '🤭',
                    '🤫',
                    '🤔',
                ],
                gestures: [
                    '👋',
                    '🤚',
                    '🖐️',
                    '✋',
                    '🖖',
                    '👌',
                    '🤌',
                    '🤏',
                    '✌️',
                    '🤞',
                    '🤟',
                    '🤘',
                    '🤙',
                    '👈',
                    '👉',
                    '👆',
                    '👇',
                    '☝️',
                    '👍',
                    '👎',
                    '✊',
                    '👊',
                    '🤛',
                    '🤜',
                    '👏',
                    '🙌',
                    '🤝',
                    '🙏',
                ],
                hearts: [
                    '❤️',
                    '🧡',
                    '💛',
                    '💚',
                    '💙',
                    '💜',
                    '🖤',
                    '🤍',
                    '🤎',
                    '💔',
                    '❣️',
                    '💕',
                    '💞',
                    '💓',
                    '💗',
                    '💖',
                    '💘',
                    '💝',
                ],
                animals: [
                    '🐶',
                    '🐱',
                    '🐭',
                    '🐹',
                    '🐰',
                    '🦊',
                    '🐻',
                    '🐼',
                    '🐨',
                    '🐯',
                    '🦁',
                    '🐮',
                    '🐷',
                    '🐸',
                    '🐵',
                    '🐔',
                    '🐧',
                ],
                food: [
                    '🍎',
                    '🍐',
                    '🍊',
                    '🍋',
                    '🍌',
                    '🍉',
                    '🍇',
                    '🍓',
                    '🍒',
                    '🍑',
                    '🥭',
                    '🍍',
                    '🥥',
                    '🍅',
                    '🍔',
                    '🍟',
                    '🍕',
                ],
                objects: ['💡', '📱', '💻', '⌨️', '🔑', '⚙️', '🔧', '🔨', '💎', '📷', '📺', '🎙️'],
            };
        }

        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const vis = picker.style.display === 'block';
            picker.style.display = vis ? 'none' : 'block';
            if (!vis) this._renderEmojiGrid('recent');
        });

        document.addEventListener('click', (e) => {
            if (!picker.contains(e.target) && e.target !== emojiBtn) picker.style.display = 'none';
        });

        picker.querySelectorAll('.pk-emoji-cat').forEach((cat) => {
            cat.addEventListener('click', () => {
                picker
                    .querySelectorAll('.pk-emoji-cat')
                    .forEach((c) => c.classList.remove('active'));
                cat.classList.add('active');
                this._renderEmojiGrid(cat.dataset.category);
            });
        });

        grid.addEventListener('click', (e) => {
            const item = e.target.closest('.pk-emoji-item');
            if (item && chatInput) {
                const emoji = item.textContent;
                const start = chatInput.selectionStart;
                chatInput.value =
                    chatInput.value.substring(0, start) +
                    emoji +
                    chatInput.value.substring(chatInput.selectionEnd);
                chatInput.selectionStart = chatInput.selectionEnd = start + emoji.length;
                chatInput.focus();
                // Update recent
                const recent = window.PancakeState.emojiData.recent;
                const idx = recent.indexOf(emoji);
                if (idx > -1) recent.splice(idx, 1);
                recent.unshift(emoji);
                window.PancakeState.emojiData.recent = recent.slice(0, 24);
                localStorage.setItem(
                    'tpos_pk_recent_emojis',
                    JSON.stringify(window.PancakeState.emojiData.recent)
                );
            }
        });
    },

    _renderEmojiGrid(category) {
        const grid = document.getElementById('pkEmojiGrid');
        const data = window.PancakeState.emojiData;
        if (!grid || !data?.[category]) return;
        grid.innerHTML = data[category]
            .map((e) => `<button class="pk-emoji-item" title="${e}">${e}</button>`)
            .join('');
    },

    // =====================================================
    // SCROLL / LOAD MORE
    // =====================================================

    scrollToBottom() {
        const container = document.getElementById('pkChatMessages');
        if (!container) return;
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        window.PancakeState.isScrolledToBottom = true;
        window.PancakeState.newMessageCount = 0;
        this._updateScrollButtonBadge();
        setTimeout(() => this._updateScrollButtonVisibility(false), 300);
    },

    async loadMoreMessages() {
        const state = window.PancakeState;
        if (state.isLoadingMoreMessages || !state.hasMoreMessages || !state.activeConversation)
            return;
        state.isLoadingMoreMessages = true;

        const container = document.getElementById('pkChatMessages');
        const scrollBefore = container ? container.scrollHeight : 0;
        const loadEl = document.createElement('div');
        loadEl.className = 'pk-load-more-indicator';
        loadEl.innerHTML = `<div class="pk-loading-spinner" style="width:24px;height:24px;"></div><span>Đang tải tin nhắn cũ...</span>`;
        if (container) container.insertBefore(loadEl, container.firstChild);

        try {
            const result = await window.PancakeAPI.fetchMessages(
                state.activeConversation.page_id,
                state.activeConversation.id,
                {
                    currentCount: state.messageCurrentCount,
                    customerId: state.activeConversation.customers?.[0]?.id,
                }
            );
            loadEl.remove();
            const older = result.messages || [];
            if (older.length === 0) {
                state.hasMoreMessages = false;
                const noMore = document.createElement('div');
                noMore.className = 'pk-no-more-messages';
                noMore.textContent = '— Đầu cuộc hội thoại —';
                if (container) container.insertBefore(noMore, container.firstChild);
            } else {
                state.messages = [...older.reverse(), ...state.messages];
                state.messageCurrentCount = state.messages.length;
                this.renderMessages();
                if (container) container.scrollTop = container.scrollHeight - scrollBefore;
            }
        } catch {
            loadEl.remove();
        } finally {
            state.isLoadingMoreMessages = false;
        }
    },

    showTypingIndicator() {
        /* TODO: visual typing indicator */
    },
    hideTypingIndicator() {
        /* TODO: hide typing indicator */
    },

    // =====================================================
    // INTERNAL
    // =====================================================

    async _loadMessages(conv) {
        const state = window.PancakeState;
        state.resetMessageState();
        try {
            const pageId = conv.page_id;
            const convId = conv.id;
            const customerId = conv.customers?.[0]?.id || null;
            const timeout = new Promise((_, rej) =>
                setTimeout(() => rej(new Error('Timeout')), 10000)
            );

            let fetchP;
            if (state.serverMode === 'n2store') {
                fetchP = window.PancakeAPI.fetchMessagesN2Store(pageId, convId);
            } else {
                fetchP = window.PancakeAPI.fetchMessages(pageId, convId, { customerId });
            }

            const result = await Promise.race([fetchP, timeout]);
            state.messages = (result.messages || []).reverse();
            state.messageCurrentCount = state.messages.length;
            this.renderMessages();

            if (result.fromCache) this._refreshMessagesInBackground(pageId, convId, customerId);
            if (conv.unread_count > 0) {
                window.PancakeAPI.markAsRead(pageId, convId)
                    .then(() => {
                        conv.unread_count = 0;
                        conv.seen = true;
                        window.PancakeConversationList.renderConversationList();
                    })
                    .catch(() => {});
            }
        } catch (error) {
            const mc = document.getElementById('pkChatMessages');
            if (mc) {
                mc.innerHTML = `<div class="pk-empty-state"><i data-lucide="alert-circle"></i><h3>Lỗi tải tin nhắn</h3><p>${error.message}</p>
                    <button class="pk-retry-btn" onclick="window.PancakeChatWindow._loadMessages(window.PancakeState.activeConversation)" style="margin-top:10px;padding:8px 16px;background:#4285f4;color:white;border:none;border-radius:4px;cursor:pointer;">Thử lại</button></div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    },

    async _refreshMessagesInBackground(pageId, convId, customerId) {
        try {
            const result = await window.PancakeAPI.fetchMessages(pageId, convId, {
                customerId,
                forceRefresh: true,
            });
            const state = window.PancakeState;
            if (state.activeConversation?.id === convId) {
                const newMsgs = (result.messages || []).reverse();
                if (newMsgs.length !== state.messages.length) {
                    state.messages = newMsgs;
                    this.renderMessages();
                }
            }
        } catch {}
    },

    _bindChatInputEvents() {
        const chatInput = document.getElementById('pkChatInput');
        if (chatInput) {
            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
            });
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
        const sendBtn = document.getElementById('pkSendBtn');
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());

        const qrBar = document.getElementById('pkQuickReplyBar');
        if (qrBar)
            qrBar.addEventListener('click', (e) => {
                const btn = e.target.closest('.pk-quick-reply-btn');
                if (btn?.dataset.template && chatInput) {
                    chatInput.value = btn.dataset.template;
                    chatInput.focus();
                }
            });

        // Phone/ad badge copy
        const statsBar = document.querySelector('.pk-customer-stats-bar');
        if (statsBar)
            statsBar.addEventListener('click', (e) => {
                const badge = e.target.closest('.pk-phone-ad-badge');
                if (badge?.dataset.copy) {
                    navigator.clipboard
                        .writeText(badge.dataset.copy)
                        .then(() => {
                            const textEl = badge.querySelector('.pk-badge-text');
                            if (textEl) {
                                const orig = textEl.textContent;
                                textEl.textContent = 'Đã copy!';
                                setTimeout(() => (textEl.textContent = orig), 1500);
                            }
                        })
                        .catch(() => {});
                }
            });

        // Image upload
        const imageBtn = document.getElementById('pkImageBtn');
        const imageInput = document.getElementById('pkImageInput');
        if (imageBtn && imageInput) {
            imageBtn.addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', (e) => {
                if (e.target.files[0]) this.handleImageUpload(e.target.files[0]);
            });
        }
        const removePreview = document.getElementById('pkRemovePreview');
        if (removePreview) removePreview.addEventListener('click', () => this._clearImagePreview());

        this.bindEmojiPicker();

        // Typing indicator
        if (chatInput && window.PancakeState.activeConversation) {
            let typingTimeout = null;
            let isTyping = false;
            chatInput.addEventListener('input', () => {
                const ac = window.PancakeState.activeConversation;
                if (!ac) return;
                if (!isTyping) {
                    isTyping = true;
                    window.PancakeAPI.sendTypingIndicator(ac.page_id, ac.id, true);
                }
                if (typingTimeout) clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    isTyping = false;
                    window.PancakeAPI.sendTypingIndicator(ac.page_id, ac.id, false);
                }, 2000);
            });
        }
    },

    _bindScrollEvents() {
        const container = document.getElementById('pkChatMessages');
        const scrollBtn = document.getElementById('pkScrollToBottom');
        if (!container || !scrollBtn) return;

        this._updateScrollButtonVisibility(false);
        this._updateScrollButtonBadge();

        container.addEventListener('scroll', () => {
            const state = window.PancakeState;
            const isAtBottom =
                container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            state.isScrolledToBottom = isAtBottom;
            if (isAtBottom) {
                state.newMessageCount = 0;
                this._updateScrollButtonBadge();
                this._updateScrollButtonVisibility(false);
            } else this._updateScrollButtonVisibility(true);

            if (
                container.scrollTop < 100 &&
                state.hasMoreMessages &&
                !state.isLoadingMoreMessages &&
                state.messages.length > 0
            ) {
                this.loadMoreMessages();
            }
        });
        scrollBtn.addEventListener('click', () => this.scrollToBottom());
    },

    _updateScrollButtonVisibility(visible) {
        const btn = document.getElementById('pkScrollToBottom');
        if (btn) btn.classList.toggle('visible', visible);
    },

    _updateScrollButtonBadge() {
        const badge = document.getElementById('pkNewMsgBadge');
        const count = window.PancakeState.newMessageCount;
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.classList.add('visible');
            } else badge.classList.remove('visible');
        }
    },

    _renderCustomerStatsBar(conv) {
        const { escapeHtml } = window.SharedUtils;
        const customer = conv.customers?.[0] || conv.from || {};
        let phone =
            customer.phone_numbers?.[0] || customer.phone || conv.recent_phone_numbers?.[0] || '';
        if (typeof phone !== 'string') phone = '';
        let adId = conv.ad_clicks?.[0] || customer.ad_id || '';
        if (typeof adId === 'object') adId = adId?.id || adId?.ad_id || '';
        if (typeof adId !== 'string') adId = String(adId || '');

        const commentCount = customer.comment_count || conv.comment_count || 0;
        const successOrders = customer.success_order_count || customer.order_count || 0;
        const returnedOrders = customer.returned_order_count || customer.cancel_count || 0;
        const totalOrders = successOrders + returnedOrders;
        const returnRate = totalOrders > 0 ? Math.round((returnedOrders / totalOrders) * 100) : 0;

        let phoneBadge = '';
        if (phone || adId) {
            const display = adId
                ? `Ad ${adId.slice(0, 16)}${adId.length > 16 ? '...' : ''}`
                : phone;
            const full = adId || phone;
            phoneBadge = `<span class="pk-phone-ad-badge ${phone ? 'has-phone' : ''}" data-copy="${escapeHtml(full)}" title="Click để copy: ${escapeHtml(full)}"><i data-lucide="phone" class="pk-phone-icon"></i><span class="pk-badge-text">${escapeHtml(display)}</span></span>`;
        }

        return `<div class="pk-customer-stats-bar">
            <div class="pk-stats-left">${phoneBadge}</div>
            <div class="pk-stats-right">
                <span class="pk-stat-badge comment" title="Bình luận: ${commentCount}"><i data-lucide="message-square"></i><span>${commentCount}</span></span>
                <span class="pk-stat-badge success" title="Đơn thành công: ${successOrders}"><i data-lucide="check-circle"></i><span>${successOrders}</span></span>
                <span class="pk-stat-badge return" title="Đơn hoàn: ${returnedOrders}"><i data-lucide="undo-2"></i><span>${returnedOrders}</span></span>
                ${returnRate > 30 ? `<span class="pk-stat-badge warning" title="Cảnh báo: Tỉ lệ hoàn ${returnRate}%"><i data-lucide="alert-triangle"></i></span>` : ''}
            </div></div>`;
    },

    _getChatAvatarHtml(conv) {
        const customer = conv.customers?.[0] || conv.from;
        const name = customer?.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const fbId = customer?.fb_id || customer?.id || conv.from?.id;
        let directUrl =
            customer?.avatar ||
            customer?.picture?.data?.url ||
            customer?.profile_pic ||
            conv.from?.profile_pic ||
            null;
        let avatarUrl = directUrl;
        if (fbId) avatarUrl = window.SharedUtils.getAvatarUrl(fbId, conv.page_id, null, directUrl);

        const colors = [
            'linear-gradient(135deg,#667eea,#764ba2)',
            'linear-gradient(135deg,#f093fb,#f5576c)',
            'linear-gradient(135deg,#4facfe,#00f2fe)',
            'linear-gradient(135deg,#43e97b,#38f9d7)',
        ];
        const gradient = colors[name.charCodeAt(0) % colors.length];

        if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
            return `<img src="${avatarUrl}" class="pk-chat-avatar" alt="${window.SharedUtils.escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                    <div class="pk-chat-avatar-placeholder" style="display:none;background:${gradient};">${initial}</div>`;
        }
        return `<div class="pk-chat-avatar-placeholder" style="background:${gradient};">${initial}</div>`;
    },

    _getChatStatus(conv) {
        const lastSeen = conv.updated_at;
        if (!lastSeen) return '';
        return `Da xem boi Ky Thuat NJD - ${this._formatMessageTime(lastSeen)}`;
    },

    _formatMessageTime(timestamp) {
        if (!timestamp) return '';
        const date = window.SharedUtils.parseTimestamp(timestamp);
        if (!date) return '';
        return new Intl.DateTimeFormat('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh',
            hour12: false,
        }).format(date);
    },

    _groupMessagesByDate(messages) {
        const groups = {};
        const now = new Date();
        const vnFmt = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        const pv = (parts, type) => parseInt(parts.find((p) => p.type === type)?.value || '0');
        const nowP = vnFmt.formatToParts(now);
        const todayKey = `${pv(nowP, 'year')}-${pv(nowP, 'month')}-${pv(nowP, 'day')}`;

        messages.forEach((msg) => {
            const date = window.SharedUtils.parseTimestamp(msg.inserted_at || msg.created_time);
            if (!date) return;
            const dp = vnFmt.formatToParts(date);
            const key = `${pv(dp, 'year')}-${pv(dp, 'month')}-${pv(dp, 'day')}`;
            const displayKey =
                key === todayKey
                    ? 'Hôm nay'
                    : new Intl.DateTimeFormat('vi-VN', {
                          weekday: 'long',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          timeZone: 'Asia/Ho_Chi_Minh',
                      }).format(date);
            if (!groups[displayKey]) groups[displayKey] = [];
            groups[displayKey].push(msg);
        });
        return groups;
    },

    _parseMessageHtml(html) {
        if (!html || !html.includes('<')) return html || '';
        try {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            let text = temp.innerHTML
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/div>/gi, '\n')
                .replace(/<\/p>/gi, '\n');
            temp.innerHTML = text;
            return (temp.textContent || temp.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
        } catch {
            return html
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }
    },
};

// Export
if (typeof window !== 'undefined') {
    window.PancakeChatWindow = PancakeChatWindow;
}
