// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Comment List — RENDER-LIST module. Scroll/load-more, CRM/campaign options,
 * render pipeline (debounce → smart dispatch full/patch-chunked), SSE prepend,
 * loading/error states. Tách MOVE-only từ live-comment-list.js. Load SAU base +
 * state + events, TRƯỚC render-row + actions (renderCommentItem ở render-row).
 *
 * ⚠ renderComments PHẢI là own-method trên window.LiveCommentList (live-kho-enricher
 * wrap nó qua window.LiveCommentList.renderComments = fn) → Object.assign giữ đúng.
 */
(function () {
    'use strict';
    const NS = window._LiveCmtList;
    const liveSvgIcon = NS.liveSvgIcon;
    const liveAttr = NS.liveAttr;
    const RENDER_LIMIT_INITIAL = NS.RENDER_LIMIT_INITIAL;

    Object.assign(window.LiveCommentList, {
        /**
         * Handle scroll for infinite loading
         */
        handleScroll(container) {
            const state = window.LiveState;
            const scrollBottom =
                container.scrollHeight - container.scrollTop - container.clientHeight;

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
            const _vp = window.Web2CustomerStore?.isValidPhone;
            const phone =
                [partner.Phone, kho?.phone, comment.phone].find((p) => p && (!_vp || _vp(p))) || '';
            const address = partner.Street || kho?.address || comment.address || '';
            const raw = state.sessionIndexMap.get(fromId);
            const si = raw?.source === 'NATIVE_WEB' ? raw : null;
            const inOrder =
                si && Array.isArray(si.commentIds) && si.commentIds.includes(comment.id);
            const saved =
                state.savedToLiveIds.has(fromId) ||
                window.pancakeChatManager?.liveSavedCustomerIds?.has(fromId)
                    ? 1
                    : 0;
            const s = [
                phone,
                address,
                partner.StatusText || (kho && kho.status) || '',
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
            // Đang KÉO SP từ Kho vào comment → KHÔNG churn DOM (full wipe / replaceWith
            // hủy drop target dưới con trỏ → drop trượt hoặc sai dòng + giật). Hoãn,
            // dragend (setupEventHandlers → _flushDeferredAfterDrag) sẽ render lại.
            if (state?._dragActive) {
                this._renderDeferred = true;
                return;
            }
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
            this._updateTotalBadge(); // _visibleComments vừa tính _totalAfterHidden
            const rendered = listContainer.querySelectorAll('.live-conversation-item');
            const sameStructure =
                rendered.length > 0 &&
                rendered.length === visible.length &&
                Array.from(rendered).every(
                    (el, i) => el.dataset.commentId === String(visible[i].id)
                );
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
                // Drag bắt đầu giữa chừng → tạm dừng patch (replaceWith) tới khi thả,
                // tránh thay dòng đích dưới con trỏ. Poll nhẹ 150ms (không busy-loop).
                if (window.LiveState?._dragActive) {
                    this._chunkHandle = setTimeout(step, 150);
                    return;
                }
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
                // Drag bắt đầu giữa chừng → tạm dừng append tới khi thả (giữ DOM ổn
                // định cho drop target). Poll nhẹ 150ms.
                if (window.LiveState?._dragActive) {
                    this._fullRenderHandle = setTimeout(step, 150);
                    return;
                }
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
         * INCREMENTAL prepend comment MỚI (SSE delta) vào ĐẦU list — KHÔNG full
         * re-render. Dùng cho realtime per-comment (1 dòng/comment).
         *
         * Luồng: live-init nghe SSE 'web2:live-comments' → delta fetch DB (since) →
         * map → gọi hàm này. Dedup theo id; chèn dòng mới vào state.comments đúng vị
         * trí (state.comments sort newest-first theo created_time) + render CHỈ dòng
         * mới ở đầu DOM. Nếu dòng mới KHÔNG nằm trọn ở đầu (out-of-order) → fallback
         * full render cho an toàn.
         *
         * @param {Array<object>} newComments - comment shape (xem renderCommentItem).
         */
        prependComments(newComments) {
            const state = window.LiveState;
            if (!Array.isArray(newComments) || newComments.length === 0) return;
            const listContainer = document.getElementById('liveCommentList');
            if (!listContainer) return;

            // Đang KÉO SP → buffer comment SSE tới, replay sau dragend. Giữ list ổn
            // định trong lúc kéo (chèn fresh-row / outerHTML patch giữa chừng sẽ hủy
            // drop target dưới con trỏ → drop trượt). Comment chỉ trễ ~vài giây.
            if (state?._dragActive) {
                (this._dragDeferredPrepend || (this._dragDeferredPrepend = [])).push(
                    ...newComments
                );
                return;
            }

            // Tách incoming thành FRESH (id chưa có) và UPDATE (id đã có — H11:
            // poller fill phone/has_order/sửa message; cursor updated_at re-fetch
            // row cũ có thay đổi → merge vào state + patch DOM thay vì skip).
            const byId = new Map((state.comments || []).map((c) => [String(c.id), c]));
            const incomingSeen = new Set();
            const fresh = [];
            const updates = [];
            for (const c of newComments) {
                if (!c || c.id == null) continue;
                const key = String(c.id);
                if (incomingSeen.has(key)) continue;
                incomingSeen.add(key);
                if (byId.has(key)) updates.push(c);
                else fresh.push(c);
            }

            // ===== UPDATE path: merge field vào object state hiện có (giữ reference
            // — enricher/inventory giữ con trỏ vào object này) + patch DOM row.
            let patched = 0;
            for (const inc of updates) {
                const cur = byId.get(String(inc.id));
                const changed =
                    (inc.message || '') !== (cur.message || '') ||
                    (inc.phone || '') !== (cur.phone || '') ||
                    (inc.address || '') !== (cur.address || '') ||
                    !!inc._hasOrder !== !!cur._hasOrder ||
                    (inc.from?.name || '') !== (cur.from?.name || '');
                // Luôn cập nhật cursor _updatedAt; field khác chỉ khi đổi.
                if (inc._updatedAt) cur._updatedAt = inc._updatedAt;
                if (!changed) continue;
                cur.message = inc.message || cur.message;
                if (inc.phone) {
                    cur.phone = inc.phone;
                    cur._phones = inc._phones?.length ? inc._phones : cur._phones;
                }
                if (inc.address) cur.address = inc.address;
                cur._hasOrder = !!inc._hasOrder || !!cur._hasOrder;
                if (inc.from?.name) cur.from = { ...cur.from, ...inc.from };
                if (inc.campaign_id) {
                    cur.campaign_id = inc.campaign_id;
                    cur._campaignId = inc._campaignId || inc.campaign_id;
                }
                // Patch DOM row nếu đang render. Bỏ qua khi user đang gõ trong row
                // (input SĐT/địa chỉ inline) — tránh nuốt focus/giá trị đang nhập;
                // state đã đúng, full render sau sẽ đồng bộ.
                const rowEl = listContainer.querySelector(
                    `.live-conversation-item[data-comment-id="${CSS.escape(String(cur.id))}"]`
                );
                if (rowEl && !rowEl.contains(document.activeElement)) {
                    try {
                        rowEl.outerHTML = this.renderCommentItem(cur);
                        patched++;
                    } catch (e) {
                        console.warn('[LiveCommentList] patch row fail:', e.message);
                    }
                }
            }

            if (fresh.length === 0) {
                if (patched) {
                    this._attachWalletBalances();
                    window.LiveKhoEnricher?.scan?.();
                }
                return;
            }

            // Sort fresh newest-first (cùng thứ tự với state.comments).
            const ts = (c) => SharedUtils.toEpochMs(c.created_time);
            fresh.sort((a, b) => ts(b) - ts(a));

            // state.comments (newest-first) — nguồn để chèn đúng vị trí.
            const all = state.comments || (state.comments = []);

            // Cập nhật state.comments TRƯỚC (enrichment scan đọc state.comments).
            // Merge giữ newest-first: dùng splice theo vị trí chèn đúng.
            for (const c of fresh) {
                const cts = ts(c);
                let idx = 0;
                while (idx < all.length && ts(all[idx]) >= cts) idx++;
                all.splice(idx, 0, c);
            }

            // 3H6: phát live:newComment cho auto-snap (live-livestream-snap nghe) —
            // luồng PUSH-only không còn ai emit sau khi bỏ polling (audit vòng 3).
            // Emit SAU khi state cập nhật, TRƯỚC mọi early-return của đường render
            // (full render fallback cũng phải snap). isStaff = page tự comment.
            //
            // Backfill/cursor-reset dump (comment CŨ) phải KHÔNG snap (auto-snap chụp
            // frame HIỆN TẠI gán cho comment cũ → sai ảnh). Audit LOW (2026-06-20):
            // gate theo độ MỚI của created_time (so với now), KHÔNG chỉ batch-size —
            // batch lớn nhưng comment thật-sự-mới (burst live) vẫn được snap. Cap
            // batch giữ làm chốt phụ chống dump backfill khổng lồ vô tình còn mới.
            const SNAP_RECENT_MS = 3 * 60 * 1000; // comment trong 3 phút gần đây = realtime
            const SNAP_BATCH_MAX = 200; // dump > 200 = backfill, không snap dù còn mới
            if (window.eventBus?.emit && fresh.length <= SNAP_BATCH_MAX) {
                const nowMs = Date.now();
                for (const c of fresh) {
                    // created_time cũ (backfill) → skip snap, chỉ comment mới mới snap.
                    const ageMs = nowMs - ts(c);
                    if (!(ageMs >= 0 ? ageMs <= SNAP_RECENT_MS : true)) continue;
                    try {
                        window.eventBus.emit('live:newComment', {
                            comment: c,
                            isStaff: !!c.from?.id && String(c.from.id) === String(c._pageId || ''),
                        });
                    } catch (e) {
                        console.warn('[LiveCommentList] emit live:newComment fail:', e.message);
                    }
                }
            }

            // DOM chỉ chèn dòng KHÔNG bị ẩn theo người (3H7) — state giữ nguyên đủ
            // để bỏ ẩn là hiện lại. Toàn bộ ẩn → chỉ cần cập nhật badge tổng.
            const isHidden = (c) =>
                window.LiveHiddenCommenters?.list?.()?.length
                    ? window.LiveHiddenCommenters.isHidden(c)
                    : false;
            const freshVisible = fresh.filter((c) => !isHidden(c));

            // Nếu list đang trống (empty-state) hoặc chưa từng render → full render.
            const hasRenderedRows = listContainer.querySelector('.live-conversation-item') !== null;
            if (!hasRenderedRows) {
                this.resetRenderLimit?.();
                this.renderComments();
                return;
            }

            if (freshVisible.length === 0) {
                this.updateLoadMoreIndicator();
                return;
            }

            // Render-loop (full render / patch chunked) đang chạy → state.comments đã
            // cập nhật, để loop tự dựng (tránh chèn vào DOM đang bị ghi đè dở).
            if (this._fullRenderHandle != null || this._chunkHandle != null) {
                this._pendingDirty = true;
                return;
            }

            // ===== APPEND-ONLY (user 2026-06-15): chèn TỪNG comment mới vào ĐÚNG VỊ TRÍ
            // — KHÔNG full re-render kể cả comment out-of-order (multi-campaign / nhiều
            // post / comment trễ về). Trước đây out-of-order → renderComments() full =
            // "render toàn bộ" giật + nháy.
            //
            // Dùng INDEX trong _filteredAll (đã gồm fresh đã splice, đã bỏ người-ẩn) để
            // giữ invariant DOM == filtered.slice(0,_renderLimit) mà _appendOlderBatch
            // dựa vào (review HIGH: chèn comment NGOÀI window + bump _renderLimit → cuộn
            // tải thêm bị TRÙNG + SÓT dòng). idx >= số dòng đang render → comment thuộc
            // DƯỚI window → KHÔNG chèn (để _appendOlderBatch render khi cuộn), không bump.
            const filteredNow = this._filteredAll();
            // Fade OPACITY THUẦN cho dòng mới (chuẩn livestream) — KHÔNG trượt. Burst dồn
            // dập → bỏ fade, hiện tức thì. Gắn .is-new, gỡ sau animationend.
            const animateNew = this._shouldAnimateNew(freshVisible.length);
            const markNew = (el) => {
                if (!el || !animateNew) return;
                el.classList.add('is-new');
                el.addEventListener('animationend', () => el.classList.remove('is-new'), {
                    once: true,
                });
            };
            let inserted = 0;
            for (const c of freshVisible) {
                const idx = filteredNow.indexOf(c);
                if (idx < 0) continue;
                const rows = listContainer.querySelectorAll('.live-conversation-item');
                if (idx < rows.length) {
                    // Trong window → chèn ngay trước dòng đang ở vị trí idx.
                    rows[idx].insertAdjacentHTML('beforebegin', this.renderCommentItem(c));
                    markNew(rows[idx].previousElementSibling);
                    inserted++;
                } else if (idx === rows.length) {
                    // Đúng cuối window → chèn trước sentinel (mở rộng window 1 dòng).
                    const s = document.getElementById('liveScrollSentinel');
                    if (s && s.parentNode === listContainer) {
                        s.insertAdjacentHTML('beforebegin', this.renderCommentItem(c));
                        markNew(s.previousElementSibling);
                    } else {
                        listContainer.insertAdjacentHTML('beforeend', this.renderCommentItem(c));
                        markNew(listContainer.lastElementChild);
                    }
                    inserted++;
                }
                // idx > rows.length → DƯỚI window → skip (giữ invariant; scroll sẽ render).
            }
            // Giữ invariant "số dòng DOM == _renderLimit": mỗi dòng chèn-trong-window đẩy
            // window rộng thêm 1 → bump đúng số đã chèn. _ensureScrollSentinel cập nhật
            // hasMore (dòng bị đẩy ra ngoài window cũ).
            if (inserted) {
                this._renderLimit = (this._renderLimit || RENDER_LIMIT_INITIAL) + inserted;
                this._ensureScrollSentinel();
            }

            this.updateLoadMoreIndicator();
            this._attachWalletBalances();
            // Trigger enrichment scan (kho/partner) cho dòng mới — kho-enricher đọc
            // state.comments (đã cập nhật) qua scan().
            window.LiveKhoEnricher?.scan?.();
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
    });
})();
