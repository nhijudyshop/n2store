// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo chat realtime (SSE patch).
// =====================================================================
// WZChat.subscribeRealtime(convId, threadId, handlers) → unsub.
// Nghe SSE web2:zalo:thread:<threadId> + web2:zalo:conv:<convId>:
//   message/reaction/recall/seen → handlers.refetch() (debounce 450ms)
//   typing → handlers.onTyping() (hiện chấm gõ, tự ẩn sau 4s)
// =====================================================================

(function () {
    'use strict';
    const WZ = (window.WZChat = window.WZChat || {});

    WZ.subscribeRealtime = function (convId, threadId, handlers) {
        const subs = [];
        if (!window.Web2SSE?.subscribe) return () => {};

        let t = null;
        const refetch = () => {
            clearTimeout(t);
            t = setTimeout(() => handlers.refetch?.(), 450);
        };
        let typingTimer = null;
        const onTyping = () => {
            handlers.onTyping?.(true);
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => handlers.onTyping?.(false), 4000);
        };

        const handle = (evt) => {
            const action = evt?.data?.action || evt?.action || evt?.eventType;
            if (action === 'typing') return onTyping();
            // message / reaction / recall / seen → đồng bộ lại nhẹ
            refetch();
        };

        if (threadId) {
            try {
                subs.push(window.Web2SSE.subscribe(`web2:zalo:thread:${threadId}`, handle));
            } catch {}
        }
        if (convId) {
            try {
                subs.push(window.Web2SSE.subscribe(`web2:zalo:conv:${convId}`, () => refetch()));
            } catch {}
        }

        return function unsub() {
            clearTimeout(t);
            clearTimeout(typingTimer);
            subs.forEach((u) => {
                try {
                    typeof u === 'function' && u();
                } catch {}
            });
        };
    };
})();
