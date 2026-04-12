// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE CONVERSATION LIST - Sidebar conversation rendering
// =====================================================

const PancakeConversationList = {

    /**
     * Render full conversation list into #pkConversations
     */
    renderConversationList() {
        const container = document.getElementById('pkConversations');
        if (!container) return;

        const state = window.PancakeState;
        const { escapeHtml } = window.SharedUtils;

        if (state.isSearching) return;

        let filtered = state.searchResults !== null ? state.searchResults : state.conversations;

        // Search results empty
        if (state.searchResults !== null && state.searchResults.length === 0) {
            container.innerHTML = `
                <div class="pk-search-empty">
                    <i data-lucide="search-x"></i>
                    <span>Không tìm thấy kết quả cho "${escapeHtml(state.searchQuery)}"</span>
                    <button class="pk-clear-search-btn" onclick="window.PancakeConversationList.clearSearch()">Xóa tìm kiếm</button>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="pk-empty-state" style="padding: 40px 20px;">
                    <i data-lucide="inbox"></i><h3>Không có hội thoại</h3><p>Chưa có cuộc trò chuyện nào</p>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Filter by selected page
        if (state.selectedPageId && state.searchResults === null) {
            const selectedPage = state.pages.find(p => p.id === state.selectedPageId);
            const ids = selectedPage
                ? [selectedPage.id, selectedPage.fb_page_id, selectedPage.page_id].filter(Boolean)
                : [state.selectedPageId];
            filtered = filtered.filter(conv => ids.includes(conv.page_id));
        }

        // Local search filter
        if (state.searchQuery && state.searchResults === null) {
            const q = state.searchQuery.toLowerCase();
            filtered = filtered.filter(conv => {
                const customer = conv.customers?.[0] || {};
                const name = (conv.from?.name || customer.name || '').toLowerCase();
                const phone = (customer.phone || customer.phone_number || '').toLowerCase();
                const snippet = (conv.snippet || '').toLowerCase();
                const fbId = (customer.fb_id || conv.from?.id || '').toLowerCase();
                return name.includes(q) || snippet.includes(q) || phone.includes(q) || fbId.includes(q);
            });
        }

        // Filter by type
        if (state.activeFilter === 'tpos-saved') {
            filtered = filtered.filter(conv => {
                const customer = conv.customers?.[0] || {};
                const possibleIds = [conv.from?.id, conv.from_psid, customer.psid, customer.id].filter(Boolean);
                return possibleIds.some(id => state.tposSavedIds.has(id));
            });
        } else if (state.activeFilter === 'inbox') {
            filtered = filtered.filter(conv => conv.type === 'INBOX');
        } else if (state.activeFilter === 'comment') {
            filtered = filtered.filter(conv => conv.type === 'COMMENT');
        }

        if (filtered.length === 0) {
            const pageName = state.pages.find(p => p.id === state.selectedPageId)?.name || 'page này';
            container.innerHTML = `
                <div class="pk-empty-state" style="padding: 40px 20px;">
                    <i data-lucide="inbox"></i><h3>Không có hội thoại</h3>
                    <p>Không tìm thấy hội thoại nào ${state.selectedPageId ? `trong ${pageName}` : ''}</p>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        container.innerHTML = filtered.map(conv => this.renderConversationItem(conv)).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    /**
     * Render a single conversation item
     */
    renderConversationItem(conv) {
        const state = window.PancakeState;
        const { escapeHtml, formatTime, getAvatarUrl } = window.SharedUtils;

        const name = conv.from?.name || conv.customers?.[0]?.name || 'Unknown';
        const avatar = this._getAvatarHtml(conv);
        const preview = conv.snippet || conv.last_message?.text || '';
        const time = formatTime(conv.updated_at);
        const unreadCount = conv.unread_count || 0;
        const isUnread = unreadCount > 0;
        const isActive = state.activeConversation?.id === conv.id;
        const tags = this._getTagsHtml(conv);
        const convType = conv.type || 'INBOX';
        const isInbox = convType === 'INBOX';

        const customer = conv.customers?.[0] || conv.from || {};
        const hasPhone = customer.phone_numbers?.length > 0 || customer.phone || conv.recent_phone_numbers?.length > 0 || conv.has_phone === true;

        // Debt badge
        const phone = this._getPhoneFromConv(conv);
        const debt = phone ? state.getDebtCache(phone) : null;
        const hasDebt = state.showDebt && ((debt && debt > 0) || (state.showZeroDebt && debt !== null && debt !== undefined));
        const debtDisplay = hasDebt ? window.SharedUtils.formatDebt(debt) : '';

        return `
            <div class="pk-conversation-item ${isActive ? 'active' : ''}" data-conv-id="${conv.id}" data-page-id="${conv.page_id}">
                <div class="pk-avatar">
                    ${avatar}
                    ${unreadCount > 0 ? `<span class="pk-unread-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
                </div>
                <div class="pk-conversation-content">
                    <div class="pk-conversation-header">
                        <span class="pk-conversation-name">${escapeHtml(name)}</span>
                        <span class="pk-conversation-time">${time}</span>
                    </div>
                    <div class="pk-conversation-preview ${isUnread ? 'unread' : ''}">${escapeHtml(this._parseMessageHtml(preview))}</div>
                    <div class="pk-conversation-meta" style="display:flex;align-items:center;gap:6px;margin-top:4px;">
                        ${tags ? `<div class="pk-tags-container" style="display:inline-flex;">${tags}</div>` : ''}
                        ${hasDebt ? `<span class="pk-debt-badge" style="padding:2px 6px;background:#fef2f2;color:#dc2626;border-radius:4px;font-size:10px;font-weight:600;">Nợ: ${debtDisplay}</span>` : ''}
                    </div>
                </div>
                <div class="pk-conversation-actions">
                    <div class="pk-action-icons">
                        ${hasPhone ? `<span class="pk-icon-indicator has-phone" title="Có SĐT"><i data-lucide="phone"></i></span>` : ''}
                        <span class="pk-icon-indicator ${isInbox ? 'inbox' : 'comment'}" title="${isInbox ? 'Tin nhắn' : 'Bình luận'}">
                            <i data-lucide="${isInbox ? 'message-circle' : 'message-square'}"></i>
                        </span>
                        ${state.activeFilter === 'tpos-saved' ? `
                        <button class="pk-remove-tpos-btn" title="Xóa khỏi Lưu Tpos" onclick="event.stopPropagation(); window.PancakeConversationList.removeFromTposSaved('${conv.from?.id || conv.from_psid || customer.psid || customer.id || ''}')">
                            <i data-lucide="minus"></i>
                        </button>` : ''}
                    </div>
                </div>
            </div>`;
    },

    /**
     * Select a conversation by ID
     */
    selectConversation(convId) {
        const state = window.PancakeState;
        let conv = state.conversations.find(c => c.id === convId);
        if (!conv && state.searchResults) conv = state.searchResults.find(c => c.id === convId);
        if (!conv) return;
        state.activeConversation = conv;
        this.renderConversationList();
        window.PancakeChatWindow.renderChatWindow(conv);
    },

    /**
     * Apply filter type
     */
    async applyFilter(filter) {
        const state = window.PancakeState;
        state.activeFilter = filter;
        if (filter === 'tpos-saved') await window.PancakeAPI.loadTposSavedIds();
        this.renderConversationList();
    },

    /**
     * Handle search
     */
    async handleSearch(query) {
        const state = window.PancakeState;
        state.searchQuery = query;
        if (!query) {
            state.clearSearch();
            this.renderConversationList();
            return;
        }
        // Instant local search
        state.searchResults = null;
        this.renderConversationList();
    },

    /**
     * API search (debounced, called from event handler)
     */
    async performApiSearch(query) {
        if (!query || query.length < 2) return;
        const state = window.PancakeState;
        state.isSearching = true;
        const container = document.getElementById('pkConversations');
        if (container) {
            container.innerHTML = `<div class="pk-search-loading"><div class="pk-loading-spinner"></div>
                <span>Đang tìm kiếm "${window.SharedUtils.escapeHtml(query)}"...</span></div>`;
        }
        try {
            const result = await window.PancakeAPI.searchConversations(query);
            state.searchResults = result?.conversations || [];
            this.renderConversationList();
        } catch {
            state.searchResults = [];
            this.renderConversationList();
        } finally {
            state.isSearching = false;
        }
    },

    clearSearch() {
        window.PancakeState.clearSearch();
        const input = document.getElementById('pkSearchInput');
        if (input) input.value = '';
        this.renderConversationList();
    },

    /**
     * Update unread badge on a single conversation in DOM
     */
    updateConversationInDOM(conv) {
        const container = document.getElementById('pkConversations');
        if (!container) return;
        const el = container.querySelector(`[data-conv-id="${conv.id}"]`);
        if (el) {
            const previewEl = el.querySelector('.pk-conversation-preview');
            const timeEl = el.querySelector('.pk-conversation-time');
            if (previewEl) { previewEl.textContent = conv.snippet || ''; previewEl.classList.add('unread'); }
            if (timeEl) timeEl.textContent = window.SharedUtils.formatTime(conv.updated_at);

            const avatarContainer = el.querySelector('.pk-avatar');
            let badgeEl = el.querySelector('.pk-unread-badge');
            if (conv.unread_count > 0) {
                if (badgeEl) {
                    badgeEl.textContent = conv.unread_count > 9 ? '9+' : conv.unread_count;
                } else if (avatarContainer) {
                    const newBadge = document.createElement('span');
                    newBadge.className = 'pk-unread-badge';
                    newBadge.textContent = conv.unread_count > 9 ? '9+' : conv.unread_count;
                    avatarContainer.appendChild(newBadge);
                }
            }
            if (container.firstChild !== el) {
                container.insertBefore(el, container.firstChild);
                el.classList.add('pk-conv-updated');
                setTimeout(() => el.classList.remove('pk-conv-updated'), 1000);
            }
        } else {
            this.renderConversationList();
        }
    },

    /**
     * Load more conversations (infinite scroll)
     */
    async loadMore() {
        const state = window.PancakeState;
        if (state.isLoadingMoreConversations || !state.hasMoreConversations) return;
        state.isLoadingMoreConversations = true;

        const container = document.getElementById('pkConversations');
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'pk-load-more-indicator';
        loadingDiv.innerHTML = `<div class="pk-loading-spinner" style="width:20px;height:20px;"></div><span>Đang tải thêm...</span>`;
        if (container) container.appendChild(loadingDiv);

        try {
            const more = await window.PancakeAPI.fetchMoreConversations();
            loadingDiv.remove();
            if (!more || more.length === 0) {
                state.hasMoreConversations = false;
            } else {
                this.renderConversationList();
            }
        } catch {
            loadingDiv.remove();
        } finally {
            state.isLoadingMoreConversations = false;
        }
    },

    async removeFromTposSaved(customerId) {
        if (!customerId) return;
        const ok = await window.PancakeAPI.removeFromTposSaved(customerId);
        if (ok) {
            if (window.PancakeState.activeFilter === 'tpos-saved') this.renderConversationList();
            if (window.notificationManager) window.notificationManager.show('Đã xóa khỏi Lưu Tpos', 'success');
        }
    },

    // =====================================================
    // HELPERS
    // =====================================================

    _getAvatarHtml(conv) {
        const customer = conv.customers?.[0] || conv.from;
        const name = customer?.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const pageId = conv.page_id;
        const fbId = customer?.fb_id || customer?.id || conv.from?.id;

        let directUrl = customer?.avatar || customer?.picture?.data?.url || customer?.profile_pic ||
            customer?.image_url || conv.from?.picture?.data?.url || conv.from?.profile_pic || null;
        let avatarUrl = directUrl;
        if (fbId) avatarUrl = window.SharedUtils.getAvatarUrl(fbId, pageId, null, directUrl);

        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
        ];
        const gradient = colors[name.charCodeAt(0) % colors.length];

        if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
            return `<img src="${avatarUrl}" alt="${window.SharedUtils.escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                    <div class="pk-avatar-placeholder" style="display:none;background:${gradient};">${initial}</div>`;
        }
        return `<div class="pk-avatar-placeholder" style="background:${gradient};">${initial}</div>`;
    },

    _getTagsHtml(conv) {
        const tags = conv.tags || [];
        if (tags.length === 0) return '';
        const palette = ['red', 'green', 'blue', 'orange', 'purple', 'pink', 'teal'];
        return tags.map((tag, i) => {
            const tagName = tag.name || tag.tag_name || tag;
            const tagColor = tag.color || tag.tag_color || palette[i % palette.length];
            return `<span class="pk-tag-badge ${tagColor}">${window.SharedUtils.escapeHtml(tagName)}</span>`;
        }).join('');
    },

    _getPhoneFromConv(conv) {
        const customer = conv.customers?.[0] || conv.from || {};
        const phone = customer.phone_numbers?.[0] || customer.phone || conv.recent_phone_numbers?.[0] || null;
        return phone ? window.SharedUtils.normalizePhone(phone) : null;
    },

    _parseMessageHtml(html) {
        if (!html || !html.includes('<')) return html || '';
        try {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            let text = temp.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<\/p>/gi, '\n');
            temp.innerHTML = text;
            return (temp.textContent || temp.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
        } catch {
            return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }
};

// Export
if (typeof window !== 'undefined') {
    window.PancakeConversationList = PancakeConversationList;
}
