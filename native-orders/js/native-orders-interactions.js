// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — interactions modal shell/header/tabs + right panel + quick reply + extension bridge. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // ---------- Interactions modal: Tin nhắn + Bình luận ----------
    // Phase 18b: chat + reply directly in modal via lazy-loaded Pancake API.
    // Realtime-aware: subscribes to native_order:updated and refreshes the
    // open modal when the same order changes.
    NO._interactionsState = null;
    // { code, tab, scrollY }

    /**
     * Web2Chat client is loaded via index.html (`web2/shared/web2-chat-client.js`).
     * No shared code with Web 1.0 — token config is read directly from
     * localStorage keys that the user already configured in web2-pancake.
     */
    NO._hasChatClient = function _hasChatClient() {
        return !!window.Web2Chat;
    };

    NO.openInteractions = async function openInteractions(code, initialTab = 'messages') {
        const order = NO.STATE.orders.find((o) => o.code === code);
        if (!order) {
            NO.notify('Không tìm thấy đơn ' + code, 'error');
            return;
        }
        // HỢP NHẤT 1 NGUỒN (2026-06-19): dùng Web2CustomerChat shared (3-cột Pancake
        // sidebar tìm kiếm + thread) — tin nhắn KH. Comments của đơn + info → cột INFO
        // bên phải (panels.info), reply bind lại trong onReady. Web2CustomerChat tự lo
        // resolve hội thoại (phone → fbId) + realtime (Web2ChatPanel) → KHÔNG cần modal
        // chat riêng của native-orders nữa.
        if (window.Web2CustomerChat?.open) {
            NO._interactionsState = { code, viaCustomerChat: true };
            window.Web2CustomerChat.open({
                layout: 'modal',
                phone: order.phone,
                fbId: order.fbUserId,
                pageId: order.fbPageId,
                name: order.customerName || order.fbUserName || '',
                query: order.phone || order.customerName || '',
                panels: { info: NO._renderInteractionsInfoHtml(order) },
                onReady: (handle) => {
                    const infoEl = handle && handle.getInfoEl && handle.getInfoEl();
                    // Comment đã render sync từ order.note (đúng nguồn — chụp lúc tạo đơn).
                    // Chỉ cần bind nút trả lời + vẽ icon.
                    if (infoEl) NO._wireCommentReplies(infoEl, order);
                    window.lucide?.createIcons?.();
                },
            });
            return;
        }
        // Web2CustomerChat tải sẵn qua sidebar shared trên mọi trang Web 2.0 nên hầu
        // như luôn có. Nếu (hiếm) chưa kịp load → báo tải lại thay vì dựng modal chat
        // cũ (đã gỡ khi hợp nhất chat 2026-06-19).
        NO.notify('Chat chưa sẵn sàng, vui lòng tải lại trang', 'error');
    };

    // Cột INFO (panels.info) cho Web2CustomerChat: tiêu đề đơn + danh sách bình luận
    // live-chat ĐÃ TẠO ĐƠN (kéo SP vào comment). Nguồn = order.note (chụp lúc tạo đơn,
    // format mỗi comment `[time] [Page] message`, nối bằng `\n---\n`). KHÔNG fetch
    // web2_live_comments vì id/fb_id của đơn (PSID) ≠ namespace bảng đó → không join.
    NO._renderInteractionsInfoHtml = function _renderInteractionsInfoHtml(order) {
        const esc = NO.escapeHtml;
        const head = `
            <div style="font-weight:700;font-size:13px;color:var(--web2-text,#111827);display:flex;align-items:center;gap:6px;">
                <i data-lucide="message-square-text" style="width:15px;height:15px;"></i> Bình luận (live-chat)
            </div>
            <div style="font-size:12px;color:var(--web2-text-mute,#6b7280);">
                ${esc(order.code || '')}${order.customerName ? ' · ' + esc(order.customerName) : ''}${order.phone ? ' · ' + esc(order.phone) : ''}
            </div>`;
        return `<div style="display:flex;flex-direction:column;gap:10px;">${head}${NO._renderCommentsPanel(order)}</div>`;
    };

    // Parse order.note → [{time, page, message}] theo từng comment.
    // Format 1 dòng: `[HH:MM:SS D/M/YYYY] [Page] message` (time đã là GMT+7 do server
    // TZ=+7 toLocaleString lúc lưu). Nhiều comment nối bằng `---`.
    NO._parseNoteComments = function _parseNoteComments(note) {
        if (!note) return [];
        return String(note)
            .split('---')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((seg) => {
                let time = '';
                let page = '';
                let message = seg;
                const tm = message.match(/^\[([^\]]+)\]\s*/);
                if (tm) {
                    time = tm[1].trim();
                    message = message.slice(tm[0].length);
                }
                const pm = message.match(/^\[([^\]]+)\]\s*/);
                if (pm) {
                    page = pm[1].trim();
                    message = message.slice(pm[0].length);
                }
                return { time, page, message: message.trim() };
            });
    };

    // Bind nút trả lời bình luận trong cột info (Web2CustomerChat onReady) — tái dùng
    // NO._handleReplyComment (giống nhánh tab 'comments' của modal cũ).
    NO._wireCommentReplies = function _wireCommentReplies(root, order) {
        if (!root) return;
        root.querySelectorAll('[data-action="reply-comment"]').forEach((btn) => {
            btn.addEventListener('click', () =>
                NO._handleReplyComment(order, btn.dataset.cid, btn.dataset.input, 'public')
            );
        });
        root.querySelectorAll('[data-action="private-reply"]').forEach((btn) => {
            btn.addEventListener('click', () =>
                NO._handleReplyComment(order, btn.dataset.cid, btn.dataset.input, 'private')
            );
        });
        root.querySelectorAll('textarea[id^="replyCmt-"]').forEach((ta) => {
            ta.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    const cid = ta.parentElement?.querySelector('[data-action="reply-comment"]')
                        ?.dataset?.cid;
                    if (cid) NO._handleReplyComment(order, cid, ta.id, 'public');
                }
            });
        });
    };

    // ---- n2store-extension bridge: bypass 24h rule via FB Business Suite ----
    // Extension content script (manifest: nhijudyshop.github.io + *.workers.dev)
    // listens on window.postMessage with type matching INBOUND_TYPES, forwards
    // to its service worker which calls Facebook Business GraphQL (REPLY_INBOX_PHOTO,
    // SEND_COMMENT, SEND_PRIVATE_REPLY). FB Business rules differ from Pancake's
    // 24h policy — extension can send outside the standard window.
    NO._extensionReady = false;

    NO._extensionVersion = null;

    window.addEventListener('message', (e) => {
        const m = e.data;
        if (!m || typeof m !== 'object') return;
        if (m.type === 'EXTENSION_LOADED' || m.type === 'EXTENSION_VERSION') {
            NO._extensionReady = true;
            NO._extensionVersion = m.version || m.payload?.version || 'unknown';
            console.log('[NativeOrders] n2store-extension ready v' + NO._extensionVersion);
        }
    });

    NO._hasExtension = function _hasExtension() {
        return NO._extensionReady;
    };

    /**
     * Send a request to the extension via window.postMessage bridge.
     * @param {string} type  — e.g. 'REPLY_INBOX_PHOTO', 'SEND_COMMENT', 'SEND_PRIVATE_REPLY'
     * @param {object} data  — payload (pageId, globalUserId, message, ...)
     * @param {number} timeoutMs
     * @returns {Promise<{ok:boolean, data?, error?}>}
     */
    NO._extensionRequest = function _extensionRequest(type, data, timeoutMs = 30000) {
        return new Promise((resolve) => {
            const taskId = `nw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const SUCCESS = type + '_SUCCESS';
            const FAILURE = type + '_FAILURE';
            let done = false;
            const onMsg = (e) => {
                const m = e.data;
                if (!m || typeof m !== 'object') return;
                if (m.taskId && m.taskId !== taskId) return;
                if (m.type === SUCCESS) {
                    done = true;
                    window.removeEventListener('message', onMsg);
                    resolve({ ok: true, data: m });
                } else if (m.type === FAILURE) {
                    done = true;
                    window.removeEventListener('message', onMsg);
                    resolve({ ok: false, error: m.error || 'Extension reported failure' });
                }
            };
            window.addEventListener('message', onMsg);
            window.postMessage({ ...data, type, taskId }, '*');
            setTimeout(() => {
                if (!done) {
                    window.removeEventListener('message', onMsg);
                    resolve({ ok: false, error: 'Extension timeout' });
                }
            }, timeoutMs);
        });
    };

    NO._renderCommentsPanel = function _renderCommentsPanel(order) {
        const esc = NO.escapeHtml;
        // Bình luận từ order.note (chụp lúc tạo đơn) — MỚI NHẤT Ở TRÊN (note nối tăng
        // dần theo thời gian → reverse). Mỗi item: [time] [Page] message.
        const items = NO._parseNoteComments(order.note).reverse();
        if (items.length === 0) {
            return `<div style="color:#94a3b8;font-style:italic;padding:24px 0;text-align:center;">
                <i data-lucide="message-square-off" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#cbd5e1;"></i>
                Chưa có bình luận nào trong đơn.
            </div>`;
        }
        const cards = items
            .map(
                (c) => `
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                        ${
                            c.page
                                ? `<span style="font-size:11px;font-weight:600;color:#0068ff;background:#e8f2ff;border-radius:999px;padding:2px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;"><i data-lucide="facebook" style="width:10px;height:10px;vertical-align:-1px;"></i> ${esc(c.page)}</span>`
                                : '<span style="font-size:11px;font-weight:600;color:#64748b;">Bình luận</span>'
                        }
                        ${c.time ? `<span style="font-size:11px;color:#94a3b8;flex:none;display:inline-flex;align-items:center;gap:3px;"><i data-lucide="clock" style="width:11px;height:11px;"></i>${esc(c.time)}</span>` : ''}
                    </div>
                    <div style="font-size:13px;color:#1e293b;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${c.message ? esc(c.message) : '<span style="color:#94a3b8;font-style:italic;">(không có nội dung)</span>'}</div>
                </div>`
            )
            .join('');
        // Trả lời: chỉ map được tới fbCommentId của đơn (note không giữ id từng dòng) →
        // 1 ô trả lời chung (reply vào comment đã tạo đơn). Cần fbPageId + fbCommentId.
        const canReply = !!order.fbPageId && !!order.fbCommentId;
        const replyBox = canReply
            ? `<div class="reply-row" style="display:flex;gap:6px;align-items:flex-end;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;">
                    <textarea id="replyCmt-0" rows="1" placeholder="Trả lời bình luận của khách…" style="flex:1;padding:6px 10px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;font-family:inherit;resize:vertical;min-height:28px;max-height:120px;"></textarea>
                    <button class="web2-btn web2-btn-success web2-btn-xs" data-action="reply-comment" data-cid="${esc(order.fbCommentId)}" data-input="replyCmt-0" title="Trả lời công khai">
                        <i data-lucide="reply" style="width:11px;height:11px;"></i>
                    </button>
                    <button class="web2-btn web2-btn-primary web2-btn-xs" data-action="private-reply" data-cid="${esc(order.fbCommentId)}" data-input="replyCmt-0" title="Trả lời riêng (DM khách qua Messenger)">
                        <i data-lucide="send" style="width:11px;height:11px;"></i>
                    </button>
                </div>`
            : order.fbPageId
              ? ''
              : '<div style="background:#fef3c7;color:#92400e;font-size:11px;padding:8px 12px;border-radius:6px;">⚠ Đơn không có fb_page_id → không thể trả lời.</div>';
        return `<div style="display:flex;flex-direction:column;gap:8px;">${cards}${replyBox}</div>`;
    };

    // Chat giờ do Web2CustomerChat sở hữu (tự lo overlay + đóng + teardown). Hàm này
    // chỉ còn xoá state cờ của native-orders; vẫn expose trên public-api để onclick cũ
    // (nếu còn) không lỗi.
    NO._closeInteractions = function _closeInteractions() {
        NO._interactionsState = null;
    };

    // Hook realtime refresh (exposed trên public-api). Sau khi hợp nhất chat, mọi luồng
    // dùng Web2CustomerChat (viaCustomerChat) — realtime do Web2ChatPanel tự lo → no-op.
    NO._refreshInteractionsIfOpen = function _refreshInteractionsIfOpen(_updatedOrder) {
        // Intentionally a no-op: Web2CustomerChat/Web2ChatPanel handle live updates.
    };
})();
