// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Chat client / API (conversations + messages: fetch/send)
// =====================================================
//
// Core conversation + message surface for the Web2Chat module set:
// fetch the page conversation list, server-side search, per-customer
// conversation lookup (with short-lived cache + kho-KH enrichment),
// dual-endpoint message fetch (direct JWT → official PAT fallback),
// send message, upload media, reply comment. State/helpers come from
// `window.__Web2ChatNS`. Load AFTER utils + tokens + settings.

(function () {
    'use strict';

    if (window.Web2Chat) return; // idempotent — facade already built
    const NS = window.__Web2ChatNS;
    if (!NS || !NS._tokensReady) {
        console.error('[Web2Chat] api module loaded before utils/tokens');
        return;
    }
    if (NS._apiReady) return;
    NS._apiReady = true;

    const { WORKER_URL } = NS;
    const { _isInstagram, _fetchJson, _authHeaders, getJwt, getPageAccessToken } = NS;
    const _convCache = NS._convCache;
    const CONV_CACHE_TTL = NS.CONV_CACHE_TTL;
    const _enrichedFbIds = NS._enrichedFbIds;

    // ============================================================
    // LÀM GIÀU KHO KH (web2_customers): mỗi khi bật chat Pancake với 1 KH ở
    // BẤT KỲ trang nào, gửi fb_id (+name/phone nếu có) lên backend để lưu vào
    // kho nếu chưa có. Fire-and-forget, dedup per-session, KHÔNG chặn UX.
    // Mục đích: kho biết đủ id/fb/tên/sđt → resolve + mở chat lần sau nhanh hơn.
    // ============================================================
    function enrichCustomer(fbId, opts) {
        opts = opts || {};
        const key = String(fbId || '').trim();
        if (!key || _enrichedFbIds.has(key)) return;
        _enrichedFbIds.add(key);
        try {
            fetch(`${WORKER_URL}/api/web2/customers/enrich-fb`, {
                method: 'POST',
                headers: _authHeaders({ 'Content-Type': 'application/json' }),
                keepalive: true,
                body: JSON.stringify({
                    fbId: key,
                    name: opts.name || '',
                    phone: opts.phone || '',
                }),
            }).catch(() => {});
        } catch (_) {}
    }

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
        // opts.pageAccessToken: override PAT (đa nhiệm nhiều account — mỗi worker 1 PAT).
        const pat = opts.pageAccessToken || getPageAccessToken(pageId);
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
        // reply_comment BẮT BUỘC message_id = id comment để reply vào (format
        // <post_id>_<comment_id>, = conv.id cho COMMENT thread). Thiếu → Pancake trả
        // success:false error_code:100 "Missing required field: 'message_id'".
        if (opts.messageId) payload.message_id = opts.messageId;
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

    // ── Expose on namespace ───────────────────────────────────────────
    NS.enrichCustomer = enrichCustomer;
    NS.fetchConversationsByPage = fetchConversationsByPage;
    NS.searchConversations = searchConversations;
    NS.fetchConversations = fetchConversations;
    NS.fetchMessages = fetchMessages;
    NS.sendMessage = sendMessage;
    NS.uploadMedia = uploadMedia;
    NS.replyComment = replyComment;
})();
