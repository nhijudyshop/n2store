// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Chat client / LIVE (livestream posts, page list, PAT gen, boost comment)
// =====================================================
//
// Live / multi-account features for the Web2Chat module set: fetch
// the page livestream post list (cache 60s), list admin pages, mint
// page_access_tokens (single best-account + all-accounts fan-out),
// and send a boost comment (byte-for-byte Pancake reply_comment).
// State/helpers come from `window.__Web2ChatNS`. Load AFTER utils +
// tokens (+ settings + api).

(function () {
    'use strict';

    if (window.Web2Chat) return; // idempotent — facade already built
    const NS = window.__Web2ChatNS;
    if (!NS || !NS._tokensReady) {
        console.error('[Web2Chat] live module loaded before utils/tokens');
        return;
    }
    if (NS._liveReady) return;
    NS._liveReady = true;

    const { WORKER_URL, LS } = NS;
    const { _isExpired, _fetchJson, _pagesHas, getJwt, getAllAccounts, setPageAccessToken } = NS;
    const _livePostsCache = NS._livePostsCache;
    const LIVE_POSTS_TTL = NS.LIVE_POSTS_TTL;

    // Danh sách bài LIVESTREAM của 1 page — FETCH TRỰC TIẾP Pancake (KHÔNG poller),
    // đúng endpoint Pancake "Quản lý bài viết". Trả posts kèm `commentCount` (tổng
    // comment THẬT trên Pancake) + `living` (đang/đã live) + title/date. Cache 60s/page.
    async function fetchLivePosts(pageId, opts = {}) {
        if (!pageId) return { ok: false, reason: 'missing_pageId', posts: [] };
        const key = String(pageId);
        const cached = _livePostsCache.get(key);
        if (!opts.force && cached && Date.now() - cached.at < LIVE_POSTS_TTL)
            return { ok: true, posts: cached.posts, cached: true };
        const jwt = getJwt();
        if (!jwt) return { ok: false, reason: 'no_jwt', posts: cached?.posts || [] };
        const days = opts.days || 14;
        const now = Math.floor(Date.now() / 1000);
        const params = new URLSearchParams({
            access_token: jwt,
            start_time: String(now - days * 86400),
            end_time: String(now),
        });
        const url = `${WORKER_URL}/api/pancake/pages/${encodeURIComponent(key)}/posts?${params.toString()}`;
        try {
            const data = await _fetchJson(url, { method: 'GET' });
            const raw = Array.isArray(data?.posts)
                ? data.posts
                : Array.isArray(data?.data)
                  ? data.data
                  : [];
            const posts = raw
                .filter((p) => p && (p.type === 'livestream' || p.is_live_video || p.live_video_id))
                .map((p) => ({
                    postId: String(p.id),
                    title: p.message || p.title || '',
                    date: p.inserted_at || p.created_time || null,
                    living: p.live_status === 'LIVE' || !!p.is_living,
                    commentCount: Number(p.comment_count) || 0,
                }));
            _livePostsCache.set(key, { at: Date.now(), posts });
            return { ok: true, posts };
        } catch (e) {
            return { ok: false, reason: e.message, posts: cached?.posts || [] };
        }
    }

    async function listPages() {
        const jwt = getJwt();
        if (!jwt) return { ok: false, reason: 'no_jwt', pages: [] };
        const url = `${WORKER_URL}/api/pancake/pages?access_token=${encodeURIComponent(jwt)}`;
        try {
            const data = await _fetchJson(url, { method: 'GET' });
            // Pancake responses: { success, categorized:{activated:[]} } or { pages:[] }
            const pages =
                data?.categorized?.activated ||
                data?.pages ||
                (Array.isArray(data) ? data : []) ||
                [];
            return { ok: true, pages, raw: data };
        } catch (e) {
            return { ok: false, reason: e.message, pages: [] };
        }
    }

    /**
     * Mint a page_access_token by trying each known account in turn until
     * one succeeds. Mirrors web 1.0's `generatePageAccessToken` multi-
     * account fallback — different staff accounts often have different
     * pages they admin, so we can't assume the "active" JWT is the right
     * one for an arbitrary `pageId`.
     */
    async function generatePageAccessToken(pageId) {
        if (!pageId) return { ok: false, reason: 'missing_pageId' };

        // Build the candidate list. Prefer accounts known to admin this
        // page (`acc.pages` carries the list from /api/pancake-accounts),
        // then the current JWT, then any other non-expired account.
        const accountsMap = getAllAccounts();
        const candidates = [];
        const seen = new Set();
        const push = (token, id, label) => {
            if (!token || seen.has(token)) return;
            seen.add(token);
            candidates.push({ token, id, label });
        };
        for (const [id, acc] of Object.entries(accountsMap)) {
            if (!acc?.token) continue;
            if (_isExpired(acc.exp)) continue;
            const ownsPage = _pagesHas(acc.pages, pageId);
            if (ownsPage) push(acc.token, id, acc.name || id);
        }
        const jwt = getJwt();
        if (jwt) push(jwt, localStorage.getItem(LS.ACTIVE_ACCOUNT_ID) || 'active', 'active');
        for (const [id, acc] of Object.entries(accountsMap)) {
            if (!acc?.token) continue;
            if (_isExpired(acc.exp)) continue;
            push(acc.token, id, acc.name || id);
        }

        if (candidates.length === 0) {
            return { ok: false, reason: 'no_accounts' };
        }

        let lastReason = null;
        for (const cand of candidates) {
            const url = `${WORKER_URL}/api/pancake/pages/${encodeURIComponent(pageId)}/generate_page_access_token?access_token=${encodeURIComponent(cand.token)}`;
            try {
                const data = await _fetchJson(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                if (data?.success && data?.page_access_token) {
                    setPageAccessToken(pageId, data.page_access_token, {
                        account_id: cand.id,
                    });
                    return { ok: true, token: data.page_access_token, via: cand.label };
                }
                lastReason = data?.message || 'unknown_failure';
            } catch (e) {
                lastReason = e.message;
            }
        }
        return { ok: false, reason: lastReason || 'all_accounts_failed' };
    }

    // Mint PAT cho 1 page từ MỌI account đã add (song song) → đa nhiệm gửi tin
    // (trang "Tăng số lượng comment" chạy 1 worker/PAT). Mỗi account (user) cho 1
    // page_access_token RIÊNG (bucket rate-limit FB khác nhau) → throughput cao hơn.
    // Trả { ok, tokens:[{accountId,name,token}] } (dedupe theo PAT — token trùng = 1).
    async function generateAllPageAccessTokens(pageId) {
        if (!pageId) return { ok: false, reason: 'missing_pageId', tokens: [] };
        const accountsMap = getAllAccounts();
        const cands = [];
        for (const [id, acc] of Object.entries(accountsMap)) {
            if (!acc || !acc.token || _isExpired(acc.exp)) continue;
            const owns = !Array.isArray(acc.pages) || _pagesHas(acc.pages, pageId);
            if (owns) cands.push({ id, name: acc.name || id, token: acc.token });
        }
        if (!cands.length) {
            const jwt = getJwt();
            if (jwt)
                cands.push({
                    id: localStorage.getItem(LS.ACTIVE_ACCOUNT_ID) || 'active',
                    name: 'active',
                    token: jwt,
                });
        }
        const minted = await Promise.all(
            cands.map(async (c) => {
                const url = `${WORKER_URL}/api/pancake/pages/${encodeURIComponent(pageId)}/generate_page_access_token?access_token=${encodeURIComponent(c.token)}`;
                try {
                    const data = await _fetchJson(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    });
                    if (data && data.success && data.page_access_token)
                        return { accountId: c.id, name: c.name, token: data.page_access_token };
                } catch (_) {
                    /* skip account này */
                }
                return null;
            })
        );
        const seen = new Set();
        const tokens = [];
        for (const r of minted) {
            if (r && r.token && !seen.has(r.token)) {
                seen.add(r.token);
                tokens.push(r);
            }
        }
        if (tokens.length)
            setPageAccessToken(pageId, tokens[0].token, { account_id: tokens[0].accountId });
        return { ok: tokens.length > 0, tokens, accounts: cands.length };
    }

    // ── BOOST COMMENT — gửi GIỐNG 100% Pancake (trang "Tăng số lượng comment") ──
    // Capture từ pancake.vn (gửi tay): POST /api/v1/pages/{pageId}/conversations/
    // {convId}/messages?access_token={JWT_USER} (KHÔNG phải page_access_token!),
    // body khớp byte-for-byte: { action:'reply_comment', message_id, parent_id,
    // user_selected_reply_to:null, post_id, message, send_by_platform:'web' }.
    // Gửi vào hội thoại COMMENT của PAGE (from.id===page_id) → reply nested → page tự
    // comment (như Pancake). opts.jwt = JWT account (đa nhiệm: mỗi account 1 JWT).
    async function sendLiveComment(pageId, conv, message, opts = {}) {
        if (!pageId || !conv || !conv.id) return { ok: false, reason: 'missing_ids' };
        const jwt = opts.jwt || getJwt();
        if (!jwt) return { ok: false, reason: 'no_jwt' };
        const body = {
            action: 'reply_comment',
            message_id: opts.messageId || conv.id, // comment để reply (latest msg / conv.id)
            parent_id: conv.id, // gốc thread = hội thoại
            user_selected_reply_to: null,
            post_id: conv.post_id || opts.postId || null,
            message: String(message == null ? '' : message),
            send_by_platform: 'web',
        };
        const url = `${WORKER_URL}/api/pancake/pages/${encodeURIComponent(pageId)}/conversations/${encodeURIComponent(conv.id)}/messages?access_token=${encodeURIComponent(jwt)}`;
        try {
            const data = await _fetchJson(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body),
            });
            if (data && data.success) return { ok: true, id: data.id, raw: data };
            return {
                ok: false,
                reason:
                    (data && data.message) ||
                    (data && data.e_code != null ? `FB #${data.e_code}` : 'fail'),
                e_code: data && data.e_code,
                e_subcode: data && data.e_subcode,
                raw: data,
            };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    // ── Expose on namespace ───────────────────────────────────────────
    NS.fetchLivePosts = fetchLivePosts;
    NS.listPages = listPages;
    NS.generatePageAccessToken = generatePageAccessToken;
    NS.generateAllPageAccessTokens = generateAllPageAccessTokens;
    NS.sendLiveComment = sendLiveComment;
})();
