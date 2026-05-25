# Project Instructions for Claude Code

## Session Resume Protocol — BẮT BUỘC

> Mục đích: nối context giữa các đoạn hội thoại Claude. Token ngắn paste tay; file markdown trong git chứa context đầy đủ.

**Khi tạo (Claude làm, không cần user yêu cầu):**

- Sau MỖI lần `commit + push` xong → chạy `bash scripts/save-session-resume.sh "<1-dòng summary>"`
- Script tự sinh `docs/sessions/<YYYYMMDD-HHMMSS>-<sha7>.md` + commit + push
- In token ra cuối câu trả lời: `🔗 RESUME:<YYYYMMDD-HHMMSS>-<sha7>` (ví dụ `RESUME:20260513-094400-2f8a169`)
- Sau khi script chạy, MỞ file vừa sinh, điền các mục **Key Decisions / Next Steps / Context Pointers** cho chi tiết (script chỉ fill metadata + file list).

**Khi đọc (Claude nhận diện) — CHAIN WALKING:**

- Nếu user paste chuỗi match regex `RESUME:[0-9]{8}-[0-9]{6}-[a-f0-9]{7}` trong chat mới:
    1. `Read` file `docs/sessions/<token>.md`.
    2. Xem section **"7. Previous Session (Chain Pointer)"** — nếu có Previous ≠ "INITIAL" → `Read` luôn file previous đó.
    3. Lặp lại bước 2 tối đa **3 levels** mặc định (token cuối → previous → previous previous). Tránh context bloat.
    4. Nếu user nói "đọc full chain" / "đi hết chain" → walk hết tới INITIAL.
    5. Tóm tắt 2-3 câu tổng hợp các session đã đọc → confirm hiểu đúng → tiếp tục từ "Next Steps" của session **gần nhất** (file user paste).
- File không tồn tại → báo lỗi, KHÔNG đoán mò.

**Vì sao chain walking:** 1 conversation có thể tạo nhiều token (mỗi turn Stop hook fire 1 lần). Mỗi session file có link đến previous, nên paste 1 token cuối là Claude tự lần ngược đủ context, không cần user paste nhiều token.

**Format & rationale**: xem [`docs/sessions/README.md`](docs/sessions/README.md). Tóm: dùng token+file md thay vì base64/hash thô vì hash 1-chiều, base64 transcript đầy đủ quá dài để paste; token ~30 ký tự + file structured có thể chứa context lớn, được git track.

### Folder Snapshot — BẮT BUỘC đọc TRƯỚC khi code phần mới

Script `save-session-resume.sh` ngoài việc sinh file session token còn tự ghi đè `docs/sessions/latest/<folder>.md` cho mỗi folder bị chạm trong commit. File snapshot chứa context cô đọng cho folder đó: latest session token, commit, files changed, 5 commits gần nhất chạm folder.

**Khi code/edit phần mới trong folder X — BẮT BUỘC:**

Trước khi `Edit`/`Write` file trong folder X, **PHẢI `Read` `docs/sessions/latest/<X>.md` TRƯỚC** để hiểu folder/trang đó làm gì, tránh sửa sai logic vì thiếu context.

**Mapping folder → snapshot:**

- Root files (CLAUDE.md, README, scripts root-level, …) → [`docs/sessions/latest/_root.md`](docs/sessions/latest/_root.md)
- `so-order/` → [`docs/sessions/latest/so-order.md`](docs/sessions/latest/so-order.md)
- `web2/`, `web2/shared/`, `web2/products/`, `web2/variants/` → snapshot cùng tên
- `native-orders/`, `tpos-pancake/`, `scripts/`, `docs/` → snapshot cùng tên
- **Index toàn bộ**: [`docs/sessions/latest/_all.md`](docs/sessions/latest/_all.md)

**Workflow:**

1. `Read` `docs/sessions/latest/<folder>.md` → lấy latest session token + commits gần nhất + files changed.
2. Nếu cần Next Steps đầy đủ → `Read` 1 hop tới file session được pointer trỏ tới (không walk chain quá 1 level).
3. Code tiếp với context đã hiểu.

**Không áp dụng khi:** fix typo 1 dòng, user chỉ rõ file/dòng cụ thể, folder hoàn toàn mới chưa có snapshot.

**Khi user paste path `docs/sessions/latest/<folder>.md` hoặc nói "đọc latest <folder>":** workflow giống trên — `Read` snapshot, tóm tắt 2-3 câu, confirm hiểu, tiếp tục.

**Fallback session cũ chết** (vd lỗi `dimension limit for many-image requests`): session mới chỉ cần đọc 1 file snapshot là có đủ context — không cần paste token, không cần walk chain.

File snapshot là **machine-generated, không edit thủ công** — sẽ bị ghi đè lần commit sau.

---

## Documentation to Read

When working on this project, always reference the documentation in `/docs` folder for understanding the project structure and conventions.

### Key Documentation Files:

- `docs/` - Contains comprehensive documentation about all modules and folders
- `docs/architecture/DATA-SYNCHRONIZATION.md` - Data sync patterns (localStorage + Firebase real-time)
- `docs/cloudflare/cloudflare.md` - Cloudflare Worker (chatomni-proxy) — routes, integrations, error handling
- `docs/render/render.md` - Render.com API Server — endpoints, services, cron, WebSocket, SSE
- `shared/README.md` - Shared library documentation (auth, cache, utils, TPOS client)

### Pancake / TPOS Reference (BẮT BUỘC)

Khi code liên quan đến **Pancake** hoặc **TPOS**, **PHẢI đọc mục lục** của 2 file sau trước khi code:

- `docs/pancake/PancakeWebsite.md` — Mục lục Pancake (API, webhooks, modules)
- `docs/tpos/TposWebsite.md` — Mục lục TPOS (controllers, OData, modules, integrations)

Điều này giúp hiểu rõ cấu trúc, tìm đúng API/endpoint, tránh code sai logic.

## Shared Library Structure

Project sử dụng shared library tại `/shared/` folder. **KHÔNG TẠO FILE auth.js, cache.js, notification-system.js trong các folder riêng** - luôn dùng shared versions.

```
/shared/
├── universal/      # ES Modules - Works in Browser + Node.js
├── browser/        # ES Modules - Browser only (SOURCE OF TRUTH)
├── js/             # Legacy Script-Tag Compatible (window.*)
├── node/           # ES Modules - Node.js only
└── README.md
```

### Import Paths (Script Tags)

```html
<!-- Core utilities -->
<script src="../shared/js/core-loader.js"></script>
<script src="../shared/js/navigation-modern.js"></script>
<script src="../shared/js/common-utils.js"></script>

<!-- Auth, Cache, Notification - ALWAYS use shared versions -->
<script src="../shared/js/shared-auth-manager.js"></script>
<script src="../shared/js/shared-cache-manager.js"></script>
<script src="../shared/js/notification-system.js"></script>

<!-- Firebase -->
<script src="../shared/js/firebase-config.js"></script>
```

### Import Paths (ES Modules)

```javascript
import { AuthManager, CommonUtils } from '/shared/browser/index.js';
import { TPOSClient, fetchWithRetry } from '/shared/universal/index.js';
import { initializeFirestore, initializeRealtimeDB } from '/shared/browser/firebase-config.js';
import { getNotificationManager } from '/shared/browser/notification-system.js';
```

### Troubleshooting - Lỗi Import Path

Nếu gặp lỗi như:

- `404 Not Found` khi load script
- `Module not found`
- `Cannot resolve module`
- `AuthManager is not defined`
- `notificationManager is not defined`

**Kiểm tra:**

1. Đường dẫn script trong HTML phải là `../shared/js/...` (không phải local file)
2. ES Module imports phải trỏ đến `/shared/browser/` hoặc `/shared/universal/`
3. Chạy các lệnh sau để tìm paths sai:

```bash
# Tìm local auth.js references
grep -r 'src="auth.js"' . --include="*.html"

# Tìm local cache.js references
grep -r 'src="cache.js"' . --include="*.html"

# Tìm local notification-system.js references
grep -r 'src="notification-system.js"' . --include="*.html" | grep -v shared
```

### Source of Truth

| Loại         | ES Module (SOURCE OF TRUTH)              | Script-Tag Version                   |
| ------------ | ---------------------------------------- | ------------------------------------ |
| Auth         | `/shared/browser/auth-manager.js`        | `/shared/js/shared-auth-manager.js`  |
| Cache        | `/shared/browser/persistent-cache.js`    | `/shared/js/shared-cache-manager.js` |
| Notification | `/shared/browser/notification-system.js` | `/shared/js/notification-system.js`  |
| Firebase     | `/shared/browser/firebase-config.js`     | `/shared/js/firebase-config.js`      |
| Logger       | `/shared/browser/logger.js`              | `/shared/js/logger.js`               |
| DOM Utils    | `/shared/browser/dom-utils.js`           | `/shared/js/dom-utils.js`            |
| Common Utils | `/shared/browser/common-utils.js`        | `/shared/js/common-utils.js`         |
| TPOS Client  | `/shared/universal/tpos-client.js`       | `/shared/js/tpos-config.js`          |

### QUAN TRỌNG: Không tạo file duplicate

**KHÔNG BAO GIỜ** tạo các file sau trong folder riêng:

- `auth.js` - Dùng `../shared/js/shared-auth-manager.js`
- `cache.js` - Dùng `../shared/js/shared-cache-manager.js`
- `notification-system.js` - Dùng `../shared/js/notification-system.js`

Các file này đã được consolidated vào shared library và các folders đã được migrate.

## Module-Specific Instructions

### orders-report Module

When working in the `orders-report/` directory, always read these files first:

- `orders-report/.ai-instructions.md` - AI-specific coding instructions
- `orders-report/ARCHITECTURE.md` - System architecture overview
- `orders-report/MODULE_MAP.md` - Module structure and dependencies

## File Organization

### Separate CSS and JS Files for New Features

Khi code phần mới (feature, module, page mới), **luôn hỏi người dùng** trước khi tạo file:

- Có muốn tạo file CSS riêng cho phần này không? (ví dụ: `feature-name.css`)
- Có muốn tạo file JS riêng cho phần này không? (ví dụ: `feature-name.js`)

Điều này giúp:

- Tách biệt code, dễ bảo trì
- Tránh file CSS/JS chính trở nên quá lớn
- Dễ debug và tìm kiếm code

## Database

Use environment variables or `.pgpass` file for PostgreSQL credentials. Never hardcode passwords.

## API Keys / Secrets — BẮT BUỘC

**File chứa toàn bộ API key local:** `/Users/mac/Desktop/n2store/serect_dont_push.txt` (gitignored, absolute path).

Khi cần bất kỳ key/token/credential nào (Render, Firebase, Cloudflare, Gemini, OpenAI, TPOS, Pancake, SePay, …) → **đọc file này TRƯỚC** rồi mới hỏi user.

**Rules:**

- Nếu user nhắc "key", "token", "secret", "credential", "API" mà không chỉ rõ nguồn → mở `serect_dont_push.txt` trước
- Nếu file **chưa tồn tại** → tạo file rỗng tại path trên + báo user paste key vào (không tự bịa)
- Khi cần thêm/cập nhật key → edit file in place
- **TUYỆT ĐỐI KHÔNG**:
    - Echo / log / paste nội dung file vào commit, PR, chat, screenshot
    - Commit file (đã có trong `.gitignore`)
    - Pass key qua command line nơi có thể lộ qua process list — dùng env var hoặc stdin
    - Hardcode key vào code source — kể cả test script

Format hiện tại: 1 key/dòng dạng `LABEL=value` hoặc block "## Service Name\n key: ...". Free-form, miễn là Claude tìm được bằng grep.

## Dev Log — Theo dõi tiến trình code

**BẮT BUỘC:** Sau mỗi lần sửa code (commit), cập nhật `docs/dev-log.md`:

- Thêm entry mới ở **đầu** file (mới nhất ở trên)
- Format: `### [Mô tả]` + Files + Chi tiết + Status
- Nếu ngày mới, thêm heading `## [NGÀY]`

Đây là file theo dõi liên tục — mọi thay đổi code đều phải ghi lại.

## Web 2.0 vs Legacy — Quy ước phân biệt (BẮT BUỘC)

Project có 2 layer song song. Khi chạm code/data phải biết nó thuộc layer nào để KHÔNG share/conflate.

### Web 2.0 — thuộc về

**Folders** (đều thuộc Web 2.0):

- `web2/` — TPOS-clone pages + 2 ví mới (`supplier-wallet/`, `customer-wallet/`)
- `web2/shared/` — shared sidebar, page-shell, api client, caches
- `web2/products/` — Kho SP riêng Web 2.0
- `web2/variants/` — Kho Biến Thể riêng
- `so-order/` — Sổ Order shop dùng để mua hàng từ NCC
- `native-orders/` — Đơn Web của shop (tạo PBH)
- `tpos-pancake/` — TPOS × Pancake reconciliation

**API / Render routes**:

- Có prefix `web2`: `/api/web2-products`, `/api/web2-variants`, `/api/web2/:entity` (generic)
- Liên quan Web 2.0 nhưng KHÔNG prefix (legacy, đã có sẵn — đừng dời): `/api/native-orders`, `/api/fast-sale-orders` (PBH), `/api/wallet-deposits`
- Bằng chứng "thuộc Web 2.0" khi không có prefix: comment `// WEB2.0 MODULE` ở đầu file route.

**Postgres tables**:

- Có prefix `web2_`: `web2_products`, `web2_variants`, `web2_records`, `web2_entities`
- Liên quan Web 2.0 nhưng KHÔNG prefix (legacy): `native_orders`, `fast_sale_orders`, `balance_history` (SePay)

**Firestore collections** (Web 2.0 data — **convention thống nhất `web2_` prefix từ 2026-05-25**):

- `web2_so_order/main` — Sổ Order (rename từ `so_order_v2`)
- `web2_supplier_wallet/main` — Ví NCC (rename từ `supplier_wallet_v1`)
- `web2_customer_wallet/main` — Ví KH (rename từ `customer_wallet_v1`)
- `web2_suppliers/main` — Danh sách NCC (rename từ `suppliers_v1`)
- Mọi Firestore collection mới của Web 2.0 PHẢI dùng prefix `web2_`. **Không dùng suffix `_v1`/`_v2`** — gây confuse với "Web 1.0/2.0".

> Lý do rename: suffix `_v1` thoạt nhìn giống "Web 1.0". Chuẩn hoá sang prefix `web2_` cho rõ. Lịch sử: xem [docs/dev-log.md](docs/dev-log.md) entry 2026-05-25.

### Legacy N2Store — không phải Web 2.0

`orders-report/`, `inbox/`, `chat/`, `library/`, `home/`, `auth/`, `account/`, `shared/` (auth/cache/notification dùng chung), `cloudflare-worker/` (proxy chung cho cả 2 layer).

### Quy tắc khi code

1. **Marker bắt buộc cho file mới Web 2.0**: thêm token `WEB2.0` vào #Note header.
    - Vd: `// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.`
2. **Đặt tên DB table/Firestore mới**: prefix `web2_` cho CẢ Postgres VÀ Firestore. Không dùng suffix `_v1`/`_v2` cho Firestore nữa (đã rename 2026-05-25 — xem dev-log).
3. **API route mới**: prefix `/api/web2-...` hoặc `/api/web2/...`. Nếu phải dùng tên trung tính (vd `wallet-deposits`) → comment đầu file `// WEB2.0 MODULE`.
4. **Không cross-import**: legacy/orders-report KHÔNG được import code từ web2/, web2/shared/, supplier-wallet/, customer-wallet/. Ngược lại OK (web2 dùng `shared/js/...` được vì shared là chung).
5. **Khi sửa file legacy**: dừng lại hỏi user nếu thay đổi có thể ảnh hưởng web2 (và ngược lại).
6. **Realtime / Data sync — BẮT BUỘC**: KHÔNG dùng Firebase Firestore listener cho Web 2.0 nữa. Web 2.0 dùng **SSE pub/sub trên Render** (topic-based). Trước khi code bất kỳ feature nào liên quan realtime, cross-tab sync, listener data → **PHẢI đọc [`docs/web2/SSE-REALTIME.md`](docs/web2/SSE-REALTIME.md)** (architecture + recipe server/client + topic naming + migration checklist + verification). Topic convention: `web2:<entity>` hoặc `web2:<entity>:<id>`. Pattern proven trong web2-products + native-orders.

### Index quick-lookup

- [`docs/web2/WEB2-INDEX.md`](docs/web2/WEB2-INDEX.md) — folder, route, table, Firestore collection của Web 2.0
- [`docs/web2/SSE-REALTIME.md`](docs/web2/SSE-REALTIME.md) — **SSE realtime pattern** (BẮT BUỘC đọc khi code realtime/sync)

## #Note Header Convention

Mọi file `.html` và `.js` đều có comment `#Note` ở dòng đầu. Khi tạo file mới, LUÔN thêm:

**HTML:** `<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->`

**JS:** `// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.`

**JS với shebang:** Đặt #Note ở dòng 2 (sau `#!/usr/bin/env node`).

Chạy lại script nếu cần: `bash scripts/add-note-header.sh` (idempotent, an toàn chạy nhiều lần).

## Git Workflow

**Auto commit & push**: Khi hoàn thành task, tự động commit và push mà không cần hỏi user. Commit message ngắn gọn, rõ ràng.

## Bunny CDN — CHỈ DÙNG cho AI KOL Studio

> **Policy** (2026-05-21): Bunny CDN (`n2store-aikol.b-cdn.net`) chỉ được dùng cho **AI KOL Studio** (`aikol-studio/`, `render.com/routes/aikol*.js`, `render.com/services/aikol-*.js`).
>
> **Không thêm Bunny upload vào bất kỳ trang nào khác.** Trước đây Purchase Orders có dùng Bunny (2026-05-08 → 2026-05-21) nhưng đã rollback sang Postgres `purchase_order_images.data BYTEA` vì Bunny upload bị 500 trên prod và user không muốn phụ thuộc thêm vendor cho trang ngoài AI KOL.
>
> **Khi cần lưu ảnh cho feature mới**:
>
> - Default: Postgres bytea (như `purchase_order_images`) — serve qua `GET /api/v2/<route>/images/:id`, cache-immutable headers
> - Frontend: render trực tiếp `<img src="https://n2store-fallback.onrender.com/api/v2/...">` — không cần CDN trừ khi traffic > 100K req/day
> - Nếu cần CDN: dùng Cloudflare R2 + Workers proxy (CF account đã có), KHÔNG mở thêm Bunny zone
>
> **Khi sửa code đụng `bunny-storage-service.js`**: confirm chỉ phục vụ aikol routes; PO route chỉ giữ `deleteObject` để cleanup legacy URLs từ window May 8–21.

## Browser Test Scripts (Playwright)

Project có **4 scripts test dự án qua Playwright** (auto-login + capture errors). Dùng để verify mọi commit lớn, repro bug, debug live.

### ⚡ Quy tắc test — LIVE CODING workflow

- **Localhost = vừa code vừa test luôn** (workflow chuẩn):
    1. **Auto server**: 3 script test tự spawn `python3 -m http.server <port>` từ project root khi `--base http://localhost:PORT` được truyền và port chưa listen. Helper: `scripts/lib/ensure-local-server.js`. KHÔNG cần user pre-launch server.
    2. **Auth tự restore**: `n2store-browser-session.js` đọc `serect_dont_push.txt` qua `scripts/restore-login-session.js`, inject vào BrowserContext (localStorage + cookies) → KHÔNG bị bounce về login. Nếu file thiếu block hoặc token hết hạn → fallback form login + lưu lại.
    3. Lưu session tươi khi cần: `node scripts/save-login-session.js --base http://localhost:8080` (và `--base https://nhijudy.store`). Chạy lại định kỳ (mỗi tuần hoặc khi script báo lỗi auth) — JWT trong `loginindex_auth` hết hạn sau 30 ngày.
    4. Khởi động persistent browser session 1 lần: `mkfifo /tmp/n2store-session.fifo; (tail -f /tmp/n2store-session.fifo) | node scripts/n2store-browser-session.js --user admin --pass admin@@ --base http://localhost:8080 &`
    5. Sau mỗi `Edit` file → file saved → đẩy command vào FIFO test ngay: `echo "nav http://localhost:8080/<path>?t=$(date +%s)" > /tmp/n2store-session.fifo; echo "feval ..." > /tmp/n2store-session.fifo`
    6. **KHÔNG restart browser** giữa các iteration. Cache-bust HTML bằng `?t=...`. JS đã `cache-control: no-cache` sẵn trong route handler.
    7. Stop local server khi xong: `pkill -f "http.server 8080"` (server detached từ script test, sống tiếp khi script exit).

### 🔬 Quy tắc DEBUG — console-first, screenshot last resort (BẮT BUỘC)

Khi repro/diagnose bug qua persistent browser session, **ưu tiên đọc state qua `eval`/`feval` JSON returns** thay vì chụp ảnh:

- **Capture state**: `eval return { formData, pendingFiles, validation, dom: { ... } };` — JSON đi qua tail log, parse được.
- **Hook console.error** trước khi trigger bug để không miss async errors:
    ```js
    const _err = console.error;
    window.__errs = [];
    console.error = function (...a) {
        window.__errs.push(
            a
                .map((x) => (typeof x === 'string' ? x : x?.message || JSON.stringify(x)))
                .join(' ')
                .slice(0, 200)
        );
        return _err.apply(console, a);
    };
    ```
- **Hook notificationManager.show** để capture toast errors hiển thị ngắn.
- **Network buffer**: `netlast 20` đọc 20 calls gần nhất từ session script.
- **Inspect DOM state**: `document.querySelector / querySelectorAll` + properties (`.value`, `.offsetParent !== null`, dataset).

Lý do: nhiều state UI không lộ qua hình — modal nội bộ, dialog ẩn, dropdown chưa mở, async errors, race conditions giữa render và nav. Screenshot là last resort khi cần verify visual rendering (layout, color, icon) **sau khi** đã sửa code và state lookup confirm OK.

Pattern này verified trong session debug paste-image (2026-05-21): 16+ eval calls bóc tách bug compress logic (skip khi file < 0.5 MB nhưng dim > 16384) — không screenshot nào.

### 🛡️ Quy tắc test ĐỤNG DATABASE (BẮT BUỘC)

**KHÔNG dùng dữ liệu thật khi test write operations**. Quy trình:

1. **Schema migration / DB write test** → dùng pattern [`scripts/test-migration-social-tags.js`](scripts/test-migration-social-tags.js):
    - `CREATE DATABASE n2store_migration_test` (local Postgres) → schema cũ → INSERT fake → apply migration → verify → **`DROP DATABASE`** (cleanup hoàn toàn).
    - KHÔNG đụng prod DB.

2. **Test customer / order browser flow** → ưu tiên dùng test customer mặc định:
    - **Mặc định**: `Huỳnh Thành Đạt — 0123456788` (đã có sẵn trong DB cho test, dùng được cho mọi flow: chat, sale, PBH, gửi tin nhắn)
    - Cần nhiều khách khác → SĐT giả: `0900000000`, `0900000001`, ...
    - Mã đơn / customer code: prefix `TEST-` để dễ filter cleanup sau (vd `TEST-20260428-001`)
    - KHÔNG dùng SĐT/order ID khách thật khác trong write tests.

3. **Sau test xong → cleanup ngay**:
    - Drop test DB / test schema
    - Xóa test customer/order qua API DELETE hoặc SQL `DELETE WHERE code LIKE 'TEST-%'`
    - Verify cleanup không sót.

4. **Read prod data OK** (cẩn thận PII):
    - `--copy-prod` flag pg_dump 5-10 row mẫu (filter sạch PII: bỏ phone, name nếu nhạy cảm)
    - Chỉ READ, không WRITE prod.

5. **NEVER**:
    - INSERT/UPDATE/DELETE trực tiếp prod DB từ script test
    - Hardcode prod credentials trong test script (dùng `serect_dont_push.txt` qua env var)
    - Dùng SĐT khách thật khi test gửi tin nhắn / tạo PBH

- **Online test CHỈ khi cần verify deploy thật**: sau `git push origin main`, đợi GH Pages CI/CD ~2-4 phút, curl-verify path mới, rồi mới smoke với BASE mặc định.
- Verify deploy xong: `curl -s "https://nhijudyshop.github.io/n2store/<path>" | grep "<expected change>"` trước khi smoke.

### 1. `scripts/n2store-smoke-all-pages.js` — Auto smoke 144 HTML pages

```bash
# Localhost (ưu tiên)
python3 -m http.server 8080 &
node scripts/n2store-smoke-all-pages.js --user admin --pass admin@@ --concurrency 5 --per-page-secs 7 --base http://localhost:8080

# Online (sau push, đợi deploy ~3 min)
node scripts/n2store-smoke-all-pages.js --user admin --pass admin@@ --concurrency 5 --per-page-secs 7
```

- Login 1 lần, 5-parallel, capture HTTP/console errors/unhandled/visible
- Categorize: `errors` (real app bug) vs `networkNoise` (Failed to load resource, ERR\_\*)
- Output: `downloads/n2store-session/smoke-report.{json,md}`
- Diff với `smoke-report-before.json` để xem fixed/improved/regression

### 2. `scripts/n2store-interactive-smoke.js` — Click/type 24 priority pages

```bash
node scripts/n2store-interactive-smoke.js --user admin --pass admin@@ --per-page-secs 10
```

- Probe DOM: search inputs, select dropdowns, button[onclick] (skip destructive + navigating), tabs
- Nav guard: track `framenavigated`, abort chain khi page navigate, recover từ context-destroyed
- Output: `downloads/n2store-session/interactive-smoke-report.{json,md}`

### 3. `scripts/n2store-browser-session.js` — Persistent Playwright REPL (FIFO)

```bash
mkfifo /tmp/n2store-session.fifo
(tail -f /tmp/n2store-session.fifo) | node scripts/n2store-browser-session.js --user admin --pass admin@@
# Gửi command:
echo "search 0914495309" > /tmp/n2store-session.fifo
echo "openchat" > /tmp/n2store-session.fifo
echo "switchpage Nhi Judy House" > /tmp/n2store-session.fifo
echo "chatstate" > /tmp/n2store-session.fifo
echo "quit" > /tmp/n2store-session.fifo
```

- Login 1 lần, browser visible, KHÔNG cần restart cho mỗi test
- Commands: `nav`, `eval`, `feval`, `filter`, `flag`, `search`, `openchat`, `switchpage`, `chatstate`, `netlast [N]`, `clearnet`, `shot <path>`, `help`, `quit`

### 4. `scripts/test-migration-social-tags.js` — DB schema test trên local DB riêng

```bash
brew services start postgresql@14   # nếu chưa chạy
node scripts/test-migration-social-tags.js [--copy-prod]
```

- **Pattern bắt buộc cho mọi DB schema change**: CREATE local `n2store_migration_test` DB → schema cũ → INSERT FAIL → MIGRATE → INSERT OK → DROP DB.
- KHÔNG đụng prod DB. `--copy-prod` chỉ READ pg_dump 5 row mẫu.
- Test idempotency (re-run no-op) bắt buộc vì Render restart sẽ chạy migration block lần 2.

### Khi nào dùng

- **Sau commit lớn** → smoke 144 pages, diff baseline.
- **Phát hiện bug user báo** → persistent REPL + `nav` + `eval/feval` + `chatstate` + `netlast`.
- **Schema change DB** → test-migration template trước khi push.
- **UI/UX thay đổi** → interactive smoke 24 priority pages.

### Reports

- `downloads/n2store-session/FINAL-CLEAN-REPORT.md` — kết quả gần nhất (144/144 clean, 0 app errors)
- `downloads/n2store-session/PHASE-1-5-FINAL-REPORT.md` — chi tiết 6 nhóm bug đã fix
- `downloads/n2store-session/test-history.md` — lịch sử mọi phiên debug + customer chạm

## Data Synchronization

Project sử dụng pattern **Firebase as Source of Truth + Real-time Listener** - localStorage chỉ là cache.

### Stores có Firestore Sync (Version 2):

| Store                      | File                                                     | localStorage Key         | Firestore Collection       |
| -------------------------- | -------------------------------------------------------- | ------------------------ | -------------------------- |
| `InvoiceStatusStore`       | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` | `invoiceStatusStore_v2`  | `invoice_status_v2`        |
| `InvoiceStatusDeleteStore` | `orders-report/js/tab1/tab1-fast-sale-workflow.js`       | `invoiceStatusDelete_v2` | `invoice_status_delete_v2` |

> **Note**: Sử dụng `_v2` suffix để tách biệt hoàn toàn với code cũ.

### Pattern chuẩn:

```javascript
const Store = {
    _data: new Map(),
    _isListening: false,  // Flag tránh infinite loop

    async init() {
        // 1. Load từ Firestore TRƯỚC (source of truth)
        const loaded = await this._loadFromFirestore();

        // 2. Nếu offline, fallback to localStorage cache
        if (!loaded) {
            this._loadFromLocalStorage();
        }

        // 3. Cleanup old entries
        await this.cleanup();

        // 4. Setup real-time listener
        this._setupRealtimeListener();
    },

    // Add/Update: dùng merge:true (an toàn cho concurrent edits)
    _saveToFirestore() {
        await this._getDocRef().set({
            data: Object.fromEntries(this._data),
            lastUpdated: Date.now()
        }, { merge: true });
    },

    save() {
        this._saveToLocalStorage();
        if (!this._isListening) {
            this._saveToFirestore();
        }
    },

    // Delete: dùng FieldValue.delete() để xóa field cụ thể
    async delete(id) {
        this._data.delete(id);
        this._saveToLocalStorage();
        await this._getDocRef().update({
            [`data.${id}`]: firebase.firestore.FieldValue.delete(),
            lastUpdated: Date.now()
        });
    }
};
```

### Tài liệu chi tiết:

Xem `docs/architecture/DATA-SYNCHRONIZATION.md` để hiểu thêm về:

- Firebase as Source of Truth + Real-time Listener pattern
- Strategy: `merge:true` cho add/update, `FieldValue.delete()` cho delete
- Best practices

---

## Plan Implementation Tracker

> **CHỈ ĐỌC PHẦN NÀY KHI USER GÕ: "đọc claude.md plan-implementation-tracker"**
> Nếu user không gõ lệnh trên, BỎ QUA toàn bộ section này.

### Workflow khi được kích hoạt:

1. Đọc `docs/plans/progress-log.md` — xem trạng thái hiện tại và task tiếp theo
2. Đọc `docs/plans/plan-implementation-tracker.md` — chi tiết plan với checklist
3. Đọc các file code liên quan được ghi trong progress-log
4. Tiếp tục hiện thực task tiếp theo
5. Sau khi hoàn thành task, cập nhật:
    - `docs/plans/progress-log.md` — thêm log entry mới
    - `docs/plans/plan-implementation-tracker.md` — đánh dấu checkbox
    - Commit & push
