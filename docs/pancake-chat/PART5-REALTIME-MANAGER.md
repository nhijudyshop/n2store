# PART 5: REALTIME MANAGER (WebSocket)

## Tổng quan

`RealtimeManager` quản lý kết nối WebSocket đến Pancake.vn để nhận cập nhật tin nhắn real-time. Hỗ trợ 2 chế độ: Browser (trực tiếp) và Server (24/7 qua proxy).

**Source file:** `orders-report/js/managers/realtime-manager.js` (~508 lines)

---

## 1. Architecture

```
┌──────────────┐         ┌──────────────────────────┐
│   Browser    │         │      Pancake.vn           │
│              │ ══WS══> │  wss://pancake.vn/socket/ │
│  (Mode 1:   │         │  websocket?vsn=2.0.0      │
│   Browser)  │         └──────────────────────────┘
└──────────────┘

┌──────────────┐    HTTP POST    ┌─────────────────┐    WS    ┌──────────────┐
│   Browser    │ ──────────────> │  Render Server   │ ═══════> │  Pancake.vn  │
│              │                 │  (24/7 online)   │          │              │
│  (Mode 2:   │ <══════WS═════> │  n2store-        │ <═══════ │              │
│   Server)   │   Proxy WS      │  realtime.       │          │              │
│              │                 │  onrender.com    │          │              │
└──────────────┘                 └─────────────────┘          └──────────────┘
```

---

## 2. Constructor & Properties

```javascript
class RealtimeManager {
    constructor() {
        this.ws = null;                // Browser mode WebSocket
        this.proxyWs = null;           // Server mode proxy WebSocket
        this.isConnected = false;
        this.isConnecting = false;
        this.refCounter = 1;           // Phoenix protocol ref counter
        this.heartbeatInterval = null;
        this.reconnectTimer = null;

        // Connection config
        this.url = "wss://pancake.vn/socket/websocket?vsn=2.0.0";
        this.userId = null;
        this.token = null;
        this.pageIds = [];
    }
}
```

---

## 3. Initialization

```javascript
async initialize() {
    // 1. Listen for mode changes
    window.addEventListener('chatApiSourceChanged', (e) => {
        this.disconnect();  // Always disconnect first

        if (e.detail.realtime && e.detail.source === 'pancake') {
            if (e.detail.realtimeMode === 'browser') {
                this.connect();           // Browser mode
            } else {
                this.connectServerMode(); // Server mode
            }
        }
    });

    // 2. Auto-connect nếu realtime đang enabled
    if (chatAPISettings.isRealtimeEnabled() && chatAPISettings.isPancake()) {
        const mode = chatAPISettings.getRealtimeMode();
        if (mode === 'browser') {
            await this.connect();
        } else {
            this.connectServerMode();
        }
    }
}
```

---

## 4. Browser Mode - Kết nối trực tiếp

### 4.1 Connect

```javascript
async connect() {
    if (this.isConnected || this.ws?.readyState === WebSocket.CONNECTING) return;

    // 1. Get dependencies
    this.token = await pancakeTokenManager.getToken();
    const tokenInfo = pancakeTokenManager.getTokenInfo();
    this.userId = tokenInfo.uid;

    if (pancakeDataManager.pageIds.length === 0) {
        await pancakeDataManager.fetchPages();
    }
    this.pageIds = pancakeDataManager.pageIds;

    // 2. Open WebSocket
    this.ws = new WebSocket("wss://pancake.vn/socket/websocket?vsn=2.0.0");

    this.ws.onopen = () => {
        this.isConnected = true;
        this.startHeartbeat();
        this.joinChannels();
    };

    this.ws.onclose = (e) => {
        this.isConnected = false;
        this.stopHeartbeat();

        // Auto-reconnect sau 5s
        if (chatAPISettings.isRealtimeEnabled()) {
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        }
    };

    this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
    };
}
```

### 4.2 Heartbeat

```javascript
startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
            // Phoenix heartbeat format
            this.ws.send(JSON.stringify([
                null, this.makeRef(), "phoenix", "heartbeat", {}
            ]));
        }
    }, 30000); // Mỗi 30 giây
}
```

### 4.3 Join Channels

```javascript
joinChannels() {
    // Channel 1: Users channel
    this.ws.send(JSON.stringify([
        userRef, userRef,
        `users:${this.userId}`,     // Topic
        "phx_join",                  // Event
        {
            accessToken: this.token,
            userId: this.userId,
            platform: "web"
        }
    ]));

    // Channel 2: Multiple Pages channel
    this.ws.send(JSON.stringify([
        pagesRef, pagesRef,
        `multiple_pages:${this.userId}`,  // Topic
        "phx_join",                        // Event
        {
            accessToken: this.token,
            userId: this.userId,
            clientSession: this.generateClientSession(),  // Random UUID
            pageIds: this.pageIds.map(String),
            platform: "web"
        }
    ]));

    // Channel 3: Get online status (sau 1s)
    setTimeout(() => {
        this.ws.send(JSON.stringify([
            pagesRef, statusRef,
            `multiple_pages:${this.userId}`,
            "get_online_status", {}
        ]));
    }, 1000);
}
```

---

## 5. Server Mode - Kết nối qua Proxy

### 5.1 Connect Server Mode

```javascript
async connectServerMode() {
    // 1. Get dependencies
    const token = await pancakeTokenManager.getToken();
    const userId = tokenInfo.uid;
    const pageIds = pancakeDataManager.pageIds;

    // 2. Determine server URL
    let serverBaseUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    if (mode === 'localhost') {
        serverBaseUrl = 'http://localhost:3000';
    }

    // 3. Tell server to start WebSocket client
    const response = await fetch(`${serverBaseUrl}/api/realtime/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token,
            userId,
            pageIds,
            cookie: `jwt=${token}`
        })
    });

    const data = await response.json();
    if (data.success) {
        // 4. Connect to proxy WebSocket for receiving updates
        const wsUrl = mode === 'localhost'
            ? 'ws://localhost:3000'
            : 'wss://n2store-realtime.onrender.com';

        this.connectToProxyServer(wsUrl);
    }
}
```

### 5.2 Connect to Proxy Server

```javascript
connectToProxyServer(url) {
    this.proxyWs = new WebSocket(url);

    this.proxyWs.onopen = () => {
        this.isConnected = true;
    };

    this.proxyWs.onclose = () => {
        this.isConnected = false;
        // Auto-reconnect sau 3s (gọi lại connectServerMode)
        setTimeout(() => this.connectServerMode(), 3000);
    };

    this.proxyWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'pages:update_conversation') {
            this.handleUpdateConversation(data.payload);
        } else if (data.type === 'order:tags_updated') {
            this.handleOrderTagsUpdate(data.payload);
        }
    };
}
```

---

## 6. Phoenix Protocol Message Format

### 6.1 Outgoing Messages

```javascript
// Format: [joinRef, ref, topic, event, payload]

// Join channel
["1", "1", "users:uid123", "phx_join", {accessToken, userId, platform: "web"}]

// Heartbeat
[null, "5", "phoenix", "heartbeat", {}]

// Get online status
["2", "3", "multiple_pages:uid123", "get_online_status", {}]
```

### 6.2 Incoming Messages

```javascript
// Join reply
[null, "1", "users:uid123", "phx_reply", {status: "ok", response: {...}}]

// Conversation update
[null, null, "multiple_pages:uid123", "pages:update_conversation", {
    conversation: {
        id: "conv_id",
        type: "INBOX",
        page_id: "117267091364524",
        snippet: "Tin nhắn mới...",
        seen: false,
        unread_count: 1,
        from: { id: "fb_id", name: "Tên khách" },
        last_message: { text: "...", from: {...} },
        updated_at: "..."
    }
}]

// Tag update
[null, null, "multiple_pages:uid123", "order:tags_updated", {
    orderId: "order_id",
    orderCode: "SON001",
    STT: "123",
    tags: ["tag1", "tag2"],
    updatedBy: "admin_name",
    timestamp: 1705312200000
}]
```

---

## 7. Event Handling

### 7.1 handleMessage - Parse Phoenix messages

```javascript
handleMessage(data) {
    const msg = JSON.parse(data);
    const [joinRef, ref, topic, event, payload] = msg;

    switch (event) {
        case 'phx_reply':
            // Join/push response
            break;
        case 'pages:update_conversation':
            this.handleUpdateConversation(payload);
            break;
        case 'order:tags_updated':
            this.handleOrderTagsUpdate(payload);
            break;
        case 'online_status':
            // Handle if needed
            break;
    }
}
```

### 7.2 handleUpdateConversation - Dispatch custom event

```javascript
handleUpdateConversation(payload) {
    const conversation = payload.conversation;
    if (!conversation) return;

    // Dispatch custom DOM event cho UI components
    window.dispatchEvent(new CustomEvent('realtimeConversationUpdate', {
        detail: conversation
    }));
}
```

### 7.3 handleOrderTagsUpdate - Dispatch tag update

```javascript
handleOrderTagsUpdate(payload) {
    const { orderId, tags, updatedBy, orderCode, STT } = payload;

    window.dispatchEvent(new CustomEvent('realtimeOrderTagsUpdate', {
        detail: { orderId, orderCode, STT, tags, updatedBy, timestamp }
    }));
}
```

---

## 8. Disconnect

```javascript
disconnect() {
    // Close browser WS
    if (this.ws) {
        this.ws.close();
        this.ws = null;
        this.stopHeartbeat();
    }

    // Close proxy WS
    if (this.proxyWs) {
        this.proxyWs.close();
        this.proxyWs = null;
    }

    this.isConnected = false;
}
```

---

## 9. Manual Reconnect

```javascript
async manualConnect() {
    const mode = chatAPISettings.getRealtimeMode();
    notificationManager.show('🔄 Đang kết nối lại...', 'info');

    this.disconnect();

    if (mode === 'browser') {
        await this.connect();
    } else {
        await this.connectServerMode();
    }
}
```

---

## 10. Client Session ID

```javascript
generateClientSession() {
    // Random UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
```

---

## 11. Reference Counter

```javascript
makeRef() {
    return String(this.refCounter++);
    // Phoenix protocol yêu cầu mỗi message có ref duy nhất
}
```

---

## 12. Global Instance

```javascript
window.RealtimeManager = RealtimeManager;
window.realtimeManager = new RealtimeManager();
```

---

## 13. Render.com Server (Proxy Server)

**Source:** `render.com/routes/pancake.js`

Server Node.js trên Render.com chạy 24/7, kết nối WebSocket đến Pancake.vn và forward updates về browser qua proxy WebSocket.

```javascript
// Express route handler
router.all('/*', async (req, res) => {
    const path = req.params[0];
    const targetUrl = `https://pancake.vn/api/v1/${path}`;

    // Proxy request to Pancake with authorization headers
    const response = await fetch(targetUrl, {
        method: req.method,
        headers: { ...req.headers },
        body: req.method !== 'GET' ? req.body : undefined,
        timeout: 15000
    });
});
```

### Server Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|--------|
| `/api/realtime/start` | POST | Bắt đầu WebSocket client trên server |
| `/api/pancake/*` | ALL | Proxy requests đến Pancake API |

### Server WebSocket Flow

```
Browser → POST /api/realtime/start (token, userId, pageIds)
    ↓
Server → Connect WS to wss://pancake.vn/socket/websocket
    ↓
Server → Join channels (users:{userId}, multiple_pages:{userId})
    ↓
Server ← Nhận updates từ Pancake
    ↓
Server → Forward qua proxy WS tới Browser
    ↓
Browser → handleUpdateConversation() → dispatch custom event
```

---

## 14. Listening for Realtime Events (Consumer Side)

```javascript
// Trong tab1-chat.js hoặc các component khác:

function setupRealtimeMessages() {
    window.addEventListener('realtimeConversationUpdate', (event) => {
        const conversation = event.detail;

        // Update UI: tin nhắn mới, unread badge, etc.
        // ...
    });
}

window.addEventListener('realtimeOrderTagsUpdate', (event) => {
    const { orderId, tags, updatedBy } = event.detail;
    // Update tag badges trên bảng đơn hàng
});
```

---

## 15. Connection Modes Comparison

| Feature | Browser Mode | Server Mode |
|---------|-------------|-------------|
| **Kết nối** | Trực tiếp đến Pancake WS | Qua Render proxy |
| **Hoạt động** | Chỉ khi tab mở | 24/7 |
| **Latency** | Thấp | Trung bình |
| **Reconnect** | 5s delay | 3s delay (reconnect cả server) |
| **Server URL** | `wss://pancake.vn/socket/websocket` | `wss://n2store-realtime.onrender.com` |
| **Cần server?** | Không | Cần Render server |
