# Bulk Facebook Messaging - Kiến trúc & Luồng xử lý

> Module gửi tin nhắn Facebook hàng loạt cho đơn hàng trong `orders-report`.

## Mục lục

- [Tổng quan](#tổng-quan)
- [Files liên quan](#files-liên-quan)
- [Template System](#template-system)
- [Luồng gửi tin nhắn](#luồng-gửi-tin-nhắn)
- [3-Tier Fallback](#3-tier-fallback-system)
- [Extension Bridge (iframe)](#extension-bridge-iframe-architecture)
- [Global ID Resolution (5 bước)](#global-id-resolution-5-bước)
- [Campaign Results & History](#campaign-results--history)
- [CSS Performance](#css-performance-optimizations)
- [Data Structures](#data-structures)
- [Firestore Collections](#firestore-collections)
- [Error Detection](#error-detection)
- [Script Load Order](#script-load-order)

---

## Tổng quan

Cho phép chọn nhiều đơn hàng → chọn template tin nhắn → gửi hàng loạt qua Facebook Messenger.

```
User chọn đơn hàng → Mở modal → Chọn template → Gửi hàng loạt
                                                      │
                      ┌───────────────────────────────┘
                      ▼
               Pancake API  ──fail──▶  Extension Bypass  ──fail──▶  Facebook Tag
               (Official)              (24h workaround)             (Message Tag)
```

Khi Pancake API trả lỗi 24h policy (`e_code: 10`), tự động fallback sang Pancake Extension V2 bypass qua `business.facebook.com/messaging/send/`. Nếu extension cũng fail thì fallback cuối là Facebook Message Tag API.

---

## Files liên quan

| File | Vai trò |
|------|---------|
| `orders-report/js/chat/message-template-manager.js` | Core: template CRUD, send engine, campaign tracking |
| `orders-report/js/tab1/tab1-extension-bridge.js` | Extension relay qua iframe, `sendViaExtension()`, `buildConvData()` |
| `orders-report/js/managers/pancake-data-manager.js` | Pancake API client: conversations, messages, sendMessage |
| `orders-report/css/message-template-modal.css` | Modal UI + CSS perf optimizations |
| `orders-report/main.html` | Extension relay bridge (top frame ↔ iframe) |
| `orders-report/tab1-orders.html` | Load scripts, iframe container |

---

## Template System

### Storage

- **Firestore**: collection `message_templates`, ordered by `order` field
- **LocalStorage cache**: key `message_templates_cache`
- Nếu chưa có template nào, tự seed 4 template mặc định

### Cấu trúc template

```javascript
{
  Name: "Chốt đơn",
  Content: "Chào {customerName}, đơn hàng {order.code} ...",
  TypeId: "MESSENGER",
  active: true,
  order: 1,
  createdAt: Firestore.serverTimestamp()
}
```

### Placeholders

| Placeholder | Giá trị |
|-------------|---------|
| `{customerName}` | Tên khách hàng |
| `{orderId}` | Mã đơn hàng |
| `{phone}` | Số điện thoại |
| `{total}` | Tổng tiền (formatted VND) |
| `{products}` | Danh sách sản phẩm |
| `{partner.name}` | Tên khách (fallback "Khách hàng") |
| `{partner.phone}` | SĐT khách |
| `{partner.address}` | Địa chỉ + SĐT |
| `{order.code}` | Mã đơn |
| `{order.total}` | Tổng tiền |
| `{order.address}` | Địa chỉ giao hàng |
| `{order.details}` | Chi tiết đơn (sản phẩm + giảm giá + phí ship + tổng tiền) |

`{order.details}` tự tính phí ship theo khu vực:
- Nội thành: 30,000đ (free nếu > 1,500,000đ)
- Tỉnh: 40,000đ (free nếu > 3,000,000đ)

---

## Luồng gửi tin nhắn

```
_handleSend()
  │
  ├─ 1. Validate template
  ├─ 2. Load orders từ _modalOrders
  ├─ 3. Get accounts từ pancakeTokenManager
  │
  ├─ 4. _prefetchPageAccessTokens(orders)
  │     └─ Load page_access_token cho tất cả pages
  │
  ├─ 5. _distributeOrdersToAccounts(orders, accounts)
  │     └─ Round-robin + page-aware distribution
  │
  ├─ 6. Tạo parallel workers (1 per account)
  │     └─ _processAccountQueue(orders, account, template, delay)
  │         └─ Sequential per order:
  │             ├─ _processSingleOrder(order, template, account)
  │             ├─ markOrderSent() hoặc markOrderFailed()
  │             ├─ Update progress bar
  │             └─ Delay X giây (default 1s)
  │
  ├─ 7. Promise.all(workers)
  ├─ 8. _saveCampaignResults()
  └─ 9. Show completion notification
```

### _processSingleOrder chi tiết

```
_processSingleOrder(order, template, account)
  │
  ├─ Prepare message
  │   ├─ Get full order data nếu template dùng {order.details}
  │   ├─ _replacePlaceholders(content, orderData)
  │   ├─ Append signature: "\nNv. [DisplayName]"
  │   └─ _splitMessageIntoParts() nếu > 2000 ký tự
  │
  ├─ Find conversation
  │   ├─ Lookup pdm.inboxMapByPSID.get(psid)
  │   └─ Nếu miss → fetchConversationsByCustomerFbId(pageId, psid)
  │
  └─ Send (3-tier fallback, xem section dưới)
```

---

## 3-Tier Fallback System

Mỗi phần tin nhắn (part) được gửi theo thứ tự fallback:

### Tier 1: Pancake Official API

```javascript
pdm.sendMessage(pageId, conversationId, {
  action: 'reply_inbox',   // KHÔNG phải 'type'
  message: messagePart
})
```

- Endpoint: `POST /pages/{pageId}/conversations/{convId}/messages`
- Dùng `page_access_token`
- Response format: `{ success, message, e_code, e_subcode }` (flat, không nested)
- Nếu thành công → done, next part
- Nếu lỗi 24h → fallback tier 2

### Tier 2: Extension Bypass (24h workaround)

Khi Pancake API trả lỗi 24h policy, extension bypass gửi qua `business.facebook.com/messaging/send/` thay vì Graph API → không bị giới hạn 24h.

**Bước 1**: Lazy fetch messages API để lấy `thread_id` + `page_customer.global_id`

```javascript
const msgData = await pdm.fetchMessages(pageId, conv.id);
// Messages endpoint trả về thread_id, page_customer.global_id
// mà conversations LIST endpoint KHÔNG có
```

**Bước 2**: Build conv data trực tiếp (không dùng `buildConvData` vì global state không set trong bulk mode)

```javascript
_extConvData = {
  pageId, psid, conversationId: conv.id,
  _raw: { thread_id, page_customer: { global_id }, from_psid },
  customers: msgData.customers,
  _messagesData: { customers: msgData.customers },
  updated_at, customerName, type, from
}
```

**Bước 3**: `sendViaExtension(part, _extConvData)` → xem [Global ID Resolution](#global-id-resolution-5-bước)

### Tier 3: Facebook Message Tag

```javascript
_sendViaFacebookTag(order, part, channelId, psid)
// POST tới Facebook Graph API với message tag
// Cần page_access_token (Facebook token, không phải Pancake)
// Tag types: CONFIRMED_EVENT_UPDATE, POST_PURCHASE_UPDATE, ACCOUNT_UPDATE
```

---

## Extension Bridge (iframe Architecture)

### Vấn đề

`tab1-orders.html` chạy trong iframe của `main.html`. Extension contentscript chỉ inject vào top frame (main.html), KHÔNG vào iframe.

### Giải pháp: Relay Bridge

```
Pancake Extension (contentscript)
        ↕ window.postMessage
main.html (relay bridge)
        ↕ iframe.contentWindow.postMessage / parent.postMessage
tab1-orders.html (tab1-extension-bridge.js)
```

#### main.html relay (lines 666-743):

```
Extension → main.html:
  EXTENSION_LOADED, REPLY_INBOX_PHOTO_SUCCESS/FAILURE,
  GET_GLOBAL_ID_FOR_CONV_SUCCESS/FAILURE
  → Forward tới ordersFrame.contentWindow

iframe → main.html:
  PREINITIALIZE_PAGES, REPLY_INBOX_PHOTO,
  GET_GLOBAL_ID_FOR_CONV, EXT_BRIDGE_PROBE
  → Forward tới extension (window.postMessage)
```

#### Connection detection:

- `EXT_BRIDGE_PROBE` / `EXT_BRIDGE_PROBE_RESPONSE` - iframe probe parent để check extension đã connect chưa
- `EXTENSION_LOADED` - extension vừa load xong
- `PREINITIALIZE_PAGES` - gửi danh sách pageIds cho extension khởi tạo

---

## Global ID Resolution (5 bước)

Extension cần `globalUserId` (Global Facebook ID) để gửi tin nhắn bypass 24h. Đây là ID global, khác với PSID (page-scoped).

```
sendViaExtension(text, conv)
  │
  ├─ Step 1: Cache → window._globalIdCache[cacheKey]
  │
  ├─ Step 2a: conv._raw.page_customer.global_id
  │            (từ messages API response)
  │
  ├─ Step 2b: conv._messagesData.customers[0].global_id
  │
  ├─ Step 2c: conv.customers[0].global_id
  │
  └─ Step 3: GET_GLOBAL_ID_FOR_CONV (extension command)
             Yêu cầu: thread_id (Facebook thread ID, KHÔNG phải PSID)
             Extension query Facebook API để resolve global_id
             Timeout: 60s
```

### REPLY_INBOX_PHOTO payload

```javascript
{
  type: 'REPLY_INBOX_PHOTO',
  pageId: conv.pageId,
  accessToken: pancakeTokenManager.currentToken,  // Pancake JWT
  message: text,
  attachmentType: 'SEND_TEXT_ONLY',
  globalUserId: resolved_globalUserId,    // ← CRITICAL
  platform: 'facebook',
  threadId: psid,
  convId: 't_' + psid,
  customerName: conv.customerName,
  conversationUpdatedTime: timestamp,
  isBusiness: false,                      // ← MUST be false
  taskId: Date.now(),
  from: 'WEBPAGE'
}
```

> **Quan trọng**: `isBusiness` phải là `false`. Extension gửi qua `business.facebook.com` nhưng flag này control routing nội bộ.

---

## Campaign Results & History

### Lưu kết quả campaign

**Firestore**: collection `message_campaigns`

```javascript
{
  templateName: "Chốt đơn",
  templateContent: "...",
  totalOrders: 10,
  successCount: 8,
  errorCount: 2,
  successOrders: [{ Id, code, customerName, account, usedTag }],
  errorOrders: [{ orderId, code, customerName, error, is24HourError }],
  accountsUsed: ["Account 1"],
  delay: 1,
  createdAt: serverTimestamp(),
  expireAt: Date(+7 ngày)
}
```

### Order Status Tracking (in-memory + localStorage)

| Key | Nội dung | TTL |
|-----|----------|-----|
| `sent_message_orders` | Map: orderId → `{ viaComment, timestamp }` | 24h |
| `failed_message_orders` | Map: orderId → `{ timestamp, error }` | 7 ngày |
| `messageSendHistory` | Array campaign history | Max 100 entries |

### Retry failed orders

Đơn lỗi có thể gửi lại qua Comment (thay vì Inbox):

```javascript
_sendFailedOrdersViaComment(campaignIndex)
// Gửi qua commentMapByPSID thay vì inboxMapByPSID
// payload: { type: 'reply_comment', message }
```

---

## CSS Performance Optimizations

File: `message-template-modal.css`

| Optimization | Chi tiết |
|-------------|----------|
| **Không dùng `backdrop-filter`** | `blur()` force GPU re-composite toàn bộ background mỗi frame → dùng `rgba(0,0,0,0.5)` thay thế |
| **`will-change: transform`** | Trên `.message-modal` → promote lên compositor layer riêng |
| **`contain: content`** | Trên `.message-modal-body` → isolate scroll repaints |
| **Specific transitions** | Thay `transition: all 0.2s` bằng properties cụ thể (vd: `border-color 0.2s, box-shadow 0.2s`) |
| **Grid layout** | `grid-template-columns: repeat(2, 1fr)` cho template list |
| **Custom scrollbar** | Lightweight 8px scrollbar |

---

## Data Structures

### Global Dependencies

```javascript
// Core
window.db                        // Firestore instance
window.authManager               // Auth (getUserInfo().displayName cho signature)
window.pancakeDataManager        // PDM: conversations, messages, send
window.pancakeTokenManager       // Token manager: page tokens, accounts

// Extension
window.sendViaExtension          // Function: gửi qua extension
window.buildConvData             // Function: build conv object (cho single chat mode)
window.pancakeExtension          // { connected: bool, lastEvents: [] }
window._globalIdCache            // Cache: cacheKey → globalUserId

// Data
window.OrderStore                // Order data cache
window.selectedOrderIds          // Set of checked order IDs

// Entry point
window.openMessageTemplateModal(orders)  // Mở modal với danh sách đơn
```

### Conversation Maps (PancakeDataManager)

```javascript
pdm.inboxMapByPSID     // Map<string, ConversationObject>  (PSID → conv)
pdm.inboxMapByFBID     // Map<string, ConversationObject>  (FB ID → conv)
pdm.commentMapByPSID   // Map<string, ConversationObject>  (PSID → comment conv)
```

### Conversation Object (từ Pancake API)

```javascript
{
  id: "117267091364524_24246642564950388",  // pageId_psid
  type: "INBOX",
  from_psid: "24246642564950388",
  from: { id: "24246642564950388", name: "Nguyễn Văn A" },
  updated_at: "2026-03-30T...",
  page_customer: { global_id: "..." },     // Có thể null từ LIST endpoint
  thread_id: "...",                         // Có thể null từ LIST endpoint
  // ... other fields
}
```

> **Lưu ý**: `thread_id` và `page_customer.global_id` thường chỉ có trong response của **messages endpoint**, không phải conversations LIST endpoint.

---

## Firestore Collections

| Collection | Mục đích | TTL | Query |
|-----------|----------|-----|-------|
| `message_templates` | Template CRUD | None | `.orderBy('order', 'asc')` |
| `message_campaigns` | Kết quả campaign | 7 ngày (`expireAt`) | `.orderBy('createdAt', 'desc').limit(50)` |

---

## Error Detection

### 24h Policy Error

```javascript
// Pancake API trả flat object:
{ message: "(#10) Tin nhắn này được gửi ngoài khoảng thời gian cho phép...",
  success: false, e_code: 10, e_subcode: 2018278 }

// Detection:
result.e_code === 10 ||
result.e_subcode === 2018278 ||
message.includes('khoảng thời gian cho phép')
```

### User Unavailable Error

```javascript
result.error.code === 551 || message.includes('not available')
```

---

## Script Load Order

Trong `tab1-orders.html`:

```
1. firebase-config.js          → window.db
2. pancake-data-manager.js     → window.pancakeDataManager
3. message-template-manager.js → window.openMessageTemplateModal()
4. tab1-extension-bridge.js    → window.sendViaExtension(), window.buildConvData()
```

> Extension bridge load SAU message-template-manager, nhưng extension functions được gọi lazily (chỉ khi cần fallback) nên không ảnh hưởng.

---

## Lịch sử thay đổi

| Ngày | Thay đổi |
|------|----------|
| 2026-03-31 | CSS perf: remove backdrop-filter, add will-change/contain, specific transitions |
| 2026-03-31 | Fix `getCurrentUser()` → `getUserInfo()` (3 chỗ) |
| 2026-03-31 | Fix `type: 'reply_inbox'` → `action: 'reply_inbox'` |
| 2026-03-31 | Fix error parsing: flat `result.message` thay vì nested `result.error.message` |
| 2026-03-31 | Fix extension bypass: fetch messages API cho thread_id/global_id, build conv data trực tiếp thay vì dùng buildConvData (global state không set trong bulk mode) |
