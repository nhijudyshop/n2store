/* =====================================================
   INBOX CHAT - Chat UI Controller with Pancake API
   Reference: tpos-pancake/js/pancake-chat.js
   ===================================================== */

// Gradient colors for avatar placeholders (from tpos-pancake)
const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
];

class InboxChatController {
    constructor(dataManager) {
        this.data = dataManager;
        this.activeConversationId = null;
        this.currentFilter = 'all';
        this.currentGroupFilter = null;
        this.searchQuery = '';
        this.selectedPageId = null; // Page filter
        this.isSending = false;
        this.isLoadingMessages = false;

        this.elements = {
            conversationList: document.getElementById('conversationList'),
            chatMessages: document.getElementById('chatMessages'),
            chatInput: document.getElementById('chatInput'),
            chatUserName: document.getElementById('chatUserName'),
            chatUserStatus: document.getElementById('chatUserStatus'),
            chatHeader: document.getElementById('chatHeader'),
            searchInput: document.getElementById('searchConversation'),
            btnSend: document.getElementById('btnSend'),
            btnStarConversation: document.getElementById('btnStarConversation'),
            btnRefreshInbox: document.getElementById('btnRefreshInbox'),
            chatLabelBar: document.getElementById('chatLabelBar'),
            chatLabelBarList: document.getElementById('chatLabelBarList'),
            groupStatsList: document.getElementById('groupStatsList'),
            pageSelectorBtn: document.getElementById('pageSelectorBtn'),
            pageSelectorDropdown: document.getElementById('pageSelectorDropdown'),
            pageSelectorLabel: document.getElementById('pageSelectorLabel'),
        };
    }

    init() {
        this.bindEvents();
        this.renderPageSelector();
        this.renderConversationList();
        this.renderGroupStats();
    }

    bindEvents() {
        // Search
        this.elements.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.renderConversationList();
        });

        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentFilter = tab.dataset.filter;
                this.renderConversationList();
            });
        });

        // Send message
        this.elements.btnSend.addEventListener('click', () => this.sendMessage());
        this.elements.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.elements.chatInput.addEventListener('input', () => {
            const el = this.elements.chatInput;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
        });

        // Star conversation
        this.elements.btnStarConversation.addEventListener('click', () => {
            if (this.activeConversationId) {
                const starred = this.data.toggleStar(this.activeConversationId);
                this.updateStarButton(starred);
                this.renderConversationList();
            }
        });

        // Refresh - reload from Pancake API
        this.elements.btnRefreshInbox.addEventListener('click', async () => {
            const btn = this.elements.btnRefreshInbox;
            btn.disabled = true;
            btn.style.opacity = '0.5';
            try {
                await this.data.loadConversations(true);
                this.renderPageSelector();
                this.renderConversationList();
                this.renderGroupStats();
                showToast('Đã làm mới dữ liệu từ Pancake', 'success');
            } catch (err) {
                showToast('Lỗi làm mới: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        });

        // Info panel tabs
        document.querySelectorAll('.info-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const tabMap = { stats: 'tabStats', activities: 'tabActivities', orders: 'tabOrders' };
                const target = document.getElementById(tabMap[tab.dataset.tab] || 'tabStats');
                if (target) target.classList.add('active');
            });
        });

        // Toggle right panel
        const btnToggle = document.getElementById('btnToggleRightPanel');
        if (btnToggle) {
            btnToggle.addEventListener('click', () => {
                const panel = document.getElementById('col3');
                panel.classList.toggle('hidden');
                panel.classList.toggle('force-show');
            });
        }

        // Manage groups button
        const btnManageGroups = document.getElementById('btnManageGroups');
        if (btnManageGroups) {
            btnManageGroups.addEventListener('click', () => this.showManageGroupsModal());
        }

        // Attach image button
        const btnAttachImage = document.getElementById('btnAttachImage');
        if (btnAttachImage) {
            btnAttachImage.addEventListener('click', () => this.attachImage());
        }

        // Page selector toggle
        if (this.elements.pageSelectorBtn) {
            this.elements.pageSelectorBtn.addEventListener('click', () => {
                const dd = this.elements.pageSelectorDropdown;
                dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
            });
            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.page-selector')) {
                    this.elements.pageSelectorDropdown.style.display = 'none';
                }
            });
        }
    }

    // ===== Page Selector (from tpos-pancake) =====

    renderPageSelector() {
        const dropdown = this.elements.pageSelectorDropdown;
        if (!dropdown) return;

        const pages = this.data.pages || [];
        if (pages.length === 0) {
            dropdown.innerHTML = '<div class="page-item" style="padding:8px;color:var(--text-tertiary);">Chưa có pages</div>';
            return;
        }

        let html = `
            <div class="page-item ${!this.selectedPageId ? 'active' : ''}" data-page-id="">
                <div class="page-item-icon"><i data-lucide="layout-grid"></i></div>
                <div class="page-item-info">
                    <div class="page-item-name">Tất cả Pages</div>
                    <div class="page-item-hint">${pages.length} pages</div>
                </div>
            </div>
        `;

        for (const page of pages) {
            const pageId = page.id;
            const pageName = page.name || 'Page';
            const isActive = this.selectedPageId === pageId;
            const initial = pageName.charAt(0).toUpperCase();
            const avatarHtml = page.avatar
                ? `<img src="${page.avatar}" class="page-item-avatar" alt="${this.escapeHtml(pageName)}" onerror="this.outerHTML='<div class=page-item-avatar-ph>${initial}</div>'">`
                : `<div class="page-item-avatar-ph">${initial}</div>`;

            html += `
                <div class="page-item ${isActive ? 'active' : ''}" data-page-id="${pageId}">
                    ${avatarHtml}
                    <div class="page-item-info">
                        <div class="page-item-name">${this.escapeHtml(pageName)}</div>
                    </div>
                </div>
            `;
        }

        dropdown.innerHTML = html;

        // Bind click events
        dropdown.querySelectorAll('.page-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectedPageId = item.dataset.pageId || null;
                const label = this.elements.pageSelectorLabel;
                if (this.selectedPageId) {
                    const page = pages.find(p => p.id === this.selectedPageId);
                    label.textContent = page?.name || 'Page';
                } else {
                    label.textContent = 'Tất cả Pages';
                }
                dropdown.style.display = 'none';
                this.renderPageSelector(); // Update active state
                this.renderConversationList();
            });
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Avatar Helper (from tpos-pancake) =====

    getAvatarHtml(conv, size = 'list') {
        const name = conv.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const colorIndex = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
        const gradient = AVATAR_GRADIENTS[colorIndex];

        // Try multiple avatar fields
        const avatarUrl = conv.avatar
            || conv._raw?.from?.picture?.data?.url
            || conv._raw?.from?.profile_pic
            || conv._raw?.customers?.[0]?.avatar
            || null;

        if (avatarUrl) {
            return `<img src="${avatarUrl}" alt="${this.escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                    <div class="conv-avatar-ph" style="display:none;background:${gradient};">${initial}</div>`;
        }
        return `<div class="conv-avatar-ph" style="background:${gradient};">${initial}</div>`;
    }

    // ===== Tags Helper =====

    getTagsHtml(conv) {
        const tags = conv._raw?.tags;
        if (!tags || tags.length === 0) return '';
        return tags.slice(0, 3).map(tag => {
            const color = tag.color || '#6b7280';
            return `<span class="conv-tag" style="background:${color}20;color:${color};">${this.escapeHtml(tag.name || '')}</span>`;
        }).join('');
    }

    // ===== Conversation List =====

    renderConversationList() {
        let conversations = this.data.getConversations({
            search: this.searchQuery,
            filter: this.currentFilter,
            groupFilter: this.currentGroupFilter,
        });

        // Apply page filter
        if (this.selectedPageId) {
            conversations = conversations.filter(c => c.pageId === this.selectedPageId);
        }

        if (conversations.length === 0) {
            this.elements.conversationList.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">
                    <p>Không có cuộc hội thoại nào</p>
                </div>
            `;
            return;
        }

        this.elements.conversationList.innerHTML = conversations.map(conv => {
            const labelClass = this.getLabelClass(conv.label);
            const labelText = this.getLabelText(conv.label);
            const isActive = conv.id === this.activeConversationId;
            const isUnread = conv.unread > 0;

            // Avatar with gradient fallback
            const avatarHtml = this.getAvatarHtml(conv);

            // Unread badge (9+ cap like tpos-pancake)
            const unreadBadge = isUnread
                ? `<span class="conv-unread-badge">${conv.unread > 9 ? '9+' : conv.unread}</span>`
                : '';

            // Livestream badge
            const livestreamBadge = conv.isLivestream
                ? '<span class="conv-livestream-badge">LIVE</span>'
                : '';

            // Page name
            const pageNameHtml = conv.pageName
                ? `<span class="conv-page-name">${this.escapeHtml(conv.pageName)}</span>`
                : '';

            // Type icon (like tpos-pancake: message-circle for inbox, message-square for comment)
            const typeIcon = conv.type === 'COMMENT' ? 'message-square' : 'message-circle';

            // Tags
            const tagsHtml = this.getTagsHtml(conv);

            return `
                <div class="conversation-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}"
                     data-id="${conv.id}" onclick="window.inboxChat.selectConversation('${conv.id}')">
                    <div class="conv-avatar-wrap">
                        ${avatarHtml}
                        ${unreadBadge}
                    </div>
                    <div class="conv-content">
                        <div class="conv-header">
                            <span class="conv-name">${this.escapeHtml(conv.name)}</span>
                            <span class="conv-time">${this.formatTime(conv.time)}</span>
                        </div>
                        ${pageNameHtml}
                        <div class="conv-preview ${isUnread ? 'unread' : ''}">${this.escapeHtml(conv.lastMessage)}</div>
                        <div class="conv-footer">
                            <div class="conv-footer-left">
                                <span class="conv-label ${labelClass}">${labelText}</span>
                                ${tagsHtml}
                                ${livestreamBadge}
                            </div>
                            <span class="conv-type-icon" title="${conv.type === 'COMMENT' ? 'Bình luận' : 'Tin nhắn'}">
                                <i data-lucide="${typeIcon}"></i>
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Select Conversation =====

    async selectConversation(convId) {
        this.activeConversationId = convId;
        const conv = this.data.getConversation(convId);
        if (!conv) return;

        this.data.markAsRead(convId);

        // Update header
        this.elements.chatUserName.textContent = conv.name;
        const statusParts = [];
        if (conv.pageName) statusParts.push(conv.pageName);
        if (conv.type === 'COMMENT') statusParts.push('Bình luận');
        if (conv.isLivestream) statusParts.push('Livestream');
        this.elements.chatUserStatus.textContent = statusParts.join(' · ') || 'Đang tải...';

        // Update chat avatar with gradient
        const chatAvatar = this.elements.chatHeader.querySelector('.chat-avatar');
        const name = conv.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const colorIndex = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
        const gradient = AVATAR_GRADIENTS[colorIndex];
        const avatarUrl = conv.avatar || conv._raw?.from?.picture?.data?.url || null;

        if (avatarUrl) {
            chatAvatar.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.outerHTML='<span>${initial}</span>'">`;
        } else {
            chatAvatar.innerHTML = `<span>${initial}</span>`;
        }
        chatAvatar.style.background = gradient;
        chatAvatar.style.color = 'white';
        chatAvatar.style.fontSize = '0.875rem';
        chatAvatar.style.fontWeight = '700';
        chatAvatar.className = 'chat-avatar';

        this.updateStarButton(conv.starred);
        this.renderChatLabelBar(conv);
        this.renderConversationList();
        this.renderGroupStats();

        // Reset stats bar and post info while loading
        const statsBar = document.getElementById('customerStatsBar');
        if (statsBar) statsBar.style.display = 'none';
        const postBanner = document.getElementById('postInfoBanner');
        if (postBanner) postBanner.style.display = 'none';

        // Show loading state
        this.elements.chatMessages.innerHTML = `
            <div class="chat-empty-state">
                <div class="loading-spinner"></div>
                <p>Đang tải tin nhắn...</p>
            </div>
        `;

        // Fetch real messages from Pancake API
        await this.loadMessages(conv);
    }

    /**
     * Load messages for a conversation from Pancake API
     */
    async loadMessages(conv) {
        if (this.isLoadingMessages) return;
        this.isLoadingMessages = true;

        try {
            const pdm = window.pancakeDataManager;
            if (!pdm) {
                console.warn('[InboxChat] pancakeDataManager not available');
                return;
            }

            const result = await pdm.fetchMessagesForConversation(
                conv.pageId,
                conv.conversationId,
                null,
                conv.customerId
            );

            // Check if user switched to a different conversation while loading
            if (this.activeConversationId !== conv.id) return;

            const messages = result.messages || [];

            // Store full response metadata for stats bar, post info, activities
            conv._messagesData = {
                post: result.post || result.conversation?.post || null,
                customers: result.customers || [],
                reports_by_phone: result.reports_by_phone || {},
                comment_count: result.comment_count || 0,
                recent_phone_numbers: result.recent_phone_numbers || result.conv_recent_phone_numbers || [],
                activities: result.activities || [],
                conv_phone_numbers: result.conv_phone_numbers || [],
            };

            // Detect livestream from post data
            const postType = conv._messagesData.post?.type;
            if (postType === 'livestream') {
                this.data.markAsLivestream(conv.id);
                conv.isLivestream = true;
            }

            // Update status line
            const statusParts = [];
            if (conv.pageName) statusParts.push(conv.pageName);
            if (conv.type === 'COMMENT') statusParts.push('Bình luận');
            if (conv.isLivestream) statusParts.push('Livestream');
            if (postType && postType !== 'livestream') statusParts.push(postType);
            this.elements.chatUserStatus.textContent = statusParts.join(' · ') || '';
            if (conv.isLivestream) this.renderConversationList();

            // Extract phone from response for order form
            // recent_phone_numbers can be string[] or {phone_number}[]
            const rpn = conv._messagesData.recent_phone_numbers?.[0];
            const rpnPhone = typeof rpn === 'string' ? rpn : rpn?.phone_number || '';
            const extractedPhone = conv._messagesData.conv_phone_numbers?.[0]
                || rpnPhone
                || conv._messagesData.customers?.[0]?.recent_phone_numbers?.[0]?.phone_number
                || '';
            if (extractedPhone) conv.phone = extractedPhone;

            // Map Pancake messages to inbox format
            conv.messages = messages.map(msg => {
                const isFromPage = msg.from?.id === conv.pageId;
                // Prefer original_message (clean text) over message (has HTML tags)
                const text = msg.original_message || this.stripHtml(msg.message || '');
                return {
                    id: msg.id,
                    text,
                    time: new Date(msg.inserted_at || msg.created_time || Date.now()),
                    sender: isFromPage ? 'shop' : 'customer',
                    attachments: msg.attachments || [],
                    senderName: msg.from?.name || '',
                    reactions: (msg.attachments || []).filter(a => a.type === 'reaction'),
                    phoneInfo: msg.phone_info || [],
                    isHidden: msg.is_hidden || false,
                    isRemoved: msg.is_removed || false,
                };
            });

            // Messages from API are newest-first, reverse for display
            conv.messages.reverse();

            this.renderMessages(conv);

            // Render customer stats bar and post info
            this.renderCustomerStatsBar(conv);
            this.renderPostInfo(conv);
            this.renderActivities(conv);

            // Auto-fill order form with extracted phone
            if (window.inboxOrders && conv.phone) {
                window.inboxOrders.fillCustomerInfo(conv);
            }

        } catch (error) {
            console.error('[InboxChat] Error loading messages:', error);
            if (this.activeConversationId === conv.id) {
                this.elements.chatMessages.innerHTML = `
                    <div class="chat-empty-state">
                        <p>Lỗi tải tin nhắn: ${this.escapeHtml(error.message)}</p>
                    </div>
                `;
            }
        } finally {
            this.isLoadingMessages = false;
        }
    }

    // ===== Chat Messages =====

    renderMessages(conv) {
        if (!conv.messages || conv.messages.length === 0) {
            this.elements.chatMessages.innerHTML = `
                <div class="chat-empty-state">
                    <i data-lucide="message-square"></i>
                    <p>Chưa có tin nhắn</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const name = conv.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const colorIndex = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
        const gradient = AVATAR_GRADIENTS[colorIndex];
        let lastDate = '';

        const html = conv.messages.map(msg => {
            const msgDate = this.formatDate(msg.time);
            let dateSeparator = '';
            if (msgDate !== lastDate) {
                lastDate = msgDate;
                dateSeparator = `
                    <div class="chat-date-separator">
                        <span>${msgDate}</span>
                    </div>
                `;
            }

            const isOutgoing = msg.sender === 'shop';
            const isHidden = msg.isHidden || false;
            const isRemoved = msg.isRemoved || false;

            // Build message content (text + attachments)
            let messageContent = '';

            // Render attachments first (above text, like tpos-pancake)
            const mediaAttachments = (msg.attachments || []).filter(a => a.type !== 'reaction');
            if (mediaAttachments.length > 0) {
                messageContent += this.renderAttachments(mediaAttachments);
            }

            if (msg.text) {
                messageContent += `<div class="message-text">${this.formatMessageText(msg.text)}</div>`;
            }

            // Phone tags from phone_info
            const phoneInfo = msg.phoneInfo || [];
            let phoneTagsHtml = '';
            if (phoneInfo.length > 0) {
                phoneTagsHtml = phoneInfo.map(pi =>
                    `<span class="msg-phone-tag" onclick="navigator.clipboard.writeText('${this.escapeHtml(pi.phone_number)}');showToast('Đã copy: ${this.escapeHtml(pi.phone_number)}','success')" title="Click để copy">
                        <i data-lucide="phone"></i> ${this.escapeHtml(pi.phone_number)}
                    </span>`
                ).join('');
            }

            // Reactions
            const reactions = msg.reactions || [];
            let reactionsHtml = '';
            if (reactions.length > 0) {
                const emojis = reactions.map(r => r.emoji || '❤️').join('');
                reactionsHtml = `<span class="message-reactions">${emojis}</span>`;
            }

            if (!messageContent && !reactionsHtml && !phoneTagsHtml) {
                messageContent = '<div class="message-text" style="opacity:0.5">[Tin nhắn trống]</div>';
            }

            // Hidden/removed indicator
            let statusIndicator = '';
            if (isRemoved) {
                statusIndicator = '<span class="msg-status-indicator removed" title="Đã xóa"><i data-lucide="trash-2"></i></span>';
            } else if (isHidden) {
                statusIndicator = '<span class="msg-status-indicator hidden-msg" title="Đã ẩn"><i data-lucide="eye-off"></i></span>';
            }

            // Sender name for outgoing messages (staff name)
            const senderHtml = isOutgoing && msg.senderName
                ? `<span class="message-sender">${this.escapeHtml(msg.senderName)}</span>`
                : '';

            return `
                ${dateSeparator}
                <div class="message-row ${isOutgoing ? 'outgoing' : 'incoming'} ${isRemoved ? 'removed' : ''} ${isHidden ? 'hidden-msg' : ''}">
                    ${!isOutgoing ? `<div class="message-avatar" style="background:${gradient};">${initial}</div>` : ''}
                    <div class="message-bubble">
                        ${messageContent}
                        ${phoneTagsHtml}
                        ${reactionsHtml}
                        <div class="message-meta">
                            ${statusIndicator}
                            ${senderHtml}
                            <span class="message-time">${this.formatMessageTime(msg.time)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.elements.chatMessages.innerHTML = html;
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    /**
     * Render attachments (reference: tpos-pancake renderMessage)
     */
    renderAttachments(attachments) {
        return attachments.map(att => {
            const url = att.url || att.file_url || att.preview_url || att.payload?.url || att.src || '';
            if (!url) return '';

            // Image
            if (att.type === 'image' || att.type === 'photo' || att.mime_type?.startsWith('image/')) {
                return `<div class="message-media"><img class="message-image" src="${url}" alt="Ảnh" onclick="window.open('${url}','_blank')" loading="lazy"></div>`;
            }
            // Sticker / GIF
            if (att.type === 'sticker' || att.sticker_id || att.type === 'animated_image_url') {
                return `<div class="message-media"><img class="message-sticker" src="${url}" alt="Sticker" loading="lazy"></div>`;
            }
            // Video
            if (att.type === 'video' || att.mime_type?.startsWith('video/')) {
                return `<div class="message-media"><video controls src="${url}" preload="metadata" style="max-width:240px;border-radius:8px;"></video></div>`;
            }
            // Audio
            if (att.type === 'audio' || att.mime_type?.startsWith('audio/')) {
                return `<div class="message-media"><audio controls src="${url}" preload="metadata"></audio></div>`;
            }
            // File
            if (att.type === 'file' || att.type === 'document') {
                const fileName = att.name || att.filename || 'Tệp đính kèm';
                return `<div class="message-file"><a href="${url}" target="_blank" rel="noopener"><i data-lucide="file-text"></i> ${this.escapeHtml(fileName)}</a></div>`;
            }
            // Like/thumbsup
            if (att.type === 'like' || att.type === 'thumbsup') {
                return `<div class="message-like">👍</div>`;
            }
            return '';
        }).join('');
    }

    /**
     * Send a real message via Pancake API
     */
    async sendMessage() {
        if (!this.activeConversationId || this.isSending) return;

        const text = this.elements.chatInput.value.trim();
        if (!text) return;

        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        this.isSending = true;
        this.elements.btnSend.disabled = true;

        // Optimistic UI update
        this.data.addMessage(this.activeConversationId, text, 'shop');
        this.elements.chatInput.value = '';
        this.elements.chatInput.style.height = 'auto';
        this.renderMessages(conv);
        this.renderConversationList();

        try {
            const pageAccessToken = await window.pancakeTokenManager.getOrGeneratePageAccessToken(conv.pageId);
            if (!pageAccessToken) {
                throw new Error('Không lấy được page access token');
            }

            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${conv.pageId}/conversations/${conv.conversationId}/messages`,
                pageAccessToken
            );

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: { text } })
            });

            if (!response.ok) {
                const errData = await response.text();
                throw new Error(`HTTP ${response.status}: ${errData}`);
            }

            console.log('[InboxChat] Message sent successfully');

            setTimeout(async () => {
                if (this.activeConversationId === conv.id) {
                    await this.loadMessages(conv);
                }
            }, 2000);

        } catch (error) {
            console.error('[InboxChat] Error sending message:', error);
            showToast('Lỗi gửi tin nhắn: ' + error.message, 'error');
        } finally {
            this.isSending = false;
            this.elements.btnSend.disabled = false;
        }
    }

    /**
     * Attach and send an image
     */
    async attachImage() {
        if (!this.activeConversationId) {
            showToast('Vui lòng chọn cuộc hội thoại trước', 'warning');
            return;
        }

        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                showToast('Đang tải ảnh lên...', 'info');
                const pdm = window.pancakeDataManager;
                if (!pdm) throw new Error('pancakeDataManager not available');

                const result = await pdm.uploadImage(conv.pageId, file);
                if (result && result.url) {
                    const pageAccessToken = await window.pancakeTokenManager.getOrGeneratePageAccessToken(conv.pageId);
                    const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                        `pages/${conv.pageId}/conversations/${conv.conversationId}/messages`,
                        pageAccessToken
                    );

                    await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: { attachment: { type: 'image', payload: { url: result.url } } }
                        })
                    });

                    showToast('Đã gửi ảnh', 'success');
                    setTimeout(() => this.loadMessages(conv), 2000);
                }
            } catch (err) {
                console.error('[InboxChat] Image upload error:', err);
                showToast('Lỗi tải ảnh: ' + err.message, 'error');
            }
        };
        input.click();
    }

    // ===== Chat Label Bar =====

    renderChatLabelBar(conv) {
        this.elements.chatLabelBar.style.display = 'block';
        this.elements.chatLabelBarList.innerHTML = this.data.groups.map(group => {
            const isActive = conv.label === group.id;
            const activeStyle = isActive ? `background: ${group.color}; border-color: ${group.color};` : '';
            return `
                <button class="chat-label-btn ${isActive ? 'active' : ''}"
                        style="${activeStyle}"
                        onclick="window.inboxChat.assignLabel('${conv.id}', '${group.id}')">
                    <span class="chat-label-dot" style="background: ${isActive ? 'rgba(255,255,255,0.7)' : group.color}"></span>
                    ${this.escapeHtml(group.name)}
                </button>
            `;
        }).join('');
    }

    assignLabel(convId, labelId) {
        this.data.setConversationLabel(convId, labelId);
        this.renderConversationList();
        this.renderGroupStats();
        const conv = this.data.getConversation(convId);
        if (conv) this.renderChatLabelBar(conv);
        showToast('Đã cập nhật nhãn', 'success');
    }

    // ===== Group Stats =====

    renderGroupStats() {
        this.data.recalculateGroupCounts();
        const iconMap = {
            'new': 'inbox', 'processing': 'loader', 'waiting': 'clock',
            'ordered': 'shopping-cart', 'urgent': 'alert-triangle', 'done': 'check-circle',
        };

        this.elements.groupStatsList.innerHTML = this.data.groups.map(group => {
            const icon = iconMap[group.id] || 'tag';
            const isActive = this.currentGroupFilter === group.id;
            const note = group.note || 'Chưa có mô tả cho nhóm này.';

            return `
                <div class="group-stats-card ${isActive ? 'active' : ''}"
                     onclick="window.inboxChat.filterByGroup('${group.id}')">
                    <div class="group-stats-card-color" style="background: ${group.color}">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div class="group-stats-card-body">
                        <div class="group-stats-card-name">${this.escapeHtml(group.name)}</div>
                        <div class="group-stats-card-count"><strong>${group.count}</strong> khách hàng</div>
                    </div>
                    <button class="group-stats-card-help" onclick="event.stopPropagation()" title="Thông tin">
                        ?
                        <div class="stats-tooltip">${this.escapeHtml(note)}</div>
                    </button>
                </div>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    filterByGroup(groupId) {
        this.currentGroupFilter = this.currentGroupFilter === groupId ? null : groupId;
        this.renderConversationList();
        this.renderGroupStats();
    }

    updateStarButton(starred) {
        const btn = this.elements.btnStarConversation;
        if (starred) { btn.style.color = '#f59e0b'; btn.title = 'Bỏ đánh dấu'; }
        else { btn.style.color = ''; btn.title = 'Đánh dấu'; }
    }

    // ===== Manage Groups Modal =====

    showManageGroupsModal() {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#6366f1', '#f97316', '#6b7280'];

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-title"><i data-lucide="settings"></i> Quản Lý Nhóm</div>
                <div class="modal-body">
                    <div class="modal-group-list" id="modalGroupList">
                        ${this.data.groups.map((group) => `
                            <div class="modal-group-item" data-group-id="${group.id}">
                                <div class="modal-group-color-pick" style="background: ${group.color}"
                                     onclick="window.inboxChat._toggleColorPicker(this, '${group.id}')"></div>
                                <div class="modal-group-fields">
                                    <input type="text" class="modal-group-name-input" value="${this.escapeHtml(group.name)}"
                                           placeholder="Tên nhóm" data-group-id="${group.id}" />
                                    <textarea class="modal-group-note-input" placeholder="Ghi chú"
                                              data-group-id="${group.id}" rows="2">${this.escapeHtml(group.note || '')}</textarea>
                                </div>
                                <button class="modal-group-delete" title="Xóa nhóm"
                                        onclick="window.inboxChat._deleteGroupInModal('${group.id}', this)">&times;</button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="modal-add-section">
                        <h4>Thêm Nhóm Mới</h4>
                        <div class="modal-add-row">
                            <div class="modal-add-fields">
                                <input type="text" id="modalNewGroupName" placeholder="Tên nhóm mới..." />
                                <textarea id="modalNewGroupNote" placeholder="Ghi chú cho nhóm..." rows="2"></textarea>
                                <div class="modal-color-picker">
                                    ${colors.map((c, i) => `
                                        <div class="color-option ${i === 0 ? 'selected' : ''}" style="background: ${c}" data-color="${c}"
                                             onclick="this.parentElement.querySelectorAll('.color-option').forEach(o=>o.classList.remove('selected'));this.classList.add('selected');"></div>
                                    `).join('')}
                                </div>
                            </div>
                            <button class="btn-modal-add" id="btnModalAddGroup">+ Thêm</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-modal-cancel" id="btnModalCancel">Đóng</button>
                    <button class="btn-modal-confirm" id="btnModalSave">Lưu Thay Đổi</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('btnModalCancel').addEventListener('click', () => overlay.remove());

        document.getElementById('btnModalAddGroup').addEventListener('click', () => {
            const name = document.getElementById('modalNewGroupName').value.trim();
            const note = document.getElementById('modalNewGroupNote').value.trim();
            const color = overlay.querySelector('.modal-add-section .color-option.selected')?.dataset.color || '#3b82f6';
            if (!name) { showToast('Vui lòng nhập tên nhóm', 'warning'); return; }
            this.data.addGroup(name, color, note);
            const newGroup = this.data.groups[this.data.groups.length - 1];
            const listEl = document.getElementById('modalGroupList');
            const newItem = document.createElement('div');
            newItem.className = 'modal-group-item';
            newItem.dataset.groupId = newGroup.id;
            newItem.innerHTML = `
                <div class="modal-group-color-pick" style="background: ${newGroup.color}"
                     onclick="window.inboxChat._toggleColorPicker(this, '${newGroup.id}')"></div>
                <div class="modal-group-fields">
                    <input type="text" class="modal-group-name-input" value="${this.escapeHtml(newGroup.name)}"
                           placeholder="Tên nhóm" data-group-id="${newGroup.id}" />
                    <textarea class="modal-group-note-input" placeholder="Ghi chú"
                              data-group-id="${newGroup.id}" rows="2">${this.escapeHtml(newGroup.note || '')}</textarea>
                </div>
                <button class="modal-group-delete" title="Xóa nhóm"
                        onclick="window.inboxChat._deleteGroupInModal('${newGroup.id}', this)">&times;</button>
            `;
            listEl.appendChild(newItem);
            document.getElementById('modalNewGroupName').value = '';
            document.getElementById('modalNewGroupNote').value = '';
            showToast('Đã thêm nhóm: ' + name, 'success');
        });

        document.getElementById('btnModalSave').addEventListener('click', () => {
            overlay.querySelectorAll('.modal-group-item').forEach(item => {
                const groupId = item.dataset.groupId;
                const nameInput = item.querySelector('.modal-group-name-input');
                const noteInput = item.querySelector('.modal-group-note-input');
                if (nameInput && noteInput) {
                    this.data.updateGroup(groupId, { name: nameInput.value.trim(), note: noteInput.value.trim() });
                }
            });
            this.renderGroupStats();
            this.renderConversationList();
            if (this.activeConversationId) {
                const conv = this.data.getConversation(this.activeConversationId);
                if (conv) this.renderChatLabelBar(conv);
            }
            overlay.remove();
            showToast('Đã lưu thay đổi nhóm', 'success');
        });
    }

    _deleteGroupInModal(groupId, btnEl) {
        if (!confirm('Xóa nhóm này? Các cuộc hội thoại sẽ chuyển về "Inbox Mới".')) return;
        this.data.deleteGroup(groupId);
        btnEl.closest('.modal-group-item')?.remove();
        showToast('Đã xóa nhóm', 'success');
    }

    _toggleColorPicker(el, groupId) {
        const existing = el.parentElement.querySelector('.color-popover');
        if (existing) { existing.remove(); return; }
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#6366f1', '#f97316', '#6b7280'];
        const popover = document.createElement('div');
        popover.className = 'color-popover';
        popover.innerHTML = colors.map(c => `<div class="color-option" style="background: ${c}" data-color="${c}"></div>`).join('');
        el.style.position = 'relative';
        el.appendChild(popover);
        popover.addEventListener('click', (e) => {
            const opt = e.target.closest('.color-option');
            if (!opt) return;
            el.style.background = opt.dataset.color;
            this.data.updateGroup(groupId, { color: opt.dataset.color });
            popover.remove();
            e.stopPropagation();
        });
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!popover.contains(e.target) && e.target !== el) { popover.remove(); document.removeEventListener('click', closeHandler); }
            };
            document.addEventListener('click', closeHandler);
        }, 0);
    }

    // ===== Customer Stats Bar (reference: tpos-pancake renderCustomerStatsBar) =====

    renderCustomerStatsBar(conv) {
        const bar = document.getElementById('customerStatsBar');
        if (!bar) return;

        const data = conv._messagesData;
        if (!data) { bar.style.display = 'none'; return; }

        // Phone number
        const phone = conv.phone || '';

        // Comment count
        const commentCount = data.comment_count || 0;

        // Order stats from reports_by_phone or customer data
        let successOrders = 0, failOrders = 0;
        const customer = data.customers?.[0];

        if (phone && data.reports_by_phone) {
            // Try both formats: "0944333435" and "+84944333435"
            const phoneKey = Object.keys(data.reports_by_phone).find(k =>
                k.includes(phone.replace(/^0/, '')) || k === phone
            );
            if (phoneKey) {
                const report = data.reports_by_phone[phoneKey];
                successOrders = report.order_success || 0;
                failOrders = report.order_fail || 0;
            }
        }
        if (!successOrders && customer) {
            successOrders = customer.succeed_order_count || customer.order_count || 0;
        }

        const totalOrders = successOrders + failOrders;
        const returnRate = totalOrders > 0 ? Math.round((failOrders / totalOrders) * 100) : 0;
        const isWarning = returnRate > 30;

        // Phone badge
        const phoneBadge = phone
            ? `<span class="phone-badge" onclick="navigator.clipboard.writeText('${this.escapeHtml(phone)}');showToast('Đã copy: ${this.escapeHtml(phone)}','success')" title="Click để copy">
                    <i data-lucide="phone"></i>
                    <span>${this.escapeHtml(phone)}</span>
               </span>`
            : '';

        bar.innerHTML = `
            <div class="stats-left">${phoneBadge}</div>
            <div class="stats-right">
                <span class="stat-badge comment" title="Đã bình luận ${commentCount} lần">
                    <i data-lucide="message-square"></i><span>${commentCount}</span>
                </span>
                <span class="stat-badge success" title="Đơn thành công: ${successOrders}">
                    <i data-lucide="check-circle"></i><span>${successOrders}</span>
                </span>
                <span class="stat-badge return" title="Đơn hoàn: ${failOrders}">
                    <i data-lucide="undo-2"></i><span>${failOrders}</span>
                </span>
                ${isWarning ? `
                    <span class="stat-badge warning" title="Tỉ lệ hoàn ${returnRate}%">
                        <i data-lucide="alert-triangle"></i>
                    </span>
                ` : ''}
            </div>
        `;
        bar.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Post Info Banner (livestream post thumbnail + title) =====

    renderPostInfo(conv) {
        const banner = document.getElementById('postInfoBanner');
        if (!banner) return;

        const post = conv._messagesData?.post;
        if (!post || !post.message) {
            banner.style.display = 'none';
            return;
        }

        const isLivestream = post.type === 'livestream';
        const thumbnail = post.attachments?.data?.[0]?.url || '';
        const postUrl = post.attachments?.target?.url || '';
        const title = post.message || '';
        const truncatedTitle = title.length > 100 ? title.substring(0, 100) + '...' : title;
        const liveStatus = post.live_video_status;
        const statusBadge = isLivestream
            ? `<span class="post-status-badge ${liveStatus === 'vod' ? 'vod' : 'live'}">${liveStatus === 'vod' ? 'VOD' : 'LIVE'}</span>`
            : `<span class="post-status-badge video">${post.type || 'POST'}</span>`;

        banner.innerHTML = `
            ${thumbnail ? `<img class="post-thumbnail" src="${thumbnail}" alt="Post" onclick="${postUrl ? `window.open('${postUrl}','_blank')` : ''}">` : ''}
            <div class="post-info-content">
                <div class="post-info-header">
                    ${statusBadge}
                    <span class="post-page-name">${this.escapeHtml(post.from?.name || conv.pageName || '')}</span>
                </div>
                <div class="post-info-title" title="${this.escapeHtml(title)}">${this.escapeHtml(truncatedTitle)}</div>
                ${postUrl ? `<a class="post-info-link" href="${postUrl}" target="_blank" rel="noopener"><i data-lucide="external-link"></i> Xem trên Facebook</a>` : ''}
            </div>
        `;
        banner.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Activities Panel (col3 tab) =====

    renderActivities(conv) {
        const container = document.getElementById('tabActivities');
        if (!container) return;

        const activities = conv._messagesData?.activities || [];

        if (activities.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;color:var(--text-tertiary);padding:2rem;">
                    <i data-lucide="activity" style="width:32px;height:32px;opacity:0.5;"></i>
                    <p style="margin-top:0.5rem;">Chưa có hoạt động</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        container.innerHTML = `
            <div class="activities-header">
                <h3>Hoạt động trên ${activities.length} bài viết</h3>
            </div>
            <div class="activities-list">
                ${activities.map(act => {
                    const thumb = act.attachments?.data?.[0]?.url || '';
                    const actUrl = act.attachments?.target?.url || '';
                    const actTitle = act.message || '';
                    const truncTitle = actTitle.length > 80 ? actTitle.substring(0, 80) + '...' : actTitle;
                    const actTime = act.inserted_at ? this.formatDate(new Date(act.inserted_at)) : '';
                    return `
                        <div class="activity-item" ${actUrl ? `onclick="window.open('${actUrl}','_blank')"` : ''}>
                            ${thumb ? `<img class="activity-thumb" src="${thumb}" alt="">` : '<div class="activity-thumb-ph"><i data-lucide="video"></i></div>'}
                            <div class="activity-content">
                                <div class="activity-title">${this.escapeHtml(truncTitle)}</div>
                                <div class="activity-time">${actTime}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Strip HTML helper =====

    stripHtml(html) {
        if (!html) return '';
        // Remove HTML tags, decode entities
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    // ===== Utility Methods =====

    getLabelClass(label) {
        return { 'new': 'label-new', 'processing': 'label-processing', 'waiting': 'label-waiting',
                 'ordered': 'label-done', 'urgent': 'label-urgent', 'done': 'label-done' }[label] || 'label-new';
    }

    getLabelText(label) {
        const group = this.data.groups.find(g => g.id === label);
        if (group) return group.name;
        return { 'new': 'Mới', 'processing': 'Đang XL', 'waiting': 'Chờ PH',
                 'ordered': 'Đã Đặt', 'urgent': 'Cần Gấp', 'done': 'Xong' }[label] || label;
    }

    /**
     * Format time for conversation list (reference: tpos-pancake formatTime)
     * Today: show HH:mm, within 7 days: show day of week, else: dd/mm
     */
    formatTime(date) {
        if (!(date instanceof Date)) date = new Date(date);
        if (isNaN(date.getTime())) return '';

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diffDays = Math.floor((today - msgDay) / 86400000);

        // Today: show time
        if (diffDays === 0) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        // Within 7 days: day of week
        if (diffDays > 0 && diffDays < 7) {
            const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
            return days[date.getDay()];
        }
        // Older: dd/mm
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }

    formatDate(date) {
        if (!(date instanceof Date)) date = new Date(date);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diff = today - msgDay;

        if (diff === 0) return 'Hôm nay';
        if (diff === 86400000) return 'Hôm qua';
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    formatMessageTime(date) {
        if (!(date instanceof Date)) date = new Date(date);
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    formatMessageText(text) {
        let safe = this.escapeHtml(text);
        safe = safe.replace(/(https?:\/\/[^\s<]+)/gi, '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">$1</a>');
        safe = safe.replace(/\n/g, '<br>');
        return safe;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export globally
window.InboxChatController = InboxChatController;
