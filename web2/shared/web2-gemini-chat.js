// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2GeminiChat — TRỢ LÝ AI HỢP NHẤT 1 khung chat (gộp Chat + Tạo ảnh + Ghép đồ + Ghép mặt).
//
// 1 khung hội thoại làm hết: trò chuyện (cookie máy Bo), tạo ảnh, ghép đồ, ghép mặt — chọn bằng
// CHIP CHẾ ĐỘ trên ô nhập. Đính ảnh (Web2ImagePaste) + prompt mẫu (Web2AiPresets). Mọi giao tiếp
// sidecar đi qua nguồn duy nhất Web2GeminiClient (chat/generate/tryon + fallback Nano Banana paid).
//
// Engine chat = cookie tài khoản Gemini của shop ("máy Bo"). Tunnel tắt → báo "bật máy Bo lên".
// API:  Web2GeminiChat.mount(container) → { destroy() }
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2GeminiChat) return;

    const LS_KEY = 'web2_ai_assistant_chats';
    const MACHINE = (global.Web2GeminiClient && global.Web2GeminiClient.MACHINE_NAME) || 'Bo';

    // Chế độ: chip trên ô nhập. presetKind = loại prompt mẫu khi bấm 📋. minImgs = số ảnh tối thiểu.
    const MODES = {
        chat: { label: 'Chat', icon: '💬', hint: 'Nhắn cho Gemini…', preset: 'role' },
        image: {
            label: 'Tạo ảnh',
            icon: '🎨',
            hint: 'Mô tả ảnh cần tạo… (đính 1 ảnh để chỉnh sửa từ ảnh đó)',
            preset: 'image',
        },
        tryon: {
            label: 'Ghép đồ',
            icon: '👕',
            hint: 'Đính ảnh NGƯỜI (đầu tiên) + ảnh QUẦN ÁO. Mô tả bối cảnh (tuỳ chọn)…',
            preset: 'image',
            minImgs: 2,
        },
        faceswap: {
            label: 'Ghép mặt',
            icon: '🙂',
            hint: 'Đính ảnh MẶT (đầu tiên) + ảnh MODEL. Mô tả (tuỳ chọn)…',
            preset: 'image',
            minImgs: 2,
        },
    };
    const MODE_ORDER = ['chat', 'image', 'tryon', 'faceswap'];

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    }
    function mdToHtml(t) {
        let h = esc(t);
        h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`);
        h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
        h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
        h = h.replace(/\n/g, '<br>');
        return h;
    }
    function loadChats() {
        try {
            return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        } catch (_) {
            return [];
        }
    }
    function saveChats(list) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 40)));
        } catch (_) {}
    }
    function toast(msg, type) {
        try {
            if (global.notificationManager?.show)
                global.notificationManager.show(msg, type || 'info');
        } catch (_) {}
    }

    let _css = false;
    function injectCss() {
        if (_css) return;
        _css = true;
        const st = document.createElement('style');
        st.id = 'web2-gchat-css';
        st.textContent = `
.gch{display:grid;grid-template-columns:230px 1fr;gap:12px;height:100%;min-height:0;box-sizing:border-box}
.gch-side{display:flex;flex-direction:column;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
.gch-new{margin:10px;padding:9px 12px;border:0;border-radius:9px;background:#6366f1;color:#fff;font-weight:700;font-size:.85rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
.gch-new:hover{filter:brightness(1.08)}
.gch-list{flex:1;overflow:auto;padding:0 8px 10px;display:flex;flex-direction:column;gap:3px}
.gch-item{padding:8px 10px;border-radius:8px;cursor:pointer;color:#475569;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px}
.gch-item:hover{background:#f1f5f9}
.gch-item.on{background:#eef2ff;color:#4f46e5;font-weight:600}
.gch-item .x{margin-left:auto;opacity:0;border:0;background:transparent;color:#94a3b8;cursor:pointer;font-size:14px}
.gch-item:hover .x{opacity:1}
.gch-main{display:flex;flex-direction:column;min-height:0;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
.gch-bar{padding:9px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-size:.78rem;color:#64748b;display:flex;align-items:center;gap:8px}
.gch-dot{width:9px;height:9px;border-radius:50%;background:#cbd5e1;flex:0 0 auto}
.gch-dot.on{background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.18)}
.gch-msgs{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.gch-empty{margin:auto;text-align:center;color:#94a3b8;font-size:.86rem;line-height:1.7;max-width:440px}
.gch-empty b{color:#475569}
.gch-row{display:flex;gap:10px;max-width:90%}
.gch-row.me{align-self:flex-end;flex-direction:row-reverse}
.gch-av{width:30px;height:30px;border-radius:8px;flex:0 0 auto;display:grid;place-items:center;font-size:15px;background:#eef2ff}
.gch-row.me .gch-av{background:#dcfce7}
.gch-bub{padding:10px 13px;border-radius:12px;font-size:.88rem;line-height:1.55;color:#0f172a;background:#f1f5f9;word-break:break-word}
.gch-row.me .gch-bub{background:#6366f1;color:#fff}
.gch-bub pre{background:rgba(0,0,0,.06);padding:8px 10px;border-radius:8px;overflow:auto;font-size:.82rem;margin:6px 0}
.gch-row.me .gch-bub pre{background:rgba(255,255,255,.18)}
.gch-bub code{font-family:ui-monospace,Menlo,monospace;font-size:.85em}
.gch-bub img{max-width:280px;width:100%;border-radius:8px;margin-top:6px;display:block;cursor:zoom-in}
.gch-tag{font-size:.68rem;margin-top:5px;opacity:.7;display:inline-block}
.gch-typing{color:#94a3b8;font-size:.8rem;font-style:italic;padding:0 16px 6px;display:flex;align-items:center;gap:8px}
.gch-modes{display:flex;gap:6px;padding:8px 10px 0;flex-wrap:wrap}
.gch-mode{padding:5px 11px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;color:#64748b;font-size:.8rem;font-weight:600;cursor:pointer;transition:.12s;display:flex;align-items:center;gap:5px}
.gch-mode:hover{background:#f1f5f9}
.gch-mode.on{background:#6366f1;color:#fff;border-color:#6366f1}
.gch-composer{border-top:1px solid #e2e8f0;padding:10px;display:flex;flex-direction:column;gap:8px}
.gch-attach{margin:0}
/* belt-suspenders: ẩn "Đang xử lý ảnh…" khi idle dù web2-image-paste.js bản cache cũ (author display:flex đè [hidden]) */
.gch-attach .w2ip-busy[hidden]{display:none!important}
.gch-input-row{display:flex;gap:8px;align-items:flex-end}
.gch-iconbtn{width:42px;height:42px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#64748b;cursor:pointer;flex:0 0 auto;display:grid;place-items:center;transition:background .12s,color .12s}
.gch-iconbtn:hover{background:#f1f5f9;color:#6366f1}
.gch-iconbtn.on{background:#eef2ff;color:#6366f1;border-color:#c7d2fe}
.gch-ta{flex:1;resize:none;min-height:42px;max-height:160px;border:1px solid #cbd5e1;border-radius:11px;padding:10px 12px;font:inherit;font-size:.9rem;outline:none}
.gch-ta:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.14)}
.gch-send{width:42px;height:42px;border:0;border-radius:11px;background:#6366f1;color:#fff;cursor:pointer;flex:0 0 auto;display:grid;place-items:center}
.gch-send:disabled{opacity:.5;cursor:not-allowed}
.gch-warn{margin:10px 14px;padding:9px 11px;border-radius:9px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:.78rem;line-height:1.45}
@media(max-width:760px){.gch{grid-template-columns:1fr}.gch-side{display:none}}`;
        document.head.appendChild(st);
    }

    function mount(container) {
        if (!container) return { destroy() {} };
        injectCss();
        const Client = global.Web2GeminiClient;
        let url = '';
        let chats = loadChats();
        let curId = chats[0]?.id || null;
        let mode = 'chat';

        const wrap = document.createElement('div');
        wrap.className = 'gch';
        const modeChips = MODE_ORDER.map(
            (k) =>
                `<button type="button" class="gch-mode ${k === 'chat' ? 'on' : ''}" data-mode="${k}">${MODES[k].icon} ${MODES[k].label}</button>`
        ).join('');
        wrap.innerHTML = `
            <aside class="gch-side">
                <button type="button" class="gch-new">＋ Cuộc mới</button>
                <div class="gch-list"></div>
            </aside>
            <div class="gch-main">
                <div class="gch-bar"><span class="gch-dot"></span><span class="gch-status">Đang dò máy ${MACHINE}…</span></div>
                <div class="gch-warn" hidden></div>
                <div class="gch-msgs"></div>
                <div class="gch-typing" hidden></div>
                <div class="gch-composer">
                    <div class="gch-modes">${modeChips}</div>
                    <div class="gch-attach" hidden></div>
                    <div class="gch-input-row">
                        <button type="button" class="gch-iconbtn gch-attach-btn" title="Đính ảnh"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg></button>
                        <button type="button" class="gch-iconbtn gch-preset-btn" title="Prompt mẫu có sẵn"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></button>
                        <textarea class="gch-ta" rows="1"></textarea>
                        <button type="button" class="gch-send" title="Gửi"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>
                    </div>
                </div>
            </div>`;
        container.innerHTML = '';
        container.appendChild(wrap);
        const $ = (s) => wrap.querySelector(s);
        const listEl = $('.gch-list');
        const msgsEl = $('.gch-msgs');
        const taEl = $('.gch-ta');
        const sendBtn = $('.gch-send');
        const typingEl = $('.gch-typing');
        const statusEl = $('.gch-status');
        const dotEl = $('.gch-dot');
        const warnEl = $('.gch-warn');
        const attachEl = $('.gch-attach');
        const attachBtn = $('.gch-attach-btn');
        const presetBtn = $('.gch-preset-btn');

        // Đính ảnh — TÁI DÙNG Web2ImagePaste (paste/kéo-thả/nén). Thiếu module → ẩn nút.
        let imgCtrl = null;
        if (global.Web2ImagePaste?.mount) {
            imgCtrl = global.Web2ImagePaste.mount(attachEl, {
                multiple: true,
                maxFiles: 5,
                maxWidth: 1280,
                maxHeight: 1280,
                quality: 0.82,
                compact: true,
                hint: '', // dropzone đã có nhãn — không lặp lại
            });
            attachBtn.addEventListener('click', () => {
                const show = attachEl.hidden;
                attachEl.hidden = !show;
                attachBtn.classList.toggle('on', show);
            });
        } else {
            attachBtn.hidden = true;
        }
        function resetAttach() {
            if (imgCtrl) imgCtrl.clear();
            attachEl.hidden = true;
            attachBtn.classList.remove('on');
        }

        function applyMode(k) {
            mode = k;
            wrap.querySelectorAll('.gch-mode').forEach((b) =>
                b.classList.toggle('on', b.dataset.mode === k)
            );
            taEl.placeholder = MODES[k].hint;
            // Khu đính ảnh: MỞ cho ghép đồ/ghép mặt (cần ảnh) hoặc khi đang có ảnh; ĐÓNG ở chat/tạo
            // ảnh khi chưa có ảnh → đổi chip không để sót UI đính ảnh của chip cũ.
            if (imgCtrl) {
                const want = !!MODES[k].minImgs || imgCtrl.count() > 0;
                attachEl.hidden = !want;
                attachBtn.classList.toggle('on', want);
            }
        }

        function cur() {
            return chats.find((c) => c.id === curId);
        }
        function newChat() {
            const c = {
                id: 'a' + Date.now(),
                title: 'Cuộc mới',
                msgs: [],
                metadata: null,
                account: null,
            };
            chats.unshift(c);
            curId = c.id;
            saveChats(chats);
            renderList();
            renderMsgs();
            taEl.focus();
        }
        function delChat(id) {
            chats = chats.filter((c) => c.id !== id);
            if (curId === id) curId = chats[0]?.id || null;
            saveChats(chats);
            renderList();
            renderMsgs();
        }
        function renderList() {
            listEl.innerHTML = chats
                .map(
                    (c) =>
                        `<div class="gch-item ${c.id === curId ? 'on' : ''}" data-id="${c.id}"><span>${esc(c.title || 'Cuộc mới')}</span><button class="x" data-del="${c.id}" title="Xoá">×</button></div>`
                )
                .join('');
        }
        function bubbleImgs(m) {
            return (m.images || [])
                .map((s) => `<img src="${esc(s)}" alt="" loading="lazy">`)
                .join('');
        }
        function renderMsgs() {
            const c = cur();
            if (!c || !c.msgs.length) {
                msgsEl.innerHTML =
                    '<div class="gch-empty">✨ <b>Trợ lý AI</b> — chọn chế độ ở thanh dưới rồi nhắn.<br>💬 <b>Chat</b> hỏi đáp · 🎨 <b>Tạo ảnh</b> từ mô tả · 👕 <b>Ghép đồ</b> (ảnh người + quần áo) · 🙂 <b>Ghép mặt</b> (ảnh mặt + model).<br>Đính ảnh 🖼️ · prompt mẫu 📋.</div>';
                return;
            }
            msgsEl.innerHTML = c.msgs
                .map((m) => {
                    const tag =
                        m.role === 'model' && m.paid != null
                            ? `<span class="gch-tag">${m.paid ? '🍌 Nano Banana (trả phí)' : '✨ máy ' + MACHINE}</span>`
                            : '';
                    const body = (m.text ? mdToHtml(m.text) : '') + bubbleImgs(m) + tag;
                    return `<div class="gch-row ${m.role === 'user' ? 'me' : ''}"><div class="gch-av">${m.role === 'user' ? '🧑' : '✨'}</div><div class="gch-bub">${body}</div></div>`;
                })
                .join('');
            msgsEl.scrollTop = msgsEl.scrollHeight;
        }

        async function refreshStatus() {
            url = Client ? await Client.discover() : '';
            dotEl.classList.toggle('on', !!url);
            if (url) {
                statusEl.textContent = `🟢 Máy ${MACHINE} đang bật — chat/tạo ảnh bằng tài khoản Gemini của shop.`;
                warnEl.hidden = true;
            } else {
                statusEl.textContent = `⚪ Máy ${MACHINE} đang tắt.`;
                warnEl.hidden = false;
                warnEl.innerHTML = `Chưa kết nối được <b>máy ${MACHINE}</b> — hãy <b>bật máy ${MACHINE} lên</b> 🖥️ (chạy bộ cài máy POS → [4] Gemini). Chat cần máy ${MACHINE}; Tạo ảnh/Ghép đồ vẫn chạy được qua Nano Banana trả phí.`;
            }
        }

        function setTyping(on, label) {
            typingEl.hidden = !on;
            if (on) typingEl.textContent = label || 'Đang xử lý…';
        }

        async function send() {
            if (sendBtn.disabled) return; // đang gửi → chặn double-submit
            if (!Client) return toast('Thiếu Web2GeminiClient (tải lại trang)', 'error');
            const text = taEl.value.trim();
            const imgs = imgCtrl ? imgCtrl.getDataUrls() : [];
            const M = MODES[mode];
            // Validate theo chế độ.
            if (mode === 'chat' && !text) return;
            if (mode === 'image' && !text) return toast('Hãy mô tả ảnh cần tạo', 'warning');
            if (M.minImgs && imgs.length < M.minImgs)
                return toast(
                    mode === 'faceswap'
                        ? 'Cần ít nhất 2 ảnh: ảnh MẶT + ảnh MODEL'
                        : 'Cần ít nhất 2 ảnh: ảnh NGƯỜI + ảnh QUẦN ÁO',
                    'warning'
                );
            // Chat dùng cookie máy Bo → cần máy online. Tạo ảnh/ghép đồ có fallback paid nên không bắt buộc.
            if (mode === 'chat' && !url) {
                await refreshStatus();
                if (!url) {
                    warnEl.hidden = false;
                    return;
                }
            }
            let c = cur();
            if (!c) {
                newChat();
                c = cur();
            }
            const userLabel = text || `(${M.icon} ${M.label})`;
            c.msgs.push({
                role: 'user',
                text: userLabel,
                images: imgs.length ? imgs : undefined,
                mode,
            });
            if (c.msgs.filter((x) => x.role === 'user').length === 1)
                c.title = (text || M.label).slice(0, 40);
            taEl.value = '';
            taEl.style.height = 'auto';
            resetAttach();
            renderMsgs();
            renderList();
            saveChats(chats);
            sendBtn.disabled = true;
            try {
                if (mode === 'chat') {
                    setTyping(true, `Máy ${MACHINE} đang trả lời…`);
                    const j = await Client.chat({
                        url,
                        message: text,
                        metadata: c.metadata,
                        account: c.account,
                        images: imgs,
                    });
                    c.metadata = j.metadata || c.metadata;
                    c.account = j.account || c.account;
                    c.msgs.push({
                        role: 'model',
                        text: j.text || '(không có nội dung)',
                        images: j.images || [],
                    });
                } else if (mode === 'image') {
                    setTyping(true, '🎨 Đang tạo ảnh…');
                    const res = await Client.generate({ url, prompt: text, image: imgs[0] });
                    c.msgs.push({ role: 'model', images: [res.dataUrl], paid: res.paid });
                } else {
                    setTyping(true, mode === 'faceswap' ? '🙂 Đang ghép mặt…' : '👕 Đang ghép đồ…');
                    const prompt = Client.buildTryonPrompt(
                        text,
                        mode === 'faceswap' ? 'faceswap' : 'tryon'
                    );
                    const res = await Client.tryon({ url, prompt, images: imgs });
                    c.msgs.push({ role: 'model', images: [res.dataUrl], paid: res.paid });
                }
                saveChats(chats);
                renderMsgs();
            } catch (e) {
                const msg =
                    e.name === 'TimeoutError' || e.name === 'AbortError'
                        ? 'Quá lâu — thử lại.'
                        : e.message || String(e);
                c.msgs.push({ role: 'model', text: '⚠️ ' + msg });
                saveChats(chats);
                renderMsgs();
                if (/máy|cookie|hết hạn|unauth|account/i.test(msg)) refreshStatus();
            } finally {
                sendBtn.disabled = false;
                setTyping(false);
                taEl.focus();
            }
        }

        // Prompt mẫu: chat → vai trò; tạo ảnh/ghép → thư viện ảnh (fill prompt + đổi chế độ phù hợp).
        function openPresets() {
            const P = global.Web2AiPresets || global.AiPresets;
            if (!P) return toast('Thư viện prompt chưa tải', 'warning');
            if (mode === 'chat' && P.pickRole) {
                // pickRole gọi cb(systemPromptString, roleObj) — tham số 1 LÀ prompt.
                P.pickRole((systemPrompt) => {
                    if (!systemPrompt) return;
                    taEl.value = systemPrompt + '\n\n';
                    taEl.focus();
                });
            } else if (P.pickImage) {
                // pickImage gọi cb(promptString, presetObj) — tham số 1 LÀ prompt, 2 là object.
                P.pickImage((prompt, preset) => {
                    if (!prompt) return;
                    if (preset && preset.cat === 'faceswap') applyMode('faceswap');
                    else if (mode === 'chat') applyMode('image');
                    taEl.value = prompt;
                    taEl.focus();
                });
            }
        }

        // events
        $('.gch-new').addEventListener('click', newChat);
        wrap.querySelectorAll('.gch-mode').forEach((b) =>
            b.addEventListener('click', () => applyMode(b.dataset.mode))
        );
        presetBtn.addEventListener('click', openPresets);
        listEl.addEventListener('click', (e) => {
            const del = e.target.closest('[data-del]');
            if (del) return delChat(del.dataset.del);
            const it = e.target.closest('[data-id]');
            if (it) {
                curId = it.dataset.id;
                renderList();
                renderMsgs();
            }
        });
        msgsEl.addEventListener('click', (e) => {
            const img = e.target.closest('.gch-bub img');
            if (img && global.Web2ImageLightbox?.open) global.Web2ImageLightbox.open(img.src);
        });
        sendBtn.addEventListener('click', send);
        taEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });
        taEl.addEventListener('input', () => {
            taEl.style.height = 'auto';
            taEl.style.height = Math.min(160, taEl.scrollHeight) + 'px';
        });

        applyMode('chat');
        if (!chats.length) newChat();
        else {
            renderList();
            renderMsgs();
        }
        refreshStatus();

        return {
            destroy() {
                try {
                    if (imgCtrl) imgCtrl.destroy?.();
                    container.innerHTML = '';
                } catch (_) {}
            },
        };
    }

    global.Web2GeminiChat = { mount };
})(window);
