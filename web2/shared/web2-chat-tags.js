// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Chat client / TAGS (page tag list, toggle, conversation tag pills)
// =====================================================
//
// Tag management for the Web2Chat module set:
//   • fetchTags / toggleTag — page tag list + add/remove tag on a conv
//     (Pancake Public API, page_access_token).
//   • ensureTags / tagDefsFor / resolveTags / tagPillsHtml — cache tag
//     definitions (from page settings) + render colored pills like
//     Pancake. Nguồn chung cho web2 — trang chỉ tham chiếu Web2Chat.
// State/helpers come from `window.__Web2ChatNS`. Load AFTER utils +
// tokens + settings (needs fetchPageSettings).

(function () {
    'use strict';

    if (window.Web2Chat) return; // idempotent — facade already built
    const NS = window.__Web2ChatNS;
    if (!NS || !NS._tokensReady || !NS._settingsReady) {
        console.error('[Web2Chat] tags module loaded before utils/tokens/settings');
        return;
    }
    if (NS._tagsReady) return;
    NS._tagsReady = true;

    const { WORKER_URL } = NS;
    const { _isInstagram, _fetchJson, getPageAccessToken } = NS;
    const _tagDefs = NS._tagDefs;

    // =====================================================
    // TAGS — danh sách thẻ của page + gắn/gỡ thẻ cho hội thoại.
    //   GET  /api/pancake-official/pages/:pageId/tags
    //   POST /api/pancake-official/pages/:pageId/conversations/:convId/tags { action, tag_id }
    // (mirror PancakeAPI.fetchTags/addRemoveTag của live-chat — nguồn chung cho web2).
    // =====================================================
    async function fetchTags(pageId) {
        if (!pageId) return { ok: false, reason: 'missing_pageId', tags: [] };
        if (_isInstagram(pageId)) return { ok: false, reason: 'instagram_unsupported', tags: [] };
        const pat = getPageAccessToken(pageId);
        if (!pat) return { ok: false, reason: 'no_page_access_token', tags: [] };
        const url = `${WORKER_URL}/api/pancake-official/pages/${encodeURIComponent(pageId)}/tags?page_access_token=${encodeURIComponent(pat)}`;
        try {
            const data = await _fetchJson(url, { method: 'GET' });
            return { ok: true, tags: Array.isArray(data?.tags) ? data.tags : [] };
        } catch (e) {
            console.warn('[Web2Chat] fetchTags failed:', e.message);
            return { ok: false, reason: e.message, tags: [] };
        }
    }

    async function toggleTag(pageId, conversationId, tagId, action = 'add') {
        if (!pageId || !conversationId || tagId == null)
            return { ok: false, reason: 'missing_args' };
        if (_isInstagram(pageId)) return { ok: false, reason: 'instagram_unsupported' };
        const pat = getPageAccessToken(pageId);
        if (!pat) return { ok: false, reason: 'no_page_access_token' };
        const url = `${WORKER_URL}/api/pancake-official/pages/${encodeURIComponent(pageId)}/conversations/${encodeURIComponent(conversationId)}/tags?page_access_token=${encodeURIComponent(pat)}`;
        try {
            const data = await _fetchJson(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, tag_id: tagId }),
            });
            if (data && data.success === false) {
                return { ok: false, reason: data.message || 'tag_failed', raw: data };
            }
            return { ok: true, raw: data };
        } catch (e) {
            console.warn('[Web2Chat] toggleTag failed:', e.message);
            return { ok: false, reason: e.message };
        }
    }

    // ── TAG hội thoại Pancake ("Thẻ hội thoại": NV. Lài, BOOM, CHECK IB…) ─────────
    // DÙNG CHUNG trong Web2Chat — trang chỉ cần tham chiếu Web2Chat, KHÔNG file rời.
    // conv.tags = mảng ID SỐ (vd [58,68]); định nghĩa text+màu ở PAGE SETTINGS
    // (settings.tags = {id,text,color,lighten_color}) → map id→def để render pill.
    function _tagContrast(hex) {
        const h = String(hex || '').replace('#', '');
        if (h.length < 6) return '#fff';
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#1f2937' : '#ffffff';
    }
    // Nạp + cache định nghĩa tag của 1 page (từ page settings). Idempotent.
    async function ensureTags(pageId) {
        if (!pageId) return new Map();
        const key = String(pageId);
        if (_tagDefs.has(key)) return _tagDefs.get(key);
        const map = new Map();
        try {
            const r = await NS.fetchPageSettings(pageId);
            const tags = (r && r.settings && r.settings.tags) || [];
            for (const t of tags)
                if (t && t.id != null)
                    map.set(String(t.id), {
                        id: t.id,
                        text: t.text || '',
                        color: t.color || '#8a94a6',
                        lighten: t.lighten_color || null,
                    });
        } catch (_) {
            /* giữ map rỗng — pillsHtml trả '' (graceful) */
        }
        _tagDefs.set(key, map);
        return map;
    }
    function tagDefsFor(pageId) {
        return _tagDefs.get(String(pageId)) || null;
    }
    // conv.tags (id số hoặc Tag object) → mảng def {id,text,color}.
    function resolveTags(pageId, convTags) {
        if (!Array.isArray(convTags) || !convTags.length) return [];
        const map = tagDefsFor(pageId);
        const out = [];
        for (const t of convTags) {
            if (t && typeof t === 'object' && t.text != null)
                out.push({ id: t.id, text: t.text || '', color: t.color || '#8a94a6' });
            else {
                const d = map && map.get(String(t && t.id != null ? t.id : t));
                if (d) out.push(d);
            }
        }
        return out;
    }
    // HTML pill tag màu như Pancake (inline-style → không cần CSS rời). '' nếu không
    // tag / defs chưa nạp (gọi ensureTags() rồi render lại).
    function tagPillsHtml(pageId, convTags) {
        const tags = resolveTags(pageId, convTags);
        if (!tags.length) return '';
        const e = (s) =>
            String(s == null ? '' : s).replace(
                /[&<>"]/g,
                (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
            );
        return tags
            .map(
                (t) =>
                    `<span class="w2pk-tag" style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;line-height:1.5;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;background:${e(
                        t.color
                    )};color:${_tagContrast(t.color)}" title="${e(t.text)}">${e(t.text)}</span>`
            )
            .join('');
    }

    // ── Expose on namespace ───────────────────────────────────────────
    NS.fetchTags = fetchTags;
    NS.toggleTag = toggleTag;
    NS.ensureTags = ensureTags;
    NS.tagDefsFor = tagDefsFor;
    NS.resolveTags = resolveTags;
    NS.tagPillsHtml = tagPillsHtml;
})();
