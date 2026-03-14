# PART 1: PANCAKE TOKEN MANAGER

## Tổng quan

`PancakeTokenManager` quản lý JWT token để xác thực với Pancake.vn API. Hỗ trợ multi-account, page access tokens, và nhiều layer lưu trữ.

**Source file:** `orders-report/js/managers/pancake-token-manager.js`
**Shared version:** `shared/browser/pancake-token-manager.js`

---

## 1. Kiến trúc lưu trữ (Priority Order)

Token được lấy theo thứ tự ưu tiên:

```
1. In-memory cache (nhanh nhất, mất khi reload)
2. localStorage (nhanh, không cần network)
3. Firestore (cần network, backup lâu dài)
4. Cookie (fallback cuối cùng)
```

### 1.1 Constructor & Properties

```javascript
class PancakeTokenManager {
    constructor() {
        // Firestore references
        this.firestoreRef = null;
        this.accountsRef = null;
        this.pageTokensRef = null;

        // In-memory cache
        this.currentToken = null;
        this.currentTokenExpiry = null;
        this.activeAccountId = null;
        this.accounts = {};
        this.pageAccessTokens = {};

        // localStorage keys
        this.LOCAL_STORAGE_KEYS = {
            JWT_TOKEN: 'pancake_jwt_token',
            JWT_TOKEN_EXPIRY: 'pancake_jwt_token_expiry',
            JWT_ACCOUNT_ID: 'tpos_pancake_active_account_id',
            PAGE_ACCESS_TOKENS: 'pancake_page_access_tokens',
            ALL_ACCOUNTS: 'pancake_all_accounts'
        };
    }
}
```

---

## 2. Database Schema (Firestore)

### 2.1 Collection `pancake_tokens`

```
Firestore Path: /pancake_tokens/

├── accounts (document)
│   └── data: {
│       "[accountId]": {
│           token: "eyJhbGciOiJIUzI1NiIs...",   // JWT token string
│           exp: 1734567890,                       // Unix timestamp (seconds)
│           uid: "abc123",                         // Pancake user ID
│           name: "Tên người dùng",                // Tên hiển thị
│           savedAt: 1734567890000                  // Timestamp (milliseconds)
│       },
│       "[accountId2]": { ... }
│   }
│
└── page_access_tokens (document)
    └── data: {
        "[pageId]": {
            token: "page_access_token_string",     // Page access token
            pageId: "117267091364524",              // Facebook Page ID
            pageName: "NhiJudyHouse",              // Tên page
            timestamp: 1734567890,                  // Unix timestamp
            savedAt: 1734567890000                  // Timestamp (milliseconds)
        }
    }
```

### 2.2 localStorage Keys

| Key | Kiểu | Mô tả |
|-----|------|--------|
| `pancake_jwt_token` | string | JWT token hiện tại |
| `pancake_jwt_token_expiry` | number | Token expiry timestamp |
| `tpos_pancake_active_account_id` | string | Account ID đang active (per-device) |
| `pancake_page_access_tokens` | JSON string | Map pageId → token data |
| `pancake_all_accounts` | JSON string | Map accountId → account data |

---

## 3. Các method chính

### 3.1 Token Retrieval

#### `getToken()` - Lấy token theo priority
```javascript
async getToken() {
    // 1. Check in-memory cache
    if (this.currentToken && !this.isTokenExpired(this.currentTokenExpiry)) {
        return this.currentToken;
    }

    // 2. Check localStorage
    const localToken = this.getTokenFromLocalStorage();
    if (localToken) return localToken;

    // 3. Check Firestore (active account)
    const firestoreToken = await this.getTokenFromFirestore();
    if (firestoreToken) return firestoreToken;

    // 4. Fallback: Cookie
    const cookieToken = this.getTokenFromCookie();
    return cookieToken;
}
```

#### `getTokenFromCookie()` - Đọc JWT từ browser cookie
```javascript
getTokenFromCookie() {
    // Tìm cookie "jwt" từ document.cookie
    // Format: "jwt=eyJhbGciOi..."
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'jwt') return value;
    }
    return null;
}
```

### 3.2 Token Validation

#### `decodeToken(token)` - Giải mã JWT payload
```javascript
decodeToken(token) {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Base64 decode payload (phần 2)
    // Xử lý UTF-8 encoding cho tên tiếng Việt
    const payload = JSON.parse(
        decodeURIComponent(
            atob(parts[1])
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        )
    );

    return payload; // { uid, name, exp, iat, ... }
}
```

#### `isTokenExpired(exp)` - Kiểm tra hết hạn
```javascript
isTokenExpired(exp) {
    if (!exp) return true;
    const now = Math.floor(Date.now() / 1000);
    const buffer = 3600; // 1 giờ buffer
    return now >= (exp - buffer);
}
```

#### `debugToken(token)` - Phân tích chi tiết token
```javascript
debugToken(token) {
    // Trả về object:
    // {
    //   valid: boolean,
    //   info: {
    //     originalLength, cleanedLength, hasSpaces, hasNewlines,
    //     hasPrefix, parts, partLengths, name, uid, expiryDate, isExpired
    //   },
    //   issues: ['issue1', 'issue2', ...]
    // }
}
```

### 3.3 Token Storage

#### `setTokenManual(token)` - Lưu token nhập tay
```javascript
async setTokenManual(rawToken) {
    // 1. Clean token: remove "jwt=" prefix, quotes, whitespace
    let cleanedToken = rawToken.trim();
    if (cleanedToken.toLowerCase().startsWith('jwt=')) {
        cleanedToken = cleanedToken.substring(4).trim();
    }
    cleanedToken = cleanedToken.replace(/^["']|["']$/g, '');
    cleanedToken = cleanedToken.replace(/\s+/g, '');
    cleanedToken = cleanedToken.replace(/[;,]+$/g, '');

    // 2. Validate: phải có 3 phần
    const parts = cleanedToken.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');

    // 3. Decode payload
    const payload = this.decodeToken(cleanedToken);
    if (!payload) throw new Error('Cannot decode token');

    // 4. Check expiry
    if (this.isTokenExpired(payload.exp)) {
        throw new Error('Token đã hết hạn');
    }

    // 5. Save to all storage layers
    const accountId = await this.saveTokenToFirebase(cleanedToken);
    return accountId;
}
```

#### `saveTokenToFirebase(token)` - Lưu vào Firestore
```javascript
async saveTokenToFirebase(token) {
    const payload = this.decodeToken(token);
    const accountId = payload.uid; // Dùng uid làm accountId

    const accountData = {
        token: token,
        exp: payload.exp,
        uid: payload.uid,
        name: payload.name,
        savedAt: Date.now()
    };

    // 1. Lưu vào memory
    this.accounts[accountId] = accountData;
    this.currentToken = token;
    this.currentTokenExpiry = payload.exp;
    this.activeAccountId = accountId;

    // 2. Lưu vào localStorage
    this.saveTokenToLocalStorage(token, payload.exp);
    this.saveAllAccountsToLocalStorage();
    localStorage.setItem(this.LOCAL_STORAGE_KEYS.JWT_ACCOUNT_ID, accountId);

    // 3. Lưu vào Firestore
    if (this.accountsRef) {
        await this.accountsRef.set({
            data: this.accounts
        }, { merge: true });
    }

    return accountId;
}
```

### 3.4 Multi-Account Management

#### `getAllAccounts()` - Lấy tất cả accounts
```javascript
getAllAccounts() {
    return this.accounts; // { [accountId]: { token, exp, uid, name, savedAt } }
}
```

#### `setActiveAccount(accountId)` - Chuyển account active
```javascript
async setActiveAccount(accountId) {
    const account = this.accounts[accountId];
    if (!account) return false;

    // Update in-memory
    this.activeAccountId = accountId;
    this.currentToken = account.token;
    this.currentTokenExpiry = account.exp;

    // Update localStorage (per-device setting)
    localStorage.setItem(this.LOCAL_STORAGE_KEYS.JWT_ACCOUNT_ID, accountId);
    this.saveTokenToLocalStorage(account.token, account.exp);

    return true;
}
```

#### `deleteAccount(accountId)` - Xóa account
```javascript
async deleteAccount(accountId) {
    delete this.accounts[accountId];

    // Nếu xóa account đang active, clear token
    if (accountId === this.activeAccountId) {
        this.currentToken = null;
        this.currentTokenExpiry = null;
        this.activeAccountId = null;
        this.clearTokenFromLocalStorage();
    }

    // Sync to Firestore
    if (this.accountsRef) {
        await this.accountsRef.set({ data: this.accounts }, { merge: true });
    }

    this.saveAllAccountsToLocalStorage();
    return true;
}
```

### 3.5 Page Access Token Management

Page access token khác với JWT token. Nó dùng để gọi Pancake Official API (pages.fm).

#### `getOrGeneratePageAccessToken(pageId)` - Lấy hoặc tạo mới
```javascript
async getOrGeneratePageAccessToken(pageId) {
    // 1. Check memory cache
    if (this.pageAccessTokens[pageId]?.token) {
        return this.pageAccessTokens[pageId].token;
    }

    // 2. Check localStorage
    const stored = this.getPageAccessTokensFromLocalStorage();
    if (stored[pageId]?.token) {
        this.pageAccessTokens[pageId] = stored[pageId];
        return stored[pageId].token;
    }

    // 3. Generate new token via API
    return await this.generatePageAccessToken(pageId);
}
```

#### `generatePageAccessToken(pageId)` - Tạo token mới qua API
```javascript
async generatePageAccessToken(pageId) {
    const jwtToken = await this.getToken();

    // API: POST /pages/{pageId}/generate_page_access_token
    const url = API_CONFIG.buildUrl.pancake(
        `pages/${pageId}/generate_page_access_token`,
        `access_token=${jwtToken}`
    );

    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();

    if (data.success && data.page_access_token) {
        // Save token
        this.pageAccessTokens[pageId] = {
            token: data.page_access_token,
            pageId: pageId,
            pageName: data.page_name || pageId,
            savedAt: Date.now()
        };

        this.savePageAccessTokensToLocalStorage();

        // Sync to Firestore
        if (this.pageTokensRef) {
            await this.pageTokensRef.set({
                data: this.pageAccessTokens
            }, { merge: true });
        }

        return data.page_access_token;
    }

    return null;
}
```

#### `savePageAccessToken(pageId, token, pageName)` - Lưu thủ công
```javascript
async savePageAccessToken(pageId, token, pageName) {
    this.pageAccessTokens[pageId] = {
        token, pageId, pageName, savedAt: Date.now()
    };
    this.savePageAccessTokensToLocalStorage();

    if (this.pageTokensRef) {
        await this.pageTokensRef.set({
            data: this.pageAccessTokens
        }, { merge: true });
    }
    return true;
}
```

### 3.6 Initialization

#### `initialize()` - Khởi tạo TokenManager
```javascript
async initialize() {
    // 1. Setup Firestore references
    if (window.db) {
        this.firestoreRef = window.db.collection('pancake_tokens');
        this.accountsRef = this.firestoreRef.doc('accounts');
        this.pageTokensRef = this.firestoreRef.doc('page_access_tokens');
    }

    // 2. Load accounts from Firestore
    if (this.accountsRef) {
        const doc = await this.accountsRef.get();
        if (doc.exists) {
            this.accounts = doc.data().data || {};
        }
    }

    // 3. Load page tokens from Firestore
    if (this.pageTokensRef) {
        const doc = await this.pageTokensRef.get();
        if (doc.exists) {
            this.pageAccessTokens = doc.data().data || {};
        }
    }

    // 4. Merge with localStorage (localStorage may have newer data)
    const localAccounts = this.getAllAccountsFromLocalStorage();
    this.accounts = { ...this.accounts, ...localAccounts };

    // 5. Set active account from localStorage
    const activeId = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_ACCOUNT_ID);
    if (activeId && this.accounts[activeId]) {
        this.activeAccountId = activeId;
        this.currentToken = this.accounts[activeId].token;
        this.currentTokenExpiry = this.accounts[activeId].exp;
    }

    // 6. Load page access tokens from localStorage
    const localPageTokens = this.getPageAccessTokensFromLocalStorage();
    this.pageAccessTokens = { ...this.pageAccessTokens, ...localPageTokens };
    this.savePageAccessTokensToLocalStorage();
}
```

---

## 4. Global Instance

```javascript
// Tạo global instance
window.pancakeTokenManager = new PancakeTokenManager();
```

---

## 5. Flow Diagram

```
User nhập token thủ công
    ↓
validateTokenInput() → hiển thị real-time validation
    ↓
setTokenManual(token)
    ├─ Clean token (remove prefix, quotes, whitespace)
    ├─ Validate format (3 parts)
    ├─ Decode JWT payload (uid, name, exp)
    ├─ Check expiry (với 1h buffer)
    └─ saveTokenToFirebase(token)
        ├─ Lưu memory (this.accounts, this.currentToken)
        ├─ Lưu localStorage (pancake_jwt_token, etc.)
        └─ Lưu Firestore (pancake_tokens/accounts)

Khi cần token (getToken):
    ↓
    1. Check memory → có? return
    2. Check localStorage → có? cache + return
    3. Check Firestore → có? cache + return
    4. Check Cookie → có? cache + return
    5. null
```

---

## 6. Sự khác biệt giữa 2 loại token

| Thuộc tính | JWT Token | Page Access Token |
|------------|-----------|-------------------|
| **Mục đích** | Xác thực user với Pancake API nội bộ | Xác thực với Pancake Official API (pages.fm) |
| **Endpoint** | `/api/pancake/*` | `/api/pancake-official/*` |
| **Có hết hạn?** | Có (vài ngày đến vài tuần) | Không hết hạn |
| **Cách lấy** | Đăng nhập pancake.vn hoặc nhập thủ công | Tự động generate từ API hoặc nhập thủ công |
| **Phạm vi** | Toàn bộ Pancake API | Chỉ 1 page cụ thể |
| **Dùng để** | List pages, conversations, search | Fetch messages, send messages, mark read |
