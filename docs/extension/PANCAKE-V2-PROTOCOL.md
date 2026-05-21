<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. -->

# Pancake V2 Protocol — Send/Receive Messages, Media, React

> Đầy đủ flow của Pancake messaging dựa trên:
>
> - Source extracted: `/tmp/pancake-v2-crx/extracted/` (Pancake V2 ext v0.5.46, ID `oehooocookcnclgniepdgaiankfifmmn`)
> - Live network capture: HTĐ (NhiJudy Store) — text fail 24h, private_replies success, REPLY_INBOX_PHOTO via FB Business success
> - File log: `downloads/n2store-session/console-1779347418060.log` + `network-1779347418060.log`

## TOC

1. [Architecture](#architecture)
2. [Pancake API endpoints (chính)](#pancake-api-endpoints)
3. [Send Text Message](#send-text)
4. [Send Image / Video / Audio / File](#send-media)
5. [Send Sticker / Emoji](#send-sticker)
6. [Reply Comment / Private Replies](#reply-comment)
7. [React Message](#react-message)
8. [Extension Bypass-24h](#extension-bypass)
9. [Real Capture Log](#real-capture)

---

## 1. Architecture <a id="architecture"></a>

```
┌──────────────────────────────────────────────────────────┐
│ pancake.vn UI / nhijudy.store inbox UI                    │
│ (sendMessage, attachFile, react, ...)                     │
└──────────────────────────────────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────────┐
   │ Pancake API   POST https://pancake.vn/api/v1/    │
   │   pages/{pageId}/conversations/{convId}/messages  │
   │   ?access_token=<JWT>                              │
   │                                                    │
   │   • action=reply_inbox / private_replies /         │
   │     reply_comment                                  │
   │   • Content-Type: multipart/form-data (action=     │
   │     reply_inbox) OR application/json (private_     │
   │     replies + reply_comment)                       │
   └─────────────────────────────────────────────────┘
                    │
        success     │      fail (FB error 10/100/...)
                    │
   ┌────────────────┴──────────────────────────┐
   │                                            │
 ✓ done                          ┌─────────────────────────────────────┐
                                  │ EXTENSION FALLBACK (Pancake V2 / web2-ext) │
                                  │  via postMessage REPLY_INBOX_PHOTO         │
                                  │  → SW POST business.facebook.com/messaging/ │
                                  │     send/ với fb_dtsg+__user của admin    │
                                  │     Business Suite session                │
                                  └─────────────────────────────────────┘
```

## 2. Pancake API endpoints <a id="pancake-api-endpoints"></a>

Tất cả gọi qua HTTPS, query param `access_token={PANCAKE_JWT}` BẮT BUỘC. Cookie `jwt` cũng được set nhưng API endpoints chỉ check query param.

### 2.1 List pages

```
GET https://pancake.vn/api/v1/pages?access_token=<JWT>
→ { categorized: [{group, pages:[{id, name, type}]}], success: true }
```

### 2.2 List conversations (per page)

```
GET https://pancake.vn/api/v1/pages/{pageId}/conversations
    ?type=INBOX&access_token=<JWT>
→ {conversations: [{id, customers:[{name, fb_id}], snippet, updated_at, ...}], success:true}
```

### 2.3 Open conversation — load customer + history

```
# Step 1: load_shop_page_customers (POST JSON)
POST .../conversations/{convId}/messages/load_shop_page_customers?access_token=<JWT>
Content-Type: application/json
{
  "page_customers": [{...}],
  "conversation": {
    "id": "<convId>",
    "from": {"id": "<psid>", "name": "<customerName>"},
    "customers": [{"fb_id":"<psid>","id":"<pancakeCustId>","name":"..."}]
  }
}
→ {
    "available_for_report_phone_numbers": ["+84908..."],
    "customers": {"<id>": {...}},
    "reports_by_phone": {"+84908...": {order_fail,order_success,warning}},
    "success": true
  }

# Step 2: GET message history
GET .../conversations/{convId}/messages?customer_id=<pancakeCustId>&access_token=<JWT>
→ {
    "conv_from": {"id":"<psid>","name":"..."},
    "global_id": "<fbGlobalId>",       // ← global FB id (cần cho extension bypass)
    "customers": [{...}],
    "messages": [{
      "id": "m_<base64>",                       // FB internal message id
      "inserted_at": "ISO",
      "from": {"id":"<senderId>","name":"..."},
      "message": "<html>",
      "original_message": "<plain>",
      "attachments": [{...}],
      "can_comment, can_hide, can_like, can_remove, can_reply_privately": true,
      "is_hidden, is_parent, is_parent_hidden, is_removed": false,
      "conversation_id": "<convId>",
      "page_id": "<pageId>",
      "parent_id": "...",                       // for comments
      ...
    }],
    "success": true
  }

# Step 3 (parallel): inbox preview
GET .../customers/{pancakeCustId}/inbox_preview?access_token=<JWT>
→ {can_inbox: true, data: [{attachments:[{type:"sticker"|"template"|"file"}], ...}]}
```

### 2.4 Convention IDs

- **convId format**:
    - Inbox: `{pageId}_{psid}` — vd `270136663390370_25717004554573583`
    - Comment: `{postId}_{commentId}` — vd `2147871636008763_813274741637389`
- **postId format**: `{pageId}_{postFbid}` — vd `270136663390370_2147871636008763`
- **messageId**: bắt đầu `m_` + base64 (FB MID format) — vd `m_8wqSQ5J2rtU2Lm_1a6k7b1rpJ6Rn2DGGjMArlfAF2ZFZjD-eNsx2kJS1LSDEYYk4EiY6m8Aq2xEcMLAlf8ikkg`
- **PANCAKE_JWT**: lấy từ cookies `jwt` (login session) HOẶC `localStorage.getItem('jwt')`. Valid 90 ngày từ login.

## 3. Send Text Message <a id="send-text"></a>

### 3.1 Default — reply_inbox (multipart)

```
POST https://pancake.vn/api/v1/pages/{pageId}/conversations/{convId}/messages?access_token=<JWT>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryXXX

------WebKitFormBoundaryXXX
Content-Disposition: form-data; name="action"

reply_inbox
------WebKitFormBoundaryXXX
Content-Disposition: form-data; name="message"

<text>
------WebKitFormBoundaryXXX
Content-Disposition: form-data; name="send_by_platform"

web
------WebKitFormBoundaryXXX--
```

**Success** (within 24h window):

```json
{ "id": "m_<mid>", "success": true }
```

**Failure** (outside 24h):

```json
{
    "e_code": 10,
    "e_subcode": 2018278,
    "message": "(#10) Tin nhắn này được gửi ngoài khoảng thời gian cho phép...",
    "success": false
}
```

→ Khi nhận `success:false` với `e_code:10` → trigger fallback chain (§7-8).

### 3.2 Send với reply target

Thêm field `replied_to_message_id=<targetMsgId>` vào FormData.

## 4. Send Media (Image / Video / Audio / File) <a id="send-media"></a>

Pancake V2 ext UPLOAD trực tiếp lên FB rồi gửi qua FB Business endpoint:

### 4.1 Upload media → FB

```
POST https://upload-business.facebook.com/ajax/mercury/upload.php?
  __user=<c_user>&fb_dtsg=...&request_user_id={pageId}&...
Content-Type: multipart/form-data; boundary=...

------xxx
Content-Disposition: form-data; name="upload_1029"   // random: upload_1024..1034 (anti-bot)
                                                       // (Instagram dùng "farr")
Content-Type: image/jpeg

<binary>
------xxx--
```

**Response**:

```json
{
    "payload": {
        "metadata": [
            {
                "fbid": "<mediaId>", // photo/video/file id
                "src": "<previewUrl>",
                "video_id": "...", // for video
                "file_id": "...", // for file
                "gif_id": "...", // for gif
                "thumbnail_src": "...",
                "filename": "<name>"
            }
        ]
    }
}
```

### 4.2 Send với media — buildSendParams khi gọi REPLY_INBOX_PHOTO

Field name theo loại attachment (extension `buildSendParams`):
| attachmentType | Field |
|---|---|
| `SEND_TEXT_ONLY` | (no media field) |
| `PHOTO` (default) | `image_ids[0]`, `image_ids[1]`, ... |
| `VIDEO` | `video_ids[0]`, ... |
| `FILE` | `file_ids[0]`, ... |
| `AUDIO` | `audio_ids[0]`, ... |
| `STICKER` | `sticker_id` (single, not array) |
| `REPLY_MESSAGE` | (giữ field `replied_to_message_id`) |

Full POST `business.facebook.com/messaging/send/` body (form-urlencoded):

```
body=<text>
&offline_threading_id=<clientGeneratedId>
&source=source:page_unified_inbox
&timestamp=<now>
&request_user_id=<pageId>
&__user=<c_user>&fb_dtsg=<fbDtsg>&__a=1&__req=<n>&__be=1&__pc=PHASED:DEFAULT
&__rev=<client_rev>&jazoest=<calcJazoest(fb_dtsg)>
&__usid=<generated>
&specific_to_list[0]=fbid:<globalUserId>
&specific_to_list[1]=fbid:<pageId>
&other_user_fbid=<globalUserId>
&message_id=<offline_threading_id>
&client=mercury
&action_type=ma-type:user-generated-message
&ephemeral_ttl_mode=0
&has_attachment=<true|false>
&image_ids[0]=<fbid>&image_ids[1]=<fbid>...
```

## 5. Send Sticker / Emoji <a id="send-sticker"></a>

### 5.1 Get stickers list (extension)

```
postMessage to ext: {type:"GET_STICKERS", pageId, taskId}
→ class xt.getListStickers() → fetch FB sticker store endpoints
→ returns {data:[{packId, name, stickers:[{id, sprite, ...}]}], ...}

postMessage to ext: {type:"GET_PACK_STICKERS", pageId, packId, taskId}
→ class xt.getPackStickers(packId)
```

### 5.2 Send sticker (in inbox conversation)

Trong `buildSendParams` với `attachmentType: "STICKER"`:

```
sticker_id=<stickerId>     // single, e.g. "254596779337026"
(rest of params same as text)
```

KHÔNG có `body`, KHÔNG có `image_ids`.

### 5.3 Send sticker AS COMMENT (reply on a post)

Endpoint khác: `m.facebook.com/a/comment.php`

```
POST https://m.facebook.com/a/comment.php?parent_comment_id=<cId>
    &parent_redirect_comment_token=<commentId>&fs=0&comment_logging
    &reply_permalink=1&ft_ent_identifier=<postId>&gfid=<gfid>&av=<pageId>
Body (urlencoded):
  sticker_id=<stickerId>
  &comment_text=<message>
  &m_sess=
  &fb_dtsg=<dtsg>
  &__req=b
  &__ajax__=true
  &__user=<userID>

Parse response HTML cho `data-commentid="..._..."` → extract new commentId.
```

### 5.4 Send emoji (như text)

Emoji là Unicode chars trong text → just `body=<emoji>` qua reply_inbox.

## 6. Reply Comment / Private Replies <a id="reply-comment"></a>

### 6.1 Private Replies (reply tới public comment via DM) ✅

**VERIFIED LIVE 14:14:29** — Gửi tới HTĐ thành công sau khi `reply_inbox` fail 24h.

```
POST https://pancake.vn/api/v1/pages/{pageId}/conversations/{commentConvId}/messages
    ?access_token=<JWT>
Content-Type: application/json

{
  "action": "private_replies",
  "message_id": "<postId>_<commentId>",        // FB comment id
  "thread_id_preview": "<threadFbid>",
  "thread_key_preview": "t_<threadFbid>",
  "from_id": "<psid>",
  "need_thread_id": false,
  "message": "<text>",
  "post_id": "<pageId>_<postFbid>"
}

→ {"id":"m_8wqSQ5J2rt...","success":true}
```

**Tại sao work**: FB cho phép reply private tới KH đã comment (window 7 ngày), KHÁC với window 24h của Messenger Platform → bypass được lỗi 24h.

### 6.2 Reply Comment (public reply on post)

Cũng dùng `reply_comment` action (theo `tab1-chat-messages.js` chain). Pancake API endpoint tương tự nhưng `action: "reply_comment"`. Extension fallback: `SEND_COMMENT` qua FB GraphQL `comments_create` mutation.

Extension SEND_COMMENT GraphQL input:

```json
{
  "actor_id": "<pageId>",
  "client_mutation_id": "10",
  "attachments": null,
  "formatting_style": null,
  "message": {"text": "<msg>", "ranges": [<mentions>]},
  "reply_target_clicked": false,
  "attribution_id_v2": "BusinessCometBizSuiteInboxRoot.react,bizkit.facebook,..."
}
```

## 7. React Message <a id="react-message"></a>

### Extension `REACT_MESSAGE` flow:

Page → postMessage:

```js
{
  type: "REACT_MESSAGE",
  pageId, igPageId, threadId, conversationUpdatedTime,
  messageTimestamp,      // timestamp_precise hoặc time_stamp
  emoji,                 // "😍", "👍", "like", etc
  globalId,              // global FB id of customer
  platform: "facebook" | "instagram_direct" | "instagram_official" | "instagram_unified",
  isBusiness: true|false,
  customerName, messageId,
  taskId
}
```

### SW handler (class `ke` in Pancake V2 source):

1. `preloadDocIds` if not loaded — fetch `business.facebook.com/latest/inbox/all` → extract doc_ids.
2. `initBase` — fetch fb_dtsg + region from FB Business.
3. Load latest messages via `Ne` class (`LoadFacebookMessages` flow) — find target message by matching `messageTimestamp` + sender filter.
4. GraphQL mutation `fi` doc_id:

```json
{
    "input": {
        "client_mutation_id": "3",
        "actor_id": "<pageId>",
        "action": "ADD_REACTION", // or "REMOVE_REACTION"
        "message_id": "<fbInternalMessageId>",
        "reaction": "<emoji>"
    }
}
```

5. Response: `data.message_reaction.client_mutation_id === "3"` → success.

### Instagram differs — `_a` GraphQL doc with `xig_direct_reaction_send_with_slide_messaging_response`:

```json
{
    "input": {
        "emoji": "<emoji>",
        "message_id": "<igMsgId>",
        "item_id": "<igItemId>",
        "reaction_status": "created", // or "removed"
        "thread_id": "<igThreadId>"
    }
}
```

## 8. Extension Bypass-24h Mechanism <a id="extension-bypass"></a>

### Khi nào trigger:

- Pancake API trả `success:false` với `e_code:10` (outside 24h policy)
- HOẶC user click "Gửi qua Extension" (manual override)

### Flow (CAPTURED LIVE 14:23:32 - 14:23:40):

1. **Page → CS**: `postMessage({type:"REPLY_INBOX_PHOTO", pageId, accessToken, message, attachmentType:"SEND_TEXT_ONLY", globalUserId, threadId:psid, convId:"t_"+psid, customerName, conversationUpdatedTime, contentIds:[], photoUrls:[], isBusiness:false, taskId})`
2. **CS → SW**: forward via `chrome.runtime.connect("pancake_tab")`
3. **SW `handleReplyInboxPhoto`**:
    - **init_inbox_normal** for `pageId`:
        - `GET https://business.facebook.com/latest/inbox/all?asset_id={pageId}&nav_ref=diode_page_inbox&mailbox_id={pageId}`
        - Parse HTML: extract `fb_dtsg`, `__user` (c_user), `client_revision`, region (msgrRegion), ttstamp
        - Handle cquick redirect: nếu HTML có `compat_iframe_token` → GET với `?cquick=jsc_c_d&cquick_token=<token>&ctarget=https%3A%2F%2Fwww.facebook.com`
    - **updateDynamicRules**: chrome.declarativeNetRequest rules thay đổi headers cho POST messaging/send/:
        - Origin: `https://business.facebook.com`
        - Referer: `https://business.facebook.com/latest/inbox/all?page_id={pageId}`
    - **resolveGlobalId** nếu chưa có: fetch via `GET_GLOBAL_ID_FOR_CONV` (5 strategies — threadId-based + customerName-based).
    - **buildSendParams** + POST `https://business.facebook.com/messaging/send/`:
        ```
        body=<text>&offline_threading_id=<uuid>&source=source:page_unified_inbox
        &timestamp=<now>&request_user_id=<pageId>&__user=<c_user>&fb_dtsg=<dtsg>
        &specific_to_list[0]=fbid:<globalUserId>&specific_to_list[1]=fbid:<pageId>
        &other_user_fbid=<globalUserId>&message_id=<uuid>&client=mercury
        &action_type=ma-type:user-generated-message&ephemeral_ttl_mode=0
        &has_attachment=false
        ```
    - **parseResponse**: `payload.actions[0].message_id` (FB MID) — SUCCESS.
    - SW → CS → Page: `{type:"REPLY_INBOX_PHOTO_SUCCESS", taskId, messageId, globalUserId, timestamp}`

### Critical: 27-second timeout

SW log `Time remain send inbox: 27026` — extension có 27s timeout cho mỗi POST send. Sau timeout: retry với reupload photos hoặc retry over socket.

## 9. Real Capture Log (HTĐ) <a id="real-capture"></a>

| Time        | Test                                  | Endpoint                                                                                             | Result                                                 |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 14:13:25    | Mở chat                               | POST `.../conversations/2147871636008763_813274741637389/messages/load_shop_page_customers`          | 200 ✓ load HTĐ                                         |
| 14:13:25    | Mở chat                               | GET `.../messages?customer_id=a4396516-b395-478c-8d2a-83985356cb63`                                  | 200 ✓ history                                          |
| 14:13:46    | Send text `[TEST]`                    | POST `.../conversations/270136663390370_25717004554573583/messages` (multipart `action=reply_inbox`) | ❌ `e_code:10, e_subcode:2018278` (24h)                |
| 14:14:29    | Private comment `[PRIVATE_COMMENT]`   | POST same path, JSON `action=private_replies, message_id, post_id, ...`                              | ✅ `{"id":"m_8wqSQ5J2rt...","success":true}` (TỚI HTĐ) |
| 14:23:32-40 | Send via FB Business (after FB login) | SW POST `business.facebook.com/messaging/send/` (after init_inbox_normal + DNR rules update)         | ✅ Bypass-24h, gửi thành công                          |

## 10. Implementation Notes cho web2-extension

Đã có sẵn trong [`web2-extension/`](../../web2-extension/):

- ✓ `REPLY_INBOX_PHOTO` handler (`background/facebook/sender.js`) — identical signature
- ✓ `SEND_PRIVATE_REPLY` handler (`background/facebook/commenter.js`)
- ✓ `SEND_COMMENT` handler
- ✓ Session init + dynamic rules (`background/facebook/session.js`)

Cần BỔ SUNG (chưa có):

- ❌ `REACT_MESSAGE` handler (class `ke` từ Pancake V2)
- ❌ `GET_STICKERS` / `GET_PACK_STICKERS` (class `xt`)
- ❌ `SEND_STICKER_COMMENT` (class `Ko`)
- ❌ `LOAD_FACEBOOK_MESSAGES` / `Ne` class — cần cho REACT (find target message)
- ❌ Pancake-direct path (`reply_inbox`, `private_replies`, `reply_comment`) — đây là API của Pancake, KHÔNG phải extension. Cần module wrapper trong `shared/js/web2-chat-client.js` hoặc tương tự.

Khi user gửi từ web2 native-orders chat:

1. Try Pancake `reply_inbox` (multipart POST) — Web2Chat.sendMessage
2. If fail (24h): try Pancake `private_replies` (JSON POST, cần comment_id)
3. If still fail: ext `REPLY_INBOX_PHOTO` via business.facebook.com
4. If still fail: ext `SEND_PRIVATE_REPLY` (graph.facebook.com private_replies endpoint)

Cùng chain với orders-report `tab1-chat-messages.js` line 1095-1175.
