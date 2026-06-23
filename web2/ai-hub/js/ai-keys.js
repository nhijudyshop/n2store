// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Trợ lý AI — QUẢN LÝ KEY: hiện trạng provider + key (MASKED) + cooldown, nút test.
 * Key đặt ở env Render (an toàn) → thêm key = set env, KHÔNG nhập trong UI (giấu key tuyệt đối).
 */
(function (global) {
    'use strict';

    const H = () => global.AiHub;

    // Gợi ý env var + nơi lấy key free cho từng provider.
    const ENV_HINT = {
        gemini: {
            env: 'WEB2_GEMINI_API_KEY1, WEB2_GEMINI_API_KEY2…',
            url: 'aistudio.google.com/apikey',
            note: 'Ưu tiên dùng trước · free 1500 req/ngày · cũng tạo ảnh (Nano Banana)',
        },
        groq: {
            env: 'WEB2_GROQ_API_KEY1, WEB2_GROQ_API_KEY2…',
            url: 'console.groq.com/keys',
            note: 'Free 30 req/phút · GPT-OSS, Llama 3.3',
        },
        openrouter: {
            env: 'WEB2_OPENROUTER_API_KEY1, WEB2_OPENROUTER_API_KEY2…',
            url: 'openrouter.ai/keys',
            note: 'Free, KHÔNG cần thẻ · 29 model :free',
        },
    };
    const IMG_HINT = {
        pollinations: 'Không cần key — luôn sẵn sàng.',
        cloudflare:
            'Xoay nhiều account free: WEB2_CLOUDFLARE_ACCOUNT_ID1 + WEB2_CLOUDFLARE_WORKERS_AI_TOKEN1, …2, …3 (mỗi account free 10k/ngày).',
        gemini: 'Dùng chung pool key Gemini ở trên (Nano Banana).',
    };

    function init() {}

    function render() {
        const box = document.getElementById('aihKeys');
        if (!box) return;
        const st = H().state.status;
        if (!st) {
            box.innerHTML = '<p style="color:var(--web2-text-3)">Đang tải…</p>';
            H().loadStatus().then(render);
            return;
        }
        const chat = st.chat?.providers || [];
        const image = st.image?.providers || [];

        box.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <h3 style="margin:0;font-size:1.05rem;color:var(--web2-text)">🔑 Provider Chat</h3>
                <button class="aih-iconbtn" id="aihKeysRefresh" style="margin-left:auto"><i data-lucide="refresh-cw" style="width:14px;height:14px"></i> Làm mới</button>
            </div>
            <div class="aih-keys-grid">
                ${chat.map(chatCard).join('')}
            </div>
            <h3 style="margin:22px 0 0;font-size:1.05rem;color:var(--web2-text)">🎨 Nguồn tạo ảnh</h3>
            <div class="aih-keys-grid">
                ${image.map(imgCard).join('')}
            </div>
            <h3 style="margin:22px 0 0;font-size:1.05rem;color:var(--web2-text)">🎙️ Giọng nói (TTS)</h3>
            <div class="aih-keys-grid" id="aihVoiceGrid">
                <p class="aih-keyhint">Đang tải…</p>
            </div>
            <p class="aih-keyhint" style="margin-top:20px">
                💡 Key giấu ở <b>env Render</b> (an toàn, không lộ ra trình duyệt). Thêm nhiều key
                <code>&lt;PREFIX&gt;1</code>, <code>&lt;PREFIX&gt;2</code>… để <b>xoay tua</b> cộng dồn quota free.
                Sau khi set env trên Render phải <b>deploy lại</b> mới nạp.
            </p>`;

        box.querySelector('#aihKeysRefresh')?.addEventListener('click', () => {
            H().loadStatus().then(render);
        });
        box.querySelectorAll('[data-test]').forEach((b) =>
            b.addEventListener('click', () => testProvider(b.dataset.test, b))
        );
        if (global.lucide) global.lucide.createIcons();
        loadVoice(); // mục Giọng nói (TTS) — read-only, pool riêng theo vendor
    }

    // ── Giọng nói (TTS) — đọc trạng thái 3 vendor (pool RIÊNG, KHÔNG dùng web2-ai-service) ──
    const VOICE = [
        {
            id: 'eleven',
            label: 'ElevenLabs',
            path: '/api/web2-elevenlabs/status',
            env: 'ELEVENLABS_API_KEY1, 2, 3…',
            note: 'TTS cao cấp · sound FX · STT · lọc tạp âm',
        },
        {
            id: 'pro',
            label: 'Giọng AI Pro',
            path: '/api/web2-tts-pro/status',
            env: 'VIVIBE_API_KEY1..5',
            note: 'Giọng đọc chất lượng cao',
        },
        {
            id: 'vieneu',
            label: 'VieNeu (clone giọng)',
            path: '/api/web2-vieneu-registry/list',
            env: '(server máy shop)',
            note: 'Clone giọng Việt — chạy server máy shop + tunnel',
        },
    ];
    function voiceBase() {
        return H()
            .API()
            .replace(/\/api\/web2-ai$/, '');
    }
    async function loadVoice() {
        const grid = document.getElementById('aihVoiceGrid');
        if (!grid) return;
        const base = voiceBase();
        const cards = await Promise.all(
            VOICE.map(async (v) => {
                try {
                    const j = await fetch(base + v.path, { headers: H().authHeaders(false) }).then(
                        (r) => r.json()
                    );
                    let on, info;
                    if (v.id === 'vieneu') {
                        const n = (j.servers || []).length;
                        on = n > 0;
                        info = on ? `${n} máy online` : 'chưa có máy online';
                    } else {
                        on = !!j.configured;
                        info = on ? `${j.keys || 0} key xoay tua` : 'chưa cấu hình';
                    }
                    return voiceCard(v, on, info);
                } catch {
                    return voiceCard(v, false, 'không kết nối được');
                }
            })
        );
        grid.innerHTML = cards.join('');
        if (global.lucide) global.lucide.createIcons();
    }
    function voiceCard(v, on, info) {
        return `<div class="aih-keycard ${on ? '' : 'off'}">
            <div class="aih-keycard-head">
                <span class="aih-dot ${on ? '' : 'cool'}" style="width:10px;height:10px"></span>
                <h4>${H().escapeHtml(v.label)}</h4>
                <span class="aih-pill ${on ? '' : 'warn'}">${H().escapeHtml(info)}</span>
            </div>
            <p class="aih-keyhint">${H().escapeHtml(v.note)} · env <code>${H().escapeHtml(v.env)}</code></p>
        </div>`;
    }

    function chatCard(p) {
        const hint = ENV_HINT[p.id] || {};
        const keys = p.keys || [];
        const keyRows = p.configured
            ? `<div class="aih-keylist">${keys
                  .map(
                      (k) =>
                          `<div class="aih-keyrow"><span class="aih-dot ${k.cooling ? 'cool' : ''}"></span>${H().escapeHtml(k.masked)}${k.cooling ? ` <span style="margin-left:auto;color:var(--web2-warning)">nghỉ ${Math.ceil(k.cooldownMs / 60000)}'</span>` : ''}</div>`
                  )
                  .join('')}</div>`
            : `<p class="aih-keyhint">Chưa có key. Lấy free tại <code>${H().escapeHtml(hint.url || '')}</code> rồi set env <code>${H().escapeHtml(hint.env || '')}</code></p>`;
        return `<div class="aih-keycard ${p.configured ? '' : 'off'}">
            <div class="aih-keycard-head">
                <span class="aih-dot ${p.configured ? '' : 'cool'}" style="width:10px;height:10px"></span>
                <h4>${H().escapeHtml(p.label)}</h4>
                ${p.configured ? `<span class="aih-pill">${p.keyCount} key</span>` : '<span class="aih-pill warn">tắt</span>'}
            </div>
            ${keyRows}
            <p class="aih-keyhint">${H().escapeHtml(hint.note || '')}</p>
            ${p.configured ? `<button class="aih-testbtn" data-test="${p.id}">▶ Test thử</button><div class="aih-testresult" data-result="${p.id}" hidden></div>` : ''}
        </div>`;
    }

    function imgCard(p) {
        return `<div class="aih-keycard ${p.configured ? '' : 'off'}">
            <div class="aih-keycard-head">
                <span class="aih-dot ${p.configured ? '' : 'cool'}" style="width:10px;height:10px"></span>
                <h4>${H().escapeHtml(p.label)}</h4>
                ${p.configured ? '<span class="aih-pill">sẵn sàng</span>' : '<span class="aih-pill warn">cần cấu hình</span>'}
            </div>
            <p class="aih-keyhint">${H().escapeHtml(IMG_HINT[p.id] || '')}</p>
        </div>`;
    }

    async function testProvider(provider, btn) {
        const out = document.querySelector(`[data-result="${provider}"]`);
        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = '⏳ Đang test…';
        try {
            const r = await fetch(H().API() + '/test', {
                method: 'POST',
                headers: H().authHeaders(true),
                body: JSON.stringify({ provider }),
            });
            const j = await r.json();
            const res = j.result || {};
            if (out) {
                out.hidden = false;
                if (res.ok) {
                    out.className = 'aih-testresult ok';
                    out.textContent = `✓ OK (${res.ms}ms) · ${res.model} · "${res.sample || ''}"`;
                } else {
                    out.className = 'aih-testresult fail';
                    out.textContent = `✗ ${res.error || j.error || 'lỗi'}`;
                }
            }
        } catch (e) {
            if (out) {
                out.hidden = false;
                out.className = 'aih-testresult fail';
                out.textContent = '✗ ' + (e.message || e);
            }
        } finally {
            btn.disabled = false;
            btn.textContent = old;
        }
    }

    global.AiKeys = { init, render };
})(window);
