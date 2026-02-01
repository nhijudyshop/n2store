# Data Synchronization - Hướng dẫn đồng bộ dữ liệu

## Mục lục
1. [Vấn đề](#vấn-đề)
2. [Giải pháp](#giải-pháp)
3. [Implementation trong Project](#implementation-trong-project)
4. [Best Practices](#best-practices)

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

## Giải pháp

### 1. Real-time Listener (Recommended)

**Mô tả**: Lắng nghe thay đổi từ server theo thời gian thực.

```javascript
// Firebase Firestore example
firebase.firestore().collection('data').doc(userId)
    .onSnapshot((doc) => {
        // Khi có thay đổi → cập nhật ngay
        const data = doc.data();
        localStorage.setItem('data', JSON.stringify(data));
        updateUI(data);
    });
```

**Ưu điểm**:
- Cập nhật ngay lập tức
- Không cần polling
- Tiết kiệm bandwidth (chỉ gửi changes)

**Nhược điểm**:
- Cần connection liên tục
- Phức tạp hơn để implement

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

### 5. Optimistic UI + Rollback

**Mô tả**: Cập nhật UI ngay, nếu server fail thì rollback.

```javascript
async function deleteOrder(orderId) {
    // 1. Optimistic update (UI ngay)
    const backup = localData[orderId];
    delete localData[orderId];
    updateUI();

    try {
        // 2. Sync to server
        await api.delete(orderId);
    } catch (error) {
        // 3. Rollback on error
        localData[orderId] = backup;
        updateUI();
        showError('Xóa thất bại');
    }
}
```

---

## Implementation trong Project

### Stores sử dụng Real-time Sync

| Store | File | Collection |
|-------|------|------------|
| `InvoiceStatusStore` | `tab1-fast-sale-invoice-status.js` | `invoice_status` |
| `InvoiceStatusDeleteStore` | `tab1-fast-sale-workflow.js` | `invoice_status_delete` |

### Code Structure

```javascript
const Store = {
    _data: new Map(),
    _unsubscribe: null, // Real-time listener

    async init() {
        // 1. Load localStorage (fast)
        this._loadFromLocalStorage();

        // 2. Load & merge from Firestore
        await this._loadFromFirestore();

        // 3. Setup real-time listener
        this._setupRealtimeListener();
    },

    _setupRealtimeListener() {
        this._unsubscribe = firebase.firestore()
            .collection('my_collection')
            .doc(username)
            .onSnapshot((doc) => {
                // Merge changes (newer timestamp wins)
                const serverData = doc.data();
                this._mergeData(serverData);
                this._saveToLocalStorage();
            });
    },

    _mergeData(serverData) {
        Object.entries(serverData.data || {}).forEach(([key, value]) => {
            const local = this._data.get(key);
            if (!local || value.timestamp > local.timestamp) {
                this._data.set(key, value);
            }
        });
    },

    destroy() {
        // Cleanup listener when done
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }
};
```

### Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User A    │     │  Firebase   │     │   User B    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  1. Update local  │                   │
       │─────────────────►│                   │
       │                   │                   │
       │  2. Sync to FB    │                   │
       │─────────────────►│                   │
       │                   │                   │
       │                   │  3. onSnapshot    │
       │                   │──────────────────►│
       │                   │                   │
       │                   │  4. Merge & save  │
       │                   │                   │
       │                   │                   ▼
       │                   │            localStorage
       │                   │              updated
```

### Admin vs Normal User

```javascript
_setupRealtimeListener() {
    const isAdmin = this._isAdmin();

    if (isAdmin) {
        // Admin: Listen to ENTIRE collection (all users)
        this._unsubscribe = db.collection('invoice_status')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    // Handle changes from all users
                });
            });
    } else {
        // Normal user: Listen to OWN document only
        this._unsubscribe = db.collection('invoice_status')
            .doc(username)
            .onSnapshot((doc) => {
                // Handle changes to own data
            });
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

### 2. Cleanup Listeners

```javascript
// Khi logout hoặc unmount
window.addEventListener('beforeunload', () => {
    InvoiceStatusStore.destroy();
    InvoiceStatusDeleteStore.destroy();
});
```

### 3. Handle Offline

```javascript
// Firebase tự động handle offline
// Khi online lại sẽ sync tự động

// Hoặc manual check
if (navigator.onLine) {
    await syncToServer();
} else {
    queueForLaterSync(data);
}
```

### 4. Conflict Resolution Strategy

| Strategy | Khi nào dùng |
|----------|-------------|
| **Last Write Wins** | Data không critical |
| **Merge** | Có thể combine changes |
| **Ask User** | Data critical, cần user quyết định |
| **Server Wins** | Server là source of truth |

### 5. Logging & Debugging

```javascript
_setupRealtimeListener() {
    this._unsubscribe = docRef.onSnapshot(
        (doc) => {
            console.log('[STORE] Real-time update received');
            console.log('[STORE] Changes:', doc.data());
        },
        (error) => {
            console.error('[STORE] Listener error:', error);
            // Có thể retry hoặc fallback to polling
        }
    );
}
```

---

## Tham khảo

- [Firebase Realtime Listeners](https://firebase.google.com/docs/firestore/query-data/listen)
- [Offline Data](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [CRDT - Conflict-free Replicated Data Types](https://crdt.tech/)
- [Optimistic UI Pattern](https://www.apollographql.com/docs/react/performance/optimistic-ui/)
