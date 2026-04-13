// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * TPOS Comment List UI
 * Renders comment list, selectors, filters, infinite scroll
 * Dependencies: TposState, TposApi, SharedUtils, sharedDebtManager, eventBus
 */

const TposCommentList = {
    /**
     * Render the main container structure
     */
    renderContainer() {
        const state = window.TposState;
        const container = document.getElementById(state.containerId);
        if (!container) {
            console.error('[TPOS-LIST] Container not found:', state.containerId);
            return;
        }

        // Render selectors into topbar (if available)
        const topbarSelectors = document.getElementById('topbarTposSelectors');
        if (topbarSelectors) {
            topbarSelectors.innerHTML = `
                <select id="tposCrmTeamSelect" class="tpos-filter-select" disabled>
                    <option value="">Chọn Page...</option>
                </select>
                <div class="tpos-campaign-multi" style="position:relative;">
                    <button id="tposCampaignBtn" class="tpos-filter-select" style="text-align:left;cursor:pointer;display:flex;align-items:center;gap:4px;min-width:160px;" disabled>
                        <span id="tposCampaignBtnText">Chọn Campaign...</span>
                        <i data-lucide="chevron-down" style="width:12px;height:12px;margin-left:auto;flex-shrink:0;"></i>
                    </button>
                    <div id="tposCampaignDropdown" class="tpos-campaign-dropdown" style="display:none;position:absolute;top:100%;left:0;min-width:300px;max-height:350px;overflow-y:auto;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);z-index:500;margin-top:4px;">
                        <div style="padding:6px 10px;border-bottom:1px solid #e5e7eb;display:flex;gap:6px;">
                            <button id="tposCampaignSelectAll" style="padding:3px 8px;background:#3b82f6;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;">Hôm nay</button>
                            <button id="tposCampaignClearAll" style="padding:3px 8px;background:#f3f4f6;color:#374151;border:none;border-radius:4px;font-size:11px;cursor:pointer;">Bỏ chọn</button>
                        </div>
                        <div id="tposCampaignList" style="padding:4px 0;"></div>
                    </div>
                </div>
            `;
        }

        // Column content: just comment list + load more (no header)
        container.innerHTML = `
            <div class="tpos-chat-wrapper">
                <div class="tpos-conversation-list" id="tposCommentList">
                    <div class="tpos-empty">
                        <i data-lucide="message-square"></i>
                        <span>Chọn Page và Campaign để xem comment</span>
                    </div>
                </div>
                <div class="tpos-load-more" id="tposLoadMore" style="display: none;">
                    <div class="tpos-loading-more">
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
        const crmSelect = document.getElementById('tposCrmTeamSelect');
        if (crmSelect) {
            crmSelect.addEventListener('change', (e) => {
                window.eventBus.emit('tpos:crmTeamChanged', e.target.value);
            });
        }

        // Campaign multi-select dropdown
        const campaignBtn = document.getElementById('tposCampaignBtn');
        if (campaignBtn) {
            campaignBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCampaignDropdown();
            });
        }
        const selectAllBtn = document.getElementById('tposCampaignSelectAll');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectTodayCampaigns();
            });
        }
        const clearAllBtn = document.getElementById('tposCampaignClearAll');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.clearCampaignSelection();
            });
        }
        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('tposCampaignDropdown');
            if (dropdown && dropdown.style.display !== 'none' && !e.target.closest('.tpos-campaign-multi')) {
                dropdown.style.display = 'none';
            }
        });

        const btnRefresh = document.getElementById('btnTposRefresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                window.eventBus.emit('tpos:refreshRequested');
            });
        }

        const commentList = document.getElementById('tposCommentList');
        if (commentList) {
            commentList.addEventListener('scroll', () => this.handleScroll(commentList));
        }
    },

    /**
     * Handle scroll for infinite loading
     */
    handleScroll(container) {
        const state = window.TposState;
        const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

        if (scrollBottom < 100 && state.hasMore && !state.isLoading) {
            console.log('[TPOS-LIST] Auto-loading more comments...');
            window.eventBus.emit('tpos:loadMoreRequested');
        }
    },

    /**
     * Update load-more indicator visibility
     */
    updateLoadMoreIndicator() {
        const state = window.TposState;
        const loadMoreContainer = document.getElementById('tposLoadMore');
        if (!loadMoreContainer) return;

        const visible = (state.isLoading && state.comments.length > 0) || state.hasMore;
        loadMoreContainer.style.display = visible ? 'flex' : 'none';

        if (visible && typeof lucide !== 'undefined') lucide.createIcons();
    },

    /**
     * Render CRM Team / Page options in the selector
     */
    renderCrmTeamOptions() {
        const state = window.TposState;
        const select = document.getElementById('tposCrmTeamSelect');
        if (!select) return;

        let options = '<option value="">Chọn Page...</option>';

        if (state.allPages.length > 1) {
            options += `<option value="all">📋 Tất cả Pages (${state.allPages.length})</option>`;
        }

        state.crmTeams.forEach(team => {
            if (team.Childs && team.Childs.length > 0) {
                options += `<optgroup label="${SharedUtils.escapeHtml(team.Name)}">`;
                team.Childs.forEach(page => {
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
        const state = window.TposState;
        const list = document.getElementById('tposCampaignList');
        const btn = document.getElementById('tposCampaignBtn');
        if (!list) return;

        if (state.liveCampaigns.length === 0) {
            list.innerHTML = '<div style="padding:12px;color:#9ca3af;font-size:12px;text-align:center;">Không có campaign</div>';
            if (btn) btn.disabled = true;
            return;
        }
        if (btn) btn.disabled = false;

        // Initialize selectedCampaignIds if not exists
        if (!state.selectedCampaignIds) state.selectedCampaignIds = new Set();

        list.innerHTML = state.liveCampaigns.map(c => {
            const checked = state.selectedCampaignIds.has(c.Id);
            const pageName = c.Facebook_UserName || '';
            const isStore = pageName.toLowerCase().includes('store');
            const badgeColor = isStore ? 'background:#fef3c7;color:#92400e' : 'background:#dbeafe;color:#1e40af';
            return `<label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:12px;transition:background 0.1s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" value="${c.Id}" ${checked ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;flex-shrink:0;"
                    onchange="TposCommentList.toggleCampaign('${c.Id}')">
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${SharedUtils.escapeHtml(c.Name)}</span>
                <span style="${badgeColor};font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600;flex-shrink:0;">${pageName.replace('NhiJudy ','').replace('Nhi Judy ','')}</span>
            </label>`;
        }).join('');

        this.updateCampaignBtnText();
    },

    /**
     * Toggle campaign dropdown visibility
     */
    toggleCampaignDropdown() {
        const dropdown = document.getElementById('tposCampaignDropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    },

    /**
     * Toggle a single campaign selection
     * @param {string} campaignId
     */
    toggleCampaign(campaignId) {
        const state = window.TposState;
        if (!state.selectedCampaignIds) state.selectedCampaignIds = new Set();

        if (state.selectedCampaignIds.has(campaignId)) {
            state.selectedCampaignIds.delete(campaignId);
        } else {
            state.selectedCampaignIds.add(campaignId);
        }

        this.updateCampaignBtnText();
        state.saveCampaignSelection();
        window.eventBus.emit('tpos:campaignsChanged', Array.from(state.selectedCampaignIds));
    },

    /**
     * Select all today's campaigns
     */
    selectTodayCampaigns() {
        const state = window.TposState;
        if (!state.selectedCampaignIds) state.selectedCampaignIds = new Set();

        const today = new Date().toISOString().slice(0, 10);
        state.liveCampaigns.forEach(c => {
            const cDate = (c.DateCreated || '').slice(0, 10);
            if (cDate === today) {
                state.selectedCampaignIds.add(c.Id);
            }
        });

        this.renderLiveCampaignOptions();
        state.saveCampaignSelection();
        window.eventBus.emit('tpos:campaignsChanged', Array.from(state.selectedCampaignIds));
    },

    /**
     * Clear all campaign selections
     */
    clearCampaignSelection() {
        const state = window.TposState;
        if (state.selectedCampaignIds) state.selectedCampaignIds.clear();
        this.renderLiveCampaignOptions();
        state.saveCampaignSelection();
        window.eventBus.emit('tpos:campaignsChanged', []);
    },

    /**
     * Update campaign button text with selection count
     */
    updateCampaignBtnText() {
        const state = window.TposState;
        const btnText = document.getElementById('tposCampaignBtnText');
        if (!btnText) return;

        const count = state.selectedCampaignIds?.size || 0;
        if (count === 0) {
            btnText.textContent = 'Chọn Live Campaign...';
        } else if (count === 1) {
            const id = Array.from(state.selectedCampaignIds)[0];
            const c = state.liveCampaigns.find(x => x.Id === id);
            btnText.textContent = c ? c.Name : '1 campaign';
        } else {
            btnText.textContent = `${count} campaigns đã chọn`;
        }
    },

    /**
     * Render the full comment list
     */
    renderComments() {
        const state = window.TposState;
        const listContainer = document.getElementById('tposCommentList');
        if (!listContainer) return;

        if (state.comments.length === 0) {
            listContainer.innerHTML = `
                <div class="tpos-empty">
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

        listContainer.innerHTML = state.comments.map(c => this.renderCommentItem(c)).join('');
        this.updateLoadMoreIndicator();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    /**
     * Show loading state in comment list
     */
    showLoading() {
        const listContainer = document.getElementById('tposCommentList');
        if (!listContainer) return;
        listContainer.innerHTML = `
            <div class="tpos-loading">
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
        const listContainer = document.getElementById('tposCommentList');
        if (!listContainer) return;
        listContainer.innerHTML = `
            <div class="tpos-error">
                <i data-lucide="alert-circle"></i>
                <span>Lỗi: ${message}</span>
                <button class="tpos-btn-retry" onclick="window.eventBus.emit('tpos:refreshRequested')">Thử lại</button>
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
        const state = window.TposState;
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
        const pageName = comment._pageName || state.selectedPage?.Name || state.selectedCampaign?.Facebook_UserName || '';
        const isMultiPage = state.selectedPages && state.selectedPages.length > 1;
        const isStore = pageName.toLowerCase().includes('store');
        const pageBadgeColor = isStore ? 'background:#fef3c7;color:#92400e' : 'background:#dbeafe;color:#1e40af';
        const shortPageName = pageName.replace('NhiJudy ', '').replace('Nhi Judy ', '');

        // SessionIndex badge + Order info
        const sessionInfo = state.sessionIndexMap.get(fromId);
        const sessionIndexBadge = sessionInfo
            ? `<span class="session-index-badge" title="STT: ${sessionInfo.index}${sessionInfo.code ? ' | Mã: ' + sessionInfo.code : ''}">${sessionInfo.index}</span>`
            : '';
        const orderBadge = sessionInfo?.code
            ? `<span class="order-code-badge" title="Đơn ${sessionInfo.code}" style="background:#dbeafe;color:#1d4ed8;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600;cursor:pointer" onclick="event.stopPropagation();TposCommentList.showOrderDetail('${fromId}')">${sessionInfo.code}</span>`
            : '';

        // Gradient placeholder
        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
        ];
        const colorIndex = fromName.charCodeAt(0) % colors.length;
        const gradientColor = colors[colorIndex];
        const initial = fromName.charAt(0).toUpperCase();

        // Partner info from cache
        const partner = state.partnerCache.get(fromId) || {};
        const statusText = partner.StatusText || '';
        const statusColor = this.getStatusColor(statusText);
        const phone = partner.Phone || '';
        const address = partner.Street || '';

        // Debt via shared debt manager
        const debt = window.sharedDebtManager ? window.sharedDebtManager.getDebt(phone) : null;
        const debtDisplay = SharedUtils.formatDebt(debt);
        const hasDebt = state.showDebt && (
            (debt && debt > 0) ||
            (state.showZeroDebt && debt !== null && debt !== undefined)
        );

        // Check saved-to-Tpos
        const isSavedToTpos = state.savedToTposIds.has(fromId) ||
            (window.pancakeChatManager?.tposSavedCustomerIds?.has(fromId));

        // Status dropdown options
        const statusOptions = this.getStatusOptions();
        const statusDropdownHtml = statusOptions.map(opt =>
            `<div class="inline-status-option" style="padding: 6px 10px; cursor: pointer; font-size: 12px; color: ${opt.color}; font-weight: 600;"
                 onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'"
                 onclick="event.stopPropagation(); TposCommentList.selectInlineStatus('${fromId}', '${opt.value}', '${opt.text}')">
                ${opt.text}
            </div>`
        ).join('');

        return `
            <div class="tpos-conversation-item ${isHidden ? 'is-hidden' : ''}"
                 data-comment-id="${id}"
                 onclick="TposCommentList.selectComment('${id}')">
                <div class="tpos-conv-avatar">
                    ${pictureUrl
                ? `<img src="${pictureUrl}" class="avatar-img" alt="${SharedUtils.escapeHtml(fromName)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <div class="avatar-placeholder" style="display:none;background:${gradientColor};">${initial}</div>`
                : `<div class="avatar-placeholder" style="background:${gradientColor};">${initial}</div>`
            }
                    ${sessionIndexBadge}
                    <span class="channel-badge"><i data-lucide="facebook" class="channel-icon fb"></i></span>
                </div>
                <div class="tpos-conv-content">
                    <div class="tpos-conv-header">
                        <span class="customer-name" onclick="event.stopPropagation(); TposCommentList.showPancakeCustomerInfo('${fromId}', '${SharedUtils.escapeHtml(fromName)}', '${commentPageId || ''}')" title="Xem thông tin">${SharedUtils.escapeHtml(fromName)}</span>
                        ${isMultiPage ? `<span class="tpos-tag" style="${pageBadgeColor}">${SharedUtils.escapeHtml(shortPageName)}</span>` : ''}
                        ${orderBadge}
                        ${isHidden ? '<span class="tpos-tag" style="background:#fee2e2;color:#dc2626;">Ẩn</span>' : ''}
                    </div>
                    <div class="tpos-conv-message">${SharedUtils.escapeHtml(message)}</div>
                    <div class="tpos-conv-info" onclick="event.stopPropagation();">
                        <div class="inline-status-container">
                            <button id="status-btn-${fromId}" class="tpos-filter-select" style="padding:3px 8px;font-size:11px;min-width:auto;${statusColor ? `color:${statusColor};font-weight:600;` : ''}"
                                onclick="event.stopPropagation(); TposCommentList.toggleInlineStatusDropdown('${fromId}')">
                                <span id="status-text-${fromId}">${statusText || 'Trạng thái'}</span> ▾
                            </button>
                            <div id="status-dropdown-${fromId}" style="display:none;position:absolute;top:100%;left:0;background:white;border:1px solid var(--gray-200);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.12);z-index:1000;min-width:130px;">
                                ${statusDropdownHtml}
                            </div>
                        </div>
                        <input type="text" id="phone-${fromId}" value="${SharedUtils.escapeHtml(phone)}" placeholder="SĐT" style="width:105px;" onclick="event.stopPropagation();">
                        <button class="tpos-action-btn" style="width:24px;height:24px;opacity:1;" onclick="event.stopPropagation(); TposCommentList.saveInlinePhone('${fromId}', 'phone-${fromId}')" title="Lưu SĐT">
                            <i data-lucide="save" style="width:12px;height:12px;"></i>
                        </button>
                        ${hasDebt ? `<span class="debt-badge">Nợ: ${debtDisplay}</span>` : ''}
                        <input type="text" id="addr-${fromId}" value="${SharedUtils.escapeHtml(address)}" placeholder="Địa chỉ" style="flex:1;min-width:120px;" onclick="event.stopPropagation();">
                        <button class="tpos-action-btn" style="width:24px;height:24px;opacity:1;" onclick="event.stopPropagation(); TposCommentList.saveInlineAddress('${fromId}', 'addr-${fromId}')" title="Lưu địa chỉ">
                            <i data-lucide="save" style="width:12px;height:12px;"></i>
                        </button>
                    </div>
                </div>
                <div class="tpos-conv-actions">
                    ${!sessionInfo?.code
                        ? `<button class="tpos-action-btn" id="create-order-${fromId}" title="Tạo đơn" style="color:var(--primary);" onclick="event.stopPropagation(); TposCommentList.createOrder('${fromId}', '${SharedUtils.escapeHtml(fromName)}', '${id}')">
                               <i data-lucide="shopping-cart" style="width:14px;height:14px;"></i>
                           </button>`
                        : `<span title="Đơn: ${sessionInfo.code}" style="color:#10b981;padding:4px;">
                               <i data-lucide="package-check" style="width:14px;height:14px;"></i>
                           </span>`
                    }
                    <button class="tpos-action-btn" title="Xem info" onclick="event.stopPropagation(); TposCustomerPanel.showCustomerInfo('${fromId}', '${SharedUtils.escapeHtml(fromName)}')">
                        <i data-lucide="user" style="width:14px;height:14px;"></i>
                    </button>
                    <button class="tpos-action-btn" title="Trả lời" onclick="event.stopPropagation(); TposCommentList.showReplyInput('${id}', '${fromId}')">
                        <i data-lucide="reply" style="width:14px;height:14px;"></i>
                    </button>
                    <button class="tpos-action-btn" title="${isHidden ? 'Hiện' : 'Ẩn'}" onclick="event.stopPropagation(); TposColumnManager.toggleHideComment('${id}', ${!isHidden})">
                        <i data-lucide="${isHidden ? 'eye' : 'eye-off'}" style="width:14px;height:14px;"></i>
                    </button>
                </div>
                <div class="tpos-conv-meta">
                    <span class="tpos-conv-time">${timeStr}</span>
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
        const opt = this.getStatusOptions().find(o => o.text === statusText);
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
            { value: '#ff9800_VIP', text: 'VIP', color: '#ff9800' }
        ];
    },

    /**
     * Select a comment (highlight + emit event)
     * @param {string} commentId
     */
    selectComment(commentId) {
        const state = window.TposState;

        document.querySelectorAll('.tpos-conversation-item').forEach(item => {
            item.classList.remove('selected');
        });
        const selectedItem = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (selectedItem) selectedItem.classList.add('selected');

        const comment = state.comments.find(c => c.id === commentId);
        if (comment) {
            window.eventBus.emit('tpos:commentSelected', { comment });
            window.dispatchEvent(new CustomEvent('tposCommentSelected', { detail: { comment } }));
        }
    },

    /**
     * Toggle inline status dropdown for a list item
     * @param {string} userId
     */
    toggleInlineStatusDropdown(userId) {
        const dropdown = document.getElementById(`status-dropdown-${userId}`);
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    },

    /**
     * Select inline status and save via API
     * @param {string} userId
     * @param {string} value
     * @param {string} text
     */
    async selectInlineStatus(userId, value, text) {
        const state = window.TposState;

        // Hide dropdown
        const dropdown = document.getElementById(`status-dropdown-${userId}`);
        if (dropdown) dropdown.style.display = 'none';

        // Update UI immediately
        const statusTextEl = document.getElementById(`status-text-${userId}`);
        if (statusTextEl) statusTextEl.textContent = text;
        const statusBtn = document.getElementById(`status-btn-${userId}`);
        const color = this.getStatusColor(text);
        if (statusBtn) {
            statusBtn.style.color = color || '';
            statusBtn.style.fontWeight = color ? '600' : '';
        }

        // Get partner from cache
        const partner = state.partnerCache.get(userId);
        if (!partner || !partner.Id) {
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy thông tin khách hàng');
            }
            return;
        }

        // Call API
        const success = await window.TposApi.updatePartnerStatusViaProxy(partner.Id, value);
        if (success) {
            // Update cache
            partner.StatusText = text;
            state.partnerCache.set(userId, partner);
            if (window.notificationManager) window.notificationManager.success('Đã cập nhật trạng thái');
        } else {
            if (window.notificationManager) window.notificationManager.error('Lỗi cập nhật trạng thái');
        }
    },

    /**
     * Save phone inline edit
     * @param {string} userId
     * @param {string} inputId
     */
    async saveInlinePhone(userId, inputId) {
        const input = document.getElementById(inputId);
        const saveBtn = document.getElementById(`save-phone-${userId}`);
        if (!input) return;

        const newPhone = input.value.trim();
        if (!newPhone) {
            if (window.notificationManager) window.notificationManager.show('Vui lòng nhập số điện thoại', 'warning');
            return;
        }

        if (saveBtn) {
            saveBtn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:12px;height:12px;"></i>';
            saveBtn.disabled = true;
        }

        try {
            await window.TposApi.savePartnerData(userId, { Phone: newPhone });
            if (window.notificationManager) window.notificationManager.success('Đã lưu số điện thoại');

            if (saveBtn) {
                saveBtn.innerHTML = '<i data-lucide="check" style="width:12px;height:12px;color:#22c55e;"></i>';
                setTimeout(() => {
                    saveBtn.innerHTML = '<i data-lucide="save" style="width:12px;height:12px;"></i>';
                    saveBtn.disabled = false;
                    if (window.lucide) lucide.createIcons();
                }, 1500);
            }
        } catch (error) {
            if (window.notificationManager) window.notificationManager.error('Lỗi lưu SĐT: ' + error.message);
            if (saveBtn) {
                saveBtn.innerHTML = '<i data-lucide="save" style="width:12px;height:12px;"></i>';
                saveBtn.disabled = false;
            }
        }
        if (window.lucide) lucide.createIcons();
    },

    /**
     * Save address inline edit
     * @param {string} userId
     * @param {string} inputId
     */
    async saveInlineAddress(userId, inputId) {
        const input = document.getElementById(inputId);
        const saveBtn = document.getElementById(`save-addr-${userId}`);
        if (!input) return;

        const newAddress = input.value.trim();

        if (saveBtn) {
            saveBtn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:12px;height:12px;"></i>';
            saveBtn.disabled = true;
        }

        try {
            await window.TposApi.savePartnerData(userId, { Street: newAddress });
            if (window.notificationManager) window.notificationManager.success('Đã lưu địa chỉ');

            if (saveBtn) {
                saveBtn.innerHTML = '<i data-lucide="check" style="width:12px;height:12px;color:#22c55e;"></i>';
                setTimeout(() => {
                    saveBtn.innerHTML = '<i data-lucide="save" style="width:12px;height:12px;"></i>';
                    saveBtn.disabled = false;
                    if (window.lucide) lucide.createIcons();
                }, 1500);
            }
        } catch (error) {
            if (window.notificationManager) window.notificationManager.error('Lỗi lưu địa chỉ: ' + error.message);
            if (saveBtn) {
                saveBtn.innerHTML = '<i data-lucide="save" style="width:12px;height:12px;"></i>';
                saveBtn.disabled = false;
            }
        }
        if (window.lucide) lucide.createIcons();
    },

    /**
     * Handle save to Tpos button click (the "+" button)
     * @param {string} customerId
     * @param {string} customerName
     */
    async handleSaveToTpos(customerId, customerName) {
        const state = window.TposState;
        if (!customerId || !customerName) {
            if (window.notificationManager) window.notificationManager.show('Thiếu thông tin khách hàng', 'error');
            return;
        }

        const partner = state.partnerCache.get(customerId) || {};
        const phone = partner.Phone || '';
        const address = partner.Street || '';

        const notes = [
            phone ? `SĐT: ${phone}` : '',
            address ? `Địa chỉ: ${address}` : '',
            state.selectedCampaign?.title ? `Campaign: ${state.selectedCampaign.title}` : ''
        ].filter(Boolean).join(' | ');

        try {
            const result = await window.TposApi.saveToTpos(customerId, customerName, notes);

            if (result.success) {
                state.savedToTposIds.add(customerId);

                // Update Pancake's saved IDs cache
                if (window.pancakeChatManager) {
                    window.pancakeChatManager.tposSavedCustomerIds.add(customerId);
                    if (window.pancakeChatManager.filterType === 'tpos-saved') {
                        window.pancakeChatManager.renderConversationList();
                    }
                }

                this.updateSaveButtonToCheckmark(customerId);

                if (window.notificationManager) window.notificationManager.show(`Đã lưu: ${customerName}`, 'success');
            } else {
                throw new Error(result.message || 'Lỗi không xác định');
            }
        } catch (error) {
            console.error('[TPOS-LIST] Error saving to Tpos:', error);
            if (window.notificationManager) window.notificationManager.show(`Lỗi: ${error.message}`, 'error');
        }
    },

    /**
     * Replace save button with checkmark without full re-render
     * @param {string} customerId
     */
    updateSaveButtonToCheckmark(customerId) {
        const state = window.TposState;
        const container = document.getElementById(state.containerId);
        if (!container) return;

        const saveBtn = container.querySelector(`button[onclick*="handleSaveToTpos('${customerId}'"]`);
        if (saveBtn) {
            const checkmark = document.createElement('span');
            checkmark.className = 'tpos-saved-badge';
            checkmark.title = 'Đã lưu vào Tpos';
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
        const indicator = document.getElementById('tposStatusIndicator');
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
        const state = window.TposState;
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
        document.querySelectorAll('.tpos-reply-input-row').forEach(el => el.remove());

        const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (!commentEl) return;

        const replyRow = document.createElement('div');
        replyRow.className = 'tpos-reply-input-row';
        replyRow.style.cssText = 'display:flex;gap:6px;padding:8px 12px;background:#f8fafc;border-top:1px solid #e5e7eb;align-items:center;';
        replyRow.innerHTML = `
            <input type="text" id="reply-input-${commentId}" placeholder="Trả lời comment..."
                style="flex:1;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;"
                onkeydown="if(event.key==='Enter')TposCommentList.sendReply('${commentId}')">
            <button style="padding:6px 12px;background:#3b82f6;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;"
                onclick="TposCommentList.sendReply('${commentId}')">Gửi</button>
            <button style="padding:6px 8px;background:transparent;border:none;cursor:pointer;color:#6b7280;"
                onclick="this.parentElement.remove()">✕</button>
        `;
        replyRow.addEventListener('click', e => e.stopPropagation());
        commentEl.appendChild(replyRow);

        const input = document.getElementById(`reply-input-${commentId}`);
        if (input) input.focus();
    },

    /**
     * Send reply to a comment via API
     * @param {string} commentId
     */
    async sendReply(commentId) {
        const input = document.getElementById(`reply-input-${commentId}`);
        const message = input?.value?.trim();
        if (!message) return;

        const state = window.TposState;
        const pageId = state.selectedPage?.Facebook_PageId;
        if (!pageId) return;

        // Disable input while sending
        input.disabled = true;
        const sendBtn = input.nextElementSibling;
        if (sendBtn) { sendBtn.textContent = '...'; sendBtn.disabled = true; }

        const result = await window.TposApi.replyToComment(pageId, commentId, message);
        if (result) {
            // Remove reply input
            const replyRow = input.closest('.tpos-reply-input-row');
            if (replyRow) replyRow.remove();
            if (window.notificationManager) window.notificationManager.show('Đã trả lời comment!', 'success');
        } else {
            input.disabled = false;
            if (sendBtn) { sendBtn.textContent = 'Gửi'; sendBtn.disabled = false; }
            if (window.notificationManager) window.notificationManager.show('Lỗi gửi trả lời', 'error');
        }
    },

    /**
     * Create a TPOS order from a comment
     * @param {string} fromId - Facebook user ID
     * @param {string} fromName - Customer name
     * @param {string} commentId - Comment ID
     */
    async createOrder(fromId, fromName, commentId) {
        const state = window.TposState;

        // Find the comment to get its page info (important for multi-campaign)
        const comment = state.comments.find(c => c.id === commentId);
        const pageObj = comment?._pageObj || state.selectedPage;
        const crmTeamId = pageObj?.Id;
        const postId = comment?._campaignId
            ? state.liveCampaigns.find(c => c.Id === comment._campaignId)?.Facebook_LiveId
            : state.selectedCampaign?.Facebook_LiveId;

        if (!crmTeamId || !postId) {
            if (window.notificationManager) window.notificationManager.show('Chưa chọn campaign', 'error');
            return;
        }

        // Update button to loading
        const btn = document.getElementById(`create-order-${fromId}`);
        if (btn) {
            btn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:14px;height:14px;"></i>';
            btn.disabled = true;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        try {
            const order = await window.TposApi.createOrderFromComment({
                crmTeamId,
                userName: fromName,
                userId: fromId,
                postId,
                commentId
            });

            if (order && order.Code) {
                // Update session index map
                state.sessionIndexMap.set(fromId, {
                    index: order.SessionIndex || '?',
                    session: order.Session,
                    code: order.Code
                });

                // Replace button with order badge
                if (btn) {
                    btn.outerHTML = `<span title="Đơn: ${order.Code} (STT ${order.SessionIndex})" style="color:#10b981;padding:4px;font-size:10px;font-weight:700;">
                        <i data-lucide="package-check" style="width:14px;height:14px;"></i>
                    </span>`;
                }

                // Add order badge to name row
                const header = btn?.closest('.tpos-conversation-item')?.querySelector('.tpos-conv-header');
                if (header && !header.querySelector('.order-code-badge')) {
                    header.insertAdjacentHTML('beforeend',
                        `<span class="order-code-badge" style="background:#dbeafe;color:#1d4ed8;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600;">${order.Code}</span>`
                    );
                }

                if (typeof lucide !== 'undefined') lucide.createIcons();
                if (window.notificationManager) window.notificationManager.show(`Đã tạo đơn ${order.Code} (STT: ${order.SessionIndex})`, 'success');
            }
        } catch (error) {
            // Restore button
            if (btn) {
                btn.innerHTML = '<i data-lucide="shopping-cart" style="width:14px;height:14px;"></i>';
                btn.disabled = false;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
            if (window.notificationManager) window.notificationManager.show('Lỗi tạo đơn: ' + error.message, 'error');
        }
    },

    /**
     * Show order detail for a customer (opens customer panel with order focus)
     * @param {string} fromId - Facebook user ID
     */
    async showOrderDetail(fromId) {
        const state = window.TposState;
        const partner = state.partnerCache.get(fromId);
        const name = partner?.Name || fromId;
        window.TposCustomerPanel.showCustomerInfo(fromId, name);
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

        titleEl.textContent = name;
        bodyEl.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><span>Đang tải...</span></div>';
        modal.style.display = 'flex';

        try {
            const state = window.TposState;
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
                } catch { /* fallback below */ }
            }

            // Strategy 2: Lookup by fb_id via Render DB
            if (!customerData && fbId) {
                try {
                    const resp = await fetch(`${workerUrl}/api/v2/customers/by-fb-id/${fbId}`);
                    const json = await resp.json();
                    if (json.success && json.data) {
                        customerData = json.data;
                    }
                } catch { /* fallback below */ }
            }

            if (customerData) {
                this._renderCustomerPopup(bodyEl, customerData, name, fbId);
            } else {
                // Show basic info from TPOS partner cache
                bodyEl.innerHTML = `
                    <div class="customer-section">
                        <h4>Thông tin cơ bản</h4>
                        <div class="customer-field"><label>Tên:</label><span>${SharedUtils.escapeHtml(name)}</span></div>
                        <div class="customer-field"><label>FB ID:</label><span style="font-family:monospace;font-size:12px;cursor:pointer" onclick="navigator.clipboard.writeText('${fbId}');showNotification?.('Đã copy','success')">${fbId}</span></div>
                        ${partner?.Phone ? `<div class="customer-field"><label>SĐT:</label><span>${partner.Phone}</span></div>` : ''}
                        ${partner?.Street ? `<div class="customer-field"><label>Địa chỉ:</label><span>${partner.Street}</span></div>` : ''}
                        ${partner?.StatusText ? `<div class="customer-field"><label>Trạng thái:</label><span>${partner.StatusText}</span></div>` : ''}
                        <p style="margin-top:12px;color:#9ca3af;font-size:12px;">Chưa có dữ liệu Pancake. Khách cần nhắn tin inbox để được sync.</p>
                    </div>
                    <div style="margin-top:16px;text-align:right;">
                        <button onclick="document.getElementById('customerInfoModal').style.display='none'"
                            style="padding:8px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;cursor:pointer;">Đóng</button>
                    </div>`;
            }
        } catch (error) {
            bodyEl.innerHTML = `<div style="text-align:center;padding:30px;color:#ef4444;">Lỗi: ${error.message}</div>`;
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
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
            ...notes.map(n => ({ text: n.content, by: n.created_by, at: n.created_at, src: 'db' })),
            ...pancakeNotes.map(n => ({
                text: n.message || n.content || '',
                by: n.created_by?.fb_name || 'Pancake',
                at: n.created_at ? new Date(typeof n.created_at === 'number' ? n.created_at : n.created_at).toLocaleString('vi-VN') : '',
                src: 'pancake'
            }))
        ];

        bodyEl.innerHTML = `
            <div class="customer-section">
                <h4><i data-lucide="user" style="width:16px;height:16px;"></i> Thông tin khách hàng</h4>
                <div class="customer-field"><label>Tên:</label><span><strong>${SharedUtils.escapeHtml(c.name || name)}</strong></span></div>
                ${c.phone ? `<div class="customer-field"><label>SĐT:</label><span style="cursor:pointer" onclick="navigator.clipboard.writeText('${c.phone}');showNotification?.('Đã copy','success')">${c.phone}</span></div>` : ''}
                ${c.fb_id ? `<div class="customer-field"><label>FB ID:</label><span style="font-family:monospace;font-size:12px">${c.fb_id}</span></div>` : ''}
                ${c.global_id ? `<div class="customer-field"><label>Global ID:</label><span style="font-family:monospace;font-size:12px">${c.global_id}</span></div>` : ''}
                ${c.gender ? `<div class="customer-field"><label>Giới tính:</label><span>${c.gender}</span></div>` : ''}
                ${c.birthday ? `<div class="customer-field"><label>Sinh nhật:</label><span>${c.birthday}</span></div>` : ''}
                ${c.lives_in ? `<div class="customer-field"><label>Nơi sống:</label><span>${c.lives_in}</span></div>` : ''}
                ${c.status && c.status !== 'Bình thường' ? `<div class="customer-field"><label>Trạng thái:</label><span style="color:${c.status === 'Bom hàng' || c.status === 'Nguy hiểm' ? '#ef4444' : '#f59e0b'};font-weight:600">${c.status}</span></div>` : ''}
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

            ${allNotes.length > 0 ? `
            <div class="customer-section">
                <h4><i data-lucide="sticky-note" style="width:16px;height:16px;"></i> Ghi chú (${allNotes.length})</h4>
                ${allNotes.slice(0, 5).map(n => `
                    <div class="comment-item" style="${n.src === 'pancake' ? 'border-left:3px solid #f59e0b;' : ''}">
                        <div class="comment-text">${SharedUtils.escapeHtml(n.text)}</div>
                        <div class="comment-time">${SharedUtils.escapeHtml(n.by || '')} ${n.at ? '· ' + n.at : ''}</div>
                    </div>
                `).join('')}
            </div>` : ''}

            <div style="display:flex;gap:12px;margin-top:20px;">
                <button onclick="document.getElementById('customerInfoModal').style.display='none'"
                    style="flex:1;padding:10px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;cursor:pointer;font-weight:500;">Đóng</button>
                <button onclick="TposCustomerPanel.showCustomerInfo('${fbId}','${SharedUtils.escapeHtml(name)}');document.getElementById('customerInfoModal').style.display='none';"
                    style="flex:1;padding:10px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">
                    Xem TPOS Info
                </button>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.TposCommentList = TposCommentList;
}
