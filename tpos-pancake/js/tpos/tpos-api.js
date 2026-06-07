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
        // Pancake pages ONLY (TPOS CRM teams đã gỡ — KHÔNG fallback).
        const state = window.TposState;
        try {
            const { crmTeams, allPages } = await window.TposFbLiveSource.fetchPagesAsCrmTeams();
            state.crmTeams = crmTeams;
            state.allPages = allPages;
            console.log('[TPOS-API] (Pancake) pages:', allPages.length);
            return state.crmTeams;
        } catch (error) {
            console.error('[TPOS-API] load pages (Pancake) fail:', error.message);
            state.crmTeams = [];
            state.allPages = [];
            return [];
        }
    },

    /**
     * Load Live Campaigns (= FB live videos) cho 1 page. FB Graph ONLY.
     */
    async loadLiveCampaigns(pageId) {
        const state = window.TposState;
        try {
            const camps = await window.TposFbLiveSource.fetchVideosAsCampaigns([pageId]);
            this._fillCampaignPageNames(camps, state);
            state.liveCampaigns = camps;
            console.log('[TPOS-API] (FB Graph) campaigns:', camps.length);
            return state.liveCampaigns;
        } catch (error) {
            console.error('[TPOS-API] load live campaigns fail:', error.message);
            state.liveCampaigns = [];
            return [];
        }
    },

    /**
     * Load Live Campaigns (= FB live videos) cho TẤT CẢ page. FB Graph ONLY.
     */
    async loadLiveCampaignsFromAllPages() {
        const state = window.TposState;
        try {
            const ids = (state.allPages || []).map((p) => p.Facebook_PageId);
            const camps = await window.TposFbLiveSource.fetchVideosAsCampaigns(ids);
            this._fillCampaignPageNames(camps, state);
            state.liveCampaigns = camps;
            console.log('[TPOS-API] (FB Graph) campaigns allPages:', camps.length);
            return state.liveCampaigns;
        } catch (error) {
            console.error('[TPOS-API] load live campaigns(all) fail:', error.message);
            state.liveCampaigns = [];
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
        // FB Graph ONLY (TPOS đã gỡ — KHÔNG fallback). afterCursor bỏ (FB-live
        // trả set comment gần nhất; live đang chạy lấy realtime qua poller).
        void afterCursor;
        return await window.TposFbLiveSource.loadComments(pageId, postId);
    },

    /**
     * Load SessionIndex (comment orders) for a post
     * Maps ASUID -> order info for displaying badges
     * @param {string} postId - Full post ID (pageId_postId)
     * @returns {Promise<Map>}
     */
    async loadSessionIndex(postId) {
        // TPOS comment-orders đã gỡ. Badge "đơn #N" trên comment nay đến từ
        // native_orders (TposInit.loadNativeOrdersForPost). Trả Map rỗng.
        void postId;
        return new Map();
    },

    // ── KH info từ kho warehouse Web 2.0 (TPOS chatomni/info đã gỡ) ─────
    async getPartnerInfo(crmTeamId, fbUserId) {
        void crmTeamId; // giữ chữ ký cũ; tra theo fb_id trong warehouse
        try {
            const base = TposApi._getWorkerUrl();
            const r = await fetch(`${base}/api/web2/customers/batch-by-fbid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fbIds: [String(fbUserId)] }),
            });
            const d = await r.json().catch(() => ({}));
            const c = d && d.data && d.data[String(fbUserId)];
            if (!c) return null;
            // partner-like shape (comment-list/customer-panel đọc Id/Name/Phone/Status/Street)
            return {
                Id: c.id,
                Name: c.name || '',
                Phone: c.phone || '',
                Street: c.address || '',
                Status: c.status || '',
                _web2: true,
            };
        } catch (e) {
            console.warn('[TPOS-API] getPartnerInfo (warehouse) fail:', e.message);
            return null;
        }
    },

    // resolve fb_id → warehouse id rồi PATCH.
    async _patchWarehouseByFb(fbUserId, patch) {
        const base = TposApi._getWorkerUrl();
        const r = await fetch(`${base}/api/web2/customers/batch-by-fbid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fbIds: [String(fbUserId)] }),
        });
        const d = await r.json().catch(() => ({}));
        const c = d && d.data && d.data[String(fbUserId)];
        if (!c || !c.id) return false;
        const pr = await fetch(`${base}/api/web2/customers/${c.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        return pr.ok;
    },

    // Cập nhật trạng thái KH → warehouse (TPOS UpdateStatus đã gỡ).
    // idOrWarehouseId = web2_customers.id (lấy từ getPartnerInfo). statusValue
    // dạng "#color_Label" → tách Label.
    async updatePartnerStatus(warehouseId, statusValue) {
        const status =
            String(statusValue || '')
                .split('_')
                .slice(1)
                .join('_') || statusValue;
        try {
            const base = TposApi._getWorkerUrl();
            const r = await fetch(`${base}/api/web2/customers/${warehouseId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (r.ok && window.notificationManager) {
                window.notificationManager.show(`Đã cập nhật trạng thái: ${status}`, 'success');
            }
            return r.ok;
        } catch (error) {
            console.error('[TPOS-API] updatePartnerStatus (warehouse) fail:', error.message);
            return false;
        }
    },
    async updatePartnerStatusViaProxy(warehouseId, statusValue) {
        return this.updatePartnerStatus(warehouseId, statusValue);
    },

    // Lưu SĐT/địa chỉ KH → warehouse (TPOS CreateUpdatePartner đã gỡ).
    async savePartnerData(fbUserId, fields) {
        const patch = {};
        if (fields.Phone !== undefined) patch.phone = fields.Phone;
        if (fields.Street !== undefined) patch.address = fields.Street;
        let ok = await this._patchWarehouseByFb(fbUserId, patch);
        if (!ok && fields.Phone) {
            // chưa có trong kho → upsert theo phone + link fb
            try {
                const base = TposApi._getWorkerUrl();
                await fetch(`${base}/api/web2/customers/upsert`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: fields.Phone,
                        address: fields.Street,
                        fbId: fbUserId,
                    }),
                });
                ok = true;
            } catch (e) {
                /* ignore */
            }
        }
        return { ok };
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

    // Ẩn/hiện comment FB → Pancake (TPOS facebook-graph đã gỡ).
    async hideComment(pageId, commentId, hide) {
        void hide; // Pancake hideComment chỉ ẩn; show không hỗ trợ qua API public
        try {
            return !!(await window.PancakeAPI?.hideComment(pageId, commentId));
        } catch (error) {
            console.error('[TPOS-API] hideComment (Pancake) fail:', error.message);
            return false;
        }
    },

    // Trả lời comment → Pancake private reply (TPOS reply đã gỡ).
    async replyToComment(pageId, commentId, message) {
        try {
            return await window.PancakeAPI?.privateReplyN2Store(pageId, commentId, message);
        } catch (error) {
            console.error('[TPOS-API] replyToComment (Pancake) fail:', error.message);
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
