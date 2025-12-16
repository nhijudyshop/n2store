# USER MANAGEMENT - ARCHITECTURE

> **Mục đích:** Quản lý users và phân quyền truy cập trong hệ thống N2Store

---

## Tổng Quan

Thư mục `user-management` chứa **16 files** với 3 chức năng chính:

1. **Quản lý Users** - CRUD operations (Create, Read, Update, Delete)
2. **Phân quyền Pages** - User được truy cập trang nào
3. **Phân quyền Chi tiết** - Actions cụ thể trong mỗi trang (chưa kích hoạt)

```
user-management/
├── index.html ................. Giao diện chính
├── script.js .................. User CRUD cơ bản
├── user-management-enhanced.js  User CRUD + permissions
├── user-permission-page.js .... User CRUD + page grid
│
├── Permissions Config
│   ├── detailed-permissions-config.js ... SubPermissions config
│   ├── page-permissions-ui.js ........... UI cho page permissions
│   └── detailed-permissions-ui.js ....... UI cho detailed permissions
│
├── Authentication
│   ├── auth.js ................. AuthManager class
│   └── auth-with-cache-manager.js ... Auth + cache
│
├── Utilities
│   ├── tool.js ................. Hash generation, Firebase config
│   ├── notification-system.js .. Toast notifications
│   ├── menu-rename-manager.js .. Custom menu names
│   └── image-system.js ......... Image handling
│
└── Styling
    ├── modern.css
    ├── user-management.css
    └── detailed-permissions.css
```

---

## Hệ Thống Phân Quyền - 2 Tầng

### Tầng 1: Role Level (`checkLogin`)

| Value | Role | Mô tả |
|-------|------|-------|
| `0` | **Admin** | Toàn quyền, truy cập mọi trang |
| `1` | **Manager** | Quản lý, không được xóa user |
| `2` | **Staff** | Nhân viên, chỉ view/edit |
| `3` | **Viewer** | Chỉ xem, không thao tác |

**Cách kiểm tra quyền:**

```javascript
// Trong auth.js
hasPermission(requiredLevel) {
    const auth = this.getAuthState();
    return parseInt(auth.checkLogin) <= requiredLevel;
}

// Ví dụ: Chỉ Admin (checkLogin=0) được truy cập
if (hasPermission(0)) { /* Admin only */ }

// Manager trở lên (checkLogin <= 1)
if (hasPermission(1)) { /* Manager + Admin */ }
```

---

### Tầng 2: Page Permissions

User có array `pagePermissions` chứa danh sách pages được truy cập:

```javascript
// Ví dụ user data trong Firebase
{
    username: "nhanvien1",
    displayName: "Nhân Viên 1",
    checkLogin: 2,  // Staff
    pagePermissions: ["live", "livestream", "nhanhang", "ib"]
}
```

**Danh sách Pages (14 pages):**

| ID | Tên | Admin Only |
|----|-----|:----------:|
| `live` | Hình Ảnh Live | |
| `livestream` | Báo Cáo Livestream | |
| `sanphamlive` | Sản Phẩm Livestream | |
| `nhanhang` | Nhận Hàng | |
| `hangrotxa` | Hàng Rớt - Xả | |
| `ib` | Inbox Khách Hàng | |
| `ck` | Chuyển Khoản | |
| `hanghoan` | Hàng Hoàn | |
| `hangdat` | Hàng Đặt | |
| `bangkiemhang` | Bảng Kiểm Hàng | |
| `baocaosaleonline` | Báo Cáo Sale-Online | |
| `product-search` | Tra Cứu Sản Phẩm | |
| `user-management` | Quản Lý Tài Khoản | ✅ |
| `lichsuchinhsua` | Lịch Sử Chỉnh Sửa | ✅ |

---

### Tầng 3: Detailed Permissions (Chưa Kích Hoạt)

File `detailed-permissions-config.js` định nghĩa subPermissions chi tiết:

```javascript
const DETAILED_PERMISSIONS = {
    sanphamlive: {
        id: "sanphamlive",
        name: "SẢN PHẨM LIVESTREAM",
        subPermissions: {
            view: { name: "Xem sản phẩm", icon: "eye" },
            add: { name: "Thêm sản phẩm", icon: "plus-circle" },
            edit: { name: "Sửa sản phẩm", icon: "edit" },
            delete: { name: "Xóa sản phẩm", icon: "trash-2" },
            pricing: { name: "Chỉnh sửa giá", icon: "dollar-sign" }
        }
    },
    // ... các pages khác
};
```

> ⚠️ **Lưu ý:** Config này đã được định nghĩa nhưng **chưa được sử dụng** trong code hiện tại. Hệ thống chỉ dùng page-level permissions.

---

## Chi Tiết Các Files

### Core - User CRUD

#### `script.js` (696 dòng)

| Function | Mô tả |
|----------|-------|
| `checkAdminAccess()` | Kiểm tra quyền admin |
| `connectFirebase()` | Kết nối Firebase |
| `loadUsers()` | Tải danh sách users |
| `createUser()` | Tạo user mới |
| `updateUser()` | Cập nhật user |
| `deleteUser(username)` | Xóa user |
| `editUser(username)` | Load user vào form edit |
| `generateHash()` | Tạo hash password |
| `verifyPassword()` | Verify password |
| `exportUsers()` | Export CSV |

---

#### `user-management-enhanced.js` (983 dòng)

Mở rộng từ `script.js`, thêm:

| Function | Mô tả |
|----------|-------|
| `renderUserList(users)` | Render UI danh sách users |
| `viewUserPermissions(username)` | Modal xem permissions |
| `loadPermissionsOverview()` | Tổng quan permissions |
| `exportPermissions()` | Export permissions report |

---

#### `user-permission-page.js` (1,127 dòng)

Mở rộng với page permissions grid:

| Function | Mô tả |
|----------|-------|
| `initializePermissionsGrid(containerId)` | Khởi tạo UI grid |
| `updatePermissionsSummary(summaryId)` | Cập nhật summary |
| `applyPermissionTemplate(template)` | Áp dụng template |
| `getSelectedPermissions(prefix)` | Lấy permissions đã chọn |
| `setUserPermissions(permissions)` | Set permissions vào form |
| `updateStats()` | Cập nhật thống kê |

---

### Authentication

#### `auth.js` (229 dòng)

**Class:** `AuthManager`

| Method | Mô tả |
|--------|-------|
| `init()` | Khởi tạo từ storage |
| `isAuthenticated()` | Kiểm tra đăng nhập |
| `hasPermission(level)` | Kiểm tra quyền |
| `getAuthState()` | Lấy auth state |
| `getUserId()` | Lấy user ID |
| `clearAuth()` | Xóa auth data |
| `logout()` | Đăng xuất |

**Session Timeout:**
- `sessionStorage`: 8 giờ
- `localStorage` (remember): 30 ngày

---

### Permissions UI

#### `page-permissions-ui.js` (548 dòng)

**Class:** `PagePermissionsUI`

| Method | Mô tả |
|--------|-------|
| `render()` | Render UI component |
| `renderPageCards()` | Render các page cards |
| `setPermissions(pagePermissions)` | Set permissions array |
| `getPermissions()` | Get selected permissions |
| `selectAll()` | Chọn tất cả |
| `selectNone()` | Bỏ chọn tất cả |
| `selectTemplate(templateName)` | Áp dụng template |
| `updateSummary()` | Cập nhật summary |

---

#### `detailed-permissions-config.js` (222 dòng)

**Exports:**
- `DETAILED_PERMISSIONS` - Config các pages và subPermissions
- `PERMISSION_TEMPLATES` - Templates cho các roles

**Templates:**

| Template | Mô tả |
|----------|-------|
| `admin` | Toàn quyền |
| `manager` | Không xóa user, không restore history |
| `staff` | Chỉ view/edit |
| `viewer` | Chỉ view |
| `custom` | Tùy chỉnh |

---

### Utilities

#### `tool.js` (535 dòng)

| Function | Mô tả |
|----------|-------|
| `loadDefaultConfig()` | Load Firebase config mặc định |
| `saveFirebaseConfig()` | Lưu config |
| `generateHash()` | Tạo SHA256 hash |
| `verifyPassword()` | Verify password với hash |

**Hash Methods:**
- CryptoJS SHA256 (default)
- Web Crypto API
- Node.js crypto

---

## Firebase Structure

```
Firebase Realtime Database
└── users/
    └── {username}/
        ├── username: "admin"
        ├── displayName: "Administrator"
        ├── password: "sha256_hash..."
        ├── checkLogin: 0
        ├── pagePermissions: ["live", "user-management", ...]
        ├── createdAt: 1702600000000
        └── updatedAt: 1702600000000
```

---

## Lưu Ý Quan Trọng

### ⚠️ Code Trùng Lặp

3 files có logic CRUD gần như giống nhau:
- `script.js`
- `user-management-enhanced.js`
- `user-permission-page.js`

**Đề xuất:** Merge thành 1 module hoặc refactor.

---

### ⚠️ Detailed Permissions Chưa Dùng

`DETAILED_PERMISSIONS` với subPermissions đã định nghĩa nhưng không được enforce trong code.

**Nếu muốn kích hoạt:**
1. Thêm `detailedPermissions` field vào user data
2. Check subPermissions khi thực hiện actions
3. Update UI để hiển thị detailed permissions

---

### ⚠️ Password Hash

Hiện dùng **SHA256** đơn giản, nên upgrade lên:
- bcrypt
- argon2
- PBKDF2

---

## Quick Access

| Chức năng | File | Function |
|-----------|------|----------|
| Kiểm tra admin | `script.js` | `checkAdminAccess()` |
| Tạo user | `user-permission-page.js` | `createUser()` |
| Update user | `user-permission-page.js` | `updateUser()` |
| Load users | `user-permission-page.js` | `loadUsers()` |
| Page permissions | `page-permissions-ui.js` | `PagePermissionsUI` class |
| Auth check | `auth.js` | `authManager.hasPermission()` |

---

*Cập nhật: 2025-12-16*
