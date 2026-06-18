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

### Pancake Reference (BẮT BUỘC) — browser-test trang THẬT, KHÔNG dùng docs cũ

⚠️ Docs Pancake cũ (`docs/pancake/`) đã **XOÁ** (2026-06-18, lỗi thời + lâu không cập nhật). **KHÔNG tạo lại, KHÔNG dựa vào doc tĩnh cho Pancake.**

Khi cần chi tiết Pancake (API, network, cấu trúc từng trang con) → **browser-test trực tiếp pancake.vn** bằng session trong `serect_dont_push.txt` (block `PANCAKE_*`: `PANCAKE_SESSION_ID`/`PANCAKE_JWT`/cookies + state `downloads/n2store-session/pancake-state.json` để inject vào BrowserContext). Đây là **nguồn CHUẨN duy nhất** cho Pancake.

- Trang quản lý bài viết / livestream (đang + đã live): `https://pancake.vn/NhiJudyStore/post` + `https://pancake.vn/NhiJudyHouse.VietNam/post`
- Mở browser test (n2store-browser-session) → inject session Pancake → nav 2 URL trên → xem DOM/network thật của từng trang con để hiểu API/endpoint.

### TPOS Reference (BẮT BUỘC)

Khi code liên quan **TPOS**, đọc mục lục `docs/tpos/TposWebsite.md` (controllers, OData, modules, integrations) trước khi code.

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

> **⚠ Web 2.0 đang BETA — KHÔNG sợ mất data (user xác nhận 2026-06-07).** Data `web2_*` (Postgres + Firestore) chưa phải data thật quan trọng → khi refactor/migrate/đổi naming/dọn bảng/sửa shape cho Web 2.0, **ưu tiên làm ĐÚNG & HOÀN HẢO**, được phép wipe/truncate/recreate schema sạch, KHÔNG cần giữ data cũ hay backward-compat phức tạp cho riêng Web 2.0. **CHỈ áp dụng cho Web 2.0** — Web 1.0 (orders-report, inbox, chat, `chatDb`, bảng KHÔNG có prefix `web2_`) vẫn là PROD thật, data PHẢI bảo toàn tuyệt đối. (Lưu ý `web2_records` multi-tenant — wipe theo slug, xem MEMORY `reference_web2_data_wipe`.)

### Web 2.0 — thuộc về

**Folders** (đều thuộc Web 2.0):

- `web2/` — TPOS-clone pages + 2 ví mới (`supplier-wallet/`, `customer-wallet/`)
- `web2/shared/` — shared sidebar, page-builder (`Web2Page`), api client, caches
- `web2/products/` — Kho SP riêng Web 2.0
- `web2/variants/` — Kho Biến Thể riêng
- `so-order/` — Sổ Order shop dùng để mua hàng từ NCC
- `native-orders/` — Đơn Web của shop (tạo PBH)
- `tpos-pancake/` — TPOS × Pancake reconciliation

**API / Render routes**:

- Có prefix `web2`: `/api/web2-products`, `/api/web2-variants`, `/api/web2/:entity` (generic)
- Liên quan Web 2.0 nhưng KHÔNG prefix (legacy, đã có sẵn — đừng dời): `/api/native-orders`, `/api/fast-sale-orders` (PBH), `/api/wallet-deposits`
- Bằng chứng "thuộc Web 2.0" khi không có prefix: comment `// WEB2.0 MODULE` ở đầu file route.

### ⚠ `/api/v2/*` namespace — CHIA CHUNG (mixed Web 1.0 + Web 2.0)

`/api/v2/*` được tạo **2026-01-12 cho Web 1.0** ("Unified Customer 360" — replace `/api/customers`, `/api/wallets` cũ — xem `render.com/routes/v2/index.js` line 13). Web 2.0 sau này (Q1-Q2 2026) cũng piggy-back vào cùng namespace cho tiện → technical debt.

**Core `/api/v2/*` — Web 1.0** (Unified Customer 360, consumer là `inbox/`, `tpos-pancake/`, `balance-history/`, `orders-report/`, `delivery-report/`, `render-data-manager/`, `order-management/`):

`customers`, `wallets` (table `customer_wallets`), `tickets`, `balance-history` (table `balance_history`), `analytics`, `web-warehouse`, `purchase-orders`, `inventory-tracking`, `delivery-assignments`, `pending-withdrawals`, `odata` (TPOS shadow — cross-cutting).

**Mounted dưới `/api/v2/*` nhưng THỰC SỰ là Web 2.0** (piggy-back, không có prefix `web2-` — đừng nhầm):

`notifications` (F06), `audit-log` (F05), `supplier-aging` (F02), `dashboard-kpi` (F01), `smart-match` (F09), `inventory-forecast` (F11), `supplier-360` (F07), `cart` (drag-drop từ Pancake).

→ Consumer: `web2/notifications/`, `web2/dashboard/`, `web2/audit-log/`, `web2/smart-match/`, `web2/supplier-aging/`, `web2/supplier-360/`, `web2-notification-bell.js`.

**`/api/v2/web2-*` — Web 2.0 với prefix RÕ RÀNG** (convention mới, sau khi separation rõ ra — comment ở `server.js:573` ghi "Tách hoàn toàn khỏi `/api/v2/wallets` + `/api/v2/balance-history` của Web 1.0"):

`web2-wallets` (table `web2_customer_wallets`), `web2-balance-history` (table `web2_balance_history`), `web2-monitoring`, `web2-customer-wallet`.

**Convention đi tới**:

- **Route Web 2.0 MỚI**: dùng `/api/web2-<entity>` (root level, preferred) HOẶC `/api/v2/web2-<entity>` (cho features cần namespace v2). KHÔNG mount dưới `/api/v2/*` mà không có prefix nữa.
- **Route Web 1.0 MỚI**: tránh thêm vào `/api/v2/*` core (đã deprecated sunset 2025-07-01 nhưng vẫn live). Path mới Web 1.0 → `/api/<feature>`.

**Postgres tables**:

- Có prefix `web2_`: `web2_products`, `web2_variants`, `web2_records`, `web2_entities`
- Liên quan Web 2.0 nhưng KHÔNG prefix (legacy): `native_orders`, `fast_sale_orders`, `balance_history` (SePay)

**Firestore collections** — ⚠ **Web 2.0 ĐÃ MIGRATE KHỎI FIRESTORE sang Postgres (web2Db) — cập nhật 2026-06-14**:

- **KHÔNG còn dùng Firestore cho data Web 2.0.** Các collection cũ `web2_so_order/main`, `web2_supplier_wallet/main`, `web2_customer_wallet/main`, `web2_suppliers/main` (rename từ `so_order_v2`/`supplier_wallet_v1`…) đã **chuyển hết sang Postgres**: Sổ Order → `web2_so_order` (C8 xong 13/06, đọc `/api/web2-so-order/get`), Ví NCC → `web2_supplier_meta`+`web2_supplier_ledger`, Ví KH → `web2_customer_wallets`, NCC → `web2_supplier_meta`+SSE. Firestore doc `/main` còn tồn tại vật lý nhưng **drained/legacy** (chỉ `render.com/scripts/web2-firestore-wipe.js` đụng).
- **Firebase active DUY NHẤT của Web 2.0**: service `web2-realtime` đọc Firestore `pancake_tokens/accounts` lúc boot để lấy token Pancake (fallback Postgres `realtime_credentials`); collection này dùng CHUNG với Web 1.0. **Zalo session = Postgres `web2_zalo_accounts.session`, KHÔNG Firestore.**
- **Data Web 2.0 MỚI → Postgres `web2_*` (web2Db)**, KHÔNG tạo Firestore collection mới. SDK `firebase-firestore-compat` đã gỡ khỏi các trang web2 (dead). Chi tiết: [docs/guides/RENDER_SERVERS_GUIDE.md](docs/guides/RENDER_SERVERS_GUIDE.md) §"DB + Firebase Web 2.0".

### Legacy N2Store — không phải Web 2.0

`orders-report/`, `inbox/`, `chat/`, `library/`, `home/`, `auth/`, `account/`, `shared/` (auth/cache/notification dùng chung), `cloudflare-worker/` (proxy chung cho cả 2 layer).

### Quy tắc khi code

0. **Tách module nhỏ + share dùng chung (NGUYÊN TẮC GỐC, BẮT BUỘC — 2026-06-18)**: code Web 2.0 LUÔN tách thành **nhiều module nhỏ** (theo feature/domain, 200-400 dòng, max 800 — KHÔNG nhồi file khổng lồ; bài học ngược: `native-orders-app.js` 9456 dòng coupling sâu → migrate cực khó). Cái gì **≥2 nơi dùng được → làm shared 1 nguồn** trong `web2/shared/` cho mọi trang tham chiếu; **KHÔNG copy-paste / dựng lại / fork logic**. Trang chỉ điều phối + truyền context/callback, source-of-truth nằm ở module shared. **Why:** dễ bảo trì + bảo dưỡng, logic code thống nhất (sửa 1 chỗ áp dụng mọi nơi), tránh drift. Trước khi viết mới: tìm shared đã có (`web2/shared/`) → tái dùng; chưa có mà nhiều nơi cần → build shared rồi gọi. Mẫu chuẩn: `Web2CustomerChat` (chat KH 3-cột Pancake + Zalo, gộp cả readonly), `Web2Popup`, `Web2Lottie`, `Web2QR`, `Web2CustomerStore`, `Web2SuppliersCache`, `Web2Optimistic`, `Web2SSE`, `Web2BarcodeScanner`, `Web2ProductCounter`.
1. **Marker bắt buộc cho file mới Web 2.0**: thêm token `WEB2.0` vào #Note header.
    - Vd: `// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.`
2. **Đặt tên DB table/Firestore mới**: prefix `web2_` cho CẢ Postgres VÀ Firestore. Không dùng suffix `_v1`/`_v2` cho Firestore nữa (đã rename 2026-05-25 — xem dev-log).
   2b. **Giá trị enum / string định danh (channel, topic, key, filter type…) — prefix `web2_` KHI có nguy cơ nhầm (2026-06-05)**: KHÔNG prefix tất cả — chỉ đổi cái **thật sự dễ nhầm** với trang/hàm/field khác/bên thứ 3. Nguyên tắc: _mai mốt đọc code thấy có tỉ lệ bị nhầm lẫn bởi pages/hàm/bên thứ 3 thì đổi tên lại_. Vd cột `native_orders.channel` đổi `'inbox'`→`'web2_inbox'`, `'livestream'`→`'web2_livestream'` vì `'inbox'` trùng Pancake filterType + icon lucide `inbox`, `'livestream'` trùng field product-line `source`. Khi đổi giá trị đã lưu DB → thêm migration idempotent trong `ensureTables` (UPDATE + ALTER COLUMN SET DEFAULT) + filter backward-compat (chấp nhận cả giá trị legacy) để deploy frontend↔backend không cần đúng thứ tự.
3. **API route mới**: prefix `/api/web2-...` hoặc `/api/web2/...`. Nếu phải dùng tên trung tính (vd `wallet-deposits`) → comment đầu file `// WEB2.0 MODULE`.
4. **Không cross-import**: legacy/orders-report KHÔNG được import code từ web2/, web2/shared/, supplier-wallet/, customer-wallet/. Ngược lại OK (web2 dùng `shared/js/...` được vì shared là chung).
5. **Khi sửa file legacy**: dừng lại hỏi user nếu thay đổi có thể ảnh hưởng web2 (và ngược lại).
   5b. **⚠ Tên quyết định layer — KHÔNG share DB/pool (BẮT BUỘC, regression 2026-06-04)**: tên có `web2`/`web 2.0` → Web 2.0 (pool `web2Db`). Tên KHÔNG có (vd `inventory-tracking`, `orders-report`, `delivery-report`) → **Web 1.0 (pool `chatDb` THUẦN, KHÔNG fallback web2Db)**. **TUYỆT ĐỐI không đổi pool của module Web 1.0 sang `web2Db` để "đồng bộ" với feature Web 2.0** — làm route đọc bản copy thiếu/stale → **mất data** (đã xảy ra với inventory-tracking: commit `dcf4ac261` đổi sang web2Db, revert `getDb`→`chatDb` thuần 2026-06-04). Nếu feature Web 2.0 cần data của Web 1.0 → gọi API Web 1.0, KHÔNG đọc trực tiếp bảng Web 1.0 từ web2Db. Web 1.0 ⊥ Web 2.0: không share DB / pool / table / state / collection / topic bất cứ thứ gì.
6. **Realtime / Data sync — BẮT BUỘC**: KHÔNG dùng Firebase Firestore listener cho Web 2.0 nữa. Web 2.0 dùng **SSE pub/sub trên Render** (topic-based). Trước khi code bất kỳ feature nào liên quan realtime, cross-tab sync, listener data → **PHẢI đọc [`docs/web2/SSE-REALTIME.md`](docs/web2/SSE-REALTIME.md)** (architecture + recipe server/client + topic naming + migration checklist + verification). Topic convention: `web2:<entity>` hoặc `web2:<entity>:<id>`. Pattern proven trong web2-products + native-orders.
7. **Modal — BẮT BUỘC**: trước khi code/sửa modal trong Web 2.0 (popup, dialog, overlay), **PHẢI đọc [`docs/web2/MODAL-ANTI-LAG.md`](docs/web2/MODAL-ANTI-LAG.md)**. Shared CSS `web2/shared/web2-tpos-theme.css` đã có Tier 1 fixes global (containment, overscroll-behavior, content-visibility, compositor transitions). Code modal mới chỉ cần đúng class (`modal-content` + `modal-body`, row dài thêm `.modal-row`/`.cv-auto`) là auto inherit. KHÔNG dùng `backdrop-filter: blur()` hoặc box-shadow > 24px. JS scroll listeners BẮT BUỘC `{passive: true}`. Modal > 100 rows → virtualize. Body scroll lock dùng pattern `position: fixed + top: -scrollY` (iOS-safe), KHÔNG chỉ `overflow: hidden`.
8. **UI-first cho mọi mutation handler — BẮT BUỘC**: mọi thao tác user trigger backend mutation (click button, change status, save modal, drag-drop, toggle, …) PHẢI dùng pattern **UI-first + backend background + rollback nếu lỗi** qua helper `Web2Optimistic.run({snapshot, apply, run, onSuccess, rollback, successMsg, errLabel})`. Helper ở `web2/shared/web2-optimistic.js`, đã load sẵn trên 41 pages (xem [`docs/web2/UI-FIRST.md`](docs/web2/UI-FIRST.md) cho full list + recipe). KHÔNG `await fetch(...)` rồi mới render — UX cảm giác lag. ⚠ **NGOẠI LỆ giữ await + loading state**: money ops (wallet/deposit/debt — rollback gây confuse), DELETE với 409 force-confirm flow phức tạp, modal save với server-side validation strict. Khi code page MỚI: page-builder pages auto có helper, legacy pages cần thêm `<script src="../shared/web2-optimistic.js?v=20260601a"></script>` trước script app chính. Khi refactor handler cũ: wrap qua `Web2Optimistic.run({...})` với defensive fallback `if (window.Web2Optimistic?.run) { ... } else { /* legacy await path */ }`.
9. **Cập nhật overview + file phân tích khi code phần QUAN TRỌNG Web 2.0 — BẮT BUỘC (2026-06-10)**: khi thêm route/trang mới, đổi luồng data, hoặc fix bug nằm trong audit → cập nhật **CẢ 2 nơi**: trang sống [`web2/overview/index.html`](web2/overview/index.html) (section liên quan + section `#auditPages`) **và** [`docs/web2/WEB2-PAGES-ANALYSIS.md`](docs/web2/WEB2-PAGES-ANALYSIS.md) (audit toàn diện 34 trang 2026-06-10 — fix bug nào thì đổi ⬜ → ✅ kèm commit sha ở dòng đó). Trước khi fix bug Web 2.0 → đọc file MD này TRƯỚC để biết bug đã được catalog chưa + pattern lỗi lặp (mục 2) + lộ trình 5 đợt (mục 5).
10. **⏰ Múi giờ Web 2.0 = GMT+7 (BẮT BUỘC, 2026-06-11)**: toàn bộ UI Web 2.0 hiển thị thời gian theo **GMT+7 (`Asia/Ho_Chi_Minh`)**. Hiển thị: dùng `Intl.DateTimeFormat(..., { timeZone: 'Asia/Ho_Chi_Minh' })` hoặc `SharedUtils.formatTime` (live-chat). Lưu DB: luôn epoch/TIMESTAMPTZ đúng UTC — convert sang +7 CHỈ ở tầng hiển thị. **2 bẫy đã dính**: (a) Pancake `inserted_at` = UTC **không hậu tố `Z`** (vd `2026-06-11T03:52:23`) → `new Date(s)` hiểu thành giờ local, PHẢI append `Z` khi string không có timezone (pattern `SharedUtils.parseTimestamp` / `parseUtcTs` web2-live-comments.js); (b) **Render server chạy `TZ=Asia/Saigon` (+7), KHÔNG phải UTC** (verify `GET /api/debug/time`) → server-side `new Date(naiveString)` cho epoch lệch −7h (bug thật: `web2-live-comments.js` + `web2-livestream-poller.js` lưu `created_time` lệch −7h, fix 2026-06-11).

### ⚡ SSE-first khi code chức năng / trang mới (BẮT BUỘC NHỚ)

**Project đã có sẵn server SSE socket realtime đang LISTEN + READING data log** (`render.com/routes/realtime-sse-web2.js`, endpoint `/api/realtime/web2/sse`). Cứ mỗi lần code feature mới hoặc trang mới có data thay đổi → **MẶC ĐỊNH dùng SSE để**:

- ✅ UI realtime cập nhật **không cần refresh** (mutate ở tab A → tab B/C/D tự update)
- ✅ Đồng bộ dữ liệu **giữa các máy** (user 1 sửa ở máy ở nhà → user 2 thấy ngay ở máy văn phòng)
- ✅ Server-side log đầy đủ (`[SSE-WEB2]` Render logs + ring buffer 500 entries)
- ✅ Admin debug realtime qua [/web2/system/?tab=sse](web2/system/index.html) — sidebar "Tính năng mới" → "Cấu hình & Hệ thống" → tab "Realtime (SSE)" (gộp từ admin-sse-monitor + services-dashboard 2026-06-14; deep-link cũ vẫn redirect)

**KHÔNG**:

- ❌ Tự build polling 5s/lần "cho đỡ phức tạp" — SSE đã có sẵn, infra đã trả tiền
- ❌ Dùng Firestore listener (cost reads)
- ❌ Yêu cầu user refresh bằng tay
- ❌ Code WebSocket riêng (đã có SSE hub, chỉ build WS khi thực sự cần bidirectional)

#### ⚡ REALTIME, KHÔNG POLLER (BẮT BUỘC — user xác nhận 2026-06-15)

**Web 2.0 đã BỎ HẲN poller nền — không reintroduce.** Comment livestream giờ là **WS push** (relay Pancake `live-chat/server` → `/ingest` → SSE), KHÔNG còn vòng lặp polling (`web2-livestream-poller.js` `start()` không schedule `_loop()` nữa — log `"background poll DISABLED, event-driven only"`).

Khi code feature Web 2.0:

- **Cần realtime / sync** → **SSE** (`web2:<entity>`), không bao giờ poll interval.
- **Cần LIỆT KÊ / FETCH dữ liệu Pancake** (bài live đang/đã, hội thoại COMMENT, comment, conversations…) → **FETCH TRỰC TIẾP Pancake từ BROWSER** qua worker `/api/pancake/*` + JWT (`Web2Chat.getJwt()` / `Web2Chat._internal.WORKER_URL`). KHÔNG đi vòng qua route server gọi poller.
    - Danh sách bài **đang/đã livestream** = `GET /api/pancake/pages/{id}/posts?start_time&end_time` → lọc `type==='livestream'`, `living = (live_status==='LIVE' || is_living)`. **Đúng nguồn Pancake "Quản lý bài viết"** (đang/đã). `inserted_at` = UTC **không hậu tố Z** → append `Z` trước `new Date()` (GMT+7 hiển thị). Mẫu chuẩn: [`web2/multi-tool/js/multi-tool.js`](web2/multi-tool/js/multi-tool.js) `loadPosts()`.
- **TUYỆT ĐỐI KHÔNG** tạo `setInterval`/poll mới, hoặc thêm helper fetch vào `web2-livestream-poller.js`. Helper poller còn lại (`reconcileFullText` vá "…", `pollNow`/`pollPostNow` thủ công) chỉ on-demand event/request-driven — **không thêm mới, ưu tiên thay dần bằng fetch trực tiếp browser**.
- ⚠ Route `/api/web2-live-comments/page-posts` (poller `listLivePostsForAssign`) trả **0 bài trên web2-api sau split** (phụ thuộc pool/JWT server) → **đừng dùng cho UI mới**; native-orders/live-chat campaign picker còn dùng nó là tech-debt nên chuyển sang fetch trực tiếp Pancake.

**Quy trình** khi code feature/page mới có data động:

1. Đọc [`docs/web2/SSE-REALTIME.md`](docs/web2/SSE-REALTIME.md) §3 (server recipe) + §4 (client recipe) — pattern 2 step server, 2 step client
2. Route mutation: thêm `_notify(action, code)` SAU `pg COMMIT`, TRƯỚC `res.json`
3. `server.js`: wire `<module>Routes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients)`
4. HTML: load `web2-sse-bridge.js?v=<latest>` TRƯỚC page-app
5. Page-app: `Web2SSE.subscribe('web2:<entity>', cb)` trong `init()` + debounce 500-600ms → `reload()`
6. **Verify ngay** qua Admin SSE Monitor: mở Monitor + tab page → mutate → thấy log entry `notify topic clientsNotified=N` realtime

**Nếu debug UI không update**: mở SSE Monitor xem log live, không cần đọc Render Dashboard logs (truy cập chậm + cần web access).

Topics đã active (xem `docs/web2/SSE-REALTIME.md` §9): `web2:products`, `web2:variants`, `web2:users`, `web2:native-orders`, `web2:fast-sale-orders`, `web2:cart`, `web2:notifications`, `web2:reconcile`, `web2:purchase-refund`, `web2:livestream-snapshots`, `web2:wallet:<phone>`, `web2:customer-wallet`, `web2:<slug>` (78 generic), `web2:_admin:sse-log` (admin).

### SSE Server TÁCH RIÊNG Web 1.0 và Web 2.0 (BẮT BUỘC từ 2026-05-26)

Project có **2 hub SSE độc lập** — DB đã tách (`web2_*` tables), giờ tách nốt SSE để bug 1 layer không ảnh hưởng layer kia:

| Aspect           | Web 1.0                                                                                                                               | Web 2.0                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Server file      | [render.com/routes/realtime-sse.js](render.com/routes/realtime-sse.js)                                                                | [render.com/routes/realtime-sse-web2.js](render.com/routes/realtime-sse-web2.js)                                 |
| Endpoint client  | `/api/realtime/sse?keys=...`                                                                                                          | `/api/realtime/web2/sse?keys=...`                                                                                |
| Topic naming     | bare snake_case (`celebration`, `kpi_statistics`, `held_products`, `tickets`, `web_warehouse`, `order_notes_global`, `tpos_token`, …) | prefix `web2:` (`web2:products`, `web2:variants`, `web2:native-orders`, `web2:fast-sale-orders`, `web2:cart`, …) |
| Client subscribe | `new EventSource('/api/realtime/sse?keys=foo')` hoặc `RealtimeClient` bridge                                                          | `Web2SSE.subscribe('web2:foo', cb)` bridge singleton (`web2/shared/web2-sse-bridge.js`)                          |
| Server publish   | `realtimeSseRoutes.notifyClients(topic, data)` hoặc `app.locals.realtimeSseNotify`                                                    | `web2RealtimeSseRoutes.notifyClients(topic, data)` hoặc `app.locals.web2RealtimeSseNotify`                       |
| Wallet listener  | `walletEvents` (services/wallet-event-processor.js) — Web 1.0 `customer_wallets`                                                      | `web2WalletEvents` (services/web2-wallet-service.js) — Web 2.0 `web2_customer_wallets`                           |
| Log prefix       | `[SSE]`                                                                                                                               | `[SSE-WEB2]`                                                                                                     |
| Docs             | `MEMORY: reference_sse_servers_unified.md`                                                                                            | [docs/web2/SSE-REALTIME.md](docs/web2/SSE-REALTIME.md)                                                           |

**TUYỆT ĐỐI không trộn**: route Web 2.0 wire `web2RealtimeSseRoutes.notifyClients`, không phải legacy. Topic `web2:*` chỉ broadcast qua hub Web 2.0. Topic bare snake_case chỉ broadcast qua hub Web 1.0. SePay → Web 2.0 wallet chỉ qua `web2WalletEvents` listener trong `realtime-sse-web2.js` (đã remove cross-publish `web2:customer-wallet` từ legacy `walletEvents`).

Recipe Web 1.0:

1. **Server** (vd `routes/v2/delivery-assignments.js`): `const realtimeSse = require('../realtime-sse');` + sau mutation thành công gọi `realtimeSse.notifyClients('delivery_assignments', {action, date, group, ts: Date.now()});`
2. **Client** (vd `delivery-report/js/report.js`): `const es = new EventSource('${API_BASE}/sse?keys=delivery_assignments');` + `es.addEventListener('update', e => debounceRefresh());` debounce 500-600ms để gom burst + `es.close()` khi page/modal đóng
3. **Anti-patterns**: KHÔNG broadcast PII trong payload (chỉ `{action, id, ts}` — client re-fetch); KHÔNG subscribe nhiều topics riêng cho 1 module (1 topic + filter ở client); LUÔN debounce

Reference Web 1.0 production: `orders-report/js/celebration.js`, `orders-report/js/tab1/tab1-order-notes.js`, `orders-report/js/tab1/tab1-kpi-stats-strip.js` (topics `celebration`, `kpi_statistics,kpi_base`).

### Render SSE log structure — đọc/viết để verify realtime UI (không refresh)

**Write path** (Web 2.0): route mutation gọi `_notify(action, code)` SAU DB commit, TRƯỚC `res.json` → server log:

```
[SSE-WEB2] Notified 3 clients for key: web2:products       ← 3 tab đang mở subscribe topic này
[SSE-WEB2] No clients listening to key: web2:products      ← không tab nào subscribe (bình thường khi không ai dùng)
[<MODULE>] _notify failed: <error>                          ← lỗi trong route wrapper (vd `[WEB2-PRODUCTS] _notify failed: ...`)
```

**Read path** (client subscribe): browser open `/api/realtime/web2/sse?keys=web2:products` → server log:

```
[SSE-WEB2] Client connected (web2conn_1779778472163_qxpod2aax), watching: web2:products
[SSE-WEB2] Active connections: 5
...
[SSE-WEB2] Client disconnected (web2conn_1779778472163_qxpod2aax) after 234.5s
[SSE-WEB2] Active connections: 4
```

**Boot log** (1 lần khi server start): `[SSE-WEB2] Web 2.0 wallet event subscription initialized` — nếu thiếu, `web2-wallet-service` không load.

**Read–write loop** để UI tab B/C/D update mà không cần refresh:

```
Tab A: user click → PATCH /api/web2-products/KHO-X
  → Render: UPDATE web2_products WHERE code=KHO-X → COMMIT OK
  → _notify('update', 'KHO-X') → broadcast SSE event 'update' với data {action,code,ts}
  → Log: [SSE-WEB2] Notified N clients for key: web2:products
  → res.json({success:true}) → tab A local re-render

Tab B/C/D (đang subscribe): Web2SSE.subscribe('web2:products', cb)
  → callback fire với {topic:'web2:products', eventType:'update', data:{action,code,ts}}
  → debounce 500-600ms (gom burst) → reload() → UI fresh
```

3 điều kiện bắt buộc:

1. Route handler gọi `_notify(action, code)` sau commit, trước response
2. `server.js` wire `<module>Routes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients)` (đúng hub web2)
3. HTML load `web2-sse-bridge.js?v=<latest>` TRƯỚC page-app + page gọi `Web2SSE.subscribe(topic, cb)` trong `init()`

**Verify production** (curl):

```bash
# 1) Stats (server alive + per-topic subscriber count)
curl -s "https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2/sse/stats" | jq
# → {"success":true,"server":"web2","totalClients":N,"uniqueKeys":M,"keyStats":{...}}

# 2) Open stream + trigger test event
curl -N "https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2/sse?keys=web2:test-topic" &  # background
curl -X POST "https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2/sse/test" \
  -H "Content-Type: application/json" \
  -d '{"key":"web2:test-topic","data":{"action":"smoke","ts":'$(date +%s)'}}'
# → stream nhận: event: test\ndata: {key:web2:test-topic,data:{action:smoke,...}}
```

Đầy đủ log lines + debug cheatsheet UI không update: xem [docs/web2/SSE-REALTIME.md §7E-§7G](docs/web2/SSE-REALTIME.md).

### Index quick-lookup

- **[`web2/overview/index.html`](web2/overview/index.html) section `#conventions` — QUY ƯỚC WEB 2.0 canonical (ĐỌC TRƯỚC KHI CODE trang/feature Web 2.0 mới)**: DB/pool (`web2Db || chatDb`, KHÔNG ghi Web 1.0), naming (table `web2_`, route `/api/web2/`, service `web2-*.js`), realtime SSE `web2:<entity>`, server wiring, migration infra, checklist. Live tại https://nhijudy.store/web2/overview/index.html
- [`docs/web2/WEB2-INDEX.md`](docs/web2/WEB2-INDEX.md) — folder, route, table, Firestore collection của Web 2.0
- [`docs/web2/SSE-REALTIME.md`](docs/web2/SSE-REALTIME.md) — **SSE realtime pattern** (BẮT BUỘC đọc khi code realtime/sync)
- **Base-URL backend Web 2.0 = 1 NGUỒN** (2026-06-15): block `WEB2_CONFIG` ở đầu [`web2/shared/web2-auth.js`](web2/shared/web2-auth.js) (shared script load sớm nhất → set `window.API_CONFIG`+`window.WEB2_CONFIG` trước mọi app script). Code MỚI đọc `window.API_CONFIG.WORKER_URL` / `window.WEB2_CONFIG.{WORKER_URL,WEB2_API,REALTIME,REALTIME_SSE}`; literal `chatomni-proxy…`/`web2-api-kv04…` CHỈ là fallback, KHÔNG phải nguồn chính. **Đổi URL → CHỈ sửa web2-auth.js.** ⚠ `TPOS_GENERIC` (catch-all worker → tomato.tpos.vn) **KHÔNG xóa** — worker `chatomni-proxy` proxy CHUNG cả 2 layer, Web 1.0 vẫn dùng TPOS thật; Web 2.0 match path tường minh TRƯỚC catch-all nên không chạm tới. Chi tiết MEMORY [[reference_web2_base_url_config]].
- **Mã SP Web 2.0 (so-order + Kho SP)**: SP MỚI luôn sinh mã qua `Web2ProductCode.suggest()` (format `<PREFIX_NCC><LOẠI><MÀU><SIZE>`, vd `KHOAOTRANG`). Thiếu NCC → default prefix `KHO` (KHÔNG để server sinh `KHO-<rnd>`). so-order `_assignKhoCodes` + web2-products `suggestProductCode` cùng rule. KHÔNG hardcode mã rác.
- **CSS `[hidden]` + `display`**: element ẩn/hiện bằng attr `hidden` mà có `display:flex|grid|block` trong CSS → PHẢI thêm rule `.cls[hidden]{display:none!important}` (UA `[hidden]{display:none}` bị author rule đè do specificity hòa). Gặp ở so-order dropdown (fix 2026-06-07).
- **purchase-refund gom nhóm theo ĐƠN** (2026-06-07): Section A + picker group theo `supplier::shipmentId` (1 đơn = 1 đợt Sổ Order), key chọn/SL dùng `aggId`, KHÔNG gộp chung NCC.
- **📥 Nguồn dữ liệu FB/SĐT của KH trong campaign (2026-06-09)**: cần Facebook id / SĐT / tên KH của 1 chiến dịch → lấy từ **bài viết livestream** ở `https://pancake.vn/NhiJudyStore/post` + `https://pancake.vn/NhiJudyHouse.VietNam/post` (mục "đã livestream / đang livestream") → **fetch tải bình luận xuống** → trong comment có ĐẦY ĐỦ data FB khách (fb_id, name, phone — kể cả comment ẩn/ẩn SĐT, vì dùng pancake.vn/api/v1 + account JWT, KHÔNG phải pages.fm public). Hệ thống đã tự động: server poller `web2-livestream-poller.js` (30s) → bảng `web2_live_comments` (web2Db). KHÔNG tự build fetch graph.facebook.com — comment livestream là nguồn chuẩn. Chi tiết: MEMORY [[reference_web2_live_comments]].
- **🔎 Lookup KH: KHO KH TRƯỚC, Pancake SAU (2026-06-09)**: cần tra cứu 1 KH (theo SĐT/tên/fb_id) → **tìm trong kho KH `web2_customers` TRƯỚC** (`/api/web2/customers/search|list|batch-by-*`, trang [`web2/customers/`](web2/customers/index.html)). CHỈ khi kho không có mới **fetch Pancake**. Lý do: kho là nguồn local nhanh + đã gom đủ identity; Pancake chỉ để bù FB context (gửi tin) khi thiếu. Đừng gọi Pancake mặc định cho mọi lookup. **"Fetch Pancake" = nguồn comment livestream** (user định nghĩa rõ): vào bài viết livestream `pancake.vn/NhiJudyStore/post` + `pancake.vn/NhiJudyHouse.VietNam/post` (đã/đang live) → tải bình luận xuống → comment có đủ fb_id/name/phone (cả ẩn). KHÔNG graph.facebook.com, KHÔNG pages.fm public. Đã auto qua poller → `web2_live_comments`. Xem bullet "📥 Nguồn dữ liệu FB/SĐT" ở trên + MEMORY [[reference_web2_live_comments]].
- **🧲 Force extract (live-chat) gom KH comment → kho (2026-06-09)**: bấm "Force extract" ở [`live-chat/`](live-chat/index.html) → ngoài chụp thumbnail còn bulk POST `/api/web2/customers/harvest-comments` gom fb_id/name/phone của comment vào `web2_customers`. **KHÔNG ghi đè** SĐT/địa chỉ/tên sẵn có: trùng SĐT → thêm `alt_phones` (phone chính giữ nguyên là chính), field rỗng mới fill, KH mới thì tạo. Client `LiveColumnManager._harvestCommentCustomers`. Backend reuse `getOrCreateWeb2Customer`/`addWeb2AltPhone` (chỉ fill rỗng). Cũng chạy silent (throttle 60s) khi auto-extract tab refocus.

### Tách DB Web 2.0 (2026-06-03) — BẮT BUỘC nhớ khi code Render route Web 2.0

- Web 2.0 đã tách DB hoàn toàn: data ở **`n2store-web2-db`** (pool `web2Db`), KHÔNG còn ở `n2store_chat` (Web 1.0).
- Route/service Web 2.0 LẤY POOL: `const db = req.app.locals.web2Db || req.app.locals.chatDb;` — **KHÔNG dùng `chatDb` trần**.
- TUYỆT ĐỐI không INSERT/UPDATE/DELETE bảng Web 1.0 (`customers`, `balance_history`, `customer_wallets`…) từ code Web 2.0. web2Db có bản copy riêng các bảng này.
- Webhook/cron web2 truyền `web2Pool || chatDbPool`. Chi tiết quy ước: overview `#conventions`.

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

### 🧩 Mở browser test web → NHỚ thêm extension N2Store (BẮT BUỘC — 2026-06-11)

Khi khởi động browser test (persistent session/smoke/debug), **LUÔN truyền `--ext n2store-extension`**:

```bash
# FIFO + cổng HTTP DUY NHẤT mỗi phiên (tránh tranh chấp — xem ⚠ bên dưới).
FIFO=/tmp/n2s-$$.fifo; PORT=$((9900 + RANDOM % 90)); mkfifo "$FIFO"
(tail -f "$FIFO") | node scripts/n2store-browser-session.js \
  --user admin --pass admin@@ --base http://localhost:8080 --ext n2store-extension --http-port "$PORT"
# Gửi lệnh — ƯU TIÊN HTTP /cmd (theo PID, đồng bộ, KHÔNG đụng FIFO chung):
#   curl -s -X POST localhost:$PORT/cmd -H 'content-type: application/json' \
#        -d '{"cmd":"nav http://localhost:8080/orders-report/main.html"}'
```

- Script hỗ trợ sẵn `--ext <path>` (comma-separated nhiều ext) → dùng `launchPersistentContext` + `--load-extension` (`chromium.launch` thường KHÔNG load được extension).
- Lý do: nhiều flow CHỈ chạy khi có extension (auto-snap captureVisibleTab, gửi tin bypass-24h, Global ID resolve, capture leader lock) → test thiếu extension cho false-negative "capture/gửi tin không chạy".

> ⚠ **TRÁNH TRANH CHẤP BROWSER TEST (BẮT BUỘC — 2026-06-14)**: KHÔNG hardcode `/tmp/n2store-session.fifo` + `--http-port 9966` cố định. Nếu agent/session Claude khác cũng mở browser test, 2 phiên đọc CHUNG 1 FIFO + đụng cổng → lệnh `nav` rơi nhầm phiên làm trang "tự nhảy" lung tung (đã xảy ra 2026-06-14: 2 phiên `n2store-browser-session.js` chung FIFO/9966 khiến orders-report nhảy sang web2 — tưởng bug app, thực ra là contention). Quy tắc: **(1)** FIFO riêng `/tmp/n2s-$$.fifo` + cổng riêng (random/theo agent); **(2)** gửi lệnh qua **HTTP `/cmd`** (theo PID) thay vì ghi FIFO chung; **(3)** muốn 1 phiên sạch tuyệt đối → `pkill -f n2store-browser-session.js; pkill -f 'tail -f /tmp/n2s'; rm -f /tmp/n2s-*.fifo /tmp/n2store-session.fifo` TRƯỚC khi mở.

### 🧭 Browser test Web 2.0 → MỞ `web2/overview/index.html` TRƯỚC (BẮT BUỘC — 2026-06-13)

Khi browser test bất kỳ trang **Web 2.0** nào, **mặc định nav tới [`web2/overview/index.html`](web2/overview/index.html) TRƯỚC**, rồi mới chuyển sang trang cần test.

```bash
echo "nav http://localhost:8080/web2/overview/index.html?t=$(date +%s)" > /tmp/n2store-session.fifo
echo "nav http://localhost:8080/web2/<trang-cần-test>/index.html?t=$(date +%s)" > /tmp/n2store-session.fifo
```

- Lý do: overview load shared bootstrap (sidebar, auth, SSE bridge, theme, command palette, notification) + warm session/state → vào thẳng trang con dễ thiếu context/false-negative.
- KHÔNG áp dụng cho trang Web 1.0 (orders-report, inbox, chat…).

### ⚡ Quy tắc test — LIVE CODING workflow

- **Localhost = vừa code vừa test luôn** (workflow chuẩn):
    1. **Auto server**: 3 script test tự spawn `python3 -m http.server <port>` từ project root khi `--base http://localhost:PORT` được truyền và port chưa listen. Helper: `scripts/lib/ensure-local-server.js`. KHÔNG cần user pre-launch server.
    2. **Auth tự restore**: `n2store-browser-session.js` đọc `serect_dont_push.txt` qua `scripts/restore-login-session.js`, inject vào BrowserContext (localStorage + cookies) → KHÔNG bị bounce về login. Nếu file thiếu block hoặc token hết hạn → fallback form login + lưu lại.
    3. Lưu session tươi khi cần: `node scripts/save-login-session.js --base http://localhost:8080` (và `--base https://nhijudy.store`). Chạy lại định kỳ (mỗi tuần hoặc khi script báo lỗi auth) — JWT trong `loginindex_auth` hết hạn sau 30 ngày.
    4. Khởi động persistent browser session 1 lần — **FIFO + cổng riêng** (⚠ xem mục tránh tranh chấp ở trên): `FIFO=/tmp/n2s-$$.fifo; PORT=$((9900+RANDOM%90)); mkfifo "$FIFO"; (tail -f "$FIFO") | node scripts/n2store-browser-session.js --user admin --pass admin@@ --base http://localhost:8080 --http-port "$PORT" &`
    5. Sau mỗi `Edit` file → đẩy lệnh test ngay. **ƯU TIÊN HTTP `/cmd`** (theo PID, né FIFO chung): `curl -s -X POST localhost:$PORT/cmd -H 'content-type: application/json' -d '{"cmd":"nav http://localhost:8080/<path>?t='$(date +%s)'"}'`. (Chỉ 1 phiên thì ghi FIFO cũng được: `echo "nav ..." > "$FIFO"`.)
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

> **Thiếu data ở phần liên quan → cứ tạo dữ liệu ảo rồi test (2026-06-07).** Khi test một feature/trang mà thiếu data đầu vào ở mắt xích khác (đơn, SP, ví, khách, NCC…) → **seed dữ liệu ảo trước rồi test end-to-end xuyên nhiều trang**, đừng dừng chờ data thật. Trọng tâm khi test là verify **CÁC TRANG CÓ LIÊN KẾT DỮ LIỆU ĐÚNG VỚI NHAU** (cross-page data flow: native-orders → reconcile/returns; so-order nhận hàng → tồn kho web2-products; cộng ví → balance-history), không chỉ test 1 trang cô lập. Web 2.0 (`web2_*`) seed/wipe thoải mái (beta). ⚠ Vẫn theo các rule bên dưới: live/prod chỉ dùng clone `0123456788`, KHÔNG seed bảng/pool Web 1.0.

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

### 3. `scripts/n2store-browser-session.js` — Persistent Playwright REPL (FIFO/HTTP)

> ⚠ Dùng **FIFO + cổng riêng** mỗi phiên (xem mục "TRÁNH TRANH CHẤP BROWSER TEST"). Ví dụ dưới dùng path/cổng cố định cho gọn — khi có thể có agent khác chạy song song, đổi sang `/tmp/n2s-$$.fifo` + cổng random và gửi lệnh qua HTTP `/cmd`.

```bash
FIFO=/tmp/n2s-$$.fifo; PORT=$((9900+RANDOM%90)); mkfifo "$FIFO"
(tail -f "$FIFO") | node scripts/n2store-browser-session.js --user admin --pass admin@@ --http-port "$PORT" &
# Gửi command — HTTP /cmd (khuyến nghị, theo PID):
curl -s -X POST localhost:$PORT/cmd -H 'content-type: application/json' -d '{"cmd":"search 0914495309"}'
curl -s -X POST localhost:$PORT/cmd -H 'content-type: application/json' -d '{"cmd":"chatstate"}'
# …hoặc qua FIFO (chỉ khi chắc chắn 1 phiên duy nhất):
echo "openchat" > "$FIFO"; echo "switchpage Nhi Judy House" > "$FIFO"; echo "quit" > "$FIFO"
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
