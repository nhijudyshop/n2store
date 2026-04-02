# N2Store Messenger - Chrome Extension

> Extension riêng của N2Store, thay thế Pancake Extension V2
> Chrome Manifest V3 | ES Modules | Clean architecture

---

## 1. Tổng quan

N2Store Messenger là Chrome Extension cho phép:

- **Gửi tin nhắn bypass 24h** qua Facebook Business Suite internal API
- **Upload ảnh/video/file** lên Facebook từ URL
- **Resolve Global ID** (thread_id → globalUserId) qua GraphQL
- **Thông báo real-time** từ server (chuyển khoản, đơn hàng, tin nhắn mới)
- **Badge counter** trên icon extension
- **Popup dashboard** với thống kê + hành động nhanh

### Tại sao cần Extension?

| Kênh gửi | Giới hạn 24h? | Endpoint |
|----------|---------------|----------|
| Facebook Graph API | **CÓ** | `graph.facebook.com` |
| Pancake API | **CÓ** (dùng Graph API) | `pages.fm/api/public_api/v1` |
| Business Suite Web (extension) | **KHÔNG** | `business.facebook.com/messaging/send/` |

Extension mô phỏng cách Facebook Business Suite gửi tin nhắn — Facebook coi đây là "human-operated interface" nên không áp dụng 24h rule.

---

## 2. Cài đặt

1. Mở Chrome → `chrome://extensions/`
2. Bật **Developer mode** (góc trên phải)
3. Click **"Load unpacked"** → chọn folder `n2store-extension/`
4. Extension icon (logo N2Store) xuất hiện trên toolbar
5. **TẮT** Pancake Extension nếu đang dùng (không dùng 2 cái cùng lúc)

### Yêu cầu

- Chrome 110+ (Manifest V3)
- Đã đăng nhập Facebook trên cùng Chrome profile
- Đã đăng nhập N2Store web app

---

## 3. Kiến trúc

```
n2store-extension/
├── manifest.json                     # MV3 config, permissions, rules
├── rules.json                        # DeclarativeNetRequest (Origin/Accept headers)
├── images/                           # Icon 16/32/48/128px (từ logo.jpg)
│
├── background/                       # Service Worker (ES Modules)
│   ├── service-worker.js            # Entry point — message router
│   ├── facebook/
│   │   ├── session.js               # fb_dtsg extraction, page init
│   │   ├── sender.js                # REPLY_INBOX_PHOTO, buildSendParams
│   │   ├── uploader.js              # UPLOAD_INBOX_PHOTO
│   │   ├── global-id.js             # GET_GLOBAL_ID_FOR_CONV (3 strategies)
│   │   └── utils.js                 # parseFbRes, generateOfflineThreadingID
│   ├── server/
│   │   ├── notifications.js         # chrome.notifications dispatcher (14 loại)
│   │   └── sse-listener.js          # SSE real-time từ Render server
│   └── sync/
│       ├── storage.js               # Activity log, badge, preferences
│       └── badge.js                 # Badge counter re-export
│
├── content/
│   └── contentscript.js             # Bridge: page ↔ service worker
│
├── popup/
│   ├── popup.html                   # Popup UI (3 tabs)
│   ├── popup.js                     # Popup logic
│   └── popup.css                    # Popup styles
│
├── pages/
│   ├── offscreen.html + .js         # HTML parsing, keep-alive
│   ├── settings.html + .js          # Trang cài đặt
│
└── shared/
    ├── constants.js                 # Message types, error codes
    ├── config.js                    # URLs, timeouts, feature flags
    └── logger.js                    # [N2EXT] structured logging
```

### Luồng dữ liệu

```
Trang web (nhijudyshop)
  │ window.postMessage({ type: 'REPLY_INBOX_PHOTO', ... })
  ▼
contentscript.js (inject vào trang)
  │ chrome.runtime.connect (port)
  ▼
service-worker.js (background)
  │ Route tới handler tương ứng
  ├── facebook/sender.js ──► POST business.facebook.com/messaging/send/
  ├── facebook/uploader.js ──► POST upload-business.facebook.com/upload.php
  ├── facebook/global-id.js ──► POST business.facebook.com/api/graphql/
  ├── server/sse-listener.js ◄── SSE n2store-fallback.onrender.com/api/realtime/sse
  └── server/notifications.js ──► chrome.notifications.create()
  │
  ▼ (response)
contentscript.js → window.postMessage → trang web
```

---

## 4. Tính năng

### 4.1 Facebook Messaging (Core)

| Tính năng | Message Type | Trạng thái |
|-----------|-------------|------------|
| Gửi text bypass 24h | `REPLY_INBOX_PHOTO` (SEND_TEXT_ONLY) | Done |
| Gửi ảnh bypass 24h | `UPLOAD_INBOX_PHOTO` → `REPLY_INBOX_PHOTO` (PHOTO) | Done |
| Gửi video/file/sticker | `REPLY_INBOX_PHOTO` (VIDEO/FILE/STICKER/AUDIO) | Done |
| Lấy fb_dtsg | `PREINITIALIZE_PAGES`, `GET_BUSINESS_CONTEXT` | Done |
| Resolve Global ID | `GET_GLOBAL_ID_FOR_CONV` | Done |
| Keep-alive | `WAKE_UP` (10s) + chrome.alarms (30s) | Done |
| Header modification | DeclarativeNetRequest (Origin, Referer) | Done |
| Gửi comment | `SEND_COMMENT`, `EDIT_COMMENT` | Stub (Phase 2) |
| Nhắn riêng | `SEND_PRIVATE_REPLY` | Stub (Phase 2) |
| React message | `REACT_MESSAGE` | Stub (Phase 2) |
| Block user | `BLOCK_FACEBOOK_USER` | Stub (Phase 2) |

### 4.2 Thông báo (Notifications)

| Loại thông báo | Khi nào | Click mở |
|----------------|---------|----------|
| Tin nhắn đã gửi | Gửi thành công qua extension | Inbox |
| Gửi tin thất bại | Lỗi khi gửi | Inbox |
| Upload ảnh thành công | Upload xong | Inbox |
| Upload ảnh thất bại | Lỗi upload | Inbox |
| Xác định khách hàng | Global ID resolved | Inbox |
| KH không xác định | Global ID failed | Inbox |
| FB đã kết nối | fb_dtsg extracted | — |
| FB mất kết nối | Session failed | — |
| Chuyển khoản mới | SSE: SePay transaction | Đơn hàng |
| Cập nhật ví | SSE: wallet update | Đơn hàng |
| Sản phẩm bị hold | SSE: held product | Đơn hàng |
| Tin nhắn mới | SSE: new message | Inbox |
| Cập nhật xử lý đơn | SSE: processing update | Đơn hàng |

### 4.3 Popup UI

3 tabs:

- **Tổng quan**: Dashboard (FB Pages, Đã gửi, Thất bại, Chưa đọc) + Quick Actions (Mở Inbox, Đơn hàng, Làm mới) + SSE toggle
- **Thông báo**: Notification center với unread indicators, type badges (GỬI/LỖI/BANK/HOLD/...), time-ago
- **Hoạt động**: Activity log các sự kiện gần đây

### 4.4 Trang cài đặt (Settings)

Mở từ popup (icon gear) hoặc `chrome://extensions` → Options:

- Trạng thái kết nối (Extension, Facebook, SSE, Tabs)
- Bật/tắt thông báo toàn cục
- Bật/tắt âm thanh
- Bật/tắt SSE real-time
- Toggle từng loại thông báo (10 loại)
- Test notification
- Xóa dữ liệu (activity + notifications)

---

## 5. API Compatibility

### 100% tương thích với Pancake Extension

Extension giữ **đúng format message** của Pancake Extension:
- Cùng message type names (`REPLY_INBOX_PHOTO`, etc.)
- Cùng payload fields (`pageId`, `message`, `attachmentType`, `files`, `globalUserId`, etc.)
- Cùng response format (`*_SUCCESS`, `*_FAILURE`)

→ `inbox-main.js` và `inbox-chat.js` **KHÔNG cần sửa** khi switch extension.

### Message format tham khảo

**Gửi text:**
```javascript
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    pageId: '112678138086607',
    message: 'Xin chào!',
    attachmentType: 'SEND_TEXT_ONLY',
    files: [],
    globalUserId: '100001957832900',
    platform: 'facebook',
    threadId: '26140045085657251',
    convId: 't_26140045085657251',
    isBusiness: false,
    taskId: Date.now(),
    from: 'WEBPAGE'
}, '*');
```

**Upload ảnh:**
```javascript
window.postMessage({
    type: 'UPLOAD_INBOX_PHOTO',
    pageId: '112678138086607',
    photoUrl: 'https://content.pancake.vn/xxx/image.jpg',
    name: 'image.jpg',
    platform: 'facebook',
    taskId: Date.now(),
    uploadId: 'upload_' + Date.now(),
    from: 'WEBPAGE'
}, '*');
// → UPLOAD_INBOX_PHOTO_SUCCESS { fbId: "123456789" }

// Gửi ảnh với fbId:
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    attachmentType: 'PHOTO',
    files: ['123456789'],
    message: '',
    // ... các field khác giống text
}, '*');
```

**Resolve Global ID:**
```javascript
window.postMessage({
    type: 'GET_GLOBAL_ID_FOR_CONV',
    pageId: '112678138086607',
    threadId: '34116166741365151',   // thread_id (KHÔNG phải PSID)
    threadKey: 't_34116166741365151',
    isBusiness: true,
    taskId: Date.now(),
    from: 'WEBPAGE'
}, '*');
// → GET_GLOBAL_ID_FOR_CONV_SUCCESS { globalId: "100002968457940" }
```

---

## 6. Cấu hình

### Endpoints (shared/config.js)

| Config | Giá trị | Mô tả |
|--------|---------|-------|
| `RENDER_SSE_URL` | `https://n2store-fallback.onrender.com` | SSE real-time server |
| `RENDER_API_URL` | `https://n2store-fallback.onrender.com` | Render API |
| `CF_WORKER_URL` | `https://chatomni-proxy.nhijudyshop.workers.dev` | Cloudflare Worker proxy |
| `WEB_BASE_URL` | `https://nhijudyshop.workers.dev` | N2Store web app (CF Worker) |
| `WEB_GITHUB_URL` | `https://nhijudyshop.github.io/n2store/orders-report/main.html` | N2Store web app (GitHub Pages) |

### Web App Links

Extension hỗ trợ 2 domains cho web app:

- **CF Worker**: `https://nhijudyshop.workers.dev` — primary
- **GitHub Pages**: `https://nhijudyshop.github.io/n2store/orders-report/main.html` — backup/alternative

### Permissions

| Permission | Mục đích |
|------------|----------|
| `cookies` | Đọc Facebook session cookies (c_user, xs) |
| `storage` | chrome.storage cho cache, preferences, activity |
| `offscreen` | Offscreen document (DOM parsing, keep-alive) |
| `declarativeNetRequestWithHostAccess` | Sửa headers (Origin, Referer) |
| `notifications` | Chrome notifications |
| `alarms` | Keep-alive backup timer |

### Content Script Domains

Extension inject vào:
- `nhijudyshop.workers.dev`
- `nhijudyshop.github.io`

### Host Permissions

- `business.facebook.com` — Messaging, GraphQL
- `upload-business.facebook.com` — Upload photos
- `www.facebook.com` — Comments, profile
- `graph.facebook.com` — Graph API fallback
- `p-upload.facebook.com` — Upload fallback

---

## 7. Lưu ý quan trọng

### 7.1 isBusiness: false

Trường `isBusiness` trong REPLY_INBOX_PHOTO **PHẢI là `false`**. Đây là cách pancake.vn gửi. Nếu `true`, extension xử lý flow khác và có thể fail.

### 7.2 PSID ≠ thread_id ≠ globalUserId

| ID | Ví dụ | Dùng cho |
|----|-------|----------|
| PSID | `26140045085657251` | `REPLY_INBOX_PHOTO.threadId` (OK) |
| thread_id | `34116166741365151` | `GET_GLOBAL_ID_FOR_CONV` (BẮT BUỘC) |
| globalUserId | `100001957832900` | `REPLY_INBOX_PHOTO.globalUserId` (BẮT BUỘC) |

### 7.3 fb_dtsg

- CSRF token của Facebook, **chỉ lấy được từ HTML** (không qua API)
- Extension tự quản lý qua `PREINITIALIZE_PAGES` và `GET_BUSINESS_CONTEXT`
- Cần user **đã đăng nhập Facebook** trên cùng Chrome profile
- 3 phương pháp extract: DTSGInitialData regex → hidden input → async_get_token

### 7.4 Service Worker Lifecycle

- Service Worker tắt sau **30s idle** → contentscript gửi `WAKE_UP` mỗi 10s
- chrome.alarms gửi keepAlive mỗi 30s (backup)
- Offscreen.js gửi keepAlive mỗi 20s
- Dùng ES Modules (`type: "module"` trong manifest)

### 7.5 Global ID Cache

- Cache trong `chrome.storage.local` (persist across restart)
- TTL: 24h
- Lần đầu resolve: ~30-40s (GraphQL query nặng)
- Lần sau: instant (từ cache)
- 3 strategies: ThreadlistQuery → thread_info.php → GraphQL friendly_name

### 7.6 SSE Reconnect

- Auto-reconnect khi mất kết nối
- Exponential backoff: 1s → 2s → 4s → 8s → ... → 60s max
- Subscribe keys: `wallet`, `held_products`, `new_messages`, `processing_tags`

---

## 8. Debug

### Console commands (trên trang nhijudyshop)

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
```

### Service Worker console

Chrome → `chrome://extensions/` → N2Store Messenger → "Inspect views: service worker":

```
[N2EXT][SW] N2Store Extension v1.0.0 (build 1) starting...
[N2EXT][SW] All subsystems initialized
[N2EXT][FB-Session] Session initialized for page 112678138086607, fb_dtsg: AQ...
[N2EXT][SSE] SSE connected: {"connectionId":"..."}
[N2EXT][FB-Sender] Message sent successfully: mid.$...
[N2EXT][Notif] Notification shown: [msg_sent] Khách hàng: Xin chào!
```

### Log prefixes

| Prefix | Module | File |
|--------|--------|------|
| `[N2EXT][SW]` | Service Worker | service-worker.js |
| `[N2EXT][FB-Session]` | Facebook Session | facebook/session.js |
| `[N2EXT][FB-Sender]` | Message Sender | facebook/sender.js |
| `[N2EXT][FB-Uploader]` | Image Uploader | facebook/uploader.js |
| `[N2EXT][FB-GlobalID]` | Global ID Resolver | facebook/global-id.js |
| `[N2EXT][SSE]` | SSE Listener | server/sse-listener.js |
| `[N2EXT][Notif]` | Notifications | server/notifications.js |
| `[N2EXT][Storage]` | Storage/Badge | sync/storage.js |
| `[CS→BG]` | Content Script → BG | content/contentscript.js |
| `[BG→CS]` | BG → Content Script | content/contentscript.js |

---

## 9. So sánh với Pancake Extension

| | Pancake Extension | N2Store Extension |
|-|-------------------|-------------------|
| **Code** | 589KB minified, 1 file | ~2,500 dòng, 26 files ES Modules |
| **Đọc được** | Không (obfuscated) | Có (clean code) |
| **Sửa được** | Không | Có |
| **Platforms** | FB + IG + LINE + Zalo | FB only (N2Store chỉ cần) |
| **Thông báo** | Không | 14 loại + SSE real-time |
| **Popup** | Không | Dashboard + Notification center |
| **Cài đặt** | Không | Full settings page |
| **Badge** | Không | Unread counter |
| **SSE** | Không | Kết nối Render server |
| **API compatible** | — | 100% (inbox-chat.js không cần sửa) |

---

## 10. Roadmap

### Done (Phase 1)
- [x] Facebook session manager (fb_dtsg)
- [x] Inbox sender (REPLY_INBOX_PHOTO)
- [x] Image uploader (UPLOAD_INBOX_PHOTO)
- [x] Global ID resolver (3 strategies)
- [x] Content script bridge
- [x] DeclarativeNetRequest rules
- [x] Hệ thống thông báo (14 loại)
- [x] SSE real-time listener
- [x] Popup UI (3 tabs)
- [x] Trang cài đặt
- [x] Badge counter
- [x] Activity log

### Phase 2 (Planned)
- [ ] SEND_COMMENT, EDIT_COMMENT, REMOVE_COMMENT
- [ ] SEND_PRIVATE_REPLY
- [ ] REACT_MESSAGE
- [ ] BLOCK_FACEBOOK_USER
- [ ] CHANGE_CONV_STATUS_TO_ARCHIVED
- [ ] GET_PROFILE_INFO, GET_PROFILE_LINK
- [ ] DOWNLOAD_FILE, LOAD_FACEBOOK_MESSAGES

### Phase 3 (Future)
- [ ] Quick reply templates từ popup
- [ ] Tìm kiếm sản phẩm từ popup
- [ ] Thông báo tổng hợp KPI hàng tuần
- [ ] Cross-tab sync via SharedWorker
