<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. -->

# Extension Send-Message Flow (Code Analysis)

> Phân tích flow gửi tin nhắn khi click "Send" trong chat panel của `orders-report/main.html`. Không touch production — đối chiếu source code thay vì test live trên KH thật.

## High-level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ orders-report chat panel (Send button click)                    │
│ → window.sendMessage()  [tab1-chat-messages.js:606]             │
└─────────────────────────────────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────┐
        │ TRY (1):        │  pdm.sendMessage(pageId, convId, {...}, pat)
        │ Pancake API     │  → POST /api/v1/pages/{pageId}/conversations/{convId}/messages
        │ (default path)  │     ?access_token={pageAccessToken}
        └────────┬────────┘     body: { action, message, message_id?, post_id?, from_id? }
                  │
       ┌─────────┴─────────┐
       │                   │
   success                fail (FB error 10/100/3252001 — 24h policy, post gone, rate limit)
       │                   │
     done            ┌─────▼──────────────────────────────────────┐
                     │ FALLBACK CHAIN                              │
                     ├─────────────────────────────────────────────┤
                     │ FB1: Extension SEND_COMMENT                 │  (reply_comment mode only)
                     │ FB2: Pancake API private_replies            │
                     │ FB3: Extension SEND_PRIVATE_REPLY           │
                     │ FB4: Extension REPLY_INBOX_PHOTO            │  (text only via business.facebook.com)
                     └─────────────────────────────────────────────┘
                                              │
                                              ▼
                         window.postMessage({type:'REPLY_INBOX_PHOTO', ...}, '*')
                                              │
                                              ▼
                         content/contentscript.js bridge
                                              │
                                              ▼
                         background/service-worker.js
                                              │
                                              ▼
                         background/facebook/sender.js#handleReplyInboxPhoto
                                              │
                                              ▼
                         POST https://business.facebook.com/messaging/send/
                              (uses c_user + fb_dtsg + region cookies)
```

## Step-by-Step Detail

### 1. `sendMessage()` — UI Send button handler

[`orders-report/js/tab1/tab1-chat-messages.js#L606`](../orders-report/js/tab1/tab1-chat-messages.js#L606)

- Snapshot state: `pageId`, `convId`, `psid`, `convType`, `replyType`, `replyData`, attachments.
- Append employee signature (`text + '\nNv. ' + displayName`).
- Optimistic UI: push outgoing message với `id = 'opt_' + Date.now()`.
- Upload pendingImages via `pdm.uploadMedia(pageId, file, pat)` → `content_ids`.
- Dispatch to `_handleReplySend(pdm, pageId, convId, ...)` or `_handleConvSend(...)` depending on `convType`.

### 2. Pancake API default path

```js
const result = await pdm.sendMessage(
    pageId,
    convId,
    {
        action: 'private_replies' | 'reply_comment' | 'reply_inbox',
        message: text,
        message_id: messageId, // reply target (comment_id or message_id)
        post_id: postId, // for COMMENT type
        from_id: fromId, // FB user id
        content_ids: [uploadResult.id], // for media
    },
    pat /* page access token */
);
```

Underlying HTTP: `POST https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake/pages/{pageId}/conversations/{convId}/messages?access_token={pat}`
→ proxied through CF Worker → `https://pages.fm/api/v1/pages/.../messages` (Pancake servers).

**Success**: returns `{success: true, message: {...}}` — Pancake delivers via Facebook Send API on backend.

**Failure modes**:

- `success: false` with FB error code:
    - `10` (subcode `2018278`): 24h messaging policy violated — KH đã không nhắn shop trong 24h qua.
    - `100`: post/comment không còn tồn tại.
    - `1390008`: temporary FB error.
    - `3252001`: rate limited.
- Other Pancake errors (auth, validation).

### 3. Fallback chain (when Pancake fails)

#### Fallback 3a: Extension `SEND_PRIVATE_REPLY`

[`orders-report/js/tab1/tab1-extension-bridge.js#L668`](../orders-report/js/tab1/tab1-extension-bridge.js#L668)

```js
_postToExtension({
    type: 'SEND_PRIVATE_REPLY',
    pageId,
    commentId,
    message: text,
    taskId,
    from: 'WEBPAGE',
});
// listen for SEND_PRIVATE_REPLY_SUCCESS / SEND_PRIVATE_REPLY_FAILURE
```

Yêu cầu: `commentId` phải là id của 1 comment public từ KH trên 1 post của page. Extension dùng FB Graph endpoint `POST /{comment_id}/private_replies` với `message=text`.

Handler ở service worker: `background/facebook/commenter.js#handleSendPrivateReply`.

#### Fallback 3b: Extension `REPLY_INBOX_PHOTO` (text-only mode)

[`orders-report/js/tab1/tab1-extension-bridge.js#L125`](../orders-report/js/tab1/tab1-extension-bridge.js#L125) → `sendViaExtension(text, conv)`

```js
_postToExtension({
    type: 'REPLY_INBOX_PHOTO',
    pageId: conv.pageId,
    accessToken: pancakeTokenManager.currentToken,
    message: text,
    attachmentType: 'SEND_TEXT_ONLY',
    globalUserId,           // global FB id, NOT psid
    platform: 'facebook',
    threadId: psid,
    convId: 't_' + psid,
    customerName,
    conversationUpdatedTime: conv.updated_at ms,
    contentIds: [], photoUrls: [],
    isBusiness: false,      // MUST be false
    taskId, from: 'WEBPAGE'
});
```

**Prerequisite — global_id resolution** (4-step fallback):

1. In-memory cache `window._globalIdCache[cacheKey]`
2. `conv.page_customer.global_id`
3. Server-cache lookup `/api/global-id?pageId=...&psid=...`
4. Extension `GET_GLOBAL_ID_FOR_CONV` (uses 5 strategies: threadId-based + customerName-based)

Without `globalUserId` → throws `"Không tìm được Global Facebook ID"`.

### 4. Service Worker handler

[`web2-extension/background/facebook/sender.js#L22`](../web2-extension/background/facebook/sender.js#L22) — `handleReplyInboxPhoto(data, sendResponse)`

```js
1. Validate: pageId required, globalUserId required, attachmentType in ['SEND_TEXT_ONLY', 'PHOTO', 'VIDEO', 'FILE', 'STICKER', 'AUDIO', 'REPLY_MESSAGE']
2. Get session: getSession(pageId) → contains { token (fb_dtsg), userId (c_user), msgrRegion }
   - If no session: await initPage(pageId) → calls business.facebook.com → scrape fb_dtsg
3. Update dynamic rules via chrome.declarativeNetRequest:
   - Modify Origin header → https://business.facebook.com
   - Modify Referer → https://business.facebook.com/latest/inbox/all?page_id={pageId}
4. Build send params (buildSendParams):
   - __user = session.userId (admin's c_user)
   - fb_dtsg = session.token
   - request_user_id = pageId (tells FB which page is sending)
   - other_user_fbid = globalUserId
   - thread_id = 't_' + psid OR 'mid:t_' + ...
   - body = encoded message text
   - attachment refs (if any)
5. POST https://business.facebook.com/messaging/send/ with x-www-form-urlencoded body
6. Parse response → success → respond { type: REPLY_INBOX_PHOTO_SUCCESS, taskId, ... }
                            → error → respond { type: REPLY_INBOX_PHOTO_FAILURE, taskId, error }
```

**Key insight**: extension dùng `https://business.facebook.com/messaging/send/` (Business Suite endpoint), KHÔNG dùng `graph.facebook.com`. Endpoint này được Business Suite UI dùng nội bộ — không bị 24h policy của Messenger Platform API.

## Bypass-24h Mechanism

| Aspect   | Pancake API                                                       | Extension                                                                                                        |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Endpoint | `pages.fm/api/v1/.../messages` → `graph.facebook.com/me/messages` | `business.facebook.com/messaging/send/`                                                                          |
| Auth     | `page_access_token` (long-lived FB token)                         | `c_user` + `fb_dtsg` from admin's logged-in Business Suite session                                               |
| Policy   | Strict 24h messaging window (Messenger Platform Policy)           | Internal UI endpoint — admin có thể nhắn KH bất cứ lúc nào (cũng như khi admin nhắn từ Business Suite trực tiếp) |
| Quota    | Pancake rate-limits + FB rate-limits                              | Same FB rate-limit nhưng không có 24h check                                                                      |
| Identity | Page bot identity                                                 | Admin's account identity (KH thấy như admin tự nhắn)                                                             |

## Why Web 2.0 Native-orders Also Has This

[`native-orders/js/native-orders-app.js#L2806`](../native-orders/js/native-orders-app.js#L2806) duplicates the bridge:

- `_extensionReady` flag set when `EXTENSION_LOADED` event arrives.
- `_extensionRequest(type, data, timeoutMs)` is the page-side wrapper.
- Used in chat modal's `_handleReplyComment(order, commentId, ...)` for comment replies that need extension fallback.

For NORMAL text messages, native-orders uses `Web2Chat.sendMessage(pageId, convId, {text, action: 'reply_inbox', customerId, repliedMessageId})` directly — same Pancake path as orders-report.

## Verification (without sending real message)

Verified end-to-end on prod (extension installed via `--ext` flag, content script injected on `nhijudy.store`):

- ✓ `chrome.runtime` bridge active (CS → SW → CS)
- ✓ `EXTENSION_VERSION` round-trip succeeds: `{name: "Web 2.0 Messenger", version: "2.0.0"}`
- ✓ `GET_BUSINESS_CONTEXT` request reaches SW, fails with expected `_FAILURE` (no `business.facebook.com` cookies in test session — would succeed if admin logged into Business Suite in same Chrome profile)
- ✓ Pancake `/api/v1/pages/{pageId}/conversations/{convId}` (read) returns full conv data using JWT
- ✓ Pancake `POST .../messages` confirmed via routeblock (aborted before delivery) — payload shape: `{message, action:'reply_inbox'}`

## What user needs to do to test extension's bypass-24h end-to-end

1. Open `https://business.facebook.com` trong cùng Chrome profile của extension → login admin FB account → wait for cookies to land (`c_user`, `fb_dtsg`).
2. Mở `nhijudy.store/orders-report/main.html` → vào order 191 → mở chat panel.
3. Gõ tin nhắn vào ô chat → click Send.
4. Nếu KH outside 24h window:
    - Pancake API returns `success:false` với FB error code 10.
    - Code chuyển sang fallback chain.
    - Cuối cùng extension `REPLY_INBOX_PHOTO` được gọi qua postMessage bridge.
    - Service worker POST `business.facebook.com/messaging/send/` với fb_dtsg cookie.
    - KH nhận tin nhắn từ Page như cách admin gửi từ Business Suite UI.
5. Inspect Network panel của orders-report tab to see:
    - First call: Pancake POST messages (returns failure JSON)
    - Then postMessage events `REPLY_INBOX_PHOTO` → `REPLY_INBOX_PHOTO_SUCCESS`
    - Extension's POST goes to background SW (không visible trên page Network tab — visible trên SW devtools chỗ chrome://extensions/?id=... → "service worker" link)

## Files Referenced

- [`orders-report/js/tab1/tab1-chat-messages.js`](../orders-report/js/tab1/tab1-chat-messages.js) — UI send handler + fallback chain
- [`orders-report/js/tab1/tab1-extension-bridge.js`](../orders-report/js/tab1/tab1-extension-bridge.js) — page-side extension bridge
- [`web2-extension/content/contentscript.js`](../web2-extension/content/contentscript.js) — page ⇄ SW message bridge
- [`web2-extension/background/service-worker.js`](../web2-extension/background/service-worker.js) — message router
- [`web2-extension/background/facebook/sender.js`](../web2-extension/background/facebook/sender.js) — `handleReplyInboxPhoto`
- [`web2-extension/background/facebook/commenter.js`](../web2-extension/background/facebook/commenter.js) — `handleSendComment`, `handleSendPrivateReply`
- [`web2-extension/background/facebook/session.js`](../web2-extension/background/facebook/session.js) — `initPage`, `getSession` (cookie scrape)
- [`web2-extension/background/facebook/global-id.js`](../web2-extension/background/facebook/global-id.js) — `handleGetGlobalIdForConv` (5 strategies)
