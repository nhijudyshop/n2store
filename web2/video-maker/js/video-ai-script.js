// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoAiScript — AI viết KỊCH BẢN video bán hàng từ 1 CHỦ ĐỀ + danh sách SP.
 * Gọi route Gemini RIÊNG của Web 2.0 (/api/web2/ai-script — key WEB2_GEMINI_API_KEY
 * ẩn ở server web2-api, KHÔNG đụng Web 1.0). Trả { narration, scenes:[{title,subtitle}], ai }.
 * Lỗi mạng/Gemini/chưa cấu hình key → tự rơi về kịch bản MẪU để luôn có nội dung.
 *
 *   await Web2VideoAiScript.generate({ topic, products }) -> { narration, scenes, ai }
 *     products: [{ name, price? }]  (1 sản phẩm = 1 cảnh, đúng thứ tự)
 */
(function (global) {
    'use strict';

    function workerBase() {
        return (
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }

    function fmtPrice(n) {
        const num = Number(String(n ?? '').replace(/[^\d.-]/g, ''));
        if (!num) return '';
        return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
    }

    function templateFallback(topic, products) {
        const names = products.map((p) => p.name).filter(Boolean);
        const intro = `Cả nhà ơi, shop vừa có ${topic} cực xinh nè!`;
        const body = names.length ? ` Nổi bật có ${names.slice(0, 3).join(', ')}.` : '';
        const narration = `${intro}${body} Inbox shop để được tư vấn và chốt đơn ngay nha!`;
        const scenes = products.map((p) => ({
            title: p.name || 'Sản phẩm mới',
            subtitle: p.price ? fmtPrice(p.price) : '',
        }));
        return { narration, scenes, ai: false };
    }

    async function generate(opts) {
        const topic = String(opts?.topic || '').trim();
        const products = (opts?.products || []).slice(0, 8);
        if (!products.length) throw new Error('Chưa có sản phẩm để tạo video');
        if (!topic) throw new Error('Hãy nhập chủ đề video');

        const payload = {
            topic,
            products: products.map((p) => ({ name: p.name || '', price: p.price ?? '' })),
        };
        try {
            const resp = await fetch(workerBase() + '/api/web2/ai-script/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(global.Web2Auth?.authHeaders ? global.Web2Auth.authHeaders() : {}),
                },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();
            if (!resp.ok || !data || data.success === false)
                throw new Error((data && data.error) || 'AI lỗi (' + resp.status + ')');
            const scenes = Array.isArray(data.scenes) ? data.scenes : [];
            // đủ scene cho từng SP (thiếu thì bù từ tên SP)
            const out = products.map((p, i) => ({
                title: scenes[i]?.title || p.name || 'Sản phẩm',
                subtitle: scenes[i]?.subtitle || (p.price ? fmtPrice(p.price) : ''),
            }));
            return { narration: String(data.narration || '').trim(), scenes: out, ai: true };
        } catch (e) {
            console.warn('[Web2VideoAiScript] AI lỗi → dùng kịch bản mẫu:', e.message || e);
            return templateFallback(topic, products);
        }
    }

    global.Web2VideoAiScript = { generate, fmtPrice };
})(window);
