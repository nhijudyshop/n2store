// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — message plain/time helpers + attachment/bubble renderers. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    NO._msgPlain = function _msgPlain(raw) {
        if (!raw) return '';
        // Pancake/FB messages arrive as either plain text or partial HTML.
        // We need to preserve visual line breaks coming from any of:
        //   - real \n / \r\n / \r / U+2028 / U+2029 line separators
        //   - <br> tags
        //   - block-level boundaries (</p>, </div>, </li>, </h*>) — closing
        //     tag carries the break; opening tag of a non-first sibling also
        //     starts a new line.
        const normalized = String(raw)
            .replace(/\r\n?/g, '\n')
            .replace(/[\u2028\u2029]/g, '\n')
            // Pancake often emits `<br key='n_0' />`, `<br key="..." />`, etc.
            // — match any attributes after `<br`.
            .replace(/<br\b[^>]*>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
            .replace(/<(p|div|li|h[1-6])(\s[^>]*)?>/gi, '\n');
        const tmp = document.createElement('div');
        tmp.innerHTML = normalized;
        const text = tmp.textContent || tmp.innerText || '';
        // Collapse runs of 3+ blank lines to a single blank line; trim ends.
        return text.replace(/\n{3,}/g, '\n\n').trim();
    };

    NO._msgTimestamp = function _msgTimestamp(m) {
        const t = m.inserted_at || m.created_time || m.timestamp;
        if (!t) return 0;
        const d = new Date(t);
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };

    NO._dateLabel = function _dateLabel(ts) {
        if (!ts) return '';
        let parseInput = ts;
        if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ts)) {
            if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)) parseInput = ts + 'Z';
        }
        const d = new Date(parseInput);
        // Compare in GMT+7 explicitly so the day-boundary doesn't drift
        // when the user's machine sits in another TZ.
        const vnFmt = (date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        const todayKey = vnFmt(new Date());
        const yestKey = vnFmt(new Date(Date.now() - 86_400_000));
        const dKey = vnFmt(d);
        if (dKey === todayKey) return 'HÔM NAY';
        if (dKey === yestKey) return 'HÔM QUA';
        return d.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Asia/Ho_Chi_Minh',
        });
    };

    NO._NON_CORS_MEDIA =
        /(?:scontent|video)[\w.-]*\.fbcdn\.net|content\.pancake\.vn|firebasestorage\.googleapis\.com/i;

    NO._workerProxy = function _workerProxy(url) {
        const base =
            window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        return NO._NON_CORS_MEDIA.test(url)
            ? `${base}/api/image-proxy?url=${encodeURIComponent(url)}`
            : url;
    };

    NO._renderQuotedReply = function _renderQuotedReply(att) {
        const fromName = att.from?.name || att.from?.admin_name || 'Tin nhắn';
        const text = NO._msgPlain(att.message || '');
        let preview = '';
        const qAtt = att.attachments?.[0];
        if (qAtt) {
            const qUrl = qAtt.url || qAtt.file_url || qAtt.preview_url || '';
            const qType = (qAtt.type || '').toLowerCase();
            if (qType === 'photo' || qType === 'image' || qAtt.mime_type?.startsWith('image/')) {
                preview = `<img src="${NO.escapeHtml(qUrl)}" style="max-width:48px;max-height:48px;border-radius:4px;object-fit:cover;margin-top:3px;display:block;" loading="lazy" />`;
            } else if (qType === 'video') {
                preview = `<span style="font-size:10px;opacity:0.7;">🎬 Video</span>`;
            } else if (qType === 'audio') {
                preview = `<span style="font-size:10px;opacity:0.7;">🎙 Audio</span>`;
            }
        }
        const body = text
            ? `<div style="font-size:11px;opacity:0.85;line-height:1.35;max-height:32px;overflow:hidden;white-space:pre-wrap;">${NO.escapeHtml(text.slice(0, 120))}</div>`
            : preview ||
              `<span style="font-size:10px;opacity:0.6;font-style:italic;">[Tin nhắn]</span>`;
        return `<div class="w2-chat-quoted">
            <div class="w2-chat-quoted-from">↩ ${NO.escapeHtml(fromName)}</div>
            ${body}
        </div>`;
    };

    NO._renderImage = function _renderImage(att, url) {
        const safe = NO.escapeHtml(NO._workerProxy(url));
        return `<a href="${NO.escapeHtml(url)}" target="_blank" rel="noopener" style="display:block;margin-top:4px;"><img src="${safe}" style="max-width:240px;max-height:300px;border-radius:8px;display:block;object-fit:cover;cursor:zoom-in;" loading="lazy" /></a>`;
    };

    NO._renderSticker = function _renderSticker(att, url) {
        const safe = NO.escapeHtml(NO._workerProxy(url));
        return `<img src="${safe}" alt="Sticker" style="width:120px;height:120px;margin-top:2px;display:block;" loading="lazy" onerror="this.outerHTML='<span style=&quot;font-size:42px;display:inline-block;padding:6px;&quot;>🎨</span>'" />`;
    };

    NO._renderVideo = function _renderVideo(att) {
        // Pancake: { type:'video', url:<thumbnail>, video_data:{ url:<real .mp4> } }
        const videoUrl = att.video_data?.url || att.video_url || '';
        const poster = att.thumbnail_url || att.preview_url || att.url || '';
        if (!videoUrl) return '';
        const play = NO.escapeHtml(NO._workerProxy(videoUrl));
        const orig = NO.escapeHtml(videoUrl);
        const posterAttr = poster ? ` poster="${NO.escapeHtml(NO._workerProxy(poster))}"` : '';
        const mime = att.mime_type || 'video/mp4';
        return `<video controls playsinline preload="metadata"${posterAttr} style="max-width:280px;max-height:360px;border-radius:8px;display:block;background:#000;margin-top:4px;">
            <source src="${play}" type="${mime}">
            <source src="${orig}" type="${mime}">
        </video>`;
    };

    NO._renderAudio = function _renderAudio(att, url) {
        const safe = NO.escapeHtml(NO._workerProxy(url));
        return `<audio controls preload="metadata" style="margin-top:4px;max-width:260px;display:block;height:34px;"><source src="${safe}" type="${NO.escapeHtml(att.mime_type || 'audio/mpeg')}"></audio>`;
    };

    NO._renderFile = function _renderFile(att, url) {
        const name = att.name || att.filename || 'Tệp đính kèm';
        return `<a href="${NO.escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:4px;padding:6px 10px;background:rgba(0,0,0,0.05);border-radius:6px;font-size:11px;color:inherit;text-decoration:none;">📄 ${NO.escapeHtml(name)}</a>`;
    };

    NO._renderAddress = function _renderAddress(att) {
        const full = att.full_address || att.address || '';
        if (!full) return '';
        return `<div style="background:rgba(0,0,0,0.06);padding:6px 10px;border-radius:8px;margin-top:4px;font-size:12px;display:flex;align-items:flex-start;gap:6px;">
            <span>📍</span>
            <span style="flex:1;line-height:1.42;">${NO.escapeHtml(full)}</span>
        </div>`;
    };

    NO._renderAdClick = function _renderAdClick(att) {
        const post = att.post_attachments?.[0];
        const thumb = post?.url || '';
        const desc = post?.description || '';
        const adUrl = att.url || '';
        return `<a href="${NO.escapeHtml(adUrl)}" target="_blank" rel="noopener" style="display:block;margin-top:4px;text-decoration:none;color:inherit;background:rgba(0,0,0,0.05);border-radius:8px;padding:6px;max-width:240px;">
            <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:#0068ff;margin-bottom:4px;">
                <span>📣 Click từ Quảng cáo</span>
            </div>
            ${thumb ? `<img src="${NO.escapeHtml(NO._workerProxy(thumb))}" style="width:100%;max-height:140px;border-radius:6px;display:block;object-fit:cover;" loading="lazy" />` : ''}
            ${desc ? `<div style="font-size:11px;margin-top:4px;color:#475569;line-height:1.35;">${NO.escapeHtml(desc.slice(0, 100))}${desc.length > 100 ? '…' : ''}</div>` : ''}
        </a>`;
    };

    NO._renderLinkPreview = function _renderLinkPreview(att) {
        // Pancake link attachment shape: { url: <FB post permalink>,
        // name, post_attachments: [{ url: <real CDN image>, type, image_data }] }.
        // `att.url` (https://facebook.com/{pageId}_{postId}) is the POST link,
        // NOT the image — using it as <img src> renders broken. The real
        // image lives in post_attachments[0].url on content.pancake.vn.
        const post = att.post_attachments?.[0];
        const thumb = post?.url || '';
        const href = att.url || post?.url || '';
        const title = att.name || post?.title || post?.description || 'Bài viết';
        const inner = `${thumb ? `<img src="${NO.escapeHtml(NO._workerProxy(thumb))}" style="width:100%;max-height:160px;border-radius:6px;display:block;object-fit:cover;" loading="lazy" />` : ''}
            <div style="font-size:12px;margin-top:4px;font-weight:600;line-height:1.35;color:#1d2939;">${NO.escapeHtml(title.slice(0, 80))}${title.length > 80 ? '…' : ''}</div>`;
        return href
            ? `<a href="${NO.escapeHtml(href)}" target="_blank" rel="noopener" style="display:block;margin-top:4px;background:rgba(0,0,0,0.05);border-radius:8px;padding:6px;max-width:240px;text-decoration:none;color:inherit;">${inner}</a>`
            : `<div style="margin-top:4px;background:rgba(0,0,0,0.05);border-radius:8px;padding:6px;max-width:240px;">${inner}</div>`;
    };

    NO._renderTemplate = function _renderTemplate() {
        return `<div style="background:rgba(0,0,0,0.06);padding:5px 10px;border-radius:8px;margin-top:4px;font-size:11px;display:inline-flex;align-items:center;gap:5px;">
            <span>📋</span><span>Tin nhắn dạng template</span>
        </div>`;
    };

    NO._renderAudioCall = function _renderAudioCall(att) {
        const dur = Number(att.duration) || 0;
        const min = Math.floor(dur / 60);
        const sec = dur % 60;
        const durStr = min > 0 ? `${min}p ${sec}s` : `${sec}s`;
        return `<div style="background:rgba(0,0,0,0.06);padding:6px 10px;border-radius:8px;margin-top:4px;font-size:12px;display:inline-flex;align-items:center;gap:6px;">
            <span>📞</span>
            <span>Cuộc gọi audio${dur > 0 ? ' · ' + durStr : ''}</span>
        </div>`;
    };

    NO._renderSystemMessage = function _renderSystemMessage(att) {
        const msg = att.message || '';
        return `<div style="font-size:11px;color:#94a3b8;font-style:italic;text-align:center;padding:4px 0;">— ${NO.escapeHtml(msg)} —</div>`;
    };

    NO._renderAttachment = function _renderAttachment(att) {
        const type = (att.type || '').toLowerCase();
        const url = att.url || att.file_url || att.preview_url || att.payload?.url || att.src || '';
        if (type === 'replied_message') return NO._renderQuotedReply(att);
        if (type === 'reaction') return ''; // handled separately
        if (type === 'like' || type === 'thumbsup')
            return `<div style="font-size:32px;margin-top:2px;">👍</div>`;
        if (type === 'address') return NO._renderAddress(att);
        if (type === 'ad_click') return NO._renderAdClick(att);
        if (type === 'link') return NO._renderLinkPreview(att);
        if (type === 'template') return NO._renderTemplate();
        if (type === 'fb_audio_call') return NO._renderAudioCall(att);
        if (type === 'system_message') return NO._renderSystemMessage(att);
        if (!url) return '';
        if (type === 'sticker' || att.sticker_id || type === 'animated_image_url')
            return NO._renderSticker(att, url);
        if (type === 'photo' || type === 'image' || att.mime_type?.startsWith('image/'))
            return NO._renderImage(att, url);
        if (type === 'video' || att.mime_type?.startsWith('video/')) return NO._renderVideo(att);
        if (type === 'audio' || att.mime_type?.startsWith('audio/'))
            return NO._renderAudio(att, url);
        if (type === 'file' || type === 'document') return NO._renderFile(att, url);
        return '';
    };

    NO.REACTION_EMOJIS = {
        LIKE: '👍',
        LOVE: '❤️',
        HAHA: '😆',
        WOW: '😮',
        SAD: '😢',
        ANGRY: '😠',
        CARE: '🤗',
    };

    NO._renderReactions = function _renderReactions(m) {
        // Pancake puts reactions either as a top-level `reactions[]` array
        // or as attachments[type=reaction], or as a reaction_summary object.
        const list = [];
        if (Array.isArray(m.reactions)) {
            for (const r of m.reactions) {
                const e = r.emoji || r.reaction || NO.REACTION_EMOJIS[r.type] || '❤️';
                list.push(e);
            }
        }
        if (Array.isArray(m.attachments)) {
            for (const a of m.attachments) {
                if ((a.type || '').toLowerCase() === 'reaction') {
                    list.push(a.emoji || a.reaction || '❤️');
                }
            }
        }
        const summary =
            m.reaction_summary ||
            (typeof m.reactions === 'object' && !Array.isArray(m.reactions) ? m.reactions : null);
        let summaryHtml = '';
        if (summary && typeof summary === 'object') {
            const parts = Object.entries(summary)
                .filter(([, c]) => Number(c) > 0)
                .map(
                    ([type, c]) =>
                        `<span style="font-size:11px;">${NO.REACTION_EMOJIS[type] || '👍'}${Number(c) > 1 ? ' ' + c : ''}</span>`
                );
            if (parts.length) summaryHtml = parts.join('');
        }
        if (!list.length && !summaryHtml) return '';
        const emojis = list.slice(0, 5).join('');
        return `<div class="w2-chat-reactions">${emojis}${summaryHtml}</div>`;
    };

    NO._avatarUrl = function _avatarUrl(fbId, pageId) {
        if (!fbId || !pageId) return '';
        const base =
            window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const jwt = window.Web2Chat?.getJwt() || '';
        const params = new URLSearchParams({ id: fbId, page: pageId });
        if (jwt) params.set('token', jwt);
        return `${base}/api/fb-avatar?${params.toString()}`;
    };

    NO._avatarInitial = function _avatarInitial(name) {
        const s = String(name || '?').trim();
        return s ? s.split(/\s+/).slice(-1)[0].charAt(0).toUpperCase() : '?';
    };

    /**
     * Render small 28px avatar — shown only when `show` is true (last of
     * a consecutive incoming group, Messenger-style). When false, returns
     * an empty placeholder so subsequent messages in the group align.
     */
    NO._avatarHtml = function _avatarHtml(m, pageId, show) {
        if (!show) return `<div style="width:28px;flex-shrink:0;"></div>`;
        const fbId = m.from?.id;
        const name = m.from?.name || '';
        const url = NO._avatarUrl(fbId, pageId);
        const initial = NO._avatarInitial(name);
        if (!url) {
            return `<div style="width:28px;height:28px;border-radius:50%;background:#e2e8f0;color:#475569;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${NO.escapeHtml(initial)}</div>`;
        }
        const onerrFallback = `this.outerHTML='<div style=\\'width:28px;height:28px;border-radius:50%;background:#e2e8f0;color:#475569;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;\\'>${NO.escapeHtml(initial).replace(/'/g, '&#39;')}</div>'`;
        return `<img src="${NO.escapeHtml(url)}" alt="${NO.escapeHtml(name)}" title="${NO.escapeHtml(name)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#e2e8f0;" loading="lazy" onerror="${onerrFallback}" />`;
    };

    NO._bubbleHtml = function _bubbleHtml(m, pageId, opts = {}) {
        const isOutgoing = m.from?.id === pageId || m.from_admin || m.is_admin;
        const txt = NO._msgPlain(m.message || m.text || m.content || '');
        const time = m.inserted_at || m.created_time || m.timestamp;
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        const isRemoved = !!m.is_removed;
        const isHidden = !!m.is_hidden;

        // System message: render as centered note instead of bubble
        const sysAtt = atts.find((a) => (a.type || '').toLowerCase() === 'system_message');
        if (sysAtt && !txt && atts.length === 1) {
            return `<div class="w2-chat-row is-system" style="align-self:center;margin:4px 0;">${NO._renderSystemMessage(sysAtt)}</div>`;
        }

        // Find quoted reply (rendered above the bubble content)
        const replyAtt = atts.find((a) => (a.type || '').toLowerCase() === 'replied_message');
        const replyHtml = replyAtt ? NO._renderQuotedReply(replyAtt) : '';

        // Render every non-reply, non-reaction attachment
        const mediaHtml = atts
            .filter((a) => !['replied_message', 'reaction'].includes((a.type || '').toLowerCase()))
            .map(NO._renderAttachment)
            .filter(Boolean)
            .join('');

        // Detect sticker-only bubble — strip background to look like Messenger
        const stickerOnly =
            mediaHtml &&
            !txt &&
            atts.every(
                (a) =>
                    ['sticker', 'animated_image_url', 'reaction'].includes(
                        (a.type || '').toLowerCase()
                    ) || a.sticker_id
            );

        const removedBadge = isRemoved
            ? `<div style="font-size:11px;font-style:italic;opacity:0.7;padding:2px 0;">🗑 Tin nhắn đã được thu hồi</div>`
            : '';
        const hiddenBadge =
            isHidden && !isRemoved
                ? `<div style="font-size:10px;opacity:0.65;padding:2px 0;">🙈 Tin nhắn đã ẩn</div>`
                : '';

        const inner = isRemoved
            ? removedBadge
            : txt
              ? `<div style="white-space:pre-wrap;word-break:break-word;line-height:1.42;">${NO.escapeHtml(txt)}</div>${hiddenBadge}`
              : mediaHtml || replyHtml
                ? hiddenBadge
                : `<div style="opacity:0.6;font-style:italic;font-size:11px;">(không có nội dung)</div>`;

        const timeStr = NO._fmtVnTime(time);

        const reactionsHtml = NO._renderReactions(m);
        const replyBtn = m.id
            ? `<button class="w2-chat-reply-btn" data-action="reply-to" data-msg-id="${NO.escapeHtml(m.id)}" title="Trả lời tin này"><i data-lucide="corner-up-left" style="width:11px;height:11px;"></i></button>`
            : '';

        // Pancake colour scheme (live-inspected): outgoing is light-green
        // #dcf8c6 with black text and a uniform 12px radius; incoming is
        // pure white with asymmetric 12/12/12/4 radius (Messenger style).
        const bubbleStyle = stickerOnly
            ? `background:transparent;border:0;padding:0;box-shadow:none;`
            : `background:${isOutgoing ? '#dcf8c6' : '#ffffff'};color:#1d2939;padding:6px 12px;border-radius:${isOutgoing ? '12px' : '12px 12px 12px 4px'};border:1px solid ${isOutgoing ? '#cdebb5' : '#ececec'};`;

        // Avatar for incoming bubbles only (Messenger style — show on the
        // last of a consecutive group of same-sender messages).
        const showAvatar = !isOutgoing && opts.showAvatar !== false;
        const avatarHtml = !isOutgoing
            ? `<div class="w2-chat-avatar-slot" style="align-self:flex-end;">${NO._avatarHtml(m, pageId, showAvatar)}</div>`
            : '';

        return `<div class="w2-chat-row ${isOutgoing ? 'is-out' : 'is-in'}" data-msg-id="${NO.escapeHtml(m.id || '')}" style="display:flex;flex-direction:column;align-items:${isOutgoing ? 'flex-end' : 'flex-start'};margin:2px 0;position:relative;">
            <div class="w2-chat-bubble-wrap" style="display:flex;align-items:flex-end;gap:6px;${isOutgoing ? 'flex-direction:row-reverse;' : ''}max-width:80%;">
                ${avatarHtml}
                <div class="w2-chat-bubble" data-msg-id="${NO.escapeHtml(m.id || '')}" style="${bubbleStyle}font-size:13px;">${replyHtml}${inner}${mediaHtml}</div>
                ${replyBtn}
            </div>
            ${reactionsHtml}
            ${timeStr ? `<div class="w2-chat-time" style="font-size:10px;color:#94a3b8;margin-top:2px;${isOutgoing ? 'padding-right:8px;' : 'padding-left:38px;'}">${NO.escapeHtml(timeStr)}</div>` : ''}
        </div>`;
    };

    NO._dateSeparatorHtml = function _dateSeparatorHtml(label) {
        return `<div class="w2-chat-daysep" style="display:flex;align-items:center;gap:10px;align-self:stretch;margin:10px 0 4px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;">
            <span style="flex:1;height:1px;background:linear-gradient(to right,transparent,#e5e7eb);"></span>
            <span style="background:#fff;padding:3px 12px;border-radius:999px;border:1px solid #e5e7eb;">${NO.escapeHtml(label)}</span>
            <span style="flex:1;height:1px;background:linear-gradient(to left,transparent,#e5e7eb);"></span>
        </div>`;
    };
})();
