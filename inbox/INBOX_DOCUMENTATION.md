# Tài Liệu Chi Tiết - Trang Inbox Chat

## 1. Tổng Quan

Trang Inbox (`/inbox/index.html`) là giao diện quản lý tin nhắn khách hàng tích hợp **Pancake API** (proxy Facebook Messenger). Hỗ trợ:
- Quản lý hội thoại INBOX (tin nhắn trực tiếp) và COMMENT (bình luận bài viết)
- Gửi/nhận tin nhắn real-time qua WebSocket
- Phân nhóm khách hàng (label system)
- Theo dõi livestream
- Tạo đơn hàng nhanh từ chat
- Quick Reply templates
- Tìm kiếm 2 tầng (local + API)

---

## 2. Cấu Trúc File

### JavaScript (tất cả trong `inbox/js/`)

| File | Lines | Class/Module | Chức năng |
|------|-------|-------------|-----------|
| `inbox-main.js` | 205 | `initInboxApp()` | Khởi tạo app, column resizer, showToast |
| `inbox-data.js` | 1,160 | `InboxDataManager` | Quản lý dữ liệu: conversations, groups, labels, livestream |
| `inbox-chat.js` | 3,405 | `InboxChatController` | UI controller: chat, messages, WebSocket, send, search |
| `inbox-orders.js` | 311 | `InboxOrderController` | Form tạo đơn hàng nhanh |
| `api-config.js` | 132 | `API_CONFIG` | Cấu hình API endpoints, URL builders |
| `shop-config.js` | 39 | `ShopConfig` | Cấu hình shop |
| `pancake-token-manager.js` | 1,472 | `PancakeTokenManager` | Quản lý JWT token, multi-account, page access tokens |
| `pancake-data-manager.js` | 3,674 | `PancakeDataManager` | Pancake API client: fetch conversations, messages, upload |
| `pancake-settings.js` | 1,165 | Global functions | Modal quản lý tài khoản Pancake |
| `permissions-helper.js` | 591 | `PermissionHelper` | Kiểm tra quyền truy cập UI |
| `goong-places.js` | 183 | `goongAttachAutocomplete()` | Autocomplete địa chỉ (Goong Maps) |
| `quick-reply-manager.js` | 1,652 | `QuickReplyManager` | Quản lý mẫu tin nhắn nhanh |

### HTML & CSS

| File | Chức năng |
|------|-----------|
| `index.html` | Layout 3 cột: danh sách hội thoại, chat, thông tin |
| `css/inbox.css` | Styles chính |
| `css/quick-reply-modal.css` | Styles cho quick reply modal |

### Shared (vẫn dùng chung)

| File | Lý do giữ shared |
|------|------------------|
| `../shared/js/firebase-config.js` | Firebase singleton, không được duplicate |
| `../shared/js/navigation-modern.js` | Sidebar navigation dùng chung |
| `../shared/esm/compat.js` | ESM auth layer |

---

## 3. Kiến Trúc

### Layout 3 Cột

```
┌──────────────────────────────────────────────────────────────────────┐
│                        main.main-content                            │
├──────────────┬──────────────────────────┬───────────────────────────┤
│   Column 1   │       Column 2           │       Column 3            │
│ Conversations│       Chat Area          │    Info Panel              │
│              │                          │                           │
│ ┌──────────┐ │ ┌──────────────────────┐ │ ┌─────────────────────┐   │
│ │ Search   │ │ │ Chat Header          │ │ │ Tabs: Phân Nhóm |   │   │
│ │ Page Sel │ │ │ (name, status, btns) │ │ │ Hoạt Động | Đơn Hàng│   │
│ │ Filters  │ │ ├──────────────────────┤ │ ├─────────────────────┤   │
│ ├──────────┤ │ │                      │ │ │ Nhóm Phân Loại      │   │
│ │          │ │ │   Messages Area      │ │ │ ┌─────────────────┐ │   │
│ │ Conv     │ │ │   (scrollable)       │ │ │ │ Group cards      │ │   │
│ │ List     │ │ │                      │ │ │ │ with counts      │ │   │
│ │ (scroll) │ │ │                      │ │ │ └─────────────────┘ │   │
│ │          │ │ ├──────────────────────┤ │ │                     │   │
│ │          │ │ │ Label Bar            │ │ │ Customer Stats      │   │
│ │          │ │ │ Reply Preview        │ │ │ Post Info           │   │
│ │          │ │ │ Input Area           │ │ │ Activities          │   │
│ │          │ │ │ (textarea + buttons) │ │ │ Notes               │   │
│ └──────────┘ │ └──────────────────────┘ │ └─────────────────────┘   │
├──────────────┴──────────────────────────┴───────────────────────────┤
│ Resize handles between columns (draggable)                          │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow Tổng Quan

```
Firebase/Firestore ──→ PancakeTokenManager ──→ JWT Token
                                                  │
                                                  ▼
Pancake API ◄──── PancakeDataManager ◄──── API_CONFIG (URL builder)
    │                     │
    ▼                     ▼
Conversations        Messages
    │                     │
    ▼                     ▼
InboxDataManager     InboxChatController
(data layer)         (UI layer)
    │                     │
    ▼                     ▼
Groups/Labels ◄──→ Render DB (PostgreSQL via Cloudflare Worker)
                        │
                        ▼
                   WebSocket (real-time updates)
```

---

## 4. Khởi Tạo App

File: `inbox-main.js` → `initInboxApp()`

### Thứ tự khởi tạo:

```
1. showToast() + notificationManager shim
2. initColumnResizer()
3. InboxDataManager.init()
   ├── loadGroups() (localStorage)
   ├── loadLocalState() (labels từ localStorage)
   ├── pancakeTokenManager.initialize() (Firebase → JWT)
   ├── pancakeDataManager.initialize() (fetch pages + conversations)
   ├── loadGroupsFromServer() (Render DB)
   ├── syncLabelsFromServer() (Render DB)
   ├── recalculateGroupCounts()
   ├── buildMaps()
   └── fetchLivestreamFromServer()
4. InboxChatController.init()
   ├── bindEvents()
   ├── renderPageSelector()
   ├── renderConversationList()
   └── renderGroupStats()
5. InboxOrderController.init()
   ├── bindEvents()
   └── goongAttachAutocomplete()
6. initializeWebSocket()
   └── fallback: startAutoRefresh() (polling 30s)
7. updatePageUnreadCounts()
8. fetchPendingFromServer()
9. PermissionHelper.applyUIRestrictions('inbox')
```

---

## 5. Chi Tiết Các Hàm

### 5.1 InboxDataManager (`inbox-data.js`)

#### Khởi tạo & State

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `constructor()` | 30 | Khởi tạo state: conversations, groups, pages, livestreamPostMap, labelMap, lookup maps |
| `init()` | 51 | Khởi tạo async: token manager → data manager → load groups/labels → build maps |
| `loadLocalState()` | 95 | Load labels từ localStorage (`inbox_conv_labels`) |
| `saveLocalState()` | 108 | Lưu labels vào localStorage |

#### Load Conversations

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `loadConversations(forceRefresh)` | 318 | Load conversations với fallback chain (xem mục 6) |
| `loadMoreConversations()` | 382 | Pagination: fetch thêm conversations, dedup, append |
| `fetchConversationsWithErrorCheck(forceRefresh)` | 190 | Wrap fetchConversations + check API error codes |
| `fetchConversationsPerPage()` | 230 | Fallback: fetch từng page riêng biệt qua `/pages/{id}/conversations` |
| `tryOtherAccounts()` | 455 | Thử các tài khoản Pancake khác (multi-page endpoint) |
| `tryOtherAccountsPerPage()` | 414 | Thử các tài khoản khác (per-page endpoint) |
| `mapConversation(conv)` | 507 | Chuyển đổi raw Pancake → inbox format |
| `parseTimestamp(timestamp)` | 547 | Parse timestamp: string (UTC), number (unix) → Date |

#### Groups & Labels

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `loadGroups()` | 116 | Load groups từ localStorage, fallback DEFAULT_GROUPS |
| `loadGroupsFromServer()` | 133 | Fetch groups từ Render DB (`/api/realtime/inbox-groups`) |
| `saveGroupsToServer()` | 162 | Lưu groups lên Render DB + localStorage |
| `addGroup(name, color, note)` | 1116 | Tạo group mới |
| `updateGroup(id, updates)` | 1124 | Cập nhật group |
| `deleteGroup(id)` | 1134 | Xóa group, reassign conversations về 'new' |
| `toggleConversationLabel(convId, labelId)` | 738 | Toggle label (multi-select, 'done' exclusive) |
| `syncLabelsFromServer()` | 771 | Đồng bộ labels 2 chiều server ↔ local |
| `recalculateGroupCounts(typeFilter)` | 593 | Đếm lại số conversations mỗi group |
| `getLabelArray(convId)` | 727 | Lấy mảng labels cho conversation |

#### Livestream

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `fetchLivestreamFromServer()` | 930 | Fetch livestream conversations từ Render DB |
| `markAsLivestream(convId, postId)` | 999 | Đánh dấu conv là livestream + save server |
| `markCustomerAsLivestream(psid, pageId, name, postId)` | 1062 | Đánh dấu tất cả conv của customer là livestream |
| `unmarkAsLivestream(convId)` | 1090 | Bỏ đánh dấu livestream (local only) |
| `_saveLivestreamConvToServer(convId, postId, conv)` | 1037 | Lưu livestream conv lên Render DB |

#### Lookup & Utility

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `buildMaps()` | 667 | Build O(1) lookup maps: id, psid, customerId |
| `getConversation(id)` | 678 | Tìm conversation theo id |
| `getConversationByPsid(psid)` | 682 | Tìm conversation theo psid |
| `getConversations({search, filter, groupFilters})` | 622 | Lọc + sắp xếp conversations |
| `check24hWindow(convId)` | 689 | Kiểm tra cửa sổ 24h Facebook Messaging |
| `markAsRead(convId)` | 828 | Đánh dấu đã đọc (local + Pancake API + Render DB) |
| `markAsUnread(convId)` | 845 | Đánh dấu chưa đọc (local + Pancake API) |
| `markRepliedOnServer(psid, pageId)` | 870 | Xóa khỏi pending_customers trên Render DB |
| `fetchPendingFromServer()` | 882 | Fetch pending customers, merge unread data |
| `addMessage(convId, text, sender, extra)` | 1096 | Thêm tin nhắn local (optimistic UI) |
| `getPageName(pageId)` | 571 | Lấy tên page |

---

### 5.2 InboxChatController (`inbox-chat.js`)

#### Khởi tạo & Events

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `constructor(dataManager)` | 18 | Khởi tạo state, DOM elements references |
| `init()` | 102 | Bind events, restore filter, render UI |
| `bindEvents()` | 119 | Bindtất cả event listeners (search, scroll, filter, send, etc.) |

#### Render UI

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `renderConversationList()` | 778 | Render danh sách hội thoại (filter → sort → HTML) |
| `_buildConvItemHtml(conv)` | 857 | Build HTML cho 1 conversation item |
| `renderMessages(conv)` | 1441 | Render tất cả tin nhắn trong chat area |
| `renderAttachments(attachments)` | 1624 | Render media: ảnh, video, audio, file, sticker, quoted msg |
| `renderGroupStats()` | (col3) | Render group cards với count + click-to-filter |
| `renderChatLabelBar(conv)` | (col2) | Render label buttons dưới chat |
| `renderPageSelector()` | 540 | Render dropdown chọn page (multi-select) |
| `renderCustomerStatsBar(conv)` | (col2) | Render customer stats bar |
| `renderPostInfo(conv)` | (col2) | Render post info banner (livestream) |
| `renderActivities(conv)` | 2527 | Render activities panel (col3) |
| `renderNotes(conv)` | (col3) | Render notes panel |
| `renderEmojiGrid(category)` | 2723 | Render emoji picker grid |
| `renderQuickReplies()` | 2655 | Render quick reply bar (hiện tại disabled) |

#### Load & Display

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `selectConversation(convId)` | 1190 | Chọn conversation → load messages → update UI |
| `loadMessages(conv)` | 1273 | Fetch messages từ Pancake API → map → render |
| `loadMoreMessages()` | 2581 | Lazy-load tin nhắn cũ hơn (scroll lên) |
| `loadMoreConversations()` | 1108 | Load thêm conversations (scroll xuống) |
| `performSearch(query)` | 2912 | Tìm kiếm API (debounced 300ms) |

#### Gửi Tin Nhắn

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `sendMessage()` | 1762 | Entry point gửi tin nhắn (text/ảnh) |
| `_sendInbox(url, text, conv, replyData)` | 1888 | Gửi INBOX: reply_inbox → fallback private_replies |
| `_sendComment(url, text, conv, replyData, type)` | 1938 | Gửi COMMENT: reply_comment hoặc private_replies |
| `_sendApi(url, payload)` | 1745 | Helper: POST API + parse error |
| `_parseFbError(responseText)` | 1726 | Parse Facebook API error codes |
| `_getPageAccessTokenWithFallback(pageId)` | 1690 | Lấy page access token (cache → generate → fallback account) |
| `attachImage()` | 1991 | Chọn ảnh → preview → gửi khi Enter |
| `attachFile()` | 2663 | Chọn file → upload → gửi |

#### Message Actions (COMMENT)

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `handleMessageAction(action, msgId, btn)` | 2731 | Router: like/hide/delete/copy/reply/react |
| `sendReaction(msgId, reactionType)` | 2857 | Gửi reaction (LIKE, LOVE, HAHA, etc.) |
| `setReplyingTo(msg, conv)` | 2799 | Set reply state → show preview bar |
| `cancelReply()` | 2823 | Cancel reply |
| `showReactionPicker(msgId, btn)` | 2833 | Hiện reaction picker popup |

#### WebSocket & Realtime

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `initializeWebSocket()` | 2951 | Khởi tạo WebSocket (xem mục 9) |
| `onSocketOpen()` | 3040 | Handler: WS connected |
| `onSocketClose(event)` | 3051 | Handler: WS closed → reconnect/polling |
| `onSocketMessage(event)` | 3070 | Handler: parse + route WS events |
| `handleConversationUpdate(payload)` | 3088 | Xử lý: update conversation (snippet, unread, livestream) |
| `handleNewMessage(payload)` | 3150 | Xử lý: new message → update + reload if active |
| `handlePostTypeDetected(data)` | 3171 | Xử lý: post type detected (livestream) |
| `startAutoRefresh()` | 3187 | Polling fallback: refresh mỗi 30s |
| `stopAutoRefresh()` | 3201 | Dừng polling |
| `closeWebSocket()` | 3208 | Đóng WebSocket + cleanup |
| `updateSocketStatusUI(connected)` | 3222 | Cập nhật icon wifi status |

#### Livestream

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `toggleLivestreamStatus()` | 921 | Toggle livestream status cho active conv |
| `updateLivestreamButton(conv)` | 905 | Update button UI (active/inactive) |
| `toggleLivestreamPostSelector()` | 960 | Show/hide livestream post selector |
| `populateLivestreamPostSelector()` | 971 | Populate dropdown: posts + conv counts |
| `_fetchMissingPostNames(postIds)` | 1000 | Fetch tên bài post từ Pancake API |
| `clearLivestreamForPost()` | 1070 | Xóa tất cả livestream cho 1 post |

#### Page & Filter

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `updatePageSelectorLabel()` | 617 | Update label: "Tất cả Pages" / page name / "N Pages" |
| `populateSendPageSelector()` | 633 | Populate "Gửi từ" page dropdown |
| `onSendPageChanged(pageId)` | 663 | Handler: đổi page gửi |
| `populateReplyTypeSelector()` | 688 | Show/hide reply type (COMMENT: reply_comment / private_replies) |
| `onReplyTypeChanged(value)` | 716 | Handler: đổi reply type |
| `updatePageUnreadCounts()` | 3239 | Fetch + display unread counts per page |
| `toggleReadUnread(convId)` | 1170 | Toggle đã đọc / chưa đọc |

#### Utility

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `getAvatarHtml(conv, size)` | 734 | Build avatar HTML (4-tier fallback) |
| `getTagsHtml(conv)` | 762 | Build tags HTML |
| `formatTime(timestamp)` | 3307 | Format: hôm nay → giờ, tuần này → thứ, khác → dd/mm |
| `formatDate(timestamp)` | 3351 | Format: Hôm nay / Hôm qua / dd/mm/yyyy |
| `formatMessageTime(timestamp)` | 3381 | Format: HH:mm (Vietnam timezone) |
| `formatMessageText(text)` | 3389 | Escape HTML + linkify URLs + newlines |
| `escapeHtml(text)` | 3396 | Escape HTML entities |
| `stripHtml(html)` | 2572 | Strip HTML tags |
| `parseTimestamp(timestamp)` | 3283 | Parse timestamp → Date (UTC handling) |
| `getLabelClass(label)` | 3267 | Map label id → CSS class |
| `getLabelText(label)` | 3272 | Map label id → display name |

---

### 5.3 InboxOrderController (`inbox-orders.js`)

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `constructor(dataManager)` | 5 | Khởi tạo, reference DOM elements |
| `init()` | 35 | Bind events + goong autocomplete |
| `bindEvents()` | 46 | Event listeners: add product, submit, payment change |
| `fillCustomerInfo(conv)` | 80 | Điền tên + phone từ conversation |
| `addProductRow()` | 89 | Thêm hàng sản phẩm |
| `removeProductRow(index)` | 124 | Xóa hàng sản phẩm |
| `updateOrderSummary()` | 150 | Tính lại tổng tiền |
| `getProducts()` | 172 | Collect sản phẩm từ form |
| `submitOrder()` | 190 | Validate + save đơn hàng |
| `saveOrder(orderData)` | 253 | Lưu vào localStorage |
| `resetForm()` | 267 | Reset form |

---

## 6. Load Conversations - Quy Trình Chi Tiết

### Fallback Chain

```
loadConversations(forceRefresh)
    │
    ├──→ fetchConversationsWithErrorCheck()
    │    └──→ pdm.fetchConversations() (multi-page endpoint)
    │         ├── Success → return conversations
    │         ├── Error 105 (no permission) → ①
    │         ├── Error 122 (subscription expired) → ②
    │         └── 0 results → ③
    │
    ├──① Error 105:
    │    └──→ fetchConversationsPerPage() (per-page endpoint)
    │         ├── Success → return
    │         └── 0 results → tryOtherAccounts()
    │              └── 0 results → tryOtherAccountsPerPage()
    │
    ├──② Error 122:
    │    └──→ fetchConversationsPerPage() (skips expired pages)
    │         └── 0 results → tryOtherAccountsPerPage()
    │
    └──③ 0 results:
         └──→ tryOtherAccounts() (try other Pancake accounts)
```

### Per-Page Fetch

```
fetchConversationsPerPage()
    │
    └──→ For each pageId:
         ├── API_CONFIG.buildUrl.pancakeDirect(`pages/${pageId}/conversations`)
         ├── Params: unread_first, mode=OR, tags="ALL", cursor_mode
         ├── Skip pages with error (continue)
         └── Collect all successful pages → cache workingPageIds
```

### Pagination (scroll-to-load-more)

```
User scrolls to bottom (100px threshold)
    │
    └──→ loadMoreConversations()
         ├── Guard: !isLoading && hasMore && !searching && cooldown
         ├── pdm.fetchMoreConversations() (cursor-based)
         ├── Dedup by id
         ├── Filter by current tab/type/page
         └── Append HTML (preserves scroll position)
```

---

## 7. Load Messages - Quy Trình Chi Tiết

### Initial Load

```
selectConversation(convId)
    │
    ├── Update header (name, avatar, status)
    ├── Show loading spinner
    │
    └──→ loadMessages(conv)
         │
         ├── pdm.fetchMessagesForConversation(pageId, convId, null, customerId)
         │
         ├── Store metadata:
         │   ├── post (livestream detection)
         │   ├── customers
         │   ├── reports_by_phone
         │   ├── recent_phone_numbers
         │   ├── activities
         │   ├── conv_phone_numbers
         │   └── notes
         │
         ├── Detect livestream from post data
         │   └── postType === 'livestream' || liveVideoStatus === 'vod'/'live'
         │
         ├── Map messages: Pancake → inbox format
         │   ├── id, text (original_message || stripHtml(message))
         │   ├── time, sender ('shop'|'customer')
         │   ├── attachments, senderName, fromId
         │   ├── reactions, reactionSummary
         │   ├── phoneInfo, isHidden, isRemoved
         │   └── userLikes, canHide, canRemove, canLike
         │
         ├── Filter system messages:
         │   ├── "Đã thêm nhãn tự động:"
         │   ├── "Đã đặt giai đoạn"
         │   └── "[Tin nhắn trống]"
         │
         ├── Re-append optimistic messages not confirmed
         │
         ├── renderMessages(conv)
         ├── renderCustomerStatsBar(conv)
         ├── renderPostInfo(conv)
         ├── renderActivities(conv)
         └── renderNotes(conv)
```

### Load More (Scroll Up)

```
User scrolls near top (< 100px)
    │
    └──→ loadMoreMessages()
         ├── Guard: !isLoading && hasMore && activeConv
         ├── pdm.fetchMessagesForConversation(pageId, convId, messageCurrentCount)
         ├── Map older messages
         ├── Prepend: [...mapped, ...existing]
         ├── Maintain scroll position (scrollHeight diff)
         └── 0 results → hasMoreMessages = false → "Đầu cuộc hội thoại"
```

---

## 8. Gửi Tin Nhắn - Quy Trình Chi Tiết

### Entry Point: `sendMessage()`

```
sendMessage()
    │
    ├── Validate: activeConv + (text || image) + COMMENT needs target
    ├── Clear input immediately
    ├── Determine sendPageId (selector || conv.pageId)
    ├── 24h window check (warning only, don't block)
    ├── Capture reply state
    │
    ├── Optimistic UI:
    │   ├── data.addMessage(convId, text, 'shop')
    │   ├── renderMessages()
    │   └── renderConversationList()
    │
    ├── Get pageAccessToken (3-step fallback):
    │   ├── 1. ptm.getPageAccessToken(pageId) (cache)
    │   ├── 2. ptm.generatePageAccessTokenWithToken(pageId, activeToken)
    │   └── 3. ptm.findAccountWithPageAccess(pageId) → generate
    │
    ├── Build URL:
    │   └── API_CONFIG.buildUrl.pancakeOfficial(`pages/${id}/conversations/${convId}/messages`)
    │
    ├── If image:
    │   ├── pdm.uploadImage(pageId, file) → content_url
    │   └── POST { action: 'reply_inbox', content_url }
    │
    ├── If text:
    │   ├── INBOX → _sendInbox()
    │   └── COMMENT → _sendComment()
    │
    ├── Auto markAsRead
    └── Reload messages after 2s delay
```

### INBOX Send: `_sendInbox()`

```
_sendInbox(url, text, conv, replyData)
    │
    ├── POST { action: 'reply_inbox', message: text }
    │   ├── + replied_message_id (if replying)
    │
    ├── If 24h error (code 10, subcode 2018278) or 551 (user unavailable):
    │   └── Fallback: POST { action: 'private_replies', post_id, message_id, from_id, message }
    │
    └── If fallback also fails → throw original error
```

### COMMENT Send: `_sendComment()`

```
_sendComment(url, text, conv, replyData, selectedType)
    │
    ├── reply_comment (public):
    │   ├── POST { action: 'reply_comment', message_id: commentId, message }
    │   └── Fallback → POST { action: 'private_replies', post_id, message_id, from_id, message }
    │
    └── private_replies (private):
        ├── POST { action: 'private_replies', post_id, message_id, from_id, message }
        └── Fallback → POST { action: 'reply_inbox', message }
```

### Error Handling

| Error Code | Mô tả | Xử lý |
|------------|--------|-------|
| 10 + 2018278 | 24h window expired | Fallback private_replies |
| 551 | User unavailable/blocked | Fallback private_replies |
| Other | Unknown error | Show error toast |

---

## 9. WebSocket & Realtime

### Kiến trúc: Server-Mode Proxy

```
Client (Browser)                Cloudflare Worker               Render Server
    │                                │                              │
    │ POST /api/realtime/start ──────│──────────────────────────────│
    │ { token, userId, pageIds }     │                              │
    │                                │                              │
    │                                │ ──→ Connect to Pancake WS   │
    │                                │     (server-side)            │
    │                                │                              │
    │ GET /api/realtime/status ──────│──────────────────────────────│
    │ (check Pancake WS connected)   │                              │
    │                                │                              │
    │ WSS wss://n2store-realtime.onrender.com ─────────────────────│
    │ (client connects to proxy WS)  │                              │
    │                                │                              │
    │ ◄── Broadcasted events ────────│◄── Pancake WS events ───────│
```

### Quy trình kết nối

```
initializeWebSocket()
    │
    ├── 1. Get token + decode JWT → userId
    ├── 2. POST /api/realtime/start { token, userId, pageIds, cookie }
    ├── 3. Retry check status (tối đa 3 lần, delay 2s/4s/6s)
    │      GET /api/realtime/status → nếu vẫn chưa connected → startAutoRefresh() backup
    ├── 4. new WebSocket('wss://n2store-realtime.onrender.com')
    │
    ├── onopen:
    │   ├── isSocketConnected = true
    │   ├── resetReconnect()
    │   ├── updateSocketStatusUI(true)
    │   └── stopAutoRefresh() ← tắt polling khi WS OK
    │
    ├── onmessage(event):
    │   ├── Parse JSON
    │   ├── 'pages:update_conversation' → handleConversationUpdate()
    │   │     ├── Filter page_id (String comparison để tránh type mismatch)
    │   │     ├── Filter type (chỉ INBOX/COMMENT)
    │   │     ├── Log khi bị filter (debug)
    │   │     └── Auto-reload messages nếu là conversation đang mở
    │   ├── 'pages:new_message' → handleNewMessage()
    │   └── 'post_type_detected' → handlePostTypeDetected()
    │
    └── onclose:
        ├── startAutoRefresh() ngay lập tức (polling backup trong lúc reconnect)
        ├── Reconnect (max 3 attempts):
        │   ├── Attempt 1: 3s delay
        │   ├── Attempt 2: 4.5s delay
        │   └── Attempt 3: 6.75s delay (capped 15s)
        │
        └── After max attempts → polling only (30s)
```

### Server-side Event Forwarding (n2store-realtime/server.js — server chính)

Server Pancake WS (`RealtimeClient.handleMessage()`) forward các event types:
- `pages:update_conversation` → broadcast + save to PostgreSQL + livestream detection
- `pages:new_message` → broadcast only (INBOX-SPECIFIC, added riêng cho inbox)
- `order:tags_updated` → broadcast only

**Lưu ý**: Inbox kết nối tới `wss://n2store-realtime.onrender.com` (server chính), KHÔNG phải `render.com/server.js` (server phụ/fallback).

### Event Types

| Event | Handler | Hành động |
|-------|---------|-----------|
| `pages:update_conversation` | `handleConversationUpdate()` | Update lastMessage, time, unread, tags, livestream status |
| `pages:new_message` | `handleNewMessage()` | Update conv time/lastMessage, reload messages if active |
| `post_type_detected` | `handlePostTypeDetected()` | Mark/unmark livestream |

### Polling Fallback

```
startAutoRefresh()
    └── setInterval(30s):
        ├── data.loadConversations(true)
        ├── renderConversationList()
        └── renderGroupStats()
```

---

## 10. Phân Nhóm (Label System)

### 6 Groups Mặc Định

| ID | Tên | Màu | Mô tả |
|----|-----|-----|-------|
| `new` | Inbox Mới | #3b82f6 (blue) | Tin nhắn mới chưa xử lý |
| `processing` | Đang Xử Lý | #f59e0b (amber) | Đang được nhân viên xử lý |
| `waiting` | Chờ Phản Hồi | #f97316 (orange) | Đã trả lời, chờ khách |
| `ordered` | Đã Đặt Hàng | #10b981 (green) | Khách đã chốt đơn |
| `urgent` | Cần Gấp | #ef4444 (red) | Khiếu nại, đổi trả, lỗi |
| `done` | Hoàn Tất | #6b7280 (gray) | Xong, không cần theo dõi |

### Multi-Label Logic

```javascript
toggleConversationLabel(convId, labelId)
    │
    ├── 'done' selected → labels = ['done'] (exclusive, clears all)
    ├── Other selected:
    │   ├── Remove 'done' if present
    │   ├── Toggle: add if missing, remove if present
    │   ├── Empty → default ['new']
    │   └── Multiple → remove 'new'
    │
    ├── Save to localStorage + Render DB
    └── Recalculate group counts
```

### Custom Groups

Users có thể tạo custom groups qua modal "Quản Lý":
- Tên, màu (10 preset), ghi chú
- ID tự động: `group_` + timestamp
- Lưu: localStorage + `/api/realtime/inbox-groups` (PUT)

### Data Sync

```
3-tier storage:
├── localStorage (instant, offline): 'inbox_groups', 'inbox_conv_labels'
├── Render DB (source of truth): PostgreSQL via API
└── Sync strategy:
    ├── Load: localStorage first (instant) → server async (merge)
    ├── Save: localStorage + server simultaneously
    └── Conflict: server wins on merge
```

---

## 11. Tìm Kiếm

### 2-Tier Search

```
User types in search input
    │
    ├── Instant (0ms): Local filter
    │   └── removeDiacritics() → match: name, lastMessage, phone, pageName
    │
    └── Debounced (300ms): API search
        └── pdm.searchConversations(query)
            ├── Results merged with local (dedup by id)
            └── Sorted by time descending
```

### Vietnamese Diacritics

```javascript
removeDiacritics("Huỳnh Thành Đạt") → "huynh thanh dat"
// NFD normalize → remove combining marks → replace đ/Đ → lowercase
```

---

## 12. Quick Reply

### Autocomplete (slash command)

```
User types "/" in chat input
    │
    └── QuickReplyManager.handleAutocompleteInput()
        ├── Query: text after "/"
        ├── Match: shortcut hoặc topic (Vietnamese diacritic-insensitive)
        └── Show dropdown → select → replace input text
```

### Template System

```
QuickReplyManager
    ├── Templates stored in: Firebase Firestore + IndexedDB/localStorage
    ├── Each template:
    │   ├── shortcut (e.g., "/xc" → "xin chào")
    │   ├── topic + topicColor
    │   ├── message (template text)
    │   └── imageUrl (optional)
    │
    ├── Modal: openModal('chatInput') → select → insert
    └── Settings: create/edit/delete templates
```

---

## 13. API Endpoints

### Pancake API (qua Cloudflare Worker proxy)

| Method | Endpoint | Chức năng |
|--------|----------|-----------|
| GET | `/conversations` | Fetch tất cả conversations (multi-page) |
| GET | `/pages/{pageId}/conversations` | Fetch conversations cho 1 page |
| GET | `/pages/{pageId}/conversations/{convId}/messages` | Fetch messages |
| POST | `/pages/{pageId}/conversations/{convId}/messages` | Gửi tin nhắn |
| POST | `/pages/{pageId}/media` | Upload ảnh/file |
| GET | `/conversations?search={query}` | Tìm kiếm conversations |
| POST | `/pages/{pageId}/conversations/{convId}/unread` | Mark unread |
| POST | `/pages/{pageId}/comments/{msgId}/reactions` | React comment |

### Custom Worker Endpoints (Render DB)

| Method | Endpoint | Chức năng |
|--------|----------|-----------|
| POST | `/api/realtime/start` | Khởi tạo server-side Pancake WS |
| GET | `/api/realtime/status` | Check Pancake WS status |
| GET | `/api/realtime/inbox-groups` | Fetch groups |
| PUT | `/api/realtime/inbox-groups` | Save groups |
| GET | `/api/realtime/conversation-labels` | Fetch all labels |
| PUT | `/api/realtime/conversation-label` | Save 1 label |
| PUT | `/api/realtime/conversation-labels/bulk` | Bulk push labels |
| GET | `/api/realtime/livestream-conversations` | Fetch livestream convs |
| PUT | `/api/realtime/livestream-conversation` | Save livestream conv |
| DELETE | `/api/realtime/livestream-conversations?post_id=X` | Delete by post |
| DELETE | `/api/realtime/livestream-conversations?conv_id=X` | Delete by conv |
| GET | `/api/realtime/pending-customers?limit=500` | Fetch pending |
| POST | `/api/realtime/mark-replied` | Mark customer as replied |

### WebSocket

| URL | Chức năng |
|-----|-----------|
| `wss://n2store-realtime.onrender.com` | Client proxy WebSocket |

---

## 14. Permissions

### Quyền (data-perm attributes trong HTML)

| Permission | Áp dụng | Mô tả |
|------------|---------|-------|
| `inbox:settings` | btnPancakeSettings, btnRenderData | Quản lý tài khoản Pancake, xem Render DB |
| `inbox:manage_labels` | btnManageGroups, chatLabelBar, btnClearLivestream | Quản lý nhóm, gán nhãn, xóa livestream |

### Cách hoạt động

```
PermissionHelper.applyUIRestrictions('inbox')
    │
    ├── Đọc permissions từ sessionStorage/localStorage
    ├── Tìm tất cả elements với [data-perm]
    └── data-perm-action="hide" → element.style.display = 'none'
```

---

## 15. Data Persistence

### localStorage Keys

| Key | Dữ liệu | Module |
|-----|----------|--------|
| `inbox_groups` | Array of groups `[{id, name, color, note, count}]` | InboxDataManager |
| `inbox_conv_labels` | Object `{convId: [labelIds]}` | InboxDataManager |
| `inbox_current_filter` | String: 'all' / 'unread' / 'livestream' / 'inbox_my' | InboxChatController |
| `inbox_recent_emojis` | Array of emoji strings | InboxChatController |
| `inbox_orders` | Array of order objects | InboxOrderController |

### IndexedDB

| Database | Store | Dữ liệu |
|----------|-------|----------|
| PancakeTokenDB | pageAccessTokens | Page access tokens (large data) |
| QuickReplyDB | replies | Quick reply templates |

### Server (PostgreSQL via Render DB)

| Table/Key | Dữ liệu |
|-----------|----------|
| `realtime_kv['inbox-groups']` | JSON array of groups |
| `conversation_labels` | `{convId: JSON.stringify(labels)}` |
| `livestream_conversations` | `{conv_id, post_id, post_name, name, type, page_id, psid}` |
| `pending_customers` | `{psid, page_id, message_count, last_message_snippet}` |

---

## 16. Hằng Số & Cấu Hình

```javascript
// WebSocket
socketMaxReconnectAttempts = 3
socketReconnectDelay = 3000  // ms, * 1.5 mỗi lần, max 15s
AUTO_REFRESH_INTERVAL = 30000  // 30s polling

// UI
AVATAR_GRADIENTS = [8 gradient colors]  // Avatar placeholder colors
MAX_FILE_SIZE = 25 * 1024 * 1024  // 25MB

// API
WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev'
WS_URL = 'wss://n2store-realtime.onrender.com'

// Search
SEARCH_DEBOUNCE = 300  // ms
MIN_SEARCH_LENGTH = 2  // characters

// Pagination
SCROLL_THRESHOLD = 100  // px from edge to trigger load
LOAD_MORE_COOLDOWN = 2000  // ms base, * consecutive empty loads, max 10s
```

---

## 17. Changelog - Sửa Lỗi Quan Trọng

### 2026-03-15: Fix Realtime Không Cập Nhật UI

**Vấn đề**: Pancake nhận tin nhắn mới nhưng web inbox không cập nhật UI.

**Nguyên nhân**:
1. Page ID so sánh sai type (`123 !== "123"`) → message bị drop im lặng
2. Server chỉ forward `pages:update_conversation`, không forward `pages:new_message`
3. Khi nhận `update_conversation` cho conversation đang mở, không reload messages
4. WS close → chỉ polling sau khi hết retry (mất 15-30s không nhận tin)
5. Pancake WS status check chỉ 1 lần, Render cold start lâu hơn 2s

**Sửa**:
- **`inbox-chat.js`** `handleConversationUpdate()`: dùng `String()` so sánh page ID, thêm log khi filter
- **`inbox-chat.js`** `handleConversationUpdate()`: auto-reload messages khi conversation đang mở nhận update
- **`inbox-chat.js`** `initializeWebSocket()`: retry check Pancake status 3 lần (2s/4s/6s), start polling backup nếu fail
- **`inbox-chat.js`** `onSocketClose()`: start polling ngay khi WS close (không đợi hết retry)
- **`n2store-realtime/server.js`** `handleMessage()`: thêm block forward `pages:new_message` (INBOX-SPECIFIC, code mới không sửa code cũ)
