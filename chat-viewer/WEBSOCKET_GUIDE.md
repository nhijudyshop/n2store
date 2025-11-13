# 🔌 Dual WebSocket Quick Reference

## Status Badges in UI

```
┌─────────────────────────────────────┐
│ Tin nhắn    10 cuộc hội thoại       │
│ 🟢 Chat  🟢 RT  ⚡ Realtime         │
└─────────────────────────────────────┘
```

### What They Mean

| Badge | Status | Meaning |
|-------|--------|---------|
| 🟢 Chat | Connected | Chat messages arrive instantly |
| ⚪ Chat | Disconnected | No direct chat connection |
| 🟢 RT | Connected | Notifications arrive instantly |
| ⚪ RT | Disconnected | No RT connection |
| ⚡ Realtime | Active | At least 1 WebSocket connected |
| 🔄 Polling | Fallback | Both WebSockets down, using polling |

---

## Connection States

### State 1: Perfect (Best)
```
🟢 Chat | 🟢 RT | ⚡ Realtime
```
✅ Both WebSockets connected
✅ Instant updates from both sources
✅ Best performance

### State 2: Partial (Good)
```
🟢 Chat | ⚪ RT | ⚡ Realtime
or
⚪ Chat | 🟢 RT | ⚡ Realtime
```
⚠️ One WebSocket connected
✅ Still real-time for connected source
✅ Polling covers the disconnected one

### State 3: Fallback (Acceptable)
```
⚪ Chat | ⚪ RT | 🔄 Polling
```
❌ Both WebSockets disconnected
✅ Polling keeps app functional (10s delay)
🔄 WebSockets trying to reconnect

---

## Console Commands for Testing

Open browser console (F12) and try these:

### Check Connection Status
```javascript
console.log('Chat Socket:', chatSocket?.connected);
console.log('RT Socket:', rtSocket?.connected);
console.log('Chat ID:', chatSocket?.id);
console.log('RT ID:', rtSocket?.id);
```

### Force Disconnect (Testing)
```javascript
// Disconnect chat socket
chatSocket?.disconnect();

// Disconnect RT socket
rtSocket?.disconnect();

// Reconnect
chatSocket?.connect();
rtSocket?.connect();
```

### Monitor All Events
```javascript
// Already enabled! Check console for:
// 📨 [CHAT] New message received
// 🔔 [RT] Notification
// 📡 [RT] Event: update
```

---

## Common Scenarios

### New Message Arrives
```
1. Customer sends message
   ↓
2. [CHAT] WebSocket receives event
   ↓
3. App refreshes conversation list
   ↓
4. You see update instantly (<100ms)
```

### System Notification
```
1. System event occurs
   ↓
2. [RT] WebSocket receives notification
   ↓
3. App refreshes data
   ↓
4. You see update instantly
```

### Both WebSockets Down
```
1. Network issue / Server maintenance
   ↓
2. Both sockets disconnect
   ↓
3. Status shows: 🔄 Polling
   ↓
4. Polling kicks in (10s refresh)
   ↓
5. WebSockets auto-reconnect when available
```

---

## Troubleshooting

### Problem: Only one badge is green
**Status:** Normal! This happens if:
- One server is restarting
- Network partially blocked
- Firewall rules

**Action:** App still works. Wait for reconnection.

### Problem: Both badges are white
**Status:** Fallback mode active
**Check:**
- Network connection OK?
- Firewall blocking WebSockets?
- Corporate proxy?

**Action:** App still functional via polling

### Problem: Constant reconnecting
**Visible:** Badges flickering 🟢⚪🟢⚪
**Cause:** Unstable network

**Action:** 
- Check WiFi signal
- Try wired connection
- App remains usable via polling

---

## Log Patterns to Look For

### Successful Connection
```
✅ [CHAT] WebSocket connected: abc123
✅ [RT] WebSocket connected: xyz789
```

### Receiving Events
```
📨 [CHAT] New message received: {...}
🔔 [RT] Notification: {...}
```

### Reconnection Success
```
🔄 [CHAT] Reconnected after 2 attempts
🔄 [RT] Reconnected after 1 attempts
```

### Expected During Startup
```
🔌 Connecting to WebSocket servers...
✅ [CHAT] WebSocket connected
🔐 [CHAT] Authentication sent
✅ [RT] WebSocket connected
🔐 [RT] Authentication sent
```

---

## Performance Impact

| System | CPU | Memory | Network |
|--------|-----|--------|---------|
| Chat WebSocket | <1% | ~5MB | Events only |
| RT WebSocket | <1% | ~5MB | Events only |
| Polling | <1% | ~2MB | Every 10s |
| **Total** | **<3%** | **~12MB** | **Minimal** |

---

## When to Contact Support

Contact if you see:

❌ Constant errors in console
❌ Both sockets never connect
❌ Polling also failing
❌ Token errors repeated

Otherwise, system is self-healing and will recover automatically!

---

## Quick Actions

### Force Full Refresh
Click the 🔄 button in header

### Toggle Auto-Refresh
Click "Auto ON/OFF" button

### Check Logs
F12 → Console tab

### Check WebSocket
F12 → Network → WS filter

---

**The dual WebSocket system ensures maximum reliability and speed!** 🚀
