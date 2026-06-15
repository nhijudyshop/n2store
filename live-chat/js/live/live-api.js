// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Live API Layer
 * All Live API calls extracted from live-chat.js
 * Dependencies: LiveState (window.LiveState), LiveSource, PancakeAPI
 */

const LiveApi = {
    _getWorkerUrl() {
        return window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    },
    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho route soft-gated (WEB2_AUTH_ENFORCE).
    // Không token (chưa login web2) → bỏ qua header, request vẫn đi (server enforce → 401).
    _w2AuthHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* no token */
        }
        return h;
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
        // Pancake pages ONLY (Live CRM teams đã gỡ — KHÔNG fallback).
        const state = window.LiveState;
        try {
            const { crmTeams, allPages } = await window.LiveSource.fetchPagesAsCrmTeams();
            state.crmTeams = crmTeams;
            state.allPages = allPages;
            console.log('[Live-API] (Pancake) pages:', allPages.length);
            return state.crmTeams;
        } catch (error) {
            console.error('[Live-API] load pages (Pancake) fail:', error.message);
            state.crmTeams = [];
            state.allPages = [];
            return [];
        }
    },

    /**
     * Load Live Campaigns (= FB live videos) cho 1 page. FB Graph ONLY.
     */
    async loadLiveCampaigns(pageId) {
        const state = window.LiveState;
        try {
            state.liveCampaignCursors = {}; // reset phân trang khi đổi page
            const { campaigns, cursors } = await window.LiveSource.fetchVideosAsCampaigns(
                [pageId],
                {
                    cursors: state.liveCampaignCursors,
                }
            );
            this._fillCampaignPageNames(campaigns, state);
            state.liveCampaigns = campaigns;
            state.liveCampaignCursors = cursors;
            console.log('[Live-API] (FB Graph) campaigns:', campaigns.length);
            return state.liveCampaigns;
        } catch (error) {
            console.error('[Live-API] load live campaigns fail:', error.message);
            state.liveCampaigns = [];
            state.liveCampaignCursors = {};
            return [];
        }
    },

    /**
     * Load Live Campaigns (= FB live videos) cho TẤT CẢ page. FB Graph ONLY.
     */
    async loadLiveCampaignsFromAllPages() {
        const state = window.LiveState;
        try {
            state.liveCampaignCursors = {}; // reset phân trang khi đổi page
            const ids = (state.allPages || []).map((p) => p.Facebook_PageId);
            const { campaigns, cursors } = await window.LiveSource.fetchVideosAsCampaigns(ids, {
                cursors: state.liveCampaignCursors,
            });
            this._fillCampaignPageNames(campaigns, state);
            state.liveCampaigns = campaigns;
            state.liveCampaignCursors = cursors;
            console.log('[Live-API] (FB Graph) campaigns allPages:', campaigns.length);
            return state.liveCampaigns;
        } catch (error) {
            console.error('[Live-API] load live campaigns(all) fail:', error.message);
            state.liveCampaigns = [];
            state.liveCampaignCursors = {};
            return [];
        }
    },

    /**
     * Tải THÊM bài livestream cũ hơn (cuộn dropdown campaign). Dùng cursor
     * thời gian trong state.liveCampaignCursors. Dedupe theo Id, append + sort
     * desc vào state.liveCampaigns.
     * @returns {Promise<{added: Array, hasMore: boolean}>}
     */
    async loadMoreLiveCampaigns() {
        const state = window.LiveState;
        const cursors = state.liveCampaignCursors || {};
        const pageIds = Object.keys(cursors).filter((pid) => !cursors[pid].done);
        if (!pageIds.length) return { added: [], hasMore: false };
        try {
            const { campaigns } = await window.LiveSource.fetchVideosAsCampaigns(pageIds, {
                cursors, // mutated tại chỗ
            });
            this._fillCampaignPageNames(campaigns, state);
            const have = new Set(state.liveCampaigns.map((c) => c.Id));
            const added = campaigns.filter((c) => !have.has(c.Id));
            if (added.length) {
                state.liveCampaigns = state.liveCampaigns.concat(added);
                state.liveCampaigns.sort(
                    (a, b) =>
                        SharedUtils.toEpochMs(b.DateCreated) - SharedUtils.toEpochMs(a.DateCreated)
                );
            }
            const hasMore = Object.values(state.liveCampaignCursors).some((c) => !c.done);
            console.log('[Live-API] load more campaigns:', added.length, 'hasMore:', hasMore);
            return { added, hasMore };
        } catch (error) {
            console.error('[Live-API] load more campaigns fail:', error.message);
            return { added: [], hasMore: false };
        }
    },

    /** Còn bài livestream cũ hơn để tải thêm? */
    hasMoreLiveCampaigns() {
        const cursors = window.LiveState.liveCampaignCursors || {};
        return Object.values(cursors).some((c) => !c.done);
    },

    /**
     * Load comments for a post (via proxy, paginated)
     * @param {string} pageId
     * @param {string} postId
     * @param {string|null} afterCursor - Pagination cursor
     * @returns {Promise<{comments: Array, nextPageUrl: string|null}>}
     */
    async loadComments(pageId, postId, afterCursor = null) {
        // FB Graph ONLY (Live đã gỡ — KHÔNG fallback). afterCursor bỏ (FB-live
        // trả set comment gần nhất; live đang chạy lấy realtime qua poller).
        void afterCursor;
        return await window.LiveSource.loadComments(pageId, postId);
    },

    /**
     * Load SessionIndex (comment orders) for a post
     * Maps ASUID -> order info for displaying badges
     * @param {string} postId - Full post ID (pageId_postId)
     * @returns {Promise<Map>}
     */
    async loadSessionIndex(postId) {
        // Live comment-orders đã gỡ. Badge "đơn #N" trên comment nay đến từ
        // native_orders (LiveInit.loadNativeOrdersForPost). Trả Map rỗng.
        void postId;
        return new Map();
    },

    // ── KH info từ kho warehouse Web 2.0 (Live chatomni/info đã gỡ) ─────
    // 2026-06-12: bỏ tham số crmTeamId (di tích cũ, từng bị ignore) — tra
    // theo fb_id trong warehouse.
    async getPartnerInfo(fbUserId) {
        // NGUỒN DUY NHẤT: Web2CustomerStore (gom 2026-06-15). Fallback dưới nếu chưa load.
        if (window.Web2CustomerStore) {
            const c = await window.Web2CustomerStore.getByFbId(fbUserId);
            return c
                ? {
                      Id: c.id,
                      Name: c.name || '',
                      Phone: c.phone || '',
                      Street: c.address || '',
                      Status: c.status || '',
                      _web2: true,
                  }
                : null;
        }
        try {
            const base = LiveApi._getWorkerUrl();
            const r = await fetch(`${base}/api/web2/customers/batch-by-fbid`, {
                method: 'POST',
                headers: LiveApi._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ fbIds: [String(fbUserId)] }),
                signal: AbortSignal.timeout(15000),
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
            console.warn('[Live-API] getPartnerInfo (warehouse) fail:', e.message);
            return null;
        }
    },

    // Batch tra KH warehouse theo NHIỀU fb_id trong 1 request (chống N+1).
    // Trả Map<fbId, partnerLike|null>. Chunk 500 (cap endpoint).
    async getPartnerInfoBatch(fbUserIds) {
        const out = new Map();
        const ids = Array.from(new Set((fbUserIds || []).map(String).filter(Boolean)));
        if (!ids.length) return out;
        // NGUỒN DUY NHẤT: Web2CustomerStore (gom 2026-06-15).
        if (window.Web2CustomerStore) {
            const m = await window.Web2CustomerStore.batchByFbIds(ids);
            for (const id of ids) {
                const c = m.get(id);
                out.set(
                    id,
                    c
                        ? {
                              Id: c.id,
                              Name: c.name || '',
                              Phone: c.phone || '',
                              Street: c.address || '',
                              Status: c.status || '',
                              _web2: true,
                          }
                        : null
                );
            }
            return out;
        }
        const base = LiveApi._getWorkerUrl();
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            try {
                const r = await fetch(`${base}/api/web2/customers/batch-by-fbid`, {
                    method: 'POST',
                    headers: LiveApi._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ fbIds: chunk }),
                    signal: AbortSignal.timeout(20000),
                });
                const d = await r.json().catch(() => ({}));
                const data = (d && d.data) || {};
                for (const id of chunk) {
                    const c = data[id];
                    out.set(
                        id,
                        c
                            ? {
                                  Id: c.id,
                                  Name: c.name || '',
                                  Phone: c.phone || '',
                                  Street: c.address || '',
                                  Status: c.status || '',
                                  _web2: true,
                              }
                            : null
                    );
                }
            } catch (e) {
                console.warn('[Live-API] getPartnerInfoBatch (warehouse) fail:', e.message);
            }
        }
        return out;
    },

    // resolve fb_id → warehouse id rồi PATCH.
    async _patchWarehouseByFb(fbUserId, patch) {
        // NGUỒN DUY NHẤT: Web2CustomerStore (gom 2026-06-15).
        if (window.Web2CustomerStore) return window.Web2CustomerStore.patchByFbId(fbUserId, patch);
        const base = LiveApi._getWorkerUrl();
        const r = await fetch(`${base}/api/web2/customers/batch-by-fbid`, {
            method: 'POST',
            headers: LiveApi._w2AuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ fbIds: [String(fbUserId)] }),
            signal: AbortSignal.timeout(15000),
        });
        const d = await r.json().catch(() => ({}));
        const c = d && d.data && d.data[String(fbUserId)];
        if (!c || !c.id) return false;
        const pr = await fetch(`${base}/api/web2/customers/${c.id}`, {
            method: 'PATCH',
            headers: LiveApi._w2AuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(patch),
            signal: AbortSignal.timeout(15000),
        });
        return pr.ok;
    },

    // Cập nhật trạng thái KH → warehouse (Live UpdateStatus đã gỡ).
    // idOrWarehouseId = web2_customers.id (lấy từ getPartnerInfo). statusValue
    // dạng "#color_Label" → tách Label.
    async updatePartnerStatus(warehouseId, statusValue) {
        const status =
            String(statusValue || '')
                .split('_')
                .slice(1)
                .join('_') || statusValue;
        try {
            let ok;
            // NGUỒN DUY NHẤT: Web2CustomerStore (gom 2026-06-15).
            if (window.Web2CustomerStore) {
                ok = await window.Web2CustomerStore.updateStatus(warehouseId, status);
            } else {
                const base = LiveApi._getWorkerUrl();
                const r = await fetch(`${base}/api/web2/customers/${warehouseId}`, {
                    method: 'PATCH',
                    headers: LiveApi._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ status }),
                    signal: AbortSignal.timeout(15000),
                });
                ok = r.ok;
            }
            if (ok && window.notificationManager) {
                window.notificationManager.show(`Đã cập nhật trạng thái: ${status}`, 'success');
            }
            return ok;
        } catch (error) {
            console.error('[Live-API] updatePartnerStatus (warehouse) fail:', error.message);
            return false;
        }
    },
    async updatePartnerStatusViaProxy(warehouseId, statusValue) {
        return this.updatePartnerStatus(warehouseId, statusValue);
    },

    // Lưu SĐT/địa chỉ KH → warehouse (Live CreateUpdatePartner đã gỡ).
    async savePartnerData(fbUserId, fields) {
        const patch = {};
        if (fields.Phone !== undefined) patch.phone = fields.Phone;
        if (fields.Street !== undefined) patch.address = fields.Street;
        let ok = await this._patchWarehouseByFb(fbUserId, patch);
        if (!ok && fields.Phone) {
            // chưa có trong kho → upsert theo phone + link fb
            if (window.Web2CustomerStore) {
                const r = await window.Web2CustomerStore.upsert({
                    phone: fields.Phone,
                    address: fields.Street,
                    fbId: fbUserId,
                });
                ok = !!(r && r.ok);
            } else {
                try {
                    const base = LiveApi._getWorkerUrl();
                    await fetch(`${base}/api/web2/customers/upsert`, {
                        method: 'POST',
                        headers: LiveApi._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({
                            phone: fields.Phone,
                            address: fields.Street,
                            fbId: fbUserId,
                        }),
                        signal: AbortSignal.timeout(15000),
                    });
                    ok = true;
                } catch (e) {
                    /* ignore */
                }
            }
        }
        return { ok };
    },

    /**
     * Save customer to "Lưu Live" list on Pancake side
     * @param {string} customerId
     * @param {string} customerName
     * @param {string|null} notes
     * @returns {Promise<object>}
     */
    async saveToLive(customerId, customerName, notes = null) {
        const state = window.LiveState;
        const requestBody = {
            customerId,
            customerName,
            pageId: state.selectedPage?.id || null,
            pageName: state.selectedPage?.name || null,
            savedBy: 'Live Comment',
            notes: notes || null,
        };

        try {
            // 2026-06-12: /api/live-saved trên relay KHÔNG tồn tại (404 vĩnh viễn —
            // audit 3H8). Route mới: web2-live-comments/saved (web2Db).
            const response = await fetch(`${state.workerUrl}/api/web2-live-comments/saved`, {
                method: 'POST',
                // ENFORCE-PREP (2026-06-12)
                headers: LiveApi._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
                throw new Error(`saveToLive HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            throw new Error(`[Live-API] saveToLive fail (${customerId}): ${error.message}`);
        }
    },

    // Ẩn/hiện comment FB → Pancake (Live facebook-graph đã gỡ).
    async hideComment(pageId, commentId, hide) {
        void hide; // Pancake hideComment chỉ ẩn; show không hỗ trợ qua API public
        try {
            return !!(await window.PancakeAPI?.hideComment(pageId, commentId));
        } catch (error) {
            console.error('[Live-API] hideComment (Pancake) fail:', error.message);
            return false;
        }
    },

    // Trả lời comment → Pancake private reply (Live reply đã gỡ).
    async replyToComment(pageId, commentId, message) {
        try {
            return await window.PancakeAPI?.privateReplyN2Store(pageId, commentId, message);
        } catch (error) {
            console.error('[Live-API] replyToComment (Pancake) fail:', error.message);
            return null;
        }
    },

    // confirmOrder / cancelOrder REMOVED — not used by this page.
    // createOrderFromComment REMOVED — live-chat page now creates
    // orders via NativeOrdersApi.createFromComment() (PostgreSQL, not Live).
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.LiveApi = LiveApi;
}
