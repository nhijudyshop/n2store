# Dev Log

## 2026-06-18

### [wallets-v2] Fix Rút tiền (Customer 360) báo thành công nhưng KHÔNG trừ số dư ✅

**User:** "lỗi nạp tiền thì được mà rút tiền thì không được?" (trên trang Customer 360, nạp tiền OK nhưng rút tiền số dư đứng yên dù báo thành công).

**Nguyên nhân:** mọi lần "Rút tiền" thủ công đều gửi `order_id = null` → backend [render.com/routes/v2/wallets.js:681](render.com/routes/v2/wallets.js) đặt `refId = 'MANUAL'` (dùng chung). Stored function `wallet_withdraw_fifo` ([migration 075](render.com/migrations/075_wallet_refund_outbox.sql)) có idempotency guard: thấy giao dịch trước cùng `reference_id='MANUAL'` + `source='ORDER_PAYMENT'` cho số đt này → trả `success=TRUE`, `ALREADY_PROCESSED`, **không trừ**. → Lần rút tay đầu OK, từ lần 2 trở đi bị tưởng nhầm trùng → no-op. Nạp tiền (`processManualDeposit`) không có guard này nên luôn đúng.

**Fix** ([render.com/routes/v2/wallets.js](render.com/routes/v2/wallets.js)) — server-only, 2 chỗ, KHÔNG đụng DB/frontend:

- Dòng ~681 (`POST /:customerId/withdraw`): `refId = order_id || 'MANUAL'` → `order_id || \`MANUAL-${Date.now()}-${rnd}\`` → mỗi lần rút tay 1 reference duy nhất → guard không bao giờ tưởng nhầm trùng. Đơn hàng thật vẫn truyền `order_id` riêng → idempotency cho luồng đơn COD (`pending-withdrawals`) GIỮ NGUYÊN.
- Dòng ~83 (`GET /manual-transactions`): bộ lọc `reference_id = 'MANUAL'` → `reference_id LIKE 'MANUAL%'` (tương thích ngược: khớp cả 'MANUAL' cũ lẫn 'MANUAL-...' mới) để rút tay vẫn hiện trong danh sách giao dịch thủ công.

**KHÔNG đụng:** frontend (`wallet-panel.js`/`api-service.js`), stored function, schema/migration. `created_by` stamp + insert WITHDRAW (`sepay_id=NULL`, partial unique index migration 064) vẫn an toàn. `GET /:customerId/transactions` lọc theo phone — không cần sửa.

**Status:** ✅ fix code xong (Web 1.0, PROD). Cần verify sau khi Render deploy: rút tay nhiều lần liên tiếp trên `0123456788` → số dư giảm đúng mỗi lần.

### [web2/shared] Fix nút `.web2-btn-warning` chưa có CSS (3 trang fastsaleorder) ✅

**User:** "rà soát lại tất cả các nút, các trang chưa có css" (kèm 3 ảnh: fastsaleorder-delivery / -refund / -invoice).

**Root cause:** class `.web2-btn-warning` được DÙNG ở 3 nút nhưng KHÔNG hề được định nghĩa trong shared CSS → 3 nút này fallback về style `.web2-btn` cơ bản (nền trắng/viền xám) thay vì màu cảnh báo:

- `fastsaleorder-delivery/dlv-app.js:94` — nút row "Bị trả" (undo-2, xs)
- `fastsaleorder-invoice/pbh-app.js:200` — nút row "Trả hàng" (undo-2, xs)
- `fastsaleorder-invoice/index.html:140` — nút bulk "Hủy tất cả" (sm)

Audit toàn bộ web2 (`grep web2-btn-*`): các variant `default/primary/success/info/danger/sm/xs` đều có định nghĩa; **chỉ `warning` thiếu**. Token `--web2-warning` có (`#f59e0b` theme, `#fad733` base) nhưng thiếu `--web2-warning-hover`.

**Fix (shared — áp dụng mọi trang dùng `web2-btn-warning`):**

- [web2-components.css](web2/shared/web2-components.css): thêm `.web2-btn-warning` + `:hover` (theo đúng pattern 4 variant màu còn lại — `background/border = var(--web2-warning)`, `color:#fff`).
- [web2-theme.css](web2/shared/web2-theme.css): thêm token `--web2-warning-hover: #d97706` (amber-600, cặp với `#f59e0b`).
- [web2-base.css](web2/shared/web2-base.css): thêm fallback `--web2-warning-hover: #e6c200`.
- Bump cache-bust `?v=20260618w1` cho base/components/theme trên cả 3 trang (warning chỉ dùng ở 3 trang này nên không cần bump trang khác).

**Verify (Playwright localhost, ext n2store, login web2 admin):** invoice page → `web2-components.css?v=20260618w1` loaded; `.web2-btn-warning` computed bg = `rgb(245,158,11)` amber + text trắng (trước đó là nền UA mặc định xám); primary vẫn xanh Zalo `#0068ff`. Screenshot xác nhận nút "Trả hàng" (undo-2) trong row giờ màu cam, cạnh nút truck cyan. Delivery page cũng load đúng version + warning amber.

**Status:** ✅ FE verified. Web 2.0 shared CSS.

### [purchase-refund] Thêm hình SP (tham chiếu Kho SP) + cân đối lại modal trả hàng ✅

**User:** "thêm hình sản phẩm → tham chiếu vào kho sản phẩm" + "giao diện chưa cân đối".

**Thêm:**

- **Ảnh SP từ Kho SP**: agg item trong `loadSoOrderReceivedItems` lấy `matched.imageUrl` (nguồn `Web2ProductsCache` = Kho SP). Helper `safeImageUrl` (chặn scheme nguy hiểm) + `thumbHtml` (img + fallback icon `onerror`). Render thumbnail 38×38 ở: **Section A** (cột Tên+Biến thể), **modal trả cả đơn** (`#prBulkRows`), **modal trả lẻ** (`#prQuickInfo` hàng "Ảnh"). CSS `.pr-thumb`/`.pr-thumb-ph`/`.pr-name-cell`.
- **Cân đối modal bulk**: width 760→**720px**; siết cột số (Tồn 52 / Giá 90 / Trả SL 84 / Thành tiền 104, Mã SP 100), qty input 64→56px, `td:nth-child(2)` (Tên) `min-width:200px` → tên SP tối đa 2 dòng (hết vỡ 3 dòng), thumbnail lấp khoảng trống trái (gốc "chưa cân đối"). Bump CSS `?v=20260617c`, JS `?v=20260617c`.

- **Xem ảnh FULL (lightbox)**: thumbnail ảnh thật click được (`pr-thumb-zoom`, cursor zoom-in) → overlay `pr-img-overlay` hiện ảnh full-size `object-fit:contain` (không crop, max 92vw/92vh) + nút ×, click/Esc đóng. Delegated click toàn cục (1 listener) cho mọi thumbnail (Section A + modal bulk + modal lẻ). Đóng lightbox KHÔNG đóng modal trả hàng. Bump v20260617d.
- **Modal trả cả đơn = lớn nhưng KHÔNG tràn viền** (user: "modal full browser" → "bố cục lại, đừng tràn viền"): `.pr-bulk-content` `width:92vw; max-width:1200px; height:88vh` (đo b1: 1152×760 trong 1440×900, lề 144px ngang / 79+60px dọc — không chạm viền). Flex column: header + footer (Lý do/Phương thức/Ghi chú/Tổng/nút) **flex-shrink:0 cố định**, CHỈ `.pr-bulk-table-wrap` (flex:1, overflow-y:auto) cuộn → nút Hủy/Xác nhận LUÔN trong tầm nhìn, không bị clip; `overflow:hidden` ở content+form chống đẩy ra ngoài. Modal lẻ (538px) không bị ảnh hưởng. Bump v20260617f.

**Verify (Playwright localhost, ext n2store):** Section A 7 SP có thumbnail (3 SP có ảnh base64/picsum từ Kho SP, còn lại placeholder icon); modal bulk A1 3 SP thumbnail render, name 2 dòng, modal 720px cân đối; modal lẻ có hàng "Ảnh"; click thumbnail → lightbox full ảnh (picsum 500×500 render đúng), đóng overlay giữ nguyên modal. 0 lỗi console. `node --check` PASS.

**Status:** ✅ FE verified. purchase-refund (Web 2.0). Ảnh tham chiếu thẳng Kho SP (`Web2ProductsCache.imageUrl`), không lưu trùng; xem full qua lightbox.

### [cloudflare-worker] Fix SSE `/api/sepay-home/stream` 502 → "Mất kết nối" trên balance-history-home ✅

**Triệu chứng:** trang `balance-history-home` hiện badge đỏ "Mất kết nối"; console lặp `GET /api/sepay-home/stream → 502` + `[REALTIME] SSE Error` → reconnect vô hạn. Data vẫn tải OK (history API riêng), chỉ realtime chết.

**Root cause:** [proxy-handler.js](cloudflare-worker/modules/handlers/proxy-handler.js) `handleSepayHomeProxy` truyền `timeout = isSse ? 0 : 15000` cho `fetchWithRetry`. Trong `fetchWithTimeout` ([shared/universal/fetch-utils.js](shared/universal/fetch-utils.js):28) `setTimeout(()=>controller.abort(), 0)` = **abort NGAY** → fetch tới Render bị huỷ tức thì → retry 3 lần đều fail → handler trả **502**. (`timeout` chỉ tính thời-gian-tới-headers; SSE headers về nhanh rồi `clearTimeout` cho body stream tiếp — nên KHÔNG cần 0.)

**Bằng chứng:** direct Render `/api/sepay-home/stream` → 200 `text/event-stream` ✓; original `/api/sepay/stream` qua worker → 200 ✓ (handler đó dùng 15000, không có nhánh SSE-0). Chỉ sepay-home (timeout 0) chết.

**Fix:** đổi `isSse ? 0 : 15000` → `15000` (giống `handleSepayProxy` đã chạy ổn). Giữ nhánh `isSse` set `Accept: text/event-stream`. Deploy worker `wrangler deploy` (version `d29a40f3`).

**Verify:** sau deploy, `/api/sepay-home/stream` qua worker → **200 `text/event-stream`** + nhận `event: connected`. Badge sẽ chuyển "Mất kết nối" → "Realtime" khi reload trang.

### [balance-history-home] Phân biệt 2 tài khoản SePay Home (cột "Tài khoản" + bộ lọc 44 TL / 481 NVK) ✅

**User:** muốn "thêm webhook mới" (SePay) cho trang `balance-history-home` gồm 2 tài khoản (`09777743051810` "44 TL" + `09777743051708` "481 NVK") — nhấn mạnh đặt tên **TÁCH RIÊNG** với SePay shop có sẵn để code phân biệt được.

**Phát hiện:** toàn bộ hạ tầng SePay Home đã build sẵn & tách biệt hoàn toàn với `/api/sepay` của shop:

- Worker route `/api/sepay-home/*` → `n2store-fallback.onrender.com` (đã có).
- Backend `routes/sepay-home-webhook.js` (webhook/history/statistics/stream), bảng `balance_history_home`, log `sepay_home_webhook_logs`, env `SEPAY_HOME_API_KEY` (đã set trên Render, khớp secrets), SSE buffer `balanceHomeSseClients` — KHÔNG đụng `SEPAY_API` của shop.
- Verify live: worker→render ping OK, history OK. → **Naming separation user yêu cầu đã xong sẵn.**

**Việc mới (user chọn "thêm cột + bộ lọc theo TK"):** 2 TK cùng đổ vào 1 bảng, phân biệt bằng `account_number`.

- **config.js**: `CONFIG.ACCOUNTS` (number→label, single source of truth) + helper `window.getAccountLabel()`. Đổi TK/nhãn nhà CHỈ sửa ở đây.
- **Backend** ([sepay-home-webhook.js](render.com/routes/sepay-home-webhook.js)): thêm filter `accountNumber` cho `/history` + `/statistics` (kể cả subquery `latest_balance` → số dư riêng từng TK khi lọc).
- **index.html**: thêm `<div id="accountChips">` (render từ JS) + cột header "Tài khoản". Bump `?v=20260618bh`.
- **balance-table.js**: cell `.col-account` hiện `.account-tag` (nhãn nhà, title=số TK); empty-state colspan 7→8.
- **balance-core.js**: `filters.accountNumber` + check trong `transactionMatchesFilters` (SSE realtime lọc đúng TK).
- **balance-filters.js**: `setupAccountChips()` (render chip "Tất cả / 44 TL / 481 NVK" từ CONFIG.ACCOUNTS, ẩn nếu <2 TK) + reset trong `resetFilters()`.
- **main.js**: gọi `setupAccountChips()`. **home.css**: `.account-chips` (teal, tách màu type-chips) + `.account-tag`.

**Verify (Playwright localhost + ext, seed 2 GD ảo/TK qua webhook thật):** webhook 2 TK → 200 OK (worker→render→`balance_history_home`); chips ["Tất cả","44 TL","481 NVK"] + cột "Tài khoản" render; row hiện đúng nhãn nhà; click chip → frontend gửi `accountNumber=...` tới `/history`+`/statistics` (đã hook fetch xác nhận). Lọc server-side chỉ có hiệu lực sau khi **deploy backend** (localhost đang gọi prod backend chưa có filter). Đã **xoá sạch** 2 row test (`sepay_id 999000801/802`).

**Cần làm thủ công (ngoài code — SePay dashboard `my.sepay.vn`):** tạo webhook trỏ URL `https://chatomni-proxy.nhijudyshop.workers.dev/api/sepay-home/webhook`, chọn 2 TK, định dạng JSON, API key = `SEPAY_HOME_API_KEY` (Bảo mật → Apikey).

**Status:** ✅ code xong + verify FE. Backend filter chờ deploy (push render.com/\*\* → Render Build Filter auto-deploy). Web 1.0 (balance-history-home, pool chatDb).
### [delivery-report] Tab "ĐƠN 0đ" hiện ĐỦ mọi nhóm (Thành phố/NAP/Thu về), không chỉ Shop+Tomato ✅

**User:** "đơn 0 đồng hiện tại chỉ cập nhật của bán hàng shop và tomato, không cập nhật thành phố/nap... muốn cập nhật toàn bộ cả thành phố nap luôn" → chốt "giữ nguyên luôn tomato" (giữ cột TOMATO dù luôn 0/0).

**Nguyên nhân:** lite mode (tất cả user) thu hẹp các tab gộp (combo/zero/all) về **2 cột tomato+shop** ở 3 chỗ ghép nối → tab `zero` vô tình lọc bỏ đơn 0đ thuộc NAP/Thành phố/Thu về. Cộng với `assignTomatoNap` LUÔN đẩy đơn 0đ về NAP (không bao giờ TOMATO vì TOMATO là rổ chia ~21% giá trị tiền của nhóm Tỉnh) → cột TOMATO trong view 0đ luôn 0/0, chỉ còn SHOP 0đ hiện.

**Fix** ([delivery-report.js](delivery-report/js/delivery-report.js)) — chỉ chạm tab `zero`, frontend-only:

- Thêm hằng `ZERO_TAB_GROUPS = ['tomato','nap','city','shop','return']` (giữ TOMATO theo yêu cầu).
- `getActiveGroups()`: thêm nhánh `if (tab === 'zero') return ZERO_TAB_GROUPS;` trước check lite → export Excel 0đ gồm đủ sheet.
- `getTabFilteredData()` nhánh `zero`: bỏ `inLiteGroups`, chỉ `data.filter(isZeroCOD)` → bộ đếm "Đã quét N/N" gồm mọi nhóm.
- `renderAllGroupsView()`: tab zero → `groupKeys = ZERO_TAB_GROUPS` + pre-filter `isZeroCOD` ở CẢ lite lẫn full (gộp `liteItemFilter`/`isZeroTabFull` thành 1 `itemFilter`).
- `buildPrintGroups()` (in/preview): tab zero → cũng dùng `ZERO_TAB_GROUPS` (đồng bộ on-screen).
- `exportExcelZeroDong()`: tên file gọn còn `'DON0D'` (bỏ hậu tố `_TOMATO_SHOP`).
- Bump `?v=20260618a` ([index.html](delivery-report/index.html)).

**KHÔNG đụng:** backend/DB, assignment logic, tab combo/all, nút Ảnh TMT/NAP/Thành Phố + Gửi Kèm (vẫn ẩn ở tab zero do guard `activeTab === 'province'/'city'`). Quét mã đơn 0đ-nap/city giờ hiện đúng cột (trước nửa vời → cải thiện).

**Verify (Playwright localhost, ext n2store):** seed 5 đơn 0đ phủ mọi nhóm → tab ĐƠN 0đ render đúng: TỈNH NAP 0/1, THÀNH PHỐ 0/1, BÁN HÀNG SHOP 0/1, THU VỀ 0/1, TOMATO 0/0 (giữ, luôn rỗng); đơn tỉnh 500k (≠0đ) bị loại; `drScanTotal`=4 khớp render; 0 lỗi console từ delivery-report.js.

**Status:** ✅ verified end-to-end (localhost). Web 1.0 (delivery-report, PROD).

### [purchase-refund] Nút "Trả hàng" ở header ĐƠN → modal trả nhiều SP cùng lúc (SL mặc định 0) ✅

**User:** "cho nút trả hàng ở vị trí header đơn (A1/b1) để mở modal gồm TẤT CẢ sản phẩm, mặc định số lượng 0 để user chỉnh → nhanh hơn trả từng cái → gồm thông tin như modal trả 1 SP".

**Thêm (frontend-only — backend `quick-refund` đã nhận `products[]` đa SP atomic, KHÔNG đổi):**

- **HTML** [index.html](web2/purchase-refund/index.html): modal `#prBulkModal` (reuse class `.pr-quick-*`) — info NCC/đơn/số SP + bảng SP (Mã · Tên+Biến thể · Tồn · Giá · **Trả SL** input · Thành tiền) + Lý do + Phương thức hoàn + Ghi chú + Tổng tiền NCC sẽ hoàn. Bump CSS/JS `?v=20260617a`.
- **CSS** [purchase-refund.css](web2/purchase-refund/css/purchase-refund.css): `.pr-bulk-*` (table sticky header, qty input, dòng có SL>0 highlight vàng) + `.pr-bulk-btn` (nút đỏ nhạt ở header nhóm).
- **JS** [purchase-refund-app.js](web2/purchase-refund/js/purchase-refund-app.js): `renderSourceList` lưu `SOURCE_STATE.groups` + chèn nút "Trả hàng" `data-bulk-group` vào header mỗi nhóm. `openBulkRefund/renderBulkRows` (qty mặc định **0**, max=tồn) + live total per-line + tổng (clamp input 0..tồn). `submitBulkRefund` gom SP có SL>0 → **1 phiếu** `POST /api/purchase-refund/quick-refund` (đa SP, atomic: trừ kho từng dòng + ghi ví NCC theo totalAmount). Giữ await+loading (money op). CHỈ SP có SL>0 vào phiếu; rỗng → cảnh báo.

**Fix kèm (stale stock sau trả):** `quick-refund` KHÔNG `_notify('web2:products')` → `Web2ProductsCache` (IDB) giữ tồn cũ kể cả reload → Section A hiện tồn sai. Thêm `await Web2ProductsCache.refresh()` TRƯỚC `loadSourceItems()` ở **cả** `submitBulkRefund` VÀ `submitQuickRefund` (sửa luôn bug cũ của nút trả lẻ). Bump JS `?v=20260617b`.

**Verify (Playwright localhost, ext n2store, login web2 admin) — LIVE submit (user cho phép chỉnh data Web 2.0 beta):** modal b1 4 SP SL=0; nhập 2×HNMM3S + 1×HNQUANXAM → tổng 1.180.000₫; submit → toast "✓ Đã trả 3 SP (2 dòng) cho b1 — giảm ví NCC 1.180.000₫". Server: stock HNMM3S 10→8, HNQUANXAM 5→4 (xác minh qua `/api/web2-products/list`), phiếu mới tạo (status NCC DUYỆT, ghi đủ 2 SP, Tổng SL 3 / 1.180.000₫), ví NCC −1.18M. Sau fix refresh: Section A hiện tồn MỚI ngay (HNMM3S=7, HNQUANXAM=4 sau lần trả thứ 2). clamp 99→max=tồn OK. 0 lỗi console.

**Status:** ✅ verified end-to-end LIVE (submit thật, data Web 2.0 beta). purchase-refund (Web 2.0). Backend không đổi (chỉ +refresh cache client).

## 2026-06-17

### [web2/shared] Popup dùng chung — alert/confirm/popup nhiều loại + hiệu ứng custom, migrate toàn cục Web 2.0 ✅

**User:** "tìm kiếm toàn bộ, toàn cục web 2.0 về alert, popup tất cả trang thay toàn bộ về custom hiệu ứng, giao diện → làm custom riêng về phần popup, alert nhiều loại (confirm, warning, OK, exit,...) để các trang tham chiếu dùng nguồn này".

**Nguồn DUY NHẤT:** [web2/shared/popup.js](web2/shared/popup.js) (`window.Popup`) — đã auto-load mọi trang Web 2.0 qua [web2-sidebar.js](web2/shared/web2-sidebar.js) (`inject('popup.js','20260617')`). KHÔNG tự build alert/confirm/popup riêng.

**Nâng cấp popup.js (hiệu ứng + loại):**

- API: `alert` · `info` · `success` · `error` · `warning` (OK đơn, typed màu+icon) · `confirm` (Promise<boolean>) · `danger` (confirm phá huỷ, nút ĐỎ) · `exit` (rời/thoát — "Thoát"/"Ở lại") · `prompt` (Promise<string|null>, có `multiline`). opts: `title/type/danger/okText/cancelText/defaultValue/placeholder/multiline`.
- **Hiệu ứng custom:** spring entrance + icon pop + ring-pulse theo accent; burst Lottie (`Web2Lottie.success()/error()`) khi type success/error; **scroll-lock body đếm chồng** (iOS-safe), nút danger đỏ `#ef4444`, focus-visible ring, **tôn trọng `prefers-reduced-motion`** (tắt hết animation). Giữ nguyên bộ utility class `.w2p-overlay/.w2p-card/.w2p-scroll-area` cho modal custom khác.
- KHÔNG override `window.alert/confirm/prompt` (giữ ranh giới migrate rõ); KHÔNG `backdrop-filter:blur` (chống lag theo MODAL-ANTI-LAG).

**Migrate toàn cục (5 sub-agent song song, 33 file):** thay HẾT native `alert/confirm/prompt` → `Popup.*` ở web2/_ + native-orders + so-order + live-chat. Quy tắc: `confirm/prompt` → `await Popup._`(hàm thành`async`, hoặc `.then()` khi handler sync); thao tác phá huỷ (xoá/huỷ/reset/gỡ) → **`Popup.danger`** (28 chỗ); lỗi → `Popup.error`. Wrapper sẵn có (`w2pConfirm/w2pAlert/w2pPrompt`) bỏ nhánh native chết, delegate thẳng `window.Popup`(callers đã`await`).

**Verify:** `node --check` PASS toàn bộ 33 file; grep KHÔNG còn native call thật (chỉ comment + 1 fallback chuỗi cuối `web2-sidebar.alertSoon`); KHÔNG có `Popup.confirm/danger/prompt` nào dùng trong điều kiện mà thiếu `await` (chống bug Promise luôn truthy). Browser (Playwright localhost, ext): danger popup render đúng (nút đỏ "Xoá", icon octagon, scroll-lock bật/tắt đúng, accent `#ef4444`), load sạch 0 lỗi console ở native-orders + pancake-settings + reconcile + customers + products + purchase-refund + returns. Số call sau migrate: confirm 20 · danger 28 · prompt 17 · error 13 · alert 7 · info/success/warning/exit mỗi loại ≥1.

**Status:** ✅ verified end-to-end. Web 2.0 shared. Trang mới cần alert/confirm/popup → DÙNG `window.Popup.*`, đừng reinvent.

### [native-orders] Bộ lọc chiến dịch: NHÓM (cha) vs RIÊNG LẺ (bài) — loại trừ 2 chiều + tự chọn 2 bài mới nhất ✅

**User:** "bộ lọc hình 2 chưa đúng" → làm rõ: 2 cấp — **chiến dịch cha = NHÓM bài** (phần trên, radio), **chiến dịch bài viết = RIÊNG LẺ** (phần dưới, checkbox). Yêu cầu: (1) phần trên bỏ "— Tất cả (không lọc cha) —"; (2) phần dưới bỏ nút "Đồng bộ Pancake" (đã tự động); (3) phần dưới **tự chọn 2 bài mới nhất (House + Store)**; (4) **loại trừ 2 chiều** — chọn nhóm thì bài riêng lẻ mất tick & ngược lại.

**Sửa:**

- **Backend** [native-orders.js](render.com/routes/native-orders.js) `GET /campaigns`: thêm `MAX(fb_page_name) AS page_name` + `fb_page_id` → mỗi campaign trả `pageName`/`pageId` để FE phân biệt House/Store. (Idempotent SQL, cùng GROUP BY.)
- **HTML** [index.html](native-orders/index.html): gỡ nút `#campaignSyncWeb2` ("Đồng bộ Pancake") khỏi toolbar (giữ "Tất cả"/"Bỏ chọn").
- **JS** [native-orders-app.js](native-orders/js/native-orders-app.js):
    - `renderParentCampaigns()` bỏ row "— Tất cả (không lọc cha) —" (chỉ list nhóm thật).
    - `pickNewestHouseStore()` + `reconcileCampaignSelection()`: list sort `lastOrderAt` DESC → lấy bài đầu khớp `/house/i` + `/store/i`; fallback (thiếu pageName, backend chưa deploy) → 2 campaign mới nhất. Dọn ID stale + tự chọn khi rỗng → **sửa luôn bug "4 chiến dịch" ảo** (ID cũ không tồn tại làm lọc ra 0 đơn).
    - **Loại trừ 2 chiều**: `selectParentCampaign(id)` chọn nhóm → clear `selectedCampaignIds`; checkbox bài riêng lẻ tick → `clearParentSelection()` (bỏ radio nhóm). `campaignSelectAll` cũng clear nhóm.
    - `renderCampaignLabel()`: nhóm đang chọn → hiện TÊN NHÓM; ngược lại hiện số bài riêng lẻ.
    - Gỡ `syncFromWeb2Pancake` + storage listener `web2_selected_campaigns` + fallback shared-key (`loadCampaignSelection` chỉ đọc own-key).

**Verify (Playwright localhost, ext n2store):** label "4 chiến dịch" → **"2 chiến dịch"** (tự chọn 2 bài mới nhất, 2 tick); không còn "không lọc cha"/"Đồng bộ Pancake"; chọn nhóm → 0 tick + label = tên nhóm; tick bài → radio nhóm bỏ + label = tên bài. 0 lỗi console. `node --check` PASS. ⚠ pageName House/Store chỉ tách đúng SAU khi deploy backend (chưa deploy → fallback 2 bài mới nhất).

**Status:** ✅ FE verified end-to-end. Chờ deploy Render để pageName phân biệt House/Store. native-orders (Web 2.0).

### [pancake-settings] Thêm card "Admin theo Page" — đếm account admin + dùng được mỗi page ✅

**User:** từ trang `web2/pancake-settings/` muốn "ghi rõ có bao nhiêu account page house, có bao nhiêu account page store".

**Bối cảnh:** màn "Tăng comment" (`web2/multi-tool/`) spawn 1 worker / account admin của page, lọc bỏ token hết hạn (`getPageAccountJwts`) → page House chạy 3 worker dù có 5 account admin (2 account Thu Lai/Con Nhoc hết hạn). Trang settings cũ chỉ liệt kê 6 account dạng phẳng, KHÔNG tổng hợp admin theo page.

**Thêm:**

- **HTML** [index.html](web2/pancake-settings/index.html): card mới "Admin theo Page" (sau card Tài khoản) + badge `#pageAdminBadge` + list `#pageAdminList`.
- **JS** [pancake-settings.js](web2/pancake-settings/js/pancake-settings.js): `renderPageAdminStats()` gộp `_accountsCache` (cùng nguồn mục Tài khoản — `Web2PancakeAccounts.list()` trả `pages[]`+`token_exp`+`is_active`) theo `page.id`. **"Dùng được" = token còn hạn AND không tắt sync** — khớp 100% logic `getPageAccountJwts` của boost. Mỗi page hiện: tổng admin (pill), `X/Y dùng được` (chip), tên account dùng được, dòng muted account hết hạn/tắt sync. Sort theo usable desc. Wire vào `loadAccounts()` (initial/reload/add) + `deleteAccount` apply/rollback (đồng bộ optimistic). Reuse class `.ps-page-item`/`.tok-chip`/`.status`, không thêm CSS.

**Verify (Playwright, localhost — ext n2store):** card render 4 page — **Nhi Judy House: 5 admin, 3/5 dùng được (Huyền Nhi, longxienc, Thu Huyền)**; **NhiJudy Store: 5 admin, 3/5 dùng được (Huyền Nhi, longxienc, Thu Huyền)**; Nhi Judy Ơi 2/4; NhiJudy Nè 2/4. Con số 3 khớp đúng số worker boost đã thấy. Screenshot xác nhận layout theme Zalo blue OK.

**Status:** ✅ verified browser end-to-end. pancake-settings (Web 2.0).

### [pancake-settings] Nút "Đồng bộ pages từ token" — sửa account có quyền page nhưng pages cache rỗng ✅

**User:** "Kỹ Thuật NJD cũng có quyền 2 page mà" (screenshot Pancake: KT admin NhiJudy Store + Nhi Judy IG + Nhi Judy House) nhưng card "Admin theo Page" đếm KT = 0 page.

**Root cause:** `pancake_accounts.pages` là snapshot — KT có token còn hạn (`is_active`, `token_exp` chưa hết) NHƯNG `pages: []` (chưa bao giờ fetch; auto-refresh chỉ gia hạn token, KHÔNG refetch pages). Boost (`getPageAccountJwts`) cũng đọc snapshot này nên KT cũng không tham gia "Tăng comment".

**Fix:**

- **Module** [web2-pancake-accounts.js](web2/shared/web2-pancake-accounts.js): thêm `updatePages(accountId, pages)` → `PUT /api/pancake-accounts/:id {pages}` (qua `_json` có auth). Bump `?v=20260617pageadmin`.
- **JS** [pancake-settings.js](web2/pancake-settings/js/pancake-settings.js): `syncAccountPages()` — với mỗi account còn hạn, fetch `GET /api/pancake/pages?access_token=<token account đó>` (parse `categorized.activated||pages`), map `{id,name}`, ghi DB qua `updatePages` (CHỈ khi khác cache + KHÔNG ghi đè rỗng → token lỗi/rate-limit không xoá pages). Xong → `Web2Chat.syncFromRenderDB({force:true})` (boost thấy ngay) + `loadAccounts()`. Nút "Đồng bộ pages từ token" + help. Bump `?v=20260617pageadmin2`.
- **HTML** [index.html](web2/pancake-settings/index.html): nút `#btnSyncAccountPages` + help text.

**Verify (Playwright, localhost — ext n2store):** trước sync House/Store = 5 admin, 3 dùng được. Click "Đồng bộ pages" → KT persist `pages:[Nhi Judy(IG), Nhi Judy House, NhiJudy Store]` (đúng screenshot). Sau: **House & Store = 6 admin, 4 dùng được** (usable: Kỹ Thuật NJD, longxienc, Huyền Nhi, Thu Huyền; hết hạn: Thu Lai, Con Nhoc). Thêm row mới "Nhi Judy (instagram) 1/1". `getPageAccountJwts(House/Store)` → 4 worker (gồm KT) → boost cũng đúng. (NhiJudy Nè 4→3 admin: sync sửa stale 1 account đã mất quyền Nè theo token thật.)

**Status:** ✅ verified browser end-to-end. pancake-settings (Web 2.0).

### [so-order] Mỗi NCC/Đơn có Tổng KG · Tiền HĐ · Giảm · Ship RIÊNG (per-đơn meta) ✅

**User:** "Các NCC có tổng KG, tổng tiền, giảm giá, phí ship riêng." Chốt: gom theo từng KHỐI/ĐƠN (invoiceGroupId); hiển thị dòng phụ đầu mỗi khối; sửa trong modal Sửa lô — mỗi NCC 1 cụm.

**Trước:** KG/Số kiện/Tiền HĐ ở cấp LÔ (cả ngày giao); Giảm/Ship đã per-đơn (`orderAdjustments[gid]`).

**Sau (refactor 4 phase):**

- **Storage** [so-order-storage.js](so-order/js/so-order-storage.js): `orderAdjustments[gid]` mở rộng `{ discount, shipping, weightKg, caseCount, contractAmount }`. `getShipmentAdjustTotals` cộng cả 5. Migration heal 1 lần: dời KG/Kiện/HĐ cấp lô → đơn đầu, clear field cấp lô (tránh cộng đôi), idempotent.
- **Render** [so-order-app.js](so-order/js/so-order-app.js): lô header = TỔNG read-only (`Tổng N Kiện : KG | Tổng HĐ | Giảm·Ship`). `_groupMetaSubHeaderHtml` chèn **dòng phụ đầu mỗi đơn** (`meta.inv.render`) hiện `🏪 NCC · KG · HĐ · Giảm · Ship` riêng. CSS `.so-grpmeta-*`.
- **Create / sửa 1 dòng**: form KG/Kiện/HĐ/Giảm/Ship → lưu meta của đơn đó (per-gid). `_applyShipMetaUi` load từ order meta.
- **Sửa lô modal** [index.html](so-order/index.html): ẩn cụm meta chung (`[data-single-meta]`), hiện section `#soPerOrderMetaWrap` — mỗi đơn 1 cụm input (NCC·Kiện·KG·HĐ·Giảm·Ship) + cụm "Đơn mới". `_renderPerOrderMeta`/`_readPerOrderMeta`. Submit lưu từng cụm qua `setOrderAdjustment` (cụm "Đơn mới" → newGid). CSS `.so-pm-*`.

**Refine (sau khi test):** sub-header `_groupMetaSubHeaderHtml` đổi sang **value-driven** (hiện field khi giá trị > 0, bỏ gate theo tab flags — Giảm=0 tự ẩn); cụm per-NCC trong Sửa lô **LUÔN hiện đủ 5 ô** (không gate flags) vì đó là nơi user nhập meta per-NCC. Tab flags chỉ còn ảnh hưởng ô meta CHUNG của form (tạo mới). Bump `so-order-app.js?v=20260617c`.

Bump `so-order.css` `?v=20260617b`.

**Verify (Playwright, localhost — ext n2store):** seed 2 đơn A1+b1 cùng lô 25/6; Sửa lô → 3 cụm (A1, b1, Đơn mới) đủ 5 ô, ô meta chung ẩn. Nhập A1{5KG,HĐ200k,Giảm10k,Ship20k} + b1{3KG,HĐ500k,Ship15k} → Lưu. **Sub-header**: `A1 · 5 KG · HĐ 200.000 · Giảm 10.000 · Ship 20.000`, `b1 · 3 KG · HĐ 500.000 · Ship 15.000` (Giảm 0 tự ẩn). **Lô header TỔNG**: `8 KG | HĐ 700.000 | Giảm 10.000 · Ship 35.000` (đúng tổng). Round-trip reopen đúng giá trị. **Migration** lô cũ 16/6: HĐ 666.5k/Giảm/Ship cấp lô → đơn đầu, hiện đúng sub-header. Cleanup sạch (rows 0, Kho 0).

**Status:** ✅ verified browser end-to-end. so-order (Web 2.0).

## 2026-06-16

### [delivery-report] Thêm thẻ "Tổng tiền hóa đơn" (headline) = Giao hàng thu tiền + Tổng trả trước ✅

**User:** "thêm 1 stat tổng tiền hóa đơn (Tổng số hóa đơn trong bộ lọc), Tổng tiền = Giao hàng thu tiền + Tổng trả trước".

**Fix:** stats bar nay 3 thẻ — thêm thẻ **"Tổng tiền hóa đơn"** đứng đầu (icon `fa-file-invoice-dollar` tím, id `drStatTotal*`):

- [index.html](delivery-report/index.html): chèn thẻ tổng trước thẻ "Giao hàng thu tiền".
- [delivery-report.js](delivery-report/js/delivery-report.js) `renderStats()`: `totalValue = SumCollectionAmount + SumAmountDeposit`; `totalCount = DeliveryReportState.allData.length` (tổng hóa đơn trong bộ lọc tìm kiếm — CÙNG phạm vi ngày với SumDeliveryReport, không đổi theo tab/scan để 3 thẻ đồng nhất).

**Lưu ý:** Tổng tiền theo định nghĩa user (COD amount + Deposit amount) — KHÁC `SumAmountTotal` của TPOS (COD+Deposit ≠ AmountTotal vì COD là full giá trị đơn COD, Deposit là đơn trả trước riêng). Bump `?v=20260616d`.

**Verify (Playwright, live nhijudy.store):** 3 thẻ — Tổng tiền hóa đơn 383 HĐ / 248.453.000, Giao hàng thu tiền 383 / 220.745.000, Tổng trả trước 67 / 27.708.000. Arithmetic check: COD+Deposit (220.745.000+27.708.000) === Total (248.453.000) ✓.

**Status:** ✅ Web 1.0 (delivery-report, PROD).

### [delivery-report] 2 thẻ thống kê lấy THẲNG từ TPOS SumDeliveryReport (qua worker proxy) ✅

**User:** "đổi trang sang dùng thẳng SumDeliveryReport, qua proxy Cloudflare worker không gọi thẳng TPOS" → "chỉ lấy 2 cột: tổng hóa đơn giao hàng thu tiền + tổng trả trước".

**Trước:** stats bar 5 thẻ (COD/Đã thanh toán/Trả hàng/Đang giao/Đối soát fail) **tự cộng client-side** từ list `Report/DeliveryReport`. "Tổng trả trước" (deposit) không có sẵn vì list không tính.

**Fix:** rút còn **2 thẻ** lấy số tổng hợp sẵn của TPOS `Report/OdataService.SumDeliveryReport` (proxy `${WORKER_URL}/api/odata/...`, KHÔNG gọi thẳng tomato.tpos.vn):

- [index.html](delivery-report/index.html): xóa 4 thẻ (Đã thanh toán/Trả hàng/Đang giao/Đối soát fail), giữ "Giao hàng thu tiền" + thêm "Tổng trả trước" (icon `fa-hand-holding-usd` xanh, id `drStatDeposit*`).
- [delivery-report.js](delivery-report/js/delivery-report.js): thêm `buildSumApiUrl()` + `fetchSumReport(token)` (set `DeliveryReportState.sumReport`); `fetchData()` fetch sum **song song** list, `await` trước render; `renderStats()` đọc thẳng từ sumReport thay vì cộng list. State thêm `sumReport`.

**Mapping** (đã verify live qua worker, HTTP 200): Giao hàng thu tiền = `SumQuantityCollectionOrder` / `SumCollectionAmount`; Tổng trả trước = `SumQuantityDeposit` / `SumAmountDeposit` (== `SumPrepayment`).

**Lưu ý:** 2 thẻ theo NGUYÊN khoảng ngày tìm kiếm (+Q) — KHÔNG đổi khi lọc carrier/tab/scan (đúng nghĩa "tổng" của TPOS, khác hành vi cũ là cộng theo view đã lọc). Lite mode vẫn ẩn cả `#drStatsBar` đến khi triple-click (không đổi).

**Verify (Playwright, live nhijudy.store):** worker proxy SumDeliveryReport 200 → Card1 377 Hóa đơn / 217.910.000, Card2 63 Hóa đơn / 25.658.000 (số khớp screenshot user, lệch nhẹ do data tăng trong ngày).

**Status:** ✅ Web 1.0 (delivery-report, PROD — chỉ đổi stats bar, không đụng DB/list).

### [web2-products][Kho SP] upsert/adjust-pending khớp + NCC → SP cùng tên KHÁC NCC KHÔNG gộp ✅

**User:** "test thử sao tên giống nhau nó gộp lại" → chọn **Tách theo NCC**.

**RCA (test Playwright xác nhận):** `upsert-pending` ([web2-products.js](render.com/routes/web2-products.js)) khớp SP theo `LOWER(name)` + variant — **KHÔNG tính supplier (NCC)**. Test: upsert 2 item cùng tên "TEST-MERGE-NCC" + biến thể "Đỏ" nhưng NCC khác (A1 qty3, b1 qty5) → `created:1, updated:1` → b1 GỘP vào SP A1 (`A1TESTMERGEDO` pending 8), mã `B1TESTMERGEDO` + NCC b1 bị bỏ. Nghịch với mã SP sinh theo prefix NCC (A1AODO ≠ B1AODO) + NCC per-row vừa làm.

**Fix:** thêm `supplier` (NCC) vào match key của CẢ `upsert-pending` VÀ `adjust-pending` (đối xứng — giảm pending phải trúng đúng SP theo NCC):

- Match: `name` + `variant` + `supplier`. Cùng tên+biến thể nhưng **KHÁC NCC → SP RIÊNG** (không match → INSERT mã prefix NCC riêng). **Cùng NCC → vẫn gộp** (dedup lưu nháp lại). NULL-supplier SP cũ được NCC đầu "claim" (ORDER BY ưu tiên exact-supplier) → tránh tạo trùng. Chỉ ràng buộc khi item CÓ supplier → item không NCC giữ hành vi cũ.
- Giữ nguyên pattern `FOR UPDATE LIMIT 1` (proven prod) + builder param động.

**Verify (Playwright, web2-api live `dep-d8ojiuu7r5hc73c4j8a0`):** (1) cross-NCC: cùng "TEST-MERGE-NCC2"+"Đỏ" NCC A1(3)/b1(5) → `created:2, updated:0` → 2 SP riêng (A1TESTMERGE2DO / B1TESTMERGE2DO). (2) same-NCC: re-upsert A1 qty2 → `updated:1`, pending 5 (gộp đúng). (3) adjust-pending b1 −2 → trúng B1 (5→3), A1 giữ 5 (đối xứng). Cleanup 2 SP sạch.

**Status:** ✅ verified live. web2-api / web2Db (Web 2.0). Khác NCC = SP riêng, cùng NCC vẫn gộp.

### [so-order] Sửa lô — NCC TÁCH RIÊNG mỗi dòng (lô = nguyên ngày giao, gồm nhiều NCC) ✅

**User:** "Sửa lô (nút bút chì) → sửa của nguyên ngày giao đó nên modal chỉnh sửa NCC phải tách ra → NCC A1 ở trên (ô 'Nhà cung cấp' chung) là sai."

**RCA:** Modal "Sửa lô" (`openShipmentEditAllRows`, mode `edit-shipment`) load TẤT CẢ dòng editable của 1 ngày giao — lô này có thể gồm NHIỀU NCC (A1, b1…). Nhưng modal dùng 1 ô "Nhà cung cấp" CHUNG lấy từ `rows[0].supplier`; lúc lưu mọi dòng nhận `sharedFields.supplier` → ÉP toàn bộ về 1 NCC (b1 bị đổi thành A1). NCC không tách per-row.

**Fix** ([so-order-app.js](so-order/js/so-order-app.js) + [index.html](so-order/index.html) + [css](so-order/css/so-order.css)):

- `_newModalRow`: thêm field `supplier` per-row.
- `modalRowHtml`: thêm cột "NCC" (sau STT) — input + dropdown dùng chung `attachSupplierPickerOnDemand` (gợi ý từ Ví NCC + "+ Tạo NCC").
- `renderModalRows`: mode `edit-shipment` → bật class `.so-show-ncc` (hiện cột NCC) + **ẩn ô "Nhà cung cấp" chung ở header** (gây hiểu nhầm cả lô 1 NCC). Mode khác (tạo mới / sửa 1 dòng) giữ ô chung, ẩn cột.
- `openShipmentEditAllRows`: prefill mỗi dòng `supplier: r.supplier`; `_mostCommonSupplier` = NCC mặc định cho SP mới thêm.
- Add-row handler: SP mới (edit-shipment) kế thừa NCC dòng cuối / mặc định, vẫn override được.
- Submit `edit-shipment`: dùng `r.supplier` PER-ROW (fallback ô chung ẩn nếu trống); ensure mỗi NCC vào Ví NCC (dedupe); `addedRows` carry NCC đã resolve → `syncRowsToKho` sinh mã đúng prefix. Bump `?v=20260616v` (js + css).

**Verify (Playwright, localhost):** mở Sửa lô 16/6 (3 dòng A1 nháp) → cột NCC hiện, header NCC visible, **ô NCC chung ẨN**, 3 input prefill "A1". Thêm SP → default "A1". Đổi SP mới → NCC "b1" + tên TEST-NCC-PERROW → Lưu → bảng: A1 giữ A1, dòng mới = **b1** (tách đúng). Mở lại modal → round-trip NCC đúng (A1/A1/A1/b1). Cleanup xoá test row. Create mode: cột NCC ẩn + ô chung hiện (không ảnh hưởng).

**Status:** ✅ verified browser. so-order (Web 2.0). NCC tách per-row khi sửa nguyên lô — không còn ép 1 NCC.

### [so-order][web2/products] Gợi ý biến thể từ Kho Biến Thể — KHÔNG dấu + theo token cuối khi build multi ✅

**User:** biến thể nhập vào lấy từ Kho Biến Thể; "d" → Đen/Đỏ, "den" → Đen (gõ không dấu vẫn ra). Lúc build "den / d" thì token "d" phải gợi ý Đỏ.

**RCA:** (1) so-order `showVariantSuggest` search TOÀN BỘ input ("den / ") thay vì token cuối → khi build multi không gợi ý được; (2) đã ẩn dropdown sớm theo `detect()` → đang gõ token chưa pick được; (3) products picker filter `.toLowerCase().includes()` = CÓ dấu → "den" không khớp "Đen". (`findByValue` của cache vốn đã khử dấu qua `_normalize`.)

**Fix:**

- [so-order-app.js](so-order/js/so-order-app.js) `showVariantSuggest`: search **token CUỐI sau "/"** (`findByValue` khử dấu sẵn → d→Đen/Đỏ, den→Đen, token rỗng "Đen / "→tất cả); **LUÔN hiện** dropdown (bỏ ẩn-theo-detect) để pick được token đang gõ; click suggestion → **append vào token cuối** ("Đen / " + Đỏ = "Đen / Đỏ") + update preview. Bump `?v=20260616u`.
- [web2-products-app.js](web2/products/js/web2-products-app.js) `_wireVariantPickerFor._show`: filter qua `cache._normalize` (khử dấu) → "den"→Đen, "m"→M. Bump `?v=20260616d`.

**Verify (Playwright):** so-order — "d"→[Đen,Đỏ,Xanh Dương], "den"→[Đen], "den / d"→token "d" gợi ý [Đen,Đỏ,…] (build được), "Đen / S / m"→[M,Xám] + preview [Đen/S, Đen/m]. products — "den"→[Đen], "m"→[M].

**Status:** ✅ so-order + web2/products (Web 2.0). Gợi ý 1 nguồn từ Kho Biến Thể, khử dấu, per-token.

### [web2/products][shared] Kho SP hỗ trợ nhập nhiều biến thể — Màu "Đen / Đỏ" × Size "S / M" → N SP (shared Web2VariantMulti) ✅

**User:** "hỗ trợ trong kho nữa → cấu hình thành shared dùng chung để tương lai các trang khác tham chiếu".

**Shared:** thêm `Web2VariantMulti.cartesian(colorsRaw, sizesRaw, sep)` vào [web2-variant-multi.js](web2/shared/web2-variant-multi.js) — tích Descartes 2 danh sách (mỗi ô split "/"), `sep` cấu hình (so-order " / " vs Kho SP ", "), dedupe. Module = NGUỒN DUY NHẤT, trang khác chỉ load script + gọi.

**Kho SP** [web2-products-app.js](web2/products/js/web2-products-app.js) + [index.html](web2/products/index.html) + [css](web2/products/css/web2-products.css): 2 ô Màu+Size nay nhận DANH SÁCH ("Đen / Đỏ"); picker gợi ý theo token CUỐI sau "/" + click append (build list). **Live preview** `#pmVariantMultiPreview` ("Tạo N SP biến thể: …"). `saveModal`: TẠO MỚI + cartesian>1 combo → `_bulkCreateVariants` (path riêng, KHÔNG đụng single-create optimistic): validate TỪNG token có trong Kho Biến Thể, sinh MÃ riêng mỗi combo (unique trong batch qua existingCodes tích luỹ + Web2ProductCode.suggest override color/size shortcode), create await-loop → reload + tổng kết. Edit 1 SP KHÔNG bulk.

**Verify (node + Playwright):** cartesian đúng (4 combo comma); Kho SP nhập Màu "Đen / Đỏ" × Size "L / M" → preview 4 chip → Lưu → **4 SP** mã KHOMM\*{DEN,DO}{L,M} variant "Đen, L"/… (shortcode đúng, mã unique). Cleanup sạch. Bump module `?v=20260616c` (cả products + so-order), products app `c`, css `mv`.

**Status:** ✅ verified browser. web2/products + shared (Web 2.0). so-order đã có từ trước; giờ Kho SP cũng có, qua CÙNG module shared.

### [so-order] Dropdown biến thể: hint nhập nhiều + biến thể tự do (hết "chưa có giá trị khớp" cụt) ✅

**User:** gõ "Đen d" → dropdown chỉ báo "Kho Biến Thể chưa có giá trị nào khớp" (cụt, không hướng dẫn). Muốn hỗ trợ nhập nhiều biến thể.

**Fix** [so-order-app.js](so-order/js/so-order-app.js) `showVariantSuggest`: (1) luôn prepend **hint** "Nhiều biến thể? Gõ Đen / S / M / L → tạo nhiều SP" (bấm → chèn " / " vào input, giữ focus); (2) đổi empty message thành "Dùng '<gõ>' làm biến thể TỰ DO, hoặc thêm vào Kho Biến Thể" (so-order cho phép variant tự do, không bắt buộc khớp kho). CSS `.so-variant-multi-hint` [so-order.css](so-order/css/so-order.css). Bump app `?v=20260616r`, css `s`.

**Verify (Playwright):** gõ "Đen d" → dropdown hiện hint + empty message mới. Multi-variant ("Đen / S / M") vẫn ẩn dropdown + hiện preview chip (đã làm trước).

**Status:** ✅ so-order (Web 2.0). (Tiếp: wire multi-variant vào Kho SP — user yêu cầu.)

### [so-order][shared] Nhập nhanh NHIỀU biến thể — "Đen / S / M / L / 28" → 4 SP (shared Web2VariantMulti) ✅

**User:** biến thể cho chọn nhiều + đồng bộ shared web2; variant = cặp màu+size; "Đen / S / M / L / 28" = 4 SP màu Đen 4 size; "M / Đỏ / Trắng / Đen" = 3 SP size M 3 màu; thông minh tự nhận màu/size.

**Build (qua workflow 5-agent map+design):**

- **Module shared** [web2/shared/web2-variant-multi.js](web2/shared/web2-variant-multi.js) `window.Web2VariantMulti` (load SAU web2-variants-cache): `classifyToken` (cache groupName TRƯỚC, mirror products `_isSizeGroup`; fallback `SIZE_RE`; còn lại = MÀU — vì SIZE_RE đã bắt chắc size, token lạ ⇒ tên màu), `parse`/`expand`/`detect`. Output chuẩn "Màu / Size". Cases: 1 anchor + list → expand; chỉ 1 loại → N variant; **cả 2 loại nhiều → cartesian** (cap `MAX_EXPAND=60`); 1+1 → single. Dedupe.
- **so-order**: `_explodeVariants(validRows)` — dòng MỚI (rowId==null) có variant multi → tách N addRow (copy name/giá/ảnh, share invoiceGroupId), wire ở create + edit-shipment submit. **Live preview** chip dưới ô variant (`_updateVariantMultiPreview` → "Tách N SP: …"). Multi-variant detect → ẩn dropdown pick-1 (khỏi che preview). Placeholder gợi ý. CSS chip [so-order.css](so-order/css/so-order.css).

**Verify (node unit + Playwright):** parser đúng cả 6 ví dụ (kể cả cache rỗng); UI: gõ "Đen / S / M / L / 28" → preview 4 chip + dropdown ẩn → Lưu → **4 dòng SP** Đen/S,Đen/M,Đen/L,Đen/28 (SL copy) + 4 SP kho mã HNMM\*DEN{S,M,L,28} (color+size shortcode đúng). Cleanup sạch (4 row + 4 kho product). Bump `web2-variant-multi.js?v=20260616b`, `so-order-app.js?v=20260616q`, css `p`.

**Đồng bộ:** module shared — trang web2 khác load script + gọi `Web2VariantMulti.expand()`. products (2-field strict), inline-edit (sửa 1 dòng), native-orders (auto) cố ý KHÔNG explode (xem design). Open: thứ tự output luôn màu-trước-size; cartesian là default cho 2×2.

**Status:** ✅ verified browser. so-order + shared (Web 2.0).

### [customer-hub] Double-click cột "Ví khách hàng" → xếp khách có công nợ lên đầu ✅

**User:** ở [customer-hub](customer-hub/index.html) (danh sách KH), "nhấp 2 lần ví khách hàng để đổ những đơn có công nợ lên đầu" — muốn bubble các KH có số dư ví ≠ 0 lên trên.

**Thiết kế:** sort TOÀN CỤC (không chỉ 20 dòng đã load) — route `/v2/customers/recent` **vốn đã LEFT JOIN `customer_wallets`** trả `balance/virtual_balance/real_balance`, nên thêm sort server-side là rẻ + đúng. `batch-summary` trả `total = balance + virtual_balance` (≡ biểu thức JOIN, frontend set `customer.balance = total`) → thứ tự sort khớp số hiển thị. Dùng **ABS(số dư) DESC** để gom cả dư có (+) lẫn dư nợ (−) lên đầu, số 0 chìm xuống.

**Backend** [customers.js](render.com/routes/v2/customers.js) `/recent`: thêm query param optional `sort`. `sort==='wallet'` → `ORDER BY ABS(COALESCE(w.balance,0)+COALESCE(w.virtual_balance,0)) DESC, <recent expr>, c.phone ASC` (tie-break ổn định cho phân trang). Whitelist (chỉ 2 chuỗi cố định) → không SQL injection. Mặc định byte-identical hành vi cũ. **Cần DEPLOY Render (web 1.0 api).**

**Shared** [api-service.js](shared/js/api-service.js): `getRecentCustomers(page, limit, sort='')` append `&sort=` khi truthy. Backward-compat (chỉ customer-hub gọi; render-data-manager chỉ liệt kê path).

**Frontend** [customer-search.js](customer-hub/js/modules/customer-search.js): `this.sortMode` (null | 'wallet'); `<th>` "Ví khách hàng" → dblclick toggle (id `wallet-col-header` + indicator Material Symbols `swap_vert`↔`keyboard_double_arrow_up`, `cursor-pointer`, `user-select:none` inline). Recent mode: reload page 1 (server sort toàn cục). Search mode: server không sort → `_sortByWallet` client-side (ABS desc) trong `renderResults` + re-render full ở loadMore. Tránh class Tailwind chưa build (`select-none/opacity-*`) → dùng inline style.

**Review fixes (adversarial workflow, 3 confirmed):** (1) [MED] thêm tie-break `c.id ASC` (PK) cuối ORDER BY cả 2 nhánh — `c.phone` KHÔNG unique trên `customers` + khối ABS=0 lớn → LIMIT/OFFSET có thể trùng/sót dòng khi cuộn. (2) [LOW] `wallet-updated` ở recent+wallet → `loadRecentCustomers()` (server re-sort) thay vì client re-render lệch. (3) [LOW] tạo KH (create + save-TPOS) khi wallet-sort bật → `renderResults` theo sort (KH mới dư 0 nằm cuối) thay vì `prependRow` ép lên đầu.

**Verify:** `node --check` cả 3 file OK · adversarial review workflow (backend SQL/backward-compat + frontend UX + data-consistency) → 3 fix đã áp. **End-to-end thật cần verify sau deploy Render** (data ví thật).

**Status:** ✅ code xong. Web 1.0 only (customer-hub + /v2/customers + /v2/wallets), không đụng web2.

### [orders-report][chat] Fix khung chat bắt NHẦM hội thoại Pancake khi SĐT trùng nhiều người ✅

**Bug (user báo):** bấm khách "Hoa Tuyết Trắng" (`0987616422`) ở orders-report → header đúng tên nhưng **đoạn chat + avatar lại là của "Thùy Trang"** (người khác). Gốc: SĐT đó nằm trong `recent_phone_numbers` của nhiều hội thoại khác nhau (khách dán cùng số liên hệ vào nhiều FB chat; Pancake search là full-text). Chuỗi resolve trong [tab1-chat-core.js](orders-report/js/tab1/tab1-chat-core.js) `_doFindAndLoadConversation` chọn `matched[0]` theo recency (Thùy Trang hoạt động gần hơn) — **không dùng TÊN/PSID đơn để phân biệt** — và chạy TRƯỚC tầng DB+name-search (tầng duy nhất xử lý homonym đúng).

**Fix (Khớp TÊN → PSID → picker, KHÔNG đổi control-flow):**

- Thêm helper `_pickBestConv(cands, {type,name,psid})` + `_strip`/`_bareName`/`_nameMatch` đầu hàm. >1 `from_psid` distinct (SĐT thật sự nhiều người) mới đổi hành vi; 1 người → trả `find(type)||[0]` **y hệt code cũ** (zero regression). Ưu tiên TÊN (chỉ khi khớp đúng 1 người) → PSID đơn → mơ hồ mà CÓ tên → `ambiguous` (để conv=null rơi xuống tầng DB+name + picker). Không tên lẫn psid → fallback `matched[0]` (giữ cũ).
- Áp `_pickBestConv` tại 3 điểm chọn phone-verified: PRIMARY phone-search, preferred-page, cross-page `phoneVerified`. PRIORITY 1 (direct fb-id từ DB `page_fb_ids`) thêm **verify TÊN** trước khi nhận (mapping DB có thể cũ/sai).
- Survivor stash `window._chatPhoneCandFallback` (reset đầu hàm, clear sau render): giữ candidate phone-verified cho picker phòng khi tầng DB+name null `_chatPickerCandidates` ở nhánh "không tìm thấy theo tên".

**Impact analysis:** đọc cả 5 caller `_findAndLoadConversation` (open/type-toggle/switch-page/repick/cross-page) + mọi consumer `currentChatPSID`/`currentConversationData`. type-toggle/switch-page TỐT HƠN (khóa đúng người qua psid/name thay vì recency); repick path riêng không đổi; gửi tin/quick-reply/realtime đọc state SAU resolve → đúng hơn. Picker handlers + khối DB+name [:1491] giữ nguyên.

**Verify:** node --check OK · unit test `_pickBestConv` 8/8 · browser (Playwright, localhost) module load OK (mọi global chat định nghĩa) · E2E mock đúng kịch bản bug (Thùy Trang recent hơn) → resolve **Hoa Tuyết Trắng** (psid A) ✅ · regression: SĐT 1 người → resolve sạch không picker ✅ · homonym psid không khớp → defer picker (không auto-pick) ✅. **End-to-end thật cần verify trên prod** (data Pancake thật của khách).

**Status:** ✅ code + test xong. Chỉ sửa orders-report (Web 1.0), không đụng web2/backend.

### [so-order] Nhóm NCC "Đã nhận" dồn xuống cuối lô (pending lên trên) ✅

**User:** "Nhận hàng rồi sẽ đưa xuống dưới" — nhóm đã nhận đủ nằm xen giữa các nhóm còn chờ → muốn nhóm đã nhận xuống cuối.

**Fix** [so-order-app.js](so-order/js/so-order-app.js): thêm `_orderReceivedGroupsLast(rows)` — partition theo NHÓM NCC (consecutive supplier+invoiceGroupId, giữ nguyên để rowspan ô NCC/Ảnh HĐ không vỡ), nhóm "đã nhận đủ" (mọi SP thật `status==='received'`) dồn cuối, nhóm còn pending giữ trên (stable). **Render-only, KHÔNG mutate storage** → áp dụng ngay cho data cũ + tự sắp lại sau mỗi lần nhận hàng (renderAll). `shipmentHtml` dùng `displayRows` cho cả `_computeRowSpans` + `rowHtml`; `rowHtml` nhận thêm param `rowsArr` để slice nút "Nhận hàng" theo đúng thứ tự hiển thị (không lệch idx).

**Verify (Playwright, HÀ NỘI):** thứ tự mới = A1-TEST(draft) · C2-SET/QU(draft) [TRÊN] → A1-ÁO · b1 · A1-SE (received) [DƯỚI]. NCC rowspan + zebra + nút nhận giữ đúng. Bump `so-order-app.js?v=20260616n`.

**Status:** ✅ so-order (Web 2.0). render-only, reversible.

### [delivery-report] phuoc = quyền bobo: bỏ chế độ 'full' đặc biệt → phuoc cũng 'lite' (ẩn dữ liệu, triple-click mới hiện) ✅

**User:** account `phuoc` thấy hết dữ liệu ẩn ngay (bảng + số liệu + nút hủy) — "dữ liệu ẩn phải click 3 lần vào các chữ, đây là trang đặc biệt". Chốt: **"acc phuoc giống quyền acc bobo đó"**.

**RCA:** commit `0b33d0b46` (22/05) build 2 chế độ: `userType==='phuoc-authenticated'` → `'full'` (Interface 1, tự thấy hết) · mọi user khác kể cả admin/bobo → `'lite'` (Interface 2, ẩn bảng/số liệu, triple-click tiêu đề mới hiện). Vì userType = `${username}-authenticated` nên CHỈ account username `phuoc` rơi vào nhánh full → thấy hết. bobo (username `bobo`) ở `'lite'` → phuoc khác bobo đúng chỗ này.

**Fix** [delivery-report.js](delivery-report/js/delivery-report.js): `detectInterfaceMode()` bỏ ngoại lệ `phuoc-authenticated`, **luôn trả `'lite'`** → phuoc giống bobo (ẩn mặc định, triple-click bung; trong Tra soát bắt đầu 2 tab, triple-click bung đủ 6 tab/5 cột). Giữ code nhánh `'full'` làm dead branch (không xoá — tránh regression trang PROD Web 1.0). Bump `delivery-report.js?v=20260616b`.

**Status:** ✅ delivery-report (Web 1.0). phuoc ⇔ bobo: cùng 'lite' + cùng quyền Tra soát (whitelist username đã thêm `phuoc` ở fix trước).

### [so-order][web2-products] Part B — Kho SP hover hiện giá GỐC ngoại tệ (origin_currency/origin_rate) ✅

**User spec (tiếp Part A):** Kho SP lưu VND; hover giá ở kho hiện giá gốc (vd CNY) đã mua. User chọn: build Part B, origin = lần mua gần nhất, để data cũ nguyên.

**Thiết kế:** Lưu `origin_currency` + `origin_rate` (KHÔNG lưu origin amount rời → tránh lệch khi sửa giá VND trực tiếp). Giá gốc suy ngược = `VND / origin_rate`, luôn nhất quán với giá canonical. Giá kho khoá tại lần INSERT (upsert-pending UPDATE không đổi giá) → set origin 1 lần lúc INSERT.

**Backend** [web2-products.js](render.com/routes/web2-products.js): (1) migration `ALTER ADD COLUMN IF NOT EXISTS origin_currency VARCHAR(8), origin_rate NUMERIC(14,4)`; (2) `mapRow` expose `originCurrency/originRate`; (3) upsert-pending INSERT lưu origin (NULL khi VND). **Cần DEPLOY web2-api.**

**Frontend so-order** [so-order-app.js](so-order/js/so-order-app.js): write paths gửi `originCurrency: tab.currency, originRate: tab.rate` — syncRowsToKho (lưu nháp) + \_receiveItems → 2 upsertPayload (nhận hàng + in tem).

**Frontend Kho SP** [web2-products-app.js](web2/products/js/web2-products-app.js) (bảng: title hover "Giá gốc: X CNY @ rate" + dotted-underline cue) + [web2-product-detail.js](web2/products/js/web2-product-detail.js) (panel: sub-line "≈ X CNY" dưới giá VND). Cache passthrough (không whitelist field). Bump `web2-products-app.js?v=20260616b`, `web2-product-detail.js?v=20260616b`.

**Backward-compat:** SP cũ origin_currency=NULL → không hover (hiện VND như cũ). ADD COLUMN IF NOT EXISTS idempotent. Web 1.0 không chạm.

**Deploy + Verify (2026-06-16):** deploy web2-api `dep-d8ohitreo5us73e9lbcg` LIVE (commit chứa migration). E2E Playwright tab CNY(3500): nhập SP cost 100/sell 200 CNY → Lưu Nháp → payload gửi `originCurrency:CNY, originRate:3500` + VND 350000/700000 → kho lưu `original_price=350000, price=700000, origin_currency=CNY, origin_rate=3500` (derive ngược = 100/200 CNY) → trang Kho SP hover title "Giá gốc: 100,00 CNY (nhập @ 3.500₫/CNY)" + "200,00 CNY". Cleanup: xoá SP test HCMM3 (force) + row so-order TEST-ORIGIN-CNY (edit-shipment modal, server-synced).

**Status:** ✅ Part B deployed + verified end-to-end. so-order + web2-products (Web 2.0).

### [docs] Sync overview + WEB2-PAGES-ANALYSIS cho money-model mới (rule 9) ✅

**Bối cảnh:** CLAUDE.md quy tắc 9 (BẮT BUỘC) — đổi luồng data quan trọng Web 2.0 → cập nhật CẢ overview sống + file phân tích.

**Files:**

- [docs/web2/WEB2-PAGES-ANALYSIS.md](docs/web2/WEB2-PAGES-ANALYSIS.md): thêm banner 💰 đầu mục 0 — nợ NCC khi NHẬN HÀNG, status không sửa tay, discount/ship per-đơn, 2 trang ví/công nợ khớp số.
- [web2/overview/index.html](web2/overview/index.html): sửa seed-note (Ví NCC realtime + chỉ tính khi nhận) · so-order article (Storage Firestore→Postgres C8, cột Trạng thái chỉ-đọc, meta "Model tiền") · supplier-debt article (nguồn `web2_so_order` Postgres + `web2_supplier_ledger`, meta "Phát sinh" received-based) · supplier-wallet article (bỏ nút Đồng bộ→Realtime SSE, Storage server ledger Postgres, meta "Model tiền").

**Status:** ✅ docs-only, không đụng code. Verify: article tags cân bằng 27/27.

### [delivery-report] FIX account `phuoc` không thấy nút "Tra soát" — gate theo USERNAME (ổn định) thay vì displayName ✅

**User:** account `phuoc` vào delivery-report không thấy nút "Tra soát". Làm rõ: **`phuoc` chính là "Phước đẹp trai" nhưng user đã đổi tên hiển thị**.

**RCA:** `canTraSoat()` ([delivery-report.js](delivery-report/js/delivery-report.js):82) cho phép admin / username∈`{bobo}` / displayName∈`{'Phước đẹp trai','bobo'}`. Account phuoc: không admin, username `phuoc` (không có trong set), displayName **đã bị đổi** → không còn khớp `'Phước đẹp trai'` → `canTraSoat()` false → nút `drBtnTraSoat` bị ẩn (init :221-224). Gate theo displayName mong manh vì user đổi tên được; username `phuoc` thì ổn định (userType = `phuoc-authenticated`).

**Fix:** thêm `'phuoc'` vào `TRA_SOAT_ALLOWED_USERNAMES` (set `{'bobo','phuoc'}`). Bump `delivery-report.js?v=20260616a`.

**Status:** ✅ delivery-report (Web 1.0). username là khoá ổn định, không phụ thuộc tên hiển thị.

### [so-order] FIX quy đổi giá khi LẤY SP từ Kho SP (VND) vào đơn theo tiền tệ tab (÷rate) — Part A logic 1-nguồn ✅

**User spec:** Kho SP = 1 NGUỒN, lưu VND. Tab CNY nhập đơn = CNY → vào kho ×rate→VND (ĐÃ ĐÚNG). Khi LẤY SP từ kho (VND) vào đơn ở tab nào → quy đổi ra tiền tab đó (÷rate). (+ hover kho hiện giá CNY gốc — Part B, cần schema, chờ user.)

**RCA (audit workflow 5-agent, verified):** WRITE path đã đúng (`syncRowsToKho` :3752 + receive :1630 đều ×tab.rate→VND). READ path SAI: `applySuggestionToRow` :3022-3023 gán THẲNG giá VND của kho làm giá tab-currency (comment cũ "để user tự convert thủ công"). Tab CNY rate 3500 → giá dòng gấp ~3500×; **nguy hiểm: Lưu Nháp lại ×rate → corrupt giá canonical kho 3500×**.

**Fix** [so-order-app.js](so-order/js/so-order-app.js): thêm helper `fromVnd(vnd, tab)` (VND÷rate; VND-tab giữ nguyên; JPY/KRW 0 lẻ, ngoại tệ khác 2 lẻ). `applySuggestionToRow` dùng `fromVnd(p.originalPrice/p.price, activeTab)` thay gán thẳng. Sửa comment.

**Verify (Playwright):** pick HCDAM2XLL (kho VND 773500/1673000) → tab CNY(3500): Giá Nhập **221**, Giá Bán **478** (đúng ÷3500, khớp ảnh user) · tab HÀ NỘI(VND): **773500/1673000** giữ nguyên. Bump `so-order-app.js?v=20260616k`.

**Còn lại (Part B — chờ user quyết):** hover giá kho hiện CNY gốc cần thêm cột `origin_currency/origin_price/origin_rate` vào `web2_products` (migration + deploy Render) + write gửi origin + UI hover Kho SP. Có fork thiết kế (SP mua từ nhiều tab khác currency → giữ origin nào) + data kho cũ có thể đã corrupt (cân nhắc wipe — beta).

**Status:** ✅ Part A verified browser. so-order (Web 2.0).

### [so-order][supplier-debt][supplier-wallet] Money-model: status auto + nợ NCC khi NHẬN HÀNG + discount/ship per-đơn ✅

User (4 yêu cầu): (1) trạng thái KHÔNG cho đổi tay → "Đã Đặt"/ordered hết tác dụng → **nợ NCC phát sinh khi NHẬN HÀNG**; (2) giảm giá/phí ship là của **riêng từng đơn**, footer = tổng ngày giao; (3) supplier-wallet realtime + **discount/ship tính vào nợ** (tất cả nguồn tiền); (4) bỏ luôn ô "Trạng thái" trong modal. Plan qua workflow 4-agent (map+adversarial). User chốt: **nhận 1 phần bill theo SỐ ĐÃ NHẬN thực**.

**Stage 1 — status không đổi tay** [so-order-app.js](so-order/js/so-order-app.js)+[index.html](so-order/index.html)+[css](so-order/css/so-order.css): bỏ `'status'` khỏi `INLINE_EDIT_FIELDS` (hết double-click sửa) + status LUÔN render pill (kể cả bulk-edit) + **bỏ ô `<select name=status>`** trong modal + bỏ `form.elements.status` writes + `sharedFields` bỏ status (tạo→addRow default 'draft', sửa→giữ nguyên). `STATUS_LABELS` bỏ `ordered`, thêm `partial_received:'Nhận 1 phần'`. Import map `ordered/dadat→draft`. Normalize legacy `ordered→draft` ([so-order-storage.js](so-order/js/so-order-storage.js)). CSS pill partial (vàng).

**Stage 2 — persist received-qty**: `confirmReceiveFromModal` ghi `qtyReceived` (luỹ kế) lên row ngoài `status` → nợ bill đúng phần đã nhận cho `partial_received`.

**Stage 3 — discount/ship PER-ĐƠN**: model `sh.orderAdjustments = {[invoiceGroupId]:{discount,shipping}}` (currency tab) thay `sh.discount`/`sh.shipping`. Storage: `setOrderAdjustment`/`getOrderAdjustment`/`getShipmentAdjustTotals` + normalize migrate legacy→đơn đầu + init map. App: create/edit gọi `setOrderAdjustment(invoiceGroupId)`; `_applyShipMetaUi` populate theo `editingInvoiceGroupId`; **header pill = Σ đơn** (`getShipmentAdjustTotals`); **footer = Σ mọi lô × rate→VND, readonly** (bỏ `tab.footer` thủ công + `wireFooterInputs` readonly). 1 đơn = 1 NCC (modal 1 ô NCC).

**Stage 4 — nợ = receive-based + gồm discount/ship** [supplier-debt-app.js](web2/supplier-debt/js/supplier-debt-app.js)+[supplier-wallet-app.js](web2/supplier-wallet/js/supplier-wallet-app.js): filter chỉ `received`/`partial_received` (bỏ `ordered`/`draft`/`cancelled`); qty_bill: received→qty đặt, partial→`min(qtyReceived,qty)`; **net/đơn = Σ(cost×qty×rate) − giảm giá + phí ship** (áp 1 lần/đơn, gán thẳng NCC, bucket theo ngày lô ở supplier-debt). Cả 2 page đếm cùng tập rows → totalPurchased (Ví) khớp debit (Báo cáo).

Verify browser: modal không còn ô trạng thái + footer readonly ✓; tạo đơn discount 20k/ship 10k (tab CNY) → footer 70M/35M (×3500) + header pill "Giảm 20.000 CNY · Ship 10.000 CNY" ✓; supplier-wallet receive-based → A1 Tổng mua 1.510.500 / b1 4.000.000 (có đơn đã nhận), NCC chưa nhận = 0, đơn draft KHÔNG tính ✓. node --check 4/4. Bump so-order `?v=20260616j`, supplier-debt/wallet `?v=20260616b`.

### [so-order] Nền bảng xen kẽ theo NHÓM NCC/đơn (thay zebra :nth-child lệch nhóm) ✅

**User:** background bảng chia phải đúng màu — nhóm này trắng, nhóm kế nhạt, xen kẽ → tăng tương phản đọc dữ liệu từng khối. (Hiện tại random: 1 nhóm trắng, nhóm kế nhạt, nhóm kế nữa trắng nhưng không khớp ranh giới nhóm.)

**RCA:** Zebra cũ `.so-data-row:nth-child(even)` tô theo TỪNG ROW. Nhưng `#soTableBody` xen cả row `.so-shipment-head` + `.so-shipment-colhead` giữa các data row → parity của data row lệch so với ranh giới nhóm NCC → trông random (nhóm 2 dòng thì 1 trắng 1 nhạt).

**Fix:**

1. [so-order-app.js](so-order/js/so-order-app.js) `_computeRowSpans`: thêm `nccParity` (0/1) luân phiên theo từng NHÓM NCC (cùng supplier + invoiceGroup — đúng đơn vị rowspan ô NCC). `rowHtml`: nhóm lẻ → class `.so-grp-alt` trên `<tr>`.
2. [so-order.css](so-order/css/so-order.css): bỏ rule `:nth-child(even)`; thêm `.so-data-row.so-grp-alt > td { background:#e9eef4 }` (nhóm chẵn giữ trắng #fff). Ô gộp NCC/Ảnh HĐ trong nhóm lẻ tô gradient cùng tông. Hover nổi hơn nền nhóm.

**Verify (Playwright, view mode):** A1(1-2)=trắng · A1/TEST-INV(3)=nhạt · b1(4-5)=trắng · C2(6-7)=nhạt · SE(8)=trắng — đúng spec user, mỗi khối tách rõ. (Edit mode: ô editable giữ highlight kem #fefce8 — visual riêng của edit, không đụng.)

Bump `so-order.css` + `so-order-app.js` `?v=20260616h`.

**Status:** ✅ verified browser. so-order (Web 2.0 module).

### [orders-report][render] Strip "Khách chưa trả lời": bỏ avatar + ô check "đã kiểm tra/đã bán" (đồng bộ mọi máy theo chiến dịch) ✅

**User:** "(1) bỏ avatar ở thanh chưa đọc; (2) thêm ô check (cả ở thanh lẫn dòng Tag XL trên) đánh dấu KH đã bán/đã kiểm tra → không vào thanh nữa khi có tin mới (theo chiến dịch hiện tại); đang trong thanh thì tick là ẩn luôn." → cờ riêng (không đụng tag), đồng bộ server mọi máy.

- **Server** [render.com/routes/realtime.js](render.com/routes/realtime.js) + bảng `checked_customers` (boot migration [server.js](render.com/server.js), UNIQUE(campaign_key,psid)): `GET/POST/DELETE /api/realtime/checked-customers` (parameterized, có cap độ dài). Mỗi mutation broadcast SSE topic `checked_customers` qua `req.app.locals.realtimeSseNotify` (Web 1.0 hub).
- **Client store** [tab1-checked-customers.js](orders-report/js/tab1/tab1-checked-customers.js) `window.CheckedCustomers`: scope theo `campaignManager.activeCampaignId`; `isChecked/check/uncheck/toggle` optimistic + rollback (guard đổi chiến dịch giữa chừng); SSE subscribe `checked_customers` (apply trực tiếp add/remove); poll 2s đổi chiến dịch → reload; phát event `n2s:checkedCustomersChanged`.
- **Strip** [tab1-unread-messages-strip.js](orders-report/js/tab1/tab1-unread-messages-strip.js): bỏ avatar; `compute()` skip KH `CheckedCustomers.isChecked` (ẩn cả khi có tin mới); mỗi ô có `<button.ucs-cell__check>` đánh dấu. **Đổi inline onclick → data-\* + 1 delegated listener trên host** (hết rủi ro breakout chuỗi; nút check keyboard-accessible). Re-render khi `n2s:checkedCustomersChanged`.
- **Inline editor** [tab1-tagxl-inline.js](orders-report/js/tab1/tab1-tagxl-inline.js): ô check trước STT (toggle), gắn onchange bằng addEventListener (không interpolation); đồng bộ trạng thái qua event. CSS check ở cả 2 file.
- Bump: checked-customers `?v=20260616a`, strip js/css `?v=20260616c`, editor js `?v=20260616c` css `?v=20260616b`.

**Review (code-reviewer agent):** 0 CRITICAL; đã fix HIGH: (a) XSS-prone inline-JS interpolation → data-attr+delegated; (b) rollback sai chiến dịch → guard `_getCampaign()===campaign`; (c) a11y `role=checkbox` thiếu keyboard → dùng `<button>`; (d) cap độ dài campaign/psid server.

**Verify (Playwright localhost):** strip 0 avatar, 3 nút check, data-attr đủ; click nút check→`check()` (không mở chat), click ô→`openFromStrip` (args đúng); filter ẩn KH checked (4→3) + re-render; editor có ô check + onchange→`toggle` đúng psid. `node --check` 4 file PASS.

**Deploy:** server qua Render (`n2store-tpos-pancake`); client qua GH Pages. ⏳ verify endpoint prod (throwaway keys) sau deploy.

### [web2/supplier-wallet] FIX số liệu NCC nhấp nháy rồi về 0₫ sau khi load (post-Sync render đè 0) + debug logs ✅

**User:** "mới vào trang nó ra dữ liệu ở đâu đó xong đề dữ liệu khác lên" → nghi sort. Yêu cầu thêm console.log + browser test debug.

**Debug:** Thêm instrumentation `_dbg()` (gate `window.SW_DEBUG`, mirror `window.__swDebugLog` để browser-test đọc lại sau reload) vào init/loadAndRender/renderList/Sync. Browser test (Playwright session) đọc trace:

- render #1 (`loadAndRender:init`): 8 NCC số THẬT — HƯƠNG CHÂU 24.619.000, HÀ NỘI 12.201.000, A1 bal 467.600… (sort balance-desc đúng).
- render #2 (`init:post-sync-reload`): **TẤT CẢ bal=0, tot=0** ← thủ phạm, không phải sort.

**RCA:** `init()` chạy `loadAndRender()` (aggregate Sổ Order → `totalPurchased` thật → render #1 đúng), rồi `Sync.init()` kéo **ledger server** (chỉ lưu paid/returned/balance, KHÔNG có `totalPurchased` vì nó DERIVE từ Sổ Order) ghi đè storage → `walletState = await load()` đọc lại ledger có totalPurchased=0 → `renderList()` **trần** (không re-aggregate) → đè 0₫ lên số thật. (Path SSE ledger-reload đã đúng vì gọi `loadAndRender`; chỉ path init sai.)

**Fix** [supplier-wallet-app.js](web2/supplier-wallet/js/supplier-wallet-app.js): sau post-Sync reload (và trong remote callback) → re-merge `suppliers` aggregation (đã có trong RAM) vào walletState mới trước khi render (`mergeAggregation` + save nếu mutated). Verified: render #2 giờ GIỮ số thật, header "Công nợ: 50.895.100đ", không còn về 0.

**Lưu ý:** debug logs `[SW-DEBUG]` còn để (gate `window.SW_DEBUG`, mặc định on) cho user verify — sẽ gỡ sau khi xác nhận (grep `SW-DEBUG`). Bump `supplier-wallet-app.js?v=20260616dbg3`.

**Status:** ✅ fix + verified browser. Web 2.0 (supplier-wallet).

### [so-order] FIX checkbox "Hiện thông tin lô" (Cài đặt tab) không hiện trạng thái đã chọn ✅

**User:** "đâu có checkbox hình 1 mà hình 2 nó hiện?" — modal Cài đặt tab hiện 6 checkbox đều TRỐNG, nhưng modal Tạo Đơn vẫn hiện ETA + Số Kiện → tưởng lệch state.

**RCA:** State ĐÚNG (`shipMetaFields.eta=true, caseCount=true`, verified `cb.checked=true`). Bug thuần CSS: `<fieldset class="so-field so-shipmeta-fieldset">` dính rule chung `.so-field input { appearance: none; border-radius:8px; padding:8px 10px }` → **nuốt checkmark native** của checkbox; mà `accent-color` vô hiệu khi `appearance:none` và KHÔNG có style `:checked` → checked nhìn y hệt unchecked (ô rounded trống). Vì vậy ETA/Số Kiện thực ra ĐANG checked nhưng không thấy.

**Fix** [so-order.css](so-order/css/so-order.css): vẽ custom checkbox cho `.so-shipmeta-fieldset input[type=checkbox]` (cả master "Chọn tất cả" + 6 con): `appearance:none` 18×18 bo 6px, `:checked` → nền `#0068ff` + checkmark SVG trắng, `:indeterminate` → nền xanh + dash trắng (master khi chọn 1 phần), `:hover`/`:focus-visible` ring. Bump `so-order.css?v=20260616f`.

**Verify (Playwright):** mở Cài đặt tab HÀ NỘI → ETA + Số Kiện nền `rgb(0,104,255)` + checkmark, 4 ô còn lại trống, master `indeterminate=true` (2/6) — khớp đúng modal Tạo Đơn.

**Status:** ✅ CSS-only. so-order (Web 2.0 module). `.so-field-check` (legacy, dead — không dùng trong HTML) để nguyên.

### [web2/supplier-wallet] Bỏ nút "Đồng bộ" → realtime tự động (kho NCC nguồn cho mọi trang) ✅

User: "trang này là kho NCC để tất cả trang khác tham chiếu nên sẽ có dữ liệu realtime" → bỏ nút "Đồng bộ" thủ công.

- Bỏ nút `#swRefreshBtn` ("Đồng bộ") + handler trong `wireUi` (sẽ throw vì element mất). Thay bằng pill "Realtime" (`.sw-live-pill`, icon radio pulse, respect reduced-motion).
- Trang ĐÃ có SSE realtime sẵn (`_sseConnect`): `web2:wallet:*` (SePay deposit), `web2:products` (stock/pending), `web2:supplier-wallet` (ledger pay/return/tạo NCC từ máy khác). **Thêm `web2:so-order`** — đổi status đơn (draft→"Đã Đặt"/nhận/xóa) CHỈ fire `web2:so-order` (KHÔNG fire `web2:products`) → trước đây "Tổng mua"/danh sách NCC không tươi nếu chỉ đổi status → giờ aggregation reload realtime.
- [supplier-wallet/index.html](web2/supplier-wallet/index.html) + [supplier-wallet-app.js](web2/supplier-wallet/js/supplier-wallet-app.js) + [css](web2/supplier-wallet/css/supplier-wallet.css). Bump `?v=20260616a`. Verified browser: nút mất, pill "Realtime" hiện, 8 NCC load, Web2SSE loaded, 0 lỗi.

### [so-order] Modal Tạo Đơn Hàng — đồng bộ bố cục form + làm đẹp table (CSS-only) ✅

**User:** "giao diện hình 2 nó không đồng bộ, đồng đều 1 bố cục… nghiên cứu github các css phần table xem có làm đẹp hơn nhưng vẫn đủ thông tin."

**RCA bố cục lệch:** Hàng field trên cùng (`.so-form-row-top`) là flex-wrap với (a) ô "Ảnh hóa đơn" = dropzone `.so-img-cell-v2` xếp DỌC cao ~64px → vống hẳn lên so với input 40px; (b) label wrap số dòng khác nhau (vd "Ảnh hóa đơn (cả đơn…)", "ETA giao hàng (dự kiến)") → input đứng so le; (c) flex-basis ragged (110/140/210/260px) → cột không đều.

**Fix** [so-order.css](so-order/css/so-order.css) (không đổi JS/HTML behavior):

1. **Đồng đều chiều cao**: `.so-form-label { min-height:34px }` (reserve ~2 dòng) + `align-items:flex-end` → mọi control 40px bottom-align thành 1 hàng phẳng (verified: 5 ô row-top cùng `bottom`).
2. **Ảnh hóa đơn compact 40px ngang**: override `.so-cell-invoice-img .so-img-cell-v2` → `flex-direction:row; height:40px; box-sizing:border-box`. State đã-có-ảnh: thumb nhỏ (≤28×44) + nút xóa inline, ẩn label/URL. Bằng đúng chiều cao input, hết phá hàng (verified empty + has-image đều 40px, bottom-align input Ngày tạo).
3. **Cột đều**: cell `flex:1 1 160px`, narrow `1 1 120px`, NCC `2 1 240px` → grow lấp kín hàng.
4. **Table đẹp hơn** (theo convention GitHub Primer / Tailwind UI data-table, giữ NGUYÊN đủ cột/thông tin): `font-variant-numeric:tabular-nums` (số thẳng cột), header slate-50 `#f8fafc` + label muted `#64748b` letter-spacing nhẹ, row hover `#f8fafc`.

Bump `so-order.css?v=20260616e`. Verified Playwright: modal mở, đo bounding rect — tất cả control row-top cùng baseline.

**Status:** ✅ CSS-only. so-order (Web 2.0 module).

### [render][orders-report] FIX GỐC sai múi giờ pending_customers (server emit ISO-UTC) — strip báo trễ 7h ✅

**User:** sau fix client vẫn "nguyên như cũ" — khách mới nhắn báo trễ 7h.

**RCA (đo thực tế):** cột `pending_customers.last_message_time` kiểu **`TIMESTAMP` (no tz)**, INSERT bằng `NOW()` → lưu **giờ UTC dạng naive** (vd `08:49`). Node pg driver trên Render (TZ=Asia/Saigon +7) đọc naive đó NHẦM thành +7 → API serialize `"2026-06-16 08:49:02+07:00"` = **01:49 UTC** = lệch −7h so với thực (now 08:49 UTC). ⇒ Client parse "đúng" chuỗi sai → strip 7h. **Fix client không cứu được vì data sai từ nguồn.** (Verify: raw `08:49:02+07:00` vs now `08:49:58Z` — wall-clock trùng giờ UTC nhưng bị gắn +07:00.)

**Fix server** [render.com/routes/realtime.js](render.com/routes/realtime.js) (hàm `upsertPendingCustomer` + GET `/pending-customers`, dùng chung cả route lẫn server-WS `server.js`):

- GET emit ISO-UTC tường minh: `to_char(last_message_time, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_message_time` → client nhận `…Z` parse đúng instant (cả client cũ lẫn mới).
- Write tất định: `NOW()` → `(NOW() AT TIME ZONE 'UTC')` (4 chỗ) → luôn lưu UTC wall-clock bất kể session TZ.

**Deploy:** Render auto-deploy `n2store-tpos-pancake` trên push (KHÁC GH Pages). Sau deploy verify: `curl …/pending-customers` → `last_message_time` dạng `...Z` & khớp giờ thực. Client `_n2sParseMsgTime` (commit trước) vẫn cần cho path realtime WS (Pancake naive no-Z).

**Status:** ✅ code. ⏳ chờ Render deploy để xác nhận trên web.

### [supplier-wallet] FIX nút Tạo NCC / Đồng bộ / Trả hàng / Ghi thanh toán hiện như nút browser mặc định (thiếu class `btn` base) ✅

**User:** "nút hình 2, hình 3 chưa có css" — "Ghi thanh toán" + "Đồng bộ" render như nút macOS mặc định (gradient xám, viền bevel), không theo theme Web 2.0.

**RCA:** Cấu trúc nút trong [supplier-wallet/index.html](web2/supplier-wallet/index.html) dùng `class="btn-primary"` / `class="btn-secondary"` **trần** (10 nút). Trong `web2-theme.css`, structural styling (display:inline-flex, padding, border-width, border-radius) nằm ở base `.btn`; còn `.btn-primary`/`.btn-secondary` CHỈ override màu (background/color/border-color). Thiếu base `.btn` → nút mất padding/border/radius → fallback về native button chrome.

**Fix:** Thêm base `btn` vào cả 10 nút → `class="btn btn-primary"` / `class="btn btn-secondary"` (đúng convention các trang web2 khác: purchase-refund, reconcile, supplier-debt…). Không đổi CSS.

**Verify (Playwright localhost:8080):** computed styles — header `Tạo NCC` (btn-primary) = `linear-gradient(#2a96ff→#0068ff)` + white text, radius 9px, padding 5px 10px, inline-flex; `Đồng bộ` (btn-secondary) = bg #fff + border `#e6e9ef` + radius 9px. Modal `Trả hàng`/`Ghi thanh toán` cũng đúng theme. Screenshot xác nhận hết native gray gradient.

**Status:** ✅ HTML-only, no CSS change. Web 2.0 (supplier-wallet).

### [so-order] 3 fix modal Tạo Đơn Hàng: dropdown bị che + tách checkbox thông tin lô + ảnh hóa đơn cấp đơn ✅

1. **Dropdown gợi ý SP + picker biến thể bị che (sửa triệt để)** [so-order-app.js](so-order/js/so-order-app.js) + [so-order.css](so-order/css/so-order.css): redo hẳn — dropdown render TRỰC TIẾP vào `<body>` (portal) + `position:fixed` neo theo input rect (`_getFloatPanel`/`_anchorFloatPanel`/`_bindModalScrollCloseDropdowns` reflow). Gốc bug: `.so-modal-body-v2` có ĐỒNG THỜI `overflow:auto` (clip absolute) VÀ `contain: layout style paint` (phá fixed-coords) → dropdown đặt TRONG modal body luôn dính 1 trong 2. Con của body → không ancestor nào contain/clip. max-height cap theo chỗ trống thực → list tự scroll. Bỏ per-row `.so-suggest-dropdown`/`.so-variant-dropdown`. Class `.so-float-dropdown` z-index 100000. Verified browser: inBody=true, fixed, bottom trong viewport, không cắt.
2. **Tách checkbox "Hiện thông tin lô" → 6 checkbox riêng** (ETA/Đợt/Số Kiện/KG/Tiền HĐ/Tiền tệ) + master "Chọn tất cả". Data model `tab.shipMetaFields {key:bool}` (storage normalize backfill từ `showShipMeta` gộp cho tab cũ; addTab/updateTab persist). `_applyShipMetaUi` ẩn/hiện TỪNG `.so-ship-adv[data-ship-field]`. `SHIP_META_FIELDS` const + `_shipMetaFlags`. Verified: lưu ETA+Số Kiện → reopen persist đúng → modal chỉ hiện 2 field đó.
3. **Ảnh hóa đơn = của CẢ ĐƠN, không phải từng SP** [so-order-app.js](so-order/js/so-order-app.js): bỏ cột "Hình ảnh hóa đơn" per-row trong modal → 1 ô ở header (`#soOrderInvoiceImageCell`, cạnh Ngày tạo). State `modalInvoiceImage` đổ xuống MỌI row khi set/lưu (`_setOrderInvoiceImage`); row mới kế thừa qua `_newModalRow`. Submit path không đổi (rows vẫn mang `invoiceImage` → merged cell rowspan ở bảng chính). Verified E2E: set URL → submit → ảnh lưu order-wide + render ở cột Ảnh Hóa Đơn bảng chính.

Bump `?v=20260616d`. Test order TEST-INV-ORDER đã xoá sạch khỏi server sau verify.

### [orders-report] FIX múi giờ strip "Khách chưa trả lời" — khách mới nhắn báo trễ 7h ✅

**User:** "thời gian đang lấy sai múi giờ — khách mới nhắn vài chục phút mà báo trễ 7h."

**RCA:** Thời gian từ **realtime WS (Pancake)** = UTC **KHÔNG có hậu tố `Z`** (vd `2026-06-16T08:03:41`). `new Date(s)` trên máy GMT+7 hiểu nhầm là giờ LOCAL → epoch sớm hơn thực 7h → `waitedMs = now - ts` dư đúng ~7h (CLAUDE.md §10 bẫy a). Path server-fetch `/pending-customers` lại CÓ offset `+07:00` nên parse đúng → chỉ khách mới (đến qua WS) bị lệch.

**Fix** [new-messages-notifier.js](orders-report/js/chat/new-messages-notifier.js): thêm `_parseMsgTime(v)` — space→`T`, cắt micro/nano về ms, **thêm `Z` nếu chuỗi chưa có timezone** (Z hoặc ±HH:MM); chuỗi đã có offset giữ nguyên. Dùng trong `onNewConversationEvent` (event.timestamp/updated_at) + `setPendingCustomers`; expose `window._n2sParseMsgTime`. [tab1-init.js](orders-report/js/tab1/tab1-init.js) `_fetchOfflinePendingCustomers` dùng helper cho `last_message_time`. Bump notifier+init `?v=20260616c`.

**Verify:** node test 4 format (WS no-Z, no-Z+micro, +07:00, đã-Z) → đều ra wait đúng 30'. Browser (Playwright): bắn `onNewConversationEvent` timestamp no-Z 5' trước → strip `waitedMin=5`, `late=false` (trước fix ~7h05). `node --check` PASS.

**Status:** ✅ code + browser test OK. Web 1.0 (orders-report).

### [orders-report] FIX inline Tag XL editor không cập nhật khi gắn tag (sync qua ProcessingTagState) ✅

**User:** "gán tag đã thay đổi thực tế dưới đơn hàng nhưng dòng gắn tag phía trên (inline editor) không cập nhật theo, luôn giữ nguyên ban đầu."

**RCA:** Bản đầu wrap `window._ptagRefreshRow` để re-render editor, NHƯNG code nội bộ tab1-processing-tags.js gọi **LOCAL** `_ptagRefreshRow(orderCode)` (không qua `window.`) → wrap không bao giờ chạy → editor stale.

**Fix** [tab1-tagxl-inline.js](orders-report/js/tab1/tab1-tagxl-inline.js): mọi mutation đều đi qua `ProcessingTagState.setOrderData/updateOrder/removeOrder`, và `window.ProcessingTagState` **CÙNG object** với ref nội bộ (export L7139). → Override 3 method này trên object → caller nội bộ lẫn ngoài đều chạy qua → khi `key===currentCode` gọi `scheduleRerender()` (debounce 120ms) re-render editor. Bỏ wrap `_ptagRefreshRow` vô dụng. Bump `tab1-tagxl-inline.js?v=20260616b`.

**Verify (Playwright localhost):** mở editor từ thanh (code 260602153, chips "BÁN HÀNG") → `setOrderData` thêm flag in-memory → editor tự đổi thành "BÁN HÀNG | TEST SYNC" → restore sạch. `PTS.__tagxlWrapped=true`. (Test in-memory, KHÔNG mutate/persist data thật.) `node --check` PASS.

**Status:** ✅ code + browser test OK. Web 1.0 (orders-report).

### [orders-report] Strip "Khách chưa trả lời": avatar Pancake + fix chat header "Khách hàng" ✅

**User:** "(1) cho hình lấy dữ liệu khách unread từ pancake như cột tin nhắn đang lấy; (2) mở chat từ thanh sao không thấy tên khách hàng mà ghi 'Khách hàng'."

- **Avatar** [tab1-unread-messages-strip.js](orders-report/js/tab1/tab1-unread-messages-strip.js) `buildCell`: thêm `<img class="ucs-cell__avatar">` dùng đúng proxy cột Khách hàng: `…/api/fb-avatar?id=<psid>&page=<pageId>` (psid/pageId gốc Pancake sẵn trong pending), `loading=lazy` + `onerror` ẩn. CSS [.ucs-cell\_\_avatar](orders-report/css/tab1-unread-messages-strip.css) tròn 18px. Bump strip js/css `?v=20260616b`.
- **Fix tên/SĐT "Khách hàng"** (RCA): [openChatModal](orders-report/js/tab1/tab1-chat-core.js#L838) lấy tên+SĐT từ **DOM dòng** `tr[data-order-id]`. Mở chat từ thanh cho đơn NGOÀI vùng hiển thị (virtual-scroll/bị lọc) → `orderRow=null` → `currentCustomerName=''` → header "Khách hàng" + SĐT rỗng. Thêm **fallback**: nếu rỗng → lấy `OrderStore.get(id)` (fallback `allData.find`) → `order.Name` + `order.Telephone` (đúng field cột Khách hàng dùng). Bump chat-core `?v=20260616a`.

**Verify (Playwright localhost, campaign T6 531 đơn):** 25 ô strip → 25 avatar (0 lỗi onerror, blob-cached); click ô "Mong Duy Nguyen" (row KHÔNG có trong DOM, `firstOrderRowInDom:false`) → `currentCustomerName="Mong Duy Nguyen"`, `currentChatPhone="0334167771"`, header hiện đúng tên (trước fix = "Khách hàng"). `node --check` PASS.

**Status:** ✅ code + browser test OK. Web 1.0 (orders-report).

### [web2] NCC 1 nguồn duy nhất — products + purchase-refund + supplier-debt dùng Web2SuppliersCache ✅

User: 3 trang dùng dữ liệu NCC (products, purchase-refund, supplier-debt) → đưa hết về nguồn chung supplier-wallet. Nguồn chung sẵn có = `window.Web2SuppliersCache` (`web2/shared/web2-suppliers-cache.js`) → GET/POST `/api/web2-supplier-wallet/suppliers` (bảng `web2_supplier_meta` = trang Ví NCC), realtime SSE `web2:supplier-wallet`.

- **products** [web2-products-app.js](web2/products/js/web2-products-app.js): NCC dropdown `#pmSupplier` trước lấy từ **tab Sổ Order** (`loadSuppliersFromSoOrder` → Web2SoOrder tab labels) → đổi sang `Web2SuppliersCache.getNames()`. Init cache + subscribe SSE → dropdown tự refresh khi NCC đổi ở trang khác. Label "(chọn từ tab Sổ Order)" → "(từ Ví NCC)". NCC name vẫn drive prefix mã SP (HÀ NỘI→HN, A1→A1). Load `web2-suppliers-cache.js`.
- **purchase-refund** [purchase-refund-app.js](web2/purchase-refund/js/purchase-refund-app.js): form thủ công "Tên NCC" thêm `<datalist>` autocomplete từ `Web2SuppliersCache.getNames()`; submit gọi `ensure(name)` (idempotent) → NCC gõ mới vào nguồn chung. Quick-refund (picker so-order) giữ nguyên — NCC từ ngữ cảnh mua hàng là đúng.
- **supplier-debt** [supplier-debt-app.js](web2/supplier-debt/js/supplier-debt-app.js): đã tạo/đọc qua `/api/web2-supplier-wallet` (cùng backend nguồn chung). Thêm `<datalist>` autocomplete tên NCC khi tạo, lấy từ `Web2SuppliersCache`.

Bump `?v=20260616a` (3 app.js + suppliers-cache trên cả 3 index). Verify: node --check 3/3 OK; GET /suppliers trả 6 NCC (A1, HÀ NỘI, HƯƠNG CHÂU, KHO TÂN BÌNH, QUẢNG CHÂU, XƯỞNG SỈ A); pattern giống so-order (đã verify live phiên trước). Browser verify trực quan bị chặn do 1 session browser khác đang dùng chung (contention).

### [shared][orders-report] Fix NJD Live load nhầm kho SHOP — token TPOS không SwitchCompany theo công ty đang chọn ✅

User báo: đang chọn **NJD Live** mà product search ra sản phẩm **HH (kho SHOP)** + `Mã: null`. User chỉ rõ: company KHÔNG do username quyết định mà do **luồng request login** (SwitchCompany payload).

**Root cause (verify qua decode JWT + test SwitchCompany):** Cả 2 account `nvktlive1`/`nvktshop1` đều login về **CompanyId 2** mặc định (kho SHOP, 776 SP "HH", 0 "Q"). Kho LIVE = **CompanyId 1** (2051 SP "Q") chỉ tới được qua `SwitchCompany({companyId:1})` + refresh token. Settings modal ([navigation-modern.js:4884](shared/js/navigation-modern.js#L4884)) có làm đủ 3 bước login→switch→refresh, NHƯNG `tokenManager.fetchNewToken()` **chỉ password login** (bước 1), `switchCompanyToken()` viết sẵn nhưng **chưa bao giờ được gọi** (dead code) → chọn Live hay Shop đều đứng company 2 → cả 2 ra kho SHOP. NJD Live hỏng.

**Files:** [shared/js/token-manager.js](shared/js/token-manager.js) + bump `?v=20260616tok` cho 19 trang dùng token-manager.js (orders-report tabs, don-inbox, balance-history, delivery-report, inventory-tracking, doi-soat, …).

1. Thêm `getTokenCompanyId(token)` (decode JWT claim CompanyId) + `isCorrectCompany()`.
2. Thay dead `switchCompanyToken` bằng `ensureCompanyContext()`: nếu company của token ≠ `this.companyId` → `SwitchCompany({companyId})` (HTTP 204) + refresh → token bound đúng công ty + lưu lại.
3. `fetchNewToken()`: sau refresh/password-login → luôn gọi `ensureCompanyContext()`.
4. `getToken()`: trả token chỉ khi `isTokenValid() && isCorrectCompany()` (token cached sai công ty trong localStorage/Firestore không còn bị dùng nhầm).

NJD Shop (company 2) không đổi (ensureCompanyContext no-op vì đã ở company 2). **Verify live (browser eval, NJD Live):** token cache company 2 → boot tự switch → `tokenCompany:1`, `storedCompany:1`, Excel **7877 SP kho LIVE** (vs 833 shop), search "ao"→`[MM352] MM SET ÁO…`, "tui"→`[MM435] MM TÚI…` = đúng SP LIVE. node --check OK.

**Toàn cục:** `tab3-core.js` (tự login riêng) → `getValidToken()`/`authenticatedFetch` 401 giờ ưu tiên `window.tokenManager.getToken()` (company-correct), self-login chỉ là fallback cuối. `tab-kpi-commission.js` fallback login là dead code (chỉ chạy khi `window.tokenManager` vắng — token-manager.js đã load sẵn nên primary path luôn dùng) → giữ nguyên.

Bump `tab3-core.js?v=20260616tok`.

### [orders-report][don-inbox] Fix product search/suggest rỗng toàn bộ — token TPOS stale không tự refresh ✅

User báo: TOÀN BỘ chỗ đánh tên sản phẩm suggest không hiện ("Không tìm thấy sản phẩm") ở orders-report (modal Sửa đơn tab Sản phẩm + panel chat) VÀ don-inbox.

**Root cause (reproduce & confirm 100% qua browser eval):** `productSearchManager` (Web 1.0, dùng chung bởi edit-modal/sale/chat/don-inbox) load sản phẩm từ TPOS Excel endpoint. `tokenManager.isTokenValid()` chỉ kiểm tra timestamp local (token còn hạn ~15 ngày) → không biết TPOS đã vô hiệu hóa token server-side (login lại ở máy/tab khác cùng account `nvktlive1`). Token stale → `getToken()` trả token cũ KHÔNG refresh → TPOS trả **HTML trang login (HTTP 200, KHÔNG phải 401)** → `parseExcelBlob` lỗi `"Invalid HTML: could not find <table>"` → 0 SP → throw nhưng code KHÔNG nhận ra là lỗi auth → kẹt tới khi hết hạn local. Fallback OData gặp 401 → `return []` im lặng, cũng không refresh.

**Bằng chứng:** backend khỏe (token sạch → 833 SP, search OK); mô phỏng access_token rác + expires_at xa → tái hiện đúng "Không tìm thấy" + không tự phục hồi.

**Files:** [orders-report/js/managers/product-search-manager.js](orders-report/js/managers/product-search-manager.js), [orders-report/js/chat/chat-products-ui.js](orders-report/js/chat/chat-products-ui.js).

1. `fetchExcelProducts`: bọc fetch+parse trong retry-loop (max 2). Phát hiện auth-failure = response **không phải spreadsheet** (content-type không chứa `spreadsheet/officedocument/excel/octet-stream`, tức HTML login) hoặc HTTP 401/403 → gọi `forceTokenRefresh()` → retry 1 lần. Hết retry vẫn HTML → throw message rõ ("TPOS trả về trang đăng nhập…").
2. Thêm method `forceTokenRefresh()`: `invalidateAccessToken()` (giữ refresh_token) + `getToken()` (refresh_token→password login) → lấy token mới + lưu lại → mọi call TPOS sau đó cũng OK.
3. Fallback OData `searchProductsFromAPI` (chat): retry-loop, gặp 401/403 lần đầu → invalidate + getToken + retry.

**Verify live (browser eval, session sạch):** token rác `isTokenValid:true` → trước fix `recovered:false`/count 0; sau fix `recovered:true`/**833 SP**/search "ao" 5 KQ/`tokenChanged:true`. node --check 2 file OK.

### [web2][so-order] Sửa mã SP + 8 cải tiến modal tạo đơn (batch) ✅

User báo: biến thể "Đỏ" + tên "1606 A1 ÁO TN TRƠN" ra mã `HNMMTRANG` (sai). Điều tra: `HNMMTRANG` là mã của SP **khác** cùng tên nhưng biến thể **"Trắng"** (id 212); hàng "Đỏ" **mượn nhầm** vì badge tra kho chỉ theo TÊN. Gốc sâu hơn: `extractType` chỉ match từ loại ở ĐẦU tên → "1606 A1 ÁO…" rớt về `MM` thay vì `AO`.

**Files:** [web2/shared/web2-product-code.js](web2/shared/web2-product-code.js), [web2/shared/web2-products-cache.js](web2/shared/web2-products-cache.js), [so-order/js/so-order-app.js](so-order/js/so-order-app.js), [so-order/js/so-order-storage.js](so-order/js/so-order-storage.js), [so-order/index.html](so-order/index.html), [so-order/css/so-order.css](so-order/css/so-order.css), [scripts/test-web2-product-code.js](scripts/test-web2-product-code.js).

1. **Sinh mã SP — viết lại `extractType`**: bỏ qua token "mã nội bộ" ở đầu (token chứa chữ số: 1606, A1, B4…) rồi tìm TỪ LOẠI ở token nội-dung đầu tiên trở đi. Né ĐẦM↔ĐẬM (chỉ nhận `DAM` khi là token nội-dung đầu). `1606 A1 ÁO TN TRƠN`+Đỏ → **HNAODO**, +Trắng → **HNAOTRANG**. Test Node `scripts/test-web2-product-code.js` 17/17 pass.
2. **Badge mã kho variant-aware**: thêm `Web2ProductsCache.findByNameVariant(name, variant)` (strict tên+biến thể); `_lookupKhoCode` dùng nó → hàng "Đỏ" chưa có SP đúng biến thể → **để trống** (không mượn nhầm mã "Trắng"). Verify browser: hàng Đỏ badge blank, hàng ÁO/Xanh Lá/L vẫn HNAOXLL.
3. **Per-tab toggle ẩn/hiện thông tin lô nâng cao** (ETA/Đợt/Số Kiện/Tổng KG/Tiền HĐ/Tiền tệ) trong modal tạo đơn — `tab.showShipMeta`, **mặc định ẩn**. Checkbox ở "Cài đặt tab". CSS `.so-ship-adv[hidden]{display:none!important}`.
4. **Dropdown gợi ý (SP + biến thể) sát ô input**: gốc gap khổng lồ = `_positionFixedDropdown` đặt `position:fixed` nhưng ancestor `.so-modal-body-v2` có `contain:layout/paint` → fixed tính theo box đó, không phải viewport. Đổi sang `position:absolute` + `top = input.offsetTop+offsetHeight+2`. Gap 6px (trước: hàng trăm px).
5. **Thành tiền = GIÁ NHẬP** (đơn mua hàng), không phải giá bán — `updateRowTotal` + `updateModalGrandTotals`. Verify: SL2×nhập100 = 200₫ (không 1998).
6. **Giảm giá + Phí ship per-đơn** thêm vào modal tạo đơn (lưu `shipMeta.discount/shipping`); THÀNH TIỀN = Σ(SL×nhập) − giảm + ship (verify 200−50+30=180); hiện trên header lô khi ≠0. Ghi chú đơn đã có sẵn.
7. **Bỏ cột "Thao Tác"** (sửa/xoá per-row) — trùng nút header lô (sửa/xoá lô + sửa ô inline). Gỡ khỏi `COLUMNS` + `DEFAULT_COLUMNS`.
8. **Tạo NCC mới** (modal tạo đơn) trước "chưa tạo được": picker modal không truyền `onPick` → click "+ Tạo NCC" chỉ điền input, không gọi `ensure`. Fix: truyền `onPick → _ensureSupplierWithFeedback` (tạo NGAY + notify). **Nguồn NCC dùng chung đã có sẵn** = `Web2SuppliersCache` → `/api/web2-supplier-wallet/suppliers` (bảng `web2_supplier_meta`, trang Ví NCC) — 1 nguồn duy nhất. Verify live: tạo "ZZTEST0616" OK (đã xoá test).
9. **Hình ảnh hóa đơn** (task user nêu): đã wired sẵn end-to-end (modal `_imgPasteCellHtml` → `handleOrderSubmit` lưu `invoiceImage` → main-table `imgCell` rowspan theo `invoiceGroupId`). Không thiếu gì.

Bump versions `?v=20260616a` (so-order.css, web2-products-cache.js, web2-product-code.js, so-order-storage.js, so-order-app.js). Browser test: 0 console error, 9/9 hành vi verified.

### [web2][live-chat] Snapshot — endpoint POST /purge (dọn thumbnail theo ngày) + client clear cache ✅

User hỏi multi-machine + xin dọn thumbnail livestream HÔM NAY (không cần nhận diện ảnh). Bối cảnh: backend dedup `ON CONFLICT(comment_id) DO UPDATE … COALESCE(existing.image_data, new)` = **"ảnh có-bytea ĐẦU TIÊN thắng, POST sau KHÔNG đè"** → frame đen (từ máy unfocused, trước fix) POST trước sẽ thắng vĩnh viễn; Force extract bỏ qua comment "đã có ảnh" nên không vá được ảnh đen cũ → cần xoá row.

- **Backend** [livestream-snapshots.js](render.com/routes/livestream-snapshots.js): thêm `POST /api/livestream/snapshots/purge` (gate `x-admin-secret===CLEANUP_SECRET` + `{confirm:'YES-PURGE', scope}`). `scope:'today'` → `DELETE WHERE created_at >= 00:00 GMT+7` (tính tường minh epoch); `scope:'all'` → TRUNCATE. `_notify('purge',{scope})`. Khác `wipe-all` (chỉ all): purge có date-scope + reusable.
- **Client** (subscribeSSE): handle `action==='purge'|'wipe-all'` → clear `snapByComment`/`cacheList`/`counts`/`pending` + re-queue fetch mọi row → thumbnail đen kẹt biến mất NGAY (không reload), comment thành pending rồi tự chụp lại/force-extract.
- Bump `live-livestream-snap.js?v=20260616purge`. Cần deploy web2-api (auto trên push). Sau deploy gọi purge scope=today.

**Multi-machine (trả lời user):** chụp NỀN (stream/buffer) = **1 máy duy nhất** qua leader-lock CAS (TTL 90s, heartbeat 30s, stall-failover 75s, SSE takeover) → không tranh nhau. Per-comment captureVisibleTab KHÔNG lock (nhiều máy focus có thể thử) NHƯNG **không bao giờ chồng chéo dữ liệu**: unique index `comment_id` + COALESCE first-wins + SSE existingSnap-skip → đúng 1 ảnh/comment, không trùng/không đè. Fix focus-gate hôm trước loại frame đen khỏi cuộc đua → "ảnh đầu tiên" luôn là frame thật từ máy focus.

### [orders-report] Inline Tag XL editor cạnh nút Auto T (gắn tag đơn vừa mở chat từ thanh) ✅

**User:** "bên cạnh nút auto bật, khi mở khung chat từ bộ lọc tin nhắn → hiện dòng gắn tag xl của đơn đó để user nhắn xong gắn tag; click ô khác đổi đơn; mở chat ngoài thanh thì ẩn; tag gắn thêm xếp theo chiều ngang sau các nút gán."

**Làm:** Inline Tag XL editor đặt cạnh nút Auto T, bind theo đơn vừa mở chat TỪ thanh "Khách chưa trả lời".

- **JS** [tab1-tagxl-inline.js](orders-report/js/tab1/tab1-tagxl-inline.js) (`window.TagXLInline`): `openFromStrip(orderId,pageId,psid,ev)` (strip gọi) set cờ `_fromStrip` → `showConversationPicker` → `show(orderId)`. `show()` lookup `OrderStore.get(id)` → render label `STT · tên` + `window.renderProcessingTagCell(order.Code)` (tái dụng y hệt cell Tag XL trong bảng — nút gán + chip, khoá theo order.Code) + nút ×. `init()` (DOMContentLoaded) **wrap**: `openChatModal` (mở KHÔNG từ thanh & khác đơn đang bind → `hide()`), `openCommentModal` (luôn `hide()`), `_ptagRefreshRow` (orderCode trùng → `rerender()` đồng bộ sau mọi mutation kể cả chọn dropdown). Guard idempotent.
- **CSS** [tab1-tagxl-inline.css](orders-report/css/tab1-tagxl-inline.css): `.tagxl-inline` ẩn mặc định, `.has-order`→inline-flex; **scope override ngang** `.tagxl-inline .ptag-cell{flex-direction:row}` + `.ptag-cell-badges/.ptag-cell-ttag-row/.ptag-cell-flags-row{flex-direction:row;flex-wrap:wrap}` (không đụng cell trong bảng); max-width 60vw + scroll-x.
- **Strip** [tab1-unread-messages-strip.js](orders-report/js/tab1/tab1-unread-messages-strip.js): onclick ô route qua `TagXLInline.openFromStrip` (fallback `showConversationPicker`).
- **HTML** [tab1-orders.html](orders-report/tab1-orders.html): container `#tagxlInlineEditor` sau nút `#autoTToggle`; thêm CSS link + script `?v=20260616a` (sau strip).

**Verify (Playwright localhost:8099, campaign T6, 531 đơn):** (1) click ô thanh → editor hiện "STT 471 · Yến VY", `.ptag-cell` + badges `flex-direction:row`, 5 nút + 4 chip + nút ×, chat mở; (2) click ô khác → đổi "STT 68 · Mong Duy Nguyen"; (3) click cột TIN NHẮN trong bảng (showConversationPicker, non-strip) → editor ẩn; (4) nút gán onclick đúng order Code `260602462`; wrap `_ptagRefreshRow(code)` re-render editor (test marker, KHÔNG mutate data thật), giữ layout ngang; (5) editor PERSIST sau khi đóng chat (để gắn tag sau khi nhắn); 0 lỗi console từ module. `node --check` 2 file PASS.

**Status:** ✅ code + browser test OK. Web 1.0 (orders-report).

### [web2][live-chat] Snapshot — KHÔNG chụp khi tab không focus (hết thumbnail đen) ✅

**Triệu chứng (user):** live-chat `index.html` auto-snap "không focus vào vẫn chụp nên nó bị thumbnail đen" — comment có ảnh thumbnail ĐEN.

**Nguyên nhân:** path capture qua extension (`chrome.tabs.captureVisibleTab`) chỉ gate `!document.hidden`. `document.hidden` vẫn `false` khi tab là active tab của window NHƯNG window KHÔNG focus (user qua app/cửa sổ khác) → `captureVisibleTab` trả frame ĐEN (hoặc tệ hơn: tab active của window KHÁC đang focus → chụp nhầm nội dung). Crop wrapper FB-live → thumbnail đen lưu vào DB.

**Fix** ([live-livestream-snap.js](live-chat/js/live/live-livestream-snap.js)):

- `_pageActiveForCapture()` = `visibilityState==='visible' && document.hasFocus()` — `hasFocus()` chỉ true khi window focus + tab active (đúng điều kiện có frame thật). Gate ở **1 funnel duy nhất** `_captureExtensionFrame` (return null khi không active) + cập nhật `canExtTabCapture`. Mọi caller (auto-snap, frame-buffer tick, force-extract pool) tự được bảo vệ.
- `_isFrameBlank(ctx,w,h)` = lấy mẫu ~1024 pixel sau crop; `mean<10 && max<24` (luminance 0-255) → coi là đen → bỏ frame. Safety-net cho mọi nguồn (focus rồi nhưng iframe chưa render). Unit-test: đen tuyền/near-black jpeg → bỏ; scene tối có highlight + frame thường → giữ.
- **KHÔNG đụng** stream `getDisplayMedia` (`_captureFrameJpeg`) — path này CỐ Ý chụp khi tab inactive (đã có rVFC né frame seek). Background capture vẫn dùng "🎬 Bắt đầu chụp live".

**Lý do giữ `hasFocus()` (không nới lỏng):** khi window mình KHÔNG focus, `captureVisibleTab` chụp active tab của window ĐANG focus (window khác) → sai nội dung/riêng tư, không chỉ đen. Gate này ngăn chụp nhầm surface. Edge `hasFocus()=false khi DevTools focus` (over-block hẹp, tự hồi khi click lại) — chấp nhận; `_isFrameBlank` là guard chính. (Adversarial review 5-agent: 0 critical/high, 1 medium "acceptable, no change required".)

**Verify:** node --check OK; unit-test `_isFrameBlank` 4 ca đúng. E2E index.html bị chặn vì web2 login session test hết hạn (redirect /web2/login) — không liên quan code. Frontend-only, không cần deploy backend. Bump `live-livestream-snap.js?v=20260616focus`.

### [web2][live-chat] Tin nhắn dài bị cắt "..." — fix reconcileFullText thiếu customer_id + backfill ✅

**Triệu chứng (user ask 4):** comment livestream dài hiện "..." (vd image 5 "Nguyễn Thuỳ Dung"). KHÔNG phải lỗi frontend (đã verify `clipped:false`) — Pancake cắt snippet ở nguồn (~64 ký tự).

**Root cause (xác minh LIVE qua pancake.vn API):** backend ĐÃ có `reconcileFullText` ([web2-livestream-poller.js](render.com/services/web2-livestream-poller.js)) fetch full text khi /ingest thấy snippet cắt, NHƯNG nó gọi `_fetchConversationComments(..., { id: convId }, ...)` — THIẾU `customers[0].id`. Pancake messages API **bắt buộc `customer_id` = UUID khách** (KHÔNG phải PSID): gọi thiếu → trả `"Thiếu mã khách hàng"` + 0 message → reconcile im lặng fail → comment kẹt "...". Verify: cùng conv, thiếu customer_id → 0 msg "Thiếu mã khách hàng"; đúng UUID `a3698631…` → full text "Em mấy ngày trước chị chốt quần B xat . 590k không thấy E chốt quần chị". Token pancake_accounts còn hạn OK (không phải lỗi JWT). `/page-posts` rỗng chỉ vì không có bài đang live lúc test.

**Fix:**

- [web2-live-comments.js](render.com/routes/web2-live-comments.js) `/ingest`: truyền `conv.customers[0].id` (UUID) xuống `reconcileFullText`.
- [web2-livestream-poller.js](render.com/services/web2-livestream-poller.js) `reconcileFullText(pageId, postId, convId, rowId, custUuid)`: dùng custUuid → `_fetchConversationComments(..., { id, customers:[{id:custUuid}] })`. Nếu thiếu custUuid (vd backfill) → tự resolve qua `_listPostConversations` (tìm conv theo id → `customers[0].id`). Không có UUID → return sớm (khỏi gọi fail). Trả boolean updated.
- **BACKFILL** `reconcileRecentTruncated({hours,limit})`: quét `web2_live_comments` còn `message LIKE '%…'|'%...'` trong N giờ (`updated_at >= since`), derive convId = row id bỏ `_${seq}` cuối, reconcile từng cái. Chạy 1 lần 25s sau boot (`start()`), idempotent (`UPDATE … WHERE message<>$1`). Vá comment cũ còn "..." (vd image 5).

**Deploy:** cần web2-api (instance chạy /ingest + poller, DISABLE_WEB2_JOBS unset). Frontend không đổi. Comment mới tự đổi snippet→full qua SSE `reconcile`; comment cũ vá khi web2-api restart (backfill).

### [web2][live-chat] comments-mobile — SĐT hiện CÙNG LÚC với địa chỉ (fallback kho như desktop) ✅

**Triệu chứng (user):** mobile (`comments-mobile.html`) hiện địa chỉ nhưng KHÔNG hiện SĐT cùng lúc, dù desktop (`index.html`) hiện cả 2 (vd KH "Lê Hạ" desktop có `0978078543` + địa chỉ, mobile chỉ địa chỉ).

**Nguyên nhân:** [comments-mobile.js](live-chat/js/live/comments-mobile.js) `cardHtml` lấy SĐT = `validPhone(c.phone) ? normP(c.phone) : ''` — CHỈ đọc SĐT trên comment, KHÔNG fallback kho. Còn `addrOf(c)` thì có fallback kho → địa chỉ hiện, SĐT thì không. Desktop `renderCommentItem` dùng chuỗi `[partner.Phone, kho?.phone, pancakePhone, comment.phone]` nên luôn ra SĐT.

**Fix:** thêm `phoneOf(c)` (giống `addrOf`): SĐT comment 10 số → nếu không có thì lấy SĐT trong kho `web2_customers` (`whInfo(c).phone`, khớp theo phone/fb_id). Dùng trong `cardHtml` meta + `openSheet` + `cardSig` (chữ ký reconcile). Thêm `phone` vào map enrich (nhánh shared `LiveCustomerSync.enrich` đã sẵn trả `phone`; bổ sung nhánh fallback inline). Bump `comments-mobile.js?v=20260616phonefix`.

**Verify (browser localhost, 100 comment):** trước fix nhiều card "địa chỉ-only"; sau fix **addrOnly=0** (mọi card có địa chỉ giờ hiện luôn SĐT), both=60, phoneOnly=15, neither=25. Mẫu: `0987346565 + Khối 1 kiến đức Dakrlap daknong`.

**Desktop (ask 3):** `index.html` ĐÃ resolve + hiện cả SĐT + địa chỉ sẵn (input `phone-`/`addr-` Row 3, fallback kho) → không cần đổi.

**Tin nhắn dài "..." (ask 4) — KHÔNG phải lỗi frontend:** verify `clipped:false` (scrollHeight==clientHeight) — `.c-msg` (mobile) + `.live-conv-message` (desktop) đều KHÔNG line-clamp, hiện ĐỦ text đã lưu. "..." nằm trong DATA: Pancake CẮT comment dài (~64 ký tự + "…"/"..."). Backend ĐÃ có `reconcileFullText` ([web2-live-comments.js](render.com/routes/web2-live-comments.js):376 bắt cả "…" lẫn "...") → fetch full text → SSE `reconcile` → mobile tự đổi. Comment image 5 còn "..." ⇒ reconcile chưa hoàn tất (nghi JWT trên web2-api sau split 14/06 — `/page-posts` cũng trả 0 vì pool/JWT). List endpoint KHÔNG trả conv_id → không thể fetch full text từ browser. → Fix thuộc BACKEND, chờ user xác nhận scope.

### [web2][shared] Chat Zalo — TÌM KIẾM trong hội thoại (highlight + nhảy khớp) ✅

User: "tìm kiếm trong zalo" (khung chat Zalo nhúng chưa có tìm, chỉ cuộn/tải tin cũ). Thêm vào [chat-view.js](web2/shared/zalo-chat/chat-view.js):

- Nút kính lúp ở header → mở thanh tìm (input + đếm `n/N` + ↑↓ + đóng). Mở thanh → `_loadAllForSearch()` nạp đủ tin 1 lần (drain DB pagination + 1 backfill nhóm, render 1 lần) để tìm TOÀN hội thoại không chỉ tin đang hiện.
- `_runSearch` (debounce 200ms): lọc `messages` theo `content` (không dấu, hoa-thường), tô **ring bong bóng** khớp + `<mark>` chữ khớp (case-insensitive, best-effort), nhảy tới khớp **gần đáy nhất**. Enter/↓ khớp sau, Shift+Enter/↑ khớp trước, Esc đóng. Realtime refresh khi đang tìm → renderBody tự vẽ lại tô (`_srchActive`).
- CSS [chat-bubbles.css](web2/shared/zalo-chat/chat-bubbles.css): `.wz-head-btn`, `.wz-srch-bar/input/count/nav`, `mark.wz-srch-mk` (vàng), `.wz-srch-hit/cur` (ring xanh). Chỉ frontend (client-side, dùng Api sẵn có) — KHÔNG cần deploy web2-api.
- Bump `ENGINE_VER=20260616b` + tag web2-zalo.js (3 trang) + chat-view.js/chat-bubbles.css (web2/zalo).

### [web2][live-chat] comments-mobile — bỏ full re-render khi có comment mới (keyed DOM reconcile) ✅

**Triệu chứng (user):** `live-chat/comments-mobile.html` — có tin nhắn mới → thêm vào bảng → render lại HẾT avatar/SĐT/nội dung/địa chỉ của các comment cũ → giật, nhức mắt. "Phần này sửa nhiều nhưng lỗi hoài."

**Nguyên nhân:** [comments-mobile.js](live-chat/js/live/comments-mobile.js) có 2 path render lệch nhau. `doRender()` làm `listEl.innerHTML = html` → **đập & dựng lại MỌI card** mỗi lần render. Bị gọi liên tục: SSE comment mới → throttle 30s `loadPosts()` → `overrideRealCounts()` → `load({silent:true})` (`ALL=data` → `scheduleRender`), enrich kho (`web2:customers`), `overrideRealCounts`. Đập innerHTML hủy + tạo lại từng `<article>` → mọi avatar `<img>` refetch worker → nháy. `applyDelta` (path 2) tự patch `outerHTML` thủ công → dễ lệch với doRender.

**Fix (triệt để — 1 renderer duy nhất):**

- Thêm **keyed DOM reconciler** `reconcileList(shown, moreCount)`: index card theo `data-id`, **tái sử dụng nguyên node card cũ nếu chữ ký nội dung (`cardSig`) không đổi** (KHÔNG chạm DOM → avatar/SĐT/địa chỉ/tên/nội dung giữ cache, 0 nháy). Chỉ: tạo card MỚI (fade-in `.is-new`), gỡ card đã ẩn, đổi vị trí (insertBefore tối thiểu — card cũ đứng yên), rebuild ĐÚNG card đổi nội dung (enrich) kèm `transplantAvatar` (giữ `<img>` đã load nếu cùng src → không refetch ảnh).
- `doRender()` gọi reconciler thay vì innerHTML. `applyDelta()` rút gọn còn merge vào `ALL` + 1 lần `scheduleRender()`; `enrichDelta()` → `scheduleRender()`. `load()` bỏ patch new-pill thủ công (reconciler hiện pill khi có card mới + đang cuộn). Gỡ `cardSel` + path patch `outerHTML` trùng → hết dual-path.
- Card mới: fade opacity thuần + khung xanh ~3s (keyframe `cardIn`/`.card.is-new` sẵn có). Burst dồn dập (>5 batch hoặc >12/2s) → bỏ animation (hiện tức thì).

**Verify (browser test localhost):** load 100 card → gắn expando `__keep`/`__keepav` lên từng card + avatar → click Làm mới (path xưa nuke hết) → **100/100 card node + 100/100 avatar node ĐƯỢC GIỮ NGUYÊN** (code cũ = 0/0). Không lỗi console từ render. Bump `comments-mobile.js?v=20260616reconcile`. Frontend-only, không cần deploy backend.

### [web2] J&T list — tìm kiếm theo TÊN KH + SĐT (thêm src_message vào search) ✅

User: "thêm tìm kiếm" → chọn "Tìm trong danh sách đơn J&T". Ô `#jtSearch` cũ chỉ tìm `billcode/note/latest_event`; tên KH + SĐT nằm trong `src_message` (dòng dán) nên gõ tên/SĐT không ra. [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) `/list`: thêm `src_message ILIKE` vào OR + nhánh **digits-only** (query ≥4 số → strip non-digit cả 2 vế: `regexp_replace(src_message,'\D','')` ILIKE) để "0904 455" khớp SĐT số liền. Placeholder [index.html](web2/jt-tracking/index.html) → "Tìm mã / tên KH / SĐT / sự kiện / ghi chú…". Search đã debounce sẵn (server-side `/list?search=`). Backend cần deploy web2-api.

### [web2][shared] Chat Zalo — gõ `@` lên danh sách thành viên nhóm để TAG (mention) ✅

User: "@ phải lên danh sách tên người trong group để tag — chức năng này Zalo có mà". Ô soạn chat nhúng (Web2Zalo.mountChat) chưa có @mention. Thêm full feature:

- **Backend** [web2-zalo-zca.js](render.com/services/web2-zalo-zca.js): `getGroupMembers(accountKey, gid)` (getGroupInfo→`memVerList` `uid_ver`→tách uid→resolve tên batch 50, bỏ chính mình); `send()` nhận `mentions=[{uid,pos,len}]` → payload `{msg,mentions}` (zca-js Mention type). [web2-zalo.js](render.com/routes/web2-zalo.js): `GET /conversations/:id/members` (gộp người đã nhắn trong thread từ `web2_zalo_members` + danh sách đầy đủ zca, dedup, chỉ trả người có tên, sort tiếng Việt; cache tên mới vào members); `/send-message` nhận + truyền `mentions`.
- **Frontend** [web2-zalo-api.js](web2/shared/web2-zalo-api.js): `groupMembers(convId)`. [chat-view.js](web2/shared/zalo-chat/chat-view.js): `onSendText(text, mentions)`→`sendTextRaw`→`Api.sendMessage({...,mentions})`. [composer.js](web2/shared/zalo-chat/composer.js): gõ `@` (đầu/sau khoảng trắng) → dropdown thành viên (lazy-load + cache theo conv), lọc không dấu, ↑↓ chọn / Enter|Tab chèn / Esc đóng / click chuột; chèn `@Tên ` + nhớ map tên→uid; lúc gửi `_buildMentions` re-derive vị trí thật trong text (chịu được sửa). [chat-composer.css](web2/shared/zalo-chat/chat-composer.css): dropdown drop-up. Chỉ bật cho nhóm.
- Bump `ENGINE_VER=20260616a` + tag web2-zalo.js (jt-tracking/customers/balance-history) + composer/chat-view/api/chat-composer.css (web2/zalo). Backend cần deploy web2-api.

**Triệu chứng:** trang delivery-report gửi ảnh/file lên Telegram báo `Telegram API lỗi: Bad Request: group chat was upgraded to a supergroup chat`.

**Nguyên nhân:** nhóm Telegram đã bị **nâng cấp lên supergroup** → `chat_id` cũ (env `DELIVERY_REPORT_TELEGRAM_CHAT_ID`) chết. Telegram trả lỗi này KÈM `parameters.migrate_to_chat_id` = chat_id MỚI (dạng `-100...`). Code cũ chỉ báo lỗi rồi bỏ cuộc, không retry.

**Fix** (`render.com/routes/delivery-report-telegram.js`): thêm helper `sendToTelegram(method, buildForm)` — khi gặp lỗi migrate, tự retry 1 lần với `migrate_to_chat_id`, nhớ id mới vào `_effectiveChatId` trong process (các lần gửi sau khỏi lỗi), và `console.warn` id mới để cập nhật env trên Render. Gộp luôn logic gửi trùng lặp của `send-photo` + `send-document` (DRY). Self-healing — không cần thao tác tay.

**Việc cần làm thủ công (1 lần, tùy chọn):** cập nhật env `DELIVERY_REPORT_TELEGRAM_CHAT_ID` trên Render = id mới (xem log `[DELIVERY-REPORT-TG] Group nâng cấp supergroup: ... → <id mới>`) để khỏi tốn 1 lần retry mỗi khi server restart. Cần redeploy `n2store-fallback` để fix có hiệu lực.

### [web1][realtime] Retire n2store-realtime — ❌ HARD-DELETED 2026-06-16 ✅

**HOÀN TẤT (user chốt "b" = xóa hẳn):** sau suspend + verify không vỡ → hard-delete: `DELETE /v1/services/srv-d5doh26uk2gs739489k0` (204 → GET 404) + `git rm -r n2store-realtime/` + gỡ refs (`shared/universal/api-endpoints.js` N2STORE const, `service-costs.js` entry+quick-link+plan-map, `nginx-backup.conf` repoint `/api/realtime/*` → n2store-fallback khớp live worker). Verify post-delete: badge `pending-customers` vẫn **200** qua fallback (Web 1.0 OK), web2-realtime 200. **KHÔNG drop bảng** trên `n2store_chat` (data giữ; tái tạo từ git nếu cần). −$7/mo. Còn lại chỉ comment/docs lịch sử. Commits `b64200cc9`+`8dc5ef62f`.

<!-- suspend log gốc -->

### [web1][realtime] Retire n2store-realtime — ⏸ ĐÃ SUSPEND (reversible) 2026-06-16 ✅

**Cập nhật:** user chốt "xóa đi" (pending_customers redundant, unread lấy từ Pancake). Thực thi an toàn: (1) gỡ 3 direct call mark-replied n2store-realtime ở orders-report (tab1-chat-core/chat-products-ui/quick-reply-manager, giữ worker primary); (2) **SUSPEND service** srv-d5doh26uk2gs739489k0 (reversible, $0 billing) thay vì hard-delete ngay vì irreversible + 10% residual. Verify: n2store-realtime HTTP 503; badge `pending-customers` qua fallback vẫn 200 (Web 1.0 KHÔNG vỡ); web2-realtime 200. Cost ~$7/mo ĐÃ tiết kiệm. Hard-delete (service+folder+const api-endpoints REALTIME+service-costs entry+nginx+docs) làm sau khi confirm dormant chắc; vỡ thì `POST /resume` tức thì.

<!-- audit gốc -->

User OK audit decommission để tiết kiệm. Workflow 7-agent adversarial. **Verdict: CHƯA an toàn xóa (~90%) — đính chính: service KHÔNG idle.**

- **ĐANG CHẠY THẬT**: `/api/realtime/pool-status` = pool **5 account / 14 pages / ~46h uptime**, all wsReadyState:1. Health `/status connected:false` mà phiên trước tưởng "idle" là endpoint LEGACY single-client — SAI. Live probe: `/api/realtime/livestream-conversations` direct = **200, 5.6MB**; qua worker→fallback = **404**.
- **Sole writer/server** `livestream_conversations` + `conversation_labels` + `inbox_groups` (render.com/realtime.js = 0 route các bảng này). `pending_customers` thì **redundant** (fallback có WS writer riêng; badge orders-report đọc qua fallback OK → KHÔNG phụ thuộc n2store-realtime).
- **Frontend Web 1.0 đã neuter gần hết**: inbox-data.js `fetchLivestreamFromServer/loadGroupsFromServer/syncLabelsFromServer/markRepliedOnServer/fetchPendingFromServer` = early-return/no-op. Consumer còn sót fail-silent/user-trigger (inbox-chat toggle livestream đã 404 sẵn, `.catch` nuốt; 3 direct mark-replied secondary).
- **DB**: mọi bảng nằm trên `n2store_chat` (chatDb, chung fallback) → xóa service KHÔNG mất rows, chỉ mất write+serve path.

→ **KHÔNG xóa ngay.** Retire an toàn cần: (A) port writer+routes livestream/labels sang render.com/fallback (giữ feature), HOẶC (B) confirm tab Livestream/labels-from-server dormant thật rồi bỏ write path. Cosmetic: dọn 3 direct mark-replied. Tiết kiệm ~$7/mo CHỈ sau retire. Web 2.0 independence KHÔNG phụ thuộc việc này (đã xong).

### [web2][realtime] Stage 3 HỦY-XÓA — n2store-realtime là service WEB 1.0, KHÔNG xóa ⚠️

User OK "làm Stage 3" (retire n2store-realtime) NHƯNG sweep trước khi xóa phát hiện premise SAI: `n2store-realtime` **KHÔNG phải broker Web 2.0 cũ** — nó là **service realtime lớp WEB 1.0** (docs RENDER_SERVERS_GUIDE + `shared/universal/api-endpoints.js REALTIME` import bởi orders-report api-config; mô tả "Web 1.0 inbox WS — pending_customers/livestream/labels"). Bằng chứng routing: worker `/ws/pancake`→pancake.vn thẳng; `/api/realtime/*`→**n2store-fallback** (không phải n2store-realtime). Health: HTTP 200 nhưng IDLE (`connected:false, no_ws, pageCount:0`) — chủ yếu vì consumer chính (Web2Realtime proxy) vừa rời đi.

→ **KHÔNG xóa** (xóa = rủi ro vỡ feature Web 1.0). **Web 2.0 đã 0 code-ref tới n2store-realtime** (decouple xong Stage 1+2) → độc lập ĐÃ ĐẠT mà không cần xóa service. Giữ folder `n2store-realtime/` + nginx ref (đều là Web 1.0). Việc decommission n2store-realtime (nó đang idle, có thể đã thừa) = **task lớp Web 1.0 RIÊNG**, cần audit xác nhận inbox/orders-report/labels không dùng — KHÔNG gộp vào việc tách Web 2.0.

### [web1⊥web2] Audit độc lập toàn Render + gỡ coupling cuối (v2/customers/:id/orders) ✅

User: "kiểm lại toàn bộ Render từng endpoint xem Web 2.0 / Web 1.0 đã độc lập hoàn toàn chưa". Audit 8-agent (6 map → verify file:line → verdict): **~99% độc lập** — core đã tách sạch (2 pool `chatDb`⟂`web2Db`, 2 SSE hub, 2 wallet EventEmitter, 2 service `n2store-fallback`⟂`web2-api`, worker route đúng origin, flag WEB2_ONLY/DISABLE_WEB2_JOBS gating sạch). Shared-by-design OK: worker chatomni-proxy, `pancake_accounts` (token boot read-only), namespace `/api/v2/*` mixed (worker tách origin). 6 báo cáo nêu ~7 nghi vấn → verify chỉ **1 thật**.

**Vi phạm thật DUY NHẤT — đã fix (user chọn C):** `render.com/routes/v2/customers.js` route Web 1.0 `GET /api/v2/customers/:id/orders` đọc thẳng `native_orders`+`fast_sale_orders` trên web2Db (cross-pool). Kiểm consumer: **KHÔNG còn frontend live nào gọi** (web2/customer-wallet + web2-customer-detail-modal dùng `/api/web2/customers/by-phone/:phone/orders`; pbh-app.js dùng `/api/web2/customer-orders` — ref `/api/v2/...` chỉ là comment stale; chỉ pbh-qa-test còn gọi). → **Xóa hẳn handler** (doc+body) khỏi v2/customers.js → file Web 1.0 hết đụng web2Db. Repoint pbh-qa-test sang `/api/web2/customer-orders/<phone>` (shape orders[]/totals). node --check pass; grep v2 core (customers/wallets/tickets/analytics) = 0 ref web2.

**Verdict: Web 2.0 ⊥ Web 1.0 độc lập HOÀN TOÀN trên Render** (sau fix này). Resolved kèm: Web2Realtime→web2-realtime, autofb gỡ, backend tách process.

### [web2][realtime] Stage 2 — repoint Web2Realtime sang web2-realtime + unread fetch Pancake trực tiếp (0 Web 1.0) ✅

Sau Stage 1 (broker đã fold + verify WS OPEN), repoint client + bỏ MỌI call Web 1.0:

- [web2-realtime.js](web2/shared/web2-realtime.js): `PROXY_WS_URL`/`PROXY_HTTP_URL` → `WEB2_CONFIG.REALTIME` (= web2-realtime, KHÔNG còn n2store-realtime). `start()` đơn → bọc accounts[] gọi `web2-realtime/api/realtime/start-multi` (hết `/api/realtime/start` ở fallback Web 1.0).
- `fetchPendingCustomers()`: **viết lại** — unread inbox ban đầu = fetch Pancake TRỰC TIẾP qua `Web2Chat.fetchConversationsByPage` (quét trang có page-token, lọc `unread_count>0`, map shape badge). KHÔNG còn `${WORKER_BASE}/api/realtime/pending-customers` (Web 1.0 table). `markReplied()` → **local no-op**.
- [web2-new-msg-badge.js](web2/shared/web2-new-msg-badge.js): **bỏ poll reconcile 5 phút** (no-poller: fetch 1 lần init, live = WS). Bump native-orders `?v=20260616ws2`.

Verify: node --check pass; browser localhost confirm `WEB2_CONFIG.REALTIME=web2-realtime.onrender.com`; Stage 1 broker WS OPEN. E2e badge cần web2-auth (verify live). **Còn Stage 3**: retire n2store-realtime (cần OK).

### [web2][realtime] Stage 1 — fold Pancake browser-WS broker vào web2-realtime (bỏ lệ thuộc Web 1.0) ✅

User chọn **Y** + insight quan trọng: KHÔNG cần bảng `pending_customers` — unread ban đầu = fetch Pancake 1 lần ở browser, live = WS + SSE. Rà soát phát hiện `Web2Realtime` (engine badge tin-mới native-orders) đang xài **100% hạ tầng Web 1.0/project cũ**: `fetchPendingCustomers`/`markReplied` → n2store-fallback (bảng Web 1.0); `start-multi`+proxy WS → n2store-realtime (broker project cũ). Vi phạm Web1⊥Web2.

**Stage 1 (backend, additive — KHÔNG đụng luồng comments→SSE):** thêm vào [live-chat/server/server.js](live-chat/server/server.js) (= service `web2-realtime`):

- Browser-facing `WebSocket.Server` gắn vào http server sẵn có + `broadcastToBrowsers(type,payload)` (dedup 30s) + ping keep-alive.
- "Tee" `pages:new_message` + `pages:update_conversation` (chỉ inbox, không livestream) sang browser — thêm CẠNH `forwardToFallback`, không sửa dòng cũ.
- `POST /api/realtime/start-multi` dùng LẠI `startClient` + `clients` Map sẵn có (1 kết nối/account, reuse nếu đã connect — KHÔNG double-connect). KHÔNG có pending_customers.

Reuse pool sẵn có nên KHÔNG mở kết nối Pancake trùng → relay comments→SSE an toàn. node --check pass. Deploy web2-realtime (starter 512Mi, I/O-bound). **CHƯA repoint client** (vẫn dùng broker cũ → 0 gián đoạn). Stage 2: repoint web2-realtime.js + badge fetch unread trực tiếp Pancake. Stage 3: retire n2store-realtime (cần OK).

### [web2][fix] Sửa 2 bug native-orders: icon columns-3 + WS proxy sai broker ✅

User báo console native-orders. 2 bug:

1. **`columns-3` icon not found** (Lucide 0.294.0): icon `columns-3` được thêm ở bản Lucide mới hơn → 0.294.0 không có (lỗi fire 4× do `createIcons()` quét lại cả page). Fix: `columns-3` → `columns` (valid 0.294.0, đang dùng OK ở product-warehouse/inventory-tracking/supplier-debt). Sửa `native-orders/index.html` (1) + `issue-tracking/index.html` (4 — Web 1.0, cùng bug, cosmetic).

2. **WS `wss://web2-realtime.onrender.com/` fail lặp vô hạn — REGRESSION từ session trước**: session "đưa URL về đúng project web2.0" đã repoint sai `web2-realtime.js` proxy từ `n2store-realtime` → `web2-realtime`. NHƯNG: `n2store-realtime` (folder `n2store-realtime/server.js`) = **BROKER** chạy WS server cho browser + `/api/realtime/start-multi` + giữ WS tới Pancake per-account; còn `web2-realtime` (`live-chat/server`) = relay Pancake→SSE, **KHÔNG có browser WS server** → connect `/` fail 1006. Verify broker `n2store-realtime.onrender.com` HTTP 200 + start-multi tồn tại (400 validate). **Fix: revert `PROXY_WS_URL`/`PROXY_HTTP_URL` → `n2store-realtime.onrender.com`** (hardcode + comment rõ 2 service khác nhau). Bump native-orders `web2-realtime.js?v=20260616ws`. ⚠ Bài học: `web2-realtime` (relay) ≠ `n2store-realtime` (broker) — đừng gộp; broker chưa migrate sang project web2.0 nhưng vẫn sống.

### [web1][cleanup] Gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) ✅

User xác nhận "bỏ hẳn autofb, shop không xài autofb.pro nữa". Gỡ trọn bộ tính năng autofb (mua dịch vụ FB qua reseller autofb.pro + ví) khỏi cả Web 1.0 lẫn worker:

- **Xóa file**: trang `facebook-services/` (Dịch Vụ Facebook — storefront autofb), `render.com/routes/autofb.js`, `cloudflare-worker/modules/handlers/autofb-handler.js`, `scripts/autofb-login.js`.
- **Worker**: gỡ 7 route `AUTOFB_*` + `AUTOFB_RENDER` ([routes.js](cloudflare-worker/modules/config/routes.js)) + import handler + 8 dispatch case ([worker.js](cloudflare-worker/worker.js)).
- **Render**: gỡ mount `/api/autofb` ([server.js](render.com/server.js)) + dep `tesseract.js` (chỉ autofb dùng) khỏi package.json + regenerate package-lock (npm install --package-lock-only) → lock khớp.
- **Frontend khác**: gỡ entry nav "Dịch Vụ Facebook" ([navigation-modern.js](shared/js/navigation-modern.js)), block `AutoFB` API-docs ([render-data-manager](render-data-manager/js/main.js)), card + live-fetch + warning + CSS autofb ([service-costs](service-costs/js/service-costs.js)), dòng smoke-test.
- Verify: node --check 7 file pass, package.json JSON hợp lệ, grep repo-wide **0 ref autofb/facebook-services** còn lại. tesseract đã out khỏi lock.
- ⚠ Worker (Cloudflare) deploy riêng — route autofb cũ trong worker đã deploy là **vô hại** (không trang nào gọi nữa); sẽ sạch ở lần deploy worker kế.

### [orders-report] Thanh "Khách chưa trả lời" giữa bộ lọc và bảng (đếm + tên + báo động >30') ✅

**User:** "thêm 1 bộ lọc tin nhắn mới nằm giữa bảng và bộ lọc, hiển thị số khách có tin nhắn mới, từng ô nhỏ hiển thị tên khách, báo động khách đã nhắn 30p mà chưa trả lời."

**Làm:** Thanh ngang mới chèn giữa filter-section và `#tableContainer` ([tab1-orders.html](orders-report/tab1-orders.html)), tái dụng pattern KPI stats strip.

- **JS** [tab1-unread-messages-strip.js](orders-report/js/tab1/tab1-unread-messages-strip.js) (IIFE, `window.UnreadCustomersStrip`): đọc `newMessagesNotifier.getPendingCustomers()` (khách còn trong list = shop CHƯA trả lời), khớp với `window.allData` (đơn chiến dịch) theo PSID→fallback SĐT. Scope theo yêu cầu "trong chiến dịch + chia cho nhân viên đó": NV thường (có `_findCurrentUserEmployeeRange`) chỉ thấy khách có đơn STT thuộc range của họ; admin/chủ/`my-authenticated` thấy tất cả + nhãn NV phụ trách (`window.employeeRanges` + map STT). Mỗi ô: **tên · thời gian chờ**; click → `showConversationPicker(orderId,pageId,psid)` mở chat trả lời. Sort: trễ trước, chờ lâu nhất lên đầu. Cap 50 ô + chip "+N nữa". Báo động khách chờ ≥30' (`STALE_MIN`): ô đỏ tĩnh + badge header "N trễ >30'" nhấp nháy (pulse dồn vào 1 badge, không để hàng chục ô nháy). Realtime: nghe `n2s:pendingCustomersChanged` (debounce 250ms) + tick 30s cập nhật thời gian chờ/cờ trễ.
- **CSS** [tab1-unread-messages-strip.css](orders-report/css/tab1-unread-messages-strip.css): strip amber, `:empty`/non-`.has-items` → ẩn, cell bo tròn, `.ucs-cell--late` đỏ, `.ucs-head__late` pulse, `prefers-reduced-motion` tắt animation.
- **Notifier** [new-messages-notifier.js](orders-report/js/chat/new-messages-notifier.js): thêm `window.dispatchEvent(new CustomEvent('n2s:pendingCustomersChanged'))` cuối `reapply()` (chokepoint mọi thay đổi pending) để consumer ngoài tự cập nhật. Wire CSS link + container `#unreadCustomersStrip` + script `?v=20260616a` trong tab1-orders.html.

**Verify (Playwright localhost:8099, login admin, chiến dịch T6, 531 đơn, 153 pending):** strip auto-render qua event (không gọi render tay) — 50 ô + "+103 nữa", header "Chưa trả lời 153 · 153 trễ >30'"; inject 2 khách (2'→thường, 40'→đỏ) đúng phân loại + sort; click ô → chat modal mở đúng khách ("Na Na Na Na"); không có lỗi console từ strip. `node --check` PASS.

**Status:** ✅ code + browser test OK. Web 1.0 (orders-report) — không đụng web2.

## 2026-06-15

### [web2][render] web2-api OOM 512Mi — bound sharp native memory + RSS log ✅ (heap cap + plan = chờ user)

User forward mail Render "web2-api exceeded its memory limit". Chẩn đoán qua Render API: service `web2-api` plan **starter = 512Mi**, `NODE_OPTIONS` CHƯA set, `oomKilled memoryLimit 512Mi` nhiều lần (13:01, 13:32, ~16:25). Sau split 2026-06-14 toàn bộ backend Web 2.0 (routes + cron services + xử lý ảnh) dồn lên 1 box 512Mi.

Nguyên nhân: (1) V8 heap không cap → phình quá container trước khi GC → OOM-kill; (2) `sharp` (image-proxy/autofb/web-warehouse) chạy KHÔNG set `cache`/`concurrency` → libvips giữ hàng trăm MB ngoài heap.

**Đã fix in-repo** ([render.com/server.js](render.com/server.js) đầu file): `sharp.cache(false)` + `sharp.concurrency(1)` (bound native memory) + log `[MEM]` RSS mỗi 60s khi >380MB (phân biệt leak vs spike). node --check pass.

**Follow-up (user "làm cả 2"):**

1. **tesseract lazy + autofb không mount trên web2-api**: `tesseract.js` chuyển `require` vào trong `solveCaptchaWithTesseract` ([autofb.js](render.com/routes/autofb.js)) — chỉ nạp khi thật giải captcha. `server.js` mount autofb sau `if (!WEB2_ONLY)` → box Web 2.0 KHÔNG nạp autofb/tesseract/sharp-autofb. Giảm RAM nền (Web 1.0/fallback vẫn dùng autofb bình thường).
2. **Audit `SELECT *` route** (nghi can spike): KIỂM kỹ multi-line → **gần như TẤT CẢ đã phân trang sẵn** (`LIMIT/OFFSET`): products, variants, web2_records (generic + dedicated-entity), returns, customer-intents, balance-history, wallets (cap 1000), pending (LIMIT 200/500). Grep ban đầu báo nhầm vì `LIMIT` nằm dòng kế. **Ngoại lệ DUY NHẤT**: `web2-supplier-wallet /state` load full `web2_supplier_ledger` (cần đủ row để tính số dư + lịch sử GD per NCC — **money code**) → **KHÔNG cap** (cap = sai số dư). Khi ledger lớn mới paginate display + tính balance bằng SQL aggregate (cần phối hợp client). ⇒ Driver OOM thực = #1 structural + #2 no-heap-cap + #3 sharp (đã fix), KHÔNG phải unbounded list query.

**User duyệt "cap heap + nâng plan 2GB" (15/06) → ĐÃ áp:** (a) plan `starter→standard` (512Mi→**2GB**) qua `PATCH /v1/services/{id} {serviceDetails:{plan:standard}}`; (b) env `NODE_OPTIONS=--max-old-space-size=1536` (heap 1.5GB, chừa ~512MB native trên box 2GB) qua `PUT .../env-vars/NODE_OPTIONS`; (c) `POST .../deploys` (dep-d8o32ournols739t2hmg) áp cả plan+env+commit sharp. web2-api giờ standard 2GB → hết OOM. Theo dõi log `[MEM]` xác nhận.

### [web2][worker] Hợp nhất nguồn base-URL + fix 2 gap (livestream 404 worker, ck-dashboard 401) ✅

User: "WEB 2.0: tất cả nguồn dữ liệu… đồng nhất về 1 nguồn dùng chung… 1 khối thống nhất". Audit 6 mảng (base-URL, auth header, SSE/realtime, DB pool, worker routing, Pancake/Zalo) bằng 6 agent song song → SSE/DB-pool/Pancake/Zalo ĐÃ single-source; còn 3 việc:

**1. Nguồn base-URL duy nhất (`web2-auth.js`)**: trước đây KHÔNG có config chung — 61 file hardcode `chatomni-proxy…` / `web2-api-kv04…` rải rác; `window.API_CONFIG` chỉ tồn tại trên trang live-chat. Thêm block `WEB2_CONFIG` (WORKER_URL + WEB2_API + REALTIME + REALTIME_SSE + `apiUrl()`) + merge-safe vào `window.API_CONFIG` ở ĐẦU [web2-auth.js](web2/shared/web2-auth.js) — file shared load **sớm nhất** trên mọi trang (web2/\*, native-orders, so-order; live-chat đã có api-config.js riêng) → mọi script sau đọc được, KHÔNG race, KHÔNG thêm script tag. Convert **42 dòng** hardcode bare-host (`const/let/var`, `return`, object-prop) sang `(window.API_CONFIG && window.API_CONFIG.WORKER_URL) || 'literal'` (literal giữ làm fallback resilience). Đổi URL backend Web 2.0 từ nay → CHỈ sửa `web2-auth.js`. Verify live: `window.API_CONFIG`/`WEB2_CONFIG` resolve đúng trên web2/products, 0 console error ck-dashboard.

**2. Worker `/api/livestream*` 404 gap**: `matchRoute` KHÔNG có entry cho `/api/livestream/` + `/api/livestream-images/` → rơi vào catch-all `TPOS_GENERIC` → tomato.tpos.vn (404 nếu gọi qua worker). Thêm route `WEB2_LIVESTREAM` + `WEB2_LIVESTREAM_IMAGES` ([routes.js](cloudflare-worker/modules/config/routes.js) + [worker.js](cloudflare-worker/worker.js) → `handleCustomer360Proxy` → web2-api). Giờ MỌI path Web 2.0 match tường minh TRƯỚC `TPOS_GENERIC` → Web 2.0 không bao giờ chạm catch-all TPOS.

**3. ck-dashboard 401 gap**: POST `/api/web2/customer-intents/{id}/done` thiếu `x-web2-token` (chỉ `credentials:include`) → 401 dưới `WEB2_AUTH_ENFORCE=1`. Thêm `...Web2Auth.authHeaders()` ([ck-dashboard-app.js](web2/ck-dashboard/js/ck-dashboard-app.js)).

⚠ **TPOS_GENERIC GIỮ NGUYÊN** (user hỏi "xóa đi"): đây là catch-all của worker `chatomni-proxy` (proxy **chung cả 2 layer**) → tomato.tpos.vn — **Web 1.0 (orders-report/inbox) vẫn dùng TPOS thật** (OData, /api/Product, /api/SaleOnline_Order…). Xóa = vỡ Web 1.0. Đúng hướng: ĐÃ match hết path Web 2.0 trước catch-all, KHÔNG xóa catch-all.

**4. Server URL trỏ đúng project Render `web2.0n2store`** (user hỏi "url server web 2.0 đã nằm đúng render web2.0 chưa?"): audit mọi host `onrender.com` trong Web 2.0 frontend → `web2-api-kv04` (×24) + `web2-realtime` (×4) ĐÚNG project; phát hiện 2 ref SAI trỏ project Web 1.0:

- [web2-realtime.js](web2/shared/web2-realtime.js) PROXY_WS_URL/PROXY_HTTP_URL = `n2store-realtime.onrender.com` (Web1 inbox) → SAI: relay Pancake Web 2.0 = service `web2-realtime` (xác nhận `live-chat/server/render.yaml` name=web2-realtime + pancake-state.js). Fix: đọc `window.WEB2_CONFIG.REALTIME` → `web2-realtime.onrender.com` (bump native-orders `?v=20260615rt`).
- [pbh-realtime.js](web2/shared/pbh-realtime.js) `wss://n2store-fallback.onrender.com` → dead code (deprecated 3W4, 0 script tag thật load, `PbhRealtime.subscribe` không nơi nào gọi, đã thay bằng Web2SSE) → **XÓA file**.
- Còn 1 comment lịch sử (live-realtime.js "WS … đã tắt") — không phải URL active, giữ. Worker `FALLBACK_ORIGIN=n2store-fallback` ĐÚNG (path Web 1.0 trên worker chung).

Verify: node --check 39 file pass; browser smoke (overview→products→ck-dashboard) 0 console error.

### [web2] Xóa sạch chữ "TPOS" trong comment/doc Web 2.0 (reword giữ nghĩa) ✅

User: "xóa sạch mọi chữ tpos trong comment". Reword MỌI comment + log-string + doc-prose chứa "TPOS"/"tpos" trong Web 2.0 (web2/, live-chat/, native-orders/) → bỏ chữ TPOS, giữ nguyên ý. ~28 occurrence / 19 file:

- Comment .js: live-realtime (SSE cũ/legacy/transport cũ), web2-products-print (×5: "KHÔNG gọi API ngoài"/"render local" thay "tpos.vn"), live-init (×4), facebook-routes (×2), comments-mobile (×2), pancake-state/pancake-api/live-customer-panel/live-comment-list/live-api/api-config/web2-customer-wallet-app (×1).
- HTML comment ×4 (customers/customer-wallet/balance-history/supplier-debt): "token-manager.js gỡ … không dùng token bearer cũ".
- overview doc prose ×5: "hệ POS cũ"/"service relay cũ" thay TPOS.
- Bump version string `api-config.js?v=…tpos` → `?v=20260615fix`.

⚠ GIỮ NGUYÊN: bảng Web 1.0 (`customers`/`invoice_status`/`return_orders`/`odata-tpos-shadow` — TPOS hợp lệ ở Web 1.0) + code identifier chứa chuỗi "tPos" KHÔNG phải TPOS (`getPostIds`, `boostPost`, `parentPostIds/List/Section`, `selectPost`, `getCurrentPosition`). Verify: **ZERO TPOS thật còn trong Web 2.0**; node --check 15 JS pass. Comment-only → không cần bump version (behavior identical). Workflow 19-agent rate-limited → fallback inline node literal-replace.

### [web2][live-chat] Fix SĐT bị fb_id ghi đè + health-monitor 404 spam + dọn TPOS leftover ✅

User: "lưu SĐT xong lưu địa chỉ thì SĐT bị đầy về 1254523635???" + "chatomni-proxy.../ 404 trang nào cũng console" + "xóa tất cả tpos bên web 2.0".

**Bug 1 — SĐT → đuôi fb_id (data corruption)**: `Web2CustomerStore.normPhone` có `if (s.length>10) s=s.slice(-10)` → fb_id `fb_24084091254523635` (17 số) → `1254523635` (SĐT giả). Caches reset (SSE web2:customers) → render fallback `partner.Phone||kho.phone||comment.phone` đọc giá trị nhiễm → hiện `1254523635`. Fix:

- [web2-customer-store.js](web2/shared/web2-customer-store.js) `normPhone`: **bỏ `slice(-10)`** → fb_id giữ 17 số → `isValidPhone(/^0\d{9}$/)` loại.
- [live-comment-list.js](live-chat/js/live/live-comment-list.js): render (`_rowSig` + row builder) **chỉ chọn SĐT hợp lệ đầu tiên** (`isValidPhone` gate) → ẩn giá trị nhiễm. `saveInlinePhone`: validate 10 số TRƯỚC khi lưu + `run()` throw khi `savePartnerData` trả `{ok:false}` (409 SĐT trùng KH / 400) → optimistic rollback + báo lỗi. `saveInlineAddress` throw tương tự.

**Bug 2 — 404 spam mọi trang**: [service-health-monitor.js](shared/js/service-health-monitor.js) `checkWorker` probe `GET /` → worker 404 tại edge → browser **luôn log** `GET chatomni-proxy/ 404` mỗi 25s mọi trang. Fix: probe **`OPTIONS /`** → worker trả **204** (CORS preflight, edge, không đụng Render) = success → hết log. Bump loader 3 nơi (auth-manager/navigation-modern/web2-sidebar).

**Dọn TPOS leftover Web 2.0** (đã gỡ API 2026-06-14, còn remnant): gỡ nút "Mở trên Live"→`tomato.live.vn` ([live-customer-panel.js](live-chat/js/live/live-customer-panel.js)); gỡ `liveBaseUrl` (tomato.live.vn forwarder, dead — 0 nơi dùng) [live-state.js](live-chat/js/live/live-state.js); sửa doc overview (route `web2-customer-tpos` đã gỡ; cột `tpos_id/tpos_data` vestigial). ⚠ Backend web2 KHÔNG gọi TPOS; cột DB `tpos_id/tpos_data` CHƯA drop (chờ user xác nhận — CLAUDE.md từng ghi "giữ"). Bump `?v=20260615fix`. Frontend-only.

### [web2][shared][jt-tracking] Retrofit optimistic UI — handler còn await trần → Web2Optimistic ✅

User hỏi "optimistic UI đã có ở tất cả trang chưa? (tạo/nặng→spinner chống bấm trùng, xoá→biến mất ngay rồi rollback)". Audit: helper load 35/40 trang, dùng thật ~17 file; money/destructive cố ý giữ await. Sweep handler còn await trần (non-money):

- **page-builder.js `removeRecord`** (generic Web2Page — delivery-zone + product-category): sau confirm → row **biến mất NGAY** (splice STATE.records + renderRows/Counters/Pagination) + rollback khôi phục đúng vị trí nếu lỗi. `saveModal` (create/update) **giữ await + double-submit guard** (đúng pattern "tạo/nặng thì chờ"). → cả 2 trang generic tự hưởng.
- **jt-tracking `rowAction`**: `approve`/`unapprove` (duyệt) → UI-first (`row.approved_at` đổi NGAY → mờ row + tag "tự xoá 7 ngày") + rollback; SSE `web2:jt-tracking` reload authoritative. `refresh` (tra cứu J&T server-side, NẶNG) **giữ await** + reload.
- **payment-confirm**: đã RETIRED (redirect → ck-dashboard) → bỏ qua. Money pages (customer-wallet, fastsaleorder-\*, purchase-refund, supplier-debt) giữ await theo ngoại lệ. bc-tag jt đã fire-and-forget (giữ).

Browser-smoke: jt-tracking + delivery-zone — Web2Optimistic.run=function, page render, 0 page error. Bump `jt-tracking-app.js?v=20260615opt`, `page-builder.js?v=20260615opt`. Frontend-only.

### [web2][shared][P5] colorShortMap về Web2VariantsCache (memoize); Zalo đã shared ✅

`colorShortMap` (map tên màu ASCII → shortCode locked, dùng sinh mã SP) build **trùng logic** ở 2 nơi: [web2-products-app.js](web2/products/js/web2-products-app.js) (`getColorShortMap`+`_colorShortMapCache`) + [so-order-app.js](so-order/js/so-order-app.js) `_assignKhoCodes` (inline). Gom về [`Web2VariantsCache.getColorShortMap()`](web2/shared/web2-variants-cache.js) — memoize + auto-invalidate khi data variant đổi (`_loadList`). 2 trang delegate (giữ fallback inline nếu cache cũ chưa có method). Cần `Web2ProductCode.toAsciiUpper`.

⚠ Smoke bắt bug: quên thêm `getColorShortMap` vào export object → fixed. Browser-verify products: function OK, 10 keys, memoized (same ref), sample mã màu thật. Bump variants-cache `?v=20260615store2`, products-app/so-order-app `?v=20260615store`.

**Zalo**: audit đã 95% compliant (mọi trang qua `Web2Zalo`/`ZaloApi`, không gọi `/api/web2-zalo` trực tiếp). `_fetch` dup giữa facade `web2-zalo.js` (load standalone cho sendZNS) vs engine `web2-zalo-api.js` (load với chat engine) — **load khác scenario → giữ riêng** (ép couple làm facade nặng thêm). KHÔNG đổi.

**Cache products/variants underused** (trang tự fetch list thay cache) = perf/kiến trúc, defer (không phải dup nguy hiểm). Frontend-only.

### [web2][live-chat][P4] Pancake live-chat — centralize WORKER_URL; token/search ĐÃ trên Web2Chat ✅

Audit P4 (token-manager dup, conv/tags) dùng **code cũ** — thực tế live-chat Pancake đã consolidated ~90% (2026-06-13): `PancakeAPI.getToken/getPageAccessToken` → `Web2Chat.getJwt/getPageAccessToken`, `searchConversations` → `Web2Chat.searchConversations`, URL build → `API_CONFIG.buildUrl.*` (centralized). `pancake-token-manager.js` **load-bearing** (account-mgmt UI settings-manager + live-source JWT chọn account FB-live + pancake-init) → **KHÔNG xoá được** (audit recommend sai).

**Làm (an toàn)**: centralize 3 base-URL hardcode → `API_CONFIG.WORKER_URL` (fallback literal):

- [pancake-state.js](live-chat/js/pancake/pancake-state.js) `proxyBaseUrl`, [inventory-panel.js](live-chat/js/pancake/inventory-panel.js) `PROXY`/`API`. api-config (770) load trước pancake-state (833) → có hiệu lực.
- Bump `?v=20260615store`. Browser-smoke live-chat: `Web2CustomerStore`/`LiveStatus` delegate OK, `proxyBaseUrl` resolved, `pancakeTokenManager` còn, **0 page error**.

**Verify live P1–P4** (browser, clone session): live-chat (store=object, isValidPhone clone=true/fb_id=false, LiveStatus delegates), balance-history (PartnerCustomerApi.statusClass===store, suppliersCache.normalize=fn, manualDeposit ok), customer-wallet (Web2WalletApi moved → getWallet/deposit ok). Frontend-only.

### [web2][shared][P3] Ví KH — promote Web2WalletApi sang shared; Ví NCC giữ nguyên (money) ✅

**Ví khách**: `Web2WalletApi` (full client: getWallet/getWalletsByPhones/getTransactions/deposit/withdraw, auth x-web2-token, DIRECT_BASE fallback) đang nằm page-local `customer-wallet/js/`. `git mv` → [`web2/shared/web2-wallet-api.js`](web2/shared/web2-wallet-api.js) = NGUỒN CHUNG để mọi trang tham chiếu (đọc full ví / nạp-trừ) thay vì reimplement. Update include customer-wallet → `../shared/`. Pill nhẹ [`Web2WalletBalance`](web2/shared/web2-wallet-balance.js)`._fetchBalance` reuse `Web2WalletApi.getWallet` khi có (1 nguồn đọc `/by-phone`); vẫn độc lập (self-fetch) trên trang không load client → embed rộng được. Sửa note header "KHÔNG cần auth" (stale — mutation cần token). Bump `?v=20260615store`.

**Ví NCC**: ledger ở [`supplier-wallet-storage.js`](web2/supplier-wallet/js/supplier-wallet-storage.js) (`addTransaction` server-first await + idempotency `tx_id`, `Sync.init` /state, `applyDeposits` SePay) — **money-op nhạy cảm, đã centralized cho trang ví NCC**. supplier-debt đọc `/state` chỉ để hiển thị (read) + có /suppliers write riêng. Trích tách transport sẽ rủi ro vỡ idempotency/rollback → **giữ nguyên** (đúng nguyên tắc money-op await+rollback). Frontend-only.

### [web2][shared][P2] Kho NCC — adopt directory chung Web2SuppliersCache ✅

Audit kho NCC: **đã shared khá tốt** qua [`Web2SuppliersCache`](web2/shared/web2-suppliers-cache.js) (`/api/web2-supplier-wallet/suppliers` = web2_supplier_meta master). 3 "fetch `/state` trùng" mà audit nêu thực ra là **divergence hợp lệ** — supplier-debt/supplier-wallet cần `/state` cho ledger (số dư), normalize khác nhau vì khác mục đích (lookup-key bỏ dấu vs SePay-content word-match alnum+space vs deeplink NFC giữ dấu). Gom cứng sẽ vỡ matching/mất balance label → KHÔNG ép.

**Làm (an toàn, đúng)**:

- Expose `Web2SuppliersCache.normalize(name)` (public) — 1 hàm chuẩn hoá tên NCC dùng chung.
- [web2-manual-deposit.js](web2/balance-history/js/web2-manual-deposit.js) `loadNccList`: TÊN NCC lấy từ directory chung `Web2SuppliersCache.getNames()` (master, gồm NCC chưa có ví) ∪ keys có số dư; balance vẫn từ `/state`. → 1 nguồn tên NCC, deposit được cho cả NCC mới. Load `web2-suppliers-cache.js` trên balance-history. Fallback giữ hành vi cũ nếu cache absent.
- Bump `web2-manual-deposit.js?v=20260615store`. Frontend-only.

### [web2][shared][P1] Gom kho KH về 1 nguồn — Web2CustomerStore ✅

User: "kiểm tra tất cả web 2 xem phần nào dùng chung thì bỏ vào shared… ví dụ pancake, zalo, kho SP, kho KH, kho NCC, ví KH, ví NCC". Audit (6-agent song song) → kế hoạch 5 cụm P1–P5. **P1 = Kho KH** (giá trị cao nhất + đang có bug thật).

**Vấn đề**: logic truy cập `web2_customers` rải 4 chỗ với **3 bộ normalize status** khác nhau (`Web2CustomerLookup.STATUS_TEXT`, `customers-app.STATUS`, `LiveStatus.normalize`) + **filter SĐT lỏng** (`web2-customer-lookup` `len>=3`, `live-customer-sync` `len>=9`) → **fb_id (`fb_2408…`)/số rác lọt vào batch-by-phone** → khớp sai KH.

**Fix** — tạo NGUỒN DUY NHẤT [web2-customer-store.js](web2/shared/web2-customer-store.js) (`window.Web2CustomerStore`): validate SĐT `/^0\d{9}$/`, 1 bộ status (text/class/normalize, gồm tier Thân thiết/Khách sỉ), carrier, auth `x-web2-token` cho mọi write, batch chunk chống N+1. API: `batchByPhones/batchByFbIds/getByFbId/getByPhone/enrich/list/listByPhones` (read) + `patch/updateStatus/patchByFbId/upsert/harvestComments` (write) + `subscribe(web2:customers)`.

4 module cũ **delegate** (giữ nguyên public interface, không rewire call-site):

- [web2-customer-lookup.js](web2/shared/web2-customer-lookup.js): rewrite thành shim mỏng → `PartnerCustomerApi`/`Web2CustomerLookup` trỏ store (bỏ ~150 dòng dup, **fix filter `>=3`**).
- [live-status.js](live-chat/js/shared/live-status.js): `normalize` → `Web2CustomerStore.normalize` (fallback inline).
- [live-customer-sync.js](live-chat/js/shared/live-customer-sync.js): `enrich`→store.enrich (**fix `>=9`**), harvest POST→store.harvestComments (auth).
- [live-api.js](live-chat/js/live/live-api.js): `getPartnerInfo/Batch`, `_patchWarehouseByFb`, `updatePartnerStatus`, `savePartnerData` upsert → store (giữ shape partner-like + fallback).
- [web2-partner-enricher.js] tự hưởng lợi (qua `PartnerCustomerApi.listByPhones`).

Include `web2-customer-store.js?v=20260615store` TRƯỚC consumer ở: live-chat/index.html, comments-mobile.html, balance-history, customer-wallet. Bump live-status/live-customer-sync/live-api `?v=20260615store`. Verified node harness: reject `fb_2408…`/17-số, accept `0123456788`, status/normalize/shim đúng. Frontend-only (không deploy). Lưu MEMORY [[reference_web2_customer_store]].

### [web2][AUDIT] Quét + fix TOÀN BỘ web2 write thiếu x-web2-token (WEB2_AUTH_ENFORCE 401) ✅

User: "kiểm lại toàn bộ /api/web2 còn thiếu x-web2-token không". Workflow audit (5-agent) → **37 violation / 14 file**; workflow remediation (6-agent song song) fix → **~18 file**:

- **Wrapper central** (1 sửa cover nhiều): `web2-products-api.js` + `web2-variants-api.js` (`_fetchJson`), `returns-api.js` (`_json` + sửa bug spread-order).
- **Reuse helper sẵn có**: `web2-msg-template.js` (4 — claim/result/cancel/create, double-send guard), `web2-chat-client.js` (enrich-fb), `pancake-api.js` (batch-summary), `live-livestream-snap.js` (capture-lock ×2), `web2-wallet-api.js` (batch-full).
- **Thêm helper `_w2Auth` nhỏ**: `web2-customer-detail-modal.js` (PATCH KH), `web2-qr-modal.js` (×3 QR ví), `web2-customer-lookup.js`, `web2-wallet-balance.js`, `web2-printer.js` (×3 CRUD), `web2-products-print.js` (mark-printed), `debt-manager.js`, `live-comment-list.js` (batch-by-fbid), `native-orders-app.js` (merge + batch-by-fbid), `so-order-app.js` (confirm-purchase-partial, giữ credentials:omit).
- Nguồn token: `Web2Auth.authHeaders()` / fallback localStorage `web2_auth.token`. Bump tất cả JS đã sửa `?v=20260615auth`. Pattern + quy tắc lưu MEMORY [[reference_web2_write_auth_header]]. ⚠ deploy không cần (frontend), nhưng các write giờ qua được khi WEB2_AUTH_ENFORCE=1.

### [live-chat] Fix write KH 401 (thiếu x-web2-token) + SĐT validate 10 số (tránh nhầm fb_id) ✅

User báo `PATCH /api/web2/customers/68048 401` + `POST /upsert 401` khi lưu SĐT/địa chỉ/trạng thái → **gốc thật của "không đổi được"** (WEB2_AUTH_ENFORCE, write thiếu header). [live-api.js](live-chat/js/live/live-api.js): 7 write fetch (`_patchWarehouseByFb` PATCH, `updatePartnerStatus` PATCH, `savePartnerData` upsert, batch...) dùng `_w2AuthHeaders({...})` (gắn `x-web2-token` từ Web2Auth/localStorage web2_auth). + SĐT VN = **đúng 10 số `/^0\d{9}$/`** (tránh nhầm `fb_24084091254523635`): `validPhone()` ở [comments-mobile.js](live-chat/js/live/comments-mobile.js) (enrich filter/whInfo/display/filter-phone) + [live-kho-enricher.js](live-chat/js/live/live-kho-enricher.js) (pendingPhone). Bump `?v=20260615kho2`. → đang audit toàn repo các web2 write khác thiếu auth (workflow).

### [web2] J&T nút tag "XỬ LÝ BC" — icon đổi ngay (lucide) + LƯU DB đồng bộ đa máy ✅

User: (1) "bấm ra hình 3 phải refresh mới ra hình 4" — bấm tag hiện icon `tag` xanh, phải refresh mới thành `badge-check`. (2) "các nút tag pancake này chưa được lưu ở db".

- **Icon không đổi**: `setTagButtons` dùng `querySelector('i')` nhưng lucide đã thay `<i>` bằng `<svg>` (→ null) nên `setAttribute('data-lucide')` vô tác dụng → chỉ class `is-tagged` đổi màu, icon giữ `tag`. Fix [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js): thay HẲN `b.innerHTML='<i data-lucide=…>'` rồi `icons()` → vẽ lại đúng `badge-check`/`tag` ngay (browser-test: `querySelector('i')===null` xác nhận bug; sau fix svg = `lucide-badge-check`).
- **Chưa lưu DB**: trạng thái tag chỉ ở localStorage (device-local). Thêm bảng `web2_jt_bc_tags(phone PK, tagged_at, updated_at)` + `GET /bc-tags` (list SĐT đã gắn) + `POST /bc-tag {phone,tagged}` (upsert/delete + SSE `bc-tag`). Pancake vẫn là nơi áp thẻ thật; DB chỉ mirror để hiện nút nhanh + sync. Client: `markTagged/unmarkTagged` persist khi đổi, `loadBcTags()` nạp từ DB trong `load()` (song song `/list`), SSE `web2:jt-tracking` → reload → đa máy thấy ngay.
- Bump `jt-tracking-app.js?v=20260615bf3`. Backend cần deploy web2-api.

### [web2][live-chat][native-orders] Trạng thái/thông tin KH = 1 NGUỒN CHUNG web2_customers + SSE đồng bộ ✅

User: (1) "Đã tạo đơn" đè trạng thái KH (mobile); (2) live-chat desktop + panel KH đổi trạng thái không lưu; (3) tất cả trạng thái/thông tin KH dùng chung 1 nguồn `web2/customers` (web2_customers), đổi 1 chỗ → SSE → nơi khác tự cập nhật; (4) native-orders cũng tham chiếu kho chung; (5) bỏ nút "Lấy WEB2" (lấy nhầm fb qua SĐT — thừa vì có SSE).

**Điều tra (workflow 5-agent)**: status canonical = `web2_customers.status` (Normal/VIP/Bom/Warning/Danger; Khách sỉ/Thân thiết = cột `tier`). WRITE `PATCH /api/web2/customers/:id {status}` ĐÃ có + đã bắn SSE `web2:customers`. Bug desktop = handler chỉ update `partnerCache`, KHÔNG `customerKhoCache` (mà display ưu tiên đọc) → re-render stale. Mobile = `statusOf` early-return "Đã tạo đơn" đè status.

**Fix**:

- [comments-mobile.js](live-chat/js/live/comments-mobile.js): `statusOf` LUÔN trả status kho; badge "✓ Đã tạo đơn" tách RIÊNG (hiện cả 2). Subscribe `web2:customers` → `refreshWarehouse()` (xoá custMap + re-enrich + render).
- [live-comment-list.js](live-chat/js/live/live-comment-list.js): `selectInlineStatus` đồng bộ `customerKhoCache.status` (apply+rollback+fallback) → đổi trạng thái GIỮ sau re-render.
- [live-init.js](live-chat/js/live/live-init.js): subscribe `web2:customers` → clear `customerKhoCache`+`partnerCache` + `LiveKhoEnricher.reset/scan` + render (đồng bộ chéo tab/máy + panel KH).
- [native-orders-app.js](native-orders/js/native-orders-app.js): **GỠ nút "Lấy WEB2"**; subscribe `web2:customers` → reload (re-enrich) → tự cập nhật khi kho đổi.
- [web2-customers.js](render.com/routes/v2/web2-customers.js): `rowToLite` thêm `status`+`tier` (GET /:phone trả status cho modal/lookup).
- Bump live-chat (`comments-mobile`/`live-comment-list`/`live-init`) + `native-orders-app` `?v=20260615kho`. ⚠ deploy web2-api (rowToLite).

### [orders-report] Cột TIN NHẮN nhận biết tin mới khi mở lại — client fetch list unread Pancake (KHÔNG cron) ✅

**User:** "Bug phải mở client nó mới biết tin mới à? Tắt hết client rồi mở lại muốn nhận biết như Pancake" → "lấy list unread pancake là được" → **"đâu có cần cron → khi vào trang / chọn / đổi chiến dịch → fetch pancake unread cho vào cache rồi cập nhật bảng, xóa cache khi cập nhật khách"**.

**Gap:** cột TIN NHẮN dựa WS realtime ADD `pending_customers`. WS KHÔNG replay event đã miss (restart/token gap/không client) → tin tới lúc offline không vào badge → mở lại không thấy. Pancake luôn biết (giữ unread_count server-side).

**Approach (theo user — CLIENT-side, không poller server):** lần đầu làm server cron (`pancake-unread-discovery.js` + cron 5' + trigger /start) → **user bác "đâu cần cron" → REVERT toàn bộ server-side**, làm thuần frontend fetch trực tiếp Pancake từ browser (đúng triết lý project).

**Fix (frontend, `new-messages-notifier.js` bump `?v=20260615a`):** `discoverUnreadFromPancake()` — duyệt `pdm.pages`, `pdm.fetchConversationsForPage(pageId)` (official v2 + PAT, đã cache, `unread_first`) → lọc `unread_count>0` + INBOX + không shop-sent-last → `onNewConversationEvent({unread_count,phone,...})` (dedupe psid + tôn trọng `_wasRecentlyReplied` + SET inboxCount=unread) → reapply badge. Cache = `_pendingCustomers` (localStorage); clear theo khách = `clearPendingForCustomer` khi shop reply (đã có). Thêm `phone` vào entry onNewConversationEvent (match badge theo SĐT). **Trigger:** (1) `_discoverOnEnter` chờ pdm sẵn sàng rồi fire 1 lần (vào trang); (2) `continueAfterCampaignSelect` (tab1-init.js, bump `?v=20260615a`) sau `handleSearch()` — chạy khi vào trang + chọn + đổi chiến dịch. KHÔNG interval mới.

Web 1.0 only, frontend-only (GH Pages, không cần deploy Render). `node --check` PASS. **Status:** ✅ — MEMORY [[reference_web1_realtime_msg_column]].

### [web2] J&T `_parsePasteDate` — siết đọc ngày dòng dán (chống typo/ngày cũ/ghi chú) ✅

User: "siết lại" (cách đọc ngày dòng dán nạp vào kho tin). Dòng thật `...Ngọc Diễm- -16-20/08/2023...` parse ra 2023 → tin văng lên đầu chat. Siết [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) `_parsePasteDate(line, nowMs)`:

- Quét token ngày, **bỏ qua token RÁC** (range guard d/mo/y + round-trip `new Date` loại 31/02, 29/02 năm thường, 31/04…).
- **Token ngày THẬT đầu tiên = ngày đơn** (đứng trước SĐT/ghi chú) → gate **cửa sổ [now−180d, now+2d]** rồi DỪNG. Trong cửa sổ → dùng; ngoài (typo/cũ như 2023) → `null` (caller dùng `ts` = coi như tin mới). **KHÔNG** quét tiếp ngày trong ghi chú (tránh lấy nhầm ngày-hẹn-giao làm giờ tin — lỗi reviewer chấm HIGH). Truyền `nowMs=ts`.
- **Verify**: workflow 5 agent (4 sinh ca đối kháng + 1 review) → **86 ca** (25 của tôi + 61 workflow) chạy node harness deterministic, khớp 100% hợp đồng siết (4 "diff" so kỳ vọng cũ chính là 4 ca note-fallthrough giờ trả null — đúng ý). Bỏ dead-code `Number.isNaN`. Backend-only → cần deploy web2-api.

### [web2] J&T highlight tin — fix cuộn trượt (lazy-load shift) + ring rõ trên bong bóng ✅

User: "nạp ok nhưng chưa thấy highlight". Browser-test live (176 tin/nhóm 792, 156 paste): `findMessageInChat` TÌM ĐÚNG + add `.jt-msg-hit` (hit:true) nhưng **tin nằm dưới khung** (hitOffsetTop 1137 > viewport 724) → user không thấy. Root: `scrollIntoView({behavior:'smooth'})` chạy khi ảnh/avatar phía trên còn load lazy → layout dịch → smooth-scroll trượt chỗ. Phụ: ring `.jt-msg-hit` đặt trên hàng `.wz-msg` (rộng hết khung) mờ + pulse 3× tắt trước khi nhìn.

- [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) `findMessageInChat`: cuộn **tức thì** (`behavior:'auto'`) + **re-assert 7×/200ms (~1.4s)** bám đúng tin khi layout còn dịch. Verify 3 mã (nông + sâu 2023): inView:true (offset 305/116/305 trong 724).
- [jt-tracking.css](web2/jt-tracking/css/jt-tracking.css): ring chuyển sang **bong bóng tin** (`.jt-msg-hit .wz-msg-bubble`) — viền xanh `--jt-primary` 2px+7px + nền 22%, pulse 5×. Rõ hẳn (screenshot xác nhận).
- Bump `jt-tracking.css`/`jt-tracking-app.js?v=20260615bf2`. Frontend-only (không cần deploy web2-api).

### [web2][live-chat] comments-mobile: bỏ nút Gọi/Mở FB ở sheet + highlight comment mới 3s ✅

User: "bỏ nút gọi đt + mở facebook"; "comment mới highlight tồn tại 3s". [comments-mobile.js](live-chat/js/live/comments-mobile.js): gỡ `.sh-actions` (2 nút Gọi + Mở Facebook) khỏi sheet chi tiết (giữ "Xem khoảnh khắc" + "Ẩn tất cả comment"). [comments-mobile.html](live-chat/comments-mobile.html): `@keyframes cardIn` giữ khung xanh tới 85% + `.card.is-new animation 1.5s→3s` → comment mới có khung xanh ~3s rồi mờ. Bump `comments-mobile.js?v=20260615live2`.

### [web2][live-chat] comments-mobile mặc định "ĐANG LIVE" (gộp bài đang live) thay vì "Tất cả" ✅

User: "đừng chọn Tất cả → chọn cái đang livestream thôi → House+Store đang live thì chọn cả 2". [comments-mobile.js](live-chat/js/live/comments-mobile.js): thêm `liveMode` (mặc định true) — gộp comment các bài ĐANG LIVE (`posts.filter(postLiving)`, gồm House+Store). Picker thêm dòng **"🔴 Đang livestream (gộp)"** (mặc định chọn) trên "Tất cả". `load()` query `?postIds=<living ids CSV>`; `visible()` lọc `passLive`; `realCommentTotal`/`updateLiveTag`/`getPostIds` theo liveMode; reload khi biết bài live (overrideRealCounts). Chọn "Tất cả"/1 bài cụ thể vẫn được. Bump `comments-mobile.js?v=20260615live`.

### [web2] "Tăng comment" gửi GIỐNG 100% Pancake (capture browser-test) + đa nhiệm qua JWT account ✅

User: "gửi payload/url giống 100% Pancake; không có nút ẩn comment". Browser-test pancake.vn + user gửi tay → **capture request thật** (hook fetch/XHR): `POST /api/v1/pages/{pid}/conversations/{convId}/messages?access_token={JWT_USER}` (KHÔNG phải page_access_token!), body `{action:'reply_comment', message_id, parent_id:convId, user_selected_reply_to:null, post_id, message, send_by_platform:'web'}`. Extension `content/pancake-bump.js` dùng y hệt. **Không có cờ/nút ẩn** → comment vốn hiện (gửi vào hội thoại PAGE → reply nested dưới comment page, như Pancake).

- [web2-chat-client.js](web2/shared/web2-chat-client.js): `Web2Chat.sendLiveComment(pageId, conv, msg, {jwt, messageId})` gửi byte-for-byte như capture (`/api/pancake/...?access_token=JWT`); `getPageAccountJwts(pageId)` = JWT mọi account admin page (dedupe) cho đa nhiệm.
- [multi-tool.js](web2/multi-tool/js/multi-tool.js) `run()`: 1 worker / ACCOUNT, mỗi worker access_token = JWT account đó (thay PAT). Trước đây dùng `/api/pancake-official/...?page_access_token=` + customerId → KHÁC Pancake. Bump `web2-chat-client.js`+`multi-tool.js?v=20260615pc100`.

### [web2] J&T "Dán lịch sử" — NẠP dòng dán vào kho tin chat (không chỉ trích mã) ✅

User: "sao lúc tôi dán kết quả vào bạn không nạp vào để lấy đủ dữ liệu?". Đúng — `/scan-text` cũ CHỈ trích mã 12 số → bảng `web2_jt_tracking` (src_message = nguyên dòng); KHÔNG nạp dòng dán vào kho tin chat `web2_zalo_messages` (chat đọc từ đây) → bấm mã DÁN TAY không cuộn/highlight được. Mà nội dung dán user cuộn tay ở Zalo Web là nguồn tin CŨ giàu hơn cả backfill zca (more:0 ~20 tin).

- **Server** [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) `/scan-text`: nhận thêm `convId`; `_resolveTargetConv` (convId client gửi → nhóm đang xem; fallback nếu chỉ theo dõi 1 nhóm). Mỗi dòng có mã: (1) upsert J&T row + set `zalo_conv_id`; (2) NẠP dòng thành 1 tin `web2_zalo_messages` (`msg_id='paste:<code>'`, `sent_at`= ngày đơn DD/MM/YYYY parse GMT+7 hoặc ts, direction 'in', group). **Dedup**: bỏ qua nếu nhóm đã có TIN THẬT chứa mã (content ILIKE) → không trùng realtime/backfill. SSE `web2:zalo:messages`+`web2:zalo:thread:<id>` để chat đang mở tự refresh. Trả `{found, added, messagesAdded}`.
- **Client** [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js): gửi `convId:_jtGroupConvId`; toast thêm "· nạp N tin vào chat". Bump `?v=20260615bf`.
- Kết quả: dán xong → chat nhóm hiện đủ dòng đã dán + bấm mã dán tay cuộn/highlight được (không còn toast "không có tin trong nhóm"). Backend cần deploy web2-api.

### [web2][shared] Fix đa nhiệm "Tăng comment" — chỉ chạy 1 account (acc.pages format object) ✅

User: "gửi chậm, không có đa nhiệm song song" (log "1 tài khoản"). **Root cause**: `acc.pages` = mảng **object** `[{id,name}]` (KHÔNG phải id string) → filter `acc.pages.includes(String(pageId))` trong `generateAllPageAccessTokens`/`generatePageAccessToken` LUÔN false → loại hết 6 account → fallback 1 (active JWT). Verify Render DB: 6 account, #0/#3… đều admin House. Fix [web2-chat-client.js](web2/shared/web2-chat-client.js): helper `_pagesHas(pages, pageId)` so theo `p.id` (xử lý object), sửa cả 2 chỗ. Giờ N account admin page → N PAT (user-specific, phân biệt) → N worker song song. Bump `web2-chat-client.js?v=20260615tag3` (multi-tool + live-chat + native-orders).

### [web2][shared] Chat Zalo — "Tải tin cũ hơn" backfill lịch sử NHÓM từ Zalo về DB ✅

User: "scroll không load thêm được tin nhắn cũ à?" (đang xem chat nhóm "XỬ LÝ NJD - J&T"). Root: nút "Tải tin cũ hơn" chỉ hiện khi **DB** (`web2_zalo_messages`) còn tin cũ; nhóm này chỉ có batch realtime-captured (`hasMore:false`) → không nút → scroll không load gì. Tin cũ hơn (trước khi capture chạy) chưa từng vào DB.

- **Server** [web2-zalo.js](render.com/routes/web2-zalo.js): route mới `POST /conversations/:id/backfill {count}` — nhóm only, `zca.getGroupHistory(account_key, thread_id, count≤500)` → INSERT dedupe (`ON CONFLICT DO NOTHING`) vào `web2_zalo_messages`, KHÔNG đụng row conversation (không bump unread/last_msg vì là tin CŨ). Tiện thể `autoIngestFromZalo` mã đơn J&T trong tin vừa kéo về. Trả `{added, fetched, more}`. ⚠ zca-js 2.1.2 chỉ trả batch gần nhất (more>0 = còn cũ hơn nhưng KHÔNG có cursor lấy tiếp) → backfill 1 lần lấy nhiều hơn batch realtime nhưng có trần.
- **Client API** [web2-zalo-api.js](web2/shared/web2-zalo-api.js): `ZaloApi.backfill(convId, count)`.
- **Chat view** [chat-view.js](web2/shared/zalo-chat/chat-view.js): nhóm luôn hiện nút "Tải tin cũ hơn" (kể cả DB hết tin, 1 lần/phiên qua `backfilledOnce`). `loadOlder()`: (1) còn DB → phân trang keyset (lọc trùng msg_id); (2) DB hết + nhóm → `backfill(200)` → tải lại từ DB → toast "Đã tải thêm N tin cũ từ Zalo" / "Zalo không còn tin cũ hơn".
- Bump `ENGINE_VER='20260615bf'` (web2-zalo.js) + tag `web2-zalo.js?v=20260615bf` (jt-tracking/balance-history/customers) + `web2-zalo-api.js`/`chat-view.js?v=20260615bf` (web2/zalo). Backend cần deploy web2-api.

### [web2] "Tăng comment" — ô Giãn nhịp đổi sang GIÂY (thập phân), cho 0.1–1.5s ✅

User: "nhập 0.5s, 0.1s có tác dụng không?" → KHÔNG: ô cũ là **ms** + `parseInt("0.1")=0` → rơi về 1500ms + min-clamp 500. User nghĩ theo giây. Đổi ô [boostDelay](web2/multi-tool/index.html) sang **đơn vị giây** (number thập phân, value 1.5, min 0.1, step 0.1); [multi-tool.js](web2/multi-tool/js/multi-tool.js) parse `parseFloat * 1000` (min 0.1s=100ms), hint "= N ms/comment mỗi tài khoản". Giờ 0.5→500ms, 0.1→100ms thật. Bump `multi-tool.js?v=20260615sec`.

### [web2] "Tăng số lượng comment" ĐA NHIỆM theo nhiều account Pancake (1 worker/account) ✅

User: "đa nhiệm đi vì có nhiều account Pancake tôi add vào — cứ chạy tối đa số account được add".

- [web2-chat-client.js](web2/shared/web2-chat-client.js): `sendMessage` nhận `opts.pageAccessToken` (override PAT/worker). Thêm `Web2Chat.generateAllPageAccessTokens(pageId)` — mint PAT cho MỌI account đã add (song song), dedupe theo PAT (mỗi user→1 page_access_token riêng = bucket rate-limit FB khác nhau → throughput cao hơn).
- [multi-tool.js](web2/multi-tool/js/multi-tool.js) `run()`: chạy **1 worker / PAT** chia chung counter `claimed` (JS 1 luồng → atomic), mỗi worker `sendMessage(...pageAccessToken)` + giãn nhịp riêng → tổng ≈ N/delay. Rate-limit ở BẤT KỲ worker → `_stop=true` dừng TẤT CẢ. Log `[T1]/[T2]…` + "Đa nhiệm: N tài khoản song song". Không account nào mint được → 1 worker PAT mặc định (như cũ).
- Bump `web2-chat-client.js?v=20260615tag2` + `multi-tool.js?v=20260615multi`.

### [web2][shared] Gộp tag Pancake VÀO Web2Chat (bỏ file rời) — trang chỉ tham chiếu Web2Chat ✅

User: "tôi tưởng pancake build vào shared để dùng chung, các trang chỉ tham chiếu tới". → Gộp logic tag từ file rời `web2-pancake-tags.js` (vừa tạo) VÀO `Web2Chat` ([web2-chat-client.js](web2/shared/web2-chat-client.js)): `Web2Chat.ensureTags(pageId)` / `tagDefsFor` / `resolveTags` / `tagPillsHtml(pageId, conv.tags)` (pill inline-style, không cần CSS rời). XOÁ `web2-pancake-tags.js` + auto-loader trong chat-panel. [Web2ChatPanel](web2/shared/chat-panel/web2-chat-panel.js) `renderTags()` dùng `Web2Chat.*`. Bump `web2-chat-client.js`+`web2-chat-panel.js?v=20260615tag2` (live-chat index/chat/mobile + native-orders).

### [web2] J&T mở chat — highlight chỉ chạy khi tin CÓ trong nhóm đã lưu; báo rõ khi không ✅

User: bấm nút mở chat không thấy kéo tới + highlight. Browser-test: chat mount OK, mã **scanned** (802763058048) highlight ngay (`.jt-msg-hit`), nhưng mã **dán tay** (802759937370) thì group conv chỉ có **16 tin lưu (`hasMore:false`)** và **không chứa tin dán tay** → không có gì để cuộn tới. Root: chat đọc `web2_zalo_messages` (realtime-captured); mã "Dán lịch sử" copy từ Zalo Web KHÔNG qua capture → tin gốc không nằm trong nhóm đã lưu. Fix `findMessageInChat`: click "Tải tin cũ hơn" tối đa 8 lần (khi còn), hết tin cũ mà chưa thấy → toast rõ "Mã X không có tin trong nhóm đã lưu (mã dán tay/tin cũ) — nhóm đã mở để xem" thay vì im lặng. Bump app `?v=20260615y`. Frontend-only.

### [web2][shared] Tag hội thoại Pancake — module dùng chung Web2PancakeTags + hiện tag trên chat ✅

User: "thêm vào shared pancake dùng chung các tag của Pancake, đoạn hội thoại khách sẽ hiện tag như Pancake".

- Verify shape thật: `conv.tags` = mảng **ID số** (`[58,68]`); định nghĩa (text+màu) ở **page settings** `settings.tags` (`{id,text,color,lighten_color}`, Store 14 tag).
- Module mới [web2/shared/web2-pancake-tags.js](web2/shared/web2-pancake-tags.js) (`Web2PancakeTags`): `ensure(pageId)` nạp+cache defs (qua `Web2Chat.fetchPageSettings`), `resolve()` map id→def, `pillsHtml(pageId, conv.tags)` render pill màu (chữ tương phản theo độ sáng nền), tự inject CSS `.w2pk-tag`. NGUỒN DUY NHẤT cho tag — đừng fetch nơi khác.
- [Web2ChatPanel](web2/shared/chat-panel/web2-chat-panel.js): auto-load web2-pancake-tags.js + `renderTags()` hiện pill tag trong header hội thoại (defs chưa nạp → ensure rồi render lại, async, no-op nếu conv không tag). Bump `web2-chat-panel.js?v=20260615tag` (live-chat index/chat + native-orders).

### [web2] J&T — tag 2-chiều/toggle + nút chat cho mọi row + highlight tin có mã ✅

User: (1) tag "XỬ LÝ BC" không sync 2 chiều + muốn bấm lần nữa GỠ có custom confirm; (2) mã dán tay không hiện nút nhắn nhóm Zalo; (3) mở chat tìm tin có mã → highlight lên.

- **Tag TOGGLE 2-chiều** ([jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js)): `resolvePancakeConv` trả thêm `conv.tags` → `tagPancake` đọc trạng thái THẬT trên Pancake (có thẻ chưa) → đồng bộ nút+localStorage; đã có → **custom confirm `jtConfirm` "Gỡ thẻ?"** → `toggleTag(...,'remove')`; chưa có → 'add'. Helpers `unmarkTagged`/`setTagButtons`. (fallback localStorage nếu search không trả tags.)
- **Nút chat cho MỌI row**: suy `_jtGroupConvId` từ row có sẵn `zalo_conv_id` (trong renderList) → mã dán tay (thiếu conv) vẫn mở nhóm J&T + nhảy tới tin.
- **Highlight tin có mã GIỮ lại** (không tự tắt 2.6s): nháy 3 lần thu hút rồi đứng yên (ring xanh + nền), clear highlight cũ khi mở mã khác. CSS `.jt-msg-hit`.
- Frontend-only; bump css/app `?v=20260615x`.

### [web2][live-chat] Badge "comment" hiển thị TỔNG comment THẬT từ Pancake (comment_count) ✅

User: "tổng số comment lấy ở Pancake được nè" (Pancake "Quản lý bài viết" có comment_count thật mỗi bài: 53, 1.0K…). Badge live-chat trước đếm số ROW đã load (→ "200+").

- [web2-chat-client.js](web2/shared/web2-chat-client.js): thêm `Web2Chat.fetchLivePosts(pageId)` — fetch trực tiếp Pancake `pages/{id}/posts` (KHÔNG poller), trả posts kèm **`commentCount`** (=`comment_count` thật) + living/title/date, cache 60s/page.
- Desktop [live-comment-list.js](live-chat/js/live/live-comment-list.js): `_updateRealCommentTotal()` — tổng `comment_count` các post đang xem (distinct post_id của comment), override badge `💬 N` (giữ số đã-load làm fallback tức thì, seq-guard chống race).
- Mobile [comments-mobile.js](live-chat/js/live/comments-mobile.js)+[html](live-chat/comments-mobile.html): load web2-chat-client + `syncFromRenderDB()` lấy JWT → `overrideRealCounts()` ghi đè `comment_count` posts bằng số Pancake; badge = tổng count post đang xem (selectedPost → bài đó; "Tất cả" → tổng). Fallback đếm row nếu thiếu JWT (graceful).
- Field Pancake: `comment_count` (verified prod: 1037→"1.0K", phone_number_count=11). Bump live-chat refs `?v=20260615lp1`.

### [web2][shared] Web2CustomerChat — bấm SĐT ở header drawer để copy ✅

User: trong khung chat KH (Web2CustomerChat), SĐT ở header "Khách 0904455856" bấm vào copy. Thêm `data-w2cc="copyphone"` + class `.w2cc-phone` (cursor pointer, hover xanh) cho `<span>` SĐT; click handler `_copyPhone()` (clipboard + toast). [web2-customer-chat.js](web2/shared/web2-customer-chat.js). Bump launcher `?v=20260615c` ở jt-tracking + balance-history + customers. Frontend-only.

### [web2][render] "Làm mới tất cả" CHỈ tra đơn "Chưa tra" (pending) — đơn khác dùng nút từng dòng ✅

User: "làm mới tất cả ưu tiên đơn chưa tra → đơn khác có nút riêng rồi". Đổi query `/refresh` (nhánh no-codes): `WHERE approved_at IS NULL AND status='pending'` (bỏ transit/delivering/not_found/stale). → không tra lại hàng loạt đơn đã chốt (khỏi bị jtexpress chặn + khỏi treo vòng lặp UI). Đơn đã có trạng thái muốn cập nhật → nút làm mới ↻ TỪNG DÒNG (`/track`, đã có). Thêm tooltip nút. Verified: pending 31→1 sau bản gentler trước đó. ([web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js))

### [web2] Chuyển "Studio chụp tách nền" vào group "Đa dụng Web 2.0" ✅

User: chuyển photo-studio vào group đa dụng. [web2-sidebar.js](web2/shared/web2-sidebar.js): bỏ "Studio chụp tách nền" khỏi "Tính năng mới" → thêm vào group "Đa dụng Web 2.0" (giờ có 2 trang: Tăng số lượng comment + Studio chụp tách nền). Bump `web2-sidebar.js?v=20260615db` × 39 trang.

### [web2] "Đa dụng Web 2.0" thành GROUP sidebar + "Tăng số lượng comment" là trang trong group ✅

User: "Đa dụng Web 2.0 là 1 group ở menu, Tăng số lượng comment là 1 trang trong đó".

- [web2-sidebar.js](web2/shared/web2-sidebar.js): bỏ `{Đa dụng}` khỏi group "Tính năng mới" → thêm group top-level mới **"Đa dụng Web 2.0"** (icon `wrench`) chứa child **"Tăng số lượng comment"** → `web2/multi-tool/index.html`. (mở rộng được: thêm tool mới = thêm trang + child.)
- [multi-tool/index.html](web2/multi-tool/index.html): h1 "Đa dụng Web 2.0" → **"Tăng số lượng comment"** (icon trending-up), bỏ tab bar dư thừa (group đã cung cấp ngữ cảnh), title tag + #Note cập nhật.
- Bump `web2-sidebar.js?v=20260615da` trên 39 trang để menu mới hiện.

### [render] J&T /refresh — gentler để hết kẹt "Chưa tra" (jtexpress throttle khi tra dồn) ✅

User: 32 đơn "Chưa tra" làm mới không được. Chẩn đoán: `/track` đơn lẻ 1 mã kẹt → OK ngay (returned, 19 event) ⇒ mã hợp lệ, do **batch /refresh tra song song 5/đợt × 20 đợt liên tục → jtexpress.vn throttle → timeout → kẹt pending** (khác 'not_found'=fetch OK 0 event). Fix [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js): CONC 5→**3**, **retry 1 lần** (nghỉ 700ms) khi fetch lỗi, **nhịp 350ms giữa các đợt**, REFRESH_BATCH 25→**15** (mỗi call snappy, tránh treo request). Pending sẽ về 0 sau vài lần "Làm mới tất cả".

### [web2][render] Ẩn spam "tăng comment" khỏi live-chat — boost-mark XOÁ + chặn + nút Dọn ✅

User: "sao live-chat vẫn hiện các comment count này? Không có type/cách nào ở dữ liệu Pancake nhận biết à?"

- **Điều tra (empirical)**: query row thật của spam (40R5wXr…) → `fb_id=24961649996856997` = **Ellie Lương (chủ hội thoại), KHÔNG phải page**; created 09:05 UTC = spam **THỦ CÔNG trên Pancake** (trước khi tool fix message_id). Vì page reply vào comment của khách → Pancake gán vào hội thoại KHÁCH. **Xác nhận: realtime WS KHÔNG có field "page-authored"** (heuristic `from===page` vô dụng cho reply). Cách tin cậy duy nhất từ data = fetch từng message xem author=page → đó là "poll lại" (đã bỏ).
- **Fix**: `/boost-mark` ([web2-live-comments.js](render.com/routes/web2-live-comments.js)) giờ ngoài chặn ingest event mới (in-memory TTL 20') còn **XOÁ comment đã ingest của conv** (`DELETE … WHERE id=$1 OR starts_with(id,$1||'_')`) + `_notify('reconcile')` → live-chat đang mở tự bỏ. Deterministic (tool biết chính xác conv).
- **Tool** ([multi-tool.js](web2/multi-tool/js/multi-tool.js)): markBoost trả `purged`; thêm nút **"Dọn comment đã tăng"** (`cleanConv`) để dọn spam (kể cả gõ tay) của hội thoại đang chọn KHÔNG cần spam. run() vẫn markBoost trước + mỗi 100 tin.
- **Lưu ý bản chất**: spam THỦ CÔNG trên Pancake KHÔNG tự ẩn được (không có signal data) → khuyến nghị spam QUA TOOL (auto ẩn+dọn), hoặc bấm "Dọn comment đã tăng". Icon `message-circle-plus`→`trending-up`/`eraser` (có trong lucide 0.294). Bump `multi-tool.js?v=20260615f`. ⚠ deploy web2-api.

### [web2] J&T — bỏ nút "Xóa hết & quét lại" ✅

User: "bỏ nút xóa quét lại hết". Gỡ nút `jtClearAll` (danger) + hàm `clearAll()` + wiring khỏi [index.html](web2/jt-tracking/index.html)+[jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) — tránh xoá nhầm toàn bộ (đã từng gây mất 1 đơn). Route `/clear` backend giữ nguyên (không UI gọi). Bump app `?v=20260615w`. ("Chưa tra" = status pending: mã đã thêm nhưng CHƯA tra cứu J&T → bấm "Làm mới tất cả" để tra.)

### [web2] J&T script Console — bỏ console.log/clipboard (Zalo chặn) → INJECT ô kết quả vào trang ✅

User: "script vẫn Promise pending, không hiện/hoạt động gì". Root-cause: **Zalo Web chặn `console.log` + `clipboard.writeText` reject khi DevTools đang focus** → script CHẠY nhưng không log + clipboard rỗng → tưởng treo. Fix: script không dùng console/clipboard làm output nữa — **inject 1 ô nổi (z-index max) góc phải trang Zalo**: hiện tiến độ cuộn + khi xong show `<textarea>` chứa các dòng đơn (tự bôi đen sẵn) + vẫn thử copy clipboard. User đọc/copy thẳng từ ô → dán "Dán lịch sử". Verified scraping logic live trước đó (cuộn 8 lần 11→28 mã trên nhóm thật). Bump app `?v=20260615v`. Frontend-only.

### [docs][web2] Quy ước "REALTIME, KHÔNG POLLER" — note vào CLAUDE.md + MEMORY + overview ✅

User: "realtime, không poller → note vào memory, claude, devlog + overview". Chốt quy ước Web 2.0: đã bỏ hẳn poller nền (user xác nhận 2026-06-15) → realtime dùng **SSE**; liệt kê/fetch dữ liệu Pancake (bài đang/đã live, hội thoại, comment) → **fetch TRỰC TIẾP Pancake từ browser** qua worker `/api/pancake/*` + JWT (vd `pages/{id}/posts` cho đang/đã livestream — đúng nguồn "Quản lý bài viết"). KHÔNG `setInterval`/poll mới, KHÔNG đi vòng route server gọi poller.

- [CLAUDE.md](CLAUDE.md) §"⚡ SSE-first" → thêm tiểu mục "⚡ REALTIME, KHÔNG POLLER (BẮT BUỘC)".
- MEMORY: `feedback_web2_realtime_no_poller.md` + index.
- [web2/overview/index.html](web2/overview/index.html) `#conventions` → bullet Realtime-không-poller (canonical).
- Ghi rõ state thật: `web2-livestream-poller.js` `start()` không schedule `_loop()` (background poll DISABLED); 4 helper còn lại on-demand (reconcileFullText/pollNow/pollPostNow/listLivePostsForAssign) — không thêm mới. `/page-posts` trả 0 bài trên web2-api → đừng dùng UI mới.

### [web2] J&T script Console Zalo — bỏ IndexedDB (gây treo Promise) → auto-scroll DOM ✅

User: "dán console → enter → Promise pending quá lâu". Nguyên nhân: phần IndexedDB `getAll()`+`JSON.stringify` trên store khổng lồ/blob của Zalo → freeze, promise không resolve. Sửa: bỏ hẳn IndexedDB; script mới **tự cuộn khung chat lên** (tìm div cuộn lớn nhất) + đọc `document.body.innerText` (tin đã giải mã) mỗi 500ms, gom mã, **cap 60s + dừng khi 12 vòng không thêm mã**, log tiến độ + "XONG … Da copy". Console ASCII (không emoji/dấu) cho an toàn copy. Cập nhật bước 3 modal (đợi ~30-60s, "Promise pending" lúc đầu là bình thường). Bump app `?v=20260615t`. Frontend-only.

### [web2][render] "Tăng comment" — chọn Bài live (gồm đã xong) + ẨN spam khỏi live-chat ✅

User: (1) "đã livestream xong vẫn cho chọn", (2) "mặc định chọn mới nhất", (3) "đừng hiện các spam comment count này vào live-chat/comments-mobile", (4) "các comment này có type/nhận biết được không → để không hiện".

- **Bug gốc**: [multi-tool.js](web2/multi-tool/js/multi-tool.js) dùng `Web2Chat.fetchConversationsByPage` — hàm này **hardcode `type:'INBOX'`** → KHÔNG bao giờ trả COMMENT → dropdown rỗng ("Không có hội thoại COMMENT") dù live đang chạy hay đã xong.
- **Fix chọn bài (KHÔNG poller — user: "đã bỏ poller để dùng realtime")**: picker **Bài live** fetch **TRỰC TIẾP Pancake từ browser** `GET /api/pancake/pages/{id}/posts?start_time&end_time` (qua worker + JWT — đúng endpoint Pancake dùng cho "Quản lý bài viết" đang/đã livestream), lọc `type==='livestream'`, map `living = live_status==='LIVE'||is_living`. optgroup **"🔴 Đang Livestream"** (ưu tiên đầu, mặc định chọn) + **"Đã Livestream"** (14 ngày, sort mới nhất). KHÔNG còn đi qua `/page-posts` (poller server-side — trả 0 bài trên web2-api sau split + sai nguyên tắc realtime). Chọn bài → fetch hội thoại COMMENT trực tiếp Pancake `?type=COMMENT&post_id=...`, sort `updated_at` desc, auto-chọn mới nhất. Verify prod: House 9 / Store 11 bài livestream, 0 đang live (khớp ảnh Pancake), GMT+7 khớp (06:44 UTC→13:44).
- **Ẩn spam khỏi live-chat** (câu hỏi "có type không"): comment spam = page tự `reply_comment` → quay vòng qua WS → `/ingest` → `web2_live_comments` → hiện ở live-chat. WS payload KHÔNG có flag "page-authored" tin cậy (conv.from/customers vẫn là chủ hội thoại). Giải pháp 2 lớp trong [web2-live-comments.js](render.com/routes/web2-live-comments.js): (1) **deterministic** — multi-tool gọi `POST /boost-mark {convId}` (TTL 20') → `/ingest` BỎ QUA conv đó (không lưu DB + không SSE); (2) **heuristic phụ** — `conv.from.id === conv.page_id` (page tự comment trên post của mình) cũng bỏ. Path poll-now: [web2-livestream-poller.js](render.com/services/web2-livestream-poller.js) bỏ message `m.from.id === pageId`.
- multi-tool re-mark mỗi 100 tin (run dài). Bump [multi-tool/index.html](web2/multi-tool/index.html) `multi-tool.js?v=20260615b`. ⚠ deploy web2-api (route mới `/boost-mark` + filter ingest/poller).

### [web2] J&T "Dán lịch sử" — thêm script Console Zalo Web (copy sẵn) + hướng dẫn ✅

User: "cho nút hiện đoạn script + ô dán kết quả có hướng dẫn". Modal "Dán lịch sử" giờ gồm: (1) hướng dẫn 4 bước, (2) **ô script** (đọc từ `<script type="text/plain" id="jtZaloScript">` ẩn — moi mã đơn từ IndexedDB + DOM Zalo Web) + nút **"Copy script"**, (3) ô dán kết quả → "Quét mã" → `/scan-text`. Script lưu dạng text/plain để khỏi escape; verify `node --check` đoạn extract OK. Frontend-only; bump css/app `?v=20260615s`.

### [web2] Trang MỚI "Đa dụng Web 2.0" + tab "Tăng số lượng comment" ✅

User: spam comment bằng auto-gõ random + Enter trên Pancake (page reply_comment) → mang vào Web 2.0 thành 1 trang đa dụng (tab framework), tab đầu = tăng comment.

- Trang [web2/multi-tool/](web2/multi-tool/index.html) + [multi-tool.js](web2/multi-tool/js/multi-tool.js): tab bar (mở rộng được), tab "Tăng số lượng comment".
- **Engine**: chọn page → load hội thoại COMMENT (Web2Chat.fetchConversationsByPage) → chọn 1 → N comment + giãn nhịp(ms) + text random/mẫu → loop `Web2Chat.sendMessage(pageId,convId,{action:'reply_comment',text,customerId})` (ĐÚNG cách Pancake gõ+Enter, page tự comment). Progress + log + Dừng. **DỪNG ngay khi FB rate-limit** (e_subcode 3252001/e_code 368/policy) tránh khoá page.
- Sidebar "Tính năng mới" → "Đa dụng" ([web2-sidebar.js](web2/shared/web2-sidebar.js)); bump sidebar `?v=20260615mt` 36 trang. ⚠ Chỉ dùng cho live của shop (engagement nội bộ, không gửi tới khách).

### [web2][render] J&T "Dán lịch sử" — paste text copy từ Zalo → quét mã đơn cũ ✅

User hỏi lấy file lịch sử Zalo ở Chrome / bấm browser được không. Trả lời: Zalo Web mã hoá payload (AES) + IndexedDB nội bộ → không có file đọc được; cách khả thi = **copy text chat → dán**. Thêm `POST /api/web2-jt-tracking/scan-text {text}` ([web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js)): quét theo dòng + toàn văn bằng `extractOrderCodes` (đúng format `<mã> Shop NHI JUDY`), src_message = dòng chứa mã, source 'zalo' note 'dán lịch sử'. UI nút **"Dán lịch sử"** (clipboard-paste) + modal textarea ([jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) `openPasteModal`, reuse CSS `.jt-msg-*`). Bù được lịch sử cũ mà Zalo API trả `more:0`. Bump app `?v=20260615r`. ⚠ deploy web2-api.

### [web2][render] J&T "Quét lịch sử" → quét 14 NGÀY + chẩn đoán độ sâu ✅

User: "quét tin nhắn lịch sử 14 ngày đi". `/scan-history` giờ nhận `days` (mặc định 14) + `count` cao (1000) → lọc tin theo `sentAt >= now - days`. ⚠ Phát hiện giới hạn: zca-js 2.1.2 `getGroupChatHistory(groupId, count)` KHÔNG có cursor (`lastMsgId`) → mỗi call chỉ trả batch tin GẦN NHẤT (count 50 vs 500 đều ~35 tin), response có `more>0` báo còn tin cũ hơn NHƯNG không lấy tiếp được. → scan-history trả thêm `rawTotal`/`more`/`oldestDate` để biết với tới đâu; nút "Quét lịch sử" báo "tới <ngày>" + cảnh báo nếu Zalo còn tin cũ hơn. 14 ngày đầy đủ vẫn dựa vào realtime listener (`web2_zalo_messages`, "Quét Zalo" đã quét hết). Bump app `?v=20260615q`.

### [orders-report][don-inbox] Fix bill PBH lẻ MẤT MÃ VẠCH khi in (barcode pre-render data-URI, bỏ race ảnh ngoài) ✅

**User:** "khi tạo đơn bằng phiếu bán hàng lẻ ở don-inbox bill in bị mất mã vạch? kiểm tra kỹ lại lỗi tại sao? tham khảo orders-report/main.html"

**Root cause (RCA 6-agent workflow, adversarial verify KHÔNG bác):** Mã vạch trên bill là ảnh NGOÀI `<img src="https://statics.tpos.vn/Web/Barcode?...">` render trong popup `window.open('')` (document.write). `openPrintPopup` gọi `print()` theo timer cố định (onload+500ms / fallback +1500ms) rồi `onafterprint => close()` NGAY — **regression commit `44e8446e2` (2026-03-19)**. Ảnh cross-origin ~10KB tải chưa xong khi print()/close() → mã vạch in trắng, còn dòng "Số phiếu" (text đồng bộ) vẫn in. **Code DÙNG CHUNG** (`confirmAndPrintSale`→`openPrintPopup`→`generateCustomBillHTML` trong [bill-service.js](orders-report/js/utils/bill-service.js)); don-inbox lộ rõ hơn vì là trang top-level (orders-report chạy trong iframe `tab1-orders.html` đã warm origin). KHÔNG phải lỗi thiếu Number, KHÔNG phải space trong "Code 128" (browser tự encode %20, endpoint HTTP 200), KHÔNG phải stale cache (markup barcode bất biến từ 2026-02-25).

**Fix:** Pre-render CODE128 trong PARENT context thành PNG data-URI (như [web2-bill-service.js](web2/shared/web2-bill-service.js)) → bill không cần fetch mạng, không race. [bill-service.js](orders-report/js/utils/bill-service.js): (1) loader inject JsBarcode (vendored `js/lib/jsbarcode-code128.min.js`, byte-identical web2, SHA1 `1547bfec`); (2) `_renderBarcodeDataUrl()` dùng `JsBarcode(canvas, billNumber, {format:'CODE128',width:2,height:100,displayValue:false,margin:0})` → `canvas.toDataURL`; (3) `barcodeSrc = _renderBarcodeDataUrl(billNumber) || barcodeUrl` (fallback ảnh TPOS nếu lib chưa load). Drop-in `<img>` → mọi consumer (popup in / iframe preview / innerHTML preview / html2canvas Messenger) đều có mã vạch, không đụng timer/onafterprint.

**Verify:** `node --check` PASS; browser smoke (Playwright) render `NJD/2026/72332` → `data:image/png` 356×100, `window.JsBarcode` = function. Bump `bill-service.js?v=20260615a` ở [don-inbox/index.html](don-inbox/index.html) (cũ 20260603a — stale), [orders-report/tab1-orders.html](orders-report/tab1-orders.html), [orders-report/tab-pending-delete.html](orders-report/tab-pending-delete.html). Cần GH Pages deploy + xác nhận in thực tế.

**Status:** ✅ code + smoke OK. ⚠ Khuyến nghị in thử 1 PBH lẻ thật trên don-inbox sau deploy để confirm visual.

### [live-chat] FIX native-orders 404 (mobile) + add-alt-phone 401 (desktop) ✅

- **404**: mobile `loadNativeOrders` gọi `/api/native-orders` trần → worker đẩy sang TPOS → 404. Endpoint LIST đúng = `/api/native-orders/load` (giống `NativeOrdersApi.list` desktop). Sửa path. [comments-mobile.js](live-chat/js/live/comments-mobile.js)
- **401**: desktop `_captureAltPhones` POST `/api/web2/customers/add-alt-phone` KHÔNG gửi `x-web2-token` (route `requireWeb2AuthSoft`, WEB2_AUTH_ENFORCE) → thêm `_w2AuthHeaders`. [live-init.js](live-chat/js/live/live-init.js). (harvest-comments đã gửi token sẵn — 401 lúc đầu do token chưa load/hết hạn → re-login nếu còn.)

### [web2][render] J&T "Quét lịch sử" — đọc lịch sử nhóm Zalo (zca) để quét đơn cũ/bị thiếu ✅

User: "đọc được lịch sử nhóm chat hôm nay để quét các đơn tin nhắn cũ hoặc bị thiếu không?". → Được: `/scan` cũ chỉ đọc `web2_zalo_messages` (chỉ có tin từ lúc listener kết nối) nên tin gửi TRƯỚC đó bị miss.

- **zca service** ([web2-zalo-zca.js](render.com/services/web2-zalo-zca.js)): FIX `getGroupChatHistory` (zca-js nhận `(groupId, count)` positional — wrapper cũ truyền object `{groupId,lastMsgId,count}` → hỏng, chưa ai dùng). Thêm `getGroupHistory(accountKey, groupId, count)` → `data.groupMsgs` map qua `_normMessage` (GroupMessage history CÙNG shape tin realtime: `.type/.data/.threadId/.isSelf`). ⚠ Lib version này KHÔNG hỗ trợ `lastMsgId` → chỉ lấy `count` tin gần nhất (no deep pagination).
- **route** ([web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js)): `POST /scan-history {count=200}` → quét nhóm trong allowlist `web2_zalo_tracked_groups` → `zca.getGroupHistory` → `extractOrderCodes` → upsert `web2_jt_tracking` (giống /scan: code→{tên/id nhóm, full content}). Trả {fetched, found, added, errors}.
- **UI** ([jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) + [index.html](web2/jt-tracking/index.html)): nút **"Quét lịch sử"** (icon history) cạnh "Quét Zalo" → `/scan-history` count 300 → load + auto refresh mã mới. Bump app `?v=20260615p`.
- ⚠ Cần deploy web2-api (zca service + route mới). Status: ✅ Done (deploy + verify).

### [web2][render] Chat KH: Zalo chat-by-phone (chưa từng nhắn vẫn chat được) + auto-scroll + nút tag đổi trạng thái ✅

User: "1. zalo chưa có đoạn hội thoại nhưng đã có SĐT thì vẫn lấy được thông tin + chat được (Zalo không chặn, chỉ khách chặn mới fail). 2. Pancake/Zalo tự cuộn xuống cùng. 3. Bấm tag XỬ LÝ BC → nút đổi khác để biết khách đã có tag."

- **Zalo chat-by-phone** (trước đây SĐT chưa từng nhắn → "Khách chưa có hội thoại Zalo"): thêm `POST /api/web2-zalo/conversation/ensure {phone}` ([web2-zalo.js](render.com/routes/web2-zalo.js)) → đã có row trả luôn; chưa có → chọn account personal đang KẾT NỐI → `zca.findUser(phone)` → upsert row rỗng (`thread_id=uid`, thread_type user, phone/tên/avatar) → trả về. `Web2Zalo.mountChat({phone})` ([web2-zalo.js](web2/shared/web2-zalo.js)) khi `getConversation` rỗng → gọi ensure → mount thread rỗng + composer → gửi tin đầu tạo thread thật. Không tìm thấy user Zalo → báo lý do.
- **Auto-scroll xuống cùng**: [web2-customer-chat.js](web2/shared/web2-customer-chat.js) sau mount Pancake (`panelInst.scrollToBottom()` +500ms) và Zalo (`.wz-chat-body.scrollTop=scrollHeight` +500ms); quay lại tab đã mount cũng re-scroll.
- **Nút tag đổi trạng thái**: [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) nhớ SĐT đã tag (`localStorage jt_tagged_phones`) → render nút xanh + icon `badge-check` + title "đã gắn thẻ". Sau khi gắn thành công → đổi NGAY mọi nút cùng SĐT. CSS `.jt-icobtn.tag.is-tagged` (xanh).
- Bump web2-zalo `?v=20260615e` + web2-customer-chat `?v=20260615b` (jt+balance-history+customers) + jt app/css `?v=20260615o`.
- ⚠ **Cần deploy web2-api** (route mới `conversation/ensure`). Frontend qua GH Pages. Status: ✅ Done (deploy + verify).

### [live-chat/mobile] Đồng bộ đơn native-orders xuống mobile (realtime) + STT ✅

User: (1) desktop kéo SP tạo đơn (sau 5s không hoàn tác) → mobile hiện comment đó "đã tạo đơn" realtime; (2) hiện STT giống native-orders ở comment khách có đơn.

- `loadNativeOrders()` [comments-mobile.js](live-chat/js/live/comments-mobile.js): GET `/api/native-orders?limit=500` → `NATIVE` map (fbUserId→{stt,code}), scope theo bài đang trong feed. STT = `campaignStt ?? displayStt ?? sessionIndex` (KHỚP trang Đơn Web).
- `ordered(c)` gộp native → status "✓ Đã tạo đơn" + `.card.ordered` + đếm chip Store/House gồm cả đơn native. STT badge `🛒 N` (`.cart-stt`) trên comment khách có đơn.
- **Realtime**: SSE `web2:native-orders` (desktop `_notify('create')`/`'comment-merged'`) → debounce 500ms reload NATIVE → re-render. Comment khách vừa được tạo đơn ở desktop tự hiện ở mobile. (`?v=20260615natord`)

### [live-chat/mobile] Bỏ thumbnail trên comments-mobile ✅

User: không cần hiện thumbnail. Gỡ `<img.thumb>` khỏi cardHtml + ngưng `fetchThumbs` (load + enrichDelta) → đỡ băng thông. `THUMBS` rỗng → detail sheet tự không hiện thumb. [comments-mobile.js](live-chat/js/live/comments-mobile.js) (`?v=20260615nothumb`).

### [cors][web2-api] FIX snap livestream bị CORS chặn (x-web2-token) ✅

Snap upload `POST /api/livestream/snapshot` post THẲNG web2-api (không qua worker) kèm header `x-web2-token` (WEB2_AUTH_ENFORCE) → preflight reject "x-web2-token not allowed". Thêm `x-web2-token`+`x-admin-secret`+`x-relay-secret` vào `allowedHeaders` [server.js](render.com/server.js). KHÔNG phải do localhost (localhost:8080 vốn trong allow-origin) — lỗi cả prod.

### [live-chat] Reconcile NỀN: snippet Pancake bị cắt → fetch full text (user chọn) ✅

WS-direct lưu `conv.snippet` bị Pancake cắt ~64 ký tự + "…" (3% comment dài). `/ingest` phát hiện snippet cắt → gọi `reconcileFullText(pageId,postId,convId,rowId)` [web2-livestream-poller.js](render.com/services/web2-livestream-poller.js) NỀN: fetch full text 1 conversation (`_fetchConversationComments`, KHÔNG re-fetch cả post) → UPDATE đúng dòng WS-direct → `_notify` → client delta đổi snippet→full ~1-2s. Guard in-flight theo rowId. Comment hiện NGAY (snippet), tự đủ chữ sau.

### [web2] Adopt Web2CustomerChat → balance-history + customers nâng từ chỉ-xem lên FULL chat ✅

User: "ok" (đồng ý nâng balance-history + customers từ read-only lên full chat).

- **balance-history** `openChatForPhone(phone,name)`: có SĐT → `Web2CustomerChat.open({phone,name})` (full Pancake+Zalo); không có SĐT → giữ fallback `Web2ChatReadonly.openSearch` (search read-only).
- **customer-detail-modal** (shared, dùng ở customers + balance-history) `openChat()`: có SĐT → `Web2CustomerChat.open(...)`; fallback read-only nếu launcher chưa load.
- **pending-match GIỮ read-only picker** (`onPick`) — đó là chọn KH để GÁN giao dịch, KHÔNG phải chat.
- Load thêm `web2-zalo.js` + `web2-extension-bridge.js` + `web2-customer-chat.js` ở [balance-history](web2/balance-history/index.html) + [customers](web2/customers/index.html); bump customer-detail-modal `?v=20260615cc`.
- Verified live (browser session): balance-history `Web2CustomerChat.open({phone})` → drawer 2 tab, panel mounted + composer + 25 tin. J&T đã verify trước.
- Files: [web2-balance-history-app.js](web2/balance-history/js/web2-balance-history-app.js), [web2-customer-detail-modal.js](web2/shared/web2-customer-detail-modal.js), 2 index.html. Status: ✅ Done.

### [web2][shared] Web2CustomerChat — launcher FULL chat KH (Pancake + Zalo) dùng chung ✅

**User:** "1. Bấm sđt mở full chat pancake và zalo đi. 2. Web 2.0 có shared khung chat pancake/zalo chưa? Chưa thì làm để trang khác dùng chung (live-chat, native-orders, balance-history…)." + "hiệu ứng lấy ở airbnb/lottie-web".

- **Khảo sát (workflow 3 agent map subsystem chat)**: phát hiện **ĐÃ CÓ sẵn component chat dùng chung**:
    - **Pancake**: `Web2ChatPanel` ([web2/shared/chat-panel/web2-chat-panel.js](web2/shared/chat-panel/web2-chat-panel.js)) — UI adapter-pattern, mode full/readonly/picker, ĐỌC+SOẠN+GỬI. live-chat (`PancakeChatWindow`) + **native-orders** đã dùng. `Web2Chat` = API client.
    - **Zalo**: `Web2Zalo.mountChat()` — full chat embeddable (J&T group drawer đang dùng).
    - → KHÔNG dựng lại engine. Thiếu = **launcher theo SĐT** mở cả 2 kênh.
- **MỚI** [web2/shared/web2-customer-chat.js](web2/shared/web2-customer-chat.js) (`window.Web2CustomerChat`):
    - `Web2CustomerChat.open({phone, name?, channel?})` → drawer phải, **2 tab Pancake | Zalo**, lazy-mount mỗi kênh khi xem.
    - Pancake: `resolvePancakeConv(phone)` (quét mọi page) → `Web2ChatPanel.mount(...).open(conv, adapter)` với **adapter tự chứa** (chỉ phụ thuộc Web2Chat/Web2Ext, KHÔNG PancakeState). Gửi **extension-first (bypass 24h)** → fallback Web2Chat (upload+send+PAT retry) — port từ pancake-chat-window.
    - Zalo: `Web2Zalo.mountChat(host, {phone})`.
    - **Lazy-load** panel bundle (css + emoji/sticker/entity data + panel.js) lần đầu mở tab Pancake → host page chỉ cần load web2-chat-client.js + web2-zalo.js + web2-customer-chat.js.
    - **Hiệu ứng = Web2Lottie (airbnb/lottie-web)**: loading / hội thoại trống (`data-w2-lottie`).
- **Wire J&T**: bấm SĐT (`openMsgModal`) giờ gọi `Web2CustomerChat.open({phone,name})` — thay modal soạn-nhanh cũ. Gỡ sendViaZalo/sendViaPancake. Load thêm web2-extension-bridge + web2-customer-chat; bump app `?v=20260615n`.
- **Tái dùng cho trang khác**: balance-history / customers / returns / purchase-refund chỉ cần `Web2CustomerChat.open({phone})` (sẽ adopt dần — hiện balance-history/customers đang dùng Web2ChatReadonly read-only).
- Frontend-only. Files: [web2-customer-chat.js](web2/shared/web2-customer-chat.js), [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js), [index.html](web2/jt-tracking/index.html). Status: ✅ Done (cần verify live).

### [live-chat] Comment dài hiện ĐỦ (bỏ cắt "...") ✅

User: "comment nội dung dài bị lỗi ... không hiện hết". Mobile `.c-msg` đang `-webkit-line-clamp:3` → cắt 3 dòng + "...". Gỡ clamp ([comments-mobile.html](live-chat/comments-mobile.html)), giữ `word-break:break-word`+`overflow-wrap:anywhere` (chống tràn URL/từ dài). Desktop `.live-conv-message` thêm cùng wrap (defensive, không clamp sẵn). (`?v=20260615fulltext`)

### [live-chat][desktop] Topbar hiện SỐ ĐƠN trong livestream đang chọn ✅

User: "số đơn trong bài livestream đó lên topbar". Thêm badge **🛒 N đơn** cạnh **💬 N** ở `#liveTopbarActions` ([live-comment-list.js](live-chat/js/live/live-comment-list.js) `_updateTotalBadge`+`_orderCount`). Đếm distinct mã đơn NATIVE_WEB (`sessionIndexMap`) của comment đang hiển thị (state.comments của campaign đang chọn). Cập nhật mỗi render (tạo đơn → enrich → re-render → badge tăng). (`?v=20260615orders`)

### [live-chat][mobile] Chip Store/House hiện SỐ ĐƠN đã tạo + nút Toàn màn hình (F11) ✅

User (trang comments-mobile): (1) hiện tổng đơn đã tạo của Store/House, (2) nút toàn màn hình như F11.

- **Count đơn/page**: `updateOrderCounts()` đếm distinct khách (`fb_id`) có `has_order` theo page (Store=270136663390370, House=117267091364524) → badge `.chip-cnt` trên chip Store/House + tổng ở "Đã tạo đơn". Cập nhật trong doRender + applyDelta. [comments-mobile.js](live-chat/js/live/comments-mobile.js)+[comments-mobile.html](live-chat/comments-mobile.html).
- **Fullscreen**: nút `#btnFull` header → Fullscreen API (`requestFullscreen`/`exitFullscreen`, webkit fallback); `.hd-btn.on` khi đang fullscreen. (`?v=20260615chips`)

### [web2][shared] J&T tracking — bấm SĐT nhắn tin (Zalo/Pancake) + nút tag Pancake "XỬ LÝ BC" ✅

**User:** "1. Bấm vào sđt bỏ chức năng copy → mở modal nhắn tin với khách bảng chọn zalo hoặc pancake. 2. Nút tag pancake → đánh tag XỬ LÝ BC như hình." Chọn kiểu: **soạn nhanh gửi liền**.

- **Bấm SĐT → modal nhắn tin** (bỏ copy): `parseOrderInfo(src)` tách `{phone,name}` từ dòng đơn tab-delimited (verify 5 đơn live: Phương Liễu/Ngọc Thuý/Huong Pham…). SĐT trong tin nhắn giờ `data-msg-phone` (capture-phase → KHÔNG mở modal chi tiết). Modal `openMsgModal`: toggle **Pancake/Zalo** + textarea + Gửi.
    - Zalo: `Web2Zalo.getConversation(phone)` → `sendMessage({account_key,thread_id,thread_type})`.
    - Pancake: `resolvePancakeConv(phone)` quét mọi pageId (giống web2/customers `_getPageIds`) → `Web2Chat.sendMessage(pageId,convId,{text,customerId})`. Thiếu hội thoại → toast cảnh báo, không lỗi.
- **Nút tag Pancake "XỬ LÝ BC"** per-row (icon tag): `resolvePancakeConv(phone)` → `Web2Chat.fetchTags(pageId)` tìm thẻ tên "XỬ LÝ BC" (case-insensitive) → `Web2Chat.toggleTag(pageId,convId,tagId,'add')`. Loading state, await + toast (external mutation, không UI-first).
- **Shared mới**: thêm `fetchTags(pageId)` + `toggleTag(pageId,convId,tagId,action)` vào [web2-chat-client.js](web2/shared/web2-chat-client.js) (mirror PancakeAPI live-chat; nguồn chung cho mọi trang web2). Qua worker `/api/pancake-official/.../tags`.
- Frontend-only (Pancake/Zalo đi qua worker + route sẵn có — KHÔNG cần deploy backend). Load thêm `web2-chat-client.js`; bump css/app `?v=20260615m`.
- Files: [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js), [jt-tracking.css](web2/jt-tracking/css/jt-tracking.css), [index.html](web2/jt-tracking/index.html), [web2-chat-client.js](web2/shared/web2-chat-client.js). Status: ✅ Done.

### [live-chat] Comment mới có KHUNG xanh ~1s để biết là mới ✅

User: "comment mới có khung sau 1s để biết comment mới". Mở rộng keyframe `.is-new`: fade opacity nhanh (0-0.25s) + **box-shadow ring xanh 2px (`rgba(0,104,255,.6)`) giữ ~1s rồi mờ dần** (tổng 1.5s ease). Ring = "khung" ôm bo góc, KHÔNG xô layout. Desktop [live-comments.css](live-chat/css/live/live-comments.css) + mobile [comments-mobile.html](live-chat/comments-mobile.html) (giữ shadow nền `var(--c-shadow)`). Burst-guard giữ nguyên (dồn dập → không khung). (`?v=20260615frame`)

### [live-chat] Re-add fade comment mới = OPACITY THUẦN (chuẩn livestream, research GitHub) ✅

Research 10+ repo (Bilibili OBS overlay, pixelfed, surmon.me, 100ms…): chuẩn dịu nhất cho livestream feed = **fade opacity thuần, KHÔNG trượt** (trượt translateY = cảm giác "đẩy từ trên xuống"). User chọn pattern này. Re-add `@keyframes {opacity 0→1}` 0.3s `cubic-bezier(0.4,0,0.2,1)` (material ease) cho `.is-new` (desktop [live-comments.css](live-chat/css/live/live-comments.css) + mobile [comments-mobile.html](live-chat/comments-mobile.html)); burst-guard `_shouldAnimateNew`/`shouldAnimateNew` (batch>5 hoặc >12/2s → bỏ fade, hiện tức thì); respect prefers-reduced-motion. (`?v=20260615fade2`)

### [web2][render] Zalo — chỉ giữ tin 2 nhóm "XỬ LÝ NJD" + tự xoá sau 7 ngày ✅

**User** (kèm ảnh 2 nhóm "XỬ LÝ NJD - J&T" + "XỬ LÝ NJD - THÀNH PHỐ"): "xóa hết dữ liệu hiện có → chỉ lấy tin nhắn 2 nhóm như hình và xóa sau 7 ngày". Chốt: **khoá đúng 2 nhóm hiện tại** (theo thread_id, không auto-thêm nhóm mới) + **giữ đăng nhập, chỉ wipe tin/hội thoại/ảnh**.

- **Allowlist nhóm theo dõi**: bảng mới `web2_zalo_tracked_groups (account_key, thread_id, name, added_at)` [web2-zalo-schema.js](render.com/db/web2-zalo-schema.js). Bảng có ≥1 row → filter BẬT (chỉ lưu nhóm trong bảng); rỗng → TẮT (lưu tất, an toàn). Cache in-memory `_trackedSet`/`_filterActive` + `_loadTracked()` (boot + refresh 60s + sau mỗi thay đổi).
- **Filter ở `_persistIncoming`**: tin của hội thoại không theo dõi (1-1, nhóm ngoài DS) bị bỏ qua hoàn toàn. `sync-conversations` (nút Đồng bộ + auto-sync) cũng skip non-tracked → không ngập lại list.
- **Endpoints**: `GET/POST /tracked-groups`, `DELETE /tracked-groups/:acc/:thread` (manual add/remove), `POST /admin/reset-to-tracked` (x-admin-secret=CLEANUP_SECRET) → khớp tên `pattern` mặc định "XỬ LÝ NJD" (hoặc `groups[]` thủ công) → seed tracked → WIPE messages/conversations/media/members (GIỮ accounts + ZNS) → tái tạo dòng hội thoại 2 nhóm. Có `dryRun`/`confirm:'YES-RESET'`.
- **Retention 7 ngày**: `runZaloRetention(7)` xoá messages+media `< now-7d` (giữ dòng hội thoại, clear preview cũ). Cron [server.js](render.com/server.js) `!DISABLE_WEB2_JOBS` (chạy ở web2-api): 1 phút sau boot + mỗi 6h.
- **J&T auto-ingest** giờ chỉ chạy cho 2 nhóm tracked (đúng chỗ mã vận đơn từ nhóm J&T).
- Files: [web2-zalo-schema.js](render.com/db/web2-zalo-schema.js), [web2-zalo.js](render.com/routes/web2-zalo.js), [server.js](render.com/server.js). Status: ✅ Code xong, syntax OK — chờ deploy + chạy `/admin/reset-to-tracked` trên prod.

### [live-chat] BỎ HẾT hiệu ứng comment mới (cả 2 trang) ✅

User: "bỏ hết hiệu ứng bình luận mới + hiệu ứng đẩy trượt từ trên xuống". Gỡ `.is-new` (fade) + burst helper `_shouldAnimateNew`/`shouldAnimateNew` + CSS `@keyframes liveCommentIn`/`cardIn` ở [live-comment-list.js](live-chat/js/live/live-comment-list.js)+[live-comments.css](live-chat/css/live/live-comments.css) (desktop) và [comments-mobile.js](live-chat/js/live/comments-mobile.js)+[comments-mobile.html](live-chat/comments-mobile.html) (mobile). Comment mới hiện TỨC THÌ, không animation. (`?v=20260615noanim`)

### [web2][render] J&T tracking — "chuyển hoàn" ≠ "đã giao" → thêm status `returned` (Đã hoàn) ✅

**User** (kèm ảnh): đơn `802759556302` event `"Đơn hàng chuyển hoàn thành công…"` bị gán **Đã giao** — "chuyển hoàn -> không phải đã giao".

- **Root-cause**: `deriveStatus` kiểm `thành công`/`ký nhận` (→ delivered) TRƯỚC `chuyển hoàn`. "Chuyển hoàn **thành công**" chứa `thành công` nên trúng `delivered` trước.
- **Fix**: tách hẳn status mới **`returned` ("Đã hoàn", cam #ea580c, icon undo-2)** thay vì gộp vào `problem` (nhóm "XỬ LÝ NJD - J&T" chuyên xử lý hoàn → đáng tách riêng). Kiểm `chuyển hoàn|hoàn hàng|hoàn về|trả hàng|trả về` **TRƯỚC** delivered ở cả [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) `deriveStatus` lẫn frontend `deriveFromDesc`. Gỡ `hoàn hàng/hoàn về/chuyển hoàn` khỏi nhóm `problem`.
- **Sửa data cũ không cần fetch lại**: thêm `_rederiveStored(db)` chạy đầu `POST /refresh` — re-derive status từ `events` JSONB đã lưu (rẻ, idempotent, không gọi J&T) → đơn `delivered` sai tự về `returned` khi bấm "Làm mới tất cả". `delivered` là final (refresh không re-fetch) nên cần bước này.
- **Frontend**: STATUS + KPI_ORDER + KPI_META + CSS tokens `--st-returned`/`--st-returned-bg`. Bump css/app `?v=20260615k`.
- **Hardening (audit 121 sự kiện J&T THẬT từ 16 đơn live)**: thêm 2 false-positive nghiêm trọng → sửa:
    - `"Nhân viên… của bưu cục đã nhận hàng"` (×14 — NV bưu cục **lấy/nhập kho**, còn trung chuyển) bị gán **delivered** vì keyword `đã nhận hàng`. Giao thật chỉ khi `"Đơn hàng đã ký nhận. Người ký nhận là:【khách】"`. → bỏ `đã nhận hàng`+`thành công` trần; delivered = `ký nhận|giao hàng thành công|giao thành công|phát thành công`.
    - `"Người nhận từ chối nhận hàng"` bị gán delivered vì keyword `người nhận` quá lỏng + thứ tự. → bỏ `người nhận`; xét **returned/problem TRƯỚC delivered**; guard `(giao) không/chưa thành công`=thất bại.
    - Verify khớp 100% 121 sự kiện thật (transit 75 / delivering 19 / problem 18 / delivered 5 / returned 4); delivered 7→5. Bump app `?v=20260615l`.
- Files: [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js), [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js), [jt-tracking.css](web2/jt-tracking/css/jt-tracking.css), [index.html](web2/jt-tracking/index.html). Status: ✅ Done (deploy web2-api + GH Pages).

### [live-chat] Hiệu ứng comment mới = FADE thuần dịu, không flash ✅

User: "nhẹ nhàng không phải flash". Bỏ `translateY` (trượt + prepend đẩy dòng = cảm giác lóe), chỉ còn fade `opacity 0→1` 0.55s `ease` (đều, chậm). Desktop [live-comments.css](live-chat/css/live/live-comments.css) + mobile [comments-mobile.html](live-chat/comments-mobile.html). Burst-guard giữ nguyên.

### [web2][shared] Web2Lottie — animation Lottie (airbnb/lottie-web) dùng chung TOÀN BỘ Web 2.0 ✅

**User:** "kiểm tra toàn bộ web 2.0 → phần CSS giao diện dùng airbnb/lottie-web → thêm vào toàn bộ web → thêm thông minh". Scope chọn: **tinh tế** (empty/loading/success/error) + **CDN lazy-load**.

- **Precedent**: `web2/jt-tracking/` đã dùng lottie-web (cdnjs 5.12.2) với JSON local. Mở rộng thành module shared cho mọi trang.
- **Module mới** [web2/shared/web2-lottie.js](web2/shared/web2-lottie.js) (`window.Web2Lottie`):
    - **Lazy**: chỉ tải `lottie_light.min.js` (cdnjs, SVG-only ~150KB) khi animation ĐẦU TIÊN cần → trang đủ data không tốn bandwidth. CDN fail → no-op graceful.
    - **Auto-enhance trạng thái RỖNG** (thông minh, toàn site): scanner + `MutationObserver` (debounce 150ms) tự thay `.empty-state-icon` (lucide) bằng Lottie theo `ICON_MAP` (inbox/package→box "empty", alert→"error"…). KHÔNG cần sửa từng trang. Trễ 350ms + check còn-trong-DOM → bỏ qua empty-state tạm khi đang tải.
    - **Declarative**: `<div data-w2-lottie="loading"></div>` tự mount.
    - **Burst feedback** `success()/error()` giữa-trên màn hình, throttle 1000ms chống spam.
    - `loadingOverlay(show)`, `scan(root)`, registry Map + `_reap()` dọn anim detached (chống leak RAF).
    - Respect `prefers-reduced-motion` → `enabled=false`, no-op hoàn toàn.
- **Assets** [web2/shared/lottie/](web2/shared/lottie/): `loading.json` (copy jt-tracking 33KB), `success.json` (check draw-on, 1KB), `error.json` (X draw-on, 1.5KB), `empty.json` (box float loop, 1.2KB) — hand-authored bodymovin trim-path, tổng ~37KB.
- **CSS** [web2/shared/web2-lottie.css](web2/shared/web2-lottie.css): holder empty-icon 64px, burst, loading overlay (no backdrop-blur, shadow ≤24px theo modal rule).
- **Wiring 2 điểm**: (1) [web2-sidebar.js](web2/shared/web2-sidebar.js) auto-load `web2-lottie.js` qua `inject()` → MỌI trang Web 2.0. (2) [web2-optimistic.js](web2/shared/web2-optimistic.js) `_notify` gọi `Web2Lottie.success()/error()` (web2-only, `config.autoFeedback` toggle, never block).
- **Tách Web1⊥Web2**: KHÔNG đụng `shared/js/notification-system.js` (dùng chung Web 1.0). Web 1.0 không load web2-sidebar → không có Web2Lottie (verified: orders-report sạch).
- **Verify browser** (localhost, persistent session): module auto-load qua sidebar (`v=20260615a`) + CSS inject ✓; lib lazy-load CDN ✓; 2 empty-state → 2 SVG render (box xanh + X đỏ) + icon gốc ẩn ✓; declarative loading SVG ✓; **0 console error**; screenshot xác nhận visual.

**Status:** ✅ `node --check` PASS cả 3 file. Cần GH Pages deploy.

### [web2][jt-tracking] Hiện toàn bộ tin nhắn chứa mã + chỉ nhận mã ĐÚNG format dòng đơn + copy SĐT ✅

1. **src_message** (cột mới TEXT): lưu TOÀN BỘ tin nhắn nhóm chứa mã → row + modal hiện đầy đủ (tên/SĐT/ghi chú KH), tô đậm mã 12 số + tô xanh SĐT.
2. **Copy SĐT**: bấm số → copy clipboard; listener **capture-phase** `[data-copy]` (stopPropagation TRƯỚC click row) → KHÔNG mở modal. Hoạt động list/modal/drawer.
3. **Chỉ nhận mã đúng FORMAT dòng đơn** (user: "phải có dạng `<mã> Shop NHI JUDY 01 <tiền>` mới nhận"): `ORDER_CODE_RE = /(?<!\d)(\d{12})(?!\d)\s+Shop\s+NHI\s*JUDY/gi` cho autoIngest + scan (loại reply/mention "@Nhi Judy Store 802… em báo…" + số 12 ngẫu nhiên). `/add` manual giữ `\d{12}`. SQL pre-filter scan: `~* 'shop\s+nhi\s*judy'` (superset regex). Review 11-agent fix: digit-boundary (chặn 13 số) + SQL superset (tab/2-space/newline).
4. **src_message ưu tiên dòng đơn** (`COALESCE(EXCLUDED, existing)`): re-scan ghi đè text reply cũ bằng dòng đơn. Verified: 15/23 row có dòng đơn (tên/SĐT). Còn 8 row "reply-only" = mã thật nhưng dòng đơn KHÔNG có trong message store (chỉ có reply) → giữ (đơn vấn đề thật, vẫn track status J&T).

Commits `16b130a61` (+ trước đó). Schema cột `src_message`/`zalo_conv_id` đã migrate + scan backfill. **Status:** ✅

### [live-chat] Layout dòng comment: trạng thái về cạnh TÊN (tên → trạng thái → page) ✅

**User:** "chuyển trạng thái qua bên trái → tên - trạng thái - page" (status đang ở góc phải).

- **Mobile** [comments-mobile.js](live-chat/js/live/comments-mobile.js): đưa `.st` (status) vào `.c-name` ngay sau tên, trước `.pgbadge`. Bọc tên trong `.c-nm-txt` (ellipsis) để tên dài không che status/page.
- **Desktop** [live-comment-list.js](live-chat/js/live/live-comment-list.js): chuyển `.inline-status-container` từ phần tử riêng (bị flex đẩy phải) vào trong `.live-conv-header` sau tên, trước page badge.

**Status:** ✅ `node -c` PASS. Cần GH Pages deploy (`?v=20260615status`).

### [live-chat] Hiệu ứng comment mới DỊU MẮT + burst-aware (desktop + mobile) ✅

**User:** "hiệu ứng comment mới làm dịu, nhẹ nhàng tránh nhức mắt + trường hợp comment nhiều liên tiếp thì sao?"

- **Animation dịu**: keyframe `liveCommentIn`/`cardIn` fade (opacity 0→1) + trượt nhẹ `translateY(-5px→0)`, 0.36s ease-out-expo, compositor-only (transform+opacity). Desktop [live-comments.css](live-chat/css/live/live-comments.css) `.live-conversation-item.is-new`; mobile [comments-mobile.html](live-chat/comments-mobile.html) `.card.is-new`. respect `prefers-reduced-motion`.
- **CHỈ animate dòng MỚI**: trước đây mobile gắn `animation: cardIn` cho **MỌI** `.card` → mỗi render cả list nháy nhức mắt. Bỏ blanket, chỉ gắn `.is-new` cho card/dòng vừa chèn (gỡ sau `animationend`).
- **Burst-aware** (`_shouldAnimateNew`/`shouldAnimateNew`): batch >5 dòng HOẶC >12 dòng animate/2s = **comment dồn dập** → TẮT hiệu ứng → hiện tức thì, tránh nháy loạn. Flow thường (≤vài/giây) → animate dịu.

**Status:** ✅ `node -c` PASS. Cần GH Pages deploy (`?v=20260615anim`).

### [web2][jt-tracking][zalo-chat] J&T: fix mất composer chat drawer + nén dashboard gọn ✅ (`b33d74d64`)

1. **Composer (ô soạn tin) mất trong chat drawer**: `.wz-chat-body` thiếu `flex:1 1 auto; min-height:0; overflow-y:auto; flex column` trong engine CSS — các rule này CHỈ có ở `web2-zalo.css` (trang Zalo). Nhúng `mountChat` ngoài trang Zalo → body phình theo nội dung, đẩy `.wz-composer` xuống dưới màn. Fix: thêm vào [chat-bubbles.css](web2/shared/zalo-chat/chat-bubbles.css) (`.wz-chat-main .wz-chat-body`) → composer ghim đáy. Verified live: composer hiện đủ (input + ảnh/file/emoji + gửi).
2. **Nén dashboard** [jt-tracking.css](web2/jt-tracking/css/jt-tracking.css): KPI nhỏ (padding 8/12, num 19px, `minmax(104px)`) → 8 thẻ gọn 1 hàng; quick-add cao 42 + padding 8; giảm margin header/main. → list lên cao, đỡ tốn diện tích (verified: ~6 row hiện thay vì ~2).

Bump `ENGINE_VER=20260615c` + css/app `?v`. Nối tiếp 2 entry J&T cùng ngày bên dưới.

### [live-chat][web2-realtime] WS-DIRECT comment livestream (bỏ poll, nhanh như TPOS) + render APPEND-only đúng invariant 🔄

**User:** "không realtime cập nhật + render TOÀN BỘ → comment mới append liền không đụng cũ" → "so tốc độ web2 vs tpos" → **"sao lại còn live poll?"**

**Tốc độ:** TPOS dùng comment trong event WS trực tiếp (~<1s). Web 2.0 CŨ: relay nhận WS `pages:update_conversation` rồi **vứt comment đi, trigger `pollPostNow` REST fetch lại CẢ post + debounce 1.5s** → chậm vài→chục giây. Payload WS đã đủ (`conv.snippet`+`from`+`message_count`+`updated_at`); conv.id không có id từng comment → lý do họ phải fetch.

**Fix WS-direct** ([web2-live-comments.js](render.com/routes/web2-live-comments.js)): `/ingest` dùng LUÔN comment trong event WS → upsert + `_notify` NGAY, **bỏ pollPostNow auto-trigger**. `_mapWsConvToComment` id duy nhất `${conv.id}_${message_count}` (mỗi comment 1 dòng, không đè; fallback updated_at), createdTime=`updated_at`. → ~<1s như TPOS.

**Fix render APPEND-only** ([live-comment-list.js](live-chat/js/live/live-comment-list.js) `prependComments`): bỏ fallback full `renderComments()` khi out-of-order (nguồn "render toàn bộ"). Chèn bằng index trong `_filteredAll` → giữ invariant `DOM==filtered.slice(0,_renderLimit)`. **Review 15-agent bắt HIGH bug** (chèn ngoài window+bump → cuộn TRÙNG+SÓT) → idx≥số dòng render → SKIP, không bump; `_ensureScrollSentinel`. Mobile đã append-only sẵn.

**Status:** ✅ deployed + verified: WS-direct ghi DB (id `_<msgcount>`), 0 joinError. Đo: độ trễ còn lại 5-9s là **WS push của pancake.vn** (`relay-nhận − conv.updated_at`), KHÔNG phải pipeline ta (<1s sau nhận). TPOS <1s vì dùng chatomni (nguồn khác). User chốt giữ pancake WS. ⚠ Tradeoff: 2 comment cùng người cùng WS-cycle (hiếm) có thể gộp.

**ZERO INTERVAL (user 2026-06-15):** gỡ nốt `setInterval(loadPosts, 90000)` [comments-mobile.js](live-chat/js/live/comments-mobile.js) → DANH SÁCH bài live cũng event-driven: SSE `web2:live-comments` → throttle 30s leading-edge → loadPosts (idle = không chạy). Audit: MỌI trang pancake (index/comments-mobile/chat) WS-direct — comment = SSE `web2:live-comments`, inbox = SSE `web2:messages` ([pancake-realtime.js](live-chat/js/pancake/pancake-realtime.js)), poller nền DISABLED. Không còn data-poll/setInterval nào.

### [web2][jt-tracking][zalo-chat] J&T follow-up: KPI "Đã duyệt" + fix input + fix chat drawer text dọc ✅

Tiếp theo entry dưới (cùng ngày):

1. **KPI/filter "Đã duyệt"** ([jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) + [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) `/list status=approved` → `approved_at IS NOT NULL`).
2. **Fix giao diện input** thanh nhập mã: `align-items:center` + height đồng đều 46px (bỏ `height:100%` gây cao lệch). ⚠ Quên bump `jt-tracking.css?v` ở các lần trước → scroll/drawer fix không load; đã bump `?v=20260615d`.
3. **Fix chat drawer chữ DỌC 1 ký tự** (`a552ff9f4`→`4189c9c80`): `Web2Zalo.mountChat` nhúng ngoài trang Zalo (Tra cứu J&T) thiếu `.wz-chat-main`/`.wz-chat-head` + biến `--wz-*` (chỉ có ở `web2-zalo.css`/`.web2-theme`) → bong bóng co ~1ch. Fix: thêm các style này vào **[chat-bubbles.css](web2/shared/zalo-chat/chat-bubbles.css)** (ENGINE_CSS, scope `.wz-chat-main`) → self-contained mọi nơi mountChat; tách `#jtChatBody` khỏi `.jt-drawer-body`; bump `ENGINE_VER=20260615b`.

**Verified live (browser):** chat drawer render NGANG đúng (header "XỬ LÝ NJD - J&T", @mention xanh, bong bóng + reaction). Scan backfill `zalo_conv_id` cho 23 row cũ → có nút Mở chat. **Status:** ✅

### [web2][jt-tracking][zalo] J&T: auto-ingest realtime + mở chat nhóm + @mention + fix scroll/sidebar ✅

**User (nhiều lượt):** auto thêm mã J&T từ tin nhắn nhóm Zalo realtime (không refresh); Web 2.0 không scroll được; nút mở chat nhóm J&T (chat được); @tên xanh lên; reply nếu chưa có.

1. **Auto-ingest realtime** [web2-zalo.js](render.com/routes/web2-zalo.js) `_persistIncoming`: tin NHÓM mới → `web2-jt-tracking.autoIngestFromZalo(_pool,msg)` (fire-and-forget) → mã `80\d{10}` → INSERT pending + SSE `web2:jt-tracking` (UI tự thêm) → fetch nền điền trạng thái + SSE lần 2. Verified: gom 23 mã từ "XỬ LÝ NJD - J&T".
2. **Fix scroll**: `web2-sidebar.css` đặt `.web2-shell{height:100vh;overflow:hidden}` → cột `main` PHẢI tự cuộn. Thêm `.web2-shell>main{height:100vh;overflow-y:auto}` ([jt-tracking.css](web2/jt-tracking/css/jt-tracking.css)). Cũng fix sidebar trống: gọi `Web2Sidebar.mount('#web2Aside')` trong init (sidebar KHÔNG tự mount).
3. **Mở chat nhóm**: lưu `zalo_conv_id` vào `web2_jt_tracking` (autoIngest + scan backfill, upsert `xmax=0`). Row Zalo có nút "Mở chat" → drawer phải → `Web2Zalo.mountChat({convId})` (lazy-load chat engine). Chat 2 chiều + reply (đã có sẵn từ trước).
4. **@mention xanh**: [bubbles.js](web2/shared/zalo-chat/bubbles.js) `fmtText` = esc + regex `@tên` (token sau viết hoa) → `.wz-mention` xanh ([chat-bubbles.css](web2/shared/zalo-chat/chat-bubbles.css)). Bump `ENGINE_VER=20260615a` + bubbles/css version trang Zalo.

**Status:** ✅ `node -c` + load PASS. Deploy web2-api (render.com) + GH Pages. Reply Zalo đã có sẵn (chat-store setReplyTarget + composer reply-bar) → không cần làm.

### [live-chat][web2-realtime][worker] FIX comment livestream KHÔNG về 2 trang Live — relay join per-page `pages:{id}` + UI chọn trang 🔄

**User:** "2 trang live-chat/index + comments-mobile không nhận comment livestream nữa? ... không phải account hết gói cước mà có nhiều account có quyền server pancake → tách 2 server House/Store vì multi page bị lỗi → làm endpoint thay id page là kết nối + checkbox chọn trang (House+Store mặc định, thêm trang tick thêm)."

**Chẩn đoán (browser-test + research):** Client 2 trang OK (SSE subscribe `web2:live-comments` + delta fetch verified end-to-end, broadcast test → `clientsNotified:3`). Root cause ở **relay web2-realtime**: join `multiple_pages:${uid}` GỘP 4 page → 1 page hết gói cước (`193642490509664`) làm Pancake reject CẢ BÓ ("Gói cước hết hạn" / err 122) → `eventsReceived=2/giờ`, ring buffer rỗng → 0 push SSE. Comment chỉ vào DB nhờ client `/poll-now` lúc mở trang (warm-up). Probe pancake.vn (account khác) nhận 5 comment/60s qua per-page `pages:{id}` → xác nhận fix.

**Fix per-page (mirror `web2/shared/web2-realtime.js`):**

- [live-chat/server/server.js](live-chat/server/server.js) `joinChannels()`: bỏ `multiple_pages:`, join `pages:{pageId}` TỪNG TRANG (`{accessToken,userId,platform:web}`). Page hết hạn chỉ page đó lỗi 122 (drop khỏi `joinedPages`), các page khác vẫn nhận `pages:update_conversation` livestream comment. `handleMessage` xử lý err 122 per-page.
- **Selection** (chọn trang): bảng `web2_live_relay_pages` (page_id, enabled). `startClient` lọc page bị tắt; lưu `client.allPages` meta cho UI. Endpoints relay: `GET /api/pages-available` (mọi trang + enabled/joinFailed + selected), `POST /api/connect-pages {userId,pageIds}` (lưu lựa chọn + reconnect per-page).
- **Proxy**: [render.com/routes/web2-live-relay.js](render.com/routes/web2-live-relay.js) (`GET /pages`, `POST /connect`) forward sang relay kèm `x-relay-secret` (frontend không có secret). Mount server.js. Worker route `WEB2_LIVE_RELAY` (`/api/web2-live-relay/*` → web2-api).
- **UI**: card "Server realtime (WS) — chọn trang nhận comment" ở [web2/pancake-settings/](web2/pancake-settings/index.html) — checkbox per trang (mặc định bật hết, trang hết gói cước hiện tag), Lưu & kết nối lại → `/connect`.
- Diagnostic: [scripts/pancake-ws-probe.js](scripts/pancake-ws-probe.js) (one-shot, đọc JWT từ serect, KHÔNG commit secret).

**Status:** ✅ **VERIFIED LIVE**. Relay reconnect (account `c42ef91d`, 2 page per-page join) — **0 joinError** (hết "Gói cước hết hạn"), `eventsReceived` 21→36/40s (trước kẹt 2/giờ), comment mới `03:57:27` vào DB (vượt mốc kẹt 03:25:07) → WS→ingest→DB→SSE sống lại. Worker deploy ✅. ⚠ Workflow "Deploy" (Firebase vite) lỗi **pre-existing** (web2-motion top-level await — 5 push trước cũng lỗi, KHÔNG do commit này; site chạy GH Pages raw file).

**Gỡ poll (2026-06-15):** đã gỡ client `POST /poll-now` warm-up ở [live-init.js](live-chat/js/live/live-init.js) + note server-direct cả 2 trang ([live-init.js](live-chat/js/live/live-init.js) + [comments-mobile.js](live-chat/js/live/comments-mobile.js)). ⚠ Hệ quả: trang campaign phải BẬT ở pancake-settings (card "Server realtime (WS) — chọn trang") mới có comment realtime (mặc định bật hết). TODO sau: dọn TPOS còn sót Web 2.0.

### [web2][jt-tracking][render] Trang mới: Tra cứu vận đơn J&T (Báo cáo) ✅

**User:** "Tạo trang lấy tất cả mã 12 số (vd 802762251204) → tracking J&T (jtexpress.vn ?billcode=&cellphone=8674) → hiển thị timeline → tối ưu giao diện/quản lý → hiệu ứng lottie-web. Nằm ở menu Báo cáo. Bỏ xóa/thùng rác → nút Duyệt + Trở lại; bấm Duyệt → mờ đi + tự xoá sau 7 ngày. Ô nhập mã tùy thích (auto 8674)."

**Research J&T:** jtexpress.vn render kết quả SERVER-SIDE vào HTML (`.result-vandon-item` = time/date/desc, mới nhất trên). `cellphone` BẮT BUỘC = 4 số cuối SĐT gửi; **`8674` chạy cho MỌI đơn shop** (verify 3 mã khác nhau) → mặc định, không cần SĐT từng đơn.

**Backend** [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) (bảng `web2_jt_tracking` web2Db, SSE `web2:jt-tracking`):

- Parser HTML → events {time,date,desc,ts(+7→epoch)} + deriveStatus (delivered/delivering/transit/problem/pending/not_found).
- `/scan` (quét `web2_zalo_messages` mã 12 số), `/add` (dán tay), `/track` (fetch+lưu 1), `/refresh` (batch 25, **fetch song song chunk 5**, timeout 12s/mã), `/list` (filter+KPI), `/:billcode` (chi tiết, auto-fetch).
- **Duyệt**: `/:billcode/approve` (set approved_at → mờ) + `/unapprove` (trở lại); `_purgeApproved` tự xoá sau 7 ngày (gọi khi list). KHÔNG còn delete/trash.
- Mount `server.js` + initializeNotifiers.

**Frontend** [web2/jt-tracking/](web2/jt-tracking/index.html) (html+css+js riêng): dashboard KPI lọc theo trạng thái, ô nhập mã (cellphone auto 8674), Quét Zalo, Làm mới tất cả, search; modal timeline kiểu J&T (dot màu theo event, highlight 【...】); **Lottie** (lottie-web CDN + JSON tự host `lottie/`): loading + success + truck (empty/hero). Row đã duyệt mờ + tag "tự xoá sau N ngày". SSE realtime. Menu **Báo cáo → Tra cứu vận đơn J&T** ([web2-sidebar.js](web2/shared/web2-sidebar.js)).

**Review (2 agent code+security):** fix HIGH: `_upsertTracked` nhận `db` (không dùng `_pool` module — tránh ghi nhầm Web1 khi fallback); `deriveStatus` 'hoàn' trần → cụm chính xác ('hoàn hàng/về/chuyển hoàn'); Lottie leak khi mở modal nhanh → destroy trước. fix MEDIUM: approve/unapprove validate 12 số + 404; refresh onlyCodes skip approved; guard `_refreshing` chống 2 vòng refresh; esc billcode trong data-attr. SQLi/SSRF/XSS: clean (param hoá, billcode/cellphone chỉ digit, esc toàn bộ).

**Status:** ✅ `node -c` + require-load PASS. Cần deploy web2-api (render.com) + GH Pages (frontend).

**User:** "thêm NCC trùng tên đừng gộp vào" (trang Theo Dõi Nhập Hàng SL — inventory-tracking, Web 1.0). Thao tác: Thêm Đợt Hàng → 2 NCC cùng tên bị gộp thành 1 dòng trong bảng.

**Root cause:** `POST /shipments` ([render.com/routes/v2/inventory-tracking.js](render.com/routes/v2/inventory-tracking.js#L734)) có khối **dedup theo `(ngay_di_hang, dot_so, LOWER(TRIM(ten_ncc)))`** — nếu đã tồn tại dòng cùng ngày/đợt + cùng tên NCC thì **merge** sản phẩm/tiền/ảnh vào dòng cũ thay vì INSERT dòng mới (trả `merged:true`, notify `merge`). Client `saveShipment` gán name-only NCC số 901/902 phân biệt + render 1 dòng/DB-row, nên merge xảy ra hoàn toàn ở server.

**Fix (1 edit, backend):** gỡ khối dedup-merge (790–866) → luôn INSERT dòng mới. An toàn vì `inventory_shipments` PK = `id`, **không có** unique constraint trên `(ngay_di_hang, dot_so, ten_ncc/stt_ncc)`. 2 NCC trùng tên = 2 nhà cung cấp khác nhau → phải là 2 dòng. PUT `/shipments/:id` update theo `id` (không merge tên) → sửa đợt không re-merge. Không client nào phụ thuộc `merged` flag / notify `merge` (grep sạch).

**Verify:** `node -c` OK; không còn dangling `trimmedTen`/`existing` ngoài block payment-inheritance. **Cần deploy Render (fallback) ~2-4′** vì chạm `render.com/**`.

### [web2][render] Gỡ TPOS sạch (đợt 2): perm registry + 3 N+1 batch endpoint ✅

**User:** chọn "triệt để" cho cả 4 hạng mục sau khi quét TPOS đợt 1.

**Item 2 — Permission registry (web2-users.js):** gỡ action chết `loadTpos` (trang công nợ NCC) + `syncTpos` (trang tích hợp), đổi slug `tpos-pancake`→`live-chat` + label `'TPOS × Pancake'`→`'Live Chat (Pancake)'`, gỡ ACTION_LABELS loadTpos/syncTpos. Frontend KHÔNG dùng các slug/action này (grep sạch) → 0 ảnh hưởng UI. **Migration saved perms** (idempotent, trong ensureTables): rename key `tpos-pancake`→`live-chat` trong `web2_users.permissions` JSONB + strip loadTpos/syncTpos. **Test temp DB**: 4 user (có tpos-pancake+syncTpos / chỉ loadTpos / không liên quan / NULL) → đúng + run #2 no-op.

**Item 3 — DB columns `tpos_id`/`tpos_data`: NO-OP.** Web 2.0 KHÔNG có cột này (web2_customers schema cố ý TPOS-free, còn DROP bảng cũ nếu phát hiện `tpos_raw`). Các cột đó CHỈ tồn tại ở bảng Web 1.0 (`customers`, `web_warehouse`) — KHÔNG đụng (Web1⊥Web2).

**Item 4 — N+1 (3 chỗ):**

- **4a Ví KH** `web2-wallet-api.getWalletsByPhones`: N GET /by-phone → **POST /api/web2/wallets/batch-full** (service `getWalletsByPhones` = `WHERE phone = ANY`, full row) → 1 request/chunk 500 + fallback pool.
- **4b PBH bulkPrint**: N GET /:number → **GET /api/fast-sale-orders/batch?numbers=** (đặt TRƯỚC /:number) → 1 request + fallback per-number.
- **4c native-orders tạo PBH SHOP hàng loạt**: GIỮ N request độc lập (mỗi PBH = hoá đơn/kho/ví/advisory-lock riêng, partial-success đúng ngữ nghĩa — KHÔNG gộp 1 transaction vì 1 đơn lỗi không được rollback cả lô) NHƯNG đổi tuần tự→**song song giới hạn 5** (nhanh ~5×, 0 rủi ro money path).

**Files:** `render.com/routes/web2-users.js`, `render.com/routes/v2/web2-wallets.js`, `render.com/services/web2-wallet-service.js`, `render.com/routes/fast-sale-orders.js`, `web2/customer-wallet/js/web2-wallet-api.js`, `web2/fastsaleorder-invoice/pbh-app.js`, `native-orders/js/native-orders-app.js` + bump v 3 trang.

**Item 1 — DEPLOY + env (XONG):** xoá 3 env dead `TPOS_CLIENT_ID/TPOS_PASSWORD/TPOS_USERNAME` khỏi web2-realtime (204, verify NONE; live-chat/server không đọc). Deploy web2-api (auto trên push) + web2-realtime (commit `81adccb7e`) → cả 2 LIVE.

**Verify deployed (curl + browser):** perm catalog `/api/web2-users/pages` có `live-chat`, KHÔNG tpos-pancake/loadTpos/syncTpos ✅; `POST /wallets/batch-full` ✅; `GET /fast-sale-orders/batch` ✅; web2-realtime `facebook-status` ok env-token mode (cachedPages:0), `private-reply` 400 (alive), `refresh-tokens` 404 (removed) ✅. Browser: `getWalletsByPhones([3])` = 1 batch-full/0 by-phone; users/PBH/native-orders 0 console error. **Status:** ✅ HOÀN TẤT (code+migration tested, deployed, verified).

### [orders-report][Lên đơn lẻ] Trừ ví: "ghi nhớ đầu" + đối chiếu TPOS CHỈ khi mất phản hồi ✅

**User:** "đã tạo đơn thành công trên tpos thì bắt buộc phải có cơ chế trừ tiền của ví" + "chỉ làm ghi nhớ đầu, nếu sau khi hoàn tất hết mà không nhận được gì từ tpos trả về thì mới kiểm tra đơn trên tpos nếu có tồn tại đơn vừa tạo thì trừ tiền — còn lại toàn bộ cơ chế cũ giữ nguyên". (Đơn 71654/72298 trả trước nhưng ví không trừ khi mất phản hồi TPOS.)

**Root cause:** cơ chế trừ ví chỉ gửi lệnh trừ SAU KHI nhận được phản hồi TPOS thành công. Nếu `smartFetch(InsertListOrderModel)` ([tab1-sale.js:1222](orders-report/js/tab1/tab1-sale.js#L1222)) **throw** (mạng rớt/timeout — request có thể đã tới TPOS, tạo đơn, nhưng phản hồi mất) → nhảy `catch`, chỉ báo lỗi, KHÔNG kiểm tra TPOS, KHÔNG trừ ví. Backend cũng không có cron đối soát đơn paid-chưa-trừ → mất trừ vĩnh viễn.

**Fix (chỉ LÊN ĐƠN LẺ, additive — KHÔNG đụng payload/cơ chế cũ/TPOS), 1 file [tab1-sale.js](orders-report/js/tab1/tab1-sale.js):**

1. **`window.SaleWalletIntent`** (localStorage `n2_sale_wallet_intents`, keyed theo **MÃ ĐƠN/Reference** — có sẵn lúc bấm, TPOS chưa cấp số phiếu): `record/clear/all`.
2. **GHI NHỚ ĐẦU** — trước `smartFetch` POST: ghi `{reference, phone, amount=model.PaymentAmount}` + set `_saleReconcileCtx` (biến scope hàm, để `catch` đọc được — const trong try không nhìn thấy ở catch).
3. **`window._reconcileSaleOnLostResponse(ref,phone,amount)`** — đọc TPOS GetView theo `Reference eq <mã đơn>` (CHỈ ĐỌC), nếu có phiếu active (`_isActiveTposInvoice`: state open/paid / ShowState Đã xác nhận|Đã thanh toán, loại cancel/NotEnoughInventory) → POST `/api/v2/pending-withdrawals` **keyed theo SỐ PHIẾU TPOS** (`inv.Number`), source `RECONCILE_LOST_RESP`. Trùng khóa với đường-thành-công ⇒ backend dedupe (`UNIQUE(order_id,phone)` + guard sổ cái `wallet_withdraw_fifo`) ⇒ **KHÔNG trừ 2 lần**. Đơn không tồn tại → `{found:false}` → KHÔNG trừ.
4. **FALLBACK trong `catch`** ([tab1-sale.js](orders-report/js/tab1/tab1-sale.js)): nếu có `_saleReconcileCtx` → gọi reconcile; found → xoá ghi nhớ + toast "đã đối chiếu & trừ ví"; không found → giữ error cũ. Lỗi tạo đơn trước GHI-NHỚ (validation/auth) → ctx null → error như cũ.
5. **Xoá ghi nhớ ở CUỐI nhánh success** (sau khi qua hết, đã kích hoạt trừ ví cũ) — để exception sau-khi-tạo-đơn vẫn được catch đối chiếu (idempotent).
6. **Sweep khi tải lại trang** (`_sweepSaleWalletIntentsOnLoad`, +3s sau load): ghi nhớ còn sót >20s → kiểm tra TPOS → có đơn thì trừ + xoá; không có & >24h → bỏ stale. Phủ ca đóng trang/crash trước khi catch chạy.

**Luật chống lỗi:** khóa khi TRỪ THẬT = SỐ PHIẾU TPOS (cả 2 đường) ⇒ idempotent; số tiền = số GHI NHỚ (không lấy con số TPOS trả về); fallback chỉ ĐỌC TPOS. Đã hoàn tác thử nghiệm trước đó ở nút "Làm mới phiếu" (`refreshPBHForOrder` giữ nguyên display-only). **Status:** ✅ **TESTED browser** (KH 0392060072, mô phỏng mất phản hồi qua patch `smartFetch`): ca thành công → cơ chế cũ trừ (source `SALE_ORDER`), không double; ca mất phản hồi → đơn `NJD/2026/72311` tạo trên TPOS + fallback trừ ví đúng 1 lần (source `RECONCILE_LOST_RESP`), số dư giảm đúng 100k, sổ ghi nhớ tự xoá.

## 2026-06-14

### [orders-report][KPI] "Làm mới dữ liệu" KHÔNG fetch đơn thật TPOS — thiếu token-manager trong iframe KPI ✅

**User:** "đã bấm làm mới dữ liệu nhưng không fetch đơn thật từ tpos? kiểm tra thật kỹ" (banner "⚠ Chưa có snapshot đơn thật" kẹt mãi dù đã bấm Làm mới).

**Root cause (silent failure, đã trace tận gốc):** Tab KPI chạy trong **iframe** (`kpiCommissionFrame` → `tab-kpi-commission.html` trong [main.html](orders-report/main.html#L693)). [tab-kpi-commission.html](orders-report/tab-kpi-commission.html) chỉ load `pancake-token-manager.js` (Pancake JWT), **KHÔNG load `shared/js/token-manager.js`** (file set `window.tokenManager` cho TPOS — [token-manager.js:633](shared/js/token-manager.js#L633)). main.html (parent/top) cũng cố tình KHÔNG load (`<!-- DO NOT load: token-manager -->` [main.html:724](orders-report/main.html#L724)). → trong iframe KPI: `window.tokenManager`, `window.parent.tokenManager`, `window.top.tokenManager` đều **undefined** → [kpi-manager.\_getTposAuthHeader()](orders-report/js/managers/kpi-manager.js#L245) trả `null` → `fetchInvoiceLinesFromTPOS`/`fetchProductsFromTPOS` `if (!headers) return []` (silent, không throw) → `ensureKpiFinalSnapshot` nhận `products=[]` → return null KHÔNG lưu snapshot → `reconciled=false` → banner kẹt. (`KPI_FINAL_SOURCE='invoice'` → fetch bằng **orderCode**, không cần orderId.) Đơn khác reconciled OK vì snapshot được tạo từ **tab1** lúc chat-confirm (tab1 CÓ load `token-manager.js` [tab1-orders.html:2642](orders-report/tab1-orders.html#L2642)).

**Fix (3 edit, frontend-only — GH Pages, không cần deploy Render):**

1. [tab-kpi-commission.html](orders-report/tab-kpi-commission.html): thêm `<script src="../shared/js/token-manager.js?v=20260614kpi">` (Firebase SDK đã có ở `<head>`; bearer đọc từ localStorage cùng origin — đã login tab1). → `window.tokenManager` có mặt → fetch TPOS chạy → snapshot lưu → reconciled.
2. [kpi-manager.js:\_getTposAuthHeader](orders-report/js/managers/kpi-manager.js#L245): `console.warn` khi không tìm thấy tokenManager (biến silent failure thành loud — lần sau iframe quên load là thấy ngay).
3. [tab-kpi-commission.js:\_ensureSnapshotsForVisibleOrders](orders-report/js/tab-kpi-commission.js#L5761): bỏ `.filter(x=>x.orderId)` — nguồn invoice dùng orderCode, lọc orderId làm rơi đơn fetch được.

Bump `?v=`: kpi-manager `20260614kpi`, tab-kpi-commission `20260614b`. **Status:** ✅ static-verified (trace đủ chain iframe→token→fetch→snapshot→banner).

### [web2][live-chat][render] Quét + gỡ TPOS khỏi Web 2.0 (workflow 7-agent) + fix N+1 enrich comment ✅

**User:** "Quét lại tất cả tpos trên web 2.0 và xóa những gì liên quan tpos đi — WEB 2.0 LÀ KHÔNG DÙNG VÀ LIÊN QUAN TPOS" + "Làm đi" (N+1 sweep).

**Quét:** workflow 7 agent (fe web2/native-orders/so-order/live-chat/wallets, be routes+services, shared-loaders, N+1) → 84 findings. Phần lớn KEEP (43, đã là warehouse-backed, `PartnerCustomerApi` chỉ là alias của `web2-customer-lookup.js` đọc `/api/web2/customers/*`, KHÔNG gọi TPOS) + comment lịch sử "đã gỡ" (giữ).

**Đã gỡ (verify từng cái trước):**

1. **token-manager.js (TPOS bearer) gỡ khỏi 4 trang** web2/customers, customer-wallet, balance-history, supplier-debt — trang KHÔNG dùng `window.tokenManager` (grep sạch), shared file giữ nguyên cho Web 1.0. (live-chat dùng `pancake-token-manager.js` riêng, KHÔNG đụng.)
2. **facebook-routes.js (web2-realtime)**: gỡ `TPOS_API_URL` (tomato.tpos.vn), `fetchTokensFromTPOS`, `saveTokensToFile` (dead), nhánh `if(tposToken)` trong `getPageToken`, route `/api/refresh-tokens` (0 caller), bỏ parse `tposToken` ở 8 endpoint. Token Page giờ = **env `PAGE_TOKEN_<pageId>`** (verify 4 page token tồn tại trên web2-realtime) + cache file boot. Client đã `// TPOS token đã gỡ` (pancake-api.js:304) → an toàn, behavior-preserving.
3. **api-config.js** (live-chat): gỡ `Live_ODATA` + `buildUrl.liveOData` + alias (dead config, 0 caller).
4. **live-api.js**: gỡ `getToken()` stub TPOS (0 caller; `getPartnerInfo` lẻ giữ — customer-panel dùng).
5. **web2-deeplink.js**: bỏ `tpos-pancake` khỏi regex app-root (folder đã rename `live-chat`).
6. **Xóa file orphan** `web2/customer-wallet/js/customer-wallet-app.js` (855 dòng, 0 ref repo-wide; trang load `web2-customer-wallet-app.js`).

**Fix N+1 (item "Làm đi"):** `live-init.loadPartnerInfoForComments` trước loop từng fb_id gọi `batch-by-fbid` với mảng 1 phần tử (N request). Thêm `LiveApi.getPartnerInfoBatch(ids)` (chunk 500) → gom hết fb_id chưa cache → **1 request**. Verify browser: `getPartnerInfoBatch([5])` = 1 call/5 ids; live-chat 1232 comment → 4 batch call (gồm LiveKhoEnricher), partnerCache 107, 0 error.

**Browser test:** 4 trang web2 + live-chat đăng nhập = **0 console error**; getToken/Live_ODATA undefined (đã gỡ), LiveApi.getPartnerInfoBatch=function. facebook-routes `node --check` OK (deploy mới hiệu lực).

**Files:** `web2/{customers,customer-wallet,balance-history,supplier-debt}/index.html`, `web2/shared/{web2-deeplink,web2-customer-lookup}.js`, `live-chat/js/api-config.js`, `live-chat/js/live/{live-api,live-init}.js`, `live-chat/{index,chat}.html` (bump v), `live-chat/server/facebook-routes.js`, xóa `web2/customer-wallet/js/customer-wallet-app.js`. **Status:** ✅ FE (GH Pages) + facebook-routes cần deploy web2-realtime. **CÒN ASK user:** permission registry `loadTpos`/`syncTpos`/`tpos-pancake` (web2-users.js), cột DB `tpos_id`/`tpos_data` lineage, 5 N+1 cần endpoint batch mới + env dead `TPOS_CLIENT_ID/USERNAME` web2-realtime.

### [web2][zalo][render] Tên hội thoại USER (1-1) bị thành tên SHOP khi shop nhắn cuối — heal ✅

**User:** "khách này tên Nguyễn Tâm không phải My Njd, My Njd chat cuối nên hiện My Njd → coi response tin nhắn zalo".

**Bằng chứng (API live conv id=42):** thread_type=user, thread_id=`5479751765142014707` (uid KHÁCH), tin `in` từ khách, tin `out` cuối từ shop (uid `852368102374576684`), nhưng `display_name='My Njd'` = tên SHOP. 5 conv dính đều `last_msg_sender_uid='me'` (id 44/42/15/47/37).

**Root cause (cùng họ bug, nhánh USER + tin GỬI ĐI):** ingest `_persistIncoming` đặt `convName=senderName` cho user thread **bất kể chiều**; tin shop gửi (out/isSelf) → senderName = tên shop → ghi đè tên khách qua COALESCE.

**Fix:**

1. **Ingest** [web2-zalo.js](render.com/routes/web2-zalo.js): `useSender = threadType!=='group' && direction==='in'` → out không đụng tên/uid hội thoại; `zalo_uid=COALESCE(existing, EXCLUDED)` (giữ uid khách).
2. **Heal** `_repairConvNames` (rename từ `_repairGroupNames`): thêm nhánh USER — fix conv `display_name NULL | == tên shop | (last_sender='me' & chưa heal)`, resolve **theo `thread_id`** (= uid KHÁCH, KHÔNG zalo_uid vì có thể bị nhiễm uid SHOP) → `getUserInfo` → force tên khách + self-correct `zalo_uid=thread_id`. Lazy-heal khi mở chat cũng đổi sang TTL-gate + resolve thread_id. Chạy nền on connect/boot + endpoint thủ công.
3. **Frontend** [web2-zalo-app.js](web2/zalo/js/web2-zalo-app.js) + [chat-view.js](web2/shared/zalo-chat/chat-view.js): user chưa có tên → "Khách Zalo" (không lộ id số). Bump `?v=20260614b`.

**Review:** workflow 11-agent → 5 finding confirmed, fix hết: (#1 HIGH) resolve theo zalo_uid bị nhiễm uid shop → đổi sang thread_id + self-correct; (#2) stamp info_synced_at khi resolve rỗng → đóng băng → chỉ stamp khi có tên; (#3) placeholder user; (#4) getUserInfo repo-loop không timeout → `_withTimeout` 2s; (#5) broaden detect bằng `last_sender='me' & info_synced_at NULL`.

**Status:** ✅ `node -c` + require-load PASS. Cần deploy web2-api (chạm render.com).

### [docs] CLAUDE.md: browser test FIFO/cổng động — tránh tranh chấp đa phiên ✅

**Bối cảnh:** khi browser-verify fix "mở nhầm page", top frame tự nhảy sang web2. Điều tra: có **2 phiên `n2store-browser-session.js` song song** (1 của tôi + 1 từ shell-snapshot Claude khác) đọc CHUNG `/tmp/n2store-session.fifo` + cùng `--http-port 9966` → lệnh `nav` rơi nhầm phiên. KHÔNG phải bug app (orders-report chỉ redirect tới login khi auth fail). Test fix vẫn chuẩn (gửi qua HTTP `/cmd` thẳng PID).

**Làm:** (b) kill cả 2 phiên + tails + free port 9966 (giữ `http.server 8080` shared). (c) Cập nhật `CLAUDE.md` mục Browser Test: dùng **FIFO riêng `/tmp/n2s-$$.fifo` + cổng random** mỗi phiên, ưu tiên gửi lệnh qua **HTTP `/cmd`** (theo PID, né FIFO chung), kèm lệnh `pkill` reset 1 phiên sạch. 3 chỗ: block "🧩 Mở browser test", LIVE CODING workflow b4/b5, section 3 REPL. **Status:** ✅

### [web2][zalo][render] Tên hội thoại NHÓM bị lấy theo người nhắn cuối — heal tận gốc từ zca ✅

**User:** "web2/zalo bug tên đoạn hội thoại lấy theo tên người nhắn cuối cùng (hình 1 zalo chuẩn) → phân tích → làm triệt để".

**Root cause (xác nhận bằng data API live + git):** bản ĐẦU của `_persistIncoming` (commit `bed1cb391` 13/06 14:54) ghi `display_name = senderName` cho **MỌI** tin kể cả NHÓM (chỉ guard `zalo_uid`). UPSERT dùng `display_name=COALESCE(EXCLUDED, existing)` + senderName luôn non-null → mỗi tin nhóm ghi đè tên nhóm = tên người gửi mới nhất. Guard `convName=null` cho nhóm thêm sau (`d9bcc5030` 19:27) chặn corruption mới NHƯNG không tự sửa data cũ (COALESCE giữ giá trị sai). Live API xác nhận: rows `thread_type='group'` + avatar nhóm (`ava-grp-talk`) nhưng `display_name == last_sender_name`.

**Fix triệt để — tự chữa lành từ zca (authoritative):**

1. **Schema** [web2-zalo-schema.js](render.com/db/web2-zalo-schema.js): thêm cột `info_synced_at BIGINT` (ALTER live + CREATE), idempotent.
2. **Service** [web2-zalo-zca.js](render.com/services/web2-zalo-zca.js): `getGroupsInfo(accountKey, gids)` → `{gid:{name,avatar}}` (KHÔNG nuốt lỗi, để throw); callback `onConnected` bắn cuối `_afterLogin`.
3. **Route** [web2-zalo.js](render.com/routes/web2-zalo.js): `_repairGroupNames()` fetch theo batch 50, **FORCE ghi đè** tên+avatar nhóm; wire `onConnected→_repairGroupNames` (chạy nền mọi lần kết nối/boot); endpoint `POST /accounts/:key/repair-group-names`; lazy-heal khi mở chat (timeout 2s, chỉ stamp `info_synced_at` khi resolve, `_notify` list khi heal). Ingest group guard giữ nguyên.
4. **Frontend** [web2-zalo-app.js](web2/zalo/js/web2-zalo-app.js) + **shared** [chat-view.js](web2/shared/zalo-chat/chat-view.js): nhóm chưa có tên → "Nhóm Zalo" (KHÔNG lộ id số) ở **cả** danh sách lẫn **header** chat; `updateHead()` cập nhật header tại chỗ sau `reload()` heal (không remount composer). Bump `?v=20260614a`.

**Review:** workflow 17-agent (5 dimension × adversarial verify) → 5 finding confirmed, đã fix hết: (#1/#2) header chat shared còn lộ id số + không refresh sau heal; (#3/#4) `getGroupsInfo` nuốt lỗi → lazy-heal stamp nhầm đóng băng tên sai 6h; (#5) await zca không timeout → nghẽn tải tin.

**Áp dụng:** account đang `0/1 kết nối` → tên nhóm cũ tự sửa NGAY khi quét QR kết nối lại (auto `onConnected`), hoặc khi mở từng nhóm, hoặc bấm "Đồng bộ danh bạ". `node -c` + require-load PASS cả 5 file. **Backend cần deploy web2-api** (chạm `render.com/**`). **Status:** ✅

### [web2][shared] Dọn dead code `web2-bulk-import.js` (đã thay bằng Web2Import) ✅

**User:** "dọn đi".

Xoá `web2/shared/web2-bulk-import.js` (`Web2BulkImport` — Excel+SheetJS+endpoint) — verify **0 reference** (không script tag, không JS dùng) + không hợp use-case (products không có route `/bulk`, so-order local-first). Đã thay bằng `Web2Import` (commit trước). Gỡ luôn selector mồ côi `.w2-bulk-modal` khỏi rule mobile-fullscreen trong `web2/shared/web2-theme.css` (giữ `.modal-content`/`.popup-content`). Grep cuối: 0 trace `Web2BulkImport`/`w2-bulk-`. **Files:** −`web2/shared/web2-bulk-import.js`, `web2/shared/web2-theme.css`. **Status:** ✅ frontend-only.

### [web2][shared] Browser-verify Firebase removal (sạch) + fix ví-pill N+1 → batch-summary ✅

**User:** "browser test vào kiểm tra những gì bạn nghi ngờ để làm cho triệt để hết đi".

**A. Verify cleanup Firebase (commit `8edfc1bb5`) qua browser thật — SẠCH:**

- Dựng persistent session (`--ext n2store-extension`, http-port 9966), warm `web2/overview`, smoke 5 trang.
- `typeof window.firebase === "undefined"` ✅ trên cả 5 (SDK ~470KB đã gỡ thật). 5 trang render OK (customers 50 rows, balance-history 43+5 cards, …). **0 firebase error / 0 non-404 error trên pure page load.**
- Phát hiện `window.initializeFirestore` vẫn là function: **core-loader.js:24 vẫn inject `firebase-config.js`** (KHÔNG gỡ được — Web 1.0 share core-loader). Nhưng firebase-config.js phòng thủ: auto-init guard `typeof firebase !== "undefined"` (skip, no throw), `initializeFirestore()` → null êm. token-manager.js cũng degrade localStorage-only khi không có SDK. → an toàn.
- **Heisenbug clarified:** `[Firebase] SDK not loaded` chỉ xuất hiện khi CHÍNH eval test gọi `getFirestore()`; pure page load = 0. Không phải lỗi trang.

**B. Fix N+1 ví-pill (phát hiện khi test customers — ~50-100 `GET /wallets/by-phone/` mỗi load, đa số 404):**

- `web2/shared/web2-wallet-balance.js` `getBalances()` chạy pool 6-worker gọi từng `/by-phone` (comment ghi "batch" nhưng code không). Endpoint batch `POST /api/web2/wallets/batch-summary` (3W3) đã có sẵn nhưng không dùng.
- Rewrite `getBalances`: serve cache tươi → gom SĐT chưa cache → **1 `POST /batch-summary`** (cache cả số dư 0 → khỏi re-fetch) → fallback pool per-phone nếu batch lỗi. `getBalance` (1 SĐT lẻ) giữ `/by-phone`. Giữ nguyên hợp đồng 404/absent→0 + pill chỉ hiện khi >0.
- **Verified (instrument fetch):** `getBalances([5 phones])` → `batch:1, byphone:0`. Trước: ~50-100 req/đa số 404. Sau: **1 POST, 0 by-phone, 0 404**. Smoke balance-history/native-orders/returns/ck-dashboard = 0 non-resource error.

**Files:** `web2/shared/web2-wallet-balance.js` + bump `?v=20260614wb` trên 7 trang loader (native-orders, web2/{customers,balance-history,overview,ck-dashboard,returns}, live-chat/{index,chat}). **Status:** ✅ frontend-only (GH Pages). Cleanup Firebase: confirm SẠCH, không cần sửa thêm.

### [web2][shared] Nhập dữ liệu hàng loạt CSV/JSON + tải file mẫu cho Kho SP & Sổ Order ✅

**User:** "ở web2/products + so-order → cho nút import dữ liệu bằng file csv/text/mã hóa + nút tải dữ liệu mẫu để coi cấu trúc".

**Quyết định (AskUserQuestion):** module dùng chung · định dạng CSV + JSON · Sổ Order tạo LÔ MỚI trong tab đang mở.

**Mới — NGUỒN CHUNG `web2/shared/web2-import.js` (`Web2Import`) + `web2-import.css`:**

- `Web2Import.open(config)` mở modal nhập; `Web2Import.downloadSample(config)` tải thẳng CSV mẫu.
- Parse **native** (KHÔNG SheetJS — nhẹ): auto-detect JSON vs CSV, auto-detect delimiter (`,`/`;`/`tab`), CSV quote-aware (`""` escape, field chứa phẩy/newline).
- Map header → field **không phân biệt hoa/thường + dấu** (normKey NFD) qua `label`/`key`/`aliases`. Cột thừa bỏ qua.
- Coerce: number (bóc `.`/`,` ngăn cách nghìn + ký hiệu tiền → `150.000`→150000, `1,200,000`→1200000), bool (`Đang bán`/`Tạm dừng`/`co`/`x`…), enum (enumMap).
- Preview: N hợp lệ + M lỗi (báo lỗi từng dòng), bắt buộc field `required`. Commit qua callback `onCommit(rows,{onProgress})` → mỗi trang tự quyết lưu. Nút "Tải file mẫu (CSV)" (có BOM cho Excel) + "Copy JSON mẫu" + "Xem cấu trúc".
- Theme xanh Zalo, tuân MODAL-ANTI-LAG (không backdrop-blur, shadow ≤24px, contain, overscroll contain).

**Kho SP (`web2/products`):** 2 nút header "Nhập" + "Tải mẫu". `onCommit` loop `Web2ProductsApi.create`, mã trống → auto-sinh `Web2ProductCode.suggest` (existingCodes tích luỹ chống trùng trong batch), fallback ASCII-upper. Cột: Tên\*, Mã, Biến thể, NCC, Giá mua, Giá bán, Tồn kho, Ghi chú, Ảnh URL, Trạng thái. Xong → `pushTickle` + `load()`.

**Sổ Order (`so-order`):** 2 nút toolbar "Nhập" + "Tải mẫu". `onCommit` gom dòng theo NCC+ngày+đợt → mỗi nhóm 1 **lô mới** (`SoOrderStorage.addShipment`+`addRow`) trong tab active, share `invoiceGroupId`, sau đó `pushSync()`+`renderAll()` + **reuse `syncRowsToKho`** (đối chiếu/tạo SP trong Kho như submit thường) + `_ensureSupplierAsync`. Cột: NCC, Ngày, Đợt, Tên SP\*, Biến thể, SL, Giá nhập, Giá bán, Ghi chú, Ghi chú CP, Trạng thái. Date nhận `YYYY-MM-DD`/`DD/MM/YYYY`.

**Lưu ý:** `web2/shared/web2-bulk-import.js` (`Web2BulkImport`, Excel+SheetJS+endpoint) là module CŨ **chưa wire ở đâu** + không hợp use-case (products không có `/bulk` route, so-order local-first) → để nguyên, KHÔNG dùng; `Web2Import` là đường mới.

**Files:** +`web2/shared/web2-import.js`, +`web2/shared/web2-import.css`, `web2/products/index.html`, `web2/products/js/web2-products-app.js`, `so-order/index.html`, `so-order/js/so-order-app.js`. **Test:** Node unit (parse/normalize/coerce) + Playwright harness 14/14 PASS (modal, sample download BOM+quote, CSV/JSON parse, valid/invalid, commit summary, normalized rows). **Status:** ✅ frontend-only (GH Pages, không cần deploy Render).

### [web2][docs] Cleanup sau research hạ tầng Web 2.0: gỡ Firebase dead + sửa doc stale + xoá env dead ✅

**User:** "làm tất cả" (3 việc cleanup đề xuất sau research server/db/firebase Web 2.0).

1. **Gỡ Firebase SDK dead** khỏi 5 trang web2 (verify app JS + inline + shared-auth/notification đều KHÔNG dùng firebase → an toàn): `web2/customers`, `web2/purchase-refund` (comment "cần cho picker so-order" STALE — so-order đã sang Postgres `/api/web2-so-order/get`), `web2/balance-history`, `web2/supplier-debt`, `native-orders` — bỏ `firebase-app/auth/firestore-compat` + `firebase-config.js` (~470KB/trang).
2. **Sửa doc STALE**: `CLAUDE.md` section "Firestore collections" → Web 2.0 ĐÃ migrate khỏi Firestore sang Postgres (web2Db); Firebase active duy nhất = web2-realtime đọc `pancake_tokens` lúc boot; Zalo session = Postgres. `MEMORY.md`: C8 so-order Firestore→Postgres đổi DEFER → ✅ DONE 13/06.
3. **Xoá env dead `WEB2_SYNC_ENABLED`** (server.js KHÔNG đọc — verify grep) khỏi web2-api + n2store-fallback qua Render API (DELETE 204, verified gone, không redeploy vì unread).

**Context:** nối tiếp research "server render/db render/firebase Web 2.0" (commit `f233f5dd1`): Web 2.0 = web2-api (WEB2_ONLY) + web2-realtime relay + web2Db (n2store-web2-db 161MB ~43 bảng) + Firebase ~95% đã bỏ.

**Files:** `web2/{customers,purchase-refund,balance-history,supplier-debt}/index.html`, `native-orders/index.html`, `CLAUDE.md` (+ MEMORY.md ngoài repo). **Status:** ✅ verified static (no firebase ref còn sót).

### [orders-report] Bấm cột TIN NHẮN mở NHẦM PAGE — bỏ ghi đè preferred-page + TTL ✅

**User:** "bấm cột tin nhắn mở modal -> nhiều khi nhầm page phải đổi tay lại -> page lưu ở cache / nhầm page ở đơn / lý do khác".

**Root cause (đúng giả thuyết cache):** [tab1-chat-core.js:807](orders-report/js/tab1/tab1-chat-core.js#L807) `openChatModal` đọc `_getPreferredPage(psid)` (localStorage `chat_preferred_pages` = `{psid:pageId}`) rồi **GHI ĐÈ VÔ ĐIỀU KIỆN** page của đơn — kể cả khi page đơn đúng + có conv. Cache **không TTL**, **key theo PSID page-scoped** (giả định sai). Lưu khi đổi tay (`switchChatPage`→`_savePreferredPage` [:2905](orders-report/js/tab1/tab1-chat-core.js#L2905)) → mỗi lần đổi tay poison vĩnh viễn mọi đơn cùng psid → ping-pong "phải đổi tay lại". Phụ: drift cross-page nhận "1 tên trùng" chưa verify SĐT ([:1411](orders-report/js/tab1/tab1-chat-core.js#L1411)); đơn `Facebook_PostId` rỗng → channelId rỗng.

**Fix (4 edit tab1-chat-core.js, bump `?v=20260614c`):**

1. Bỏ ghi đè: preferredPage CHỈ dùng khi đơn KHÔNG có page (`!pageId`). Page của đơn luôn thắng.
2. Truyền `opts.preferredPage` xuống `_findAndLoadConversation`.
3. Fallback có kiểm soát: page đơn không có conv → thử preferred-page TRƯỚC drift, **chỉ nhận khi `_convHasPhoneVerify` true** (SĐT khớp recent_phone_numbers) → hit thì chuyển ngữ cảnh (gửi tin đúng page). Không phá page đúng, không nhảy nhầm.
4. TTL 7 ngày cho map (format `{p,t}` + backward-compat đọc string cũ); dọn hết hạn khi save.

Giữ tính năng "nhớ page đã đổi" (qua fallback) mà diệt triệu chứng. `node --check` PASS. **Frontend-only** (GH Pages, không cần deploy Render). **Status:** ✅ — MEMORY [[reference_web1_realtime_msg_column]].

### [orders-report][render] Cột TIN NHẮN: match badge theo SĐT (fallback PSID) — fix TPOS PSID ≠ Pancake PSID ✅

**User:** "có cách match nào khác như match sđt cho dễ không? Tại vì pid tpos khác pid pancake nên khó match" → "kiểm rồi làm hết đi".

**Verify trước (docs/pancake §5,§14,§17):** WS event `pages:update_conversation` CHỈ mang `unread_count/last_sent_by/snippet/seen` — **KHÔNG có phone**. Phone (`recent_phone_numbers[]`) chỉ ở conv REST đầy đủ. Thứ tự match chuẩn của hệ: `global_id → phone → fb_id`. Chat-open ĐÃ fallback phone; chỉ badge realtime kẹt PSID-only. Reconcile cron (5') ĐÃ fetch conv đầy đủ mỗi pending → trích phone ở đó = 0 API mới.

**Làm (match psid HOẶC phone):**

- **Server**: `pending_customers` thêm cột `phone` (idempotent ALTER lúc boot, server.js sau setDb). `upsertPendingCustomer` nhận+lưu phone (COALESCE). GET `/pending-customers` trả `phone`. Reconcile cron ([scheduler.js](render.com/cron/scheduler.js)) trích `conv.recent_phone_numbers[0].phone_number` → backfill phone (UPDATE khi count đổi + backfill khi aligned, WHERE phone IS NULL).
- **Frontend**: row thêm `data-phone` (order.Telephone digits, [tab1-table.js:1414](orders-report/js/tab1/tab1-table.js#L1414)). tab1-init map+group giữ phone. Notifier ([new-messages-notifier.js](orders-report/js/chat/new-messages-notifier.js)): `_normPhone` (VN, 84→0), `_applyBadgesToRows` build `byPsid`+`byPhone`, mỗi row match **PSID trước, fallback SĐT** → badge cột messages. Bump `?v=20260614b`.

**Cơ chế:** đơn comment/livestream/khác-page có `Facebook_ASUserId` lệch `from_psid` Pancake → trước miss badge; giờ khớp qua SĐT (order.Telephone ↔ pending.phone do cron backfill). Phone chỉ là _fallback_ khi PSID không khớp → không tăng false-positive cho ca PSID đúng.

`node --check` PASS 6 file. **Cần deploy fallback.** **Status:** ✅ — MEMORY [[reference_web1_realtime_msg_column]].

### [orders-report][render] Cột TIN NHẮN realtime (Web 1.0): fix race/đè + gỡ hệ trùng `realtime_updates` ✅

**User:** "kiểm tra server render, db render web 1.0 về nhận tin nhắn realtime ở cột tin nhắn → bug, race condition, trùng tính năng gây đè". Sau phân tích (audit 30-agent): C (chẩn đoán live) → B (fix full) → "được thì xóa đi làm lại".

**Chẩn đoán live:** WS Pancake đang sống (`/api/realtime/status` connected); `pending_customers` có data nhưng nhiều entry STALE (snippet "Nv Hạnh"=shop đã rep nhưng còn count); hệ cũ `realtime_updates` phình 4072 rows/24h không ai đọc.

**Kiến trúc thật:** cột badge dùng bảng `pending_customers` (chatDb) + `new-messages-notifier.js`, KHÔNG phải `realtime_updates` (doc MESSAGING_SYSTEM.md đã stale). Pancake WS chạy CHỈ n2store-fallback (gated WEB2_ONLY).

**Backend fix (server.js + routes/realtime.js):**

- Gỡ hệ trùng `realtime_updates`: bỏ `saveRealtimeUpdate` (write) + 3 endpoint chết `/summary` `/new-messages` `/mark-seen`. Bảng giữ husk (dọn rows cũ qua /wipe-all). `pending_customers` = nguồn DUY NHẤT.
- Hardening vòng đời WS (root-cause cột chết im sau restart): `autoConnectRealtimeClients` bọc try-catch + Array.isArray TỪNG row (trước: 1 row JSON hỏng abort HẾT); `RealtimeClient.start` guard pageIds non-array; `/api/realtime/start` thêm guard WEB2_ONLY + validate pageIds + trả cờ `credentialsSaved` (trước nuốt lỗi save → restart sau không auto-reconnect).
- GET `/pending-customers` thêm guard WEB2_ONLY (defense-in-depth sau split 14/06).

**Frontend fix (new-messages-notifier.js — chống ĐÈ/nuốt tin):**

- `_wasRecentlyReplied`: event thiếu timestamp = tin MỚI (không suppress) + buffer skew 2s. Trước: fallback Date.now()+`<=` → nuốt tin mới cùng-ms suốt 24h.
- Thêm `_removePending` (gỡ KHÔNG set cờ suppress); reconcile + WS-read-detection dùng nó thay `clearPendingForCustomer` → hết reconcile-premature-clear (xoá badge user chưa thấy + chặn tin mới). Cờ suppress chỉ còn cho chính user reply.
- reconcile skip khi tab ẩn; re-apply + reconcile khi tab visible lại; listen `storage` event đồng bộ pending/replied-map đa tab.
- `_upsertBadge` guard `cell.isConnected` (chống badge rơi vào row đã detach giữa lúc surgical re-render). Bump `?v=20260614a`.

**Loại trừ (adversarial verify):** "full re-render đè badge" FALSE (đã có reapply hook+debounce); web2-api double-connect Pancake FALSE (autoConnect gated). `node --check` PASS 4 file. **Cần deploy fallback** (chạm render.com/**). **Status:\*\* ✅ — MEMORY [[reference_web1_realtime_msg_column]].

### [live-chat] Status KH từ kho web2 + bidirectional sync (3 trang dùng chung nguồn shared) ✅

**User (tiếp):** (1) treo comments-mobile coi render tất cả; (2) Trạng thái KH lấy ở kho KH web2; (3) 3 trang comments-mobile + index + web2/customers gắn kết: 2 trang comment dùng chung 1 nguồn shared, KH MỚI → update vào kho customers, data CÓ SẴN ở kho → update qua 2 trang comment. Kiến trúc: load all comment livestream ban đầu → append comment mới theo `post.type==='livestream'`.

**Phân tích:** relay `live-chat/server` đã lọc forward CHỈ COMMENT `post.type==='livestream'` → DB `web2_live_comments` livestream-only → client load all + append SSE delta = đúng (#1 đạt từ refactor trước). Status cũ: mobile gom "Khách quen"/"Mới", desktop dùng CRM `partner.StatusText`. Kho `web2_customers.status`="Normal" (verify batch-by-phone) + có địa chỉ. Harvest (write→kho) ĐÃ có desktop (snap), MOBILE CHƯA.

**Làm:** (1) `live-status.js` (`LiveStatus` shared) map status kho→nhãn VN; desktop+mobile lấy status TỪ KHO. (2) `live-customer-sync.js` (`LiveCustomerSync` shared) 2 chiều: `enrich` đọc kho (batch phone+fbid) + `harvest` ghi KH mới→`/harvest-comments` (dedupe/debounce, server non-overwrite, \_notify web2:customers). (3) Wire: desktop live-kho-enricher + mobile enrichWarehouse đọc qua LiveCustomerSync.enrich; harvest cả 2 trang (desktop onDelta/initial, mobile load/applyDelta).

**Browser-verified (localhost):** mobile status "Bình thường"80/"Mới"23 từ kho (0 err, harvest+batch fire); desktop status "Bình thường"70, liveStream true, harvest fire.

**Files:** `live-chat/js/shared/{live-status.js,live-customer-sync.js}` mới + `live-chat/js/live/{live-comment-list,live-init,live-kho-enricher,comments-mobile}.js` + `live-chat/{index,comments-mobile}.html` (bump ?v=w2c). `node --check` PASS. **Status:** ✅

### [web2][render] SePay realtime cross-instance forward (fallback → web2-api SSE hub) ✅

**Tiếp nối tách web2-api:** `/api/sepay` vẫn ở fallback (Web 1.0), nhưng web2 fan-out (CK→ví KH) phát SSE notify trên fallback — client web2 subscribe ở hub web2-api → **miss realtime** (data vẫn ghi đúng web2Db). User: "Làm luôn".

**Fix (commit `b5d5a5056`):** `render.com/routes/realtime-sse-web2.js` `notifyClients()` wrap **in-place** — nếu `_forwardTarget` set → POST cross-instance sang `web2-api/api/realtime/web2/sse/relay-notify` (forward đặt TRƯỚC early-return vì fallback có 0 subscriber local). Vì mọi web2 notify đều qua `notifyClients` (sepay `_sseNotify`, `web2WalletEvents` listener, ck-watcher) → 1 chỗ phủ hết. Gated env `WEB2_API_FORWARD_URL` (set CHỈ trên fallback; web2-api không có → không forward, tránh loop). `relay-notify` honor `event` field. Admin topic loại trừ. `setForwardTarget()` wired ở server.js.

**Verify:** subscribe web2-api qua worker (`web2:fwd-test-*`) + POST relay-notify trên fallback (`clients:0` local — đúng kịch bản SePay) → **subscriber NHẬN** event forward. ✅ Cập nhật MEMORY [[reference_render_services]] + RENDER_SERVERS_GUIDE.

### [render][web2][worker] Tách backend Web 2.0 sang service riêng `web2-api` (Web1⊥Web2 service-level) ✅

**User:** "n2store-fallback là của web 1.0 → làm riêng cho web 2.0 hoặc chuyển tất cả web 2.0 qua [project web2.0n2store]". Chọn (AskUserQuestion): **service web2-api riêng** chạy lại codebase render.com ở chế độ web2-only.

**Vấn đề:** API Web 2.0 (~45 route + hub SSE web2 + crons) thật ra vẫn nằm trong monolith `n2store-fallback` (Web 1.0). Cloudflare worker route toàn bộ `/api/*` → fallback.

**Làm — flag-gated, reversible, deploy code-trước-infra-sau:**

1. **Flags `server.js` + `cron/scheduler.js`** (commit `58af65dee`): `WEB2_ONLY=1` → tắt mọi background job Web 1.0 (TPOS sync/WS, invoice poller, SIP, cron/scheduler, aikol); `DISABLE_WEB2_JOBS=1` → tắt cron Web 2.0. Mặc định 2 cờ unset = hành vi y hệt cũ (boot-test 2 mode: default web1Jobs=on, WEB2_ONLY web1Jobs=off no-crash). Chuyển web2 noti-scan cron ra khỏi scheduler (nay Web1-only) → server.js gated DISABLE_WEB2_JOBS.
2. **Service `web2-api`** (Render API, id `srv-d8n53oflk1mc739bi9gg`, `web2-api-kv04.onrender.com`, project web2.0n2store): copy 58 env từ fallback + WEB2_ONLY=1, rootDir render.com, plan starter, health `/health`. Verify LIVE: /health 200 (2 DB), services-overview ok:true, ổn định.
3. **Worker cutover** (commit `d04b01c53`, GH Action deploy): `isWeb2Path(pathname)` → origin web2-api, còn lại fallback (2 forwarder `handleRenderFallbackProxy`+`handleCustomer360Proxy`). Verify: worker services-overview process.uptime = web2-api ≠ fallback; frontend e2e (system/products/native-orders/balance-history) data load 0 error.
4. **fallback `DISABLE_WEB2_JOBS=1`** + redeploy (dừng cron web2 trùng; web1 /health 200). Double-cron window an toàn (claim atomic `FOR UPDATE SKIP LOCKED` + idempotent).
5. **Relay `FALLBACK_BASE` → web2-api** (sửa lỗi audit phát hiện): relay forward `/api/web2-live-comments/ingest` + `/api/realtime/web2/sse/relay-notify` — nếu giữ fallback (web2 jobs off) → **mất live-comments + inbox SSE**.

**Audit đối nghịch (workflow 14 agent, 33 findings/10 high)** → fix (commit `805a08866`): isWeb2Path += `/api/delivery-invoices` + `/api/refunds` (web2Db+SSE, trước route nhầm fallback → mutation notify sai hub); repoint 22 ref hardcoded `n2store-fallback` → `web2-api-kv04` (livestream snap/gallery/comments-mobile + thumbnail_url/zalo MEDIA_BASE default + relay default + 16 file web2 secondary base). Verify `/api/refunds/health`+`/api/delivery-invoices/health` = `{ok:true}` via web2-api. Giữ pbh-realtime.js wss (web2-api WS idle). **DEFER**: SePay web2 fan-out notify cross-instance (degradation, không mất data — data ghi đúng web2Db, refresh thấy).

**Kết quả:** Web 2.0 (web2-api + web2-realtime relay + web2-db) độc lập hoàn toàn trong project web2.0n2store. fallback = Web 1.0 thuần. Reversible (revert worker / flip env). 3 service live + new code. Cost +~$7/mo (starter). Chi tiết: MEMORY [[reference_render_services]].

### [live-chat] Realtime comment livestream: shared module append-only + self-tick time + địa chỉ desktop ✅

**User (4 ý):** (1) bỏ poller comment, comment mới → APPEND không re-render, làm 1 SHARED dùng chung index.html + comments-mobile.html; (2) index.html chưa hiện địa chỉ KH; (3) cải thiện toàn bộ; (4) "Vừa xong" có bộ đếm riêng tự tick (60s→1 phút…) vì append thì chỉ thời gian cần đổi.

**Map (workflow 4 agent):** desktop đã push-only + `prependComments` (append) nhưng time tuyệt đối tĩnh + địa chỉ bỏ qua `comment.address`; **mobile có poller 60s/90s + full `innerHTML` rebuild** mỗi SSE; server `web2_live_comments` có cột address, GET trả sẵn, SSE payload chỉ tickle.

**Làm:**

1. **2 module SHARED** (`live-chat/js/shared/`): `live-time.js` (`LiveTime`: relative "Vừa xong/N phút/N giờ" GMT+7 + MỘT setInterval 30s quét `[data-live-ts]` chỉ đổi textContent — KHÔNG re-render); `live-comments-stream.js` (`LiveCommentsStream`: SSE `web2:live-comments` + cursor `updated_at` + debounce 400ms delta-fetch + dedup → `onDelta(rows)`, `allowGlobal` cho mobile).
2. **Desktop** (`live-init.js`): thay block SSE inline + `_fetchLiveCommentDelta` → dùng `LiveCommentsStream` (onDelta→`prependComments`), tách `_resolveSelectedPostIds`, `primeCursor` sau initial load. `live-comment-list.js`: time → `LiveTime.markup` (data-live-ts), địa chỉ/SĐT fallback `comment.address`/`comment.phone` từ DB + `_rowSig` đồng bộ.
3. **Mobile** (`comments-mobile.js`): BỎ poller comment 60s; SSE → `LiveCommentsStream` → `applyDelta` (prepend card mới / patch card cũ theo data-id — KHÔNG full rebuild); time → `LiveTime.markup`; prime cursor sau load; giữ loadPosts 90s.
4. **Địa chỉ desktop (#2)** (`live-kho-enricher.js`): nâng từ lookup fb_id-only → **DUAL fb_id + phone** (`batch-by-fbid` + `batch-by-phone`) như mobile — KH key theo SĐT trong kho giờ cũng fill địa chỉ.

**Browser-verified (localhost, web2 login):** desktop — LiveTime/Stream loaded, `liveStream:true`, 18 ticker nodes, time "2 phút" relative, 0 console errors, SĐT từ DB hiện đúng 3/3. mobile — 100 cards, 100 ticker nodes, time "1 phút", 0 errors, 62 địa chỉ + 69 SĐT hiển thị (warehouse enrich OK).

**Files:** `live-chat/js/shared/{live-time.js,live-comments-stream.js}` (mới), `live-chat/js/live/{live-comment-list.js,live-init.js,comments-mobile.js,live-kho-enricher.js}`, `live-chat/{index.html,comments-mobile.html}`. `node --check` PASS hết. **Status:** ✅

### [web2] Trang "Cấu hình & Hệ thống" — gộp services-dashboard + admin-sse-monitor + danh sách trang ✅

**User:** "build 1 trang trong web 2.0 phần cấu hình thanh menu: xem render server, database render, xem log realtime, các trang dùng… gộp `services-dashboard` + `admin-sse-monitor` vào trang mới".

**Làm — trang mới `web2/system/`** (tabbed admin console, theme Zalo `#0068ff`):

1. **Tab "Dịch vụ & Hệ thống"** (`js/system-services.js`, port từ services-dashboard.js): cost strip + 2 DB card Render Postgres (usage bar + top tables) + 8 service card + 4 process card. Fetch `/api/services-overview`, auto-refresh 60s.
2. **Tab "Realtime (SSE)"** (`js/system-sse.js`, port từ admin-sse-monitor/monitor.js): admin-gated qua `/api/web2-users/me`. Live feed `web2:_admin:sse-log` (EventSource trực tiếp + admintoken), stats poll 2s, topics list, filter/pause/clear/send-test. Conn pill ở header. Lazy-start (chỉ kết nối khi mở tab).
3. **Tab "Các trang Web 2.0"** (`js/system-app.js`): đọc menu đã mount (`#web2Aside`) → inventory grouped theo section + summary (mục/đã có/WEB2/soon). Single source of truth = sidebar, không hardcode.
4. **Orchestrator** `system-app.js`: tab switching + lazy init per tab + reload theo tab active + deep-link `?tab=`.

**Wiring:** sidebar `web2-sidebar.js` thay 2 item ("SSE Monitor (Admin)" + "Bảng dịch vụ & chi phí") → 1 item "Cấu hình & Hệ thống" + thêm `web2/system/index.html` vào WEB2_PAGES. Permissions registry `web2-users.js` gộp 2 slug → `system`. Trang cũ → **redirect stub** (`admin-sse-monitor`→`?tab=sse`, `services-dashboard`→`?tab=services`) giữ deep-link; xóa js/css cũ. Cập nhật smoke list + overview (3 ref) + CLAUDE.md.

**Verify (browser session, admin/admin@@):** 3 tab OK — services: 45 USD/2 DB/8 svc/4 proc; pages: 10 group/37 card/summary [37,37,27,0]; sse: `live · web2:_admin:sse-log` 4 sub/200 log row. 2 redirect land đúng tab. **0 console error.** Screenshot 3 tab đẹp. **Status:** ✅ verified live.

**Files:** `web2/system/{index.html,css/system.css,js/{system-app,system-services,system-sse}.js}` (mới), `web2/{admin-sse-monitor,services-dashboard}/index.html` (redirect, xóa js/css), `web2/shared/web2-sidebar.js`, `render.com/routes/web2-users.js`, `scripts/n2store-smoke-all-pages.js`, `web2/overview/index.html`, `CLAUDE.md`. `node --check` PASS.

### [orders-report][KPI] Cột "BH" (bán thêm livestream) + tab "KPI Livestream" ✅

**User:** modal "Sửa đơn hàng" → tab Sản phẩm: thêm cột **BH (Bán hàng)** tick như KPI để đánh dấu SP bán thêm livestream; thêm sub-tab **KPI Livestream** trong trang "KPI - Hoa Hồng" ghi nhận toàn bộ SP bán thêm. Bổ sung: **tick BH thì không tick được KPI và ngược lại**.

**Quyết định (AskUserQuestion):** tab gom theo **chiến dịch live**; BH **chỉ đếm số lượng** (không tính tiền); phạm vi v1 **chỉ modal Sửa đơn hàng**.

**Làm — feature RIÊNG song song kpi_sale_flag (append-only, KHÔNG đụng KPI thường):**

1. **Backend** (`render.com`): migration `077_create_kpi_livestream_flag.sql` (bảng `kpi_livestream_flag` PK (order_code, product_id) + cột snapshot denormalized: product_name/quantity/campaign_name/seller_name/customer_name) + `run-migration-077.js` (env `DATABASE_URL`, không hardcode). Routes trong `realtime-db.js` (pool `chatDb` Web 1.0): `ensureLivestreamFlagTable` lazy + `GET /kpi-livestream-flag/list?days=N` (khai báo TRƯỚC `:orderCode`; `updated_at` dạng chuỗi +7 không Z) + `GET /:orderCode` + `PUT /:orderCode/:productId` (upsert + snapshot). Không sửa server.js (đã mount `/api/realtime`).
2. **Store** `orders-report/js/managers/kpi-livestream-flag-store.js` (`window.KpiLivestreamFlagStore`) mirror KpiSaleFlagStore nhưng gọn: load/get/set(+snapshot)/invalidate, **KHÔNG** trigger kpiManager. Include trong `tab1-orders.html` sau kpi-sale-flag-store.
3. **Modal** `tab1-edit-modal.js`: thêm cột header **BH** + checkbox `.bh-live-check`; gộp row-template 2 hàm (renderProductsTab + refreshProductsTableOnly) vào helper `_buildEditProductRow` (KPI disable khi isBh, BH disable khi isSale = loại trừ lẫn nhau). Handler `handleBhLiveToggle(i, checked, el)` lưu snapshot (campaign từ `CRMTeam`, seller từ `User.Name`, KH từ `Name`). `handleKpiSaleToggle` thêm chiều ngược (disable BH). Sửa `editProductDetail` dùng `.action-buttons` (class) thay `nth-child(8)` vì thêm cột (fix luôn bug latent cũ). tfoot colspan 3→4.
4. **Tab KPI Livestream** (`tab-kpi-commission.html/.js/.css`): sub-tab thứ 4 (`data-kpi-subtab="livestream"`, icon `radio`) + view `#kpiLivestreamView` (toolbar preset ngày + summary số chiến dịch/dòng SP/tổng SL + bảng gom theo campaign). `switchKpiSubTab` thêm `livestream`; `renderLivestreamKpiView` fetch `/kpi-livestream-flag/list` → lọc preset (so sánh ngày +7) → group campaign sort theo SL desc. CSS `.kpi-live-group`.

**Files:** `render.com/migrations/077_create_kpi_livestream_flag.sql` (mới), `render.com/run-migration-077.js` (mới), `render.com/routes/realtime-db.js`, `orders-report/js/managers/kpi-livestream-flag-store.js` (mới), `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-edit-modal.js`, `orders-report/tab-kpi-commission.html`, `orders-report/js/tab-kpi-commission.js`, `orders-report/css/tab-kpi-commission.css`. `node --check` PASS toàn bộ.

**Verify (Playwright live nhijudy.store + curl):** backend route deploy OK (~195s, bảng tự tạo); PUT→list→cleanup OK; modal render đúng 10 cột (BH sau KPI, tfoot colspan [3,1,1,1,4]=10); **loại trừ lẫn nhau 2 chiều** (tick BH→KPI disabled; tick KPI→BH disabled); tab KPI Livestream render đúng group theo chiến dịch (1 campaign/1 dòng/SL 2, giờ +7). 0 lỗi console liên quan feature. Dọn data test xong.

**Review (workflow 18 agent, 4 confirmed):** bump cache-buster `?v=20260614a` cho 3 file MODIFIED bị quên (tab1-edit-modal.js, tab-kpi-commission.js, tab-kpi-commission.css — trước đó chỉ bump file mới) + sửa `handleKpiSaleToggle`/`handleBhLiveToggle` dùng `querySelectorAll().forEach` (disable mọi checkbox cùng productId, đúng cả khi SP trùng nhiều dòng). **Status:** ✅ verified live.

### [render][web2-realtime] Consolidate Render: gộp tpos-pancake + facebook → web2-realtime, xóa 3 service ✅

**User:** "xóa n2store-facebook + n2store-aikol-scraper → xóa và build lại tpos-pancake đặt tên web2-realtime → web2-realtime nhận tất cả tính năng realtime của web2" + "xóa các server dư thừa".

**Quyết định (AskUserQuestion):** (1) tạo mới (không rename); (2) gộp TẤT CẢ endpoint FB vào web2-realtime.

**Làm — thứ tự an toàn (tạo+verify TRƯỚC, xóa SAU):**

1. **Port FB Graph** → `live-chat/server/facebook-routes.js` (private-reply, conversations, messages, send, upload, find-by-psid, read, refresh-tokens). Token: cache TPOS CRM → refetch → **fallback env `PAGE_TOKEN_<pageId>`** (đảm bảo private-reply chạy dù cache rỗng — live-chat reply KHÔNG gửi TPOS token). Mount vào relay + thêm CORS. Deps: cors/multer/form-data/node-fetch. package.json → name `web2-realtime` v3.
2. **Tạo service** `web2-realtime` (`srv-d8n45k4vikkc73cg3nrg`, starter, singapore, rootDir `live-chat/server`, healthCheckPath `/ping`) qua Render API, **copy 25 env** từ tpos-pancake. **Verify live**: banner v3 accounts 1/1 connected 4 pages + `/api/facebook-status` ok + private-reply route 400 "message required" (không 404) + CORS `*`.
3. **Đổi 4 URL frontend** (live-state/pancake-state/pancake-data-manager) `livePancakeUrl`+`n2storeUrl` → `web2-realtime.onrender.com`.
4. **Xóa 3 service** (Render API DELETE → 204, verify 404): `n2store-tpos-pancake`, `n2store-facebook`, `n2store-aikol-scraper` (suspended).
5. **Dọn repo**: xóa folder `n2store-facebook/`; cập nhật `service-costs.js` (registry + plan map + quick-links: 1 entry web2-realtime, realtime sửa Standard→Starter $7 đúng thực tế), overview note, RENDER_SERVERS_GUIDE (banner consolidation).

**Kết quả:** 5 resource còn lại đều cần (web2-realtime, n2store-realtime, n2store-fallback, n2store-chat-db, n2store-web2-db). Tiết kiệm −$7/tháng. Còn nguyên Web1⊥Web2 (n2store-realtime=Web1.0 inbox giữ riêng).

**Files:** `live-chat/server/{facebook-routes.js,server.js,package.json,render.yaml,.gitignore}`, `live-chat/js/{live/live-state.js,pancake/pancake-state.js}`, `shared/js/pancake-data-manager.js`, `service-costs/js/service-costs.js`, `web2/overview/index.html`, xóa `n2store-facebook/`. `node --check` PASS. **Status:** ✅ verified live.

### [delivery-report] Nút "Ảnh Thành Phố" gửi kèm FILE EXCEL (2 sheet: THÀNH PHỐ + THU VỀ) ✅

**User:** "thành phố chưa có gửi file excel" (mở rộng tính năng Excel sang nút TP, sau TMT/NAP).

**Làm:** thêm `buildCityHandoverExcelBlob(cityItems, returnItems, returnHandoverMap)` — workbook 2 sheet: "THÀNH PHỐ" (`buildExcelRows` đơn ship đã quét) + "THU VỀ" (`buildExcelRowsReturn` kèm SL/giá trị từ ticket CSKH, chỉ khi có thu về). Trong `copyHandoverImage`: sau khi gửi ảnh OK → gửi Excel (`BANGIAO_THANHPHO_<ngày>.xlsx`) qua `sendHandoverDocumentToTelegram` → reload. Lỗi Excel KHÔNG huỷ ảnh (chỉ alert). Tooltip nút + bump `?v=20260614e`.

**Files:** `delivery-report/js/delivery-report.js`, `delivery-report/index.html`. `node --check` PASS. Endpoint `/send-document` đã verify live (test xlsx → `Document sent` 05:48 UTC, messageId 31). **Status:** ✅ (dùng chung server đã proven; client mirror path TMT/NAP).

### [delivery-report] Bỏ nút xuất Excel ở tab Tỉnh + Tất cả + Đơn 0đ ✅

**User:** "bỏ nút xuất excel ở Tỉnh, Tất cả, Đơn 0đ".

**Làm:**

- Tab **Tỉnh** (`province`): xoá hẳn 2 nút `drBtnExportTomato` ("Xuất TOMATO") + `drBtnExportNap` ("Xuất NAP") khỏi HTML + bỏ block toggle trong `updateProvinceExportButtons`. Giữ nguyên nút Ảnh TMT/NAP (gửi Telegram).
- Tab **Tất cả** (`all`) + **Đơn 0đ** (`zero`): thu hẹp `isMulti` từ `(all || zero || combo)` → chỉ `combo` → nhóm nút export `drBtnExportGrp*` ("TOMATO"/"BÁN HÀNG SHOP"/…) không còn hiện ở 2 tab này. **Giữ ở tab combo** "TOMATO + BÁN HÀNG SHOP" (user không yêu cầu bỏ).

**Files:** `delivery-report/index.html`, `delivery-report/js/delivery-report.js` (bump `?v=20260614c`). `node --check` PASS. Generic `drBtnExport` không tồn tại trong HTML (getElementById guard null) → không ảnh hưởng. `exportExcelProvince` còn export trong API nhưng không còn nút gọi (để nguyên, low-risk). **Status:** ✅

### [render][realtime] Audit 5 Render service qua API+log → fix token livestream + tắt log health-probe ✅

**User:** "có mấy server render hiện tại không dùng đúng không? Đọc log đi và có server bị spam 1 lệnh mấy lần" → "Kiểm lại 1 lần nữa rồi làm tất cả".

**Điều tra (Render API + Logs API, ownerId tea-d3fn6ok9c44c73d9g59g):** 5 service — `n2store-fallback` (standard, hub), `n2store-realtime` (starter, WS proxy Web1.0), `n2store-tpos-pancake` (starter, relay WS→fallback cho Web2.0; folder rename `tpos-pancake`→`live-chat` nhưng tên service giữ cũ), `n2store-facebook` (starter, FB Graph trực tiếp), `n2store-aikol-scraper` (🔴 SUSPENDED).

**Phát hiện từ log:**

1. **`n2store-facebook` bị "spam" `GET /health` đúng mỗi 5s, 100% log** (200 dòng/14ph chỉ health, `cachedPages:0`). Thủ phạm = **Render tự probe `healthCheckPath`** (không phải bug code). Mọi service đều bị (fallback/realtime `/health`, tpos-pancake `/ping`).
2. **`n2store-realtime` lỗi `[LIVESTREAM] No page_access_token … Invalid access_token` 18×/window**. Root cause: `getOrFetchPageAccessToken()` dùng `realtimeClient.token` (legacy single-account, stale/expired) trong khi service chạy **multi-account pool** → token sai → fail mỗi comment.

**Verify lại (theo yêu cầu) trước khi làm → ĐỔI kế hoạch:**

- **KHÔNG suspend `n2store-facebook`**: nó backing `privateReplyN2Store()` (gọi `n2storeUrl` ngay cả mode `pancake`) + toggle `serverMode='n2store'` → suspend = hỏng ngầm private-reply.
- **KHÔNG xoá `aikol-scraper`**: đã suspended sẵn, xoá không hoàn lại.
- **KHÔNG gộp realtime+tpos-pancake**: vi phạm rule Web1⊥Web2 + rủi ro cao.

**Làm (an toàn):**

1. **Fix gốc token livestream** (`n2store-realtime/server.js`): thêm `getJwtForPage(pageId)` lấy token từ **pool client sở hữu page** (fallback any-connected → legacy) + **negative-cache `PAGE_TOKEN_NEG_TTL=10ph`** ở mọi nhánh fail → vừa dùng đúng token vừa hết spam log.
2. **Tắt log health-probe** ở cả 4 server (`req.path` skip `/health`,`/ping`,`/health/detailed`): `render.com/server.js`, `n2store-realtime/server.js`, `live-chat/server/server.js`, `n2store-facebook/server/server.js`.
3. **Cập nhật doc** `docs/guides/RENDER_SERVERS_GUIDE.md`: thêm bảng "Trạng thái thực tế 2026-06-14" (5 service, plan đúng, routing, health-probe), đính chính realtime=starter (không phải Standard) + realtime KHÔNG có TPOS + facebook đã LIVE (không phải "chưa deploy").

**Files:** `render.com/server.js`, `n2store-realtime/server.js`, `live-chat/server/server.js`, `n2store-facebook/server/server.js`, `docs/guides/RENDER_SERVERS_GUIDE.md`. `node --check` PASS cả 4. **Status:** ✅ (4 service sẽ redeploy khi push — đổi nhỏ, low-risk).

### [delivery-report][render] Nút "Ảnh TMT" + "Ảnh NAP": gửi kèm FILE EXCEL cùng ảnh vào Telegram ✅

**User:** "hình + gửi thêm file excel" (tiếp nối yêu cầu trước về 2 nút TMT/NAP).

**Làm:**

- Backend `render.com/routes/delivery-report-telegram.js`: thêm endpoint `POST /send-document` (Telegram `sendDocument`, giới hạn 45MB, sanitize filename, cùng rate-limit/timeout/env với `/send-photo`).
- Client `delivery-report.js`: thêm `sendHandoverDocumentToTelegram(blob, filename, caption)` + `buildHandoverExcelBlob(items, sheetLabel)` (`XLSX.write(..., {type:'array'})` → Blob, cùng cột `buildExcelRows` của nút Xuất TMT/NAP). Trong `copyGroupHandoverImage`: gửi ảnh OK → build Excel từ `scannedItems` → `sendHandoverDocumentToTelegram` (filename `BANGIAO_<TMT|NAP>_<ngày>.xlsx`) → reload. Lỗi Excel KHÔNG huỷ kết quả ảnh (chỉ alert). Tooltip 2 nút + bump `?v=20260614b`.

**Files:** `render.com/routes/delivery-report-telegram.js`, `delivery-report/js/delivery-report.js`, `delivery-report/index.html`. `node --check` PASS cả 2. **Status:** ✅ code xong (không test live vì send Telegram = side-effect vào nhóm giao hàng thật). Backend cần Render deploy (push chạm `render.com/**` → auto-deploy theo build filter).

### [delivery-report] Nút "Ảnh TMT" + "Ảnh NAP" gửi nhóm Telegram (giống "Ảnh Thành Phố") ✅

**User:** "cho 2 nút Ảnh TMT + Ảnh NAP gửi lên telegram giống nút Ảnh Thành Phố".

**Khảo sát:** nút "Ảnh Thành Phố" (`copyHandoverImage`) build canvas → `canvasToBlob` → `sendHandoverImageToTelegram(blob, caption)` (Render route `/api/delivery-report-telegram/send-photo`, bot riêng) → reload trang khi gửi OK. 2 nút TMT/NAP (`copyGroupHandoverImage`) chỉ `copyCanvasToClipboard`.

**Làm:** trong `copyGroupHandoverImage`, thay nhánh clipboard bằng đúng flow Telegram của nút TP: `canvasToBlob` → set nút "Đang gửi Telegram..." → `sendHandoverImageToTelegram(blob, "📦 Bàn giao ${label} ${dateLabel} — N đơn")` (label = TMT/NAP) → thành công thì reload, lỗi thì alert + reset nút. Cập nhật tooltip 2 nút "(copy vào clipboard)" → "(gửi nhóm Telegram)". Bump `delivery-report.js?v=20260614a`.

**Files:** `delivery-report/js/delivery-report.js`, `delivery-report/index.html`. `node --check` PASS. **Status:** ✅ (không test live vì send Telegram là side-effect vào nhóm giao hàng thật; logic copy y hệt nút TP đã chạy ổn).

### [so-order] FIX deep-link cross-tab + Unicode NFC — link ví/công nợ → so-order giờ tìm đúng NCC ✅

**Bối cảnh:** "continue" sau D/E/C. Khảo sát: supplier-360/supplier-aging/smart-match/inventory-forecast **KHÔNG tồn tại** trong codebase (MEMORY/research nhầm với plan 2026-05) — chỉ supplier-debt/supplier-wallet có thật (đã deep-link ở B). Đi xác minh "nuance" deep-link đã flag → **phát hiện bug thật**.

**Bug:** so-order chỉ render TAB ĐANG ACTIVE. Link `?supplier=` từ ví/công nợ khi NCC ở tab khác → 0 match (browser-repro: active=huongchau, `?supplier=KHO TÂN BÌNH` (hanoi) → không switch). 2 nguyên nhân:

1. **Unicode NFC/NFD**: param URL decode ra NFD (14 ký tự) ≠ data lưu NFC (12) → `toLowerCase()` không khớp. Fix: `norm = s => s.normalize('NFC').trim().toLowerCase()` cả 2 vế.
2. **Async pull reset**: pull Postgres lúc init chạy SAU `_applyDeeplink` → ghi đè activeTabId. Fix: retry 6×/2.4s re-assert tab đích + mở shipment collapse, scroll khi row xuất hiện, tự dừng.

Cũng nâng `_applyDeeplink`: quét toàn state tìm tab+shipment chứa NCC → switch tab + un-collapse (trước chỉ tìm trong DOM active tab).

**Browser-verified (localhost dl4):** active=huongchau → `?supplier=KHO TÂN BÌNH` → **switch sang hanoi, 10 dòng match**. NFC≠NFD confirm (12 vs 14 ký tự).

**+ Hardening cùng class (supplier-wallet + supplier-debt):** 2 trang cũng match param raw (`wallets[_dlSup]` object-key / `[data-supplier="..."]` exact + filter text) → cùng lỗi NFC. Fix: resolve tên NCC đúng form bằng NFC (wallet tìm key; debt resolve từ `suppliersList` rồi set search + match row theo NFC). Verified: `supplier-wallet?supplier=XƯỞNG SỈ A` (NFD) → drawer auto-mở.

**Files:** `so-order/js/so-order-app.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`, `web2/supplier-debt/js/supplier-debt-app.js` (`?v=20260614dl4`). `node --check` PASS. **Status:** ✅

### [web2][render] Hướng C — đào sâu analytics: KPI "Sổ Order / NCC" lên dashboard ✅

**User:** "D, E, C". C = đào sâu analytics đã có. Chọn deepening **kết nối 3 hướng**: dashboard surface tín hiệu Sổ Order/NCC (cùng nguồn Hướng E) + click mở so-order (deep-link Hướng B).

**Khảo sát:** dashboard-kpi.js (F01) đã có 8 KPI (doanh thu, PBH, tồn thấp, ví âm, sepay…) nhưng **không có gì về Sổ Order/NCC** — layer mà B+E vừa kết nối. supplier-360/smart-match/inventory-forecast = piggy-back `/api/v2/*`, để nguyên (ngoài scope an toàn).

**Làm:**

- Backend `dashboard-kpi.js`: thêm block đọc 1 doc JSONB `web2_so_order` (C8) → `so_open_shipments`, `so_unreceived_shipments`, `so_unreceived_products` (try/catch → 0). Cùng logic parse như Hướng E.
- Frontend `web2/dashboard/index.html`: thêm KPI card "Đợt chưa nhận đủ" (tím #7c3aed), sub "N đợt · M SP chờ", click → `../../so-order/index.html`. KPI_IDS + skeleton + render đồng bộ.

**Files:** `render.com/routes/v2/dashboard-kpi.js`, `web2/dashboard/index.html`. `node --check` PASS. **Status:** ✅ **VERIFIED LIVE**: API trả `so_open_shipments:14, so_unreceived_shipments:13, so_unreceived_products:28` (parse JSONB đúng); card dashboard render "13" + sub "14 đợt · 28 SP chờ" + clickable onclick→so-order.

### [render] Hướng E — automation: alert "Đợt Sổ Order cũ chưa nhận đủ hàng" vào notification cron ✅

**User:** "D, E, C". E = automation qua hạ tầng sẵn có.

**Khảo sát:** `scanAndCreateNotifications(pool)` (B5) đã chạy cron mỗi 10' với 4 alert: PBH draft >24h, tồn <5, ví KH âm, thu-về quá hạn. Hạ tầng noti đầy đủ (bảng `web2_notifications` + SSE `web2:notifications` + bell sidebar). **Công nợ/ví NCC = derive client-side từ so-order → KHÔNG query sạch server-side**; Zalo automation cần module Zalo live (quét QR) → không verify autonomous được. Nên E làm phần **clean + giá trị**: alert đợt Sổ Order cũ chưa nhận.

**Làm:** thêm block 5 vào `scanAndCreateNotifications`: đọc 1 doc JSONB `web2_so_order` (C8) → parse JS, đợt có `date` > 21 ngày mà còn row `status≠'received'` → noti `so_shipment_unreceived` (severity info, gom NCC, link deep-link `?tab=`). **Dedupe 12h riêng** (không dùng `_insertDedupe` 1h) vì điều kiện sống dài → tránh spam mỗi giờ. Cap 25 đợt/lần.

**Không làm (nêu rõ):** công nợ NCC quá hạn (cần normalize so-order ra rows = C8 phase 2, defer); Zalo nhắc nợ (cần Zalo live).

**Files:** `render.com/routes/v2/notifications.js`. `node --check` PASS. **Status:** ✅ **VERIFIED LIVE**: `/scan` chạy clean (14 noti, đa số `stock_low` thật); block mới chạy không lỗi; data hiện 14 đợt đều ngày 2026-06-13 (oldest=hôm qua) → 0 đợt >21 ngày → 0 alert `so_shipment_unreceived` ĐÚNG (client-side đếm độc lập cũng = 0). Sẽ fire khi đợt thật quá 21 ngày.

### [web2][render][worker] Hướng D — dọn nốt Firestore Web 2.0 → Postgres ✅

**User:** "D, E, C" (làm tiếp 3 hướng). D = dọn Firestore (nối tiếp Task 1 gỡ firebase).

**Khảo sát:** footprint Firestore Web 2.0 còn lại: (1) purchase-refund fallback đọc `web2_so_order`, (2) web2-msg-template.js CRUD template, (3) live-chat token-sync (pancake_tokens) — **GIỮ** (infra đang sống, relay đọc, không phải dead code).

**D1 — purchase-refund C8 leftover (correctness, bỏ sót lần fix data-flow):** picker `loadSoOrderReceivedItems()` vẫn fallback Firestore `web2_so_order/main` (frozen) khi IDB+localStorage trống → trên máy mới refund dùng so-order CŨ. Fix: load `web2-so-order-reader.js` + đổi fallback sang `Web2SoOrder.load()` (Postgres, có auth). Đây là consumer C8 thứ 5 (đã fix debt/wallet/products/manual-deposit).

**D2 — message templates Firestore → Postgres:** chỉ CRUD template còn Firestore (send-job đã ở Render). Mới:

- Route `render.com/routes/web2-msg-templates.js` — bảng `web2_msg_templates` (web2Db): GET (seed 4 default nếu rỗng) / POST (create|update) / DELETE. SSE `web2:msg-templates`. `requireWeb2AuthSoft` + WeakSet ensureTables.
- `server.js` mount + initializeNotifiers. Worker: `WEB2_MSG_TEMPLATES` allowlist (routes.js ×2 + worker.js case).
- Client `web2-msg-template.js`: bỏ `_copyFromLegacy`/`_seedDefaults`/`window.db`; `_loadTemplates/_saveTemplate/_deleteTemplate` gọi `/api/web2-msg-templates` (map server name/content → Name/Content giữ nguyên modal). Cache localStorage giữ.

**Verify:** mọi file `node --check` PASS, 0 firebase logic còn trong web2-msg-template.js. Endpoint cần deploy Render+worker mới curl-verify được.

**Files:** purchase-refund (HTML+JS), web2-msg-templates.js (mới), server.js, worker.js, routes.js, web2-msg-template.js. **Status:** ✅ **VERIFIED LIVE**: GET auto-seed 4 default vào Postgres; CRUD round-trip qua session (create TEST-D2-tpl → appeared → delete → removed, finalCount về 4); worker proxy OK.

### [web2] Cross-page deep-linking (Hướng B) — liên kết NCC: công nợ ↔ ví ↔ sổ order, so-order → Kho SP ✅

**User:** "tiếp tục" (sau đợt C) → hướng B trong đề xuất. Giờ so-order đã ở Postgres (C8) nên dữ liệu liên thông được giữa các trang.

**Khảo sát trước (Explore agent):** khóa join chung của hệ NCC = **tên NCC (string)**, không có id số. Chưa trang nào đọc `?supplier=`. Chưa có shared nav helper.

**Mới:** `web2/shared/web2-deeplink.js` (`Web2Deeplink`) — tự tính app-root từ pathname → build URL tuyệt đối (không lệ thuộc độ sâu thư mục): `url.supplierWallet/supplierDebt/soOrder/product/nativeOrders/reconcile`, `param(name)`, `linkBtn({label,icon,url,title})`. CSS `.w2-xlink` (nút pill) + `.w2-deeplink-flash` (highlight 2.4s) trong `web2-theme.css`.

**Wire (4 agent song song):**

- **supplier-debt**: mỗi dòng NCC + nút "Ví" → supplier-wallet?supplier=, "Sổ Order" → so-order?supplier=. Đọc `?supplier=` lúc load → filter + expand + scroll + flash.
- **supplier-wallet**: đọc `?supplier=` → auto mở detail drawer NCC đó. Trong drawer thêm "Công nợ" + "Sổ Order".
- **so-order**: mỗi dòng SP + kho-link 📦 → products?code= (qua `_lookupKhoCode`). Đọc `?supplier=`/`?tab=` → switch tab + highlight dòng NCC. Thêm `data-supplier` lên `<tr>`.
- **products**: đọc `?code=` → pre-filter + scroll/flash + `openEdit(code)`.

**Browser-verified (localhost + ext, 0 console error):** debt 5 dòng có Ví/Sổ Order; `supplier-wallet?supplier=HÀ NỘI` → **drawer auto-mở** + 2 back-link; so-order kho-link `?code=HCAO2BE28`; `products?code=HCAO2BE28` → **pre-filter + mở editor "ÁO KHOÁC DÙ"**. Href tuyệt đối + encode đúng.

**Known nuance:** so-order `?supplier=` highlight match theo NCC thật trên dòng, còn debt/wallet trong data hiện key theo tab-label ("HÀ NỘI") → link wallet→so-order có thể không match dòng (degrade = info toast, không lỗi). Link giá trị cao (debt↔wallet auto-open, so-order→products) chạy hoàn hảo.

**Files:** `web2/shared/web2-deeplink.js` (mới), `web2/shared/web2-theme.css`, supplier-debt/supplier-wallet/so-order/products (HTML+JS). Bump `?v=20260614dl`. **Status:** ✅

### [web2] UX đợt C — Medium/Low ~21 trang: modal Esc/Enter + autofocus + mobile + empty-state icon + silent-catch + aria-label ✅

**User:** "tiếp tục" (sau đợt B). Làm tiếp 🟧 Medium/Low của `docs/web2/WEB2-UX-AUDIT.md`, chỉ phần low-risk giá trị cao.

**Cách làm:** 8 agent song song chia theo trang. `node --check` mọi JS đổi (PASS), 0 conflict marker. **Bỏ qua** rewrite nặng rủi ro: virtual scroll (notifications/audit-log 100-200 row), rewrite hand-built bar-chart (report-revenue), throttle `lucide.createIcons` (balance-history).

- **Modal keyboard**: supplier-debt + supplier-wallet (Pay/Return) Enter-submit, pancake-settings credsModal Esc, audit-log/livestream/report-delivery filter & date Enter. (so-order Esc + native-orders edit Esc đã sẵn.)
- **Autofocus/select**: pay amount supplier-debt/supplier-wallet (.select), returns custSearch, native-orders editCustomerName, variants shortCode, kpi campaign select.
- **Mobile @media**: balance-history, supplier-wallet, report-delivery, report-revenue (.panels), dashboard kpi-grid ≤480px, customers (ẩn cột), notifications.
- **Empty-state icon**: balance-history, returns, variants, kpi, customer-wallet (per-filter).
- **Silent-catch → toast**: ck-dashboard loadHistory, users-permissions loadRegistry/loadUsers.
- **Feedback/discoverability/a11y**: report-delivery swap-notify, users-permissions role success + Xoá-tất-cả confirm, dashboard bỏ impl-detail + KPI clickable hint, aria-label nút icon (supplier-debt/native-orders/products/report-revenue), audit-log diff '(đã rút gọn)', products source-pill 'Kho sản phẩm', photo-studio brush a11y, livestream validate.

**Files (~37):** balance-history, supplier-debt, supplier-wallet, so-order, native-orders, report-delivery, ck-dashboard, kpi, dashboard, users-permissions, customers, customer-wallet, returns, variants, products, report-revenue, pancake-settings, photo-studio, notifications, audit-log, livestream-poller. Bump `?v=20260614ux2`. Doc: `WEB2-UX-AUDIT.md` mục "✅ Đợt C". **Status:** ✅ (nhiều task agent báo "đã có sẵn").

### [web2] UX đợt B — 17 trang: skeleton loading + error+retry + mobile @media + keyboard/focus + empty-state ✅

**User (3 việc):** 1/gỡ firebase dead-code 2/Web 2.0 bắt buộc login 3/nghiên cứu IMPROVEMENT-PLAN + web2 md → đề xuất hướng. Sau khi present → user: "làm đi" → triển khai đợt B (29 high-impact của `docs/web2/WEB2-UX-AUDIT.md`).

**Cách làm:** 7 agent song song chia theo TRANG (mỗi file 1 chủ → không clobber). 1 agent chết giữa chừng (socket) → re-run group (users-permissions/customers/customer-wallet/ck-dashboard). Validate: `node --check` mọi JS đổi (PASS), 0 conflict marker, verify closure refs resolve (`clearFilters` hoisted, returns `clearCustomer`/`btnSubmit` tồn tại).

- **Loading/skeleton** `.w2-skel`: audit-log, notifications, dashboard, kpi, report-revenue (6 card + chart/table), so-order, supplier-debt, supplier-wallet, reconcile.
- **Error+Thử lại**: audit-log, notifications, dashboard, kpi, report-revenue (cả 6 section), products, users-permissions (alert→notificationManager).
- **Mobile @media**: audit-log, ck-dashboard, products, variants, supplier-debt, reconcile, users-permissions.
- **Forms/keyboard/focus**: products (Enter-save + focus pmName), variants (Enter-save), supplier-debt (date change→auto-filter), returns (Esc/Enter), customers (modal giữ mở khi lỗi + spinner).
- **Empty-state**: native-orders (inbox + 'Xóa bộ lọc'), notifications (bell-off).
- **Discoverability**: so-order (cursor:cell + hint), customer-wallet ('Hard reset'→'Xoá cache' amber).

**Files (29):** audit-log, notifications, dashboard, kpi, report-revenue, so-order, supplier-debt, supplier-wallet, reconcile, native-orders, returns, products, variants, users-permissions, customer-wallet, ck-dashboard (HTML/JS/CSS). Bump `?v=20260614ux`. Doc: `docs/web2/WEB2-UX-AUDIT.md` mục "✅ Đợt B". **Status:** ✅ (nhiều task agent báo "đã có sẵn" từ session trước — chỉ bổ sung phần thiếu).

### [live-chat][render] Comment mobile v3 — DÙNG CHUNG NGUỒN với index.html: avatar thật + thumbnail + ẩn-theo-người + hết giật ✅

**User (5 ý):** 1/ẩn comment (modal "Người bị ẩn" như desktop) 2/hiện tên bài livestream 3/hiện thumbnail 4/dùng chung nguồn với `live-chat/index.html` đỡ tốn tài nguyên 5/trang bị **giật/treo** → debug & fix hết.

**Quyết định kiến trúc (#4):** KHÔNG load full engine desktop (~40 script: firebase/lucide/auth = nặng + chính nó cũng giật). Giữ trang **nhẹ** nhưng dùng **CHUNG BACKEND** với desktop:

- **#1 Avatar (95/95 thật):** `${WORKER}/api/fb-avatar?id=<fb_id>&page=<page_id>` — đúng nguồn `SharedUtils.getAvatarUrl` (auth-free). Fallback initials nếu lỗi. (Trước: 0 avatar.)
- **#1 Ẩn theo NGƯỜI (modal hình 1):** **reuse module `live-hidden-commenters.js`** — record server `global` (`/api/web2/live-hidden-commenters`, SSE `web2:live-hidden-commenters`) **dùng chung desktop**: ẩn ở máy này/desktop → đồng bộ mọi máy. Mặc định ẩn 2 page shop. Shim `window.LiveState.workerUrl` + `window.LiveCommentList.renderComments→scheduleRender` để module re-render đúng. Nút header `🙈 (N)` → `openManager()` (modal "🙈 Người bị ẩn comment" + Bỏ ẩn). Sheet chi tiết: "Ẩn tất cả comment của người này" → `LiveHiddenCommenters.hide()`. Bỏ toggle localStorage cũ.
- **#3 Thumbnail (64–71/88):** trước gọi nhầm `${WORKER}/api/livestream/...` → worker proxy sang **TPOS 404**. Sửa: gọi **trực tiếp Render** `n2store-fallback.onrender.com/api/livestream/snapshots/by-comment-ids`, đọc field **`thumbnailUrl`** (camelCase, không phải `thumbnail_url`) + bonus `livestreamUrl` (deep-link "Xem khoảnh khắc trong livestream" trong sheet).
- **#2 Tên bài:** backend `web2-live-comments.js` — bảng `web2_live_post_titles` + `/page-posts` persist title (piggyback call có sẵn, 0 call Pancake mới) + `/posts` LEFT JOIN trả `title`. Picker hiện title khi có; fallback "Buổi livestream". (Title đầy dần khi deploy + có JWT Pancake lúc live.)
- **#5 Hết giật:** render **debounce 80ms** (gom enrich+thumb+SSE+poll thành 1 lần thay vì rebuild 3–5 lần), **cap 100 dòng** + nút "Xem thêm", **lazy** avatar/thumbnail. Đo `PerformanceObserver(longtask)` khi cuộn hết list: **0 long-task, 0ms** (trước: treo).

**Files:** `live-chat/comments-mobile.html` (nút 🙈 header + load notification-system + live-hidden-commenters + bỏ toggle pills + more-btn css), `live-chat/js/live/comments-mobile.js` (rewrite: fb-avatar, snapshots direct-render, isHiddenPerson qua module, picker title, render pipeline), `render.com/routes/web2-live-comments.js` (post-titles). Bump `?v=20260614cm3`.

**Verify browser (eval state, 0 screenshot mù):** 95 card, **avImg 95/95**, **thumb 64–71**, hidden modal = hình 1 (House/Store + Bỏ ẩn), shop ẩn mặc định, status kho (Khách quen 82/Mới 6), picker 22 bài + count, **console CLEAN**, **0 long-task khi cuộn**. **Status:** ✅ (#2 title self-heal sau deploy + live).

### [shared] Thêm "Comment Live 📱" vào sidebar (Sale Online) ✅

**User:** thêm livestream điện thoại vào thanh menu.

- `web2/shared/web2-sidebar.js`: thêm item `{ label: 'Comment Live 📱', our: '../live-chat/comments-mobile.html' }` ngay sau "Chat Pancake" trong nhóm **Sale Online** + đăng ký `live-chat/comments-mobile.html` vào `WEB2_PAGES` (badge "WEB 2.0").
- Verify: nav overview → anchor render đúng href `../../live-chat/comments-mobile.html`, label "Comment Live 📱 - WEB 2.0". Parse OK.

### [live-chat][render] Viewer comment mobile — avatar/địa chỉ/trạng thái + ẨN comment shop + CHỌN livestream ✅

**User (5 ý):** 1/không thấy avatar 2/thêm ẩn comment, mặc định ẩn NhiJudy House/Store 3/không thấy địa chỉ + trạng thái KH 4/lọc comment từ livestream 5/cho chọn post livestream (đang/đã live).

**Root cause khảo sát:** API `web2_live_comments` có cột `avatar`/`address` nhưng poller ghi `null` (comment list pages.fm ~0% kèm); `has_order` gần như luôn false; nhiều row là **shop tự reply** (`fb_id == page_id`, tên "NhiJudy Store/House") → nhiễu. Backend đã có sẵn `GET /posts` (22 bài + comment_count) + `GET /page-posts` (live/ended) + kho `web2_customers` (`batch-by-phone`/`batch-by-fbid` trả address+status, auth-free).

**Đã làm:**

- **#1 Avatar (backend `render.com/services/web2-livestream-poller.js`):** `_doFetchCustomerPhone`→`_doFetchCustomerProfile` lấy thêm **avatar + address** từ CÙNG request `/customers/:uuid` đã fetch cho phone (cache 6h/uuid, không thêm call). `_enrichFromProfile` fill phone/avatar/address. `upsertComments` đã persist sẵn → avatar/address tự đầy cho live KẾ TIẾP. Client: avatar thật nếu có, fallback initials màu.
- **#3 Địa chỉ + trạng thái (client, NGAY trên data cũ):** enrich từ KHO `web2_customers` (`POST batch-by-phone` + `batch-by-fbid`) → address + status (VIP/Bom/Cảnh báo/Nguy hiểm/**Khách quen**/Mới). Smoke: 82/88 "Khách quen", 57/88 có địa chỉ.
- **#2 Ẩn comment:** detect shop-own (`fb_id==page_id` / tên trùng page) → toggle "🙈 Ẩn shop" **mặc định BẬT** (localStorage) + ẩn từng comment (nút trong sheet) + toggle "👁 Đã ẩn (N)" xem lại (tag "đã ẩn"). Smoke: 112/200 comment shop ẩn mặc định.
- **#4+#5 Chọn livestream:** sub-bar "🎥 Tất cả livestream ▾" → bottom-sheet picker (nhóm **🔴 Đang live** / **Đã live**, từ `/posts` + `living` của `/page-posts`, recency 12'). Chọn bài → fetch `?postIds=<id>&limit=1000`, lọc đúng post + LIVE tag header. Smoke: chọn bài House → 114 comment đúng page.

**Files:** `live-chat/comments-mobile.html` (CSS post-selector/toggle/picker/status-variants + markup), `live-chat/js/live/comments-mobile.js` (rewrite controller), `render.com/services/web2-livestream-poller.js`. Bump `?v=20260614cm2`.

**Fix bug khi smoke:** `statusOf` cũ `(w && String(w.status||'')).toLowerCase()` → khi `w` null (KH không có trong kho) ném TypeError → `cardHtml` throw → list kẹt skeleton (count vẫn set). Sửa `String((w&&w.status)||'').toLowerCase()`. **Status:** ✅ verify 5/5 qua browser session (eval state, không screenshot mù).

### [live-chat] Trang MỚI: viewer comment livestream tối ưu MOBILE (chỉ-xem) ✅

**User:** trang riêng coi comment livestream trên ĐIỆN THOẠI — chỉ XEM (không tạo đơn/chat). Quan trọng: comment, tên/SĐT/địa chỉ/avatar/trạng thái/thumbnail KH; tap KH → chi tiết hơn. Research GitHub/Google làm hoàn thiện.

**Đã làm (2 file mới, standalone — KHÔNG kéo deps order/chat nặng):**

- **`live-chat/comments-mobile.html`** — mobile-first, light Zalo-blue, safe-area: sticky header (💬 Comment Live + 🔴LIVE + count + refresh) + filter chips (Tất cả/Store/House/Đã tạo đơn/Có SĐT) + card list + bottom-sheet detail + lightbox + toast + new-comments pill. Inline CSS (pattern iOS Messages/Telegram + Material bottom-sheet + pull-to-refresh, anti-lag).
- **`live-chat/js/live/comments-mobile.js`** — controller chỉ-xem:
    - Fetch `GET {worker}/api/web2-live-comments/?limit=200` (open, credentials:omit) → card (avatar màu/initials, tên, badge Store/House, giờ **GMT+7**, status has_order, comment, chip SĐT tel:/địa chỉ, thumbnail).
    - **Thumbnail batch** `GET /api/livestream/snapshots/by-comment-ids` → ảnh frame live (tap → lightbox).
    - **Tap card → bottom-sheet** chi tiết: avatar lớn, comment quote, SĐT/địa chỉ/trạng thái/trang/FB ID/thời gian + nút Gọi (tel:) + Mở Facebook.
    - **Realtime SSE** `web2:live-comments` (web2-sse-bridge) debounce re-fetch + pill "comment mới" khi đang cuộn; pull-to-refresh; refetch khi visible; poll nhẹ 60s.
    - Filter client (page/order/phone). KHÔNG mutation.

**Verify smoke:** API trả data thật (200+ comment), render card đủ (tên/comment/SĐT/avatar/badge/status/giờ GMT+7), bottom-sheet chi tiết mở đúng (FB ID, thời gian +7, Gọi/FB). JS parse OK. URL: `/live-chat/comments-mobile.html`. **Status:** ✅ Done (test thực tế trên điện thoại).

### [live-chat] Kho SP: grid-card → LIST hàng ngang + thumbnail nhỏ + hover phóng to ✅

**User:** "danh sách sản phẩm cho thành list với hình nhỏ, hover vào phóng to ảnh."

**Đã làm (inventory-panel — chat.html + index.html):**

- **CSS** (`inventory-panel.css`): **bỏ 2 khối `@container` BENTO** (grid nhiều cột + card dọc ảnh 3:4) → Kho SP LUÔN là **list 1 cột hàng ngang** ở mọi bề rộng. Thumbnail `.inv-img` 64→**56px**. Nút `+` (`.inv-card-add`) từ absolute-overlay-ảnh → **static flex child, sang phải row** (self-center).
- **JS** (`inventory-panel.js`): chuyển `<button.inv-card-add>` RA NGOÀI `.inv-card-imgwrap`, đặt sau `.inv-card-body` → thành cột phải của row.
- **Hover phóng to = SHARED hover-zoom**: load `web2/shared/web2-effects.js` (trước đó live-chat chỉ có .css) → auto-zoom mọi `<img>` trong `.web2-shell` qua `.w2fx-zoom-popup`. `.inv-img` set `pointer-events:auto` (vượt `.inv-card * {pointer-events:none}`) + `cursor:zoom-in` + hover `scale(1.04)` → hover thumbnail hiện preview lớn cạnh con trỏ (cơ chế dùng chung native-orders).

**Verify:** smoke Kho SP — list hàng ngang (thumb 56px trái + mã/tên/giá + SL badge + nút + phải), braces 117/117 OK, parse OK, web2-effects.js loaded. Zoom hoạt động với SP có ảnh thật (test data dùng placeholder 📦). `?v=20260614inv1`. **Status:** ✅ Done.

### [delivery-report] Báo cáo: thêm 2 cột SL GK / COD GK (gửi kèm theo kênh) ✅

**User:** trong Báo cáo muốn thêm 2 cột **SL GK** và **COD GK** bên phải cột **THU VỀ**; giá trị gửi kèm lấy từ bảng Gửi Kèm lưu trong ngày hôm đó, **phân phối theo đúng kênh** (TOMATO/NAP/Thành phố).

**Cách làm:**

- `send-along.js`: thêm `getDailySummaries(dates[])` → `{ [date]: { [channelLower]: {count, valueDong, collectDong} } }`. Đọc Firestore source-of-truth, fallback localStorage cache; quy giá trị NGHÌN → ĐỒNG (`toDong`, cùng quy ước `sendAlongThousand` ở handover image). Cache TTL 15s + bust khi `save()`. Tiêu chí đếm đơn khớp `getOrdersForChannel` (bỏ đơn rỗng hoàn toàn).
- `report.js`: map `SEND_ALONG_CHANNEL = { tomato:'TOMATO', nap:'NAP', city:'Thành phố' }`. Nạp `state.sendAlongByDate` qua `loadSendAlongRange()` trong Promise.all của `render()` (extended range gồm shift sources) → repaint. Helper `sendAlongFor(date,tab)` / `sendAlongSum(dates,tab)` + `gkCellsHtml()`. Chèn 2 cột (read-only) sau THU VỀ ở **cả 4 row builder** (single/child, merge, shift-aggregate, shifted-out), header, footer total, và `currentColCount` 12/11 → **14/13**. Gửi kèm thuần INFORMATIONAL — KHÔNG cộng vào TỔNG TẤT CẢ / TỔNG CÒN LẠI (giữ nguyên số đã duyệt).

**Verify (Playwright, seed localStorage):** TOMATO → SL GK=2 / COD=$50.000; Thành phố (city, 13 cột, không CK TRƯỚC) → 1 / $50.000; NAP → 1 / $0. Header + body + footer đều 14 cột (13 ở city), không lệch cột. Footer tổng khớp. 0 lỗi JS từ code mới.

**Files:** [delivery-report/js/report.js](../delivery-report/js/report.js), [delivery-report/js/send-along.js](../delivery-report/js/send-along.js), [delivery-report/index.html](../delivery-report/index.html) (bump `?v=20260614f`).

**Status:** ✅ Done.

### [delivery-report] Báo cáo: Gửi Kèm tác động TỔNG TẤT CẢ (− phí ship/đơn + COD GK) ✅

**User:** "cột SL GK: mỗi SL trừ tiền ship theo phí ship của kênh đó vào TỔNG TẤT CẢ" + (hỏi chốt) cộng luôn COD GK vào tổng.

**Công thức mới:** `TỔNG TẤT CẢ = TIỀN − PHÍ SHIP − SL ĐƠN SHIP×phí − (SL GK × phí ship kênh) + COD GK + THU VỀ`. Net Gửi Kèm `gkNet = COD GK − SL GK×getShipFee(tab)` (phí ship dùng đúng setting per-kênh: TOMATO/NAP 23k, Thành phố 20k — chỉnh ở popover ⚙). Helper `sendAlongNet(count, collectDong, tab)`. Fold gkNet vào **cả 6 chỗ** tính `totalAll`: 3 row builder (single/merge/aggregate) + 3 nhánh `computeTotalLeftForTab` (chip tổng còn lại per-tab đầu bảng) → totals footer + TỔNG CÒN LẠI + chip tab tự khớp. Cột SL GK/COD GK vẫn hiển thị raw; chỉ TỔNG TẤT CẢ đổi math. Tooltip header cập nhật công thức.

**Verify (Playwright):** TOMATO gkNet=+4.000 (50k−2×23k)→TỔNG 2.850.000; Thành phố +30.000 (50k−1×20k)→9.165.000; NAP −23.000 (0−1×23k)→9.215.000. `tong === expected` cả 3 tab; chip tab khớp; 0 lỗi parse khi load. `?v=20260614g`.

**Status:** ✅ Done.

## 2026-06-13

### [live-chat] Rebuild CSS trên shared native-orders — Phase A: xóa dead + fix token + blueprint (đợt 12) 🔄

**User:** "Xóa và làm lại toàn bộ CSS live-chat" (trên nền shared native-orders).

**Workflow phân tích 5-agent** → blueprint [`docs/web2/LIVECHAT-CSS-REBUILD.md`](web2/LIVECHAT-CSS-REBUILD.md). Kết quả: 8054 dòng CSS, chat pane = SHARED Web2ChatPanel `.w2cp-*` (OFF-LIMITS), 103/167 `.pk-` chết, 2 file orphan zero-ref.

**Phase A (an toàn, verified — ĐÃ làm):**

- **Xóa 2 file dead 100% (zero ref, không link đâu):** `live-chat.css` (1754) + `modern.css` (644) = **2398 dòng dead** gỡ sạch.
- **Fix latent bug:** index.html dùng `--pkr` (qua pancake-chat.css) nhưng KHÔNG load `pancake-redesign-tokens.css` → undefined. Đã thêm link.
- Verify smoke: chat.html (list + mode-switch) + index.html (live comments + video + Kho SP) render đủ, 0 vỡ.

**Phase B (ĐÃ làm, verified):**

- **Xóa `chat-motion.css` (200) + `pancake/pancake-chat-window.css` (480)** = 680 dòng — verified dead: `pk-anim` không JS nào add; `.pk-chat-window` mount-container do pancake-chat.css lo (không phải file này); chat-window cũ `.pk-message*`/`.pk-input-wrapper` đã thay bằng Web2ChatPanel. Gỡ link cả 2 trang.
- **Trim `pancake-chat.css`: xóa dòng 677–1275** (598 dòng) = block CHAT WINDOW inner + QUICK REPLY + CHAT INPUT (composer cũ) — tất cả `0 JS ref`, Web2ChatPanel `.w2cp-*` thay thế. **GIỮ** `.pk-chat-window` base (mount shell) + SEARCH STATES/LOAD MORE/CONTEXT MENU/MODAL/PAGE-SELECTOR/filter (verified must-keep class đều ngoài vùng xóa). braces 288/288 OK.
- **Verify smoke (mở hội thoại clone):** chat pane Web2ChatPanel render HOÀN HẢO trong `.pk-chat-window` (header/bubble xanh/quick-chips/composer/send) + list + Kho SP đủ, 0 vỡ.

**Phase C (dọn vụn — ĐÃ làm):** xóa nốt **72 dòng leftover dead** trong pancake-chat.css (IMAGE PREVIEW/`.pk-attach-*`/`.pk-preview-remove` 860–923 + `.pk-message`/`.pk-quick-reply-btn` trong media-query — tất cả `0 JS ref`). Final smoke (mở hội thoại): chat pane + list + Kho SP render đủ.

**⚠ KHÔNG xóa `layout.css`/`components.css`/`variables.css`** (blueprint đề xuất nhưng VERIFY thấy còn dùng): `column-manager.js` + `settings-manager.js` VẪN load → layout (resize/settings/placeholder) sống; `variables.css` = 47 `--token` cung cấp cho layout/components → xóa sẽ vỡ. → GIỮ.

**Kết quả cuối:** live-chat CSS **8054 → 4944 dòng (−3110, −39%)**. Xóa 4 file (live-chat.css, modern.css, chat-motion.css, pancake-chat-window.css) + trim 670 dòng dead trong pancake-chat.css. Chat pane Web2ChatPanel + list + Kho SP + composer verified render đủ qua nhiều lần smoke. live-chat dùng đúng nền shared native-orders (#0068ff + overlay + effects + motion). **Status:** ✅ Done — rebuild hoàn tất, chỉ còn dead code có ích đã sạch.

**Status:** ✅ Phase A+B Done — xóa 3038 dòng dead, chat verified. Dọn vụn còn lại staged trong blueprint.

### [web2] [shared] Dọn cross-folder dep — chuyển native-orders CSS vào shared (đợt 11) ✅

**User:** "Dọn cross-folder dep" (21 trang link chéo `../../native-orders/css/*`).

**Đã làm:** `git mv` native-orders CSS → `web2/shared/` (single source):

- `native-orders/css/native-orders.css` → **`web2/shared/web2-base.css`** (baseline: tokens `:root` `--web2-*`, layout, tab, filter, data-table, button).
- `native-orders/css/web2-theme.css` → **`web2/shared/web2-components.css`** (`.web2-*` Bootstrap-clone: label/btn/cell/count-pill).
- Repoint 31 file (kể cả native-orders + so-order + dist bundle): `../../native-orders/css/X` → `../shared/X`, `../native-orders/css/X` → `../web2/shared/X`. **0 ref cross-folder còn lại.**
- Không url() asset tương đối → move an toàn, computed style y hệt.

**Verify:** native-orders render Y HỆT sau move (master không đổi). **Status:** ✅ Done. Shared design giờ gồm: web2-sidebar + web2-base + web2-components + web2-theme(overlay) + web2-effects + web2-motion.

### [web2] [shared] native-orders = giao diện chủ đạo → phủ shared `web2-theme.css` cho 100% trang web2 (đợt 10) ✅

**User:** "lấy native-orders làm giao diện chủ đạo → tạo css web2 shared từ native-orders → tất cả web2 dùng css này."

**Khảo sát:** shared design-system ĐÃ TỒN TẠI = `web2/shared/web2-theme.css` (header file ghi rõ "Chuẩn UI cho TOÀN BỘ Web 2.0, lấy native-orders/css làm baseline"; self-contained: tokens `--web2-*` #0068ff + clone `.web2-btn`/`.data-table`/`.web2-label`/page-head + overlay normalize `.btn`/`.modal`/`.tab`/`.badge`/`.pagination`, scoped `.web2-theme`/`.web2-shell`, anti-lag). **29/38 trang đã load** (gồm cả live-chat).

**Đã làm:** thêm `<link ... web2/shared/web2-theme.css>` (load cuối `</head>`) cho **8 trang còn thiếu**: customer-wallet, fastsaleorder-delivery, fastsaleorder-refund, login, pancake-settings, payment-confirm, report-delivery, report-revenue. **GIỮ native-orders/index.html NGUYÊN** (là nguồn — không nạp overlay derived từ chính nó để khỏi bị token `--web2-bg-app` đè lệch). → **38/38 trang web2 dùng shared design (native-orders source) trừ chính native-orders là nguồn.**

**Verify (screenshot):** report-revenue + payment-confirm (2 trang mới adopt) render đẹp + nhất quán native-orders (card accent màu, KPI, tab underline, data-table, stat cards), 0 vỡ. `?v=20260613ns1`. **Status:** ✅ Done.

### [web2] [shared] Hướng native-orders + shared FX (glass/soft) + animation engine = MOTION (đợt 9) ✅

**User:** revert Chatwoot (xấu) → "lấy native-orders làm giao diện chủ đạo; shared css web2 = native-orders làm chính + 4 phong cách (faux-glass/soft-UI/glow/animate.css) anti-lag light" → animation thử **barba.js** rồi đổi **Motion** (motion.dev / github motiondivision/motion).

**Phát hiện:** native-orders primary = `#0068ff` (Zalo blue) = **GIỐNG** token live-chat `--pkr`. Khác biệt chỉ font/nền/component-feel. `web2/shared/web2-effects.css` (shared FX) ĐÃ có fade/slide/pop/pulse/spin/flash/shimmer/hover-lift/scale/glow/press/underline/stagger + page-head-mini.

**Đã làm:**

- **Revert đợt 8** Chatwoot skin về đợt 7 (commit `2d8ddc80e`).
- **Mở rộng `web2/shared/web2-effects.css`** (bổ sung 2 phong cách thiếu, GIỮ): `.w2fx-glass` (faux-glass KHÔNG backdrop-filter → an toàn scroll) + `.w2fx-glass-blur` (opt-in modal); `.w2fx-card` / `.w2fx-card-i` (soft-UI card light, hover-lift transform). Đọc `--web2-*` (palette native-orders). reduced-motion reset.
- **Barba thử rồi GỠ**: từng làm `web2-page-transition.js` (curtain wipe no-PJAX) — user đổi ý → **đã xoá controller + CSS `.w2fx-curtain`/`.w2fx-page-enter`**.
- **Animation engine = MOTION** — `web2/shared/web2-motion.js` (MỚI, ESM `type="module"`): `import { animate, inView, stagger } from cdn.jsdelivr.net/npm/motion@11/+esm` (WAAPI, 120fps GPU). API tái dùng `window.Web2Motion`: `animate/inView/stagger/staggerIn/reveal/pop/enabled`. AUTO enter-on-load: stagger reveal block tĩnh (`.top-bar`/`.page-head-mini`/`.tab-navigation`/`.w2fx-card`/`[data-w2-motion]`). **Fail-safe**: CDN fail hoặc reduced-motion → KHÔNG đụng opacity (phần tử hiện bình thường); `reveal/staggerIn` guard `enabled` trước khi set opacity:0. KHÔNG đụng điều hướng → an toàn app nặng.
- **Wire:** `live-chat/chat.html` + `live-chat/index.html` (web2-effects.css + `<script type=module web2-motion.js>`) + `native-orders/index.html` (web2-motion.js — đã có effects.css). `?v=...mo1`.

**Verify desktop:** badge `Web2Motion enabled=true animate=function` — Motion CDN load OK, page render bình thường, auto entrance chạy + settled, 0 vỡ. braces OK, sạch barba. **Status:** ✅ Done. Tái dùng trang khác: `<script type="module" src="../shared/web2-motion.js">` + dùng `Web2Motion.reveal('.selector')` / class `.w2fx-*`.

### [live-chat] Redesign đợt 7 — conversation row kiểu Telegram/Intercom: FIX tên cắt "..." + layout hiện đại ✅

**User:** "giao diện tổng thể không ổn, tên dài bị '...' → tìm github phần CSS/giao diện trending để làm giống, hiện đại, hiệu ứng tương lai."

**Research:** chat list trending (Telegram / Intercom / Chatwoot) — pattern chung: avatar + chỉ báo kênh = **badge overlay góc avatar** (không cột phải), tên **chiếm trọn dòng**, unread = **pill** bên phải preview.

**Nguồn lỗi "..." (đọc kỹ markup):** row cũ = `[avatar][content][cột actions phải]`; dòng tên lại chứa cả `name + badge "Store" + time` → tên bị bóp 2 phía → cắt sớm.

**Tái cấu trúc (JS `pancake-conversation-list.js` + CSS `pancake-chat.css`):**

- **Bỏ hẳn cột `.pk-conversation-actions` phải** (thủ phạm). Chỉ báo kênh (inbox/comment) + SĐT → **`.pk-ch-badge` overlay góc avatar** (kênh góc phải-dưới, phone góc trái-dưới, viền trắng 2px + shadow — kiểu Messenger/Zalo).
- **Dòng 1** = `name` (flex:1, min-width:0, ellipsis, letter-spacing -.01em) + `time` (shrink:0). Tên **chiếm trọn chiều ngang** → hết cắt sớm. Unread → time đổi xanh đậm.
- **Dòng 2** `.pk-conversation-sub` = `[page chip Store/House]` + `preview` (flex:1 ellipsis) + **`.pk-unread-pill`** (gradient xanh + glow, kiểu Telegram).
- **Dòng meta** (page/tags/debt) → chỉ render khi CÓ tags/debt (`hasMeta`) → đa số row gọn 2 dòng.
- **Hiệu ứng "tương lai":** active row = **gradient ngang + inset ring glow** + thanh accent trái **gradient + box-shadow glow**; unread pill gradient + glow; avatar ring 1px.
- **XÓA CSS chết** (`đọc→xóa→viết lại`): `.pk-conversation-actions`, `.pk-action-icons`, `.pk-icon-indicator` (đợt 6, giờ không render nữa), `.pk-action-btn*` legacy. Thêm `.pk-conversation-meta` + `.pk-debt-badge` (trước inline). `updateConversationInDOM` đổi `.pk-unread-badge`(avatar)→`.pk-unread-pill`(sub).
- **Polish:** search header thêm hairline bottom (tách lớp, không blur — anti-lag).

**Verify (screenshot desktop):** tên hiển thị ĐẦY ĐỦ (Hương Nhiên, Phương Quáchh, Dung Nguyễn…) hết cắt; badge kênh/phone overlay avatar đúng; unread pill gradient+glow; page chip Store/House; debt "-99" xuống dòng meta. braces OK, conv-list.js parse OK, 0 dead selector. Bump `?v=20260613re`. **Status:** ✅ Done (verified desktop).

### [live-chat] [shared] Redesign đợt 6 — nút bớt "thô": tactile press + soft-depth + icon đậm + dọn teal ✅

**User:** "các nút ở hình quá thô → research github/ai ui/animation/google các loại button, font, hiệu ứng thịnh hành nhất → đọc CHI TIẾT từng dòng CSS hiện tại TRƯỚC → xóa đi & thêm lại bằng CSS mới (không bị css cũ đè)."

**Phương pháp (đúng yêu cầu):** đọc từng rule + truy nguồn render thật (chat window = `Web2ChatPanel` `.w2cp-*`, list = `.pk-*`, mode-switcher = `.pk-mode-switch`) + xác nhận KHÔNG có rule chéo đè selector mục tiêu → **thay khối tại chỗ** (in-place Edit, không append).

**Trending áp dụng (2026):** rounded/**squircle**, **tactile press** `:active scale`, **soft depth** (shadow tĩnh ≤24px — anti-lag), icon **stroke đậm** 2–2.2, hover **lift** `translateY(-1px)`, transition cụ thể (không `all`).

- **Icon kênh list** `.pk-icon-indicator` (pancake-chat.css): 24px vòng tròn phẳng outline mảnh lệch tông → **22px squircle** (radius 7px) + inset ring + icon 13px stroke 2.2 + hover spring; palette hài hòa token: phone=success-50/600, inbox=**blue-50/600** (thay #2563eb), comment=warning-50/600, no-phone=gray.
- **Composer** `.w2cp-input-btn` (SHARED web2-chat-panel.css): thêm `:active scale(.88)` + icon 21px stroke 2.
- **Nút gửi** `.w2cp-send-btn` (SHARED): nền **gradient** blue-400→primary + **soft glow tĩnh** `0 4px 12px rgba(0,104,255,.32)` + hover lift, giữ spring `:active scale(.9)`, icon 20px.
- **Tag chip** `.w2cp-quick-btn` (SHARED): padding 3→5px, +shadow nhẹ, hover lift + `:active scale(.94)`.
- **Mode-switcher** `.pk-mode-switch` (inventory-panel.css) + `pancake-mode-switcher.js`: nút flex + `:active scale(.96)` + icon 16px; **đổi emoji 💬/📦 → lucide** `messages-square`/`package` (sạch, có thiết kế) + `lucide.createIcons()` sau wrap.
- **Header tools** `.w2cp-tool` (↻ refresh / ⌄ chevron — SHARED): viền xám phẳng → hover **tint Zalo blue** (bg blue-50 + viền blue-200 + chữ primary) + `:active scale(.9)` + icon 17px stroke 2 + radius 9px. **`.w2cp-loc-badge`** harmonize #2563eb → blue-600 (đồng tông). (batch 2 — sau khi mở hội thoại review)
- **Dọn teal leftover** (#00a884 / rgba(0,168,132)) còn sót: ring `.pk-chat-input-wrapper`, `.pk-page-selector-btn.active`, keyframe `pkConvUpdated` → tất cả về `--pkr-ring-primary` / rgba(0,104,255). Sweep: 0 giá trị teal còn lại (chỉ còn comment).
- SHARED edits dùng `var(--pkr-X, fallback)` → native-orders/balance-history hưởng cùng (đồng bộ), không vỡ.

**Verify localhost (screenshot):** icon kênh squircle hài hòa xanh/lá/cam, mode-switcher icon lucide (hết emoji), list render đủ, 0 JS error, layout nguyên. Bump `?v=20260613rc` (pancake-chat.css, web2-chat-panel.css, inventory-panel.css, mode-switcher.js). **Status:** ✅ Done (verified desktop). ⏳ Composer/send button cần mở 1 chat trên thiết bị để soi cận.

### [live-chat] Redesign TOÀN BỘ giao diện Chat Pancake + Kho SP — "Zalo Bento Commerce" (5 đợt) ✅

**User:** "xóa toàn bộ giao diện chat pancake, kho sp hiện tại làm lại hiện đại hơn → research github/ai ui/animation/google, tối ưu điện thoại, hiệu ứng đẹp dễ dùng" → chốt **Phương án C "Zalo Bento Commerce"** (workflow research 6-agent + 3 phương án previews) → "kiểm lại --pk-\* và xóa đi".

**Scope:** CHỈ lớp VISUAL, GIỮ data/logic vừa rebuild (Web2Chat/SSE/send/scroll). Blueprint: [docs/web2/CHAT-REDESIGN-BLUEPRINT.md](web2/CHAT-REDESIGN-BLUEPRINT.md).

- **Đợt 0:** tokens `pancake-redesign-tokens.css` (namespace `--pkr-*` xanh Zalo #0068ff) + `chat-motion.css` (keyframes compositor-friendly + reduced-motion) + `pancake-mobile-shell.js` (visualViewport `--pkr-app-h/--pkr-kb` + single-pane swap + swipe-back). **XÓA SẠCH legacy `--pk-*`** (theme xanh-lá WhatsApp #00a884): rename 150 `var(--pk-…)`→`var(--pkr-…)` ở pancake-chat.css, xóa :root cũ ở pancake-chat.css + variables.css, thêm LEGACY COMPAT alias. Verify 0 `--pk-*` còn lại, `--pkr-primary=#0068ff`.
- **Đợt 1:** conversation list Soft Depth — rows bo góc + accent bar trái khi active, filter chips pill scroll-x sticky, search pill bo tròn focus-ring, avatar 48px, unread badge xanh Zalo, class `is-unread`.
- **Đợt 2:** empty-state icon trong vòng tròn xanh mềm + token hoá.
- **Đợt 4 (điểm nhấn C):** Kho SP **BENTO** — `@container` query (container-type trên `.inv-panel`): grid ảnh 3:4 nhiều cột khi rộng / list khi hẹp; thẻ giá đậm xanh; **stock tiers màu** (>15 xanh / ≤15 amber / ≤5 + hết đỏ); OOS grayscale; nút **+ tap-to-add** chèn SP vào composer (mobile-friendly, drag native giữ nguyên). ⚠ Fix bug `@container` query trên chính element có container-type (1 card khổng lồ 1064px) → chuyển container-type lên cha.
- **Đợt 3 (SHARED):** `web2-chat-panel.css` bubble Zalo-blue (out=#0068ff/white, in=slate, tail bo) + daysep pill sticky + composer pill sunken + touch 44px + input 16px (chống zoom iOS). Dùng `var(--pkr-X, fallback)` → native-orders/balance-history KHÔNG vỡ (verify load OK). Bubble out verify `rgb(0,104,255)`.
- **Đợt 5:** mode-switcher **segmented control** (track sunken, active = pill trắng chữ xanh) + mobile single-pane CSS (≤767px list↔chat full-screen trượt + nút back nổi + composer safe-area) + wire `showChat()` vào selectConversation.

**Verify localhost:** conversation list + Kho SP bento (4 cột, stock badge màu) + chat bubble xanh + segmented pill — tất cả render đẹp, 0 JS error, realtime/data nguyên. Commits `c4ed81498`→. ⏳ Mobile single-pane (320px) + tap-to-add cần test thiết bị thật. **Status:** ✅ Done (5 đợt, verified desktop localhost).

### [web2] [shared] Zalo chat → ĐƯA ENGINE VÀO SHARED, trang khác tham chiếu là dùng (mountChat) ✅ live-verified

**User:** "Zalo này các phần quan trọng, chức năng → bỏ vào shared web 2.0 để sau này các phần cần dùng thì tham chiếu tới là dùng được → dễ quản lý, bảo trì."

**Tái cấu trúc (1 nguồn, hết trùng lặp):**

- **Di dời engine** vào `web2/shared/`: `web2-zalo-api.js` (ZaloApi client) + `zalo-chat/*` (9 module WZChat + 3 CSS + mới `chat-view.js`). Trước nằm trong `web2/zalo/js/` → giờ shared, mọi trang tham chiếu được.
- **Controller chung `WZChat.mountConversation(container, conv, opts)`** (`shared/zalo-chat/chat-view.js`): dựng 1 hội thoại đầy đủ (header + tin + composer + realtime + tools/lightbox/load-older + optimistic send) vào BẤT KỲ container. Là NGUỒN DUY NHẤT logic khung chat.
- **Refactor `web2/zalo/js/web2-zalo-app.js`** dùng controller chung → **xoá ~410 dòng trùng** (1290→877 dòng): openConversation chỉ còn delegate `WZChat.mountConversation`; bỏ renderChat/renderBody/send\*/bubbleKind/\_doReact/\_loadOlder… (đã ở shared).
- **`Web2Zalo.mountChat(container, {phone|convId|conv})`** + **`loadChatEngine()`** (`shared/web2-zalo.js`): trang khác chỉ cần `<script src="../shared/web2-zalo.js">` rồi gọi `Web2Zalo.mountChat(el,{convId})` → tự nạp động engine (CSS+11 JS, suy `SHARED_BASE` từ `document.currentScript.src`) + resolve hội thoại + render. KHÔNG cần include thủ công.

**Fix khi refactor:** `c.id` là BIGINT→string (pg) còn click truyền Number → `find`/`is-active` so sánh String (không thì hội thoại không mở).

**Verify live (Playwright):** (1) trang web2/zalo qua controller chung: "Nhi Judy Store" nhóm 12 bubble, 3 tên thật ("Nhi Judy Store"/"Mai Thanh"/"Nhijudy Ơi"), composer OK, 0 lỗi. (2) `Web2Zalo.mountChat({convId:3})` trên trang **native-orders** (không có engine sẵn) → engine tự nạp (`hadEngineBefore:false→engineLoadedNow:true`), render đủ chat widget nổi, 0 lỗi.

**Cách dùng cho trang khác:**

```html
<script src="../shared/web2-zalo.js?v=20260613L"></script>
<div id="zaloChat" style="height:480px"></div>
<script>
    Web2Zalo.mountChat('#zaloChat', { convId: 3 }); // hoặc { phone:'09...' } / { conv }
</script>
```

**Files:** di dời `web2/shared/web2-zalo-api.js` + `web2/shared/zalo-chat/{chat-store,lightbox,emoji-picker,sticker-picker,reactions,bubbles,composer,realtime,chat-actions,chat-view}.js` + `chat-{bubbles,composer,lightbox}.css`; sửa `web2/shared/web2-zalo.js` (+mountChat/loadChatEngine), `web2/zalo/js/web2-zalo-app.js` (delegate), `web2/zalo/index.html` (repath `?v=20260613L`).

**Status:** ✅ live-verified localhost (page + embed). Push → GH Pages ~2-4 phút.

### [live-chat] Rebuild panel Chat Pancake trên NGUỒN CHUNG Web2Chat + realtime SSE (single source) ✅ (verified localhost)

**User:** "xóa panel chat pancake này và làm lại đúng phần này — các phần kia tham chiếu tới 1 nguồn pancake" → "nếu shared web 2.0 đã đủ chức năng thì xóa stack riêng (PancakeAPI/State/Realtime) và build lại dùng shared" → "dùng riêng là đụng rule web 2.0 — ưu tiên 1 nguồn chung để quản lý/bảo trì". Bug gốc: tin nhắn render **bong bóng rỗng** (chỉ timestamp, không nội dung).

**Nguyên nhân bubble rỗng:** `PancakeChatWindow` adapter gọi `PancakeAPI.fetchMessages`/nhánh `serverMode==='n2store'` (Graph wrapper trả shape khác `message`) thay vì nguồn chung `Web2Chat`. Panel chỉ đọc `m.message||m.text||m.content` → rỗng.

**Đã rebuild (4 phase, single source):**

- **Phase 1 — DATA:** `pancake-chat-window.js` adapter `loadMessages`/`loadOlder`/`_performSend` → gọi thẳng `Web2Chat.fetchMessages/sendMessage/uploadMedia` (extension-first vẫn giữ). Bỏ nhánh `n2store`.
- **Phase 3 — Realtime:** thay TOÀN BỘ `pancake-realtime.js` (WebSocket Phoenix client) → subscribe `Web2SSE.subscribe('web2:messages')`. Relay server (`live-chat/server`) đã đẩy Pancake WS → SSE sẵn. Tickle `{action,pageId,convId,ts}` → debounce refetch active (Web2Chat) + refresh list.
- **Phase 4 — Token:** `PancakeAPI.getToken`→`Web2Chat.getJwt`, `getPageAccessToken`→`Web2Chat.getPageAccessToken`+generate. 1 nguồn token. (Fix luôn lỗi token 9-char stale trong browser test.)
- **Phase 2 — Conversations/search:** `searchConversations`→loop `Web2Chat.searchConversations` per-page + dedupe. **Xóa dead methods** `fetchMessages`/`sendMessage`/`uploadMedia`/`sendPrivateReply` + tất cả `*N2Store` + `_doSearch`/`messagesCache`/`clearMessagesCache`. `fetchConversations`/`fetchMoreConversations` giữ (multi-page inbox-specific, không trùng Web2Chat) nhưng dùng token chung.

**Fix scroll-to-bottom tận gốc (panel CHUNG `web2-chat-panel.js`):** bug cũ — ảnh/avatar load SAU `innerHTML` → `scrollHeight` tăng dần → 1 rAF không đủ + scroll event flip `isAtBottom=false` → kẹt giữa chừng (cả khi mở conv lẫn sau gửi tin). Fix: `scrollToBottom()` re-scroll trên mỗi `img.onload/onerror` + 2 nhịp trễ (150/550ms) + cờ `st._forceBottom` để scroll-listener bỏ qua transient "chưa tới đáy" trong lúc ép xuống. Lợi cho CẢ native-orders/balance-history (panel chung).

**Verify localhost LIVE với clone (Huỳnh Thành Đạt 0908123456, user xác nhận account clone):** 3 pages + 52 hội thoại, search ra kết quả, mở conv → 25 messages render **CÓ nội dung** (hết bubble rỗng), **scroll xuống đáy đúng + giữ đáy sau khi ảnh load** (`scrollAtBottomAfterImages:true`). **Gửi tin test thật qua UI (gõ+Enter)**: extension gửi → relay → SSE `web2:messages` → refetch Web2Chat → lọc `ext_` placeholder → tin thật `m_...` (KHÔNG duplicate, `dupOfLast:1`), composer clear, timestamp **19:59 = đúng GMT+7**, snippet hội thoại trong list cập nhật. `PancakeRealtime.isConnected=true` subscribed `web2:messages`, `PancakeAPI.fetchMessages=undefined` (single-source confirmed), 0 JS error. **Files:** `pancake-chat-window.js`, `pancake-realtime.js` (rewrite), `pancake-api.js`, `pancake-init.js`, `web2/shared/chat-panel/web2-chat-panel.js` (scroll robust), `chat.html` (cache-bust `?v=20260613rb`). **Status:** ✅ Done (verified LIVE localhost + clone).

### [shared] [nhanhang] [soquy] Gỡ hoàn toàn widget AI chat nổi khỏi toàn bộ trang ✅

**User:** "bỏ widget ai web 2.0 đi" → (kèm ảnh nút chat tím nổi góc phải trang live-chat) → "xóa AI widget khỏi navigation-modern.js luôn đi".

**Bối cảnh:** Widget AI chat nổi (`shared/js/ai-chat-widget.js` — FAB `.ai-chat-fab` "Trợ lý AI", chat Gemini/DeepSeek, admin-only) được `navigation-modern.js` tự inject trên MỌI trang load nav. Nó hiện cả trên `live-chat/` (Web 2.0 — load navigation-modern chỉ để có SePay banner). User muốn gỡ hẳn.

**Đã làm (gỡ sạch, không để dead code):**

- `shared/js/navigation-modern.js`: xóa nguyên IIFE `loadAIChatWidget()` (chỉ còn 1 comment breadcrumb "đã gỡ 2026-06-13").
- **Xóa file** `shared/js/ai-chat-widget.js` (−1231 dòng, orphaned — chỉ navigation-modern load nó).
- `nhanhang/index.html` + `nhanhang/js/main.js`: gỡ nút FAB `#fabOpenAI` "Trợ lý AI" + handler `AIChatWidget.toggle()`.
- `soquy/index.html` + `soquy/js/soquy-main.js`: gỡ nút FAB `#fabOpenAI` + handler tương tự.
- `nhanhang/css/modern-styles.css` + `soquy/css/soquy.css`: gỡ rule `.fab-icon-ai` + `.ai-chat-fab` (orphaned).

**Verify:** grep toàn repo (excl dist/node_modules) → 0 reference active (`AIChatWidget|ai-chat-widget|fabOpenAI|fab-icon-ai|loadAIChatWidget`). `node --check` pass 3 file JS. CSS brace balance OK. navigation-modern vẫn load bình thường cho nav + SePay banner. **Status:** ✅ Done.

### [live-chat] Force-extract: đúng video theo chiến dịch + thông báo khi video bị xóa ✅ (verified)

**User:** "force extract phải lấy đúng video livestream được chọn theo chiến dịch, nếu video bị xóa thì thông báo".

**Đúng video theo chiến dịch:** đã có sẵn — `_resolveCampaignForComment(c)` map mỗi comment → video CỦA NÓ (Path 1.5: match theo `_postId`/`Facebook_LiveId`, fix "2 live cùng page chọn sai video"). Group `byVideo` theo `camp.Facebook_LiveId`, seek qua `_buildFbLiveUrl(camp)`. KHÔNG đổi.

**Thông báo video bị xóa (MỚI):** trước đây video không còn → `_fetchLiveVideoInfo` trả `null` → runner fail âm thầm. Giờ:

- `_fetchLiveVideoInfo`: video không có trong list FB-live của page (đã xóa/unpublish/hết hạn) → trả `{notFound:true}` (phân biệt với `null`=lỗi mạng).
- Helper `_forceExtractVideoBlocked(pageObj, videoInfo, camp, count)` toast lý do RÕ RÀNG, dùng ở CẢ 2 runner (parallel + serial): page thiếu / **🚫 video đã XÓA** / lỗi mạng-quyền / thiếu giờ bắt đầu — kèm tên chiến dịch + số comment bỏ qua.

**Verify (browser data thật + seed liveId giả):** toast `🚫 Video livestream "TEST VIDEO ĐÃ XÓA" đã bị XÓA / không còn trên Facebook — 1 comment không chụp được` ✓.

**Files:** [live-chat/js/live/live-livestream-snap.js](../live-chat/js/live/live-livestream-snap.js), [live-chat/index.html](../live-chat/index.html) (snap.js ?v=20260613e).

**Status:** ✅ Done (verified).

### [web2] [render] Zalo chat: tin NHÓM đúng cấu trúc — tên + avatar người gửi thật (hết UID) + bắt tin shop tự gửi ✅

**User:** "giao diện quá khó dùng → không thấy thanh ghi text, nút gửi" rồi "nghiên cứu kĩ github/api zalo/google… phần nhóm, tin nhắn… để đưa tin nhắn vào đúng cấu trúc, vị trí".

**2 đợt fix:**

**A. Composer ẩn (layout):** khung chat dùng `calc(100vh-210px)` sai → composer tràn dưới viewport + lớp phủ "Thả ảnh/tệp" (`[hidden]` bị `display:flex` đè) che ô soạn. Fix: panel chat **flex-column fill-viewport + box-sizing:border-box** (composer ghim đáy, body cuộn) + `.wz-drop-overlay[hidden]/.wz-reply-bar[hidden]/.wz-tray[hidden]{display:none!important}`. Verify: composer/input/send `visible=true`. Commits `fd2b40d2f`.

**B. Cấu trúc tin nhóm (nghiên cứu zca-js source + github):** group message hiện **UID thô** làm tên người gửi (`5923059383675268554`) vì:

- zca `dName` rỗng cho group → phải resolve qua **`getGroupMembersInfo(uids)`** → `{displayName, avatar}`.
- FE còn dùng sai field `m.senderName` (DB là `m.sender_name`).
- `selfListen=false` mặc định → tin shop tự gửi từ app điện thoại bị listener BỎ QUA → mọi tin đều `in` (sai vị trí trái/phải).

**Fix:**

- Service: `new Zalo({selfListen:true})` (bắt tin `isSelf` = `uidFrom=='0'` → `out`, dedup theo msg_id); thêm `getGroupMembersInfo(accountKey,uids)` + `getOwnUid`.
- Schema: bảng cache `web2_zalo_members(account_key,uid→display_name,avatar)`.
- Route messages: `_attachGroupSenders` — gom sender_uid của tin nhóm → cache `web2_zalo_members` → resolve uid thiếu qua zca → gắn `sender_name`+`sender_avatar` vào response; tin shop → tên TK + 'Bạn'.
- FE bubbles: hiện **avatar tròn (30px) bên trái + tên thật** cho tin nhóm đến (Zalo style, avatar ở tin cuối mỗi lượt), dùng đúng `m.sender_name`/`m.sender_avatar`.

**zca facts (verified source):** `isSelf = data.uidFrom=="0"`; listener `GroupMessage(ctx.uid,msg)` skip self khi `!selfListen`; `getGroupMembersInfo` → `{profiles:{uid:{displayName,zaloName,avatar,...}}}`; Options.selfListen default false (context.js). Ref: [RFS-ADRENO/zca-js](https://github.com/RFS-ADRENO/zca-js).

**Files:** `render.com/{db/web2-zalo-schema,services/web2-zalo-zca,routes/web2-zalo}.js`, `web2/zalo/js/chat/bubbles.js`, `web2/zalo/css/chat-bubbles.css` (`?v=20260613i`). Commits `fa8661c70`.

**Status:** ✅ Composer fix live-verified. ✅ Tin nhóm fix `fa8661c` LIVE — tên resolve thật ("Mai Thanh", "Nhijudy Ơi" + avatar, hết UID).

**C. Nhầm TÊN NHÓM vs NGƯỜI NHẮN CUỐI (user báo tiếp):** group "Nhi Judy Store" có member cũng tên "Nhi Judy Store" → lẫn lộn. Fix:

- `_persistIncoming` **ghi đè display_name nhóm bằng tên người gửi** (latent, selfListen kích hoạt) → nhóm KHÔNG đụng display_name (chỉ tên nhóm từ sync); user thread = tên người gửi.
- Thêm cột `last_msg_sender_uid` (in→uid, out→'me') + backfill; endpoint conversations LEFT JOIN `web2_zalo_members` + resolve 1-call `getGroupMembersInfo`; FE list nhóm hiện **"Tên: tin"** (out→"Bạn: tin"). Commit `d9bcc5030`, deploy verify.

### [live-chat] FIX force-extract fail 100% — XFBML seek player "xfbml.ready timeout" ✅ (verified live)

**Triệu chứng (browser test data thật, 1278 comment, campaign VOD thật):** Force extract = **`0 OK / 277 fail`**, xong ~48s. Warn: `[force-parallel] build player fail: xfbml.ready timeout`. Auto-snap live VẪN OK (191 thumbnail — vì dùng bare iframe + captureVisibleTab, KHÔNG dùng FB SDK).

**Chẩn đoán (browser, nhiều test):** dựng 1 XFBML player đơn → OK 2s; 3 concurrent (subscriber CỤC BỘ) → 3/3 OK; faithful repro pool (waiter-map riêng) → 3/3 OK. NHƯNG code thật dùng **1 subscriber CHUNG** trong `_ensureFbSdk` route qua Map `_xfbmlWaiters` → **không route đúng trong ngữ cảnh force-extract** → mọi build chờ hết 15s timeout → fail toàn bộ.

**Fix:** `_buildSeekPlayer` + `_ensureSeekPlayer` đăng ký **subscriber `FB.Event.subscribe('xfbml.ready')` CỤC BỘ per-build** (match `msg.id === divId`, unsubscribe khi xong) thay vì dựa subscriber chung + `_xfbmlWaiters`. Timeout 15s→25s (tải nặng). **Verify live: build hết timeout (`buildFailWarn:false`), progress leo thật `0/331 → 1✓...11✓`, thumbnail bắt đầu điền.**

**Fix kèm — quota captureVisibleTab:** 3 worker pool + auto-snap cùng gọi captureVisibleTab → vượt giới hạn Chrome ~2/giây (`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`). Throttle `_captureExtensionFrameThrottled` 480ms (~2.08/s) → **550ms (~1.8/s)** + route **auto-snap đi chung throttle** → mọi captureVisibleTab tần suất cao 1 hàng đợi, dưới ngưỡng.

**Còn lại (bản chất, không fix được):** `seek fail (buffering/DRM)` — vài offset VOD FB không seek được → comment đó skip (đúng thiết kế).

**Files:** [live-chat/js/live/live-livestream-snap.js](../live-chat/js/live/live-livestream-snap.js), [live-chat/index.html](../live-chat/index.html) (snap.js ?v=20260613d). MEMORY [[reference_fb_live_capture_options]].

**Status:** ✅ Done (fix chính verified live; throttle là cải tiến tính toán + auto-snap route — user re-test xác nhận giảm fail).

### [docs] Quy ước browser test Web 2.0: mở overview trước ✅

User: "browser test web 2.0 thì mặc định mở `web2/overview/index.html` trước rồi chuyển đến trang test". Ghi vào 3 nơi: CLAUDE.md (section Browser Test Scripts, mục mới "🧭 Browser test Web 2.0 → MỞ overview TRƯỚC"), MEMORY.md + memory file `feedback_web2_browser_test_overview_first.md`, dev-log này. Lý do: overview warm shared bootstrap (sidebar/auth/SSE bridge/theme/command palette/notification) → vào thẳng trang con dễ thiếu context, false-negative. KHÔNG áp dụng Web 1.0.

**Status:** ✅ Done.

### [web2] Polish UX: ẩn source-pill (tên bảng DB kỹ thuật) khỏi UI ✅

Audit consistency: 4 trang (products/variants/returns/native-orders) hiện raw `web2_products`/`web2_returns`/`source=NATIVE_WEB` ở header — vô nghĩa với user. Ẩn global `.source-pill{display:none!important}` ở `web2/shared/web2-theme.css` + `native-orders/css/web2-theme.css` (DB-badge "DB Render 2.0" riêng vẫn còn). Verify live products: source-pill ẩn, db-badge còn. customer-wallet "Hard reset" đã có confirm rõ ràng → không cần sửa.

### [live-chat] Encode JPEG off main-thread (OffscreenCanvas+Worker) + rVFC — hết giật khi chụp ✅

**User:** "ok" làm tiếp jank-killer từ research (OffscreenCanvas + Worker + requestVideoFrameCallback).

**Vì sao:** research 3-agent kết luận JPEG **encode** là phần nặng nhất của capture (drawImage rẻ); chạy trên main-thread → giật. Đây là path getDisplayMedia/Element Capture (cái user lo "popup lag").

**Fix (`live-livestream-snap.js`):**

- **Worker encode inline** (Blob URL, lazy + reuse): nhận `ImageBitmap` → `OffscreenCanvas.convertToBlob('image/jpeg')` → trả Blob. `_getEncodeWorker()` + `_encodeBitmapInWorker(bitmap,q)`.
- `_captureFrameJpeg`: ưu tiên `createImageBitmap(video, sx,sy,sw,sh, {resizeWidth,resizeHeight,resizeQuality:'low'})` (crop+resize 1 op GPU rẻ) → encode trong worker (KHÔNG block main-thread). **Fallback canvas.toBlob (main-thread, hành vi cũ)** nếu thiếu API/worker lỗi → worst case = như cũ.
- **rVFC**: trước khi chụp (path stream) đợi 1 frame MỚI present qua `requestVideoFrameCallback` (timeout 400ms) → né frame đen/trùng lúc seek/buffering.

**Verify (browser + extension):** API đủ (Worker/OffscreenCanvas/createImageBitmap/convertToBlob/rVFC = true); chạy thử đúng kỹ thuật → ra JPEG Blob off-thread (`ok:true, size:1420`); load 0 lỗi sau cả 2 edit. Path thật chỉ chạy khi có captureStream (getDisplayMedia, cần user bấm 🎬) — cơ chế đã verify, capture thật user test live.

**Files:** [live-chat/js/live/live-livestream-snap.js](../live-chat/js/live/live-livestream-snap.js), [live-chat/index.html](../live-chat/index.html) (snap.js ?v=20260613-ab). Lưu kiến thức: MEMORY [[reference_fb_live_capture_options]].

**Status:** ✅ Done (cơ chế verified; fallback an toàn về cách cũ).

### [web2] returns: giảm bước tạo phiếu thu về (auto-pick đơn + Chọn tất cả SP) ✅

Theo roadmap audit (returns 7-bước). 2 giảm-bước an toàn:

- **Auto-pick đơn** khi khách chỉ có **1 đơn** → bỏ 1 click (`loadCustomerOrders` tự gọi `pickOrder`).
- **Nút "Chọn tất cả / Bỏ chọn"** ở danh sách SP thu-về-1-phần → gộp N lần tick thành 1 click. KHÔNG auto-check sẵn (đây là thao tác cộng ví — giữ user chủ động).
- CSS `.rt-selall` (pill xanh) + `.rt-oi-title` flex. Bump `?v=20260613z`.

Verify live: trang load sạch (theme xanh, skeleton search KH), pick KH OK, form render; `node --check` OK. Đường dẫn đơn→SP chỉ verify bằng logic (clone `0123456788` không có đơn returnable — không seed đơn ảo cho thay đổi 2-dòng). Money op (submit) GIỮ nguyên await + canSubmit gating.

### [live-chat] Tối ưu hiệu năng chụp/embed livestream (ít giật, ít tốn tài nguyên) ✅

**User:** "nghiên cứu thêm github → chụp/inline/nhúng livestream → nhanh không giật lag, không tốn tài nguyên".

**Research:** 3 agent (MDN/Chrome/W3C/GitHub) hội tụ — bottleneck KHÔNG phải drawImage mà là (a) fps capture thừa, (b) JPEG encode trên main thread, (c) iframe repaint lan ra cả trang. Chi tiết + nguồn lưu MEMORY [[reference_fb_live_capture_options]].

**Áp (an toàn, giá trị cao):**

- `getDisplayMedia` `frameRate` 4/8 → **2/4** (buffer chỉ sample 5s/lần → fps cao là phí compositor) + `track.contentHint='detail'` (sắc nét ảnh SP, nhẹ pipeline).
- `_captureFrameJpeg`: context `{alpha:false, desynchronized:true}` (cache `STATE._captureCtx`) — JPEG bỏ alpha → readback/encode nhẹ. (canvas reuse + downscale + toBlob-blob đã có sẵn.)
- CSS `#live-video-dock` thêm `contain: layout paint` → cô lập repaint/relayout của iframe FB live khỏi cả trang → hết giật khi cuộn list. (KHÔNG size-contain → dock vẫn cao theo video.)
- Xác nhận đã tối ưu sẵn: dock dùng **bare `plugins/video.php` iframe** (KHÔNG load FB SDK); SDK chỉ load cho force-extract seek; wrapper có `isolation:isolate`.

**Chưa làm (đề xuất, lớn hơn):** chuyển JPEG encode sang **OffscreenCanvas + Web Worker** (`createImageBitmap`→`convertToBlob`) + trigger `requestVideoFrameCallback` thay `setInterval` (né frame đen/trùng) — fix jank triệt để nhất nhưng cần thêm worker file. Chờ user.

**Verify:** node --check OK; thay đổi là data/CSS/hint không thể vỡ load; flow getDisplayMedia/restrictTo cần user bấm 🎬 test live. ?v=20260613b (snap.js + inventory-panel.css).

**Files:** [live-chat/js/live/live-livestream-snap.js](../live-chat/js/live/live-livestream-snap.js), [live-chat/css/inventory-panel.css](../live-chat/css/inventory-panel.css), [live-chat/index.html](../live-chat/index.html).

**Status:** ✅ Done (subset an toàn; OffscreenCanvas-worker chờ user duyệt).

### [web2] De-purple đợt cuối — dọn tím sót ở zalo CSS + native-orders ✅

Còn sót vài chỗ (file `web2/zalo/*` bị loại khỏi pass trước + accent native-orders): `#6d28d9`/`#7c3aed`/`#f3edff` (badge "Cá nhân" tab Tài khoản, gradient native-orders) → xanh (`#0058da`/`#0068ff`/`#e8f2ff`). **Sweep toàn repo: 0 purple.** Push GitHub đã thông (user cấp lại quyền) — origin `d0baba193`.

### [web2] [render] Zalo Hội thoại → CHAT ĐẦY ĐỦ như Zalo (ảnh/file/sticker/emoji/reply/reaction/recall/forward/typing/seen + lightbox) ✅ (live-verified UI)

**User:** "Nghiên cứu github → làm giao diện để tương tác, chat với khách đầy đủ chức năng như zalo."

**Quy trình (ultracode, 3 workflow):** (1) research+design workflow (4 agent) đọc source zca-js v2.1.2 + UX Zalo/github + codebase → build spec `docs/web2/ZALO-CHAT-BUILD-SPEC.md`; (2) implement theo spec; (3) review workflow (4 dimension × verify) → 11 finding, fix hết HIGH+MEDIUM.

**Backend (`render.com`):**

- Schema: thêm `cli_msg_id, reply_to_msg_id, reply_to_preview, reactions JSONB, recalled+recalled_at+recalled_by, seen_at` (messages); `last_read_*, is_pinned, is_muted` (conv); bảng `web2_zalo_media` (bytea tự host ảnh/file shop gửi vì `sendMessage` không trả URL).
- zca service: `send()` trả `cliMsgId`+quote; thêm `sendMedia/sendSticker/react/recall/forward/sendTyping/sendSeen/getStickers/getQuickMessages`; listener `typing/seen_messages/delivered_messages/reaction/undo` (tên ĐÚNG theo apis/listen.js) + normalizer; `_normMessage` thêm reply+cliMsgId.
- Routes: `/send-image /send-file /send-sticker /react /recall /forward /typing /seen /stickers /quick-replies /media/:id`; `/send-message` reply+cliMsgId; messages keyset pagination `(sent_at,id)` + `last_read`. SSE thread-keyed `web2:zalo:thread:<id>` cho typing/reaction/recall/seen.

**Frontend (`web2/zalo/js/chat/*` — 9 module `WZChat.*`, tách vì app.js >800 dòng):** chat-store, lightbox, emoji-picker, sticker-picker, reactions, bubbles (gom nhóm theo người gửi, vạch ngày GMT+7, vạch chưa đọc, quote reply, hàng cảm xúc, trạng thái thu hồi, lưới ảnh album, ticks đã gửi/đã xem, hover tools), composer (text+ảnh+file+dán+kéo-thả+emoji+sticker+reply bar+quick reply), realtime (SSE patch typing/seen/reaction/recall), chat-actions. app.js delegate renderChat→WZChat + optimistic send/reconcile/retry. 3 CSS: chat-bubbles/composer/lightbox.

**Review fixes (11):** ATOMIC reaction JSONB (jsonb_set 1-UPDATE, hết lost-update khi 2 reaction tới gần); inbound reaction zca-code→emoji (đồng nhất với reaction shop); unread chỉ +1 khi tin THỰC mới (INSERT-first RETURNING); `sendSeen` idTo=threadId (không phải accountKey); load-older composite keyset `(sent_at,id)`; global SSE chỉ refresh DANH SÁCH (per-thread lo tin active); composer drop file khi đổi hội thoại giữa chừng; bỏ search emoji rỗng + sub conv-id thừa.

**Verify (Playwright localhost, KHÔNG gửi tin KH thật):** 9 module load 0 lỗi; mở hội thoại → composer 6 nút + 11 bubble (.wz-msg-bubble) + hover tools + meta + date divider; emoji picker 200 emoji + chèn input; reaction bar 6 mục; lightbox mở/đóng ảnh zdn.vn OK. Gửi ảnh/sticker/reaction/recall thật cần acc shop tự-thread (chưa test gửi để tránh nhắn KH thật).

**Giới hạn (zca-js):** lịch sử 1-1 với người lạ không backfill (chỉ realtime forward); reaction add-only (không gỡ); gửi video cần URL host sẵn (defer); failed-send at-least-once (retry có thể trùng nếu tin đã tới).

**Files:** `render.com/{db/web2-zalo-schema,services/web2-zalo-zca,routes/web2-zalo}.js`, `web2/zalo/js/web2-zalo-{api,app}.js`, `web2/zalo/js/chat/*.js` (9), `web2/zalo/css/chat-*.css` (3), `index.html ?v=20260613e`, `docs/web2/ZALO-CHAT-BUILD-SPEC.md`. Commits `abf8c1c49`→`58f6281f1`.

**Status:** ✅ UI live-verified. 🔄 Backend deploy `58f6281` (atomic reactions etc.) đang queue.

### [web2] UX per-page đợt 3 (users-permissions/report-revenue/native-orders) + de-purple sâu (violet/indigo scale) ✅

- **users-permissions**: thay 5 `alert()` bằng toast (`notificationManager`, helper `_toast`).
- **report-revenue**: skeleton `.w2-skel` cho kpi-grid + chart thay text "Đang tải".
- **native-orders**: empty-state có icon + phân biệt "lọc không thấy" vs "chưa có đơn".
- **so-order**: đã có sẵn Esc-close + empty-state (không cần sửa).
- **De-purple SÂU**: lần trước chỉ map palette TPOS; nay quét thêm **Tailwind violet/purple/indigo** (`#6d28d9 #8b5cf6 #5b21b6 #9333ea #4f46e5 #6366f1 #a78bfa …` + rgba tương ứng) → xanh, trên **54 file** CSS+HTML+JS (vd nút "30 ngày" report-revenue tím→xanh). 0 còn lại.
- Bump native-orders-app.js `?v=20260613z`.

Verify: node --check toàn bộ JS OK; nav report-revenue/users-permissions 0 JS error; nút active xanh. Còn roadmap (defer, ít traffic): reconcile/supplier-debt mobile split-layout, returns giảm bước, so-order loading flash.

### [web2] UX per-page đợt 2 (variants / kpi / audit-log) theo roadmap audit ✅

- **variants** (`web2-variants-app.js` + index): Enter-to-save modal; empty-state phân biệt "đang filter không thấy" vs "kho trống"; modal `min-width: min(480px, calc(100vw-32px))` (hết tràn mobile).
- **kpi** (`kpi-dashboard.js`): `refresh()` bọc try/catch + **skeleton `.w2-skel`** thay text "Đang tải…"; lỗi → UI lỗi + nút "Thử lại" + toast.
- **audit-log** (`index.html` inline): `load()` bọc try/catch + skeleton; lỗi → "Lỗi tải" + "Thử lại" + toast (trước: crash im lặng).
- Bump JS `?v=20260613z` (variants/kpi).

Verify: node --check toàn bộ (kể cả inline) OK; nav 3 trang 0 JS error. Còn roadmap: so-order, reconcile, supplier-debt, returns, report-revenue, native-orders, users-permissions.

### [web2] UX per-page đợt 1 (products / customers / dashboard) theo roadmap audit ✅

Tiếp tục từ roadmap `docs/web2/WEB2-UX-AUDIT.md` — fix high-impact các trang traffic cao:

- **products** (`web2-products-app.js`): autofocus ô **Tên SP** thay NCC khi thêm (verify live: ô Tên có focus ring); **Enter-to-save** trong modal (trừ textarea/select/button); error row có nút **"Thử lại"** (expose `load()`).
- **customers** (`customers-app.js`): `saveModal` GIỮ modal mở khi đang lưu (busy spinner) → lỗi thì hiện inline `#wcModalError`, **KHÔNG đóng modal mất data** (trước: đóng trước khi gọi API).
- **dashboard** (`index.html` inline): **skeleton `.w2-skel`** cho 4 KPI lần đầu; bỏ silent-failure — lỗi/`!success` → KPI về '—' + toast lỗi (trước: `console.warn` im lặng).
- **Cache-bust**: bump `web2-sidebar.js?v=20260613z` toàn bộ 38 HTML (palette + notification autoload mới propagate prod) + products-app/customers-app JS.

Verify: node --check OK; products modal live (focus Tên + 0 error). Còn lại theo roadmap: variants, so-order, reconcile, supplier-debt, returns, report-revenue, kpi, audit-log…

### [web2] [shared] Hiện đại hoá UX toàn Web 2.0: Command Palette + de-purple triệt để + global fixes + UX audit ✅

**User:** "tham khảo mọi nguồn → cải thiện toàn bộ Web 2.0 thành web hiện đại nhất, chức năng đa dụng dễ dùng" (chọn cả 3 hướng: global / per-page / audit).

**Global features + fixes (1 lần → mọi trang):**

- **Command Palette** `web2/shared/web2-command-palette.js` (Ctrl/⌘K hoặc `/`): tìm fuzzy + bỏ dấu, nhảy mọi trang, keyboard + a11y. Auto-load qua sidebar.
- **De-purple TRIỆT ĐỂ** (token recolor chỉ cover style token-driven; còn hardcode rải rác): map `#7266ba/#5e51ac/#7c3aed/#4338ca/#a855f7/rgba(114,102,186)…`→xanh trong **24 page CSS + 11 HTML inline-style + 19 JS** (vd nút "Tải" audit-log tím→xanh, verified). 0 purple còn lại.
- **Mobile**: bảng rộng auto cuộn ngang ≤760px (safety net mọi trang) trong web2-theme.css.
- **Toast**: auto-load `notification-system.js` qua sidebar → mọi trang có `notificationManager` (audit: 3 trang thiếu).

**UX Audit (workflow 5-agent, 119 phát hiện / 29 high / 7 global):** roadmap `docs/web2/WEB2-UX-AUDIT.md` — checklist high-impact per-page (skeleton loading, Esc/Enter modal, error+retry, autofocus, empty-state, mobile @media) cho đợt per-page tiếp theo.

**Verify live:** audit-log nút "Tải" xanh; dashboard/products/customers/page-builder không vỡ; palette gõ "khach"→"Khách Hàng". Commits trước: `584cd3291` (re-skin), `570a1f855` (palette).

**Status:** ✅ Global xong. Per-page high-impact (29 mục) = đợt tiếp theo theo roadmap.

### [web2] [render] Zalo Hội thoại: hiện ảnh/sticker/file trong chat + avatar an toàn + đồng bộ danh bạ → hội thoại ✅ (frontend live-verified)

**User (2 lỗi từ ảnh chụp trang `web2/zalo`):** (1) chưa hiện danh sách tất cả đoạn hội thoại cũ; (2) chưa hiện avatar + hình ảnh (ảnh trong tin nhắn hiện ra dạng URL chữ).

**Research (GitHub/npm zca-js v2.1.2 + đọc source cài sẵn):** zca-js **KHÔNG có API liệt kê hội thoại gần đây / lịch sử 1-1 với người lạ** — hội thoại chỉ chảy về realtime qua WebSocket listener từ lúc kết nối. Backfill khả dĩ duy nhất = seed từ **danh bạ (`getAllFriends`) + nhóm (`getAllGroups`+`getGroupInfo`)**. Tin ảnh: listener trả `content` = `TAttachmentContent {href, thumb, params}`, `msgType='chat.photo'` (→ ảnh), `chat.sticker/chat.video.msg/share.file/chat.link/...`.

**Fix:**

- **`services/web2-zalo-zca.js`**: `_normMessage` mới — phân loại `msgType` (image/gif/sticker/video/voice/file/link/...) + trích `attachments [{type,url,thumb,href,title}]` (parse `content.params`), caption tách riêng. Thêm `getRoster()` (gộp friends+groups chuẩn hoá) + `isConnected()`.
- **`routes/web2-zalo.js`**: `_persistIncoming` lưu `attachments` (JSONB) + `last_msg_text` nhãn media tiếng Việt (`[Hình ảnh]`/`[Sticker]`/...). Route mới `POST /accounts/:key/sync-conversations` (seed bạn+nhóm vào `web2_zalo_conversations`, KHÔNG đụng last_msg). Mở chat → **lazy resolve avatar/tên** qua `getUserInfo` khi thiếu (best-effort, 1 lần/thread).
- **Frontend `web2-zalo-app.js`**: helper `avatarHtml` (`<img referrerpolicy=no-referrer>` + fallback chữ cái đầu khi CDN Zalo lỗi); `bubbleKind`/`bubbleBody` render bong bóng ảnh/sticker/video/file/link; **bắt cả legacy** (tin cũ `msg_type='link'`/`text` mà content là URL ảnh zdn.vn → vẫn render ảnh); nút **Đồng bộ** ở đầu danh sách + auto-sync 1 lần khi acc đã kết nối mà list rỗng. `web2-zalo-api.js`: thêm `syncConversations`.
- **CSS**: bong bóng media (ảnh bo góc, sticker nền trong, video play overlay, file/link), header danh sách + nút `.wz-iconbtn`, avatar nhóm.

**Verify live (Playwright, localhost FE + prod API):** mở "Camera Chạy Bằng Cơm" → URL ảnh chữ cũ **render thành ảnh thật** (`naturalWidth=1829`, 0 lỗi console); nút Đồng bộ + nhãn `[Hình ảnh]` hiện trong list. ⚠ Avatar + đồng bộ danh bạ cần **deploy Render** (sync route + lazy-resolve là backend) mới hoạt động; avatar tạm hiện chữ cái đầu tới khi build xong (~3-5 phút).

**Giới hạn thật (đã báo user):** hội thoại với **KH lạ (không phải bạn bè)** nhắn TRƯỚC khi kết nối tool **không backfill được** (giới hạn zca-js) — chỉ chảy về realtime từ lúc kết nối; nút Đồng bộ chỉ nạp bạn bè + nhóm.

**Files:** [services/web2-zalo-zca.js](../render.com/services/web2-zalo-zca.js), [routes/web2-zalo.js](../render.com/routes/web2-zalo.js), [web2/zalo/js/web2-zalo-app.js](../web2/zalo/js/web2-zalo-app.js), [web2-zalo-api.js](../web2/zalo/js/web2-zalo-api.js), [css/web2-zalo.css](../web2/zalo/css/web2-zalo.css) (index.html `?v=20260613c`).

**Status:** ✅ Frontend done + live-verified. 🔄 Backend (sync/avatar) chờ Render deploy verify.

### [live-chat] Chụp livestream qua Element Capture (occlusion-immune) — video ẩn/đè/tab nền vẫn chụp 100% ✅

**User:** "làm 1 popup share đi" (chấp nhận getDisplayMedia popup để video có thể thu nhỏ/bị đè vẫn chụp) — "sợ bật popup nó lag".

**Bối cảnh:** Task A (extension tabCapture im lặng) đã bỏ vì `getMediaStreamId` bắt buộc bấm icon extension/phiên (verify thật). Research: "ẩn/đè vẫn chụp" CHỈ làm được qua **Element Capture** (`restrictTo`) trên self-capture `getDisplayMedia` — Chrome 132+ (verify test browser Chrome 147: `RestrictionTarget`+`restrictTo` có sẵn).

**Fix** (`live-livestream-snap.js`):

- Path getDisplayMedia: `CropTarget.cropTo` → **ưu tiên `RestrictionTarget.fromElement` + `track.restrictTo`** (Element Capture — chụp ĐÚNG pixel wrapper, bỏ qua thứ đè lên + ngoài element → occlusion-immune). Fallback `cropTo` (Region Capture, không miễn đè) nếu restrictTo fail/cũ.
- **Chỉ INTERACTIVE (user bấm 🎬) mới getDisplayMedia** (popup cần user gesture). AUTO-start (không gesture) → vẫn extension captureVisibleTab im lặng. Hủy share → fallback extension (không fail cứng).
- **Chống lag** (đúng lo ngại user): cap `frameRate {ideal:4,max:8}` (buffer chỉ sample ~5s/lần nên không cần fps cao → giảm tải compositor/encode); Element Capture chỉ vùng video nhỏ.
- Wrapper thêm `isolation:isolate` (restrictTo yêu cầu element tạo stacking context).

**Verify:** API có sẵn (Chrome 147), syntax OK, load 0 lỗi. Flow share-popup + restrictTo thật cần user bấm 🎬 + chấp nhận picker trên live thật (không auto-test được) — user verify giúp.

**Files:** [live-chat/js/live/live-livestream-snap.js](../live-chat/js/live/live-livestream-snap.js) (index.html đã ?v=20260613j).

**Status:** ✅ Done (API+load verified; share-flow chờ verify live).

### [web2] [shared] Re-skin TOÀN BỘ Web 2.0 sang phong cách trang Zalo (xanh #0068ff) ✅ (live-verified)

**User:** "đây là giao diện/animation gì? Tôi muốn TOÀN BỘ Web 2.0 dùng giao diện, animation này" → chốt: re-skin theme chung + đổi sang **xanh Zalo #0068ff**.

**Cách làm (đòn bẩy cao, ít rủi ro):** sửa 3 file CSS chung (load cuối → auto override 36 trang + page-builder), KHÔNG viết lại markup từng trang.

- `web2/shared/web2-theme.css`: recolor token tím `#7266ba`→xanh `#0068ff` + soften neutrals (bg `#f5f7fb`, line `#e6e9ef`, text `#0f172a/#475569`); thay 14 chỗ hardcode tím (rgba/gradient); **THÊM "Zalo Refresh Pack"**: bo góc mềm (btn 9px, card/modal 12-18px, input 10px), soft shadow, hover-lift + active-scale + focus-ring, skeleton `.w2-skel`, busy spinner `.is-busy`, scrollbar mảnh, reduced-motion.
- `native-orders/css/native-orders.css`: token primary tím→xanh.
- `web2/shared/web2-sidebar.css`: 4 gradient tím→xanh.
- 38 HTML: bump `?v=20260613z` cache-bust shared CSS.

**Verify live (Playwright):** dashboard (stat cards), products (table dày), customers, product-category (page-builder), zalo — tất cả xanh/bo góc/soft shadow/animation, KHÔNG vỡ layout. Commit `584cd3291`.

**Status:** ✅ Done (re-skin giao diện global). Phần "cải tiến chức năng/usability từng trang" = chương trình nhiều đợt (đang chờ user chọn ưu tiên).

### [live-chat] Video livestream dock đỉnh cột Kho SP (hết float đè) + Force extract đa nhiệm (pool song song + chạy nền) ✅

**User:** (1) video FB live float góc dưới-phải đè lên Kho SP/comment → muốn "inline góc phải trên, cố định phần video"; (2) "force extract cho chạy đa nhiệm".

**Bối cảnh quan trọng (research vendor docs):** chụp iframe FB là cross-origin → KHÔNG đọc pixel trực tiếp; cơ chế hiện tại = extension `captureVisibleTab` (chụp viewport → crop rect wrapper) → **bắt buộc video hiển thị + không bị đè + tab active**. Element/Region Capture (occlusion-immune) CHỈ chạy trên self-capture `getDisplayMedia` (reject trên `tabCapture`). User chốt: giữ extension, dock video hiện (chấp nhận phải hiển thị).

**Task B — Dock video (thay float):**

- Constants chung `SNAP_VIDEO_W=160 / HEADER=30 / H=284` (1 nguồn cho `_ensureEmbeddedIframe` + `_ensureSeekPlayer` + `_clientRestoreLive`).
- `_ensureVideoDock()` tạo `#live-video-dock` chèn TRÊN `#khoSpHost` trong `#khoSpColumn` (flex column) → video in-flow, reserved, SP cuộn dưới. Wrapper `position:relative` trong dock (fallback fixed góc dưới-phải nếu chưa có cột).
- CSS: `#live-video-dock{flex:0 0 auto}` + `:empty→display:none` (mọi path remove wrapper tự co) + `collapsed→none`. Guard `_captureExtensionFrame`: rect<2 → skip (dock ẩn không chụp rác).
- Verify browser: dock đỉnh cột, SP nằm dưới (không đè), `:empty`/`collapsed` ẩn, wrapper in-viewport, 0 console error.

**Task C — Force extract đa nhiệm (CẢ HAI):**

- **Chạy nền:** bỏ `confirm()` chặn + bỏ khóa chip (pointerEvents) → user vẫn kéo SP/duyệt comment khi chạy; bấm chip lần nữa = HỦY (`STATE._forceExtractCancel`, check trong mọi loop).
- **Pool song song:** khi `extReady` → 3 worker XFBML player (strip tạm góc dưới-trái, hiển thị để captureVisibleTab crop per-worker) cùng seek/capture từ 1 queue → ~2-3× nhanh. `_buildSeekPlayer` (worker-scoped), `_captureExtensionFrameThrottled` (chain ~480ms né rate-limit Chrome 2/s), `_workerSeekCapture`, `_runForceExtractParallel`. Không `extReady` (chỉ getDisplayMedia, cropTo bind 1 wrapper) → `_runForceExtractSerial` (giữ NGUYÊN logic cũ, +cancel). `_captureExtensionFrame(targetEl)` generalize (guard arg không phải Element).
- Pool dùng strip riêng, KHÔNG đụng dock → khỏi restore iframe live; serial mới restore.

**Lưu ý verify:** load sạch 0 lỗi + serial fallback giữ hành vi cũ. Path POOL song song cần **live VOD thật + extension** để verify end-to-end (chưa repro được tự động). Force-extract non-destructive (chỉ fill thumbnail thiếu) nên rủi ro thấp.

**Files:** [live-chat/js/live/live-livestream-snap.js](../live-chat/js/live/live-livestream-snap.js), [live-chat/css/inventory-panel.css](../live-chat/css/inventory-panel.css), [live-chat/index.html](../live-chat/index.html) (?v=20260613i). Còn lại (chưa làm, chờ user): Task A — extension `tabCapture` cho chụp tab-nền không popup (auto-publish CWS).

**Status:** ✅ Done (B verified; C: load OK + serial OK, pool chờ verify live).

### [web2] Zalo page UX overhaul — friendly onboarding + a11y + fix invisible modal inputs ✅ (live-verified)

**User:** "tham khảo tất cả nguồn google, github, ai support/animation/ui sites để cải thiện, thân thiện người dùng trang web2/zalo".

**Research** (WebSearch nhiều nguồn: chat UI 2026, micro-interactions/CSS GPU, Aceternity/Magic UI, empty-state-as-onboarding Notion/Slack, skeleton shimmer, ARIA APG tabs/modal). Áp dụng kiểu **light "friendly professional"** (CRM tool, không flashy landing).

**🐛 Bug critical phát hiện khi test live** (review code KHÔNG bắt được — cần computed CSS): modal OA/Add **input + nút primary VÔ HÌNH** vì `--wz-*` token scope ở `.wz-main` nhưng modal là sibling body-level ngoài `.wz-main` → `var()` undefined → border/bg trống. **Fix:** chuyển token định nghĩa lên `.web2-theme` (body) → modal inherit.

**Cải thiện (verify live qua Playwright screenshots):**

- Onboarding 2 thẻ lựa chọn giàu thông tin (icon badge, mô tả, tag "AN TOÀN" cho OA, CTA mũi tên) thay vì 2 ô dashed phẳng.
- Empty states thân thiện (icon+title+sub+hướng dẫn) cho hội thoại/lookup; skeleton shimmer khi load.
- Thay `prompt()` thêm acc bằng **modal** (label + cảnh báo acc phụ).
- Micro-interactions: hover lift + active scale, focus-visible ring, gradient primary, tab indicator, QR pulse ring, message-bubble/panel/modal entrance (transform/opacity, GPU).
- A11y: ARIA tablist/tab/tabpanel + roving tabindex + ←/→/Home/End; modal focus-in + return focus + Esc; label `for`/`id`; choice card role=button + Enter/Space; `prefers-reduced-motion` tắt mọi motion.
- Busy spinner cho nút async; compose textarea auto-grow; responsive 560/860px; `inputmode=numeric` cho SĐT.

**Files:** [web2/zalo/css/web2-zalo.css](../web2/zalo/css/web2-zalo.css) (rewrite, token→.web2-theme), [web2/zalo/index.html](../web2/zalo/index.html) (ARIA + add-modal + QR frame), [web2/zalo/js/web2-zalo-app.js](../web2/zalo/js/web2-zalo-app.js) (skeleton, modal helpers, ARIA tabs, busy, autosize, friendly empties). Bump `?v=20260613b`.

**Verify:** node --check OK; live screenshots: accounts onboarding, OA modal (inputs HIỆN), chat empty, add modal — đều đẹp. Adversarial review 3-agent (a11y/app-logic/css) đã chạy.

**Status:** ✅ Done.

### [render] [web2] [worker] C8 — so-order Firestore → Postgres (web2Db) ✅ phase 1 (live-verified)

**User:** "tiếp tục" (sau audit 14/15) → làm nốt C8 (item defer cuối).

Migration nguồn chuẩn Sổ Order từ **Firestore `web2_so_order/main` → Postgres `web2_so_order`** (1 doc JSONB + `version`), GIỮ shape `{tabs,activeTabId}` (chưa normalize ra rows — phase 2 optional).

- **Server** `render.com/routes/web2-so-order.js` (mới): `GET /get` + `POST /save` (optimistic version: ghi đè stale → **409 conflict** trả server, hết last-write-wins) + `POST /reset` (admin) + SSE `web2:so-order` + `requireWeb2AuthSoft` + ensureTables WeakSet. Mount `/api/web2-so-order` + wire notifier.
- **Client** `so-order/js/so-order-storage.js` Sync: Firestore→Postgres, **5 method public GIỮ NGUYÊN** → so-order-app.js KHÔNG đổi. `_localVersion` optimistic, SSE realtime push, migration 1 lần từ Firestore khi server rỗng.
- **Worker** `cloudflare-worker`: thêm route `WEB2_SO_ORDER` (`/api/web2-so-order/*` → Render) — path mới chưa proxy → browser nhận HTML 404.
- **Verify API prod:** /get→401 no-token, empty→v0, create→v1, **STALE baseVersion→409** ✓, correct→v2; /reset→200.
- **Verify browser (localhost + ext + web2 login):** mở so-order → migration Firestore→Postgres **14 shipments / 2 tab** ✓; server Postgres persist version=2 + 14 shipments ✓; reload → load từ Postgres (KHÔNG re-migrate, 14 shipments, **0 console error**) ✓; version bump 1→2→3 (save round-trip OK) ✓; SSE subscribed ✓.
- **Cải thiện vs Firestore:** single source Postgres · optimistic concurrency · auth enforce · realtime SSE push. so-order giờ cần login web2 (như cả suite). IMPROVEMENT-PLAN F1 phase 1 done.

### [so-order] Data ngẫu nhiên dùng biến thể THẬT từ Kho Biến Thể (đúng với kho biến thể) ✅

**User:** "ok và đúng với kho biến thể" — data random phải dùng màu/size có thật trong Kho Biến Thể (bỏ "Xanh Navy" hardcoded lạ).

**Fix** [so-order/js/so-order-app.js](../so-order/js/so-order-app.js): `_RAND.colors` bỏ "Xanh Navy"; thêm `_variantPools()` đọc `Web2VariantsCache.getAll()` → lấy `value` group "Màu" + "Size"/"Cỡ" làm pool; `_randomRow` dùng `_variantPools()` thay `_RAND.colors/sizes` (fallback hardcoded khi cache rỗng). → mọi biến thể random đều registered → `findByValueExact` khớp → mã SP encode đủ màu/size, đúng shortCode kho (DEN/BE/XD/XL2…).

**Wipe + regen (user duyệt "Wipe sạch SP + Sổ Order → regen", GIỮ variants/khách/ví):** xoá 34 web2_products (force DELETE) + clear 16 shipments Sổ Order (giữ 2 tab) → gen 6 đơn mới. Kết quả: 14 SP mã đều encode màu+size đúng (`HCDAMHONGXL2`, `HCQUAN2XLL`, `HCQUAN3XD28`, `HCQUANDEN29`, `HCAO2BE28`…), **0 "Xanh Navy"**. Variants/customers/wallets KHÔNG đụng.

### [so-order] Mã SP mất màu/size khi nhận hàng — biến thể gộp "Màu / Size" tra cứu fail ✅

**User:** "HCQUAN2 ấy" (chỉ mã SP vô nghĩa).

**Bug:** 3 SP khác biến thể nhận cùng prefix+type ra mã trùng kiểu counter: `HCQUAN` (QUẦN TÂY CẠP CAO Đen/XL), `HCQUAN2` (QUẦN TÂY CẠP CAO Be/XL), `HCQUAN3` (QUẦN SHORT KAKI Xanh Navy/M) — **mất hẳn MÀU+SIZE** trong mã (rule là `<PREFIX><LOẠI><MÀU><SIZE>`).

**Root cause:** [so-order/js/so-order-app.js](../so-order/js/so-order-app.js) `_assignKhoCodes` lookup override màu/size bằng `Web2VariantsCache.findByValueExact(it.variant)` với `it.variant` là chuỗi **GỘP** `"Đen / XL"` → cache lưu `"Đen"`, `"XL"` RIÊNG → `findByValueExact("Đen / XL")` = **null** → không có override → mã rớt màu/size. Verify live: `findByValueExact("Đen / XL")`=null; `"Đen"`→DEN(Màu), `"XL"`→XL2(Size), `"Be"`→BE(Màu).

**Fix:** tách `it.variant` theo `/`, tra cứu TỪNG phần, gán `overrideColorShort`/`overrideSizeShort` theo `groupName` (size vs màu). Variant 1 giá trị (không `/`) vẫn lookup nguyên chuỗi (backward-compat).

**Verify (engine, sau reload):** `QUẦN TÂY CẠP CAO [Đen/XL]`→`HCQUANDENXL2`, `[Be/XL]`→`HCQUAN2BEXL2` (counter giữa type↔màu đúng rule), `QUẦN SHORT KAKI [Xanh Navy/M]`→`HCQUAN3M`.

**⚠ 2 lưu ý:**

- SP **đang có** trong kho (HCQUAN/HCQUAN2/HCQUAN3) là data random tạo TRƯỚC fix → vẫn giữ mã cũ; fix chỉ áp cho receive MỚI. Beta → wipe + re-receive để regen mã đúng.
- **"Xanh Navy" KHÔNG có trong Kho Biến Thể** (chỉ có Xanh Dương=XD, Xanh Lá=XL) → màu này không encode được tới khi thêm vào Kho Biến Thể (data random dùng màu chưa đăng ký).

**Status:** ✅ Done (generation). Regen data cũ chờ user.

### [render] [web2] Audit Web 2.0 — FIX TOÀN BỘ backlog (14/15 item) + adversarial review ✅

**User:** "Làm tất cả web 2.0 đang beta test nên cứ code cho chính xác hoàn thiện." → Workflow điều tra 18 item (19 agent) → spec chính xác → implement theo 5 batch file-ownership (money/auth thủ công tuần tự) → adversarial review 8 vùng (48 agent) → fix bug thật.

**Commits:** `ccf8b4a3b` (B1) · `1c08315ec` (B2) · `76b4261b5` (B3) · `147e0a0fc` (B4) · `e7c58bb35`+`8b6bdf9ae` (B5) · `e17ddbcab` (review-fixes). Tất cả node --check pass.

- **A1** fast-sale-orders `/from-native-order`: advisory lock `pg_advisory_xact_lock(source_id)` + re-check PBH dưới lock → double-submit (2 máy/double-click) trả idempotent thay vì PBH TRÙNG; recompute splitIndex/number dưới lock; retry bump cả lockedSplitIndex (review [5]).
- **A2+C18+[11]+[12]** ví NCC partial-return (cụm money — quan trọng nhất): `_isRowFullyReturned` so qty đã trả ≥ qty mua (qty≤0 legacy→đã đủ, chống over-refund); **returnedRowIds CỘNG DỒN delta** thay ghi đè ở 3 nơi (server /tx, C9, client storage) — trả nhiều đợt tích luỹ đúng; modal trả max=SL còn lại (mua−đã trả) + tag "đã trả N"; bỏ fallback `{qty:0}`.
- **A3** supplier-debt: bỏ dòng so-order `draft`/`cancelled` khỏi công nợ (giữ `ordered`/`partial_received`/`received`).
- **A4** hidden-commenters: endpoint atomic `/live-hidden-commenters/hide|unhide/:fbId` (jsonb upsert append-if-absent / array filter, 1 câu) thay client gửi cả mảng → hết lost-write 2 máy ẩn cùng lúc.
- **C7** token hash at-rest: `web2_user_sessions.token_hash`; session mới lưu HASH (sha256) cả `token`(PK) lẫn `token_hash` → DB không plaintext; 4 verify-site dual-match + 42703 fallback (review [2]) + boot ALTER → **ZERO-LOCKOUT, verify prod login→me→gated→logout = 200/200/401→200**.
- **C9** quick-refund ATOMIC: 1 endpoint create+approve(trừ kho)+ghi ledger ví trong 1 transaction → hết phiếu draft mồ côi; idempotent record+txId; live-verified (400 validation).
- **C11** picker total từ toàn textarea (cộng dồn) · **C12** sepay match whole-word+longest-first (hết "huanlong"→"huan") · **C14** 8 route đổi flag boolean→WeakSet (cold-start corruption) + cascade pgString→tham số hoá · **C16** bridge `_prevTopicsStr` (hết churn EventSource) · **C17** manualSepayId wrap 27.7h→11.5 ngày · **B5** notifications cron 10' (web2Db, không fallback chatDb — review [21]).
- **Adversarial review:** 24 finding → fix bug thật (returnedRowIds over-refund CRITICAL, modal remaining, cron pool, C7 fallback, A1 splitIndex); loại false-positive (C7 login hash-in-both = đúng design no-plaintext đã live-verify; C16 readyState guard đúng; B5 noti best-effort không cần tx).
- **C8** (so-order Firestore 1-doc → Postgres): **DEFER có chủ đích** — migration kiến trúc multi-week (bảng normalized + CRUD API + migration data + image storage + viết lại sync). = F1 trong IMPROVEMENT-PLAN.md. Không half-migrate (rủi ro data so-order đang dùng).

**Cập nhật:** WEB2-PAGES-ANALYSIS.md flip ⬜→✅ + overview #auditPages + memory.

### [render] [web2] Nhận hàng so-order → Kho SP realtime + BỎ giật bảng (SSE codes[] + in-place batch) ✅

**User:** "so-order đã nhận hàng → bên kho products không cập nhật tồn kho/trạng thái; realtime + kho products bị giật bảng quá (bỏ giật bảng)."

**Root cause (workflow 3 agent điều tra):**

- Receive ("Nhận hàng") là **bulk op**: client gọi `upsertPending([...])` + raw POST `/confirm-purchase-partial {items:[...]}` (so-order-app.js:1924,1958). Server `_notify('confirm-purchase-partial', null)` — **code=null** (web2-products.js).
- Products SSE handler: chỉ in-place khi `action==='update' && code`; mọi event null-code → `debouncedFullLoad()` → `load()` → `renderRows()` **thay sạch tbody.innerHTML = giật bảng**. Bulk receive luôn rơi vào nhánh này → giật + (race `STATE.loading`/debounce coalesce 2 event) đôi khi mất update.

**Fix hợp nhất — bulk SSE mang `codes[]`, patch CHỈ row bị đổi tại chỗ:**

- [render.com/routes/web2-products.js](../render.com/routes/web2-products.js): `_notify(action, codeOrCodes)` emit cả `code` (single|null) LẪN `codes` (array|null) — payload `{action,code,codes,ts}`, chỉ MÃ SP nội bộ KHÔNG PII. 6 call site bulk truyền codes thật: adjust-stock/mark-printed/adjust-pending/upsert-pending/confirm-purchase/confirm-purchase-partial (backfill-supplier giữ null = full reload có chủ đích). Thêm route `GET /batch?codes=A,B,C` (TRƯỚC `/:code`).
- [web2/products/js/web2-products-api.js](../web2/products/js/web2-products-api.js): `getBatch(codes)`.
- [web2/products/js/web2-products-app.js](../web2/products/js/web2-products-app.js): `_updateRowsBatch(codes)` (fetch + `_updateRowInPlace` từng code on-page, không reload); SSE callback viết lại — chỉ `create`/`delete` full reload; mọi update-like → patch in-place theo `affected = codes||[code]`; `load()` **dim-not-blank** (làm mờ thay vì xoá trắng khi đã có row) hết spinner flash.

**⚠ Cần Render deploy mới ăn `codes[]`** — client feature-detect `getBatch` + fallback full reload (404 `/batch` → `debouncedFullLoad`), nên deploy frontend↔backend không cần đúng thứ tự. Deploy `dep-d8mgus5ckfvc73e813ag` LIVE 2026-06-13.

**Verify (Playwright live localhost → prod worker/Render, sau deploy):**

- Single: POST `confirm-purchase-partial {items:[{code:HNDAM,qtyReceived:5}]}` → SSE log `web2:products confirm-purchase-partial HNDAM` (codes truyền qua) → row HNDAM patch in-place `Tồn 0→5`, status `CHO_MUA → MUA 1 PHẦN (5 đã nhận · 9 chờ)`; **sentinel ở row khác SỐNG** (không full reload) + `loadingRow=false` → 0 giật.
- Bulk 2 mã: `[{HNDAM,9},{HCAO4,3}]` → SSE `...confirm-purchase-partial HNDAM,HCAO4` → cả 2 row patch in-place (HNDAM `5→14`, `Đang bán` khi pending=0); sentinel sống, 0 giật.
- `/batch?codes=...` route live.

**Status:** ✅ Done.

### [web2] [render] [worker] Zalo single-source — BUILD v1 (đăng nhập QR + chat + tra cứu + ZNS) ✅

**User:** "cho đăng ký Zalo OA là chức năng sẽ phát triển… làm tất cả chức năng: đăng nhập tài khoản (QR/api), lấy tin nhắn, nhắn tin, xem thông tin người dùng/người khác… tạo 1 trang zalo riêng quản lý, các trang khác tham chiếu tới — chỉ có 1 nguồn zalo."

**Kiến trúc** (sau understand workflow 9-agent + enumerate zca-js API 140 method): zca-js (`require('zca-js')` CJS OK trên render) chạy **trong process Render fallback** (sở hữu web2Db + SSE hub + CF proxy), re-login từ session DB khi boot. 2 kênh trong 1 nguồn: **personal** (zca-js: QR/cookie login, listener WS, send, getUserInfo/findUser, friends/groups) + **OA** (official: token refresh xoay, ZNS template, tin tư vấn cs). Mọi trang khác chỉ gọi `Web2Zalo.*` → `/api/web2-zalo/*`, KHÔNG chạm Zalo trực tiếp.

**Files MỚI:**

- `render.com/db/web2-zalo-schema.js` — `web2_zalo_accounts/conversations/messages` + `web2_zns_templates/log` + `web2_zalo_send_jobs/items` + ALTER `web2_customers` (zalo_uid). Idempotent, ADD COLUMN đầu, WeakSet pool guard.
- `render.com/services/web2-zalo-zca.js` — session manager zca-js (Map đa acc, QR login non-blocking + poll, listener→persist, restore-on-boot, defensive require).
- `render.com/services/web2-zalo-oa.js` — OA token store/refresh + ZNS + cs + sync template (global fetch).
- `render.com/routes/web2-zalo.js` — `/api/web2-zalo/*` (accounts/login-qr/qr/reconnect/disconnect, conversations/messages/send-message, lookup, oa/connect, send-zns, zns/log) + `_notify` SSE + restoreSessions.
- `web2/shared/web2-zalo.js` — helper `Web2Zalo` (sendZNS/sendMessage/getConversation/openChat/attachZaloButtons/status) — cổng duy nhất + nút Zalo drop-in `[data-w2zalo-phone]`.
- `web2/zalo/index.html` + `js/web2-zalo-api.js` + `js/web2-zalo-app.js` + `css/web2-zalo.css` — 4 tab: Tài khoản / Hội thoại / Tra cứu / ZNS. Giờ GMT+7.

**Files SỬA:** `render.com/server.js` (require+ensureSchema+restoreSessions+initializeNotifiers+mount `/api/web2-zalo`), `render.com/package.json` (`zca-js@^2.1.2`), `cloudflare-worker/modules/config/routes.js`+`worker.js` (route `WEB2_ZALO`→fallback), `web2/shared/web2-sidebar.js` (menu "Zalo" + WEB2_PAGES). Doc [docs/web2/ZALO-INTEGRATION.md](web2/ZALO-INTEGRATION.md) §0.

**Verify:** `node --check` toàn bộ + `require('./routes/web2-zalo')` load OK (zca-js resolve). Adversarial review 4-agent đã chạy. **Chưa test live** — cần deploy Render + quét QR acc phụ + cấu hình OA. SSE: `web2:zalo:{accounts,messages,conv:<id>}`. zca-js KHÔNG chính thức → dùng acc phụ.

**Status:** ✅ Build xong (chờ deploy + cấu hình live).

### [live-chat] Fix kéo SP vào comment giật/lỗi + undo toast bị iframe FB live che ✅

**User:** "kéo sản phẩm vào comment lâu lâu bị lỗi với không mướt → warning hoàn tác bị iframe che".

**Root cause:**

1. **Giật + lâu lâu lỗi (drop trượt/sai dòng):** khi đang live, comment mới về liên tục → `LiveCommentList.renderComments()`/`prependComments()` churn DOM ngay giữa lúc kéo: `_patchRowsChunked` `old.replaceWith(neo)`, `renderCommentsNow` `innerHTML=''`, prepend `rowEl.outerHTML`. Dòng đích dưới con trỏ bị thay/xoá → drop rơi vào khoảng trống (`if(!row)return` im lặng) hoặc nhầm dòng khác; đồng thời churn DOM = giật. **Không có guard nào cho thao tác kéo.**
2. **Undo toast bị iframe che:** undo toast `z-index:10000` ở `bottom:24px;right:24px`, trong khi floating FB live iframe (`live-livestream-snap.js:1688`) `z-index:99000` ở `bottom:8px;right:8px` (200×356px) → cùng góc dưới-phải + z-index thấp hơn → nút "Hoàn tác" bị video đè.

**Fix:**

1. Cờ `LiveState._dragActive`: inventory-panel bật khi `dragstart` (card SP), tắt khi `dragend` (+ belt-and-suspenders ở document dragend). comment-list HOÃN mọi re-render khi cờ bật — `_renderDispatch` set `_renderDeferred`; `prependComments` buffer comment SSE vào `_dragDeferredPrepend`; 2 chunk-loop (`_patchRowsChunked`/`renderCommentsNow`) tạm dừng (poll 150ms). `dragend` (listener document bind 1 lần) → `_flushDeferredAfterDrag()` xả: replay prepend đã buffer + render lại. Drop target ổn định suốt thao tác kéo → hết trượt/sai dòng + hết giật.
2. CSS: base `.inv-toast` z-index 10000 → **99600** (trên iframe 99000 + snap chip 99500, dưới snap modal 99998+). Undo toast `.inv-toast-undo` dời ra **giữa-dưới** (`left:50%;transform:translateX(-50%)` + keyframe `invToastUndoSlide`) — khai báo SAU base để thắng source-order — tránh hẳn vùng video góc phải. Bump asset version `?v=20260613f` → `g`.

**Verify (browser session + extension):** drag defer/flush PASS toàn bộ qua eval — `afterDispatch_deferred:true`, `buffered:1`, `stateUnchanged_duringDrag:true`, `afterFlush_dragActive:false/renderDeferred:false/bufferNull:true`, `dragEndHandlerWired:true`. CSS: undo toast `centered:true` (rectCenterX 720 === viewport center), `zIndex:99600`, `transform:translateX(-50%)`. 0 page error.

**Files:** [live-chat/js/pancake/inventory-panel.js](../live-chat/js/pancake/inventory-panel.js), [live-chat/js/live/live-comment-list.js](../live-chat/js/live/live-comment-list.js), [live-chat/css/inventory-panel.css](../live-chat/css/inventory-panel.css), [live-chat/index.html](../live-chat/index.html).

**Status:** ✅ Done.

### [delivery-report] Fix nút "Gửi Kèm" không ẩn khi tắt tra soát ✅

**User:** nút Gửi Kèm ban đầu ẩn, bật tra soát + bấm tiêu đề 3 lần thì hiện (cùng tab Thành phố/Tỉnh), nhưng tắt tra soát thì Gửi Kèm vẫn hiện luôn thay vì ẩn lại cùng các tab.

**Nguyên nhân:** triple-click set `drBtnSendAlong.style.display=''` (delivery-report.js:184-186) nhưng nhánh exit của `traSoat()` chỉ ẩn `drTraSoatBar` (chứa tab Thành phố/Tỉnh), không reset nút Gửi Kèm.

**Fix:** nhánh exit `traSoat()` thêm `drBtnSendAlong.style.display='none'` để ẩn lại cùng tab khi tắt tra soát. Bump `delivery-report.js?v=20260613d`.

**Files:** [delivery-report/js/delivery-report.js](../delivery-report/js/delivery-report.js), [delivery-report/index.html](../delivery-report/index.html).

**Status:** ✅ Done.

### [docs] Nghiên cứu + plan tích hợp Zalo cho Web 2.0 (chưa code) ✅

**User:** "Tìm github các phần liên quan zalo đọc hiểu tất cả để coi có thể phát triển gì cho web 2.0" → chọn cả 3 đợt + nguyên tắc: **tạo 1 trang Zalo duy nhất quản lý, các trang khác tham chiếu tới — chỉ có 1 nguồn Zalo**; chỉ cần báo cáo, chưa code.

**Nghiên cứu GitHub:** lib lõi `RFS-ADRENO/zca-js` (516★, npm, v2.1.2 3/2026 — "Pancake cho Zalo", điều khiển acc cá nhân qua WS listener); CRM blueprint `locphamnguyen/ZaloCRM` (146★, pipeline+lead-scoring+webhook); pattern relay `diendh/zca-bridge` (giống `live-chat/server`); `deplao-builder`. Kênh chính thức: ZNS (~200đ/tin template, gửi mọi SĐT, an toàn) + OA chat.

**Phát hiện:** n2store đã có ~90% hạ tầng — zca-js map 1-1 với Pancake (relay WS, web2_customers.phone là khoá Zalo, msg-send job/worker, SSE bridge); Zalo KHÔNG có rule 24h như FB.

**Thiết kế:** kiến trúc "Trang Zalo = nguồn duy nhất" (`web2/zalo/` + `/api/web2-zalo/*` + bảng `web2_zalo_*` pool web2Db + SSE `web2:zalo:*` + helper chung `Web2Zalo` kiểu `Web2WalletBalance.attachBalances`) — trang khác chỉ gọi helper/API, không chạm Zalo trực tiếp. Lộ trình 3 đợt: 🟢 ZNS thông báo đơn (làm trước, an toàn) → 🟡 chat 2 chiều zca-js (acc phụ + proxy) → 🔵 CRM nâng cao.

**Files:** MỚI [docs/web2/ZALO-INTEGRATION.md](web2/ZALO-INTEGRATION.md) (research + kiến trúc + lộ trình + checklist + rủi ro).

**Status:** ✅ Done (research/plan — chờ user duyệt đợt để code).

### [products] Fix tem QR: tên SP bẻ GIỮA từ ("ÁO KHOÁC DÙ" → "KHOÁ"+"C") — wrap theo space + auto fit ✅

**User:** "thông minh mấy space đi → ví dụ 'ÁO KHOÁC DÙ' nhưng hình bị xuống hàng chữ C".

**Root cause** (module dùng chung `web2-products-print.js`, verified lines 832-840 + fitName 1189-1200): cả 2 style tên (`nameStyle`, `nameStyleQr`) mở đầu bằng `word-wrap:break-word` → khi 1 token rộng hơn cột chữ QR (~10mm) thì bẻ GIỮA từ (KHOÁC→KHOÁ+C). `fitName` chỉ thu nhỏ khi tràn CHIỀU CAO, không xét chiều ngang → text bẻ-giữa-từ vẫn vừa 3 dòng → fitName không kích hoạt → split vĩnh viễn.

**Fix** (hybrid, qua workflow 6-agent: 3 lens strategy + 2 audit + synth):

1. CSS: thay `word-wrap:break-word` → `overflow-wrap:normal;word-break:keep-all` ở CẢ nameStyle + nameStyleQr → chỉ wrap tại khoảng trắng (ÁO / KHOÁC / DÙ), không bẻ giữa từ.
2. JS `fitName`: thu nhỏ font khi tràn CHIỀU CAO **HOẶC CHIỀU NGANG** (`scrollWidth>clientWidth`) → token rộng nhất luôn vừa cột (không bị cắt cụt). Sàn `MIN_FS=6`. Cứu cánh cuối: token bệnh lý không-khoảng-trắng vẫn rộng hơn cột ở 6px → bật `overflow-wrap:anywhere` rồi chạy lại pass chiều cao (bẻ còn hơn cắt mép phải).

**Files:** [web2/products/js/web2-products-print.js](../web2/products/js/web2-products-print.js); bump `?v=20260613wrap` ở [web2/products/index.html](../web2/products/index.html) + [so-order/index.html](../so-order/index.html).

**Verify (Playwright live, so-order, 4 ca):** `ÁO KHOÁC DÙ`→3 dòng từ nguyên (fs 10.5, wide=false); `ÁO KHOÁC DẠ TWEED LÓT LÔNG`→fit 3 dòng fs 7; `NGUYỄN`→1 dòng; `AOKHOACDUMAUDENSIEUNHE` (không space)→fallback `anywhere/break-word` fs 6, KHÔNG cắt. Screenshot xác nhận.

**Status:** ✅ Done.

### [orders-report] [render] Fix chat lỗi 102: Web 1.0 đọc được Pancake JWT mà Web 2.0 đã lưu (X-API-Key trust) ✅

**User:** chat Web 1.0 (`orders-report/main.html`) lỗi "Chưa tải được danh sách trang Pancake — Mã lỗi Pancake: 102", acc không tự gia hạn / không lấy được JWT. Web 2.0 (`web2/pancake-settings`) luôn tự renew và có sẵn token. Muốn Web 1.0 lấy chính token Web 2.0 đã lưu mà KHÔNG ảnh hưởng tính năng có sẵn của cả 2 layer.

- **Root cause (verify bằng probe prod):** `WEB2_AUTH_ENFORCE` đang BẬT trên prod → `GET /api/pancake-accounts` **strip token** cho caller chưa authed. Commit ENFORCE-PREP (2026-06-12) wire `x-web2-token` (đọc localStorage `web2_auth`) vào Web1 token-manager, NHƯNG Web1 KHÔNG bao giờ ghi `web2_auth` (chỉ `web2/shared/web2-auth.js` ghi) → user chưa login Web 2.0 cùng browser → header rỗng → token bị strip. Probe: `worker /api/pancake-accounts?active=true` → 6 accounts nhưng `withTokenField=0` (token rỗng), `has_token=6`. Web1 `loadAccounts` line 358 `if(!acc.token) continue` skip sạch → no JWT → 102. (Priority-0 `/api/auth/token/pancake` KHÔNG được worker route — 404 — nên không cứu được.)
- **Fix B (un-breaker — additive, không siết path web2-token):** `CLIENT_API_KEY` (X-API-Key, đã được trust phát Pancake JWT qua `/api/auth/token/pancake`) thành credential authed hợp lệ cho `/api/pancake-accounts`.
    - `render.com/routes/pancake-accounts.js`: thêm `_hasClientApiKey(req)` → vào `_isAuthed` + `_softAuth` (chỉ thêm nhánh OR; Web 2.0 web2-token không đổi).
    - **File LIVE là `shared/js/pancake-token-manager.js`** (orders-report/inbox/... load qua `../shared/js/...?v=`; bản `orders-report/js/managers/pancake-token-manager.js` đã migrate đi, KHÔNG còn HTML nào load — vẫn sync edit cho khỏi lệch). `_web2AuthHeaders()` gắn thêm `X-API-Key = _CLIENT_API_KEY` (cả 2 call site `loadAccounts` + `getTokenFromFirestore` tự nhận). Bump `?v=20260612en`→`20260613pk` trên 5 HTML load file shared: tab1-orders, tab-kpi-commission (orders-report) + facebook-services, don-inbox, invoice-compare. Worker `handleRenderFallbackProxy` forward đủ header (chỉ xoá host/cf-\*) → key tới Render. Key khớp `CLIENT_API_KEY` env (probe direct host 200, không 401).
- **Fix A (defensive backend hardening):** `render.com/services/auth-token-store.js` `getToken('pancake')` — khi `auth_token_cache` rỗng/hết hạn thì fallback đọc token tươi nhất còn hạn từ `pancake_accounts` (read-only, pancake-only guard, never throw). Hiện cache còn tươi (exp 2026-09-08) + endpoint không qua worker nên chưa kích hoạt cho Web1, nhưng đúng & an toàn cho mọi caller gọi trực tiếp n2store-fallback + future-proof. Không đụng provider TPOS / realtime / Web 2.0 (consumer duy nhất là `/api/auth/token/:provider`).
- **⚠ PIVOT CORS (verify Playwright live):** header tuỳ biến `X-API-Key` từ browser bị **CORS preflight của Cloudflare worker chặn** (`Failed to fetch`) → `loadAccounts` rớt → 0 account (chat vẫn vỡ). `x-web2-token` qua được vì worker đã allow header đó. Fix lại: **dùng QUERY PARAM `?client_key=<KEY>`** (simple request, không preflight) thay vì header.
    - `shared/js/pancake-token-manager.js`: bỏ `X-API-Key` header trong `_web2AuthHeaders`; thêm helper `_ckUrl()` append `?client_key=` cho 3 call site (`?active=true`, `/sync`, `DELETE /:id`). Bump 5 HTML `?v=20260613pk`→`pk2`.
    - `render.com/routes/pancake-accounts.js` `_hasClientApiKey`: đọc cả `req.headers['x-api-key']` LẪN `req.query.client_key` (header cho node/server-to-server; query cho browser). Key vốn public ở page source nên query-param không tăng rủi ro.
    - Note: bản `shared/browser/pancake-token-manager.js` (ESM) KHÔNG gọi `/api/pancake-accounts` (token source khác) → không cần sửa. Active instance ở tab1-orders là `shared/js`.
- **Không** đụng `web2/`, không migration, không bảng mới, không đụng cron Web 2.0.

**Status:** ✅ Done — verify Playwright live: với `web2_auth` rỗng (đúng cảnh user), `getToken()` trả JWT thật qua `?client_key`; no-key vẫn strip (enforce intact).

### [web2] Kho SP: ẩn cột "ĐANG DÙNG" + drawer chi tiết SP (4 tab) ✅

**User:** "1/ Ẩn cột đang dùng. 2/ Bấm vào sản phẩm expand ra chi tiết tất cả về SP có nhiều tab: NCC nào, ở đơn hàng nào, lịch sử chỉnh sửa có tên user, chỉnh sửa chi tiết." → chọn **Drawer trượt phải** + **file riêng**.

**Files:**

- [web2/products/index.html](../web2/products/index.html): bỏ `<th>` ĐANG DÙNG; load `css/web2-product-detail.css` + `js/web2-product-detail.js`; bump app.js `?v=20260613det`.
- [web2/products/js/web2-products-app.js](../web2/products/js/web2-products-app.js): bỏ `<td class="usage-cell">` khỏi `_rowHtml`; colspan 12→11; export thêm `getProduct`/`getUsage`/`PROXY_BASE` cho module detail. (`_loadUsageForCurrentPage` giữ nguyên — vẫn prefetch usage vào STATE để tab "Đơn hàng" đọc tức thì; `if(cell)` guard nên td đã bỏ không lỗi.)
- **MỚI** [web2/products/css/web2-product-detail.css](../web2/products/css/web2-product-detail.css) + [web2/products/js/web2-product-detail.js](../web2/products/js/web2-product-detail.js): `window.Web2ProductDetail`. Bấm row (ngoài nút thao tác/checkbox/badge) → drawer slide-in phải, 4 tab lazy-load:
    - **Tổng quan**: NCC/nguồn, biến thể+tồn (màu cảnh báo <5/=0), trạng thái pill, giá mua/bán, ghi chú, in tem/copy.
    - **Đơn hàng**: reuse usage (`getUsage` → fallback `Web2ProductsApi.usage`), gom theo chiến dịch, link sang native-orders; badge số đơn trên tab.
    - **Lịch sử**: fetch `/api/web2-products/:code/history`, timeline action+user+diff field (GMT+7).
    - **Sửa**: form inline (name/giá mua/giá bán/tồn/trạng thái/ghi chú) → **chỉ PATCH field thay đổi** (diff vs bản gốc) tránh đụng `stock` SP pending (server chặn 409 khi stock<pending_qty); nút ⚙ mở form đầy đủ (ảnh/biến thể/mã/NCC).
    - Anti-lag: transform/opacity, overscroll contain, ESC + click overlay đóng, lock scroll `.main-content`.

**Verify (Playwright live localhost + ext):** cột ĐANG DÙNG biến mất (headers còn 10); bấm row → drawer mở, 4 tab đúng; Tổng quan hiện NCC=HÀ NỘI/biến thể/giá/trạng thái; Đơn hàng + Lịch sử render empty-state đúng; **Sửa note → lưu**: note persist + history ghi `update` changes=[note] (user "(ẩn danh)" do session test thiếu Web2Auth — fallback đúng); đổi chỉ note KHÔNG còn 409 (diff payload bỏ stock). 0 lỗi console.

**Status:** ✅ Done.

### [products] Fix tem QR: giá DÀI bị cắt mất số — auto thu nhỏ cho vừa cột ✅

**User:** "tem sản phẩm giá bị mất" (giá `1.081.500` in ra cụt còn `1.081.5(`).

**Context:** Layout QR (`web2-products-print.js` nhánh `isQr`) đặt giá trong cột chữ phải `.ql-text` (`overflow:hidden`) ở 1 dòng `white-space:nowrap`. `fitText()` chỉ auto thu nhỏ `.ql-qr-variant` + `.ql-qr-code`, KHÔNG đụng giá → giá dài tràn bề ngang cột → bị cắt. Lỗi nằm ở module DÙNG CHUNG nên cả Kho SP lẫn so-order đều dính.

**Files:**

- [web2/products/js/web2-products-print.js](../web2/products/js/web2-products-print.js): wrapper giá thêm class `ql-qr-price`; thêm `.ql-qr-price` vào selector `fitText()` (giảm font 0.5px tới khi `scrollWidth<=clientWidth`, min 3.5px) → giá tự thu nhỏ vừa cột.
- [web2/products/index.html](../web2/products/index.html) + [so-order/index.html](../so-order/index.html): bump cache-bust `?v=20260613price`.

**Verify (Playwright live, so-order):** in tem SP `XSAMM` giá `1.081.500` biến thể `Xám / S` → `.ql-qr-price` text đầy đủ `1.081.500`, fontSize tự co `8.5px`, `scrollW(39)==clientW(39)` overflow=false. Screenshot xác nhận giá hiện đủ.

**Status:** ✅ Done.

### [so-order] [web2] Prefix mã SP lấy theo TAB Sổ Order (không phải cột NCC) ✅

**User:** "không phải NCC mà lấy ở hình 1 theo tab → còn tạo ở kho thì cho chọn theo tab hình 1 luôn, không chọn thì ghi KHO."

**Context:** prefix mã SP (vd `HC` trong `HCAO`) trước lấy từ cột NCC per-row (`it.supplier` / `#pmSupplier` mix cả NCC). Quy ước đúng của shop: prefix lấy theo **tab Sổ Order** (`HÀ NỘI`→HN / `HƯƠNG CHÂU`→HC). Engine [web2/shared/web2-product-code.js](../web2/shared/web2-product-code.js) giữ nguyên (generic theo `supplierName`) — chỉ đổi nguồn đưa vào ở 2 caller.

**Files:**

- [so-order/js/so-order-app.js](../so-order/js/so-order-app.js) `_assignKhoCodes`: bỏ gom NCC từ `Web2SuppliersCache` + `it.supplier`; build `supplierPrefixMap` từ `state.tabs[*].label`; mọi SP của lô dùng `activeTabLabel` (= `getActiveTab(state).label`) làm prefix; tab rỗng → `KHO`.
- [web2/products/js/web2-products-app.js](../web2/products/js/web2-products-app.js): `loadSuppliersFromSoOrder` chỉ trả `tabs[*].label` (bỏ scan `rows[*].supplier`); dropdown wording "Chọn tab Sổ Order"; **fix** `openCreate` set `pmSupplier='KHO'` SAU khi `populateSupplierDropdown()` async resolve (trước đó set trước → option KHO chưa tồn tại → value rớt "").
- [web2/products/index.html](../web2/products/index.html): option tĩnh "— Chọn tab Sổ Order —".

**Verify (Playwright live localhost + extension):**

- Engine unit: `HƯƠNG CHÂU/ÁO…`→`HCAO`, `HÀ NỘI/QUẦN ĐỎ SIZE 32`→`HNQUANDOS32`, no-tab/`ĐẦM HỒNG`→`KHODAMHONG`.
- Kho SP: dropdown = `KHO`/`HÀ NỘI`/`HƯƠNG CHÂU`, default **KHO**; chọn HƯƠNG CHÂU + "ÁO ĐỎ SIZE 32" → suggest `HCAO5DOS32` (hint prefix=HC).
- so-order: load 0 lỗi console, `state.tabs`=[HÀ NỘI, HƯƠNG CHÂU], engine sẵn sàng.

**Status:** ✅ Done.

### [render] [web2] TC-cụm ĐÓNG — lookup KH theo SĐT phụ (alt_phones) ✅

**User:** "continue" — dọn nốt TC-cụm.

- **Bug:** tra cứu KH bằng số là **SĐT phụ** (`alt_phones` JSONB) không ra — `/list`, `/search`, `/batch-by-phone` chỉ match cột `phone` chính. Số phụ lưu khi merge KH / harvest comment trùng số → lookup trượt.
- **Fix** (`render.com/routes/v2/web2-customers.js`): `/list` + `/search` thêm `OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(alt_phones,'[]'::jsonb)) ap WHERE ap ILIKE $i)`; `/batch-by-phone` (path enricher nóng) dùng `alt_phones ?| $1` (indexable) + map kết quả về đúng số phụ được hỏi (phone chính ưu tiên hơn alt khi 1 số là chính của KH khác).
- **Index** (`render.com/db/web2-customers-schema.js`): thêm GIN `idx_web2_customers_alt_phones ON web2_customers USING gin (alt_phones)` (idempotent, chạy lần boot) → `?|` không seq-scan 64k rows.
- **performedBy/verifiedBy:** xác nhận đã đóng từ ENFORCE-PREP — route ví ưu tiên `req.web2User` (token), fallback `'(staff)'` (không còn `'admin'`); ck-assign-picker gửi `verifiedBy` + token.

→ **TC-cụm trong WEB2-PAGES-ANALYSIS.md flip 🟨→✅.**

### [so-order] In tem SP dùng CHUNG nguồn với Kho SP (web2/products) ✅

**User:** "in tem sản phẩm chưa giống bên products → chuyển về dùng chung nguồn với products".

**Context:** Nút "In tem" trong panel Nhận hàng (`soReceivePrintBtn` → `printLabelsFromReceivePanel` → `openBarcodePrintModal`) ĐÃ delegate sang `Web2ProductsPrint.open()`. Nhưng so-order/index.html chỉ load `web2-products-print.js`, **THIẾU 2 dependency** `web2-printer.js` + `web2-qr.js` mà trang products load trước đó. Hậu quả: `window.Web2QR`/`window.Web2Printer` undefined → tem QR rơi về fallback davidshimjs (biến thể KHÔNG bake vào giữa QR, vẽ overlay HTML thay thế) + bỏ routing máy in → khác hình bên products.

**Files:**

- [so-order/index.html](../so-order/index.html): thêm `../web2/shared/web2-printer.js?v=20260605i` + `../web2/shared/web2-qr.js?v=20260609c` TRƯỚC `web2-products-print.js`; bump print module `?v=20260610a`→`20260612esc` để dùng đúng asset như products.

**Verify (Playwright live localhost):** trên so-order, `typeof window.Web2QR==='object'`, `Web2QR.toDataUrl==='function'`, `Web2Printer==='object'`, `Web2ProductsPrint==='object'` — đủ y hệt trang Kho SP. In tem giờ ra QR bake biến thể + style rounded giống hệt products.

**Status:** ✅ Done.

### [chat] Toggle ẩn/hiện SP hết hàng (stock=0) trong panel Kho SP (live-chat) ✅

**User:** "cho toggle ẩn hiện stock = 0".

**Context:** Panel Kho SP (right rail live-chat) lấy đúng từ Web 2.0 products (`/api/web2-products/list`), nhưng cố tình lọc ẩn SP hết hàng (`stock<=0`). Khi kho chỉ có SP `CHO_MUA` (tồn 0) → panel rỗng "0 / 16 SP". Thêm toggle để user tự chọn.

**Files:**

- [inventory-panel.js](../live-chat/js/pancake/inventory-panel.js): thêm `STATE.showOutOfStock` (default tắt, persist `localStorage['web2_pancake_show_oos']`); gate điều kiện `stock<=0` trong `applyFilter` theo toggle; checkbox "Hiện SP hết hàng" trong stats bar + listener; card stock=0 thêm class `.oos`.
- [inventory-panel.css](../live-chat/css/inventory-panel.css): `.inv-stats` flex space-between, `.inv-oos-toggle`, `.inv-card.oos` (mờ + viền dashed, hover sáng lại).
- index.html: bump cache-bust `?v=20260613c`.

**Status:** ✅ Done — mặc định vẫn ẩn SP hết hàng như cũ; bật toggle thì 16 SP CHO_MUA hiện ra (làm mờ).

### [chat] Fix triệt để "Khách chưa có SĐT" giả — gốc là pages Pancake không load (token 102) ✅

**User:** "debug sửa triệt để lỗi này" — chat liên tục hiện "Khách chưa có SĐT trên 270136663390370".

**Debug live (Playwright + feval trong iframe tab1-orders):**

- Manh mối: page hiện ra **ID thô `270136663390370`** thay vì tên → `270136663390370` chính là **NhiJudy Store** (theo `n2store-extension/.../pancake-bump.js`). ID thô = `pdm.pages` rỗng lúc mở chat.
- Inspect: `pdm.pages=[]`, `pageIds=[]`, `_lastPageFetch=null` dù token có. Gọi raw `/api/pancake/pages` → **`{error_code:102, message:"Invalid access_token", success:false}`**.
- `fetchPages` chỉ retry token khi error_code **100/105**, KHÔNG xử lý **102** → trả `[]` âm thầm → pages rỗng → lookup conv thiếu ngữ cảnh page → trượt hết → hiện nhầm "Khách chưa có SĐT" (thực ra token Pancake hết hạn / pages chưa load).

**Fix (orders-report, Web 1.0 — additive, có điều kiện nên an toàn):**

1. [pancake-data-manager.js](../orders-report/js/managers/pancake-data-manager.js) `fetchPages`: gộp **102** vào nhánh retry-với-token-mới (cùng 100/105); khi vẫn fail → set `this.pagesLoadError = {code,message,at}` để caller phân biệt "không tải được page" vs "không có conv".
2. [tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js):
    - **Self-heal** đầu `_doFindAndLoadConversation`: nếu `pdm.pages` rỗng → `await pdm.fetchPages(true)` 1 lần (sửa race mở chat trước khi pages load xong).
    - Nhánh `!conv`: nếu pages vẫn rỗng → `_renderPagesNotLoadedState()` **"🔑 Chưa tải được danh sách trang Pancake — token hết hạn, Thử lại / tải lại trang"** (kèm mã lỗi), thay vì "Khách chưa có SĐT". Thứ tự: pages-rỗng → backend-down → phone-setter.
    - `_resolvePageName()` + `_KNOWN_PAGES` map (`270136663390370→NhiJudy Store`, `117267091364524→Nhi Judy House`) → KHÔNG bao giờ hiện ID thô nữa (dùng ở 3 chỗ pageName).

**Test live:** `openChatModal(...)` với pages rỗng (token 102 trên session test) → render đúng "🔑 Chưa tải được danh sách trang Pancake… token Pancake hết hạn…" + `pagesLoadError={code:102}` + có nút Thử lại ✅.

**⚠ Giới hạn:** token Pancake invalid (102) là nguyên nhân _thật_ khiến pages không load — fix này làm thông điệp ĐÚNG + tự thử lại + không hiện ID thô, NHƯNG để chat hoạt động lại hoàn toàn cần **token Pancake hợp lệ** (re-auth/refresh nguồn token). Test trên session localhost khôi phục từ secret (có thể cũ) nên trạng thái token có thể nặng hơn prod.

**Status:** ✅ Done (code). Cần xác nhận cơ chế refresh token Pancake để dứt điểm root.

### [orders] In PBH — "Người bán" theo "Tên hiển thị" của tài khoản TPOS đang dùng ✅

**User:** "Nút [In hàng loạt PBH] sẽ in lại theo tên người bán cập nhật theo [modal Tài khoản TPOS, ô Tên hiển thị] → tên người bán ở bill." Chọn: dùng "Tên hiển thị" (label) account đang chọn làm tên Người bán; áp dụng CẢ batch lẫn in lẻ.

**Files:** [orders-report/js/utils/bill-service.js](../orders-report/js/utils/bill-service.js)

- Thêm helper `getActiveSellerName()` = `window.billTokenManager.getActiveLabel()` (= ô "Tên hiển thị" của account TPOS đang dùng) + `escapeBillHtml()`.
- **Custom/fallback bill** (`generateCustomBillHTML`): seller name ưu tiên `getActiveSellerName()` trước `authManager.displayName` / `User.Name`. Escape giá trị khi nhét HTML.
- **TPOS server-rendered bill** (`fetchTPOSBillHTML`): override text "Người bán" bằng regex (capture 3 nhóm: prefix `<strong>` + name + `</div>`), chạy TRƯỚC bước chèn STT nên STT vẫn match div mới. Cả 2 đường batch (`openCombinedTPOSPrintPopup`→`fetchTPOSBillHTML`, `openCombinedPrintPopup`→`generateCustomBillHTML`) + in lẻ (`fetchAndPrintTPOSBill`, `openPrintPopup`) tự kế thừa.

**Verify:** `node --check` pass · regex test (literal "á" + entity `&#225;`, có escape `<KT>`) override + chèn STT đúng thứ tự · **live** (browser session): `activeLabel="nvkt"` khớp modal; `generateCustomBillHTML(...)` render "Người bán: **nvkt**". Đổi "Tên hiển thị" → in ra tên mới.

### [render] [web2] Web 2.0 audit — đợt LOW (wallet emit post-commit + 3W6 sidebar admin-gating) ✅

**User:** "continue" — dọn tiếp backlog LOW/kiến trúc.

- **Wallet emit stale-read race** (`render.com/db/with-transaction.js` + `render.com/services/web2-wallet-service.js`): trước đây `processDeposit`/`processWithdraw` emit SSE ví bằng `process.nextTick` → bắn TRƯỚC khi outer `COMMIT` xong → client re-fetch đọc số dư cũ. Fix: thêm hàng đợi post-commit hook `client._afterCommit` trong `withTransaction` (flush SAU COMMIT thật, best-effort không chặn nhau) + helper `emitAfterCommit()` đẩy emit vào hook nếu client có queue, fallback `process.nextTick` cho client thô. Mọi caller wallet-service (web2-returns, fast-sale-orders) đều đi qua `withTransaction(pool, …)` nên đường hook là đường chính. Deploy `d5b84c1fd`.
- **3W6 sidebar admin-gating** (`web2/shared/web2-sidebar.js?v=20260613c`, 37 trang): `_isAdmin()` ƯU TIÊN role `Web2Auth.getStored().user.role` (hệ auth Web 2.0), chỉ fallback auth Web 1.0 (`loginindex_auth`/`userType`) khi chưa login web2 → hết trộn 2 hệ auth cho UI gating (server vẫn gate độc lập qua `requireWeb2Admin`). Đồng nhất `?v=` (trước phân mảnh 6 giá trị).
- **(Song song)** Re-fetch-on-reconnect bridge ✅ `d5b84c1fd` (synthetic event `resync` khi SSE nối lại → page re-fetch, hết "data cũ" sau deploy backend) — roadmap mục 8 đóng.

**Cập nhật:** WEB2-PAGES-ANALYSIS.md (TC wallet-nextTick ✅, 3W6 ✅, HT/roadmap #8 ✅) + overview #auditPages.

### [web2] [shared] SSE reload-on-reconnect — re-fetch sau khi nối lại (hết "data không sync" khi deploy backend) ✅

**User:** "implement reload-on-reconnect" (tiếp nối phân tích residual của fix CI deploy).

**Vấn đề:** Mỗi deploy backend = Render restart = mọi kết nối SSE đứt. [web2-sse-bridge.js](../web2/shared/web2-sse-bridge.js) ĐÃ có auto-reconnect (onerror backoff) + reopen-on-visibility, NHƯNG **thiếu reload sau khi nối lại**. SSE không replay event đã phát trong cửa sổ đứt → nếu user A mutate ngay sau khi server sống lại trong khi máy B còn backoff chưa nối → B miss event → UI B đứng yên (data cũ) tới khi có event kế hoặc tự F5. Đúng cảm giác "data không sync" khi deploy backend dày.

**Fix (chỉ 1 file `web2-sse-bridge.js`):** thêm `_dispatchResync()` bắn synthetic event `{eventType:'resync', data:null, resync:true}` tới mọi subscriber khi `connected` fire mà **là lần nối lại** (`everConnected===true`), KHÔNG phải connect đầu, và KHÔNG phải reopen do đổi topic (`suppressResyncOnce` set trong `_refreshConnectionForTopicChange`). Bắt được cả native EventSource auto-reconnect lẫn reconnect thủ công vì server gửi `connected` trên mọi kết nối mới.

**Tương thích consumer (audit 78 subscribe sites):** mọi callback dùng optional chaining (`msg?.data?.x`, `msg.data?.action`, `data = msg?.data || msg`) → `data:null` KHÔNG crash; page nào cũng reload trên resync (reconcile `_scheduleSseList`, variants `_scheduleRefresh`, wallet `loadAndRender`/`invalidate(null)`). Bump cache `?v=20260613b → 20260613c` trên cả 28 file load bridge.

**Verify:** `node --check` pass. Harness Node mock EventSource (`/tmp/sse-resync-test.js`): chuỗi `update , resync , update` = EXPECTED → **✅ PASS** (first-connect không bắn · drop+reconnect bắn resync · topic-change không bắn thừa).

### [ci] Sửa race condition deploy GitHub Actions (concurrency + paths-ignore + gỡ CF deploy đôi) ✅

**User:** "đang deploy quá nhiều, liên tục lên github/render/cloudflare — có hạn chế gì gây race condition hay bug không? → ok fix hoàn toàn và kiểm lại."

**Bug gốc phát hiện:**

- **Không có `concurrency` ở mọi workflow** → push A rồi push B liên tiếp (đúng pattern auto-commit + save-session) → 2 job deploy chạy song song; job chậm hoàn tất SAU đè **bản cũ** lên production. Race "deploy stale" kinh điển.
- **Cloudflare Worker deploy 2 lần song song**: `deploy.yml` (bước Deploy Worker) + `deploy-cloudflare-worker.yml` (paths filter) cùng chạy `wrangler deploy` khi push chạm `cloudflare-worker/**` → đua, version cuối bất định.
- **`deploy.yml` chạy MỌI push** (không paths-ignore) → commit docs/session-resume/markdown cũng full `npm ci` + `build:vite` + deploy Firebase. 1 task = 2 push = 2 deploy thừa.

**Fix:**

- `deploy.yml`: thêm `concurrency: deploy-firebase-${{ github.ref }}` + `cancel-in-progress: true`. Thêm `paths-ignore` (`docs/**`, `**.md`, `serect_dont_push.txt`, `render.com/**`, `cloudflare-worker/**`, `.github/**`). **Gỡ hẳn** 2 step Deploy Cloudflare Worker khỏi `deploy.yml`.
- `deploy-cloudflare-worker.yml`: thêm `concurrency: deploy-cloudflare-${{ github.ref }}` + `cancel-in-progress` (group KHÁC nên không hủy nhầm). Nguồn DUY NHẤT deploy Worker.
- `cleanup-cancelled-orders.yml`: thêm `concurrency` + `cancel-in-progress: false` (queue, không abort giữa lúc xóa).

**Verify (recheck, không còn bug):** 4 workflow valid YAML (pyyaml OK). Không còn dangling ref `worker_deploy`/`worker_changes`. `vite.config.js` đã exclude `render.com`/`cloudflare-worker`/`docs`/`shared` khỏi entry; grep xác nhận 0 import/asset frontend phụ thuộc 2 dir đó qua domain Firebase. `shared/**` KHÔNG ignore (Firebase `public:"."`). Push mixed (docs+code) vẫn deploy bình thường.

**Residual (ngoài tầm workflow file):** Render auto-deploy tự dedup bên Render (Build Filters đã áp); SSE rớt mỗi lần Render restart (client cần auto-reconnect + reload bù) — chưa sửa đợt này.

### [render] [web2] [shared] Web 2.0 audit vòng 3 — MEDIUM-cleanup đợt 2 (TM/TC/SP/HT/LC/BC) ✅

**User:** "continue / tiếp tục" — dọn nốt backlog MEDIUM/LOW mục 1C–1D của [WEB2-PAGES-ANALYSIS.md](web2/WEB2-PAGES-ANALYSIS.md).

**Commits:** `21da4b762` (fixes) + `d57969738` (xoá page-shell.js). Tất cả JS pass `node --check`.

- **TM (kpi.js + audit-log.js):** `/kpi` default-open → no-viewer + `WEB2_AUTH_ENFORCE=1` trả 401 (kpi-dashboard đã gửi `x-web2-token` nên an toàn) · `/backlog/:id/reclassify` gate `requireWeb2Admin` (0 frontend caller) · `/forecast` + `/actual` dead (chỉ comment stale ref) → gate `requireWeb2AuthSoft` + deprecate · audit-log 0 bảng → trả `warning` + `console.warn` thay vì empty im lặng.
- **TC (web2-customers.js merge + web2-wallet-isolation.js):** merge KH giữ phone phụ + union `alt_phones`/`alt_addresses`/`fb_psids` (primary thắng) + cảnh báo nếu secondary còn số dư ví · partial UNIQUE INDEX `idx_web2_wallet_tx_unique_manual` (reference_id,type) WHERE reference_type IN manual/balance_history (hết race nạp tay trùng).
- **SP (web2-variants-app.js):** double-render → reload đi DUY NHẤT qua SSE `web2:variants` debounce 600ms (bỏ reload từ cache-subscriber, giữ cache.init data nóng).
- **HT (web2-sse-bridge.js):** refocus reopen dùng `lastEventAt || lastConnectedAt` (chỉ reopen khi im lặng thật >60s) · `?v=` đồng nhất `20260613b` cho bridge trên 28 trang · **xoá `web2/shared/page-shell.js`** (dead, 0 trang dùng — page-builder `Web2Page` thay thế) + sửa docs UI-FIRST/CLAUDE.md.
- **LC (live-chat):** campaign limit 5000→1500 + warn/notify khi chạm cap · enricher `LiveKhoEnricher.reset()` clear Set khi đổi campaign · `_fetchLiveCommentDelta` guard return sớm khi đang xem campaign cha (`_origComments!=null`) → không advance cursor/prepend nhầm.
- **BC (printer-settings):** `.bat`/`.ps1` URL dùng `new URL('../../scripts/...', location.href)` thay `location.origin` → hết 404 trên GH Pages subpath.
- **ck-dashboard:** SSE `web2:payment-signals` debounce 550ms (trước burst 2-3 fetch tức thì).

**Cập nhật:** [WEB2-PAGES-ANALYSIS.md](web2/WEB2-PAGES-ANALYSIS.md) flip ⬜→✅/🟨 (TM/TC/SP/HT/BC/LC + roadmap mục 8,10) · [web2/overview/index.html](../web2/overview/index.html) #auditPages thêm li "MEDIUM-cleanup đợt 2".

### [render] [shared] [chat] Realtime banner báo Render/Cloudflare down + fix Build Filter + empty-state chat ✅

**User:** "khi nào server render, cloudflare bị lỗi thì hiện lên web theo realtime" + báo lỗi "Khách chưa có SĐT" lúc đang dùng bình thường.

**Chẩn đoán gốc:** lỗi "Khách chưa có SĐT" trong chat orders-report KHÔNG phải code chat lỗi (file không đổi từ 17/05). Render `n2store-fallback` để `autoDeploy=yes` + `buildFilter=None` → **MỌI** commit (kể cả `auto: session update`/RESUME của Stop hook, frontend, docs) đều build lại + restart server 3-5'. Trong cửa sổ restart, chat gọi `/api/v2/customers/by-phone` fail → lookup chain nuốt lỗi network → `conv=null` → hiện nhầm empty-state "chưa có SĐT".

**Fix #1 (gốc rễ) — Render Build Filter:** PATCH `srv-d4e5pd3gk3sc73bgv600` → `buildFilter.paths=["render.com/**"]`. Từ giờ commit frontend/docs/session KHÔNG restart server. Cần deploy backend mà commit không chạm `render.com/` → `POST /deploys` tay.

**Fix #2 — Banner monitor realtime** ([shared/js/service-health-monitor.js](../shared/js/service-health-monitor.js) mới): client ping Render `/health` + Cloudflare worker (GET self-answered tại edge) mỗi 25s (8s timeout, ngưỡng 2 fail liên tiếp tránh blip). Down → banner đỏ fixed top z-index 2147483000 "Mất kết nối: <dịch vụ> — đang thử lại…"; 5xx/503 → vàng "chập chờn"; recovered → toast xanh "Đã kết nối lại" rồi tự ẩn; `navigator.onLine=false` → "Mất kết nối mạng". Pause khi tab hidden, ping ngay khi focus lại. Lý do client-side polling: server chết thì không tự push được (SSE tắt theo). Auto-nạp idempotent qua [navigation-modern.js](../shared/js/navigation-modern.js) (Web1) + [web2-sidebar.js](../web2/shared/web2-sidebar.js) (Web2) + [shared-auth-manager.js](../shared/js/shared-auth-manager.js) (rộng nhất) → derive root từ src của chính script. Debug: `window.__n2ServiceHealthMonitor.check()`.

- **Test live (Playwright localhost + ext):** monitor load OK trên orders-report; patch fetch reject 2 dịch vụ → 2 tick → banner đỏ "⚠ Mất kết nối: Máy chủ (Render) + Cloudflare proxy — đang thử lại…" hiện (translateY(0), bg #dc2626) ✅; restore fetch → toast xanh "✓ Đã kết nối lại máy chủ" → auto-hide (translateY(-110%)) ✅.

**Fix #3 — Empty-state chat phân biệt backend-down vs chưa-map-SĐT** ([orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)): trong nhánh `!conv`, `_probeBackendReachable()` (đọc state monitor + fetch `/health` 4.5s) — nếu unreachable → `_renderBackendDownState()` "Mất kết nối máy chủ, có thể đang khởi động lại — Thử lại" thay vì "Khách chưa có SĐT". `window._chatRetryArgs` set sớm ở `openChatModal` để nút Thử lại luôn chạy.

**Lưu ý phân phối:** shared JS đổi nội dung nhưng `?v=` chưa bump (auto-bump hook chỉ cover `<folder>/js`), GH Pages `max-age=600` → tới user trong ~10' hoặc hard-refresh ngay.

**Status:** ✅ Done. Build Filter live ngay; banner/empty-state propagate sau deploy.

### [so-order] Fix SP tạo từ Sổ Order mất NCC → mã SP fallback KHO (bug có sẵn) ✅

**User:** điền ngẫu nhiên vào bảng cũng phải tạo sản phẩm ở products theo đúng logic.

- **Bug (pre-existing, không phải do generator):** `syncRowsToKho` đọc `r.supplier` từ `modalRow`, nhưng `_newModalRow` KHÔNG có field `supplier` (NCC nằm ở `sharedFields` — per-đơn, không per-dòng) → `supplier=null` → `_assignKhoCodes` rơi về prefix mặc định `KHO` cho MỌI SP (KHOAO, KHODAM…), supplier cột = None. Generator tạo nhiều data nên lộ rõ.
- **Fix:** `syncRowsToKho(rows, tab, orderSupplier)` — nhận NCC của đơn, `supplier: (r.supplier || orderSupplier || '').trim() || null`. Wire 3 call site trong `handleOrderSubmit` (create / edit / edit-shipment) truyền `sharedFields.supplier`. Fix CHUNG cho cả thao tác tay lẫn generator.
- **Test (Playwright localhost):** gen 4 đơn sau fix → 8 SP mới có mã prefix NCC đúng: `XSADAM` (XƯỞNG SỈ A→XSA), `HNAO/HNAO2/HNAO3` (HÀ NỘI→HN), `QCAO/QCMM/QCQUAN…` (QUẢNG CHÂU→QC), cột supplier điền đúng. (8 SP cũ giữ prefix KHO vì tạo trước fix.) Màu/size chỉ vào mã khi biến thể có trong Kho Biến Thể + shortCode — đúng logic web2-products. Bump `?v=20260613c`.

**Status:** ✅ Done.

### [so-order] 2 nút sinh dữ liệu ngẫu nhiên để test (toolbar + modal) ✅

**User:** thêm nhiều dữ liệu test → thêm nút tạo dữ liệu ngẫu nhiên ở bảng + nút điền dữ liệu ngẫu nhiên ở modal tạo đơn hàng.

- **Nút "Tạo data ngẫu nhiên"** (toolbar, cạnh "Tạo Đơn Hàng", `#soGenRandomBtn`): `prompt` hỏi số lượng → `generateRandomOrders(n)` loop: `openOrderModal(null)` → `fillModalRandom()` → batch unique → `requestSubmit()` → đi qua **đúng luồng `handleOrderSubmit`** (shipment dedup, invoiceGroupId, auto-create NCC vào Ví NCC, sync Kho SP tạo SP "CHỜ MUA") để giống thao tác tay 100%. await 320ms/đơn, disable nút khi chạy.
- **Nút "Điền ngẫu nhiên"** (modal Tạo Đơn Hàng, cạnh Hủy/Lưu, `#soModalFillRandomBtn`): `fillModalRandom()` điền supplier (pool 5 NCC) + ship metadata (batch/kiện/kg/HĐ/ETA) + 1-4 dòng SP ngẫu nhiên (tên/màu/size/SL/giá nhập/giá bán + **2 ảnh picsum/dòng**). Giá theo currency tab (VND nghìn / CNY nhỏ). Render ngay → thumbnail ảnh hiện liền.
- **Code**: block `_RAND`/`_rPick`/`_rInt`/`_rImg`/`_randomRow`/`fillModalRandom`/`generateRandomOrders` thêm trước `openOrderModal` trong [so-order-app.js](so-order/js/so-order-app.js); wire 2 nút trong init; HTML 2 nút + bump `?v=20260613b`.
- **Test (Playwright localhost):** modal fill → XƯỞNG SỈ A, 2 SP, total 12.754.000₫, 2 thumbnail/dòng ✅; Lưu → "Đã thêm 2 dòng + 2 SP CHỜ MUA" ✅; toolbar gen 4 đơn → "✓ Đã tạo 4 đơn", bảng 7→25 dòng ✅. Backend verify: `web2_products`=8 (linked CHỜ MUA, cross-page link), `web2_so_order` Firestore 7.403 bytes.

**Status:** ✅ Done.

### [web2] [render] MEDIUM-cleanup vòng 3 — đợt cuối (~16 mục: race/leak/UX/escape/firebase) ✅

**User:** "tiếp tục". 2 agent song song (`b21df92b5`) + server batch tự làm (`0661129d1`).

**Server (`0661129d1`):**

- from-comment 2 draft race: re-check draft DƯỚI advisory lock → request 2 merge vào draft của request 1 thay vì tạo đơn trùng.
- DELETE native-orders: chặn xoá đơn còn PBH active (409, kèm số PBH) trừ `?force=1` — hết PBH mồ côi.
- relay `realtime_credentials` fallback: load `LIKE 'pancake%'` (save dùng `pancake_<name>` → 0 match khi Firebase outage → relay 0 client im lặng).
- pbh-reports `/summary`: native/delivery/refund counts lọc theo `days` (cùng cutoff rolling) thay vì all-time.
- livestream-snapshots `_batchStatus`: sweep 10' xoá batch đã xong + cap 200 (memory leak chậm).
- so-order in-tem: `upsert-pending {resolveOnly:true}` mới — chỉ tra/tạo MÃ, KHÔNG cộng pending_qty (gốc H15 — in tem trước đây upsert qty gốc → pending ảo → confirm-purchase convert thành tồn ảo).
- live auto-snap: lọc `LiveHiddenCommenters.isHidden` (đồng bộ Force extract — hết phí capture comment shop).

**Agent (`b21df92b5`):**

- Gỡ Firebase compat SDK thừa: kpi ×2 (3 thẻ + firestore-compat ~470KB), services-dashboard/delivery-zone/printer-settings (2 thẻ + firebase-config) — verify 0 ref runtime.
- TC phone-norm: `normPhoneWeb2` strict (84→0, trả null nếu ≠10 số) áp /create /upsert /enrich-fb /PATCH; PATCH reject name rỗng + phone rác.
- CSV formula injection export công nợ NCC (prefix nháy đơn khi cell `= + - @`).
- page-builder saveModal chống double-submit; exportCsv ví KH filter vip/warning/bomb export từ data màn hình.

**Escape residual** (đã fix `8947639bb` từ trước — MD stale, nay đánh dấu ✅): variants-app/products-print 5 ký tự + cluster 4-ký-tự.

**Còn tồn (ít rủi ro, kiến trúc):** TC merge alt_phones/ví orphan + wallet nextTick + deposit unique index · SP pgString/variants double-render · TM kpi default-open/notifications cron/forecast-actual dead · BC printer .bat 404 + token plaintext/`?token=` · HT bridge refocus/churn + `?v=` fragment + page-shell dead · LC campaign-5000/enricher Set/sse-nhiễm · 3W6 sidebar \_isAdmin · manualSepayId wrap · so-order Firestore 1-doc.

**Status:** ✅ Done — phần lớn MEDIUM/LOW vòng 3 đã đóng. Tồn còn lại đều LOW/kiến trúc.

### [web2] [render] 🔒 BẬT WEB2_AUTH_ENFORCE=1 — auth Web 2.0 nay bắt buộc ✅

**User:** "bật enforce". ENFORCE-PREP commit `248532b73`, deploy `07f4a0e02` (live, env `WEB2_AUTH_ENFORCE=1`).

- **Wire token (~30 client file):** helper mới `Web2Auth.authHeaders(extra)` (web2-auth.js); file Web 1.0 (pancake-token-manager shared+orders-report, inbox-pancake-api) đọc inline `localStorage.web2_auth` (chung origin). 3 agent song song:
    - **live-chat/livestream:** live-api/live-init/campaign-manager (\_api)/livestream-snap (13 call sites)/pancake-chat-window upsert/livestream-poller poller-pages.
    - **tài chính/pages:** pbh-reports (report-revenue/delivery inline), dashboard-kpi, audit-log, notifications page, ck-review + ck-assign-picker, wallet-api deposit/withdraw, balance-history ×4 jsonFetch, customers-api, photo-studio cutout.
    - **pancake/NCC:** web2-pancake-accounts (\_json) + web2-chat-client, shared/js + orders-report pancake-token-manager (Web 1.0), inbox-pancake-api, quick-reply mutations, supplier-wallet-storage \_api, suppliers-cache ensure, purchase-refund fetchJson, native-orders upsert. Bump ?v=20260612en ~40 script tags.
- **Server-side:** không đổi (đã sẵn `requireWeb2AuthSoft` enforce theo env). Extension + internal server calls KHÔNG gọi HTTP route gated (function-call/relay-secret) — an toàn.
- **Verify prod (curl + browser):** gated GET/POST no-token→401, with-token→200; ungated GET (supplier-wallet/state, quick-replies, products/health, customers/list)→200; `/api/pancake-accounts` list strip token khi unauth (chỉ token_preview), trả full khi auth; **8 trang money** (dashboard/audit-log/notifications/report-revenue/customer-wallet/supplier-wallet/customers/native-orders) browser-load **0 × 401** với token inject. Env `WEB2_AUTH_ENFORCE=1` + `WEB2_REQUIRE_DB=1` đều xác nhận on.
- **⚠ Vận hành:** browser chưa login `web2/login` 1 lần → 401 thao tác ghi (token 30 ngày, localStorage chung origin nhijudy.store) — gồm cả đọc token Pancake ở trang Web 1.0 (orders-report/inbox). Rollback: PUT env `WEB2_AUTH_ENFORCE=0` + redeploy (~2-4 phút).

**Status:** ✅ Done — enforce live + verified. Hoàn tất TOÀN BỘ lộ trình vòng 3 (F/G/H/I/E + MEDIUM-sweep + GMT+7 + escape + 2 env enforce/require-db). Tồn còn lại: MEDIUM lẻ ít rủi ro (TC-cụm phone-norm, SP pgString, TM kpi-default-open/cron/firebase-compat, BC printer404/token-plaintext, HT bridge-refocus/page-shell, LC campaign-5000/enricher, 3W6, exportCsv ví KH).

### [delivery-report] Nút "Ảnh Thành Phố" auto-điền SL ĐƠN SHIP + THU VỀ vào Báo cáo (nhóm THÀNH PHỐ) ✅

**User:** bấm "Ảnh Thành Phố" → có data thu về (3 đơn: 1.899) → muốn modal Báo cáo auto điền SL ĐƠN SHIP + THU VỀ theo data có sẵn, vẫn chỉnh sửa lại được. (User chọn: nhóm **THÀNH PHỐ**, **chỉ điền khi ô trống**.)

- **Files:** `delivery-report/js/report.js`, `delivery-report/js/delivery-report.js`, `delivery-report/index.html`.
- **report.js** — thêm `autofillCityReturns(isoDate, returnCount, returnValue)` (export qua `window.DeliveryReportReport`): load override ngày đó từ server trước (biết ô trống/đã sửa tay), rồi set override nhóm `city` — `slShip ← returnCount`, `thuVe ← returnValue` (VND gross). **Mỗi field độc lập, CHỈ điền khi đang trống/0** (không đè giá trị user sửa tay). Modal đang mở → `scheduleRender()`. Persist qua API `/api/v2/delivery-assignments/overrides` sẵn có (SSE đồng bộ máy khác).
- **delivery-report.js** `copyHandoverImage()` — sau khi build canvas, tính `returnTotal = Σ CashOnDelivery(returnScanned)` + lấy `isoDate = filters.fromDate.slice(0,10)` → gọi `autofillCityReturns(isoDate, returnScanned.length, returnTotal)`. Mapping khớp ảnh: "N đơn: X" → SL ĐƠN SHIP = N, THU VỀ = X (gross, ví dụ 3 đơn → SL 3, THU VỀ 1.899.000).
- **Editable:** ô vẫn là input thường, user sửa lại bình thường; lần bấm sau nếu đã có giá trị → giữ nguyên.
- **Caption Telegram** thêm số đơn thu về: `📦 Bàn giao Thành phố {ngày} — {N} đơn · {M} thu về` (chỉ thêm ` · M thu về` khi M>0).
- **Bỏ clipboard cho nút "Ảnh Thành Phố"**: xóa `copyBlobToClipboard` ở nút TP — chỉ build ảnh → gửi Telegram → **gửi TG thành công thì `window.location.reload()`** (delay 600ms để hiện trạng thái "Đã gửi TG — đang tải lại..."). TG lỗi → alert, KHÔNG reload. Helper `copyBlobToClipboard` giữ lại vì nút TMT/NAP còn dùng. (Cache-bust theo global pass `?v=20260613d`.)
- Bump `?v=20260613a` (delivery-report.js + report.js). `node --check` cả 2 file OK.

**Status:** ✅ Done.

### [render][web2] Wipe data giao dịch Web 2.0 để test lại (giữ KH + data Pancake) ✅

**User:** xóa hết dữ liệu web 2.0 để test lại toàn bộ chức năng, chừa lại dữ liệu khách hàng + các dữ liệu fetch từ Pancake về.

- **Postgres (web2Db)** — `POST /api/admin/web2-data-reset {mode:'wipe', target:'web2-all', confirm:'YES-RESET'}` (direct n2store-fallback, x-admin-secret). Auto-backup `*_bak_20260613_1028` trước truncate. Wipe 21 bảng giao dịch: SP/đơn/PBH/refund/return/cart/KPI/match/msg-queue/intent/blacklist + **ví KH** (web2_customer_wallets, wallet_transactions, balance_history, payment_signals — "xóa tiền giữ KH" theo user chọn).
- **Supplier wallet (server ledger)** — `web2_supplier_ledger`/`web2_supplier_meta` KHÔNG nằm trong web2-all → xóa NCC "HÀ NỘI" qua `DELETE /api/web2-supplier-wallet/supplier/:name` (ledger 0, meta 1). Lý do PHẢI xóa: client re-import từ Firestore khi Postgres rỗng → nếu để Firestore còn data sẽ undo wipe.
- **Firestore** — script mới `render.com/scripts/web2-firestore-wipe.js` (firebase-admin, đọc creds qua env, KHÔNG hardcode) set EMPTY 4 doc: `web2_so_order/main` `{tabs:[],activeTabId:null}`, `web2_supplier_wallet/main` `{wallets:{}}`, `web2_suppliers/main` `{suppliers:[]}`, `web2_customer_wallet/main` `{wallets:{}}`. Set empty (KHÔNG delete doc) vì init Firestore-first chỉ override local khi doc tồn tại.
- **GIỮ NGUYÊN (verified):** `web2_customers` = **64,270 KH**, `web2_live_comments` (Pancake) = **5,627**, partner-customer/web2_records, config (variants/users/entities/qr). `web2_unread_messages:2` + `web2_balance_history:2` xuất hiện lại = data LIVE mới sau wipe (Pancake ingest/SePay), không phải sót.

**Status:** ✅ Done.

### [orders-report] Đơn gộp: STT hiển thị = các STT đã gộp nối " + " và đóng khung vuông ✅

**User:** đơn gộp thì STT sẽ là STT 2 đơn gộp cộng (vd `243 + 678`) và đóng khung vuông lại.

- **Helper `_buildSttDisplay(order)`** (tab1-table.js, cạnh `_buildGioTrongBadge`): tính STT hiển thị từ 2 nguồn — (1) đơn gộp THẬT trên TPOS có tag `GỘP X Y` → parse số từ tên tag (regex `/^gộp\s/i` + `\d+`); (2) đơn gộp ẢO (`performTableSearch`) → `AllSTTs` hoặc `SessionIndex` đã chứa `+`. ≥2 STT → bọc `<span class="stt-merged-box">X + Y</span>`; đơn thường giữ `<span>${SessionIndex}</span>`.
- **Wire**: ô `td[data-column="stt"]` thay `<span>${order.SessionIndex||''}</span>` → `${_buildSttDisplay(order)}`.
- **CSS** `.stt-merged-box` (tab1-orders.css): khung vuông `border:2px solid #2563eb` + radius 4px + bold + `inline-block`.
- **Test (Playwright localhost):** 5 case `_buildSttDisplay` đúng — tag `GỘP 243 678` (STT 678) → boxed `243 + 678`; lowercase `Gộp 100 200 678` → `100 + 200 + 678`; ảo `AllSTTs` → `243 + 678`; đơn thường `500` plain; rỗng plain. Computed style xác nhận border 2px solid blue + radius 4px + bold.

**Status:** ✅ Done.

### [orders-report] Bill PBH in ra: STT đơn gộp cũng nối " + " và đóng khung vuông ✅

**User:** trong bill PBH in ra phần STT cũng làm vậy (như bảng đơn).

- **Nguyên nhân:** `fetchTPOSBillHTML` (bill-service.js) tính STT chỉ từ `IsMerged`/`OriginalOrders`, **bỏ qua tag `GỘP X Y`** → đơn gộp THẬT trên TPOS (đơn lẻ có tag, không có OriginalOrders) rơi về `SessionIndex` đơn → in "STT: 678". Trong khi template fallback (`generateCustomBillHTML`) đã dùng `getMergedSttDisplay` đúng.
- **Fix bill-service.js:** `fetchTPOSBillHTML` dùng `getMergedSttDisplay(orderData)` (đã có sẵn, ưu tiên tag `GỘP X Y` → `IsMerged` → TAG XL flag `GOP_*` → fallback SessionIndex) → đơn gộp ra `243 + 678`. Thêm helper `formatBillStt(sttDisplay)`: chuỗi chứa `+` → bọc `<span>` viền đen `1.5px solid #000` + radius 3px + bold (khung vuông, viền đen cho in nhiệt). Áp cho cả 2 path: TPOS-fetched bill + template fallback (`<strong>STT:</strong> ${formatBillStt(sttDisplay)}`).
- **Test (Playwright localhost):** `getMergedSttDisplay({SessionIndex:678, Tags:[{Name:"GỘP 243 678"}]})` → `243 + 678`; đơn lẻ → `500`. Regex inject vào fragment "Người bán" → `<div><strong>STT:</strong> <span style="border:1.5px solid #000...">243 + 678</span></div>` ✅. Bump `?v=20260613a` (tab1-orders.html + tab-pending-delete.html).

**Status:** ✅ Done.

## 2026-06-12

### [web2] [tests] Browser smoke click-như-user-thật: modal Sửa + Lưu trên 35 trang menu Web 2.0 ✅

**User yêu cầu:** "Browser test bằng click như user thật các phần mở modal chỉnh sửa, modal lưu... ở tất cả các trang chi tiết trong thanh menu web 2.0".

- **Harness**: persistent Playwright session (extension) + HTTP API; mỗi trang: nav → hook console/pageerror + wrap fetch → click nút Sửa → detect modal → bấm Lưu (chỉ nút an toàn, không Xóa/Duyệt/Nạp/Rút/Gửi) → bắt mutation status. Report: `downloads/n2store-session/web2-modal-smoke-report.md`.
- **Kết quả: 0 lỗi console/page error trên cả 35 trang, 0 mutation 4xx/5xx.** 7 trang modal Sửa+Lưu OK (products, variants, customers, product-category, delivery-zone, supplier-debt, printer-settings — đều 200). PBH = view-only by design (modal Chi tiết OK); so-order = edit inline, đợt "Đã nhận" read-only đúng nghiệp vụ (app.js:776); 5 trang trống data; users/kpi/notifications trống vì browser test chưa login `web2_auth` (đúng hành vi sau đợt G).
- **3 false-positive của harness** (đã verify tay từng trang): modal `position:fixed` làm `offsetParent` check trượt (w2p-popup PBH); modal class `pm-overlay` không chứa "modal" (printer-settings); nút title chứa "sửa" nhưng là Lịch-sử/toggle (pbh-invoice, so-order).

**Status:** ✅ Done — không phát hiện bug mới.

### [orders-report] Gộp đơn trùng SĐT: fix miss tag "ĐÃ GỘP KHÔNG CHỐT" theo máy + progress UI trong modal ✅

**User:** có máy chạy gộp xong nhưng một số đơn nguồn KHÔNG được gắn tag "ĐÃ GỘP KHÔNG CHỐT"; không có thanh tiến trình theo dõi đang xử lý cụm nào.

- **Nguyên nhân gốc (4 lỗ hổng):** (R1) `resetOrderTagsForMerge`/`toggleOrderFlag`/`assignTTagToOrder` **silent-skip** khi `_isLoaded=false` — mà `loadProcessingTags()` hạ cờ ở ĐẦU MỖI reload; máy nào SSE rớt → polling 15s → cứ 15s có cửa sổ vài giây skip tag im lặng (giải thích "máy này bị máy kia không"); (R2) `assignTagXLAfterMerge` **luôn return success:true** kể cả mọi source fail (catch nuốt); (R3) reload in-flight clobber tag vừa gắn trong RAM; (R4) `saveProcessingTagToAPI` bỏ cuộc im lặng sau 3 retry.
- **Fix tab1-processing-tags.js:** `_hasLoadedOnce` — refresh KHÔNG hạ `_isLoaded` nữa (chỉ false trước first-load/sau clear) · `resetOrderTagsForMerge` chờ `_waitForPtagLoaded(10s)` rồi THROW nếu timeout (hết silent-skip) · `saveProcessingTagToAPI` thêm option `{critical:true}` → fail sau retry thì throw (merge path dùng) · expose `window.waitForProcessingTagsLoaded` + `pause/resumeProcessingTagReload` (mutex reload khi merge — pause set pending, resume chạy lại).
- **Fix tab1-merge.js:** `assignTagXLAfterMerge` gate chờ state + gom `failures[{stt,code,step,error}]` + **verify-after-write** (đọc lại subTag, retry 1 lần) + return trung thực · 2 flow (modal + bulk) bọc pause/resume trong try/finally · summary thêm category `🏷️ GẮN TAG LỖI` kèm STT · history Firestore append `tagSuccess/tagFailures` (saveMergeHistory trả docRef + `updateMergeHistoryTagResult`).
- **Progress UI (user chọn):** modal GIỮ MỞ khi gộp — progress bar tổng (i/N + SĐT + ✅⚠️❌) trên body + badge trạng thái từng cụm trên card (⬜Chờ→⏳Gộp SP→🏷️Gắn tag→✅/⚠️dang dở/🏷️⚠️tag lỗi/🔒/🔀/❌), khóa controls + chặn đóng + beforeunload guard khi đang chạy, cụm không chọn mờ đi, xong → nút "Đóng". Bulk flow (không modal) dùng toast update-in-place i/N. Markup `#mergeProgressBar` (tab1-orders.html) + CSS `merge-progress-*`/`merge-cluster-status` (tab1-orders.css, có rule `[hidden]` ép display:none). Bump `?v=20260612a` 3 file.
- **Test (localhost + Playwright, KHÔNG ghi API thật):** A1 cờ giữ true khi refresh ✅ · pause→reload deferred, resume→chạy lại ✅ · `resetOrderTagsForMerge` khi state chưa load → throw sau đúng 10s thay vì silent return ✅ · dry-run full flow 3 cụm stub (success/tag-fail/partial): badge chuyển state đúng, progress 100%, summary toast đủ 2 category, nút Đóng restore, pause/resume 1/1 ✅.

**Status:** ✅ Done.

### [delivery-report] Ảnh bàn giao v12: ảnh Thành phố không có thu về → bỏ hẳn cột THU VỀ (ảnh 1 cột) ✅

**User:** đơn thu về khi gửi ảnh kênh Thành phố nếu = 0 thì khỏi ghi luôn.

- `buildHandoverCanvas`: `hasReturn = returnCount > 0`; không có thu về → `W = MID (470)` (ảnh thu lại 1 cột như TMT/NAP), bỏ toàn bộ cột phải + vạch dọc (wrap `if (hasReturn)`, xoá nhánh "Không có món thu về"); `contentH = hasReturn ? max(leftH, rightH) : leftH`. Có thu về → 2 cột như cũ. Cache-bust `?v=20260612j`.
- **Test:** không thu về → ảnh 940×640 (1 cột, GIAO + 0đ + Tổng 3 đơn 13.103); có thu về → 2 cột nguyên vẹn (Tổng 4 đơn 14.033 = 13.103 + 930). Test stub luôn cả URL `delivery-report-telegram` (feature mới máy kia) — không bắn ảnh TEST vào nhóm thật.

**Status:** ✅ Done.

### [web2] [render] Bật WEB2_REQUIRE_DB=1 + MEDIUM-sweep (~25 fix) — đóng gần hết tồn vòng 3 ✅

**User:** "WEB2_REQUIRE_DB=1 và tiếp tục các phần khác". Commits `723d23fc8` + `a90ddc488` + `d9c3ba96b` (2 sweep bởi session song song — nội dung verify đủ).

- **ENV:** `WEB2_REQUIRE_DB=1` set qua Render API (PUT env-vars/KEY) + manual deploy → **live** — server giờ fail-fast exit(1) nếu WEB2_DATABASE_URL mất thay vì âm thầm ghi chatDb prod (3W7 active).
- **1D-reconcile-no-lock ✅:** 4 route `/pack /ship /deliver /cancel-pack` vào withTransaction + FOR UPDATE + whitelist (pack chỉ từ pending/picking/picked; ship/deliver chặn PBH cancel).
- **1D-refunds-old-flow KHAI TỬ ✅:** nút "Trả hàng" PBH → `../returns/index.html?prefillPhone=&prefillOrder=` (returns-app thêm prefill: auto pick KH + đơn + subType khong_nhan_hang); server `POST /api/refunds/from-pbh` → **410 Gone** (GET read-only giữ).
- **Atomicity (agent):** web2-users demote/delete admin-cuối gộp 1 câu atomic · purchase-refund `/refunded` transaction + whitelist + idempotent · dedicated-entity PATCH pattern H12 + DELETE 404 + `_ready`→WeakSet · variants `_tablesCreated`→WeakSet · upsert-pending exact-variant-match DESC · DELETE products 1 câu RETURNING \* · adjust-stock warning khi clamp · deductStock/restockStock rowCount=0 → throw rollback.
- **Hiển thị/UX (agent):** report-revenue card dùng `revenue.total` · hint mật khẩu 8 · users-app A5 đọc Web2Auth (bỏ authManager Web 1.0) · kpi-assignments overlap rule khớp server · monitor pause tab ẩn (setTimeout-chain) · ck-review dismiss check response + disable nút · pancake-settings placeholder "Đã lưu" · report-delivery swap from>to.
- **SSE/TC (tự làm):** S5-residual strip PII topic `web2:customer-wallet` · `/sse` cap 50 keys/connection · xoá dead topic `supplier-rating` · bridge nghe eventType `test` · auto-assign/auto-match/reprocess `_notifyBalanceHistory` · dashboard SSE debounce 600ms · customer-wallet: Bomb→`'Bom'`, phones 84 normalize, toast theo payload strip, aggregate+overlay trừ CTE `sepay_reassign_out` (hết đếm "đã thu" ×2 sau reassign).

**Status:** ✅ Done. Tồn còn lại (mục 1C/1D MD): TC-cụm (phone-norm paths, merge alt_phones, wallet nextTick, deposit unique index), SP pgString/variants-render, TM (kpi default-open, notifications cron, firebase compat), BC (printer 404, token plaintext), HT (bridge refocus/churn, ?v= fragment, page-shell), LC (campaign-5000, enricher, sse-nhiễm), 3W6, exportCsv ví KH, PATCH customers validate — và quyết định bật `WEB2_AUTH_ENFORCE=1`.

### [web2] Đợt escape — module shared + S6-residual + cluster 4-ký-tự ✅ (`8947639bb`)

- **`web2/shared/web2-escape.js` MỚI** — 1 nguồn `Web2Escape.{escapeHtml (5 ký tự), escJs, safeUrl, safeImageUrl}`. Trang mới load module này thay vì copy hàm (gốc S6 là copy-paste drift 3 thế hệ/15 file).
- **S6-residual:** `web2-variants-app.js` + `web2-products-print.js` bản DOM-based (textContent→innerHTML, KHÔNG escape quote — injectable trong attribute `value="..."`) → 5 ký tự.
- **Cluster 4-ký-tự:** thêm `.replace(/'/g,'&#39;')` vào balance-history ×4 file + purchase-refund-app + web2-history-timeline.
- Bump `?v=20260612esc` 4 trang. Cleanup TEST-NCC-SMOKE qua endpoint maintenance mới (`deleted: {ledger:2, meta:1}`, /state về `empty:true` — migration thật không bị chặn).

**Status:** ✅ Đợt GMT+7 + escape hoàn tất → toàn bộ các đợt named của vòng 3 (F/G/H/I/E/GMT+7+escape) ĐÓNG.

### [issue-tracking] [render] Cho phép "lượt trả bổ sung" trên đơn đã trả xong (Khách gửi/Thu về) ✅

**User:** đơn đã khách gửi & Hoàn Tất, hôm nay phát hiện thêm 1 món lỗi muốn đổi trả nhưng báo "đơn đã trả rồi không trả nữa". Đề xuất + làm: tạo phiếu MỚI độc lập + cơ chế cảnh báo/đánh dấu (không gộp/sửa phiếu cũ, không đụng ví/TPOS).

- **Nguyên nhân:** guard "1 đơn = 1 ticket hoàn hàng" (chống gian lận) lọc `status != 'CANCELLED'` ở **cả 2 tầng** → ticket COMPLETED vẫn bị chặn tạo phiếu mới.
- **Backend `render.com/routes/v2/tickets.js`** (guard RETURN, ~L449): đổi `status != 'CANCELLED'` → `status NOT IN ('CANCELLED','COMPLETED')`. Chỉ chặn khi đơn còn phiếu hoàn ĐANG XỬ LÝ (`PENDING_*`); phiếu cũ COMPLETED → cho tạo "trả bổ sung". Message lỗi cập nhật "xử lý dở". **Không đụng** guard BOOM/FIX_COD. Không migration (chỉ đổi điều kiện query).
- **Frontend `issue-tracking/js/script.js`:**
    - `checkExistingReturnTicket(orderId)` rewrite → 3 nhánh: `{blocking}` (còn phiếu PENDING\_\* → chặn cứng) / `{needsConfirm, completedTickets}` (mọi phiếu hoàn cũ COMPLETED → cần xác nhận) / `{exists:false}`.
    - Thêm modal promise-based `confirmSupplementaryReturn(completedTickets)` → liệt kê phiếu cũ (mã · loại · SL món · giá trị), **ô lý do bắt buộc** (≥3 ký tự mới bật nút), trả `{confirmed, reason}`. Tái dùng class CSS `custom-confirm-overlay`.
    - `handleSubmitTicket`: nhánh `blocking` → alert chặn; nhánh `needsConfirm` → await modal, hủy thì dừng, xác nhận thì chèn tiền tố `[TRẢ BỔ SUNG #<mã phiếu cũ>] <lý do>` vào `note` để lưu vết audit (không cần cột DB mới).
    - Bump `script.js?v=20260612a`.
- **Ví & TPOS giữ nguyên:** mỗi ticket cộng ví theo `compensation_amount` riêng (`reference_id = ticket_code`); resolve phiếu bổ sung → TPOS `alreadyRefunded=true` tự bỏ qua hoàn lần 2. Không sửa wallet-event-processor/resolve endpoint.
- **Test (Playwright, localhost, KHÔNG ghi DB thật):** node --check 2 file PASS · page load 0 lỗi từ code mới (4 error còn lại là backend local offline) · modal render đúng list + format tiền · OK khoá đến khi lý do ≥3 ký tự · Confirm → `{confirmed:true,reason}` · Cancel/Escape → `{confirmed:false}`, overlay gỡ sạch. Logic filter `checkExistingReturnTicket` verify qua đọc code (biến `TICKETS` là closure, không inject qua window được).

**Status:** ✅ Done. Lưu ý: backend cần redeploy Render để guard mới có hiệu lực.

### [delivery-report] Ẩn nút Gửi Kèm (hiện sau 3-click tiêu đề) + đổi tên "Copy ảnh bàn giao" → "Ảnh Thành Phố" ✅

**User:** nút Gửi Kèm cho ẩn đi, click 3 lần vào tiêu đề "Thống Kê Giao Hàng" mới thấy (như mấy nút ảnh); nút copy ảnh bàn giao ở tab Thành phố đổi tên thành "Ảnh Thành Phố".

- `index.html`: `#drBtnSendAlong` thêm `style="display:none"` (ẩn mặc định); nút `#drBtnCopyHandover` đổi label "Copy ảnh bàn giao" → "Ảnh Thành Phố" (reset innerHTML trong `copyHandoverImage` dùng innerHTML đã capture nên không cần sửa JS). Bump `delivery-report.js?v=20260612i`.
- `delivery-report.js` `setupTitleTripleClick`: khi đủ 3 click → `#drBtnSendAlong` `style.display=''` (đặt TRƯỚC nhánh lite-mode để hiện ở MỌI chế độ, không phụ thuộc traSoat/lite).
- **Test (Playwright):** load page → Gửi Kèm `display:none` (ẩn); click tiêu đề 3 lần → `display:flex` (hiện); nút tab Thành phố hiển thị "Ảnh Thành Phố".

**Status:** ✅ Done.

### [web2] [render] Cluster GMT+7 (3H20 + revenue_7d + audit-log + 4 client fmt) + verify đợt I/E live ✅

**User:** "continue" sau đợt I+E. Code vào `6020700af` (bị auto-sweep bởi session song song — nội dung đủ).

- **3H20 `pbh-reports.js`:** mọi cast ngày → `(date_invoice AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` + `(NOW() AT TIME ZONE ...)::date` (17 chỗ) — "Doanh thu hôm nay" hết sai mỗi sáng trước 7h; `/delivery` default today theo VN (Intl en-CA).
- **`dashboard-kpi.js` revenue_7d** pin GMT+7 (đồng bộ revenue_today đã fix trước).
- **`audit-log.js`** filter from/to: nửa khoảng `[from, to+1)` pin Asia/Ho_Chi_Minh — hết lệch 7h + hết loại trọn ngày cuối.
- **Client:** supplier-debt helper `vnDate` thay 3 `toISOString().slice(0,10)` (giao dịch 00:00-07:00 VN hết rơi sai kỳ); page-builder `fmtTime` (shared — ăn mọi trang generic) + history-timeline + products modal Lịch sử + balance-history `fmtTime` pin `timeZone: Asia/Ho_Chi_Minh`. Bump `?v=` products/balance-history/supplier-debt.
- **Maintenance mới:** `DELETE /api/web2-supplier-wallet/supplier/:name` gate `x-admin-secret=CLEANUP_SECRET` — dọn NCC TEST-/sửa data.
- **Verify đợt I+E trên prod (deploy live):** `/api/web2-quick-replies` auto-seed từ Web 1.0 OK · `/api/web2-supplier-wallet/state` `{empty:true}` đúng · smoke money path PASS: POST /tx sinh `PAY/2026/0001` (sequence), CÙNG txId lần 2 → `alreadyProcessed` (idempotent), return + `rowReturns` lưu qty/amount thật, /state aggregate đúng · batch-summary 3W3 shape OK. Data TEST- dọn qua endpoint maintenance mới sau deploy (Render PG chặn psql ngoài).

**Status:** ✅ GMT+7 cluster đóng toàn bộ. Vòng 3 chỉ còn: bật 2 env (WEB2_AUTH_ENFORCE, WEB2_REQUIRE_DB), module escape shared, MEDIUM lẻ.

### [delivery-report] [render] Gỡ 3 nút (Xuất excel ×2 + In) + nút "Copy ảnh bàn giao" gửi thêm vào nhóm Telegram ✅

**User yêu cầu:** (1) xóa 3 nút Xuất excel / Xuất excel chi tiết SP từng dòng / In; (2) nút "Copy ảnh bàn giao" (TP) ngoài copy clipboard còn gửi ảnh vào nhóm Telegram qua bot RIÊNG (không liên quan bot Telegram có sẵn), đặt tên có "delivery-report".

- **Files:** `delivery-report/index.html` (xóa 3 button, tooltip mới, bump `v=20260612i`), `delivery-report/js/delivery-report.js` (tách `canvasToBlob`/`copyBlobToClipboard`, thêm `sendHandoverImageToTelegram`, wire vào `copyHandoverImage`: copy clipboard trước → gửi TG sau, nút báo "Đã copy + gửi TG!" / alert nếu TG lỗi nhưng clipboard vẫn OK), route MỚI `render.com/routes/delivery-report-telegram.js` (Web 1.0 module — `GET /status`, `POST /send-photo` base64 PNG → Telegram `sendPhoto` multipart, rate-limit 30/min, max 9MB), mount `server.js` tại `/api/delivery-report-telegram`.
- **Env mới trên Render (n2store-fallback):** `DELIVERY_REPORT_TELEGRAM_BOT_TOKEN` + `DELIVERY_REPORT_TELEGRAM_CHAT_ID` — TÁCH BIỆT hoàn toàn `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ADMIN_CHAT_ID` của bot Gemini/alert cũ. Client gọi thẳng `n2store-fallback.onrender.com` (không qua CF worker — worker route theo whitelist path).
- **Hàm `exportExcel`/`printView` giữ nguyên trong JS** (dead code từ UI nhưng không xóa — dễ khôi phục nút nếu cần).
- **Verify:** node --check 3 file; mini-express smoke: `/status` → `configured:false`, `/send-photo` không env → 503 message rõ ràng.
- **Kích hoạt xong (cùng ngày):** bot `@delivery_n2bot` (DeliveryReport), group "Delivery" chat_id `-5344714256` (lấy qua getUpdates sau khi user add bot — lưu ý privacy mode: tin thường KHÔNG tới bot, chỉ `my_chat_member`/lệnh `/` mới thấy). 2 env set qua Render API `PUT /env-vars/{KEY}` + manual deploy `dep-d8lvgn4m0tmc73atavog`. E2E verified: `POST /send-photo` prod → ảnh vào group OK (messageId 5). ⚠ Bẫy: check `/status` NGAY khi deploy flip "live" có thể dính instance cũ đang drain → `configured:false` giả; chờ vài giây check lại.

**Status:** ✅ Done — live end-to-end.

### [web2] [render] FIX edit sản phẩm 500 — fast_sale_orders THIẾU cột updated_at ✅

**User báo:** "chỉnh sửa sản phẩm web2/products cũng bị lỗi". Repro browser: PATCH `/api/web2-products/HCMM2DEN` → 500 `column "updated_at" of relation "fast_sale_orders" does not exist`. Commit `42d4f0775`.

- **Root cause:** cascade snapshot SP→PBH (`web2-products.js` PATCH, thêm từ `8d89d1c06` 21/05) + migration 078 đều ghi `fast_sale_orders.updated_at` — cột **chưa từng tồn tại** trong schema PBH. Trước đây lỗi bị `console.warn` nuốt (edit "thành công" nhưng PBH không sync — bug ngầm); fix audit H13 (vòng 2) đổi cascade sang `throw` + rollback đúng đắn → lỗi schema lộ ra thành 500 thấy được. Hệ quả phụ: migration 078 fail mỗi boot → `_ensuredPools` không set → ensureTables chạy lại MỖI request (PATCH chậm 4-8s).
- **Fix:** `ALTER TABLE IF EXISTS fast_sale_orders ADD COLUMN IF NOT EXISTS updated_at BIGINT` idempotent ở **cả 2 ensureTables** (fast-sale-orders đầu file + web2-products ngay trước migration 078 — vì products PATCH có thể chạy trước mọi route PBH sau boot).
- **Verify:** migration test DB local (UPDATE cascade fail đúng y prod → ADD COLUMN → cascade OK + updated_at ghi đúng → re-run idempotent → DROP DB); browser E2E sau deploy.

**Status:** ✅ Done.

### [web2] [render] [worker] ĐỢT I (tách Web1 dứt điểm) + ĐỢT E (ví NCC server ledger) — vòng 3 ✅

**User:** "đợt I và đợt E". Commit chính `01cb771dd` (+ phần bị auto-sweep vào `7bb139d21`/`5ecfc792f` bởi session song song — nội dung đầy đủ trong HEAD). 2 route server MỚI + 30+ file client/server. 3 agent song song (3W2+3W3 / 3W4 / supplier-debt) + tự code server.

**Đợt I:**

- **3W1**: route mới `render.com/routes/web2-quick-replies.js` — bảng `web2_quick_replies` (web2Db), auto-seed one-time READ-ONLY từ `quick_replies` (Web 1.0) khi bảng rỗng, soft auth mutation, SSE `web2:quick-replies`; client `web2-quick-reply.js` đổi URL `/api/web2-quick-replies`; CF worker thêm route. **Hết cảnh xoá quick-reply ở trang beta mất luôn ở chat Web 1.0 prod.**
- **3W2**: `web2-msg-template.js` fork Firestore `message_templates` → `web2_message_templates` (one-time copy giữ doc id, legacy read-only).
- **3W3**: endpoint mới `POST /api/web2/wallets/batch-summary` (ví Web 2.0, shape tương thích bản Web 1.0) — debt-manager + pancake-api live-chat swap URL; `showPancakeCustomerInfo` lookup kho `web2_customers` (xoá 2 URL `/api/v2/customers`).
- **3W4**: gỡ `broadcastToClients` 17 block khỏi fast-sale-orders/native-orders/refunds/delivery-invoices (1 chỗ bù SSE `promoted-to-confirmed`); 5 trang bỏ PbhRealtime/rtConnect → Web2SSE (report-revenue thêm subscribe mới); `pbh-realtime.js` deprecated. **Đóng SO-ws-sse-double.** ⚠ `scripts/pbh-qa-test.js:402` còn assert WS — đổi sang SSE khi chạy QA.
- **3W7**: boot guard server.js — cảnh báo to khi web2Pool null (fallback chatDb prod) + env `WEB2_REQUIRE_DB=1` → fail-fast exit(1). Env CHƯA bật trên Render.

**Đợt E (ví NCC: Firestore client-write → server ledger):**

- Route mới `render.com/routes/web2-supplier-wallet.js`: `web2_supplier_ledger` (UNIQUE tx_id — idempotent), `web2_supplier_meta` (code/note/returned_row_ids qty-amount THẬT), sequence bút toán `PAY/<năm>/<seq>` (hết nextMoveName MAX+1 race), `GET /state` shape client cũ, `POST /tx` (transaction + lock meta), `POST /suppliers` (atomic ON CONFLICT — hết saveSupplier/Note RMW), `POST /import` one-time migration từ Firestore (server-guarded khi rỗng), SSE `web2:supplier-wallet`.
- `supplier-wallet-storage.js`: addTransaction = POST server (await, dual-base CÙNG txId), Sync.push deprecated no-op, bỏ purge 30d (server full audit), applyDeposits txId `tx-sepay-<sid>` (hết dup cross-machine), Sync.init auto-migration.
- `supplier-wallet-app.js`: confirmPay/confirmReturn await + catch lỗi server (hết fire-and-forget), rowReturns qty/amount thật, stock adjust ưu tiên `p.code` row so-order (E-match-ten), SSE `web2:supplier-wallet` re-pull ledger.
- `supplier-debt-app.js`: đọc `GET /state` (bỏ 2 Firestore doc reads — GIỮ `web2_so_order`), recordPayment POST /tx (server sinh moveName), saveSupplier/saveSupplierNote → POST /suppliers, SSE subscribe.
- `purchase-refund-app.js`: updateSupplierWallet await + txId=`tx-refund-<refundCode>` idempotent (caller đã có try/catch "phiếu OK + ví lỗi").
- `web2-suppliers-cache.js`: bỏ Firestore onSnapshot (3W5) → `GET /suppliers` + SSE; ensure() POST atomic.
- **Chừa có chủ đích** (ghi mục 1C/6 file MD): so-order Firestore 1-doc; hợp nhất UX 2 đường trả NCC; quick-refund server-atomic endpoint; 3W6 sidebar \_isAdmin.
- **Verify:** node --check toàn bộ; review tay diff money paths; chưa browser-test runtime (migration tự chạy lần đầu mở trang ví NCC/công nợ).

**Status:** ✅ Done — TOÀN BỘ lộ trình vòng 3 (đợt F+G+H+I+E) hoàn tất. Còn: bật `WEB2_AUTH_ENFORCE=1` (sau wire token raw fetch), `WEB2_REQUIRE_DB=1`, 3H20/GMT+7 cluster, vài MEDIUM 1D.

### [delivery-report] Ảnh bàn giao v11: fix đơn vị Gửi Kèm (nhập NGHÌN) + Tổng cộng gửi riêng + TMT/NAP có dòng Tổng ✅

**User báo** (test prod v10): giá trị/Thu gửi riêng hiện 0 dù modal có data; ảnh TMT/NAP thiếu dòng Tổng dưới cùng; Tổng chưa tính phần gửi riêng.

- **Root cause 0**: Gửi Kèm nhập đơn vị NGHÌN (gõ 300 = 300.000đ — quy ước giấy tay) nhưng canvas dùng `formatThousand` chia /1000 lần nữa → 0. Fix: helper `sendAlongThousand(v)` (giữ nguyên; lỡ nhập full đồng ≥ 10.000 → tự /1000), section gửi riêng tính + hiển thị bằng nghìn (`formatNumber`).
- **Tổng**: TP `grandTotal = cityNet + returnNet + extraNetK×1000`, `grandCount` cộng số đơn gửi riêng. TMT/NAP thêm footer `Tổng — N đơn: <Còn lại kênh + Còn lại gửi riêng>` (luôn hiện) + Tạo lúc cùng dòng.
- Cache-bust `?v=20260612h`.
- **Test:** TP gửi riêng 1 đơn (GT 300/Thu 200) → `200 − 20 = 180`, Tổng 3 đơn `1.860 = 750 + 930 + 180` ✓; TMT 2 đơn (Thu 100+150) → `250 − 46 = 204`, Tổng `946 = 742 + 204` ✓.

**Status:** ✅ Done.

### [live-chat] [render] [native-orders] GỠ HẲN crm_team_id — di tích TPOS ✅

**User hỏi "có cần crm_team_id không?"** → trace: không consumer nào đọc (getPartnerInfo bỏ qua tường minh, không UI hiển thị/filter); sau gỡ TPOS giá trị nhét vào = FB Page Id (trùng `fb_page_id`) — chính là thủ phạm bug drag-drop 500 sáng nay. User OK gỡ hẳn (thay vì giữ BIGINT).

- **Server:** migration đổi từ ALTER BIGINT → `DROP COLUMN IF EXISTS crm_team_id` (native_orders) + `crm_team_id`/`crm_team_name` (fast_sale_orders), đặt ĐẦU ensureTables, idempotent. Gỡ cột khỏi CREATE TABLE + 4 INSERT (from-comment, split, merge, PBH manual, from-native-order — renumber placeholder $N), COALESCE update path comment-merged, mapper response, PATCH field map, cart.js forward. `tpos-customer-service.js` (Web 1.0) GIỮ NGUYÊN.
- **Client:** inventory-panel `_resolveCommitContext` + fbContext, live-comment-list `createOrder`, web2-chat-client `enrichCustomer` (server enrich-fb vốn đã ignore), native-orders-app bỏ dòng crmTeamId panel FB context. `getPartnerInfo(crmTeamId, fbUserId)` → `getPartnerInfo(fbUserId)` + đơn giản `loadPartnerInfoForComments` (bỏ map userId→crmTeamId vô nghĩa); sửa luôn bug tiềm ẩn live-customer-panel throw "Không xác định được CRM Team ID" khi page thiếu `.Id`.
- **Deploy-compat 2 chiều:** client mới + server cũ → field absent → lưu null (OK); client cũ + server mới → field bị bỏ qua (OK).
- **Verify:** migration test DB local (DROP có cột OK → re-run idempotent skip → INSERT không cột OK → DROP DB); node --check 11 file; bump `?v=20260612i`. Verify online sau deploy: from-comment OK không crmTeamId, mapper response sạch field, PBH load sạch `crmTeam`.
- **BONUS phát hiện khi E2E:** `attachDropTargets()` KHÔNG có guard 1-lần (khác `attachDragSources`) trong khi `init()` có 2 call site độc lập (panel Kho SP phải `index.html` + mode "Kho" cột Pancake `pancake-mode-switcher`) → mở cả 2 là drop listener document đăng ký ×2 → **1 kéo thả cộng SL ×2**. Fix `_dropDelegated` guard (`inventory-panel.js?v=20260612j`), verify single drop → qty=1. (Fix vào HEAD qua auto-commit `7bb139d21` do race với session đợt I.)

**Status:** ✅ Done.

### [web2] [live-chat] [render] FIX đợt H phần còn lại — 3H9 + 3H8/events + LC-pollnow-auth + 3H15 ✅

**User:** "đợt H". Phần đầu (3H6, 3H7, H11, 3H8 mutation) đã fix bởi session live-chat (`276a64355`); phần còn lại commit `cf11709bb`.

- **3H9 `offlineBatchAll`:** group comment theo campaign/video của CHÍNH comment (`_resolveCampaignForComment` — match `_postId` trước) như vòng byVideo của Force extract, gửi N payload per video — multi-campaign (House+Store cùng lúc) hết snapshot sai video/sai offset khi auto-trigger silent; thêm filter `LiveHiddenCommenters.isHidden` nhất quán. Bump `live-livestream-snap.js?v=20260612i`.
- **3H8 phần cuối:** relay `GET /api/events` + `/api/events/latest` gate `requireRelaySecret` (event store chứa nguyên payload Pancake WS: tên KH, fb_id, snippet, recent_phone_numbers). Không có frontend nào đọc 2 route này → an toàn.
- **LC-pollnow-auth:** `web2-live-comments` 8 route (poll-now/bulk/campaigns POST+DELETE/assign/unassign/saved POST+DELETE) gate `requireWeb2AuthSoft` + poll-now cap 10 posts/request (mỗi post fan-out tới 50 trang pancake.vn); `livestream-snapshots` 8 route (snapshot/refresh-thumbnail/offline-batch/DELETE snapshot/extract-frame/extract-all-pending/extract-test/stream-url) gate soft + offline-batch cap 2000 comments/payload. `GET /snapshot/:id/image` GIỮ public (img src không gửi header); `/ingest` giữ x-relay-secret; `/wipe-all` giữ CLEANUP_SECRET.
- **3H15 (gộp từ nhóm Khác):** escape `userName`/`userId` trong `renderHistEntry` modal Lịch sử SP (stored XSS qua body/header x-user-name) — fallback `<em>không rõ</em>` giữ riêng. Bump `web2-products-app.js?v=20260612h`.
- **Verify:** `node --check` 5 file OK.

**Status:** ✅ Done — đợt H hoàn tất. Còn đợt I (tách Web1: 3W1-3W7), đợt E (ví NCC), bật `WEB2_AUTH_ENFORCE=1` (sau khi wire token raw fetch).

### [delivery-report] Ảnh bàn giao v10: section ĐƠN GỬI RIÊNG (từ nút Gửi Kèm) cho cả TP/TMT/NAP ✅

**User:** đơn gửi kèm (gửi riêng) nếu có lấy từ nút Gửi Kèm, thêm phía dưới ĐƠN 0đ: `Đơn gửi riêng: x đơn - K (tổng Thu) - Phí ship: Y · Còn lại: Z` + bảng `Khách hàng—SĐT | Giá trị | Thu` — cả 3 kênh TP/TMT/NAP.

- **send-along.js:** getter public mới `SendAlong.getOrdersForChannel(channel)` — đọc Firestore `delivery_report/data/send_along/<dateKey>` (source of truth, dateKey theo ngày lọc), fallback cache localStorage; trả `[{name, phone, value, collect}]`, bỏ dòng trống.
- **delivery-report.js:** cả `buildHandoverCanvas` (TP) + `buildGroupHandoverCanvas` (TMT/NAP) nhận `extraItems`; section vẽ dưới ĐƠN 0đ: title `ĐƠN GỬI RIÊNG (x đơn): <tổng Thu>` + dòng `Phí ship (x × phí kênh): − Y · Còn lại: Z` + bảng Giá trị (cam) / Thu (đậm). Phí theo kênh: TP 20k, TMT/NAP 23k. Không có đơn gửi kèm → bỏ hẳn section. Map kênh: TP→'Thành phố', tomato→'TOMATO', nap→'NAP'. Lưu ý: "Còn lại" gửi riêng tự chứa, KHÔNG cộng vào dòng Tổng (Tổng vẫn = TP + thu về).
- Cache-bust `delivery-report.js?v=20260612g` + `send-along.js?v=20260612c`.
- **Test:** TP stub 2 đơn (Thu 350+200) → `550 − 40 = 510` ✓; TMT đọc Firestore THẬT ngày 05/06 (user đã nhập kênh TOMATO) → section tự hiện ✓; không có gửi kèm → ảnh như cũ.

**Status:** ✅ Done.

### [delivery-report] Gửi Kèm: thêm ô "Thu (COD)" mỗi đơn ✅

**User:** thêm 1 ô điền Thu (giá trị thu COD) vào modal Gửi Kèm.

- Mỗi đơn giờ có 4 ô: Tên – SĐT – **Giá trị** – **Thu (COD)** (+ nút xóa). Thêm header cột trong mỗi card; grid 5 cột (mobile stack, ẩn header).
- Data model order thêm field `collect`. Tổng theo kênh + footer hiển thị cả 2: `GT … · Thu …` / `Tổng GT … · Tổng Thu …`. Refactor `_editValue` → `_editAmount(ci,oi,field,input)` dùng chung cho Giá trị + Thu. sanitize/validate tính cả `collect` (đơn chỉ có Thu vẫn được giữ).
- Files: [`delivery-report/js/send-along.js`](../delivery-report/js/send-along.js), [`delivery-report/css/send-along.css`](../delivery-report/css/send-along.css), bump `?v=20260612b`.
- **Test (Playwright):** nhập Giá trị 150k + Thu 120k/50k → tổng "GT 150.000 · Thu 170.000" + footer đúng; lưu → Firestore/localStorage có `collect`; đóng/mở lại load đúng (120.000, 50.000). Đã dọn data test.

**Status:** ✅ Done.

### [delivery-report] Ảnh bàn giao v9: phí ship kênh tỉnh (TMT/NAP) = 23k/đơn ✅

**User:** phí ship của kênh TMT và NAP là 23k, tính lại.

- Hằng số mới `HANDOVER_SHIP_FEE_PROVINCE = 23000` dùng trong `buildGroupHandoverCanvas` (TMT/NAP); TP + thu về giữ `HANDOVER_SHIP_FEE = 20000`. Cache-bust `?v=20260612f`.
- **Test:** TMT `2.545 − 46 (2×23) = 2.499`, NAP `225 − 23 = 202` ✓.

**Status:** ✅ Done.

### [delivery-report] Ảnh bàn giao v8: không có đơn 0đ → bỏ hẳn section ĐƠN 0đ (TP + TMT + NAP) ✅

**User:** không có đơn 0 đồng thì bỏ phần ĐƠN 0đ đi, đừng ghi "Không có đơn 0đ" — áp dụng cả Thành phố, NAP, TOMATO.

- `buildHandoverCanvas` (TP) + `buildGroupHandoverCanvas` (TMT/NAP): wrap section ĐƠN 0đ (sub-divider + title + header + rows) trong `if (hasZero)`, height tính động bỏ section khi rỗng; xoá nhánh italic "Không có đơn 0đ". Cache-bust `?v=20260612e`.
- **Test:** data ảo không đơn 0đ — ảnh TP chỉ còn 2 khối tổng + thu về + Tổng (1800×576), ảnh TMT chỉ header tổng (1040×344); số đúng `Tổng 3 đơn: 1.785 = 855 + 930`.

**Status:** ✅ Done.

### [delivery-report] Ảnh bàn giao v7: nút "Ảnh TMT" + "Ảnh NAP" cho tab Tỉnh (1 cột, không thu về) ✅

**User:** thêm 2 nút Ảnh TMT / Ảnh NAP ở tab Tỉnh (giống nút Copy ảnh bàn giao của Thành phố), ảnh 1 cột như cột trái của ảnh TP — 2 kênh này không có thu về.

- **JS:** hàm mới `buildGroupHandoverCanvas({label, dateLabel, count, total, zeroItems})` — canvas 520px 1 cột: `GIAO — TMT/NAP (d/m)` + tổng − phí ship (N×20) = Còn lại + bảng ĐƠN 0đ (Giá trị | Thu) + footer Tạo lúc (không dòng Tổng vì Còn lại = số cuối). `copyGroupHandoverImage(group)` lọc theo `provinceGroups[Number] === group` (cùng cách chia với renderProvinceView/exportExcelProvince), chỉ đơn ĐÃ QUÉT + confirm nếu còn chưa quét. Extract helper chung `copyCanvasToClipboard(canvas, fileName)` (copy + fallback tải PNG) — copyHandoverImage TP cũng dùng.
- **HTML:** 2 button `drBtnCopyHandoverTomato` (đỏ) / `drBtnCopyHandoverNap` (xanh) cạnh nút Copy ảnh bàn giao; visibility trong `updateProvinceExportButtons` (chỉ tab Tỉnh + tra soát). Cache-bust `?v=20260612d`.
- **Test:** Playwright data ảo 2 group — TMT `3 đơn: 2.545 − 60 = 2.485`, NAP `2 đơn: 225 − 40 = 185`, bảng 0đ đúng từng group, nút ẩn ở tab city.

**Status:** ✅ Done.

### [delivery-report] Nút "Gửi Kèm" — nhập đơn gửi kèm theo kênh, lưu theo ngày lọc tra soát ✅

**User:** thêm nút Gửi Kèm cạnh nút In, nhập các đơn gửi kèm gồm Kênh gửi → mỗi đơn Tên - SĐT (5-10 số) - Giá trị; dấu "+" ngoài ô thêm kênh khác, dấu "+" trong ô kênh thêm đơn của kênh đó; lưu lại theo từng ngày theo ngày lọc hiện tại của tra soát.

- **Files mới** (tách riêng theo convention): [`delivery-report/js/send-along.js`](../delivery-report/js/send-along.js) + [`delivery-report/css/send-along.css`](../delivery-report/css/send-along.css). Wire vào `delivery-report/index.html` (nút `#drBtnSendAlong` cạnh "In", load css/js `?v=20260612a`).
- **UI:** modal inject động (`window.SendAlong`). Mỗi card = 1 KÊNH GỬI (dropdown cố định 13 kênh: TOMATO/NAP/Thành phố/GHTK/GHN/Viettel Post/J&T/SPX/Ahamove/Grab/Xe khách/Bưu điện/Khác) + danh sách đơn (Tên, SĐT, Giá trị) + nút "+ Thêm đơn" trong card; nút "+ Thêm kênh" ngoài card. Tổng theo kênh + tổng cộng tự tính. SĐT validate 5-10 số (đỏ inline + chặn lưu); giá trị format nghìn (vi-VN).
- **Lưu trữ theo ngày:** key = ngày lọc (`drFilterFromDate`, range → `from__to`). Firestore `delivery_report/data/send_along/<dateKey>` (source of truth, cross-machine) + cache `localStorage dr_send_along_v1[<dateKey>]`. Mở modal: load cache ngay rồi override bằng Firestore. Web 1.0 module (Firestore OK).
- **Test (Playwright, localhost):** nút hiện, modal mở đúng "Ngày 19/05/2026"; thêm 2 kênh + nhiều đơn → tổng kênh/tổng cộng đúng; SĐT "12" highlight đỏ + validate chặn lưu đúng message; lưu OK ("Đã lưu ✓") → localStorage + Firestore đúng shape; đóng/mở lại load đủ 2 kênh; đổi sang 20/05 → rỗng (cô lập theo ngày). Đã dọn data test khỏi Firestore.

**Status:** ✅ Done.

### [live-chat] [render] FIX đợt H — realtime mất tin nhắn + drag-drop 500 + auto-snap chết + gallery che topbar (3H6, 3H7, 3H8, H11 + crm_team_id BIGINT) ✅

**User báo 6 vấn đề trang live-chat giữa buổi live.** Verify server prod TRƯỚC: relay WS (`n2store-tpos-pancake.onrender.com`) OPEN 20.7h nhận comment realtime, secret relay↔fallback khớp (so hash), DB comment mới nhất cách 22s, SSE hub push OK khi nghe 20s → **toàn chuỗi server KHOẺ, lỗi nằm ở client + 2 bug rời**.

- **Mất tin nhắn / chưa realtime (H11 + mới):** cursor delta client dùng `created_time >= since` — với 2+ campaign, comment post B về trễ mang created_time < max(post A) bị loại **VĨNH VIỄN**; comment bị UPDATE (poller fill phone/has_order) không đổi created_time → không re-render. Fix: server GET thêm filter `sinceUpdated` trên `updated_at` (epoch ms server gán mỗi upsert, đã có sẵn trong schema) + trả `updated_at`; client (`live-init.js`) chuyển cursor sang `_lastUpdatedMaxMs` (overlap 3s, fallback `since` khi server cũ); `prependComments` tách incoming thành FRESH/UPDATE — UPDATE merge field vào object state (giữ reference) + patch DOM row (skip khi user đang gõ trong row), FRESH như cũ. Verified live: 200→228 comments tự prepend trong lúc test, update-merge giữ 1 dòng + DOM patch.
- **Drag-drop tạo đơn 500 (bug user #4):** repro qua browser → `POST /api/v2/cart/<fbId>/add` 500 ở lần TẠO DRAFT đầu tiên mỗi khách. Root cause: `native_orders.crm_team_id INTEGER` nhưng sau gỡ TPOS client gửi `crmTeamId = FB Page Id` (15 chữ số, vd 270136663390370) vượt INT4 → `/from-comment` INSERT "integer out of range". Fix: migration idempotent `ALTER COLUMN crm_team_id TYPE BIGINT` đặt ĐẦU ensureTables ở CẢ `native_orders` + `fast_sale_orders` (merge-to-pbh copy cột này). Test migration trên DB local riêng (INSERT fail INT4 → ALTER → OK → re-ALTER idempotent → DROP DB). Đơn test NJ-20260612-0002 đã xoá.
- **Auto-snap chết (3H6, bug user #5):** `live:newComment` không còn ai emit sau rework PUSH-only → `prependComments` emit cho mỗi comment FRESH (payload `{comment, isStaff}`, isStaff = page tự comment). Verified: 5 emit thật từ live đang chạy, payload đủ id/name/\_pageId.
- **3H7:** `_filteredAll()` helper lọc người-ẩn dùng chung — `_appendOlderBatch` + `_ensureScrollSentinel` + prepend DOM đều qua filter (hết lọt người ẩn + dòng trùng khi cuộn do offset lệch).
- **Gallery che topbar (bug user #6):** `.live-lsimg-sidebar` top 0 → 48px + height `calc(100vh - 48px)` (`live-livestream-gallery.css`). Verified: sidebar mở top=48px, chip "📷 Chụp Live" elementFromPoint không bị che.
- **3H8 (một phần):** nút "+ Lưu vào Live" POST `/api/live-saved` vào host **không tồn tại** (`n2store-live-chat.onrender.com` — service thật tên cũ `n2store-tpos-pancake`) và route cũng không có ở đâu → 404 vĩnh viễn. Fix: bộ route mới `/api/web2-live-comments/saved` (POST + GET /ids + DELETE /:customerId, bảng `web2_live_saved` web2Db) + client (`live-api.js`, `pancake-api.js`) trỏ sang; sửa `livePancakeUrl` 2 file state về host đúng; relay gate 4 mutation routes (`/api/start|stop|reload|reconnect`) bằng `x-relay-secret`; `forwardToFallback` thêm 1 retry sau 2s (loss point khi fallback cold-start). Còn mở: `/api/events*` leak PII (giữ cho debug), 3H9 offline-batch per-campaign.
- **Polling (user #3):** xác nhận KHÔNG còn vòng poll nào trên path comment — server background loop OFF (poller chỉ event-driven qua /ingest), client chỉ SSE + debounce; giữ nguyên PUSH-only.
- **Files:** `render.com/routes/web2-live-comments.js`, `native-orders.js`, `fast-sale-orders.js`, `live-chat/server/server.js`, `live-chat/js/live/{live-init,live-comment-list,live-api,live-state}.js`, `live-chat/js/pancake/{pancake-api,pancake-state}.js`, `live-chat/css/live-livestream-gallery.css`.

**Status:** ✅ Done — code + browser-verify localhost (extension loaded). ⏳ Render deploy (fallback + relay đều trúng Build Filters) → verify online sinceUpdated + /saved/ids.

### [web2] [render] FIX đợt G vòng 3 — auth blanket + enforce-prep (3H14, 3H17-3H19, 3H21 + 7 nhóm 1D) ✅

**User:** "đợt G". Commit code `11b6d0717` (19 files).

- **3H14:** balance-history 8 mutation (resolve/link/reassign/auto-match/reprocess/auto-assign/manual-deposit/cleanup) + customers 8 mutation (create/upsert/enrich-fb/merge/PATCH/DELETE/add-alt-phone/harvest) gate `requireWeb2AuthSoft`; `verifiedBy`/`userName` fallback `req.web2User.display_name`.
- **3H17:** monitoring `revert`/`replay`/blacklist gate **HARD** `requireWeb2Admin` (GET soft); `web2-match-audit.revert()` viết lại: transaction + FOR UPDATE, lỗi ví → `WALLET_REVERT_FAILED` rollback toàn bộ (trước nuốt lỗi → "sổ reset, tiền chưa rút"); revertedBy từ `req.web2User`.
- **3H18:** payment-signals `/approve` guard mọi status ≠ `pending` → 409 (trước chỉ chặn confirmed → approve trên dismissed cộng ví + nhắn khách mà status kẹt).
- **3H19:** kpi-assignments `loadUsers()` gửi `x-web2-token` + toast 401 (bump `?v=20260612g`).
- **1D auth (7 nhóm):** cutout soft + rate-limit 20 ảnh/phút/IP · dashboard-kpi GET soft · audit-log /list+/entities soft · notifications list/unread/read/mark-all soft · pancake-refresh GET /status soft · poller-pages mutations soft + `_notify` SSE (tab khác sync) · backfill-supplier + backfill-short-codes gate admin.
- **3H21 enforce-prep:** web2-generic create/update/delete/bulk-create + dedicated-entity CRUD wire soft (trước không tham chiếu middleware → bật enforce vẫn mở 78 entity); history identity ưu tiên `req.web2User` (chống spoof); client `Web2Api._fetchJson` + notification-bell tự gắn `x-web2-token` (bỏ `credentials:'include'` vô nghĩa với token-based).
- **⚠ `WEB2_AUTH_ENFORCE=1` CHƯA bật** — còn wire token vào raw fetch native-orders-app/so-order-app + checklist client vòng 2 (4 token-manager pancake, payment-confirm, pancake-settings, pbh-reports dashboard, ví KH) → bật env Render → browser-verify. Checklist ở mục 6 đợt G file MD.
- **Verify:** `node --check` 18 file OK; import path middleware đúng (`../../` cho v2/, `../` cho routes/).

**Status:** ✅ Done — đợt G hoàn tất (enforce flip là bước riêng). Còn đợt H (live-chat), I (tách Web1), E (ví NCC).

### [web2] [render] FIX đợt F vòng 3 — 11 bug tiền/kho (3C1, 3H1-3H5, 3H10-3H13, 3H16) ✅

**User:** "đợt F" — fix cụm tiền/kho từ audit vòng 3.

- **Files:** `render.com/routes/fast-sale-orders.js`, `native-orders.js`, `web2-returns.js`, `web2-generic.js`, `v2/web2-balance-history.js`, `web2-products.js`, `services/web2-sepay-matching.js`, `web2/balance-history/js/web2-manual-deposit.js` (+ bump `?v=20260612f`).
- **3C1+3H1 `/merge` PBH:** SELECT nguồn `FOR UPDATE` (serialize với cancel) + INSERT PBH gộp carry đủ 5 cột tiền `payment_amount/deposit/residual/cash_on_delivery/wallet_deducted` (trước rơi về 0 → mất tiền ví + mất khoản phải thu).
- **3H3 huỷ đơn web:** thay mirror-state bằng `fastSale._cancelPbhInTx` per-PBH TRONG cùng transaction (restock + hoàn ví idempotent, match cả merged `NJ-A+NJ-B`); gate restock trong `_cancelPbhInTx` đổi từ `state !== 'cancel'` → theo cờ `stock_restored`/`wallet_deducted` (PBH kẹt từ sync cũ tự lành khi có cancel mới). Export `_cancelPbhInTx` từ fast-sale-orders.
- **3H4 PATCH native-orders:** guard transition — chặn `status:'cancelled'` qua PATCH (chỉ POST /cancel), chặn hồi sinh `cancelled→draft`, sửa `products` đơn confirmed cần `force:true`.
- **3H5 `/merge-to-pbh`:** FOR UPDATE + guard draft + giữ `productCode` trong combinedLines + `validateStock` + trừ kho trong tx + idempotent theo `source_code` (409 kèm existingNumber) + đơn nguồn → `confirmed` + notify `web2:products`.
- **3H2 Thu về `khong_nhan_hang`:** trong tx — pre-check 2 phiếu active cùng đơn (409) + unique partial index `uq_web2_returns_knh_active` backstop; lock PBH nguồn FOR UPDATE, ví cộng theo `wallet_deducted` TƯƠI; sau cộng → zero-out + `stock_restored=TRUE` (cancel PBH sau không double); DELETE phiếu trả cờ lại.
- **3H10 web2-generic:** strip field state-machine (`status/stock_deducted/approved_*/rejected_*/refunded_*/history`) khỏi data payload PATCH slug `purchase-refund` — chặn bypass re-approve double trừ kho.
- **3H11 manual-deposit:** client sinh `idempotencyKey` (UUID) 1 lần dùng cho cả 2 base; server derive `manualSepayId` từ key (FNV-1a) → retry dual-base ON CONFLICT trả `alreadyProcessed` thay vì nạp/rút ×2.
- **3H12 reassign:** SELECT history `FOR UPDATE` + re-check `linked_customer_phone` TƯƠI trong tx → request thứ 2 nhận 409 thay vì double-debit ví KH cũ.
- **3H13 `resolveWeb2PendingMatch`:** bọc transaction + FOR UPDATE (pending + history) + guard `debt_added`/`alreadyProcessed` khác phone → lỗi hướng sang reassign; UPDATE pending `WHERE status=\'pending\'` + rowCount check; audit log dời SAU commit (log() nuốt lỗi — để trong tx sẽ abort im lặng).
- **3H16 `adjust-pending`:** FOR UPDATE cả 3 nhánh SELECT — hết lost-update pending + ghost-delete nhầm.
- **Verify:** `node --check` 8 file OK; review diff tay từng đoạn tiền. ⏳ Backend cần deploy Render (commit chạm `render.com/**` → Build Filters SẼ trigger build).

**Status:** ✅ Done — đợt F hoàn tất. Còn đợt G (auth + enforce-prep), H (live-chat), I (tách Web1), E (ví NCC).

### [delivery-report][render] Ảnh bàn giao v6: bảng 0đ đổi chỗ Giá trị↔Thu + Thu về 3 cột Mã SP/SL/Giá trị ✅

**User chỉnh** (sau v5): bảng 0đ đổi vị trí cột Giá trị trước - Thu sau; thu gọn cột trái chừa chỗ cho Thu về; bên Thu về tách rõ 3 cột Mã SP – SL – Giá trị (giá trị = đơn giá × SL từng món).

- **Server** tickets.js: handover-batch trả thêm `products: [{code, quantity, value}]` (helper `extractTicketReturnProducts`, cùng cách tính `computeTicketReturnTotals`) — append-only, giữ `product_codes` + aggregate cũ.
- **Client** canvas: `MID 560→470` (cột phải rộng 392px); bảng 0đ cột `Giá trị | Thu`; Thu về = header 3 cột + mỗi đơn: dòng tên—SĐT đậm + N dòng sản phẩm (mã trái, SL/giá trị phải). Server cũ chưa deploy → fallback gộp aggregate 1 dòng; không khớp ticket → `—`. Cache-bust `?v=20260612c`.
- **Test:** stub products 2 món (Q636D 1×340, A125DAMHOA 2×680) + 1 đơn chỉ aggregate — render đúng cả 2 kiểu, Tổng 5 đơn 1.785 = 710 + 1.075.

**Status:** ✅ Done.

### [docs] [web2] Audit VÒNG 3 toàn bộ 35 trang Web 2.0 + sweep tách Web 1.0 ⊥ Web 2.0 ✅

**User:** xem/đọc/phân tích chi tiết từng trang menu Web 2.0 — hiểu cách vận hành, tìm bug/race condition, đề xuất cải thiện; cập nhật overview + file MD; kiểm tra toàn bộ đã dùng Web 2.0, không dùng Web 1.0.

- **Quy mô:** 54 agent (workflow `wf_a3c6b356-f72`): 9 agent audit nhóm trang + 1 agent sweep contamination Web 1.0 chuyên sâu + 2 adversarial verifier (lens correctness/reproduce) cho mỗi finding CRITICAL/HIGH. Bị đứt 1 lần do session limit → resume với cache.
- **Verify fix vòng 2 (đợt A-D):** spot-check code thật toàn bộ C1-C7/S1-S7/H1-H16 — **KHÔNG regression**, trừ 1: kpi-assignments thiếu `x-web2-token` sau gate HARD H9 (3H19). 2 fix có residual: S5 (topic `web2:customer-wallet` còn broadcast phone+amount), S6 (escapeHtml 3-ký-tự còn ở variants-app + products-print).
- **Bug MỚI: 1 CRITICAL + ~21 HIGH (3C1, 3H1-3H21) — CHƯA FIX**, nổi bật: `/merge` PBH mất tiền ví đã trừ + xoá công nợ nguồn (deterministic); huỷ đơn web không hoàn tồn kho PBH; `/merge-to-pbh` không trừ kho; generic PATCH bypass state machine purchase-refund; manual-deposit dual-base retry nạp ×2; reassign double-debit; balance-history/monitoring mutation tiền không auth (kể cả soft); auto-snap live-chat CHẾT (event `live:newComment` không ai emit sau PUSH-only); Stored XSS modal Lịch sử SP; pbh-reports bucket UTC.
- **Sweep Web1⊥Web2: verdict TỐT ~95%.** 100% pool `web2Db||chatDb`, 0 ghi bảng nghiệp vụ Web 1.0, SSE đúng hub, Firestore prefix đúng. **2 vi phạm GHI thật:** `web2-quick-reply.js` (CRUD bảng `quick_replies` chatDb prod — 3W1) + `web2-msg-template.js` (ghi Firestore `message_templates` không prefix — 3W2). Đọc nhầm nguồn: live-chat badge nợ đọc ví Web 1.0 (3W3) + popup KH `/api/v2/customers` (LC-web1-lookup). Lệch convention: pbh-realtime WS legacy 4 trang (3W4), suppliers-cache onSnapshot (3W5). Rủi ro hệ thống: fallback `|| chatDb` âm thầm (3W7 — đề xuất `WEB2_REQUIRE_DB=1`).
- **Files:** `docs/web2/WEB2-PAGES-ANALYSIS.md` (viết lại canonical vòng 3: danh sách bug mới + mục 2 tách biệt Web1/Web2 + lộ trình đợt F-I), `web2/overview/index.html` (#auditPages: badge vòng 3 + 2 box mới).

**Status:** ✅ Audit done — bug list canonical sẵn sàng fix theo đợt F (tiền/kho) → G (auth + enforce-prep) → H (live-chat) → I (tách Web1) → E (ví NCC).

## 2026-06-11

### [delivery-report][render] Ảnh bàn giao v5: khôi phục dòng Tổng + phí ship bên Thu về + cột mã SP ✅

**User chỉnh** (revert 1 phần v4 + bổ sung): hiển thị lại dòng `Tổng` dưới cùng; bên THU VỀ tính phí ship như bên TP (tổng − N×20 = Còn lại); thêm mã sản phẩm món thu về.

- **Server** `render.com/routes/v2/tickets.js`: response handover-batch thêm field `product_codes` (mảng `products[].code` của ticket — append-only, excel cũ không ảnh hưởng; helper `extractTicketProductCodes`).
- **Client** canvas: cột phải = tổng − phí ship = Còn lại (đối xứng cột trái, có sub-divider); row thu về: dòng 1 = tên + `SL: x · giá trị`, dòng 2 = SĐT + mã SP (đậm, truncate); footer khôi phục `Tổng — N đơn: <còn lại TP + còn lại thu về>` + Tạo lúc. Giữ SL·giá trị cùng 1 dòng (yêu cầu v4). Cache-bust `?v=20260612b`.
- **Test:** Playwright + stub handover-batch có `product_codes` — verify `1.115 − 40 = 1.075`, `Tổng 6 đơn: 1.890`, mã SP hiện đúng từng khách. ⚠ Mã SP cần Render deploy xong mới có trên prod (client tự fallback `—`).

**Status:** ✅ Done.

### [delivery-report] Ảnh bàn giao v4: bỏ dòng Tổng cuối + SL·giá trị thu về gộp 1 dòng ✅

**User chỉnh** (sau v3): bỏ dòng `Tổng — 172 đơn` dưới cùng; bên THU VỀ gộp SL + giá trị về cùng 1 dòng (trước đó giá trị ở dòng 1, SL ở dòng 2).

- Footer chỉ còn `Tạo lúc` (divider mảnh + timestamp phải). Row thu về: dòng 1 = tên KH, dòng 2 = SĐT (trái) + `SL: 1 · 340` (phải, giá trị cam đậm). Bỏ biến grandCount/grandTotal. Cache-bust `?v=20260612a`. Ảnh test 1800×616 (gọn hơn v3 704).

**Status:** ✅ Done.

### [delivery-report] Ảnh bàn giao v3: layout 2 cột GIAO | THU VỀ, thu về KHÔNG tính ship ✅

**User chỉnh** (sau v2): thu về không tính phí ship (bản chất shipper giao 170 đơn TP, tiện đường mang món thu về giúp shop — phí ship chỉ tính đơn giao); ảnh chia 2 cột (trái GIAO, phải THU VỀ), tối ưu khoảng trống để xem Zalo trên điện thoại/PC.

- **Layout 2 cột** (vạch dọc giữa, PAD 24 compact): trái = `GIAO — TP (d/m)` + tổng − phí ship = Còn lại + bảng ĐƠN 0đ (row 32px); phải = `THU VỀ` + tổng + danh sách từng khách (2 dòng/khách: tên + giá trị | SĐT + SL, row 46px).
- **Tiền**: phí ship CHỈ nhân số đơn giao (`cityCount × 20`). `Tổng = Còn lại TP + tổng thu về` (không trừ gì bên thu về).
- Footer 1 dòng: Tổng + Tạo lúc. Cache-bust `?v=20260611d`.
- **Test:** Playwright data ảo + stub handover-batch — 5 đơn giao `895 − 100 = 795`, thu về `1.115` (không trừ), `Tổng 7 đơn: 1.910`, ảnh 1800×704 gọn hơn hẳn v2.

**Status:** ✅ Done.

### [delivery-report] Ảnh bàn giao v2: phí ship 20k/đơn + bảng Thu về chi tiết + bỏ ô tròn/ký tên ✅

**User bổ sung** (sau v1): −3.400 trên giấy = phí ship 20k × số đơn; thu về ghi rõ tên khách + SL + giá trị món như excel; bỏ cột ô tròn "Gửi trả" ở bảng 0đ; bỏ dòng "Đã nhận (ký tên)".

- **Header 2 cột tính trừ**: TP `tổng − phí ship (N × 20) = Còn lại`; Thu về tương tự bên phải (vd giấy: 110.298 − 3.400 = 106.898; 1.115 − 40 = 1.075). Hằng số `HANDOVER_SHIP_FEE = 20000`.
- **Bảng THU VỀ chi tiết**: tên KH — SĐT + SL + Giá trị món từ ticket CSKH qua `fetchReturnHandoverInfo` (cùng nguồn cột excel Thu về; API lỗi/không khớp ticket → hiện `—`, vẫn ra ảnh).
- **Dòng Tổng cuối**: `Tổng — (TP + Thu về) đơn: <còn lại TP + còn lại thu về>` (giấy: tổng 172 đơn: 107.973).
- Bỏ cột ô tròn Gửi trả (bảng 0đ) + bỏ footer ký tên. Cache-bust `?v=20260611c`.
- **Test:** Playwright + data ảo, **stub fetch handover-batch** (không ghi đánh dấu ticket prod với đơn TEST) — verify 895−80=815, 1.115−40=1.075, Tổng 6 đơn 1.890, SL/Giá trị đúng map, đơn không ticket ra `—`.

**Status:** ✅ Done.

### [delivery-report] Nút "Copy ảnh bàn giao" tab Thành phố — sinh ảnh PNG xác nhận cho shipper ✅

**User:** thay tờ giấy viết tay bàn giao đơn TP cho shipper bằng ảnh PNG copy vào clipboard (paste Zalo/chat cho shipper chụp xác nhận).

- **Files:** `delivery-report/index.html` (button `drBtnCopyHandover` cạnh nút In + bump `?v=20260611b`), `delivery-report/js/delivery-report.js` (hàm `copyHandoverImage` + `buildHandoverCanvas` + `formatThousand` + `handoverDateLabel`, expose qua public API, toggle hiển thị trong `updateProvinceExportButtons`).
- **Nội dung ảnh** (canvas 900px scale 2x, thuần canvas 2D không thêm lib): header trái `TP (d/m) — N đơn: <tổng CN>`, header phải `Thu về shop: N đơn: <tổng CN thu về>`, bảng ĐƠN 0đ (`Tên KH — SĐT đầy đủ` | **Thu** = CashOnDelivery | **Giá trị** = AmountTotal | ô tròn trống "Gửi trả" cho shipper tick tay), footer timestamp + dòng ký tên. Tiền đơn vị **nghìn** (110.298 = 110.298.000đ).
- **Phạm vi data:** chỉ đơn **ĐÃ QUÉT** (khớp `updateScanCount`); còn đơn chưa quét → `confirm` cảnh báo trước khi tạo. Thu về = đơn `isReturnItem` đã quét trên toàn data. Clipboard fail → fallback tải PNG (`BANGIAO_TP_d_m.png`). Pattern clipboard reuse từ `balance-history/js/balance-verification.js`.
- **Test:** Playwright localhost, seed data ảo client-side (5 đơn TP trong đó 2 đơn 0đ + 2 thu về + 1 tỉnh) — verify button chỉ hiện tab city (tra soát), confirm "Còn 1 đơn CHƯA quét", ảnh 1800×800 đúng layout (tổng 895 = 770+125, thu về 1.115, truncate tên dài), edge case 0 đơn 0đ/0 thu về OK, chưa quét gì → alert chặn.

**Status:** ✅ Done.

### [live-chat][render] Wipe sạch Thumbnail + Kho Hình Web 2.0 để force extract lại ✅

**User:** "xóa dữ liệu Thumbnail + Kho Hình Web 2.0 để force extract lại" (data cũ chứa poster rác từ bug iframe trước khi fix SDK player).

- NEW `POST /api/livestream/wipe-all` (gate `x-admin-secret`=CLEANUP_SECRET + body `{confirm:'YES-WIPE'}`, pattern /ingest): TRUNCATE RESTART IDENTITY cả `livestream_snapshots` + `livestream_images` trên web2Db + SSE notify. Lưu ý: psql external web2-db bị chặn (allowlist null) + classifier chặn mở allowlist → đi đường app-level endpoint là đúng bài.
- **Kết quả:** deleted snaps=6609, imgs=5 — web2Db về 84MB. Force extract lại từ đầu với code SDK player mới (seek/play/verify position).

**Status:** ✅ Done.

### [render] DROP 2 bảng livestream cũ trên chat-db (user duyệt) — 802MB → 629MB ✅

- Verify lần cuối: chatDb `livestream_snapshots` 6609 rows + `livestream_images` 5 rows — khớp CHÍNH XÁC log `[LS-MIGRATE] DONE copied=6609/5` bên web2Db (+ extract mới ghi/đọc web2Db OK).
- `DROP TABLE livestream_snapshots, livestream_images` trên chat-db → **size 802MB → 629MB** (giải phóng 173MB).
- Còn `livestream_conversations` (8.6MB, 21k rows) trên chatDb — bảng của **n2store-realtime** (Web 1.0 broker, đang phục vụ inbox/orders-report pending-customers) → GIỮ, xử lý ở phiên khai tử realtime sau.
- web2-db chặn psql external (IP allowlist) — verify qua migrate log + services-overview + app API.

**Status:** ✅ Done — thumbnail/Kho Hình Web 2.0 trọn vẹn trên web2-db, chat-db gọn lại.

### [render] Spend limit mở khóa build → migrate livestream media chatDb→web2Db HOÀN TẤT ✅

**User:** set spend limit pipeline minutes ($5/1000 phút — thay vì upgrade Professional dư thừa).

- Deploy `dep-d8l8n9d8nd3s73e13t9g` (9559447f3) **live** — build chạy bình thường ngay sau set limit.
- **[LS-MIGRATE] DONE**: `livestream_snapshots` **6609/6609 rows** + `livestream_images` 5/5 copy sang web2Db (170MB; web2Db 84→254MB). Route đã trỏ web2Db — **extract mới test lại "✅ Đã lấy thumbnail"** = ghi/đọc thumbnail giờ hoàn toàn trên web2Db, đúng yêu cầu "chức năng Web 2.0 đừng lưu chatDb".
- Redeploy tpos-pancake xóa status Failed (do test phân biệt lúc hết minutes).
- **CÒN LẠI (chờ user xác nhận):** DROP 2 bảng cũ `livestream_snapshots` (172MB) + `livestream_images` trên **chatDb** → giải phóng dung lượng (chatDb còn 802MB/15GB nên không gấp).

**Status:** ✅ Done.

### [render] Thực thi tối ưu chi phí theo duyệt của user: chat-db 1GB→15GB + realtime→Starter ✅ · ⚠ Render BUILD bị chặn (nghi hết build minutes)

**User duyệt:** (1) tăng chatDB lên 15GB; (2) downgrade n2store-realtime Standard→Starter; (3) khai tử realtime = phiên sau; (4) web2-db để nguyên.

- **chat-db disk 1GB → 15GB** (PATCH Render API, +$4.2/tháng storage): resize xong `available`, hết sự cố full disk — **force extract test lại end-to-end "✅ Đã lấy thumbnail"** (SDK player seek + verify position + capture + POST lưu OK).
- **n2store-realtime Standard → Starter** (−$18/tháng): áp xong, WS Pancake vẫn connected. Tổng chi phí ước ≈ $92/tháng (trước $107).
- **⚠ Render deploy đang bị CHẶN**: 3 deploy liên tiếp (kể cả commit docs-only) `build_failed` sau đúng 3 giây, không có log build lỗi (log 2 build trước đó "Build successful"), status.render.com sạch → nghi **workspace hết build pipeline minutes** (auto-push hook deploy cả ngày). API không lộ quota — user cần mở Render Dashboard xem banner. Hệ quả: migration livestream media (cb45ef604) CHƯA live — sẽ tự áp ở deploy thành công kế tiếp; KHÔNG khẩn vì disk 15GB đã giải cứu.

**Status:** ✅ Disk + downgrade xong, extract verified · ⏳ migration chờ build.
**UPDATE 17:00:** test phân biệt — tpos-pancake CŨNG fail tức thì → chặn toàn workspace.
**UPDATE 17:05 — CHẨN ĐOÁN CHÍNH XÁC:** Render events API lộ **`pipeline_minutes_exhausted`** — workspace HẾT BUILD MINUTES tháng 6 (hook auto-push mỗi turn → auto-deploy mỗi commit → build ~5-7'/lần npm+poetry+yt-dlp, dù đa số commit chỉ chạm frontend/docs do GH Pages serve). **Fix lâu dài đã áp qua API: Build Filters cho cả 4 services** — fallback chỉ build khi chạm `render.com/**`, tpos-pancake `live-chat/server/**`, facebook `n2store-facebook/**`, realtime `n2store-realtime/**` → cắt ~90% build minutes về sau. **Mở khóa ngay cần user**: Dashboard → Workspace Settings → upgrade plan (Professional) hoặc đợi reset 01/07. Migration thumbnail (cb45ef604) tự deploy ở build thành công kế tiếp.

### [delivery-report][issue-tracking][render] Liên thông CSKH → Xuất excel Thu về: 2 cột Số lượng/Giá trị + đánh dấu bàn giao ship ✅

**User:** trang CSKH lưu ticket đổi trả/thu về → muốn khi Xuất excel đơn thu về bên Thống Kê Giao Hàng: theo SĐT khách tìm ticket thu về mới nhất chưa nhận hàng + chưa bàn giao → thêm 2 cột Số lượng (SL món thu về) + Giá trị (tổng giá gốc) vào Excel, đồng thời đánh dấu ticket "đã bàn giao thu về cho ship" (ngày giờ) gắn với số đơn → xuất lại lần nữa vẫn ra đúng dữ liệu cũ (idempotent), không bốc ticket mới.

**Đã chốt:** chỉ type `RETURN_SHIPPER`; Giá trị = giá gốc `price × returnQuantity` (không trừ giảm giá note); CHỈ nút Xuất excel ở tab Thu về (sheet THUVE trong xuất Tất cả/Tỉnh/0đ giữ nguyên 6 cột — tránh đánh dấu ngoài ý muốn).

**Backend:**

- NEW [`render.com/migrations/076_ticket_handover_to_shipper.sql`](../render.com/migrations/076_ticket_handover_to_shipper.sql): thêm 4 cột `handover_at/handover_order_number/handover_date/handover_by` vào `customer_tickets` (Web 1.0, additive + idempotent) + unique partial index `handover_order_number` (neo idempotency 1 đơn = 1 ticket mãi mãi) + index claim path `(phone, created_at DESC) WHERE handover_at IS NULL`.
- `render.com/routes/v2/tickets.js`: lazy bootstrap promise-singleton `ensureHandoverSchema` (pattern wallet-refund 075) + NEW endpoint `POST /api/v2/tickets/handover-batch` (đặt trước `GET /:id`). Per order trong 1 transaction: `pg_advisory_xact_lock(hashtext(order_number))` → lookup ticket đã gắn `handover_order_number` (idempotent, không mutate) → else claim ticket RETURN_SHIPPER + PENDING_GOODS + `handover_at IS NULL` mới nhất theo phone (normalize server, giữ số 0 đầu) `FOR UPDATE` → UPDATE đánh dấu + append `action_history` action `handover_shipper`. Trả `{data: {orderNumber: {ticket_code, quantity, value, already_handed_over}}}`; đơn không match vắng mặt (không lỗi). 1 SSE notify `tickets` cho cả batch khi có claim mới.

**Frontend:**

- `delivery-report/js/delivery-report.js`: NEW `fetchReturnHandoverInfo(items)` (gửi phone RAW — KHÔNG dùng normalizePhone local vì strip số 0 đầu lệch format DB) + `buildExcelRowsReturn` (8 cột, footer Tổng cộng cả qty/value) + hook trong `exportExcel()` chỉ khi `tab === 'return'`. API lỗi → alert + vẫn xuất file 6 cột như cũ.
- `shared/js/api-service.js`: alias `handoverAt/handoverOrderNumber/handoverBy` vào 3 ticket mappers (search/subscribe/getTicket).
- `issue-tracking/js/script.js`: badge tím "🚚 Bàn giao ship {giờ} · {số đơn}" trên row RETURN_SHIPPER đã bàn giao + step "Bàn giao ship" trong `buildTicketTimeline` (hiện ở history tab + detail modal). SSE topic `tickets` sẵn có → badge tự refresh khi export bên delivery-report.

**Verify prod (ticket TEST `0123456788`, order `TEST-HANDOVER-*`):** claim đúng ticket mới nhất (qty 3 / value 330k = 150k×1+90k×2) ✓; re-POST → `already_handed_over: true`, không bốc ticket mới hơn ✓; đơn mới claim ticket mới hơn ✓; action_history đúng 1 entry ✓; phone RAW có space normalize OK ✓.

**Fix ngay sau verify:** `handover_at = NOW()` lưu UTC naive trong khi pg parser (db/pool.js OID 1114) append `+07:00` → badge hiện lệch −7h (bẫy múi giờ CLAUDE.md). Đổi `NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'` (naive TIMESTAMP chứa giờ VN đúng convention parser). ⚠ Lưu ý: `created_at`/`updated_at` của `customer_tickets` (DEFAULT CURRENT_TIMESTAMP) cũng đang lưu UTC naive → mọi giờ tạo phiếu trên trang CSKH hiển thị lệch −7h từ trước tới giờ — bug có sẵn ngoài scope, CHƯA fix (đụng data cũ + nhiều chỗ hiển thị, cần user quyết).

**Status:** ✅ verify prod pass — đã cleanup ticket TEST (hard delete).

### [render][live-chat] Trả lời "sao Web 2.0 dùng chatDb?" + dời livestream_snapshots/images sang web2Db ✅

**User:** "và sao web 2.0 lại dùng chatDb?" (sau khi phát hiện chatDb full vì livestream_snapshots 172MB).

**Vì sao:** route `livestream-snapshots.js` tạo **23/05**, `livestream-images.js` tạo **02/06** — đều TRƯỚC ngày tách DB (03/06). Khi tách chỉ dời bảng prefix `web2_*`; 2 bảng này tên KHÔNG prefix nên bị sót lại chatDb dù server.js đã chú thích "WEB2.0" và consumer là live-chat. Hệ quả: ảnh bytea Web 2.0 phình làm FULL disk chatDb 1GB (Web 1.0 PROD) → mọi INSERT Web 1.0 nguy cơ fail.

**Fix:**

- 2 route đổi pool `chatDb` → `web2Db || chatDb` (20 chỗ, đúng convention Web 2.0).
- NEW [`render.com/services/web2-livestream-media-migrate.js`](../render.com/services/web2-livestream-media-migrate.js): boot +20s copy 2 bảng chatDb → web2Db (keyset batch 20 rows vì bytea nặng, `ON CONFLICT (id) DO NOTHING`, GIỮ NGUYÊN id — thumbnail_url chứa `/snapshot/:id`; **setval sequence = MAX(id) nguồn TRƯỚC khi copy** chống snapshot mới cấp id trùng dải cũ; chỉ copy cột chung 2 schema; idempotent — dst ≥ src thì skip). Export `ensureSchema` từ 2 route cho migrate tạo bảng đích (1 nguồn DDL).
- **KHÔNG drop bảng nguồn trên chatDb** (Web 1.0 prod) — sau khi verify migrate xong, user xác nhận mới DROP (giải phóng ~172MB → hết full disk mà không cần tăng plan).

**Status:** ✅ code xong — đợi deploy Render + verify counts khớp.

### [live-chat] Force extract chụp "đúng 1 kiểu poster ▶" — root cause + chuyển sang FB SDK Player API ✅ · ⚠ PHÁT HIỆN chatDb FULL DISK

**User:** force extract chạy nhưng mọi thumbnail là CÙNG 1 hình iframe offline (poster + nút ▶).

**Root cause (verify thật trên page):** iframe plugin `plugins/video.php` KHÔNG autoplay VOD đã end (chỉ autoplay LIVE) → player đứng poster ▶; `&t=` plugin param không được FB hỗ trợ. Code cũ chờ cứng 2.6s rồi chụp → 283 thumbnail giống hệt nhau vẫn POST "✓". Test cả `autoplay=true` lẫn `t` trong href → vẫn đứng poster.

**Fix — FB JS SDK Embedded Video Player API** (`live-livestream-snap.js`):

- `_ensureFbSdk()` load sdk.js 1 lần + subscribe `xfbml.ready` route instance theo div id; `_ensureSeekPlayer(camp)` dựng XFBML player TRONG wrapper capture (giữ wrapper element — Region Capture cropTo còn bind), cache theo video href — 1 video 1 player, seek nhiều offset KHÔNG reload iframe (~2s/comment thay vì ~10s).
- `_clientCaptureAtOffsetInner`: `player.mute()+seek(t)+play()` → poll `getCurrentPosition()` tới khi |pos−t|<30s (≤8s, re-seek giữa chừng nếu buffering) → mới capture; fail → throw (comment còn pending) — KHÔNG BAO GIỜ lưu poster tĩnh nữa. `player.pause()` giữa các offset.
- `_clientRestoreLive`: thay children wrapper → iframe live thuần (live autoplay OK), clear player cache. Gỡ `_buildSeekEmbedUrl` (dead).
- **Verified:** SDK player seek(600) → pos 602→604 đang chạy thật (đo trên page với VOD thật); flow "Lấy thumbnail" 1 comment chạy tới capture OK — POST fail vì DB (dưới).

**⚠ SỰ CỐ PHÁT HIỆN KHI TEST: chatDb (Web 1.0 PROD, plan 1GB) FULL DISK** — `could not extend file ... No space left on device` khi INSERT `livestream_snapshots`. DB 801MB/1GB (snapshots 172MB + purchase_order_images 159MB + invoice_status 146MB). web2Db bình thường (84MB/15GB). MỌI WRITE Web 1.0 có nguy cơ fail — cần user quyết: upgrade plan / cleanup / VACUUM / dời snapshots sang web2Db. CHƯA tự xử lý (Web 1.0 prod data bảo toàn tuyệt đối).

**Files:** live-chat/js/live/live-livestream-snap.js, live-chat/index.html (bump v=20260611m).

**Status:** ✅ Fix client done · ⚠ chatDb full chờ user quyết.

### [web2][render] FIX đợt A-D toàn bộ bug audit vòng 2 — 7C tiền/kho + 7C bảo mật + 16H + ~10 MEDIUM ✅

**User:** "làm đi" (fix theo lộ trình 5 đợt của audit vòng 2 sáng nay).

**Cách làm:** 9 agent fix song song theo cụm file không chồng chéo (tránh hoàn toàn `live-chat/` + `web2-live-comments.js`/poller — session khác đang làm) + 1 agent code-review diff trước commit. Review bắt 1 HIGH thật (so-order map kết quả upsert theo name gán nhầm mã khi có row collision chen giữa) → fix lại theo VỊ TRÍ payload + fallback name.

**Đợt A — tiền/kho:** C1 bulk-cancel PBH restock+hoàn ví per-PBH trong tx (`_cancelPbhInTx`); C2 DELETE Thu Về FOR UPDATE + guard + revert kho/ví trong tx; C3 reassign SePay idempotent (dup-check `reassignRef` + withdraw reference `sepay_reassign_out` + guard alreadyProcessed→rollback); C4 thiếu require `web2MatchAudit`; C5 confirm-purchase-partial vào transaction thật; C6 `await SW.load()` + tách toast ví/phiếu; H4 /reject tx + whitelist state; H5 guard null so-order data; H15 so-order double-pending (upsert phần thiếu theo pending tươi); H1 hoàn `wallet_deducted` cả 3 đường cancel; H2 state machine PBH; H3 manual create atomic; C7+H14 merge/split retry-23505 + giờ VN + FOR UPDATE + guard draft + advisory lock STT.

**Đợt B — auth (2 mức chống vỡ prod):** HARD cho delete-all/\_vacuum (generic + dedicated-entity), web2-users GET, SSE admin topic (`?admintoken=`); SOFT (`requireWeb2AuthSoft`, enforce khi env `WEB2_AUTH_ENFORCE=1`) cho payment-signals, pbh-reports, notifications, wallets deposit/withdraw (+ hỗ trợ `x-idempotency-key`), pancake-accounts (strip token list + `x-relay-secret` path), pancake-refresh (+ IP rate-limit 5/phút); H16 IP thật cf-connecting-ip + guard admin cuối ở PATCH.

**Đợt C — XSS + chức năng chết:** S6 escapeHtml 5 ký tự + `escJs` mọi inline onclick + `safeImageUrl` (products-app + page-builder 87 trang, bump `?v=20260611s6`); S7 `safeUrl` chặn `javascript:` (server validate + notifications page + bell); H7 trang Phân quyền viết lại theo API thật (`d.users`, `d.user.permissions`, PUT `{slug:[actions]}` theo registry `GET /pages`, gửi token); H8 `groupName`.

**Đợt D — SSE ví:** H6 fix trọn server-side (eventType `wallet_update`→`update`, wildcard payload key = key client đã subscribe, separator `:`, supplier-wallet/debt đổi `wallet:all`→`web2:wallet:*`, WALLET_ALL đổi value); S5 strip PII payload ví + relay-notify fail-closed; dashboard SSE `?nocache=1`.

**Còn mở:** H11 (live-chat delta miss comment UPDATE — session live-chat đang xử lý folder đó), đợt E kiến trúc ví NCC, MEDIUM 1D còn lại. **Để enforce auth thật:** wire `x-web2-token` vào client theo checklist mục 0 file MD → bật `WEB2_AUTH_ENFORCE=1`.

**Files:** fast-sale-orders.js, web2-returns.js, v2/web2-balance-history.js, web2-products.js, web2-generic.js, web2-dedicated-entity.js, native-orders.js, purchase-refund.js, middleware/web2-auth.js, pancake-accounts.js, web2-pancake-refresh.js, web2-users.js, pbh-reports.js, v2/notifications.js, v2/web2-wallets.js, web2-payment-signals.js, realtime-sse-web2.js + frontend: pbh-app, purchase-refund-app, supplier-wallet-app, supplier-debt-app, so-order-app, web2-products-app, page-builder, users-permissions, report-delivery, notifications, web2-notification-bell, web2-sse-topics, dashboard, admin-sse-monitor (+ bump ?v=). Docs: WEB2-PAGES-ANALYSIS.md (⬜→✅ + sha từng dòng, mục 5 trạng thái đợt, checklist enforce) + overview #auditPages.

**Status:** ✅ Done — commits `22ba307df`, `feb3a0281`, `5e154518b` + docs. Render auto-deploy theo push.

### [live-chat] Audit nút Force extract — tìm + fix 3 bug (staff-check sót 830 comment, resolve sai video, extract cả người ẩn) ✅

**User:** "xem nút force extract này hoạt động đúng chưa? Có bug gì không?"

**3 bug CONFIRMED bằng data thật (1371 comment, multi-page House+Store):**

1. **`_isStaffComment` chỉ so `selectedPage`** — multi-page mode selectedPage=House → **830 comment do page "NhiJudy Store" đăng lọt lưới** (đo thật `missedByStaffCheck: 830`). Hậu quả: Force extract tính 830 comment shop vào pending → chụp thumbnail vô ích ~3-4s/cái (~50 phút); harvest gom page Store vào kho KH như khách. **Fix:** check `c._pageId` của chính comment + mọi page trong `allPages` → missed = 0.
2. **`_resolveCampaignForComment` không dùng `_postId`** — Path 1 `_campaignId` từ DB là parent-campaign id (khác id-space liveCampaigns, 0/1371 match) → rơi xuống match theo PAGE → 2 live cùng 1 page là seek **sai video** → thumbnail sai hàng loạt. **Fix:** thêm Path 1.5 match `comment._postId` ↔ `campaign.Id`/`Facebook_LiveId` (cùng format `pageId_videoId`, so cả bản strip prefix) → resolve đúng 50/50 sample.
3. **Extract + harvest cả comment của người bị ẨN** — pending/harvest đọc `state.comments` thô (chưa qua filter LiveHiddenCommenters). **Fix:** skip `LiveHiddenCommenters.isHidden(c)` ở pending + harvest (cả chip click lẫn `_runSilentForceExtract`).

**Verified localhost:** sau fix `missedAfterFix: 0`, `samplePostIdResolve: 50/50`, 0 console error. Silent variant hưởng chung fix (dùng cùng `_isStaffComment`).

**Files:** live-chat/js/live/live-livestream-snap.js, live-chat/index.html (bump v=20260611l).

**Status:** ✅ Done.

### [live-chat] Badge "💬 N" topbar — tổng comment livestream KHÔNG tính người bị ẩn ✅

**User:** "hiện tổng comment của livestream ngoại trừ ẩn".

- `live-comment-list.js`: `_visibleComments()` lưu `_totalAfterHidden` (đếm SAU filter người ẩn, TRƯỚC cap render 200) → `_updateTotalBadge()` chèn/refresh badge `#liveCommentTotal` ("💬 N", xanh dương) vào ĐẦU `#liveTopbarActions`, gọi mỗi `_renderDispatch` (mọi render path đi qua). Hide/unhide người → badge tự cập nhật (re-render).
- **Verified localhost:** badge `💬 541` = 1371 tổng − 830 comment shop ẩn ✓; ẩn thêm 1 người (1 comment) → `💬 540`, bỏ ẩn → `💬 541` ✓; server record sạch (2 default); 0 console error.

**Files:** live-chat/js/live/live-comment-list.js, live-chat/index.html (bump v=20260611l).

**Status:** ✅ Done.

### [live-chat] Ẩn comment theo NGƯỜI + danh sách quản lý — mặc định ẩn "NhiJudy Store"/"NhiJudy House" ✅

**User:** "cho chức năng chọn ẩn comment của người đó và danh sách quản lý, mặc định ẩn 'NhiJudy Store', 'NhiJudy House'" (comment do chính page tự reply tràn list — đo thật: 830/1371 comment là của shop).

- **Module MỚI** [`live-chat/js/live/live-hidden-commenters.js`](../live-chat/js/live/live-hidden-commenters.js) (`LiveHiddenCommenters`): lưu **server-side sync mọi máy** qua web2-generic record `/api/web2/live-hidden-commenters` code `global` (`data.commenters=[{fbId,name,hiddenAt,by}]`, ghi kèm `history:[]` chống phình — pattern capture-lock); realtime SSE `web2:live-hidden-commenters` (generic tự notify) → máy khác reload + re-render; 404 lần đầu → seed 2 page mặc định (House `117267091364524`, Store `270136663390370`) + create (409 song song → PATCH lại); offline → fallback defaults local. Match theo `fb_id`, fallback tên normalize (bỏ space, lowercase).
- **Filter tại `LiveCommentList._visibleComments()`** — choke point MỌI render path (full/patch/sentinel): hide/unhide = re-render tức thì, KHÔNG refetch, comment vẫn nguyên state + DB (bỏ ẩn hiện lại đủ).
- **UI**: mỗi comment row thêm nút 🚫 `user-x` đỏ "Ẩn TẤT CẢ comment của người này" (confirm trước, UI-first apply ngay + save nền + rollback nếu lỗi); topbar `#liveTopbarActions` thêm nút **"🙈 Ẩn (N)"** mở modal quản lý (list người ẩn + fb_id + ai ẩn + nút "👁 Bỏ ẩn").
- **Verified localhost** (Playwright): seed đúng 2 page, 830 comment shop biến khỏi list (1371 → 541 visible), server record tạo đúng + history len 1, hide/unhide roundtrip KH thật (2→3→2, server clean), modal 2 rows + unhide btns, 0 console error.

**Files:** live-chat/js/live/live-hidden-commenters.js (NEW), live-chat/js/live/live-comment-list.js (filter + nút user-x + icon + action case), live-chat/index.html (script tag + bump v=20260611k).

**Status:** ✅ Done.

### [orders-report][don-inbox][render] Vòng 2 audit ví — fix 8 vấn đề còn sót sau refund outbox ✅

**User:** "kiểm tra lại toàn bộ từ đầu xem còn lỗi gì nữa không" → 3 reviewer độc lập (backend/frontend/integration toàn repo) + tự verify → 8 vấn đề → "hiện thực toàn bộ".

**Fix:**

1. **Order-wide cancel guard** ([pending-withdrawals.js](../render.com/routes/v2/pending-withdrawals.js) POST /): check `WHERE order_id=$1 AND status IN (CANCELLED, REFUND_DUE, REFUNDED)` KHÔNG kèm phone — chặn trừ ví đơn đã hủy kể cả khi cancel caller và deduction caller lấy phone từ field khác nhau (ReceiverPhone vs Partner.Phone) → marker UNIQUE(order_id,phone) không đụng.
2. **don-inbox cancel path** ([tab-social-invoice.js](../don-inbox/js/tab-social-invoice.js)): refund-first (await `window.refundWalletForCancelledOrder` THROW khi fail, TRƯỚC mọi mutation local), TPOS fail → throw thay return (button không kẹt spinner), `_tposCancelDoneIds` skip TPOS khi retry, catch phân loại TPOS_CANCEL_FAILED / REFUND_FAILED (modal giữ mở + retry). Export `refundWalletForCancelledOrder` + `logCancelActivity` từ workflow.js.
3. **NEW [shared/js/wallet-failure-store.js](../shared/js/wallet-failure-store.js)**: tách `getOrderWalletIdentity` + `WalletFailureStore` + `retryWalletOpFailures` + race guards ra shared (IIFE, load-guard idempotent) — load cả tab1-orders.html + don-inbox/index.html → sổ nợ ví + retry giờ hoạt động ở don-inbox (trước đây toast bảo gõ hàm không tồn tại). Phone chain thêm `order.Phone` + `invoiceData.ReceiverPhone`.
4. **Panel kế toán thấy REFUND_DUE** ([accountant.js](../balance-history/js/accountant.js)): card "Chờ hoàn ví" + "Đã hoàn ví", alert bar gộp, bảng fetch thêm `?status=REFUND_DUE`, nút **Hoàn ngay** → `POST /:id/process-refund` (executeRefund idempotent).
5. **Migration 075 early-exit**: DO-block check constraint đã chứa REFUND_DUE / `>=` thì RETURN — không DROP+ADD (AccessExclusiveLock) mỗi boot qua ensureRefundSchema.
6. **Align COALESCE(refund_max_retries, 20)** ở 2 picker (khớp default 20 + STUCK alert).
7. **wallets.js** nhánh `not_refund_due` terminal: REFUNDED→already, CANCELLED→no-refund-needed, khác→warn log (không nói dối "sẽ tự hoàn").
8. **Escape HTML** (`_escHtml`) cho Number/Reference/PartnerDisplayName/ShowState trong 2 modal hủy (XSS-latent); `/:id/cancel` + `cancel-by-order` trả `needs_refund_path:true` khi row PROCESSING/COMPLETED.

**Đã BÁC 2 claim của reviewer sau khi tự verify:** "cửa sổ không-constraint giữa DROP/ADD" (sai — DO-block transactional) và "COALESCE 5 làm row cũ kẹt im lặng" (sai premise — ADD COLUMN DEFAULT backfill mọi row PG11+, hạ HIGH→LOW vẫn fix).

**Verify:** 9 file `node --check` PASS + **re-run DB test trên Postgres thật (embedded-postgres): 29/29 PASS** (migration early-exit + re-run no-op + fifo idempotency + 4 race concurrency). Bump `?v=20260611b` (tab1-orders, don-inbox, balance-history).

**Status:** ✅ Done.

### [issue-tracking] Stat cards + tab badges đếm theo chip lọc loại + fix "Hoàn Tất Hôm Nay" luôn 0 ✅

**User:** stat thống kê (Chờ Hàng Về / Chờ Đối Soát / Hoàn Tất Hôm Nay) phải theo chip lọc loại (Tất cả loại / Không Nhận Hàng / Thu về Shipper / Khách gửi / Sửa COD) — bấm chip nào stat cập nhật theo chip đó.

**Fix (`issue-tracking/js/script.js`):**

1. `updateStats()` đọc chip active `#type-tabs .type-tab-btn.active` → lọc TICKETS theo `t.type` trước khi đếm (cả 3 stat cards + badges tab Chờ Hàng Về / Chờ Đối Soát / Hủy). `checkOverdueTickets()` vẫn tính trên toàn bộ TICKETS (alert quá hạn là global).
2. Fix bug sẵn có: ô "Hoàn Tất Hôm Nay" (`count-completed-today`) chưa bao giờ được set (luôn 0) → giờ đếm `status === 'COMPLETED'` có `completedAt`/`completed_at` rơi trong hôm nay (local time).
3. Wire `updateStats()` vào click chip lọc loại + click tab chính (tab switch reset chip về "all" → stats đếm lại toàn bộ).

**Verify (Playwright localhost, 500 tickets thật từ Firebase):** all=78/146/5 khớp breakdown; BOOM=31/113, RETURN_SHIPPER=11/0 (completedToday 4), RETURN_CLIENT=30/0 (1), FIX_COD=6/33; badge Hủy 41=9+18+11+3; completedToday 4+1=5 ✓; chuyển tab → chip reset "all" → stats về 78/146 ✓.

**Files:** issue-tracking/js/script.js.

**Status:** ✅ Done — commit này → GH Pages.

### [showroom1] Chặn gesture "vuốt trái quay về" của webview Zalo/Messenger khi lướt xem ảnh SP ✅

**User:** ở tấm ảnh đầu tiên lướt trái bị quay về Zalo/Messenger (webview hiểu nhầm thành back) → loại bỏ thao tác vuốt-quay-về trong trang; khách muốn quay về thì bấm mũi tên trên thanh trình duyệt.

**Fix 3 lớp (defense in depth — không lớp nào chặn được 100% mọi webview):**

1. CSS `html, body { overscroll-behavior-x: none }` + `.scroll { overscroll-behavior: contain }` — chặn history-swipe Chrome/Android, không chain overscroll ra ngoài.
2. Carousel card (`bindImgwrap`, index.html) + ảnh lớn detail (`bindSwipe`, detail.js): listener `touchstart {passive:false}` — touch khởi phát **sát mép màn hình (<26px)** → `preventDefault()` chặn edge-swipe gesture hệ thống (pattern giống Swiper `edgeSwipeDetection`).
3. Cùng 2 chỗ: `touchmove {passive:false}` — đang vuốt ngang trong carousel (`drag && __moved` / `|dx|>6`) → `preventDefault()` nuốt gesture, webview không coi là pan để back/dismiss. `touch-action: pan-y` sẵn có trên cả 2 imgwrap nên scroll dọc không ảnh hưởng.

**Verify (Playwright localhost):** computed style body `overscroll-behavior-x: none`, `.scroll: contain`; TouchEvent giả lập x=10 trên imgwrap → `defaultPrevented=true`, x=200 → `false` (không chặn nhầm vùng giữa); carousel chuột + detail viewer vẫn hoạt động bình thường. ⚠ Gesture thật của Zalo/Messenger iOS chỉ verify được trên điện thoại thật — cần user test lại trong app.

**Files:** showroom1/{index.html, detail.js} (`?v=20260611e`).

**Status:** ✅ Done — commit này → GH Pages.

### [showroom1] Trang chi tiết SP (bấm ảnh → ảnh lớn swipe + dots) + mô tả sản phẩm (size theo số ký) + Freesize ✅

**User:** bấm vào tấm hình → hiện hình lớn + dấu chấm đếm số ảnh + lướt qua lại; dưới ảnh là thông tin SP (bổ sung mô tả size theo số ký; SP không size mặc định "Freesize"); thêm ô điền mô tả SP bên trang quản lý desktop.

**Backend (`showroom-products.js`, commit `94aff7799` đã deploy):** cột `description TEXT` (ALTER idempotent), `sanitizeText` (giữ newline, cắt 2000 ký tự), POST/PUT nhận `description`, PRODUCT_COLS + rowToProduct trả về.

**Frontend:**

- NEW `showroom1/detail.js` + `detail.css` — `window.ShowroomDetail.open(product, startIdx)`: sheet gần full màn hình (z-index 84, dưới cart 85/picker 86) trong `.screen`: ảnh LỚN aspect 3:4 swipe pointer-events (cùng pattern carousel card) + **dots đếm số ảnh** (bấm dot nhảy ảnh, active dot giãn dài); dưới ảnh: tên (font display 21px), giá (sale gạch + accent), **Size chips — không có size → chip đen "Freesize"**, Màu chips, **khối mô tả** (multi-line esc + `<br>`, nền kem); nút × đóng + scrim; foot "Thêm vào giỏ" → đóng detail TRƯỚC rồi `ShowroomCart.addWithOptions(p, imgEl)` (picker/fly hiện rõ trên pill).
- `index.html`: `bindImgwrap` thêm lại click — tap ảnh (không phải vuốt, có dataset.id) → `ShowroomDetail.open(p, w.__idx)` (mở đúng tấm đang xem, `go()` track `w.__idx`); load detail.css/js `?v=20260611d`; bump admin.js/css `?v=20260611d`.
- `admin.js`: drawer thêm **textarea "Mô tả sản phẩm (size theo số ký, chất liệu…)"** (`#fDesc`, maxlength 2000, placeholder ví dụ size theo kg); openEditor fill + saveDraft gửi `description`; `toPreview` thêm `description`. `admin.css`: style textarea (resize dọc).

**Verify (Playwright localhost):** tap ảnh ĐẦM TAY DÀI HT → detail 5 slides + 5 dots, swipe → dot active đổi, bấm dot về ảnh 1; sizes S/M/L + màu CAM/XANH; ÁO BALO không size → chip "Freesize"; Thêm từ detail: có variant → detail đóng + picker mở, không variant → fly + count; admin nhập mô tả → PUT lưu DB → guest mở detail thấy mô tả đúng (newline → `<br>`). Cleanup: reset description test (thông tin bịa) + empty giỏ test. ⚠ localhost:8080 bị app CRM của session song song chiếm → test trên :8099.

**Files:** showroom1/{detail.js (NEW), detail.css (NEW), index.html, admin.js, admin.css}, render.com/routes/showroom-products.js.

**Status:** ✅ Done — frontend commit này → GH Pages.

### [showroom1] Animation "món hàng bay vào giỏ" khi thêm SP ✅

**User:** SP không có size/màu thêm vào giỏ không thấy dấu hiệu gì → muốn icon món hàng bay vào pill giỏ đen dưới cùng để khách biết đã thêm.

**Thay đổi:**

- `cart.js`: hàm `flyToCart(sourceEl, imageUrl)` — viên tròn 46px chứa ảnh SP bay theo đường cong (WAAPI 650ms, midpoint nâng 44px) từ vị trí card → pill, hạ cánh thì remove + `pulsePill()` (tách từ updatePill). Quy đổi tọa độ viewport→local theo scale của `.screen` (admin preview phone bị transform scale). Respect `prefers-reduced-motion` (chỉ pulse). Fallback browser không WAAPI: setTimeout 900ms dọn + pulse. Gắn vào CẢ 2 đường: thêm thẳng (SP không variant, bay từ `.imgwrap`) + sau confirm picker (bay từ `#pickThumb`, lấy rect trước khi sheet đóng).
- `cart.css`: `.fly-item` (z-index 95, viền paper, shadow) + `.fly-dot` fallback khi SP không có ảnh.
- `index.html`: `bindAddBag` truyền `card.querySelector('.imgwrap')` làm sourceEl; bump `?v=20260611c`.

**Verify (Playwright localhost):** bấm nút giỏ SP không variant → `.fly-item` xuất hiện giữa đường bay (có img, nằm trong .screen), 900ms sau tự remove + pill `pulse` + count đúng; đường picker confirm cũng bay; không sót element. Cleanup giỏ test.

**Files:** showroom1/{cart.js, cart.css, index.html}.

**Status:** ✅ Done — commit này → GH Pages.

### [showroom1] UX giỏ hàng v2 theo feedback user: nút giỏ trên card thay tim + sheet chọn size/màu + nâng pill khỏi mép ✅

**User:** (1) pill giỏ bị mép phone che → đưa lên; icon cookie bên trái dư → xóa; (2) icon trái tim đổi thành icon giỏ hàng, khách bấm NÚT để thêm chứ không bấm ảnh; (3) khi thêm cho khách chọn size/màu — giao diện đơn giản nhất cho người ~40 tuổi.

**Thay đổi:**

- `index.html`: `.floaties` bottom 26→54px (trên mép bo + home indicator); XÓA cookie FAB (button + handler + CSS, gỡ luôn `.fab.chat` chết); CSS `.fav` → `.addbag` (nút tròn trắng 38px nổi shadow, icon lucide `shopping-cart`) áp cho 12 card demo + `buildCardEl`; **bỏ hẳn click-ảnh-thêm-giỏ** trong `bindImgwrap` (ảnh chỉ còn swipe carousel); `bindFav` → `bindAddBag` → gọi `ShowroomCart.addWithOptions(product)` lấy full product từ map mới `window.Showroom._products` (renderGrid build, có sizes/colors/images); bump ?v=20260611b.
- `cart.js`: item thêm `size`/`color` — **cùng SP khác size/màu = dòng riêng** (find theo productId+size+color, row giỏ tham chiếu theo index); `addWithOptions`: SP không có size/màu → thêm thẳng, có → mở **sheet chọn size/màu** (`#pickSheet`, z-index 86): thumb+tên+giá, chips to 48px chữ 15px, nhóm 1 lựa chọn tự chọn sẵn, bấm "Thêm vào giỏ" thiếu chọn → toast "Bạn chưa chọn size/màu" giữ sheet; nút Đóng. Cart sheet row hiện dòng variant `M · CAM`.
- `cart.css`: styles `.addbag` ở index, `.pick-*` (chips to dễ bấm), `.cart-variant`.
- `admin.js/css`: item giỏ khách hiện ` M · CAM` (qua esc(), màu accent).
- Backend `showroom-carts.js` (đã deploy trước, commit `2de07b4b6`): `sanitizeItems` nhận `size`/`color` (≤40 ký tự, strip `<>`), dedupe theo productId+size+color.

**Verify (Playwright localhost + curl prod):** click ảnh KHÔNG thêm (count 0); nút giỏ SP có variant → picker S/M/L + CAM/XANH; confirm thiếu → toast giữ sheet; chọn M+CAM → "Đã thêm vào giỏ · ĐẦM TAY DÀI HT (M · CAM)"; SP không variant thêm thẳng; giỏ + admin đều hiện variant; PUT prod 2 dòng cùng SP khác size OK; cookie FAB mất, floaties 54px. Cleanup giỏ test (#6 còn 2 item test — không có token để empty, sẽ sạch khi TRUNCATE reset counter).

**Files:** showroom1/{index.html, cart.js, cart.css, admin.js, admin.css}, render.com/routes/showroom-carts.js.

**Status:** ✅ Done — frontend commit này → GH Pages.

### [live-chat][render] ⏰ Fix múi giờ GMT+7 — comment livestream hiện giờ UTC (03:47 thay vì 10:47) ✅

**User:** "giao diện web 2.0 toàn bộ là gmt+7 → hiển thị ra phải đúng định dạng gmt+7" (kèm screenshot live-chat hiện 03:47). Ghi rule vào memory + CLAUDE.md + dev-log.

**Root cause (2 lớp):** Pancake `inserted_at` = UTC **KHÔNG hậu tố Z** (vd `2026-06-11T03:52:23`) + **Render server chạy `TZ=Asia/Saigon` (+7), không phải UTC** (verify `GET /api/debug/time`) → server `new Date(naiveString)` hiểu thành giờ +7 → epoch lưu `web2_live_comments.created_time` **lệch −7h** (DB ghi `2026-06-10T20:52Z` cho comment thật sự lúc `03:52Z`). Tầng hiển thị `SharedUtils.formatTime` (Asia/Ho_Chi_Minh) vốn đúng nhưng nhận data sai → UI hiện đúng bằng giá trị UTC.

**Fix:**

- **Server:** `web2-live-comments.js` thêm `parseUtcTs()` (append `Z` cho string không timezone, nhận cả epoch ms/s, export dùng chung) dùng cho upsert `created_time`; poller `web2-livestream-poller.js` thêm `_utcMs()` cho `insertedMs` (cửa sổ RECENT_LIVE) + sort posts.
- **Migration one-time (marker-gated, trong `ensureTables`):** shift `created_time` cũ **+7h** về đúng UTC; marker `web2_migrations.w2lc_tz_fix_20260611` chống double-shift qua restart. Test local DB riêng (create → migrate → idempotent re-run → drop) PASS.
- **Client (live-chat):** thêm `SharedUtils.toEpochMs()`; thay mọi `new Date(raw).getTime()` trên timestamp Pancake naive: live-init (startMs, sort, \_lastCommentMaxMs), live-api (sort campaigns), live-comment-list (sort prepend + note Pancake), live-campaign-manager (sort comment DB), live-livestream-snap (startMs, comment↔snapshot matching ×6, sort campaigns ×3 — matching lệch 7h là bug thật của auto-snap với data đã fix). Formatter hiển thị chốt `timeZone: 'Asia/Ho_Chi_Minh'`: gallery `_fmtTime`, order-history `fmtTime`, customer-panel `formatDate`.
- **Rule mới:** CLAUDE.md quy tắc 10 (Múi giờ Web 2.0 = GMT+7) + MEMORY `feedback_web2_timezone_gmt7` — DB lưu UTC đúng, convert +7 CHỈ ở tầng hiển thị; 2 bẫy naive-string + server TZ.

**Files:** render.com/routes/web2-live-comments.js, render.com/services/web2-livestream-poller.js, live-chat/js/shared/utils.js, live-chat/js/live/{live-init,live-api,live-comment-list,live-campaign-manager,live-livestream-snap,live-livestream-gallery,live-order-history,live-customer-panel}.js, live-chat/{index,chat}.html (v=20260611j), CLAUDE.md.

**Hậu kiểm + migration #2:** verify trực tiếp pancake.vn REST (posts/conversations/messages) → cả 3 đều **UTC naive** ✓. Sự cố phụ: hook auto-commit của session song song đã commit parse fix **tách rời** migration (`88e456aa3` deploy 04:05Z chưa có migration) → rows ghi đúng trong cửa sổ 04:05–04:13Z bị migration #1 (deploy `289881ad9` boot 04:13Z) +7h đè thành tương lai (E+7h, vd `11:12Z` cho comment `04:12Z`). Fix: **migration #2** (`w2lc_tz_fix2_20260611`) heuristic tự phát hiện `created_time > created_at + 1h` (comment không thể được lưu trước khi xảy ra) → −7h; test local DB 3 case (over-shift/correct/backfill) PASS + idempotent. Bài học: parse fix + data migration PHẢI cùng 1 commit/deploy.

**Status:** ✅ Done — migration #1+#2 tự chạy khi Render deploy (request đầu chạm `ensureTables`); verify created_time khớp giờ thật sau deploy `2012271c7`.

### [docs][web2] Audit VÒNG 2 toàn bộ 35 trang menu Web 2.0 — verify fix Wave 1+2 + catalog 25 bug mới CONFIRMED ✅

**User:** "Xem, đọc, phân tích chi tiết tất cả từng trang trong menu web 2.0 → tìm bug/race → cập nhật overview + file MD → kiểm đi kiểm lại → đề xuất cải thiện/tính năng mới."

**Phương pháp:** 8 agent re-audit song song theo nhóm trang (đọc frontend + backend route + SSE wiring, verify TỪNG bug vòng 1 bằng code thật) + 3 agent đối chứng adversarial cho 25 phát hiện nghiêm trọng → **25/25 CONFIRMED**.

**Kết quả verify vòng 1 (Wave 1+2 đứng vững):** 8/8 Top CRITICAL fixed thật; Bán Hàng 16/18; Sản phẩm 7/9; reconcile/refunds/delivery state-machine + FOR UPDATE + retry-23505 đều đúng; auth web2-users mutation + rate-limit + WEB2_PAGES đủ.

**Bug MỚI đang mở (full list ở `docs/web2/WEB2-PAGES-ANALYSIS.md` mục 1):**

- 7 CRITICAL tiền/kho: bulk-cancel PBH không restock/hoàn ví + chặn recover; DELETE Thu Về race double; reassign SePay lặp vòng mất tiền (withdraw không idempotent) + audit log không bao giờ ghi (thiếu require web2MatchAudit); confirm-purchase-partial FOR UPDATE ngoài transaction = vô hiệu; quick refund NCC thiếu `await SW.load()` → ví NCC không bao giờ ghi; merge/split sinh mã COUNT+1 → 23505.
- 7 CRITICAL bảo mật: web2-generic delete-all/\_vacuum public; payment-signals /approve (money) không auth; pancake-accounts leak FULL JWT; web2-pancake-refresh = brute-force proxy; GET /sse broadcast số dư ví không auth; stored XSS attribute-injection (escapeHtml không escape quote, lan 87 trang); XSS javascript: URL notification.
- 16 HIGH: PBH cancel không hoàn wallet_deducted; trang Phân quyền CHẾT (3 shape mismatch); báo cáo giao hàng cột NVC trống (carrierName vs groupName); SSE ví đứt 2 lớp (eventType wallet_update + wildcard key mismatch + topic wallet:all chết); live-chat delta miss comment UPDATE; v.v.

**Files:** docs/web2/WEB2-PAGES-ANALYSIS.md (viết lại — mục 1 = danh sách bug canonical vòng 2 + lộ trình fix 5 đợt A-E + 10 đề xuất tính năng), web2/overview/index.html (#auditPages: badge vòng 2 + block bug mới đang mở), docs/dev-log.md.

**Status:** ✅ Audit done — bug CHƯA fix (chờ đợt A-E theo lộ trình mục 5 file MD).

### [live-chat][render] PUSH-only realtime comment (bỏ hoàn toàn polling) + FIX capture lock failover "máy giữ lock không capture" ✅

**User:** (1) tiếp tục refactor "logic đơn giản hơn — server Pancake WS nhận tin nhắn/bình luận 24/7 → lấy comment livestream từ đây xem trực tiếp"; (2) "bỏ hoàn toàn polling ở live-chat — live-chat CẦN TIN NHẮN TRỰC TIẾP"; (3) bug "1 máy capture duy nhất": máy giữ lock nhưng KHÔNG capture → không máy nào chụp.

**A. Realtime comment PUSH-only (hoàn tất refactor dở + bỏ polling):**

- Hoàn tất refactor working-tree: `live-realtime.js` neuter TPOS SSE/WS thành NO-OP (giữ shape cho caller); `live-api.js` gỡ TPOS token + authenticatedFetch; `pancake-api.js` gỡ Authorization TPOS; `live-init.js` load comment 100% từ DB `web2_live_comments` (1 row/comment) + SSE `web2:live-comments` → `_fetchLiveCommentDelta()` (GET since=`_lastCommentMaxMs`, debounce 400ms, prepend incremental — không full reload).
- **Bỏ polling:** server `web2-livestream-poller.js` `start()` KHÔNG chạy `_loop()` cycle 5s/30s nữa — chỉ init deps. Comment giờ PUSH-only: relay Pancake WS (`live-chat/server`, 24/7) → `POST /ingest` → `pollPostNow(page,post)` fetch per-message ĐÚNG post có event (debounce 1.5s) → upsert + SSE. Giữ `pollNow()` on-demand (lookup KH tier-3) + client `POST /poll-now` (one-shot warm-up khi mở campaign — backfill phần relay miss lúc deploy).
- `pancake-realtime.js` (chat.html): GỠ auto-refresh polling fallback (fetchConversations 30s khi WS chết) → thay bằng slow WS retry 60s vô hạn; tin nhắn còn đường SSE `web2:messages` song song.
- **Verified localhost:** index 315 comments từ DB + topics `web2:live-comments`/`web2:messages`/`web2:capture-lock` subscribed + delta fetch chạy thật (lastMax advance) + 0 console error; chat.html 75 convs + WS connected + `startAutoRefresh` không còn tồn tại; network 0 call TPOS.

**B. Capture leader lock FAILOVER (`live-livestream-snap.js`):**

- **Root cause:** heartbeat 30s renew lock MÙ QUÁNG khi frame buffer timer còn chạy — máy giữ lock mà capture không ra frame (tab unfocused với captureVisibleTab, screen lock, stream chết, modal Enter chưa bấm) giữ lock VĨNH VIỄN; máy standby chỉ retry 10 phút rồi poll chết hẳn.
- **Fix:** (1) track `STATE.lastFrameAt` mỗi frame thành công (cả 2 path stream/extension); heartbeat thấy stall > 75s → **tự nhả lock + dừng capture + gỡ iframe** (máy khác takeover ≤90s sau khi frame cuối); (2) cooldown 3 phút chống máy stall tự cướp lại ngay (xóa khi tab visible lại; click tay luôn override); (3) poll standby 2 pha: 3s × 10 phút → 30s VÔ HẠN (không chết nữa); (4) SSE `web2:capture-lock` thêm nhánh standby: lock được nhả/hết TTL → `_maybeShowAutoSnapBanner()` ngay (stagger ≤1.5s, CAS server chống herd).
- Debug accessors mới `LiveLivestreamSnap._lockDebug` (get/forceStall/blockFrames) cho test script.
- **Verified production lock API:** capture chạy (heartbeat ON, frames flow) → frames ngừng tự nhiên → đúng 90s sau heartbeat nhả lock (`holder=null, releasedAt` set), cooldown=release+180s, capture/iframe dừng sạch; không tự re-acquire trong cooldown.

**Files:** live-chat/js/live/live-realtime.js, live-api.js, live-init.js, live-livestream-snap.js, js/pancake/pancake-api.js, pancake-realtime.js, index.html + chat.html (bump v=20260611g), render.com/services/web2-livestream-poller.js, render.com/server.js.

**Status:** ✅ Done — cần Render deploy để poller tắt trên prod (auto-deploy theo push).

### [showroom1] Mã định danh khách vãng lai (visitor ID từ 1) + giỏ hàng server-side + tra cứu admin ✅

**User:** khách lạ bấm link showroom1 (từ Messenger/Zalo) → cấp mã định danh đơn giản tăng dần từ 1, hiện mã thay FAB chat đen; thêm SP → lưu giỏ theo mã; bấm mã → bảng giỏ nhanh không chuyển trang; khách chốt đơn chỉ cần gọi/nhắn mã → shop tra giỏ.

**Backend (Web 1.0 — pool chatDb, theo pattern showroom-products):**

- NEW `render.com/routes/showroom-carts.js` — mount `/api/showroom-carts` (public): `POST /visitors` cấp mã BIGSERIAL từ 1 + token 32-hex (chống đoán ID tuần tự; rate-limit 10/IP/giờ + cap DB 500/giờ; cleanup giỏ rỗng >30 ngày ~4% request); `GET /:id?token=` (404→client tự đăng ký lại, 403 sai token); `PUT /:id` full-replace 1 câu SQL atomic + `sanitizeItems` (max 50 items/50KB, strip `<>` chống stored-XSS vào admin, image phải https://, qty 1–99); `GET /?recent=N|?id=` cho admin (total/itemCount server-side, KHÔNG bao giờ trả token). SSE hub Web 1.0 topic `showroom_carts` broadcast sau PUT.
- `server.js`: require + mount + `initializeNotifiers(realtimeSseRoutes.notifyClients)`.
- Cloudflare worker: route `SHOWROOM_CARTS /api/showroom-carts/*` → handleCustomer360Proxy (routes.js pattern + matcher, worker.js case).

**Frontend khách (`showroom1/`):**

- NEW `cart.js` — IIFE: init đọc LS `showroom1_visitor` {id,token} → GET khôi phục giỏ (404/403 → re-register; lỗi mạng → cache `showroom1_cart_cache` offline); chưa có → POST /visitors → toast "Xin chào! Mã khách của bạn: #N" + pill pulse. `window.ShowroomCart={add,open,close,getCount}`. UI-first: mutation render ngay, debounce 800ms PUT, lỗi mạng KHÔNG rollback (cache + retry ở mutation kế/online event/mở sheet); 403/404 khi save → cấp mã mới + re-PUT giữ items. Bottom-sheet (tái dùng CSS `.sheet` sẵn có, append vào `.screen`): rows thumb/tên/giá/stepper/xóa, tạm tính, mã to + hướng dẫn + nút Gọi/Zalo/Messenger (**CONTACT placeholder đầu cart.js — user điền SĐT/Zalo thật**).
- NEW `cart.css` — pill `.fab.idpill` (thay #chatFab), `.pill-n[hidden]` fix, pillPulse, cart rows/foot. **Fix bug test bắt được: `.sheet` base không z-index còn scrim z-index 80 → scrim chặn click trong sheet → thêm `.sheet.cart-sheet{z-index:85}`** (dưới toast 90).
- `index.html`: #chatFab → #idPill shell; click ảnh SP build product từ `card.dataset.id/.price` → `ShowroomCart.add()` (card demo không id → toast như cũ); `buildCardEl` set `dataset.id+price` (giá hiệu lực sale); script cart.js?v trước admin.js; bump ?v=20260611a.
- `admin.js`: `toPreview()` thêm `id` (trước đây BỎ id → guest card không tham chiếu được SP); mục **"Giỏ hàng khách"** cuối panel: list ?recent=30 (mọi field qua esc() — tên SP do khách gửi), search theo mã (lọc local + fallback ?id= server), EventSource RIÊNG `?keys=showroom_carts` chỉ mở khi isAdmin (không nới SSE_URL chung — tránh guest reload SP khi khách sửa giỏ), debounce 500ms. `admin.css`: styles `.adm-carts*`.

**Verify:** curl qua worker: POST→{visitorId:1,token}, PUT sanitize `<script>`→strip, GET 403/404 đúng, list không lộ token, SSE event `update {visitorId,itemCount}` nhận realtime. Playwright localhost: guest auto cấp #2, 20 SP thật đều có dataset.id, add 3 SP → pill count 3 + PUT 200, sheet mở trong khung phone (tổng 790k đúng), stepper/xóa/scrim-close OK, reload giữ mã+giỏ, admin panel hiện 2 giỏ + **SSE: PUT từ ngoài → admin tự update "vừa xong" không reload**, search #1/#999 đúng. Console 0 error (trừ favicon). Cleanup: 2 giỏ test đã empty.

**⚠ Còn lại:** (1) CONTACT trong cart.js là placeholder — cần SĐT + link Zalo thật; (2) visitor #1–#2 đã dùng cho test, khách thật bắt đầu từ #3 (muốn reset về 1 cần TRUNCATE RESTART IDENTITY trên Render DB); (3) token lộ trong query-log worker (GET ?token=) — chấp nhận v1.

**Files:** render.com/routes/showroom-carts.js (NEW), render.com/server.js, cloudflare-worker/{worker.js, modules/config/routes.js}, showroom1/{cart.js (NEW), cart.css (NEW), index.html, admin.js, admin.css}.

**Status:** ✅ Backend + worker đã deploy & verify prod. Frontend commit này → GH Pages.

### [live-chat] Tách kiến trúc: index = comment full + Kho SP + capture (1 máy) · chat.html = trang chat Pancake riêng · modal 💬 chat từ comment ✅

**User:** (1) PC bỏ panel phải để panel comment full — mỗi comment có nút mở ĐOẠN HỘI THOẠI full chức năng như native-orders; trang này giữ iframe + chụp thumbnail/Force extract; mobile không capture; **1 máy capture duy nhất** để khỏi đè dữ liệu giữa các máy. (2) Trang riêng cho panel phải để chat với khách — full chức năng. (3) Ghi devlog/MEMORY/CLAUDE: mở browser test web nhớ thêm extension n2store. (4) "cần kho sp để kéo vào comment tạo đơn" → giữ Kho SP panel phải trên index.

**`live-chat/index.html` (Live Comment):**

- GỠ cột chat Pancake + resize handle + Pancake selector topbar → cột comment Live chiếm toàn bộ; panel phải **Kho SP 320px** (`PancakeInventoryPanel.init(#khoSpHost)` — mount thẳng, không qua mode-switcher; nút thu gọn lưu localStorage; drag SP vào comment row tạo đơn giữ nguyên). Mobile (`lc-mobile`) ẩn Kho SP.
- Mỗi comment row thêm nút **💬 "Mở hội thoại"** → `LiveChatModal.open({fbUserId, name, pageId})` (module MỚI `js/live/live-chat-modal.js`): resolve hội thoại qua `Web2Chat.fetchConversations` (ưu tiên INBOX) → mount **Web2ChatPanel** + adapter `PancakeChatWindow._buildAdapter` (extension-first bypass 24h, sticker, upload, quick reply, Thêm vào KH, mark read — đúng stack native-orders). SSE `web2:messages` refresh thread đang mở (debounce 800ms).
- Scripts: gỡ pancake UI modules (page-selector/conversation-list/context-menu/realtime/init/mode-switcher) + column/settings-manager; GIỮ pancake core (token-manager/state/api/chat-window) + inventory-panel.
- Topbar: link "Chat Pancake" → chat.html.

**`live-chat/chat.html` (MỚI — Chat Pancake full):** full pancake stack (page selector, conversation list, chat window Web2ChatPanel, context menu, realtime, Kho SP tab, settings modal JWT accounts, CK review) — pancake-init tự initialize qua `#pancakeContent`. Sidebar: Sale Online → "Chat Pancake". Link ngược về index.

**Capture leader lock — 1 MÁY duy nhất (`live-livestream-snap.js`):** lock cross-machine qua web2-generic record (`/api/web2/capture-lock`, code `global`, web2Db) — TTL 90s, heartbeat 30s (`history:[]` mỗi lần ghi để route không phình mảng history), machineId localStorage. `_enableEmbeddedLiveCapture`: auto path bị máy khác giữ lock → im lặng bỏ qua (poll retry); click tay → confirm CƯỚP lock. SSE `web2:capture-lock` → máy bị cướp **tự dừng capture** + toast. `beforeunload` nhả lock (fetch keepalive); chỉ nhả khi lock còn là của mình. Chip 🎬 hiện "📵 Máy X đang chụp" khi bị block.

**Browser test + extension:** ghi CLAUDE.md (section mới trong Browser Test Scripts) + MEMORY.md + reference_browser_test_scripts.md: mở browser test LUÔN truyền `--ext n2store-extension` (script đã hỗ trợ sẵn qua launchPersistentContext).

**Verified localhost:** index — 0 pancakeColumn, cột Live 778px + Kho SP 320px (6 SP active, search OK), 93 rows × 93 nút 💬, modal chat mở thật cho KH "Liên Trương" (panel mount + 25 messages render), 0 console error. chat.html — 403 conversation items render, sidebar + link 2 chiều OK, 0 error.

**⚠ Lưu ý:** capture lock dùng route generic `/api/web2/capture-lock` (đã có sẵn trên Render — không cần deploy backend). Trang index vẫn giữ pancakeSettingsModal markup (dead-but-harmless, modal chính ở chat.html).

**Files:** live-chat/chat.html (NEW), live-chat/js/live/live-chat-modal.js (NEW), live-chat/index.html, live-chat/js/live/live-comment-list.js (nút 💬 + icon message-circle), live-chat/js/live/live-livestream-snap.js (leader lock), web2/shared/web2-sidebar.js, CLAUDE.md, docs/web2/WEB2-PAGES-ANALYSIS.md.

**Status:** ✅ Done.

### [live-chat] Mobile/tablet = chế độ ĐỌC COMMENT (chỉ panel trái) + FIX panel trái re-render khi panel phải nhận tin nhắn ✅

**User:** ban đầu yêu cầu trang riêng comments.html → **đổi hướng: revert, chỉ cần detect mobile/tablet và hiện panel comment trái để đọc; giao diện mobile/tablet ưu tiên đọc comment livestream, tối ưu thân thiện.** (Trang comments.html đã tạo + test xong nhưng revert toàn bộ theo yêu cầu — không commit.)

**Mobile/tablet read-mode (`html.lc-mobile`):**

- Detect UA trong `<head>` (Android/iPhone/iPad/Mobile/Tablet/Silk + iPadOS khai "Macintosh"+maxTouchPoints) → add class TRƯỚC render, không flash 2 cột.
- CSS `lc-mobile`: ẩn cột Pancake + resize handle + topbar phải + sidebar web2-aside + column header → cột Live full màn hình. Override inline flex của column-manager bằng `!important`.
- Thân thiện touch: input SĐT/địa chỉ trong row `font-size:16px !important` (chống iOS auto-zoom khi focus) + `min-height:38px`; selectors/campaign btn min-height 38px; row padding 12px; message 15px/1.5; action btn ≥38px; list `-webkit-overflow-scrolling:touch` + `overscroll-behavior:contain`; topbar wrap gọn.
- `app-init.js`: skip init cột Pancake khi lc-mobile (cột ẩn — khỏi tải conversations thừa).
- `live-livestream-snap.js` `_maybeShowAutoSnapBanner`: return sớm khi lc-mobile — KHÔNG auto-bật iframe capture, KHÔNG prompt cài extension (mobile không có extension, iframe floating che comment).

**FIX bug user báo: panel phải (Pancake) nhận tin nhắn → panel trái (Live) full re-render trắng "Đang tải comment…".** Nguyên nhân: `live-init.js` subscribe SSE `web2:messages` → `onMultiCampaignChange()` full reload + `showLoading()`. Fix: (1) BỎ hẳn subscribe `web2:messages` reload cột Live (tin nhắn inbox là việc của cột Pancake — pancake-realtime tự xử lý); (2) SSE `web2:live-comments` reload chuyển **silent** — `onMultiCampaignChange(ids, {silent:true})` giữ list hiển thị (không showLoading/không clear comments/không clearAllCaches/không stop-start SSE), diff render `_rowSig` patch tại chỗ.

**Verified localhost (Playwright session):** desktop giữ nguyên 2 cột (93 rows); sim `lc-mobile` → pancake/aside/topbar-right/column-header `display:none`, cột Live 1438/1440px, input 16px; silent reload → MutationObserver KHÔNG thấy "Đang tải comment", 93 rows giữ nguyên; 0 console error.

**Files:** live-chat/index.html (detect script + CSS lc-mobile + class top-bar-divider), live-chat/js/layout/app-init.js, live-chat/js/live/live-init.js, live-chat/js/live/live-livestream-snap.js.

**Status:** ✅ Done.

### [live-chat][render] Realtime PUSH thật Pancake WebSocket → SSE (tin nhắn + comment livestream) ✅

**User:** "live-chat cần realtime chứ không cần polling" + cung cấp payload thật livestream comment.

**Bug nền (Render):** service `n2store-tpos-pancake` (Pancake WebSocket relay, code `live-chat/server/server.js`) **fail deploy 1 tháng** vì rootDir trỏ `tpos-pancake/server` (folder đã rename → `live-chat/`). Fix rootDir → `live-chat/server` qua Render API → redeploy → LIVE `1/1 connected`. KHÔNG xóa (đây là engine realtime).

**Kiến trúc realtime (deploy LIVE commit 2a7709656):**

- Relay nhận Pancake WS `pages:update_conversation`/`pages:new_message`. Livestream comment = `conv.type==='COMMENT' && conv.post?.type==='livestream'` (payload thật: post_id, page_id, from, customers[].fb_id, snippet, recent_phone_numbers).
- `forwardToFallback()`: comment → `POST /api/web2-live-comments/ingest` (secret `x-relay-secret`) → `upsertComments` ghi `web2_live_comments` + `_notify('realtime')` → SSE `web2:live-comments`. Inbox → `POST /api/realtime/web2/sse/relay-notify` → SSE `web2:messages`.
- Frontend `live-init.js`: subscribe `web2:messages` (debounce 600ms); `web2:live-comments` đã có sẵn.
- `RELAY_SECRET` set trên relay = `CLEANUP_SECRET` qua Render API.

**E2E verified production:** relay-notify + ingest → SSE client nhận cả `web2:messages` + `web2:live-comments`; `/ingest` gate 401 nếu thiếu secret. ⚠ Còn cần 1 livestream thật để verify Pancake đẩy comment qua WS (relay có log `[REALTIME] livestream comment → ingest`); poller 30s/adaptive 5s vẫn chạy fallback.

**Files:** live-chat/server/server.js, render.com/routes/web2-live-comments.js (+/ingest), render.com/routes/realtime-sse-web2.js (+/sse/relay-notify), live-chat/js/live/live-init.js.

**Status:** ✅ Done — realtime push LIVE.

### [orders-report][render] Rà soát + sửa flow Tạo đơn / Trừ ví / Hủy đơn / Tag / Hoàn ví (Web 1.0 PROD) ✅

**User:** "KIỂM TRA KỸ FLOW TẠO ĐƠN, TRỪ CÔNG NỢ, HỦY ĐƠN, ĐÁNH/HỦY TAG, HOÀN CÔNG NỢ … đưa ra plan thật chi tiết để sửa chữa" → "thực hiện toàn bộ plan".

**Vấn đề gốc (đã xác minh bằng code):** chiều TRỪ ví dùng outbox (`pending_wallet_withdrawals`) khá tốt, nhưng chiều HOÀN ví KHÔNG có outbox đối xứng + nhiều race/lỗ idempotency → có thể mất tiền khách/shop **im lặng** (chỉ `console.log`). 13 finding A1–A13.

**Thiết kế:** tái dùng bảng `pending_wallet_withdrawals` làm **refund outbox**. 1 row = lifecycle trừ→hoàn của 1 đơn. State machine: `PENDING→PROCESSING→COMPLETED→REFUND_DUE→REFUNDED`; hủy PENDING/FAILED→`CANCELLED`; hủy khi chưa có row → INSERT `CANCEL_MARKER` (amount 0) chiếm `UNIQUE(order_id,phone)` chặn trừ trễ. Idempotency anchor = ledger `wallet_transactions` (`ORDER_PAYMENT` / `ORDER_CANCEL_REFUND`).

**Backend (Render):**

- NEW `migrations/075_wallet_refund_outbox.sql`: mở rộng status CHECK (+REFUND*DUE/REFUNDED, exception-safe cho rolling deploy), relax `amount>=0`, cột refund*\* (max_retries=20), index REFUND_DUE/stale-PROCESSING, **`wallet_withdraw_fifo` thêm idempotency guard** (ORDER_PAYMENT đã có → `ALREADY_PROCESSED`, không trừ lần 2 — fix A6).
- NEW `services/wallet-refund.js`: `executeRefund(db,id)` dùng chung route/cron/admin (1 `withTransaction`, lock outbox→wallet, FOR UPDATE virtual_credits + LEAST cap, reconcile ledger khi `completed_at NULL`, giữ REFUND_DUE khi fail = không bao giờ bỏ nghĩa vụ hoàn, alert `WALLET_REFUND_STUCK` khi max retry) + `ensureRefundSchema` (promise-singleton, không mark ready khi thiếu file).
- `routes/v2/wallets.js` rewrite `POST /refund-by-order`: marker + **1 UPDATE atomic** `WHERE status IN ('COMPLETED','PROCESSING')` (fix race mất hoàn — TOCTOU), lookup theo order_id/order_number (không bắt buộc phone khớp), bảo toàn shape response cũ.
- `routes/v2/pending-withdrawals.js`: atomic claim (fix A5 double-deduct + A9 stale-PROCESSING), guarded transitions tôn trọng REFUND_DUE (A12), reject order_id rác (A7), block deduction khi đã hủy (A8), vòng REFUND_DUE + `POST /:id/process-refund`, WITHDRAWAL_FAILED vào CHECK + wrap insert.
- `cron/scheduler.js`: đồng bộ pick stale-PROCESSING + vòng REFUND_DUE → executeRefund.

**Frontend (orders-report):**

- `tab1-fast-sale.js`: `getOrderWalletIdentity` (1 chain định danh dùng cho CẢ trừ+hoàn — fix A7), `WalletFailureStore` (localStorage sổ nợ ví fail + toast sticky + `retryWalletOpFailures()`), race guards (`_cancelledOrderNumbers` clear mỗi batch, `_walletWithdrawalsPromise` reset null), surface trừ-ví fail (A4).
- `tab1-fast-sale-workflow.js`: gộp 2 hàm hủy ~250 dòng → `executeCancelOrder(ctx)` core (A11) + wrapper mỏng; **HOÀN VÍ NGAY sau TPOS cancel, TRƯỚC mutation local** — fail thì THROW + dừng + retry sạch (A1/A2); TPOS fail → throw + finally re-enable nút (A10); `_tposCancelDoneIds` skip TPOS khi retry; `refundWalletForCancelledOrder` (throw) + `logCancelActivity` (no-throw) + `logCancelOrderActivity` compat wrapper (don-inbox).
- `tab1-sale.js`: guard order_id rác + ghi WalletFailureStore cho đơn lẻ.
- Bump `?v=20260611a` (tab1-orders.html + don-inbox).

**Verify:** ground-truth workflow (7 agent) xác nhận finding; adversarial review 5-lens (528K token) → fix 2 CRITICAL (TOCTOU mất hoàn) + nhiều HIGH (wallet_not_found loop câm, virtual_credits over-restore, ensureRefundSchema file-missing, REFUND_STUCK alert câm, WITHDRAWAL_FAILED 23514, frontend promise/set leak). Tất cả JS `node --check` PASS.

**Test — ĐÃ CHẠY THẬT trên Postgres thật (embedded-postgres):** NEW `scripts/test-migration-075-refund-outbox.js` (15 assert: pre-constraint chặn, post-allow, fifo gọi 2 lần → `ALREADY_PROCESSED` không trừ lần 2, re-run idempotent) + `scripts/test-wallet-concurrency.js` (14 assert / 4 race `Promise.all`: double-deduct→1, double-refund→1, CANCEL_MARKER chặn, stuck-PROCESSING reclaim). **🎉 29/29 PASS.** (Đã fix encoding: migration ASCII-clean + test client `client_encoding:'utf8'` cho khớp prod Linux.)

**⚠ Deploy:** migration 075 verified idempotent+additive trên engine thật → lazy `ensureRefundSchema` (chạy ở request refund đầu / cron 5 phút) tự áp an toàn sau deploy; rollback an toàn (schema additive). Backend + frontend bidirectional-compatible nên thứ tự push không vỡ. Sau deploy verify `GET /api/v2/pending-withdrawals/stats` có status REFUND_DUE/REFUNDED.

**Status:** ✅ Code + review + fix + **DB test thật 29/29 PASS**. Sẵn sàng deploy.

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
