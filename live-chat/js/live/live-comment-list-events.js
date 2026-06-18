// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Comment List — EVENTS module. Dựng container/topbar selectors, wire DOM
 * event handlers (CRM/campaign select, scroll, drag flush), delegated click cho
 * list comment (data-action → method). Tách MOVE-only từ live-comment-list.js.
 * Load SAU base + state, TRƯỚC render/actions (handlers gọi method ở module đó).
 */
(function () {
    'use strict';

    Object.assign(window.LiveCommentList, {
        /**
         * Render the main container structure
         */
        renderContainer() {
            const state = window.LiveState;
            const container = document.getElementById(state.containerId);
            if (!container) {
                console.error('[Live-LIST] Container not found:', state.containerId);
                return;
            }

            // Render selectors into topbar (if available)
            const topbarSelectors = document.getElementById('topbarLiveSelectors');
            if (topbarSelectors) {
                topbarSelectors.innerHTML = `
                <select id="liveCrmTeamSelect" class="live-filter-select" disabled>
                    <option value="">Chọn Page...</option>
                </select>
                <div class="live-campaign-multi" style="position:relative;">
                    <button id="liveCampaignBtn" class="live-filter-select" style="text-align:left;cursor:pointer;display:flex;align-items:center;gap:4px;min-width:160px;" disabled>
                        <span id="liveCampaignBtnText">Chọn Campaign...</span>
                        <i data-lucide="chevron-down" style="width:12px;height:12px;margin-left:auto;flex-shrink:0;"></i>
                    </button>
                    <div id="liveCampaignDropdown" class="live-campaign-dropdown" style="display:none;position:absolute;top:100%;left:0;min-width:300px;max-height:350px;overflow-y:auto;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);z-index:500;margin-top:4px;">
                        <div style="padding:6px 10px;border-bottom:1px solid #e5e7eb;display:flex;gap:6px;">
                            <button id="liveCampaignSelectAll" style="padding:3px 8px;background:#3b82f6;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;">Hôm nay</button>
                            <button id="liveCampaignClearAll" style="padding:3px 8px;background:#f3f4f6;color:#374151;border:none;border-radius:4px;font-size:11px;cursor:pointer;">Bỏ chọn</button>
                        </div>
                        <div id="liveCampaignList" style="padding:4px 0;"></div>
                    </div>
                </div>
            `;
            }

            // Column content: just comment list + load more (no header)
            container.innerHTML = `
            <div class="live-chat-wrapper">
                <div class="live-conversation-list" id="liveCommentList">
                    <div class="live-empty">
                        <i data-lucide="message-square"></i>
                        <span>Chọn Page và Campaign để xem comment</span>
                    </div>
                </div>
                <div class="live-load-more" id="liveLoadMore" style="display: none;">
                    <div class="live-loading-more">
                        <i data-lucide="loader-2" class="spin"></i>
                        <span>Đang tải thêm...</span>
                    </div>
                </div>
            </div>
        `;

            if (typeof lucide !== 'undefined') lucide.createIcons();
            this.setupEventHandlers();
        },

        /**
         * Setup DOM event handlers
         */
        setupEventHandlers() {
            const crmSelect = document.getElementById('liveCrmTeamSelect');
            if (crmSelect) {
                crmSelect.addEventListener('change', (e) => {
                    window.eventBus.emit('live:crmTeamChanged', e.target.value);
                });
            }

            // Campaign multi-select dropdown
            const campaignBtn = document.getElementById('liveCampaignBtn');
            if (campaignBtn) {
                campaignBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleCampaignDropdown();
                });
            }
            const selectAllBtn = document.getElementById('liveCampaignSelectAll');
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectTodayCampaigns();
                });
            }
            const clearAllBtn = document.getElementById('liveCampaignClearAll');
            if (clearAllBtn) {
                clearAllBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.clearCampaignSelection();
                });
            }
            // Close dropdown on outside click — bind 1 LẦN (renderContainer có thể gọi
            // lại setupEventHandlers → guard tránh leak listener trên document).
            if (!this._docClickHandler) {
                this._docClickHandler = (e) => {
                    const dropdown = document.getElementById('liveCampaignDropdown');
                    if (
                        dropdown &&
                        dropdown.style.display !== 'none' &&
                        !e.target.closest('.live-campaign-multi')
                    ) {
                        dropdown.style.display = 'none';
                    }
                };
                document.addEventListener('click', this._docClickHandler);
            }

            // Delegated change cho checkbox campaign (thay inline onchange — XSS-safe).
            const campaignDropdown = document.getElementById('liveCampaignDropdown');
            if (campaignDropdown && campaignDropdown.dataset.delegated !== '1') {
                campaignDropdown.dataset.delegated = '1';
                campaignDropdown.addEventListener('change', (e) => {
                    const cb = e.target.closest('input[data-camp-id]');
                    if (cb) this.toggleCampaign(cb.dataset.campId);
                });
            }

            const btnRefresh = document.getElementById('btnLiveRefresh');
            if (btnRefresh) {
                btnRefresh.addEventListener('click', () => {
                    window.eventBus.emit('live:refreshRequested');
                });
            }

            const commentList = document.getElementById('liveCommentList');
            if (commentList) {
                // {passive:true}: scroll handler không preventDefault → cho phép browser
                // scroll trên compositor thread, không chờ JS (chống jank khi cuộn list dài).
                commentList.addEventListener('scroll', () => this.handleScroll(commentList), {
                    passive: true,
                });
            }

            this._bindListDelegation();

            // Kéo SP vào comment: dragstart (inventory-panel) bật LiveState._dragActive
            // → mọi re-render bị hoãn (tránh hủy drop target + giật). dragend → xả phần
            // đã hoãn. Bind 1 LẦN trên document (guard tránh leak listener).
            if (!this._dragEndFlushHandler) {
                this._dragEndFlushHandler = () => this._flushDeferredAfterDrag();
                document.addEventListener('dragend', this._dragEndFlushHandler);
            }
        },

        /**
         * Xả các re-render đã hoãn trong lúc kéo SP. Gọi khi dragend (mọi loại kéo —
         * nếu không có gì hoãn thì no-op). Tắt cờ trước, rồi replay prepend SSE đã
         * buffer + render lại nếu có dispatch bị hoãn.
         */
        _flushDeferredAfterDrag() {
            if (window.LiveState) window.LiveState._dragActive = false;
            const buffered = this._dragDeferredPrepend;
            this._dragDeferredPrepend = null;
            if (buffered && buffered.length) {
                try {
                    this.prependComments(buffered);
                } catch (e) {
                    console.warn('[LiveCommentList] flush prepend fail:', e.message);
                }
            }
            if (this._renderDeferred) {
                this._renderDeferred = false;
                this.renderComments();
            }
        },

        /**
         * Delegated click cho list comment — THAY toàn bộ inline onclick chứa user
         * data (XSS-safe). Bind 1 lần trên #liveCommentList (guard dataset.delegated;
         * element được tạo mới mỗi renderContainer nên guard tự reset).
         */
        _bindListDelegation() {
            const list = document.getElementById('liveCommentList');
            if (!list || list.dataset.delegated === '1') return;
            list.dataset.delegated = '1';
            list.addEventListener('click', (e) => this._onListClick(e, list));
        },

        /**
         * Xử lý click delegated trong list comment. Đọc user data qua el.dataset
         * (browser tự decode entity → giá trị gốc), KHÔNG nhét vào chuỗi JS inline.
         * @param {MouseEvent} e
         * @param {HTMLElement} list
         */
        async _onListClick(e, list) {
            const actionEl = e.target.closest('[data-action]');
            if (actionEl && list.contains(actionEl)) {
                // Inline handler cũ đều có event.stopPropagation() → giữ behavior.
                e.stopPropagation();
                const d = actionEl.dataset;
                switch (d.action) {
                    case 'order-detail':
                        this.showOrderDetail(d.fromId);
                        return;
                    case 'show-customer':
                        this.showPancakeCustomerInfo(d.fromId, d.name || '', d.pageId || '');
                        return;
                    case 'toggle-status':
                        this.toggleInlineStatusDropdown(d.fromId);
                        return;
                    case 'select-status':
                        this.selectInlineStatus(d.fromId, d.value, d.text);
                        return;
                    case 'save-phone':
                        this.saveInlinePhone(d.fromId, `phone-${d.fromId}`);
                        return;
                    case 'save-address':
                        this.saveInlineAddress(d.fromId, `addr-${d.fromId}`);
                        return;
                    case 'create-order':
                        this.createOrder(d.fromId, d.name || '', d.commentId);
                        return;
                    case 'show-info':
                        window.LiveCustomerPanel?.showCustomerInfo(d.fromId, d.name || '');
                        return;
                    case 'open-chat':
                        window.LiveChatModal?.open({
                            fbUserId: d.fromId,
                            name: d.name || '',
                            pageId: d.pageId || '',
                        });
                        return;
                    case 'reply':
                        this.showReplyInput(d.commentId, d.fromId);
                        return;
                    case 'toggle-hide':
                        window.LiveColumnManager?.toggleHideComment(
                            d.commentId,
                            d.hideNext === 'true'
                        );
                        return;
                    case 'hide-commenter':
                        if (
                            await Popup.confirm(
                                `Ẩn TẤT CẢ comment của "${d.name || d.fromId}"?\n(Bỏ ẩn ở nút 🙈 trên topbar — đồng bộ mọi máy)`,
                                { okText: 'Ẩn' }
                            )
                        ) {
                            window.LiveHiddenCommenters?.hide(d.fromId, d.name || '');
                        }
                        return;
                    default:
                        return;
                }
            }
            // Vùng tương tác (input SĐT/địa chỉ, status, reply, link KH) — inline cũ
            // stopPropagation để KHÔNG select row → giữ nguyên behavior.
            if (
                e.target.closest(
                    '.live-conv-info, .inline-status-container, .live-reply-input-row, a'
                )
            ) {
                return;
            }
            const row = e.target.closest('.live-conversation-item');
            if (row && list.contains(row)) this.selectComment(row.dataset.commentId);
        },
    });
})();
