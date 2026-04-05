# N2Store Messenger - Chrome Extension

> Extension riêng của N2Store, thay thế Pancake Extension V2
> Chrome Manifest V3 | ES Modules | Clean architecture

---

## 1. Tổng quan

N2Store Messenger là Chrome Extension cho phép:

- **Gửi tin nhắn bypass 24h** qua Facebook Business Suite internal API
- **Upload ảnh/video/file** lên Facebook từ URL
- **Resolve Global ID** (thread_id/customerName → globalUserId) qua GraphQL (6 strategies)
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
│   │   ├── global-id.js             # GET_GLOBAL_ID_FOR_CONV (6 strategies)
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
│   ├── contentscript.js             # Bridge: page ↔ service worker
│   └── tpos-interceptor.js          # TPOS XHR interceptor (tag assignment)
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
contentscript.js (inject vào trang nhijudyshop)
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

TPOS Tag Interception (separate flow):

tomato.tpos.vn (TPOS order list page)
  │ User gán tag → XHR POST /TagSaleOnlineOrder/ODataService.AssignTag
  ▼
tpos-interceptor.js (inject vào trang TPOS)
  │ Intercept XHR, on success: { type: 'tpos:tag-assigned', orderId, tags }
  ├── chrome.runtime.sendMessage() → service-worker.js
  └── fetch() → Render server /api/tpos-events/broadcast (fallback)
  ▼
service-worker.js
  ├── Forward to Render server → WebSocket broadcast → N2Store web table updates
  └── Broadcast to connected N2Store tabs directly
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
| Resolve Global ID | `GET_GLOBAL_ID_FOR_CONV` (6 strategies) | Done |
| Gửi comment | `SEND_COMMENT` | Done |
| Nhắn riêng | `SEND_PRIVATE_REPLY` | Done |
| Keep-alive | `WAKE_UP` (10s) + chrome.alarms (30s) | Done |
| Header modification | DeclarativeNetRequest (Origin, Referer) | Done |
| TPOS tag interception | XHR intercept → `tpos:tag-assigned` | Done |
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

## 7. Global ID Resolution (6 strategies)

### PSID ≠ thread_id ≠ globalUserId

| ID | Ví dụ | Dùng cho |
|----|-------|----------|
| PSID | `26140045085657251` | `REPLY_INBOX_PHOTO.threadId` (OK) |
| thread_id | `34116166741365151` | Strategies 1-4 |
| customerName | `Tran Thi My Hang` | Strategies 3, 6 (fallback khi không có thread_id) |
| globalUserId | `100001957832900` | `REPLY_INBOX_PHOTO.globalUserId` (BẮT BUỘC) |

### Cache

- `chrome.storage.local` (persist across restart)
- TTL: 24h
- Lần đầu resolve: ~5-40s tùy strategy
- Lần sau: instant (từ cache)

### Strategy 1: AdminAssigner (cần thread_id + doc_id)

```
POST /api/graphql/
doc_id={PagesManagerInboxAdminAssignerRootQuery}
variables={"pageID":"{pageId}","commItemID":"{threadId}"}
→ data.commItem.target_id = globalId
```

> **⚠ LƯU Ý:** `PagesManagerInboxAdminAssignerRootQuery` doc_id đã bị Facebook xóa khỏi JS bundles (tính đến 04/2026). Chỉ hoạt động nếu doc_id còn trong cache. Xem [Troubleshooting doc_ids](#73-doc_id-extraction--pancake-patterns).

### Strategy 2: CommItemHeaderMercuryQuery (cần threadKey + cquick_token + doc_id)

```
POST /api/graphql/
doc_id={PagesManagerInboxQueryUtilCommItemHeaderMercuryQuery}
variables={"pageID":"{pageId}","messageThreadID":"{threadKey}"}
cquick=jsc_c_d&cquick_token={token}
→ data.page.page_comm_item_for_message_thread.target_id = globalId
```

### Strategy 3: findThread ⭐ (cần threadId OR customerName + doc_id)

**Strategy chính — đáng tin nhất** vì dùng `MessengerThreadlistQuery` doc_id (luôn tìm được trong JS bundles).

Reverse-engineered từ Pancake class `Fe.findThread()`.

```
POST /api/graphql/
doc_id={MessengerThreadlistQuery}    ← doc_id: 34388012574175272 (tính đến 04/2026)
variables={"limit":20,"tags":["INBOX"],"before":{timeCursor},"isWorkUser":false,...}
```

- Loads 20 threads per page, matches by:
  - `page_comm_item.id === threadId`
  - `page_comm_item.comm_source_id === threadId`
  - Participant name === customerName
- Paginates up to 200 threads
- Tries categories: main → done → page_background → spam → retry(now)
- Extract: `found.thread_key.other_user_id`

### Strategy 4: ConversationPage (cần thread_id, không cần doc_id)

Scrape HTML từ Business Suite conversation page, tìm `target_id` trong SSR data.

```
GET /latest/inbox/all?asset_id={pageId}&selected_item_id={threadId}&mailbox_id=&thread_type=FB_MESSAGE
→ Regex parse HTML for: "commItem":{..."target_id":"USERID"}, "other_user_id", etc.
```

### Strategy 5: thread_info.php (cần thread_id, không cần doc_id)

```
POST /ajax/mercury/thread_info.php
thread_ids[0]={threadId}
request_user_id={pageId}
→ payload.threads[0].participants[].fbid (non-page)
```

### Strategy 6: getUserInboxByName (cần customerName)

Reverse-engineered từ Pancake class `Fe.getUserInboxByName()`.

```
POST /api/graphql/
doc_id={BizInboxCustomerRelaySearchSourceQuery}
variables={"pageID":"{pageId}","channel":"MESSENGER","count":5,"searchTerm":"{customerName}"}
→ data.page.page_unified_customer_search.edges[].node
    .unified_contact_comms_facebook.edges[].node.target_id = globalId
```

### Response paths (tất cả strategies)

```
data.commItem.target_id                              // Strategy 1
data.page.page_comm_item_for_message_thread.target_id // Strategy 2
node.thread_key.other_user_id                         // Strategy 3 (findThread)
node.all_participants.edges[].node.messaging_actor.id  // Strategy 3 fallback
data.page.page_unified_customer_search...target_id    // Strategy 6
data.node.messaging_actor.id                          // Generic
obj.other_user_fbid                                   // Deep search
```

### 7.1 Thứ tự ưu tiên

**N2Store Extension (6 strategies):**
```
1. AdminAssigner (doc_id)         ← Nhanh nhưng doc_id hiếm khi có
2. CommItemHeader (cquick+doc_id) ← Nhanh nhưng cần cquick_token + doc_id
3. findThread ⭐                  ← CHÍNH: dùng MessengerThreadlistQuery (luôn có doc_id)
4. ConversationPage               ← Scrape HTML, chậm
5. thread_info.php                ← Mercury endpoint, chậm
6. getUserInboxByName             ← Chỉ khi có customerName
```

**Pancake Extension v0.5.43 (4 strategies, từ `Me` class trong background.js):**
```
1. PagesManagerInboxAdminAssignerRootQuery  ← GraphQL: commItemID → target_id (cần threadId)
2. PagesManagerInboxQueryUtilCommItemHeaderMercuryQuery ← GraphQL: messageThreadID → target_id (cần threadKey + cquick_token)
3. findThread (MessengerGraphQLThreadlistFetcher) ← Load 20 threads/page, match by threadId OR customerName
   - Paginates: main → done → page_background → spam (max 200/category)
   - Tìm theo: page_comm_item.id === threadId || participant.name === customerName
   - Extract: thread_key.other_user_id
4. getUserInboxByName (page_unified_customer_search) ← GraphQL search by name, match by threadId
   - ⚠ CẦN threadId để filter kết quả (null match không đáng tin)
```

> **Lưu ý quan trọng:** Pancake Extension KHÔNG có Strategy 4-5 của N2Store (ConversationPage scraping, thread_info.php). Khi Strategy 1-3 fail VÀ Strategy 4 không match được (vì threadId null) → `GET_GLOBAL_ID_FOR_CONV_FAILURE`.
>
> **Fix (04/2026):** `tab1-chat-core.js` enriches `thread_id` từ Pancake conversation list API (background fetch). API trả `thread_id` nhưng cache `inboxMapByPSID` và messages API thì không. Xem commit `a1fe2611`.

### 7.2 Bài học quan trọng từ debug (04/2026)

| Vấn đề | Chi tiết |
|---------|----------|
| **`PagesManagerInboxAdminAssignerRootQuery` đã bị xóa** | Facebook không còn ship doc_id này trong bất kỳ JS bundle nào (đã scan 5,454 files). Pancake có thể vẫn hoạt động vì dùng cached doc_id từ localStorage. |
| **`BusinessCometInboxThreadDetailHeaderQuery` trả sai data** | Trả về `data.viewer.ubi_thread_detail` (UI component renderer), KHÔNG phải `data.commItem.target_id`. Đã xóa khỏi ADMIN_ASSIGNER_NAMES. |
| **`AdminAssigner` without doc_id luôn fail** | Gửi `fb_api_req_friendly_name` mà không có `doc_id` → Facebook trả lỗi `"Must provide either query_id or q, but not both"`. |
| **`MessengerThreadlistQuery` là key** | Doc_id `34388012574175272` tìm được qua Pattern G (id/metadata/name trong Relay operation object). Đây là strategy đáng tin nhất. |

### 7.3 Doc_id extraction — Pancake patterns

Extension dùng **9 regex patterns** để extract doc_ids từ Facebook JS bundles (5 pattern gốc + 4 pattern từ Pancake):

| Pattern | Format | Ví dụ |
|---------|--------|-------|
| A | `"queryID":"ID"..."queryName":"NAME"` | HTML preloader |
| B | `"NAME_facebookRelayOperation"...exports="ID"` | Relay operation module |
| C | `"docID":"ID","queryName":"NAME"` | Legacy format |
| D | `queryID:"ID"...queryName:"NAME"` (unquoted) | JS bundle |
| E | `params:{id:n("NAME_facebookRelayOperation")...}` | PreloadableConcreteRequest |
| **F** ⭐ | `operationKind:"query",name:"NAME",id:"ID"` | **Pancake pattern 1** |
| **G** ⭐ | `{id:"ID",metadata:{},name:"NAME"}` | **Pancake pattern 2 — tìm được MessengerThreadlistQuery** |
| **H** | `__d("NAME"...__getDocID=function(){return"ID"})` | **Pancake pattern 3** |
| **I** | `"NAME_instagramRelayOperation"...exports="ID"` | **Pancake pattern 5** |

**Compat view** (legacy inbox page) chứa rsrcMap với ~5,400 JS modules. Extension fetch ALL để extract doc_ids (giống Pancake).

URL format: `https://business.facebook.com/latest/inbox/messenger?asset_id={pageId}&nav_ref=diode_page_inbox&cquick=jsc_c_d&cquick_token={token}&ctarget=https%3A%2F%2Fwww.facebook.com`

> **⚠ LƯU Ý:** Compat view URL **PHẢI** có `asset_id` + `nav_ref=diode_page_inbox`. Nếu chỉ có `asset_id` mà thiếu `nav_ref` → response chỉ ~1.5KB (bị redirect). Nếu bỏ cả hai thì cũng hoạt động (~1.3MB) nhưng nên giữ đúng format Pancake.

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

- `nhijudyshop.workers.dev` — N2Store web app (contentscript.js)
- `nhijudyshop.github.io` — N2Store web app (contentscript.js)
- `tomato.tpos.vn` — TPOS order management (tpos-interceptor.js)

### Host Permissions

- `business.facebook.com` — Messaging, GraphQL
- `upload-business.facebook.com` — Upload photos
- `www.facebook.com` — Comments, profile
- `graph.facebook.com` — Graph API fallback
- `tomato.tpos.vn` — TPOS tag assignment interception

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

### 10.4 Global ID Resolution — Troubleshooting

**Triệu chứng:** `GET_GLOBAL_ID_FOR_CONV_FAILURE: "Could not resolve globalUserId"`

**Kiểm tra theo thứ tự:**

1. **Có `MessengerThreadlistQuery` doc_id không?**
   - Mở SW console → tìm log `✓ MessengerThreadlistQuery: 34388012574175272`
   - Nếu không có → `extractDocIds` thiếu Pattern G, hoặc compat view bị lỗi
   - Fix: kiểm tra compat view URL, kiểm tra rsrcMap fetch

2. **findThread có chạy không?**
   - Log: `[FB-GlobalID] [3/6] Trying findThread...`
   - Nếu skip → thiếu doc_id hoặc thiếu cả threadId lẫn customerName
   - Nếu chạy nhưng fail → thread không nằm trong INBOX/ARCHIVED/PAGE_BACKGROUND/OTHER (200 threads/category)

3. **Compat view load thành công không?**
   - Log: `CompatView: XXXX bytes` — cần > 100KB
   - Nếu < 5KB → URL sai hoặc cquick_token hết hạn
   - Cần cả `asset_id` + `nav_ref=diode_page_inbox` trong URL

4. **Doc_ids nào available?**
   - Log: `Total doc_ids: XXX`
   - Quan trọng nhất: `MessengerThreadlistQuery` (cho findThread)
   - `PagesManagerInboxAdminAssignerRootQuery` gần như không còn tìm được (Facebook đã xóa)

5. **Facebook thay đổi query names/format?**
   - Check Pancake extension logs để so sánh
   - Facebook đổi tên queries định kỳ: `PagesManager*` → `BusinessComet*` → `BizInbox*`
   - Nếu doc_id mới dùng format khác → cần thêm regex pattern vào `extractDocIds` trong `session.js`

**Debug nhanh — paste vào SW console:**
```javascript
// Xem tất cả doc_ids đã extract
chrome.storage.local.get(null, d => {
  const keys = Object.keys(d).filter(k => k.includes('docId') || k.includes('doc_id'));
  console.log('Doc ID storage keys:', keys);
});
```

### 10.5 TPOS Tag Interception

TPOS (tomato.tpos.vn) **không phát Socket.IO event** khi gán tag từ trang danh sách đơn hàng (`/app/saleOnline/order/list`). Chỉ có event khi tương tác trên trang chi tiết đơn (live page).

**Giải pháp**: `tpos-interceptor.js` intercept XHR calls:

```
POST /odata/TagSaleOnlineOrder/ODataService.AssignTag
Body: { Tags: [{Id, Name, Color}, ...], OrderId: "uuid" }
```

Khi XHR trả 2xx → gửi event `tpos:tag-assigned` qua 2 kênh:
1. `chrome.runtime.sendMessage()` → service worker → forward to Render server → WebSocket broadcast
2. `fetch()` trực tiếp đến Render server `/api/tpos-events/broadcast` (fallback)

N2Store web app (`tab1-tpos-realtime.js`) nhận event qua WebSocket và cập nhật tags trong bảng đơn hàng mà không cần F5.

### 10.6 SSE Reconnect

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
| **Global ID** | 4 strategies (Me class) | 6 strategies (matched + ConversationPage + thread_info.php) |
| **Comment/Reply** | Có | Có (SEND_COMMENT, SEND_PRIVATE_REPLY) |
| **Thông báo** | Không | 14 loại + SSE real-time |
| **Popup** | Không | Dashboard + Notification center |
| **Cài đặt** | Không | Full settings page |
| **Badge** | Không | Unread counter |
| **SSE** | Không | Kết nối Render server |
| **TPOS integration** | Không | XHR intercept tag assignment → real-time sync |
| **API compatible** | — | 100% (drop-in replacement) |

---

## 13. Roadmap

### Done
- [x] Facebook session manager (fb_dtsg)
- [x] Inbox sender (REPLY_INBOX_PHOTO)
- [x] Image uploader (UPLOAD_INBOX_PHOTO)
- [x] Global ID resolver (6 strategies, Pancake regex patterns)
- [x] Content script bridge
- [x] DeclarativeNetRequest rules
- [x] Hệ thống thông báo (14 loại)
- [x] SSE real-time listener
- [x] Popup UI (3 tabs)
- [x] Trang cài đặt
- [x] Badge counter + Activity log
- [x] SEND_COMMENT, SEND_PRIVATE_REPLY
- [x] TPOS tag interception (XHR intercept → WebSocket broadcast)

### Planned
- [ ] REACT_MESSAGE
- [ ] BLOCK_FACEBOOK_USER, CHANGE_CONV_STATUS_TO_ARCHIVED
- [ ] GET_PROFILE_INFO, GET_PROFILE_LINK
- [ ] Quick reply templates từ popup
- [ ] Cross-tab sync via SharedWorker
