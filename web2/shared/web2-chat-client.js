// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Chat client (Pancake + Extension) — FACADE
// =====================================================
//
// Standalone module used by Web 2.0 pages to chat / reply
// comments from a customer order. Built fresh — DOES NOT
// reuse `window.pancakeDataManager` / `pancakeTokenManager`
// from the Web 1.0 modules. Reads token config from
// localStorage (which both layers share as user data, not
// as code).
//
// Refactored 2026-06-19: split into cohesive modules under
// web2/shared/ (MOVE-only, behavior identical). This file is now
// the FACADE that assembles `window.Web2Chat` from the shared
// namespace `window.__Web2ChatNS`, populated by:
//   web2-chat-utils.js     — consts + shared helpers + state
//   web2-chat-tokens.js    — JWT/PAT read/write + RenderDB sync
//   web2-chat-settings.js  — page settings cache (SWR)
//   web2-chat-api.js       — conversations + messages fetch/send
//   web2-chat-live.js      — livestream posts, page list, PAT gen, boost
//   web2-chat-tags.js      — tag list/toggle + tag pills
// Load order (in every consuming HTML): utils → tokens → settings →
// api → live → tags → client(facade) LAST.
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

    const NS = window.__Web2ChatNS;
    if (!NS || !NS._utilsReady) {
        console.error(
            '[Web2Chat] facade loaded but namespace missing — ensure web2-chat-utils.js/' +
                'tokens.js/settings.js/api.js/live.js/tags.js load BEFORE web2-chat-client.js'
        );
        return;
    }

    window.Web2Chat = {
        // Read
        fetchConversations: NS.fetchConversations,
        enrichCustomer: NS.enrichCustomer,
        fetchConversationsByPage: NS.fetchConversationsByPage,
        searchConversations: NS.searchConversations,
        fetchMessages: NS.fetchMessages,
        fetchPageSettings: NS.fetchPageSettings,
        sendMessage: NS.sendMessage,
        uploadMedia: NS.uploadMedia,
        replyComment: NS.replyComment,
        fetchTags: NS.fetchTags,
        toggleTag: NS.toggleTag,
        getJwt: NS.getJwt,
        getPageAccessToken: NS.getPageAccessToken,
        getAllPageAccessTokens: NS.getAllPageAccessTokens,
        getAllAccounts: NS.getAllAccounts,
        hasTokensFor: NS.hasTokensFor,
        decodeJwt: NS.decodeJwt,
        // Sync / refresh
        syncFromRenderDB: NS.syncFromRenderDB,
        // Write / admin
        setJwt: NS.setJwt,
        setPageAccessToken: NS.setPageAccessToken,
        clearAllTokens: NS.clearAllTokens,
        listPages: NS.listPages,
        fetchLivePosts: NS.fetchLivePosts,
        ensureTags: NS.ensureTags,
        tagDefsFor: NS.tagDefsFor,
        resolveTags: NS.resolveTags,
        tagPillsHtml: NS.tagPillsHtml,
        generatePageAccessToken: NS.generatePageAccessToken,
        generateAllPageAccessTokens: NS.generateAllPageAccessTokens,
        sendLiveComment: NS.sendLiveComment,
        getPageAccountJwts: NS.getPageAccountJwts,
        _internal: { WORKER_URL: NS.WORKER_URL, LS: NS.LS },
    };
})();
