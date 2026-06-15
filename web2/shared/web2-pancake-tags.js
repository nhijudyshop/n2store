// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — nguồn DÙNG CHUNG tag hội thoại Pancake (định nghĩa id→{text,color}) + render pill như Pancake.
/**
 * Web2PancakeTags — NGUỒN DUY NHẤT cho TAG hội thoại Pancake (Web 2.0).
 *
 * Tag Pancake = "Thẻ hội thoại" (NV. Lài, BOOM, CHECK IB, …). Định nghĩa
 * (id→{text,color}) nằm trong PAGE SETTINGS (`Web2Chat.fetchPageSettings` →
 * settings.tags). conv.tags từ Pancake = mảng ID SỐ (vd [58,68]) → phải map
 * sang định nghĩa để lấy text + màu.
 *
 * Dùng:
 *   await Web2PancakeTags.ensure(pageId);          // nạp + cache defs 1 lần/page
 *   const html = Web2PancakeTags.pillsHtml(pageId, conv.tags);  // HTML pills màu
 *   // render bất đồng bộ: nếu defs chưa nạp, pillsHtml trả '' → gọi ensure().then(re-render)
 *
 * KHÔNG fetch Pancake trực tiếp ở nơi khác — mọi nơi cần tag dùng module này.
 */
(function (global) {
    'use strict';

    const _defs = new Map(); // pageId -> Map(idString -> {id,text,color,lighten})
    const _inflight = new Map(); // pageId -> Promise

    function _esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }

    // Màu chữ tương phản theo độ sáng nền (tag vàng → chữ tối; tag tối → chữ trắng).
    function _contrast(hex) {
        const h = String(hex || '').replace('#', '');
        if (h.length < 6) return '#fff';
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return lum > 0.62 ? '#1f2937' : '#ffffff';
    }

    /**
     * Nạp + cache định nghĩa tag của 1 page (từ Pancake page settings). Idempotent
     * (cache + dedupe in-flight). Trả Map(idString -> def).
     */
    async function ensure(pageId) {
        if (!pageId) return new Map();
        const key = String(pageId);
        if (_defs.has(key)) return _defs.get(key);
        if (_inflight.has(key)) return _inflight.get(key);
        const p = (async () => {
            const map = new Map();
            try {
                if (global.Web2Chat && global.Web2Chat.fetchPageSettings) {
                    const r = await global.Web2Chat.fetchPageSettings(pageId);
                    const tags = (r && r.settings && r.settings.tags) || (r && r.tags) || [];
                    for (const t of tags) {
                        if (t && t.id != null)
                            map.set(String(t.id), {
                                id: t.id,
                                text: t.text || '',
                                color: t.color || '#8a94a6',
                                lighten: t.lighten_color || null,
                            });
                    }
                }
            } catch (_) {
                /* giữ map rỗng — pillsHtml trả '' (graceful) */
            }
            _defs.set(key, map);
            _inflight.delete(key);
            return map;
        })();
        _inflight.set(key, p);
        return p;
    }

    /** Map đã cache của page (null nếu chưa ensure). */
    function defsFor(pageId) {
        return _defs.get(String(pageId)) || null;
    }

    /**
     * conv.tags (mảng id số HOẶC mảng Tag object) → mảng def {id,text,color,lighten}.
     * id chưa có trong defs (chưa ensure) → bỏ qua (sẽ hiện sau khi ensure + re-render).
     */
    function resolve(pageId, convTags) {
        if (!Array.isArray(convTags) || !convTags.length) return [];
        const map = defsFor(pageId);
        const out = [];
        for (const t of convTags) {
            if (t && typeof t === 'object' && t.text != null) {
                out.push({
                    id: t.id,
                    text: t.text || '',
                    color: t.color || '#8a94a6',
                    lighten: t.lighten_color || null,
                });
            } else {
                const d = map && map.get(String(t && t.id != null ? t.id : t));
                if (d) out.push(d);
            }
        }
        return out;
    }

    /** HTML các pill tag màu (như Pancake). '' nếu không có tag / defs chưa nạp. */
    function pillsHtml(pageId, convTags) {
        const tags = resolve(pageId, convTags);
        if (!tags.length) return '';
        return tags
            .map(
                (t) =>
                    `<span class="w2pk-tag" style="background:${_esc(t.color)};color:${_contrast(
                        t.color
                    )}" title="${_esc(t.text)}">${_esc(t.text)}</span>`
            )
            .join('');
    }

    // CSS pill (inject 1 lần) — tránh phụ thuộc file CSS riêng.
    (function injectCss() {
        try {
            if (document.getElementById('w2pk-tag-css')) return;
            const s = document.createElement('style');
            s.id = 'w2pk-tag-css';
            s.textContent =
                '.w2pk-tags{display:flex;flex-wrap:wrap;gap:4px;align-items:center}' +
                '.w2pk-tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;' +
                'font-weight:700;line-height:1.5;white-space:nowrap;max-width:160px;overflow:hidden;' +
                'text-overflow:ellipsis;vertical-align:middle}';
            (document.head || document.documentElement).appendChild(s);
        } catch (_) {
            /* ignore */
        }
    })();

    global.Web2PancakeTags = { ensure, defsFor, resolve, pillsHtml };
})(window);
