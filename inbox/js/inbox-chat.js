/* =====================================================
   INBOX CHAT CONTROLLER - UI layer for Inbox
   Render, events, send, WebSocket, search, etc.
   ===================================================== */

// =====================================================
// PANCAKE PHOENIX WEBSOCKET - Direct connection
// =====================================================

class PancakePhoenixSocket {
    constructor({ accessToken, userId, pageIds, onEvent, onStatusChange }) {
        this.url = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
        this.accessToken = accessToken;
        this.userId = userId;
        this.pageIds = pageIds;
        this.onEvent = onEvent;
        this.onStatusChange = onStatusChange;

        this.ws = null;
        this.ref = 0;
        this.heartbeatTimer = null;
        this.heartbeatTimeout = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnect = 10;
        this.isConnected = false;
        this.joinedChannels = new Set();

        this.clientSession = crypto.getRandomValues(new Uint8Array(32))
            .reduce((s, b) => s + b.toString(36).padStart(2, '0'), '').slice(0, 64);
    }

    connect() {
        if (this.ws) this.disconnect();
        console.log('[PHOENIX] Connecting to', this.url);

        try {
            this.ws = new WebSocket(this.url);
            this.ws.onopen = () => this._onOpen();
            this.ws.onclose = (e) => this._onClose(e);
            this.ws.onmessage = (e) => this._onMessage(e);
            this.ws.onerror = (e) => console.error('[PHOENIX] WS error:', e);
        } catch (e) {
            console.error('[PHOENIX] Connect error:', e);
            this._scheduleReconnect();
        }
    }

    disconnect() {
        this._stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onclose = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.joinedChannels.clear();
        this.onStatusChange(false);
    }

    _onOpen() {
        console.log('[PHOENIX] Connected, joining channels...');
        this.reconnectAttempts = 0;

        // Join users:{userId}
        this._joinChannel(`users:${this.userId}`, {
            accessToken: this.accessToken,
            userId: this.userId,
            platform: 'web'
        });

        // Join multiple_pages:{userId}
        this._joinChannel(`multiple_pages:${this.userId}`, {
            accessToken: this.accessToken,
            userId: this.userId,
            clientSession: this.clientSession,
            pageIds: this.pageIds,
            platform: 'web'
        });

        this._startHeartbeat();
    }

    _onClose(e) {
        console.log('[PHOENIX] Disconnected, code:', e.code, 'reason:', e.reason);
        this.isConnected = false;
        this.joinedChannels.clear();
        this._stopHeartbeat();
        this.onStatusChange(false);
        this._scheduleReconnect();
    }

    _onMessage(e) {
        try {
            const data = JSON.parse(e.data);
            if (!Array.isArray(data) || data.length < 5) return;

            const [joinRef, ref, topic, event, payload] = data;

            // Handle join replies
            if (event === 'phx_reply') {
                const status = payload?.status;
                if (status === 'ok') {
                    this.joinedChannels.add(topic);
                    console.log('[PHOENIX] Joined:', topic);
                    // Mark connected when at least one channel joined
                    if (!this.isConnected && this.joinedChannels.size > 0) {
                        this.isConnected = true;
                        this.onStatusChange(true);
                    }
                } else if (status === 'error') {
                    console.warn('[PHOENIX] Join error:', topic, payload?.response?.reason || payload);
                }
                return;
            }

            // Handle heartbeat reply
            if (topic === 'phoenix' && event === 'phx_reply') {
                if (this.heartbeatTimeout) {
                    clearTimeout(this.heartbeatTimeout);
                    this.heartbeatTimeout = null;
                }
                return;
            }

            // Handle phx_error (channel crashed)
            if (event === 'phx_error') {
                console.warn('[PHOENIX] Channel error:', topic);
                this.joinedChannels.delete(topic);
                return;
            }

            // Handle phx_close (channel closed)
            if (event === 'phx_close') {
                this.joinedChannels.delete(topic);
                return;
            }

            // Dispatch app events
            if (this.onEvent) {
                this.onEvent(event, payload);
            }
        } catch (e) {
            console.error('[PHOENIX] Message parse error:', e);
        }
    }

    _joinChannel(topic, payload) {
        const joinRef = String(++this.ref);
        this._send([joinRef, joinRef, topic, 'phx_join', payload]);
    }

    _send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    _startHeartbeat() {
        this._stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            const ref = String(++this.ref);
            this._send([null, ref, 'phoenix', 'heartbeat', {}]);

            // If no reply in 10s, connection is dead
            this.heartbeatTimeout = setTimeout(() => {
                console.warn('[PHOENIX] Heartbeat timeout, closing...');
                if (this.ws) this.ws.close();
            }, 10000);
        }, 30000);
    }

    _stopHeartbeat() {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
        if (this.heartbeatTimeout) { clearTimeout(this.heartbeatTimeout); this.heartbeatTimeout = null; }
    }

    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnect) {
            console.warn('[PHOENIX] Max reconnect attempts reached');
            return;
        }
        const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
        this.reconnectAttempts++;
        console.log(`[PHOENIX] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnect})`);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
}

// =====================================================
// INBOX CHAT CONTROLLER
// =====================================================

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

        // WebSocket (Phoenix direct)
        this.phoenixSocket = null;
        this.isSocketConnected = false;
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
        this.populateLivestreamPostSelector();
        this.renderQuickReplies();
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
            showToast('Đã làm mới', 'success');
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

        // Livestream post selector buttons
        document.getElementById('btnFetchPostNames')?.addEventListener('click', () => this._fetchMissingPostNames());
        document.getElementById('btnClearLivestream')?.addEventListener('click', () => this.clearLivestreamForPost());

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
                    <p style="margin-top:0.5rem;">${search ? 'Không tìm thấy kết quả' : 'Chưa có dữ liệu'}</p>
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
        const tagsHtml = (conv.tags || []).filter(t => t && t.name).slice(0, 2).map(t => {
            const colorMap = { red: 'tag-red', green: 'tag-green', blue: 'tag-blue', orange: 'tag-orange', purple: 'tag-purple', pink: 'tag-pink', teal: 'tag-teal' };
            const cls = colorMap[t.color] || '';
            return `<span class="conv-tag ${cls}">${this.escapeHtml(t.name)}</span>`;
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
        this.updateLivestreamButton(conv);
        this._updateReplyPlaceholder();

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
            document.getElementById('chatMessages').innerHTML = `<div class="chat-empty-state"><p>Lỗi tải tin nhắn: ${e.message}</p></div>`;
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
            container.innerHTML = '<div class="chat-empty-state"><p>Chưa có tin nhắn</p></div>';
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
                    typeIconHtml = '<span class="msg-type-icon type-inbox"><i data-lucide="lock"></i> Riêng</span>';
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
                if (msg.canLike) actionBtns += `<button class="msg-action-btn ${msg.userLikes ? 'liked' : ''}" data-action="${msg.userLikes ? 'unlike' : 'like'}" data-msg="${msg.id}" title="${msg.userLikes ? 'Bỏ thích' : 'Thích'}"><i data-lucide="thumbs-up"></i></button>`;
                if (msg.canHide) actionBtns += `<button class="msg-action-btn ${msg.isHidden ? 'active' : ''}" data-action="${msg.isHidden ? 'unhide' : 'hide'}" data-msg="${msg.id}" title="${msg.isHidden ? 'Hiện' : 'Ẩn'}"><i data-lucide="${msg.isHidden ? 'eye' : 'eye-off'}"></i></button>`;
                actionBtns += `<button class="msg-action-btn" data-action="reply" data-msg="${msg.id}" title="Trả lời"><i data-lucide="corner-up-left"></i></button>`;
                actionBtns += `<button class="msg-action-btn" data-action="react" data-msg="${msg.id}" title="React"><i data-lucide="smile"></i></button>`;
                actionBtns += `<button class="msg-action-btn" data-action="copy" data-msg="${msg.id}" title="Sao chép"><i data-lucide="copy"></i></button>`;
                if (msg.canRemove && isOutgoing) actionBtns += `<button class="msg-action-btn danger" data-action="delete" data-msg="${msg.id}" title="Xóa"><i data-lucide="trash-2"></i></button>`;
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
            html = '<div class="load-more-indicator">Đầu cuộc hội thoại</div>' + html;
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
                showToast('Không có page_access_token. Vui lòng thêm trong Pancake Settings.', 'error');
                return;
            }

            // Handle image upload
            if (this.selectedImage) {
                const uploadResult = await this.api.uploadMedia(sendPageId, this.selectedImage, pageAccessToken);
                if (uploadResult.success && uploadResult.content_url) {
                    const payload = { action: 'reply_inbox', content_url: uploadResult.content_url };
                    await this.api.sendMessage(sendPageId, conv.id, payload, pageAccessToken);
                } else {
                    throw new Error('Upload ảnh thất bại');
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
            showToast(`Lỗi gửi tin nhắn: ${e.message}`, 'error');
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
            if (!fbResult.success && fbResult.error) throw new Error(fbResult.error.message || 'Gửi thất bại');
        } else if (!result.success && result.error) {
            throw new Error(result.error.message || result.message || 'Gửi thất bại');
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
                showToast('Đã thích', 'success');
                break;
            case 'unlike':
                await this.api.unlikeComment(conv.pageId, msgId, pageAccessToken);
                showToast('Đã bỏ thích', 'info');
                break;
            case 'hide':
                await this.api.hideComment(conv.pageId, msgId, pageAccessToken);
                showToast('Đã ẩn bình luận', 'success');
                break;
            case 'unhide':
                await this.api.unhideComment(conv.pageId, msgId, pageAccessToken);
                showToast('Đã hiện bình luận', 'info');
                break;
            case 'delete':
                if (confirm('Xóa bình luận này?')) {
                    await this.api.deleteComment(conv.pageId, msgId, pageAccessToken);
                    showToast('Đã xóa', 'success');
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
                    showToast('Đã sao chép', 'success');
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
                showToast('Đã react', 'success');
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
            showToast('File quá lớn (tối đa 25MB)', 'error');
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
            showToast('File quá lớn (tối đa 25MB)', 'error');
            return;
        }
        const conv = this.data.getConversation(this.activeConvId);
        if (!conv) return;

        const pat = await this._getPageAccessTokenWithFallback(conv.pageId);
        if (!pat) { showToast('Không có page_access_token', 'error'); return; }

        showToast('Đang tải file...', 'info');
        const result = await this.api.uploadMedia(conv.pageId, file, pat);
        if (result.success && result.content_url) {
            await this.api.sendMessage(conv.pageId, conv.id, { action: 'reply_inbox', content_url: result.content_url }, pat);
            showToast('Đã gửi file', 'success');
            setTimeout(() => this.loadMessages(conv), 2000);
        } else {
            showToast('Tải file thất bại', 'error');
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

            this.phoenixSocket = new PancakePhoenixSocket({
                accessToken: token,
                userId: payload.uid,
                pageIds: this.data.pageIds,
                onEvent: (event, payload) => this._onPhoenixEvent(event, payload),
                onStatusChange: (connected) => {
                    this.isSocketConnected = connected;
                    this.updateSocketStatusUI(connected);
                    if (connected) {
                        this.stopAutoRefresh();
                    } else {
                        this.startAutoRefresh();
                    }
                }
            });
            this.phoenixSocket.connect();

            // Fallback: if not connected after 15s, ensure polling is active
            setTimeout(() => {
                if (!this.isSocketConnected) {
                    console.warn('[INBOX-CHAT] Phoenix WS not connected after 15s, polling active');
                    this.startAutoRefresh();
                }
            }, 15000);

        } catch (e) {
            console.error('[INBOX-CHAT] initializeWebSocket error:', e);
            this.startAutoRefresh();
        }
    }

    _onPhoenixEvent(event, payload) {
        switch (event) {
            case 'pages:update_conversation':
                this.handleConversationUpdate(payload);
                break;
            case 'pages:new_message':
                this.handleNewMessage(payload);
                break;
            case 'order:tags_updated':
            case 'tags_updated':
                this._handleTagsUpdated(payload);
                break;
        }
    }

    _handleTagsUpdated(payload) {
        const convId = payload.conversation_id;
        const tags = payload.tags;
        if (!convId) return;
        const conv = this.data.getConversation(convId);
        if (conv && tags) {
            conv.tags = tags;
            this.renderConversationList();
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

        // Try smart single update first, fallback to full re-render
        if (!this._updateSingleConversationInList(convId)) {
            this.renderConversationList();
        }
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
        if (this.phoenixSocket) { this.phoenixSocket.disconnect(); this.phoenixSocket = null; }
        this.stopAutoRefresh();
    }

    updateSocketStatusUI(connected) {
        const el = document.getElementById('wsStatus');
        if (!el) return;
        el.className = connected ? 'ws-status connected' : 'ws-status disconnected';
        el.innerHTML = connected
            ? '<i data-lucide="wifi"></i>'
            : '<i data-lucide="wifi-off"></i>';
        el.title = connected ? 'Realtime: Đã kết nối' : 'Realtime: Mất kết nối';
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
                    <div class="page-item-name">Tất cả Pages</div>
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
            label.textContent = 'Tất cả Pages';
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
                        <div class="group-stats-card-count"><strong>${g.count}</strong> khách hàng</div>
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
        showToast('Đã thêm ghi chú', 'success');
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
                    <input type="text" class="group-name-input" value="${this.escapeHtml(g.name)}" placeholder="Tên nhóm" />
                    <textarea class="group-note-input" placeholder="Mô tả...">${this.escapeHtml(g.note || '')}</textarea>
                </div>
                ${defaultIds.includes(g.id) ? '' : `<button class="modal-group-delete" data-id="${g.id}" title="Xóa"><i data-lucide="trash-2"></i></button>`}
            </div>
        `).join('');
        html += '</div>';

        // Add new group section
        html += `
            <div class="modal-add-section">
                <h4>Thêm nhóm mới</h4>
                <div class="modal-add-row">
                    <div class="modal-group-color-pick" id="newGroupColor" style="background:#8b5cf6;cursor:pointer;"></div>
                    <div class="modal-add-fields">
                        <input type="text" id="newGroupName" placeholder="Tên nhóm mới" />
                        <textarea id="newGroupNote" placeholder="Mô tả (tùy chọn)"></textarea>
                    </div>
                    <button class="btn-modal-add" id="btnAddGroupConfirm">Thêm</button>
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
                if (confirm('Xóa nhóm này?')) {
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
            if (!name) { showToast('Nhập tên nhóm', 'warning'); return; }
            const color = document.getElementById('newGroupColor')?.style.background || '#8b5cf6';
            const note = document.getElementById('newGroupNote')?.value?.trim() || '';
            this.data.addGroup(name, color, note);
            this.showManageGroupsModal();
            this.renderGroupStats();
        };

        // Save button
        document.getElementById('btnSaveGroups').onclick = () => {
            modal.style.display = 'none';
            showToast('Đã lưu nhóm', 'success');
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
            showToast('Đã bỏ đánh dấu livestream', 'info');
        } else {
            const postId = conv.postId || conv._raw?.post_id || '';
            this.data.markAsLivestream(conv.id, postId);
            showToast('Đã đánh dấu livestream', 'success');
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
        const title = post.message || post.name || 'Bài viết';
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
                <p style="margin-top:0.5rem;">Không có hoạt động</p>
            </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
            return;
        }

        container.innerHTML = `<div class="activities-header"><h3>Hoạt động</h3></div>
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
        if (!token) { showToast('Nhập JWT token', 'warning'); return; }

        // Clean token
        token = token.replace(/^jwt=/, '').replace(/;.*$/, '').trim();

        try {
            await this.tm.saveTokenToFirestore(token);
            showToast('Đã thêm tài khoản', 'success');
            input.value = '';
            document.getElementById('addAccountForm').style.display = 'none';
            this._renderAccountsList();
        } catch (e) {
            showToast('Lỗi: ' + e.message, 'error');
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
            container.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">Chưa có tài khoản nào</div>';
            return;
        }

        container.innerHTML = accounts.map(acc => {
            const decoded = this.tm.decodeToken(acc.token);
            const isExpired = decoded?.exp ? this.tm.isTokenExpired(decoded.exp) : false;
            return `
                <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid #e5e7eb;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:13px;color:#374151;">${this.escapeHtml(decoded?.name || acc.accountId || 'Unknown')}</div>
                        <div style="font-size:11px;color:#6b7280;">UID: ${decoded?.uid || '?'} ${isExpired ? '<span style="color:#ef4444;font-weight:600;">Hết hạn</span>' : '<span style="color:#10b981;">Còn hiệu lực</span>'}</div>
                    </div>
                    ${acc.isActive ? '<span style="font-size:11px;background:#10b981;color:white;padding:2px 8px;border-radius:10px;">Active</span>' : `<button onclick="window.inboxChat?.tm?.setActiveAccount?.('${acc.accountId}');window.inboxChat?._renderAccountsList?.()" style="font-size:11px;padding:2px 8px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;">Chọn</button>`}
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

    // Convert date to Vietnam timezone parts for comparison
    _toVN(date) {
        return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    }

    formatTime(date) {
        if (!date || !(date instanceof Date) || isNaN(date)) return '';
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Vừa xong';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'p';

        const vnNow = this._toVN(now);
        const vnDate = this._toVN(date);

        if (vnDate.getDate() === vnNow.getDate() && vnDate.getMonth() === vnNow.getMonth() && vnDate.getFullYear() === vnNow.getFullYear()) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        }

        const dayDiff = Math.floor(diff / 86400000);
        if (dayDiff < 7) {
            const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
            return days[vnDate.getDay()];
        }

        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    }

    formatDate(date) {
        if (!date || !(date instanceof Date) || isNaN(date)) return '';
        const vnNow = this._toVN(new Date());
        const vnDate = this._toVN(date);
        const today = new Date(vnNow.getFullYear(), vnNow.getMonth(), vnNow.getDate());
        const msgDay = new Date(vnDate.getFullYear(), vnDate.getMonth(), vnDate.getDate());

        if (msgDay.getTime() === today.getTime()) return 'Hôm nay';
        if (today - msgDay === 86400000) return 'Hôm qua';
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

    // =====================================================
    // DEBOUNCED LUCIDE ICONS
    // =====================================================

    _debouncedCreateIcons() {
        if (this._iconTimer) clearTimeout(this._iconTimer);
        this._iconTimer = setTimeout(() => {
            if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: '' } });
        }, 50);
    }

    // =====================================================
    // SINGLE CONVERSATION UPDATE (avoid full re-render)
    // =====================================================

    _updateSingleConversationInList(convId) {
        const el = document.querySelector(`.conversation-item[data-id="${convId}"]`);
        if (!el) return false;

        const conv = this.data.getConversation(convId);
        if (!conv) return false;

        const newHtml = this._buildConvItemHtml(conv);
        const temp = document.createElement('div');
        temp.innerHTML = newHtml;
        const newEl = temp.firstElementChild;
        if (!newEl) return false;

        el.replaceWith(newEl);
        newEl.addEventListener('click', () => this.selectConversation(convId));
        this._debouncedCreateIcons();
        return true;
    }

    // =====================================================
    // LIVESTREAM POST SELECTOR
    // =====================================================

    populateLivestreamPostSelector() {
        const select = document.getElementById('livestreamPostSelect');
        if (!select) return;

        const postMap = {};
        for (const [convId, info] of Object.entries(this.data.livestreamPostMap)) {
            const pid = info.postId;
            if (pid) {
                if (!postMap[pid]) postMap[pid] = { postId: pid, name: info.postName || pid, count: 0 };
                postMap[pid].count++;
            }
        }

        const posts = Object.values(postMap).sort((a, b) => b.count - a.count);
        select.innerHTML = '<option value="">Tất cả bài post</option>' +
            posts.map(p => `<option value="${p.postId}">${this.escapeHtml(p.name || p.postId)} (${p.count})</option>`).join('');

        select.onchange = () => {
            this._livestreamPostFilter = select.value;
            this.renderConversationList();
        };
    }

    async _fetchMissingPostNames() {
        const postIds = new Set();
        for (const info of Object.values(this.data.livestreamPostMap)) {
            if (info.postId && !info.postName) postIds.add(info.postId);
        }
        if (postIds.size === 0) { showToast('Đã có tên tất cả bài viết', 'info'); return; }

        showToast('Đang lấy tên bài viết...', 'info');
        let found = 0;
        for (const postId of postIds) {
            try {
                // Try to get post info from first page that has it
                for (const pageId of this.data.pageIds) {
                    const pat = await this._getPageAccessTokenWithFallback(pageId);
                    if (!pat) continue;
                    const url = InboxApiConfig.buildUrl.pancakeOfficial(`pages/${pageId}/posts/${postId}`, pat);
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        const name = data.message || data.name || '';
                        if (name) {
                            for (const info of Object.values(this.data.livestreamPostMap)) {
                                if (info.postId === postId) info.postName = name.substring(0, 80);
                            }
                            found++;
                            break;
                        }
                    }
                }
            } catch (e) {}
        }
        showToast(`Đã lấy ${found}/${postIds.size} tên bài viết`, 'success');
        this.populateLivestreamPostSelector();
    }

    async clearLivestreamForPost() {
        const select = document.getElementById('livestreamPostSelect');
        const postId = select?.value;
        if (!postId) { showToast('Chọn bài post cần xóa', 'warning'); return; }
        if (!confirm('Xóa tất cả livestream của bài post này?')) return;

        const toRemove = [];
        for (const [convId, info] of Object.entries(this.data.livestreamPostMap)) {
            if (info.postId === postId) toRemove.push(convId);
        }

        for (const convId of toRemove) {
            this.data.unmarkAsLivestream(convId);
        }

        showToast(`Đã xóa ${toRemove.length} livestream`, 'success');
        this.populateLivestreamPostSelector();
        this.renderConversationList();
    }

    updateLivestreamButton(conv) {
        const btn = document.getElementById('btnToggleLivestream');
        if (!btn) return;
        if (!conv) { btn.style.display = 'none'; return; }
        btn.style.display = '';
        btn.title = conv.isLivestream ? 'Bỏ Livestream' : 'Đưa vào Livestream';
        btn.classList.toggle('active', conv.isLivestream);
    }

    // =====================================================
    // REPLY PLACEHOLDER & AUTO TYPE
    // =====================================================

    _updateReplyPlaceholder() {
        const input = document.getElementById('chatInput');
        if (!input) return;
        const conv = this.data.getConversation(this.activeConvId);
        if (!conv) { input.placeholder = 'Nhập tin nhắn...'; return; }

        if (conv.type === 'COMMENT') {
            const replyType = document.getElementById('replyTypeSelect')?.value || 'reply_comment';
            input.placeholder = replyType === 'reply_comment' ? 'Bình luận công khai...' : 'Nhắn riêng cho khách...';
        } else {
            input.placeholder = 'Nhập tin nhắn...';
        }
    }

    getAutoReplyType(conv) {
        if (!conv || conv.type !== 'COMMENT') return 'reply_inbox';
        return 'reply_comment';
    }

    // =====================================================
    // FB ERROR PARSING
    // =====================================================

    _parseFbError(responseText) {
        try {
            const data = typeof responseText === 'string' ? JSON.parse(responseText) : responseText;
            const errCode = data.error_code || data.e_code || data.error?.code;
            const errSubcode = data.error_subcode || data.e_subcode || data.error?.error_subcode;
            const errMsg = data.error?.message || data.message || '';

            if (errCode === 10 && errSubcode === 2018278) return 'Đã quá 24h, không thể gửi inbox. Thử nhắn riêng (private_replies).';
            if (errCode === 551) return 'Người dùng không khả dụng.';
            if (errCode === 100) return 'Tin nhắn không hợp lệ hoặc đã bị xóa.';
            if (errCode === 190) return 'Token hết hạn, vui lòng cập nhật lại.';
            return errMsg || `Lỗi Facebook (code: ${errCode})`;
        } catch (e) {
            return typeof responseText === 'string' ? responseText : 'Lỗi không xác định';
        }
    }

    // =====================================================
    // RENDER DATA MODAL
    // =====================================================

    async showRenderDataModal() {
        const convCount = this.data.conversations.length;
        const pageCount = this.data.pages.length;
        const groups = this.data.groups;
        const labels = this.data.labelMap;

        let labelStats = {};
        for (const [convId, lblArr] of Object.entries(labels)) {
            for (const lbl of lblArr) {
                labelStats[lbl] = (labelStats[lbl] || 0) + 1;
            }
        }

        const livestreamCount = Object.keys(this.data.livestreamPostMap).length;
        const unreadCount = this.data.conversations.filter(c => c.unread > 0).length;
        const inboxCount = this.data.conversations.filter(c => c.type === 'INBOX').length;
        const commentCount = this.data.conversations.filter(c => c.type === 'COMMENT').length;

        let html = `
            <div style="padding:20px;max-height:70vh;overflow-y:auto;">
                <h3 style="margin:0 0 16px;">Dữ liệu Inbox</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                    <div style="padding:12px;background:#f0f9ff;border-radius:8px;"><strong>${convCount}</strong> cuộc hội thoại</div>
                    <div style="padding:12px;background:#f0fdf4;border-radius:8px;"><strong>${pageCount}</strong> pages</div>
                    <div style="padding:12px;background:#fef3c7;border-radius:8px;"><strong>${unreadCount}</strong> chưa đọc</div>
                    <div style="padding:12px;background:#fce7f3;border-radius:8px;"><strong>${livestreamCount}</strong> livestream</div>
                    <div style="padding:12px;background:#ede9fe;border-radius:8px;"><strong>${inboxCount}</strong> INBOX</div>
                    <div style="padding:12px;background:#ecfdf5;border-radius:8px;"><strong>${commentCount}</strong> COMMENT</div>
                </div>
                <h4 style="margin:16px 0 8px;">Nhóm phân loại</h4>
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <tr style="background:#f9fafb;"><th style="padding:8px;text-align:left;">Nhóm</th><th style="padding:8px;text-align:right;">Số lượng</th></tr>
                    ${groups.map(g => `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${g.color};margin-right:6px;"></span>${this.escapeHtml(g.name)}</td><td style="padding:8px;text-align:right;">${labelStats[g.id] || 0}</td></tr>`).join('')}
                </table>
                <h4 style="margin:16px 0 8px;">Pages</h4>
                ${this.data.pages.map(p => `<div style="padding:6px 0;font-size:13px;border-bottom:1px solid #f3f4f6;">${this.escapeHtml(p.name || p.id)} <span style="color:#6b7280;">(${p.id})</span></div>`).join('')}
            </div>`;

        // Simple modal overlay
        let modal = document.getElementById('renderDataModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'renderDataModal';
            modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10001;align-items:center;justify-content:center;';
            modal.innerHTML = '<div style="background:white;border-radius:12px;max-width:600px;width:90%;max-height:85vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);"><div id="renderDataContent"></div><div style="padding:12px 20px;border-top:1px solid #e5e7eb;text-align:right;"><button onclick="document.getElementById(\'renderDataModal\').style.display=\'none\'" style="padding:8px 20px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">Đóng</button></div></div>';
            document.body.appendChild(modal);
        }
        document.getElementById('renderDataContent').innerHTML = html;
        modal.style.display = 'flex';
    }

    // =====================================================
    // QUICK REPLY BAR
    // =====================================================

    async renderQuickReplies() {
        const row1 = document.getElementById('quickReplyRow1');
        const row2 = document.getElementById('quickReplyRow2');
        const bar = document.getElementById('quickReplyBar');
        if (!row1 || !row2 || !bar) return;

        if (!window.quickReplyManager) { bar.style.display = 'none'; return; }

        await window.quickReplyManager.ensureRepliesLoaded();
        const replies = window.quickReplyManager.replies || [];
        if (replies.length === 0) { bar.style.display = 'none'; return; }

        // Color rotation for quick reply buttons
        const colors = ['qr-blue', 'qr-green', 'qr-purple', 'qr-red', 'qr-teal', 'qr-orange', 'qr-pink'];

        bar.style.display = '';
        const half = Math.ceil(replies.length / 2);
        const first = replies.slice(0, Math.min(half, 7));
        const second = replies.slice(Math.min(half, 7), Math.min(replies.length, 14));

        row1.innerHTML = first.map((r, i) => {
            const colorCls = colors[i % colors.length];
            return `<button class="qr-btn ${colorCls}" data-id="${r.id}" data-template="${this.escapeHtml(r.message || '')}">${this.escapeHtml(r.shortcut || r.topic || '...')}</button>`;
        }).join('') + `<button class="qr-btn qr-purple" onclick="window.quickReplyManager?.openModal?.('chatInput')">+</button>`;

        row2.innerHTML = second.map((r, i) => {
            const colorCls = colors[(i + first.length) % colors.length];
            return `<button class="qr-btn ${colorCls}" data-id="${r.id}" data-template="${this.escapeHtml(r.message || '')}">${this.escapeHtml(r.shortcut || r.topic || '...')}</button>`;
        }).join('');

        // Click handler via event delegation (already bound in bindEvents for .qr-btn)
        bar.querySelectorAll('.qr-btn[data-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                window.quickReplyManager.selectReply(id);
            });
        });
    }
}

window.InboxChatController = InboxChatController;
console.log('[INBOX-CHAT] Loaded');
