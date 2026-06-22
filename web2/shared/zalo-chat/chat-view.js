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
        // ── tìm trong hội thoại ──
        let _srchActive = false; // thanh tìm đang mở
        let _srchRaw = ''; // chuỗi tìm hiện tại
        let _srchMatches = []; // [{id, idx}] tin khớp (theo thứ tự)
        let _srchPos = -1; // vị trí khớp đang xem
        let _srchLoadedAll = false; // đã nạp đủ tin để tìm toàn hội thoại
        const _srchNorm = (s) =>
            String(s || '')
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .toLowerCase();
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
        // Feature 2026-06-20: badge read-only hiển thị TÀI KHOẢN Zalo đang dùng để
        // nhắn (= account_key của hội thoại này). Có tag "TK chính" nếu là is_primary;
        // nếu KHÔNG phải primary → đổi màu cảnh báo để user để ý đang dùng TK phụ.
        // Lấy meta từ Web2Zalo.status() (1 lần/lần mở chat). Lỗi → ẩn chip (không hiện sai).
        async function _fillAccChip() {
            const chip = container.querySelector('#wzcvAccChip');
            if (!chip) return;
            const isGroup = conv.thread_type === 'group';
            const nameEl = chip.querySelector('.wzcv-acc-name');
            const dot = chip.firstElementChild;
            const paint = (text, title, c) => {
                if (nameEl) nameEl.textContent = text;
                chip.title = title;
                chip.style.color = c.fg;
                chip.style.background = c.bg;
                chip.style.borderColor = c.bd;
                if (dot && dot.style) dot.style.background = c.fg;
            };
            let meta = null;
            try {
                // ZaloApi luôn có mặt nơi engine chạy (ENGINE_JS[0]); Web2Zalo chỉ ở
                // 1 số trang → ưu tiên ZaloApi.status(), fallback Web2Zalo.status().
                const r =
                    (window.ZaloApi?.status && (await window.ZaloApi.status())) ||
                    (window.Web2Zalo?.status && (await window.Web2Zalo.status())) ||
                    null;
                const accs = (r && (r.accounts || r.data?.accounts)) || [];
                const k = String(account || '');
                const a = accs.find((x) => String(x.accountKey || x.account_key) === k);
                if (a)
                    meta = {
                        label: a.displayName || a.label || 'Zalo',
                        isPrimary: !!(a.isPrimary || a.is_primary),
                        connected: a.status === 'connected',
                    };
            } catch (_) {}

            // NHÓM không gửi được (TK của nhóm đã xoá HOẶC chưa kết nối) → báo ACTIONABLE:
            // Zalo CHỈ cho gửi nhóm bằng tài khoản LÀ THÀNH VIÊN nhóm → phải đăng nhập 1 TK
            // có trong nhóm này (vd nhóm J&T) mới gửi được.
            if (isGroup && (!meta || !meta.connected)) {
                paint(
                    '⚠ Cần đăng nhập TK trong nhóm',
                    (meta
                        ? 'TK Zalo của nhóm này (' + meta.label + ') CHƯA kết nối'
                        : 'TK Zalo của nhóm này không còn') +
                        ' — Zalo chỉ cho gửi tin nhóm bằng tài khoản LÀ THÀNH VIÊN. Vào trang Zalo, đăng nhập 1 tài khoản Zalo CÓ TRONG NHÓM này rồi thử lại.',
                    { fg: '#b45309', bg: '#fff7ed', bd: '#fed7aa' }
                );
                return;
            }
            if (!meta) {
                // 1-1: TK đã xoá → muted (giữ như cũ).
                paint(
                    'TK Zalo không còn',
                    'Tài khoản Zalo của hội thoại này (…' +
                        String(account || '').slice(-6) +
                        ') không còn — vào trang Zalo đăng nhập lại.',
                    { fg: '#9ca3af', bg: '#f3f4f6', bd: '#e5e7eb' }
                );
                return;
            }

            // Có account đang KẾT NỐI → hiện tên TK gửi.
            if (nameEl) nameEl.textContent = meta.label + (isGroup ? ' · nhóm' : '');
            chip.title =
                'Nhắn bằng tài khoản Zalo: ' +
                meta.label +
                (meta.isPrimary
                    ? ' (TK chính)'
                    : isGroup
                      ? ' (TK trong nhóm)'
                      : ' — KHÔNG phải TK chính');
            if (meta.isPrimary) {
                const tag = document.createElement('span');
                tag.textContent = 'TK chính';
                tag.style.cssText =
                    'font-size:9px;font-weight:700;color:#b45309;background:#fff7ed;border:1px solid #fed7aa;border-radius:999px;padding:0 6px;flex-shrink:0';
                chip.appendChild(tag);
            } else if (!isGroup) {
                // 1-1 dùng TK KHÔNG phải chính → cam nhẹ để để ý. (Nhóm dùng TK thành
                // viên là bình thường → giữ xanh, không cảnh báo.)
                chip.style.color = '#b45309';
                chip.style.background = '#fff7ed';
                chip.style.borderColor = '#fed7aa';
            }
        }
        function shell() {
            const name = headName();
            container.innerHTML = `
                <div class="wz-chat-head">
                    ${WZ.avatarHtml(conv.avatar_url, name, 'wz-conv-av' + (conv.thread_type === 'group' ? ' is-group' : ''), 'width:34px;height:34px')}
                    <span class="wz-chat-head-name">${esc(name)}</span>
                    <span id="wzcvAccChip" title="Tài khoản Zalo đang dùng để nhắn khách" style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#0068ff;background:#f0f7ff;border:1px solid #d7e9ff;border-radius:999px;padding:2px 9px;max-width:210px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
                        <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0"></span>
                        <span class="wzcv-acc-name">Zalo</span>
                    </span>
                    <button class="wz-head-btn" id="wzcvSearchBtn" title="Tìm trong hội thoại" aria-label="Tìm trong hội thoại"><i data-lucide="search"></i></button>
                </div>
                <div class="wz-srch-bar" id="wzcvSrchBar" hidden>
                    <i data-lucide="search"></i>
                    <input class="wz-srch-input" id="wzcvSrchInput" type="search" placeholder="Tìm trong hội thoại…" aria-label="Tìm trong hội thoại">
                    <span class="wz-srch-count" id="wzcvSrchCount"></span>
                    <button class="wz-srch-nav" data-srch="prev" title="Trước (Shift+Enter)" aria-label="Khớp trước"><i data-lucide="chevron-up"></i></button>
                    <button class="wz-srch-nav" data-srch="next" title="Sau (Enter)" aria-label="Khớp sau"><i data-lucide="chevron-down"></i></button>
                    <button class="wz-srch-nav" data-srch="close" title="Đóng (Esc)" aria-label="Đóng tìm"><i data-lucide="x"></i></button>
                </div>
                <div class="wz-chat-body" id="wzcvBody"></div>
                <button class="wz-scroll-fab" id="wzcvFab" hidden aria-label="Cuộn xuống cuối"><i data-lucide="chevron-down"></i></button>
                <div id="wzcvCompose"></div>`;
            if (window.lucide) lucide.createIcons();
            _fillAccChip();
            _bindSearch();
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
            // re-render xoá tô tìm kiếm → vẽ lại nếu đang tìm (realtime/refresh khi mở thanh tìm)
            if (_srchActive && _srchRaw) {
                _computeMatches(_srchRaw);
                _paintSearch(_srchRaw);
                _updateSearchCount();
            }
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
        // zca-js cần OBJECT quote thô (SendMessageQuote) để dựng reply thật, KHÔNG chỉ msgId.
        // Trước đây client chỉ gửi {msgId,preview} → backend nhận quote=null → tin gửi đi
        // KHÔNG phải reply (bug "reply tin nhắn"). Dựng lại từ field đã lưu của tin gốc.
        // Cần msg_id server thật; tin optimistic (chưa reconcile) → bỏ quote, gửi thường.
        function buildReplyQuote(m) {
            if (!m || !m.msg_id) return null;
            return {
                content: String(m.content == null ? '' : m.content), // string → qua validate webchat
                msgType: 'webchat',
                propertyExt: null,
                uidFrom: String(m.sender_uid || ''),
                msgId: String(m.msg_id),
                cliMsgId: String(m.cli_msg_id || ''),
                ts: String(m.sent_at || ''),
                ttl: 0,
            };
        }
        async function sendTextRaw(text, reply, tempCli, mentions) {
            try {
                const r = await Api.sendMessage({
                    accountKey: account,
                    threadId: conv.thread_id,
                    text,
                    threadType: conv.thread_type,
                    replyTo: reply
                        ? {
                              msgId: reply.msg_id,
                              preview: reply.content || '',
                              quote: buildReplyQuote(reply),
                          }
                        : null,
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
                if (act === 'delete-me') return doDeleteMe(m);
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
        async function doRecall(m) {
            if (!(await window.Popup.danger('Thu hồi tin nhắn này?', { okText: 'Thu hồi' })))
                return;
            m.recalled = true;
            renderBody({ keepScroll: true });
            WZ.actions.recall(account, conv, m).catch((e) => {
                m.recalled = false;
                renderBody({ keepScroll: true });
                notify('✗ Thu hồi lỗi: ' + e.message, 'error');
            });
        }
        async function doDeleteMe(m) {
            if (
                !(await window.Popup.danger('Xoá tin này ở phía bạn? (người kia vẫn thấy)', {
                    okText: 'Xoá',
                }))
            )
                return;
            const idx = messages.indexOf(m);
            // UI-first: gỡ khỏi danh sách ngay, rollback nếu backend lỗi.
            messages = messages.filter((x) => x !== m);
            WZ.store?.setMessages(messages);
            renderBody({ keepScroll: true });
            WZ.actions.deleteForMe(account, conv, m).catch((e) => {
                if (idx >= 0) messages.splice(idx, 0, m);
                WZ.store?.setMessages(messages);
                renderBody({ keepScroll: true });
                notify('✗ Xoá lỗi: ' + e.message, 'error');
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

        // ── tìm trong hội thoại ─────────────────────────────────────────
        // Nạp đủ tin (1 lần) để tìm toàn hội thoại, không chỉ tin đang hiển thị.
        async function _loadAllForSearch() {
            if (_srchLoadedAll) return;
            let guard = 0;
            while (hasMore && guard < 30) {
                const oldest = messages[0];
                if (!oldest?.sent_at) break;
                let res;
                try {
                    res = await Api.loadHistory(conv.id, {
                        limit: 100,
                        before: oldest.sent_at,
                        beforeId: oldest.id,
                    });
                } catch {
                    break;
                }
                const have = new Set(messages.map((m) => String(m.msg_id || m.id)));
                const fresh = (res.data || []).filter((m) => !have.has(String(m.msg_id || m.id)));
                hasMore = res.hasMore;
                if (!fresh.length) break;
                messages = fresh.concat(messages);
                guard++;
            }
            if (conv.thread_type === 'group' && !backfilledOnce) {
                backfilledOnce = true;
                const r = await Api.backfill(conv.id, 200).catch(() => null);
                if (r && r.added > 0) {
                    try {
                        const res = await Api.messages(
                            conv.id,
                            Math.min(messages.length + r.added + 50, 500)
                        );
                        if ((res.data || []).length >= messages.length) {
                            messages = res.data;
                            hasMore = !!res.hasMore;
                        }
                    } catch {}
                }
            }
            _srchLoadedAll = true;
            WZ.store?.setMessages(messages);
            renderBody({ keepScroll: true });
        }

        function _computeMatches(raw) {
            const q = _srchNorm(raw.trim());
            _srchMatches = [];
            if (q)
                messages.forEach((m, i) => {
                    if (m.recalled) return;
                    if (_srchNorm(m.content || '').includes(q))
                        _srchMatches.push({
                            id: String(m.msg_id || m.cli_msg_id || m.id),
                            idx: i,
                        });
                });
            if (_srchPos >= _srchMatches.length) _srchPos = _srchMatches.length - 1;
        }

        // tô khớp: ring bong bóng + <mark> chữ khớp (best-effort, case-insensitive).
        function _paintSearch(raw) {
            const el = body();
            if (!el) return;
            el.querySelectorAll('.wz-srch-hit,.wz-srch-cur').forEach((x) =>
                x.classList.remove('wz-srch-hit', 'wz-srch-cur')
            );
            el.querySelectorAll('mark.wz-srch-mk').forEach((mk) =>
                mk.replaceWith(document.createTextNode(mk.textContent))
            );
            const ids = new Set(_srchMatches.map((m) => m.id));
            if (!ids.size) return;
            el.querySelectorAll('.wz-msg').forEach((node) => {
                const id = node.dataset.msgid || node.dataset.cli;
                if (!id || !ids.has(String(id))) return;
                node.classList.add('wz-srch-hit');
                const b = node.querySelector('.wz-msg-bubble');
                if (b) _markInline(b, raw.trim());
            });
        }

        function _markInline(bubble, raw) {
            const q = raw.toLowerCase();
            if (!q) return;
            const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT, null);
            const targets = [];
            let n;
            while ((n = walker.nextNode()))
                if (n.nodeValue.toLowerCase().includes(q)) targets.push(n);
            targets.forEach((node) => {
                const s = node.nodeValue;
                const low = s.toLowerCase();
                const frag = document.createDocumentFragment();
                let from = 0;
                let idx;
                while ((idx = low.indexOf(q, from)) !== -1) {
                    if (idx > from) frag.appendChild(document.createTextNode(s.slice(from, idx)));
                    const mk = document.createElement('mark');
                    mk.className = 'wz-srch-mk';
                    mk.textContent = s.slice(idx, idx + q.length);
                    frag.appendChild(mk);
                    from = idx + q.length;
                }
                if (from < s.length) frag.appendChild(document.createTextNode(s.slice(from)));
                node.replaceWith(frag);
            });
        }

        function _updateSearchCount() {
            const c = container.querySelector('#wzcvSrchCount');
            if (c)
                c.textContent = _srchMatches.length
                    ? `${_srchPos + 1}/${_srchMatches.length}`
                    : _srchRaw
                      ? '0'
                      : '';
        }

        function _gotoMatch(pos) {
            if (!_srchMatches.length) return;
            _srchPos = ((pos % _srchMatches.length) + _srchMatches.length) % _srchMatches.length;
            const el = body();
            const m = _srchMatches[_srchPos];
            el?.querySelectorAll('.wz-srch-cur').forEach((x) => x.classList.remove('wz-srch-cur'));
            const node = el?.querySelector(
                `.wz-msg[data-msgid="${CSS.escape(m.id)}"], .wz-msg[data-cli="${CSS.escape(m.id)}"]`
            );
            if (node) {
                node.classList.add('wz-srch-cur');
                node.scrollIntoView({ block: 'center', behavior: 'auto' });
            }
            _updateSearchCount();
        }

        // tìm + tô + (jump: nhảy tới khớp gần đáy nhất). Gọi lại sau render để giữ tô.
        function _runSearch(raw, jump) {
            _srchRaw = raw;
            _computeMatches(raw);
            _paintSearch(raw);
            _updateSearchCount();
            if (jump && _srchMatches.length) _gotoMatch(_srchMatches.length - 1);
        }

        function _clearSearch() {
            _srchRaw = '';
            _srchMatches = [];
            _srchPos = -1;
            _paintSearch('');
            _updateSearchCount();
        }

        function _toggleSearch(open) {
            const bar = container.querySelector('#wzcvSrchBar');
            if (!bar) return;
            _srchActive = !!open;
            bar.hidden = !open;
            const inp = container.querySelector('#wzcvSrchInput');
            if (open) {
                inp?.focus();
                _loadAllForSearch();
            } else if (inp) {
                inp.value = '';
                _clearSearch();
            }
        }

        function _bindSearch() {
            const btn = container.querySelector('#wzcvSearchBtn');
            const bar = container.querySelector('#wzcvSrchBar');
            const inp = container.querySelector('#wzcvSrchInput');
            if (!btn || !bar || !inp) return;
            btn.addEventListener('click', () => _toggleSearch(bar.hidden));
            let t = null;
            inp.addEventListener('input', () => {
                clearTimeout(t);
                t = setTimeout(() => _runSearch(inp.value, true), 200);
            });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    _gotoMatch(e.shiftKey ? _srchPos - 1 : _srchPos + 1);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    _toggleSearch(false);
                }
            });
            bar.addEventListener('click', (e) => {
                const nav = e.target.closest('[data-srch]');
                if (!nav) return;
                const a = nav.dataset.srch;
                if (a === 'next') _gotoMatch(_srchPos + 1);
                else if (a === 'prev') _gotoMatch(_srchPos - 1);
                else if (a === 'close') _toggleSearch(false);
            });
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
