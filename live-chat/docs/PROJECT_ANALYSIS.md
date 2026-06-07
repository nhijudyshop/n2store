# 📊 Live ChatOmni - Phân Tích WebSocket

> **Tài liệu tập trung vào kiến trúc WebSocket real-time cho phần Live (bên trái)**

---

## 🎯 Tổng Quan

**Giao diện split-view**:
- **Bên trái**: Live (iframe) - Sử dụng ChatOmni WebSocket
- **Bên phải**: Pancake Chat - Xem `PANCAKE_GUIDE.md`

Tài liệu này tập trung vào **Live ChatOmni** (bên trái).

---

## 🏗️ Kiến Trúc WebSocket

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                      │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │   Chat WebSocket │  │   RT WebSocket   │             │
│  │ ws.chatomni.live │  │  rt-2.live.app   │             │
│  │   (Messages)  ⚡  │  │ (Notifications)🔔│             │
│  └────────┬─────────┘  └────────┬─────────┘             │
│           │                     │                        │
│           └─────────┬───────────┘                        │
│                     │                                    │
│              ⚡ Real-time Only                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
           │ Token from API
           ▼
┌─────────────────────────────────────────────────────────┐
│              CLOUDFLARE WORKER (Proxy)                   │
│      https://chatomni-proxy.nhijudyshop.workers.dev     │
│              Proxy API → tomato.live.vn                  │
└─────────────────────────────────────────────────────────┘
```

---

## � Chi Tiết WebSocket Servers

### 1. Chat WebSocket (`ws.chatomni.live.app`)

| Thuộc tính | Giá trị |
|------------|---------|
| **URL** | `wss://ws.chatomni.live.app/chatomni` |
| **Protocol** | Socket.IO |
| **Namespace** | `/chatomni` |
| **Room** | `tomato.live.vn` |
| **Mục đích** | Tin nhắn chat real-time |

**Events nhận:**
| Event | Trigger | Action |
|-------|---------|--------|
| `connect` | Kết nối thành công | Gửi auth token |
| `authenticated` | Auth thành công | Ready to receive |
| `on-conversations` | Conversation thay đổi | Refresh danh sách |
| `on-messages` | Tin nhắn mới (MessageCreated) | Refresh messages |
| `disconnect` | Mất kết nối | Auto reconnect |

**Connection code:**
```javascript
const chatSocket = io('wss://ws.chatomni.live.app/chatomni', {
  transports: ['websocket'],
  query: { room: 'tomato.live.vn', EIO: '4' },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

chatSocket.on('connect', () => {
  console.log('✅ [CHAT] WebSocket connected:', chatSocket.id);
  chatSocket.emit('auth', { token: bearerToken });
});

chatSocket.on('authenticated', (data) => {
  console.log('✅ [CHAT] Authentication successful');
});

chatSocket.on('on-messages', (data) => {
  const eventData = typeof data === 'string' ? JSON.parse(data) : data;
  if (eventData.EventName === 'MessageCreated') {
    fetchMessages(channelId, userId);
  }
});

chatSocket.on('on-conversations', (data) => {
  fetchConversations();
});
```

---

### 2. RT WebSocket (`rt-2.live.app`)

| Thuộc tính | Giá trị |
|------------|---------|
| **URL** | `wss://rt-2.live.app/chatomni` |
| **Protocol** | Socket.IO |
| **Namespace** | `/chatomni` |
| **Room** | `tomato.live.vn` |
| **Mục đích** | Notifications, system updates |

**Events nhận:**
| Event | Trigger | Action |
|-------|---------|--------|
| `connect` | Kết nối thành công | Gửi auth token |
| `authenticated` | Auth thành công | Ready to receive |
| `notification` | System notification | Refresh data |
| `update` | Data update | Refresh conversations |
| `disconnect` | Mất kết nối | Auto reconnect |

**Connection code:**
```javascript
const rtSocket = io('wss://rt-2.live.app/chatomni', {
  transports: ['websocket'],
  query: { room: 'tomato.live.vn', EIO: '4' },
  reconnection: true
});

rtSocket.on('connect', () => {
  rtSocket.emit('auth', { token: bearerToken });
});

rtSocket.onAny((eventName, ...args) => {
  console.log('📡 [RT] Event:', eventName, args);
});
```

---

## 📨 WebSocket Message Format

### Event Structure
```
42/chatomni,["on-events","{...JSON payload...}"]
```

### Payload Structure (Đầy đủ)

**Ví dụ 1: Có đơn hàng (HasPhone: true, HasAddress: true)**
```json
{
  "Conversation": {
    "Id": "683498e07b342896aec155d6",
    "ChannelType": 4,
    "ChannelId": "270136663390370",
    "UserId": "9484319011642026",
    "Name": "Hoa Phượng",
    "HasPhone": true,
    "HasAddress": true,
    "UpdatedTime": "2025-12-19T14:22:35.887Z"
  },
  "Message": {
    "Id": "69455fa7e65daaf3ed261aaf",
    "ChannelType": 4,
    "ChannelId": "270136663390370",
    "UserId": "9484319011642026",
    "Message": "lv do",
    "MessageType": 12,
    "ContentType": null,
    "ObjectId": "270136663390370_759214013141302",
    "ParentId": null,
    "IsOwner": false,
    "Data": {
      "id": "759214013141302_681441874903695",
      "parent": {
        "id": "270136663390370_759214013141302"
      },
      "is_hidden": false,
      "can_hide": false,
      "can_remove": false,
      "can_like": false,
      "can_reply_privately": false,
      "comment_count": 0,
      "message": "lv do",
      "user_likes": false,
      "created_time": "2025-12-19T21:22:31+07:00",
      "object": {
        "id": "270136663390370_759214013141302"
      },
      "from": {
        "id": "9484319011642026",
        "name": "Hoa Phượng",
        "uid": null
      },
      "comments": null,
      "attachment": null,
      "message_tags": [],
      "status": 0
    },
    "CreatedById": null,
    "CreatedBy": null,
    "CreatedTime": "2025-12-19T21:22:35.873+07:00",
    "ChannelCreatedTime": "2025-12-19T21:22:31+07:00"
  },
  "EventName": "chatomni.on-message"
}
```

**Ví dụ 2: Không có đơn hàng (khách mới)**
```json
{
  "Conversation": {
    "Id": "683498cf7b342896aec0d1ef",
    "ChannelType": 4,
    "ChannelId": "270136663390370",
    "UserId": "1865780286857442",
    "Name": "Buoi Nguyen Thi",
    "HasPhone": true,
    "HasAddress": true,
    "UpdatedTime": "2025-12-19T14:23:13.864Z"
  },
  "Message": {
    "Id": "69455fcb07744045fe2595dd",
    "ChannelType": 4,
    "ChannelId": "270136663390370",
    "UserId": "1865780286857442",
    "Message": "Vl đõ zie 1 Va zie 3",
    "MessageType": 12,
    "ContentType": null,
    "ObjectId": "270136663390370_759214013141302",
    "ParentId": null,
    "IsOwner": false,
    "Data": {
      "id": "759214013141302_4149320411957637",
      "parent": {
        "id": "270136663390370_759214013141302"
      },
      "is_hidden": false,
      "can_hide": false,
      "can_remove": false,
      "can_like": false,
      "can_reply_privately": false,
      "comment_count": 0,
      "message": "Vl đõ zie 1 Va zie 3",
      "user_likes": false,
      "created_time": "2025-12-19T21:23:07+07:00",
      "object": {
        "id": "270136663390370_759214013141302"
      },
      "from": {
        "id": "1865780286857442",
        "name": "Buoi Nguyen Thi",
        "uid": null
      },
      "comments": null,
      "attachment": null,
      "message_tags": [],
      "status": 0
    },
    "CreatedById": null,
    "CreatedBy": null,
    "CreatedTime": "2025-12-19T21:23:13.853+07:00",
    "ChannelCreatedTime": "2025-12-19T21:23:07+07:00"
  },
  "EventName": "chatomni.on-message"
}
```

### Các trường quan trọng

| Trường | Mô tả |
|--------|-------|
| `Conversation.Id` | ID cuộc hội thoại |
| `Conversation.UserId` | Facebook PSID (dùng cho avatar) |
| `Conversation.Name` | Tên khách hàng |
| `Conversation.HasPhone` | Có SĐT không |
| `Message.Message` | Nội dung tin nhắn |
| `Message.IsOwner` | `true` = shop gửi, `false` = khách gửi |
| `Message.MessageType` | Loại tin nhắn (12 = comment) |
| `EventName` | `chatomni.on-message` |

### Handle Message Event
```javascript
chatSocket.on('on-events', (rawData) => {
  const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
  
  if (data.EventName === 'chatomni.on-message') {
    console.log('📨 New message from:', data.Conversation.Name);
    console.log('📝 Content:', data.Message.Message);
    
    // Refresh UI
    fetchConversations();
    if (selectedConv?.Id === data.Conversation.Id) {
      fetchMessages(data.Conversation.ChannelId, data.Conversation.UserId);
    }
  }
});
```

---

## 🔄 Dual WebSocket Status

| Status | Mô tả |
|--------|-------|
| 🟢 Chat \| 🟢 RT | Cả 2 WebSocket connected - Best performance |
| 🟢 Chat \| ⚪ RT | Chỉ Chat WS - Messages real-time |
| ⚪ Chat \| 🟢 RT | Chỉ RT WS - Notifications real-time |
| ⚪ Chat \| ⚪ RT | Đang reconnect... |

---

## � Authentication

Token lấy từ Live API qua Cloudflare Worker:
```
POST https://chatomni-proxy.nhijudyshop.workers.dev/api/token
Body: client_id=tmtWebApp&grant_type=password&username=xxx&password=xxx
Response: { access_token: "eyJhbG..." }
```

Authenticate WebSocket:
```javascript
socket.emit('auth', { token: accessToken });
```

---

## 👤 Avatar (Facebook CDN)

Avatar khách hàng lấy từ Facebook CDN, không cần authentication:

### URL Pattern
```
https://platform-lookaside.fbsbx.com/platform/profilepic/?psid={PSID}&height=200&width=200
```

### Lấy PSID từ đâu?
PSID (Page-Scoped ID) có trong response của conversation:
```javascript
const psid = conversation.User.Id;  // VD: "3382503611870828"
```

### Code hiển thị avatar
```javascript
const getFacebookAvatar = (userId) => {
  if (!userId) return null;
  return `https://platform-lookaside.fbsbx.com/platform/profilepic/?psid=${userId}&height=200&width=200`;
};

// Trong component
<img
  src={getFacebookAvatar(conv.User?.Id)}
  alt={conv.Name}
  onError={(e) => {
    e.target.onerror = null;
    e.target.src = 'fallback-avatar.svg';
  }}
/>
```

### Lưu ý
- ✅ Không cần auth (public CDN)
- ✅ Browser tự cache
- ⚠️ Có thể không load nếu user đặt private

---

## 🔍 Debug WebSocket (Console Commands)

Mở F12 → Console để debug:

```javascript
// Check connection status
console.log('Chat Socket:', chatSocket?.connected, chatSocket?.id);
console.log('RT Socket:', rtSocket?.connected, rtSocket?.id);

// Force disconnect (testing)
chatSocket?.disconnect();
rtSocket?.disconnect();

// Force reconnect
chatSocket?.connect();
rtSocket?.connect();

// Listen all events (debug mode)
chatSocket?.onAny((event, ...args) => console.log('CHAT:', event, args));
rtSocket?.onAny((event, ...args) => console.log('RT:', event, args));
```

### Log Patterns Quan Trọng
```
🔌 Connecting to WebSocket servers...
✅ [CHAT] WebSocket connected: abc123
🔐 [CHAT] Authentication sent
✅ [RT] WebSocket connected: xyz789
📨 [CHAT] New message received: {...}
❌ [CHAT] WebSocket disconnected: transport close
🔄 [CHAT] Reconnected after 2 attempts
```

---

## 🔒 WebSocket Security

| Aspect | Status |
|--------|--------|
| Protocol | ✅ `wss://` (TLS encrypted) |
| Authentication | ✅ Bearer token via `emit('auth')` |
| Message validation | ✅ Server validates all messages |
| Token storage | ✅ Memory only |
| Token in URL | ❌ Token in body, not query string |

---

## 📊 WebSocket Performance

| Component | CPU | Memory | Network |
|-----------|-----|--------|---------|
| Chat WebSocket | <1% | ~5MB | Events only |
| RT WebSocket | <1% | ~5MB | Events only |
| **Tổng** | **<2%** | **~10MB** | **Minimal** |

### So sánh Latency
| Method | Latency |
|--------|---------|
| WebSocket | <100ms (instant) |

---

## 📊 Bảng Tổng Hợp WebSocket

| Server | URL | Protocol | Auth | Dữ liệu |
|--------|-----|----------|------|---------|
| Chat WS | `wss://ws.chatomni.live.app/chatomni` | Socket.IO/WSS | Token via emit | Messages real-time |
| RT WS | `wss://rt-2.live.app/chatomni` | Socket.IO/WSS | Token via emit | Notifications |

---

## 🆘 Troubleshooting

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-------------|-----------|
| Chỉ 1 badge xanh | 1 server đang restart | Đợi tự reconnect |
| Cả 2 badge trắng | Network issue / Firewall | Check firewall/network |
| Badge nhấp nháy | Mạng không ổn định | Check WiFi/cable |
| Constant reconnecting | Token expired | Đăng nhập lại |
| `connect_error` | Proxy blocking WSS | Check corporate proxy |

### Kiểm tra Network
```bash
# Test WebSocket connectivity
curl -I https://ws.chatomni.live.app
curl -I https://rt-2.live.app
```

---

## 🔢 Session Index (Số đơn hàng trên Avatar)

### Mô tả
**Session Index** là số hiển thị trên badge đỏ kế bên avatar của khách hàng. Số này cho biết khách hàng đã đặt đơn hàng trong phiên live hiện tại.

![Session Index Badge](https://i.imgur.com/example.png)
- Badge đỏ với số (VD: `584`) = sessionIndex của khách
- Chỉ hiển thị với khách đã có đơn hàng trong phiên live

### Cách lấy Session Index

Có **2 bước** để lấy và cập nhật sessionIndex:

```
┌─────────────────────────────────────────────────────────────────┐
│  Page Load ──► [1] Fetch API (1 lần) ──► [2] Socket (real-time) │
│                    ▲                          ▲                 │
│                    │                          │                 │
│            Lấy data ban đầu          Cập nhật đơn mới           │
└─────────────────────────────────────────────────────────────────┘
```

---

#### Bước 1: Fetch API **MỘT LẦN** khi mới vào trang / F5

> **Lưu ý:** Chỉ gọi API này **1 lần duy nhất** khi page load để lấy toàn bộ orders hiện có. Sau đó, socket sẽ xử lý các đơn mới.

**Endpoint:**
```
GET /odata/SaleOnline_Facebook_Post/ODataService.GetCommentOrders?$expand=orders&PostId={PostId}
```

**URL qua Cloudflare Worker Proxy:**
```javascript
const postId = "270136663390370_1624723368895322"; // Facebook Post ID

// Sử dụng proxy để bypass CORS
const response = await fetch(
  `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Facebook_Post/ODataService.GetCommentOrders?$expand=orders&PostId=${postId}`,
  {
    method: "GET",
    headers: {
      "Accept": "*/*",
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json;IEEE754Compatible=false;charset=utf-8",
      "liveappversion": "5.11.16.1"
    }
  }
);
```

**Response Structure:**
```json
{
  "@odata.context": "http://tomato.live.vn/odata/$metadata#SaleOnline_Facebook_Comment_Order(orders())",
  "value": [
    {
      "id": "7187801307958042",
      "asuid": "7187801307958042",
      "uid": null,
      "orders": [
        {
          "id": "a8380000-5d40-0015-d026-08de3e07d16d",
          "session": 0,
          "index": 154,
          "code": "#154. 251203856",
          "tags": null
        }
      ]
    },
    {
      "id": "4955854961123235",
      "asuid": "4955854961123235",
      "uid": null,
      "orders": [
        {
          "id": "c2060000-5d17-0015-01ea-08de3f9b8641",
          "session": 1129,
          "index": 769,
          "code": "#769. 251204471",
          "tags": "[{\"Id\":59666,\"Name\":\"CỌC 100K\",\"Color\":\"#5A3E36\"}]"
        }
      ]
    }
  ]
}
```

**Các trường quan trọng:**

| Trường | Mô tả |
|--------|-------|
| `id` / `asuid` | Facebook App-Scoped User ID (dùng để match với comment) |
| `orders[].index` | **Session Index** - Số hiển thị trên badge đỏ |
| `orders[].session` | Session ID của phiên live |
| `orders[].code` | Mã đơn hàng (format: `#index. orderCode`) |
| `orders[].tags` | Tags của đơn hàng (JSON string hoặc null) |

**Code xử lý response:**
```javascript
// Tạo Map để tra cứu nhanh sessionIndex theo asuid
const sessionIndexMap = new Map();

const data = await response.json();
data.value.forEach(item => {
  if (item.orders && item.orders.length > 0) {
    // Lấy index từ order đầu tiên (hoặc order cuối cùng tùy logic)
    const latestOrder = item.orders[item.orders.length - 1];
    sessionIndexMap.set(item.asuid, {
      index: latestOrder.index,
      code: latestOrder.code,
      session: latestOrder.session,
      tags: latestOrder.tags ? JSON.parse(latestOrder.tags) : null
    });
  }
});

// Sử dụng trong component
const getSessionIndex = (userId) => {
  return sessionIndexMap.get(userId)?.index || null;
};
```

---

#### Bước 2: Socket Real-time cập nhật **LIÊN TỤC** khi có đơn mới

> **Lưu ý:** Sau khi đã fetch API ở Bước 1, socket sẽ tự động nhận và cập nhật mỗi khi có đơn hàng mới được tạo.

**Event:** `on-events` với `Type: "SaleOnline_Order"`

**Socket Message Format:**
```
42/chatomni,["on-events","{\"Type\":\"SaleOnline_Order\",\"Message\":\"nvkt: label.create_order_with_code 251204471.\",\"Data\":{...},\"EventName\":\"created\"}"]
```

**Parsed Data Structure:**
```json
{
  "Type": "SaleOnline_Order",
  "Message": "nvkt: label.create_order_with_code 251204471.",
  "Data": {
    "Facebook_PostId": "270136663390370_1624723368895322",
    "Facebook_UserName": "Nguyễn Nhii",
    "Facebook_ASUserId": "4955854961123235",
    "Facebook_PageId": null,
    "Id": "c2060000-5d17-0015-01ea-08de3f9b8641",
    "Code": "251204471",
    "Session": 1129,
    "SessionIndex": 769
  },
  "EventName": "created"
}
```

**Các trường quan trọng:**

| Trường | Mô tả |
|--------|-------|
| `Data.Facebook_ASUserId` | Facebook App-Scoped User ID (key để match) |
| `Data.SessionIndex` | **Session Index mới** - Cập nhật vào badge |
| `Data.Facebook_PostId` | ID của bài post live |
| `Data.Code` | Mã đơn hàng mới |
| `Data.Session` | Session ID |
| `EventName` | `"created"` = đơn mới được tạo |

**Code xử lý socket event:**
```javascript
// Lắng nghe event từ Chat WebSocket hoặc RT WebSocket
socket.on('on-events', (rawData) => {
  const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

  // Kiểm tra nếu là event tạo đơn hàng
  if (data.Type === 'SaleOnline_Order' && data.EventName === 'created') {
    const orderData = data.Data;

    // Cập nhật sessionIndex vào Map
    sessionIndexMap.set(orderData.Facebook_ASUserId, {
      index: orderData.SessionIndex,
      code: orderData.Code,
      session: orderData.Session,
      postId: orderData.Facebook_PostId
    });

    console.log(`📦 New order: ${orderData.Facebook_UserName} - #${orderData.SessionIndex}`);

    // Trigger UI update
    updateCommentBadges();
  }
});
```

---

### Hiển thị Badge trên UI

```javascript
// Component hiển thị comment với sessionIndex badge
const CommentItem = ({ comment, sessionIndexMap }) => {
  const userId = comment.from?.id || comment.Data?.from?.id;
  const sessionData = sessionIndexMap.get(userId);

  return (
    <div className="comment-item">
      <div className="avatar-container">
        <img
          src={getFacebookAvatar(userId)}
          alt={comment.from?.name}
          className="avatar"
        />
        {sessionData && (
          <span className="session-badge">
            {sessionData.index}
          </span>
        )}
      </div>
      <div className="comment-content">
        <strong>{comment.from?.name}</strong>
        <span>{comment.message}</span>
      </div>
    </div>
  );
};
```

**CSS cho badge:**
```css
.avatar-container {
  position: relative;
  display: inline-block;
}

.session-badge {
  position: absolute;
  bottom: -4px;
  left: -4px;
  background-color: #dc2626; /* Đỏ */
  color: white;
  font-size: 11px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
```

---

### Flow tổng hợp

```
┌─────────────────────────────────────────────────────────────────┐
│                     SESSION INDEX FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ══════════════════════════════════════════════════════════     │
│  BƯỚC 1: FETCH API (CHỈ 1 LẦN KHI PAGE LOAD)                   │
│  ══════════════════════════════════════════════════════════     │
│                                                                 │
│  Page Load / F5                                                 │
│      │                                                          │
│      ▼                                                          │
│  ┌───────────────────────────────────────────┐                 │
│  │ GET /odata/SaleOnline_Facebook_Post/      │                 │
│  │     ODataService.GetCommentOrders         │                 │
│  │     ?$expand=orders&PostId={PostId}       │                 │
│  └───────────────────────────────────────────┘                 │
│      │                                                          │
│      ▼                                                          │
│  ┌───────────────────────────────────────────┐                 │
│  │ Response: { value: [                      │                 │
│  │   { asuid: "xxx", orders: [               │                 │
│  │     { index: 584, code: "#584..." }       │                 │
│  │   ]}                                      │                 │
│  │ ]}                                        │                 │
│  └───────────────────────────────────────────┘                 │
│      │                                                          │
│      ▼                                                          │
│  ┌───────────────────────────────────────────┐                 │
│  │ Build sessionIndexMap ban đầu:            │                 │
│  │ Map { asuid → { index, code, ... } }      │                 │
│  └───────────────────────────────────────────┘                 │
│      │                                                          │
│      │  ✅ Xong Bước 1 - Không gọi API nữa                     │
│      │                                                          │
│  ══════════════════════════════════════════════════════════     │
│  BƯỚC 2: SOCKET REAL-TIME (LIÊN TỤC SAU ĐÓ)                    │
│  ══════════════════════════════════════════════════════════     │
│      │                                                          │
│      ▼                                                          │
│  ┌───────────────────────────────────────────┐                 │
│  │ 🔄 Lắng nghe Socket Event: on-events      │ ◄─── Loop       │
│  │    Type: "SaleOnline_Order"               │      liên tục   │
│  │    EventName: "created"                   │                 │
│  └───────────────────────────────────────────┘                 │
│      │                                                          │
│      ▼  (Mỗi khi có đơn mới)                                   │
│  ┌───────────────────────────────────────────┐                 │
│  │ Data: {                                   │                 │
│  │   Facebook_ASUserId: "xxx",               │                 │
│  │   SessionIndex: 769,                      │                 │
│  │   Code: "251204471"                       │                 │
│  │ }                                         │                 │
│  └───────────────────────────────────────────┘                 │
│      │                                                          │
│      ▼                                                          │
│  ┌───────────────────────────────────────────┐                 │
│  │ Update sessionIndexMap với SessionIndex   │                 │
│  │ mới cho Facebook_ASUserId tương ứng       │                 │
│  └───────────────────────────────────────────┘                 │
│      │                                                          │
│      ▼                                                          │
│  ┌───────────────────────────────────────────┐                 │
│  │ 🔴 Badge đỏ hiển thị/cập nhật số mới      │                 │
│  │    trên avatar của khách                  │                 │
│  └───────────────────────────────────────────┘                 │
│      │                                                          │
│      └──────────────────────────────────────────► Tiếp tục     │
│                                                   lắng nghe    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Lưu ý quan trọng

| Lưu ý | Mô tả |
|-------|-------|
| **API chỉ gọi 1 lần** | Fetch `GetCommentOrders` **CHỈ 1 LẦN** khi page load, sau đó socket xử lý hết |
| **Key để match** | Sử dụng `asuid` / `Facebook_ASUserId` để match giữa comment và order |
| **Session vs SessionIndex** | `Session` = ID phiên live, `SessionIndex` = số thứ tự đơn trong phiên |
| **Multiple orders** | Một user có thể có nhiều orders, lấy `index` từ order mới nhất |
| **PostId format** | `{PageId}_{PostId}` - VD: `270136663390370_1624723368895322` |
| **Proxy required** | Phải dùng Cloudflare Worker proxy để bypass CORS |

---

*Tài liệu Live ChatOmni - Cập nhật: 2025-12-20*

