// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Comment List — ACTIONS module. Tương tác user trên 1 dòng: select comment,
 * status dropdown + cập nhật trạng thái, lưu SĐT/địa chỉ inline (Web2Optimistic
 * snapshot/apply/rollback), save-to-Live, connection/debt badges, reply comment.
 * Tách MOVE-only từ live-comment-list.js. Load SAU render-row. Tạo đơn web +
 * popup KH ở module orders (live-comment-list-orders.js).
 */
(function () {
    'use strict';
    const NS = window._LiveCmtList;
    const liveAttr = NS.liveAttr;

    Object.assign(window.LiveCommentList, {
        /**
         * Boost-purge: SSE {action:'reconcile', purgedIds} gỡ spam. Delta fetch chỉ
         * APPEND nên không tự gỡ → xoá purgedIds khỏi state.comments + DOM (audit MEDIUM 2026-06-30).
         * @param {Array<string|number>} ids
         */
        removeComments(ids) {
            const idSet = new Set((ids || []).map(String));
            if (!idSet.size) return;
            const state = window.LiveState;
            if (state && Array.isArray(state.comments))
                state.comments = state.comments.filter((c) => !idSet.has(String(c.id)));
            idSet.forEach((id) => {
                document
                    .querySelector(
                        `.live-conversation-item[data-comment-id="${CSS.escape(String(id))}"]`
                    )
                    ?.remove();
            });
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
                window.dispatchEvent(
                    new CustomEvent('liveCommentSelected', { detail: { comment } })
                );
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
            // BẮT BUỘC đồng bộ customerKhoCache (web2_customers) — display ƯU TIÊN đọc
            // kho.status (LiveStatus.normalize). Chỉ update partnerCache → re-render stale.
            const _setKho = (s) => {
                const k = state.customerKhoCache && state.customerKhoCache.get(userId);
                if (k) {
                    k.status = s;
                    state.customerKhoCache.set(userId, k);
                }
            };
            const _prevKho =
                (state.customerKhoCache && state.customerKhoCache.get(userId)?.status) || '';

            // UI-first: cập nhật badge + cache NGAY, backend background, rollback nếu lỗi.
            if (window.Web2Optimistic?.run) {
                window.Web2Optimistic.run({
                    snapshot: () => ({
                        text: partner.StatusText || '',
                        color: this.getStatusColor(partner.StatusText || ''),
                        kho: _prevKho,
                    }),
                    apply: () => {
                        _applyBadge(text, color);
                        partner.StatusText = text;
                        state.partnerCache.set(userId, partner);
                        _setKho(text);
                    },
                    run: async () => {
                        const ok = await window.LiveApi.updatePartnerStatusViaProxy(
                            partner.Id,
                            value
                        );
                        if (!ok) throw new Error('cập nhật thất bại');
                        return ok;
                    },
                    rollback: (prev) => {
                        _applyBadge(prev.text, prev.color);
                        partner.StatusText = prev.text;
                        state.partnerCache.set(userId, partner);
                        _setKho(prev.kho);
                    },
                    successMsg: 'Đã cập nhật trạng thái',
                    errLabel: 'cập nhật trạng thái',
                });
                return;
            }

            // Fallback legacy (không có helper): update UI rồi await.
            _applyBadge(text, color);
            _setKho(text);
            const success = await window.LiveApi.updatePartnerStatusViaProxy(partner.Id, value);
            if (success) {
                partner.StatusText = text;
                state.partnerCache.set(userId, partner);
                if (window.notificationManager)
                    window.notificationManager.success('Đã cập nhật trạng thái');
            } else {
                _setKho(_prevKho);
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
            // SĐT VN = ĐÚNG 10 số (0xxxxxxxxx) — chặn lưu dãy rác/fb_id. (2026-06-15)
            if (
                window.Web2CustomerStore?.isValidPhone &&
                !window.Web2CustomerStore.isValidPhone(newPhone)
            ) {
                if (window.notificationManager)
                    window.notificationManager.show(
                        'SĐT phải đúng 10 số (vd 0917540164)',
                        'warning'
                    );
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
                        const r = await window.LiveApi.savePartnerData(userId, { Phone: newPhone });
                        // savePartnerData KHÔNG throw — phải check {ok} để optimistic rollback
                        // (vd 409 SĐT đã thuộc KH khác / 400). (2026-06-15)
                        if (r && r.ok === false)
                            throw new Error('SĐT đã thuộc khách khác hoặc không hợp lệ');
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
                        const r = await window.LiveApi.savePartnerData(userId, {
                            Street: newAddress,
                        });
                        if (r && r.ok === false) throw new Error('Không lưu được địa chỉ');
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
                if (window.notificationManager)
                    window.notificationManager.success('Đã lưu địa chỉ');
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
                checkmark.innerHTML =
                    '<i data-lucide="check" style="width: 16px; height: 16px;"></i>';
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
                // Bỏ qua Enter khi đang gõ IME tiếng Việt (isComposing/keyCode 229) → tránh
                // gửi nhầm comment soạn dở khi nhấn Enter chọn ứng viên bộ gõ.
                if (e.isComposing || e.keyCode === 229) return;
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
    });
})();
