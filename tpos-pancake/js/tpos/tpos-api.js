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

    /**
     * Load CRM Teams with Pages (via proxy)
     * @returns {Promise<Array>}
     */
    async loadCRMTeams() {
        const state = window.TposState;
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
            throw lastErr || new Error(`API error: ${response?.status ?? 'unknown'}`);
        }

        const data = await response.json();
        return {
            comments: data.data || [],
            nextPageUrl: data.paging?.next || null,
        };
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

        if (!response.ok) throw new Error(`API error: ${response.status}`);

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

    /**
     * Confirm an order
     * @param {string} orderId
     * @returns {Promise<boolean>}
     */
    async confirmOrder(orderId) {
        try {
            const url = `${TposApi._getWorkerUrl()}/api/odata/SaleOnline_Order/ODataService.ActionConfirm`;
            const response = await this.authenticatedFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [orderId] }),
            });
            return response.ok;
        } catch (error) {
            console.error('[TPOS-API] confirmOrder error:', error);
            return false;
        }
    },

    /**
     * Cancel an order
     * @param {string} orderId
     * @returns {Promise<boolean>}
     */
    async cancelOrder(orderId) {
        try {
            const url = `${TposApi._getWorkerUrl()}/api/odata/SaleOnline_Order/ODataService.ActionCancel`;
            const response = await this.authenticatedFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [orderId] }),
            });
            return response.ok;
        } catch (error) {
            console.error('[TPOS-API] cancelOrder error:', error);
            return false;
        }
    },

    /**
     * Create a SaleOnline_Order from a Facebook comment
     * @param {object} params
     * @param {number} params.crmTeamId - CRM Team ID
     * @param {string} params.userName - Facebook user name
     * @param {string} params.userId - Facebook AS User ID
     * @param {string} params.postId - Full post ID (pageId_postId)
     * @param {string} params.commentId - Facebook comment ID
     * @param {string} [params.phone] - Customer phone
     * @param {string} [params.address] - Customer address
     * @param {string} [params.note] - Order note
     * @returns {Promise<object|null>} Created order or null
     */
    async createOrderFromComment(params) {
        try {
            const url = `${TposApi._getWorkerUrl()}/api/odata/SaleOnline_Order`;
            const body = {
                CRMTeamId: params.crmTeamId,
                Facebook_UserName: params.userName,
                Facebook_ASUserId: params.userId,
                Facebook_PostId: params.postId,
                Facebook_CommentId: params.commentId,
            };
            if (params.note) body.Note = params.note;

            const response = await this.authenticatedFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[TPOS-API] createOrderFromComment error:', error);
            throw error;
        }
    },
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.TposApi = TposApi;
}
