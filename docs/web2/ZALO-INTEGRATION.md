# Zalo Integration cho Web 2.0 — Nghiên cứu + Kiến trúc + Lộ trình

> **Trạng thái:** ✅ **ĐÃ BUILD v1** (2026-06-13) + ✅ **REBUILD v2** (2026-06-22, xem §0c) — chờ deploy + đăng nhập acc thật để chạy live.
> Doc này tổng hợp nghiên cứu hệ sinh thái Zalo trên GitHub, kiến trúc "**Trang Zalo là nguồn dữ liệu duy nhất**", và lộ trình.
>
> **Nguyên tắc cốt lõi (user yêu cầu 2026-06-13):** Tạo **1 trang Zalo duy nhất** (`web2/zalo/`) quản lý toàn bộ dữ liệu + chức năng Zalo. Mọi trang khác cần Zalo → **tham chiếu tới nguồn này qua API/helper chung** (`Web2Zalo`), KHÔNG tự gọi Zalo API trực tiếp. **Chỉ có 1 nguồn Zalo.**

---

## 0c. REBUILD v2 (2026-06-22) — "đầy đủ tính năng chat như app Zalo"

> Rebuild trên ENGINE cũ (giữ contract `Web2Zalo.mountChat`, `ZaloApi`, `WZChat.mountConversation`, deep-link `?focus=`) — KHÔNG viết lại từ đầu. Module nhỏ trong `web2/shared/zalo-chat/`. 5 phase, mỗi phase verify browser (0 lỗi console):

- **Phase 1 — Login bền ("không văng nick")**: watchdog `web2-zalo-zca.js` (keepAlive ~2', auto-reconnect backoff 1006/network, trần kick 3000/3003 + cooldown, re-login chủ động trong cửa sổ zpw_sek ~7 ngày), `_health()` + đèn sức khoẻ rail, graceful `stopZalo()` lúc SIGTERM. ⚠ Re-login từ cookie QR vẫn flaky — watchdog cứu drop hồi phục được, KHÔNG cứu cookie đã chết. **Cookie-login (chia sẻ phiên chat.zalo.me) KHÔNG đá nhau; QR tạo phiên mới → đá nhau.**
- **Phase 2 — UI 3-pane Zalo PC** (icon rail · danh sách · khung chat · panel thông tin) + **thông báo** (`web2-zalo-notify.js`: toast + chuông Web Audio + badge tab + Web Notification) + **quản lý hội thoại** (ghim/tắt thông báo/đánh dấu chưa đọc — route `/pin /mute /mark`, cột `is_pinned/is_muted/muted_until`) + **bỏ giới hạn allowlist nhóm** (mặc định hiện hết) + quick-reply lưu mới (`POST /quick-replies` + zca `addQuickMessage`, gõ "/" mở picker) + **ZNS form động** (render ô theo `template.params`) + link preview card.
- **Phase 3 — Tính năng chat**: **tin thoại** (`MediaRecorder` ở composer → gửi qua đường file, bubble voice) · **xoá ở phía tôi** (zca `deleteMessage(onlyMe)` + cột `hidden_for_me` + lọc query) · **video inline** (`<video controls>`) · **danh thiếp** (card avatar+tên+SĐT) · **vị trí** (card → Google Maps). _(OA/ZNS gỡ khỏi scope theo yêu cầu user; sticker pack picker đã đủ; gửi danh thiếp `sendCard` hoãn — chưa có điểm vào UI gọn.)_
- **Phase 4 đợt 1 — Tin hệ thống nhóm**: listener bắt `group_event` → `_normGroupEvent`/`_groupEventText` (13 loại VN) → tin `msg_type='system'` (`direction='system'` → KHÔNG cộng unread) → render dòng `.wz-sys-msg` giữa khung. _(Tách module route 2240 dòng: **HOÃN** — refactor lớn rủi ro vỡ login, 0 giá trị user; làm session riêng khi login đã ổn. Polls/notes/reminders: bỏ — YAGNI shop.)_
- **Phase 5 — Test + docs**: `scripts/test-web2-zalo-render.js` (Playwright headless, localhost, KHÔNG cần acc — assert **18 điểm**: mọi loại bong bóng + link-card/fallback + tin hệ thống + tool xoá + composer mic/ghi-âm + ZNS form động + ZaloApi methods + 0 lỗi console). Chạy: `node scripts/test-web2-zalo-render.js`.

**Cột DB mới**: `web2_zalo_messages.hidden_for_me`. **Route mới**: `POST /quick-replies`, `POST /delete-message`, `POST /conversations/:id/{pin,mute,mark}`. **Asset version** bump → `?v=20260622p6` + `ENGINE_VER='20260622p6'` (trang tiêu thụ native-orders/live-chat tự nạp engine mới qua `web2-zalo.js`).

---

## 0. Trạng thái triển khai (đã build 2026-06-13)

**Kiến trúc thực tế:** zca-js chạy **trong process Render fallback** (`render.com`), KHÔNG ở live-chat/server — vì Render fallback đã sở hữu web2Db + SSE hub + được CF proxy (CORS/retry). zca re-login từ session lưu DB khi boot (giống Pancake relay autoConnect).

**Files đã tạo:**

| Lớp     | File                                                                                         | Vai trò                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema  | `render.com/db/web2-zalo-schema.js`                                                          | `web2_zalo_accounts/conversations/messages` + `web2_zns_templates/log` + `web2_zalo_send_jobs/items` + ALTER `web2_customers` (zalo_uid)       |
| zca-js  | `render.com/services/web2-zalo-zca.js`                                                       | Phiên cá nhân: QR/cookie login, listener WS, send, getUserInfo/findUser, friends/groups, restore-on-boot                                       |
| OA/ZNS  | `render.com/services/web2-zalo-oa.js`                                                        | Token store/refresh (xoay refresh_token), ZNS template, tin tư vấn cs, sync template                                                           |
| Routes  | `render.com/routes/web2-zalo.js`                                                             | `/api/web2-zalo/*` — accounts, login-qr, qr poll, conversations, messages, send-message, lookup, oa/connect, send-zns, zns/log + `_notify` SSE |
| Wiring  | `render.com/server.js`                                                                       | require + ensureSchema + restoreSessions + initializeNotifiers + mount `/api/web2-zalo`                                                        |
| Dep     | `render.com/package.json`                                                                    | `zca-js@^2.1.2`                                                                                                                                |
| Helper  | `web2/shared/web2-zalo.js`                                                                   | `Web2Zalo.{sendZNS,sendMessage,getConversation,openChat,attachZaloButtons,status}` — cổng duy nhất cho mọi trang                               |
| Page    | `web2/zalo/index.html` + `js/web2-zalo-api.js` + `js/web2-zalo-app.js` + `css/web2-zalo.css` | 4 tab: Tài khoản / Hội thoại / Tra cứu / ZNS                                                                                                   |
| Worker  | `cloudflare-worker/{modules/config/routes.js,worker.js}`                                     | Route `WEB2_ZALO` → Render fallback                                                                                                            |
| Sidebar | `web2/shared/web2-sidebar.js`                                                                | Menu "Zalo" trong "Tính năng mới" + WEB2_PAGES                                                                                                 |

**SSE topics:** `web2:zalo:accounts`, `web2:zalo:messages`, `web2:zalo:conv:<id>`.

**Cần làm để chạy LIVE:**

1. Deploy Render (`render.com/**` đổi → build chạy `npm install` kéo zca-js). Verify `/api/web2-zalo/status` trả `zcaAvailable:true`.
2. **Chat cá nhân:** mở trang Zalo → tab Tài khoản → "Thêm tài khoản cá nhân" → quét QR bằng acc Zalo **phụ**. Session lưu DB, tự reconnect khi Render restart.
3. **ZNS:** đăng ký OA tại developers.zalo.me → "Kết nối Zalo OA" (App ID/Secret/Authorization Code) → duyệt template → gửi.

**Hạn chế v1 (TODO):** (a) `web2_zalo_conversations.phone` chưa map từ uid (cần findUser để liên kết SĐT↔uid) → `getConversation(phone)` của helper chỉ trả khi đã có map; (b) gửi ảnh/file qua zca chưa làm (mới text); (c) bulk-send tables đã tạo nhưng worker chưa code (Đợt 2 polish); (d) auth route-level chưa siết (dựa vào lớp app login + CF) — KHÔNG bao giờ trả token/session ra client.

---

## 1. Mục tiêu

Thêm kênh **Zalo** (app nhắn tin phổ biến nhất VN) vào Web 2.0 để:

- Gửi **thông báo đơn hàng tự động** (xác nhận, vận chuyển, nhắc thanh toán) → giảm bom hàng.
- **Chat 2 chiều** với khách trên Zalo như người thật — không bị giới hạn cửa sổ 24h như Facebook.
- Gộp **chân dung khách đa kênh** (Facebook + Zalo) theo SĐT trong `web2_customers`.
- CRM nâng cao: lead scoring, tag, pipeline, gợi ý chốt đơn bằng AI.

---

## 2. Nghiên cứu GitHub — hệ sinh thái Zalo (đã lọc bỏ repo AI-challenge)

| Repo                                                                                      | ★         | Loại                                                             | Ghi chú cho n2store                                                                                                                               |
| ----------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RFS-ADRENO/zca-js**                                                                     | 516       | Lib lõi (TS, npm `zca-js`, v2.1.2 — 3/2026, **maintain tốt**)    | ⭐ **Cốt lõi** — "Pancake cho Zalo": điều khiển tài khoản cá nhân qua reverse-engineered Zalo Web API                                             |
| **locphamnguyen/ZaloCRM** (+ vuongnguyenbinh fork)                                        | 146 / 128 | CRM full (Vue 3 + Fastify 5 + PG 16 + Socket.IO + Redis + S3/R2) | ⭐ **Blueprint CRM** hoàn chỉnh: pipeline, lead scoring auto-decay, tag 2 chiều, appointment, webhook API, multi-account                          |
| **babyvibe/deplao-builder**                                                               | 158       | App multi-account (React 18 + Electron + SQLite)                 | Tham khảo marketing/broadcast, workflow drag-drop, tích hợp POS (KiotViet/Sapo/**Pancake POS**) + GHN/GHTK                                        |
| **diendh/zca-bridge**                                                                     | 91        | Relay Zalo↔Chatwoot (Node 24 + Fastify + PG job queue + Docker)  | ⭐ **Pattern relay** giống hệt `live-chat/server` của n2store: reconnect backoff 5s→5min, proxy-per-account, dead-letter queue, message_map dedup |
| **williamcachamwri/zalo-tg**                                                              | 248       | Cầu Zalo↔Telegram (TS)                                           | Tham khảo relay 2 chiều                                                                                                                           |
| **ChickenAI/zalo-node**                                                                   | 139       | n8n node cho Zalo                                                | Nếu sau này muốn automation no-code                                                                                                               |
| **PhucMPham/zalo-agent-cli**                                                              | 140       | CLI automation (multi-account, proxy, QR payment)                | Tham khảo bank-transfer / QR (ít liên quan)                                                                                                       |
| **theYahia/zalo-oa-mcp**                                                                  | 0         | MCP server cho Zalo OA chính thức                                | Tham khảo wrapper OA API                                                                                                                          |
| **ducminhgd/zalo-go-sdk**, **haposoft/zalo-zns-nestjs**, **Duc-Nguyen98/ZNS_Node_Create** | 0         | ZNS wrappers (Go/Nest/Node)                                      | Tham khảo cấu trúc gọi ZNS + refresh token flow                                                                                                   |

**Đánh giá độ chín:** `zca-js` là lib duy nhất đáng tin (516★, cập nhật 3/2026, TypeScript, có listener WebSocket, 19 releases). **3 CRM lớn** (ZaloCRM, deplao, zca-bridge) đều build trên nó → đã kiểm chứng production. Các repo ZNS phần lớn 0★ nhưng ZNS là **REST API chính thức đơn giản** nên không cần lib — tự gọi được.

---

## 3. Hai con đường tích hợp

### 3A. Zalo OA + ZNS (CHÍNH THỨC — an toàn, có phí)

- **ZNS (Zalo Notification Service):** gửi tin **template duyệt trước** tới **bất kỳ SĐT nào** (không cần follow OA). ≤400 ký tự, hỗ trợ ảnh/bảng/nút CTA. **~200đ/tin thành công**, không giới hạn tần suất tháng.
- **OA chat (tin tư vấn):** trả lời text/ảnh/list cho người **đã nhắn OA** trong cửa sổ cho phép; khuyến mãi cần người **follow OA**.
- **Token:** OAuth — access_token (~1h) refresh bằng refresh_token (~3 tháng, **xoay vòng** mỗi lần refresh → phải lưu lại token mới). App đăng ký tại developers.zalo.me.
- **Rủi ro:** ❌ không có. Không ban. Chỉ tốn phí ZNS + cần duyệt template.

> **API (xác minh lại lúc implement vì developers.zalo.me là SPA không fetch được):**
>
> - Gửi ZNS template: `POST https://business.openapi.zalo.me/message/template`
>   header `access_token: <OA_TOKEN>`, body `{ "phone": "84...", "template_id": "...", "template_data": { ... }, "tracking_id": "<order_ref>" }`
> - Refresh token: `POST https://oauth.zaloapp.com/v4/oa/access_token` (app_id + secret_key + refresh_token + grant_type=refresh_token)
> - Tin tư vấn OA: `POST https://openapi.zalo.me/v3.0/oa/message/cs`
> - Nguồn tham khảo: [developers.zalo.me/docs](https://developers.zalo.me/docs), [Infobip ZNS docs](https://www.infobip.com/docs/zalo), [8x8 ZNS](https://developer.8x8.com/connect/docs/usage-samples-zns/)

### 3B. zca-js (KHÔNG CHÍNH THỨC — mạnh, có rủi ro ban)

- **Đăng nhập:** `loginQR()` (quét QR) hoặc **cookie/credential** (lưu session, tái dùng qua restart). Mỗi acc gán **proxy riêng** (HTTP/SOCKS5).
- **Gửi:** text, ảnh, video, file, sticker, voice, reaction, reply/quote, mention/tag — `sendMessage()`, `sendMessageSticker()`, … (deplao + ZaloCRM xác nhận đủ media).
- **Nhận (realtime):** `listener.on("message", …)` + `.start()`. WebSocket. Phân biệt `ThreadType.User` / `ThreadType.Group`. **Chỉ 1 web-listener / acc tại 1 thời điểm.** Events kiểu ZaloCRM: `message.received/sent`, `contact.created`, `zalo.connected/disconnected`.
- **Đối tượng:** gửi cho **bất kỳ bạn bè / người từng nhắn** trên acc đó (không cần follow OA). ✅ **KHÔNG có rule 24h** như Facebook.
- **Rủi ro:** ⚠️ "Using this API could get your account locked or banned." → **dùng acc phụ**, proxy riêng, reconnect backoff, không spam.

### So sánh nhanh

|            | OA + ZNS (3A)                                 | zca-js (3B)                            |
| ---------- | --------------------------------------------- | -------------------------------------- |
| Gửi cho ai | ZNS: mọi SĐT; OA: người đã nhắn/follow        | Bạn bè / người từng nhắn acc           |
| Nội dung   | ZNS: template duyệt; OA: tự do (trong cửa sổ) | Tự do mọi loại                         |
| Chi phí    | ~200đ/tin ZNS                                 | Miễn phí                               |
| Rule 24h   | Không                                         | **Không**                              |
| Rủi ro     | An toàn                                       | Có thể ban acc                         |
| Vai trò    | **Thông báo giao dịch tự động**               | **Chăm sóc / chat / chốt đơn 2 chiều** |

→ **Dùng cả hai**: ZNS cho automation giao dịch, zca-js cho chat người-thật.

---

## 4. Kiến trúc "Trang Zalo = nguồn duy nhất" (CỐT LÕI)

Theo đúng convention single-source đã có của project (`Web2QR`, `Web2WalletBalance` pill, `Web2SSE` bridge): **1 module sở hữu toàn bộ Zalo**, các trang khác chỉ tiêu thụ qua helper/API.

```
┌──────────────────────── NGUỒN DUY NHẤT (web2/zalo/) ────────────────────────┐
│  UI quản lý: tài khoản Zalo · hội thoại · gửi tin · template ZNS · CRM      │
│  Backend  : /api/web2-zalo/*  +  service web2-zalo-service.js               │
│  Data     : bảng web2_zalo_*  (pool web2Db)  +  web2_customers.zalo_uid     │
│  Realtime : SSE topic web2:zalo:*                                           │
│  Relay    : live-chat/server (zca-js WS) → /api/web2-zalo/ingest            │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                     │  (chỉ qua helper + API — KHÔNG gọi Zalo trực tiếp)
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
  native-orders/              web2/customers/            balance-history/
  "Gửi ZNS xác nhận"          "Mở chat Zalo"             "Nhắc CK qua Zalo"
   Web2Zalo.sendZNS(...)       Web2Zalo.openChat(...)     Web2Zalo.sendZNS(...)
```

### 4.1. Folder / module

```
web2/zalo/
├── index.html              # Trang quản lý Zalo (single source)
├── js/web2-zalo-app.js     # App: accounts, conversations, send, templates, CRM
├── js/web2-zalo-chat.js    # Khung chat 2 chiều (reuse pattern live-chat)
└── css/web2-zalo.css
web2/shared/
└── web2-zalo.js            # ⭐ Helper CHUNG `Web2Zalo` — các trang khác import
```

### 4.2. DB schema (pool `web2Db`, prefix `web2_zalo_`)

- `web2_zalo_accounts` — `id, label, login_type('personal'|'oa'), zalo_uid, display_name, avatar, session_cookie(enc), proxy_url, status('connected'|'disconnected'|'banned'), last_connected_at`
- `web2_zalo_conversations` — `id, account_id, thread_id, thread_type('user'|'group'), customer_id→web2_customers, zalo_uid, display_name, avatar, unread, last_message_at`
- `web2_zalo_messages` — `id, conversation_id, account_id, direction('in'|'out'), msg_type, text, attachments(jsonb), zalo_msg_id, sender_uid, ts, status`
- `web2_zalo_zns_templates` — `template_id, name, params(jsonb), status, preview`
- `web2_zalo_zns_log` — `id, phone, template_id, template_data(jsonb), tracking_id, status, zalo_msg_id, cost, order_ref, sent_at`
- `web2_zalo_send_jobs` / `web2_zalo_send_items` — gửi hàng loạt (mirror `web2_msg_send_*`)
- **Link identity:** `ALTER TABLE web2_customers ADD COLUMN zalo_uid VARCHAR(100), ADD COLUMN zalo_followed_oa BOOLEAN` — gộp khách FB+Zalo theo `phone` (UNIQUE key sẵn có).

> Migration đặt `ALTER ... ADD COLUMN` ở **ĐẦU** `ensureSchema` (`ALTER TABLE IF EXISTS`), idempotent — theo bài học [[reference_web2_wallet_schema_legacy_refs]].

### 4.3. Routes `/api/web2-zalo/*` (mount TRƯỚC catch-all `/api/web2/*`)

- `POST /api/web2-zalo/zns/send` — gửi 1 ZNS `{phone, templateId, data, orderRef}`
- `GET  /api/web2-zalo/zns/templates` — list template đã duyệt
- `POST /api/web2-zalo/msg/send` — gửi tin qua acc cá nhân `{accountId, threadId, text|attachments}`
- `POST /api/web2-zalo/bulk-send` — gửi hàng loạt (job queue, mirror `web2-msg-send.js`)
- `GET  /api/web2-zalo/conversations` · `GET /api/web2-zalo/conversations/:id/messages`
- `GET  /api/web2-zalo/customer/:phone` — tra cứu hội thoại + trạng thái theo SĐT (cho trang khác tham chiếu)
- `GET  /api/web2-zalo/accounts` · `POST /api/web2-zalo/accounts/login-qr`
- `POST /api/web2-zalo/ingest` — relay từ `live-chat/server` đẩy event zca-js vào (giống `/api/web2-live-comments/ingest`)
- Service: `render.com/services/web2-zalo-service.js` (OA token store + ZNS) · `web2-zalo-worker.js` (consume bulk-send) · `web2-zalo-relay.js` (zca-js trong live-chat/server)
- Wire `web2ZaloRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients)` trong `server.js`.

### 4.4. SSE topics (hub Web 2.0 — `realtime-sse-web2.js`)

- `web2:zalo:messages` — tin mới (mọi acc) → trang Zalo reload hội thoại
- `web2:zalo:conv:<id>` — tin trong 1 hội thoại
- `web2:zalo:bulk-send:<jobId>` + `web2:zalo:bulk-send` — tiến độ gửi hàng loạt
- `web2:zalo:accounts` — trạng thái kết nối acc (connected/banned)
- Client: `Web2SSE.subscribe('web2:zalo:messages', cb)` + debounce 500-600ms.

### 4.5. ⭐ Helper chung `Web2Zalo` (`web2/shared/web2-zalo.js`) — cách trang khác tham chiếu

Theo đúng pattern `Web2WalletBalance.attachBalances(root)`: trang khác **chỉ load script + gọi helper**, không bao giờ chạm Zalo API.

```js
// Gửi ZNS thông báo (an toàn) — dùng ở native-orders, balance-history
Web2Zalo.sendZNS({ phone, templateId: 'order_confirm', data: {...}, orderRef })

// Mở chat Zalo (điều hướng tới trang Zalo, focus hội thoại) — dùng ở customers
Web2Zalo.openChat(phoneOrCustomerId)

// Lấy tóm tắt hội thoại theo SĐT (badge "đã nhắn Zalo", unread) — render ở mọi trang
const conv = await Web2Zalo.getConversation(phone)

// Tự quét DOM: phần tử [data-w2zalo-phone] → gắn nút "Zalo" / "Gửi ZNS"
//   (y hệt Web2WalletBalance.attachBalances — drop-in mọi trang có SĐT)
Web2Zalo.attachZaloButtons(root)

// Trạng thái acc (cho admin)
Web2Zalo.status()
```

**Quy tắc bất biến:** Không trang nào (native-orders, customers, balance-history, …) được gọi `business.openapi.zalo.me` hay import `zca-js`. Tất cả đi qua `/api/web2-zalo/*` ← đúng tinh thần "chỉ có 1 nguồn Zalo".

---

## 5. Đối chiếu hạ tầng hiện có — mức tái dùng

| n2store đã có (Facebook/Pancake)                                               | Zalo tương ứng                                   | Tái dùng                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------ |
| `live-chat/server/server.js` relay Pancake WS → fallback (`forwardToFallback`) | Relay zca-js WS → `/api/web2-zalo/ingest`        | Copy pattern, đổi client |
| `web2_customers.phone` UNIQUE (dedup key)                                      | **SĐT chính là khoá Zalo** → chỉ thêm `zalo_uid` | Gần như free             |
| `web2_msg_send_jobs/items` + `web2-msg-send-worker.js`                         | `web2_zalo_send_*` + `web2-zalo-worker.js`       | Mirror file              |
| SSE `web2:live-comments`, bridge `web2-sse-bridge.js`                          | `web2:zalo:*`                                    | Mirror topic             |
| Rule 24h FB (cần extension bypass)                                             | Zalo **không** có rule 24h                       | **Bỏ bớt logic**         |
| `Web2WalletBalance.attachBalances` (pill drop-in)                              | `Web2Zalo.attachZaloButtons`                     | Mirror helper            |
| Harvest comment Pancake → `web2_customers`                                     | Harvest bạn bè/hội thoại Zalo → kho              | Mirror                   |
| SePay webhook (xác nhận CK)                                                    | Nối ZNS nhắc thanh toán                          | Hook thêm                |

**Còn thiếu (nên xây luôn):** lớp trừu tượng "gửi tin đa kênh". Cân nhắc `web2-message-dispatcher` (`channel: facebook|zalo|zns`) thay vì silo từng kênh — nhưng để **Đợt 2+** khi đã có Zalo chạy.

---

## 6. Lộ trình 3 đợt

### 🟢 Đợt 1 — ZNS thông báo đơn (an toàn, ROI cao nhất, làm TRƯỚC)

**Scope:** route `/api/web2-zalo/zns/*` + `web2-zalo-service.js` (OA token store + refresh) + bảng `web2_zalo_zns_templates`, `web2_zalo_zns_log` + UI quản lý template ở `web2/zalo/`.
**Tính năng:**

1. Tự động gửi ZNS **xác nhận đơn** khi tạo PBH / native-order.
2. ZNS **cập nhật vận chuyển** (GHN/GHTK) + **nhắc thanh toán/CK** (nối SePay sẵn có).
3. Trang khác gọi `Web2Zalo.sendZNS(...)` — không tự gọi API.
   **Phụ thuộc:** đăng ký Zalo OA + duyệt 2-3 template (xác nhận đơn / vận chuyển / nhắc CK). Lưu `ZALO_OA_ID`, `ZALO_APP_SECRET`, refresh_token vào `serect_dont_push.txt` + Render env.
   **Rủi ro:** thấp. Chỉ tốn ~200đ/tin.

### 🟡 Đợt 2 — Chat 2 chiều qua zca-js (mạnh, cần acc phụ + proxy)

**Scope:** `web2-zalo-relay.js` (zca-js listener) trong `live-chat/server` → `/api/web2-zalo/ingest` → bảng `web2_zalo_conversations/messages` → SSE → kênh Zalo trong UI chat.
**Tính năng:** 4. Kênh Zalo hiện cạnh Facebook trong `live-chat/` (hoặc tab riêng ở `web2/zalo/`). 5. Gửi tin **hàng loạt** qua Zalo (không bị 24h) — mirror `web2-msg-send`. 6. Gộp hội thoại Zalo vào `web2_customers` (identity FB+Zalo theo SĐT) → chân dung 360°.
**Phụ thuộc:** chuẩn bị **1 acc Zalo phụ** + **proxy** (HTTP/SOCKS5). Reconnect backoff + dead-letter (học `zca-bridge`).
**Rủi ro:** ⚠️ ban acc → dùng acc phụ, không spam, proxy ổn định.

### 🔵 Đợt 3 — CRM nâng cao (blueprint = locphamnguyen/ZaloCRM)

**Tính năng:** 7. Lead scoring (auto-decay + signal), tag/pipeline (New→Contacted→Interested→Converted→Lost), appointment + nhắc. 8. Gợi ý chốt đơn bằng AI (dùng hạ tầng AI sẵn có của project). 9. Force-extract bạn bè/hội thoại Zalo → kho `web2_customers` (mirror harvest Pancake; KHÔNG đè SĐT/tên/địa chỉ sẵn có).
**Rủi ro:** chủ yếu là khối lượng — build dần trên data Đợt 2.

---

## 7. Rủi ro & giảm thiểu (zca-js)

- **Ban acc:** dùng acc phụ (không phải acc chính shop); proxy riêng / acc; không gửi spam tốc độ cao; throttle gửi hàng loạt.
- **Session rớt:** reconnect backoff 5s→5min; chỉ QR lại khi auth fail thật (network/proxy error tự retry) — pattern `zca-bridge`.
- **Chỉ 1 listener / acc:** không mở 2 nơi cùng nghe 1 acc → chạy listener duy nhất trong `live-chat/server`.
- **Bảo mật session:** mã hoá `session_cookie` khi lưu DB; không log/echo ra ngoài.
- **Pháp lý:** zca-js vi phạm ToS Zalo về mặt kỹ thuật → ZNS chính thức cho automation giao dịch (Đợt 1) là lớp an toàn chính, zca-js chỉ cho chăm sóc.

---

## 8. Checklist trước khi code (khi user duyệt từng đợt)

**Đợt 1 (ZNS):**

- [ ] Đăng ký Zalo OA (business), lấy `app_id` / `secret_key` / `refresh_token` ban đầu.
- [ ] Soạn + gửi duyệt template: xác nhận đơn, cập nhật vận chuyển, nhắc CK.
- [ ] Lưu credential vào `serect_dont_push.txt` + Render env (qua `PUT /env-vars/{KEY}` từng key).
- [ ] Tạo `web2-zalo-service.js` (token store auto-refresh + xoay refresh_token) + route ZNS + bảng log.
- [ ] Helper `Web2Zalo.sendZNS` + wire vào native-orders / SePay.
- [ ] Verify: gửi ZNS thử tới SĐT clone `0123456788` (theo [[feedback_test_only_clone_phone]]).

**Đợt 2 (zca-js):** chuẩn bị acc phụ + proxy → relay trong live-chat/server → ingest → UI.
**Đợt 3 (CRM):** mở rộng schema CRM + AI trên data Đợt 2.

---

## 9. Tham chiếu

- GitHub lib lõi: [RFS-ADRENO/zca-js](https://github.com/RFS-ADRENO/zca-js) · npm `zca-js` v2.1.2
- Blueprint CRM: [locphamnguyen/ZaloCRM](https://github.com/locphamnguyen/ZaloCRM)
- Pattern relay: [diendh/zca-bridge](https://github.com/diendh/zca-bridge)
- App multi-account: [babyvibe/deplao-builder](https://github.com/babyvibe/deplao-builder)
- ZNS docs: [developers.zalo.me](https://developers.zalo.me/docs) · [Infobip](https://www.infobip.com/docs/zalo) · [8x8](https://developer.8x8.com/connect/docs/usage-samples-zns/)
- Hạ tầng nội bộ liên quan: [SSE-REALTIME.md](SSE-REALTIME.md) · [WEB2-INDEX.md](WEB2-INDEX.md) · [UI-FIRST.md](UI-FIRST.md) · `live-chat/server/server.js` · `render.com/routes/web2-msg-send.js` · `render.com/db/web2-customers-schema.js`
