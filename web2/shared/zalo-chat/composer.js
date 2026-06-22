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
        // Khoá theo hội thoại lúc bắt đầu đọc file: nếu user đổi hội thoại trước
        // khi FileReader xong → bỏ, tránh đính kèm nhầm thread.
        const convAtStart = store().get().conv;
        for (const file of fileList) {
            if (!file) continue;
            if (file.size > MAX_FILE) {
                WZ.notify(`"${file.name}" vượt 25MB`, 'warning');
                continue;
            }
            const isImg = /^image\//.test(file.type);
            const dataUrl = await readFile(file);
            if (!dataUrl) continue;
            if (store().get().conv !== convAtStart) return; // đã đổi hội thoại
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
            const mentions = _isGroup() ? _buildMentions(text) : [];
            await _ctx.onSendText?.(text, mentions);
        }
        ta.value = '';
        grow(ta);
        store().clearReply();
        renderReplyBar();
        _mentionMap.clear();
        _closeMent();
        ta.focus();
    }

    // Picker câu trả lời nhanh. opts.replaceSlash = true khi mở bằng cách gõ '/' đầu ô
    // (chọn xong THAY nguyên text thay vì nối thêm).
    async function openQuickReplies(anchor, opts) {
        const replaceSlash = !!(opts && opts.replaceSlash);
        const ta = _root.querySelector('.wz-compose-input');
        const insert = (val) => {
            if (!val) return;
            ta.value = replaceSlash ? val : (ta.value ? ta.value + ' ' : '') + val;
            grow(ta);
            ta.focus();
        };
        try {
            const r = await window.ZaloApi.quickReplies(_ctx.account);
            // shape chuẩn từ service: { id, keyword, title }
            const items = (r.items || [])
                .map((q) => ({ keyword: q.keyword || '', title: q.title || q.keyword || '' }))
                .filter((q) => q.title);
            const menu = [
                { label: '➕ Lưu câu trả lời nhanh…', value: '__save__' },
                ...(items.length
                    ? items.map((q) => ({
                          label:
                              (q.keyword ? '/' + q.keyword + ' — ' : '') +
                              String(q.title).slice(0, 40),
                          value: q.title,
                      }))
                    : [{ label: 'Chưa có câu trả lời nhanh', value: '' }]),
            ];
            WZ.openMenu?.(anchor, menu, (val) => {
                if (val === '__save__') return saveQuickReply();
                insert(val);
            });
        } catch (e) {
            WZ.notify('✗ ' + e.message, 'error');
        }
    }

    // Hỏi nội dung + từ khoá rồi lưu câu trả lời nhanh lên Zalo (Popup, fallback prompt).
    async function saveQuickReply() {
        const ta = _root.querySelector('.wz-compose-input');
        const cur = (ta.value || '').replace(/^\/\s*/, '').trim();
        const ask = async (msg, o) =>
            window.Popup?.prompt
                ? await window.Popup.prompt(msg, o || {})
                : window.prompt(msg, (o && o.defaultValue) || '');
        const title = (
            await ask('Nội dung câu trả lời nhanh', {
                defaultValue: cur,
                multiline: true,
                placeholder: 'Nội dung tin sẽ chèn vào ô soạn',
            })
        )?.trim();
        if (!title) return;
        const keyword = (
            await ask('Từ khoá gợi nhớ (vd: chao)', {
                placeholder: 'không dấu, không khoảng trắng',
            })
        )?.trim();
        if (!keyword) return;
        try {
            await window.ZaloApi.addQuickReply({
                accountKey: _ctx.account,
                keyword: keyword.replace(/\s+/g, '_'),
                title,
            });
            WZ.notify('Đã lưu câu trả lời nhanh', 'success');
        } catch (e) {
            WZ.notify('✗ ' + e.message, 'error');
        }
    }

    // ── Ghi âm tin thoại (MediaRecorder) → gửi như tin voice ───────────────────
    let _rec = null; // MediaRecorder
    let _recStream = null;
    let _recChunks = [];
    let _recTimer = null;
    let _recStart = 0;
    let _recSendOnStop = false;

    function _fmtRecTime(ms) {
        const s = Math.floor(ms / 1000);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    function _recBar() {
        return _root.querySelector('.wz-voicebar');
    }
    function _tickRec() {
        const el = _root.querySelector('.wz-voice-time');
        if (el) el.textContent = _fmtRecTime(Date.now() - _recStart);
    }
    async function startVoice() {
        if (_rec) return;
        if (!navigator.mediaDevices?.getUserMedia) {
            WZ.notify('Trình duyệt không hỗ trợ ghi âm', 'warning');
            return;
        }
        try {
            _recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            WZ.notify('Không truy cập được micro (kiểm tra quyền)', 'warning');
            return;
        }
        _recChunks = [];
        _recSendOnStop = false;
        const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(
            (m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)
        );
        _rec = new MediaRecorder(_recStream, mime ? { mimeType: mime } : undefined);
        _rec.ondataavailable = (e) => e.data && e.data.size && _recChunks.push(e.data);
        _rec.onstop = _onRecStop;
        _rec.start();
        _recStart = Date.now();
        _recBar().hidden = false;
        _tickRec();
        _recTimer = setInterval(_tickRec, 250);
    }
    function _stopTracks() {
        clearInterval(_recTimer);
        _recTimer = null;
        if (_recStream) _recStream.getTracks().forEach((t) => t.stop());
        _recStream = null;
    }
    async function _onRecStop() {
        const bar = _recBar();
        if (bar) bar.hidden = true;
        const blob = new Blob(_recChunks, { type: _rec?.mimeType || 'audio/webm' });
        const dur = Date.now() - _recStart;
        _rec = null;
        _stopTracks();
        // Quá ngắn (lỡ tay) hoặc rỗng → bỏ.
        if (!_recSendOnStop || blob.size < 800 || dur < 600) return;
        const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
        const dataUrl = await readFile(blob);
        if (!dataUrl) return;
        _ctx.onSendVoice?.({
            dataUrl,
            blob,
            name: `voice-${dur}ms.${ext}`,
            mime: blob.type,
            duration: dur,
        });
    }
    function stopVoice(send) {
        if (!_rec) return;
        _recSendOnStop = !!send;
        try {
            _rec.stop();
        } catch {
            _stopTracks();
            const bar = _recBar();
            if (bar) bar.hidden = true;
            _rec = null;
        }
    }

    // ── @mention (chỉ NHÓM) — gõ '@' → dropdown thành viên, chọn để tag ─────────
    let _members = null; // cache [{uid,name,avatar}]
    let _membersConvId = null;
    const _mentionMap = new Map(); // 'Tên đầy đủ' -> uid (đã chọn trong phiên soạn)
    let _mentTa = null;
    let _mentBox = null;
    let _mentItems = [];
    let _mentSel = 0;
    let _mentStart = -1; // index của '@' đang gõ trong textarea
    const _normMent = (s) =>
        String(s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase();
    const _isGroup = () => _ctx?.conv?.thread_type === 'group';

    async function _loadMembers() {
        const convId = _ctx?.conv?.id;
        if (!convId) return [];
        if (_members && _membersConvId === convId) return _members;
        try {
            const r = await window.ZaloApi.groupMembers(convId);
            _members = (r.members || []).filter((m) => m && m.name);
            _membersConvId = convId;
        } catch {
            _members = _members && _membersConvId === convId ? _members : [];
        }
        return _members;
    }

    // Ngữ cảnh '@' tại caret → {start, query} | null. '@' phải ở đầu/ sau khoảng trắng.
    function _mentionCtx() {
        const ta = _mentTa;
        if (!ta || ta.selectionStart !== ta.selectionEnd) return null;
        const pos = ta.selectionStart;
        const upto = ta.value.slice(0, pos);
        const at = upto.lastIndexOf('@');
        if (at < 0) return null;
        if (at > 0 && !/\s/.test(upto[at - 1])) return null;
        const query = upto.slice(at + 1);
        if (query.includes('\n') || query.length > 32) return null;
        return { start: at, query };
    }

    function _closeMent() {
        _mentStart = -1;
        _mentItems = [];
        _mentSel = 0;
        if (_mentBox) {
            _mentBox.hidden = true;
            _mentBox.innerHTML = '';
        }
    }

    async function _updateMent() {
        if (!_isGroup()) return _closeMent();
        const ctx = _mentionCtx();
        if (!ctx) return _closeMent();
        const members = await _loadMembers();
        const q = _normMent(ctx.query);
        const items = (q ? members.filter((m) => _normMent(m.name).includes(q)) : members).slice(
            0,
            8
        );
        if (!items.length) return _closeMent();
        _mentStart = ctx.start;
        _mentItems = items;
        if (_mentSel >= items.length) _mentSel = 0;
        _renderMent();
    }

    function _renderMent() {
        if (!_mentBox) return;
        _mentBox.innerHTML = _mentItems
            .map(
                (m, i) =>
                    `<button type="button" class="wz-ment-item${i === _mentSel ? ' sel' : ''}" data-i="${i}">` +
                    WZ.avatarHtml(m.avatar, m.name, 'wz-ment-av') +
                    `<span class="wz-ment-name">${esc(m.name)}</span></button>`
            )
            .join('');
        _mentBox.hidden = false;
        if (window.lucide) lucide.createIcons({ nameAttr: 'data-lucide' });
    }

    function _applyMent(i) {
        const m = _mentItems[i];
        const ta = _mentTa;
        if (!m || !ta || _mentStart < 0) return;
        const token = '@' + m.name;
        const before = ta.value.slice(0, _mentStart);
        const after = ta.value.slice(ta.selectionStart);
        ta.value = before + token + ' ' + after;
        _mentionMap.set(m.name, String(m.uid));
        const caret = (before + token + ' ').length;
        ta.selectionStart = ta.selectionEnd = caret;
        _closeMent();
        grow(ta);
        ta.focus();
    }

    // mentions[] gửi Zalo = re-derive vị trí THẬT trong text cuối (chịu được sửa text).
    function _buildMentions(text) {
        const out = [];
        for (const [name, uid] of _mentionMap) {
            const token = '@' + name;
            let from = 0;
            let idx;
            while ((idx = text.indexOf(token, from)) !== -1) {
                out.push({ uid, pos: idx, len: token.length });
                from = idx + token.length;
            }
        }
        return out;
    }

    WZ.mountComposer = function (rootEl, ctx) {
        _ctx = ctx;
        _root = rootEl;
        rootEl.className = 'wz-composer';
        rootEl.innerHTML = `
            <div class="wz-ment" hidden role="listbox" aria-label="Tag thành viên"></div>
            <div class="wz-reply-bar" hidden></div>
            <div class="wz-tray" hidden></div>
            <div class="wz-compose-row">
                <button class="wz-c-btn" data-act="img" title="Gửi ảnh" aria-label="Gửi ảnh"><i data-lucide="image"></i></button>
                <button class="wz-c-btn" data-act="file" title="Gửi tệp" aria-label="Gửi tệp"><i data-lucide="paperclip"></i></button>
                <textarea class="wz-compose-input" rows="1" placeholder="Nhập tin nhắn… (Enter gửi, Shift+Enter xuống dòng)" aria-label="Soạn tin nhắn"></textarea>
                <button class="wz-c-btn" data-act="quick" title="Trả lời nhanh" aria-label="Trả lời nhanh"><i data-lucide="zap"></i></button>
                <button class="wz-c-btn" data-act="emoji" data-wz-emoji-btn title="Emoji" aria-label="Emoji"><i data-lucide="smile"></i></button>
                <button class="wz-c-btn" data-act="sticker" data-wz-sticker-btn title="Sticker" aria-label="Sticker"><i data-lucide="sticker"></i></button>
                <button class="wz-c-btn" data-act="voice" title="Ghi âm tin thoại" aria-label="Ghi âm tin thoại"><i data-lucide="mic"></i></button>
                <button class="wz-c-send" data-act="send" title="Gửi" aria-label="Gửi"><i data-lucide="send"></i></button>
            </div>
            <div class="wz-voicebar" hidden role="group" aria-label="Đang ghi âm">
                <button class="wz-c-btn wz-voice-cancel" type="button" title="Huỷ ghi âm" aria-label="Huỷ">✕</button>
                <span class="wz-voice-dot" aria-hidden="true"></span>
                <span class="wz-voice-time">0:00</span>
                <span class="wz-voice-hint">Đang ghi âm…</span>
                <button class="wz-c-send wz-voice-stop" type="button" title="Gửi tin thoại" aria-label="Gửi"><i data-lucide="send"></i></button>
            </div>
            <input type="file" class="wz-file-img" accept="image/*" multiple hidden>
            <input type="file" class="wz-file-doc" hidden>
            <div class="wz-drop-overlay" hidden><i data-lucide="upload-cloud"></i> Thả ảnh/tệp để gửi</div>`;
        if (window.lucide) lucide.createIcons({ nameAttr: 'data-lucide' });

        const ta = rootEl.querySelector('.wz-compose-input');
        const fileImg = rootEl.querySelector('.wz-file-img');
        const fileDoc = rootEl.querySelector('.wz-file-doc');

        // @mention: reset per hội thoại + tham chiếu dropdown
        _mentTa = ta;
        _mentBox = rootEl.querySelector('.wz-ment');
        _mentionMap.clear();
        _members = null;
        _membersConvId = null;
        _closeMent();
        if (_rec) stopVoice(false); // huỷ ghi âm còn dở khi đổi hội thoại / re-mount

        ta.addEventListener('input', () => {
            grow(ta);
            _updateMent();
            // Gõ '/' ở đầu ô (Zalo PC style) → mở picker câu trả lời nhanh.
            if (ta.value === '/') openQuickReplies(ta, { replaceSlash: true });
        });
        // caret di chuyển bằng click/phím → cập nhật lại ngữ cảnh @ (khi dropdown đóng)
        ta.addEventListener('click', () => _updateMent());
        ta.addEventListener('keyup', (e) => {
            if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') _updateMent();
        });
        ta.addEventListener('keydown', (e) => {
            // Dropdown @ đang mở → điều hướng + chọn, KHÔNG gửi.
            if (_mentItems.length) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    _mentSel = (_mentSel + 1) % _mentItems.length;
                    _renderMent();
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    _mentSel = (_mentSel - 1 + _mentItems.length) % _mentItems.length;
                    _renderMent();
                    return;
                }
                // Đang gõ IME tiếng Việt: bỏ qua để bộ gõ xác nhận ứng viên, không chọn nhầm @mention.
                if (
                    (e.key === 'Enter' || e.key === 'Tab') &&
                    !(e.isComposing || e.keyCode === 229)
                ) {
                    e.preventDefault();
                    _applyMent(_mentSel);
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    _closeMent();
                    return;
                }
            }
            // Bỏ qua Enter khi đang gõ IME tiếng Việt (isComposing/keyCode 229) → tránh
            // gửi nhầm phần chữ soạn dở khi nhấn Enter chọn ứng viên bộ gõ.
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                doSend();
            }
        });
        // Chọn bằng chuột (mousedown preventDefault → giữ focus ô soạn, không blur).
        _mentBox.addEventListener('mousedown', (e) => {
            const it = e.target.closest('.wz-ment-item');
            if (!it) return;
            e.preventDefault();
            _applyMent(Number(it.dataset.i));
        });
        ta.addEventListener('blur', () => setTimeout(_closeMent, 150));
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
        // ghi âm tin thoại
        rootEl.querySelector('[data-act=voice]').addEventListener('click', startVoice);
        rootEl.querySelector('.wz-voice-stop').addEventListener('click', () => stopVoice(true));
        rootEl.querySelector('.wz-voice-cancel').addEventListener('click', () => stopVoice(false));

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
