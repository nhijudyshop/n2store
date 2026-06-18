// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — component chat HỢP NHẤT (Web2ChatPanel) dùng chung native-orders/web2-pancake/balance-history.
// =====================================================================
// Web2ChatPanel — 1 component chat duy nhất cho mọi trang Web 2.0. Tách UI khỏi
// transport bằng ADAPTER: mỗi trang inject { loadMessages, loadOlder, send,... }.
// 3 chế độ: 'full' (gửi tin), 'readonly' (chỉ xem), 'picker' (chọn KH).
//
//   const inst = Web2ChatPanel.mount(containerEl, { mode, flags... });
//   inst.open(conversation, adapter);   // render + load thread
//   inst.pushMessage(msg) / inst.setMessages(arr);  // realtime
//   inst.destroy();
//
// Adapter (mọi field optional trừ loadMessages + send ở mode full):
//   loadMessages() -> { messages:[], hasMore? }
//   loadOlder(cursor) -> { messages:[], hasMore? }
//   send({ text, attachment, action, replyToId }) -> { via, sent }
//   markRead(), quickReplies()->[{label,template,color}], pageName, hasExtension
//   onConversationUpdate(conv), onPick({phone,name})
// Feature 1/2/3 (paste/sticker/react-send/entity-detect) gắn sau qua flags.
// =====================================================================
// FACADE/ENTRY (REWRITE) — lắp ráp render + compose qua namespace
// `window.__Web2ChatPanelNS`; module-private state dùng chung qua `ctx`.
// Tách từ file 1049-dòng thành state/render/compose (MOVE-only, KHÔNG đổi hành vi).
// Load order BẮT BUỘC: state → render → compose → panel(entry, file này) LAST.
// =====================================================================
(function (global) {
    const NS = global.__Web2ChatPanelNS;
    if (!NS || !NS.utils || !NS.buildRender || !NS.buildCompose) {
        throw new Error(
            'Web2ChatPanel: thiếu module phụ thuộc — load web2-chat-panel-state.js → -render.js → -compose.js TRƯỚC web2-chat-panel.js'
        );
    }

    // ============================== Instance ==============================
    function createInstance(container, opts) {
        const mode = opts.mode || 'full';
        const flags = NS.createFlags(opts);
        const st = NS.createState();

        // ---------- helpers ----------
        const $ = (sel) => container.querySelector(sel);
        const pageIdOf = (c) => (c && (c.page_id || c.pageId)) || '';
        const isOutgoing = (m) => {
            const pid = pageIdOf(st.conv);
            return (
                (m.from && String(m.from.id) === String(pid)) ||
                m.from_admin ||
                m.is_admin ||
                m._temp
            );
        };
        const custOf = (c) => (c && ((c.customers && c.customers[0]) || c.from)) || {};
        const nameOf = (c) => {
            const cu = custOf(c);
            return cu.name || cu.display_name || (c && c.name) || 'Khách';
        };
        const psidOf = (c) => {
            const cu = custOf(c);
            return cu.fb_id || cu.id || (c && c.from && c.from.id) || (c && c.psid) || '';
        };

        // Shared closure: render + compose cùng tham chiếu ctx (module-private state 1 nơi).
        const ctx = { container, mode, flags, st, $, pageIdOf, isOutgoing, custOf, nameOf, psidOf };

        const render = NS.buildRender(ctx);
        const compose = NS.buildCompose(ctx);
        Object.assign(ctx, render, compose);

        const { renderShell, loadThread, updateScrollUi, renderAll, scrollToBottom } = render;
        const { onOutsideClick } = compose;

        // ---------- public ----------
        const inst = {
            open(conversation, adapter) {
                st.conv = conversation || {};
                st.adapter = adapter || {};
                st.messages = [];
                st.replyTo = null;
                st.attachment = null;
                st.hasMore = true;
                renderShell();
                loadThread();
                return inst;
            },
            pushMessage(m) {
                if (!m) return;
                if (m.id && st.messages.some((x) => x.id === m.id)) return;
                st.messages.push(m);
                if (!st.isAtBottom) {
                    st.newCount++;
                    updateScrollUi();
                }
                renderAll();
            },
            setMessages(arr) {
                st.messages = (arr || []).slice();
                renderAll();
            },
            scrollToBottom,
            reload: loadThread,
            getState() {
                return st;
            },
            destroy() {
                document.removeEventListener('click', onOutsideClick);
                container.innerHTML = '';
                container.classList.remove('w2cp-root', 'is-readonly');
            },
        };
        return inst;
    }

    const Web2ChatPanel = {
        mount(container, opts) {
            if (!container) throw new Error('Web2ChatPanel.mount: container required');
            return createInstance(container, opts || {});
        },
    };
    global.Web2ChatPanel = Web2ChatPanel;
})(window);
