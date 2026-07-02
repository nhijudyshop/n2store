<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 KB doc cho NotebookLM. -->

# KB — Web 2.0 Dịch vụ & Hạ tầng (web2/system?tab=services)

Tài liệu này là Knowledge-Base tổng hợp về trang **`web2/system/`** (Cấu hình & Hệ thống) của Web 2.0 N2Store — đặc biệt tab **"Dịch vụ & Hệ thống"** (Services), cùng toàn bộ hạ tầng backend, realtime SSE, bên thứ 3 và shared modules liên quan. Dùng cho **người đọc qua NotebookLM** (hỏi-đáp về kiến trúc/chi phí/dịch vụ) và cho **Claude đọc trước khi code** phần `web2/system` hoặc bất kỳ thay đổi hạ tầng/dịch vụ Web 2.0. Mọi con số/tên service/chi phí lấy nguyên từ báo cáo nội bộ, không suy diễn.

**Cập nhật: 2026-07-01**

---

## 0. ⚠ LUẬT VÀNG — LUÔN CẬP NHẬT DATA TRANG `web2/system`

> `web2/system/index.html` (Cấu hình & Hệ thống) là **nguồn-sự-thật SỐNG** về hạ tầng/module/bên-thứ-3/SSE của Web 2.0. **Ưu tiên giữ trang LIVE + nguồn data của nó chính xác** hơn là viết doc tĩnh phân kỳ. KB `.md` này chỉ là **bản derived** (cho NotebookLM đọc + Claude đọc trước khi code) — KHÔNG được để nó, hoặc data trang, đi lệch code thật.

**Khi làm gì thì phải cập nhật:**

| Đổi cái gì trong code Web 2.0                                       | Cập nhật data nào của `web2/system`                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thêm/xoá **trang**, tách **module**, thêm/đổi **route/service/hàm** | Chạy `node scripts/gen-web2-codemap.js` → `node scripts/gen-web2-system-data.js` → refresh `web2-modules.json`, `web2-codemap.json`, `WEB2-CODEMAP.md`, `WEB2-PAGE-MODULES.md`, `WEB2-THIRD-PARTIES.md` (tab **Module**, **Các trang**) |
| Đổi **plan/chi phí/dịch vụ/DB** (Render, thêm bên thứ 3)            | Sửa TAY `SERVICES_INVENTORY` trong `render.com/routes/services-overview.js` (tab **Dịch vụ** đọc live từ đây)                                                                                                                           |
| Thêm/sửa **bên thứ 3** (API/lib/model/OSS)                          | Sửa TAY `web2/system/data/web2-third-parties.json` (curated) rồi chạy `gen-web2-system-data.js` (sinh lại `WEB2-THIRD-PARTIES.md`)                                                                                                      |
| Thêm/đổi **topic SSE** `web2:*` (publisher/subscriber)              | Sửa TAY `web2/system/data/web2-sse-registry.json` (curated — sổ tay SSE, tab **Realtime**)                                                                                                                                              |
| Phát hiện/gộp **trùng chức năng** (dedup)                           | Sửa TAY `web2/system/data/web2-dedup-audit.json` (curated, tab **dedup**)                                                                                                                                                               |

**Tab nào TỰ TƯƠI (không cần làm gì):** `services` (live `/api/services-overview`, refresh 60s), `sse` stats (live), `pages` (đọc DOM sidebar), `ai` (runtime `Web2AiPageRegistry`).

**Tab nào CURATED (không có generator → cập nhật tay khi audit):** `thirdparty`, `dedup`, `sse` registry. Đừng bịa data — chỉ cập nhật khi đã verify code thật.

**Nguyên tắc:** đừng để `servicesAuditFindings` (hay bất kỳ registry nào) claim một issue **đã fix** là **open**. Sửa xong code → cập nhật registry cho khớp (đánh dấu `status: resolved` + `resolvedDate`).

---

## 1. Trang `web2/system` là gì + cách truy cập

- **URL:** `/web2/system/index.html` (prod: `https://nhijudy.store/web2/system/index.html`). Hỗ trợ deep-link tab qua query `?tab=<id>` (vd `?tab=services`, `?tab=thirdparty`).
- **Quyền truy cập:** nằm trong group menu **chỉ admin** ("Cấu hình & Hệ thống", MEMORY `reference_web2_admin_group`). Trang KHÔNG có gate kiểm tra role riêng — chỉ load `web2-auth.js` + mount sidebar; việc ẩn/hiện menu admin do **sidebar** quyết định.
- **Gốc gác:** gộp từ 2 trang cũ `services-dashboard` + `admin-sse-monitor`; deep-link cũ vẫn redirect qua `?tab=`.
- **7 tab** (state quản lý ở `system-app.js` `VALID_TABS = ['services','sse','pages','modules','thirdparty','dedup','ai']`):

| #   | id           | Tên                               | Nguồn data                                               | Tươi?        |
| --- | ------------ | --------------------------------- | -------------------------------------------------------- | ------------ |
| 1   | `services`   | Dịch vụ & Hệ thống (**mặc định**) | Live API `/api/services-overview` (refresh 60s)          | auto         |
| 2   | `sse`        | Realtime (SSE)                    | Live SSE stats + curated `web2-sse-registry.json`        | auto+curated |
| 3   | `pages`      | Các trang Web 2.0                 | Đọc DOM sidebar (không gọi API)                          | auto         |
| 4   | `modules`    | Module                            | `web2-modules.json` (**generated**)                      | gen          |
| 5   | `thirdparty` | Bên thứ 3                         | `web2-third-parties.json` (**curated** + findings)       | curated      |
| 6   | `dedup`      | Dedup (trùng chức năng)           | `web2-dedup-audit.json` (**curated** từ audit)           | curated      |
| 7   | `ai`         | Gợi ý AI                          | Runtime `Web2AiPageRegistry` (per-page, không data file) | auto         |

- Tab **Services là panel mặc định** (đầu tiên). Mỗi tab **lazy-init một lần**: active `services` lần đầu → `window.SystemServices.start()`.
- Các file JSON tĩnh trong `web2/system/data/` (modules + third-parties + `_module-categories.json`) sinh bởi `scripts/gen-web2-system-data.js` (chạy SAU `gen-web2-codemap.js`).

---

## 2. Tab Services hiển thị gì

Toàn bộ logic ở `web2/system/js/system-services.js` (`renderAll(data)` → 4 renderer + wire click). Panel gồm **5 khối**:

### a) Cost summary strip (4 card)

- **💵 Tổng chi phí /tháng** — cộng động `s.costMonth` của mọi service có `costMonth > 0` → **~$119 USD** (Render $95 + SePay ~$24/589k VND — SePay thêm vào inventory 2026-06-28).
- **💸 Đang trả tiền** — đếm service `costMonth > 0`.
- **🆓 Đang dùng free** — đếm service `costMonth` không > 0.
- **⚙️ Render uptime** — `data.process.uptimePretty`.

> ⚠ `costMonth` của Bunny CDN là chuỗi `"~1"` → `Number("~1")` = `NaN` → bị đếm vào **free** và KHÔNG cộng vào total. Tổng động (~$119) = Render $95 + SePay $24 (các service cost dạng số).

### b) Render note tĩnh (hardcode trong HTML)

"Tất cả dịch vụ Render đều PAID — 3 web service (web2-api Standard $25 · n2store-fallback Standard $25 · web2-realtime Starter $7) + 2 Postgres Basic 1GB $19 = **$95/mo**. Paid ⇒ không idle-sleep…".

Kèm note thứ 2 (2026-07-02) — **Chuẩn debug browser**: đọc SOURCE qua `eval`/`feval`/DevTools MCP (DOM · CSS computed · network headers · console · cookies/storage · **delay/lag = Performance API** `longtask`/`paint`/`layout-shift`), screenshot CHỈ verify visual cuối; debug SSE dùng tab Realtime + `web2:_admin:sse-log` có sẵn, **KHÔNG bơm debug event vào SSE hub** (quá tải vô ích).

### c) DB live cards (`#sdDbGrid`)

Render bởi `renderDatabases(data.databases)` — duyệt từng pool (`chatDb`, `web2Db`). Mỗi card hiển thị:

- Provider: `chatDb` → "Render PG — n2store-chat-db"; còn lại → "Render PG — n2store-web2-db".
- Plan badge hardcode: "Basic 1GB · PAID ($19/mo)" (cả 2 đều paid, không có badge free).
- 📊 Dung lượng DB + usage bar so với **15 GB disk** (`DB_LIMITS`, Render API `diskSizeGB=15` — sửa 2026-06-28, trước đó hardcode 1GB báo sai 101.9%). Màu: `pct >= 80` → danger, `>= 60` → warn.
- 📁 Tổng bảng, 🔌 Connection pool (node-postgres internal: total · idle · waiting), ⚙️ DB connections (`pg_stat_activity` group by state).
- Top **8** bảng theo size (cột Tên/Rows/Size); >8 bảng → nút "Xem tất cả N bảng" (backend trả tối đa 10).
- Dòng đỏ ⚠️ nếu `stats.dbError`.

**Nguồn DB (live, server-side)** — `_dbStats(pool, name)` trong `render.com/routes/services-overview.js` chạy SQL thật trên từng pool: `pg_database_size()`, `pg_stat_user_tables` (top 10), `information_schema.tables` (count), `pg_stat_activity` (connections), `pool.totalCount/idleCount/waitingCount`. Mỗi query bọc `_safeQuery` try/catch; 2 pool chạy `Promise.all` để 1 pool fail không kill response.

### d) Service inventory cards (`#sdServiceGrid`)

Mỗi service 1 card: tên, badge cost (`$X/mo` paid vs Free), provider · plan, purpose, rows **Free Tier** (`s.freeTier`), rows **Paid** (`s.paidLimit`), link "→ Dashboard ngoài" nếu có `s.url`. Card click mở modal chi tiết.

### e) Backend process stats (`#sdProcGrid`)

4 stat card: 🕒 Uptime (`proc.uptimePretty`), 🧠 RSS Memory, 📦 Heap Used (used/total), 🟢 Node.js (`proc.nodeVersion`).

### Chi phí lấy từ đâu

- Nguồn: mảng tĩnh **`SERVICES_INVENTORY`** trong backend `services-overview.js` — mỗi service có `costMonth`, `plan`, `provider`, `freeTier`, `paidLimit`, `purpose`, `url`, `note`. **Hardcode trong backend** (cập nhật tay theo Render API), KHÔNG query Render billing runtime.
- Tổng /tháng (~$95) = 2× Postgres $19 + web2-api $25 + n2store-fallback $25 + web2-realtime $7.
- Inventory gồm: Render Postgres Web1 ($19), Render Postgres Web2 ($19), web2-api ($25), n2store-fallback ($25), web2-realtime ($7), Cloudflare Workers (Free), AI/LLM/TTS multi-provider (Free, pay-per-use ở note), SePay (Free), TPOS (subscription, costMonth 0), Firebase Firestore (Free Spark, legacy/drained), Firebase Auth (Free Spark), Bunny CDN (`~1`, chỉ AI KOL), GitHub Pages (Free).

### "Bấm coi chi tiết" = modal (KHÔNG expand inline)

Modal dùng chung tạo lazy (`_ensureModal`), đóng bằng backdrop/✕/Escape. Event delegation trên `#sdServiceGrid` + `#sdDbGrid` (idempotent, hỗ trợ Enter/Space):

- Click **service card** → modal chi tiết service (tags category, provider/gói/layer, purpose, free/paid tier, link dashboard).
- Click **dòng bảng DB** → modal chi tiết bảng (số dòng, dung lượng, data/index bytes, bytes/dòng, % của DB 1GB).
- Click **"Xem tất cả N bảng"** → modal bảng đầy đủ. ⚠ Dòng trong modal "xem tất cả" KHÔNG mở tiếp table modal (delegation chỉ gắn ở grid, không gắn trong modal).

### "AI widget"

Trang **KHÔNG có AI widget UI** (không load `web2-ai-assistant.js`, nút nổi ✨). "AI widget" chỉ là **data accessor**: `window.SystemServices.getData()` / `.data` trả `_lastData` (snapshot payload `services-overview` gần nhất) để AI assistant ngoài đọc nếu cần.

### Data load

- Live API: `WORKER = window.API_CONFIG.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev'`, `API = ${WORKER}/api/services-overview` → JSON `{ ok, ts, databases:{chatDb, web2Db}, process, services }`.
- Backend mount: `server.js` `app.use('/api/services-overview', servicesOverviewRoutes)`.
- **Auto-refresh 60s** (chỉ khi tab visible; dừng khi `pagehide`/`beforeunload`). Skeleton first-load qua `Web2Skeleton`.

---

## 3. Hạ tầng backend (Render services, DB pools, Worker, cron, chi phí)

> Nguồn canonical: `docs/guides/RENDER_SERVERS_GUIDE.md` (SPLIT 2026-06-14). Mọi service region **Singapore, always-on** (starter/standard không sleep).

### Render services (sau SPLIT 2026-06-14, Web1 ⊥ Web2)

| Service              | ID / URL                                                     | Plan          | Vai trò                                                                                                                                                                                                                    | Layer   |
| -------------------- | ------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **web2-api**         | `srv-d8n53oflk1mc739bi9gg` — `web2-api-kv04.onrender.com`    | web           | **Backend Web 2.0 chính**. Cùng codebase `render.com`, chạy cờ `WEB2_ONLY=1` (tắt mọi job Web 1.0). Có CẢ 2 pool (chatDb + web2Db).                                                                                        | Web 2.0 |
| **n2store-fallback** | `srv-d4e5pd3gk3sc73bgv600` — `n2store-fallback.onrender.com` | standard      | **Hub Web 1.0** (2 pool, 2 hub SSE, cron Web1, TPOS realtime). Cờ `DISABLE_WEB2_JOBS=1` + `WEB2_API_FORWARD_URL`. Vẫn mount route web2 (vô hại) nhưng KHÔNG chạy cron web2; forward web2 SSE notify (SePay) sang web2-api. | Web 1.0 |
| **web2-realtime**    | `srv-d8n45k4vikkc73cg3nrg` — rootDir `live-chat/server`      | web (starter) | Relay Pancake WS đa-account + Facebook Graph API v21.0 (private-reply, n2store chat) cho Web 2.0. Cờ `FALLBACK_BASE=web2-api`. Hợp nhất 2 service cũ (tpos-pancake + facebook).                                            | Web 2.0 |
| **n2store-realtime** | `n2store-realtime.onrender.com`                              | web (starter) | WS proxy Pancake cho **inbox Web 1.0** (pending_customers/livestream/labels). DB Postgres riêng. KHÔNG gộp với web2-realtime.                                                                                              | Web 1.0 |

**Mấu chốt:**

- 2 cờ env: `WEB2_ONLY=1` (web2-api, tắt job Web1) · `DISABLE_WEB2_JOBS=1` (fallback, tắt cron Web2). Unset cả 2 = hành vi monolith cũ.
- **Worker quyết định traffic đi đâu** (web2-api vs fallback), không phải bản thân các service.
- **Service đã XÓA (2026-06-14):** `n2store-tpos-pancake`, `n2store-facebook` (gộp vào web2-realtime), `n2store-aikol-scraper` (suspended → xóa).

### DB pools

| Pool       | Render Postgres                                                   | DB / kích thước                    | Layer   | Cấu hình                                                                          |
| ---------- | ----------------------------------------------------------------- | ---------------------------------- | ------- | --------------------------------------------------------------------------------- |
| **web2Db** | `n2store-web2-db` (`dpg-d8d7besp3tds73f8gr60-a`, basic_1gb, PG18) | `n2store_web2` (~161 MB, ~43 bảng) | Web 2.0 | `render.com/db/web2-pool.js`, env `WEB2_DATABASE_URL`, max 10, TIMESTAMP→`+07:00` |
| **chatDb** | `n2store-chat-db` (`n2store_chat`)                                | DB Web 1.0                         | Web 1.0 | env `DATABASE_URL`, max 20, idle 30s, OID 1114→`+07:00`                           |

- Tách hẳn DB-level từ 2026-06-03. Accessor route/service Web 2.0: `const db = req.app.locals.web2Db || req.app.locals.chatDb;` (KHÔNG `chatDb` trần). Route Web 1.0 dùng `chatDb` THUẦN, KHÔNG fallback web2Db (tránh đọc bản copy stale → mất data).
- **Guard 3W7** (`server.js`): thiếu `WEB2_DATABASE_URL` → fallback chatDb (nguy hiểm prod Web1); cờ `WEB2_REQUIRE_DB=1` (đã bật web2-api) → fail-fast `exit(1)`.
- KHÔNG có file schema gộp — mỗi route/service tự `ensureTables()` idempotent mỗi boot.
- Bảng lớn nhất (live): `web2_customers` 64.3k rows/35MB, `livestream_snapshots` 73MB, `social_orders` 25MB, `web2_live_comments` 7.6k.
- **Firebase:** ~95% đã bỏ khỏi Web 2.0. Active duy nhất: `web2-realtime` đọc Firestore `pancake_tokens/accounts` lúc boot lấy token Pancake (fallback PG `realtime_credentials`, dùng chung Web 1.0). Zalo session → Postgres `web2_zalo_accounts.session`. Doc `web2_*/main` cũ còn vật lý nhưng drained.

### Cloudflare Worker `chatomni-proxy`

- URL `https://chatomni-proxy.nhijudyshop.workers.dev`, entry `cloudflare-worker/worker.js`. **Proxy CHUNG cả 2 layer** (CORS bypass + header/credential injection cho TPOS/Pancake/Facebook/AI/SePay + forward sang Render).
- Routing (`renderOriginFor(pathname)`):
    - **`isWeb2Path` → web2-api**: `/api/web2*`, `native-orders`, `fast-sale-orders`, `delivery-invoices`, `refunds`, `reconcile`, `wallet-deposits`, `purchase-refund`, `services-overview`, `livestream`, `realtime/web2`, và `/api/v2/(notifications|audit-log|supplier-aging|dashboard-kpi|smart-match|inventory-forecast|supplier-360|cart|kpi|web2-)`.
    - Còn lại → fallback (n2store-fallback, Web 1.0).
- **Catch-all `TPOS_GENERIC`** (exact → prefix → catch-all): `/api/*` không khớp → proxy `tomato.tpos.vn` (GET/DELETE retry 3×/15s; POST/PUT/PATCH KHÔNG retry, 60s). **KHÔNG xóa** — Web 1.0 vẫn dùng TPOS thật; route Web 2.0 match path tường minh TRƯỚC catch-all.
- Worker KHÔNG có cron. Worker CHỈ proxy sang n2store-fallback (+ web2-api) và n2store-realtime (`/api/realtime/*`). `web2-realtime` được frontend gọi **TRỰC TIẾP** (không qua worker).

### Cron jobs

- **Cron Web 2.0** (chạy web2-api; tắt trên fallback bởi `DISABLE_WEB2_JOBS=1`) — 6 nhóm: `sepay retry/reprocess`, `livestream-poller`, `pancake-refresh`, `unread-reconcile`, `msg-send-worker`, `noti-scan`. ⚠ MEMORY ghi Web 2.0 "đã bỏ hẳn poller nền, event-driven only" — `web2-livestream-poller.js` `start()` không schedule loop nữa (chỉ on-demand).
- **Cron Web 1.0** (n2store-fallback, `cron/scheduler.js`) — 9 job (để phân biệt): expire virtual credits (1h), check deadline NVC (6h), backup bank→wallet (5p), retry pending withdrawals (5p), fraud detection (2AM), RETURN_SHIPPER tickets (9AM), cleanup recent_transfer_phones (3AM), cleanup tpos_order_buffer (4AM), incremental sync TPOS products → web_warehouse (30p).

### Chi phí (theo docs)

- Consolidation 2026-06-14: bỏ `n2store-facebook` ($7/tháng) + `n2store-tpos-pancake` ($7/tháng), gộp thành `web2-realtime` ($7/tháng) ⇒ **tiết kiệm −$7/tháng**; `n2store-aikol-scraper` xóa hẳn.
- Theo registry bên thứ 3: Render Backend Starter (n2store-fallback) ~$7/tháng; mỗi Render Postgres Basic 1GB ~$19/tháng (Singapore). (Dashboard inventory ghi web2-api/n2store-fallback Standard $25 + web2-realtime $7 → tổng strip ~$95.)

---

## 4. Realtime SSE (2 hub + topics)

Web 2.0 dùng **SSE** thay Firebase Firestore listener (Render flat-rate vs Firestore tính theo reads). Từ **2026-05-26** tách 2 hub độc lập web1/web2.

| Aspect       | Web 1.0                                                                                          | Web 2.0                                                           |
| ------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Server file  | `routes/realtime-sse.js`                                                                         | `routes/realtime-sse-web2.js`                                     |
| Endpoint     | `/api/realtime/sse?keys=...`                                                                     | `/api/realtime/web2/sse?keys=...`                                 |
| Topic naming | bare snake_case (`celebration`, `kpi_statistics`, `tickets`, `web_warehouse`, `wallet:<phone>`…) | prefix `web2:`                                                    |
| Log prefix   | `[SSE]`                                                                                          | `[SSE-WEB2]`                                                      |
| Publish      | `realtimeSseRoutes.notifyClients(topic, data)`                                                   | `web2RealtimeSseRoutes.notifyClients(topic, data)`                |
| Subscribe    | `new EventSource(...)` / `RealtimeClient`                                                        | `Web2SSE.subscribe('web2:foo', cb)` (bridge `web2-sse-bridge.js`) |

- **Topic convention:** `web2:<entity>` (global) hoặc `web2:<entity>:<id>` (per-instance, giảm broadcast scope). Bắt buộc prefix `web2:`.
- **Topic web2:\* active:** `web2:products`, `web2:variants`, `web2:users`, `web2:native-orders`, `web2:fast-sale-orders` (PBH dùng WS qua `PbhRealtime`), `web2:<slug>` (**78 generic** qua page-builder), `web2:cart`, `web2:notifications`, `web2:reconcile`, `web2:purchase-refund`, `web2:livestream-snapshots`, `web2:customer-wallet` + `web2:wallet:<phone>` / `wallet:all` (wildcard `wallet:*`), `web2:_admin:sse-log` (feed Admin SSE Monitor).
- **Cross-instance:** hub SSE in-RAM per-process → fan-out qua Postgres LISTEN/NOTIFY channel `web2_sse`. SePay → Web 2.0 wallet CHỈ qua `web2WalletEvents` (đã remove cross-publish từ legacy `walletEvents`).

---

## 5. Bên thứ 3 (nhóm + số lượng)

Registry curated auto-gen (2026-06-24): **70 bên thứ 3** · Web 2.0: 64 · Web 1.0: 16 · Free: 44 · Trả phí/freemium: 26 (freemium 18, paid 8). byLayer: web2 54, web1 6, both 10. byStatus: active 67, dormant 3. `envKeys` chỉ là TÊN biến (giá trị ở `serect_dont_push.txt`).

| Nhóm                     | Số  | Tiêu biểu / chi phí                                                                                                                                                                                                                                                       |
| ------------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI / LLM**             | 7   | Gemini (Chat + Nano Banana, ~1500 req/ngày/key; KEY5 = pool paid), Groq (~30 req/phút, ≤10 key), OpenRouter (29+ model `:free`), **DeepSeek (paid, pay-per-token)**, Cloudflare Workers AI (~10k neurons/ngày, ẩn), ChatAnywhere (~200 req/ngày), Google Translate public |
| **Giọng nói / TTS**      | 4   | ElevenLabs (~10k credits/tháng/key, ×3, cooldown 1h), Vivibe/Lucy Lab TTS Pro (async, route ẩn `/api/web2-tts-pro` nhãn "Giọng AI Pro"), VieNeu-TTS (voice cloning, AGPL/NC, self-host máy shop + cloudflared), VITS-web/Piper (on-device)                                |
| **Tạo media AI**         | 7   | Nano Banana/Gemini Image (**paid**, gemini-2.5-flash-image), FAL.ai BiRefNet (MIT), PhotoRoom, Remove.bg/withoutbg (~50 ảnh/tháng/key), Pollinations, Photopea, DiceBear (CC0)                                                                                            |
| **Kho ảnh/video**        | 3   | Pexels (CC0, ×n key), Pixabay (CC0, ×n key), Unsplash (không key)                                                                                                                                                                                                         |
| **Nhắn tin / MXH**       | 3   | Facebook Graph API v21.0, Telegram Bot, Zalo (zca-js + OA/ZNS)                                                                                                                                                                                                            |
| **Bán hàng / TPOS**      | 2   | TPOS OData (**paid**, subscription; Web 2.0 chỉ đọc qua proxy), Pancake CRM/Pages.fm                                                                                                                                                                                      |
| **Thanh toán**           | 2   | **SePay** (2 kênh độc lập shop/Home, webhook → balance_history), VietQR/vietqr.io                                                                                                                                                                                         |
| **Thư viện CDN**         | 6   | Bootstrap v5.3.0 (web1), Chart.js v4.4.x, jszip v3.10.1, Lucide v0.294.0, mp4-muxer v5, Sortable.js v1.15.0                                                                                                                                                               |
| **Model ML on-device**   | 6   | @imgly/background-removal (AGPL), Transformers.js (Apache-2.0), MediaPipe Tasks Vision, SlimSAM, TensorFlow.js, UpscalerJS+ESRGAN                                                                                                                                         |
| **Open-source / GitHub** | 14  | MoneyPrinterTurbo, Motion (Framer Motion v11), SheetJS/XLSX, jsPDF, JsBarcode, QRCode.js, html2canvas, tesseract.js, opencv.js, ReceiptLine, Lottie Web, Confetti, Filerobot, barcode-detector                                                                            |
| **Hạ tầng / Platform**   | 10  | CF Worker (chatomni-proxy), Render Backend + 2 Postgres, Firebase Auth (Spark 50k MAU), GitHub Pages (100GB/tháng), jsDelivr, Bunny CDN (AI KOL/web1, ~$0.01/GB storage), Firestore + Storage (**dormant**)                                                               |
| **Font**                 | 2   | Google Fonts, Font Awesome (web1)                                                                                                                                                                                                                                         |
| **Khác**                 | 4   | Google Cloud Vision (~1000 units/tháng), Goong.io Geocoding (địa chỉ VN), J&T Express Tracking, Google Maps (**dormant**)                                                                                                                                                 |

- Đa số dùng **multi-key rotation** (Gemini ×5, Groq ×3, ElevenLabs ×3, Vivibe ×5, Pexels/Pixabay ×n).
- File registry còn ghi 9 `servicesAuditFindings` về dữ liệu lỗi thời trong `services-overview.js` (2 CRITICAL: Firestore vẫn ghi active storage Web 2.0; web2Db purpose sai "78+ entities". HIGH: thiếu 10+ service AI/media; Firebase Auth "Web 2.0 fallback" sai sau migrate. MEDIUM/LOW: duplicate Postgres, Cloudflare Workers purpose cũ, thiếu SePay/Bunny note, GitHub Pages giờ là nhijudy.store).

---

## 6. Shared modules chính (`web2/shared/`, 139 modules)

Quy tắc: cần capability → tra registry TRƯỚC, tái dùng KHÔNG viết lại. Module dùng nhiều nhất (số consumers):

- **Hạ tầng/nền tảng:** `Web2Auth` / `WEB2_CONFIG` / `API_CONFIG` (`web2-auth.js`, token + page guard + **1 nguồn base-URL**) — **133** · `Web2SSE` (`web2-sse-bridge.js`) — **63** · `Web2Escape` — 50 · `Web2Skeleton` — 34 · `Web2Format` (tiền/ngày GMT+7) — 20 · `Web2Sidebar` — 16.
- **UI/mutation:** `Popup` (`popup.js`, PHẢI await) — **57** · `Web2Optimistic` (UI-first + rollback) — **25** · `Web2UserInfo` — 24 · `Web2AuditLog` — 20 · `Web2NumberInput` — 16 · `Web2HistoryTimeline` — 8.
- **Chat:** `Web2Chat` (`web2-chat-client.js`, Pancake chat + tags) — **41** · `Web2ChatPanel` (chat-panel/) — 13 · `Web2CustomerChat` — 12 · `WZChat` (zalo-chat/, 11 file).
- **Data/cache:** `Web2ProductsCache` — 23 · `Web2WalletBalance` — 19 · `Web2VariantsCache` — 14 · `Web2ProductsApi` — 12 · `Web2CustomerStore` — 12 · `Web2SuppliersCache` — 9 · `Web2SmartCache` (SWR+IDB+SSE) — 7 · `Web2IdbStore` — 5.
- **Nghiệp vụ tái dùng:** `Web2QR` / `Web2QrModal` · `Web2BarcodeScanner` · `Web2ProductCounter` / `Web2PackCounter` (on-device) · `Web2Lottie` · `Web2Effects` · `Web2ProductCode` · `Web2Campaign` · `Web2LabelOcr`.
- **Media/AI helpers:** `Web2AiAssistant` (nút nổi ✨) · `Web2AiDescribe` · `Web2BgRemover` · `Web2ImageEditor` · `Web2Vieneu` · `Web2VideoRender` (HTML→MP4) · `Web2BeautyStudio/Filters/Face`.

**Totals codemap (web2-modules.json):** sharedModules 139 · pages 44 · backendRoutes 59 · backendServices 35 · frontendFiles 438 · functions 3496. Trang lớn nhất: `web2/shared` (139 file/41.679 dòng), `live-chat` (86 file/23.814 dòng), `so-order` (25 file/7.426 dòng), `native-orders` (21 file/7.208 dòng, dùng 25 shared — cao nhất).

---

## 7. Những điểm ĐÁNG CHÚ Ý / dễ nhầm (gotchas)

- **Tab Services = LIVE API** `${WORKER}/api/services-overview` (refresh 60s). Chỉ các tab Modules/Bên-thứ-3 mới đọc `web2/system/data/*.json`. Tab Pages đọc DOM sidebar, tab SSE poll stats.
- **Chi phí là HARDCODE** trong `SERVICES_INVENTORY` (backend), KHÔNG query Render billing runtime — phải cập nhật tay khi đổi plan.
- **Bunny CDN `costMonth = "~1"` (string)** → `NaN` → bị tính vào FREE, không cộng vào tổng. Đừng tin "đang dùng free" cho Bunny.
- **DB usage bar so với hằng số 15GB cứng** (`DB_LIMITS`, khớp Render API `diskSizeGB=15` tại 2026-06-28), không đọc plan thật runtime → nếu đổi plan disk, phải sửa tay `DB_DISK_BYTES` trong `system-services.js`.
- **Chi tiết = modal**, KHÔNG expand inline. Dòng bảng trong modal "Xem tất cả N bảng" KHÔNG click mở tiếp được (delegation chỉ ở grid).
- **"AI widget" KHÔNG có UI** — chỉ là accessor `SystemServices.getData()`.
- **web2-api vs n2store-fallback:** web2-api là nơi backend Web 2.0 THỰC SỰ chạy (route + hub SSE web2 + cron web2). n2store-fallback vẫn mount route web2 nhưng vô hại. **Worker** mới là nơi định tuyến.
- **2 cờ env tách layer:** `WEB2_ONLY=1` (web2-api) · `DISABLE_WEB2_JOBS=1` (fallback). Sai cờ = chạy trùng job hoặc thiếu cron.
- **DB pool accessor:** route Web 2.0 LUÔN `web2Db || chatDb`; route Web 1.0 dùng `chatDb` THUẦN. Đổi pool Web1 sang web2Db = đọc bản copy stale → **mất data** (đã xảy ra với inventory-tracking).
- **`TPOS_GENERIC` catch-all KHÔNG được xóa** — Web 1.0 vẫn dùng TPOS thật. Route Web 2.0 match path tường minh TRƯỚC catch-all.
- **`web2-realtime` gọi TRỰC TIẾP từ frontend** (không qua worker). Đừng giả định mọi traffic đều qua chatomni-proxy.
- **Firebase Web 2.0 ~95% đã bỏ** (giờ Postgres web2Db + SSE). CHỈ còn `web2-realtime` đọc Firestore `pancake_tokens/accounts` lúc boot. Mọi tài liệu/comment ghi "Firestore cho Web 2.0" là STALE.
- **SSE 2 hub tách hẳn:** topic `web2:*` chỉ qua hub web2; bare snake_case chỉ qua hub web1. KHÔNG trộn `notifyClients`.
- **SSE cross-instance** qua Postgres LISTEN/NOTIFY `web2_sse` (hub in-RAM per-process). Nhiều instance không tự thấy nhau nếu thiếu fan-out này.
- **Web 2.0 = beta, data `web2_*` được phép wipe/recreate**, nhưng Web 1.0 (chatDb, bảng không prefix web2\_) là PROD thật — bảo toàn tuyệt đối.
- **Service đã XÓA 2026-06-14:** `n2store-tpos-pancake`, `n2store-facebook`, `n2store-aikol-scraper` — đừng tham chiếu.
- **Múi giờ GMT+7:** UI hiển thị `Asia/Ho_Chi_Minh`; lưu DB epoch/UTC. Render server chạy `TZ=Asia/Saigon` (+7), KHÔNG UTC; Pancake `inserted_at` thiếu hậu tố `Z`.

---

## 8. Mã sản phẩm & Per-Unit QR (cách thức vận hành — tham chiếu)

> Chi tiết đầy đủ: [`KB-PRODUCT-CODE-UNITS.md`](KB-PRODUCT-CODE-UNITS.md). Đây là **cách thức vận hành mã SP của Web 2.0** — đọc TRƯỚC khi đụng mint / mã SP / Sổ Order / Kho SP / unit-scan.

- **2 con số đừng nhầm**: mã SP (`KHOAODEN`, `Web2ProductCode`) · mã đơn vị (`KHOAODEN-001`, 1/món) · STT kệ (`campaign_stt`).
- **MINT theo SL kho (2026-06-29)**: SP có SL N → tự tạo `<code>-001..<code>-N` lúc **TẠO SP** (so-order qua `upsert-pending`, Kho SP qua create/adjust). Cơ chế: `ensureUnits` (top-up, KHÔNG shrink) + hook `_syncUnits` ở 7 handler `web2-products` + `POST /ensure` cho client. so-order/Kho SP print dùng `/ensure` (bỏ mint per-shipment cũ).
- **Gán giỏ**: `reconcileOrderUnits` chọn **seq nhỏ nhất** (`ORDER BY u.seq`), unit bỏ khỏi giỏ → tái dùng số nhỏ trước. STT kệ = `shelfStt()` (`lib/web2-shelf-stt.js`, 1 nguồn).
- **In tem dùng chung** `Web2ProductsPrint` (QR `?u=<id>`); quét ở **unit-scan**. ⚠ Kho SP có 3 nút in (per-row/bulk/in-lại) **có thể gộp bớt** sau khi model "units = SL" — xem §6 KB-PRODUCT-CODE-UNITS.
- **Backend**: `/api/web2-product-units` chạy web2-api · pool `web2Db||chatDb` · SSE `web2:product-units`.

## Cách dùng tài liệu này

- **(a) NotebookLM:** upload file `.md` này lên NotebookLM làm **nguồn** để hỏi-đáp (vd "Web 2.0 tốn bao nhiêu /tháng?", "web2-api khác n2store-fallback chỗ nào?", "topic SSE nào dùng cho ví?"). Mọi con số/tên service/chi phí trong file lấy nguyên từ báo cáo nội bộ.
- **(b) Claude (đọc trước khi code):** Claude tự đọc file này trong repo TRƯỚC khi sửa phần `web2/system/` (đặc biệt tab Services), `render.com/routes/services-overview.js`, hoặc bất kỳ thay đổi hạ tầng/dịch vụ/SSE/bên-thứ-3 Web 2.0 — để nắm topology, nguồn data, cờ env và các gotcha ở §7. Khi đổi cấu trúc module → sinh lại codemap (`node scripts/gen-web2-codemap.js`) rồi `node scripts/gen-web2-system-data.js`.
