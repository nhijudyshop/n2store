// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * TPOS API Layer
 * All TPOS API calls extracted from tpos-chat.js
 * Dependencies: TposState (window.TposState), tposTokenManager (window.tposTokenManager)
 */

const TposApi = {
    _getWorkerUrl() {
        return window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    },
    /**
     * Get current TPOS token via token manager
     * @returns {Promise<string|null>}
     */
    async getToken() {
        if (window.tposTokenManager) {
            return await window.tposTokenManager.getToken();
        }
        return null;
    },

    /**
     * Authenticated fetch with auto-retry on 401
     * @param {string} url
     * @param {object} [options]
     * @returns {Promise<Response>}
     */
    async authenticatedFetch(url, options = {}) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('No token available');
        }

        let response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                ...options.headers,
            },
        });

        // Auto-retry on 401: refresh token and retry once
        if (response.status === 401) {
            console.log('[TPOS-API] Got 401, refreshing token and retrying...');
            if (window.tposTokenManager?.refresh) {
                await window.tposTokenManager.refresh();
                const newToken = await this.getToken();
                if (newToken) {
                    response = await fetch(url, {
                        ...options,
                        headers: {
                            Authorization: `Bearer ${newToken}`,
                            Accept: 'application/json',
                            ...options.headers,
                        },
                    });
                }
            }
        }

        return response;
    },

    // REWIRE helper: điền Facebook_UserName cho campaign (FB-live) từ allPages.
    _fillCampaignPageNames(camps, state) {
        if (!Array.isArray(camps) || !state?.allPages) return;
        const byId = new Map(state.allPages.map((p) => [String(p.Facebook_PageId), p.Name]));
        for (const c of camps) {
            if (!c.Facebook_UserName)
                c.Facebook_UserName = byId.get(String(c.Facebook_UserId)) || '';
        }
    },

    /**
     * Load CRM Teams with Pages (via proxy)
     * @returns {Promise<Array>}
     */
    async loadCRMTeams() {
        const state = window.TposState;
        // REWIRE (flag-gated): page list từ Pancake thay TPOS CRM teams.
        if (window.TposFbLiveSource?.enabled()) {
            try {
                const { crmTeams, allPages } = await window.TposFbLiveSource.fetchPagesAsCrmTeams();
                if (allPages.length) {
                    state.crmTeams = crmTeams;
                    state.allPages = allPages;
                    console.log('[TPOS-API] (FB-live) pages:', allPages.length);
                    return state.crmTeams;
                }
                console.warn('[TPOS-API] FB-live pages rỗng → fallback TPOS');
            } catch (e) {
                console.warn('[TPOS-API] FB-live pages fail → fallback TPOS:', e.message);
            }
        }
        try {
            const response = await this.authenticatedFetch(
                `${state.proxyBaseUrl}/facebook/crm-teams`
            );
            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            state.crmTeams = data.value || [];
            console.log('[TPOS-API] Loaded CRM Teams:', state.crmTeams.length);

            // Collect all pages
            state.allPages = [];
            state.crmTeams.forEach((team) => {
                if (team.Childs && team.Childs.length > 0) {
                    team.Childs.forEach((page) => {
                        if (page.Facebook_PageId && page.Facebook_TypeId === 'Page') {
                            state.allPages.push({
                                ...page,
                                teamId: team.Id,
                                teamName: team.Name,
                            });
                        }
                    });
                }
            });

            return state.crmTeams;
        } catch (error) {
            console.error('[TPOS-API] Error loading CRM Teams:', error);
            return [];
        }
    },

    /**
     * Load Live Campaigns for a specific page (via proxy)
     * @param {string} pageId - Facebook Page ID
     * @returns {Promise<Array>}
     */
    async loadLiveCampaigns(pageId) {
        const state = window.TposState;
        // REWIRE (flag-gated): live videos từ FB Graph thay TPOS live campaigns.
        if (window.TposFbLiveSource?.enabled()) {
            try {
                const camps = await window.TposFbLiveSource.fetchVideosAsCampaigns([pageId]);
                this._fillCampaignPageNames(camps, state);
                state.liveCampaigns = camps;
                console.log('[TPOS-API] (FB-live) campaigns:', camps.length);
                return state.liveCampaigns;
            } catch (e) {
                console.warn('[TPOS-API] FB-live campaigns fail → fallback TPOS:', e.message);
            }
        }
        try {
            const response = await this.authenticatedFetch(
                `${state.proxyBaseUrl}/facebook/live-campaigns?top=20`
            );
            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            state.liveCampaigns = (data.value || []).filter(
                (c) => c.Facebook_UserId === pageId && c.Facebook_LiveId
            );
            console.log('[TPOS-API] Loaded Live Campaigns:', state.liveCampaigns.length);
            return state.liveCampaigns;
        } catch (error) {
            console.error('[TPOS-API] Error loading Live Campaigns:', error);
            return [];
        }
    },

    /**
     * Load Live Campaigns from ALL pages
     * @returns {Promise<Array>}
     */
    async loadLiveCampaignsFromAllPages() {
        const state = window.TposState;
        // REWIRE (flag-gated): live videos từ FB Graph cho tất cả page.
        if (window.TposFbLiveSource?.enabled()) {
            try {
                const ids = (state.allPages || []).map((p) => p.Facebook_PageId);
                const camps = await window.TposFbLiveSource.fetchVideosAsCampaigns(ids);
                this._fillCampaignPageNames(camps, state);
                state.liveCampaigns = camps;
                console.log('[TPOS-API] (FB-live) campaigns allPages:', camps.length);
                return state.liveCampaigns;
            } catch (e) {
                console.warn('[TPOS-API] FB-live campaigns(all) fail → fallback TPOS:', e.message);
            }
        }
        try {
            const response = await this.authenticatedFetch(
                `${state.proxyBaseUrl}/facebook/live-campaigns?top=50`
            );
            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            const allPageIds = state.allPages.map((p) => p.Facebook_PageId);
            state.liveCampaigns = (data.value || []).filter(
                (c) => allPageIds.includes(c.Facebook_UserId) && c.Facebook_LiveId
            );
            console.log(
                '[TPOS-API] Loaded Live Campaigns from all pages:',
                state.liveCampaigns.length
            );
            return state.liveCampaigns;
        } catch (error) {
            console.error('[TPOS-API] Error loading Live Campaigns:', error);
            return [];
        }
    },

    /**
     * Load comments for a post (via proxy, paginated)
     * @param {string} pageId
     * @param {string} postId
     * @param {string|null} afterCursor - Pagination cursor
     * @returns {Promise<{comments: Array, nextPageUrl: string|null}>}
     */
    async loadComments(pageId, postId, afterCursor = null) {
        const state = window.TposState;
        // REWIRE (flag-gated): nguồn comment FB Graph độc lập TPOS (web2-fb-live).
        // Lỗi bất kỳ → tự fallback xuống path TPOS bên dưới (không vỡ live).
        if (window.TposFbLiveSource?.enabled() && !afterCursor) {
            try {
                return await window.TposFbLiveSource.loadComments(pageId, postId);
            } catch (e) {
                console.warn('[TPOS-API] FB-live loadComments fail → fallback TPOS:', e.message);
            }
        }
        const token = await this.getToken();
        if (!token) throw new Error('No token');

        let url = `${state.proxyBaseUrl}/facebook/comments?pageid=${pageId}&postId=${postId}&limit=50`;
        if (afterCursor) {
            url += `&after=${encodeURIComponent(afterCursor)}`;
        }

        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
        };

        // One retry on transient 5xx/network errors (Cloudflare proxy often flaps)
        let response;
        let lastErr;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                response = await fetch(url, { headers });
                if (response.ok) break;
                if (response.status >= 500 && attempt === 0) {
                    await new Promise((r) => setTimeout(r, 800));
                    continue;
                }
                throw new Error(`API error: ${response.status}`);
            } catch (err) {
                lastErr = err;
                if (attempt === 0) {
                    await new Promise((r) => setTimeout(r, 800));
                    continue;
                }
                throw err;
            }
        }
        if (!response || !response.ok) {
            // Fallback chain: Pancake Graph → TPOS Archive.
            const fb = await this._fallbackChain(pageId, postId, afterCursor);
            if (fb) return fb;
            throw lastErr || new Error(`API error: ${response?.status ?? 'unknown'}`);
        }

        const data = await response.json();
        // Backend giờ trả 200 + empty data khi upstream 4xx/timeout (success=false).
        // Detect + chạy fallback chain.
        if (data && data.success === false && Array.isArray(data.data) && data.data.length === 0) {
            console.warn(
                `[TPOS-API] upstream ${data.upstream_status || 'timeout'} for post ${postId} → fallback chain`
            );
            const fb = await this._fallbackChain(pageId, postId, afterCursor);
            if (fb) return fb;
        }
        return {
            comments: data.data || [],
            nextPageUrl: data.paging?.next || null,
        };
    },

    // Fallback chain: thử Pancake Graph trước (FB live data) → TPOS Archive
    // (SaleOnline_Order — chỉ có comments của KH đã đặt order).
    async _fallbackChain(pageId, postId, afterCursor) {
        const pancake = await this._fallbackLoadCommentsFbGraph(pageId, postId, afterCursor);
        if (pancake && pancake.comments.length > 0) return pancake;
        // Pancake không có → TPOS Archive (orders).
        const archive = await this._fallbackLoadCommentsArchive(postId);
        if (archive && archive.comments.length > 0) return archive;
        return null;
    },

    // Fallback: gọi trực tiếp FB Graph API với Pancake page_access_token.
    // Dùng khi TPOS proxy fail (post bị xóa từ TPOS / TPOS lỗi).
    // Pancake token được cache trong PancakeTokenManager.pageAccessTokens.
    async _fallbackLoadCommentsFbGraph(pageId, postId, afterCursor = null) {
        try {
            if (!window.PancakeTokenManager?.getOrGeneratePageAccessToken) return null;
            const token = await window.PancakeTokenManager.getOrGeneratePageAccessToken(pageId);
            if (!token) return null;
            let url = `https://graph.facebook.com/${encodeURIComponent(postId)}/comments?access_token=${encodeURIComponent(token)}&limit=50&order=reverse_chronological&fields=from%7Bid%2Cname%2Cpicture%7D%2Cid%2Cmessage%2Ccreated_time%2Cattachment%2Ccan_hide%2Cis_hidden%2Ccan_remove`;
            if (afterCursor) url += `&after=${encodeURIComponent(afterCursor)}`;
            const r = await fetch(url, { credentials: 'omit' });
            if (!r.ok) return null;
            const d = await r.json();
            if (d.error) {
                console.warn('[TPOS-API] fallback FB Graph error:', d.error.message);
                return null;
            }
            console.log(
                `[TPOS-API] Fallback FB Graph: loaded ${d.data?.length || 0} comments for ${postId}`
            );
            return {
                comments: d.data || [],
                nextPageUrl: d.paging?.next || null,
            };
        } catch (e) {
            console.warn('[TPOS-API] fallback FB Graph fail:', e.message);
            return null;
        }
    },

    // Fallback: TPOS Archive — query SaleOnline_Order theo Facebook_PostId.
    // Mỗi order trở thành 1 "comment" với message=Note, name=Facebook_UserName.
    // Chỉ có comments của KH đã đặt order (không phải tất cả comments).
    // Hữu ích khi post bị xóa khỏi FB nhưng TPOS vẫn giữ orders forever.
    async _fallbackLoadCommentsArchive(postId) {
        try {
            const state = window.TposState;
            const token = await this.getToken();
            if (!token) return null;
            const r = await fetch(
                `${state.proxyBaseUrl}/facebook/comments-archive?postId=${encodeURIComponent(postId)}&top=200`,
                {
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                }
            );
            if (!r.ok) return null;
            const d = await r.json();
            if (!d.success || !Array.isArray(d.data)) return null;
            console.log(
                `[TPOS-API] Archive fallback: loaded ${d.data.length} comments-from-orders for ${postId}`
            );
            return {
                comments: d.data,
                nextPageUrl: null, // archive không paginate
            };
        } catch (e) {
            console.warn('[TPOS-API] fallback Archive fail:', e.message);
            return null;
        }
    },

    /**
     * Load SessionIndex (comment orders) for a post
     * Maps ASUID -> order info for displaying badges
     * @param {string} postId - Full post ID (pageId_postId)
     * @returns {Promise<Map>}
     */
    async loadSessionIndex(postId) {
        const state = window.TposState;
        const token = await this.getToken();
        if (!token) return new Map();

        const url = `${state.proxyBaseUrl}/facebook/comment-orders?postId=${postId}`;
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const data = await response.json();
        const orders = data.value || [];
        const map = new Map();

        orders.forEach((item) => {
            const asuid = item.asuid || item.id;
            if (asuid && item.orders && item.orders.length > 0) {
                const firstOrder = item.orders[0];
                map.set(asuid, {
                    index: firstOrder.index,
                    session: firstOrder.session,
                    code: firstOrder.code,
                });
            }
        });

        return map;
    },

    /**
     * Get partner info from TPOS API
     * @param {number|string} crmTeamId
     * @param {string} userId - Facebook user ID
     * @returns {Promise<object|null>}
     */
    async getPartnerInfo(crmTeamId, userId) {
        const state = window.TposState;
        const apiUrl = `${state.tposBaseUrl}/rest/v2.0/chatomni/info/${crmTeamId}_${userId}`;
        const response = await this.authenticatedFetch(apiUrl);
        if (!response.ok) return null;
        return await response.json();
    },

    /**
     * Update partner status via TPOS API
     * @param {number} partnerId
     * @param {string} statusValue - e.g. "#5cb85c_Bình thường"
     * @returns {Promise<boolean>}
     */
    async updatePartnerStatus(partnerId, statusValue) {
        const state = window.TposState;
        try {
            const apiUrl = `${state.tposBaseUrl}/odata/Partner(${partnerId})/ODataService.UpdateStatus`;
            const response = await this.authenticatedFetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=UTF-8' },
                body: JSON.stringify({ status: statusValue }),
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const statusText = statusValue.split('_')[1] || statusValue;
            if (window.notificationManager) {
                window.notificationManager.show(`Đã cập nhật trạng thái: ${statusText}`, 'success');
            }
            return true;
        } catch (error) {
            console.error('[TPOS-API] Error updating status:', error);
            if (window.notificationManager) {
                window.notificationManager.show(
                    `Lỗi cập nhật trạng thái: ${error.message}`,
                    'error'
                );
            }
            return false;
        }
    },

    /**
     * Update partner status via proxy (for inline list status updates)
     *
     * ⚠ INTENTIONAL CROSS-LAYER WRITE (Web 2.0 → TPOS):
     * Per user spec 2026-06-01, tpos-pancake là module DUY NHẤT trong Web 2.0
     * được phép WRITE sang TPOS Partner DB. Mục đích: 2-way sync KH info
     * (status, name, address) giữa Web 2.0 và TPOS — vì TPOS là kho data KH
     * chính của shop. Native-orders cũng có sync 1 chiều (read TPOS qua
     * getOrCreateCustomerFromTPOS) nhưng KHÔNG write TPOS.
     *
     * KHÔNG dùng cho đơn hàng / sản phẩm — chỉ KH info (status + identity).
     *
     * @param {number} partnerId
     * @param {string} statusValue
     * @returns {Promise<boolean>}
     */
    async updatePartnerStatusViaProxy(partnerId, statusValue) {
        const state = window.TposState;
        try {
            const apiUrl = `${state.workerUrl}/api/odata/Partner(${partnerId})/ODataService.UpdateStatus`;
            const response = await this.authenticatedFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8',
                    tposappversion: '6.1.8.1',
                },
                body: JSON.stringify({ status: statusValue }),
            });
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            return true;
        } catch (error) {
            console.error('[TPOS-API] Error updating status via proxy:', error);
            return false;
        }
    },

    /**
     * Save partner data via CreateUpdatePartner API
     * @param {string} userId
     * @param {object} fields - Fields to update (e.g. { Phone, Street })
     * @param {number} [teamId]
     * @returns {Promise<object>}
     */
    async savePartnerData(userId, fields, teamId) {
        const state = window.TposState;
        const partner = state.partnerCache.get(userId);
        if (!partner || !partner.Id) {
            throw new Error('Partner not found in cache');
        }

        const model = { ...partner, ...fields };

        // TPOS OData validation: sanitize partner payload before send.
        // (1) `Childs` declared as Edm.Collection — phải là array, không được null.
        // (2) `Status` declared as Edm.String — partner cache có khi trả -1 (number).
        // (3) `ExtraAddress` / `ExtraProperties` / `FacebookMap` là untyped complex
        //     objects → TPOS reject với 'untyped value ... invalid' nếu gửi mà thiếu
        //     @odata.type annotation. Cách an toàn nhất: drop trước khi POST (TPOS
        //     trả lại bản canonical sau khi save thành công, không cần round-trip).
        // (4) `@odata.*` annotations (vd `@odata.context`) lọt vào cache khi response
        //     trước đó trả. POST lại sẽ bị TPOS reject 'annotation not recognized
        //     at current position'. Drop hết key bắt đầu '@'.
        if (!Array.isArray(model.Childs)) model.Childs = [];
        if (typeof model.Status === 'number') model.Status = String(model.Status);
        delete model.ExtraAddress;
        delete model.ExtraProperties;
        delete model.FacebookMap;
        for (const k of Object.keys(model)) {
            if (k.startsWith('@')) delete model[k];
        }

        const effectiveTeamId =
            teamId ||
            state.selectedTeamId ||
            state.selectedPage?.CRMTeamId ||
            state.selectedPage?.Id;

        const apiUrl = `${state.workerUrl}/api/odata/SaleOnline_Order/ODataService.CreateUpdatePartner`;
        const response = await this.authenticatedFetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;IEEE754Compatible=false;charset=UTF-8',
                tposappversion: '6.1.8.1',
                'x-requested-with': 'XMLHttpRequest',
            },
            body: JSON.stringify({ model, teamId: effectiveTeamId }),
        });

        if (!response.ok) {
            // Surface server error body để toast hiển thị thông tin có ý nghĩa
            // (trước đây chỉ "API error: 400" mơ hồ → user không biết lỗi gì).
            let detail = '';
            try {
                const errBody = await response.json();
                detail = errBody?.error?.message || JSON.stringify(errBody).slice(0, 200);
            } catch {
                /* non-json error body */
            }
            throw new Error(`API ${response.status}${detail ? ': ' + detail : ''}`);
        }

        const result = await response.json();
        // Update cache with returned data
        state.partnerCache.set(userId, result);
        return result;
    },

    /**
     * Save customer to "Lưu Tpos" list on Pancake side
     * @param {string} customerId
     * @param {string} customerName
     * @param {string|null} notes
     * @returns {Promise<object>}
     */
    async saveToTpos(customerId, customerName, notes = null) {
        const state = window.TposState;
        const requestBody = {
            customerId,
            customerName,
            pageId: state.selectedPage?.id || null,
            pageName: state.selectedPage?.name || null,
            savedBy: 'TPOS Comment',
            notes: notes || null,
        };

        const response = await fetch(`${state.tposPancakeUrl}/api/tpos-saved`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        return await response.json();
    },

    /**
     * Hide or show a Facebook comment via TPOS API
     * @param {string} pageId - Facebook page ID
     * @param {string} commentId - Facebook comment ID
     * @param {boolean} hide - true to hide, false to show
     * @returns {Promise<boolean>}
     */
    async hideComment(pageId, commentId, hide) {
        const token = await this.getToken();
        if (!token) return false;

        try {
            const url = `${TposApi._getWorkerUrl()}/api/rest/v2.0/facebook-graph/comment/hide`;
            const response = await this.authenticatedFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageid: pageId,
                    commentId: commentId,
                    is_hidden: hide,
                }),
            });
            return response.ok;
        } catch (error) {
            console.error('[TPOS-API] hideComment error:', error);
            return false;
        }
    },

    /**
     * Reply to a Facebook comment
     * @param {string} pageId - Facebook page ID
     * @param {string} commentId - Facebook comment ID
     * @param {string} message - Reply text
     * @returns {Promise<object|null>}
     */
    async replyToComment(pageId, commentId, message) {
        const token = await this.getToken();
        if (!token) return null;

        try {
            const url = `${TposApi._getWorkerUrl()}/api/rest/v2.0/facebook-graph/comment/reply`;
            const response = await this.authenticatedFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageid: pageId,
                    commentId: commentId,
                    message: message,
                }),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('[TPOS-API] replyToComment error:', error);
            return null;
        }
    },

    /**
     * Get order details for a customer's Facebook user ID
     * @param {string} fbUserId - Facebook AS User ID
     * @param {string} postId - Full post ID (pageId_postId)
     * @returns {Promise<object|null>}
     */
    async getOrderForUser(fbUserId, postId) {
        const token = await this.getToken();
        if (!token) return null;

        try {
            const url = `${TposApi._getWorkerUrl()}/api/odata/SaleOnline_Order/ODataService.GetViewV2?$filter=Facebook_ASUserId eq '${fbUserId}'&$expand=OrderLines($expand=Product),Partner&$top=1&$orderby=DateCreated desc`;
            const response = await this.authenticatedFetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            const items = data.value || [];
            return items.length > 0 ? items[0] : null;
        } catch (error) {
            console.error('[TPOS-API] getOrderForUser error:', error);
            return null;
        }
    },

    // confirmOrder / cancelOrder REMOVED — not used by this page.
    // createOrderFromComment REMOVED — tpos-pancake page now creates
    // orders via NativeOrdersApi.createFromComment() (PostgreSQL, not TPOS).
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.TposApi = TposApi;
}
