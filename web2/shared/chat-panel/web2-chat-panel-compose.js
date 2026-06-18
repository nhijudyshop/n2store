// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2ChatPanel — COMPOSE: composer + send paths + attachment + reply +
// emoji/sticker picker + event binding (keydown IME-guard, paste ảnh,
// file/image change, click delegation).
//
// buildCompose(ctx) trả về tập hàm compose dùng chung closure `ctx` với
// render + facade (MOVE-only — hành vi runtime KHÔNG đổi). Cross-ref vào
// render qua ctx.{renderAll, scrollToBottom, loadThread, loadOlder, updateScrollUi}.
// =====================================================================
(function (global) {
    const NS = (global.__Web2ChatPanelNS = global.__Web2ChatPanelNS || {});
    const U = NS.utils;

    NS.buildCompose = function buildCompose(ctx) {
        const { container, mode, flags, st, $ } = ctx;
        const { esc, msgPlain } = U;
        const { pageIdOf, isOutgoing, nameOf } = ctx;

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
                ctx.renderAll();
                if (st.adapter.onConversationUpdate) {
                    conv.snippet = text || '[Tệp]';
                    st.adapter.onConversationUpdate(conv);
                }
            };
            const onSuccess = (res) => {
                st.messages = st.messages.filter((m) => m.id !== tempId);
                // Dedup: realtime setMessages có thể đã push res.sent trước khi onSuccess chạy
                if (res && res.sent && !st.messages.some((m) => m.id === res.sent.id))
                    st.messages.push(res.sent);
                st.isAtBottom = true;
                ctx.renderAll();
            };
            const rollback = () => {
                st.messages = st.messages.filter((m) => m.id !== tempId);
                ctx.renderAll();
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
                ctx.renderAll();
            };
            const onSuccess = (res) => {
                st.messages = st.messages.filter((m) => m.id !== tempId);
                if (res && res.sent) st.messages.push(res.sent);
                st.isAtBottom = true;
                ctx.renderAll();
            };
            const rollback = () => {
                st.messages = st.messages.filter((m) => m.id !== tempId);
                ctx.renderAll();
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
                        // Đang ép cuộn-đáy chủ động (ảnh đang load đẩy height) → bỏ qua
                        // transient "chưa tới đáy", tránh kẹt giữa chừng. Khi thật sự
                        // tới đáy thì nhả cờ luôn.
                        if (st._forceBottom && !atBottom) return;
                        if (atBottom) st._forceBottom = false;
                        st.isAtBottom = atBottom;
                        if (atBottom) st.newCount = 0;
                        ctx.updateScrollUi();
                        if (
                            cont.scrollTop < 80 &&
                            st.hasMore &&
                            !st.loadingOlder &&
                            st.messages.length
                        )
                            ctx.loadOlder();
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
                    // Bỏ qua Enter khi đang gõ IME (Telex/VNI): nhấn Enter để chọn ứng viên
                    // gợi ý của bộ gõ tiếng Việt sinh keydown Enter với isComposing=true
                    // (keyCode 229) → nếu gửi luôn sẽ gửi NHẦM phần chữ đang soạn dở rồi
                    // mới gửi phần đầy đủ → ra 2 tin (vd "ghj" + "7865ghj").
                    if (e.isComposing || e.keyCode === 229) return;
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
            // Reset value sau khi đọc file → chọn LẠI cùng 1 file vẫn fire change (nếu
            // không reset, gỡ đính kèm rồi chọn lại đúng file đó sẽ không kích hoạt).
            if (fi)
                fi.addEventListener('change', (e) => {
                    if (e.target.files[0]) setAttachment(e.target.files[0]);
                    e.target.value = '';
                });
            if (ii)
                ii.addEventListener('change', (e) => {
                    if (e.target.files[0]) setAttachment(e.target.files[0]);
                    e.target.value = '';
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
            else if (a === 'scroll-bottom') ctx.scrollToBottom();
            else if (a === 'refresh') ctx.loadThread();
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

        return {
            doSend,
            sendStickerOptimistic,
            attachKind,
            setAttachment,
            clearAttach,
            setReply,
            clearReply,
            renderPicker,
            togglePicker,
            insertEmoji,
            bindCommon,
            bindInput,
            onOutsideClick,
            onClick,
        };
    };
})(window);
