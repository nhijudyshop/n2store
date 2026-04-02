# Pancake Extension V2 - Bypass Facebook 24h Messaging Window

## Tổng quan

Facebook giới hạn Page chỉ gửi được tin nhắn cho khách hàng trong vòng **24 giờ** kể từ tin nhắn cuối của khách (Messaging Window Policy). Sau 24h, Facebook API trả lỗi:

```
e_code: 10, e_subcode: 2018278
"It has been more than 24 hours since the recipient last responded"
```

Hoặc:
```
e_code: 551, e_subcode: 1545041
"Người này hiện không có mặt."
```

**Pancake Extension V2** (Chrome Extension) bypass giới hạn này bằng cách gửi qua endpoint nội bộ `business.facebook.com/messaging/send/` thay vì Facebook Graph API. Đây là cách Business Suite web gửi tin nhắn — không bị giới hạn 24h.

---

## Kiến trúc

### Message Flow (hiện tại - đã tối ưu)

```
Trang inbox (nhijudyshop)
    │
    │  1. Gửi qua Pancake API (Graph API) → fail (24h/551)
    │
    │  2. Fallback: Gửi qua Extension
    │     globalUserId = conv._raw.page_customer.global_id  ← LẤY TỪ PANCAKE API
    │     accessToken = window.inboxTokenManager.getTokenSync()  ← PANCAKE JWT
    │
    ├── window.postMessage({ type: 'REPLY_INBOX_PHOTO', globalUserId, accessToken, ... })
    │       │
    │       ▼
    │   contentscript.js (inject vào trang)
    │       │ chrome.runtime.connect (port)
    │       ▼
    │   background.js (Service Worker - 589KB)
    │       │ POST business.facebook.com/messaging/send/
    │       │ (dùng fb_dtsg token từ Facebook session + globalUserId)
    │       ▼
    │   REPLY_INBOX_PHOTO_SUCCESS { messageId: "mid.$...", timestamp: ... }
    │
    ▼
Tin nhắn đã gửi (bypass 24h)
```

### Key Insight: 5-step fallback chain cho globalUserId

Extension cần `globalUserId` (Global Facebook User ID) để gửi tin nhắn. Ta dùng 5-step fallback:

```
Try 1: Cache (instant)           → _globalIdCache[conversationId]
Try 2: Pancake API               → conv._raw.page_customer.global_id
Try 2b: Messages customers       → conv._messagesData.customers[0].global_id (~1-2s)
Try 3: Messages response merge   → conv._raw.thread_id (merged from fetchMessages)
Try 4: GET_GLOBAL_ID_FOR_CONV    → extension resolve via thread_id (~30-40s lần đầu)
```

**Try 2b** cover trường hợp `page_customer.global_id = null` nhưng messages endpoint trả `customers[].global_id`. Nhanh hơn extension 20-30x (~1-2s vs ~30-40s).

**PSID ≠ thread_id**: Dùng PSID làm threadId cho GET_GLOBAL_ID_FOR_CONV sẽ FAIL với `INCORRECT THREAD`. Phải dùng Facebook `thread_id` (thread_fbid).

**PSID OK cho REPLY_INBOX_PHOTO**: Extension chấp nhận PSID làm threadId trong REPLY_INBOX_PHOTO vì nó dùng `globalUserId` cho API call chính. Đã test thành công.

### Nguồn dữ liệu cho thread_id

| Nguồn | Trả thread_id? | Ghi chú |
|--------|----------------|---------|
| Conversations LIST endpoint | Một số page có, một số không | Page 270136663390370 có, page 112678138086607 không |
| Messages endpoint (`result.conversation`) | **CÓ THỂ** — merged vào `_raw` | Merged tự động khi user click vào conversation |
| Pancake IndexedDB cache | Có (pancake.vn) | Không truy cập được từ nhijudyshop |

### Cache: `_globalIdCache`

Sau khi resolve thành công, globalUserId được cache để lần gửi tiếp theo không cần đợi 30-40s:
```javascript
_globalIdCache[conversationId] = globalUserId; // instant on repeat sends
```

### Files

| File | Mô tả |
|------|--------|
| `pancake-extension/manifest.json` | Extension config, domains, permissions |
| `pancake-extension/scripts/background.js` | Service Worker chính (589KB minified) - xử lý Facebook API calls |
| `pancake-extension/scripts/contentscript.js` | Content script inject vào trang - bridge giữa page ↔ background |
| `pancake-extension/scripts/cext.js` | SharedWorker bridge (dùng cho iframe mode, ít quan trọng) |
| `pancake-extension/scripts/worker.js` | SharedWorker broadcast messages giữa tabs |
| `inbox/js/inbox-main.js` | Extension bridge + debug functions |
| `inbox/js/inbox-chat.js` | `_sendViaExtension()` - gửi tin nhắn qua extension |

---

## Cài đặt Extension

### Unpacked Extension (cho nhijudyshop)

Extension đã được sửa `manifest.json` thêm domain nhijudyshop vào `content_scripts.matches`:

```json
"content_scripts": [{
    "matches": [
        "https://pancake.vn/*",
        "https://*.nhijudyshop.workers.dev/*",
        "https://nhijudyshop.workers.dev/*",
        "https://nhijudyshop.github.io/*"
    ],
    "js": ["scripts/contentscript.js"]
}]
```

**Cài đặt:**
1. Chrome → `chrome://extensions/` → Developer mode ON
2. "Load unpacked" → chọn folder `pancake-extension/`
3. Extension ID: `fbpkaheebdjhiknljniepfgeaiijofcm` (thay đổi mỗi máy)

### Chrome Web Store Extension

- Extension ID gốc: `oehooocookcnclgniepdgaiankfifmmn`
- Version: 0.5.42 (build 267)
- **Không hoạt động trên nhijudyshop** vì `content_scripts.matches` không có domain nhijudyshop
- Chỉ hoạt động trên `pancake.vn`, `pages.fm`, etc.

### Lưu ý quan trọng
- **KHÔNG dùng cả 2 extension cùng lúc** (Chrome Web Store + unpacked) → conflict
- Extension cần user đã **đăng nhập Facebook** trên cùng Chrome profile
- `background.js` (589KB) là file gốc từ Pancake, **KHÔNG SỬA** — chỉ sửa `manifest.json` và thêm debug log vào `contentscript.js`

---

## Cách hoạt động chi tiết

### Bước 0: Extension kết nối

Khi trang load, `contentscript.js` inject vào và:
1. Tạo `chrome.runtime.connect({ name: "pancake_tab" })` tới background
2. Gửi `EXTENSION_LOADED` event về trang
3. Gửi `WAKE_UP` mỗi 10 giây để giữ Service Worker sống

```
contentscript.js:
    setup_port → chrome.runtime.connect
    → window.postMessage({ type: "EXTENSION_LOADED", from: "EXTENSION" })
    → setInterval WAKE_UP every 10s
```

Trang inbox nhận event trong `inbox-main.js`:
```javascript
// inbox-main.js line 205
window.pancakeExtension = { connected: false, lastEvents: [] };

// Khi nhận EXTENSION_LOADED:
window.pancakeExtension.connected = true;
// Gửi PREINITIALIZE_PAGES để extension warm up Facebook sessions
window.postMessage({ type: 'PREINITIALIZE_PAGES', pageIds: [...] });
```

### Bước 1: PREINITIALIZE_PAGES

Extension mở `business.facebook.com/latest/inbox/all?page_id=XXX` trong background để:
- Lấy **fb_dtsg** (CSRF token) từ Facebook HTML
- Cache Facebook session cookies
- Load GraphQL doc_ids (MessengerThreadlistQuery, etc.)

```
Log: "SET TO VERSION 6"
Log: "FOUND MessengerThreadlistQuery DOC ID"
Log: "UPDATE DYNAMIC RULES FOR URL https://business.facebook.com/latest/inbox/all?page_id=..."
```

### Bước 2: Resolve globalUserId (5-step fallback)

```javascript
// inbox-chat.js - _sendViaExtension()
const raw = conv._raw || {};

// Try 1: Cache (instant - từ lần gửi trước)
let globalUserId = this._globalIdCache[cacheKey] || null;

// Try 2: Pancake API (page_customer.global_id)
if (!globalUserId) globalUserId = raw.page_customer?.global_id || null;

// Try 2b: Messages response customers[].global_id (~1-2s, nhanh hơn extension 20-30x)
if (!globalUserId && conv._messagesData?.customers?.length) {
    globalUserId = conv._messagesData.customers[0].global_id || null;
}

// Try 3: thread_id từ API (merged từ messages response vào _raw)
const fbThreadId = raw.thread_id || null;

// Try 4: Nếu có thread_id → hỏi extension resolve qua GET_GLOBAL_ID_FOR_CONV
// ⚠️ PHẢI dùng thread_id (Facebook thread_fbid), KHÔNG PHẢI PSID!
if (!globalUserId && fbThreadId) {
    globalUserId = await getGlobalIdFromExtension(fbThreadId, conv.pageId); // timeout 60s
}

// Nếu tất cả fail → throw error
if (!globalUserId) throw new Error('Không tìm được Global Facebook ID');

// Cache cho lần sau
this._globalIdCache[cacheKey] = globalUserId;
```

**QUAN TRỌNG về thread_id:**
- `thread_id` có thể KHÔNG có trong conversations LIST response (tùy page)
- Nhưng CÓ THỂ có trong messages endpoint response (`result.conversation.thread_id`)
- Code tự động merge `result.conversation` fields vào `conv._raw` khi load messages (line ~1535)
- Nên user phải **click vào conversation** trước khi gửi tin (để messages endpoint được gọi)

### Bước 3: REPLY_INBOX_PHOTO (Gửi tin nhắn)

```javascript
const accessToken = window.inboxTokenManager?.getTokenSync?.() || '';

window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    pageId: conv.pageId,              // "112678138086607"
    igPageId: null,
    accessToken: accessToken,         // Pancake JWT token ← BẮT BUỘC
    tryResizeImage: true,
    contentIds: [],
    message: 'Nội dung tin nhắn',
    attachmentType: 'SEND_TEXT_ONLY',
    globalUserId: globalUserId,       // "100001957832900" ← TỪ API hoặc EXTENSION
    platform: 'facebook',
    replyMessage: null,
    threadId: psid,                   // "26140045085657251" (PSID)
    convId: 't_' + psid,             // "t_26140045085657251"
    customerName: 'Huỳnh Thành Đạt',
    conversationUpdatedTime: 1773560946749,
    photoUrls: [],
    isBusiness: false,                // PHẢI LÀ false
    taskId: Date.now(),
    from: 'WEBPAGE'
}, '*');
```

### accessToken (Pancake JWT)

`accessToken` là **Pancake login JWT** (không phải Facebook token). Pancake.vn **luôn gửi** field này trong REPLY_INBOX_PHOTO.

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
→ { name: "Kỹ Thuật NJD", uid: "c42ef91d-...", fb_id: "130759086650522", exp: 1780381883 }
```

Lấy từ: `window.inboxTokenManager.getTokenSync()` (đã load sẵn trong memory).

Extension background.js:
1. Dùng `fb_dtsg` + `globalUserId` + `accessToken` + cookies
2. POST tới `business.facebook.com/messaging/send/`
3. Trả về `REPLY_INBOX_PHOTO_SUCCESS` hoặc `REPLY_INBOX_PHOTO_FAILURE`

```javascript
// Response thành công:
{
    type: 'REPLY_INBOX_PHOTO_SUCCESS',
    taskId: 1234567891,
    pageId: '112678138086607',
    convId: 't_34116166741365151',
    messageId: 'mid.$cAAA8iWlJbAujO0rkmGdCgWVarv7_',
    globalUserId: '100001957832900',
    timestamp: 1773989633176,
    retryReason: null,
    messageCreatedRange: [1773989631342, 1773989633288]
}
```

---

## Các ID quan trọng

### PSID vs globalUserId vs threadId

| ID | Ví dụ | Nguồn | Mô tả |
|----|-------|-------|--------|
| PSID | `26140045085657251` | `conv.psid` / `conv._raw.from.id` | Page-Scoped ID — ID khách hàng theo Page |
| `globalUserId` | `100001957832900` | `conv._raw.page_customer.global_id` | Global Facebook User ID — **BẮT BUỘC** cho extension |
| `threadId` (Facebook) | `34116166741365151` | Pancake IndexedDB cache | Facebook thread_fbid — Pancake API **KHÔNG trả** field này |
| `conversationId` (Pancake) | `112678138086607_26140045085657251` | `conv.id` / `conv._raw.id` | Format: `pageId_psid` |

### Cách lấy globalUserId (5-step fallback)

```javascript
// Try 1: Cache (instant)
let globalUserId = this._globalIdCache[conversationId];

// Try 2: Từ Pancake API (đa số khách hàng có)
if (!globalUserId) globalUserId = conv._raw?.page_customer?.global_id;

// Try 2b: Từ messages response customers[] (~1-2s)
if (!globalUserId) globalUserId = conv._messagesData?.customers?.[0]?.global_id;

// Try 3+4: thread_id + GET_GLOBAL_ID_FOR_CONV (~30-40s, last resort)
// ⚠️ Dùng raw.thread_id (Facebook thread_fbid), KHÔNG PHẢI PSID!
const fbThreadId = conv._raw?.thread_id; // merged từ messages response
if (!globalUserId && fbThreadId) {
    window.postMessage({
        type: 'GET_GLOBAL_ID_FOR_CONV',
        pageId: conv.pageId,
        threadId: fbThreadId,         // Facebook thread_fbid ← ĐÚNG
        threadKey: 't_' + fbThreadId, // threadKey format
        isBusiness: true,
        conversationUpdatedTime: timestamp,
        customerName: conv.name,
        convType: 'INBOX',
        postId: null, convId: null,
        taskId: Date.now(),
        from: 'WEBPAGE'
    }, '*');
    // → GET_GLOBAL_ID_FOR_CONV_SUCCESS { globalId: "100002968457940" }
    // ⏱️ Extension cần ~30-40s lần đầu (graphqlbatch), instant nếu cached
}
```

### PSID vs thread_id (BUG ĐÃ FIX)

**PSID** (VD: `7404404646279046`) ≠ **thread_id** (VD: `2109131096157575`)

Extension background.js lỗi khi dùng PSID làm threadId:
```
FAIL TO GET GLOBAL ID --> INCORRECT THREAD 7404404646279046, t_7404404646279046 VS undefined
```

Extension cần Facebook `thread_fbid` để query `PagesManagerInboxAdminAssignerRootQuery` → resolve Global ID.

### isBusiness: false (QUAN TRỌNG)

Mặc dù gửi qua Business Suite endpoint, trường `isBusiness` trong payload REPLY_INBOX_PHOTO phải là **`false`**. Đây là cách pancake.vn gửi. Nếu để `true`, extension xử lý khác và có thể fail.

---

## Gửi ảnh qua Extension (bypass 24h)

Extension hỗ trợ gửi ảnh qua 2 bước:

### Bước 1: UPLOAD_INBOX_PHOTO (upload ảnh lên Facebook)

```javascript
window.postMessage({
    type: 'UPLOAD_INBOX_PHOTO',
    pageId: '112678138086607',
    photoUrl: 'https://content.pancake.vn/...',  // URL public của ảnh
    name: 'image.jpg',
    platform: 'facebook',
    taskId: Date.now(),
    uploadId: 'upload_' + Date.now(),
    from: 'WEBPAGE'
}, '*');
// → UPLOAD_INBOX_PHOTO_SUCCESS { fbId: "123456", previewUri: "..." }
```

Extension download ảnh từ URL → upload tới `upload-business.facebook.com/ajax/mercury/upload.php` → trả về Facebook `fbId`.

### Bước 2: REPLY_INBOX_PHOTO với attachmentType: 'PHOTO'

```javascript
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    attachmentType: 'PHOTO',            // ← PHOTO thay vì SEND_TEXT_ONLY
    files: ['123456'],                   // ← fbId từ UPLOAD_INBOX_PHOTO_SUCCESS
    message: '',                         // Ảnh gửi riêng, text gửi message sau
    // ... các field khác giống text-only
}, '*');
```

Extension đóng gói thành `image_ids[]` → POST `business.facebook.com/messaging/send/`

### Các attachmentType được hỗ trợ

| attachmentType | files[] chứa | Mô tả |
|---|---|---|
| `SEND_TEXT_ONLY` | `[]` | Chỉ text (hiện tại) |
| `PHOTO` | `[fbId]` | Ảnh (image_ids[]) |
| `VIDEO` | `[fbId]` | Video (video_ids[]) |
| `FILE` | `[fbId]` | File (file_ids[]) |
| `STICKER` | `[stickerId]` | Sticker (sticker_id) |
| `AUDIO` | `[fbId]` | Audio (audio_ids[]) |

### Trong n2store: Upload ảnh lên Pancake trước → dùng content_url cho extension

```
1. pdm.uploadImage(pageId, imageFile) → content_url (Pancake CDN)
2. Thử gửi qua Pancake API (reply_inbox + content_url)
3. Nếu 24h fail → _sendViaExtension('', conv, content_url)
   a. UPLOAD_INBOX_PHOTO: content_url → extension → Facebook fbId
   b. REPLY_INBOX_PHOTO: attachmentType='PHOTO', files=[fbId]
4. Nếu có text → gửi text riêng (SEND_TEXT_ONLY)
```

---

## Fallback Logic trong inbox-chat.js

```javascript
// inbox-chat.js - _sendInbox() (TEXT)
async _sendInbox(url, text, conv, replyData) {
    try {
        await this._sendApi(url, { action: 'reply_inbox', message: text });
    } catch (err) {
        if (window.pancakeExtension?.connected) {
            await this._sendViaExtension(text, conv);
            return;
        }
        throw err;
    }
}

// inbox-chat.js - sendMessage() (IMAGE + TEXT)
// Image: API fail → _sendViaExtension('', conv, imageContentUrl)
// Text: _sendInbox() → API fail → _sendViaExtension(text, conv)
```

**Flow (text):**
1. Gửi qua Pancake API (Graph API) → nếu OK thì xong
2. Nếu lỗi 24h/551 → check `window.pancakeExtension.connected`
3. Nếu extension connected → `_sendViaExtension(text, conv)`
4. Nếu không có extension → show error toast

**Flow (ảnh + text):**
1. Upload ảnh lên Pancake → content_url
2. Gửi ảnh qua API (reply_inbox + content_url) → nếu OK → tiếp
3. Nếu 24h → `_sendViaExtension('', conv, content_url)` → upload + send ảnh qua extension
4. Gửi text qua API → nếu 24h → `_sendViaExtension(text, conv)` → send text qua extension

---

## Debug

### Console commands

```javascript
// Kiểm tra extension đã kết nối chưa
window.pancakeExtension
// → { connected: true, lastEvents: [...] }

// Xem global_id của conversation đang mở
const id = window.inboxChat?.activeConversationId;
const conv = window.inboxChat?.data?.getConversation(id);
console.log('global_id:', conv?._raw?.page_customer?.global_id);
console.log('psid:', conv?.psid);

// Debug full extension (test fb_dtsg, version)
debugExtension()
debugExtension('PAGE_ID')

// Xem event log
window.pancakeExtension.lastEvents

// Xem raw conversation data (tất cả fields từ Pancake API)
console.log(JSON.stringify(conv?._raw, null, 2));
```

### Pancake API conversation fields (24 fields)

```
id, type, tags, seen, from, snippet, inserted_at, updated_at,
message_count, page_id, assignee_ids, last_sent_by, customers,
post_id, has_phone, recent_phone_numbers, assignee_group_id,
customer_id, page_customer, ads, ad_ids, assignee_histories,
current_assign_users, tag_histories
```

**Quan trọng:** `page_customer.global_id` = Global Facebook User ID

### Debug log prefixes

| Prefix | File | Mô tả |
|--------|------|--------|
| `[CS→BG]` | contentscript.js | Trang → Background (gửi command) |
| `[BG→CS]` | contentscript.js | Background → Trang (nhận response) |
| `[EXT-EVENT]` | inbox-main.js | Tất cả extension events |
| `[EXT-SEND]` | inbox-chat.js | Chi tiết gửi tin nhắn qua extension |

### Service Worker console (chrome://extensions/)

Mở extension → "Inspect views: service worker" để xem:
- `FOUND MessengerThreadlistQuery DOC ID` → Extension đã lấy được GraphQL doc IDs
- `UPDATE DYNAMIC RULES FOR URL .../messaging/send/` → Đang gửi tin nhắn
- `Time remain send inbox: XXXXX` → Timer còn lại trước khi gửi
- `CANNOT GET GLOBAL ID WITH ...` → GraphQL lookup failed (chỉ xảy ra nếu dùng GET_GLOBAL_ID_FOR_CONV)

---

## Các loại message type

### Gửi đi (Trang → Extension)

| Type | Mô tả |
|------|--------|
| `PREINITIALIZE_PAGES` | Warm up Facebook sessions cho các page |
| `CHECK_EXTENSION_VERSION` | Kiểm tra version extension |
| `GET_BUSINESS_CONTEXT` | Lấy fb_dtsg token |
| `GET_GLOBAL_ID_FOR_CONV` | Resolve thread → Global Facebook ID (không cần nếu có `page_customer.global_id`) |
| `REPLY_INBOX_PHOTO` | Gửi tin nhắn text/ảnh |
| `UPLOAD_INBOX_PHOTO` | Upload ảnh |
| `SEND_COMMENT` | Gửi comment |
| `WAKE_UP` | Giữ Service Worker sống |

### Nhận về (Extension → Trang)

| Type | Mô tả |
|------|--------|
| `EXTENSION_LOADED` | Extension đã inject vào trang |
| `EXTENSION_VERSION` | Trả version + build number |
| `GET_BUSINESS_CONTEXT_SUCCESS/FAILURE` | fb_dtsg kết quả |
| `GET_GLOBAL_ID_FOR_CONV_SUCCESS/FAILURE` | Global ID kết quả |
| `REPLY_INBOX_PHOTO_SUCCESS/FAILURE` | Kết quả gửi tin nhắn |
| `REPORT_EXTENSION_STATUS` | Trạng thái kết nối Facebook |

---

## Lỗi thường gặp

### 1. Extension not connected
**Triệu chứng:** `window.pancakeExtension.connected === false`
**Nguyên nhân:**
- Domain không có trong `manifest.json` `content_scripts.matches`
- Extension chưa load (reload trang)
- Dùng Chrome Web Store extension thay vì unpacked

### 2. No global_id AND no thread_id
**Triệu chứng:** `[EXT-SEND] No global_id AND no thread_id in conversation data!`
**Nguyên nhân:**
- `page_customer.global_id` = null (Pancake chưa resolve)
- `thread_id` không có trong conversations LIST response
- Messages endpoint chưa được gọi (user chưa click vào conversation)
**Xử lý:**
1. Click vào conversation trước → messages endpoint trả `result.conversation` có thể chứa `thread_id`
2. Code tự động merge `thread_id` vào `_raw` khi load messages
3. Nếu vẫn không có → hiển thị error "Không tìm được Global Facebook ID"

### 3. INCORRECT THREAD error
**Triệu chứng:** Extension background.js: `FAIL TO GET GLOBAL ID --> INCORRECT THREAD {psid}, t_{psid} VS undefined`
**Nguyên nhân:** Code cũ dùng PSID thay vì Facebook thread_id làm threadId
**Đã fix:** Dùng `raw.thread_id` (Facebook thread_fbid) thay vì PSID

### 4. REPLY_INBOX_PHOTO_FAILURE (no error message)
**Triệu chứng:** Extension trả failure nhưng không có error detail
**Nguyên nhân:**
- `globalUserId` null hoặc sai
- `accessToken` thiếu hoặc expired (Pancake JWT)
- `isBusiness` sai (phải là `false`)
- fb_dtsg expired (cần refresh Facebook page)

### 5. TIMEOUT 60s
**Triệu chứng:** `Extension send timeout (60s)` hoặc `GET_GLOBAL_ID_FOR_CONV timeout (60s)`
**Nguyên nhân:**
- GET_GLOBAL_ID_FOR_CONV thường mất ~30-40s lần đầu (extension query graphqlbatch)
- Extension Service Worker đã tắt (không có WAKE_UP)
- Facebook session expired
- Network issues
**Lưu ý:** Timeout đã tăng lên 60s (từ 15s/35s ban đầu) dựa trên đo thực tế (~39.9s).

---

## fb_dtsg

**fb_dtsg** là CSRF token của Facebook, chỉ lấy được bằng cách:
1. Mở trang `business.facebook.com` (extension background.js tự làm khi PREINITIALIZE_PAGES)
2. Parse HTML để extract token
3. **KHÔNG thể lấy qua API** (Graph API, Pancake API, etc.)

Extension tự quản lý fb_dtsg qua `GET_BUSINESS_CONTEXT`:
```javascript
window.postMessage({ type: 'GET_BUSINESS_CONTEXT', pageId: 'PAGE_ID' });
// → GET_BUSINESS_CONTEXT_SUCCESS { dtsg: "AQ...", context: { ... } }
```

---

## Pancake IndexedDB Cache (tham khảo)

Pancake.vn cache global IDs trong IndexedDB `fb_meta_data`:

```javascript
// DB: fb_meta_data
// Store: global_user_ids (43 items)
{ "globalId": "100008123833898", "threadId": "120006314020456", "pageId": "112678138086607", "insertedAt": 1773989634 }

// Store: global_user_ids_2 (43 items)
{ "threadId": "122200536296499398", "globalId": "61564981960459", "pageId": "112678138086607", "insertedAt": 1773989632 }
```

Các databases của Pancake:
- `ComCakeDatabase` → cache
- `PancakeOffline` → QuickReplies
- `fb_meta_data` → **global_user_ids** (mapping threadId ↔ globalId)
- `pancakeIndexedDB` → EXPORT_ADS_CONV, EXPORT_CONTACTS, etc.

---

## Lịch sử debug (tóm tắt)

1. **Vấn đề ban đầu:** Facebook 24h policy block gửi tin nhắn qua Graph API
2. **Giải pháp:** Dùng Pancake Extension V2 bypass qua `business.facebook.com/messaging/send/`
3. **Bug 1:** Extension cần `globalUserId` (Global Facebook ID), ta gửi PSID → fail
4. **Bug 2:** `GET_GLOBAL_ID_FOR_CONV` cần Facebook thread_fbid, ta gửi `pageId_psid` → fail
5. **Bug 3:** Dùng PSID làm threadId → `INCORRECT THREAD` error
6. **Fix 1:** Pancake API trả `page_customer.global_id` trực tiếp → dùng làm globalUserId
7. **Bug 4:** Một số khách có `global_id: null` → cần GET_GLOBAL_ID_FOR_CONV nhưng PSID ≠ thread_id
8. **Fix 2:** Phát hiện `raw.thread_id` (Facebook thread_fbid) trong conversation data → dùng cho GET_GLOBAL_ID_FOR_CONV
9. **Bug 5:** Timeout 15s quá ngắn — extension cần ~30-40s resolve (đo được 39.9s) → tăng lên 60s
10. **Fix 3:** Thêm `_globalIdCache` để cache globalUserId → instant trên lần gửi tiếp
11. **Bug 6:** Một số page (112678138086607) conversations LIST không trả `thread_id`
12. **Fix 4:** Merge `result.conversation` từ messages endpoint vào `conv._raw` → có thể lấy thread_id sau khi click vào conversation
13. **Bug 7:** `accessToken` (Pancake JWT) thiếu trong payload → thêm `window.inboxTokenManager.getTokenSync()`
14. **Fix 5:** Thêm `customers[0].global_id` từ messages response làm fallback (~1-2s thay vì ~30-40s extension)
15. **Confirmed:** Extension chấp nhận PSID làm threadId trong REPLY_INBOX_PHOTO (dùng globalUserId cho API call chính)
16. **Feature:** Thêm gửi ảnh qua extension — UPLOAD_INBOX_PHOTO → REPLY_INBOX_PHOTO (attachmentType='PHOTO', files=[fbId])
17. **Flow:** Upload ảnh lên Pancake → API fail 24h → extension upload ảnh lên Facebook → gửi tin nhắn ảnh bypass 24h

---

## Tham chiếu code hiện tại

- **Extension bridge:** [inbox-main.js:204-337](inbox/js/inbox-main.js#L204-L337)
- **Send via extension (text+image):** `inbox-chat.js` — `_sendViaExtension(text, conv, imageUrl)`
- **Upload via extension:** `inbox-chat.js` — `_uploadViaExtension(photoUrl, conv)`
- **Global ID cache:** `inbox-chat.js` — `_globalIdCache = {}`
- **Image fallback in sendMessage:** `inbox-chat.js` — `sendMessage()` image block with extension fallback
- **Merge thread_id from messages:** [inbox-chat.js:1535-1553](inbox/js/inbox-chat.js#L1535-L1553) — `result.conversation` → `conv._raw`
- **mapConversation (raw data):** [inbox-data.js:465-486](inbox/js/inbox-data.js#L465-L486)
- **Manifest (domains):** [pancake-extension/manifest.json](pancake-extension/manifest.json)
- **Content script:** [pancake-extension/scripts/contentscript.js](pancake-extension/scripts/contentscript.js)
