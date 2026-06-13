// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo chat composer (input đầy đủ).
// =====================================================================
// WZChat.mountComposer(rootEl, ctx) — ô soạn: text, đính kèm ảnh/file, dán
// ảnh, kéo-thả, emoji, sticker, thanh trả lời, quick reply.
// ctx: { conv, account, onSendText(text), onSendMedia(items, caption),
//        onSendFile(item, caption), onSendSticker(sticker) }
// =====================================================================

(function () {
    'use strict';
    const WZ = (window.WZChat = window.WZChat || {});
    const esc = WZ.esc;
    const store = () => WZ.store;
    const MAX_FILE = 25 * 1024 * 1024; // 25MB / file

    let _ctx = null;
    let _root = null;

    function readFile(file) {
        return new Promise((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => resolve(null);
            r.readAsDataURL(file);
        });
    }

    async function addFiles(fileList, kind) {
        for (const file of fileList) {
            if (!file) continue;
            if (file.size > MAX_FILE) {
                WZ.notify(`"${file.name}" vượt 25MB`, 'warning');
                continue;
            }
            const isImg = /^image\//.test(file.type);
            const dataUrl = await readFile(file);
            if (!dataUrl) continue;
            store().addPending({
                file,
                dataUrl,
                name: file.name || (isImg ? 'photo.jpg' : 'file'),
                mime: file.type,
                kind: isImg ? 'image' : 'file',
            });
        }
        renderTray();
    }

    function renderTray() {
        const tray = _root.querySelector('.wz-tray');
        const items = store().getPending();
        if (!items.length) {
            tray.hidden = true;
            tray.innerHTML = '';
            return;
        }
        tray.hidden = false;
        tray.innerHTML = items
            .map((it) =>
                it.kind === 'image'
                    ? `<div class="wz-tray-item" data-id="${it.id}"><img src="${esc(it.dataUrl)}" alt=""><button class="wz-tray-x" data-id="${it.id}" aria-label="Bỏ">✕</button></div>`
                    : `<div class="wz-tray-item wz-tray-file" data-id="${it.id}"><i data-lucide="file"></i><span>${esc(it.name)}</span><button class="wz-tray-x" data-id="${it.id}" aria-label="Bỏ">✕</button></div>`
            )
            .join('');
        if (window.lucide) lucide.createIcons({ nameAttr: 'data-lucide' });
    }

    function renderReplyBar() {
        const bar = _root.querySelector('.wz-reply-bar');
        const t = store().getReplyTarget();
        if (!t) {
            bar.hidden = true;
            bar.innerHTML = '';
            return;
        }
        const who = t.direction === 'out' ? 'Bạn' : t.senderName || 'Khách';
        const preview = t.content || WZ._previewOf?.(t) || '[Đính kèm]';
        bar.hidden = false;
        bar.innerHTML = `<span class="wz-reply-bar-bar"></span>
            <div class="wz-reply-bar-body"><b>Trả lời ${esc(who)}</b><span>${esc(String(preview).slice(0, 80))}</span></div>
            <button class="wz-reply-bar-x" aria-label="Huỷ trả lời">✕</button>`;
        bar.querySelector('.wz-reply-bar-x').addEventListener('click', () => {
            store().clearReply();
            renderReplyBar();
        });
    }

    function grow(ta) {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    }

    async function doSend() {
        const ta = _root.querySelector('.wz-compose-input');
        const text = ta.value.trim();
        const pending = store().getPending();
        if (!pending.length && !text) return;

        if (pending.length) {
            const imgs = pending.filter((p) => p.kind === 'image');
            const files = pending.filter((p) => p.kind === 'file');
            if (imgs.length) await _ctx.onSendMedia?.(imgs, text);
            for (const f of files) await _ctx.onSendFile?.(f, '');
            store().clearPending();
            renderTray();
        } else if (text) {
            await _ctx.onSendText?.(text);
        }
        ta.value = '';
        grow(ta);
        store().clearReply();
        renderReplyBar();
        ta.focus();
    }

    async function openQuickReplies(anchor) {
        try {
            const r = await window.ZaloApi.quickReplies(_ctx.account);
            const items = (r.items || []).map((q) => ({
                keyword: q.keyword || q.title || '',
                msg: q.message || q.title || q.keyword || '',
            }));
            WZ.openMenu?.(
                anchor,
                items.length
                    ? items.map((q) => ({
                          label:
                              (q.keyword ? '/' + q.keyword + ' — ' : '') +
                              String(q.msg).slice(0, 40),
                          value: q.msg,
                      }))
                    : [{ label: 'Chưa có câu trả lời nhanh', value: '' }],
                (val) => {
                    if (!val) return;
                    const ta = _root.querySelector('.wz-compose-input');
                    ta.value = (ta.value ? ta.value + ' ' : '') + val;
                    grow(ta);
                    ta.focus();
                }
            );
        } catch (e) {
            WZ.notify('✗ ' + e.message, 'error');
        }
    }

    WZ.mountComposer = function (rootEl, ctx) {
        _ctx = ctx;
        _root = rootEl;
        rootEl.className = 'wz-composer';
        rootEl.innerHTML = `
            <div class="wz-reply-bar" hidden></div>
            <div class="wz-tray" hidden></div>
            <div class="wz-compose-row">
                <button class="wz-c-btn" data-act="img" title="Gửi ảnh" aria-label="Gửi ảnh"><i data-lucide="image"></i></button>
                <button class="wz-c-btn" data-act="file" title="Gửi tệp" aria-label="Gửi tệp"><i data-lucide="paperclip"></i></button>
                <textarea class="wz-compose-input" rows="1" placeholder="Nhập tin nhắn… (Enter gửi, Shift+Enter xuống dòng)" aria-label="Soạn tin nhắn"></textarea>
                <button class="wz-c-btn" data-act="quick" title="Trả lời nhanh" aria-label="Trả lời nhanh"><i data-lucide="zap"></i></button>
                <button class="wz-c-btn" data-act="emoji" data-wz-emoji-btn title="Emoji" aria-label="Emoji"><i data-lucide="smile"></i></button>
                <button class="wz-c-btn" data-act="sticker" data-wz-sticker-btn title="Sticker" aria-label="Sticker"><i data-lucide="sticker"></i></button>
                <button class="wz-c-send" data-act="send" title="Gửi" aria-label="Gửi"><i data-lucide="send"></i></button>
            </div>
            <input type="file" class="wz-file-img" accept="image/*" multiple hidden>
            <input type="file" class="wz-file-doc" hidden>
            <div class="wz-drop-overlay" hidden><i data-lucide="upload-cloud"></i> Thả ảnh/tệp để gửi</div>`;
        if (window.lucide) lucide.createIcons({ nameAttr: 'data-lucide' });

        const ta = rootEl.querySelector('.wz-compose-input');
        const fileImg = rootEl.querySelector('.wz-file-img');
        const fileDoc = rootEl.querySelector('.wz-file-doc');

        ta.addEventListener('input', () => grow(ta));
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                doSend();
            }
        });
        // dán ảnh
        ta.addEventListener('paste', (e) => {
            const imgs = [...(e.clipboardData?.items || [])]
                .filter((i) => i.type.startsWith('image/'))
                .map((i) => i.getAsFile())
                .filter(Boolean);
            if (imgs.length) {
                e.preventDefault();
                addFiles(imgs, 'image');
            }
        });

        rootEl.querySelector('[data-act=img]').addEventListener('click', () => fileImg.click());
        rootEl.querySelector('[data-act=file]').addEventListener('click', () => fileDoc.click());
        fileImg.addEventListener('change', () => {
            addFiles([...fileImg.files], 'image');
            fileImg.value = '';
        });
        fileDoc.addEventListener('change', () => {
            addFiles([...fileDoc.files], 'file');
            fileDoc.value = '';
        });

        rootEl.querySelector('[data-act=send]').addEventListener('click', doSend);
        rootEl
            .querySelector('[data-act=quick]')
            .addEventListener('click', (e) => openQuickReplies(e.currentTarget));
        rootEl.querySelector('[data-act=emoji]').addEventListener('click', (e) =>
            WZ.openEmojiPicker(e.currentTarget, (em) => {
                const pos = ta.selectionStart || ta.value.length;
                ta.value = ta.value.slice(0, pos) + em + ta.value.slice(pos);
                ta.focus();
                ta.selectionStart = ta.selectionEnd = pos + em.length;
                grow(ta);
            })
        );
        rootEl
            .querySelector('[data-act=sticker]')
            .addEventListener('click', (e) =>
                WZ.openStickerPicker(e.currentTarget, _ctx.account, (s) => _ctx.onSendSticker?.(s))
            );

        // tray remove
        rootEl.querySelector('.wz-tray').addEventListener('click', (e) => {
            const x = e.target.closest('.wz-tray-x');
            if (x) {
                store().removePending(Number(x.dataset.id));
                renderTray();
            }
        });

        // drag-drop
        const overlay = rootEl.querySelector('.wz-drop-overlay');
        let dragCt = 0;
        rootEl.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (++dragCt === 1) overlay.hidden = false;
        });
        rootEl.addEventListener('dragover', (e) => e.preventDefault());
        rootEl.addEventListener('dragleave', () => {
            if (--dragCt <= 0) {
                dragCt = 0;
                overlay.hidden = true;
            }
        });
        rootEl.addEventListener('drop', (e) => {
            e.preventDefault();
            dragCt = 0;
            overlay.hidden = true;
            const files = [...(e.dataTransfer?.files || [])];
            if (files.length) addFiles(files, 'mixed');
        });

        renderReplyBar();
        renderTray();
        WZ.composer = {
            setReply(m) {
                store().setReplyTarget(m);
                renderReplyBar();
                ta.focus();
            },
            reset() {
                ta.value = '';
                grow(ta);
                store().clearPending();
                store().clearReply();
                renderTray();
                renderReplyBar();
            },
            focus: () => ta.focus(),
            refresh() {
                renderTray();
                renderReplyBar();
            },
        };
        return WZ.composer;
    };
})();
