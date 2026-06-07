// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — component chat HỢP NHẤT (Web2ChatPanel) dùng chung native-orders/tpos-pancake/balance-history.
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
(function (global) {
    function esc(s) {
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    // Pancake text đến dạng HTML một phần (<div>, <br>) → plain text giữ xuống dòng.
    function msgPlain(raw) {
        if (!raw) return '';
        if (!String(raw).includes('<')) return String(raw);
        const normalized = String(raw)
            .replace(/\r\n?/g, '\n')
            .replace(/<br\b[^>]*>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
            .replace(/<(p|div|li|h[1-6])(\s[^>]*)?>/gi, '\n');
        const tmp = document.createElement('div');
        tmp.innerHTML = normalized;
        const text = tmp.textContent || tmp.innerText || '';
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    function workerUrl() {
        return (
            (global.Web2Chat &&
                global.Web2Chat._internal &&
                global.Web2Chat._internal.WORKER_URL) ||
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    function fbAvatarUrl(psid, pageId) {
        if (!psid) return '';
        return `${workerUrl()}/api/fb-avatar?id=${encodeURIComponent(psid)}${pageId ? '&page=' + encodeURIComponent(pageId) : ''}`;
    }
    const GRADIENTS = [
        'linear-gradient(135deg,#667eea,#764ba2)',
        'linear-gradient(135deg,#f093fb,#f5576c)',
        'linear-gradient(135deg,#4facfe,#00f2fe)',
        'linear-gradient(135deg,#43e97b,#38f9d7)',
    ];
    function gradientFor(name) {
        const s = String(name || '?');
        return GRADIENTS[(s.charCodeAt(0) || 0) % GRADIENTS.length];
    }
    function initialOf(name) {
        return esc(
            (
                String(name || '?')
                    .trim()
                    .charAt(0) || '?'
            ).toUpperCase()
        );
    }
    function avatarBig(name, psid, pageId, directUrl) {
        const url = directUrl || fbAvatarUrl(psid, pageId);
        const grad = gradientFor(name);
        if (url && !String(url).startsWith('data:image/svg')) {
            return `<img src="${esc(url)}" class="w2cp-avatar" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="w2cp-avatar-ph" style="display:none;background:${grad};">${initialOf(name)}</div>`;
        }
        return `<div class="w2cp-avatar-ph" style="background:${grad};">${initialOf(name)}</div>`;
    }
    function avatarSmall(name, psid, pageId) {
        const url = fbAvatarUrl(psid, pageId);
        const grad = gradientFor(name);
        const img = url
            ? `<img class="w2cp-bub-av-img" src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">`
            : '';
        // div chữ-cái nền gradient + img phủ (img lỗi → tự remove → còn chữ)
        return `<div class="w2cp-bub-av" style="background:${grad};">${initialOf(name)}${img}</div>`;
    }

    function fmtTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        if (isNaN(d)) return '';
        return d.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Ho_Chi_Minh',
        });
    }
    function msgTs(m) {
        const t = m && (m.inserted_at || m.created_time || m.timestamp);
        const n = t ? Date.parse(t) : 0;
        return isNaN(n) ? 0 : n;
    }

    // ---- Render 1 attachment (media) ----
    function renderAttachment(a) {
        const type = (a.type || '').toLowerCase();
        if (type === 'reaction' || type === 'replied_message') return '';
        const url =
            a.url ||
            a.file_url ||
            a.preview_url ||
            (a.payload && a.payload.url) ||
            (a.image_data && a.image_data.url) ||
            a.src ||
            '';
        const isImg =
            type === 'photo' || type === 'image' || (a.mime_type || '').startsWith('image/');
        const isSticker =
            type === 'sticker' ||
            type === 'animated_image_url' ||
            type === 'animated_image_share' ||
            !!a.sticker_id;
        if (url && isSticker)
            return `<div class="w2cp-sticker"><img src="${esc(url)}" alt="sticker" loading="lazy"></div>`;
        if (url && isImg)
            return `<img class="w2cp-img" src="${esc(url)}" alt="image" loading="lazy">`;
        if (url && (type === 'video' || (a.mime_type || '').startsWith('video/')))
            return `<video class="w2cp-video" src="${esc(url)}" controls preload="metadata"></video>`;
        if (url && (type === 'audio' || (a.mime_type || '').startsWith('audio/')))
            return `<audio class="w2cp-audio" src="${esc(url)}" controls preload="metadata"></audio>`;
        if (type === 'like' || type === 'thumbsup') return `<div style="font-size:30px;">👍</div>`;
        if (url) {
            const nm = a.name || a.filename || 'Tệp đính kèm';
            return `<a class="w2cp-file" href="${esc(url)}" target="_blank" rel="noopener">📎 ${esc(nm)}</a>`;
        }
        return '';
    }

    // ============================== Instance ==============================
    function createInstance(container, opts) {
        const mode = opts.mode || 'full';
        const flags = {
            paste: !!opts.enablePaste,
            sticker: !!opts.enableSticker,
            reactSend: !!opts.enableReactSend,
            entityDetect: !!opts.enableEntityDetect,
            hideHeader: !!opts.hideHeader, // trang đã có header riêng (native-orders)
            hideStats: !!opts.hideStats,
        };

        const st = {
            conv: null,
            adapter: null,
            messages: [],
            cursor: 0,
            hasMore: true,
            loadingOlder: false,
            isAtBottom: true,
            newCount: 0,
            replyTo: null, // { id, name, text }
            attachment: null, // { file, kind }
        };

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

        // ---------- skeleton ----------
        function renderShell() {
            container.classList.add('w2cp-root');
            container.classList.toggle('is-readonly', mode === 'readonly' || mode === 'picker');
            const c = st.conv || {};
            const name = nameOf(c);
            const cu = custOf(c);
            const directAv =
                cu.avatar ||
                cu.profile_pic ||
                (cu.picture && cu.picture.data && cu.picture.data.url) ||
                null;
            const loc = (cu.address && cu.address.province) || '';
            const pageName = (st.adapter && st.adapter.pageName) || 'shop';
            const hasExt = !!(st.adapter && st.adapter.hasExtension);
            const showInput = mode === 'full';

            container.innerHTML = `
                ${
                    flags.hideHeader
                        ? ''
                        : `<div class="w2cp-header">
                    <div class="w2cp-header-left">
                        ${avatarBig(name, psidOf(c), pageIdOf(c), directAv)}
                        <div>
                            <div class="w2cp-name"><span>${esc(name)}</span>${loc ? `<span class="w2cp-loc-badge">📍 ${esc(loc)}</span>` : ''}</div>
                            <div class="w2cp-status" data-w2cp="status"></div>
                        </div>
                    </div>
                    <div class="w2cp-header-right">
                        <button class="w2cp-tool" data-w2cp-act="refresh" title="Tải lại"><i data-lucide="rotate-cw"></i></button>
                        <button class="w2cp-tool" data-w2cp-act="scroll-bottom" title="Cuộn xuống"><i data-lucide="chevron-down"></i></button>
                    </div>
                </div>`
                }
                ${flags.hideStats ? '' : '<div class="w2cp-stats-bar" data-w2cp="stats"></div>'}
                <div class="w2cp-messages" data-w2cp="messages"><div class="w2cp-loading">Đang tải tin nhắn…</div></div>
                <button class="w2cp-scroll-btn" data-w2cp-act="scroll-bottom"><i data-lucide="chevron-down"></i><span class="w2cp-scroll-badge" data-w2cp="badge">0</span></button>
                ${
                    showInput
                        ? `
                <div class="w2cp-detect-bar" data-w2cp="detect"></div>
                <div class="w2cp-quick-row" data-w2cp="quick"></div>
                <div class="w2cp-reply-bar" data-w2cp="replybar"><span class="preview"></span><button data-w2cp-act="cancel-reply" title="Hủy trả lời">×</button></div>
                <div class="w2cp-reply-from">↩ Trả lời từ <strong>${esc(pageName)}</strong><span class="w2cp-send-via">${hasExt ? '🚀 N2 Extension (bypass 24h)' : 'Gửi qua Pancake API'}</span></div>
                <div class="w2cp-input-bar">
                    <div class="w2cp-input-actions">
                        <button class="w2cp-input-btn" data-w2cp-act="attach-file" title="Đính kèm tệp"><i data-lucide="paperclip"></i></button>
                        <button class="w2cp-input-btn" data-w2cp-act="attach-image" title="Hình ảnh"><i data-lucide="image"></i></button>
                        <button class="w2cp-input-btn" data-w2cp-act="toggle-picker" title="Emoji / Sticker"><i data-lucide="smile"></i></button>
                        <input type="file" data-w2cp="file-input" style="display:none">
                        <input type="file" accept="image/*" data-w2cp="image-input" style="display:none">
                    </div>
                    <div class="w2cp-picker" data-w2cp="picker"></div>
                    <div class="w2cp-input-wrap">
                        <div class="w2cp-attach-preview" data-w2cp="attach-preview"><span data-w2cp="attach-body"></span><button class="w2cp-preview-remove" data-w2cp-act="clear-attach">×</button></div>
                        <textarea class="w2cp-input" data-w2cp="input" rows="1" placeholder="Nhập tin nhắn… (Enter để gửi, /shortcut chèn mẫu)"></textarea>
                    </div>
                    <button class="w2cp-send-btn" data-w2cp-act="send" title="Gửi"><i data-lucide="send"></i></button>
                </div>`
                        : `<div class="w2cp-readonly-foot">🔒 Chỉ xem — gửi tin ở trang Đơn web / Inbox</div>`
                }
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            renderStats();
            renderStatus();
            if (showInput) {
                renderQuick();
                bindInput();
            }
            bindCommon();
        }

        function renderStatus() {
            const el = $('[data-w2cp="status"]');
            if (!el || !st.conv) return;
            const t = st.conv.updated_at;
            el.textContent = t ? `Hoạt động ${fmtTime(t)}` : '';
        }

        function renderStats() {
            const bar = $('[data-w2cp="stats"]');
            if (!bar) return;
            const c = st.conv || {};
            const cu = custOf(c);
            let phone =
                (cu.phone_numbers && cu.phone_numbers[0]) ||
                cu.phone ||
                (c.recent_phone_numbers &&
                    c.recent_phone_numbers[0] &&
                    (c.recent_phone_numbers[0].phone_number || c.recent_phone_numbers[0])) ||
                '';
            if (typeof phone !== 'string') phone = String(phone || '');
            const commentCount = cu.comment_count || c.comment_count || 0;
            const success = cu.success_order_count || cu.order_count || 0;
            const returned = cu.returned_order_count || cu.cancel_count || 0;
            const total = success + returned;
            const rate = total > 0 ? Math.round((returned / total) * 100) : 0;
            const phoneBadge = phone
                ? `<span class="w2cp-phone-badge has-phone" data-w2cp-copy="${esc(phone)}" title="Click để copy">📞 ${esc(phone)}</span>`
                : '';
            bar.innerHTML = `
                <div class="w2cp-stats-left">${phoneBadge}</div>
                <div class="w2cp-stats-right">
                    <span class="w2cp-stat" title="Bình luận">💬 ${commentCount}</span>
                    <span class="w2cp-stat" title="Đơn thành công">✅ ${success}</span>
                    <span class="w2cp-stat" title="Đơn hoàn">↩ ${returned}</span>
                    ${rate > 30 ? `<span class="w2cp-stat warning" title="Tỉ lệ hoàn ${rate}%">⚠ ${rate}%</span>` : ''}
                </div>`;
        }

        function renderQuick() {
            const el = $('[data-w2cp="quick"]');
            if (!el) return;
            const qr = (st.adapter && st.adapter.quickReplies && st.adapter.quickReplies()) || [];
            el.innerHTML = qr
                .map(
                    (q) =>
                        `<button class="w2cp-quick-btn" data-w2cp-tpl="${esc(q.template || '')}" style="background:${esc(q.color || '#7c3aed')}">${esc(q.label || '')}</button>`
                )
                .join('');
        }

        // ---------- messages ----------
        function quoted(m) {
            const atts = Array.isArray(m.attachments) ? m.attachments : [];
            const rep = atts.find((a) => (a.type || '').toLowerCase() === 'replied_message');
            const src = rep && (rep.replied_message || rep.payload || rep);
            if (!src) return '';
            const from = (src.from && src.from.name) || src.sender_name || 'Tin nhắn';
            const txt = msgPlain(src.message || src.text || '').slice(0, 80);
            if (!txt) return '';
            return `<div class="w2cp-quoted"><div class="w2cp-quoted-from">↩ ${esc(from)}</div>${esc(txt)}</div>`;
        }
        function reactions(m) {
            const atts = Array.isArray(m.attachments) ? m.attachments : [];
            const rs = atts.filter((a) => (a.type || '').toLowerCase() === 'reaction');
            if (!rs.length) return '';
            return `<span class="w2cp-reactions">${rs.map((r) => esc(r.emoji || '❤️')).join('')}</span>`;
        }
        function renderMessage(m) {
            const out = isOutgoing(m);
            const txt = msgPlain(m.message || m.text || m.content || '');
            const atts = Array.isArray(m.attachments) ? m.attachments : [];
            const media = atts.map(renderAttachment).filter(Boolean).join('');
            if (m.is_removed)
                return `<div class="w2cp-row ${out ? 'is-out' : 'is-in'}" data-msg-id="${esc(m.id || '')}"><div class="w2cp-bubble" style="font-style:italic;opacity:.7;">🗑 Tin đã thu hồi</div></div>`;
            const body = txt ? `<div class="w2cp-txt">${esc(txt)}</div>` : '';
            const react = reactions(m);
            if (!body && !media && !react) return '';
            const av = out
                ? ''
                : m._showAv
                  ? avatarSmall(nameOf(st.conv), psidOf(st.conv), pageIdOf(st.conv))
                  : '<div class="w2cp-bub-spacer"></div>';
            const replyBtn =
                mode === 'full'
                    ? `<button class="w2cp-reply-btn" data-w2cp-act="reply" data-msg-id="${esc(m.id || '')}" title="Trả lời tin này"><i data-lucide="corner-up-left" style="width:12px;height:12px;"></i></button>`
                    : '';
            const bubble =
                body || media ? `<div class="w2cp-bubble">${quoted(m)}${body}${media}</div>` : '';
            return `<div class="w2cp-row ${out ? 'is-out' : 'is-in'}" data-msg-id="${esc(m.id || '')}">
                <div class="w2cp-wrap">${av}${bubble}${replyBtn}</div>
                ${react}
                <div class="w2cp-time">${esc(fmtTime(m.inserted_at || m.created_time || m.timestamp))}</div>
            </div>`;
        }

        function dayKey(d) {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).format(d);
        }
        function renderAll() {
            const cont = $('[data-w2cp="messages"]');
            if (!cont) return;
            if (!st.messages.length) {
                cont.innerHTML = '<div class="w2cp-empty">Chưa có tin nhắn</div>';
                return;
            }
            const sorted = st.messages.slice().sort((a, b) => msgTs(a) - msgTs(b));
            // đánh dấu _showAv: tin KH đầu mỗi nhóm (sau 1 tin outgoing) thì hiện avatar
            let prevOut = true;
            const todayKey = dayKey(new Date());
            let lastDay = '';
            let html = st.hasMore
                ? '<div class="w2cp-load-older" data-w2cp="older">↑ Cuộn lên xem tin cũ</div>'
                : '';
            for (const m of sorted) {
                const d = new Date(msgTs(m));
                const k = isNaN(d) ? '' : dayKey(d);
                if (k && k !== lastDay) {
                    lastDay = k;
                    const label =
                        k === todayKey
                            ? 'Hôm nay'
                            : new Intl.DateTimeFormat('vi-VN', {
                                  weekday: 'short',
                                  day: '2-digit',
                                  month: '2-digit',
                                  timeZone: 'Asia/Ho_Chi_Minh',
                              }).format(d);
                    html += `<div class="w2cp-daysep">${esc(label)}</div>`;
                }
                const out = isOutgoing(m);
                m._showAv = !out && prevOut;
                prevOut = out;
                html += renderMessage(m);
            }
            cont.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            if (st.isAtBottom) scrollToBottom();
            renderDetect();
        }

        // Feature 3: quét SĐT/địa chỉ trong tin KH → bar chip "➕ Thêm vào KH".
        // Chỉ hiện ở mode full khi adapter có onAddEntity. Click → adapter xử lý
        // (fill đơn + upsert web2_customers tuỳ trang).
        function renderDetect() {
            if (mode !== 'full') return;
            const bar = $('[data-w2cp="detect"]');
            if (!bar) return;
            const Detect = global.Web2ChatEntityDetect;
            if (!Detect || !(st.adapter && st.adapter.onAddEntity)) {
                bar.innerHTML = '';
                bar.classList.remove('visible');
                return;
            }
            const found = Detect.scanMessages(st.messages, { pageId: pageIdOf(st.conv) });
            const phone = (found.phones || [])[0] || '';
            const addr = (found.addresses || [])[0] || '';
            if (!phone && !addr) {
                bar.innerHTML = '';
                bar.classList.remove('visible');
                return;
            }
            st._detected = { phone, address: addr };
            const chips =
                (phone
                    ? `<span class="w2cp-detect-chip" data-w2cp-copy="${esc(phone)}">📞 ${esc(phone)}</span>`
                    : '') +
                (addr
                    ? `<span class="w2cp-detect-chip" data-w2cp-copy="${esc(addr)}" title="${esc(addr)}">🏠 ${esc(addr.length > 38 ? addr.slice(0, 38) + '…' : addr)}</span>`
                    : '');
            bar.innerHTML = `<span class="w2cp-detect-label">Phát hiện:</span>${chips}<button class="w2cp-detect-add" data-w2cp-act="add-entity"><i data-lucide="user-plus" style="width:13px;height:13px;"></i> Thêm vào KH</button>`;
            bar.classList.add('visible');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // ---------- load ----------
        async function loadThread() {
            const cont = $('[data-w2cp="messages"]');
            if (cont) cont.innerHTML = '<div class="w2cp-loading">Đang tải tin nhắn…</div>';
            try {
                const r = (st.adapter.loadMessages && (await st.adapter.loadMessages())) || {};
                st.messages = (r.messages || []).slice();
                st.cursor = st.messages.length;
                st.hasMore = r.hasMore !== false && st.messages.length > 0;
                st.isAtBottom = true;
                renderAll();
                scrollToBottom();
                if (st.adapter.markRead) st.adapter.markRead().catch(() => {});
            } catch (e) {
                if (cont)
                    cont.innerHTML = `<div class="w2cp-empty">Lỗi tải tin nhắn: ${esc(e && e.message)}</div>`;
            }
        }
        async function loadOlder() {
            if (st.loadingOlder || !st.hasMore || !st.adapter.loadOlder) return;
            st.loadingOlder = true;
            const cont = $('[data-w2cp="messages"]');
            const before = cont ? cont.scrollHeight : 0;
            const ind = cont && cont.querySelector('[data-w2cp="older"]');
            if (ind) ind.textContent = '⏳ Đang tải tin cũ…';
            try {
                const r = (await st.adapter.loadOlder(st.cursor)) || {};
                const older = r.messages || [];
                const known = new Set(st.messages.map((m) => m.id).filter(Boolean));
                const fresh = older.filter((m) => m.id && !known.has(m.id));
                if (!fresh.length) {
                    st.hasMore = false;
                } else {
                    st.messages = [...fresh, ...st.messages];
                    st.cursor = st.messages.length;
                }
                st.isAtBottom = false;
                renderAll();
                if (cont) cont.scrollTop = cont.scrollHeight - before;
            } catch (_) {
                if (ind) ind.textContent = '↑ Cuộn lên xem tin cũ';
            } finally {
                st.loadingOlder = false;
            }
        }

        function scrollToBottom() {
            const cont = $('[data-w2cp="messages"]');
            if (!cont) return;
            cont.scrollTop = cont.scrollHeight;
            st.isAtBottom = true;
            st.newCount = 0;
            updateScrollUi();
        }
        function updateScrollUi() {
            const btn = $('.w2cp-scroll-btn');
            const badge = $('[data-w2cp="badge"]');
            if (btn) btn.classList.toggle('visible', !st.isAtBottom);
            if (badge) {
                badge.textContent = st.newCount > 99 ? '99+' : st.newCount;
                badge.classList.toggle('visible', st.newCount > 0);
            }
        }

        // ---------- send ----------
        async function doSend() {
            const input = $('[data-w2cp="input"]');
            if (!input || !st.adapter.send) return;
            const text = input.value.trim();
            const att = st.attachment;
            if (!text && !att) return;
            const replyToId = st.replyTo && st.replyTo.id;
            const tempId = 'temp_' + Date.now();
            const conv = st.conv;
            const action = conv.type === 'COMMENT' ? 'reply_comment' : 'reply_inbox';

            const apply = () => {
                input.value = '';
                input.style.height = 'auto';
                clearAttach();
                clearReply();
                st.messages.push({
                    id: tempId,
                    message: text || '[Tệp đính kèm]',
                    from: { id: pageIdOf(conv), name: 'You' },
                    inserted_at: new Date().toISOString(),
                    _temp: true,
                });
                st.isAtBottom = true;
                renderAll();
                if (st.adapter.onConversationUpdate) {
                    conv.snippet = text || '[Tệp]';
                    st.adapter.onConversationUpdate(conv);
                }
            };
            const onSuccess = (res) => {
                st.messages = st.messages.filter((m) => m.id !== tempId);
                if (res && res.sent) st.messages.push(res.sent);
                st.isAtBottom = true;
                renderAll();
            };
            const rollback = () => {
                st.messages = st.messages.filter((m) => m.id !== tempId);
                renderAll();
                if (input && !input.value.trim() && text) {
                    input.value = text;
                    input.focus();
                }
                if (att) setAttachment(att.file);
            };
            const run = () => st.adapter.send({ text, attachment: att, action, replyToId });

            if (global.Web2Optimistic && global.Web2Optimistic.run) {
                global.Web2Optimistic.run({
                    apply,
                    run,
                    onSuccess,
                    rollback,
                    errLabel: 'gửi tin nhắn',
                });
                return;
            }
            apply();
            try {
                onSuccess(await run());
            } catch (e) {
                rollback();
                if (global.notificationManager && global.notificationManager.show)
                    global.notificationManager.show('Lỗi gửi tin: ' + (e && e.message), 'error');
            }
        }

        // ---------- sticker (Feature 2) ----------
        // Gửi sticker FB qua adapter.sendSticker(stickerId) (→ REPLY_INBOX_PHOTO STICKER).
        // UI-first: bong bóng tạm hiện emoji đại diện; WS/refetch sau mang sticker thật.
        function sendStickerOptimistic(stickerId) {
            if (!st.adapter || !st.adapter.sendSticker) return;
            const sk =
                (global.Web2ChatStickers &&
                    global.Web2ChatStickers.list().find((s) => s.id === stickerId)) ||
                {};
            const tempId = 'temp_' + Date.now();
            const conv = st.conv;
            const apply = () => {
                st.messages.push({
                    id: tempId,
                    from: { id: pageIdOf(conv), name: 'You' },
                    message: sk.emoji || '🧩',
                    inserted_at: new Date().toISOString(),
                    _temp: true,
                });
                st.isAtBottom = true;
                renderAll();
            };
            const onSuccess = (res) => {
                st.messages = st.messages.filter((m) => m.id !== tempId);
                if (res && res.sent) st.messages.push(res.sent);
                st.isAtBottom = true;
                renderAll();
            };
            const rollback = () => {
                st.messages = st.messages.filter((m) => m.id !== tempId);
                renderAll();
            };
            const run = () => Promise.resolve(st.adapter.sendSticker(stickerId));
            if (global.Web2Optimistic && global.Web2Optimistic.run) {
                global.Web2Optimistic.run({
                    apply,
                    run,
                    onSuccess,
                    rollback,
                    errLabel: 'gửi sticker',
                });
                return;
            }
            apply();
            run().then(onSuccess).catch(rollback);
        }

        // ---------- attachment ----------
        function attachKind(file) {
            const t = (file && file.type) || '';
            if (t.startsWith('image/')) return 'PHOTO';
            if (t.startsWith('audio/')) return 'AUDIO';
            if (t.startsWith('video/')) return 'VIDEO';
            return 'FILE';
        }
        function setAttachment(file) {
            if (!file) return;
            st.attachment = { file, kind: attachKind(file) };
            const wrap = $('[data-w2cp="attach-preview"]');
            const body = $('[data-w2cp="attach-body"]');
            if (!wrap || !body) return;
            if (st.attachment.kind === 'PHOTO') {
                const r = new FileReader();
                r.onload = (e) => {
                    body.innerHTML = `<img class="w2cp-attach-thumb" src="${e.target.result}">`;
                    wrap.classList.add('visible');
                };
                r.readAsDataURL(file);
            } else {
                const icon =
                    st.attachment.kind === 'AUDIO'
                        ? '🎵'
                        : st.attachment.kind === 'VIDEO'
                          ? '🎬'
                          : '📎';
                const kb = Math.max(1, Math.round((file.size || 0) / 1024));
                body.innerHTML = `<span class="w2cp-attach-chip">${icon} ${esc(file.name || 'tệp')} <small>(${kb} KB)</small></span>`;
                wrap.classList.add('visible');
            }
        }
        function clearAttach() {
            st.attachment = null;
            const wrap = $('[data-w2cp="attach-preview"]');
            const body = $('[data-w2cp="attach-body"]');
            if (wrap) wrap.classList.remove('visible');
            if (body) body.innerHTML = '';
            const fi = $('[data-w2cp="file-input"]');
            const ii = $('[data-w2cp="image-input"]');
            if (fi) fi.value = '';
            if (ii) ii.value = '';
        }

        // ---------- reply ----------
        function setReply(msgId) {
            const m = st.messages.find((x) => String(x.id) === String(msgId));
            if (!m) return;
            st.replyTo = {
                id: m.id,
                name: isOutgoing(m) ? 'Bạn' : nameOf(st.conv),
                text: msgPlain(m.message || m.text || '').slice(0, 60) || '[đính kèm]',
            };
            const bar = $('[data-w2cp="replybar"]');
            if (bar) {
                bar.querySelector('.preview').innerHTML =
                    `<strong>↩ ${esc(st.replyTo.name)}</strong>${esc(st.replyTo.text)}`;
                bar.classList.add('visible');
            }
            const input = $('[data-w2cp="input"]');
            if (input) input.focus();
        }
        function clearReply() {
            st.replyTo = null;
            const bar = $('[data-w2cp="replybar"]');
            if (bar) bar.classList.remove('visible');
        }

        // ---------- emoji / sticker picker ----------
        let pickerTab = 'emoji';
        let emojiCat = 'recent';
        function renderPicker() {
            const el = $('[data-w2cp="picker"]');
            if (!el) return;
            const Emoji = global.Web2ChatEmoji;
            // Sticker tab hiện khi adapter có sendSticker (gửi qua REPLY_INBOX_PHOTO
            // STICKER). Nguồn = Web2ChatStickers built-in (không cần GET_STICKERS stub).
            const showSticker = !!(st.adapter && st.adapter.sendSticker && global.Web2ChatStickers);
            const tabs = showSticker
                ? `<div class="w2cp-picker-tabs"><button class="w2cp-picker-tab ${pickerTab === 'emoji' ? 'active' : ''}" data-w2cp-tab="emoji">Emoji</button><button class="w2cp-picker-tab ${pickerTab === 'sticker' ? 'active' : ''}" data-w2cp-tab="sticker">Sticker</button></div>`
                : '';
            let bodyHtml = '';
            if (pickerTab === 'sticker' && showSticker) {
                const list = global.Web2ChatStickers.list() || [];
                bodyHtml = `<div class="w2cp-sticker-grid">${list.map((s) => `<button class="w2cp-sticker-item" data-w2cp-sticker="${esc(s.id)}" title="${esc(s.label || '')}"><span class="w2cp-sticker-emoji">${esc(s.emoji || '🧩')}</span><span class="w2cp-sticker-label">${esc(s.label || '')}</span></button>`).join('')}</div>`;
            } else if (Emoji) {
                const cats = Emoji.categories
                    .map(
                        (c) =>
                            `<button class="w2cp-emoji-cat ${c.key === emojiCat ? 'active' : ''}" data-w2cp-emcat="${c.key}" title="${esc(c.label)}">${c.icon}</button>`
                    )
                    .join('');
                const items = (Emoji.get(emojiCat) || [])
                    .map(
                        (e) =>
                            `<button class="w2cp-emoji-item" data-w2cp-emoji="${esc(e)}">${e}</button>`
                    )
                    .join('');
                bodyHtml = `<div class="w2cp-emoji-cats">${cats}</div><div class="w2cp-emoji-grid">${items}</div>`;
            }
            el.innerHTML = tabs + bodyHtml;
        }
        function togglePicker() {
            const el = $('[data-w2cp="picker"]');
            if (!el) return;
            const vis = el.classList.contains('visible');
            if (!vis) renderPicker();
            el.classList.toggle('visible', !vis);
        }
        function insertEmoji(e) {
            const input = $('[data-w2cp="input"]');
            if (!input) return;
            const s = input.selectionStart;
            input.value = input.value.slice(0, s) + e + input.value.slice(input.selectionEnd);
            input.selectionStart = input.selectionEnd = s + e.length;
            input.focus();
            if (global.Web2ChatEmoji) global.Web2ChatEmoji.pushRecent(e);
        }

        // ---------- events ----------
        function bindCommon() {
            container.addEventListener('click', onClick);
            const cont = $('[data-w2cp="messages"]');
            if (cont) {
                cont.addEventListener(
                    'scroll',
                    () => {
                        const atBottom =
                            cont.scrollHeight - cont.scrollTop - cont.clientHeight < 100;
                        st.isAtBottom = atBottom;
                        if (atBottom) st.newCount = 0;
                        updateScrollUi();
                        if (
                            cont.scrollTop < 80 &&
                            st.hasMore &&
                            !st.loadingOlder &&
                            st.messages.length
                        )
                            loadOlder();
                    },
                    { passive: true }
                );
                // ảnh bấm mở tab mới
                cont.addEventListener('click', (e) => {
                    const img = e.target.closest('.w2cp-img');
                    if (img && img.src) global.open(img.src, '_blank');
                });
            }
        }
        function bindInput() {
            const input = $('[data-w2cp="input"]');
            if (input) {
                input.addEventListener('input', () => {
                    input.style.height = 'auto';
                    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        doSend();
                    }
                });
                if (global.Web2QuickReply && global.Web2QuickReply.attachAutocomplete) {
                    try {
                        global.Web2QuickReply.attachAutocomplete(input);
                    } catch (_) {}
                }
                // Feature 1: paste ảnh ctrl+v. Lấy file ảnh từ clipboard → setAttachment
                // (preview + gửi như attach thường). Bỏ qua nếu clipboard chỉ có text.
                input.addEventListener('paste', (e) => {
                    const items = (e.clipboardData && e.clipboardData.items) || [];
                    for (const it of items) {
                        if (it.kind === 'file' && /^image\//.test(it.type)) {
                            const file = it.getAsFile();
                            if (file) {
                                e.preventDefault();
                                setAttachment(file);
                                if (global.notificationManager && global.notificationManager.show)
                                    global.notificationManager.show('Đã dán ảnh — bấm Gửi', 'info');
                                return;
                            }
                        }
                    }
                });
            }
            const fi = $('[data-w2cp="file-input"]');
            const ii = $('[data-w2cp="image-input"]');
            if (fi)
                fi.addEventListener('change', (e) => {
                    if (e.target.files[0]) setAttachment(e.target.files[0]);
                });
            if (ii)
                ii.addEventListener('change', (e) => {
                    if (e.target.files[0]) setAttachment(e.target.files[0]);
                });
            // đóng picker khi click ngoài
            document.addEventListener('click', onOutsideClick);
        }
        function onOutsideClick(e) {
            const el = $('[data-w2cp="picker"]');
            if (!el || !el.classList.contains('visible')) return;
            if (!el.contains(e.target) && !e.target.closest('[data-w2cp-act="toggle-picker"]'))
                el.classList.remove('visible');
        }
        function onClick(e) {
            const copyEl = e.target.closest('[data-w2cp-copy]');
            if (copyEl) {
                navigator.clipboard &&
                    navigator.clipboard.writeText(copyEl.getAttribute('data-w2cp-copy'));
                const orig = copyEl.textContent;
                copyEl.textContent = '✓ Đã copy';
                setTimeout(() => (copyEl.textContent = orig), 1200);
                return;
            }
            const tplBtn = e.target.closest('[data-w2cp-tpl]');
            if (tplBtn) {
                const input = $('[data-w2cp="input"]');
                if (input) {
                    const sig =
                        (global.Web2QuickReply &&
                            global.Web2QuickReply.signature &&
                            global.Web2QuickReply.signature()) ||
                        '';
                    const tpl = tplBtn.getAttribute('data-w2cp-tpl') || '';
                    input.value = (tpl + (!sig || tpl.endsWith(sig) ? '' : '\n' + sig)).trim();
                    input.focus();
                    input.selectionStart = input.selectionEnd = input.value.length;
                }
                return;
            }
            const emojiBtn = e.target.closest('[data-w2cp-emoji]');
            if (emojiBtn) {
                insertEmoji(emojiBtn.getAttribute('data-w2cp-emoji'));
                return;
            }
            const emcat = e.target.closest('[data-w2cp-emcat]');
            if (emcat) {
                emojiCat = emcat.getAttribute('data-w2cp-emcat');
                renderPicker();
                return;
            }
            const tab = e.target.closest('[data-w2cp-tab]');
            if (tab) {
                pickerTab = tab.getAttribute('data-w2cp-tab');
                renderPicker();
                return;
            }
            const stk = e.target.closest('[data-w2cp-sticker]');
            if (stk && st.adapter && st.adapter.sendSticker) {
                sendStickerOptimistic(stk.getAttribute('data-w2cp-sticker'));
                togglePicker();
                return;
            }
            const act = e.target.closest('[data-w2cp-act]');
            if (!act) return;
            const a = act.getAttribute('data-w2cp-act');
            if (a === 'send') doSend();
            else if (a === 'scroll-bottom') scrollToBottom();
            else if (a === 'refresh') loadThread();
            else if (a === 'attach-file') {
                const fi = $('[data-w2cp="file-input"]');
                fi && fi.click();
            } else if (a === 'attach-image') {
                const ii = $('[data-w2cp="image-input"]');
                ii && ii.click();
            } else if (a === 'clear-attach') clearAttach();
            else if (a === 'toggle-picker') togglePicker();
            else if (a === 'reply') setReply(act.getAttribute('data-msg-id'));
            else if (a === 'cancel-reply') clearReply();
            else if (a === 'add-entity' && st.adapter && st.adapter.onAddEntity) {
                const d = st._detected || {};
                Promise.resolve(
                    st.adapter.onAddEntity({
                        phone: d.phone || '',
                        address: d.address || '',
                        name: nameOf(st.conv),
                    })
                ).catch((e) => {
                    if (global.notificationManager && global.notificationManager.show)
                        global.notificationManager.show(
                            'Thêm KH lỗi: ' + (e && e.message),
                            'error'
                        );
                });
            }
        }

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
