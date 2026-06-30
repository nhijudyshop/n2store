// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2ChatPanel — STATE + pure helpers + per-instance state factory.
// Phần này KHÔNG đụng DOM của instance; chỉ chứa:
//   • Pure render/format helpers (esc, msgPlain, avatars, timestamps, attachment)
//   • createState(): khởi tạo `st` per-instance
//   • Namespace dùng chung `window.__Web2ChatPanelNS` để render/compose/facade
//     cùng tham chiếu (MOVE-only — hành vi runtime KHÔNG đổi).
// =====================================================================
(function (global) {
    const NS = (global.__Web2ChatPanelNS = global.__Web2ChatPanelNS || {});

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    // Pancake text đến dạng HTML một phần (<div>, <br>) → plain text giữ xuống dòng.
    function msgPlain(raw) {
        if (!raw) return '';
        if (!String(raw).includes('<')) return String(raw);
        const normalized = String(raw)
            .replace(/\r\n?/g, '\n')
            .replace(/<br\b[^>]*>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
            .replace(/<(p|div|li|h[1-6])(\s[^>]*)?>/gi, '\n');
        const tmp = document.createElement('div');
        tmp.innerHTML = normalized;
        const text = tmp.textContent || tmp.innerText || '';
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    function workerUrl() {
        return (
            (global.Web2Chat &&
                global.Web2Chat._internal &&
                global.Web2Chat._internal.WORKER_URL) ||
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    function fbAvatarUrl(psid, pageId) {
        if (!psid) return '';
        return `${workerUrl()}/api/fb-avatar?id=${encodeURIComponent(psid)}${pageId ? '&page=' + encodeURIComponent(pageId) : ''}`;
    }
    const GRADIENTS = [
        'linear-gradient(135deg,#667eea,#764ba2)',
        'linear-gradient(135deg,#f093fb,#f5576c)',
        'linear-gradient(135deg,#4facfe,#00f2fe)',
        'linear-gradient(135deg,#43e97b,#38f9d7)',
    ];
    function gradientFor(name) {
        const s = String(name || '?');
        return GRADIENTS[(s.charCodeAt(0) || 0) % GRADIENTS.length];
    }
    function initialOf(name) {
        return esc(
            (
                String(name || '?')
                    .trim()
                    .charAt(0) || '?'
            ).toUpperCase()
        );
    }
    function avatarBig(name, psid, pageId, directUrl) {
        const url = directUrl || fbAvatarUrl(psid, pageId);
        const grad = gradientFor(name);
        if (url && !String(url).startsWith('data:image/svg')) {
            return `<img src="${esc(url)}" class="w2cp-avatar" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="w2cp-avatar-ph" style="display:none;background:${grad};">${initialOf(name)}</div>`;
        }
        return `<div class="w2cp-avatar-ph" style="background:${grad};">${initialOf(name)}</div>`;
    }
    function avatarSmall(name, psid, pageId) {
        const url = fbAvatarUrl(psid, pageId);
        const grad = gradientFor(name);
        const img = url
            ? `<img class="w2cp-bub-av-img" src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">`
            : '';
        // div chữ-cái nền gradient + img phủ (img lỗi → tự remove → còn chữ)
        return `<div class="w2cp-bub-av" style="background:${grad};">${initialOf(name)}${img}</div>`;
    }

    // Pancake inserted_at = UTC không hậu tố Z → new Date(str) trên Chrome interpret as local (+7)
    // → lệch 7 tiếng. Append 'Z' nếu string không có timezone info.
    function parseTs(ts) {
        if (!ts) return null;
        if (
            typeof ts === 'string' &&
            !ts.includes('Z') &&
            !ts.includes('+') &&
            !/T\d{2}:\d{2}:\d{2}-/.test(ts)
        ) {
            return new Date(ts + 'Z');
        }
        return new Date(ts);
    }
    function fmtTime(ts) {
        if (!ts) return '';
        const d = parseTs(ts);
        if (!d || isNaN(d)) return '';
        return d.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Ho_Chi_Minh',
        });
    }
    function msgTs(m) {
        const t = m && (m.inserted_at || m.created_time || m.timestamp);
        if (t) {
            const d = parseTs(t);
            if (d && !isNaN(d.getTime())) return d.getTime();
        }
        // Hardening (#2 LOW): thiếu/parse-fail timestamp → KHÔNG về 0 (tin sẽ NHẢY lên
        // đầu list — đúng triệu chứng "giật tin lên trên"). Tin tạm optimistic/extension
        // có id nhúng epoch ms (ext_<ms> / temp_<ms> / pk_<ms>) → lấy ms đó (deterministic,
        // KHÔNG dùng Date.now() vì sort comparator gọi nhiều lần → bất ổn). Cuối cùng mới 0.
        const id = m && m.id != null ? String(m.id) : '';
        const mm = id.match(/\d{13}/);
        return mm ? Number(mm[0]) : 0;
    }

    // ---- Render 1 attachment (media) ----
    function renderAttachment(a) {
        const type = (a.type || '').toLowerCase();
        if (type === 'reaction' || type === 'replied_message') return '';
        const url =
            a.url ||
            a.file_url ||
            a.preview_url ||
            (a.payload && a.payload.url) ||
            (a.image_data && a.image_data.url) ||
            a.src ||
            '';
        const isImg =
            type === 'photo' || type === 'image' || (a.mime_type || '').startsWith('image/');
        const isSticker =
            type === 'sticker' ||
            type === 'animated_image_url' ||
            type === 'animated_image_share' ||
            !!a.sticker_id;
        if (url && isSticker)
            return `<div class="w2cp-sticker"><img src="${esc(url)}" alt="sticker" loading="lazy"></div>`;
        if (url && isImg)
            return `<img class="w2cp-img" src="${esc(url)}" alt="image" loading="lazy">`;
        if (url && (type === 'video' || (a.mime_type || '').startsWith('video/')))
            return `<video class="w2cp-video" src="${esc(url)}" controls preload="metadata"></video>`;
        if (url && (type === 'audio' || (a.mime_type || '').startsWith('audio/')))
            return `<audio class="w2cp-audio" src="${esc(url)}" controls preload="metadata"></audio>`;
        if (type === 'like' || type === 'thumbsup') return `<div style="font-size:30px;">👍</div>`;
        if (url) {
            const nm = a.name || a.filename || 'Tệp đính kèm';
            return `<a class="w2cp-file" href="${esc(url)}" target="_blank" rel="noopener">📎 ${esc(nm)}</a>`;
        }
        return '';
    }

    // ---- per-instance state ----
    function createFlags(opts) {
        return {
            paste: !!opts.enablePaste,
            sticker: !!opts.enableSticker,
            reactSend: !!opts.enableReactSend,
            entityDetect: !!opts.enableEntityDetect,
            hideHeader: !!opts.hideHeader, // trang đã có header riêng (native-orders)
            hideStats: !!opts.hideStats,
        };
    }
    function createState() {
        return {
            conv: null,
            adapter: null,
            messages: [],
            cursor: 0,
            hasMore: true,
            loadingOlder: false,
            isAtBottom: true,
            newCount: 0,
            replyTo: null, // { id, name, text }
            attachment: null, // { file, kind }
        };
    }

    NS.utils = {
        esc,
        msgPlain,
        workerUrl,
        fbAvatarUrl,
        gradientFor,
        initialOf,
        avatarBig,
        avatarSmall,
        parseTs,
        fmtTime,
        msgTs,
        renderAttachment,
    };
    NS.createFlags = createFlags;
    NS.createState = createState;
})(window);
