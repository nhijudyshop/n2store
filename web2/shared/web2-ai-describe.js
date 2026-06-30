// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2AiDescribe — "AI VIẾT MÔ TẢ" 1 NGUỒN DÙNG CHUNG (hình 1).
//
// Nhập NGẮN (vd "áo trắng nữ") → AI FREE mở rộng thành mô tả chi tiết. Dùng cho:
//   • Mô tả ảnh   (image-prompt): trả về prompt TIẾNG ANH để model tạo ảnh đẹp hơn.
//   • Mô tả SP    (product-desc): mô tả bán hàng tiếng Việt cho Kho SP.
//   • Caption FB  (fb-caption):  caption đăng bán Facebook tiếng Việt.
//   • Tự do       (generic):     mở rộng đoạn ngắn bằng ngôn ngữ chỉ định.
//
// Backend: /api/web2-ai/complete (failover gemini→groq→openrouter, xoay key free).
// Frontend KHÔNG giữ key.
//
// API:
//   Web2AiDescribe.describe({seed,kind,lang,extraSystem,signal}) → Promise<string>
//   Web2AiDescribe.attach({button,input,getSeed,kind,lang,onResult}) → detach()
//        (gắn nút + textarea kiểu hình 1: click → mở rộng value → ghi lại vào textarea)
//   Web2AiDescribe.mountPanel(container, {kinds,defaultKind,seed,onResult}) → {destroy}
//        (UI standalone: chọn loại + textarea + nút + kết quả + copy — cho widget ✨)
//   Web2AiDescribe.KINDS → metadata các loại
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2AiDescribe) return;

    // ── Base URL + auth (canonical: WEB2_CONFIG → API_CONFIG → fallback) ──
    function workerUrl() {
        return (
            global.WEB2_CONFIG?.WORKER_URL ||
            global.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    const API = () => workerUrl() + '/api/web2-ai';
    function authHeaders() {
        let token = '';
        try {
            token =
                global.Web2Auth?.getStored?.()?.token ||
                JSON.parse(localStorage.getItem('web2_users_session') || '{}')?.token ||
                '';
        } catch (_) {}
        return { 'Content-Type': 'application/json', ...(token ? { 'x-web2-token': token } : {}) };
    }
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function toast(m, t) {
        try {
            global.notificationManager?.show?.(m, t || 'info');
        } catch (_) {}
    }

    // ── Loại mô tả: system prompt + cấu hình token theo từng nhu cầu ──
    // ⚠ maxTokens phải DƯ cho model suy luận (Gemini 2.5 / GPT-OSS) — chúng đốt 1 phần
    // budget cho "thinking" TRƯỚC khi xuất chữ; đặt sát quá → output bị CẮT GIỮA CÂU
    // (vd "…từ quần tây công" thiếu "sở"). Để rộng tay; output ngắn vẫn tự dừng ở EOS nên
    // KHÔNG tốn thêm — cap chỉ là trần chống runaway.
    const KINDS = {
        'image-prompt': {
            label: '🖼️ Mô tả ảnh (prompt EN)',
            placeholder:
                'Nhập ngắn (vd: áo trắng nữ) rồi bấm ✨ — AI trả prompt tiếng Anh để tạo ảnh đẹp.',
            maxTokens: 1500,
            temperature: 0.8,
            system:
                'You are an expert at writing prompts for AI fashion/product image generation. ' +
                'The user gives a SHORT description (usually in Vietnamese). Expand it into ONE detailed ' +
                'prompt (1-3 sentences) IN ENGLISH: clearly state the product, setting/background, lighting, ' +
                'camera angle, style, and material. Output ONLY the final English prompt — no explanation, ' +
                'no markdown, no extra line breaks, no Vietnamese.',
        },
        'product-desc': {
            label: '🛍️ Mô tả sản phẩm',
            placeholder:
                'Nhập ngắn (vd: đầm voan hoa nhí, tay phồng) rồi bấm ✨ AI viết mô tả bán hàng.',
            maxTokens: 1400,
            temperature: 0.85,
            system:
                'Bạn là copywriter bán hàng thời trang nữ. Người dùng đưa vài từ khoá ngắn về 1 sản phẩm. ' +
                'Viết MÔ TẢ SẢN PHẨM tiếng Việt hấp dẫn, 2–4 câu: nêu chất liệu, kiểu dáng, điểm nổi bật, ' +
                'dịp mặc phù hợp. Văn tự nhiên, KHÔNG sến, KHÔNG bịa thông số (size/giá/khuyến mãi) nếu người ' +
                'dùng không cung cấp. Chỉ trả về phần mô tả — không tiêu đề, không markdown, không emoji thừa.',
        },
        'fb-caption': {
            label: '📣 Caption Facebook',
            placeholder:
                'Nhập ngắn (vd: set đồ đi biển, giảm 20%) rồi bấm ✨ AI viết caption đăng bán.',
            maxTokens: 1500,
            temperature: 0.9,
            system:
                'Bạn là người viết content bán hàng Facebook cho shop thời trang nữ N2Store. Người dùng đưa ' +
                'vài từ khoá ngắn. Viết 1 caption đăng bán hấp dẫn tiếng Việt: 1 hook mở đầu, 2–3 ý điểm nổi ' +
                'bật (gạch đầu dòng + emoji vừa phải), 1 CTA cuối (inbox/đặt hàng). Tự nhiên, KHÔNG sến, KHÔNG ' +
                'bịa giá/SĐT nếu người dùng không cho. Chỉ trả về caption — không tiêu đề, không markdown.',
        },
        generic: {
            label: '✍️ Tự do',
            placeholder: 'Nhập ý ngắn rồi bấm ✨ — AI mở rộng thành đoạn mô tả rõ ràng.',
            maxTokens: 2048,
            temperature: 0.8,
            system: (lang) =>
                'Bạn là trợ lý viết lách. Người dùng đưa nội dung ngắn. Mở rộng thành đoạn mô tả rõ ràng, ' +
                'mạch lạc bằng ' +
                (lang === 'en' ? 'English' : 'tiếng Việt') +
                '. Chỉ trả về đoạn văn — không tiêu đề, không markdown.',
        },
    };

    // ── Core: gọi /complete (failover nhiều provider) → text ──
    async function describe({
        seed,
        kind = 'image-prompt',
        lang = 'vi',
        extraSystem = '',
        signal,
    } = {}) {
        const s = String(seed || '').trim();
        if (!s) throw new Error('Nhập vài chữ trước đã');
        const meta = KINDS[kind] || KINDS.generic;
        let system = typeof meta.system === 'function' ? meta.system(lang) : meta.system;
        if (extraSystem) system += '\n' + extraSystem;
        const r = await fetch(API() + '/complete', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                providers: ['gemini', 'groq', 'openrouter'],
                system,
                messages: [{ role: 'user', content: s }],
                maxTokens: meta.maxTokens || 800,
                temperature: meta.temperature ?? 0.8,
            }),
            signal,
        });
        if (r.status === 401) {
            const e = new Error('Phiên Web 2.0 hết hạn — đăng nhập lại.');
            e.code = 401;
            throw e;
        }
        const j = await r.json().catch(() => ({}));
        if (!j.ok || !j.text) throw new Error(j.error || 'AI không trả nội dung');
        return String(j.text).trim();
    }

    // ── attach: gắn 1 nút + 1 textarea (kiểu hình 1) ──
    // getSeed (tuỳ chọn) trả seed; mặc định = input.value. onResult(text) (tuỳ chọn);
    // mặc định ghi text vào input. Trả về detach() gỡ listener.
    function attach({ button, input, getSeed, kind = 'image-prompt', lang = 'vi', onResult } = {}) {
        if (!button) return () => {};
        const handler = async () => {
            const seed = (getSeed ? getSeed() : input?.value || '').trim();
            if (!seed) return toast('Nhập vài chữ trước (vd: áo trắng nữ)', 'warning');
            const old = button.innerHTML;
            button.disabled = true;
            button.innerHTML = 'Đang viết…';
            try {
                const text = await describe({ seed, kind, lang });
                if (onResult) onResult(text);
                else if (input) {
                    input.value = text;
                    input.focus();
                }
                toast('AI đã viết mô tả ✨', 'success');
            } catch (e) {
                if (e.code === 401 && global.Web2Auth?.requireAuth) {
                    toast('Phiên hết hạn — đăng nhập lại', 'warning');
                    setTimeout(() => global.Web2Auth.requireAuth(), 1200);
                } else toast('Lỗi AI viết mô tả: ' + (e.message || e), 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = old;
                if (global.lucide) global.lucide.createIcons();
            }
        };
        button.addEventListener('click', handler);
        return () => button.removeEventListener('click', handler);
    }

    // ── CSS standalone panel (widget ✨) ──
    function injectCss() {
        if (document.getElementById('web2-ai-describe-css')) return;
        const st = document.createElement('style');
        st.id = 'web2-ai-describe-css';
        st.textContent = `
.w2ad{display:flex;flex-direction:column;gap:10px;padding:14px;height:100%;box-sizing:border-box;overflow:auto}
.w2ad-row{display:flex;gap:8px;align-items:center}
.w2ad-sel{flex:1;border:1px solid #d6dee2;border-radius:9px;padding:7px 9px;font:inherit;font-size:.82rem;color:#334155;background:#fff;cursor:pointer}
.w2ad-ta{width:100%;box-sizing:border-box;resize:vertical;min-height:80px;border:1px solid #d6dee2;border-radius:11px;padding:10px 11px;font:inherit;font-size:.86rem;line-height:1.5;outline:none}
.w2ad-ta:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.14)}
.w2ad-go{border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:11px;padding:10px 14px;font-weight:600;font-size:.86rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px}
.w2ad-go:disabled{opacity:.6;cursor:not-allowed}
.w2ad-out{position:relative;border:1px solid #e6e9ef;background:#f8fafc;border-radius:11px;padding:11px 12px;font-size:.85rem;line-height:1.55;white-space:pre-wrap;color:#0f172a;min-height:40px}
.w2ad-out:empty{display:none}
.w2ad-copy{position:absolute;top:6px;right:6px;border:1px solid #e2e8f0;background:#fff;border-radius:7px;width:26px;height:26px;cursor:pointer;color:#64748b;font-size:13px}
.w2ad-copy:hover{background:#eef2ff;color:#4f46e5}
.w2ad-hint{font-size:.72rem;color:#94a3b8}`;
        document.head.appendChild(st);
    }

    // ── mountPanel: UI standalone đầy đủ (chọn loại + nhập + viết + kết quả) ──
    function mountPanel(container, opts = {}) {
        if (!container) return { destroy() {} };
        injectCss();
        const kinds =
            opts.kinds && opts.kinds.length
                ? opts.kinds
                : [
                      { id: 'product-desc' },
                      { id: 'fb-caption' },
                      { id: 'image-prompt' },
                      { id: 'generic' },
                  ];
        let kind = opts.defaultKind || kinds[0].id;
        const wrap = document.createElement('div');
        wrap.className = 'w2ad';
        wrap.innerHTML = `
            <div class="w2ad-row">
                <select class="w2ad-sel">${kinds
                    .map(
                        (k) =>
                            `<option value="${esc(k.id)}"${k.id === kind ? ' selected' : ''}>${esc(
                                k.label || KINDS[k.id]?.label || k.id
                            )}</option>`
                    )
                    .join('')}</select>
            </div>
            <textarea class="w2ad-ta" rows="3"></textarea>
            <button class="w2ad-go"><span style="font-size:1.05em">✨</span> AI viết mô tả</button>
            <div class="w2ad-hint"></div>
            <div class="w2ad-out" hidden></div>`;
        container.innerHTML = '';
        container.appendChild(wrap);

        const sel = wrap.querySelector('.w2ad-sel');
        const ta = wrap.querySelector('.w2ad-ta');
        const go = wrap.querySelector('.w2ad-go');
        const hint = wrap.querySelector('.w2ad-hint');
        const out = wrap.querySelector('.w2ad-out');
        if (opts.seed) ta.value = opts.seed;
        const syncPlaceholder = () => {
            ta.placeholder = KINDS[kind]?.placeholder || 'Nhập ý ngắn rồi bấm ✨';
            hint.textContent =
                kind === 'image-prompt'
                    ? 'Kết quả là prompt tiếng Anh — dán vào tab Tạo ảnh.'
                    : 'Mô tả tiếng Việt — copy dùng cho SP / bài đăng.';
        };
        syncPlaceholder();
        sel.addEventListener('change', () => {
            kind = sel.value;
            syncPlaceholder();
        });

        let busy = false;
        go.addEventListener('click', async () => {
            if (busy) return;
            const seed = ta.value.trim();
            if (!seed) return toast('Nhập vài chữ trước đã', 'warning');
            busy = true;
            const old = go.innerHTML;
            go.disabled = true;
            go.innerHTML = 'Đang viết…';
            out.hidden = false;
            out.textContent = 'Đang viết…';
            try {
                const text = await describe({ seed, kind });
                out.innerHTML = `<button class="w2ad-copy" title="Sao chép">⧉</button>` + esc(text);
                const cp = out.querySelector('.w2ad-copy');
                cp.addEventListener('click', () =>
                    navigator.clipboard?.writeText(text).then(() => {
                        cp.textContent = '✓';
                        setTimeout(() => (cp.textContent = '⧉'), 1200);
                    })
                );
                if (opts.onResult) opts.onResult(text, kind);
            } catch (e) {
                out.textContent = '⚠️ ' + (e.message || e);
                if (e.code === 401 && global.Web2Auth?.requireAuth)
                    setTimeout(() => global.Web2Auth.requireAuth(), 1200);
            } finally {
                busy = false;
                go.disabled = false;
                go.innerHTML = old;
            }
        });

        return {
            destroy() {
                try {
                    container.innerHTML = '';
                } catch (_) {}
            },
        };
    }

    global.Web2AiDescribe = { describe, attach, mountPanel, KINDS };
})(window);
