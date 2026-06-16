// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — Zalo chat VIEW (mount 1 hội thoại vào bất kỳ container).
// =====================================================================
// WZChat.mountConversation(container, conv, opts) → { reload, destroy, conv }
// Dựng khung 1 hội thoại đầy đủ (header + tin + composer) vào `container`,
// tái dùng mọi primitive WZChat (renderMessages/mountComposer/realtime/lightbox).
// Dùng bởi trang web2/zalo + Web2Zalo.mountChat (nhúng trang khác) → 1 nguồn.
//
//   conv: { id, account_key, thread_id, thread_type, display_name, avatar_url }
//   opts: { getForwardTargets?: ()=>[{id,display_name,thread_id}], onError?, autoSeen? }
// =====================================================================

(function () {
    'use strict';
    const WZ = (window.WZChat = window.WZChat || {});
    const esc = WZ.esc;
    const notify = WZ.notify;

    WZ.mountConversation = function (container, conv, opts) {
        opts = opts || {};
        const account = conv.account_key;
        const Api = window.ZaloApi;
        let messages = [];
        let hasMore = false;
        let backfilledOnce = false; // nhóm: đã thử kéo lịch sử cũ từ Zalo chưa (1 lần/phiên)
        let unsub = null;
        let tempId = 0;
        const near = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 120;

        container.classList.add('wz-chat-main');

        // Tên hiển thị header: nhóm chưa có tên (đang chờ heal) → 'Nhóm Zalo',
        // KHÔNG lộ id số. Đồng bộ với fallback của danh sách hội thoại.
        function headName() {
            return conv.display_name || (conv.thread_type === 'group' ? 'Nhóm Zalo' : 'Khách Zalo');
        }
        // Cập nhật header tại chỗ khi tên/avatar đổi (sau reload heal) — KHÔNG remount
        // composer/body để giữ scroll + nội dung đang soạn.
        function updateHead() {
            const nm = headName();
            const nameEl = container.querySelector('.wz-chat-head-name');
            if (nameEl) nameEl.textContent = nm;
            const avOld = container.querySelector('.wz-chat-head .wz-conv-av');
            if (avOld) {
                const tmp = document.createElement('div');
                tmp.innerHTML = WZ.avatarHtml(
                    conv.avatar_url,
                    nm,
                    'wz-conv-av' + (conv.thread_type === 'group' ? ' is-group' : ''),
                    'width:34px;height:34px'
                );
                const avNew = tmp.firstElementChild;
                if (avNew) avOld.replaceWith(avNew);
            }
        }
        function shell() {
            const name = headName();
            container.innerHTML = `
                <div class="wz-chat-head">
                    ${WZ.avatarHtml(conv.avatar_url, name, 'wz-conv-av' + (conv.thread_type === 'group' ? ' is-group' : ''), 'width:34px;height:34px')}
                    <span class="wz-chat-head-name">${esc(name)}</span>
                </div>
                <div class="wz-chat-body" id="wzcvBody"></div>
                <button class="wz-scroll-fab" id="wzcvFab" hidden aria-label="Cuộn xuống cuối"><i data-lucide="chevron-down"></i></button>
                <div id="wzcvCompose"></div>`;
            if (window.lucide) lucide.createIcons();
            WZ.mountComposer(container.querySelector('#wzcvCompose'), {
                conv,
                account,
                onSendText,
                onSendMedia,
                onSendFile,
                onSendSticker,
            });
            const ci = container.querySelector('.wz-compose-input');
            ci?.addEventListener('input', () => WZ.actions?.emitTyping(account, conv));
            bindBody();
        }

        const body = () => container.querySelector('#wzcvBody');

        function renderBody(o) {
            const el = body();
            if (!el) return;
            o = o || {};
            const wasNear = near(el);
            const prevH = el.scrollHeight,
                prevTop = el.scrollTop;
            const list = WZ.renderMessages(messages, conv);
            // Nhóm: kể cả khi DB hết tin vẫn cho "Tải tin cũ hơn" (kéo lịch sử từ Zalo 1 lần/phiên).
            const canBackfill = conv.thread_type === 'group' && !backfilledOnce;
            const older =
                messages.length && (hasMore || canBackfill)
                    ? `<button class="wz-load-older" id="wzcvOlder">Tải tin cũ hơn</button>`
                    : '';
            el.innerHTML = older + list;
            if (window.lucide) lucide.createIcons();
            if (o.prepend) el.scrollTop = prevTop + (el.scrollHeight - prevH);
            else if (o.keepScroll && !wasNear) el.scrollTop = prevTop;
            else el.scrollTop = el.scrollHeight;
        }

        function setTyping(on) {
            const el = body();
            if (!el) return;
            let t = el.querySelector('.wz-typing');
            if (on && !t) {
                t = document.createElement('div');
                t.className = 'wz-typing';
                t.innerHTML = '<span></span><span></span><span></span>';
                el.appendChild(t);
                if (near(el)) el.scrollTop = el.scrollHeight;
            } else if (!on && t) t.remove();
        }

        // ── optimistic out ─────────────────────────────────────────────
        function optimistic(m) {
            m.cli_msg_id = m.cli_msg_id || 'temp_' + ++tempId;
            m.send_status = 'sending';
            m.sent_at = m.sent_at || Date.now();
            m.reactions = m.reactions || {};
            messages.push(m);
            WZ.store?.setMessages(messages);
            renderBody();
            return m;
        }
        function reconcile(tempCli, patch, ok) {
            const m = messages.find((x) => x.cli_msg_id === tempCli);
            if (m) {
                Object.assign(m, patch);
                m.send_status = ok ? 'sent' : 'failed';
            }
            renderBody({ keepScroll: true });
        }
        function findMsg(id, cli) {
            return messages.find(
                (m) => String(m.msg_id) === String(id) || String(m.cli_msg_id) === String(cli || id)
            );
        }

        async function onSendText(text, mentions) {
            if (!text) return;
            const reply = WZ.store?.getReplyTarget?.() || null;
            const temp = optimistic({
                direction: 'out',
                msg_type: 'text',
                content: text,
                reply_to_preview: reply ? reply.content || WZ._previewOf?.(reply) : null,
            });
            temp._retry = () => sendTextRaw(text, reply, temp.cli_msg_id, mentions);
            await sendTextRaw(text, reply, temp.cli_msg_id, mentions);
        }
        async function sendTextRaw(text, reply, tempCli, mentions) {
            try {
                const r = await Api.sendMessage({
                    accountKey: account,
                    threadId: conv.thread_id,
                    text,
                    threadType: conv.thread_type,
                    replyTo: reply ? { msgId: reply.msg_id, preview: reply.content || '' } : null,
                    mentions: Array.isArray(mentions) && mentions.length ? mentions : undefined,
                });
                reconcile(tempCli, { msg_id: r.msgId, cli_msg_id: r.cliMsgId || tempCli }, true);
            } catch (e) {
                notify('✗ Gửi lỗi: ' + e.message, 'error');
                reconcile(tempCli, {}, false);
            }
        }
        async function onSendMedia(items, caption) {
            if (!items?.length) return;
            const atts = items.map((it) => ({ type: 'image', url: it.dataUrl, thumb: it.dataUrl }));
            const temp = optimistic({
                direction: 'out',
                msg_type: 'image',
                content: caption || '',
                attachments: atts,
            });
            const files = items.map((it) => ({
                base64: it.dataUrl,
                filename: it.name,
                mime: it.mime,
            }));
            temp._retry = () => sendMediaRaw(files, caption, temp.cli_msg_id, atts);
            await sendMediaRaw(files, caption, temp.cli_msg_id, atts);
        }
        async function sendMediaRaw(files, caption, tempCli, atts) {
            try {
                const r = await Api.sendImage({
                    accountKey: account,
                    threadId: conv.thread_id,
                    threadType: conv.thread_type,
                    caption,
                    files,
                });
                reconcile(tempCli, { msg_id: r.msgId, attachments: r.attachments || atts }, true);
            } catch (e) {
                notify('✗ Gửi ảnh lỗi: ' + e.message, 'error');
                reconcile(tempCli, {}, false);
            }
        }
        async function onSendFile(item) {
            if (!item) return;
            const temp = optimistic({
                direction: 'out',
                msg_type: 'file',
                content: '',
                attachments: [{ type: 'file', title: item.name }],
            });
            try {
                const r = await Api.sendFile({
                    accountKey: account,
                    threadId: conv.thread_id,
                    threadType: conv.thread_type,
                    file: { base64: item.dataUrl, filename: item.name, mime: item.mime },
                });
                reconcile(temp.cli_msg_id, { msg_id: r.msgId, attachments: r.attachments }, true);
            } catch (e) {
                notify('✗ Gửi tệp lỗi: ' + e.message, 'error');
                reconcile(temp.cli_msg_id, {}, false);
            }
        }
        async function onSendSticker(s) {
            if (!s) return;
            const temp = optimistic({
                direction: 'out',
                msg_type: 'sticker',
                attachments: [{ type: 'sticker', url: s.url }],
            });
            try {
                const r = await Api.sendSticker({
                    accountKey: account,
                    threadId: conv.thread_id,
                    threadType: conv.thread_type,
                    sticker: s,
                });
                reconcile(temp.cli_msg_id, { msg_id: r.msgId }, true);
            } catch (e) {
                notify('✗ ' + e.message, 'error');
                reconcile(temp.cli_msg_id, {}, false);
            }
        }

        // ── tools / lightbox / load-older ──────────────────────────────
        function bindBody() {
            const el = body();
            if (!el) return;
            el.addEventListener('click', (e) => {
                if (e.target.closest('#wzcvOlder')) return loadOlder();
                const lb = e.target.closest('[data-lb]');
                if (lb && WZ.openLightbox) {
                    const imgs = WZ.collectThreadImages(el);
                    const img = lb.querySelector('img');
                    const full = img?.dataset.full || img?.src;
                    WZ.openLightbox(imgs.length ? imgs : [full], Math.max(0, imgs.indexOf(full)));
                    return;
                }
                const tool = e.target.closest('[data-act]');
                if (!tool) return;
                const me = tool.closest('.wz-msg');
                const m = findMsg(me?.dataset.msgid, me?.dataset.cli);
                const act = tool.dataset.act;
                if (act === 'retry') return m?._retry?.();
                if (!m) return;
                if (act === 'reply') return WZ.composer?.setReply(m);
                if (act === 'react') return WZ.openReactionBar(tool, (key) => doReact(m, key));
                if (act === 'recall') return doRecall(m);
                if (act === 'forward') return doForward(m, tool);
            });
            el.addEventListener(
                'scroll',
                () => {
                    const fab = container.querySelector('#wzcvFab');
                    if (fab) fab.hidden = near(el);
                },
                { passive: true }
            );
            container.querySelector('#wzcvFab')?.addEventListener('click', () => {
                el.scrollTop = el.scrollHeight;
            });
        }
        function doReact(m, key) {
            const emoji = WZ.reactionEmoji(key);
            WZ.store.patchReaction(m.msg_id || m.cli_msg_id, emoji, 'me');
            renderBody({ keepScroll: true });
            WZ.actions.react(account, conv, m, key).catch((e) => notify('✗ ' + e.message, 'error'));
        }
        function doRecall(m) {
            if (!confirm('Thu hồi tin nhắn này?')) return;
            m.recalled = true;
            renderBody({ keepScroll: true });
            WZ.actions.recall(account, conv, m).catch((e) => {
                m.recalled = false;
                renderBody({ keepScroll: true });
                notify('✗ Thu hồi lỗi: ' + e.message, 'error');
            });
        }
        function doForward(m, anchor) {
            const targets = (opts.getForwardTargets ? opts.getForwardTargets() : []) || [];
            const items = targets
                .filter((x) => x.id !== conv.id)
                .slice(0, 40)
                .map((x) => ({ label: x.display_name || x.thread_id, value: x.thread_id }));
            if (!items.length) return notify('Không có hội thoại để chuyển tiếp', 'warning');
            WZ.openMenu(anchor, items, (threadId) => {
                if (!threadId) return;
                WZ.actions
                    .forward(account, conv, m, [threadId])
                    .then(() => notify('Đã chuyển tiếp', 'success'))
                    .catch((e) => notify('✗ ' + e.message, 'error'));
            });
        }
        async function loadOlder() {
            const btn = container.querySelector('#wzcvOlder');
            if (btn) btn.textContent = 'Đang tải…';
            try {
                // 1) Còn tin cũ trong DB → phân trang DB (nhanh, keyset).
                if (hasMore) {
                    const oldest = messages[0];
                    if (oldest?.sent_at) {
                        const res = await Api.loadHistory(conv.id, {
                            limit: 50,
                            before: oldest.sent_at,
                            beforeId: oldest.id,
                        });
                        const have = new Set(messages.map((m) => String(m.msg_id || m.id)));
                        const fresh = (res.data || []).filter(
                            (m) => !have.has(String(m.msg_id || m.id))
                        );
                        messages = fresh.concat(messages);
                        hasMore = res.hasMore;
                        WZ.store?.setMessages(messages);
                        renderBody({ prepend: true });
                        return;
                    }
                }
                // 2) DB hết tin cũ → nhóm: kéo lịch sử từ Zalo về DB (1 lần/phiên), rồi tải lại.
                if (conv.thread_type === 'group' && !backfilledOnce) {
                    backfilledOnce = true;
                    const r = await Api.backfill(conv.id, 200).catch((e) => ({
                        error: e.message,
                    }));
                    if (r && r.added > 0) {
                        const res = await Api.messages(
                            conv.id,
                            Math.min(messages.length + r.added + 20, 500)
                        );
                        messages = res.data || messages;
                        hasMore = !!res.hasMore;
                        WZ.store?.setMessages(messages);
                        renderBody({ prepend: true });
                        notify(`Đã tải thêm ${r.added} tin cũ từ Zalo`, 'success');
                    } else {
                        renderBody({ keepScroll: true });
                        notify(
                            r && r.error ? '✗ ' + r.error : 'Zalo không còn tin cũ hơn để tải về',
                            'info'
                        );
                    }
                    return;
                }
            } catch (e) {
                notify('✗ ' + e.message, 'error');
                if (btn) btn.textContent = 'Tải tin cũ hơn';
            }
        }

        async function reload() {
            try {
                const res = await Api.messages(conv.id, 100);
                Object.assign(conv, res.conversation || {});
                messages = res.data || [];
                hasMore = !!res.hasMore;
                WZ.store?.setConversation(conv, account, messages);
                updateHead(); // tên/avatar nhóm có thể vừa được server heal → cập nhật header
                renderBody();
            } catch (e) {
                opts.onError?.(e);
                const el = body();
                if (el) el.innerHTML = `<div class="wz-chat-empty">✗ ${esc(e.message)}</div>`;
            }
        }
        async function refresh() {
            try {
                const pending = messages.filter(
                    (m) => m.send_status === 'sending' || m.send_status === 'failed'
                );
                const res = await Api.messages(conv.id, 100);
                const fresh = res.data || [];
                const ids = new Set(fresh.map((m) => String(m.msg_id)));
                messages = fresh.concat(
                    pending.filter((p) => !p.msg_id || !ids.has(String(p.msg_id)))
                );
                WZ.store?.setMessages(messages);
                renderBody({ keepScroll: true });
            } catch {}
        }

        // ── init ───────────────────────────────────────────────────────
        WZ.store?.setConversation(conv, account, []);
        shell();
        reload();
        if (opts.autoSeen !== false) WZ.actions?.markSeen(account, conv);
        if (WZ.subscribeRealtime) {
            unsub = WZ.subscribeRealtime(conv.id, conv.thread_id, {
                refetch: () => refresh(),
                onTyping: (on) => setTyping(on),
            });
        }

        return {
            conv,
            reload,
            refresh,
            destroy() {
                try {
                    unsub?.();
                } catch {}
                container.innerHTML = '';
            },
        };
    };
})();
