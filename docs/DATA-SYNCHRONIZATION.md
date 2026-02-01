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

### Firebase as Source of Truth (Recommended)

**Mô tả**: Firebase là nguồn dữ liệu chính xác. localStorage chỉ là cache để hiển thị khi offline.

```javascript
const Store = {
    _data: new Map(),

    async init() {
        // 1. Load từ Firestore TRƯỚC (source of truth)
        const loaded = await this._loadFromFirestore();

        // 2. Nếu offline, fallback to localStorage cache
        if (!loaded) {
            this._loadFromLocalStorage();
        }

        // 3. Cleanup dữ liệu cũ
        await this.cleanup();
    },

    async _loadFromFirestore() {
        try {
            // CLEAR dữ liệu cũ - Firestore là source of truth
            this._data.clear();

            const doc = await this._getDocRef().get();
            if (doc.exists) {
                // REPLACE (không merge) với data từ Firestore
                Object.entries(doc.data().data || {}).forEach(([k, v]) => {
                    this._data.set(k, v);
                });
            }

            // Cache to localStorage
            this._saveToLocalStorage();
            return true;
        } catch (e) {
            return false; // Trigger fallback to localStorage
        }
    },

    async add(id, data) {
        this._data.set(id, {
            ...data,
            timestamp: Date.now()
        });
        this.save(); // Save cả localStorage và Firestore
    },

    save() {
        this._saveToLocalStorage(); // Cache locally
        this._saveToFirestore();    // Sync to source of truth
    }
};
```

**Ưu điểm**:
- Firebase là single source of truth - không bị conflict
- localStorage chỉ là cache, không gây stale data
- Real-time listener tự động đồng bộ thay đổi từ máy khác
- Đơn giản, dễ hiểu và debug

**Real-time Listener** (đã được implement):
- Sau khi init(), store tự động listen changes từ Firestore
- Khi có thay đổi từ máy khác → tự động update `_data` và localStorage
- Sử dụng `_isListening` flag để tránh infinite loop (không save lại Firestore khi đang nhận updates)
- Gọi `destroy()` khi unload page để cleanup listener

```javascript
// Real-time listener pattern
_setupRealtimeListener() {
    this._unsubscribe = this._getDocRef()
        .onSnapshot((doc) => {
            this._isListening = true;
            // Update _data từ Firestore
            // Update localStorage cache
            this._isListening = false;
        });
}

destroy() {
    if (this._unsubscribe) {
        this._unsubscribe();
        this._unsubscribe = null;
    }
}
```

**Nhược điểm**:
- Khi offline sẽ dùng cache cũ

---

## Các giải pháp khác

### 1. Real-time Listener

> ✅ **ĐÃ ĐƯỢC THÊM LẠI** với pattern an toàn (sử dụng `_isListening` flag)

**Pattern hiện tại**:
- Init: Load từ Firestore FIRST (source of truth)
- Setup real-time listener sau khi init
- Khi nhận update từ Firestore → set `_isListening = true` → update local → set `_isListening = false`
- Khi save local changes → check `_isListening` → nếu true thì skip Firestore save (tránh infinite loop)

```javascript
// Pattern an toàn - đã implement trong project
const Store = {
    _isListening: false,
    _unsubscribe: null,

    _setupRealtimeListener() {
        this._unsubscribe = this._getDocRef()
            .onSnapshot((doc) => {
                this._isListening = true;
                // Update _data từ Firestore (newer timestamp wins)
                // Update localStorage cache
                this._isListening = false;
            });
    },

    save() {
        this._saveToLocalStorage();
        // Skip Firestore save khi đang nhận real-time updates
        if (!this._isListening) {
            this._saveToFirestore();
        }
    }
};
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
     * Initialize - Firestore là source of truth
     */
    async init() {
        // 1. Load từ Firestore TRƯỚC (source of truth)
        const loaded = await this._loadFromFirestore();

        // 2. Nếu offline, fallback to localStorage cache
        if (!loaded) {
            this._loadFromLocalStorage();
        }

        // 3. Cleanup dữ liệu cũ (>14 ngày)
        await this.cleanup();
    },

    /**
     * Load từ Firestore - REPLACE (không merge)
     * Admin: load tất cả users
     * Normal user: chỉ load document của mình
     * @returns {boolean} true nếu load thành công
     */
    async _loadFromFirestore() {
        try {
            // CLEAR dữ liệu cũ - Firestore là source of truth
            this._data.clear();

            const isAdmin = this._isAdmin();

            if (isAdmin) {
                const snapshot = await db.collection('my_collection').get();
                snapshot.forEach(doc => {
                    // REPLACE - không merge
                    Object.entries(doc.data().data || {}).forEach(([k, v]) => {
                        this._data.set(k, v);
                    });
                });
            } else {
                const doc = await this._getDocRef().get();
                if (doc.exists) {
                    Object.entries(doc.data().data || {}).forEach(([k, v]) => {
                        this._data.set(k, v);
                    });
                }
            }

            // Cache to localStorage
            this._saveToLocalStorage();
            return true;
        } catch (e) {
            return false; // Trigger fallback to localStorage
        }
    },

    /**
     * Save to both localStorage (cache) and Firestore (source of truth)
     */
    save() {
        this._saveToLocalStorage(); // Cache locally
        this._saveToFirestore();    // Sync to source of truth (debounced 2s)
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
│             │     │(SOURCE OF   │     │             │
│             │     │   TRUTH)    │     │             │
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
       │                   │  4. REPLACE data  │
       │                   │  (not merge)      │
       │                   │──────────────────►│
       │                   │                   │
       │                   │           localStorage
       │                   │            = CACHE only
```

**QUAN TRỌNG**: User B nhận được CHÍNH XÁC dữ liệu từ Firebase, không merge với localStorage cũ.
```

### Admin vs Normal User

```javascript
async _loadFromFirestore() {
    // CLEAR trước - Firestore là source of truth
    this._data.clear();

    const isAdmin = this._isAdmin();

    if (isAdmin) {
        // Admin: Load TẤT CẢ documents trong collection
        const snapshot = await db.collection('invoice_status').get();
        snapshot.forEach(doc => {
            // REPLACE - không merge
            Object.entries(doc.data().data || {}).forEach(([k, v]) => {
                this._data.set(k, v);
            });
        });
    } else {
        // Normal user: Chỉ load document của mình
        const doc = await db.collection('invoice_status')
            .doc(username).get();
        if (doc.exists) {
            Object.entries(doc.data().data || {}).forEach(([k, v]) => {
                this._data.set(k, v);
            });
        }
    }

    // Cache to localStorage
    this._saveToLocalStorage();
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
| **Firebase Wins** | **HIỆN TẠI ĐANG DÙNG** - Firebase là source of truth |
| **Last Write Wins** | Data không critical |
| **Merge** | Có thể combine changes |
| **Ask User** | Data critical, cần user quyết định |

> **Note**: Hiện tại project sử dụng **Firebase Wins** - localStorage chỉ là cache. Khi init(), dữ liệu từ Firebase sẽ THAY THẾ hoàn toàn localStorage.

---

## Tham khảo

- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Offline Data](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [CRDT - Conflict-free Replicated Data Types](https://crdt.tech/)
