# Data Synchronization - Hướng dẫn đồng bộ dữ liệu

## Mục lục
1. [Vấn đề](#vấn-đề)
2. [Giải pháp hiện tại](#giải-pháp-hiện-tại)
3. [Các giải pháp khác](#các-giải-pháp-khác)
4. [Implementation trong Project](#implementation-trong-project)
5. [Best Practices](#best-practices)

---

## Vấn đề

### Bối cảnh
Khi ứng dụng lưu dữ liệu ở **localStorage** (local) và **Firebase/Firestore** (cloud), sẽ xảy ra vấn đề **bất đồng bộ** giữa nhiều thiết bị/người dùng.

### Ví dụ cụ thể

```
User A (máy 1)              Firebase              User B (máy 2)
─────────────────────────────────────────────────────────────────
localStorage: {order1}  →   {order1}         ←   localStorage: {order1}

User A xóa order1       →   {empty}              localStorage: {order1} ← VẪN CÒN!
localStorage: {empty}
                                                 User B không biết order1 đã bị xóa
```

### Các vấn đề thường gặp

| Vấn đề | Mô tả |
|--------|-------|
| **Stale Data** | Dữ liệu cũ không được cập nhật |
| **Conflict** | 2 người cùng sửa 1 record |
| **Lost Updates** | Thay đổi bị ghi đè |
| **Inconsistent State** | Dữ liệu khác nhau giữa các máy |

---

## Giải pháp hiện tại

### Load-on-Init / Save-on-Change (Recommended)

**Mô tả**: Pattern đơn giản - load dữ liệu khi khởi tạo, save khi có thay đổi.

```javascript
const Store = {
    _data: new Map(),

    async init() {
        // 1. Load từ localStorage (nhanh)
        this._loadFromLocalStorage();

        // 2. Load từ Firestore và merge (timestamp mới hơn thắng)
        await this._loadFromFirestore();

        // 3. Cleanup dữ liệu cũ
        await this.cleanup();
    },

    async add(id, data) {
        this._data.set(id, {
            ...data,
            timestamp: Date.now()
        });
        this.save(); // Save cả localStorage và Firestore
    },

    save() {
        this._saveToLocalStorage();
        this._saveToFirestore(); // debounced
    }
};
```

**Ưu điểm**:
- Đơn giản, dễ hiểu và debug
- Ít bug hơn real-time listener
- Chi phí Firebase thấp (ít reads)
- Không cần xử lý connection liên tục

**Nhược điểm**:
- Không real-time (cần refresh để thấy thay đổi từ máy khác)
- Có thể có stale data trong thời gian ngắn

**Giải quyết stale data**:
- User refresh trang = lấy dữ liệu mới nhất
- Có thể thêm nút "Làm mới" thủ công
- Hoặc thêm polling nhẹ (mỗi 30-60s)

---

## Các giải pháp khác

### 1. Real-time Listener

> ⚠️ **ĐÃ BỊ XÓA** khỏi project do gây nhiều bug và xung đột dữ liệu

**Lý do không dùng**:
- Logic phức tạp, khó debug
- Gây xung đột khi nhiều người dùng cùng lúc
- Data bị đè tùm lum
- Chi phí Firebase cao hơn

```javascript
// KHÔNG DÙNG NỮA
firebase.firestore().collection('data').doc(userId)
    .onSnapshot((doc) => {
        // Có thể gây conflict
    });
```

---

### 2. Polling (Định kỳ check)

**Mô tả**: Định kỳ fetch dữ liệu từ server.

```javascript
// Mỗi 30 giây check 1 lần
setInterval(async () => {
    const serverData = await fetchFromServer();
    mergeWithLocal(serverData);
}, 30000);
```

**Ưu điểm**:
- Đơn giản
- Hoạt động với mọi backend

**Nhược điểm**:
- Delay (không real-time)
- Tốn bandwidth
- Không efficient

---

### 3. Timestamp-based Merge

**Mô tả**: So sánh timestamp, dữ liệu mới hơn thắng.

```javascript
function merge(localData, serverData) {
    if (serverData.timestamp > localData.timestamp) {
        return serverData; // Server wins
    }
    return localData; // Local wins
}
```

**Ưu điểm**:
- Logic đơn giản
- Deterministic (kết quả luôn nhất quán)

**Nhược điểm**:
- Có thể mất data nếu clock không sync
- Không handle concurrent edits

---

### 4. Version Vector / CRDT

**Mô tả**: Mỗi entry có version, khi conflict thì merge hoặc hỏi user.

```javascript
{
    order1: {
        data: {...},
        version: 5,
        lastModifiedBy: 'userA',
        vectorClock: { userA: 5, userB: 3 }
    }
}
```

**Ưu điểm**:
- Handle concurrent edits
- Không mất data

**Nhược điểm**:
- Phức tạp
- Cần conflict resolution UI

---

## Implementation trong Project

### Stores sử dụng Load/Save Pattern

| Store | File | Collection |
|-------|------|------------|
| `InvoiceStatusStore` | `tab1-fast-sale-invoice-status.js` | `invoice_status` |
| `InvoiceStatusDeleteStore` | `tab1-fast-sale-workflow.js` | `invoice_status_delete` |

### Code Structure

```javascript
const Store = {
    _data: new Map(),
    _syncTimeout: null,

    /**
     * Initialize - load từ localStorage + Firestore
     */
    async init() {
        // 1. Load từ localStorage (nhanh)
        this._loadFromLocalStorage();

        // 2. Load từ Firestore và merge
        await this._loadFromFirestore();

        // 3. Cleanup dữ liệu cũ (>14 ngày)
        await this.cleanup();
    },

    /**
     * Load từ Firestore và merge với localStorage
     * Admin: load tất cả users
     * Normal user: chỉ load document của mình
     */
    async _loadFromFirestore() {
        const isAdmin = this._isAdmin();

        if (isAdmin) {
            const snapshot = await db.collection('my_collection').get();
            snapshot.forEach(doc => {
                this._mergeData(doc.data());
            });
        } else {
            const doc = await this._getDocRef().get();
            if (doc.exists) {
                this._mergeData(doc.data());
            }
        }
    },

    /**
     * Merge data - timestamp mới hơn thắng
     */
    _mergeData(serverData) {
        Object.entries(serverData.data || {}).forEach(([key, value]) => {
            const local = this._data.get(key);
            if (!local || value.timestamp > local.timestamp) {
                this._data.set(key, value);
            }
        });
        this._saveToLocalStorage();
    },

    /**
     * Save to both localStorage and Firestore
     */
    save() {
        this._saveToLocalStorage();
        this._saveToFirestore(); // debounced 2s
    },

    /**
     * Save to Firestore (debounced)
     */
    _saveToFirestore() {
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(async () => {
            await this._getDocRef().set({
                data: Object.fromEntries(this._data),
                lastUpdated: Date.now()
            }, { merge: true });
        }, 2000);
    }
};
```

### Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User A    │     │  Firebase   │     │   User B    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  1. Add entry     │                   │
       │─────────────────►│                   │
       │                   │                   │
       │  2. save()        │                   │
       │─────────────────►│                   │
       │                   │                   │
       │                   │                   │
       │                   │  3. User B refresh│
       │                   │◄──────────────────│
       │                   │                   │
       │                   │  4. Load & merge  │
       │                   │──────────────────►│
       │                   │                   │
       │                   │            localStorage
       │                   │              updated
```

### Admin vs Normal User

```javascript
async _loadFromFirestore() {
    const isAdmin = this._isAdmin();

    if (isAdmin) {
        // Admin: Load TẤT CẢ documents trong collection
        const snapshot = await db.collection('invoice_status').get();
        snapshot.forEach(doc => {
            this._mergeData(doc.data());
        });
    } else {
        // Normal user: Chỉ load document của mình
        const doc = await db.collection('invoice_status')
            .doc(username).get();
        if (doc.exists) {
            this._mergeData(doc.data());
        }
    }
}
```

---

## Best Practices

### 1. Luôn có Timestamp

```javascript
// Khi save
const entry = {
    ...data,
    timestamp: Date.now(),
    lastModifiedBy: currentUser
};
```

### 2. Unique Keys để tránh đè dữ liệu

```javascript
// Dùng key unique (id + timestamp)
const key = `${saleOnlineId}_${Date.now()}`;
this._data.set(key, entry);
```

### 3. Debounce Firestore Writes

```javascript
// Tránh write quá nhiều
_saveToFirestore() {
    clearTimeout(this._syncTimeout);
    this._syncTimeout = setTimeout(async () => {
        await this._getDocRef().set(data, { merge: true });
    }, 2000); // Wait 2s
}
```

### 4. Cleanup Old Data

```javascript
async cleanup() {
    const maxAge = 14 * 24 * 60 * 60 * 1000; // 14 days
    const now = Date.now();

    for (const [key, value] of this._data) {
        if (now - value.timestamp > maxAge) {
            this._data.delete(key);
        }
    }
    this.save();
}
```

### 5. Handle Errors

```javascript
async _saveToFirestore() {
    try {
        await this._getDocRef().set(data, { merge: true });
        console.log('[STORE] Synced to Firestore');
    } catch (error) {
        console.error('[STORE] Firestore save error:', error);
        // Data vẫn còn trong localStorage
        // Có thể retry sau
    }
}
```

### 6. Conflict Resolution Strategy

| Strategy | Khi nào dùng |
|----------|-------------|
| **Last Write Wins** | Data không critical (hiện tại đang dùng) |
| **Merge** | Có thể combine changes |
| **Ask User** | Data critical, cần user quyết định |
| **Server Wins** | Server là source of truth |

---

## Tham khảo

- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Offline Data](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [CRDT - Conflict-free Replicated Data Types](https://crdt.tech/)
