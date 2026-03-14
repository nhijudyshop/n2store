# PANCAKE CHAT - DOCUMENTATION TOÀN BỘ

Documentation chi tiết 100% để hiện thực lại toàn bộ phần Pancake Chat ở nơi khác.

---

## Mục lục

| File | Nội dung | Mô tả |
|------|----------|-------|
| [PART1-TOKEN-MANAGER.md](PART1-TOKEN-MANAGER.md) | Token Manager | JWT token, multi-account, page access tokens, Firestore schema |
| [PART2-DATA-MANAGER.md](PART2-DATA-MANAGER.md) | Data Manager | Request queue, fetch pages/conversations/messages, search, upload, mark read |
| [PART3-CHAT-MODAL.md](PART3-CHAT-MODAL.md) | Chat Modal UI | Mở/đóng modal, hiển thị tin nhắn, chuyển page, upload ảnh, mark read/unread |
| [PART4-SETTINGS-UI.md](PART4-SETTINGS-UI.md) | Settings UI | Quản lý accounts, page tokens, API source toggle, realtime toggle, tags |
| [PART5-REALTIME-MANAGER.md](PART5-REALTIME-MANAGER.md) | Realtime WebSocket | Phoenix protocol, browser/server mode, auto-reconnect, event handling |
| [PART6-API-CONFIG-CLOUDFLARE.md](PART6-API-CONFIG-CLOUDFLARE.md) | API & Proxy | URL builders, Cloudflare Worker handlers, CORS, retry, complete API reference |

---

## Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Frontend)                        │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Token Manager │  │ Data Manager │  │    Chat Modal UI     │   │
│  │              │  │              │  │                      │   │
│  │ • JWT tokens │  │ • Pages      │  │ • Message list       │   │
│  │ • Page tokens│  │ • Convs      │  │ • Comment list       │   │
│  │ • Multi-acct │  │ • Messages   │  │ • Page selector      │   │
│  │ • Firestore  │  │ • Search     │  │ • Send message       │   │
│  │ • localStorage│ │ • Upload     │  │ • Image upload       │   │
│  └──────┬───────┘  │ • Mark read  │  │ • Mark read/unread   │   │
│         │          └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐  │
│  │                    API_CONFIG (URL Builders)                │  │
│  │  • buildUrl.pancake()        → /api/pancake/*              │  │
│  │  • buildUrl.pancakeOfficial() → /api/pancake-official/*    │  │
│  │  • buildUrl.pancakeDirect()  → /api/pancake-direct/*       │  │
│  └────────────────────────────┬───────────────────────────────┘  │
│                               │                                   │
│  ┌────────────────────────────┴───────────────────────────────┐  │
│  │              Realtime Manager (WebSocket)                   │  │
│  │  • Browser mode: Direct WS to Pancake                      │  │
│  │  • Server mode: Via Render proxy                           │  │
│  └────────────────────────────┬───────────────────────────────┘  │
└───────────────────────────────┼───────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │  Cloudflare Worker     │
                    │  (CORS Proxy)          │
                    │                        │
                    │  /api/pancake/*        │───→ pancake.vn/api/v1/*
                    │  /api/pancake-official/*│───→ pages.fm/api/public_api/v1/*
                    │  /api/pancake-direct/* │───→ pancake.vn/api/v1/* (custom headers)
                    └───────────┬───────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                   │
    ┌─────────┴──────┐  ┌──────┴───────┐  ┌───────┴────────┐
    │  Pancake.vn    │  │  Pages.fm    │  │  Render.com    │
    │  Internal API  │  │  Official API│  │  WS Proxy      │
    │                │  │              │  │  (24/7)        │
    │  JWT auth      │  │  page_token  │  │                │
    │                │  │  auth        │  │                │
    └────────────────┘  └──────────────┘  └────────────────┘
```

---

## Database Schema (Firestore)

```
Firestore: /pancake_tokens/
├── accounts
│   └── data: {
│       [uid]: { token, exp, uid, name, savedAt }
│   }
└── page_access_tokens
    └── data: {
        [pageId]: { token, pageId, pageName, savedAt }
    }
```

---

## localStorage Keys

| Key | Data | TTL |
|-----|------|-----|
| `pancake_jwt_token` | JWT token string | Until expired |
| `pancake_jwt_token_expiry` | Token expiry timestamp | - |
| `tpos_pancake_active_account_id` | Active account ID (per-device) | - |
| `pancake_page_access_tokens` | JSON: {pageId: tokenData} | Never expires |
| `pancake_all_accounts` | JSON: {accountId: accountData} | - |
| `tpos_pancake_pages_cache` | JSON: {pages, pageIds, timestamp} | 30 min |
| `tagSettingsCustomData` | JSON: {tagId: "note"} | - |

---

## sessionStorage Keys

| Key | Data | TTL |
|-----|------|-----|
| `pancake_conversations_cache` | JSON: {conversations, lastFetchTime, timestamp} | 5 min |

---

## File Structure cho Re-implementation

```
your-project/
├── js/
│   ├── managers/
│   │   ├── pancake-token-manager.js    ← PART 1
│   │   ├── pancake-data-manager.js     ← PART 2
│   │   └── realtime-manager.js         ← PART 5
│   ├── ui/
│   │   ├── chat-modal.js              ← PART 3
│   │   └── pancake-settings.js        ← PART 4
│   └── config/
│       └── api-config.js              ← PART 6
├── proxy/
│   ├── cloudflare-worker/
│   │   └── pancake-handler.js          ← PART 6
│   └── render-server/
│       └── pancake.js                  ← PART 5 & 6
└── firebase/
    └── firestore-rules.json            ← PART 1
```

---

## Dependencies

| Dependency | Purpose | Required? |
|-----------|---------|-----------|
| Firebase/Firestore | Token storage (multi-device sync) | Optional (localStorage works alone) |
| Cloudflare Worker | CORS proxy | **Required** |
| Render.com Server | 24/7 WebSocket proxy | Optional (browser mode works alone) |
| FontAwesome | Icons | Cosmetic |

---

## Quick Start (Thứ tự hiện thực)

1. **api-config.js** - Setup URL builders và Cloudflare Worker proxy
2. **pancake-token-manager.js** - Token management (có thể test độc lập)
3. **pancake-data-manager.js** - Data fetching (cần token manager)
4. **chat-modal.js** - UI hiển thị tin nhắn (cần data manager)
5. **pancake-settings.js** - UI quản lý accounts/tokens
6. **realtime-manager.js** - WebSocket updates (optional, thêm sau)
