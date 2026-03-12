# Cloudflare Worker API - chatomni-proxy

## Thông tin chung

| Thông tin | Giá trị |
|-----------|---------|
| **Worker URL** | `https://chatomni-proxy.nhijudyshop.workers.dev` |
| **Account ID** | `27170a8625bb696ad1c253e6b221f59e` |
| **Source Code** | `/cloudflare-worker/worker.js` |

## Mục đích

Worker này hoạt động như một **CORS proxy** để bypass các hạn chế cross-origin khi gọi API từ browser đến:
- TPOS (`tomato.tpos.vn`)
- Pancake (`pancake.vn`)
- DeepSeek AI
- Facebook Graph API

---

## API Endpoints

### 1. TPOS Token

**Endpoint:** `POST /api/token`

Lấy access token từ TPOS với caching (tránh gọi lại nếu token còn hạn).

```javascript
const response = await fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=password&username=nvkt&password=xxx&client_id=tmtWebApp'
});
const { access_token, expires_in } = await response.json();
```

---

### 2. TPOS Order Lines (by ID)

**Endpoint:** `GET /tpos/order/{orderId}/lines`

Lấy chi tiết sản phẩm trong đơn hàng theo **Order ID số** (ví dụ: 409233).

```javascript
const response = await fetch('https://chatomni-proxy.nhijudyshop.workers.dev/tpos/order/409233/lines');
const { success, data } = await response.json();
// data = array of OrderLine objects
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "Id": 771383,
            "OrderId": 409233,
            "ProductNameGet": "[N3158] 3012 A78 SET QL NƠ CHỮ CELINE 5C",
            "ProductUOMQty": 1,
            "PriceUnit": 250000,
            "PriceTotal": 250000,
            "ProductUOMName": "Cái",
            "ProductImageUrl": "https://img1.tpos.vn/..."
        }
    ]
}
```

---

### 3. TPOS Order Lines (by Reference) ⭐ NEW

**Endpoint:** `GET /tpos/order-ref/{encodedReference}/lines`

Lấy chi tiết sản phẩm trong đơn hàng theo **mã tham chiếu** (ví dụ: `NJD/2026/42586`).

> **Lưu ý:** Mã tham chiếu phải được URL encode. Ký tự `/` thành `%2F`.

```javascript
const orderRef = 'NJD/2026/42586';
const encodedRef = encodeURIComponent(orderRef);
const response = await fetch(`https://chatomni-proxy.nhijudyshop.workers.dev/tpos/order-ref/${encodedRef}/lines`);
const { success, orderId, reference, data } = await response.json();
```

**Response:**
```json
{
    "success": true,
    "orderId": 409185,
    "reference": "NJD/2026/42586",
    "data": [
        {
            "Id": 771275,
            "OrderId": 409185,
            "ProductNameGet": "[LQL80] A5 HỘP GEN ĐEN B33 SIZE 3",
            "ProductUOMQty": 1,
            "PriceUnit": 230000,
            "PriceTotal": 230000
        }
    ]
}
```

**Cách hoạt động:**
1. Gọi `ODataService.GetView` với filter `contains(Number, 'NJD/2026/42586')`
2. Lấy `Id` từ kết quả
3. Gọi `/odata/FastSaleOrder({Id})/OrderLines` để lấy chi tiết

---

### 4. Image Proxy

**Endpoint:** `GET /api/image-proxy?url={encodedUrl}`

Proxy hình ảnh với CORS headers.

```javascript
const imageUrl = 'https://example.com/image.jpg';
const proxyUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
```

---

### 5. Facebook Avatar Proxy

**Endpoint:** `GET /api/fb-avatar?id={facebookUserId}&page={pageId}`

Lấy avatar Facebook user qua Pancake API.

```javascript
const avatarUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/fb-avatar?id=123456789&page=270136663390370';
```

---

### 6. Pancake Avatar Proxy

**Endpoint:** `GET /api/pancake-avatar?hash={avatarHash}`

Proxy avatar từ Pancake content CDN.

---

### 7. Generic Proxy

**Endpoint:** `GET/POST /api/proxy?url={encodedUrl}`

Proxy bất kỳ request nào với CORS headers.

```javascript
const targetUrl = 'https://tomato.tpos.vn/odata/TinhThanhPho';
const response = await fetch(`https://chatomni-proxy.nhijudyshop.workers.dev/api/proxy?url=${encodeURIComponent(targetUrl)}`);
```

---

### 8. Pancake Direct API

**Endpoint:** `GET/POST /api/pancake-direct/{apiPath}?page_id={pageId}&jwt={jwtToken}`

Gọi Pancake internal API với cookie JWT.

---

### 9. Pancake Official API (pages.fm)

**Endpoint:** `GET/POST /api/pancake-official/{apiPath}?page_access_token={token}`

Gọi Pancake Public API qua pages.fm.

---

### 10. DeepSeek AI Proxy

**Endpoint:** `POST /api/deepseek`

Proxy đến DeepSeek chat completions API.

```javascript
const response = await fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/deepseek', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-xxx'
    },
    body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hello' }]
    })
});
```

---

### 11. DeepSeek OCR Proxy

**Endpoint:** `POST /api/deepseek-ocr`

Proxy đến alphaXiv DeepSeek-OCR.

```javascript
const formData = new FormData();
formData.append('file', imageFile);

const response = await fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/deepseek-ocr', {
    method: 'POST',
    body: formData
});
```

---

### 12. Facebook Send Message

**Endpoint:** `POST /api/facebook-send`

Gửi tin nhắn Facebook với tag POST_PURCHASE_UPDATE (bypass 24h policy).

```javascript
const response = await fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/facebook-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        pageId: '270136663390370',
        psid: '123456789',
        message: 'Hello!',
        pageToken: 'EAAxxxx',
        useTag: true
    })
});
```

---

### 13. TPOS REST API v2.0

**Endpoint:** `GET/POST /api/rest/{restPath}`

Proxy đến TPOS REST API (live comments, etc.)

---

## CORS Headers

Tất cả responses đều có headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Accept, tposappversion, x-tpos-lang
```

---

## Token Caching

Worker tự động cache TPOS access token trong memory với buffer 5 phút trước khi hết hạn. Giảm số lần gọi `/token` API.

---

## Deploy Worker

### Qua Cloudflare API

```bash
cd cloudflare-worker

curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/chatomni-proxy" \
  -H "X-Auth-Email: your@email.com" \
  -H "X-Auth-Key: your-global-api-key" \
  -F "worker.js=@worker.js;type=application/javascript+module" \
  -F 'metadata={"main_module":"worker.js"};type=application/json'
```

### Qua Wrangler CLI

```bash
cd /path/to/n2store
npx wrangler deploy
```

> **Lưu ý:** File `wrangler.jsonc` ở root project đã được cấu hình.

---

## Cấu hình

**File:** `/wrangler.jsonc`
```json
{
  "name": "chatomni-proxy",
  "compatibility_date": "2025-11-27",
  "main": "cloudflare-worker/worker.js"
}
```

---

## Sử dụng trong Frontend

**File:** `/hanghoan/banhang.js`

```javascript
const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// Fetch order details by reference
async function expandOrderDetails(row, orderRef) {
    const encodedRef = encodeURIComponent(orderRef);
    const response = await fetch(`${WORKER_URL}/tpos/order-ref/${encodedRef}/lines`);
    const result = await response.json();
    
    if (result.success) {
        renderOrderDetails(result.data);
    }
}
```

---

## Troubleshooting

### CORS Error
- Kiểm tra Worker đã được deploy chưa
- Kiểm tra route có tồn tại không (invalid route trả về "Invalid API route")

### Order Not Found
- Đảm bảo mã tham chiếu (Number) tồn tại trong TPOS
- Đơn hàng với ngày 01/01/1970 là dữ liệu test, không có trong TPOS

### Token Error
- Token cache có thể hết hạn, worker sẽ tự động refresh
- Kiểm tra credentials trong worker code

---

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-01-04 | Thêm route `/tpos/order-ref/{ref}/lines` để tìm order theo mã tham chiếu |
| 2025-11-27 | Tạo worker với các routes cơ bản |
