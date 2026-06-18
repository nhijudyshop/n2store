// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Column Initializer — DATA / LIFECYCLE module.
 *
 * Tách MOVE-only từ live-init.js (2026-06-19). Object.assign vào CÙNG object
 * window.LiveColumnManager (dựng shell ở live-init-state.js). CHỨA:
 *   - Resolve selected postIds + delta fetch (LiveCommentsStream delegate + legacy)
 *   - Wait Pancake accounts, DB row → comment mapper (_dbRowToComment / _mapDbComment)
 *   - Auto-save comments → DB, load + refresh, partner info + alt-phone capture,
 *     harvest customers, debt, toggle hide, debt display settings
 *   - destroy() / cleanup
 *
 * Load SAU live-init-state.js + live-init-wiring.js, TRƯỚC init-entry.
 *
 * Dependencies: LiveState, LiveApi, LiveCommentList, LiveRealtime, LiveCommentsStream,
 *   LiveCustomerSync, NativeOrdersApi, sharedDebtManager, pancakeTokenManager,
 *   Web2Chat, Web2SSE, notificationManager, SharedUtils
 */
(function () {
    'use strict';
    const NS = window._LiveInit;
    const _liveVideosCachePerPage = NS._liveVideosCachePerPage;
    const _resolveCampaignLivePosts = NS._resolveCampaignLivePosts;

    Object.assign(window.LiveColumnManager, {
        /**
         * Delta fetch comment livestream mới (SSE-driven). GET DB với since=
         * _lastCommentMaxMs cho các post đang chọn → map → prepend incremental.
         * Best-effort; lỗi không phá list đang hiển thị.
         */
        /**
         * Resolve tập postId của các campaign đang chọn (dùng cho delta fetch engine
         * + warm-up). Tách ra để LiveCommentsStream.getPostIds() gọi.
         */
        _resolveSelectedPostIds() {
            const state = window.LiveState;
            const ids = state.selectedCampaignIds ? Array.from(state.selectedCampaignIds) : [];
            if (!ids.length) return [];
            const campaigns = ids
                .map((id) => state.liveCampaigns.find((c) => c.Id === id))
                .filter(Boolean);
            const postIdSet = new Set();
            for (const campaign of campaigns) {
                const pageLiveVideos =
                    _liveVideosCachePerPage.get(campaign.Facebook_UserId)?.videos || [];
                let livePosts = _resolveCampaignLivePosts(
                    campaign,
                    state.liveCampaigns,
                    pageLiveVideos
                );
                if (livePosts.length === 0 && campaign.Facebook_LiveId) {
                    livePosts = [{ objectId: campaign.Facebook_LiveId }];
                }
                for (const lp of livePosts) if (lp.objectId) postIdSet.add(lp.objectId);
            }
            return [...postIdSet];
        },

        /**
         * Delta fetch comment livestream mới — DELEGATE sang LiveCommentsStream shared
         * (engine dùng chung desktop + mobile). Giữ tên cho caller cũ; fallback legacy
         * (cursor _lastUpdatedMaxMs/_lastCommentMaxMs) nếu engine chưa load.
         */
        async _fetchLiveCommentDelta() {
            if (this._liveStream) {
                this._liveStream.fetchNow();
                return;
            }
            const state = window.LiveState;
            if (window.LiveColumnManager?._origComments) return;
            const postIds = this._resolveSelectedPostIds();
            if (!postIds.length) return;
            if (!this._lastCommentMaxMs && !this._lastUpdatedMaxMs) return;
            const sinceUpdated = Math.max(0, (this._lastUpdatedMaxMs || 0) - 3000);
            const cursorParam = this._lastUpdatedMaxMs
                ? `sinceUpdated=${sinceUpdated}`
                : `since=${this._lastCommentMaxMs || 0}`;
            try {
                const resp = await fetch(
                    `${state.workerUrl}/api/web2-live-comments?postIds=${encodeURIComponent(
                        postIds.join(',')
                    )}&${cursorParam}&limit=2000`,
                    { signal: AbortSignal.timeout(15000) }
                );
                const j = await resp.json();
                if (!j.success || !Array.isArray(j.data) || j.data.length === 0) return;
                const mapped = j.data.map((row) => this._dbRowToComment(row));
                this._lastCommentMaxMs = mapped.reduce((mx, c) => {
                    const t = SharedUtils.toEpochMs(c.created_time);
                    return t > mx ? t : mx;
                }, this._lastCommentMaxMs || 0);
                this._lastUpdatedMaxMs = mapped.reduce(
                    (mx, c) => (c._updatedAt > mx ? c._updatedAt : mx),
                    this._lastUpdatedMaxMs || 0
                );
                window.LiveCommentList.prependComments(mapped);
            } catch (e) {
                console.warn('[Live-INIT] live comment delta fetch fail:', e.message);
            }
        },

        /**
         * Chờ Pancake account JWT sẵn sàng (token-manager + web2-chat-client sync đều async).
         */
        async _waitForPancakeAccounts(timeoutMs) {
            const isExpired = (exp) => {
                if (!exp) return false; // không rõ exp → coi như còn dùng được
                return Date.now() / 1000 >= exp - 60;
            };
            // Account hết hạn CŨNG có .token → chỉ coi sẵn sàng khi activeAccountId trỏ
            // tới account có token CÒN HẠN.
            const ready = () => {
                const tm = window.pancakeTokenManager;
                if (!tm) return false;
                const a = (tm.accounts || {})[tm.activeAccountId];
                return !!(tm.activeAccountId && a && a.token && !isExpired(a.exp));
            };

            // initialize() nạp localStorage (gồm cache 'pancake_all_accounts') → nhanh.
            try {
                if (window.pancakeTokenManager?.initialize) {
                    await window.pancakeTokenManager.initialize();
                }
            } catch (e) {
                console.warn('[Live-INIT] token init warn:', e.message);
            }

            // FAST PATH: cache localStorage đã có account còn hạn → dùng NGAY, sync
            // refresh chạy nền (không chặn). Lần sau vào load campaign tức thì.
            if (ready()) {
                if (window.Web2Chat?.syncFromRenderDB) {
                    window.Web2Chat.syncFromRenderDB({ force: false }).catch(() => {});
                }
                return true;
            }

            // SLOW PATH (lần đầu / cache hết hạn): await sync lấy account hợp lệ.
            try {
                if (window.Web2Chat?.syncFromRenderDB) {
                    await window.Web2Chat.syncFromRenderDB({ force: false });
                }
            } catch (e) {
                console.warn('[Live-INIT] syncFromRenderDB warn:', e.message);
            }
            const start = Date.now();
            while (!ready() && Date.now() - start < timeoutMs) {
                await new Promise((r) => setTimeout(r, 300));
            }
            return ready();
        },

        // Map 1 row web2_live_comments (DB) → comment shape FB-native cho renderer.
        // NGUỒN DUY NHẤT map DB row → comment (dùng cả load đầu + SSE delta prepend).
        _dbRowToComment(row) {
            const state = window.LiveState;
            const pageObj =
                (state.allPages || []).find(
                    (p) => String(p.Facebook_PageId) === String(row.page_id)
                ) || null;
            return {
                id: row.id,
                from: {
                    id: row.fb_id || null,
                    name: row.customer_name || '',
                    picture: row.avatar ? { data: { url: row.avatar } } : undefined,
                },
                message: row.message || '',
                created_time: row.created_time || null,
                parent: null,
                post_id: row.post_id || null,
                _conv: true,
                _hasOrder: !!row.has_order,
                phone: row.phone || '',
                address: row.address || '',
                _phones: row.phone ? [{ phone_number: row.phone }] : [],
                _pageName: row.page_name || pageObj?.Name || '',
                _campaignId: row.campaign_id || null,
                campaign_id: row.campaign_id || null,
                _pageId: row.page_id || null,
                _pageObj: pageObj,
                _postId: row.post_id || null,
                _fromDb: true,
                // Epoch ms server gán mỗi upsert — cursor delta SSE (xem _fetchLiveCommentDelta).
                _updatedAt: Number(row.updated_at) || 0,
            };
        },

        // Backward-compat alias: live-campaign-manager.js gọi _mapDbComment.
        // Cùng 1 mapper (_dbRowToComment là tên canonical).
        _mapDbComment(row) {
            return this._dbRowToComment(row);
        },

        // Auto-save comment live-fetch vào web2_live_comments (best-effort, fire-and-forget).
        async _saveCommentsToDb(comments) {
            try {
                const payload = comments
                    .slice(0, 2000)
                    .map((c) => ({
                        id: c.id,
                        postId: c._postId,
                        pageId: c._pageId,
                        pageName: c._pageName,
                        fbId: c.from?.id,
                        name: c.from?.name,
                        avatar: c.from?.picture?.data?.url || null,
                        message: c.message,
                        createdTime: c.created_time,
                        phone:
                            (c._phones &&
                                c._phones[0] &&
                                (c._phones[0].phone_number || c._phones[0].phone)) ||
                            null,
                        hasOrder: !!c._hasOrder,
                    }))
                    .filter((c) => c.id);
                if (!payload.length) return;
                await fetch(`${window.LiveState.workerUrl}/api/web2-live-comments/bulk`, {
                    method: 'POST',
                    // ENFORCE-PREP (2026-06-12)
                    headers: window.LiveColumnManager._w2AuthHeaders({
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify({ comments: payload }),
                    signal: AbortSignal.timeout(15000),
                });
            } catch (e) {
                console.warn('[Live-INIT] saveCommentsToDb fail:', e.message);
            }
        },

        /**
         * Load comments (legacy single-campaign entry — backward compat).
         *
         * Comment KHÔNG còn fetch qua Pancake conversations nữa (dedup-by-person).
         * Route qua onMultiCampaignChange (DB per-message). Giữ tên + chữ ký để
         * caller cũ (refresh / liveChatManager.loadComments) không vỡ. `append`
         * (pagination Pancake cũ) bỏ — DB load 1 lần đủ, infinite-scroll là client.
         * @param {boolean} [_append=false] - bỏ (giữ chữ ký).
         */
        async loadComments(_append = false) {
            const state = window.LiveState;
            const ids = state.selectedCampaignIds
                ? Array.from(state.selectedCampaignIds)
                : state.selectedCampaign
                  ? [state.selectedCampaign.Id]
                  : [];
            if (!ids.length) return;
            await this.onMultiCampaignChange(ids);
        },

        /**
         * Load more comments — NO-OP. Phân trang server (Pancake cursor) đã bỏ; DB
         * load đủ comment 1 lần, "tải thêm" giờ là infinite-scroll CLIENT trong
         * LiveCommentList (cap render tăng dần). Giữ hàm cho caller cũ.
         */
        async loadMoreComments() {
            // no-op — infinite scroll do LiveCommentList._appendOlderBatch lo.
        },

        /**
         * Load SessionIndex for a campaign
         * @param {string} [postId] - Post ID, defaults to selected campaign
         */
        async loadSessionIndex(postId) {
            const state = window.LiveState;
            if (!postId && !state.selectedCampaign) return;
            postId = postId || state.selectedCampaign.Facebook_LiveId;

            try {
                const map = await window.LiveApi.loadSessionIndex(postId);
                // Merge into existing map (for multi-campaign)
                for (const [k, v] of map) {
                    // Preserve native-web entries — don't let Live data overwrite them
                    const existing = state.sessionIndexMap.get(k);
                    if (existing?.source === 'NATIVE_WEB') continue;
                    state.sessionIndexMap.set(k, v);
                }
                console.log('[Live-INIT] SessionIndex loaded, total:', state.sessionIndexMap.size);

                // Hydrate native-web orders for this post (non-blocking)
                this.loadNativeOrdersForPost(postId).catch(() => {});

                if (state.comments.length > 0) {
                    window.LiveCommentList.renderComments();
                }
            } catch (error) {
                console.error('[Live-INIT] Error loading SessionIndex:', error);
            }
        },

        /**
         * Load native-web orders for a post and merge into sessionIndexMap
         * so previously created native orders show their badge on load.
         * @param {string} postId - Facebook post id
         */
        async loadNativeOrdersForPost(postId) {
            const state = window.LiveState;
            if (!postId || !window.NativeOrdersApi) return;
            try {
                const resp = await window.NativeOrdersApi.list({ fbPostId: postId, limit: 1000 });
                const orders = resp?.orders || [];
                for (const o of orders) {
                    if (!o.fbUserId) continue;
                    state.sessionIndexMap.set(o.fbUserId, {
                        index: o.sessionIndex || '?',
                        code: o.code,
                        source: 'NATIVE_WEB',
                        commentCount: Number(o.commentCount || 1),
                        commentIds: Array.isArray(o.commentIds) ? o.commentIds : [],
                    });
                }
                if (orders.length > 0 && state.comments.length > 0) {
                    window.LiveCommentList.renderComments();
                }
            } catch (e) {
                console.warn('[Live-INIT] loadNativeOrdersForPost failed:', e.message);
            }
        },

        /**
         * Load partner info for all visible comments (batch, then re-render).
         * Warehouse lookup chỉ cần fb_id (crmTeamId đã gỡ 2026-06-12).
         */
        async loadPartnerInfoForComments() {
            const state = window.LiveState;

            // Chỉ fetch fb_id CHƯA có trong cache (gom hết, KHÔNG loop từng cái).
            const userIds = new Set();
            for (const c of state.comments) {
                const userId = c.from?.id;
                if (userId && !state.partnerCache.has(userId)) userIds.add(userId);
            }

            // 1 batch request cho TẤT CẢ fb_id (trước: N request batch-by-fbid 1 phần tử).
            if (userIds.size > 0) {
                try {
                    const map = await window.LiveApi.getPartnerInfoBatch(Array.from(userIds));
                    // Warehouse trả FLAT object {Id,Name,Phone,...}; shape cũ Live là
                    // {Partner:{...}} → support cả 2 (defensive).
                    for (const [userId, data] of map) {
                        if (data) state.partnerCache.set(userId, data.Partner || data);
                    }
                } catch (e) {
                    console.warn('[Live-INIT] loadPartnerInfoForComments batch fail:', e.message);
                }
            }

            // Re-render with partner info
            window.LiveCommentList.renderComments();

            // KH đã có trong kho (partner.Phone) nhưng SĐT Pancake của comment KHÁC
            // → lưu làm SĐT PHỤ (alt_phones), KHÔNG ghi đè phone chính. Ưu tiên kho.
            this._captureAltPhones();

            // Load debt for partners with phone numbers
            this.loadDebtForPartners();
        },

        // Quét comment: KH có phone chính (kho) + SĐT Pancake khác → POST add-alt-phone.
        // Dedupe per-session (_altSeen) để không spam. Best-effort.
        _captureAltPhones() {
            const state = window.LiveState;
            if (!this._altSeen) this._altSeen = new Set();
            const norm = (s) =>
                String(s || '')
                    .replace(/\D/g, '')
                    .slice(-10);
            const pancakePhoneOf = (c) => {
                const a = c._phones;
                const ph = Array.isArray(a) && a.length ? a[0] : null;
                if (ph) return typeof ph === 'string' ? ph : ph.phone_number || ph.phone || '';
                const m = String(c.message || '')
                    .replace(/[.\s()\-_]/g, '')
                    .match(/(?:\+?84|0)(\d{9})(?!\d)/);
                return m ? '0' + m[1] : '';
            };
            for (const c of state.comments || []) {
                const fbId = c.from?.id;
                if (!fbId) continue;
                const partner = state.partnerCache?.get?.(fbId);
                const primary = partner?.Phone;
                if (!primary) continue; // chỉ khi KH ĐÃ có trong kho + có phone chính
                const pk = pancakePhoneOf(c);
                if (!pk || norm(pk).length !== 10) continue;
                if (norm(pk) === norm(primary)) continue; // giống phone chính → bỏ
                const key = fbId + '|' + norm(pk);
                if (this._altSeen.has(key)) continue;
                this._altSeen.add(key);
                fetch(`${state.workerUrl}/api/web2/customers/add-alt-phone`, {
                    method: 'POST',
                    // requireWeb2AuthSoft (WEB2_AUTH_ENFORCE) → phải gửi x-web2-token, KHÔNG thì 401.
                    headers: window.LiveColumnManager._w2AuthHeaders({
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify({ fbId: String(fbId), phone: norm(pk) }),
                    signal: AbortSignal.timeout(15000),
                }).catch(() => {});
            }
        },

        // Gom KH từ comment vào KHO KH (web2_customers) — 1 bulk call.
        // Trigger khi Force extract (live-livestream-snap). Backend KHÔNG ghi đè
        // SĐT/địa chỉ/tên sẵn có: trùng SĐT → thêm alt_phones (phone chính giữ
        // nguyên là CHÍNH), field rỗng mới fill, KH mới thì tạo. Best-effort.
        async _harvestCommentCustomers(comments) {
            const state = window.LiveState;
            const list = Array.isArray(comments) ? comments : state.comments || [];
            if (!list.length) return null;
            // DELEGATE sang LiveCustomerSync shared (dùng chung mobile): gom KH mới
            // từ comment → /harvest-comments (server non-overwrite, _notify web2:customers
            // → trang web2/customers tự reload). Dedupe + debounce trong module.
            if (window.LiveCustomerSync) {
                window.LiveCustomerSync.harvest(list, {
                    workerUrl: state.workerUrl,
                    headers: window.LiveColumnManager._w2AuthHeaders({
                        'Content-Type': 'application/json',
                    }),
                });
                return { queued: list.length };
            }
            return null;
        },

        /**
         * Load debt info for all partners with phone numbers
         */
        async loadDebtForPartners() {
            const state = window.LiveState;
            if (!window.sharedDebtManager) return;

            const phones = [];
            // Public entries() của SharedCache — TTL được tôn trọng, skip expired.
            for (const [, partner] of state.partnerCache.entries()) {
                if (partner && partner.Phone) {
                    phones.push(partner.Phone);
                }
            }

            if (phones.length === 0) return;

            await window.sharedDebtManager.loadBatch(phones);
            window.LiveCommentList.renderComments();
        },

        /**
         * Refresh current view
         */
        async refresh() {
            const state = window.LiveState;
            window.LiveRealtime.stopSSE();

            if (state.selectedCampaign) {
                await this.loadComments();
            } else if (state.selectedPage) {
                await window.LiveApi.loadLiveCampaigns(state.selectedPage.Facebook_PageId);
                window.LiveCommentList.renderLiveCampaignOptions();
            } else {
                await window.LiveApi.loadCRMTeams();
                window.LiveCommentList.renderCrmTeamOptions();
            }
        },

        /**
         * Toggle hide/show a comment
         * @param {string} commentId
         * @param {boolean} hide
         */
        async toggleHideComment(commentId, hide) {
            const state = window.LiveState;
            const comment = state.comments.find((c) => c.id === commentId);
            if (!comment) return;

            // Optimistic UI update
            comment.is_hidden = hide;
            window.LiveCommentList.renderComments();

            // Call actual Live API
            const pageId = state.selectedPage?.Facebook_PageId;
            if (pageId) {
                const success = await window.LiveApi.hideComment(pageId, commentId, hide);
                if (success) {
                    if (window.notificationManager) {
                        window.notificationManager.show(
                            hide ? 'Đã ẩn comment trên Facebook' : 'Đã hiện comment trên Facebook',
                            'success'
                        );
                    }
                } else {
                    // Revert on failure
                    comment.is_hidden = !hide;
                    window.LiveCommentList.renderComments();
                    if (window.notificationManager) {
                        window.notificationManager.show(
                            'Lỗi: Không thể ' + (hide ? 'ẩn' : 'hiện') + ' comment',
                            'error'
                        );
                    }
                }
            }
        },

        /**
         * Set debt display settings
         * @param {boolean} showDebt
         * @param {boolean} showZeroDebt
         */
        setDebtDisplaySettings(showDebt, showZeroDebt) {
            window.LiveCommentList.setDebtDisplaySettings(showDebt, showZeroDebt);
        },

        /**
         * Destroy / cleanup
         */
        destroy() {
            window.LiveRealtime.stopSSE();
            window.LiveRealtime.disconnectWebSocket();
            window.LiveState.stopCacheCleanup();
            // Gỡ window listeners + timers (tránh leak khi re-init).
            if (this._onRtConnected) {
                window.removeEventListener('liveRealtimeConnected', this._onRtConnected);
                this._onRtConnected = null;
            }
            if (this._onRtDisconnected) {
                window.removeEventListener('liveRealtimeDisconnected', this._onRtDisconnected);
                this._onRtDisconnected = null;
            }
            clearTimeout(this._campaignChangeTimer);
            clearTimeout(this._liveCommentsReloadTimer);
            clearTimeout(this._offlineBatchTimer);
        },
    });
})();
