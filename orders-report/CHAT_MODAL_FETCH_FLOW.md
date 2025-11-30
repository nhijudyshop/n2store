# Chat Modal Fetch Flow - Complete Guide

## Overview

Khi mở modal chat (comment hoặc message), hệ thống thực hiện **4 fetch requests** theo thứ tự cụ thể để load đầy đủ thông tin.

---

## 📊 Fetch Flow Diagram

```
User clicks "Xem bình luận" / "Xem tin nhắn"
           ↓
    openChatModal(orderId, channelId, psid, type)
           ↓
┌──────────────────────────────────────────────────────┐
│  FETCH #1: Order Details (TPOS)                      │
│  → Load product details for order                    │
└──────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────┐
│  FETCH #2: Conversations (Pancake)                   │
│  → Get customer UUID mapping                         │
│  → Already cached by pancakeDataManager              │
└──────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────┐
│  FETCH #3: Comments/Messages (ChatOmni)              │
│  → Load conversation history                         │
└──────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────┐
│  FETCH #4: inbox_preview (Pancake) - Comments Only   │
│  → Get thread_id, thread_key, from_id for reply      │
└──────────────────────────────────────────────────────┘
           ↓
      Render Modal
```

---

## 🔄 Detailed Fetch Breakdown

### FETCH #1: Order Details (TPOS OData)

**Timing**: Ngay sau khi modal được show

**Purpose**: Load thông tin chi tiết đơn hàng và sản phẩm

**URL Pattern**:
```
GET https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order({orderId})?$expand=Details,Partner,User,CRMTeam
```

**Example**:
```
GET https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(d4430000-5d27-0015-db2f-08de24c0016a)?$expand=Details,Partner,User,CRMTeam
```

**Code Location**: `tab1-orders.js:4867-4890`

**Request**:
```javascript
const headers = await window.tokenManager.getAuthHeader();
const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
const response = await API_CONFIG.smartFetch(apiUrl, {
    headers: {
        ...headers,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
});
```

**Response Data**:
```json
{
    "Id": "d4430000-5d27-0015-db2f-08de24c0016a",
    "Code": "DH123456",
    "Name": "Tên khách hàng",
    "Telephone": "0901234567",
    "Details": [
        {
            "Id": "...",
            "ProductId": "...",
            "ProductName": "Tên sản phẩm",
            "Quantity": 2,
            "Price": 100000
        }
    ],
    "Partner": { ... },
    "User": { ... },
    "CRMTeam": { ... }
}
```

**What It's Used For**:
- Initialize product panel với full order data
- Show product details trong modal
- Được truyền vào `window.initChatModalProducts(fullOrderData)`

**Headers**:
- Authorization: Bearer token từ TPOS
- Content-Type: application/json
- Accept: application/json

---

### FETCH #2: Conversations (Pancake)

**Timing**: Background fetch - đã được load trước đó bởi `pancakeDataManager`

**Purpose**: Lấy mapping giữa Facebook PSID ↔ Pancake Customer UUID

**URL Pattern**:
```
GET https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake/conversations?pages[{pageId1}]=0&pages[{pageId2}]=0&unread_first=true&mode=OR&tags="ALL"&except_tags=[]&access_token={jwt_token}&cursor_mode=true&from_platform=web
```

**Example**:
```
GET https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake/conversations?pages[270136663390370]=0&pages[117267091364524]=0&unread_first=true&mode=OR&tags=%22ALL%22&except_tags=[]&access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...&cursor_mode=true&from_platform=web
```

**Code Location**: `pancake-data-manager.js:169-173`

**Request**:
```javascript
const url = window.API_CONFIG.buildUrl.pancake('conversations', queryString);
const response = await API_CONFIG.smartFetch(url, {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});
```

**Response Data**:
```json
{
    "data": [
        {
            "id": "conversation_id_123",
            "type": "INBOX" | "COMMENT",
            "from_psid": "24948162744877764",
            "from": {
                "id": "123456789",
                "name": "Tên khách hàng"
            },
            "customers": [
                {
                    "uuid": "658ffee5-09b2-40e9-94de-b7c87afb45b9",  // ← IMPORTANT!
                    "id": "658ffee5-09b2-40e9-94de-b7c87afb45b9",
                    "name": "Tên khách hàng",
                    "phone": "0901234567"
                }
            ],
            "page": {
                "id": "117267091364524",
                "name": "Page Name"
            },
            "last_message": {
                "message": "Last message text",
                "created_time": "2024-01-01T00:00:00+0000"
            }
        }
    ],
    "paging": { ... }
}
```

**What It's Used For**:
- Cache conversation data trong `pancakeDataManager`
- Map Facebook PSID → Pancake Customer UUID
- Customer UUID được dùng cho FETCH #4 (inbox_preview)

**Headers**:
- Content-Type: application/json
- Accept: application/json

**Note**:
- Fetch này thường đã chạy trước khi modal mở
- Data được cache trong memory
- Khi mở modal, code check cache trước: `pancakeDataManager.getConversationByUserId(psid)`
- Nếu không có trong cache, fetch lại: `pancakeDataManager.fetchConversations(true)`

---

### FETCH #3: Comments/Messages (ChatOmni)

**Timing**: Sau khi modal show, song song hoặc sau FETCH #1

**Purpose**: Load danh sách comments hoặc messages của conversation

#### For Comments (type='comment'):

**URL Pattern**:
```
GET https://chatomni-proxy.nhijudyshop.workers.dev/api/api-ms/chatomni/v1/messages/comments?type=4&channelId={pageId}&userId={psid}
```

**Example**:
```
GET https://chatomni-proxy.nhijudyshop.workers.dev/api/api-ms/chatomni/v1/messages/comments?type=4&channelId=117267091364524&userId=24948162744877764
```

**Code Location**: `tab1-orders.js:5079` → `chat-data-manager.js:259-280`

**Request**:
```javascript
const headers = await window.tokenManager.getAuthHeader();
let url = `${API_BASE}/messages/comments?type=4&channelId=${channelId}&userId=${userId}`;
const response = await fetch(url, {
    method: 'GET',
    headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});
```

**Response Data**:
```json
{
    "comments": [
        {
            "Id": "817929370998475",
            "ParentId": null,  // Root comment
            "Message": "Comment text",
            "CreatedTime": "2024-01-01T00:00:00Z",
            "From": {
                "Id": "123456789",
                "Name": "User name"
            },
            "Attachment": {
                "Type": "photo",
                "Url": "https://..."
            }
        },
        {
            "Id": "817929370998476",
            "ParentId": "817929370998475",  // Reply to above
            "Message": "Reply text",
            "CreatedTime": "2024-01-01T01:00:00Z",
            "From": {
                "Id": "117267091364524",  // Page reply
                "Name": "Page name"
            }
        }
    ],
    "after": "cursor_for_next_page",
    "before": "cursor_for_prev_page"
}
```

**What It's Used For**:
- Render comments trong modal
- Lấy `currentParentCommentId` từ root comment
- Construct `conversationId` = `${postId}_${parentCommentId}`
- Support pagination với cursor

**Headers**:
- Authorization: Bearer token từ ChatOmni (TPOS token)
- Content-Type: application/json
- Accept: application/json

#### For Messages (type='message'):

**URL Pattern**:
```
GET https://chatomni-proxy.nhijudyshop.workers.dev/api/api-ms/chatomni/v1/messages?channelId={pageId}&userId={psid}
```

**Similar structure but returns messages instead of comments**

---

### FETCH #4: inbox_preview (Pancake) - **Comments Only**

**Timing**: SAU khi đã có customer UUID từ FETCH #2

**Purpose**: Lấy thread info để reply comment qua inbox

**URL Pattern**:
```
GET https://pancake.vn/api/v1/pages/{pageId}/customers/{customerUuid}/inbox_preview?access_token={jwt_token}
```

**Example**:
```
GET https://pancake.vn/api/v1/pages/117267091364524/customers/658ffee5-09b2-40e9-94de-b7c87afb45b9/inbox_preview?access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Code Location**: `tab1-orders.js:5013-5072`

**Request**:
```javascript
const token = await window.pancakeTokenManager.getToken();
const inboxPreviewUrl = window.API_CONFIG.buildUrl.pancake(
    `pages/${channelId}/customers/${pancakeCustomerUuid}/inbox_preview`,
    `access_token=${token}`
);
const inboxResponse = await API_CONFIG.smartFetch(inboxPreviewUrl, {
    method: 'GET',
    headers: {
        'Accept': 'application/json'
    }
});
```

**Response Data**:
```json
{
    "thread_id_preview": "t_1234567890",
    "thread_key_preview": "INBOX",
    "thread_id": "t_1234567890",
    "thread_key": "INBOX",
    "from_id": "123456789",
    "inbox_conv_id": "conversation_id_123",
    "can_inbox": true,
    "data": [
        {
            "id": "msg_id_1",
            "message": "Message text",
            "from": {
                "id": "123456789",      // Customer FB ID
                "name": "Customer name"
            },
            "to": {
                "data": [
                    {
                        "id": "117267091364524",  // Page ID
                        "name": "Page name"
                    }
                ]
            },
            "created_time": "2024-01-01T00:00:00+0000"
        }
    ]
}
```

**What It's Used For**:
- Extract `threadId` (từ `thread_id_preview` hoặc `thread_id`)
- Extract `threadKey` (từ `thread_key_preview` hoặc `thread_key`)
- Extract `fromId` từ first customer message (skip page messages)
- Save vào global variable `inboxPreviewData` để dùng khi reply

**Headers**:
- Accept: application/json
- Cookie: jwt={token} (tự động từ browser khi fetch trực tiếp)

**Important Notes**:
- ⚠️ **CHỈ chạy cho type='comment'**, không chạy cho messages
- ⚠️ **Phụ thuộc vào customer UUID** từ FETCH #2
- ⚠️ Nếu conversation không có trong cache, phải fetch lại conversations trước
- ⚠️ Fetch này có thể **fail** nếu không tìm thấy customer UUID

**Code Flow**:
```javascript
// Step 1: Get Facebook PSID from order
const facebookPsid = order.Facebook_ASUserId;

// Step 2: Find conversation in Pancake cache
let conversation = window.pancakeDataManager.getConversationByUserId(facebookPsid);

// Step 3: If not found, fetch from Pancake API
if (!conversation) {
    await window.pancakeDataManager.fetchConversations(true);
    conversation = window.pancakeDataManager.getConversationByUserId(facebookPsid);
}

// Step 4: Extract customer UUID
if (conversation && conversation.customers && conversation.customers.length > 0) {
    pancakeCustomerUuid = conversation.customers[0].uuid || conversation.customers[0].id;
}

// Step 5: Fetch inbox_preview with customer UUID
if (pancakeCustomerUuid) {
    const token = await window.pancakeTokenManager.getToken();
    const url = `pages/${channelId}/customers/${pancakeCustomerUuid}/inbox_preview?access_token=${token}`;
    // ... fetch and process
}
```

---

## 🔑 Key Dependencies

### FETCH #1 → Independent
- Không phụ thuộc vào fetch nào khác
- Chỉ cần `orderId`

### FETCH #2 → Independent (Background)
- Fetch sẵn trong background
- Cached by `pancakeDataManager`

### FETCH #3 → Independent
- Chỉ cần `channelId` và `psid` (có từ order data)

### FETCH #4 → DEPENDS ON FETCH #2
- **MUST HAVE** customer UUID từ conversations
- Nếu không có → fetch conversations trước
- Nếu vẫn không có → skip (không thể inbox reply)

---

## 📝 Variables Flow Summary

### Input Variables (from openChatModal):
```javascript
orderId   = 'd4430000-5d27-0015-db2f-08de24c0016a'  // From user click
channelId = '117267091364524'                       // From order.Facebook_PostId (parse)
psid      = '24948162744877764'                     // From order.Facebook_ASUserId
type      = 'comment' | 'message'                   // From user click
```

### Derived Variables:

**From FETCH #1 (Order)**:
```javascript
fullOrderData = { Details: [...], Partner: {...}, ... }
```

**From FETCH #2 (Conversations)**:
```javascript
pancakeCustomerUuid = '658ffee5-09b2-40e9-94de-b7c87afb45b9'
// conversation.customers[0].uuid
```

**From FETCH #3 (Comments/Messages)**:
```javascript
allChatComments = [...]              // Comment list
currentParentCommentId = '817929370998475'  // Root comment ID
conversationId = '1382798016618291_817929370998475'  // postId_commentId
```

**From FETCH #4 (inbox_preview)**:
```javascript
inboxPreviewData = {
    threadId: 't_1234567890',        // For inbox reply
    threadKey: 'INBOX',              // For inbox reply
    fromId: '123456789',             // Customer FB ID
    inboxConvId: 'conversation_id_123',
    canInbox: true
}
```

---

## 🚨 Error Handling

### FETCH #1 Fails:
- **Impact**: Không có product details
- **Fallback**: Dùng basic order data từ allData[]
- **Modal**: Vẫn mở được, chỉ thiếu product info

### FETCH #2 Fails or No Customer UUID:
- **Impact**: Không thể fetch inbox_preview
- **Fallback**: Skip FETCH #4
- **Modal**: Vẫn mở được, nhưng KHÔNG thể inbox reply cho comment

### FETCH #3 Fails:
- **Impact**: Không có comments/messages để hiển thị
- **Fallback**: Show error message
- **Modal**: Mở nhưng empty

### FETCH #4 Fails:
- **Impact**: Không có thread info
- **Fallback**: Không thể dùng inbox reply, chỉ dùng comment reply
- **Modal**: Vẫn hoạt động bình thường cho public comment reply

---

## 🔍 Debug Commands

### Check All Fetch Status:
```javascript
// In console when modal is open

// Check order data
console.log('Order loaded:', window.currentOrder);

// Check conversations cache
console.log('Conversations cache:', {
    inbox_psid: window.pancakeDataManager.inboxMapByPSID.size,
    comment_psid: window.pancakeDataManager.commentMapByPSID.size
});

// Check comments/messages
console.log('Comments loaded:', window.allChatComments?.length);
console.log('Messages loaded:', window.allChatMessages?.length);

// Check inbox_preview data
console.log('inbox_preview data:', window.inboxPreviewData);
console.log('Has threadId?', !!window.inboxPreviewData?.threadId);
console.log('Has fromId?', !!window.inboxPreviewData?.fromId);
```

### Monitor Network:
1. Open DevTools → Network tab
2. Filter by "Fetch/XHR"
3. Open comment modal
4. Look for 4 requests in order:
   - `SaleOnline_Order(...)?$expand=...`
   - `conversations?pages=...`
   - `messages/comments?type=4&channelId=...`
   - `inbox_preview?access_token=...`

---

## 📊 Timing Comparison

Typical fetch times (production):

| Fetch | Endpoint | Avg Time | Can Fail? |
|-------|----------|----------|-----------|
| #1 Order | TPOS OData | 200-500ms | Rare |
| #2 Conversations | Pancake API | 300-800ms | Sometimes (cached) |
| #3 Comments | ChatOmni | 150-400ms | Rare |
| #4 inbox_preview | Pancake API | 200-500ms | Sometimes |

**Total modal open time**: ~1-2 seconds

---

## 🎯 Why This Order?

1. **FETCH #1 first**: Cần order details để init product panel ngay
2. **FETCH #2 background**: Conversations được cache sẵn, dùng khi cần
3. **FETCH #3 parallel**: Có thể fetch ngay, không phụ thuộc #1 hoặc #2
4. **FETCH #4 last**: Phụ thuộc vào customer UUID từ #2, chỉ cần cho reply feature

**Optimization**: FETCH #1 và #3 có thể chạy song song vì không phụ thuộc nhau!

---

## 📚 Related Files

| File | Purpose |
|------|---------|
| `tab1-orders.js:4820-5200` | Main `openChatModal` function |
| `chat-data-manager.js` | Fetch comments/messages |
| `pancake-data-manager.js` | Fetch conversations |
| `pancake-token-manager.js` | Manage JWT tokens |
| `api-config.js` | Build URLs and smartFetch |
