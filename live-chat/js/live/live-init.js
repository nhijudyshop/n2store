// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Column Initializer & Orchestrator — ENTRY module.
 *
 * Tách MOVE-only từ live-init.js cũ (2026-06-19) thành 4 module nhỏ (<800 dòng):
 *   live-init-state (namespace + shell + helpers) → live-init-wiring (event-bus +
 *   change handlers) → live-init-lifecycle (data/load/cleanup) → live-init (entry).
 * Tất cả Object.assign vào CÙNG object window.LiveColumnManager → public API +
 * event-bus wiring + boot order byte-identical.
 *
 * Module này CHỨA:
 *   - initialize(containerId) — boot sequence + SSE subscriptions (web2:live-comments
 *     / web2:customers)
 *   - Export window.LiveColumnManager (final) + window.liveChatManager (delegate
 *     backward-compat)
 *
 * Wires together LiveState, LiveApi, LiveCommentList, LiveCustomerPanel, LiveRealtime.
 * Exposes LiveColumnManager on window for backward compatibility.
 *
 * Load CUỐI CÙNG trong bộ live-init-*. Dependencies: LiveState, LiveApi,
 *   LiveCommentList, LiveCustomerPanel, LiveCommentsStream, LiveKhoEnricher, Web2SSE,
 *   eventBus.
 */
(function () {
    'use strict';

    Object.assign(window.LiveColumnManager, {
        /**
         * Initialize the Live column
         * @param {string} containerId - DOM container ID
         */
        async initialize(containerId) {
            const state = window.LiveState;
            state.containerId = containerId;
            console.log('[Live-INIT] Initializing Live column in:', containerId);

            // Start cache cleanup
            state.startCacheCleanup();

            // Render container and selectors
            window.LiveCommentList.renderContainer();

            // Wire up event bus listeners
            this.setupEventListeners();

            // Setup realtime event listeners (WebSocket status)
            this.setupRealtimeListeners();

            // Chờ Pancake account JWT sẵn sàng TRƯỚC khi load campaign. Account nạp
            // async từ nhiều nguồn (token-manager.initialize + web2-chat-client
            // syncFromRenderDB) → nếu chưa có, fetchVideosAsCampaigns rỗng (bug: phải
            // chọn lại page mới hiện). Poll tới khi có token/account hoặc timeout.
            await this._waitForPancakeAccounts(9000);

            // Load CRM Teams
            await window.LiveApi.loadCRMTeams();
            window.LiveCommentList.renderCrmTeamOptions();

            // Restore saved page selection (mặc định 'all' → load campaign + auto-chọn)
            this.restoreSelection();

            // SSE PUSH-only (KHÔNG polling — user 2026-06-11): relay Pancake WS 24/7
            // nhận comment → /ingest → fetch per-message đúng post → DB → SSE topic
            // 'web2:live-comments' → đây nhận event → INCREMENTAL delta fetch. Debounce ~400ms gom burst → GET DB chỉ comment mới hơn
            // (since=_lastCommentMaxMs) → prepend dòng mới vào ĐẦU list (không full
            // re-render → mượt, (realtime per-comment). KHÔNG reload toàn bộ.
            // Realtime comment livestream qua engine SHARED LiveCommentsStream (dùng
            // chung desktop + mobile). SSE 'web2:live-comments' → debounce 400ms →
            // delta fetch (cursor updated_at) → prependComments (APPEND, KHÔNG full
            // re-render). Cursor được prime sau initial load (onMultiCampaignChange).
            if (window.LiveCommentsStream) {
                this._liveStream = window.LiveCommentsStream.create({
                    getWorkerUrl: () => window.LiveState.workerUrl,
                    getPostIds: () => this._resolveSelectedPostIds(),
                    // PAUSE khi đang xem chiến dịch CHA (LiveColumnManager._origComments
                    // != null) → giữ cursor, không nhiễm comment live vào view campaign.
                    shouldFetch: () => !window.LiveColumnManager?._origComments,
                    mapRow: (row) => this._dbRowToComment(row),
                    onDelta: (rows) => {
                        window.LiveCommentList.prependComments(rows);
                        // KH MỚI từ comment realtime → kho web2_customers (shared).
                        this._harvestCommentCustomers(rows);
                    },
                    // Boost-purge: server gỡ spam → {action:'reconcile', purgedIds} → xoá
                    // đúng dòng khỏi list (delta chỉ append, không tự gỡ). audit MEDIUM.
                    onReconcile: (ids) => window.LiveCommentList.removeComments?.(ids),
                });
                this._liveStream.start();
            } else if (window.Web2SSE?.subscribe) {
                // Fallback (engine chưa load): giữ đường cũ delegate _fetchLiveCommentDelta.
                window.Web2SSE.subscribe('web2:live-comments', () => {
                    clearTimeout(this._liveCommentsReloadTimer);
                    this._liveCommentsReloadTimer = setTimeout(() => {
                        this._fetchLiveCommentDelta();
                    }, 400);
                });
            }
            // Kho KH (web2_customers) đổi ở BẤT KỲ trang nào (trạng thái/tên/SĐT) → xoá
            // cache enrich + nạp lại + re-render → trạng thái/tên trên comment tự cập nhật
            // (1 nguồn chung — đồng bộ với panel KH + native-orders + mobile, qua SSE).
            if (window.Web2SSE?.subscribe) {
                let _custReloadT = null;
                window.Web2SSE.subscribe('web2:customers', () => {
                    clearTimeout(_custReloadT);
                    _custReloadT = setTimeout(() => {
                        const st = window.LiveState;
                        if (st.customerKhoCache) st.customerKhoCache.clear();
                        if (st.partnerCache) st.partnerCache.clear();
                        window.LiveKhoEnricher?.reset?.();
                        window.LiveKhoEnricher?.scan?.();
                        if (window.LiveCommentList?.renderComments)
                            window.LiveCommentList.renderComments();
                    }, 600);
                });
            }
            // ⚠ KHÔNG subscribe 'web2:messages' để reload cột Live (bug 2026-06-11:
            // mỗi tin INBOX làm cột Live full reload → trắng panel). Inbox là việc
            // của cột Pancake (pancake-realtime). Comment livestream dùng topic
            // 'web2:live-comments' riêng ở trên.
        },
    });

    // Export for script-tag usage & backward compatibility
    if (typeof window !== 'undefined') {
        const LiveColumnManager = window.LiveColumnManager;

        // Backward compatibility: expose as liveChatManager with delegate methods
        window.liveChatManager = {
            initialize: (id) => LiveColumnManager.initialize(id),
            refresh: () => LiveColumnManager.refresh(),
            loadComments: () => LiveColumnManager.loadComments(),
            selectComment: (id) => window.LiveCommentList.selectComment(id),
            showCustomerInfo: (id, name) => window.LiveCustomerPanel.showCustomerInfo(id, name),
            closeCustomerInfoModal: () => window.LiveCustomerPanel.closeModal(),
            handleSaveToLive: (id, name) => window.LiveCommentList.handleSaveToLive(id, name),
            toggleHideComment: (id, hide) => LiveColumnManager.toggleHideComment(id, hide),
            toggleStatusDropdown: () => window.LiveCustomerPanel.toggleStatusDropdown(),
            selectStatus: (v, t) => window.LiveCustomerPanel.selectStatus(v, t),
            toggleInlineStatusDropdown: (id) =>
                window.LiveCommentList.toggleInlineStatusDropdown(id),
            selectInlineStatus: (id, v, t) => window.LiveCommentList.selectInlineStatus(id, v, t),
            saveInlinePhone: (id, inputId) => window.LiveCommentList.saveInlinePhone(id, inputId),
            saveInlineAddress: (id, inputId) =>
                window.LiveCommentList.saveInlineAddress(id, inputId),
            setDebtDisplaySettings: (a, b) => LiveColumnManager.setDebtDisplaySettings(a, b),
            updateSaveButtonToCheckmark: (id) =>
                window.LiveCommentList.updateSaveButtonToCheckmark(id),
            // Expose state for external access
            get comments() {
                return window.LiveState.comments;
            },
            get selectedPage() {
                return window.LiveState.selectedPage;
            },
            get selectedCampaign() {
                return window.LiveState.selectedCampaign;
            },
            get savedToLiveIds() {
                return window.LiveState.savedToLiveIds;
            },
            get sessionIndexMap() {
                return window.LiveState.sessionIndexMap;
            },
            getCacheStats: () => window.LiveState.getCacheStats(),
        };
    }
})();
