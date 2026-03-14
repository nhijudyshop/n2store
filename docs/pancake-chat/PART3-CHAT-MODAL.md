# PART 3: CHAT MODAL (tab1-chat.js)

## Tổng quan

Chat Modal là UI chính hiển thị tin nhắn/bình luận giữa khách hàng và page. Được mở từ bảng đơn hàng (tab1-orders) khi click vào icon chat.

**Source file:** `orders-report/js/tab1/tab1-chat.js` (~2,500+ lines)

---

## 1. Global State Variables

```javascript
// === Core State ===
window.currentChatChannelId = null;    // Page ID đang xem
window.currentChatPSID = null;         // Customer PSID (Facebook_ASUserId)
window.currentRealFacebookPSID = null; // Real Facebook PSID (from_psid) cho Graph API
window.currentConversationId = null;   // Pancake Conversation ID hiện tại
window.currentCustomerUUID = null;     // Customer UUID (Pancake internal ID)
window.currentCustomerName = null;     // Tên khách (dùng để search khi đổi page)
window.currentCustomerFbId = null;     // Customer fb_id (dùng cho API /conversations/customer/{fb_id})

// === Message State ===
window.allChatMessages = [];           // Array tin nhắn INBOX
window.allChatComments = [];           // Array bình luận COMMENT
let currentChatCursor = null;          // Cursor cho pagination
let isLoadingMoreMessages = false;     // Flag loading more
let currentChatType = null;            // 'message' | 'comment'
let currentConversationType = 'INBOX'; // 'INBOX' | 'COMMENT'

// === Order State ===
let currentOrder = null;               // Order object hiện tại
let currentChatOrderId = null;         // Order ID
let currentChatOrderDetails = [];      // Order product details

// === Reply State ===
let currentParentCommentId = null;     // Parent comment ID (cho reply comment)
let currentPostId = null;              // Post ID của comment
let messageReplyType = 'reply_inbox';  // 'reply_inbox' | 'private_replies'

// === Image Upload State ===
let currentPastedImage = null;         // Blob ảnh dán từ clipboard
window.uploadedImagesData = [];        // Array ảnh đã upload
window.isUploadingImages = false;      // Flag uploading

// === Page Selectors ===
window.availableChatPages = [];        // Cache danh sách pages
window.currentSendPageId = null;       // Page ID để GỬI tin nhắn (độc lập với page đang xem)
window.allMatchingConversations = [];  // Tất cả conversations matching cho selector

// === Read State ===
window.currentConversationReadState = {
    isRead: false,
    conversationId: null,
    pageId: null,
    lastMarkedAt: null,
    chatType: null     // 'message' | 'comment'
};

// === Purchase Highlight ===
window.purchaseFacebookPostId = null;  // PostId của order (để highlight comment đặt hàng)
window.purchaseFacebookASUserId = null;
window.purchaseCommentId = null;       // CommentId của order
```

---

## 2. Mở Chat Modal - `openChatModal()`

### 2.1 Function Signature

```javascript
window.openChatModal = async function(orderId, channelId, psid, type = 'message')
```

**Parameters:**
- `orderId` - ID đơn hàng
- `channelId` - Facebook Page ID (từ order.Facebook_PostId → parse lấy phần đầu)
- `psid` - Customer PSID (order.Facebook_ASUserId)
- `type` - `'message'` hoặc `'comment'`

### 2.2 Complete Flow

```
openChatModal(orderId, channelId, psid, type)
    │
    ├─ 1. Reset state (clear tất cả global variables)
    │
    ├─ 2. Tìm order trong allData (bảng đơn hàng)
    │     └─ OrderStore.get(orderId) hoặc allData.find()
    │
    ├─ 3. Lưu customer name cho page switching
    │     window.currentCustomerName = order.Name
    │
    ├─ 4. Cập nhật UI
    │     ├─ Modal title: "Tin nhắn với {Tên}" hoặc "Bình luận với {Tên}"
    │     ├─ Subtitle: "SĐT: {phone} • Mã ĐH: {code}"
    │     ├─ Conversation type toggle (INBOX/COMMENT)
    │     └─ Show modal, prevent body scroll
    │
    ├─ 5. [PARALLEL] Load order details từ TPOS API
    │     ├─ Fetch: GET /api/odata/SaleOnline_Order({orderId})?$expand=Details,Partner,User,CRMTeam
    │     ├─ Lưu: window.currentChatOrderData, window.purchaseCommentId, etc.
    │     ├─ Render products table
    │     └─ Update message reply type toggle
    │
    ├─ 6. [PARALLEL] Populate page selectors
    │     ├─ populateChatPageSelector(channelId)   // View selector
    │     └─ populateSendPageSelector(channelId)   // Send selector
    │
    ├─ 7. Setup input handlers
    │     ├─ Paste handler (handleChatInputPaste)
    │     ├─ Keydown handler (Enter to send, Shift+Enter newline)
    │     ├─ Input handler (auto-resize textarea)
    │     └─ File input handler (attachment button)
    │
    └─ 8. Fetch conversations & messages
          │
          ├─ [type='comment'] ──────────────────────────────────┐
          │   ├─ [PARALLEL] Fetch:                               │
          │   │   ├─ fetchConversationsByCustomerFbId(channelId, fbId)
          │   │   └─ getOrGeneratePageAccessToken(channelId)     │
          │   │                                                   │
          │   ├─ Filter COMMENT conversations                    │
          │   │   └─ Match by POST_ID (từ order.Facebook_PostId) │
          │   │                                                   │
          │   ├─ Save conversation IDs:                           │
          │   │   ├─ currentCommentConversationId                │
          │   │   └─ currentInboxConversationId (for switching)  │
          │   │                                                   │
          │   ├─ fetchMessagesForConversation(                   │
          │   │     channelId, convId, null, customerUUID,       │
          │   │     preloadedPageAccessToken)                     │
          │   │                                                   │
          │   └─ renderComments(allChatComments, true)           │
          │                                                       │
          └─ [type='message'] ──────────────────────────────────┐
              ├─ [PARALLEL] Fetch:                               │
              │   ├─ fetchConversationsByCustomerFbId(channelId, fbId)
              │   └─ getOrGeneratePageAccessToken(channelId)     │
              │                                                   │
              ├─ Filter INBOX conversations                      │
              │                                                   │
              ├─ Save state:                                     │
              │   ├─ currentConversationId = inboxConv.id        │
              │   ├─ currentRealFacebookPSID = from_psid || from.id
              │   └─ currentCustomerFbId = customers[0].fb_id   │
              │                                                   │
              ├─ Populate conversation selector (if multiple)    │
              │                                                   │
              ├─ fetchMessagesForConversation(                   │
              │     channelId, convId, null, customerUUID,       │
              │     preloadedPageAccessToken)                     │
              │                                                   │
              ├─ renderChatMessages(allChatMessages, true)       │
              │                                                   │
              └─ Setup:                                          │
                  ├─ setupChatInfiniteScroll()                   │
                  ├─ setupNewMessageIndicatorListener()          │
                  └─ setupRealtimeMessages()                     │
```

---

## 3. Đóng Chat Modal - `closeChatModal()`

```javascript
window.closeChatModal = async function() {
    // 1. Cleanup held products (trả về dropped nếu chưa lưu)
    await window.cleanupHeldProducts();

    // 2. Cleanup realtime messages (stop polling, remove listeners)
    cleanupRealtimeMessages();

    // 3. Hide modal, restore body scroll
    document.getElementById('chatModal').classList.remove('show');
    document.body.style.overflow = '';

    // 4. Reset ALL state variables
    // (channelId, psid, conversationId, messages, comments, order, images, etc.)

    // 5. Reset conversation selector
    window.hideConversationSelector();

    // 6. Detach Firebase listener
    if (currentChatProductsRef) {
        currentChatProductsRef.off();
        currentChatProductsRef = null;
    }
}
```

---

## 4. Chuyển đổi INBOX ↔ COMMENT

### 4.1 `switchConversationType(type)`

```javascript
window.switchConversationType = async function(type) {
    // type: 'INBOX' hoặc 'COMMENT'

    // 1. Update toggle UI
    window.updateConversationTypeToggle(type);

    // 2. Reset state
    allChatMessages = []; allChatComments = [];
    currentChatCursor = null;

    // 3. Update input state
    if (type === 'COMMENT') {
        chatInput.disabled = true;
        chatInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
    } else {
        chatInput.disabled = false;
        chatInput.placeholder = 'Nhập tin nhắn trả lời...';
        chatInput.focus();
    }

    // 4. Use cached conversation IDs
    if (type === 'COMMENT') {
        currentConversationId = window.currentCommentConversationId;
    } else {
        currentConversationId = window.currentInboxConversationId;
    }

    // 5. Fetch messages
    const response = await pancakeDataManager.fetchMessagesForConversation(
        channelId, currentConversationId, null, customerUUID
    );

    // 6. Render
    if (type === 'COMMENT') {
        renderComments(allChatComments, true);
    } else {
        renderChatMessages(allChatMessages, true);
        setupRealtimeMessages();
    }
}
```

---

## 5. Page Selectors

### 5.1 View Page Selector - Thay đổi page xem tin nhắn

```javascript
window.populateChatPageSelector = async function(currentPageId) {
    // Fetch pages với unread count
    const pagesWithUnread = await pancakeDataManager.fetchPagesWithUnreadCount();

    // Render dropdown options
    // Format: "Page Name (3)" - số unread trong ngoặc
    pagesWithUnread.forEach(page => {
        const unreadBadge = page.unread_conv_count > 0 ? ` (${page.unread_conv_count})` : '';
        optionsHtml += `<option value="${page.page_id}">${page.page_name}${unreadBadge}</option>`;
    });
}

window.onChatPageChanged = async function(pageId) {
    // Đổi page → reload tin nhắn
    window.currentChatChannelId = pageId;
    await window.reloadChatForSelectedPage(pageId);
}
```

### 5.2 Send Page Selector - Chọn page để GỬI tin nhắn (độc lập)

```javascript
window.populateSendPageSelector = async function(currentPageId) {
    // Tương tự nhưng không hiển thị unread count
}

window.onSendPageChanged = function(pageId) {
    window.currentSendPageId = pageId;
    // Chỉ update biến, không reload tin nhắn
}
```

### 5.3 `reloadChatForSelectedPage(pageId)` - Reload khi đổi page

```javascript
window.reloadChatForSelectedPage = async function(pageId) {
    // 1. Search conversations by customer name trên page mới
    const searchResult = await pancakeDataManager.searchConversations(customerName, [pageId]);

    // 2. Filter theo type (INBOX/COMMENT)
    const filteredConversations = conversations.filter(c => c.type === targetType);

    // 3. Update conversation IDs
    currentConversationId = filteredConversations[0].id;

    // 4. Fetch messages
    const response = await pancakeDataManager.fetchMessagesForConversation(...);

    // 5. Render
    renderChatMessages(allChatMessages, true);

    // 6. Populate conversation selector (nếu nhiều conversations)
    if (filteredConversations.length > 1) {
        populateConversationSelector(filteredConversations, currentConversationId);
    }

    // 7. Re-setup realtime
    setupRealtimeMessages();
}
```

---

## 6. Conversation Selector

Khi 1 khách hàng có nhiều conversations (ví dụ: nhiều post khác nhau), hiển thị dropdown để chọn.

```javascript
window.populateConversationSelector = function(conversations, selectedConvId) {
    // Sort by updated_time descending
    const sorted = [...conversations].sort((a, b) => b.updated_time - a.updated_time);

    // Format: "[Icon] TYPE • thời gian - preview... (Page Name)"
    // Ví dụ: "📨 INBOX • 2 giờ trước - Chào bạn... (NhiJudyStore)"
}

window.onChatConversationChanged = async function(conversationId) {
    // Reload messages cho conversation đã chọn
    await window.reloadChatForSelectedConversation(selectedConv);
}
```

---

## 7. Mark Read/Unread

### 7.1 Auto Mark as Read

```javascript
function autoMarkAsRead(delayMs = 0) {
    // Debounce timer
    markReadTimer = setTimeout(async () => {
        // Skip nếu đã read hoặc là comment
        if (isRead || chatType === 'comment') return;

        const success = await pancakeDataManager.markConversationAsRead(pageId, conversationId);
        if (success) {
            currentConversationReadState.isRead = true;
            updateReadBadge(true);    // UI: ✅ Đã đọc (xanh)
            updateMarkButton(true);   // Button: "Đánh dấu chưa đọc"

            // Update local cache & re-render table
            pancakeDataManager.updateConversationReadStatus(conversationId, true);
            renderTable();
        }
    }, delayMs);
}
```

### 7.2 Toggle Read/Unread

```javascript
window.toggleConversationReadState = async function() {
    if (isRead) {
        await pancakeDataManager.markConversationAsUnread(pageId, conversationId);
    } else {
        await pancakeDataManager.markConversationAsRead(pageId, conversationId);
    }

    // Toggle state, update UI
    currentConversationReadState.isRead = !isRead;
    updateReadBadge(!isRead);
    updateMarkButton(!isRead);

    // Update cache & re-render
    pancakeDataManager.updateConversationReadStatus(conversationId, !isRead);
    renderTable();
}
```

### 7.3 UI States

| Trạng thái | Badge | Badge Color | Button Icon | Button Color |
|-----------|-------|-------------|-------------|--------------|
| Chưa đọc | "Chưa đọc" | Cam (#f59e0b) | fa-envelope | Xanh |
| Đã đọc | "Đã đọc" | Xanh (#10b981) | fa-envelope-open | Cam |

---

## 8. Message Reply Type Toggle

Khi order có comment, cho phép chọn kiểu trả lời:

```javascript
window.setMessageReplyType = function(type) {
    // type: 'reply_inbox' - Gửi qua Messenger
    // type: 'private_replies' - Gửi tin nhắn riêng từ comment

    messageReplyType = type;
    // Update UI toggle buttons
}

window.updateMessageReplyTypeToggle = function() {
    // Hiển thị toggle khi:
    // - currentChatType === 'message' (đang xem tin nhắn)
    // - Order có comment (purchaseCommentId && purchaseFacebookPostId)
}
```

---

## 9. Image Upload & Paste

### 9.1 Paste Image từ Clipboard

```javascript
function handleChatInputPaste(event) {
    const items = event.clipboardData.items;
    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            event.preventDefault();
            const blob = item.getAsFile();

            // Show preview (loading state)
            // Upload immediately
            const result = await uploadImageWithCache(blob, null, null, channelId);

            if (result.success) {
                window.uploadedImagesData.push({ ...result.data, blob });
            }
            updateMultipleImagesPreview();
        }
    }
}
```

### 9.2 File Input (Attachment Button)

```javascript
function handleFileInputChange(event) {
    Array.from(event.target.files).forEach(async (file) => {
        if (!file.type.startsWith('image/')) return;

        // Auto-compress nếu > 500KB
        // Upload to Pancake
        const result = await uploadImageWithCache(file, null, file.name, channelId);
        // Update preview
    });
}
```

### 9.3 `uploadImageWithCache()` - Upload với Firebase cache

```javascript
window.uploadImageWithCache = async function(imageBlob, productId, productName, channelId, productCode) {
    // 1. Check Firebase cache (nếu có productId)
    if (firebaseImageCache) {
        const cached = await firebaseImageCache.get(productId, productName, productCode);
        if (cached?.content_id) return { success: true, data: { ...cached, cached: true } };
    }

    // 2. Auto-compress nếu > 500KB
    if (imageBlob.size > 500 * 1024) {
        const compressed = await compressImage(imageBlob, 500*1024, 1920, 0.85);
        blobToUpload = compressed.blob;
    }

    // 3. Upload to Pancake
    const uploadResult = await pancakeDataManager.uploadImage(channelId, blobToUpload);

    // 4. Save to Firebase cache
    if (firebaseImageCache) {
        await firebaseImageCache.set(productId, productName, contentUrl, contentId, productCode);
    }

    return { success: true, data: { content_url, content_id, width, height } };
}
```

---

## 10. Avatar Zoom Modal

```javascript
window.openAvatarZoom = function(avatarUrl, senderName) {
    // Tạo modal fullscreen với:
    // - Overlay mờ đen (rgba(0,0,0,0.85))
    // - Ảnh phóng to (max 90vw x 80vh)
    // - Tên sender bên dưới
    // - Đóng: Click outside, nút Đóng, hoặc phím Escape
    // - Animation: fadeIn + zoomIn
}

window.closeAvatarZoom = function() {
    // Fade out 200ms rồi remove
}
```

---

## 11. Keyboard Shortcuts

| Phím | Hành động |
|------|-----------|
| Enter | Gửi tin nhắn |
| Shift + Enter | Xuống dòng mới |
| Escape | Đóng avatar zoom modal |
| Ctrl/Cmd + V | Paste ảnh từ clipboard |

---

## 12. Data Flow Diagram

```
Bảng đơn hàng (tab1-orders)
    │
    │ Click icon chat/comment
    ▼
openChatModal(orderId, channelId, psid, type)
    │
    ├─── [PARALLEL] ────────────────────────┐
    │                                        │
    │  Fetch Order Details (TPOS API)       Fetch Conversations (Pancake API)
    │  GET /api/odata/SaleOnline_Order      GET /conversations/customer/{fbId}
    │    ↓                                    ↓
    │  Lưu: purchaseCommentId,             Lưu: conversationId, customerUUID
    │        CRMTeam, Details                     ↓
    │    ↓                                   [PARALLEL]
    │  Render products table                getOrGeneratePageAccessToken(pageId)
    │                                            ↓
    │                                   fetchMessagesForConversation()
    │                                   GET /pages/{pageId}/conversations/{convId}/messages
    │                                            ↓
    │                                   renderChatMessages() / renderComments()
    │                                            ↓
    │                                   setupChatInfiniteScroll()
    │                                   setupRealtimeMessages()
    │
    └────────────────────────────────────────┘
```
