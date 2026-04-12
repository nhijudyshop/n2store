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

        container.innerHTML = `
            <div class="tpos-chat-wrapper">
                <!-- Merged Header: TPOS title + selectors + actions in one row -->
                <div class="tpos-chat-header tpos-merged-header">
                    <div class="tpos-title-section">
                        <i data-lucide="shopping-cart" class="tpos-icon"></i>
                        <span class="tpos-title">TPOS</span>
                    </div>
                    <div class="tpos-selectors">
                        <select id="tposCrmTeamSelect" class="tpos-filter-select" disabled>
                            <option value="">Chọn Page...</option>
                        </select>
                        <select id="tposLiveCampaignSelect" class="tpos-filter-select" disabled>
                            <option value="">Chọn Live Campaign...</option>
                        </select>
                    </div>
                    <div class="tpos-header-actions">
                        <div class="tpos-status-indicator" id="tposStatusIndicator">
                            <span class="status-dot disconnected"></span>
                            <span class="status-text">Live</span>
                        </div>
                        <button class="tpos-btn-refresh" id="btnTposRefresh" title="Refresh">
                            <i data-lucide="refresh-cw"></i>
                        </button>
                        <button class="tpos-btn-expand" id="btnTposExpand" title="Mở rộng" onclick="toggleFullscreen('tpos')">
                            <i data-lucide="maximize-2"></i>
                        </button>
                    </div>
                </div>
                <!-- Comment list -->
                <div class="tpos-conversation-list" id="tposCommentList">
                    <div class="tpos-empty">
                        <i data-lucide="message-square"></i>
                        <span>Chọn Page và Live Campaign để xem comment</span>
                    </div>
                </div>
                <!-- Loading indicator for infinite scroll -->
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

        const campaignSelect = document.getElementById('tposLiveCampaignSelect');
        if (campaignSelect) {
            campaignSelect.addEventListener('change', (e) => {
                window.eventBus.emit('tpos:liveCampaignChanged', e.target.value);
            });
        }

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
     * Render Live Campaign options in the selector
     */
    renderLiveCampaignOptions() {
        const state = window.TposState;
        const select = document.getElementById('tposLiveCampaignSelect');
        if (!select) return;

        let options = '<option value="">Chọn Live Campaign...</option>';

        state.liveCampaigns.forEach(campaign => {
            options += `<option value="${campaign.Id}">
                ${SharedUtils.escapeHtml(campaign.Name)} (${campaign.Facebook_UserName || ''})
            </option>`;
        });

        select.innerHTML = options;
        select.disabled = state.liveCampaigns.length === 0;
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
        const directPictureUrl = comment.from?.picture?.data?.url || '';
        const pictureUrl = SharedUtils.getAvatarUrl(fromId, state.selectedPage?.Facebook_PageId, null, directPictureUrl);
        const timeStr = SharedUtils.formatTime(createdTime);

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
            `<div class="inline-status-option" style="padding: 6px 10px; cursor: pointer; font-size: 12px;"
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
                           <div class="avatar-placeholder" style="display: none; background: ${gradientColor};">${initial}</div>`
                : `<div class="avatar-placeholder" style="background: ${gradientColor};">${initial}</div>`
            }
                    ${sessionIndexBadge}
                    <span class="channel-badge">
                        <i data-lucide="facebook" class="channel-icon fb"></i>
                    </span>
                </div>
                <div class="tpos-conv-content" style="flex: 1; min-width: 0;">
                    <!-- Row 1: Name + Order badge + Hidden tag -->
                    <div class="tpos-conv-header" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span class="customer-name" style="font-weight: 600;">${SharedUtils.escapeHtml(fromName)}</span>
                        ${orderBadge}
                        ${isHidden ? '<span class="tpos-tag" style="background:#fee2e2;color:#dc2626;font-size:10px;padding:2px 6px;border-radius:4px;">Ẩn</span>' : ''}
                    </div>

                    <!-- Row 2: COMMENT -->
                    <div class="tpos-conv-message" style="margin-top: 6px; color: #1f2937; font-size: 14px; font-weight: 500; line-height: 1.4; background: #f0f9ff; padding: 8px 10px; border-radius: 6px; border-left: 3px solid #3b82f6;">${SharedUtils.escapeHtml(message)}</div>

                    <!-- Row 3: Status + Phone + Address -->
                    <div class="tpos-conv-info" style="display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap;" onclick="event.stopPropagation();">
                        <!-- Status Dropdown -->
                        <div class="inline-status-container" style="position: relative; display: inline-flex;">
                            <button id="status-btn-${fromId}" style="display: flex; align-items: center; gap: 3px; padding: 3px 8px; border: 1px solid #e5e7eb; border-radius: 4px; background: #f9fafb; cursor: pointer; font-size: 11px; color: #374151;"
                                    onclick="event.stopPropagation(); TposCommentList.toggleInlineStatusDropdown('${fromId}')">
                                <span id="status-text-${fromId}">${statusText || 'Trạng thái'}</span>
                                <i data-lucide="chevron-down" style="width: 10px; height: 10px;"></i>
                            </button>
                            <div id="status-dropdown-${fromId}" style="display: none; position: absolute; top: 100%; left: 0; background: white; border: 1px solid #e5e7eb; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; min-width: 120px;">
                                ${statusDropdownHtml}
                            </div>
                        </div>

                        <!-- Phone Input + Debt Badge -->
                        <div class="inline-phone-container" style="display: inline-flex; align-items: center; gap: 2px;">
                            <input type="text" id="phone-${fromId}" value="${SharedUtils.escapeHtml(phone)}" placeholder="SĐT"
                                   style="width: 100px; padding: 3px 6px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 11px; background: #f9fafb;"
                                   onclick="event.stopPropagation();">
                            <button id="save-phone-${fromId}" style="padding: 3px 4px; border: none; background: transparent; cursor: pointer;"
                                    onclick="event.stopPropagation(); TposCommentList.saveInlinePhone('${fromId}', 'phone-${fromId}')"
                                    title="Lưu SĐT">
                                <i data-lucide="save" style="width: 14px; height: 14px; color: #6b7280;"></i>
                            </button>
                            ${hasDebt ? `<span class="debt-badge" style="padding: 2px 6px; background: #fef2f2; color: #dc2626; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap;" title="Công nợ">Nợ: ${debtDisplay}</span>` : ''}
                        </div>

                        <!-- Address Input -->
                        <div class="inline-addr-container" style="display: inline-flex; align-items: center; gap: 2px; flex: 1; min-width: 150px;">
                            <input type="text" id="addr-${fromId}" value="${SharedUtils.escapeHtml(address)}" placeholder="Địa chỉ"
                                   style="flex: 1; padding: 3px 6px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 11px; background: #f9fafb; min-width: 0;"
                                   onclick="event.stopPropagation();">
                            <button id="save-addr-${fromId}" style="padding: 3px 4px; border: none; background: transparent; cursor: pointer;"
                                    onclick="event.stopPropagation(); TposCommentList.saveInlineAddress('${fromId}', 'addr-${fromId}')"
                                    title="Lưu địa chỉ">
                                <i data-lucide="save" style="width: 14px; height: 14px; color: #6b7280;"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="tpos-conv-actions" style="display:flex;flex-direction:column;gap:2px;align-items:center;">
                    ${!sessionInfo?.code
                        ? `<button class="tpos-action-btn" id="create-order-${fromId}" title="Tạo đơn hàng TPOS" style="color:#3b82f6;" onclick="event.stopPropagation(); TposCommentList.createOrder('${fromId}', '${SharedUtils.escapeHtml(fromName)}', '${id}')">
                               <i data-lucide="shopping-cart" style="width:14px;height:14px;"></i>
                           </button>`
                        : `<span title="Đã có đơn: ${sessionInfo.code}" style="color:#10b981;padding:4px;font-size:10px;font-weight:700;">
                               <i data-lucide="package-check" style="width:14px;height:14px;"></i>
                           </span>`
                    }
                    <button class="tpos-action-btn" title="Xem thông tin" onclick="event.stopPropagation(); TposCustomerPanel.showCustomerInfo('${fromId}', '${SharedUtils.escapeHtml(fromName)}')">
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
        // CRMTeamId must be the CHILD page Id (e.g. 2 for NhiJudy Store), not parent team Id
        const crmTeamId = state.selectedPage?.Id;
        const postId = state.selectedCampaign?.Facebook_LiveId;

        if (!crmTeamId || !postId) {
            if (window.notificationManager) window.notificationManager.show('Chưa chọn campaign', 'error');
            return;
        }

        // Get phone/address from partner cache if available
        const partner = state.partnerCache.get(fromId);
        const phone = document.getElementById(`phone-${fromId}`)?.value || partner?.Phone || '';
        const address = document.getElementById(`addr-${fromId}`)?.value || partner?.Street || '';

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
                commentId,
                phone,
                address,
                note: ''
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
    }
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.TposCommentList = TposCommentList;
}
