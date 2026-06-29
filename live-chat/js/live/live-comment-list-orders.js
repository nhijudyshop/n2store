// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Comment List — ORDERS module. Tạo đơn web NATIVE_WEB từ comment
 * (NativeOrdersApi), refresh row sau khi tạo, mở chi tiết đơn + popup thông tin
 * KH (lookup kho web2_customers — kho trước, Pancake sau). Tách MOVE-only từ
 * live-comment-list.js. Load CUỐI (cần renderCommentItem + state methods).
 */
(function () {
    'use strict';
    const NS = window._LiveCmtList;
    const liveAttr = NS.liveAttr;
    const _liveW2Auth = NS._liveW2Auth;

    Object.assign(window.LiveCommentList, {
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

            // Bug #7: phone/addr inputs dùng id=`phone-${fromId}` (chỉ theo fromId,
            // KHÔNG unique theo comment) → 1 KH nhiều comment row sẽ trùng id, và
            // getElementById trả ROW ĐẦU trong DOM → đọc nhầm input của row khác.
            // Fix: lấy nút theo id comment-unique (create-order-${fromId}-${commentId})
            // rồi đọc input SCOPED trong cùng .live-conversation-item của nút đó.
            const btn = document.getElementById(`create-order-${fromId}-${commentId}`);
            const row = btn?.closest('.live-conversation-item') || document;
            const phoneEl =
                row.querySelector(`#phone-${CSS.escape(String(fromId))}`) ||
                row.querySelector('.live-conv-info input[id^="phone-"]');
            const addrEl =
                row.querySelector(`#addr-${CSS.escape(String(fromId))}`) ||
                row.querySelector('.live-conv-info input[id^="addr-"]');
            const phone = phoneEl ? phoneEl.value.trim() : '';
            const address = addrEl ? addrEl.value.trim() : '';
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
                        label = `✓ Comment đã có trong giỏ hàng (${order.commentCount} comments)`;
                        type = 'info';
                    } else if (resp.merged) {
                        label = `📝 Đã thêm comment vào giỏ hàng (${order.commentCount} comments)`;
                        type = 'info';
                    } else {
                        label = '🆕 Đã tạo giỏ hàng';
                    }
                    window.notificationManager.show(
                        `${label}: ${order.code} (STT: ${order.displayStt ?? order.sessionIndex})`,
                        type
                    );
                }
            } catch (error) {
                // Restore button to clickable state with the previous icon.
                // Dùng tham chiếu `btn` đã giữ (đóng băng) thay vì getElementById lại
                // — nếu row re-render giữa chừng, getElementById có thể trả null →
                // nút kẹt spinner. btn vẫn trỏ đúng element (kể cả đã detach).
                if (btn) {
                    btn.innerHTML = `<i data-lucide="${previousIcon}" style="width:14px;height:14px;"></i>`;
                    btn.disabled = false;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
                if (window.notificationManager)
                    window.notificationManager.show('Lỗi tạo giỏ hàng: ' + error.message, 'error');
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
                    while (
                        i < end &&
                        (deadline.timeRemaining ? deadline.timeRemaining() > 0 : true)
                    ) {
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
         * 3W3 (2026-06-12): lookup KHO KH Web 2.0 (`web2_customers`, /api/web2/customers)
         * — KHÔNG còn gọi /api/v2/customers Web 1.0 (bảng customers chatDb).
         * Rule "kho trước, Pancake sau": kho không có → hiện info cơ bản từ cache Live.
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

                // Map row lite kho Web 2.0 {id,phone,name,address,email,fbId} → shape
                // _renderCustomerPopup (snake_case fb_id). Kho lite KHÔNG có wallet/
                // notes/order stats → popup tự render 0/ẩn các phần đó.
                const mapWarehouse = (lite) =>
                    lite
                        ? {
                              customer: {
                                  name: lite.name || '',
                                  phone: lite.phone || '',
                                  address: lite.address || '',
                                  fb_id: lite.fbId || fbId || '',
                              },
                          }
                        : null;

                // Strategy 1: theo SĐT — kho KH Web 2.0 (web2_customers)
                if (phone) {
                    try {
                        const resp = await fetch(
                            `${workerUrl}/api/web2/customers/${encodeURIComponent(phone)}`
                        );
                        const json = await resp.json();
                        // Route trả {success, customer} — customer null khi kho không có.
                        if (json.success && json.customer) {
                            customerData = mapWarehouse(json.customer);
                        }
                    } catch {
                        /* fallback below */
                    }
                }

                // Strategy 2: theo fb_id — batch-by-fbid (lấy phần tử ứng với fbId)
                if (!customerData && fbId) {
                    try {
                        const resp = await fetch(`${workerUrl}/api/web2/customers/batch-by-fbid`, {
                            method: 'POST',
                            headers: _liveW2Auth({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({ fbIds: [fbId] }),
                        });
                        const json = await resp.json();
                        // Route trả {success, data: {[fbId]: lite}} — key theo fbId gửi lên.
                        const lite = json.success
                            ? json.data?.[fbId] || Object.values(json.data || {})[0]
                            : null;
                        if (lite) customerData = mapWarehouse(lite);
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
                        ? (SharedUtils.parseTimestamp(n.created_at)?.toLocaleString('vi-VN', {
                              timeZone: 'Asia/Ho_Chi_Minh',
                          }) ?? '')
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
    });
})();
