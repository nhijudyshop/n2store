# 📊 TPOS ChatOmni - Phân Tích WebSocket

> **Tài liệu tập trung vào kiến trúc WebSocket real-time cho phần TPOS (bên trái)**

---

## 🎯 Tổng Quan

**Giao diện split-view**:
- **Bên trái**: TPOS (iframe) - Sử dụng ChatOmni WebSocket
- **Bên phải**: Pancake Chat - Xem `PANCAKE_GUIDE.md`

Tài liệu này tập trung vào **TPOS ChatOmni** (bên trái).

---

## 🏗️ Kiến Trúc WebSocket

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                      │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │   Chat WebSocket │  │   RT WebSocket   │             │
│  │ ws.chatomni.tpos │  │  rt-2.tpos.app   │             │
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
│              Proxy API → tomato.tpos.vn                  │
└─────────────────────────────────────────────────────────┘
```

---

## � Chi Tiết WebSocket Servers

### 1. Chat WebSocket (`ws.chatomni.tpos.app`)

| Thuộc tính | Giá trị |
|------------|---------|
| **URL** | `wss://ws.chatomni.tpos.app/chatomni` |
| **Protocol** | Socket.IO |
| **Namespace** | `/chatomni` |
| **Room** | `tomato.tpos.vn` |
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
const chatSocket = io('wss://ws.chatomni.tpos.app/chatomni', {
  transports: ['websocket'],
  query: { room: 'tomato.tpos.vn', EIO: '4' },
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

### 2. RT WebSocket (`rt-2.tpos.app`)

| Thuộc tính | Giá trị |
|------------|---------|
| **URL** | `wss://rt-2.tpos.app/chatomni` |
| **Protocol** | Socket.IO |
| **Namespace** | `/chatomni` |
| **Room** | `tomato.tpos.vn` |
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
const rtSocket = io('wss://rt-2.tpos.app/chatomni', {
  transports: ['websocket'],
  query: { room: 'tomato.tpos.vn', EIO: '4' },
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

Token lấy từ TPOS API qua Cloudflare Worker:
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
| Chat WS | `wss://ws.chatomni.tpos.app/chatomni` | Socket.IO/WSS | Token via emit | Messages real-time |
| RT WS | `wss://rt-2.tpos.app/chatomni` | Socket.IO/WSS | Token via emit | Notifications |

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
curl -I https://ws.chatomni.tpos.app
curl -I https://rt-2.tpos.app
```

---

*Tài liệu TPOS ChatOmni - Cập nhật: 2025-12-19*

