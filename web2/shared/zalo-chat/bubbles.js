// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo chat message renderer.
// =====================================================================
// WZChat.renderMessages(messages, conv) → HTML khung tin: gom nhóm theo
// người gửi, vạch ngày (GMT+7), vạch chưa đọc, quote reply, hàng cảm xúc,
// trạng thái thu hồi, lưới ảnh, ticks đã gửi/đã xem, link/file/sticker.
// Tin có nhiều attachments → lưới ảnh. Mọi media có referrerpolicy + esc.
// =====================================================================

(function () {
    'use strict';
    const WZ = (window.WZChat = window.WZChat || {});
    const esc = WZ.esc;

    // @tên (mention) trong nhóm → tô XANH. Zalo KHÔNG gửi metadata mention qua API
    // content → heuristic theo text: '@' + token đầu, các token sau phải VIẾT HOA
    // (tên người, vd "@My Njd") → dừng ở từ thường ("@My ơi" chỉ tô "@My").
    const MENTION_RE = /@([\p{L}\p{N}][\p{L}\p{N}._]*(?:\s\p{Lu}[\p{L}\p{N}._]*)*)/gu;
    function fmtText(s) {
        return esc(String(s == null ? '' : s)).replace(
            MENTION_RE,
            '<span class="wz-mention">@$1</span>'
        );
    }
    WZ.fmtText = fmtText;

    const IMG_URL_RE = /^https?:\/\/\S+\.(?:jpe?g|png|gif|webp|bmp|heic)(?:\?\S*)?$/i;
    const ZDN_IMG_RE = /^https?:\/\/[^\s]*\b(?:zdn\.vn|zadn\.vn|zaloapp\.com)\/[^\s]+$/i;
    const URL_RE = /^https?:\/\/\S+$/i;

    function _msgUrl(m) {
        const a = (Array.isArray(m.attachments) ? m.attachments : [])[0] || {};
        return String(a.href || a.url || a.thumb || m.content || '').trim();
    }
    WZ.bubbleKind = function (m) {
        const type = m.msg_type || 'text';
        const a = (Array.isArray(m.attachments) ? m.attachments : [])[0] || {};
        const hasMedia = !!(a.url || a.thumb || a.href);
        if (type === 'image' || type === 'gif') return hasMedia ? 'image' : _legacy(m);
        if (type === 'sticker') return hasMedia ? 'sticker' : _legacy(m);
        if (type === 'video') return hasMedia ? 'video' : _legacy(m);
        if (type === 'file') return hasMedia ? 'file' : 'text';
        if (type === 'voice') return hasMedia ? 'voice' : 'text';
        if (type === 'contact') return a.uid || a.phone || a.title ? 'contact' : _legacy(m);
        if (type === 'location') return (a.lat && a.lon) || a.href ? 'location' : _legacy(m);
        return _legacy(m);
    };
    function _legacy(m) {
        const t = _msgUrl(m);
        if (t && (IMG_URL_RE.test(t) || ZDN_IMG_RE.test(t))) return 'image';
        if ((m.msg_type === 'link' || (t && URL_RE.test(t))) && !/\s/.test(t)) return 'link';
        return 'text';
    }

    function imgTag(url, full) {
        return `<img src="${esc(url)}" data-full="${esc(full || url)}" alt="Hình ảnh" loading="lazy" referrerpolicy="no-referrer">`;
    }

    // nội dung 1 bong bóng (đã loại recalled)
    function body(m, kind) {
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        const noCapKind = kind === 'link' || kind === 'contact' || kind === 'location';
        const cap =
            m.content && !noCapKind && _msgUrl(m) !== (m.content || '').trim()
                ? `<div class="wz-msg-cap">${fmtText(m.content)}</div>`
                : '';
        const a = atts[0] || {};

        if (kind === 'image') {
            // nhiều ảnh trong 1 tin → lưới album
            const imgs = atts.filter((x) => x.url || x.thumb);
            if (imgs.length > 1) {
                const n = Math.min(imgs.length, 4);
                const cells = imgs
                    .slice(0, 4)
                    .map((x, i) => {
                        const more =
                            i === 3 && imgs.length > 4
                                ? `<span class="wz-grid-more">+${imgs.length - 4}</span>`
                                : '';
                        return `<button class="wz-grid-cell" type="button" data-lb="1">${imgTag(x.thumb || x.url, x.url || x.thumb)}${more}</button>`;
                    })
                    .join('');
                return `<div class="wz-msg-grid wz-grid-${n}">${cells}</div>${cap}`;
            }
            const src = a.thumb || a.url || _msgUrl(m);
            const full = a.url || a.href || _msgUrl(m) || src;
            return `<button class="wz-msg-media" type="button" data-lb="1">${imgTag(src, full)}</button>${cap}`;
        }
        if (kind === 'sticker') {
            return `<img class="wz-msg-sticker" src="${esc(a.url || a.thumb || _msgUrl(m))}" alt="sticker" loading="lazy" referrerpolicy="no-referrer">`;
        }
        if (kind === 'video') {
            // Trình phát inline (thay vì mở tab). poster = thumbnail; tải metadata khi cần.
            return `<video class="wz-msg-video-player" controls preload="metadata"${a.thumb ? ` poster="${esc(a.thumb)}"` : ''} src="${esc(a.url || a.href)}"></video>${cap}`;
        }
        if (kind === 'voice') {
            return `<audio class="wz-msg-voice" controls preload="none" src="${esc(a.url || a.href)}"></audio>${cap}`;
        }
        if (kind === 'file') {
            return `<a class="wz-msg-file" href="${esc(a.url || a.href || '#')}" target="_blank" rel="noopener noreferrer"><i data-lucide="file"></i><span>${esc(a.title || 'Tệp đính kèm')}</span></a>${cap}`;
        }
        if (kind === 'contact') {
            const name = a.title || 'Liên hệ Zalo';
            return `<div class="wz-msg-contact">
                ${WZ.avatarHtml(a.thumb, name, 'wz-mc-av')}
                <div class="wz-mc-info">
                    <span class="wz-mc-name">${esc(name)}</span>
                    ${a.phone ? `<span class="wz-mc-phone">${esc(a.phone)}</span>` : '<span class="wz-mc-sub">Danh thiếp Zalo</span>'}
                </div>
            </div>${cap}`;
        }
        if (kind === 'location') {
            return `<a class="wz-msg-location" href="${esc(a.href || '#')}" target="_blank" rel="noopener noreferrer">
                <span class="wz-ml-ic"><i data-lucide="map-pin"></i></span>
                <span class="wz-ml-addr">${esc(a.title || 'Vị trí')}</span>
            </a>${cap}`;
        }
        if (kind === 'link') {
            const href = a.href || a.url || m.content || '';
            const title = (a.title || '').trim();
            const desc = (a.desc || '').trim();
            const thumb = a.thumb && a.thumb !== href ? a.thumb : '';
            let host = '';
            try {
                host = new URL(href).hostname.replace(/^www\./, '');
            } catch {}
            // Card xem trước khi có metadata (tiêu đề/ảnh/mô tả); thiếu → link gọn như cũ.
            if (title || desc || thumb) {
                return `<a class="wz-msg-linkcard" href="${esc(href)}" target="_blank" rel="noopener noreferrer">
                    ${thumb ? `<span class="wz-lc-thumb"><img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>` : ''}
                    <span class="wz-lc-body">
                        ${title ? `<span class="wz-lc-title">${esc(title)}</span>` : ''}
                        ${desc ? `<span class="wz-lc-desc">${esc(desc.slice(0, 120))}</span>` : ''}
                        <span class="wz-lc-host">${esc(host || href)}</span>
                    </span></a>`;
            }
            return `<a class="wz-msg-linkbox" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(m.content || href)}</a>`;
        }
        return fmtText(m.content || '') || '<span class="wz-msg-muted">[Tin nhắn]</span>';
    }

    function reactionsRow(m) {
        const r = m.reactions || {};
        const chips = Object.entries(r)
            .filter(([, uids]) => uids && uids.length)
            .map(
                ([emoji, uids]) =>
                    `<span class="wz-rchip">${esc(emoji)}${uids.length > 1 ? `<b>${uids.length}</b>` : ''}</span>`
            )
            .join('');
        return chips ? `<div class="wz-msg-reactions">${chips}</div>` : '';
    }

    function replyRow(m) {
        if (!m.reply_to_preview) return '';
        return `<div class="wz-msg-reply"><span class="wz-msg-reply-bar"></span><span class="wz-msg-reply-txt">${esc(m.reply_to_preview.slice(0, 90))}</span></div>`;
    }

    function statusTick(m, isLastOut) {
        if (m.direction !== 'out') return '';
        if (m.send_status === 'sending')
            return '<span class="wz-tick sending" aria-label="Đang gửi">🕓</span>';
        if (m.send_status === 'failed')
            return '<button class="wz-tick failed" data-act="retry" aria-label="Gửi lỗi, thử lại">⚠ Thử lại</button>';
        if (m.seen_at && isLastOut) return '<span class="wz-tick seen">Đã xem</span>';
        if (m.seen_at) return '<span class="wz-tick seen" aria-label="Đã xem">✓✓</span>';
        return '<span class="wz-tick sent" aria-label="Đã gửi">✓</span>';
    }

    function tools(m) {
        // hover toolbar: reply / react / recall (đã bỏ "Chuyển tiếp" theo yêu cầu shop —
        // tránh forward nhầm tin sang nhóm khác; ít dùng trong luồng xử lý đơn).
        const id = esc(m.msg_id || m.cli_msg_id || '');
        if (!id) return '';
        return `<div class="wz-msg-tools" role="group" aria-label="Hành động tin nhắn">
            <button class="wz-msg-tool" data-act="reply" title="Trả lời" aria-label="Trả lời"><i data-lucide="reply"></i></button>
            <button class="wz-msg-tool" data-wz-react-btn data-act="react" title="Thả cảm xúc" aria-label="Thả cảm xúc"><i data-lucide="smile"></i></button>
            ${m.direction === 'out' && !m.recalled ? `<button class="wz-msg-tool" data-act="recall" title="Thu hồi" aria-label="Thu hồi"><i data-lucide="rotate-ccw"></i></button>` : ''}
            <button class="wz-msg-tool" data-act="delete-me" title="Xoá ở phía tôi" aria-label="Xoá ở phía tôi"><i data-lucide="trash-2"></i></button>
        </div>`;
    }

    // ── render full ────────────────────────────────────────────────────
    WZ.renderMessages = function (messages, conv) {
        const msgs = Array.isArray(messages) ? messages : [];
        if (!msgs.length) return '<div class="wz-chat-empty">Chưa có tin nhắn</div>';
        const isGroup = conv?.thread_type === 'group';
        const unreadId = conv?._unreadDividerMsgId || null;
        let lastOutId = null;
        for (let i = msgs.length - 1; i >= 0; i--)
            if (msgs[i].direction === 'out') {
                lastOutId = msgs[i].msg_id || msgs[i].cli_msg_id;
                break;
            }

        let html = '';
        let prevDay = '';
        let prevKey = ''; // direction+sender (gom nhóm)
        msgs.forEach((m, i) => {
            const day = WZ.dayKey(m.sent_at);
            if (day !== prevDay) {
                html += `<div class="wz-date-divider"><span>${esc(WZ.dayLabel(m.sent_at))}</span></div>`;
                prevDay = day;
                prevKey = '';
            }
            if (unreadId && (m.msg_id === unreadId || m.cli_msg_id === unreadId)) {
                html += `<div class="wz-unread-divider"><span>Tin chưa đọc</span></div>`;
            }
            // Tin hệ thống nhóm (vào/rời/đổi tên…) → dòng giữa khung, không phải bong bóng.
            if (m.msg_type === 'system') {
                html += `<div class="wz-sys-msg"><span>${fmtText(m.content || '')}</span></div>`;
                prevKey = '';
                return;
            }
            const groupKey = m.direction + '|' + (m.sender_uid || '');
            const grouped = groupKey === prevKey;
            prevKey = groupKey;

            const kind = m.recalled ? 'recalled' : WZ.bubbleKind(m);
            const media = !['text', 'link', 'recalled', 'contact', 'location'].includes(kind);
            const id = esc(m.msg_id || m.cli_msg_id || '');
            const cls = [
                'wz-msg',
                m.direction === 'out' ? 'out' : 'in',
                grouped ? 'grouped' : '',
                media ? 'has-media' : '',
                kind === 'sticker' ? 'is-sticker' : '',
                m.recalled ? 'is-recalled' : '',
                m.send_status === 'failed' ? 'is-failed' : '',
            ]
                .filter(Boolean)
                .join(' ');

            // Nhóm + tin đến: hiện avatar (cột trái) + tên thật người gửi (đầu nhóm).
            const showSender = isGroup && m.direction === 'in';
            const senderName = m.sender_name || m.sender_uid || '';
            const nameLbl =
                showSender && !grouped ? `<div class="wz-msg-sender">${esc(senderName)}</div>` : '';

            const inner = m.recalled
                ? '<span class="wz-msg-recalled"><i data-lucide="rotate-ccw"></i> Tin nhắn đã được thu hồi</span>'
                : replyRow(m) + body(m, kind);

            const wrapHtml = `<div class="wz-msg-wrap">${m.recalled ? '' : tools(m)}<div class="wz-msg-bubble">${inner}</div></div>`;
            // avatar người gửi chỉ ở tin CUỐI của 1 lượt (Zalo style) — dùng next msg
            const next = msgs[i + 1];
            const lastOfRun =
                !next ||
                next.direction !== m.direction ||
                (next.sender_uid || '') !== (m.sender_uid || '');
            const rowHtml = showSender
                ? `<div class="wz-msg-row">
                    <div class="wz-g-av">${lastOfRun ? WZ.avatarHtml(m.sender_avatar, senderName, 'wz-g-avatar') : ''}</div>
                    ${wrapHtml}
                   </div>`
                : wrapHtml;

            const isLastOut = (m.msg_id || m.cli_msg_id) === lastOutId;
            html += `<div class="${cls}${showSender ? ' has-sender' : ''}" data-msgid="${id}" data-cli="${esc(m.cli_msg_id || '')}" data-dir="${m.direction}" data-mtype="${esc(m.msg_type || 'text')}">
                ${nameLbl}
                ${rowHtml}
                ${m.recalled ? '' : reactionsRow(m)}
                <div class="wz-msg-meta">${WZ.fmtTime(m.sent_at)} ${statusTick(m, isLastOut)}</div>
            </div>`;
        });
        return html;
    };
})();
