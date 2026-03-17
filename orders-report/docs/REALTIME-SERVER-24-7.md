# Hệ Thống Server Realtime - Nhận Tin Nhắn 24/7

> Tài liệu chi tiết về kiến trúc, luồng dữ liệu, và cơ chế hoạt động của hệ thống nhận tin nhắn realtime 24/7 trên server Render.com.

---

## Mục Lục

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Server Chính: n2store-realtime (Render.com)](#2-server-chính-n2store-realtime)
3. [Server Phụ: render.com (Fallback)](#3-server-phụ-rendercom-fallback)
4. [Frontend: 3 Module Phối Hợp](#4-frontend-3-module-phối-hợp)
5. [PostgreSQL Database Schema](#5-postgresql-database-schema)
6. [API Endpoints](#6-api-endpoints)
7. [Luồng Dữ Liệu Chi Tiết](#7-luồng-dữ-liệu-chi-tiết)
8. [Cơ Chế Auto-Reconnect](#8-cơ-chế-auto-reconnect)
9. [Cơ Chế Fallback Chain](#9-cơ-chế-fallback-chain)
10. [Livestream Detection](#10-livestream-detection)
11. [Vấn Đề & Giải Pháp](#11-vấn-đề--giải-pháp)
12. [File Reference](#12-file-reference)

---

## 1. Tổng Quan Kiến Trúc

### Sơ đồ tổng thể

```
┌─────────────────────────────────────────────────────────────────────┐
│                      PANCAKE.VN (Facebook Integration)              │
│                 wss://pancake.vn/socket/websocket?vsn=2.0.0         │
│                                                                     │
│  Channels:                                                          │
│    • users:{userId}            → user-specific events               │
│    • multiple_pages:{userId}   → page events (messages, comments)   │
│                                                                     │
│  Events:                                                            │
│    • pages:update_conversation → tin nhắn/bình luận mới             │
│    • pages:new_message         → tin nhắn mới (chi tiết)            │
│    • order:tags_updated        → tag đơn hàng thay đổi              │
│    • online_status             → trạng thái online                  │
└────────────────────┬───────────────────────┬────────────────────────┘
                     │                       │
        ┌────────────▼────────────┐   ┌──────▼──────────────────────┐
        │  LỚP 1: SERVER 24/7    │   │  LỚP 2: BROWSER            │
        │  (Render.com)           │   │  (Khi nhân viên mở trang)  │
        │                         │   │                             │
        │  ┌───────────────────┐  │   │  RealtimeManager            │
        │  │ n2store-realtime  │  │   │  (realtime-manager.js)      │
        │  │ server.js         │──┼───┤  → 2 mode:                  │
        │  │ (1,360 lines)     │  │   │    • Browser: WS trực tiếp  │
        │  └─────────┬─────────┘  │   │    • Server: WS qua proxy   │
        │            │            │   │                             │
        │  ┌─────────▼─────────┐  │   │  new-messages-notifier.js   │
        │  │ PostgreSQL DB     │  │   │  → Fetch pending customers  │
        │  │ pending_customers │  │   │  → Highlight bảng đơn hàng  │
        │  │ realtime_updates  │  │   │                             │
        │  │ realtime_creds    │  │   │  tab1-chat-realtime.js      │
        │  └───────────────────┘  │   │  → Cập nhật chat modal      │
        │                         │   │                             │
        │  ┌───────────────────┐  │   └─────────────────────────────┘
        │  │ render.com/       │  │
        │  │ server.js         │  │
        │  │ (Fallback, 1,009  │  │
        │  │  lines)           │  │
        │  └───────────────────┘  │
        └─────────────────────────┘
```

### Hai lớp hoạt động

| Lớp | Vai trò | Khi nào chạy | File chính |
|-----|---------|---------------|------------|
| **Server (Render.com)** | Duy trì WebSocket tới Pancake, lưu tin nhắn vào PostgreSQL | 24/7 (kể cả khi nhân viên tắt máy) | `n2store-realtime/server.js` |
| **Browser (Frontend)** | Nhận event realtime, hiển thị notification, cập nhật UI | Khi nhân viên mở trang web | `js/managers/realtime-manager.js` |

---

## 2. Server Chính: n2store-realtime

**File:** `n2store-realtime/server.js` (1,360 dòng)
**URL:** `https://n2store-realtime.onrender.com`
**Stack:** Node.js + Express + WebSocket (`ws`) + PostgreSQL (`pg`)

### 2.1 Class RealtimeClient (dòng 311-635)

Class cốt lõi kết nối WebSocket tới Pancake.vn, hoạt động 24/7 trên server.

#### Constructor & Properties

```javascript
class RealtimeClient {
    constructor() {
        this.ws = null;                           // WebSocket instance
        this.url = "wss://pancake.vn/socket/websocket?vsn=2.0.0";
        this.isConnected = false;
        this.refCounter = 1;                      // Phoenix protocol ref counter
        this.heartbeatInterval = null;            // 30s heartbeat timer
        this.reconnectTimer = null;               // Reconnect delay timer
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 50;            // Tăng lên 50 cho 24/7

        this.token = null;                        // Pancake JWT token
        this.userId = null;                       // Pancake user ID
        this.pageIds = [];                        // Facebook Page IDs
        this.cookie = null;                       // Cookie string (jwt=...)
    }
}
```

#### Method: `start(token, userId, pageIds, cookie, saveCredentials)`

Khởi động kết nối mới. Luôn đóng kết nối cũ trước (tránh zombie connection).

```javascript
async start(token, userId, pageIds, cookie = null, saveCredentials = true) {
    // 1. Đóng kết nối cũ (nếu có)
    if (this.ws) {
        this.ws.close();
        this.ws = null;
    }

    // 2. Lưu credentials
    this.token = token;
    this.userId = userId;
    this.pageIds = pageIds.map(id => String(id));
    this.cookie = cookie;

    // 3. Lưu vào DB để auto-reconnect khi server restart
    if (saveCredentials) {
        await saveRealtimeCredentials('pancake', { token, userId, pageIds, cookie });
    }

    // 4. Kết nối
    this.connect();
}
```

#### Method: `connect()`

Mở WebSocket tới Pancake với headers giả lập browser.

```javascript
connect() {
    const headers = {
        'Origin': 'https://pancake.vn',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    if (this.cookie) {
        headers['Cookie'] = this.cookie;  // Cookie JWT cho xác thực
    }

    this.ws = new WebSocket(this.url, { headers });

    this.ws.on('open', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;     // Reset counter
        this.startHeartbeat();           // Bắt đầu heartbeat 30s
        this.joinChannels();             // Join channels
    });

    this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        this.stopHeartbeat();
        // → Auto-reconnect (xem mục 8)
    });

    this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
    });
}
```

#### Method: `joinChannels()`

Join 2 Phoenix channel bắt buộc + lấy online status.

```javascript
joinChannels() {
    // 1. Join User Channel
    // Format: [ref, ref, topic, "phx_join", payload]
    this.ws.send(JSON.stringify([
        ref, ref, `users:${this.userId}`, "phx_join",
        { accessToken: this.token, userId: this.userId, platform: "web" }
    ]));

    // 2. Join Multiple Pages Channel
    this.ws.send(JSON.stringify([
        ref, ref, `multiple_pages:${this.userId}`, "phx_join",
        {
            accessToken: this.token,
            userId: this.userId,
            clientSession: this.generateClientSession(), // Random 64-char string
            pageIds: this.pageIds,                        // Array of page IDs
            platform: "web"
        }
    ]));

    // 3. Get Online Status (sau 1 giây)
    setTimeout(() => {
        this.ws.send(JSON.stringify([
            ref, ref, `multiple_pages:${this.userId}`, "get_online_status", {}
        ]));
    }, 1000);
}
```

#### Method: `handleMessage(msg)`

Xử lý tất cả message từ Pancake WebSocket.

```javascript
handleMessage(msg) {
    const [joinRef, ref, topic, event, payload] = msg;

    // Phoenix protocol messages
    if (event === 'phx_reply') {
        // Channel join response → log status
        if (payload.status === 'error') {
            console.error('Channel join FAILED:', topic);
        }
    }

    // TIN NHẮN / BÌNH LUẬN MỚI
    if (event === 'pages:update_conversation') {
        const conversation = payload.conversation;

        // 1. Broadcast tới frontend clients đang kết nối
        broadcastToClients({
            type: 'pages:update_conversation',
            payload: payload
        });

        // 2. Lưu vào pending_customers (PostgreSQL)
        const customerPsid = conversation.from_psid
            || conversation.customers?.[0]?.fb_id
            || conversation.from?.id;

        if (customerPsid) {
            upsertPendingCustomer({
                psid: customerPsid,
                pageId: conversation.page_id,
                customerName: conversation.from?.name,
                snippet: conversation.snippet,
                type: conversation.type || 'INBOX'
            });
        }

        // 3. Livestream detection (nếu là COMMENT)
        if (conversation.type === 'COMMENT' && isLivestream) {
            saveLivestreamConversation(...);
        }
    }

    // TAG UPDATED
    if (event === 'order:tags_updated') {
        broadcastToClients({
            type: 'order:tags_updated',
            payload: payload
        });
    }
}
```

#### Method: `startHeartbeat()`

Giữ kết nối WebSocket sống bằng Phoenix heartbeat mỗi 30 giây.

```javascript
startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const ref = this.makeRef();
            // Phoenix heartbeat format
            this.ws.send(JSON.stringify([null, ref, "phoenix", "heartbeat", {}]));
        }
    }, 30000); // 30 giây
}
```

### 2.2 Database Operations (dòng 176-286)

#### `upsertPendingCustomer(data)` — Lưu khách chưa trả lời

```sql
INSERT INTO pending_customers
    (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type)
VALUES ($1, $2, $3, $4, NOW(), 1, $5)
ON CONFLICT (psid, page_id)
DO UPDATE SET
    customer_name = COALESCE(EXCLUDED.customer_name, pending_customers.customer_name),
    last_message_snippet = EXCLUDED.last_message_snippet,
    last_message_time = NOW(),
    message_count = pending_customers.message_count + 1
```

**Logic:**
- Khách mới → INSERT với `message_count = 1`
- Khách đã tồn tại → UPDATE `message_count + 1`, cập nhật `snippet` và `time`
- `UNIQUE(psid, page_id)` → mỗi khách trên mỗi page chỉ có 1 record

#### `saveRealtimeCredentials(clientType, credentials)` — Lưu credentials

```sql
INSERT INTO realtime_credentials (client_type, token, user_id, page_ids, cookie, is_active)
VALUES ($1, $2, $3, $4, $5, TRUE)
ON CONFLICT (client_type)
DO UPDATE SET token = EXCLUDED.token, ..., is_active = TRUE
```

**Mục đích:** Khi server restart → đọc credentials từ DB → tự động kết nối lại.

#### `cleanupExpiredPendingCustomers()` — Tự xóa record cũ

```sql
DELETE FROM pending_customers WHERE last_message_time < NOW() - INTERVAL '3 days'
```

- Chạy lần đầu sau 5 giây khi server start
- Chạy định kỳ mỗi 1 giờ
- Xóa record quá 3 ngày

### 2.3 WebSocket Server cho Frontend (dòng 1267-1309)

Server cũng là WebSocket server để frontend kết nối nhận event relay.

```javascript
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Broadcast tới tất cả frontend clients
const broadcastToClients = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

// Keep-alive ping mỗi 30 giây
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
```

### 2.4 Auto-Connect khi Server Start (dòng 842-861)

```javascript
async function autoConnectClients() {
    // Đọc credentials từ DB
    const pancakeCredentials = await loadRealtimeCredentials('pancake');

    if (pancakeCredentials && pancakeCredentials.token) {
        const pageIds = JSON.parse(pancakeCredentials.page_ids);
        await realtimeClient.start(
            pancakeCredentials.token,
            pancakeCredentials.user_id,
            pageIds,
            pancakeCredentials.cookie,
            false  // Không lưu lại (đã có trong DB)
        );
    }
}

// Gọi sau 3 giây khi server start (đợi DB init xong)
setTimeout(() => autoConnectClients(), 3000);
```

### 2.5 Server Startup Sequence

```
1. startServer()
2. → initDatabase()                          // Kết nối PostgreSQL
3. → ensureTablesExist()                     // Tạo bảng nếu chưa có
4. → server.listen(PORT)
5.   → setTimeout(autoConnectClients, 3000)  // Auto-connect Pancake WS
6.   → setTimeout(cleanupExpired, 5000)      // Cleanup pending_customers cũ
7.   → setInterval(cleanupExpired, 3600000)  // Cleanup mỗi 1 giờ
```

---

## 3. Server Phụ: render.com (Fallback)

**File:** `render.com/server.js` (1,009 dòng)
**URL:** `https://n2store-fallback.onrender.com`

### Khác biệt so với server chính

| Tính năng | n2store-realtime | render.com (Fallback) |
|-----------|-----------------|----------------------|
| **Mục đích** | Chuyên realtime | API tổng hợp + fallback |
| **RealtimeClient.maxReconnectAttempts** | 50 | 10 |
| **Reconnect backoff** | `2000 * 1.5^n` (tối đa 300s) | `2000 * 2^n` (tối đa 60s) |
| **Sau max attempts** | Chờ 30 phút rồi thử lại | Dừng hẳn |
| **Lưu DB** | `upsertPendingCustomer` trực tiếp | `saveRealtimeUpdate` + `upsertPendingCustomer` |
| **TPOS client** | Không có | Có (`TposRealtimeClient`) |
| **Livestream detection** | Có (server-side) | Không có |
| **Số route khác** | Ít (chỉ realtime) | Rất nhiều (odata, pancake, customers, v.v.) |

### TposRealtimeClient (chỉ có trên Fallback)

Kết nối tới TPOS ChatOmni WebSocket để nhận event đơn hàng.

```javascript
class TposRealtimeClient {
    constructor() {
        this.baseUrl = "wss://rt-2.tpos.app/socket.io/";
        this.pingInterval = 25000;    // Server timing
        this.pingTimeout = 20000;
        this.room = 'tomato.tpos.vn';
    }

    // Socket.IO protocol:
    // '0{...}'     → Transport info
    // '2'          → Ping
    // '3'          → Pong
    // '40/chatomni,' → Namespace connect
    // '42/chatomni,[event, payload]' → Event message
}
```

**Events từ TPOS:**
- `SaleOnline_Order` → Đơn hàng mới
- `SaleOnline_Update` → Cập nhật đơn hàng

---

## 4. Frontend: 3 Module Phối Hợp

### 4.1 RealtimeManager (`js/managers/realtime-manager.js`, 508 dòng)

Quản lý kết nối WebSocket từ phía browser.

#### Hai chế độ hoạt động

```
┌─────────────────────────────────────────────────────────────┐
│ RealtimeManager.initialize()                                │
│                                                             │
│   if (mode === 'browser')                                   │
│     → connect()           → WS trực tiếp tới Pancake.vn    │
│                                                             │
│   if (mode === 'server' || mode === 'localhost')            │
│     → connectServerMode() → POST /api/realtime/start        │
│                           → connectToProxyServer()          │
│                           → WS tới Render.com               │
└─────────────────────────────────────────────────────────────┘
```

#### Browser Mode (dòng 255-329)

Frontend mở WebSocket trực tiếp tới `wss://pancake.vn/socket/websocket`.

- Ưu điểm: Không cần server trung gian
- Nhược điểm: **Chỉ hoạt động khi trang web đang mở**

```javascript
async connect() {
    this.token = await window.pancakeTokenManager.getToken();
    this.ws = new WebSocket("wss://pancake.vn/socket/websocket?vsn=2.0.0");

    this.ws.onopen = () => {
        this.startHeartbeat();   // 30s heartbeat
        this.joinChannels();     // Join users: + multiple_pages:
    };

    this.ws.onclose = () => {
        // Reconnect sau 5 giây
        setTimeout(() => this.connect(), 5000);
    };

    this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
    };
}
```

#### Server Mode (dòng 79-233)

Frontend yêu cầu Render server mở WebSocket, rồi kết nối proxy để nhận relay.

```javascript
async connectServerMode() {
    // 1. Lấy credentials
    const token = await window.pancakeTokenManager.getToken();
    const userId = tokenInfo.uid;
    const pageIds = window.pancakeDataManager.pageIds;

    // 2. Gửi POST /api/realtime/start qua Cloudflare Worker (tránh CORS)
    const serverUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/start';
    const response = await fetch(serverUrl, {
        method: 'POST',
        body: JSON.stringify({ token, userId, pageIds, cookie: `jwt=${token}` })
    });

    // 3. Kết nối WebSocket proxy trực tiếp tới Render (WS không có CORS)
    this.connectToProxyServer('wss://n2store-realtime.onrender.com');
}

connectToProxyServer(url) {
    this.proxyWs = new WebSocket(url);

    this.proxyWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'pages:update_conversation') {
            this.handleUpdateConversation(data.payload);
        }
    };

    this.proxyWs.onclose = () => {
        // Reconnect sau 3 giây — gọi lại connectServerMode()
        // (re-POST /start nếu server đã restart)
        setTimeout(() => this.connectServerMode(), 3000);
    };
}
```

#### Event Dispatch

Khi nhận event → dispatch `CustomEvent` để các module khác lắng nghe.

```javascript
handleUpdateConversation(payload) {
    window.dispatchEvent(new CustomEvent('realtimeConversationUpdate', {
        detail: payload.conversation
    }));
}

handleOrderTagsUpdate(payload) {
    window.dispatchEvent(new CustomEvent('realtimeOrderTagsUpdate', {
        detail: { orderId, tags, updatedBy, ... }
    }));
}
```

### 4.2 New Messages Notifier (`js/chat/new-messages-notifier.js`, 728 dòng)

**Mục đích:** Khi nhân viên mở trang (hoặc quay lại tab) → hiển thị tin nhắn chưa trả lời từ server.

#### Khởi tạo

```javascript
function init() {
    // Khi trang load → đợi 2 giây → kiểm tra
    setTimeout(checkNewMessages, 2000);

    // Khi quay lại tab sau > 1 phút → kiểm tra lại
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const lastCheck = getLastSeenTimestamp();
            if (Date.now() - lastCheck > 60000) {
                checkNewMessages();
            }
        }
    });
}
```

#### Flow chính: `checkNewMessages()`

```
1. Gọi GET /api/realtime/pending-customers?limit=1500
   → Thử: n2store-realtime.onrender.com
   → Fallback: n2store-fallback.onrender.com
   → Timeout: 10 giây

2. Nhận danh sách khách chưa trả lời:
   [{ psid, page_id, customer_name, last_message_snippet, message_count, type }, ...]

3. Cache vào biến cachedPendingCustomers (để re-apply khi table render lại)

4. Hiển thị toast notification:
   "36 tin nhắn và 32 bình luận mới từ 68 khách hàng"
   → Click toast → mở modal "Chưa trả lời"

5. Highlight rows trong bảng đơn hàng:
   → Match bằng data-psid trên <tr>
   → Thêm badge đỏ "X MỚI" vào cột tin nhắn/bình luận
   → Thêm class pending-customer-row (nền đỏ nhạt)
   → Chunked processing qua requestAnimationFrame (tránh block UI)
```

#### Modal "Chưa trả lời" (`showPendingCustomersModal()`)

```
┌─────────────────────────────────────┐
│ Chưa trả lời           68 khách    │
├─────────────────────────────────────┤
│ [Tất cả (68)] [Tin nhắn (36)] [BL] │
├─────────────────────────────────────┤
│ 💬 Trần Thị Kim Ngân    [TIN NHẮN] │
│    "Chị ơi em muốn hỏi..."  5 phút │
│ 💬 Lê Thủy              [BÌNH LUẬN]│
│    "Ship bao nhiêu vậy..."  12 phút│
│ ...                                 │
└─────────────────────────────────────┘
```

- Click vào khách → tìm `<tr>` matching trong bảng → `openChatModal(orderId, pageId, psid)`
- Sau khi trả lời → `POST /api/realtime/mark-replied` → xóa khỏi pending

#### Re-apply highlights

Khi bảng đơn hàng render lại (filter, pagination), cần re-apply highlights:

```javascript
window.newMessagesNotifier = {
    reapply: reapplyHighlights,  // Gọi khi table re-render
    getCached: () => cachedPendingCustomers,
    markReplied: markRepliedOnServer,
    showModal: showPendingCustomersModal
};
```

### 4.3 Tab1 Chat Realtime (`js/tab1/tab1-chat-realtime.js`, 385 dòng)

**Mục đích:** Cập nhật tin nhắn real-time khi chat modal đang mở.

#### Setup khi mở chat modal

```javascript
function setupRealtimeMessages() {
    // Lắng nghe WebSocket events từ RealtimeManager
    window.addEventListener('realtimeConversationUpdate', handleRealtimeConversationEvent);

    // Polling backup (hiện DISABLED vì đã có WebSocket)
    // startRealtimePolling(); // 10 giây/lần
}
```

#### Xử lý event realtime

```javascript
async function handleRealtimeConversationEvent(event) {
    const conversation = event.detail;

    // Kiểm tra có phải conversation đang mở không
    const isMatch = (conversation.id === window.currentConversationId) ||
        (conversation.page_id === window.currentChatChannelId &&
         conversation.from?.id === window.currentChatPSID);

    if (!isMatch) return; // Bỏ qua event của conversation khác

    // Lấy tin nhắn từ WebSocket payload (không cần gọi API!)
    const lastMessage = conversation.last_message || conversation.message;

    if (lastMessage && lastMessage.id) {
        // Kiểm tra trùng
        const existingIds = new Set(window.allChatMessages.map(m => m.id));
        if (existingIds.has(lastMessage.id)) return;

        // Thêm trực tiếp vào mảng (INSTANT!)
        window.allChatMessages.push(lastMessage);

        // Re-render chat UI
        renderChatMessages(window.allChatMessages, wasAtBottom);

        // Hiệu ứng
        if (!wasAtBottom) showNewMessageIndicator();
        playNewMessageSound(); // Beep 800Hz, 0.3 giây

        return; // Xong — không cần gọi API
    }

    // Fallback: Nếu payload không có full message → gọi API
    if (conversation.snippet) {
        await fetchAndUpdateMessages(); // Gọi Facebook Graph API
    }
}
```

#### Fallback: Fetch qua API

```javascript
async function fetchAndUpdateMessages() {
    // Ưu tiên 1: Facebook Graph API (qua Pancake proxy)
    const pageToken = await getFacebookPageToken();
    if (pageToken) {
        const url = API_CONFIG.buildUrl.pancakeOfficial(
            `pages/${pageId}/conversations/${convId}/messages`, pageToken
        );
        newMessages = await fetch(url);
    }

    // Ưu tiên 2: Pancake API trực tiếp
    else {
        newMessages = await chatDataManager.fetchMessages(...);
    }

    // Lọc tin nhắn mới (chưa có trong mảng)
    const trulyNew = newMessages.filter(m => !existingIds.has(m.id));

    // Cập nhật UI
    window.allChatMessages = [...window.allChatMessages, ...trulyNew];
    renderChatMessages(window.allChatMessages, wasAtBottom);
}
```

#### Notification Sound

```javascript
function playNewMessageSound() {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.frequency.value = 800;      // 800 Hz
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.1, ...); // Volume thấp

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3); // 0.3 giây
}
```

#### Cleanup khi đóng chat modal

```javascript
function cleanupRealtimeMessages() {
    window.removeEventListener('realtimeConversationUpdate', handler);
    clearInterval(window.realtimeMessagesInterval);
    window.lastMessageTimestamp = null;
}
```

---

## 5. PostgreSQL Database Schema

### 5.1 Bảng `pending_customers` — Khách chưa trả lời

**File migration:** `render.com/migrations/create_pending_customers.sql`

```sql
CREATE TABLE pending_customers (
    id              SERIAL PRIMARY KEY,
    psid            VARCHAR(50) NOT NULL,       -- Facebook Page-Scoped ID
    page_id         VARCHAR(50) NOT NULL,       -- Facebook Page ID
    customer_name   VARCHAR(200),               -- Tên khách
    last_message_snippet TEXT,                   -- Nội dung tin nhắn cuối (max 200 char)
    last_message_time TIMESTAMP DEFAULT NOW(),  -- Thời gian tin nhắn cuối
    message_count   INTEGER DEFAULT 1,          -- Số tin nhắn chưa đọc
    type            VARCHAR(20) DEFAULT 'INBOX' -- 'INBOX' hoặc 'COMMENT'
                    CHECK (type IN ('INBOX', 'COMMENT')),
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(psid, page_id)                       -- Mỗi khách/page chỉ 1 record
);

CREATE INDEX idx_pending_customers_psid ON pending_customers(psid, page_id);
CREATE INDEX idx_pending_customers_time ON pending_customers(last_message_time DESC);
```

**Vòng đời record:**
1. **INSERT** khi khách gửi tin nhắn lần đầu
2. **UPDATE** khi khách gửi thêm → `message_count + 1`
3. **DELETE** khi nhân viên trả lời → `POST /api/realtime/mark-replied`
4. **DELETE** auto cleanup → record > 3 ngày tự xóa

### 5.2 Bảng `realtime_credentials` — Credentials auto-reconnect

```sql
CREATE TABLE realtime_credentials (
    id          SERIAL PRIMARY KEY,
    client_type VARCHAR(20) NOT NULL UNIQUE,     -- 'pancake' hoặc 'tpos'
    token       TEXT NOT NULL,                    -- JWT token
    user_id     VARCHAR(50),                      -- User ID
    page_ids    TEXT,                              -- JSON array: ["123", "456"]
    cookie      TEXT,                              -- Cookie string: "jwt=..."
    room        VARCHAR(100),                      -- TPOS room (e.g. "tomato.tpos.vn")
    is_active   BOOLEAN DEFAULT TRUE,              -- FALSE khi stop thủ công
    updated_at  TIMESTAMP DEFAULT NOW()
);
```

**Logic:**
- `POST /api/realtime/start` → `INSERT/UPDATE` với `is_active = TRUE`
- `POST /api/realtime/stop` → `UPDATE is_active = FALSE`
- Server restart → `SELECT WHERE is_active = TRUE` → auto-connect

### 5.3 Bảng `realtime_updates` — Log tin nhắn (Fallback server)

```sql
CREATE TABLE realtime_updates (
    id              SERIAL PRIMARY KEY,
    conversation_id VARCHAR(100) NOT NULL,
    type            VARCHAR(20) NOT NULL CHECK (type IN ('INBOX', 'COMMENT')),
    snippet         TEXT,
    unread_count    INT DEFAULT 0,
    page_id         VARCHAR(50),
    psid            VARCHAR(50),
    customer_name   VARCHAR(255),
    seen            BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### 5.4 Bảng `livestream_conversations` — Livestream tracking

```sql
CREATE TABLE livestream_conversations (
    conv_id     VARCHAR(500) PRIMARY KEY,
    post_id     VARCHAR(500) NOT NULL,
    post_name   TEXT,                         -- Tên bài livestream
    name        VARCHAR(200),                 -- Tên khách
    avatar      TEXT,
    last_message TEXT,
    conv_time   TIMESTAMP,
    type        VARCHAR(20),                  -- 'COMMENT'
    page_id     VARCHAR(255),
    page_name   VARCHAR(200),
    psid        VARCHAR(100),
    customer_id VARCHAR(255),
    label       TEXT DEFAULT 'new',           -- JSON array: '["new"]', '["hot","priority"]'
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.5 Bảng `conversation_labels` — Labels riêng

```sql
CREATE TABLE conversation_labels (
    conv_id    VARCHAR(500) PRIMARY KEY,
    labels     TEXT NOT NULL DEFAULT '["new"]', -- JSON array of label strings
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.6 Bảng `inbox_groups` — Nhóm inbox

```sql
CREATE TABLE inbox_groups (
    id          VARCHAR(100) PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    color       VARCHAR(20) DEFAULT '#3b82f6',
    note        TEXT,
    sort_order  INTEGER DEFAULT 0,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. API Endpoints

### 6.1 Server Chính (n2store-realtime)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/health` | Health check + uptime + DB status + client status |
| `GET` | `/` | Server info + danh sách endpoints |

**Pancake WebSocket Management:**

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/realtime/start` | Khởi động WebSocket tới Pancake (lưu credentials) |
| `POST` | `/api/realtime/stop` | Dừng WebSocket (disable auto-connect) |
| `GET` | `/api/realtime/status` | Trạng thái client (connected, token, pageIds, reconnectAttempts) |
| `POST` | `/api/realtime/reconnect` | Force reconnect (debug) |

**Pending Customers:**

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/realtime/pending-customers?limit=500` | Danh sách khách chưa trả lời |
| `POST` | `/api/realtime/mark-replied` | Xóa khách khỏi pending (`{psid, pageId}`) |
| `POST` | `/api/realtime/clear-pending` | Xóa tất cả pending (cần `{confirm: "yes"}`) |

**Livestream:**

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/realtime/livestream-conversations` | Tất cả conversations grouped by post_id |
| `PUT` | `/api/realtime/livestream-conversation` | Upsert 1 conversation |
| `DELETE` | `/api/realtime/livestream-conversations?post_id=X` | Xóa theo post_id/conv_id |

**Labels & Groups:**

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/realtime/conversation-labels` | Lấy tất cả labels |
| `PUT` | `/api/realtime/conversation-label` | Upsert label cho 1 conversation |
| `PUT` | `/api/realtime/conversation-labels/bulk` | Bulk upsert labels |
| `GET` | `/api/realtime/inbox-groups` | Lấy nhóm inbox |
| `PUT` | `/api/realtime/inbox-groups` | Bulk save nhóm inbox |

### 6.2 Server Phụ (render.com/Fallback)

Ngoài các endpoint tương tự, còn có thêm:

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/realtime/new-messages?since={timestamp}` | Tin nhắn mới từ timestamp |
| `GET` | `/api/realtime/summary?since={timestamp}` | Tóm tắt count |
| `POST` | `/api/realtime/mark-seen` | Đánh dấu đã xem |
| `DELETE` | `/api/realtime/cleanup?days=7` | Xóa records cũ |
| `POST` | `/api/realtime/tpos/start` | Khởi động TPOS WebSocket |
| `POST` | `/api/realtime/tpos/stop` | Dừng TPOS WebSocket |
| `GET` | `/api/realtime/tpos/status` | Trạng thái TPOS client |

---

## 7. Luồng Dữ Liệu Chi Tiết

### 7.1 Luồng nhận tin nhắn 24/7

```
KHÁCH HÀNG gửi tin nhắn trên Facebook Messenger
                    │
                    ▼
        ┌──────────────────────┐
        │ Facebook → Pancake   │
        │ (pages:update_       │
        │  conversation event) │
        └──────────┬───────────┘
                   │
          ┌────────▼────────┐
          │ Pancake WebSocket│
          │ Channel:         │
          │ multiple_pages:  │
          │ {userId}         │
          └────────┬────────┘
                   │
     ┌─────────────┼─────────────┐
     │             │             │
     ▼             ▼             ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐
│ SERVER  │  │ SERVER   │  │ BROWSER      │
│ CHÍNH   │  │ FALLBACK │  │ (nếu đang   │
│ (Render)│  │ (Render) │  │  mở trang)   │
└────┬────┘  └────┬─────┘  └──────┬───────┘
     │            │               │
     │            │               │
     ▼            ▼               ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐
│ Upsert  │  │ Insert   │  │ Dispatch     │
│ pending_│  │ realtime_│  │ CustomEvent  │
│customers│  │ updates  │  │ → Toast      │
│ (PG)    │  │ + Upsert │  │ → Badge      │
│         │  │ pending  │  │ → Chat UI    │
└─────────┘  └──────────┘  └──────────────┘
```

### 7.2 Luồng khi nhân viên mở trang buổi sáng

```
NHÂN VIÊN mở trang web
        │
        ▼
┌───────────────────────────┐
│ DOMContentLoaded          │
│ → setTimeout(2000)        │
│ → checkNewMessages()      │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────────────────────────┐
│ GET /api/realtime/pending-customers?limit=1500 │
│                                                │
│ Thử URL:                                       │
│ 1. n2store-realtime.onrender.com               │
│ 2. n2store-fallback.onrender.com               │
│ (timeout 10s mỗi URL)                          │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────┐
│ Response:                                     │
│ {                                             │
│   success: true,                              │
│   count: 68,                                  │
│   customers: [                                │
│     { psid: "123", customer_name: "Ngân",     │
│       message_count: 3, type: "INBOX",        │
│       last_message_snippet: "Chị ơi..." },    │
│     ...                                       │
│   ]                                           │
│ }                                             │
└───────────────────────┬──────────────────────┘
                        │
              ┌─────────┼─────────┐
              │         │         │
              ▼         ▼         ▼
        ┌──────────┐ ┌──────┐ ┌───────────┐
        │ Toast    │ │Cache │ │ Highlight │
        │ "36 tin  │ │ vào  │ │ table     │
        │ nhắn..." │ │ biến │ │ rows      │
        └──────────┘ └──────┘ └───────────┘
```

### 7.3 Luồng khi nhân viên trả lời tin nhắn

```
NHÂN VIÊN click vào khách trong modal "Chưa trả lời"
        │
        ▼
┌───────────────────────────┐
│ Tìm <tr> matching trong   │
│ bảng đơn hàng             │
│ (data-psid, data-page-id) │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│ openChatModal(orderId,    │
│   pageId, psid, 'message')│
│ → Hiển thị chat modal     │
│ → setupRealtimeMessages() │
└───────────┬───────────────┘
            │
            ▼ (Nhân viên gửi tin nhắn)
            │
┌───────────────────────────────────────────┐
│ POST /api/realtime/mark-replied           │
│ Body: { psid: "123", pageId: "456" }     │
│                                           │
│ Server: DELETE FROM pending_customers     │
│         WHERE psid = $1 AND page_id = $2  │
│                                           │
│ Gọi cả 2 server để đồng bộ:              │
│ 1. n2store-realtime.onrender.com          │
│ 2. n2store-fallback.onrender.com          │
└───────────────────────────────────────────┘
```

### 7.4 Luồng realtime khi chat modal đang mở

```
Pancake WebSocket event (pages:update_conversation)
        │
        ▼
┌───────────────────────────────────┐
│ RealtimeManager                   │
│ → handleUpdateConversation()      │
│ → dispatch CustomEvent            │
│   'realtimeConversationUpdate'    │
└───────────────┬───────────────────┘
                │
                ▼
┌───────────────────────────────────────────────┐
│ tab1-chat-realtime.js                          │
│ → handleRealtimeConversationEvent()            │
│                                                │
│ 1. Kiểm tra: event.detail.id === currentConvId │
│    hoặc event.detail.page_id + psid match?     │
│                                                │
│ 2. Nếu có last_message trong payload:          │
│    → Thêm trực tiếp vào allChatMessages[]      │
│    → renderChatMessages() (INSTANT!)            │
│    → playNewMessageSound() (beep 800Hz)         │
│                                                │
│ 3. Nếu chỉ có snippet:                         │
│    → fetchAndUpdateMessages()                   │
│    → Gọi Facebook Graph API qua Pancake         │
└───────────────────────────────────────────────┘
```

---

## 8. Cơ Chế Auto-Reconnect

### 8.1 Server Chính (n2store-realtime)

```
Kết nối WebSocket bị đóng
        │
        ▼
┌─────────────────────────────────────────┐
│ reconnectAttempts < 50?                 │
│                                         │
│ CÓ → Exponential backoff:              │
│      delay = 2000 * 1.5^attempts        │
│      (2s, 3s, 4.5s, 6.7s, ... max 300s)│
│      → setTimeout(connect, delay)       │
│                                         │
│ KHÔNG → Chờ 30 phút rồi reset về 0     │
│         → Thử lại từ đầu               │
└─────────────────────────────────────────┘
```

**Timeline ví dụ:**
```
Attempt  1: chờ 2.0s
Attempt  2: chờ 3.0s
Attempt  3: chờ 4.5s
Attempt  5: chờ 10.1s
Attempt 10: chờ 76.3s
Attempt 15: chờ 300.0s (max)
Attempt 16-50: chờ 300.0s mỗi lần
Attempt 51: chờ 30 phút → reset → bắt đầu lại
```

### 8.2 Server Phụ (Fallback)

```
delay = 2000 * 2^attempts    (2s, 4s, 8s, 16s, 32s, 60s max)
maxReconnectAttempts = 10
Sau 10 lần → DỪNG HẲN (không retry nữa)
```

### 8.3 Frontend Browser Mode

```
ws.onclose → setTimeout(connect, 5000)    // Luôn 5 giây, không exponential
```

### 8.4 Frontend Server Mode (Proxy WS)

```
proxyWs.onclose → setTimeout(connectServerMode, 3000)
// Gọi lại connectServerMode() (không chỉ reconnect WS)
// → Re-POST /api/realtime/start (đề phòng server restart)
// → Rồi mới connectToProxyServer()
```

### 8.5 Server Restart Auto-Connect

```
Server start
    │
    ▼ (sau 3 giây)
autoConnectClients()
    │
    ▼
SELECT * FROM realtime_credentials WHERE is_active = TRUE
    │
    ▼
Có credentials? → realtimeClient.start(token, userId, pageIds, cookie, false)
Không?          → Log "No credentials found" → chờ POST /start từ frontend
```

---

## 9. Cơ Chế Fallback Chain

### 9.1 Frontend gọi API

```
fetchPendingCustomers():
    URL 1: https://n2store-realtime.onrender.com/api/realtime/pending-customers
    URL 2: https://n2store-fallback.onrender.com/api/realtime/pending-customers
    → Timeout: 10 giây mỗi URL
    → Thử URL 1 trước, nếu fail → thử URL 2

markRepliedOnServer():
    → Gọi CẢ 2 server (đồng bộ cả 2 database)
```

### 9.2 Frontend POST /start

```
connectServerMode():
    Mode 'server':    POST qua https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/start
    Mode 'localhost': POST qua http://localhost:3000/api/realtime/start

    Sau đó kết nối WebSocket:
    Mode 'server':    wss://n2store-realtime.onrender.com
    Mode 'localhost': ws://localhost:3000
```

### 9.3 Tại sao POST qua Cloudflare, WS trực tiếp Render?

```
POST /api/realtime/start → Qua Cloudflare Worker (tránh CORS cho HTTP)
WebSocket connection     → Trực tiếp tới Render (WS không có CORS issues)
```

---

## 10. Livestream Detection

Server tự phát hiện bình luận từ livestream để phân loại.

### Flow

```
pages:update_conversation (type: COMMENT)
        │
        ▼
┌───────────────────────────────────────┐
│ Kiểm tra post.type === 'livestream'   │
│ hoặc post.live_video_status === 'vod' │
│ hoặc post.live_video_status === 'live'│
└──────────────┬────────────────────────┘
               │
      ┌────────┼────────┐
      │ CÓ              │ KHÔNG
      ▼                  ▼
┌──────────────┐  ┌─────────────────────────────┐
│ Lưu vào      │  │ Payload có post.type?        │
│ livestream_  │  │                              │
│ conversations│  │ CÓ → Cache in-memory         │
│ (PostgreSQL) │  │ KHÔNG → lookupPostType()     │
└──────────────┘  │   → Check in-memory cache    │
                  │   → Gọi Pancake API          │
                  │   → GET messages?limit=1      │
                  │   → Lấy post.type từ response │
                  └─────────────────────────────┘
```

### Caching

```javascript
// In-memory cache (reset khi server restart)
const postTypeCache = new Map();       // post_id → { postType, liveVideoStatus, postMessage }
const pageAccessTokenCache = new Map(); // page_id → { token, cachedAt }  (TTL: 1 giờ)
const postTypeLookupInFlight = new Set(); // Dedupe concurrent lookups
```

### Post Name Fetch

Khi WS payload không có `post.message` (livestream thường thiếu):

```javascript
async function fetchAndSavePostName(conversationId, pageId, postId) {
    // 1. Lấy page_access_token (cached 1 giờ)
    const pageAccessToken = await getOrFetchPageAccessToken(pageId);

    // 2. Gọi Pancake messages API
    const url = `https://pages.fm/api/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages?page_access_token=${pageAccessToken}&limit=1`;
    const data = await fetch(url);

    // 3. Lấy post name (fallback chain)
    const postName = post?.message
        || post?.story
        || `Live ${date}${adminName}`;

    // 4. Update DB
    await dbPool.query('UPDATE livestream_conversations SET post_name = $1 WHERE post_id = $2', [postName, postId]);
}
```

---

## 11. Vấn Đề & Giải Pháp

### 11.1 Render Free Tier ngủ server

| Vấn đề | Server Render free tier ngủ sau 15 phút không có request |
|---------|--------------------------------------------------------|
| **Hậu quả** | WebSocket bị đóng → mất tin nhắn trong thời gian ngủ |
| **Giải pháp hiện tại** | Dùng Standard Plan (không ngủ) |
| **Backup** | Khi server thức lại → `autoConnectClients()` kết nối lại |

### 11.2 Token hết hạn

| Vấn đề | Pancake JWT token có thể hết hạn |
|---------|--------------------------------|
| **Hậu quả** | `phx_reply` trả `status: error` → channel join thất bại |
| **Phát hiện** | Server log `❌ Channel join FAILED` |
| **Giải pháp** | Nhân viên cần mở trang → `POST /api/realtime/start` với token mới |

### 11.3 Zombie connection

| Vấn đề | WebSocket heartbeat hoạt động nhưng không nhận event |
|---------|-----------------------------------------------------|
| **Giải pháp** | `start()` luôn đóng kết nối cũ trước khi mở mới |
| **Debug** | `GET /api/realtime/status` → kiểm tra `wsReadyState`, `reconnectAttempts` |

### 11.4 pending_customers tích lũy

| Vấn đề | Nếu không ai trả lời → records tích lũy mãi |
|---------|---------------------------------------------|
| **Giải pháp 1** | Auto cleanup > 3 ngày (chạy mỗi 1 giờ) |
| **Giải pháp 2** | `POST /api/realtime/clear-pending` (manual, cần confirm) |
| **Giải pháp 3** | Limit query: `?limit=1500` |

### 11.5 CORS

| Vấn đề | Browser không thể POST trực tiếp tới Render (CORS) |
|---------|---------------------------------------------------|
| **Giải pháp** | POST qua Cloudflare Worker (`chatomni-proxy.nhijudyshop.workers.dev`) |
| **WS** | WebSocket không bị CORS → kết nối trực tiếp tới Render |

### 11.6 Hai server cùng nhận tin

| Vấn đề | Cả 2 server (chính + fallback) đều nhận tin → dữ liệu trùng? |
|---------|--------------------------------------------------------------|
| **Thực tế** | `UNIQUE(psid, page_id)` → `ON CONFLICT DO UPDATE` → không trùng |
| **mark-replied** | Frontend gọi cả 2 server → đồng bộ xóa |

---

## 12. File Reference

### Server-side

| File | Dòng | Mô tả |
|------|------|-------|
| `n2store-realtime/server.js` | 1,360 | Server chính — RealtimeClient + API + WS server |
| `n2store-realtime/package.json` | — | Dependencies: express, cors, ws, pg, dotenv |
| `render.com/server.js` | 1,009 | Server phụ — Fallback + TPOS client |
| `render.com/routes/realtime.js` | 512 | API routes: new-messages, summary, mark-seen, pending-customers |
| `render.com/routes/realtime-sse.js` | 386 | Server-Sent Events (Firebase replacement) |
| `render.com/routes/realtime-db.js` | 949 | CRUD operations cho realtime data |

### Frontend

| File | Dòng | Mô tả |
|------|------|-------|
| `orders-report/js/managers/realtime-manager.js` | 508 | WebSocket manager — Browser/Server mode |
| `orders-report/js/chat/new-messages-notifier.js` | 728 | Fetch pending customers + toast + highlight |
| `orders-report/js/tab1/tab1-chat-realtime.js` | 385 | Realtime chat update khi modal mở |

### Database Migrations

| File | Mô tả |
|------|-------|
| `render.com/migrations/create_pending_customers.sql` | Bảng pending_customers |
| `render.com/migrations/create_realtime_credentials.sql` | Bảng realtime_credentials |
| `render.com/migrations/create_realtime_updates.sql` | Bảng realtime_updates |
| `render.com/migrations/create_realtime_data.sql` | 10 bảng thay thế Firebase |

---

*Cập nhật: 2026-03-16*
