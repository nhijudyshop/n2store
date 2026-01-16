# SHARED_PANCAKE - Tích Hợp Pancake.vn API

> Modules quản lý Pancake API integration: JWT tokens, messages, conversations, realtime.

## Tổng Quan

| File | Giống 100% | Folders |
|------|------------|---------|
| `pancake-token-manager.js` | ✅ | orders-report, tpos-pancake |
| `pancake-data-manager.js` | ❌ | orders-report (86KB), tpos-pancake (125KB) |
| `realtime-manager.js` | ✅ | orders-report, tpos-pancake |

---

## PancakeTokenManager

### Purpose
Quản lý JWT tokens cho Pancake với multi-account support.

### Token Priority

```
1. In-memory cache (fastest)
2. localStorage (fast, no network)
3. Firebase (network required, backup)
4. Cookie (fallback)
```

### Key Methods

| Method | Mô tả |
|--------|-------|
| `getToken()` | Lấy token (theo priority order) |
| `setTokenManual(token)` | Set token thủ công từ UI |
| `getAllAccounts()` | Lấy tất cả accounts |
| `setActiveAccount(accountId)` | Chuyển account active |
| `deleteAccount(accountId)` | Xóa account |
| `getPageAccessToken(pageId)` | Lấy page access token |
| `decodeToken(token)` | Decode JWT payload |

### Storage Keys

| Key | Storage |
|-----|---------|
| `pancake_jwt_token` | localStorage |
| `pancake_page_access_tokens` | localStorage |
| `pancake_jwt_tokens/` | Firebase RTDB |

---

## PancakeDataManager

### Purpose
Tích hợp Pancake.vn API - messages, conversations, customers.

### Key Methods

| Method | Mô tả |
|--------|-------|
| `fetchPages(forceRefresh)` | Lấy danh sách pages |
| `fetchConversations(forceRefresh)` | Lấy conversations |
| `searchConversations(query, pageIds)` | Tìm kiếm |
| `fetchConversationsByCustomerFbId(pageId, fbId)` | Lấy theo FB ID |
| `getUnreadInfoForOrder(order)` | Số tin chưa đọc |
| `buildConversationMap()` | Build lookup maps |

### Conversation Maps

| Map | Description |
|-----|-------------|
| `inboxMapByPSID` | INBOX conversations by PSID |
| `inboxMapByFBID` | INBOX conversations by Facebook ID |
| `commentMapByPSID` | COMMENT conversations by PSID |
| `commentMapByFBID` | COMMENT conversations by Facebook ID |

---

## RealtimeManager

### Purpose
WebSocket connection cho Pancake realtime updates.

### Key Methods

| Method | Mô tả |
|--------|-------|
| `initialize()` | Khởi tạo WebSocket |
| `connect()` | Kết nối |
| `disconnect()` | Ngắt kết nối |
| `joinChannels()` | Join channels (pages, conversations) |
| `handleMessage(data)` | Xử lý message từ WS |
| `handleUpdateConversation(payload)` | Handle conversation update |
| `handleOrderTagsUpdate(payload)` | Handle tags update |

### Features
- Heartbeat ping
- Auto-reconnect
- Channel subscriptions

---

## Pancake API Reference

### Base URLs

| Server | URL |
|--------|-----|
| User's API | `https://pages.fm/api/v1` |
| Page's API v1 | `https://pages.fm/api/public_api/v1` |
| Page's API v2 | `https://pages.fm/api/public_api/v2` |

### Authentication

| Type | Parameter | Thời hạn |
|------|-----------|----------|
| User Access Token | `?access_token=` | 90 ngày |
| Page Access Token | `?page_access_token=` | Không hết hạn |

---

## Page Switching trong Chat Modal

### Giải pháp: Dùng cùng fb_id, đổi pages[pageId] filter

Customer `fb_id` (trong `customers[0].fb_id`) là **unique trong hệ thống Pancake** và dùng được cho tất cả pages.

Khi switch page, chỉ cần đổi `pages[pageId]` filter:

```
1. Mở modal → Lưu fb_id: window.currentCustomerFbId = customers[0].fb_id

2. User chọn page khác từ dropdown
   ↓
3. Gọi API với CÙNG fb_id, chỉ đổi pages[newPageId]=0
   GET /conversations/customer/{fb_id}?pages[{newPageId}]=0
   ↓
4. Load messages từ conversation tương ứng
```

### API Flow

```javascript
// Khi mở modal - lưu fb_id từ conversation data
window.currentCustomerFbId = inboxConv.customers?.[0]?.fb_id;

// Khi switch page - dùng CÙNG fb_id với page filter mới
const result = await pancakeDataManager.fetchConversationsByCustomerFbId(newPageId, customerFbId);
// API call: GET /conversations/customer/{fb_id}?pages[{newPageId}]=0

// Load messages
const response = await pancakeDataManager.fetchMessagesForConversation(
    pageId,
    conversationId,
    null,
    customerUUID
);
```

### Key APIs

| API | Endpoint | Mô tả |
|-----|----------|-------|
| Get by fb_id | `GET /conversations/customer/{fb_id}?pages[{pageId}]=0` | Lấy conversations của customer trên page |
| Messages | `GET /pages/{pageId}/conversations/{convId}/messages` | Lấy tin nhắn |

### Implementation

**File:** `orders-report/js/tab1/tab1-chat.js`

| Function | Line | Mô tả |
|----------|------|-------|
| `openChatModal()` | 1975-1980 | Lưu `window.currentCustomerFbId` |
| `onChatPageChanged()` | 851 | Handle page dropdown change |
| `reloadChatForSelectedPage()` | 887 | Dùng cùng fb_id, đổi pages[pageId] |

### Sync Dropdowns

Khi chuyển page view, "Gửi từ" dropdown cũng chuyển theo:

```javascript
// In onChatPageChanged():
const sendPageSelect = document.getElementById('chatSendPageSelect');
if (sendPageSelect) {
    sendPageSelect.value = pageId;
}
```

---

## Xem thêm

- [orders-report/PANCAKE_API_DOCUMENTATION.md](file:///Users/mac/Downloads/n2store/orders-report/PANCAKE_API_DOCUMENTATION.md) - Full API reference
- [tpos-pancake/PANCAKE_GUIDE.md](file:///Users/mac/Downloads/n2store/tpos-pancake/PANCAKE_GUIDE.md) - Hướng dẫn sử dụng
