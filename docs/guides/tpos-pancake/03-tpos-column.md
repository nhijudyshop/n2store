# Phase 5-10 — Cột TPOS (token → state → API → native orders → UI → realtime → init)

Tham khảo file thật: [tpos-pancake/js/tpos/](../../../tpos-pancake/js/tpos/).

## Phase 5 — `tpos/tpos-token-manager.js`

TPOS dùng OAuth token có refresh. Cần **auto-refresh trên 401** để tất cả API caller không phải lo.

### Bản thu nhỏ (bản đầy đủ trong repo có thêm password login fallback, multi-company)

```javascript
(function (global) {
    'use strict';

    const STORAGE_KEY = 'bearer_token_data_1';  // companyId = 1
    const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

    class TokenManager {
        constructor() {
            this._token = null;            // access_token string
            this._expiresAt = 0;
            this._refreshToken = null;
            this._refreshPromise = null;
            this._loadFromStorage();
        }

        _loadFromStorage() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return;
                const data = JSON.parse(raw);
                this._token = data.access_token;
                this._refreshToken = data.refresh_token;
                this._expiresAt = data.expires_at || 0;
            } catch {}
        }

        _saveToStorage() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                access_token: this._token,
                refresh_token: this._refreshToken,
                expires_at: this._expiresAt,
            }));
        }

        isTokenValid() {
            return this._token && this._expiresAt - Date.now() > EXPIRY_BUFFER_MS;
        }

        async getToken() {
            if (this.isTokenValid()) return this._token;
            await this.refresh();
            return this._token;
        }

        getAuthHeader() {
            return this._token ? { Authorization: `Bearer ${this._token}` } : {};
        }

        async refresh() {
            if (this._refreshPromise) return this._refreshPromise;
            this._refreshPromise = this._doRefresh().finally(() => { this._refreshPromise = null; });
            return this._refreshPromise;
        }

        async _doRefresh() {
            // REALITY: Render's POST /api/token expects OAuth password-grant payload:
            //   { grant_type:'password', username, password, client_id }
            // Credentials are stored per-user per-company in table `tpos_credentials`,
            // fetched via GET /api/tpos-credentials?username=<u>&company_id=<id>.
            //
            // Full working flow (xem bản gốc tpos-token-manager.js để biến thể đầy đủ):
            //   1. Lấy credentials: GET /api/tpos-credentials?username=<user>&company_id=1
            //   2. POST /api/token với { grant_type:'password', username, password, client_id }
            //   3. Response: { access_token, refresh_token, expires_in }
            //   4. Cache vào localStorage + Firestore backup
            const userEmail = window.AuthManager?.getCurrentUser?.()?.email;
            if (!userEmail) throw new Error('No logged-in user for TPOS login');

            const credsRes = await fetch(
                `${window.API_CONFIG.WORKER_URL}/api/tpos-credentials?username=${encodeURIComponent(userEmail)}&company_id=1`,
                { headers: { Accept: 'application/json' } }
            );
            if (!credsRes.ok) throw new Error('Load TPOS credentials failed');
            const creds = await credsRes.json();
            const { tpos_username, tpos_password } = creds?.data || {};
            if (!tpos_username || !tpos_password) throw new Error('No TPOS credentials configured');

            const res = await fetch(`${window.API_CONFIG.WORKER_URL}/api/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'password',
                    username: tpos_username,
                    password: tpos_password,
                    client_id: 'tmtWebApp',
                }),
            });
            if (!res.ok) throw new Error('TPOS login failed');
            const data = await res.json();
            this._applyTokenResponse(data);
        }

        _applyTokenResponse(data) {
            this._token = data.access_token;
            if (data.refresh_token) this._refreshToken = data.refresh_token;
            this._expiresAt = Date.now() + (Number(data.expires_in || 3600) * 1000);
            this._saveToStorage();
        }

        async authenticatedFetch(url, options = {}) {
            const token = await this.getToken();
            if (!token) throw new Error('No TPOS token');
            const run = (t) => fetch(url, {
                ...options,
                headers: { Authorization: `Bearer ${t}`, Accept: 'application/json', ...(options.headers || {}) },
            });
            let res = await run(token);
            if (res.status === 401) {
                await this.refresh();
                res = await run(this._token);
            }
            return res;
        }
    }

    global.tposTokenManager = new TokenManager();
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 6a — `tpos/tpos-state.js`

State là plain object, không reactive. Render là thủ công (`renderComments()` gọi lại).

```javascript
(function (global) {
    'use strict';

    const TposState = {
        // --- selection ---
        selectedTeamId: null,
        selectedPage: null,
        selectedPages: [],
        selectedCampaign: null,
        selectedCampaignIds: [],

        // --- data ---
        crmTeams: [],
        allPages: [],
        liveCampaigns: [],

        // --- comments ---
        comments: [],
        nextPageUrl: null,
        hasMore: false,
        isLoading: false,

        // --- realtime ---
        _sseConnections: new Map(),  // sseKey → EventSource
        _sseRetryState: new Map(),
        sseConnected: false,

        // --- caches ---
        sessionIndexMap: new Map(),  // fbUserId → { index, code, source }
        partnerCache: null,           // SharedCache, init below
        partnerFetchPromises: new Map(),

        // --- settings ---
        showDebt: localStorage.getItem('tpos_show_debt') !== 'false',
        showZeroDebt: localStorage.getItem('tpos_show_zero_debt') === 'true',
        savedToTposIds: new Set(),

        // --- context ---
        containerId: null,

        // --- URLs ---
        proxyBaseUrl: window.API_CONFIG.WORKER_URL,
        workerUrl: window.API_CONFIG.WORKER_URL,

        // --- methods ---
        clearAllCaches() {
            this.comments = [];
            this.sessionIndexMap.clear();
            this.partnerCache?.clear();
            this.partnerFetchPromises.clear();
        },
        startCacheCleanup() { this.partnerCache?.startCleanup(); },
        stopCacheCleanup()  { this.partnerCache?.stopCleanup(); },

        getSavedPageSelection() { return localStorage.getItem('tpos_selected_page') || ''; },
        savePageSelection(v)    { localStorage.setItem('tpos_selected_page', v); },
        getSavedCampaignSelection() {
            try { return JSON.parse(localStorage.getItem('tpos_selected_campaigns') || '[]'); }
            catch { return []; }
        },
        saveCampaignSelection(ids) {
            localStorage.setItem('tpos_selected_campaigns', JSON.stringify(ids));
        },
    };

    TposState.partnerCache = new SharedCache({ maxSize: 200, ttl: 10 * 60 * 1000, name: 'tpos-partner' });

    global.TposState = TposState;
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 6b — `tpos/tpos-api.js`

Tất cả request TPOS đi qua `authenticatedFetch`, proxy bởi CF Worker.

```javascript
(function (global) {
    'use strict';

    const TposApi = {
        _getWorkerUrl() { return window.API_CONFIG.WORKER_URL; },

        async getToken() {
            return window.tposTokenManager ? await window.tposTokenManager.getToken() : null;
        },

        async authenticatedFetch(url, options = {}) {
            return window.tposTokenManager.authenticatedFetch(url, options);
        },

        // ===== CRM Teams (pages) =====
        async loadCRMTeams() {
            const state = window.TposState;
            const res = await this.authenticatedFetch(`${state.proxyBaseUrl}/facebook/crm-teams`);
            if (!res.ok) throw new Error(`CRM teams HTTP ${res.status}`);
            const data = await res.json();
            state.crmTeams = data.value || [];
            state.allPages = [];
            state.crmTeams.forEach((team) => {
                (team.Childs || []).forEach((page) => {
                    if (page.Facebook_PageId && page.Facebook_TypeId === 'Page') {
                        state.allPages.push({ ...page, teamId: team.Id, teamName: team.Name });
                    }
                });
            });
            return state.crmTeams;
        },

        // ===== Live campaigns =====
        async loadLiveCampaigns(pageId) {
            const state = window.TposState;
            const res = await this.authenticatedFetch(`${state.proxyBaseUrl}/facebook/live-campaigns?top=20`);
            if (!res.ok) throw new Error(`live-campaigns HTTP ${res.status}`);
            const data = await res.json();
            state.liveCampaigns = (data.value || []).filter(
                (c) => c.Facebook_UserId === pageId && c.Facebook_LiveId
            );
            return state.liveCampaigns;
        },

        async loadLiveCampaignsFromAllPages() {
            const state = window.TposState;
            const res = await this.authenticatedFetch(`${state.proxyBaseUrl}/facebook/live-campaigns?top=50`);
            if (!res.ok) throw new Error(`live-campaigns HTTP ${res.status}`);
            const data = await res.json();
            const allPageIds = state.allPages.map((p) => p.Facebook_PageId);
            state.liveCampaigns = (data.value || []).filter(
                (c) => allPageIds.includes(c.Facebook_UserId) && c.Facebook_LiveId
            );
            return state.liveCampaigns;
        },

        // ===== Comments for a post =====
        async loadComments(pageId, postId, afterCursor = null) {
            const state = window.TposState;
            let url = `${state.proxyBaseUrl}/facebook/comments?pageid=${pageId}&postId=${postId}&limit=50`;
            if (afterCursor) url += `&after=${encodeURIComponent(afterCursor)}`;

            // Retry once on 5xx
            const token = await this.getToken();
            const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
            let res, lastErr;
            for (let i = 0; i < 2; i++) {
                try {
                    res = await fetch(url, { headers });
                    if (res.ok) break;
                    if (res.status >= 500 && i === 0) { await new Promise((r) => setTimeout(r, 800)); continue; }
                    throw new Error(`comments HTTP ${res.status}`);
                } catch (e) {
                    lastErr = e;
                    if (i === 0) { await new Promise((r) => setTimeout(r, 800)); continue; }
                    throw e;
                }
            }
            if (!res || !res.ok) throw lastErr || new Error('loadComments failed');
            const data = await res.json();
            return { comments: data.data || [], nextPageUrl: data.paging?.next || null };
        },

        // ===== SessionIndex for existing TPOS orders (for badge hydration) =====
        // Proxy route: GET /facebook/comment-orders?postId=<full_post_id>
        // Response shape: { value: [{ asuid, orders: [{ index, session, code }] }] }
        async loadSessionIndex(postId) {
            const state = window.TposState;
            const res = await this.authenticatedFetch(
                `${state.proxyBaseUrl}/facebook/comment-orders?postId=${postId}`
            );
            if (!res.ok) return new Map();
            const data = await res.json();
            const map = new Map();
            for (const item of data.value || []) {
                const asuid = item.asuid || item.id;
                if (asuid && item.orders?.length) {
                    const o = item.orders[0];
                    map.set(asuid, { index: o.index, code: o.code, session: o.session });
                }
            }
            return map;
        },

        // ===== Hide comment on Facebook =====
        // Proxy route: POST /api/rest/v2.0/facebook-graph/comment/hide
        // Body: { pageid, commentId, is_hidden }
        async hideComment(pageId, commentId, hide) {
            const url = `${this._getWorkerUrl()}/api/rest/v2.0/facebook-graph/comment/hide`;
            const res = await this.authenticatedFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageid: pageId, commentId, is_hidden: !!hide }),
            });
            return res.ok;
        },

        // ===== Reply to comment on Facebook =====
        // Proxy route: POST /api/rest/v2.0/facebook-graph/comment/reply
        // Body: { pageid, commentId, message }
        async replyToComment(pageId, commentId, message) {
            const url = `${this._getWorkerUrl()}/api/rest/v2.0/facebook-graph/comment/reply`;
            const res = await this.authenticatedFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageid: pageId, commentId, message }),
            });
            if (!res.ok) return null;
            return await res.json();
        },

        // ===== Partner info (TPOS chatomni) =====
        // Real endpoint is PATH-based (not query-based): /rest/v2.0/chatomni/info/{crmTeamId}_{userId}
        async getPartnerInfo(crmTeamId, fbUserId) {
            const url = `${this._getWorkerUrl()}/api/rest/v2.0/chatomni/info/${crmTeamId}_${fbUserId}`;
            const res = await this.authenticatedFetch(url);
            if (!res.ok) throw new Error(`partner HTTP ${res.status}`);
            return await res.json();
        },

        // NOTE: createOrderFromComment ĐÃ BỊ XÓA. Orders được tạo qua NativeOrdersApi (Phase 7).
    };

    global.TposApi = TposApi;
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 7 — `tpos/tpos-native-orders-api.js`

Backend đã sẵn ở `/api/native-orders/*` (xem [render.com/routes/native-orders.js](../../../render.com/routes/native-orders.js)). Frontend client:

```javascript
(function (global) {
    'use strict';

    const NativeOrdersApi = {
        _base() { return window.API_CONFIG.buildUrl.nativeOrders(); },

        async _fetchJson(url, options = {}) {
            const res = await fetch(url, {
                ...options,
                headers: { Accept: 'application/json', ...(options.headers || {}) },
            });
            let data = null;
            try { data = await res.json(); } catch {}
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            return data;
        },

        async createFromComment(params) {
            return this._fetchJson(`${this._base()}/from-comment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params || {}),
            });
        },

        async getByUser(fbUserId) {
            if (!fbUserId) return null;
            const d = await this._fetchJson(`${this._base()}/by-user/${encodeURIComponent(fbUserId)}`);
            return d?.order || null;
        },

        async list({ status, search, fbPostId, page = 1, limit = 200 } = {}) {
            const qs = new URLSearchParams();
            if (status) qs.set('status', status);
            if (search) qs.set('search', search);
            if (fbPostId) qs.set('fbPostId', fbPostId);
            qs.set('page', page); qs.set('limit', limit);
            return this._fetchJson(`${this._base()}/load?${qs}`);
        },

        async update(code, fields) {
            return this._fetchJson(`${this._base()}/${encodeURIComponent(code)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fields || {}),
            });
        },

        async remove(code) {
            return this._fetchJson(`${this._base()}/${encodeURIComponent(code)}`, { method: 'DELETE' });
        },
    };

    global.NativeOrdersApi = NativeOrdersApi;
})(typeof window !== 'undefined' ? window : globalThis);
```

### Request/Response của `createFromComment`

```javascript
// POST /api/native-orders/from-comment
Body:  { fbUserId, fbUserName?, fbPageId?, fbPostId?, fbCommentId?, crmTeamId?, message?, phone?, address?, note?, createdBy?, createdByName? }
Res:   { success: true, order: { code:"NW-20260424-0001", sessionIndex:1, source:"NATIVE_WEB", ... }, idempotent?: boolean }
```

Idempotency: cùng `fbCommentId` → trả lại order cũ, `idempotent: true`.

---

## Phase 8 — `tpos/tpos-comment-list.js`

Render conversation cards, xử lý hover actions, status inline, nút "Tạo đơn", infinite scroll.

### Cấu trúc `TposCommentList` (10 method chính)

```
TposCommentList = {
    renderContainer()               // init layout (selector + list + load-more)
    setupEventHandlers()            // wire scroll + select events
    handleScroll(el)                // near-bottom → emit tpos:loadMoreRequested
    updateLoadMoreIndicator()       // show/hide spinner
    renderCrmTeamOptions()          // populate #tposCrmTeamSelect
    renderCampaignOptions()         // populate #tposCampaignList (checkboxes)
    renderComments()                // render #tposCommentList entries
    renderConversationItem(c)       // big template literal per comment
    toggleCampaignDropdown()        // open/close dropdown
    selectTodayCampaigns()          // tick all campaigns opened today
    clearCampaignSelection()        // untick all
    createOrder(fromId, fromName, commentId)   // <<< THE BUTTON HANDLER
    saveInlinePhone(fromId, inputId)
    saveInlineAddress(fromId, inputId)
    showReplyInput(commentId, fromId)
    showOrderDetail(fromId)
    selectComment(commentId)
    showPancakeCustomerInfo(fromId, name, pageId)   // cross-column bridge
    getStatusOptions()              // status dropdown entries
    toggleInlineStatusDropdown(fromId)
    selectInlineStatus(fromId, value, text)
}
```

### `renderContainer()` skeleton

```javascript
renderContainer() {
    const state = window.TposState;
    const content = document.getElementById(state.containerId);
    if (!content) return;

    // Topbar slot (selectors)
    const slot = document.getElementById('topbarTposSelectors');
    if (slot) {
        slot.innerHTML = `
            <select id="tposCrmTeamSelect" class="tpos-filter-select" disabled>
                <option value="">Chọn Page...</option>
            </select>
            <div class="tpos-campaign-multi" style="position:relative;">
                <button id="tposCampaignBtn" class="tpos-filter-select" style="min-width:160px;display:flex;align-items:center;gap:4px;" disabled>
                    <span id="tposCampaignBtnText">Chọn Campaign...</span>
                    <i data-lucide="chevron-down" style="width:12px;height:12px;margin-left:auto;"></i>
                </button>
                <div id="tposCampaignDropdown" class="tpos-campaign-dropdown" style="display:none;">
                    <div style="padding:6px 10px;border-bottom:1px solid #e5e7eb;display:flex;gap:6px;">
                        <button id="tposCampaignSelectAll" style="padding:3px 8px;background:#3b82f6;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;">Hôm nay</button>
                        <button id="tposCampaignClearAll" style="padding:3px 8px;background:#f3f4f6;border:none;border-radius:4px;font-size:11px;cursor:pointer;">Bỏ chọn</button>
                    </div>
                    <div id="tposCampaignList" style="padding:4px 0;max-height:260px;overflow-y:auto;"></div>
                </div>
            </div>
        `;
    }

    // Column content
    content.innerHTML = `
        <div class="tpos-chat-wrapper">
            <div class="tpos-conversation-list" id="tposCommentList">
                <div class="tpos-empty">
                    <i data-lucide="message-square"></i>
                    <span>Chọn Page và Campaign để xem comment</span>
                </div>
            </div>
            <div class="tpos-load-more" id="tposLoadMore" style="display:none;">
                <i data-lucide="loader-2" class="spin"></i>
                <span>Đang tải thêm...</span>
            </div>
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    this.setupEventHandlers();
}
```

### `renderConversationItem(comment)` — template quan trọng nhất

```javascript
renderConversationItem(comment) {
    const state = window.TposState;
    const fromId = comment.from?.id || comment.fromId;
    const fromName = comment.from?.name || 'No name';
    const id = comment.id;
    const message = comment.message || '';
    const pictureUrl = comment.from?.picture?.data?.url || SharedUtils.getAvatarUrl(fromId);
    const initial = (fromName[0] || '?').toUpperCase();
    const gradientColor = '#6366f1';
    const commentPageId = comment._pageObj?.Facebook_PageId || '';
    const timeStr = SharedUtils.formatTime(comment.created_time);

    // Partner info + session
    const sessionInfo = state.sessionIndexMap.get(fromId);
    const isHidden = comment.is_hidden === true;

    // Partner cache
    const partnerKey = `${comment._pageObj?.Id || ''}_${fromId}`;
    const partner = state.partnerCache.get(partnerKey) || {};
    const phone = partner.Phone || '';
    const address = partner.Street || '';
    const statusText = partner.Status?.Name || '';
    const statusColor = partner.Status?.Color || null;

    // Debt
    const debt = window.sharedDebtManager.getDebt(phone);
    const debtDisplay = SharedUtils.formatDebt(debt);
    const hasDebt = state.showDebt && ((debt && debt > 0) || (state.showZeroDebt && debt != null));

    // Session index badge (green STT)
    const sessionIndexBadge = sessionInfo
        ? `<span class="session-index-badge" title="STT: ${sessionInfo.index}${sessionInfo.code ? ' | ' + sessionInfo.code : ''}">${sessionInfo.index}</span>`
        : '';

    // Order code badge (next to name)
    const orderBadge = sessionInfo?.code
        ? sessionInfo.source === 'NATIVE_WEB'
            ? `<span class="order-code-badge" title="Đơn web ${sessionInfo.code}" style="background:#ede9fe;color:#6d28d9;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600;cursor:pointer" onclick="event.stopPropagation();TposCommentList.showOrderDetail('${fromId}')">${sessionInfo.code}</span>`
            : `<span class="order-code-badge" title="Đơn TPOS ${sessionInfo.code}" style="background:#dbeafe;color:#1d4ed8;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600;cursor:pointer" onclick="event.stopPropagation();TposCommentList.showOrderDetail('${fromId}')">${sessionInfo.code}</span>`
        : '';

    // Status badge
    const statusBadgeStyle = statusColor
        ? `background:${statusColor}18;color:${statusColor};border:1px solid ${statusColor}30;`
        : 'background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;';

    return `
        <div class="tpos-conversation-item ${isHidden ? 'is-hidden' : ''}"
             data-comment-id="${id}"
             onclick="TposCommentList.selectComment('${id}')">

            <div class="tpos-conv-row1">
                <div class="tpos-conv-avatar">
                    ${pictureUrl
                        ? `<img src="${pictureUrl}" class="avatar-img" alt="${SharedUtils.escapeHtml(fromName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                           <div class="avatar-placeholder" style="display:none;background:${gradientColor};">${initial}</div>`
                        : `<div class="avatar-placeholder" style="background:${gradientColor};">${initial}</div>`
                    }
                    ${sessionIndexBadge}
                    <span class="channel-badge"><i data-lucide="facebook" class="channel-icon fb"></i></span>
                </div>

                <div class="tpos-conv-header-info">
                    <div class="tpos-conv-header">
                        <span class="customer-name" onclick="event.stopPropagation();TposCommentList.showPancakeCustomerInfo('${fromId}','${SharedUtils.escapeHtml(fromName)}','${commentPageId}')">${SharedUtils.escapeHtml(fromName)}</span>
                        ${orderBadge || ''}
                        ${isHidden ? '<span class="tpos-tag" style="background:#fee2e2;color:#dc2626;">Ẩn</span>' : ''}
                    </div>
                </div>

                <div class="inline-status-container" onclick="event.stopPropagation();">
                    <div id="status-btn-${fromId}" class="tpos-status-badge" style="${statusBadgeStyle}"
                         onclick="TposCommentList.toggleInlineStatusDropdown('${fromId}')">
                        <span id="status-text-${fromId}">${statusText || 'Trạng thái'}</span>
                    </div>
                    <div id="status-dropdown-${fromId}" class="tpos-status-dropdown" style="display:none;"></div>
                </div>

                <span class="tpos-conv-time">${timeStr}</span>
            </div>

            <div class="tpos-conv-message">${SharedUtils.escapeHtml(message)}</div>

            <div class="tpos-conv-info" onclick="event.stopPropagation();">
                <input type="text" id="phone-${fromId}" value="${SharedUtils.escapeHtml(phone)}" placeholder="SĐT" style="width:100px;">
                <button class="tpos-action-btn" style="width:22px;height:22px;" onclick="event.stopPropagation();TposCommentList.saveInlinePhone('${fromId}','phone-${fromId}')" title="Lưu SĐT">
                    <i data-lucide="save" style="width:11px;height:11px;"></i>
                </button>
                ${hasDebt ? `<span class="debt-badge">Nợ: ${debtDisplay}</span>` : ''}
                <input type="text" id="addr-${fromId}" value="${SharedUtils.escapeHtml(address)}" placeholder="Địa chỉ" style="flex:1;min-width:100px;">
                <button class="tpos-action-btn" style="width:22px;height:22px;" onclick="event.stopPropagation();TposCommentList.saveInlineAddress('${fromId}','addr-${fromId}')" title="Lưu địa chỉ">
                    <i data-lucide="save" style="width:11px;height:11px;"></i>
                </button>
            </div>

            <div class="tpos-conv-actions">
                ${sessionInfo?.source === 'NATIVE_WEB'
                    ? `<span title="Đơn web: ${sessionInfo.code}" style="color:#7c3aed;padding:4px;"><i data-lucide="package-open" style="width:13px;height:13px;"></i></span>`
                    : `<button class="tpos-action-btn" id="create-order-${fromId}" title="Tạo đơn web${sessionInfo?.code ? ' (đã có đơn TPOS ' + sessionInfo.code + ')' : ''}" style="color:#7c3aed;" onclick="event.stopPropagation();TposCommentList.createOrder('${fromId}','${SharedUtils.escapeHtml(fromName)}','${id}')">
                         <i data-lucide="shopping-cart" style="width:13px;height:13px;"></i>
                       </button>${sessionInfo?.code ? `<span title="Đơn TPOS cũ: ${sessionInfo.code}" style="color:#10b981;padding:4px;"><i data-lucide="package-check" style="width:13px;height:13px;"></i></span>` : ''}`
                }
                <button class="tpos-action-btn" title="Xem info" onclick="event.stopPropagation();TposCustomerPanel.showCustomerInfo('${fromId}','${SharedUtils.escapeHtml(fromName)}')">
                    <i data-lucide="user" style="width:13px;height:13px;"></i>
                </button>
                <button class="tpos-action-btn" title="Trả lời" onclick="event.stopPropagation();TposCommentList.showReplyInput('${id}','${fromId}')">
                    <i data-lucide="reply" style="width:13px;height:13px;"></i>
                </button>
                <button class="tpos-action-btn" title="${isHidden ? 'Hiện' : 'Ẩn'}" onclick="event.stopPropagation();TposColumnManager.toggleHideComment('${id}',${!isHidden})">
                    <i data-lucide="${isHidden ? 'eye' : 'eye-off'}" style="width:13px;height:13px;"></i>
                </button>
            </div>
        </div>
    `;
},
```

### `createOrder()` handler (nút giỏ hàng tím)

```javascript
async createOrder(fromId, fromName, commentId) {
    const state = window.TposState;
    const comment = state.comments.find((c) => c.id === commentId);
    const pageObj = comment?._pageObj || state.selectedPage;
    const crmTeamId = pageObj?.Id;
    const postId = comment?._campaignId
        ? state.liveCampaigns.find((c) => c.Id === comment._campaignId)?.Facebook_LiveId
        : state.selectedCampaign?.Facebook_LiveId;
    const fbPageId = pageObj?.Facebook_PageId;
    const message = comment?.message || '';

    const phone   = document.getElementById(`phone-${fromId}`)?.value.trim() || '';
    const address = document.getElementById(`addr-${fromId}`)?.value.trim() || '';

    const btn = document.getElementById(`create-order-${fromId}`);
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:14px;height:14px;"></i>';
        btn.disabled = true;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    try {
        const currentUser = window.AuthManager?.getCurrentUser?.() || {};
        const resp = await window.NativeOrdersApi.createFromComment({
            fbUserId: fromId,
            fbUserName: fromName,
            fbPageId: fbPageId ? String(fbPageId) : null,
            fbPostId: postId || null,
            fbCommentId: commentId,
            crmTeamId: crmTeamId || null,
            message,
            phone, address,
            createdBy: currentUser.uid || currentUser.email || null,
            createdByName: currentUser.displayName || currentUser.email || null,
        });

        const order = resp?.order;
        if (!order?.code) throw new Error('Server did not return an order');

        state.sessionIndexMap.set(fromId, {
            index: order.sessionIndex || '?',
            code: order.code,
            source: 'NATIVE_WEB',
        });

        if (btn) {
            btn.outerHTML = `<span title="Đơn web: ${order.code} (STT ${order.sessionIndex})" style="color:#7c3aed;padding:4px;">
                <i data-lucide="package-open" style="width:14px;height:14px;"></i>
            </span>`;
        }
        // Add badge next to name row (if missing)
        const header = btn?.closest('.tpos-conversation-item')?.querySelector('.tpos-conv-header');
        if (header && !header.querySelector('.order-code-badge')) {
            header.insertAdjacentHTML('beforeend',
                `<span class="order-code-badge" title="Đơn web ${order.code}" style="background:#ede9fe;color:#6d28d9;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600;">${order.code}</span>`);
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
        window.notificationManager?.show(
            `${resp.idempotent ? 'Đơn web đã tồn tại' : 'Đã tạo đơn web'} ${order.code} (STT: ${order.sessionIndex})`,
            'success'
        );
    } catch (error) {
        if (btn) {
            btn.innerHTML = '<i data-lucide="shopping-cart" style="width:14px;height:14px;"></i>';
            btn.disabled = false;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        window.notificationManager?.show('Lỗi tạo đơn web: ' + error.message, 'error');
    }
}
```

### CSS bổ sung cho `tpos/tpos-comments.css`

Xem file gốc [tpos-pancake/css/tpos/tpos-comments.css](../../../tpos-pancake/css/tpos/tpos-comments.css) cho `.tpos-conversation-item`, `.tpos-conv-avatar`, `.session-index-badge`, `.channel-badge`, `.tpos-conv-info input`, `.tpos-conv-actions` (opacity:0 mặc định, hover thì opacity:1), `.tpos-status-badge`, `.debt-badge`. Các class đều đã liệt kê ở [01-html-css-shell.md](01-html-css-shell.md#3-visual-details-of-key-ui-pieces).

---

## Phase 9 — `tpos/tpos-realtime.js` (SSE per-campaign)

Mỗi campaign 1 EventSource. Auto-retry exponential backoff.

```javascript
(function (global) {
    'use strict';

    const MAX_RETRIES = 5;

    const TposRealtime = {
        startSSE(pageId, postId, pageName = '') {
            const state = window.TposState;
            const sseKey = `${pageId}_${postId}`;
            if (state._sseConnections.has(sseKey)) return;

            const connect = async () => {
                const token = await window.tposTokenManager.getToken();
                const url = `${state.proxyBaseUrl}/facebook/comments/stream?pageid=${pageId}&postId=${postId}&token=${encodeURIComponent(token)}`;
                const es = new EventSource(url);
                state._sseConnections.set(sseKey, es);
                const openedAt = Date.now();

                es.onopen = () => {
                    state.sseConnected = true;
                    this._updateStatus();
                };
                es.onmessage = (e) => this._handleMessage(e, pageName);
                es.onerror = () => {
                    es.close();
                    state._sseConnections.delete(sseKey);
                    const retryState = state._sseRetryState.get(sseKey) || { attempts: 0 };
                    if (Date.now() - openedAt < 2000) retryState.attempts++;
                    else retryState.attempts = 0;
                    state._sseRetryState.set(sseKey, retryState);
                    if (retryState.attempts < MAX_RETRIES) {
                        const delay = Math.min(60000, 3000 * 2 ** retryState.attempts) + Math.random() * 1000;
                        setTimeout(connect, delay);
                    }
                    state.sseConnected = state._sseConnections.size > 0;
                    this._updateStatus();
                };
            };
            connect();
        },

        stopSSE(pageId, postId) {
            const state = window.TposState;
            const keys = pageId && postId ? [`${pageId}_${postId}`] : [...state._sseConnections.keys()];
            keys.forEach((k) => {
                state._sseConnections.get(k)?.close();
                state._sseConnections.delete(k);
                state._sseRetryState.delete(k);
            });
            state.sseConnected = state._sseConnections.size > 0;
            this._updateStatus();
        },

        _handleMessage(event, pageName) {
            try {
                const msg = JSON.parse(event.data);
                // Expect: { id, from: {id, name, picture}, message, created_time, ... }
                window.eventBus?.emit('tpos:newComment', { comment: msg, pageName });
            } catch (e) { /* ignore heartbeat */ }
        },

        _updateStatus() {
            const indicator = document.getElementById('tposStatusIndicator');
            if (!indicator) return;
            const connected = window.TposState.sseConnected;
            const dot = indicator.querySelector('.status-dot');
            const text = indicator.querySelector('.status-text');
            if (dot) {
                dot.style.background = connected ? '#ef4444' : 'var(--gray-400)';
                dot.style.animation = connected ? 'pulse-dot 1.5s infinite' : 'none';
            }
            if (text) text.textContent = connected ? 'Live' : 'Offline';
        },
    };

    global.TposRealtime = TposRealtime;
})(typeof window !== 'undefined' ? window : globalThis);
```

Thêm animation vào `variables.css`:
```css
@keyframes pulse-dot {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.4; }
}
```

---

## Phase 10 — `tpos/tpos-customer-panel.js` + `tpos/tpos-init.js`

### `tpos-customer-panel.js` (rút gọn)

```javascript
(function (global) {
    'use strict';
    const modal = () => document.getElementById('customerInfoModal');

    const TposCustomerPanel = {
        async showCustomerInfo(fbUserId, customerName) {
            const state = window.TposState;
            const crmTeamId = state.selectedPage?.Id;
            if (!crmTeamId) return;

            const m = modal();
            m.classList.add('active');
            m.querySelector('.pk-modal-content').innerHTML = `
                <div class="pk-modal-header">
                    <h3 style="margin:0;">${SharedUtils.escapeHtml(customerName)}</h3>
                    <button class="btn-icon" onclick="this.closest('.pk-modal-overlay').classList.remove('active')">
                        <i data-lucide="x" style="width:14px;height:14px;"></i></button>
                </div>
                <div class="pk-modal-body"><div class="loading-spinner"></div></div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();

            try {
                const data = await window.TposApi.getPartnerInfo(crmTeamId, fbUserId);
                m.querySelector('.pk-modal-body').innerHTML = this._render(data);
            } catch (e) {
                m.querySelector('.pk-modal-body').innerHTML = `<p style="color:var(--danger);">Lỗi: ${e.message}</p>`;
            }
        },

        _render(data) {
            const p = data?.Partner || {};
            return `
                <div style="display:grid;gap:8px;font-size:13px;">
                    <div><b>SĐT:</b> ${SharedUtils.escapeHtml(p.Phone || '—')}</div>
                    <div><b>Địa chỉ:</b> ${SharedUtils.escapeHtml(p.Street || '—')}</div>
                    <div><b>Trạng thái:</b> ${SharedUtils.escapeHtml(p.Status?.Name || '—')}</div>
                    ${data.Order ? `<hr><div><b>Đơn gần nhất:</b> ${SharedUtils.escapeHtml(data.Order.Code)}</div>` : ''}
                    ${data.Debt ? `<div><b>Công nợ:</b> <span class="debt-badge">${SharedUtils.formatDebt(data.Debt)}</span></div>` : ''}
                </div>`;
        },
    };

    global.TposCustomerPanel = TposCustomerPanel;
})(typeof window !== 'undefined' ? window : globalThis);
```

### `tpos-init.js`

```javascript
(function (global) {
    'use strict';

    const TposColumnManager = {
        async initialize(containerId) {
            const state = window.TposState;
            state.containerId = containerId;
            state.startCacheCleanup();

            window.TposCommentList.renderContainer();
            this._wireEvents();

            try {
                await window.TposApi.loadCRMTeams();
                window.TposCommentList.renderCrmTeamOptions();
                this._restoreSelection();
            } catch (e) {
                console.error('[TPOS-INIT] loadCRMTeams failed:', e);
            }
        },

        _wireEvents() {
            window.eventBus.on('tpos:crmTeamChanged', (pageId) => this.onCrmTeamChange(pageId));
            window.eventBus.on('tpos:campaignsChanged', (ids) => this.onMultiCampaignChange(ids));
            window.eventBus.on('tpos:refreshRequested', () => this.refresh());
            window.eventBus.on('tpos:loadMoreRequested', () => this.loadMoreComments());
            window.eventBus.on('tpos:newComment', ({ comment, pageName }) => {
                window.TposState.comments.unshift({ ...comment, _pageName: pageName });
                window.TposCommentList.renderComments();
            });

            document.getElementById('btnTposRefresh')?.addEventListener('click', () => this.refresh());
        },

        async onCrmTeamChange(val) {
            const state = window.TposState;
            state.clearAllCaches();
            if (val === 'all') {
                await window.TposApi.loadLiveCampaignsFromAllPages();
            } else if (val) {
                const [teamId, pageId] = val.split(':');
                const page = state.allPages.find((p) => String(p.Id) === pageId);
                if (page) {
                    state.selectedPage = page;
                    state.savePageSelection(val);
                    await window.TposApi.loadLiveCampaigns(page.Facebook_PageId);
                }
            }
            window.TposCommentList.renderCampaignOptions();
        },

        async onMultiCampaignChange(campaignIds) {
            const state = window.TposState;
            state.selectedCampaignIds = campaignIds;
            state.saveCampaignSelection(campaignIds);
            state.comments = [];
            window.TposRealtime.stopSSE();

            for (const campId of campaignIds) {
                const camp = state.liveCampaigns.find((c) => c.Id === campId);
                if (!camp) continue;
                const pageId = camp.Facebook_UserId;
                const postId = camp.Facebook_LiveId;
                const page = state.allPages.find((p) => p.Facebook_PageId === pageId);
                // Load existing comments
                const { comments } = await window.TposApi.loadComments(pageId, postId);
                comments.forEach((c) => { c._pageObj = page; c._campaignId = campId; });
                state.comments.push(...comments);
                // Hydrate sessionIndex (TPOS) + preserve native-web
                const tposMap = await window.TposApi.loadSessionIndex(postId);
                for (const [k, v] of tposMap) {
                    if (state.sessionIndexMap.get(k)?.source === 'NATIVE_WEB') continue;
                    state.sessionIndexMap.set(k, v);
                }
                // Hydrate native orders for this post
                this._loadNativeOrders(postId);
                // Start SSE
                window.TposRealtime.startSSE(pageId, postId, page?.Facebook_PageName || '');
            }
            window.TposCommentList.renderComments();
        },

        async _loadNativeOrders(postId) {
            try {
                const resp = await window.NativeOrdersApi.list({ fbPostId: postId, limit: 1000 });
                for (const o of resp.orders || []) {
                    if (!o.fbUserId) continue;
                    window.TposState.sessionIndexMap.set(o.fbUserId, {
                        index: o.sessionIndex || '?', code: o.code, source: 'NATIVE_WEB',
                    });
                }
                window.TposCommentList.renderComments();
            } catch (e) { console.warn('loadNativeOrders failed', e); }
        },

        async loadMoreComments() {
            const state = window.TposState;
            if (!state.hasMore || state.isLoading) return;
            // TODO: per-campaign cursor tracking (see full code)
        },

        async refresh() {
            await this.onMultiCampaignChange(window.TposState.selectedCampaignIds);
        },

        _restoreSelection() {
            const val = window.TposState.getSavedPageSelection();
            const select = document.getElementById('tposCrmTeamSelect');
            if (val && select) {
                select.value = val;
                select.dispatchEvent(new Event('change'));
            }
        },
    };

    global.TposColumnManager = TposColumnManager;
})(typeof window !== 'undefined' ? window : globalThis);
```

### Wire vào `index.html`:
```html
<!-- TPOS modules -->
<script src="js/tpos/tpos-token-manager.js"></script>
<script src="js/tpos/tpos-state.js"></script>
<script src="js/tpos/tpos-api.js"></script>
<script src="js/tpos/tpos-native-orders-api.js"></script>
<script src="js/tpos/tpos-realtime.js"></script>
<script src="js/tpos/tpos-comment-list.js"></script>
<script src="js/tpos/tpos-customer-panel.js"></script>
<script src="js/tpos/tpos-init.js"></script>
```

### Verify Phase 5-10
Trong console:
```javascript
await window.tposTokenManager.getToken();   // trả access_token string
await window.TposApi.loadCRMTeams();        // populate state.crmTeams
window.TposColumnManager.initialize('tposContent');
// Chọn page trong dropdown → campaign list load
// Chọn campaign → comment render, SSE dot chuyển đỏ nháy
// Hover 1 comment → thấy 4 nút hành động bên phải
// Click nút giỏ tím → tạo đơn, icon đổi thành package-open tím
```

---

Xong cột TPOS. Tiếp sang [04-pancake-column.md](04-pancake-column.md).
