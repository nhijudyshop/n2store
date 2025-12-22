# TPOS API Reference

> **Mục đích:** Tài liệu tổng hợp các API request của TPOS, cách lấy token, bypass CORS qua Cloudflare Worker.

---

## 1. Cloudflare Worker Proxy (Bypass CORS)

### Proxy URL

```
https://chatomni-proxy.nhijudyshop.workers.dev
```

**Worker source:** `cloudflare-worker/worker.js`

### Tại sao cần Proxy?

Tất cả TPOS API calls **PHẢI** đi qua Cloudflare Worker proxy để bypass CORS, vì browser không cho phép gọi trực tiếp đến `tomato.tpos.vn`.

### Route Mapping

| Client Request | Proxy Route | Target |
|----------------|-------------|--------|
| `/api/odata/*` | → | `tomato.tpos.vn/odata/*` |
| `/api/token` | → | `tomato.tpos.vn/token` (có cache) |
| `/api/rest/*` | → | `tomato.tpos.vn/rest/*` |
| `/api/pancake/*` | → | `pancake.vn/api/v1/*` |
| `/api/sepay/*` | → | `n2store-fallback.onrender.com/api/sepay/*` |
| `/api/customers/*` | → | `n2store-fallback.onrender.com/api/customers/*` |

### Ví dụ sử dụng

```javascript
// ❌ SAI - Gọi trực tiếp sẽ bị CORS block
fetch('https://tomato.tpos.vn/odata/DeliveryCarrier...')

// ✅ ĐÚNG - Gọi qua proxy
fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/DeliveryCarrier...')
```

---

## 2. Token Management

### Token Manager (`token-manager.js`)

**Mục đích:** Quản lý TPOS Bearer Token với auto-refresh và Firebase sync.

#### Methods

| Method | Mô tả |
|--------|-------|
| `tokenManager.getToken()` | Lấy token (tự động refresh nếu expired) |
| `tokenManager.getAuthHeader()` | Trả về `{ Authorization: 'Bearer xxx' }` |
| `tokenManager.authenticatedFetch(url, options)` | Fetch với auto token |
| `tokenManager.refresh()` | Force refresh token |
| `tokenManager.getTokenInfo()` | Thông tin token hiện tại |

#### Token Flow

```
1. localStorage['bearer_token_data'] → Check expired?
2. Nếu expired → Firebase → Check expired?
3. Nếu expired → Fetch từ TPOS /token API
4. Save → localStorage + Firebase
```

### Lấy Token từ localStorage

```javascript
// Cách lấy token
const bearerData = localStorage.getItem('bearer_token_data');
const { access_token } = JSON.parse(bearerData);
```

**Thứ tự ưu tiên:**
1. `bearer_token_data` (key chính của TPOS)
2. `auth` (fallback)
3. `tpos_token` (fallback)

### Token Refresh API

```
POST https://chatomni-proxy.nhijudyshop.workers.dev/api/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username={username}&password={password}&client_id={client_id}
```

---

## 3. TPOS OData API Endpoints

### Base URL (qua Proxy)

```
https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/
```

### Headers Required

```javascript
{
  "Authorization": "Bearer {access_token}",
  "Accept": "application/json",
  "Content-Type": "application/json;IEEE754Compatible=false;charset=utf-8",
  "tposappversion": "5.11.16.1"
}
```

### Endpoints

#### 3.1. SaleOnline_Order (Đơn hàng)

**GET - Lấy danh sách đơn hàng:**
```
GET /api/odata/SaleOnline_Order?$format=json&$expand=Details,Partner,User,CRMTeam&$orderby=DateCreated desc&$top=100&$count=true
```

**GET - Lấy chi tiết 1 đơn hàng:**
```
GET /api/odata/SaleOnline_Order({orderId})?$expand=Details,Partner,User,CRMTeam
```

**PUT - Cập nhật đơn hàng:**
```
PUT /api/odata/SaleOnline_Order({orderId})
Content-Type: application/json

{
  "Id": "{orderId}",
  "Name": "Tên khách hàng",
  "Phone": "0901234567",
  "Address": "Địa chỉ",
  "Note": "Ghi chú",
  "Details": [...],
  ...
}
```

#### 3.2. ApplicationUser (Danh sách User)

```
GET /api/odata/ApplicationUser?$format=json&$top=20&$orderby=Name&$filter=Active+eq+true&$count=true
```

**Response:**
```javascript
{
  "@odata.context": "http://tomato.tpos.vn/odata/$metadata#ApplicationUser",
  "@odata.count": 21,
  "value": [
    {
      "Id": "ae5c70a1-898c-4e9f-b248-acc10b7036bc",
      "Name": "nvkt",
      "UserName": "nvkt",
      "CompanyId": 1,
      "CompanyName": "NJD Live",
      "Active": true,
      "Roles": [...]
    }
  ]
}
```

#### 3.3. DeliveryCarrier (Đối tác giao hàng)

```
GET /api/odata/DeliveryCarrier?$format=json&$orderby=Name&$filter=Active+eq+true
```

**Cache:** 24h trong `localStorage['tpos_delivery_carriers']`

#### 3.4. Product (Sản phẩm)

**Lấy chi tiết 1 sản phẩm:**
```
GET /api/odata/Product({productId})?$expand=AttributeValues,Prices
```

**Tìm kiếm sản phẩm:**
```
GET /api/odata/Product?$filter=contains(Name,'{query}') or contains(Code,'{query}')&$top=20
```

#### 3.5. CRMTeam/GetAllFacebook (Danh sách Facebook Pages)

```
GET /api/odata/CRMTeam/ODataService.GetAllFacebook?$expand=Childs
```

**Response:**
```javascript
{
  "value": [
    {
      "Id": 10043,              // Parent user ID
      "Facebook_TypeId": "User",
      "Childs": [
        {
          "Id": 10037,                           // companyId cho Live Comments API
          "Name": "Nhi Judy House",
          "Facebook_PageId": "117267091364524",  // pageId
          "Facebook_TypeId": "Page"
        }
      ]
    }
  ]
}
```

**Mapping pageId → companyId:**
| Page Name | companyId (Childs[].Id) | pageId (Facebook_PageId) |
|-----------|---------------------------|----------------------------|
| Nhi Judy House | `10037` | `117267091364524` |
| NHI JUDY Style | `10030` | `112678138086607` |
| NhiJudy Store | `2` | `270136663390370` |

---

## 4. TPOS REST API Endpoints

### Base URL (qua Proxy)

```
https://chatomni-proxy.nhijudyshop.workers.dev/api/rest/
```

### 4.1. Live Comments by User

**Endpoint:**
```
GET /api/rest/v2.0/facebookpost/{objectId}/commentsbyuser?userId={userId}
```

| Param | Mô tả | Ví dụ |
|-------|-------|-------|
| `objectId` | Format: `{companyId}_{pageId}_{postId}` | `10037_117267091364524_884252610662484` |
| `userId` | Facebook User ID của khách hàng | `7347746221993438` |

**Response:**
```javascript
{
  "ObjectIds": ["117267091364524_2089353831915406", ...],
  "LiveCampaignId": "cebd3bf9-50a3-594e-bbaf-3a1e3294eb84",
  "Items": [
    {
      "Id": "6940fde2ed7c842f24f64659",
      "ObjectId": "117267091364524_2274763789683756",
      "Message": "áo xám fee sai ak",
      "UserId": "7347746221993438",
      "Status": 30,  // 30 = unread, 50 = read
      "IsOwner": false,
      "CreatedTime": "2025-12-16T06:36:24.04Z",
      "Data": {
        "id": "2274763789683756_1599110954452900",
        "from": { "id": "7347746221993438", "name": "Pé Phúc" }
      }
    }
  ]
}
```

**Lưu ý:**
- `companyId` lấy từ `CRMTeam/GetAllFacebook` API
- `userId` là Facebook User ID, không phải PSID

---

## 5. Code Examples

### 5.1. Authenticated Fetch

```javascript
// Sử dụng tokenManager
const response = await window.tokenManager.authenticatedFetch(
  'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order',
  { method: 'GET' }
);
const data = await response.json();
```

### 5.2. Manual Token Header

```javascript
const authHeader = await window.tokenManager.getAuthHeader();

const response = await fetch(url, {
  method: 'GET',
  headers: {
    ...authHeader,
    'Accept': 'application/json',
    'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
    'tposappversion': '5.11.16.1'
  }
});
```

### 5.3. Sử dụng API_CONFIG

```javascript
// Trong api-config.js
buildUrl.tposOData('SaleOnline_Order', { 
  $expand: 'Details,Partner', 
  $top: 100 
});
// → https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order?$expand=Details,Partner&$top=100
```

### 5.4. Fetch Live Comments

```javascript
async function fetchLiveCommentsByUser(pageId, postId, userId) {
  // Lấy companyId từ cache
  const cached = localStorage.getItem('pageCompanyIdMapping');
  const mapping = cached ? JSON.parse(cached) : {};
  const companyId = mapping[pageId];
  
  if (!companyId) {
    throw new Error(`Cannot find companyId for pageId: ${pageId}`);
  }
  
  const objectId = `${companyId}_${pageId}_${postId}`;
  const url = `${window.API_CONFIG.WORKER_URL}/api/rest/v2.0/facebookpost/${objectId}/commentsbyuser?userId=${userId}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': '*/*',
      'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
      ...await window.tokenManager.getAuthHeader(),
      'tposappversion': '5.11.16.1'
    }
  });
  
  const data = await response.json();
  return data.Items || [];
}
```

---

## 6. Cache Keys (localStorage)

| Key | TTL | Mô tả |
|-----|-----|-------|
| `bearer_token_data` | Có expiry trong token | TPOS Bearer Token |
| `tpos_delivery_carriers` | 24h | Danh sách đối tác giao hàng |
| `orders_phone_debt_cache` | 5 phút | Công nợ theo SĐT |
| `orders_phone_qr_cache` | Không hết hạn | QR code theo SĐT |
| `pageCompanyIdMapping` | Manual refresh | Mapping pageId → companyId |

---

## 7. Error Handling

### Common Errors

| Error | Mô tả | Giải pháp |
|-------|-------|-----------|
| `401 Unauthorized` | Token expired | Gọi `tokenManager.refresh()` |
| `403 Forbidden` | Không có quyền | Kiểm tra role user |
| `404 Not Found` | Resource không tồn tại | Kiểm tra ID |
| `CORS Error` | Gọi trực tiếp không qua proxy | Sử dụng Cloudflare Worker proxy |

### Token Refresh Flow

```javascript
try {
  const response = await fetch(url, { headers: authHeader });
  if (response.status === 401) {
    // Token expired, refresh
    await window.tokenManager.refresh();
    // Retry request
    return fetch(url, { headers: await window.tokenManager.getAuthHeader() });
  }
} catch (error) {
  console.error('API Error:', error);
}
```

---

*Cập nhật lần cuối: 2025-12-22*
