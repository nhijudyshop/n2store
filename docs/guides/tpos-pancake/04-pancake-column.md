# Phase 11-16 — Cột Pancake (token multi-account → state → API → UI → WS realtime)

Tham khảo file thật: [tpos-pancake/js/pancake/](../../../tpos-pancake/js/pancake/).

## Phase 11 — `pancake/pancake-token-manager.js`

Pancake dùng **JWT (không refresh)**. User tự add token qua Settings modal. Guide hỗ trợ nhiều tài khoản, lưu vào Firestore collection `pancake_accounts`.

```javascript
(function (global) {
    'use strict';

    const LS_JWT = 'pancake_jwt_token';
    const LS_EXPIRY = 'pancake_jwt_token_expiry';
    const LS_ACTIVE = 'tpos_pancake_active_account_id';
    const LS_PAGE_TOKENS = 'pancake_page_access_tokens';
    const BUFFER_MS = 5 * 60 * 1000;

    class PancakeTokenManager {
        constructor() {
            this._currentToken = null;
            this._currentExpiry = 0;
            this._activeAccountId = null;
            this._accounts = {};      // id → { id, email, fb_name, jwt_token, expiry }
            this._pageTokens = {};    // pageId → { token, pageName }
        }

        async initialize() {
            this._loadFromLocalStorage();
            if (window.db) await this._restoreFromFirestore();
        }

        _loadFromLocalStorage() {
            this._currentToken = localStorage.getItem(LS_JWT);
            this._currentExpiry = Number(localStorage.getItem(LS_EXPIRY) || 0);
            this._activeAccountId = localStorage.getItem(LS_ACTIVE);
            try { this._pageTokens = JSON.parse(localStorage.getItem(LS_PAGE_TOKENS) || '{}'); } catch {}
        }

        async _restoreFromFirestore() {
            try {
                const snap = await window.db.collection('pancake_accounts').get();
                snap.forEach((doc) => { this._accounts[doc.id] = { id: doc.id, ...doc.data() }; });
                if (!this._activeAccountId && Object.keys(this._accounts).length > 0) {
                    this._activeAccountId = Object.keys(this._accounts)[0];
                    localStorage.setItem(LS_ACTIVE, this._activeAccountId);
                }
                const active = this._accounts[this._activeAccountId];
                if (active) {
                    this._currentToken = active.jwt_token;
                    this._currentExpiry = active.expiry || 0;
                    localStorage.setItem(LS_JWT, this._currentToken);
                    localStorage.setItem(LS_EXPIRY, this._currentExpiry);
                }
            } catch (e) { console.warn('[pancake-token] firestore restore failed:', e.message); }
        }

        async getToken() {
            if (this._currentToken && this._currentExpiry - Date.now() > BUFFER_MS) return this._currentToken;
            return this._currentToken; // nếu hết hạn, caller sẽ lỗi 401 → user phải tự add token mới
        }

        getTokenInfo() {
            const a = this._accounts[this._activeAccountId];
            return a ? { uid: a.id, email: a.email, fb_name: a.fb_name, expiry: a.expiry } : null;
        }

        getAllAccounts() { return Object.values(this._accounts); }
        getActiveAccountId() { return this._activeAccountId; }

        _decodeJwt(token) {
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('Invalid JWT');
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            return payload;
        }

        async addAccount(jwt) {
            const payload = this._decodeJwt(jwt);
            if (payload.exp * 1000 < Date.now()) throw new Error('JWT đã hết hạn');
            const accountId = payload.user_id || payload.sub || payload.email || crypto.randomUUID();
            const account = {
                id: accountId,
                email: payload.email || '',
                fb_name: payload.fb_name || payload.name || payload.email || 'Pancake',
                jwt_token: jwt,
                expiry: payload.exp * 1000,
                added_at: Date.now(),
            };
            if (window.db) {
                await window.db.collection('pancake_accounts').doc(accountId).set(account);
            }
            this._accounts[accountId] = account;
            await this.setActiveAccount(accountId);
        }

        async setActiveAccount(id) {
            const a = this._accounts[id];
            if (!a) return;
            this._activeAccountId = id;
            this._currentToken = a.jwt_token;
            this._currentExpiry = a.expiry;
            localStorage.setItem(LS_ACTIVE, id);
            localStorage.setItem(LS_JWT, a.jwt_token);
            localStorage.setItem(LS_EXPIRY, a.expiry);
        }

        async deleteAccount(id) {
            if (window.db) await window.db.collection('pancake_accounts').doc(id).delete();
            delete this._accounts[id];
            if (this._activeAccountId === id) {
                const remaining = Object.keys(this._accounts);
                await this.setActiveAccount(remaining[0] || null);
            }
        }

        async getOrGeneratePageAccessToken(pageId) {
            if (this._pageTokens[pageId]?.token) return this._pageTokens[pageId].token;
            // Fallback: call API to generate (see full code)
            // POST /api/pancake-page-tokens/generate?page_id=...
            try {
                const token = await this.getToken();
                const res = await fetch(
                    `${window.API_CONFIG.WORKER_URL}/api/pancake-page-tokens/generate?page_id=${pageId}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (res.ok) {
                    const data = await res.json();
                    this._pageTokens[pageId] = { token: data.token, pageName: data.pageName };
                    localStorage.setItem(LS_PAGE_TOKENS, JSON.stringify(this._pageTokens));
                    return data.token;
                }
            } catch {}
            return null;
        }
    }

    global.pancakeTokenManager = new PancakeTokenManager();
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 12a — `pancake/pancake-state.js`

```javascript
(function (global) {
    'use strict';

    const PancakeState = {
        // --- Conversations ---
        conversations: [],
        activeConversation: null,
        messages: [],

        // --- Pages ---
        pages: [],
        pagesWithUnread: [],
        selectedPageId: null,
        pageIds: [],

        // --- Pagination ---
        hasMoreConversations: true,
        isLoadingMoreConversations: false,
        lastConversationId: null,
        hasMoreMessages: true,
        isLoadingMoreMessages: false,

        // --- Search + filter ---
        searchQuery: '',
        searchResults: null,
        isSearching: false,
        activeFilter: 'all',     // 'all' | 'inbox' | 'comment' | 'tpos-saved'
        tposSavedIds: new Set(),

        // --- UI ---
        isLoading: false,
        isPageDropdownOpen: false,
        isScrolledToBottom: true,

        // --- Realtime ---
        typingIndicators: new Map(),
        isSocketConnected: false,
        isSocketConnecting: false,
        socketReconnectAttempts: 0,

        // --- Settings ---
        serverMode: localStorage.getItem('pancake_server_mode') || 'pancake',
        showDebt: true,
        showZeroDebt: false,

        // --- URLs ---
        proxyBaseUrl: window.API_CONFIG.WORKER_URL,

        // --- Static data ---
        quickReplies: [
            { text: 'Shop có sẵn ạ', color: '#10b981' },
            { text: 'Bạn inbox Shop giá ạ', color: '#3b82f6' },
            { text: 'Shop gửi ảnh ngay ạ', color: '#f59e0b' },
        ],

        reset() {
            this.conversations = [];
            this.activeConversation = null;
            this.messages = [];
            this.lastConversationId = null;
            this.hasMoreConversations = true;
        },
    };

    global.PancakeState = PancakeState;
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 12b — `pancake/pancake-api.js`

```javascript
(function (global) {
    'use strict';

    const PancakeAPI = {
        async getToken() { return await window.pancakeTokenManager.getToken(); },

        async _fetchJson(url, options = {}) {
            const token = await this.getToken();
            const res = await fetch(url, {
                ...options,
                headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
            });
            if (!res.ok) throw new Error(`Pancake API ${res.status}`);
            return res.json();
        },

        async fetchPages(forceRefresh = false) {
            const token = await this.getToken();
            const url = `${window.API_CONFIG.buildUrl.pancake('pages')}?access_token=${encodeURIComponent(token)}`;
            const data = await this._fetchJson(url);
            const activated = data?.categorized?.activated || [];
            window.PancakeState.pages = activated;
            window.PancakeState.pageIds = activated.map((p) => p.id);
            // Extract page_access_tokens from settings
            for (const p of activated) {
                const token = p.settings?.page_access_token;
                if (token) window.pancakeTokenManager._pageTokens[p.id] = { token, pageName: p.name };
            }
            return activated;
        },

        async fetchPagesWithUnreadCount() {
            const token = await this.getToken();
            const url = `${window.API_CONFIG.buildUrl.pancake('pages/unread_conv_pages_count')}?access_token=${encodeURIComponent(token)}`;
            const data = await this._fetchJson(url);
            window.PancakeState.pagesWithUnread = data.data || [];
            return data.data || [];
        },

        async fetchConversations(pageId = null, refresh = false) {
            const state = window.PancakeState;
            if (refresh) state.lastConversationId = null;
            const token = await this.getToken();
            const qs = new URLSearchParams({ access_token: token, limit: 20 });
            if (pageId) qs.set('page_id', pageId);
            if (state.lastConversationId && !refresh) qs.set('after', state.lastConversationId);

            const url = `${window.API_CONFIG.buildUrl.pancake('conversations')}?${qs}`;
            const data = await this._fetchJson(url);
            const convs = data?.data || [];
            if (refresh) state.conversations = convs;
            else state.conversations.push(...convs);
            state.hasMoreConversations = convs.length >= 20;
            if (convs.length > 0) state.lastConversationId = convs[convs.length - 1].id;
            return convs;
        },

        async fetchMessages(pageId, convId, after = null) {
            const token = await this.getToken();
            const qs = new URLSearchParams({ access_token: token, limit: 50 });
            if (after) qs.set('after', after);
            const url = `${window.API_CONFIG.buildUrl.pancake(`conversations/${convId}/messages`)}?${qs}`;
            const data = await this._fetchJson(url);
            return { messages: data?.data || [], hasMore: !!data?.has_more };
        },

        async sendMessage(pageId, convId, message, attachments = []) {
            const token = await this.getToken();
            const url = `${window.API_CONFIG.buildUrl.pancake(`conversations/${convId}/messages`)}?access_token=${encodeURIComponent(token)}`;
            return this._fetchJson(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, attachments, page_id: pageId }),
            });
        },

        async markAsRead(pageId, convId) {
            const token = await this.getToken();
            const url = `${window.API_CONFIG.buildUrl.pancake(`conversations/${convId}/mark-read`)}?access_token=${encodeURIComponent(token)}`;
            return this._fetchJson(url, { method: 'POST' });
        },

        async markAsUnread(pageId, convId) {
            const token = await this.getToken();
            const url = `${window.API_CONFIG.buildUrl.pancake(`conversations/${convId}/mark-unread`)}?access_token=${encodeURIComponent(token)}`;
            return this._fetchJson(url, { method: 'POST' });
        },

        async loadTposSavedIds() {
            try {
                const res = await fetch(`${window.API_CONFIG.WORKER_URL}/api/tpos-saved/ids`);
                if (res.ok) {
                    const data = await res.json();
                    const ids = data.ids || [];
                    window.PancakeState.tposSavedIds = new Set(ids);
                }
            } catch {}
        },

        async loadDebtForConversations(conversations) {
            const phones = conversations
                .flatMap((c) => c.customers || [])
                .map((c) => c.phone)
                .filter(Boolean);
            if (phones.length > 0) await window.sharedDebtManager.loadBatch(phones);
        },
    };

    global.PancakeAPI = PancakeAPI;
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 13 — `pancake/pancake-page-selector.js` + `pancake/pancake-conversation-list.js`

### `pancake-page-selector.js`

```javascript
(function (global) {
    'use strict';

    const PancakePageSelector = {
        async loadPages() {
            await window.PancakeAPI.fetchPages();
            await window.PancakeAPI.fetchPagesWithUnreadCount();
            this.renderPageSelector();
        },

        renderPageSelector() {
            const slot = document.getElementById('topbarPancakeSelector');
            const state = window.PancakeState;
            if (!slot) return;
            const unreadMap = Object.fromEntries((state.pagesWithUnread || []).map((p) => [p.page_id, p.unread_conv_count]));

            const opts = state.pages.map((p) => {
                const unread = unreadMap[p.id] || 0;
                return `<option value="${p.id}">${SharedUtils.escapeHtml(p.name)}${unread ? ` (${unread})` : ''}</option>`;
            }).join('');

            slot.innerHTML = `
                <select id="pancakePageSelect" class="tpos-filter-select" style="flex:1;max-width:240px;">
                    <option value="">-- Chọn Page --</option>
                    ${opts}
                </select>`;
            const sel = slot.querySelector('#pancakePageSelect');
            sel.addEventListener('change', (e) => this.selectPage(e.target.value));
            // Restore
            const saved = localStorage.getItem('pancake_selected_page_id');
            if (saved) { sel.value = saved; this.selectPage(saved); }
        },

        async selectPage(pageId) {
            const state = window.PancakeState;
            state.selectedPageId = pageId || null;
            localStorage.setItem('pancake_selected_page_id', pageId || '');
            state.reset();
            window.eventBus?.emit('pancake:pageChanged', { pageId });
            if (pageId) {
                await window.PancakeAPI.fetchConversations(pageId, true);
                await window.PancakeAPI.loadDebtForConversations(state.conversations);
                window.PancakeConversationList.renderConversationList();
            }
        },
    };

    global.PancakePageSelector = PancakePageSelector;
})(typeof window !== 'undefined' ? window : globalThis);
```

### `pancake-conversation-list.js`

```javascript
(function (global) {
    'use strict';

    const PancakeConversationList = {
        renderConversationList() {
            const state = window.PancakeState;
            const list = document.getElementById('pkConversations');
            if (!list) return;

            let convs = state.conversations;
            // Filter by tab
            if (state.activeFilter === 'inbox')    convs = convs.filter((c) => c.type === 'INBOX');
            if (state.activeFilter === 'comment')  convs = convs.filter((c) => c.type === 'COMMENT');
            if (state.activeFilter === 'tpos-saved')
                convs = convs.filter((c) => c.customers?.some((cu) => state.tposSavedIds.has(cu.fb_id)));
            // Search
            const q = state.searchQuery.toLowerCase();
            if (q) convs = convs.filter((c) =>
                (c.from?.name || '').toLowerCase().includes(q)
                || (c.snippet || '').toLowerCase().includes(q)
                || (c.customers || []).some((cu) => (cu.phone || '').includes(q))
            );

            list.innerHTML = convs.length === 0
                ? `<div style="padding:24px;text-align:center;color:var(--gray-500);font-size:12px;">Không có hội thoại</div>`
                : convs.map((c) => this.renderConversationItem(c)).join('');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        },

        renderConversationItem(conv) {
            const state = window.PancakeState;
            const isActive = state.activeConversation?.id === conv.id;
            const name = conv.from?.name || 'No name';
            const avatar = conv.from?.avatar_url;
            const avatarHtml = avatar
                ? `<img src="${avatar}" class="pk-conv-avatar" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" onerror="this.remove()">`
                : SharedUtils.getAvatarPlaceholder(name, 48).html;
            const snippet = SharedUtils.truncate(conv.snippet || '', 60);
            const time = SharedUtils.formatTime(conv.updated_at);
            const unread = conv.unread_count || 0;
            const isInbox = conv.type === 'INBOX';

            // Debt
            const phone = conv.customers?.[0]?.phone;
            const debt = phone ? window.sharedDebtManager.getDebt(phone) : null;
            const hasDebt = state.showDebt && debt && debt > 0;

            return `
                <div class="pk-conversation-item ${isActive ? 'active' : ''}"
                     data-conv-id="${conv.id}" data-page-id="${conv.page_id || ''}"
                     onclick="PancakeConversationList.selectConversation('${conv.id}', '${conv.page_id || ''}')">
                    <div class="pk-avatar" style="position:relative;">
                        ${avatarHtml}
                        ${unread > 0 ? `<span class="pk-conv-unread-badge">${unread > 9 ? '9+' : unread}</span>` : ''}
                    </div>
                    <div class="pk-conv-content" style="flex:1;min-width:0;">
                        <div style="display:flex;justify-content:space-between;align-items:baseline;">
                            <span class="pk-conv-name">${SharedUtils.escapeHtml(name)}</span>
                            <span class="pk-conv-time" style="font-size:11px;color:var(--gray-500);">${time}</span>
                        </div>
                        <div class="pk-conv-snippet ${unread > 0 ? 'unread' : ''}" style="font-size:12px;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${SharedUtils.escapeHtml(snippet)}</div>
                        ${hasDebt ? `<span class="pk-debt-badge" style="padding:1px 5px;background:#fef2f2;color:#dc2626;border-radius:3px;font-size:10px;font-weight:600;">Nợ: ${SharedUtils.formatDebt(debt)}</span>` : ''}
                    </div>
                    <div class="pk-conv-actions" style="display:flex;flex-direction:column;gap:2px;">
                        ${phone ? `<span title="Có SĐT" style="color:#10b981;"><i data-lucide="phone" style="width:14px;height:14px;"></i></span>` : ''}
                        <span title="${isInbox ? 'Tin nhắn' : 'Bình luận'}" style="color:var(--gray-400);">
                            <i data-lucide="${isInbox ? 'message-circle' : 'message-square'}" style="width:14px;height:14px;"></i>
                        </span>
                    </div>
                </div>`;
        },

        selectConversation(convId, pageId) {
            const state = window.PancakeState;
            const conv = state.conversations.find((c) => c.id === convId);
            if (!conv) return;
            state.activeConversation = conv;
            window.PancakeChatWindow.renderChatWindow(conv);
            this.renderConversationList();
            window.PancakeAPI.markAsRead(pageId, convId);
        },

        highlightByUserId(userId) {
            const state = window.PancakeState;
            const conv = state.conversations.find((c) => c.customers?.some((cu) => cu.fb_id === userId));
            if (conv) this.selectConversation(conv.id, conv.page_id);
        },
    };

    global.PancakeConversationList = PancakeConversationList;
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 14 — `pancake/pancake-chat-window.js`

```javascript
(function (global) {
    'use strict';

    const PancakeChatWindow = {
        async renderChatWindow(conv) {
            const container = document.getElementById('pkChatWindow');
            if (!container) return;
            const name = conv.from?.name || 'No name';
            const avatar = conv.from?.avatar_url;
            const avatarHtml = avatar
                ? `<img src="${avatar}" style="width:36px;height:36px;border-radius:50%;">`
                : SharedUtils.getAvatarPlaceholder(name, 36).html;

            container.innerHTML = `
                <div class="pk-chat-header">
                    ${avatarHtml}
                    <div style="flex:1;">
                        <div style="font-weight:600;">${SharedUtils.escapeHtml(name)}</div>
                        <div style="font-size:11px;color:var(--gray-500);">${conv.type === 'COMMENT' ? 'Bình luận' : 'Tin nhắn'}</div>
                    </div>
                </div>
                <div id="pkChatMessages" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:6px;">
                    <div class="loading-spinner" style="margin:40px auto;"></div>
                </div>
                <div id="pkQuickReplies" style="padding:6px 12px;display:flex;gap:4px;flex-wrap:wrap;"></div>
                <div class="pk-message-input-area">
                    <div class="pk-input-wrapper">
                        <input id="pkMessageInput" class="pk-message-input" placeholder="Nhập tin nhắn..." style="flex:1;border:none;outline:none;background:transparent;padding:6px;">
                        <button id="pkSendBtn" class="btn btn-primary" style="padding:6px 12px;">Gửi</button>
                    </div>
                </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();

            this._renderQuickReplies();

            // Load messages
            const { messages } = await window.PancakeAPI.fetchMessages(conv.page_id, conv.id);
            window.PancakeState.messages = messages;
            this.renderMessages(messages);

            // Wire send
            const input = document.getElementById('pkMessageInput');
            const btn = document.getElementById('pkSendBtn');
            const send = async () => {
                const text = input.value.trim();
                if (!text) return;
                input.value = '';
                try {
                    await window.PancakeAPI.sendMessage(conv.page_id, conv.id, text);
                    window.PancakeState.messages.push({
                        id: 'local-' + Date.now(),
                        message: text,
                        from: { id: 'me' },
                        created_time: Date.now(),
                    });
                    this.renderMessages(window.PancakeState.messages);
                } catch (e) {
                    window.notificationManager?.show('Lỗi gửi: ' + e.message, 'error');
                }
            };
            btn.addEventListener('click', send);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            });
        },

        renderMessages(messages) {
            const box = document.getElementById('pkChatMessages');
            if (!box) return;
            box.innerHTML = messages.map((m) => this._renderMessage(m)).join('');
            box.scrollTop = box.scrollHeight;
        },

        _renderMessage(m) {
            const fromMe = m.from?.id === 'me' || m.is_from_page;
            const text = SharedUtils.escapeHtml(m.message || '');
            const time = SharedUtils.formatTime(m.created_time);
            return `
                <div class="pk-message ${fromMe ? 'outgoing' : 'incoming'}" style="display:flex;justify-content:${fromMe ? 'flex-end' : 'flex-start'};">
                    <div class="pk-message-bubble" style="max-width:70%;padding:8px 12px;border-radius:16px;${fromMe ? 'background:var(--primary);color:white;border-top-right-radius:4px;' : 'background:var(--gray-100);color:var(--gray-800);border-top-left-radius:4px;'}">
                        <div class="pk-message-text">${text}</div>
                        <div style="font-size:10px;opacity:0.6;margin-top:4px;">${time}</div>
                    </div>
                </div>`;
        },

        _renderQuickReplies() {
            const box = document.getElementById('pkQuickReplies');
            if (!box) return;
            box.innerHTML = window.PancakeState.quickReplies.map((q) => `
                <button style="padding:3px 8px;background:${q.color}22;color:${q.color};border:1px solid ${q.color}44;border-radius:12px;font-size:11px;cursor:pointer;"
                        onclick="document.getElementById('pkMessageInput').value = '${q.text.replace(/'/g, "\\'")}'; document.getElementById('pkMessageInput').focus();">
                    ${q.text}
                </button>
            `).join('');
        },

        appendIncomingMessage(m) {
            const state = window.PancakeState;
            const active = state.activeConversation;
            if (!active || m.conversation_id !== active.id) return;
            state.messages.push(m);
            this.renderMessages(state.messages);
        },
    };

    global.PancakeChatWindow = PancakeChatWindow;
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 15 — `pancake/pancake-realtime.js` (Phoenix WS)

```javascript
(function (global) {
    'use strict';

    const PancakeRealtime = {
        ws: null,
        isConnected: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 3,
        heartbeatTimer: null,
        heartbeatInterval: 30000,

        async connect() {
            if (this.isConnected) return;
            const token = await window.pancakeTokenManager.getToken();
            if (!token) return;
            try {
                this.ws = new WebSocket(`wss://pancake.vn/socket/websocket?access_token=${encodeURIComponent(token)}&vsn=2.0.0`);
                this.ws.onopen = () => this._onOpen();
                this.ws.onmessage = (e) => this._onMessage(e);
                this.ws.onclose = (e) => this._onClose(e);
                this.ws.onerror = (e) => console.error('[pk-ws] error', e);
            } catch (e) {
                console.warn('[pk-ws] connect failed, fallback to server mode', e);
                this.connectServerMode();
            }
        },

        connectServerMode() {
            const url = 'wss://n2store-realtime.onrender.com/socket';
            this.ws = new WebSocket(url);
            this.ws.onopen = () => this._onOpen();
            this.ws.onmessage = (e) => this._onMessage(e);
            this.ws.onclose = (e) => this._onClose(e);
        },

        _onOpen() {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            // Join channels for each page
            for (const pageId of window.PancakeState.pageIds) {
                this.ws.send(JSON.stringify([null, null, `live:page:${pageId}`, 'phx_join', {}]));
            }
            // Heartbeat
            this.heartbeatTimer = setInterval(() => {
                if (this.ws?.readyState === 1) {
                    this.ws.send(JSON.stringify([null, null, 'phoenix', 'heartbeat', {}]));
                }
            }, this.heartbeatInterval);
        },

        _onMessage(e) {
            try {
                const [ref, joinRef, topic, event, payload] = JSON.parse(e.data);
                if (event === 'new_message')       window.eventBus?.emit('pancake:newMessage', payload);
                else if (event === 'conversation_update') window.eventBus?.emit('pancake:conversationUpdate', payload);
            } catch {}
        },

        _onClose() {
            this.isConnected = false;
            clearInterval(this.heartbeatTimer);
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                setTimeout(() => this.connect(), 2000);
            }
        },

        disconnect() {
            this.isConnected = false;
            clearInterval(this.heartbeatTimer);
            this.ws?.close();
            this.ws = null;
        },
    };

    global.PancakeRealtime = PancakeRealtime;
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 16 — `pancake/pancake-context-menu.js` + `pancake/pancake-init.js`

### `pancake-context-menu.js` (rút gọn)

```javascript
(function (global) {
    'use strict';

    let _menu, _convId, _pageId;

    const PancakeContextMenu = {
        initialize() {
            if (_menu) return;
            _menu = document.createElement('div');
            _menu.className = 'context-menu';
            document.body.appendChild(_menu);
            document.addEventListener('click', (e) => {
                if (!_menu.contains(e.target)) this.hide();
            });
            document.addEventListener('contextmenu', (e) => {
                const item = e.target.closest('.pk-conversation-item');
                if (!item) return;
                e.preventDefault();
                this.show(e, item.dataset.convId, item.dataset.pageId);
            });
        },
        show(e, convId, pageId) {
            _convId = convId; _pageId = pageId;
            _menu.innerHTML = `
                <div class="context-menu-item" data-act="mark-read">Đánh dấu đã đọc</div>
                <div class="context-menu-item" data-act="mark-unread">Đánh dấu chưa đọc</div>
                <div class="context-menu-item" data-act="copy-id">Copy conversation ID</div>
            `;
            _menu.querySelectorAll('.context-menu-item').forEach((el) => {
                el.onclick = () => { this.handleAction(el.dataset.act); this.hide(); };
            });
            _menu.style.left = e.clientX + 'px';
            _menu.style.top = e.clientY + 'px';
            _menu.classList.add('show');
        },
        hide() { _menu?.classList.remove('show'); },

        async handleAction(act) {
            if (act === 'mark-read')   await window.PancakeAPI.markAsRead(_pageId, _convId);
            if (act === 'mark-unread') await window.PancakeAPI.markAsUnread(_pageId, _convId);
            if (act === 'copy-id')     navigator.clipboard?.writeText(_convId);
        },
    };

    global.PancakeContextMenu = PancakeContextMenu;
})(typeof window !== 'undefined' ? window : globalThis);
```

### `pancake-init.js`

```javascript
(function (global) {
    'use strict';

    const PancakeColumnManager = {
        async initialize(containerId) {
            const content = document.getElementById(containerId);
            if (!content) return;

            content.innerHTML = `
                <div style="display:flex;height:100%;">
                    <div class="pk-sidebar" style="width:340px;display:flex;flex-direction:column;border-right:1px solid var(--border);">
                        <div class="pk-search-box" style="padding:10px;">
                            <input id="pkSearchInput" class="pk-search-input" placeholder="Tìm kiếm..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:10px;font-size:13px;">
                        </div>
                        <div class="pk-filter-tabs" style="display:flex;border-bottom:1px solid var(--border);padding:0 8px;">
                            ${['all','inbox','comment','tpos-saved'].map((f) => `
                                <div class="pk-filter-tab${f === 'all' ? ' active' : ''}" data-filter="${f}" style="padding:10px 12px;font-size:12px;font-weight:600;color:var(--gray-500);cursor:pointer;border-bottom:2px solid transparent;">
                                    ${f === 'all' ? 'Tất cả' : f === 'inbox' ? 'Inbox' : f === 'comment' ? 'Comment' : 'Lưu Tpos'}
                                </div>`).join('')}
                        </div>
                        <div id="pkConversations" style="flex:1;overflow-y:auto;"></div>
                    </div>
                    <div id="pkChatWindow" style="flex:1;display:flex;flex-direction:column;background:#fafafa;">
                        <div style="margin:auto;color:var(--gray-500);font-size:13px;">Chọn hội thoại để bắt đầu</div>
                    </div>
                </div>
            `;

            await window.pancakeTokenManager.initialize();
            await window.PancakePageSelector.loadPages();
            await window.PancakeAPI.loadTposSavedIds();

            this._wireEvents();
            window.PancakeContextMenu.initialize();

            // Try WS realtime; fallback to polling
            try { await window.PancakeRealtime.connect(); } catch {}
        },

        _wireEvents() {
            // Filter tabs
            document.querySelectorAll('.pk-filter-tab').forEach((tab) => {
                tab.onclick = () => {
                    document.querySelectorAll('.pk-filter-tab').forEach((t) => t.classList.remove('active'));
                    tab.classList.add('active');
                    window.PancakeState.activeFilter = tab.dataset.filter;
                    window.PancakeConversationList.renderConversationList();
                };
            });
            // Search
            const search = document.getElementById('pkSearchInput');
            search?.addEventListener('input', SharedUtils.debounce((e) => {
                window.PancakeState.searchQuery = e.target.value.trim();
                window.PancakeConversationList.renderConversationList();
            }, 300));
            // Incoming message
            window.eventBus.on('pancake:newMessage', (payload) => {
                window.PancakeChatWindow.appendIncomingMessage(payload);
            });
        },
    };

    global.PancakeColumnManager = PancakeColumnManager;
})(typeof window !== 'undefined' ? window : globalThis);
```

### Wire vào `index.html`:
```html
<script src="js/pancake/pancake-token-manager.js"></script>
<script src="js/pancake/pancake-state.js"></script>
<script src="js/pancake/pancake-api.js"></script>
<script src="js/pancake/pancake-realtime.js"></script>
<script src="js/pancake/pancake-page-selector.js"></script>
<script src="js/pancake/pancake-conversation-list.js"></script>
<script src="js/pancake/pancake-chat-window.js"></script>
<script src="js/pancake/pancake-context-menu.js"></script>
<script src="js/pancake/pancake-init.js"></script>
```

### Verify Phase 11-16
1. Paste JWT Pancake qua Settings → account hiện trong list → tick active.
2. Topbar Pancake dropdown load page → chọn page → conversations load.
3. Click 1 hội thoại → chat window bên phải load messages.
4. Gõ tin → Enter → gửi đi; tin hiện ở bubble tím phía phải.
5. Right-click hội thoại → context menu "Đánh dấu đã đọc / Copy ID".

---

Xong cột Pancake. Tiếp sang [05-wiring-and-verify.md](05-wiring-and-verify.md) để wire toàn bộ lại + verify.
