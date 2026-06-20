// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE CONVERSATION LIST - Sidebar conversation rendering
// =====================================================

const PancakeConversationList = {
    // null = lần render đầu (không animate cả list). Sau đó: id hội thoại đã thấy
    // → so với lần realtime sau để phát hiện KH chat tới MỚI → animate "trượt vào".
    _seenIds: null,

    /**
     * Render full conversation list into #pkConversations
     */
    renderConversationList() {
        const container = document.getElementById('pkConversations');
        if (!container) return;

        const state = window.PancakeState;
        const { escapeHtml } = window.SharedUtils;

        // isSearching guard removed — local results stay visible while API fetches

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
            const selectedPage = state.pages.find((p) => p.id === state.selectedPageId);
            const ids = selectedPage
                ? [selectedPage.id, selectedPage.fb_page_id, selectedPage.page_id].filter(Boolean)
                : [state.selectedPageId];
            filtered = filtered.filter((conv) => ids.includes(conv.page_id));
        }

        // Local search filter
        if (state.searchQuery && state.searchResults === null) {
            const q = state.searchQuery.toLowerCase();
            filtered = filtered.filter((conv) => {
                const customer = conv.customers?.[0] || {};
                const name = (conv.from?.name || customer.name || '').toLowerCase();
                const phone = (customer.phone || customer.phone_number || '').toLowerCase();
                const snippet = (conv.snippet || '').toLowerCase();
                const fbId = (customer.fb_id || conv.from?.id || '').toLowerCase();
                return (
                    name.includes(q) || snippet.includes(q) || phone.includes(q) || fbId.includes(q)
                );
            });
        }

        // Sub-filter loại hội thoại (áp cho MỌI tab): tin nhắn (INBOX) / bình luận (COMMENT).
        if (state.typeFilter === 'message') {
            filtered = filtered.filter((conv) => (conv.type || 'INBOX') === 'INBOX');
        } else if (state.typeFilter === 'comment') {
            filtered = filtered.filter((conv) => conv.type === 'COMMENT');
        }

        // Tab filter theo NGƯỜI: livestream commenter vs còn lại.
        const lsf = window.PancakeLivestreamFilter;
        if (state.activeFilter === 'livestream') {
            filtered = filtered.filter((conv) => lsf?.isLivestreamConv(conv));
        } else if (state.activeFilter === 'inbox') {
            // Người KHÔNG nằm trong danh sách livestream của chiến dịch đang chọn.
            filtered = filtered.filter((conv) => !lsf?.isLivestreamConv(conv));
        }

        if (filtered.length === 0) {
            // Tab Livestream chưa chọn chiến dịch → hướng dẫn thay vì "trống".
            if (state.activeFilter === 'livestream' && !lsf?.hasCampaign?.()) {
                container.innerHTML = `
                    <div class="pk-empty-state" style="padding: 40px 20px;">
                        <i data-lucide="radio"></i><h3>Chưa chọn chiến dịch</h3>
                        <p>Chọn một chiến dịch livestream ở trên để xem khách đã comment / nhắn tin.</p>
                    </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }
            const pageName =
                state.pages.find((p) => p.id === state.selectedPageId)?.name || 'page này';
            container.innerHTML = `
                <div class="pk-empty-state" style="padding: 40px 20px;">
                    <i data-lucide="inbox"></i><h3>Không có hội thoại</h3>
                    <p>Không tìm thấy hội thoại nào ${state.selectedPageId ? `trong ${pageName}` : ''}</p>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Phát hiện hội thoại MỚI xuất hiện (KH vừa chat tới) để animate "trượt vào".
        // Diff theo toàn bộ state.conversations (không theo filtered) → đổi tab không
        // animate lại. Lần đầu (_seenIds=null) bỏ qua. Burst lớn (>8, vd reload trang)
        // cũng bỏ qua để cả list không nhấp nháy.
        const allIds = new Set((state.conversations || []).map((c) => c.id));
        const isFirstRender = this._seenIds === null;
        let newIds = new Set();
        if (!isFirstRender) {
            for (const id of allIds) if (!this._seenIds.has(id)) newIds.add(id);
            if (newIds.size > 8) newIds = new Set();
        }
        this._seenIds = allIds;

        container.innerHTML = filtered
            .map((conv) => this.renderConversationItem(conv, newIds.has(conv.id)))
            .join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    /**
     * Render a single conversation item
     * @param {object} conv
     * @param {boolean} [isNew=false] - KH vừa chat tới → thêm class animate trượt vào
     */
    renderConversationItem(conv, isNew = false) {
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
        const hasPhone =
            customer.phone_numbers?.length > 0 ||
            customer.phone ||
            conv.recent_phone_numbers?.length > 0 ||
            conv.has_phone === true;

        // Debt badge
        const phone = this._getPhoneFromConv(conv);
        const debt = phone ? state.getDebtCache(phone) : null;
        const hasDebt =
            state.showDebt &&
            ((debt && debt > 0) || (state.showZeroDebt && debt !== null && debt !== undefined));
        const debtDisplay = hasDebt ? window.SharedUtils.formatDebt(debt) : '';

        // ID đưa vào inline onclick PHẢI sanitize (chống XSS qua data Pancake):
        // fb id/psid chỉ gồm chữ-số nên strip mọi ký tự lạ là an toàn.
        const psidSafe = String(
            conv.from?.id || conv.from_psid || customer.psid || customer.id || ''
        ).replace(/[^\w.:-]/g, '');

        // ===== REDESIGN đợt 7: row kiểu Telegram/Intercom — tên CHIẾM TRỌN dòng
        // (hết "..."), chỉ báo kênh/SĐT = badge overlay góc avatar, unread = pill
        // bên phải preview. Bỏ cột actions phải (thủ phạm bóp tên). =====
        const chBadge = `<span class="pk-ch-badge ${isInbox ? 'inbox' : 'comment'}" title="${isInbox ? 'Tin nhắn' : 'Bình luận'}"><i data-lucide="${isInbox ? 'message-circle' : 'message-square'}"></i></span>`;
        const phoneBadge = hasPhone
            ? `<span class="pk-ch-badge phone" title="Có SĐT"><i data-lucide="phone"></i></span>`
            : '';
        const removeBtn =
            state.activeFilter === 'live-saved'
                ? `<button class="pk-remove-web2-btn" title="Xóa khỏi Lưu Live" onclick="event.stopPropagation(); window.PancakeConversationList.removeFromLiveSaved('${psidSafe}')"><i data-lucide="minus"></i></button>`
                : '';
        const hasMeta = !!tags || hasDebt;

        return `
            <div class="pk-conversation-item ${isActive ? 'active' : ''} ${isUnread ? 'is-unread' : ''} ${isNew ? 'pk-conv-enter' : ''}" data-conv-id="${conv.id}" data-page-id="${conv.page_id}">
                <div class="pk-avatar">
                    ${avatar}
                    ${chBadge}
                    ${phoneBadge}
                </div>
                <div class="pk-conversation-content">
                    <div class="pk-conversation-header">
                        <span class="pk-conversation-name">${escapeHtml(name)}</span>
                        <span class="pk-conversation-time">${time}</span>
                    </div>
                    <div class="pk-conversation-sub">
                        ${this._pageBadge(conv)}
                        <span class="pk-conversation-preview ${isUnread ? 'unread' : ''}">${escapeHtml(this._parseMessageHtml(preview))}</span>
                        ${unreadCount > 0 ? `<span class="pk-unread-pill">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
                    </div>
                    ${
                        hasMeta
                            ? `<div class="pk-conversation-meta">
                        ${tags ? `<div class="pk-tags-container">${tags}</div>` : ''}
                        ${hasDebt ? `<span class="pk-debt-badge">Nợ: ${debtDisplay}</span>` : ''}
                    </div>`
                            : ''
                    }
                    ${removeBtn}
                </div>
            </div>`;
    },

    // Map fb page_id → nhãn ngắn Store/House (+ màu). Page khác → tên page rút gọn.
    _PAGE_LABELS: {
        270136663390370: { t: 'Store', c: '#0ea5e9' }, // NhiJudy Store
        117267091364524: { t: 'House', c: '#f59e0b' }, // Nhi Judy House
    },
    _pageLabel(pageId) {
        const pid = String(pageId || '');
        if (!pid) return null;
        const known = this._PAGE_LABELS[pid];
        if (known) return known;
        const state = window.PancakeState;
        const p = (state.pages || []).find((x) =>
            [x.id, x.fb_page_id, x.page_id].map(String).includes(pid)
        );
        const nm = p?.name || p?.page_name || 'Page';
        return { t: nm.length > 10 ? nm.slice(0, 10) : nm, c: '#6b7280' };
    },
    // Badge page (Store/House) trên mỗi hội thoại → click lọc theo page đó.
    _pageBadge(conv) {
        const pid = String(conv.page_id || '');
        const lbl = this._pageLabel(pid);
        if (!lbl) return '';
        const active = String(window.PancakeState.selectedPageId || '') === pid;
        // Sanitize trước khi nhúng vào inline onclick/HTML (chống XSS)
        const pidSafe = pid.replace(/[^\w.:-]/g, '');
        const lblSafe = window.SharedUtils.escapeHtml(lbl.t);
        return `<span class="pk-page-badge" onclick="event.stopPropagation(); window.PancakeConversationList.setPageFilter('${pidSafe}')" title="Lọc hội thoại ${lblSafe}" style="cursor:pointer;flex-shrink:0;font-size:9px;font-weight:700;line-height:1;padding:2px 6px;border-radius:999px;color:#fff;background:${lbl.c};${active ? 'outline:2px solid #1e293b;outline-offset:1px;' : ''}">${lblSafe}</span>`;
    },
    // Lọc hội thoại theo page (badge click). Toggle: click lại badge đang active
    // hoặc gọi null → bỏ lọc. Dùng lại cơ chế state.selectedPageId sẵn có.
    setPageFilter(pageId) {
        const state = window.PancakeState;
        const pid = pageId == null ? null : String(pageId);
        state.selectedPageId = pid && state.selectedPageId !== pid ? pid : null;
        const clr = document.getElementById('pkPageFilterClear');
        if (clr) clr.style.display = state.selectedPageId ? '' : 'none';
        this.renderConversationList();
    },

    /**
     * Select a conversation by ID
     */
    selectConversation(convId) {
        const state = window.PancakeState;
        let conv = state.conversations.find((c) => c.id === convId);
        if (!conv && state.searchResults) conv = state.searchResults.find((c) => c.id === convId);
        if (!conv) return;
        state.activeConversation = conv;
        this.renderConversationList();
        window.PancakeChatWindow.renderChatWindow(conv);
        // Mobile: chuyển sang view chat full-screen (single-pane swap)
        if (window.Web2PancakeMobile?.showChat) window.Web2PancakeMobile.showChat();
    },

    /**
     * Apply tab filter (theo người): 'all' | 'inbox' | 'livestream'
     */
    async applyFilter(filter) {
        const state = window.PancakeState;
        state.activeFilter = filter;
        this.renderConversationList();
    },

    /**
     * Apply sub-filter loại hội thoại (mọi tab): 'all' | 'message' | 'comment'
     */
    applyTypeFilter(type) {
        window.PancakeState.typeFilter = type;
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
        // Không dùng isSearching + full-spinner nữa — local results vẫn hiển thị
        // Chỉ thêm badge nhỏ trên search input để báo đang gọi API
        const input = document.getElementById('pkSearchInput');
        if (input) input.classList.add('pk-searching');
        try {
            const result = await window.PancakeAPI.searchConversations(query);
            state.searchResults = result?.conversations || [];
            this.renderConversationList();
        } catch {
            state.searchResults = [];
            this.renderConversationList();
        } finally {
            if (input) input.classList.remove('pk-searching');
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
            if (previewEl) {
                previewEl.textContent = conv.snippet || '';
                previewEl.classList.add('unread');
            }
            if (timeEl) timeEl.textContent = window.SharedUtils.formatTime(conv.updated_at);

            const subEl = el.querySelector('.pk-conversation-sub');
            let pillEl = el.querySelector('.pk-unread-pill');
            if (conv.unread_count > 0) {
                const txt = conv.unread_count > 99 ? '99+' : conv.unread_count;
                if (pillEl) {
                    pillEl.textContent = txt;
                } else if (subEl) {
                    const newPill = document.createElement('span');
                    newPill.className = 'pk-unread-pill';
                    newPill.textContent = txt;
                    subEl.appendChild(newPill);
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

    async removeFromLiveSaved(customerId) {
        if (!customerId) return;
        const ok = await window.PancakeAPI.removeFromLiveSaved(customerId);
        if (ok) {
            if (window.PancakeState.activeFilter === 'live-saved') this.renderConversationList();
            if (window.notificationManager)
                window.notificationManager.show('Đã xóa khỏi Lưu Live', 'success');
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

        let directUrl =
            customer?.avatar ||
            customer?.picture?.data?.url ||
            customer?.profile_pic ||
            customer?.image_url ||
            conv.from?.picture?.data?.url ||
            conv.from?.profile_pic ||
            null;
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
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
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
        return tags
            .map((tag, i) => {
                const tagName = tag.name || tag.tag_name || tag;
                const tagColor = tag.color || tag.tag_color || palette[i % palette.length];
                return `<span class="pk-tag-badge ${tagColor}">${window.SharedUtils.escapeHtml(tagName)}</span>`;
            })
            .join('');
    },

    _getPhoneFromConv(conv) {
        const customer = conv.customers?.[0] || conv.from || {};
        const phone =
            customer.phone_numbers?.[0] || customer.phone || conv.recent_phone_numbers?.[0] || null;
        return phone ? window.SharedUtils.normalizePhone(phone) : null;
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
    window.PancakeConversationList = PancakeConversationList;
}
