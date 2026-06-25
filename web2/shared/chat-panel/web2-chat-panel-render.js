// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2ChatPanel — RENDER: skeleton/shell, header/status/tags/stats/quick,
// message bubble + attachment thread DOM, day separators, scroll UI,
// load thread / load-older, entity-detect bar.
//
// buildRender(ctx) trả về tập hàm render dùng chung closure `ctx` với
// compose + facade (MOVE-only — hành vi runtime KHÔNG đổi). `ctx` chứa:
//   container, mode, flags, st, $, pageIdOf, isOutgoing, custOf, nameOf,
//   psidOf, và (gắn sau) renderQuick/bindInput/bindCommon/doSend/... từ compose.
// =====================================================================
(function (global) {
    const NS = (global.__Web2ChatPanelNS = global.__Web2ChatPanelNS || {});
    const U = NS.utils;

    NS.buildRender = function buildRender(ctx) {
        const { container, mode, flags, st, $ } = ctx;
        const { esc, msgPlain, avatarBig, avatarSmall, fmtTime, msgTs, renderAttachment } = U;
        const { pageIdOf, isOutgoing, custOf, nameOf, psidOf } = ctx;

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
                            <div class="w2cp-tags" data-w2cp="tags" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px"></div>
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
            renderTags();
            if (showInput) {
                ctx.renderQuick();
                ctx.bindInput();
            }
            ctx.bindCommon();
        }

        function renderStatus() {
            const el = $('[data-w2cp="status"]');
            if (!el || !st.conv) return;
            const t = st.conv.updated_at;
            el.textContent = t ? `Hoạt động ${fmtTime(t)}` : '';
        }

        // Tag hội thoại Pancake (NV. Lài, BOOM, CHECK IB…) — pill màu như Pancake.
        // Dùng Web2Chat (module Pancake DÙNG CHUNG): conv.tags = mảng id; định nghĩa
        // text+màu nạp qua Web2Chat.ensureTags (page settings). Defs chưa nạp →
        // ensureTags() rồi render lại (bất đồng bộ, không chặn).
        function renderTags() {
            const el = $('[data-w2cp="tags"]');
            if (!el || !st.conv) return;
            const W = global.Web2Chat;
            const tags = st.conv.tags;
            if (!W || !W.tagPillsHtml || !Array.isArray(tags) || !tags.length) {
                el.innerHTML = '';
                return;
            }
            const pageId = pageIdOf(st.conv);
            el.innerHTML = W.tagPillsHtml(pageId, tags);
            if (!el.innerHTML && pageId && W.ensureTags) {
                const convId = st.conv.id;
                W.ensureTags(pageId).then(() => {
                    if (st.conv && st.conv.id === convId) {
                        const e2 = $('[data-w2cp="tags"]');
                        if (e2) e2.innerHTML = W.tagPillsHtml(pageId, st.conv.tags);
                    }
                });
            }
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
                        `<button class="w2cp-quick-btn" data-w2cp-tpl="${esc(q.template || '')}" style="background:${esc(q.color || '#0068ff')}">${esc(q.label || '')}</button>`
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
            const addLabel = (st.adapter && st.adapter.addEntityLabel) || 'Thêm vào KH';
            bar.innerHTML = `<span class="w2cp-detect-label">Phát hiện:</span>${chips}<button class="w2cp-detect-add" data-w2cp-act="add-entity"><i data-lucide="user-plus" style="width:13px;height:13px;"></i> ${esc(addLabel)}</button>`;
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
            st.isAtBottom = true;
            st.newCount = 0;
            // _forceBottom: trong lúc cuộn-đáy chủ động, ảnh/avatar load làm scrollHeight
            // tăng → scroll event flip isAtBottom=false → kẹt giữa chừng. Cờ này bảo
            // listener bỏ qua transient cho tới khi layout ổn định.
            st._forceBottom = true;
            const jump = () => {
                cont.scrollTop = cont.scrollHeight;
            };
            jump();
            // 2 rAF liên tiếp: đợi browser reflow sau khi innerHTML set.
            requestAnimationFrame(() => {
                jump();
                requestAnimationFrame(jump);
            });
            // Ảnh/avatar load SAU innerHTML → height tăng → re-scroll mỗi khi 1 ảnh xong
            // (chỉ khi vẫn đang ép xuống đáy, không cướp scroll của user).
            cont.querySelectorAll('img').forEach((img) => {
                if (img.complete) return;
                const reJump = () => {
                    if (st._forceBottom) jump();
                };
                img.addEventListener('load', reJump, { once: true });
                img.addEventListener('error', reJump, { once: true });
            });
            // Belt-and-suspenders: 2 nhịp trễ bắt layout muộn rồi nhả cờ.
            clearTimeout(st._forceBottomT);
            st._forceBottomMid = setTimeout(() => {
                if (st._forceBottom) jump();
            }, 150);
            st._forceBottomT = setTimeout(() => {
                if (st._forceBottom) jump();
                st._forceBottom = false;
            }, 550);
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

        return {
            renderShell,
            renderStatus,
            renderTags,
            renderStats,
            renderQuick,
            quoted,
            reactions,
            renderMessage,
            dayKey,
            renderAll,
            renderDetect,
            loadThread,
            loadOlder,
            scrollToBottom,
            updateScrollUi,
        };
    };
})(window);
