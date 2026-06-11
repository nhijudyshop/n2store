// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Live Comment List UI
 * Renders comment list, selectors, filters, infinite scroll
 * Dependencies: LiveState, LiveApi, SharedUtils, sharedDebtManager, eventBus
 */

// Inline SVG icons — KHÔNG dùng <i data-lucide> + lucide.createIcons() trong
// list. createIcons() scan TOÀN BỘ DOM mỗi call; mỗi comment có ~7 icon nên
// 100 rows = 700 icon scan / render → lag nặng. Inline SVG render 1 lần, 0 scan.
// (Cùng pattern đã áp dụng trong live-livestream-snap.js.)
const _Live_ICON_PATHS = {
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    'shopping-cart':
        '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    'plus-square':
        '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>',
    'check-square':
        '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    contact:
        '<path d="M16 18a4 4 0 0 0-8 0"/><rect width="18" height="18" x="3" y="4" rx="2"/><circle cx="12" cy="10" r="2"/><line x1="8" x2="8" y1="2" y2="4"/><line x1="16" x2="16" y1="2" y2="4"/>',
    reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
    'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off':
        '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
};

/**
 * Inline SVG icon string (lucide-compatible paths, no DOM scan).
 * @param {string} name
 * @param {number} [size=13]
 * @param {string} [cls=''] extra class (vd 'channel-icon fb')
 * @returns {string}
 */
function liveSvgIcon(name, size = 13, cls = '') {
    const p = _Live_ICON_PATHS[name];
    if (!p) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg"${cls ? ` class="${cls}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;pointer-events:none;flex-shrink:0;">${p}</svg>`;
}

/**
 * Escape giá trị nhét vào HTML ATTRIBUTE (double-quoted). SharedUtils.escapeHtml
 * (textContent→innerHTML) KHÔNG escape dấu " → không an toàn cho attribute.
 * Helper này escape đủ &<>"' — dùng cho data-*, value, id, title.
 * @param {*} v
 * @returns {string}
 */
function liveAttr(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Cap render: chỉ dựng N comment MỚI NHẤT trong DOM (comments sorted newest-first).
// 843 dòng non-virtualized → mỗi render reflow O(n) + inventory-panel/livestream-snap
// quét all rows → giật. Cap giữ DOM nhỏ (~200) → nhẹ. Nút "xem cũ hơn" tăng cap.
const RENDER_LIMIT_INITIAL = 200;
const RENDER_LIMIT_STEP = 200;

const LiveCommentList = {
    /**
     * Danh sách comment HIỂN THỊ (cap N mới nhất). Comments đã sort newest-first.
     * @returns {Array}
     */
    _visibleComments() {
        const all = window.LiveState.comments || [];
        const lim = this._renderLimit || RENDER_LIMIT_INITIAL;
        return lim >= all.length ? all : all.slice(0, lim);
    },

    /**
     * Reset cap về mặc định (gọi khi đổi tập comment — chọn campaign khác).
     */
    resetRenderLimit() {
        this._renderLimit = RENDER_LIMIT_INITIAL;
    },

    /**
     * Inject pill số dư ví Web 2.0 ([data-w2wallet-phone] → "Ví: X₫") sau mỗi
     * render. Idempotent (Web2WalletBalance skip element đã done). Thay "Nợ Live".
     */
    _attachWalletBalances() {
        const list = document.getElementById('liveCommentList');
        if (list && window.Web2WalletBalance?.attachBalances) {
            window.Web2WalletBalance.attachBalances(list);
        }
    },

    /**
     * Infinite scroll: cuộn gần đáy list → tự load thêm RENDER_LIMIT_STEP comment
     * cũ hơn. Dùng IntersectionObserver trên sentinel ở cuối (không scroll handler
     * churn). Append batch mới TRƯỚC sentinel → giữ nguyên các dòng đã có + vị trí
     * scroll, KHÔNG rebuild toàn list.
     */
    _ensureScrollSentinel() {
        const state = window.LiveState;
        const list = document.getElementById('liveCommentList');
        if (!list) return;
        const lim = this._renderLimit || RENDER_LIMIT_INITIAL;
        const hasMore = (state.comments?.length || 0) > lim;
        let sentinel = document.getElementById('liveScrollSentinel');
        if (!hasMore) {
            if (sentinel) sentinel.remove();
            this._scrollObserver?.disconnect();
            return;
        }
        if (!sentinel) {
            sentinel = document.createElement('div');
            sentinel.id = 'liveScrollSentinel';
            sentinel.style.cssText = 'height:1px;width:100%;';
        }
        // Luôn để sentinel ở cuối.
        if (list.lastElementChild !== sentinel) list.appendChild(sentinel);
        // Wire observer (root = list scroll container, prefetch trước 400px).
        // Nếu list bị rebuild (renderContainer) → root cũ detached → tạo lại.
        if (this._scrollObserver && this._scrollObserver.root !== list) {
            this._scrollObserver.disconnect();
            this._scrollObserver = null;
        }
        if (!this._scrollObserver) {
            this._scrollObserver = new IntersectionObserver(
                (entries) => {
                    if (entries.some((e) => e.isIntersecting)) this._appendOlderBatch();
                },
                { root: list, rootMargin: '0px 0px 400px 0px' }
            );
        }
        // LUÔN disconnect trước khi observe — tránh observe trùng/sentinel cũ.
        this._scrollObserver.disconnect();
        this._scrollObserver.observe(sentinel);
    },

    /**
     * Append batch comment cũ hơn (RENDER_LIMIT_STEP) vào cuối, trước sentinel.
     * Không rebuild list → giữ scroll + dòng cũ. Chunked để không block.
     */
    _appendOlderBatch() {
        if (this._loadingOlder) return;
        const state = window.LiveState;
        const list = document.getElementById('liveCommentList');
        if (!list) return;
        const oldLim = this._renderLimit || RENDER_LIMIT_INITIAL;
        const all = state.comments || [];
        if (oldLim >= all.length) {
            this._ensureScrollSentinel();
            return;
        }
        this._loadingOlder = true;
        const newLim = Math.min(oldLim + RENDER_LIMIT_STEP, all.length);
        const batch = all.slice(oldLim, newLim);
        const sentinel = document.getElementById('liveScrollSentinel');
        const schedule = (cb) => setTimeout(cb, 0);
        const CHUNK = 25;
        // Generation token: full re-render (renderCommentsNow) bump _renderGen →
        // batch đang chạy trên DOM/slice cũ phải ABORT, tránh chèn row stale.
        const gen = (this._renderGen = this._renderGen || 0);
        let i = 0;
        const step = () => {
            if (gen !== this._renderGen) {
                // List đã bị full re-render giữa chừng → bỏ batch này.
                this._loadingOlder = false;
                return;
            }
            const parts = [];
            const end = Math.min(i + CHUNK, batch.length);
            for (; i < end; i++) parts.push(this.renderCommentItem(batch[i]));
            const html = parts.join('');
            if (sentinel && sentinel.parentNode === list) {
                sentinel.insertAdjacentHTML('beforebegin', html);
            } else {
                list.insertAdjacentHTML('beforeend', html);
            }
            if (i < batch.length) {
                schedule(step);
            } else {
                this._renderLimit = newLim;
                this._loadingOlder = false;
                this._ensureScrollSentinel(); // re-observe (hoặc gỡ nếu hết)
                this._attachWalletBalances();
            }
        };
        schedule(step);
    },

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
    _onListClick(e, list) {
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
                    window.LiveColumnManager?.toggleHideComment(d.commentId, d.hideNext === 'true');
                    return;
                default:
                    return;
            }
        }
        // Vùng tương tác (input SĐT/địa chỉ, status, reply, link KH) — inline cũ
        // stopPropagation để KHÔNG select row → giữ nguyên behavior.
        if (
            e.target.closest('.live-conv-info, .inline-status-container, .live-reply-input-row, a')
        ) {
            return;
        }
        const row = e.target.closest('.live-conversation-item');
        if (row && list.contains(row)) this.selectComment(row.dataset.commentId);
    },

    /**
     * Handle scroll for infinite loading
     */
    handleScroll(container) {
        const state = window.LiveState;
        const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

        if (scrollBottom < 100 && state.hasMore && !state.isLoading) {
            console.log('[Live-LIST] Auto-loading more comments...');
            window.eventBus.emit('live:loadMoreRequested');
        }
    },

    /**
     * Update load-more indicator visibility
     */
    updateLoadMoreIndicator() {
        const state = window.LiveState;
        const loadMoreContainer = document.getElementById('liveLoadMore');
        if (!loadMoreContainer) return;

        const visible = (state.isLoading && state.comments.length > 0) || state.hasMore;
        loadMoreContainer.style.display = visible ? 'flex' : 'none';

        if (visible && typeof lucide !== 'undefined') lucide.createIcons();
    },

    /**
     * Render CRM Team / Page options in the selector
     */
    renderCrmTeamOptions() {
        const state = window.LiveState;
        const select = document.getElementById('liveCrmTeamSelect');
        if (!select) return;

        let options = '<option value="">Chọn Page...</option>';

        if (state.allPages.length > 1) {
            options += `<option value="all">📋 Tất cả Pages (${state.allPages.length})</option>`;
        }

        state.crmTeams.forEach((team) => {
            if (team.Childs && team.Childs.length > 0) {
                options += `<optgroup label="${SharedUtils.escapeHtml(team.Name)}">`;
                team.Childs.forEach((page) => {
                    if (page.Facebook_PageId && page.Facebook_TypeId === 'Page') {
                        options += `<option value="${team.Id}:${page.Id}" data-page-id="${page.Facebook_PageId}">
                            ${SharedUtils.escapeHtml(page.Facebook_PageName || page.Name)}
                        </option>`;
                    }
                });
                options += '</optgroup>';
            }
        });

        select.innerHTML = options;
        select.disabled = false;
    },

    /**
     * Render Live Campaign options as multi-select checkboxes
     */
    renderLiveCampaignOptions() {
        const state = window.LiveState;
        const list = document.getElementById('liveCampaignList');
        const btn = document.getElementById('liveCampaignBtn');
        if (!list) return;

        if (state.liveCampaigns.length === 0) {
            list.innerHTML =
                '<div style="padding:12px;color:#9ca3af;font-size:12px;text-align:center;">Không có campaign</div>';
            if (btn) btn.disabled = true;
            return;
        }
        if (btn) btn.disabled = false;

        // Initialize selectedCampaignIds if not exists
        if (!state.selectedCampaignIds) state.selectedCampaignIds = new Set();

        list.innerHTML =
            state.liveCampaigns.map((c) => this._campaignRowHtml(c)).join('') +
            this._campaignSentinelHtml();

        this._bindCampaignScroll();
        this.updateCampaignBtnText();
    },

    /**
     * HTML 1 dòng campaign (checkbox + tên + badge page).
     * @param {object} c
     * @returns {string}
     */
    _campaignRowHtml(c) {
        const state = window.LiveState;
        const checked = state.selectedCampaignIds?.has(c.Id);
        const pageName = c.Facebook_UserName || '';
        const isStore = pageName.toLowerCase().includes('store');
        const badgeColor = isStore
            ? 'background:#fef3c7;color:#92400e'
            : 'background:#dbeafe;color:#1e40af';
        return `<label data-camp-id="${liveAttr(c.Id)}" style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:12px;transition:background 0.1s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" value="${liveAttr(c.Id)}" data-camp-id="${liveAttr(c.Id)}" ${checked ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;flex-shrink:0;">
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${SharedUtils.escapeHtml(c.Name)}</span>
                <span style="${badgeColor};font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600;flex-shrink:0;">${SharedUtils.escapeHtml(pageName.replace('NhiJudy ', '').replace('Nhi Judy ', ''))}</span>
            </label>`;
    },

    /** Dòng cuối dropdown: trạng thái phân trang (cuộn để tải thêm bài cũ). */
    _campaignSentinelHtml() {
        const more = window.LiveApi?.hasMoreLiveCampaigns?.();
        const txt = more ? 'Cuộn để tải thêm bài livestream…' : 'Đã tải hết bài livestream';
        return `<div id="liveCampaignMore" style="padding:8px 12px;color:#9ca3af;font-size:11px;text-align:center;">${txt}</div>`;
    },

    /** Gắn listener cuộn dropdown campaign 1 lần → tải thêm bài cũ hơn khi gần đáy. */
    _bindCampaignScroll() {
        const dd = document.getElementById('liveCampaignDropdown');
        if (!dd || dd._moreBound) return;
        dd._moreBound = true;
        dd.addEventListener('scroll', () => {
            if (dd.scrollTop + dd.clientHeight < dd.scrollHeight - 48) return;
            this.loadMoreCampaigns();
        });
    },

    /**
     * Tải thêm bài livestream cũ hơn (append, giữ vị trí cuộn). Idempotent —
     * guard isLoadingMoreCampaigns + hasMore.
     */
    async loadMoreCampaigns() {
        const state = window.LiveState;
        if (state.isLoadingMoreCampaigns) return;
        if (!window.LiveApi?.hasMoreLiveCampaigns?.()) return;
        state.isLoadingMoreCampaigns = true;
        const sentinel = document.getElementById('liveCampaignMore');
        if (sentinel) sentinel.textContent = 'Đang tải thêm…';
        try {
            const { added } = await window.LiveApi.loadMoreLiveCampaigns();
            const list = document.getElementById('liveCampaignList');
            const sent = document.getElementById('liveCampaignMore');
            if (list && added.length) {
                // Bài mới tải LUÔN cũ hơn bài đang có → append cuối (trên sentinel),
                // không phá thứ tự desc, giữ nguyên scrollTop.
                const html = added.map((c) => this._campaignRowHtml(c)).join('');
                if (sent) sent.insertAdjacentHTML('beforebegin', html);
                else list.insertAdjacentHTML('beforeend', html);
            }
            if (sent) {
                sent.textContent = window.LiveApi.hasMoreLiveCampaigns()
                    ? 'Cuộn để tải thêm bài livestream…'
                    : 'Đã tải hết bài livestream';
            }
        } catch (e) {
            console.warn('[Live] loadMoreCampaigns fail:', e.message);
            const sent = document.getElementById('liveCampaignMore');
            if (sent) sent.textContent = 'Cuộn để thử lại…';
        } finally {
            state.isLoadingMoreCampaigns = false;
        }
    },

    /**
     * Toggle campaign dropdown visibility
     */
    toggleCampaignDropdown() {
        const dropdown = document.getElementById('liveCampaignDropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    },

    /**
     * Toggle a single campaign selection
     * @param {string} campaignId
     */
    toggleCampaign(campaignId) {
        const state = window.LiveState;
        if (!state.selectedCampaignIds) state.selectedCampaignIds = new Set();

        if (state.selectedCampaignIds.has(campaignId)) {
            state.selectedCampaignIds.delete(campaignId);
        } else {
            state.selectedCampaignIds.add(campaignId);
        }

        this.updateCampaignBtnText();
        state.saveCampaignSelection();
        window.eventBus.emit('live:campaignsChanged', Array.from(state.selectedCampaignIds));
    },

    /**
     * Select all today's campaigns
     */
    selectTodayCampaigns() {
        const state = window.LiveState;
        if (!state.selectedCampaignIds) state.selectedCampaignIds = new Set();

        const today = new Date().toISOString().slice(0, 10);
        state.liveCampaigns.forEach((c) => {
            const cDate = (c.DateCreated || '').slice(0, 10);
            if (cDate === today) {
                state.selectedCampaignIds.add(c.Id);
            }
        });

        this.renderLiveCampaignOptions();
        state.saveCampaignSelection();
        window.eventBus.emit('live:campaignsChanged', Array.from(state.selectedCampaignIds));
    },

    /**
     * Clear all campaign selections
     */
    clearCampaignSelection() {
        const state = window.LiveState;
        if (state.selectedCampaignIds) state.selectedCampaignIds.clear();
        this.renderLiveCampaignOptions();
        state.saveCampaignSelection();
        window.eventBus.emit('live:campaignsChanged', []);
    },

    /**
     * Update campaign button text with selection count
     */
    updateCampaignBtnText() {
        const state = window.LiveState;
        const btnText = document.getElementById('liveCampaignBtnText');
        if (!btnText) return;

        const count = state.selectedCampaignIds?.size || 0;
        if (count === 0) {
            btnText.textContent = 'Chọn Live Campaign...';
        } else if (count === 1) {
            const id = Array.from(state.selectedCampaignIds)[0];
            const c = state.liveCampaigns.find((x) => x.Id === id);
            btnText.textContent = c ? c.Name : '1 campaign';
        } else {
            btnText.textContent = `${count} campaigns đã chọn`;
        }
    },

    /**
     * Render comment list (SMART, COALESCED).
     *
     * Đo thực tế (4 campaign, 758 comments): mỗi pass enrichment (loadSessionIndex,
     * loadPartnerInfo, loadDebt, kho-enricher, native-orders, realtime) gọi
     * renderComments() → rebuild full innerHTML 758 rows ~400-590ms/lần, block
     * main-thread = GIẬT. 19 lần như vậy trong 94s → giật toàn bộ liên tục.
     *
     * Fix: debounce 60ms gom burst → dispatch THÔNG MINH:
     *  - Nếu tập comment (id + thứ tự) KHÔNG đổi (chỉ enrichment cập nhật data) →
     *    patch in-place CHUNKED qua requestIdleCallback, CHỈ rebuild dòng có
     *    signature đổi (skip dòng không đổi) → không block main-thread, không giật.
     *  - Nếu cấu trúc đổi (thêm/bớt/đổi thứ tự comment) → full render đồng bộ.
     */
    renderComments() {
        clearTimeout(this._renderTimer);
        this._renderTimer = setTimeout(() => this._renderDispatch(), 60);
    },

    /**
     * Chữ ký dữ liệu động của 1 dòng (phone/addr/status/debt/session/hidden/msg/
     * saved/showDebt). Dùng để skip rebuild dòng KHÔNG đổi trong patch chunked.
     * Hash số ngắn → an toàn nhét vào attribute + so sánh nhanh.
     * @param {object} comment
     * @returns {string}
     */
    _rowSig(comment) {
        const state = window.LiveState;
        const fromId = comment.from?.id || '';
        const partner = state.partnerCache.get(fromId) || {};
        const kho = state.customerKhoCache?.get(fromId);
        const phone = partner.Phone || kho?.phone || '';
        const address = partner.Street || kho?.address || '';
        const raw = state.sessionIndexMap.get(fromId);
        const si = raw?.source === 'NATIVE_WEB' ? raw : null;
        const inOrder = si && Array.isArray(si.commentIds) && si.commentIds.includes(comment.id);
        const saved =
            state.savedToLiveIds.has(fromId) ||
            window.pancakeChatManager?.liveSavedCustomerIds?.has(fromId)
                ? 1
                : 0;
        const s = [
            phone,
            address,
            partner.StatusText || '',
            si?.code || '',
            si?.index || '',
            inOrder ? 1 : 0,
            comment.is_hidden ? 1 : 0,
            comment.message || '',
            saved,
            state.showDebt ? 1 : 0,
            state.showZeroDebt ? 1 : 0,
        ].join('');
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return String(h);
    },

    /**
     * Quyết định full render vs patch chunked dựa trên tập comment có đổi cấu trúc
     * (id/thứ tự) hay không.
     */
    _renderDispatch() {
        const state = window.LiveState;
        const listContainer = document.getElementById('liveCommentList');
        if (!listContainer) return;
        // Full render chunked đang chạy → KHÔNG cắt (cắt = restart từ 0 = thrash,
        // đo được 4 full render thay vì 1). Đánh dấu pending, xong full render sẽ
        // tự patch phần enrichment đến trong lúc đó.
        if (this._fullRenderHandle != null) {
            this._pendingDirty = true;
            return;
        }
        const visible = this._visibleComments();
        const rendered = listContainer.querySelectorAll('.live-conversation-item');
        const sameStructure =
            rendered.length > 0 &&
            rendered.length === visible.length &&
            Array.from(rendered).every((el, i) => el.dataset.commentId === String(visible[i].id));
        if (sameStructure) {
            this._patchRowsChunked();
        } else {
            this.renderCommentsNow();
        }
    },

    /**
     * Patch in-place các dòng có signature đổi, CHUNKED qua requestIdleCallback.
     * Không block main-thread → hết giật khi enrichment cập nhật 758 dòng.
     * Coalesce: pass enrichment mới hủy chunk-loop cũ, chạy lại với data mới nhất.
     */
    _patchRowsChunked() {
        const state = window.LiveState;
        const listContainer = document.getElementById('liveCommentList');
        if (!listContainer) return;
        // Hủy chunk-loop đang chạy (nếu có) để coalesce.
        if (this._chunkHandle != null) {
            clearTimeout(this._chunkHandle);
            this._chunkHandle = null;
        }
        // Map id→element 1 lần (tránh querySelector O(n) trong loop).
        const rowMap = new Map();
        listContainer
            .querySelectorAll('.live-conversation-item')
            .forEach((el) => rowMap.set(el.dataset.commentId, el));
        const comments = this._visibleComments();
        const schedule = (cb) => setTimeout(cb, 0);
        const CHUNK = 25;
        // Abort chunk-loop nếu full re-render xảy ra giữa chừng (gen đổi) —
        // rowMap khi đó trỏ tới element cũ đã bị thay.
        const gen = (this._renderGen = this._renderGen || 0);
        let i = 0;
        const step = () => {
            if (gen !== this._renderGen) {
                this._chunkHandle = null;
                return;
            }
            const end = Math.min(i + CHUNK, comments.length);
            while (i < end) {
                const c = comments[i++];
                const old = rowMap.get(String(c.id));
                if (!old) continue;
                // Skip dòng không đổi data → không tốn CPU rebuild thừa.
                if (old.dataset.sig === this._rowSig(c)) continue;
                const tmp = document.createElement('div');
                tmp.innerHTML = this.renderCommentItem(c).trim();
                const neo = tmp.firstElementChild;
                if (neo) old.replaceWith(neo);
            }
            if (i < comments.length) {
                this._chunkHandle = schedule(step);
            } else {
                this._chunkHandle = null;
                this.updateLoadMoreIndicator();
                this._attachWalletBalances();
                if (this._pendingDirty) {
                    this._pendingDirty = false;
                    this._renderDispatch();
                }
            }
        };
        this._chunkHandle = schedule(step);
    },

    /**
     * Render the full comment list — synchronous (no coalescing).
     */
    renderCommentsNow() {
        const state = window.LiveState;
        const listContainer = document.getElementById('liveCommentList');
        if (!listContainer) return;

        // Bump generation: mọi batch append/patch chunked đang chạy trên DOM cũ
        // phải abort (xem _appendOlderBatch / _patchRowsChunked). SSE unshift →
        // structural change → đi qua đây → gen bump cover luôn race SSE.
        this._renderGen = (this._renderGen || 0) + 1;

        if (state.comments.length === 0) {
            listContainer.innerHTML = `
                <div class="live-empty">
                    <i data-lucide="message-square"></i>
                    <span>Chưa có comment nào</span>
                    <p style="font-size: 12px; color: #94a3b8; margin-top: 8px;">
                        Comment mới sẽ tự động hiển thị khi có người bình luận
                    </p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Render TĂNG DẦN (chunked) qua requestIdleCallback. Build sync 700+ rows
        // (innerHTML) block main-thread ~500ms/lần = giật. Chia 25 rows/tick, append
        // dần → không lần nào block > ~1 frame. Rows hiện progressive (mượt).
        // Hủy render-loop cũ để coalesce (campaign change / enrichment chồng nhau).
        if (this._fullRenderHandle != null) {
            clearTimeout(this._fullRenderHandle);
            this._fullRenderHandle = null;
        }
        // Chỉ render N comment MỚI NHẤT (cap). Cuộn xuống đáy → _appendOlderBatch.
        // Scheduler = setTimeout (KHÔNG requestIdleCallback): khi load 4 campaign
        // main-thread bận liên tục → rIC bị starve → render đứng giữa chừng. setTimeout
        // luôn fire. Cap 200 rows nên mỗi chunk nhẹ, không block.
        const comments = this._visibleComments();
        const schedule = (cb) => setTimeout(cb, 0);
        const CHUNK = 25;
        listContainer.innerHTML = '';
        let i = 0;
        const step = () => {
            const parts = [];
            const end = Math.min(i + CHUNK, comments.length);
            for (; i < end; i++) parts.push(this.renderCommentItem(comments[i]));
            listContainer.insertAdjacentHTML('beforeend', parts.join(''));
            if (i < comments.length) {
                this._fullRenderHandle = schedule(step);
            } else {
                this._fullRenderHandle = null;
                this._ensureScrollSentinel(); // infinite-scroll sentinel ở cuối
                this.updateLoadMoreIndicator();
                this._attachWalletBalances();
                // Enrichment đến trong lúc render → patch nốt phần đã render stale.
                if (this._pendingDirty) {
                    this._pendingDirty = false;
                    this._renderDispatch();
                }
            }
        };
        this._fullRenderHandle = schedule(step);
        // Icon trong item là inline SVG (liveSvgIcon) → KHÔNG cần lucide.createIcons()
        // quét toàn DOM. Đây là perf fix chính (700+ icon scan/render → 0).
    },

    /**
     * Show loading state in comment list
     */
    showLoading() {
        const listContainer = document.getElementById('liveCommentList');
        if (!listContainer) return;
        listContainer.innerHTML = `
            <div class="live-loading">
                <i data-lucide="loader-2" class="spin"></i>
                <span>Đang tải comment...</span>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    /**
     * Show error state in comment list
     * @param {string} message
     */
    showError(message) {
        const listContainer = document.getElementById('liveCommentList');
        if (!listContainer) return;
        listContainer.innerHTML = `
            <div class="live-error">
                <i data-lucide="alert-circle"></i>
                <span>Lỗi: ${SharedUtils.escapeHtml(String(message || ''))}</span>
                <button class="live-btn-retry" onclick="window.eventBus.emit('live:refreshRequested')">Thử lại</button>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    /**
     * Render a single comment item
     * @param {object} comment
     * @returns {string} HTML string
     */
    renderCommentItem(comment) {
        const state = window.LiveState;
        const id = comment.id;
        const message = comment.message || '';
        const fromName = comment.from?.name || 'Unknown';
        const fromId = comment.from?.id || '';
        const createdTime = comment.created_time;
        const isHidden = comment.is_hidden;

        // Avatar
        // Avatar: use comment's page ID (multi-campaign) or selected page
        const commentPageId = comment._pageId || state.selectedPage?.Facebook_PageId;
        const directPictureUrl = comment.from?.picture?.data?.url || '';
        const pictureUrl = SharedUtils.getAvatarUrl(fromId, commentPageId, null, directPictureUrl);
        const timeStr = SharedUtils.formatTime(createdTime);

        // Page badge (show when multiple pages selected)
        const pageName =
            comment._pageName ||
            state.selectedPage?.Name ||
            state.selectedCampaign?.Facebook_UserName ||
            '';
        const isMultiPage = state.selectedPages && state.selectedPages.length > 1;
        const isStore = pageName.toLowerCase().includes('store');
        const pageBadgeColor = isStore
            ? 'background:#fef3c7;color:#92400e'
            : 'background:#dbeafe;color:#1e40af';
        const shortPageName = pageName.replace('NhiJudy ', '').replace('Nhi Judy ', '');

        // SessionIndex badge + Order info — CHỈ lấy theo native-orders (Web 2.0).
        // Bỏ hoàn toàn data đơn Live legacy (id/mã đơn Live, STT Live) theo yêu
        // cầu: Live panel chỉ cần comment/SĐT/địa chỉ/KH/trạng thái + STT đơn web.
        const sessionInfoRaw = state.sessionIndexMap.get(fromId);
        const sessionInfo = sessionInfoRaw?.source === 'NATIVE_WEB' ? sessionInfoRaw : null;
        const sessionIndexBadge = sessionInfo
            ? `<span class="session-index-badge" title="STT đơn web: ${liveAttr(sessionInfo.index)}${sessionInfo.code ? ' | Mã: ' + liveAttr(sessionInfo.code) : ''}">${SharedUtils.escapeHtml(String(sessionInfo.index))}</span>`
            : '';
        // Comment đã được merge vào đơn này chưa?
        const isCommentInOrder =
            sessionInfo &&
            Array.isArray(sessionInfo.commentIds) &&
            sessionInfo.commentIds.includes(id);
        const orderBadge = sessionInfo?.code
            ? `<span class="order-code-badge" title="Đơn web ${liveAttr(sessionInfo.code)}" style="background:#ede9fe;color:#6d28d9;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600;cursor:pointer" data-action="order-detail" data-from-id="${liveAttr(fromId)}">${SharedUtils.escapeHtml(sessionInfo.code)}</span>`
            : '';

        // Gradient placeholder
        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        ];
        const colorIndex = fromName.charCodeAt(0) % colors.length;
        const gradientColor = colors[colorIndex];
        const initial = fromName.charAt(0).toUpperCase();

        // Partner info from cache
        const partner = state.partnerCache.get(fromId) || {};
        const statusText = partner.StatusText || '';
        const statusColor = this.getStatusColor(statusText);
        const statusBg = statusColor ? `${statusColor}18` : '';
        // SĐT/địa chỉ: warehouse trước → kho KH → SĐT Pancake CỦA CHÍNH COMMENT
        // (recent_phone_numbers — khách comment kèm SĐT ở Pancake) lấp chỗ trống
        // cho KH chưa có trong kho. "Lấy thông tin khách ở Pancake nếu có".
        const kho = state.customerKhoCache?.get(fromId);
        const pancakePhone = (() => {
            const arr = comment._phones;
            const ph = Array.isArray(arr) && arr.length ? arr[0] : null;
            if (ph) return (typeof ph === 'string' ? ph : ph.phone_number || ph.phone || '') || '';
            // Khách tự gõ SĐT trong nội dung comment ("0766..." / "+84...").
            const m = String(comment.message || '')
                .replace(/[.\s()\-_]/g, '')
                .match(/(?:\+?84|0)(\d{9})(?!\d)/);
            return m ? '0' + m[1] : '';
        })();
        const phone = partner.Phone || kho?.phone || pancakePhone || '';
        const address = partner.Street || kho?.address || '';

        // Số dư ví Web 2.0 (thay cho "Nợ Live" cũ — user yêu cầu 2026-06-06).
        // Render placeholder [data-w2wallet-phone]; Web2WalletBalance.attachBalances
        // (gọi sau mỗi render) fetch số dư + inject pill "Ví: X₫" (chỉ hiện khi >0).
        const walletPlaceholder = phone
            ? `<span data-w2wallet-phone="${SharedUtils.escapeHtml(phone)}"></span>`
            : '';

        // Check saved-to-Live
        const isSavedToLive =
            state.savedToLiveIds.has(fromId) ||
            window.pancakeChatManager?.liveSavedCustomerIds?.has(fromId);

        // Status dropdown: render LAZY — chỉ build 8 options khi user click vào
        // badge (toggleInlineStatusDropdown). Tránh tạo 8 × N node ẩn sẵn.

        // Status badge style
        const statusBadgeStyle = statusColor
            ? `background:${statusBg};color:${statusColor};border:1px solid ${statusColor}30;`
            : 'background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;';

        // User data (id/fromId/fromName/pageId…) đi qua data-* attribute (liveAttr
        // escape cả dấu ") + delegated listener (_onListClick) — KHÔNG inline onclick.
        const idA = liveAttr(id);
        const fromIdA = liveAttr(fromId);
        const nameA = liveAttr(fromName);
        const pageIdA = liveAttr(commentPageId || '');
        return `
            <div class="live-conversation-item ${isHidden ? 'is-hidden' : ''}"
                 data-comment-id="${idA}"
                 data-sig="${this._rowSig(comment)}">

                <!-- Row 1: Avatar + Name + Status + Time -->
                <div class="live-conv-row1">
                    <div class="live-conv-avatar">
                        ${
                            pictureUrl
                                ? `<img src="${liveAttr(pictureUrl)}" class="avatar-img" alt="${nameA}" loading="lazy" decoding="async" width="40" height="40" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                               <div class="avatar-placeholder" style="display:none;background:${gradientColor};">${initial}</div>`
                                : `<div class="avatar-placeholder" style="background:${gradientColor};">${initial}</div>`
                        }
                        ${sessionIndexBadge}
                        <span class="channel-badge">${liveSvgIcon('facebook', 12, 'channel-icon fb')}</span>
                    </div>
                    <div class="live-conv-header-info">
                        <div class="live-conv-header">
                            <span class="customer-name" data-action="show-customer" data-from-id="${fromIdA}" data-name="${nameA}" data-page-id="${pageIdA}" title="Xem thông tin">${SharedUtils.escapeHtml(fromName)}</span>
                            ${walletPlaceholder}
                            ${isMultiPage ? `<span class="live-tag" style="${pageBadgeColor}">${SharedUtils.escapeHtml(shortPageName)}</span>` : ''}
                            ${orderBadge || ''}
                            ${isHidden ? '<span class="live-tag" style="background:#fee2e2;color:#dc2626;">Ẩn</span>' : ''}
                        </div>
                    </div>
                    <div class="inline-status-container">
                        <div id="status-btn-${fromIdA}" class="live-status-badge" style="${statusBadgeStyle}"
                             data-action="toggle-status" data-from-id="${fromIdA}">
                            <span id="status-text-${fromIdA}">${SharedUtils.escapeHtml(statusText) || 'Trạng thái'}</span>
                        </div>
                        <div id="status-dropdown-${fromIdA}" class="live-status-dropdown" style="display:none;" data-loaded="0"></div>
                    </div>
                    <span class="live-conv-time">${timeStr}</span>
                </div>

                <!-- Row 2: Message -->
                <div class="live-conv-message">${SharedUtils.escapeHtml(message)}</div>

                <!-- Row 3: Phone + Address -->
                <div class="live-conv-info">
                    <input type="text" id="phone-${fromIdA}" value="${liveAttr(phone)}" placeholder="SĐT" style="width:100px;">
                    <button class="live-action-btn" style="width:22px;height:22px;" data-action="save-phone" data-from-id="${fromIdA}" title="Lưu SĐT">
                        ${liveSvgIcon('save', 11)}
                    </button>
                    <input type="text" id="addr-${fromIdA}" value="${liveAttr(address)}" placeholder="Địa chỉ" style="flex:1;min-width:100px;">
                    <button class="live-action-btn" style="width:22px;height:22px;" data-action="save-address" data-from-id="${fromIdA}" title="Lưu địa chỉ">
                        ${liveSvgIcon('save', 11)}
                    </button>
                </div>

                <!-- Actions — show on hover -->
                <div class="live-conv-actions">
                    ${(() => {
                        // Button title + icon theo trạng thái đơn WEB (native-orders):
                        //  - Chưa có đơn → "Tạo đơn web" (shopping-cart)
                        //  - Có đơn, comment chưa gộp → "Thêm comment vào đơn" (plus-square)
                        //  - Có đơn, comment đã gộp → "Đã thêm vào đơn" (check-square)
                        let btnTitle, btnIcon, btnColor;
                        if (!sessionInfo) {
                            btnTitle = 'Tạo đơn web';
                            btnIcon = 'shopping-cart';
                            btnColor = '#7c3aed';
                        } else if (isCommentInOrder) {
                            btnTitle = `Comment đã thêm vào đơn ${sessionInfo.code}`;
                            btnIcon = 'check-square';
                            btnColor = '#10b981';
                        } else {
                            btnTitle = `Thêm comment vào đơn ${sessionInfo.code}`;
                            btnIcon = 'plus-square';
                            btnColor = '#7c3aed';
                        }
                        return `<button class="live-action-btn" id="create-order-${fromIdA}-${idA}" title="${liveAttr(btnTitle)}" style="color:${btnColor};" data-action="create-order" data-from-id="${fromIdA}" data-name="${nameA}" data-comment-id="${idA}">
                                   ${liveSvgIcon(btnIcon, 13)}
                               </button>`;
                    })()}
                    <button class="live-action-btn" title="Xem info" data-action="show-info" data-from-id="${fromIdA}" data-name="${nameA}">
                        ${liveSvgIcon('user', 13)}
                    </button>
                    ${
                        partner.Id
                            ? `<a class="live-action-btn" title="Mở thẻ KH Web 2.0" href="../web2/partner-customer/index.html?id=${encodeURIComponent(partner.Id)}" target="_blank" rel="noopener" style="color:#0891b2;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">
                        ${liveSvgIcon('contact', 13)}
                    </a>`
                            : ''
                    }
                    <button class="live-action-btn" title="Mở hội thoại chat với khách (full chức năng)" style="color:#2563eb;" data-action="open-chat" data-from-id="${fromIdA}" data-name="${nameA}" data-page-id="${pageIdA}">
                        ${liveSvgIcon('message-circle', 13)}
                    </button>
                    <button class="live-action-btn" title="Trả lời" data-action="reply" data-comment-id="${idA}" data-from-id="${fromIdA}">
                        ${liveSvgIcon('reply', 13)}
                    </button>
                    <button class="live-action-btn" title="${isHidden ? 'Hiện' : 'Ẩn'}" data-action="toggle-hide" data-comment-id="${idA}" data-hide-next="${!isHidden}">
                        ${liveSvgIcon(isHidden ? 'eye' : 'eye-off', 13)}
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Status options for partner
     * @returns {Array<{value: string, text: string, color: string}>}
     */
    /**
     * Get color for a status text
     * @param {string} statusText
     * @returns {string} color hex or empty
     */
    getStatusColor(statusText) {
        if (!statusText) return '';
        const opt = this.getStatusOptions().find((o) => o.text === statusText);
        return opt ? opt.color : '';
    },

    getStatusOptions() {
        return [
            { value: '#5cb85c_Bình thường', text: 'Bình thường', color: '#5cb85c' },
            { value: '#d9534f_Bom hàng', text: 'Bom hàng', color: '#d9534f' },
            { value: '#f0ad4e_Cảnh báo', text: 'Cảnh báo', color: '#f0ad4e' },
            { value: '#5bc0de_Khách sỉ', text: 'Khách sỉ', color: '#5bc0de' },
            { value: '#d9534f_Nguy hiểm', text: 'Nguy hiểm', color: '#d9534f' },
            { value: '#337ab7_Thân thiết', text: 'Thân thiết', color: '#337ab7' },
            { value: '#9c27b0_Vip', text: 'Vip', color: '#9c27b0' },
            { value: '#ff9800_VIP', text: 'VIP', color: '#ff9800' },
        ];
    },

    /**
     * Select a comment (highlight + emit event)
     * @param {string} commentId
     */
    selectComment(commentId) {
        const state = window.LiveState;

        document.querySelectorAll('.live-conversation-item').forEach((item) => {
            item.classList.remove('selected');
        });
        const selectedItem = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (selectedItem) selectedItem.classList.add('selected');

        // So sánh String-safe: commentId từ dataset là string, c.id có thể là number.
        const comment = state.comments.find((c) => String(c.id) === String(commentId));
        if (comment) {
            window.eventBus.emit('live:commentSelected', { comment });
            window.dispatchEvent(new CustomEvent('liveCommentSelected', { detail: { comment } }));
        }
    },

    /**
     * Toggle inline status dropdown for a list item
     * @param {string} userId
     */
    toggleInlineStatusDropdown(userId) {
        const dropdown = document.getElementById(`status-dropdown-${userId}`);
        if (!dropdown) return;
        // Lazy build options lần đầu mở (tránh render 8 × N node ẩn sẵn).
        if (dropdown.dataset.loaded !== '1') {
            dropdown.innerHTML = this.getStatusOptions()
                .map(
                    (opt) =>
                        `<div class="inline-status-option" style="padding:6px 10px;cursor:pointer;font-size:11px;color:${opt.color};font-weight:600;"
                 data-action="select-status" data-from-id="${liveAttr(userId)}" data-value="${liveAttr(opt.value)}" data-text="${liveAttr(opt.text)}">
                ${SharedUtils.escapeHtml(opt.text)}
            </div>`
                )
                .join('');
            dropdown.dataset.loaded = '1';
        }
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    },

    /**
     * Select inline status and save via API
     * @param {string} userId
     * @param {string} value
     * @param {string} text
     */
    async selectInlineStatus(userId, value, text) {
        const state = window.LiveState;

        // Hide dropdown
        const dropdown = document.getElementById(`status-dropdown-${userId}`);
        if (dropdown) dropdown.style.display = 'none';

        // Get partner from cache (cần Id để gọi API)
        const partner = state.partnerCache.get(userId);
        if (!partner || !partner.Id) {
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy thông tin khách hàng');
            }
            return;
        }

        const color = this.getStatusColor(text);
        const _applyBadge = (txt, col) => {
            const statusTextEl = document.getElementById(`status-text-${userId}`);
            if (statusTextEl) statusTextEl.textContent = txt || 'Trạng thái';
            const statusBtn = document.getElementById(`status-btn-${userId}`);
            if (statusBtn) {
                statusBtn.style.color = col || '#64748b';
                statusBtn.style.background = col ? `${col}18` : '#f1f5f9';
                statusBtn.style.borderColor = col ? `${col}30` : '#e2e8f0';
            }
        };

        // UI-first: cập nhật badge + cache NGAY, backend background, rollback nếu lỗi.
        if (window.Web2Optimistic?.run) {
            window.Web2Optimistic.run({
                snapshot: () => ({
                    text: partner.StatusText || '',
                    color: this.getStatusColor(partner.StatusText || ''),
                }),
                apply: () => {
                    _applyBadge(text, color);
                    partner.StatusText = text;
                    state.partnerCache.set(userId, partner);
                },
                run: async () => {
                    const ok = await window.LiveApi.updatePartnerStatusViaProxy(partner.Id, value);
                    if (!ok) throw new Error('cập nhật thất bại');
                    return ok;
                },
                rollback: (prev) => {
                    _applyBadge(prev.text, prev.color);
                    partner.StatusText = prev.text;
                    state.partnerCache.set(userId, partner);
                },
                successMsg: 'Đã cập nhật trạng thái',
                errLabel: 'cập nhật trạng thái',
            });
            return;
        }

        // Fallback legacy (không có helper): update UI rồi await.
        _applyBadge(text, color);
        const success = await window.LiveApi.updatePartnerStatusViaProxy(partner.Id, value);
        if (success) {
            partner.StatusText = text;
            state.partnerCache.set(userId, partner);
            if (window.notificationManager)
                window.notificationManager.success('Đã cập nhật trạng thái');
        } else {
            if (window.notificationManager)
                window.notificationManager.error('Lỗi cập nhật trạng thái');
        }
    },

    /**
     * Save phone inline edit
     * @param {string} userId
     * @param {string} inputId
     */
    async saveInlinePhone(userId, inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        const newPhone = input.value.trim();
        if (!newPhone) {
            if (window.notificationManager)
                window.notificationManager.show('Vui lòng nhập số điện thoại', 'warning');
            return;
        }

        const state = window.LiveState;
        const partner = state.partnerCache?.get(userId) || {};

        // UI-first: cache SĐT NGAY (input đã hiển thị giá trị mới), backend background.
        if (window.Web2Optimistic?.run) {
            window.Web2Optimistic.run({
                snapshot: () => partner.Phone || '',
                apply: () => {
                    partner.Phone = newPhone;
                    state.partnerCache?.set(userId, partner);
                },
                run: async () => {
                    await window.LiveApi.savePartnerData(userId, { Phone: newPhone });
                },
                rollback: (prev) => {
                    partner.Phone = prev;
                    state.partnerCache?.set(userId, partner);
                    if (input) input.value = prev || '';
                },
                successMsg: 'Đã lưu số điện thoại',
                errLabel: 'lưu SĐT',
            });
            return;
        }

        // Fallback legacy.
        try {
            await window.LiveApi.savePartnerData(userId, { Phone: newPhone });
            partner.Phone = newPhone;
            state.partnerCache?.set(userId, partner);
            if (window.notificationManager)
                window.notificationManager.success('Đã lưu số điện thoại');
        } catch (error) {
            if (window.notificationManager)
                window.notificationManager.error('Lỗi lưu SĐT: ' + error.message);
        }
    },

    /**
     * Save address inline edit
     * @param {string} userId
     * @param {string} inputId
     */
    async saveInlineAddress(userId, inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        const newAddress = input.value.trim();
        const state = window.LiveState;
        const partner = state.partnerCache?.get(userId) || {};

        // UI-first: cache địa chỉ NGAY, backend background, rollback nếu lỗi.
        if (window.Web2Optimistic?.run) {
            window.Web2Optimistic.run({
                snapshot: () => partner.Street || '',
                apply: () => {
                    partner.Street = newAddress;
                    state.partnerCache?.set(userId, partner);
                },
                run: async () => {
                    await window.LiveApi.savePartnerData(userId, { Street: newAddress });
                },
                rollback: (prev) => {
                    partner.Street = prev;
                    state.partnerCache?.set(userId, partner);
                    if (input) input.value = prev || '';
                },
                successMsg: 'Đã lưu địa chỉ',
                errLabel: 'lưu địa chỉ',
            });
            return;
        }

        // Fallback legacy.
        try {
            await window.LiveApi.savePartnerData(userId, { Street: newAddress });
            partner.Street = newAddress;
            state.partnerCache?.set(userId, partner);
            if (window.notificationManager) window.notificationManager.success('Đã lưu địa chỉ');
        } catch (error) {
            if (window.notificationManager)
                window.notificationManager.error('Lỗi lưu địa chỉ: ' + error.message);
        }
    },

    /**
     * Handle save to Live button click (the "+" button)
     * @param {string} customerId
     * @param {string} customerName
     */
    async handleSaveToLive(customerId, customerName) {
        const state = window.LiveState;
        if (!customerId || !customerName) {
            if (window.notificationManager)
                window.notificationManager.show('Thiếu thông tin khách hàng', 'error');
            return;
        }

        const partner = state.partnerCache.get(customerId) || {};
        const phone = partner.Phone || '';
        const address = partner.Street || '';

        const notes = [
            phone ? `SĐT: ${phone}` : '',
            address ? `Địa chỉ: ${address}` : '',
            state.selectedCampaign?.title ? `Campaign: ${state.selectedCampaign.title}` : '',
        ]
            .filter(Boolean)
            .join(' | ');

        try {
            const result = await window.LiveApi.saveToLive(customerId, customerName, notes);

            if (result.success) {
                state.savedToLiveIds.add(customerId);

                // Update Pancake's saved IDs cache
                if (window.pancakeChatManager) {
                    window.pancakeChatManager.liveSavedCustomerIds.add(customerId);
                    if (window.pancakeChatManager.filterType === 'live-saved') {
                        window.pancakeChatManager.renderConversationList();
                    }
                }

                this.updateSaveButtonToCheckmark(customerId);

                if (window.notificationManager)
                    window.notificationManager.show(`Đã lưu: ${customerName}`, 'success');
            } else {
                throw new Error(result.message || 'Lỗi không xác định');
            }
        } catch (error) {
            console.error('[Live-LIST] Error saving to Live:', error);
            if (window.notificationManager)
                window.notificationManager.show(`Lỗi: ${error.message}`, 'error');
        }
    },

    /**
     * Replace save button with checkmark without full re-render
     * @param {string} customerId
     */
    updateSaveButtonToCheckmark(customerId) {
        const state = window.LiveState;
        const container = document.getElementById(state.containerId);
        if (!container) return;

        const saveBtn = container.querySelector(
            `button[onclick*="handleSaveToLive('${customerId}'"]`
        );
        if (saveBtn) {
            const checkmark = document.createElement('span');
            checkmark.className = 'live-saved-badge';
            checkmark.title = 'Đã lưu vào Live';
            checkmark.style.cssText = 'color: #10b981; padding: 4px;';
            checkmark.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i>';
            saveBtn.replaceWith(checkmark);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    },

    /**
     * Update connection status indicator
     * @param {boolean} connected
     * @param {string} [type='sse']
     */
    updateConnectionStatus(connected, type = 'sse') {
        const indicator = document.getElementById('liveStatusIndicator');
        if (!indicator) return;

        const dot = indicator.querySelector('.status-dot');
        const text = indicator.querySelector('.status-text');

        if (connected) {
            dot?.classList.remove('disconnected');
            dot?.classList.add('connected');
            if (text) text.textContent = type === 'sse' ? 'Live' : 'Connected';
        } else {
            dot?.classList.remove('connected');
            dot?.classList.add('disconnected');
            if (text) text.textContent = 'Offline';
        }
    },

    /**
     * Set debt display settings and re-render
     * @param {boolean} showDebt
     * @param {boolean} showZeroDebt
     */
    setDebtDisplaySettings(showDebt, showZeroDebt) {
        const state = window.LiveState;
        state.showDebt = showDebt;
        state.showZeroDebt = showZeroDebt;
        this.renderComments();
    },

    /**
     * Show inline reply input under a comment
     * @param {string} commentId
     * @param {string} fromId
     */
    showReplyInput(commentId, fromId) {
        // Remove any existing reply input
        document.querySelectorAll('.live-reply-input-row').forEach((el) => el.remove());

        const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (!commentEl) return;

        // Build bằng DOM API + addEventListener trực tiếp (KHÔNG inline onclick
        // chứa commentId — XSS-safe; replyRow stopPropagation nên delegation
        // trên list không nhận được click bên trong).
        const replyRow = document.createElement('div');
        replyRow.className = 'live-reply-input-row';
        replyRow.style.cssText =
            'display:flex;gap:6px;padding:8px 12px;background:#f8fafc;border-top:1px solid #e5e7eb;align-items:center;';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `reply-input-${commentId}`;
        input.placeholder = 'Trả lời comment...';
        input.style.cssText =
            'flex:1;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;';
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendReply(commentId);
        });

        const sendBtn = document.createElement('button');
        sendBtn.textContent = 'Gửi';
        sendBtn.style.cssText =
            'padding:6px 12px;background:#3b82f6;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;';
        sendBtn.addEventListener('click', () => this.sendReply(commentId));

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText =
            'padding:6px 8px;background:transparent;border:none;cursor:pointer;color:#6b7280;';
        closeBtn.addEventListener('click', () => replyRow.remove());

        replyRow.append(input, sendBtn, closeBtn);
        replyRow.addEventListener('click', (e) => e.stopPropagation());
        commentEl.appendChild(replyRow);
        input.focus();
    },

    /**
     * Send reply to a comment via API
     * @param {string} commentId
     */
    async sendReply(commentId) {
        const input = document.getElementById(`reply-input-${commentId}`);
        const message = input?.value?.trim();
        if (!message) return;

        const state = window.LiveState;
        const pageId = state.selectedPage?.Facebook_PageId;
        if (!pageId) return;

        // Disable input while sending
        input.disabled = true;
        const sendBtn = input.nextElementSibling;
        if (sendBtn) {
            sendBtn.textContent = '...';
            sendBtn.disabled = true;
        }

        const result = await window.LiveApi.replyToComment(pageId, commentId, message);
        if (result) {
            // Remove reply input
            const replyRow = input.closest('.live-reply-input-row');
            if (replyRow) replyRow.remove();
            if (window.notificationManager)
                window.notificationManager.show('Đã trả lời comment!', 'success');
        } else {
            input.disabled = false;
            if (sendBtn) {
                sendBtn.textContent = 'Gửi';
                sendBtn.disabled = false;
            }
            if (window.notificationManager)
                window.notificationManager.show('Lỗi gửi trả lời', 'error');
        }
    },

    /**
     * Create a NATIVE-WEB order from a comment.
     * NOTE: This no longer hits Live. It writes to our own PostgreSQL
     * via /api/native-orders/from-comment. Orders are tagged
     * source='NATIVE_WEB' so they are clearly distinct from Live orders.
     * @param {string} fromId - Facebook user ID
     * @param {string} fromName - Customer name
     * @param {string} commentId - Comment ID
     */
    async createOrder(fromId, fromName, commentId) {
        const state = window.LiveState;

        const comment = state.comments.find((c) => String(c.id) === String(commentId));
        const pageObj = comment?._pageObj || state.selectedPage;
        const crmTeamId = pageObj?.Id;
        // Resolve the campaign that owns this comment so we can persist it on the
        // native order (used by native-orders page filter chip).
        const campaignObj = comment?._campaignId
            ? state.liveCampaigns.find((c) => c.Id === comment._campaignId)
            : state.selectedCampaign;
        const postId = campaignObj?.Facebook_LiveId;
        const liveCampaignId = campaignObj?.Id ? String(campaignObj.Id) : null;
        const liveCampaignName = campaignObj?.Name || null;
        const fbPageId = pageObj?.Facebook_PageId || pageObj?.FacebookPageId;
        const message = comment?.message || '';

        // Inline field values (user may have typed into phone/addr inputs)
        const phoneEl = document.getElementById(`phone-${fromId}`);
        const addrEl = document.getElementById(`addr-${fromId}`);
        const phone = phoneEl ? phoneEl.value.trim() : '';
        const address = addrEl ? addrEl.value.trim() : '';

        const btn = document.getElementById(`create-order-${fromId}-${commentId}`);
        const previousIcon =
            btn?.querySelector('i')?.getAttribute('data-lucide') || 'shopping-cart';
        if (btn) {
            btn.innerHTML =
                '<i data-lucide="loader-2" class="spin" style="width:14px;height:14px;"></i>';
            btn.disabled = true;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        try {
            if (!window.NativeOrdersApi) {
                throw new Error('NativeOrdersApi not loaded');
            }

            const currentUser = window.AuthManager?.getCurrentUser?.() || {};

            // Page name để bên native-orders ghi nguồn comment (mỗi message
            // prefix '[Tên Page] ...') → user thấy comment đến từ page nào
            // khi nhiều page comment cùng 1 KH gộp 1 đơn.
            const fbPageName =
                pageObj?.Name ||
                pageObj?.PageName ||
                pageObj?.Facebook_PageName ||
                comment?._pageName ||
                null;

            const resp = await window.NativeOrdersApi.createFromComment({
                fbUserId: fromId,
                fbUserName: fromName,
                fbPageId: fbPageId ? String(fbPageId) : null,
                fbPageName,
                fbPostId: postId || null,
                fbCommentId: commentId,
                crmTeamId: crmTeamId || null,
                liveCampaignId,
                liveCampaignName,
                message,
                phone,
                address,
                createdBy: currentUser.uid || currentUser.email || null,
                createdByName: currentUser.displayName || currentUser.email || null,
            });

            const order = resp?.order;
            if (!order || !order.code) {
                throw new Error('Server did not return an order');
            }

            // Update sessionIndexMap with commentCount + commentIds so next
            // render reflects merge state correctly.
            state.sessionIndexMap.set(fromId, {
                index: order.sessionIndex || '?',
                code: order.code,
                source: 'NATIVE_WEB',
                commentCount: Number(order.commentCount || 1),
                commentIds: Array.isArray(order.commentIds) ? order.commentIds : [],
            });

            // Re-render only this comment item so its button icon + count badge
            // refresh without redrawing the whole list.
            this.refreshCommentItem(commentId);

            if (window.notificationManager) {
                let label,
                    type = 'success';
                if (resp.idempotent) {
                    label = `✓ Comment đã có trong đơn (${order.commentCount} comments)`;
                    type = 'info';
                } else if (resp.merged) {
                    label = `📝 Đã thêm comment vào đơn (${order.commentCount} comments)`;
                    type = 'info';
                } else {
                    label = '🆕 Đã tạo đơn web';
                }
                window.notificationManager.show(
                    `${label}: ${order.code} (STT: ${order.displayStt ?? order.sessionIndex})`,
                    type
                );
            }
        } catch (error) {
            // Restore button to clickable state with the previous icon
            const restoreBtn = document.getElementById(`create-order-${fromId}-${commentId}`);
            if (restoreBtn) {
                restoreBtn.innerHTML = `<i data-lucide="${previousIcon}" style="width:14px;height:14px;"></i>`;
                restoreBtn.disabled = false;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
            if (window.notificationManager)
                window.notificationManager.show('Lỗi tạo đơn web: ' + error.message, 'error');
        }
    },

    /**
     * Re-render a single comment item by id (used after createOrder to refresh
     * button icon + count badge without redrawing the whole list).
     *
     * 2026-05-31 (user feedback "tạo đơn bị đứng 1 chút"):
     * - Refresh CHỈ clicked item synchronous → UI nhận update tức thì.
     * - Cross-fromId batch refresh defer qua requestIdleCallback + chunks of
     *   10 mỗi tick → không block main thread khi livestream có 100+ comments.
     * - lucide.createIcons() chỉ scope vào subtree mới (truyền nodes array)
     *   thay vì scan toàn doc.
     * @param {string} commentId
     */
    refreshCommentItem(commentId) {
        const state = window.LiveState;
        const item = document.querySelector(
            `.live-conversation-item[data-comment-id="${commentId}"]`
        );
        if (!item) return;
        const comment = state.comments.find((c) => String(c.id) === String(commentId));
        if (!comment) return;
        const html = this.renderCommentItem(comment);
        const tmp = document.createElement('div');
        tmp.innerHTML = html.trim();
        const newItem = tmp.firstElementChild;
        if (!newItem) return;
        item.replaceWith(newItem);
        // Icon item là inline SVG → không cần createIcons.

        // Also refresh other comment items for the same customer so their
        // count badges & button states update (e.g. when merge changes count
        // from 1→2, other rows for same fromId should now show "2 comments").
        const fromId = comment.from?.id;
        if (!fromId) return;
        const others = state.comments.filter(
            (c) => String(c.id) !== String(commentId) && c.from?.id === fromId
        );
        if (!others.length) return;

        // Defer cross-item refresh qua requestIdleCallback (fallback setTimeout)
        // để click handler return ngay sau khi clicked item đã update.
        const schedule =
            window.requestIdleCallback ||
            ((cb) => setTimeout(() => cb({ timeRemaining: () => 5 }), 0));
        const renderFn = (c) => this.renderCommentItem(c);
        const chunkRefresh = (startIdx) => {
            schedule((deadline) => {
                const CHUNK = 10;
                let i = startIdx;
                const end = Math.min(startIdx + CHUNK, others.length);
                while (i < end && (deadline.timeRemaining ? deadline.timeRemaining() > 0 : true)) {
                    const c = others[i++];
                    const otherItem = document.querySelector(
                        `.live-conversation-item[data-comment-id="${c.id}"]`
                    );
                    if (!otherItem) continue;
                    const otherTmp = document.createElement('div');
                    otherTmp.innerHTML = renderFn(c).trim();
                    const otherNewItem = otherTmp.firstElementChild;
                    if (otherNewItem) otherItem.replaceWith(otherNewItem);
                }
                if (i < others.length) {
                    chunkRefresh(i);
                }
            });
        };
        chunkRefresh(0);
    },

    /**
     * Show order detail for a customer (opens customer panel with order focus)
     * @param {string} fromId - Facebook user ID
     */
    async showOrderDetail(fromId) {
        const state = window.LiveState;
        const partner = state.partnerCache.get(fromId);
        const name = partner?.Name || fromId;
        window.LiveCustomerPanel.showCustomerInfo(fromId, name);
    },

    /**
     * Show customer info popup (click on customer name)
     * Uses Render DB endpoint /api/v2/customers/{phone} (same as orders-report)
     * Falls back to Pancake conversation search if no phone
     * @param {string} fbId - Facebook user ID from comment
     * @param {string} name - Customer name
     * @param {string} pageId - Facebook page ID
     */
    async showPancakeCustomerInfo(fbId, name, pageId) {
        const modal = document.getElementById('customerInfoModal');
        const titleEl = document.getElementById('customerInfoTitle');
        const bodyEl = document.getElementById('customerInfoBody');
        if (!modal || !bodyEl) return;

        this._bindCustomerModalDelegation(modal);
        titleEl.textContent = name;
        bodyEl.innerHTML =
            '<div class="loading-container"><div class="loading-spinner"></div><span>Đang tải...</span></div>';
        modal.style.display = 'flex';

        try {
            const state = window.LiveState;
            const workerUrl = state.workerUrl;

            // Get phone from partner cache or inline input
            const partner = state.partnerCache.get(fbId);
            const phone = SharedUtils.normalizePhone(
                document.getElementById(`phone-${fbId}`)?.value || partner?.Phone || ''
            );

            let customerData = null;

            // Strategy 1: Lookup by phone via Render DB (like orders-report does)
            if (phone) {
                try {
                    const resp = await fetch(`${workerUrl}/api/v2/customers/${phone}`);
                    const json = await resp.json();
                    if (json.success && json.data) {
                        customerData = json.data;
                    }
                } catch {
                    /* fallback below */
                }
            }

            // Strategy 2: Lookup by fb_id via Render DB
            if (!customerData && fbId) {
                try {
                    const resp = await fetch(`${workerUrl}/api/v2/customers/by-fb-id/${fbId}`);
                    const json = await resp.json();
                    if (json.success && json.data) {
                        customerData = json.data;
                    }
                } catch {
                    /* fallback below */
                }
            }

            if (customerData) {
                this._renderCustomerPopup(bodyEl, customerData, name, fbId);
            } else {
                // Show basic info from Live partner cache
                bodyEl.innerHTML = `
                    <div class="customer-section">
                        <h4>Thông tin cơ bản</h4>
                        <div class="customer-field"><label>Tên:</label><span>${SharedUtils.escapeHtml(name)}</span></div>
                        <div class="customer-field"><label>FB ID:</label><span style="font-family:monospace;font-size:12px;cursor:pointer" data-action="copy-text" data-copy="${liveAttr(fbId)}">${SharedUtils.escapeHtml(fbId)}</span></div>
                        ${partner?.Phone ? `<div class="customer-field"><label>SĐT:</label><span>${SharedUtils.escapeHtml(partner.Phone)}</span></div>` : ''}
                        ${partner?.Street ? `<div class="customer-field"><label>Địa chỉ:</label><span>${SharedUtils.escapeHtml(partner.Street)}</span></div>` : ''}
                        ${partner?.StatusText ? `<div class="customer-field"><label>Trạng thái:</label><span>${SharedUtils.escapeHtml(partner.StatusText)}</span></div>` : ''}
                        <p style="margin-top:12px;color:#9ca3af;font-size:12px;">Chưa có dữ liệu Pancake. Khách cần nhắn tin inbox để được sync.</p>
                    </div>
                    <div style="margin-top:16px;text-align:right;">
                        <button onclick="document.getElementById('customerInfoModal').style.display='none'"
                            style="padding:8px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;cursor:pointer;">Đóng</button>
                    </div>`;
            }
        } catch (error) {
            bodyEl.innerHTML = `<div style="text-align:center;padding:30px;color:#ef4444;">Lỗi: ${SharedUtils.escapeHtml(error.message)}</div>`;
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    /**
     * Delegated click cho modal info KH (thay inline onclick chứa user data:
     * copy FB ID/SĐT, mở Live Info). Bind 1 lần (guard dataset.delegated —
     * modal là element tĩnh trong index.html).
     * @param {HTMLElement} modal
     */
    _bindCustomerModalDelegation(modal) {
        if (!modal || modal.dataset.delegated === '1') return;
        modal.dataset.delegated = '1';
        modal.addEventListener('click', (e) => {
            const el = e.target.closest('[data-action]');
            if (!el) return;
            const d = el.dataset;
            if (d.action === 'copy-text') {
                navigator.clipboard.writeText(d.copy || '');
                window.showNotification?.('Đã copy', 'success');
            } else if (d.action === 'show-live-info') {
                window.LiveCustomerPanel.showCustomerInfo(d.fbId, d.name || '');
                modal.style.display = 'none';
            }
        });
    },

    /**
     * Render customer data from Render DB (same pattern as orders-report/tab1-customer-info.js)
     */
    _renderCustomerPopup(bodyEl, data, name, fbId) {
        const c = data.customer || data;
        const wallet = data.wallet || {};
        const notes = data.notes || [];
        const pancakeNotes = c.pancake_notes || [];

        const ok = c.order_success_count || 0;
        const fail = c.order_fail_count || 0;
        const total = ok + fail;
        const rate = total > 0 ? Math.round((fail / total) * 100) : 0;
        const walletTotal = (wallet.balance || 0) + (wallet.virtualBalance || 0);

        // Merge notes
        const allNotes = [
            ...notes.map((n) => ({
                text: n.content,
                by: n.created_by,
                at: n.created_at,
                src: 'db',
            })),
            ...pancakeNotes.map((n) => ({
                text: n.message || n.content || '',
                by: n.created_by?.fb_name || 'Pancake',
                at: n.created_at
                    ? new Date(
                          typeof n.created_at === 'number' ? n.created_at : n.created_at
                      ).toLocaleString('vi-VN')
                    : '',
                src: 'pancake',
            })),
        ];

        bodyEl.innerHTML = `
            <div class="customer-section">
                <h4><i data-lucide="user" style="width:16px;height:16px;"></i> Thông tin khách hàng</h4>
                <div class="customer-field"><label>Tên:</label><span><strong>${SharedUtils.escapeHtml(c.name || name)}</strong></span></div>
                ${c.phone ? `<div class="customer-field"><label>SĐT:</label><span style="cursor:pointer" data-action="copy-text" data-copy="${liveAttr(c.phone)}">${SharedUtils.escapeHtml(c.phone)}</span></div>` : ''}
                ${c.fb_id ? `<div class="customer-field"><label>FB ID:</label><span style="font-family:monospace;font-size:12px">${SharedUtils.escapeHtml(c.fb_id)}</span></div>` : ''}
                ${c.global_id ? `<div class="customer-field"><label>Global ID:</label><span style="font-family:monospace;font-size:12px">${SharedUtils.escapeHtml(c.global_id)}</span></div>` : ''}
                ${c.gender ? `<div class="customer-field"><label>Giới tính:</label><span>${SharedUtils.escapeHtml(c.gender)}</span></div>` : ''}
                ${c.birthday ? `<div class="customer-field"><label>Sinh nhật:</label><span>${SharedUtils.escapeHtml(c.birthday)}</span></div>` : ''}
                ${c.lives_in ? `<div class="customer-field"><label>Nơi sống:</label><span>${SharedUtils.escapeHtml(c.lives_in)}</span></div>` : ''}
                ${c.status && c.status !== 'Bình thường' ? `<div class="customer-field"><label>Trạng thái:</label><span style="color:${c.status === 'Bom hàng' || c.status === 'Nguy hiểm' ? '#ef4444' : '#f59e0b'};font-weight:600">${SharedUtils.escapeHtml(c.status)}</span></div>` : ''}
                ${c.can_inbox === false ? `<div class="customer-field"><label>Inbox:</label><span style="color:#ef4444">❌ Không thể gửi tin</span></div>` : ''}
            </div>

            <div class="customer-section">
                <h4><i data-lucide="bar-chart-3" style="width:16px;height:16px;"></i> Thống kê</h4>
                <div class="customer-field">
                    <label>Đơn hàng:</label>
                    <span>
                        <span style="background:#dcfce7;color:#16a34a;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600">${ok} OK</span>
                        <span style="background:#fee2e2;color:#dc2626;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;margin-left:4px">${fail} hoàn</span>
                        ${rate > 30 ? `<span style="background:#fef3c7;color:#d97706;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;margin-left:4px">${rate}% hoàn</span>` : ''}
                    </span>
                </div>
                ${walletTotal > 0 ? `<div class="customer-field"><label>Ví:</label><span style="font-weight:600">${new Intl.NumberFormat('vi-VN').format(walletTotal)}đ</span></div>` : ''}
            </div>

            ${
                allNotes.length > 0
                    ? `
            <div class="customer-section">
                <h4><i data-lucide="sticky-note" style="width:16px;height:16px;"></i> Ghi chú (${allNotes.length})</h4>
                ${allNotes
                    .slice(0, 5)
                    .map(
                        (n) => `
                    <div class="comment-item" style="${n.src === 'pancake' ? 'border-left:3px solid #f59e0b;' : ''}">
                        <div class="comment-text">${SharedUtils.escapeHtml(n.text)}</div>
                        <div class="comment-time">${SharedUtils.escapeHtml(n.by || '')} ${n.at ? '· ' + n.at : ''}</div>
                    </div>
                `
                    )
                    .join('')}
            </div>`
                    : ''
            }

            <div style="display:flex;gap:12px;margin-top:20px;">
                <button onclick="document.getElementById('customerInfoModal').style.display='none'"
                    style="flex:1;padding:10px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Đóng</button>
                <button data-action="show-live-info" data-fb-id="${liveAttr(fbId)}" data-name="${liveAttr(name)}"
                    style="flex:1;padding:10px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                    Xem Live Info
                </button>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();
    },
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.LiveCommentList = LiveCommentList;
}
