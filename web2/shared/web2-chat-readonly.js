// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — modal xem hội thoại FB read-only (reuse Web2Chat).
// =====================================================================
// Web2ChatReadonly — popup CHỈ XEM đoạn hội thoại Facebook của 1 KH.
// Dùng chung Web2Chat client (web2-chat-client.js) để fetch conversation +
// messages, render bubble read-only (không có ô gửi tin). Tách riêng để mọi
// trang Web 2.0 mở chat KH chỉ cần load file này + gọi:
//     Web2ChatReadonly.open({ pageId, psid, name })
// pageId có thể null → tự thử qua các page token có sẵn (Web2Chat all-pages).
// =====================================================================
(function (global) {
    const Web2ChatReadonly = {};
    let _el = null;

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    // Pancake message text đến dạng HTML một phần (<div>...</div>, <br>). Strip
    // tag → plain text, giữ xuống dòng (giống native-orders _msgPlain). Trả
    // PLAIN text; caller phải esc() lại trước khi nhúng vào innerHTML.
    function msgPlain(raw) {
        if (!raw) return '';
        const normalized = String(raw)
            .replace(/\r\n?/g, '\n')
            .replace(/[\u2028\u2029]/g, '\n')
            .replace(/<br\b[^>]*>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
            .replace(/<(p|div|li|h[1-6])(\s[^>]*)?>/gi, '\n');
        const tmp = document.createElement('div');
        tmp.innerHTML = normalized;
        const text = tmp.textContent || tmp.innerText || '';
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    function injectCss() {
        if (document.getElementById('w2cro-css')) return;
        const s = document.createElement('style');
        s.id = 'w2cro-css';
        s.textContent = `
        .w2cro-overlay { position: fixed; inset: 0; z-index: 10050; background: rgba(15,23,42,.5);
            display: flex; align-items: center; justify-content: center; padding: 16px; }
        .w2cro-overlay[hidden] { display: none; }
        .w2cro-modal { background: #f0f2f5; border-radius: 12px; width: min(560px, 96vw);
            height: min(760px, 90vh); display: flex; flex-direction: column; overflow: hidden;
            box-shadow: 0 24px 80px rgba(15,23,42,.32); }
        .w2cro-head { display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; background: #fff; border-bottom: 1px solid #e5e7eb; }
        .w2cro-title { font-weight: 700; font-size: 15px; color: #0f172a; }
        .w2cro-close { border: none; background: transparent; font-size: 24px; line-height: 1;
            color: #6b7280; cursor: pointer; padding: 0 4px; }
        .w2cro-close:hover { color: #b91c1c; }
        .w2cro-body { flex: 1; overflow-y: auto; padding: 14px 14px 4px; display: flex;
            flex-direction: column; gap: 2px; overscroll-behavior: contain; }
        .w2cro-foot { padding: 8px 16px; background: #fff; border-top: 1px solid #e5e7eb;
            text-align: center; }
        .w2cro-readonly-tag { font-size: 11px; color: #6b7280; }
        .w2cro-loading, .w2cro-empty { text-align: center; color: #6b7280; font-size: 13px;
            padding: 32px 12px; }
        .w2cro-row { display: flex; flex-direction: column; margin: 2px 0; max-width: 78%; }
        .w2cro-row.is-in { align-items: flex-start; align-self: flex-start; }
        .w2cro-row.is-out { align-items: flex-end; align-self: flex-end; }
        .w2cro-bubble { padding: 7px 11px; border-radius: 14px; font-size: 13px; line-height: 1.4;
            word-break: break-word; }
        .w2cro-row.is-in .w2cro-bubble { background: #fff; color: #0f172a; border-bottom-left-radius: 4px;
            box-shadow: 0 1px 1px rgba(0,0,0,.06); }
        .w2cro-row.is-out .w2cro-bubble { background: #dcf8c6; color: #0f172a; border-bottom-right-radius: 4px; }
        .w2cro-txt { white-space: pre-wrap; }
        .w2cro-img { max-width: 220px; max-height: 280px; border-radius: 10px; display: block;
            margin-top: 3px; }
        .w2cro-file { display: inline-block; margin-top: 4px; font-size: 12px; color: #1d4ed8; }
        .w2cro-time { font-size: 10px; color: #9ca3af; margin: 1px 4px 4px; }
        `;
        document.head.appendChild(s);
    }

    function ensureEl() {
        if (_el) return _el;
        injectCss();
        const ov = document.createElement('div');
        ov.className = 'w2cro-overlay';
        ov.hidden = true;
        ov.innerHTML = `
            <div class="w2cro-modal" role="dialog" aria-modal="true">
                <header class="w2cro-head">
                    <span class="w2cro-title" id="w2croTitle">Hội thoại</span>
                    <button type="button" class="w2cro-close" data-close aria-label="Đóng">&times;</button>
                </header>
                <div class="w2cro-body" id="w2croBody"></div>
                <div class="w2cro-foot"><span class="w2cro-readonly-tag">🔒 Chỉ xem — gửi tin ở trang Đơn web / Inbox</span></div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            if (e.target === ov || e.target.closest('[data-close]')) close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && _el && !_el.hidden) close();
        });
        _el = ov;
        return ov;
    }

    function close() {
        if (_el) _el.hidden = true;
    }

    function renderBubble(m, pageId) {
        const isOut = (m.from && m.from.id === pageId) || m.from_admin || m.is_admin;
        const txt = msgPlain(m.message || m.text || m.content || '');
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        const media = atts
            .map((a) => {
                const type = (a.type || '').toLowerCase();
                if (['replied_message', 'reaction'].includes(type)) return '';
                const url =
                    a.url ||
                    a.file_url ||
                    a.preview_url ||
                    (a.payload && a.payload.url) ||
                    a.src ||
                    '';
                const isImg =
                    type === 'photo' ||
                    type === 'image' ||
                    type === 'sticker' ||
                    type === 'animated_image_url' ||
                    !!a.sticker_id ||
                    (a.mime_type || '').startsWith('image/');
                if (url && isImg)
                    return `<img class="w2cro-img" src="${esc(url)}" loading="lazy" />`;
                if (url && (type === 'video' || (a.mime_type || '').startsWith('video/')))
                    return `<video class="w2cro-img" src="${esc(url)}" controls></video>`;
                if (type === 'like' || type === 'thumbsup')
                    return `<div style="font-size:30px;">👍</div>`;
                if (url)
                    return `<a class="w2cro-file" href="${esc(url)}" target="_blank" rel="noopener">📎 Tệp đính kèm</a>`;
                return '';
            })
            .filter(Boolean)
            .join('');
        if (m.is_removed) {
            return `<div class="w2cro-row ${isOut ? 'is-out' : 'is-in'}"><div class="w2cro-bubble" style="font-style:italic;opacity:.7;">🗑 Tin đã thu hồi</div></div>`;
        }
        const body = txt ? `<div class="w2cro-txt">${esc(txt)}</div>` : '';
        if (!body && !media) return '';
        const time = m.inserted_at || m.created_time || m.timestamp;
        let t = '';
        if (time) {
            const d = new Date(time);
            if (!isNaN(d))
                t = d.toLocaleString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                });
        }
        return `<div class="w2cro-row ${isOut ? 'is-out' : 'is-in'}"><div class="w2cro-bubble">${body}${media}</div><div class="w2cro-time">${esc(t)}</div></div>`;
    }

    function setBody(html) {
        const b = _el && _el.querySelector('#w2croBody');
        if (b) b.innerHTML = html;
    }

    async function open(opts) {
        opts = opts || {};
        const ov = ensureEl();
        ov.hidden = false;
        const title = ov.querySelector('#w2croTitle');
        title.textContent = opts.name ? `Hội thoại — ${opts.name}` : 'Hội thoại';
        setBody('<div class="w2cro-loading">Đang tải hội thoại…</div>');

        const Web2Chat = global.Web2Chat;
        if (!Web2Chat || !Web2Chat.fetchConversations) {
            setBody('<div class="w2cro-empty">⚠ Web2Chat chưa load trên trang này.</div>');
            return;
        }
        try {
            if (Web2Chat.syncFromRenderDB) await Web2Chat.syncFromRenderDB().catch(() => {});
        } catch (_) {}

        const psid = opts.psid;
        if (!psid) {
            setBody('<div class="w2cro-empty">KH chưa có ID Facebook để mở hội thoại.</div>');
            return;
        }
        // pageId có → dùng thẳng; không có → thử tất cả page token đang đăng nhập.
        let pages = opts.pageId
            ? [opts.pageId]
            : Object.keys(
                  (Web2Chat.getAllPageAccessTokens && Web2Chat.getAllPageAccessTokens()) || {}
              );
        if (!pages.length) {
            setBody(
                '<div class="w2cro-empty">⚠ Chưa đăng nhập Pancake (không có page token). Vào trang Inbox/Đơn web để đăng nhập trước.</div>'
            );
            return;
        }

        let conv = null,
            usedPage = null,
            custUuid = null;
        for (const pg of pages) {
            try {
                const r = await Web2Chat.fetchConversations(pg, psid);
                if (r && r.ok && r.conversations && r.conversations.length) {
                    conv =
                        r.conversations.find((c) => (c.type || '').toUpperCase() === 'INBOX') ||
                        r.conversations[0];
                    usedPage = pg;
                    custUuid = r.customerUuid;
                    break;
                }
            } catch (_) {}
        }
        if (!conv) {
            setBody('<div class="w2cro-empty">Không tìm thấy hội thoại Facebook cho KH này.</div>');
            return;
        }

        let msgs = [];
        try {
            const mr = await Web2Chat.fetchMessages(usedPage, conv.id, custUuid);
            if (mr && mr.ok) msgs = mr.messages || [];
        } catch (_) {}
        if (!msgs.length) {
            setBody('<div class="w2cro-empty">Hội thoại trống.</div>');
            return;
        }
        // Pancake trả mới→cũ; render cũ→mới (đọc tự nhiên, scroll xuống cuối).
        const ordered = msgs.slice().reverse();
        const html = ordered
            .map((m) => renderBubble(m, usedPage))
            .filter(Boolean)
            .join('');
        setBody(html || '<div class="w2cro-empty">Hội thoại trống.</div>');
        const b = _el.querySelector('#w2croBody');
        if (b) b.scrollTop = b.scrollHeight;
    }

    Web2ChatReadonly.open = open;
    Web2ChatReadonly.close = close;
    global.Web2ChatReadonly = Web2ChatReadonly;
})(window);
