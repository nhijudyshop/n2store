# PART 2: PANCAKE DATA MANAGER

## Tổng quan

`PancakeDataManager` là data layer chính, quản lý tất cả tương tác với Pancake.vn API: fetch pages, conversations, messages, search, upload media, mark read/unread.

**Source file:** `orders-report/js/managers/pancake-data-manager.js` (~2,600 lines)

---

## 1. Request Queue System (Rate Limiting)

Pancake API giới hạn tốc độ request. Hệ thống queue đảm bảo chỉ 1 request/lần với khoảng cách tối thiểu 1.5s.

### 1.1 PancakeRequestQueue Class

```javascript
class PancakeRequestQueue {
    constructor(maxConcurrent = 1, minInterval = 1500) {
        this.queue = [];
        this.running = 0;
        this.maxConcurrent = maxConcurrent;   // Tối đa 1 request đồng thời
        this.minInterval = minInterval;         // 1500ms giữa các request
        this.lastRequestTime = 0;
        this.pendingRequests = new Map();        // Deduplication map
    }
}
```

### 1.2 Request Deduplication

Nếu cùng 1 request (cùng `dedupeKey`) đang pending, sẽ reuse promise thay vì gửi lại:

```javascript
async add(fn, dedupeKey = null) {
    // Nếu request giống đang chạy, trả về promise cũ
    if (dedupeKey && this.pendingRequests.has(dedupeKey)) {
        return this.pendingRequests.get(dedupeKey);
    }

    const promise = new Promise((resolve, reject) => {
        this.queue.push({ fn, resolve, reject, dedupeKey });
        this.process();
    });

    if (dedupeKey) {
        this.pendingRequests.set(dedupeKey, promise);
        promise.finally(() => this.pendingRequests.delete(dedupeKey));
    }

    return promise;
}
```

### 1.3 Queue Processing

```javascript
async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const waitTime = Math.max(0, this.minInterval - timeSinceLastRequest);

    if (waitTime > 0) {
        setTimeout(() => this.process(), waitTime);
        return;
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();
    this.lastRequestTime = Date.now();

    try {
        const result = await fn();
        resolve(result);
    } catch (error) {
        reject(error);
    } finally {
        this.running--;
        if (this.queue.length > 0) this.process();
    }
}
```

**Global instance:**
```javascript
const pancakeRequestQueue = new PancakeRequestQueue(1, 1500);
```

---

## 2. PancakeDataManager Class

### 2.1 Constructor & Properties

```javascript
class PancakeDataManager {
    constructor() {
        // Data cache
        this.conversations = [];              // Danh sách conversations đã fetch
        this.pages = [];                       // Danh sách Facebook Pages
        this.pageIds = [];                     // Array page IDs

        // Conversation Maps (O(1) lookup)
        this.inboxMapByPSID = new Map();       // INBOX conversations indexed by PSID
        this.inboxMapByFBID = new Map();       // INBOX conversations indexed by Facebook ID
        this.commentMapByPSID = new Map();     // COMMENT conversations indexed by PSID
        this.commentMapByFBID = new Map();     // COMMENT conversations indexed by Facebook ID
        this.conversationsByCustomerFbId = new Map(); // All conversations by customers[].fb_id

        // Loading states
        this.isLoading = false;
        this.isLoadingPages = false;

        // Cache timing
        this.lastFetchTime = null;
        this.lastPageFetchTime = null;
        this.CACHE_DURATION = 5 * 60 * 1000;          // 5 phút
        this.UNREAD_CACHE_DURATION = 2 * 60 * 1000;   // 2 phút

        // Rate limiting
        this.lastRequestTime = 0;
        this.MIN_REQUEST_INTERVAL = 1000;

        // Singleton promises (prevent concurrent calls)
        this._initializePromise = null;
        this._fetchPagesPromise = null;
        this._fetchConversationsPromise = null;

        // Session/Local storage keys
        this.CONVERSATIONS_CACHE_KEY = 'pancake_conversations_cache';
    }
}
```

---

## 3. Fetch Pages

### 3.1 `fetchPages(forceRefresh)` - Lấy danh sách Facebook Pages

**API Endpoint:** `GET /api/v1/pages?access_token={jwt}`
**Proxy URL:** `{WORKER}/api/pancake/pages?access_token={jwt}`

```javascript
async fetchPages(forceRefresh = false) {
    // Cache layers:
    // 1. Memory cache (this.pages) - 5 phút
    // 2. localStorage ('tpos_pancake_pages_cache') - 30 phút
    // 3. API call (with retry + exponential backoff)

    // Singleton pattern: nếu đang fetch, return promise hiện tại
    if (this._fetchPagesPromise) return this._fetchPagesPromise;

    const token = await this.getToken();
    const url = API_CONFIG.buildUrl.pancake('pages', `access_token=${token}`);

    // Retry logic: 3 lần, delay 2s → 4s → 8s
    const response = await this.queuedFetch(url, {...}, 'fetchPages');

    // Response format:
    // {
    //   success: true,
    //   categorized: {
    //     activated: [{ id, name, page_id, fb_page_id, settings, ... }],
    //     activated_page_ids: ["117267091364524", "270136663390370"]
    //   }
    // }

    this.pages = data.categorized.activated;
    this.pageIds = data.categorized.activated_page_ids;

    // Auto-extract page_access_tokens từ settings
    this.extractAndCachePageAccessTokens(this.pages);

    // Save to localStorage
    this.savePagesToLocalStorage();
}
```

### 3.2 `extractAndCachePageAccessTokens(pages)` - Tự động lấy page tokens

```javascript
extractAndCachePageAccessTokens(pages) {
    for (const page of pages) {
        const pageAccessToken = page.settings?.page_access_token;
        if (pageAccessToken) {
            tokensToSave[page.id] = {
                token: pageAccessToken,
                pageId: page.id,
                pageName: page.name,
                savedAt: Date.now()
            };
        }
    }
    // Merge & save to localStorage
    pancakeTokenManager.pageAccessTokens = { ...existing, ...tokensToSave };
    pancakeTokenManager.savePageAccessTokensToLocalStorage();
}
```

### 3.3 `fetchPagesWithUnreadCount()` - Pages + số tin chưa đọc

**API Endpoint:** `GET /api/v1/pages/unread_conv_pages_count?access_token={jwt}`

```javascript
async fetchPagesWithUnreadCount(forceRefresh = false) {
    // Cache: 2 phút (this.unreadPagesCache)

    // Response format:
    // {
    //   success: true,
    //   data: [
    //     { page_id: "117267091364524", unread_conv_count: 5 },
    //     { page_id: "270136663390370", unread_conv_count: 2 }
    //   ]
    // }

    // Merge với cached pages để có tên page
    return data.data.map(item => ({
        page_id: item.page_id,
        unread_conv_count: item.unread_conv_count || 0,
        page_name: cachedPage?.name || item.page_id
    }));
}
```

---

## 4. Fetch Conversations

### 4.1 `fetchConversations(forceRefresh)` - Lấy danh sách hội thoại

**API Endpoint:** `GET /api/v1/conversations?pages[{pageId}]=0&unread_first=true&mode=OR&tags="ALL"&except_tags=[]&access_token={jwt}&cursor_mode=true&from_platform=web`

```javascript
async fetchConversations(forceRefresh = false) {
    // Cache layers:
    // 1. Memory (this.conversations) - 5 phút
    // 2. sessionStorage (survives page refresh) - 5 phút
    // 3. API call

    // Fetch pages first (cần pageIds)
    if (this.pageIds.length === 0) await this.fetchPages();

    const pagesParams = this.pageIds.map(id => `pages[${id}]=0`).join('&');
    const url = API_CONFIG.buildUrl.pancake('conversations', queryString);

    // Retry: 3 lần, exponential backoff 2s → 4s → 8s (max 10s)

    // Response format:
    // {
    //   conversations: [
    //     {
    //       id: "conv_id_string",
    //       type: "INBOX" | "COMMENT",
    //       page_id: "117267091364524",
    //       from_psid: "1234567890",        // null cho COMMENT
    //       from: { id: "fb_user_id", name: "Tên" },
    //       customers: [{ id: "uuid", fb_id: "fb_id", name: "..." }],
    //       snippet: "Tin nhắn cuối...",
    //       last_message: { text: "...", from: {...}, created_time: "..." },
    //       unread_count: 3,
    //       seen: false,
    //       updated_at: "2024-01-15T10:30:00Z",
    //       updated_time: 1705312200,
    //       tags: [{ id: "tag_id", name: "Tag Name", color: "#ff0000" }]
    //     },
    //     ...
    //   ]
    // }

    this.conversations = data.conversations;
    this.buildConversationMap();          // Build O(1) lookup maps
    this.saveConversationsToSessionStorage();
}
```

### 4.2 `buildConversationMap()` - Xây dựng Maps cho lookup nhanh

```javascript
buildConversationMap() {
    // Clear all maps
    this.inboxMapByPSID.clear();
    this.inboxMapByFBID.clear();
    this.commentMapByPSID.clear();
    this.commentMapByFBID.clear();
    this.conversationsByCustomerFbId.clear();

    this.conversations.forEach(conv => {
        if (conv.type === 'INBOX') {
            if (conv.from_psid) this.inboxMapByPSID.set(conv.from_psid, conv);
            if (conv.from?.id) this.inboxMapByFBID.set(conv.from.id, conv);
        } else if (conv.type === 'COMMENT') {
            if (conv.from_psid) this.commentMapByPSID.set(conv.from_psid, conv);
            if (conv.from?.id) this.commentMapByFBID.set(conv.from.id, conv);
        }

        // Map by customers[].fb_id (critical cho COMMENT)
        conv.customers?.forEach(customer => {
            if (customer.fb_id) {
                this.conversationsByCustomerFbId.set(customer.fb_id, conv);
            }
        });
    });
}
```

### 4.3 `getConversationByUserId(userId)` - Tìm conversation

Thứ tự tìm kiếm:
```
1. inboxMapByPSID[userId]
2. inboxMapByFBID[userId]
3. commentMapByFBID[userId]
4. commentMapByPSID[userId]
5. conversationsByCustomerFbId[userId]  ← Critical cho COMMENT
```

---

## 5. Search Conversations

### 5.1 `searchConversations(query, pageIds)` - Tìm kiếm hội thoại

**API Endpoint:** `POST /api/v1/conversations/search?q={query}&access_token={jwt}&cursor_mode=true`
**Body:** FormData với `page_ids` = comma-separated list

```javascript
async searchConversations(query, pageIds = null) {
    const encodedQuery = encodeURIComponent(query);
    const url = API_CONFIG.buildUrl.pancake('conversations/search', queryString);

    const formData = new FormData();
    formData.append('page_ids', pageIdsParam);

    const response = await this.queuedFetch(url, {
        method: 'POST',
        body: formData
    }, `searchConversations:${query}`);

    // Returns: { conversations: [...], customerId: string|null }
}
```

### 5.2 `fetchConversationsByCustomerFbId(pageId, fbId)` - Tìm theo FB ID

**API Endpoint:** `GET /api/v1/conversations/customer/{fbId}?pages[{pageId}]=0&access_token={jwt}`

```javascript
async fetchConversationsByCustomerFbId(pageId, fbId) {
    const url = API_CONFIG.buildUrl.pancake(
        `conversations/customer/${fbId}`,
        `pages[${pageId}]=0&access_token=${token}`
    );

    // Returns: { conversations: [...], customerUuid: string|null, success: boolean }
}
```

---

## 6. Fetch Messages

### 6.1 `fetchMessagesForConversation(pageId, conversationId, currentCount, customerId)` - Lấy tin nhắn

**API Endpoint (Official):** `GET /pages/{pageId}/conversations/{conversationId}/messages?page_access_token={token}&customer_id={uuid}`
**Proxy URL:** `{WORKER}/api/pancake-official/pages/{pageId}/conversations/{conversationId}/messages`

```javascript
async fetchMessagesForConversation(pageId, conversationId, currentCount, customerId, preloadedPageAccessToken) {
    const pageAccessToken = preloadedPageAccessToken
        || await pancakeTokenManager.getOrGeneratePageAccessToken(pageId);

    let extraParams = '';
    if (currentCount !== null) extraParams += `&current_count=${currentCount}`;
    if (customerId !== null) extraParams += `&customer_id=${customerId}`;

    const url = API_CONFIG.buildUrl.pancakeOfficial(
        `pages/${pageId}/conversations/${conversationId}/messages`,
        pageAccessToken
    ) + extraParams;

    // Response format:
    // {
    //   messages: [
    //     {
    //       id: "msg_id",
    //       message: "<p>Nội dung tin nhắn</p>",        // HTML format
    //       original_message: "Nội dung tin nhắn",        // Plain text
    //       from: { id: "sender_id", name: "Sender Name" },
    //       inserted_at: "2024-01-15T10:30:00Z",
    //       created_time: "2024-01-15T10:30:00Z",
    //       attachments: [{ type: "image", url: "..." }],
    //       seen: true,
    //       parent_id: "parent_msg_id"                    // Cho comment reply
    //     }
    //   ],
    //   conversation: { ... },
    //   customers: [{ id: "uuid", fb_id: "...", name: "..." }]
    // }

    return { messages, conversation, customers, customerId };
}
```

### 6.2 `fetchInboxPreview(pageId, customerId)` - Lấy preview & conversationId

**API Endpoint:** `GET /api/v1/pages/{pageId}/customers/{customerId}/inbox_preview?access_token={jwt}`

```javascript
async fetchInboxPreview(pageId, customerId) {
    // Response format:
    // {
    //   success: true,
    //   inbox_conv_id: "inbox_conversation_id",      // INBOX conversation ID
    //   comment_conv_id: "comment_conversation_id",  // COMMENT conversation ID
    //   thread_id: "...",
    //   thread_key: "...",
    //   can_inbox: true,
    //   from_id: "customer_fb_id",
    //   data: [ /* preview messages */ ],
    //   updated_at: "2024-01-15T10:30:00Z"
    // }

    return {
        conversationId,                // Default (inbox)
        inboxConversationId,           // Explicit inbox
        commentConversationId,         // Explicit comment
        messages: data.data,
        threadId, threadKey, fromId,
        canInbox: data.can_inbox,
        success: true
    };
}
```

### 6.3 `fetchMessages(pageId, psid, cursorOrCount, customerId)` - Wrapper tương thích

```javascript
async fetchMessages(pageId, psid, cursorOrCount, customerId) {
    // Tìm conversationId từ cache hoặc API
    let convId = null;
    let custId = customerId;

    // 1. Check inboxMapByPSID / inboxMapByFBID
    const cachedConv = this.inboxMapByPSID.get(psid) || this.inboxMapByFBID.get(psid);
    if (cachedConv) {
        convId = cachedConv.id;
        custId = cachedConv.customers?.[0]?.id;
    }

    // 2. Search in conversations array
    // 3. Fallback: fetch conversation info from API
    // 4. Default format: `${pageId}_${psid}`

    return await this.fetchMessagesForConversation(pageId, convId, currentCount, custId);
}
```

### 6.4 `fetchComments(pageId, psid, conversationId, postId, customerName)` - Lấy bình luận

```javascript
async fetchComments(pageId, psid, conversationId, postId, customerName) {
    // Tìm COMMENT conversation matching cả fb_id VÀ post_id
    // Vì cùng 1 khách có thể comment trên NHIỀU post khác nhau

    // Thứ tự tìm:
    // 1. Conversations trong memory (match postId + psid)
    // 2. Fetch trực tiếp theo fb_id (API call)
    // 3. commentMapByFBID / commentMapByPSID (không có postId)
    // 4. conversationsByCustomerFbId (fallback)

    const result = await this.fetchMessagesForConversation(pageId, convId, null, customerId);

    // Map messages → comments format (tương thích comment-modal.js)
    const comments = result.messages.map(msg => ({
        Id: msg.id,
        Message: msg.original_message || msg.message?.replace(/<[^>]*>/g, ''),
        CreatedTime: msg.inserted_at,
        IsOwner: msg.from?.id === pageId,
        PostId: msg.page_id ? `${msg.page_id}_${msg.parent_id?.split('_')[0]}` : null,
        ParentId: msg.parent_id !== msg.id ? msg.parent_id : null,
        FacebookId: msg.id,
        Attachments: msg.attachments || [],
        Status: msg.seen ? 10 : 30,    // 30 = New, 10 = Seen
        from: msg.from
    }));

    return { comments, messages: result.messages, conversation: result.conversation };
}
```

---

## 7. Order Integration Methods

### 7.1 `getUnreadInfoForOrder(order)` - Kiểm tra tin chưa đọc

```javascript
getUnreadInfoForOrder(order) {
    const conversation = this.getConversationByUserId(order.Facebook_ASUserId);
    if (!conversation) return { hasUnread: false, unreadCount: 0 };

    return {
        hasUnread: conversation.seen === false && conversation.unread_count > 0,
        unreadCount: conversation.unread_count || 0
    };
}
```

### 7.2 `getLastMessageForOrder(order)` - Tin nhắn cuối (INBOX only)

```javascript
getLastMessageForOrder(order) {
    // Chỉ tìm trong inboxMapByPSID / inboxMapByFBID

    const lastMessage = conversation.last_message?.text
        || conversation.last_message?.message
        || conversation.snippet;

    return {
        message: lastMessage,
        messageType: 'text' | 'attachment',
        hasUnread, unreadCount,
        attachments,
        type: 'message',
        pageId: conversation.page_id,
        customerId: conversation.customers[0]?.id,
        lastMessageTime,
        canSendMessage: hoursSinceLastMessage < 24  // 24h policy check
    };
}
```

### 7.3 `getLastCommentForOrder(order)` - Comment cuối (COMMENT only)

```javascript
getLastCommentForOrder(order) {
    // Chỉ tìm trong commentMapByFBID / commentMapByPSID

    return {
        message: conversation.snippet,
        messageType: 'text',
        hasUnread, unreadCount,
        type: 'comment',
        conversationId: conversation.id,
        pageId: conversation.page_id
    };
}
```

### 7.4 `getChatInfoForOrder(order)` - Thông tin chat cơ bản

```javascript
getChatInfoForOrder(order) {
    const psid = order.Facebook_ASUserId;
    const channelId = this.parseChannelId(order.Facebook_PostId); // Lấy pageId từ PostId

    return {
        channelId,      // Facebook Page ID
        psid,           // Customer PSID
        hasChat: !!(psid && channelId)
    };
}
```

---

## 8. Mark Read/Unread

### 8.1 `markConversationAsRead(pageId, conversationId)`

**API Endpoint (Official):** `POST /pages/{pageId}/conversations/{conversationId}/read?page_access_token={token}`

```javascript
async markConversationAsRead(pageId, conversationId) {
    const pageAccessToken = await pancakeTokenManager.getOrGeneratePageAccessToken(pageId);
    const url = API_CONFIG.buildUrl.pancakeOfficial(
        `pages/${pageId}/conversations/${conversationId}/read`,
        pageAccessToken
    );
    const response = await fetch(url, { method: 'POST' });
    return data.success !== false;
}
```

### 8.2 `markConversationAsUnread(pageId, conversationId)`

**API Endpoint (Official):** `POST /pages/{pageId}/conversations/{conversationId}/unread?page_access_token={token}`

### 8.3 `updateConversationReadStatus(conversationId, isRead)` - Update local cache

```javascript
updateConversationReadStatus(conversationId, isRead) {
    // Update in conversations array
    const conv = this.conversations.find(c => c.id === conversationId);
    conv.seen = isRead;
    conv.unread_count = isRead ? 0 : (conv.unread_count || 1);

    // Update in ALL maps (consistency)
    [inboxMapByPSID, inboxMapByFBID, commentMapByPSID, commentMapByFBID].forEach(map => {
        for (const [key, conv] of map) {
            if (conv.id === conversationId) {
                conv.seen = isRead;
                conv.unread_count = isRead ? 0 : (conv.unread_count || 1);
            }
        }
    });
}
```

---

## 9. Image Upload

### 9.1 `uploadImage(pageId, file)` - Upload ảnh lên Pancake

**API Endpoint:** `POST /api/v1/pages/{pageId}/contents?access_token={jwt}`
**Content-Type:** `multipart/form-data`

```javascript
async uploadImage(pageId, file, allowFallback = true) {
    const formData = new FormData();
    formData.append('file', file, file.name || 'image.jpg');

    const url = API_CONFIG.buildUrl.pancake(
        `pages/${pageId}/contents`,
        `access_token=${accessToken}`
    );

    // Response format:
    // {
    //   data: [{
    //     id: "uuid-content-id",                          // Content ID
    //     content_url: "https://content.pancake.vn/.../image.jpg",
    //     content_preview_url: "https://content.pancake.vn/..._thumb.jpg",
    //     image_data: { height: 2400, width: 800 },
    //     name: "image.png",
    //     fb_id: "..."
    //   }],
    //   success: true
    // }

    // Fallback: imgbb nếu Pancake server error (500/502/503)
    // uploadToImgbb(file) → { url, delete_url }
}
```

### 9.2 `deleteImage(pageId, contentId)` - Xóa ảnh

**API Endpoint:** `DELETE /api/v1/pages/{pageId}/contents?ids={contentId}&access_token={jwt}`

---

## 10. 24-Hour Messaging Policy

### 10.1 `check24HourWindow(pageId, conversationId, customerId)`

```javascript
async check24HourWindow(pageId, conversationId, customerId) {
    // 1. Fetch messages
    const { messages } = await this.fetchMessagesForConversation(pageId, conversationId, null, customerId);

    // 2. Tìm tin nhắn cuối từ KHÁCH (không phải page)
    const lastCustomerMsg = this.findLastCustomerMessage(messages, pageId);

    // 3. Tính thời gian
    const hoursSinceLastMessage = (now - lastMsgDate) / (1000 * 60 * 60);
    const canSend = hoursSinceLastMessage < 24;

    return { canSend, hoursSinceLastMessage, lastCustomerMessage, reason };
}
```

### 10.2 `findLastCustomerMessage(messages, pageId)`

```javascript
findLastCustomerMessage(messages, pageId) {
    // Messages sorted newest first
    for (const msg of messages) {
        const isFromPage = msg.from?.id === pageId;
        if (!isFromPage) return msg; // First non-page message = last customer message
    }
    return null;
}
```

---

## 11. Caching Strategy Summary

| Data | Cache Layer | TTL | Storage Key |
|------|------------|-----|-------------|
| Pages | Memory → localStorage | 5 min (memory) / 30 min (localStorage) | `tpos_pancake_pages_cache` |
| Conversations | Memory → sessionStorage | 5 min | `pancake_conversations_cache` |
| Unread count | Memory | 2 min | N/A |
| Messages | None (luôn fetch mới) | N/A | N/A |
| Page tokens | Memory → localStorage → Firestore | Không hết hạn | `pancake_page_access_tokens` |

---

## 12. Initialization Flow

```javascript
async initialize() {
    // Singleton pattern
    if (this._initializePromise) return this._initializePromise;

    // 1. Get JWT token
    await this.getToken();

    // 2. Fetch pages (sequential - tránh rate limit)
    await this.fetchPages();

    // 3. Fetch conversations
    await this.fetchConversations();
}
```

---

## 13. Global Instance

```javascript
window.pancakeDataManager = new PancakeDataManager();
```
