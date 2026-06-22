<!-- #Note: Build spec sinh bởi research workflow 2026-06-13. Đọc trước khi code chat Zalo. | WEB2.0 -->

I now have full grounding on the exact code, function names, route patterns, zca service shape, and schema. I'll produce the build spec.

# BUILD SPEC — Web 2.0 Zalo "Hội thoại" → Full Zalo-like Customer Chat

Target: `/Users/mac/Desktop/n2store/web2/zalo/` (frontend) + `render.com/routes/web2-zalo.js` / `services/web2-zalo-zca.js` / `db/web2-zalo-schema.js` (backend). All Web 2.0 conventions apply: pool `web2Db || chatDb`, SSE hub `web2RealtimeSseRoutes`, GMT+7 display, `WEB2.0` marker + `#Note` header on every new file, `Web2Optimistic` for mutations, `referrerpolicy="no-referrer"` on all Zalo CDN media, files < 400 lines.

Verified against source: `send()` (zca.js:299) calls `api.sendMessage(string, threadId, tt)`; route `/send-message` (route:528) inserts an `out` row + fires `web2:zalo:messages`; `_persistIncoming` (route:101) fires `web2:zalo:messages` + `web2:zalo:conv:<id>`; `_normMessage` (zca.js:120) already produces `{msgId, threadType, direction, msgType, content, attachments, senderUid, senderName, sentAt, raw:d}`; `_classifyMsgType` (zca.js:63) already maps voice/location/contact. The current `send()` returns only `{success, msgId, raw}` — no `cliMsgId`, which several zca methods require (recall/undo, reactions, seen). **This is the single most important backend gap.**

---

## 1. SCOPE

### P0 — BUILD NOW

**Send / compose**

- Send text [zca-supported] — `api.sendMessage` (already wired via `send()`).
- Send image(s), paste-from-clipboard, drag-drop [zca-supported] — `api.uploadAttachment` → `api.sendMessage({attachments})`. Audit "send image(s)" + "upload attachment".
- Send file/document [zca-supported] — same `uploadAttachment` → `sendMessage`. Audit "send file".
- Send sticker [zca-supported] — `api.sendSticker({id,cateId,type})`; browse via `api.getStickers`/`searchSticker`/`getStickersDetail`. Audit "send sticker" + 3 sticker getters.
- Reply / quote [zca-supported] — `api.sendMessage({msg, quote})` where quote = `SendMessageQuote` from original `Message.data`. Audit "reply to/quote message".
- Quick replies / saved templates (`/` trigger) [zca-supported] — `api.getQuickMessageList` + `api.addQuickMessage`; sending uses normal send path. Audit "quick replies" + "add/create quick message".
- Emoji picker (insert as text) [client-only] — pure composer text insertion.

**Message lifecycle**

- Optimistic send w/ status ticks (⏳ sending → ✓ sent → ✓✓/Đã xem) [zca-supported for the seen leg] — local optimistic state reconciled by `_persistIncoming` echo + `seen_messages` listener. Audit "send seen receipt", `listener.on('seen_messages')`.
- Failed-send retry [client-only + zca re-send] — `Web2Optimistic` snapshot/rollback; retry re-runs same payload.
- Recall / undo own message [zca-supported] — `api.undo({msgId, cliMsgId}, threadId, type)`. Audit "recall/undo own message". **Requires `cli_msg_id` persisted on out rows.**
- Emoji reactions on messages [zca-supported, add-only] — `api.addReaction(icon, {data:{msgId,cliMsgId}, threadId, type})`. Audit "react to message". **Removal NOT supported** by zca (audit `supported:false` for removeReaction) → see "impossible".
- Forward message [zca-supported] — `api.forwardMessage({message}, threadIds, type)`. Audit "forward message". (Promote from P1 since cheap once picker exists; keep P1 if time-boxed.)

**Read-side (client-only render polish over loaded messages)**

- Image lightbox / full-screen viewer [client-only]
- Multi-photo grid (album bubble) [client-only]
- Message grouping by sender [client-only]
- Date separators (sticky day chip, GMT+7) [client-only]
- Unread divider + scroll-to-first-unread [client-only]
- Scroll-to-bottom FAB w/ new-message count [client-only]
- Link preview rendering [client-only render] — render-only over existing `attachments`/content; no zca `parseLink` call needed for P0.
- In-conversation search [client-only] over loaded messages.

**Realtime / receipts**

- Customer typing indicator (inbound) [zca-supported] — `listener.on('typing')`. Outbound typing optional. Audit "send typing indicator" + `listener.on('typing')`.
- Seen / read receipts [zca-supported] — `api.sendSeenEvent` on open; inbound via `listener.on('seen_messages')`/`delivered_messages`. Audit "send seen receipt" + listeners.
- Conversation list unread/search/sort (already exists, extend) [zca-supported].

**Group history backfill** [zca-supported, groups only] — `api.getGroupChatHistory(groupId, count)`. Already wrapped (`getGroupChatHistory`, zca.js:391). Wire a "load older" button **for group threads only**.

### Deferred (P1/P2, after P0 ships)

- Sticker recents/packs polish [zca-supported] — P1.
- Drag product-into-chat card [zca-supported send] — P1 (depends on cart/product data plumbing).
- Voice playback (receive) [client-only render] + record-send [zca-supported via `sendVoice` but needs pre-hosted URL] — P2. Receiving render is cheap; sending needs an upload-to-URL host we don't have → P2/omit-send.
- Send video by URL [zca-supported] — `api.sendVideo` needs pre-hosted `videoUrl`+`thumbnailUrl`; we have no host → P2/omit until upload story exists. (Image/file go via `uploadAttachment`, video does NOT in the audit.)
- Pin/mute conversation [zca-supported] — `setPinnedConversations`/`getPinConversations`/`setMute` — P2.
- Mark unread/read list badges [zca-supported] — `addUnreadMark`/`removeUnreadMark` — P2.
- Send card/contact [zca-supported] — `sendCard` — P2.
- Send link with preview card [zca-supported] — `sendLink` — P2 (P0 only renders inbound link previews).
- Tags/labels & agent assignment [web2 store] — P2.
- Reduced-motion/a11y hardening — interwoven into P0 (required by rules), full audit P2.

### IMPOSSIBLE / OMIT (state explicitly in code comments)

- **1-1 (user) message history backfill** — zca audit "load older messages": `getGroupChatHistory` is **GROUP ONLY**; no 1-1 user history API exists. zca.js:335 comment already states this. → 1-1 older messages only exist from the moment the listener connected forward. "Load older" button shows **only for `thread_type='group'`**; for user threads, no backfill — document in `bubbles.js`.
- **Remove a reaction** — no `removeReaction` in zca-js v2.1.2 (audit `supported:false`). → reactions are **add-only**; UI must not show a remove affordance. Inbound `reaction` events with `rType` indicating removal (if any) handled defensively but no outbound remove.
- **Per-message read state for arbitrary history** — seen is only reliable for the latest outbound message via `seen_messages`; render "Đã xem" only on last outbound bubble.

---

## 2. BACKEND CHANGES (render.com)

### 2.1 New zca service functions — `render.com/services/web2-zalo-zca.js`

Add after `send()` (line 307). All use `const api = _requireApi(accountKey)` and `ThreadType.Group`/`User` mapping. Export each in `module.exports` (line 442).

**Critical fix to existing `send()`** — capture `cliMsgId` so recall/react/seen work:

```js
// send() — return cliMsgId too (api.sendMessage result: {message:{msgId}, ...})
const m = res?.message || (Array.isArray(res) ? res[0] : res) || {};
return {
    success: true,
    msgId: m.msgId || res?.msgId || null,
    cliMsgId: m.cliMsgId || res?.cliMsgId || null,
    raw: res,
};
```

| Wrapper signature (new)                                         | zca method (from audit)                                                                                                        | Returns                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sendMedia(accountKey, threadId, sources, caption, threadType)` | `api.uploadAttachment(sources, threadId, tt)` → `api.sendMessage({ msg: caption                                                |                                                                    | '', attachments: uploaded }, threadId, tt)` | `{success, msgId, cliMsgId, attachments:[{url,thumb,...}], raw}` — map upload result (`normalUrl/thumbUrl/fileUrl/fileType/width/height`) into our `{type,url,thumb,href,title}` shape for persistence |
| `sendSticker(accountKey, threadId, sticker, threadType)`        | `api.sendSticker({id, cateId, type}, threadId, tt)`                                                                            | `{success, msgId, raw}`                                            |
| `react(accountKey, threadId, dest, icon, threadType)`           | `api.addReaction(Reactions[icon], { data:{msgId, cliMsgId}, threadId, type:tt })`                                              | `{success, msgIds, raw}`                                           |
| `recall(accountKey, threadId, msgId, cliMsgId, threadType)`     | `api.undo({ msgId, cliMsgId }, threadId, tt)`                                                                                  | `{success, status, raw}`                                           |
| `forward(accountKey, message, threadIds, threadType)`           | `api.forwardMessage({ message }, threadIds, tt)`                                                                               | `{success, sent:[...], fail:[...], raw}`                           |
| `sendTyping(accountKey, threadId, threadType)`                  | `api.sendTypingEvent(threadId, tt)`                                                                                            | `{success, status}`                                                |
| `sendSeen(accountKey, messages, threadType)`                    | `api.sendSeenEvent(messages, tt)` (messages = `{msgId,cliMsgId,uidFrom,idTo,msgType,st,at,cmd,ts}` from listener-stored `raw`) | `{success, status}`                                                |
| `getStickers(accountKey, keyword)`                              | `api.getStickers(keyword)` → ids; then `api.getStickersDetail(ids)`                                                            | `{success, stickers:[{id,cateId,type,stickerUrl,stickerWebpUrl}]}` |
| `searchSticker(accountKey, keyword, limit)`                     | `api.searchSticker(keyword, limit)`                                                                                            | `{success, stickers:[{cate_id, sticker_id, type}]}`                |
| `getQuickMessages(accountKey)`                                  | `api.getQuickMessageList()`                                                                                                    | `{success, items:[...]}`                                           |
| `addQuickMessage(accountKey, keyword, title, media)`            | `api.addQuickMessage({keyword, title, media})`                                                                                 | `{success, item}`                                                  |

`getGroupChatHistory` (zca.js:391) already exists — reuse for group "load older".

**Extend `_attachListener` (zca.js:165)** — add listeners; route raw event through new callbacks:

```js
listener.on('typing', (e) => _cb.onTyping?.(_normTyping(accountKey, e)));
listener.on('seen_messages', (e) => _cb.onSeen?.(_normSeen(accountKey, e)));
listener.on('delivered_messages', (e) => _cb.onDelivered?.(_normDelivered(accountKey, e)));
listener.on('reaction', (e) => _cb.onReaction?.(_normReaction(accountKey, e)));
listener.on('undo', (e) => _cb.onUndo?.(_normUndo(accountKey, e)));
```

Add normalizers `_normTyping/_normSeen/_normReaction/_normUndo` (each < 12 lines) producing flat shapes:

- typing → `{accountKey, threadId, senderUid:data.uid, isGroup, ts}`
- seen → `{accountKey, threadId, msgId:data.msgId, seenUids, ts}`
- reaction → `{accountKey, threadId, msgId, cliMsgId, uidFrom, icon:content.rIcon, rType, source, ts}`
- undo → `{accountKey, threadId, msgId:content.globalMsgId||data.msgId, cliMsgId, uidFrom, ts}`

Extend `configure()` (zca.js:38) `_cb` to include `onTyping, onSeen, onDelivered, onReaction, onUndo`.

**`_normMessage` (zca.js:120) changes** — also surface reply + cliMsgId so inbound replies render and recall works:

```js
// add to returned object:
cliMsgId: d.cliMsgId || null,
replyTo: d.quote ? { msgId: d.quote.msgId || d.quote.globalMsgId || null,
                     preview: String(d.quote.content || '').slice(0,120),
                     senderName: d.quote.dName || null } : null,
```

### 2.2 New/changed routes — `render.com/routes/web2-zalo.js`

All require existing `ensureWeb2Auth` middleware (same as `/send-message`). All use `getDb(req)`. After any DB write, fire SSE per current pattern. Add `#Note` + `WEB2.0` already present at file top.

| Method · Path                              | Body                                                                                                                                         | Persists                                                                                                                                                        | SSE fired                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /send-image`                         | `{accountKey, threadId, files:[{base64, filename, width?, height?}], caption?, threadType}`                                                  | INSERT `out` row `msg_type='image'`, `attachments` JSONB from `sendMedia` result, `cli_msg_id`; update conv `last_msg_at/text`                                  | `web2:zalo:messages` (update) + `web2:zalo:conv:<id>`                                                          |
| `POST /send-file`                          | `{accountKey, threadId, file:{base64, filename}, caption?, threadType}`                                                                      | INSERT `out` `msg_type='file'` + attachments + `cli_msg_id`                                                                                                     | same                                                                                                           |
| `POST /send-sticker`                       | `{accountKey, threadId, sticker:{id,cateId,type}, threadType}`                                                                               | INSERT `out` `msg_type='sticker'` + attachment `{url:stickerUrl}`                                                                                               | same                                                                                                           |
| `POST /send-message` (extend)              | add optional `replyTo:{msgId,content,msgType,...}` → pass `quote` to `zca.send`; persist `reply_to_msg_id`, `reply_to_preview`, `cli_msg_id` | extend existing INSERT                                                                                                                                          | unchanged topics                                                                                               |
| `POST /react`                              | `{accountKey, threadId, msgId, cliMsgId, icon, threadType}`                                                                                  | `UPDATE web2_zalo_messages SET reactions = jsonb_set(...)` merging `{icon:[uid…]}` keyed by `msg_id`                                                            | `web2:zalo:conv:<id>` (action `reaction`) + `web2:zalo:reaction:<msgId>`                                       |
| `POST /recall`                             | `{accountKey, threadId, msgId, cliMsgId, threadType}`                                                                                        | `UPDATE … SET recalled=true, recalled_at=now, recalled_by=$uid WHERE msg_id=$1`                                                                                 | `web2:zalo:conv:<id>` (action `recall`) + `web2:zalo:recall:<msgId>`                                           |
| `POST /forward`                            | `{accountKey, message, threadIds:[], threadType}`                                                                                            | INSERT `out` rows per target                                                                                                                                    | `web2:zalo:messages`                                                                                           |
| `POST /typing`                             | `{accountKey, threadId, threadType}`                                                                                                         | none (transient)                                                                                                                                                | calls `zca.sendTyping`; no SSE locally (outbound only)                                                         |
| `POST /seen`                               | `{accountKey, threadId, lastMsgId, convId}`                                                                                                  | `UPDATE web2_zalo_conversations SET unread_count=0, last_read_msg_id=$, last_read_at=now WHERE id=$convId`; call `zca.sendSeen` with stored raw of inbound msgs | `web2:zalo:conv:<id>` (action `seen`)                                                                          |
| `GET /conversations/:id/messages` (extend) | query `?limit&before`                                                                                                                        | —                                                                                                                                                               | adds keyset pagination `WHERE sent_at < $before ORDER BY sent_at DESC LIMIT $limit`, returns `{data, hasMore}` |
| `GET /stickers?q=`                         | —                                                                                                                                            | —                                                                                                                                                               | `zca.getStickers`                                                                                              |
| `GET /quick-replies`                       | —                                                                                                                                            | —                                                                                                                                                               | `zca.getQuickMessages`                                                                                         |
| `POST /quick-replies`                      | `{accountKey, keyword, title, media?}`                                                                                                       | —                                                                                                                                                               | `zca.addQuickMessage`                                                                                          |

**`_persistIncoming` (route:101) extension** — branch on event source. Add three new persistence handlers wired in `zca.configure` (route:69):

```js
onReaction: (e)=> _persistReaction(e).catch(...),   // UPDATE reactions jsonb; _notify reaction
onUndo:     (e)=> _persistRecall(e).catch(...),      // UPDATE recalled=true; _notify recall
onTyping:   (e)=> _notify(`web2:zalo:conv:${e.threadId}`,'typing', e.senderUid), // transient, no DB
onSeen:     (e)=> _persistSeen(e).catch(...),         // UPDATE seen_at on out rows; _notify seen
```

In `_persistIncoming` message INSERT (route:129), add columns `reply_to_msg_id, reply_to_preview, cli_msg_id` from `msg.replyTo` / `msg.cliMsgId`. **Typing must use thread-scoped topic** — note `_persistIncoming` uses conv `id` (PK) for `web2:zalo:conv:<id>` but typing event only has `threadId`; resolve conv `id` by `SELECT id FROM web2_zalo_conversations WHERE account_key=$ AND thread_id=$` before notifying, OR emit a thread-keyed topic `web2:zalo:thread:<threadId>` (preferred — avoids extra query; client subscribes to both conv-id and thread-id topic on open).

### 2.3 Schema migrations — `render.com/db/web2-zalo-schema.js`

Idempotent `ALTER … ADD COLUMN IF NOT EXISTS` placed at the **TOP of `ensureWeb2ZaloSchema`** (after table `CREATE`, before any index — per project rule "ALTER ADD COLUMN mới đặt ĐẦU ensureSchema"). All guarded with `IF EXISTS` on table.

```sql
ALTER TABLE IF EXISTS web2_zalo_messages
  ADD COLUMN IF NOT EXISTS cli_msg_id        TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_msg_id   TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_preview  TEXT,
  ADD COLUMN IF NOT EXISTS reactions         JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recalled          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recalled_at       BIGINT,
  ADD COLUMN IF NOT EXISTS recalled_by       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS seen_at           BIGINT;
CREATE INDEX IF NOT EXISTS idx_web2_zalo_msg_reply  ON web2_zalo_messages(reply_to_msg_id);
CREATE INDEX IF NOT EXISTS idx_web2_zalo_msg_thread_ts ON web2_zalo_messages(account_key, thread_id, sent_at DESC);

ALTER TABLE IF EXISTS web2_zalo_conversations
  ADD COLUMN IF NOT EXISTS last_read_msg_id  TEXT,
  ADD COLUMN IF NOT EXISTS last_read_at      BIGINT,
  ADD COLUMN IF NOT EXISTS is_pinned         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_muted          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS muted_until       BIGINT;
```

(`typing_indicator` JSONB from the audit is **dropped** — typing is transient SSE-only, never persisted, to avoid write churn.) Note `web2Db` already has these tables; Render restart re-runs block → idempotent verified by `IF NOT EXISTS`.

### 2.4 SSE events summary (hub `web2RealtimeSseRoutes` / `app.locals.web2RealtimeSseNotify`)

Existing: `web2:zalo:messages`, `web2:zalo:conv:<id>`, `web2:zalo:accounts`.
New actions on `web2:zalo:conv:<id>`: `reaction`, `recall`, `seen`, `typing`. Plus thread-keyed `web2:zalo:thread:<threadId>` for typing (no conv-id lookup). Payload always `{action, code, ts}` + minimal extra (`{msgId, icon, senderUid}`) — never PII; client re-reads bubble state from already-loaded message or does a light patch.

---

## 3. FRONTEND ARCHITECTURE

`web2-zalo-app.js` is 997 lines → must split. New chat code lives in `web2/zalo/js/chat/` (each < 400 lines, IIFE attaching to `window.WZChat.*` namespace — matches existing `window.ZaloApi` / `window.__wzAvErr` global pattern, no bundler). CSS in `web2/zalo/css/`.

### 3.1 New JS modules — `web2/zalo/js/chat/`

| File                | Responsibility                                                                                                                                                                                                                                                                                                                            | Public surface (window.WZChat.\*)                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat-store.js`     | Single chat state + helpers; owns `messages` array, `activeConv`, `unreadDividerId`, `replyTarget`, `pendingAttachments`, optimistic temp-id map. Immutable-ish update helpers. GMT+7 `fmtTime` reused from app (or re-exported).                                                                                                         | `WZChat.store` = `{get(), setMessages(), upsertMessage(tempId,real), patchReaction(msgId,icon,uid), markRecalled(msgId), markSeen(msgId,ts), setReplyTarget(m), addPending(file), clearPending()}` |
| `bubbles.js`        | Pure render of message list: sender grouping, date dividers (sticky), unread divider, status ticks, reply-quote header, reactions row (add-only), recall placeholder, link preview card, **image grid** (1/2/3/4 + `+N`), file/voice/sticker/contact kinds. Subsumes & extends `bubbleKind`/`bubbleBody`. All `esc()` + `referrerpolicy`. | `WZChat.renderMessages(messages, conv) -> htmlString`; `WZChat.bubbleKind(m)`; helpers exported for app delegation                                                                                 |
| `composer.js`       | Rich input: auto-grow textarea, Enter/Shift+Enter, attach button (file picker), paste-image, drag-drop overlay, thumbnail tray, emoji button, sticker button, send button, reply bar (cancel ✕), `/` quick-reply trigger. Builds send intents and calls ZaloApi via UI-first.                                                             | `WZChat.mountComposer(rootEl, {conv, onSend, onSendMedia, onSendSticker})`; `WZChat.composer.setReply(m)`, `.reset()`                                                                              |
| `emoji-picker.js`   | Client-only emoji popover (search, recents in localStorage, categories). Inserts at cursor.                                                                                                                                                                                                                                               | `WZChat.openEmojiPicker(anchorEl, onPick)`                                                                                                                                                         |
| `sticker-picker.js` | Sticker popover: search via `ZaloApi.stickers(q)`, recents (localStorage), grid; click → `onPick(sticker)`. Lazy-loads on first open.                                                                                                                                                                                                     | `WZChat.openStickerPicker(anchorEl, accountKey, onPick)`                                                                                                                                           |
| `lightbox.js`       | Full-screen image viewer: zoom, prev/next across thread image set, download, Esc/click-out, arrow keys. Pure client over loaded URLs.                                                                                                                                                                                                     | `WZChat.openLightbox(images, startIndex)`                                                                                                                                                          |
| `reactions.js`      | Reaction bar popover (6 quick + picker), maps UI icon → zca `Reactions` enum name; calls `ZaloApi.react`. Renders reaction chips.                                                                                                                                                                                                         | `WZChat.openReactionBar(msgEl, msg, onReact)`; `WZChat.REACTION_MAP`                                                                                                                               |
| `realtime.js`       | Subscribes new SSE topics for active conv (`typing`/`reaction`/`recall`/`seen`) and patches DOM/store without full refetch. Debounce/throttle.                                                                                                                                                                                            | `WZChat.subscribeRealtime(convId, threadId, handlers) -> unsub`                                                                                                                                    |
| `chat-actions.js`   | Thin orchestration: recall (confirm), forward (picker dialog), retry-failed, seen-on-open, typing-throttled-emit. Wraps `Web2Optimistic`.                                                                                                                                                                                                 | `WZChat.actions = {recall(m), forward(m), retry(temp), markSeen(), emitTyping()}`                                                                                                                  |

`ZaloApi` extension lives in **existing** `web2/zalo/js/web2-zalo-api.js` (append methods inside the IIFE after `sendMessage`, line 124) — not a new file, to keep one API surface:
`sendImage, sendFile, sendSticker, react, recall, forward, typing, seen, loadHistory(convId,{limit,before}), stickers(q), quickReplies, addQuickReply`. Each mirrors `sendMessage` (`_fetch` + `_qs`) pattern.

### 3.2 New CSS — `web2/zalo/css/`

- `chat-bubbles.css` — bubble grouping radii, status ticks, reply quote, reactions chips, recall placeholder, date/unread dividers, image grid, file/voice cards. Tokens from `web2-theme.css`. No `backdrop-filter: blur()`, no box-shadow > 24px (modal anti-lag rule).
- `chat-composer.css` — composer, thumbnail tray, drag-drop overlay, popovers (emoji/sticker/reaction), reply bar, quick-reply menu.
- `chat-lightbox.css` — lightbox overlay, controls. `prefers-reduced-motion` disables transitions in all three.

### 3.3 Load order in `web2/zalo/index.html`

After existing `web2-zalo-api.js` and before `web2-zalo-app.js` (so app can delegate), in dependency order:

```html
<link rel="stylesheet" href="css/chat-bubbles.css?v=..." />
<link rel="stylesheet" href="css/chat-composer.css?v=..." />
<link rel="stylesheet" href="css/chat-lightbox.css?v=..." />
...
<script src="js/web2-zalo-api.js?v=..."></script>
<!-- extended -->
<script src="js/chat/chat-store.js?v=..."></script>
<script src="js/chat/lightbox.js?v=..."></script>
<script src="js/chat/emoji-picker.js?v=..."></script>
<script src="js/chat/sticker-picker.js?v=..."></script>
<script src="js/chat/reactions.js?v=..."></script>
<script src="js/chat/bubbles.js?v=..."></script>
<script src="js/chat/composer.js?v=..."></script>
<script src="js/chat/realtime.js?v=..."></script>
<script src="js/chat/chat-actions.js?v=..."></script>
<script src="js/web2-zalo-app.js?v=..."></script>
<!-- delegates -->
```

`Web2Optimistic` + `Web2SSE` bridge already loaded on the page (verify their `<script>` precede the above).

---

## 4. INTEGRATION CONTRACT (`web2-zalo-app.js`)

Keep app as the shell/orchestrator; delegate chat rendering & actions. Backward compatible — if `window.WZChat` absent, fall back to current inline render (defensive, matches `if (window.Web2Optimistic?.run)` pattern).

- **`renderChat(keepScroll)` (app:669)** → replace the `.map(...)` bubble block (app:677-686) with `const bubbles = window.WZChat?.renderMessages?.(state.conv.messages, c) ?? /* legacy inline */;`. Replace the static compose block (app:693-696) with `window.WZChat.mountComposer($('#wzChatCompose'), {...})`. After render: `WZChat.actions.markSeen()` + `lucide.createIcons()`. Keep scroll-to-bottom logic but gate on "near bottom" (scroll FAB module).
- **`bubbleBody`/`bubbleKind` (app:619-667)** → move logic into `chat/bubbles.js`; leave thin shims in app delegating to `WZChat.bubbleKind` for any external caller. The stable `attachments:[{type,url,thumb,href,title}]` shape is unchanged.
- **`sendChat()` (app:714)** → rewrite to route through `Web2Optimistic.run`: snapshot `messages`, push optimistic bubble with `temp-id` + `send_status:'sending'`, `run: () => ZaloApi.sendMessage({...,replyTo})`, `onSuccess: reconcile temp→real msgId+cliMsgId` (no refetch), `rollback: mark bubble failed (show retry)`. Branch: if `store.pendingAttachments` → `ZaloApi.sendImage/sendFile`; if reply target set → include `replyTo`. Clear reply bar + tray after.
- **`openConversation(id)` (app:582)** → after messages assigned: compute unread divider via `conv.last_read_msg_id`, call `WZChat.actions.markSeen()` (→ `ZaloApi.seen`), and replace the single `Web2SSE.subscribe('web2:zalo:conv:'+id, refreshActiveMessages)` with `_convUnsub = WZChat.subscribeRealtime(id, conv.thread_id, {onMessage:refreshActiveMessages, onReaction, onRecall, onTyping, onSeen})`. Group threads: bind "load older" → `ZaloApi.loadHistory`.
- **`_persistIncoming` subscribe / SSE (app subscribeSse ~970)** → unchanged for `accounts`/`messages`; conv-level patches now handled inside `realtime.js`. Keep `_convUnsub` single-unsub discipline.

No change to auth (`_authHeaders` sufficient), `avatarHtml`/`__wzAvErr`, `fmtTime`, modal helpers.

---

## 5. REALTIME (end-to-end)

General flow: **zca listener (`_attachListener`) → service callback (`_cb.onX`) → route handler `_persistX` → DB write (if any) → `_notify(topic, action, code)` → Web2 SSE hub → client `WZChat.subscribeRealtime` handler → targeted DOM patch (no full refetch).**

- **Typing**: customer types → `listener.on('typing')` → `onTyping` → `_notify('web2:zalo:thread:<threadId>', 'typing', senderUid)` (no DB). Client: show animated dots bubble; auto-clear after 4s inactivity (client timer). Outbound: composer throttles `ZaloApi.typing` to **≤1 call / 2s** while typing (audit "typing indicators firing ~every 2s"). No DB, no echo storm.
- **Seen**: open conv → `ZaloApi.seen` → route updates `unread_count=0,last_read_*` + calls `zca.sendSeen` → `_notify(conv,'seen')`. Inbound customer-seen → `listener.on('seen_messages')` → `onSeen` → `UPDATE … seen_at` on last out row → `_notify(conv,'seen', msgId)`. Client patches "Đã xem HH:mm" on last outbound bubble only.
- **Reaction**: click emoji → `Web2Optimistic` add chip + `ZaloApi.react` → route `addReaction` + jsonb merge → `_notify(conv,'reaction',msgId)`. Inbound → `listener.on('reaction')` → `onReaction` → jsonb merge → notify. Client `patchReaction(msgId,icon,uid)` updates chip count. **Add-only** (no remove path).
- **Recall**: own bubble → confirm → `ZaloApi.recall({msgId,cliMsgId})` → route `undo` + `recalled=true` → `_notify(conv,'recall',msgId)`. Inbound recall → `listener.on('undo')` → `onUndo` → `_notify`. Client replaces bubble with muted "Tin nhắn đã được thu hồi".
- **New message**: existing `web2:zalo:messages` + `web2:zalo:conv:<id>` → `refreshActiveMessages`. Keep but consider switching active conv to a lighter incremental append later (P1).

**Debounce/throttle**: client SSE handlers for `reaction`/`seen` debounce 300ms (burst-merge); new-message refetch debounce 500-600ms (project standard); outbound typing throttle 2s; typing-dots auto-expire 4s. All SSE scroll/handlers passive.

---

## 6. UI-FIRST + SAFETY

- **Web2Optimistic.run** for: text send, image/file send, sticker send, reaction, recall, retry. Pattern `{snapshot: clone messages, apply: mutate store + re-render, run: ZaloApi call, onSuccess: reconcile temp→real (do NOT revert), rollback: mark failed/remove + notify error, errLabel}`. **Exceptions keep `await` + spinner** (per rule): none here are money ops, but **forward** (multi-target, partial fail) uses explicit await + per-target result toast, not optimistic. Seen/typing fire-and-forget (no rollback).
- **XSS**: every message `content`, caption, reply preview, sender name, sticker/file title rendered through `esc()` (app:14). Never `innerHTML` raw zca data. URLs in `href`/`src` `esc()`-ed; only `http(s)` schemes allowed (reuse `URL_RE`). Link-preview title/desc escaped.
- **Media**: ALL Zalo CDN `<img>` (bubble images, grid, sticker, reaction emoji if CDN, lightbox, contact avatar) carry `referrerpolicy="no-referrer"` + `loading="lazy"` + `onerror` fallback (reuse `__wzAvErr` pattern for avatars). Local Unicode emoji need none.
- **GMT+7**: every timestamp via `fmtTime` (TZ `Asia/Ho_Chi_Minh`); date dividers computed in GMT+7; `sent_at/seen_at/recalled_at` stored as epoch ms (`Date.now()`), display-only conversion. Inbound `sentAt` from zca `d.ts` already epoch — no `Z`-append bug here (numeric), but guard `Number(d.ts)`.
- **a11y**: message pane `role="log" aria-live="polite"`; bubbles focusable with `aria-label` (sender + time); composer textarea labelled; attach/emoji/sticker/send buttons `aria-label`; reaction bar keyboard-operable; lightbox focus-trap + Esc + arrow keys; focus-visible rings; popovers return focus to trigger. `@media (prefers-reduced-motion: reduce)` disables typing-dots animation, bubble-in transitions, lightbox zoom anim.
- **Anti-lag**: all scroll listeners `{passive:true}`; IntersectionObserver bottom sentinel for scroll FAB (no scroll handler churn); virtualize message list when **> 200 rows** (windowing); no `backdrop-filter: blur()`, no box-shadow > 24px; `content-visibility:auto` on off-screen message groups; `will-change` only during active animation then removed.
- **TESTING SAFETY (live)**: NEVER send to a real customer thread. Verify wiring/UI with: (a) the shop's **own** Zalo account self-thread, or (b) the designated clone, or (c) mock the `ZaloApi.*` POST in Playwright (`page.route`) so no real Zalo traffic occurs. Reactions/recall/seen tests target a self-authored message only. Local DB tests use throwaway `n2store_migration_test` for schema migration (project pattern). Confirm `cli_msg_id`/`reactions` columns via migration test before touching prod.

---

## 7. BUILD ORDER (dependency-ordered)

**Backend first (deploy + verify before frontend).**

1. **Schema** — `db/web2-zalo-schema.js`: add ALTER block (top of `ensureWeb2ZaloSchema`) + indexes. Idempotency test via `scripts/test-migration-*` pattern on local `n2store_migration_test`.
2. **zca service** — `services/web2-zalo-zca.js`: fix `send()` to return `cliMsgId`; add `sendMedia, sendSticker, react, recall, forward, sendTyping, sendSeen, getStickers, searchSticker, getQuickMessages, addQuickMessage`; add normalizers + new `listener.on(...)` + extend `configure` `_cb`; export all.
3. **Routes + persistence** — `routes/web2-zalo.js`: wire new `zca.configure` callbacks (`onTyping/onSeen/onReaction/onUndo`); add `_persistReaction/_persistRecall/_persistSeen`; extend `_persistIncoming` (reply/cli_msg_id cols + thread-keyed typing topic); add routes `/send-image /send-file /send-sticker /react /recall /forward /typing /seen /stickers /quick-replies`; extend `/send-message` (reply) + `/conversations/:id/messages` (keyset pagination).
4. **Deploy backend** (Build Filter path `render.com/**` triggers; else manual `POST /services/{id}/deploys`). Verify: `GET /stickers`, schema columns, SSE test via Admin SSE Monitor (`web2:zalo:reaction` etc.).
5. **ZaloApi extension** — append methods to `web2/zalo/js/web2-zalo-api.js`.
6. **Chat modules (leaf-first)** — `chat-store.js` → `lightbox.js`, `emoji-picker.js`, `sticker-picker.js`, `reactions.js` → `bubbles.js` → `composer.js` → `realtime.js` → `chat-actions.js`. Each < 400 lines, `#Note` + `WEB2.0` header.
7. **Integration** — refactor `web2-zalo-app.js`: `renderChat`, `bubbleBody`/`bubbleKind` shims, `sendChat`, `openConversation`, SSE subscribe — delegate to `WZChat.*` with defensive fallbacks.
8. **CSS** — `chat-bubbles.css`, `chat-composer.css`, `chat-lightbox.css`; wire `<link>`s + `<script>`s into `index.html` in the order in §3.3 with `?v=` cache-bust.
9. **Verify** — persistent Playwright session w/ `--ext n2store-extension`: open chat, render grouping/dividers/lightbox/grid (client-only, no live send needed); then live-wiring test against shop self-thread only (text → image → sticker → reaction → recall → reply → typing/seen via SSE Monitor). Confirm GMT+7, no XSS (inject `<script>` in a self-message), a11y keyboard pass, no console errors via `feval` state dumps.
10. **Docs** — update `docs/dev-log.md`, `docs/web2/ZALO-INTEGRATION.md`, overview `#auditPages` + `WEB2-PAGES-ANALYSIS.md` per rule 9. Commit + push (Stop hook emits RESUME token).

**Key files**: `/Users/mac/Desktop/n2store/render.com/db/web2-zalo-schema.js`, `/Users/mac/Desktop/n2store/render.com/services/web2-zalo-zca.js`, `/Users/mac/Desktop/n2store/render.com/routes/web2-zalo.js`, `/Users/mac/Desktop/n2store/web2/zalo/js/web2-zalo-api.js`, `/Users/mac/Desktop/n2store/web2/zalo/js/web2-zalo-app.js`, new `/Users/mac/Desktop/n2store/web2/zalo/js/chat/*.js`, new `/Users/mac/Desktop/n2store/web2/zalo/css/chat-*.css`, `/Users/mac/Desktop/n2store/web2/zalo/index.html`.

**Load-bearing facts to honor at implementation time:** `send()` currently drops `cliMsgId` (zca.js:305) — fix is prerequisite for recall/react/seen. `getGroupChatHistory` is group-only (zca.js:335) — no 1-1 backfill. Reaction removal unsupported in zca → add-only UI. Typing event carries only `threadId` (not conv PK) → use thread-keyed SSE topic to avoid an extra lookup.
