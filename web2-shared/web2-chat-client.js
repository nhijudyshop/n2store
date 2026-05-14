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

    const LS = {
        JWT: 'pancake_jwt_token',
        JWT_EXP: 'pancake_jwt_token_expiry',
        PAGE_TOKENS: 'pancake_page_access_tokens',
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
            return { ok: true, message: data?.message || data, raw: data };
        } catch (e) {
            console.warn('[Web2Chat] sendMessage failed:', e.message);
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

    async function generatePageAccessToken(pageId) {
        if (!pageId) return { ok: false, reason: 'missing_pageId' };
        const jwt = getJwt();
        if (!jwt) return { ok: false, reason: 'no_jwt' };
        const url = `${WORKER_URL}/api/pancake/pages/${encodeURIComponent(pageId)}/generate_page_access_token?access_token=${encodeURIComponent(jwt)}`;
        try {
            const data = await _fetchJson(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (data?.success && data?.page_access_token) {
                setPageAccessToken(pageId, data.page_access_token);
                return { ok: true, token: data.page_access_token };
            }
            return {
                ok: false,
                reason: data?.message || 'unknown_failure',
                raw: data,
            };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    window.Web2Chat = {
        // Read
        fetchConversations,
        fetchMessages,
        sendMessage,
        replyComment,
        getJwt,
        getPageAccessToken,
        getAllPageAccessTokens,
        hasTokensFor,
        decodeJwt,
        // Write / admin
        setJwt,
        setPageAccessToken,
        clearAllTokens,
        listPages,
        generatePageAccessToken,
        _internal: { WORKER_URL, LS },
    };
})();
