// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Comment List — RENDER-ROW module. Dựng HTML 1 dòng comment (avatar, badge
 * STT/đơn, SĐT/địa chỉ inline, actions hover) + status options/colors. Tách
 * MOVE-only từ live-comment-list.js. Load SAU render-list (renderCommentItem được
 * _appendOlderBatch/_patchRowsChunked/renderCommentsNow/prependComments gọi).
 */
(function () {
    'use strict';
    const NS = window._LiveCmtList;
    const liveSvgIcon = NS.liveSvgIcon;
    const liveAttr = NS.liveAttr;

    Object.assign(window.LiveCommentList, {
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
            const pictureUrl = SharedUtils.getAvatarUrl(
                fromId,
                commentPageId,
                null,
                directPictureUrl
            );
            // Thời gian tương đối tự-tick ("Vừa xong"→"N phút") qua LiveTime shared.
            // data-live-ts để 1 ticker chung cập nhật textContent — KHÔNG re-render dòng.
            const timeMarkup = window.LiveTime
                ? window.LiveTime.markup(createdTime, { tag: 'span', cls: 'live-conv-time' })
                : `<span class="live-conv-time">${SharedUtils.formatTime(createdTime)}</span>`;

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
                ? `<span class="order-code-badge" title="Đơn web ${liveAttr(sessionInfo.code)}" style="background:#e8f2ff;color:#0058da;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600;cursor:pointer" data-action="order-detail" data-from-id="${liveAttr(fromId)}">${SharedUtils.escapeHtml(sessionInfo.code)}</span>`
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
            const kho = state.customerKhoCache?.get(fromId);
            // Trạng thái KH: lấy ở KHO web2_customers (kho.status) — map nhãn VN qua
            // LiveStatus shared; fallback CRM partner.StatusText nếu có (giữ tương thích).
            const khoStatusLabel =
                window.LiveStatus && kho?.status
                    ? window.LiveStatus.normalize(kho.status).label
                    : '';
            const statusText = khoStatusLabel || partner.StatusText || '';
            const statusColor = this.getStatusColor(statusText);
            const statusBg = statusColor ? `${statusColor}18` : '';
            // SĐT/địa chỉ: warehouse trước → kho KH → SĐT Pancake CỦA CHÍNH COMMENT
            // (recent_phone_numbers — khách comment kèm SĐT ở Pancake) lấp chỗ trống
            // cho KH chưa có trong kho. "Lấy thông tin khách ở Pancake nếu có".
            const pancakePhone = (() => {
                const arr = comment._phones;
                const ph = Array.isArray(arr) && arr.length ? arr[0] : null;
                if (ph)
                    return (typeof ph === 'string' ? ph : ph.phone_number || ph.phone || '') || '';
                // Khách tự gõ SĐT trong nội dung comment ("0766..." / "+84...").
                const m = String(comment.message || '')
                    .replace(/[.\s()\-_]/g, '')
                    .match(/(?:\+?84|0)(\d{9})(?!\d)/);
                return m ? '0' + m[1] : '';
            })();
            // Fallback comment.phone/comment.address (DB web2_live_comments — server
            // poller enrich từ Pancake profile) → dòng SSE mới hiện SĐT/địa chỉ NGAY
            // kể cả khi partnerCache/khoCache chưa nạp (fix: index.html thiếu địa chỉ).
            // Chỉ nhận SĐT HỢP LỆ (10 số) — tránh hiện giá trị nhiễm (vd đuôi fb_id
            // '1254523635' lọt vào kho/comment.phone do bug normPhone cũ). (2026-06-15)
            const _vp = window.Web2CustomerStore?.isValidPhone;
            const phone =
                [partner.Phone, kho?.phone, pancakePhone, comment.phone].find(
                    (p) => p && (!_vp || _vp(p))
                ) || '';
            const address = partner.Street || kho?.address || comment.address || '';

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
                                    <div class="inline-status-container">
                                        <div id="status-btn-${fromIdA}" class="live-status-badge" style="${statusBadgeStyle}"
                                             data-action="toggle-status" data-from-id="${fromIdA}">
                                            <span id="status-text-${fromIdA}">${SharedUtils.escapeHtml(statusText) || 'Trạng thái'}</span>
                                        </div>
                                        <div id="status-dropdown-${fromIdA}" class="live-status-dropdown" style="display:none;" data-loaded="0"></div>
                                    </div>
                                    ${isMultiPage ? `<span class="live-tag" style="${pageBadgeColor}">${SharedUtils.escapeHtml(shortPageName)}</span>` : ''}
                                    ${walletPlaceholder}
                                    ${orderBadge || ''}
                                    ${isHidden ? '<span class="live-tag" style="background:#fee2e2;color:#dc2626;">Ẩn</span>' : ''}
                                </div>
                            </div>
                            ${timeMarkup}
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
                                // Button title + icon theo trạng thái GIỎ HÀNG (native-orders,
                                // chưa PBH = giỏ hàng):
                                //  - Chưa có giỏ → "Tạo giỏ hàng" (shopping-cart)
                                //  - Có giỏ, comment chưa gộp → "Thêm comment vào giỏ" (plus-square)
                                //  - Có giỏ, comment đã gộp → "Đã thêm vào giỏ" (check-square)
                                let btnTitle, btnIcon, btnColor;
                                if (!sessionInfo) {
                                    btnTitle = 'Tạo giỏ hàng';
                                    btnIcon = 'shopping-cart';
                                    btnColor = '#0068ff';
                                } else if (isCommentInOrder) {
                                    btnTitle = `Comment đã thêm vào giỏ ${sessionInfo.code}`;
                                    btnIcon = 'check-square';
                                    btnColor = '#10b981';
                                } else {
                                    btnTitle = `Thêm comment vào giỏ ${sessionInfo.code}`;
                                    btnIcon = 'plus-square';
                                    btnColor = '#0068ff';
                                }
                                return `<button class="live-action-btn" id="create-order-${fromIdA}-${idA}" title="${liveAttr(btnTitle)}" style="color:${btnColor};" data-action="create-order" data-from-id="${fromIdA}" data-name="${nameA}" data-comment-id="${idA}">
                                           ${liveSvgIcon(btnIcon, 13)}
                                       </button>`;
                            })()}
                            <button class="live-action-btn" title="Xem info" data-action="show-info" data-from-id="${fromIdA}" data-name="${nameA}">
                                ${liveSvgIcon('user', 13)}
                            </button>
                            ${
                                partner.Phone
                                    ? `<a class="live-action-btn" title="Mở thẻ KH Web 2.0" href="../web2/customers/index.html?phone=${encodeURIComponent(partner.Phone)}" target="_blank" rel="noopener" style="color:#0891b2;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">
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
                            <button class="live-action-btn" title="Ẩn TẤT CẢ comment của người này (mọi máy — quản lý ở nút 🙈 topbar)" style="color:#dc2626;" data-action="hide-commenter" data-from-id="${fromIdA}" data-name="${nameA}">
                                ${liveSvgIcon('user-x', 13)}
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
    });
})();
