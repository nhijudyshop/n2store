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

### Vấn đề: Facebook PSID là Page-Scoped

**Facebook PSID (fb_id) khác nhau cho mỗi page!**

Cùng một khách hàng nhưng có fb_id khác nhau trên mỗi page:

| Page | fb_id | Customer UUID |
|------|-------|---------------|
| Nhi Judy House (117267091364524) | `24948162744877764` | `658ffee5-09b2-...` |
| NhiJudy Store (270136663390370) | `25717004554573583` | `a4396516-b395-...` |

**Cả fb_id và Customer UUID đều khác nhau giữa các page!**

### Giải pháp: Search by Customer Name

Khi switch page trong chat modal, không thể dùng fb_id cũ. Giải pháp:

```
1. Mở modal → Lưu tên khách: window.currentCustomerName = "Huỳnh Thành Đạt"

2. User chọn page khác từ dropdown
   ↓
3. searchConversations("Huỳnh Thành Đạt", [newPageId])
   ↓
4. Từ kết quả search → lấy fb_id MỚI trên page mới
   ↓
5. fetchConversationsByCustomerFbId(newPageId, newFbId)
   ↓
6. Load messages từ conversation tương ứng
```

### API Flow

```javascript
// STEP 1: Search by name on new page
const searchResult = await pancakeDataManager.searchConversations(customerName, [pageId]);

// STEP 2: Extract new fb_id from search result
const newFbId = searchResult.conversations[0].customers[0].fb_id;

// STEP 3: Fetch conversations with new fb_id
const result = await pancakeDataManager.fetchConversationsByCustomerFbId(pageId, newFbId);

// STEP 4: Load messages
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
| Search | `POST /conversations/search?q={name}` | Tìm conversations theo tên |
| Get by fb_id | `GET /conversations/customer/{fb_id}?pages[{pageId}]=0` | Lấy conversations của customer trên page |
| Messages | `GET /pages/{pageId}/conversations/{convId}/messages` | Lấy tin nhắn |

### Implementation

**File:** `orders-report/js/tab1/tab1-chat.js`

| Function | Line | Mô tả |
|----------|------|-------|
| `openChatModal()` | 1467 | Lưu `window.currentCustomerName` |
| `onChatPageChanged()` | 851 | Handle page dropdown change |
| `reloadChatForSelectedPage()` | 880 | Search by name → get fb_id → load messages |

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
