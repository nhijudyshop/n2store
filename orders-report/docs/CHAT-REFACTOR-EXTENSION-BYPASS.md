# Chat System - Tab1 Orders (Post-Rebuild)

> Tài liệu mô tả hệ thống chat/bình luận trong `tab1-orders.html` sau khi **xóa sạch và xây lại từ đầu** theo logic của `inbox/`. Tất cả đều dùng Pancake API, Extension Bypass 24h làm fallback, realtime qua Pancake WebSocket.

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Extension Bypass 24h](#2-extension-bypass-24h)
3. [Fallback Chain khi gửi tin nhắn](#3-fallback-chain-khi-gửi-tin-nhắn)
4. [Cách lấy globalUserId](#4-cách-lấy-globaluserid)
5. [Token Management](#5-token-management)
6. [Realtime Messaging](#6-realtime-messaging)
7. [Cấu trúc File](#7-cấu-trúc-file)
8. [Debug & Troubleshooting](#8-debug--troubleshooting)

---

## 1. Tổng quan kiến trúc

### 1.1 Iframe Architecture

```
Extension contentscript (top frame only, all_frames: false)
    ↕ window.postMessage
main.html (top frame)
    ↕ iframe.contentWindow.postMessage / parent.postMessage
tab1-orders.html (iframe)
```

- Tab1 chạy trong **IFRAME** của `main.html`
- Extension contentscript chỉ inject vào top frame (main.html)
- `main.html:663-743` có relay bridge forward messages 2 chiều
- Tab1 code dùng `parent.postMessage()` thay vì `window.postMessage()`

### 1.2 API Architecture

```
Tab1 Browser Code
    │
    ├─ Pancake API (qua Cloudflare Worker proxy)
    │   ├─ User API v1: /api/pancake/{endpoint}?access_token=JWT
    │   ├─ Official API v1: /api/pancake-official/{endpoint}?page_access_token=
    │   └─ Official API v2: /api/pancake-official-v2/{endpoint}?page_access_token=
    │
    ├─ Extension Bypass (qua parent.postMessage relay)
    │   └─ REPLY_INBOX_PHOTO → contentscript → background.js → business.facebook.com
    │
    └─ Pancake WebSocket (qua Cloudflare Worker proxy)
        └─ wss://chatomni-proxy.nhijudyshop.workers.dev/ws/pancake
```

**KHÔNG CÒN Facebook Graph API** — đã xóa hoàn toàn.

---

## 2. Extension Bypass 24h

### 2.1 Module: `tab1-extension-bridge.js`

File: `orders-report/js/tab1/tab1-extension-bridge.js`

Module dùng **standalone functions** (không phải object):

```javascript
// Global state
window.pancakeExtension = { connected: false, lastEvents: [] };
window._globalIdCache = {};  // Cache globalUserId (tránh resolve lại)

// Core functions (exposed globally)
window.sendViaExtension(text, conv)     // Gửi tin nhắn qua Extension
window.buildConvData(pageId, psid)      // Build conv object từ current state
window.initExtensionPages(pageIds)      // PREINITIALIZE_PAGES

// Internal
_postToExtension(data)                  // parent.postMessage() relay
```

### 2.2 Cách Extension hoạt động

```
Tab1 (iframe)
    │ parent.postMessage()
    ▼
main.html relay bridge (lines 663-743)
    │ contentWindow.postMessage() / window.postMessage()
    ▼
Extension contentscript.js
    │ chrome.runtime.sendMessage()
    ▼
Extension background.js (Service Worker)
    │ fetch()
    ▼
business.facebook.com/messaging/send/
```

**Giao thức**: `window.postMessage()` / `parent.postMessage()` với các message types:

| Message Type | Hướng | Mô tả |
|-------------|-------|--------|
| `EXTENSION_LOADED` | Extension → Page | Extension đã sẵn sàng |
| `PREINITIALIZE_PAGES` | Page → Extension | Đăng ký page IDs cần handle |
| `REPLY_INBOX_PHOTO` | Page → Extension | Gửi tin nhắn bypass 24h |
| `GET_GLOBAL_ID_FOR_CONV` | Page → Extension | Lấy globalUserId từ thread_id |
| `GLOBAL_ID_FOR_CONV_RESULT` | Extension → Page | Kết quả globalUserId |
| `EXT_BRIDGE_PROBE` | iframe → main.html | Kiểm tra extension đã connected chưa |
| `EXT_BRIDGE_PROBE_RESPONSE` | main.html → iframe | Trả lời probe |

### 2.3 Probe Mechanism (iframe-specific)

Tab1 chạy trong iframe nên không thể detect EXTENSION_LOADED trực tiếp. Dùng probe:

```javascript
// Tab1 gửi probe 3 lần: 0s, 2s, 5s
if (window.parent !== window) {
    window.parent.postMessage({ type: 'EXT_BRIDGE_PROBE' }, '*');
    setTimeout(() => parent.postMessage({ type: 'EXT_BRIDGE_PROBE' }, '*'), 2000);
    setTimeout(() => parent.postMessage({ type: 'EXT_BRIDGE_PROBE' }, '*'), 5000);
}

// main.html relay bridge trả EXT_BRIDGE_PROBE_RESPONSE { connected: true/false }
```

### 2.4 REPLY_INBOX_PHOTO Payload

```javascript
_postToExtension({
    type: 'REPLY_INBOX_PHOTO',
    pageId: '117267091364524',           // Facebook Page ID
    globalUserId: 'global_user_id',      // Global Facebook User ID (NOT PSID!)
    message: 'Xin chào!',               // Nội dung tin nhắn
    accessToken: 'pancake_jwt_token',    // Pancake JWT (NOT Facebook token!)
    isBusiness: false,                   // PHẢI là false
    threadId: psid,                      // PSID (dùng làm thread identifier)
    convId: 't_' + psid,                // Conversation ID format
    customerName: 'Nguyễn Văn A',
    conversationUpdatedTime: 1711000000000,
    attachmentType: 'SEND_TEXT_ONLY',
    platform: 'facebook',
    taskId: Date.now(),                  // Unique task ID for response matching
    from: 'WEBPAGE'
});
```

**Lưu ý quan trọng**:
- `isBusiness: false` — Bắt buộc, nếu `true` extension sẽ gửi sai endpoint
- `accessToken` — Là Pancake JWT, KHÔNG phải Facebook Page Token
- `globalUserId` — Là Global Facebook User ID, KHÔNG phải PSID (Page-Scoped ID)

---

## 3. Fallback Chain khi gửi tin nhắn

### 3.1 INBOX Message — `_sendInbox()`

File: `orders-report/js/tab1/tab1-chat-messages.js`

```
Pancake API (action: 'reply_inbox', page_access_token)
  ├─ Thành công → Done (optimistic UI đã update)
  └─ Lỗi bất kỳ
      │
      ├─ Extension connected? → buildConvData() → sendViaExtension()
      │   ├─ Thành công → Toast "Đã gửi qua Extension (bypass 24h)"
      │   └─ Thất bại → throw error
      │
      └─ Extension không connected → throw error
          └─ UI: Toast lỗi (24h / user unavailable / generic)
```

### 3.2 COMMENT Message — `_sendComment()`

**Mode reply_comment:**
```
reply_comment (action: 'reply_comment', message_id)
  ├─ Thành công → Done
  └─ Lỗi → Fallback: private_replies
      ├─ Thành công → Toast "Bình luận thất bại, đã gửi nhắn riêng"
      └─ Lỗi → Fallback: Extension Bypass
          ├─ Thành công → Toast "Đã gửi qua Extension"
          └─ Thất bại → throw error
```

**Mode private_replies:**
```
private_replies (action: 'private_replies', post_id, from_id, message_id)
  ├─ Thành công → Toast "Đã nhắn riêng"
  └─ Lỗi → Fallback: reply_inbox
      ├─ Thành công → Toast "Đã gửi qua Messenger"
      └─ Lỗi → Fallback: Extension Bypass
          ├─ Thành công → Done
          └─ Thất bại → throw error
```

### 3.3 Bulk Send — `bulkSendTemplate()`

File: `orders-report/js/chat/message-template-manager.js`

```
Cho mỗi order trong batch (chunk 10, parallel):
  ├─ viaComment = false:
  │   └─ _sendAsInbox() → pdm.sendMessage(reply_inbox)
  │       └─ Lỗi → sendViaExtension() fallback
  │
  └─ viaComment = true:
      └─ _sendAsComment() → pdm.sendMessage(reply_comment)

PancakeRequestQueue: bulk mode (6 concurrent, 200ms interval)
```

---

## 4. Cách lấy globalUserId

### 4.1 Tại sao cần globalUserId?

Extension cần **Global Facebook User ID** (không phải PSID) để gửi tin nhắn qua `business.facebook.com`. PSID là Page-Scoped ID, chỉ unique trong 1 page.

### 4.2 Nguồn dữ liệu: Conversation Data Flow

Khi mở chat modal, dữ liệu conversation được load qua 2 API calls:

```
Step 1: _findAndLoadConversation()
  │ API: GET /api/v1/pages/{pageId}/customers/{fbId}/conversations
  │ Trả về: conversation object với các field TOP-LEVEL:
  │   ├─ thread_id        ← Facebook thread ID
  │   ├─ page_customer.global_id  ← Global Facebook User ID
  │   ├─ customers[]      ← Danh sách customers
  │   └─ type, id, page_id, updated_at, ...
  │
  └─ Lưu vào: window.currentConversationData = conv

Step 2: _loadMessages()
  │ API: GET /api/v1/pages/{pageId}/conversations/{convId}/messages
  │ Trả về: { conversation, messages, customers, post, activities }
  │ conversation ở đây có thể KHÔNG có thread_id hoặc page_customer
  │
  └─ MERGE (không overwrite): window.currentConversationData._raw = result.conversation
     ├─ Object.assign(existingData._raw, rc)
     ├─ Preserve thread_id từ Step 1 nếu Step 2 không có
     └─ Preserve page_customer.global_id từ Step 1 nếu Step 2 không có
```

**QUAN TRỌNG**: `_loadMessages()` dùng `Object.assign()` để MERGE, không overwrite. Đây là fix quan trọng — trước đây overwrite `_raw` làm mất `thread_id` và `page_customer.global_id`.

### 4.3 buildConvData() — Tổng hợp dữ liệu

`buildConvData(pageId, psid)` tổng hợp từ nhiều nguồn:

```javascript
// Source 1: window.currentConversationData._raw (merged từ messages API)
const rawFromMerge = storedData._raw || {};

// Source 2: Top-level storedData (original conversation từ lookup API)
//   → thread_id, page_customer.global_id có thể ở TOP level
if (!rawFromMerge.thread_id && storedData.thread_id) {
    rawFromMerge.thread_id = storedData.thread_id;
}
if (!rawFromMerge.page_customer?.global_id && storedData.page_customer?.global_id) {
    rawFromMerge.page_customer.global_id = storedData.page_customer.global_id;
}

// Source 3: pancakeDataManager cache (inboxMapByPSID)
//   → Merge từ cached conversation: thread_id, page_customer.global_id, customers
```

### 4.4 sendViaExtension() — 4-Step Resolve Chain

```
Step 1: Cache (window._globalIdCache[cacheKey])
  └─ Hit → return cached value

Step 2: page_customer.global_id (từ conv._raw)
  └─ Có → cache + return

Step 2b: conv._messagesData.customers[0].global_id
  └─ Có → cache + return

Step 2c: conv.customers[0].global_id
  └─ Có → cache + return

Step 3: GET_GLOBAL_ID_FOR_CONV via Extension
  └─ Cần conv._raw.thread_id (Facebook thread ID)
  └─ Extension gọi Facebook API → return globalUserId
  └─ Timeout: 60 giây

→ Nếu tất cả fail → throw Error('Không tìm được Global Facebook ID')
```

### 4.5 So sánh với Inbox

| Aspect | Inbox | Tab1 |
|--------|-------|------|
| Data flow | `loadMessages()` MERGE `result.conversation` vào existing conv | `_loadMessages()` MERGE `_raw` + preserve top-level fields |
| postMessage | `window.postMessage()` (same frame) | `parent.postMessage()` (iframe → parent relay) |
| buildConvData | Inline trong `_sendViaExtension()` | Standalone `buildConvData()` function |
| globalId cache | `_globalIdCache` scoped | `window._globalIdCache` global |
| Probe | Không cần (same frame) | 3 lần probe (0s, 2s, 5s) |

---

## 5. Token Management

### 5.1 Các loại Token

| Token | Nguồn | Dùng cho |
|-------|-------|----------|
| **Pancake JWT** (`access_token`) | Pancake login | User API v1, Extension REPLY_INBOX_PHOTO |
| **Pancake page_access_token** | Generate từ JWT | Official API v1/v2 (send message, upload, etc.) |
| **Account Token** (multi-account) | Firestore | Fallback khi active account không access page |

### 5.2 Token Management Flow

```javascript
// pancakeTokenManager (shared module)
window.pancakeTokenManager.currentToken       // Pancake JWT
window.pancakeTokenManager.accountPages       // { pageId: { page_access_token, ... } }

// pancakeDataManager
pdm.getPageAccessToken(pageId)               // Returns page_access_token for API calls
```

### 5.3 Worker Proxy Endpoints

Base URL: `https://chatomni-proxy.nhijudyshop.workers.dev`

| Route | Target | Auth |
|-------|--------|------|
| `/api/pancake/{endpoint}` | pages.fm/api/v1 | `access_token=JWT` |
| `/api/pancake-official/{endpoint}` | pages.fm/api/public_api/v1 | `page_access_token=` |
| `/api/pancake-official-v2/{endpoint}` | pages.fm/api/public_api/v2 | `page_access_token=` |
| `/ws/pancake` | Pancake WebSocket proxy | In URL params |

---

## 6. Realtime Messaging

### 6.1 Kiến trúc

```
Pancake WebSocket Server
    │ Phoenix Protocol v2.0.0
    ▼
PancakePhoenixSocket (realtime-manager.js)
    │ Channels: 'users:{userId}', 'multiple_pages:{userId}'
    │ Heartbeat: 30s interval, 10s timeout
    │ Reconnect: exponential backoff 2s → 60s max, 10 attempts
    ▼
RealtimeManager
    │ CustomEvent dispatch
    ├──► tab1-chat-realtime.js (chat modal messages)
    │    ├─ handleNewMessage() → append + re-render
    │    └─ handleConversationUpdate() → update metadata + mark read
    └──► tab1-encoding.js (table cell updates, badges)
```

### 6.2 Exponential Backoff

```
Attempt 1:  2s delay
Attempt 2:  4s delay
Attempt 3:  8s delay
Attempt 4:  16s delay
Attempt 5:  32s delay
Attempt 6-10: 60s delay (max)
Attempt 11: STOP → dispatch 'realtimeConnectionLost'
```

### 6.3 Events

| Event | Khi nào | Handler |
|-------|---------|---------|
| `pages:new_message` | Tin nhắn mới | `handleNewMessage()` — append to chat |
| `pages:update_conversation` | Conversation thay đổi | `handleConversationUpdate()` — update metadata |

---

## 7. Cấu trúc File

### 7.1 Chat Modules (Load order)

```
orders-report/tab1-orders.html
  │
  ├─ js/managers/pancake-data-manager.js   ← Pancake API client (request queue, endpoints)
  ├─ js/tab1/tab1-extension-bridge.js      ← Extension bypass (iframe relay)
  ├─ js/managers/realtime-manager.js       ← WebSocket + polling fallback
  │
  ├─ js/tab1/tab1-chat-core.js            ← Modal lifecycle, state, conversation finding
  ├─ js/tab1/tab1-chat-messages.js        ← Render messages, send with fallback chain
  ├─ js/tab1/tab1-chat-images.js          ← Image upload, paste, preview
  ├─ js/tab1/tab1-chat-realtime.js        ← Realtime event handlers for chat
  │
  ├─ js/chat/message-template-manager.js   ← Bulk send templates, modal UI
  ├─ js/chat/chat-products-ui.js           ← Product search in chat right panel
  └─ js/chat/chat-products-actions.js      ← Product actions (add to order, etc.)
```

### 7.2 Shared Modules (không rebuild)

```
shared/js/pancake-token-manager.js   ← JWT + page_access_token management
shared/js/quick-reply-manager.js     ← Quick reply templates (Firebase + IndexedDB)
shared/js/pancake-settings.js        ← Pancake settings
js/utils/image-compressor.js         ← Image compression
js/utils/firebase-image-cache.js     ← Firebase image caching
```

### 7.3 Key Global State (tab1-chat-core.js)

```javascript
window.currentConversationId     // Pancake conversation ID
window.currentConversationType   // 'INBOX' | 'COMMENT'
window.currentChatChannelId      // Facebook Page ID
window.currentChatPSID           // Customer PSID
window.currentCustomerName       // Customer name
window.currentConversationData   // Full conversation object (merged)
window.allChatMessages           // Array of parsed message objects
window.currentChatCursor         // Pagination cursor
window.currentReplyMessage       // Reply-to context {id, text, sender}
window.currentReplyType          // 'reply_comment' | 'private_replies'
window.isSendingMessage          // Lock flag
```

---

## 8. Debug & Troubleshooting

### 8.1 Extension Bypass không hoạt động

```javascript
// Kiểm tra trạng thái
console.log('Connected:', window.pancakeExtension?.connected);
console.log('Page IDs:', window._extensionPageIds);
console.log('GlobalId cache:', window._globalIdCache);

// Kiểm tra Extension loaded — search console "[Tab1-ExtBridge]" hoặc "[EXT-EVENT]"

// Test buildConvData
const conv = window.buildConvData('PAGE_ID', 'PSID');
console.log('thread_id:', conv._raw?.thread_id);
console.log('global_id:', conv._raw?.page_customer?.global_id);
console.log('customers:', conv.customers);
```

**Nguyên nhân phổ biến**:
1. Extension chưa cài → `pancakeExtension.connected: false`
2. Không tìm được `globalUserId`:
   - Kiểm tra `page_customer.global_id` trong conversation data
   - Kiểm tra `thread_id` có tồn tại không (cần cho GET_GLOBAL_ID_FOR_CONV)
   - Kiểm tra `_loadMessages()` có merge đúng không (xem `_raw.thread_id`)
3. `isBusiness: true` → Extension gửi sai endpoint (phải là `false`)
4. Token hết hạn → check `pancakeTokenManager.currentToken`
5. Relay bridge không hoạt động → check main.html console cho errors

### 8.2 Realtime không nhận tin nhắn

```javascript
// Kiểm tra WebSocket
console.log('WS Connected:', window.realtimeManager?.isConnected);
console.log('Reconnect attempts:', window.realtimeManager?.reconnectAttempts);
console.log('Joined channels:', window.realtimeManager?.socket?.joinedChannels);

// Force reconnect
window.realtimeManager?.connect();
```

### 8.3 Log Prefixes

| Prefix | Module |
|--------|--------|
| `[Tab1-ExtBridge]` | tab1-extension-bridge.js |
| `[EXT-EVENT]` | tab1-extension-bridge.js (event listener) |
| `[EXT-SEND]` | tab1-extension-bridge.js (sendViaExtension + buildConvData) |
| `[Chat-Core]` | tab1-chat-core.js |
| `[Chat-Msg]` | tab1-chat-messages.js |
| `[Chat-Img]` | tab1-chat-images.js |
| `[Chat-RT]` | tab1-chat-realtime.js |
| `[PDM]` | pancake-data-manager.js |
| `[PHOENIX]` | realtime-manager.js (WebSocket) |
| `[Realtime]` | realtime-manager.js (general) |
| `[TemplateMgr]` | message-template-manager.js |
