# Hướng Dẫn Hiện Thực Tính Năng Lịch Sử Biến Động Số Dư

Tài liệu này mô tả chi tiết cách hiện thực tính năng **Lịch sử biến động số dư** với tích hợp **SePay Webhook API** để theo dõi giao dịch ngân hàng realtime.

![Architecture Overview](/absolute/path/to/architecture.png)

---

## Mục Lục

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Cấu Trúc File](#2-cấu-trúc-file)
3. [Backend API](#3-backend-api)
4. [Tích Hợp SePay Webhook](#4-tích-hợp-sepay-webhook)
5. [Frontend Components](#5-frontend-components)
6. [Hệ Thống Xác Thực](#6-hệ-thống-xác-thực)
7. [Quản Lý Cache](#7-quản-lý-cache)
8. [Tạo QR Code Chuyển Khoản](#8-tạo-qr-code-chuyển-khoản)
9. [Quản Lý Thông Tin Khách Hàng](#9-quản-lý-thông-tin-khách-hàng)
10. [Phát Hiện Giao Dịch Thiếu (Gap Detection)](#10-phát-hiện-giao-dịch-thiếu-gap-detection)
11. [Realtime Updates (SSE)](#11-realtime-updates-sse)
12. [Triển Khai](#12-triển-khai)

---

## 1. Tổng Quan Kiến Trúc

```mermaid
flowchart TD
    subgraph Bank["Ngân Hàng"]
        ACB[ACB Bank]
    end
    
    subgraph SePay["SePay Service"]
        SW[SePay Webhook]
    end
    
    subgraph Backend["Backend Services"]
        CF[Cloudflare Worker]
        RD[Render.com Server]
        PG[(PostgreSQL)]
    end
    
    subgraph Frontend["Frontend"]
        UI[Balance History UI]
        QR[QR Generator]
        CM[Customer Manager]
    end
    
    subgraph Storage["Client Storage"]
        LS[LocalStorage]
        FB[(Firebase)]
    end
    
    ACB -->|Transaction| SW
    SW -->|Webhook POST| CF
    CF -->|Proxy| RD
    RD -->|Store| PG
    
    UI -->|API Request| CF
    CF -->|Response| UI
    
    QR -->|Generate| UI
    CM -->|Save| LS
    CM -->|Sync| FB
```

### Luồng Dữ Liệu

1. **Webhook Flow**: Ngân hàng → SePay → Cloudflare Worker → Render.com → PostgreSQL
2. **API Flow**: Frontend → Cloudflare Worker → Render.com → PostgreSQL
3. **Realtime Flow**: Server → SSE → Frontend

---

## 2. Cấu Trúc File

```
balance-history/
├── index.html              # Giao diện chính (HTML structure)
├── modern.css              # CSS framework/design system
├── styles.css              # Custom styles cho trang
├── main.js                 # Logic chính (2494 dòng)
├── config.js               # Cấu hình API endpoints
├── auth.js                 # Hệ thống xác thực
├── cache.js                # Quản lý cache với localStorage
├── customer-info.js        # Quản lý thông tin khách hàng
├── qr-generator.js         # Tạo QR code VietQR
├── notification-system.js  # Hệ thống thông báo
└── README.md               # Tài liệu cơ bản

../js/
├── firebase-config.js      # Cấu hình Firebase (shared)
└── navigation-modern.js    # Navigation (shared)
```

---

## 3. Backend API

### 3.1 API Endpoints

> [!IMPORTANT]
> Tất cả API endpoints đều thông qua **Cloudflare Worker** để proxy tới Render.com backend.

| Endpoint | Method | Mô Tả |
|----------|--------|-------|
| `/api/sepay/webhook` | POST | Nhận webhook từ SePay |
| `/api/sepay/history` | GET | Lấy lịch sử giao dịch |
| `/api/sepay/statistics` | GET | Thống kê giao dịch |
| `/api/sepay/customer-info` | GET/POST | CRUD thông tin khách hàng |
| `/api/sepay/detect-gaps` | GET | Phát hiện giao dịch thiếu |
| `/api/sepay/gaps` | GET | Lấy danh sách gaps |
| `/api/sepay/gaps/:id/ignore` | POST | Bỏ qua gap |
| `/api/sepay/stream` | GET | SSE stream realtime |
| `/api/sepay/debt-summary` | GET | Tổng công nợ theo SĐT |
| `/api/customers/search` | GET | Tìm kiếm khách hàng |

### 3.2 Cấu Hình API (config.js)

```javascript
const CONFIG = {
    // API Base URL - Thay đổi theo môi trường
    API_BASE_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    
    // Pagination
    ITEMS_PER_PAGE: 50,
    
    // Auto-refresh interval (milliseconds) - 0 = disable
    AUTO_REFRESH_INTERVAL: 0,
    
    // Cache expiry - 5 minutes
    CACHE_EXPIRY: 5 * 60 * 1000,
    
    // Date format
    DATE_FORMAT: 'vi-VN',
    
    // Currency
    CURRENCY: 'VND',
    CURRENCY_LOCALE: 'vi-VN'
};

window.CONFIG = CONFIG;
```

### 3.3 Database Schema

```sql
-- Table: balance_history
CREATE TABLE balance_history (
    id SERIAL PRIMARY KEY,
    sepay_id INTEGER UNIQUE NOT NULL,
    gateway VARCHAR(100) NOT NULL,
    transaction_date TIMESTAMP WITH TIME ZONE,
    account_number VARCHAR(50),
    code VARCHAR(100),
    content TEXT,
    transfer_type VARCHAR(10) CHECK (transfer_type IN ('in', 'out')),
    transfer_amount DECIMAL(20, 2) NOT NULL,
    accumulated DECIMAL(20, 2),
    sub_account VARCHAR(50),
    reference_code VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_balance_history_date ON balance_history(transaction_date DESC);
CREATE INDEX idx_balance_history_type ON balance_history(transfer_type);
CREATE INDEX idx_balance_history_gateway ON balance_history(gateway);
CREATE INDEX idx_balance_history_reference ON balance_history(reference_code);

-- Table: sepay_webhook_logs
CREATE TABLE sepay_webhook_logs (
    id SERIAL PRIMARY KEY,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- View: balance_statistics
CREATE VIEW balance_statistics AS
SELECT 
    DATE(transaction_date) as date,
    COUNT(*) as total_transactions,
    SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE 0 END) as total_in,
    SUM(CASE WHEN transfer_type = 'out' THEN transfer_amount ELSE 0 END) as total_out,
    SUM(CASE WHEN transfer_type = 'in' THEN 1 ELSE 0 END) as in_count,
    SUM(CASE WHEN transfer_type = 'out' THEN 1 ELSE 0 END) as out_count
FROM balance_history
GROUP BY DATE(transaction_date);
```

---

## 4. Tích Hợp SePay Webhook

> [!CAUTION]
> **Đây là phần quan trọng nhất** - cần cấu hình đúng để nhận được giao dịch realtime.

### 4.1 Đăng Ký Webhook Trên SePay

1. Đăng nhập vào [SePay Dashboard](https://my.sepay.vn/)
2. Vào **Cài đặt** → **Webhook**
3. Thêm webhook mới với các thông tin:

| Trường | Giá Trị |
|--------|---------|
| **URL** | `https://your-worker.workers.dev/api/sepay/webhook` |
| **Method** | POST |
| **Authentication** | API Key (khuyến nghị) |
| **API Key** | `sepay_sk_xxxxxxxx` (do SePay tạo) |

### 4.2 Cấu Hình Authentication

**Phương thức 1: API Key (Khuyến nghị)**

```javascript
// Trong backend server (render.com/routes/sepay-webhook.js)
router.post('/webhook', async (req, res) => {
    // Kiểm tra API Key
    const authHeader = req.headers.authorization;
    const expectedKey = process.env.SEPAY_API_KEY;
    
    if (expectedKey && authHeader !== `Apikey ${expectedKey}`) {
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid API Key' 
        });
    }
    
    // Xử lý webhook...
});
```

**Environment Variables cần thiết trên Render.com:**

```bash
SEPAY_API_KEY=sepay_sk_xxxxxxxx
DATABASE_URL=postgresql://user:password@host:port/database
```

### 4.3 Payload Webhook Từ SePay

```json
{
    "id": 92704,
    "gateway": "ACB",
    "transactionDate": "2024-12-21 14:02:37",
    "accountNumber": "75918",
    "code": null,
    "content": "N2ABCD1234EFGH5678 chuyen khoan",
    "transferType": "in",
    "transferAmount": 2277000,
    "accumulated": 19077000,
    "subAccount": null,
    "referenceCode": "2567",
    "description": ""
}
```

### 4.4 Xử Lý Webhook

```javascript
router.post('/webhook', async (req, res) => {
    const {
        id: sepay_id,
        gateway,
        transactionDate,
        accountNumber,
        code,
        content,
        transferType,
        transferAmount,
        accumulated,
        subAccount,
        referenceCode,
        description
    } = req.body;

    try {
        // Log webhook request
        await pool.query(
            `INSERT INTO sepay_webhook_logs 
             (request_body, response_status, ip_address) 
             VALUES ($1, $2, $3)`,
            [req.body, 200, req.ip]
        );

        // Insert transaction (ignore if duplicate)
        const result = await pool.query(
            `INSERT INTO balance_history 
             (sepay_id, gateway, transaction_date, account_number, 
              code, content, transfer_type, transfer_amount, 
              accumulated, sub_account, reference_code, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (sepay_id) DO NOTHING
             RETURNING id`,
            [sepay_id, gateway, transactionDate, accountNumber,
             code, content, transferType, transferAmount,
             accumulated, subAccount, referenceCode, description]
        );

        res.json({ 
            success: true, 
            id: result.rows[0]?.id,
            message: 'Transaction recorded successfully'
        });

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});
```

### 4.5 Cloudflare Worker Proxy

```javascript
// cloudflare-worker/worker.js
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        
        // CORS Headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };
        
        // Handle OPTIONS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        
        // Proxy to Render.com backend
        if (url.pathname.startsWith('/api/sepay')) {
            const backendUrl = `https://n2store-fallback.onrender.com${url.pathname}${url.search}`;
            
            const response = await fetch(backendUrl, {
                method: request.method,
                headers: request.headers,
                body: request.body,
            });
            
            // Add CORS headers to response
            const newHeaders = new Headers(response.headers);
            for (const [key, value] of Object.entries(corsHeaders)) {
                newHeaders.set(key, value);
            }
            
            return new Response(response.body, {
                status: response.status,
                headers: newHeaders,
            });
        }
        
        return new Response('Not Found', { status: 404 });
    }
};
```

---

## 5. Frontend Components

### 5.1 Giao Diện Chính (index.html)

**Cấu trúc HTML chính:**

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lịch sử biến động số dư - Sepay</title>
    
    <!-- Icons -->
    <script src="https://unpkg.com/lucide@latest"></script>
    
    <!-- Styles -->
    <link rel="stylesheet" href="modern.css">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <!-- Sidebar Navigation -->
    <aside class="sidebar" id="sidebar">
        <!-- Auto-generated by navigation-modern.js -->
    </aside>

    <!-- Main Content -->
    <div class="main-content">
        <!-- Header với Inline QR Generator -->
        <header class="header">
            <h1>Lịch sử biến động số dư</h1>
            <div class="inline-qr-form">
                <input type="text" id="inlineCustomerName" placeholder="Tên khách hàng">
                <input type="tel" id="inlineCustomerPhone" placeholder="SĐT (tùy chọn)">
                <button id="inlineGenerateQRBtn">Tạo QR</button>
            </div>
        </header>

        <!-- Statistics Cards -->
        <div class="stats-container">
            <!-- Tổng tiền vào -->
            <div class="stat-card">
                <p id="totalIn">0 ₫</p>
                <small id="totalInCount">0 giao dịch</small>
            </div>
            <!-- Tổng tiền ra -->
            <div class="stat-card">
                <p id="totalOut">0 ₫</p>
            </div>
            <!-- Biến động ròng -->
            <div class="stat-card">
                <p id="netChange">0 ₫</p>
            </div>
            <!-- Số dư hiện tại -->
            <div class="stat-card">
                <p id="latestBalance">0 ₫</p>
            </div>
            <!-- Gap Detection Card -->
            <div class="stat-card" id="gapCard" style="display: none;">
                <p id="totalGaps">0</p>
                <small>Giao dịch thiếu</small>
            </div>
        </div>

        <!-- Quick Date Filters -->
        <div class="quick-filters">
            <button data-filter="today">Hôm nay</button>
            <button data-filter="yesterday">Hôm qua</button>
            <button data-filter="thisWeek">Tuần này</button>
            <button data-filter="thisMonth" class="active">Tháng này</button>
            <!-- ... -->
        </div>

        <!-- Advanced Filters -->
        <div class="filters">
            <select id="filterType">
                <option value="">Tất cả</option>
                <option value="in">Tiền vào</option>
                <option value="out">Tiền ra</option>
            </select>
            <input type="text" id="filterGateway" placeholder="Ngân hàng">
            <input type="date" id="filterStartDate">
            <input type="date" id="filterEndDate">
            <input type="text" id="filterSearch" placeholder="Tìm kiếm...">
            <input type="text" id="filterAmount" placeholder="Số tiền (VD: 100k)">
        </div>

        <!-- Data Table -->
        <table class="data-table">
            <thead>
                <tr>
                    <th>Ngày giờ</th>
                    <th>Ngân hàng</th>
                    <th>Loại</th>
                    <th>Số tiền</th>
                    <th>Số dư</th>
                    <th>Nội dung</th>
                    <th>Mã tham chiếu</th>
                    <th>Tên khách hàng</th>
                    <th>Số điện thoại</th>
                    <th>QR Code</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody id="tableBody">
                <!-- Dynamic content -->
            </tbody>
        </table>

        <!-- Pagination -->
        <div class="pagination">
            <button id="prevPageBtn">Trước</button>
            <span id="pageInfo">Trang 1 / 1</span>
            <button id="nextPageBtn">Sau</button>
        </div>
    </div>

    <!-- Modals -->
    <div id="detailModal" class="modal"><!-- Chi tiết giao dịch --></div>
    <div id="rawDataModal" class="modal"><!-- Xem raw JSON --></div>
    <div id="qrModal" class="modal"><!-- QR Code popup --></div>
    <div id="customerListModal" class="modal"><!-- Danh sách KH theo SĐT --></div>
    <div id="editCustomerModal" class="modal"><!-- Sửa thông tin KH --></div>
    <div id="gapsModal" class="modal"><!-- Giao dịch thiếu --></div>

    <!-- Scripts -->
    <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js"></script>
    <script src="../js/firebase-config.js"></script>
    <script src="../js/navigation-modern.js"></script>
    <script src="auth.js"></script>
    <script src="cache.js"></script>
    <script src="config.js"></script>
    <script src="qr-generator.js"></script>
    <script src="customer-info.js"></script>
    <script src="main.js"></script>
    <script>lucide.createIcons();</script>
</body>
</html>
```

### 5.2 Load Dữ Liệu (main.js)

```javascript
// State
let currentPage = 1;
let totalPages = 1;
let currentQuickFilter = 'thisMonth';
let filters = {
    type: '',
    gateway: '',
    startDate: '',
    endDate: '',
    search: '',
    amount: ''
};

// API Base URL từ config
const API_BASE_URL = window.CONFIG?.API_BASE_URL || 
    'https://your-cloudflare-worker.workers.dev';

// Load Data
async function loadData() {
    showLoading();
    
    try {
        const queryParams = new URLSearchParams({
            page: currentPage,
            limit: 50,
            ...filters
        });
        
        // Remove empty params
        for (let [key, value] of queryParams.entries()) {
            if (!value) queryParams.delete(key);
        }
        
        const response = await fetch(
            `${API_BASE_URL}/api/sepay/history?${queryParams}`
        );
        
        const result = await response.json();
        
        if (result.success) {
            renderTable(result.data);
            updatePagination(result.pagination);
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Lỗi khi tải dữ liệu');
    } finally {
        hideLoading();
    }
}

// Load Statistics
async function loadStatistics() {
    try {
        const queryParams = new URLSearchParams({
            ...filters
        });
        
        const response = await fetch(
            `${API_BASE_URL}/api/sepay/statistics?${queryParams}`
        );
        
        const result = await response.json();
        
        if (result.success) {
            renderStatistics(result.statistics);
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Render Statistics
function renderStatistics(stats) {
    document.getElementById('totalIn').textContent = formatCurrency(stats.total_in);
    document.getElementById('totalInCount').textContent = `${stats.total_in_count} giao dịch`;
    document.getElementById('totalOut').textContent = formatCurrency(stats.total_out);
    document.getElementById('totalOutCount').textContent = `${stats.total_out_count} giao dịch`;
    document.getElementById('netChange').textContent = formatCurrency(stats.net_change);
    document.getElementById('latestBalance').textContent = formatCurrency(stats.latest_balance);
}
```

### 5.3 Quick Filter Dates

```javascript
function getQuickFilterDates(filterType) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate, endDate;
    
    switch (filterType) {
        case 'today':
            startDate = new Date(today);
            endDate = new Date(today);
            break;
            
        case 'yesterday':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(startDate);
            break;
            
        case 'thisWeek':
            startDate = new Date(today);
            const dayOfWeek = startDate.getDay();
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            startDate.setDate(startDate.getDate() + diffToMonday);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            break;
            
        case 'thisMonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
            
        case 'lastMonth':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;
            
        case 'last7days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 6);
            endDate = new Date(today);
            break;
            
        case 'last30days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 29);
            endDate = new Date(today);
            break;
    }
    
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };
}
```

### 5.4 Parse Amount Input

```javascript
// Hỗ trợ: 100000, 100k, 1m, 1.5tr
function parseAmountInput(input) {
    if (!input) return '';
    
    let normalized = input.trim().toLowerCase();
    
    if (normalized.endsWith('k')) {
        const num = parseFloat(normalized.slice(0, -1).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000));
    }
    if (normalized.endsWith('m')) {
        const num = parseFloat(normalized.slice(0, -1).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000000));
    }
    if (normalized.endsWith('tr')) {
        const num = parseFloat(normalized.slice(0, -2).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000000));
    }
    
    return normalized.replace(/[^\d]/g, '') || '';
}
```

---

## 6. Hệ Thống Xác Thực

### 6.1 AuthManager Class

```javascript
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        try {
            // Check sessionStorage first, then localStorage
            let authData = sessionStorage.getItem("loginindex_auth");
            let isFromSession = true;

            if (!authData) {
                authData = localStorage.getItem("loginindex_auth");
                isFromSession = false;
            }

            if (authData) {
                const auth = JSON.parse(authData);
                if (this.isValidSession(auth, isFromSession)) {
                    this.currentUser = auth;
                    return true;
                } else {
                    this.clearAuth();
                }
            }
        } catch (error) {
            console.error("Error reading auth:", error);
            this.clearAuth();
        }
        return false;
    }

    isValidSession(auth, isFromSession = false) {
        if (!auth.isLoggedIn || !auth.userType || auth.checkLogin === undefined) {
            return false;
        }

        // Session timeout
        const SESSION_TIMEOUT = isFromSession
            ? 8 * 60 * 60 * 1000  // 8 hours for session
            : 30 * 24 * 60 * 60 * 1000; // 30 days for remembered

        if (auth.timestamp && Date.now() - auth.timestamp > SESSION_TIMEOUT) {
            return false;
        }

        return true;
    }

    isAuthenticated() {
        const auth = this.getAuthState();
        return auth && auth.isLoggedIn === "true";
    }

    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth) return false;
        return parseInt(auth.checkLogin) <= requiredLevel;
    }

    logout() {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    }
}

// Initialize immediately
const authManager = new AuthManager();
window.authManager = authManager;

// Redirect if not authenticated
if (!authManager.isAuthenticated()) {
    setTimeout(() => {
        if (!authManager.isAuthenticated()) {
            window.location.href = "../index.html";
        }
    }, 500);
}
```

---

## 7. Quản Lý Cache

### 7.1 CacheManager Class

```javascript
class CacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || 5 * 60 * 1000; // 5 minutes
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || "balance_history_cache";
        this.loadFromStorage();
        
        // Auto cleanup every 5 minutes
        setInterval(() => this.cleanExpired(), 5 * 60 * 1000);
    }

    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
        } catch (error) {
            if (error.name === "QuotaExceededError") {
                this.cache.clear();
            }
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return;

            const cacheData = JSON.parse(stored);
            const now = Date.now();

            cacheData.forEach(([key, value]) => {
                if (value.expires > now) {
                    this.cache.set(key, value);
                }
            });
        } catch (error) {
            console.warn("[CACHE] Cannot load:", error);
        }
    }

    set(key, value, type = "general") {
        const cacheKey = `${type}_${key}`;
        this.cache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expires: Date.now() + this.maxAge,
            type,
        });
        this.debouncedSave();
    }

    get(key, type = "general") {
        const cacheKey = `${type}_${key}`;
        const cached = this.cache.get(cacheKey);

        if (cached && cached.expires > Date.now()) {
            this.stats.hits++;
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
        }

        this.stats.misses++;
        return null;
    }

    clear(type = null) {
        if (type) {
            for (const [key, value] of this.cache.entries()) {
                if (value.type === type) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
            localStorage.removeItem(this.storageKey);
        }
    }
}

const cacheManager = new CacheManager();
window.cacheManager = cacheManager;
```

---

## 8. Tạo QR Code Chuyển Khoản

### 8.1 QRGenerator Object

```javascript
const QRGenerator = {
    // Bank configuration
    BANK_CONFIG: {
        ACB: {
            bin: '970416',      // Mã BIN ngân hàng
            name: 'ACB',
            accountNo: '75918', // Số tài khoản
            accountName: 'LAI THUY YEN NHI'
        }
    },

    /**
     * Generate unique transaction code
     * Format: N2 + 16 characters = 18 chars total
     * Example: "N2ABCD1234EFGH5678"
     */
    generateUniqueCode(prefix = 'N2') {
        const timestamp = Date.now().toString(36).toUpperCase().slice(-8);
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        const sequence = Math.floor(Math.random() * 1296)
            .toString(36).toUpperCase().padStart(2, '0');
        
        return `${prefix}${timestamp}${random}${sequence}`;
    },

    /**
     * Generate VietQR URL
     * @param {Object} options - { uniqueCode, amount, template }
     */
    generateVietQRUrl(options = {}) {
        const { uniqueCode, amount = 0, template = 'qr_only' } = options;
        const bank = this.BANK_CONFIG.ACB;
        
        // VietQR URL format: {BANK_BIN}-{ACCOUNT_NO}-{TEMPLATE}.png
        const baseUrl = 'https://img.vietqr.io/image';
        let url = `${baseUrl}/${bank.bin}-${bank.accountNo}-${template}.png`;
        
        const params = new URLSearchParams();
        if (amount > 0) {
            params.append('amount', amount);
        }
        params.append('addInfo', uniqueCode);
        params.append('accountName', bank.accountName);
        
        return `${url}?${params.toString()}`;
    },

    /**
     * Generate deposit QR with new unique code
     */
    generateDepositQR(amount = 0) {
        const uniqueCode = this.generateUniqueCode();
        const qrUrl = this.generateVietQRUrl({ uniqueCode, amount });
        
        return {
            uniqueCode,
            qrUrl,
            bankInfo: {
                bank: this.BANK_CONFIG.ACB.name,
                accountNo: this.BANK_CONFIG.ACB.accountNo,
                accountName: this.BANK_CONFIG.ACB.accountName
            },
            amount,
            createdAt: new Date().toISOString()
        };
    },

    /**
     * Regenerate QR from existing unique code
     */
    regenerateQR(uniqueCode, amount = 0) {
        const qrUrl = this.generateVietQRUrl({ uniqueCode, amount });
        
        return {
            uniqueCode,
            qrUrl,
            bankInfo: this.BANK_CONFIG.ACB,
            amount
        };
    },

    /**
     * Copy QR URL to clipboard
     */
    async copyQRUrl(qrUrl) {
        try {
            await navigator.clipboard.writeText(qrUrl);
            return true;
        } catch (error) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = qrUrl;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        }
    },

    /**
     * Download QR image
     */
    async downloadQRImage(qrUrl, filename = 'qr-code.png') {
        try {
            const response = await fetch(qrUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return true;
        } catch (error) {
            return false;
        }
    }
};

window.QRGenerator = QRGenerator;
```

### 8.2 Tạo Custom QR Image (Với Canvas)

```javascript
/**
 * Create custom QR image with bank info but WITHOUT account number
 * @param {string} qrUrl - Original QR URL
 * @param {string} customerInfo - Customer name to display
 * @returns {Promise<Blob>} - PNG image blob
 */
async function createCustomQRImage(qrUrl, customerInfo = '') {
    return new Promise(async (resolve, reject) => {
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                const padding = 30;
                const hasCustomer = customerInfo && customerInfo.trim();
                const textAreaHeight = hasCustomer ? 105 : 80;
                const canvasWidth = img.width + padding * 2;
                const canvasHeight = img.height + padding * 2 + textAreaHeight;

                const canvas = document.createElement('canvas');
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                const ctx = canvas.getContext('2d');

                // White background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);

                // Draw QR code
                const qrX = (canvasWidth - img.width) / 2;
                ctx.drawImage(img, qrX, padding, img.width, img.height);

                // Text area
                const textAreaY = img.height + padding * 1.5;
                ctx.fillStyle = '#f8f9fa';
                ctx.fillRect(padding / 2, textAreaY, canvasWidth - padding, textAreaHeight);

                // Bank info (NO account number!)
                ctx.fillStyle = '#333333';
                ctx.textAlign = 'center';
                const centerX = canvasWidth / 2;

                ctx.font = 'bold 16px Arial';
                ctx.fillText('Ngân hàng: ACB', centerX, textAreaY + 28);

                ctx.font = '15px Arial';
                ctx.fillText('Chủ tài khoản: LAI THUY YEN NHI', centerX, textAreaY + 55);

                // Customer info
                if (hasCustomer) {
                    ctx.font = 'bold 14px Arial';
                    ctx.fillStyle = '#10b981';
                    ctx.fillText('Khách hàng: ' + customerInfo, centerX, textAreaY + 82);
                }

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to create blob'));
                }, 'image/png');
            };

            img.onerror = () => reject(new Error('Failed to load QR image'));
            img.src = qrUrl;
        } catch (error) {
            reject(error);
        }
    });
}
```

---

## 9. Quản Lý Thông Tin Khách Hàng

### 9.1 CustomerInfoManager

```javascript
const CustomerInfoManager = {
    STORAGE_KEY: 'balance_history_customer_info',
    API_BASE_URL: null,
    firebaseDb: null,

    init() {
        this.API_BASE_URL = window.CONFIG?.API_BASE_URL;
        this.initFirebase();
        this.syncFromDatabase();
    },

    initFirebase() {
        if (typeof firebase === 'undefined' || !window.FIREBASE_CONFIG) {
            return;
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(window.FIREBASE_CONFIG);
        }

        this.firebaseDb = firebase.firestore();
        this.customersCollection = this.firebaseDb.collection('customers');
    },

    /**
     * Sync from PostgreSQL to localStorage
     */
    async syncFromDatabase() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/sepay/customer-info`);
            const result = await response.json();

            if (result.success && result.data) {
                const customerData = {};
                result.data.forEach(item => {
                    customerData[item.unique_code] = {
                        name: item.customer_name || '',
                        phone: item.customer_phone || '',
                        updatedAt: item.updated_at
                    };
                });

                this.saveAllCustomerInfo(customerData);
            }
        } catch (error) {
            console.error('[CUSTOMER-INFO] Sync failed:', error);
        }
    },

    /**
     * Get customer info by unique code
     */
    getCustomerInfo(uniqueCode) {
        if (!uniqueCode) return null;
        const allData = this.getAllCustomerInfo();
        return allData[uniqueCode] || null;
    },

    /**
     * Save customer info
     */
    async saveCustomerInfo(uniqueCode, customerInfo) {
        if (!uniqueCode) return false;

        // Save to localStorage
        const allData = this.getAllCustomerInfo();
        allData[uniqueCode] = {
            name: customerInfo.name || '',
            phone: customerInfo.phone || '',
            updatedAt: new Date().toISOString()
        };
        this.saveAllCustomerInfo(allData);

        // Save to PostgreSQL via API
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/sepay/customer-info`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uniqueCode,
                    customerName: customerInfo.name,
                    customerPhone: customerInfo.phone
                })
            });

            const result = await response.json();
            if (result.success) {
                // Sync to Firebase (optional)
                await this.syncToFirebase(customerInfo);
                return true;
            }
        } catch (error) {
            console.error('[CUSTOMER-INFO] Save failed:', error);
        }
        
        return true; // Still return true (saved to localStorage)
    },

    /**
     * Get display info
     */
    getCustomerDisplay(uniqueCode) {
        const info = this.getCustomerInfo(uniqueCode);

        if (!info || (!info.name && !info.phone)) {
            return {
                name: 'Chưa có thông tin',
                phone: 'Chưa có thông tin',
                hasInfo: false
            };
        }

        return {
            name: info.name || 'Chưa có thông tin',
            phone: info.phone || 'Chưa có thông tin',
            hasInfo: true
        };
    },

    // localStorage helpers
    getAllCustomerInfo() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch {
            return {};
        }
    },

    saveAllCustomerInfo(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch {
            return false;
        }
    }
};

window.CustomerInfoManager = CustomerInfoManager;
```

### 9.2 Trích Xuất Unique Code Từ Nội Dung

```javascript
// Trong renderTransactionRow()
function renderTransactionRow(row) {
    const content = row.content || '';
    
    // Tìm pattern N2 + 16 ký tự = 18 chars
    const uniqueCodeMatch = content.match(/\bN2[A-Z0-9]{16}\b/);
    const uniqueCode = uniqueCodeMatch ? uniqueCodeMatch[0] : null;

    let customerDisplay = { name: 'N/A', phone: 'N/A', hasInfo: false };
    if (uniqueCode && window.CustomerInfoManager) {
        customerDisplay = window.CustomerInfoManager.getCustomerDisplay(uniqueCode);
    }

    return `
        <tr>
            <td>${formatDateTime(row.transaction_date)}</td>
            <td>${row.gateway}</td>
            <td>${row.transfer_type === 'in' ? 'Tiền vào' : 'Tiền ra'}</td>
            <td>${formatCurrency(row.transfer_amount)}</td>
            <td>${formatCurrency(row.accumulated)}</td>
            <td>${content}</td>
            <td>${row.reference_code || 'N/A'}</td>
            <td>${customerDisplay.name}</td>
            <td>${customerDisplay.phone}</td>
            <td>
                ${uniqueCode ? `
                    <button onclick="showTransactionQR('${uniqueCode}')">QR</button>
                ` : 'N/A'}
            </td>
            <td>
                <button onclick="showDetail(${row.id})">Chi tiết</button>
            </td>
        </tr>
    `;
}
```

---

## 10. Phát Hiện Giao Dịch Thiếu (Gap Detection)

> [!WARNING]
> **Gap Detection** giúp phát hiện các giao dịch bị mất do webhook fail. Cần thiết cho việc reconciliation.

### 10.1 Cách Hoạt Động

1. Mã tham chiếu (reference_code) từ SePay là số tăng tuần tự
2. Nếu có gap (VD: 2565 → 2567, thiếu 2566), nghĩa là webhook cho 2566 không nhận được
3. UI hiển thị các giao dịch thiếu để user xử lý

### 10.2 API Gap Detection

```javascript
// Backend API
GET /api/sepay/detect-gaps

// Response
{
    "success": true,
    "total_gaps": 3,
    "gaps": [
        {
            "missing_reference_code": "2566",
            "previous_reference_code": "2565",
            "next_reference_code": "2567",
            "status": "detected"
        }
    ]
}
```

### 10.3 Client-Side Gap Detection (Trong Table)

```javascript
// Trong renderTable()
function renderTable(data) {
    const rows = [];

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const currentRef = parseInt(row.reference_code);

        // Check gap với row tiếp theo (data sorted DESC)
        if (i < data.length - 1) {
            const nextRow = data[i + 1];
            const nextRef = parseInt(nextRow.reference_code);

            if (!isNaN(currentRef) && !isNaN(nextRef) && currentRef - nextRef > 1) {
                // Có gap - thêm warning rows
                for (let missing = currentRef - 1; missing > nextRef; missing--) {
                    rows.push(renderGapRow(missing, nextRef, currentRef));
                }
            }
        }

        rows.push(renderTransactionRow(row));
    }

    tableBody.innerHTML = rows.join('');
}

function renderGapRow(missingRef, prevRef, nextRef) {
    return `
    <tr class="gap-row" style="background: #fef3c7; border: 2px dashed #f59e0b;">
        <td colspan="5">
            ⚠️ Giao dịch bị thiếu - Webhook không nhận được
        </td>
        <td style="font-weight: bold; color: #d97706;">
            ${missingRef}
        </td>
        <td colspan="4">
            <button onclick="fetchMissingTransaction('${missingRef}')">
                Lấy lại
            </button>
            <button onclick="ignoreGap('${missingRef}')">
                Bỏ qua
            </button>
        </td>
    </tr>
    `;
}
```

---

## 11. Realtime Updates (SSE)

### 11.1 Server-Sent Events Connection

```javascript
let eventSource = null;
let reconnectTimeout = null;

function connectRealtimeUpdates() {
    if (eventSource) return;

    try {
        eventSource = new EventSource(`${API_BASE_URL}/api/sepay/stream`);

        eventSource.addEventListener('connected', (e) => {
            console.log('[REALTIME] Connected');
            showRealtimeStatus('connected');
        });

        eventSource.addEventListener('new-transaction', (e) => {
            const transaction = JSON.parse(e.data);
            handleNewTransaction(transaction);
        });

        eventSource.onerror = (error) => {
            console.error('[REALTIME] Error:', error);
            showRealtimeStatus('error');

            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }

            // Reconnect after 5 seconds
            reconnectTimeout = setTimeout(() => {
                connectRealtimeUpdates();
            }, 5000);
        };

    } catch (error) {
        console.error('[REALTIME] Failed:', error);
    }
}

async function handleNewTransaction(transaction) {
    showNotification(transaction);

    if (transactionMatchesFilters(transaction)) {
        if (currentPage === 1) {
            loadData();
            loadStatistics();
        } else {
            showNewDataBanner();
        }
    }
}

// Auto-connect on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(connectRealtimeUpdates, 1000);
});
```

---

## 12. Triển Khai

### 12.1 Checklist Triển Khai

- [ ] **Database**
  - [ ] Tạo PostgreSQL database trên Render.com
  - [ ] Chạy migration `create_balance_history.sql`
  - [ ] Verify tables và indexes

- [ ] **Backend (Render.com)**
  - [ ] Deploy server với routes `/api/sepay/*`
  - [ ] Set environment variables: `DATABASE_URL`, `SEPAY_API_KEY`
  - [ ] Test API endpoints

- [ ] **Cloudflare Worker**
  - [ ] Deploy worker với proxy routes
  - [ ] Configure CORS headers
  - [ ] Test from frontend domain

- [ ] **SePay Webhook**
  - [ ] Đăng ký webhook URL: `https://your-worker.workers.dev/api/sepay/webhook`
  - [ ] Chọn API Key authentication
  - [ ] Copy API key → Render env vars
  - [ ] Test webhook với curl/Postman

- [ ] **Frontend**
  - [ ] Update `config.js` với đúng API_BASE_URL
  - [ ] Update `firebase-config.js` nếu dùng Firebase
  - [ ] Update bank config trong `qr-generator.js`
  - [ ] Test chức năng tạo QR, filter, pagination

### 12.2 Test Webhook

```bash
# Test với curl
curl -X POST https://your-worker.workers.dev/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey your_sepay_api_key" \
  -d '{
    "id": 12345,
    "gateway": "ACB",
    "transactionDate": "2024-12-21 10:30:00",
    "accountNumber": "75918",
    "content": "N2TEST123456789012 Test",
    "transferType": "in",
    "transferAmount": 100000,
    "accumulated": 5000000,
    "referenceCode": "99999"
  }'
```

### 12.3 Troubleshooting

| Vấn Đề | Nguyên Nhân | Giải Pháp |
|--------|-------------|-----------|
| Webhook không nhận được | URL sai hoặc API key không đúng | Kiểm tra SePay dashboard, check logs |
| CORS Error | Cloudflare Worker thiếu headers | Thêm CORS headers vào worker |
| Data không hiển thị | API_BASE_URL sai | Kiểm tra `config.js` |
| QR không generate | VietQR URL sai | Kiểm tra bank BIN và account |
| Realtime không hoạt động | SSE endpoint down | Kiểm tra server logs |

---

## Tài Liệu Tham Khảo

- [SePay Webhook Documentation](https://docs.sepay.vn/tich-hop-webhooks.html)
- [VietQR API](https://vietqr.io/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Render.com](https://render.com/docs)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)

---

> [!NOTE]
> Tài liệu này được tạo dựa trên phân tích mã nguồn tại `https://nhijudyshop.github.io/n2store/balance-history/index.html`. Để hiện thực lại, cần thay đổi các thông tin cấu hình (bank account, API URLs, Firebase config) phù hợp với dự án của bạn.
