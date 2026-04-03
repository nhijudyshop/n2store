# N2Store Messenger - Chrome Extension

> Extension riêng của N2Store, thay thế Pancake Extension V2
> Chrome Manifest V3 | ES Modules | Clean architecture

---

## 1. Tổng quan

N2Store Messenger là Chrome Extension cho phép:

- **Gửi tin nhắn bypass 24h** qua Facebook Business Suite internal API
- **Upload ảnh/video/file** lên Facebook từ URL
- **Resolve Global ID** (thread_id/customerName → globalUserId) qua GraphQL (5 strategies)
- **Gửi comment & private reply** qua Facebook internal API
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
│   │   ├── global-id.js             # GET_GLOBAL_ID_FOR_CONV (5 strategies)
│   │   ├── commenter.js             # SEND_COMMENT, SEND_PRIVATE_REPLY
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
  ├── facebook/commenter.js ──► POST facebook.com/ajax/ufi/add_comment.php
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
| Resolve Global ID | `GET_GLOBAL_ID_FOR_CONV` (5 strategies) | Done |
| Gửi comment | `SEND_COMMENT` | Done |
| Nhắn riêng | `SEND_PRIVATE_REPLY` | Done |
| Keep-alive | `WAKE_UP` (10s) + chrome.alarms (30s) | Done |
| Header modification | DeclarativeNetRequest (Origin, Referer) | Done |
| React message | `REACT_MESSAGE` | Stub |
| Block user | `BLOCK_FACEBOOK_USER` | Stub |

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
- Bật/tắt thông báo toàn cục, âm thanh, SSE real-time
- Toggle từng loại thông báo (10 loại)
- Test notification, xóa dữ liệu

---

## 5. API & Message Format

### 100% tương thích với Pancake Extension

Extension giữ **đúng format message** của Pancake Extension:
- Cùng message type names (`REPLY_INBOX_PHOTO`, etc.)
- Cùng payload fields (`pageId`, `message`, `attachmentType`, `files`, `globalUserId`, etc.)
- Cùng response format (`*_SUCCESS`, `*_FAILURE`)

→ `inbox-main.js` và `inbox-chat.js` **KHÔNG cần sửa** khi switch extension.

### Gửi text

```javascript
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    pageId: '112678138086607',
    message: 'Xin chào!',
    attachmentType: 'SEND_TEXT_ONLY',
    files: [],
    globalUserId: '100001957832900',
    platform: 'facebook',
    threadId: '26140045085657251',      // PSID
    convId: 't_26140045085657251',
    isBusiness: false,                   // PHẢI là false
    taskId: Date.now(),
    from: 'WEBPAGE'
}, '*');
```

### Upload + gửi ảnh

```javascript
// Step 1: Upload
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

// Step 2: Send with fbId
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    attachmentType: 'PHOTO',
    files: ['123456789'],
    message: '',
    // ... các field khác giống text
}, '*');
```

### Resolve Global ID

```javascript
window.postMessage({
    type: 'GET_GLOBAL_ID_FOR_CONV',
    pageId: '112678138086607',
    threadId: '34116166741365151',       // thread_id (KHÔNG phải PSID), có thể null
    threadKey: 't_34116166741365151',    // có thể null
    customerName: 'Tran Thi My Hang',   // fallback khi không có threadId
    conversationUpdatedTime: 1775116751548,
    isBusiness: true,
    taskId: Date.now(),
    from: 'WEBPAGE'
}, '*');
// → GET_GLOBAL_ID_FOR_CONV_SUCCESS { globalId: "100002968457940" }
```

---

## 6. Chi tiết kỹ thuật (Reverse-engineered từ Pancake Extension)

> Nguồn: Pancake Extension v0.5.43, ID: `oehooocookcnclgniepdgaiankfifmmn`
> File: `scripts/background.js` (596KB minified)

### 6.1 Request format — Gửi tin nhắn

```
POST https://business.facebook.com/messaging/send/
Content-Type: application/x-www-form-urlencoded
X-MSGR-Region: HIL
```

**Body (URL-encoded):**

```
body=Xin chào
offline_threading_id=7445379291487933320
source=source:page_unified_inbox
timestamp=1775116751548
request_user_id=270136663390370              ← Page ID

__user=100091492933314                        ← Admin User ID (= c_user cookie)
__a=1
__req=1g                                      ← Auto-increment base36
__csr=                                        ← Empty string
__beoa=0
__pc=BP:bizweb_pkg                           ← pkg_cohort từ SiteData
dpr=2                                         ← Device pixel ratio
__ccg=EXCELLENT
__rev=1036512893                              ← client_revision
__hsi=7624068381287034275
__hs=20545.BP:bizweb_pkg.2.0...0             ← haste_session
__comet_req=0
__spin_r=1036512893
__spin_b=trunk
__spin_t=1775116748
__s=3pyq6w:mpjeak:4r63y7                    ← Web session ID

fb_dtsg=NAfvSMN4glMq0Y9pRdjIbldBGNdLjMLdu...
jazoest=25602
lsd=X3seAScPqGyQsnNLcYGx1b
__usid=null

specific_to_list[0]=fbid:100069170327874     ← Global User ID
specific_to_list[1]=fbid:270136663390370     ← Page ID
other_user_fbid=100069170327874              ← Global User ID
message_id=7445379291487933320               ← = offline_threading_id
client=mercury
action_type=ma-type:user-generated-message
ephemeral_ttl_mode=0
has_attachment=undefined
```

### 6.2 Base Params (`buildParams`)

```javascript
buildParams(ctx) {
    return {
        __user: ctx.userID,                     // Admin's Facebook User ID (c_user cookie)
        __a: 1,
        __req: (request_count++).toString(36),  // Auto-increment base36
        __csr: "",
        __beoa: SiteData.be_one_ahead ? 1 : 0,
        __pc: SiteData.pkg_cohort,              // "BP:bizweb_pkg"
        dpr: SiteData.pr,                       // Device pixel ratio
        __ccg: "EXCELLENT",
        __rev: SiteData.client_revision,
        __hsi: SiteData.hsi,
        __hs: SiteData.haste_session,
        __comet_req: SiteData.is_comet ? 1 : 0,
        __spin_r: SiteData.__spin_r,
        __spin_b: SiteData.__spin_b,
        __spin_t: SiteData.__spin_t,
        __s: webSession.getId(),                // Random 3-segment session ID
        fb_dtsg: ctx.dtsg,
        jazoest: "2" + sumCharCodes(ctx.dtsg),  // "2" + sum of char codes
        lsd: ctx.lsd,
        __usid: null,
    };
}
```

### 6.3 Jazoest & Offline Threading ID

```javascript
// Jazoest: "2" + sum of all char codes in fb_dtsg
calcJazoest(dtsg) {
    let sum = 0;
    for (let i = 0; i < dtsg.length; i++) sum += dtsg.charCodeAt(i);
    return "2" + sum;  // e.g., "25602"
}

// Offline Threading ID: timestamp in binary + 22 random bits
generateOfflineThreadingID() {
    const binary = toBinary(Date.now());
    const random22 = Math.floor(Math.random() * 4194303).toString(2).padStart(22, '0');
    return toDecimal(binary + random22);
}
// Equivalent: (BigInt(Date.now()) << 22n | BigInt(random)).toString()
```

### 6.4 Upload ảnh

```
POST https://upload-business.facebook.com/ajax/mercury/upload.php
Content-Type: multipart/form-data

fb_dtsg={token}
__user={adminUserId}
... (base params)

upload_{random8chars}=<blob>        ← File blob
farr=upload_{random8chars}          ← Field name reference
upload_id=upload_{timestamp}
```

Response:
```json
{ "payload": { "metadata": [{ "fbid": "12345678", "preview_uri": "https://..." }] } }
```

### 6.5 Response format

```
for (;;);{"__ar":1,"payload":{"actions":[{"message_id":"mid.$xxx","timestamp":1775116752}]}}
```

Parse: loại bỏ prefix `for (;;);` rồi `JSON.parse()`.

### 6.6 fb_dtsg extraction (từ Business Suite HTML)

```javascript
// Primary regex patterns:
/"DTSGInitialData",\[\],\{"token":"([^"]+)"/    // fb_dtsg
/"LSD",\[\],\{"token":"([^"]+)"/                 // lsd
/"USER_ID":"(\d+)"/                              // admin user ID
/"client_revision":(\d+)/                        // __rev
/"haste_session":"([^"]+)"/                      // __hs
/"hsi":"([^"]+)"/                                // __hsi
/"__spin_r":(\d+)/                               // spin_r
/"__spin_b":"([^"]+)"/                           // spin_b
/"__spin_t":(\d+)/                               // spin_t
/"pkg_cohort":"([^"]+)"/                         // __pc
/"pr":(\d+(?:\.\d+)?)/                           // dpr
/"msgrRegion":"([^"]+)"/                         // X-MSGR-Region header
```

### 6.7 DeclarativeNetRequest rules

```javascript
// Modify Origin/Referer for Facebook API calls
chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [{
        id: 100,
        action: { type: 'modifyHeaders', requestHeaders: [
            { header: 'Origin', operation: 'set', value: 'https://business.facebook.com' },
            { header: 'Referer', operation: 'set', value: 'https://business.facebook.com/...' }
        ]},
        condition: { urlFilter: '||business.facebook.com/messaging/send/', resourceTypes: ['xmlhttprequest'] }
    }]
});
```

---

## 7. Global ID Resolution (5 strategies)

### PSID ≠ thread_id ≠ globalUserId

| ID | Ví dụ | Dùng cho |
|----|-------|----------|
| PSID | `26140045085657251` | `REPLY_INBOX_PHOTO.threadId` (OK) |
| thread_id | `34116166741365151` | Strategies 1-3 |
| customerName | `Tran Thi My Hang` | Strategies 4-5 (fallback khi không có thread_id) |
| globalUserId | `100001957832900` | `REPLY_INBOX_PHOTO.globalUserId` (BẮT BUỘC) |

### Cache

- `chrome.storage.local` (persist across restart)
- TTL: 24h
- Lần đầu resolve: ~5-40s tùy strategy
- Lần sau: instant (từ cache)

### Strategy 1: MessengerThreadlistQuery (cần thread_id + doc_id)

```
POST /api/graphql/
doc_id={MessengerThreadlistQuery}
variables={"pageId":"{pageId}","threadIds":["{threadId}"],"limit":1}
```

### Strategy 2: thread_info.php (cần thread_id)

```
POST /ajax/mercury/thread_info.php
thread_ids[0]={threadId}
request_user_id={pageId}
→ payload.threads[0].participants[].fbid (non-page)
```

### Strategy 3: PagesManagerInboxAdminAssignerRootQuery (cần thread_id)

```
POST /api/graphql/
fb_api_req_friendly_name=PagesManagerInboxAdminAssignerRootQuery
variables={"threadKey":"t_{threadId}","pageId":"{pageId}"}
→ data.commItem.target_id = globalId
```

### Strategy 4: findThread (cần customerName OR thread_id)

Reverse-engineered từ Pancake class `Fe.findThread()`.

```
POST /api/graphql/
doc_id={MessengerGraphQLThreadlistFetcher}
variables={"limit":20,"tags":["INBOX"],"before":{timeCursor}}
```

- Loads 20 threads per page, matches by:
  - `page_comm_item.id === threadId`
  - `page_comm_item.comm_source_id === threadId`
  - Participant name === customerName
- Paginates up to 200 threads
- Tries categories: main → done
- Extract: `found.thread_key.other_user_id`

### Strategy 5: getUserInboxByName (cần customerName)

Reverse-engineered từ Pancake class `Fe.getUserInboxByName()`.

```
POST /api/graphql/
doc_id={PagesManagerInboxCustomerSearchQuery}
variables={"pageID":"{pageId}","channel":"MESSENGER","count":5,"searchTerm":"{customerName}"}
→ data.page.page_unified_customer_search.edges[].node
    .unified_contact_comms_facebook.edges[].node.target_id = globalId
```

### Response paths (tất cả strategies)

```
data.commItem.target_id                              // Strategy 3
data.page.page_comm_item_for_message_thread.target_id // Pancake strategy 2
node.thread_key.other_user_id                         // Strategy 4
node.all_participants.edges[].node.messaging_actor.id  // Fallback
data.page.page_unified_customer_search...target_id    // Strategy 5
data.node.messaging_actor.id                          // Generic
obj.other_user_fbid                                   // Deep search
```

---

## 8. Error Handling

### Error Codes (từ Pancake Extension)

| Code | Ý nghĩa | Retry Strategy |
|------|---------|---------------|
| `1357004` | Unknown | `restartInbox` |
| `1545012` | Blocked (1st retry) | `retryUsingSocket` |
| `1545006` | Upload blocked | `reuploadPhotos` |
| `3252001` | Rate limited | `retryUsingSocket` |
| `1390008` | Temporary error | `retryUsingSocket` |
| `1545041` | User unavailable | `cannotRetry` |

### Pancake vs N2Store parameter diff

| Parameter | Pancake | N2Store |
|-----------|---------|---------|
| `source` | `source:page_unified_inbox` | `source:page_unified_inbox` ✅ |
| `client` | `mercury` | `mercury` ✅ |
| `action_type` | `ma-type:user-generated-message` | `ma-type:user-generated-message` ✅ |
| `__user` | Admin User ID | Admin User ID ✅ |
| `__s` | Persistent session ID | Random per request |
| `X-MSGR-Region` | From HTML | From HTML ✅ |

---

## 9. Cấu hình

### Endpoints (shared/config.js)

| Config | Giá trị |
|--------|---------|
| `FB_MESSAGING_SEND` | `https://business.facebook.com/messaging/send/` |
| `FB_UPLOAD` | `https://upload-business.facebook.com/ajax/mercury/upload.php` |
| `FB_GRAPHQL` | `https://business.facebook.com/api/graphql/` |
| `FB_COMMENT_ADD` | `https://www.facebook.com/ajax/ufi/add_comment.php` |
| `RENDER_SSE_URL` | `https://n2store-fallback.onrender.com` |
| `CF_WORKER_URL` | `https://chatomni-proxy.nhijudyshop.workers.dev` |
| `WEB_GITHUB_URL` | `https://nhijudyshop.github.io/n2store/orders-report/main.html` |

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

- `nhijudyshop.workers.dev`
- `nhijudyshop.github.io`

### Host Permissions

- `business.facebook.com` — Messaging, GraphQL
- `upload-business.facebook.com` — Upload photos
- `www.facebook.com` — Comments, profile
- `graph.facebook.com` — Graph API fallback

---

## 10. Lưu ý quan trọng

### 10.1 isBusiness: false

Trường `isBusiness` trong REPLY_INBOX_PHOTO **PHẢI là `false`**. Đây là cách pancake.vn gửi. Nếu `true`, extension xử lý flow khác và có thể fail.

### 10.2 fb_dtsg

- CSRF token của Facebook, **chỉ lấy được từ HTML** (không qua API)
- Extension tự quản lý qua `PREINITIALIZE_PAGES` và `GET_BUSINESS_CONTEXT`
- Cần user **đã đăng nhập Facebook** trên cùng Chrome profile
- 3 phương pháp extract: DTSGInitialData regex → hidden input → async_get_token

### 10.3 Service Worker Lifecycle

- Service Worker tắt sau **30s idle** → contentscript gửi `WAKE_UP` mỗi 10s
- chrome.alarms gửi keepAlive mỗi 30s (backup)
- Offscreen.js gửi keepAlive mỗi 20s
- Dùng ES Modules (`type: "module"` trong manifest)

### 10.4 SSE Reconnect

- Auto-reconnect khi mất kết nối
- Exponential backoff: 1s → 2s → 4s → 8s → ... → 60s max
- Subscribe keys: `wallet`, `held_products`, `new_messages`, `processing_tags`

---

## 11. Debug

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
[N2EXT][FB-GlobalID] Strategy 4 succeeded
```

### Log prefixes

| Prefix | Module | File |
|--------|--------|------|
| `[N2EXT][SW]` | Service Worker | service-worker.js |
| `[N2EXT][FB-Session]` | Facebook Session | facebook/session.js |
| `[N2EXT][FB-Sender]` | Message Sender | facebook/sender.js |
| `[N2EXT][FB-Uploader]` | Image Uploader | facebook/uploader.js |
| `[N2EXT][FB-GlobalID]` | Global ID Resolver | facebook/global-id.js |
| `[N2EXT][FB-Commenter]` | Comment/Private Reply | facebook/commenter.js |
| `[N2EXT][SSE]` | SSE Listener | server/sse-listener.js |
| `[N2EXT][Notif]` | Notifications | server/notifications.js |
| `[N2EXT][Storage]` | Storage/Badge | sync/storage.js |

---

## 12. So sánh với Pancake Extension

| | Pancake Extension | N2Store Extension |
|-|-------------------|-------------------|
| **Code** | 589KB minified, 1 file | ~3,000 dòng, 28 files ES Modules |
| **Đọc được** | Không (obfuscated) | Có (clean code) |
| **Sửa được** | Không | Có |
| **Platforms** | FB + IG + LINE + Zalo | FB only (N2Store chỉ cần) |
| **Global ID** | 5 strategies | 5 strategies (matched) |
| **Comment/Reply** | Có | Có (SEND_COMMENT, SEND_PRIVATE_REPLY) |
| **Thông báo** | Không | 14 loại + SSE real-time |
| **Popup** | Không | Dashboard + Notification center |
| **Cài đặt** | Không | Full settings page |
| **Badge** | Không | Unread counter |
| **SSE** | Không | Kết nối Render server |
| **API compatible** | — | 100% (drop-in replacement) |

---

## 13. Roadmap

### Done
- [x] Facebook session manager (fb_dtsg)
- [x] Inbox sender (REPLY_INBOX_PHOTO)
- [x] Image uploader (UPLOAD_INBOX_PHOTO)
- [x] Global ID resolver (5 strategies)
- [x] Content script bridge
- [x] DeclarativeNetRequest rules
- [x] Hệ thống thông báo (14 loại)
- [x] SSE real-time listener
- [x] Popup UI (3 tabs)
- [x] Trang cài đặt
- [x] Badge counter + Activity log
- [x] SEND_COMMENT, SEND_PRIVATE_REPLY

### Planned
- [ ] REACT_MESSAGE
- [ ] BLOCK_FACEBOOK_USER, CHANGE_CONV_STATUS_TO_ARCHIVED
- [ ] GET_PROFILE_INFO, GET_PROFILE_LINK
- [ ] Quick reply templates từ popup
- [ ] Cross-tab sync via SharedWorker
