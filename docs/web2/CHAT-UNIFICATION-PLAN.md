# Chat Unification Plan — hợp nhất mọi chat Pancake/Zalo về Web2CustomerChat

> Sinh từ workflow discovery 2026-06-18 (45 surfaces, 27 components). Đây là tracker đa-phiên.

## Surfaces (nơi mở chat)

| file                                                      | page                                                  | channel  | current                                               | openedBy                         | features                                                     |
| --------------------------------------------------------- | ----------------------------------------------------- | -------- | ----------------------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| `native-orders/js/native-orders-app.js:4773`              | native-orders                                         | pancake  | Native 3-column modal with Web2ChatPanel              | order                            | sidebar-search, thread, customer-info-panel, comments-tab, o |
| `web2/balance-history/js/web2-balance-history-app.js:646` | balance-history                                       | both     | Web2CustomerChat drawer                               | phone                            | conversation-search, thread, composer/send, customer-info    |
| `web2/jt-tracking/js/jt-tracking-app.js:584`              | jt-tracking                                           | zalo     | Web2Zalo.mountChat in custom drawer                   | conversationId                   | thread, composer/send, autoSeen                              |
| `web2/shared/web2-customer-detail-modal.js:128`           | web2-customers (shared modal)                         | both     | Web2CustomerChat drawer                               | phone                            | conversation-search, thread, composer/send, customer-info    |
| `web2/shared/web2-customer-chat.js:398`                   | web2-shared (launcher)                                | both     | Web2CustomerChat (root 2-tab drawer)                  | phone                            | conversation-search, thread, composer/send, customer-info, t |
| `live-chat/js/pancake/pancake-chat-window.js:1`           | live-chat                                             | pancake  | PancakeChatWindow (Web2ChatPanel wrapper)             | fbUserId+fbPageId                | thread, composer/send, inventory-panel, conversation-list    |
| `live-chat/js/live/live-chat-modal.js:1`                  | live-chat                                             | pancake  | Web2ChatPanel (full mode, no header)                  | conversation-id                  | thread, composer/send, realtime, inventory-panel             |
| `native-orders/js/native-orders-app.js:1367`              | native-orders                                         | both     | Web2ChatPanel via \_mountChatPanel                    | order code                       | conversation-search-list, thread, customer-info-panel, compo |
| `native-orders/js/native-orders-app.js:4773`              | native-orders                                         | both     | Web2ChatPanel                                         | order code via openInteractions  | tabs for messages/comments, search-list, thread, quick-reply |
| `live-chat/js/pancake/pancake-chat-window.js:20`          | live-chat                                             | pancake  | Web2ChatPanel via PancakeChatWindow wrapper           | conversationId                   | composer, realtime, quick-replies, emoji, sticker, avatar, p |
| `web2/jt-tracking/js/jt-tracking-app.js:90`               | jt-tracking                                           | zalo     | Web2Zalo.mountChat                                    | conversationId                   | embedded zalo chat                                           |
| `web2/jt-tracking/js/jt-tracking-app.js:120`              | jt-tracking                                           | both     | Web2CustomerChat drawer                               | phone                            | pancake + zalo drawer tabs                                   |
| `web2/balance-history/js/web2-balance-history-app.js:135` | balance-history                                       | both     | Web2CustomerChat drawer                               | phone                            | pancake + zalo drawer                                        |
| `web2/balance-history/js/web2-balance-history-app.js:150` | balance-history                                       | pancake  | Web2ChatReadonly modal                                | search                           | readonly search + thread                                     |
| `web2/balance-history/js/web2-pending-match.js:10`        | balance-history                                       | pancake  | Web2ChatReadonly                                      | conversationId                   | readonly thread for matching                                 |
| `web2/shared/web2-customer-detail-modal.js:135`           | web2/customers                                        | both     | Web2CustomerChat + Web2ChatReadonly fallback          | phone and search                 | full drawer or readonly modal                                |
| `web2/customers/js/customers-app.js:412`                  | web2/customers                                        | both     | Web2CustomerDetailModal                               | phone+name                       | customer-info                                                |
| `web2/balance-history/js/web2-balance-history-app.js:300` | web2/balance-history                                  | both     | Web2CustomerDetailModal                               | phone+name                       | customer-info                                                |
| `web2/balance-history/js/web2-balance-history-app.js:649` | web2/balance-history                                  | both     | Web2CustomerChat                                      | phone+name                       | drawer                                                       |
| `web2/jt-tracking/js/jt-tracking-app.js:944`              | web2/jt-tracking                                      | both     | Web2CustomerChat                                      | phone+name                       | drawer                                                       |
| `web2/jt-tracking/js/jt-tracking-app.js:622`              | web2/jt-tracking                                      | zalo     | Web2Zalo.mountChat                                    | conversationId                   | group                                                        |
| `native-orders/js/native-orders-app.js:4773`              | native-orders                                         | pancake  | Web2ChatPanel                                         | fbUserId+fbPageId                | 3-column                                                     |
| `native-orders/js/native-orders-app.js:1367`              | native-orders                                         | both     | Web2ChatPanel (3-column modal)                        | order code                       | conversation-search-list, thread, customer-info-panel, comme |
| `web2/balance-history/js/web2-balance-history-app.js:648` | web2/balance-history                                  | both     | Web2CustomerChat drawer                               | phone                            | conversation-search, thread, lazy-load both channels         |
| `web2/jt-tracking/js/jt-tracking-app.js:622`              | web2/jt-tracking                                      | zalo     | Web2Zalo.mountChat drawer                             | conversationId                   | thread, realtime, message-in-chat search                     |
| `web2/jt-tracking/js/jt-tracking-app.js:944`              | web2/jt-tracking                                      | both     | Web2CustomerChat drawer                               | phone                            | conversation-search, thread, lazy-load both channels         |
| `web2/shared/web2-customer-detail-modal.js:135`           | web2/balance-history                                  | both     | Web2CustomerChat drawer                               | phone                            | conversation-search, thread, lazy-load both channels         |
| `live-chat/js/live/live-comment-list.js:555`              | live-chat                                             | pancake  | LiveChatModal Web2ChatPanel modal                     | fbUserId + pageId                | conversation-search, thread, realtime SSE, quick-reply, stic |
| `live-chat/js/pancake/pancake-chat-window.js:29`          | live-chat                                             | pancake  | Web2ChatPanel inline                                  | conversation from PancakeState   | thread, quick-reply, sticker, extension-first send, realtime |
| `web2/shared/web2-customer-chat.js:456`                   | launcher                                              | pancake  | Web2ChatPanel Pancake pane                            | phone or fbId+pageId             | conversation-search-list, thread, lazy-load bundle, quick-re |
| `web2/shared/web2-customer-chat.js:476`                   | launcher                                              | zalo     | Web2Zalo.mountChat Zalo pane                          | phone                            | conversation-search, thread, lazy-load Zalo UI, realtime     |
| `native-orders/js/native-orders-app.js:4773`              | native-orders                                         | pancake  | Web2ChatPanel.mount + custom 3-column modal           | order code                       | search-list sidebar, thread center, customer-info panel righ |
| `web2/shared/web2-customer-chat.js:6`                     | web2 global (jt-tracking, balance-history, customers) | both     | Narrow drawer, Pancake+Zalo tabs, lazy-loads panel    | phone + name                     | conversation search, tab switch, lazy bundle load            |
| `native-orders/js/native-orders-app.js:6705`              | native-orders                                         | pancake  | Web2ChatPanel.mount(host, mode=full, hideHeader=true) | conversation + adapter object    | thread, send, reply, sticker, upload                         |
| `live-chat/js/live/live-chat-modal.js:163`                | live-chat                                             | pancake  | Web2ChatPanel.mount(host, mode=full, hideHeader=true) | fbUserId+pageId from comment row | send, reply, sticker, upload, quick-reply, extension send, m |
| `live-chat/js/pancake/pancake-chat-window.js:29`          | live-chat                                             | pancake  | Web2ChatPanel.mount(host, mode=full)                  | conversation from list           | thread, send, reply, sticker, upload, quick-reply, extension |
| `web2/jt-tracking/js/jt-tracking-app.js:622`              | web2/jt-tracking                                      | zalo     | Web2Zalo.mountChat(containerEl, {convId, autoSeen})   | conversationId + billcode        | readonly, search billcode in thread                          |
| `web2/jt-tracking/js/jt-tracking-app.js:944`              | web2/jt-tracking                                      | both     | Web2CustomerChat.open({phone, name})                  | phone                            | drawer, tabs, lazy load                                      |
| `web2/balance-history/js/web2-balance-history-app.js:649` | web2/balance-history                                  | both     | Web2CustomerChat.open({phone, name})                  | phone                            | drawer, tabs, lazy load                                      |
| `web2/balance-history/js/web2-balance-history-app.js:658` | web2/balance-history                                  | readonly | Web2ChatReadonly.openSearch({})                       | empty (user types)               | search, readonly, no send                                    |
| `web2/balance-history/js/web2-balance-history-app.js:663` | web2/balance-history                                  | readonly | Web2ChatReadonly.open({pageId, psid, name})           | pageId+psid                      | readonly thread, pagination                                  |
| `web2/balance-history/js/web2-pending-match.js:348`       | web2/balance-history (pending-match)                  | readonly | Web2ChatReadonly.openSearch({query})                  | search query prefilled           | search, readonly, picker                                     |
| `web2/customers/js/customers-app.js:673`                  | web2/customers                                        | readonly | Web2Chat.searchConversations (implicit)               | search query                     | pancake fallback search, conversation list                   |
| `web2/shared/web2-customer-detail-modal.js:136`           | web2 shared                                           | both     | Web2CustomerChat.open({phone, name})                  | phone                            | drawer, tabs                                                 |
| `web2/shared/web2-customer-detail-modal.js:161`           | web2 shared                                           | readonly | Web2ChatReadonly.openSearch({query})                  | name or phone                    | search, readonly                                             |

## Components

- **Web2CustomerChat** (`web2/shared/web2-customer-chat.js`) — unified-base: CURRENT narrow drawer component (Pancake + Zalo tabs). To be UPGRADED with 3-column modal interior from na
- **Web2ChatPanel** (`web2/shared/chat-panel/web2-chat-panel.js`) — dependency: Pancake thread UI component. Lazy-loaded by Web2CustomerChat. Mounted in #msgThread by native-orders. Full/d
- **Web2Zalo** (`web2/shared/web2-zalo.js`) — dependency: Zalo thread UI component. Lazy-loaded by Web2CustomerChat on Zalo tab. Mounted in jt-tracking drawer. Handle
- **PancakeChatWindow** (`live-chat/js/pancake/pancake-chat-window.js`) — dependency: Thin adapter wrapper around Web2ChatPanel for live-chat. Keeps old public API compatibility. Used for livest
- **Web2CustomerChat** (`web2/shared/web2-customer-chat.js`) — unified-base
- **Web2ChatPanel** (`web2/shared/chat-panel/web2-chat-panel.js`) — unified-base
- **Web2Chat** (`web2/shared/web2-chat-client.js`) — dependency
- **Web2Zalo** (`web2/shared/web2-zalo.js`) — unified-base
- **Web2ChatReadonly** (`web2/shared/web2-chat-readonly.js`) — dependency
- **Web2ChatEmoji** (`web2/shared/chat-panel/web2-chat-emoji-data.js`) — dependency
- **Web2ChatStickers** (`web2/shared/chat-panel/web2-chat-sticker-data.js`) — dependency
- **Web2ChatEntityDetect** (`web2/shared/chat-panel/web2-chat-entity-detect.js`) — dependency
- **PancakeChatWindow** (`live-chat/js/pancake/pancake-chat-window.js`) — deprecated
- **zalo-chat engine** (`web2/shared/zalo-chat/`) — dependency
- **Web2CustomerChat** (`web2/shared/web2-customer-chat.js`) — unified-base
- **Web2ChatPanel** (`web2/shared/chat-panel/web2-chat-panel.js`) — dependency
- **Web2Zalo** (`web2/shared/web2-zalo.js`) — dependency
- **Web2ChatPanel** (`web2/shared/chat-panel/web2-chat-panel.js`) — unified-base: single component for all Pancake chat UI (native-orders, live-chat modal, pancake-chat-window, Web2Custome
- **Web2CustomerChat** (`web2/shared/web2-customer-chat.js`) — dependency: launcher drawer (Pancake+Zalo tabs 460px). Lazy-loads Web2ChatPanel. Will evolve to 3-column layout.
- **LiveChatModal** (`live-chat/js/live/live-chat-modal.js`) — dependency: modal launcher from live-comment rows. Mounts Web2ChatPanel + PancakeChatWindow adapter. Caches conv 60s TTL
- **PancakeChatWindow** (`live-chat/js/pancake/pancake-chat-window.js`) — dependency: thin wrapper for Pancake page inline. Mounts Web2ChatPanel to #pkChatWindow. Reuses native-orders adapter (W
- **Web2Zalo** (`web2/shared/web2-zalo.js`) — dependency: single-source Zalo integration. Mounts full Zalo chat UI. Ready to consolidate into unified Web2CustomerChat
- **Web2ChatReadonly** (`web2/shared/web2-chat-readonly.js`) — deprecate: read-only modal fallback in customer-detail-modal. Eventually merge into unified Web2CustomerChat as readonly
- **Web2ChatPanel** (`web2/shared/chat-panel/web2-chat-panel.js`) — unified-base
- **Web2CustomerChat** (`web2/shared/web2-customer-chat.js`) — dependency
- **Web2ChatReadonly** (`web2/shared/web2-chat-readonly.js`) — dependency
- **Web2Zalo** (`web2/shared/web2-zalo.js`) — dependency

## MIGRATION PLAN

I have enough grounding. `Web2ChatPanel` already supports `full`/`readonly`/`picker` modes, `hideHeader`, and a clean adapter contract. The native-orders 3-column functions are all confirmed at the cited lines. Here is the migration plan.

---

# Migration Plan: Unify all Web 2.0 customer-chat UIs into `Web2CustomerChat`

**Goal:** One launcher, `Web2CustomerChat.open(...)`, renders a 3-column Pancake inbox (search-list + thread + info) plus a Zalo channel, and every pancake/zalo chat surface calls it. `Web2ChatPanel` / `Web2Zalo` / `Web2Chat` stay as dependencies; bespoke modals get deleted or reduced to thin shims.

Current reality (verified):

- `web2/shared/web2-customer-chat.js` is a **460px 2-tab drawer, no sidebar search, no info panel** (lines 343–366 CSS, `open()` 398–546). It already has the hard parts: `resolvePancakeConv` (multi-page phone search, 109–135), `_resolveConvByFbId` (384–396), extension-first send (`_trySendViaExtension` 146–233, `_performSend` 234–293), self-contained Pancake adapter (`buildPancakeAdapter` 296–338), lazy panel bundle (64–79), Zalo lazy-mount (465–491).
- `Web2ChatPanel.mount(container, {mode:'full'|'readonly'|'picker', hideHeader})` is the thread engine — **no change needed**, already supports readonly and the full adapter contract (`web2-chat-panel.js:161,209,221,1002–1042`).
- native-orders (`native-orders-app.js`) already has the full 3-column implementation to port: shell `_renderInboxSidebarShell` (5134), load `_loadInboxSidebar` (5617), search `_wireSidebarSearch` (5690), filter `_wireSidebarFilter` (6137), realtime `_wireSidebarRealtime` (6439), merged fetch `_fetchConvsMerged` (5389), row `_convRowHtml` (6246), switch `_switchChatToCustomer` (6604), info `_renderInfoTab` (5202), avatar `_avatarUrl` (7398), header `_renderChatHeaderInner` (4791) / `_applyChatHeaderForOrder` (4840), CSS `_ensureChatModalCss` (7524).

---

## 1. Unified `Web2CustomerChat` target API

Backward-compatible superset of today's `open(opts)`. All keys optional except an identity (one of: `phone`, `fbId`+`pageId`, or `conversationId`+`pageId`).

```js
Web2CustomerChat.open({
    // ── identity / open-mode (provide at least one) ──
    phone, // string — multi-page resolve via resolvePancakeConv (today)
    fbId,
    pageId, // direct PSID+page resolve via _resolveConvByFbId (today)
    conversationId, // open a known conv directly (jt-tracking/pending-match readonly)
    customerId, // Pancake customer UUID (optional, speeds message fetch)
    name, // display name for header/avatar fallback

    // ── channel + default tab ──
    channel: 'pancake' | 'zalo', // default 'pancake'; 'zalo' opens Zalo tab first

    // ── layout ──
    layout: 'drawer' | 'modal', // 'drawer' = today's 460px right slide (default);
    // 'modal'  = full 3-column inbox (96vw×92vh)
    panels: {
        // only meaningful in layout:'modal'
        search: true, // LEFT sidebar conversation search-list
        info: true, // RIGHT customer-info panel
        comments: false, // center Messages/Comments tabs
        orderHistory: false, // RIGHT past-orders section
    },

    // ── behavior ──
    readonly: false, // → Web2ChatPanel mode:'readonly' (no composer)
    zaloEnabled: true, // hide Zalo tab when false (pancake-only surfaces)
    pancakeEnabled: true, // hide Pancake tab when false (zalo-only surfaces)

    // ── context for info/comments/quick-reply (caller-supplied, all optional) ──
    context: {
        order, // order object → drives info panel + comments
        quickReplies, // [] or fn → quick-reply tags
        onAddEntity, // ({phone,address,name}) → caller upsert hook
        extraInfoHtml, // arbitrary right-panel HTML block
    },
}); // → { close(), switchTab(ch), reloadSidebar(), getPanel() }
```

Rules:

- **Default `layout:'drawer'`** keeps all 11 existing callers working unchanged.
- `layout:'modal'` + `panels.search` enables the ported sidebar; native-orders becomes a caller that passes `layout:'modal', panels:{search,info,comments,orderHistory:true}, context:{order}`.
- `readonly:true` is what replaces `Web2ChatReadonly` — passed straight to `Web2ChatPanel.mount({mode:'readonly'})`.
- `conversationId`+`pageId` is a new resolve branch (add `_resolveConvById(pageId, conversationId)` alongside the two existing resolvers) for pending-match / jt-tracking direct opens.

---

## 2. What to PORT from native-orders into `Web2CustomerChat`

Port these into `web2-customer-chat.js` as internal helpers, **generalized to take `pageIds`/`opts` instead of an `order`** (replace `order.fbPageId`/`order.phone` reads with resolver inputs). Each maps 1:1 to a cited source function:

| Port                                                  | From native-orders | Purpose in unified component                                                                             |
| ----------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| `_renderInboxSidebarShell()`                          | `:5134`            | LEFT search input + filter button + list skeleton                                                        |
| `_loadInboxSidebar(ctx)`                              | `:5617`            | async fill list; wires rows/search/filter/realtime                                                       |
| `_fetchConvsMerged(pageIds, 50)`                      | `:5389`            | multi-page merge, dedupe by id, sort by `updated_at`                                                     |
| `_convRowHtml(c, ctx)`                                | `:6246`            | one conversation row (avatar/name/snippet/time/unread/tags)                                              |
| `_switchChatToCustomer(ctx, fbId, name, pageId)`      | `:6604`            | swap thread + header in place without re-resolving                                                       |
| `_wireSidebarSearch(ctx, baseline)`                   | `:5690`            | 300ms debounce, `Web2Chat.searchConversations`, AbortController, client fallback, diacritics-insensitive |
| `_wireSidebarFilter(ctx)`                             | `:6137`            | tag include/exclude + conditions, `localStorage` per page                                                |
| `_wireSidebarRealtime(ctx)`                           | `:6439`            | WS row updates across pages                                                                              |
| `_renderInfoTab(ctx)`                                 | `:5202`            | RIGHT customer card + order + notes (gated by `panels.info`)                                             |
| `_renderInboxRightPanel(ctx)`                         | `:5189`            | right-column wrapper                                                                                     |
| `_renderChatHeaderInner` / `_applyChatHeaderForOrder` | `:4791/:4840`      | header avatar+info + in-place swap on row click                                                          |
| `_avatarUrl(fbId, pageId)` + initials fallback        | `:7398`            | worker-proxy avatars everywhere (sidebar/header/card/bubbles)                                            |
| `_renderCommentsPanel(ctx)`                           | `:9164`            | Messages/Comments tab (gated by `panels.comments`)                                                       |
| `_ensureChatModalCss()` → merge into `ensureStyles()` | `:7524`            | 3-column grid CSS (`w2-inbox-grid 320px 1fr 380px`); keep `.w2cc-` drawer CSS for `layout:'drawer'`      |
| `W2_DEFAULT_QUICK_TAGS` + `_renderQuickReplyTags`     | `:5267/:5310`      | optional quick-reply tags via `context.quickReplies`                                                     |

**Do NOT port** (already in `Web2CustomerChat`, superior or equivalent): send path (`_trySendViaExtension`/`_performSend` already cover extension-first + 24h bypass + PAT retry), `resolvePancakeConv`, `_resolveConvByFbId`, panel bundle lazy-load, Zalo mount.

**Move into a helper** (CLAUDE.md note 8 from inventory): `_resolveInboxConvByPhone` (`:5441`) logic is essentially `resolvePancakeConv` — keep the single `Web2CustomerChat.resolvePancakeConv` as the canonical phone→conv resolver; native-orders should call it rather than keep its own copy.

Refactor `buildPancakeAdapter` (296) to accept an optional `context` so `quickReplies`/`onAddEntity` flow through (today they're stubbed: `quickReplies(){return []}`).

---

## 3. Per-surface migration table

Effort key: **Trivial** = already calls `Web2CustomerChat.open`, only param tidy. **Medium** = swap a bespoke wrapper for `open(...)` with new flags. **Complex** = needs ported features first.

### Trivial — already on `Web2CustomerChat.open`, just normalize params

| Surface                                                 | Action                                            |
| ------------------------------------------------------- | ------------------------------------------------- |
| `web2/balance-history/...:646/648/649`                  | Keep `open({phone,name})`. No change.             |
| `web2/jt-tracking/...:120/944`                          | Keep `open({phone,name})`. No change.             |
| `web2/shared/web2-customer-detail-modal.js:128/135/136` | Keep `open({phone,name,fbId,pageId})`. No change. |
| `web2/shared/web2-customer-chat.js:398/456/476`         | This **is** the component — internal.             |

### Medium — replace a bespoke chat-open with `open(...)`

| Surface                                                                                      | Current                                                                    | Replace with                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web2/jt-tracking/...:584/622` (Zalo-only drawer via `Web2Zalo.mountChat`)                   | custom `jt-drawer` + `Web2Zalo.mountChat('#jtChatBody',{convId,autoSeen})` | `Web2CustomerChat.open({ conversationId: convId, channel:'zalo', pancakeEnabled:false })`. Move `findMessageInChat(billcode)` into a `context.onReady(handle)` callback. Delete `jt-drawer` HTML + close/Esc plumbing. **Needs:** Zalo open-by-`conversationId` (Zalo tab today only takes `phone`) — small add to `mountZalo()`. |
| `web2/balance-history/...:150/658` (`Web2ChatReadonly.openSearch`)                           | readonly search modal, no phone                                            | `Web2CustomerChat.open({ layout:'modal', panels:{search:true}, readonly:true, pancakeEnabled:true, zaloEnabled:false })`. **Needs:** sidebar-search ported (§2) + empty-identity open allowed when `panels.search` (sidebar lets user pick).                                                                                      |
| `web2/balance-history/...:663` (`Web2ChatReadonly.open({pageId,psid,name})`)                 | direct readonly conv                                                       | `Web2CustomerChat.open({ fbId:psid, pageId, name, readonly:true, zaloEnabled:false })`.                                                                                                                                                                                                                                           |
| `web2/balance-history/web2-pending-match.js:10/348` (`Web2ChatReadonly.openSearch({query})`) | readonly picker prefilled                                                  | `Web2CustomerChat.open({ phone:query, layout:'modal', panels:{search:true}, readonly:true, zaloEnabled:false })`. Pre-seed search field with `query`.                                                                                                                                                                             |
| `web2/customers/customers-app.js:673` (implicit `Web2Chat.searchConversations` fallback)     | raw API search list                                                        | `Web2CustomerChat.open({ phone:query, layout:'modal', panels:{search:true}, zaloEnabled:false })`.                                                                                                                                                                                                                                |
| `web2/shared/web2-customer-detail-modal.js:161` (`Web2ChatReadonly.openSearch` fallback)     | readonly fallback                                                          | same as above (`layout:'modal', panels:{search:true}, readonly:true`).                                                                                                                                                                                                                                                            |
| `live-chat/.../live-chat-modal.js` + `pancake-chat-window.js`                                | mount `Web2ChatPanel` directly with custom adapters                        | **Keep `Web2ChatPanel` direct mounts** — these are inline livestream panes, not pop-open chats. Reduce duplication by having them import the now-shared `buildPancakeAdapter`/`_avatarUrl` from `Web2CustomerChat._internal` rather than maintaining parallel adapters. No `open()` call.                                         |

### Complex — needs new `Web2CustomerChat` capabilities first

| Surface                                                         | Current                                                          | Blocker → required gain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native-orders-app.js:4773/1367` (the 3-column reference modal) | bespoke `openInteractions` → `_renderInteractionsModal` 3-column | Migrate **last**, after §2 port lands. Replace body of `openInteractions(code,tab)` with `Web2CustomerChat.open({ phone:order.phone, fbId:order.fbUserId, pageId:order.fbPageId, name:order.customerName, layout:'modal', panels:{search:true,info:true,comments:true,orderHistory:true}, context:{ order, quickReplies, onAddEntity } , initialTab: tab })`. **Needs first:** ported sidebar/info/comments/quick-reply/onAddEntity all wired (§2). This is the validation that the port is faithful — keep the old code path behind a feature flag until visually verified, then delete. |

**Surfaces that need a feature Web2CustomerChat must gain first (summary flags):**

- Zalo open by `conversationId` (jt-tracking `:622`).
- `layout:'modal'` + `panels.search` sidebar (all readonly-search + native-orders).
- `readonly` pass-through (all `Web2ChatReadonly` callers).
- `context.order` driven info/comments/quick-reply/onAddEntity (native-orders).
- empty-identity open permitted when `panels.search` is on (search-first flows).

---

## 4. Components: deprecate vs keep

**Keep as dependency (no API change):**

- `Web2ChatPanel` (`chat-panel/web2-chat-panel.js`) — the thread engine; already supports `full`/`readonly`/`picker` + `hideHeader`. Unchanged.
- `Web2Zalo` (`web2-zalo.js`) — Zalo channel engine. Add one entry: `mountChat(host,{conversationId})` support. Otherwise unchanged.
- `Web2Chat` (`web2-chat-client.js`) — API client. Unchanged.
- Sub-deps `Web2ChatEmoji`, `Web2ChatStickers`, `Web2ChatEntityDetect`, `zalo-chat` engine — unchanged (loaded via bundle).

**Deprecate → delete after migration:**

- `Web2ChatReadonly` (`web2-chat-readonly.js`) — fully replaced by `Web2CustomerChat.open({readonly:true, panels.search})`. Remove its 5 call sites (table §3), then delete the file + its `<script>`/CSS includes.
- `Web2CustomerDetailModal` chat path — keep the **detail modal** (info/wallet/orders tabs) but its `openChat()` already delegates to `Web2CustomerChat`; no further work beyond confirming params.

**Reduce to thin shim (keep file, gut internals):**

- `PancakeChatWindow` (`live-chat/.../pancake-chat-window.js`) — already a thin `Web2ChatPanel` wrapper; keep for live-chat backward-compat but point its adapter at the shared `buildPancakeAdapter`. Do not delete (livestream relies on its public API).
- `LiveChatModal` (`live-chat/.../live-chat-modal.js`) — keep (livestream-specific cache/SSE), but reuse shared `_avatarUrl` + adapter.

Net: **delete `Web2ChatReadonly`**; everything else converges on `Web2CustomerChat` (launcher) → `Web2ChatPanel` + `Web2Zalo` (engines) → `Web2Chat` (API).

---

## 5. Implementation order (smallest-risk first) + verification

> Web 2.0 is BETA (CLAUDE.md): wipe/iterate freely on `web2_*`. Follow UI-first (note 8) and SSE-realtime (note 6). Test only with clone phone `0123456788` on prod; seed fake data locally.

**Phase 0 — additive flags, zero behavior change (no risk)**

1. Add `layout`, `panels`, `readonly`, `zaloEnabled`/`pancakeEnabled`, `conversationId`, `context` to `open()` with defaults that reproduce today's drawer exactly. Tab visibility honors `*Enabled`.
2. Add `_resolveConvById(pageId, conversationId)` + `readonly` pass-through to `Web2ChatPanel.mount`.
3. Add Zalo `conversationId` support in `mountZalo()`.
    - **Verify:** all 11 existing drawer callers behave identically (balance-history, jt-tracking, customer-detail). Browser-test via `web2/overview` then each page (clone phone).

**Phase 1 — retire `Web2ChatReadonly` (low risk, isolated)** 4. Implement `layout:'modal'` shell + ported `_renderInboxSidebarShell`/`_loadInboxSidebar`/`_fetchConvsMerged`/`_convRowHtml`/`_wireSidebarSearch`/`_switchChatToCustomer` (search-only, no info/comments yet). Merge `_ensureChatModalCss` grid into `ensureStyles`. 5. Repoint the 5 `Web2ChatReadonly` call sites (§3 medium) to `open({readonly,panels.search})`. 6. Delete `web2-chat-readonly.js` + includes.

- **Verify:** balance-history readonly search + pending-match picker + customers fallback + detail-modal fallback all open, search works, readonly (no composer) confirmed.

**Phase 2 — jt-tracking Zalo (low risk)** 7. Replace jt-tracking `:622` custom Zalo drawer with `open({conversationId,channel:'zalo',pancakeEnabled:false})`; move `findMessageInChat` to `context.onReady`. Delete `jt-drawer`.

- **Verify:** Zalo thread opens by convId, billcode message highlighted, Esc/backdrop close.

**Phase 3 — port info/comments/quick-reply/filter/realtime (medium risk)** 8. Port `_renderInfoTab`/`_renderInboxRightPanel`, `_renderCommentsPanel`, `_renderChatHeaderInner`/`_applyChatHeaderForOrder`, `_wireSidebarFilter`, `_wireSidebarRealtime`, quick-reply tags — all gated by `panels.*`/`context`.

- **Verify:** open `layout:'modal'` from a test order context; info panel + comments tab + quick-reply + sidebar filter + realtime row updates all functional.

**Phase 4 — migrate native-orders (highest risk, last)** 9. Behind a flag, route `openInteractions` through `Web2CustomerChat.open({layout:'modal', panels:{search,info,comments,orderHistory}, context:{order,...}})`. Side-by-side compare with legacy modal. 10. After parity confirmed, delete legacy `_renderInteractionsModal` + the ~14 now-duplicated native functions; have native call the canonical `resolvePancakeConv`. - **Verify:** full 3-column flow — sidebar search/filter/realtime, thread load + extension-first send (24h bypass) with clone `0123456788`, comments tab, info/order-history panel, avatar fallbacks, header swap on row click. Confirm send still goes extension-first then Web2Chat with PAT retry.

**Cross-cutting verification checklist (every phase):**

- [ ] All existing drawer callers unchanged (regression).
- [ ] SSE/WS realtime: new message appends in thread + updates sidebar row (no poller — CLAUDE.md note 6).
- [ ] Extension-first send + 24h bypass works (load browser test with `--ext n2store-extension`).
- [ ] Avatars use worker proxy with gradient-initials fallback everywhere.
- [ ] Pancake tags render (pills) in header + info + rows.
- [ ] GMT+7 timestamps (CLAUDE.md note 10).
- [ ] `web2-auth.js` base-URL is the only URL source (no new hardcodes).
- [ ] Modal anti-lag class contract (`modal-content`/`modal-body`, no `backdrop-filter: blur`, passive scroll listeners) — CLAUDE.md note 7.
- [ ] After each commit: update `docs/dev-log.md` + `web2/overview/index.html` + `docs/web2/WEB2-PAGES-ANALYSIS.md` (CLAUDE.md note 9).
- [ ] Browser-test each migrated page via `web2/overview` first, clone phone only.
- [ ] `Web2ChatReadonly` file + all `<script>`/CSS references removed (grep clean).

---

## Key files

- Component to upgrade: `/Users/mac/Desktop/n2store/web2/shared/web2-customer-chat.js`
- Engine (unchanged dep): `/Users/mac/Desktop/n2store/web2/shared/chat-panel/web2-chat-panel.js`
- Zalo engine (1 add): `/Users/mac/Desktop/n2store/web2/shared/web2-zalo.js`
- API client (unchanged): `/Users/mac/Desktop/n2store/web2/shared/web2-chat-client.js`
- Port source (3-column reference): `/Users/mac/Desktop/n2store/native-orders/js/native-orders-app.js` (functions at lines 4773, 5134, 5189, 5202, 5267, 5389, 5441, 5617, 5690, 6137, 6246, 6439, 6604, 7398, 7524, 9164)
- To delete: `/Users/mac/Desktop/n2store/web2/shared/web2-chat-readonly.js`
- Caller files to repoint: `web2/balance-history/js/web2-balance-history-app.js` (150/658/663), `web2/balance-history/js/web2-pending-match.js` (10/348), `web2/jt-tracking/js/jt-tracking-app.js` (584/622), `web2/customers/js/customers-app.js` (673), `web2/shared/web2-customer-detail-modal.js` (161)
- Live-chat thin-shim files (keep, dedupe adapter): `live-chat/js/pancake/pancake-chat-window.js`, `live-chat/js/live/live-chat-modal.js`
