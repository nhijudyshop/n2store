# Cloudflare Worker — chatomni-proxy

> Deploy URL: `https://chatomni-proxy.nhijudyshop.workers.dev`
> Entry: `cloudflare-worker/worker.js`

---

## Table of Contents

- [Tổng quan kiến trúc](#tổng-quan-kiến-trúc)
- [Execution Flow](#execution-flow)
- [Routes / Endpoints](#routes--endpoints)
  - [Token & Auth](#token--auth)
  - [Image Proxies](#image-proxies)
  - [Facebook](#facebook)
  - [Pancake](#pancake)
  - [TPOS](#tpos)
  - [AI](#ai)
  - [SePay](#sepay)
  - [AutoFB](#autofb)
  - [Proxy → Render Server](#proxy--render-server)
  - [Customer 360 (V2)](#customer-360-v2)
  - [Customer 360 (V1 Legacy)](#customer-360-v1-legacy)
- [External Integrations](#external-integrations)
- [Environment & Secrets](#environment--secrets)
- [Error Handling Patterns](#error-handling-patterns)
- [Key Data Structures](#key-data-structures)
- [Key Files](#key-files)
- [Ghi chú phát triển](#ghi-chú-phát-triển)

---

## Tổng quan kiến trúc

Worker `chatomni-proxy` là **multi-API reverse proxy** chạy trên Cloudflare Edge Network, phục vụ hai mục đích:

1. **CORS bypass**: Browser không gọi trực tiếp TPOS, Pancake, Facebook (do CORS policy) → gọi qua Worker relay.
2. **Header injection / credential management**: Tự động inject headers cho từng upstream (TPOS cần `tposappversion`, Pancake cần `Referer` theo page, v.v.), lưu TPOS credentials server-side.

Worker được refactor từ file monolithic 1743 dòng sang cấu trúc module:

```
cloudflare-worker/
├── worker.js                          # Entry point, router chính (211 dòng)
├── wrangler.jsonc                     # Config (chỉ 5 dòng, không KV/secrets)
└── modules/
    ├── config/
    │   ├── routes.js                  # Route matching: exact → prefix → catch-all
    │   └── endpoints.js               # Re-export từ shared/universal/api-endpoints.js
    ├── handlers/
    │   ├── token-handler.js           # TPOS auth + in-memory cache
    │   ├── facebook-handler.js        # Facebook send + Private Reply fallback (~300 dòng)
    │   ├── tpos-handler.js            # TPOS proxy + OData + Export Excel
    │   ├── pancake-handler.js         # Pancake proxy + WebSocket + Edge Cache
    │   ├── proxy-handler.js           # Forward → Render server (Customer360, SePay, Upload...)
    │   ├── sepay-dashboard-handler.js # Login + scrape SePay HTML
    │   ├── autofb-handler.js          # AutoFB proxy (tất cả forward Render)
    │   ├── ai-handler.js              # DeepSeek AI + OCR
    │   └── image-proxy-handler.js     # Image/avatar proxy + imgbb upload
    └── utils/
        ├── token-cache.js             # In-memory Map (reset khi cold start)
        ├── header-learner.js          # Dynamic header cache, tposappversion tự học
        ├── cors-utils.js              # CORS helpers (re-export từ shared)
        └── fetch-utils.js             # Fetch helpers (re-export từ shared)
```

---

## Execution Flow

| Trigger | Mô tả |
|---------|--------|
| `fetch` event | Mọi HTTP request → `worker.js fetch()` |
| WebSocket Upgrade | Header `Upgrade: websocket` → `handlePancakeWebSocket` |
| Không có cron | `wrangler.jsonc` không khai báo `[triggers]` |

1. **CORS preflight**: `OPTIONS` → `corsPreflightResponse()` ngay lập tức
2. **WebSocket**: Header `Upgrade: websocket` → route `/ws/pancake` → proxy đến `wss://pancake.vn/socket/websocket`
3. **Route matching**: `matchRoute(pathname)` — khớp exact trước, prefix sau, `/api/*` fall-through
4. **Switch dispatch**: `worker.js` dùng `switch(route)` → gọi handler
5. **Error boundary**: `try/catch` bọc toàn bộ → `errorResponse(500)`

---

## Routes / Endpoints

### Token & Auth

| Pattern | Method | Handler | Mô tả |
|---------|--------|---------|--------|
| `/api/token` | POST | `token-handler.js` | Lấy TPOS access_token. Mode JSON `{companyId}` (credentials server-side) hoặc legacy form. Cache in-memory theo username. |

### Image Proxies

| Pattern | Method | Mô tả |
|---------|--------|--------|
| `/api/image-proxy` | GET | Proxy bất kỳ ảnh nào (CORS bypass), cache 24h. `?url=<encoded>` |
| `/api/fb-avatar` | GET | Avatar Facebook qua Pancake → Facebook Graph → SVG mặc định. `?id=<fbid>&page=<pageid>&token=<jwt>` |
| `/api/pancake-avatar` | GET | Avatar từ `content.pancake.vn/2.1-24/avatars/<hash>`. `?hash=<hash>` |
| `/api/imgbb-upload` | POST | Upload base64 ảnh lên imgbb.com. Body: `{image: "<base64>"}` |

### Facebook

| Pattern | Method | Mô tả |
|---------|--------|--------|
| `/api/facebook-send` | POST | Gửi tin nhắn Facebook Graph API. Logic fallback: HUMAN_AGENT → POST_PURCHASE_UPDATE tag → Private Reply (search comments page feed + live videos). Body: `{pageId, psid, message, pageToken, useTag, imageUrls, postId, customerName, commentId, knownCommentIds}` |
| `/api/facebook-graph` | GET | Generic Facebook Graph proxy. `?path=<graph_path>&access_token=<token>` |
| `/api/facebook-graph/livevideo` | GET | Proxy đến TPOS endpoint lấy live videos |

### Pancake

| Pattern | Method | Mô tả |
|---------|--------|--------|
| `/api/pancake-direct/*` | ANY | Gọi `pancake.vn/api/v1/*` với Referer theo `page_id` (NhiJudyHouse/Store/Oi) và JWT cookie. Bypass chính sách 24h. |
| `/api/pancake-official-v2/*` | ANY | Gọi `pages.fm/api/public_api/v2/*`. **Edge Cache 60s** cho `GET pages/{id}/conversations` |
| `/api/pancake-official/*` | ANY | Gọi `pages.fm/api/public_api/v1/*`. Không cache. |
| `/api/pancake/*` | ANY | Gọi `pancake.vn/api/v1/*`. Generic, forward `access_token` → JWT cookie. |
| `/ws/pancake` | WS | Proxy WebSocket đến `wss://pancake.vn/socket/websocket` |

### TPOS

| Pattern | Method | Mô tả |
|---------|--------|--------|
| `/api/Product/ExportProductV2` | POST | Export Excel sản phẩm. Timeout 15s, retry 3 lần. |
| `/api/Product/ExportFileWithStandardPriceV2` | POST | Export Excel giá chuẩn. |
| `/api/SaleOnline_Order/ExportFile` | POST | Export đơn campaign (timeout 30s). |
| `/api/SaleOnline_Order/ExportFileDetail` | POST | Export chi tiết đơn campaign (1 dòng/sản phẩm, timeout 30s). |
| `/tpos/order/:id/lines` | GET | OrderLines theo Order ID. OData: `FastSaleOrder(id)/OrderLines?$expand=Product,...` |
| `/tpos/order-ref/:ref/lines` | GET | OrderLines theo mã tham chiếu (ref). |
| `/api/rest/*` | ANY | Proxy đến `tomato.tpos.vn/rest/*`. |
| `/api/*` (catch-all) | ANY | **TPOS_GENERIC**: GET/DELETE retry 3 lần (15s), POST/PUT/PATCH NO retry (60s, tránh duplicate). |

### AI

| Pattern | Method | Mô tả |
|---------|--------|--------|
| `/api/deepseek` | POST | Proxy `api.deepseek.com/v1/chat/completions`. Timeout 20s. |
| `/api/deepseek-ocr` | POST | OCR qua `alphaxiv--deepseek-ocr-modal-serve.modal.run`. FormData `file`. Timeout 30s. |

### SePay

| Pattern | Method | Mô tả |
|---------|--------|--------|
| `/api/sepay-dashboard` | POST | Login `my.sepay.vn`, scrape HTML: dashboard, invoices, plans. Body: `{email, password}` |
| `/api/sepay/*` | ANY | Forward → `n2store-fallback.onrender.com/api/sepay/*` |

### AutoFB

| Pattern | Method | Mô tả |
|---------|--------|--------|
| `/api/autofb-balance` | POST | Login + captcha → số dư. `{username, password}` |
| `/api/autofb-services` | GET | Danh sách dịch vụ |
| `/api/autofb-api-balance` | GET | Số dư qua API (không captcha) |
| `/api/autofb-order` | POST | Tạo đơn. `{service, link, quantity}` |
| `/api/autofb-order-status` | POST | Kiểm tra trạng thái đơn |
| `/api/autofb-cancel` | POST | Hủy đơn. `{order_id}` |
| `/api/autofb-payment` | POST | QR nạp tiền. `{payment_amount}` |

> Tất cả AutoFB routes forward → `n2store-fallback.onrender.com/api/autofb/*`

### Proxy → Render Server

| Pattern | Method | Destination | Mô tả |
|---------|--------|------------|--------|
| `/api/proxy` | ANY | Generic | Universal proxy. `?url=<target>&headers=<json>` |
| `/api/upload/*` | ANY | `n2store-fallback` | Upload proxy (timeout 30s) |
| `/api/realtime/*` | ANY | `n2store-tpos-pancake` | Forward realtime API |
| `/api/chat/*` | ANY | `n2store-fallback` | Chat API |
| `/api/customers/*` | ANY | `n2store-fallback` | Customers API |

### Customer 360 (V2)

Tất cả forward → `n2store-fallback.onrender.com/api/*`:

| Pattern | Mô tả |
|---------|--------|
| `/api/v2/customers/*` | Customer management |
| `/api/v2/wallets/*` | Wallet operations (alias: `/api/v2/wallet/*`, `/api/v2/pending-withdrawals/*`) |
| `/api/v2/tickets/*` | Ticket system |
| `/api/v2/balance-history/*` | Bank transaction history |
| `/api/v2/analytics/*` | Analytics dashboard |
| `/api/v2/kho-di-cho/*` | Warehouse management |

### Customer 360 (V1 Legacy)

| Pattern | Mô tả |
|---------|--------|
| `/api/customer360/*` | Legacy customer 360 |
| `/api/customer/*` | Legacy customer |
| `/api/wallet/*` | Legacy wallet |
| `/api/ticket*` | Legacy tickets |
| `/api/customer-search*` | Legacy search |
| `/api/transactions/*` | Legacy transactions |
| `/api/balance-history/*` | Legacy balance |

### Routes đặc biệt (forward qua Customer360 proxy)

| Pattern | Mô tả |
|---------|--------|
| `/api/invoice-status/*` | PostgreSQL, thay thế Firestore |
| `/api/invoice-mapping/*` | NJD↔Order mapping |
| `/api/social-orders/*` | Thay thế Firestore cho don-inbox |
| `/api/admin/firebase/*` | Firestore browser |
| `/api/admin/render/*` | Render management |
| `/api/tpos-events/*` | TPOS events broadcast |
| `/api/pancake-accounts/*` | Pancake accounts |

---

## External Integrations

| Service | Base URL | Dùng cho |
|---------|----------|---------|
| TPOS | `https://tomato.tpos.vn` | POS — token, OData, REST, export Excel |
| Pancake | `https://pancake.vn/api/v1` | Inbox / social commerce |
| Pancake Official | `https://pages.fm/api/public_api/v1` & `/v2` | Conversations listing |
| Pancake WebSocket | `wss://pancake.vn/socket/websocket` | Real-time inbox |
| Pancake CDN | `https://content.pancake.vn/2.1-24/avatars/` | Avatar images |
| Facebook Graph | `https://graph.facebook.com/v21.0` | Gửi tin nhắn, private reply, live videos |
| DeepSeek AI | `https://api.deepseek.com/v1/chat/completions` | AI chat |
| DeepSeek OCR | `https://alphaxiv--deepseek-ocr-modal-serve.modal.run` | OCR ảnh |
| imgbb | `https://api.imgbb.com/1/upload` | Upload ảnh fallback |
| SePay | `https://my.sepay.vn` | Scrape dashboard |
| Render — fallback | `https://n2store-fallback.onrender.com` | SePay, upload, chat, customers, Customer360, AutoFB, admin |
| Render — tpos-pancake | `https://n2store-tpos-pancake.onrender.com` | Realtime API |

---

## Environment & Secrets

**Không có `env.*` bindings** — `wrangler.jsonc` chỉ có 5 dòng (name, compatibility_date, main).

Credentials **hardcoded trong code** (cần chuyển sang `wrangler secret put`):

| Location | Secret |
|----------|--------|
| `token-handler.js:42-45` | TPOS credentials (2 company) |
| `image-proxy-handler.js:231` | imgbb API key |
| `pancake-handler.js:43-47` | Page ID → referer mapping |

**Không có KV namespace** — Token cache dùng in-memory `Map` (reset mỗi cold start).

---

## Error Handling Patterns

1. **CORS preflight** — xử lý trước mọi thứ, OPTIONS không bao giờ 404
2. **Global try/catch** — bắt mọi unhandled → `errorResponse(500)`
3. **Per-handler try/catch** — log prefix `[TPOS]`, `[PANCAKE]`, `[FACEBOOK-SEND]`
4. **fetchWithRetry** — retry 3 lần (delay 1s) cho GET/idempotent. **POST KHÔNG retry** (tránh duplicate)
5. **fetchWithTimeout** — POST/PUT/PATCH TPOS dùng timeout 60s
6. **Facebook cascade fallback**: HUMAN_AGENT → POST_PURCHASE_UPDATE → Private Reply (known IDs) → Search page posts/live videos
7. **Image fallback**: Pancake → Facebook Graph → SVG hardcoded
8. **Pancake cache**: Peek JSON body — không cache nếu `error_code` có mặt

---

## Key Data Structures

### Token Cache (`token-cache.js`)
```js
Map<username, { access_token, expiry, expires_in, token_type }>
// Buffer 5 phút trước expiry. Cache key = username hoặc `_default`
```

### Token Request Body (mode mới)
```json
{ "companyId": 1 }
// Worker tự inject credentials, browser không cần biết password
```

### Facebook Send Request
```json
{
  "pageId": "270136663390370",
  "psid": "<user_psid>",
  "message": "text or { text, attachment }",
  "pageToken": "<page_access_token>",
  "useTag": true,
  "imageUrls": ["url1"],
  "postId": "<post_id>",
  "customerName": "Tên khách",
  "commentId": "<comment_id>",
  "knownCommentIds": ["id1", "id2"]
}
```

### Facebook Send Response
```json
{
  "success": true,
  "recipient_id": "...",
  "message_id": "...",
  "used_tag": "HUMAN_AGENT | POST_PURCHASE_UPDATE | PRIVATE_REPLY",
  "method": "send_api | private_reply | private_reply_known"
}
```

### Pancake Edge Cache
- Key: `https://cache.pancake-proxy/api/pancake-official-v2/pages/{id}/conversations?...`
- TTL: 60s, `Cache-Control: public, max-age=60`
- Không cache nếu response có `error_code`

---

## Key Files

| File | Vai trò |
|------|---------|
| `cloudflare-worker/worker.js` | Entry point, router chính (211 dòng) |
| `modules/config/routes.js` | Route matching: exact → prefix → catch-all |
| `modules/config/endpoints.js` | Re-export từ `shared/universal/api-endpoints.js` |
| `modules/handlers/token-handler.js` | TPOS auth + credentials (2 company) |
| `modules/handlers/facebook-handler.js` | Facebook send + Private Reply (~300 dòng) |
| `modules/handlers/tpos-handler.js` | TPOS proxy + OData. POST không retry |
| `modules/handlers/pancake-handler.js` | Pancake proxy + WebSocket + Edge Cache 60s |
| `modules/handlers/proxy-handler.js` | Forward → Render (Customer360, SePay, Upload...) |
| `modules/handlers/sepay-dashboard-handler.js` | Login + scrape HTML |
| `modules/handlers/autofb-handler.js` | AutoFB proxy (tất cả forward Render) |
| `modules/handlers/ai-handler.js` | DeepSeek AI + OCR |
| `modules/handlers/image-proxy-handler.js` | Image/avatar proxy + imgbb |
| `modules/utils/token-cache.js` | In-memory token Map |
| `modules/utils/header-learner.js` | `tposappversion` tự học, cooldown 1h |
| `shared/universal/api-endpoints.js` | Source of truth cho tất cả URLs |

---

## Ghi chú phát triển

- **Pattern chính**: Thin router (`worker.js`) + fat handlers. Không middleware pipeline.
- **`buildTposHeaders()`**: Luôn dùng hàm này cho TPOS (browser headers gây TPOS reject 400).
- **Header learning**: `learnFromResponse()` tự cập nhật `tposappversion` từ response, cooldown 1h.
- **Edge Cache API**: `caches.default` cho Pancake conversations (60s TTL).
- **Hai Render services**: `n2store-fallback` (hầu hết) và `n2store-tpos-pancake` (chỉ realtime).
- **Facebook Graph API version**: `v21.0`.
- **Khi thêm route mới**: thêm vào cả `routes.js` (pattern) lẫn `worker.js` (case + import).
- **POST mutations TPOS**: KHÔNG dùng retry — follow pattern `fetchWithTimeout` 60s.
- **Routes đến Render**: đều qua `handleCustomer360Proxy` — pattern chuẩn cho backend mới.
