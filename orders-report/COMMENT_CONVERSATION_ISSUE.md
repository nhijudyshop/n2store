# Comment Conversation Mapping Issue

## ✅ FIXED

**Fix implemented in**: `pancake-data-manager.js`
- Constructor (line 13): Added `conversationsByCustomerFbId` Map
- `buildConversationMap()` (lines 246-254): Build index by `customers[].fb_id`
- `getConversationByUserId()` (lines 294-304): O(1) Map lookup fallback

Enhanced conversation lookup to index and search by `customers[].fb_id` using a Map for O(1) performance. This handles COMMENT conversations where:
- `from_psid` is null
- `order.Facebook_ASUserId` doesn't match `conversation.from.id`
- The correct match is in `customers[].fb_id`

**Solution**: Added `conversationsByCustomerFbId` Map that indexes all conversations by their customers' Facebook IDs. This provides efficient O(1) lookup instead of O(n) iteration.

---

## ❌ Problem (Original)

Khi mở comment modal, không tìm thấy conversation trong Pancake cache → không lấy được customer UUID → không fetch được `inbox_preview`.

### Error logs:
```
[PANCAKE] ✅ Fetched 42 conversations
[CHAT-MODAL] - conversation found after fetch: false
[CHAT-MODAL] ⚠️ Conversation not found even after fetching from Pancake
[CHAT-MODAL] 📊 Available conversations in cache: {
    inbox_psid_count: 39,
    inbox_fbid_count: 39,
    comment_psid_count: 0,    // ← PROBLEM!
    comment_fbid_count: 3
}
[CHAT-MODAL] ⚠️ Cannot fetch inbox_preview - missing pancakeCustomerUuid
```

---

## 🔍 Root Cause Analysis

### 1. COMMENT conversations have `from_psid: null`

**Pancake API response:**
```json
{
    "type": "COMMENT",
    "from_psid": null,  // ← NULL - không có PSID!
    "from": {
        "id": "2826226454173820"  // ← CHỈ CÓ FB ID
    },
    "customers": [
        {
            "fb_id": "2826226454173820",
            "id": "6c798b79-935e-41b2-a27e-5e9019a89e44"
        }
    ]
}
```

**Mapping code** (`pancake-data-manager.js:234-241`):
```javascript
} else if (convType === 'COMMENT') {
    // COMMENT conversations
    if (conv.from_psid) {  // ← from_psid = null → skip!
        this.commentMapByPSID.set(conv.from_psid, conv);
    }
    if (conv.from && conv.from.id) {  // ← CHỈ CÁI NÀY CHẠY
        this.commentMapByFBID.set(conv.from.id, conv);
    }
}
```

**Result:**
- ✅ `commentMapByFBID` có 3 entries (mapped by `from.id`)
- ❌ `commentMapByPSID` có 0 entries (vì `from_psid = null`)

---

### 2. order.Facebook_ASUserId không khớp với from.id

**Order data:**
```json
{
    "Facebook_ASUserId": "24948162744877764"  // ← User ID từ comment
}
```

**ChatOmni comments API:**
```json
{
    "User": {
        "Id": "24948162744877764"  // ← Same value
    }
}
```

**Pancake conversation:**
```json
{
    "from": {
        "id": "2826226454173820"  // ← DIFFERENT VALUE!
    }
}
```

**Vấn đề:**
- `order.Facebook_ASUserId` = `24948162744877764` (người comment)
- `conversation.from.id` = `2826226454173820` (có thể là người comment khác hoặc account khác)
- **KHÔNG KHỚP** → Không tìm thấy conversation!

---

### 3. Search logic priority

**Code:** `pancake-data-manager.js:259-276`
```javascript
getConversationByUserId(userId) {
    if (!userId) return null;

    // Try INBOX maps first (most common)
    let conversation = this.inboxMapByPSID.get(userId);
    if (!conversation) {
        conversation = this.inboxMapByFBID.get(userId);
    }

    // Fallback to COMMENT maps
    if (!conversation) {
        conversation = this.commentMapByFBID.get(userId);  // ← TÌM Ở ĐÂY
    }
    if (!conversation) {
        conversation = this.commentMapByPSID.get(userId);  // ← EMPTY - skip
    }

    return conversation || null;
}
```

**Search order:**
1. `inboxMapByPSID.get("24948162744877764")` → NOT FOUND
2. `inboxMapByFBID.get("24948162744877764")` → NOT FOUND
3. `commentMapByFBID.get("24948162744877764")` → **SHOULD FIND HERE**
4. `commentMapByPSID.get("24948162744877764")` → EMPTY (skip)

---

## 🧪 Debug Steps

### Check conversation cache:

```javascript
// 1. Check order Facebook_ASUserId
console.log('[DEBUG] order.Facebook_ASUserId:', currentOrder?.Facebook_ASUserId);

// 2. Check all comment conversations
const commentConvsArray = Array.from(window.pancakeDataManager.commentMapByFBID.entries());
console.log('[DEBUG] Comment conversations in cache:', commentConvsArray);

// 3. Try to find manually
const userId = currentOrder?.Facebook_ASUserId;
commentConvsArray.forEach(([fbId, conv]) => {
    console.log('[DEBUG] Checking:', {
        fbId,
        from_id: conv.from?.id,
        from_psid: conv.from_psid,
        customer_fb_id: conv.customers?.[0]?.fb_id,
        matches_userId: fbId === userId || conv.from?.id === userId || conv.customers?.[0]?.fb_id === userId
    });
});
```

---

## 💡 Possible Solutions

### Solution 1: Check customers[].fb_id

Conversation có `customers[].fb_id` có thể match với `order.Facebook_ASUserId`:

```javascript
// Enhanced search
getConversationByUserId(userId) {
    if (!userId) return null;

    // ... existing search ...

    // NEW: Search in customers array
    if (!conversation) {
        for (const conv of this.conversations) {
            if (conv.customers && conv.customers.length > 0) {
                const customer = conv.customers.find(c => c.fb_id === userId);
                if (customer) {
                    return conv;
                }
            }
        }
    }

    return conversation || null;
}
```

### Solution 2: Use post_id to match

Comments có `post_id` trong conversation:

```json
{
    "type": "COMMENT",
    "post_id": "270136663390370_1294933139331358",
    ...
}
```

Order có `Facebook_PostId`:
```json
{
    "Facebook_PostId": "270136663390370_1294933139331358"
}
```

Match by post_id:
```javascript
// Search by post_id
const postId = order.Facebook_PostId;
const conversation = this.conversations.find(conv =>
    conv.type === 'COMMENT' && conv.post_id === postId
);
```

### Solution 3: Map comments by multiple keys

```javascript
buildConversationMaps() {
    // ... existing code ...

    this.conversations.forEach(conv => {
        if (conv.type === 'COMMENT') {
            // Map by from.id
            if (conv.from && conv.from.id) {
                this.commentMapByFBID.set(conv.from.id, conv);
            }

            // Map by customers[].fb_id
            if (conv.customers && conv.customers.length > 0) {
                conv.customers.forEach(customer => {
                    if (customer.fb_id) {
                        this.commentMapByFBID.set(customer.fb_id, conv);
                    }
                });
            }

            // Map by post_id
            if (conv.post_id) {
                this.commentMapByPostId = this.commentMapByPostId || new Map();
                this.commentMapByPostId.set(conv.post_id, conv);
            }
        }
    });
}
```

---

## 📊 Data Comparison

| Field | Order | Comment Conversation | Match? |
|-------|-------|---------------------|--------|
| Facebook_ASUserId | `24948162744877764` | - | - |
| Facebook_PostId | `117267091364524_1382798016618291` | - | - |
| - | - | `from_psid`: `null` | ❌ |
| - | - | `from.id`: `2826226454173820` | ❌ (different) |
| - | - | `customers[0].fb_id`: `?` | ❓ (need to check) |
| - | - | `post_id`: `270136663390370_1294933139331358` | ❓ (different?) |

---

## 🎯 Recommended Solution

**Best approach: Search by customers[].fb_id**

Vì:
1. `customers[].fb_id` chính xác là Facebook User ID của người comment
2. `order.Facebook_ASUserId` cũng là Facebook User ID
3. Hai giá trị này PHẢI match

**Implementation:**

1. Update `getConversationByUserId()` để search trong `customers[]`
2. Hoặc enhance mapping để map conversations theo `customers[].fb_id`

---

## 🔧 Quick Fix (Test in Console)

```javascript
// Find conversation manually
const userId = "24948162744877764";
const foundConv = window.pancakeDataManager.conversations.find(conv => {
    if (conv.customers && conv.customers.length > 0) {
        return conv.customers.some(c => c.fb_id === userId);
    }
    return false;
});

console.log('[DEBUG] Found conversation:', foundConv);
console.log('[DEBUG] Customer UUID:', foundConv?.customers?.[0]?.id);
```

Nếu tìm thấy conversation → implement Solution 1 vào code.
