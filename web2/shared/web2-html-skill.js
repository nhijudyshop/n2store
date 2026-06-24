// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — sinh HTML đẹp từ data bằng AI free.
/**
 * Web2HtmlSkill — "skill HTML generator" 1 NGUỒN DÙNG CHUNG (ý tưởng mượn từ
 * nexu-io/html-anything, KHÔNG dùng code của họ). Sinh HTML/card/bài đăng/báo cáo
 * đẹp từ data bằng AI FREE sẵn có (Gemini/Groq/OpenRouter qua /api/web2-ai/chat/stream),
 * kèm luật chống "AI slop". Stream realtime vào iframe sandbox, export PNG/HTML.
 *
 * KHÔNG cần backend mới (tái dùng /chat/stream). KHÔNG cần Render deploy.
 *
 * API:
 *   Web2HtmlSkill.skills()                          → [{id,label,emoji,surface,size,hint}]
 *   Web2HtmlSkill.skill(id)                         → meta 1 skill
 *   Web2HtmlSkill.generate({skillId,data,onDelta,signal,extra}) → Promise<htmlString>
 *   Web2HtmlSkill.cleanHtml(raw)                    → bỏ ```fences / text thừa
 *   Web2HtmlSkill.renderToIframe(iframeEl, html)    → srcdoc sandbox
 *   Web2HtmlSkill.exportPng(iframeEl, filename)     → html2canvas (nếu có) → tải PNG
 *   Web2HtmlSkill.exportHtml(html, filename)        → tải .html
 *
 * Thêm skill mới = thêm 1 phần tử vào mảng SKILLS (drop-in).
 */
(function (global) {
    'use strict';

    // ── Base URL + auth (canonical: WEB2_CONFIG → API_CONFIG → fallback) ──
    function workerUrl() {
        return (
            global.WEB2_CONFIG?.WORKER_URL ||
            global.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
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

    // ── Luật chống "AI slop" — chèn vào MỌI skill (mượn ý từ huashu-design) ──
    const ANTI_SLOP = [
        'Bạn là designer web cao cấp. CHỈ trả về MỘT tài liệu HTML hoàn chỉnh bắt đầu bằng <!doctype html>.',
        'TUYỆT ĐỐI KHÔNG dùng markdown, KHÔNG ```fences, KHÔNG giải thích — chỉ HTML thuần.',
        'BẮT BUỘC: ĐẶT TOÀN BỘ nội dung hiển thị trong <body> — TUYỆT ĐỐI KHÔNG để <body> rỗng. Định nghĩa CSS xong PHẢI viết đầy đủ markup. Viết HẾT tài liệu, KHÔNG cắt giữa chừng, đóng đủ </body></html>.',
        'CSS để inline trong 1 thẻ <style>. KHÔNG gọi JS/CDN ngoài (offline-safe), trừ Google Fonts.',
        'KỶ LUẬT THIẾT KẾ (bắt buộc):',
        '- Font: "Be Vietnam Pro", system-ui, sans-serif (chữ tiếng Việt phải đẹp, đủ dấu).',
        '- Lưới 8px: mọi padding/margin/gap/size là bội số của 8 (8/16/24/32…).',
        '- Tương phản chữ ≥ 4.5:1. KHÔNG dùng #000 hay #fff thuần — dùng nền #FAFAF8 / chữ #14181F.',
        '- Phân cấp rõ bằng độ lớn (scale contrast), KHÔNG để mọi chữ cùng cỡ.',
        '- Bo góc mềm (12–24px) + shadow nhẹ; tránh viền cứng khắp nơi.',
        '- 1 màu nhấn chủ đạo dùng tiết chế (CTA/giá/badge), không loè loẹt.',
        '- DÙNG ĐÚNG dữ liệu người dùng đưa (tên/giá/SĐT/số liệu THẬT). TUYỆT ĐỐI KHÔNG bịa, KHÔNG lorem ipsum.',
        '- Nếu thiếu ảnh thì dùng khối nền gradient/placeholder thẩm mỹ, KHÔNG chèn URL ảnh giả.',
    ].join('\n');

    // ── Khung canvas chuẩn cho từng "bề mặt" (px) ──
    const SIZES = {
        'fb-post': { w: 1080, h: 1350, label: '1080×1350 (FB/IG dọc)' },
        square: { w: 1080, h: 1080, label: '1080×1080 (vuông)' },
        a4: { w: 794, h: 1123, label: 'A4 dọc (96dpi)' },
        a4land: { w: 1123, h: 794, label: 'A4 ngang' },
        card: { w: 1080, h: 1350, label: '1080×1350 (card SP)' },
    };

    // ── SKILLS (drop-in: thêm phần tử là có skill mới) ──
    const SKILLS = [
        {
            id: 'fb-sale-post',
            label: 'Bài đăng FB bán hàng',
            emoji: '🛍️',
            surface: 'fb-post',
            hint: 'Dán tên SP, giá, mô tả ngắn, khuyến mãi, SĐT/đặt hàng… (mỗi dòng 1 ý hoặc JSON).',
            instruction:
                'Tạo MỘT poster bài đăng bán hàng cho Facebook/livestream (khung 1080×1350). Bố cục: vùng ảnh/visual sản phẩm phía trên (gradient nếu thiếu ảnh), tên sản phẩm nổi bật, GIÁ to + badge khuyến mãi nếu có, 2–4 ý mô tả/ưu điểm dạng gạch đầu dòng có icon, và 1 dải CTA cuối (SĐT/inbox/đặt hàng). Giọng bán hàng VN tự nhiên, hấp dẫn nhưng KHÔNG sến.',
        },
        {
            id: 'product-card-rich',
            label: 'Card sản phẩm (AI layout)',
            emoji: '🪪',
            surface: 'card',
            hint: 'Dữ liệu 1 sản phẩm (tên, giá, ảnh, mã, ghi chú). Dùng cho trang Product Card.',
            instruction:
                'Tạo MỘT card sản phẩm sang trọng (khung 1080×1350) để in/đăng. Gồm: khối ảnh sản phẩm lớn (object-fit cover, bo góc), tên sản phẩm, giá nổi bật, mã SP nhỏ, badge (mới/sale) nếu có, và logo/tên shop ở góc. Thiết kế tối giản, cao cấp, nhiều khoảng trắng.',
        },
        {
            id: 'price-list',
            label: 'Bảng giá nhiều SP',
            emoji: '🧾',
            surface: 'fb-post',
            hint: 'Danh sách nhiều sản phẩm + giá (mỗi dòng "Tên - Giá" hoặc dán bảng/CSV).',
            instruction:
                'Tạo MỘT bảng giá đẹp (khung 1080×1350) liệt kê nhiều sản phẩm. Mỗi dòng: tên SP bên trái, giá bên phải căn lề, kẻ phân cách mảnh, xen kẽ nền nhẹ cho dễ đọc. Có tiêu đề shop + ngày áp dụng nếu người dùng cung cấp. Nhóm theo loại nếu data có nhóm.',
        },
        {
            id: 'voucher-card',
            label: 'Card voucher / khuyến mãi',
            emoji: '🎟️',
            surface: 'square',
            hint: 'Nội dung ưu đãi: % giảm / số tiền, mã code, điều kiện, hạn dùng.',
            instruction:
                'Tạo MỘT card voucher/khuyến mãi (khung 1080×1080) bắt mắt: con số ưu đãi CỰC TO (vd "GIẢM 30%"), mã code trong khung nét đứt dễ đọc, điều kiện áp dụng + hạn dùng cỡ nhỏ, tên shop. Phong cách lễ hội nhưng vẫn sạch.',
        },
        {
            id: 'data-report',
            label: 'Báo cáo từ data (CSV)',
            emoji: '📊',
            surface: 'a4',
            hint: 'Dán CSV/bảng số (doanh thu, tồn kho, đơn…). AI tự tính tổng + vẽ chart CSS.',
            instruction:
                'Tạo MỘT báo cáo dữ liệu (khung A4 dọc) từ bảng số người dùng dán vào. Gồm: tiêu đề báo cáo, 3–4 thẻ KPI (tổng/trung bình/lớn nhất… tính TỪ data thật), 1 biểu đồ cột bằng CSS thuần (KHÔNG dùng thư viện), và bảng số liệu gọn. Mọi con số phải tính đúng từ data đưa vào; KHÔNG bịa số.',
        },
    ];

    function skills() {
        return SKILLS.map((s) => ({
            id: s.id,
            label: s.label,
            emoji: s.emoji,
            surface: s.surface,
            size: SIZES[s.surface] || SIZES.square,
            hint: s.hint,
        }));
    }
    function skill(id) {
        return SKILLS.find((s) => s.id === id) || null;
    }

    // ── Build system + user message cho 1 skill ──
    function buildMessages(skillId, data, extra) {
        const sk = skill(skillId);
        if (!sk) throw new Error('Skill không tồn tại: ' + skillId);
        const size = SIZES[sk.surface] || SIZES.square;
        const system =
            ANTI_SLOP +
            '\n\nKHUNG CANVAS: phần tử gốc <body> (hoặc 1 div bọc) phải đúng ' +
            `${size.w}px × ${size.h}px (width/height cố định, overflow hidden), nền đẹp, không lề trắng dư.`;
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        const userMsg =
            `NHIỆM VỤ: ${sk.instruction}\n` +
            (extra ? `YÊU CẦU THÊM: ${extra}\n` : '') +
            `\nDỮ LIỆU NGƯỜI DÙNG (dùng đúng, không bịa):\n${dataStr}\n\n` +
            'Trả về DUY NHẤT tài liệu HTML hoàn chỉnh.';
        return { system, messages: [{ role: 'user', content: userMsg }] };
    }

    // ── Bỏ ```html fences / text thừa quanh HTML ──
    function cleanHtml(raw) {
        let s = String(raw || '').trim();
        const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
        if (fence) s = fence[1].trim();
        const i = s.search(/<!doctype html|<html[\s>]/i);
        if (i > 0) s = s.slice(i);
        return s.trim();
    }

    // HTML "rỗng" = không có markup hiển thị trong <body> (model yếu/cụt).
    function bodyIsEmpty(html) {
        const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html || '');
        const inner = m ? m[1] : html || '';
        // bỏ comment + tag → còn text/markup thật?
        const stripped = inner
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<[^>]+>/g, '')
            .trim();
        const hasEl =
            /<(div|section|main|article|table|ul|ol|h1|h2|h3|p|span|img|header|footer)[\s>]/i.test(
                inner
            );
        return !hasEl && stripped.length < 8;
    }

    // ── Stream sinh HTML qua /chat/stream (free AI). Tự retry 1 lần nếu body rỗng. ──
    // Thứ tự failover provider — LUÔN dùng STREAM (/chat/stream) để tránh timeout
    // 15s của worker với /chat non-stream khi HTML dài. Mỗi attempt thử 1 provider.
    const PROVIDER_ORDER = ['gemini', 'groq', 'openrouter'];

    async function generate({ skillId, data, onDelta, signal, extra, _attempt = 0 } = {}) {
        const provider = PROVIDER_ORDER[Math.min(_attempt, PROVIDER_ORDER.length - 1)];
        const nudge =
            _attempt > 0
                ? ' (LẦN TRƯỚC LỖI/BODY RỖNG — lần này BẮT BUỘC viết ĐẦY ĐỦ markup nội dung trong <body>.)'
                : '';
        const { system, messages } = buildMessages(skillId, data, (extra || '') + nudge);
        const next = (reason) => {
            if (_attempt < PROVIDER_ORDER.length - 1) {
                return generate({ skillId, data, onDelta, signal, extra, _attempt: _attempt + 1 });
            }
            throw new Error(reason || 'AI chưa tạo được nội dung — thử lại sau ít phút.');
        };

        let res;
        try {
            res = await fetch(workerUrl() + '/api/web2-ai/chat/stream', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    provider,
                    system,
                    messages,
                    maxTokens: 8000,
                    temperature: 0.6,
                }),
                signal,
            });
        } catch (e) {
            if (e?.name === 'AbortError') throw e;
            return next('Lỗi mạng: ' + (e.message || e));
        }
        if (!res.ok || !res.body) return next('HTTP ' + res.status);

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        let full = '';
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
                let d = {};
                try {
                    d = JSON.parse(dm[1]);
                } catch {}
                if (ev[1] === 'delta') {
                    full += d.text || '';
                    if (onDelta) onDelta(full);
                } else if (ev[1] === 'error') {
                    errored = d;
                }
            }
        }
        // Provider này lỗi (overload) hoặc ra chữ rỗng / body rỗng → thử provider kế.
        if (errored && !full.trim()) return next(errored.error);
        const html = cleanHtml(full);
        if (bodyIsEmpty(html)) return next('body rỗng');
        return html;
    }

    // ── Render vào iframe sandbox (DOMPurify nếu có; iframe đã sandbox sẵn) ──
    function renderToIframe(iframeEl, html) {
        if (!iframeEl) return;
        let safe = html;
        try {
            if (global.DOMPurify) {
                safe = global.DOMPurify.sanitize(html, {
                    WHOLE_DOCUMENT: true,
                    ADD_TAGS: ['style', 'meta', 'link'],
                    ADD_ATTR: ['target'],
                });
            }
        } catch (_) {}
        iframeEl.setAttribute('sandbox', 'allow-same-origin');
        iframeEl.srcdoc = safe;
    }

    // ── Export PNG (html2canvas trên body iframe) ──
    async function exportPng(iframeEl, filename) {
        if (!global.html2canvas) {
            global.notificationManager?.show?.('Thiếu html2canvas để xuất PNG', 'error');
            return false;
        }
        const doc = iframeEl?.contentDocument;
        const node = doc?.body?.firstElementChild || doc?.body;
        if (!node) return false;
        const canvas = await global.html2canvas(node, {
            backgroundColor: null,
            scale: 2,
            useCORS: true,
            logging: false,
        });
        const a = document.createElement('a');
        a.download = (filename || 'web2-html') + '.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
        return true;
    }

    function exportHtml(html, filename) {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a');
        a.download = (filename || 'web2-html') + '.html';
        a.href = URL.createObjectURL(blob);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    global.Web2HtmlSkill = {
        skills,
        skill,
        buildMessages,
        generate,
        cleanHtml,
        renderToIframe,
        exportPng,
        exportHtml,
        SIZES,
    };
})(window);
