# Chat Refactor & Extension Bypass 24h - Tab1 Orders

> Tài liệu mô tả hệ thống chat/bình luận trong `tab1-orders.html` sau khi refactor 5 phase: fix bugs, tích hợp Extension Bypass 24h, chuẩn hóa token, cải thiện realtime, và cleanup dead code.

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Extension Bypass 24h trong Tab1](#2-extension-bypass-24h-trong-tab1)
3. [Fallback Chain khi gửi tin nhắn](#3-fallback-chain-khi-gửi-tin-nhắn)
4. [Token Management](#4-token-management)
5. [Realtime Messaging](#5-realtime-messaging)
6. [Cấu trúc File](#6-cấu-trúc-file)
7. [Bug Fixes](#7-bug-fixes)
8. [Cleanup & Deduplication](#8-cleanup--deduplication)
9. [Debug & Troubleshooting](#9-debug--troubleshooting)

---

## 1. Tổng quan

### 1.1 Vấn đề

Facebook áp dụng **Standard Messaging Policy**: chỉ cho phép gửi tin nhắn trong **24 giờ** kể từ tương tác cuối cùng của khách hàng. Sau 24h, gửi tin nhắn sẽ bị lỗi:

```
Error 10 / Subcode 2018278: This message is sent outside of allowed window.
Error 551: This person isn't available right now.
```

### 1.2 Giải pháp trước đó

- **Tab1 (orders-report)**: Pancake API → Facebook Graph API với message_tag (HUMAN_AGENT / POST_PURCHASE_UPDATE) → Manual prompt
- **Inbox**: Pancake API → Extension Bypass 24h → Facebook Tag → Manual prompt

**Vấn đề**: Tab1 KHÔNG có Extension Bypass, dẫn đến phải dùng Facebook Tag (bị giới hạn use case) hoặc bắt user chuyển sang inbox.

### 1.3 Giải pháp mới

Tích hợp **Pancake Extension V2 Bypass** vào Tab1 với module riêng (`tab1-extension-bridge.js`), không đụng vào code inbox/.

```
┌─────────────────────────────────────────────────────────┐
│                  GỬI TIN NHẮN (Tab1)                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Pancake API (reply_inbox)                           │
│     ├─ Thành công → Done                                │
│     └─ Lỗi 24h / 551                                   │
│         │                                                │
│  2. Extension Bypass (REPLY_INBOX_PHOTO)                │
│     ├─ Connected + globalUserId → Gửi qua Extension    │
│     │   ├─ Thành công → Done                            │
│     │   └─ Thất bại → Tiếp tục                         │
│     └─ Không connected → Bỏ qua                        │
│         │                                                │
│  3. Facebook Tag (HUMAN_AGENT / POST_PURCHASE_UPDATE)   │
│     ├─ Có token → Gửi qua Graph API                    │
│     │   ├─ Thành công → Done                            │
│     │   └─ Thất bại → Tiếp tục                         │
│     └─ Không token → Bỏ qua                            │
│         │                                                │
│  4. Manual Prompt (show24hFallbackPrompt)               │
│     ├─ Nút "Gửi qua Extension" (nếu connected)        │
│     ├─ Nút "Gửi với Message Tag"                       │
│     ├─ Nút "Chuyển sang Comment"                       │
│     └─ Nút "Hủy"                                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Extension Bypass 24h trong Tab1

### 2.1 Module: `tab1-extension-bridge.js`

File: `orders-report/js/tab1/tab1-extension-bridge.js` (~250 dòng)

Module **độc lập**, chỉ dùng trong tab1, không chia sẻ code với inbox/.

```javascript
window.tab1ExtensionBridge = {
    connected: false,         // Extension đã kết nối chưa
    lastEvents: [],           // Lịch sử events
    _globalIdCache: {},       // Cache globalUserId (tránh resolve lại)
    _initialized: false,

    init(pageIds),                    // Khởi tạo: listen EXTENSION_LOADED, gửi PREINITIALIZE_PAGES
    async resolveGlobalUserId(conv),  // Resolve 5-step fallback → globalUserId
    async sendMessage({...}),         // Gửi tin nhắn qua Extension (REPLY_INBOX_PHOTO)
    isConnected(),                    // Kiểm tra trạng thái
    getStatus(),                      // Chi tiết trạng thái
    _updateStatusUI(connected)        // Cập nhật icon trên chat modal
};
```

### 2.2 Cách Extension hoạt động

```
Browser Page ←→ contentscript.js ←→ background.js (Service Worker) ←→ business.facebook.com
     │                                      │
     │  window.postMessage()                │  fetch() hoặc XMLHttpRequest
     │  (REPLY_INBOX_PHOTO)                 │  (business.facebook.com/messaging/send/)
     │                                      │
     ▼                                      ▼
  Tab1 Page                           Facebook Server
```

**Giao thức**: `window.postMessage()` với các message types:

| Message Type | Hướng | Mô tả |
|-------------|-------|--------|
| `EXTENSION_LOADED` | Extension → Page | Extension đã sẵn sàng |
| `PREINITIALIZE_PAGES` | Page → Extension | Đăng ký page IDs cần handle |
| `REPLY_INBOX_PHOTO` | Page → Extension | Gửi tin nhắn bypass 24h |
| `GET_GLOBAL_ID_FOR_CONV` | Page → Extension | Lấy globalUserId từ thread_id |
| `GLOBAL_ID_FOR_CONV_RESULT` | Extension → Page | Kết quả globalUserId |

### 2.3 Resolve globalUserId (5-step fallback)

Extension cần `globalUserId` (Global Facebook User ID) thay vì PSID. Logic resolve:

```
Step 1: Cache (_globalIdCache[psid])
  └─ Hit → return cached value

Step 2: conversation.page_customer.global_id
  └─ Có → cache + return

Step 3: conversation.customers[].global_id
  └─ Tìm customer matching psid → cache + return

Step 4: conversation.customers[] (bất kỳ customer nào có global_id)
  └─ Có → cache + return

Step 5: GET_GLOBAL_ID_FOR_CONV via Extension
  └─ Cần thread_id (từ conversation hoặc inbox_preview API)
  └─ Extension call Facebook API → return globalUserId
  └─ Timeout: 60 giây
```

### 2.4 REPLY_INBOX_PHOTO Payload

```javascript
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    payload: {
        pageId: '117267091364524',           // Facebook Page ID
        userId: 'global_user_id_here',       // Global Facebook User ID (NOT PSID!)
        text: 'Xin chào!',                  // Nội dung tin nhắn
        accessToken: 'pancake_jwt_token',    // Pancake JWT token (NOT Facebook token!)
        isBusiness: false,                   // QUAN TRỌNG: phải là false
        updatedTime: '2026-03-21T10:00:00Z', // Thời gian cập nhật conversation
        customerName: 'Nguyễn Văn A'         // Tên khách hàng
    }
}, '*');
```

**Lưu ý quan trọng**:
- `isBusiness: false` — Bắt buộc, nếu `true` extension sẽ gửi sai endpoint
- `accessToken` — Là Pancake JWT, KHÔNG phải Facebook Page Token
- `userId` — Là Global Facebook User ID, KHÔNG phải PSID (Page-Scoped ID)

### 2.5 Khởi tạo

Extension bridge được khởi tạo trong `tab1-chat.js` (aggregator), delay 3 giây để chờ `pancakeTokenManager` load:

```javascript
setTimeout(() => {
    if (window.tab1ExtensionBridge && !window.tab1ExtensionBridge._initialized) {
        let pageIds = [];
        if (window.pancakeTokenManager?.accountPages) {
            pageIds = Object.keys(window.pancakeTokenManager.accountPages);
        }
        if (pageIds.length === 0 && window.pancakeDataManager?.pageIds) {
            pageIds = window.pancakeDataManager.pageIds;
        }
        window.tab1ExtensionBridge.init(pageIds);
    }
}, 3000);
```

### 2.6 UI Indicator

Chat modal header hiển thị icon trạng thái Extension:

| Icon | Màu | Ý nghĩa |
|------|-----|---------|
| `fa-plug` | Đỏ `#ef4444` | Extension chưa kết nối |
| `fa-plug` | Xanh `#10b981` | Extension đã kết nối |
| Hidden | — | Extension bridge chưa load |

HTML element: `<span id="extensionStatusIndicator">` trong chat modal header.

---

## 3. Fallback Chain khi gửi tin nhắn

### 3.1 sendMessageInternal() — Tin nhắn INBOX

File: `orders-report/js/tab1/tab1-chat-messages.js`

```
Pancake API (reply_inbox, page_access_token)
  ├─ 200 OK → Thành công
  └─ Lỗi 24h (is24HourError) hoặc 551 (isUserUnavailable)
      │
      ├─ FALLBACK 1: Extension Bypass
      │   ├─ tab1ExtensionBridge.isConnected()? → resolveGlobalUserId() → sendMessage()
      │   └─ Thành công → Optimistic UI update → return
      │
      ├─ FALLBACK 2: Facebook Tag
      │   ├─ show24hFallbackPrompt() → User chọn cách gửi
      │   └─ sendViaFacebookTagFromModal() hoặc sendViaExtensionFromModal()
      │
      └─ Các lỗi khác → throw Error
```

### 3.2 sendCommentInternal() — Bình luận COMMENT

File: `orders-report/js/tab1/tab1-chat-messages.js`

```
Pancake API (private_replies)
  ├─ 200 OK → Thành công
  └─ Lỗi
      │
      ├─ FALLBACK 1: Pancake API (reply_inbox thay vì private_replies)
      │   ├─ Thành công → return
      │   └─ Thất bại → tiếp tục
      │
      ├─ FALLBACK 2: Extension Bypass
      │   ├─ resolveGlobalUserId() → sendMessage()
      │   └─ Thành công → return
      │
      └─ FALLBACK 3: throw Error
```

### 3.3 show24hFallbackPrompt() — Manual UI

File: `orders-report/js/tab1/tab1-chat-facebook.js`

Modal hiển thị khi auto-fallback thất bại, cho user chọn:

1. **Gửi qua Extension** (tím, chỉ hiện nếu Extension connected)
2. **Gửi với Message Tag** (xanh dương, dùng HUMAN_AGENT / POST_PURCHASE_UPDATE)
3. **Chuyển sang Comment** (xanh lá)
4. **Hủy** (xám)

---

## 4. Token Management

### 4.1 Các loại Token

| Token | Nguồn | Thời hạn | Check hết hạn | Dùng cho |
|-------|-------|----------|---------------|----------|
| **Pancake JWT** (`access_token`) | Pancake login | ~24 giờ | `isTokenExpired()` 1h buffer | Pancake API v1, tạo page_access_token |
| **Pancake page_access_token** | Generate từ JWT | Không hết hạn | Không cần | Pancake Official API v1/v2 |
| **Facebook Page Token** | TPOS CRMTeam | ~60 ngày | **MỚI**: error code 190 detection | Facebook Graph API (24h bypass) |
| **Account Token** (multi-account) | Firestore | ~24 giờ | `isTokenExpired()` | Fallback khi active account không access page |

### 4.2 Shared `getFacebookPageToken()` (MỚI)

File: `orders-report/js/tab1/tab1-chat-facebook.js`

**Trước refactor**: Logic lấy Facebook Page Token bị copy-paste ở 3 nơi (tab1-chat-facebook.js, tab1-chat-realtime.js, bill-service.js) với 5 nguồn fallback khác nhau.

**Sau refactor**: 1 hàm duy nhất `window.getFacebookPageToken(pageId)`:

```javascript
// Priority order:
// Source 1: window.currentCRMTeam.Facebook_PageToken (khớp pageId)
// Source 2: window.currentOrder.CRMTeam.Facebook_PageToken (khớp pageId)
// Source 3: window.cachedChannelsData (find by pageId)
// Source 4: Fetch từ TPOS API (GET /api/odata/CRMTeam)
// Source 5: REMOVED — fallback token sai page luôn fail "page mismatch"
```

### 4.3 Token Error Detection (MỚI)

Khi Facebook API trả lỗi token hết hạn:

```javascript
// Error codes phát hiện:
// - error_code: 190 (Invalid access token)
// - error_subcode: 463 (Token expired)
// - error_subcode: 467 (Token invalidated)

// Hành vi:
// 1. Đánh dấu token invalid trong cache (_fbTokenValidationCache)
// 2. Hiện notification: "Facebook Page Token hết hạn..."
// 3. Cache invalid 10 phút → skip retry token hỏng
// 4. Sau 10 phút → cho phép retry (user có thể đã update token)
```

### 4.4 Worker Proxy Endpoints

Base URL: `https://chatomni-proxy.nhijudyshop.workers.dev`

| Endpoint | Route | Target | Auth |
|----------|-------|--------|------|
| `pancake()` | `/api/pancake/{endpoint}` | Pancake API v1 | `access_token=JWT` |
| `pancakeOfficial()` | `/api/pancake-official/{endpoint}` | pages.fm/api/public_api/v1 | `page_access_token=` |
| `pancakeOfficialV2()` | `/api/pancake-official-v2/{endpoint}` | pages.fm/api/public_api/v2 | `page_access_token=` |
| `facebookSend()` | `/api/facebook-send` | Facebook Graph API | Body: `pageToken` |
| `facebookGraph()` | `/api/facebook-graph` | Facebook Graph API | `access_token=` |

---

## 5. Realtime Messaging

### 5.1 Kiến trúc

```
┌──────────────────────────────────────────────────────────┐
│                  Pancake WebSocket Server                  │
│          wss://pancake.vn/socket/websocket?vsn=2.0.0      │
└──────────────────────┬───────────────────────────────────┘
                       │ Phoenix Protocol v2.0.0
                       ▼
┌──────────────────────────────────────────────────────────┐
│              RealtimeManager (Browser)                     │
│              orders-report/js/managers/realtime-manager.js │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Browser WS  │  │ Server Mode  │  │ Status Events   │  │
│  │ (Direct)    │  │ (REST Poll)  │  │ (realtimeStatus │  │
│  │             │  │              │  │  Changed)       │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                │                    │           │
│         ▼                ▼                    ▼           │
│  CustomEvent: realtimeConversationUpdate                  │
└──────────────────────┬───────────────────────────────────┘
                       │
          ┌────────────┼──────────────┐
          ▼                           ▼
┌──────────────────┐    ┌──────────────────────────────┐
│ tab1-chat-       │    │ tab1-encoding.js             │
│ realtime.js      │    │ (Table cell updates)         │
│ (Chat modal      │    │ - Updates message/comment    │
│  messages)       │    │   columns in real-time       │
│ - Add new msg    │    │ - Unread badges              │
│ - Re-render      │    │ - Highlight animation        │
│ - Auto-scroll    │    └──────────────────────────────┘
│ - Sound notify   │
└──────────────────┘
```

### 5.2 Exponential Backoff (MỚI)

File: `orders-report/js/managers/realtime-manager.js`

**Trước**: Fixed 5s retry, không giới hạn → spam reconnect khi server down.

**Sau**: Exponential backoff với giới hạn.

```
Attempt 1: 2s delay
Attempt 2: 4s delay
Attempt 3: 8s delay
Attempt 4: 16s delay
Attempt 5: 32s delay
Attempt 6-10: 60s delay (max)
Attempt 11: STOP → dispatch 'realtimeConnectionLost' event
```

```javascript
// Configuration
this.reconnectAttempts = 0;
this.maxReconnectAttempts = 10;
this.baseReconnectDelay = 2000;  // 2s
this.maxReconnectDelay = 60000;  // 60s

// Delay calculation
const delay = Math.min(
    this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
    this.maxReconnectDelay
);
```

### 5.3 Polling Fallback (MỚI)

File: `orders-report/js/tab1/tab1-chat-realtime.js`

**Trước**: Polling disabled (commented out). Nếu WebSocket disconnect → không nhận tin nhắn.

**Sau**: Polling tự động bật/tắt theo trạng thái WebSocket.

```
setupRealtimeMessages()
  │
  ├─ WebSocket connected?
  │   ├─ YES → Chỉ dùng WebSocket events
  │   └─ NO  → Bật polling fallback (10s interval)
  │
  ├─ Listen 'realtimeConnectionLost'
  │   └─ Auto-start polling
  │
  └─ Listen 'realtimeStatusChanged'
      └─ connected: true → Auto-stop polling (WebSocket đã reconnect)
```

### 5.4 Adaptive Server Polling (MỚI)

File: `orders-report/js/managers/realtime-manager.js`

**Trước**: Fixed 5s interval → waste bandwidth khi không có events.

**Sau**: Interval tự điều chỉnh.

```
Có events → Reset interval về 5s (responsive)
Không events → Double interval (5s → 10s → 20s → 30s max)
```

### 5.5 Connection Status Indicator (MỚI)

Chat modal header hiển thị icon wifi:

| Icon | Màu | Ý nghĩa |
|------|-----|---------|
| `fa-wifi` | Xanh `#10b981` | WebSocket đang kết nối |
| `fa-wifi` | Đỏ `#ef4444` | WebSocket mất kết nối |
| Hidden | — | Chưa khởi tạo |

HTML element: `<span id="realtimeStatusIndicator">` trong chat modal header.

**Events dispatched** bởi RealtimeManager:

| Event | Khi nào | Detail |
|-------|---------|--------|
| `realtimeStatusChanged` | Connect/Disconnect | `{ connected: boolean }` |
| `realtimeConnectionLost` | Max retry exceeded | (no detail) |

### 5.6 Message Deduplication

Dùng persistent `window._messageIdSet` (Set) để tránh duplicate messages:

```javascript
// Thứ tự atomic:
// 1. Check: _messageIdSet.has(id) → skip nếu đã có
// 2. Add:   _messageIdSet.add(id)   ← TRƯỚC khi push
// 3. Push:  allChatMessages.push(msg)

// Clear khi đóng chat modal:
// cleanupRealtimeMessages() → _messageIdSet.clear()
```

---

## 6. Cấu trúc File

### 6.1 Chat Sub-modules (Load order)

```
orders-report/tab1-orders.html
  │
  ├─ js/tab1/tab1-extension-bridge.js   ← Extension bypass module (NEW)
  ├─ js/tab1/tab1-chat-core.js          ← State, modals, selectors, mark-read, scroll
  ├─ js/tab1/tab1-chat-messages.js       ← Render, send, queue, reply state
  ├─ js/tab1/tab1-chat-facebook.js       ← Facebook Graph API, 24h fallback, getFacebookPageToken
  ├─ js/tab1/tab1-chat-images.js         ← Upload, paste, preview, compression
  ├─ js/tab1/tab1-chat-realtime.js       ← WebSocket, polling, live updates
  └─ js/tab1/tab1-chat.js               ← Aggregator: verify, init extension bridge, status indicator
```

### 6.2 Managers

```
orders-report/js/managers/
  ├─ realtime-manager.js       ← WebSocket connection, exponential backoff, adaptive polling
  ├─ pancake-data-manager.js   ← Pancake API calls (messages, conversations, upload)
  └─ pancake-token-manager.js  ← JWT, page_access_token, multi-account
```

### 6.3 File đã cleanup

| File | Trước | Sau | Thay đổi |
|------|-------|-----|----------|
| `js/chat/comment-modal.js` | 804 dòng | 18 dòng | Xóa dead code, giữ redirect sang unified chat modal |
| `js/tab1/tab1-chat-facebook.js` | 5 nguồn token inline | 1 shared function | `window.getFacebookPageToken()` |
| `js/tab1/tab1-chat-realtime.js` | Copy token logic | Gọi shared function | Bỏ local `getFacebookPageToken()` |
| `js/utils/bill-service.js` | 100+ dòng token inline | 10 dòng gọi shared | Bỏ copy-paste token logic |
| `js/tab1/tab1-merge.js` | Local `escapeHtml()` | `window.escapeHtml` | Expose as shared utility |

---

## 7. Bug Fixes

### 7.1 Race condition realtime messages

**File**: `tab1-chat-realtime.js`

**Vấn đề**: Multiple WebSocket events đồng thời push vào `allChatMessages`, gây duplicate.

**Fix**: Persistent dedup Set (`window._messageIdSet`) thay vì tạo mới mỗi event. Thứ tự atomic: add to Set TRƯỚC, push to array SAU.

### 7.2 Dead code unreachable

**File**: `comment-modal.js`

**Vấn đề**: `openCommentModal()` return redirect ở line 27, toàn bộ code bên dưới (770+ dòng) không bao giờ chạy.

**Fix**: Xóa toàn bộ dead code, giữ lại function redirect duy nhất.

### 7.3 Duplicate template.Content check

**File**: `message-template-manager.js`

**Vấn đề**: `template.Content || template.Content || template.BodyPlain` — check `Content` 2 lần.

**Fix**: `template.Content || template.BodyPlain || 'Không có nội dung'`

### 7.4 Broken Source 5 token fallback

**File**: `tab1-chat-facebook.js`

**Vấn đề**: Source 5 dùng token của page khác → luôn fail "page mismatch". Tạo false hope và log warnings vô ích.

**Fix**: Xóa Source 5 hoàn toàn. Return `null` nếu Sources 1-4 không tìm được.

---

## 8. Cleanup & Deduplication

### 8.1 getFacebookPageToken — 3 bản → 1

**Trước**:
- `tab1-chat-facebook.js:24-117` — 5 nguồn, đầy đủ nhất
- `tab1-chat-realtime.js:249-267` — 3 nguồn, rút gọn
- `bill-service.js:1546-1651` — 5 nguồn, inline

**Sau**: 1 hàm `window.getFacebookPageToken(pageId)` trong `tab1-chat-facebook.js`. Các file khác gọi hàm chung.

### 8.2 escapeHtml — Expose as shared

**Trước**: 5 bản copy trong 5 file khác nhau (tab1-merge, tab1-order-history, tab3-core, live-comments-readonly-modal, tab-pending-delete).

**Sau**: `window.escapeHtml` exposed từ `tab1-merge.js` với guard `if (!window.escapeHtml)`. IIFE-scoped copies giữ nguyên (self-contained, không phụ thuộc load order).

### 8.3 comment-modal.js — 804 → 18 dòng

Toàn bộ file là dead code sau khi migrate sang unified chat modal. Chỉ giữ lại `window.openCommentModal()` làm bridge redirect.

---

## 9. Debug & Troubleshooting

### 9.1 Extension Bypass không hoạt động

```javascript
// Kiểm tra trạng thái
console.log(window.tab1ExtensionBridge?.getStatus());
// → { connected: true/false, initialized: true/false, ... }

// Kiểm tra Extension loaded
// Mở DevTools → Console → search "[Tab1-ExtBridge]"

// Test thủ công
window.tab1ExtensionBridge.sendMessage({
    text: 'Test message',
    pageId: '117267091364524',
    psid: 'customer_psid',
    globalUserId: 'global_id',
    customerName: 'Test'
});
```

**Nguyên nhân phổ biến**:
1. Extension chưa cài → `connected: false`
2. Không tìm được `globalUserId` → check `resolveGlobalUserId()` logs
3. `isBusiness: true` → Extension gửi sai endpoint (phải là `false`)
4. Token hết hạn → check `accessToken` trong payload

### 9.2 Facebook Token hết hạn

```javascript
// Kiểm tra cache invalid tokens
console.log(window._fbTokenValidationCache); // Nếu có thì sẽ hiện
// → { "117267091364524": { invalid: true, timestamp: 1711000000000 } }

// Force retry (xóa cache)
delete window._fbTokenValidationCache?.['117267091364524'];

// Test lấy token
const token = await window.getFacebookPageToken('117267091364524');
console.log('Token:', token ? token.substring(0, 20) + '...' : 'NULL');
```

### 9.3 Realtime không nhận tin nhắn

```javascript
// Kiểm tra WebSocket
console.log('Connected:', window.realtimeManager?.isConnected);
console.log('Reconnect attempts:', window.realtimeManager?.reconnectAttempts);

// Kiểm tra polling
console.log('Polling active:', !!window.realtimeMessagesInterval);
console.log('Dedup set size:', window._messageIdSet?.size);

// Force reconnect
window.realtimeManager?.manualConnect();
```

### 9.4 Log Prefixes

| Prefix | Module |
|--------|--------|
| `[Tab1-ExtBridge]` | tab1-extension-bridge.js |
| `[FB-TAG-SEND]` | tab1-chat-facebook.js (sendMessageViaFacebookTag) |
| `[FB-TOKEN]` | tab1-chat-facebook.js (getFacebookPageToken) |
| `[REALTIME]` | realtime-manager.js |
| `[REALTIME-MSG]` | tab1-chat-realtime.js |
| `[Tab1-Chat]` | tab1-chat.js (aggregator) |
| `[EXT-MODAL]` | tab1-chat-facebook.js (sendViaExtensionFromModal) |
| `[COMMENT MODAL]` | comment-modal.js |

---

## Tóm tắt thay đổi

| Phase | Mô tả | Files | Impact |
|-------|--------|-------|--------|
| **Phase 1** | Fix bugs (race condition, dead code, duplicate check) | 3 files | Stability |
| **Phase 2** | Extension Bypass 24h (module riêng cho tab1) | 6 files (1 new) | +528 lines |
| **Phase 3** | Token consolidation + error detection | 1 file | Reliability |
| **Phase 4** | Realtime: exponential backoff, polling fallback, status UI, adaptive polling | 3 files | Resilience |
| **Phase 5** | Cleanup dead code, deduplicate utils | 5 files | -757 lines |

**Tổng net**: ~230 dòng thêm, ~1017 dòng xóa = **-787 dòng net** (giảm code, thêm tính năng).
