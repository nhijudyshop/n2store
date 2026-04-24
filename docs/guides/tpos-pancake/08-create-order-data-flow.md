# Data flow khi bấm nút "Tạo đơn" (giỏ hàng tím)

Tài liệu này truy vết đầy đủ từng chặng dữ liệu khi user bấm nút "Tạo đơn web" trên một comment.

---

## ⚠ Hiện trạng quan trọng

Nút "Tạo đơn" **KHÔNG đổ dữ liệu vào module `orders-report/`**. Nó ghi thẳng vào PostgreSQL bảng `native_orders` qua Render backend. Module `orders-report/tab1-orders.html` hiện đang đọc từ **TPOS `SaleOnline_Order`** qua OData, không đọc `native_orders`.

Muốn đơn web hiện ở order-report, xem [mục 7 — Đưa sang orders-report](#7--đưa-sang-orders-report) ở cuối file.

---

## 1. Chặng 1 — Context thu thập từ UI

File: [tpos-pancake/js/tpos/tpos-comment-list.js:926-971](../../../tpos-pancake/js/tpos/tpos-comment-list.js#L926-L971), hàm `createOrder(fromId, fromName, commentId)`.

Thu thập từ:

| Field | Nguồn | Ghi chú |
|---|---|---|
| `fromId` | arg từ onclick | Facebook ASUID của người comment |
| `fromName` | arg từ onclick | escape-HTML rồi truyền |
| `commentId` | arg từ onclick | id của comment Facebook |
| `comment` | `state.comments.find(...)` | lookup lại để lấy `_pageObj`, `_campaignId`, `message` |
| `pageObj` | `comment._pageObj || state.selectedPage` | object page TPOS |
| `crmTeamId` | `pageObj.Id` | int — Id CRM team bên TPOS |
| `fbPageId` | `pageObj.Facebook_PageId` | string — page Facebook ID thực |
| `postId` | `liveCampaign.Facebook_LiveId` | full post id `{pageId}_{postId}` |
| `message` | `comment.message` | raw text của comment |
| `phone` | input DOM `#phone-${fromId}` | user có thể đã chỉnh trước khi bấm |
| `address` | input DOM `#addr-${fromId}` | tương tự |
| `createdBy` | `AuthManager.getCurrentUser().uid` (fallback email) | null nếu chưa login |
| `createdByName` | `AuthManager.getCurrentUser().displayName` | null nếu chưa login |

---

## 2. Chặng 2 — HTTP request (Client → CF Worker)

Gọi qua [NativeOrdersApi.createFromComment()](../../../tpos-pancake/js/tpos/tpos-native-orders-api.js) → fetch:

```http
POST https://chatomni-proxy.nhijudyshop.workers.dev/api/native-orders/from-comment
Content-Type: application/json
Accept: application/json
```

### Body JSON (SHAPE CHÍNH XÁC)

```jsonc
{
  "fbUserId":      "6123456789012345",          // REQUIRED — Facebook ASUID
  "fbUserName":    "Nguyễn Văn A",
  "fbPageId":      "111267091364524",
  "fbPostId":      "111267091364524_987654321",
  "fbCommentId":   "111267091364524_1234567",   // UNIQUE → idempotency key
  "crmTeamId":     42,                          // int
  "message":       "Shop ơi lấy áo đen size M",
  "phone":         "0909000000",
  "address":       "106/47 Lạc Long Quân, Q.11, TP.HCM",
  "createdBy":     "uid_abc123",
  "createdByName": "Thu Nhi"
}
```

**Field REQUIRED duy nhất**: `fbUserId`. Mọi field còn lại optional — server xử lý null an toàn.

**Không có auth header**: route `/api/native-orders/*` là public endpoint (không cần Bearer token). Dùng CORS chung của CF Worker.

### Idempotency
Nếu `fbCommentId` đã tạo order từ trước → server **không insert**, trả lại order cũ + `idempotent: true` trong response. Xem mục 4.

---

## 3. Chặng 3 — CF Worker → Render

CF Worker match pathname `/api/native-orders/*` → route key `NATIVE_ORDERS` → handler `handleCustomer360Proxy` → forward về Render `https://n2store-fallback.onrender.com`. Không transform body.

Tham chiếu:
- [cloudflare-worker/modules/config/routes.js](../../../cloudflare-worker/modules/config/routes.js) — pattern `NATIVE_ORDERS`
- [cloudflare-worker/worker.js](../../../cloudflare-worker/worker.js) — case dispatch

---

## 4. Chặng 4 — Render backend xử lý

File: [render.com/routes/native-orders.js:166-232](../../../render.com/routes/native-orders.js#L166-L232).

### 4a. Validate
```javascript
if (!b.fbUserId) return res.status(400).json({ error: 'fbUserId required' });
```

### 4b. Idempotency check
```sql
SELECT * FROM native_orders WHERE fb_comment_id = $1 LIMIT 1;
```
Nếu tìm thấy → return `{ success:true, order:<row>, idempotent:true }` và **dừng**.

### 4c. Sinh code + sessionIndex

```javascript
// code = NW-<YYYYMMDD theo timezone VN>-<0001..>
const now = new Date();
const vn = new Date(now.getTime() + 7*3600*1000);
const datePart = `${vn.getUTCFullYear()}${pad(vn.getUTCMonth()+1,2)}${pad(vn.getUTCDate(),2)}`;
// SELECT code ... LIKE 'NW-20260424-%' ORDER BY code DESC LIMIT 1 → seq = lastSeq+1

// sessionIndex = (SELECT COUNT(*) FROM native_orders WHERE fb_user_id = $1) + 1
```

### 4d. Insert

Server set thêm (không lấy từ client):
- `source = 'NATIVE_WEB'` (hardcoded)
- `products = '[]'::jsonb`
- `total_quantity = 0`, `total_amount = 0`
- `status = 'draft'`
- `tags = '[]'::jsonb`
- `created_at = Date.now()` (BIGINT, ms)
- `updated_at = created_at`

`note` = `req.body.note || req.body.message.slice(0, 500) || null`.

---

## 5. Chặng 5 — Row trong PostgreSQL

Schema full: [render.com/migrations/065_native_orders_schema.sql](../../../render.com/migrations/065_native_orders_schema.sql).

```sql
CREATE TABLE native_orders (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(40)  UNIQUE NOT NULL,       -- NW-YYYYMMDD-NNNN
    session_index   INTEGER,
    source          VARCHAR(30)  NOT NULL DEFAULT 'NATIVE_WEB',

    -- Thông tin khách
    customer_name   VARCHAR(255),
    phone           VARCHAR(40),
    address         TEXT,
    note            TEXT,

    -- Facebook context (trace được về comment nguồn)
    fb_user_id      VARCHAR(100),
    fb_user_name    VARCHAR(255),
    fb_page_id      VARCHAR(100),
    fb_post_id      VARCHAR(100),
    fb_comment_id   VARCHAR(100),   -- UNIQUE when not null
    crm_team_id     INTEGER,

    -- Hàng hoá (chưa dùng ở phase tạo đơn, chừa cho phase 'chốt đơn')
    products        JSONB  DEFAULT '[]'::jsonb,
    total_quantity  INTEGER DEFAULT 0,
    total_amount    NUMERIC(14,2) DEFAULT 0,

    -- Trạng thái
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
    tags            JSONB  DEFAULT '[]'::jsonb,

    -- Audit
    created_by      VARCHAR(100),
    created_by_name VARCHAR(255),
    created_at      BIGINT NOT NULL,   -- epoch ms
    updated_at      BIGINT NOT NULL
);
```

Ví dụ row sau insert thành công:

```jsonc
{
  "id":              1234,
  "code":            "NW-20260424-0001",
  "session_index":   1,
  "source":          "NATIVE_WEB",

  "customer_name":   "Nguyễn Văn A",
  "phone":           "0909000000",
  "address":         "106/47 Lạc Long Quân, Q.11, TP.HCM",
  "note":            "Shop ơi lấy áo đen size M",

  "fb_user_id":      "6123456789012345",
  "fb_user_name":    "Nguyễn Văn A",
  "fb_page_id":      "111267091364524",
  "fb_post_id":      "111267091364524_987654321",
  "fb_comment_id":   "111267091364524_1234567",
  "crm_team_id":     42,

  "products":        [],
  "total_quantity":  0,
  "total_amount":    "0.00",      // NUMERIC → string qua node-pg

  "status":          "draft",
  "tags":            [],

  "created_by":      "uid_abc123",
  "created_by_name": "Thu Nhi",
  "created_at":      1777014910201,
  "updated_at":      1777014910201
}
```

### Index
- `UNIQUE(code)` — chống trùng mã
- `idx_native_orders_created_at` DESC — list theo time
- `idx_native_orders_fb_user_id` — lookup khách
- `idx_native_orders_fb_post_id` — lookup theo post
- `idx_native_orders_status` — filter draft/confirmed/...
- `idx_native_orders_phone` — tra SĐT
- `uq_native_orders_comment` UNIQUE(`fb_comment_id`) WHERE NOT NULL — **idempotency key**

---

## 6. Chặng 6 — Response về Client

File: [render.com/routes/native-orders.js:78-108](../../../render.com/routes/native-orders.js#L78-L108), hàm `mapRowToOrder()`.

Server map snake_case DB → camelCase API:

```jsonc
{
  "success": true,
  "order": {
    "id":             1234,
    "code":           "NW-20260424-0001",
    "sessionIndex":   1,
    "source":         "NATIVE_WEB",
    "customerName":   "Nguyễn Văn A",
    "phone":          "0909000000",
    "address":        "106/47 Lạc Long Quân, Q.11, TP.HCM",
    "note":           "Shop ơi lấy áo đen size M",
    "fbUserId":       "6123456789012345",
    "fbUserName":     "Nguyễn Văn A",
    "fbPageId":       "111267091364524",
    "fbPostId":       "111267091364524_987654321",
    "fbCommentId":    "111267091364524_1234567",
    "crmTeamId":      42,
    "products":       [],
    "totalQuantity":  0,
    "totalAmount":    0,               // Number(row.total_amount || 0)
    "status":         "draft",
    "tags":           [],
    "createdBy":      "uid_abc123",
    "createdByName":  "Thu Nhi",
    "createdAt":      1777014910201,
    "updatedAt":      1777014910201
  },
  "idempotent": false                  // true nếu là lần bấm lặp cho cùng fbCommentId
}
```

### Error cases

| HTTP | Body | Khi nào |
|---|---|---|
| 400 | `{"error":"fbUserId required"}` | Client quên `fbUserId` |
| 500 | `{"error":"DB unavailable"}` | Render mất kết nối Postgres |
| 500 | `{"error":"<pg error msg>"}` | Insert fail (UNIQUE violation rất hiếm vì đã check idempotent) |

---

## 7. Chặng 7 — Client state + UI update

File: [tpos-pancake/js/tpos/tpos-comment-list.js:973-1017](../../../tpos-pancake/js/tpos/tpos-comment-list.js#L973-L1017).

```javascript
// 1. Ghi vào sessionIndexMap (in-memory, không persist)
state.sessionIndexMap.set(fromId, {
    index:  order.sessionIndex,   // 1
    code:   order.code,            // "NW-20260424-0001"
    source: "NATIVE_WEB"           // để render biết là đơn web, không phải TPOS
});

// 2. Đổi nút thành icon package-open tím
btn.outerHTML = `<span title="Đơn web: NW-20260424-0001 (STT 1)" style="color:#7c3aed;padding:4px;">
    <i data-lucide="package-open" style="width:14px;height:14px;"></i>
</span>`;

// 3. Chèn badge tím bên cạnh tên khách
header.insertAdjacentHTML('beforeend',
    `<span class="order-code-badge" title="Đơn web NW-20260424-0001"
           style="background:#ede9fe;color:#6d28d9;font-size:10px;
                  padding:1px 5px;border-radius:3px;font-weight:600;">
       NW-20260424-0001
     </span>`);

// 4. Toast notification
window.notificationManager?.show(
    'Đã tạo đơn web NW-20260424-0001 (STT: 1)',
    'success'
);
```

**Không ghi localStorage, không emit event** tới orders-report. Refresh F5 → `sessionIndexMap` sẽ được hydrate lại qua `TposColumnManager._loadNativeOrders(postId)` gọi `GET /api/native-orders/load?fbPostId=<postId>`.

---

## 8 — Đưa sang `orders-report/` (chưa implement)

Hiện tại không có đường data tự động. Muốn đơn web hiện ở `orders-report/tab1-orders.html`, chọn **1 trong 3** cách:

### Option A — Tab riêng "Đơn Web"
- Thêm tab ở `tab1-orders.html`, load từ `GET /api/native-orders/load?page=1&limit=500`.
- Render bằng cấu trúc row đã map (camelCase) ở mục 6.
- Ưu: cách ly, không đụng logic TPOS realtime.
- Nhược: user phải đổi tab để thấy.

### Option B — Merge vào Tab 1 hiện có
- Trong `orders-report/js/tab1/tab1-tpos-realtime.js`, sau mỗi `fetchOrders()` TPOS, fetch thêm `GET /api/native-orders/load?fbPostId=<currentPostId>` và concat vào mảng hiển thị với cờ `_source='NATIVE_WEB'`.
- Badge tím khác màu để phân biệt với đơn TPOS xanh.
- Cần xử lý sort: dùng `created_at` (epoch ms) chung để sort cross-source.

### Option C — Dual-write sang TPOS
- Backend sau khi INSERT `native_orders` tự gọi TPOS OData `POST /api/odata/SaleOnline_Order` để duplicate sang TPOS.
- Orders-report không cần sửa gì vì vẫn đọc TPOS như cũ.
- **Phản mục đích ban đầu** (user yêu cầu "không dùng tpos nữa"). Chỉ nên dùng nếu muốn migrate dần.

Chọn option nào → báo lại để tôi implement phase riêng.

---

## Tóm tắt sơ đồ

```
[Nút 🛒 tím]
     │ onclick
     ▼
TposCommentList.createOrder(fromId, fromName, commentId)
     │ collect DOM inputs + state.comments + AuthManager
     ▼
NativeOrdersApi.createFromComment({ fbUserId, fbCommentId, ... })
     │ POST /api/native-orders/from-comment
     ▼
CF Worker  (chatomni-proxy)   — route NATIVE_ORDERS → handleCustomer360Proxy
     │ forward
     ▼
Render     (n2store-fallback) — routes/native-orders.js /from-comment
     │ validate → idempotent check → generate code+STT → INSERT
     ▼
PostgreSQL  (table native_orders)
     │ row: { code: "NW-20260424-0001", source: "NATIVE_WEB", ... }
     ▼
Response  { success, order, idempotent }
     │
     ▼
Client
  ├─ state.sessionIndexMap.set(fromId, { index, code, source:"NATIVE_WEB" })
  ├─ Đổi nút → <span> icon "package-open" tím
  ├─ Chèn badge tím cạnh tên khách
  └─ Toast "Đã tạo đơn web NW-..."
```

`orders-report/` không nằm trong sơ đồ này — xem mục 8 để wire thêm.
