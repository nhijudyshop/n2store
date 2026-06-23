// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Trợ lý AI — CHAT giống ChatGPT: streaming SSE, lịch sử nhiều cuộc (localStorage),
 * chọn provider/model, system prompt, copy/regenerate/stop.
 */
(function (global) {
    'use strict';

    const STORE_KEY = 'web2_ai_chats';
    const MAX_CONVOS = 50;
    const H = () => global.AiHub;

    let convos = [];
    let currentId = null;
    let abortCtrl = null;
    let streaming = false;

    // ── persistence ──
    function load() {
        try {
            convos = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
            if (!Array.isArray(convos)) convos = [];
        } catch {
            convos = [];
        }
    }
    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(convos.slice(0, MAX_CONVOS)));
        } catch {}
    }
    function current() {
        return convos.find((c) => c.id === currentId) || null;
    }
    function newConvo() {
        const st = H().state.status?.chat;
        const c = {
            id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            title: 'Cuộc trò chuyện mới',
            provider: st?.defaultProvider || 'groq',
            model: '',
            system: '',
            messages: [],
            updatedAt: Date.now(),
        };
        convos.unshift(c);
        currentId = c.id;
        save();
        syncBar();
        renderList();
        renderMessages();
    }

    // ── selects (provider/model) ──
    function providers() {
        return H().state.status?.chat?.providers || [];
    }
    function syncBar() {
        const c = current();
        const provSel = document.getElementById('aihProvider');
        const modelSel = document.getElementById('aihModel');
        if (!provSel || !modelSel) return;
        const list = providers();
        provSel.innerHTML = list
            .map((p) => {
                const off = p.configured ? '' : ' — chưa có key';
                return `<option value="${p.id}">${p.label}${off}</option>`;
            })
            .join('');
        if (c) provSel.value = c.provider;
        fillModels(provSel.value, c && c.model);
        updateKeyPill();
    }
    function fillModels(providerId, selModel) {
        const modelSel = document.getElementById('aihModel');
        const p = providers().find((x) => x.id === providerId);
        if (!p) return;
        modelSel.innerHTML = p.models
            .map((m) => `<option value="${m.id}">${m.label}</option>`)
            .join('');
        modelSel.value =
            selModel && p.models.some((m) => m.id === selModel) ? selModel : p.defaultModel;
    }
    function updateKeyPill() {
        const pill = document.getElementById('aihKeyPill');
        const p = providers().find((x) => x.id === document.getElementById('aihProvider')?.value);
        if (!pill || !p) return;
        if (p.configured) {
            pill.hidden = false;
            pill.className = 'aih-pill';
            pill.textContent = `🔑 ${p.keyCount} key`;
        } else {
            pill.hidden = false;
            pill.className = 'aih-pill warn';
            pill.textContent = 'Chưa cấu hình key';
        }
    }

    // ── render conversation list ──
    function renderList() {
        const box = document.getElementById('aihConvoList');
        if (!box) return;
        if (!convos.length) {
            box.innerHTML =
                '<div style="padding:14px;font-size:.8rem;color:var(--web2-text-3)">Chưa có cuộc trò chuyện</div>';
            return;
        }
        box.innerHTML = convos
            .map(
                (
                    c
                ) => `<div class="aih-convo ${c.id === currentId ? 'active' : ''}" data-id="${c.id}">
                    <i data-lucide="message-square" style="width:15px;height:15px"></i>
                    <span class="aih-convo-title">${H().escapeHtml(c.title)}</span>
                    <button class="aih-convo-del" data-del="${c.id}" title="Xoá"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
                </div>`
            )
            .join('');
        box.querySelectorAll('.aih-convo').forEach((el) => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('[data-del]')) return;
                selectConvo(el.dataset.id);
            });
        });
        box.querySelectorAll('[data-del]').forEach((b) => {
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteConvo(b.dataset.del);
            });
        });
        if (global.lucide) global.lucide.createIcons();
    }
    function selectConvo(id) {
        if (streaming) return;
        currentId = id;
        syncBar();
        renderList();
        renderMessages();
    }
    async function deleteConvo(id) {
        const ok = global.Popup
            ? await global.Popup.confirm('Xoá cuộc trò chuyện này?')
            : confirm('Xoá?');
        if (!ok) return;
        convos = convos.filter((c) => c.id !== id);
        if (currentId === id) currentId = convos[0]?.id || null;
        save();
        if (!currentId) newConvo();
        else {
            syncBar();
            renderList();
            renderMessages();
        }
    }

    // ── render messages ──
    const SUGGESTS = [
        'Viết caption bán áo thun nữ cho Facebook, vui tươi, có emoji',
        'Gợi ý 5 tên shop thời trang nữ dễ nhớ',
        'Soạn tin nhắn xin lỗi khách giao hàng trễ, lịch sự',
        'Tóm tắt cách trả lời khách hỏi “còn hàng không” chuyên nghiệp',
    ];
    function renderMessages() {
        const box = document.getElementById('aihMessages');
        const c = current();
        if (!box) return;
        if (!c || !c.messages.length) {
            box.innerHTML = `<div class="aih-empty">
                <div class="aih-empty-icon">🤖</div>
                <h3>Bắt đầu trò chuyện</h3>
                <p>Hỏi bất cứ điều gì — viết caption, soạn tin, brainstorm ý tưởng bán hàng…</p>
                <div class="aih-suggests">${SUGGESTS.map((s) => `<button class="aih-suggest" data-s="${H().escapeHtml(s)}">${H().escapeHtml(s)}</button>`).join('')}</div>
            </div>`;
            box.querySelectorAll('.aih-suggest').forEach((b) =>
                b.addEventListener('click', () => {
                    const ta = document.getElementById('aihInput');
                    ta.value = b.dataset.s;
                    autoSize(ta);
                    updateSendState();
                    ta.focus();
                })
            );
            return;
        }
        box.innerHTML = c.messages.map((m, i) => msgHtml(m, i)).join('');
        wireMsgActions(box);
        if (global.lucide) global.lucide.createIcons();
        box.scrollTop = box.scrollHeight;
    }
    function msgHtml(m, i) {
        const isUser = m.role === 'user';
        const avatar = isUser
            ? '<i data-lucide="user" style="width:17px;height:17px"></i>'
            : '<i data-lucide="sparkles" style="width:17px;height:17px"></i>';
        const body = isUser
            ? '<p>' + H().escapeHtml(m.content).replace(/\n/g, '<br>') + '</p>'
            : H().renderMarkdown(m.content);
        const actions = isUser
            ? ''
            : `<div class="aih-msg-actions">
                    <button class="aih-act" data-copy="${i}"><i data-lucide="copy" style="width:13px;height:13px"></i> Sao chép</button>
                    <button class="aih-act" data-regen="${i}"><i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Tạo lại</button>
               </div>`;
        return `<div class="aih-msg ${isUser ? 'user' : 'assistant'}">
            <div class="aih-avatar">${avatar}</div>
            <div class="aih-bubble">
                <div class="aih-role">${isUser ? 'Bạn' : 'Trợ lý'}</div>
                <div class="aih-content" data-content="${i}">${body}</div>
                ${actions}
            </div>
        </div>`;
    }
    function wireMsgActions(box) {
        box.querySelectorAll('[data-copy]').forEach((b) =>
            b.addEventListener('click', () => {
                const c = current();
                const m = c && c.messages[+b.dataset.copy];
                if (m) {
                    navigator.clipboard?.writeText(m.content);
                    H().toast('Đã sao chép', 'success');
                }
            })
        );
        box.querySelectorAll('[data-regen]').forEach((b) =>
            b.addEventListener('click', () => regenerate(+b.dataset.regen))
        );
    }

    // ── send + stream ──
    function setStreaming(on) {
        streaming = on;
        const send = document.getElementById('aihSend');
        if (!send) return;
        send.classList.toggle('stop', on);
        send.disabled = false;
        send.innerHTML = on
            ? '<i data-lucide="square" style="width:16px;height:16px"></i>'
            : '<i data-lucide="arrow-up"></i>';
        if (global.lucide) global.lucide.createIcons();
        if (!on) updateSendState();
    }
    function updateSendState() {
        const send = document.getElementById('aihSend');
        const ta = document.getElementById('aihInput');
        if (send && !streaming) send.disabled = !ta.value.trim();
    }

    async function send() {
        if (streaming) return stop();
        const ta = document.getElementById('aihInput');
        const text = ta.value.trim();
        if (!text) return;
        let c = current();
        if (!c) {
            newConvo();
            c = current();
        }
        c.provider = document.getElementById('aihProvider').value;
        c.model = document.getElementById('aihModel').value;
        c.messages.push({ role: 'user', content: text });
        if (c.title === 'Cuộc trò chuyện mới') c.title = text.slice(0, 42);
        c.updatedAt = Date.now();
        ta.value = '';
        autoSize(ta);
        save();
        renderList();
        renderMessages();
        await streamAssistant(c);
    }

    async function streamAssistant(c) {
        const box = document.getElementById('aihMessages');
        // chèn assistant element rỗng
        c.messages.push({ role: 'assistant', content: '' });
        const idx = c.messages.length - 1;
        renderMessages();
        const el = box.querySelector(`[data-content="${idx}"]`);
        if (el) el.classList.add('aih-cursor');

        setStreaming(true);
        abortCtrl = new AbortController();
        let acc = '';
        let rafPending = false;
        const paint = () => {
            rafPending = false;
            if (el) {
                el.innerHTML = H().renderMarkdown(acc);
                el.classList.add('aih-cursor');
            }
            box.scrollTop = box.scrollHeight;
        };
        const onDelta = (t) => {
            acc += t;
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(paint);
            }
        };

        let ok = false;
        try {
            ok = await doStream(c, onDelta);
        } catch (e) {
            if (e.name === 'AbortError') ok = !!acc;
            else acc += (acc ? '\n\n' : '') + '⚠️ ' + (e.message || e);
        }
        // finalize
        c.messages[idx].content = acc || '*(không có phản hồi)*';
        c.updatedAt = Date.now();
        save();
        setStreaming(false);
        abortCtrl = null;
        renderMessages();
        if (!ok && !acc) H().toast('AI không phản hồi — kiểm tra key ở tab Quản lý key', 'warning');
    }

    // Đọc SSE từ /chat/stream. Trả true nếu xong sạch. Fallback /chat non-stream nếu stream fail.
    async function doStream(c, onDelta) {
        const body = JSON.stringify({
            provider: c.provider,
            model: c.model,
            system: c.system || undefined,
            // Bỏ assistant placeholder rỗng (đang stream) — filter đã đủ, KHÔNG slice(0,-1)
            // (sẽ chặt nhầm message user). Giữ user + assistant cũ có nội dung làm history.
            messages: c.messages.filter((m) => m.role !== 'assistant' || m.content),
        });
        let res;
        try {
            res = await fetch(H().API() + '/chat/stream', {
                method: 'POST',
                headers: H().authHeaders(true),
                body,
                signal: abortCtrl.signal,
            });
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            return fallback(c, onDelta);
        }
        if (!res.ok || !res.body) return fallback(c, onDelta);

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        let errored = null;
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
                const block = buf.slice(0, i);
                buf = buf.slice(i + 2);
                const ev = /event:\s*(\w+)/.exec(block);
                const dm = /data:\s*(.*)/s.exec(block);
                if (!ev || !dm) continue;
                let data = {};
                try {
                    data = JSON.parse(dm[1]);
                } catch {}
                if (ev[1] === 'delta') onDelta(data.text || '');
                else if (ev[1] === 'error') errored = data;
            }
        }
        if (errored) throw new Error(errored.error || 'Lỗi AI');
        return true;
    }

    async function fallback(c, onDelta) {
        const res = await fetch(H().API() + '/chat', {
            method: 'POST',
            headers: H().authHeaders(true),
            body: JSON.stringify({
                provider: c.provider,
                model: c.model,
                system: c.system || undefined,
                messages: c.messages.filter((m) => m.role !== 'assistant' || m.content),
            }),
            signal: abortCtrl?.signal,
        });
        const j = await res.json();
        if (!j.ok) throw new Error(j.error || 'Lỗi AI');
        onDelta(j.text || '');
        return true;
    }

    function stop() {
        if (abortCtrl) abortCtrl.abort();
    }

    async function regenerate(assistantIdx) {
        if (streaming) return;
        const c = current();
        if (!c) return;
        // cắt bỏ assistant đó (và mọi thứ sau) → còn lại tới user cuối
        c.messages = c.messages.slice(0, assistantIdx);
        save();
        renderMessages();
        await streamAssistant(c);
    }

    // ── system prompt ──
    async function editSystem() {
        const c = current();
        if (!c) return;
        if (!global.Popup) return;
        const v = await global.Popup.prompt(
            'Vai trò / định hướng cho AI (system prompt):',
            c.system || '',
            {
                placeholder: 'VD: Bạn là trợ lý bán hàng thời trang, trả lời ngắn gọn, thân thiện…',
                multiline: true,
            }
        );
        if (v === null) return;
        c.system = String(v).trim();
        save();
        H().toast(c.system ? 'Đã đặt vai trò AI' : 'Đã xoá vai trò', 'success');
    }

    function autoSize(ta) {
        ta.style.height = 'auto';
        ta.style.height = Math.min(180, ta.scrollHeight) + 'px';
    }

    function init() {
        load();
        if (!convos.length) newConvo();
        else currentId = convos[0].id;
        syncBar();
        renderList();
        renderMessages();

        const ta = document.getElementById('aihInput');
        const sendBtn = document.getElementById('aihSend');
        document
            .getElementById('aihNewChat')
            .addEventListener('click', () => !streaming && newConvo());
        document.getElementById('aihSysBtn').addEventListener('click', editSystem);
        document.getElementById('aihProvider').addEventListener('change', (e) => {
            const c = current();
            if (c) c.provider = e.target.value;
            fillModels(e.target.value, '');
            updateKeyPill();
            save();
        });
        document.getElementById('aihModel').addEventListener('change', (e) => {
            const c = current();
            if (c) {
                c.model = e.target.value;
                save();
            }
        });
        sendBtn.addEventListener('click', () => send());
        ta.addEventListener('input', () => {
            autoSize(ta);
            updateSendState();
        });
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });
        updateSendState();

        const hint = document.getElementById('aihStatusHint');
        const st = H().state.status?.chat;
        if (hint) {
            const okN = (st?.providers || []).filter((p) => p.configured).length;
            hint.textContent = okN
                ? `${okN} nhà cung cấp sẵn sàng · model mặc định giống ChatGPT (GPT-OSS)`
                : 'Chưa có key nào — vào tab “Quản lý key” để biết cách thêm';
        }
    }

    global.AiChat = { init };
})(window);
