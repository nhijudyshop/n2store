/* =====================================================
   INBOX CHAT CONTROLLER - UI layer for Inbox
   Render, events, send, WebSocket, search, etc.
   ===================================================== */

const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)'
];

class InboxChatController {
    constructor(dataManager) {
        this.data = dataManager;
        this.api = window.inboxPancakeAPI;
        this.tm = window.inboxTokenManager;

        // State
        this.activeConvId = null;
        this.messages = [];
        this.currentFilter = localStorage.getItem('inbox_current_filter') || 'all';
        this.selectedPageIds = [];
        this.groupFilters = [];
        this.isSearching = false;
        this.searchTimeout = null;
        this.hasMoreMessages = true;
        this.messageCurrentCount = 0;
        this.replyingTo = null;
        this.selectedImage = null;

        // WebSocket
        this.socket = null;
        this.isSocketConnected = false;
        this.socketReconnectAttempts = 0;
        this.socketMaxReconnectAttempts = 3;
        this.socketReconnectDelay = 3000;
        this.autoRefreshInterval = null;

        // Optimistic messages
        this._optimisticMessages = [];
    }

    // =====================================================
    // INIT & EVENTS
    // =====================================================

    init() {
        this.bindEvents();
        this.renderPageSelector();
        this.renderConversationList();
        this.renderGroupStats();
        this._setActiveFilter(this.currentFilter);
    }

    bindEvents() {
        // Search
        const searchInput = document.getElementById('searchConversation');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(this.searchTimeout);
                const q = searchInput.value.trim();
                this.renderConversationList();
                if (q.length >= 2) {
                    this.searchTimeout = setTimeout(() => this.performSearch(q), 300);
                }
            });
        }

        // Filter tabs
        document.querySelectorAll('.conv-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._setActiveFilter(btn.dataset.filter);
                this.renderConversationList();
            });
        });

        // Refresh
        document.getElementById('btnRefreshInbox')?.addEventListener('click', async () => {
            await this.data.loadConversations(true);
            this.data.recalculateGroupCounts();
            this.renderConversationList();
            this.renderGroupStats();
            showToast('Da lam moi', 'success');
        });

        // Conversation list scroll (load more)
        document.getElementById('conversationList')?.addEventListener('scroll', (e) => {
            const el = e.target;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
                this.loadMoreConversations();
            }
        });

        // Chat messages scroll (load older)
        document.getElementById('chatMessages')?.addEventListener('scroll', (e) => {
            if (e.target.scrollTop < 100 && this.activeConvId) {
                this.loadMoreMessages();
            }
        });

        // Send message
        document.getElementById('btnSend')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Image/File attach
        document.getElementById('btnAttachImage')?.addEventListener('click', () => document.getElementById('imageFileInput')?.click());
        document.getElementById('imageFileInput')?.addEventListener('change', (e) => this.attachImage(e));
        document.getElementById('btnAttachFile')?.addEventListener('click', () => document.getElementById('attachFileInput')?.click());
        document.getElementById('attachFileInput')?.addEventListener('change', (e) => this.attachFile(e));
        document.getElementById('btnCancelImage')?.addEventListener('click', () => this._clearImagePreview());

        // Reply cancel
        document.getElementById('btnCancelReply')?.addEventListener('click', () => this.cancelReply());

        // Emoji picker
        document.getElementById('btnEmojiToggle')?.addEventListener('click', () => {
            const picker = document.getElementById('emojiPicker');
            if (picker) {
                picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
                if (picker.style.display === 'block') this.renderEmojiGrid('smileys');
            }
        });
        document.querySelectorAll('.emoji-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.emoji-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderEmojiGrid(btn.dataset.category);
            });
        });

        // Toggle read/unread
        document.getElementById('btnToggleRead')?.addEventListener('click', () => {
            if (this.activeConvId) this.toggleReadUnread(this.activeConvId);
        });

        // Livestream toggle
        document.getElementById('btnLivestreamToggle')?.addEventListener('click', () => this.toggleLivestreamStatus());

        // Manage groups
        document.getElementById('btnManageGroups')?.addEventListener('click', () => this.showManageGroupsModal());
        document.getElementById('btnCloseManageGroups')?.addEventListener('click', () => {
            document.getElementById('manageGroupsModal').style.display = 'none';
        });

        // Page selector
        document.getElementById('pageSelectorBtn')?.addEventListener('click', () => {
            const dd = document.getElementById('pageSelectorDropdown');
            if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
        });

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#pageSelectorWrapper')) {
                document.getElementById('pageSelectorDropdown').style.display = 'none';
            }
            if (!e.target.closest('#emojiPicker') && !e.target.closest('#btnEmojiToggle')) {
                document.getElementById('emojiPicker').style.display = 'none';
            }
            if (!e.target.closest('#reactionPicker') && !e.target.closest('.msg-action-react')) {
                document.getElementById('reactionPicker').style.display = 'none';
            }
        });

        // Toggle right panel
        document.getElementById('btnToggleRightPanel')?.addEventListener('click', () => {
            const col3 = document.getElementById('col3');
            if (col3) col3.style.display = col3.style.display === 'none' ? '' : 'none';
        });

        // Reply type / send page selectors
        document.getElementById('sendPageSelector')?.addEventListener('change', (e) => this._onSendPageChanged(e.target.value));
        document.getElementById('replyTypeSelector')?.addEventListener('change', () => {});
    }

    _setActiveFilter(filter) {
        this.currentFilter = filter;
        localStorage.setItem('inbox_current_filter', filter);
        document.querySelectorAll('.conv-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
    }

    // =====================================================
    // RENDER CONVERSATION LIST
    // =====================================================

    renderConversationList() {
        const container = document.getElementById('conversationList');
        if (!container) return;

        const search = document.getElementById('searchConversation')?.value?.trim() || '';
        const convs = this.data.getConversations({
            search,
            filter: this.currentFilter,
            groupFilters: this.groupFilters,
            selectedPageIds: this.selectedPageIds.length > 0 ? this.selectedPageIds : null
        });

        if (convs.length === 0) {
            container.innerHTML = `
                <div style="padding:2rem;text-align:center;color:var(--text-tertiary);">
                    <i data-lucide="inbox" style="width:48px;height:48px;opacity:0.3;"></i>
                    <p style="margin-top:0.5rem;">${search ? 'Khong tim thay ket qua' : 'Chua co du lieu'}</p>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
            return;
        }

        container.innerHTML = convs.map(c => this._buildConvItemHtml(c)).join('');

        // Bind click events
        container.querySelectorAll('.conv-item').forEach(el => {
            el.addEventListener('click', () => this.selectConversation(el.dataset.id));
        });

        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
    }

    _buildConvItemHtml(conv) {
        const isActive = conv.id === this.activeConvId;
        const labels = this.data.getLabelArray(conv.id);
        const labelDots = labels.filter(l => l !== 'new').map(l => {
            const group = this.data.groups.find(g => g.id === l);
            return group ? `<span class="label-dot" style="background:${group.color};" title="${group.name}"></span>` : '';
        }).join('');

        const unreadBadge = conv.unread > 0 ? `<span class="unread-badge">${conv.unread}</span>` : '';
        const typeIcon = conv.type === 'COMMENT' ? '<i data-lucide="message-circle" class="type-icon comment"></i>' : '';
        const livestreamIcon = conv.isLivestream ? '<i data-lucide="radio" class="type-icon livestream"></i>' : '';

        const timeStr = this.formatTime(conv.time);
        const snippet = this.escapeHtml(conv.snippet || '').substring(0, 60);

        return `
            <div class="conv-item ${isActive ? 'active' : ''} ${conv.unread > 0 ? 'unread' : ''}" data-id="${conv.id}">
                <div class="conv-avatar">${this.getAvatarHtml(conv, 40)}</div>
                <div class="conv-info">
                    <div class="conv-top">
                        <span class="conv-name">${this.escapeHtml(conv.name)}</span>
                        <span class="conv-time">${timeStr}</span>
                    </div>
                    <div class="conv-bottom">
                        <span class="conv-snippet">${snippet}</span>
                        <div class="conv-badges">
                            ${typeIcon}${livestreamIcon}${labelDots}${unreadBadge}
                        </div>
                    </div>
                    <div class="conv-page-name">${this.escapeHtml(conv.pageName)}</div>
                </div>
            </div>`;
    }

    // =====================================================
    // SELECT CONVERSATION & LOAD MESSAGES
    // =====================================================

    async selectConversation(convId) {
        this.activeConvId = convId;
        const conv = this.data.getConversation(convId);
        if (!conv) return;

        // Update header
        document.getElementById('chatHeaderAvatar').innerHTML = this.getAvatarHtml(conv, 32);
        document.getElementById('chatUserName').textContent = conv.name;
        document.getElementById('chatUserStatus').textContent = `${conv.type} - ${conv.pageName}`;
        document.getElementById('btnToggleRead').style.display = '';
        document.getElementById('btnLivestreamToggle').style.display = '';
        document.getElementById('chatInputOptions').style.display = 'flex';

        // Populate send page selector
        this._populateSendPageSelector(conv);
        this._populateReplyTypeSelector(conv);

        // Update active state in list
        document.querySelectorAll('.conv-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === convId);
        });

        // Mark as read
        this.data.markAsRead(convId);

        // Show loading
        document.getElementById('chatMessages').innerHTML = '<div class="chat-loading"><div class="loading-spinner"></div></div>';

        // Load messages
        await this.loadMessages(conv);

        // Render label bar
        this.renderChatLabelBar(conv);

        // Fill order form
        if (window.inboxOrders) window.inboxOrders.fillCustomerInfo(conv);

        // Re-render list to update unread
        this.renderConversationList();

        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
    }

    async loadMessages(conv) {
        this.hasMoreMessages = true;
        this.messageCurrentCount = 0;
        this._optimisticMessages = [];

        try {
            const result = await this.api.fetchMessages(conv.pageId, conv.id, null, conv.customerId);
            const rawMessages = result.messages || [];

            // Detect livestream from post data
            if (result.post) {
                const postType = result.post.type;
                const liveStatus = result.post.live_video_status;
                if (postType === 'livestream' || liveStatus === 'vod' || liveStatus === 'live') {
                    if (!conv.isLivestream) {
                        this.data.markAsLivestream(conv.id, result.post.id || conv.postId);
                    }
                }
            }

            // Store metadata on conv
            conv._customers = result.customers;
            conv._activities = result.activities;
            conv._reports_by_phone = result.reports_by_phone;
            conv._recent_phone_numbers = result.recent_phone_numbers;
            conv._conv_phone_numbers = result.conv_phone_numbers;
            conv._notes = result.notes;
            conv._post = result.post;
            if (result.customerId) conv.customerId = result.customerId;

            // Map messages
            this.messages = rawMessages
                .filter(m => {
                    const text = m.message || m.original_message || '';
                    if (text.startsWith('Đã thêm nhãn tự động:')) return false;
                    if (text.startsWith('Đã đặt giai đoạn')) return false;
                    if (text === '[Tin nhắn trống]') return false;
                    return true;
                })
                .map(m => this._mapMessage(m, conv));

            this.messageCurrentCount = this.messages.length;

            this.renderMessages(conv);
            this.renderCustomerStatsBar(conv);
            this.renderPostInfo(conv);
            this.renderActivities(conv);
            this.renderNotes(conv);

        } catch (e) {
            console.error('[INBOX-CHAT] loadMessages error:', e);
            document.getElementById('chatMessages').innerHTML = `<div class="chat-error">Loi tai tin nhan: ${e.message}</div>`;
        }
    }

    _mapMessage(m, conv) {
        const fromId = m.from?.id || m.from_id || '';
        const isShop = (m.from?.is_page === true) || (String(fromId) === String(conv.pageId));

        return {
            id: m.id,
            text: m.original_message || this.stripHtml(m.message || ''),
            time: this.data.parseTimestamp(m.created_at || m.created_time),
            sender: isShop ? 'shop' : 'customer',
            senderName: m.from?.name || '',
            fromId,
            attachments: m.attachments || [],
            reactions: m.reactions || [],
            reactionSummary: m.reaction_summary || null,
            isHidden: m.is_hidden || false,
            isRemoved: m.is_removed || false,
            userLikes: m.user_likes || false,
            canHide: conv.type === 'COMMENT',
            canRemove: conv.type === 'COMMENT',
            canLike: conv.type === 'COMMENT',
            phoneInfo: m.phone_info || null,
            _raw: m
        };
    }

    async loadMoreMessages() {
        if (!this.hasMoreMessages || this.data.isLoading || !this.activeConvId) return;
        const conv = this.data.getConversation(this.activeConvId);
        if (!conv) return;

        const chatEl = document.getElementById('chatMessages');
        const prevHeight = chatEl.scrollHeight;

        const result = await this.api.fetchMessages(conv.pageId, conv.id, this.messageCurrentCount, conv.customerId);
        const older = (result.messages || []).map(m => this._mapMessage(m, conv));

        if (older.length === 0) {
            this.hasMoreMessages = false;
            return;
        }

        this.messages = [...older, ...this.messages];
        this.messageCurrentCount = this.messages.length;
        this.renderMessages(conv);

        // Maintain scroll position
        chatEl.scrollTop = chatEl.scrollHeight - prevHeight;
    }

    // =====================================================
    // RENDER MESSAGES
    // =====================================================

    renderMessages(conv) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        const allMessages = [...this.messages, ...this._optimisticMessages];

        if (allMessages.length === 0) {
            container.innerHTML = '<div class="chat-empty-state"><p>Chua co tin nhan</p></div>';
            return;
        }

        let html = '';
        let lastDate = '';

        for (const msg of allMessages) {
            const dateStr = this.formatDate(msg.time);
            if (dateStr !== lastDate) {
                html += `<div class="chat-date-divider"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
            }

            const isShop = msg.sender === 'shop';
            const bubbleClass = isShop ? 'msg-bubble shop' : 'msg-bubble customer';
            const hiddenClass = msg.isHidden ? 'msg-hidden' : '';
            const optimisticClass = msg.isOptimistic ? 'msg-optimistic' : '';

            const text = msg.text ? this.formatMessageText(msg.text) : '';
            const attachHtml = msg.attachments?.length ? this.renderAttachments(msg.attachments) : '';
            const timeStr = this.formatMessageTime(msg.time);

            // Reactions
            let reactionsHtml = '';
            if (msg.reactions?.length > 0) {
                const emojis = msg.reactions.map(r => this._reactionEmoji(r.type || r)).join('');
                reactionsHtml = `<div class="msg-reactions">${emojis}</div>`;
            }

            // Actions (for COMMENT type)
            let actionsHtml = '';
            if (conv.type === 'COMMENT' && !msg.isOptimistic) {
                actionsHtml = `
                    <div class="msg-actions">
                        ${msg.canLike ? `<button class="msg-action-btn" data-action="${msg.userLikes ? 'unlike' : 'like'}" data-msg="${msg.id}" title="${msg.userLikes ? 'Bo thich' : 'Thich'}"><i data-lucide="thumbs-up"></i></button>` : ''}
                        ${msg.canHide ? `<button class="msg-action-btn" data-action="${msg.isHidden ? 'unhide' : 'hide'}" data-msg="${msg.id}" title="${msg.isHidden ? 'Hien' : 'An'}"><i data-lucide="${msg.isHidden ? 'eye' : 'eye-off'}"></i></button>` : ''}
                        <button class="msg-action-btn" data-action="reply" data-msg="${msg.id}" title="Tra loi"><i data-lucide="corner-up-left"></i></button>
                        <button class="msg-action-btn msg-action-react" data-action="react" data-msg="${msg.id}" title="React"><i data-lucide="smile"></i></button>
                        <button class="msg-action-btn" data-action="copy" data-msg="${msg.id}" title="Sao chep"><i data-lucide="copy"></i></button>
                        ${msg.canRemove && isShop ? `<button class="msg-action-btn" data-action="delete" data-msg="${msg.id}" title="Xoa"><i data-lucide="trash-2"></i></button>` : ''}
                    </div>`;
            } else if (!msg.isOptimistic) {
                actionsHtml = `
                    <div class="msg-actions">
                        <button class="msg-action-btn" data-action="reply" data-msg="${msg.id}" title="Tra loi"><i data-lucide="corner-up-left"></i></button>
                        <button class="msg-action-btn" data-action="copy" data-msg="${msg.id}" title="Sao chep"><i data-lucide="copy"></i></button>
                    </div>`;
            }

            html += `
                <div class="msg-wrapper ${isShop ? 'shop' : 'customer'} ${hiddenClass} ${optimisticClass}" data-msg-id="${msg.id}">
                    <div class="${bubbleClass}">
                        ${!isShop ? `<div class="msg-sender-name">${this.escapeHtml(msg.senderName)}</div>` : ''}
                        ${text ? `<div class="msg-text">${text}</div>` : ''}
                        ${attachHtml}
                        <div class="msg-time">${timeStr}</div>
                        ${reactionsHtml}
                    </div>
                    ${actionsHtml}
                </div>`;
        }

        if (!this.hasMoreMessages) {
            html = '<div class="chat-start-marker">Dau cuoc hoi thoai</div>' + html;
        }

        container.innerHTML = html;

        // Bind message actions
        container.querySelectorAll('.msg-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleMessageAction(btn.dataset.action, btn.dataset.msg, btn);
            });
        });

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
    }

    renderAttachments(attachments) {
        if (!attachments || attachments.length === 0) return '';
        return attachments.map(att => {
            const type = att.type || att.mime_type || '';
            const url = att.url || att.src || att.payload?.url || '';
            if (!url) return '';

            if (type.includes('image') || type === 'photo' || type === 'sticker') {
                return `<div class="msg-attachment-img"><img src="${this.escapeHtml(url)}" alt="Image" loading="lazy" onclick="window.open('${this.escapeHtml(url)}','_blank')" /></div>`;
            }
            if (type.includes('video') || type === 'video') {
                return `<div class="msg-attachment-video"><video src="${this.escapeHtml(url)}" controls preload="metadata"></video></div>`;
            }
            if (type.includes('audio') || type === 'audio') {
                return `<div class="msg-attachment-audio"><audio src="${this.escapeHtml(url)}" controls></audio></div>`;
            }
            const name = att.name || att.filename || 'File';
            return `<div class="msg-attachment-file"><a href="${this.escapeHtml(url)}" target="_blank"><i data-lucide="file"></i> ${this.escapeHtml(name)}</a></div>`;
        }).join('');
    }

    _reactionEmoji(type) {
        const map = { LIKE: '👍', LOVE: '❤️', HAHA: '😂', WOW: '😮', SAD: '😢', ANGRY: '😡' };
        return map[type] || type;
    }

    // =====================================================
    // SEND MESSAGE
    // =====================================================

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const text = input?.value?.trim() || '';
        const conv = this.data.getConversation(this.activeConvId);

        if (!conv) return;
        if (!text && !this.selectedImage) return;

        // Clear input
        if (input) input.value = '';

        // Get send page
        const sendPageId = document.getElementById('sendPageSelector')?.value || conv.pageId;

        // 24h window check (warning only)
        const windowCheck = this.data.check24hWindow(conv.id);
        if (!windowCheck.within24h) {
            console.warn('[INBOX-CHAT] 24h window:', windowCheck.message);
        }

        // Capture reply state
        const replyData = this.replyingTo ? { ...this.replyingTo } : null;
        this.cancelReply();

        // Optimistic UI
        const optMsg = this.data.addMessage(conv.id, text, 'shop');
        if (optMsg) {
            this._optimisticMessages.push(optMsg);
            this.renderMessages(conv);
            this.renderConversationList();
        }

        try {
            // Get page access token (3-step fallback)
            const pageAccessToken = await this._getPageAccessTokenWithFallback(sendPageId);
            if (!pageAccessToken) {
                showToast('Khong co page_access_token. Vui long them trong Pancake Settings.', 'error');
                return;
            }

            // Handle image upload
            if (this.selectedImage) {
                const uploadResult = await this.api.uploadMedia(sendPageId, this.selectedImage, pageAccessToken);
                if (uploadResult.success && uploadResult.content_url) {
                    const payload = { action: 'reply_inbox', content_url: uploadResult.content_url };
                    await this.api.sendMessage(sendPageId, conv.id, payload, pageAccessToken);
                } else {
                    throw new Error('Upload anh that bai');
                }
                this._clearImagePreview();
            }

            // Handle text
            if (text) {
                if (conv.type === 'INBOX') {
                    await this._sendInbox(sendPageId, conv.id, text, conv, replyData, pageAccessToken);
                } else {
                    const replyType = document.getElementById('replyTypeSelector')?.value || 'reply_comment';
                    await this._sendComment(sendPageId, conv.id, text, conv, replyData, replyType, pageAccessToken);
                }
            }

            // Mark as read & reload
            this.data.markAsRead(conv.id);
            setTimeout(() => {
                this.api.clearMessagesCache(conv.pageId, conv.id);
                this.loadMessages(conv);
            }, 2000);

        } catch (e) {
            console.error('[INBOX-CHAT] sendMessage error:', e);
            showToast(`Loi gui tin nhan: ${e.message}`, 'error');
        } finally {
            this._optimisticMessages = [];
        }
    }

    async _sendInbox(pageId, convId, text, conv, replyData, pageAccessToken) {
        const payload = { action: 'reply_inbox', message: text };
        if (replyData?.id) payload.replied_message_id = replyData.id;

        const result = await this.api.sendMessage(pageId, convId, payload, pageAccessToken);

        // Check for 24h error → fallback to private_replies
        if (result.error_code === 10 || result.error_code === 551 ||
            (result.error?.code === 10 && result.error?.error_subcode === 2018278)) {
            console.log('[INBOX-CHAT] 24h expired, trying private_replies...');
            const raw = conv._raw || {};
            const fallbackPayload = {
                action: 'private_replies',
                post_id: raw.post_id || conv.postId,
                message_id: raw.last_message_id || replyData?.id,
                from_id: conv.psid || conv.customerFbId,
                message: text
            };
            const fbResult = await this.api.sendMessage(pageId, convId, fallbackPayload, pageAccessToken);
            if (!fbResult.success && fbResult.error) throw new Error(fbResult.error.message || 'Gui that bai');
        } else if (!result.success && result.error) {
            throw new Error(result.error.message || result.message || 'Gui that bai');
        }
    }

    async _sendComment(pageId, convId, text, conv, replyData, selectedType, pageAccessToken) {
        if (selectedType === 'reply_comment') {
            const commentId = replyData?.id || this.messages[this.messages.length - 1]?.id;
            const payload = { action: 'reply_comment', message_id: commentId, message: text };
            const result = await this.api.sendMessage(pageId, convId, payload, pageAccessToken);

            if (!result.success) {
                // Fallback to private_replies
                const raw = conv._raw || {};
                const fallback = {
                    action: 'private_replies',
                    post_id: raw.post_id || conv.postId,
                    message_id: commentId,
                    from_id: conv.psid || conv.customerFbId,
                    message: text
                };
                await this.api.sendMessage(pageId, convId, fallback, pageAccessToken);
            }
        } else {
            // private_replies
            const raw = conv._raw || {};
            const commentId = replyData?.id || this.messages[this.messages.length - 1]?.id;
            const payload = {
                action: 'private_replies',
                post_id: raw.post_id || conv.postId,
                message_id: commentId,
                from_id: conv.psid || conv.customerFbId,
                message: text
            };
            const result = await this.api.sendMessage(pageId, convId, payload, pageAccessToken);

            if (!result.success) {
                // Fallback to reply_inbox
                const fallback = { action: 'reply_inbox', message: text };
                await this.api.sendMessage(pageId, convId, fallback, pageAccessToken);
            }
        }
    }

    async _getPageAccessTokenWithFallback(pageId) {
        // 1. Cache
        let token = this.tm.getPageAccessToken(pageId);
        if (token) return token;

        // 2. Generate with current JWT
        const jwt = await this.tm.getToken();
        if (jwt) {
            token = await this.tm.generatePageAccessToken(pageId, jwt);
            if (token) return token;
        }

        // 3. Try other accounts
        const other = this.tm.findAccountWithPageAccess(pageId);
        if (other) {
            token = await this.tm.generatePageAccessToken(pageId, other.token);
            if (token) return token;
        }

        return null;
    }

    // =====================================================
    // MESSAGE ACTIONS
    // =====================================================

    async handleMessageAction(action, msgId, btn) {
        const conv = this.data.getConversation(this.activeConvId);
        if (!conv) return;

        const pageAccessToken = await this._getPageAccessTokenWithFallback(conv.pageId);

        switch (action) {
            case 'like':
                await this.api.likeComment(conv.pageId, msgId, pageAccessToken);
                showToast('Da thich', 'success');
                break;
            case 'unlike':
                await this.api.unlikeComment(conv.pageId, msgId, pageAccessToken);
                showToast('Da bo thich', 'info');
                break;
            case 'hide':
                await this.api.hideComment(conv.pageId, msgId, pageAccessToken);
                showToast('Da an binh luan', 'success');
                break;
            case 'unhide':
                await this.api.unhideComment(conv.pageId, msgId, pageAccessToken);
                showToast('Da hien binh luan', 'info');
                break;
            case 'delete':
                if (confirm('Xoa binh luan nay?')) {
                    await this.api.deleteComment(conv.pageId, msgId, pageAccessToken);
                    showToast('Da xoa', 'success');
                }
                break;
            case 'reply':
                const msg = this.messages.find(m => m.id === msgId);
                if (msg) this.setReplyingTo(msg, conv);
                break;
            case 'react':
                this._showReactionPicker(msgId, btn);
                break;
            case 'copy':
                const copyMsg = this.messages.find(m => m.id === msgId);
                if (copyMsg?.text) {
                    navigator.clipboard?.writeText(copyMsg.text);
                    showToast('Da sao chep', 'success');
                }
                break;
        }

        // Reload messages after action
        if (['like', 'unlike', 'hide', 'unhide', 'delete'].includes(action)) {
            setTimeout(() => {
                this.api.clearMessagesCache(conv.pageId, conv.id);
                this.loadMessages(conv);
            }, 1000);
        }
    }

    setReplyingTo(msg, conv) {
        this.replyingTo = { id: msg.id, text: msg.text, senderName: msg.senderName };
        document.getElementById('replyPreviewText').textContent = `${msg.senderName}: ${(msg.text || '').substring(0, 80)}`;
        document.getElementById('replyPreviewBar').style.display = 'flex';
        document.getElementById('chatInput')?.focus();
    }

    cancelReply() {
        this.replyingTo = null;
        document.getElementById('replyPreviewBar').style.display = 'none';
    }

    _showReactionPicker(msgId, btn) {
        const picker = document.getElementById('reactionPicker');
        if (!picker) return;
        const rect = btn.getBoundingClientRect();
        picker.style.top = (rect.top - 50) + 'px';
        picker.style.left = rect.left + 'px';
        picker.style.display = 'flex';

        picker.querySelectorAll('.reaction-btn').forEach(rb => {
            rb.onclick = async () => {
                picker.style.display = 'none';
                const conv = this.data.getConversation(this.activeConvId);
                if (!conv) return;
                const pat = await this._getPageAccessTokenWithFallback(conv.pageId);
                await this.api.sendReaction(conv.pageId, msgId, rb.dataset.reaction, pat);
                showToast('Da react', 'success');
                setTimeout(() => {
                    this.api.clearMessagesCache(conv.pageId, conv.id);
                    this.loadMessages(conv);
                }, 1000);
            };
        });
    }

    // =====================================================
    // IMAGE / FILE UPLOAD
    // =====================================================

    attachImage(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) {
            showToast('File qua lon (toi da 25MB)', 'error');
            return;
        }
        this.selectedImage = file;
        const reader = new FileReader();
        reader.onload = (re) => {
            document.getElementById('imagePreviewImg').src = re.target.result;
            document.getElementById('imagePreviewBar').style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }

    async attachFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) {
            showToast('File qua lon (toi da 25MB)', 'error');
            return;
        }
        const conv = this.data.getConversation(this.activeConvId);
        if (!conv) return;

        const pat = await this._getPageAccessTokenWithFallback(conv.pageId);
        if (!pat) { showToast('Khong co page_access_token', 'error'); return; }

        showToast('Dang tai file...', 'info');
        const result = await this.api.uploadMedia(conv.pageId, file, pat);
        if (result.success && result.content_url) {
            await this.api.sendMessage(conv.pageId, conv.id, { action: 'reply_inbox', content_url: result.content_url }, pat);
            showToast('Da gui file', 'success');
            setTimeout(() => this.loadMessages(conv), 2000);
        } else {
            showToast('Tai file that bai', 'error');
        }
        e.target.value = '';
    }

    _clearImagePreview() {
        this.selectedImage = null;
        document.getElementById('imagePreviewBar').style.display = 'none';
        document.getElementById('imagePreviewImg').src = '';
        document.getElementById('imageFileInput').value = '';
    }

    // =====================================================
    // LOAD MORE CONVERSATIONS
    // =====================================================

    async loadMoreConversations() {
        if (this.data.isLoading || !this.data.hasMore || this.isSearching) return;
        document.getElementById('convLoadMore').style.display = 'flex';
        const more = await this.data.loadMoreConversations();
        document.getElementById('convLoadMore').style.display = 'none';
        if (more.length > 0) this.renderConversationList();
    }

    // =====================================================
    // SEARCH
    // =====================================================

    async performSearch(query) {
        if (query.length < 2) return;
        this.isSearching = true;

        const result = await this.api.searchConversations(query);
        if (result.conversations?.length > 0) {
            // Map and merge with local
            const mapped = result.conversations.map(c => this.data.mapConversation(c));
            const existingIds = new Set(this.data.conversations.map(c => c.id));
            for (const conv of mapped) {
                if (!existingIds.has(conv.id)) {
                    this.data.conversations.push(conv);
                }
            }
            this.data.buildMaps();
            this.renderConversationList();
        }
        this.isSearching = false;
    }

    // =====================================================
    // WEBSOCKET & REALTIME
    // =====================================================

    async initializeWebSocket() {
        try {
            const token = await this.tm.getToken();
            if (!token) {
                console.warn('[INBOX-CHAT] No token for WebSocket');
                this.startAutoRefresh();
                return;
            }

            const payload = this.tm.decodeToken(token);
            if (!payload?.uid) {
                this.startAutoRefresh();
                return;
            }

            const userId = payload.uid;
            const pageIds = this.data.pageIds;
            const cookie = `jwt=${token}; locale=vi`;

            // Step 1: Start server-side Pancake WS
            await fetch(InboxApiConfig.buildUrl.realtimeApi('start'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, userId, pageIds, cookie })
            });

            // Step 2: Check status with retry
            let connected = false;
            for (let i = 0; i < 3; i++) {
                await new Promise(r => setTimeout(r, 2000 * (i + 1)));
                try {
                    const statusRes = await fetch(InboxApiConfig.buildUrl.realtimeApi('status'));
                    const status = await statusRes.json();
                    if (status.pancakeConnected || status.connected) {
                        connected = true;
                        break;
                    }
                } catch (e) {}
            }

            if (!connected) {
                console.warn('[INBOX-CHAT] Pancake WS not connected, using polling');
                this.startAutoRefresh();
            }

            // Step 3: Connect client WebSocket
            this.socket = new WebSocket(InboxApiConfig.WS_URL);

            this.socket.onopen = () => this._onSocketOpen();
            this.socket.onclose = (e) => this._onSocketClose(e);
            this.socket.onmessage = (e) => this._onSocketMessage(e);
            this.socket.onerror = (e) => console.error('[INBOX-CHAT] WS error:', e);

        } catch (e) {
            console.error('[INBOX-CHAT] initializeWebSocket error:', e);
            this.startAutoRefresh();
        }
    }

    _onSocketOpen() {
        this.isSocketConnected = true;
        this.socketReconnectAttempts = 0;
        this.updateSocketStatusUI(true);
        this.stopAutoRefresh();
        console.log('[INBOX-CHAT] WebSocket connected');
    }

    _onSocketClose(event) {
        this.isSocketConnected = false;
        this.updateSocketStatusUI(false);
        console.log('[INBOX-CHAT] WebSocket closed:', event.code);

        // Start polling immediately as backup
        this.startAutoRefresh();

        // Try to reconnect
        if (this.socketReconnectAttempts < this.socketMaxReconnectAttempts) {
            this.socketReconnectAttempts++;
            const delay = Math.min(this.socketReconnectDelay * Math.pow(1.5, this.socketReconnectAttempts - 1), 15000);
            console.log(`[INBOX-CHAT] Reconnecting in ${delay}ms (attempt ${this.socketReconnectAttempts})`);
            setTimeout(() => this.initializeWebSocket(), delay);
        }
    }

    _onSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            const type = data.type || data.event;

            if (type === 'pages:update_conversation') {
                this.handleConversationUpdate(data.payload || data);
            } else if (type === 'pages:new_message') {
                this.handleNewMessage(data.payload || data);
            } else if (type === 'post_type_detected') {
                this._handlePostTypeDetected(data.payload || data);
            }
        } catch (e) {
            console.error('[INBOX-CHAT] WS message parse error:', e);
        }
    }

    handleConversationUpdate(payload) {
        const convData = payload.conversation || payload;
        if (!convData) return;

        const pageId = String(convData.page_id || '');
        const type = convData.type;

        // Filter by page
        if (this.data.pageIds.length > 0 && !this.data.pageIds.some(id => String(id) === pageId)) {
            return;
        }

        // Filter type
        if (type && type !== 'INBOX' && type !== 'COMMENT') return;

        // Find or create conversation
        const convId = convData.id;
        let conv = this.data.getConversation(convId);

        if (conv) {
            conv.snippet = convData.snippet || conv.snippet;
            conv.time = this.data.parseTimestamp(convData.updated_at) || conv.time;
            conv.unread = convData.unread_count ?? conv.unread;
            conv.seen = convData.seen !== false;
            if (convData.tags) conv.tags = convData.tags;
        } else {
            conv = this.data.mapConversation(convData);
            this.data.conversations.unshift(conv);
            this.data.buildMaps();
        }

        this.renderConversationList();
        this.data.recalculateGroupCounts();
        this.renderGroupStats();

        // Auto-reload messages if this is the active conversation
        if (convId === this.activeConvId) {
            this.api.clearMessagesCache(pageId, convId);
            this.loadMessages(conv);
        }
    }

    handleNewMessage(payload) {
        const msg = payload.message || payload;
        if (!msg) return;

        const convId = msg.conversation_id;
        const conv = this.data.getConversation(convId);
        if (conv) {
            conv.snippet = msg.message || conv.snippet;
            conv.time = new Date();
            this.renderConversationList();

            if (convId === this.activeConvId) {
                this.api.clearMessagesCache(conv.pageId, convId);
                this.loadMessages(conv);
            }
        }
    }

    _handlePostTypeDetected(data) {
        const convId = data.conv_id || data.conversation_id;
        const postId = data.post_id;
        const isLivestream = data.is_livestream;

        if (convId && isLivestream) {
            this.data.markAsLivestream(convId, postId);
            this.renderConversationList();
        }
    }

    startAutoRefresh() {
        if (this.autoRefreshInterval) return;
        this.autoRefreshInterval = setInterval(async () => {
            await this.data.loadConversations(true);
            this.data.recalculateGroupCounts();
            this.renderConversationList();
            this.renderGroupStats();
        }, 30000);
        console.log('[INBOX-CHAT] Auto-refresh started (30s)');
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
            console.log('[INBOX-CHAT] Auto-refresh stopped');
        }
    }

    closeWebSocket() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.stopAutoRefresh();
    }

    updateSocketStatusUI(connected) {
        const indicator = document.getElementById('wsStatusIndicator');
        if (!indicator) return;
        indicator.innerHTML = connected
            ? '<i data-lucide="wifi" style="color:var(--success);"></i>'
            : '<i data-lucide="wifi-off" style="color:var(--text-tertiary);"></i>';
        indicator.title = connected ? 'Real-time: Connected' : 'Real-time: Disconnected';
        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
    }

    // =====================================================
    // PAGE SELECTOR
    // =====================================================

    renderPageSelector() {
        const dropdown = document.getElementById('pageSelectorDropdown');
        if (!dropdown) return;

        let html = `<label class="page-option"><input type="checkbox" value="all" checked /> Tat ca Pages</label>`;
        for (const page of this.data.pages) {
            html += `<label class="page-option"><input type="checkbox" value="${page.id}" /> ${this.escapeHtml(page.name || page.id)}</label>`;
        }
        dropdown.innerHTML = html;

        dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.value === 'all') {
                    dropdown.querySelectorAll('input').forEach(c => c.checked = cb.checked);
                    this.selectedPageIds = [];
                } else {
                    dropdown.querySelector('input[value="all"]').checked = false;
                    this.selectedPageIds = [...dropdown.querySelectorAll('input:checked')]
                        .filter(c => c.value !== 'all').map(c => c.value);
                }
                this._updatePageSelectorLabel();
                this.renderConversationList();
            });
        });
    }

    _updatePageSelectorLabel() {
        const label = document.getElementById('pageSelectorLabel');
        if (!label) return;
        if (this.selectedPageIds.length === 0) {
            label.textContent = 'Tat ca Pages';
        } else if (this.selectedPageIds.length === 1) {
            const page = this.data.pages.find(p => p.id === this.selectedPageIds[0]);
            label.textContent = page?.name || this.selectedPageIds[0];
        } else {
            label.textContent = `${this.selectedPageIds.length} Pages`;
        }
    }

    _populateSendPageSelector(conv) {
        const sel = document.getElementById('sendPageSelector');
        if (!sel) return;
        sel.innerHTML = this.data.pages.map(p =>
            `<option value="${p.id}" ${p.id === conv.pageId ? 'selected' : ''}>${this.escapeHtml(p.name || p.id)}</option>`
        ).join('');
    }

    _populateReplyTypeSelector(conv) {
        const sel = document.getElementById('replyTypeSelector');
        if (!sel) return;
        sel.style.display = conv.type === 'COMMENT' ? '' : 'none';
    }

    _onSendPageChanged(pageId) {
        // Could pre-validate page access token here
    }

    async updatePageUnreadCounts() {
        const counts = await this.api.fetchPagesUnreadCount();
        // Could update UI badges on page selector
        return counts;
    }

    toggleReadUnread(convId) {
        const conv = this.data.getConversation(convId);
        if (!conv) return;
        if (conv.unread > 0) {
            this.data.markAsRead(convId);
        } else {
            this.data.markAsUnread(convId);
        }
        this.renderConversationList();
    }

    // =====================================================
    // GROUP STATS
    // =====================================================

    renderGroupStats() {
        const container = document.getElementById('groupStatsList');
        if (!container) return;

        container.innerHTML = this.data.groups.map(g => {
            const isActive = this.groupFilters.includes(g.id);
            return `
                <div class="group-stat-card ${isActive ? 'active' : ''}" data-group="${g.id}" style="border-left:4px solid ${g.color};">
                    <div class="group-stat-name">${this.escapeHtml(g.name)}</div>
                    <div class="group-stat-count">${g.count}</div>
                </div>`;
        }).join('');

        container.querySelectorAll('.group-stat-card').forEach(card => {
            card.addEventListener('click', () => {
                const gid = card.dataset.group;
                if (this.groupFilters.includes(gid)) {
                    this.groupFilters = this.groupFilters.filter(g => g !== gid);
                } else {
                    this.groupFilters.push(gid);
                }
                this.renderGroupStats();
                this.renderConversationList();
            });
        });
    }

    // =====================================================
    // LABEL BAR
    // =====================================================

    renderChatLabelBar(conv) {
        const bar = document.getElementById('chatLabelBar');
        if (!bar) return;
        if (!conv) { bar.style.display = 'none'; return; }

        bar.style.display = 'flex';
        const labels = this.data.getLabelArray(conv.id);

        bar.innerHTML = this.data.groups.map(g => {
            const isActive = labels.includes(g.id);
            return `<button class="label-btn ${isActive ? 'active' : ''}" data-label="${g.id}" style="--label-color:${g.color};">${this.escapeHtml(g.name)}</button>`;
        }).join('');

        bar.querySelectorAll('.label-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.data.toggleConversationLabel(conv.id, btn.dataset.label);
                this.renderChatLabelBar(conv);
                this.renderGroupStats();
                this.renderConversationList();
            });
        });
    }

    // =====================================================
    // MANAGE GROUPS MODAL
    // =====================================================

    showManageGroupsModal() {
        const modal = document.getElementById('manageGroupsModal');
        const body = document.getElementById('manageGroupsBody');
        if (!modal || !body) return;

        const colors = ['#3b82f6', '#f59e0b', '#f97316', '#10b981', '#ef4444', '#6b7280', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];

        body.innerHTML = this.data.groups.map(g => `
            <div class="manage-group-item" data-id="${g.id}">
                <input type="text" class="group-name-input" value="${this.escapeHtml(g.name)}" />
                <div class="color-picker">
                    ${colors.map(c => `<span class="color-swatch ${c === g.color ? 'active' : ''}" data-color="${c}" style="background:${c};"></span>`).join('')}
                </div>
                <input type="text" class="group-note-input" value="${this.escapeHtml(g.note || '')}" placeholder="Ghi chu..." />
                ${['new', 'processing', 'waiting', 'ordered', 'urgent', 'done'].includes(g.id) ? '' :
                    `<button class="btn-delete-group" data-id="${g.id}"><i data-lucide="trash-2"></i></button>`}
            </div>
        `).join('');

        // Bind color swatches
        body.querySelectorAll('.color-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                const item = sw.closest('.manage-group-item');
                item.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                sw.classList.add('active');
                const gid = item.dataset.id;
                this.data.updateGroup(gid, { color: sw.dataset.color });
                this.renderGroupStats();
            });
        });

        // Bind name/note changes
        body.querySelectorAll('.group-name-input').forEach(input => {
            input.addEventListener('change', () => {
                const gid = input.closest('.manage-group-item').dataset.id;
                this.data.updateGroup(gid, { name: input.value });
                this.renderGroupStats();
            });
        });
        body.querySelectorAll('.group-note-input').forEach(input => {
            input.addEventListener('change', () => {
                const gid = input.closest('.manage-group-item').dataset.id;
                this.data.updateGroup(gid, { note: input.value });
            });
        });

        // Bind delete
        body.querySelectorAll('.btn-delete-group').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Xoa nhom nay?')) {
                    this.data.deleteGroup(btn.dataset.id);
                    this.showManageGroupsModal();
                    this.renderGroupStats();
                }
            });
        });

        // Add new group
        document.getElementById('btnAddNewGroup').onclick = () => {
            const name = prompt('Ten nhom moi:');
            if (name) {
                this.data.addGroup(name, '#8b5cf6');
                this.showManageGroupsModal();
                this.renderGroupStats();
            }
        };

        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
    }

    // =====================================================
    // LIVESTREAM
    // =====================================================

    toggleLivestreamStatus() {
        const conv = this.data.getConversation(this.activeConvId);
        if (!conv) return;

        if (conv.isLivestream) {
            this.data.unmarkAsLivestream(conv.id);
            showToast('Da bo danh dau livestream', 'info');
        } else {
            const postId = conv.postId || conv._raw?.post_id || '';
            this.data.markAsLivestream(conv.id, postId);
            showToast('Da danh dau livestream', 'success');
        }
        this.renderConversationList();
    }

    // =====================================================
    // CUSTOMER STATS BAR
    // =====================================================

    renderCustomerStatsBar(conv) {
        const bar = document.getElementById('customerStatsBar');
        if (!bar || !conv) { if (bar) bar.style.display = 'none'; return; }

        const phones = conv._recent_phone_numbers || conv._conv_phone_numbers || [];
        const reports = conv._reports_by_phone || {};
        const commentCount = conv._raw?.comment_count || 0;

        if (phones.length === 0 && commentCount === 0 && Object.keys(reports).length === 0) {
            bar.style.display = 'none';
            return;
        }

        let html = '';
        if (phones.length > 0) {
            html += `<span class="stat-tag"><i data-lucide="phone"></i> ${phones.join(', ')}</span>`;
        }
        if (commentCount > 0) {
            html += `<span class="stat-tag"><i data-lucide="message-circle"></i> ${commentCount} binh luan</span>`;
        }
        for (const [phone, report] of Object.entries(reports)) {
            if (report.total_orders) {
                html += `<span class="stat-tag"><i data-lucide="package"></i> ${report.total_orders} don | ${report.success_orders || 0} TC | ${report.return_orders || 0} hoan</span>`;
            }
        }

        bar.innerHTML = html;
        bar.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
    }

    // =====================================================
    // POST INFO BANNER
    // =====================================================

    renderPostInfo(conv) {
        const banner = document.getElementById('postInfoBanner');
        if (!banner || !conv) { if (banner) banner.style.display = 'none'; return; }

        const post = conv._post;
        if (!post) { banner.style.display = 'none'; return; }

        const thumb = post.thumbnail_url || post.full_picture || '';
        const title = post.message || post.name || 'Bai viet';

        banner.innerHTML = `
            ${thumb ? `<img src="${this.escapeHtml(thumb)}" class="post-thumbnail" alt="" />` : ''}
            <div class="post-info-text">
                <span class="post-info-title">${this.escapeHtml(title.substring(0, 100))}</span>
                ${post.type === 'livestream' || post.live_video_status ? '<span class="post-live-badge">LIVE</span>' : ''}
            </div>`;
        banner.style.display = 'flex';
    }

    // =====================================================
    // ACTIVITIES PANEL
    // =====================================================

    renderActivities(conv) {
        const container = document.getElementById('activitiesContent');
        if (!container) return;

        const activities = conv?._activities || [];
        if (activities.length === 0) {
            container.innerHTML = `<div style="text-align:center;color:var(--text-tertiary);padding:2rem;">
                <i data-lucide="activity" style="width:32px;height:32px;opacity:0.5;"></i>
                <p style="margin-top:0.5rem;">Khong co hoat dong</p>
            </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
            return;
        }

        container.innerHTML = activities.map(a => `
            <div class="activity-item">
                <div class="activity-title">${this.escapeHtml(a.title || a.message || '')}</div>
                <div class="activity-time">${a.created_at ? this.formatTime(this.data.parseTimestamp(a.created_at)) : ''}</div>
            </div>
        `).join('');
    }

    // =====================================================
    // NOTES PANEL
    // =====================================================

    renderNotes(conv) {
        const section = document.getElementById('notesSection');
        const content = document.getElementById('notesContent');
        if (!section || !content) return;

        const notes = conv?._notes || [];
        if (notes.length === 0) { section.style.display = 'none'; return; }

        section.style.display = 'block';
        content.innerHTML = notes.map(n => `
            <div class="note-item">
                <div class="note-text">${this.escapeHtml(n.message || n.content || '')}</div>
                <div class="note-meta">${n.user_name || ''} - ${n.created_at ? this.formatTime(this.data.parseTimestamp(n.created_at)) : ''}</div>
            </div>
        `).join('');
    }

    // =====================================================
    // EMOJI PICKER
    // =====================================================

    renderEmojiGrid(category) {
        const grid = document.getElementById('emojiGrid');
        if (!grid) return;

        const emojis = {
            smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
            people: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄'],
            animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊'],
            food: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊','🥄','🍴','🍽️'],
            objects: ['💡','🔦','🕯️','💰','💵','💴','💶','💷','🪙','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','🪬','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','🩻','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'],
            symbols: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚻','🚼','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','🟰','♾️','💲','💱','™️','©️','®️','👁️‍🗨️','🔚','🔙','🔛','🔝','🔜','〰️','➰','➿','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢']
        };

        const list = emojis[category] || emojis.smileys;
        grid.innerHTML = list.map(e => `<span class="emoji-item">${e}</span>`).join('');

        grid.querySelectorAll('.emoji-item').forEach(el => {
            el.addEventListener('click', () => {
                const input = document.getElementById('chatInput');
                if (input) {
                    input.value += el.textContent;
                    input.focus();
                }
            });
        });
    }

    // =====================================================
    // AVATAR
    // =====================================================

    getAvatarHtml(conv, size = 40) {
        if (!conv) return `<div class="avatar-placeholder" style="width:${size}px;height:${size}px;"><i data-lucide="user"></i></div>`;

        // Try direct avatar URL
        const avatarUrl = this.api.getAvatarUrl(
            conv.customerFbId || conv.psid,
            conv.pageId,
            null,
            conv.avatar
        );

        if (conv.avatar && (conv.avatar.includes('content.pancake.vn') || conv.avatar.startsWith('http'))) {
            return `<img src="${this.escapeHtml(conv.avatar)}" class="avatar-img" style="width:${size}px;height:${size}px;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="avatar-placeholder" style="width:${size}px;height:${size}px;display:none;background:${AVATAR_GRADIENTS[Math.abs(this._hashCode(conv.name || '')) % AVATAR_GRADIENTS.length]};">${(conv.name || '?')[0].toUpperCase()}</div>`;
        }

        if (conv.customerFbId || conv.psid) {
            return `<img src="${this.escapeHtml(avatarUrl)}" class="avatar-img" style="width:${size}px;height:${size}px;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="avatar-placeholder" style="width:${size}px;height:${size}px;display:none;background:${AVATAR_GRADIENTS[Math.abs(this._hashCode(conv.name || '')) % AVATAR_GRADIENTS.length]};">${(conv.name || '?')[0].toUpperCase()}</div>`;
        }

        const gradient = AVATAR_GRADIENTS[Math.abs(this._hashCode(conv.name || '')) % AVATAR_GRADIENTS.length];
        return `<div class="avatar-placeholder" style="width:${size}px;height:${size}px;background:${gradient};">${(conv.name || '?')[0].toUpperCase()}</div>`;
    }

    _hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    // =====================================================
    // FORMAT UTILITIES
    // =====================================================

    formatTime(date) {
        if (!date || !(date instanceof Date) || isNaN(date)) return '';
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Vua xong';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'p';
        if (diff < 86400000 && date.getDate() === now.getDate()) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        }

        const dayDiff = Math.floor(diff / 86400000);
        if (dayDiff < 7) {
            const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
            return days[date.getDay()];
        }

        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    }

    formatDate(date) {
        if (!date || !(date instanceof Date) || isNaN(date)) return '';
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        if (msgDay.getTime() === today.getTime()) return 'Hom nay';
        if (today - msgDay === 86400000) return 'Hom qua';
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
    }

    formatMessageTime(date) {
        if (!date || !(date instanceof Date) || isNaN(date)) return '';
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    }

    formatMessageText(text) {
        if (!text) return '';
        let escaped = this.escapeHtml(text);
        // Linkify URLs
        escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        // Newlines
        escaped = escaped.replace(/\n/g, '<br>');
        return escaped;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    stripHtml(html) {
        if (!html) return '';
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || '';
    }
}

window.InboxChatController = InboxChatController;
console.log('[INBOX-CHAT] Loaded');
