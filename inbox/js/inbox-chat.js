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
        this.currentTypeFilter = 'all';
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
        document.querySelectorAll('.filter-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this._setActiveFilter(btn.dataset.filter);
                // Show/hide livestream post selector
                const lps = document.getElementById('livestreamPostSelector');
                if (lps) lps.style.display = btn.dataset.filter === 'livestream' ? 'flex' : 'none';
                this.renderConversationList();
            });
        });

        // Type filters
        document.querySelectorAll('.type-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.type-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTypeFilter = btn.dataset.type;
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

        // Chat messages scroll (load older + scroll-to-bottom button)
        const chatMsgs = document.getElementById('chatMessages');
        chatMsgs?.addEventListener('scroll', (e) => {
            if (e.target.scrollTop < 100 && this.activeConvId) {
                this.loadMoreMessages();
            }
            const btnScroll = document.getElementById('btnScrollBottom');
            if (btnScroll) {
                const atBottom = e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 100;
                btnScroll.style.display = atBottom ? 'none' : 'flex';
            }
        });
        document.getElementById('btnScrollBottom')?.addEventListener('click', () => {
            if (chatMsgs) chatMsgs.scrollTop = chatMsgs.scrollHeight;
        });

        // Send message
        document.getElementById('btnSend')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        document.getElementById('chatInput')?.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
        });

        // Image/File attach
        document.getElementById('btnAttachImage')?.addEventListener('click', () => document.getElementById('imageFileInput')?.click());
        document.getElementById('imageFileInput')?.addEventListener('change', (e) => this.attachImage(e));
        document.getElementById('btnAttachFile')?.addEventListener('click', () => document.getElementById('attachFileInput')?.click());
        document.getElementById('attachFileInput')?.addEventListener('change', (e) => this.attachFile(e));
        document.getElementById('chatImagePreviewClose')?.addEventListener('click', () => this._clearImagePreview());

        // Reply cancel
        document.getElementById('btnCancelReply')?.addEventListener('click', () => this.cancelReply());

        // Emoji picker
        document.getElementById('btnEmoji')?.addEventListener('click', () => {
            const picker = document.getElementById('emojiPicker');
            if (picker) {
                picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
                if (picker.style.display === 'flex') this.renderEmojiGrid('smileys');
            }
        });
        document.querySelectorAll('.emoji-cat').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.emoji-cat').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderEmojiGrid(btn.dataset.cat);
            });
        });

        // Paste image
        document.getElementById('chatInput')?.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    this.selectedImage = file;
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        document.getElementById('chatImagePreviewImg').src = re.target.result;
                        document.getElementById('chatImagePreview').style.display = 'flex';
                    };
                    reader.readAsDataURL(file);
                    break;
                }
            }
        });

        // Toggle read/unread
        document.getElementById('btnMarkUnread')?.addEventListener('click', () => {
            if (this.activeConvId) this.toggleReadUnread(this.activeConvId);
        });

        // Livestream toggle
        document.getElementById('btnToggleLivestream')?.addEventListener('click', () => this.toggleLivestreamStatus());

        // Manage groups
        document.getElementById('btnManageGroups')?.addEventListener('click', () => this.showManageGroupsModal());
        document.getElementById('btnCloseManageGroups')?.addEventListener('click', () => {
            document.getElementById('manageGroupsModal').style.display = 'none';
        });

        // Label bar resize
        this._initLabelBarResize();

        // Page selector
        document.getElementById('pageSelectorBtn')?.addEventListener('click', () => {
            const dd = document.getElementById('pageSelectorDropdown');
            if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
        });

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#pageSelector') && !e.target.closest('#pageSelectorBtn')) {
                const dd = document.getElementById('pageSelectorDropdown');
                if (dd) dd.style.display = 'none';
            }
            if (!e.target.closest('#emojiPicker') && !e.target.closest('#btnEmoji')) {
                const ep = document.getElementById('emojiPicker');
                if (ep) ep.style.display = 'none';
            }
            if (!e.target.closest('#reactionPicker') && !e.target.closest('.msg-action-btn[data-action="react"]')) {
                const rp = document.getElementById('reactionPicker');
                if (rp) rp.style.display = 'none';
            }
        });

        // Toggle right panel
        document.getElementById('btnToggleRightPanel')?.addEventListener('click', () => {
            const col3 = document.getElementById('col3');
            if (col3) {
                col3.classList.toggle('hidden');
            }
        });

        // Notes input
        document.getElementById('convNoteInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._addNote();
            }
        });
    }

    _setActiveFilter(filter) {
        this.currentFilter = filter;
        localStorage.setItem('inbox_current_filter', filter);
        document.querySelectorAll('.filter-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
    }

    _initLabelBarResize() {
        const handle = document.getElementById('chatLabelResize');
        const list = document.getElementById('chatLabelBarList');
        if (!handle || !list) return;

        handle.addEventListener('click', () => {
            list.classList.toggle('expanded');
        });
    }

    // =====================================================
    // RENDER CONVERSATION LIST
    // =====================================================

    renderConversationList() {
        const container = document.getElementById('conversationList');
        if (!container) return;

        const search = document.getElementById('searchConversation')?.value?.trim() || '';
        let convs = this.data.getConversations({
            search,
            filter: this.currentFilter,
            groupFilters: this.groupFilters,
            selectedPageIds: this.selectedPageIds.length > 0 ? this.selectedPageIds : null
        });

        // Apply type filter
        if (this.currentTypeFilter !== 'all') {
            convs = convs.filter(c => c.type === this.currentTypeFilter);
        }

        if (convs.length === 0) {
            container.innerHTML = `
                <div style="padding:2rem;text-align:center;color:var(--text-tertiary);">
                    <i data-lucide="inbox" style="width:48px;height:48px;opacity:0.3;"></i>
                    <p style="margin-top:0.5rem;">${search ? 'Khong tim thay ket qua' : 'Chua co du lieu'}</p>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
            return;
        }

        // Update type filter counts
        this._updateTypeFilterCounts();

        container.innerHTML = convs.map(c => this._buildConvItemHtml(c)).join('');

        // Bind click events
        container.querySelectorAll('.conversation-item').forEach(el => {
            el.addEventListener('click', () => this.selectConversation(el.dataset.id));
        });

        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
    }

    _updateTypeFilterCounts() {
        const allConvs = this.data.conversations;
        const inboxCount = allConvs.filter(c => c.type === 'INBOX' && c.unread > 0).length;
        const commentCount = allConvs.filter(c => c.type === 'COMMENT' && c.unread > 0).length;

        document.querySelectorAll('.type-filter-btn').forEach(btn => {
            const type = btn.dataset.type;
            let countEl = btn.querySelector('.type-count');
            if (type === 'INBOX' && inboxCount > 0) {
                if (!countEl) { countEl = document.createElement('span'); countEl.className = 'type-count'; btn.appendChild(countEl); }
                countEl.textContent = inboxCount;
            } else if (type === 'COMMENT' && commentCount > 0) {
                if (!countEl) { countEl = document.createElement('span'); countEl.className = 'type-count'; btn.appendChild(countEl); }
                countEl.textContent = commentCount;
            } else if (countEl) {
                countEl.remove();
            }
        });
    }

    _buildConvItemHtml(conv) {
        const isActive = conv.id === this.activeConvId;
        const labels = this.data.getLabelArray(conv.id);

        // Labels
        const labelHtml = labels.filter(l => l !== 'new').map(l => {
            const group = this.data.groups.find(g => g.id === l);
            if (!group) return '';
            return `<span class="conv-label label-${l}" style="background:${group.color}15;color:${group.color};">
                <span class="conv-label-dot" style="width:6px;height:6px;border-radius:50%;display:inline-block;flex-shrink:0;background:${group.color};"></span>${this.escapeHtml(group.name)}
            </span>`;
        }).join('');

        // Tags
        const tagsHtml = (conv.tags || []).slice(0, 2).map(t => {
            const colorMap = { red: 'tag-red', green: 'tag-green', blue: 'tag-blue', orange: 'tag-orange', purple: 'tag-purple', pink: 'tag-pink', teal: 'tag-teal' };
            const cls = colorMap[t.color] || '';
            return `<span class="conv-tag ${cls}">${this.escapeHtml(t.name || '')}</span>`;
        }).join('');

        // Badges
        const unreadBadge = conv.unread > 0 ? `<span class="conv-unread-badge">${conv.unread > 9 ? '9+' : conv.unread}</span>` : '';
        const livestreamBadge = conv.isLivestream ? '<span class="conv-livestream-badge">LIVE</span>' : '';
        const typeBadge = conv.type === 'COMMENT' ? '<span class="conv-type-badge comment">BL</span>' : '';

        const timeStr = this.formatTime(conv.time);
        const snippet = this.escapeHtml(conv.snippet || '').substring(0, 60);

        return `
            <div class="conversation-item ${isActive ? 'active' : ''} ${conv.unread > 0 ? 'unread' : ''}" data-id="${conv.id}">
                <div class="conv-avatar-wrap">${this.getAvatarHtml(conv, 44)}${unreadBadge}</div>
                <div class="conv-content">
                    <div class="conv-header">
                        <span class="conv-name">${this.escapeHtml(conv.name)}</span>
                        <span class="conv-time">${timeStr}</span>
                    </div>
                    <div class="conv-preview ${conv.unread > 0 ? '' : ''}">${snippet}</div>
                    <div class="conv-footer">
                        <div class="conv-footer-left">
                            ${labelHtml}${tagsHtml}${livestreamBadge}${typeBadge}
                        </div>
                        <span class="conv-type-icon">
                            ${conv.type === 'COMMENT' ? '<i data-lucide="message-square"></i>' : '<i data-lucide="message-circle"></i>'}
                        </span>
                    </div>
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
        document.getElementById('btnMarkUnread').style.display = '';
        document.getElementById('btnToggleLivestream').style.display = '';

        // Show send selectors
        document.getElementById('sendPageSelector').style.display = 'flex';
        this._populateSendPageSelector(conv);
        this._populateReplyTypeSelector(conv);

        // Update active state in list
        document.querySelectorAll('.conversation-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === convId);
        });

        // Mark as read
        this.data.markAsRead(convId);

        // Show loading
        document.getElementById('chatMessages').innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-tertiary);"><div class="loading-spinner"></div></div>';

        // Load messages
        await this.loadMessages(conv);

        // Render label bar
        this.renderChatLabelBar(conv);

        // Show notes section
        this._showNotesSection(conv);

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
            document.getElementById('chatMessages').innerHTML = `<div class="chat-empty-state"><p>Loi tai tin nhan: ${e.message}</p></div>`;
        }
    }

    _mapMessage(m, conv) {
        const fromId = m.from?.id || m.from_id || '';
        const isShop = (m.from?.is_page === true) || (String(fromId) === String(conv.pageId));
        const msgType = m.type || (conv.type === 'COMMENT' ? 'comment' : 'inbox');
        const isPrivateReply = m.is_private_reply || m.action === 'private_replies';

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
            msgType,
            isPrivateReply,
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
                html += `<div class="chat-date-separator"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
            }

            const isOutgoing = msg.sender === 'shop';
            const direction = isOutgoing ? 'outgoing' : 'incoming';

            // Extra classes
            let extraClasses = '';
            if (msg.msgType === 'comment' || conv.type === 'COMMENT') extraClasses += ' is-comment';
            if (msg.isPrivateReply) extraClasses += ' is-private-reply';
            if (msg.isHidden) extraClasses += ' hidden-msg';
            if (msg.isRemoved) extraClasses += ' removed';

            const text = msg.text ? this.formatMessageText(msg.text) : '';
            const attachHtml = msg.attachments?.length ? this.renderAttachments(msg.attachments) : '';
            const timeStr = this.formatMessageTime(msg.time);

            // Message type icon
            let typeIconHtml = '';
            if (conv.type === 'COMMENT') {
                if (msg.isPrivateReply) {
                    typeIconHtml = '<span class="msg-type-icon type-inbox"><i data-lucide="lock"></i> Rieng</span>';
                } else {
                    typeIconHtml = '<span class="msg-type-icon type-comment"><i data-lucide="message-square"></i> BL</span>';
                }
            }

            // Reactions
            let reactionsHtml = '';
            if (msg.reactions?.length > 0) {
                const badges = {};
                msg.reactions.forEach(r => {
                    const t = r.type || r;
                    badges[t] = (badges[t] || 0) + 1;
                });
                reactionsHtml = '<div class="message-reaction-summary">' +
                    Object.entries(badges).map(([t, c]) =>
                        `<span class="reaction-badge">${this._reactionEmoji(t)}${c > 1 ? ' ' + c : ''}</span>`
                    ).join('') + '</div>';
            }

            // Phone info tag
            let phoneHtml = '';
            if (msg.phoneInfo) {
                phoneHtml = `<div class="msg-phone-tag"><i data-lucide="phone"></i> ${this.escapeHtml(msg.phoneInfo)}</div>`;
            }

            // Status indicators
            let statusHtml = '';
            if (msg.isHidden) statusHtml = '<span class="msg-status-indicator hidden-msg"><i data-lucide="eye-off"></i></span>';
            if (msg.isRemoved) statusHtml = '<span class="msg-status-indicator removed"><i data-lucide="trash-2"></i></span>';

            // Hover actions
            let actionsHtml = '';
            if (!msg.isOptimistic) {
                let actionBtns = '';
                if (msg.canLike) actionBtns += `<button class="msg-action-btn ${msg.userLikes ? 'liked' : ''}" data-action="${msg.userLikes ? 'unlike' : 'like'}" data-msg="${msg.id}" title="${msg.userLikes ? 'Bo thich' : 'Thich'}"><i data-lucide="thumbs-up"></i></button>`;
                if (msg.canHide) actionBtns += `<button class="msg-action-btn ${msg.isHidden ? 'active' : ''}" data-action="${msg.isHidden ? 'unhide' : 'hide'}" data-msg="${msg.id}" title="${msg.isHidden ? 'Hien' : 'An'}"><i data-lucide="${msg.isHidden ? 'eye' : 'eye-off'}"></i></button>`;
                actionBtns += `<button class="msg-action-btn" data-action="reply" data-msg="${msg.id}" title="Tra loi"><i data-lucide="corner-up-left"></i></button>`;
                actionBtns += `<button class="msg-action-btn" data-action="react" data-msg="${msg.id}" title="React"><i data-lucide="smile"></i></button>`;
                actionBtns += `<button class="msg-action-btn" data-action="copy" data-msg="${msg.id}" title="Sao chep"><i data-lucide="copy"></i></button>`;
                if (msg.canRemove && isOutgoing) actionBtns += `<button class="msg-action-btn danger" data-action="delete" data-msg="${msg.id}" title="Xoa"><i data-lucide="trash-2"></i></button>`;
                actionsHtml = `<div class="msg-hover-actions">${actionBtns}</div>`;
            }

            html += `
                <div class="message-row ${direction}${extraClasses}" data-msg-id="${msg.id}">
                    ${!isOutgoing ? `<div class="message-avatar" style="background:${AVATAR_GRADIENTS[Math.abs(this._hashCode(msg.senderName || '')) % AVATAR_GRADIENTS.length]};">${(msg.senderName || '?')[0].toUpperCase()}</div>` : ''}
                    <div class="message-bubble">
                        ${!isOutgoing && msg.senderName ? `<div class="message-sender">${this.escapeHtml(msg.senderName)}</div>` : ''}
                        ${statusHtml}
                        ${text ? `<div class="message-text">${text}</div>` : ''}
                        ${attachHtml}
                        ${phoneHtml}
                        <div class="message-meta">
                            <span class="message-time">${timeStr}</span>
                            ${typeIconHtml}
                        </div>
                        ${reactionsHtml}
                    </div>
                    ${actionsHtml}
                </div>`;
        }

        if (!this.hasMoreMessages) {
            html = '<div class="load-more-indicator">Dau cuoc hoi thoai</div>' + html;
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

            if (type.includes('image') || type === 'photo') {
                return `<div class="message-media"><img src="${this.escapeHtml(url)}" alt="Image" loading="lazy" onclick="window.open('${this.escapeHtml(url)}','_blank')" /></div>`;
            }
            if (type === 'sticker') {
                return `<img src="${this.escapeHtml(url)}" class="message-sticker" alt="Sticker" loading="lazy" />`;
            }
            if (type.includes('video') || type === 'video') {
                return `<div class="message-media"><video src="${this.escapeHtml(url)}" controls preload="metadata"></video></div>`;
            }
            if (type.includes('audio') || type === 'audio') {
                return `<div class="message-media"><audio src="${this.escapeHtml(url)}" controls></audio></div>`;
            }
            const name = att.name || att.filename || 'File';
            return `<div class="message-file"><a href="${this.escapeHtml(url)}" target="_blank"><i data-lucide="file"></i> ${this.escapeHtml(name)}</a></div>`;
        }).join('');
    }

    _reactionEmoji(type) {
        const map = { LIKE: '👍', LOVE: '❤️', HAHA: '😆', WOW: '😮', SAD: '😢', ANGRY: '😠' };
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
        if (input) { input.value = ''; input.style.height = 'auto'; }

        // Get send page
        const sendPageId = document.getElementById('sendPageSelect')?.value || conv.pageId;

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
                    const replyType = document.getElementById('replyTypeSelect')?.value || 'reply_comment';
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
                const fallback = { action: 'reply_inbox', message: text };
                await this.api.sendMessage(pageId, convId, fallback, pageAccessToken);
            }
        }
    }

    async _getPageAccessTokenWithFallback(pageId) {
        let token = this.tm.getPageAccessToken(pageId);
        if (token) return token;

        const jwt = await this.tm.getToken();
        if (jwt) {
            token = await this.tm.generatePageAccessToken(pageId, jwt);
            if (token) return token;
        }

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

        if (['like', 'unlike', 'hide', 'unhide', 'delete'].includes(action)) {
            setTimeout(() => {
                this.api.clearMessagesCache(conv.pageId, conv.id);
                this.loadMessages(conv);
            }, 1000);
        }
    }

    setReplyingTo(msg) {
        this.replyingTo = { id: msg.id, text: msg.text, senderName: msg.senderName };
        document.getElementById('replyPreviewSender').textContent = msg.senderName || '';
        document.getElementById('replyPreviewMsg').textContent = (msg.text || '').substring(0, 80);
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

        picker.querySelectorAll('.reaction-emoji').forEach(rb => {
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
            document.getElementById('chatImagePreviewImg').src = re.target.result;
            document.getElementById('chatImagePreview').style.display = 'flex';
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
        document.getElementById('chatImagePreview').style.display = 'none';
        document.getElementById('chatImagePreviewImg').src = '';
        document.getElementById('imageFileInput').value = '';
    }

    // =====================================================
    // LOAD MORE CONVERSATIONS
    // =====================================================

    async loadMoreConversations() {
        if (this.data.isLoading || !this.data.hasMore || this.isSearching) return;
        const more = await this.data.loadMoreConversations();
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
        this.startAutoRefresh();

        if (this.socketReconnectAttempts < this.socketMaxReconnectAttempts) {
            this.socketReconnectAttempts++;
            const delay = Math.min(this.socketReconnectDelay * Math.pow(1.5, this.socketReconnectAttempts - 1), 15000);
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

        if (this.data.pageIds.length > 0 && !this.data.pageIds.some(id => String(id) === pageId)) {
            return;
        }

        if (type && type !== 'INBOX' && type !== 'COMMENT') return;

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
        }
    }

    closeWebSocket() {
        if (this.socket) { this.socket.close(); this.socket = null; }
        this.stopAutoRefresh();
    }

    updateSocketStatusUI(connected) {
        const el = document.getElementById('wsStatus');
        if (!el) return;
        el.className = connected ? 'ws-status connected' : 'ws-status disconnected';
        el.innerHTML = connected
            ? '<i data-lucide="wifi"></i>'
            : '<i data-lucide="wifi-off"></i>';
        el.title = connected ? 'Realtime: Da ket noi' : 'Realtime: Mat ket noi';
        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
    }

    // =====================================================
    // PAGE SELECTOR
    // =====================================================

    renderPageSelector() {
        const dropdown = document.getElementById('pageSelectorDropdown');
        if (!dropdown) return;

        let html = `
            <div class="page-item active" data-page="all">
                <div class="page-item-icon"><i data-lucide="layout-grid"></i></div>
                <div class="page-item-info">
                    <div class="page-item-name">Tat ca Pages</div>
                </div>
            </div>`;
        for (const page of this.data.pages) {
            const avatar = page.avatar
                ? `<img class="page-item-avatar" src="${this.escapeHtml(page.avatar)}" onerror="this.style.display='none'" />`
                : `<div class="page-item-avatar-ph">${(page.name || '?')[0].toUpperCase()}</div>`;
            html += `
                <div class="page-item" data-page="${page.id}">
                    ${avatar}
                    <div class="page-item-info">
                        <div class="page-item-name">${this.escapeHtml(page.name || page.id)}</div>
                    </div>
                    <span class="page-unread-badge" id="pageUnread_${page.id}" style="display:none;"></span>
                </div>`;
        }
        dropdown.innerHTML = html;

        dropdown.querySelectorAll('.page-item').forEach(item => {
            item.addEventListener('click', () => {
                const pageId = item.dataset.page;
                if (pageId === 'all') {
                    this.selectedPageIds = [];
                    dropdown.querySelectorAll('.page-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                } else {
                    dropdown.querySelector('.page-item[data-page="all"]')?.classList.remove('active');
                    item.classList.toggle('active');
                    this.selectedPageIds = [...dropdown.querySelectorAll('.page-item.active')]
                        .filter(i => i.dataset.page !== 'all').map(i => i.dataset.page);
                    if (this.selectedPageIds.length === 0) {
                        dropdown.querySelector('.page-item[data-page="all"]')?.classList.add('active');
                    }
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
        const sel = document.getElementById('sendPageSelect');
        if (!sel) return;
        sel.innerHTML = this.data.pages.map(p =>
            `<option value="${p.id}" ${p.id === conv.pageId ? 'selected' : ''}>${this.escapeHtml(p.name || p.id)}</option>`
        ).join('');
    }

    _populateReplyTypeSelector(conv) {
        const sel = document.getElementById('replyTypeSelector');
        if (!sel) return;
        sel.style.display = conv.type === 'COMMENT' ? 'flex' : 'none';
    }

    onSendPageChanged(pageId) {
        // Could pre-validate page access token
    }

    onReplyTypeChanged(type) {
        // Store for use in sendMessage
    }

    async updatePageUnreadCounts() {
        const result = await this.api.fetchPagesUnreadCount();
        if (Array.isArray(result)) {
            for (const item of result) {
                const badge = document.getElementById(`pageUnread_${item.page_id}`);
                if (badge) {
                    if (item.unread_conv_count > 0) {
                        badge.textContent = item.unread_conv_count > 99 ? '99+' : item.unread_conv_count;
                        badge.style.display = '';
                    } else {
                        badge.style.display = 'none';
                    }
                }
            }
        }
        return result;
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

        const groupIcons = {
            new: 'inbox', processing: 'loader', waiting: 'clock',
            ordered: 'check-circle', urgent: 'alert-triangle', done: 'check-check'
        };

        container.innerHTML = this.data.groups.map(g => {
            const isActive = this.groupFilters.includes(g.id);
            const icon = groupIcons[g.id] || 'tag';
            return `
                <div class="group-stats-card ${isActive ? 'active' : ''}" data-group-id="${g.id}">
                    <div class="group-stats-card-color" style="background:${g.color};">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div class="group-stats-card-body">
                        <div class="group-stats-card-name">${this.escapeHtml(g.name)}</div>
                        <div class="group-stats-card-count"><strong>${g.count}</strong> khach hang</div>
                    </div>
                    <button class="group-stats-card-help" title="${this.escapeHtml(g.note || '')}">
                        ?
                        <div class="stats-tooltip">${this.escapeHtml(g.note || g.name)}</div>
                    </button>
                </div>`;
        }).join('');

        container.querySelectorAll('.group-stats-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.group-stats-card-help')) return;
                const gid = card.dataset.groupId;
                if (this.groupFilters.includes(gid)) {
                    this.groupFilters = this.groupFilters.filter(g => g !== gid);
                } else {
                    this.groupFilters.push(gid);
                }
                this.renderGroupStats();
                this.renderConversationList();
            });
        });

        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
    }

    // =====================================================
    // LABEL BAR
    // =====================================================

    renderChatLabelBar(conv) {
        const bar = document.getElementById('chatLabelBar');
        const list = document.getElementById('chatLabelBarList');
        if (!bar || !list) return;
        if (!conv) { bar.style.display = 'none'; return; }

        bar.style.display = '';
        const labels = this.data.getLabelArray(conv.id);

        list.innerHTML = this.data.groups.map(g => {
            const isActive = labels.includes(g.id);
            return `<button class="chat-label-btn ${isActive ? 'active' : ''}" data-label="${g.id}" style="${isActive ? 'background:' + g.color + ';border-color:' + g.color + ';' : ''}">
                <span class="chat-label-dot" style="background:${g.color};"></span>
                ${this.escapeHtml(g.name)}
            </button>`;
        }).join('');

        list.querySelectorAll('.chat-label-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.data.toggleConversationLabel(conv.id, btn.dataset.label);
                this.renderChatLabelBar(conv);
                this.renderGroupStats();
                this.renderConversationList();
            });
        });
    }

    // =====================================================
    // NOTES
    // =====================================================

    _showNotesSection(conv) {
        const section = document.getElementById('convNotesSection');
        if (!section) return;
        section.style.display = conv ? '' : 'none';
    }

    _addNote() {
        const input = document.getElementById('convNoteInput');
        const text = input?.value?.trim();
        if (!text || !this.activeConvId) return;
        // TODO: Save note to server
        input.value = '';
        showToast('Da them ghi chu', 'success');
    }

    renderNotes(conv) {
        const section = document.getElementById('convNotesSection');
        const list = document.getElementById('convNotesList');
        if (!section || !list) return;

        const notes = conv?._notes || [];
        if (notes.length === 0) {
            list.innerHTML = '';
            return;
        }

        list.innerHTML = notes.map(n => `
            <div class="conv-note-item">
                <div class="conv-note-meta">
                    <span class="conv-note-author">${this.escapeHtml(n.user_name || '')}</span>
                    <span>${n.created_at ? this.formatTime(this.data.parseTimestamp(n.created_at)) : ''}</span>
                </div>
                <div class="conv-note-text">${this.escapeHtml(n.message || n.content || '')}</div>
            </div>
        `).join('');
    }

    // =====================================================
    // MANAGE GROUPS MODAL
    // =====================================================

    showManageGroupsModal() {
        const modal = document.getElementById('manageGroupsModal');
        const body = document.getElementById('manageGroupsBody');
        if (!modal || !body) return;

        const colors = ['#3b82f6', '#f59e0b', '#f97316', '#10b981', '#ef4444', '#6b7280', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];
        const defaultIds = ['new', 'processing', 'waiting', 'ordered', 'urgent', 'done'];

        let html = '<div class="modal-group-list">';
        html += this.data.groups.map(g => `
            <div class="modal-group-item" data-id="${g.id}">
                <div class="modal-group-color-pick" style="background:${g.color};position:relative;" onclick="this.querySelector('.color-popover').style.display=this.querySelector('.color-popover').style.display==='none'?'flex':'none'">
                    <div class="color-popover" style="display:none;">
                        ${colors.map(c => `<span class="color-option ${c === g.color ? 'selected' : ''}" data-color="${c}" style="background:${c};" onclick="event.stopPropagation()"></span>`).join('')}
                    </div>
                </div>
                <div class="modal-group-fields">
                    <input type="text" class="group-name-input" value="${this.escapeHtml(g.name)}" placeholder="Ten nhom" />
                    <textarea class="group-note-input" placeholder="Mo ta...">${this.escapeHtml(g.note || '')}</textarea>
                </div>
                ${defaultIds.includes(g.id) ? '' : `<button class="modal-group-delete" data-id="${g.id}" title="Xoa"><i data-lucide="trash-2"></i></button>`}
            </div>
        `).join('');
        html += '</div>';

        // Add new group section
        html += `
            <div class="modal-add-section">
                <h4>Them nhom moi</h4>
                <div class="modal-add-row">
                    <div class="modal-group-color-pick" id="newGroupColor" style="background:#8b5cf6;cursor:pointer;"></div>
                    <div class="modal-add-fields">
                        <input type="text" id="newGroupName" placeholder="Ten nhom moi" />
                        <textarea id="newGroupNote" placeholder="Mo ta (tuy chon)"></textarea>
                    </div>
                    <button class="btn-modal-add" id="btnAddGroupConfirm">Them</button>
                </div>
                <div class="modal-color-picker" id="newGroupColorPicker">
                    ${colors.map(c => `<span class="color-option" data-color="${c}" style="background:${c};"></span>`).join('')}
                </div>
            </div>`;

        body.innerHTML = html;

        // Bind color popovers
        body.querySelectorAll('.modal-group-item .color-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = opt.closest('.modal-group-item');
                const gid = item.dataset.id;
                const colorPick = item.querySelector('.modal-group-color-pick');
                colorPick.style.background = opt.dataset.color;
                colorPick.querySelector('.color-popover').style.display = 'none';
                item.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                this.data.updateGroup(gid, { color: opt.dataset.color });
                this.renderGroupStats();
            });
        });

        // Bind name/note changes
        body.querySelectorAll('.group-name-input').forEach(input => {
            input.addEventListener('change', () => {
                const gid = input.closest('.modal-group-item').dataset.id;
                this.data.updateGroup(gid, { name: input.value });
                this.renderGroupStats();
            });
        });
        body.querySelectorAll('.group-note-input').forEach(input => {
            input.addEventListener('change', () => {
                const gid = input.closest('.modal-group-item').dataset.id;
                this.data.updateGroup(gid, { note: input.value });
            });
        });

        // Bind delete
        body.querySelectorAll('.modal-group-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Xoa nhom nay?')) {
                    this.data.deleteGroup(btn.dataset.id);
                    this.showManageGroupsModal();
                    this.renderGroupStats();
                }
            });
        });

        // New group color picker
        document.getElementById('newGroupColorPicker')?.querySelectorAll('.color-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.getElementById('newGroupColor').style.background = opt.dataset.color;
                document.getElementById('newGroupColorPicker').querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            });
        });

        // Add new group
        document.getElementById('btnAddGroupConfirm').onclick = () => {
            const name = document.getElementById('newGroupName')?.value?.trim();
            if (!name) { showToast('Nhap ten nhom', 'warning'); return; }
            const color = document.getElementById('newGroupColor')?.style.background || '#8b5cf6';
            const note = document.getElementById('newGroupNote')?.value?.trim() || '';
            this.data.addGroup(name, color, note);
            this.showManageGroupsModal();
            this.renderGroupStats();
        };

        // Save button
        document.getElementById('btnSaveGroups').onclick = () => {
            modal.style.display = 'none';
            showToast('Da luu nhom', 'success');
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

        let leftHtml = '';
        let rightHtml = '';

        if (phones.length > 0) {
            leftHtml += `<span class="phone-badge"><i data-lucide="phone"></i> ${phones.join(', ')}</span>`;
        }
        if (commentCount > 0) {
            rightHtml += `<span class="stat-badge comment"><i data-lucide="message-circle"></i> ${commentCount}</span>`;
        }
        for (const [phone, report] of Object.entries(reports)) {
            if (report.success_orders > 0) rightHtml += `<span class="stat-badge success"><i data-lucide="check"></i> ${report.success_orders} TC</span>`;
            if (report.return_orders > 0) rightHtml += `<span class="stat-badge return"><i data-lucide="undo-2"></i> ${report.return_orders} hoan</span>`;
        }

        bar.innerHTML = `<div class="stats-left">${leftHtml}</div><div class="stats-right">${rightHtml}</div>`;
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
        const liveStatus = post.live_video_status;
        let statusBadge = '';
        if (liveStatus === 'live') statusBadge = '<span class="post-status-badge live">LIVE</span>';
        else if (liveStatus === 'vod') statusBadge = '<span class="post-status-badge vod">VOD</span>';
        else if (post.type === 'video') statusBadge = '<span class="post-status-badge video">VIDEO</span>';

        const pageName = this.data.getPageName(conv.pageId);

        banner.innerHTML = `
            ${thumb ? `<img src="${this.escapeHtml(thumb)}" class="post-thumbnail" alt="" onclick="window.open('${this.escapeHtml(thumb)}','_blank')" />` : ''}
            <div class="post-info-content">
                <div class="post-info-header">
                    ${statusBadge}
                    <span class="post-page-name">${this.escapeHtml(pageName)}</span>
                </div>
                <div class="post-info-title">${this.escapeHtml(title.substring(0, 100))}</div>
            </div>`;
        banner.style.display = 'flex';
    }

    // =====================================================
    // ACTIVITIES PANEL
    // =====================================================

    renderActivities(conv) {
        const container = document.getElementById('tabActivities');
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

        container.innerHTML = `<div class="activities-header"><h3>Hoat dong</h3></div>
            <div class="activities-list">${activities.map(a => `
                <div class="activity-item">
                    ${a.thumbnail_url ? `<img class="activity-thumb" src="${this.escapeHtml(a.thumbnail_url)}" alt="" />` : '<div class="activity-thumb-ph"><i data-lucide="file-text"></i></div>'}
                    <div class="activity-content">
                        <div class="activity-title">${this.escapeHtml(a.title || a.message || '')}</div>
                        <div class="activity-time">${a.created_at ? this.formatTime(this.data.parseTimestamp(a.created_at)) : ''}</div>
                    </div>
                </div>`).join('')}
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
    }

    // =====================================================
    // PANCAKE SETTINGS MODAL
    // =====================================================

    showPancakeSettingsModal() {
        const modal = document.getElementById('pancakeSettingsModal');
        if (modal) {
            modal.style.display = 'flex';
            this._renderAccountsList();
        }
    }

    closePancakeSettingsModal() {
        const modal = document.getElementById('pancakeSettingsModal');
        if (modal) modal.style.display = 'none';
    }

    showAddAccountForm() {
        document.getElementById('addAccountForm').style.display = 'block';
    }

    async addAccountManual() {
        const input = document.getElementById('newAccountTokenInput');
        let token = input?.value?.trim();
        if (!token) { showToast('Nhap JWT token', 'warning'); return; }

        // Clean token
        token = token.replace(/^jwt=/, '').replace(/;.*$/, '').trim();

        try {
            await this.tm.saveTokenToFirestore(token);
            showToast('Da them tai khoan', 'success');
            input.value = '';
            document.getElementById('addAccountForm').style.display = 'none';
            this._renderAccountsList();
        } catch (e) {
            showToast('Loi: ' + e.message, 'error');
        }
    }

    showAddPageTokenForm() {
        const section = document.getElementById('addPageTokenForm');
        if (section) section.style.display = section.style.display === 'none' ? 'block' : 'none';
    }

    _renderAccountsList() {
        const container = document.getElementById('pancakeAccountsList');
        if (!container) return;

        const accounts = this.tm.getAllAccounts();
        if (accounts.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">Chua co tai khoan nao</div>';
            return;
        }

        container.innerHTML = accounts.map(acc => {
            const decoded = this.tm.decodeToken(acc.token);
            const isExpired = decoded?.exp ? this.tm.isTokenExpired(decoded.exp) : false;
            return `
                <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid #e5e7eb;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:13px;color:#374151;">${this.escapeHtml(decoded?.name || acc.accountId || 'Unknown')}</div>
                        <div style="font-size:11px;color:#6b7280;">UID: ${decoded?.uid || '?'} ${isExpired ? '<span style="color:#ef4444;font-weight:600;">Het han</span>' : '<span style="color:#10b981;">Con hieu luc</span>'}</div>
                    </div>
                    ${acc.isActive ? '<span style="font-size:11px;background:#10b981;color:white;padding:2px 8px;border-radius:10px;">Active</span>' : `<button onclick="window.inboxChat?.tm?.setActiveAccount?.('${acc.accountId}');window.inboxChat?._renderAccountsList?.()" style="font-size:11px;padding:2px 8px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;">Chon</button>`}
                    <button onclick="window.inboxChat?.tm?.deleteAccount?.('${acc.accountId}');window.inboxChat?._renderAccountsList?.()" style="padding:4px;border:none;background:transparent;cursor:pointer;color:#ef4444;"><i class="fas fa-trash"></i></button>
                </div>`;
        }).join('');
    }

    // =====================================================
    // EMOJI PICKER
    // =====================================================

    renderEmojiGrid(category) {
        const grid = document.getElementById('emojiGrid');
        if (!grid) return;

        const emojis = {
            recent: ['😀','😂','❤️','👍','😊','🥰','😍','🤩','😘','😎','🥳','🤗','😇','🤣','😅','😆'],
            smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👺','👻','👽','👾','🤖'],
            gestures: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶'],
            hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💌','💋','😘','😍','🥰','😻','💏','💑'],
            animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🕷️','🐢','🐍','🦎','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊'],
            food: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥒','🌶️','🌽','🥕','🍠','🥐','🍞','🧀','🥚','🍳','🥞','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮','🌯','🥗','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥠','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','☕','🍵','🥤','🍺','🍻','🥂','🍷','🍸','🍹','🍾'],
            objects: ['💡','🔦','💰','💵','💳','💎','🔧','🔨','🛠️','🔩','⚙️','🔫','💣','🔪','🔮','💊','💉','🧬','🔬','🔭','📱','💻','⌨️','🖥️','🖨️','🖱️','💾','💿','📷','📹','📺','📻','🎵','🎶','🎤','🎧','🎷','🎸','🎹','🎺','🎻','🥁','📞','📧','📦','🏷️','📌','📍','✂️','📝','✏️','🔍','🔎','🔒','🔓','🔑','🗝️']
        };

        const list = emojis[category] || emojis.smileys;
        grid.innerHTML = list.map(e => `<button class="emoji-item">${e}</button>`).join('');

        grid.querySelectorAll('.emoji-item').forEach(el => {
            el.addEventListener('click', () => {
                const input = document.getElementById('chatInput');
                if (input) {
                    input.value += el.textContent;
                    input.focus();
                }
                // Save to recent
                const recent = JSON.parse(localStorage.getItem('inbox_recent_emojis') || '[]');
                const emoji = el.textContent;
                const idx = recent.indexOf(emoji);
                if (idx > -1) recent.splice(idx, 1);
                recent.unshift(emoji);
                localStorage.setItem('inbox_recent_emojis', JSON.stringify(recent.slice(0, 16)));
            });
        });
    }

    // =====================================================
    // AVATAR
    // =====================================================

    getAvatarHtml(conv, size = 40) {
        if (!conv) return `<div class="conv-avatar-ph" style="width:${size}px;height:${size}px;"><i data-lucide="user"></i></div>`;

        const avatarUrl = this.api?.getAvatarUrl?.(
            conv.customerFbId || conv.psid,
            conv.pageId,
            null,
            conv.avatar
        );

        if (conv.avatar && (conv.avatar.includes('content.pancake.vn') || conv.avatar.startsWith('http'))) {
            return `<img src="${this.escapeHtml(conv.avatar)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="conv-avatar-ph" style="width:${size}px;height:${size}px;display:none;background:${AVATAR_GRADIENTS[Math.abs(this._hashCode(conv.name || '')) % AVATAR_GRADIENTS.length]};">${(conv.name || '?')[0].toUpperCase()}</div>`;
        }

        if ((conv.customerFbId || conv.psid) && avatarUrl) {
            return `<img src="${this.escapeHtml(avatarUrl)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="conv-avatar-ph" style="width:${size}px;height:${size}px;display:none;background:${AVATAR_GRADIENTS[Math.abs(this._hashCode(conv.name || '')) % AVATAR_GRADIENTS.length]};">${(conv.name || '?')[0].toUpperCase()}</div>`;
        }

        const gradient = AVATAR_GRADIENTS[Math.abs(this._hashCode(conv.name || '')) % AVATAR_GRADIENTS.length];
        return `<div class="conv-avatar-ph" style="width:${size}px;height:${size}px;background:${gradient};">${(conv.name || '?')[0].toUpperCase()}</div>`;
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
        escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
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
