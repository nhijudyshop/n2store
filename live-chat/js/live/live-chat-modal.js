// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// LiveChatModal — mở ĐOẠN HỘI THOẠI chat với khách từ 1 comment row
// (2026-06-11: panel Pancake đã tách sang trang riêng chat.html — trang
// live-chat giờ chỉ còn cột comment; nút 💬 trên row mở modal này).
//
// Full chức năng như đoạn hội thoại native-orders: dùng CHUNG component
// Web2ChatPanel (web2/shared/chat-panel) + adapter của PancakeChatWindow
// (extension-first bypass 24h, sticker, upload ảnh/tệp, quick reply,
// "Thêm vào KH", mark read).
//
// Resolve hội thoại: Web2Chat.fetchConversations(pageId, fbUserId) →
// ưu tiên INBOX, fallback conversation đầu tiên.
// Realtime: subscribe SSE web2:messages → refresh thread đang mở (debounce).
// =====================================================================
(function () {
    'use strict';
    if (window.LiveChatModal) return;

    const STATE = {
        overlay: null,
        panel: null, // Web2ChatPanel instance
        conv: null,
        adapter: null,
        open: false,
        refreshTimer: null,
    };

    function _esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function _ensureOverlay() {
        if (STATE.overlay) return STATE.overlay;
        const ov = document.createElement('div');
        ov.id = 'liveChatModalOverlay';
        ov.style.cssText =
            'position:fixed;inset:0;z-index:9998;background:rgba(15,23,42,0.55);display:none;align-items:center;justify-content:center;padding:16px;';
        ov.innerHTML = `
            <div id="liveChatModalBox" style="background:#fff;border-radius:14px;width:min(760px,96vw);height:min(86vh,820px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.35);">
                <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #e5e7eb;flex-shrink:0;">
                    <img id="liveChatModalAvatar" src="" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;background:#f1f5f9;display:none;" />
                    <div style="min-width:0;flex:1;">
                        <div id="liveChatModalName" style="font-weight:700;font-size:14px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
                        <div id="liveChatModalSub" style="font-size:11px;color:#64748b;"></div>
                    </div>
                    <button id="liveChatModalClose" style="width:32px;height:32px;border:none;background:#f1f5f9;border-radius:8px;cursor:pointer;font-size:16px;color:#475569;flex-shrink:0;">✕</button>
                </div>
                <div id="liveChatModalHost" style="flex:1;min-height:0;display:flex;flex-direction:column;background:#ebebeb;"></div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            if (e.target === ov) close();
        });
        ov.querySelector('#liveChatModalClose').addEventListener('click', close);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && STATE.open) close();
        });
        STATE.overlay = ov;
        return ov;
    }

    function _setHeader({ name, sub, avatar }) {
        const n = document.getElementById('liveChatModalName');
        const s = document.getElementById('liveChatModalSub');
        const a = document.getElementById('liveChatModalAvatar');
        if (n) n.textContent = name || '';
        if (s) s.textContent = sub || '';
        if (a) {
            if (avatar) {
                a.src = avatar;
                a.style.display = 'block';
            } else {
                a.style.display = 'none';
            }
        }
    }

    function _hostMsg(html) {
        const host = document.getElementById('liveChatModalHost');
        if (host)
            host.innerHTML = `<div style="padding:48px 24px;text-align:center;color:#64748b;font-size:13px;line-height:1.6;">${html}</div>`;
    }

    /**
     * Mở modal chat với 1 KH từ comment.
     * @param {{fbUserId:string, name?:string, pageId:string, avatar?:string}} p
     */
    async function open(p) {
        if (!p?.fbUserId || !p?.pageId) {
            window.notificationManager?.show?.('Thiếu fbUserId/pageId để mở chat', 'error');
            return;
        }
        const ov = _ensureOverlay();
        ov.style.display = 'flex';
        STATE.open = true;
        const pageName =
            (window.LiveState?.allPages || []).find(
                (pg) => String(pg.Facebook_PageId) === String(p.pageId)
            )?.Name || '';
        _setHeader({ name: p.name || 'Khách', sub: pageName, avatar: p.avatar });
        _hostMsg('⏳ Đang tìm hội thoại…');

        if (!window.Web2Chat?.fetchConversations) {
            _hostMsg('⚠ Web2Chat chưa sẵn sàng (web2-chat-client.js chưa load).');
            return;
        }
        let conv = null;
        try {
            const r = await window.Web2Chat.fetchConversations(p.pageId, p.fbUserId);
            const convs = (r?.conversations || []).filter(Boolean);
            conv =
                convs.find((c) => String(c.type || '').toUpperCase() === 'INBOX') ||
                convs[0] ||
                null;
        } catch (e) {
            console.warn('[LiveChatModal] fetchConversations fail:', e.message);
        }
        if (!STATE.open) return; // user đóng trong lúc fetch
        if (!conv) {
            _hostMsg(
                `KH <strong>${_esc(p.name || p.fbUserId)}</strong> chưa có hội thoại với page này.<br>` +
                    `Khách cần nhắn tin cho page trước, hoặc trả lời comment của khách để mở hội thoại.`
            );
            return;
        }
        conv.page_id = conv.page_id || p.pageId;
        if (!conv.from) conv.from = { id: p.fbUserId, name: p.name || '' };

        const host = document.getElementById('liveChatModalHost');
        if (!window.Web2ChatPanel || !window.PancakeChatWindow) {
            _hostMsg('⚠ Web2ChatPanel/PancakeChatWindow chưa load.');
            return;
        }
        host.innerHTML = '';
        try {
            STATE.panel?.destroy?.();
        } catch (_) {}
        if (window.PancakeState) window.PancakeState.activeConversation = conv;
        STATE.conv = conv;
        STATE.adapter = window.PancakeChatWindow._buildAdapter(conv);
        STATE.panel = window.Web2ChatPanel.mount(host, { mode: 'full', hideHeader: true });
        STATE.panel.open(conv, STATE.adapter);
    }

    function close() {
        STATE.open = false;
        if (STATE.overlay) STATE.overlay.style.display = 'none';
        try {
            STATE.panel?.destroy?.();
        } catch (_) {}
        STATE.panel = null;
        STATE.conv = null;
        STATE.adapter = null;
    }

    // Realtime: relay đẩy SSE web2:messages khi có tin nhắn mới → refresh
    // thread đang mở (debounce gom burst). Chỉ chạy khi modal đang mở.
    function _wireSse() {
        if (!window.Web2SSE?.subscribe) return;
        window.Web2SSE.subscribe('web2:messages', () => {
            if (!STATE.open || !STATE.panel || !STATE.adapter) return;
            clearTimeout(STATE.refreshTimer);
            STATE.refreshTimer = setTimeout(async () => {
                try {
                    const r = await STATE.adapter.loadMessages();
                    if (STATE.open && STATE.panel && r?.messages) {
                        STATE.panel.setMessages(r.messages);
                    }
                } catch (_) {}
            }, 800);
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _wireSse);
    } else {
        _wireSse();
    }

    window.LiveChatModal = { open, close };
})();
