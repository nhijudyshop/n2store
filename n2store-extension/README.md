# N2Store Messenger - Chrome Extension

> Extension rieng cua N2Store, thay the Pancake Extension V2
> Chrome Manifest V3 | ES Modules | Clean architecture

---

## 1. Tong quan

N2Store Messenger la Chrome Extension cho phep:

- **Gui tin nhan bypass 24h** qua Facebook Business Suite internal API
- **Upload anh/video/file** len Facebook tu URL
- **Resolve Global ID** (thread_id → globalUserId) qua GraphQL
- **Thong bao real-time** tu server (chuyen khoan, don hang, tin nhan moi)
- **Badge counter** tren icon extension
- **Popup dashboard** voi thong ke + hanh dong nhanh

### Tai sao can Extension?

| Kenh gui | Gioi han 24h? | Endpoint |
|----------|---------------|----------|
| Facebook Graph API | **CO** | `graph.facebook.com` |
| Pancake API | **CO** (dung Graph API) | `pages.fm/api/public_api/v1` |
| Business Suite Web (extension) | **KHONG** | `business.facebook.com/messaging/send/` |

Extension mo phong cach Facebook Business Suite gui tin nhan — Facebook coi day la "human-operated interface" nen khong ap dung 24h rule.

---

## 2. Cai dat

1. Mo Chrome → `chrome://extensions/`
2. Bat **Developer mode** (goc tren phai)
3. Click **"Load unpacked"** → chon folder `n2store-extension/`
4. Extension icon (logo N2Store) xuat hien tren toolbar
5. **TAT** Pancake Extension neu dang dung (khong dung 2 cai cung luc)

### Yeu cau

- Chrome 110+ (Manifest V3)
- Da dang nhap Facebook tren cung Chrome profile
- Da dang nhap N2Store web app

---

## 3. Kien truc

```
n2store-extension/
├── manifest.json                     # MV3 config, permissions, rules
├── rules.json                        # DeclarativeNetRequest (Origin/Accept headers)
├── images/                           # Icon 16/32/48/128px (tu logo.jpg)
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
│   │   ├── notifications.js         # chrome.notifications dispatcher (14 types)
│   │   └── sse-listener.js          # SSE real-time tu Render server
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
│   ├── settings.html + .js          # Settings page
│
└── shared/
    ├── constants.js                 # Message types, error codes
    ├── config.js                    # URLs, timeouts, feature flags
    └── logger.js                    # [N2EXT] structured logging
```

### Luong du lieu

```
Trang web (nhijudyshop)
  │ window.postMessage({ type: 'REPLY_INBOX_PHOTO', ... })
  ▼
contentscript.js (inject vao trang)
  │ chrome.runtime.connect (port)
  ▼
service-worker.js (background)
  │ Route toi handler tuong ung
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

## 4. Tinh nang

### 4.1 Facebook Messaging (Core)

| Tinh nang | Message Type | Trang thai |
|-----------|-------------|------------|
| Gui text bypass 24h | `REPLY_INBOX_PHOTO` (SEND_TEXT_ONLY) | Done |
| Gui anh bypass 24h | `UPLOAD_INBOX_PHOTO` → `REPLY_INBOX_PHOTO` (PHOTO) | Done |
| Gui video/file/sticker | `REPLY_INBOX_PHOTO` (VIDEO/FILE/STICKER/AUDIO) | Done |
| Lay fb_dtsg | `PREINITIALIZE_PAGES`, `GET_BUSINESS_CONTEXT` | Done |
| Resolve Global ID | `GET_GLOBAL_ID_FOR_CONV` | Done |
| Keep-alive | `WAKE_UP` (10s) + chrome.alarms (30s) | Done |
| Header modification | DeclarativeNetRequest (Origin, Referer) | Done |
| Gui comment | `SEND_COMMENT`, `EDIT_COMMENT` | Stub (Phase 2) |
| Nhan rieng | `SEND_PRIVATE_REPLY` | Stub (Phase 2) |
| React message | `REACT_MESSAGE` | Stub (Phase 2) |
| Block user | `BLOCK_FACEBOOK_USER` | Stub (Phase 2) |

### 4.2 Thong bao (Notifications)

| Loai thong bao | Khi nao | Click mo |
|----------------|---------|----------|
| Tin nhan da gui | Gui thanh cong qua extension | Inbox |
| Gui tin that bai | Loi khi gui | Inbox |
| Upload anh thanh cong | Upload xong | Inbox |
| Upload anh that bai | Loi upload | Inbox |
| Xac dinh khach hang | Global ID resolved | Inbox |
| KH khong xac dinh | Global ID failed | Inbox |
| FB da ket noi | fb_dtsg extracted | — |
| FB mat ket noi | Session failed | — |
| Chuyen khoan moi | SSE: SePay transaction | Don hang |
| Cap nhat vi | SSE: wallet update | Don hang |
| San pham bi hold | SSE: held product | Don hang |
| Tin nhan moi | SSE: new message | Inbox |
| Cap nhat xu ly don | SSE: processing update | Don hang |

### 4.3 Popup UI

3 tabs:

- **Tong quan**: Dashboard (FB Pages, Da gui, That bai, Chua doc) + Quick Actions (Mo Inbox, Don hang, Lam moi) + SSE toggle
- **Thong bao**: Notification center voi unread indicators, type badges (GUI/LOI/BANK/HOLD/...), time-ago
- **Hoat dong**: Activity log cac su kien gan day

### 4.4 Settings Page

Mo tu popup (icon gear) hoac `chrome://extensions` → Options:

- Trang thai ket noi (Extension, Facebook, SSE, Tabs)
- Bat/tat thong bao toan cuc
- Bat/tat am thanh
- Bat/tat SSE real-time
- Toggle tung loai thong bao (10 loai)
- Test notification
- Xoa du lieu (activity + notifications)

---

## 5. API Compatibility

### 100% tuong thich voi Pancake Extension

Extension giu **dung format message** cua Pancake Extension:
- Cung message type names (`REPLY_INBOX_PHOTO`, etc.)
- Cung payload fields (`pageId`, `message`, `attachmentType`, `files`, `globalUserId`, etc.)
- Cung response format (`*_SUCCESS`, `*_FAILURE`)

→ `inbox-main.js` va `inbox-chat.js` **KHONG can sua** khi switch extension.

### Message format tham khao

**Gui text:**
```javascript
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    pageId: '112678138086607',
    message: 'Xin chao!',
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

**Upload anh:**
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

// Gui anh voi fbId:
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    attachmentType: 'PHOTO',
    files: ['123456789'],
    message: '',
    // ... cac field khac giong text
}, '*');
```

**Resolve Global ID:**
```javascript
window.postMessage({
    type: 'GET_GLOBAL_ID_FOR_CONV',
    pageId: '112678138086607',
    threadId: '34116166741365151',   // thread_id (KHONG phai PSID)
    threadKey: 't_34116166741365151',
    isBusiness: true,
    taskId: Date.now(),
    from: 'WEBPAGE'
}, '*');
// → GET_GLOBAL_ID_FOR_CONV_SUCCESS { globalId: "100002968457940" }
```

---

## 6. Cau hinh

### Endpoints (shared/config.js)

| Config | Gia tri | Mo ta |
|--------|---------|-------|
| `RENDER_SSE_URL` | `https://n2store-fallback.onrender.com` | SSE real-time server |
| `RENDER_API_URL` | `https://n2store-fallback.onrender.com` | Render API |
| `CF_WORKER_URL` | `https://chatomni-proxy.nhijudyshop.workers.dev` | Cloudflare Worker proxy |
| `WEB_BASE_URL` | `https://nhijudyshop.workers.dev` | N2Store web app |

### Permissions

| Permission | Muc dich |
|------------|----------|
| `cookies` | Doc Facebook session cookies (c_user, xs) |
| `storage` | chrome.storage cho cache, preferences, activity |
| `offscreen` | Offscreen document (DOM parsing, keep-alive) |
| `declarativeNetRequestWithHostAccess` | Sua headers (Origin, Referer) |
| `notifications` | Chrome notifications |
| `alarms` | Keep-alive backup timer |

### Content Script Domains

Extension inject vao:
- `nhijudyshop.workers.dev`
- `nhijudyshop.github.io`

### Host Permissions

- `business.facebook.com` — Messaging, GraphQL
- `upload-business.facebook.com` — Upload photos
- `www.facebook.com` — Comments, profile
- `graph.facebook.com` — Graph API fallback
- `p-upload.facebook.com` — Upload fallback

---

## 7. Luu y quan trong

### 7.1 isBusiness: false

Truong `isBusiness` trong REPLY_INBOX_PHOTO **PHAI la `false`**. Day la cach pancake.vn gui. Neu `true`, extension xu ly flow khac va co the fail.

### 7.2 PSID ≠ thread_id ≠ globalUserId

| ID | Vi du | Dung cho |
|----|-------|----------|
| PSID | `26140045085657251` | `REPLY_INBOX_PHOTO.threadId` (OK) |
| thread_id | `34116166741365151` | `GET_GLOBAL_ID_FOR_CONV` (BAT BUOC) |
| globalUserId | `100001957832900` | `REPLY_INBOX_PHOTO.globalUserId` (BAT BUOC) |

### 7.3 fb_dtsg

- CSRF token cua Facebook, **chi lay duoc tu HTML** (khong qua API)
- Extension tu quan ly qua `PREINITIALIZE_PAGES` va `GET_BUSINESS_CONTEXT`
- Can user **da dang nhap Facebook** tren cung Chrome profile
- 3 phuong phap extract: DTSGInitialData regex → hidden input → async_get_token

### 7.4 Service Worker Lifecycle

- Service Worker tat sau **30s idle** → contentscript gui `WAKE_UP` moi 10s
- chrome.alarms gui keepAlive moi 30s (backup)
- Offscreen.js gui keepAlive moi 20s
- Dung ES Modules (`type: "module"` trong manifest)

### 7.5 Global ID Cache

- Cache trong `chrome.storage.local` (persist across restart)
- TTL: 24h
- Lan dau resolve: ~30-40s (GraphQL query nang)
- Lan sau: instant (tu cache)
- 3 strategies: ThreadlistQuery → thread_info.php → GraphQL friendly_name

### 7.6 SSE Reconnect

- Auto-reconnect khi mat ket noi
- Exponential backoff: 1s → 2s → 4s → 8s → ... → 60s max
- Subscribe keys: `wallet`, `held_products`, `new_messages`, `processing_tags`

---

## 8. Debug

### Console commands (tren trang nhijudyshop)

```javascript
// Kiem tra extension
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
[N2EXT][Notif] Notification shown: [msg_sent] Khach hang: Xin chao!
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

## 9. So sanh voi Pancake Extension

| | Pancake Extension | N2Store Extension |
|-|-------------------|-------------------|
| **Code** | 589KB minified, 1 file | ~2,500 lines, 26 files ES Modules |
| **Doc duoc** | Khong (obfuscated) | Co (clean code) |
| **Sua duoc** | Khong | Co |
| **Platforms** | FB + IG + LINE + Zalo | FB only (N2Store chi can) |
| **Notifications** | Khong | 14 loai + SSE real-time |
| **Popup** | Khong | Dashboard + Notification center |
| **Settings** | Khong | Full settings page |
| **Badge** | Khong | Unread counter |
| **SSE** | Khong | Connect Render server |
| **API compatible** | — | 100% (inbox-chat.js khong can sua) |

---

## 10. Roadmap

### Done (Phase 1)
- [x] Facebook session manager (fb_dtsg)
- [x] Inbox sender (REPLY_INBOX_PHOTO)
- [x] Image uploader (UPLOAD_INBOX_PHOTO)
- [x] Global ID resolver (3 strategies)
- [x] Content script bridge
- [x] DeclarativeNetRequest rules
- [x] Notification system (14 types)
- [x] SSE real-time listener
- [x] Popup UI (3 tabs)
- [x] Settings page
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
- [ ] Quick reply templates tu popup
- [ ] Product search tu popup
- [ ] KPI weekly summary notification
- [ ] Cross-tab sync via SharedWorker
