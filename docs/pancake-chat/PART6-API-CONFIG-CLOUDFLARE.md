# PART 6: API CONFIG & CLOUDFLARE WORKER

## Tổng quan

Tất cả API calls đều đi qua Cloudflare Worker proxy để xử lý CORS, headers, retry, và rate limiting.

**Source files:**
- `orders-report/js/core/api-config.js` (121 lines)
- `cloudflare-worker/modules/handlers/pancake-handler.js` (170 lines)
- `render.com/routes/pancake.js`

---

## 1. API Configuration (api-config.js)

### 1.1 Server URLs

```javascript
const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

const API_CONFIG = {
    WORKER_URL: WORKER_URL,

    // TPOS OData API
    get TPOS_ODATA() { return `${WORKER_URL}/api/odata`; },

    // Pancake API
    get PANCAKE() { return `${WORKER_URL}/api/pancake`; },
};
```

### 1.2 URL Builder Functions

#### `buildUrl.pancake(endpoint, params)` - Pancake Internal API

```javascript
// Input:  pancake('pages', 'access_token=TOKEN')
// Output: https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake/pages?access_token=TOKEN
// Target: https://pancake.vn/api/v1/pages?access_token=TOKEN

buildUrl.pancake = (endpoint, params = '') => {
    const baseUrl = `${WORKER_URL}/api/pancake/${endpoint}`;
    return params ? `${baseUrl}?${params}` : baseUrl;
};
```

#### `buildUrl.pancakeOfficial(endpoint, pageAccessToken)` - Pancake Official API (pages.fm)

```javascript
// Input:  pancakeOfficial('pages/123/conversations/456/messages', 'PAGE_TOKEN')
// Output: https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake-official/pages/123/conversations/456/messages?page_access_token=PAGE_TOKEN
// Target: https://pages.fm/api/public_api/v1/pages/123/conversations/456/messages?page_access_token=PAGE_TOKEN

buildUrl.pancakeOfficial = (endpoint, pageAccessToken) => {
    const baseUrl = `${WORKER_URL}/api/pancake-official/${endpoint}`;
    return pageAccessToken ? `${baseUrl}?page_access_token=${pageAccessToken}` : baseUrl;
};
```

#### `buildUrl.pancakeDirect(endpoint, pageId, jwtToken, accessToken)` - Direct API (24h bypass)

```javascript
// Input:  pancakeDirect('pages/123/check_inbox', '123', 'JWT', 'TOKEN')
// Output: https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake-direct/pages/123/check_inbox?page_id=123&jwt=JWT&access_token=TOKEN
// Target: https://pancake.vn/api/v1/pages/123/check_inbox (with custom Referer + Cookie)

buildUrl.pancakeDirect = (endpoint, pageId, jwtToken, accessToken) => {
    const params = new URLSearchParams();
    params.set('page_id', pageId);
    params.set('jwt', jwtToken);
    params.set('access_token', accessToken);
    return `${WORKER_URL}/api/pancake-direct/${endpoint}?${params.toString()}`;
};
```

#### `buildUrl.facebookSend()` - Facebook Send API

```javascript
// Output: https://chatomni-proxy.nhijudyshop.workers.dev/api/facebook-send
// Dùng để bypass 24h policy với POST_PURCHASE_UPDATE message_tag

buildUrl.facebookSend = () => `${WORKER_URL}/api/facebook-send`;
```

### 1.3 Smart Fetch

```javascript
API_CONFIG.smartFetch = async function(url, options = {}) {
    return fetch(url, options);
    // Wrapper đơn giản, có thể extend thêm retry/fallback
};
```

---

## 2. Cloudflare Worker - Pancake Handler

### 2.1 Route Mapping

```
/api/pancake/*          → handlePancakeGeneric()    → pancake.vn/api/v1/*
/api/pancake-official/* → handlePancakeOfficial()   → pages.fm/api/public_api/v1/*
/api/pancake-direct/*   → handlePancakeDirect()     → pancake.vn/api/v1/* (with custom headers)
```

### 2.2 `/api/pancake/*` - Generic Proxy

```javascript
export async function handlePancakeGeneric(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\/pancake\//, '');
    const targetUrl = `https://pancake.vn/api/v1/${apiPath}${url.search}`;

    const headers = new Headers();
    headers.set('Accept', 'application/json, text/plain, */*');
    headers.set('Accept-Language', 'vi,en-US;q=0.9,en;q=0.8');
    headers.set('Origin', 'https://pancake.vn');
    headers.set('Referer', 'https://pancake.vn/multi_pages');
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...');

    const response = await fetchWithRetry(targetUrl, {
        method: request.method,
        headers,
        body: request.method !== 'GET' ? await request.arrayBuffer() : null,
    }, 3, 1000, 15000);  // 3 retries, 1s delay, 15s timeout

    return proxyResponseWithCors(response);
}
```

**Dùng cho:**
- `GET /pages` - Lấy danh sách pages
- `GET /conversations` - Lấy conversations
- `POST /conversations/search` - Tìm kiếm
- `GET /conversations/customer/{fbId}` - Lấy theo FB ID
- `GET /pages/{id}/customers/{custId}/inbox_preview` - Inbox preview
- `POST /pages/{id}/contents` - Upload ảnh
- `DELETE /pages/{id}/contents` - Xóa ảnh
- `POST /pages/{id}/generate_page_access_token` - Tạo page token
- `GET /pages/unread_conv_pages_count` - Unread count

### 2.3 `/api/pancake-official/*` - Official API (pages.fm)

```javascript
export async function handlePancakeOfficial(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\/pancake-official\//, '');
    const targetUrl = `https://pages.fm/api/public_api/v1/${apiPath}${url.search}`;

    const headers = new Headers();
    headers.set('Accept', 'application/json, text/plain, */*');
    headers.set('Origin', 'https://pages.fm');
    headers.set('Referer', 'https://pages.fm/');
    headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...');
    headers.set('sec-ch-ua', '"Google Chrome";v="143", ...');
    // ... other sec-* headers

    const response = await fetchWithRetry(targetUrl, {
        method: request.method,
        headers,
        body: request.method !== 'GET' ? await request.arrayBuffer() : null,
    }, 3, 1000, 15000);

    return proxyResponseWithCors(response);
}
```

**Dùng cho:**
- `GET /pages/{id}/conversations/{convId}/messages` - Lấy tin nhắn
- `POST /pages/{id}/conversations/{convId}/messages` - Gửi tin nhắn
- `POST /pages/{id}/conversations/{convId}/read` - Mark as read
- `POST /pages/{id}/conversations/{convId}/unread` - Mark as unread
- `POST /pages/{id}/conversations/{convId}/tags` - Quản lý tags
- `POST /pages/{id}/upload_contents` - Upload media
- `POST /pages/{id}/page_customers/{custId}/notes` - Thêm ghi chú

### 2.4 `/api/pancake-direct/*` - Direct API (24h Bypass)

```javascript
export async function handlePancakeDirect(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\/pancake-direct\//, '');
    const pageId = url.searchParams.get('page_id');
    const jwtToken = url.searchParams.get('jwt');

    // Remove custom params from forwarding
    const forwardParams = new URLSearchParams(url.search);
    forwardParams.delete('page_id');
    forwardParams.delete('jwt');

    const targetUrl = `https://pancake.vn/api/v1/${apiPath}?${forwardParams}`;

    // Custom Referer based on pageId
    let refererUrl = 'https://pancake.vn/multi_pages';
    if (pageId === '117267091364524') {
        refererUrl = 'https://pancake.vn/NhiJudyHouse.VietNam';
    } else if (pageId === '270136663390370') {
        refererUrl = 'https://pancake.vn/NhiJudyStore';
    }

    // Build headers with custom Referer and JWT cookie
    const headers = buildPancakeHeaders(refererUrl, jwtToken);
    // headers includes: Cookie: jwt={jwtToken}, Referer: {refererUrl}

    const response = await fetchWithRetry(targetUrl, {
        method: request.method,
        headers,
        body: request.method !== 'GET' ? await request.arrayBuffer() : null,
    }, 3, 1000, 15000);

    return proxyResponseWithCors(response);
}
```

**Dùng cho:**
- Gửi tin nhắn ngoài 24h window
- `POST /pages/{id}/check_inbox` - Check inbox status
- `POST /pages/{id}/conversations/{convId}/typing` - Typing indicator
- Fill admin name operations

---

## 3. API Endpoints Complete Reference

### 3.1 Pancake Internal API (`/api/pancake/*`)

| Method | Endpoint | Mô tả | Auth |
|--------|----------|--------|------|
| GET | `/pages` | Danh sách Facebook Pages | `access_token` (JWT) |
| GET | `/pages/unread_conv_pages_count` | Pages + unread count | `access_token` |
| GET | `/conversations?pages[{id}]=0` | Danh sách conversations | `access_token` |
| POST | `/conversations/search?q={query}` | Tìm kiếm conversations | `access_token` + FormData(page_ids) |
| GET | `/conversations/customer/{fbId}?pages[{id}]=0` | Conversations theo FB ID | `access_token` |
| GET | `/pages/{id}/customers/{custId}/inbox_preview` | Preview + conversationIds | `access_token` |
| POST | `/pages/{id}/contents` | Upload ảnh | `access_token` + multipart/form-data |
| DELETE | `/pages/{id}/contents?ids={contentId}` | Xóa ảnh | `access_token` |
| POST | `/pages/{id}/generate_page_access_token` | Tạo page token | `access_token` |

### 3.2 Pancake Official API (`/api/pancake-official/*`)

| Method | Endpoint | Mô tả | Auth |
|--------|----------|--------|------|
| GET | `/pages/{id}/conversations/{convId}/messages` | Lấy tin nhắn | `page_access_token` |
| POST | `/pages/{id}/conversations/{convId}/messages` | Gửi tin nhắn | `page_access_token` |
| POST | `/pages/{id}/conversations/{convId}/read` | Mark as read | `page_access_token` |
| POST | `/pages/{id}/conversations/{convId}/unread` | Mark as unread | `page_access_token` |
| POST | `/pages/{id}/conversations/{convId}/tags` | Add/remove tags | `page_access_token` |
| POST | `/pages/{id}/upload_contents` | Upload media | `page_access_token` |
| POST | `/pages/{id}/page_customers/{custId}/notes` | Thêm ghi chú | `page_access_token` |

### 3.3 Pancake Direct API (`/api/pancake-direct/*`)

| Method | Endpoint | Mô tả | Auth |
|--------|----------|--------|------|
| POST | `/pages/{id}/check_inbox` | Check inbox | JWT Cookie + `access_token` |
| POST | `/pages/{id}/conversations/{convId}/typing` | Typing indicator | JWT Cookie + `access_token` |
| POST | `/pages/{id}/conversations/{convId}/fill_admin_name` | Set admin name | JWT Cookie + `access_token` |

---

## 4. CORS Handling

```javascript
// cloudflare-worker/modules/utils/cors-utils.js

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, ...',
    'Access-Control-Max-Age': '86400'   // 24h preflight cache
};

function proxyResponseWithCors(response) {
    const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: { ...response.headers, ...CORS_HEADERS }
    });
    return newResponse;
}
```

---

## 5. Retry Logic

```javascript
// cloudflare-worker/modules/utils/fetch-utils.js

async function fetchWithRetry(url, options, maxRetries = 3, retryDelay = 1000, timeout = 15000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.status === 429) {
                // Rate limited - exponential backoff
                const delay = retryDelay * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            return response;
        } catch (error) {
            if (attempt === maxRetries - 1) throw error;
            await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt)));
        }
    }
}
```

---

## 6. Header Builder

```javascript
// cloudflare-worker/modules/utils/header-learner.js

function buildPancakeHeaders(refererUrl, jwtToken) {
    const headers = new Headers();
    headers.set('Accept', 'application/json, text/plain, */*');
    headers.set('Accept-Language', 'vi,en-US;q=0.9,en;q=0.8');
    headers.set('Origin', 'https://pancake.vn');
    headers.set('Referer', refererUrl);
    headers.set('User-Agent', 'Mozilla/5.0 ...');
    headers.set('sec-ch-ua', '...');
    headers.set('sec-ch-ua-mobile', '?0');
    headers.set('sec-ch-ua-platform', '"Windows"');
    headers.set('sec-fetch-dest', 'empty');
    headers.set('sec-fetch-mode', 'cors');
    headers.set('sec-fetch-site', 'same-origin');

    // Set JWT as cookie
    if (jwtToken) {
        headers.set('Cookie', `jwt=${jwtToken}`);
    }

    return headers;
}
```

---

## 7. Render.com Proxy (Backup/Alternative)

```javascript
// render.com/routes/pancake.js

const BASE_URL = 'https://pancake.vn/api/v1';

router.all('/*', async (req, res) => {
    const path = req.params[0];
    const targetUrl = `${BASE_URL}/${path}`;

    const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
            ...req.headers,
            host: 'pancake.vn'
        },
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
        timeout: 15000
    });

    const data = await response.json();
    res.status(response.status).json(data);
});
```

---

## 8. Complete Request Flow

```
Browser
  │
  │ fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake/pages?access_token=JWT')
  ▼
Cloudflare Worker (worker.js)
  │
  │ Route matching: /api/pancake/* → handlePancakeGeneric()
  ▼
pancake-handler.js
  │
  │ 1. Extract path: 'pages'
  │ 2. Build target URL: 'https://pancake.vn/api/v1/pages?access_token=JWT'
  │ 3. Set headers (Origin, Referer, User-Agent, etc.)
  │ 4. fetchWithRetry(targetUrl, options, 3, 1000, 15000)
  ▼
Pancake.vn API
  │
  │ Response: { success: true, categorized: { activated: [...] } }
  ▼
Cloudflare Worker
  │
  │ proxyResponseWithCors(response) → Add CORS headers
  ▼
Browser
  │
  │ pancakeDataManager processes response
  ▼
UI Updated
```

---

## 9. Page ID → Referer Mapping

| Page ID | Page Name | Referer URL |
|---------|-----------|-------------|
| `117267091364524` | NhiJudyHouse.VietNam | `https://pancake.vn/NhiJudyHouse.VietNam` |
| `270136663390370` | NhiJudyStore | `https://pancake.vn/NhiJudyStore` |
| (other) | (any) | `https://pancake.vn/multi_pages` |

---

## 10. Environment Configuration

| Component | URL | Purpose |
|-----------|-----|---------|
| Cloudflare Worker | `https://chatomni-proxy.nhijudyshop.workers.dev` | Main API proxy |
| Render Server | `https://n2store-realtime.onrender.com` | Realtime WebSocket proxy |
| Pancake API | `https://pancake.vn/api/v1` | Internal Pancake API |
| Pages.fm API | `https://pages.fm/api/public_api/v1` | Official Pancake API |
| Pancake WebSocket | `wss://pancake.vn/socket/websocket?vsn=2.0.0` | Realtime updates |
| Pancake Avatar CDN | `https://content.pancake.vn/2.1-25/avatars/` | User avatars |
