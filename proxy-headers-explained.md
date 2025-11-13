# 📖 Giải Thích Chi Tiết Về Headers Trong Proxy Server

## 🎯 Vấn Đề Cốt Lõi

Khi sử dụng **Proxy Server** để forward request từ `localhost` đến API server (ví dụ: `tomato.tpos.vn`), nhiều người nhầm lẫn rằng **headers từ browser sẽ được gửi trực tiếp đến server đích**. 

**❌ SAI LẦM:** Server đích nhận được headers từ browser (localhost)  
**✅ ĐÚNG:** Server đích chỉ nhận headers mà proxy server gửi

---

## 🔄 Luồng Request Flow

```
┌─────────┐         Request A          ┌──────────────┐         Request B          ┌─────────────────┐
│ Browser │  ─────────────────────────> │ Proxy Server │  ─────────────────────────> │ API Server      │
│         │  (localhost:8080)           │ (localhost)  │  (tomato.tpos.vn)          │ (tomato.tpos.vn)│
└─────────┘                             └──────────────┘                             └─────────────────┘
     │                                         │                                              │
     │  Headers:                               │  Headers:                                    │
     │  • Host: localhost:8080                 │  • Host: tomato.tpos.vn                      │
     │  • Origin: http://localhost:8080        │  • Origin: https://tomato.tpos.vn            │
     │  • Referer: http://localhost:8080/...   │  • Referer: https://tomato.tpos.vn/          │
     │  • Authorization: Bearer xxx            │  • Authorization: Bearer xxx (forwarded)     │
     └────────────────────────────────────────>│  • tposappversion: 5.10.26.1 (added)         │
                                                │  • x-tpos-lang: vi (added)                   │
                                                └─────────────────────────────────────────────>│
```

### 🔍 Giải Thích Chi Tiết:

#### **Request A: Browser → Proxy**
- **URL:** `http://localhost:8080/api/api-ms/chatomni/...`
- **Headers tự động từ browser:**
  ```
  Host: localhost:8080
  Origin: http://localhost:8080
  Referer: http://localhost:8080/chat-viewer.html
  User-Agent: Mozilla/5.0...
  Authorization: Bearer eyJ...
  ```
- **Đây là headers mà proxy server NHẬN ĐƯỢC**

#### **Request B: Proxy → API Server**
- **URL:** `https://tomato.tpos.vn/api-ms/chatomni/...`
- **Headers do proxy tạo mới:**
  ```
  Host: tomato.tpos.vn (auto)
  Origin: https://tomato.tpos.vn (replaced)
  Referer: https://tomato.tpos.vn/ (replaced)
  User-Agent: Mozilla/5.0... (forwarded or replaced)
  Authorization: Bearer eyJ... (forwarded)
  tposappversion: 5.10.26.1 (added)
  x-tpos-lang: vi (added)
  ```
- **Đây là headers mà API server THẬT SỰ NHẬN**

---

## 💻 Code Implementation

### ❌ Code SAI (Forward trực tiếp headers từ browser)

```javascript
app.all('/api/*', async (req, res) => {
    const headers = {
        ...req.headers  // ❌ Forward TẤT CẢ headers từ browser
    };
    
    const response = await axios({
        url: targetUrl,
        headers: headers  // ← Server sẽ nhận Origin: localhost:8080
    });
});
```

**Vấn đề:**
- Server thấy `Origin: http://localhost:8080` → CORS error
- Server thấy `Host: localhost:8080` → Sai domain
- Server thấy `Referer: http://localhost:8080/...` → Không tin tưởng

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
        'Origin': 'https://tomato.tpos.vn',           // ✅ Giả mạo thành tomato
        'Referer': 'https://tomato.tpos.vn/',         // ✅ Giả mạo thành tomato
        // Host: axios tự động set từ URL
        
        // 3. THÊM custom headers cần thiết
        'tposappversion': '5.10.26.1',
        'x-tpos-lang': 'vi',
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
URL: https://tomato.tpos.vn/api-ms/chatomni/v1/conversations
Headers: {
  "Authorization": "Bearer eyJ...",
  "Content-Type": "application/json",
  "Origin": "https://tomato.tpos.vn",        ← ✅ ĐÚNG
  "Referer": "https://tomato.tpos.vn/",      ← ✅ ĐÚNG
  "tposappversion": "5.10.26.1",
  "x-tpos-lang": "vi"
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
   - Filter: `http.host == "tomato.tpos.vn"`
   - Xem raw HTTP headers

3. **curl Test:**
   ```bash
   # Từ proxy server, test trực tiếp
   curl -v https://tomato.tpos.vn/api-ms/test \
     -H "Origin: https://tomato.tpos.vn" \
     -H "Referer: https://tomato.tpos.vn/" \
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
    "host": "tomato.tpos.vn",         ← ✅ Chứng minh server nhận đúng
    "origin": "https://tomato.tpos.vn",
    "referer": "https://tomato.tpos.vn/"
  }
}
```

---

## 🤔 FAQ - Câu Hỏi Thường Gặp

### Q1: Tại sao tôi thấy headers localhost trong DevTools?

**A:** DevTools chỉ hiển thị **Request A** (Browser → Proxy), không hiển thị **Request B** (Proxy → API). Đó là lý do bạn thấy localhost.

```
Browser DevTools ────> Chỉ thấy Request A
                       (localhost headers)

Server Logs     ────> Nhận Request B
                       (tomato.tpos.vn headers)
```

### Q2: Làm sao biết server có nhận đúng headers không?

**A:** Có 3 cách:
1. **Check response:** Nếu API trả về `200 OK` → Headers đúng
2. **Check logs:** Thêm logging vào proxy code
3. **Check CORS:** Nếu không bị CORS error → Origin header đúng

### Q3: Custom headers (tposappversion) có được gửi không?

**A:** 
- ❌ Browser **KHÔNG TỰ ĐỘNG** gửi custom headers
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

**A:** Vì sẽ forward CẢ headers localhost:

```javascript
// ❌ SAI
const headers = { ...req.headers };
// → Origin: http://localhost:8080
// → Referer: http://localhost:8080/...
// → Host: localhost:8080

// ✅ ĐÚNG
const headers = {
    'Authorization': req.headers.authorization,
    'Origin': 'https://tomato.tpos.vn'  // Replace
};
// → Origin: https://tomato.tpos.vn
// → Referer: https://tomato.tpos.vn/
```

### Q6: CORS error từ đâu?

**A:** CORS check xảy ra ở **Browser**, không phải ở Proxy hay API:

```
Browser ──CORS Check──> Proxy (KHÔNG CÓ CORS)
Proxy ──────────────────> API (KHÔNG CÓ CORS)

API ────Response────────> Proxy
Proxy ──Add CORS────────> Browser (CÓ CORS CHECK)
```

Proxy phải có:
```javascript
app.use(cors());  // Cho phép browser request đến proxy
```

---

## 🎯 Ví Dụ Thực Tế

### Scenario: Chat Application

**Yêu cầu:**
- Frontend: `http://localhost:3000`
- Proxy: `http://localhost:8080`
- API: `https://tomato.tpos.vn`

**Flow đầy đủ:**

```javascript
// 1. Browser gửi request
fetch('http://localhost:8080/api/chatomni/messages', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer token123',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: 'Hello' })
});

// Browser tự động thêm:
// Origin: http://localhost:3000
// Referer: http://localhost:3000/chat.html
// Host: localhost:8080

// 2. Proxy nhận và transform
app.post('/api/*', async (req, res) => {
    // Input từ browser
    console.log('Received:', req.headers.origin);  // http://localhost:3000
    
    // Transform headers
    const headers = {
        'Authorization': req.headers.authorization,  // Bearer token123
        'Content-Type': 'application/json',
        'Origin': 'https://tomato.tpos.vn',         // ← Thay đổi
        'Referer': 'https://tomato.tpos.vn/',       // ← Thay đổi
        'tposappversion': '5.10.26.1'               // ← Thêm mới
    };
    
    // Gửi đến API
    const response = await axios.post(
        'https://tomato.tpos.vn/chatomni/messages',
        req.body,
        { headers }
    );
    
    // Output đến API
    console.log('Sent:', headers.origin);  // https://tomato.tpos.vn
    
    res.json(response.data);
});

// 3. API Server nhận
// Host: tomato.tpos.vn
// Origin: https://tomato.tpos.vn    ← ✅ ĐÚNG
// Referer: https://tomato.tpos.vn/  ← ✅ ĐÚNG
// Authorization: Bearer token123
// tposappversion: 5.10.26.1
```

---

## 📊 So Sánh Trực Quan

| | Browser thấy | Proxy xử lý | Server nhận |
|---|---|---|---|
| **URL** | `localhost:8080/api/...` | Transform path | `tomato.tpos.vn/...` |
| **Origin** | `http://localhost:3000` | ❌ Loại bỏ | `https://tomato.tpos.vn` |
| **Referer** | `http://localhost:3000/...` | ❌ Loại bỏ | `https://tomato.tpos.vn/` |
| **Host** | `localhost:8080` | ❌ Không forward | `tomato.tpos.vn` (auto) |
| **Authorization** | `Bearer token123` | ✅ Forward | `Bearer token123` |
| **Content-Type** | `application/json` | ✅ Forward | `application/json` |
| **tposappversion** | ❌ Không có | ✅ Thêm mới | `5.10.26.1` |

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
headers['Origin'] = 'https://tomato.tpos.vn';
headers['Referer'] = 'https://tomato.tpos.vn/';
```

### 2. Dynamic Defaults
Học và cập nhật headers từ server response:

```javascript
let dynamicHeaders = {
    tposappversion: '5.10.26.1',
    'x-tpos-lang': 'vi'
};

// Sau mỗi response
if (response.headers['tposappversion']) {
    dynamicHeaders.tposappversion = response.headers['tposappversion'];
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
    'http://localhost:3000',
    'http://localhost:8080'
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

## 🎓 Kết Luận

### Key Takeaways:

1. **Headers từ browser ≠ Headers đến server đích**
2. **Proxy server transform headers trước khi forward**
3. **Origin/Referer/Host PHẢI được thay thế**
4. **Custom headers được THÊM VÀO bởi proxy**
5. **Verify bằng logging, không tin vào DevTools**

### Checklist Khi Implement Proxy:

- [ ] ✅ Replace Origin thành server đích
- [ ] ✅ Replace Referer thành server đích  
- [ ] ✅ Không forward Host (để axios tự động)
- [ ] ✅ Forward Authorization header
- [ ] ✅ Forward Content-Type header
- [ ] ✅ Thêm custom headers (tposappversion, x-tpos-lang)
- [ ] ✅ Thêm logging để verify
- [ ] ✅ Xử lý CORS cho browser → proxy
- [ ] ✅ Test với API thật để đảm bảo response 200 OK

---

## 📚 Tài Liệu Tham Khảo

- [MDN - HTTP Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- [Axios Documentation](https://axios-http.com/docs/req_config)
- [Express.js Proxy Middleware](https://github.com/chimurai/http-proxy-middleware)
- [Understanding CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

**📝 Tác giả:** xGreenx  
**📅 Ngày tạo:** 2024  
**🏷️ Tags:** proxy, headers, nodejs, express, axios, api-gateway

---

*Nếu có thắc mắc hoặc cần giải thích thêm, vui lòng liên hệ!* 🚀
