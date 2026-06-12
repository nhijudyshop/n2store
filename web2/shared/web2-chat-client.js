// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — Chat client (Pancake + Extension)
// =====================================================
//
// Standalone module used by Web 2.0 pages to chat / reply
// comments from a customer order. Built fresh — DOES NOT
// reuse `window.pancakeDataManager` / `pancakeTokenManager`
// from the Web 1.0 modules. Reads token config from
// localStorage (which both layers share as user data, not
// as code).
//
// Endpoints (via Cloudflare Worker proxy):
//   GET  /api/pancake/conversations/customer/:fbId
//          ?pages[<pageId>]=0&access_token=<jwt>
//   GET  /api/pancake-official/pages/:pageId/conversations/:convId/messages
//          ?page_access_token=<token>[&customer_id=<uuid>]
//   POST /api/pancake-official/pages/:pageId/conversations/:convId/messages
//          ?page_access_token=<token>
//          body: { action, message, conversation_id, customer_id?, content_ids? }
//
// Token sources (localStorage keys — same as Web 1.0):
//   pancake_jwt_token            (JWT used as access_token)
//   pancake_jwt_token_expiry     (epoch seconds)
//   pancake_page_access_tokens   ({ pageId: { token, ... } })
//
// Public API:
//   window.Web2Chat.fetchConversations(pageId, fbId)
//      → { ok, conversations[], customerUuid? }
//   window.Web2Chat.fetchMessages(pageId, convId, customerId?)
//      → { ok, messages[], conversation?, customers[] }
//   window.Web2Chat.sendMessage(pageId, convId, { text, action, customerId?, attachments? })
//      → { ok, message? }
//   window.Web2Chat.getPageAccessToken(pageId) → string|null
//   window.Web2Chat.getJwt() → string|null
//   window.Web2Chat.hasTokensFor(pageId) → boolean
//
// Note: For Instagram pages (id starts with `igo_`) all calls
// return `{ ok:false, reason:'instagram_unsupported' }` since the
// official endpoint rejects them.

(function () {
    'use strict';

    if (window.Web2Chat) return; // idempotent

    const WORKER_URL =
        window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // Same localStorage keys web 1.0's PancakeTokenManager uses, so accounts
    // saved by either app are immediately visible to the other.
    const LS = {
        JWT: 'pancake_jwt_token',
        JWT_EXP: 'pancake_jwt_token_expiry',
        PAGE_TOKENS: 'pancake_page_access_tokens',
        ALL_ACCOUNTS: 'pancake_all_accounts',
        ACTIVE_ACCOUNT_ID: 'web2_pancake_active_account_id',
    };

    function _isExpired(epochSeconds) {
        if (!epochSeconds) return true;
        return Date.now() / 1000 >= Number(epochSeconds) - 30; // 30s safety
    }

    function getJwt() {
        try {
            const token = localStorage.getItem(LS.JWT);
            const exp = localStorage.getItem(LS.JWT_EXP);
            if (!token) return null;
            if (exp && _isExpired(parseInt(exp, 10))) return null;
            return token;
        } catch {
            return null;
        }
    }

    function getPageAccessToken(pageId) {
        if (!pageId) return null;
        try {
            const raw = localStorage.getItem(LS.PAGE_TOKENS);
            if (!raw) return null;
            const map = JSON.parse(raw) || {};
            const entry = map[pageId];
            if (!entry) return null;
            return typeof entry === 'string' ? entry : entry.token || null;
        } catch {
            return null;
        }
    }

    function hasTokensFor(pageId) {
        return !!getJwt() || !!getPageAccessToken(pageId);
    }

    /**
     * Return the full account map web 1.0 maintains. Keyed by account id;
     * each entry has { token, exp, uid, name, fbId, fbName, savedAt, pages }.
     * Use this for multi-account fallback when one account can't generate a
     * PAT for a given page.
     */
    function getAllAccounts() {
        try {
            const raw = localStorage.getItem(LS.ALL_ACCOUNTS);
            return raw ? JSON.parse(raw) || {} : {};
        } catch {
            return {};
        }
    }

    /**
     * Pull accounts + page tokens from Render DB (shared with web 1.0).
     * Mirrors `PancakeTokenManager._loadFromRenderDB`. Runs at most once
     * per session unless `force` is true — there's no point re-asking the
     * DB on every modal open.
     */
    let _syncedThisSession = false;
    let _syncInFlight = null;
    async function syncFromRenderDB({ force = false } = {}) {
        if (_syncedThisSession && !force) return { ok: true, cached: true };
        if (_syncInFlight) return _syncInFlight;
        _syncInFlight = (async () => {
            const result = { ok: false, accounts: 0, pageTokens: 0 };
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 8000);
            try {
                const [accRes, ptRes] = await Promise.all([
                    fetch(`${WORKER_URL}/api/pancake-accounts?active=true`, {
                        signal: ctrl.signal,
                    }).catch((e) => ({ _err: e })),
                    fetch(`${WORKER_URL}/api/pancake-page-tokens`, {
                        signal: ctrl.signal,
                    }).catch((e) => ({ _err: e })),
                ]);

                if (accRes && !accRes._err && accRes.ok) {
                    const data = await accRes.json().catch(() => null);
                    if (data?.success && Array.isArray(data.accounts) && data.accounts.length) {
                        const accounts = {};
                        for (const row of data.accounts) {
                            accounts[row.account_id] = {
                                token: row.token,
                                exp: Number(row.token_exp) || 0,
                                uid: row.uid,
                                name: row.name,
                                savedAt: Number(row.saved_at) || 0,
                                fbId: row.fb_id,
                                fbName: row.fb_name,
                                pages: row.pages || [],
                            };
                        }
                        localStorage.setItem(LS.ALL_ACCOUNTS, JSON.stringify(accounts));

                        // Promote one account to the active JWT slot so existing
                        // single-token code paths (`getJwt`) still work.
                        const preferredId = localStorage.getItem(LS.ACTIVE_ACCOUNT_ID);
                        const ids = Object.keys(accounts);
                        const pickId =
                            preferredId &&
                            accounts[preferredId] &&
                            !_isExpired(accounts[preferredId].exp)
                                ? preferredId
                                : ids.find((id) => !_isExpired(accounts[id].exp));
                        if (pickId) {
                            const acc = accounts[pickId];
                            localStorage.setItem(LS.JWT, acc.token);
                            localStorage.setItem(LS.JWT_EXP, String(acc.exp));
                            localStorage.setItem(LS.ACTIVE_ACCOUNT_ID, pickId);
                        }
                        result.accounts = ids.length;
                    }
                }

                if (ptRes && !ptRes._err && ptRes.ok) {
                    const data = await ptRes.json().catch(() => null);
                    if (data?.success && data.tokens && typeof data.tokens === 'object') {
                        const local = (() => {
                            try {
                                return JSON.parse(localStorage.getItem(LS.PAGE_TOKENS) || '{}');
                            } catch {
                                return {};
                            }
                        })();
                        // Smart merge: keep whichever entry has the newer `savedAt`.
                        for (const [pageId, remote] of Object.entries(data.tokens)) {
                            const cur = local[pageId];
                            if (
                                !cur ||
                                (Number(remote.savedAt) || 0) > (Number(cur.savedAt) || 0)
                            ) {
                                local[pageId] = remote;
                            }
                        }
                        localStorage.setItem(LS.PAGE_TOKENS, JSON.stringify(local));
                        result.pageTokens = Object.keys(data.tokens).length;
                    }
                }

                result.ok = true;
                _syncedThisSession = true;
                console.log(
                    `[Web2Chat] syncFromRenderDB: ${result.accounts} accounts, ${result.pageTokens} page tokens`
                );
                return result;
            } catch (e) {
                console.warn('[Web2Chat] syncFromRenderDB failed:', e.message);
                return { ok: false, reason: e.message };
            } finally {
                clearTimeout(timeout);
                _syncInFlight = null;
            }
        })();
        return _syncInFlight;
    }

    function _isInstagram(pageId) {
        return typeof pageId === 'string' && pageId.startsWith('igo_');
    }

    async function _fetchJson(url, init) {
        const r = await fetch(url, init);
        const text = await r.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            /* not json */
        }
        if (!r.ok) {
            const err = new Error(`HTTP ${r.status} ${r.statusText}: ${text.slice(0, 200)}`);
            err.status = r.status;
            err.body = data;
            throw err;
        }
        return data;
    }

    // Short-lived in-memory cache for fetchConversations: the (pageId, fbId)
    // pair returns the same INBOX conversation across the session, so re-
    // opening the chat modal for the same customer goes from ~150ms to ~0.
    // 5 min TTL is long enough for typical inspection flows but short enough
    // to refresh if the user keeps the page open for an hour.
    const _convCache = new Map();
    const CONV_CACHE_TTL = 5 * 60 * 1000;

    /**
     * Fetch the conversation list for a whole page (the left sidebar in
     * Pancake admin inbox). Used by the inbox modal sidebar.
     *
     * @param {string} pageId
     * @param {{ tagId?:string, since?:number, limit?:number }} [opts]
     */
    async function fetchConversationsByPage(pageId, opts = {}) {
        if (!pageId) return { ok: false, reason: 'missing_pageId', conversations: [] };
        if (_isInstagram(pageId))
            return { ok: false, reason: 'instagram_unsupported', conversations: [] };
        const jwt = getJwt();
        if (!jwt) return { ok: false, reason: 'no_jwt', conversations: [] };
        const params = new URLSearchParams({
            access_token: jwt,
            page_id: pageId,
            type: 'INBOX',
        });
        if (opts.tagId) params.set('tag_id', opts.tagId);
        if (opts.since) params.set('since', String(opts.since));
        if (opts.limit) params.set('limit', String(opts.limit));
        const url = `${WORKER_URL}/api/pancake/pages/${encodeURIComponent(pageId)}/conversations?${params.toString()}`;
        try {
            const data = await _fetchJson(url, { method: 'GET' });
            const conversations = Array.isArray(data?.conversations) ? data.conversations : [];
            return { ok: true, conversations, raw: data };
        } catch (e) {
            console.warn('[Web2Chat] fetchConversationsByPage failed:', e.message);
            return { ok: false, reason: e.message, conversations: [] };
        }
    }

    /**
     * Server-side conversation search for the sidebar's "Tìm kiếm" input.
     *
     * Endpoint reverse-engineered from live trace of pancake.vn admin:
     *   POST https://pancake.vn/api/v1/pages/{pageId}/conversations/search
     *        ?q={query}&access_token={jwt}
     *   Content-Type: multipart/form-data (body is essentially empty)
     *
     * Response shape: { conversations: [ { id, customers, from,
     * last_message, snippet, type:'INBOX'|'COMMENT', tags, updated_at,
     * ... } ], … } — same as `fetchConversationsByPage` so the sidebar
     * row renderer can reuse it.
     *
     * @param {string} pageId
     * @param {string} query — what user typed (name, phone, message text)
     * @param {{ signal?: AbortSignal }} [opts]
     */
    async function searchConversations(pageId, query, opts = {}) {
        if (!pageId || !query) return { ok: false, reason: 'missing_args', conversations: [] };
        if (_isInstagram(pageId))
            return { ok: false, reason: 'instagram_unsupported', conversations: [] };
        const jwt = getJwt();
        if (!jwt) return { ok: false, reason: 'no_jwt', conversations: [] };
        const url = `${WORKER_URL}/api/pancake/pages/${encodeURIComponent(pageId)}/conversations/search?q=${encodeURIComponent(query)}&access_token=${encodeURIComponent(jwt)}`;
        try {
            // Server reads `q` from the querystring; the body is irrelevant.
            // Pancake's own admin sends `multipart/form-data` with an empty
            // boundary, but that's a non-simple Content-Type which forces a
            // CORS preflight from a cross-origin browser. Drop the body and
            // header entirely → simple POST request, no preflight, faster.
            const data = await _fetchJson(url, { method: 'POST', signal: opts.signal });
            const conversations = Array.isArray(data?.conversations) ? data.conversations : [];
            return { ok: true, conversations, raw: data };
        } catch (e) {
            if (e.name === 'AbortError') return { ok: false, reason: 'aborted', conversations: [] };
            console.warn('[Web2Chat] searchConversations failed:', e.message);
            return { ok: false, reason: e.message, conversations: [] };
        }
    }

    async function fetchConversations(pageId, fbId) {
        if (!pageId || !fbId)
            return { ok: false, reason: 'missing_pageId_or_fbId', conversations: [] };
        if (_isInstagram(pageId))
            return { ok: false, reason: 'instagram_unsupported', conversations: [] };
        const cacheKey = `${pageId}::${fbId}`;
        const cached = _convCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < CONV_CACHE_TTL && cached.result.ok) {
            return cached.result;
        }
        const jwt = getJwt();
        if (!jwt) return { ok: false, reason: 'no_jwt', conversations: [] };
        const url =
            `${WORKER_URL}/api/pancake/conversations/customer/${encodeURIComponent(fbId)}` +
            `?pages[${encodeURIComponent(pageId)}]=0&access_token=${encodeURIComponent(jwt)}`;
        try {
            const data = await _fetchJson(url, { method: 'GET' });
            const conversations = Array.isArray(data?.conversations) ? data.conversations : [];
            let customerUuid = null;
            if (conversations[0]?.customers?.[0]?.id) {
                customerUuid = conversations[0].customers[0].id;
            }
            const result = { ok: true, conversations, customerUuid, raw: data };
            _convCache.set(cacheKey, { ts: Date.now(), result });
            // Làm giàu kho KH: fbId (param) = psid của KH. Lấy thêm name/phone
            // từ Pancake customer nếu có → backend lưu vào web2_customers.
            try {
                const cust =
                    (conversations[0] &&
                        conversations[0].customers &&
                        conversations[0].customers[0]) ||
                    {};
                enrichCustomer(fbId, {
                    name:
                        cust.name ||
                        cust.display_name ||
                        (conversations[0] && conversations[0].name) ||
                        '',
                    phone: cust.phone || cust.phone_number || '',
                });
            } catch (_) {}
            return result;
        } catch (e) {
            console.warn('[Web2Chat] fetchConversations failed:', e.message);
            return { ok: false, reason: e.message, conversations: [] };
        }
    }

    /**
     * Fetch messages for a conversation.
     * @param {string} pageId
     * @param {string} conversationId
     * @param {string|null} customerId
     * @param {{ currentCount?: number }} [opts] — when set, asks the server
     *   for the page of older messages BEFORE the index `currentCount`.
     */
    async function fetchMessages(pageId, conversationId, customerId, opts = {}) {
        if (!pageId || !conversationId) return { ok: false, reason: 'missing_ids', messages: [] };
        if (_isInstagram(pageId))
            return { ok: false, reason: 'instagram_unsupported', messages: [] };

        const currentCount = Number.isFinite(opts.currentCount) ? opts.currentCount : null;

        // Prefer the JWT-based "direct" endpoint — Pancake's Public API
        // requires per-page subscription and returns empty for personal use.
        // The direct endpoint reads the user's own JWT (works as long as user
        // is logged into pancake.vn somewhere on this machine).
        const jwt = getJwt();
        if (jwt) {
            const directParams = new URLSearchParams({
                page_id: pageId,
                jwt,
                access_token: jwt,
            });
            if (customerId) directParams.set('customer_id', customerId);
            if (currentCount !== null) directParams.set('current_count', String(currentCount));
            const directUrl = `${WORKER_URL}/api/pancake-direct/pages/${encodeURIComponent(pageId)}/conversations/${encodeURIComponent(conversationId)}/messages?${directParams.toString()}`;
            try {
                const data = await _fetchJson(directUrl, { method: 'GET' });
                const messages = Array.isArray(data?.messages) ? data.messages : [];
                if (messages.length > 0) {
                    const customers = data?.customers || data?.conv_customers || [];
                    return {
                        ok: true,
                        messages,
                        conversation: data?.conversation || null,
                        customers,
                        customerId: customers[0]?.id || null,
                        via: 'direct',
                    };
                }
                // empty but no error → fall through to Public API attempt
            } catch (e) {
                console.warn('[Web2Chat] fetchMessages (direct) failed:', e.message);
                // continue to Public API
            }
        }

        // Fallback: Public API (page_access_token). Works if page subscribed.
        const pat = getPageAccessToken(pageId);
        if (pat) {
            const params = new URLSearchParams({ page_access_token: pat });
            if (customerId) params.set('customer_id', customerId);
            if (currentCount !== null) params.set('current_count', String(currentCount));
            const url = `${WORKER_URL}/api/pancake-official/pages/${encodeURIComponent(pageId)}/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`;
            try {
                const data = await _fetchJson(url, { method: 'GET' });
                const customers = data?.customers || data?.conv_customers || [];
                return {
                    ok: true,
                    messages: Array.isArray(data?.messages) ? data.messages : [],
                    conversation: data?.conversation || null,
                    customers,
                    customerId: customers[0]?.id || null,
                    via: 'official',
                };
            } catch (e) {
                console.warn('[Web2Chat] fetchMessages (official) failed:', e.message);
                return { ok: false, reason: e.message, messages: [] };
            }
        }

        return {
            ok: false,
            reason: 'no_jwt_or_page_token',
            messages: [],
        };
    }

    async function sendMessage(pageId, conversationId, opts = {}) {
        if (!pageId || !conversationId) return { ok: false, reason: 'missing_ids' };
        if (_isInstagram(pageId)) return { ok: false, reason: 'instagram_unsupported' };
        const pat = getPageAccessToken(pageId);
        if (!pat) return { ok: false, reason: 'no_page_access_token' };

        const text = (opts.text || '').trim();
        const attachments = Array.isArray(opts.attachments) ? opts.attachments : [];
        if (!text && attachments.length === 0) return { ok: false, reason: 'empty_message' };

        const payload = {
            action: opts.action || 'reply_inbox',
            message: text,
            conversation_id: conversationId,
        };
        if (opts.customerId) payload.customer_id = opts.customerId;
        if (opts.repliedMessageId) payload.replied_message_id = opts.repliedMessageId;
        if (attachments.length > 0) {
            const ids = attachments.map((a) => a.content_id || a.id).filter(Boolean);
            if (ids.length) payload.content_ids = ids;
        }

        const url = `${WORKER_URL}/api/pancake-official/pages/${encodeURIComponent(pageId)}/conversations/${encodeURIComponent(conversationId)}/messages?page_access_token=${encodeURIComponent(pat)}`;
        try {
            const data = await _fetchJson(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            // Pancake API returns HTTP 200 with `success:false` cho FB errors
            // (24h policy: e_code:10/e_subcode:2018278, post gone: e_code:100,
            // rate limit: e_subcode:3252001, ...). _fetchJson chỉ throw cho
            // non-2xx HTTP. Phải tự check body để tránh silent-success false.
            if (data && data.success === false) {
                const reason =
                    data.message || (data.e_code != null ? `FB error #${data.e_code}` : 'unknown');
                console.warn(
                    '[Web2Chat] sendMessage Pancake returned success:false →',
                    JSON.stringify(data).slice(0, 300)
                );
                return {
                    ok: false,
                    reason,
                    e_code: data.e_code,
                    e_subcode: data.e_subcode,
                    raw: data,
                };
            }
            return { ok: true, message: data?.message || data, raw: data };
        } catch (e) {
            console.warn('[Web2Chat] sendMessage failed:', e.message);
            return { ok: false, reason: e.message };
        }
    }

    // =====================================================
    // Upload media (ảnh/tệp) lên Pancake → trả content_id để gửi kèm sendMessage.
    // POST /api/pancake-official/pages/:pageId/upload_contents?page_access_token=<pat>
    //   FormData: file → { id, attachment_type }
    // Dùng cho fallback Pancake khi extension không có (cùng endpoint web2-pancake
    // PancakeAPI.uploadMedia). Trả { ok, id, attachment_type, reason? }.
    // =====================================================
    async function uploadMedia(pageId, file) {
        if (!pageId || !file) return { ok: false, reason: 'missing_args' };
        const pat = getPageAccessToken(pageId);
        if (!pat) return { ok: false, reason: 'no_page_access_token' };
        try {
            const url = `${WORKER_URL}/api/pancake-official/pages/${encodeURIComponent(pageId)}/upload_contents?page_access_token=${encodeURIComponent(pat)}`;
            const fd = new FormData();
            fd.append('file', file);
            const resp = await fetch(url, { method: 'POST', body: fd });
            if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status}` };
            const data = await resp.json().catch(() => null);
            if (!data || data.success === false || !data.id) {
                return { ok: false, reason: (data && data.message) || 'no_content_id' };
            }
            return { ok: true, id: data.id, attachment_type: data.attachment_type || 'PHOTO' };
        } catch (e) {
            console.warn('[Web2Chat] uploadMedia failed:', e.message);
            return { ok: false, reason: e.message };
        }
    }

    // =====================================================
    // Reply to a comment (public or private reply via DM)
    // =====================================================
    // POST /api/pancake-official/pages/:pageId/comments/:commentId/replies
    //      ?page_access_token=<token>
    // body: { message, type: 'public'|'private' }
    async function replyComment(pageId, commentId, opts = {}) {
        if (!pageId || !commentId) return { ok: false, reason: 'missing_ids' };
        if (_isInstagram(pageId)) return { ok: false, reason: 'instagram_unsupported' };
        const pat = getPageAccessToken(pageId);
        if (!pat) return { ok: false, reason: 'no_page_access_token' };

        const text = (opts.text || '').trim();
        if (!text) return { ok: false, reason: 'empty_message' };

        const url = `${WORKER_URL}/api/pancake-official/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}/replies?page_access_token=${encodeURIComponent(pat)}`;
        try {
            const data = await _fetchJson(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    type: opts.mode === 'private' ? 'private' : 'public',
                }),
            });
            // Pancake trả HTTP 200 + success:false cho FB errors — phải check body.
            if (data && data.success === false) {
                const reason =
                    data.message || (data.e_code != null ? `FB error #${data.e_code}` : 'unknown');
                console.warn(
                    '[Web2Chat] replyComment Pancake returned success:false →',
                    JSON.stringify(data).slice(0, 300)
                );
                return {
                    ok: false,
                    reason,
                    e_code: data.e_code,
                    e_subcode: data.e_subcode,
                    raw: data,
                };
            }
            return { ok: true, message: data?.message || data, raw: data };
        } catch (e) {
            console.warn('[Web2Chat] replyComment failed:', e.message);
            return { ok: false, reason: e.message };
        }
    }

    // =====================================================
    // Token management (write side)
    // =====================================================

    function decodeJwt(token) {
        try {
            const parts = String(token).split('.');
            if (parts.length !== 3) return null;
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            return payload;
        } catch {
            return null;
        }
    }

    function setJwt(token, expiry) {
        if (!token) {
            localStorage.removeItem(LS.JWT);
            localStorage.removeItem(LS.JWT_EXP);
            return { ok: true, cleared: true };
        }
        const decoded = decodeJwt(token);
        const exp = expiry || decoded?.exp || null;
        localStorage.setItem(LS.JWT, token);
        if (exp) localStorage.setItem(LS.JWT_EXP, String(exp));
        return { ok: true, decoded, expiry: exp };
    }

    function setPageAccessToken(pageId, token, meta) {
        if (!pageId || !token) return { ok: false, reason: 'missing_args' };
        const raw = localStorage.getItem(LS.PAGE_TOKENS);
        const map = raw ? JSON.parse(raw) : {};
        map[pageId] = {
            token,
            pageId,
            pageName: meta?.pageName,
            timestamp: Date.now(),
            ...meta,
        };
        localStorage.setItem(LS.PAGE_TOKENS, JSON.stringify(map));
        return { ok: true };
    }

    function getAllPageAccessTokens() {
        try {
            const raw = localStorage.getItem(LS.PAGE_TOKENS);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    function clearAllTokens() {
        localStorage.removeItem(LS.JWT);
        localStorage.removeItem(LS.JWT_EXP);
        localStorage.removeItem(LS.PAGE_TOKENS);
        return { ok: true };
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
            const ownsPage = Array.isArray(acc.pages) && acc.pages.includes(String(pageId));
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

    // --------- Page settings cache (tags, quick replies, ...) ---------
    // Pancake stores tag/QR definitions per-page in
    // `GET /api/v1/pages/{pageId}/settings`. They cache these in Redux
    // (`pageSettingTags` + `lastTagsUpdateTimestamp`) in-memory only — lost
    // on reload. We do stale-while-revalidate via **localStorage**:
    //   • Read instant cached copy if < TTL (settings rarely change).
    //   • Fire revalidate in background — UI updates when fresh data lands.
    // Sit on top of an in-memory Map so multiple concurrent callers share
    // the same single-flight fetch promise.
    const _pageSettingsMem = new Map(); // pageId → { fetchedAt, settings }
    const _pageSettingsInflight = new Map(); // pageId → Promise
    const _PAGE_SETTINGS_TTL_MS = 30 * 60 * 1000; // 30 min — tags change rarely
    const _LS_PAGE_SETTINGS = 'web2_pancake_page_settings_v1';

    function _loadPageSettingsLs() {
        try {
            const raw = localStorage.getItem(_LS_PAGE_SETTINGS);
            if (!raw) return;
            const obj = JSON.parse(raw);
            if (!obj || typeof obj !== 'object') return;
            for (const [pageId, entry] of Object.entries(obj)) {
                if (entry && entry.settings && entry.fetchedAt) {
                    _pageSettingsMem.set(pageId, entry);
                }
            }
        } catch {
            /* ignore corrupt */
        }
    }
    _loadPageSettingsLs();

    function _persistPageSettingsLs() {
        try {
            const obj = {};
            for (const [k, v] of _pageSettingsMem.entries()) obj[k] = v;
            localStorage.setItem(_LS_PAGE_SETTINGS, JSON.stringify(obj));
        } catch (e) {
            // Quota — settings can be large (quick_replies up to 100KB+).
            // Drop oldest entry and retry once.
            if (_pageSettingsMem.size > 1) {
                let oldest = null;
                let oldestT = Infinity;
                for (const [k, v] of _pageSettingsMem.entries()) {
                    if (v.fetchedAt < oldestT) {
                        oldestT = v.fetchedAt;
                        oldest = k;
                    }
                }
                if (oldest) _pageSettingsMem.delete(oldest);
                try {
                    const obj = {};
                    for (const [k, v] of _pageSettingsMem.entries()) obj[k] = v;
                    localStorage.setItem(_LS_PAGE_SETTINGS, JSON.stringify(obj));
                } catch {
                    /* still over quota — give up persisting */
                }
            }
        }
    }

    async function fetchPageSettings(pageId, opts = {}) {
        if (!pageId) return { ok: false, reason: 'missing_pageId' };
        if (_isInstagram(pageId)) return { ok: false, reason: 'instagram_unsupported' };
        const cached = _pageSettingsMem.get(pageId);
        const fresh = cached && Date.now() - cached.fetchedAt < _PAGE_SETTINGS_TTL_MS;
        if (!opts.force && fresh) {
            return { ok: true, settings: cached.settings, cached: true };
        }
        // Single-flight: dedupe concurrent calls for the same page.
        if (_pageSettingsInflight.has(pageId)) {
            return _pageSettingsInflight.get(pageId);
        }
        const jwt = getJwt();
        if (!jwt) {
            // No JWT but we have a stale cache → return it; the caller can
            // still render last-known tag names/colors.
            if (cached) return { ok: true, settings: cached.settings, cached: true, stale: true };
            return { ok: false, reason: 'no_jwt' };
        }
        const url = `${WORKER_URL}/api/pancake/pages/${encodeURIComponent(pageId)}/settings?access_token=${encodeURIComponent(jwt)}`;
        const p = (async () => {
            try {
                const data = await _fetchJson(url, { method: 'GET' });
                if (!data?.success || !data.settings) {
                    return {
                        ok: cached ? true : false,
                        settings: cached?.settings,
                        cached: !!cached,
                        stale: !!cached,
                        reason: data?.message || 'no_settings',
                    };
                }
                const entry = { fetchedAt: Date.now(), settings: data.settings };
                _pageSettingsMem.set(pageId, entry);
                _persistPageSettingsLs();
                return { ok: true, settings: data.settings };
            } catch (e) {
                console.warn('[Web2Chat] fetchPageSettings failed:', e.message);
                if (cached) {
                    return {
                        ok: true,
                        settings: cached.settings,
                        cached: true,
                        stale: true,
                        reason: e.message,
                    };
                }
                return { ok: false, reason: e.message };
            } finally {
                _pageSettingsInflight.delete(pageId);
            }
        })();
        _pageSettingsInflight.set(pageId, p);
        return p;
    }

    // ============================================================
    // LÀM GIÀU KHO KH (web2_customers): mỗi khi bật chat Pancake với 1 KH ở
    // BẤT KỲ trang nào, gửi fb_id (+name/phone nếu có) lên backend để lưu vào
    // kho nếu chưa có. Fire-and-forget, dedup per-session, KHÔNG chặn UX.
    // Mục đích: kho biết đủ id/fb/tên/sđt → resolve + mở chat lần sau nhanh hơn.
    // ============================================================
    const _enrichedFbIds = new Set();
    function enrichCustomer(fbId, opts) {
        opts = opts || {};
        const key = String(fbId || '').trim();
        if (!key || _enrichedFbIds.has(key)) return;
        _enrichedFbIds.add(key);
        try {
            fetch(`${WORKER_URL}/api/web2/customers/enrich-fb`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify({
                    fbId: key,
                    name: opts.name || '',
                    phone: opts.phone || '',
                }),
            }).catch(() => {});
        } catch (_) {}
    }

    window.Web2Chat = {
        // Read
        fetchConversations,
        enrichCustomer,
        fetchConversationsByPage,
        searchConversations,
        fetchMessages,
        fetchPageSettings,
        sendMessage,
        uploadMedia,
        replyComment,
        getJwt,
        getPageAccessToken,
        getAllPageAccessTokens,
        getAllAccounts,
        hasTokensFor,
        decodeJwt,
        // Sync / refresh
        syncFromRenderDB,
        // Write / admin
        setJwt,
        setPageAccessToken,
        clearAllTokens,
        listPages,
        generatePageAccessToken,
        _internal: { WORKER_URL, LS },
    };
})();
