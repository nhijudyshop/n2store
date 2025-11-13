# 🔌 Real-time Architecture: WebSocket + Polling

## 📊 Tổng quan

ChatOmni Viewer sử dụng **Dual-Mode System** kết hợp cả WebSocket và Polling để đảm bảo:
- ⚡ **Tốc độ**: WebSocket cho instant updates
- 🛡️ **Độ tin cậy**: Polling là fallback khi WebSocket fail
- 🔄 **Tự động chuyển đổi**: Hệ thống tự động switch giữa 2 modes

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                ChatOmni Viewer                          │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐           │
│  │   WebSocket 1    │  │   WebSocket 2    │           │
│  │   Chat Server    │  │   RT Server      │           │
│  │   (Messages) ⚡   │  │ (Notifications)🔔│           │
│  └──────────────────┘  └──────────────────┘           │
│           │                     │                       │
│           └─────────┬───────────┘                       │
│                     ▼                                   │
│  ┌──────────────────────────────────┐                  │
│  │        Polling (10s)             │                  │
│  │        Fallback 🛡️               │                  │
│  └──────────────────────────────────┘                  │
│                     │                                   │
│                     ▼                                   │
│          Update Messages UI                            │
│                                                         │
│  Status Indicators:                                    │
│  🟢 Chat | 🟢 RT | ⚡ Realtime                         │
│  ⚪ Chat | ⚪ RT | 🔄 Polling                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🔌 WebSocket Implementation

### Connection Details

ChatOmni Viewer connects to **TWO WebSocket servers** simultaneously:

#### 1. Chat Server (Primary)
- **URL**: `wss://ws.chatomni.tpos.app`
- **Purpose**: Chat messages & conversations
- **Namespace**: `/chatomni`
- **Events**: `42/chatomni` (new messages)

#### 2. Real-time Server (Secondary)
- **URL**: `wss://rt-2.tpos.app`
- **Purpose**: Notifications & system updates
- **Events**: `notification`, `update`

### Why Two Servers?

TPOS architecture uses separate servers for:
- **Chat**: Message delivery & conversation updates
- **RT (Real-time)**: System notifications, status changes, live updates

Both work together to provide **complete real-time coverage**!

### Connection Flow

```javascript
1. User logs in with token
   ↓
2. Connect to WebSocket server
   ↓
3. Send authentication
   emit('40/chatomni', { token })
   ↓
4. Listen for messages
   on('42/chatomni', (data) => { ... })
   ↓
5. Auto-refresh UI on new message
```

### Events Handled

#### Chat WebSocket (`wss://ws.chatomni.tpos.app`)

| Event | Description | Action |
|-------|-------------|--------|
| `connect` | Connected to chat server | Set Chat status = 🟢 |
| `disconnect` | Disconnected | Set Chat status = ⚪ |
| `42/chatomni` | New chat message | Refresh conversations & messages |
| `connect_error` | Connection failed | Log error, use polling |
| `reconnect` | Reconnected after failure | Restore chat realtime |

#### RT WebSocket (`wss://rt-2.tpos.app`)

| Event | Description | Action |
|-------|-------------|--------|
| `connect` | Connected to RT server | Set RT status = 🟢 |
| `disconnect` | Disconnected | Set RT status = ⚪ |
| `notification` | System notification | Refresh conversations |
| `update` | Data update | Refresh conversations & messages |
| `connect_error` | Connection failed | Log error, use polling |
| `reconnect` | Reconnected after failure | Restore RT realtime |

#### Any Event Listener
Both sockets listen to ALL events and log them for debugging. Non-ping/pong events trigger UI refresh.

### Reconnection Strategy
- **Auto-reconnect**: Enabled
- **Max attempts**: 5
- **Delay**: 1000ms (1 second)
- **Exponential backoff**: Yes

---

## 🔄 Polling Implementation

### Polling Details
- **Interval**: 10 seconds
- **Trigger**: When `autoRefresh = true`
- **API Calls**:
  - Fetch conversations
  - Fetch messages (if conversation selected)

### Polling Flow

```javascript
Every 10 seconds:
  ├─ Fetch conversations list
  │   └─ Update sidebar with new messages/counts
  │
  └─ If conversation selected:
      └─ Fetch messages
          └─ Update message view
```

### When Polling Runs
✅ Always runs when:
- User enables "Auto ON"
- Even if WebSocket is connected (redundancy)

❌ Stops when:
- User disables "Auto OFF"
- User logs out

---

## 🎯 How All Three Systems Work Together

### Scenario 1: Perfect Operation (All Connected)
```
Chat WebSocket: CONNECTED ✅
RT WebSocket:   CONNECTED ✅
Polling:        RUNNING ✅
Result:         Instant updates from both sources
Status:         🟢 Chat | 🟢 RT | ⚡ Realtime
```
→ New messages appear **instantly** via Chat WebSocket
→ Notifications appear **instantly** via RT WebSocket
→ Polling provides triple-redundancy

### Scenario 2: One WebSocket Down
```
Chat WebSocket: CONNECTED ✅
RT WebSocket:   DISCONNECTED ❌
Polling:        RUNNING ✅
Result:         Messages instant, notifications via polling
Status:         🟢 Chat | ⚪ RT | ⚡ Realtime
```
→ Chat messages still instant
→ System updates via polling

### Scenario 3: Both WebSockets Down
```
Chat WebSocket: DISCONNECTED ❌
RT WebSocket:   DISCONNECTED ❌
Polling:        RUNNING ✅
Result:         All updates via polling (10s delay)
Status:         ⚪ Chat | ⚪ RT | 🔄 Polling
```
→ User still gets all updates
→ WebSockets auto-reconnect in background

### Scenario 4: Network Unstable
```
Chat WebSocket: Reconnecting... 🔄
RT WebSocket:   Reconnecting... 🔄
Polling:        RUNNING ✅
Result:         Continuous updates via polling
Status:         ⚪ Chat | ⚪ RT | 🔄 Polling
```
→ No interruption to user experience
→ Both reconnect when network stable

---

## 📊 Performance Comparison

| Aspect | WebSocket | Polling |
|--------|-----------|---------|
| **Latency** | <100ms | ~10s |
| **Network Usage** | Low (events only) | Medium (regular requests) |
| **Reliability** | Depends on connection | High |
| **CPU Usage** | Very low | Low |
| **Battery Impact** | Minimal | Low |

---

## 🔍 Monitoring & Debugging

### Visual Indicators in UI
The header shows **3 status badges**:

1. **🟢 Chat** / **⚪ Chat** = Chat WebSocket status
2. **🟢 RT** / **⚪ RT** = RT WebSocket status
3. **⚡ Realtime** (yellow) = At least one WebSocket connected
4. **🔄 Polling** (blue) = Both WebSockets disconnected

### Browser Console Logs

```
🔌 Connecting to WebSocket servers...
✅ [CHAT] WebSocket connected: abc123
🔐 [CHAT] Authentication sent
✅ [RT] WebSocket connected: xyz789
🔐 [RT] Authentication sent
📨 [CHAT] New message received: {...}
🔔 [RT] Notification: {...}
📡 [RT] Event: update [...] 
❌ [CHAT] WebSocket disconnected: transport close
🔄 [CHAT] Reconnected after 2 attempts
```

### Log Prefixes
- `[CHAT]` = Chat WebSocket (ws.chatomni.tpos.app)
- `[RT]` = Real-time WebSocket (rt-2.tpos.app)
- No prefix = General app logs

### Debug Mode
Open browser console (F12) to see:
- Connection status changes
- Message events
- API call logs
- Errors and reconnection attempts

---

## ⚙️ Configuration

### Disable WebSocket (Polling Only)
Comment out WebSocket useEffect in `chat-viewer.html`:
```javascript
// useEffect(() => {
//     if (!isAuthenticated || !token) return;
//     ... WebSocket code ...
// }, [isAuthenticated, token]);
```

### Disable Polling (WebSocket Only)
Set `autoRefresh = false` by default:
```javascript
const [autoRefresh, setAutoRefresh] = useState(false);
```

### Change Polling Interval
Edit timeout in polling useEffect:
```javascript
setInterval(() => {
    // ...
}, 5000); // 5 seconds instead of 10
```

---

## 🚀 Benefits of Dual-Mode

### 1. **Instant Updates** 
WebSocket delivers messages in real-time (<100ms)

### 2. **Reliability**
If WebSocket fails, polling ensures you never miss messages

### 3. **Network Resilience**
Works even on unstable connections (3G, weak WiFi)

### 4. **Zero Configuration**
Automatically uses best available method

### 5. **Transparent to User**
User doesn't need to know which mode is active

---

## 🔒 Security Considerations

### WebSocket Security
- ✅ Uses `wss://` (secure WebSocket)
- ✅ Token authentication
- ✅ Server validates all messages

### Polling Security
- ✅ Uses `https://` (secure HTTP)
- ✅ Bearer token in headers
- ✅ CORS proxy validates requests

---

## 📈 Future Improvements

Potential enhancements:
- [ ] Binary message support (files, voice)
- [ ] Typing indicators
- [ ] Read receipts (seen status)
- [ ] Message reactions
- [ ] Push notifications (service worker)
- [ ] Offline message queue
- [ ] Message search across all conversations

---

## 🆘 Troubleshooting

### WebSocket won't connect
**Check:**
- Network firewall blocking WebSocket?
- Corporate proxy blocking wss://?
- Token is valid?

**Solution:**
- System still works via polling
- Contact network admin to allow wss://ws.chatomni.tpos.app

### Polling too slow
**Check:**
- Auto-refresh enabled?
- Network speed?

**Solution:**
- Use manual refresh button (🔄)
- Wait for WebSocket to reconnect

### Both not working
**Check:**
- Server running? (`npm start`)
- Token expired?
- API endpoints changed?

**Solution:**
- Check browser console for errors
- Get new token
- Check README for updates

---

## 📚 Technical References

- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [WebSocket RFC 6455](https://tools.ietf.org/html/rfc6455)
- [Polling vs WebSocket](https://ably.com/topic/websockets-vs-polling)

---

**This dual-mode architecture ensures ChatOmni Viewer works reliably in all conditions!** 🎉
