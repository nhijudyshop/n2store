# Dev Log

## 2026-07-01

### [fast-sale-orders.js] Huỷ PBH → revert phiếu thu về consumed về 'queued' (fix mất dấu thu về)

**Files:** `render.com/routes/fast-sale-orders.js` (`_cancelPbhInTx`).

Gap phát hiện qua E2E test: huỷ PBH đã gộp thu về KHÔNG revert `web2_returns.bill_status` từ `consumed` → phiếu kẹt consumed (không xoá được, không re-lên bill lần sau) dù PBH đã huỷ → **mất dấu món thu về** (khách vẫn cần trả nhưng bill mới không hiện).

- `_cancelPbhInTx` (điểm chung `/cancel` + `/by-source/cancel` + `/bulk-cancel` + DELETE): sau restock/hoàn ví, thêm SAVEPOINT best-effort `UPDATE web2_returns SET bill_status='queued', consumed_pbh_code=NULL WHERE consumed_pbh_code=<số PBH> AND bill_status='consumed' AND status='active'` → SSE `web2:returns`.
- Idempotent; lỗi không kéo đổ cancel (mirror delivery-sync). Native cancel cũng route qua đây.
- Vòng đời tồn kho khép kín: create +1 → consume −1 → cancel +1 (restock dòng 0đ) + re-queue → re-consume −1.

Status: ✅ deployed-ready.

### [web2 unit-scan] Nút gạt "Quét nhanh" — ẩn thẻ chi tiết khi quét liên tục

**Files:** `web2/unit-scan/index.html` · `web2/unit-scan/js/unit-scan.js` · `web2/unit-scan/css/unit-scan.css`.

User: "ok làm đi" (thêm nút gạt Quét nhanh). Toggle trong drawer (đầu danh sách, dạng switch) — bật thì mỗi lần quét chỉ render **thẻ tối thiểu** (hero "Bỏ vào kệ N" + tên/mã gọn), ẩn hết chi tiết (ảnh/chip/metrics/đơn/lịch sử/sibling) → quét liên tục nhẹ + đỡ nhiễu.

- `fastScan` + `FAST_KEY` localStorage (nhớ qua reload). `setFast(on)` toggle class switch + đổi scan-hint ("⚡ Quét nhanh…") + re-render kết quả hiện tại theo chế độ.
- `renderResult`: nếu `fastScan` → `<div class="card fast">` hero + `.fast-name` rồi return sớm (bỏ qua build chip/metrics/orders/history + wire handler). addToBatch/flash/beep vẫn chạy (ở resolve) → STT-filter + phản hồi không đổi.
- Switch CSS (`.fast-toggle`/`.ft-switch`), thẻ compact (`.card.fast`/`.fast-name`).
- Verify (session isolated): OFF→full (có chip); ON→compact (hero, không chip, "Váy Hoa Nhí · KHOVAY-005"), hint đổi, persist "1"; reload giữ ON; OFF→hint thường + persist "0"; 0 console error.

Status: ✅ deployed-ready.

### [web2 unit-scan] Quét nhanh liên tiếp + danh sách in chỉ nhận tem CÓ STT

**Files:** `web2/unit-scan/js/unit-scan.js`.

User: "cho quét nhanh hơn, quét liên tiếp thêm vào; phần in chỉ nhận mã đã có STT (trùng bỏ qua)".

- **Quét liên tiếp KHÔNG rớt scan**: `queueResolve` — serialize resolve qua promise chain (`_resolveChain`); mọi caller (onScan/SSE/reprint/deep-link) vào chuỗi tuần tự thay vì guard `resolving` (vốn drop scan). Verify: 5 scan dồn → 5/5 xử lý.
- **Nhanh hơn**: bỏ 2 API call thừa MỖI lần quét — `loadSiblings`(/by-product) + `loadEvents`(/:id/events) giờ **tải LƯỜI khi mở collapsible** (cờ `sibLoaded`/`histLoaded`, reset mỗi render). Verify: quét → byProduct=0/events=0; mở toggle → =1. Không chớp spinner khi quét liên tiếp (giữ kết quả cũ tới khi có mới).
- **In chỉ nhận tem CÓ STT**: `addToBatch` bỏ qua `orderStt==null` (kho) + trùng id → trả boolean; beep/flash xanh=đã thêm / đỏ=bỏ qua. Verify: 3 STT + 1 kho + 1 trùng → batch=3 (đủ STT), kho + trùng bị loại.
- 0 console error. (Verify trên session isolated profile do session chính bị parallel-session chiếm.)

Status: ✅ deployed-ready.

### [native-orders bill + web2-returns.js] Bill PBH in KHUNG "THU LẠI TỪ KHÁCH" cho shipper

**Files:** `web2/shared/web2-bill-service.js` · `web2/shared/web2-return-bill.js` · `native-orders/js/native-orders-pbh-bill.js` · `render.com/routes/web2-returns.js`.

User: bill PBH phải ghi rõ phần THU VỀ để shipper đọc bill dán trên gói → biết món nào thu lại từ khách (đổi/trả đơn trước). Bug: bill in từ `o.products` (native order) → KHÔNG có dòng thu về (server chỉ append vào `fast_sale_orders.order_lines`); và dòng thu về (nếu có) chỉ là note nhỏ `↳ Thu về 0đ` dễ nhầm quà tặng.

- **Backend**: endpoint `GET /api/web2-returns/on-order/:code` — trả SP thu về của 1 đơn (theo `consumed_pbh_code` = số PBH + fallback queued-by-phone). Gộp theo mã.
- **`_buildPbhShape`**: nhận `returnItems` (fetch qua `NativeReturnBill.onOrder(code)` ở 2 caller in bill) → append dòng `note:'Thu về 0đ', isReturn:true`. Tổng SL/tiền GIAO loại trừ dòng thu về.
- **`web2-bill-service`**: tách dòng bán vs thu về; thu về in ở KHUNG viền đậm **"⟲ THU LẠI TỪ KHÁCH (N món) — Shipper thu lại các món dưới đây"** (không nằm trong danh sách giao).
- **`web2-return-bill.collect`**: nhắc thêm SP khách ĐỔI LẤY khi tạo PBH.

Verify browser-test: mock PBH có dòng thu về → box render đúng (header/sub/item), dòng bán tách riêng, 0 error.

Status: ✅ deployed-ready.

### [web2 returns + web2-returns.js] Đại tu Thu về: scenario-first + đổi hàng/hàng lỗi/không-đơn-gốc + P3 hardening

**Files:** `web2/returns/index.html` · `web2/returns/css/returns.css` · `web2/returns/js/{returns-core,returns-scenario(NEW),returns-form,returns-order-items,returns-customer,returns-tabs,returns-api,returns-app}.js` · `render.com/routes/web2-returns.js` · `render.com/routes/web2-products.js` · `web2/shared/web2-return-bill.js`.

Sau audit đổi-trả (workflow 11 agent): trang Thu về cũ chỉ phủ ~40% kịch bản, UX rối bộ ba radio method×issue×subType. User: "làm tất cả".

**Frontend — scenario-first**: thay bộ ba radio bằng lưới **6 KỊCH BẢN** (Boom cả đơn / Nhận thiếu / **Đổi hàng-đổi size** / **Hàng lỗi-giao sai-hư** / **Thu về không đơn gốc** / Sửa COD). Mỗi kịch bản (config `returns-core.SCENARIOS`) tự set method/issue/subType + bật khối phụ. Mới: đổi hàng (picker SP đổi lấy + net-difference khách-bù/shop-hoàn), disposition hàng lỗi (giữ riêng/huỷ → KHÔNG +kho bán), thu về không đơn gốc (search SP thủ công, chỉ +kho), hình thức hoàn (ví/công nợ/tiền mặt/CK), phí ship hoàn + bên chịu, **barcode scan-to-add**, chip xác nhận ý định. Tab Danh sách: filter chips + lọc ngày. Tab Chờ duyệt: **Từ chối** (decline) + xác nhận trước Duyệt. Đơn nguồn: badge "Đã có phiếu".

**Backend `web2-returns.js`**: cột mới `disposition/return_shipping_fee/fee_bearer/refund_method/is_exchange/replacement_items/exchange_diff` (ALTER idempotent, test local DB pass). Đổi hàng = `thu_ve_1_phan` + `is_exchange` (KHÔNG fork money-path). Disposition giu_rieng/huy → reuse gate `stock_applied=FALSE` (skip +kho, ví vẫn cộng). refund tien_mat/ck → skip cộng SỐ DƯ ví nhưng VẪN settle `wallet_deducted` PBH (chống double-refund khi cancel PBH). **P3 fixes**: (1) over-refund edge — `_restoreCapped` cap wallet_deducted ≤ amount_total lúc huỷ KNH; (2) `billStatus=queued` chỉ khi khach_gui, shipper_gui queue lúc DUYỆT; (3) approve batch VALUES; (4) decline reuse DELETE + cờ; (5) `_recomputeParentsForCodes` (export từ web2-products) refresh tồn CHA sau mutation; (6) list filter method/issue/from/to.

**Cross-page**: `web2-return-bill.js` nhắc SP đổi-lấy khi tạo PBH. Wallet pill SSE đã sẵn (Web2WalletBalance sub `web2:wallet:*`).

Verify browser-test: 6 kịch bản render + toggle khối đúng, reason theo kịch bản, orphan +kho-không-ví, rebuild dòng SP khi đổi kịch bản (fix bug wipe lines), hàng lỗi preview "giữ riêng — KHÔNG +kho", 0 console error. Schema migration idempotent + round-trip pass.

Status: ✅ deployed-ready.

### [web2 unit-scan] Nút hành động → drawer (trượt phải)

**Files:** `web2/unit-scan/index.html` · `web2/unit-scan/js/unit-scan.js` · `web2/unit-scan/css/unit-scan.css`.

User: "thêm drawer cho các nút vào". Chuyển 3 nút (Sơ đồ kệ / Đưa xe ra / In danh sách) từ thanh header hàng-2 vào **drawer trượt từ phải**, mở bằng nút menu (☰) trong header → header gọn 1 hàng lại, buttons vẫn 1-chạm (nút menu luôn hiện, khỏi kéo xuống).

- Header 1 hàng + `#drawerBtn` (menu). `#drawerBack`/`.drawer` (scrim + panel phải, `drawerIn` translateX). Nút giữ ID (`batchMapBtn`/`manifestBtn`/`batchPrintBtn`+`batchCount`) → wiring cũ chạy; "In danh sách (N)" primary xanh, disable khi rỗng.
- Bấm 1 nút trong drawer → handler (mở sheet/print) + `closeDrawer` (2 listener xếp chồng) → drawer đóng, sheet mở. Đóng: nút X / scrim / ESC.
- Verify: browser-test — drawer mở phải, 3 item, print disable↔enable + count đúng, tap "Sơ đồ kệ" → drawer đóng + sheet mở; 0 console error.

Status: ✅ deployed-ready.

### [web2 unit-scan] Đưa nút hành động lên header dính (khỏi kéo xuống)

**Files:** `web2/unit-scan/index.html` · `web2/unit-scan/js/unit-scan.js` · `web2/unit-scan/css/unit-scan.css`.

User: "đưa các nút lên trên để khỏi kéo xuống". Gom 3 nút hành động (Sơ đồ kệ / Đưa xe ra / In DS) rải rác giữa trang vào **thanh actionbar hàng-2 TRONG header dính** → luôn ở đầu, không cần cuộn.

- Header thành 2 hàng: `.hd` flex-column, `.hd-row` (tiêu đề + tag/led/torch), `.actionbar` (3 nút).
- Nút giữ nguyên ID (`batchMapBtn`/`manifestBtn`/`batchPrintBtn` + `batchCount`) → mọi wiring cũ chạy. "In DS (N)" = CTA trắng nổi trên nền xanh, disable khi batch rỗng (renderBatch toggle `.disabled` + cập nhật count luôn). Big CTA dưới cùng bỏ, `#batchActions` còn nút "Xoá".
- ⚠ Bug sticky: `body{height:100%}` phá `position:sticky` cho element thứ 2 (actionbar rời scroll khỏi top). Fix: nhét actionbar VÀO trong header (`.hd` đã sticky sẵn, chứng minh chạy) thay vì sticky riêng → abTop=52 pinned ổn định.
- Verify: browser-test — actionbar `insideStickyHeader`, scroll xuống vẫn pinned; print disable↔enable + count đúng; 0 console error.

Status: ✅ deployed-ready.

### [web2 unit-scan] Rebuild UI — "Premium Light" + màu-theo-kệ (put-to-light)

**Files:** `web2/unit-scan/index.html` · `web2/unit-scan/js/unit-scan.js` · `web2/unit-scan/css/unit-scan.css`.

User: "cải thiện giao diện, có thể xóa đi làm lại" + "tìm google hình ảnh / github". Research 2 luồng (GitHub: `MinhNghia2010/Put-to-light`, `Rockship-Team/pick-to-light` — 2 repo put-to-light VN; web: 4 hướng thiết kế). User chọn **Light cao cấp (giữ Zalo-blue)**.

- **Màu-theo-kệ (put-to-light)**: 9 kệ = 9 màu định danh (`KE_COLORS`/`keColor(ke)` trong JS). Màu = "bỏ vào kệ nào" → mắt nhận màu trước khi đọc số. Dùng CHUNG (1 nguồn màu) ở: hero (thanh trái + tint + "BỎ VÀO KỆ N" + 📍 vị trí), ring-donut badge trên 9 ke-card (`conic-gradient` arc = sorted/needed), dải trái ke-card, pill vị trí trong "Danh sách đã quét".
- **Hero premium**: số STT khổng lồ `clamp(56px,19vw,84px)/900` near-black `#0b1220` (thay 46px xanh), viền/tint theo `--ke` (color-mix), suggested = viền nét đứt + tag "gợi ý".
- **Scanner overlay** (steal từ repo): 4 góc bo + laser chạy (`scanLaser`) + **chớp cả khung xanh/đỏ khi quét** (`scanFlash` — packer không nhìn toast góc). `pointer-events:none`, không đụng `#scanHost` (giữ warning .w2bc).
- **Mã mono** (bt-code), token nền mát hơn (`--c-bg #f2f5fa`, `--c-line #e3e8f0`). Giữ toàn bộ feature + ID (JS-bound) + reduced-motion-safe.
- **Verify:** browser-test account web2 thật — 0 console error; per-shelf color (K1 amber/K2 red/K3 violet) đồng bộ hero+ring+card+pill; scan-flash/laser/overlay OK.

Status: ✅ rebuild deployed-ready.

### [web2 unit-scan] Quét batch → in tem cả lượt → "Đã in" (nhóm thời gian) + đại tu UI

**Files:** `web2/unit-scan/index.html` · `web2/unit-scan/js/unit-scan.js` · `web2/unit-scan/css/unit-scan.css`.

User (2 phần): (A) thêm tính năng "quét tất cả mã 1 lượt → sơ đồ kệ theo danh sách đã quét → in danh sách → in xong chuyển Đã in (in lại theo nhóm thời gian)"; (B) đại tu lại bố cục + hiệu ứng đẹp/mượt cho cả trang.

- **(A) Batch in tem** (giữ luồng quét-1-tem + tiến độ 9 kệ cũ): panel "Danh sách đã quét" gom MỌI tem quét (dedup theo unit id, badge vị trí 📍 Kệ·Hàng·Cột / kho), nút "Sơ đồ kệ" mở sheet lưới 9 kệ tô ô đã quét + "chưa gắn kệ". "In danh sách đã quét" → gom theo mã SP → `Web2ProductsPrint.open` (tem QR `?u=<id>`) + `reprint` bump print_count → chuyển thành 1 **đợt** trong "Đã in" (timestamp GMT+7) → "In lại" theo đợt. Local-first `localStorage` (`web2_unitscan_batch_v1`/`_printed_v1`, giữ 60 đợt). Thêm trên flow scan thật (`opts.fromScan`), không double khi SSE/refresh.
- **(B) Polish UI** (giữ DOM order, single-view không tab): success-pulse glow trên STT hero mỗi lần quét (::after scale+opacity), tem mới "rơi" vào danh sách (`batchItemIn`), thanh meter tiến độ chia hàng dưới #stats (scaleX compositor-safe), **gập "Lịch sử đơn vị"** mặc định (giảm dày result card, reuse `.sib-toggle`), printed-history nền recessed `--c-surface-2`, đèn flash đổi icon zap↔zap-off, token motion 1-nguồn (`--ease-out-expo`/`--dur-*`), `.sec-break` thay inline margin, backdrop sheet fade. Tất cả transform/opacity, tôn trọng `prefers-reduced-motion`.
- **Verify:** browser-test (account web2 thật) — 0 console error; dedup/persist/print-group/reprint/shelf-map/collapsible đều pass; reload giữ "Đã in".

Status: ✅ feature + redesign deployed-ready (chờ push). ⬜ user xác nhận có muốn gập "Lịch sử" mặc định không (đổi muscle memory nhẹ).

### [security] Client creds → config-endpoint/env (SIP + SePay account password)

**Files:** `orders-report/js/phone-widget.js` · `n2store-extension/pages/phone.js` · `n2store-extension/background/sync/storage.js` · `cloudflare-worker/worker.js` · `cloudflare-worker/modules/handlers/sepay-dashboard-handler.js` · `shared/js/navigation-modern.js` · `service-costs/js/service-costs.js`.

User: chuyển client-side creds sang config-endpoint. Phát hiện kiến trúc đã có sẵn + 1 leak NGHIÊM TRỌNG:

- **SIP/VoIP:** endpoint `/api/oncall/phone-config` (DB) ĐÃ là nguồn; hardcoded creds chỉ là **fallback offline** → gỡ TRỐNG (authId/password/metered_api_key='') ở phone-widget + extension phone.js/storage.js. Bình thường lấy từ endpoint; offline → không SIP thay vì lộ cred.
- **🔴 SePay:** client (navigation-modern + service-costs) **hardcode EMAIL + PASSWORD tài khoản my.sepay.vn** trong JS public, POST cho worker login server-side (comment "nothing useful exposed" SAI). Fix: worker `sepay-dashboard-handler` đọc cred từ **env** (`SEPAY_EMAIL`/`SEPAY_PASSWORD`, env-primary body-fallback) + worker.js truyền `env`; gỡ email/password khỏi 2 client. service-costs: truncate 5 key AIza hiển thị.
- Còn lại low-risk (flag): service-costs api_key (worker-gate, không phải password), ImgBB free key (worker). attendance-sync ĐÃ env-based (FP).

⚠ **BẮT BUỘC user (nếu không → SePay dashboard widget vỡ):** (1) set worker secret `SEPAY_EMAIL` + `SEPAY_PASSWORD` (wrangler/dashboard); (2) **ROTATE** SePay password (đã lộ public) + SIP creds; (3) đảm bảo DB `/phone-config` có SIP config. Worker auto-deploy khi push `cloudflare-worker/**`.

Status: ✅ cred ra khỏi client source · ⬜ user set secret + rotate + verify.

### [security] Dọn secret toàn repo (CI gitleaks) — sanitize source + rotate (KHÔNG purge history)

**Files:** `render.com/config/tpos.config.js` · `render.com/scripts/migrate-dropped-held-to-pg.js` · `.gitleaks.toml` · xoá 5 dump .txt · sanitize `INBOX_PREVIEW_VARIABLES.md`.

CI gitleaks (artifact user push) → triage 54 leak tracked-tree. Phân loại + xử:

- **Đã fix source:** Firebase service-account PRIVATE KEY + DB-password (`migrate-dropped-held-to-pg.js`, script chết) → env; TPOS JWT hardcode (`tpos.config.js`) → env; xoá 5 file dump JWT hết hạn (inbox/script*.txt + docs1/*.txt); sanitize token trong INBOX_PREVIEW_VARIABLES.md.
- **Allowlist FP** (`.gitleaks.toml`): localStorage/cache KEY names, CORS header names, Firebase **web key (public theo Google)**, doc placeholder, .tmp/backups local.
- **Còn lại = client-side creds** (SIP/Metered VoIP ở extension+phone-widget, SePay key ở service-costs/navigation-modern, attendance secret, ImgBB worker key) — KHÔNG env hoá được trong file browser/extension tĩnh → **FLAG cho user** (rotate + chuyển config-endpoint nếu muốn ẩn).
- **⚠ Repo PUBLIC** → secret đã công khai trong history → **ROTATE BẮT BUỘC** (Firebase SA key, DB pw, SIP, SePay, ImgBB, attendance, Gemini/TPOS token sống).
- **History purge:** user chọn **BỎ** (git-filter-repo đổi hết SHA → phá 2014 file session-resume; giá trị biên thấp sau rotate). KHÔNG force-push.

Status: ✅ source sạch + allowlist + CI standing-audit live · ⬜ user ROTATE (mandatory) + client-cred architecture (optional).

## 2026-06-30

### [security] CI gitleaks/semgrep artifact → gỡ 2 secret hardcode nguy hiểm nhất

**Files:** `render.com/config/tpos.config.js` · `render.com/scripts/migrate-dropped-held-to-pg.js`.

User push workflow `security-audit.yml` → CI chạy → tải artifact. Phân tích:

- **Gitleaks (CI, allowlist)**: 54 leak working-tree. Phần lớn FP = Firebase web key (`AIza`, public theo thiết kế Google) + JWT TPOS hết hạn trong file dump (.txt/docs). THẬT nguy hiểm: (1) `tpos.config.js` JWT Bearer hardcode (fallback sau env), (2) `migrate-dropped-held-to-pg.js` (script CHẾT) chứa Firebase **service-account PRIVATE KEY** + client_email + DATABASE_URL(password).
- **Semgrep (CI)**: 34 (2 ERROR/32 WARN) — TLS-bypass ×4 (`NODE_TLS_REJECT_UNAUTHORIZED=0` TPOS/Pancake), path-traversal ×2 (admin-migration), postMessage-`*` ×8, direct-write ×14 — phần lớn chủ ý, cần triage tay.

**Fix (không echo value, regex in-place):** gỡ JWT hardcode → `process.env.TPOS_AUTH_TOKEN`; gỡ private-key + email + DB-pw hardcode → `process.env.*`. Verify count=0, node --check OK, gitleaks re-scan 2 file sạch.

⚠ **BẮT BUỘC USER:** secret VẪN trong git history → **ROTATE** Firebase service-account key (n2shop-69e37) + DB password. History purge (git-filter-repo) = quyết định user. ~318 leak khác ở render.com/scripts = script migration CHẾT (Firebase public + cred cũ) — review/xoá hàng loạt nếu muốn.

### [web2 system + ci] Siết services-overview admin-gate + tooling auto-audit (Gitleaks/Semgrep)

**Files:** `render.com/routes/services-overview.js` · `web2/system/js/system-services.js` · `.gitleaks.toml` · `.github/workflows/security-audit.yml` (on-disk, chưa push — thiếu workflow scope).

- **Services tab (task 2):** review code đã làm — đa số ĐÚNG (MAX_LOG_ROWS, EventSource close, start()-return latch, reload wiring OK, 0 console error). Phát hiện 1 lỗ hardening: web2/system là menu **CHỈ ADMIN** (web2-sidebar.js) nhưng backend chỉ `requireWeb2Auth` (mọi user login) → NV thường curl được cost+infra+tên-bảng-PII. **Siết → `requireWeb2Admin`** (403 non-admin); frontend phân biệt 401 (login) vs 403 (admin). Deploy verified: admin→200, no-token→401.
- **Auto-audit tooling (task 3):** chạy thật trên source — **Gitleaks** (secrets): 7149 match/12853 commit nhưng ~6.6k FP (data-export/docs/Firebase web-key public); thật cần review: vài file tracked có `AIza`/JWT (rotate nếu là Gemini/server key, KHÔNG phải Firebase). **Semgrep** (p/javascript+security-audit): 34 finding (2 ERROR/32 WARN) — TLS-bypass ×4 (`NODE_TLS_REJECT_UNAUTHORIZED=0` invoice-status/odata/pancake/token), path-traversal ×2 (admin-migration), postMessage-`*` ×8, direct-response-write ×14 — phần lớn chủ ý (proxy/TPOS cert), cần triage. Thêm `.gitleaks.toml` (allowlist FP) + `security-audit.yml` (Gitleaks+Semgrep **on push** — ci.yml cũ chỉ on PR mà repo push thẳng main → gần như không chạy). ⚠ `npm run lint` cũ = no-op (glob `js/**/*.js` không tồn tại + thiếu eslint config).

Status: ✅ services-tab hardening (deployed+verified) · ✅ gitleaks config pushed · ⬜ workflow file cần user push (workflow scope).

### [web2 audit] Follow-up đợt 2 — boost-purge wiring (desktop+mobile) + LiveCustomerSync token

**Files:** `live-chat/js/live/live-comment-list-actions.js` · `live-init.js` · `comments-mobile-actions.js` · `live-chat/js/shared/live-customer-sync.js`.

Đóng nốt follow-up vòng 4:

- **boost-purge realtime gỡ spam (MEDIUM)** — XONG cả 2 surface: thêm `LiveCommentList.removeComments(ids)` (lọc `LiveState.comments` + xoá DOM `.live-conversation-item[data-comment-id]`), wire `onReconcile` vào `LiveCommentsStream.create` ở **live-init.js** (desktop) **và** **comments-mobile-actions.js** (mobile: lọc `LCM.ALL` + `scheduleRender()`). Stream đã bắn `onReconcile(purgedIds)` từ SSE `{action:'reconcile'}` (đợt 1). Trước: delta chỉ APPEND → comment đã purge vẫn hiện tới khi refresh.
- **LiveCustomerSync token (security/PII)** — fallback path (khi `Web2CustomerStore` chưa load) của `enrich`/`flushHarvest` trước dùng `opts.headers || {Content-Type}` → thiếu `x-web2-token` cho `/customers/batch-by-*` + `/harvest-comments` (gated). Thêm `authHeaders()` 1-nguồn (Web2Auth.authHeaders → fallback localStorage) → fallback tự gửi token, không lệ thuộc caller.
- **AI-assistant `/list`** = NON-ISSUE (0 code fetch `.endpoint` registry — chỉ metadata cho AI). **web2-products-app dead SSE** giữ stub (subscription `web2:fast-sale-orders` còn dùng stock-sync, không xoá).

Verify: `node --check` 4 JS OK · smoke live-chat 0 console error · `window.LiveCommentList.removeComments` = function. Status: ✅

### [web2 audit] Fix TẤT CẢ vòng-4 (batch 7-agent disjoint-file) — 4 HIGH security + ~34 file

**Files:** 34 file (frontend + `render.com/**`). Backend cần DEPLOY.

User "làm tất cả". Workflow 7 agent (file-set rời nhau, sửa song song) + mình hoàn tất cross-file. Fix ~38/46 finding vòng 4:

- **4 HIGH (backend, cần deploy):** (1) `services-overview` thêm auth gate (require x-web2-token) + frontend gửi authHeaders → hết lộ inventory 2 DB + PII Web1. (2) `kpi.js applyKpiScope` fail-CLOSED khi ENFORCE + no/invalid token (sentinel `__deny_all__`→`FALSE`) + bọc `/load` requireWeb2AuthSoft → employee bỏ token KHÔNG còn thấy hết PII. (3) `web2-customers` 6 GET route thêm requireWeb2AuthSoft + **wire token cho MỌI caller** (live-comment-list-orders, native-orders customer-panel/inbox-add/inbox-resolve, customer-detail-modal, **web2-pm-customer-search**, **web2-bh-reassign-modal**) → không vỡ lookup. (4) `cart-detail` áp campaign-scope (backend gate + client forward `campaignId` qua `Web2Campaign.getCartDetail`) → số GIỎ popup khớp board.
- **MEDIUM fix:** Hết-hàng filter (api list() forward `status`) · usage-badge dead PII fetch XOÁ · per-unit print clamp = units.length · UPDATE gửi `expectedStock` (409 guard sống) · native status dropdown bỏ option server từ chối · SSE reload requeue khi load in-flight · PBH SHOP regex word-boundary · PATCH native strip field server-managed · live zero-cursor deadlock · so-order receive qtyReceived race · live-control onBoardOp/addGroup → Web2Optimistic + debounce SSE.
- **LOW fix:** EventSource close, filter no-refetch, "Buffer seq" label, optimistic snapshot clone, variant bulk báo lỗi, product-detail UI-first, toggleExpand dead code xoá, bulkSendMessage song song, dateInput GMT+7, soanHang fail-closed, avatar safeImg, ?campaign validate, cart-detail strip PII mode=new, campaign mutation UI-first, …
- **FALSE-POSITIVE (verify, KHÔNG fix):** so-order double-charge (POST /tx idempotent), getNccBatchTotals, storage "NUL" (`' ALL'`), auto-invoice image URL, /ingest page_id (relay-secret), boostMarks per-process.
- **Defer (không vỡ):** boost-purge consumer wiring (cần `LiveCommentList.removeComments`), web2-products-app dead SSE stub, tách file >800 dòng.

Verify: `node --check` 33 JS OK · smoke 6 trang authed **0 console error**. Chi tiết: `docs/web2/WEB2-PAGES-ANALYSIS.md` §🔬 VÒNG 4. ⚠ **Backend chưa hiệu lực tới khi deploy Render.** Status: ✅ frontend / ⬜ backend deploy.

### [web2 audit] Re-audit sâu 6 trang lõi (92 agent) — fix CRITICAL mất data so-order + nhãn confirm

**Files:** `so-order/js/so-order-modal-submit.js` · `native-orders/js/native-orders-state.js` · `docs/web2/WEB2-PAGES-ANALYSIS.md`.

Workflow 92 agent (6 map + 12 lens bugs/convention + security/data-integrity + ~70 adversarial verifier, 12M tokens, `wf_36cef76a-bc9`) audit services tab + so-order + web2/products + native-orders + live-chat + web2/live-control (~49k dòng JS). Smoke authed: 0 console error cả 6 trang. Findings MỚI sau vòng 1–3 (13/06): **1 CRITICAL · 4 HIGH · 15 MEDIUM · 26 LOW** (severity sau verify; nhiều cái bị hạ).

- ✅ **CRITICAL (so-order)**: "Sửa lô" save **hard-delete mọi dòng `partial_received`** → mất tồn Kho + nợ NCC phần đã nhận. Root cause: `isLocked` (so-order-shipment.js:27) loại cả received+partial_received khỏi modal → không vào `keptIds` → `toDelete` xoá; guard skip ở modal-submit.js:176 CHỈ chặn `received`. Fix: thêm `|| old.status==='partial_received'` (mirror guard có sẵn ở so-order-delete.js). Verifier có node-repro xác nhận.
- ✅ **LOW (native-orders)**: `NO.w2pConfirm` truyền thẳng `opts` cho `Popup.confirm` (đọc `okText`) nhưng 5 caller dùng `confirmText` → nút hiện 'Đồng ý' mặc định. Fix 1 nguồn: map `confirmText`→`okText` trong wrapper.
- ⬜ **4 HIGH chờ deploy+wire** (backend render.com, rủi ro 401-regression cần wire caller): services-overview unauth leak DB inventory+PII · native-orders /load KPI scope fail-open (employee bỏ token → thấy hết PII) · web2-customers 6 GET routes thiếu auth (dump 64k KH, 10+ caller cần gắn token trước) · live-control cart-detail bỏ campaign scope (số GIỎ lệch).
- ⚠ **so-order 'payment dual-base re-POST'** (chưa verify, verifier rate-limit) = nghi double-charge ví NCC — ưu tiên kiểm tay.

Chi tiết đầy đủ + file:line + fix: `docs/web2/WEB2-PAGES-ANALYSIS.md` mục **🔬 VÒNG 4**. Status: ✅ (2 fix) / ⬜ (HIGH chờ greenlight).

### [web2 system/dedup] Re-verify audit trùng-lặp bằng 16 agent + fix esc 3 leaf + sync trang

**Files:** `web2/system/data/web2-dedup-audit.json` · `web2/clearance/js/clearance.js` · `web2/unit-scan/js/unit-scan.js` · `web2/unit-scan/index.html` · `web2/goods-weight/js/goods-weight.js`.

User: "xem dedup tab đã xử lý hết lỗi chưa thì cập nhật trang". Chạy workflow 16 agent (adversarial, đọc code thật) verify từng nhóm trong tab "Trùng lặp / 1-nguồn" rồi mình verify lại trực tiếp các nhóm bị over-claim:

- **util-escape** (claim resolved): codemod 85f9fe06 BỎ SÓT 3 file leaf (clearance/unit-scan/goods-weight) — `esc` vẫn 4-char `/[&<>"]/` thiếu `'`. → **FIX** nốt lên 5-char (thêm `&#39;`), giữ esc local (leaf nhẹ, tránh load-order). Nay 0 bản 4-char → resolved (thật).
- **util-money**: đào sâu — `web2-sidebar.js` TỰ inject `web2-format.js` (`if !Web2Format`) trên 50 trang sidebar → ₫ đã unify runtime 13/14 trang consumer. Chỉ **unit-scan** (KHÔNG sidebar, dùng fmtVnd L239) render `'đ'` → **thêm `<script web2-format.js>` vào `unit-scan/index.html`** (trước app). Verify `Web2Format.vnd(1234567)='1.234.567₫'`. → resolved (₫ 1-nguồn mọi trang).
- **util-datetime** (claim resolved, severity high): verify 5 `fmtTime` ĐỀU có `timeZone:'Asia/Ho_Chi_Minh'` → KHÔNG có bug TZ. Giữ resolved, hạ severity high→medium.
- **chat-clients**: zalo-chat là hệ riêng WZChat (không phải dup) — làm rõ resolution.
- Thêm commit SHA đã xác minh (153a6091/bd2c728e/eb65634/7e6f568/d68cf952/85f9fe06...); util-auth để trống (agent cite nhầm e1010c4b = session commit).
- **Thêm nhóm mới `print-unit-builder`** (consolidation 24195eb8 hôm nay chưa có trong audit).

Tab nay: 16 nhóm (**11 resolved / 2 partial / 3 pending**). 3 pending (customer-lookup/order-math/pagination) là xuyên-layer Web1⊥Web2 → KHÔNG finishable (chủ ý); 2 partial (compute-product-status SQL un-retire pattern khác, util-auth 4 bản giữ fallback session) là chủ ý. Verified: `node --check` 3 JS OK, JSON parse + enum khớp render map, `Web2Format.vnd`→₫, server serve đúng. Status: ✅

### [web2 zalo] Chat: tự chọn tài khoản khi chỉ có 1 tài khoản cá nhân

**Files:** `web2/zalo/js/web2-zalo-chat.js` · `web2/zalo/index.html`.

Dropdown chọn tài khoản (`#wzChatAccount`) mặc định đứng ở placeholder `— Chọn tài khoản —`, chỉ set khi user click (event `change`). Có 1 tài khoản vẫn bắt chọn tay. Fix trong `fillAccountSelect`: nếu `list.length === 1` và chưa có lựa chọn (`!prev && !state.conv.accountKey`) → set `state.conv.accountKey` + `el.value` luôn. `loadConversations` gọi `fillAccountSelect` TRƯỚC khi fetch nên cùng lần load đã nạp hội thoại của tài khoản đó. Idempotent (lần sau vào nhánh `state.conv.accountKey`). Bump `?v=20260630autoacc`. Status: ✅

### [web2 zalo] Fix mã QR đăng nhập Zalo lỗi (ảnh vỡ)

**Files:** `web2/zalo/js/web2-zalo-accounts.js` · `web2/zalo/index.html`.

Modal "Đăng nhập Zalo" → "Quét mã QR" hiện icon ảnh vỡ. Root cause: zca-js `loginQR` **bóc** tiền tố `data:image/png;base64,` khỏi `ev.data.image` (node_modules/zca-js/dist/apis/loginQR.js:272) → route forward base64 thô qua SSE `web2:zalo:qr:<key>` → FE set thẳng `<img src="<base64 thô>">` → browser không load được.

Fix tại nơi render (`onQrEvent` case `'qr'`): nếu `d.image` chưa phải data URI thì prepend `data:image/png;base64,` (defensive: giữ nguyên nếu đã có prefix). 1 producer (route) ↔ 1 consumer (accounts.js), không có sibling renderer khác. `esc` chỉ thoát `&<>"'` → an toàn cho base64. Bump cache-bust `?v=20260630qrfix`.

Verified: vm test logic (base64 thô → có prefix; đã prefix → không double; esc không đụng base64). Status: ✅

### [web2 product-units] Gom builder per-tem về 1 nguồn `Web2ProductUnits.printUnit`

**Files:** `web2/shared/web2-product-units.js` · `web2/unit-scan/js/unit-scan.js` · `web2/shared/web2-unit-reprint.js`.

Cấu trúc per-tem `{unitCode, qrUrl, orderStt}` + chuỗi scheme `/web2/unit-scan/?u=<id>` đang FORK ở 3 nơi (`attachForPrint`, `unit-scan reprintUnit`, `unit-reprint doPrint`), và `attachForPrint` còn **thiếu `orderStt`**. Gom về 1 hàm:

- Thêm `Web2ProductUnits.printUnit(u, opts)` → `{unitCode, qrUrl: (opts.qrBase||origin)+'/web2/unit-scan/?u='+id, orderStt}` = NGUỒN DUY NHẤT scheme URL + STT kệ (đổi scheme chỉ sửa 1 chỗ).
- `attachForPrint` (so-order), `unit-scan reprintUnit`, `unit-reprint doPrint` đều `map(u => printUnit(u))` — bỏ chuỗi URL/shape lặp. `attachForPrint` giờ kèm `orderStt` (null cho tem mới so-order — vô hại, đúng cho mọi caller tương lai).

Verified: `node --check` 3 file + vm test `printUnit` (orderStt=42 / null, qrUrl scheme đúng). KHÔNG đổi contract `Web2ProductsPrint.open`. Status: ✅

### [web2 products-print] In STT KỆ TO lên tem per-unit (khoảng trống phải QR, dưới giá)

**Files:** `web2/products/js/web2-products-print-render.js` · `web2/products/js/web2-products-print-modal.js` · `web2/shared/web2-unit-reprint.js` · `web2/unit-scan/js/unit-scan.js`.

Yêu cầu user: tem QR per-unit của món ĐÃ gắn đơn (sau reconcile) in thêm **STT kệ TO** ở khoảng trống bên phải QR, dưới giá (chỗ trước để ghi tay). Nguồn STT = `web2_product_units.order_stt` = STT kệ (`campaign_stt ?? display_stt`, 1 nguồn `lib/web2-shelf-stt.js`).

- **render** `buildLabelHTML` (nhánh QR): thêm `.ql-qr-stt` vào cột phải SAU giá khi `label.stt != null` — `flex:1` ăn hết chiều cao còn lại, canh giữa, font lớn (`fs*2.6`) + đăng ký vào `fitText` để co theo bề ngang cột. Tem KHÔNG gắn đơn (so-order nhận hàng / Kho SP) → `stt` null → KHÔNG render, giữ trống như cũ (in tay).
- **print-modal**: thread `stt` per-tem = `units[i].orderStt ?? order_stt` → fallback `item.stt` cấp SP.
- **unit-reprint `doPrint` + unit-scan `reprintUnit`**: bổ sung `orderStt` vào mảng `units` truyền cho `Web2ProductsPrint.open` (trước đây bị bỏ).

⚠ **STT chỉ "luôn đúng" ở cấp UNIT (1 món) đã ASSIGNED** — 1 unit ↔ 1 đơn ↔ 1 order_stt (1:1, ổn định). Mã SP chung (sp-xxx) có nhiều món chia nhiều đơn → nhiều STT → KHÔNG đóng dấu 1 STT cấp mã được. Verified: `node --check` 4 file + harness render (vm) — stt=42 ra phần tử `.ql-qr-stt`>42, stt=null không render. Status: ✅

### [web2 reconcile] Audit toàn diện Đối soát đóng gói → fix 1 CRITICAL + 3 HIGH + nhiều MEDIUM/LOW

**Files:** `render.com/routes/reconcile.js` · `web2/reconcile/index.html` · `web2/reconcile/css/reconcile.css` · `web2/reconcile/js/{reconcile-state,reconcile-api,reconcile-render,reconcile-actions,reconcile-app}.js`.

Audit chức năng + giao diện + luồng dữ liệu liên trang (workflow: 6 context-reader native-orders/so-order/products/live-chat/live-control/system + 5 lens adversarial, verify refute-by-default → 55 confirmed). Fix theo ưu tiên:

- **P0 — keydown router (#1/#19)**: handler `keydown` capture toàn document nhồi ký tự gun vào ô quét ẩn + cướp Enter khỏi nút xác nhận khi Popup/camera/OCR/modal mở (surface tiền/tồn). Thêm `_overlayOpen()` guard (`#web2-popup-root .w2p-modal`, `.w2bc-root`, `.w2ocr-root`, `#rcAuditOverlay`) + bail khi focus trên `BUTTON`.
- **P1 backend**: `logAction` chuyển **TRONG transaction** (truyền `client`, rethrow) cho cả 8 mutation → hết cửa-sổ mất audit khi crash giữa COMMIT↔log (camera-verify tin cậy) · `reset-pick` chặn `returned` + `state='cancel'` (#8) · `/list` thêm filter `returned` (tab "Trả về / Hủy") + bỏ `draft` (#21/#42) · `/health` đếm cả `returned` cho badge · zero-qty guard không auto-pack đơn rỗng (#7) · `/pack` LUÔN verify đủ hàng (#14) · doc bất-đối-xứng autoPack scan vs tích tay (#6).
- **P1 frontend**: badge số PBH mỗi tab qua `/health` (trước FE không hề gọi, #15) · nút **−1** bớt 1 khi quét dư/nhầm (dùng manual-pick, không Reset cả đơn, #16) · tab "Trả về / Hủy" + nhãn `returned` (#11/#21) · SSE unsubscribe ở `pagehide` (#31) · `loadHistory` hiện trạng thái lỗi thay vì kẹt spinner (#33) · bỏ nhánh `escapeHtml` chết (#30) · `count` null-guard (#32).
- **a11y**: `<li>` PBH → `role=button tabindex=0` + keydown Enter/Space + aria-label (#4) · checkbox tích tay visually-hidden CHUẨN (bỏ `pointer-events:none/width:0`) + aria-label trên input (#3) · modal Lịch sử focus-trap + focus-return (#25/#34) · tablist `role`/`aria-selected` (#51) · progressbar role (#28) · refresh aria-label (#26) · toast `role=status`/`aria-live` (#27) · contrast `#94a3b8→#64748b` (#29).
- **UX kho**: ảnh SP hover-scale(4) → click `Web2ImageLightbox` (touch-friendly, #22) · toast mobile lên banner trên + rung haptic khác nhau success/error/đủ (#17) · tách nút "Trả về kho" (outline-danger, isolate trái) khỏi cụm primary (#24).

Verified: `node --check` 6 file OK + audit wiring tĩnh (decrementPick/loadCounts/\_overlayOpen/CSS class/HTML tab). Backend deploy qua Render (web2-api). **Còn cân nhắc product**: autoPack scan-đủ tự packed (giữ nguyên — team quen tốc độ; chỉ doc + để tích-tay vẫn cần nút) (#20); in nhãn/gán shipper/bulk-ship (#18 — luồng giao còn hở, làm sau). Status: ✅

### [web2 sse] Migrate 6 trang pure-debounce → Web2SSE.subscribeReload

**Files:** `web2/purchase-refund/js/purchase-refund-app.js` · `web2/clearance/js/clearance.js` · `web2/chi-tieu/js/chi-tieu-app.js` · `web2/fastsaleorder-refund/rf-app.js` · `web2/fastsaleorder-delivery/dlv-app.js` · `web2/goods-weight/js/goods-weight.js` (+ `web2-dedup-audit.json`).

Tiếp item SSE: survey từng trang → migrate 6 trang **PURE-debounce** (subscribe + tự `clearTimeout/setTimeout(reload, N)`) sang 1 dòng `Web2SSE.subscribeReload(topic, fn, {debounce:N})`, giữ **fallback defensive** (`else if subscribe` cho bridge cache cũ). Tổng **7 trang** dùng subscribeReload (+ variants). Trang xử lý **per-event riêng** (reconcile/products/supplier-debt/customer-wallet/cham-cong/unit-scan/jt-tracking/pbh-app: lọc `msg.action`, nhiều timer/topic, async, factory) **GIỮ raw subscribe** (chủ ý, không phải dup). Verified browser: chi-tieu subscribe đúng `web2:cashbook` qua subscribeReload, 0 err. Smoke 105 trang clean. Status: ✅

### [web2 sse] Web2SSE.subscribeReload — 1 nguồn subscribe + debounce reload

**Files:** `web2/shared/web2-sse-bridge.js` (thêm `subscribeReload` + export + header), `web2/variants/js/web2-variants-app.js` (wire), `web2/system/data/web2-dedup-audit.json`.

Đóng nốt item SSE-debounce: thêm `Web2SSE.subscribeReload(topic|topic[], fn, {debounce=500})` vào bridge (gom burst event → CHỈ 1 reload, trả unsub; bridge đã load mọi trang SSE → KHÔNG cần file mới). Wire `web2-variants` (pure-debounce, có fallback defensive). ⚠ Phát hiện khi survey: ĐA SỐ trang tưởng copy-paste thực ra xử lý per-event RIÊNG (lọc msg theo action, nhiều timer/topic, async) → KHÔNG dup thuần, giữ raw `subscribe` (chủ ý). Helper sẵn cho pure-debounce + trang mới. Verified browser: `subscribeReload` là function, trả unsub, subscribe đúng topic. **auth**: 4 RAW còn lại (web2-api/html-skill/ai-describe/tryon) CÓ fallback `web2_users_session` mà `authHeaders()` không có → giữ riêng (tolerance chủ ý). Audit: **10 resolved / 2 partial / 3 pending (cross-layer by design)**. Status: ✅ SSE resolved.

### [web2 util] Phone: gộp 14 helper → Web2PhoneUtils (GitHub research) + load 9 trang

**Files:** `web2/shared/web2-phone-utils.js` (nâng cấp: +`0084`→0, +`isMobile` regex đầu số VN thực, +export), 14 file `.js` (`Web2CustomerStore.normPhone` + 13 local → delegate `Web2PhoneUtils.norm`), 9 HTML (load `web2-phone-utils.js`), `web2/system/data/web2-dedup-audit.json` (phone → resolved).

User "tìm github để làm hoàn chỉnh":

- **GitHub research** (`lehuygiang28/phone-validate` 2025): xác nhận `norm` = libphonenumber-correct (84/0084→0, pad national 9 số); lấy regex đầu số DI ĐỘNG VN đầy đủ (gồm nhà mạng ảo iTel 087/Wintel 055/Vnsky-FPT 077x/089).
- **Phát hiện**: 2 "canonical" (`Web2PhoneUtils.norm` vs `Web2CustomerStore.normPhone`) **TRÙNG THUẬT TOÁN** (đều pad 9 số) → gộp an toàn (caution trước là do grep sót dòng pad, không phải divergence thật).
- Nâng `Web2PhoneUtils`: +`0084` handling, +`isMobile` (strict prefix cho form), giữ `isValid` lenient `/^0\d{9}$/` cho matching. → THE canonical.
- Delegate 14 helper (`normPhone`/`_normPhone`/`normalizePhone`/`_normalizePhoneInput`) → `Web2PhoneUtils.norm` (delegate-with-fallback, codemod).
- ⚠ `web2-phone-utils.js` trước đó **0 trang load** (delegate inert) → load vào 9 trang dùng phone. Verified browser: `norm("+84 912 345 678")`=0912345678, `norm("0084…")`=0…, `isMobile` đúng/sai. Smoke 105 trang clean.

Status: ✅ phone resolved (4/5 nhóm util xong; auth 95%).

### [web2 util] Sweep gộp util → canonical: money (11) + escape (76); date đã-delegate, phone hoãn

**Files:** ~80 file `.js` Web 2.0 (money 11 → `Web2Format.vnd`, escape 76 → `Web2Escape.escapeHtml`; codemod delegate-with-fallback GIỮ tên local), `web2/system/data/web2-dedup-audit.json` (cập nhật status util).

User "tất cả" → chạy 4 batch util:

- **money (11)** ✅ + **escape (76)** ✅: codemod prepend guard `if (window.Web2X && window.Web2X.method) return window.Web2X.method(arg);` + GIỮ logic cũ làm fallback (an toàn khi canonical chưa load → không đổi hành vi). Escape fix 4-char thiếu `'` ở clearance/unit-scan/goods-weight. Syntax 80 file OK; smoke 105 trang clean (10 "lỗi" = `Failed to fetch` Web 1.0 sẵn); spot-check `Web2Format.vnd`/`Web2Escape.escapeHtml` render đúng, 0 console error.
- **date** ⏭️ REVERT: hầu hết `fmtTime` xuất ĐẦY ĐỦ ngày+giờ (nhiều bản ĐÃ delegate `Web2Format.dateTime`) — audit over-count RAW. Blanket `fmtTime→time` làm MẤT phần ngày → revert toàn bộ 34. Đã consolidated sẵn.
- **phone** ⏭️ HOÃN: 2 canonical cạnh tranh (`Web2CustomerStore.normPhone` vs `Web2PhoneUtils.norm`) + divergence; matching-sensitive → KHÔNG blind-delegate.

Status: ✅ money+escape · ⏭️ date (sẵn) / phone (cần quyết định).

### [printer] Tunnel cloudflared cho Print Bridge — ĐT/PC khác in qua tunnel, KHÔNG cần cài bridge

**Files:** `scripts/print-tunnel.ps1` (MỚI — cloudflared tunnel → bridge 17777 + heartbeat registry `engine='printer'`, tự hồi sinh), `scripts/print-bridge.{js,ps1}` (allowlist SSRF: chỉ IP private + cổng máy in; `/health` thêm `engine:'printer'`; ver 1.1.0), `web2/shared/web2-printer.js` (`resolveBridgeUrl()` — local 127.0.0.1 sống thì dùng, không thì dò registry tunnel máy shop; `printEscpos`/`testConnection`/`bridgeAlive` đi qua resolver; cache tunnel 60s), `web2/shared/web2-pos-installer.js` (`:PRINTER` tải thêm cloudflared.exe + print-tunnel.ps1, chạy nền + auto-start `N2StorePrintTunnel.vbs`; uninstall gỡ kèm), `web2/printer-settings/index.html` (copy giải thích tunnel + cache-bust), bump `web2-printer.js`/`web2-pos-installer.js` `?v=20260630tun` ở mọi trang dùng.

User: "File .bat máy chấm công có cài tunnel cloudflare cho gemini, làm 1 tunnel cho máy in" — tái dùng Y CHANG pattern gemini-tryon/hyperframes (cloudflared quick-tunnel + heartbeat `web2-vieneu-registry`, chỉ thêm `engine='printer'`, KHÔNG route/bảng mới). Máy POS (máy cắm máy in) cài 1 lần → mở tunnel HTTPS → ĐT/PC khác cùng mạng dò URL từ registry → in qua tunnel (https→https, vượt mixed-content) mà KHÔNG cần chạy Print Bridge trên từng máy. **Bảo mật**: bridge giờ lộ Internet → allowlist chỉ relay IP nội bộ (10/172.16-31/192.168/127/169.254) + cổng máy in (9100… ) → khoá SSRF pivot ra host công khai/cổng nhạy cảm (residual: in rác lên máy in LAN — chấp nhận như gemini, URL xoay + TTL 90s; upgrade: thêm `x-print-token`). **Verify**: bridge thật probe — public IP/cổng 22 bị chặn, IP private/hostname qua guard (timeout/DNS thật); registry live `?engine=printer` trả `{ok:true,servers:[]}`; JS `node --check` 3 file OK. Status: ✅

### [system] Tab "Trùng lặp / 1-nguồn" (dedup audit) — audit toàn bộ Web 2.0

**Files:** `web2/system/js/system-dedup.js` (MỚI — renderer JSON-driven), `web2/system/data/web2-dedup-audit.json` (MỚI — 15 nhóm trùng), `web2/system/index.html` (tab + panel + script), `web2/system/js/system-app.js` (VALID_TABS + lazy-init + reload `dedup`), `web2/system/css/system.css` (`.dd-*` styles).

Audit toàn bộ Web 2.0 tìm trùng chức năng (3 agent: business-logic, shared-module, util file-list) → surface vào `web2/system?tab=dedup` (lọc loại business/shared/util + trạng thái, search). **15 nhóm**: 5 đã gộp (business #1-3 + caches→SmartCache + chat 3-tầng), 5 một phần (util auth **đã 95% delegate**, escape/money/date), 5 chưa làm (phone matching-sensitive, SSE-debounce, cross-layer customer-lookup/order-math/pagination). **Shared-module layer GREEN** (caches/chat/popup/QR/image đã sạch). **Util mass-sweep (~110 RAW file) KHÔNG mass-edit mù** — đổi output (escape `'`, money đ→₫, date TZ), smoke chỉ bắt crash không bắt diff → catalogue trong tab, làm per-batch verified (date/TZ ưu tiên: fix GMT+7). Smoke 105 trang: 4 trang chạm CLEAN; 11 "lỗi" = `Failed to fetch` Web 1.0 (backend không reach local, noise sẵn). Render verified: 15 cards, stats 15/5/5/5. Status: ✅

### [web2-products] computeProductStatus 1 nguồn (+ fix confirm-partial) + cross-link công thức "chờ hàng" — audit #2,#3/4

**Files:** `render.com/routes/web2-products.js` (hàm `computeProductStatus(stock,pending)` 1 nguồn; `upsert-pending` + `confirm-purchase-partial` dùng chung; FIX confirm-partial + cross-ref restock-needed), `render.com/services/web2-order-tags-service.js` + `web2/shared/web2-live-tv-display.js` (cross-ref comment công thức giỏ−tồn).

**#3:** gộp 2 site JS suy status về `computeProductStatus` (tồn≤0&chờ≤0→HET_HANG · ≤0&>0→CHO_MUA · >0&>0→MUA_1_PHAN · >0&=0→DANG_BAN). **FIX bug**: confirm-partial cũ trả `DANG_BAN` khi tồn0&chờ0 (nhận no-op trên SP hết hàng → lật HET_HANG→DANG_BAN sai) → nay HET_HANG. Site SQL "un-retire only" (adjust-stock/PBH/returns: chỉ bật lại khi đang HET_HANG&tồn>0) là pattern KHÁC — KHÔNG gộp (tránh reclassify SP user tạm dừng). Truth-table assert PASS (6 case).
**#2:** 3 nơi tính "giỏ vượt tồn" (tag `held` / restock `demand` / board `sold`) đã dùng **CÔNG THỨC GIỐNG HỆT** (Σ SL draft − stock) — thêm cross-ref comment 3 chỗ chống drift (KISS — không extract 1-line SQL). Status: ✅

### [order-tags] Gộp tag "Âm mã" → "Chờ hàng" (over-sell = chờ hàng, 1 khái niệm) — audit #1/4

**Files:** `render.com/services/web2-order-tags-service.js` (gỡ trigger/predicate/flag/detail/seed `am_ma`; `cho_hang` đổi nghĩa = giỏ giữ VƯỢT tồn `held>stock` draft-only = cần đặt NCC; + migration `DELETE … code='am_ma'`), `web2/shared/web2-order-tag-detail.js` (popup "ai đang giữ"/usage chuyển am_ma→cho_hang; badge "Cần đặt N"), `native-orders/js/native-orders-control-drawer.js` (PRODUCT_TAGS bỏ am_ma), `web2/order-tags/index.html` (doc).

User: **"Âm mã thực ra là Chờ hàng"**. 2 tag cùng nghĩa nhưng tên lệch: cũ `cho_hang`=status CHO_MUA (≈"đợi NCC giao" — user nói KHÔNG tồn tại vì NCC giao đủ), `am_ma`=giỏ vượt tồn (over-sell = thực sự **cần đặt NCC**). Gộp về **1 tag "Chờ hàng"** = SP cần đặt NCC = giỏ(draft) giữ > tồn (= board CHỜ HÀNG `giỏ−tồn`; SP CHO_MUA có người đặt tự nằm trong vì giỏ>0>tồn0). Bỏ tag `am_ma`. Phần #1/4 của audit cluster tồn-kho (gốc: user "có nhiều cái trùng chức năng"). Status: ✅

### [admin][wipe] Chừa `web2_order_tags` + `web2_payment_qr_codes` khỏi web2-wipe-9pages (CONFIG)

**Files:** `render.com/routes/admin-web2-data-reset.js` (gỡ 2 bảng config khỏi `WIPE9_TRUNCATE` + cập nhật doc comment & danh sách GIỮ NGUYÊN).

Phát hiện khi giả lập toàn bộ data Web 2.0 (wipe + seed test): `web2-wipe-9pages` xoá nhầm 2 bảng **CONFIG** — `web2_order_tags` (catalog định nghĩa tag `cho_hang/khach_la/pbh_created/…`) + `web2_payment_qr_codes` (QR thanh toán). Đây là cấu hình, cùng nhóm `web2_variants`; target `web2-all` vốn đã GIỮ. Wipe nhầm → mất tag toàn hệ (đơn không auto-gắn tag), phải restore từ backup `web2_order_tags_bak_*`. Đã loại khỏi danh sách truncate. FK cascade-guard KHÔNG ảnh hưởng (truncate child ref parent không-bị-truncate vẫn hợp lệ). Status: ✅

### [shared] Dọn compat `ncc`/`vuot` trong khConModel/cardState (sau #2)

**Files:** `web2/shared/web2-live-tv-display.js` (gỡ `ncc`/`vuot` khỏi khConModel return + `ncc` khỏi cardState; cập nhật header comment), `web2/live-control/index.html` + `web2/live-tv/index.html` (bump tv16).

Sau #2, xác nhận KHÔNG consumer nào còn đọc `m.ncc`/`m.vuot`/`st.ncc` từ model: live-tv/live-control dùng field mới (stock/gio/choHang/con); `unit-scan` đọc `data.metrics` (backend riêng, KHÁC); `supplier-pay` là NCC nhà-cung-cấp (`dataset.ncc`). → gỡ compat. Self-check: ncc/vuot=undefined, field mới còn nguyên.

### [so-order][web2-products] Surface "Chờ hàng cần đặt" vào Sổ Order → bấm thêm vào đơn (#2 follow-up)

**Files:** `render.com/routes/web2-products.js` (GET `/restock-needed`), `web2/shared/web2-products-api.js` (`restockNeeded()`), `so-order/js/so-order-restock.js` (MỚI — modal `SO.openRestockModal`), `so-order/js/so-order-toolbar.js` (wire `#soRestockBtn`), `so-order/index.html` (nút "Cần đặt" + load script + bump api/toolbar `→20260630a`).

Hoàn tất follow-up #1 của #2: board hiện CHỜ HÀNG, giờ Sổ Order surface để **bấm-đặt-NCC nhanh**.

- **Backend** `/restock-needed`: SP có **cầu giỏ NHÁP > TỒN** → `{…, demand, needed=max(0,demand−stock)}`. CHỈ draft (PBH đã trừ tồn → loại), `is_parent=false`. **Seed-tested** (X giỏ5>tồn1→cần 4; Y đủ tồn loại; Z parent loại; O3 confirmed không tính). Optional `?supplier=`.
- **Frontend**: nút toolbar "📦 Cần đặt" → modal liệt kê SP (Tồn·Giỏ·**cần đặt N**·NCC) + checkbox → "Thêm vào đơn mới" → `openOrderModal(null)` + prefill rows (qty=cần đặt, tái dùng `_fillRowFromProduct` quy đổi giá/ảnh).
- **Verify**: seed-test query PASS; browser so-order: nút hiện, `restockNeeded`/`openRestockModal` defined, click→overlay mở, 0 lỗi app (404 /restock-needed là do backend chưa deploy — chạy sau push).

### [live-control][live-tv][shared] Bỏ NCC gõ tay → "Chờ hàng" = GIỎ−TỒN (tự suy từ Kho) — Redesign #2

**Files:** `web2/shared/web2-live-tv-display.js` (`khConModel` + `cardState`: baseline = `stock` thật thay vì pending; `choHang = max(0, GIỎ−TỒN)`, `con = max(0, TỒN−GIỎ)`; giữ field cũ map compat), `web2/live-control/js/live-control.js` (vrowHtml → TỒN·GIỎ·MỚI·CHỜ; bỏ input NCC + `savePending` + 4 listener; miniCardHtml dùng stock/choHang), `web2/live-tv/js/live-tv.js` (vrow → TỒN·GIỎ·CHỜ), `web2/live-control/index.html` (bỏ selector "Cho VƯỢT theo" `#lcRegion`; sửa hint; bump tv15), `web2/live-control/css/live-control.css` (`.lc-vton`/`.lc-vcho`), `web2/live-tv/index.html` (bump tv15).

User chốt mô hình (clarify): **giỏ→PBH ĐÃ trừ tồn**, nên chờ hàng chỉ tính giỏ NHÁP. Bỏ NCC gõ tay (Sổ Order = writer duy nhất pending_qty → hết lỗi đè). Layout = **TỒN·GIỎ·MỚI·CHỜ HÀNG**; bỏ selector cho-vượt (chờ hàng đồng đều mọi SP).

- **Công thức**: CHỜ HÀNG = max(0, GIỎ_nháp − TỒN); CÒN = max(0, TỒN − GIỎ). Hủy đơn → GIỎ giảm → chờ hàng tự đúng (derived, không rollback tay).
- **Selector "Cho VƯỢT theo" bỏ**: HTML gỡ, JS guard `if(rsel)` sẵn → no-op. Layout control (rows/cols/page) + SSE sync GIỮ. Picker region chips (lọc SP) GIỮ.
- **D2**: "đã đặt NCC" (pending_qty) vẫn xem read-only ở chi tiết Kho qua `Web2ProductStatus.pill` (pill CHỜ HÀNG ×N) — không cần thêm.
- **Verify**: self-check node (TỒN1·GIỎ5→CHỜ4·CÒN0; cardState gộp CHỜ=7,GIỎ=8) PASS; browser live-control: selector gone, 0 input NCC, model shape đúng, hint TỒN, 0 lỗi console.
- **Follow-up** (chưa làm): surface số "chờ hàng cần đặt" vào Kho/Sổ Order để bấm đặt NCC (hiện board + TV đã hiện CHỜ).

### [web2-campaign-products] GIỎ scope theo phiên live (join post→chiến dịch) — bước 3/#1 (HOÀN TẤT #1)

**Files:** `render.com/routes/web2-campaign-products.js` (GET / GIỎ/MỚI query: thêm scope `live_campaign_id IN (post_id của chiến dịch)` + gate lũy tiến).

Hoàn tất Redesign #1. Trước: GIỎ gộp TẤT CẢ draft (đơn buổi cũ thổi phồng). Sau: scope theo bài đã gán vào chiến dịch.

- **Khóa nối (verify bằng real data)**: order `live_campaign_id` == `fb_post_id` == FB post id (`pageId_postId`) == `web2_live_post_assign.post_id`. Real data: order `117267091364524_1011638411752749`, `live_campaign_id == fb_post_id`. Join: `native_orders.live_campaign_id = web2_live_post_assign.post_id WHERE campaign_id = <board>`.
- **Gate lũy tiến (ZERO risk)**: chiến dịch CHƯA gán bài → `NOT EXISTS` → KHÔNG lọc (giữ global). Có gán → scope. Real data hiện assignments=0 → wire này KHÔNG đổi gì cho tới khi user gán bài (qua live-chat) → adoption dần.
- **Seed test local (psql)**: global=17; campaign 1 (gán POST_A) → 5 (3+2, loại POST_B=5 + null=7); campaign 99 (chưa gán) → 17 global. PASS.
- 2 bảng cùng `web2Db`, `campaignId` finite-validated. Deploy Render khi push.

### [native-orders] Gỡ tạo + gán chiến dịch → chỉ CHỌN để lọc (1 nguồn = live-chat) — bước 2/#1

**Files:** `native-orders/index.html` (gỡ input `#parentCampaignNew` + nút `#parentCampaignCreate` + cả `#parentPostsSection`/`#parentPostsList`; giữ `#parentCampaignList` radio lọc; bump 2 js `→20260630a`), `native-orders/js/native-orders-realtime-init.js` (gỡ `loadPagePosts()` + listener create/assign; giữ listener radio lọc), `native-orders/js/native-orders-filters-campaigns.js` (gỡ 4 hàm chết `createParentCampaign`/`loadPagePosts`/`renderPagePosts`/`assignPost`; sửa text "Tạo ở live-chat").

Tiếp bước 1 (live-control). Giờ native-orders chỉ CHỌN chiến dịch cha (radio) để LỌC đơn — KHÔNG tạo/gán.

- **Verify E2E**: create input/btn + assign list = gone; `createParentCampaign`/`assignPost` = undefined; `selectParentCampaign` = function (lọc còn); `#parentCampaignList` còn; 0 lỗi console.
- **Còn lại #1 = bước 3 (id bridge)**: board dùng BIGINT (web2_live_parent_campaigns.id), đơn dùng Pancake string (native_orders.live_campaign_id) → cần nối để GIỎ lọc đúng phiên. ⚠ Phức tạp hơn 1 cột: 1 parent campaign gom NHIỀU bài Pancake → map qua web2_live_post_assign, không phải 1-1.

### [live-control] Gỡ "Tạo chiến dịch" → chiến dịch chỉ tạo/gán ở live-chat (1 nguồn) — bước 1/#1

**Files:** `web2/live-control/index.html` (gỡ nút `#lcNewBtn` "Tạo"; giữ dropdown `#lcCampaign` để CHỌN; bump `live-control.js→tv14`), `web2/live-control/js/live-control.js` (gỡ `createCampaign()` + listener `#lcNewBtn`).

User chốt: tạo/gán chiến dịch là 1 nguồn = live-chat; live-control + native-orders chỉ ĐỌC/CHỌN. Bước 1 = gỡ tạo ở live-control (UI-only, reversible, listeners không còn ref null).

- **Verify E2E**: nút Tạo gỡ, dropdown chọn + Mở TV + Lịch sử còn, 0 lỗi console.
- **Còn lại của #1** (chưa làm): gỡ tạo/gán ở native-orders + **bắc cầu id** (board dùng BIGINT, đơn dùng Pancake string KHÔNG khớp → thêm cột `pancake_id` vào `web2_live_parent_campaigns`, populate lúc live-chat tạo, native-orders GIỎ join qua đó) → mới lọc được GIỎ theo phiên live.
- **#2 (chờ hàng derived)**: bỏ NCC gõ tay (Sổ Order thành writer duy nhất của pending_qty → hết race ghi đè); chờ hàng = max(0, committed − tồn), committed = SUM qty SP across đơn (Kho suy ra). Đợi user chốt 2 điểm.

### [products] Bỏ tạo SP trực tiếp ở Kho → Sổ Order là nguồn DUY NHẤT (SP luôn có địa danh) — P4

**Files:** `web2/products/index.html` (ẩn nút `btnCreateProduct` "Thêm SP" + `btnImportProducts` "Nhập" + `btnSampleProducts` "Tải mẫu"; giữ `btnReprintUnits` "In lại tem").

User chốt: thay vì thêm rổ "Chưa phân loại" (P4 cũ), **bỏ luôn đường tạo SP ở Kho** → SP chỉ sinh qua Sổ Order (luôn gán region từ tab địa danh) → region không bao giờ null. Verify (workflow): Sổ Order `syncRowsToKho` LUÔN set `region: trimLabel` (so-order-kho-sync.js:329), sticky không ghi đè.

- Chỉ ẩn UI (listeners null-safe `?.`), KHÔNG đụng backend → 0 rủi ro data. Sửa/in tem/xem chi tiết SP đã có vẫn chạy.
- **Verify E2E**: 3 nút tạo ẩn, "In lại tem" giữ, 17 nút sửa + 19 dòng SP vẫn render, 0 lỗi console.
- (Tùy chọn chưa làm) hardening backend: POST /api/web2-products trả 409 nếu thiếu region — defense-in-depth, để sau nếu cần.

### [shared][products][live-chat] `Web2ProductStatus` — 1 nguồn trạng thái SP + badge "chờ hàng" ở live-chat (P2)

**Files:** `web2/shared/web2-product-status.js` (MỚI — `meta/isChoHang/tableBadge/pill/chip`), `web2/products/js/web2-products-render.js` (`_statusBadgeHtml`→delegate `.tableBadge`), `web2/products/js/web2-product-detail.js` (statusPill→delegate `.pill`), `live-chat/js/pancake/inventory-panel-render.js` (thêm `.chip(p)` lên card), `live-chat/css/inventory-panel.css` (`.inv-status-badge` + tone pending/partial/gone), `web2/products/index.html` + `live-chat/index.html` (load module TRƯỚC consumer + bump `→20260630a`).

User hỏi "tạo module chung à?" → đúng convention (status fork 6 nơi, KHÔNG có shared). Gộp về `Web2ProductStatus`.

- **1 nguồn nhãn/icon/màu** status (CHO_MUA/MUA_1_PHAN/HET_HANG/DANG_BAN/Tạm dừng). Mỗi surface render CSS riêng nhưng nhãn/màu single-source → khỏi drift.
- `tableBadge`/`pill` **port nguyên văn** markup cũ web2/products (KHÔNG đổi giao diện). `chip` MỚI cho live-chat: CHỈ hiện status đặc biệt (DANG_BAN→rỗng, không rối panel).
- **P2 xong**: live-chat Kho SP giờ có badge "⏳ chờ hàng" → NV thấy "SL 0" là chờ NCC, không phải hết sạch.
- **Verify E2E (localhost, browser test)**: web2/products 19 badge render qua module (10 chờ hàng), markup y hệt; live-chat module load + chip render thật trên card CHO_MUA (1/14); 0 lỗi console; self-check node 11 assert PASS.
- ⚠ **Phát hiện cần user quyết** (chưa sửa): SP CHO_MUA tồn=0 → live-chat coi là OOS (`isOos=stock<=0`) → card mờ + **KHÔNG kéo được**. Trong khi live-control cho bán pre-order. Badge giờ giải thích "vì sao SL 0", nhưng có nên cho kéo SP chờ hàng ở live-chat không = quyết định nghiệp vụ.

### [system] Thêm card "Địa danh (vùng nguồn hàng)" vào tab Dịch vụ & Hệ thống

**Files:** `web2/system/index.html` (section static cuối panel `data-panel="services"`).

User: thêm chi tiết phần địa danh vào `web2/system?tab=services`.

- Section HTML thuần (không JS/data mới): giải thích `region` = vùng nguồn hàng (`web2_products.region`, gán qua Sổ Order / fallback prefix mã HN/HC).
- 2 card: **HƯƠNG CHÂU = hàng có sẵn (CHO VƯỢT)** vs **HÀ NỘI = pre-order (bán mẫu trước)** — đúng nghĩa user vừa chốt.
- Block công thức liên quan (NCC/GIỎ/MỚI/CÒN/VƯỢT per khConModel) + phân biệt với "chờ hàng" CHO_MUA (trạng thái kho, chặn PBH). Link tới live-control + so-order. Status ✅

### [live-control] Sửa nhầm "pre-order": vùng CHỌN = CHO VƯỢT (hàng có sẵn), vùng KHÔNG chọn mới là pre-order

**Files:** `web2/shared/web2-live-tv-display.js` (rename `isPreOrder`→`isVuotRegion` + comment khConModel), `web2/live-control/js/live-control.js` (title selector + confirm dialog + 4 comment), `web2/live-control/css/live-control.css` (2 comment), `render.com/routes/web2-campaign-products.js` (3 comment), `web2/live-control/index.html` + `web2/live-tv/index.html` (bump `→20260630tv13`).

User chốt nghĩa: **vùng CHỌN trong dropdown = hàng "lấy về rồi bán" (có sẵn) → CHO khách đặt VƯỢT số NCC báo (badge VƯỢT). Vùng KHÔNG chọn = pre-order thật** (bán mẫu 1 trước, đặt về sau — đặt vượt là bình thường nên không báo).

- Trước đây code+UI gọi vùng chọn là "địa danh pre-order" → SAI nghĩa. Đổi hết "pre-order" (selected) → "CHO VƯỢT".
- Hành vi KHÔNG đổi (logic `vuot = isVuotRegion ? max(0,gio-ncc) : 0` y cũ) — chỉ sửa tên biến + nhãn + comment. Property `.isPreOrder` không nơi nào đọc (chỉ `m.vuot`) → rename an toàn.
- User-facing: title selector + confirm "Đổi địa danh CHO VƯỢT" giải thích rõ chọn=có sẵn, không chọn=pre-order. Status ✅

### [live-control] Đổi nhãn dropdown "MỚI theo" → "Cho VƯỢT theo" (đúng chức năng pre-order)

**Files:** `web2/live-control/index.html` (label `lc-tvctl-region`).

User: nhãn "MỚI theo <địa danh>" gây hiểu lầm là lọc cột MỚI → đổi cho đúng.

- Dropdown `#lcRegion` thực chất chọn **địa danh nào được phép đặt VƯỢT NCC** (variant `region` khớp `state.tvControl.region` → `isPreOrder=true` → GIỎ được vượt NCC, hiện badge VƯỢT). KHÔNG đụng cột MỚI (`moi = v.newCust` luôn toàn cục — `web2-live-tv-display.js:khConModel`).
- Đổi text `MỚI theo` → `Cho VƯỢT theo`; tooltip → "SP đúng địa danh này được phép đặt VƯỢT NCC (hiện badge VƯỢT). KHÔNG lọc cột MỚI." Status ✅

### [order-tags][native-orders][render] Tag SOẠN HÀNG cho giỏ khi in phiếu soạn hàng + toggle admin bật/tắt in

**Files:** `render.com/routes/native-orders.js` (cột mới `soan_hang_print_count`/`soan_hang_last_printed_at`; map `soanHangPrintCount`; `/mark-printed` nhận `kind:'soan_hang'` → bump counter riêng + print_count), `render.com/services/web2-order-tags-service.js` (trigger `soan_hang` + predicate `status==='draft' && soanHangPrintCount>0` + seed thẻ `#7c3aed`/clipboard-list/priority 47), `native-orders/js/native-orders-api.js` (`markPrinted(codes,kind)` + `soanHangPrintEnabled()` cache 15s `/web2-order-tags/list`), `native-orders/js/native-orders-pbh-bill.js` (`_markPrintedCodes(codes,kind)` + `_canPrintSoanHang()` gate; 4 entry-point in Phiếu Soạn Hàng truyền `kind='soan_hang'` + gate toggle), `native-orders/index.html` (bump api+pbh-bill `→20260630a`).

User: thêm tag SOẠN HÀNG cho giỏ khi in phiếu soạn hàng; toggle bật/tắt CHỨC NĂNG IN, admin chỉnh. (User chốt: toggle = bật/tắt in; tag thuộc GIỎ → thành đơn thì mất.)

- **Tag**: chỉ giỏ (`status==='draft'`) đã bấm In Phiếu Soạn Hàng (`soan_hang_print_count>0`). Derived mỗi /load → khi giỏ thành đơn (status≠draft) tag TỰ MẤT. Tách counter riêng vì `print_count` gộp cả bill PBH.
- **Toggle = bật/tắt CHỨC NĂNG IN GIẤY, KHÔNG khoá nút** (user chốt 2026-06-30): bấm nút "In Phiếu Soạn Hàng" LUÔN gắn tag SOẠN HÀNG (và tag VẪN hiện); toggle chỉ quyết IN RA GIẤY hay không. BẬT → in giấy + tag (kind=`soan_hang`, bump 🖨+counter). TẮT → KHÔNG in giấy nhưng VẪN gắn tag (kind=`soan_hang_tag_only`, chỉ bump soan_hang_print_count, KHÔNG bump 🖨). Gate trong `packing-slip._print()` (async, fail-open).
- **Toggle = cột MỚI `print_enabled` (TÁCH khỏi `is_active`)**: vì is_active ẩn/hiện thẻ → không hợp (user muốn tắt in nhưng tag VẪN hiện). Thêm cột `web2_order_tags.print_enabled BOOL default true`; route map `printEnabled` + PATCH nhận; FE `soanHangPrintEnabled()` đọc `printEnabled`. Trang order-tags: nút 🖨 RIÊNG trên card `soan_hang` (`togglePrint`) + meta "🖨 In BẬT/TẮT".
- `mark-printed` 3 kind: `pbh` (🖨), `soan_hang` (🖨+tag), `soan_hang_tag_only` (chỉ tag).
- **Bug fix** `345a9c000`: `/web2-order-tags/list` trả `{records}` không phải `{tags}`.
- **Test E2E (deploy web2-api live)**: (1) `print_enabled=false` → tag SOẠN HÀNG **VẪN hiện** (is_active=true) — tách thành công khỏi is_active; (2) order-tags card `soan_hang`: nút 🖨 + meta "In BẬT/TẮT", bấm → flip + toast; (3) gate FE `soanHangPrintEnabled()` đọc `printEnabled`; (4) bấm In Phiếu Soạn Hàng (print OFF) → soan++ (tag gắn + HIỆN), printCount KHÔNG đổi (no 🖨 ảo), không in giấy; (5) kind soan_hang → bump cả 🖨+tag. Status ✅

### [unit-scan] Bấm ô sơ đồ kệ → MỞ MODAL chi tiết đơn (thay vì cuộn xuống)

**Files:** `web2/unit-scan/js/unit-scan.js` (thêm `openCellDetail(o)` module-level; click `.m-cell` giờ `openCellDetail(sttMap.get(stt))` thay vì scroll `#mrow`), `web2/unit-scan/css/unit-scan.css` (`.cd-back`/`.cd-modal`/`.cd-hd`/`.cd-stt`/`.cd-prods`… popup giữa màn, shadow ≤24px, no backdrop blur — anti-lag), `index.html` (bump `→20260630c`).

User: bấm ô (sơ đồ kệ) → mở modal xem chi tiết, KHÔNG cuộn xuống danh sách dưới.

- Modal dùng data có sẵn từ `/sort-manifest` (o): STT badge + tên KH + mã đơn + SĐT + tag chip + 📍 vị trí + tiến độ đủ/thiếu + danh sách SP (×qty + #tem). Đóng: X / click nền / ESC.
- **Ghi rõ SP nào đang CHỜ HÀNG**: đọc `tag cho_hang.detail.products[].code` → SP đó tô tên amber + pill `⏳ chờ hàng` (các SP khác bình thường). Vd HK Man: chỉ ÁO POLO BASIC chờ, ÁO BLAZER/GIÀY BÚP BÊ không.
- **Test browser**: bấm ô STT1 → modal "HK Man · NJ-20260629-0001 · 0903618628 · Chờ hàng · 📍 Kệ 1·Hàng 1·Cột 1 · 0/6 món", 3 SP, đúng 1 pill ⏳ ở ÁO POLO BASIC. Screenshot xác nhận. Status ✅

### [unit-scan] Tag đơn hiện NGAY TRÊN Ô KỆ (sơ đồ kệ) — ô rộng còn chỗ

**Files:** `web2/unit-scan/js/unit-scan.js` (mapHtml `openKe`: mỗi `.m-cell` có đơn → `<b class="mc-num">STT</b>` + `.mc-tags` pill từ `o.autoTags`), `web2/unit-scan/css/unit-scan.css` (`.m-cell` grid→flex-column; thêm `.mc-num` 13px, `.mc-tag` pill trắng đọc rõ trên nền cam/xanh), `index.html` (bump asset `→20260630b`).

User: "Tag hiện ở hình 2 (ô sơ đồ kệ), ô còn rộng" → đưa tag lên ô kệ (không chỉ ở danh sách STT bên dưới).

- Ô kệ ~125px chỉ có số 8px → thừa chỗ. Giờ: số STT to (13px) trên, pill tag trắng (`Chờ hàng`/`Khách lạ`…) dưới. Ô trống vẫn sạch. Giữ nguyên tag ở danh sách STT bên dưới (2 nơi: bản đồ + chi tiết).
- **Test browser (web2 login admin/admin!!)**: modal Kệ 1 → 90 ô, 6 ô có số, 3 ô có pill tag (STT1/6 "Chờ hàng", STT2 "Khách lạ"). Screenshot xác nhận pill trắng đọc rõ trên ô cam. Status ✅

### [unit-scan][native-orders][render] Modal "đặt lên kệ" hiện TAG đơn (CHỜ HÀNG / PHIẾU BÁN HÀNG…) — 1 nguồn, không drift

**Files:** `render.com/routes/native-orders.js` (tách block enrich PBH/CK/ví + `enrichOrdersWithTags` của `/load` ra hàm `enrichOrdersTags(pool, orders, opts)` — byte-identical, export thêm `enrichOrdersTags` + `mapRowToOrder`), `render.com/routes/web2-product-units.js` (`/sort-manifest`: sau khi gom đơn → load `native_orders` theo id → `enrichOrdersTags` → gắn `o.autoTags` lọc bỏ `kpi_user`; try/catch defensive → `autoTags=[]`), `web2/unit-scan/js/unit-scan.js` (row modal `openKe`: render `o.autoTags` thành chip màu theo def thẻ), `web2/unit-scan/css/unit-scan.css` (`.o-tags`/`.o-tag`).

User: bấm STT ở unit-scan → modal chi tiết đơn hiện CẢ tag, đặc biệt CHỜ HÀNG / PHIẾU BÁN HÀNG. Chốt hướng A (backend join + gọi engine tag, trả kèm `autoTags`).

- **1 nguồn, KHÔNG fork**: tag kệ tái dùng đúng engine `web2-order-tags-service` mà "Đơn Web" dùng → tag KHỚP 100%, không drift. Tách `enrichOrdersTags` để cả `/load` lẫn `/sort-manifest` gọi chung (DRY) — block giữ nguyên byte trong hàm (có SQL backtick → không dedent để khỏi đổi string).
- **Tươi, không cũ**: `/sort-manifest` query LIVE mỗi request → tag tính lại mỗi lần (đúng pattern derived-on-load), không snapshot. Lọc `kpi_user` (KPI attribution không hợp màn xếp kệ + tránh lộ NV).
- **Bug fix (E2E test live bắt được)** `c3121dbb6`: tag join MISS hết (`autoTags` rỗng) do `native_orders.id`=BIGSERIAL → pg trả STRING, còn `web2_product_units.order_id`=INTEGER → NUMBER → `Map.get` lệch kiểu. Fix `String()` 2 phía.
- **Test E2E (deploy web2-api live + browser web2 login admin/admin!!)**: `/sort-manifest` (7 đơn) → 3 đơn có tag: STT1/STT6 **"Chờ hàng"**, STT2 "Khách lạ" (PBH chưa hiện vì đơn còn là giỏ — đúng). Modal `openKe(1)`: 7 m-row, 3 `.o-tag` chip render đúng màu (amber "Chờ hàng") giữa tên KH ↔ SP. Screenshot xác nhận layout sạch. Status ✅

### [web2-zalo][render] Đăng nhập Zalo GLOBAL always-on — admin, 2 cách (cookie/QR), lưu server + auto-refresh

**Files:** `render.com/services/web2-zalo-zca.js` (`_isWanted` always-on bỏ focus-lease; `_afterLogin` persist creds thật; thêm `loginWithQR` + export; `releaseLease`→no-op), `render.com/routes/web2-zalo.js` (`_owner`=hằng `'__global__'`; `_saveSession` mã hoá+lưu session COALESCE; thêm `POST /accounts/:key/login-qr` đẩy QR qua SSE eventType `update`; admin-gate `login-cookie`/`login-qr`/`POST /accounts`; thêm `restoreSessions()`; require `web2-secret-crypto`), `render.com/db/web2-zalo-schema.js` (bỏ wipe `session=NULL`; migrate `owner_id='__global__'`), `render.com/server.js` (gọi `restoreSessions()` sau ensureSchema, chỉ instance `!DISABLE_WEB2_JOBS`), `web2/shared/web2-zalo-api.js` (`Web2ZaloOwner`=`'__global__'`; thêm `loginQr()`), `web2/shared/web2-zalo.js` (`_zaloOwner`→`'__global__'`), `web2/zalo/js/web2-zalo-accounts.js` (REWRITE — 1 TK global, modal 2 lựa chọn cookie/QR, auto-cookie khi detect, QR qua SSE `web2:zalo:qr:<key>`), `web2/zalo/js/web2-zalo-app.js` (admin-gate tab Tài khoản: `isAdmin`/`applyAdminGate`/guard `switchTab`; wiring login modal), `web2/zalo/index.html` (modal `#wzLoginModal` 2 lựa chọn + khu QR; bỏ presence focus-lease; bump asset `→20260629global`), `web2/zalo/css/web2-zalo.css` (`.wz-login-opt*` + `.wz-qr-*`).

User: bỏ đăng nhập cũ → admin bấm nút → 2 option cookie/QR → tự cookie nếu detect → account lưu server dùng TOÀN dự án + auto-refresh nếu hết hạn. Tab Tài khoản chỉ admin. (User chốt: acc RIÊNG luôn online, 1 TK global — chấp nhận chat.zalo.me bị "Đổi thiết bị".)

- **Đảo ngược** quyết định 2026-06-23 (per-máy + no-server-session + no-QR) + focus-lease 2026-06-25. owner ép hằng `'__global__'` (ponytail — không gỡ plumbing owner-scoped, chỉ ép hằng số → blast radius nhỏ). Session lưu DB mã hoá at-rest (`web2-secret-crypto`, no-op nếu chưa bật `WEB2_ENC_KEY`) → boot-restore + watchdog 24/7. QR: zca-js `loginQR` → ảnh base64 đẩy SSE (eventType `update` vì bridge không nghe custom type).
- **Test browser (web2 login admin):** tab Tài khoản hiện (admin) · `Web2ZaloOwner='__global__'` · `ZaloApi.loginQr` có · modal mở 2 option cookie+QR · click QR → khu QR + subscribe `web2:zalo:qr:<key>` (lỗi `Not Found` = route chưa deploy, đúng đường gọi) · 0 console error · đóng modal → unsubscribe SSE sạch. Status ✅ (BE chờ deploy Render để test E2E login thật)

### [web2-variants] Trường "Nhóm" modal biến thể → SELECT bắt buộc (Màu / Size)

**Files:** `web2/variants/index.html` (input#vmGroup → select 3 option `""`/`Màu`/`Size`, label `Nhóm (tùy chọn)`→`Nhóm *`, bump app js `→20260629a`), `web2/variants/js/web2-variants-app.js` (saveModal: thêm guard `if(!fields.groupName) _reenable('Cần chọn nhóm: Màu hoặc Size')`).

User: trường Nhóm bắt buộc chọn 1 trong 2 (Màu hoặc Size).

- Đổi free-text optional → `<select>` native (khớp `#vmIsActive` cùng modal). Setter `$('#vmGroup').value=...` ở openCreate/openEdit hoạt động y hệt input — không sửa. Biến thể legacy có groupName khác → select rơi về placeholder, buộc chọn lại (đúng ý beta).
- **Test browser (web2 login):** field `tag=SELECT options=["","Màu","Size"] label="Nhóm *"`; lưu khi để trống → modal vẫn mở + toast `error:Cần chọn nhóm: Màu hoặc Size` + nút Lưu re-enable. Status ✅

### [native-orders] Bảng điều khiển trượt phải — tab Thẻ + Sản phẩm + Thống kê (thay chip lọc)

**Files:** `native-orders/js/native-orders-control-drawer.js` (NEW — toggle mép phải + drawer non-modal 3 tab; thay `native-orders-tag-aggregate.js` ĐÃ XOÁ), `native-orders/index.html` (bỏ chip `#filterTagBtn`+dropdown+CSS `.no-tagf-*`; thêm script drawer; bump 4 js `→m`), `native-orders/js/native-orders-filters-campaigns.js` (gọn `applyTagFilter(trigger)`+`clearTagFilter` gọi `refreshControlDrawer`; bỏ render panel/toggle/label; giữ `_visibleOrders`/`_tagSummary`), render.js (`refreshControlDrawer`), realtime-init.js (bỏ wiring chip — drawer tự dựng).

User: bỏ chip "Thẻ" trên toolbar → toggle mép phải mở drawer trượt phải có tab TAG, tab khác tùy phát triển. Sau đó: thêm tab Sản phẩm gom SP mọi giỏ + cho tìm.

- **Toggle** = nút dọc mép phải (ẩn khi drawer mở) + badge khi đang lọc thẻ. Drawer **non-modal** (bảng vẫn thao tác sau lưng), trượt từ phải, ESC/X đóng.
- **Tab Thẻ**: "Tất cả" + mỗi thẻ (chấm màu + số đơn). Bấm hàng = lọc bảng client-side (bấm lại = bỏ lọc); ▸ = bung chi tiết (đơn STT+KH+SĐT + SP liên quan thẻ SP); bấm 1 đơn → cuộn tới + nhấp nháy.
- **Tab Sản phẩm**: gom MỌI SP trong tất cả giỏ/đơn trên trang theo mã (mã·tên·×tổng SL·N đơn, sort SL desc) + **ô tìm** (mã/tên, re-render riêng list để giữ focus); ▸ = xem đơn nào chứa SP đó (STT+KH+SL).
- **Tab Thống kê**: tổng đơn/tiền/SL + theo trạng thái + chip theo thẻ (bấm = lọc). Data 100% client `STATE.orders`. Thêm tab mới = thêm vào TABS + 1 hàm render.

**Test browser (6 đơn):** 3 tab; Sản phẩm gom ÁO POLO BASIC ×5·2đơn / ÁO BLAZER ×4·4đơn / GIÀY BÚP BÊ ×2·2đơn, tìm "polo"→1 SP; Thẻ: bấm Chờ hàng→bảng 2 dòng+badge, bung→STT 6+1; screenshot khớp. Status ✅

### [native-orders] Bộ lọc Thẻ: bỏ <select> → panel DANH SÁCH + drawer "chi tiết" tổng hợp

**Files:** `native-orders/js/native-orders-tag-aggregate.js` (NEW — drawer slide-in `NO.openTagAggregateDetail`), `native-orders/js/native-orders-filters-campaigns.js` (bỏ `populateTagFilterOptions`/select → `renderTagFilterPanel`+`_tagSummary`+`applyTagFilter(trigger)`+`toggleTagDropdown`+`_renderTagFilterLabel`+`clearTagFilter`; giữ `_visibleOrders`), `native-orders/index.html` (chip select → button `#filterTagBtn`+panel `#filterTagDropdown`/`#filterTagList` + CSS `.no-tagf-*` + script mới + bump 4 js `→k`), `native-orders/js/native-orders-render.js` (gọi `renderTagFilterPanel`), `native-orders/js/native-orders-realtime-init.js` (bỏ listener `#filterTag change`; thêm button toggle + delegation panel + click-ngoài đóng).

User: bỏ filter `<select>`; mở ra danh sách tất cả thẻ; bấm thẻ = lọc bảng; thêm nút cạnh thẻ bấm coi chi tiết (vd Chờ hàng → tất cả STT chờ + SP đang chờ). Style như drawer trang Sản phẩm.

- **Panel**: button "Thẻ: [nhãn]" → dropdown liệt kê "Tất cả" + mỗi thẻ (chấm màu + tên + số đơn). Bấm hàng → `applyTagFilter(trigger)` lọc client-side + đổi nhãn + đóng. Nút mắt cạnh thẻ → drawer.
- **Drawer** (slide-in phải, giống Sản phẩm): liệt kê MỌI đơn trang này mang thẻ (STT + KH + SĐT) + SP liên quan (thẻ SP chờ hàng/âm mã/hết hàng/mua 1 phần → `tag.detail.products`, hiện pendingQty/orderQty). Bấm 1 đơn → đóng + cuộn tới hàng + nhấp nháy. Footer "Lọc bảng theo thẻ này". Data 100% client (STATE.orders), dùng chung `_tagSummary`+`computeOrderStt`.

**Test browser (6 đơn thật):** panel: 5 hàng (Tất cả/Chờ hàng 2/Thiếu địa chỉ 2/Giỏ trống 1/Khách lạ 1) + 4 nút mắt; bấm Chờ hàng → bảng 2 dòng + nhãn "Chờ hàng" + panel đóng; drawer Chờ hàng → "2 đơn · 2 SP", STT 6 Tuyen Thanh + STT 1 HK Man, mỗi đơn HCAO3XCO35 ÁO POLO BASIC ×4; screenshot khớp. Status ✅

### [native-orders/shared] In bill — gộp Phiếu Soạn Hàng vào đường in chung + bridge (nhanh)

**Files:** `web2/shared/web2-bill-service.js` (thêm `Web2Bill.printDocHtml(html,opts)` + refactor `openPrint` delegate + export), `native-orders/js/native-orders-packing-slip.js` (route `_print` qua `Web2Bill.printDocHtml`, giữ iframe nội bộ làm fallback) + bump version.

User: "in bill có dùng chung 1 module chưa? Cải thiện tốc độ in, tìm github".

- **Review**: bill PBH ĐÃ dùng chung `Web2Bill`+`Web2Printer` (bridge-aware). NHƯNG **Phiếu Soạn Hàng** (giỏ hàng) là FORK riêng trong packing-slip.js — tự iframe-print, **KHÔNG qua bridge** → luôn mở hộp thoại (chậm). GitHub: ESC/POS bridge (DantSu/receiptline…) đúng là cách nhanh nhất cho thermal — project đã dùng; chỉ thiếu ở packing slip.
- **Fix**: thêm `Web2Bill.printDocHtml(html,{role,method,bill,label})` = bridge-or-dialog DÙNG CHUNG (role có máy IP → in THẲNG ESC/POS không hộp thoại = nhanh; chưa gán/lỗi → fallback iframe). `openPrint` (bill) refactor gọi nó. Packing slip `_print` gọi nó (role `pbh`) → giờ in thẳng máy bill như bill PBH.
- 1 nguồn in: openPrint + Phiếu Soạn Hàng cùng `printDocHtml`. Fallback iframe nội bộ giữ khi Web2Bill chưa load (defensive). 5 caller `openPrint` đều không dùng return → đổi sang Promise an toàn.

**Test browser:** `Web2Bill.printDocHtml`=function; spy xác nhận packing slip route qua nó (role `pbh`, label "Phiếu Soạn Hàng", HTML có "CHỜ HÀNG" + SP đúng); `roleIsBridge('pbh')`=true (env có máy) → đi bridge; openPrint refactor syntax OK + page responsive. ⚠ Chưa test in vật lý (no printer thật) — packing slip raster 72mm cần user verify output thermal đẹp. Status ✅

### [native-orders] Phiếu Soạn Hàng tự tick SP "Chờ Hàng"

**Files:** `native-orders/js/native-orders-packing-slip.js` (`_waitingCodes`/`_isWaiting` + attr `checked` checkbox) + bump version trong index.html.

User: "Phiếu soạn hàng tự check vào sản phẩm chờ hàng".

- Nguồn SP chờ hàng = autoTag `cho_hang` `detail.products[].code` (server đính ở /load, SP status `CHO_MUA`). `_waitingCodes(order)` → Set mã; `_isWaiting(p,set)` so `p.productCode`. Checkbox CHỜ HÀNG render `checked` khi khớp.
- KHÔNG fork logic chờ hàng — dùng đúng nguồn engine `web2-order-tags-service` (cùng cái pill "Chờ hàng" cột Thẻ).

**Test browser (NJ-20260629-0007, SP HCAO3XCO35 "ÁO POLO BASIC" status CHO_MUA):** mở Phiếu Soạn Hàng → checkbox CHỜ HÀNG tự tick ✓ (screenshot khớp). In ra vẫn đậm "CHỜ HÀNG" như cũ (đọc checkbox.checked). Status ✅

### [native-orders] Bỏ nút "PBH SHOP" bulk + gỡ content-visibility (giật khi expand+search)

**Files:** `native-orders/index.html` (xóa button `#ordersBulkPbhShop` + gỡ rule `content-visibility` + bump bulk-operations/realtime-init `→i`), `native-orders/js/native-orders-bulk-operations.js` (xóa hàm chết `bulkCreatePbhShop` ~100 dòng), `native-orders/js/native-orders-realtime-init.js` (gỡ listener).

User: (1) "bỏ nút PBH SHOP vì modal Tạo PBH + picker giao hàng đã có 'BÁN HÀNG SHOP'/'Shop' tạo PBH shop rồi" → redundant. (2) "khi mở expand mà tìm kiếm nó giật giật".

- **Bỏ PBH SHOP bulk**: xóa button + listener + hàm `bulkCreatePbhShop` (chỉ button gọi, grep confirm 0 ref khác). Chức năng vẫn còn ở modal Tạo PBH (`createPbh(code,{shopMode})`) + DeliveryMethodPicker option Shop. Verify: button mất, hàm undefined, các nút bulk khác còn đủ (Gộp/PBH/In bill/Gửi tin/Bỏ chọn).
- **Gỡ `content-visibility:auto`** trên `.order-row`: thêm hôm nay cho cuộn (+6fps) nhưng gây paint pop-in off-screen lúc re-render/scroll. Đo CLS khi expand+search: CV on 0.044 / CV off 0.044 (shift còn lại = search reload đổi kết quả lúc đơn mở expand, KHÔNG phải CV) — nhưng CV gây bất ổn paint nên gỡ (lợi ích marginal). Chống freeze list lớn vẫn dùng **chunked render** (đủ). Cuộn 1000 về ~35fps (vẫn dùng được).

**Test browser:** PBH SHOP button gone, fn undefined, bulk bar còn 5 nút đúng; content-visibility=visible. Status ✅ — ⏳ chờ user xác nhận expand+search còn giật không (shift còn lại từ reload kết quả, sẽ đào tiếp nếu cần).

### [native-orders] Render chunked + content-visibility — hết freeze list lớn (1000 dòng)

**Files:** `native-orders/js/native-orders-render.js` (renderRows: chunked + `_iconsIn` scoped + `_finalizeRender` + quyết định chunk theo `rebuildCount`), `native-orders/index.html` (CSS `content-visibility:auto` cho `.order-row` + bump render.js `f→i`).

User: "thử thêm 1000 giỏ test độ nhạy/giật/lag" → đo thấy render 1000 dòng freeze 1.3s + cuộn 35fps. Chọn hướng **content-visibility + chunked** (giữ mọi dòng trong DOM → KHÔNG vỡ check-all/bulk-ops/KPI/expand vốn quét DOM; tránh rework rủi ro).

- **Đo phân rã freeze 1000**: build HTML 591ms + chèn 300ms + lucide icon 307ms (~11 icon/dòng).
- **Chunked render**: build+chèn `RENDER_CHUNK=80` dòng/frame qua rAF → lô đầu hiện **176ms** (was 1303ms freeze), phần sau lấp dần. Lô đầu chạy sync, còn lại rAF. Hủy rAF cũ khi render mới.
- **Quyết định chunk theo `rebuildCount` (dòng BUILD MỚI), KHÔNG theo jobs.length**: mở trang/đổi lọc/load lớn → chunk; SSE refresh (đa số tái dùng) → **swap nguyên tử 1 phát** = KHÔNG flicker (không xóa-rồi-lấp).
- **`_iconsIn(root)` — convert `<i data-lucide>`→svg SCOPED trong fragment** (lucide.createElement + map kebab→Pascal), thay `lucide.createIcons()` quét cả DOM mỗi lô = **O(n²)** (đã đo longtask tăng 220→912ms). Fallback createIcons() cuối nếu API lucide khác.
- **CSS `content-visibility:auto; contain-intrinsic-size:auto 98px`** trên `.order-row` → cuộn 35→41fps, off-screen bỏ layout/paint. Verify KHÔNG lệch cột dù table-layout:auto (maxColShift 0px).

**Test browser (1000 inject):** first-paint 176ms · longtask ổn định ~280ms (hết O(n²) 912ms) · cuộn 41fps · check-all=1000 · tag filter 1000→700 · expand OK · 1000 dòng vẫn trong DOM. **Real 6 đơn (atomic path):** 6 dòng, 11 svg.lucide/dòng, 0 icon sót, expand/tagfilter/typeahead OK, screenshot khớp. SSE re-render (reuse) = atomic 1 swap không flicker. Status ✅

### [native-orders] Ô tìm kiếm typeahead — gợi ý KH/đơn từ data đã tải

**Files:** `native-orders/index.html` (`#searchSuggest` trong `.search-wrapper` + CSS `.no-search-suggest`/`.nss-*` + bump 3 js `e→f`), `native-orders/js/native-orders-filters-campaigns.js` (`_searchSuggestItems`/`renderSearchSuggest`/`pickSuggestion`/`hideSearchSuggest`/`moveSuggestActive`), `native-orders/js/native-orders-realtime-init.js` (input→render gợi ý; keydown Arrow/Enter/Escape; focus/blur; clear), `native-orders/js/native-orders-render.js` (`_suggestPool` lần load không-search + refresh khi dropdown mở).

User: "Ô tìm kiếm nhập vào sẽ hiện các option dữ liệu để chọn" (đã đọc `web2/order-tags` + `web2/system?tab=services`).

- **Client-side, KHÔNG fetch thêm**: gợi ý lấy từ orders đã tải. Bảng vẫn lọc server-side (debounce 350ms) như cũ — dropdown chỉ là tiện ích chọn nhanh.
- **Pool ỔN ĐỊNH** (`_suggestPool` = lần load `search` rỗng) → gõ query mới sau khi đã search vẫn gợi ý đủ (search narrow STATE.orders, pool giữ rộng). Bug đã sửa: trước lấy STATE.orders → bị thu hẹp → gõ tên sau SĐT ra rỗng.
- Match SĐT/tên/mã/ghi-chú; gom theo KH (SĐT) — kèm "N đơn"; khớp DUY NHẤT bởi mã → gợi ý cấp ĐƠN. Chọn → input = SĐT (hoặc mã) chính xác → load thu hẹp. Bàn phím Arrow/Enter/Escape; Enter rỗng = tìm tự do (giữ behavior cũ).

**Test browser (admin, localhost, 6 đơn thật):** "0903"→HK Man·0903618628 ✓; search "0903" rồi gõ "trang" → vẫn gợi ý Trang Đài (pool size 6, fix circularity) ✓; chọn Trang Đài → input "0919561765" + bảng còn 1 row ✓; "NJ-...0001"→gợi ý kind=order ✓; "09"→4 KH (avatar+tên+SĐT), screenshot UI đúng ✓; `node --check` ✓. Status ✅

### [native-orders] Bộ lọc THẺ (autoTags) — client-side trên trang đã tải

**Files:** `native-orders/index.html` (chip `#filterTag` giữa Trạng thái↔Chiến dịch + bump 4 js `c→d`), `native-orders/js/native-orders-state.js` (`STATE.tagFilter`), `native-orders/js/native-orders-filters-campaigns.js` (`applyTagFilter`/`_visibleOrders`/`populateTagFilterOptions` + reset trong `clearFilters`), `native-orders/js/native-orders-render.js` (`renderRows` lặp `_visibleOrders`, empty-state + `renderCounters` theo lọc, `load` gọi populate), `native-orders/js/native-orders-realtime-init.js` (wire `change`).

User: "Thêm filter tag" cho trang Đơn Web (đã đọc `web2/order-tags` + `web2/system?tab=services`).

- **Client-side, KHÔNG reload**: tags (`o.autoTags`) tính server-side SAU phân trang → không lọc DB được; lọc trên trang đã tải (giống KPI health bar). Đổi thẻ → chỉ re-render.
- **Options tự dựng** từ autoTags của orders đã tải, gom theo `trigger` (1 trigger = 1 thẻ, khớp `web2/order-tags`), nhãn = `tag.name` (kpi_user động → "KPI (người nhận)"), kèm count, sort desc. Giữ lựa chọn nếu trigger còn xuất hiện sau reload.
- **Đếm "kết quả"** = số đơn khớp thẻ khi đang lọc; clear → về tổng server. Empty-state nhận biết tagFilter.

**Test browser (admin, localhost, data thật 6 đơn):** options `["Tất cả","Chờ hàng (2)","Thiếu địa chỉ (2)","Giỏ trống (1)","Khách lạ (1)"]` khớp `tagCounts` ✓; chọn `cho_hang` → 2 row đúng (NJ-...0007/0001) + count "2" ✓; clear → 6 row + "6" ✓; `node --check` 4 file ✓; screenshot chip render đúng vị trí/style ✓. Status ✅

### [unit-scan] Put-to-light (đèn LED chỉ ô kệ) — ESP32 + WS2811 + chia hàng 1 lượt

**Files:** `web2/shared/web2-putwall.js` (NEW — client `Web2PutWall`), `web2/putwall/firmware/putwall-esp32.ino` (NEW — firmware FastLED), `web2/unit-scan/{index.html,js/unit-scan.js,css/unit-scan.css}` (nút 💡 + light-on-scan + panel cài đặt; bump css `h→i`, js `g→h`), `docs/web2/PUTWALL-LED-SETUP.md` (NEW — BOM/Shopee/sơ đồ nối/flash/troubleshoot/GitHub).

User: (1) tối ưu **quét 1 lượt** (đống hàng giữa, 8 kệ quây vuông) → bỏ thẳng vào STT; (2) thêm chức năng đèn LED + tài liệu mua/lắp.

- **Put-to-light**: quét tem → `Web2PutWall.light(STT)` → ESP32 sáng đúng ô kệ → đặt thẳng, không đọc số (giải 1 lượt). Bấm 1 SP trong chi tiết kệ → `lightMany` sáng MỌI ô của SP đó (đặt cả sấp).
- **Client** `web2/shared/web2-putwall.js`: cấu hình localStorage (enabled/urls/color/brightness/ms), gửi `GET /stt?n=<STT toàn cục>` fire-and-forget tới mọi controller (self-filter theo dải), `/clear` `/test` `/health`. Panel cài đặt mở từ nút 💡 header.
- **Firmware** ESP32 + FastLED: map STT→LED (STT_BASE + serpentine + COLS), HTTP `/stt /clear /test /health` (CORS \*), auto-off `ms`.
- ⚠ **Mixed content**: trang HTTPS KHÔNG gọi được ESP32 HTTP → khuyên mở qua **HTTP LAN** (`python3 -m http.server`); cầu SSE cho HTTPS để dành (chưa làm). Cảnh báo hiện ngay trong panel khi đang HTTPS.
- **Mua gì**: ESP32 DevKit + LED WS2811 5V đục lỗ (1 bóng/ô) + nguồn 5V + tụ/điện trở — từ khoá Shopee + GitHub refs (FastLED/WLED/...) trong doc.

**Test browser (mock ESP32 log hits, HTTP localhost):** quét unit STT 1 → `/stt?n=1&c=1aff5a&b=160&ms=0` ✓; Test → `/test` ✓; lightMany([1,6]) → `/clear` + 2× `/stt…keep=1` ✓; health → đọc JSON {ok,base,num} (CORS) ✓; panel render đủ field, willBlock=false trên HTTP ✓; `node --check` + ino braces balanced ✓.

**BOM chi tiết (bổ sung):** doc §0 thêm bảng mua đầy đủ — **1 kệ = 90 bóng/~9m/1 ESP32 ≈ 540k**; **full 9 kệ = 810 bóng (mua 18 string 50 = 900)/~81m/3 ESP32 ≈ 3.0–3.5tr** + link tìm kiếm Shopee + tổng giá. WS2811 5V bán theo string 50 bóng (~5m); khoảng cách bóng = bề rộng ô.

### [web2/system] Thêm nút "Mở giao diện Gemini" vào card máy shop (tab Services)

**Files:** `web2/system/js/system-services.js` (`renderGeminiMachines` card template), `web2/system/index.html` (bump `system-services.js?v` → `20260629gemlink`).

Tab `web2/system?tab=services` đã có sẵn section "Máy shop tự host gemini-tryon" (dò registry `/api/web2-vieneu-registry/list?engine=gemini-tryon` → hiện acc sẵn sàng), nhưng URL tunnel chỉ hiện dạng text cắt ngắn, không bấm được. Thêm `<a target="_blank">🔗 Mở giao diện Gemini</a>` vào mỗi card → mở thẳng URL tunnel (root `/` của serve.py trả HTMLResponse = giao diện máy). URL tunnel ngẫu nhiên/đổi mỗi lần chạy lại → lấy động từ registry, không hardcode. Verify registry live: máy `DESKTOP-J35EHJQ (Gemini)` online (`https://...trycloudflare.com`, age 14s). Status ✅

### [live-chat] Fix tab vùng (HÀ NỘI / HƯƠNG CHÂU) trong Kho SP không hoạt động

**Files:** `live-chat/js/pancake/inventory-panel-state.js` (`applyFilter` + comment header).

User báo tab địa danh trong panel Kho SP bấm không lọc gì. Root cause: tab lấy từ Sổ Order = **vùng/khu** (HÀ NỘI, HƯƠNG CHÂU) nhưng `applyFilter` lại so khớp `p.supplier` (= xưởng/NCC: XƯỞNG GÒ VẤP, QUẢNG CHÂU…) → 2 namespace khác nhau, 0 overlap → mọi tab vùng cho 0 SP. Sản phẩm có sẵn field `p.region` = HÀ NỘI/HƯƠNG CHÂU khớp đúng nhãn tab. Fix 1 dòng: đổi field lọc `p.supplier` → `p.region`. Verify live data: ALL=9, HÀ NỘI=7, HƯƠNG CHÂU=2 (7+2=9 partition đúng); trước fix cả 2 tab =0. Status ✅

### [unit-scan] Hiện MÃ TEM theo từng STT (tem nào vào STT nào) + audit logic per-unit

**Files:** `render.com/routes/web2-product-units.js` (`/sort-manifest` thêm `array_agg(unit_code)` → `products[].codes`), `web2/unit-scan/{index.html,js/unit-scan.js,css/unit-scan.css}` + bump css `g→h`, js `f→g`.

User audit: cùng kệ có SP trùng (vd ÁO POLO BASIC ×5 ở STT 1 và STT 6) → nhìn mắt KHÔNG biết tem nào của STT 6. **Đáp:** mã QR per-unit chính là cách phân biệt — mỗi tem 001..009 ràng buộc DUY NHẤT 1 đơn/STT (DB thật: tem-001→STT6 KH Tuyen Thanh; tem-002..005→STT1 KH HK Man; 006..009 IN_STOCK). Bước đối soát/đặt kệ **PHẢI quét từng tem** → màn hiện chính xác STT+ô. KHÔNG đặt bằng mắt với SP trùng.

- **BE** `/sort-manifest`: mỗi `products[]` thêm `codes:[unitCode…]` (mã tem cụ thể của đơn×SP). Thuần additive, backward-compat.
- **FE** sheet chi tiết kệ: tóm tắt SP giờ hiện **#mã tem theo từng STT** (vd "ÁO POLO BASIC ×5 · STT 1 #002,003,004,005 · STT 6 #001"); mỗi hàng STT cũng liệt kê #mã tem của nó. Đọc tay được khi camera lỗi (fallback). `shortCode()` lấy đuôi seq.

### [unit-scan] Bỏ 2 tab → 1 VIEW + chi tiết SP theo từng STT trong kệ

**Files:** `web2/unit-scan/{index.html,js/unit-scan.js,css/unit-scan.css}` (bump css `f→g`, js `e→f`).

User (2 ý): (1) cùng 1 kệ có nhiều SP giống nhau → trong xe có SP-00x phải bỏ ĐÚNG STT → cần thấy SP nào ở STT nào, tô màu/bấm để check kĩ; (2) chia 2 tab (Tra/Đóng gói ⇄ Chia hàng) **dư thừa** vì việc cần là "đem hàng ra kệ + coi chi tiết SP" → **gộp 1 tab**.

- **Bỏ toggle 2 chế độ.** 1 view duy nhất: quét 1 món → card kết quả Ở TRÊN (hero "➡️ Bỏ vào KỆ X" + STT to + "📍 Kệ·Hàng·Cột" + chi tiết SP: in lại, sibling, đơn chờ, lịch sử) + tiến độ 9 kệ (xe) + sơ đồ Ở DƯỚI. Mỗi lần quét đồng thời đánh dấu vào tiến độ kệ (`markSorted`). Xoá `MODE`/`setMode`/`flash`/`onScanSort` + CSS `.mode-tabs`/`.flash` (chết).
- **Sheet chi tiết kệ (giải ý 1):** thêm **tóm tắt SP** — mỗi mã → `×SL · STT a, b, c` (cùng 1 mã ở nhiều STT hiện rõ); **bấm 1 SP → TÔ Ô** mọi STT chứa mã đó (cell `.hot` + row `.hot`) + cuộn tới. Mỗi hàng STT giờ **liệt kê SP của STT đó** (`.m-prods`). Bấm ô sơ đồ → cuộn tới đơn.
- `?mode=sort` cũ (sort-station redirect) vẫn vào được — boot bỏ qua param, load thẳng view gộp. Header tag (nhãn ô) hiện luôn.

**Test browser (data thật 16 unit/Kệ 1):** kp-summary "ÁO BLAZER ×4 · STT 1,2,3,4", "ÁO POLO BASIC ×5 · STT 1,6" ✓; bấm BLAZER → tô cell+row STT 1-4 ✓; quét unit thật → hero "Bỏ vào KỆ 1 / STT 1 / 📍 Kệ 1·Hàng 1·Cột 1" + chi tiết + tiến độ 0/16→1/16 ✓; pageErrors=[] ✓; `node --check` ✓.

### [unit-scan] GỘP sort-station vào "Quét tem" (2 chế độ) + sơ đồ kệ vật lý + nhãn ô

**Files:** `web2/shared/web2-shelf-map.js` (NEW — STT→Kệ·Hàng·Cột), `web2/unit-scan/{index.html,js,css}` (gộp 2 chế độ), `web2/shelf-labels/index.html` (NEW — in nhãn ô), `web2/sort-station/index.html` (→ redirect), XOÁ `web2/sort-station/{js,css}`, `web2/shared/web2-sidebar.js` (gộp menu "Quét tem"), bump sidebar 54 html `d→e`. `web2-product-units.js` +`GET /sort-manifest` +`sortManifest()`.

User: unit-scan & sort-station TRÙNG lõi (quét QR→ra kệ) → **GỘP 1 trang "Quét tem" 2 chế độ** (giữ URL unit-scan): **Tra/Đóng gói** (card 1 món + reprint + sibling + vị trí) & **Chia hàng** (9 KỆ=9 xe + tiến độ + manifest + sơ đồ). Scanner/Web2ProductUnits/ShelfMap dùng chung, dispatch theo `MODE`. sort-station → redirect `unit-scan?mode=sort`; sidebar 1 mục.

- **Sơ đồ kệ** (`Web2ShelfMap`, user chốt layout): 9 kệ × 15 cột × 6 hàng = 810 ô; STT tuần tự Kệ1→9 (90/kệ), hàng-major; tường trái(1-2)/giữa(3-6)/phải(7-8)/lẻ(9). `locate(stt)`→{ke,hang,cot}. **9 xe = 9 kệ**: quét→KỆ (xe nào) bỏ vào; ra kệ đặt theo ô (Hàng·Cột) + nhãn.
- **Nhãn ô** `web2/shelf-labels`: in lưới STT 15×6/kệ (810 ô) dán lên ô. Link từ header (chế độ Chia hàng).
- unit-scan + sort hiện **"📍 Kệ·Hàng·Cột"**.
- **Fix CSS**: `.sheet-back`/`.flash` `display:flex` (author) đè UA `[hidden]` → overlay phủ mờ cả trang; thêm `[hidden]{display:none!important}` (gotcha CLAUDE.md).

**Test browser:** 2 chế độ toggle ✓; Tra quét → card + "📍 Kệ 1·H1·C4" ✓; Chia hàng quét → flash "KỆ 1 · STT·vị trí" + grid + kệ-detail + sơ đồ ✓; shelf-labels 9 kệ/810 ô ✓; redirect ✓; overlay hết ✓. `node --check` + self-check ShelfMap ✓.

### [goods-weight] Tiền ship + Báo cáo theo NGÀY (filter chi tiết, PC)

**Files:** `render.com/routes/web2-goods-weight.js` (`GET /report` + hằng `RATE_KG=25000`/`RATE_BALE=10000`), `web2/goods-weight/{index.html,js/goods-weight.js,css/goods-weight.css}` (tab Báo cáo + ship/lần cân) + bump css `20260629c→d`, js `b→c`.

Công thức: **tiền ship = kg×25.000 + kiện×10.000**. Thêm tab "📊 Báo cáo" (chủ yếu xem PC) — mỗi hàng = 1 ngày.

- **Backend** `GET /api/web2-goods-weight/report?from&to&username` (soft-auth): GROUP BY ngày GMT+7 (`to_timestamp(created_at/1000) AT TIME ZONE 'Asia/Ho_Chi_Minh'`, so chuỗi 'YYYY-MM-DD' → độc lập TZ server), tính ship server-side (nguồn-chân-lý), trả `rows/totals/users/rates`. LIMIT 366 ngày. Pool web2Db.
- **Frontend** tab toggle (Cân hàng ⇄ Báo cáo). Báo cáo: filter Từ/Đến ngày (`<input type=date>` native) + chọn Nhân viên (distinct) + preset Hôm nay/7/30/Tháng này + Xoá lọc; bảng 7 cột (Ngày · Lần cân · kg · kiện · Tiền kg · Tiền kiện · Tổng ship) + summary cards + hàng Tổng cộng. Card lịch sử thêm chip 🚚 ship/lần. SSE `web2:goods-weight` reload cả 2 tab. Bảng rộng tới 1120px, mobile scroll-x + summary 2 cột.

- **12 tháng (filter ưu tiên)**: strip 12 nút tháng gần nhất (cũ→mới) đầu rp-bar; click → set Từ/Đến = đầu↔cuối tháng (tháng hiện tại to=hôm nay). Mở tab Báo cáo **mặc định chọn THÁNG HIỆN TẠI** (không còn load all). Sửa ngày tay / preset / xoá lọc → bỏ chọn tab tháng; lọc NV độc lập. Bump css `d→e`, js `c→d`. Self-check date-math (12 mục, Feb→28, Dec→31, cur→today) ✓.

- **Admin xoá theo NGÀY**: thêm `DELETE /day/:ymd?username=` (ADMIN) — xoá TOÀN BỘ bản ghi của 1 ngày GMT+7 (scope theo NV nếu đang lọc), trả `deleted` count, SSE `delete-day`. Báo cáo: cột "Thao tác" + nút 🗑 mỗi hàng (chỉ admin, `body.rp-admin` ẩn cột với NV); confirm hiện số bản ghi sẽ xoá; xoá xong reload báo cáo + Lịch sử cân. (List Lịch sử cân vẫn có xoá từng bản ghi sẵn.) Bump css `e→f`, js `d→e`.

**Status:** verified live — `/report` 25k/kg·10k/kiện, gộp ngày GMT+7, totals đúng (20kg×5kiện→550k). 12-tháng frontend-only. Admin delete-day chạy web2-api → verify scope theo username sau deploy. `node --check` ✓.

### [sort-station] Trang MỚI "Bàn chia hàng" 📱 (put-wall sortation guided)

**Files:** `render.com/routes/web2-product-units.js` (`GET /sort-manifest`), `web2/shared/web2-product-units.js` (`sortManifest()`), `web2/sort-station/{index.html,js/sort-station.js,css/sort-station.css}` (NEW), `web2/shared/web2-sidebar.js` (menu Bán Hàng "Bàn chia hàng 📱") + bump sidebar 54 html `20260629c→d`.

Tối ưu khâu NV ngồi chia đống hàng theo STT rồi mang ra kệ (user chọn ý tưởng A+B). Màn hình trạm chia: quét QR từng món → **KỆ to + tên KH + beep/rung** + theo dõi **đủ/thiếu từng STT** (grid) + **manifest "mang ra kệ"** (gom theo STT, mang 1 lượt). Hợp luồng B (xe khay đánh số = STT).

- **Backend** `GET /api/web2-product-units/sort-manifest` (soft-auth, PII): units status `ASSIGNED` gom theo đơn → `{orders:[{stt,customerName,needed,products,unitIds}],totalUnits}`, sort theo STT. Pool web2Db.
- **Frontend** mobile-native (khuôn unit-scan): scanner liên tục + camera-retry; quét → tra `unitToOrder` map (tức thì, không cần mạng) hoặc fallback `Web2ProductUnits.resolve`; chống double-scan (`scanned` Set, giữ qua SSE reload); STT card xanh khi đủ; WebAudio beep (done 2 nốt cao / warn trầm) + vibrate. Client units = `Web2ProductUnits.sortManifest()` (1 nguồn). SSE `web2:product-units` → reload.
- Idea source: put-wall / put-to-cart (cluster picking). Đặc tả đầy đủ trong KB.

**Status:** code xong, `node --check` ✓. ⚠ Backend chạy web2-api → verify e2e SAU deploy (seed đơn → quét → STT + tiến độ + manifest).

### [order-tags] Activate + fix co_coc + ship_tinh/ship_tp (trigger dormant)

**Files:** `render.com/services/web2-order-tags-service.js` + `render.com/routes/native-orders.js`.

3 trigger có sẵn nhưng chưa seed (không hiện cột Thẻ) — user chọn activate + fix:

- **co_coc** ("Có đặt cọc"): predicate đọc `o.deposit` — DEAD vì chưa seed active. Fix: o.deposit = native_orders.deposit (mapRow:547 — **GIỎ nhập cọc trước khi chốt VẪN tính**) + MAX với SUM(deposit) PBH khi có PBH (non-destructive, không đè mất cọc GIỎ). Fire khi cọc>0 ở GIỎ HOẶC ĐƠN. (Verify live: GIỎ draft deposit 50k → co_coc fire ✓.)
- **ship_tinh / ship_tp**: predicate chỉ đọc `delivery_method` (trống khi NV chưa pick → im lặng false). Fix: helper `_shipZone(o)` — ưu tiên delivery_method, trống thì **derive zone từ địa chỉ** (port gọn `DeliveryMethodPicker.pickOffline`: keyword quận HCM → 'tp', còn lại có địa chỉ → 'tinh'). Khớp đúng badge "Ship Tỉnh" ở cột địa chỉ.
- Seed activate cả 3 (ON CONFLICT DO NOTHING, idempotent) → hiệu lực khi web2-api redeploy (ensureTable chạy lại lúc restart).

**Test:** assert ship zone (Q1 HCM→tp, Bạc Liêu→tinh, "KẾ BÊN CỐNG LỠ"→tinh, method override, shop→neither) + co_coc(deposit>0) ✓. `node --check` ✓.

### [order-tags] Audit toàn bộ predicate — fix pbh_created + gỡ co_tin_nhan

**File:** `render.com/services/web2-order-tags-service.js`.

Audit 28 predicate (workflow 6-reader + adversarial verify). Trong 12 tag ĐANG ACTIVE (web2_order_tags), tìm thêm 2 tag nhầm (ngoài co_ghi_chu đã fix):

- **pbh_created** (BUG): `o.status==='confirmed' || pbhTotal>0` → nhánh `confirmed` fire cả khi đơn confirm mà CHƯA tạo PBH (/confirm tạo PBH sau) → trùng `is_confirmed`. Fix: chỉ `Number(o.pbhTotal||0)>0`.
- **co_tin_nhan** (BUG): `messageCount>0` nhưng `message_count` chỉ +1 khi merge COMMENT (native-orders.js:926,1068) — không có nguồn tin nhắn riêng → fire trùng y hệt `co_binh_luan`. GỠ HẲN: predicate + trigger + seed + migration `DELETE web2_order_tags WHERE code='co_tin_nhan'` (idempotent). Cột "Tin nhắn" (count pill client) vẫn dùng message_count — KHÔNG đụng.

Phát hiện phụ: `co_coc`, `ship_tinh`, `ship_tp`, `chua_nhan_ck`, `da_nhan_ck` là TRIGGER có sẵn nhưng KHÔNG active (admin chưa bật) → không render ở cột Thẻ. CK status thực tế = badge client `⚠ Chưa nhận CK` / `💸 KH báo đã CK` (native-orders-render.js:240-262), chạy theo `walletBalance`+`ckSignal`, KHÔNG phải autoTag. co*coc DEAD (deposit không enrich), ship*\* silently-false (delivery_method chỉ set tay) — chờ user quyết activate+fix / xoá / để nguyên.

**CK flow verified (live sim, clone 0123456788):** GIỎ draft total 200k, ví 0 → badge "Chưa nhận CK" SHOW → assign web2 tx 200k (PATCH /api/web2/balance-history/:id/link) → ví 200k ≥ total → badge HIDDEN (đã nhận CK). Auto-matcher đúng-đắn TỪ CHỐI test phone (`isObviousTestPhone`).

**Test:** assert predicate (pbh_created PBH-only, co_tin_nhan gone) ✓. `node --check` ✓.

### [order-tags] Fix TAG "Có ghi chú đơn" firing trên MỌI đơn live

**File:** `render.com/services/web2-order-tags-service.js` (predicate `co_ghi_chu` + desc/comment).

User báo tag "Có ghi chú đơn" hiện ở mọi đơn (kể cả giỏ trống). Root cause: predicate đếm cả cột `note` — nhưng `note` của đơn livestream/from-comment là **log comment auto** (`"[time][Page] message"`, vd "Sọc xanh", "Quần đen size 2"), set trên ~mọi đơn live → tag firing khắp bảng. `create-manual` không gửi `note` cấp đơn; ghi chú đơn THẬT của NV nằm ở `user_note` (UI label đúng là "Ghi chú đơn", modal sửa đơn).

- Verify live API `/api/native-orders/load`: 5/5 đơn `coGhiChu=true` chỉ vì `note`=comment, `userNote` rỗng cả 5.
- Fix 1 dòng: `co_ghi_chu: (o) => _hasText(o.userNote)` (bỏ `_hasText(o.note)`).
- Desc trigger (single-source, order-tags page fetch `/triggers`) + comment cập nhật.
- autoTags tính fresh mỗi `/load` → không cần migration/cache. Hiệu lực khi web2-api redeploy.

**Test:** assert predicate (note-comment → false, userNote → true, rỗng → false) ✓. `node --check` ✓.

### [print] Tem QR: QR sát lề trái + biến thể/giá lên đỉnh → chừa khoảng trống ghi bút

**File:** `web2/products/js/web2-products-print-render.js` (QR-branch) + cache-bust 3 HTML (products/so-order/unit-scan `?v=20260629b`).

User muốn 1 khoảng trống trên tem để ghi bút bi tay. Chỉnh QR-branch `buildLabelHTML`:

- **QR sát lề trái**: `outerStyle` override `padding-left:0.2mm`; `qrColStyle` canh `flex-start` (QR flush mép trái — verify `qrLeftVsRow1Left=0px`).
- **Biến thể + giá lên sát lề trên**: `row1` `align-items:flex-start` + `rightCol` `justify-content:flex-start` (verify giá `top:8`).
- ⇒ Khoảng trống bên phải QR, DƯỚI giá = **41px** (cao = QR − chiều cao biến thể/giá) để ghi tay. Dùng chung mọi tem (Kho SP + so-order + reprint).

**Test:** render label mẫu (HCAOSTT41-001, Sọc Trắng To/41, 1.333.500) → đo DOM iframe: rightCol flex-start ✓, blankBelowPrice 41px ✓, QR flush trái ✓. `node --check` ✓.

### [shared] Module CHUNG Web2ProductUnits — client duy nhất /api/web2-product-units/\*

**Files:** `web2/shared/web2-product-units.js` (NEW), adopt: `web2/unit-scan/js/unit-scan.js`, `so-order/js/so-order-barcode.js`, `web2/products/js/web2-products-render.js`, `web2/shared/web2-unit-reprint.js` + 3 HTML (script include + cache-bust). Codemap/system-data regen.

Audit mã SP Web 2.0 (workflow 5-reader + synthesis): **mọi thứ đã dùng hệ mới** (sinh mã `Web2ProductCode`, in `Web2ProductsPrint`, STT server `shelfStt`, reprint `Web2UnitReprint`) — gap DUY NHẤT: **4 file tự fork fetch `/api/web2-product-units/*`** (base+token+ensure/reprint/by-product). Gom về `window.Web2ProductUnits`: `resolve · events · byProduct · ensure · reprint · attachForPrint`. `attachForPrint` gom luôn vòng gắn units giống nhau của so-order + Kho SP (khác mỗi `qrBase`/`perItemQty`). Xoá ~120 dòng fork trùng. KHÔNG cache/SSE (fetch wrapper mỏng).

**Test browser:** unit-scan quét TEST-SIB-001 → resolve+events+byProduct (5 sib) qua client ✓; `attachForPrint(perItemQty=2)` → [001,002] qty2 qrUrl đúng ✓; products page client+Web2UnitReprint modal mở ✓. `node --check` 5 file ✓. Nút in: audit kết luận phần lớn là surface khác nhau (giữ) — không có nút thừa thật.

### [native-orders] Fix expand không hiện mã đơn vị (-001 -002) — o.id string

**File:** `native-orders/js/native-orders-unit-serials.js` (+ cache-bust index.html).

`_loadUnitSerials` lọc `Number.isInteger(o.id)` nhưng `o.id` từ API là **string** (`"262"`) → ids RỖNG → KHÔNG bao giờ fetch `/by-orders` → expand đơn chỉ hiện mã SP, THIẾU "-xxx". Fix: ép `Number(o.id)` (khớp endpoint cũng `.map(Number)`). Verify browser: expand đơn NJ-…0003 (SP TEST-EXP SL3) → hiện **`TEST-EXP -001 -002 -003`** ✓. (Bug này khiến serial đơn vị KHÔNG hiện ở native-orders mọi tab.)

### [units] MINT theo SL kho (SP-001..SP-SL) + gán seq nhỏ nhất / tái dùng freed

**Files:** `render.com/routes/web2-product-units.js` (`ensureUnits`+`ensureUnitsForCodes`+`POST /ensure`, export; reconcile đổi ORDER BY), `render.com/routes/web2-products.js` (`_syncUnits` hook 7 handler: create/patch/adjust-stock/adjust-pending/upsert-pending/confirm-purchase/confirm-purchase-partial), `so-order/js/so-order-barcode.js` (mint→/ensure), `web2/products/js/web2-products-render.js` (`_attachUnitsForPrint`→/ensure self-heal), cache-bust 2 FE.

User chốt: **SP có SL N → tự tạo SP-001..SP-N** lúc TẠO SP (so-order hoặc Kho SP), không chỉ lúc nhận hàng.

- **`ensureUnits(pool, code, target, opts)`**: TOP-UP tổng unit = target (thiếu mint thêm seq tiếp; đủ → no-op; KHÔNG xoá — tem vật lý/đã gán). Serial global, 3 số. Advisory-lock per code. `ensureUnitsForCodes` đọc target = `stock+pending_qty` từ web2_products. `POST /ensure {productCodes}` cho client.
- **Hook web2-products**: mọi handler đổi SL → `_syncUnits` (fire-and-forget) → units có sẵn TRƯỚC khi SP vào giỏ (reconcile cần unit để gán STT). so-order tạo SP đi qua `upsert-pending` → cũng mint. **Bỏ mint per-shipment ở so-order** (dùng `/ensure`, tránh double). Kho SP "In tem" → `/ensure` (self-heal SP cũ/ SL tăng).
- **Gán seq nhỏ nhất trước (user spec)**: reconcile đổi `ORDER BY h.hist ASC, u.seq ASC` → `ORDER BY u.seq ASC`. Unit bị bỏ khỏi giỏ → quay lại pool → lần gán sau TÁI DÙNG seq nhỏ đó TRƯỚC số chưa dùng cao hơn (vd 002 freed → add lấy 002, không nhảy 007). Nhả vẫn highest-seq-first (giữ 001 ổn định).
- Lifecycle: bán/ship → unit vẫn tồn (top-up-only, không shrink); target=stock+pending nên sau khi bán units≥target → no-op (đúng, tem trên hàng đã gửi không mất).

**Test:** `node --check` 3 backend + so-order ✓. ⚠ Backend chạy web2-api (deploy) → verify online sau push (tạo SP SL N → units 001..N; add/remove giỏ → seq nhỏ nhất + tái dùng freed). Tuân thủ KB-SYSTEM-SERVICES: pool web2Db||chatDb, SSE hub web2, không require ngược.

### [native-orders] Đơn GỘP hiện STT kệ MỚI (khớp tem) thay vì "1 + 2"

**Files:** `native-orders/js/native-orders-render.js` (`computeOrderStt` bỏ nhánh `mergedDisplayStt` join → dùng `campaign_stt`; badge thêm title + dấu ⛓), `native-orders/index.html` (cache-bust render `20260629b→c`).

User chốt: STT ở native-orders = SỐ KỆ vật lý dán ngoài → phải khớp tem quét ra. Đơn gộp trước hiện `"1 + 2"` (display_stt 2 đơn gốc) nhưng đơn gộp được cấp `campaign_stt` MỚI → tem/unit-scan quét ra số mới đó → lệch. Nay đơn gộp hiện `campaign_stt` mới (số kệ thật), kèm `<sup>⛓</sup>` + title "Đơn gộp từ STT 1 + 2" để không mất thông tin nguồn. Hoàn tất thống nhất STT 1 nguồn (`campaign_stt`) trên MỌI surface: native-orders (badge), unit-scan/tem, board/TV. (PBH/packing-slip dùng display_stt là SỐ ĐƠN riêng — không phải số kệ — giữ nguyên.)

### [units/campaign] Thống nhất STT kệ về 1 NGUỒN (campaign_stt ?? display_stt)

**Files:** `render.com/lib/web2-shelf-stt.js` (NEW — `shelfStt(row)` + `SHELF_STT_SQL`), `render.com/routes/web2-product-units.js` (require + dùng ở `_openOrdersForProduct` + `reconcileOrderUnits`), `render.com/routes/web2-campaign-products.js` (`/cart-detail` thêm `campaign_stt` vào query + dùng `shelfStt`).

Bug: popup giỏ trên board/TV (live-control, live-tv) hiện `display_stt` (số đơn GLOBAL) còn tem vật lý + unit-scan dùng `campaign_stt` (số kệ 1..N theo chiến dịch) → **cùng 1 đơn, TV in `#7` mà tem `kệ 3`**. Nguyên nhân: quy tắc "STT kệ = campaign_stt ?? display_stt" nằm rải rác, 1 chỗ (cart-detail) drift sang display_stt.

- **1 nguồn duy nhất** `lib/web2-shelf-stt.js` `shelfStt(row)` (nhận snake/camelCase) — mọi nơi đóng dấu/hiển thị STT kệ gọi chung: tem (`reconcileOrderUnits`), unit-scan đơn-chờ (`_openOrdersForProduct`), popup giỏ board/TV (`/cart-detail`). Không drift lại.
- Quy ước: kệ = `campaign_stt` (reset theo chiến dịch → số nhỏ hợp ô kệ vật lý), fallback `display_stt`. **KHÔNG đụng** STT của native-orders/PBH (đó là số đơn riêng, keyed PBH/merge/KPI — khác khái niệm).

**Test:** `node --check` 3 file ✓ + self-check `shelfStt` 7 case (campaign thắng, fallback, camelCase, campaign=0 hợp lệ, null) ✓. ⚠ cart-detail chạy trên web2-api (deploy) → verify online sau push.

### [goods-weight] Fix tràn ngang trên mobile (number input không co)

**Files:** `web2/goods-weight/css/goods-weight.css` (`.gw-field` + `min-width:0`, input/textarea + `width:100%;min-width:0`), `index.html` (cache-bust css `20260629b→c`).

User báo "bug giao diện". Root cause: `.gw-row2 { grid-template-columns: 1fr 1fr }` (= `minmax(auto,1fr)`) tôn trọng min-content của `<input type=number>` (#gwKg/#gwBales) → track không co được dưới ~300px → tràn ngang ~250px trên mobile (scrollWidth 640 vs viewport 390). Desktop không lộ vì card 560px đủ chỗ. Fix kinh điển grid/flex overflow: cho item co (`min-width:0`) + input fill track (`width:100%`).

**Test (Playwright 390px):** trước `overflowPx 250` (gwBales 301px tràn tới x=640); sau `overflowPx 0`, gwBales 163px vừa track, screenshot mobile edge-to-edge OK; desktop 1440 không đổi (flex stretch sẵn).

**Status:** ✅ verified local.

### [unit-scan] Danh sách TẤT CẢ tem của SP (ẩn/bật) + [print] QR TO HƠN

**Files:** `web2/unit-scan/js/unit-scan.js` (+ `sibRow`/`loadSiblings` + state `sibOpen` + toggle), `web2/unit-scan/css/unit-scan.css` (`.sib-*`), `web2/products/js/web2-products-print-render.js` (`qrMm` factors), cache-bust: unit-scan js `20260629a→b`+css `20260628d→20260629a`, print-render `20260628a/b→20260629a` ở products/so-order/unit-scan.

1. **unit-scan — danh sách per-unit → STT** (user spec: SP1 SL8 → `SP1-001..008`; quét 1 tem hiện STT đang ở, + bật danh sách xem MỌI tem ở giỏ/STT nào). renderResult thêm nút toggle "Tất cả tem của SP này (N)" (ẩn mặc định, `sibOpen` giữ trạng thái qua SSE re-resolve) → `loadSiblings(productCode, currentId)` gọi `GET /by-product/:code` (đã trả sẵn `unitCode/status/orderStt/customerName` — KHÔNG đổi backend) → mỗi row: mã + STT badge (ASSIGNED/PACKED/SHIPPED) hoặc chip "kho"/"trả"; highlight tem đang quét ("đang quét"); summary "N đã vào giỏ · M còn kho". Gán/nhả động đã có sẵn (`reconcileOrderUnits`/`freeOrderUnits` từ cart + native-orders).
2. **print QR to hơn** (shared `buildLabelHTML` → áp dụng CẢ products + so-order + reprint): `qrMm` factors `0.46→0.58` (ngang) + `0.55→0.72` (cao). Tem 25×21mm: QR ~11mm → **14.4mm** (paper8 15.1, paper9 15.8, paper10 20.2). fitName/fitText co tên/giá vừa.

**Test (browser, seed thật qua giỏ):** mint 5 unit TEST-SIB → add giỏ → reconcile gán 4 (STT 1) + 1 IN_STOCK → unit-scan quét TEST-SIB-001: list (5), summary "4 đã vào giỏ · 1 còn kho", hero "Đã ở kệ 1", current highlight ✓. QR render: đo qrMm 14.4mm + screenshot label đủ QR to/biến thể/giá/mã/tên không cắt ✓. Cleanup: cart clear (draft xoá, unit free). `node --check` ✓.

**Status:** ✅ verified local. ⚠ Phát hiện (chưa fix): TV live-control popup giỏ hiện `display_stt` còn tem/unit-scan dùng `campaign_stt` → 2 số STT có thể lệch.

### [goods-weight] Trang MỚI "Cân Nặng Hàng" ⚖️ (hàng về kiện → cân + ảnh)

**Files:** `render.com/routes/web2-goods-weight.js` (NEW), `render.com/server.js` (mount + SSE wire), `web2/goods-weight/{index.html,js/goods-weight.js,css/goods-weight.css}` (NEW), `web2/shared/web2-sidebar.js` (menu "Mua hàng"), 55 html cache-bust sidebar `20260629b→c`.

Hàng về (hàng ở kiện) → đưa kiện lên cân → chụp ảnh mặt cân → form ghi: **tên user** (server-resolved từ token) + **ảnh cân** + **ngày giờ phút** (server time, hiện GMT+7) + **số kg** + **số kiện** + **ghi chú**.

- **Backend** `/api/web2-goods-weight` (web2Db, pool `web2Db||chatDb`): `GET /list` (auth soft), `GET /img/:id` (public, bytea immutable), `POST /` (auth soft — username từ `req.web2User`), `DELETE /:id` (**admin**). Ảnh = **BYTEA web2Db** (KHÔNG Bunny — policy aikol-only; mirror `web2-so-order-images.js`). SSE topic **`web2:goods-weight`** qua hub web2.
- **Frontend**: form camera-first (`<input capture=environment>` mở cam sau ĐT) → nén canvas ≤1280px/jpeg0.8 (~4MB→~300KB) → preview; kg/kiện native number; clock GMT+7 live; list card (thumb→lightbox, kg lớn, kiện pill, user, giờ); xoá per-row chỉ admin; SSE realtime đa-máy/đa-tab.
- Kiến trúc verify vs `docs/web2/KB-SYSTEM-SERVICES.md`: pool web2Db✓, SSE hub web2✓, worker tự route `/api/web2*`→web2-api (không đổi worker)✓, bytea-not-Bunny✓, GMT+7✓, ensureTables idempotent✓.

**Test:** self-check local PG schema/query ✓ (bytea round-trip, has_image, order newest-first, delete). Syntax ✓.

**Status:** ✅ Backend deployed + smoke PASS (GET /list no-token→401, POST→401). ✅ Frontend MOBILE-NATIVE (rebuild theo `unit-scan` — user: "trang dùng trên ĐT"): bỏ desktop sidebar shell → `header.hd` riêng + back/refresh, PWA `goods-weight.webmanifest` (standalone portrait #0068ff), auth-guard inline, `viewport-fit=cover`+`maximum-scale=1`, safe-area insets, Inter font, tokens Zalo-blue, input 16px+ (chống iOS zoom), camera `capture=environment`. Cache-bust css/js `20260629b`.

### [clearance] Đổi logic hàng rớt xả → THEO CHIẾN DỊCH (user spec)

**Files:** `render.com/routes/web2-product-units.js` (`CLEARANCE_CTE` mới + viết lại `GET /clearance`).

User định nghĩa lại: rớt xả không còn per-product (đơn cuối >24h) mà **theo chiến dịch livestream** (`live_campaign_id`, nhiều ngày liên tục):

- **da_doi_soat(đơn)** = MỌI PBH của đơn (`fast_sale_orders`, bỏ bill huỷ) đã packed/shipped/delivered (`BOOL_AND`). = đơn đã đối soát.
- **chiến dịch "xong"** = `da_doi_soat > 70%` tổng đơn (chưa huỷ) của chiến dịch (`CLEARANCE_DONE_RATIO=0.7`). [user chọn: 70% là đủ, không cần mọi giỏ settle]
- **SP → chiến dịch GẦN NHẤT** từng chứa SP (`DISTINCT ON pcode, last_at DESC`). [user chọn: most-recent, không phải mọi campaign] Còn live mới đang bán SP → chiến dịch gần nhất chưa xong → **giữ kho chính** (không xả nhầm hàng đang bán).
- **+1 ngày ân hạn**: `anchor = MAX(created_at) đơn của chiến dịch`; eligible khi `anchor < now-1ngày`.
- Bỏ `NO_CAMPAIGN` (đơn inbox/thủ công) khỏi clearance — rớt xả là khái niệm livestream. Giữ override `KEEP`/`CLEARANCE` + aging tier (giờ = ngày-từ-chiến-dịch-xong).

⚠ Badge per-unit `GET /:id` (`noOpenDemand`) GIỮ NGUYÊN (hint advisory, đã ghi "chính xác tính ở /clearance"; nằm trên hot path quét tem → không thêm campaign query). Có thể lệch nhẹ với kho — align sau nếu cần.

**Test:** self-check local PG 7 case ✓ (done 80%+2d→XẢ; not-done 50%→giữ; most-recent not-done→giữ; done nhưng <1d grace→giữ; KEEP→giữ; CLEARANCE→XẢ; no-campaign→giữ).

**+ Admin gate sửa nhầm (user yêu cầu):** admin chuyển SP rớt xả ↔ kho bình thường. Cơ chế `KEEP` (loại vĩnh viễn khỏi rớt xả) + nút "Giữ cả SP"/per-unit đã có sẵn ở `web2/clearance` — chỉ thiếu admin-only. Siết: `POST /:id/clearance` `requireWeb2AuthSoft`→**`requireWeb2Admin`** (chỉ trang clearance gọi, unit-scan chỉ đọc badge → an toàn); frontend `clearance.js` ẩn nút keep cho non-admin (`_isAdmin()` canonical) + guard defense-in-depth trong `keepUnit`/`keepGroup`. Cache-bust `20260629a`.

**Status:** ✅ Logic verified local 7/7 + smoke prod: GET /clearance→200 success (query campaign chạy, no SQL error), no-token POST /:id/clearance→401. Non-admin→403 dựa middleware `requireWeb2Admin` proven (supplier-debt/so-order #1a) + frontend ẩn nút.

### [cart auth hardening] Gate chuỗi auth cart + đóng #2a (from-comment)

**Files:** `render.com/routes/v2/cart.js` (gate 5 write + forward token), `render.com/routes/native-orders.js` (gate /from-comment), `live-chat/js/pancake/inventory-panel-actions.js` (Phase 1 token, cache-bust `g`).

ENFORCE=1 prod nhưng cart `/api/v2/cart/*` + `/from-comment` ungated → ai cũng tạo/sửa đơn live được (lỗ hổng chuỗi auth cart). Fix 2 phase (deploy frontend trước):

- **Phase 1 (frontend)**: `_cartHeaders()` gửi `x-web2-token` (Web2Auth.authHeaders) cho cart WRITE add/remove/clear. Vô hại khi backend chưa gate.
- **Phase 2 (backend)**: gate 5 cart write (`/add /remove /clear` PATCH `/commit`) bằng `requireWeb2AuthSoft`; `_createDraftViaFromComment` (self-call) **forward** `req.headers['x-web2-token']`; gate `/from-comment` (đóng #2a defer trước đó). Read endpoints (counts/history/get) giữ ungated.

Giờ chuỗi: cart frontend gửi token → cart write gated nhận → tạo draft qua from-comment (forward token) → from-comment gated nhận. KH mới (chưa draft) vẫn chạy.

**Status:** ✅ Verified prod (`8ac52493a`). Test live: no-token cart add→**401**; token cart add KH mới (chưa draft → from-comment forward)→**200 success, ASSIGNED=2** (reconcile gán unit); from-comment token→**200**.

### [order-creation + clearance] Fix audit findings #3-#7 + clearance bug (#2a defer)

**Files:** `render.com/routes/native-orders.js` (#5 customer dedup, #6 phone normalize, LOW clamp qty/price), `render.com/routes/web2-product-units.js` (clearance open_recent fix), `live-chat/js/live/{live-native-orders-api,live-comment-list-orders}.js` + `js/pancake/{inventory-panel-render,inventory-panel-actions}.js` (#3,#4,#7,LOW), cache-bust `20260629f`.

- **#3** SP hết hàng (`isOos`) → `draggable="false"` (không kéo tạo đơn oversell). **#4** double-drop: in-flight key `commentId::code` chặn drop trùng khi request đang bay (giữ optimistic UI). **#7** đọc SĐT/địa chỉ SCOPED trong row nút bấm (không `getElementById` global → hết lấy nhầm row KH nhiều comment). **LOW** nút tạo giỏ dùng ref `btn` đã giữ (hết kẹt spinner khi row re-render). **g1b** `createFromComment` gửi `x-web2-token`.
- **#6** cột `native_orders.phone` normalize canonical `^0\d{9}$` qua `normalizePhone` (1 nguồn với customer link) — raw '+84…'/rác → '' . **#5** `upsertCustomerFromOrder` dùng phone normalize (khớp `getOrCreateWeb2OrderCustomer` → hết đôi KH). **LOW** clamp qty/price âm → 0.
- **CLEARANCE bug**: bỏ ràng buộc `created_at > grace` trong `open_recent` (redundant → vô hiệu) → giờ xét MỌI đơn chưa huỷ còn thiếu tem (bất kể tuổi) → SP còn đơn cũ chưa đủ hàng KHÔNG bị xả nhầm.
- **⚠ DEFER #2a** (gate from-comment auth): ENFORCE=1 prod; cart `_createDraftViaFromComment` HTTP self-call from-comment KHÔNG gửi token + cart frontend cũng không → gate sẽ phá luồng cart drag (KH mới → 401). Cần làm chuỗi auth cart trước.

**Status:** ✅ Backend verified live (phone +84→0912345678 · clamp qty/price âm→0 · clearance.success=true). Frontend syntax OK (agent-verified edits). #2a auth gate defer.

### [v2/cart] FIX HIGH: cart drag (luồng livestream chính) KHÔNG auto-gán unit — hook reconcile

**Files:** `render.com/routes/v2/cart.js` (+hook 4 endpoint), `render.com/routes/web2-product-units.js` (+`freeOrderUnits`).

**Audit toàn bộ tạo đơn (4 agent workflow live-chat→native-orders) tìm bug HIGH:** đường CHÍNH build đơn livestream = **kéo SP vào comment → `POST /api/v2/cart/:id/add`** (cart.js), ghi thẳng `native_orders.products` nhưng **KHÔNG gọi reconcileOrderUnits** → auto-gán per-unit CHỈ chạy ở create-manual/PATCH/cancel, **BỎ SÓT cart drag** (luồng dùng nhiều nhất). Field-shape OK (cart dual-write code+productCode, qty+quantity).

**Fix:** hook 4 endpoint cart sau commit (fire-and-forget): `/add`→reconcile (gán), `/remove`→free nếu xoá đơn / reconcile nếu còn, `/clear`→free (nhả hết), PATCH qty→reconcile. Thêm `freeOrderUnits(pool,orderId)` (nhả hết unit ASSIGNED→IN_STOCK+UNASSIGN) cho case xoá đơn (reconcile không thấy đơn đã DELETE).

**Status:** ✅ Done + verified live (CART RECONCILE PASS: add qty2→2 gán, patch qty1→nhả về 1, remove→nhả hết 0).

### [web2/ai-assistant] FIX GỐC: lỗi provider chứa chữ "token" bị nhầm là "Phiên hết hạn" → đăng xuất oan

**Files:** `web2/shared/web2-ai-assistant.js` (`_streamOne` L771 + `_postAi` L803 bỏ regex), `web2/shared/web2-sidebar.js` (inject `20260629b`), 54 `*.html` (cache-bust `web2-sidebar.js?v=20260629b`).

- **Đây mới là bug thật user báo** (browser-test bằng click như user thật phát hiện): bấm "Lấy full dữ liệu mới nhất" → chat trả **HTTP 200** nhưng trong SSE stream có `event: error` từ provider — Groq "Request too large ... **tokens** per minute (TPM): Limit 8000, Requested 8839 ... Need more **tokens**". `_streamOne` cũ test `/unauthor|hết hạn|token/i` → khớp chữ "tokens" → ném `authErr()` (giả 401) → `onAuthExpired` → đăng xuất + redirect login?expired=1. **Phiên KHÔNG hề hết hạn** (token verify 90 ngày, /me 200 liên tục).
- **Fix**: bỏ heuristic text regex ở cả 2 chỗ; phiên hết hạn THẬT = HTTP 401 (đã bắt ở `res.status`/`r.status`), lỗi trong stream/json là lỗi provider → giữ nguyên. Chỉ `code===401` tường minh mới coi là auth. **Lợi kép**: token-limit/quota error giờ **cascade** đúng sang model kế (mạnh→yếu) thay vì đăng xuất → AI vẫn trả lời.
- **Verified browser (click thật)**: native-orders → ✨ → "Đơn chưa nhận CK" → "Lấy full dữ liệu" → **AI trả lời 491 ký tự phân tích 5 đơn**, KHÔNG redirect, KHÔNG "Phiên hết hạn".
- Đi kèm: UX phiên hết hạn (commit trước) + TTL admin 90d/user 14d vẫn giữ cho trường hợp hết hạn THẬT.

**Status:** ✅ Done + verified end-to-end browser.

### [unit-scan] Quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control

**Files:** `render.com/routes/web2-product-units.js` (`/resolve` +metrics), `web2/unit-scan/js/unit-scan.js` (strip), `web2/unit-scan/index.html` (cache-bust `20260629a`).

Quét QR đơn vị → ngoài STT/đơn/lịch sử, hiện thêm strip số liệu LIVE của SP (giống board live-control): **Bán** (GIỎ = Σ SL món trong giỏ KH draft) · **KH mới** (KH chưa SĐT & địa chỉ) · **NCC** (`web2_products.pending_qty`) · **Còn** (=max(0,NCC−Bán), đỏ khi ≤0) · **Tồn** (stock). Backend `/resolve` thêm `metrics` — cùng query native_orders draft như `/api/web2-campaign-products` (1 nguồn số liệu, self-contained, không cần campaign id).

**Status:** ✅ Done + verified live (METRICS PASS: giỏ 5+3 → /resolve sold=8, newCust=5, con=max(0,ncc-sold)).

### [native-orders] Nới PATCH hook reconcile khi đổi tên/SĐT KH (denorm sync triệt để)

**File:** `render.com/routes/native-orders.js` (PATCH `/:code` hook).

Trước: PATCH chỉ fire reconcile khi `products`/`status` đổi → sửa CHỈ tên/SĐT KH không sync denorm unit (hero quét cũ tới lần sửa giỏ kế). Fix triệt để: thêm `body.customerName !== undefined || body.phone !== undefined` vào điều kiện → đổi tên/SĐT cũng fire reconcile → sync denorm STT/customer cho unit đã gán → quét luôn TƯƠI.

**Status:** ✅ Done + verified live (PASS: PATCH chỉ tên KH, không products → reconcile fire → unit sync).

### [web2/auth] TTL phiên theo role: admin 90 ngày, user 14 ngày (giảm "Phiên hết hạn")

**Files:** `render.com/routes/web2-users.js` (TOKEN_TTL_MS → `tokenTtlFor(role)`).

- Trước: cố định 7 ngày → active user vẫn hay bị "Phiên Web 2.0 hết hạn". Web 2.0 auth TÁCH RIÊNG Web 1.0 (`web2_auth` token vs `loginindex_auth` JWT) → hết hạn độc lập, dù còn đăng nhập app chính.
- Giờ: `ADMIN_TOKEN_TTL_MS=90d`, `USER_TOKEN_TTL_MS=14d`; login đọc `user.role` → set `expires_at` + trả `expiresAt` theo role. Chỉ áp cho login MỚI (session cũ giữ 7d tới khi đăng nhập lại).
- **Cần deploy web2-api** để hiệu lực (backend). Frontend không đổi (lưu `expiresAt` từ login).

**Status:** 🔄 Syntax OK; chờ deploy web2-api + verify (admin login → expiresAt ≈ now+90d).

### [web2-product-units] Audit per-unit + fix denorm staleness (reconcile sync STT/customer)

**File:** `render.com/routes/web2-product-units.js` (`reconcileOrderUnits`).

Audit 1 vòng hệ thống mã đơn vị: core flow (create-manual/PATCH/cancel reconcile) VỮNG; split-order tạo đơn mới empty-products (PATCH-driven, OK); merge-to-pbh giữ products (OK); PACKED have-count = N/A (không code set PACKED). **1 finding LOW**: unit lưu denorm order_stt/customer lúc gán → sửa SĐT/tên đơn sau đó → quét hiện hero snapshot cũ (orders list dưới vẫn tươi; STT ổn định vì campaign_stt bất biến, reset-stt chỉ đụng display_stt). **Fix**: reconcile thêm 1 UPDATE sync denorm (order_stt/code/customer) cho unit đã gán khi khác (IS DISTINCT → idempotent) → quét luôn ra dữ liệu tươi.

**Status:** ✅ Done + verified live (DENORM-SYNC PASS: tạo "AUDIT OLD" → PATCH tên+giỏ → unit sync "AUDIT NEW").

### [web2/ai-assistant + login] Fix UX widget AI báo "Phiên Web 2.0 hết hạn" + thông báo rõ ở trang login

**Files:** `web2/shared/web2-ai-assistant.js` (+`onAuthExpired()` helper, 2 chỗ catch 401), `web2/shared/web2-sidebar.js` (inject assistant `20260629a`), 54 file `*.html` (cache-bust `web2-sidebar.js?v=20260629a`), `web2/login/index.html` (notice khi `?expired=1`).

- **Nguyên nhân (đã xác minh)**: widget AI gọi `/api/web2-ai/*` với `WEB2_AUTH_ENFORCE=1` → token chết server-side (hết hạn 7d / bị wipe) nhưng còn client-valid (`expiresAt` tương lai) → page guard KHÔNG redirect → mọi call enforced 401. **Backend/worker/auth ĐÚNG** (token hợp lệ → chat/stream 200, verified bằng login test account). Không phải bug backend, là phiên hết hạn + UX khó hiểu.
- **Fix widget**: 2 chỗ catch 401 (loadDbThenAsk + ask) gộp về `onAuthExpired()` — message rõ "🔐 Phiên đăng nhập Web 2.0 đã hết hạn. Đang chuyển sang trang đăng nhập…" + redirect bằng handler CHUẨN `Web2Auth.handleAuthExpired()` (clear token + login?expired=1, tin cậy hơn `requireAuth` vì không cần round-trip /me). Bỏ message cũ cộc lốc + setTimeout(requireAuth,1500).
- **Fix login**: trang login đọc `?expired=1` → hiện "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục." (trước đây bị bounce về login form trống, không rõ lý do → tưởng bug).
- **Luồng sau fix**: widget 401 (hoặc bất kỳ web2 WRITE) → handleAuthExpired → login?expired=1 (báo rõ) → đăng nhập lại → quay lại trang, widget chạy.

**Status:** ✅ Done + verified browser (corrupt token client-valid → ask → redirect login?expired=1; login hiện notice; valid token → chat/stream 200).

### [native-orders] Badge "⚠ thiếu N tem" khi đơn gán 1 phần (serial < SL)

**Files:** `native-orders/js/native-orders-render.js` (`_renderExpandRow`), `native-orders/index.html` (cache-bust `b`).

Bảng "Sản phẩm trong đơn": khi số serial đã auto-gán < SL (gán được 1 phần do thiếu unit vật lý) → badge đỏ `⚠ thiếu N` cạnh mã đơn vị. Đơn thiếu KHÔNG ra được PBH (signal đóng gói). Chỉ hiện khi `0 < serial < SL` (0 serial = bỏ qua, tránh nhiễu đơn cũ chưa track per-unit). Không in tem quá SL nên serial ≤ SL. **Verified**: mint 2 / SL 3 → /by-orders trả 2 serial → badge "thiếu 1".

**Status:** ✅ Done + verified (backend /by-orders live, data path PASS).

### [supplier-debt + native-orders] Gate admin thanh toán NCC + hiển thị mã đơn vị "-xxx" trong đơn

**Files:** `web2/supplier-debt/js/supplier-debt-actions.js` (#1 gate), `render.com/routes/web2-product-units.js` (+`POST /by-orders`), `native-orders/js/native-orders-unit-serials.js` (MỚI), `native-orders/js/native-orders-render.js` (#2 render), `native-orders/index.html` + `web2/supplier-debt/index.html` (cache-bust).

- **#1 supplier-debt gate client**: `openPayModal` thêm check `Web2Auth.getStored().user.role==='admin'` (y so-order `_isAdmin`) — non-admin → notify "Chỉ admin được thanh toán NCC" + return. Server `/tx` GIỮ soft (KHÔNG đụng — SePay auto-credit chạy ở browser NV non-admin).
- **#2 hiện mã đơn vị "-xxx"**: bảng "Sản phẩm trong đơn" giờ hiện serial đơn vị ĐÃ auto-gán sau mã SP (vd `HNMM4SD39 -001`). Backend `POST /api/web2-product-units/by-orders {orderIds}` → `{byOrder:{[orderId]:{[code]:['001',...]}}}` (status ASSIGNED/PACKED/SHIPPED). Frontend module `native-orders-unit-serials.js`: fetch theo order id, cache `NO._unitSerials`, re-render; wrap `NO.load` (sau mỗi load) + SSE `web2:product-units` (gán/nhả → refresh). Render đọc `NO._unitSerials[o.id][l.productCode]`. **Số serial < SL = đơn còn THIẾU unit** (signal trực quan).

**Status:** 🔄 Frontend áp + syntax OK; deploy web2-api (#2 backend) + browser-test.

### [so-order] Fix 8 audit findings (#1,#3,#4,#5,#6,#7,#8) + cảnh báo mềm #2

**Files:** `render.com/routes/web2-so-order-images.js` (#1a), `so-order/js/{so-order-render,so-order-delete,so-order-modal-submit,so-order-confirm,so-order-toolbar,so-order-inline-edit,so-order-storage}.js`, `so-order/index.html` (cache-bust 7 file → `20260629a`). Điều tra bằng 2 workflow (8 agent song song, mỗi fix 1 agent map exact change + blast-radius).

- **#1 admin gate**: ✅ image-manager (`POST /` upload, `DELETE /ncc`, `DELETE /:id`) đổi `requireWeb2AuthSoft`→`requireWeb2Admin` (client đã gate admin, đóng lỗ direct-API). GET /list,/by-ncc,/img/:id GIỮ soft (non-admin đọc khi tạo đơn). ⚠ **KHÔNG gán admin cho payments `/tx`** — workflow phát hiện sẽ GÃY SePay auto-credit (chạy ở browser NV non-admin → 403 → mất refund NCC); manual payment đã gate ở client so-order. (supplier-debt manual chưa gate client — note riêng.)
- **#3** getNccBatchTotals: adjustment (contractAmount/weightKg) của 1 đơn chỉ tính cho NCC **sở hữu gid** (row đầu), hết cộng đôi khi 1 đơn lẫn 2 NCC. **#4** delete lô mixed: chỉ trừ Kho pending phần CHƯA nhận (`max(0, qty-qtyReceived)`). **#6** counter chỉ đếm dòng có productName (khớp bảng). **#5** body scroll-lock 1 nguồn ở showModal/hideModal (ref-count Set, iOS-safe `position:fixed+top:-scrollY`) + route close paths (data-so-close/ESC) qua hideModal. **#7** inline-edit blur dùng `relatedTarget`/activeElement guard (thôi race setTimeout 150ms mất giá trị picker). **#8** restoreFromTrash trả `{ok,reparented,toTabLabel}` + caller cảnh báo khi tab gốc đã xoá. **#2** soft-warn: dòng SL≤0 → notify warning (KHÔNG chặn submit).

**Status:** ✅ Done + verified. #1a admin gate live (no-token DELETE→401, admin→pass); #5 scroll-lock browser (4× mở/đóng+ESC→body restore, không trôi); #2 soft-warn wired; 0 console error. #3/#4/#6/#7/#8 logic review + syntax OK + export/return-shape verified.

### [native-orders] Hook nhả đơn vị khi HUỶ đơn (POST /:code/cancel)

**Files:** `render.com/routes/native-orders.js` (POST `/:code/cancel`).

Trước: huỷ đơn qua `POST /:code/cancel` KHÔNG nhả unit (chỉ available lại ngầm qua availability-check, nhưng status hiển thị còn 'ASSIGNED' + STT đơn cũ → quét ra STT ma). Fix: sau commit huỷ, gọi `reconcileOrderUnits(pool, id)` cho đơn chính (`r.rows[0].id`) + đơn anh em PBH gộp huỷ lan truyền (`cancelledMemberCodes` → lookup id) → reconcile thấy giỏ rỗng (status cancelled) → nhả unit về IN_STOCK + event UNASSIGN. Fire-and-forget. (PATCH-cancel bị guard 3H4 chặn nên dedicated cancel là path thật.) **Chưa hook DELETE `/:code`** (xóa cứng — khác "huỷ", unit vẫn available qua availability-check; report cho user).

**Status:** ✅ Done + verified live. Test: tạo đơn qty2→gán 2 unit @STT; `POST /:code/cancel`→2 unit nhả về IN_STOCK (PASS). Hết "quét ra STT ma" sau huỷ.

## 2026-06-28

### [web2-product-units + native-orders] Auto-gán đơn vị theo GIỎ (thay nút Gán thủ công)

**Files:** `render.com/routes/web2-product-units.js` (+`reconcileOrderUnits` + `POST /assign-auto` + export), `render.com/routes/native-orders.js` (hook create-manual + PATCH `/:code`).

User: bỏ nút Gán — việc gán phải TỰ ĐỘNG khi kéo/thêm SP vào giỏ; unit 001..0xx tự nhận STT giỏ chứa nó; ưu tiên unit ÍT lịch sử bỏ-giỏ → seq nhỏ; quét ra lịch sử.

- **`reconcileOrderUnits(pool, orderId)`** (backend, idempotent, 1 transaction): đọc giỏ (`native_orders.products`) → mỗi product line, so SL muốn (giỏ) vs đang gán cho đơn. THIẾU → gán thêm unit chọn theo `ORDER BY (đếm event ASSIGN) ASC, seq ASC` (LATERAL count + `FOR UPDATE OF u SKIP LOCKED` chống 2 giỏ giành trùng), loại unit đang gán đơn MỞ khác + unit của chính đơn (`order_id IS DISTINCT FROM`). DƯ/rời giỏ/huỷ → NHẢ (seq cao trước, giữ 001 ổn định) về IN_STOCK. Log event ASSIGN/UNASSIGN (= lịch sử). `_notify('assign-auto')` → SSE `web2:product-units`.
- **Hook**: `create-manual` (sau commit) + `PATCH /:code` (khi `products`/`status` đổi) gọi `reconcileOrderUnits` fire-and-forget (`.catch`, không chặn response). Đơn huỷ (status cancelled) → giỏ rỗng → nhả hết. Unit của đơn huỷ tự available lại (availability check loại đơn cancelled).
- Liên kết Task 3 (unit-scan bỏ nút Gán) — gán giờ chạy ở luồng giỏ này.

**Status:** ✅ Done + verified live (web2-api). Test 5/5 PASS (mã SP tươi, hist=0 tất định): A qty2→gán 001,002 (seq khi hist bằng); rỗng giỏ A→nhả về IN_STOCK; B qty1→chọn **003 (ÍT lịch sử nhất, KHÔNG 001)** = chứng minh ưu tiên ít-lịch-sử; C qty2→001,002; cleanup nhả hết.

### [so-order] Audit fix #1 — import "Đã nhận" tạo row kẹt

**Files:** `so-order/js/so-order-import.js` (STATUS_MAP), `so-order/index.html` (cache-bust `b`).

Import map `danhan`/`received` → `'received'` MÂU THUẪN comment ngay trên ("Chỉ Nhận hàng tạo received"). Import chỉ `upsertPending` (KHÔNG mint unit / KHÔNG cộng tồn thật) → row `received` bị KẸT (không xoá/sửa được + pending ảo Kho). Fix: `danhan`/`received` → `'draft'`. Nhận hàng phải qua flow "Nhận hàng" thật. (Audit findings còn lại: admin gate server-side = đổi auth money endpoint rủi ro khoá NV → report; validation qty 0 = product-decision; còn lại edge → report cho user chọn.)

**Status:** ✅ #1 fixed.

### [web2-products + unit-scan] Per-unit cho nút In tem + bỏ nút Gán thủ công (gán giờ tự động)

**Files:** `web2/products/js/web2-products-render.js` (+`_attachUnitsForPrint`, `_bulkPrint` async), `web2/products/js/web2-products-actions.js` (printBarcode per-unit), `web2/unit-scan/js/unit-scan.js` (bỏ doAssign + nút Gán), HTML cache-bust (products render `ii`/actions `20260628a`, unit-scan `e`).

- **Task 2 — In tem per-unit**: nút "In tem (N)" bulk + per-row printer cũ gọi `Web2ProductsPrint.open` KHÔNG có `units` → in mã SP lặp lại (logic cũ). Thêm `_attachUnitsForPrint` (READ-ONLY fetch `/by-product/:code` → gắn `units`+QR, KHÔNG mint mới ở Kho), clone tránh bẩn cache. SP chưa có unit → fallback hành vi cũ. **Verified live**: KHOTEST → 3 units (001/002/003) gắn vào, qty→3.
- **Task 3 — bỏ nút Gán**: unit-scan xóa `doAssign` + nút "Gán" + wiring (việc gán giờ TỰ ĐỘNG ở luồng giỏ — xem Task 4). Trang quét chỉ HIỂN THỊ STT giỏ đã gán + đơn chờ + lịch sử. **Verified live**: `?u=1`→KHOTEST-001, 0 nút Gán, reprint còn, 0 error.

**Status:** ✅ Task 2 + 3 done + verified. (Task 4 auto-gán theo giỏ — đang làm.)

### [so-order] Audit toàn bộ (4 agent, từng tab/modal) → fix 2 HIGH thật, loại 1 false-positive

**Files:** `so-order/js/so-order-receive.js`, `so-order/js/so-order-toolbar.js`, `so-order/index.html` (cache-bust receive+toolbar `?v=20260628b`).

Audit 27 file/9.3k dòng bằng 4 agent song song (storage-sync / tabs-render / create-modal / action-modal). Tự verify từng finding (không tin agent mù).

- **FIX HIGH #1 — receive→mint bypass** (`so-order-receive.js` confirmReceiveFromModal): path NHẬN HÀNG chính gọi `openBarcodePrintModal` KHÔNG qua `_attachUnitCodes` → tem in TỰ ĐỘNG thiếu QR per-unit (hệ thống QR build session trước CHỈ chạy ở nút phụ "In tem"). Fix: thêm `await SO._attachUnitCodes(printableItems)` + mang `shipmentId/supplier/quantity` vào printableItems → mint idempotent theo (code, shipmentId) khớp path "In tem". **Verified live**: mint KHOTEST-001/002/003 + QR; gọi lần 2 cùng key → cùng serial (không nhân đôi).
- **FIX HIGH #2 — orphan dropdown** (`so-order-toolbar.js`): đóng modal bằng backdrop/✕/ESC set `hidden` trực tiếp, KHÔNG qua `hideModal()` → `_hideFloatPanels()` không chạy → dropdown suggest/variant (portal `<body>`) treo lơ lửng. Fix: gọi `SO._hideFloatPanels?.()` ở cả 2 handler. **Verified live**: panel visible→ESC→ẩn, →close-click→ẩn.
- **FALSE POSITIVE loại bỏ**: "nút Nhận hàng còn active khi partial_received" — ĐÚNG THIẾT KẾ (partial còn nhận tiếp phần dư; "Đã nhận" chỉ khi `received` đủ).
- **Regression check fix sync hôm nay**: A1/A2 (adopt-empty + pushSync, SSE version0) KHÔNG phải regression — pre-existing sync semantics; pushSync sau adopt-empty chỉ đẩy default RỖNG (không mang data thật về). Fix server-authoritative an toàn (E2E đã chứng minh).
- **Còn lại (report, chưa fix — chờ user ưu tiên)**: admin gate client-side (image-manager/payments endpoint dùng requireWeb2AuthSoft); import status "Đã nhận" → row kẹt không xoá/sửa; getBatchTotals đếm cả dòng trống; thiếu body scroll-lock create-modal; validation qty 0/âm (product-decision). Console 0 error.

**Status:** ✅ 2 HIGH fixed + verified.

### [so-order] Fix footgun local-first: server-authoritative (wipe DB → reload ra RỖNG, hết "data đẩy ngược lại")

**Files:** `so-order/js/so-order-storage-sync.js`, `so-order/js/so-order-storage.js`, `so-order/index.html` (cache-bust `?v=20260628b`).

User: wipe DB Web 2.0 nhưng so-order reload vẫn còn data. Root cause: **so-order local-first** — IDB/localStorage là nguồn-sự-thật, Postgres chỉ là mirror; server rỗng → app GIỮ local rồi `pushSync()` đẩy ngược lên (re-populate). Audit toàn bộ pages tìm cùng footgun: **so-order là DUY NHẤT** — supplier-wallet (tx server per-tx, adopt `{wallets:{}}` rỗng; `totalPurchased` derive từ so-order), purchase-refund (chỉ đọc so_order_storage), cham-cong (SWR cache), Web2SmartCache (SWR) đều server-first/derive → tự sạch khi so-order sạch.

- **Fix (user chọn "Server làm chủ")**: chỉ sửa tầng lưu, **app 9.3k dòng KHÔNG đụng**. `Sync.init`: server trả `empty` + đã từng sync (`soOrder_syncedVersion_v1 > 0`, persist per-device) ⇒ server bị WIPE ⇒ adopt default rỗng (set cache+IDB=default, version=0). Phân biệt với "máy mới / data offline chưa đẩy" (syncedVersion=0 → GIỮ local, không mất việc offline). `null` (offline) → giữ local. Persist syncedVersion ở 3 nơi sync OK (init adopt / pullOnce / push success+409). Expose `_internal.defaultState`.
- **Test E2E browser** (wipe-sticks): seed v7 (HÀ NỘI 2 lô/4 dòng) → wipe reset-flow (web2_so_order=0) → reload → `HÀ NỘI:0lo, totalRows:0` ✅ 4 dòng cũ biến mất; 30 console msg / **0 error**.

**Status:** ✅ Done + verified.

### [agent-tooling] Ponytail (lazy senior dev / YAGNI) — cài ALWAYS-ON

**Files:** MỚI `.claude/skills/ponytail{,-review,-audit,-debt,-gain,-help}` (6 skill), `.claude/hooks/ponytail-*` (3 hook + deps + LICENSE/AGENTS/SOURCE_COMMIT), `docs/agent-tooling/PONYTAIL.md`; SỬA `.claude/settings.json` (+SessionStart entry, +SubagentStart, +UserPromptSubmit).

User gửi repo [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT, v4.8.3) → agent tooling (giống stitch). Hỏi chế độ → user chọn **always-on**.

- **Always-on qua 3 hook** wire vào `.claude/settings.json` (path tuyệt đối, manual install không có `${CLAUDE_PLUGIN_ROOT}`): SessionStart→`ponytail-activate.js` (tiêm ruleset YAGNI mỗi session), SubagentStart→`ponytail-subagent.js`, UserPromptSubmit→`ponytail-mode-tracker.js` (toggle `/ponytail lite|full|ultra|off`, mặc định full). Hook đặt ở `.claude/hooks/` (sibling `.claude/skills/`) nên `../skills/ponytail/SKILL.md` resolve thẳng skill invocable → zero-dup.
- **6 skill invocable** `.claude/skills/ponytail*` (review diff / audit repo / debt ledger comment `ponytail:` / gain scoreboard / help).
- **State ngoài repo** (no pollution): flag `~/.claude/.ponytail-active`, config `~/.config/ponytail/`.
- **Verify**: `ponytail-activate.js` emit "PONYTAIL MODE ACTIVE — level: full" + full ladder; flag=full; `/ponytail ultra`→ultra→reset full OK; settings.json valid JSON. Chi tiết: `docs/agent-tooling/PONYTAIL.md`.

### [so-order] "Điền ngẫu nhiên" bơm nhiều data hơn (NCC + LOẠI biến thể + nhiều dòng)

**Files:** `so-order/js/so-order-modal-random.js`.

User: nút "Điền ngẫu nhiên" điền thêm dữ liệu (NCC, theo kiểu biến thể mới Áo/Quần/Đầm/Váy/Giày/Dép).

- `_randomRow` chọn **LOẠI ngẫu nhiên** từ `Web2ProductTypesCache.getAll()` (fallback Áo/Quần/Đầm/Váy/Giày/Dép) → set `row.category` → chip loại tự chọn sẵn (picker pre-select từ category). Tên SP khớp loại qua `productsByType` + `_typeKey`/`_pickProductForType` (normalize không dấu).
- NCC: 4 → **12** tên; colors/sizes phong phú hơn (+ size số 36-39 cho giày dép); số dòng 1-4 → **2-6**.
- Dùng để **tạo lại data sau wipe DB beta** (target reset-flow). Wipe đã chạy: 14 bảng → 0, backup `20260628_213316_e854`.

### [agent-tooling] Tích hợp stitch-skills + agent-reach (CHỈ agent tooling, KHÔNG đụng app)

**Files:** MỚI `.claude/skills/stitch-*` (14 skill vendored + `stitch-skills-meta/{LICENSE,SOURCE_COMMIT.txt}`), `docs/agent-tooling/STITCH-AND-AGENT-REACH.md`. Ngoài repo: `~/.local/bin/{agent-reach,yt-dlp,mcporter}`, `~/.agent-reach/`, `~/.mcporter/mcporter.json`, `~/.claude/skills/agent-reach/`.

User: đọc `web2/system?tab=services` + tích hợp [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) (Apache-2.0) + [Panniantong/agent-reach](https://github.com/Panniantong/agent-reach) (MIT). Cả 2 là **agent skill/CLI** (mở rộng năng lực Claude Code), KHÔNG phải thư viện web → user chọn hướng **"cả hai chỉ cài làm agent tooling"**. **Không** route/trang/DB Web 2.0/1.0 nào thay đổi.

- **stitch-skills (14 skill)** vendored `.claude/skills/stitch-<base>/` (giữ verbatim, prefix `stitch-`; id=tên folder, frontmatter `name:` giữ `stitch::...`) → hiện ngay trong skill list. ⚠️ Đa số cần **Stitch MCP + tài khoản Google** mới chạy thật (chưa setup); nhóm extract/taste/enhance/shadcn dùng được ngay.
- **agent-reach v1.5.0** cài pipx **ngoài workspace** (đúng boundary repo). Core install: **6/13 kênh ✅** — GitHub, YouTube (yt-dlp+JS runtime), RSS, **Exa search (free, no key)**, Web/Jina, Bilibili. V2EX ⚠️403 (cần proxy); 6 kênh còn lại cần cookie/credential user. Verify: doctor live-probe 6/13 + Jina fetch example.com OK + Exa MCP trả tool schema OK.
- **Caveat đã xử lý**: `mcporter config add` ghi rác `n2store/config/` → xoá, chuyển system config `~/.mcporter/`; `npm -g` EACCES (`~/.npm` root-owned) → né bằng `--cache+--prefix ~/.local` không sudo; SSL fail → chạy Install Certificates. PATH `~/.local/bin` đã được pipx thêm vào `~/.zshrc`+`~/.zprofile` (shell zsh mới tự có). Chi tiết: `docs/agent-tooling/STITCH-AND-AGENT-REACH.md`.

### [web2/shared/web2-vn-address + customers + native-orders] Bộ chọn Tỉnh/TP → Phường/Xã (tích hợp vietnamese-provinces-database)

**Files:** MỚI `web2/shared/web2-vn-address.js` (`Web2VnAddress`), `web2/shared/data/vn-units.json` (143KB, dataset 2 cấp), `scripts/gen-vn-address-data.js` (generator); customers `web2/customers/index.html` (Tỉnh/TP+Phường/Xã `<input>`→`<select>`, district giữ free-text) + `js/customers-detail.js` (mount/destroy) + load script; native-orders `js/native-orders-modal-edit.js` (2 select editCity/editWard + persist cityName/wardName/cityCode/wardCode qua PATCH có sẵn + detect giao hàng trên địa chỉ ĐẦY ĐỦ) + `index.html` load script; registry `web2/system/data/web2-third-parties.json` (+1 entry, summary 70→71) + regen docs.

User: đọc `web2/system?tab=services` + tích hợp [thanglequoc/vietnamese-provinces-database](https://github.com/thanglequoc/vietnamese-provinces-database) (MIT). Scope (user chọn): customers + native-orders; district = giữ free-text tuỳ chọn.

- **Dataset 2 cấp** (nghị định 30/2026/QH16, hiệu lực 30/04/2026 — VN bỏ cấp Quận/Huyện 01/07/2025): **34 tỉnh → 3321 phường/xã**. Bundle tĩnh `web2/shared/data/vn-units.json` (lazy-load + HTTP cache, KHÔNG backend route — đúng convention "fetch trực tiếp browser / no unnecessary backend"). Regen khi có nghị định mới: `node scripts/gen-vn-address-data.js`.
- **`Web2VnAddress`** (shared 1 nguồn): `load/getProvinces/getWards/findProvince/findWard/normName/mount`. `mount({provinceEl,wardEl,province,ward,onChange})` → dropdown phụ thuộc + preselect theo tên/code + **GIỮ giá trị legacy không khớp dataset** (option "(cũ)", không mất data) + `getValue()` trả {provinceCode,provinceName,wardCode,wardName}.
- **native-orders**: cột `city_*/ward_*` + PATCH allow-list + `mapRowToOrder` ĐÃ CÓ sẵn → chỉ wiring FE; địa chỉ tách "số nhà/đường" + Tỉnh + Phường, detect giao hàng dùng địa chỉ ghép đủ.
- **Verify**: 30/30 jsdom unit-test (module thật + dataset thật: match/dependent/legacy/getValue) PASS; real-DOM smoke 2 trang PASS (customers cityOptions=35→ward 169 sau chọn HCM; native-orders editCity/editWard preselect đúng code 79/27460). so-order KHÔNG có ô địa chỉ → không tích hợp (báo user).
- **Fix sau review (adversarial workflow, 5 finding HIGH/MED/LOW)**: bug data-loss **cửa sổ đang-tải**: lúc dataset chưa load, `<select>` hiện placeholder '' nhưng `getValue()` trả {''} truthy → save sẽ ghi đè rỗng lên city/ward thật (backend PATCH chỉ bỏ qua `undefined`, KHÔNG bỏ ''/null). Fix: thêm `Web2VnAddress.isReady()` + gate ghi city/ward ở `saveEdit` (native-orders) & `collectForm` (customers) — chưa ready/module thiếu → giữ giá trị cũ; eager `load()` lúc init; hardened `SCRIPT_SRC` (querySelector fallback). Verify lại jsdom probe: during-load isReady=false + getValue rỗng (đã gate).

### [web2-product-units/web2/clearance] Kho hàng RỚT XẢ + In lại tem (per-unit) — derived/lazy 0 cron

**Files:** BE `render.com/routes/web2-product-units.js` (+ cột `clearance_state`, `GET /clearance` derived, `POST /:id/clearance` override, resolve trả `clearance`); FE trang MỚI `web2/clearance/{index.html,css/clearance.css,js/clearance.js}` + sidebar `web2/shared/web2-sidebar.js` (mục "Kho rớt xả" group Mua hàng); In lại tem: `web2/shared/web2-unit-reprint.js` (MỚI) + Kho SP `web2/products/index.html`+`web2-products-app.js` (nút "In lại tem"); trang quét `web2/unit-scan/js/unit-scan.js` (badge "Rớt xả" + nút "In lại tem này") + `index.html` (load 5 file print) + `css`.

User "Làm luôn kho rớt xả": hàng dư sau chiến dịch (còn tồn, hết đơn cần) = rớt xả.

- **Kho rớt xả derived (KHÔNG cron)** — lazy như Redis/CockroachDB TTL: `GET /clearance` tính lúc đọc (unit IN_STOCK + SP đã bán + không đơn mở cần + qua 1 ngày). Aging tier `<30 Rớt xả · 30-90 Xả mạnh · >90 Thanh lý` (chuẩn dead-stock/slow-moving) + dashboard giá-trị-kẹt. Override reversible cột `clearance_state` (KEEP/CLEARANCE/AUTO) → "đưa về kho chính" tức thì. Né "1 SP nhiều chiến dịch" + né hàng chưa bán.
- **Trang `web2/clearance/`**: summary 5 card + filter tier + group SP + nút "Giữ kho chính"/"Giữ cả SP"; SSE `web2:product-units` auto-refresh.
- **In lại tem**: 1 tem (trang quét) + nhiều tem chọn (Kho SP `Web2UnitReprint`) — mã+QR giữ id, `print_count++`.
- Verify: node --check OK; ⏳ E2E sau deploy.

### [web2-product-units/so-order/web2/unit-scan] Per-unit product code + QR tracking (mã đơn vị riêng/món + quét định tuyến kệ STT)

**Files:** BE `render.com/routes/web2-product-units.js` (MỚI) + `server.js` (require + mount `/api/web2-product-units` + initializeNotifiers); FE in tem `web2/products/js/web2-products-print-modal.js` (item.units → per-unit label + qrText; preserve units), `web2-products-print-render.js` (QR lookup theo qrText); so-order `so-order/js/so-order-barcode.js` (`_attachUnitCodes` mint + qrUrl + reprint); trang quét MỚI `web2/unit-scan/{index.html, css/unit-scan.css, js/unit-scan.js, unit-scan.webmanifest}`; doc `docs/web2/PER-UNIT-QR-PLAN.md` (MỚI).

User "Làm full": mỗi MÓN VẬT LÝ của SP có mã đơn vị riêng (`KHOAODEN-017`) + QR riêng → in tem dán lên món → quét ngoài (điện thoại) biết SP của NCC/đợt nào, đã in mấy lần, đơn nào → **bỏ vào kệ STT** (put wall). Đủ hàng → đóng gói.

- **Backend** (web2Db, SSE `web2:product-units`): bảng `web2_product_units` + `web2_product_unit_events`. Routes: `/mint` (idempotent theo product_code+shipment_id, **serial server cấp atomic advisory-lock** — vá đua-race của Web2ProductCode), `/resolve?u=<id>` (unit + SP + đơn mở chứa product_code theo `campaign_stt` FIFO), `/by-product/:code`, `/:id/events`, `/reprint`, `/assign` (unit→đơn→STT + fulfillment), `/:id/status`.
- **Tem**: serial GLOBAL theo SP (đợt12→001-010, đợt15→011-018, không trùng giữa đợt; multi-NCC truy đúng nguồn). QR = URL `<origin>/web2/unit-scan/?u=<id>` (camera điện thoại mở thẳng trang). Print backward-compat: không `units` → hành vi cũ.
- **Trang quét** `web2/unit-scan/` (phone-native, khuôn comments-mobile: theme #0068ff, safe-area, PWA manifest riêng, auth-guard): `Web2BarcodeScanner` camera; deep-link `?u=`; hiện NCC/đợt/print_count + **"BỎ VÀO KỆ STT"** + list đơn chờ (FIFO suggest) → tap Gán; lịch sử event; SSE refresh.
- **Quyết định** (user): STT = `native_orders.campaign_stt`; gán đơn↔khách↔STT từ lúc tạo giỏ; gán unit↔đơn lúc quét. Đặc tả đầy đủ: `docs/web2/PER-UNIT-QR-PLAN.md`.
- **Verify**: node --check toàn bộ file mới/sửa OK. ⏳ E2E sau deploy (route chạy web2-api Render — cần push để redeploy; trước deploy mint 404 → in fallback mã SP cũ, không regression).

### [so-order/web2-so-order-images] Quản lý ảnh NCC theo đợt (BYTEA web2Db) + admin-only

**Files:** BE `render.com/routes/web2-so-order-images.js` (MỚI) + `server.js` mount; FE `so-order/js/so-order-image-manager.js` (MỚI), `so-order-state.js` (`_isAdmin`), `so-order-render.js` (nút Quản lý ảnh + admin gate), `so-order-modal-image.js` (nút "chọn ảnh từ kho NCC" + gallery wire), `so-order-modal-core.js`/`so-order-modal-open.js` (auto ảnh hóa đơn khi nhập NCC), `so-order-payments.js`/`so-order-settings.js` (admin guard), `so-order-app.js` (wire), `so-order/index.html` (nút + modal + script + bump -ab), `so-order/css/so-order.css`.

User: (1) Cài đặt tab bật "Quản lý ảnh" → nút mở modal; (2) modal nhập ảnh, **TÁCH 2 khu vực dán: ảnh hóa đơn + ảnh SP** (không bắt buộc hóa đơn dán trước); ảnh hóa đơn auto đổ vào NCC khi tạo đơn, ảnh SP hiện gallery cho chọn (nhiều lần); (3) **CHỈ admin** thấy/dùng thanh toán + cài đặt tab + quản lý ảnh.

- **Backend** (Render web2Db, KHÔNG Neon): bảng `web2_so_order_images` (BYTEA) keyed (tab_id, batch, ncc, kind invoice|product). Routes `/api/web2-so-order-images`: GET /list, GET /by-ncc, GET /img/:id (public immutable), POST / (invoice=replace), DELETE /:id, DELETE /ncc. SSE `web2:so-order-images`. Lưu BYTEA tránh phình doc so-order (108+ NCC × nhiều ảnh).
- **Quản lý ảnh modal**: đợt tabs (+Đợt mới) · tìm NCC · card mỗi NCC = **2 khu vực tách bạch** (HÓA ĐƠN viền vàng/1 ảnh · SP viền xanh/nhiều ảnh), dán Ctrl+V/kéo thả (Web2Effects nén) → upload ngay; xoá ảnh/NCC; realtime SSE.
- **Create-order**: nhập NCC + tab.imageManager → auto ảnh hóa đơn (chọn 1 lần, chỉ khi trống) + nút "chọn ảnh từ kho NCC" trên ô ảnh SP → gallery NCC (chọn nhiều lần). NV thường vẫn tạo đơn + dùng kho ảnh admin set.
- **Admin-only** (`SO._isAdmin` đọc web2 role): ẩn + guard nút Thanh toán CK, Cài đặt tab, +Thêm tab, Quản lý ảnh.
- **Verify**: BE upload/list/by-ncc/delete OK (curl + browser, đã cleanup test); manager 2 khu vực rõ; admin gate (admin thấy hết, non-admin ẩn + open no-op).

### [so-order] Cài đặt tab: chế độ thanh toán (đợt | theo từng NCC)

**Files:** `so-order/js/so-order-storage.js` (paymentMode + imageManager per-tab: \_migrateTab backfill, addTab, updateTab), `so-order-settings.js` (populate + submit), `so-order-render.js` (`getNccBatchTotals`), `so-order-payments.js` (openPaymentModal branch supplier mode + `_nccSummaryCards`), `web2/shared/web2-supplier-pay.js` (`onNccChange` + `setAmount`/`setHistory`), `so-order/index.html` (controls Cài đặt tab + bump z/b), `so-order/css/so-order.css` (`.so-field-check`).

User: thêm vào Cài đặt tab chế độ "thanh toán đợt" hoặc "thanh toán theo từng NCC".

- Tab setting `paymentMode` ('batch'|'supplier') + `imageManager` (bool, F2). Select + checkbox trong modal Cài đặt tab.
- **batch** (mặc định): modal Thanh toán CK = summary đợt (HĐ+CP) + Chi phí đợt (như cũ).
- **supplier**: `getNccBatchTotals(supplier)` = HĐ của NCC đó (Σ contractAmount đơn của NCC); **CP đợt-level KHÔNG tính per-NCC** (chỉ trả ở chế độ đợt). Đổi NCC trong picker → `onNccChange` recompute summary + số tiền + lịch sử NCC. KHÔNG có section Chi phí.
- Verify: settings có select batch/supplier + checkbox; supplier-mode summary "Phải trả (HĐ)=3.5M" cho NCC A, switch sang NCC B → 1.75M, amount theo remaining.

### [shared/so-order/supplier-debt/supplier-wallet] Modal Thanh toán NCC dùng CHUNG (Web2SupplierPay)

**Files:** `web2/shared/web2-supplier-pay.js` (MỚI, component + style tự inject), `so-order/js/so-order-payments.js` (openPaymentModal → Web2SupplierPay + Chi phí qua extraHtml/onMount; gỡ modal-specific cũ) + `so-order/index.html` (gỡ #soPaymentModal, load shared, bump payments `?v=y`), `web2/supplier-debt/js/supplier-debt-actions.js` (openPayModal → shared, gỡ confirmPay) + `supplier-debt-app.js` (gỡ binding) + `index.html` (gỡ #sdPayModal, load shared, bump), `web2/supplier-wallet/js/supplier-wallet-actions.js` (gỡ openPayModal/confirmPay) + `supplier-wallet-app.js` (gỡ binding swPayBtn/swPayConfirmBtn) + `index.html` (gỡ nút "Ghi thanh toán" + #swPayModal).

User: (1) NCC trong modal thanh toán = tab ngang có mũi tên + tìm kiếm + sắp xếp A→Z; (2) supplier-debt thanh toán dùng CHUNG như so-order; (3) bỏ thanh toán ở Ví NCC. → Tách **1 module chung NCC** (CLAUDE.md: ≥2 nơi → shared).

- **Web2SupplierPay.open(cfg)**: summary cards · NCC picker (mode `picker` = tab-strip horizontal scroll + ô tìm kiếm normalize tiếng Việt + mũi tên ‹›, sort A→Z; mode `fixed` = NCC cố định) · ngày/số tiền (Web2NumberInput)/ghi chú · slot `extraHtml`+`onMount` (so-order nhét Chi phí đợt) · lịch sử · onSubmit (money op await+loading+rollback). API phụ: `setSummary` (CP đổi → CÒN LẠI live), `getSelectedSupplier`, `isOpen`, `close`.
- **so-order**: picker nhiều NCC của đợt + Chi phí đợt (gắn lô đầu) + lịch sử đợt; onSubmit → recordSoPayment (ref đợt).
- **supplier-debt**: NCC cố định (1 hàng) + summary Tổng mua/Đã thanh toán/Còn nợ + lịch sử NCC; onSubmit → SD.recordPayment.
- **supplier-wallet**: bỏ nút "Ghi thanh toán" + modal + openPayModal/confirmPay (chỉ còn xem ví + Trả hàng; payment do nơi khác ghi vẫn hiện trong lịch sử).
- **Verify** browser 3 trang: so-order picker A→Z (QUẢNG CHÂU/XƯỞNG MAY B/XƯỞNG SỈ A) + search "quang"→1 pill + chọn đổi payload NCC + Chi phí 700→CÒN LẠI live + submit payload đúng; supplier-debt fixed NCC + nhãn nợ + default=ending + submit gọi recordPayment; supplier-wallet 0 nút pay, 0 console error.

### [so-order] Modal Thanh toán CK: thêm Chi phí đợt inline + rộng modal

**Files:** `so-order/js/so-order-payments.js` (đợt-level expense editor: `_payExpRows/_renderPayExpenses/_payExpRowHtml/_afterPayExpenseChange` + wire add/edit/delete trong wirePaymentPanel), `so-order/index.html` (markup `#soPayExpensesWrap` + panel `so-pay-panel` thay `so-modal-panel-narrow` + bump `payments?v=x`, `css?v=x`), `so-order/css/so-order.css` (`.so-pay-panel` rộng 680px).

User yêu cầu: (1) trong modal Thanh toán CK thêm phần "Chi phí đợt" + ghi chú, bấm **+** thêm 1 hàng chi phí; (2) modal rộng ra.

- CP gắn per-shipment (`sh.expenses`) — modal đợt gộp expenses MỌI lô của đợt (mỗi dòng giữ `data-exp-ship` riêng để sửa/xoá đúng lô); dòng MỚI gắn lô ĐẦU của đợt. Cùng storage API + nguồn dữ liệu với modal Sửa lô (1 nguồn). Add/edit/delete → cập nhật Tổng CP + CÒN LẠI (summary) + stat cards nền + pushSync realtime.
- Panel `so-pay-panel` = `min(680px,94vw)` (rộng hơn narrow 420px).
- **Verify** (fake state, writes stubbed): mở modal width 653px, có section Chi phí; +2 dòng (Ship 300 + Thuế 100 CNY) → Tổng CP 400, payable 6.65M, CÒN LẠI 6.65M live; xoá 1 → CP 300, CÒN LẠI 6.3M.

### [so-order] Money feature S2→S5 (Tab Đợt · Stat cards · Chi phí · Thanh toán CK) + 2 tweak UI

**Files:** `so-order/js/so-order-storage.js` (per-device batch view-state + `batchKeyOf`), `so-order-render.js` (batchGroups/renderBatchStrip + lọc bảng/footer theo đợt + getBatchTotals + renderStatCards + chip CP header), `so-order-shipment.js` (expense UI inline + wireExpensesEditor), `so-order-modal-core.js` (toggle `#soExpensesWrap`), `so-order-payments.js` (MỚI — ledger NCC POST/load + modal Thanh toán CK + SSE), `so-order-app.js` (wire expenses/payment + deeplink reset batch), `so-order-state.js` (BỎ cột costNote), `so-order-modal-submit.js`/`so-order-modal-open.js` (guard costNote đã bỏ), `so-order/index.html` (markup dải Đợt + stat strip TRÊN bảng + modal Thanh toán + bỏ ô Ghi chú CP + bump `?v=20260628w`), `so-order/css/so-order.css`.

Hoàn tất 4/4 phần money-plan (DESIGN LOCKED 27/06) — chi tiết stage [docs/web2/SO-ORDER-MONEY-PLAN.md](web2/SO-ORDER-MONEY-PLAN.md):

- **S2 Tab Đợt cấp 2**: dải `#soBatchStrip` dưới tab địa danh, đợt = nhóm shipment theo `batch` (mới nhất đầu, "Tất cả" cuối, ẩn khi <2 đợt). `activeBatch` per-device per-tab (localStorage `soOrder_activeBatch_v1`). Chọn đợt → lọc bảng + stat + thanh toán.
- **S3 Stat cards**: 5 card KG/HĐ/CP/TT/CÒN LẠI theo đợt (thay footer cũ). HĐ/CP currency tab + ≈VND; CÒN LẠI=(HĐ+CP)−TT quy VND, đỏ nếu >0.
- **S4 CP UI**: "Chi phí đợt" inline trong modal Sửa lô ({label,amount,note}, add/edit/delete lưu ngay) + chip CP header lô.
- **S5 Thanh toán CK**: modal theo đợt → POST `web2_supplier_ledger` (type=payment, ref đợt+NCC, idempotent, money-op await) → Ví/Công nợ NCC trừ realtime; `loadPayments` đọc /state→TT; SSE `web2:supplier-wallet`.
- **Tweak 1 (user)**: chuyển stat cards LÊN TRÊN bảng (dưới dải Đợt) — thấy ngay không phải cuộn.
- **Tweak 2 (user)**: BỎ cột "Ghi Chú CP" (costNote per-SP) + ô nhập trong modal — thay bằng feature Chi phí đợt (có note riêng). Data costNote cũ giữ nguyên (không render, không xoá).

**Verify:** browser-test (web2 login từ secret) — S2/S3 data thật (3 lô HÀ NỘI Đợt 9/8/3, filter+stat khớp); S4/S5 fake state (writes stubbed, ZERO prod): expense CRUD→CP/chip/stat live, payment modal populate/validate/submit→payload `{ncc,amt,batch,ship,tab}` đúng + TT/CÒN LẠI update. Sửa lô data thật mở 0 console error sau khi bỏ costNote.

### [so-order] Bỏ 3 nút toolbar: Nhập / Tải mẫu / Tạo data ngẫu nhiên

**Files:** `so-order/index.html` (gỡ markup 3 nút + bump toolbar `?v=20260628v`), `so-order/js/so-order-toolbar.js` (gỡ 3 handler).

User yêu cầu bỏ 3 nút `#soImportBtn` / `#soSampleBtn` / `#soGenRandomBtn`. Giữ "Điền ngẫu nhiên" TRONG modal (`#soModalFillRandomBtn` = SO.fillModalRandom). Module import/random vẫn load (harmless, fillModalRandom còn dùng). Verify: 3 nút biến mất, toolbar còn Cài đặt tab/Thùng rác/Tạo Đơn Hàng, 0 console error.

### [so-order] Feature tiền/chi phí/thanh toán — DESIGN LOCKED + Stage 1 (data layer)

**Files:** `docs/web2/SO-ORDER-MONEY-PLAN.md` (MỚI, tracker), `so-order/js/so-order-storage.js` (+expense APIs), `so-order/index.html` (bump storage `?v=20260628v`).

User yêu cầu (4 phần): (1) nhập Chi phí + bố cục với Ghi chú CP, (2) tab Đợt (Tất cả cuối, mới nhất đầu), (3) stat cards TỔNG KG/HĐ/CP/TT/CÒN LẠI, (4) THANH TOÁN CK theo đợt — liên quan module NCC. Đã research (workflow 2 agent) + chốt 4 quyết định (xem PLAN doc):

- **Đợt = tab cấp 2** dưới địa danh (giữ tiền tệ); **CÒN LẠI = (HĐ+CP)−TT**; **THANH TOÁN CK → ghi `web2_supplier_ledger`** (type=payment + ref đợt, mỗi TT gắn 1 NCC); **Chi phí = danh sách dòng**.
- **Stage 1 (xong)**: thêm `sh.expenses[{id,label,amount,note,createdAt}]` + storage APIs `addExpense/updateExpense/deleteExpense/getShipmentExpenseTotal` (additive, lazy default — chưa có consumer UI).
- **Còn lại (S2-S6)**: tab Đợt cấp 2 · stat cards · CP UI trong Sửa lô · THANH TOÁN CK modal→ledger · verify. Chi tiết + file:line nguồn trong [docs/web2/SO-ORDER-MONEY-PLAN.md](web2/SO-ORDER-MONEY-PLAN.md).

### [so-order] FIX bug CRITICAL cold-start delete + HIGH dòng "nhận 1 phần" sửa/xóa được

**Files:** `so-order/js/so-order-delete.js`, `so-order-modal-open.js`, `so-order-shipment.js`, `so-order-render-cells.js`, `so-order-render.js`, `so-order/index.html` (bump `?v=20260628u`).

- **CRITICAL cold-start**: nhánh cache-lạnh trong `deleteRow`/`deleteShipment` gọi `_buildRowDeleteConfirm(...)`/`_buildShipmentDeleteConfirm(...)` TRẦN (hàm gán trên `SO.`, không phải local) → `ReferenceError` khi xóa lúc cache Kho chưa sẵn sàng. Fix: thêm `SO.` (4 chỗ). Fast-path đã đúng nên bug bị che khi cache nóng.
- **HIGH partial_received sửa/xóa được**: trước chỉ chặn `'received'`. Dòng "nhận 1 phần" đã có tồn Kho + nợ NCC cho phần đã nhận → sửa qty/xóa làm lệch tồn/nợ. Fix khoá `partial_received` ở: `deleteRow` guard, `openOrderModal` single-edit guard, `openShipmentModal` editableRows (Sửa lô loại nó), `_isRowLocked` (inline dblclick), bulk-edit `edit` + `lockedClass` + `actionsCell`.
- Verify LIVE: tạo đơn → nhận 1 phần 1 dòng → dòng đó `is-locked` + `_isRowLocked()=true` + Sửa lô chỉ load 2 dòng draft (loại dòng partial). Page 0 console error.

### [so-order] FIX: dialog "Xoá vĩnh viễn?" (purge thùng rác) trống phần cảnh báo

**Files:** `so-order/js/so-order-delete.js`, `so-order/index.html` (bump delete.js `?v=20260628u`).

`handleTrashPurge` truyền `body:` nhưng `soConfirmOpen` đọc `message` (so-order-confirm.js:101) → dialog xoá-vĩnh-viễn chỉ hiện title + nút, KHÔNG hiện cảnh báo "không thể khôi phục". Fix: `body:` → `message:`. Verify LIVE: dialog giờ hiện "Lô này sẽ bị xoá hoàn toàn, không thể khôi phục."; purge xoá entry OK.

### [so-order] FIX: tab địa danh (activeTabId) thành PER-DEVICE (máy khác không nhảy tab)

**Files:** `so-order/js/so-order-storage.js`, `so-order/js/so-order-render.js`, `so-order/js/so-order-app.js`, `so-order/index.html` (bump `?v=20260628u`).

User báo: chuyển tab địa danh ở máy A → so-order máy B cũng nhảy tab. Root cause: `activeTabId` (tab đang xem) nằm TRONG state đồng bộ `web2_so_order` → tab-switch `pushSync()` đẩy cả activeTabId lên server → SSE `web2:so-order` → máy B pull về render theo tab máy A.

- Fix: tách `activeTabId` thành **per-device localStorage** key `soOrder_activeTabId_v1` (giống `editTableMode`). Helper `_getLocalActiveTab/_setLocalActiveTab/_applyLocalActiveTab` trong storage.js; áp lại trong `_read()` + `loadCached()` (đè activeTabId đến từ server/IDB bằng tab local). `setActiveTab/addTab/deleteTab` ghi key per-device.
- Tab-click (render.js): đổi sang `setActiveTab()` (ghi local) + **BỎ `pushSync()`** → không bump doc chung, không notify máy khác. Deep-link `?tab=` cũng ghi key per-device.
- Verify LIVE (Playwright): click tab → lsKey set + **0 /save call**; mô phỏng remote pull activeTabId khác → `applyLocalActiveTab` giữ tab local. Đã cập nhật sổ tay SSE (web2:so-order dontBreak).

### [web2/system + so-order SSE] Sổ tay SSE trong tab + fix 4 gap subscribe web2:so-order

**Files:** `web2/system/data/web2-sse-registry.json` (MỚI), `web2/system/js/system-sse-registry.js` (MỚI), `web2/system/{index.html, js/system-sse.js, css/system.css}`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `live-chat/js/pancake/inventory-panel-actions.js`, `web2/dashboard/index.html`.

User: sau audit/debug SSE → ghi thứ quan trọng vào `web2/system?tab=sse` để sau này khỏi sửa nhầm/hỏng SSE.

- **Sổ tay SSE** (registry tĩnh) render trong tab SSE: topic → publisher (file:line emit sau commit) → subscriber (trang live-update) → gap → luật "đừng sửa hỏng". Nguồn curated `data/web2-sse-registry.json` (8 topic + 10 luật chung). Render `system-sse-registry.js` → `#ssRegistry`, gọi trong `SystemSSE.start()`. CSS `.ssr-*` trong system.css. Verify Playwright: 8 card + 10 rule + 2 gap pill, body publisher/subscriber/đừng-sửa-hỏng OK.
- **Fix 4 GAP** (audit luồng so-order): các trang đọc data Sổ Order nhưng chưa subscribe `web2:so-order` → thêm subscribe + debounce reload: **supplier-debt** (công nợ NCC derive từ rows so-order), **purchase-refund** (picker Section A gom theo lô), **live-chat inventory-panel** (tab NCC từ so-order), **dashboard** (KPI Sổ Order, trước chỉ poll 60s).
- **Phát hiện (chưa fix, ghi vào sổ tay):** `activeTabId` (tab địa danh đang xem) nằm TRONG state đồng bộ `web2_so_order` → chuyển tab ở máy A làm máy B cũng nhảy tab. Nên tách per-device localStorage (chờ user quyết).

### [so-order] FIX: in tem sau khi nhận hàng ra giá 0

**Files:** `so-order/js/so-order-receive.js`, `so-order/js/so-order-barcode.js`, `so-order/index.html` (bump `?v=20260628t`).

User báo: bấm "Nhận hàng" → modal in tem mã SP nhưng **giá in = 0**. Root cause: response `confirm-purchase-partial` (web2-products.js:1963-1972) KHÔNG trả `price`/`sellPrice` (chỉ code/name/stock/pendingQty/status). Đường auto-print (`so-order-receive.js` ~737) build tem từ `{...serverRow, variant, qtyReceived}` → không có price → `openBarcodePrintModal` rớt về `price: ...||0`. Đường "In tem" thủ công (barcode.js) dùng `it.sellPriceVnd` nên không lỗi.

- Fix: cả 2 đường truyền giá bán tem theo thứ tự ưu tiên: **(1) `it.sellPriceVnd` (giá bán dòng order) → (2) `Web2ProductsCache.findByCode(code).price` (giá Kho SP, đúng khi dòng order để trống giá) → (3) 0**.
- Verify LIVE (Playwright, wrap `Web2ProductsPrint.open` bắt products): trước fix giá 0; sau bump `?v` load JS mới → tem ra giá đúng (126.000 / 717.000 / 316.000). Kho sync stock đúng (MUA_1_PHAN/DANG_BAN/CHO_MUA).
- Bài học cache: localhost `python -m http.server` KHÔNG no-cache cho .js → phải bump `?v=` mới load JS sửa (HTML `?t=` chỉ bust HTML, không bust subresource).

### [ai-widget] Full-data theo CACHE browser (IDB) + freshness gate + nút "Lấy full dữ liệu mới nhất"

**Files:** `web2/shared/web2-ai-assistant.js` (+ bump sidebar inject).

User: phần AI widget lấy full dữ liệu → lấy theo CACHE; nút nạp full vào cache browser; widget check cache mới nhất chưa, chưa thì kêu user bấm nút rồi mới dùng AI.

- **Cache engine = `Web2SmartCache`** (tái dùng, DRY): per trang có DB_SOURCES → `aiCacheFor(path)` tạo cache lười (`name='ai-dbdata:'+path`, fetcher = fetch full từ DB_SOURCES, **IDB persist** + **TTL 10p** + **SSE topic** freshness). Thay hẳn `_dbData` in-memory cũ (mất khi reload).
- **Đọc SYNC**: `pageContext()` lấy data qua `cache.peek()` (sync, value hiện có hoặc null) — hợp resolveExpr sync. Persist qua reload (IDB).
- **Freshness gate trong `ask()`**: trang có nguồn full-data + cache **trống/cũ** (TTL/SSE) → KHÔNG gọi AI, hiện thông báo kêu bấm **“🔄 Lấy full dữ liệu mới nhất”** (câu hỏi tự chạy sau khi nạp qua `_pendingQ`). Gate 1 lần/trang (`_gateAsked`) — hỏi lại = hỏi luôn với data hiện có.
- **Nút quick-bar** label theo freshness: `🔄 Lấy full dữ liệu mới nhất` / `⚠️ Dữ liệu đã cũ — nạp lại` / `✓ Dữ liệu mới — nạp lại`. Recon workflow (3 agent) xác nhận API + điểm tích hợp trước khi build.

### [web2/system] Tab "Gợi ý AI" — quản lý toàn bộ gợi ý + accessor của widget AI theo từng trang

**Files:** `web2/system/js/system-ai-suggestions.js` (MỚI), `web2/system/{index.html, js/system-app.js}`.

User: thêm tất cả gợi ý AI widget vào trang system để quản lý. Tab thứ 6 "✨ Gợi ý AI" đọc `window.Web2AiPageRegistry.PAGES` (+ GENERIC) → liệt kê per-trang: route, model, **accessor dữ liệu** (expr + desc), **câu gợi ý** (label + prompt collapsible), note nguồn data. Summary: số trang có gợi ý, tổng câu gợi ý, số trang có/không accessor. Có ô tìm kiếm (route/nội dung gợi ý/accessor). `VALID_TABS` thêm `ai` + lazy-init `SystemAiSuggestions.start()`. Load `web2-ai-page-registry.js` trên trang (sidebar autoload + load thêm cho chắc).

### [sepay-invoices] Push snapshot từ máy IP nhà (SePay Cloudflare chặn scrape IP server)

**Files:** `render.com/routes/web2-sepay-invoices.js`, `scripts/sepay-push.js` (MỚI), `web2/system/js/system-services.js`.

⚠ **SePay (Cloudflare WAF) CHẶN scrape**: GET /login từ IP datacenter Render → **403** (cả với full browser headers — block ASN cloud, không phải header). IP nhà cũng bị **rate-limit 403** khi request nhiều. → server-side auto-scrape KHÔNG khả thi.

- **Route**: GET thử login direct; 403 → báo lỗi rõ + fallback **snapshot pushed**. `POST /push` (secret `SEPAY_PUSH_SECRET`) nhận snapshot từ máy IP nhà.
- **`scripts/sepay-push.js`**: chạy MÁY IP NHÀ (Mac/shop) → scrape /invoices + dựng QR VietQR → POST /push. Đọc creds + secret + worker URL từ serect_dont_push. Dùng cron/launchd 1 lần/ngày (KHÔNG hammer kẻo bị rate-limit).
- **Frontend**: blocked → hiện link trực tiếp `my.sepay.vn/invoices ↗` + hướng dẫn chạy push. Có snapshot → hiện hóa đơn + QR.
- Env Render: SEPAY_LOGIN_EMAIL/PASSWORD + SEPAY_PUSH_SECRET (set qua Render API).

### [web2/system][services] Render API verify + fix DB disk 15GB + SePay paid + theo dõi hóa đơn SePay + QR

**Files:** `render.com/routes/web2-sepay-invoices.js` (MỚI), `render.com/routes/services-overview.js`, `render.com/server.js`, `web2/system/{index.html, js/system-services.js}`.

- **Render API verify dịch vụ**: 3 web (web2-api/n2store-fallback Standard, web2-realtime Starter) + 2 Postgres basic_1gb = $95/mo — KHỚP data hardcode.
- **Fix DB disk** (user báo "dung lượng db không đúng"): chat-db báo 1043MB/**1GB**=101.9% (đỏ) nhưng Render API `diskSizeGB=**15**` ("basic_1gb"=RAM, không phải storage) → thật ~7%. Sửa `DB_LIMITS`=15GB + label.
- **SePay = trả phí** (user): API SePay không có billing → login my.sepay.vn (creds secrets) xem `/invoices`: gói gia hạn **589.000đ/tháng (~$24)**. `costMonth` 0→24.
- **Theo dõi hóa đơn SePay + QR** (user): route `/api/web2-sepay-invoices` login server-side (CodeIgniter CSRF: GET /login→do_login→GET /invoices csrf2→POST ajax_invoices_list) → list hóa đơn; chưa thanh toán → **QR VietQR** (`vietqr.app`, des=`SEP`+id pad8) để quét trả. Cache 10p. Creds lưu **Render env** (SEPAY_LOGIN_EMAIL/PASSWORD qua Render API + redeploy). Card trong tab Services (`renderSepayInvoices`).
- Verify flow đầy đủ qua prototype (login OK, ajax 10 HĐ, QR đúng). ⚠ Route read-only chưa gắn auth (system page admin-gated) — có thể thêm sau.

### [ai-widget][live-chat] Bỏ nút đọc comment DB + "SP nhiều giỏ nhất" dùng số liệu GIỎ Web 2.0

**Files:** `web2/shared/web2-ai-page-registry.js`, `live-chat/js/pancake/inventory-panel-init.js`.

User: (1) bỏ nút "Đọc toàn bộ comment livestream (DB)" trên live-chat (comment quá lớn AI không nổi); (2) gợi ý "Hỏi nhiều về SP nào" → dùng **số liệu giỏ** thay vì đọc comment; **giỏ WEB 2.0 (native_orders), KHÔNG phải giỏ Pancake**.

- **Bỏ DB button**: `DB_SOURCES['/live-chat/'] = []`.
- **Helper giỏ web2**: `PancakeInventoryPanel.getCartProductStats()` (+ expose `STATE` getter) — overview (số khách có giỏ + tổng SL, ĐẦY ĐỦ từ `cartCounts`) + topProducts (SP nhiều giỏ nhất, best-effort từ `cartByCmt`). Cart inventory-panel ghi `/api/v2/cart` → `native_orders.products` (SSE `web2:cart`) = giỏ Web 2.0.
- **Registry live-chat**: thêm accessor `window.PancakeInventoryPanel.getCartProductStats()` + đổi suggestion "🔥 SP nhiều giỏ nhất" (trước: đọc `LiveState.comments`) → dùng số liệu giỏ, KHÔNG đọc comment.
- `resolveExpr` của widget là SYNC (không await Promise) → accessor phải trả data in-memory; per-product giỏ đầy đủ cần campaign board backend nên topProducts best-effort.

### [web2/products + so-order + live] Vòng đời SP: nhận hàng → bán → HẾT HÀNG (mất hiệu lực)

**Files BE:** `render.com/routes/{web2-products,native-orders,fast-sale-orders,web2-returns,purchase-refund}.js`. **FE:** `web2/products/{index.html,js/web2-products-{state,filters,render}.js,js/web2-product-detail.js}`, `web2/live-control/js/live-control.js`, `web2/live-tv/js/live-tv.js`, `so-order/js/so-order-modal-suggest.js`.

**Logic mới (user chốt):** SP nhận hàng (confirm-purchase) → có tồn (DANG_BAN). Bán hết tồn (stock→0, pending=0) → **status `HET_HANG` + is_active=false ("mất hiệu lực")**: tự ẩn khỏi Kho SP (filter mặc định "Đang bán") + bảng live, **CHỈ còn trong gợi ý Số Order** để nhập lại nhanh. Re-import (upsert-pending) → reactivate. (3 quyết định AskUserQuestion: status riêng + tự ẩn · ẩn cả Kho+live · SP huỷ-khỏi-đơn-chưa-nhận VẪN xoá hẳn như cũ.)

**Trigger (mọi path tồn về 0):** sell native-orders + fast-sale (decrement), refund NCC (purchase-refund), huỷ thu về (returns). Un-retire (tồn lại): huỷ PBH restock, duyệt thu về, đảo refund, adjust-stock, re-import. Backfill idempotent (migration 081) + self-heal 2 chiều lúc boot cho path chưa inline-patch.

**INVARIANT manual-pause (airtight, adversarial-review fix):** mọi retire CHỈ tác động khi `is_active=true`; mọi un-retire CHỈ khi `status='HET_HANG'` → SP user tự "Tạm dừng" KHÔNG bao giờ bị auto đổi HET_HANG / auto bật lại. `_recomputeParent` + badge CHA cũng có HET_HANG.

**FE:** Kho SP filter 3 trạng thái (Đang bán mặc định / Hết hàng / Tất cả); badge HẾT HÀNG (Kho + detail + parent); bảng live lọc `isActive!==false`; gợi ý Số Order đánh dấu "hết hàng · nhập lại" (Web2ProductsCache vẫn load cả inactive). Cache-bust `20260628hh`.

Verified: throwaway local PG (mọi transition + manual-pause preserved + idempotent) + adversarial review workflow (4 lỗi → fix hết). Status: ✅ FE đẩy GH Pages; BE deploy web2-api.

### [ai-widget] Redesign UI xanh Zalo + fix im lặng khi data quá lớn (live comments)

**File:** `web2/shared/web2-ai-assistant.js` (+ bump version sidebar).

1. **Bug: hỏi về `window.LiveState.comments` không trả lời** — `pageContext()` gọi `JSON.stringify` toàn bộ mảng comment livestream khổng lồ (lại chạy 7× theo cascade model) → RangeError "Invalid string length"/treo → AI im lặng. Fix: `encodeArray` guard `HUGE_ROWS=2000` (tóm tắt thống kê ngay, KHÔNG stringify toàn bộ) + try/catch + try/catch bao `pageContext()`. Cờ `_ctxOversize` → systemPrompt chỉ dẫn AI: data quá lớn + câu hỏi cần nội dung chi tiết từng dòng → trả "Dữ liệu quá lớn nên AI phân tích không nổi — liên hệ admin nâng ngưỡng AI nếu thật sự cần." (theo yêu cầu user) thay vì im lặng.
2. **Redesign UI**: đồng bộ theme project **xanh Zalo `#0068ff`** (thay tím `#6366f1/#8b5cf6` lệch theme). FAB bo góc 18px + glow, panel có **entrance animation**, header gradient nhạt, mode chips bo 11px, bubble user gradient + shadow, AI card hairline + shadow nhẹ, input/send focus xanh + hover nhấc, typing dots bounce. Giữ nguyên mọi class (JS không đổi).

### [ai-widget] Audit registry: 12 trang thiếu data → expose state lên window + thêm accessor

**Files:** `web2/shared/web2-ai-page-registry.js` + 12 page JS (dlv-app, rf-app, order-tags-app, users-app, kpi-dashboard, report-warehouse, report-delivery, dashboard, notifications, fb-insights, report-revenue, web2-audit-log).

User: review gợi ý từng trang của widget AI nổi (Web2AiAssistant) → có đủ data phân tích chưa?

- **Audit (workflow 15 agent đọc JS thật)**: 34 entry registry — 18 trang ĐỦ accessor; **16 trang có suggestions nhưng 0 accessor** → AI chỉ đọc DOM phân trang/thiếu. Nguyên nhân: STATE bị đóng trong IIFE closure, không expose lên window.
- **Fix 12 trang có data** (3 đợt): expose state lên window + thêm accessor full-dataset vào registry:
    - `DlvApp.STATE`/`RfApp.STATE` (PBH giao/hoàn), `Web2OrderTagsApp.STATE`, `Web2UsersApp.STATE`, `Web2KpiData`(=STATE+lastKpi), `Web2WarehouseReport`(getter lastData/view/region), `Web2ReportDeliveryData`, `Web2DashboardData`, `Web2NotificationsData`, `Web2FbInsightsData`, `Web2ReportRevenueData.summary`, `Web2AuditLogData`.
- **4 trang để trống có chủ đích** (không có dataset phân tích): `fb-ads-stats`, `ck-dashboard`, `overview`(landing), `payment-confirm`(redirect).
- **Pattern**: trang dùng IIFE → state private; muốn widget AI đọc FULL data, expose `window.<Global> = STATE` (ref live, mutate in-place) hoặc getter nếu là `let` reassign; rồi thêm accessor `{expr, desc, shape}` vào registry. Shape verify từ code thật.

### [web2/live-control + live-tv] Fix SP "ghost" khi xoá kho / Số Order

**Files:** `render.com/routes/web2-campaign-products.js`, `web2/live-control/js/live-control.js`, `web2/live-tv/js/live-tv.js`, 2 index.html (cache-bust).

**Bug:** xoá SP ở Kho SP (DELETE `/api/web2/products/:code`) hoặc xoá row Số Order (qua `adjust-pending` khi pending→0 & stock=0 & `created_by='so-order'` → DELETE web2_products) **hard-delete dòng `web2_products` nhưng KHÔNG dọn `web2_campaign_products`**. Dòng cp mồ côi (`removed=false`) → GET LEFT JOIN trả `name=null` → `missing:true` → "ghost" vẫn hiện trên board live-control + màn TV.

**Fix (self-heal 1 nguồn, phủ MỌI path xoá + ghost cũ tồn đọng):**

- `autoSyncPending`: trước khi add pending, `DELETE FROM web2_campaign_products cp WHERE campaign_id=$1 AND NOT EXISTS (SELECT 1 FROM web2_products p WHERE p.code=cp.product_code)`. Hard-delete (SP không còn tồn tại; tái tạo cùng mã sau auto-add lại sạch). Trả `{added,purged}`.
- GET `sync=1`: broadcast `web2:campaign-products` khi `added>0` HOẶC `purged>0` → TV + tab khác refresh realtime (không kẹt tới F5).
- Frontend `live-control.js` + `live-tv.js`: lọc `items.filter(it => !it.missing)` (defense — màn TV không gửi sync nên không tự dọn DB; tránh nháy 1 frame ghost).
- **KHÔNG** đụng case-2 (SP còn trong kho, `pending→0` status `DANG_BAN`): `pending→0` cũng xảy ra khi nhận hàng vào kho (confirm-purchase) — SP còn bán được trên live → giữ.

Verified: throwaway local PG (purge dọn đúng SP đã xoá P2/P3, giữ SP còn kho P1/P4, idempotent re-run=0). Cache-bust `live-*.js?v=20260628ghost`. Status: ✅ FE đẩy GH Pages; BE deploy web2-api.

### [so-order] Hardening: picker KHÔNG auto-đặt tên cho dòng đã CHỌN SP (matchedCode)

User báo bug: chọn SP cha từ suggest → Lưu Nháp → dòng cha tên bị "A". **Repro trên code hiện tại (browser, port riêng): KHÔNG tái hiện** — modal + storage + bảng đều "ÁO SƠ MI LỤA" (3 con Beo/Ghi/Đỏ, head "ÁO SƠ MI LỤA · 3 biến thể · HCAO5BEO"). "A" có thể do JS cũ bị cache (version churn p9→q khi 2 agent sửa song song). **Hardening**: guard auto-name của Web2VariantPicker onChange thêm `!row.matchedCode` → dòng đã chọn SP có sẵn (từ suggest, mọi dòng cha-con) KHÔNG bị picker re-mount ghi đè tên thành tên auto/cụt; chỉ auto-name SP gõ tay mới. Bump `so-order-modal-core.js=r`. (Khuyến nghị user hard-refresh Cmd+Shift+R.)

**Files:** `web2/shared/web2-ai-assistant.js`, `web2/shared/web2-sidebar.js`.

User: trang `web2/ai-hub` KHÔNG cần widget AI nổi (vì cả trang đã là khung Trợ lý AI). Thêm `ai-hub` vào điều kiện early-return của `Web2AiAssistant.mount()` (`/\/web2\/(login|ai-hub)\//`) — khớp pattern HIDE_RE sẵn có. Bump inject version widget trong sidebar `20260628a` (cache refresh production). Các trang khác giữ nguyên nút nổi.

### [ai-hub] Trợ lý AI: icon SVG sạch cho nút đính ảnh/prompt/gửi + chốt fix busy (scoped !important)

**Files:** `web2/shared/web2-gemini-chat.js`, `web2/ai-hub/index.html`.

- User: nút 🖼️/📋 (emoji) lạc lõng → thay **icon SVG lucide-style** (image / list / arrow-up) cho 3 nút đính ảnh + prompt mẫu + gửi; `.gch-iconbtn`/`.gch-send` thêm `display:grid;place-items:center` căn giữa.
- "Đang xử lý ảnh…" vẫn hiện ở máy user = web2-image-paste.js bản **cache cũ** (sidebar autoload ?v cũ) → thêm **scoped `!important`** `.gch-attach .w2ip-busy[hidden]{display:none!important}` trong CSS module chat → ẩn chắc chắn bất kể version cache. (Fix shared ở web2-image-paste.js vẫn giữ cho trang khác.)
- Bump web2-gemini-chat.js?v=20260628e.

### [web2/shared] Logo đẹp hơn + áp vào sidebar menu (mọi trang Web 2.0)

**Files:** `web2/shared/web2-logo.svg`, `web2/shared/web2-sidebar.js`, `web2/overview/index.html`.

User: làm logo đẹp hơn + đổi logo thanh menu (sidebar, hình 2 — đang là emblem vương miện vàng cũ).

- **Logo refine v2**: gradient richer (#0a74ff→#6d5cff→#c026d3), thêm radial highlight bóng (glossy app-icon), inner stroke trắng .2 (viền nét trên cả nền sáng/tối), monogram **N** thân bo góc (rx2.4) + diagonal đặc, **spark dot** trắng top-right (accent realtime). Đẹp trên cả nav sáng lẫn sidebar tối.
- **Sidebar**: `LOGO_URL` `img/logo-emblem.png` → `web2-logo.svg?v=20260628b` → áp cho **mọi trang Web 2.0** dùng sidebar (JS no-cache trên Render tự propagate). Giữ chữ "Web 2.0 / v1.0".
- Overview: bump `?v=20260628b` cho img + favicon để bust cache SVG.
- Verify browser: sidebar (tối) + nav (sáng) render logo mới OK (SVG 150px, 0 error), zoom 260px sắc nét. Crown PNG cũ GIỮ lại cho apple-touch-icon/PWA (raster) — chưa đổi (cần PNG full-bleed riêng).

### [so-order] Suggest tạo đơn: mục SP CHA trên cùng (thêm tất cả con) + chọn con điền biến thể

Modal "Tạo Đơn Hàng" — suggest tên SP giờ dùng module chung `Web2ProductGroup`:

- **Mục CHA ưu tiên TRÊN CÙNG** (badge "🌿 cha · N biến thể" + mã cha): bấm → `applyParentSuggestionToRow` THÊM TẤT CẢ biến thể con thành **từng dòng** (dòng hiện tại = con đầu, các con còn lại chèn ngay dưới, kế thừa NCC + ảnh HĐ đơn, **chung `productGroupId`** → Kho gom 1 cha+N con + bảng gom khối).
- **Mục CON** (↳ thụt lề) bên dưới: bấm → điền dòng theo **biến thể mới** (ghi đè variant + category). Tách `_fillRowFromProduct(row,p,fillVariant)` dùng chung.
- SP đơn lẻ → mục thường như cũ. Load `web2-variant-group.js` + `web2-product-group.js` vào so-order. CSS mục cha/con (`.so-suggest-parent/.so-suggest-child`). Verify browser: suggest "ÁO SƠ MI" → 1 cha (cha·3 biến thể, codes HCAO5BEO/HCAO3GHI/HCAO4DO) + 3 con. (Test click cha bị giới hạn do tranh chấp browser-port với agent khác — logic reuse `_fillRowFromProduct` đã verify.)

### [ai-hub][shared] Fix Trợ lý AI: busy "Đang xử lý ảnh" stuck, chip không tắt UI cũ, switchTab + review

**Files:** `web2/shared/web2-image-paste.js`, `web2/shared/web2-gemini-chat.js`, `web2/ai-hub/{index.html, js/ai-hub.js}`.

User báo 2 bug + review đối kháng (4 agent) tìm thêm:

- **Bug1 "Đang xử lý ảnh…" hiện vĩnh viễn**: `.w2ip-busy{display:flex}` (author, spec 0,1,0) ĐÈ `[hidden]{display:none}` (UA) → busy luôn hiện. Fix shared `.w2ip-busy[hidden]{display:none}` (spec 0,2,0 thắng) — sửa cho MỌI trang dùng Web2ImagePaste. + bỏ hint trùng (`hint:''`, dropzone đã có nhãn). [[reference_css_hidden_display_override]]
- **Bug2 chuyển chip không tắt UI chip cũ**: ghép đồ/mặt auto-mở khu đính ảnh, về Chat không đóng. Fix `applyMode`: `attachEl.hidden = !(minImgs || imgCtrl.count()>0)` → chip không-cần-ảnh + chưa có ảnh thì ĐÓNG.
- **Review HIGH (thật)**: `switchTab` fallback `'chat'` (tab đã xoá) → blank UI khi NV bấm Cấu hình. Fix → `'gemini'`. + double-submit guard `if (sendBtn.disabled) return` ở send().
- **Review bỏ qua (không phải bug)**: KHÔNG truyền account cho image/tryon là ĐÚNG (để PREMIUM-first rotation mỗi lượt); XSS error đã esc qua mdToHtml; secret không cần (sidecar không set SECRET, Web2Tryon cũng không gửi).
- Bump web2-gemini-chat.js?v=20260628d. JS no-cache → fix shared áp dụng ngay reload.

### [web2/overview + shared] Logo riêng n2shop Web 2.0 (mark "N" gradient + wordmark)

**Files:** `web2/shared/web2-logo.svg` (mới), `web2/overview/{index.html,overview.css}`.

User: tạo logo riêng cho n2shop Web 2.0.

- **Logo mark** = SVG dùng chung `web2/shared/web2-logo.svg`: squircle gradient signature (#0068ff→#6d5cff→#c026d3) + sheen + monogram **"N"** trắng (2 thân + đường chéo translucent tạo chiều sâu) + **node dot** trắng/xanh (accent "realtime/2.0"). Font-independent (path), tái dùng được mọi nơi + làm favicon.
- **Nav overview**: thay placeholder `.ov-brand-dot '2.0'` bằng `<img>` mark + wordmark 2 dòng: **n2shop** (Space Grotesk bold) + tag **WEB 2.0** (xanh, uppercase letterspaced). Set `<link rel=icon>` = logo SVG; title → "n2shop · Web 2.0".
- Verify browser: mark load OK (SVG 150px render), wordmark "n2shop"/"Web 2.0", 0 console error. Zoom 280px xác nhận N + node sắc nét. Bump `?v=20260628logo`.
- Chưa áp logo cho sidebar/login (40+ trang) — chờ user duyệt rollout.

### [ai-hub] GỘP 4 tab → 1 "Trợ lý AI": chat + tạo ảnh + ghép đồ + ghép mặt, chip chế độ, máy Bo

**Files:** `web2/shared/web2-gemini-client.js` (MỚI — nguồn duy nhất gọi sidecar), `web2/shared/web2-gemini-chat.js` (rewrite thành trợ lý hợp nhất), `web2/ai-hub/{index.html, js/ai-hub.js}`.

User: gộp 4 tab (Chat, Gemini Free, Tạo ảnh, Ghép đồ) thành **1 khung chat** — gửi ảnh, prompt mẫu sẵn. Chốt: **chip chế độ** trên ô nhập + chat engine **cookie acc shop** + **bỏ chữ "FREE"** + mất tunnel → báo **"bật máy Bo lên"**.

- **`Web2GeminiClient`** (shared, nguồn DUY NHẤT giao tiếp sidecar máy Bo): `discover()` / `chat()` / `generate()` (text→ảnh/img2img) / `tryon()` (ghép đồ+mặt) / `health()` / `paidImage()`. Fail-fast 105s + KHÔNG retry timeout → fallback Nano Banana trả phí. Gom prompt TRYON/FACESWAP + `buildTryonPrompt`. `OFFLINE_MSG = "bật máy Bo lên"`. Dùng chung cho trợ lý + (sẽ refactor) widget ✨.
- **`Web2GeminiChat` hợp nhất**: 1 khung hội thoại + **chip chế độ** 💬 Chat / 🎨 Tạo ảnh / 👕 Ghép đồ / 🙂 Ghép mặt. Routing theo chế độ qua client. Đính ảnh (Web2ImagePaste, auto-mở cho ghép đồ/mặt), prompt mẫu 📋 (Web2AiPresets: chat→vai trò, ảnh→thư viện 49 prompt + tự đổi chế độ). Kết quả (text + ảnh) inline trong thread, tag "✨ máy Bo" / "🍌 trả phí". Lightbox ảnh. localStorage nhiều cuộc.
- **ai-hub**: 4 tab → **1 tab "✨ Trợ lý AI"** (default) + giữ HTML Studio + Cấu hình. Gỡ ai-chat.js/ai-image.js/ai-tryon.js (đã gộp). Bỏ hết chữ "FREE", dùng "máy Bo".
- **Verify browser** (standalone, no-auth): mount sạch **0 lỗi console**, 4 chip chế độ, chuyển chế độ cập nhật hint + auto-mở đính ảnh cho ghép đồ/mặt, Web2ImagePaste + presets + client load OK, status "🟢 Máy Bo đang bật".
- ⚠ Tech-debt: Web2Tryon (widget ✨) chưa refactor sang client → tạm trùng logic try-on (B fail-fast đã có ở cả 2). Refactor sau.

### [web2/overview] Nav gọn: avatar DiceBear + 1 nút duy nhất → trang đầu user có quyền

**Files:** `web2/overview/{index.html,overview.css,overview.js}`.

User: thêm avatar user, chỉnh bố cục nav, **xóa hết nút**, chỉ giữ **1 nút** dẫn tới trang ĐẦU TIÊN user có quyền.

- **Xóa** center links (Tính năng/Module/Hệ thống), nút Đăng xuất, nút "Vào module". Nav giờ: brand (trái) + chip user + 1 nút (phải, `margin-left:auto`).
- **Avatar thật = DiceBear** qua `Web2UserProfile.avatarUrlFor(user)` (cùng nguồn footer sidebar + bảng users; load `web2-user-profile.js` ở head). Chip = avatar + tên + role, click → `Web2UserProfile.open()` (xem/đổi avatar). Fallback chữ cái đầu nếu chưa có avatar.
- **1 nút** `#ovEnterBtn` href + nhãn set bởi JS: `firstAccessiblePage()` = item đầu của nhóm hiển thị đầu (`visibleGroups()` đã lọc role/admin) → admin/NV = "Vào Bán hàng (HĐ)" → `web2/fastsaleorder-invoice`. Nhóm bị ẩn cho user thì tự rớt xuống nhóm kế.
- Verify browser (admin): 0 nav-link, 0 logout, 1 nút, avatar DiceBear load OK (naturalW 150), tên "Quản trị viên"/role "Admin", href resolve `../../web2/fastsaleorder-invoice/index.html`, 0 console error. Bump `?v=20260628nav`.

### [so-order] SP cha nhiều biến thể = KHỐI tách biệt rõ (an toàn, giữ NCC/Ảnh-HĐ rowspan)

User muốn Sổ Order "cũng vậy" như Kho SP (bảng con). **Ràng buộc cấu trúc**: Sổ Order gộp ô NCC + Ảnh-Hóa-Đơn (rowspan) trải cả đơn, Ảnh-HĐ ở GIỮA bảng → bảng-con full-width sẽ vỡ layout + lệch "Nhận hàng" (đã giải thích user). Chọn: gom mỗi nhóm biến thể thành **1 KHỐI tách biệt** bằng CSS (an toàn, giữ nguyên nhận-hàng/sửa/rowspan):

- `_computeRowSpans` thêm `nameSpan` ở dòng head (nhóm `productGroupId||tên` cùng đơn, ≥2).
- `rowHtml` head: badge "🌿 N biến thể"; cont: "↳" + giữ mã con.
- CSS: nền tím nhạt + thanh trái tím đậm (ở cột STT, sau NCC) + viền bracket trên/dưới — **TRỪ ô NCC gộp** (`:not(.so-cell-supplier)`) nên NCC/Ảnh-HĐ rowspan + nút Nhận hàng nguyên vẹn. EDIT mode không đổi.
- Verify browser: 2 khối + badge "2 biến thể" + 2 nút Nhận hàng còn nguyên; VÁY HOA NHÍ (standalone) thường. Bump `so-order render/css=p5`.
- Bảng-con full-width như Kho SP cần redesign bỏ gộp ô NCC/Ảnh-HĐ → để sau nếu cần.

### [ai-hub][gemini-tryon] Đính ảnh chat Gemini + fallback paid nhanh + PREMIUM ưu tiên xoay tua

**Files:** `web2/shared/web2-gemini-chat.js` (A), `web2/shared/web2-tryon.js` (B + dropdown marker), `gemini-tryon/app.py` (C), `web2/ai-hub/index.html`.

3 việc user yêu cầu (A+B) + clarify (C):

- **A — Đính ảnh hỏi Gemini trong tab chat**: composer thêm nút 🖼️ + khu đính ảnh **tái dùng module shared `Web2ImagePaste.mount`** (paste/kéo-thả/nén sẵn, KHÔNG hand-roll). `getDataUrls()` → gửi kèm `images` trong POST /chat (backend `_run_chat` đã nhận `image_dataurls` → `send_message(files=…)`). Ảnh hiện trong bubble user (renderMsgs render `m.images`), reset composer sau gửi. Degrade an toàn nếu thiếu module (ẩn nút). Load `web2-image-paste.js` vào ai-hub, bump `web2-gemini-chat.js?v=20260628b`.
- **B — Fallback Nano Banana nhanh hơn ở Ghép đồ**: đường FREE trước đây timeout `240000ms × 3 retries ≈ 722s (12 phút)` mới fallback (vì retry cả khi timeout). Sửa `callGeminiMachine`: `FREE_GEN_TIMEOUT_MS=105000` (≈ trần cloudflared quick-tunnel ~100s — chờ lâu hơn vô ích) + `FREE_MAX_ATTEMPTS=2` + **KHÔNG retry khi TimeoutError/AbortError** (timeout = tunnel đã giết → retry tốn thêm 105s). Worst-case free ~105s thay vì ~722s. Lỗi transient nhanh (502-504, ERR_NETWORK_CHANGED=TypeError) vẫn retry 1 lần.
- **C — PREMIUM (trả phí) ưu tiên xoay tua TRƯỚC** (user xác nhận: ổn định + quota cao + đã trả tháng, không tính phí/lượt như Nano Banana API): `Account.premium` (tự nhận diện tên chứa "premium" hoặc cờ tường minh trong accounts.json/POST). `public()` expose `premium` → `/health`. Sort `order` stable-sort premium lên đầu ở CẢ `_run_gemini` + `_run_chat`. Dropdown nguồn admin (`.w2t-src`) đánh dấu ⭐ (trả phí). py_compile OK.

> Cần cài lại sidecar bản mới trên máy shop (bộ cài [4] Gemini) để có `/chat` + B/C có hiệu lực.

### [web2/shared] Module CHUNG SP cha-con `Web2ProductGroup` + Kho SP tham chiếu

User: "tạo module riêng cho sản phẩm / SP con / SP cha → các trang liên quan SP tham chiếu vào dùng". → Tạo **`web2/shared/web2-product-group.js`** (`window.Web2ProductGroup`) + **`web2/shared/web2-product-group.css`** (class `w2pg-*`) làm 1 NGUỒN cho cha-con:

- `group(products, opts)` → bọc `Web2VariantGroup.group(by:'parent')` (gom cha-con).
- `commonPrefix(codes)` + `parentCode(variants)` → suy ra MÃ CHA (parent_code thật / tiền tố chung ≥3).
- `childPanelHtml({key,name,count,colspan,colHeaders,rowsHtml})` → khung BẢNG CON (drawer) khi expand: rãnh tím + header "N biến thể con của <tên>" + `<table>` card. Trang tự cấp cột + nội dung dòng → khung/style đồng nhất.

**Kho SP refactor**: bỏ local `_commonPrefix`/`_parentDisplayCode`/`_childPanelHtml` chrome + CSS panel → dùng `Web2ProductGroup`. Tách thêm `_statusBadgeHtml`/`_rowActionsHtml` (dùng chung dòng thường + dòng con). Class `w2pc-*`→`w2pg-*` (shared). Verify browser: expand vẫn ra bảng con đúng (mã cha HCAO, nút sửa/in/xóa OK). Bump `render/css=p9`. (Sổ Order sẽ tham chiếu cùng module — bước kế.)

### [ai-hub][gemini-tryon] Tab "Gemini Free" — CHAT với Gemini qua COOKIE (multi-turn, xem hội thoại)

**Files:** `gemini-tryon/app.py` (ChatReq + `_run_chat` + `POST /chat`), `web2/shared/web2-gemini-chat.js` (mới — module shared `Web2GeminiChat`), `web2/ai-hub/js/ai-gemini-chat.js` (mới — thin wrapper), `web2/ai-hub/{index.html, js/ai-hub.js}`.

User: "(1) muốn coi luôn đoạn hội thoại + nói chuyện với gemini; (2) tương tự chatgpt" → chọn **Build chat qua COOKIE (acc shop)** + ChatGPT dùng model free trong ai-hub.

- **Backend sidecar** (`app.py`): thêm endpoint `POST /chat` + `_run_chat(message, metadata, account, images)` — chat **multi-turn** qua `gemini_webapi` `start_chat(metadata=[cid,rid,rcid])` → `send_message`. Trả `{ok,text,images,metadata,account}` để FE giữ ngữ cảnh + tiếp đúng account. Tiếp tục hội thoại (có metadata) → KHÔNG xoay account (break); hội thoại mới → xoay tua/round-robin. TEXT chat ỔN ĐỊNH (khác image-gen flaky). py_compile OK.
- **Module shared** `Web2GeminiChat.mount(container)`: UI chat 2 cột (danh sách cuộc + khung chat), tự dò máy (localhost:8131 → registry `engine=gemini-tryon`, pick `readyCount>0`), lưu hội thoại localStorage (`web2_gemini_cookie_chats`), markdown nhẹ an toàn, multi-turn giữ `metadata`+`account`. Báo rõ khi máy offline / **bản cũ chưa có /chat (404)** → hướng dẫn chạy lại bộ cài [4] Gemini.
- **ai-hub**: tab mới "✨ Gemini Free" (sau tab Chat) mount `Web2GeminiChat` vào `#aihGeminiMount` (lazy onShow), wire `switchTab`/`init`. Tách hẳn tab "Chat" (chat qua API-key backend).
- **Verify browser** (admin, localhost): tab xuất hiện đúng vị trí `[chat,gemini,image,tryon,html,keys]`, click → mount sạch (.gch + composer + new-btn), **0 console error**, discover thấy máy shop `DESKTOP-OB24MTL` ONLINE (6 account ready). Round-trip chat tạm 404 vì **máy shop đang chạy app.py CŨ chưa có /chat** (curl confirm `{"detail":"Not Found"}`) → cần user cài lại sidecar bản mới trên máy shop.

### [web2/overview] Trang giới thiệu NHẸ & MƯỢT — gỡ GSAP/Lenis, hiệu ứng thuần CSS

**Files:** `web2/overview/{index.html,overview.css,overview.js}`.

User: trang overview (landing Framer-style) hiệu ứng **nặng quá** → tham chiếu phong cách nhẹ/mượt của `web2/system?tab=services` để tinh chỉnh, vẫn đẹp hiện đại.

- **Gỡ toàn bộ motion stack CDN**: GSAP + ScrollTrigger + SplitText + Lenis (4 script ~150KB+). Page giờ chỉ còn 3 script (web2-auth, lucide, overview.js) thay vì 8. JS bỏ `gsapFlourishes()` + `initLenis()`; anchor-scroll dùng native `window.scrollTo({behavior:smooth})` + offset nav.
- **Lenis smooth-scroll bỏ** → native scroll (Lenis hijack rAF mỗi frame = thủ phạm "nặng" chính).
- **Aurora**: 3 blob `46vmax` × `filter:blur(55px)` animate vô hạn → thay bằng **radial-gradient tĩnh vẽ 1 lần** (fixed layer, không animation/blur) → chi phí scroll ~0, vẫn giữ wash màu Framer.
- **Grain**: bỏ `mix-blend-mode:multiply` (ép recomposite mỗi frame), giữ texture tĩnh opacity 0.04.
- **Nav**: bỏ `backdrop-filter:blur(14px)` (vi phạm MODAL-ANTI-LAG) → nền trắng translucent đặc hơn (0.9 / scrolled 0.97).
- **Marquee** chuyển sang CSS `@keyframes translateX(-50%)` (transform-only, pause on hover) thay GSAP tween. **Hero entrance** = CSS `ov-fade-up` stagger thay SplitText. Reveal vẫn IntersectionObserver (`[data-rise]`) — giữ nguyên. `prefers-reduced-motion` cập nhật cho hiệu ứng mới.
- Verify browser (admin): 0 console error, gsap/lenis/splitText=undefined, aurora 0 span + animation none, 52 card render, scroll-reveal OK (40/52 + 4/4 pillar khi cuộn). Bump `?v=20260628lite`.

### [web2/products] Kho SP — CON khi expand = BẢNG RIÊNG nhúng (tách hẳn khỏi bảng chính)

User: con (HCAO3GHI…) nhìn GIỐNG SP standalone (HCMMXC3) → khó phân biệt; muốn expand ra con **tách biệt hẳn**, "có thể làm bảng riêng". → Khi expand, các CON render thành **1 BẢNG RIÊNG nhúng** trong 1 ô `colspan=12` (drawer `.w2p-child-drawer`): rãnh nền tím + thanh trái tím đậm 6px + thụt 46px; header "🌿 N biến thể con của <tên>"; bảng con `.w2p-child-table` = card trắng viền tím + bo góc + shadow, có thead riêng (Ảnh/Mã/Biến thể-Tồn/Giá mua/Giá bán/Địa danh/Trạng thái/Thao tác). Mỗi con đủ checkbox + nút Sửa/In/Tạm dừng/Lịch sử/Xóa (dùng chung helper `_statusBadgeHtml`/`_rowActionsHtml` tách từ `_rowHtml`). Dòng CHA vẫn bình thường. `_updateRowInPlace` guard: con trong drawer → full reload (tránh vỡ bảng con). Bump `render/css=p8`.
(p6 tô cả nhóm = sai; p7 con tách kiểu dòng nhạt vẫn lẫn; p8 = bảng riêng rõ hẳn.)

## 2026-06-27

### [so-order] Gom SP cha nhiều biến thể: tên cha hiện 1 lần, biến thể "↳" thụt khối

**Files:** `so-order/js/so-order-render.js`, `so-order/css/so-order.css`, `so-order/index.html`.

Các dòng biến thể CÙNG SP trong 1 đơn (vd ÁO SƠ MI LỤA: Màu Ghi + Màu Đỏ) gom 1 khối: dòng đầu hiện TÊN cha, dòng tiếp hiện **"↳"** thay tên lặp (vẫn giữ mã con + biến thể riêng). Thanh dọc tím ở cột Tên SP gom khối + viền đáy đậm đóng nhóm.

- `_computeRowSpans` thêm pass đánh dấu `nameHead`/`nameCont`/`nameLast`: gom theo `productGroupId` (P3) fallback CÙNG TÊN, TRONG CÙNG `invoiceGroupId`, chỉ khi nhóm ≥2. Độc lập với rowspan NCC/Ảnh-HĐ sẵn có.
- `rowHtml`: VIEW mode → dòng cont hiện "↳" + class `so-vargroup-*`. EDIT mode KHÔNG đổi (mỗi biến thể vẫn ô tên editable riêng). Receive/inline-edit không ảnh hưởng (chỉ đổi hiển thị tên view).
- Bump `so-order-render.js` + `so-order.css` = `20260627p4`.

### [web2/products] P4 — Kho SP gom SP CHA–CON: dòng cha + mã cha + expand sửa con

**Files:** `web2/products/js/{web2-products-render.js,web2-products-state.js,web2-products-app.js}`, `web2/products/css/web2-products.css`, `web2/products/index.html`.

SP cùng cha/cùng tên nhiều biến thể (vd ÁO SƠ MI LỤA: Màu Ghi + Màu Đỏ) gom thành **1 dòng CHA**, expand xem CON. Dùng `Web2VariantGroup.group(items,{by:'parent'})` — parent_code khi có, fallback name+supplier+region (data hiện tại phẳng), GIỮ thứ tự gốc bảng (sort theo vị trí xuất hiện đầu, KHÔNG theo tên).

- **Dòng CHA** (`_parentRowHtml`): cột BIẾN THỂ liệt kê mọi biến thể + tổng tồn; TRẠNG THÁI gộp (CHỜ HÀNG ×Σpending / Đang bán / Mua 1 phần); nút chevron expand. SP 1 biến thể/standalone → dòng thường.
- **Mã CHA ra cột MÃ SP**: `parent_code` thật, fallback tiền tố CHUNG dài nhất các mã con (HCAO3GHI+HCAO4DO→`HCAO`; HCQUAN2JT2+HCQUAN3SH29→`HCQUAN`), min 3 ký tự; kèm nhãn "N biến thể" nhỏ dưới.
- **CON tách biệt** (`.is-child` + `.is-child-first/last`): thanh dọc tím trái, nền tím nhạt, viền dashed giữa con, viền đậm đóng khối; thụt lề + ↳. Nối liền cha→con khi mở (bỏ viền đáy cha).
- **Sửa từng con**: dòng con là SP thật → giữ nguyên nút Sửa/In/Xóa/Lịch sử (edit-per-child free). Checkbox CHA chọn cả nhóm. Expand state `STATE.expandedParents` (Set).
- Thêm `web2-variant-group.js` vào HTML; bump `state/app=p4`, `render/css=p5`.

### [web2/live-tv + shared] "SẮP HẾT" tỉ lệ + biến thể dài không bị cắt "..." trên TV

**Files:** `web2/shared/web2-live-tv-display.js`, `web2/live-tv/{css/live-tv.css,index.html}`, `web2/live-control/index.html`.

- **"SẮP HẾT" theo TỈ LỆ** (tùy tình hình), bỏ số cứng CÒN≤5: nay `low = đã bán (GIỎ>0) & CÒN ≤ max(1, round(NCC×0.3))`. Vd NCC 6 → ngưỡng 2 → CÒN 4 (67%) KHÔNG sắp hết (trước báo nhầm), CÒN ≤2 mới sắp hết. `LOW_THRESHOLD`→`LOW_RATIO=0.3` (single source `cardState`, dùng chung live-tv badge + live-control mini-preview).
- **Biến thể dài đọc được trên TV**: `.ltv-vlabel` bỏ `nowrap/ellipsis` 1 dòng → cho xuống tối đa 2 dòng (`-webkit-line-clamp:2`), giữ font lớn. Vd "Màu Xám Chuột / Size 43" không còn bị "...".
- Bump `v=20260627tv12` (display.js + live-tv.css). Đổi nhãn chip `KH theo`→`MỚI theo` (commit trước).

### [web2/live-control] Địa danh KH pre-order chỉ admin chỉnh được + cảnh báo khi đổi

**Files:** `web2/live-control/{js/live-control.js,index.html,css/live-control.css}`, `render.com/routes/web2-campaign-products.js`.

User: "KH theo" (địa danh pre-order) mặc định HƯƠNG CHÂU, chỉ admin chỉnh được + warning khi chỉnh.

- **Mặc định HƯƠNG CHÂU** (đã có sẵn trong state + loadTvControl fallback).
- **Chỉ admin**: `isAdmin()` (Web2Perm.isAdmin, fallback session) → non-admin select `#lcRegion` `disabled`+`.is-locked`+tooltip "🔒 Chỉ admin được đổi địa danh KH". Thêm `web2-perm.js` vào HTML.
- **Cảnh báo khi đổi** (admin): `Popup.confirm` nút đỏ "Đổi địa danh" — giải thích địa danh quyết định vùng nào được ĐẶT VƯỢT NCC (badge VƯỢT) + tính CÒN + áp ngay màn TV. Huỷ → select revert về `state.tvControl.region` (đọc state, không snapshot — phòng SSE đổi region lúc dialog mở).
- **Defense-in-depth server**: PATCH `/control` BỎ QUA field `region` nếu requester không phải admin (`req.web2User.role`), nhưng VẪN cho non-admin (operator live) đổi rows/cols/page — không reject cả request.
- Verify: browser admin (enabled + popup + revert) + staff (disabled + locked). Code-review APPROVE 0 CRITICAL/HIGH. Bump `v=20260627tv11`.

### [web2/live-control + live-tv] Gom SP CHA–CON nhiều biến thể thành 1 card (by:'parent')

**Files:** `web2/shared/web2-variant-group.js`, `web2/live-control/{js/live-control.js,index.html}`, `web2/live-tv/{js/live-tv.js,index.html}`, `render.com/routes/{web2-campaign-products.js,web2-products.js}`.

User: SP cùng sản phẩm cha + nhiều biến thể → màn TV (hình 1) + board điều khiển (hình 2) phải gom 1 card nhiều biến thể (vd ÁO SƠ MI LỤA Màu Ghi + Màu Đỏ đang là 2 card riêng → 1 card 2 dòng biến thể).

- **`Web2VariantGroup` thêm mode `by:'parent'`**: key = `parent_code` khi có (cha-con thật Migration 070, 100% chuẩn) → fallback `name+supplier+region` cho SP phẳng/legacy (data hiện tại CHƯA có parent_code: HCAO3GHI/HCAO4DO là 2 SP phẳng cùng name+NCC+HƯƠNG CHÂU). Region trong key ⇒ **không tái phát bug 2026-06-25** (QUẦN SHORT KAKI HƯƠNG CHÂU vs HÀ NỘI vẫn tách). Dòng `is_parent` (aggregate) bị BỎ khi gom (tránh double-count tồn).
- **Backend campaign route** `web2-campaign-products.js`: list trả thêm `parentCode`/`isParent`; `autoSyncPending` thêm `AND is_parent = false` (không auto-add dòng CHA aggregate lên board). **`web2-products.js`** pending endpoint thêm `AND is_parent = false`.
- live-control (board + picker pending + picker all) + live-tv reload đổi `by:'code'` → `by:'parent'`. Hạ tầng board/card/ops (up/down/pin/✕ + NCC edit per-biến-thể) đã iterate `g.variants` sẵn → gom "just works".
- Bump cache-bust `v=20260627tv10`. Status: ✅ FE live khi refresh; BE deploy web2-api (auto).

### [gemini-tryon] Research GitHub gemini_webapi image-gen + fix (model Flash + watchdog_timeout)

User: ưu tiên model Flash ở cookie → xoay tua → fail fallback Nano Banana; rồi research GitHub. **Workflow research 4 agent** (issues HanaokaYuzu/Gemini-API): **nguyên nhân gốc** "limit resets" KHÔNG phải hết quota (nếu hết thật → ném `UsageLimitExceeded`) mà **route SAI MODEL** (default UNSPECIFIED không bật image tool → Gemini trả text từ chối) — issue #204/#252/#332. **Fix áp dụng**: (a) ép model `gemini-3-flash` (BASIC_FLASH, #252) + fallback auto nếu phiên không khớp; (b) `client.init(watchdog_timeout=max(GEN_TIMEOUT,300))` — ảnh gen >120s bị watchdog mặc định giết (#294/PR#301), truyền phòng thủ try/except TypeError; (c) GEN_TIMEOUT 150→200, frontend timeout 180s→240s; (d) prompt có "generate" (đã có). **Kết luận research**: free cookie ảnh = best-effort, Google anti-automation (#250/#318) → KHÔNG ổn định lâu dài, đổi model là gãy; **production nên dùng Nano Banana TRẢ PHÍ** (đã có fallback tự động). Không lib free nào tốt hơn (alt #57 broken). Bump `web2-tryon.js?v=20260627k`. ⚠ Máy shop reinstall để test fix.

### [web2/live-control + live-tv] Mô hình GIỎ·MỚI + badge VƯỢT theo địa danh pre-order

**Files:** `web2/live-control/{js/live-control.js,css/live-control.css,index.html}`, `web2/live-tv/{js/live-tv.js,css/live-tv.css,index.html}`, `web2/shared/web2-live-tv-display.js`, `web2/shared/web2-variant-group.js`, `render.com/routes/web2-campaign-products.js`.

Chốt mô hình cột bảng điều khiển live + màn TV: **NCC | GIỎ | MỚI | CÒN**.

- **GIỎ** = tổng SL món khách đặt (1 KH đặt 2 món → GIỎ +2). **MỚI** = SL món của khách CHƯA có SĐT & địa chỉ (1 phần con của GIỎ, để theo dõi). **CÒN** = `max(0, NCC − GIỎ)` (không âm).
- **Địa danh pre-order**: setting "📍 KH theo" (Hương Châu mặc định / Hà Nội…). SP thuộc địa danh đang chọn → GIỎ được phép vượt NCC → badge **"VƯỢT +N"** đỏ trên cột GIỎ (cả board lẫn TV), CÒN vẫn = 0 (không âm).
- Backend aggregate: `new_cust` = `SUM(quantity) FILTER (WHERE phone='' AND address='')` (đổi từ COUNT DISTINCT → SUM SL); bỏ `all_cust`.
- `khConModel(v, region)` 1 nguồn ở `web2-live-tv-display.js` → `{ncc, gio, moi, con, vuot, isPreOrder}` dùng chung board / TV / mini-preview (tránh drift).
- Bump cache-bust `v=20260627tv9`. Status: ✅ deployed (backend đã ở HEAD trước), FE live ngay khi refresh.

### [gemini-tryon + web2/ai-hub] Admin chọn nguồn tạo ảnh (account cụ thể / Nano Banana paid)

User "admin cho chọn account banana". Thêm **selector nguồn CHỈ admin** trong tab Ghép đồ (`.w2t-src`): "🔄 Tự động (xoay tua free)" · "👤 <account> · N ảnh" (từng account của máy shop, lấy từ /health) · "🍌 Nano Banana TRẢ PHÍ". Nhân viên KHÔNG thấy selector → luôn free auto (không lỡ tay tốn tiền). `isAdmin()` (Web2Perm.isAdmin fallback session role). **Sidecar `app.py`**: `/tryon` + `/generate` nhận `account` (label) → `_run_gemini(account=)` chỉ dùng account đó (admin né account full/lỗi). `run()` route: paid→callPaidNano, acc:<label>→callGeminiMachine(acc), auto→xoay tua. Bump `web2-tryon.js?v=20260627i`. ⚠ Máy shop reinstall để nhận app.py mới.

### [web2/products] P1 — SP CHA–CON (biến thể): schema + mã cha/con + API + đồng bộ tồn cha

Feature lớn 4 phase (plan `~/.claude/plans/jaunty-munching-llama.md`): SP nhiều biến thể → 1 CHA (mã gốc, tồn=tổng) + N CON (mã cha+biến thể, SL riêng). Quyết định user: **mã con = mã cha + viết tắt biến thể** (HCAO→HCAOGHI/HCAODO); **cha là dòng THẬT** trong DB. **P1 = backend** (additive, an toàn — SP cũ phẳng không đổi).

**`render.com/routes/web2-products.js`:**

- Migration 070: `parent_code VARCHAR(40)` + `is_parent BOOLEAN` + index. `mapRow` trả `parentCode`/`isParent`.
- `/list`: thêm `?topLevel=1` (chỉ CHA + standalone, ẩn con — cho bảng Kho SP) + `?parentCode=X` (con của 1 cha, lazy expand). Mặc định trả TẤT CẢ → `Web2ProductsCache` + matching KHÔNG đổi.
- `/upsert-pending`: item con có `parentCode` → tự tạo dòng CHA (`ON CONFLICT DO NOTHING`, is_parent) + con (`parent_code`); match con loại trừ `is_parent=false` (cha variant=NULL không "ăn" nhầm con).
- `_recomputeParent(pool,parentCode)` = tồn/pending/status cha = TỔNG con; gọi sau create/upsert/confirm-purchase(-partial)/adjust-stock/adjust-pending/PATCH/delete. Xoá con cuối → xoá cha; xoá cha → cascade xoá con. Mọi match con (`upsert-pending`, `adjust-pending`) thêm `is_parent=false`.

**`web2/shared/web2-product-code.js`:** `parentBaseCode(opts)` (prefix+type+counter, bỏ màu/size) + `childCode(parent,color,size,existing)` (cha+biến thể, hậu tố số nếu trùng). **`web2-products-api.js`:** `list({topLevel})` + `listChildren(parentCode)`.

**Verify:** node unit `parentBaseCode/childCode` → HCAO/HCAOGHI/HCAODO ✅. **Deploy web2-api LIVE → API round-trip ALL PASS**: upsert-pending tạo cha+2 con; cha pending=6 (=tổng); `?topLevel=1` ẩn con; `?parentCode` trả 2 con; confirm-purchase 1 con → cha stock=3/pending=3/MUA_1_PHAN; xoá cha cascade con. Status: ✅

### [web2/shared] P2 — Web2VariantPicker: nhập SL TỪNG biến thể (withQty)

`web2-variant-picker.js`: option `withQty:true` → khi 1 món tách >1 biến thể (cartesian "/") → render ô **SL cho mỗi biến thể** + tổng realtime (`.w2vp-qty`). API thêm `getVariantQtys()`→`[{variant,qty}]`, `getTotalQty()`; onChange payload thêm `variantQtys`+`totalQty`. Đổi SL KHÔNG re-render (giữ focus). `opts.qty` = SL mặc định mỗi biến thể. Set/1-biến-thể → không hiện ô SL. Status: ✅ (test e2e ở P3)

### [gemini-tryon + web2/system] Dashboard giám sát máy + tunnel TỰ HỒI SINH (fix tunnel chết vẫn báo online)

Đọc tab `web2/system?tab=services`. Thêm **thẻ "Máy Gemini try-on"** (`system-services.js renderGeminiMachines` + section HTML + `sdGeminiMachines`): client-side dò registry `?engine=gemini-tryon` → fetch `/health` từng máy → hiện account (uses, cooling, `lastError`), online/offline. **Phát hiện bug thật qua dashboard**: máy shop vẫn heartbeat (registry "1s trước") NHƯNG tunnel `catherine-ride...` đã chết (curl /health fail) → request rớt = "lâu lâu lỗi". **Fix `serve.py`**: `_tunnel_loop` đọc liên tục stdout cloudflared (drain + lấy URL) → cloudflared rớt thì **tự khởi động lại + lấy URL mới**; `_heartbeat()` đọc `_tun["url"]` hiện tại, tunnel chết (None) thì **NGỪNG báo** → registry tự xoá (TTL 90s) → không còn URL chết; interval 30s→15s (URL mới lên sớm). **Verify Mac**: tunnel lên → kill cloudflared → log "RỚT → khởi động lại" → lên URL mới (`outreach...`→`fundamentals...`). Bump `system-services.js?v=20260627gmon`. ⚠ Máy shop reinstall để nhận serve.py mới.

### [web2/live-control + live-tv] Địa danh pre-order: KH MỚI → KH (vượt NCC được + báo hiệu)

User: thêm chọn ĐỊA DANH (Hương Châu/Hà Nội). SP đúng địa danh chọn → cột "KH MỚI" thành "KH" (đếm TẤT CẢ khách), được VƯỢT NCC (số KH đỏ + badge "VƯỢT +N", CÒN = 0). Mặc định Hương Châu.

Chốt công thức (user): **CÒN = max(0, NCC − GIỎ − [KH MỚI | KH])**; chế độ KH thì KH cộng vượt được, vuot = max(0, GIỎ + KH − NCC).

- **Backend** (`web2-campaign-products.js`): aggregate thêm `all_cust` (COUNT DISTINCT khách, không lọc) = KH; `web2_live_tv_control` thêm cột `region` (default 'HƯƠNG CHÂU'); `/control` GET/PATCH thêm `region`.
- **Shared** (`web2-live-tv-display.js`): `khConModel(v, region)` = NGUỒN DUY NHẤT (isKhMode/khLabel/khCount/con/vuot) dùng chung board + TV + preview → không lệch. cardState thêm allCust. variant-group propagate allCust/totalAllCust.
- **live-control**: vrowHtml dùng khConModel (SP đúng địa danh → "KH" đếm allCust, vượt → số đỏ + badge "VƯỢT +N"); selector "📍 KH theo" trong panel; load/save/SSE region → renderBoard; mini-preview CÒN theo công thức mới.
- **live-tv**: variantRowHtml CÒN dùng khConModel (khớp board); control + SSE thêm region.

Phạm vi (Q2): chỉ SP đúng địa danh dùng "KH"; SP khác giữ "KH MỚI". Verify SQL: region migration idempotent, all_cust=3/new_cust=1/sold=6 ✅. node --check 6 file ✅. Cache-bust `tv7`. ⚠ Lưu ý double-count tiềm năng: GIỎ=tổng SL (gồm cả khách này), KH=đầu khách → 1 khách trừ 2 lần (theo đúng công thức user); chờ user soát số thật.

### [native-orders] Picker + lọc chiến dịch cha: dùng listAssignments() (đồng nhất live-chat)

Nối tiếp fix live-chat: native-orders cũng có 2 chỗ comment-driven gây sai với live cũ / web2-api.

- **`selectParentCampaign()`** (lọc đơn theo chiến dịch cha): resolve `parentPostIds` từ `listPosts()` (`/posts` driven `web2_live_comments`) → bài cũ hết comment bị mất khỏi tập → `fbPostIds` thiếu → **lọc đơn theo nhóm bị sót đơn**. Đổi sang `listAssignments()` (bảng `web2_live_post_assign`, độc lập comment) + fallback `listPosts()` deploy gap.
- **`loadPagePosts()`/`renderPagePosts()`** (picker gán bài): post-list từ `listPagePosts()` (`/page-posts`, poller trả **0 bài trên web2-api** → picker rỗng). Giờ merge: trạng-thái-gán lấy từ `listAssignments()`, và **bổ sung bài ĐÃ GOM** mà page-posts không trả (live cũ / poller 0) để vẫn gỡ/đổi được.
- Cache-bust `native-orders-filters-campaigns.js?v=20260627camp`.

Status: ✅ code + syntax OK, chờ web2-api deploy `/assignments`.

### [live-chat] Fix picker "Chiến dịch cha": live CŨ hiện "chưa gom" dù đã gom

User: "sao hình 2 tôi không gán được chiến dịch cha?" (live-chat). Live 27/06 gán OK, live 26/06 chọn xong nhảy về "— chưa gom —".

**Root cause** (bug HIỂN THỊ, không phải bug lưu): `_render()` (live-campaign-manager.js) xây `assignMap` từ `Web2Campaign.listPosts()` → `GET /posts`, mà `/posts` **driven bởi `FROM web2_live_comments`** (chỉ post CÒN comment). Live mới → comment còn → dropdown đúng; live cũ → comment aged/pruned khỏi `web2_live_comments` → post KHÔNG có trong `/posts` → `assignMap` thiếu → dropdown về "chưa gom". Gán vẫn LƯU (`web2_live_post_assign`, nên campaign vẫn đếm "2 bài" qua `COUNT(DISTINCT a.post_id)`), chỉ UI mất trạng thái → tưởng "không gán được".

**Fix**: lấy trạng-thái-gán từ **bảng-sự-thật `web2_live_post_assign`**, độc lập comment.

- **Backend** `web2-live-comments.js`: thêm `GET /assignments` → `[{post_id, campaign_id, post_title, page_id}]` từ `web2_live_post_assign WHERE campaign_id IS NOT NULL`.
- **Shared** `web2/shared/web2-campaign.js`: thêm `Web2Campaign.listAssignments()`.
- **live-chat** `_render()`: `assignMap` từ `listAssignments()` (fallback `listPosts()` nếu backend chưa deploy `/assignments`).
- Cache-bust `?v=20260627camp` (live-campaign-manager.js + web2-campaign.js ở live-chat/native-orders/live-tv/live-control).

Status: ✅ code + syntax OK. Chờ web2-api redeploy (`/assignments`) — trước deploy fallback giữ hành vi cũ, không regression.

### [web2/live-control] Fix avatar giỏ khách: dựng URL qua worker /api/fb-avatar (id+page)

User "chưa thấy avatar". Đọc module live-chat: avatar KH dựng bằng `SharedUtils.getAvatarUrl(fbId, pageId, ...)` → worker `/api/fb-avatar?id=<fbId>&page=<pageId>` (Pancake `pages/{page}/avatar/{fbId}` → ảnh thật, fallback Graph → SVG default). `web2_live_comments.avatar` LUÔN null (poller không lưu) nên JOIN không đủ — phải dùng fb-avatar proxy.

**Quan trọng**: proxy chỉ trả ảnh thật khi `page` = page KH là contact Pancake. Test: fbId Minh Minh ra SVG 215B trên page sai, **jpeg 3029B trên page 117267091364524** (page comment của họ).

- **Backend** `/cart-detail`: thêm `n.fb_page_id` + lấy `page_id` từ JOIN `web2_live_comments` → trả `fbPageId` (ưu tiên page comment, fallback page đơn).
- **Frontend** `cartAvatarUrl(it)` (mirror getAvatarUrl): hash pancake → content.pancake.vn; else `fbId`+`page` → worker fb-avatar; onerror → fallback chữ cái.

Verify browser: 2 avatar `loaded:[true,true]` naturalWidth 100×100 (ảnh thật, screenshot xác nhận Minh Minh + Lisa Trang ảnh FB thật). Cache-bust `tv6`.

### [web2/live-control] Popup giỏ khách: thêm AVATAR + COMMENT livestream (như live-chat)

User: coi được comment + avatar như live-chat. → enrich popup GIỎ/KH MỚI: mỗi KH hiện avatar + bình luận livestream.

- **Backend** (`/cart-detail`): sau khi lấy đơn draft, JOIN `web2_live_comments` theo `fb_id` (DISTINCT ON fb_id, comment mới nhất) → gắn `avatar` + `comment` mỗi KH. Defensive try/catch (bảng thiếu → bỏ qua, vẫn trả list).
- **Frontend** (`cartRowHtml`): avatar tròn 38px (fallback chữ cái đầu nếu lỗi/không có, `referrerpolicy=no-referrer` cho FB CDN) + comment trong khung quote `.lc-cart-comment` (line-clamp 3).
- Cache-bust `tv5`.

Status: ✅ code + syntax OK, chờ deploy verify.

### [web2/live-control] Bấm GIỎ / KH MỚI ở board → popup chi tiết giỏ khách

User: bấm số GIỎ / KH MỚI xem được thông tin (ai đang có SP trong giỏ).

- **Backend** (`web2-campaign-products.js`): `GET /cart-detail?code=X` — liệt kê đơn `native_orders` status='draft' chứa SP (GROUP theo đơn, SUM qty); mỗi dòng có customerName/phone/address/fbName/qty + `isNewCust` (chưa SĐT & địa chỉ). Khớp ĐÚNG nguồn GIỎ/KH MỚI ở GET /.
- **Client** (`web2-campaign.js`): `getCartDetail(code)`.
- **live-control.js**: span GIỎ + KH MỚI thành `.lc-clickable` (khi >0) với `data-cart`/`data-cart-mode`; bấm → `openCartDetail(code, mode)` mở popup (dùng class shared `.w2p-overlay/.w2p-card/.w2p-scroll-area` của popup.js — anti-lag sẵn). mode 'new' lọc KH chưa có SĐT&địa chỉ. Mỗi dòng: tên KH + STT + SĐT/badge "KH mới" + địa chỉ + SL.
- **CSS**: `.lc-cart-*` list rows + `.lc-clickable` hover. Cache-bust `tv4`.

Status: ✅ code + syntax OK, chờ deploy Render verify.

### [gemini-tryon] temporary mode (đỡ rác hội thoại) + log lỗi từng account (debug "1 acc full, 4 acc 0%")

User: sidecar tạo nhiều hội thoại trong lịch sử Gemini; và 1 account bị full còn 4 account khác 0% dù account nào cũng tạo ảnh được bằng tay → nghi LỖI SIDECAR hoặc Google giới hạn theo IP (1 máy 1 IP, hết ngạch ảnh của IP thì mọi acc trên máy đó bị "limit reset"). Thêm để chẩn đoán: (1) `generate_content(temporary=True)` → không lưu hội thoại vào history (đỡ rác + đỡ lộ automation; env `GEMINI_TEMPORARY=0` để tắt). (2) Mỗi account lưu `last_error` (lỗi lần tạo ảnh gần nhất) + log `[gen] account 'X' …` ra gemini-tryon.log; hiện `lastError` trên trang cấu hình + /health. ⚠ Máy shop reinstall để nhận. Bước tiếp: user test 1 acc "0%" NGAY TRÊN MÁY SHOP (cùng IP) — fail = giới hạn IP (xoay acc 1 máy vô ích, cần nhiều IP/máy); OK = lỗi sidecar.

### [web2/live-control] Đổi chỗ banner hint ↔ panel điều khiển TV

User: đổi vị trí hint (banner cam) và panel "📺 Điều khiển màn TV". → panel điều khiển TV lên TRÊN (ngay sau header), hint xuống DƯỚI cùng. Chỉ chỉnh CSS `order`: `.lc-tvctl{order:1}` `.lc-cols{order:2}` `.lc-hint{order:3}`. Verify browser: tvTop 61 < colsTop 390 < hintTop 1211 ✅. Cache-bust css `tv3`.

### [web2/live-control] Fix scroll cả trang + đẩy panel "Điều khiển màn TV" xuống dưới

User: (1) không scroll được, (2) chuyển panel điều khiển TV xuống dưới.

**Root cause scroll**: `.main-content` = `height:100vh; overflow:hidden` → không cuộn; `.lc-root` không phải scroll container nên nội dung dài (board + panel TV) bị cắt. `.lc-board/.lc-picker` lại `overscroll-behavior:contain` → wheel bị "kẹt" trong pane.

**Fix** (chỉ CSS, không đụng HTML):

- `.lc-root` → `display:flex; flex-direction:column; flex:1; min-height:0; overflow-y:auto` = scroll container của trang; `.lc-root > * { flex-shrink:0 }` giữ chiều cao con (không co).
- `.lc-tvctl { order:10 }` → đẩy XUỐNG DƯỚI (sau `.lc-cols`) mà không phải di chuyển 55 dòng HTML; margin-top thay margin-bottom.
- `.lc-board/.lc-picker`: bỏ `overscroll-behavior:contain` (wheel hết pane lan ra cuộn cả trang), max-height 230→200.

**Verify browser**: `rootCanScroll:true` (scrollH 1322 > clientH 900); panel TV `order:10`, `tvTop 958 > colsTop 137` (dưới board); screenshot cuộn xuống thấy panel "📺 Điều khiển màn TV" + mini-preview ở đáy. Cache-bust css `tv2`.

### [gemini-tryon] Test thật try-on (1.jpg+2.jpg) → free hết lượt, fallback paid + fix cooldown "limit resets"

Browser-test như user thật: upload 1.jpg (người) + 2.jpg (quần áo) → bấm Ghép đồ → đọc network/console. KẾT QUẢ: pipeline ĐÚNG, 0 console error, ảnh 896×1152 render. NHƯNG: network cho thấy `/tryon` máy shop 37s + `web2-ai/image` (paid) 13.7s; `uses=0` cả 5 account → **ảnh thực tế do NANO BANANA TRẢ PHÍ tạo** (free fail → fallback). Lỗi free: "Tất cả account lỗi/hết lượt — I can create more images as soon as your limit resets" = **5 account Gemini đều HẾT LƯỢT ảnh free/ngày**. Fix `app.py`: `_QUOTA_RE` thêm "limit reset|create more images|check your usage" → account hết lượt vào cooldown (không thử lại 37s/lần); `COOLDOWN_SEC` 3h→8h (free reset theo ngày). ⚠ Máy shop phải reinstall để nhận fix. Bài học: free Gemini image quota/ngày RẤT ÍT — 5 acc vẫn hết nhanh, hay rớt về paid.

### [web2/ai-hub + gemini-tryon] % tiến trình hiệu ứng + retry tunnel (fix "lâu lâu lỗi") + fix icon

User: thêm % tiến trình + chỉnh tốc độ; báo "lâu lâu bị lỗi" (log: ERR_NETWORK_CHANGED/502 trên tunnel `/tryon`, icon `wand-sparkles` not found spam console).

- **% tiến trình GIẢ LẬP**: model ảnh không trả % thật → helper `startFakeProgress` (bò tiệm cận tới ~95% rồi nhảy 100% khi xong). Hiện **% TO ở GIỮA vòng cầu vồng** (`.w2t-gen-pct`/`.aih-gen-pct`), bỏ icon sparkle giữa. Áp dụng `web2-tryon.js` (Ghép đồ) + `ai-image.js`+`ai-hub.css` (Tạo ảnh). **Tốc độ nhanh hơn**: ring 0.9s→0.8s, core to hơn (56-58px).
- **Retry tunnel** (`web2-tryon.js` callGeminiMachine): tunnel cloudflared chập chờn (ERR_NETWORK_CHANGED/502-504/fetch fail) → **retry 3 lần backoff 700ms** trước khi rớt Nano Banana; lỗi thật từ sidecar (`_final`, vd hết account) không retry → fallback luôn.
- **Fix icon**: `data-lucide="wand-sparkles"` (không có trong lucide 0.294.0) → `sparkles` ở `ai-hub`/`ai-photo`/`video-maker` index.html (hết spam console + toast lỗi).

Bump `web2-tryon.js?v=20260627g`, `ai-image.js?v=20260627gen2`, `ai-hub.css?v=20260627gen2`. Verify browser: card hiện "42%" giữa vòng cầu vồng + nút Tạo ảnh có ✨, screenshot OK.

### [web2/ai-hub] Hiệu ứng "AI đang tạo" cao cấp (Ghép đồ + Tạo ảnh)

User muốn hiệu ứng giao diện khi đang tạo ảnh (thay vòng xoay đơn giản). Thêm hiệu ứng card loading: nền gradient chuyển động (indigo→tím→hồng) + tia sáng quét (shimmer ::before translateX) + vòng cầu vồng conic-gradient (mask radial) + icon ✨/🧑‍🤝‍🧑/✂️ nhịp thở (scale+opacity) + chữ "..." động (steps content). Compositor-friendly (transform/opacity). Áp dụng cả `web2-tryon.js` (Ghép đồ/Ghép mặt, class `.w2t-gen-*`) lẫn `ai-image.js`+`ai-hub.css` (Tạo ảnh + tách nền, class `.aih-gen-*`). Bump `web2-tryon.js?v=20260627f`, `ai-image.js?v=20260627gen`, `ai-hub.css?v=20260627gen`. Verify browser: card render đẹp (gradient + ring cầu vồng + ✨), screenshot OK.

### [web2/live-control + live-tv] Điều khiển màn TV: phân trang + lật trang từ xa + mini-preview + cảnh báo màu

Feature theo yêu cầu user (điều khiển trang TV từ live-control cho người live xem):

**State per-campaign** (DB `web2_live_tv_control` + SSE `web2:live-tv-control`): `{rows, cols, page}`. Default **1×4** (4 SP/trang).

- **Backend** (`web2-campaign-products.js`): bảng `web2_live_tv_control` + `GET/PATCH /control?campaignId` (clamp rows 1..6, cols 1..10; upsert ON CONFLICT) + `_notifyTvControl` broadcast `web2:live-tv-control`. (Gộp vào route campaign-products vì cùng domain + notifier sẵn — không cần wire server.js.)
- **Client** (`web2-campaign.js`): `getTvControl` / `setTvControl`.
- **Shared 1 nguồn** (`web2/shared/web2-live-tv-display.js` MỚI = `Web2LiveTvDisplay`): `cardState` (ncc/sold/con/newCust + soldOut/low/hot), `orderForDisplay` (hết hàng dồn xuống cuối, ghim giữ đầu), `paginate`. Dùng CHUNG cho live-tv + mini-preview → KHÔNG drift.
- **live-tv**: phân trang `rows×cols` (mỗi trang lấp đúng 1 màn, không cuộn) + "Trang X/Y" + hiệu ứng slide khi đổi trang + subscribe `web2:live-tv-control` (lật trang realtime). **#5** viền cảnh báo: sắp hết (CÒN ≤ 5 vàng) · hot (KH mới ≥ 3 hồng) · hết hàng (mờ). **#6** SP hết hàng (CÒN ≤ 0) tự dồn cuối + làm mờ.
- **live-control**: khu "📺 Điều khiển màn TV" — ô **Hàng × Cột** (+ preset 1×4/2×3/2×4/3×4) + nút ⏮◀▶⏭ "Trang X/Y" + **mini-TV preview** (trang đang chiếu, card thu nhỏ NCC/GIỎ/CÒN, cùng cảnh báo màu) + **bàn phím ←/→/Home/End/Space**. Optimistic + SSE sync đa tab.

**Verify**: SQL test (DDL idempotent + upsert merge 1 dòng) ✅; `node --check` 4 file ✅; brace balance CSS ✅. Browser verify full-flow chờ deploy Render (localhost hit prod backend). Status: ✅ code xong, đang deploy.

### [gemini-tryon] Máy khác (nơi khác) dùng chung máy shop qua tunnel + registry — chọn máy KHỎE

User hỏi: thêm cookie ở máy shop (IP nhà) → máy shop giữ cookie + tunnel → máy khác bật là dùng được luôn? → **ĐÚNG, đã là kiến trúc sẵn có**: máy shop giữ `accounts.json` (cookie KHÔNG rời máy) + cloudflared tunnel + đăng ký `web2-vieneu-registry`. Máy khác: `Web2Tryon.discoverGemini()` dò localhost (không có) → hỏi registry → route try-on tới `<tunnel-máy-shop>/tryon` → máy shop xử lý bằng cookie của nó. **Cải tiến** `web2-tryon.js`: nhánh registry giờ **health-check từng máy qua tunnel + chọn máy có `readyCount>0`** (máy khác không route vào máy shop cookie hết hạn); fallback máy đầu nếu không xác nhận được. Bump `web2-tryon.js?v=20260627c`. (Registry chỉ lưu name/url/engine — KHÔNG lưu cookie; CORS sidecar `*` + tunnel https nên fetch cross-origin OK.)

**Bổ sung (v=20260627d)** — user hỏi "thêm account có phải chạy bat trên máy khác → trùng máy shop?": làm rõ CHỈ cài sidecar (bat option 4) trên **1 máy shop**; thêm account = dán cookie vào trang cấu hình của máy shop (không cài máy khác). Nút **"⚙️ Cấu hình account"** giờ trỏ động tới `<geminiUrl>/` (máy shop qua tunnel nếu ở máy khác, localhost nếu ở máy shop) → admin **thêm cookie từ BẤT KỲ máy nào** không cần ngồi máy shop. Cookie value không lộ qua API (`/accounts` chỉ trả label/status).

### [web2/live-control] Fix: hàng biến thể (NCC/Giỏ/KH mới/Còn) bị CẮT khi nhiều SP + nhãn GIỎ HÀNG→GIỎ

User báo board hiện 9 SP nhưng KHÔNG thấy hàng số NCC·GIỎ·KH MỚI·CÒN (chỉ thấy header). Debug live (browser-test localhost, eval computed style): hàng biến thể **CÓ trong DOM** (`vrows:9, vnums:27`) nhưng `.lc-group` cao 63px + `overflow:hidden` → bị **flexbox co lại** cắt mất.

**Root cause**: `.lc-board` là `display:flex; flex-direction:column; max-height; overflow-y:auto`. `.lc-group` mặc định `flex-shrink:1` → khi auto-add đẩy SP từ 3 → 9 (tràn khung), flex CO từng card → `overflow:hidden` cắt hàng biến thể. Bug latent từ trước, **auto-add làm lộ ra** (trước chỉ 3 SP nên vừa khung, không co). KHÔNG phải lỗi đổi nhãn.

**Fix**: `.lc-group { flex-shrink: 0 }` (+ `.lc-pitem` phòng tương tự) → board scroll, card giữ nguyên cao. Verify browser: group 63px→105px, `vrowVisible:true`, screenshot rõ NCC·GIỎ·KH MỚI·CÒN từng dòng.

**Kèm theo** (user yêu cầu): nhãn cột `GIỎ HÀNG → GIỎ` (live-control + live-tv) + banner. Cache-bust JS `lc2`, CSS `lc2`.

⚠ User gặp lỗi do **cache trình duyệt cũ** (file JS/CSS mid-edit) — bump version + hard refresh là hết.

### [web2/live-control] Board: BÁN→GIỎ HÀNG · bỏ CỌC thêm KH MỚI · auto-add SP chờ hàng (mới nhất trên đầu)

User (xem trang `web2/live-control`) yêu cầu 3 đổi:

1. **Đổi nhãn cột `BÁN` → `GIỎ HÀNG`** (live-control + màn TV live-tv). Giá trị KHÔNG đổi (`v.sold` = SL trong giỏ KH draft).
2. **Bỏ cột `CỌC`, thêm cột `KH MỚI`** = số khách MỚI (giỏ draft có **cả** SĐT LẪN địa chỉ trống) đang giữ SP đó. BE trả `newCust` thay `coc`; đếm `COUNT(DISTINCT COALESCE(NULLIF(fb_user_id,''), id)) FILTER (phone='' AND address='')`. CÒN = max(0, NCC − Giỏ hàng) giữ nguyên. (CHỈ live-control, KHÔNG thêm KH MỚI trên TV.)
3. **Auto-add**: SP chờ hàng (`web2_products` status='CHO_MUA' AND pending_qty>0 — khớp picker `/pending`) tự lên board, **mới nhất (updated_at DESC) trên cùng**, không cần bấm. ✕ xoá = **soft-delete** (cột mới `removed`, tombstone) → auto-sync KHÔNG tự thêm lại; `+ Thêm` tay = UPSERT un-tombstone lên đầu. `GET /?…&sync=1` (chỉ live-control gửi; TV read-only) chạy `autoSyncPending` rồi list `removed=false`; insert → `_notify('auto-add')` → SSE `web2:campaign-products` (cho TV + tab khác).

**Files**:

- `render.com/routes/web2-campaign-products.js`: migration `ADD COLUMN removed` (idempotent); `mapItem` coc→newCust; helper `autoSyncPending` (pending LIMIT 300, prepend sort = MIN−len); GET sync+`removed=false`+aggregate `new_cust`; POST prepend-top + `ON CONFLICT DO UPDATE` un-tombstone; DELETE → `removed=true`; reorder/pin thêm guard `removed=false`.
- `web2/shared/web2-variant-group.js`: thêm `newCust`/`totalNewCust` per-variant + emit group (giữ `coc` legacy).
- `web2/shared/web2-campaign.js`: `listProducts(campaignId,{sync})` → `&sync=1`.
- `web2/live-control/js/live-control.js`: `vrowHtml` nhãn + `v.newCust` (class `lc-vkhm`); `loadBoard` truyền `{sync:true}`.
- `web2/live-control/css/live-control.css`: `.lc-vnum` min-width 50px + `small` nowrap 8.5px; `.lc-vcoc`→`.lc-vkhm` (tím #7c3aed).
- `web2/live-tv/js/live-tv.js`: nhãn BÁN→GIỎ HÀNG. index.html (cả 2): banner + cache-bust `v=20260627lc`.

**Verify**: throwaway PG test — migration 2 lần idempotent ✅; pending newest-first ✅; auto-sync chỉ thêm SP chưa có + bỏ tombstone ✅; aggregate sold=12/new_cust=2 (dedup) ✅; soft-delete + re-add lên top ✅. JS `node --check` OK. Code-review (1 HIGH thật đã fix: thiếu emit `totalNewCust`; + hardening LIMIT/guard/min-width). Không consumer nào đọc `web2_campaign_products` thiếu filter `removed`. Status: ✅ code xong, chờ deploy Render (web2-api) + verify prod.

### [gemini-tryon] Fix THẬT: UnicodeEncodeError cp1252 trên Windows → crash dòng print đầu

Debug log (vừa thêm) bắt được lỗi thật từ máy shop Windows: `UnicodeEncodeError: 'charmap' codec can't encode character '▶'`. Windows redirect stdout ra file dùng encoding **cp1252** → `print` ký tự Unicode (▶ 👕 ═ + tiếng Việt có dấu) crash NGAY dòng đầu → serve.py chết → 8131 không lên. **Fix**: ép UTF-8 — `serve.py` + `app.py` thêm `sys.stdout/stderr.reconfigure(encoding='utf-8', errors='replace')` (guarded); `start.cmd` (PS1) thêm `set PYTHONIOENCODING=utf-8` (phủ cả tiến trình uvicorn con). **Verify**: giả lập `PYTHONIOENCODING=cp1252` + redirect file trên Mac — không fix → crash đúng lỗi user; có fix → in ▶👕✅+tiếng Việt OK, exit 0. **Bổ sung**: (a) `serve.py` bắt output uvicorn qua PIPE + pump (`[uvicorn] ...`) — trước `pythonw`+handle-inherit Windows làm MẤT log uvicorn (user chỉ thấy 2 dòng serve.py); giờ thấy trọn kể cả uvicorn crash. (b) Mojibake `â–¶ Khá»Ÿi` = log UTF-8 đọc bằng cp1252 → PS1 `Get-Content -Encoding UTF8` + `[Console]::OutputEncoding=UTF8`. Verify Mac (cp1252): log đủ `[uvicorn] Application startup complete`, 8131 lên 4s.

### [gemini-tryon] Thêm DEBUG (máy shop báo "cài xong nhưng 8131 không lên")

Máy shop Windows cài bộ [4] → "báo thành công" nhưng `localhost:8131` không vào được (nghi tải `app.py` CŨ từ github.io — CDN GitHub Pages cache chậm, bản cũ init chặn → treo startup). Thêm debug để nhìn lỗi thật thay vì đoán:

- **`gemini-tryon-windows-setup.ps1`**: launcher `start.cmd` thêm `PYTHONUNBUFFERED=1` + **redirect output → `gemini-tryon.log`** (trước `pythonw` nuốt hết). Sau khi start, **health-check `localhost:8131/health` tối đa 30s**; nếu KHÔNG lên → **in 30 dòng cuối log ra cửa sổ bat** + đường dẫn log. Kill instance cũ mở rộng (match `$DIR` → diệt cả `pythonw serve.py` treo giữ cổng, chống kẹt 8131 khi cài lại).
- **`app.py`**: endpoint **`GET /debug`** (Python ver, platform, import + version 5 lib gemini_webapi/fastapi/uvicorn/browser_cookie3/certifi, cookie_source, accounts). Trang cấu hình `/` thêm card **"🔧 Chẩn đoán máy chủ"** (auto load /debug 8s/lần).
- **`web2-pos-installer.js`** (`cai-may-pos.bat` :GEMINI): echo block DEBUG trỏ log path + trang chẩn đoán.

**Verify máy này**: `/debug` trả Python 3.12.8 + 5 lib ✅; trang `/` có mục Chẩn đoán; bat có block DEBUG + log path. **Lưu ý deploy**: nhijudy.store đã current, github.io CDN còn cache bản cũ (~10') → máy shop nên cài từ **nhijudy.store** hoặc chờ CDN refresh.

### [gemini-tryon] Fix: server kẹt khởi động khi cookie hỏng → cổng 8131 không lên

User "sao không vào được localhost 8131" → chạy thử LIVE trên máy thật, lòi ra **3 bug** (fix hết):

1. **`app.py` — server kẹt khởi động**: `lifespan` `await _init_pool()` chặn startup, cookie hỏng/mạng chậm → `GeminiClient.init()` treo → uvicorn kẹt "Waiting for application startup" → cổng 8131 không mở. Fix: init account chạy NỀN (`asyncio.create_task`) → server lên ngay; `_safe_build` bọc `asyncio.wait_for(INIT_TIMEOUT+10)`.
2. **`serve.py` — heartbeat SSL fail**: Python.org macOS thiếu cert store → `urllib` HTTPS `CERTIFICATE_VERIFY_FAILED` → heartbeat chết âm thầm (`except: pass`) → KHÔNG đăng ký registry (curl chạy vì dùng cert hệ thống). Fix: SSL context bằng `certifi` (fallback unverified).
3. **`serve.py` — heartbeat 403**: worker Cloudflare chặn UA mặc định `Python-urllib` (403). Fix: thêm `User-Agent: gemini-tryon/1.0`.

**Verify LIVE** (venv máy này): port 8131 lên sau 2s; `/health` + trang cấu hình `/` HTTP 200 dù cookie sai; serve.py mở tunnel `*.trycloudflare.com` + **đăng ký registry thành công** (`GET /list?engine=gemini-tryon` trả máy "Macs-MacBook-Pro (Gemini)"). Tab Ghép đồ dò ra (localhost + registry). (Lưu ý: gemini_webapi báo ready ngay sau init kể cả cookie sai → cookie hỏng bị bắt + nhảy account lúc generate.) Status: ✅ sidecar đang chạy live, chờ user dán cookie acc phụ tại localhost:8131/.

### [web2/shared] Trang chỉ-admin: ẩn khỏi menu nhân viên + chặn truy cập URL trực tiếp (1 nguồn)

User: group "Quản trị viên" + 6 trang (`system`, `pancake-settings`, `delivery-zone`, `audit-log`, `order-tags`, `livestream-poller`) chỉ admin được vào; **mọi trang admin-only phải ẩn khỏi menu** để nhân viên không thấy.

**Files**:

- `web2/shared/web2-perm.js` — thêm `ADMIN_ONLY_SLUGS` (1 NGUỒN: 6 trang trên + 3 trang group Quản trị viên `cham-cong`/`chi-tieu`/`users`) + helper `isAdminOnlySlug`/`isAdminOnlyUrl` (export). Mở rộng page-guard `_runGuard`: admin-only slug → **FAIL-CLOSED** chặn mọi non-admin (overlay "Bạn không có quyền xem trang này"), không phụ thuộc dữ liệu permissions (khác per-user 'view' revoke vốn default-open). An toàn vì web2-auth.js đã redirect user chưa đăng nhập về login + `getStored()` đọc localStorage đồng bộ → tới guard luôn có user.
- `web2/shared/web2-sidebar.js` — thêm `adminOnly: true` cho 5 NAV item (livestream-poller/pancake-settings/delivery-zone/order-tags/audit-log; `system` + group Quản trị viên đã có sẵn). `renderItem` ẩn item khi `item.adminOnly || Web2Perm.isAdminOnlyUrl(item.our)` (backstop 1-nguồn, phòng quên flag). Bump autoload `web2-perm.js?v=20260627adm`.
- Bump `web2-sidebar.js?v=20260627adm` trên **53 trang HTML** (cache-bust GH Pages).

**Lưu ý**: command palette (Ctrl+K) harvest từ DOM sidebar đã render → tự loại trang admin-only cho non-admin, không cần sửa. Mobile bottombar chỉ có item cố định (không admin).

**Verify** (browser test localhost, mô phỏng role qua `web2_auth`):

- Admin: thấy đủ 9 item admin-only + group (53 sub-link). ✅
- Staff: 9 item ẩn hết, group ẩn (53→44 link), `Web2Perm.isAdmin()=false`. ✅
- Staff nav trực tiếp `web2/system?tab=services` → overlay chặn `#web2PermBlock`. ✅
- Không false-positive: staff/products KHÔNG chặn, admin/system KHÔNG chặn. ✅
- Unit test node: slugFromUrl + isAdminOnlyUrl đúng 9 trang admin (gồm `?tab=services`), `users` vs `users-permissions` không nhầm. Status: ✅

### [inventory-tracking] Cho nhập GIÁ thập phân (ô Sản phẩm) + KG thập phân (ô Kiện Hàng) — dấu phẩy kiểu VN

User (modal "Thêm Đợt Hàng Mới" trang `inventory-tracking`): cho nhập số thập phân, dấu phẩy kiểu VN (vd `54,5`). Chốt: áp dụng **cả 2 ô**; ô Sản phẩm chỉ **giá** thập phân (SL giữ số nguyên).

**Files**:

- `inventory-tracking/js/text-parser.js` — regex giá `(\d+)` → `(\d+(?:[.,]\d+)?)` ở `PRODUCT_REGEX` + `PRODUCT_NO_COLOR_REGEX`; thêm helper `parseVnDecimal` (replace `,`→`.` rồi `parseFloat`). SL vẫn `parseInt`.
- `inventory-tracking/js/modal-shipment.js` — `parsePackagesInput`: bỏ comma-as-separator, **dấu cách = phân tách kiện**, dấu phẩy = thập phân (`part.replace(',','.')`). Cập nhật label/placeholder/hint ô Kiện Hàng. (Tương thích ngược: `"10, 20, 50, 88"` vẫn ra 4 kiện vì `"10,"`→`"10."`=10.)
- `inventory-tracking/js/modal-order-booking.js` — `parseProductLine`: giá cũng nhận thập phân (cùng format `[SL]X[giá]`, giữ đồng nhất).

**Chi tiết**: comma = dấu thập phân (VN), dot cũng chấp nhận. Hiển thị an toàn: `formatNumber` dùng `toLocaleString('vi-VN')` (54.5 → "54,5"); ô sửa đơn giá đã có `step=0.01`; `getProductAmount`/table-renderer dùng `parseFloat(giaDonVi)`. Module Web 1.0 (chatDb), không đụng web2.

**Verify**: node test 3 parser — giá nguyên/thập phân (`,` và `.`) OK, SL nguyên, KG thập phân OK, input cũ "10, 20, 50, 88"→4 kiện OK. Status: ✅

### [gemini-tryon + web2/ai-hub] ĐA ACCOUNT xoay tua + cài 1-click (bộ cài máy POS) + route free vào tab Ghép đồ

Nối tiếp sidecar gemini-tryon. User: "cài nhiều account Google Gemini để xoay tua không bị giới hạn" + "cho vào cài đặt phần download để chạy 1 click".

**1) `gemini-tryon/app.py` — POOL ĐA ACCOUNT (viết lại)**: mỗi account = 1 cặp cookie `__Secure-1PSID`/`PSIDTS` → 1 `GeminiClient`. Request xoay round-robin; account dính quota/limit → cooldown (`GEMINI_COOLDOWN_SEC` mặc định 3h) nhảy account kế; cookie hỏng → tắt account. Nguồn account: `accounts.json` → ENV `GEMINI_1PSID_1..20` → ENV đơn → browser-cookie3 (Chrome). **Trang cấu hình `GET /`** (tự chứa HTML) để dán cookie nhiều acc dễ dàng + `GET/POST/DELETE /accounts`. `/health` trả trạng thái từng account (ready/cooling/uses). **Đổi cổng 8124→8131** (8124 trùng OmniVoice). (Pattern xoay giống Pollinations token / Cloudflare account.)

**2) Cài 1-click (bộ cài máy POS)**: `gemini-tryon/gemini-tryon-windows-setup.ps1` (clone vieneu-windows-setup: tải app.py/serve.py/requirements từ site → venv → pip → cloudflared → launcher ẩn + Startup auto-bật + mở localhost:8131 dán cookie). Thêm **option [4] Gemini** vào `web2/shared/web2-pos-installer.js` (`cai-may-pos.bat` menu + routine `:GEMINI` + `:DO_ALL` + uninstaller dọn `N2StoreGeminiTryon`).

**3) `web2/shared/web2-tryon.js` — wire đường FREE**: section "Máy Gemini FREE" trong tab Ghép đồ (nút Tải bộ cài / Dò máy / Cấu hình account). `discoverGemini()` dò `localhost:8131/health` rồi registry `?engine=gemini-tryon`. `run()` route: có máy free → `POST <url>/tryon` (free), lỗi → fallback `callPaidNano` (Nano Banana `/api/web2-ai/image`). ai-hub load thêm `web2-pos-installer.js`; bump `web2-tryon.js?v=20260627b`.

**4) Tự bật khi mở máy + chạy NỀN ẨN** (user hỏi): Windows = PS1 dùng `pythonw` (không cửa sổ) + `run-hidden.vbs` (Run …,0) + Startup folder — đã có sẵn. Mac = thêm `install-mac.command` (LaunchAgent `com.n2store.gemini-tryon`: RunAtLoad+KeepAlive, chạy python venv nền, log file, PATH thêm brew để thấy cloudflared) + `uninstall-mac.command`. Nền ẩn → dùng cookie qua trang `localhost:8131/` (accounts.json), không browser-cookie3.

**Verify**: py_compile OK; node bat content có [4]+`:GEMINI`+URL ps1 đúng + uninstaller dọn Gemini; browser (login admin/admin!!) tab Ghép đồ render section máy free đủ 3 nút + status "⚪ chưa thấy máy → dùng Nano Banana", `Web2PosInstaller` loaded, **0 console error**. Status: ✅ (chờ user chạy bộ cài + dán cookie acc phụ trên máy shop)

### [web2/ai-hub + gemini-tryon] Thư viện prompt mới (49 Nano Banana) + Ghép mặt + sidecar Gemini cookie FREE

User muốn dùng prompt try-on (ghép đồ/ghép mặt) MIỄN PHÍ bằng tài khoản gemini.google.com từ Web 2.0. iframe/embed Gemini = bất khả thi (`X-Frame-Options: DENY`, đã verify header). Giải pháp = **cầu cookie** (giống pattern Zalo + VieNeu-TTS đã có).

**1) Sidecar `gemini-tryon/` (Hướng A — engine, NEW)**: clone pattern VieNeu-TTS (máy shop + cloudflared tunnel + heartbeat lên `web2-vieneu-registry` engine='gemini-tryon', cổng 8124). Dùng lib `HanaokaYuzu/Gemini-API` (`gemini_webapi` ⭐3.2k) gọi web app Gemini bằng cookie `__Secure-1PSID` → FREE + Nano Banana + nhận nhiều ảnh (try-on/face-swap). Files: `app.py` (FastAPI `/health` `/tryon` `/generate`), `serve.py`, `requirements.txt`, `run-mac.command`, `run_local.sh`, `README.md`. Cookie: auto browser-cookie3 (Chrome đã login) HOẶC ENV `GEMINI_1PSID`. ⚠ reverse-engineered → dùng acc Google PHỤ. py_compile OK. (Chưa wire nút chọn máy free vào Web2Tryon — bước sau.)

**2) `web2/shared/web2-ai-presets.js` — DỰNG LẠI thư viện ảnh**: 49 prompt CHỌN LỌC từ repo Nano Banana thật (PicoTrex 23k★, YouMind 12.7k★, JimmyLv 8.8k★ — workflow mine + curate). 8 nhóm: 🛍️ sản phẩm (8) · 👗 người mẫu (8) · 🧥 thử đồ (7, có `onmodel-tryon-pro`) · **🧑‍🤝‍🧑 Ghép mặt (6) — NHÓM MỚI** (`faceswap-onto-model`: ảnh 1=mặt, ảnh 2=model) · 🖼️ đổi nền (7) · 👤 avatar (5) · 📐 flat-lay (3) · 🎉 poster (5). Thêm field + hiển thị `inputImages` trên card (báo cần ảnh nào, thứ tự). Prompt try-on/face-swap viết tiếng Anh (giữ danh tính tốt hơn).

**3) `web2/shared/web2-tryon.js`**: (a) `buildPrompt()` dùng prompt try-on CẢI TIẾN (khoá danh tính + trung thực món đồ + khớp ánh sáng/bóng/màu da → ghép hài hoà nhất); (b) thêm **toggle chế độ Ghép đồ / Ghép mặt** — face-swap relabel (1) Ảnh lấy MẶT, (2) Ảnh MODEL (1 ảnh), dùng `FACESWAP_PROMPT`, images=[mặt, model].

Bump `?v=20260627a` (ai-hub load presets + tryon). **Verify browser** (login web2 admin/admin!!): AiPresets 49 prompt, 9 chip gồm Ghép mặt → 6 card + dòng "🖼 2 ảnh: ảnh mặt + ảnh model"; toggle Ghép đồ↔Ghép mặt đổi nhãn chuẩn. Status: ✅ (sidecar chờ user chạy thử trên máy + cookie acc phụ)

### [web2/cham-cong] Chỉnh sửa chấm công → LƯU + HIỆN "thời gian chỉnh sửa" (ai + lúc nào)

User: "chỉnh sửa chấm công sẽ lưu lại và hiện thời gian chỉnh sửa". Thêm **audit chỉnh sửa tay** theo NGÀY/NV: mỗi lần admin sửa chấm công 1 ngày (đổi giờ Vào/Ra, thêm/xoá lượt, nghỉ phép, ghi chú) → ghi ai + lúc nào, hiện ở popup ngày + ô lưới.

Files:

- **BE `render.com/routes/web2-attendance.js`**: bảng mới `web2_attendance_edits` (id `{device_user_id}_{date_key}`, `edited_by`, `edited_at`; index date_key — idempotent trong `ensureSchema`). Helper `editorOf(req)` (display_name||username||'admin', khớp convention commands/period-lock) + `stampEdit(db,uid,dk,by)` (upsert, nuốt lỗi — audit phụ trợ KHÔNG làm hỏng mutation chính). `GET /edits?start&end` (mirror `/day-notes`). Đóng dấu trong MỌI path TAY: POST `/records` (manual), DELETE `/records/:id`, PUT `/day-notes/:id`, POST `/fullday`, DELETE `/fullday/:id`. **KHÔNG** dấu ở `/records/bulk` (agent) hay `/records/import` (file) — chỉ thao tác người dùng.
- **FE `cham-cong-api.js`**: `listEdits(start,end)`. **`cham-cong-app.js`**: `state.edits` ('{uid}\_{dk}' → {by,at}); `applyResults` parse `r.edits`; `loadAll` thêm `listEdits` vào Promise.all (đúng vị trí thứ 5); `fmtEditTs` (GMT+7 HH:MM DD/MM/YYYY); popup hiện pill `✏️ Đã chỉnh sửa: <ts> bởi <tên>`; ô lưới thêm class `cc-edited` + title hover. **`cham-cong.css`**: `.cc-edit-meta` (pill xanh), `.cc-cell.cc-edited::before` (chấm xanh góc dưới-trái, KHÔNG đụng chấm ghi chú góc trên-phải). Bump `?v` (css/api `20260627edit`, app `20260627edit2`).

**Verify**: throwaway-DB test 13/13 (schema idempotent, upsert 1 dòng/ngày + overwrite editor mới nhất, invalid date/empty uid = no-op, range query lọc đúng). Review đối kháng 4 lens × verify → **1 bug MEDIUM** (8 false-positive): re-Lưu ngày NGHỈ PHÉP không đổi gì vẫn đóng dấu giả vì popup pre-check "Nghỉ có phép" + `addFullday` gọi vô điều kiện. **Fix**: FE chỉ `addFullday` khi `!ctx.isFull`; BE `INSERT…ON CONFLICT DO NOTHING RETURNING id` + chỉ `stampEdit` khi `rowCount>0` (test 3/3). Status: ✅

### [web2 multi] Audit 5 bug user báo → 3 đã fix sẵn + fix 2 (AI tên chiến dịch, lag, zalo cookie, hardening)

User báo 5 bug. Audit (5 agent song song) → 2 đã ĐÚNG sẵn, 1 đã fix sẵn, 2 còn thiếu → làm tiếp + 2 cải thiện.

- **#1 ai-hub đổi model**: ✅ ĐÃ ĐÚNG sẵn — model đọc tươi mỗi lần gửi (`ai-chat.js:468`), đổi giữa chừng ăn ngay. Không cần làm gì.
- **#2 live-chat/chat.html tin giật lên đầu**: ✅ ĐÃ FIX sẵn (`354e8a1fc`+`77392b076`, sort asc theo timestamp, mọi tin có `inserted_at`). + **hardening LOW**: `msgTs` (`web2-chat-panel-state.js`) thiếu/parse-fail timestamp → lấy epoch nhúng id tạm (`ext_/temp_/pk_<ms>`) thay vì 0 → chống tái diễn.
- **#5 native-orders tách đơn**: ✅ ĐÃ FIX sẵn (`6704382ea` thêm `x-web2-token`, gốc là 401). R3 `8b5c4b22a` KHÔNG gây lỗi. Nếu còn lỗi → hard-refresh/login lại.
- **#4 live-chat lag + AI tên chiến dịch**: lag → 3 SDK Firebase chuyển `<head>`→cuối body (hết render-block, giữ load order, Firestore vẫn dùng Pancake token). AI gợi ý tên → **THÊM** nút `✨ AI` cạnh ô tên (`live-campaign-manager.js`) gọi `/api/web2-ai/complete` sinh tên ngắn. ⚠ Verify thật (account web2 admin/admin!!): tên lúc đầu CỤT ('Sóng') vì Gemini 2.5 Flash thinking đốt token → nâng `maxTokens` 40→800 + retry provider rỗng → 'Đại Tiệc Sale 27/06' đầy đủ.
- **#3 zalo auto-thêm account từ cookie**: focus-lease đã có (`927c3e8a3`). **THÊM** auto-bootstrap: web2/zalo `autoRenewZalo` khi chưa có TK + có phiên chat.zalo.me → tự createAccount+cookie-login (không bấm nút); jt-tracking presence `_acquireAll` khi rỗng → `Web2Zalo.getCookieAccountKey` bootstrap (throttle 60s).

Verify: regression toàn bộ 10 suite R1-R4+SePay = **124 assertions GREEN** (fresh DB 1 pass). FE changes syntax-checked. Status: ✅

User: "sepay có chức năng webhook tạo giao dịch nên dùng tạo giao dịch test web 2.0". Webhook `/api/sepay/webhook` là endpoint dùng chung fan-out 2 nhánh độc lập; test đi ĐÚNG nhánh Web 2.0 (`insertWeb2BalanceHistory`+`processWeb2Match`, như fan-out + retry cron), **KHÔNG đụng Web 1.0** (`balance_history`/`processDebtUpdate`). Verify 22 assertions Postgres thật (`sepay-webhook-test.js`).

- **🐞 FIX [MEDIUM] `web2-sepay-matching.js`** — CHECK constraint `web2_balance_history_match_method_check` THIẾU value `pending_no_order` (gate `_gateBlock` dùng từ 2026-06-07 + reprocess exclusion 2026-06-20). Guard migration cũ `IF EXISTS THEN RETURN` → constraint không bao giờ update → prod thiếu. Hệ quả: `UPDATE SET match_method='pending_no_order'` vi phạm constraint → throw (try/catch nuốt) → `match_method` giữ NULL → reprocess cron KHÔNG loại được row gated → **retry storm mỗi 10 phút** + đếm sai `no_match`. (Tiền AN TOÀN — gate return trước credit; bug correctness/efficiency.) Fix: thêm `pending_no_order` vào CHECK + guard SELF-HEAL (chỉ RETURN khi def đã chứa value, thiếu → DROP+ADD 1 lần idempotent).
- **Verify luồng SePay→ví ĐÚNG**: A) SĐT+đơn active → auto-credit `exact_phone`; B) trùng `sepay_id` → idempotent không double; C) CK#2 cùng KH → cộng dồn, đúng 2 GD; D) SĐT không đơn → gate chặn `pending_no_order` (giờ lưu được sau fix); E) QR → bypass gate → credit; F) `out` → không credit; G) amount≤0 → từ chối.
- **Lưu ý**: clone `0123456788` KHÔNG dùng cho test extractor SePay (prefix 012 vô lệ VN → extractor từ chối ĐÚNG); dùng prefix 09x. Đây là test LOCAL `n2store_flow_test`, không đụng prod.

### [web2 flow R4] Vòng XÁC MINH báo cáo kho + revenue + công thức lương → 0 bug code (verify integration test)

Vòng 4 = verification (không sửa code). Kiểm 2 báo cáo user yêu cầu đúng (`report-warehouse`, `report-revenue`) + công thức lương/khoá kỳ. Doc: [`docs/web2/FLOW-AUDIT-2026-06-27-R4.md`](web2/FLOW-AUDIT-2026-06-27-R4.md).

- **Báo cáo kho (`web2-warehouse-report.js`, code mới session trước) — ĐÚNG, 29 assertions** (`warehouse-test.js`): mua vào (received đủ / partial `min(qtyReceived,qty)` / draft 0 / cancelled loại), tiền `costPrice×rate`, chưa nhận = qty−nhận, bán ra CHỈ `state='done'` trong range theo `date_invoice` GMT+7 (confirmed/done-cũ không đếm), lọc mua theo `shipment.date`, merge buy↔sell theo CODE (1 dòng), rollup ĐỊA DANH(cha)/NCC + **totals reconcile** Σregions=Σsuppliers=Σproducts=totals.
- **Revenue (`pbh-reports`) — ĐÚNG**: refund KPI R1 #12 (`web2_returns status='active' AND created_at>=cutoffMs`) giữ nguyên đúng; revenue GMT+7 nhất quán. Semantic khác warehouse cố ý (revenue đếm state≠cancel = đã lập phiếu; warehouse bán ra = done).
- **Lương/khoá kỳ — công thức KHỚP**: `cham-cong-salary.js` (`tongLuong=luong+OT+PC+thưởng−giảm`, `conCanTra=tong−đãtrả`) trùng khít `validateLockSnapshot` server; snapshot `m` đủ field validator.
- **⚠ Limitation cosmetic (KHÔNG fix)**: SP unmatched (không có trong kho) + có variant → tách dòng buy/sell (totals vẫn đúng). Fix sẽ over-merge variants → chấp nhận giới hạn.

Test: `warehouse-test.js` (29) — không regression. Status: ✅

User: "đăng nhập thì vào native-orders". Đổi login redirect: mọi user → `../../native-orders/index.html` (login ở `/web2/login/` depth 2, native-orders ở ROOT → cần `../../`; bỏ role-based admin→system của lần trước). `landingFor()` giờ trả native-orders cho tất cả.

🐞 **FIX bug nghiêm trọng vừa ship ở commit ce9f30b26**: overview.js + index.html copy href từ sidebar (`../web2/X`, `../native-orders`) mà KHÔNG qua `resolveOur` → từ `/web2/overview/` (depth 2) ra `/web2/web2/X` và `/web2/native-orders` = **404 TOÀN BỘ card + link tĩnh** (xác nhận curl: cả 2 đều 404). Fix:

- `overview.js`: thêm `resolveHref()` (logic khớp `web2-sidebar.resolveOur` — strip `../`, prepend `../../` khi page depth 2) áp cho mọi card href.
- `index.html`: link tĩnh (Hệ thống/Lịch sử thao tác/Thông báo/CTA) đổi `../web2/X` → `../X`.
- Verify resolved: Đơn Web→`/native-orders/`, Bán hàng→`/web2/fastsaleorder-invoice/`, footer→`/web2/system/` (đều 200). Bump overview.js?v=fr4.

⚠ Test env: nav native-orders bị bounce `/web2/login` dù token client còn ~7 ngày — do **401-fetch-guard** (API server từ chối token restore → guard xoá token + bounce, ĐÚNG thiết kế, KHÔNG loop). Là giới hạn token môi trường test, không phải lỗi redirect. Status: ✅ (code verify; happy-path native-orders cần session prod thật)

### [web2/login] Login redirect theo ROLE: admin → system?tab=services, nhân viên → overview

User: "đăng nhập vào thì vào trang web2/system?tab=services". ⚠ `web2/system` là **admin-only NHƯNG KHÔNG có server/page gate** (chỉ ẩn qua menu sidebar — KB-SYSTEM-SERVICES.md §1) → redirect mọi user vào đó = nhân viên cũng thấy trang cấu hình/chi phí/hạ tầng. Giải pháp: helper `landingFor(user)` trong [`web2/login/index.html`](../web2/login/index.html) — `role==='admin'` → `../system/index.html?tab=services`, còn lại → `../overview/index.html` (trang giới thiệu). Dùng ở CẢ 2 nhánh (đã-login + vừa-login); `?next=` vẫn ưu tiên. Verify browser: tài khoản admin nav login → redirect đúng `system?tab=services`. Status: ✅

### [web2/overview] Login → overview + overview thành TRANG GIỚI THIỆU Framer-style (showcase toàn bộ Web 2.0)

User hỏi web2/index.html có phải data cũ → xác minh git: KHÔNG (launcher sống). Chọn **(B)**: login mặc định nhảy `web2/overview` thay vì `web2/index.html`, và **biến overview thành trang giới thiệu toàn bộ Web 2.0** phong cách framer.com (sáng + bold + gradient xanh Zalo `#0068ff`→tím). Soi git 82 commit overview → xác nhận note "phải cập nhật overview #conventions/#auditPages" trong CLAUDE.md đã **stale/aspirational** (doc canonical đã di cư sang `web2/system` + `docs/web2/*.md`; audit R2/R3 không đụng overview). User đồng ý.

- **Login redirect**: [`web2/login/index.html`](../web2/login/index.html) 2 chỗ `../index.html` → `../overview/index.html`.
- **Archive overview cũ** (3223 dòng docs) → [`web2/overview/legacy-overview.html`](../web2/overview/legacy-overview.html) + `legacy-overview.css` (self-contained, link cũ vẫn resolve). KHÔNG mất tài liệu.
- **Trang mới** [`web2/overview/index.html`](../web2/overview/index.html) + `overview.css` + `overview.js` (tách module, self-contained, KHÔNG `.web2-theme`): hero kinetic typography (SplitText), aurora gradient drift, marquee, 4 pillars, **showcase 52 module/13 nhóm** (catalog CHÍNH XÁC từ `web2-sidebar.js` NAV — manifest 3-entry đã hỏng), filter chip + search, CTA, footer. Ẩn nhóm/module admin theo `Web2Auth role`.
- **Motion stack** (CDN, chỉ trang này): GSAP 3.15 + ScrollTrigger + SplitText (free) + Lenis 1.3.25 smooth-scroll. Reveal dùng IntersectionObserver (degrade an toàn nếu CDN lỗi). Reuse research: [[reference_web2_design_system]] (#0068ff), `Web2Motion`/`Web2Lottie` đã có sẵn nhưng dùng GSAP cho framer-feel.
- **Fix bug visual**: chữ gradient "toàn bộ" trong suốt sau SplitText (bọc char trong `<div>` → mất `background-clip:text`) → CSS cho mọi con `.ov-grad-text *` mang gradient.
- **Tối ưu lag** (đo Playwright): aurora `filter:blur(60px)` chuyển từ parent → **từng span** (GPU layer cache, không re-blur mỗi frame), bỏ `will-change` thừa trên 52 card, bỏ parallax aurora scroll. Kết quả: **idle 60fps/max 22ms/0 longtask**; cuộn nhanh full trang ~56fps, jank frames **110→14**, 0 blocking; filter click **1ms**; card click điều hướng đúng.
- **Dọn CLAUDE.md**: 4 reference stale (rule 9, `#conventions` canonical, webhook note, browser-test rationale) → trỏ sang `legacy-overview.html` + `web2/system` + `docs/web2/*.md`.

Files: `web2/login/index.html`, `web2/overview/{index.html,overview.css,overview.js,legacy-overview.html,legacy-overview.css}`, `CLAUDE.md`. Status: ✅

### [docs/web2] KB-doc "Dịch vụ & Hạ tầng" cho NotebookLM + Claude-read-first

User muốn "tích hợp NotebookLM vào Web 2.0" để ghi cái đáng chú ý rồi "kêu Claude đọc trước khi code". **Ràng buộc thật:** NotebookLM KHÔNG có API công khai → Claude KHÔNG đọc trực tiếp được (không connector/MCP). Giải pháp 1-nguồn-2-nơi-đọc: viết KB markdown trong repo → (a) Claude đọc được, (b) user upload lên NotebookLM hỏi-đáp.

- Tạo [`docs/web2/KB-SYSTEM-SERVICES.md`](web2/KB-SYSTEM-SERVICES.md) (workflow 5 agent: 4 đọc song song dashboard UI + data JSON + hạ tầng backend + realtime/bên-thứ-3 → 1 synth gộp). Nội dung: trang `web2/system?tab=services` (DB live + chi phí HARDCODE trong `SERVICES_INVENTORY` + modal chi tiết), topology backend (web2-api srv-d8n53… vs n2store-fallback srv-d4e5…, 2 DB pool web2Db/chatDb, worker chatomni-proxy routing, cron), 2 hub SSE + topics, 70 bên thứ 3, shared modules, §7 **gotchas dễ nhầm**.
- Thêm pointer KB vào CLAUDE.md (Index quick-lookup) — đọc trước khi code `web2/system`/`services-overview.js`/hạ tầng. Pattern đi tới: ghi "cái đáng chú ý" mới → tạo `docs/web2/KB-*.md` cùng kiểu.

Status: ✅

## 2026-06-26

### [web2 flow R3] Audit vòng 3 (PBH tách + khoá kỳ lương + cashbook) → fix 3 bug + verify đối kháng 5 false-positive

Vòng 3 nối R1/R2, soi luồng phụ: PBH tách (split), chấm công/khoá kỳ lương, soquy/cashbook, voucher → **8 finding**. Verify đối kháng từng cái với code thật: **3 bug THẬT đã fix** (1, 2 HIGH + 5 LOW), **5 còn lại false-positive / fix sẽ regress** (đã ghi lý do). Doc: [`docs/web2/FLOW-AUDIT-2026-06-26-R3.md`](web2/FLOW-AUDIT-2026-06-26-R3.md).

- **#1 [HIGH]** PBH tách (N bill cùng `source_code`): enrich tag dùng `DISTINCT ON` chỉ đọc bill#1 → ẩn nợ bill#2 + đối soát sớm sai. Đổi sang AGGREGATE: `SUM(residual)` (còn nợ nếu BẤT KỲ bill nợ) + `BOOL_AND(packed+)` → `pbhAllReconciled`. Verify 9 assertions. Commit `8b5c4b22a`.
- **#2 [MEDIUM→HIGH]** Khoá kỳ lương CHỈ chặn frontend → tab cũ/API trực tiếp vẫn sửa punch/payroll/fullday/holiday tháng ĐÃ CHỐT. Thêm guard server-side `isMonthLocked(db, monthKey)` reject 409 ở 7 route mutation (`POST/DELETE records`, `PUT payroll`, `POST/DELETE fullday`, `POST/DELETE holidays`); fail-open khi bảng lock chưa migrate; agent ingest nền KHÔNG chặn. Verify 18 assertions (`lock-test.js`).
- **#5 [LOW]** Cashbook filter biên cuối `<= 23:59:59` bỏ sót phiếu sub-second giây cuối (vd 23:59:59.7) → thiếu tổng thu/chi + số dư. Đổi biên EXCLUSIVE `< (end+1 ngày)T00:00` ở `/summary`+`/report` (web2-cashbook.js) + `buildVoucherFilter` (web2-cashbook-lib.js). Verify 7 assertions (`cashbook-test.js`).
- **Verify KHÔNG phải bug (vòng đối kháng — KHÔNG sửa mù)**: #3 soquy optimistic (thực tế `loadAll()` refetch + SSE reconcile, không optimistic balance), #4 back-dated double-count (report query tươi, đếm 1 lần theo voucher_time), #6 payroll override (FE gửi đủ field, null=xoá chủ ý — COALESCE sẽ regress), #7 Excel count (cosmetic; fix xmax sẽ chặn SSE refresh khi sửa punch), #8 voucher mã rỗng (`nextCode` prefix luôn gán + seq atomic, không nhánh rỗng).

Test: harness `tags-test.js` (9) + `lock-test.js` (18) + `cashbook-test.js` (7) — không regression suite R1/R2. ⚠ Tiện thể RESTORE `dev-log.md` bị xoá nhầm 539 dòng (section 2026-06-19) ở working tree session trước. Status: ✅

### [web2 flow R2] Audit vòng 2 (7 luồng còn lại) → fix 8 bug HIGH/MEDIUM money/stock + verify integration test

2 workflow audit (delivery/reconcile + native→PBH/bulk-cancel/ví KH/ví NCC/KPI) → **13 defect**. Fix toàn bộ HIGH+MEDIUM (8), document LOW/frontend (5). Doc: [`docs/web2/FLOW-AUDIT-2026-06-26-R2.md`](web2/FLOW-AUDIT-2026-06-26-R2.md).

- **#1 [HIGH]** tạo PBH trừ ví thu hộ áp-lại bị dedupe nuốt → over-mint lúc huỷ. `_applyWalletToPbh` honor `alreadyProcessed` + `applyWalletToUnpaidPbhs` refId UNIQUE (verify 7 assertions).
- **#1b [HIGH]** create-time ví (TX2) đọc residual STALE + không lock → race. LOCK + re-read PBH row trong TX2.
- **#2 [HIGH]** `_emitRevokeKpi` huỷ PBH GỘP không thu hồi KPI (source_code 'A+B' không tách). Split '+' + `order_code = ANY`.
- **#3 [HIGH]** dashboard-kpi revenue_today/7d TRỪ web2_returns → doanh thu NET (verify 200k−50k=150k).
- **#4 [MEDIUM]** from-native-order split=true bỏ qua merged-guard → double trừ. Guard chạy cả split.
- **delivery [MEDIUM]** huỷ PBH → huỷ phiếu giao linked (cùng tx, SSE); from-pbh chặn phiếu giao TRÙNG (verify 6 assertions).
- **Sửa COD [MEDIUM]** lần 2 cùng đơn → reject 409 (trước: ghi khống → over-refund).
- **Document (LOW, follow-up)**: pollDeposits unmatched (FE), bulk-confirm native sync (dead route), processWithdraw 23505 recovery, returns deposit idemKey (đã mitigate code UNIQUE), matchSupplier substring (cần UX manual-assign).

Test: 4 suite cũ (37 assertions) + 2 suite mới không regression. Status: ✅

### [web2 flow money/stock] Fix 6 bug defer (KNH/native restock + ví NCC cap) — verify integration test Postgres thật

Tiếp tục từ audit 12-bug: fix nốt 6 bug money/stock đã defer, **verify bằng integration test trên Postgres local THẬT** (mount route thật + ensureTables + seed + assert invariant + drop DB — pattern test-migration CLAUDE.md). 24 assertions pass.

**web2-returns.js (tồn kho — 14 assertions):**

- **#2/#7** KNH (không nhận hàng): restock chỉ phần CHƯA trả = `full − returned_line_qty` PBH nguồn (gán `items=NET` → `_applyStock` + record + huỷ-phiếu đối xứng). Trước restock FULL sau khi đã thu về 1 phần → +partialQty phantom stock.
- **#6** native-source thu_ve_1_phan: GHI `returned_line_qty` lên PBH live của native (greedy per-code) + DELETE reverse — trước chỉ pbh-source → huỷ PBH native over-restock.

**purchase-refund.js + lib (ví NCC — 10 assertions):**

- **#5** bỏ cap amount all-or-nothing (1 dòng thiếu cost → bỏ cap toàn phiếu = over-mint). Cap per-line: `amount ≤ Σ min(client, cost)`; dòng không khớp so-order fail-open RIÊNG dòng.
- **#3** cap QTY `≤ Σ(received − đã trả)` per code (greedy qua dòng so-order đã nhận) → trả vượt → cap/reject, trừ kho đúng phần cap.
- **#4** tổng hợp `rowReturns` từ code-keyed lines → GHI `returned_row_ids` (như ví NCC `/tx`) → 2 đường return cùng đọc remaining, chặn trả lại SP đã trả 2 lần.
- lib `web2-so-order-qty.js`: thêm `loadSoOrderReceivedRowsByCode`.

Doc audit cập nhật: [`docs/web2/FLOW-AUDIT-2026-06-26.md`](web2/FLOW-AUDIT-2026-06-26.md) — **12/12 FIXED**. Status: ✅

### [web2/system + reports + flow] Cải thiện UI system + audit 19-agent luồng nghiệp vụ + fix 5 bug

**1. UI trang Cấu hình & Hệ thống** (`web2/system`):

- `system-services.js` + `system.css`: click service card / dòng bảng DB → **modal chi tiết** (kv + free/paid tier + link); nút "Xem tất cả N bảng"; expose `SystemServices.getData()`.
- `web2-ai-page-registry`: thêm entry `/web2/system/` (accessor `SystemServices.getData` + gợi ý soát chi phí/DB đầy/bảng nặng) + `/web2/report-warehouse/`.
- `web2-ai-assistant`: bỏ `system` khỏi `HIDE_RE` → **FAB ✨ hiện trên trang system** (giờ có context riêng).

**2. Audit luồng nghiệp vụ** (workflow 19 agent, 6 luồng: nhận hàng→PBH→hủy→trả KH→thu về→trả NCC + 2 report) → **12 defect xác nhận**. Doc: [`docs/web2/FLOW-AUDIT-2026-06-26.md`](web2/FLOW-AUDIT-2026-06-26.md).

**3. Fix 5 bug contained (đã test):**

- **#10** report-warehouse: so-order row chưa gắn `matchedCode` giờ resolve mã qua join `(name,variant)→web2_products` → MUA VÀO **merge đúng** với BÁN RA cùng SP (unit 45+ assertions ✅).
- **#12** report-revenue: KPI "Trả hàng hoàn thành" đọc `web2_returns` (status=active) thay bảng `refunds` legacy đã chết.
- **#1/#8** nhận hàng (`so-order-receive.js`): truyền `supplier` vào lookup → tránh khớp nhầm SP cùng tên khác NCC; lookup fail dùng `remainingPending` làm sàn.
- **#9** hủy PBH (`fast-sale-orders.js` restockOrderLines): GỘP qty theo CODE trước khi trừ `returned_line_qty` → PBH dòng trùng mã hết under-restock.
- **#11**: cập nhật comment KNOWN-LIMITATION.

**4. Defer** (money/stock transaction, cần focused + integration test seeded flow): **#2/#7** KNH double-restock, **#6** native partial restock, **#3/#4/#5** ví NCC over-mint/cap — chi tiết + repro trong audit doc.

**Verify**: system modal/AI FAB browser ✅; report-revenue + report-warehouse load 0 console error ✅; warehouse unit 45+ assertions (gồm merge FFF) ✅. Status: ✅ (UI+report xong; flow bug nguy hiểm flag lại)

### [web2/products] Tự tạo TÊN SP từ loại + Màu/Size (có thể sửa) — Kho SP

Mở rộng tính năng tự-tạo-tên sang Kho SP (như đã làm cho Sổ Order). Modal Thêm/Sửa SP: chọn loại (chip) + Màu/Size → ô **Tên SP** tự điền "LOẠI MÀU SIZE" (IN HOA), vd `ÁO TRẮNG M` / bộ `ÁO QUẦN ...`.

**Sửa** `web2/products/js/web2-products-variant-picker.js`: `_genNameFromSelection()` (loại + Màu + Size, `vi-VN` upper; **bỏ qua khi Màu/Size có "/"** = cartesian nhiều SP → tên auto chỉ cho 1 SP) + `_maybeAutofillName()` (guard: chỉ điền khi #pmName trống/bằng auto trước `_lastAutoName`; user gõ tay → giữ). Hook ở chip-click + Màu/Size input/pick. Sau khi điền → dispatch `input` lên #pmName để **autoRegen mã SP** chạy lại theo tên mới. Reset `_lastAutoName` trong `_setSelectedCategory` (mở modal). Cache-bust `?v=20260626b`.

**Verify** (Node + browser): genName "Áo+Trắng+M"→"ÁO TRẮNG M", set→null, no-type→"TRẮNG M" ✅; modal: chọn Áo+Trắng+M → #pmName "ÁO TRẮNG M", category "Áo" ✅; sửa tay "ÁO THUN ABC" rồi đổi Size→L → tên GIỮ, size cập nhật ✅. Mã SP regen theo tên (không vỡ). Status: ✅

### [web2/report-warehouse] Báo cáo kho: thêm ĐỊA DANH (cha của NCC+SP) + fix review

Follow-up trang Báo cáo kho. User: "chia theo địa danh (HÀ NỘI, HƯƠNG CHÂU…) — cái này CHA của NCC và sản phẩm" + "NCC hiện rõ phần chưa nhận hàng".

**Thêm chiều ĐỊA DANH (region = `tab.label` Sổ Order / `web2_products.region`):**

- `web2-warehouse-report.js`: mỗi product/supplier mang `region`; thêm `regions[]` rollup (mỗi địa danh: Số NCC + Số SP + mua vào/chưa nhận/bán ra). suppliers gom theo (region, NCC) — NCC lồng trong địa danh. SELECT thêm `region` từ web2_products (canonical), fallback `tab.label`.
- `report-warehouse/index.html`: dropdown lọc **Địa danh**, view thứ 3 **📍 Theo địa danh** (mặc định), cột **Địa danh** trong bảng NCC + SP. KPI "Nhà cung cấp" → "Địa danh" (N địa danh · X NCC · Y SP). CSV theo view (region/ncc/sp) kèm cột địa danh.

**Fix từ adversarial review (workflow 12 agent, 7 defect confirmed):**

- **HIGH** footer TỔNG CỘNG: tính lại Σ theo dòng ĐANG HIỂN THỊ (khớp body khi lọc/search), label "TỔNG (đã lọc)" khi có filter.
- **MED** "Mua vào (đã nhận)" partial_received: dùng SL nhận thật `min(qtyReceived, qty)` (mirror `lib/web2-so-order-qty.js`), KHÔNG đếm nguyên SL đặt; "Chưa nhận" = `qty − nhận thật`.
- **MED** CSV formula injection: prefix `'` cho cell bắt đầu `= + - @ \t \r` (mirror supplier-debt).
- **MED** KPI kẹt skeleton khi load lỗi → reset.
- **LOW** nút Thử lại inline-onclick ReferenceError → addEventListener.
- **LOW** tên file CSV theo `lastData.range` (không phải ô input).

**Verify**: unit harness 40+ assertions pass (region rollup HÀ NỘI/HƯƠNG CHÂU/SÀI GÒN, partial qtyReceived, currency, date filter). Browser smoke: 3 view (địa danh/NCC/SP) + cột Địa danh + dropdown lọc + footer khớp dòng hiển thị, **0 console errors**. Status: ✅

### [so-order][web2/shared] Tự tạo TÊN SP từ biến thể đã chọn (có thể sửa) — Web2VariantPicker

User: chọn biến thể trong modal Sổ Order → tự sinh TÊN SP, điền vào ô Tên (sửa được). VD chọn Áo Trắng + Quần Đen + Giày Đen → "ÁO TRẮNG QUẦN ĐEN GIÀY ĐEN".

**Sửa:**

- `web2/shared/web2-variant-picker.js`: thêm `genName()` (mỗi món "LOẠI BIẾNTHỂ", nối khoảng trắng, IN HOA; "/" trong biến thể → space). onChange payload thêm `name`; controller thêm `getName()`.
- `so-order-modal-core.js` `_mountModalVariantPickers`: onChange điền `name` vào ô `productName` của dòng — **guard sửa được**: chỉ điền khi tên trống hoặc bằng tên auto trước đó (`row._autoName`); user gõ tay / chọn SP từ gợi ý → KHÔNG ghi đè. Cache-bust picker `c` / modal-core `g`.

**Verify** (Node + browser): genName "Áo Trắng+Quần Đen+Giày Đen"→"ÁO TRẮNG QUẦN ĐEN GIÀY ĐEN" (+ size/edge) ✅; modal: chọn 3 món → ô Tên = "ÁO TRẮNG QUẦN ĐEN GIÀY ĐEN", row.variant/category đúng ✅; sửa tay "TÊN TÙY CHỈNH" rồi đổi biến thể → tên GIỮ nguyên, biến thể vẫn cập nhật ✅. Status: ✅

### [web2/products] Phase 4: modal Kho SP thêm chọn LOẠI sản phẩm (category) — dùng chung product-types

Hoàn tất feature "Loại SP + biến thể theo món" (Phase 4/4). Modal Kho SP thêm chip multi-select LOẠI (Áo/Quần/Đầm…) từ `Web2ProductTypesCache` (shared) → lưu `web2_products.category` ("Áo + Quần" cho bộ). **GIỮ NGUYÊN** picker Màu/Size + sinh mã SP (mã cần shortCode Màu/Size có cấu trúc — KHÔNG thay bằng Web2VariantPicker để khỏi vỡ mã SP; quyết định có chủ đích).

**Sửa:**

- `web2/products/index.html`: field-row "Loại sản phẩm" (`#pmTypeChips`) trên ô Màu/Size; load `web2-product-types-api.js` + `web2-product-types-cache.js`; cache-bust `?v=20260626a`.
- `web2-products-variant-picker.js`: `_renderTypeChips`/`_getSelectedCategory`/`_setSelectedCategory` (chip toggle, đọc shared cache). `_wireVariantPicker` init+render chips.
- `web2-products-modal.js`: `fields.category` = `_getSelectedCategory()`; thêm vào update/create payload; open/edit set chips từ `p.category`.
- `web2-products.css`: `.pm-type-chip(.is-on)`. BE `web2-products.js` đã có cột category (migration 067) + create/update whitelist.

**Verify:** API round-trip — create `category="Áo + Quần"` 200 → GET "Áo + Quần" → PATCH "Đầm" → GET "Đầm" → delete (cleanup) ✅. Browser: modal chips [Áo,Quần,Đầm,Váy,Giày,Dép], click Áo+Quần → `_getSelectedCategory()`="Áo + Quần" ✅. Mã SP không đổi. Status: ✅

> **HOÀN TẤT 4 phase** (kế hoạch `~/.claude/plans/jaunty-munching-llama.md`): P1 trang Loại SP · P2 `Web2VariantPicker` · P3 so-order (inline "Áo Trắng, Quần Đen" + modal) · P4 Kho SP category.

### [web2/report-warehouse + render] Báo cáo kho mới: Mua vào (Sổ Order) vs Bán ra (PBH) theo SP + NCC, lọc ngày, cột "Chưa nhận hàng"

User: "Thêm vào Báo cáo phần báo cáo kho: Sản phẩm (tổng SL + tiền mua vào / bán ra), NCC (tổng SL + tiền mua vào / bán ra của NCC), cho điều chỉnh ngày tháng" + "NCC hiện rõ phần chưa nhận hàng". Quyết định (hỏi user): **trang mới riêng**; **mua vào = chỉ hàng Đã Nhận**; **bán ra = chỉ PBH Hoàn thành (done)**.

**Thêm:**

- `render.com/routes/web2-warehouse-report.js` (NEW, WEB2.0): `GET /api/web2-warehouse-report/summary?from&to` → `{ totals, products[], suppliers[] }`. **Mua vào (đã nhận)** = `web2_so_order` rows status `received|partial_received` (tiền = costPrice × tab.rate VND), lọc theo `shipment.date`. **Chưa nhận hàng** = rows status `draft` (đã đặt chưa về kho). **Bán ra** = `fast_sale_orders` state='done', `order_lines`, lọc `date_invoice` (AT TIME ZONE 'Asia/Ho_Chi_Minh'). NCC + tên SP canonical join `web2_products.supplier/name` theo code; merge buy↔sell theo code (rows chưa gắn mã → name-keyed). Read-only, pool `web2Db||chatDb`, gate `requireWeb2AuthSoft`.
- `web2/report-warehouse/index.html` (NEW): KPI (Mua vào / Chưa nhận hàng [amber] / Bán ra / Số NCC), filter ngày (từ–đến + preset Hôm nay/7/30/Tháng này/90), toggle **Theo NCC** ↔ **Theo SP**, bảng cột nhóm Mua vào · **Chưa nhận hàng** (highlight `#fffbeb`/`#b45309`) · Bán ra, sort click header, search, **Xuất CSV** (BOM UTF-8), SSE reload (`web2:so-order` + `web2:fast-sale-orders`).
- `render.com/server.js`: mount `/api/web2-warehouse-report` (cạnh web2-so-order). Worker tự route qua `isWeb2Path('/api/web2*')` → web2-api (không cần sửa worker).
- `web2/shared/web2-sidebar.js`: thêm "Báo cáo kho" (icon `warehouse`) vào nhóm "Báo cáo", giữa Thống kê giao hàng và Tra cứu vận đơn J&T.

**Verify**: unit harness 30/30 assertions pass (currency rate, status buckets, lọc ngày, code-merge, canonical supplier, alt field names quantity/qty + priceUnit/price, discount, gom NCC + "(Không rõ NCC)"). Browser render smoke (mock fetch): KPI + 2 bảng đúng số, cột Chưa nhận amber `#fffbeb`/`#b45309`, toggle SP/NCC + CSV OK, **0 console errors**. Status: ✅ (chờ deploy web2-api để online smoke)

### [so-order] Phase 3b: modal "Tạo Đơn Hàng" dùng Web2VariantPicker (biến thể theo món)

Wire `Web2VariantPicker` vào ô Biến Thể mỗi dòng trong modal Tạo/Sửa đơn (thay input đơn cũ).

**Sửa:**

- `so-order-modal-core.js`: `_newModalRow` thêm `category`; `modalRowHtml` ô variant → `<div class="so-vp-host">` (fallback input cũ nếu picker chưa load); `renderModalRows` gọi `_mountModalVariantPickers()` mount picker mỗi dòng (destroy picker cũ trước → tránh leak subscription cache); onChange → `row.variant`+`row.category` + `updateRowMeta`.
- `so-order-modal-submit.js`: cả 2 nhánh (tạo mới + sửa lô) truyền `category` vào `addRow`; **guard expand**: variant có `" + "` (BỘ) KHÔNG expand theo `"/"` (tránh băm "Trắng / M + Đen / L").
- `so-order-render.js` `_explodeVariants`: cùng guard `" + "`.
- cache-bust modal-core/submit `?v=20260626f`.

**Verify** (browser): mở Tạo Đơn → ô Biến Thể có picker (chips Áo/Quần/Đầm + dropdown gợi ý Màu thật từ kho); chọn Áo+Quần + gõ Trắng/Đen → `modalRows[0].variant="Trắng + Đen"`, `category="Áo + Quần"`; old input = 0. Status: ✅ (Phase 4 products tiếp)

### [issue-tracking] Nút Xóa: CHỈ ADMIN + chuyển sang HARD delete (soft bị ràng buộc DB chặn)

Follow-up của nút 🗑️ bên dưới. User: "chỉ admin mới xóa được" + "xóa đơn Nguyễn Yến trong DB". Phát hiện **soft delete hỏng toàn DB**: ràng buộc `customer_tickets_status_check` (render.com/migrations/001_create_customer_360_schema.sql:230) KHÔNG cho `status='DELETED'` → `DELETE /v2/tickets/:id` (soft) luôn fail. Thêm nữa, guard chống trùng FIX_COD/BOOM (render.com/routes/v2/tickets.js:478-487) chỉ bỏ qua `CANCELLED` → phiếu soft-deleted vẫn **chặn tạo lại** đơn cùng mã. ⇒ User chọn **hard delete** (xoá hẳn, tạo lại được).

**Sửa** (`issue-tracking/js/script.js`):

- Gate nút 🗑️ đổi từ quyền `issue-tracking:delete` → **`window.authManager.isAdminTemplate()`** (roleTemplate==='admin'). Nút Hủy 🚫 giữ nguyên quyền `delete`.
- `window.deleteTicket`: check `isAdminTemplate()` (defense-in-depth) + `ApiService.deleteTicket(code, true)` (HARD) + confirm "XÓA VĨNH VIỄN… KHÔNG khôi phục được (tạo lại phiếu mới OK)". Audit `newData.status='HARD_DELETED'`.
- `index.html`: cache-bust `script.js?v=20260626b`.

**Đã xoá theo yêu cầu**: ticket `TV-2026-01043` (Nguyễn Yến 0911353040, đơn NJD/2026/72854 #441206, FIX_COD/CUSTOMER_DEBT, 200k, COMPLETED) — hard delete qua API, verify `search` 0 match + fetch 404. (Lưu ý: KHÔNG tự hoàn lại 200k đã trừ nợ ví khách.)

**Verify** (Playwright headless, admin): `isAdminTemplate=true`, tab Hoàn Tất **220/220** phiếu có nút 🗑️ (giảm 1 vì vừa xoá). Status: ✅

### [issue-tracking] Thêm nút Xóa phiếu (🗑️) cho phiếu đã hoàn tất / đã hủy / chờ đối soát

User yêu cầu "xóa đơn như hình" — phiếu **Sửa COD (Hoàn Tất)** trong trang issue-tracking chỉ có nút Sửa (✏️), không có cách xóa khỏi danh sách. Backend đã sẵn `DELETE /api/v2/tickets/:id` (xóa mềm `status='DELETED'`, list query đã loại `status != 'DELETED'`, bắn SSE `deleted` → tự refetch) + `ApiService.deleteTicket(code, hard)` — chỉ thiếu UI gọi.

**Sửa** (`issue-tracking/js/script.js`):

- `renderActionButtons`: thêm `deleteButton` (🗑️) hiển thị khi `canCancel && ticket.status !== 'PENDING_GOODS'` (dùng status, KHÔNG dùng `isUntouched` để MỌI phiếu đã hoàn tất đều xóa được — kể cả RETURN_SHIPPER còn công nợ ảo chưa dùng). Cùng quyền `issue-tracking:delete` như nút Hủy. Phiếu `PENDING_GOODS` chưa xử lý vẫn chỉ hiện 🚫 Hủy.
- `window.deleteTicket(firebaseId)`: check quyền → confirm (cảnh báo type-aware: FIX_COD/BOOM không tự đảo ví; RETURN_SHIPPER thu hồi công nợ ảo chưa dùng) → `ApiService.deleteTicket(code, false)` (xóa MỀM) → notify + AuditLogger `delete`. SSE tự ẩn dòng.
- `index.html`: cache-bust `script.js?v=20260626a`.

**Verify** (Playwright headless, profile riêng tránh contention, web1 auth admin): `window.deleteTicket=function`, quyền delete=true. Tab "Hoàn Tất" 221 phiếu COMPLETED → **221/221** có nút 🗑️; PENDING_GOODS chưa xử lý → 0 (chỉ 🚫). KHÔNG xóa data thật (bảng `customer_tickets` = Web 1.0 prod). Status: ✅

### [so-order] Phase 3a: ô Biến Thể inline dùng Web2VariantPicker (nhập nhiều biến thể theo món)

Wire `Web2VariantPicker` vào inline edit (double-click) ô Biến Thể của Sổ Order — yêu cầu gốc của user ("input nhập 2 biến thể"). Double-click ô → popover fixed neo theo cell: chọn loại (Áo/Quần/Đầm, multi-select) → N ô biến thể `"/"`-aware → ghép `"Trắng + Đen"`, lưu `{variant, category}`.

**Sửa:**

- `so-order/index.html`: load `web2-product-types-api.js` + `web2-product-types-cache.js` + `web2-variant-picker.js`; cache-bust 4 file sửa `?v=20260626e`.
- `so-order-inline-edit.js`: `beginInlineCellEdit` field `variant` → `_beginVariantPickerEdit` (popover + commit on click-outside/Enter, cancel Esc). KHÔNG auto-expand cartesian khi sửa (tránh nhân đôi SL) — expand chỉ ở lúc TẠO.
- `so-order-storage.js`: `addRow` thêm field `category`. (`updateRow` đã nhận mọi field.)
- `so-order-render.js`: cột Biến Thể hiện badge `category` (`.so-cell-cat`) trước biến thể.
- `so-order.css`: style `.so-cell-cat` + `.so-vp-editing`.

**Verify** (browser localhost, web2 auth): double-click ô → popover chips [Áo,Quần,Đầm] + 1 ô; chọn Áo+Quần → 2 ô; gõ Trắng/Đen → click ngoài → row `variant="Trắng + Đen"`, `category="Áo + Quần"`, cell "Áo + Quần Trắng + Đen · SL 1", popover đóng. Status: ✅ (Phase 3b modal + Phase 4 products tiếp theo)

### [web2/product-types] Phase 1: trang quản lý "Loại sản phẩm" (Áo/Quần/Đầm…) — CRUD admin

Feature lớn (4 phase) cho ô Biến Thể nhập nhiều biến thể theo món + module dùng chung. **Phase 1**: trang quản lý LOẠI sản phẩm trong menu Cấu hình (mirror Kho Biến Thể). Bỏ nhãn "Set" — combo = multi-select loại đơn (quyết định user). Kế hoạch đầy đủ: `~/.claude/plans/jaunty-munching-llama.md`.

**Mới:**

- BE `render.com/routes/web2-product-types.js`: table `web2_product_types` (name unique, sort_order, is_active) + REST list/get/create/update/delete (`requireWeb2AuthSoft` cho write) + SSE topic `web2:product-types` + audit (entity `product-type`). Pool `web2Db||chatDb`.
- `server.js`: require + mount `/api/web2-product-types` + initializeNotifiers (mirror 3 chỗ của variants). Worker tự route qua catch-all `/api/web2-*` → web2-api (KHÔNG sửa worker).
- FE `web2/product-types/` (index.html + api + app + css): CRUD page UI-first (Web2Optimistic) + SSE realtime.
- Shared `web2/shared/web2-product-types-cache.js` (`Web2ProductTypesCache`): 1 nguồn loại SP cho Kho SP + Sổ Order (Web2SmartCache name `product-types`).
- Sidebar `web2-sidebar.js`: item "Loại sản phẩm" trong Cấu hình + WEB2_PAGES.

**Verify:** ✅ web2-api deploy live (`/api/web2-product-types/health` ok, autoDeploy); login+create Áo/Quần/Đầm 200; trang render "3 loại" + modal mở (browser localhost). Status: ✅

### [web2/shared] Phase 2: module dùng chung `Web2VariantPicker` (biến thể theo món)

`web2/shared/web2-variant-picker.js` — NGUỒN DUY NHẤT nhập biến thể theo MÓN (dùng chung Kho SP + Sổ Order). Multi-select loại (chip từ `Web2ProductTypesCache`) → N món; mỗi món 1 ô `"/"`-aware (gợi ý Màu/Size từ `Web2VariantsCache`). Ghép `category="Áo + Quần"` + `variant="Trắng / M + Đen / L"`; `getCombos()` cartesian khi 1 món nhiều token (giữ bulk-create). CSS scoped tự inject; degrade gọn.

API: `mount(el,{category,value,compact,showTypes,onChange})→{getVariant,getCategory,getCombos,setValue,focus,destroy,el}`.

**Verify** (browser inject+mount): round-trip category/value đúng; chip Áo*/Quần*, 2 ô prefill; 1 món "Trắng/Đen/S/M" → combos 4. Status: ✅ (chưa wire — Phase 3/4)

Workflow audit 8 nhóm (11 agent, find + adversarial verify) các fetch WRITE tới route web2 auth-gated thiếu token. **6/8 nhóm sạch**, 5 vi phạm thật:

- `live-native-orders-api.js`: `update()` PATCH + `remove()` DELETE `/api/native-orders/:code` (gated requireWeb2AuthSoft) → thêm helper `_w2AuthHeaders` (mirror `LiveApi._w2AuthHeaders`) + dùng cho cả 2.
- `live-kho-enricher.js`: `postBatch` POST `/api/web2/customers/batch-by-fbid|phone` (fallback khi LiveCustomerSync chưa load) → thêm `Web2Auth.authHeaders`.
- `native-orders-pbh-bill.js`: POST `/:code/split-order` + `/:code/cancel` → thêm `...Web2Auth.authHeaders()` (các sibling cancelPbh/createPbh đã có, 2 chỗ này bị sót).

Bump cache-bust 3 file `?v=20260626tok`. node --check OK. Cùng Part B (global guard 401→đăng xuất) đảm bảo: write có token (không 401 oan) + nếu token hết hạn vẫn auto đăng xuất re-login. Các nhóm purchase-refund/customer-wallet/products/jt-tracking/balance-history/web2-shared/so-order/pancake = sạch (không thiếu token). Status ✅

### [web2/shared] Auth guard: web2 WRITE 401 (token thiếu/hết hạn) → tự ĐĂNG XUẤT (Part B)

User: "thiếu token thì đăng xuất để user đăng nhập lại". Thêm vào `web2-auth.js`:

- `Web2Auth.handleAuthExpired()` — guard 1-lần: `clear()` token + `location.replace(login?next=<trang>&expired=1)`.
- **Global fetch guard** (`installWriteAuthGuard`): wrap `window.fetch`, bắt `status===401` từ MỌI **WRITE** (POST/PATCH/PUT/DELETE) tới route web2 (`/api/web2*`, `/api/v2/web2*`, `/api/native-orders`, `/api/fast-sale-orders`, `/api/wallet-deposits`, `/api/realtime/web2`, hoặc `web2-api*.onrender.com`) → `handleAuthExpired()`. Loại endpoint auth (login/logout/me/verify) tránh loop; 403 (thiếu QUYỀN) KHÔNG đăng xuất. Bao phủ TOÀN BỘ call site không cần sửa từng nơi — kể cả chỗ lỡ thiếu token (401 → đăng xuất → đăng nhập lại → retry có token).

Part A (audit + thêm `x-web2-token` cho các write còn thiếu, để không bị 401→đăng xuất oan) chạy workflow riêng. node --check OK. Status ✅

### [live-chat] FIX 401 live-hidden-commenters — \_save thiếu x-web2-token

Console live-chat: `POST /api/web2/live-hidden-commenters/create` **401** (+ GET `/get/global` 404 là first-run BÌNH THƯỜNG → seed defaults). RCA: route `/:entity/create` + `/update/:code` (web2-generic.js) gated `requireWeb2AuthSoft` → cần `x-web2-token`. File có helper `_lhcHeaders()` (gửi token) và `_hideRemote`/`_unhideRemote` đã dùng (đợt A4), nhưng **`_save` vẫn dùng header trần** `{Content-Type}` → create/update 401 cho MỌI user (không chỉ session test) → record global không seed/persist được.

**Fix** (`live-hidden-commenters.js`): `_save` đổi `const headers = {...}` → `const headers = _lhcHeaders()` (hoisted fn decl, callable từ trên). Create + update giờ gửi token. Bump `?v=20260626auth`.

Lưu ý: 404 GET `/get/global` GIỮ NGUYÊN (contract first-run, client tự seed defaults + create). node --check OK. Status ✅

### [web2/shared] Web2NumberInput — module CHUNG format số tiền khi NHẬP (1.000 · 2,64) + retrofit 6 trang ví/tiền

User: "web 2.0 → module chung các số đều có `.` ở hàng ngàn (1.000, 24.000), thập phân là dấu `,` (2,64) — các input đều nhận như vậy, đang nhập 1000 thì hiện 1.000". Phạm vi user chọn: **chỉ ô tiền** (không đụng SĐT/mã/SL); **module + trang trọng điểm trước** (rải còn lại opt-in sau).

**Module mới** `web2/shared/web2-number-input.js` (`window.Web2NumberInput`, ~250 dòng) — 1 NGUỒN format số khi gõ:

- `parse(str)` (vi-VN: `.`=nghìn, `,`=thập phân → Number), `format(n,{decimals})`, `attach(el,opts)`, `attachAll(root)`, `getValue(el)`/`getValueOr`, `setValue(el,n)`, `config({observe})`.
- **Live format giữ caret** khi gõ (đếm ký-tự-có-nghĩa, dấu `.` nghìn auto-sinh không nhảy con trỏ); mode số nguyên + thập phân (`data-w2num` / `data-w2num="decimal"` / `data-w2num="3"`).
- **Auto-init**: quét `[data-w2num]` lúc DOMContentLoaded + **MutationObserver** → tự gắn cả ô render động (modal rows). Ô `type=number` tự đổi `type=text inputmode=numeric/decimal` (number không hiện được `.`).
- ⚠ **Bẫy `.value`**: ô hiện "1.000" thì `Number(el.value)`=1 → đọc số thật PHẢI qua `Web2NumberInput.getValue(el)`. `getValue` parse thẳng từ `el.value` (không tin dataset → an toàn khi code gán `.value=''` trực tiếp).

**Retrofit 6 trang tiền trọng điểm** (đổi input + sửa MỌI read-site `Number(el.value)`→`getValue`, set-site→`setValue`; đều có fallback defensive `window.Web2NumberInput ? … : …`):

- `balance-history` nạp tiền (`w2mdAmount`); `chi-tieu` (`ctfAmount`, modal động + `attachAll`); `supplier-wallet` (`swPayAmount`) + `supplier-debt` (`sdPayAmount`); `products` (`pmPriceBuy`/`pmPriceSell` + drawer `data-f=price/originalPrice`) — KHÔNG đụng `pmStock`/tồn (SL).
- `so-order` (đầy đủ, **currency-aware → decimal**): modal rows `costPrice`/`sellPrice`, form `shipDiscount`/`shipShipping`/`shipContractAmount`, per-order meta (`data-pm` HĐ/Giảm/Ship), inline-edit + bulk-edit price cells. Tích hợp coexist với `onModalPriceBlur` (VND shorthand 100→100.000) + live-recompute tổng. Audit 8 domain (workflow) → map 28 input + 44 read-site phá vỡ; chốt scope chỉ tiền.

**Verify**: (1) Unit test Node 41/41 (parse/format/live int+decimal/getValue trap/setValue) ✅; (2) `node --check` 15 file JS ✅; (3) Browser localhost thật: balance-history gõ `1000000`→`1.000.000` getValue 1000000 ✅; so-order modal row `1000000`→`1.000.000` (state 1000000) · shorthand `100`→blur→`100.000` (tổng 100.000₫ đúng) · decimal `12,5`→state 12.5 ✅; products setValue 250000→`250.000` + gõ `1500000`→`1.500.000` ✅. Status: ✅

**Đợt 2 (2026-06-26) — áp nốt trang còn lại** (user "thêm vào Còn lại"):

- `native-orders` modal tạo PBH: `pbhDeposit`/`pbhDeliveryPrice`/`pbhPaymentAmount` (popup `openCustomFormPopup` → `onMount` gọi `attachAll(root)`; set dropdown-change + shopMode qua `setValue`; collect đọc `getValue`).
- `purchase-refund`: `price` (quick modal — set/đọc + `updateQuickTotal`) + `totalAmount` (create/edit modal — đọc qua **FormData** nên dùng `Web2NumberInput.parse(fd.get('totalAmount'))`, set qua `setValue`).
- `payment-confirm` / `reconcile` / `fastsaleorder-refund`: **không có ô tiền nhập tay** (read-only/display) → không cần áp.

Verify browser localhost: purchase-refund `price` gõ `1500000`→`1.500.000` getValue 1500000 · `totalAmount` setValue 26000000→`26.000.000` parse-from-FormData→26000000 ✅; native-orders PBH popup (seed đơn ảo) `pbhDeposit` prefill 50000→`50.000`, gõ `1200000`→`1.200.000` getValue 1200000, attach qua onMount ✅. `node --check` 3 file JS sạch. Status: ✅ — **toàn bộ ô tiền nhập tay Web 2.0 đã có Web2NumberInput.**

### [so-order][web2/products] In tem/mã SP dùng CHUNG module web2/products — gỡ modal "In mã vạch" legacy fork

User: ở Sổ Order, in mã SP phải **dùng chung module bên products** (Kho SP), không phải modal "In mã vạch" riêng. Bug: nút "In tem" (nhận hàng) mở modal legacy `soBarcodeModal` ("In mã vạch — <NCC>") thay vì modal in dùng chung.

**Nguyên nhân:** module in của web2/products đã **tách 5 file** (`-print-utils`→`-print-barcode`→`-print-render`→`-print-modal`→`-print` entry, đều populate `window.W2PP`), nhưng so-order **chỉ load file entry** `web2-products-print.js` → `window.W2PP.open` undefined → `Web2ProductsPrint.open` undefined → `SO.openBarcodePrintModal` rớt về modal fork legacy.

**Fix:**

- `so-order/index.html`: load đủ **5 file print theo thứ tự** (thêm utils/barcode/render/modal trước entry). JsBarcode/QR module tự load CDN; Web2Printer/Web2QR đã có sẵn ở so-order.
- `so-order/js/so-order-barcode.js`: **gỡ HẲN modal fork legacy** + `printBarcodes` + `_updateBarcodeSummary` (~160 dòng). `openBarcodePrintModal` giờ delegate 100% sang `Web2ProductsPrint.open` (1 nguồn như Kho SP); thiếu module → báo lỗi rõ, KHÔNG fork.

**Verify** (browser localhost): sau reload `Web2ProductsPrint.open`=**function** (trước: undefined); gọi `openBarcodePrintModal(...)` mở modal CHUNG (`.w2p-print-header`), KHÔNG tạo `#soBarcodeModal`; 0 console error; 0 dangling ref. Status: ✅

**Follow-up (user chọn):** đổi tiêu đề modal in `In mã vạch` → **`In mã sản phẩm`** trong module dùng chung (`web2-products-print-modal.js` h4 `#w2pPrintTitle` + `web2-products-print-render.js` print-window `<title>`) → áp dụng CẢ Kho SP (products) lẫn so-order. Tab/cảnh báo "mã vạch" GIỮ nguyên (phân biệt SP có/không có mã). Cache-bust render+modal `?v=20260626b`. Verify: modal title = "In mã sản phẩm" ✅

### [purchase-orders][web2/shared] Cầu nối XUẤT bảng PO (Web 1.0) → mã base64 → NHẬP vào Sổ Order (Web 2.0)

User: ở `purchase-orders/index.html` cho xuất dữ liệu bảng thành 1 mã (base64) → dán vào `so-order/index.html` (đã có sẵn modal "Nhập Sổ Order"), **không đụng chạm code/DB giữa Web 1.0 ↔ Web 2.0** — cầu nối duy nhất là mã copy-paste / file.

**Định dạng (data contract, KHÔNG share code):** `N2IMPORT1:` + base64(UTF-8 JSON `{_n2,v,kind,src,exportedAt,count,rows:[…]}`). `rows` khớp ĐÚNG cột Web2Import của so-order (`supplier,date,batch,productName,variant,qty,costPrice,sellPrice,note,costNote,status`).

**Web 1.0 — encoder + UI** (mới `purchase-orders/js/lib/so-order-export.js`, self-contained, KHÔNG import web2/): map đơn tab đang xem → rows (mỗi đơn = 1 lô qua `batch`=orderNumber; status PO→Nháp/Đã nhận/Đã hủy; variant `-`→rỗng; bỏ qua SP thiếu tên), encode token, modal Copy / tải `.txt` / `.json`. Nút **"Xuất Sổ Order"** ở filter-bar (`ui-components.js` renderFilterBar + bind; `main.js` handler `onExportSoOrder`). Khung modal không chèn giá trị động qua innerHTML (token set `.value`, số liệu `.textContent` — chống XSS).

**Web 2.0 — decoder** (sửa shared `web2/shared/web2-import.js`, 1 nguồn → lợi cho MỌI modal import web2): `parseInput()` nhận diện prefix `N2IMPORT1:` → base64-decode UTF-8 → JSON (đã sẵn xử lý `{rows:[…]}`). Có guard size (~6 MB) chống DoS. Placeholder ô dán + cache-bust `?v=20260626a` ở so-order + web2/products.

**Verify:** (1) Node contract round-trip (UTF-8 tiếng Việt, status enum, note fallback, skip thiếu tên) ✅; (2) Browser e2e localhost: PO 3 đơn→**26 dòng** token → so-order paste → preview **"26 dòng hợp lệ / Sẵn sàng nhập 26 dòng order"**, 0 lỗi ✅ (chỉ preview, KHÔNG commit data thật). Code-review: tách layer sạch, mapping đúng, 2 HIGH (XSS latent + size cap) đã fix. Status: ✅

### [web2/admin] Wipe data 9 trang vận hành Web 2.0 (beta) + endpoint `/web2-wipe-9pages`

User yêu cầu xóa data DB Web 2.0 cho 9 trang: fastsaleorder-invoice, reconcile, native-orders, so-order, purchase-refund, supplier-debt, supplier-wallet, ck-dashboard, products. Map từng trang → bảng web2Db (workflow 9 agent đọc HTML→JS→route→SQL): không endpoint sẵn nào khớp đúng (broad `web2-data-wipe` lỡ giết `web2_variants` + thiếu `fast_sale_order_history`/`pbh_fulfillment_logs`/`web2_customer_intents`/`web2_records[slug=purchase-refund]`/seq).

**Mới** (`render.com/routes/admin-web2-data-reset.js`): thêm `POST /api/admin/web2-wipe-9pages` (header `x-admin-secret`, `{confirm:'YES-RESET', dryRun?}`, web2Db-only guard, auto-backup `<t>_bak_<tag>`, FK cascade-risk fail-loud). Truncate 24 bảng (đơn/PBH/fulfillment/so-order/SP/NCC-ledger+meta/CK + downstream ví KH/KPI/tag/cart/campaign/returns/QR/pending), DELETE `web2_records WHERE entity_slug='purchase-refund'`, reset seq `web2_supplier_move_seq`, UNLINK (giữ dòng) `web2_balance_history` cờ match.

**Đã chạy** (user chọn scope "9 trang + dọn liên kết"): 244 dòng truncated (19 bảng có data) + 3 purchase-refund + 37 balance unlinked, 24+2 backup. **GIỮ**: web2_customers, web2_balance_history (dòng), web2_variants (108), auth/config. Verify post-wipe: mọi target=0, variants=108 nguyên. Backup `*_bak_20260626_104302_4ccb` còn trên web2Db — drop sau khi yên tâm qua `POST /api/admin/web2-cleanup-dead {confirm:'YES-CLEANUP'}`. Status: ✅

### [web2/cham-cong] Hôm nay chưa tan ca → "đang làm", KHÔNG tính chấm thiếu (đến 20:05 mới tính)

User: "Hôm nay 26/06 nên không cần tính chấm thiếu, sau 20h:05 mới tính". Lỗi: grid dot + đối soát dùng `S.dayStatus()` trả 'missing' cho mọi ngày 1-lượt → HÔM NAY (NV mới vào sáng, chưa bấm ra) bị tô đỏ "chấm thiếu" + vào đối soát, dù đang làm việc, sẽ bấm ra cuối ca.

**Fix** (`cham-cong-app.js` renderTimesheet): thêm trạng thái `inprogress` — HÔM NAY + `nowMin <= work_end + grace` (vd 20:06) + status 'missing' (1 lượt) → đổi thành `inprogress` ("Đang làm"), KHÔNG vào `needFix` (đối soát). Dot sky `#0ea5e9` glyph •, thêm legend "Đang làm (chưa tan ca)". Đồng bộ ngưỡng `renderTodayHtml` quenRa: `nowMin > endMin` → `nowMin > endMin + grace`.

**Verify** (Playwright + admin login, ~10:46): đối soát **19→9** (mọi chip 26/06 biến mất, chỉ còn missing ngày cũ Còi 12/13/16/25, Dung 03, Bo 13/15/16/24); cột hôm nay **10 dot "đang làm" (sky), 0 đỏ "chấm thiếu"**, 1 xám (chưa vào). Cache-bust app/css `?v=20260626att2`.

### [web2/cham-cong] NV chưa gán user → KHÔNG cần chấm công (ẩn khỏi Bảng công/Hôm nay/đối soát, GIỮ Bảng lương)

User: "không gán user thì không cần chấm công". Trước đây `isVisibleEmp = employee_id || manual` → NV thủ công lương tháng chưa gán (Chị Út, Phước Lớn, Thái, Vú Thanh, Vú Trang) hiện ở Bảng công + "Chưa vào" + đối soát dù KHÔNG bấm máy → nhiễu.

**Fix** (`cham-cong-app.js`): thêm helper `needsAttendance(du) = !!du.employee_id` (chỉ NV đã GÁN user mới cần chấm công). Đổi filter **Bảng công (grid) + Hôm nay (chưa vào) + đối soát** (2 chỗ) + empty-state `hasUnassigned` sang `needsAttendance`. **GIỮ `isVisibleEmp` (employee_id || manual) cho Bảng lương** (`cham-cong-payroll.js`) → NV thủ công lương tháng vẫn được trả lương. NV chưa gán vẫn ở tab Nhân viên để gán.

**Verify** (Playwright + admin login thật): "Chưa vào" 6→**1** (chỉ Cẩm — NV gán chưa vào); grid 16→**11** (đúng NV đã gán, 5 NV thủ công biến mất); Bảng lương **giữ 16** (5 NV thủ công lương tháng còn nguyên). Cache-bust `?v=20260626att`.

### [web2/cham-cong] Gỡ tham chiếu lay-du-lieu.bat — 1 NGUỒN AUTO duy nhất (ADMS proxy từ printer-settings)

User: "xóa lay-du-lieu.bat đi chỉ lấy bằng 1 nguồn auto". Có 2 hệ agent: (cũ) `web2-attendance-sync/` lay-du-lieu.bat + install-windows.bat (ZKLib LAN poll → push `source='agent'`, đã chết 23/06) — **folder đã bị gỡ khỏi repo**, chỉ còn UI text tham chiếu; (giữ) `attendance-sync/` → `cai-cham-cong.bat` → `adms-proxy.js` (DG-600 push ADMS → `source='adms'`), tải từ **Cấu hình in → Cài máy chấm công DG-600** (web2-attendance-installer.js). 1 nguồn auto duy nhất.

**Fix** (`cham-cong-app.js` 3 message): thay mọi "bấm lay-du-lieu.bat / install-windows.bat" → trỏ về nguồn auto duy nhất "**Cấu hình in → Cài máy chấm công DG-600**" (data-stale warning, PC-off backup, empty-state). KHÔNG đụng `web2/video-maker` install-windows.bat (đó là VieNeu TTS, khác feature). Cache-bust `?v=20260626fix5`.

⚠ Migration phía shop (không làm được từ code): cài `cai-cham-cong.bat` (tự gỡ bản cũ + autostart nền) + cấu hình máy DG-600 menu Comm/Cloud/ADMS đẩy về IP PC:proxyPort. Agent cũ source='agent' trên PC nên gỡ tay.

### [web2/cham-cong] Sync strip phân biệt KẾT NỐI vs DỮ LIỆU mới (bắt case máy online nhưng không đẩy chấm công)

User báo: data dừng ở 23/06 dù strip hiện "Đang đồng bộ · Lần cuối 08:32 26/06". Chẩn đoán: `last_sync_time` bị `touchAdmsStatus` bump mỗi heartbeat ADMS (~10s) của máy DG-600 → strip xanh dù KHÔNG có punch mới. Strip cũ chỉ đo CONNECTION freshness, không đo DATA freshness → đánh lừa.

**Fix** (`cham-cong-app.js` renderSyncStrip + `latestRecordDateKey()` helper + css): tách "**Đang kết nối**" (heartbeat) khỏi "**Dữ liệu mới nhất: DD/MM**" (date_key bản ghi mới nhất). Khi xem tháng hiện tại + data trễ ≥2 ngày → strip chuyển `off` (đỏ) + cảnh báo "⚠ Máy kết nối nhưng KHÔNG có chấm công mới N ngày — bấm lay-du-lieu.bat + kiểm tra DG-600". `.cc-sync .cc-sync-stale` đỏ (specificity 0,2,0 thắng `.cc-sync b`).

Xác nhận deploy của tôi KHÔNG gây lỗi này: ingest gate trả **401** (secret đã set env) chứ không 503 (fail-closed) → agent đúng secret vẫn vào được; gap 23/06 có trước deploy hôm nay. Verify: unit-test staleDays (23/06 vs 26/06 = 3 ngày stale; hôm qua=không; tháng cũ=không) ALL PASS; screenshot strip "Đang kết nối · Dữ liệu mới nhất 23/06 (đỏ) · ⚠ 3 ngày". Cache-bust app/css `?v=20260626fix4`.

### [web2/cham-cong] FIX đợt 4 (Group C đối soát + Group D a11y/perf)

**Group C — hàng đợi ĐỐI SOÁT chấm thiếu cả tháng** (`cham-cong-app.js` renderTimesheet): ngày chấm THIẾU 1 lượt (quên bấm vào/ra) đang trả 0đ âm thầm — trước chỉ cảnh báo "hôm nay". Giờ gom TOÀN THÁNG mọi NV (status `missing`) → panel "⚠ Cần đối soát (N)" với chip `NV · DD/MM` bấm mở openDay chấm bù. Verify screenshot: panel cam + 3 chip.

**Group D — a11y + perf**:

- **Chấm có GLYPH** (a11y WCAG 1.4.1 — không chỉ phân biệt màu): ✓ đúng giờ · ! muộn/sớm · ? chấm thiếu · trống = nghỉ. `cc-dot` flex-center + `[data-g]::after` (`cham-cong.css`) + `aria-label` từng chấm. Verify screenshot: glyph trắng trong chấm màu.
- **Event delegation**: 1 listener trên `#ccBody` (bind 1 lần qua `dataset.ccDelegated`) thay ~496 listener/ô tạo lại mỗi render SSE. Ô lưới + chip đối soát chung handler.
- **Modal Esc + ARIA**: global keydown Esc đóng modal đang mở (`#ccModalMount`); thêm `role="dialog" aria-modal aria-label` cho 3 modal (ngày + chi tiết + sửa lương). Verify: Escape → modal đóng.
- **Sticky name truncate**: `.cc-name-txt` max-width 110px + ellipsis (tên dài không phá lưới mobile). Verify: "NGUYỄN THỊ M…".
- **SSE doc**: thêm `web2:attendance` vào registry topics CLAUDE.md.

Cache-bust app `?v=20260626fix`, css `?v=20260626fix`. **CHƯA làm (LOW polish, follow-up)**: memoize calcMonth per-emp, gỡ CSS chết render cũ, modal body-scroll-lock (Tier-1 anti-lag) + period-lock full server-recompute.

### [web2/cham-cong] FIX đợt 3 (Group B — backend security)

- **Secret ingest FAIL-CLOSED** (`render.com/routes/web2-attendance.js` requireAgentSecret): thiếu `WEB2_ATTENDANCE_SECRET` trước đây MỞ (ai cũng chèn punch) → giờ trả **503**, trừ khi bật cờ tường minh `WEB2_ATTENDANCE_ALLOW_OPEN=1` (dev). Prod đã set secret → không đổi hành vi. (Giữ `?secret=` query vì agent đẩy chấm công là phần mềm NGOÀI repo — không xác minh được header; bỏ query cần phối hợp cấu hình agent, hoãn như ADMS.)
- **`/api/web2-users/list` bỏ PII cho non-admin** (`web2-users.js`): non-admin chỉ nhận id/tên/role/active/avatar — bỏ email/SĐT/note/permissions của NGƯỜI KHÁC (admin vẫn đủ qua `reveal`). Fix tại handler, KHÔNG đụng `mapRow` (dùng chung self-profile).
- **period-lock validate snapshot** (`web2-attendance.js` POST /period-lock): chặn NaN/∞/số > 1e12 + nhất quán nội bộ mỗi dòng (`tongLuong = luongChinh+lamThem+phuCap+thuong−giamTru`, `conCanTra = tongLuong−daTra`, ±2đ rounding). Reject 400 nếu lệch. Admin-only nên rủi ro thấp; đây là fail-fast với client lỗi/bịa (full server-recompute = follow-up lớn hơn, cần đưa salary.js thành module universal). Verify: unit-test accept valid + reject tampered/NaN/absurd/lệch-monthKey/thiếu-rows.

### [web2/cham-cong] FIX đợt 2 — grace smooth + monthly late reset + dup-PIN dedupe tổng

Sau audit, user chọn fix tiếp (ADMS auth hoãn — beta). Group A (sai tiền/chính sách):

- **Grace "cliff" → SMOOTH** (`cham-cong-salary.js` calcDay): trước vượt grace bị phạt TỪ phút 0 (08:06=0' nhưng 08:07=7'). Giờ THA tối đa `grace` phút → muộn = max(0, thực−grace), đối xứng cho cả vào (đi muộn) lẫn ra (về sớm). Verify: 08:07→1', 08:20→14', base liên tục (300000→299583), về sớm 19:50→4'.
- **Lương THÁNG KHÔNG auto phạt muộn** (calcMonth isMonthly branch): reset `lateDeduction=0` + `lateDays=[]` (nhất quán với OT=0 monthly; muốn phạt → "Giảm trừ thủ công"). Verify: monthly late 1h → ded 0, tổng giữ 10tr; manual override 50k vẫn áp; daily vẫn phạt (60−6)×1000=54000.
- **Dup-PIN KHÔNG cộng đôi TỔNG** (`cham-cong-payroll.js` render + lock snapshot): 1 NV gán nhiều PIN → tổng chỉ cộng 1 lần (PIN đầu), dòng trùng vẫn hiện + đánh dấu "(∉ tổng)". Lock snapshot total cũng dedupe + bổ sung pc/thuong/giam (trước thiếu). Verify: 2 PIN cùng emp → tổng 900k (đúng), PIN2 skip.

Cache-bust salary `?v=20260626fix2`, payroll `?v=20260626fix`.

### [web2/cham-cong] AUDIT đa tác tử (42 agent) + FIX 2 bug lương sai tiền

User: "audit debug" trang Chấm công. Chạy workflow audit 8 chiều × adversarial-verify (30/33 finding confirmed: 3 CRITICAL, 5 HIGH, 13 MEDIUM, 9 LOW) + browser-debug live (test pure calc `ChamCongSalary`).

**FIX ngay (sai tiền, an toàn — `cham-cong-salary.js`)**:

- **CRITICAL — OT override trên NV lương THÁNG → overpay ~26×**: block `ot_hours_override` (calcMonth) chạy vô điều kiện, chia `cfg.dailyRate` (= lương CẢ THÁNG với monthly) cho giờ-công-1-ngày → hr khổng lồ. Vd lương 10tr ca 12h, override 2h ×2 = **3.333.333đ** OT cho 2 giờ. Auto-OT đã ép 0 cho monthly nhưng override bỏ qua guard. → Gate `if (!isMonthly && ...)`. Verify: monthly lamThem 3.333.333 → **0**; daily override vẫn 75.000 đúng; luongChinh tháng giữ 10tr.
- **LOW — hệ số OT = 0 bị ép thành 1×**: `Number(cfg.otMultiplier) || 1` → 0 thành 1× (trả full OT thay vì tắt OT). Đổi `Number.isFinite(...) ? ... : 1` (3 chỗ: const otMult + nhánh override). Verify: otMult 0 → otPay 0 (was 50.000); undefined vẫn 1×.

Cache-bust `cham-cong-salary.js?v=20260626fix`.

**Browser-debug thêm** (ChamCongSalary đúng phần lớn: OT daily/monthly, grace ≤6, daysOfMonth, missing-cfg no-NaN):

- Grace "cliff": 08:06 muộn 0' → 08:07 muộn **7'** (full, không phải 1'). Vượt grace bị phạt từ phút 0. → câu hỏi chính sách.
- Naive `check_time` TZ: `new Date(r.check_time)` không chuẩn hoá +7 → chỉ đúng nếu API trả ISO có offset (browser +7 che lỗi).

**CÒN LẠI — chờ quyết định** (audit findings, chưa fix vì cần phối hợp/đụng auth thiết bị/backend): ADMS `/iclock/*` ZERO auth (CRITICAL — forge punch→forge payroll), monthly late-penalty (policy), dup-PIN double-count total, deleted-punch resurrect, secret fail-open + query-string leak, period-lock client-trusted, web2-users/list lộ PII non-admin, perf full-rerender/496-listener, a11y color-only/modal Esc-ARIA, dead CSS. Xem báo cáo chat.

### [web2/order-tags] Thêm trigger "Có ghi chú SP" (ghi chú cấp dòng sản phẩm)

User: "có ghi chú sản phẩm" → thêm trigger phân biệt ghi chú CẤP DÒNG SP với ghi chú cấp đơn.

**Files** (`web2-order-tags-service.js`):

- `co_ghi_chu_sp` "Có ghi chú SP" (nhóm Nội dung / Tương tác) — predicate `Array.isArray(o.products) && o.products.some(p => _hasText(p.note))`. Mỗi dòng SP trong JSONB `products` lưu field `note` (client `setLineNote` → `line.note`, vd size/màu/yêu cầu KH). Màu teal #0d9488, icon notebook-pen, prio 43. Seed idempotent.
- Đổi tên `co_ghi_chu` "Có ghi chú" → **"Có ghi chú đơn"** (registry + seed + UPDATE idempotent thẻ cũ chỉ khi còn tên default) để phân biệt rõ với "Có ghi chú SP".

Verify: syntax OK; unit-test 9 case ALL PASS (1 SP note → true; note rỗng/null/space → false; SP không có field note → false; products undefined → false; co_ghi_chu đơn KHÔNG nhầm note SP, vẫn bật theo userNote). Status ✅ (chờ deploy)

### [purchase-orders] FIX tạo đơn với SP cũ (lấy từ Kho) bị kẹt ở Nháp, không qua Chờ mua

**Triệu chứng** (user): mua lại SP cũ → "Chọn từ Kho SP" → Tạo đơn hàng → đơn bị đẩy về **Nháp** kèm cảnh báo "Đồng bộ TPOS có lỗi — đơn giữ ở Nháp để thử lại". Nhưng bấm **Chỉnh sửa** đơn Nháp → Cập nhật thì lại chạy được và sang **Chờ mua**.

**Root cause** (đã xác minh full chain):

- Server (`render.com/routes/v2/purchase-orders.js` POST ~728 + PUT ~867) khi lưu item set `_fromWarehouse = !!(item._fromWarehouse || item.tposSynced)`.
- → Luồng **SỬA**: item nạp lại từ DB có `_fromWarehouse=true` → pre-filter trong `tpos-product-creator.js` (~1270: `tposSynced && !_fromWarehouse && !tposSyncError`) KHÔNG skip → verify qua `checkProductExists` → success → đơn sang Chờ mua. ✅
- → Luồng **TẠO**: `handleCreateOrder` gọi `syncOrderToTPOS(orderId, orderData.items)` với item **in-memory** từ Kho picker chỉ có `tposSynced=true`, CHƯA có `_fromWarehouse` (server mới thêm khi persist, mà create sync TRƯỚC khi reload) → pre-filter **skip** → `pendingGroups.size===0` → `syncOrderToTPOS` trả **`undefined`** → `handleCreateOrder` coi như lỗi → giữ Nháp. ❌

**Fix chính** = 1 dòng ở chokepoint chung:

1. `purchase-orders/js/form-modal.js` `getFormData()` — thêm field `_fromWarehouse: !!(item._fromWarehouse || item.tposSynced)` trong `items.map()`. Đây là chokepoint chung cho create + edit + save-draft → mirror ĐÚNG logic server. Item Kho giờ được verify (`checkProductExists`) thay vì bị pre-filter skip ngay từ luồng TẠO → `syncOrderToTPOS` trả `successCount>0` → `handleCreateOrder` (giữ nguyên điều kiện `failCount===0 && successCount>0`) chuyển sang Chờ mua.
2. `purchase-orders/js/lib/tpos-product-creator.js` `syncOrderToTPOS()` — 2 nhánh early-return giờ trả object `{successCount, failCount:0, results, ...}` thay vì `undefined` (defensive, contract rõ ràng).

**KHÔNG đổi** `handleCreateOrder` advance-logic (giữ `failCount===0 && successCount>0`): review adversarial chỉ ra nếu nới thành `!(failCount>0)` thì đơn có SP **chưa có mã** (groupOrderItems bỏ item không mã → `groups.size===0` → successCount=0) sẽ **advance ngầm** lên Chờ mua mà KHÔNG SP nào verify trên TPOS. Giữ điều kiện cũ → case đó an toàn ở Nháp; case Kho vẫn qua Chờ mua nhờ Fix #1.

**Verify**: trace tay full chain + workflow review (regression PASS, adversarial PASS-with-concerns). Mixed order (1 Kho OK + 1 SP mới lỗi) → `failCount>0` → giữ Nháp đúng. `syncOrderToTPOS` throw → catch trả `{failCount:1}` → giữ Nháp. don-inbox gọi `syncOrderToTPOS` fire-and-forget (bỏ qua return) → không ảnh hưởng. Status ✅

### [web2/order-tags] FIX thẻ "KHÁCH LẠ" gắn nhầm trigger + tách "Thiếu địa chỉ"

Khi verify deploy 5 trigger mới, phát hiện thẻ `code=khach_la` (tên "KHÁCH LẠ", admin tạo) gắn **NHẦM** `trigger='thieu_dia_chi'` → pill "KHÁCH LẠ" thực ra fire theo THIẾU ĐỊA CHỈ. `ON CONFLICT DO NOTHING` của seed khach_la không đè được nên predicate `khach_la` mới không có thẻ trỏ tới. User định nghĩa: **khách lạ = KH không có thông tin ở kho KH** (chưa gán customer_id) → đúng với predicate `o.customerId == null`.

**Fix** (`web2-order-tags-service.js` `ensureTable`, idempotent, no auth):

- `UPDATE web2_order_tags SET trigger='khach_la' WHERE code='khach_la' AND trigger='thieu_dia_chi'` — trả thẻ "KHÁCH LẠ" về đúng trigger `khach_la` (chỉ flip khi còn nhầm). Giữ nguyên tên/màu/icon admin (`KHÁCH LẠ`/#ca8a04/person-standing).
- Seed thẻ "Thiếu địa chỉ" riêng (`thieu_dia_chi`, #ef4444, map-pin-off, prio 35) `ON CONFLICT DO NOTHING` — không mất chức năng cảnh báo thiếu địa chỉ.
- Cập nhật desc trigger `khach_la` = "không có thông tin ở kho KH (chưa gán customer_id)".

Kết quả: "KHÁCH LẠ" giờ fire đúng (không có trong kho KH) + có thẻ "Thiếu địa chỉ" riêng. Predicate `thieu_dia_chi` (`!_hasText(o.address)`) đã có sẵn. Status ✅ (chờ deploy verify)

### [web2/order-tags] Thêm 5 trigger mới (user: "không đủ trigger")

User mở "Thêm thẻ" thấy dropdown ngắn → giải thích: dropdown CHỈ hiện trigger CHƯA dùng (1 trigger = 1 thẻ; 8/23 đã dùng bị ẩn gồm cả gio_trong vừa tạo). User chọn thêm 5 trigger mới.

**Files** (`render.com/services/web2-order-tags-service.js`) — mỗi trigger thêm 3 chỗ (TRIGGERS registry + PREDICATES + seed idempotent):

- `khach_la` "Khách lạ" (nhóm **Khách hàng** — mới) — `o.customerId == null` (chưa gán KH). Màu amber, icon user-x.
- `co_ghi_chu` "Có ghi chú" (nhóm **Nội dung / Tương tác** — mới) — `_hasText(note) || _hasText(userNote)`.
- `co_tin_nhan` "Có tin nhắn" — `messageCount > 0`.
- `co_binh_luan` "Có bình luận" — `commentCount > 1` (⚠ comment_count mặc định 1 = bình luận gốc → ngưỡng >1 để lọc đơn thực sự có bình luận bổ sung, tránh tag luôn-bật vô nghĩa).
- `da_doi_soat` "Đã đối soát" (nhóm **PBH / Trạng thái**) — `pbhFulfillmentState ∈ {packed,shipped,delivered}`.

Đã xác minh field server-side: `customerId/note/userNote/messageCount/commentCount` (mapRow native-orders) + `pbhFulfillmentState` (set ở route line 1756, TRƯỚC `enrichOrdersWithTags` line 1829). KHÔNG cần đổi frontend (order-tags page fetch `/triggers` động; native-orders render `o.autoTags`).

**Verify**: syntax OK; unit-test 16 assertion 5 predicate ALL PASS (khach_la null/0/123, co_ghi_chu note/userNote/rỗng, co_tin_nhan >0, co_binh_luan 3/1/0, da_doi_soat packed/delivered/pending/null). E2E chờ deploy (seed + predicate server-side). Status ✅ (chờ deploy)

### [web2/order-tags + native-orders] TAG mới "Giỏ trống" (trigger gio_trong)

Yêu cầu: thêm tag trigger cho giỏ trống / giỏ không có sản phẩm (tiếp nối câu hỏi "sao giỏ 2-3 không có pill KPI" — vì kpi_user cần `products.length > 0`). Tag này đánh dấu rõ giỏ rỗng.

**Files** (`render.com/services/web2-order-tags-service.js`):

- `TRIGGERS`: thêm `{ id:'gio_trong', label:'Giỏ trống', group:'PBH / Trạng thái', desc }` → xuất hiện trong dropdown trang config (`GET /api/web2-order-tags/triggers`).
- `PREDICATES`: `gio_trong: (o) => o.status !== 'cancelled' && (!Array.isArray(o.products) || o.products.length === 0)` — giỏ chưa huỷ + 0 SP (đối nghịch điều kiện kpi_user). Đơn confirmed luôn có SP → không dính; đơn huỷ rỗng đã có tag "Đã huỷ" → loại trừ tránh nhiễu.
- `ensureTable`: seed idempotent tag `gio_trong` (name 'Giỏ trống', màu `#94a3b8`, icon `shopping-cart`, priority 15) `ON CONFLICT DO NOTHING` — chạy CẢ khi bảng đã có data (block seed-4-default cũ chỉ chạy lúc bảng rỗng). Admin muốn ẩn → `is_active=false` (xoá sẽ bị seed lại lần restart).

KHÔNG cần đổi frontend: order-tags page fetch `/triggers` động; native-orders render `o.autoTags` từ `/load`. Sau deploy: giỏ rỗng (vd giỏ 2-3) tự hiện pill "Giỏ trống".

**Verify**: unit-test predicate 6 case (2-1/2-2 có SP → false, 2-3 rỗng → true, undefined products → true, confirmed có SP → false, huỷ rỗng → false) ALL PASS; syntax OK. (E2E cần deploy Render: seed tag + predicate chạy server-side.) Status ✅ (chờ deploy)

### [web2/balance-history] Chat KH đã gán → mở Pancake ĐẦY ĐỦ 3 cột (trả lời được) thay drawer 1 cột

Yêu cầu: trang Lịch sử biến động số dư (SePay), khi mở chat của KH **đã được gán SĐT** (nút 💬 ở dòng giao dịch), đang ra chat drawer 1 cột — đổi thành **chat Pancake đầy đủ** (3 cột: sidebar tìm hội thoại + thread + info), **trả lời được**, đồng nhất với chat ở Đơn Web / Live Chat.

**Files**:

- `web2/balance-history/js/web2-bh-chat-export.js`: `openChatForPhone()` nhánh có SĐT → `Web2CustomerChat.open({ layout:'modal', phone, name, query })` (trước: `{ phone, name }` → mặc định drawer 1 cột). `layout:'modal'` = giao diện 3 cột Pancake (giống native-orders). Nhánh KHÔNG có SĐT (dòng chưa gán) vẫn giữ modal tìm kiếm readonly như cũ.
- Cache-bust `web2-bh-chat-export.js?v=20260626pc`.

**Verify** (Playwright MCP, localhost): gọi `W2BH.openChatForPhone('0123456788','Test')` → DOM có `.w2cc-modal` (3 cột), KHÔNG còn `.w2cc-drawer`; sidebar tìm hội thoại hiện (search pre-fill SĐT) + thread "Chọn hội thoại bên trái để bắt đầu". Screenshot xác nhận giao diện "Chat khách hàng" 3 cột. (Hội thoại/tin thật cần token Pancake tươi ở browser thật — headless không load được, giới hạn hạ tầng đã biết.) Status ✅

### [native-orders] Nút XOÁ đơn (admin-only) — giỏ hàng/đơn huỷ xoá được, đơn đã chốt PBH KHÔNG

Yêu cầu (ảnh cột "Thao tác"): thêm nút xoá, **chỉ admin** xoá được, **đơn hàng (đã chốt PBH) không xoá được**. Trước đây nút xoá chỉ hiện cho đơn `web2_inbox` RỖNG (nháp/huỷ + giỏ trống) — quá hẹp.

**Files**:

- `native-orders/js/native-orders-render.js`: nới điều kiện `deletable` → `NO.isAdmin() && o.status !== 'confirmed'` (bỏ ràng buộc channel=web2_inbox + cartEmpty). Giỏ hàng (draft, kể cả có SP — chưa trừ kho) + đơn đã HUỶ (cancelled) xoá được; đơn `confirmed` ("Đơn hàng" đã chốt PBH) KHÔNG có nút. Chỉ admin thấy nút.
- Cache-bust `native-orders-render.js?v=20260626del`.
- Defense-in-depth: server `DELETE /api/native-orders/:code` vẫn trả 409 nếu còn PBH active liên kết (`state<>'cancel'`) — không đổi.

**Verify** (Playwright MCP, render fake orders): admin → draft ✅ có nút, cancelled ✅ có nút, confirmed ❌ không nút; staff (isAdmin=false) → draft/confirmed đều ❌ không nút. (Lưu ý row memo cache key không gồm isAdmin → test phải đổi mã đơn để bust cache.) Status ✅

### [web2/audit-log] Lọc HÀNH ĐỘNG chi tiết (action filter) — backend + frontend

Yêu cầu: trang `web2/audit-log` thêm filter "hành động chi tiết". Trước đây chỉ lọc theo entity / user / ngày, KHÔNG lọc theo `action` (create/update/delete/cancel/restock/pack…).

**Files**:

- `render.com/routes/v2/audit-log.js`: (a) `/list` nhận `?action=` → filter `action = $n` (khớp chính xác); (b) thêm `GET /actions?entity=` trả DISTINCT action từ 4 bảng history riêng (wallet=adjustment_type) + event-sink, optional lọc theo entity (entity thuộc bảng riêng → chỉ bảng đó; entity-sink → web2_audit_events; không entity → gộp tất cả).
- `web2/shared/web2-audit-log.js`: (a) `ACTION_LABELS` map slug→tiếng Việt + `actionLabel()`; (b) `<select.w2al-action>` cạnh dropdown entity; (c) `populateActions(host)` fetch `/actions` (theo entity đang chọn); (d) đổi entity → repopulate action + reload; đổi action → reload; (e) cột Action trong bảng hiển thị nhãn tiếng Việt (raw ở tooltip); (f) `load()` gửi `action=` lên server.
- Cache-bust `web2-audit-log.js?v=20260626act` (audit-log + kpi page).

**Verify** (Playwright MCP, localhost): dropdown "Tất cả hành động" render đúng; stub fetch + chọn action → list gọi `/audit-log/list?action=cancel&limit=200` (param đúng). Data load thật cần deploy backend + token tươi (token admin đã lưu hết hạn vs prod → 401, giới hạn hạ tầng, không phải lỗi code). Status ✅ (deploy để dùng đầy đủ)

### [native-orders + web2/shared chat] Chat Pancake: tự nhận diện địa chỉ/SĐT + nút "Thêm vào đơn"

Yêu cầu: trong module chat Pancake, tự nhận diện địa chỉ trong tin nhắn KH + có nút thêm vào. Feature 3 đã được scaffold sẵn (detect bar + CSS + click handler) nhưng CHƯA hoạt động vì (a) detector bỏ sót địa chỉ kiểu Facebook nhiều dòng, (b) không adapter nào set `onAddEntity` nên thanh "Phát hiện" luôn ẩn.

**Files**:

- `web2/shared/chat-panel/web2-chat-entity-detect.js`: `addresses()` thêm **(A) nhận diện KHỐI địa chỉ kiểu Facebook nhiều dòng** (`<tên>/<SĐT>/<số+đường>/<phường>/<quận>/<TP>/Vietnam` — mỗi phần 1 dòng → gộp các dòng SAU SĐT, trước "Vietnam" thành 1 địa chỉ; neo vào dòng SĐT để ít false-positive). Giữ (B) địa chỉ 1 dòng.
- `web2/shared/web2-customer-chat-modal.js` + `web2-customer-chat.js`: forward `opts.onAddEntity` + `opts.addEntityLabel` lên Pancake adapter (modal 3-cột + drawer) → thanh "Phát hiện" hiện.
- `web2/shared/chat-panel/web2-chat-panel-render.js`: nhãn nút cấu hình được (`adapter.addEntityLabel || 'Thêm vào KH'`).
- `native-orders/js/native-orders-interactions.js`: truyền `addEntityLabel:'Thêm vào đơn'` + `onAddEntity` → `NO._addDetectedToOrder(order, {phone,address})`: ghi địa chỉ vào ĐƠN (xác nhận nếu đơn đã có địa chỉ khác), SĐT chỉ điền khi đơn chưa có, nhận lại phương thức giao (`_detectDelivery`), UI-first PATCH + rollback.
- Cache-bust 5 file trên native-orders/index.html → `20260626addr`.

**Verify** (Playwright MCP, native-orders thật): detector trên mẫu thật → `addresses("Phan Nguyen\\n+84905321191\\n38a/5/4 nguyễn hữu thọ\\nhoà thuận tây\\nhải châu\\nđà nẵng\\nVietnam")` = `["38a/5/4 nguyễn hữu thọ, hoà thuận tây, hải châu, đà nẵng"]` (gộp đúng, bỏ tên/SĐT/Vietnam), chit-chat "túi đen nhé em" → `[]` (no false-positive), địa chỉ 1 dòng vẫn OK. Mount panel với adapter có onAddEntity → **thanh "Phát hiện" hiện**, nút "Thêm vào đơn", click → `onAddEntity({phone:'0905321191', address:'38a/5/4 …, đà nẵng', name:'Phan Nguyen'})`. Status ✅

**Follow-up — NÚT THỦ CÔNG trên từng tin KH** (auto-detect bỏ sót 1 số format/tin tách dòng → user yêu cầu nút bấm thủ công): thêm nút 📍 xanh (`.w2cp-addr-btn`, `data-w2cp-act="add-msg-entity"`) trên MỖI tin KH (incoming) trông như có địa chỉ/SĐT (có chữ số + đủ dài) khi adapter có onAddEntity. Click → rút địa chỉ/SĐT từ ĐÚNG tin đó (detector → fallback gộp dòng bỏ SĐT/Vietnam/tên) → `onAddEntity`. Files: `web2-chat-panel-render.js` (renderMessage +addrBtn), `web2-chat-panel.css` (+.w2cp-addr-btn), `web2-chat-panel-compose.js` (+handler add-msg-entity), `web2-customer-chat-core.js` PANEL_VER→20260626addr2. Verify Playwright MCP: nút hiện trên tin địa chỉ, KHÔNG hiện trên "túi đen nhé em" (no digit) / tin outgoing; click → `onAddEntity({phone, address:'38a/5/4 …, đà nẵng', name})`. ⚠ Không test được tin Pancake THẬT headless: page access_token hết hạn (`error_code 102 Invalid access_token`) — auto-refresh chỉ chạy ở môi trường live/extension; logic đã verify với text đúng format thật. Status ✅

## 2026-06-25

### [web2/products] Tem SP "2 tem" → ĐỔI CHỖ tên↔giá (tên xuống băng full-width, giá+biến thể lên cạnh QR)

Theo yêu cầu: (1) tên xuống vị trí giá để DÀI HƠN, giá lên vị trí tên; (2) biến thể TRÊN giá.

**Bố cục mới** (`buildLabelHTML` isQr, render.js):

- HÀNG TRÊN: [QR sạch + mã SP dưới] | cột phải [BIẾN THỂ trên → GIÁ dưới].
- **BĂNG TÊN full-width DƯỚI CÙNG** (kẻ vạch trên, canh giữa): tên rộng cả tem ⇒ tên DÀI hiện đủ 2 dòng (vd "Áo Khoác Dạ Tweed Hàn Quốc Cao Cấp Mùa Đông" full, trước bị cắt cụt khi kẹt cột ~12mm).

**Fix bug chồng lấp**: row1 đổi `flex:1`→`flex:0 0 auto` (lấy đúng cao QR, KHÔNG grow bóp mã SP), băng tên `flex:1 1 auto` ăn phần còn lại → mã SP dưới QR KHÔNG bị băng tên đè (đo overlap = −1.5px, OK). `fitName` thêm `tooTall` (thu nhỏ cho VỪA chiều cao băng, không chỉ ≤2 dòng). QR 11mm (decode 90px OK).

**Verify** (Playwright MCP trang Sản phẩm THẬT, data thật + 1 synthetic stress): overlap −1.5px (không đè), tên dài full 2 dòng, giá+biến thể cột phải đọc được, **decode 90px OK** cả mã 17 ký tự. Cache-bust render `p6`. Status ✅

**Follow-up (p7)**: MÃ SP KHÔNG bó theo bề ngang QR + KHÔNG cắt — tách HÀNG RIÊNG full-width canh TRÁI, mã dài chạy dài qua phải (fitText chỉ thu khi vượt CẢ bề ngang tem). Verify trang thật: "KHAOKHOACDATWEEDL" (17 ký tự) hiện đủ full-width clipped=false, "HCSSE57929" canh trái. Cache-bust `p7`.

### [web2/products] Tem SP "2 tem" → bố cục price-tag HOÀN HẢO (giá hero + tên 2 dòng sạch + biến thể gọn)

Iterate bố cục tem QR (`buildLabelHTML`) cho đẹp + hoàn hảo, verify bằng Playwright MCP (render `buildLabelHTML` thật + decode QR ở size in).

**Vấn đề bản P1 cũ** (đo computed style): cột phải chỉ ~12mm → GIÁ nowrap bị fitText thu còn **10.5px** (không nổi); biến thể dài "Màu Xám Đen / Size 36" thu còn **3.5px** (không đọc nổi); tên dài nhồi **3-4 dòng tí hon** (fitName cũ fit theo box px, không theo số dòng).

**Files** `web2/products/js/web2-products-print-render.js`:

- **Bố cục price-tag (P2)**: HÀNG TRÊN = [QR sạch + mã SP dưới] | [TÊN ≤2 dòng + BIẾN THỂ chip]; **BĂNG GIÁ full-width dưới cùng** (kẻ vạch trên) → giá in **TO NHẤT** (16.5–18px, hero) vì rộng cả tem. QR `min(labelW*0.48, (labelH-pad)*0.6)` ≈ 12mm.
- **`fitName` viết lại**: thu nhỏ tới khi **≤2 DÒNG THẬT** (đo `round(scrollHeight/lineHeight)`, không phải fit box px) → clip cứng đúng 2 dòng ở line-height cuối. Hết cảnh tên 3-4 dòng tí hon.
- **Biến thể rút gọn**: bỏ tiền tố "Màu"/"Size"/"cỡ"/"sz" → "Màu Xám Đen / Size 36" thành "Xám Đen / 36" (đọc được). +CSS `.ql-qr-priceband`, +fitText cho band.
- **Bỏ `text-overflow:ellipsis` ở `.ql-qr-var`**: scrollWidth/clientWidth làm tròn số nguyên (43==43) giấu tràn phân số ~0.4px → ellipsis cắt mất size ("Xám Đen / …"). Bỏ ellipsis → overflow:hidden cắt vô hình, size "36" hiện đủ. (fitText giữ nguyên, KHÔNG ép dư 1px vì chip shrink-to-fit sẽ thu xuống sàn 3.5px.)
- Cache-bust `web2-products-print-render.js?v=20260625p4`.

**Verify** (Playwright MCP, BarcodeDetector, render engine THẬT): 6 SP edge-case (tên ngắn/dài, biến thể dài, giá tới 1.250.000, mã 24 ký tự) → **decode 6/6 PASS ở 88px** (chặt hơn ~96px khổ in 12mm) → quét chắc có dư địa. Giá hero rõ, tên 2 dòng sạch, biến thể đọc được. Thuần frontend → GH Pages. Status ✅

### [scripts] Browser-test cho AI agent tự verify → Playwright MCP + Chrome DevTools MCP (thay REPL điều khiển tay)

Research toàn cảnh GitHub (workflow 4 agent: Playwright MCP / Chrome DevTools MCP / browser-use+Stagehand / fit-analysis) cho nhu cầu "Claude Code tự test web để code đúng". **Kết luận**: dùng **Playwright MCP** làm verify gate chính (deterministic, 0 cost LLM thứ 2 vì agent đã là LLM) + **Chrome DevTools MCP** debug console/network/perf + reuse `n2store-extension`. **KHÔNG** dùng browser-use/Stagehand (tốn LLM riêng + non-deterministic → sai bản chất verify gate). Giữ nguyên smoke 144 trang + DB migration (deterministic batch). Chỉ thay phần REPL điều khiển tay (`n2store-browser-session.js` nav/eval/click) bằng MCP tool.

**Files**:

- `scripts/save-login-session.js`: thêm flag `--state-out` + gọi `ctx.storageState({ path })` (default `downloads/n2store-session/auth-state.json`) TRƯỚC `browser.close()` → xuất Playwright storageState chuẩn cho Playwright MCP `--storage-state`. Tái dùng 1:1 flow login Web1+Web2 sẵn có, không viết lại. (Path live-login — cập nhật session tươi.)
- `scripts/export-auth-state.js` (MỚI): converter OFFLINE đọc snapshot đã lưu trong `serect_dont_push.txt` (qua `readSnapshot` của restore-login-session.js) → xuất `auth-state.json` (Playwright storageState) KHÔNG cần login lại — né timeout backend. Chỉ in count, không echo giá trị. (Path offline — dùng session đã capture.)
- `.gitignore`: ignore `downloads/n2store-session/auth-state*.json` (chứa JWT) + `.chrome-n2store-debug/` (debug profile Chrome DevTools MCP).
- `.mcp.json`: thêm server `playwright` (`@playwright/mcp@latest --storage-state=./downloads/n2store-session/auth-state.json`) + `chrome-devtools` (`chrome-devtools-mcp@latest`). Giữ nguyên `designmd`.

**Verify**: `node scripts/export-auth-state.js --base http://localhost:8080` → sinh `auth-state.json` từ session 2026-06-21 (93.9h, còn hạn JWT): origin localhost:8080, 6 LS keys gồm `loginindex_auth` + `web2_auth`, cookies=0 (app dùng localStorage auth). Package npm tồn tại: `@playwright/mcp@0.0.76`, `chrome-devtools-mcp@1.4.0`. `.mcp.json` valid 3 server. Status ✅ code+config — **còn 1 bước user**: restart Claude Code để load + approve 2 MCP server mới. (Live-login `save-login-session.js` lúc test bị timeout backend — không ảnh hưởng, đã có path offline.)

### [web2] Audit mã QR/Barcode in bill → QR đẹp + bố cục tem SP "2 tem" thông minh (P1)

Audit chuyên sâu + browser-test (BarcodeDetector decode + thermal 1-bit threshold) toàn bộ mã in của Web 2.0, làm đẹp QR + sắp lại bố cục tem SP.

**Phân loại mã** (browser-test thực): PBH thermal QR (`Web2QR` styled, decorative, in) · tem SP QR (`Web2QR`, in) · A4 hoá đơn (TRƯỚC: KHÔNG có mã) · Code128 (fallback) · **VietQR `Web2QrModal`** (FUNCTIONAL bank-transfer, screen-only → KHÔNG đụng) · scanner/pack-counter/label-ocr (input, không in). Decode test 8 biến thể QR @304px (38mm) + 1-bit B&W: **8/8 PASS** (kể cả dots & rounded r0.45) → headroom lớn ở 38mm.

**Files**:

- `web2/products/js/web2-products-print-render.js` + `web2-products-print-modal.js`: **bố cục tem SP P1** — QR SẠCH (biến thể KHÔNG bake giữa QR nữa) + mã SP dưới QR; cột phải xếp dọc **TÊN (≤2 dòng) → BIẾN THỂ (chip xám) → GIÁ (đậm, to nhất)**. Hierarchy bán lẻ: giá nổi nhất, biến thể dễ đọc. QR sạch → EC mặc định 'M' (module to hơn) → quét nhạy hơn trên tem 25mm. +CSS `.ql-qr-var`, +fitText cho `.ql-qr-var`.
- `web2/shared/web2-bill-service.js`: PBH thermal QR **nhúng SVG vector trực tiếp** (thay `<img>`+`pixelated` → module bo góc + mắt finder SẮC NÉT khi html2canvas raster 576 chấm) + **QR SẠCH**: BỎ bake mã PBH ở GIỮA QR (user yêu cầu) → mã PBH in DƯỚI QR (HRI mono `.b-qr-num`), EC mặc định 'M' (module to hơn → quét nhạy hơn). Block định danh gọn: Tiêu đề+STT → QR sạch → mã PBH → Ngày. Verify real (products page "In tem" + bill render) + decode thermal 1-bit ✓ (`NJ-20260625-0084`, tem SP `HNAOXDE36`/`HNDAMDD31`).
- `web2/fastsaleorder-invoice/print.html`: **thêm QR mã PBH** (Web2QR rounded) góc phải header A4 (laser in đẹp, quét tra cứu đơn) + load qrcode/web2-qr.
- `web2/printer-settings/index.html`: load `web2-qr.js` → "In thử" PBH dùng QR styled GIỐNG bill thật (trước thiếu lib → rơi về QR thô).
- `web2/shared/web2-qr.js`: `toDataUrl` thêm hỗ trợ `opts.size` (TỔNG px) — fix bug `product-card` truyền `{size:256}` bị bỏ qua.
- Cache-bust: products/fastsaleorder-invoice/product-card/printer-settings (`web2-qr 20260625qr`, print-render/modal `20260625p1`, bill-service `20260625qr`).

**Verify** (browser, BarcodeDetector): PBH bill QR qua **đúng đường raster html2canvas** → decode `NJ-20260625-0084` ✓; tem SP QR @100px (12.5mm thật) → `KHOAOTRANGM` ✓ + `KHAOKHOACDATWEEDL` ✓; A4 QR render ✓. Bố cục P1 screenshot: biến thể chip rõ, giá to đậm, QR sạch. Kiểu QR = bo góc + mắt finder bo (user chọn). VietQR giữ nguyên (functional). Thuần frontend → GH Pages. Status ✅

### [web2/shared] Audit CSS Web 2.0 → animation tăng tương tác + skeleton loading kiểu GitHub

Audit toàn bộ CSS Web 2.0 (46 trang, ~31.9k dòng, workflow 11 agent song song) → áp dụng animation tăng tương tác + skeleton loading. Doc: [`docs/web2/WEB2-CSS-ANIM-AUDIT.md`](web2/WEB2-CSS-ANIM-AUDIT.md).

**Phát hiện**: file global thật = `web2-theme.css` (49/52 trang); ~40 trang có nút/tab/chip/row đổi nền-viền `:hover` **quên `transition`** (giật) + thiếu `:active` press; ~40 trang thiếu `prefers-reduced-motion`; loading state đa số là text "Đang tải…"/blank/spinner (chỉ 7 trang có skeleton).

**Files**:

- `web2/shared/web2-theme.css`: +block GLOBAL INTERACTION POLISH (baseline transition cho `button:not(.btn)`/`a`/`[role=tab/button]`, `:active scale(.97)` press, `:focus-visible` ring, input transition) + `.btn` base thêm `transform`+`box-shadow` (hover-lift/press hết snap) + **GLOBAL `@media (prefers-reduced-motion: reduce)`** clamp (1 block phủ ~40 trang). Theo ELEMENT/role, KHÔNG `[class*=]` (né `.data-table`).
- `web2/shared/web2-skeleton.js` (MỚI): `Web2Skeleton` self-contained (tự inject CSS) GitHub-style shimmer. API `rows/list/cards/grid/stats/detail/lines/html/clear`. `rows()` trả `<tr><td>` cho `<tbody>` (giữ cột).
- Wire skeleton **30 trang** (2 đợt, defensive `if(window.Web2Skeleton){…}else{markup cũ}`, **guard first-load** + **clear nhánh lỗi/early-return**). Đợt 1 (20): products, variants, customers, customer-wallet, fastsaleorder-invoice/delivery/refund, balance-history, chi-tieu, users, returns, live-tv, live-control, fb-posts, zalo, jt-tracking, multi-tool, order-tags, ai-hub, video-maker. Đợt 2 (10): purchase-refund, cham-cong, fb-ads-stats, fb-insights, system, ck-dashboard, pancake-settings, ai-assistant, report-delivery, users-permissions. (`reconcile` đã có `.w2-skel` → skip; 6 trang render đồng bộ — payment-confirm/ai-photo/photo-studio/product-card/supplier-debt/supplier-wallet — CỐ TÌNH skip vì skeleton sẽ flash.)
- Cache-bust `web2-theme.css?v=20260625anim` toàn bộ trang link (53 file).

**Verify**: `node --check` pass toàn bộ JS sửa; browser-test ~8 trang (products screenshot skeleton 12-cột chuẩn; customers 50 rows / pbh / order-tags / variants / live-control / cham-cong / pancake-settings / ck-dashboard data render OK, skeleton KHÔNG kẹt, 0 error); button computed `transition` có transform/box-shadow + reduced-motion net loaded. **2 vòng adversarial review (workflow)**: vòng 1 bắt 3 HIGH bug (variants flash mỗi filter; returns/live-control/multi-tool kẹt skeleton khi fetch lỗi; chi-tieu flash) → fix hết; vòng 2 review đợt 2 (manual fallback do rate-limit) — agents tự áp guard first-load + clear-on-error, sạch. Thuần frontend → GH Pages. Status ✅

### [web2/shared] AI widget: ẩn khối suy luận <think> của reasoning model

Widget AI (mọi trang) hiện ĐÚNG kết quả nhưng **lọt khối `<think>…</think>`** của reasoning model (qwen3/gpt-oss trong cascade) vào bong bóng chat — user thấy "Final check… [Proceeds] </think>" trước câu trả lời.

**Fix** (`web2-ai-assistant.js`): thêm `stripThink(s)` xử lý 3 ca — (1) cặp `<think>…</think>` hoàn chỉnh; (2) lone `</think>` (mở trước/không bắt được → cắt tới hết tag); (3) lone `<think>` mở chưa đóng (streaming → giấu phần đang nghĩ tới khi `</think>` tới). Áp trong `_md()` (TRƯỚC esc) cho mọi render + streaming, và lưu `content: stripThink(reply)` lúc finalize → history/context-gửi-lại-AI/nút-copy đều sạch. Bump inject version `web2-ai-assistant.js`+registry → `20260625recon` (sidebar).

**Verify**: stripThink unit-test 5/5 (gồm đúng ca ảnh chụp: reasoning + lone `</think>` + bullet → chỉ còn bullet). node --check OK. Thuần frontend → GH Pages. Status ✅

### [so-order][web2/shared] AI widget: đối chiếu Sổ Order ⇄ Kho SP TÍNH SẴN (hết "xin data")

User hỏi AI widget so-order "đối chiếu SP đã order chưa có mã trong kho" → AI **xin user paste** `window.Web2ProductsCache.getAll()` thay vì tự đọc.

**RCA**: accessor `Web2ProductsCache.getAll()` CÓ trong registry nhưng (1) là accessor cuối → `accBudget` đã cạn vì `SoOrder.state` (object, có ảnh data-URL) stringify đầu tiên → kho bị `break` (skip); (2) `MAX_CTX=8000` ký tự không chứa nổi cả 2 dataset đầy đủ; (3) array lớn bị `encodeArray` tóm tắt → không diff chính xác từng mã được. → LLM thiếu data kho → xin user.

**Fix (precompute client-side, không dump raw):**

- `so-order-kho-sync.js`: thêm `SO.reconcileWithKho()` — diff deterministic, match UNIQUE THEO MÃ + ĐỊA DANH (matchedCode∈kho HOẶC kho có name+variant+region; HƯƠNG CHÂU vs HÀ NỘI tính RIÊNG). Trả `{ready, khoCount, unmatchedCount, unmatched:[{productName, variant, supplier, region, totalQty, lineCount, suggestedCode}]}`. suggestedCode qua rule mã chung (`_assignKhoCodes`).
- `web2-ai-page-registry.js`: thêm accessor `window.SoOrder?.reconcileWithKho?.()` làm **ĐẦU TIÊN** (kết quả gọn → luôn lọt budget) + sửa prompt "🏷️ SP chưa có ở kho" trỏ vào accessor này.
- Bump registry inject version (`web2-sidebar.js` → `20260625recon`) + cache-bust so-order page.

**Verify (browser, data thật)**: `reconcileWithKho()`=`{ready:true,khoCount:10,unmatchedCount:0}` (mọi dòng đã sync khớp); inject dòng ảo "SP TEST...Màu Tím/Size 99" HÀ NỘI qty7 → unmatched 1, `suggestedCode:HNMMTIM` (region-prefix ✓), cleanup. `Web2AiAssistant.pageContext()` (5706 ký tự < 8000) **bắt đầu bằng** khối "KẾT QUẢ ĐỐI CHIẾU TÍNH SẴN ... {ready,khoCount,unmatched}" → AI nhận kết quả tính sẵn, hết xin data. node --check OK. Thuần frontend → GH Pages. Status ✅

### [web2/live-control] FIX tìm SP trong picker thiếu match MÃ — tìm theo mã + tên

User: "các chức năng tìm kiếm sản phẩm là tìm kiếm theo unique mã sản phẩm" + "tìm theo mã + theo tên sản phẩm". Audit mọi entry tìm SP:

- ✅ SẴN ĐÚNG (match mã + tên, kết quả per-code): `Web2ProductsCache.findByName` (name OR code), `Web2ProductPicker` (getAll per-code + findByName), so-order suggest (`findByName`), backend `web2-products /list` (`code ILIKE OR name ILIKE`), native-orders picker (client `code||name`, backend /list), live-control tab "Tất cả SP" (server /list).
- 🔧 **GAP** — live-control picker tab "Chờ hàng (Sổ Order)" lọc CLIENT chỉ match `g.name` + `g.supplier`, **THIẾU mã** (dù placeholder "tên / mã / NCC") → gõ mã SP không ra. **Fix**: thêm `g.variants.some(v => code.includes(q))` → tìm theo MÃ + TÊN (+NCC). Bump `live-control.js?v=20260625srch`.

**Verify (browser, data thật)**: tìm `"hnquanghi33"` (mã) → `[HNQUANGHI33]` ✓ (trước = rỗng); tìm `"quần short"` (tên) → `[HCQUANXDU31, HNQUANGHI33]` ✓ (2 SP, mỗi mã 1 kết quả). node --check OK. Thuần frontend → GH Pages. Status ✅

### [shared][so-order][supplier-wallet] Audit unique-theo-mã toàn Web 2.0 + fix triệt để (default by:'code')

Workflow audit 8 surface SP (10 agent, find + adversarial verify): **7/8 sạch**, tìm 1 bug thật + 1 hardening. User chốt "fix triệt để lỗi hiện tại và tương lai, mặc định by:'code'".

- **HARDENING (tương lai)** — `web2-variant-group.js`: đổi **default `by` từ `'name'` → `'code'`**. Caller quên `opts.by` → unique theo mã (an toàn), không tái phát bug gộp 2 mã trùng tên. Mode gom-theo-tên phải truyền tường minh. (4 caller hiện có đều đã `by:'code'` → zero impact.)
- **BUG MED (hiện tại)** — `so-order/js/so-order-modal-core.js`: badge "Tồn: N" + mã Kho trong MODAL tạo đơn resolve qua `findByNameExact(name)` (bỏ qua biến thể) → 1 tên nhiều biến thể (nhiều mã) hiện tồn/mã của 1 biến thể tùy ý cho mọi dòng cùng tên. Bug cùng class đã fix cho table-view (`_lookupKhoCode`→`findByNameVariant`) nhưng bỏ sót modal. **Fix**: thêm helper `SO._modalMatchKho(row)` (matchedCode→findByCode, else `findByNameVariant(name,variant)`) dùng ở `modalRowHtml` + `updateRowMeta`; `onModalRowFieldInput` re-resolve khi đổi CẢ productName LẪN variant (trước chỉ productName).
- **BUG (sweep thêm)** — `web2/supplier-wallet/js/supplier-wallet-actions.js`: trả NCC trừ tồn — fallback `findByNameExact` đổi → `findByNameVariant(name,variant)` (đây là WRITE trừ tồn, match sai biến thể = trừ nhầm tồn SP khác). Không khớp cặp → null → bỏ qua (đã có cảnh báo điều chỉnh tay).
- Sweep repo: KHÔNG còn `findByNameExact` ở chỗ display/write nào khác (chỉ còn định nghĩa cache + comment). Bump cache-bust `?v=20260625uniq2`/`vaware`.

**Verify (browser, data thật)**: `findByNameExact('QUẦN SHORT KAKI')`=HNQUANGHI33 (tùy ý — SAI cho biến thể Xanh); `findByNameVariant(...,'Màu Ghi/Size 33')`=HNQUANGHI33 ✓, `(...,'Màu Xanh Dương/Size 31')`=HCQUANXDU31 ✓. node --check 3 file OK. Thuần frontend → GH Pages. Status ✅

### [web2/live-control][live-tv][shared] FIX gom SP sai — unique theo MÃ sản phẩm

User báo bug: picker live-control hiện "QUẦN SHORT KAKI · 2 biến thể · **chờ 34**" nhưng thực ra là **2 SP khác mã** (`HCQUANXDU31` HƯƠNG CHÂU chờ 16 + `HNQUANGHI33` HÀ NỘI chờ 18) bị gom vì `Web2VariantGroup.group` dùng `by:'name'` (gom theo TÊN). User chốt: **"tất cả sản phẩm unique theo mã sản phẩm"**.

**Fix:**

- `web2-variant-group.js`: thêm `by:'code'` (key = mã SP chuẩn hoá, fallback name+variant nếu thiếu mã) → MỖI mã = 1 item, KHÔNG gom biến thể.
- 4 call-site đổi `by:'name'` → `by:'code'`: live-control board (`loadBoard`), picker pending + all-SP (`loadPicker`), live-tv (`loadGroups`).
- `pickerItemHtml`: nhóm 1-mã hiện **biến thể (Màu/Size) + chip MÃ SP** thay cho "1 biến thể" vô nghĩa (CSS `.lc-pcode`). Region badge + chờ N vẫn hiện per-mã.
- Bump cache-bust `?v=20260625uniq` (live-control + live-tv pages).

**Verify (browser, data thật prod)**: `Web2ProductsApi.listPending()` → 2 SP QUẦN SHORT KAKI; `group(by:'name')` = 1 nhóm pending **[34]** (bug cũ); `group(by:'code')` = **2 nhóm**: {HƯƠNG CHÂU, chờ 16, HCQUANXDU31} + {HÀ NỘI, chờ 18, HNQUANGHI33}. ✓ node --check 3 file OK. Thuần frontend → GH Pages. Status ✅

### [render][web2/zalo][web2/jt-tracking] FIX spam "Đổi thiết bị" — FOCUS-LEASE phiên Zalo

User: đăng nhập Zalo ở `web2/zalo` → chat.zalo.me spam liên tục popup **"Đổi thiết bị"**, không dùng được.

**Nguyên nhân (RCA, workflow 4 agent + tự xác minh)**: Zalo Web = **1 phiên/tài khoản**. Công cụ (zca-js trong render.com) và chat.zalo.me cùng 1 TK → đá nhau (close `3000` DuplicateConnection / `3003` KickConnection, [`zca-js/dist/apis/listen.js:14-15`]). `_doReconnect` cũ gọi **FULL `zalo.login()` mỗi lần kick** → mỗi login = 1 popup; state `kicked` KHÔNG terminal (nghỉ 10ph rồi retry mãi) → spam liên tục. imei reuse đúng (extension đọc `z_uuid`) — KHÔNG phải bug imei. Không có boot-restore (session=NULL từ 2026-06-23).

**Giải pháp (user chọn)**: "Khi user FOCUS tab `web2/zalo` hoặc `web2/jt-tracking` → lấy phiên; không focus → nhường chat.zalo.me." = **focus-lease**.

- **Backend** `services/web2-zalo-zca.js`: thêm `LEASE_TTL_MS=75s`, `_isWanted(s)` (lease còn hạn + !yielded + !disposed), `touchLease()`/`releaseLease()`(=`_yield`: đóng listener, status `yielded`, KHÔNG re-login, GIỮ creds RAM). Gate `_scheduleReconnect`/`_doReconnect`/`_watchdogTick` theo `_isWanted` → hết lease/yield = KHÔNG fight. `_afterLogin` cấp lease + clear yielded; login short-circuit (đã connected) chỉ gia hạn lease (không login lại → không popup thừa). **FIX guard `onClosed`/`onError`**: bỏ qua khi `yielded`/`disposed` (tránh `stop()`→onclose async ghi đè 'yielded' bằng 'disconnected' + tránh reconnect).
- **Route** `routes/web2-zalo.js`: `POST /accounts/:key/lease` (heartbeat) + `/release` (nhường) owner-scoped (cache, fallback `body._owner` cho sendBeacon). KHÔNG admin-gate.
- **Client shared** `web2/shared/web2-zalo-presence.js` (MỚI, `Web2ZaloPresence`): focus(visible+hasFocus) → acquire (lease → chưa connected thì creds extension → login-cookie silent) + heartbeat 25s; blur (debounce 3s)/pagehide(sendBeacon) → release. 1 nguồn cho cả 2 trang. `ZaloApi.lease/release/releaseBeacon` mới.
- **UI**: status `yielded` → label "Đang nhường chat.zalo.me" + hint thân thiện (không phải lỗi), rail dot trung tính (không đỏ). Wire `Web2ZaloPresence.start()` vào `web2/zalo` + `web2/jt-tracking` (thêm `web2-zalo-api.js` cho jt-tracking).

**Verify**: backend smoke (exports) ✓; test state-machine fake-zca 6/6 PASS (login→yield→no-fight→re-acquire→onClosed-guard) ✓; test client orchestration fake-DOM 4/4 PASS (acquire-on-focus, release-on-blur, re-focus không re-login, debounce) ✓; browser-load 2 trang: `Web2ZaloPresence` loaded + `start()` chạy, 0 lỗi module (401 status là auth test-harness, không liên quan) ✓. node --check toàn bộ OK. Backend → Render `web2-api` (~3-4′), frontend → GH Pages. Status ✅ — MEMORY `reference_zalo_focus_lease`.

### [web2/shared] Web2CustomerChat realtime như live-chat (SSE web2:messages)

User: "realtime như live-chat". Chat KH nhúng (`Web2CustomerChat` mở từ customers/jt-tracking/balance-history/native-orders) trước đây chỉ `loadMessages` lúc mở → tin KH mới không hiện tới khi đóng/mở lại (gap LOW audit SSE).

**Fix (port pattern proven của `LiveChatModal`, 1 nguồn KHÔNG fork):**

- **core** (`web2-customer-chat-core.js`): subscribe `web2:messages` **1 lần** (retry tối đa 6 nhịp nếu bridge chưa load) → debounce 800ms → `NS._active.refreshActive()`. Tin Zalo có realtime riêng (Web2Zalo) nên topic này chỉ lo Pancake.
- **drawer** (`web2-customer-chat.js`) + **modal 3-cột** (`web2-customer-chat-modal.js`): lưu adapter hiện tại (`pancakeAdapter`/`currentAdapter`) + expose `handle.refreshActive()` = `adapter.loadMessages()` → `panel.setMessages()` (giữ vị trí cuộn khi đọc lịch sử, CHỈ auto-cuộn đáy nếu đang ở đáy — KHÔNG dùng `panel.reload()` ép cuộn đáy).
- Bump cache-bust 3 file chat `?v=20260625sse` trên cả 4 trang.

**Verify browser (session live)**: `nsReady/entryReady/hasSse/probeInstalled=true`; cài probe lên `NS._active.refreshActive` → **tin web2:messages THẬT từ prod hub** kích `RT_HIT:3` (burst gom bởi debounce) ⇒ chuỗi prod hub → Web2SSE bridge → core subscribe → refreshActive chạy đúng. 4 trang đều load `web2-sse-bridge.js`. node --check 3 file OK. Thuần frontend → GH Pages. Status ✅

### [so-order] FIX REGRESSION: `_rowToKhoMatch is not defined` — xóa/sửa lô vỡ

User báo "Không xóa được so-order" + console `Uncaught ReferenceError: _rowToKhoMatch is not defined at so-order-delete.js:197 (_finalizeDeleteShipment)`.

**Nguyên nhân**: commit `eaf9213a4` (Wave 3 tách `so-order-app.js` → 23 module IIFE riêng). Hàm `_rowToKhoMatch` (gốc local trong scope monolith) trở thành `SO._rowToKhoMatch` (so-order-kho-sync.js:242), nhưng **5 chỗ gọi vẫn để bare `_rowToKhoMatch`** (chỉ modal-submit prefix đúng) → ReferenceError mọi đường xóa/sửa qty: deleteRow, deleteShipment, deleteTab, bulk-edit, inline-edit.

**Fix**: bare `_rowToKhoMatch(r)` → `SO._rowToKhoMatch(r)` ở 5 site (so-order-delete.js ×2, so-order-settings.js, so-order-bulk-edit.js, so-order-inline-edit.js). Verify: node --check 4 file OK + browser eval `typeof SO._rowToKhoMatch==='function'` ✓, chạy lại đúng biểu thức `.map(r=>({...SO._rowToKhoMatch(r),delta}))` từng throw → `mapOk:true, err:null`. Cache-bust so-order/index.html `?v=…b`. Status ✅ (commit auto `c9495a30a`).

### [web2 nhiều trang][render] Audit SSE — vá 6 MED + 4 LOW gap realtime (workflow 18 agent)

Workflow audit SSE (9 nhóm × audit+adversarial-verify, 18 agent, ~51′) hoàn tất → **16 gap xác minh (0 HIGH / 6 MED / 10 LOW)**. Vá các gap thật (trừ Web2CustomerChat embedded — cần xác nhận chủ đích quick-view):

- **MED Live Control dropdown chiến dịch** (`live-control.js`): onSse bỏ qua `web2:live-comments` action `campaign` → dropdown stale tới F5. Thêm branch debounce `loadCampaigns()`.
- **MED Livestream Poller danh sách page** (`livestream-poller/index.html`): SSE chỉ reload stat, không reload pages. Thêm nhánh action `poller-pages` → `loadPages()`.
- **MED FB-posts connect/disconnect** (`fb-posts-app.js`): handler không gọi `loadStatus()` → pill + page-chips (cả tab Soạn bài) stale. Thêm nhánh connect/disconnect → `loadStatus()` (phủ luôn LOW composer chips).
- **MED Quick replies** (`web2-quick-reply.js`) + **MED Mẫu tin nhắn** (`web2-msg-template-core.js`): publisher wired nhưng KHÔNG ai subscribe → thêm `Web2SSE.subscribe` revalidate cache cross-máy.
- **MED KPI phân khoảng STT** (`v2/kpi.js`): PUT /employee-ranges UPSERT nhưng không broadcast → thêm `_notifyClients('web2:kpi-dashboard', {action,campaign,ts})`. **LOW** + assignments.html nạp `web2-sse-bridge.js` + `kpi-assignments.js` subscribe reload ranges/history.
- **LOW returns PII** (`web2-returns.js`): bỏ spread `{phone}` khỏi payload `web2:returns` (lệch convention + lộ SĐT, không ai đọc); SĐT giữ ở `_notifyWallet` topic `web2:wallet:<phone>`.
- **LOW Zalo accounts** (`web2-zalo-app.js`): debounce `refAcc` 500ms (gom burst, đối xứng refList).

Verify: node --check toàn bộ file JS OK. Status ✅

### [web2 toàn cục][render] Audit SSE realtime toàn bộ Web 2.0

Rà soát toàn bộ chuỗi SSE Web 2.0 (publish→wire→subscribe→reload-completeness→topic-match) — 42 trang subscribe, ~44 route publish, ~39 module wired. Workflow background chết (0 output) → audit thủ công deterministic + đọc handler.

**Kết quả: kiến trúc SSE LÀNH MẠNH.**

- **WIRE**: 100% route export `initializeNotifiers` đều được wire trong server.js (40 exporter; cái "thiếu" là realtime-db = hub Web 1.0, wire destructure).
- **PUBLISH**: mọi route mutation data đều broadcast sau commit (refunds/balance-history nghi ngờ ban đầu = false-positive, đều có notify).
- **RELOAD-INCOMPLETE** (bug class "phải F5"): soi 14 handler action-branch/patch-in-place → **CHỈ web2-products** dính (SP mới từ so-order vô hình tới F5) — **đã fix** session này (commit ac6f6ce5d). 13 handler còn lại (page-builder, native-orders, pbh, users, ck-dashboard, payment-confirm, reconcile, chi-tieu, cham-cong, zalo, ck-review, livestream-snap…) đều full-reload/append debounce → an toàn.
- **TOPIC-MISMATCH**: 4 topic "subscribe-không-publish" (messages/printer/capture-lock/live-hidden-commenters) = false-positive — publish qua đường động: `/sse/relay-notify` (messages), generic `_notify('web2:<slug>')` (live-hidden-commenters, capture-lock qua web2-generic), dedicated-entity (printer).
- **Fix LOW duy nhất tìm thấy**: `v2/web2-balance-history.js /cleanup-stale-pending` xoá pending stale/trùng (data hiển thị CK review) mà KHÔNG broadcast → thêm `_notifyBalanceHistory(action:'cleanup')`. Các trang balance-history + ck-review subscribe `web2:balance-history` → cập nhật không F5.

Verify: node --check OK. Status ✅

## 2026-06-25

### [web2/ai-hub] Ghép đồ: dán ảnh (Ctrl+V) + kéo-thả cho ô Ảnh người & Ảnh quần áo

User: "cho tính năng paste ảnh" ở tab Ghép đồ. Dùng module shared `Web2ImagePaste.enhance` (1 NGUỒN, KHÔNG fork) nâng cấp 2 file input SẴN CÓ (`.w2t-person-file`, `.w2t-garment-file`) → nhận **DÁN Ctrl+V + kéo-thả**, GIỮ nút Choose File. Ảnh dán/thả bơm vào `input.files` + dispatch `change` → handler nén (compressFile) + preview chạy y như chọn file. Mỗi ô = 1 dropZone (`.w2t-field`), hover/focus ô nào thì Ctrl+V rơi vào ô đó. Hint chip "📋 …" tự hiện. Bump `web2-tryon v=20260625d`. **Verify live**: cả 2 input enhanced + 2 hint chip + drop ảnh → preview JPEG ✓ (browser mount + sim drop). Thuần frontend → GH Pages.

### [web2/products][render][so-order] Fix SSE hiện SP mới (không F5) + địa danh luôn nhận diện

Browser-test so-order (Điền ngẫu nhiên → Lưu Nháp) → audit → fix (user báo 2 bug):

- **Bug 1 — "phải F5 mới thấy SP tạo bên so-order"**: handler SSE `web2:products` coi action `upsert-pending` là update → `_updateRowsBatch` patch-in-place, code chưa on-page → `handled=true` → KHÔNG reload → SP mới vô hình. **Fix** `web2-products-app.js`: `upsert-pending` có code chưa nằm trong data → `debouncedFullLoad()`. Verify live: tạo SP qua API → bảng tự 14→15, `loadCalls=1`, KHÔNG F5, badge ĐỊA DANH=HƯƠNG CHÂU.
- **Bug 2 — địa danh không nhận diện cho SP cũ** (note='HƯƠNG CHÂU', region=null): backfill 1-lần/boot bỏ sót SP tạo sau boot + `ILIKE '%HƯƠNG CHÂU%'` không khớp note do Unicode NFC/NFD. **Fix**: (a) backfill `region` từ PREFIX MÃ (HN/HC, ASCII) un-gate mỗi boot; (b) `mapRow`/`mapItem` fallback `regionFromCode(code)` read-time → region LUÔN đúng dù chưa backfill. Verify live: 12/12 SP có region.
- **so-order random NCC**: bỏ HÀ NỘI/HƯƠNG CHÂU khỏi list NCC (đó là địa danh).
- Verify flow so-order Lưu Nháp (token web2 hợp lệ): order lưu OK + kho-sync tạo SP `region=HƯƠNG CHÂU` note sạch + SSE `web2:products upsert-pending` fire, 0 lỗi/warn. Account browser-test web2 = trong serect (admin/admin!!).

### [live-control][live-tv][products][so-order][render] ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn

User (trang **live-control**, nhầm tên so-order/native-orders): (1) địa danh nhập hàng (Hà Nội/Hương Châu) là field RIÊNG — Sổ Order đang nhầm nhét vào **ghi chú**, web2_products chưa có field địa danh → tách ra; thêm chip lọc + badge địa danh vào panel "Thêm sản phẩm" có toggle ẩn/hiện. (2) Board "Trên TV" + màn TV hiện **NCC / Bán / Cọc / Còn**.

**Chốt qua hỏi:** NCC = ô nhập "số NCC báo" (pending_qty, sửa được); Bán = TỔNG SL trong giỏ native-orders draft (GỒM cọc); Cọc = SL giỏ có `deposit>0` (tag ĐÃ CỌC); **Còn = max(0, NCC − Bán)**; live-control hiện đủ 4, live-tv hiện NCC/Bán/Còn.

- **Schema** `web2_products`: +cột `region` (migration 080) + backfill tách HÀ NỘI/HƯƠNG CHÂU từ `note`→`region` (dọn note, self-gated). mapRow/POST/PATCH/upsert-pending nhận `region`.
- **`web2-campaign-products` GET**: +`region` + `sold`(Bán) + `coc`(Cọc) per mã — aggregate `native_orders` draft (`deposit>0`→coc), cùng pool web2Db.
- **Sổ Order** kho-sync + barcode: ghi địa danh vào `region` (KHÔNG note).
- **Grouper** `web2-variant-group`: variant +region/sold/coc; group +regions/region/totalSold/totalCoc.
- **live-control**: board NCC(input)+BÁN+CỌC+CÒN (bỏ Tồn/Chờ); picker chip lọc địa danh + badge + toggle `lcRegionToggle` (localStorage); subscribe `web2:native-orders`.
- **live-tv**: NCC+BÁN+CÒN; subscribe `web2:native-orders`.
- **web2/products**: cột **ĐỊA DANH** riêng tách khỏi **GHI CHÚ** (colspan 11→12).
- Verify: `node --check` 8 file OK; live-control/live-tv 0 lỗi console; unit-test grouper region/sold/coc đúng. ⚠ region/Bán/Cọc cần web2-api redeploy mới có data thật. Bump ?v=20260625a. Status ✅ (chờ deploy verify)

### [web2/ai-hub][render] Fix chat chỉ Gemini chạy + nút "✨ AI viết mô tả" cho Ghép đồ & HTML Studio

User: "test key đều OK nhưng chat chỉ Gemini được (hình 1)" + "Hình 3, hình 4 thêm nút hình 2 vào".

**Chẩn đoán** (test trực tiếp provider, bypass worker+auth): nút "Test" gọi `/chat` NON-STREAM (chạy mọi provider); UI chat gọi `/chat/stream` TRƯỚC, chỉ fallback non-stream khi `!res.ok`. Groq key org bị **"Organization has been restricted"** (HTTP 400 `organization_restricted`) — non-stream lẫn stream đều fail. OpenRouter/ChatAnywhere stream OK ở tầng provider (đã verify cả khi có system prompt + maxTokens 2048).

- **Fix 1 — `render.com/services/web2-ai-service.js` `_httpError`**: phân loại `organization_restricted` / account suspended/disabled → `_auth` → rotation XOAY sang key/org kế thay vì ném ngay ở key đầu (1 key org hỏng KHÔNG kéo sập pool — gốc "Test OK, chat lỗi" do round-robin lúc trúng key tốt lúc trúng key hỏng). Regex test 8/8.
- **Fix 2 — `web2/ai-hub/js/ai-chat.js` `doStream`**: stream lỗi/rỗng mà CHƯA phát chữ nào → **fallback NON-STREAM `/chat`** (track `gotDelta` tránh nhân đôi; KHÔNG fallback khi user chủ động Dừng). Vì "Test" (cũng non-stream) chạy mọi provider → chat luôn ra chữ khi đường stream qua proxy/SSE trục trặc. Bump `ai-chat.js?v=20260625f`.
- **Nút "✨ AI viết mô tả"** (module shared `Web2AiDescribe.attach`, 1 NGUỒN — KHÔNG fork): thêm vào tab **Ghép đồ** (`web2-tryon.js`, ô "3) Đổi phong cảnh") + **HTML Studio** (`web2-content-maker.js`, ô "2 · Dữ liệu"; ensureDeps lazy-load `web2-ai-describe.js`). Gate theo `Web2AiDescribe` có mặt (degrade mượt). Bump tryon `v=20260625b`, content-maker `v=20260625c`. **Verify live (browser mount)**: cả 2 nút render + visible + label "✨ AI viết mô tả" + wired ✓.
- ⚠ Fix 1 là backend `web2-api` → cần **redeploy Render** mới có hiệu lực; Fix 2 + nút deploy qua GH Pages (~3').

### [web2 toàn cục][render] Audit vòng 4 — quét 107 file: 18 nhãn native-cart sót (workflow)

User: '"các trang khác có thiếu sót như vậy không?"'. **Workflow quét TOÀN BỘ 107 file** Web 2.0 (frontend + backend native-order) — 12 bucket × (scan → adversarial verify), đối chiếu predicate/ngữ cảnh. Rate-limit server làm fan-out song song fail 2 lần → **rewrite chạy TUẦN TỰ** (1 agent/lần) + resume cache → hoàn tất 24 agent, 0 fail. Kết quả: **18 mislabel thật** (5 HIGH / 5 MED / 8 LOW comment), áp script match-once 18/18.

- **HIGH (nhãn status user thấy)**: `web2/products/web2-product-detail.js` + `web2-products-render.js` (usage "đơn web" của SP: draft 'Nháp'→'Giỏ hàng'); `web2/shared/web2-order-tag-detail.js` (`draft`→'giỏ hàng · đang giữ'); `live-comment-list-state.js` (badge `🛒 N đơn`→'giỏ hàng'); `render.com/routes/native-orders.js` (CSV export STATUS_LABEL draft→'Giỏ hàng', confirmed→'Đơn hàng').
- **MED**: live-comment-list-render-row (tooltip STT/mã badge "đơn web"→"giỏ hàng"); live-stats-panel ("Đơn đã tạo"→"Giỏ đã tạo"); kpi-dashboard ("Dự báo = giỏ hàng chưa thành PBH").
- **LOW (comment)**: comments-mobile-actions/state, packing-slip (3), order-tags-service (2) — đồng bộ "đơn nháp/Đã tạo đơn" → giỏ.
- **Loại đúng (KHÔNG đổi)**: `draft:'Nháp'` ở purchase-refund / fastsaleorder-refund (PBH) / supplier-wallet (NCC) / fb-posts = **khác domain**, "Nháp" đúng. "Đơn Web" tên feature. confirmed/PBH = "Đơn hàng".
- Verify: `node --check` 12 file OK; grep cuối không còn native-draft→'Nháp'; products page localhost 0 lỗi. Backend (native-orders CSV + comment) cần web2-api redeploy. Status ✅

### [order-tags][render] Audit vòng 3 — reframe TOÀN BỘ chữ "đơn hàng" trang order-tags (workflow)

User: '"trang order-tags thấy rất nhiều chữ đơn hàng"'. Bulk text ấy = **20 mô tả trigger** (render từ backend `/triggers`) + tiêu đề/intro/heading, đa số mở đầu "Đơn…". Dùng **Workflow** (ultracode): 3 nguồn × (classify → adversarial verify) đối chiếu TỪNG chuỗi với **predicate ground-truth** (khi nào trigger fire) → 6 agent, 23 sửa verbatim, áp bằng script (match-once, 23/23 OK, 0 fail).

- **Quy tắc**: predicate fire chỉ khi `draft`/chưa-PBH ⇒ "Giỏ hàng"; chỉ khi confirmed/PBH ⇒ giữ "Đơn hàng"; cả hai ⇒ trung tính "Đơn/giỏ" hoặc "Bản ghi" (KHÔNG để "đơn hàng" trơ trọi gây hiểu đã chốt).
- **Catalog `web2-order-tags-service.js` (16 desc)**: `cho_hang`→"Giỏ hàng…" (chờ hàng ⇒ không lên PBH = giỏ); `is_draft` desc→"Bản ghi đang ở trạng thái Giỏ hàng"; BOTH (`het_hang`,`mua_1_phan`,`co_coc`,`thieu_dia_chi/sdt`,`gop_don`,`don_tach`,`da_in`,`tu_livestream/inbox`,`da_nhan_ck`,`kpi_user`,`is_cancelled`)→"Đơn/giỏ". **Giữ** ORDER-only (`pbh_created`,`pbh_chua_tt`,`is_confirmed` = đã PBH = "Đơn hàng").
- **`index.html`**: `<title>` + heading "TAG đơn hàng"→"TAG Đơn Web (giỏ hàng + đơn hàng)"; intro làm rõ tag áp cả giỏ (chưa PBH) lẫn đơn (đã PBH); ví dụ Chờ hàng/Âm mã→"giỏ hàng".
- **`order-tags-app.js`**: confirm xoá "Đơn sẽ không…"→"Đơn/giỏ…". Header #Note 2 file →"TAG Đơn Web".
- Verify: `node --check` OK; browser localhost — title/heading/intro reframe live, 0 lỗi console. Backend desc cần web2-api redeploy → trigger list live. Status ✅

### [order-tags][web2/shared][render] Audit vòng 2 — sót trang order-tags + shared modules

User: '"vẫn sót trang order-tags → audit không kĩ toàn bộ web 2.0"'. Sweep lại TOÀN BỘ web2/ + render backend cho mọi nhãn native-order CHƯA-PBH. Tìm & sửa 7 chỗ sót (giữ nguyên domain khác: PBH/hóa đơn nháp, so-order NCC nháp, returns nháp, Web 1.0 customer-hub).

- **`render.com/services/web2-order-tags-service.js`** (catalog auto-tag, FE đọc qua `/api/web2-order-tags/triggers`): trigger `is_draft` label "Đơn nháp" → **"Giỏ hàng"** + desc; desc `am_ma` + `chua_nhan_ck` "đơn nháp" → "giỏ hàng". Giữ `id` (no migration). Pill native-orders dùng `name||label` → fallback label mới.
- **`web2/shared/web2-order-tag-detail.js`**: popup âm-mã "Tổng đang giữ (các đơn nháp)" → "(các giỏ hàng)".
- **`web2/shared/web2-ai-page-registry.js`**: nhãn quick-prompt "📦 Đơn nháp chưa lên PBH" → "📦 Giỏ hàng chưa lên PBH" (prompt body giữ `status==='draft'`).
- **`web2/shared/web2-customer-detail-modal.js`**: bảng đơn KH render `x.status` THÔ ("draft") → map nhãn (draft→Giỏ hàng/confirmed→Đơn hàng/…).
- **`web2/report-revenue/index.html`**: KPI Đơn Web "X nháp" → "X giỏ hàng" (giữ pie `pbh.states` = trạng thái PBH riêng).
- **`render.com/routes/native-orders.js`**: lỗi API tách/gộp "đơn nháp" → "giỏ hàng (chưa PBH)".
- Verify: `node --check` 5 file OK; sweep còn lại chỉ PBH/so-order/returns/Web1 (đúng, khác domain). Backend (order-tags-service + native-orders route) cần web2-api redeploy → pill/lỗi live. Status ✅

### [live-chat][native-orders] Thuật ngữ: bản ghi CHƯA PBH = "Giỏ hàng" (không gọi "đơn" gây nhầm)

User: '"live-chat khi kéo SP/tạo → là tạo GIỎ HÀNG cho khách chứ đừng ghi đơn hàng dễ nhầm lẫn → qua native-orders vẫn là giỏ hàng nếu chưa tạo PBH"'. Audit 2 trang chính + sweep toàn bộ trang liên quan. Mô hình chuẩn xác lập: **`draft` (chưa PBH) = Giỏ hàng (cart)**, **`confirmed` (đã có PBH) = Đơn hàng (order)**. Chỉ đổi NHÃN user-facing; **giữ nguyên** mã nội bộ (`draft`/`confirmed`, `NATIVE_WEB`, topic `web2:native-orders`, hàm `createOrder`/`NativeOrdersApi`, tên feature "Đơn Web"), thống kê đơn-hàng thật của KH, và tab "Đơn hàng" Pancake.

- **Status map** (nguồn hiển thị chính): `native-orders-render.js` `web2StatusText` + `native-orders-state.js` `STATUS_META` draft "Nháp" → **"Giỏ hàng"** (icon `file`→`shopping-cart`); `index.html` filter option draft → "Giỏ hàng".
- **live-chat tạo từ comment**: `live-comment-list-orders.js` (toast tạo/gộp/lỗi), `live-comment-list-render-row.js` (title nút: "Tạo giỏ hàng" / "Thêm comment vào giỏ"), `inventory-panel-actions.js` (toast kéo SP), `inventory-panel-render.js` (popup "🛒 Giỏ hàng (N SP)" + "Xóa giỏ"), `comments-mobile-render.js` + `comments-mobile.html` (chip "Đã tạo giỏ", badge "Giỏ hàng …"), `live-order-history.js` (FAB "🛒 Giỏ đã tạo" + modal + cột "Mã giỏ").
- **native-orders inbox-add**: nút/label/notify "Tạo đơn" → **"Tạo giỏ hàng"**; "Đã tạo đơn inbox" → "Đã tạo giỏ hàng inbox".
- **Confirm/notify PBH**: `pbh-bill.js` + `bulk-operations.js` — "đơn Nháp" (chưa PBH) → "giỏ hàng" (vd "Chỉ giỏ hàng (chưa PBH) mới tạo được PBH", huỷ PBH → "trở lại Giỏ hàng"), split → "tạo giỏ hàng mới".
- Verify: `node --check` 11 file JS OK; browser-test localhost — native-orders render "Giỏ hàng"(draft)/"Đơn hàng"(confirmed) trên 11 row thật + filter "Giỏ hàng"; live-chat FAB "🛒 Giỏ đã tạo". Mã nội bộ (status value, source, topic) còn nguyên. Status ✅

### [render][web2/order-tags] Đổi tên tag CK → "Chưa thanh toán" / "Đã thanh toán"

User: '"Đã nhận CK" phải là "Đã thanh toán" thì chính xác hơn'. Đúng — predicate `da_nhan_ck` bật khi **(CK xác nhận) HOẶC (ví KH ≥ tổng đơn)** = đã trả đủ tiền bất kể nguồn (CK / ví / cọc nạp sẵn), không chỉ riêng chuyển khoản → tên cũ hẹp hơn logic.

- `web2-order-tags-service.js` catalog `TRIGGERS`: `chua_nhan_ck` label "Chưa nhận CK" → **"Chưa thanh toán"**; `da_nhan_ck` label "Đã nhận CK" → **"Đã thanh toán"**, desc làm rõ "CK / ví / cọc nạp sẵn".
- **Giữ nguyên `id`** (`da_nhan_ck`/`chua_nhan_ck`) — key ổn định, KHÔNG migration (2 trigger này không nằm trong 4 tag seed DB; predicate không đổi).
- Không đụng badge "⚠ Chưa nhận CK" ở native-orders-render.js (feature khác: bấm gán giao dịch CK). Status ✅

### [web2/shared][render] Trợ lý AI: CASCADE model mạnh→yếu (xoay mọi key free) + thêm model mạnh

User: "key Groq mới + tất cả key free cứ dùng model mạnh nhất tới yếu nhất hỗ trợ web 2.0". Đã workflow xếp hạng 47 model free (web search benchmark) → build cascade.

- **Backend `web2-ai-service.js`**: thêm 3 model mạnh vào registry (backend chỉ chấp nhận model có trong list): gemini-2.5-pro, qwen/qwen3.6-27b (Groq, VN xuất sắc + vision), qwen/qwen3-next-80b-a3b-instruct:free (OpenRouter).
- **Widget `web2-ai-assistant.js`**: `MODEL_CASCADE` mạnh→yếu + `callAiStream` thử lần lượt (stream từng chữ), model lỗi/hết quota → tự rơi xuống model kế; hết cascade → `/complete` non-stream. 401/abort → throw ngay. Manual → 1 model pinned (không cascade). Dropdown "Auto (mạnh→yếu)".
    - Cascade: gemini-2.5-pro → qwen3.6-27b(groq) → gemini-2.5-flash → gpt-oss-120b(groq) → qwen3-next-80b(OR) → llama-3.3-70b(OR) → gemini-2.5-flash-lite. Xoay 3 provider/4 key free.
- **Xếp hạng 47 model** (Artificial Analysis + LMArena, list thật từ /models): top S = nemotron-3-ultra-550b(88,VN khá) + gemini-2.5-pro(88,VN xuất sắc); A = qwen3-coder-480b(80), gpt-oss-120b(78,VN TB), gemini-2.5-flash(74), qwen3.6-27b(72,VN xuất sắc). Caveat: ChatAnywhere alias không chắc thật; OpenRouter free rate-limit; reasoning chậm/tốn token.
- Verify: cascade 4/4 Node test (pro lỗi→qwen3.6, hết→/complete, 401→throw, manual→1 model). Bump v=20260625g. Push → web2-api auto-redeploy nạp key Groq mới + 3 model.

### [web2/shared] Trợ lý AI: fix "đứt câu trả lời" (stream từng chữ) + nút xóa chat + bỏ Groq

User: "widget hay bị đứt câu trả lời — AI viết ra từng chữ mà widget không làm vậy nên bị đứt" + "cho nút xóa đoạn chat". Root cause: 23 trang auto=Groq (đang bị KHOÁ org) → stream Groq lỗi → rơi xuống `/complete` NON-STREAM (1 cục, cap maxTokens 1000) → không gõ từng chữ + cụt câu dài.

Fix `web2/shared/web2-ai-page-registry.js` + `web2-ai-assistant.js`:

- **Đổi TOÀN BỘ 32 trang Groq → Gemini** (gpt-oss-120b→gemini-2.5-flash, llama-8b→gemini-2.5-flash-lite). Gemini stream `/chat/stream` gõ từng chữ + ổn định + không bị khoá. Bỏ HẲN phụ thuộc Groq trong registry.
- **maxTokens 1100/1000 → 4000** (cả callAiStream + \_postAi) → câu trả lời dài không bị cắt.
- **Nút 🗑️ Xóa đoạn chat** ở header (cạnh ⚙️/×): clear history + saveHistory + render (chặn khi đang trả lời).
- Xác minh: `_md` markdown KHÔNG phải bug — dùng NUL sentinel (`\0(\d+)\0`) cho code-block placeholder nên giữ số thật (test giữ 5/11/mã đơn). Bump v=20260625f. providers registry = {gemini:32}.

### [web2/shared] Fix hover-zoom "ảnh to hiện cuối trang" trên trang KHÔNG nạp web2-effects.css (ai-hub…)

User (ai-hub Tạo ảnh): bấm/rê ảnh trong gallery → ảnh không phóng to nổi mà **hiện full-size cuối trang** (không backdrop). Root cause: `web2-effects.js` (hover-zoom) được **autoload MỌI trang** qua sidebar, NHƯNG `web2-effects.css` (chứa `.w2fx-zoom-popup{position:fixed…}`) chỉ `<link>` ở 3 trang (products/variants/returns) — ai-hub KHÔNG có. Thiếu CSS → popup `.w2fx-zoom-popup` về `position:static` → rớt document flow, ảnh clone full-size cuối `<body>`.

Fix `web2/shared/web2-effects.js`: thêm `_ensureZoomStyle()` **tự inject** CSS thiết yếu của popup (position:fixed + z-index + ẩn khi chưa `.is-visible` + giới hạn kích thước ảnh), gọi trong `_ensureZoomPopup()` — giống pattern guard CSS của lightbox + ripple. Module tạo popup tự bảo đảm CSS của nó → đúng MỌI trang dù trang có `<link>` web2-effects.css hay không. Bump autoload `v=20260625a`.

Verify browser (overview — cũng KHÔNG link web2-effects.css = đúng điều kiện bug): trước fix popup `position:static`; sau fix rê ảnh → popup `position:fixed` z-index 99999 KHÔNG ở normal flow ✓; click ảnh → lightbox `#web2ImageLightbox` fixed/flex ✓ (lightbox vốn đã có guard CSS riêng). node --check OK.

### [web2/shared] Trợ lý AI: fallback CHÉO PROVIDER khi 1 provider lỗi (vd Groq bị khoá org)

User báo lỗi test Groq: "Organization has been restricted". = Groq KHOÁ TÀI KHOẢN (org) phía họ — 5 key cùng 1 org nên fail hết; KHÔNG phải bug code (thường do tạo nhiều key cộng dồn quota free → Groq coi là abuse). Tác động: 23 trang data/tài chính tôi set auto=`groq/gpt-oss-120b` (balance-history, native-orders, ví, kpi, reconcile, PBH…) → AI hỏng vì widget KHÔNG fallback chéo provider khi provider chỉ định lỗi.

Fix `web2/shared/web2-ai-assistant.js`: tách `_postAi(body)`; `callAiOnce` thử provider đã chọn TRƯỚC, lỗi (non-401) → **fallback `/complete`** (backend xoay gemini→groq→openrouter, gemini đầu tiên nên bỏ qua Groq hỏng). 401/abort vẫn ném ngay. `callAiStream`: stream error (non-401) chưa có token → cũng rơi xuống `callAiOnce` (fallback). → Groq khoá vẫn chạy bình thường qua Gemini. Bump v=20260625e. Verify Node 3/3 (groq lỗi→gemini, 401→throw, no-provider→/complete).

### [web2/ai-hub] Fix lộ token web2 qua URL ảnh ("Ảnh đã lưu") — fetch + blob thay `?token=`

Adversarial review (đợt trước) phát hiện MEDIUM tồn từ trước: `ai-image.js` `renderHistoryCard` nhét token phiên web2 vào `img src=…/images/:id?token=<tok>` (+ `dl.href`) → token lộ qua DOM/history/Referer/access-log. Token phải đi qua header `x-web2-token` (như mọi chỗ khác), không phải URL.

Fix `web2/ai-hub/js/ai-image.js`: bỏ hẳn `authToken()` + `?token=`. Ảnh protected (`has_bytes`) giờ **fetch kèm `H().authHeaders(false)` (header `x-web2-token`) → blob → `URL.createObjectURL`** cho `img.src` + `dl.href`. Ảnh public (`im.url`) dùng trực tiếp. objectURL **revoke** khi xoá card / reload lịch sử (tránh leak). Verify middleware `requireWeb2AuthSoft` đọc token theo thứ tự header→query→body → fetch-by-header xác thực OK (không cần đổi backend). Bump `ai-image.js?v=20260625b`. node --check OK; e2e cần session web2-users thật (admin@@ legacy 401).

### [web2/shared] Trợ lý AI: thêm 3 CÔNG CỤ dùng chung vào widget ✨ (Ghép đồ · Card/Video · AI viết mô tả)

User: trên `web2/ai-hub` — "hình 2 (Ghép đồ), hình 3 (Tạo Card/Video) cho dùng chung, module AI viết mô tả như hình 1". Chọn **"Trong nút ✨ Trợ lý AI nổi"** → 3 tính năng vốn khoá trong ai-hub giờ tách thành module shared + surface trong widget nổi MỌI trang Web 2.0. ai-hub cũng REUSE chính module shared (1 nguồn, KHÔNG fork).

**3 module shared MỚI** (`web2/shared/`, mountable, tự chứa auth/base + degrade mượt):

- `web2-ai-describe.js` (`window.Web2AiDescribe`): "AI viết mô tả" — nhập ngắn → `/api/web2-ai/complete` mở rộng. API `describe({seed,kind})` (kind: image-prompt EN · product-desc · fb-caption · generic), `attach({button,input,kind})` (gắn nút+textarea kiểu hình 1), `mountPanel(el,{kinds})`.
- `web2-tryon.js` (`window.Web2Tryon.mount(el,{compact})`): Ghép đồ Nano Banana (người + 1..5 áo + phong cảnh) — tách từ ai-tryon.js, dùng Web2VideoStock/AiPresets nếu có, quota-warn, nén ảnh ≤1280.
- `web2-content-maker.js` (`window.Web2ContentMaker.mount(el,{compact})`): Tạo Card/Bài đăng/Video từ data — điều phối Web2HtmlSkill + Web2VideoRender (đã shared). **Tự lazy-load deps** (html-skill, video-render, DOMPurify, html2canvas) → drop-in mọi trang.

**Widget** `web2-ai-assistant.js`: thêm thanh chế độ `.w2aa-modes` (Hỏi đáp · Ghép đồ · Card/Video · Viết mô tả). Mỗi tool **lazy-load module shared khi mở lần đầu** (KHÔNG nặng boot — widget có mặt mọi trang), mount 1 lần vào toolpane riêng (giữ state), panel **tự rộng** (880px) cho ghép đồ/card-video. Base lazy-load suy từ `document.currentScript.src`. Hỏi/Đọc-DB tự về chế độ Hỏi đáp. Bump autoload `v=20260625d`.

**ai-hub reuse** (1 nguồn): `ai-tryon.js`/`ai-html.js` thành thin-wrapper mount `Web2Tryon`/`Web2ContentMaker` vào `#aihTryMount`/`#aihHtml`; `ai-image.js` enhancePrompt gọi `Web2AiDescribe.describe({kind:'image-prompt'})`. Bỏ ~430 dòng logic trùng. index.html load 3 module shared + mount-height CSS.

**Verify** (browser localhost, console-first): 4 mode tab render ✓; describe lazy-load + 4 kind + textarea/button ✓; tryon lazy-load + VideoStock + panel rộng + 2 nút kho ảnh + preset ✓; content lazy-load CẢ deps (html-skill/video-render/DOMPurify/html2canvas) + 6 skill + preview ✓; switch về chat khôi phục composer + un-wide ✓; **0 console error** suốt. ⚠ AI call live 401 = session test `admin/admin@@` là LEGACY login (không phải web2-users) → endpoint web2-ai từ chối; request shape giống hệt ai-hub đang chạy prod. node --check 8/8 file OK.

### [web2/shared] Trợ lý AI: ĐỌC DB THÔNG MINH + audit 23 trang → 19 DB_SOURCES

User: "AI đọc DB có thông minh không? DB nhiều có sao?" + "audit toàn bộ trang/dữ liệu (đọc system dashboard) thêm cho hợp lý".

**(1) Reducer THÔNG MINH** (`web2/shared/web2-ai-assistant.js`): thay đọc "thô" (cắt cụt ~30 dòng đầu). Hàm `encodeArray`: data nhỏ (vừa budget) → RAW đầy đủ; data LỚN → `summarizeDataset` = TÓM TẮT THỐNG KÊ (mỗi field số: tổng/min/max + đếm ÂM/0/trống; field phân loại: value→count; + MẪU dòng "có vấn đề" số âm). → AI thấy bức tranh TOÀN BẢNG dù DB lớn, không phụ thuộc số dòng. Áp cho cả accessor block lẫn DB block. `fetchDbSource` loop-fetch: CHỈ loop khi spec có `hasMoreField` (page-based, hỗ trợ nested `meta.hasMore`); endpoint offset/không phân trang → fetch 1 lần (tránh refetch trùng vô hạn); cap `MAX_DB_ROWS=5000`.

**(2) Audit 23 trang dữ liệu** (workflow 24-agent, đọc system dashboard `web2-modules.json` làm bản đồ) → phân loại: full-cache (accessor đủ: supplier-wallet/supplier-debt/kpi/so-order), none (order-tags/fb-insights), **paginated → cần DB_SOURCE (16 trang)**. Thêm vào registry `DB_SOURCES` (tổng 19): customers `/api/web2/customers/list`(data,hasMore), customer-wallet `/aggregate`(data), returns `/api/web2-returns/list`(returns,hasMore), purchase-refund(records,hasMore), fastsaleorder-delivery `/api/delivery-invoices/load`(orders,hasMore), fastsaleorder-refund `/api/refunds/load`(orders,hasMore), cham-cong(items), chi-tieu(items), ck-dashboard+payment-confirm `/api/web2/payment-signals`(data), audit-log(items), notifications(items), jt-tracking(data), reconcile(items), fb-ads-stats(entries), live-chat `/api/web2-live-comments`(data). Endpoint+dataPath verify từ backend route.

**Verify** (Node, browser bị tranh chấp session): reducer 7/7 (data 3000 dòng → tổng+ÂM=140+đếm status); fetchDbSource 5/5 (hasMore→loop, no-hasMore/offset→1 lần, nested meta.hasMore, 401→throw); dbSourcesFor 19 entries. Bump v=20260625d.

⚠ Tách module: web2-ai-assistant.js ~1100 dòng (gồm feature "AI tools" Ghép đồ/Card/Video/Viết mô tả thêm song song) — nên tách sau. ai-hub/\* + 3 module tools (web2-tryon/content-maker/ai-describe) để commit riêng.

### [web2/shared] Trợ lý AI: ĐỌC DATABASE qua API app (Option B) — trang phân trang thấy TOÀN BỘ bảng

User hỏi "AI coi database không?" → giải thích: chỉ đọc data browser (kho SP/biến thể/KH = full vì cache tải hết; giao dịch/đơn/PBH phân trang `pageSize:50` → chỉ thấy 1 trang). User chọn **Option B: AI đọc qua API đọc sẵn của app** (an toàn, qua auth/phân quyền, KHÔNG SQL thô).

Files: `web2/shared/web2-ai-page-registry.js` (+`DB_SOURCES`/`dbSourcesFor`), `web2/shared/web2-ai-assistant.js` (+fetch DB + inject context + chip).

- **Registry `DB_SOURCES`** (3 trang phân trang, response shape verify từ backend): balance-history `/api/web2/balance-history/` dataPath `data`; native-orders `/api/native-orders/load` dataPath `orders`; PBH `/api/fast-sale-orders/load` dataPath `orders`. Mỗi nguồn { endpoint, params{page,limit:1500}, dataPath, desc }.
- **Widget**: chip "🗄️ Đọc toàn bộ … (DB)" đứng ĐẦU thanh gợi ý (chỉ trang có dbSource). Bấm → `fetchDbSource` GET endpoint (qua worker + `x-web2-token`) → lấy mảng theo dataPath → `_dbData[path]` → `pageContext()` chèn khối "DỮ LIỆU TỪ DATABASE" (ưu tiên CAO NHẤT, trên cache/DOM) → ask phân tích tổng quan. Mọi câu sau vẫn thấy full DB (cache theo trang). Cap rows theo budget 5200 ký tự, báo tổng N. PII vẫn redact.
- **Verify** (Node + harness mock-fetch): dbSourcesFor 6/6; click chip → fetch đúng `…/balance-history/?page=1&limit=1500`; pageContext có "DỮ LIỆU TỪ DATABASE (2 bản ghi)" + giá trị thật. Live thật cần session user (token test 401 server-side).
- ⚠ assistant.js 854 dòng (>800) — cohesive, cân nhắc tách DB-reader sau. registry 1501 = pure-data (OK).

### [web2/shared] Trợ lý AI: gợi ý LUÔN HIỆN (thanh chip cố định, không mất sau khi chat)

User: "luôn hiện gợi ý như hình 1; hình 2 tương tác xong mất gợi ý". Trước đây `render()` chỉ hiện gợi ý khi chưa có hội thoại (`history.length ? '' : quicks`) → chat 1 câu là chip biến mất.

Fix `web2/shared/web2-ai-assistant.js`: tách gợi ý ra **thanh chip CỐ ĐỊNH** `.w2aa-quicks-bar` (giữa model-bar và khung chat, cuộn ngang, `flex:0 0 auto` → luôn hiện bất kể scroll/hội thoại). `renderQuicks()` riêng, gọi mỗi `render()`. Body chỉ còn messages. Hover chip = tooltip prompt đầy đủ. Bump sidebar v=20260625b. Verify harness: 6 chip trước chat = 6 chip sau chat ✓.

### [web2/shared] Trợ lý AI widget — NÂNG CẤP LỚN: gợi ý + đọc data sâu + model theo trang + streaming + fix bug (audit 37-agent)

User: "audit toàn bộ + debug + browser test từng trang + thêm gợi ý/lệnh mẫu + phát triển rộng + đọc dữ liệu chi tiết hơn → hoàn thiện → lặp tới hoàn hảo" + "xem model AI free, ưu tiên cái nào, cho đổi auto theo trang hoặc thủ công".

**Phát hiện (browser test + workflow 32 trang)**: widget mount đúng mọi trang nhưng (1) 5 gợi ý GENERIC giống nhau mọi trang (vô nghĩa theo ngữ cảnh); (2) chỉ đọc DOM → **bảng ảo/phân trang mất data** (products chỉ 5 dòng dù kho nhiều SP → AI tưởng "chỉ 5 SP"); kpi/reconcile/live-chat context rỗng. Audit thêm 2 HIGH privacy (PII/JWT lộ qua innerText), history phình DOM gây lag, 401 ẩn body 200, tắt widget không thật tắt.

**Files**: NEW `web2/shared/web2-ai-page-registry.js` (registry 32 trang, pure-data); rewrite `web2/shared/web2-ai-assistant.js` (394→~715 dòng); `web2/shared/web2-sidebar.js` (load registry TRƯỚC widget, bump v=20260625a).

- **Registry theo trang** (`Web2AiPageRegistry`, auto-gen từ workflow): mỗi trang = { match, model, accessors[{expr,desc,shape}], suggestions[{label,prompt}], note }. `matchPage` longest-prefix. **192 gợi ý theo ngữ cảnh** (products: "SP tồn âm/0", "SP thiếu giá", "SP trùng tên"; variants: "thiếu viết tắt", "viết tắt trùng"; …), fallback GENERIC.
- **Đọc dữ liệu SÂU** (mục tiêu "chi tiết hơn"): 18/32 trang có **dataAccessor** đọc cache/state JS (`Web2ProductsCache.getAll()`, `Web2VariantsCache.getAllIncludingInactive()`, `NativeOrders.STATE`…) → FULL dataset (không bị phân trang). Resolve AN TOÀN bằng **path-walk (KHÔNG eval chuỗi)** + try/catch; báo tổng N mục; cảnh báo bảng DOM virtual để AI không kết luận "tổng sai" từ data 1 phần.
- **Model AI free theo trang** (user request): auto map — nặng tính toán (balance/reconcile/kpi/ví/PBH…) → **groq gpt-oss-120b**; chat/cảm xúc (live-chat) → **gemini-2.5-flash**; nhẹ (overview/dashboard) → **llama-3.1-8b-instant**; default → gemini-2.5-flash. **Dropdown chọn model thủ công** ngay trong panel (🤖 Auto / 5 model) + tương thích config cũ (empty provider=auto, có provider=manual).
- **Streaming reply** (P0, backend `/chat/stream` đã có flushHeaders → không timeout) + fallback non-stream. **PII redaction** (SĐT/email/JWT/fb_id → mask, giữ số tiền). **Fix bug**: history cap 40 + patch bubble cuối (hết lag), placeholder cờ `pending` (hết lẫn ⏳ vào history), 401 ẩn body 200 + guard `_authRedirecting`, tắt widget = đóng panel + chặn open/ask, persist history theo trang, nút copy, markdown tốt hơn (heading/list/code), ẩn ở trang nhạy cảm (pancake-settings/zalo/system/users-permissions).
- **Verify**: 26/26 Node unit-test pass (registry matching + model theo trang + resolveExpr path-walk + redactPII). ⚠ Browser E2E live BỊ CHẶN: session `web2_auth` hết hạn + admin prod đổi pass (seed `admin@@` không còn đúng) → cần user web2 thật để test gọi AI thật trên trang.
- **Model free hiện có** (`web2-ai-service.js`): gemini (2.5-flash 👁/lite/latest, 1500/ngày), groq (gpt-oss-20b/120b, llama-3.3-70b/3.1-8b/4-scout), openrouter (gpt-oss/deepseek-v3/r1/llama/qwen3-235b), chatanywhere (gpt-4o-mini/4.1/3.5/deepseek). Failover: gemini→groq→openrouter.
- Status: ✅ code + unit-test; 🔄 chờ session web2 để browser E2E.

### [render][web2/system] Tab "Dịch vụ & Hệ thống": Render = TẤT CẢ PAID (đúng plan thật từ API)

User báo lỗi ai-hub `⚠️ Customer 360 proxy failed: Request timeout after 15000ms` → trace ra `handleCustomer360Proxy` chỉ là proxy CHUNG (tên gây hiểu lầm) cho ~40 route; request chat AI (`/api/web2-ai/chat/stream` → web2-api) không trả headers trong 15s nên Cloudflare Worker cắt. User xác nhận **"render đều là paid server hết"** → không idle-sleep, timeout chỉ do redeploy/restart.

Cập nhật tab `web2/system` (?tab=services) phản ánh đúng plan thật (query Render API):

- **Files**: `render.com/routes/services-overview.js` (SERVICES_INVENTORY), `web2/system/js/system-services.js`, `web2/system/index.html`, `web2/system/css/system.css`.
- **Plan thật (Render API)**: web2-api **Standard $25**, n2store-fallback **Standard $25**, web2-realtime **Starter $7** (service thứ 3 — trước dashboard BỎ SÓT), 2× Postgres **basic_1gb $19**. → Tổng Render **$95/mo**.
- **services-overview.js**: thay entry cũ "Render Backend (×2 web service) Starter $7 + free-tier" bằng **3 entry compute riêng** (đúng plan/cpu/ram/cost từng service), bỏ `freeTier` cho mọi Render resource (đều paid → `freeTier: null`, chuyển limit sang `paidLimit` + `uptime: Always-on KHÔNG sleep`). 2 Postgres bỏ "90 days expiration"/"free 1GB" → "Basic 1GB · PAID". Comment header ghi rõ all-paid + lý do timeout.
- **system-services.js**: DB card bỏ class `sd-plan-free` cho web2Db (cả 2 DB paid), planLabel → "Basic 1GB · PAID ($19/mo)".
- **index.html + system.css**: thêm banner xanh `.sd-render-note` dưới cost strip — "Tất cả Render PAID = $95/mo, không idle-sleep, timeout 15000ms chỉ do redeploy/restart ~30-60s". Bump `system.css?v=20260625a` + `system-services.js?v=20260625a`.
- **Deploy**: 3 service Render `autoDeploy=yes` từ `main` → push tự redeploy web2-api (serve `/api/services-overview`, isWeb2Path=true).
- Status: ✅ code + syntax OK; chờ deploy verify data + browser-test UI.

## 2026-06-24

### [perf] Làm đẹp khuôn mặt → WEB WORKER (hết "đứng/stuck" hoàn toàn)

User: ai-photo Làm đẹp vẫn "loading hoài" — screenshot cho thấy kẹt ở **"Đang nhận diện khuôn mặt…"**. Root cause: cả **MediaPipe detect** lẫn **lọc** (smoothSkin/warp) chạy ĐỒNG BỘ trên main-thread → đứng UI (nặng nhất trên browser software-render / máy yếu). Giảm res (turn trước) chưa đủ.

Fix triệt để — chuyển TOÀN BỘ xử lý nặng sang **Web Worker** (built-in trình duyệt, MIỄN PHÍ):

- **NEW `web2/shared/beauty/web2-beauty-worker.js`**: chạy smoothSkin/adjustSkinTone/beautify/warp/auto trên luồng nền (pixel buffer Transferable). `web2-beauty-filters.js` đổi IIFE `(window)`→`(self)` để chạy được trong worker; `web2-beauty-studio.js` doApply → async, gọi `processImageData()` (worker, fallback sync).
- **NEW `web2/shared/beauty/web2-beauty-face-worker.js`** (module worker): chạy MediaPipe FaceLandmarker nền; `web2-beauty-face.js` `detect()` gửi ImageBitmap (đã thu nhỏ ≤640) sang worker → landmarks; keepalive `_emit` 1.5s để guard 30s ở studio không tự huỷ khi tải model; fallback `_detectMain` nếu worker lỗi.
- **Verify browser (headless, môi trường chậm nhất)**: probe trong lúc xử lý đều TRẢ LỜI ~0.01-0.02s = **main-thread KHÔNG đứng** (trước đây timeout/frozen); detect xong (busy:false, XNNPACK CPU, có mặt); Tự động apply → whole-canvas hash ĐỔI (changed:true ~146ms). Smooth/warp/auto đều chạy qua worker OK. Chỉ còn 1 lần chờ NỀN: tải model ~13MB lần đầu/phiên (spinner mượt, page tương tác được).
- Bump version 5 file beauty (ai-photo + video-beauty). Worker URL lấy từ currentScript (cùng thư mục).

### [feat] Mobile: thanh menu dưới cùng cho điện thoại + fix nút Đăng xuất bị khuất

User: "Trên điện thoại không có nút đăng xuất? → Có giao diện riêng cho điện thoại nên làm thanh menu cho điện thoại luôn đi". Chọn kiểu **bottom bar**.

Files: `web2/shared/web2-sidebar.js` (bottom bar + sheet Tài khoản, bump mobile.css), `web2/shared/web2-mobile.css` (CSS bottom bar/sheet + dvh fix).

- **Nguyên nhân logout khuất**: `.web2-aside { height: 100vh }`. Trên trình duyệt điện thoại `100vh` tính cả vùng sau thanh URL/toolbar → footer (pinned bottom) chứa nút Đăng xuất bị đẩy xuống **dưới mép màn hình nhìn thấy** → "không có nút đăng xuất". Fix: ở mobile ép `.web2-aside` dùng `100dvh` (dynamic viewport, fallback `100vh`) + `padding-bottom: env(safe-area-inset-bottom)` cho footer.
- **Thanh menu dưới (≤600px)**: `web2-sidebar.js` inject `<nav class="w2-mobile-bottombar">` cố định đáy, 4 nút chạm-ngón-cái: **Tổng quan** (→ overview) · **Menu** (mở drawer đầy đủ) · **Thông báo** (→ notifications) · **Tài khoản** (mở bottom sheet). Ở phone **ẩn nút ☰ nổi** (bottom bar đã có Menu) + bỏ chừa 48px header + chừa `padding-bottom` cho main không bị che.
- **Bottom sheet Tài khoản**: avatar + tên + @user·role, hai dòng **Hồ sơ tài khoản** (Web2UserProfile.open) + **Đăng xuất** (Web2Auth.logout) — vì modal hồ sơ chưa có nút Đăng xuất → đây là đường thoát rõ ràng trên điện thoại. Chưa đăng nhập → chuyển trang login.
- **Cache-bust**: bump `web2-mobile.css?v=20260624mob` (inject 1 nguồn → lan mọi trang). CSS + JS đi cùng nhau khi sidebar.js revalidate.
- **Embed (iframe ?embed=1)**: ẩn bottom bar/sheet để iframe (vd Phân quyền) không dựng thanh riêng.
- **Verify** (Playwright 390×844, login thật): bottom bar `display:flex` fixed đáy (top 774 + h70 = 844, in-viewport) ✓; account sheet `display:block`, rows ["Hồ sơ tài khoản","Đăng xuất"], logout in-viewport ✓; **drawer footer logout footerBottom=winH=844, in-viewport ✓** (dvh fix); desktop 1440 bottom bar `display:none` (không lộ) ✓. 3 screenshot xác nhận layout đẹp.

### [perf] Làm đẹp khuôn mặt bớt "đứng/stuck" — giảm res xử lý (DETECT_MAX 640, MAX_WORK 1440)

User: ai-photo "tải model xong stuck". Chẩn đoán (browser-test ảnh thật): mọi modal MỞ OK; engine load OK (opencv là Promise resolve ra Mat+inpaint; MediaPipe XNNPACK CPU; transformers RMBG). "Stuck" = **xử lý ĐỒNG BỘ chặn main-thread** trên ảnh lớn (detect MediaPipe + lọc smoothSkin/warp). Code lọc O(N) chuẩn (box-blur running-sum) + đã có `setBusy`+double-rAF; KHÔNG bug — chỉ nặng CPU. ⚠ Headless Chromium (software WASM, không SIMD) phóng đại freeze tới 60s+ → KHÔNG đại diện Chrome thật (ở đó ~dưới giây–vài giây).

Files: `web2/shared/beauty/web2-beauty-face.js` (DETECT_MAX 1024→640), `web2/shared/beauty/web2-beauty-studio.js` (MAX_WORK 1800→1440); bump version (ai-photo, video-beauty).

- **DETECT_MAX 640**: FaceLandmarker.detect chạy sync; detect không cần res cao → 640px nhanh ~2.5×, landmark normalize 0..1 scale lại W,H gốc (không giảm chất lượng output).
- **MAX_WORK 1440**: canvas xử lý lọc; 1440 vẫn nét cho FB/Zalo/in, lọc nhanh hơn ~35%.
- Verify: logo eraser opencv inpaint OK trên ảnh thật (turn trước); beauty engine load + detect OK; freeze duration không đo được chính xác trong headless. **Fix triệt để nếu real-Chrome vẫn lag = chuyển lọc sang Web Worker** (đề xuất follow-up).

### [fix] Phân quyền: nhãn trang sidebar bị cụt ("Trợ lý AI…"→"Tr", "Sửa ảnh AI…"→"S")

User: "https://nhijudy.store/web2/users/index.html lỗi ai-assistant và ai-photo" (nhãn 2 trang AI hiển thị cụt còn "Tr" / "S").

Files: `web2/users-permissions/index.html` (regex làm sạch nhãn auto-discover).

- **Nguyên nhân**: ma trận phân quyền tự bổ sung trang có trong sidebar NAV mà thiếu ở `WEB2_PAGES` (auto-discover, view-only). Regex cắt emoji trang trí cuối nhãn dùng `\s*[^\w\s].*$` — nhưng `\w` trong JS là **ASCII-only**, coi dấu tiếng Việt (ợ, ý, ử…) là ký tự "lạ" → nuốt từ chữ có dấu đầu tiên tới hết: `"Trợ lý AI theo trang ✨"`→`"Tr"`, `"Sửa ảnh AI 🪄"`→`"S"`. (2 trang này lấy nhãn từ sidebar vì chưa có trong registry backend; ai-hub/video-maker không dính vì lấy nhãn từ `WEB2_PAGES`.)
- **Fix**: thay bằng strip emoji/biểu tượng ở ĐẦU/CUỐI qua Unicode property escape `^[\s\p{Extended_Pictographic}️‍]+|[…]+$/gu` — chỉ ăn emoji + VS16 + ZWJ + khoảng trắng, **giữ nguyên dấu tiếng Việt**.
- **Verify**: Node test 7 case (Trợ lý/Sửa ảnh/Xưởng Video + emoji đầu/cuối + nhãn thường) → ALL PASS, diacritics giữ nguyên. Iframe đã cache-bust `&t=Date.now()` nên không cần bump version.

### [fix] Phân quyền: Save báo 400 `Page "ai-assistant" không tồn tại`

User: lưu phân quyền → `PUT /api/web2-users/39/permissions 400` `{"error":"Page \"ai-assistant\" không tồn tại"}`.

Files: `render.com/routes/web2-users.js` (registry + validation PUT /permissions) — deploy `web2-api`.

- **Nguyên nhân**: FE auto-discover trang sidebar (ai-assistant/ai-photo) cho admin tick `view`, nhưng BE `PUT /:id/permissions` validate CỨNG — slug không có trong `WEB2_PAGES` → reject 400. → mọi trang chỉ-có-trong-sidebar đều vỡ lúc Save, không riêng 2 trang AI.
- **Fix (2 lớp)**: (1) thêm `ai-assistant` (Trợ lý AI theo trang) + `ai-photo` (Sửa ảnh AI) vào `WEB2_PAGES` nhóm AI, `actions:['view']` (đúng convention "thêm trang mới → 1 entry"); (2) nới validation: slug lạ vẫn lưu được **nếu** slug an toàn `/^[a-z0-9][a-z0-9-]{0,63}$/` **và** chỉ action `view` → khớp auto-discover, trang sidebar mới sau này không vỡ. Action khác / slug lạ → vẫn reject. Known page sai action → vẫn reject.
- **Verify**: `node -c` OK + Node test 7 nhánh (known mới pass, future view-only pass, non-view reject, unsafe slug reject, known-bad-action reject) → đúng hết. BE cần Render redeploy `web2-api`.

### [fix] Xóa logo dùng OpenCV inpaint THẬT (trước chỉ làm mờ) + product-card tự động xóa nền

User: (1) "xóa logo không hoạt động đúng, chỉ làm mờ đi"; (2) "tạo card sản phẩm sẽ tự động xóa nền SP trước khi tạo card".

Files: `web2/shared/web2-logo-eraser.js` (inpaint OpenCV), `web2/product-card/index.html` (auto-bg deps + toggle + bump), `web2/product-card/js/product-card.js` (loadProductImage auto-cutout), `web2/ai-photo/index.html` (bump logo-eraser).

- **Xóa logo (fix)**: `_inpaintRect` cũ = nội suy song tuyến từ 4 viền → fill gradient = TRÔNG NHƯ LÀM MỜ, không xóa được trên nền texture. Nay `applyErase` ưu tiên **OpenCV `cv.inpaint` TELEA** (content-aware): lazy-load opencv.js `@techstark@4.11.0` (~8MB; loader xử lý cv là Promise — verify: `window.cv` resolve ra module có Mat+inpaint, ~init lần đầu rồi cache). ⚠ Mấu chốt CHẤT LƯỢNG: trong mỗi ô user khoanh, KHÔNG mask cả ô (→ smear) mà **high-pass tách NÉT logo** (GaussianBlur nền → absdiff → threshold 18 → dilate) rồi chỉ inpaint nét → GIỮ vân nền. frac ngoài [0.4%–55%] → fallback mask cả ô. Lỗi opencv → fallback bilinear. **Verify trên ảnh thật của user** ("CN with love / New collection 2026" trên vải xám): chữ biến mất, vân vải giữ được, inpaint ~1.2s.
- **Auto xóa nền product-card**: thêm `loadProductImage(src)` → nếu bật "✨ Tự động xóa nền" (default ON) thì gọi `Web2BgScene.cutout(src,{prefer:'auto'})` (server rembg máy shop nếu có, else on-device RMBG-1.4) TRƯỚC khi vẽ card; giữ `_origSrc` để tắt toggle revert ảnh gốc. Route upload/paste/chọn-kho qua loadProductImage. Lỗi cutout → dùng ảnh gốc. Verify browser: cutout RMBG-1.4 on-device trả ảnh 72KB ✓, 0 console error.

### [feat] A — HyperFrames render video HTML→MP4 (self-host máy shop, như VieNeu) + nối B→A

User chọn A (sau B): dựng HyperFrames thành service render video self-host trên máy shop (mô hình VieNeu-TTS).

Files: **NEW** `hyperframes-render/` (server.js + package.json + README + run-mac.command + run-windows.bat + .gitignore), `web2/shared/web2-video-render.js` (`Web2VideoRender`); sửa `web2/shared/web2-html-skill.js` (skill `video-hyperframes` + size 1080×1920 + flag video), `web2/ai-hub/js/ai-html.js` (nút "Render MP4 (máy shop)"), `web2/ai-hub/index.html` (load video-render + bump).

- **hyperframes-render/server.js** (Node 22, máy shop): Express `POST /render {html}` → ghi HTML → chạy HyperFrames CLI (`HF_RENDER_CMD` override) → trả MP4; `/health`; CORS `*`; cloudflared tunnel + heartbeat 30s. **KHÔNG cần route worker/registry mới** — tái dùng `web2-vieneu-registry` (cột `engine`, đăng ký `engine='hyperframes'`).
- **Web2VideoRender** (client): `listMachines()`→`pickOnline()` (probe /health)→`render({html})` POST thẳng tunnel máy → MP4 blob URL. Không máy online → lỗi rõ ràng.
- **B→A**: HTML Studio thêm skill `video-hyperframes` (composition động: data-composition-id + GSAP timeline paused + window.\_\_timelines). Skill video → hiện nút render.
- **Verify browser** (chưa có máy shop): 6 skill, nút render đúng skill video (1080×1920), discovery graceful (machines [], render → lỗi "Chưa có máy render online…"), 0 console error. Render thật verify khi bật `hyperframes-render` trên máy shop (README).

### [feat] HTML Studio — sinh HTML đẹp từ data bằng AI free (mượn ý html-anything) + product-card "Layout AI"

User: nghiên cứu hyperframes/html-anything → chọn làm **B** (port pattern "skill + anti-AI-slop" vào product-card/ai-hub dùng AI free sinh card/bài đăng HTML đẹp). (A = HyperFrames render service self-host máy shop — làm tiếp sau.)

Files: **NEW** `web2/shared/web2-html-skill.js` (`Web2HtmlSkill`), `web2/ai-hub/js/ai-html.js` (`AiHtml`); sửa `web2/ai-hub/index.html` (tab "HTML Studio" + pane + scripts DOMPurify/html2canvas), `web2/ai-hub/js/ai-hub.js` (switchTab/init hook), `web2/ai-hub/ai-hub.css` (`.aihh-*`), `web2/product-card/index.html` (nút "Layout AI" + scripts), `web2/product-card/js/product-card.js` (`openAiLayout` modal), `web2/product-card/product-card.css` (`.pcard-ai-*`).

- **Web2HtmlSkill** (1 nguồn dùng chung): 5 skill drop-in (`fb-sale-post`, `product-card-rich`, `price-list`, `voucher-card`, `data-report`) + preamble **chống "AI slop"** (font Be Vietnam Pro, lưới 8px, contrast ≥4.5, không #000/#fff, **data thật cấm lorem**, khung canvas theo skill). `generate()` **reuse `/api/web2-ai/chat/stream`** (KHÔNG cần backend mới / Render deploy) → stream HTML vào `iframe[sandbox=allow-same-origin]` (no allow-scripts = chặn XSS) → export PNG (html2canvas) / HTML.
- **Resilience**: failover provider trên STREAM `gemini→groq→openrouter` (mỗi attempt 1 provider) + auto-retry khi `bodyIsEmpty`. KHÔNG dùng `/chat` non-stream (worker timeout 15s với HTML dài). Bug đã gặp khi test: Gemini overload → fix bằng failover; non-stream fallback timeout → bỏ.
- **HTML Studio** (ai-hub tab mới): picker skill + textarea data + "Tạo lại/PNG/HTML/Mở tab" + iframe preview scale-to-fit.
- **product-card "Layout AI"**: nút mở modal, gom field SP (name/price/badge/note/shop) → skill `product-card-rich`, ảnh SP chèn qua placeholder `__PRODUCT_IMAGE__` (không gửi base64 cho AI) → export.
- **Verify browser** (localhost): price-list + fb-sale-post (real data, render đẹp, 0 console error), product-card "Túi tote canvas" → Xong ✓. Screenshot OK.

### [feat] Cấu hình & Hệ thống — 2 tab mới "Module" + "Bên thứ 3" (audit 5 vòng) + sửa tab Dịch vụ cho chính xác

User: audit lại Web 2.0 → trang `web2/system/?tab=services`: (1) tab Dịch vụ đã chính xác chưa khi có code/feature/trang mới; (2) thêm 1 tab tổng hợp toàn bộ module + 1 tab tổng hợp toàn bộ bên thứ 3 (vd github) — rà soát 5 vòng.

Files: **NEW** `web2/system/js/system-modules.js`, `web2/system/js/system-thirdparty.js`, `scripts/gen-web2-system-data.js`, `web2/system/data/{web2-modules.json,web2-third-parties.json,_module-categories.json}`; sửa `web2/system/index.html` (2 tab + 2 panel + cross-link), `web2/system/js/system-app.js` (VALID*TABS + lazy-init + reload), `web2/system/css/system.css` (mod-* / tp-\_), `render.com/routes/services-overview.js` (SERVICES_INVENTORY).

- **Audit bên thứ 3 = workflow 5 vòng** (13 agent, ~1.1M tok): discover 6 góc (CDN libs, frontend API, backend+ENV, OSS/GitHub ports, infra, services-accuracy) → 5 vòng rà soát lăng kính riêng (AI/LLM/TTS → nhắn tin/TPOS/payment → CDN lib/on-device model → OSS+infra → cross-check) → synthesize. Ra **70 bên thứ 3** (mỗi mục có `usedIn` = file thật, đã spot-verify grep KHÔNG hallucination). Registry: `web2-third-parties.json` (category/provider/cost/license/layer/usedIn/envKeys[chỉ TÊN biến]/githubUrl/status). Tab UI: filter category + layer (web2/web1) + cost + search.
- **Tab Module**: `web2-modules.json` sinh bởi `gen-web2-system-data.js` (đọc codemap + quét render.com) — 126 shared (20 nhóm category) + 43 trang + 57 route + 35 service backend. 3 view (Dùng chung / Trang / Backend), search, category chips. (10 shared module mới chưa categorize → "Khác", chạy lại categorize sau.)
- **Sửa tab Dịch vụ (9 finding)**: Firestore = LEGACY/drained cho Web 2.0 (data đã sang Postgres 2026-06-14, chỉ pancake*tokens còn active); web2Db purpose = bảng web2*\* thật (bỏ "Neon/78 entities"); Firebase Auth = Web 1.0 (Web 2.0 dùng auth Postgres); Cloudflare = unified proxy; GitHub Pages → nhijudy.store; +AI/TTS/SePay/TPOS; Render = 2 service (n2store-fallback + web2-api). ⚠ Tab Dịch vụ đọc API live → cần Render redeploy mới thấy inventory mới.
- **Verify browser** (localhost, 5 tab): 0 console error; Module 116→126 cards/20 nhóm; Bên thứ 3 70 cards/13 nhóm, filter web1→16, search "gemini"→3; screenshot OK.

### [feat] Trang "Sửa ảnh AI" mới (group AI) thay photo-editor cũ — gom mọi công cụ ảnh

User: "photo-editor cũ/dở → xóa, làm trang mới bên group AI, gồm tất cả tính năng + model github tốt nhất (license kệ vì nội bộ)".

Files: **NEW** `web2/ai-photo/` (index.html + js/ai-photo.js + ai-photo.css), **NEW** `web2/shared/web2-bg-scene.js`; sửa `web2/shared/web2-sidebar.js` (thêm "Sửa ảnh AI 🪄" vào group AI, bỏ "Chỉnh sửa ảnh" khỏi Đa dụng + route list); **XÓA** `web2/photo-editor/`.

- **Trang tool-grid** điều phối các module dùng chung (KHÔNG dựng lại): `Web2BgScene` (xóa/đổi nền), `Web2LogoEraser` (xóa logo/WM), `Web2Watermark` (thêm logo/WM), `Web2BeautyStudio` (8 tool làm đẹp), `Web2ImageEditor` (nâng cao/Photopea). Input dán/kéo-thả/chọn; kết quả → chỉnh chồng tiếp.
- **Web2BgScene** (xóa nền in-browser): transformers.js 3.8.1 pipeline `background-removal`. ⚠ Bug đã fix: pipeline KHÔNG có ở 3.0.2 (phải 3.8.1); BiRefNet_lite load được nhưng INFERENCE ném lỗi WASM (số 240595976) → refactor thử từng model load+inference trong CÙNG try, fallback, cache pipe chạy được. Model: **RMBG-1.4** (proven) → modnet fallback. Verify: cutout RMBG-1.4 ra PNG alpha 161KB ✓. + composite nền màu/ảnh/sinh-AI-Pollinations-free, server rembg (BiRefNet) nếu có máy.
- **Verify browser**: 6 module load, 12 tool, set ảnh → tools hiện, cutout RMBG-1.4 OK, UI sạch (screenshot). bg-remover/app.py default → birefnet-general-lite (commit trước).

## 2026-06-24

### [feat] Chấm công — nhóm 3a (widget Hôm nay) + nhóm 2 (Chốt lương + khoá kỳ)

Files: `cham-cong-app.js`, `cham-cong-payroll.js`, `cham-cong-api.js`, `render.com/routes/web2-attendance.js`, `index.html`.

- **Widget "Hôm nay"** (`renderTodayHtml`, app.js): trên đầu Bảng công (chỉ tháng hiện tại) — chip đếm + danh sách ai **chưa vào / quên bấm ra / vắng / đang làm / đủ**, tính theo giờ GMT+7 + ca từng NV. Frontend thuần từ records.
- **Chốt lương + khoá kỳ (B-roadmap #1)**: backend table `web2_attendance_period_lock` (month_key PK, locked_by/at, snapshot JSONB) + routes `GET/POST /period-lock`, `DELETE /period-lock/:mk` (requireWeb2Admin). Frontend: nút "🔒 Chốt lương tháng này" → gửi snapshot (rows: du+pr+m mỗi NV + total) → khoá. Tháng đã khoá → `entriesForRender`/`resolveRow` **render từ snapshot (đóng băng)**, banner 🔒 + "Mở khoá", ẩn Sửa/Chốt, Chi tiết/In/Excel dùng snapshot. Guard chặn sửa punch khi khoá (saveDayDetail + add/del). SSE `period-lock` → reload.
- Bump api/payroll/app `?v=` h/l/n. **Verified browser**: LIVE→có nút Chốt+Sửa+tổng live; LOCKED→render snapshot đóng băng (9.999.000đ thay 190.000đ), banner+Mở khoá, ẩn Sửa/Chốt, 0 error. Salary unit-test (nhóm 1) pass. Backend cần Render redeploy để có endpoint period-lock.
- **Còn lại** (user chọn nhưng chưa làm): Lịch sử thay đổi/audit (nhóm 2) + Nghỉ phép có loại (nhóm 3b) — đều cần table backend mới.

### [feat] Thêm logo / watermark (Web2Watermark) vào photo-editor — phần DUY NHẤT còn thiếu

User yêu cầu 5 chức năng sửa ảnh (xóa nền, đổi nền, xóa logo, xóa watermark, thêm logo/watermark) + "license kệ vì làm kho nội bộ". **Audit phát hiện 4/5 ĐÃ CÓ** (tránh build trùng — bài học đọc-existing-trước):

- Xóa nền + đổi nền → `web2/photo-studio/` (MediaPipe Selfie + @imgly isnet + SlimSAM + chroma; nền màu/preset/scene/upload).
- Xóa logo + watermark → `web2/photo-editor/` tool "Xoá logo" + shared `Web2LogoEraser` (inpaint vùng chọn).
  → Chỉ **THÊM logo/watermark** chưa có. Đã XÓA các file build trùng (image-tools/, web2-bg-scene.js, web2-image-inpaint.js).

Files: **NEW** `web2/shared/web2-watermark.js` (`Web2Watermark.open(src)→Promise<dataURL>`), `web2/photo-editor/index.html` (+script +tool button "Thêm logo/WM"), `web2/photo-editor/js/photo-editor.js` (runTool case 'watermark').

- **Web2Watermark**: modal tự chứa — upload logo, 9 vị trí, slider Cỡ + Mờ, checkbox "Lặp khắp ảnh (watermark chìm, xoay nghiêng)". Composite canvas full-res on-device, $0. Trả dataURL. Cắm vào framework tool có sẵn của photo-editor (mirror Web2LogoEraser).
- **Verify browser**: button "Thêm logo/WM" có; module load; modal mở 9 anchor; nạp logo→preview render→Áp dụng→result dataURL 22KB→modal đóng; tile mode hiện logo lặp xoay nghiêng đẹp.
- **MEMORY**: feedback_web2_license_internal (Web 2.0 nội bộ → dùng tự do model NC/AGPL).

## 2026-06-24

### [fix] Chấm công — nhóm 1/3: sửa lỗi tính lương (B3/B6/B7/B9/B10/B11) sau audit

Files: `cham-cong-salary.js`, `cham-cong-employees.js`, `cham-cong-payroll.js`, `index.html`. Theo audit [`docs/web2/CHAM-CONG-AUDIT.md`](web2/CHAM-CONG-AUDIT.md).

- **B7 số công nguyên**: `calcMonth` đếm `workedDays += 1` (bỏ cộng phân số → hết 14.8/20.54). Đi muộn/về sớm phạt riêng, không trừ số công.
- **B9 punch thiếu = 0**: `calcDay` chặn `incomplete` (1 lượt quẹt) → baseSalary=0 + cờ (trạng thái vẫn "missing"). Trước tính vài phút vô nghĩa.
- **B10 override công reset phạt**: `salary_days_override` set → `lateDeduction=0` (chốt cứng số ngày).
- **B11 validate giờ ca**: chặn lưu nếu giờ ra ≤ giờ vào (chưa hỗ trợ ca qua đêm).
- **B3 chống gán trùng NV**: cảnh báo khi 1 NV gán ≥2 PIN; Bảng lương banner đỏ + "⚠ PIN xxx" dòng trùng.
- **B6 lương tháng 0 công**: "⚠ 0 công" nhắc kiểm tra giảm trừ.
- Bump j/k/l. Verified unit-test: incomplete→0, workedDays=2 (không 1.95), override→late=0.

### [feat] inventory-tracking — Quick-pick SP từ kho: popup canh giữa + multi-select + chèn nhiều dòng dưới

User (3 ý): (1) chỉnh vị trí input khi bấm nút bút-chì ở ô STT; (2) nhập tìm → SP có **checkbox chọn nhiều** + nút **Xác nhận**; (3) Xác nhận **chèn các SP đã chọn thành dòng mới NẰM DƯỚI** dòng được bấm.

Files: `inventory-tracking/js/product-quick-pick.js` (viết lại), `inventory-tracking/js/crud-operations.js` (+`insertProductRowsBelow`), `inventory-tracking/css/product-quick-pick.css`, `inventory-tracking/index.html`.

- **Vị trí (1)**: bỏ dropdown nhỏ bám theo ô (dễ lệch) → **popup canh giữa màn hình** (overlay dim `.iqp-overlay` + card `.iqp-panel`, input 16px/cao 46px, nút to — iPad-friendly, đồng bộ style cell-edit popup).
- **Multi-select (2)**: mỗi kết quả là `<label>` + checkbox `.iqp-check`; chọn lưu vào `Map _selected` (giữ qua nhiều lần search), footer "Xác nhận (N)" cập nhật realtime, disable khi N=0. Enter tick item highlight; click ngoài/Esc/✕ đóng.
- **Chèn dưới (3)**: confirm → `window.insertProductRowsBelow(invoiceId, afterIdx, names[])` (crud-operations.js): build mỗi name thành 1 row mới (maSP=tên, field khác rỗng — như copyProductRow) → `splice(afterIdx+1, 0, ...newRows)` → `_persistSanPham` (save + flatten + re-render). Dòng được bấm GIỮ NGUYÊN.
- **Verified browser (stub API, KHÔNG ghi prod)**: mở picker → overlay canh giữa; search "ao" → 20 kết quả đều có checkbox; chọn 2 → "Xác nhận (2)"; confirm → gọi insert đúng `(invoiceId, idx, [2 tên])`, overlay đóng. Insert data: before=1 → after=3, `[idx+1]=TEST-AAA`, `[idx+2]=TEST-BBB` (đúng vị trí dưới dòng bấm), `shipmentsApi.update` nhận mảng mới (stub) → reload xả test rows. Screenshot xác nhận UI.
- Bump product-quick-pick.js/.css + crud-operations.js → 20260624c.

### [fix/feat] Chấm công — guard chống reload nền mất chỉnh sửa + heartbeat strip-only + in phiếu lương

User: (1) gán NV → máy đẩy dữ liệu refresh bảng ~5s khi chưa Lưu → mất chỉnh sửa; (2) thêm nút in phiếu lương tháng chi tiết.

Files: `web2/cham-cong/js/cham-cong-app.js`, `cham-cong-employees.js`, `cham-cong-payroll.js`, `index.html`.

- **Bug refresh mất edit (gốc)**: heartbeat ADMS (~10s) `_notify('heartbeat')` → SSE `web2:attendance` → client `loadAll()` → re-render tab Nhân viên → **mất ô đang gõ**. Fix 2 lớp: (a) **heartbeat → strip-only**: SSE handler đọc `evt.data.action`, `heartbeat`/`sync` → `refreshSyncOnly()` (chỉ fetch sync-status + cập nhật dải, throttle 20s, KHÔNG reload bảng); chỉ `records`… mới `loadAll`. (b) **edit-guard tab Nhân viên**: `state.empDirty` set khi gõ/đổi ô (banner "có thay đổi chưa lưu") → `render({force})` bỏ qua rebuild khi reload nền (`force=false`) + dirty → GIỮ nguyên ô đang gõ; force=true (đổi tab/tháng, Tải lại, thêm/xoá NV, Lưu tất cả) mới dựng lại. `renderActive(force)` threaded qua loadAll/setTab/shiftMonth/ccReload.
- **In phiếu lương** (`printPayslip`): nút "🖨 In" mỗi dòng Bảng lương + trong modal Chi tiết → `window.open` phiếu lương A4 self-contained (header shop, NV/mã/ca/đơn giá, breakdown lương chính/OT từng ngày/phụ cấp/thưởng/giảm trừ+phạt muộn/đã trả, tổng+còn lại, ghi chú tháng+ngày, ô ký) → auto `window.print()`. Không thư viện.
- Bump payroll/employees/app `?v=` 20260624 j/k/l.
- **Verified browser**: 0 console error; edit-guard (gõ→dirty→banner→reload nền GIỮ edit→force rebuild fresh); payslip HTML đủ section (PHIẾU LƯƠNG/tên/tổng/thưởng/tạm ứng). Audit toàn trang chạy nền (workflow) — bug + roadmap báo sau.

### [feat/fix] Chấm công — nhúng token vào bộ cài (admin-only, KHÔNG vào repo) + hiện "Đang kết nối" cho ADMS

User: "cai-cham-cong.bat chưa để token vào" + "không được để token ở folder github".

Files: `web2/shared/web2-attendance-installer.js`, `web2/printer-settings/index.html`, `render.com/routes/web2-attendance.js`, `render.com/routes/web2-attendance-adms.js`.

- **Token KHÔNG ở repo**: secret nằm env Render. Thêm endpoint **admin-only** `GET /api/web2-attendance/agent-secret` (requireWeb2Admin) → trả secret. Nút "Tải file cài" giờ `downloadInstallerWithSecret()`: fetch secret (header Web2Auth) → **nhúng thẳng vào `config.json`** mà `.bat` tạo. Không phải admin / chưa cấu hình → bat tạo config từ example (máy vân tay ADMS vẫn chạy không cần token). Verified: secret CHỈ xuất hiện trong bat khi truyền opts.secret; `git grep <secret>` toàn repo = rỗng (chỉ ở serect_dont_push.txt gitignored + config.json gitignored).
- **Lý do quan trọng**: ADMS `/iclock/*` KHÔNG bắt buộc secret → thiếu token KHÔNG phải lỗi khiến không chạy.
- **Fix feedback "Chưa đồng bộ" cho ADMS**: trước đây chỉ ZK-pull PUT /sync-status, ADMS proxy không cập nhật → trang Chấm công luôn hiện "Chưa đồng bộ / Lần cuối: —" dù máy đang đẩy. Thêm `touchAdmsStatus(db)` (export từ web2-attendance.js) gọi fire-and-forget từ ADMS GET /iclock/cdata (heartbeat ~10s) + POST ATTLOG → set connected=TRUE + last_sync_time=now → trang hiện "Đang kết nối".
- Bump installer `?v=20260624a→b`. Backend cần Render redeploy để có agent-secret endpoint + touchAdmsStatus.

User: mỗi trang Web 2.0 có AI assistant đọc số liệu/hội thoại/đơn ĐANG HIỂN THỊ để rà soát phép tính, phân tích cảm xúc khách (Pancake), soát đơn — dùng AI FREE, có trang riêng chọn/đổi AI. Chỉ dùng dữ liệu có sẵn ở browser.

Files: **NEW** `web2/shared/web2-ai-assistant.js` (`Web2AiAssistant`), `web2/ai-assistant/index.html` + `js/ai-assistant.js`, sửa `web2/shared/web2-sidebar.js` (menu AI + autoload).

- **Widget nổi** (✨ góc phải-dưới mọi trang, autoload qua sidebar): panel chat + 5 quick-action (rà soát số liệu / kiểm tra phép tính / phân tích cảm xúc khách / soát đơn / giải thích trang). `pageContext()` gom CHỈ DOM hiển thị (tiêu đề + bảng structured + nội dung main + vùng bôi đen, cap 7000 ký tự) — KHÔNG gửi localStorage/token (tránh lộ secret). Gọi `/api/web2-ai` (provider chọn → `/chat`, hoặc rỗng → `/complete` auto-failover). System prompt ép "chỉ dùng dữ liệu trang, tự tính lại phép cộng/trừ". 401 → toast + requireAuth.
- **Trang quản lý** `web2/ai-assistant`: bật/tắt widget + chọn AI free (4 provider từ /status: Gemini/Groq/OpenRouter/ChatAnywhere, hoặc "Tự động xoay tua") + model + thử nhanh. Lưu localStorage `web2_ai_assistant` → `Web2AiAssistant.reloadConfig()`.
- **Verify browser** (login phuocnho): widget load + FAB hiện + context capture (bảng users); hỏi "trang này hiển thị gì" trên overview → AI trả lời ĐÚNG nội dung trang ("13 trang Web 2.0… chức năng, API, luồng dữ liệu"); trang quản lý liệt kê 4 AI ✓ all ready. Pancake mood / soát đơn dùng chung cơ chế (hội thoại/đơn đã nằm trong DOM → context). v1; iterate thêm.

## 2026-06-24

### [feat] Biến thể / inventory-tracking — bỏ inline edit, dùng POPUP INPUT (dễ thao tác iPad)

User: "lúc bấm 2 lần vào dữ liệu cần chỉnh thì mở modal hay 1 popup input đi đừng inline nữa vì tôi tương tác trên iPad bị khó."

Files: `inventory-tracking/js/table-renderer.js`, `inventory-tracking/css/modern.css`, `inventory-tracking/index.html`.

- **1 helper dùng chung** `openCellEditPopup({title,label,value,type,min,max,step,placeholder})` → Promise<string|null> (null = hủy). Overlay center, input 16px + cao 48px (không zoom iOS, dễ chạm), nút Lưu/Hủy to, đóng khi bấm ngoài/Esc, guard chỉ 1 popup 1 lúc.
- **Chuyển HẾT 7 chỗ inline edit sang popup** (giữ nguyên logic commit/lưu cũ — chỉ đổi cách lấy value, truyền `{value}` vào commit): `startInlineEdit` (Mã hàng/Tổng SL/Đơn giá), `startInlineEditNcc` (tên NCC), `startInlineEditCost` (chi phí), `startInlineEditCostNote` (ghi chú CP), `startInlineEditTiGia` (tỉ giá), `_startInlineEditPaymentGeneric` (ngày/số tiền/ghi chú thanh toán — type date/number/text), `startInlineShortage` (số món thiếu, max=tongMon). Bỏ tạo input-trong-ô + blur/Enter/Escape.
- `commitInlineEdit` re-append decorations (nút bút chì) qua `td._restoreDecorations` như cũ; popup KHÔNG empty ô (commit tự ghi đè innerHTML).
- **Verified browser (stub API, KHÔNG ghi prod)**: mở ô Tổng SL "25" → popup title "Sửa Tổng SL", type number, value 25, nút "Lưu"; ô KHÔNG còn input inline. Hủy → overlay biến mất, ô giữ "25", 0 API call. Lưu (value 99) → 1 API call `shipmentsApi.update(invoiceId,{sanPham})` đúng, ô hiện "99", nút bút chì còn nguyên.
- Bump table-renderer.js + css/modern.css → 20260624d.

### [fix] ai-hub: 401 /chats,/status,/quota — bắt buộc auth Web 2.0 + xử lý phiên hết hạn

User: lỗi `GET /api/web2-ai/chats?limit=50 401` + hỏi lưu lịch sử chat lên DB. Chẩn đoán: lịch sử chat ĐÃ lưu DB (Postgres `web2_ai_chats`, cột messages **JSONB** — gọn + query được, KHÔNG cần mã hoá/giải mã thủ công). 401 = token Web 2.0 thiếu/hết hạn → middleware `requireWeb2AuthSoft` chặn khi `WEB2_AUTH_ENFORCE=1`. ai-hub TRƯỚC ĐÂY không enforce auth lúc load → user token hết hạn vẫn vào trang nhưng mọi call AI 401.

Files: `web2/ai-hub/js/ai-hub.js`, `web2/ai-hub/js/ai-chat.js`, `web2/ai-hub/index.html`.

- **Enforce auth lúc init**: `AiHub.init()` gọi `Web2Auth.requireAuth()` đầu tiên → token hết hạn (/me 401) tự redirect `/web2/login` (lỗi mạng giữ nguyên). User đăng nhập lại → token mới → AI + lịch sử chat chạy.
- **Phiên hết hạn giữa chừng**: `AiHub.handle401(res)` + `notifyAuthExpired()` (toast 1 lần + đẩy login) wire vào `_mergeServerChats` (fetch /chats).
- **Verify browser**: login phuocnho/telephone → round-trip chat history OK (PUT 200 + list found + GET 2 msgs + DELETE 200); reload ai-hub token hợp lệ → KHÔNG redirect, 4 provider load (gemini/groq/openrouter/chatanywhere), 0 lỗi 401. Bump `ai-hub.js` c→d, `ai-chat.js` d→e.

## 2026-06-24

### [feat] Chấm công DG-600 — nút "Tải & cài" trên trang Máy in (1-click bootstrap từ web)

User: "tích hợp vào trang printer-settings 1 option .bat tự tải folder attendance-sync về và chạy".

Files: `web2/shared/web2-attendance-installer.js` (mới), `web2/printer-settings/index.html`.

- **Module shared `Web2AttendanceInstaller`** (mirror `Web2PosInstaller`): `downloadInstaller/downloadUninstaller/renderButtons/batContent`. Nút trên web sinh `cai-cham-cong.bat` client-side (Blob download).
- **bat tự bootstrap**: check Node → tải 5 file (`setup.js, adms-proxy.js, lib-config.js, config.example.json, package.json`) từ `siteRoot()/attendance-sync/*` về `%LOCALAPPDATA%\N2StoreChamCong` (PowerShell Invoke-WebRequest) → tạo `config.json` từ example → `node setup.js` (lo hết: tự gỡ cũ + test + autostart + chạy nền). `go-cham-cong.bat` gọi `setup.js --uninstall` + xoá autostart + kill proxy (belt-and-suspenders).
- **Trang Máy in**: thêm section "Cài máy chấm công DG-600 (Windows — 1 click)" + 2 nút (cài/gỡ) + hướng dẫn 5 bước, load `web2-attendance-installer.js`, `renderButtons('#attInstallBtns',{showUninstall:true})`.
- URL tải tính từ SITE-ROOT (trước `/web2/`) → đúng mọi domain (nhijudy.store / github.io).
- **Verified**: (a) batContent sinh đúng (download loop + node setup.js); (b) **bootstrap end-to-end thật**: tải 5 file từ nhijudy.store/attendance-sync/\* (setup.js 19234B) → `node setup.js` → self-test HTTP 200 "CHUOI HOAT DONG" exit 0; (c) browser test trang Máy in: module loaded, 2 nút render, 0 console error.

### [feat] Biến thể (inventory-tracking) — kéo sắp xếp thứ tự Màu/Size, lưu DB, load về các máy

User: "Vị trí màu, size cho kéo lưu vị trí lại cho dễ dùng -> lưu lên db load về các máy."

Files: `render.com/routes/v2/inventory-tracking.js`, `inventory-tracking/js/api-client.js`, `inventory-tracking/js/modal-variant.js`, `inventory-tracking/css/modern.css`, `inventory-tracking/index.html`.

- **Server**: bảng mới `inventory_attr_order` (1 dòng id=1, JSONB `colors/size_num/size_char` — thứ tự CHUNG cho cả shop). `GET /product-attributes` tách 2 lớp: cache RAW buckets TPOS (24h) + áp thứ tự đã lưu **mỗi request** (`_applyAttrOrder`: value đã lưu lên trước theo thứ tự, value TPOS mới nối đuôi) → đổi thứ tự KHÔNG refetch TPOS. Endpoint mới `PUT /product-attributes/order` upsert dòng singleton + notify SSE `inventory_attr_order`.
- **Client**: grip `⠿` (draggable) đầu mỗi ô Màu/Size số/Size chữ; HTML5 DnD gắn ở **container** (sống qua re-render, idempotent), **chỉ cùng cột** (không kéo màu sang size). Thả → `_reorderVariant` cập nhật mảng VARIANT\_\* + re-render + `_saveVariantOrderDebounced` (800ms) PUT server + cập nhật localStorage + toast.
- **SWR**: `_loadTposAttributes` bỏ early-return theo TTL → luôn revalidate server (throttle 10s) → thứ tự lưu ở máy khác hiện ra lần mở modal kế tiếp ("load về các máy"). localStorage chỉ vẽ nhanh.
- **Verified browser (client)**: 80 grip render, `draggable=true`, 3 handler container đúng; `_reorderVariant("color","Cam","Bạc",false)` → `["Cam","Bạc","Beo",…]`; save PUT fire đúng path (404 vì server chưa deploy lúc test → OK sau deploy). Server verify sau Render deploy.
- Bump version css/modern.css + api-client.js + modal-variant.js → 20260624c.

### [fix] Biến thể (inventory-tracking) — Màu/Size load KHÁC NHAU giữa các máy (client chưa dùng endpoint chung)

User: "Audit -> debug biến thể... hình như đang bị 2 cái đè lên lẫn nhau" → làm rõ: "Nó load không đúng dữ liệu ở các máy". Không phải lỗi CSS — là lỗi **dữ liệu load khác nhau giữa các máy**.

**Root cause (verified browser)**: Modal `#modalVariant` ([modal-variant.js](../inventory-tracking/js/modal-variant.js)) build list Màu/Size từ **localStorage CỦA RIÊNG TỪNG MÁY** (`tpos_attribute_values_cache`) + fallback cứng 10 màu. Máy A (có cache TPOS) thấy **80 màu**, máy B (thiếu cache / không có token TPOS) tụt về **10 màu** → "load không đúng dữ liệu ở các máy". Và khi nạp lại biến thể đã lưu, code bucket từng phần theo membership của list (incomplete) → size lọt vào cột Màu = **"2 cái đè lên lẫn nhau"**. Endpoint server chung `GET /api/v2/inventory-tracking/product-attributes` ĐÃ tồn tại + deploy từ phiên trước (`b0bc79fb5`, trả đúng 80/22/6) **NHƯNG client chưa bao giờ gọi nó** (vẫn fetch TPOS trực tiếp từng máy).

Files: `inventory-tracking/js/api-client.js`, `inventory-tracking/js/modal-variant.js`, `render.com/routes/v2/inventory-tracking.js` (hardening bucket), `inventory-tracking/index.html` (bump version).

- **Client → endpoint chung (fix chính)**: thêm `productAttributesApi.get()` (api-client.js) gọi endpoint server-cache. `_loadTposAttributes()` giờ: fast-paint từ localStorage (tránh modal trống) rồi nạp list CHUNG từ server (bỏ fetch TPOS trực tiếp + token per-máy). Mọi máy hội tụ về cùng 1 list → hết lệch.
- **Bucket đúng cột + giá trị ngoài list vẫn hiện**: parse combo "Màu / Size" theo VỊ TRÍ (phần đầu=Màu, phần sau=Size; số→Size Số, chữ→Size Chữ) + fallback shape khi giá trị không có trong list (đã ngừng/legacy). `_renderVariantOptions` tự thêm giá trị đã chọn vào **BẢN SAO** khi vẽ → biến thể đã lưu luôn hiển thị & tick đúng cột, **KHÔNG mutate** mảng VARIANT\_\* dùng chung (tránh giá trị SP này lẫn sang SP khác — code-review HIGH).
- **Server (hardening)**: bucket theo AttributeId (3=Màu,4=Size Số,1=Size Chữ) + fallback theo AttributeName + **de-dup** tên. Endpoint dùng `ProductAttributeValue/OdataService.GetView?$top=5000&$orderby=AttributeName,Name,Id` (user cung cấp; `$top` cao để lấy **đủ 108** — UI gốc dùng $top=80 chỉ lấy 80 màu, mất sạch size).
- **Verified live**: (a) curl TPOS GetView → 108 item (Màu 80 / Size Số 22 / Size Chữ 6). (b) Xoá cache → reload → modal nạp **80/22/6 từ server** (không còn fallback 10). (c) Bucket: `Xanh Đậm/44`→Màu+Size Số, `Đen/S`→Màu+Size Chữ, `Đen/999` (ngoài list)→**Size Số** (không lọt Màu). (d) Mở SP khác → list KHÔNG dính "999" (không lẫn). Code-review (typescript-reviewer) HIGH pollution đã fix.
- Bump version: `api-client.js`/`modal-variant.js` 20260622c→20260624a.

### [fix/refactor] Chấm công DG-600 — sửa lỗi không cài được + gom 1 folder + 1 NÚT cài/gỡ

User: "tại sao attendance-sync cài không được? quá khó cài vì quá nhiều file, đơn giản hóa 1 nút tự xóa tự cài làm hết kiểm tra, báo lỗi nếu có" + "xóa hết file không cần thiết trong attendance-sync, thêm hướng dẫn chi tiết".

**Root cause (verified live curl)**: máy DG-600 push `/iclock/cdata`; bản cũ `attendance-sync/adms-proxy.js` (v2 "Web 1.0 first + Web2 mirror") forward THẲNG `/iclock/cdata` tới **gốc worker** → worker chỉ route `/api/*` → trả **404 `{"error":"Invalid API route"}`** → proxy trả nguyên 404 đó về MÁY làm phản hồi handshake → máy không hiểu → lặp handshake 15s/lần, **KHÔNG bao giờ đẩy ATTLOG**. Web2 mirror (đúng endpoint) trả 200 nhưng fire-and-forget → response tốt bị vứt. + 2 folder trùng (`attendance-sync/` legacy vs `web2-attendance-sync/`) → cài nhầm bản broken. Live test xác nhận: `/api/web2-attendance-adms/iclock/cdata`→200 `GET OPTION FROM`, raw `/iclock/cdata`→404.

Files: `attendance-sync/` (gom về 1 folder duy nhất). Xoá folder trùng `web2-attendance-sync/`.

- **1 NÚT**: `CAI-DAT.bat`/`cai-dat.command` (cài) + `GO-BO.bat`/`go-bo.command` (gỡ) → gọi `setup.js` (bộ não cross-platform). Tự: [1] check Node [2] **syntax + #Note mọi .js, báo lỗi** [3] check/tạo config.json [4] **tự gỡ bản cũ** (kill theo cổng 8081 + theo command-line cả 2 folder; xoá 4 autostart VBS cũ) [5] npm install (tolerant) [6] **tự test chuỗi** proxy→worker→web2-api (GET `/iclock/cdata` phải có `GET OPTION FROM`) [7] autostart Startup VBS + chạy nền [8] in IP LAN máy + cách verify. Idempotent (chạy lại = gỡ-rồi-cài).
- **adms-proxy.js đúng**: forward `/iclock/*` → `<renderBase>/api/web2-attendance-adms/iclock/*`, **trả nguyên văn** response về máy (handshake hợp lệ). Append `?secret=` nếu có. KHÔNG deps (pure http/https) → package.json deps rỗng.
- **Xoá file thừa** trong attendance-sync: `zk.js, api.js, web2-push.js, index.js, find-commkey.js, diagnose.js, test.js, test-mac.sh, setup.bat, setup-adms.bat, cai-dat-tu-dong.bat, go-tu-dong.bat, start.vbs, stop.bat, web2-config.example.json`. Còn lại 11 file gọn.
- **README.md chi tiết**: cài 1 nút, cấu hình máy DG-600 (Server address = IP máy tính, port 8081, Auto upload), secret, kiểm tra, gỡ, bảng troubleshooting, sơ đồ kiến trúc, giải thích lỗi cũ.
- ANSI color TẮT trên Windows cmd (tránh escape rác). Output ASCII-only (console Windows không lỗi font).
- **Verified** chạy `node setup.js` 2 lần (từ web2-attendance-sync trước migrate + từ attendance-sync sau migrate): self-test HTTP 200 "CHUOI HOAT DONG", exit 0, syntax + #Note OK cả 3 file.

### [feat/fix] AI presets modal giống YouMind + bỏ chibi-banana + chibi avatar free + fix lightbox

User (5 yêu cầu + 2 bổ sung): (1) mẫu prompt có hình + filter/search như youmind.com/nano-banana-pro-prompts; (2) modal mẫu bị lỗi giao diện (card chồng lên nhau); (3) bỏ chibi tạo bằng Nano Banana (tốn tiền) → thay bằng generator avatar chibi FREE ở phần avatar; (4) zoom ảnh rồi tắt → ảnh to hiện dưới footer; (5) audit + browser test + fix lặp. Bổ sung: card hiện cả hình + prompt + nút; cuộn để load more.

Files: `web2/shared/web2-ai-presets.js`, `web2/shared/web2-user-profile.js`, `web2/shared/web2-image-lightbox.js`, `web2/shared/web2-sidebar.js`, `web2/ai-hub/index.html`. Set Render web2-api: `WEB2_CHATANYWHERE_API_KEY1..3` (deploy `dep-d8tn3eog4nts73d3l080`).

- **Task 1+2 (presets modal)**: thêm ô **tìm kiếm** (bỏ dấu tiếng Việt: gõ "ao" khớp "áo"), card kiểu YouMind (ảnh 150px + tiêu đề + **hộp prompt đầy đủ** + nút "✨ Dùng mẫu này"), **infinite-scroll** (render 9 card/batch, cuộn gần đáy nạp thêm, hint "↓ Cuộn để xem thêm (N mẫu)"). **Bug giao diện (root cause)**: `.aip-card.has-thumb{overflow:hidden}` → grid item là scroll-container nên track sizing thu chiều cao card về body-only 62px, thumb 150px (aspect-ratio cũ collapse 0px) bị cắt → card chồng nhau. Fix: bỏ `overflow:hidden` ở card + `height:150px` cố định cho `.aip-thumb` + `border-radius` bo góc thumb. Verify browser: 23 card đồng đều 236-254px, search/scroll/click OK, 0 console error.
- **Task 3 (chibi)**: xoá 5 mẫu chibi-\* (chibi-cute/brawl/figurine/plush/anime) + category `chibi` khỏi `web2-ai-presets.js` (chúng cần Nano Banana trả phí). Thêm 6 style **DiceBear chibi/cute FREE** (adventurer/big-smile/miniavs/micah/personas/croodles) dẫn đầu picker avatar `web2-user-profile.js` (18 style, default `adventurer`). DiceBear = generator avatar bằng seed, KHÔNG tốn API. Verify: 6 ảnh chibi load OK (naturalWidth 150, 0 broken).
- **Task 4 (lightbox)**: bug "ảnh to dưới footer" KHÔNG repro trên code hiện tại (đã fix bởi commit 03:12 quản lý `display:none`). Hardening thêm: inject CSS guard `#web2ImageLightbox{position:fixed!important}` + `[hidden]{display:none!important}` (overlay KHÔNG bao giờ rớt về document flow), fix **race close-rồi-mở-lại-trong-180ms** (clear `_closeTimer` khi open → tránh ẩn nhầm ảnh mới). Verify: open=fixed top:0, reopen-after-race visible, close=display:none, 0 ảnh in-flow.
- Bump version: `web2-ai-presets.js` 20260624f→h, `web2-user-profile.js` a→b, `web2-image-lightbox.js` a→b (sidebar autoload).
- **Bỏ chữ "trả phí"** (user: "bỏ mấy chữ trả phí đi"): gỡ "(ảnh trả phí)"/"là ảnh AI trả phí" khỏi UI ai-hub (`index.html` keyhint, `ai-image.js` quota hint + comment, `ai-tryon.js` warn + comment). Nano Banana giờ chỉ ghi "cần quyền + giới hạn lượt/ngày". Bump `ai-image.js` e→f, `ai-tryon.js` c→d. Verify browser: 0 chữ "trả phí" hiển thị.

### [fix] Avatar mặc định DiceBear ĐỒNG NHẤT (footer + bảng users + preview) — 1 nguồn avatarUrlFor

User: "có avatar mặc định ở mỗi user [bảng users] nhưng vào nó không load avatar mặc định này, ai đã đổi avatar mới [hiện] chọn". → 3 nơi default KHÁC nhau: bảng users dùng `lorelei`+username, footer sidebar fallback **null (chữ cái)**, preview hồ sơ dùng `adventurer`. User chưa đặt avatar → footer mất avatar.

Files: `web2/shared/web2-user-profile.js`, `web2/shared/web2-sidebar.js`, `web2/users/js/users-app.js`.

- **1 nguồn**: thêm `Web2UserProfile.avatarUrlFor(user)` = custom nếu `user.avatar` đặt, KHÔNG thì sinh mặc định từ username (`DEFAULT_STYLE='lorelei'`). Export `avatarUrlFor` + `DEFAULT_STYLE`.
- **Footer sidebar** (`renderUserFooter`): bỏ `user.avatar ? ... : null` → fallback `_avatarUrlInline({style:DEFAULT_STYLE, seed:username})` khi chưa có avatar (tính inline, không chờ module load).
- **Bảng users** (`userAvatarUrl`): dùng `up.avatarUrlFor(u)` (thay hardcode lorelei) → cùng nguồn.
- **Preview hồ sơ**: default state `style: DEFAULT_STYLE` (lorelei, khớp bảng + footer) thay `adventurer`.
- Verify browser: `avatarUrlFor({username:'phuocnho'})`→`lorelei/svg?seed=phuocnho`; custom bottts→giữ; **footer admin (no custom) giờ hiện avatar lorelei thay vì chữ cái**. Bump `web2-user-profile.js` c→d.

### [feat] Tuỳ chỉnh avatar DiceBear ĐẦY ĐỦ (schema-driven, không giảm tính năng github)

User: "dicebear cho chỉnh sửa avatar rất chi tiết (thay trang sức, phụ kiện…)" + "đừng chọn lọc làm giảm giới hạn của github". → KHÔNG hardcode toggle chọn lọc; nạp **schema thật** của từng style → form động cho MỌI option.

Files: **NEW** `web2/shared/web2-dicebear-customizer.js` (`window.Web2DicebearCustomizer`), `web2/shared/web2-user-profile.js`, `web2/shared/web2-sidebar.js`.

- **Module customizer**: `getSchema(style)` lazy `import()` `@dicebear/<style>@9.2.4` từ esm.sh (cache; lỗi mạng/CSP → form rỗng graceful). `mount(box,{base,style,seed,options,onChange})` dựng form từ `schema.properties`: enum→dropdown "🎲 Tự động / 🚫 Không có / Kiểu 1..N", color→`<input type=color>`+ô "Tự động", integer `*Probability` gộp vào enum cha (chọn kiểu→prob=100, "Không có"→prob=0), bool→toggle. `buildUrl()` ghép mọi param vào URL HTTP API.
- **Tích hợp profile**: thêm section gập "🎨 Tuỳ chỉnh chi tiết" (lazy mount khi mở lần đầu, suy path customizer từ `document.currentScript.src`). `avatarUrl(cfg)` thêm `cfg.options` (mọi param DiceBear). Lưu `{style,seed,bg,options}` — backend lưu chuỗi JSON opaque, KHÔNG cần đổi BE. Đổi style → `setStyle` reset options + nạp schema mới.
- **Verify browser**: adventurer hiện đủ tóc(45)/mắt(26)/miệng(30)/lông mày(15)/kính(5)/khuyên tai(6)/đặc điểm(4) + màu tóc/da; đổi kính/màu → preview cập nhật đúng param (`glasses=variant01&glassesProbability=100&hairColor=ff3366`), ảnh load OK; đổi sang bottts → schema robot khác (eyes/face/mouth/sides/texture/top), options reset. Bump `web2-user-profile.js` b→c, customizer `20260624a`.

### [change] web2/users: hạ mật khẩu tối thiểu 8 → 6 ký tự

User: "có thể đặt mật khẩu 6 ký tự" (vd `181015`). Đổi min length 8→6 đồng bộ FE+BE.

Files: `web2/users/js/users-app.js` (`MIN_PWD_LEN=6`, 3 chỗ validate create/edit/đổi-MK + hint), `web2/users/index.html` (2 hint modal), `render.com/routes/web2-users.js` (`MIN_PWD_LEN=6` + `validatePassword`). **Cần deploy web2-api** (backend validate là chốt cuối). Nút "Tạo" vẫn sinh từ 9 ký tự (≥6 OK).

### [feat] web2/users: xoá VĨNH VIỄN + khôi phục user đã vô hiệu (hard delete/purge + restore)

User: "xóa các users đã bị vô hiệu đi làm sao?" — DELETE chỉ soft-delete (is_active=FALSE), nút thùng rác disabled cho user inactive → không có cách purge.

Files: `render.com/routes/web2-users.js`, `web2/users/js/users-app.js`, `web2/users/index.html` (**cần deploy web2-api**).

- **Backend**: route mới `DELETE /:id/purge` (requireWeb2Admin + perm `users.delete`) — `DELETE FROM web2_users WHERE id=$1 AND is_active=FALSE` (CHỈ purge user đã vô hiệu → buộc vô hiệu trước; active → 400 "phải vô hiệu trước"; không tồn tại → 404). Session cascade theo FK `ON DELETE CASCADE` (chỉ `web2_user_sessions` có FK → không vỡ ràng buộc). `_notify('purge')` + audit.
- **Frontend**: hàng inactive đổi nút thùng-rác-disabled → 2 nút **Khôi phục** (rotate-ccw → PATCH isActive=true) + **Xoá vĩnh viễn** (trash danger → DELETE /:id/purge, Popup.danger xác nhận). Nút bulk toolbar **"Xoá hẳn N user vô hiệu"** (hiện khi đang xem user vô hiệu) → purge tuần tự + báo lỗi từng cái.
- Revive-on-create (commit trước) verified E2E sau deploy: tạo→vô hiệu→tạo lại cùng username = revive (giữ id, role/displayName mới), KHÔNG 409.

### [fix] web2/users: audit fix nhiều bug ẩn (3 reviewer agent: frontend/backend/security)

User: "audit lại web2/users có nhiều bug ẩn lắm". Chạy 3 agent review song song → verify từng finding với code thật (loại false-positive) → fix nhóm an toàn + page-local, report nhóm cần quyết định.

Files: `web2/users/js/users-app.js`, `web2/users/index.html`, `render.com/routes/web2-users.js`

**Đã fix (verified browser):**

- 🔴 **Tự vô hiệu chính mình** — `deactivateUser` thiếu guard self → admin bấm xoá chính row mình (khi còn admin khác, backend không chặn) → tự khoá. Thêm guard `id===_currentSessionUserId()` → toast chặn. ✅
- 🔴 **Tự hạ quyền admin chính mình** — `confirmUserSave` edit đổi role mình admin→staff lưu được → mất quyền (token sống nhưng 403). Thêm guard chặn. ✅
- **Cross-contamination state modal** — password modal share `STATE.editingUser` với edit modal → tách `STATE.pwdUser` riêng (openPasswordModal/confirmPasswordSave). ✅
- **SSE reload đè modal đang mở** — reload `web2:users` lúc đang sửa → `loadAll()` thay `STATE.users` làm con trỏ user cũ stale → skip reload khi có `.u-modal:not([hidden])`. ✅
- **iframe Phân quyền stale** — `permLoaded` cờ 1 lần → ma trận cũ, lưu đè quyền. Reload iframe MỖI lần vào tab (cache-bust `&t=`). ✅
- **Avatar `src=""`** — `userAvatarUrl` rỗng → `<img src="">` GET rác/row + ảnh vỡ → render placeholder `<span>` khi thiếu URL. ✅
- **`fmtTs`** — `new Date(Number(isoString))=NaN` → "Invalid Date"; + GMT+7 (rule 10): thêm isNaN guard + `timeZone:'Asia/Ho_Chi_Minh'`. ✅
- **uCount mơ hồ khi search** — hiện `khớp/tổng` ("2/6 user") thay vì chỉ số khớp. ✅
- **`resetPermsToRoleDefaults`** null guard (`STATE.permsUser` null → TypeError). ✅
- 🔴 **Backend revive (create) hardening** — UPDATE `... AND is_active=FALSE RETURNING *` (atomic, đóng TOCTOU → rowCount 0 trả 409) + xoá `web2_user_sessions` của bản hồi sinh (token cũ không tái dùng với MK mới; deactivate qua PATCH không dọn session). **Cần deploy web2-api.**

**Report (chưa fix — cần user quyết, rủi ro/đụng module khác):** `/list`+`/:id` lộ email/SĐT/permissions cho mọi user đã đăng nhập (KHÔNG gate `users.view` được vì kpi-assignments + cham-cong là NV không có quyền đó đang gọi `/list` → sẽ vỡ; nên scope field cho non-admin); `/pages`+`/role-defaults` không auth (iframe gọi không token); default AES key fallback (nên fail-loud nhưng phải chắc env set); login rate-limit per-instance; token qua query `?token=` (/me); token ở localStorage (XSS). KHÔNG đổi: password `type=text` + toast hiện MK (CHỦ Ý — feature admin xem MK).

### [fix] web2-users: xóa user rồi tạo lại cùng username báo trùng → HỒI SINH bản inactive

User: "tôi xóa user coi tạo lại báo trùng". DELETE là **soft-delete** (`is_active=FALSE`) → username vẫn chiếm chỗ trong DB → POST create cùng tên đụng unique constraint → 409 "đã tồn tại" (mà user lại không thấy trong list vì mặc định ẩn user vô hiệu).

File: `render.com/routes/web2-users.js` (create handler) — **cần deploy web2-api** (auto-deploy on push).

- Create giờ check username trước INSERT: nếu tồn tại + **đang active** → 409 thật; nếu tồn tại + **inactive** → **UPDATE hồi sinh** bản cũ (giữ `id` → referential integrity audit/KPI) với thông tin mới (password/displayName/email/phone/role/note), reset `permissions=NULL` (về mặc định vai trò) + `avatar=NULL` + `last_login_at=NULL` + `created_at=now`. Không tồn tại → INSERT như cũ. Giữ catch 23505 làm lưới an toàn race.
- Audit ghi `revived:true` khi hồi sinh.

### [feat] web2 ai-presets: thêm nhóm "🎨 Chibi / Nhân vật" (ảnh thật → chibi/Brawl Stars/figurine)

User hỏi github chuyển ảnh→chibi. Trả lời: Nano Banana (Tạo ảnh) đã làm được; thêm 5 preset chibi (needsImage): chibi-cute (Q-version), chibi-brawl (Brawl Stars game-art), chibi-figurine (Funko Pop), chibi-plush (thú nhồi bông), chibi-anime. Category mới `chibi`. Image presets 23→28. DiceBear avatar (modal hồ sơ) là seed-based KHÔNG nhận ảnh — khác hẳn. Bump web2-ai-presets v20260624f.

### [feat] bg-remover: server TÁCH NỀN máy shop (free, on-device) theo pattern VieNeu

User "được thì làm": dựng server tách nền free thay PhotoRoom trả phí.

- **`bg-remover/`** (mới): app.py (FastAPI + rembg U-2-Net, `/health` + `/remove[?bg=hex]`) + serve.py (clone VieNeu: uvicorn + cloudflared tunnel + heartbeat **engine='bgremover'** 30s) + requirements.txt + install-windows.bat + run-mac.command + README. Cổng 8124 (VieNeu 8123 → chạy song song). rembg nhẹ hơn nadermx/backgroundremover (onnxruntime, CPU OK).
- **Registry tái dùng**: máy bg-remover báo danh vào CHUNG `web2_machine_servers` (đã chuyển Postgres) với engine='bgremover'; trang lọc `/list?engine=bgremover`.
- **Frontend**: shared `web2/shared/web2-bgremover.js` (`Web2BgRemover.listServers/removeBg/removeBgAuto`, autoload sidebar). ai-hub Tạo ảnh: mỗi ảnh kết quả có nút **✂️ Nền** → `removeBgAuto(src)` → card kết quả mới. Bump ai-image v20260624e.
- ⚠ Python chưa test máy thật (no env) — py_compile PASS; user chạy .bat/.command verify. KHÔNG cần Render redeploy.

### [fix] web2/users: trang Phân quyền không scroll + đổi mật khẩu trong modal Sửa + hiện MK cột

User báo: (1) `/web2/users/index.html` tab "Phân quyền" không scroll được; (2) modal "Sửa người dùng" có ô mật khẩu nhưng đổi không ăn; (3) muốn hiện mật khẩu user ở cột Mật khẩu.

Files: `web2/users-permissions/index.html`, `web2/users/index.html`, `web2/users/js/users-app.js`, `web2/users/css/users.css`

- **🔴 FIX không scroll (tab Phân quyền)** — tab nhúng `users-permissions/?embed=1` qua iframe. Embed mode đổi `.web2-shell` sang `display:block` NHƯNG giữ `height:100vh; overflow:hidden` (từ web2-sidebar.css) → `.web2-main` hết là grid-cell scroll được, nội dung ma trận (2563px) bị **clip** ở chiều cao iframe (710px), không thanh cuộn. Fix: embed mode set `.web2-shell`/`.web2-main` `height:auto; overflow:visible` + `body/html overflow:auto` → document tự cao bằng nội dung → **iframe TỰ scroll**. Verified browser: canScroll=true, scrollTop chạm đáy (row "Quản lý chi tiêu").
- **🔴 FIX đổi mật khẩu trong modal Sửa** — 2 lỗi chồng: (a) `openUserModal` ẩn ô MK khi edit bằng `uPasswordField.hidden=!!user` nhưng dính bug CSS `.u-field{display:flex}` đè UA `[hidden]{display:none}` → ô **vẫn hiện**; (b) `confirmUserSave` edit chỉ PATCH, **không gửi password** → gõ MK mới mà không lưu. Fix: ô MK hiện ở CẢ create+edit (edit = tùy chọn, label "Đổi mật khẩu", để trống = giữ nguyên); edit có nhập MK ≥8 ký tự → gọi `POST /:id/password` sau PATCH (kèm re-auth nếu tự đổi MK mình). Thêm `.u-field[hidden]{display:none!important}` chống bug CSS chung. Verified E2E (user test): đổi MK qua modal Sửa → login MK mới OK, MK cũ bị từ chối.
- **feat hiện MK cột Mật khẩu** — user cũ chỉ có bcrypt (`password_enc` NULL) hiện `—` (MK 1 chiều không đọc lại được). Đổi `—` thành nút **"Đặt MK"** mở modal đổi MK → đặt xong plaintext hiện ở cột (admin xem, account admin vẫn khoá 🔒). User đặt MK qua hệ mới → cột hiện plaintext + nút copy (verified: testpwuser hiện "newpass456").

User: (1) thêm ChatAnywhere làm provider chat, (2) VieNeu chạy .bat mà không connect → fix, (3) preset có ảnh mẫu.

- **🔴 FIX VieNeu "không kết nối"** — root cause (Explore agent trace): `web2-vieneu-registry.js` lưu **IN-MEMORY `Map()`** → web2-api chạy NHIỀU instance + redeploy xoá sạch → máy register vào instance A, browser GET /list trúng instance B → "không thấy máy" dù máy chạy (cùng lớp bug SSE cross-instance). **Fix: chuyển registry sang Postgres** (bảng `web2_machine_servers`, web2Db) → sống qua redeploy + chia sẻ giữa instance. Thêm cột `engine` + filter `/list?engine=` (tái dùng cho bg-remover sau). serve.py heartbeat 30s không đổi. Integration-test SQL (prune TTL 90s + engine filter) PASS.
- **ChatAnywhere** (github chatanywhere/GPT_API_free) — thêm provider chat OpenAI-compatible FREE (GPT-4o-mini/4.1/3.5 + DeepSeek V3/R1), base `.org` (override `WEB2_CHATANYWHERE_BASE`), key `WEB2_CHATANYWHERE_API_KEY*` (lấy free qua GitHub OAuth ở repo, ~200 req/ngày). User OK license non-commercial (web nội bộ kho SP).
- **Ảnh mẫu preset** — 21/23 câu lệnh ảnh có `thumb` (CDN youmind public) → card modal hiện hình minh hoạ (onerror ẩn graceful). Bump web2-ai-presets v20260624e.

### [refactor+feat] web2: promote thư viện mẫu AI → shared module + thêm vai trò chat + rename env Nano Banana

User: (1) đổi env paid sang `WEB2_NANOBANANA_API_KEY`, (2) thêm prompt mẫu chat, (3) modular hoá.

- **Modular**: `ai-hub/js/ai-presets.js` → **`web2/shared/web2-ai-presets.js`** (shared, autoload qua sidebar `Web2AiPresets`, alias `AiPresets`). Trang khác (fb-posts caption, video-maker kịch bản) gọi `Web2AiPresets.pickImage/pickRole` được luôn. Nạp TRƯỚC sidebar ở ai-hub → autoload skip (1 lần).
- **Vai trò chat 7 → 13** (thêm từ awesome-chatgpt-prompts, Việt hoá shop): quảng cáo/Ads, content MXH, đặt tên SP, upsell/bán kèm, sửa chính tả, dịch Việt↔Anh.
- **Env**: `WEB2_GEMINI_API_KEY5` (paid AQ) → **rename `WEB2_NANOBANANA_API_KEY`** trên Render web2-api (qua API, không lộ value). Giờ key1-4 free=chat, `WEB2_NANOBANANA_API_KEY` paid=Nano Banana (code đã ưu tiên prefix này).
- **Audit 9 repo** (trả lời user): chỉ awesome-chatgpt-prompts tích hợp (đã làm); gpt4free/free-llm-api-keys/GPT_API_free = NO (ToS/non-commercial/shared-key rủi ro); 9router/OmniRoute = dev-tooling router (đã có failover); magic-resume = không liên quan; backgroundremover/video-subtitle-remover = cần Python+GPU server (roadmap như VieNeu); gemini-watermark-remover = ảnh API không có watermark hiển thị → chưa cần.

### [feat] web2 ai-hub: tách key chat/Nano Banana + gate quyền + quota + lưu ảnh/prompt/chat + thư viện mẫu

User 5 việc (key paid Nano Banana, giải thích 2 repo, tích hợp 2 repo prompt/system, tối ưu chi phí).

- **Tách pool key Gemini** (`web2-ai-service.js`): chat dùng key FREE (`WEB2_GEMINI_API_KEY1..4`), Nano Banana (ảnh, TRẢ PHÍ) dùng pool RIÊNG `nanobanana` = `WEB2_NANOBANANA_API_KEY*` → fallback `WEB2_GEMINI_API_KEY5`. Key nano bị TRỪ khỏi pool chat (key5 không đốt cho chat free). Provider `nanobanana` `internal:true` (ẩn khỏi chat UI/defaultProvider/listModels). `image-service._gemini` đổi sang `keysOf/runWithKey('nanobanana')`. Unit-test: chat=4 free, nano=key5; dedicated env override OK.
- **Gate quyền + quota** (`web2-ai.js` `/image`): provider `gemini` = ảnh trả phí → BẮT BUỘC đăng nhập + quyền `ai-hub`/`nanobanana` (action MỚI, `RESTRICTED_ACTIONS` → default-DENY non-admin, admin cấp tay) + quota `WEB2_NANOBANANA_DAILY_LIMIT`/user/ngày (GMT+7, default 50, admin miễn). `GET /quota` cho UI.
- **Lưu server** (`web2-ai-store.js` + bảng `web2_ai_images`/`web2_ai_chats`, web2Db): mọi ảnh tạo → lưu prompt+BYTEA (best-effort); hội thoại chat upsert (đa máy). Endpoints `/images`(list)`/images/:id`(serve ?token)`/chats`(CRUD). Scope chủ-sở-hữu/admin. Integration-test trên PG test DB (create→test→drop): quota đếm, ownership guard (chống hijack chat / xoá nhầm chủ) PASS.
- **Tích hợp prompt repos** (`ai-presets.js`): 23 mẫu câu lệnh ảnh (nano-banana-pro-prompts + Awesome-Nano-Banana-images, chọn lọc shop: sản phẩm/người mẫu/mặc-lên-người/đổi nền/avatar/flat-lay/poster) + 7 vai trò chat (cảm hứng x1xhlol/system-prompts: bán hàng/caption/CSKH/mô tả SP/khiếu nại/ý tưởng + tự nhập). Modal picker tự chứa. Nút "📋 Mẫu" ở Tạo ảnh + Ghép đồ; "Vai trò" chat → picker; convo mới có system mặc định shop.
- **Frontend** (`ai-image.js`/`ai-tryon.js`/`ai-chat.js`): nút "📁 Ảnh đã lưu" (load lịch sử server), pill quota Nano Banana, try-on báo thiếu-quyền sớm; chat backup lên server + gộp hội thoại máy khác. Bump v20260624c.
- **Cần**: deploy web2-api (env `WEB2_GEMINI_API_KEY5` paid đã có) + redeploy để nạp pool tách. Tuỳ chọn env `WEB2_NANOBANANA_API_KEY*`, `WEB2_NANOBANANA_DAILY_LIMIT`.

### [feat] web2: phân quyền HOÀN CHỈNH — registry đủ 50 trang + auto-discover + enforcement an toàn

User "Làm đi": vá lỗ hổng #2 (registry stale 18/50 + không enforce).

- **Registry đủ**: `WEB2_PAGES` (web2-users.js) **18 → 49 trang** (mỗi trang ≥ 'view' + action hợp lý) + action labels mới (generate/scan/pack/returnFailed/publish/confirm). Role-default vẫn cấp 'view' mọi trang cho staff/manager/viewer → **an toàn, không khoá nhầm**.
- **Auto-discover**: matrix frontend (users-permissions) tự bổ sung trang có trong sidebar NAV mà thiếu ở registry (action 'view') → **trang MỚI tự hiện** để admin chặn ngay, không cần sửa WEB2_PAGES.
- **Enforcement** (`web2/shared/web2-perm.js`, auto-load mọi trang): mô hình **default-open / explicit-deny** — admin LUÔN qua; chưa-có-dữ-liệu / trang-mới (không trong perms) → CHO PHÉP; CHỈ chặn khi admin chủ động bỏ 'view'. (1) sidebar `renderItem` ẩn item bị thu hồi 'view'; (2) page-guard phủ overlay "không có quyền" khi vào thẳng URL trang bị thu hồi (soft-block, không redirect loop, không chặn admin). `slugFromUrl` folder-based khớp registry (overview→tongquan, live-chat/chat→live-chat…).
- **Verified**: admin thấy đủ 49 item, 0 block; logic deny đúng (revoke `variants:[]`→canView false; `kpi` không-trong-perms→true fail-open; admin→true; action-level `delete` chưa cấp→false). Server vẫn gate độc lập (`requireWeb2Admin` cho trang admin). Cần deploy web2-api cho registry 49 trang.

### [feat+fix] web2: menu reorg + gộp Phân quyền + fix lightbox stuck + verify avatar/audit-scope (user 9 việc)

User pivot sang 9 việc UI/menu + 2 câu hỏi verify. Kết quả:

- **#1 Avatar** — test kỹ end-to-end (mở modal→chọn style→Lưu→persist server+localStorage+footer cập nhật+SỐNG sau reload, cả style Emoji=fun-emoji). **Hoạt động ĐÚNG**, không tái hiện được bug. Nguyên nhân khả dĩ: token Web2 hết hạn (401 im) / JS cũ cache. Harden: message 401 rõ ("phiên hết hạn → đăng nhập lại") + bump v20260624a.
- **#2 (verify)** — permission matrix (`/api/web2-users/pages` = hardcoded `WEB2_PAGES`) **KHÔNG auto-discover trang mới**: chỉ 18/50 trang trong registry (STALE) + **KHÔNG trang nào enforce** (không có `hasPermission` — chỉ khai báo; gate thật = `adminOnly` menu + `requireWeb2Admin` server). Code trang mới KHÔNG tự có quyền → phải thêm tay vào `WEB2_PAGES`. services từ `/api/services-overview` (inventory server).
- **#3** — gộp users-permissions vào trang Người dùng: 2 tab (Người dùng | Phân quyền), tab Phân quyền nhúng iframe `users-permissions?embed=1` (ẩn sidebar). Verified: tab switch + 28 perm rows render embedded. Gỡ "Phân quyền" khỏi menu.
- **#4-#9 menu reorg** (web2-sidebar NAV): Dashboard KPI→Báo cáo; Lịch sử thao tác + Cấu hình&Hệ thống(admin-only)→Cấu hình; Đối soát CK→"Chuyển khoản KH"(đổi tên từ Tài chính); Zalo+Chat Pancake→Khách hàng; Tăng comment+Comment Live+Điều khiển TV+TV Livestream→Facebook.
- **Menu cleanup** (user request 2) — `cleanLabel()` cắt emoji cuối tên trang + bỏ badge "- WEB 2.0". Verified 49 links 0 badge 0 emoji.
- **🔴 FIX lightbox stuck/đè layout** (user request 3) — `Web2ImageLightbox` overlay set `cssText` có `display:flex` ĐÈ `[hidden]` (inline > UA) → sau open→close overlay vẫn flex+opacity:0 = lớp vô hình phủ inset:0/z99999 NUỐT mọi click → trang kẹt. Fix: quản `display` trực tiếp (none↔flex). Verified: sau close, elementFromPoint(center)=element thật (không phải overlay). Bump v20260624a.
- **#7 (verify)** — audit-log scope (`v2/audit-log.js:178`): admin xem hết + lọc tự do; NV **ÉP self-scope** (khớp id/username/display_name, bỏ qua filterUser); chưa login→rỗng. **ĐÚNG**: mỗi user chỉ xem lịch sử mình, admin xem tất cả (server-enforced).
- **Bonus**: split-PBH merge double-bill (#2) + merge dedup (#5) **verified LIVE** (stock conservation holds, idempotent re-bill).

### [fix] web2: 5 bug từ workflow audit round-3 (2 HIGH money/stock + 3 MEDIUM) — adversarial-verified

Workflow 13-agent (5 finder song song × verify đối kháng + synthesis) audit reconcile/returns-3-subtype/order-tags/delivery-zone/conservation. 7 finding → **6 sống sau verify đối kháng** → tôi đọc code thật xác nhận + fix 5 (1 reconcile dimension trùng root với merge-dedupe). order-tags: **0 bug** (sạch).

**🔴 #1 HIGH money+stock leak** — `web2-returns.js:1315`: nhánh `khong_nhan_hang` DELETE re-attach lock theo PBH thiếu `AND state <> 'cancel'` (2 nhánh kia + comment 1309-1311 đều có) → re-arm `wallet_deducted`/`stock_restored=FALSE` lên PBH ĐÃ HUỶ → cancel sau double-refund ví + phantom-restock. Fix: thêm `AND state <> 'cancel'` (one-line, mirror sibling).

**🔴 #2 HIGH double-bill** — `fast-sale-orders.js from-native-order`: merged PBH (merge-to-pbh) có `source_id=NULL` (1 PBH gộp nhiều member) → `existsQ` theo source_id KHÔNG thấy member → stale-tab/direct-API tạo PBH thứ 2 = double trừ kho + ví. Fix: thêm idempotency guard theo **source_code membership** (mirror cancel route native-orders.js:119-122) → trả idempotent.

**🟠 #3 MEDIUM wallet leak window** — `fast-sale-orders.js:2131`: `_applyWalletToPbh(pool)` → withdraw COMMIT riêng, rồi `pool.query(UPDATE wallet_deducted)` rời → crash giữa = ví trừ nhưng wallet_deducted=0 → cancel hoàn 0đ. Fix: gộp withdraw + UPDATE vào 1 `withTransaction` (truyền client → runWithTx reuse, atomic; giống `applyWalletToUnpaidPbhs`). Try/catch giữ semantics "ví lỗi không chặn PBH".

**🟠 #4 MEDIUM phí giao sai im lặng** — bulk PBH áp auto-pick offline (`pickOffline`) bỏ qua `confidence` → phí thấp-tin-cậy bill thẳng (vd tên tỉnh trong địa chỉ HCM → ship tỉnh 35k nhầm). Fix layer-1 (an toàn): giữ `pickedConfidence/pickedNote`, hiện "⚠ phí auto Xđ — KIỂM TRA" trong cột trạng thái khi confidence≠high. (Layer-2 = siết `_detectProvince` heuristic — KHÔNG làm, rủi ro over-tighten; layer-1 là safety-net.)

**🟠 #5 MEDIUM reconcile dead-end + latent restock double-subtract** — `fast-sale-orders.js:1044` merge `combinedLines.push(...lines)` KHÔNG dedupe → gộp 2 PBH cùng mã SP → order_lines có dòng trùng mã → reconcile (1-bucket/mã, cap theo dòng đầu) không đóng gói được + `restockOrderLines` trừ returnedMap[code] lặp. Fix: dedupe order_lines theo mã lúc merge (cộng quantity + discountAmount; dòng không-mã giữ riêng).

Verify: node --check 3 file OK + native-orders load 0 error. Server fix (#1,#2,#3,#5) cần deploy web2-api → live-test split/merge/return.

### [audit-deep-2] web2: verify Ví NCC + auth-gate + KPI privacy (code-level) — 0 bug, 1 design-note

Tiếp tục đào sâu (round 2). Toàn bộ VERIFY (không sửa code) — kết quả: hệ thống đúng.

1. **Ví NCC ledger** (`/api/web2-supplier-wallet/tx`) — test fake supplier `ZZTEST-NCC-AUDIT`: server REJECT `type=debt` (400, chỉ `payment|return`), `amount>0` enforced, idempotency tx_id pre-check (`alreadyProcessed`), return-amount cap theo cost THẬT từ so-order (anti-mint, FIX #2 2026-06-23). Dọn sạch qua `DELETE /supplier/:name` (x-admin-secret = CLEANUP_SECRET, hit web2-api trực tiếp; ledger+meta=1/1 rows).
2. **Auth gate `WEB2_AUTH_ENFORCE`** — probe 5 write-endpoint KHÔNG token (products POST/DELETE, supplier-wallet tx, customer-wallet deposit, native-orders create) → tất cả **401**. order-tags write (`/create`,`/update`,`/delete`) đều `requireWeb2AuthSoft`. Mutation Web 2.0 được khoá đúng.
3. **KPI privacy (code-level)** — live multi-user KHÔNG test được sạch (web2-users không có DELETE endpoint → tạo user test = rác vĩnh viễn). Đọc code xác nhận: `applyKpiScope` (routes/v2/kpi.js:393) scope-filter ĐƠN HÀNG = **fail-open** (NV không-assignment / no-token → thấy hết đơn — comment ghi rõ "default open access", CHỦ Ý). NHƯNG tầng privacy THẬT = **pill-mask server-side** (`web2-order-tags-service.js:436`): NV xem đơn NV-khác → pill `👤 KPI` xám, **KHÔNG đính tên/tiền**; chỉ admin / đơn-mình / chưa-gán mới thấy detail. Comment: "tầng DUY NHẤT đáng tin (frontend không tin được)". → privacy KPI an toàn (thấy đơn nhưng không lộ tiền NV khác).

**Design-note (không phải bug)**: kpiScope fail-open là chủ ý + được pill-mask bù. Nếu sau muốn fail-closed (NV không-assignment thấy 0 đơn) thì sửa `applyKpiScope` line 421 — nhưng hiện KHÔNG lộ data nhạy cảm nên không cần.

### [fix] web2: 5 silent-failure frontend + 1 HIGH server bug (split-PBH cancel) — từ review 2 agent

2 agent review (silent-failure-hunter + code-reviewer) trên luồng tiền/PBH/tồn. Đã VERIFY từng finding bằng đọc code thật (loại các finding agent tự downgrade: confirm-purchase double-add an toàn READ COMMITTED, idempotency namespacing không collide). Fix các finding xác nhận thật:

**🔴 SERVER (HIGH) — ĐÃ DEPLOY + VERIFY LIVE**: `render.com/routes/fast-sale-orders.js` — `POST /by-source/:code/cancel` dùng `LIMIT 1` → khi 1 đơn web tách NHIỀU PBH (migration 078 `split_index`), chỉ huỷ PBH mới nhất; các split còn lại GIỮ trừ kho + `wallet_deducted` → **tồn kẹt vĩnh viễn, ví không hoàn**. Fix: bỏ `LIMIT 1`, loop `_cancelPbhInTx` HẾT PBH còn sống (state≠cancel) của `source_code`, restock GỘP. Single-PBH case không đổi (loop 1 lần). **Verify live (deploy 66a2f707d)**: order qty3, stock 20→PBH1=17→PBH2(split)=14→cancel→**20** (cả 2 restock), cả 2 PBH state=cancel. ⚠ Bài học test: PBH `number` UNIQUE = mã đơn (NJ-YYYYMMDD-XXXX, reuse khi xoá đơn) → cancelled PBH test `NJ-...-0001` để lại SẼ va chạm đơn THẬT đầu ngày (UNIQUE violation → đơn thật không tạo được PBH). Đã dọn sạch bằng `DELETE /:number?force=1` (state=cancel → skip restock, idempotent).

**🟠 FRONTEND silent-failure (no deploy — GH Pages)**:

1. `web2/supplier-wallet/js/supplier-wallet-actions.js` — trả NCC: ví ĐÃ ghi sổ (irreversible) nhưng `adjustStock` lỗi bị nuốt im → ví↔tồn lệch. Thêm toast cảnh báo "ghi sổ OK nhưng chưa trừ tồn — chỉnh tay tại Kho SP".
2. `native-orders/js/native-orders-pbh-bill.js` `_markPrintedCodes` — `.catch(()=>{})` nuốt im lỗi ghi số-lần-in (in THẬT nhưng không ghi → reprint-guard sai). Thêm warn + toast.
3. `native-orders/js/native-orders-bulk-operations.js` `bulkCreatePbhShop` — chỉ báo "lỗi N" không rõ đơn nào → user không retry đúng đơn. Thu `failedOrders[{code,reason}]` → Popup chi tiết.
4. `so-order/js/so-order-receive.js` — item upsert `action:'error'` bị loại khỏi confirm-purchase im lặng (tồn không cập nhật, user tưởng nhận đủ). Thêm toast liệt kê SP lỗi.
5. `so-order/js/so-order-barcode.js` — item lỗi tạo mã bị loại khỏi in tem im lặng. Thêm toast.

**⚠ FLAG (verified — narrow edge, KHÔNG rush fix)**: `web2-returns.js` `thu_ve_1_phan` (line ~748) ĐÃ cap mỗi dòng `quantity = Math.min(it.quantity, ref.quantity)` theo SL ĐÃ BÁN — nên 1 lần thu về KHÔNG vượt được SL bán (an toàn). Khe hở HẸP: cap theo TỔNG đã bán, KHÔNG trừ phần đã thu trước (`returned_line_qty`) → 2+ lần thu về cùng SP/PBH cộng dồn có thể vượt SL bán (vd bán 5: thu 3 OK→RLQ=3, thu 3 nữa vẫn OK vì cap theo 5 không phải remaining 2→RLQ=6). Fix ĐÚNG = cap theo `remaining = sold − currentRLQ`, NHƯNG để race-safe phải đọc RLQ + cap BÊN TRONG locked tx (line ~955, hiện cap ở ngoài tx) = refactor luồng tiền-return, cần test cả 3 sub-type (khong_nhan_hang/thu_ve_1_phan/cod_shipper) ± sourceOrderCode. Single-return đang đúng → để fix có chủ đích + test đầy đủ, không vá vội.

Đào sâu hơn (yêu cầu user "càng sâu càng chi tiết càng tốt") — drive các luồng nghiệp vụ THẬT qua API client trong browser, verify bất biến dữ liệu liên-trang, dọn sạch test data sau mỗi luồng. Dùng codegraph map server contract trước.

**Luồng đã verify (đều cleanup 0 leftover)**:

1. **Kho SP CRUD** — create `{success,product}` (server sinh/sanitize code, validate "supplier bắt buộc") → get → delete force → gone.
2. **adjustStock atomic** — stock 5 → +10=15 → −3=12 → delete (delta gộp, clamp 0).
3. **so-order MUA (purchase side)** — `upsertPending` (code bắt buộc) → product status `CHO_MUA`/pending=8/stock=0 → hiện trong pending list → `confirmPurchase` → stock=8/pending=0/`DANG_BAN`. Linkage Sổ Order → Kho SP đúng.
4. **native-orders BÁN (sell side)** — create order (draft) → PBH `/from-native-order` → **stock 20→17** (−qty3) → `/by-source/:code/cancel` → **17→20** (restock idempotent, migration 077 `stock_restored`). Linkage Đơn Web → PBH → Kho SP đúng cả 2 chiều.
5. **SSE realtime fan-out** — subscribe `web2:products` → create phát `action:create`, delete phát `action:delete` (nhận realtime). Backbone đồng-bộ-giữa-máy OK.
6. **Ví KH money-integrity** — deposit 5000 → +5000; **replay cùng idempotencyKey → VẪN 5000 (không double)**; withdraw → 0 (net-zero). Idempotency dedupe (d-fix #3) + balance math đúng.
7. **CHO_MUA chặn PBH** — order có SP `CHO_MUA` → `/from-native-order` trả **400 `cho_hang_blocked`** (chặn bán hàng chưa về). Cross-feature guard đúng.

**Bug fix (silent failure)**: `so-order/js/so-order-kho-sync.js syncRowsToKho` — `upsertPending` trả `success:true` KỂ CẢ khi item lẻ lỗi (`action:'error'`, vd mã trùng SP khác). Hàm chỉ báo `created/updated`, **nuốt im item lỗi** → user tưởng sync đủ. Fix: đếm `items[].action==='error'` → `console.warn` chi tiết + toast cảnh báo "N SP KHÔNG sync được (mã trùng?)". (Callers khác — so-order-receive map theo action/name, barcode skip item thiếu code — đã xử lý đúng.)

### [audit] web2: full menu audit — 50 trang load+interaction+CRUD test, fix dead-link + video-maker probe noise

Audit toàn bộ menu Web 2.0 (yêu cầu user: liệt kê menu + render server + env → browser-test từng trang như user → fix → lặp). Inventory: 14 nhóm menu / 50 trang web2 + 5 render service (web2-api, n2store-fallback, web2-realtime, n2store-realtime, 2 Postgres) + env Web 2.0.

**Phương pháp**: (1) smoke-all-pages baseline → 69 clean / 13 issues (13 đều là Web 1.0 same-origin `/api/*` 404 trên localhost — môi trường, NGOÀI scope — + 3 trang 404 chết); (2) audit driver `nav + /state console-errors + DOM health` cho cả 50 trang; (3) interaction probe `gõ search + click nút SAFE (bỏ destructive) + mở/đóng modal` cho ~25 trang; (4) CRUD thật products create→get→delete; (5) screenshot eyeball overview/products/ai-hub.

**Lỗi tìm + fix**:

1. **Dead link `web2/partner-customer`** (đã xoá) — nút "Mở thẻ KH Web 2.0" ở comment-row live-chat link tới trang 404. Repoint → `web2/customers/?phone=` (trang sống) + guard `partner.Phone`. Thêm deep-link `?phone=`/`?q=` cho trang customers (prefill search + filter on init). **Verified**: rows=1 đúng KH test.
2. **video-maker `ERR_CONNECTION_REFUSED`** — `probeLocal` (VieNeu TTS localhost:8123/8124) bắn MỖI lần load cho MỌI user → browser log lỗi network (try/catch JS không chặn). Gate: auto-load chỉ dò nếu đã từng thấy máy local (localStorage flag); nút "Làm mới" luôn dò + nhớ. **Verified**: console clean.
3. **Smoke harness stale** — gỡ 3 trang chết (tpos-pancake, live-campaign, partner-customer), bổ sung WEB2_PAGES đủ 50 trang.

**Kết quả**: 50/50 trang load KHÔNG console error (sau fix video-maker); ~25 trang interaction-clean; products CRUD write-path OK (auth + validation server "supplier bắt buộc" + create `{success,product}` + delete force) — test data dọn sạch 0 leftover. printer-settings probe localhost:17777 = CÓ CHỦ ĐÍCH (chỉ bắn khi có máy in bridge đã cấu hình → warning offline). live-chat 404/401 = Pancake token test env (môi trường).

### [fix] web2: ai-hub tạo ảnh kẹt sau 1 hình + ẩn tên Pexels/Pixabay + liên kết flow video-maker + auto-stock

User báo 3 việc (+ hoàn thiện auto-stock):

1. **ai-hub "Tạo ảnh" kẹt sau 1 hình, phải F5** — gốc: KHÔNG có timeout ở cả client lẫn server → token Pollinations treo/rate-limit làm `await fetch` không bao giờ resolve → nút disabled vĩnh viễn. Fix: (a) server `web2-ai-image-service.js` `_pollinations` thêm `AbortSignal.timeout(45s)` mỗi token → treo thì xoay token kế; (b) client `ai-image.js` thêm `AbortSignal.timeout(120s)` + thông báo "Quá lâu, bấm lại" + `finally` luôn mở nút. **Verified browser**: tạo ảnh 1 OK → nút mở lại → tạo ảnh 2 OK (2 card resolved, 0 loading). Cần deploy web2-api cho server timeout.
2. **Ẩn tên nguồn Pexels/Pixabay** — bỏ khỏi MỌI text user-facing: modal title "Kho ảnh / video miễn phí" (bỏ "(Pexels · Pixabay)"), footer "Ảnh & video bản quyền-free", message chưa-cấu-hình → "Liên hệ admin", checkbox + title attr. Verified `hasBrandName:false`.
3. **Liên kết flow ("chọn video xong rồi làm gì")** — `VideoMakerPage.gotoVoiceStep()` (chuyển tab "Giọng & Âm thanh" + scroll tới lời đọc/Xuất). Gọi sau khi: nạp video stock (video-stock pick), import video file (#vmImpFile). Toast next-step rõ ràng. Verified tab switch.
4. **Auto-stock topic→video** (MoneyPrinterTurbo pure-stock): `Web2VideoStock.search(q,opts)` (API lập trình) + `_buildStockScenes`/`_topicFromStock` + checkbox `#vmUseStock`. Khi kho không có ảnh SP HOẶC tick "Dùng ảnh kho miễn phí" → dựng N cảnh từ kho stock theo chủ đề (1 search per=n\*2 + dịch EN bù nếu ít kết quả). AI rỗng narration (không SP) → bù lời đọc theo chủ đề + gán caption ngay. Verified: 5 cảnh stock + narration + caption.

Bump video-maker.js `?v=20260624b`, video-render/stock `?v=20260624a`, ai-image.js `?v=20260624a`.

<!--
HƯỚNG DẪN THÊM ENTRY MỚI:

1. Nếu cùng ngày → thêm entry ngay dưới heading ## [NGÀY]
2. Nếu ngày mới → thêm heading ## [NGÀY MỚI] ở trên cùng (trước ngày cũ)

FORMAT:
### [module] Mô tả ngắn {✅ hoặc 🔄}
**Files**: `path/to/file.js`
**Chi tiết**: Thay đổi gì, tại sao

MODULE TAGS: [inbox] [chat] [extension] [orders] [worker] [render] [shared] [docs] [config]
STATUS: ✅ = Done, 🔄 = In Progress
-->
