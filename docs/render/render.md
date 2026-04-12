# Render.com — N2Store API Server

> Deploy: Render.com (Singapore region)
> Entry: `render.com/server.js`
> Services: `n2store-fallback` (`srv-d4e5pd3gk3sc73bgv600`), `n2store-tpos-pancake`

---

## Table of Contents

- [Tổng quan kiến trúc](#tổng-quan-kiến-trúc)
- [Middleware Stack](#middleware-stack)
- [Database](#database)
- [Environment Variables](#environment-variables)
- [Endpoints](#endpoints)
  - [Core / Health](#core--health)
  - [Auth & Token](#auth--token)
  - [TPOS Proxy](#tpos-proxy)
  - [Facebook Routes](#facebook-routes)
  - [Pancake Proxy](#pancake-proxy)
  - [Cloudflare Backup Routes](#cloudflare-backup-routes)
  - [Realtime — WebSocket & SSE](#realtime--websocket--sse)
  - [Realtime KV Store](#realtime-kv-store)
  - [TPOS Order Buffer & Log](#tpos-order-buffer--log)
  - [TPOS Extension Events](#tpos-extension-events)
  - [TPOS Credentials & Saved Customers](#tpos-credentials--saved-customers)
  - [SePay — Webhook, Balance, Transactions](#sepay--webhook-balance-transactions)
  - [API V2 — Customer 360°](#api-v2--customer-360)
  - [API V2 — Wallets](#api-v2--wallets)
  - [API V2 — Tickets](#api-v2--tickets)
  - [API V2 — Balance History](#api-v2--balance-history)
  - [API V2 — Analytics](#api-v2--analytics)
  - [API V2 — Kho Đi Chợ (Warehouse)](#api-v2--kho-đi-chợ-warehouse)
  - [API V2 — Pending Withdrawals](#api-v2--pending-withdrawals)
  - [Invoice Status](#invoice-status)
  - [Invoice NJD Mapping](#invoice-njd-mapping)
  - [Social Orders](#social-orders)
  - [Return Orders](#return-orders)
  - [Quick Replies](#quick-replies)
  - [Campaigns](#campaigns)
  - [Users & Auth (2FA)](#users--auth-2fa)
  - [Attendance (Chấm công)](#attendance-chấm-công)
  - [ADMS — ZKTeco Machine Protocol](#adms--zkteco-machine-protocol)
  - [Facebook Ads](#facebook-ads)
  - [Pancake Accounts](#pancake-accounts)
  - [FB Global ID Cache](#fb-global-id-cache)
  - [AI Proxies](#ai-proxies)
  - [AutoFB.pro](#autofbpro)
  - [Goong Maps](#goong-maps)
  - [Telegram Bot](#telegram-bot)
  - [Upload (Firebase Storage)](#upload-firebase-storage)
  - [Hang QQ (Hàng Hương Châu)](#hang-qq-hàng-hương-châu)
  - [Quy Trình](#quy-trình)
  - [Admin Routes](#admin-routes)
- [WebSocket Server (Frontend)](#websocket-server-frontend)
- [WebSocket Clients (Server-side)](#websocket-clients-server-side)
- [SSE Channels](#sse-channels)
- [Cron Jobs](#cron-jobs)
- [External Integrations](#external-integrations)
- [Key Services](#key-services)
- [Key Data Structures](#key-data-structures)
- [Key Files](#key-files)
- [Ghi chú phát triển](#ghi-chú-phát-triển)

---

## Tổng quan kiến trúc

Server Express.js đóng vai trò **backend chính** cho toàn bộ N2Store. Ba tầng:

1. **Proxy tầng** — Chuyển tiếp request đến TPOS, Pancake, Facebook, Gemini, DeepSeek, Goong
2. **Business logic tầng** — Customer 360, ví điện tử, ticket, chấm công, kho hàng
3. **Realtime tầng** — WebSocket client (Pancake/TPOS) → broadcast lại qua WebSocket server + SSE

**Stack**: Node.js ≥18, Express 4.x, PostgreSQL (pg pool), Firebase Admin SDK, WebSocket (ws), Socket.IO client, node-cron

```
render.com/
├── server.js                    # Entry point + middleware + WS + route mounting
├── cron/
│   └── scheduler.js             # Tất cả scheduled tasks
├── middleware/
│   └── auth.js                  # JWT verify, requireUserMgmt
├── routes/
│   ├── v2/
│   │   ├── index.js             # V2 router hub
│   │   ├── customers.js         # Customer 360° CRUD + RFM
│   │   ├── wallets.js           # Wallet FIFO operations
│   │   ├── tickets.js           # Ticket system
│   │   ├── balance-history.js   # Bank ↔ customer linking
│   │   ├── analytics.js         # Dashboard + RFM segments
│   │   ├── kho-di-cho.js        # Warehouse: hold → confirm → return
│   │   └── pending-withdrawals.js
│   ├── sepay-webhook-core.js    # SePay webhook handler chính
│   ├── sepay-transaction-matching.js  # Phone extraction, TPOS search
│   ├── sepay-*.js               # SePay sub-routes (history, stats, gaps...)
│   ├── realtime-sse.js          # SSE engine (thay thế Firebase)
│   ├── realtime-kv.js           # KV store (thay thế Firebase RTDB)
│   ├── realtime.js              # WS client management + message buffer
│   ├── tpos-realtime-client.js  # TPOS Socket.IO WS client
│   ├── users.js                 # User management + TOTP 2FA
│   ├── adms.js                  # ZKTeco ADMS protocol
│   ├── attendance.js            # Chấm công + payroll
│   ├── fb-ads.js                # Facebook Ads API
│   ├── autofb.js                # autofb.pro captcha solving
│   ├── telegram-bot.js          # Telegram bot + Gemini AI
│   ├── upload.js                # Firebase Storage upload
│   ├── invoice-status.js        # Thay thế Firestore
│   ├── invoice-mapping.js       # NJD↔Order mapping
│   ├── social-orders.js         # Đơn inbox
│   ├── return-orders.js         # Đơn trả
│   ├── campaigns.js             # Campaign management
│   ├── quick-replies.js         # Mẫu tin nhắn nhanh
│   ├── hang-qq.js               # Hàng Hương Châu
│   ├── pancake-accounts.js      # Pancake accounts
│   ├── fb-global-id.js          # FB PSID → Global ID cache
│   └── admin-*.js               # Admin routes (firebase, render, migrate)
├── services/
│   ├── tpos-token-manager.js    # Auto-fetch + cache TPOS token
│   ├── wallet-event-processor.js # Atomic wallet: DEPOSIT/WITHDRAW/VIRTUAL_CREDIT
│   ├── customer-creation-service.js  # Tìm/tạo customer từ TPOS
│   ├── tpos-customer-service.js  # Search customer TPOS API
│   ├── sync-tpos-products.js    # Full/incremental sync → kho_di_cho
│   ├── tpos-socket-listener.js  # Socket.IO listener product events
│   ├── pancake-alert-service.js # Alerts qua Telegram
│   ├── firebase-storage-service.js  # Firebase Storage singleton
│   ├── auth-token-store.js      # Multi-provider token cache (PostgreSQL)
│   ├── admin-settings-service.js # Settings table
│   └── audit-service.js         # Audit logging
├── db/
│   └── schema.sql               # Schema ban đầu
├── migrations/                  # 40+ migration files
└── public/                      # Static files
```

---

## Middleware Stack

| Middleware | Config |
|---|---|
| **CORS** | Origins: `nhijudyshop.github.io`, `localhost:5500`, `localhost:3000` |
| **Body parser** | JSON limit **100MB** (import 80k+ customer records) |
| **Static files** | Serve từ `public/` |
| **Request logger** | Log mọi request + timestamp |
| **Auth** | JWT verify (`middleware/auth.js`), `requireUserMgmt` cho user management |
| **requireApiKey** | Header `X-API-Key` match `CLIENT_API_KEY` env var |

---

## Database

### PostgreSQL (`chatDbPool`)
- Connection: `DATABASE_URL` env var
- Pool: max 20, idle 30s, connect 10s
- SSL enabled production (`rejectUnauthorized: false`)
- **Timezone fix**: OID 1114 (TIMESTAMP WITHOUT TIMEZONE) parse thêm `+07:00` cho giờ VN
- Access trong routes: `app.locals.chatDb`

### Firebase
- Project: `n2shop-69e37`
- Firestore + Storage + Realtime Database
- Admin SDK initialized trong routes cần thiết

---

## Environment Variables

| Tên | Mục đích |
|---|---|
| `PORT` | Server port (default 3000) |
| `NODE_ENV` | production / development |
| `DATABASE_URL` | PostgreSQL connection string |
| `FIREBASE_PROJECT_ID` | `n2shop-69e37` |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account private key |
| `JWT_SECRET` | JWT signing (default `n2store-jwt-secret-2026`) |
| `CLIENT_API_KEY` | Internal auth cho token cache endpoint |
| `TPOS_USERNAME` / `TPOS_PASSWORD` | TPOS auto-fetch token |
| `TPOS_CLIENT_ID` | Client ID (default `tmtWebApp`) |
| `TPOS_BASE_URL` | Default `https://tomato.tpos.vn` |
| `FACEBOOK_TOKEN` | Fallback Facebook/TPOS token |
| `SEPAY_API_KEY` | SePay webhook verification |
| `SEPAY_ACCOUNT_NUMBER` | Số TK ngân hàng (default `5354IBT1`) |
| `GEMINI_API_KEY` | Google Gemini AI |
| `DEEPSEEK_API_KEY` | DeepSeek AI |
| `TELEGRAM_BOT_TOKEN` | Telegram bot |
| `TELEGRAM_ALERT_CHAT_ID` | Chat ID nhận alerts |
| `GOONG_API_KEY` | Goong.io maps |
| `RENDER_API_KEY` | Render.com management API |
| `FB_APP_ID` / `FB_APP_SECRET` | Facebook App (Ads API) |
| `AUTOFB_API_KEY` / `AUTOFB_USERNAME` / `AUTOFB_PASSWORD` | autofb.pro |
| `GOOGLE_CLOUD_VISION_API_KEY` | Google Cloud Vision |
| `CLEANUP_SECRET` | Secret cho social-orders cleanup |

---

## Endpoints

### Core / Health

| Method | URL | Mô tả |
|---|---|---|
| GET | `/` | Server info + endpoint directory |
| GET | `/health` | DB ping + uptime |
| GET | `/api/debug/time` | Server time (timezone debug) |

### Auth & Token

| Method | URL | Mô tả |
|---|---|---|
| POST | `/api/token` | TPOS OAuth token, cache in-memory 5 phút buffer |
| GET | `/api/auth/token/:provider` | Multi-provider token cache (`X-API-Key` required) |
| POST | `/api/auth/token/:provider/invalidate` | Invalidate cached token |

### TPOS Proxy

| Method | URL | Mô tả |
|---|---|---|
| ALL | `/api/odata/*` | Proxy → `https://services.tpos.dev/api/odata/*` |

### Facebook Routes

| Method | URL | Mô tả |
|---|---|---|
| GET | `/facebook/crm-teams` | CRM Teams từ TPOS |
| GET | `/facebook/live-campaigns` | Live Campaigns từ TPOS |

### Pancake Proxy

| Method | URL | Mô tả |
|---|---|---|
| ALL | `/api/pancake/*` | Proxy → `https://pancake.vn/api/v1/*` |

### Cloudflare Backup Routes

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/fb-avatar` | Avatar proxy (Pancake → FB Graph fallback) |
| GET | `/api/pancake-avatar` | Pancake content avatar |
| GET | `/api/proxy` | Generic proxy |
| GET | `/api/image-proxy` | Image proxy CORS bypass |
| ALL | `/api/pancake-direct/*` | Pancake 24h bypass |
| ALL | `/api/pancake-official/*` | pages.fm Public API |
| POST | `/api/facebook-send` | Gửi message Facebook + tag |
| ALL | `/api/rest/*` | TPOS REST API v2.0 proxy |

### Realtime — WebSocket & SSE

| Method | URL | Mô tả |
|---|---|---|
| POST | `/api/realtime/start` | Khởi động Pancake WS client (save credentials DB) |
| POST | `/api/realtime/stop` | Dừng Pancake WS (disable auto-reconnect) |
| GET | `/api/realtime/status` | Status Pancake WS |
| GET | `/api/realtime/credentials/pancake` | Pancake credentials từ DB |
| POST | `/api/realtime/tpos/start` | Khởi động TPOS WS |
| POST | `/api/realtime/tpos/stop` | Dừng TPOS WS |
| GET | `/api/realtime/tpos/status` | Status TPOS WS |
| GET | `/api/realtime/new-messages` | Messages mới từ timestamp |
| GET | `/api/realtime/summary` | Summary count |
| POST | `/api/realtime/mark-seen` | Mark seen |
| DELETE | `/api/realtime/cleanup` | Cleanup cũ |
| GET | `/api/realtime/sse?keys=key1,key2` | **SSE subscribe** realtime updates |
| GET | `/api/realtime/sse/stats` | Connection statistics |

### Realtime KV Store

Thay thế Firebase Realtime Database:

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/realtime/kv/:key` | Đọc value |
| PUT | `/api/realtime/kv/:key` | Ghi value |
| DELETE | `/api/realtime/kv/:key` | Xóa key |
| GET | `/api/realtime/kv` | List all keys |

### TPOS Order Buffer & Log

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/tpos/order-buffer/since` | Poll orders mới từ timestamp |
| DELETE | `/api/tpos/order-buffer/cleanup` | Cleanup |
| POST | `/api/tpos-log/start` | Bắt đầu log TPOS events (default 10 phút) |
| POST | `/api/tpos-log/stop` | Dừng log |
| GET | `/api/tpos-log/summary` | Summary |
| GET | `/api/tpos-log/events` | List events (filter by type) |
| GET | `/api/tpos-log/all` | Tất cả events |

### TPOS Extension Events

| Method | URL | Mô tả |
|---|---|---|
| POST | `/api/tpos-events/broadcast` | Chrome Extension gửi event → broadcast WS clients |

### TPOS Credentials & Saved Customers

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/tpos-credentials` | Lấy credentials theo username + company_id |
| POST | `/api/tpos-credentials` | Lưu credentials |
| GET | `/api/tpos-saved` | List saved customers |
| POST | `/api/tpos-saved` | Lưu customer |
| DELETE | `/api/tpos-saved/:id` | Xóa |

### SePay — Webhook, Balance, Transactions

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/sepay/ping` | Health check |
| POST | `/api/sepay/webhook` | Nhận webhook SePay (ngân hàng gửi tiền) |
| GET | `/api/sepay/stream` | SSE stream balance updates |
| GET | `/api/sepay/history` | Lịch sử giao dịch |
| GET | `/api/sepay/history/stats` | Thống kê |
| GET | `/api/sepay/statistics` | Chi tiết statistics |
| GET | `/api/sepay/recent-transfers` | Phones đã chuyển gần đây |
| POST | `/api/sepay/recent-transfers` | Thêm phone |
| GET | `/api/sepay/failed-queue` | Queue webhook lỗi |
| POST | `/api/sepay/failed-queue/:id/retry` | Retry một webhook |
| POST | `/api/sepay/failed-queue/retry-all` | Retry tất cả |
| GET | `/api/sepay/gaps` | Phát hiện gaps sequence |
| POST | `/api/sepay/gaps/:referenceCode/ignore` | Ignore gap |
| POST | `/api/sepay/fetch-by-reference/:referenceCode` | Fetch by reference |
| GET | `/api/sepay/account-status` | SePay account status |
| GET | `/api/sepay/debt-summary` | Debt summary |
| POST | `/api/sepay/debt-summary-batch` | Batch debt summary |
| GET | `/api/sepay/debt/:phone` | Debt theo phone |
| GET | `/api/sepay/pending-matches` | Pending transaction-customer matches |
| POST | `/api/sepay/pending-matches/:id/resolve` | Resolve match |
| PUT | `/api/sepay/pending-matches/:id/customers` | Update customers |
| POST | `/api/sepay/pending-matches/:id/skip` | Skip match |
| POST | `/api/sepay/pending-matches/:id/undo-skip` | Undo skip |
| POST | `/api/sepay/batch-update-phones` | Batch update phones |
| GET | `/api/sepay/tpos/customer/:phone` | Search TPOS customer |
| GET | `/api/sepay/tpos/search/:partialPhone` | Tìm TPOS partial phone |
| GET | `/api/sepay/customer-info/:uniqueCode` | Customer info by code |
| POST | `/api/sepay/customer-info` | Lưu customer info |
| POST | `/api/sepay/customer-info/update-snapshot` | Update snapshot |
| GET | `/api/sepay/transfer-stats` | Transfer statistics |
| GET | `/api/sepay/aliases` | List aliases |
| POST | `/api/sepay/aliases` | Tạo alias |
| GET | `/api/sepay/phone-data` | Phone data |
| PATCH | `/api/sepay/transaction/:id/phone` | Update phone |
| PATCH | `/api/sepay/transaction/:id/hidden` | Hide/unhide |

### API V2 — Customer 360°

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/v2/customers` | List (paged, filtered) |
| GET | `/api/v2/customers/stats` | Thống kê |
| GET | `/api/v2/customers/duplicates` | SĐT trùng |
| GET | `/api/v2/customers/recent` | Hoạt động gần đây |
| POST | `/api/v2/customers/search` | Tìm kiếm |
| POST | `/api/v2/customers/batch` | Batch lookup |
| POST | `/api/v2/customers/import` | Import hàng loạt (upsert) |
| POST | `/api/v2/customers` | Tạo mới |
| GET | `/api/v2/customers/:id` | 360° view |
| GET | `/api/v2/customers/:id/quick-view` | Quick info modal |
| GET | `/api/v2/customers/:id/activity` | Timeline hoạt động |
| GET | `/api/v2/customers/:id/rfm` | RFM analysis |
| GET | `/api/v2/customers/:id/transactions` | Consolidated transactions |
| PATCH | `/api/v2/customers/:id` | Cập nhật |
| DELETE | `/api/v2/customers/:id` | Xóa |
| POST | `/api/v2/customers/:id/notes` | Thêm ghi chú |

### API V2 — Wallets

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/v2/wallets/:phone/available-balance` | Balance trừ pending |
| GET | `/api/v2/wallets/:customerId` | Wallet summary |
| POST | `/api/v2/wallets/:customerId/deposit` | Nạp tiền thật |
| POST | `/api/v2/wallets/:customerId/credit` | Cấp virtual credit |
| POST | `/api/v2/wallets/:customerId/withdraw` | Rút tiền (FIFO) |
| GET | `/api/v2/wallets/:customerId/transactions` | Lịch sử |
| POST | `/api/v2/wallets/batch-summary` | Batch lookup |

### API V2 — Tickets

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/v2/tickets` | List (paged, filtered) |
| GET | `/api/v2/tickets/stats` | Thống kê |
| GET | `/api/v2/tickets/:id` | Chi tiết |
| POST | `/api/v2/tickets` | Tạo mới |
| PATCH | `/api/v2/tickets/:id` | Cập nhật |
| POST | `/api/v2/tickets/:id/notes` | Thêm ghi chú |
| POST | `/api/v2/tickets/:id/resolve` | Giải quyết + bồi thường |
| DELETE | `/api/v2/tickets/:id` | Xóa |

### API V2 — Balance History

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/v2/balance-history` | Giao dịch ngân hàng chưa link |
| GET | `/api/v2/balance-history/pending` | Pending matches |
| POST | `/api/v2/balance-history/:id/link` | Link giao dịch ↔ customer |

### API V2 — Analytics

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/v2/analytics/dashboard` | Dashboard tổng quan |
| GET | `/api/v2/analytics/rfm-segments` | RFM segments |
| GET | `/api/v2/analytics/ticket-metrics` | Ticket metrics |
| GET | `/api/v2/analytics/wallet-summary` | Wallet statistics |
| GET | `/api/v2/analytics/daily-summary` | Daily summary |
| GET | `/api/v2/analytics/activity-feed` | Activity feed |
| POST | `/api/v2/analytics/rfm/recalculate` | Tính lại RFM scores |

### API V2 — Kho Đi Chợ (Warehouse)

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/v2/kho-di-cho` | List products + available_qty |
| POST | `/api/v2/kho-di-cho/batch` | Batch upsert từ purchase orders |
| POST | `/api/v2/kho-di-cho/subtract` | Trừ sau đối soát |
| PATCH | `/api/v2/kho-di-cho/:id` | Cập nhật product |
| DELETE | `/api/v2/kho-di-cho/:id` | Xóa product |
| DELETE | `/api/v2/kho-di-cho` | Clear toàn bộ |
| POST | `/api/v2/kho-di-cho/hold` | Giữ cho order |
| DELETE | `/api/v2/kho-di-cho/hold/:orderId/:productCode/:userId` | Release hold |
| GET | `/api/v2/kho-di-cho/holders/:productCode` | Ai đang hold |
| POST | `/api/v2/kho-di-cho/confirm-sale` | Xác nhận bán (held → trừ kho) |
| POST | `/api/v2/kho-di-cho/return` | Trả hàng về kho |
| GET | `/api/v2/kho-di-cho/sales` | Lịch sử bán |

### API V2 — Pending Withdrawals

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/v2/pending-withdrawals` | List pending |
| POST | `/api/v2/pending-withdrawals/:id/process` | Process withdrawal |

### Invoice Status

Firebase replacement (PostgreSQL):

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/invoice-status/load` | Load toàn bộ entries |
| POST | `/api/invoice-status/entries` | Upsert entry |
| DELETE | `/api/invoice-status/entries/:id` | Xóa |
| POST | `/api/invoice-status/sent-bills` | Mark đã gửi bill |
| DELETE | `/api/invoice-status/sent-bills/:id` | Unmark |
| GET | `/api/invoice-status/stats` | Thống kê |

### Invoice NJD Mapping

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/invoice-mapping/lookup/:saleOnlineId` | Tìm NJD numbers |
| POST | `/api/invoice-mapping/lookup-batch` | Batch lookup |
| POST | `/api/invoice-mapping/save` | Lưu mapping |

### Social Orders

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/social-orders` | List orders |
| POST | `/api/social-orders` | Tạo |
| GET/PUT/DELETE | `/api/social-orders/:id` | CRUD |
| GET/POST/PUT/DELETE | `/api/social-orders/tags/*` | Tag management |

### Return Orders

| Method | URL | Mô tả |
|---|---|---|
| GET/POST | `/api/return-orders` | List / Tạo |
| GET/PUT/DELETE | `/api/return-orders/:id` | CRUD |

### Quick Replies

| Method | URL | Mô tả |
|---|---|---|
| GET/POST | `/api/quick-replies` | List / Tạo |
| PUT/DELETE | `/api/quick-replies/:id` | Update / Xóa |

### Campaigns

| Method | URL | Mô tả |
|---|---|---|
| GET/POST | `/api/campaigns` | List / Tạo |
| GET/PUT/DELETE | `/api/campaigns/:id` | CRUD |
| GET/PUT | `/api/campaigns/preferences/:userId` | User preferences |
| GET/POST | `/api/campaigns/reports/*` | Reports |
| GET/PUT | `/api/campaigns/employee-ranges/*` | Employee ranges |

### Users & Auth (2FA)

| Method | URL | Mô tả |
|---|---|---|
| POST | `/api/users/login` | Login → JWT 8h hoặc 30d |
| POST | `/api/users/register` | Tạo user |
| GET | `/api/users` | List (verifyToken) |
| GET | `/api/users/:username` | Chi tiết |
| PATCH | `/api/users/:username` | Cập nhật (verifyToken + requireUserMgmt) |
| DELETE | `/api/users/:username` | Xóa |
| POST | `/api/users/:username/2fa/setup` | Setup TOTP 2FA |
| POST | `/api/users/:username/2fa/verify` | Verify + kích hoạt |
| POST | `/api/users/:username/2fa/disable` | Tắt 2FA |

### Attendance (Chấm công)

| Method | URL | Mô tả |
|---|---|---|
| GET/POST | `/api/attendance/users` | Device users |
| DELETE | `/api/attendance/users/:userId` | Xóa user |
| GET/POST | `/api/attendance/records` | Attendance records |
| DELETE | `/api/attendance/records/:id` | Xóa record |
| GET | `/api/attendance/payroll/:monthKey` | Bảng lương tháng |
| PUT | `/api/attendance/payroll/:empId/:monthKey` | Lưu payroll |
| GET | `/api/attendance/export/:monthKey` | Export |

### ADMS — ZKTeco Machine Protocol

| Method | URL | Mô tả |
|---|---|---|
| GET | `/iclock/cdata` | Device heartbeat/registration |
| POST | `/iclock/cdata` | Push attendance/operation data |
| GET | `/iclock/getrequest` | Device poll commands |
| POST | `/iclock/devicecmd` | Device report command results |
| POST | `/iclock/querydata` | Device report DATA QUERY results |

### Facebook Ads

| Method | URL | Mô tả |
|---|---|---|
| POST | `/api/fb-ads/token` | Lưu FB token |
| GET | `/api/fb-ads/token/status` | Status |
| DELETE | `/api/fb-ads/token` | Clear |
| GET | `/api/fb-ads/accounts` | List ad accounts |
| GET | `/api/fb-ads/accounts/:id/campaigns` | Campaigns |
| GET | `/api/fb-ads/accounts/:id/insights` | Insights |
| POST | `/api/fb-ads/oauth/exchange` | OAuth code exchange |

### Pancake Accounts

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/pancake-accounts` | List accounts |
| GET | `/api/pancake-accounts/:accountId` | Chi tiết |
| POST | `/api/pancake-accounts/sync` | Batch upsert |
| PUT | `/api/pancake-accounts/:accountId` | Cập nhật |
| DELETE | `/api/pancake-accounts/:accountId` | Xóa |
| POST | `/api/pancake-accounts/:accountId/use` | Update last_used_at |
| GET | `/api/pancake-account-pages/:accountId` | Pages list |
| POST | `/api/pancake-account-pages/:accountId` | Save pages |

### FB Global ID Cache

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/fb-global-id` | Lookup psid → globalUserId |
| POST | `/api/fb-global-id` | Save mapping |
| POST | `/api/fb-global-id/report-success` | Report send success |
| POST | `/api/fb-global-id/report-fail` | Report fail (invalidate) |

### AI Proxies

| Method | URL | Mô tả |
|---|---|---|
| POST | `/api/gemini/chat` | Gemini AI chat |
| POST | `/api/deepseek/chat` | DeepSeek chat |
| POST | `/api/deepseek/ocr` | DeepSeek Vision OCR |
| POST | `/api/google-vision/ocr` | Google Cloud Vision OCR |

### AutoFB.pro

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/autofb/status` | Balance + services |
| POST | `/api/autofb/captcha/solve` | Solve SVG captcha (Gemini + Tesseract fallback) |
| POST | `/api/autofb/login` | Login với captcha solving |
| GET | `/api/autofb/services` | List services (5 phút cache) |
| POST | `/api/autofb/order` | Đặt order |

### Goong Maps

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/goong-places/autocomplete` | Autocomplete địa chỉ VN |

### Telegram Bot

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/telegram` | Status bot |
| POST | `/api/telegram/webhook` | Webhook → Gemini AI |
| POST | `/api/telegram/setWebhook` | Set webhook URL |
| GET | `/api/telegram/webhookInfo` | Webhook info |
| POST | `/api/telegram/deleteWebhook` | Xóa webhook |

### Upload (Firebase Storage)

| Method | URL | Mô tả |
|---|---|---|
| POST | `/api/upload/image` | Upload base64 → Firebase Storage |
| DELETE | `/api/upload/image` | Xóa image |
| GET | `/api/upload/health` | Health check |

### Hang QQ (Hàng Hương Châu)

| Method | URL | Mô tả |
|---|---|---|
| GET/POST | `/api/hang-qq` | List / Tạo |
| PUT/DELETE | `/api/hang-qq/:id` | Update / Xóa |
| DELETE | `/api/hang-qq` | Xóa hàng loạt |

### Quy Trình

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/quy-trinh/md` | Export Markdown từ Firestore |
| GET | `/api/quy-trinh/notes` | JSON notes |

### Admin Routes

| Method | URL | Mô tả |
|---|---|---|
| POST | `/api/admin/migrate` | Chạy database migration |
| GET | `/api/admin/data/*` | Data management |
| GET | `/api/admin/firebase/collections` | Browse Firestore collections |
| GET | `/api/admin/firebase/collections/:col` | List documents |
| GET | `/api/admin/firebase/collections/:col/:doc` | Read document |
| GET | `/api/admin/render/services` | List Render services |
| GET | `/api/admin/render/services/:id/env-vars` | List env vars |
| PUT | `/api/admin/render/services/:id/env-vars/:key` | Update env var |
| POST | `/api/admin/render/services/:id/deploys` | Trigger deploy |

### V1 Gone Routes (410)

- `/api/customers/*` → 410 Gone, dùng `/api/v2/customers/*`
- `/api/customer/*`, `/api/wallet/*`, `/api/ticket/*`, `/api/balance-history/*` → Tương tự

---

## WebSocket Server (Frontend)

Chạy cùng HTTP server, endpoint: `ws://server:PORT`

**Broadcast types từ Pancake:**
- `pages:update_conversation` — Tin nhắn/bình luận mới
- `pages:new_message` — Message mới

**Broadcast types từ TPOS:**
- `tpos:new-order` — Đơn hàng mới
- `tpos:order-update` — Đơn hàng cập nhật
- `tpos:invoice-update` — Phiếu bán hàng created/updated

**Extension events:** Bất kỳ event từ Chrome Extension qua `POST /api/tpos-events/broadcast`

---

## WebSocket Clients (Server-side)

### RealtimeClient — Pancake
- Server: `wss://pancake.vn/socket/websocket?vsn=2.0.0`
- Protocol: Phoenix Channel
- Channels: `users:{userId}`, `multiple_pages:{userId}`
- Auth: `accessToken` trong join payload
- Heartbeat: 30s, reconnect exponential backoff 2s→60s max 10 lần

### TposRealtimeClient — TPOS Socket.IO
- Server: `wss://rt-2.tpos.app/socket.io/?room=tomato.tpos.vn&EIO=4&transport=websocket`
- Protocol: Socket.IO (raw `ws` library, không dùng socket.io-client)
- Namespace: `/chatomni`
- Events: `on-events` → parse `SaleOnline_Order`, `FastSaleOrder`

### TPOSSocketListener — TPOS Product Sync
- File: `services/tpos-socket-listener.js`
- Dùng `socket.io-client` library
- Lắng nghe product events: `ProductTemplate`, `Product`
- Debounce 3s → trigger incremental sync

---

## SSE Channels

Endpoint: `GET /api/realtime/sse?keys=key1,key2,key3`

| Key | Dùng bởi |
|---|---|
| `tpos_token` | Sync TPOS auth token |
| `held_products` | Held products state |
| `held_products/ORDER123` | Specific order hold |
| `kpi_base` | KPI dashboard |
| `settings` | App settings |
| `kho_di_cho` | Warehouse product updates |
| `balance_update` | SePay balance (via `/api/sepay/stream`) |

**Event types:** `connected`, `update`, `delete`, `error`, `heartbeat` (30s)

---

## Cron Jobs

| Schedule | Mô tả |
|---|---|
| Mỗi giờ (`0 * * * *`) | Expire virtual credits (PostgreSQL function) |
| Mỗi 6 giờ (`0 */6 * * *`) | Check deadline nhà vận chuyển, nâng priority ticket |
| Mỗi 5 phút (`*/5 * * * *`) | Backup processor: bank transactions → wallet |
| Mỗi 5 phút (`*/5 * * * *`) | Retry pending wallet withdrawals |
| Mỗi ngày 2AM (`0 2 * * *`) | Fraud detection: blacklist return_rate > 50% |
| Mỗi ngày 9AM (`0 9 * * *`) | RETURN_SHIPPER tickets > 20 ngày chưa nhận |
| Mỗi ngày 3AM (`0 3 * * *`) | Cleanup `recent_transfer_phones` > 7 ngày |
| Mỗi ngày 4AM (`0 4 * * *`) | Cleanup `tpos_order_buffer` (giữ 3 ngày) |
| Mỗi 30 phút | Incremental sync TPOS products → kho_di_cho |

---

## External Integrations

| Service | URL | Dùng cho |
|---|---|---|
| TPOS | `https://tomato.tpos.vn` | Token, REST API |
| TPOS OData | `https://services.tpos.dev/api/odata/*` | OData proxy |
| TPOS Realtime | `wss://rt-2.tpos.app/socket.io/` | WS clients |
| Cloudflare Worker | `https://chatomni-proxy.nhijudyshop.workers.dev` | Token manager, product sync |
| Pancake | `https://pancake.vn/api/v1/*` | Proxy |
| Pancake WS | `wss://pancake.vn/socket/websocket` | RealtimeClient |
| Facebook Graph | `https://graph.facebook.com/v21.0/*` | Ads, avatar |
| SePay | Webhook nhận vào | sepay-webhook-core.js |
| Gemini AI | `https://generativelanguage.googleapis.com/v1beta/*` | Chat, captcha, Telegram |
| DeepSeek AI | `https://api.deepseek.com/chat/completions` | Chat, OCR |
| Google Cloud Vision | `https://vision.googleapis.com/v1/images:annotate` | OCR |
| Telegram Bot | `https://api.telegram.org/bot{TOKEN}/*` | Bot |
| Goong.io | `https://rsapi.goong.io/Place/AutoComplete` | Maps |
| autofb.pro | `https://autofb.pro/*` | Social services |
| Firebase Firestore | Project `n2shop-69e37` | Telegram, quy-trinh, admin |
| Firebase Storage | `n2shop-69e37.appspot.com` | Upload images |
| Firebase RTDB | `n2shop-69e37-default-rtdb.asia-southeast1` | Admin browse |
| Render.com API | `https://api.render.com/v1/*` | Service management |

---

## Key Services

| File | Vai trò |
|---|---|
| `services/tpos-token-manager.js` | Singleton auto-fetch + cache TPOS bearer token |
| `services/auth-token-store.js` | Multi-provider token cache (PostgreSQL `auth_token_cache`) |
| `services/wallet-event-processor.js` | Atomic wallet: DEPOSIT, WITHDRAW, VIRTUAL_CREDIT; EventEmitter cho SSE |
| `services/customer-creation-service.js` | `ensureCustomerWithTPOS()` — tìm hoặc tạo customer |
| `services/tpos-customer-service.js` | Search customer TPOS API theo phone |
| `services/sync-tpos-products.js` | Full/incremental sync TPOS → kho_di_cho (hash-based change detection) |
| `services/tpos-socket-listener.js` | Socket.IO listener product events từ TPOS |
| `services/pancake-alert-service.js` | Alerts qua Telegram Bot |
| `services/firebase-storage-service.js` | Firebase Admin SDK singleton |
| `services/admin-settings-service.js` | Settings từ `admin_settings` table |
| `services/audit-service.js` | Audit logging |

---

## Key Data Structures

### SePay Webhook Payload
```json
{
  "id": 123,
  "gateway": "ACB",
  "transactionDate": "2026-01-01 12:00:00",
  "accountNumber": "5354IBT1",
  "code": "FT26001...",
  "content": "0901234567 CK tien hang",
  "transferType": "in",
  "transferAmount": 500000,
  "accumulated": 1000000,
  "referenceCode": "...",
  "description": "..."
}
```

### Wallet Transaction Types
- `DEPOSIT`, `WITHDRAW`, `VIRTUAL_CREDIT_ISSUED`, `VIRTUAL_CREDIT_USED`, `VIRTUAL_CREDIT_EXPIRED`, `ADJUSTMENT`
- Sources: `BANK_TRANSFER`, `RETURN_GOODS`, `ORDER_PAYMENT`, `VIRTUAL_CREDIT_ISSUE/USE/EXPIRE`, `MANUAL_ADJUSTMENT`

### TPOS on-events Payload
```json
{ "d": { "t": "SaleOnline_Order", "EventName": "created", "Data": {...} } }
```

---

## Key Files

| File | Vai trò | Mức quan trọng |
|---|---|---|
| `server.js` | Entry point, middleware, WS, route mounting | Cao nhất |
| `cron/scheduler.js` | Tất cả scheduled tasks | Cao |
| `routes/v2/index.js` | Router V2 hub | Cao |
| `routes/sepay-webhook-core.js` | SePay webhook handler chính | Cao |
| `routes/sepay-transaction-matching.js` | Phone extraction, TPOS search, debt | Cao |
| `routes/realtime-sse.js` | SSE engine thay thế Firebase | Cao |
| `services/wallet-event-processor.js` | Wallet business logic | Cao |
| `services/tpos-token-manager.js` | TPOS auth singleton | Cao |
| `services/sync-tpos-products.js` | Product sync service | Trung bình |
| `middleware/auth.js` | JWT middleware | Trung bình |
| `routes/users.js` | User management + 2FA TOTP | Trung bình |
| `routes/adms.js` | ZKTeco ADMS protocol | Trung bình |
| `db/schema.sql` | Schema ban đầu | Tham khảo |
| `migrations/` | 40+ migration files | Tham khảo |

---

## Ghi chú phát triển

- **PostgreSQL access**: Dùng `app.locals.chatDb` — không tạo pool mới
- **SSE notification**: Gọi `notifyClients(key, data)` từ `realtime-sse.js` sau mỗi DB write
- **Wallet operations**: Luôn dùng `wallet-event-processor.js` (atomic + event emission)
- **Customer creation**: Dùng `customer-creation-service.js` — không INSERT trực tiếp
- **TPOS token**: Dùng `tposTokenManager.getToken()` singleton
- **V1 routes** đã bị xóa (410 Gone) — chỉ dùng `/api/v2/*`
- **Tables tạo lazy**: Pattern `ensureTables()` — an toàn khi table chưa tồn tại
- **Shared imports Node.js**: `require('../../shared/node/fetch-utils.cjs')`
