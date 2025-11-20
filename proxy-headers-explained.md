# 📖 Giải Thích Chi Tiết Về Headers Trong Proxy Server

## ⚡ TL;DR (Tóm Tắt Nhanh)

**Vấn đề:** Nhiều người nghĩ headers từ client sẽ được gửi trực tiếp đến API server khi dùng proxy.

**Sự thật:** 
- Client → Proxy: Headers A (từ client domain)
- Proxy → API Server: Headers B (được proxy transform)
- API Server CHỈ nhận Headers B, KHÔNG nhận Headers A

**Giải pháp:**
```javascript
// ❌ SAI: Forward tất cả headers
const headers = { ...req.headers };

// ✅ ĐÚNG: Tạo headers mới
const headers = {
    'Authorization': req.headers.authorization,  // Keep
    'Origin': 'https://api-server.com',          // Replace
    'Referer': 'https://api-server.com/',        // Replace
    'API-Key': 'secret'                          // Add new
};
```

**Bonus - Dynamic Learning:**
```javascript
// 🔥 Tự động học và cập nhật từ server response
if (response.headers['api-version']) {
    dynamicDefaults['API-Version'] = response.headers['api-version'];
}
// → Request tiếp theo tự động dùng version mới!
```

**Xem phần chi tiết bên dưới để hiểu rõ hơn!**

---

## 📑 Mục Lục

1. [🎯 Vấn Đề Cốt Lõi](#-vấn-đề-cốt-lõi)
2. [🔄 Luồng Request Flow](#-luồng-request-flow)
3. [💻 Code Implementation](#-code-implementation)
4. [🧪 Cách Verify](#-cách-verify-kiểm-chứng)
5. [🤔 FAQ - Câu Hỏi Thường Gặp](#-faq---câu-hỏi-thường-gặp)
6. [🎯 Ví Dụ Thực Tế](#-ví-dụ-thực-tế)
7. [📊 So Sánh Trực Quan](#-so-sánh-trực-quan)
8. [🚀 Best Practices](#-best-practices)
9. [🔐 Security Considerations](#-security-considerations)
10. [🌍 Áp Dụng Cho Các Môi Trường](#-áp-dụng-cho-các-môi-trường)
11. [💼 Real-World Use Cases](#-real-world-use-cases)
12. [🔄 Dynamic Header Learning - Học Headers Từ Response](#-dynamic-header-learning---học-headers-từ-response) ⭐
13. [🎓 Kết Luận](#-kết-luận)

---

## 🎯 Vấn Đề Cốt Lõi

Khi sử dụng **Proxy Server** để forward request từ **Client Application** đến **API Server đích**, nhiều người nhầm lẫn rằng **headers từ client sẽ được gửi trực tiếp đến server đích**. 

**❌ SAI LẦM:** Server đích nhận được headers từ client gốc  
**✅ ĐÚNG:** Server đích chỉ nhận headers mà proxy server gửi

---

## 🔄 Luồng Request Flow

```
┌─────────────┐      Request A       ┌──────────────┐      Request B       ┌──────────────────┐
│   Client    │  ──────────────────> │ Proxy Server │  ──────────────────> │   API Server     │
│ Application │  (client-domain.com) │  (middleware)│  (api-server.com)    │ (Origin Server)  │
└─────────────┘                      └──────────────┘                       └──────────────────┘
       │                                    │                                        │
       │  Headers:                          │  Headers:                              │
       │  • Host: proxy.yourdomain.com      │  • Host: api-server.com                │
       │  • Origin: https://client.com      │  • Origin: https://api-server.com      │
       │  • Referer: https://client.com/... │  • Referer: https://api-server.com/    │
       │  • Authorization: Bearer xxx       │  • Authorization: Bearer xxx (✅ kept) │
       └───────────────────────────────────>│  • Custom-Header: value (✅ added)     │
                                             │  • API-Key: secret (✅ added)          │
                                             └───────────────────────────────────────>│
```

### 🔍 Giải Thích Chi Tiết:

#### **Request A: Client → Proxy**
- **URL:** `https://proxy.yourdomain.com/api/endpoint`
- **Headers tự động từ client:**
  ```
  Host: proxy.yourdomain.com
  Origin: https://client-app.com
  Referer: https://client-app.com/page.html
  User-Agent: Mozilla/5.0...
  Authorization: Bearer eyJ...
  ```
- **Đây là headers mà proxy server NHẬN ĐƯỢC từ client**

#### **Request B: Proxy → API Server**
- **URL:** `https://api-server.com/endpoint`
- **Headers do proxy tạo mới:**
  ```
  Host: api-server.com (auto by axios/http client)
  Origin: https://api-server.com (replaced)
  Referer: https://api-server.com/ (replaced)
  User-Agent: Mozilla/5.0... (forwarded or replaced)
  Authorization: Bearer eyJ... (forwarded)
  API-Version: 1.0 (added)
  X-Custom-Header: value (added)
  ```
- **Đây là headers mà API server THẬT SỰ NHẬN được từ proxy**

---

## 💻 Code Implementation

### ❌ Code SAI (Forward trực tiếp headers từ client)

```javascript
app.all('/api/*', async (req, res) => {
    const headers = {
        ...req.headers  // ❌ Forward TẤT CẢ headers từ client
    };
    
    const response = await axios({
        url: targetUrl,
        headers: headers  // ← Server sẽ nhận Origin: https://client-app.com
    });
});
```

**Vấn đề:**
- Server thấy `Origin: https://client-app.com` → CORS error hoặc security check fail
- Server thấy `Host: proxy.yourdomain.com` → Sai domain
- Server thấy `Referer: https://client-app.com/...` → Không tin tưởng request

### ✅ Code ĐÚNG (Tạo headers mới cho server đích)

```javascript
app.all('/api/*', async (req, res) => {
    const targetUrl = `${API_BASE}${apiPath}`;
    
    // Tạo headers MỚI cho server đích
    const headers = {
        // 1. CHỈ forward một số headers cần thiết
        'Authorization': req.headers.authorization,  // ✅ Token cần forward
        'Content-Type': req.headers['content-type'] || 'application/json',
        
        // 2. THAY ĐỔI origin/referer/host thành server đích
        'Origin': 'https://api-server.com',           // ✅ Giả mạo thành API server
        'Referer': 'https://api-server.com/',         // ✅ Giả mạo thành API server
        // Host: axios tự động set từ URL
        
        // 3. THÊM custom headers cần thiết
        'API-Version': '1.0',
        'X-Custom-Header': 'value',
        'User-Agent': req.headers['user-agent']
    };
    
    // Gửi request với headers ĐÃ CHỈNH SỬA
    const response = await axios({
        method: req.method,
        url: targetUrl,
        headers: headers,  // ← Server nhận headers ĐÚNG
        data: req.body
    });
    
    res.status(response.status).json(response.data);
});
```

---

## 🧪 Cách Verify (Kiểm Chứng)

### Method 1: Console Logging

Thêm logging vào proxy để xem headers thật sự gửi đi:

```javascript
const response = await axios({
    method: req.method,
    url: targetUrl,
    headers: headers,
    data: req.body
});

console.log('\n' + '='.repeat(60));
console.log('📤 SENT TO API SERVER:');
console.log('URL:', targetUrl);
console.log('Headers:', JSON.stringify(headers, null, 2));
console.log('📥 Response:', response.status, response.statusText);
console.log('='.repeat(60) + '\n');
```

**Output sẽ là:**
```
============================================================
📤 SENT TO API SERVER:
URL: https://api-server.com/v1/endpoint
Headers: {
  "Authorization": "Bearer eyJ...",
  "Content-Type": "application/json",
  "Origin": "https://api-server.com",        ← ✅ ĐÚNG
  "Referer": "https://api-server.com/",      ← ✅ ĐÚNG
  "API-Version": "1.0",
  "X-Custom-Header": "value"
}
📥 Response: 200 OK
============================================================
```

### Method 2: Network Tools

1. **Charles Proxy / Fiddler:**
   - Intercept traffic từ proxy server → API
   - Xem chính xác headers được gửi đi

2. **Wireshark:**
   - Capture network packets
   - Filter: `http.host == "api-server.com"`
   - Xem raw HTTP headers

3. **curl Test:**
   ```bash
   # Từ proxy server, test trực tiếp
   curl -v https://api-server.com/v1/test \
     -H "Origin: https://api-server.com" \
     -H "Referer: https://api-server.com/" \
     -H "Authorization: Bearer xxx"
   ```

### Method 3: API Response

Nếu API server có endpoint debug:
```javascript
// Request
GET /api/debug/headers

// Response
{
  "receivedHeaders": {
    "host": "api-server.com",               ← ✅ Chứng minh server nhận đúng
    "origin": "https://api-server.com",
    "referer": "https://api-server.com/"
  }
}
```

---

## 🤔 FAQ - Câu Hỏi Thường Gặp

### Q1: Tại sao tôi thấy headers của client trong DevTools?

**A:** DevTools chỉ hiển thị **Request A** (Client → Proxy), không hiển thị **Request B** (Proxy → API). Đó là lý do bạn thấy headers từ client application.

```
Client DevTools ────> Chỉ thấy Request A
                      (client domain headers)

Server Logs     ────> Nhận Request B
                      (API server domain headers)
```

### Q2: Làm sao biết server có nhận đúng headers không?

**A:** Có 3 cách:
1. **Check response:** Nếu API trả về `200 OK` → Headers đúng
2. **Check logs:** Thêm logging vào proxy code
3. **Check CORS:** Nếu không bị CORS error → Origin header đúng

### Q3: Custom headers (API-Version, X-Custom-*) có được gửi không?

**A:** 
- ❌ Client **KHÔNG TỰ ĐỘNG** gửi custom headers
- ✅ Proxy server **THÊM VÀO** khi forward request
- ✅ API server **NHẬN ĐƯỢC** custom headers từ proxy

### Q4: Có cần forward tất cả headers không?

**A:** **KHÔNG!** Chỉ forward những headers cần thiết:

| Header | Forward? | Lý do |
|--------|----------|-------|
| Authorization | ✅ Yes | Token quan trọng |
| Content-Type | ✅ Yes | API cần biết format |
| Origin | ❌ No (Replace) | Phải thay = server đích |
| Referer | ❌ No (Replace) | Phải thay = server đích |
| Host | ❌ No (Auto) | Axios tự động set |
| Cookie | ⚠️ Careful | Có thể gây xung đột session |
| User-Agent | ✅ Yes | Tùy chọn |

### Q5: Tại sao không dùng `...req.headers`?

**A:** Vì sẽ forward CẢ headers từ client:

```javascript
// ❌ SAI
const headers = { ...req.headers };
// → Origin: https://client-app.com
// → Referer: https://client-app.com/...
// → Host: proxy.yourdomain.com

// ✅ ĐÚNG
const headers = {
    'Authorization': req.headers.authorization,
    'Origin': 'https://api-server.com'  // Replace
};
// → Origin: https://api-server.com
// → Referer: https://api-server.com/
```

### Q6: CORS error từ đâu?

**A:** CORS check xảy ra ở **Client (Browser)**, không phải ở Proxy hay API:

```
Client ──CORS Check──> Proxy (KHÔNG CÓ CORS)
Proxy ──────────────────> API (KHÔNG CÓ CORS)

API ────Response────────> Proxy
Proxy ──Add CORS────────> Client (CÓ CORS CHECK)
```

Proxy phải có:
```javascript
app.use(cors());  // Cho phép client request đến proxy
```

---

## 🎯 Ví Dụ Thực Tế

### Scenario: Chat Application

**Yêu cầu:**
- Frontend: `https://app.example.com`
- Proxy: `https://proxy.example.com` (hoặc `http://localhost:8080` trong development)
- API: `https://api-server.com`

**Flow đầy đủ:**

```javascript
// 1. Client gửi request
fetch('https://proxy.example.com/api/chatomni/messages', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer token123',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: 'Hello' })
});

// Client tự động thêm:
// Origin: https://app.example.com
// Referer: https://app.example.com/chat.html
// Host: proxy.example.com

// 2. Proxy nhận và transform
app.post('/api/*', async (req, res) => {
    // Input từ client
    console.log('Received:', req.headers.origin);  // https://app.example.com
    
    // Transform headers
    const headers = {
        'Authorization': req.headers.authorization,  // Bearer token123
        'Content-Type': 'application/json',
        'Origin': 'https://api-server.com',         // ← Thay đổi
        'Referer': 'https://api-server.com/',       // ← Thay đổi
        'API-Version': '1.0'                        // ← Thêm mới
    };
    
    // Gửi đến API
    const response = await axios.post(
        'https://api-server.com/chatomni/messages',
        req.body,
        { headers }
    );
    
    // Output đến API
    console.log('Sent:', headers.origin);  // https://api-server.com
    
    res.json(response.data);
});

// 3. API Server nhận
// Host: api-server.com
// Origin: https://api-server.com    ← ✅ ĐÚNG
// Referer: https://api-server.com/  ← ✅ ĐÚNG
// Authorization: Bearer token123
// API-Version: 1.0
```

---

## 📊 So Sánh Trực Quan

| | Client thấy | Proxy xử lý | Server nhận |
|---|---|---|---|
| **URL** | `proxy.example.com/api/...` | Transform path | `api-server.com/...` |
| **Origin** | `https://app.example.com` | ❌ Loại bỏ | `https://api-server.com` |
| **Referer** | `https://app.example.com/...` | ❌ Loại bỏ | `https://api-server.com/` |
| **Host** | `proxy.example.com` | ❌ Không forward | `api-server.com` (auto) |
| **Authorization** | `Bearer token123` | ✅ Forward | `Bearer token123` |
| **Content-Type** | `application/json` | ✅ Forward | `application/json` |
| **API-Version** | ❌ Không có | ✅ Thêm mới | `1.0` |

---

## 🚀 Best Practices

### 1. Whitelist Headers
Chỉ forward headers cần thiết:

```javascript
const ALLOWED_HEADERS = [
    'authorization',
    'content-type',
    'accept',
    'user-agent'
];

const headers = {};
ALLOWED_HEADERS.forEach(key => {
    if (req.headers[key]) {
        headers[key] = req.headers[key];
    }
});

// Sau đó thêm các headers bắt buộc
headers['Origin'] = 'https://api-server.com';
headers['Referer'] = 'https://api-server.com/';
```

### 2. Dynamic Defaults
Học và cập nhật headers từ server response:

```javascript
let dynamicHeaders = {
    'API-Version': '1.0',
    'X-Client-Version': '2.0'
};

// Sau mỗi response
if (response.headers['api-version']) {
    dynamicHeaders['API-Version'] = response.headers['api-version'];
}
```

### 3. Logging & Monitoring
Log tất cả headers để debug:

```javascript
console.log('📥 Received from browser:', {
    origin: req.headers.origin,
    referer: req.headers.referer
});

console.log('📤 Sending to API:', {
    origin: headers.Origin,
    referer: headers.Referer
});
```

### 4. Error Handling
Xử lý trường hợp thiếu headers quan trọng:

```javascript
if (!req.headers.authorization) {
    return res.status(401).json({ 
        error: 'Missing Authorization header' 
    });
}
```

---

## 🔐 Security Considerations

### 1. Không Log Sensitive Data
```javascript
// ❌ SAI
console.log('Headers:', req.headers);  // Có thể log Bearer token

// ✅ ĐÚNG
console.log('Headers:', {
    ...req.headers,
    authorization: req.headers.authorization ? '***' : undefined
});
```

### 2. Validate Origin
```javascript
const ALLOWED_ORIGINS = [
    'https://app.example.com',
    'https://staging.example.com',
    'http://localhost:3000'  // Chỉ cho development
];

if (!ALLOWED_ORIGINS.includes(req.headers.origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
}
```

### 3. Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100  // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

---

## 🌍 Áp Dụng Cho Các Môi Trường

Proxy server pattern này áp dụng cho TẤT CẢ môi trường:

### Development Environment
```javascript
const API_CONFIG = {
    client: 'http://localhost:3000',
    proxy: 'http://localhost:8080',
    apiServer: 'https://api-dev.example.com'
};
```

### Staging Environment
```javascript
const API_CONFIG = {
    client: 'https://staging-app.example.com',
    proxy: 'https://staging-proxy.example.com',
    apiServer: 'https://api-staging.example.com'
};
```

### Production Environment
```javascript
const API_CONFIG = {
    client: 'https://app.example.com',
    proxy: 'https://proxy.example.com',
    apiServer: 'https://api.example.com'
};
```

**Nguyên tắc giống nhau cho MỌI môi trường:**
- Client → Proxy: Headers từ client domain
- Proxy → API: Headers được transform thành API server domain

---

## 💼 Real-World Use Cases

### Use Case 1: Microservices API Gateway
```
Mobile App (https://app.company.com)
    ↓
API Gateway (https://gateway.company.com)
    ↓
Backend Services (https://users-api.internal, https://orders-api.internal)
```

### Use Case 2: Third-Party API Integration
```
Your Frontend (https://yourapp.com)
    ↓
Your Proxy (https://api-proxy.yourapp.com)
    ↓
Third-Party API (https://external-api.com)
```
**Tại sao cần proxy?**
- Hide API keys
- Rate limiting
- Request/Response transformation
- Caching

### Use Case 3: Cross-Domain API Calls
```
SPA Application (https://webapp.com)
    ↓
Backend Proxy (https://backend.webapp.com)
    ↓
Multiple APIs (https://api1.com, https://api2.com, https://api3.com)
```
**Lợi ích:**
- Tránh CORS issues
- Centralized authentication
- Request aggregation

---

## 🔄 Dynamic Header Learning - Học Headers Từ Response

### Vấn Đề

Nhiều API servers trả về headers chứa thông tin về phiên bản API, cấu hình, hoặc các giá trị mà proxy nên sử dụng cho các request tiếp theo. Thay vì hard-code các giá trị này, proxy có thể **học và tự động cập nhật** từ response.

### Cách Hoạt Động

```
Request 1 → Server
            Server trả về: API-Version: 2.0 (trong response headers)
            ↓
            Proxy lưu: dynamicHeaders['API-Version'] = '2.0'

Request 2 → Server (tự động dùng API-Version: 2.0)
Request 3 → Server (tự động dùng API-Version: 2.0)
...
```

### Implementation Chi Tiết

#### Cách 1: Học từ Response Headers

```javascript
const express = require('express');
const axios = require('axios');

const app = express();
const API_BASE = 'https://api-server.com';

// 🔥 Lưu trữ dynamic headers (trong memory hoặc Redis)
let dynamicDefaults = {
    'API-Version': '1.0',
    'X-Client-Version': '1.0.0',
    'X-API-Key-Version': 'v1'
};

app.all('/api/*', async (req, res) => {
    const apiPath = req.path.replace('/api', '');
    const targetUrl = `${API_BASE}${apiPath}`;
    
    // Sử dụng dynamic defaults
    const headers = {
        'Authorization': req.headers.authorization,
        'Content-Type': 'application/json',
        'Origin': 'https://api-server.com',
        'Referer': 'https://api-server.com/',
        
        // ✅ Sử dụng giá trị dynamic (có thể đã được cập nhật)
        'API-Version': dynamicDefaults['API-Version'],
        'X-Client-Version': dynamicDefaults['X-Client-Version'],
        'X-API-Key-Version': dynamicDefaults['X-API-Key-Version']
    };
    
    // Gửi request
    const response = await axios({
        method: req.method,
        url: targetUrl,
        headers: headers,
        data: req.body
    });
    
    // 🔥 HỌC từ response headers
    if (response.headers['api-version']) {
        const newVersion = response.headers['api-version'];
        if (newVersion !== dynamicDefaults['API-Version']) {
            console.log(`📦 Updated API-Version: ${dynamicDefaults['API-Version']} → ${newVersion}`);
            dynamicDefaults['API-Version'] = newVersion;
        }
    }
    
    if (response.headers['x-client-version']) {
        const newClientVersion = response.headers['x-client-version'];
        if (newClientVersion !== dynamicDefaults['X-Client-Version']) {
            console.log(`📱 Updated X-Client-Version: ${dynamicDefaults['X-Client-Version']} → ${newClientVersion}`);
            dynamicDefaults['X-Client-Version'] = newClientVersion;
        }
    }
    
    if (response.headers['x-api-key-version']) {
        const newKeyVersion = response.headers['x-api-key-version'];
        if (newKeyVersion !== dynamicDefaults['X-API-Key-Version']) {
            console.log(`🔑 Updated X-API-Key-Version: ${dynamicDefaults['X-API-Key-Version']} → ${newKeyVersion}`);
            dynamicDefaults['X-API-Key-Version'] = newKeyVersion;
        }
    }
    
    // Forward response
    res.status(response.status).json(response.data);
});

// API để xem current defaults
app.get('/proxy/config', (req, res) => {
    res.json({
        message: 'Current dynamic defaults',
        defaults: dynamicDefaults,
        lastUpdated: new Date().toISOString()
    });
});
```

#### Cách 2: Học từ Response Body

Nhiều API trả config trong response body:

```javascript
// Response từ API server
{
    "data": { ... },
    "config": {
        "apiVersion": "2.1.0",
        "requiredHeaders": {
            "X-Client-Version": "2.0.0",
            "X-Feature-Flags": "new-ui,beta-feature"
        }
    }
}
```

**Proxy code:**

```javascript
const response = await axios({
    method: req.method,
    url: targetUrl,
    headers: headers,
    data: req.body
});

// 🔥 HỌC từ response body
if (response.data && response.data.config) {
    const serverConfig = response.data.config;
    
    // Cập nhật API version
    if (serverConfig.apiVersion) {
        dynamicDefaults['API-Version'] = serverConfig.apiVersion;
        console.log(`📦 Updated from body: API-Version → ${serverConfig.apiVersion}`);
    }
    
    // Cập nhật tất cả required headers
    if (serverConfig.requiredHeaders) {
        Object.keys(serverConfig.requiredHeaders).forEach(key => {
            dynamicDefaults[key] = serverConfig.requiredHeaders[key];
            console.log(`🔄 Updated from body: ${key} → ${serverConfig.requiredHeaders[key]}`);
        });
    }
}

res.status(response.status).json(response.data);
```

### Lưu Trữ Persistent (Khuyến Nghị)

Thay vì lưu trong memory (mất khi restart), nên dùng:

#### Option 1: Redis

```javascript
const redis = require('redis');
const client = redis.createClient();

// Lưu
await client.set('proxy:dynamic-headers', JSON.stringify(dynamicDefaults));

// Đọc
const stored = await client.get('proxy:dynamic-headers');
dynamicDefaults = stored ? JSON.parse(stored) : defaultHeaders;
```

#### Option 2: Database

```javascript
// Lưu vào database
await db.config.updateOne(
    { key: 'dynamic-headers' },
    { $set: { value: dynamicDefaults, updatedAt: new Date() } },
    { upsert: true }
);

// Đọc từ database
const config = await db.config.findOne({ key: 'dynamic-headers' });
dynamicDefaults = config ? config.value : defaultHeaders;
```

#### Option 3: File (Đơn giản)

```javascript
const fs = require('fs').promises;
const CONFIG_FILE = './dynamic-headers.json';

// Lưu
async function saveDynamicHeaders() {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(dynamicDefaults, null, 2));
    console.log('💾 Saved dynamic headers to file');
}

// Đọc khi start
async function loadDynamicHeaders() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        dynamicDefaults = JSON.parse(data);
        console.log('📂 Loaded dynamic headers from file');
    } catch (error) {
        console.log('📝 Using default headers');
    }
}

// Gọi khi start server
app.listen(PORT, async () => {
    await loadDynamicHeaders();
    console.log(`Server started on port ${PORT}`);
});

// Cập nhật và lưu
if (response.headers['api-version']) {
    const newVersion = response.headers['api-version'];
    if (newVersion !== dynamicDefaults['API-Version']) {
        dynamicDefaults['API-Version'] = newVersion;
        await saveDynamicHeaders();  // Lưu ngay
    }
}
```

### Use Cases Thực Tế

#### Use Case 1: API Versioning
```javascript
// Server trả về version mới
Response Headers: {
    'api-version': '3.0'  // Thay vì 2.0
}

// Proxy tự động cập nhật cho tất cả request tiếp theo
Request Headers: {
    'API-Version': '3.0'  // ✅ Tự động dùng version mới
}
```

#### Use Case 2: Feature Flags
```javascript
// Server trả về feature flags mới
Response Body: {
    "config": {
        "features": "new-ui,beta-checkout,dark-mode"
    }
}

// Proxy tự động thêm vào request tiếp theo
Request Headers: {
    'X-Feature-Flags': 'new-ui,beta-checkout,dark-mode'
}
```

#### Use Case 3: Session Management
```javascript
// Server trả về session config
Response Headers: {
    'x-session-timeout': '3600',
    'x-refresh-token-url': '/auth/refresh'
}

// Proxy lưu và sử dụng cho session handling
```

### Monitoring & Debugging

```javascript
// Endpoint để xem history của updates
app.get('/proxy/config/history', (req, res) => {
    res.json({
        current: dynamicDefaults,
        history: headerUpdateHistory,  // Array of changes
        stats: {
            totalUpdates: headerUpdateHistory.length,
            lastUpdate: headerUpdateHistory[headerUpdateHistory.length - 1]
        }
    });
});

// Endpoint để reset về default
app.post('/proxy/config/reset', async (req, res) => {
    dynamicDefaults = {
        'API-Version': '1.0',
        'X-Client-Version': '1.0.0'
    };
    await saveDynamicHeaders();
    res.json({ 
        message: 'Reset to defaults',
        defaults: dynamicDefaults 
    });
});
```

### Lợi Ích

✅ **Tự động cập nhật**: Không cần manual update khi API thay đổi  
✅ **Zero downtime**: API version mới được áp dụng ngay lập tức  
✅ **Centralized**: Một nơi quản lý config cho tất cả clients  
✅ **Backward compatible**: Giữ giá trị default nếu server không trả về  
✅ **Auditable**: Log tất cả thay đổi để debug

### Lưu Ý Quan Trọng

⚠️ **Validate trước khi cập nhật:**
```javascript
if (response.headers['api-version']) {
    const newVersion = response.headers['api-version'];
    
    // ✅ Validate format
    if (/^\d+\.\d+(\.\d+)?$/.test(newVersion)) {
        dynamicDefaults['API-Version'] = newVersion;
    } else {
        console.error(`❌ Invalid version format: ${newVersion}`);
    }
}
```

⚠️ **Không update headers nhạy cảm:**
```javascript
const SENSITIVE_HEADERS = ['authorization', 'api-key', 'secret'];

if (!SENSITIVE_HEADERS.includes(headerName.toLowerCase())) {
    dynamicDefaults[headerName] = headerValue;
}
```

⚠️ **Rate limit cho updates:**
```javascript
let lastUpdate = Date.now();
const UPDATE_COOLDOWN = 60000; // 1 phút

if (Date.now() - lastUpdate > UPDATE_COOLDOWN) {
    // Update headers
    lastUpdate = Date.now();
}
```

---

## 🎓 Kết Luận

### Key Takeaways:

1. **Headers từ client ≠ Headers đến server đích**
2. **Proxy server transform headers trước khi forward**
3. **Origin/Referer/Host PHẢI được thay thế**
4. **Custom headers được THÊM VÀO bởi proxy**
5. **Verify bằng logging, không tin vào DevTools**
6. **🔥 Dynamic Learning: Proxy có thể tự động học và cập nhật headers từ server response**

### Checklist Khi Implement Proxy:

- [ ] ✅ Replace Origin thành server đích
- [ ] ✅ Replace Referer thành server đích  
- [ ] ✅ Không forward Host (để axios tự động)
- [ ] ✅ Forward Authorization header
- [ ] ✅ Forward Content-Type header
- [ ] ✅ Thêm custom headers cần thiết (API-Version, X-Custom-*, etc.)
- [ ] ✅ Thêm logging để verify
- [ ] ✅ Xử lý CORS cho client → proxy
- [ ] ✅ Test với API thật để đảm bảo response 200 OK
- [ ] 🔥 (Optional) Implement dynamic header learning từ response
- [ ] 🔥 (Optional) Lưu trữ persistent cho dynamic headers (Redis/DB/File)

---

## 📚 Tài Liệu Tham Khảo

- [MDN - HTTP Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- [Axios Documentation](https://axios-http.com/docs/req_config)
- [Express.js Proxy Middleware](https://github.com/chimurai/http-proxy-middleware)
- [Understanding CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

**📝 Document Version:** 2.0  
**📅 Last Updated:** 2024  
**🏷️ Tags:** proxy, headers, http, nodejs, express, axios, api-gateway, microservices

---

*Document này áp dụng cho bất kỳ proxy server nào (Node.js, Python, Go, Java, .NET, etc.) và bất kỳ môi trường nào (development, staging, production).*

*Nếu có thắc mắc hoặc cần giải thích thêm, vui lòng tham khảo thêm tài liệu về HTTP Headers và Proxy Patterns.* 🚀
