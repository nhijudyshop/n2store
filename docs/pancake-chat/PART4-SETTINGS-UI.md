# PART 4: PANCAKE SETTINGS UI

## Tổng quan

Pancake Settings Modal quản lý tài khoản Pancake, page access tokens, tag filter, và cài đặt API source/realtime.

**Source file:** `orders-report/js/tab1/tab1-pancake-settings.js` (1,122 lines)

---

## 1. Permission System

Chỉ Admin mới được thêm/xóa accounts và tokens. Mọi user đều được chọn account.

```javascript
function isUserAdmin() {
    // 1. Check via authManager
    if (window.authManager?.hasPermission) {
        return window.authManager.hasPermission(0);  // 0 = Admin
    }
    // 2. Fallback: localStorage
    const checkLogin = parseInt(localStorage.getItem('checkLogin'));
    return checkLogin === 0;
}

function checkAdminPermission(action) {
    if (!isUserAdmin()) {
        notificationManager.show(`⛔ Chỉ Admin mới có quyền ${action}`, 'error');
        return false;
    }
    return true;
}
```

---

## 2. Account Management

### 2.1 Mở Settings Modal

```javascript
window.openPancakeSettingsModal = async function() {
    // 1. Show modal
    document.getElementById('pancakeSettingsModal').style.display = 'flex';

    // 2. Check admin → hide/show buttons
    const isAdmin = isUserAdmin();
    btnAddAccount.style.display = isAdmin ? 'inline-block' : 'none';
    btnAddPageToken.style.display = isAdmin ? 'inline-block' : 'none';
    btnClearAllAccounts.style.display = isAdmin ? 'inline-block' : 'none';

    // 3. Initialize token manager & load accounts
    await pancakeTokenManager.initialize();
    await refreshAccountsList();
    await refreshPageTokensList();  // Also load page tokens
}
```

### 2.2 Thêm Account từ Cookie

```javascript
window.addAccountFromCookie = async function() {
    if (!checkAdminPermission('thêm tài khoản Pancake')) return;

    // Lấy token từ browser cookie (user phải đã login pancake.vn)
    const token = pancakeTokenManager.getTokenFromCookie();
    if (!token) throw new Error('Không tìm thấy JWT token trong cookie');

    // Save to Firebase
    const accountId = await pancakeTokenManager.saveTokenToFirebase(token);

    // Refresh UI
    await refreshAccountsList();

    // Re-initialize data manager
    await pancakeDataManager.initialize();
}
```

### 2.3 Thêm Account thủ công (nhập token)

```javascript
window.addAccountManual = async function() {
    if (!checkAdminPermission('thêm tài khoản Pancake')) return;

    const tokenInput = document.getElementById('newAccountTokenInput').value.trim();
    const accountId = await pancakeTokenManager.setTokenManual(tokenInput);

    await refreshAccountsList();
    await pancakeDataManager.initialize();
}
```

### 2.4 Token Validation (Real-time)

```javascript
window.validateTokenInput = function() {
    const input = document.getElementById('newAccountTokenInput').value;

    // 1. Clean token
    let cleanedToken = input.trim();
    if (cleanedToken.toLowerCase().startsWith('jwt=')) {
        cleanedToken = cleanedToken.substring(4).trim();
    }
    cleanedToken = cleanedToken.replace(/^["']|["']$/g, '');
    cleanedToken = cleanedToken.replace(/\s+/g, '');
    cleanedToken = cleanedToken.replace(/[;,]+$/g, '');

    // 2. Check format (3 parts)
    const parts = cleanedToken.split('.');
    if (parts.length !== 3) {
        show("⚠️ Token có {parts.length} phần, cần 3 phần");
        return;
    }

    // 3. Decode & validate
    const payload = pancakeTokenManager.decodeToken(cleanedToken);
    if (payload) {
        const isExpired = pancakeTokenManager.isTokenExpired(payload.exp);
        if (isExpired) {
            show("❌ Token đã hết hạn: {expiryDate}");
        } else {
            show("✅ Token hợp lệ - {name} - Hết hạn: {expiryDate}");
        }
    }
}
```

### 2.5 Debug Token

```javascript
window.debugTokenInput = function() {
    const result = pancakeTokenManager.debugToken(input);

    // Log chi tiết ra console:
    // - Độ dài gốc / sau làm sạch
    // - Có khoảng trắng / newline?
    // - Có prefix jwt=?
    // - Số phần, độ dài từng phần
    // - Tên, UID, hết hạn?

    // Alert tóm tắt
    if (result.valid) {
        alert("✅ Token hợp lệ! Tên: {name}, Hết hạn: {date}");
    } else {
        alert("❌ Vấn đề: " + result.issues.join('\n'));
    }
}
```

### 2.6 Hiển thị danh sách accounts

```javascript
window.refreshAccountsList = async function() {
    const accounts = pancakeTokenManager.getAllAccounts();
    const activeAccountId = pancakeTokenManager.activeAccountId;

    // Render mỗi account:
    // ┌─────────────────────────────────────┐
    // │ ✅ Tên Người Dùng         ✅ Còn hạn │
    // │ UID: abc123                15/01/2024│
    // │ [⭐ Đang dùng]  [🗑️ Xóa]           │
    // └─────────────────────────────────────┘
    //
    // Active account: viền xanh, nền xanh nhạt
    // Expired: badge đỏ "❌ Hết hạn"
    // Non-active: nút "Chọn"
    // Admin only: nút "Xóa"
}
```

### 2.7 Chọn / Xóa Account

```javascript
window.selectAccount = async function(accountId) {
    // Cho phép TẤT CẢ user (không chỉ admin)
    await pancakeTokenManager.setActiveAccount(accountId);
    await refreshAccountsList();
    await pancakeDataManager.initialize();
}

window.deleteAccount = async function(accountId) {
    if (!checkAdminPermission('xóa tài khoản Pancake')) return;
    if (!confirm('Bạn có chắc muốn xóa?')) return;

    await pancakeTokenManager.deleteAccount(accountId);
    await refreshAccountsList();
}

window.clearAllPancakeAccounts = async function() {
    if (!checkAdminPermission('xóa tất cả tài khoản Pancake')) return;
    if (!confirm('Bạn có chắc muốn xóa TẤT CẢ?')) return;

    await pancakeTokenManager.clearToken();
    await refreshAccountsList();
}
```

---

## 3. Page Access Token Management

### 3.1 Hiển thị form thêm Page Token

```javascript
window.showAddPageTokenForm = async function() {
    if (!checkAdminPermission('thêm Page Access Token')) return;

    document.getElementById('addPageTokenForm').style.display = 'block';
    await loadPagesToSelector();  // Load danh sách pages vào dropdown
}
```

### 3.2 Load Pages vào Selector

```javascript
async function loadPagesToSelector() {
    const pages = await pancakeDataManager.fetchPages(true);
    // Render: <option value="{pageId}" data-name="{name}">{name} ({pageId})</option>
}
```

### 3.3 Generate Page Token từ API

```javascript
window.generatePageTokenFromAPI = async function() {
    if (!checkAdminPermission('tạo Page Access Token')) return;

    const pageId = document.getElementById('pageTokenPageSelector').value;
    const newToken = await pancakeTokenManager.generatePageAccessToken(pageId);

    // Auto-fill textarea
    document.getElementById('newPageAccessTokenInput').value = newToken;
    // Token đã được tự động lưu bởi generatePageAccessToken()
    await refreshPageTokensList();
}
```

### 3.4 Thêm Page Token thủ công

```javascript
window.addPageAccessTokenManual = async function() {
    if (!checkAdminPermission('thêm Page Access Token')) return;

    const pageId = selector.value;
    const token = document.getElementById('newPageAccessTokenInput').value.trim();
    const pageName = selector.options[selector.selectedIndex].dataset.name;

    await pancakeTokenManager.savePageAccessToken(pageId, token, pageName);
    await refreshPageTokensList();
}
```

### 3.5 Hiển thị & Xóa Page Tokens

```javascript
window.refreshPageTokensList = async function() {
    const tokens = pancakeTokenManager.getAllPageAccessTokens();

    // Render mỗi token:
    // ┌─────────────────────────────────────┐
    // │ 📄 NhiJudyHouse                [🗑️]│
    // │ ID: 117267091364524                  │
    // │ Token: eyJhbGciOi...  | Lưu: 15/01  │
    // └─────────────────────────────────────┘
}

window.deletePageAccessToken = async function(pageId) {
    if (!checkAdminPermission('xóa Page Access Token')) return;
    if (!confirm('Bạn có chắc?')) return;

    delete pancakeTokenManager.pageAccessTokens[pageId];
    await pancakeTokenManager.savePageAccessTokensToStorage();

    // Sync to Firebase
    if (pancakeTokenManager.pageTokensRef) {
        await pancakeTokenManager.pageTokensRef.set({
            data: pancakeTokenManager.pageAccessTokens
        }, { merge: true });
    }

    await refreshPageTokensList();
}
```

---

## 4. Chat API Source Toggle

Chuyển đổi giữa Pancake API và ChatOmni API.

```javascript
window.toggleChatAPISource = function() {
    const newSource = chatAPISettings.toggle();
    // 'pancake' | 'chatomni'

    updateChatAPISourceLabel();

    // Reload table
    if (typeof performSearch === 'function') {
        performSearch();
    }
}

window.updateChatAPISourceLabel = function() {
    const label = document.getElementById('chatApiSourceLabel');
    label.textContent = chatAPISettings.getDisplayName();
    // "Pancake" hoặc "ChatOmni"
}
```

---

## 5. Realtime Toggle

```javascript
window.toggleRealtimeMode = function(enabled) {
    chatAPISettings.setRealtimeEnabled(enabled);
    updateRealtimeCheckbox();  // Show/hide mode selector
}

window.changeRealtimeMode = function(mode) {
    chatAPISettings.setRealtimeMode(mode);
    // mode: 'browser' (trực tiếp) | 'server' (24/7 qua Render)
}

window.updateRealtimeCheckbox = function() {
    checkbox.checked = chatAPISettings.isRealtimeEnabled();
    modeContainer.style.display = isEnabled ? 'block' : 'none';
    modeSelect.value = chatAPISettings.getRealtimeMode();
}
```

---

## 6. Tag Filter & Settings

### 6.1 Load Tags từ API

```javascript
window.loadAvailableTags = async function() {
    // API: GET /api/odata/Tag?$format=json&$count=true&$top=1000
    const response = await fetch(url, {
        headers: { ...authHeader, 'content-type': 'application/json' }
    });
    window.availableTags = data.value;
    populateTagFilterOptions();
}
```

### 6.2 Tag Settings Modal

```javascript
window.openTagSettingsModal = async function() {
    // Load tags nếu chưa có
    if (!availableTags?.length) await loadAvailableTags();
    renderTagSettingsList();
}

window.renderTagSettingsList = function(filteredTags) {
    // Render mỗi tag:
    // [Color] Tag Name [Input: ghi chú] [Lưu] [✅]
}

window.saveTagSettingItem = function(tagId) {
    const value = document.getElementById(`tagInput_${tagId}`).value.trim();
    const settings = getTagSettings();  // localStorage: 'tagSettingsCustomData'
    settings[tagId] = value;
    setTagSettings(settings);
}
```

### 6.3 Tag Settings Storage

```javascript
// localStorage key: 'tagSettingsCustomData'
// Format: { [tagId]: "custom note text" }

window.getTagSettings = function() {
    return JSON.parse(localStorage.getItem('tagSettingsCustomData')) || {};
}

window.setTagSettings = function(settings) {
    localStorage.setItem('tagSettingsCustomData', JSON.stringify(settings));
}
```

---

## 7. HTML Elements (Modal IDs)

### Settings Modal
| Element ID | Mô tả |
|-----------|--------|
| `pancakeSettingsModal` | Container modal settings |
| `pancakeAccountsList` | Container danh sách accounts |
| `addAccountForm` | Form thêm account |
| `newAccountTokenInput` | Input nhập JWT token |
| `tokenValidationMessage` | Div hiển thị validation result |
| `btnAddAccount` | Nút "Thêm tài khoản" (admin only) |
| `btnClearAllAccounts` | Nút "Xóa tất cả" (admin only) |

### Page Token Section
| Element ID | Mô tả |
|-----------|--------|
| `addPageTokenForm` | Form thêm page token |
| `pageTokenPageSelector` | Dropdown chọn page |
| `newPageAccessTokenInput` | Input/textarea nhập token |
| `pageTokenValidationMessage` | Div validation |
| `pageAccessTokensList` | Container danh sách page tokens |
| `btnAddPageToken` | Nút "Thêm Page Token" (admin only) |

### API & Realtime
| Element ID | Mô tả |
|-----------|--------|
| `chatApiSourceLabel` | Label hiển thị source hiện tại |
| `realtimeToggleCheckbox` | Checkbox bật/tắt realtime |
| `realtimeModeContainer` | Container mode selector |
| `realtimeModeSelect` | Dropdown chọn mode (browser/server) |

### Tag Settings
| Element ID | Mô tả |
|-----------|--------|
| `tagSettingsModal` | Modal cài đặt tag |
| `tagSettingsList` | Container danh sách tag settings |
| `tagSettingsSearchInput` | Input tìm kiếm tag |
