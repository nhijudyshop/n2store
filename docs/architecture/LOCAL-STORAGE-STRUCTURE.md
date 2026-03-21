# Browser Storage Structure - N2Shop

> Tài liệu mô tả chi tiết tất cả các browser storage được sử dụng trong ứng dụng.
> Bao gồm: localStorage, sessionStorage, IndexedDB, Cookies
> Cập nhật: 2026-03-21

---

## Tổng quan các Storage

| Storage Type | Mô tả |
|-------------|-------|
| **localStorage** | Dữ liệu persistent (auth, UI state, business data, Firebase internal) |
| **sessionStorage** | Dữ liệu chỉ tồn tại trong tab hiện tại |
| **IndexedDB** | Dữ liệu lớn (Firestore offline cache, product cache, livestream cache) |
| **Cookies** | Không sử dụng |

---

# PHẦN A: localStorage

## Tổng quan

| Nhóm | Số lượng keys | Mô tả |
|------|--------------|-------|
| Authentication & User | 6 | Thông tin đăng nhập, quyền, session |
| TPOS API Credentials | 3 | Token và credentials cho TPOS API |
| UI State | 6 | Trạng thái giao diện (sidebar, menu, tab) |
| Business Data Stores | 3 | Dữ liệu nghiệp vụ (wallet, campaign, pancake) |
| Firebase/Firestore Internal | ~30+ | Firestore SDK tự quản lý (không cần quan tâm) |

---

## 1. Authentication & User

### `isLoggedIn`
- **Type:** `boolean`
- **Example:** `true`
- **Mô tả:** Flag đánh dấu trạng thái đăng nhập

### `userType`
- **Type:** `string`
- **Example:** `"admin-admin@@"`
- **Mô tả:** Loại user đang đăng nhập. Format: `{role}-{username}@@`

### `checkLogin`
- **Type:** `number`
- **Example:** `0`
- **Mô tả:** Flag kiểm tra trạng thái login (0 = bình thường)

### `remember_login_preference`
- **Type:** `boolean`
- **Example:** `true`
- **Mô tả:** User có chọn "Ghi nhớ đăng nhập" hay không

### `loginindex_auth`
- **Type:** `object`
- **Size:** ~4.5KB
- **Mô tả:** Dữ liệu authentication đầy đủ từ trang login
- **Cấu trúc:**
```json
{
  "isLoggedIn": "true",
  "userType": "admin-admin@@",
  "checkLogin": "0",
  "timestamp": 1774089197112,
  "expiresAt": 1776681197112,
  "lastActivity": 1774089197112,
  "displayName": "Administrator",
  "loginTime": "2026-03-21T10:33:17.112Z",
  "username": "admin",
  "uid": "H98vsemp74TRp9yAru8VLjB9Dnb2",
  "userId": "user_admin_1764335433014_23ph604nw",
  "detailedPermissions": {
    "nhanhang": { "weigh": true, "confirm": true, "cancel": true, "edit": true, "view": true, "create": true, "delete": true, "export": true },
    "inventoryTracking": { "edit_soMonThieu": true, ... },
    // ... các module khác
  }
}
```

### `n2shop_auth_cache`
- **Type:** `array` (Map entries format)
- **Size:** ~3.7KB
- **Mô tả:** Cache thông tin user từ Firestore, format `[[key, {value, expiry}], ...]`
- **Cấu trúc mỗi entry:**
```json
["user_admin", {
  "value": {
    "role": "USER_ROLES.ADMIN",
    "username": "admin",
    "passwordHash": "abc8de5b...",
    "salt": "15c599380c6d...",
    "displayName": "Administrator",
    "detailedPermissions": { ... },
    "userIdCreatedAt": { "seconds": 1764335433, "nanoseconds": 257000000 },
    "updatedAt": { "seconds": 1771937514, "nanoseconds": 377000000 },
    "updatedBy": "admin",
    "checkLogin": "0"
  }
}]
```

---

## 2. TPOS API Credentials

### `bill_tpos_credentials_1`
- **Type:** `object`
- **Size:** 75 bytes
- **Mô tả:** Credentials đăng nhập TPOS API
- **Cấu trúc:**
```json
{
  "username": "shop1",
  "password": "Truonggiang1992",
  "updatedAt": 1774087000821
}
```
> ⚠️ **BẢO MẬT:** Lưu password plaintext trong localStorage

### `bill_tpos_token_1`
- **Type:** `object`
- **Size:** 67 bytes
- **Mô tả:** Refresh token cho TPOS API
- **Cấu trúc:**
```json
{
  "refresh_token": "9a7d2a5db31742938f412c6a45804018",
  "expires_at": 0
}
```

### `bearer_token_data_1`
- **Type:** `object`
- **Size:** ~1KB
- **Mô tả:** Access token (JWT) cho TPOS API
- **Cấu trúc:**
```json
{
  "expires_in": 1295838,
  "expires_at": 1774538468350,
  "token_type": "Bearer",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
> **Note:** Suffix `_1` cho phép hỗ trợ multi-shop (shop 1, shop 2, ...)

---

## 3. UI State

### `sidebarCollapsed`
- **Type:** `boolean`
- **Example:** `true`
- **Mô tả:** Sidebar có đang thu gọn hay không

### `currentTab`
- **Type:** `string`
- **Example:** `"orders"`
- **Mô tả:** Tab đang active trong orders-report module

### `n2shop_menu_layout`
- **Type:** `object`
- **Size:** ~1.2KB
- **Mô tả:** Cấu trúc menu sidebar (nhóm, thứ tự, icon)
- **Cấu trúc:**
```json
{
  "ungroupedItems": [],
  "groups": [
    {
      "id": "group_1771676492150_0",
      "name": "Live & Streaming",
      "icon": "video",
      "collapsed": false,
      "items": ["soluong-live", "order-live-tracking", "order-management", "live", "livestream"]
    },
    {
      "id": "group_1771676492150_1",
      "name": "Đơn Hàng",
      "icon": "shopping-cart",
      "collapsed": false,
      "items": ["orders-report", "don-inbox"]
    },
    {
      "id": "group_1771676492150_2",
      "name": "Kho & Nhập Hàng & ...",
      "icon": "package",
      "items": ["nhanhang", "purchase-orders", "order-log", "inventory-tracking"]
    }
    // ... more groups
  ]
}
```

### `n2shop_menu_layout_timestamp`
- **Type:** `number`
- **Example:** `1774089223500`
- **Mô tả:** Timestamp lần cuối cập nhật menu layout (dùng để sync với Firestore)

### `n2shop_custom_menu_names`
- **Type:** `object`
- **Size:** ~954 bytes
- **Mô tả:** Tên tùy chỉnh cho các menu item (user tự đặt)
- **Cấu trúc:**
```json
{
  "customer-management": { "text": "KHÁCH HÀNG" },
  "soluong-live": { "text": "SỐ LƯỢNG THỰC TẾ CHO CHỊ COI" },
  "product-search": { "text": "KHO SẢN PHẨM" },
  "livestream": { "text": "BÁO CÁO LIVESTREAM" },
  "purchase-orders": { "text": "TẠO MÃ & MUA HÀNG" },
  "hanghoan": { "text": "HÀNG HOÀN BƯU CỤC + KHÁCH" },
  "trash-bin": { "text": "THÙNG RÁC XXXXX" },
  // ... more custom names
}
```

### `n2shop_custom_menu_names_timestamp`
- **Type:** `number`
- **Example:** `1774089201158`
- **Mô tả:** Timestamp lần cuối cập nhật custom menu names

### `n2shop_menu_group_collapsed`
- **Type:** `object`
- **Example:** `{ "group_1771676492150_1": false }`
- **Mô tả:** Trạng thái collapsed của từng nhóm menu

---

## 4. Business Data Stores

### `walletAdjustmentStore`
- **Type:** `object`
- **Size:** ~441 bytes
- **Mô tả:** Lưu trữ các yêu cầu điều chỉnh ví khách hàng (chuyển đổi SĐT)
- **Cấu trúc:**
```json
{
  "data": [
    ["orderId-uuid", {
      "orderId": "c2060000-5d17-0015-9d5a-08de80106198",
      "orderCode": "260300402",
      "status": "completed",
      "oldPhone": "0975707757",
      "newPhone": "0123456788",
      "oldPhoneBalance": 3000,
      "newPhoneBalance": 4000,
      "customerName": "Trăng Tím",
      "createdBy": "",
      "createdAt": 1773986719202,
      "completedBy": "",
      "completedAt": 1773987191244,
      "completedNote": "ok",
      "lastUpdated": 1773987191244
    }]
  ],
  "timestamp": 1774089246445,
  "version": 1
}
```
> **Note:** `data` dùng format `Map entries` - `[[key, value], ...]`

### `orders_campaign_user_id`
- **Type:** `string`
- **Example:** `"user_1774089204740"`
- **Mô tả:** User ID cho campaign tracking trong orders module

### `pancake_all_accounts`
- **Type:** `object`
- **Example:** `{}`
- **Mô tả:** Cache danh sách tài khoản Pancake (hiện đang trống)

---

## 5. Firebase / Firestore Internal Keys

> Các keys này do Firebase SDK tự quản lý. **Không nên đọc/ghi trực tiếp.**

### Pattern: `firestore_targets_*`
- **Mô tả:** Trạng thái các query target (listener) của Firestore
- **Cấu trúc:** `{ "state": "current", "updateTimeMs": timestamp }`
- **Target IDs thấy được:** 2, 4, 6, 14, 16, 18, 20, 22, 24, 26, 28, 32, 34, 36, 44

### Pattern: `firestore_clients_*`
- **Mô tả:** Trạng thái các Firestore client instances
- **Cấu trúc:** `{ "activeTargetIds": [4, 14, 16], "updateTimeMs": timestamp }`
- **Active client:** `_Jb39YFCP0UAGoeQ5X8js` (có activeTargetIds)
- **Zombie clients:** Nhiều client cũ với `activeTargetIds: []`

### Pattern: `firestore_zombie_*`
- **Mô tả:** Timestamp khi client bị disconnect (zombie state)
- **Value:** timestamp number

### `firestore_sequence_number_*`
- **Type:** `number`
- **Example:** `116443`
- **Mô tả:** Sequence number cho Firestore operations

### `firestore_online_state_*`
- **Mô tả:** Trạng thái online/offline hiện tại
- **Cấu trúc:** `{ "clientId": "Jb39YFCP0UAGoeQ5X8js", "onlineState": "Online" }`

### `firebase:host:*`
- **Type:** `string`
- **Mô tả:** Resolved host cho Realtime Database
- **Example:** `"s-gke-apse1-nssi2-11.asia-southeast1.firebasedatabase.app"`

---

## Tổng kết Size

| Key | Size | Ghi chú |
|-----|------|---------|
| `loginindex_auth` | ~4.5KB | Lớn nhất - chứa full permissions |
| `n2shop_auth_cache` | ~3.7KB | Cache user data |
| `n2shop_menu_layout` | ~1.2KB | Menu structure |
| `n2shop_custom_menu_names` | ~954B | Custom names |
| `bearer_token_data_1` | ~1KB | JWT token |
| `walletAdjustmentStore` | ~441B | Wallet adjustments |
| Firestore internal | ~50B each | ~30 keys × 50B = ~1.5KB |
| **Tổng ước tính** | **~13-15KB** | |

---

---

# PHẦN B: sessionStorage

> Dữ liệu chỉ tồn tại trong tab/window hiện tại. Bị xóa khi đóng tab.

### `justLoggedIn`
- **Type:** `boolean`
- **Example:** `true`
- **Mô tả:** Flag đánh dấu user vừa login xong (dùng để trigger actions 1 lần sau login, ví dụ: welcome message, redirect)

> **Hiện tại chỉ có 1 key** - sessionStorage được sử dụng rất ít.

---

# PHẦN C: Cookies

> **Không sử dụng.** Ứng dụng không set cookie nào.
> Authentication được xử lý hoàn toàn qua localStorage + Firebase Auth (IndexedDB).

---

# PHẦN D: IndexedDB

> Lưu trữ dữ liệu lớn hơn localStorage (không giới hạn 5MB). Dùng cho offline cache và Firebase internal.

## Tổng quan Databases

| Database | Version | Object Stores | Mô tả |
|----------|---------|---------------|-------|
| `N2StoreDB` | 1 | 1 | App-level key-value cache |
| `StandardPriceDB` | 1 | 1 | Cache sản phẩm giá chuẩn |
| `firebaseLocalStorageDb` | 1 | 1 | Firebase Auth persistence |
| `firebase-heartbeat-database` | 1 | 1 | Firebase SDK heartbeat |
| `firestore/[DEFAULT]/n2shop-69e37/main` | 15 | 17 | Firestore offline persistence (lớn nhất) |

---

## 1. N2StoreDB

Database tự tạo của ứng dụng, dùng làm key-value store cho cache lớn.

### Object Store: `key_value_store`
- **Số records:** 2
- **Mô tả:** Lưu trữ dạng key-value cho các dữ liệu cần cache lâu dài
- **Cấu trúc mỗi record:**
```json
{
  "key": "livestream_persistent_cache",
  "value": [],
  "timestamp": 1774089229097
}
```
- **Keys đã biết:**
  - `livestream_persistent_cache` - Cache dữ liệu livestream

> **Khi nào dùng:** Khi dữ liệu quá lớn cho localStorage (>5MB) hoặc cần lưu structured data.

---

## 2. StandardPriceDB

### Object Store: `products_cache`
- **Số records:** 0 (trống)
- **Mô tả:** Cache danh sách sản phẩm với giá chuẩn
- **Trạng thái:** Chưa có dữ liệu (có thể module chưa được sử dụng hoặc cache đã expired)

---

## 3. firebaseLocalStorageDb (Firebase Auth)

> Do Firebase SDK tự quản lý. **Không nên đọc/ghi trực tiếp.**

### Object Store: `firebaseLocalStorage`
- **Số records:** 1
- **Mô tả:** Lưu trữ Firebase Auth user session
- **Key format:** `firebase:authUser:{API_KEY}:[DEFAULT]`
- **Cấu trúc:**
```json
{
  "fbase_key": "firebase:authUser:AIzaSyA-...:[DEFAULT]",
  "value": {
    "uid": "H98vsemp74TRp9yAru8VLjB9Dnb2",
    "emailVerified": false,
    "isAnonymous": true,
    "providerData": [],
    "stsTokenManager": {
      "refreshToken": "AMf-vBy3eZy1fq2l..."
    }
  }
}
```
> **Note:** User hiện tại đăng nhập dạng `isAnonymous: true` - Firebase Auth anonymous, xác thực thật sự qua Firestore users collection.

---

## 4. firebase-heartbeat-database

> Do Firebase SDK tự quản lý.

### Object Store: `firebase-heartbeat-store`
- **Số records:** 0
- **Mô tả:** Firebase SDK dùng để gửi heartbeat về server, tracking SDK usage

---

## 5. Firestore Offline Persistence

> **Database lớn nhất.** Do Firestore SDK tự quản lý để hỗ trợ offline mode.
> Database: `firestore/[DEFAULT]/n2shop-69e37/main` (version 15)

### Thống kê Object Stores

| Object Store | Records | Mô tả |
|-------------|---------|-------|
| `remoteDocumentsV14` | 34 | Cache documents từ Firestore server |
| `targetDocuments` | 67 | Mapping giữa query targets và documents |
| `targets` | 31 | Các query/listener đang active |
| `clientMetadata` | 12 | Metadata các client instances |
| `collectionParents` | 10 | Collection hierarchy |
| `owner` | 1 | Tab nào đang "own" persistence |
| `remoteDocumentGlobal` | 1 | Metadata tổng (total byte size) |
| `targetGlobal` | 1 | Metadata tổng cho targets |
| `bundles` | 0 | Firestore bundles (không dùng) |
| `documentMutations` | 0 | Pending writes (đang trống = đã sync hết) |
| `documentOverlays` | 0 | Local-only modifications |
| `mutations` | 0 | Mutation queue |
| `mutationQueues` | 0 | Mutation queue metadata |
| `indexConfiguration` | 0 | Client-side indexes |
| `indexEntries` | 0 | Index data |
| `indexState` | 0 | Index state |
| `namedQueries` | 0 | Named/saved queries |

### Chi tiết quan trọng

#### `remoteDocumentsV14` (34 documents cached)
- Cache các documents đã fetch từ Firestore
- Total size: **~5.1MB** (`byteSize: 5148585`)
- Collections được cache: `app_config`, `kpi_base`, và các collections khác

#### `targets` (31 active listeners)
- Mỗi target là 1 Firestore query listener
- `highestTargetId: 60` - đã tạo tối đa 60 targets
- `targetCount: 30` - hiện có 30 targets active
- Example query: `kpi_base | where userId == sale | orderBy __name__ asc | limit 1`

#### `owner`
- Chỉ 1 tab được "own" Firestore persistence tại 1 thời điểm
- Owner hiện tại: `Jb39YFCP0UAGoeQ5X8js`
- `allowTabSynchronization: true` - cho phép nhiều tab share cache

#### `documentMutations` = 0
- Không có pending writes = tất cả dữ liệu đã sync lên server thành công

---

# Tổng kết Size tất cả Storage

## localStorage
| Key | Size | Ghi chú |
|-----|------|---------|
| `loginindex_auth` | ~4.5KB | Lớn nhất - chứa full permissions |
| `n2shop_auth_cache` | ~3.7KB | Cache user data |
| `n2shop_menu_layout` | ~1.2KB | Menu structure |
| `n2shop_custom_menu_names` | ~954B | Custom names |
| `bearer_token_data_1` | ~1KB | JWT token |
| `walletAdjustmentStore` | ~441B | Wallet adjustments |
| Firestore internal | ~50B each | ~30 keys x 50B = ~1.5KB |
| **Tổng localStorage** | **~13-15KB** | |

## IndexedDB
| Database | Size ước tính | Ghi chú |
|----------|-------------|---------|
| Firestore offline cache | ~5.1MB | `remoteDocumentGlobal.byteSize` |
| N2StoreDB | < 1KB | Hiện chỉ có 2 records |
| StandardPriceDB | 0 | Trống |
| Firebase Auth | < 1KB | 1 record |
| **Tổng IndexedDB** | **~5.1MB** | Chủ yếu là Firestore cache |

## sessionStorage
| Key | Size | Ghi chú |
|-----|------|---------|
| `justLoggedIn` | 4B | Chỉ có 1 key |

## Cookies
Không sử dụng.

---

## Lưu ý bảo mật

1. **`bill_tpos_credentials_1`** lưu password plaintext trong localStorage
2. **`bearer_token_data_1`** chứa JWT access token - có expiry time
3. **`n2shop_auth_cache`** chứa password hash + salt
4. **Firebase Auth** trong IndexedDB chứa refresh token
5. Tất cả dữ liệu localStorage/IndexedDB có thể bị đọc bởi bất kỳ JS code nào chạy trên cùng origin
