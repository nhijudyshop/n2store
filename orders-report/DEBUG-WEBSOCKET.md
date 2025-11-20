# 🔍 Debug WebSocket Realtime Connection

## ❓ Tại sao không thấy WebSocket trong tab Network?

**TL;DR**: WebSocket code **có tồn tại** nhưng **chưa được bật**. Realtime mode mặc định là **TẮT**.

## 📊 Hiện trạng

Từ logs console, bạn thấy:
```
[CHAT] Using Pancake API for message content
[CHAT] Using Pancake API for comment content
```

**Nghĩa là**: Tất cả data đang được fetch qua **HTTP API** (polling), không phải WebSocket realtime.

## 🎯 WebSocket sẽ xuất hiện khi nào?

WebSocket connection chỉ được tạo khi **TẤT CẢ** điều kiện sau thỏa mãn:
1. ✅ `chatAPISettings.isPancake()` = `true` (đang dùng Pancake API)
2. ✅ `chatAPISettings.isRealtimeEnabled()` = `true` (Realtime được BẬT)
3. ✅ `chatAPISettings.getRealtimeMode()` = `'browser'` (chạy ở browser, không phải server)

## 🛠️ Cách Enable WebSocket - 3 Phương pháp

### **Phương pháp 1: Dùng Debug Tool (Khuyến nghị) ⭐**

1. Mở trang `tab1-orders.html`
2. Mở **DevTools Console** (F12)
3. Bạn sẽ thấy menu:

```
📋 Available Commands:
────────────────────────────────────────────────────────────
window.debugRealtime.checkStatus()       - Check current status
window.debugRealtime.checkStorage()      - Check localStorage
window.debugRealtime.enableBrowser()     - Enable Browser Mode
window.debugRealtime.connect()           - Manually connect WebSocket
window.debugRealtime.watch()             - Watch WebSocket events
window.debugRealtime.disconnect()        - Disconnect WebSocket
============================================================
```

4. **Chạy lệnh này để enable**:
```javascript
window.debugRealtime.enableBrowser()
```

5. **Refresh trang** (F5)

6. **Mở Network tab** → Filter "WS" → Bạn sẽ thấy WebSocket connection đến:
```
wss://pancake.vn/socket/websocket?vsn=2.0.0
```

### **Phương pháp 2: Enable thủ công qua Console**

```javascript
// 1. Check status hiện tại
console.log('Realtime enabled:', localStorage.getItem('chat_realtime_enabled'));
console.log('Realtime mode:', localStorage.getItem('chat_realtime_mode'));

// 2. Enable realtime
window.chatAPISettings.setRealtimeEnabled(true);
window.chatAPISettings.setRealtimeMode('browser');

// 3. Refresh trang
location.reload();
```

### **Phương pháp 3: Enable qua UI (nếu có checkbox)**

1. Tìm checkbox "Realtime" trong giao diện
2. Tick vào để enable
3. Chọn mode = "Browser"
4. Refresh trang

## 🔎 Kiểm tra WebSocket hoạt động

### 1. Trong **Console**:
Bạn sẽ thấy các log:
```
[REALTIME] Connecting...
[REALTIME] WebSocket Connected
[REALTIME] Joining users channel...
[REALTIME] Joining multiple_pages channel...
```

### 2. Trong **Network Tab**:
- Filter: **WS** (WebSocket)
- Bạn sẽ thấy connection:
  - **Name**: `websocket?vsn=2.0.0`
  - **Domain**: `pancake.vn`
  - **Type**: `websocket`
  - **Status**: `101 Switching Protocols`

### 3. Click vào WebSocket connection → **Messages tab**:
Bạn sẽ thấy các messages được send/receive:
```json
// Heartbeat (mỗi 30s)
["1","1","phoenix","heartbeat",{}]

// Join channels
["2","2","users:13e04186-...","phx_join",{...}]
["3","3","multiple_pages:13e04186-...","phx_join",{...}]

// Realtime updates
["","","multiple_pages:...","pages:update_conversation",{...}]
```

## 🐛 Troubleshooting

### Vấn đề 1: Không thấy WebSocket sau khi enable
**Giải pháp**:
```javascript
// Check dependencies
console.log('realtimeManager:', window.realtimeManager);
console.log('pancakeTokenManager:', window.pancakeTokenManager);
console.log('chatAPISettings:', window.chatAPISettings);

// Manually connect
await window.realtimeManager.connect();
```

### Vấn đề 2: WebSocket closed ngay sau khi connect
**Nguyên nhân**: Token hết hạn hoặc không hợp lệ

**Giải pháp**:
```javascript
// Check token
const token = await window.pancakeTokenManager.getToken();
console.log('Token:', token ? 'Available' : 'Missing');

// Get new token
// Vào Pancake.vn → DevTools → Application → Cookies → Copy access_token
await window.pancakeTokenManager.setTokenManual('YOUR_TOKEN_HERE');
```

### Vấn đề 3: WebSocket error
**Giải pháp**:
```javascript
// Watch for errors
window.debugRealtime.watch();

// Check console for error logs
```

## 📈 So sánh HTTP vs WebSocket

### **HTTP Polling (Hiện tại - Realtime OFF)**
```
Browser → Pancake API (mỗi lần fetch)
  ├─ GET /conversations
  ├─ GET /messages
  └─ GET /comments
```
- ❌ Nhiều requests
- ❌ Delay (phải refresh/polling)
- ✅ Đơn giản, dễ debug

### **WebSocket (Khi Realtime ON)**
```
Browser ⟷ wss://pancake.vn (persistent connection)
  ↓ Realtime events
  ├─ pages:update_conversation
  ├─ new_message
  └─ new_comment
```
- ✅ Realtime, instant updates
- ✅ Ít requests hơn
- ❌ Phức tạp hơn để debug

## 🎓 Hiểu sâu hơn về Phoenix WebSocket Protocol

Pancake sử dụng **Phoenix Channels** (Elixir framework).

**Message format**: `[joinRef, ref, topic, event, payload]`

**Ví dụ**:
```javascript
// Join channel
["1", "1", "users:13e04186-...", "phx_join", {
  accessToken: "eyJhbGc...",
  userId: "13e04186-...",
  platform: "web"
}]

// Heartbeat
["2", "2", "phoenix", "heartbeat", {}]

// Receive update
["", "", "multiple_pages:...", "pages:update_conversation", {
  conversation: {
    id: "...",
    snippet: "New message content",
    seen: false,
    ...
  }
}]
```

## 🔗 Tài liệu tham khảo

- Phoenix Channels: https://hexdocs.pm/phoenix/channels.html
- WebSocket Protocol: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

## ✅ Checklist

Để thấy WebSocket trong Network tab:

- [ ] Đã mở DevTools
- [ ] Đã mở tab Network
- [ ] Đã filter "WS" (WebSocket)
- [ ] Đã enable realtime: `window.debugRealtime.enableBrowser()`
- [ ] Đã refresh trang
- [ ] Token Pancake còn hạn
- [ ] Mode = "browser" (không phải "server")

---

**Câu hỏi thường gặp**:

**Q: Tại sao mặc định Realtime = OFF?**
A: Để tiết kiệm tài nguyên và tránh lỗi khi token chưa được setup.

**Q: Nên dùng mode "browser" hay "server"?**
A:
- **Browser**: Realtime chỉ khi browser đang mở. Dễ debug.
- **Server**: Realtime 24/7, nhưng cần deploy server riêng.

**Q: Có thể dùng cả HTTP và WebSocket cùng lúc không?**
A: Code hiện tại chỉ chọn 1 trong 2. Khi Realtime ON → dùng WebSocket. Khi OFF → dùng HTTP API.
