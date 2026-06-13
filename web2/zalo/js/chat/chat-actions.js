// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo chat actions (network + optimistic).
// =====================================================================
// WZChat.actions — lớp gọi backend cho react/recall/forward/typing/seen.
// UI orchestration (mở thanh cảm xúc, confirm, picker) do app gọi kèm
// WZChat.openReactionBar / WZChat.openMenu. Throttle typing & seen.
// =====================================================================

(function () {
    'use strict';
    const WZ = (window.WZChat = window.WZChat || {});

    const _throttle = {};
    function throttled(key, ms, fn) {
        const t = Date.now();
        if (_throttle[key] && t - _throttle[key] < ms) return;
        _throttle[key] = t;
        fn();
    }

    WZ.actions = {
        // Thả cảm xúc (add-only). Trả promise; app đã patch optimistic trước.
        react(account, conv, msg, iconKey) {
            return window.ZaloApi.react({
                accountKey: account,
                threadId: conv.thread_id,
                msgId: String(msg.msg_id || ''),
                cliMsgId: String(msg.cli_msg_id || ''),
                icon: iconKey,
                threadType: conv.thread_type,
            });
        },

        // Thu hồi tin (UI-first nếu có Web2Optimistic; app cung cấp apply/rollback).
        recall(account, conv, msg) {
            return window.ZaloApi.recall({
                accountKey: account,
                threadId: conv.thread_id,
                msgId: String(msg.msg_id || ''),
                cliMsgId: String(msg.cli_msg_id || ''),
                threadType: conv.thread_type,
            });
        },

        // Chuyển tiếp text/URL tới nhiều thread.
        forward(account, conv, msg, threadIds) {
            const message =
                msg.content ||
                (Array.isArray(msg.attachments) && msg.attachments[0]
                    ? msg.attachments[0].url || msg.attachments[0].href
                    : '') ||
                '';
            if (!message) {
                WZ.notify('Không thể chuyển tiếp tin này', 'warning');
                return Promise.resolve();
            }
            return window.ZaloApi.forward({
                accountKey: account,
                message,
                threadIds,
                threadType: conv.thread_type,
            });
        },

        // Báo đã xem (throttle 3s / conv, fire-and-forget).
        markSeen(account, conv) {
            if (!conv?.id) return;
            throttled('seen:' + conv.id, 3000, () => {
                window.ZaloApi.seen({
                    accountKey: account,
                    convId: conv.id,
                    threadId: conv.thread_id,
                    threadType: conv.thread_type,
                }).catch(() => {});
            });
        },

        // Báo đang gõ (throttle 2s, fire-and-forget).
        emitTyping(account, conv) {
            if (!conv?.thread_id) return;
            throttled('typing:' + conv.thread_id, 2000, () => {
                window.ZaloApi.typing({
                    accountKey: account,
                    threadId: conv.thread_id,
                    threadType: conv.thread_type,
                }).catch(() => {});
            });
        },
    };
})();
