# N2Store Pancake WebSocket - Hướng dẫn chi tiết

> Tài liệu về 2 hệ thống realtime nhận tin nhắn Facebook Page qua Pancake Phoenix WebSocket:
> 1. **Render Server** (`tpos-pancake`) — server-side, always-on listener
> 2. **Inbox Client** (`inbox/`) — browser-side, qua Cloudflare Worker proxy

## Mục lục

### Part A: Render Server (tpos-pancake)
1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Luồng hoạt động](#3-luồng-hoạt-động)
4. [Phoenix WebSocket Protocol](#4-phoenix-websocket-protocol)
5. [Xác thực & Kết nối](#5-xác-thực--kết-nối)
6. [Các loại Event](#6-các-loại-event)
7. [Multi-Account (Firebase)](#7-multi-account-firebase)
8. [REST API Endpoints](#8-rest-api-endpoints)
9. [In-Memory Event Store](#9-in-memory-event-store)
10. [Cấu hình & Triển khai](#10-cấu-hình--triển-khai)
11. [Xử lý lỗi & Reconnect](#11-xử-lý-lỗi--reconnect)
12. [Lưu ý quan trọng](#12-lưu-ý-quan-trọng)

### Part B: Inbox Client (browser-side)
13. [Inbox Realtime — Tổng quan](#13-inbox-realtime--tổng-quan)
14. [Cloudflare Worker WebSocket Proxy](#14-cloudflare-worker-websocket-proxy)
15. [PancakePhoenixSocket Class](#15-pancakephoenixsocket-class)
16. [Luồng kết nối Inbox](#16-luồng-kết-nối-inbox)
17. [Event Handling trong Inbox](#17-event-handling-trong-inbox)
18. [Polling Fallback](#18-polling-fallback)
19. [So sánh 2 hệ thống](#19-so-sánh-2-hệ-thống)

---

# Part A: Render Server (tpos-pancake)

---

## 1. Tổng quan

### Vấn đề
- **Facebook Webhook** yêu cầu xác minh doanh nghiệp → không khả thi cho cá nhân/shop nhỏ
- **Pancake Webhook** yêu cầu mua slot → tốn phí và giới hạn

### Giải pháp
Kết nối trực tiếp tới **Pancake Phoenix WebSocket** (`wss://pancake.vn/socket/websocket`) — cùng cơ chế mà web app pancake.vn sử dụng. Server đóng vai trò như một "browser" luôn online, nhận mọi sự kiện tin nhắn, cập nhật hội thoại, thay đổi tag... trong thời gian thực.

### Tại sao dùng được?
Pancake sử dụng **Phoenix Framework** (Elixir) với WebSocket để push realtime events tới trình duyệt. Server của chúng ta mô phỏng đúng hành vi của trình duyệt: đăng nhập bằng JWT token, join channels, nhận events — không cần bất kỳ webhook nào.

---

## 2. Kiến trúc hệ thống

```
┌──────────────────────────────────────────────────────────┐
│                    Firebase Firestore                     │
│        Collection: pancake_tokens/accounts                │
│        (JWT tokens + userId cho mỗi account)              │
└────────────────────────┬─────────────────────────────────┘
                         │ Load tokens on startup
                         ▼
┌──────────────────────────────────────────────────────────┐
│           tpos-pancake server (Render.com)                │
│                                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │          Multi-Client Manager                    │     │
│  │                                                  │     │
│  │  ┌──────────────────┐  ┌──────────────────┐     │     │
│  │  │ WS Client: Acc 1 │  │ WS Client: Acc 2 │ ... │     │
│  │  │ userId: abc123   │  │ userId: def456   │     │     │
│  │  │ pages: [p1,p2]   │  │ pages: [p3]      │     │     │
│  │  └────────┬─────────┘  └────────┬─────────┘     │     │
│  └───────────┼──────────────────────┼───────────────┘     │
│              │                      │                     │
│  ┌───────────┴──────────────────────┴───────────────┐     │
│  │              In-Memory Event Store                │     │
│  │         (last 1000 events, auto-cleanup)          │     │
│  └──────────────────────────────────────────────────┘     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐     │
│  │              REST API (Express.js)                │     │
│  │  /ping  /api/status  /api/events  /api/reload     │     │
│  └──────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
          │                              ▲
          │ wss://pancake.vn/socket/     │ REST queries
          │ websocket?vsn=2.0.0          │
          ▼                              │
┌─────────────────────┐          ┌───────────────┐
│  Pancake WebSocket  │          │  Frontend /   │
│  Server (Phoenix)   │          │  Other services│
└─────────────────────┘          └───────────────┘
```

---

## 3. Luồng hoạt động

### Startup Flow

```
1. Server khởi động (Express listen on PORT)
     │
2. Khởi tạo Firebase Admin SDK
     │
3. Kết nối PostgreSQL (nếu có DATABASE_URL)
     │
4. autoConnect() (sau 2 giây)
     │
5. Load tokens từ Firebase Firestore
   (collection: pancake_tokens, doc: accounts, field: data)
     │
6. Với mỗi account (có token + uid hợp lệ, chưa hết hạn):
     │
     ├── 6a. Gọi Pancake API GET /api/v1/pages để discover pageIds
     │        (lọc bỏ Instagram pages: igo_*)
     │
     ├── 6b. Tạo PancakeWebSocketClient
     │
     ├── 6c. Kết nối tới wss://pancake.vn/socket/websocket?vsn=2.0.0
     │
     ├── 6d. Join channel: users:{userId}
     │
     ├── 6e. Join channel: multiple_pages:{userId} (gửi kèm pageIds)
     │
     └── 6f. Bắt đầu heartbeat (30s interval)

7. Chờ nhận events...
```

### Event Flow

```
Khách hàng gửi tin nhắn tới Facebook Page
     │
     ▼
Pancake server nhận tin nhắn (qua Facebook Graph API)
     │
     ▼
Pancake Phoenix WebSocket push event
     │
     ▼
tpos-pancake server nhận event qua WebSocket
     │
     ├── Log ra console (chi tiết)
     │
     └── Lưu vào in-memory event store
         (queryable qua REST API)
```

---

## 4. Phoenix WebSocket Protocol

### Định dạng tin nhắn
Phoenix Protocol v2.0.0 sử dụng JSON arrays:

```json
[joinRef, ref, topic, event, payload]
```

| Field    | Mô tả |
|----------|--------|
| joinRef  | Reference của lệnh join gốc (null cho heartbeat) |
| ref      | Unique reference ID cho mỗi message |
| topic    | Channel name (vd: `users:123`, `multiple_pages:123`) |
| event    | Tên event (vd: `phx_join`, `pages:new_message`) |
| payload  | Dữ liệu JSON |

### Ví dụ messages

**Join channel:**
```json
["1", "1", "users:abc123", "phx_join", {
  "accessToken": "jwt_token_here",
  "userId": "abc123",
  "platform": "web"
}]
```

**Join multiple_pages:**
```json
["2", "2", "multiple_pages:abc123", "phx_join", {
  "accessToken": "jwt_token_here",
  "userId": "abc123",
  "clientSession": "random64chars...",
  "pageIds": ["page1", "page2", "page3"],
  "platform": "web"
}]
```

**Heartbeat (mỗi 30 giây):**
```json
[null, "5", "phoenix", "heartbeat", {}]
```

**Server reply (OK):**
```json
["1", "1", "users:abc123", "phx_reply", {"status": "ok", "response": {}}]
```

**Server reply (ERROR):**
```json
["2", "2", "multiple_pages:abc123", "phx_reply", {"status": "error", "response": {"reason": "Gói cước hết hạn"}}]
```

---

## 5. Xác thực & Kết nối

### Pancake API Authentication
Khi gọi API Pancake (vd: discover pages), cần giả lập browser:

```
GET https://pancake.vn/api/v1/pages?access_token={JWT_TOKEN}
Headers:
  Accept: application/json, text/plain, */*
  Cookie: jwt={JWT_TOKEN}; locale=vi          ← BẮT BUỘC
  Referer: https://pancake.vn/multi_pages     ← BẮT BUỘC
  Origin: https://pancake.vn
  User-Agent: Mozilla/5.0 ...
  sec-ch-ua: "Google Chrome";v="143" ...
  sec-fetch-dest: empty
  sec-fetch-mode: cors
  sec-fetch-site: same-origin
```

**Quan trọng:**
- Phải có cả `access_token` query param VÀ `Cookie: jwt=...` header
- `Referer` phải là `https://pancake.vn/multi_pages` (không phải `/`)
- Cần các `sec-*` headers để bypass Cloudflare

### Response format (GET /api/v1/pages)
```json
{
  "success": true,
  "categorized": {
    "activated": [
      { "id": "page_id_1", "name": "Page Name 1", ... },
      { "id": "page_id_2", "name": "Page Name 2", ... }
    ],
    "activated_page_ids": ["page_id_1", "page_id_2"],
    "deactivated": [...],
    "deactivated_page_ids": [...]
  }
}
```

> **Lưu ý:** Pages có id bắt đầu bằng `igo_` là Instagram pages → cần lọc bỏ để tránh lỗi "Gói cước hết hạn".

### WebSocket Connection Headers
```
URL: wss://pancake.vn/socket/websocket?vsn=2.0.0
Headers:
  Origin: https://pancake.vn
  User-Agent: Mozilla/5.0 ...
  Cookie: jwt={JWT_TOKEN}; locale=vi
```

---

## 6. Các loại Event

### pages:update_conversation
Khi có cập nhật hội thoại (tin nhắn mới, đọc tin nhắn, thay đổi trạng thái...)

```json
{
  "conversation": {
    "id": "conv_id",
    "page_id": "page_id",
    "type": "messenger",
    "from": { "id": "fb_user_id", "name": "Tên khách" },
    "snippet": "Nội dung tin nhắn gần nhất...",
    "unread_count": 1,
    "updated_at": "2026-03-17T10:30:00Z",
    "customers": [
      { "name": "Tên khách", "fb_id": "fb_id" }
    ]
  }
}
```

### pages:new_message
Khi có tin nhắn mới cụ thể:

```json
{
  "message": {
    "from": { "id": "fb_user_id", "name": "Tên người gửi" },
    "message": "Nội dung tin nhắn",
    "page_id": "page_id",
    "conversation_id": "conv_id",
    "created_at": "2026-03-17T10:30:00Z"
  }
}
```

### order:tags_updated / tags_updated
Khi tag đơn hàng/hội thoại thay đổi:

```json
{
  "conversation_id": "conv_id",
  "tags": ["tag1", "tag2"]
}
```

### Các event khác
- `online_status` / `presence_state` / `presence_diff` — trạng thái online (bỏ qua)
- Mọi event khác đều được log và lưu vào event store

---

## 7. Multi-Account (Firebase)

### Cấu trúc Firestore

```
Collection: pancake_tokens
  Document: accounts
    Field: data (Map)
      {
        "user_id_1": {
          "uid": "user_id_1",
          "token": "jwt_token_here",
          "name": "Tên account",
          "cookie": "jwt=token; locale=vi",
          "exp": 1750000000  (Unix timestamp, optional)
        },
        "user_id_2": { ... },
        ...
      }
```

### Logic xử lý
1. Đọc tất cả accounts từ Firestore
2. Lọc bỏ accounts thiếu `token` hoặc `uid`
3. Lọc bỏ accounts có `exp` đã quá hạn
4. Với mỗi account hợp lệ → tạo WebSocket client riêng
5. Mỗi client tự discover pageIds qua Pancake API
6. Chỉ connect accounts có ít nhất 1 page

### Mỗi account có quyền ở page khác nhau
- Account A có thể quản lý Page X, Y
- Account B có thể quản lý Page Z
- Server tự động discover pages cho từng account
- Mỗi client chỉ join pages mà account đó có quyền truy cập

---

## 8. REST API Endpoints

### GET /
Server info + danh sách endpoints.

### GET /ping
Health check nhanh.

```json
{
  "success": true,
  "service": "n2store-pancake-ws",
  "accounts": { "total": 6, "connected": 2 },
  "uptime": 3600,
  "eventsReceived": 150,
  "eventStoreSize": 150,
  "timestamp": "2026-03-17T10:00:00Z"
}
```

### GET /api/status
Trạng thái chi tiết từng client.

```json
{
  "totalClients": 6,
  "connectedClients": 2,
  "eventStoreSize": 150,
  "clients": {
    "Huyền Nhi": {
      "name": "Huyền Nhi",
      "connected": true,
      "connectedAt": "2026-03-17T08:00:00Z",
      "uptime": 7200,
      "userId": "abc123",
      "pageIds": ["page1", "page2"],
      "pageCount": 2,
      "eventsReceived": 120,
      "reconnectAttempts": 0,
      "wsState": 1,
      "joinErrors": []
    }
  }
}
```

### GET /api/events
Query events với filter.

| Param   | Mô tả | Ví dụ |
|---------|--------|-------|
| `since` | Lấy events sau thời điểm này | `?since=2026-03-17T10:00:00Z` |
| `type`  | Lọc theo loại event | `?type=new_message` |
| `account` | Lọc theo tên account | `?account=Huyền Nhi` |
| `limit` | Số lượng tối đa (default: 50) | `?limit=20` |
| `offset` | Bỏ qua N events đầu | `?offset=10` |

### GET /api/events/latest
Lấy N events mới nhất (default: 20).

### POST /api/start
Thêm client thủ công.

```json
{
  "token": "jwt_token",
  "userId": "user_id",
  "name": "Tên account",
  "cookie": "jwt=token; locale=vi"
}
```

### POST /api/reconnect
Đóng và kết nối lại tất cả clients.

### POST /api/stop
Dừng tất cả clients.

### POST /api/reload
Reload tokens từ Firebase và kết nối lại. Dùng khi cập nhật token mới trên Firebase.

---

## 9. In-Memory Event Store

- Events được lưu trong **bộ nhớ RAM** (array)
- Tối đa **1000 events** (cấu hình qua `MAX_EVENTS`)
- Khi vượt quá giới hạn → tự động xóa events cũ nhất
- **Mất hết khi server restart** (deploy mới, crash...)
- Không cần lưu DB vì Pancake đã lưu toàn bộ tin nhắn → dùng Pancake API để query lại

### Cấu trúc event

```json
{
  "id": 1,
  "type": "update_conversation",
  "account": "Huyền Nhi",
  "timestamp": "2026-03-17T10:30:00Z",
  "payload": { ... }
}
```

---

## 10. Cấu hình & Triển khai

### Environment Variables

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `PORT` | Không | Port server (default: 3000, Render tự set) |
| `DATABASE_URL` | Không | PostgreSQL connection string (dùng chung với render.com server) |
| `FIREBASE_PROJECT_ID` | Có | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Có | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Có | Firebase service account private key |
| `MAX_EVENTS` | Không | Số events lưu trong memory (default: 1000) |
| `NODE_ENV` | Không | `production` trên Render |

### Render.com

- **Service:** n2store-tpos-pancake
- **Type:** Web Service
- **Root Dir:** `tpos-pancake/server`
- **Build:** `npm install`
- **Start:** `npm start` → `node server.js`
- **URL:** `https://n2store-tpos-pancake.onrender.com`

### Dependencies

```json
{
  "express": "^4.18.2",
  "dotenv": "^16.3.1",
  "ws": "^8.16.0",
  "pg": "^8.13.0",
  "firebase-admin": "^12.0.0"
}
```

---

## 11. Xử lý lỗi & Reconnect

### Exponential Backoff Reconnection
Khi WebSocket bị ngắt:

```
Lần 1: chờ 2s → reconnect
Lần 2: chờ 4s → reconnect
Lần 3: chờ 8s → reconnect
Lần 4: chờ 16s → reconnect
...
Tối đa: chờ 60s
Tối đa 10 lần thử → dừng (dùng POST /api/reconnect để thử lại)
```

### Các lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|------|-------------|------------|
| `Gói cước hết hạn` | Account không có quyền ở page đó, hoặc gói Pancake hết hạn | Server tự discover pages → chỉ join pages có quyền |
| `No pages found` | Token hết hạn hoặc sai headers khi gọi Pancake API | Kiểm tra token trên Firebase, đảm bảo có Cookie + Referer headers |
| WebSocket close code 1006 | Mất kết nối mạng hoặc server Pancake restart | Auto-reconnect với backoff |
| Firebase load error | Sai credentials Firebase hoặc document không tồn tại | Kiểm tra env vars trên Render |

---

## 12. Lưu ý quan trọng

### Token hết hạn
- JWT token Pancake có thời hạn (field `exp` trong Firebase)
- Khi token hết hạn → WebSocket disconnect → cần cập nhật token mới trên Firebase
- Sau khi cập nhật token → gọi `POST /api/reload` để server load token mới

### Không cần lưu dữ liệu
- Pancake đã lưu toàn bộ tin nhắn, hội thoại, đơn hàng
- Dùng Pancake API (GET /api/v1/conversations, /api/v1/messages...) để query lại bất cứ lúc nào
- Event store trong server chỉ là buffer tạm để theo dõi realtime

### Instagram pages
- Page IDs bắt đầu bằng `igo_` là Instagram → tự động lọc bỏ
- Nếu join Instagram page sẽ gặp lỗi subscription

### Rate limiting
- Các client kết nối cách nhau 2 giây để tránh bị rate limit
- Heartbeat 30 giây giữ kết nối sống

### Server restart
- Render free plan: server sleep sau 15 phút không có request
- Render paid plan: server luôn chạy, auto-restart khi crash
- Mỗi lần restart → tự động load tokens từ Firebase và reconnect

---
---

# Part B: Inbox Client (browser-side WebSocket)

---

## 13. Inbox Realtime — Tổng quan

### Vấn đề
Trang **Inbox Chat** (`inbox/index.html`) cần nhận tin nhắn mới realtime để hiển thị cho nhân viên bán hàng, mà không phụ thuộc vào Render server (có thể sleep/restart).

### Giải pháp
Inbox client kết nối **trực tiếp** tới Pancake Phoenix WebSocket từ browser, thông qua **Cloudflare Worker proxy** (vì browser không thể set custom `Origin` header cho WebSocket).

### Kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│  Browser (inbox/index.html)                             │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ PancakePhoenixSocket (inbox-chat.js:10-163)     │    │
│  │ - Join channels: users:{uid}, multiple_pages    │    │
│  │ - Heartbeat 30s, auto-reconnect                 │    │
│  └──────────────────────┬──────────────────────────┘    │
└─────────────────────────┼───────────────────────────────┘
                          │ wss://
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Worker (chatomni-proxy)                     │
│  Route: /ws/pancake                                     │
│  - Override Origin → https://pancake.vn                 │
│  - Override Host → pancake.vn                           │
│  - Transparent WebSocket proxy (101 upgrade)            │
│  File: cloudflare-worker/modules/handlers/              │
│        pancake-handler.js:240-259                       │
└──────────────────────┬──────────────────────────────────┘
                       │ wss://
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Pancake Phoenix WebSocket Server                       │
│  wss://pancake.vn/socket/websocket?vsn=2.0.0           │
└─────────────────────────────────────────────────────────┘
```

---

## 14. Cloudflare Worker WebSocket Proxy

### Tại sao cần proxy?
- Browser WebSocket API **không cho phép** set custom `Origin` header
- Pancake server **kiểm tra Origin** phải là `https://pancake.vn`
- CF Worker nhận WS request từ browser → set đúng Origin/Host → forward tới Pancake

### Code (pancake-handler.js)

```javascript
// cloudflare-worker/modules/handlers/pancake-handler.js:240-259
export async function handlePancakeWebSocket(request, url) {
    const targetUrl = new URL('https://pancake.vn/socket/websocket');
    for (const [key, value] of url.searchParams) {
        targetUrl.searchParams.set(key, value);
    }

    const headers = new Headers(request.headers);
    headers.set('Host', 'pancake.vn');
    headers.set('Origin', 'https://pancake.vn');

    // CF Workers tự proxy WebSocket khi upstream trả 101
    return fetch(targetUrl.toString(), {
        method: request.method,
        headers: headers,
    });
}
```

### Route mapping (worker.js)

```javascript
// WebSocket upgrade detected → check path
if (request.headers.get('Upgrade') === 'websocket') {
    if (pathname === '/ws/pancake' || pathname.startsWith('/ws/pancake')) {
        return handlePancakeWebSocket(request, url);
    }
}
```

### URL
- **Client connects to:** `wss://chatomni-proxy.nhijudyshop.workers.dev/ws/pancake?vsn=2.0.0`
- **Worker proxies to:** `wss://pancake.vn/socket/websocket?vsn=2.0.0`

---

## 15. PancakePhoenixSocket Class

### Vị trí
`inbox/js/inbox-chat.js` (dòng 10-163)

### Constructor

```javascript
class PancakePhoenixSocket {
    constructor({ accessToken, userId, pageIds, onEvent, onStatusChange }) {
        this.url = 'wss://chatomni-proxy.nhijudyshop.workers.dev/ws/pancake?vsn=2.0.0';
        this.accessToken = accessToken;   // JWT token từ Pancake
        this.userId = userId;             // Pancake user ID (decoded từ JWT)
        this.pageIds = pageIds;           // Mảng pageIds đã discover
        this.onEvent = onEvent;           // Callback nhận events
        this.onStatusChange = onStatusChange; // Callback connected/disconnected
        this.maxReconnect = 10;
        // ...
    }
}
```

### Phoenix Protocol
Giống hệt Part A (Section 4), sử dụng JSON arrays `[joinRef, ref, topic, event, payload]`.

### Channels đăng ký

| Channel | Payload |
|---------|---------|
| `users:{userId}` | `{ accessToken, userId, platform: 'web' }` |
| `multiple_pages:{userId}` | `{ accessToken, userId, clientSession, pageIds, platform: 'web' }` |

### Heartbeat
- Gửi mỗi **30 giây**: `[null, ref, 'phoenix', 'heartbeat', {}]`
- Timeout **10 giây** — nếu không nhận reply → đóng WS → trigger reconnect

### Reconnect
- Exponential backoff: 2s → 4s → 8s → ... → 60s (max)
- Tối đa **10 lần** thử
- Reset counter khi kết nối thành công

---

## 16. Luồng kết nối Inbox

```
1. User mở inbox/index.html
     │
2. inbox-main.js init()
     │
3. Load Pancake tokens từ Firebase (pancake_tokens/accounts)
     │
4. Discover pages qua Pancake API (GET /api/v1/pages)
   (qua CF Worker proxy: /api/pancake/pages)
     │
5. Tạo PancakePhoenixSocket instance
   (accessToken, userId, pageIds)
     │
6. socket.connect()
     │
     ├── 6a. WS → CF Worker (/ws/pancake)
     │         → Pancake (wss://pancake.vn/socket/websocket)
     │
     ├── 6b. Join channel: users:{userId}
     │
     ├── 6c. Join channel: multiple_pages:{userId}
     │
     └── 6d. Start heartbeat (30s interval)
     │
7. Nhận events → cập nhật UI (conversation list, messages)
     │
8. Nếu WS fail → fallback polling mỗi 30 giây
```

### Lấy token để connect
Inbox client lấy token từ **Firebase Firestore** (`pancake_tokens/accounts`), giống Render server. Client chọn account đầu tiên có token hợp lệ, decode JWT để lấy `userId`.

---

## 17. Event Handling trong Inbox

### Events được xử lý

| Event | Mô tả | Handler |
|-------|--------|---------|
| `pages:update_conversation` / `update_conversation` | Cập nhật hội thoại (snippet, unread, tags) | `handleConversationUpdate()` |
| `pages:new_message` / `new_message` | Tin nhắn mới | `handleNewMessage()` |
| `post_type_detected` | Phát hiện loại bài post (livestream) | `handlePostTypeDetected()` |

### Xử lý update_conversation
1. Parse payload → lấy `conversation` object
2. Cập nhật `lastMessage`, `time`, `unread_count`, `type`, `tags`
3. Re-sort danh sách hội thoại
4. Nếu conversation đang mở → refresh messages

### Xử lý new_message
1. Parse payload → lấy `message` object
2. Cập nhật conversation snippet + time
3. Nếu conversation đang mở → fetch lại messages từ Pancake API
4. Play notification sound (nếu từ khách hàng)

### WebSocket Status UI

```html
<!-- inbox/index.html:149 -->
<span class="ws-status disconnected" id="wsStatus" title="Realtime: Mất kết nối">
    <i data-lucide="wifi-off"></i>
</span>
```

| Trạng thái | Icon | CSS Class | Title |
|------------|------|-----------|-------|
| Connected | `wifi` | `ws-status connected` | Realtime: Đã kết nối |
| Disconnected | `wifi-off` | `ws-status disconnected` | Realtime: Mất kết nối |

---

## 18. Polling Fallback

Khi WebSocket không khả dụng (CF Worker down, Pancake chặn, v.v.), inbox tự động chuyển sang **HTTP polling**:

```javascript
// Mỗi 30 giây fetch lại danh sách hội thoại
startAutoRefresh() {
    this.autoRefreshInterval = setInterval(async () => {
        await this.data.loadConversations(true); // force refresh
        this._scheduleRender();
        this.renderGroupStats();
    }, 30000); // AUTO_REFRESH_INTERVAL = 30s
}
```

### Cơ chế chuyển đổi
- WS connected → **tắt polling** (realtime đủ nhanh)
- WS disconnected → **bật polling** (30s interval)
- WS reconnected → **tắt polling** lại
- Chuyển đổi transparent, user chỉ thấy icon wifi thay đổi

---

## 19. So sánh 2 hệ thống

| Tiêu chí | Render Server (`tpos-pancake`) | Inbox Client (browser) |
|----------|-------------------------------|----------------------|
| **Vị trí chạy** | Server-side (Render.com) | Client-side (browser) |
| **Always-on** | Có (paid plan) / Sleep (free) | Chỉ khi user mở inbox |
| **WS Endpoint** | Trực tiếp `wss://pancake.vn/socket/websocket` | Qua CF Worker `wss://chatomni-proxy.../ws/pancake` |
| **Tại sao cần proxy** | Không cần (server set headers tự do) | Browser không set được Origin header |
| **Multi-account** | Có (nhiều WS client song song) | Không (1 account tại 1 thời điểm) |
| **Lưu events** | In-memory store (1000 events) | Không lưu (render trực tiếp lên UI) |
| **REST API** | Có (`/api/status`, `/api/events`...) | Không |
| **Fallback** | Chỉ reconnect | Polling 30s khi WS fail |
| **Token source** | Firebase Firestore | Firebase Firestore (giống) |
| **Code location** | `tpos-pancake/server/` | `inbox/js/inbox-chat.js:10-163` |
| **Deploy** | Render.com Web Service | Static files (GitHub Pages / local) |

### Khi nào dùng cái nào?
- **Render Server**: Dùng cho backend processing, notification push, event logging — cần server luôn chạy
- **Inbox Client**: Dùng cho UI realtime — chỉ cần khi nhân viên đang chat, nhẹ hơn và không phụ thuộc Render

---

## Key Files Reference

| Component | File | Lines |
|-----------|------|-------|
| CF Worker WS proxy | `cloudflare-worker/modules/handlers/pancake-handler.js` | 240-259 |
| CF Worker route | `cloudflare-worker/worker.js` | 57-61 |
| Phoenix Socket class | `inbox/js/inbox-chat.js` | 10-163 |
| Event handlers | `inbox/js/inbox-chat.js` | ~3500+ |
| WS status UI | `inbox/index.html` | 149-151 |
| Polling fallback | `inbox/js/inbox-chat.js` | `startAutoRefresh()` |
| Render server | `tpos-pancake/server/server.js` | Full file |
