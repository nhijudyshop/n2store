# Pancake Extension V2 - Full Documentation

> Chrome Extension bypass Facebook 24h messaging window + multi-platform messaging
> Version: 0.5.42 (build 267) | Manifest V3 | Service Worker architecture

---

## 1. Tổng quan

Pancake Extension V2 là Chrome Extension cho phép **gửi tin nhắn qua Facebook Business Suite internal API**, bypass giới hạn 24h messaging window của Facebook Graph API.

### Tại sao cần Extension?

| Kênh gửi | Giới hạn 24h? | Endpoint |
|-----------|---------------|----------|
| Facebook Graph API | **CÓ** — lỗi `e_code: 10, e_subcode: 2018278` | `graph.facebook.com` |
| Pancake API (dùng Graph API) | **CÓ** — cùng giới hạn | `pages.fm/api/public_api/v1` |
| Business Suite Web (extension) | **KHÔNG** — giao diện con người | `business.facebook.com/messaging/send/` |

Extension mô phỏng cách Facebook Business Suite web gửi tin nhắn — Facebook coi đây là "human-operated interface" nên không áp dụng 24h rule.

---

## 2. Kiến trúc

```
┌─────────────────────────────────────────────────────────────────┐
│  Trang web (nhijudyshop / pancake.vn)                          │
│  ├── inbox-main.js  → Extension bridge, event listener         │
│  └── inbox-chat.js  → _sendViaExtension(), _uploadViaExtension │
│       │                                                         │
│       │ window.postMessage({type: 'REPLY_INBOX_PHOTO', ...})   │
│       ▼                                                         │
│  contentscript.js (inject vào trang)                           │
│       │ chrome.runtime.connect (port)                           │
│       ▼                                                         │
│  background.js (Service Worker - 589KB)                        │
│       │                                                         │
│       ├── Facebook Session: fb_dtsg, cookies, GraphQL doc_ids  │
│       ├── POST business.facebook.com/messaging/send/           │
│       ├── POST upload-business.facebook.com/ajax/mercury/upload│
│       ├── WebSocket: wss://edge-chat.facebook.com/             │
│       └── WebSocket: wss://edge-chat.instagram.com/            │
│       │                                                         │
│       ▼                                                         │
│  REPLY_INBOX_PHOTO_SUCCESS / FAILURE → contentscript → page    │
└─────────────────────────────────────────────────────────────────┘
│                                                                 │
│  Phụ trợ:                                                       │
│  ├── offscreen.js  → eval sandbox, DOM parsing, keep-alive     │
│  ├── sandbox.html  → Safe function execution (eval wrapper)    │
│  ├── cext.js       → SharedWorker bridge (iframe mode)         │
│  └── worker.js     → SharedWorker broadcast giữa tabs          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Files & Chức năng

| File | Size | Chức năng |
|------|------|-----------|
| `manifest.json` | 2.7KB | Config: permissions, domains, service worker |
| `scripts/background.js` | 589KB | **Core**: xử lý tất cả Facebook/IG/LINE/Zalo API |
| `scripts/contentscript.js` | 6.8KB | Bridge: page ↔ service worker (170+ message types) |
| `scripts/offscreen.js` | 8.8KB | Offscreen page: eval sandbox + keep-alive (20s) |
| `scripts/cext.js` | 5KB | SharedWorker bridge cho iframe mode |
| `scripts/worker.js` | 1.1KB | SharedWorker: broadcast messages giữa tabs |
| `sandbox.html` | 1.5KB | Eval sandbox: safe function execution |
| `offscreen.html` | 44B | Offscreen document shell |
| `pancext.html` | 39B | SharedWorker bridge page |
| `note.md` | 2.6KB | Developer notes về events |

---

## 4. Manifest V3 Configuration

### Permissions

| Permission | Mục đích |
|------------|----------|
| `cookies` | Đọc Facebook session cookies (c_user, xs, datr) |
| `storage` | chrome.storage cho cache |
| `unlimitedStorage` | IndexedDB không giới hạn |
| `offscreen` | Offscreen document (DOM parsing, eval) |
| `webRequest` | Monitor network requests |
| `declarativeNetRequestWithHostAccess` | Sửa headers (Origin, Referer) |
| `declarativeContent` | Conditional content script injection |

### Host Permissions (Tất cả platforms)

**Facebook:**
- `*://facebook.com/`, `*://www.facebook.com/`, `*://m.facebook.com/`
- `*://business.facebook.com/`, `*://web.facebook.com/`
- `*://upload-business.facebook.com/`, `*://p-upload.facebook.com/`
- `*://graph.facebook.com/`
- `wss://edge-chat.facebook.com/` (WebSocket real-time)

**Instagram:**
- `*://*.instagram.com/`, `wss://edge-chat.instagram.com/`

**LINE:** `*://*.line.biz/`
**Zalo:** `*://oa.zalo.me/`, `*://zalo.me/`
**Pancake:** `*://*.pancake.vn/`, `*://*.pages.fm/`, etc.

### Content Script Domains

Extension inject `contentscript.js` vào các domain:
- Pancake: `pancake.vn`, `pages.fm`, `botcake.io`, `pancake.ph/id/in/biz/net`
- POS: `pos.pancake.vn`, `pos.pages.fm`, etc.
- Dev: `localhost:3000/3001/8003`, `dev.pancake.vn`
- **N2Store**: `nhijudyshop.workers.dev`, `nhijudyshop.github.io`

### DeclarativeNetRequest Rules

Extension tự động sửa headers cho requests tới Facebook:
```json
{
  "action": { "type": "modifyHeaders", "requestHeaders": [
    { "header": "Origin", "operation": "set", "value": "https://www.facebook.com" },
    { "header": "Accept", "operation": "set", "value": "text/html,..." }
  ]},
  "condition": { "requestDomains": ["facebook.com", "business.facebook.com", ...] }
}
```

---

## 5. Tất cả Message Types (170+ types)

### 5.1 Khởi tạo & Health Check

| Type (→ Extension) | Mô tả |
|---|---|
| `WAKE_UP` | Keep Service Worker sống (gửi mỗi 10s) |
| `CHECK_EXTENSION` | Kiểm tra extension có tồn tại |
| `CHECK_EXTENSION_VERSION` | Lấy version + build number |
| `SET_ACCESS_TOKEN` | Lưu Pancake JWT token |
| `PREINITIALIZE_PAGES` | Warm up Facebook sessions: lấy fb_dtsg, load GraphQL doc_ids |
| `PRELOAD_DOC_IDS` | Preload Facebook GraphQL doc_ids |

| Type (← Extension) | Mô tả |
|---|---|
| `EXTENSION_LOADED` | Extension đã inject vào trang |
| `EXTENSION_VERSION` | Trả version + build |
| `EXTENSION_NOTIFICATIONS` | Status/notification |
| `REPORT_EXTENSION_STATUS` | Trạng thái kết nối Facebook |

### 5.2 Gửi tin nhắn (Core)

| Type (→ Extension) | Mô tả | Attachment Types |
|---|---|---|
| `REPLY_INBOX_PHOTO` | **Gửi tin nhắn text/ảnh/video/file/sticker** | SEND_TEXT_ONLY, PHOTO, VIDEO, FILE, STICKER, AUDIO |
| `UPLOAD_INBOX_PHOTO` | Upload ảnh lên Facebook (trả fbId) | — |
| `SEND_COMMENT` | Gửi comment trên post (cần switch profile) | — |
| `EDIT_COMMENT` | Sửa comment | — |
| `SEND_PRIVATE_REPLY` | Nhắn riêng cho người comment | — |
| `REMOVE_COMMENT` | Xóa comment | — |
| `REPLY_INBOX_PRODUCT` | Gửi product message | — |

| Type (← Extension) | Mô tả |
|---|---|
| `REPLY_INBOX_PHOTO_SUCCESS` | Gửi thành công: `{ messageId, timestamp, messageCreatedRange }` |
| `REPLY_INBOX_PHOTO_FAILURE` | Gửi thất bại |
| `UPLOAD_INBOX_PHOTO_SUCCESS` | Upload thành công: `{ fbId, previewUri }` |
| `UPLOAD_INBOX_PHOTO_FAILURE` | Upload thất bại |
| `SEND_COMMENT_SUCCESS/FAILURE` | Kết quả gửi comment |
| `SEND_PRIVATE_REPLY_SUCCESS/FAILURE` | Kết quả nhắn riêng |

### 5.3 Tương tác

| Type (→ Extension) | Mô tả |
|---|---|
| `REACT_MESSAGE` | Thêm reaction (like, love, haha, wow, sad, angry) |
| `BLOCK_FACEBOOK_USER` | Block user |
| `INVITE_LIKE_PAGE` | Mời like page (batch, có progress) |
| `GET_STICKERS` | Lấy danh sách sticker packs |
| `GET_PACK_STICKERS` | Lấy stickers từ pack cụ thể |
| `SEND_STICKER_COMMENT` | Gửi sticker comment (không dùng trên Pancake) |
| `CHANGE_CONV_STATUS_TO_ARCHIVED` | Archive conversation |

### 5.4 Lấy dữ liệu & Context

| Type (→ Extension) | Mô tả |
|---|---|
| `GET_BUSINESS_CONTEXT` | Lấy fb_dtsg (CSRF token) cho page |
| `GET_GLOBAL_ID_FOR_CONV` | Resolve thread_id → globalUserId (~30-40s lần đầu) |
| `BATCH_GET_GLOBAL_ID` | Batch resolve nhiều thread_ids (không dùng) |
| `GET_PROFILE_INFO` | Lấy thông tin profile (tên, avatar, bio) |
| `GET_PROFILE_LINK` | Lấy URL profile Facebook |
| `GET_BIRTHDAY_INFO` | Lấy sinh nhật user |
| `GET_POST_ID_FROM_LINK` | Extract post ID từ URL |
| `GET_IMG_FROM_SHARED_ATTACHMENT` | Lấy URL ảnh từ shared attachment |
| `GET_IG_CONTACT_ID` | Lấy Instagram contact ID |
| `LOAD_FACEBOOK_MESSAGES` | Load lịch sử tin nhắn conversation |
| `LOAD_FB_POST` | Load chi tiết post |
| `GET_FB_MSG` | Lấy tin nhắn cụ thể |
| `MAKE_MESSENGER_LINK` | Tạo link Messenger conversation |
| `GET_BUSINESS_WS_CONTEXT` | Lấy WebSocket context info |
| `GET_PINABLE_PRODUCTS` | Lấy products có thể pin |
| `TOGGLE_PIN_PRODUCT` | Pin/unpin product |

### 5.5 Real-time Listeners (WebSocket)

| Type (→ Extension) | Mô tả |
|---|---|
| `LISTEN_INBOX` | Bật real-time listener Facebook inbox |
| `STOP_LISTEN_INBOX` | Tắt listener |
| `PLZ_DONT_STOP_LISTEN_INBOX_THIS_PAGE` | Giữ listener khi tab khác tắt |
| `LISTEN_IG_COMMENT` | Bật real-time listener Instagram comments |
| `STOP_LISTEN_IG_COMMENT` | Tắt IG listener |
| `PLZ_DONT_STOP_LISTEN_IG_COMMENT_THIS_PAGE` | Giữ IG listener |
| `LISTEN_WS` | Generic WebSocket listener |
| `STOP_LISTEN_WS` | Tắt generic listener |
| `PLZ_DONT_STOP_LISTEN_THIS_PAGE` | Giữ generic listener |

### 5.6 Data Crawling

| Type (→ Extension) | Mô tả |
|---|---|
| `CRAWL_LIVESTREAM_DATA` | Extract dữ liệu livestream |
| `CRAWL_POST_SHARE_DATA` | Extract shared post data |
| `CRAWL_LEAD_FORM_MSG_DETAIL` | Extract lead form details |
| `ENABLE_FIND_THREAD_BY_USERNAME` | Bật tìm thread theo username |

### 5.7 Commerce & POS

| Type (→ Extension) | Mô tả |
|---|---|
| `POS_SYNC_PRODUCT_TO_FBSHOP` | Sync product POS → Facebook Shop |
| `SYNC_PRODUCT_FROM_FBSHOP_TO_POS` | Sync ngược (không dùng nữa) |
| `UPLOAD_MEDIA_TO_PANCAKE` | Upload media lên Pancake CDN |
| `LOAD_ECOMMERCE_PRODUCT` | Load ecommerce product (không dùng) |

### 5.8 LINE Integration

| Type (→ Extension) | Mô tả |
|---|---|
| `LINE:INITIALIZE_PAGE` | Khởi tạo LINE Business API |
| `LINE:TURN_ON_RETRY_WEBHOOK` | Bật webhook retry |
| `LINE:GET_CONVERSATIONS` | Lấy LINE conversations |
| `CREATE_APPOINTMENT` | Tạo appointment |
| `APPROVE_APPOINTMENT` | Duyệt appointment |
| `DENY_APPOINTMENT` | Từ chối appointment |

### 5.9 Zalo Integration

| Type (→ Extension) | Mô tả |
|---|---|
| `LISTEN_WS_ZALO_OA` | Bật listener Zalo OA messages |
| `STOP_LISTEN_WS_ZALO_OA` | Tắt listener |
| `REPLY_INBOX_FILE_ZALO_OA` | Gửi message/file cho Zalo OA customer |
| `VALIDATE_SEND_IGD_INBOX` | Validate gửi IGD inbox |

### 5.10 Utility

| Type (→ Extension) | Mô tả |
|---|---|
| `DOWNLOAD_FILE` | Download file từ message |
| `CONFIG_ROUTING_APP` | Cấu hình routing app |
| `CACHE_PAGES_ROUTING_APP` | Cache routing data |

---

## 6. Cách dùng (cho N2Store)

### 6.1 Cài đặt Extension

1. Clone/copy folder `pancake-extension/`
2. Chrome → `chrome://extensions/` → Developer mode ON
3. "Load unpacked" → chọn folder `pancake-extension/`
4. **KHÔNG dùng cùng lúc** với Chrome Web Store extension Pancake

### 6.2 Kiểm tra Extension đã kết nối

```javascript
// Console trên trang nhijudyshop
window.pancakeExtension
// → { connected: true, lastEvents: [...] }

// Xem version
window.postMessage({ type: 'CHECK_EXTENSION_VERSION', from: 'WEBPAGE' }, '*');
// → Listen for EXTENSION_VERSION event
```

### 6.3 Gửi tin nhắn text (bypass 24h)

```javascript
// Cần có: globalUserId, pageId, psid, accessToken (Pancake JWT)
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    pageId: '112678138086607',
    igPageId: null,
    accessToken: window.inboxTokenManager.getTokenSync(),
    tryResizeImage: true,
    contentIds: [],
    message: 'Xin chào!',
    attachmentType: 'SEND_TEXT_ONLY',
    files: [],
    globalUserId: '100001957832900',    // BẮT BUỘC
    platform: 'facebook',
    replyMessage: null,
    threadId: '26140045085657251',       // PSID
    convId: 't_26140045085657251',
    customerName: 'Tên khách',
    conversationUpdatedTime: Date.now(),
    photoUrls: [],
    isBusiness: false,                   // PHẢI là false
    taskId: Date.now(),
    from: 'WEBPAGE'
}, '*');
```

### 6.4 Gửi ảnh (bypass 24h)

**Bước 1: Upload ảnh**
```javascript
window.postMessage({
    type: 'UPLOAD_INBOX_PHOTO',
    pageId: '112678138086607',
    photoUrl: 'https://content.pancake.vn/xxx/image.jpg',  // URL public
    name: 'image.jpg',
    platform: 'facebook',
    taskId: Date.now(),
    uploadId: 'upload_' + Date.now(),
    from: 'WEBPAGE'
}, '*');
// → UPLOAD_INBOX_PHOTO_SUCCESS { fbId: "123456789", previewUri: "..." }
```

**Bước 2: Gửi với fbId**
```javascript
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    attachmentType: 'PHOTO',            // ← PHOTO thay vì SEND_TEXT_ONLY
    files: ['123456789'],                // ← fbId từ upload
    message: '',                         // Ảnh không kèm text
    // ... các field khác giống text-only
}, '*');
```

### 6.5 Lấy fb_dtsg

```javascript
window.postMessage({ type: 'GET_BUSINESS_CONTEXT', pageId: '112678138086607', from: 'WEBPAGE' }, '*');
// → GET_BUSINESS_CONTEXT_SUCCESS { dtsg: "AQ...", context: { ... } }
```

### 6.6 Resolve Global ID

```javascript
window.postMessage({
    type: 'GET_GLOBAL_ID_FOR_CONV',
    pageId: '112678138086607',
    threadId: '34116166741365151',       // Facebook thread_fbid (KHÔNG PHẢI PSID!)
    threadKey: 't_34116166741365151',
    isBusiness: true,
    conversationUpdatedTime: Date.now(),
    customerName: 'Tên khách',
    convType: 'INBOX',
    postId: null, convId: null,
    taskId: Date.now(),
    from: 'WEBPAGE'
}, '*');
// → GET_GLOBAL_ID_FOR_CONV_SUCCESS { globalId: "100002968457940" }
// ⏱️ ~30-40s lần đầu, instant nếu cached
```

---

## 7. Lưu ý quan trọng

### 7.1 isBusiness: false

Trường `isBusiness` trong REPLY_INBOX_PHOTO **PHẢI là `false`**. Dù gửi qua Business Suite endpoint, đây là cách pancake.vn gửi. Nếu `true`, extension xử lý flow khác và có thể fail.

### 7.2 PSID ≠ thread_id ≠ globalUserId

| ID | Ví dụ | Nguồn | Dùng cho |
|----|-------|-------|----------|
| PSID | `26140045085657251` | `conv.psid` | threadId trong REPLY_INBOX_PHOTO (OK) |
| thread_id | `34116166741365151` | `conv._raw.thread_id` | GET_GLOBAL_ID_FOR_CONV (BẮT BUỘC) |
| globalUserId | `100001957832900` | `page_customer.global_id` | REPLY_INBOX_PHOTO (BẮT BUỘC) |

- Dùng PSID cho `GET_GLOBAL_ID_FOR_CONV` → **FAIL** ("INCORRECT THREAD")
- Dùng PSID cho `REPLY_INBOX_PHOTO.threadId` → **OK** (extension dùng globalUserId cho API call chính)

### 7.3 accessToken là Pancake JWT

`accessToken` trong payload là **Pancake login JWT** (không phải Facebook token). Lấy từ `window.inboxTokenManager.getTokenSync()`.

### 7.4 fb_dtsg

- CSRF token của Facebook, **chỉ lấy được từ HTML** (không qua API)
- Extension tự quản lý qua `PREINITIALIZE_PAGES` và `GET_BUSINESS_CONTEXT`
- Cần user **đã đăng nhập Facebook** trên cùng Chrome profile

### 7.5 Service Worker Lifecycle

- Service Worker tắt sau **30s idle** → contentscript gửi `WAKE_UP` mỗi 10s
- Offscreen.js gửi keepAlive mỗi 20s
- **KHÔNG dùng global variables** (bị reset khi worker reload)
- **KHÔNG đăng ký event listeners qua async** (phải sync ở top-level)

### 7.6 Attachment Types hỗ trợ

| attachmentType | files[] | buildSendParams |
|---|---|---|
| `SEND_TEXT_ONLY` | `[]` | Chỉ text |
| `PHOTO` | `[fbId]` | `image_ids[0]=fbId` |
| `VIDEO` | `[fbId]` | `video_ids[0]=fbId` |
| `FILE` | `[fbId]` | `file_ids[0]=fbId` |
| `STICKER` | `[stickerId]` | `sticker_id=stickerId` |
| `AUDIO` | `[fbId]` | `audio_ids[0]=fbId` |

### 7.7 Error Handling & Retry

Extension có error handler thông minh:
- `restartInbox`: Khởi tạo lại session + retry
- `reuploadPhotos`: Re-upload ảnh qua Facebook
- `reuploadPhotosByApi`: Re-upload qua Pancake API (dùng contentIds + accessToken)
- `retryUsingSocket`: Retry qua MQTT WebSocket
- `cannotRetry`: Thông báo lỗi

Facebook error codes:
| Code | Subcode | Mô tả |
|------|---------|--------|
| `10` | `2018278` | 24h window expired |
| `551` | `1545041` | User unavailable |
| — | `1545012` | Blocked, retry via socket |
| — | `1545006` | Upload blocked |
| — | `3252001` | Rate limited |
| — | `1390008` | Temporary error |

### 7.8 KHÔNG sửa background.js

File `background.js` (589KB) là file gốc từ Pancake, **đã minified**. Chỉ sửa:
- `manifest.json` — thêm domains
- `contentscript.js` — thêm debug logs
- Thêm `note.md` — ghi chú

### 7.9 Không dùng 2 extension cùng lúc

Chrome Web Store Pancake extension (`oehooocookcnclgniepdgaiankfifmmn`) + unpacked extension → conflict. Disable 1 trong 2.

---

## 8. Debug

### Console commands

```javascript
// Kiểm tra extension
window.pancakeExtension
// → { connected: true, lastEvents: [...] }

// Xem conversation data
const id = window.inboxChat?.activeConversationId;
const conv = window.inboxChat?.data?.getConversation(id);
console.log('global_id:', conv?._raw?.page_customer?.global_id);
console.log('psid:', conv?.psid);
console.log('thread_id:', conv?._raw?.thread_id);

// Debug extension (test fb_dtsg)
debugExtension()
debugExtension('PAGE_ID')

// Xem event log
window.pancakeExtension.lastEvents

// Test UPLOAD_INBOX_PHOTO
window.postMessage({
    type: 'UPLOAD_INBOX_PHOTO',
    pageId: '112678138086607',
    photoUrl: 'https://picsum.photos/200',
    name: 'test.jpg', platform: 'facebook',
    taskId: Date.now(), uploadId: 'test1', from: 'WEBPAGE'
}, '*');
```

### Log prefixes

| Prefix | File | Mô tả |
|--------|------|--------|
| `[CS→BG]` | contentscript.js | Page → Background |
| `[BG→CS]` | contentscript.js | Background → Page |
| `[EXT-EVENT]` | inbox-main.js | Extension events |
| `[EXT-SEND]` | inbox-chat.js | Gửi tin nhắn |
| `[EXT-UPLOAD]` | inbox-chat.js | Upload ảnh |

### Service Worker console

Chrome → `chrome://extensions/` → Extension → "Inspect views: service worker":
- `FOUND MessengerThreadlistQuery DOC ID` → OK
- `UPDATE DYNAMIC RULES FOR URL .../messaging/send/` → Đang gửi
- `Time remain send inbox: XXXXX` → Timer
- `FAIL TO GET GLOBAL ID` → GraphQL lookup failed

---

## 9. Platforms hỗ trợ

| Platform | Messaging | Comments | Real-time | Upload |
|----------|-----------|----------|-----------|--------|
| Facebook | REPLY_INBOX_PHOTO | SEND_COMMENT | LISTEN_INBOX + WS | UPLOAD_INBOX_PHOTO |
| Instagram | REPLY_INBOX_PHOTO (IG) | LISTEN_IG_COMMENT | WebSocket | Có |
| LINE | LINE:* events | — | — | — |
| Zalo | REPLY_INBOX_FILE_ZALO_OA | — | LISTEN_WS_ZALO_OA | — |

---

## 10. Tham chiếu code N2Store

| Component | File | Function/Section |
|-----------|------|-----------------|
| Extension bridge | `inbox/js/inbox-main.js` | Lines 204-337 |
| Send via extension | `inbox/js/inbox-chat.js` | `_sendViaExtension()` |
| Upload via extension | `inbox/js/inbox-chat.js` | `_uploadViaExtension()` |
| Global ID cache | `inbox/js/inbox-chat.js` | `_globalIdCache = {}` |
| Fallback trigger | `inbox/js/inbox-chat.js` | `sendMessage()` image block |
| Extension manifest | `pancake-extension/manifest.json` | domains config |
| Content script | `pancake-extension/scripts/contentscript.js` | Message bridge |
| Developer notes | `pancake-extension/note.md` | Event list |
| Main documentation | `PANCAKE-EXTENSION-BYPASS-24H.md` | Full bypass docs |
