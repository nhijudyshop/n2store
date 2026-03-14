# Pancake Chat - Template Project

Thư mục này chứa **100% source code** của hệ thống Pancake Chat, sẵn sàng để AI agent đọc và hiện thực lại trong project khác.

## Cách sử dụng

1. Copy toàn bộ thư mục `your-project/` vào project mới
2. Cho AI agent đọc các file MD documentation ở thư mục cha (`docs/pancake-chat/PART1-*.md` đến `PART6-*.md`)
3. AI agent đọc source code trong thư mục này để hiểu logic chi tiết
4. Adapt code cho phù hợp với framework/stack của project mới

## Cấu trúc file

```
your-project/
├── README.md                              ← File này
├── js/
│   ├── config/
│   │   └── api-config.js                  ← [FULL] API endpoints & URL builders
│   ├── managers/
│   │   ├── pancake-token-manager.js       ← [FULL] JWT token, multi-account, Firestore
│   │   ├── pancake-data-manager.js        ← [FULL] Fetch pages/conversations/messages
│   │   └── realtime-manager.js            ← [FULL] WebSocket Phoenix protocol
│   └── ui/
│       ├── chat-modal.js                  ← [FULL] Chat modal UI (5600+ lines)
│       └── pancake-settings.js            ← [FULL] Settings modal UI (1122 lines)
├── proxy/
│   ├── cloudflare-worker/
│   │   ├── pancake-handler.js             ← [FULL] 3 proxy handlers
│   │   └── utils/
│   │       ├── cors-utils.js              ← [FULL] CORS headers
│   │       ├── fetch-utils.js             ← [FULL] Retry logic
│   │       └── header-learner.js          ← [FULL] Browser header builder
│   └── render-server/
│       └── pancake.js                     ← [FULL] Express + WS proxy server
└── firebase/
    └── firestore-rules.json               ← Schema & storage keys reference
```

## Tất cả file đều là FULL SOURCE CODE

- `api-config.js` (121 lines) - Copy nguyên từ source
- `pancake-token-manager.js` (1,347 lines) - Copy nguyên từ source
- `pancake-data-manager.js` (2,629 lines) - Copy nguyên từ source
- `realtime-manager.js` (508 lines) - Copy nguyên từ source
- `chat-modal.js` (5,600+ lines) - Copy nguyên từ source (tab1-chat.js)
- `pancake-settings.js` (1,122 lines) - Copy nguyên từ source (tab1-pancake-settings.js)
- `pancake-handler.js` (170 lines) - Copy nguyên từ source
- `pancake.js` (render server) - Template đầy đủ Express + WebSocket server

## Dependencies cần thiết

| Package | Mục đích | File sử dụng |
|---------|----------|---------------|
| Firebase/Firestore SDK | Token storage multi-device | pancake-token-manager.js |
| Cloudflare Worker runtime | CORS proxy | pancake-handler.js |
| express | HTTP server | render-server/pancake.js |
| ws | WebSocket server | render-server/pancake.js |
| node-fetch | HTTP requests on server | render-server/pancake.js |

## Global objects (window.*)

Các file JS đăng ký global objects sau:

| Global | Class/Object | File |
|--------|-------------|------|
| `window.API_CONFIG` | API configuration | api-config.js |
| `window.pancakeTokenManager` | PancakeTokenManager instance | pancake-token-manager.js |
| `window.pancakeDataManager` | PancakeDataManager instance | pancake-data-manager.js |
| `window.realtimeManager` | RealtimeManager instance | realtime-manager.js |
| `window.chatAPISettings` | Chat API settings (external) | Cần implement |
| `window.notificationManager` | Toast notifications (external) | Cần implement |
| `window.authManager` | Auth/permission system (external) | Cần implement |

## Thứ tự khởi tạo

```
1. api-config.js           → window.API_CONFIG
2. pancake-token-manager.js → window.pancakeTokenManager
3. pancake-data-manager.js  → window.pancakeDataManager
4. realtime-manager.js      → window.realtimeManager
5. pancake-settings.js      → UI event handlers
6. chat-modal.js            → UI event handlers
```

## External dependencies cần implement

Các object bên ngoài mà code tham chiếu:

1. **`window.chatAPISettings`** - Quản lý cài đặt API source
   - `.isPancake()` → boolean
   - `.isRealtimeEnabled()` → boolean
   - `.getRealtimeMode()` → 'browser' | 'server' | 'localhost'
   - `.toggle()` → 'pancake' | 'chatomni'
   - `.getDisplayName()` → string
   - `.setRealtimeEnabled(bool)`
   - `.setRealtimeMode(string)`

2. **`window.notificationManager`** - Hiển thị toast notification
   - `.show(message, type)` - type: 'success' | 'error' | 'info' | 'warning'

3. **`window.authManager`** - Kiểm tra quyền user
   - `.hasPermission(level)` → boolean (0 = Admin)

4. **`window.firebase`** - Firebase SDK
   - `.firestore()` → Firestore instance
   - `.database()` → Realtime Database (migration only)

5. **`window.indexedDBStorage`** - IndexedDB wrapper (optional)
   - `.setItem(key, value)` → Promise
   - `.getItem(key)` → Promise
   - `.removeItem(key)` → Promise
   - `.readyPromise` → Promise
