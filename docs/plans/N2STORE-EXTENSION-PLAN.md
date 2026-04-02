# N2Store Extension - Development Plan

> Extension riêng của N2Store, thay thế Pancake Extension V2
> Logo: `/index/logo.jpg` (gold N2 crown trên nền đen)

---

## 1. Mục tiêu

Xây dựng Chrome Extension **N2Store Messenger** với các chức năng cốt lõi giống Pancake Extension V2, nhưng:
- **Code sạch, readable** (không minified 589KB)
- **Chỉ giữ features N2Store cần** (loại bỏ LINE, Zalo, POS, ecommerce)
- **Dễ maintain** và mở rộng
- **Không phụ thuộc** vào Pancake (loại bỏ accessToken Pancake JWT)

---

## 2. Scope — Features cần vs bỏ

### Giữ lại (Core)

| Feature | Message Types | Lý do |
|---------|---------------|-------|
| **Gửi tin nhắn bypass 24h** | REPLY_INBOX_PHOTO | Core business |
| **Upload ảnh** | UPLOAD_INBOX_PHOTO | Gửi ảnh bypass 24h |
| **Facebook session** | PREINITIALIZE_PAGES, GET_BUSINESS_CONTEXT | Lấy fb_dtsg |
| **Global ID resolve** | GET_GLOBAL_ID_FOR_CONV | Cần cho globalUserId |
| **Extension health** | WAKE_UP, CHECK_EXTENSION_VERSION, EXTENSION_LOADED | Keep-alive |
| **Gửi comment** | SEND_COMMENT | Trả lời comment |
| **Nhắn riêng** | SEND_PRIVATE_REPLY | Nhắn riêng từ comment |
| **Header modification** | declarativeNetRequest | Sửa Origin/Referer |

### Bỏ (Không cần)

| Feature | Lý do bỏ |
|---------|----------|
| Instagram integration | N2Store chỉ dùng Facebook |
| LINE integration | Không dùng |
| Zalo integration | Không dùng |
| POS sync (Facebook Shop) | Không dùng |
| Ecommerce product | Không dùng |
| Sticker gửi comment | Ít dùng |
| Real-time listeners (LISTEN_INBOX, WS) | N2Store dùng Pancake WebSocket |
| Livestream crawling | Không cần |
| Lead form crawling | Không cần |
| Profile info/link/birthday | Có thể thêm sau |
| Block user | Có thể thêm sau |
| Invite like page | Có thể thêm sau |
| Appointment | Không dùng |
| Routing app | Không dùng |

### Có thể thêm sau (Phase 2+)

| Feature | Message Types |
|---------|---------------|
| React message | REACT_MESSAGE |
| Get profile info | GET_PROFILE_INFO |
| Block user | BLOCK_FACEBOOK_USER |
| Archive conversation | CHANGE_CONV_STATUS_TO_ARCHIVED |
| Download file | DOWNLOAD_FILE |

---

## 3. Kiến trúc N2Store Extension

```
n2store-extension/
├── manifest.json                    # MV3 config
├── images/
│   ├── icon-16.png                  # Resize từ logo.jpg
│   ├── icon-48.png
│   └── icon-128.png
├── rules.json                       # declarativeNetRequest static rules
├── scripts/
│   ├── background.js                # Service Worker (CORE - viết mới)
│   │   ├── facebook-session.js      # fb_dtsg + cookie management
│   │   ├── inbox-sender.js          # REPLY_INBOX_PHOTO handler
│   │   ├── image-uploader.js        # UPLOAD_INBOX_PHOTO handler
│   │   ├── global-id-resolver.js    # GET_GLOBAL_ID_FOR_CONV handler
│   │   ├── comment-sender.js        # SEND_COMMENT handler
│   │   └── utils.js                 # Shared utilities
│   ├── contentscript.js             # Bridge page ↔ service worker
│   └── offscreen.js                 # HTML parsing for fb_dtsg
├── offscreen.html                   # Offscreen document
└── _locales/
    └── en/messages.json             # Extension name/description
```

### Module Architecture

```
                    ┌──────────────────────────────┐
                    │  Service Worker (background)  │
                    │                              │
                    │  ┌─ facebook-session.js       │
contentscript.js ──►│  │  • initPage(pageId)       │──► business.facebook.com
(message bridge)    │  │  • getFbDtsg(pageId)       │    (fb_dtsg, cookies)
                    │  │  • getHeaders()            │
                    │  │                            │
                    │  ├─ inbox-sender.js           │──► business.facebook.com/messaging/send/
                    │  │  • sendInbox(params)       │
                    │  │  • buildSendParams()       │
                    │  │  • handleSendError()       │
                    │  │                            │
                    │  ├─ image-uploader.js         │──► upload-business.facebook.com/
                    │  │  • uploadImage(url, pageId)│    ajax/mercury/upload.php
                    │  │  • getBlob(url)            │
                    │  │                            │
                    │  ├─ global-id-resolver.js     │──► business.facebook.com/api/graphql/
                    │  │  • resolveGlobalId(thread) │    (GraphQL batch query)
                    │  │  • findDocIds(pageId)      │
                    │  │                            │
                    │  └─ comment-sender.js         │──► facebook.com/ajax/ufi/
                    │     • sendComment(params)     │    add_comment.php
                    │     • privateReply(params)    │
                    └──────────────────────────────┘
```

---

## 4. Implementation Plan (Phases)

### Phase 1: Foundation (Core messaging) — ~3-5 ngày

#### 1.1 Manifest & Project Setup
```json
{
    "manifest_version": 3,
    "name": "N2Store Messenger",
    "short_name": "N2Store",
    "version": "1.0.0",
    "description": "N2Store internal messaging tool",
    "icons": { "16": "images/icon-16.png", "48": "images/icon-48.png", "128": "images/icon-128.png" },
    "background": { "service_worker": "scripts/background.js", "type": "module" },
    "content_scripts": [{
        "matches": [
            "https://*.nhijudyshop.workers.dev/*",
            "https://nhijudyshop.workers.dev/*",
            "https://nhijudyshop.github.io/*"
        ],
        "js": ["scripts/contentscript.js"],
        "run_at": "document_end"
    }],
    "permissions": ["cookies", "storage", "offscreen", "declarativeNetRequestWithHostAccess"],
    "host_permissions": [
        "*://business.facebook.com/*",
        "*://www.business.facebook.com/*",
        "*://upload-business.facebook.com/*",
        "*://www.facebook.com/*",
        "*://graph.facebook.com/*",
        "*://p-upload.facebook.com/*"
    ],
    "web_accessible_resources": [{ "matches": ["*://*/*"], "resources": ["offscreen.html"] }]
}
```

#### 1.2 Content Script (contentscript.js) — Message Bridge
- Kết nối `chrome.runtime.connect({ name: "n2store_tab" })`
- Forward message types: REPLY_INBOX_PHOTO, UPLOAD_INBOX_PHOTO, GET_BUSINESS_CONTEXT, GET_GLOBAL_ID_FOR_CONV, PREINITIALIZE_PAGES, CHECK_EXTENSION_VERSION, WAKE_UP
- Gửi `EXTENSION_LOADED` khi inject
- WAKE_UP mỗi 10s

#### 1.3 Facebook Session Manager (facebook-session.js)
- `initPage(pageId)`: fetch `business.facebook.com/latest/inbox/all?page_id={pageId}` → parse HTML → extract fb_dtsg, lsd
- Cache fb_dtsg per pageId (refresh khi expired)
- `buildHeaders()`: tạo headers chuẩn cho Facebook requests
- `buildParams()`: tạo base params (fb_dtsg, lsd, __user, __a, __req, etc.)
- Cookie management: `credentials: 'include'` cho auto-attach

#### 1.4 Inbox Sender (inbox-sender.js)
- Handle `REPLY_INBOX_PHOTO` message
- `buildSendParams()`:
  - `body`, `offline_threading_id`, `source`, `timestamp`, `request_user_id`
  - `specific_to_list[0]`: `fbid:{globalUserId}`
  - `specific_to_list[1]`: `fbid:{pageId}`
  - `other_user_fbid`: globalUserId
  - Attachment handling: `image_ids[]`, `video_ids[]`, `file_ids[]`, `sticker_id`
- POST `business.facebook.com/messaging/send/` với `Content-Type: application/x-www-form-urlencoded`
- Parse response: `parseFbRes()` (Facebook trả "for (;;);{json}")
- Error handling: retry logic (restartInbox, reuploadPhotos)

#### 1.5 DeclarativeNetRequest Rules (rules.json)
```json
[{
    "id": 1, "priority": 1,
    "action": { "type": "modifyHeaders", "requestHeaders": [
        { "header": "Origin", "operation": "set", "value": "https://www.facebook.com" },
        { "header": "Accept", "operation": "set", "value": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
    ]},
    "condition": {
        "requestDomains": ["facebook.com", "business.facebook.com", "upload-business.facebook.com"],
        "resourceTypes": ["xmlhttprequest"]
    }
}]
```

### Phase 2: Image Upload & Global ID — ~2-3 ngày

#### 2.1 Image Uploader (image-uploader.js)
- Handle `UPLOAD_INBOX_PHOTO` message
- `getBlob(url)`: fetch image URL → blob
- `uploadBlob(blob, pageId)`:
  - POST `upload-business.facebook.com/ajax/mercury/upload.php`
  - FormData: append blob as `upload_{random}` field
  - Parse response → extract `fbid`, `previewUri`
- Return `UPLOAD_INBOX_PHOTO_SUCCESS { fbId, previewUri }`

#### 2.2 Global ID Resolver (global-id-resolver.js)
- Handle `GET_GLOBAL_ID_FOR_CONV` message
- Load GraphQL doc_ids từ Business Suite HTML
- Query `PagesManagerInboxAdminAssignerRootQuery` với thread_id
- Extract globalUserId từ response
- Cache results (instant on repeat lookups)
- Return `GET_GLOBAL_ID_FOR_CONV_SUCCESS { globalId }`

#### 2.3 Offscreen Document (offscreen.js)
- Parse Facebook HTML responses
- Extract fb_dtsg từ DTSGInitialData
- Extract GraphQL doc_ids
- Sandbox cho safe function execution

### Phase 3: Comment & Polish — ~1-2 ngày

#### 3.1 Comment Sender (comment-sender.js)
- Handle `SEND_COMMENT`
- Handle `SEND_PRIVATE_REPLY`
- Profile switching cho comment gửi bằng Page

#### 3.2 Integration với N2Store
- Update `inbox-main.js`: thay Pancake extension events bằng N2Store events
- Update `inbox-chat.js`: đảm bảo compatible
- **Giữ API tương thích** với Pancake Extension (cùng message types, cùng payload format)
  → Không cần sửa inbox-chat.js nếu message format giống hệt

#### 3.3 Error Handling & Logging
- Structured logging: `[N2EXT] prefix`
- Error codes mapping
- Retry strategies: restartInbox, reuploadPhotos
- Timeout handling (60s)

---

## 5. Chi tiết kỹ thuật quan trọng

### 5.1 Facebook Response Format

Facebook trả response dạng:
```
for (;;);{"__ar":1,"payload":{"actions":[{"message_id":"mid.$...","timestamp":1234567890}]}}
```

Parser:
```javascript
function parseFbRes(text) {
    const json = text.replace(/^for \(;;\);/, '');
    return JSON.parse(json);
}
```

### 5.2 Offline Threading ID

Facebook yêu cầu unique `offline_threading_id` cho mỗi message:
```javascript
function generateOfflineThreadingID() {
    const now = Date.now();
    const random = Math.floor(Math.random() * 4294967295);
    // Facebook format: high 32 bits of timestamp << 22 | random
    return (BigInt(now) << 22n | BigInt(random & 0x3FFFFF)).toString();
}
```

### 5.3 Service Worker Keep-Alive

```javascript
// contentscript.js sends WAKE_UP every 10s
setInterval(() => {
    try { port.postMessage({ type: 'WAKE_UP' }); }
    catch (e) { clearInterval(timer); }
}, 10000);

// background.js uses chrome.alarms as backup
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
```

### 5.4 fb_dtsg Extraction

```javascript
async function extractFbDtsg(pageId) {
    const url = `https://business.facebook.com/latest/inbox/all?page_id=${pageId}`;
    const response = await fetch(url, { credentials: 'include' });
    const html = await response.text();

    // Method 1: DTSGInitialData
    const match = html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/);
    if (match) return match[1];

    // Method 2: hidden input
    // Gửi HTML tới offscreen document cho DOMParser
    return await parseInOffscreen(html);
}
```

### 5.5 Dynamic Header Rules

```javascript
// Update Origin header dynamically khi gửi tin nhắn
chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [{
        id: 100, priority: 1,
        action: {
            type: 'modifyHeaders',
            requestHeaders: [
                { header: 'Origin', operation: 'set', value: 'https://business.facebook.com' },
                { header: 'Referer', operation: 'set', value: `https://business.facebook.com/latest/inbox/all?page_id=${pageId}` }
            ]
        },
        condition: {
            urlFilter: '||business.facebook.com/messaging/send/',
            resourceTypes: ['xmlhttprequest']
        }
    }],
    removeRuleIds: [100]
});
```

---

## 6. API Compatibility

### Giữ tương thích với inbox-chat.js hiện tại

N2Store Extension phải support **cùng message format** với Pancake Extension để inbox-chat.js không cần sửa:

| Message | Payload format | Response format |
|---------|---------------|-----------------|
| `REPLY_INBOX_PHOTO` | `{ pageId, message, attachmentType, files, globalUserId, platform, threadId, convId, ... }` | `REPLY_INBOX_PHOTO_SUCCESS { taskId, messageId, timestamp }` |
| `UPLOAD_INBOX_PHOTO` | `{ pageId, photoUrl, name, platform, taskId, uploadId }` | `UPLOAD_INBOX_PHOTO_SUCCESS { taskId, uploadId, fbId, previewUri }` |
| `GET_GLOBAL_ID_FOR_CONV` | `{ pageId, threadId, threadKey, isBusiness, ... }` | `GET_GLOBAL_ID_FOR_CONV_SUCCESS { taskId, globalId }` |
| `GET_BUSINESS_CONTEXT` | `{ pageId }` | `GET_BUSINESS_CONTEXT_SUCCESS { dtsg, context }` |
| `CHECK_EXTENSION_VERSION` | `{}` | `EXTENSION_VERSION { version, build }` |

### Migration Path

1. **Phase 1**: Cài N2Store Extension song song Pancake Extension (disable Pancake)
2. **Phase 2**: Test tất cả flows (text, image, global ID, comment)
3. **Phase 3**: Remove Pancake Extension dependency

---

## 7. Logo & Branding

- Source: `/index/logo.jpg` (1080x1080, gold N2 crown trên nền đen)
- Cần resize:
  - `icon-16.png` (16x16) — toolbar
  - `icon-48.png` (48x48) — extension management
  - `icon-128.png` (128x128) — Chrome Web Store / install dialog
- Cần thêm `icon-128-gray.png` (grayscale version cho trạng thái disconnected)

---

## 8. Ước lượng công việc

| Phase | Nội dung | Thời gian |
|-------|----------|-----------|
| 1 | Foundation: manifest, contentscript, FB session, inbox sender, rules | 3-5 ngày |
| 2 | Image upload, Global ID resolver, offscreen | 2-3 ngày |
| 3 | Comment, integration, testing | 1-2 ngày |
| **Total** | | **6-10 ngày** |

### Rủi ro

| Rủi ro | Xác suất | Giải pháp |
|--------|----------|-----------|
| Facebook thay đổi internal API | Trung bình | Monitor + update nhanh |
| fb_dtsg extraction regex thay đổi | Thấp | Multiple extraction methods |
| GraphQL doc_ids thay đổi | Trung bình | Dynamic discovery |
| Chrome MV3 policy thay đổi | Thấp | Follow Chrome release notes |
| Cookie not auto-attached | Thấp | Manual cookie string fallback |

---

## 9. Testing Plan

### Unit Tests
- [ ] `parseFbRes()` parse Facebook response correctly
- [ ] `generateOfflineThreadingID()` returns valid 64-bit ID
- [ ] `extractFbDtsg()` extracts token from HTML
- [ ] `buildSendParams()` builds correct FormData

### Integration Tests
- [ ] PREINITIALIZE_PAGES → fb_dtsg extracted
- [ ] UPLOAD_INBOX_PHOTO → fbId returned
- [ ] REPLY_INBOX_PHOTO (SEND_TEXT_ONLY) → message sent
- [ ] REPLY_INBOX_PHOTO (PHOTO) → image sent
- [ ] GET_GLOBAL_ID_FOR_CONV → globalId resolved
- [ ] SEND_COMMENT → comment posted
- [ ] SEND_PRIVATE_REPLY → private message sent

### E2E Tests
- [ ] Text message bypass 24h (khách nhắn > 24h trước)
- [ ] Image + text bypass 24h
- [ ] Global ID resolution cho khách mới (chưa cache)
- [ ] Service Worker recovery after idle
- [ ] Multiple pages PREINITIALIZE
