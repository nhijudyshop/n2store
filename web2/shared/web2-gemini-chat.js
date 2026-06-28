// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2GeminiChat — CHAT với Gemini qua COOKIE (sidecar gemini-tryon /chat).
//
// TEXT chat qua cookie ỔN ĐỊNH (khác image-gen flaky). Multi-turn giữ ngữ cảnh bằng metadata
// [cid,rid,rcid] do sidecar trả về; xem được "đoạn hội thoại" (lưu localStorage). Dùng tài khoản
// Gemini của shop (cookie) → free, không tốn API key.
//
// Tự dò máy shop (localhost:8131 → registry engine=gemini-tryon) như Web2Tryon. Tách hẳn khỏi
// ai-chat.js (chat API-key qua backend) → KHÔNG đụng nhau.
//
// API:  Web2GeminiChat.mount(container) → { destroy() }
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2GeminiChat) return;

    const LS_KEY = 'web2_gemini_cookie_chats';
    const GEMINI_LOCAL = 'http://localhost:8131';

    function workerBase() {
        return (
            global.WEB2_CONFIG?.WORKER_URL ||
            global.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    // Dò máy Gemini online (localhost máy này → registry máy shop). Trả URL khỏe (readyCount>0).
    async function discover() {
        try {
            const r = await fetch(GEMINI_LOCAL + '/health', { signal: AbortSignal.timeout(1500) });
            if (r.ok) {
                const d = await r.json();
                if (d.ok && d.readyCount > 0) return GEMINI_LOCAL;
            }
        } catch (_) {}
        try {
            const r = await fetch(
                workerBase() + '/api/web2-vieneu-registry/list?engine=gemini-tryon',
                { signal: AbortSignal.timeout(6000) }
            );
            const d = await r.json();
            const servers = (d.servers || []).filter((s) => s && s.url);
            for (const s of servers) {
                const url = s.url.replace(/\/+$/, '');
                try {
                    const hr = await fetch(url + '/health', { signal: AbortSignal.timeout(4000) });
                    const hd = await hr.json();
                    if (hd.ok && hd.readyCount > 0) return url;
                } catch (_) {}
            }
            if (servers[0]) return servers[0].url.replace(/\/+$/, '');
        } catch (_) {}
        return '';
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    }
    // Render markdown tối giản an toàn: escape trước, rồi **bold**, `code`, ```block```, xuống dòng.
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
.gch-empty{margin:auto;text-align:center;color:#94a3b8;font-size:.86rem;line-height:1.6}
.gch-row{display:flex;gap:10px;max-width:88%}
.gch-row.me{align-self:flex-end;flex-direction:row-reverse}
.gch-av{width:30px;height:30px;border-radius:8px;flex:0 0 auto;display:grid;place-items:center;font-size:15px;background:#eef2ff}
.gch-row.me .gch-av{background:#dcfce7}
.gch-bub{padding:10px 13px;border-radius:12px;font-size:.88rem;line-height:1.55;color:#0f172a;background:#f1f5f9;word-break:break-word}
.gch-row.me .gch-bub{background:#6366f1;color:#fff}
.gch-bub pre{background:rgba(0,0,0,.06);padding:8px 10px;border-radius:8px;overflow:auto;font-size:.82rem;margin:6px 0}
.gch-row.me .gch-bub pre{background:rgba(255,255,255,.18)}
.gch-bub code{font-family:ui-monospace,Menlo,monospace;font-size:.85em}
.gch-bub img{max-width:100%;border-radius:8px;margin-top:6px;display:block}
.gch-typing{color:#94a3b8;font-size:.8rem;font-style:italic;padding:0 16px 6px}
.gch-composer{border-top:1px solid #e2e8f0;padding:10px;display:flex;gap:8px;align-items:flex-end}
.gch-ta{flex:1;resize:none;min-height:42px;max-height:160px;border:1px solid #cbd5e1;border-radius:11px;padding:10px 12px;font:inherit;font-size:.9rem;outline:none}
.gch-ta:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.14)}
.gch-send{width:42px;height:42px;border:0;border-radius:11px;background:#6366f1;color:#fff;font-size:18px;cursor:pointer;flex:0 0 auto}
.gch-send:disabled{opacity:.5;cursor:not-allowed}
.gch-warn{margin:10px 14px;padding:9px 11px;border-radius:9px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:.78rem;line-height:1.45}
@media(max-width:760px){.gch{grid-template-columns:1fr}.gch-side{display:none}}`;
        document.head.appendChild(st);
    }

    function mount(container) {
        if (!container) return { destroy() {} };
        injectCss();
        let url = '';
        let chats = loadChats();
        let curId = chats[0]?.id || null;

        const wrap = document.createElement('div');
        wrap.className = 'gch';
        wrap.innerHTML = `
            <aside class="gch-side">
                <button type="button" class="gch-new">＋ Cuộc mới</button>
                <div class="gch-list"></div>
            </aside>
            <div class="gch-main">
                <div class="gch-bar"><span class="gch-dot"></span><span class="gch-status">Đang dò máy Gemini…</span></div>
                <div class="gch-warn" hidden></div>
                <div class="gch-msgs"></div>
                <div class="gch-typing" hidden>Gemini đang trả lời…</div>
                <div class="gch-composer">
                    <textarea class="gch-ta" rows="1" placeholder="Nhắn cho Gemini… (Enter gửi · Shift+Enter xuống dòng)"></textarea>
                    <button type="button" class="gch-send">↑</button>
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

        function cur() {
            return chats.find((c) => c.id === curId);
        }
        function newChat() {
            const c = {
                id: 'g' + Date.now(),
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
        function renderMsgs() {
            const c = cur();
            if (!c || !c.msgs.length) {
                msgsEl.innerHTML =
                    '<div class="gch-empty">💬 Chat với Gemini bằng tài khoản cookie của shop (FREE).<br>Hỏi gì cũng được — nội dung lưu trong cuộc hội thoại này.</div>';
                return;
            }
            msgsEl.innerHTML = c.msgs
                .map((m) => {
                    const imgs = (m.images || [])
                        .map((s) => `<img src="${esc(s)}" alt="">`)
                        .join('');
                    return `<div class="gch-row ${m.role === 'user' ? 'me' : ''}"><div class="gch-av">${m.role === 'user' ? '🧑' : '✨'}</div><div class="gch-bub">${mdToHtml(m.text)}${imgs}</div></div>`;
                })
                .join('');
            msgsEl.scrollTop = msgsEl.scrollHeight;
        }

        async function refreshStatus() {
            url = await discover();
            dotEl.classList.toggle('on', !!url);
            if (url) {
                statusEl.textContent = '🟢 Máy Gemini FREE đang bật — chat bằng cookie acc shop.';
                warnEl.hidden = true;
            } else {
                statusEl.textContent = '⚪ Chưa thấy máy Gemini free online.';
                warnEl.hidden = false;
                warnEl.innerHTML =
                    'Cần bật <b>sidecar gemini-tryon</b> trên máy shop (bộ cài máy POS → [4] Gemini) + dán cookie. Chat dùng chung máy/cookie với "Ghép đồ".';
            }
        }

        async function send() {
            const text = taEl.value.trim();
            if (!text) return;
            if (!url) {
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
            c.msgs.push({ role: 'user', text });
            if (c.msgs.length === 1) c.title = text.slice(0, 40);
            taEl.value = '';
            taEl.style.height = 'auto';
            renderMsgs();
            renderList();
            saveChats(chats);
            sendBtn.disabled = true;
            typingEl.hidden = false;
            try {
                const r = await fetch(url + '/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        metadata: c.metadata || undefined,
                        account: c.account || undefined,
                    }),
                    signal: AbortSignal.timeout(180000),
                });
                // Máy shop chạy app.py CŨ (chưa có endpoint /chat) → 404 {"detail":"Not Found"}.
                if (r.status === 404) {
                    throw new Error(
                        'Máy Gemini đang chạy BẢN CŨ (chưa hỗ trợ chat). Trên máy shop chạy lại bộ cài máy POS → [4] Gemini để cập nhật.'
                    );
                }
                const j = await r.json();
                if (!j.ok) throw new Error(j.error || 'Chat lỗi');
                c.metadata = j.metadata || c.metadata; // giữ ngữ cảnh multi-turn
                c.account = j.account || c.account; // tiếp tục đúng account
                c.msgs.push({
                    role: 'model',
                    text: j.text || '(không có nội dung)',
                    images: j.images || [],
                });
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
                if (/account|cookie|logout|hết hạn|unauth/i.test(msg)) refreshStatus();
            } finally {
                sendBtn.disabled = false;
                typingEl.hidden = true;
                taEl.focus();
            }
        }

        // events
        $('.gch-new').addEventListener('click', newChat);
        listEl.addEventListener('click', (e) => {
            const del = e.target.closest('[data-del]');
            if (del) {
                delChat(del.dataset.del);
                return;
            }
            const it = e.target.closest('[data-id]');
            if (it) {
                curId = it.dataset.id;
                renderList();
                renderMsgs();
            }
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

        if (!chats.length) newChat();
        else {
            renderList();
            renderMsgs();
        }
        refreshStatus();

        return {
            destroy() {
                try {
                    container.innerHTML = '';
                } catch (_) {}
            },
        };
    }

    global.Web2GeminiChat = { mount };
})(window);
