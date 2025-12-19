# TPOS-Pancake Architecture Documentation

## Tổng Quan

TPOS-Pancake là ứng dụng chat tích hợp Pancake.vn API với giao diện 2 cột (TPOS + Pancake). Project sử dụng Vanilla JS, không framework.

---

## Cấu Trúc File

```
tpos-pancake/
├── index.html              # Main HTML - layout 2 cột
├── script.js               # UI Manager (column, resize, settings)
├── pancake-chat.js         # Chat UI Manager (126KB, 89 functions)
├── pancake-data-manager.js # Data Layer (103KB, 47 functions)
├── pancake-token-manager.js# Token Management (40KB, 34 functions)
├── realtime-manager.js     # WebSocket Realtime (17KB, 25 functions)
├── api-config.js           # API URLs & endpoints
├── auth.js                 # Authentication
├── cache.js                # Local caching
├── config.js               # Firebase config
├── notification-system.js  # Toast notifications
├── modern.css              # TPOS column styles
└── pancake-chat.css        # Pancake chat styles
```

---

## Core Classes

### 1. PancakeChatManager (`pancake-chat.js`)

**Chức năng:** Quản lý toàn bộ giao diện chat Pancake

```javascript
class PancakeChatManager {
    // State
    conversations: []          // Danh sách hội thoại
    activeConversation: null   // Hội thoại đang chọn
    messages: []               // Tin nhắn của conversation đang chọn
    pages: []                  // Danh sách Facebook Pages
    selectedPageId: null       // Page đang filter

    // Pagination
    hasMoreMessages: true
    hasMoreConversations: true
    messageCurrentCount: 0
}
```

**Nhóm Functions:**

| Nhóm | Functions | Mô tả |
|------|-----------|-------|
| **Initialize** | `initialize()`, `render()` | Khởi tạo UI và render layout |
| **Conversation List** | `renderConversationList()`, `renderConversationItem()`, `loadConversations()`, `loadMoreConversations()` | Hiển thị & load danh sách |
| **Chat Window** | `renderChatWindow()`, `renderMessages()`, `renderMessage()`, `loadMessages()`, `loadMoreMessages()` | Hiển thị chat & tin nhắn |
| **Search** | `performSearch()`, `clearSearch()` | Tìm kiếm hội thoại |
| **Page Selector** | `loadPages()`, `renderPageDropdown()`, `selectPage()`, `togglePageDropdown()` | Chọn Facebook Page |
| **Context Menu** | `showContextMenu()`, `hideContextMenu()`, `handleContextMenuAction()`, `showTagsSubmenu()` | Menu chuột phải |
| **Send Message** | `sendMessage()`, `handleImageSelect()`, `clearImagePreview()` | Gửi tin nhắn + ảnh |
| **Realtime** | `handleRealtimeConversationUpdate()`, `updateConversationInDOM()` | Cập nhật realtime |
| **Scroll** | `bindScrollEvents()`, `scrollToBottom()`, `updateScrollButtonBadge()` | Scroll & button cuộn |
| **Utilities** | `formatMessageTime()`, `formatDateTime()`, `escapeHtml()`, `parseMessageHtml()` | Format & escape |

---

### 2. PancakeDataManager (`pancake-data-manager.js`)

**Chức năng:** Data layer - Gọi API, cache, xử lý dữ liệu

```javascript
class PancakeDataManager {
    // State
    conversations: []
    pageIds: []
    lastFetchTime: null
    CACHE_DURATION: 60000  // 1 phút

    // Maps for fast lookup
    inboxMapByPSID: Map()
    inboxMapByFBID: Map()
    commentMapByPSID: Map()
    commentMapByFBID: Map()
}
```

**Nhóm Functions:**

| Nhóm | Functions | Mô tả |
|------|-----------|-------|
| **Token** | `getToken()`, `getHeaders()` | Lấy JWT token cho API calls |
| **Pages** | `fetchPages()`, `fetchPagesWithUnreadCount()`, `extractAndCachePageAccessTokens()` | Quản lý Facebook Pages |
| **Conversations** | `fetchConversations()`, `fetchMoreConversations()`, `searchConversations()`, `buildConversationMap()` | Load & search hội thoại |
| **Messages** | `fetchMessagesForConversation()`, `sendMessage()`, `uploadMedia()` | Load & gửi tin nhắn |
| **Read Status** | `markConversationAsRead()`, `markConversationAsUnread()`, `updateConversationReadStatus()` | Đánh dấu đọc/chưa đọc |
| **Tags** | `fetchTags()`, `addRemoveConversationTag()` | Quản lý nhãn |
| **Customer** | `addCustomerNote()`, `getUnreadInfoForOrder()` | Quản lý khách hàng |
| **Avatar** | `getAvatarUrl()` | URL avatar với fallback |

---

### 3. PancakeTokenManager (`pancake-token-manager.js`)

**Chức năng:** Quản lý JWT tokens & page_access_tokens

```javascript
class PancakeTokenManager {
    // State
    currentToken: null
    currentTokenExpiry: null
    accounts: {}              // Multiple Pancake accounts
    pageAccessTokens: {}      // Per-page tokens

    // Firebase refs
    firebaseRef: null
    accountsRef: null
    pageTokensRef: null
}
```

**Token Priority Order:**
1. In-memory cache (fastest)
2. localStorage (fast, no network)
3. Firebase (network required)
4. Cookie (fallback)

**Nhóm Functions:**

| Nhóm | Functions | Mô tả |
|------|-----------|-------|
| **JWT Token** | `getToken()`, `setTokenManual()`, `decodeToken()`, `isTokenExpired()` | Quản lý main JWT |
| **localStorage** | `saveTokenToLocalStorage()`, `getTokenFromLocalStorage()`, `clearTokenFromLocalStorage()` | Local storage cache |
| **Firebase** | `getTokenFromFirebase()`, `saveTokenToFirebase()`, `loadAccounts()` | Firebase backup |
| **Accounts** | `getAllAccounts()`, `setActiveAccount()`, `deleteAccount()` | Multiple accounts |
| **Page Tokens** | `getOrGeneratePageAccessToken()`, `savePageAccessTokensToLocalStorage()` | Per-page tokens (không hết hạn) |

---

### 4. RealtimeManager (`realtime-manager.js`)

**Chức năng:** WebSocket connection cho realtime updates

```javascript
class RealtimeManager {
    ws: null
    isConnected: false
    heartbeatInterval: null
    subscribedChannels: Set()
}
```

**WebSocket Protocol:** Phoenix (Pancake.vn sử dụng Elixir/Phoenix)

**Channel Format:** `page_conversation:{pageId}:{uid}`

**Nhóm Functions:**

| Nhóm | Functions | Mô tả |
|------|-----------|-------|
| **Connection** | `connect()`, `disconnect()`, `connectServerMode()`, `connectToProxyServer()` | Kết nối WebSocket |
| **Heartbeat** | `startHeartbeat()`, `stopHeartbeat()` | Keep-alive ping mỗi 30s |
| **Channels** | `joinChannels()` | Subscribe page channels |
| **Handlers** | `handleMessage()`, `handleUpdateConversation()`, `handleOrderTagsUpdate()` | Xử lý events |

---

### 5. API_CONFIG (`api-config.js`)

**Chức năng:** URL builder cho tất cả API endpoints

```javascript
const API_CONFIG = {
    WORKER_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    TPOS_ODATA: '{WORKER}/api/odata',
    PANCAKE: '{WORKER}/api/pancake',

    buildUrl: {
        tposOData(endpoint, params),        // TPOS API
        pancake(endpoint, params),           // Pancake qua proxy
        pancakeOfficial(endpoint, token),    // pages.fm Public API
        pancakeDirect(endpoint, pageId, jwt, token),  // 24h bypass
        facebookSend()                       // Facebook Send API
    }
}
```

---

## Data Flow

### 1. Khởi Tạo
```
index.html
    ↓ DOMContentLoaded
script.js → initializeColumnOrder(), initializeSettingsPanel()
    ↓
PancakeTokenManager.initialize() → Firebase + localStorage
    ↓
PancakeDataManager (auto)
    ↓
PancakeChatManager.initialize() → render() → loadConversations()
    ↓
RealtimeManager.initialize() → connect WebSocket
```

### 2. Load Conversations
```
PancakeChatManager.loadConversations()
    ↓
PancakeDataManager.fetchConversations()
    ↓ (check cache)
API_CONFIG.buildUrl.pancake('conversations', params)
    ↓
Cloudflare Worker Proxy → Pancake API
    ↓
Store to this.conversations → renderConversationList()
```

### 3. Load Messages
```
Click conversation item
    ↓
PancakeChatManager.selectConversation(convId)
    ↓
loadMessages(conv)
    ↓
PancakeDataManager.fetchMessagesForConversation(pageId, convId)
    ↓
API_CONFIG.buildUrl.pancakeOfficial('messages', pageAccessToken)
    ↓
renderMessages()
```

### 4. Send Message
```
User nhập tin nhắn + Enter
    ↓
PancakeChatManager.sendMessage()
    ↓ (if có selectedImage)
PancakeDataManager.uploadMedia(pageId, file) → content_id
    ↓
PancakeDataManager.sendMessage(pageId, convId, { text, content_ids })
    ↓
API_CONFIG.buildUrl.pancakeOfficial('messages', pageAccessToken)
    ↓
Update UI → renderMessages()
```

### 5. Realtime Update
```
WebSocket message "update_conversation"
    ↓
RealtimeManager.handleUpdateConversation(payload)
    ↓
PancakeChatManager.handleRealtimeConversationUpdate(conv)
    ↓
updateConversationInDOM(conv) // không reload toàn bộ
    ↓
Nếu đang xem conversation đó → fetchMessagesForConversation()
```

---

## API Endpoints (qua Cloudflare Proxy)

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/pancake/pages` | GET | List Facebook Pages |
| `/api/pancake/conversations` | GET | List conversations |
| `/api/pancake/conversations/search` | GET | Search by name/phone |
| `/api/pancake-official/pages/{id}/conversations/{convId}/messages` | GET | Get messages |
| `/api/pancake-official/pages/{id}/conversations/{convId}/messages` | POST | Send message |
| `/api/pancake-official/pages/{id}/conversations/{convId}/read` | POST | Mark read |
| `/api/pancake-official/pages/{id}/conversations/{convId}/unread` | POST | Mark unread |
| `/api/pancake-official/pages/{id}/conversations/{convId}/tags` | POST | Add/remove tag |
| `/api/pancake-official/pages/{id}/upload_contents` | POST | Upload image |
| `/api/pancake-official/pages/{id}/page_customers/{custId}/notes` | POST | Add note |

---

## Event Bindings

### PancakeChatManager.bindEvents()
- **Conversation click** → `selectConversation(convId)`
- **Conversation right-click** → `showContextMenu(x, y, convId, pageId)`
- **Search input** → debounce 500ms → `performSearch(query)`
- **Search Escape/clear** → `clearSearch()`
- **Page dropdown click** → `togglePageDropdown()`
- **Filter tabs** → `setFilterType(type)`
- **Scroll conversations** → near bottom → `loadMoreConversations()`
- **Scroll messages** → near top → `loadMoreMessages()`

### PancakeChatManager.bindChatInputEvents()
- **Input Enter** → `sendMessage()`
- **Send button click** → `sendMessage()`
- **Image button click** → show file picker
- **File selected** → `handleImageSelect(file)`
- **Remove preview** → `clearImagePreview()`
- **Quick reply click** → fill input

---

## CSS Structure

### `pancake-chat.css` (40KB)

| Section | Classes | Mô tả |
|---------|---------|-------|
| Variables | `--pk-*` | CSS custom properties |
| Container | `.pk-container`, `.pk-sidebar`, `.pk-chat-window` | Layout chính |
| Conversations | `.pk-conversation-item`, `.pk-avatar`, `.pk-unread-badge` | List items |
| Messages | `.pk-message`, `.pk-message-outgoing`, `.pk-message-incoming` | Tin nhắn |
| Input | `.pk-chat-input-bar`, `.pk-input-btn`, `.pk-send-btn` | Khung nhập |
| Attachments | `.pk-attachment-image`, `.pk-attachment-sticker`, `.pk-attachment-video` | Đính kèm |
| Context Menu | `.pk-context-menu`, `.pk-context-menu-item`, `.pk-tags-menu` | Menu chuột phải |
| Stats Bar | `.pk-customer-stats-bar`, `.pk-stat-badge` | Thống kê khách |
| Scroll Button | `.pk-scroll-to-bottom-btn` | Nút cuộn xuống |

---

## Storage

| Key | Storage | Mô tả |
|-----|---------|-------|
| `pancake_jwt_token` | localStorage | Main JWT token |
| `pancake_page_access_tokens` | localStorage | Per-page tokens |
| `tpos_pancake_selected_page` | localStorage | Page đang chọn |
| `tpos_pancake_column_order` | localStorage | Thứ tự cột |
| `pancake_jwt_tokens` | Firebase RTDB | Backup accounts |

---

## Key Features Implemented

1. ✅ **Conversation List** - Load, filter, search, infinite scroll
2. ✅ **Messages** - Load, send, infinite scroll (older messages)
3. ✅ **Realtime Updates** - WebSocket Phoenix protocol
4. ✅ **Page Selector** - Multi-page support
5. ✅ **Mark Read/Unread** - Qua context menu
6. ✅ **Tags Management** - Add/remove via submenu
7. ✅ **Image Upload** - Preview + send with content_id
8. ✅ **Customer Notes** - Add notes via context menu
9. ✅ **Stats Bar** - Phone, Ad ID, orders, comments
10. ✅ **Search** - By name, phone, fb_id

