// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2GeminiClient — NGUỒN DUY NHẤT gọi sidecar Gemini (máy Bo) qua cookie.
//
// Gom mọi giao tiếp với máy shop "Bo" (sidecar gemini-tryon) + Nano Banana TRẢ PHÍ:
//   • discover()  → URL máy Bo online (localhost:8131 → registry engine=gemini-tryon).
//   • chat()      → /chat (trò chuyện multi-turn cookie) — TEXT dùng FREE máy Bo.
//   • generate()  → ẢNH: PAID (/api/web2-ai/image, nhanh 8-11s) TRƯỚC → hết lượt/lỗi mới FREE máy Bo (/generate, chậm).
//   • tryon()     → GHÉP: PAID trước → hết lượt/lỗi mới FREE máy Bo (/tryon).
//   • health()    → trạng thái account.
//
// THỨ TỰ (chốt 2026-07-01, user): ẢNH ưu tiên PAID vì free (Gemini web cookie qua tunnel) quá chậm
// (text→ảnh >105s, img2img treo) → hết quota/ngày (429) hoặc thiếu quyền (403) mới rơi FREE làm backup.
// TEXT/chat vẫn FREE máy Bo. Dùng chung bởi: tab "Trợ lý AI" (web2-gemini-chat.js) + widget ✨ (web2-tryon.js).
// KHÔNG fork logic — sửa 1 nơi áp dụng mọi nơi.
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2GeminiClient) return;

    const LOCAL = 'http://localhost:8131';
    const FREE_GEN_TIMEOUT_MS = 105000; // ≈ trần cloudflared quick-tunnel (~100s) — chờ lâu hơn vô ích
    const CHAT_TIMEOUT_MS = 180000; // text chat nhanh, để rộng phòng câu dài
    const PAID_TIMEOUT_MS = 120000;
    const MACHINE_NAME = 'Bo'; // tên thân thiện máy shop chạy sidecar (user gọi "máy Bo")
    const OFFLINE_MSG =
        'Chưa kết nối được máy ' + MACHINE_NAME + ' — hãy bật máy ' + MACHINE_NAME + ' lên 🖥️';

    // Prompt try-on/ghép-mặt (1 nguồn — trùng web2-tryon.js cũ, nay gom về đây).
    const TRYON_PROMPT =
        "Take the person from the FIRST image as the fixed model. Dress them in the exact clothing item(s) shown in the following image(s), replacing their original outfit completely. ABSOLUTELY preserve the person's face, facial structure, skin tone, hairstyle, body shape, height proportions and pose from the first image - do not alter their identity in any way. For each garment, faithfully reproduce its true colour, fabric texture, knit/weave, pattern, print, logo, embroidery, buttons, seams, collar and length exactly as in the product image - never invent or simplify details. Make the clothing drape and fit the body naturally with realistic fabric folds, gravity, tension at shoulders and waist, and correct garment proportions. CRITICAL for a seamless composite: match the lighting direction, colour temperature and intensity of the original photo so the garment, skin and face share one consistent light; cast soft, physically-correct contact shadows where fabric meets the body; keep skin tone uniform across face, neck, hands and arms with no colour seam at the neckline or wrists; render hands, fingers, neck and collarbone undistorted and anatomically correct. Full-body framing, photorealistic, sharp focus, natural matte skin texture with visible pores (no plastic smoothing), professional fashion e-commerce photography, high resolution, 4:5 aspect ratio.";
    const FACESWAP_PROMPT =
        "You are given two images. IMAGE 1 is the FACE SOURCE: take this person's face, facial features, expression, skin tone and identity. IMAGE 2 is the TARGET MODEL: keep the model's hair, neck, body, pose, hands, outfit, background and the camera angle exactly as they are. Seamlessly place the face from IMAGE 1 onto the head of the person in IMAGE 2. Match the face to the model's head orientation and viewing angle, blend skin tone and lighting so the face inherits the exact same light direction, color temperature, soft shadows and highlights of IMAGE 2. Preserve the original face shape, eyes, nose, lips, eyebrows and natural facial proportions from IMAGE 1 with maximum accuracy — do not beautify or change the identity. The transition at the jawline, hairline and neck must be invisible. Keep every garment, fold, accessory and the entire scene of IMAGE 2 unchanged. Output one photorealistic, seamless full-resolution image with no visible compositing, no double edges and no blur.";
    function buildTryonPrompt(extra, mode) {
        let p = mode === 'faceswap' ? FACESWAP_PROMPT : TRYON_PROMPT;
        const ex = String(extra || '').trim();
        if (ex) p += ' Scene/details: ' + ex;
        return p;
    }

    function workerBase() {
        return (
            global.WEB2_CONFIG?.WORKER_URL ||
            global.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    const aiApi = () => workerBase() + '/api/web2-ai';
    function authHeaders(json) {
        const h = json ? { 'Content-Type': 'application/json' } : {};
        try {
            Object.assign(h, (global.Web2Auth && global.Web2Auth.authHeaders?.()) || {});
        } catch (_) {}
        return h;
    }

    // Dò máy Bo online: localhost máy này TRƯỚC → registry (máy shop qua tunnel). Trả URL khỏe.
    async function discover() {
        try {
            const r = await fetch(LOCAL + '/health', { signal: AbortSignal.timeout(1500) });
            if (r.ok) {
                const d = await r.json();
                if (d.ok && d.readyCount > 0) return LOCAL;
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

    async function health(url) {
        if (!url) return null;
        try {
            const r = await fetch(url + '/health', { signal: AbortSignal.timeout(5000) });
            return await r.json();
        } catch (_) {
            return null;
        }
    }

    async function chat({ url, message, metadata, account, images }) {
        if (!url) throw new Error(OFFLINE_MSG);
        const r = await fetch(url + '/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                images: images && images.length ? images : undefined,
                metadata: metadata || undefined,
                account: account || undefined,
            }),
            signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
        });
        if (r.status === 404)
            throw new Error(
                'Máy ' +
                    MACHINE_NAME +
                    ' đang chạy BẢN CŨ (chưa hỗ trợ chat) — chạy lại bộ cài máy POS → [4] Gemini.'
            );
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'Chat lỗi');
        return j; // {ok, text, images, metadata, account}
    }

    // Gọi sidecar FREE 1 path (generate/tryon) — fail-fast: timeout KHÔNG retry; chỉ 502-504 retry 1 lần.
    async function _freeCall(url, path, body) {
        let lastErr;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const r = await fetch(url + path, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(FREE_GEN_TIMEOUT_MS),
                });
                if (r.status >= 502 && r.status <= 504) throw new Error('tunnel ' + r.status);
                const j = await r.json();
                if (!j.ok)
                    throw Object.assign(new Error(j.error || 'Máy ' + MACHINE_NAME + ' lỗi'), {
                        _final: true,
                    });
                return j;
            } catch (e) {
                lastErr = e;
                if (e._final) throw e;
                if (e.name === 'TimeoutError' || e.name === 'AbortError') throw e; // tunnel giết → fallback luôn
                if (attempt < 1) await new Promise((r) => setTimeout(r, 600));
            }
        }
        throw lastErr;
    }

    // Nano Banana TRẢ PHÍ (backend /api/web2-ai/image) — path CHÍNH cho ảnh (nhanh 8-11s).
    // Retry 1 lần khi Gemini 503/quá tải (transient) để KHÔNG rơi xuống free chậm vô cớ.
    // 429 (hết lượt/ngày) / 403 (thiếu quyền) → gắn _quota để caller fallback FREE máy Bo.
    async function paidImage({ prompt, images }) {
        let lastErr;
        for (let attempt = 0; attempt < 2; attempt++) {
            const r = await fetch(aiApi() + '/image', {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify({
                    provider: 'gemini',
                    model: 'gemini-2.5-flash-image',
                    prompt,
                    images: images && images.length ? images : undefined,
                }),
                signal: AbortSignal.timeout(PAID_TIMEOUT_MS),
            });
            if (r.status === 401) {
                if (global.Web2Auth?.requireAuth)
                    setTimeout(() => global.Web2Auth.requireAuth(), 1200);
                throw new Error('Phiên Web 2.0 hết hạn — đăng nhập lại.');
            }
            const j = await r.json().catch(() => ({}));
            if (j.ok) return j.url || j.dataUrl;
            lastErr = Object.assign(new Error(j.error || 'Tạo ảnh thất bại'), {
                _quota: r.status === 429 || r.status === 403, // hết lượt/thiếu quyền → fallback FREE
            });
            // Chỉ retry lỗi transient (5xx/quá tải). Hết lượt/quyền/400 → dừng ngay.
            const transient =
                !lastErr._quota &&
                (r.status >= 500 || /unavailable|overload|try again/i.test(j.error || ''));
            if (!transient || attempt >= 1) throw lastErr;
            await new Promise((res) => setTimeout(res, 800));
        }
        throw lastErr;
    }

    // Tạo ảnh: text→ảnh (image rỗng) hoặc img2img. PAID trước (nhanh) → HẾT lượt/lỗi mới FREE máy Bo (chậm, backup).
    // Trả {dataUrl, paid, account, paidError}.
    async function generate({ url, prompt, image, account }) {
        try {
            const dataUrl = await paidImage({ prompt, images: image ? [image] : [] });
            return { dataUrl, paid: true };
        } catch (paidErr) {
            if (!url) throw paidErr; // không có máy Bo → không còn đường lui
            const j = await _freeCall(url, '/generate', {
                prompt,
                image: image || undefined,
                account: account || undefined,
            });
            return {
                dataUrl: j.dataUrl,
                account: j.account,
                paid: false,
                paidError: paidErr.message || String(paidErr),
            };
        }
    }

    // Ghép đồ / ghép mặt: nhiều ảnh. PAID trước → HẾT lượt/lỗi mới FREE máy Bo. Trả {dataUrl, paid, account, paidError}.
    async function tryon({ url, prompt, images, account }) {
        try {
            const dataUrl = await paidImage({ prompt, images });
            return { dataUrl, paid: true };
        } catch (paidErr) {
            if (!url) throw paidErr;
            const j = await _freeCall(url, '/tryon', {
                prompt,
                images,
                account: account || undefined,
            });
            return {
                dataUrl: j.dataUrl,
                account: j.account,
                paid: false,
                paidError: paidErr.message || String(paidErr),
            };
        }
    }

    global.Web2GeminiClient = {
        discover,
        health,
        chat,
        generate,
        tryon,
        paidImage,
        buildTryonPrompt,
        PROMPTS: { TRYON: TRYON_PROMPT, FACESWAP: FACESWAP_PROMPT },
        OFFLINE_MSG,
        MACHINE_NAME,
        FREE_GEN_TIMEOUT_MS,
    };
})(window);
