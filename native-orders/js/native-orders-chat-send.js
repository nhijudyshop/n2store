// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — reply-comment handler (extension-first bypass 24h, fallback Web2Chat).
// Inbox/private-message sending now lives in the shared Web2CustomerChat (chat unified
// 2026-06-19); only comment reply remains here (used by the comments panel in the
// Web2CustomerChat info column — see interactions.js _wireCommentReplies).

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    NO._handleReplyComment = async function _handleReplyComment(order, commentId, inputId, mode) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const text = input.value.trim();
        if (!text) {
            NO.notify('Vui lòng nhập nội dung trả lời', 'warning');
            return;
        }
        input.disabled = true;

        // Try extension first (bypasses 24h via FB Business)
        if (NO._hasExtension()) {
            try {
                const extType = mode === 'private' ? 'SEND_PRIVATE_REPLY' : 'SEND_COMMENT';
                const r = await NO._extensionRequest(extType, {
                    pageId: order.fbPageId,
                    postId: order.fbPostId,
                    commentId,
                    message: text,
                    globalUserId: order.fbUserId,
                });
                if (r.ok) {
                    input.value = '';
                    NO.notify(
                        (mode === 'private' ? '📨 Đã gửi DM ' : '💬 Đã trả lời comment ') +
                            'qua N2 Extension',
                        'success'
                    );
                    input.disabled = false;
                    return;
                }
                console.warn('[NativeOrders] Extension reply failed, fallback Pancake:', r.error);
            } catch (e) {
                console.warn('[NativeOrders] Extension bridge error, fallback Pancake:', e.message);
            }
        }

        // Fallback: Web2Chat client → /pages/:id/comments/:id/replies (Public API)
        if (!NO._hasChatClient() || !window.Web2Chat.hasTokensFor(order.fbPageId)) {
            input.disabled = false;
            NO.notify('Chưa có Extension và chưa cấu hình token Pancake cho page này.', 'error');
            return;
        }
        const replyRes = await window.Web2Chat.replyComment(order.fbPageId, commentId, {
            text,
            mode: mode === 'private' ? 'private' : 'public',
        });
        if (replyRes.ok) {
            input.value = '';
            NO.notify(
                mode === 'private'
                    ? 'Đã gửi tin nhắn riêng (Web2Chat)'
                    : 'Đã trả lời bình luận (Web2Chat)',
                'success'
            );
        } else {
            NO.notify('Lỗi: ' + (replyRes.reason || 'unknown'), 'error');
        }
        input.disabled = false;
    };
})();
