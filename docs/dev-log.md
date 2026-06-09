# Dev Log

## 2026-06-09

### [orders] Fast Sale: server-truth guard chống tạo PBH trùng → hết lỗi optimistic concurrency TPOS ✅

**User báo:** 1 máy tạo đơn (KH 0916820743, NJD/2026/71260 & NJD/71242) báo lỗi TPOS `Store update... affected an unexpected number of rows (0)... optimistic concurrency... BusinessException`; hủy không được; hủy ở TPOS không trả tồn kho; **chỉ 1 máy bị**.

- **Chẩn đoán:** tạo PBH trùng cho đơn nguồn ĐÃ có bill → TPOS update đơn nguồn (RowVersion cũ) khớp 0 dòng → 400 + bill kẹt nửa chừng (hủy fail, stock.move không đảo ngược). "1 máy" = cổng chặn trùng `fastSaleOrderHasConfirmedInvoice` chỉ dựa `InvoiceStatusStore` (cache Firebase) → **stale trên 1 máy** (listener mất kết nối) → không lọc đơn đã billed → user re-bill.
- **Fix (`orders-report/js/tab1/tab1-fast-sale.js`):** thêm `findOrdersWithActivePBH(models)` — trước khi gửi `InsertListOrderModel`, fetch FRESH `FastSaleOrder/GetView?$filter=Type eq 'invoice' and Reference eq '<code>'` (mượn pattern đã chạy ổn ở `tab1-sale.js` guard đơn lẻ), loại đơn đã có PBH active (≠ draft/cancel). KHÔNG tin cache. Đồng bộ lại `InvoiceStatusStore` fresh. Fail-OPEN khi token/đọc lỗi. Splice in-place trước `reVerifyWalletForBatch`. All-blocked → abort, không gọi TPOS.
- **Lỗi concurrency** ở catch giờ hiện thông báo hành động rõ (tải lại + kiểm tra PBH kẹt trên TPOS) thay vì raw message. Re-submit an toàn vì guard luôn re-verify.
- ⚠ **Còn việc thủ công (Phần A):** 2 bill kẹt NJD/2026/71260 & NJD/71242 phải xử lý trên TPOS để giải phóng tồn kho — frontend không sửa được dòng RowVersion hỏng.

### [web2][native-orders] Auto-gán balance-history + Chiến dịch cha cho native-orders ✅

- **#1 Auto-gán GD chưa gán** (`web2-balance-history.js`): `POST /auto-assign` — GD 'in' chưa gán → extract exact/partial SĐT + tên người gửi → match `web2_customers` (anchor phone suffix, tên disambiguate khi >1 candidate) → CHỈ gán khi DUY NHẤT 1 KH → `linkTransaction` (gán + cộng ví). Nút "🎯 Tự động gán" + dryRun. **Đã chạy thật: 54 quét → 20 gán, 5 mơ hồ, 29 không định danh.**
- **#2 Chiến dịch cha native-orders** (`native-orders-app.js`+`-api.js`+route): dropdown Chiến dịch thêm section "📁 Chiến dịch cha" — list từ `/api/web2-live-comments/campaigns` (**chung dữ liệu live-chat**), radio chọn 1 parent → resolve post_ids (`/posts`) → lọc đơn theo `fbPostIds` (backend native-orders /load thêm filter `fb_post_id = ANY`). Input "+ Tạo" tạo parent mới. Test live: hiện đúng parent "Web 2.0 livestream test 09/06/2026" (2 bài) từ live-chat.

### [live-chat][render] Bỏ card page-selector + badge Store/House + offline thumbnail + GỠ HẲN TPOS sync worker ✅

- **Bỏ hình 1** (card "Tất cả Pages") panel Chat Pancake (`pancake-init.js`); gear settings → cuối hàng filter-tabs.
- **Badge Store/House** mỗi hội thoại (`pancake-conversation-list.js` `_pageBadge` theo `page_id`); click → `setPageFilter` lọc page (toggle) + nút "✕ Bỏ lọc page".
- **Test live (Playwright)**: card removed ✓; tab all=76/inbox=46/comment=30/live-saved=30 ✓; badge 76/76 House+Store ✓; filter House=21/Store=56 ✓; 0 console error.
- **Offline auto thumbnail** (`live-livestream-snap.js`+`live-init.js`): mở campaign đã end → tự `offlineBatchAll({skipExisting,silent})` lấy thumbnail theo offset broadcast_start. "Chụp Live" vẫn riêng → kho hình.
- **Nút Chiến dịch/Đơn đã tạo** → topbar `#liveTopbarActions` (iframe không che). **Bỏ badge "✓ có đơn" sai** (inv-has-order là marker drop-target gắn mọi row).
- **GỠ HẲN TPOS sync Web 2.0**: xóa `services/web2-sync-worker.js` + `scripts/web2-seed-from-tpos.js` (fetch tomato.tpos.vn/odata, đã tắt từ 2026-06-07). Audit "tpos" toàn Web 2.0: còn lại chỉ comment + cột `tpos_id`/`tpos_data` cố ý giữ. KHÔNG đụng Web 1.0 (sepay-transaction-matching, tpos-token-manager, live POS /api/odata).

### [render][web2] 🔴 GỠ TPOS khỏi matcher SePay — auto-gán KH dùng KHO web2_customers ✅

**User:** balance-history không auto gán được khách nào → matcher dùng đúng kho `web2/customers` chưa? KHÔNG — matcher còn gọi TPOS (đã gỡ).

**Rà soát 3 agent (frontend/services/routes + worker):** frontend SẠCH (chỉ comment/localStorage key tên TPOS). Backend remnant LIVE:

1. `web2-content-extractor.js` `searchTposByPhone()` → gọi `tomato.tpos.vn/odata/Partner` (matcher dùng). **Đã GỠ** (xoá hàm + `tpos-token-manager` require).
2. `web2-sepay-matching.js` 2 chỗ (prelink name + aggregate) → thay bằng `searchWeb2CustomersByPhone(db, …)` (kho `web2_customers`, suffix + alt_phones, gom theo phone CHÍNH). `dataSource='WEB2_CUSTOMERS'`.
3. `native-orders.js` line 702+1635 → gọi `getOrCreateCustomerFromTPOS` (KHÔNG import → **ReferenceError runtime** khi merge/đổi SĐT). **Đã sửa** → `getOrCreateWeb2OrderCustomer` (đã import sẵn).

**Hàm mới** `db/web2-customers-schema.searchWeb2CustomersByPhone(pool, partialPhone)` — exact(index)/suffix/alt_phones, trả cùng shape searchTposByPhone. Dọn comment "TPOS Partner Id" lạc hậu (detector/ck-watcher).

**OK (KHÔNG đụng):** `admin-web2-import-customers.js` (seed 1 lần TPOS→web2_customers), Web 1.0 routes (sepay-wallet-operations, web-warehouse, CF worker TPOS export).

**Test:** `test-web2-customers-search.js` 5/5 + gate 8/8 + ck-watcher 29/29 + ck-features 10/10.

### [live-chat][render] Danh sách đơn theo chiến dịch + SĐT phụ + bỏ click-to-add + backfill Pancake ✅

- **`live-order-history.js` (MỚI)**: nút nổi "📋 Đơn đã tạo" + modal — liệt kê đơn web đã tạo ở (các) chiến dịch đang chọn. Cột STT (`campaign_stt`) | Tên KH | Mã | SL | Tổng | Giờ, sắp theo STT. Tìm kiếm tên/STT/mã/SĐT. Click → `showOrderDetail`. Data `GET /api/native-orders/load?campaignIds=<sel>&channel=web2_livestream`.
- **Bỏ click-to-add** (`inventory-panel.js`): chỉ giữ kéo-thả (click-to-add gây vô tình tạo đơn khi bấm SP rồi bấm comment).
- **SĐT phụ KH** (`web2-customers-schema.js` + `web2-customers.js` + `live-init.js`): KH có trong kho mà SĐT Pancake khác → lưu `alt_phones` (không ghi đè phone chính). Cột `alt_phones` JSONB + `addWeb2AltPhone()` + `POST /add-alt-phone`. live-chat `_captureAltPhones()` tự gom (dedupe).
- **Pill ví Web 2.0**: chuyển lên kế bên tên KH (từ Row 3 cạnh ô SĐT).
- **balance-history realtime** (`sepay-webhook-core.js`): GD SePay mới → SSE `web2:balance-history` → bảng tự cập nhật (khỏi F5). Trước chỉ subscribe `web2:wallet:*` (chỉ fire khi cộng ví).
- **Backfill Pancake → kho** (`admin-web2-import-pancake-customers.js` MỚI): `POST /api/admin/web2-import-pancake-customers` — quét Pancake INBOX (House+Store) gom SĐT+tên+fb_id → upsert kho (không đụng address/status TPOS). Đã chạy: 81 KH linked. (Pancake `page_number` không phân trang → dùng cursor `until`; sâu hạn chế nhưng poller đã enrich live realtime.)

**Status:** ✅ Done. (Web 2.0 không gọi TPOS live; kho seed TPOS 1 lần giữ nguyên, độc lập.)

## 2026-06-08

### [live-chat] Chiến dịch cha trong live-chat + menu + click-to-add (fast order) ✅

- Menu: chuyển "Lấy comment Live (poller)" xuống nhóm **Cấu hình**; bỏ phần chiến dịch cha khỏi trang settings.
- `live-chat/js/live/live-campaign-manager.js` (MỚI): nút nổi "📁 Chiến dịch" + modal — tạo chiến dịch cha, gom bài livestream của page (assign), "Xem comment" gom từ DB.
- `inventory-panel.js`: **click-to-add** (fast order) — bấm 1 SP (armed/outline) → bấm 1 comment → thêm vào đơn KH đó (capture phase, bỏ qua button/select); giữ armed để bán nhiều KH liên tiếp, Esc huỷ. Bổ sung kéo-thả sẵn có.

**Status:** ✅ Done.

### [soluong-live][render][shared] Nút "🔄 TPOS" per-product: ép sync TPOS rồi re-import (biến thể/giá/tên/mã/ảnh) ✅

User: soluong-live (web 1.0) cần lấy dữ liệu mới nhất từ TPOS → nhập sản phẩm lại để cập nhật biến thể, giá, tên, mã, ảnh. Chọn: nút từng sản phẩm + ép sync TPOS trước rồi re-import.

**Files:**

- `render.com/services/sync-tpos-products.js`: tách `PRODUCT_EXPAND` (module const, dùng chung `_syncTemplate`); thêm `syncByTemplateId(templateId)` — 1 detail fetch live TPOS + `_syncTemplate` (preloadedDetail) → upsert shadow, bypass `_isRunning`/sync-log (targeted, không chặn/bị chặn bởi full/incremental). SSE `web_warehouse` action `product_synced`.
- `render.com/routes/v2/web-warehouse.js`: `POST /sync-product/:tposProductId` — resolve template id từ web_warehouse (fallback product id), AWAIT `syncByTemplateId` (blocks tới khi upsert xong, khác `/sync` fire-and-forget), trả `{stats, variants}` đã tươi.
- `shared/js/warehouse-api.js`: `syncProductFromTpos(id)` POST endpoint mới, map rows → TPOS-shaped.
- `soluong-live/js/main.js`: `refreshProductFromTpos(productId, btn)` — gọi syncProductFromTpos (ép TPOS) → **CHỈ cập nhật đúng hàng được bấm** (merge giá/tên/mã/ảnh tươi lên hàng hiện có, KHÔNG đụng hàng khác / không thêm biến thể template), giữ isHidden/hiddenAt/soldQty. Nút `🔄 TPOS` ở mỗi row (list chính + list ẩn) + loading state. Export window.
- `soluong-live/index.html`: CSS `.btn-refresh-tpos` (tím #6f42c1) + bump `?v=20260608b` (main.js), `?v=20260608a` (warehouse-api.js).

> Cập nhật (theo yêu cầu user "cập nhật hàng sản phẩm được bấm / đừng cập nhật hết bảng"): đổi từ `loadProductDetails` (re-import cả template) sang chỉ update đúng 1 hàng `product_<id>`. Server vẫn sync cả template vào shadow (TPOS trả detail theo template) nhưng client chỉ chạm hàng được bấm.

**Verify:** node --check 4 file OK; served HTML/JS chứa button + function + API method. Endpoint `/sync-product/:id` cần Render deploy mới live (click trên prod 404 tới khi deploy).

**Status:** ✅ Code xong, chờ Render deploy để test end-to-end.

### [web2][live-chat] Chiến dịch cha gom livestream + thumbnail chụp tab đang xem ✅

- web2-live-comments route: chiến dịch cha — bảng web2_live_parent_campaigns + web2_live_post_assign; GET/POST/DELETE /campaigns, GET /posts, POST /campaigns/:id/assign, POST /unassign. upsertComments kế thừa campaign_id từ post_assign (comment poller/auto-save tự gom).
- web2/livestream-poller: thêm section tạo chiến dịch cha + gán bài livestream (dropdown) + thống kê.
- live-livestream-snap: auto-snap ưu tiên extension captureVisibleTab khi extReady + iframe live nhúng + tab đang hiển thị (KHÔNG cần share màn hình) — "chỉ chụp tab đang xem".

**Status:** ✅ Hoàn tất hệ thống comment livestream: server poller (đủ comment cả ẩn/SĐT) → DB → live-chat đọc đủ + bền; quản lý trang poller + chiến dịch cha; thumbnail tab đang xem.

### [live-chat] live-chat đọc comment từ DB + trang cài đặt poller ✅

- live-chat `onMultiCampaignChange`: merge comment từ `/api/web2-live-comments` (server poller lưu đủ) với live fetch (dedupe id) → hiển thị ĐỦ + bền; auto-save live comment vào DB; SSE `web2:live-comments` → reload (debounce 2.5s, /bulk không notify để tránh loop).
- `web2/livestream-poller/index.html` + sidebar "Cài đặt lấy comment Live": GET/POST/PATCH/DELETE `/poller-pages` (bật/tắt/thêm/xoá trang tự lấy) + thống kê tổng comment.
- Verify: 90 comment đã lưu (auto-save chạy), page sidebar OK, 0 lỗi.

CÒN LẠI: (a) chiến dịch cha gom livestream (management mới, lớn); (b) thumbnail chụp khi tab active — snap module hiện đã gate theo tab-focus (cần làm rõ trigger mong muốn).

### [web2][live-chat] Server poller lưu comment livestream vào DB (pancake.vn) ✅

Phát hiện: post bật "Ẩn tất cả bình luận" / "Ẩn bình luận có SĐT" → pages.fm public API thiếu comment. Verify: pancake.vn/api/v1 + PANCAKE_JWT (account) trả ĐỦ comment + recent_phone_numbers (cả post ẩn).

- `render.com/routes/web2-live-comments.js`: table web2_live_comments (web2Db) + POST /bulk, GET /, GET /stats; SSE web2:live-comments; export upsertComments/ensureTables. Mount /api/web2-live-comments (+ worker route).
- `render.com/services/web2-livestream-poller.js`: chạy nền Render mỗi 30s, đọc web2_live_poller_pages (seed NhiJudyHouse 117267091364524 + NhiJudyStore 270136663390370), nếu page đang livestream (hoặc vừa kết thúc <30') → kéo TẤT CẢ comment qua pancake.vn/api/v1 + account JWT (từ pancake_accounts, fallback env PANCAKE_JWT) → upsert web2_live_comments. Chạy CẢ KHI client off.
- Verify: GET /api/web2-live-comments/stats = {success:true,count:0} (deploy OK, sẽ tăng khi live).

CÒN LẠI (queued): live-chat đọc từ DB; trang settings poller pages + chiến dịch cha; thumbnail chụp khi tab active.

**Status:** ✅ Foundation + poller deployed.

### [orders] inventory-tracking: bỏ gạch chéo + hiện rõ hơn cho NCC ẩn được reveal ✅

User: "khi ẩn bỏ gạch chéo và cho hiện rõ hơn 1 ít".

**Files:** `inventory-tracking/css/modern.css` (`.shipment-card.shipment-reveal-hidden tr.ncc-row-hidden`).

**Đổi:** bỏ `repeating-linear-gradient(45deg, …)` (gạch chéo đỏ) → nền phẳng `rgba(239,68,68,0.04)`; opacity `0.4 → 0.78`; col-ncc `0.7 → 1`. Hàng NCC ẩn khi bấm "hiện" giờ đọc rõ hơn, không còn vân chéo mờ.

**Status:** ✅ Done.

### [live-chat][web2] Load SĐT/địa chỉ KH vào live-chat (backfill fb_id↔phone) ✅

User: "load sđt, địa chỉ khách nếu có vào live-chat".

**Bug:** live-chat match KH theo FB id của comment, nhưng warehouse (TPOS import) keyed theo phone, KHÔNG có fb_id → 0 match → SĐT/địa chỉ rỗng.

**Fix (warehouse self-sufficient, không couple runtime Web1):**

- `admin POST /api/admin/web2-import-fb-links`: đọc Web 1.0 `customers` (fb_id IS NOT NULL, 3726 rows / 3725 phones) → upsert warehouse theo phone, set `fb_id` + gom mọi fb_id/SĐT vào `fb_psids` ({fbId:fbId}) cho "1 SĐT nhiều FB". Read-only Web1, 1 lần. Kết quả: 3580 updated + 145 inserted.
- `batch-by-fbid`: match `fb_id = ANY OR fb_psids ?| ids` (đa tài khoản).
- `live-init.loadPartnerInfoForComments`: bỏ guard `!crmTeamId` (warehouse chỉ cần fb_id).
- LiveKhoEnricher (đã wire sẵn, đọc warehouse) + partnerCache → fill SĐT/địa chỉ.

**Verify:** live-chat 200 dòng comment → 25 hiện SĐT (KH có trong kho); batch-by-fbid 50/80 match. Coverage tăng dần khi KH order/link thêm.

**Status:** ✅ Done.

### [orders] issue-tracking: nút "Copy hình bill" (bill TPOS thật, giống tab BÁN HÀNG) ✅

User: thêm nút copy hình bill phiếu bán hàng ở modal "Đơn hàng của khách" → **"lấy bill giống bên #ban-hang"** (tab BÁN HÀNG dùng bill in chính thức của TPOS).

**Files:** `issue-tracking/js/customer-orders-lookup.js`, `issue-tracking/css/style.css`, `issue-tracking/index.html` (cache-bust).

**Chi tiết:**

- Mỗi đơn khi expand chi tiết có nút `📋 Copy hình bill` (class `.btn-copy-bill`, delegated click trên `#customer-orders-content`).
- Click → `fetchTposBillHtml(orderId)`: gọi `GET {WORKER}/api/fastsaleorder/print1?ids=<id>` (y hệt `printBill` ở tab BÁN HÀNG) → trả `{html, listErrors}`. HTML rỗng (đơn Nháp/Huỷ) → ném message của TPOS ("Có phiếu bán hàng có trạng thái không cho in…").
- `renderBillHtmlToBlob(html)`: lazy-load html2canvas → render HTML bill TPOS trong **iframe cô lập** (tránh leak style ra trang) → đợi images → html2canvas body scale 2 → PNG blob → `navigator.clipboard.write([ClipboardItem])`. Fallback download nếu clipboard bị chặn.
- Bỏ approach receipt tự dựng (`buildBillElement`) → dùng đúng bill chính thức TPOS (barcode, shop header, bảng SP, tổng/ship/thu hộ, footer bank) = giống hệt tab BÁN HÀNG.

**Test (Playwright localhost):**

- Error path (clone `0123456788`, 148 đơn toàn Nháp/Huỷ): click → toast lỗi đúng message TPOS "không cho in". ✅
- Success path (đơn `open` NJD/2026/70640): fetch print1 → render → `clip=ok`, ảnh PNG 1560×1476, bill TPOS đầy đủ barcode + SP + tổng. ✅

**Status:** ✅ Done.

**Update (cùng ngày):** đưa nút Copy bill **ra khỏi expand** → hiển thị trực tiếp trên mỗi dòng đơn (cột cuối `.order-end` xếp dọc: pill trạng thái + nút `📋 Bill`). Chỉ render cho đơn `open`/`paid` (Nháp/Huỷ không in được). Guard `onRowClick` bỏ qua khi target là `.btn-copy-bill` để bấm nút KHÔNG toggle expand. Không cần load chi tiết (fetch print1 chỉ cần orderId). Test: 5 đơn (4 MỞ + 1 HỦY) → 4 nút, bấm `clip=ok`, `expandedAfter=false`.

— N2Store

### [web2] Gỡ TPOS API khỏi Web 2.0 + import KH TPOS Partner → warehouse (dedupe SĐT) ✅

User: "xóa hết tpos bên Web 2.0" (Web 1.0 giữ: DB columns tpos_id/tpos_data + live TPOS POS cho orders/sepay/invoice). + "lấy dữ liệu partner-customer qua, xử lý trùng sđt".

**Gỡ TPOS API Web 2.0 (4 cụm, đã push):**

- Cụm 1: xóa route `v2/web2-customer-tpos.js` + native-orders customer panel & "Lấy info" → kho warehouse (`/api/web2/customers` + batch-by-fbid).
- Cụm 2: XÓA `web2/partner-customer/` (page TPOS live) + sidebar entry; "Mở thẻ KH" link → `web2/customers`.
- Cụm 3: balance-history + customer-wallet → `web2/shared/web2-customer-lookup.js` (MỚI, warehouse-backed `window.PartnerCustomerApi`: listByPhones→/batch-by-phone, list→/list, status/carrier utils) thay `partner-customer-api.js` (TPOS OData).
- Cụm 4: live-campaign dọn dead TPOS helpers (jsonFetch/ensureTokenManager/CRM/LIVE consts, tposIndex, banner); sidebar bỏ field `tpos:` deep-link.
- Warehouse route: + `POST /batch-by-phone` (partner-compat shape).

**Import dữ liệu (1 lần):** endpoint `POST /api/admin/web2-import-customers` (x-admin-secret) — paginate TPOS Partner Type=Customer (92,265) → pre-dedupe by phone (merge field đầy nhất) → bulk upsert `ON CONFLICT(phone)`. Kết quả: **fetched 92,265 → 2,845 không SĐT (bỏ) + 25,424 trùng SĐT (gộp) → 63,996 KH unique** vào `web2_customers`. Verify: warehouse total = 63,996, search OK.

**GIỮ (Web 1.0/cross-layer):** `tpos-customer-service.js` (sepay/invoice/customer-creation), DB columns `tpos_id/tpos_data`, localStorage `tpos_pancake_*` (inbox/orders-report shared), live TPOS POS `tomato.tpos.vn`.

**Status:** ✅ Done. Web 2.0 không còn gọi TPOS API; KH đọc từ warehouse (63,996 rows).

— N2Store

> Cập nhật liên tục khi code. Mới nhất ở trên.
>
> **Cách tìm nhanh:** Ctrl+F tìm theo ngày `## 2026-`, theo module `[inbox]` `[chat]` `[extension]` `[orders]` `[worker]` `[render]`, hoặc theo status `IN PROGRESS`.

---

## 🔗 Session Resume Protocol (BẮT BUỘC)

> Sau mỗi commit+push xong, **Stop hook tự động** tạo session resume + in token. Claude không cần chạy script thủ công.

- **Tạo (auto)**: hook `.claude/scripts/hooks/stop-auto-commit-push.sh` gọi `bash scripts/save-session-resume.sh` sau khi commit+push → sinh `docs/sessions/<YYYYMMDD-HHMMSS>-<sha7>.md` + commit/push file đó → in token.
- **Token in cuối turn**: `🔗 RESUME:<YYYYMMDD-HHMMSS>-<sha7>` (ví dụ `RESUME:20260513-094400-2f8a169`). User copy paste vào chat mới.
- **Chain walking** khi chat mới nhận token match `RESUME:[0-9]{8}-[0-9]{6}-[a-f0-9]{7}`:
    1. `Read` file `docs/sessions/<token>.md`.
    2. Xem section "7. Previous Session" — nếu có Previous ≠ INITIAL → `Read` file previous đó.
    3. Lặp tối đa **3 levels** mặc định, hoặc đến INITIAL nếu user yêu cầu "full chain".
    4. Tóm tắt 2-3 câu tổng hợp → tiếp tục từ Next Steps của session gần nhất.
- **Sau script chạy**: nên mở file vừa sinh, điền chi tiết **Key Decisions / Next Steps / Context Pointers** (script chỉ fill metadata + file list từ commit message).
- Quy ước đầy đủ: [`docs/sessions/README.md`](sessions/README.md). Template: [`docs/sessions/_TEMPLATE.md`](sessions/_TEMPLATE.md).
- **Vì sao không base64/hash thô**: hash 1-chiều không recover; base64 transcript đầy đủ vài MB không paste nổi → token ngắn + file md trong git + chain pointer là balance tốt nhất.

---

## 2026-06-07

### [live-chat] Đổi tên tpos-pancake → live-chat (purge sạch chữ "tpos") + comment qua pages.fm ✅

User: "đổi tên hết không gì liên quan tpos hết". Rename module live page + xác nhận kiến trúc comment đúng (pages.fm).

**Kiến trúc comment (xác nhận in-browser live thật):** Pancake CHỈ đưa JWT chạy pages.fm, KHÔNG đưa FB EAA (hunt 6 account×4 page = 0 EAA; graph.facebook.com "Bad signature"). → comment lấy qua **pages.fm** (worker `/api/pancake/`, account JWT): posts type=livestream + conversations type=COMMENT lọc post_id. Verify: 3 pages, 26 livestream, 65 comment thật.

**Rename:**

- Folder `tpos-pancake/` → `live-chat/`; `js/tpos/`→`js/live/`, `css/tpos/`→`css/live/`; 12 file `tpos-*.js`→`live-*.js` (live-fb-live-source→live-source).
- Globals `window.Tpos*`→`window.Live*` (LiveApi/State/Realtime/CommentList/CustomerPanel/Source/KhoEnricher/Livestream\*/ColumnManager), `tposTokenManager`→`liveTokenManager`. Purge mọi "tpos/Tpos/TPOS" trong folder (44 file).
- ⚠ GIỮ localStorage keys `tpos_pancake_*`/`tpos_selected_campaigns`/`tpos_snap_*` (contract app-wide: 7 shared file + test scripts — đổi sẽ vỡ Pancake state toàn app).
- External: sidebar menu "TPOS × Pancake"→"Live Chat" + path `../live-chat/index.html`; native-orders 2 link → live-chat.
- KHÔNG đụng `tpos-customer-service.js`/`web2-customer-tpos.js` (module khác: partner-customer/Customer360 vẫn đọc TPOS thật) + shared `tpos-sidebar.js`/`tpos-theme.css` (design-system web2-wide, 80+ trang).

**Verify:** local smoke live-chat/index.html — LiveSource OK, 3 pages/26 campaigns/65 comments, **0 lỗi**.

**Status:** ✅ Done. URL trang đổi /tpos-pancake/ → /live-chat/.

### [delivery-report] Fix ghost-cleanup ẩn NHẦM đơn hợp lệ → báo cáo mất đơn (Part B) ✅

**Vấn đề (user, 06/06):** Báo cáo NAP/TOMATO thiếu đơn so với tra soát/Excel. Trace ra: 3 đơn tỉnh `70995` (Nguyễn Diễm), `70990` (Cỡn Cong), `70991` (Trang Lê) trong DB bị `is_hidden=TRUE` dù trên TPOS vẫn `open` + đã quét → báo cáo (`/by-date-group?scanned_only=1` lọc `is_hidden=FALSE`) loại bỏ. (+ `70950` chỉ chưa quét.)

**Root cause:** `autoCleanupGhosts` (có từ 25/05, KHÔNG phải code session trước) chạy MỖI lần mở báo cáo, gọi `/cleanup-ghosts` ẩn mọi đơn DB **vắng trong 1 lần fetch TPOS live** tại thời điểm đó. Đơn tạo muộn / fetch chưa trùm → bị ẩn nhầm dù còn sống. Guardrail 50% không chặn vì số ẩn nhầm nhỏ.

**Fix (`delivery-report/js/delivery-report.js` `autoCleanupGhosts` + helper `findDeadOnTpos`):** trước khi ẩn, XÁC NHẬN từng candidate trên TPOS (`GetView?$select=Number,State`, reuse pattern `checkCrossCheckStatus`). Chỉ ẩn đơn `State='cancel'` HOẶC không tồn tại trên TPOS. Đơn còn `open`/`paid` → GIỮ. Lỗi/không token → KHÔNG ẩn (fail-safe). Gọi `/cleanup-ghosts` với keep-set = dbCodes trừ dead → backend ẩn đúng đơn đã chết. Bump `index.html` `delivery-report.js?v=20260607b`.

**An toàn:** fix chỉ ẩn ÍT hơn (không thể ẩn nhầm đơn còn sống); không đụng group/scanned/data cũ. `node --check` OK.

**Part A (DONE 2026-06-07):** unhide **6 đơn hợp lệ bị ẩn nhầm** 06/06 (3 nap: 70990/70991/70995 + 3 city: 70988/70992/70994 — đều `open`/`paid` trên TPOS) qua `/unhide-bulk`; GIỮ ẩn 2 đơn `cancel` thật (70977/70970). Verify sau deploy JS mới: mở lại báo cáo → `reHidden=0` (không ẩn lại). Báo cáo 06/06: nap 16→19, tomato 4→5, city 11→14. (70950 tomato chưa quét → nhân viên quét sẽ tự hiện.)

**Reconcile 06/06 khớp Excel manifest (DONE 2026-06-07):** đối chiếu 24 đơn (6 `TOMATO_6_6` + 18 `NAP_6_6`) — verify 24/24 mã đọc đúng (tên KH khớp TPOS), chỉ **1 đơn lệch** `70991` Trang Lê (`nap`→ Excel `tomato`, bị flip trong cửa sổ random trước khi Fix 1 khóa). `PUT /:orderNumber` 70991→tomato (audit `reconcile-excel-6_6`). Báo cáo 06/06 sau: **nap 18 / tomato 6 = đúng Excel 100%**. Group đã khóa (Fix 1) → không nhảy lại.

### [delivery-report] Fix dòng đơn số 7 trong bảng expand bị header "# Số đơn Khách Giờ COD" đè lên ✅

**User:** "đơn số 7 luôn bị lỗi hiển thị thành số đơn khách giờ" (cả tab TOMATO lẫn NAP, vị trí cố định ~dòng 7).

**Root cause (CSS leak qua descendant selector):**

- Bảng chi tiết đơn (`.dr-expand-table`) được chèn **lồng trong `<tbody>`** của bảng báo cáo chính `.dr-report-table` (`toggleExpandRow` → `insertBefore` vào `parentNode` của date row, [report.js:2125](../delivery-report/js/report.js#L2125)).
- Rule `.dr-report-table thead th { position: sticky; top: …; z-index: 2 }` dùng **descendant combinator** → match luôn `thead th` của bảng expand lồng bên trong.
- `.dr-expand-table thead th` **không override** `position/top/z-index` → 3 thuộc tính sticky leak xuống. Header expand "# Số đơn Khách Giờ COD" dính nổi tại `top = --dr-sticky-top-height`, đè lên đúng dòng đơn đang ở vị trí đó (~dòng 7 tuỳ scroll) → dòng đơn thật biến mất sau header, số thứ tự nhảy 6 → 8.

**Files:**

- `delivery-report/css/delivery-report.css`:
    - Đổi `.dr-report-table thead th` → `.dr-report-table > thead th` (scope direct-child, thead bảng chính là con trực tiếp — [report.js:832-833](../delivery-report/js/report.js#L832)). Bảng expand lồng sâu → không còn match.
    - Defensive: thêm `position: static; top: auto; z-index: auto;` vào `.dr-expand-table thead th` (chặn mọi leak sticky tương lai).

**Status:** ✅ DONE — fix CSS thuần, không đụng JS/data. Layer Web 1.0 (delivery-report), không ảnh hưởng Web 2.0.

### [tpos-pancake][live-campaign] GỠ SẠCH TPOS — FB Graph/Pancake/warehouse là nguồn DUY NHẤT (no flag, no fallback) ✅

User: "bỏ mọi thứ TPOS, không fallback — Web 2.0 beta không ai dùng". Cắt hoàn toàn TPOS khỏi cột live + live-campaign (KHÔNG còn flag, KHÔNG fallback TPOS).

**tpos-pancake (`js/tpos/`):**

- `tpos-api.js`: `loadComments` → FB-live only (xóa fallback chain Pancake-graph + TPOS archive). `loadCRMTeams` → Pancake only. `loadLiveCampaigns`/`FromAllPages` → FB Graph only. `getPartnerInfo` → warehouse batch-by-fbid. `updatePartnerStatus`/`ViaProxy`/`savePartnerData` → warehouse PATCH/upsert. `hideComment`/`replyToComment` → Pancake. `loadSessionIndex` → Map rỗng (badge từ native_orders). `getOrderForUser` xóa (unused).
- `tpos-fb-live-source.js`: `enabled()` → luôn true (bỏ flag `web2_live_source`).
- `tpos-init.js` `_fetchLiveVideosForPage` + `tpos-livestream-snap.js` `_fetchLiveVideoInfo` → FB Graph (web2-fb-live), thumbnail qua `/{videoId}/thumbnails` (fix `/picture` 400).
- `tpos-kho-enricher.js` → `/api/web2/customers/batch-by-fbid` (bỏ Web1.0 `/api/v2/customers/batch`).
- XÓA `tpos-partner-fallback.js` (TPOS OData) + gỡ load `partner-customer-api.js` + `token-manager.js` (TPOS) khỏi index.html.
- Còn `tposTokenManager` (pancake chat + WS vẫn cần) + dead EventSource trong `tpos-realtime` (unreachable, enabled()→true) — không execute TPOS.

**live-campaign:** `loadPages`/`loadLiveVideos` → rỗng (TPOS CRMTeam/livevideo gỡ; cần Pancake token không có trên trang — dropdown Page/Live tạm trống, tạo chiến dịch chỉ cần Name).

**Verify:** local smoke 2 trang — **0 lỗi**, `TposFbLiveSource.enabled()=true`, `TposPartnerFallback=undefined`. node -c all OK. Backend (web2-fb-live + web2-customers batch-by-fbid + web2-live-campaigns) đã live prod. ⚠ CHƯA verify cột live với livestream thật (JWT test account không có page) — user chấp nhận (beta).

**Status:** ✅ Done — cột live + live-campaign 100% TPOS-free, no fallback. Deploy.

### [tpos-pancake][live-campaign] Cắt TPOS phần còn lại: picker FB Graph + live-campaign CRUD→web2 ✅

Tiếp "code tất cả verify sau". Hoàn tất gỡ TPOS khỏi cột live (flag-gated) + chuyển live-campaign CRUD sang Web 2.0.

**1) Picker page+campaign → Pancake/FB Graph (flag-gated, fallback-safe):**

- `tpos-fb-live-source.js`: thêm `fetchPagesAsCrmTeams()` (Pancake `fetchPages` → shape crmTeams/allPages giống TPOS) + `fetchVideosAsCampaigns(pageIds)` (`/api/web2-fb-live/videos` → shape liveCampaign: Id=videoId, Facebook_LiveId=pageId_videoId, DateCreated, thumbnail).
- `tpos-api.js`: `loadCRMTeams`/`loadLiveCampaigns`/`loadLiveCampaignsFromAllPages` — flag ON → nguồn FB Graph; lỗi/rỗng → fallback TPOS. Helper `_fillCampaignPageNames`.
- → Flag ON: cột live HOÀN TOÀN độc lập TPOS (pages + campaigns + comments + realtime). Flag OFF (mặc định): TPOS như cũ.

**2) live-campaign CRUD → Web 2.0 (Phase B):**

- Backend `render.com/routes/web2-live-campaigns.js` (mount `/api/web2-live-campaigns`): bảng `web2_live_campaigns` + CRUD (list/get/create/PUT/delete) + SSE `web2:live-campaigns`. Response giữ field TPOS-compat (Id/Name/IsActive/Config/Facebook\_\*/DateCreated) → app.js KHÔNG đổi.
- `live-campaign-api.js`: list/getOne/create/update/setActive/remove → `w2Fetch` (plain, KHÔNG cần TPOS token) trỏ web2 route. Excel giữ nguyên (đã off-TPOS). Dropdown Page/Live video trong modal TẠM vẫn TPOS (bước sau dùng Pancake/web2-fb-live).
- server.js mount + SSE; worker route `/api/web2-live-campaigns/*` → Render.

**Verify:** syntax all OK. DB schema test local (`web2_live_campaigns` ensureSchema idempotent + CRUD) PASS. Local smoke: tpos-pancake (flag off) + live-campaign load OK, 0 lỗi (trừ pre-existing TokenManager double-declare). CRUD prod verify sau deploy. Live column verify buổi live kế (bật flag `web2_live_source=fbgraph`).

**Còn lại:** dropdown Page/Live video trong modal live-campaign (TPOS→Pancake); campaign-id unify (C4) nếu cần khớp Excel; verify live thật.

**Status:** ✅ Done (code). Verify live sau.

### [tpos-pancake] Rewire cột comment live TPOS→FB Graph (flag-gated, fallback-safe) ✅

"Rewire mù, verify buổi live kế" + yêu cầu "chọn chiến dịch cũ coi comment cũ". Đảo nguồn comment livestream khỏi TPOS sang FB Graph (`web2-fb-live`), AN TOÀN tối đa: **flag mặc định TẮT** → cột chạy TPOS y như cũ; bật flag để verify; sai thì tắt = về TPOS ngay (không mất comment live).

**Bật/tắt:** console `localStorage.setItem('web2_live_source','fbgraph')` rồi reload (tắt: `removeItem`).

**Files:**

- `render.com/routes/web2-fb-live.js` — `mapComment` đổi sang **FB-native shape** (`{id,from:{id,name},message,created_time,parent,attachment}`) → tái dùng `TposRealtime.handleSSEMessage` + comment-list KHÔNG đổi.
- `tpos-pancake/js/tpos/tpos-fb-live-source.js` (MỚI) — `TposFbLiveSource`: `enabled()` (flag), `loadComments(pageId,postId)` (1-shot, cả VOD/chiến dịch cũ qua `/api/web2-fb-live/comments?liveVideoId=`), `startRealtime/stopRealtime` (POST `/poll/start` + `Web2SSE.subscribe('web2:livestream:<id>')` + keepalive 5'). Token = Pancake `getPageAccessToken` (FB token thật). `videoId(postId)` tách `pageId_videoId`.
- `tpos-api.js loadComments` — flag ON + !afterCursor → dùng FB-live; **lỗi → fallback TPOS** (try/catch).
- `tpos-realtime.js startSSE` — flag ON → `startRealtime` (skip EventSource TPOS); `stopSSE` → `stopRealtime` cleanup.
- `index.html` — load `tpos-fb-live-source.js` + bump ?v tpos-api/tpos-realtime.

**Verify:** local smoke (flag OFF): module load OK, `enabled()=false` (TPOS default), `videoId('x_7890')='7890'`, 0 lỗi từ code mới. Backend `/api/web2-fb-live/*` đã live qua worker (verified). **CHƯA verify với live thật** (cần Pancake token tươi + livestream đang chạy) — đúng thoả thuận "verify buổi live kế".

**Còn lại:** campaign/video discovery (`/videos`) + page list vẫn lấy từ TPOS khi flag ON (comments + realtime đã FB Graph). Bước sau: rewire campaign picker sang `/api/web2-fb-live/videos` (Pancake pages) → cắt TPOS hẳn. Phase B (live-campaign CRUD→web2) + C4 (campaign-id) chờ chốt.

**Status:** ✅ Done (comment load + realtime, flag-gated). Chờ verify live.

### [render] Phase C-backend — `web2-fb-live.js`: FB Live thay TPOS (additive, an toàn) ✅

Research xác nhận `page_access_token` từ Pancake `/v1/pages` = FB page token thật → gọi thẳng graph.facebook.com, không cần TPOS. Worker đã có sẵn `/api/facebook-graph?path=` proxy graph.facebook.com trực tiếp.

**File mới `render.com/routes/web2-fb-live.js`** (mount `/api/web2-fb-live`, additive — chưa frontend nào gọi → KHÔNG phá path TPOS):

- `GET /videos?pageId=&token=` — FB Graph `/{pageId}/live_videos` + thumbnail batch `/{videoId}/thumbnails` (fix bug `/picture` 400, lấy `is_preferred`).
- `GET /comments?liveVideoId=&token=&since=` — 1-shot comments (load/VOD).
- `POST /poll/start {liveVideoId,pageId,token}` — bật poller server-side (2.5s, dedupe by id, cursor `since`), broadcast comment mới qua SSE `web2:livestream:<liveVideoId>`. Idempotent + keepalive (tự tắt sau 8' không refresh) + auto-stop khi FB token error (190/200/100) hoặc 5 lỗi liên tiếp. MAX 20 poller.
- `POST /poll/stop`, `GET /poll/status` (debug).

server.js: mount + wire `web2FbLiveRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients)`.

**Verify:** `node -c` OK. Runtime test khi frontend wire (cần page token + live thật). Đây là nền cho rewire frontend live column (TPOS→FB Graph) ở bước sau.

**Status:** ✅ Done (Phase C backend foundation).

### [web2/bill] PBH đổi mã vạch Code128 → QR Code ✅

**User:** PBH đổi qua QR code.

**Fix (`web2-bill-service.js`):** thêm `_renderCodeMarkup(value)` render **QR** (davidshimjs/qrcodejs → canvas → PNG dataURL, correctLevel M) + số PBH (HRI) dưới QR; thay `_renderBarcodeSvg` ở `buildBill`. Giữ Code128 làm **fallback** nếu QR lib chưa load. CSS `.b-qr` (38mm vuông, canh giữa, pixelated) + `.b-qr-num` (monospace).

**Vendor lib:** `web2/shared/qrcode.min.js` (davidshimjs, 20KB) — load offline trong parent (bill pre-render, không CDN lúc in). Thêm `<script>` vào 3 trang dùng bill: `native-orders`, `web2/fastsaleorder-invoice`, `web2/printer-settings` (cạnh jsbarcode, `?v=20260607qr`). Bump `web2-bill-service.js?v=20260607qr`.

**Reconcile KHÔNG cần sửa:** máy quét 2D đọc QR → gõ text `NJ-...` y như Code128; `PBH_NUMBER_RE` khớp.

**Files:** `web2/shared/web2-bill-service.js`, `web2/shared/qrcode.min.js` (mới), `native-orders/index.html`, `web2/fastsaleorder-invoice/index.html`, `web2/printer-settings/index.html`.
**Verify (localhost):** `Web2Bill.generateHTML` → có `.b-qr` img + `b-qr-num` "NJ-20260604-0004", KHÔNG còn `barcode-svg`. Decoder ZXing đọc QR đúng ở 300/120/80px (bill in 38mm → thừa sức quét).

### [web2] Phase 3 — Trang Kho Khách Hàng `web2/customers` (warehouse UI, KHÔNG TPOS) ✅

**Mục tiêu (plan Phase 3):** Frontend cho warehouse `web2_customers` — đọc/ghi `/api/web2/customers/*`, độc lập TPOS. Nguyên tắc **1 SĐT (10 số) = 1 KH** (phone UNIQUE), 1 KH nhiều FB account (fb_id/global_id + aliases).

**Files mới (`web2/customers/`):**

- `index.html` — layout: page head + toolbar (Thêm/Xuất CSV/Gộp) + stats filter chips (status) + bảng (checkbox, tên+source, SĐT+pill ví, FB identity badges, địa chỉ, status, đơn/chi tiêu, actions) + pagination + modal Thêm/Sửa (đủ field warehouse + nhóm FB identity + history timeline). Load shared modules (sse-bridge, qr-modal, wallet-balance, chat, customer-detail-modal, user-info, history-timeline, optimistic).
- `js/customers-api.js` — wrapper `/api/web2/customers` (list/create/update/delete/merge/upsert) + dual base (CF Worker → Render direct fallback).
- `js/customers-app.js` — list/search(debounce)/filter(status+source)/paginate + modal Thêm/Sửa + row actions (Chi tiết→`Web2CustomerDetailModal`, QR→`Web2QrModal`, Sửa, Xóa với soft-archive nếu có đơn) + Gộp KH trùng (chọn 2 → `/merge`) + Export CSV + SSE `web2:customers` (debounce reload) + pill ví (`Web2WalletBalance`).
- `css/customers.css` — style riêng (prefix `wc-`), dùng token `--tpos-*`, modal class `modal-content/modal-body` (thừa hưởng anti-lag Tier1).

**Files sửa:**

- `web2/shared/tpos-sidebar.js` — thêm menu "Kho Khách Hàng (Web 2.0)" (`web2/customers/`) trong nhóm Khách hàng; đổi label partner-customer → "Khách hàng (TPOS live)"; thêm vào allowlist web2.
- `web2/shared/web2-customer-detail-modal.js` — bỏ text "đồng bộ TPOS" (warehouse độc lập TPOS).

**Test:** local smoke (Playwright headless): page load OK, sidebar mounted, 10 shared modules loaded, modal Thêm mở OK, 0 console error. Backend đã auto-deploy (Render) → CRUD prod verified end-to-end: create → list/search → patch → delete → verify gone (cleanup sạch). `/api/web2/customers/list` trả `{success,data:[],total:0}` (warehouse rỗng beta). SSE hub `web2:customers` alive.

**Status:** ✅ Done (Phase 3 frontend). Còn: gỡ TPOS khỏi tpos-pancake/live-campaign (scope riêng).

### [render] Phase 1 — Kho KH warehouse Web 2.0 `web2_customers` (gộp 1 bảng DUY NHẤT, BỎ TPOS) ✅

**Mục tiêu (plan `docs/plans/web2-customer-warehouse.md`):** Web 2.0 có kho KH riêng, độc lập hoàn toàn TPOS. Trước đó có **2 bảng** gây nhầm: `web2_customers` (TPOS-coupled, id=Partner Id, cột `tpos_raw`) + `web2_order_customers` (kho KH đơn, Pancake/FB). Gộp thành **1 warehouse `web2_customers`** (id BIGSERIAL, phone UNIQUE, `fb_psids` JSONB multi-page + `global_id`, KHÔNG `tpos_id`/`tpos_data`).

**Files:**

- `render.com/db/web2-customers-schema.js` — REWRITE: warehouse schema mới (no TPOS) + one-time migration beta (DROP bảng `web2_customers` cũ nếu có cột `tpos_raw` + DROP `web2_order_customers`) + helpers `getOrCreateWeb2Customer/findWeb2CustomerByFbId/linkWeb2CustomerFbId/lookupWeb2CustomerIdByPhone` (không TPOS).
- `render.com/services/web2-order-customer-service.js` — REWRITE: adapter mỏng → warehouse `web2_customers`, giữ export name cũ (`getOrCreateCustomerFromTPOS`, `lookupCustomerIdByPhone`) cho native/fast-sale/customer-tpos không phải đổi import. Body bỏ enrich/lookup/push TPOS.
- `render.com/routes/v2/web2-customers.js` — REWRITE: warehouse-native CRUD đầy đủ (`/list`, `/search`, `/:phone`, `/by-phone/:phone/orders`, `/:phone/fb-conversation`, `/create`, `/upsert`, `/enrich-fb`, `/merge`, PATCH `/:id`, DELETE `/:id`) + SSE `web2:customers`. Bỏ mọi TPOS push/lookup. Mount path GIỮ `/api/web2/customers` (đã đúng convention `/api/web2/<entity>`) → frontend ~10 file không đổi.
- `render.com/routes/native-orders.js` — repoint `web2_order_customers` → `web2_customers`; bỏ TPOS enrich (`searchCustomerByFbUserId`) + bỏ push 2-chiều (`pushCustomerToTPOS`); rewrite `upsertCustomerFromOrder` INSERT theo schema mới (bỏ `pancake_data`, dùng cột `fb_page_id`, epoch ts).
- `render.com/routes/fast-sale-orders.js`, `routes/pbh-reports.js`, `routes/v2/web2-customer-orders.js` — repoint table → `web2_customers`.
- `render.com/routes/v2/web2-customer-tpos.js` — giữ ĐỌC live TPOS (Customer 360/partner-customer, scope riêng), repoint GHI → warehouse `web2_customers`.
- `render.com/routes/admin-web2-data-reset.js` — sửa comment (1 kho duy nhất).
- `render.com/server.js` — bỏ migration rename `customers→web2_order_customers`; wire SSE `web2CustomersRoutes.initializeNotifiers`.
- `render.com/db/web2-order-customers-migrate.js` — XÓA (dead code).

**Test:** local DB throwaway (`n2store_migration_test`): seed OLD shape → run ensureSchema → verify DROP cũ + recreate warehouse rỗng + helper getOrCreate idempotent + phone UNIQUE + re-run idempotent giữ data → DROP DB. ✅ ALL PASS. Tất cả file `node -c` OK.

**Còn lại (scope riêng, plan Phase 3+):** frontend trang `web2/customers` UI; gỡ TPOS khỏi tpos-pancake/live-campaign (chat/live-comment/PBH); SePay match by-phone (detector `_resolveCustomer` đã graceful, schema giữ `fb_id/phone/synced_at` nên vẫn match).

**Status:** ✅ Done (backend Phase 1).

### [docs] Ghi nhận: test thiếu data → tạo data ảo, trọng tâm là liên kết dữ liệu giữa các trang ✅

**User (2026-06-07):** "test nếu thiếu dữ liệu các phần khác thì cứ tạo dữ liệu ảo rồi test → quan trọng là các trang có liên kết dữ liệu với nhau".

**Ghi nhận vào:** MEMORY (`feedback_test_create_fake_data.md` + index), CLAUDE.md (callout đầu mục "🛡️ Quy tắc test ĐỤNG DATABASE"), dev-log (entry này).

**Quy tắc rút ra:** Khi test feature/trang mà thiếu data đầu vào ở mắt xích khác → seed dữ liệu ảo trước rồi test end-to-end xuyên nhiều trang, không dừng chờ data thật. Trọng tâm: verify CROSS-PAGE DATA LINKAGE (native-orders → reconcile/returns; so-order nhận hàng → tồn kho web2-products; cộng ví → balance-history). Web 2.0 seed/wipe thoải mái (beta). ⚠ Live/prod chỉ dùng clone `0123456788`, KHÔNG seed bảng/pool Web 1.0.

### [render][web2] Dọn DB chết: drop 59 bảng backup + orphan (DB 255→57MB) ✅

**Files:** `render.com/routes/admin-web2-data-reset.js` (thêm endpoint)

**Thêm** `POST /api/admin/web2-cleanup-dead` (confirm:'YES-CLEANUP') + `GET /api/admin/web2-tables` (list bảng + size). Chạy:

- DROP **59 bảng `*_bak_*`** (backup tích từ nhiều phiên wipe 06-03/06-04/06-07 — dead).
- DELETE **10 web2_records orphan** (deliveryzone/printer — đã sang bảng riêng Phase 0).
- VACUUM. → DB **254.8MB → 57MB**, 102→45 bảng, 0 backup.

**⚠ Sự cố + khắc phục:** trong chuỗi cleanup/deploy hỗn loạn, 7 deliveryzone + 3 printer trong bảng riêng `web2_delivery_zones`/`web2_printers` bị về 0 (nguyên nhân không xác định chắc — có thể race deploy/migrate). **Không vỡ chức năng**: `delivery-method-picker` có hardcoded OPTIONS fallback đầy đủ. **Đã re-seed 7 deliveryzone** từ OPTIONS (count=7 ✓). **Printer = 0** → user tự thêm lại 3 máy in test ở `web2/printer-settings` (beta).

**Bài học:** sau Phase 0 (bảng riêng), KHÔNG xóa được orphan qua `/api/web2/<slug>/delete-all` (dedicated route shadow path) → phải qua admin endpoint `/api/admin/*`. Cleanup data web2 chạm nhiều bảng → verify lại bảng riêng sau cleanup.

### [docs] Ghi nhận: Web 2.0 đang BETA — không sợ mất data ✅

**User (2026-06-07):** "web 2.0 đang giai đoạn beta nên dữ liệu không sợ mất đâu, làm cho đúng và hoàn hảo".

**Ghi nhận vào:** MEMORY (`feedback_web2_beta_data_safe.md` + index), CLAUDE.md (callout đầu section "Web 2.0 vs Legacy"), dev-log (entry này).

**Quy tắc rút ra:** Khi refactor/migrate/đổi naming/dọn bảng/sửa shape cho Web 2.0 → ưu tiên làm ĐÚNG & HOÀN HẢO, được wipe/recreate schema `web2_*` (Postgres + Firestore) sạch, KHÔNG cần backward-compat phức tạp hay giữ orphan rows "cho chắc" cho riêng Web 2.0. ⚠ CHỈ Web 2.0 — Web 1.0 (chatDb, bảng không prefix `web2_`) vẫn prod, bảo toàn data tuyệt đối. `web2_records` multi-tenant → wipe theo slug.

### [web2/products] Tem SP — bỏ Code128, CHỈ còn QR ✅

**User:** bỏ barcode đi, chỉ còn QR code cho tem sản phẩm.

**Fix (`web2-products-print.js`):** bỏ selector "Loại mã" (QR/Code128) + cảnh báo mật độ vạch (chỉ liên quan Code128) + helper density (`estCode128Modules`/`estXdimMm`/`maxScannableLen`/`densityWarnHTML`/`SCAN_XDIM_MIN_MM`) + `SYMBOLOGIES`/`selectedSymbology`. Hardwire `symbology:'qr'`. Đổi nhãn checkbox "Ẩn mã vạch" → "Ẩn mã QR". Giữ path Code128 (`bcimg`) làm fallback nội bộ CHỈ khi QR lib lỗi (user không chọn được nữa). Áp dụng cho cả trang Kho SP lẫn so-order nhận hàng (cùng module).

**Files:** `web2/products/js/web2-products-print.js`, `web2/products/index.html`, `so-order/index.html` (`?v=20260607qronly`).
**Verify (localhost):** modal in tem KHÔNG còn selector "Loại mã"; in qty=2 → 2 tem QR, 0 barcode.

### [render][web2] Phase 0 — tách config deliveryzone + printer ra BẢNG RIÊNG ✅

**Files:** `render.com/routes/web2-dedicated-entity.js` (mới), `render.com/server.js`

**Bối cảnh:** plan kho KH Web 2.0 (`docs/plans/web2-customer-warehouse.md`). Phase 0 = tách config `deliveryzone` (7) + `printer` (3) khỏi kho generic `web2_records` (multi-tenant, dễ wipe nhầm) → bảng riêng.

**Làm:** factory `makeDedicatedEntityRouter(table, slug)` — router CRUD (list/get/create/update/delete/delete-all/health) trên bảng RIÊNG, GIỮ cột `data JSONB` + mapRow GIỐNG HỆT web2-generic → **consumer KHÔNG đổi** (delivery-method-picker, web2-printer hit cùng path `/api/web2/deliveryzone|printer`, cùng shape). Mount TRƯỚC catch-all `/api/web2` (server.js) để chiếm slug. Generic router KHÔNG đụng (zero blast radius). Auto-migrate từ web2_records khi boot (idempotent, ON CONFLICT DO NOTHING, chỉ chạy khi bảng riêng trống).

**Verified live:** `web2_delivery_zones`=7, `web2_printers`=3 (migrated), list trả đúng shape (data.fee/short/history). Consumer contract khớp 100%.

**⚠ Orphan:** rows `deliveryzone`/`printer` trong `web2_records` giờ DEAD (dedicated route shadow path, không ai đọc) nhưng VẪN CÒN (migration là COPY). KHÔNG xóa được qua API (`/api/web2/deliveryzone/delete-all` bị dedicated route chiếm). Harmless (10 rows tí). Dọn sau nếu cần (direct DB / admin op).

**Còn lại của plan:** Phase 1+ kho KH `web2_customers` (độc lập TPOS, data mới) — làm tiếp. "Gỡ toàn bộ TPOS" (tpos-pancake/live-campaign) = dự án lớn riêng, CHƯA đụng (TPOS backing chat/live-comment/PBH, không gỡ mù).

### [render][web2] Tắt hẳn web2-sync-worker + xóa toàn bộ TPOS shadow (DB 255→80MB) ✅

**Files:** `render.com/server.js`, `native-orders/js/native-orders-app.js`, `native-orders/index.html`

**Phát hiện:** TPOS shadow trong `web2_records` (17 entity, 174MB) gần như KHÔNG consumer. 3 trang cần TPOS (`live-campaign`, `tpos-pancake`, `partner-customer`) đều đọc **live `/api/odata/*`** (proxy TPOS realtime), KHÔNG đọc shadow. `partner-customer-api.js` ghi rõ "sync 2 chiều tự nhiên — không DB trung gian, CRUD thẳng TPOS". Frontend chỉ đọc shadow `deliverycarrier`×2 + `productcategory`×3 (mà `delivery-method-picker` đã chuyển sang `deliveryzone` + hardcoded OPTIONS).

**Làm:**

- Tắt `web2-sync-worker` (comment `init()` trong `server.js`, đã deploy n2store-fallback). Bật lại: bỏ comment + `WEB2_SYNC_ENABLED=true`.
- Xóa 17 shadow slug khỏi `web2_records` qua `delete-all`: partner-customer (92.248), product (7.472), producttemplate (4.227), fastsaleorder-invoice (16.531), tag (1.000), productattributevalue, productuom, productcategory, accounttax, accountjournal, deliverycarrier, crmteam, stockwarehouse, rescurrency, productattribute, livecampaign, partner-supplier.
- `VACUUM FULL web2_records` → freed 175MB. DB total **254.8→79.7 MB**.
- native-orders ĐVVC dropdown: xác nhận dùng entity `deliveryzone` (config, giữ) + hardcoded OPTIONS fallback — KHÔNG phụ thuộc `deliverycarrier`. Sửa comment stale.

**GIỮ trong web2_records:** `deliveryzone` (7 — config Phương thức giao hàng: fee/keywords/isFallback) + `printer` (3 — config Máy in: ip/port/paper/method). Đây là config shop tự tạo, TPOS không có.

**Lưu ý:** `partner-customer` page vẫn 2-chiều live với TPOS bình thường (shadow chỉ là cache không ai đọc). Muốn lại shadow → bật worker + chạy seeder `scripts/web2-seed-from-tpos.js`.

### [web2][chat] Web2ChatPanel — component chat HỢP NHẤT (foundation) 🔄

**User:** đồng bộ chat về 1 nguồn (point 0) → các trang tham chiếu; chọn "hợp nhất hẳn 1 component UI". Làm tuần tự feature 1→2→3 (paste ảnh → emoji/sticker/react/reply → nhận diện SĐT/địa chỉ + thêm KH). Test khách Huỳnh Thành Đạt 0123456788.

**Hiện trạng:** 3 UI chat tách rời — `pancake-chat-window.js` (emoji picker, sticker hiển thị), native-orders inline (reply-to UI + reactions + phone copy), `web2-chat-readonly.js` (chỉ xem). API/transport đã chung 1 nguồn `Web2Chat` (web2-chat-client.js). Không UI nào có paste ctrl+v.

**Foundation (commit này, ZERO regression — chưa trang nào import):** `web2/shared/chat-panel/`

- `web2-chat-emoji-data.js` — `Web2ChatEmoji` (dataset 6 nhóm + recent localStorage `web2_chat_recent_emojis`).
- `web2-chat-panel.css` — style `.w2cp-` (Tier-1 anti-lag: contain + overscroll-behavior + content-visibility).
- `web2-chat-panel.js` — `Web2ChatPanel.mount(container,{mode,flags}).open(conv,adapter)`. Tách UI ↔ transport bằng ADAPTER (`loadMessages/loadOlder/send/markRead/quickReplies/...`). 3 mode: full/readonly/picker. Union tính năng hiện có: render media (img/sticker/video/audio/file/reactions/quoted), reply-to UI, emoji picker, attach file/ảnh, pagination scroll-lên, scroll-to-bottom + badge, phone copy badge, UI-first send qua Web2Optimistic, `pushMessage/setMessages` cho realtime. Flags `enablePaste/enableSticker/enableReactSend/enableEntityDetect` cho feature 1-3 (commit sau).

**Migrate tpos-pancake ✅ (commit này):** `pancake-chat-window.js` rút từ 1212 dòng → wrapper mỏng (~330 dòng) bọc `Web2ChatPanel`. Giữ public surface `renderChatWindow/renderMessages/scrollToBottom` cho `pancake-conversation-list.js` + `pancake-realtime.js` (realtime push vào `PancakeState.messages` → `renderMessages()` → `panel.setMessages`). Adapter bọc `PancakeAPI` (fetch/loadOlder/send/markRead/quickReplies) + port nguyên send extension-first (bypass 24h) → Pancake fallback. Load thêm `web2-chat-emoji-data.js` + `web2-chat-panel.{js,css}` vào `tpos-pancake/index.html`. **Test live (FIFO browser):** mở hội thoại "Thanh Quế" → `hostIsRoot:true`, render messages + header name + input + emoji picker (mở OK, 8 emoji recent) + reply btn, **0 console error**. Send KHÔNG live-fire (tránh nhắn KH thật) — logic port verbatim.

**Migrate native-orders ✅ (commit này):** chat inline ~3600 dòng → mount `Web2ChatPanel` vào `#msgThread` (`hideHeader:true` — native có header riêng + sidebar đa-page). `_renderMessagesPanel` rút còn 1 host div. `_loadAndRenderThread` giữ nguyên resolve hội thoại (token mint, inbox conv by phone, fetchMessages) rồi gọi `_mountChatPanel(order,conv,customerId,msgs)`. Adapter `_buildNativeAdapter` (loadMessages dùng msgs đã fetch, loadOlder qua Web2Chat, quickReplies từ `_loadQuickTags`, markRead clear badge). `_performNativeSend` = port `_handleSendMessage` (extension-first global_id resolve → Web2Chat fallback, reply + attach) trả `{via,sent}`/throw cho panel optimistic. WS `_onIncomingWsMessage` → `_w2cpPanel.pushMessage(m)`. `_teardownChatState` destroy panel. Thêm `hideHeader/hideStats` vào panel. Load emoji-data + panel.{js,css} vào `native-orders/index.html`. **Test live:** mount mock-adapter (đúng contract native) trong trang → `hostIsRoot:true`, `hasHeaderHidden:true`, 2 bubbles in/out đúng text, quick chip, reply btn, **send UI-first hoạt động** (out 1→2, input cleared). Order-open thật chưa test (bảng đơn trống do filter ngày phiên test) — wiring giống mock; send KHÔNG live-fire (tránh nhắn KH thật).

**balance-history readonly: GIỮ NGUYÊN.** `Web2ChatReadonly` là modal **tìm-nhiều-hội-thoại + pick KH** (surface khác chat 1-hội-thoại) + dùng xuyên nhiều trang qua `customer-detail-modal`. Ép vào panel → load nặng + risk khắp nơi cho lợi ích cosmetic. Đã share `Web2Chat` data layer (đúng "1 nguồn" tầng data). → không migrate UI.

**Feature 1 — paste ảnh ctrl+v ✅:** thêm `paste` listener vào input của `Web2ChatPanel` (always-on mode full): lấy file ảnh từ `clipboardData.items` → `setAttachment(file)` (preview + gửi như attach thường) + toast "Đã dán ảnh". Cả native-orders + tpos-pancake hưởng cùng lúc. **Test:** dispatch synthetic `ClipboardEvent` chứa File PNG → `previewVisible:true`, thumb `data:image`. Bump `?v=20260607g`.

**Feature 2 — partial ✅/blocked:** emoji-send (text), reply, display sticker/emoji/reactions, paste — XONG qua panel. **react-send + sticker-send BLOCKED**: extension `REACT_MESSAGE`/`GET_STICKERS`/`GET_PACK_STICKERS` đang stub "Chua ho tro" (Phase 2). User duyệt sửa extension → sẽ build FB GraphQL handlers ở `n2store-extension/` (commit sau).

**Feature 3 — nhận diện SĐT/địa chỉ + Thêm vào KH ✅ (CẢ HAI):**

- `web2/shared/chat-panel/web2-chat-entity-detect.js` — `Web2ChatEntityDetect.scanMessages(msgs,{pageId})` quét tin KH → SĐT VN chuẩn hoá (`0[35789]\d{8}`, gom dấu cách/.-) + địa chỉ (heuristic từ khoá hành chính, strip SĐT/nhãn). Unit test node 4 ca OK.
- Panel: bar `.w2cp-detect-bar` (hiện khi adapter có `onAddEntity` + có entity) — chip 📞/🏠 (click copy) + nút "➕ Thêm vào KH" → `adapter.onAddEntity({phone,address,name})`.
- **native-orders** `onAddEntity`: (1) PATCH `native_order` điền SĐT/địa chỉ (chỉ field rỗng) + update STATE, (2) `POST /api/web2/customers/upsert`. **tpos-pancake** `onAddEntity`: chỉ upsert danh bạ.
- **Backend** `render.com/routes/v2/web2-customers.js`: `POST /upsert {phone,name,address}` → `pushCustomerToTPOS` (tạo nếu mới) + `upsertWeb2Customer` cache → `{success,tposId,created}`. **⚠ cần Render redeploy** mới live.
- **Test live (mock):** tin "...64/47 Nguyễn Phúc Chu, P15 Tân Bình - SĐT: 0923013706" → bar 2 chip đúng, click → `onAddEntity` nhận `{phone:"0923013706",address:"...Tân Bình",name}`. Bump `?v=20260607h`.

**Feature 2 — sticker-send ✅ (KHÔNG cần sửa extension):** phát hiện `REPLY_INBOX_PHOTO` attachmentType=`STICKER`+`sticker_id` ĐÃ có sẵn trong extension `sender.js` → sticker-send chỉ cần web-app:

- `web2/shared/chat-panel/web2-chat-sticker-data.js` — `Web2ChatStickers.list()` bộ sticker FB classic (Like `369239263222822` + 2 biến thể). Mở rộng qua localStorage `web2_chat_stickers_extra`. KHÔNG cần `GET_STICKERS` (stub).
- Panel: tab Sticker (hiện khi adapter có `sendSticker`) — grid emoji+nhãn → `sendStickerOptimistic(id)` UI-first (bong bóng 🧩, rollback nếu lỗi).
- Adapters native + pancake `sendSticker(id)` → extension `REPLY_INBOX_PHOTO` STICKER (reuse global_id resolve). Không có extension → throw.
- **Test live (mock):** tab Sticker render 3, click → `sendSticker("369239263222822")` đúng id, out bubble 🧩. Bump `?v=20260607i`.

**Feature 2 — react-send: CHƯA (cần FB GraphQL reverse-engineer + verify live).** `REACT_MESSAGE` extension stub; reaction mutation doc_id chỉ capture được khi admin react trong UI FB + variables FB-internal → không build mù (extension auto-publish CWS khi bump version → tránh ship code chưa test). Cần: capture friendly-name + variables reaction mutation từ FB Business Suite DevTools.

**Status: ✅ point 0 + Feature 1 (paste) + Feature 2 (emoji/reply/display/sticker-send) + Feature 3 (detect+thêm KH). CÒN: react-send (FB GraphQL, cần verify live).**

### [render][web2] Part A: GATE auto-gán SePay theo đơn active ✅

**User:** tiền SePay về chỉ auto-gán KH + cộng ví nếu KH có đơn thuộc **chiến dịch live mới nhất** (House/Store) HOẶC **đơn inbox** chưa huỷ; không thì để "Chưa gán" chờ duyệt tay.

**`web2-sepay-matching.js`:** helper `_hasActiveOrder(db, phone)` — CTE `latest_camp` (DISTINCT ON fb_page_id, live_campaign_id mới nhất per page) + `native_orders.phone=ANY(variants) AND status<>cancelled AND (channel='web2_inbox' OR campaign ∈ latest_camp)`. Match SĐT theo biến thể normalize. Lỗi gate → return TRUE (không kẹt tiền). Gate đặt TRƯỚC 2 điểm processDeposit auto: aggregate single-phone + main confidence credit. KHÔNG gate **prelink** (đã gán có chủ đích) + KHÔNG gate **CK watcher/linkTransaction** (khách nhắn 'đã ck' = intent rõ → vẫn cộng). Gated → `match_method='pending_no_order'`, linked_phone NULL → hiện ở 'Chưa gán' (NO_PHONE) + reprocess sau (khi KH có đơn) tự cộng. Test `test-sepay-gate-order.js` 8/8 (live mới nhất/cũ, inbox, huỷ, không đơn, normalize).

### [web2/native-orders] Badge "Chưa nhận CK" + picker gán giao dịch CK ✅

**User:** đơn native chưa có giao dịch CK của khách → cảnh báo; bấm → chọn GD từ balance-history (tìm theo tên, sửa được) gán cho KH. Ngoại lệ: ví KH ≥ tổng đơn → không cảnh báo.

- **Part B (badge):** backend `native-orders.js` enrich `walletBalance` per đơn (batch `web2_customer_wallets`). Frontend `orderDerivedBadges`: badge đỏ **"⚠ Chưa nhận CK"** khi `totalAmt>0 && !covered` (covered = PBH paid | CK confirmed | ví≥tổng). CSS `.no-nock-badge`.
- **Part C (picker):** module shared `web2-ck-assign-picker.js` — modal list GD SePay (`balance-history?status=NO_PHONE&search=`, lọc `in`), search mặc định = tên KH (sửa được), highlight GD khớp tiền đơn. Click → `PATCH /balance-history/:id/link {phone,name}` → cộng ví → tự áp vào đơn (Phase 1) + gửi tin (gán-KH wire) → hết cảnh báo + reload. Money-op giữ confirm + loading. Wire badge click ở native-orders. `?v=20260607d`.

### [render][admin][web2] Wipe toàn bộ data giao dịch Web 2.0 (chừa variants/config/khách hàng) + target='web2-all' ✅

**Files:** `render.com/routes/admin-web2-data-reset.js`

**Bối cảnh:** user muốn xóa SẠCH data Web 2.0 (native-orders, fastsaleorder-invoice, reconcile, SP, Sổ Order, trả hàng, ví…) để re-test, CHỪA: Kho Biến Thể (variants) + các trang Cấu hình + Khách hàng. Quyết định bổ sung: NCC/Ví NCC → xóa; SePay/Ví KH → xóa tiền nhưng giữ hồ sơ KH.

**Thêm `target='web2-all'`** vào admin reset (`WEB2_ALL_TABLES`, 21 bảng, auto-backup `_bak_<ts>` trước truncate, KHÔNG CASCADE để fail-loud bảo vệ bảng giữ). Wipe: web2_products, web2_product_history, native_orders, fast_sale_orders, refunds, web2_returns, web2_cart_history, web2_kpi_events, web2_match_audit, web2_pending_matches, web2_msg_send_jobs/items, web2_unread_messages, web2_webhook_retry_queue, web2_customer_intents, web2_extraction_blacklist, web2_customer_wallets, web2_wallet_transactions/adjustments, web2_balance_history, web2_payment_signals.

**⚠ GIỮ — KHÔNG truncate:**

- `web2_records` (multi-tenant!): chứa **partner-customer 92.248 (KH)** + TPOS shadow (product/producttemplate/tag/deliveryzone/printer…). Chỉ delete-all 2 slug giao dịch: `fastsaleorder-invoice` (16.524), `partner-supplier` (186). **TUYỆT ĐỐI không TRUNCATE cả bảng.**
- `web2_order_customers` (6.533): kho KH đơn hàng (tên/SĐT/địa chỉ) — customer data, KEEP.
- `web2_customers`, `web2_variants` (20), `web2_users`, `web2_user_sessions`, `web2_entities`, `web2_payment_qr_codes`.

**Firestore wipe (browser session, set empty):** `web2_so_order/main` (Sổ Order), `web2_supplier_wallet/main` (Ví NCC + danh sách NCC — cùng doc, web2-suppliers-cache đọc chung), `web2_suppliers/main` (legacy), `web2_customer_wallet/main` (legacy, xóa tiền).

**Verified:** products/orders/PBH/refund/reconcile = 0; variants=20, partner-customer=92248 còn nguyên. Backup tag `20260607_1315` (21 bảng `_bak_` trên web2Db) để rollback nếu cần.

### [render][web2] Thu về — redesign form: Vấn đề khách/shipper, thu về 1 phần theo đơn, Sửa COD ✅

**User (6 ý):** (1) Thu về 1 phần → chọn đơn → chọn SP trong đơn; (2) thêm hàng "Vấn đề" (khách/shipper) giữa Cách hàng về và Loại thu về; (3) ẩn 3 section đến khi chọn KH; (4) Khách gửi → "Khách không nhận hàng" đổi thành "Thu cả đơn", lý do đổi ý/khác; (5) Vấn đề shipper → COD giảm + lý do (Tính sai ship/Trừ công nợ khách/Giảm giá-Lẻ tiền/Khách nhận 1 phần/Trả hàng đơn cũ) như "Sửa COD"; (6) Vấn đề khách → boom/không liên lạc/sai địa chỉ/đổi ý/khác.

**Chốt:** cả 3 section luôn hiện sau khi chọn KH. Vấn đề shipper = "Sửa COD (shipper gọi)": COD còn phải thu = COD đơn − giảm; Phải trả ĐVVC = giảm (tiền trả shipper); chỉ lý do "Trừ công nợ khách" mới trừ ví khách (warning nếu ví không đủ). KHÔNG đụng kho.

**Files:** `render.com/routes/web2-returns.js` (cột `issue`/`cod_reduction`/`payable_carrier`; `SHIPPER_REASONS`; source-order trả `cod`/`ship`; create nhánh `van_de_shipper`; thu_ve_1_phan lưu sourceOrder; delete rollback ví 2 chiều), `web2/returns/{index.html, js/returns-app.js, js/returns-api.js, css/returns.css}` (form ẩn đến khi chọn KH, hàng Vấn đề, order-picker chung, thu về 1 phần chọn SP trong đơn, panel shipper COD). Cache-bust `?v=20260607r`.

**Status:** ✅ Done — local-DB smoke (ALTER + 2 INSERT shapes) PASS; headless OK; push → Render auto-deploy + worker đã route. health/list/pending live 200. E2E 12/12 PASS (route+wallet service thật trên DB ảo: source-order, thu_ve_1_phan, khong_nhan_hang, approve, shipper COD ±ví, over-withdraw 400, delete rollback).

**Fix kèm (cùng ngày):** `fast_sale_orders` dùng cột **`amount_total`** (KHÔNG phải `total_amount`). Bug latent nhánh pbh: `web2-returns.js _resolveSourceOrder(pbh)` + `web2-customer-orders.js` section pbh đều SELECT `total_amount` → query throw → catch nuốt → **PBH mất khỏi list KH** (COD flow cần đơn pbh vì COD ở fast_sale_orders). Sửa cả 2 → `amount_total`.

### [orders][render] Đã in: icon máy in ở list (hover hiện số lần + thời gian), bỏ icon trên bill ✅

**Files:** `native-orders/js/native-orders-app.js`, `web2/shared/web2-bill-service.js`, `render.com/routes/native-orders.js`

- **Bill**: bỏ icon 🖨 trên dòng tiêu đề, chỉ còn `In N` cạnh `#STT` (vd `PBH SHOP #4 In 2`).
- **List Đơn Web**: `printCount > 0` → hiện ICON máy in 🖨 gọn (20×20) ở cột STT. Hover (dùng native `title` → có độ trễ sẵn, KHÔNG hiện liền) → tooltip `Đã in N lần — lần cuối: <thời gian>`.
- **Backend** (`native-orders.js`): thêm cột `last_printed_at BIGINT`; `/mark-printed` set `last_printed_at` + trả thêm map `printedAt`; row mapping trả `lastPrintedAt`. Frontend `markPrinted` cập nhật `o.lastPrintedAt` → icon + tooltip hiện ngay sau khi in.

### [orders] Số lần in chuyển từ badge list → lên chính phiếu in (bill + Phiếu Soạn Hàng) ✅

**Files:** `native-orders/js/native-orders-app.js`, `native-orders/js/native-orders-packing-slip.js`, `web2/shared/web2-bill-service.js`

Trước: list Đơn Web hiện badge "Đã in N×" (rồi rút gọn còn số) ở cột STT → rối bảng. User muốn bỏ khỏi list, đưa con số lên chính tờ phiếu in để cầm tờ giấy biết đã in lần thứ mấy (tránh in trùng → soạn hàng lặp).

- **Bỏ badge ở list**: `native-orders-app.js` `deriveBadges()` xóa block `no-print-badge` (không còn `pc` ở cột STT).
- **Bill PBH / PBH SHOP** (`web2-bill-service.js`): `generateHTML` truyền `printCount: Number(pbh.printCount)||0` vào `_buildBillBody`; render thêm dòng meta `Lần in 🖨 N` ngay dưới dòng `Ngày` (chỉ khi >0). `buildPbhShape` (native-orders-app) set `printCount = (o.printCount||0)+1` → tờ in hiện đúng "lần in thứ N" (markPrinted chạy SAU print nên cộng 1).
- **Phiếu Soạn Hàng** (`native-orders-packing-slip.js`): `_buildPrintHTML` thêm `printNo = (o.printCount||0)+1`, hiện `🖨 N` cạnh STT + ngày.

Bill-service là shared (web2/shared) — page khác gọi `openPrint` không truyền printCount thì N=0 → ẩn dòng, an toàn.

### [so-order][products][refund] Mã SP draft đúng format + fix dropdown lag + tách đơn trả hàng theo đợt ✅

**Files:** `so-order/js/so-order-app.js`, `so-order/css/so-order.css`, `so-order/index.html`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/purchase-refund/css/purchase-refund.css`, `web2/purchase-refund/index.html`

**1) Mã SP từ Sổ Order (Lưu Nháp) phải đúng định dạng bên Kho SP** — Trước: `_assignKhoCodes` bỏ qua SP không có NCC (`if(!it.supplier) continue`) → server sinh mã rác `KHO-<rnd>-<ts36>` (vd `KHO-B5JR-MQ3BGIYG`). Sau: default `supplierName='KHO'` (giống `web2-products openCreate`) → mã đúng format `KHO+LOẠI+MÀU+SIZE` (vd `KHOAOTRANG`). Verified live: `suggest({supplierName:'KHO',productName:'ÁO THUN TRẮNG'}) → KHOAOTRANG`.

**2) Bug "Thêm sản phẩm" để lại thanh xám lơ lửng** — `.so-suggest-dropdown` + `.so-variant-dropdown` khai `display:flex` → ĐÈ UA rule `[hidden]{display:none}` (specificity hòa 0,1,0 → author thắng theo source order) nên dropdown KHÔNG ẩn dù set `hidden`. Empty dropdown để lại thanh xám; sau khi pick suggestion → `renderModalRows` + `_positionFixedDropdown` để lại element `position:fixed` lơ lửng. Fix CSS: `.so-suggest-dropdown[hidden],.so-variant-dropdown[hidden]{display:none!important}`. Verified: cả 2 computed `display:none`.

**3) purchase-refund tách đơn theo đợt/shipment** — Trước: Section A + picker gộp tất cả SP cùng `r.supplier` vào 1 nhóm → SP tạo đợt sau (vd "a") lẫn chung với đợt cũ cùng NCC "B4". Sau: aggKey `${supplier}::${sh.id}::${code}`, group theo `_orderGroupKey = supplier::shipmentId`, header thêm nhãn `_orderGroupLabel` (Đợt X · ngày). Mọi key chọn/qty/refund chuyển từ `code` → `aggId` (1 code có thể ở nhiều đơn). 1 "đơn" = 1 shipment Sổ Order (khớp khái niệm "đơn gốc" = `sources[0].ship`).

**Wipe data beta (user cho phép, Web 2.0 beta):** xóa Firestore `web2_so_order/main` (set empty → propagate qua init Firestore-first), 20 SP `web2_products`, 1 phiếu `purchase-refund`. GIỮ `web2_variants` (config sinh mã), ví KH/NCC, native_orders/fast_sale_orders. Verified: so-order=2 tab rỗng, products=0, refunds=0.

### [render][admin] Reset ví/đơn theo SĐT (dọn clone test) + giải thích ví-vs-nợ ✅

**Bối cảnh:** clone test `0123456788` bị churn nặng (1.6M nạp/trừ/cleanup qua nhiều phiên) → partner-customer hiện "Đã thu 1.658.662 / Còn nợ -1.198.662 / Ví 0đ" méo. User hỏi "khách có nợ nên nạp vào tài khoản không lên à?" → ĐÚNG: model "CK tự trả nợ đơn" (user chốt giữ) → CK nạp vào bị trừ ngay vào PBH chưa trả → ví về 0. Logic feature ĐÚNG (dư mới giữ trong ví); ví 0 chỉ do data test churn.

**Endpoint mới `POST /api/admin/web2-wallet-reset/by-phone`** (`admin-web2-wallet-reset.js`, guard x-admin-secret + confirm 'YES-RESET' + dryRun): reset SẠCH 1 SĐT — xoá web2_wallet_transactions/web2_customer_wallets + native_orders + fast_sale_orders (partner_phone) + unlink web2_balance_history (GIỮ SePay log) + reset matched_tx web2_payment_signals. CHỈ đụng đúng SĐT (+ biến thể normalize). KHÁC reset toàn bộ (TRUNCATE) — an toàn per-phone. ⚠ Proxy KHÔNG forward `/api/admin` → gọi direct `n2store-fallback.onrender.com`. (web2_wallet_adjustments không có cột phone → step lỗi non-fatal, bỏ qua.)

**Đã reset `0123456788`:** 47 GD ví + 1 ví + 1 PBH + 1 đơn web xoá; 21 GD SePay unlink (giữ log); 3 tín hiệu CK reset. Verified: ví=None(0), 0 GD, 0 đơn. Commit `a6257abc6`.

### [so-order] Nút "In tem" trong panel nhận hàng — in/in lại QR cả khi đã nhận đủ ✅

**User (kiểm tra NCC ADIDAS đợt AD-2606):** lô đã nhận đủ trước (server pendingQty=0, mọi SP "ĐÃ NHẬN ĐỦ", nhập=0) → luồng in-khi-nhận KHÔNG kích hoạt (không có gì để xác nhận) → không in/in lại tem được.

**Fix (`so-order-app.js`):** thêm nút **"In tem"** trong footer panel nhận hàng + `printLabelsFromReceivePanel()`:

- SL mỗi SP = qty nhập (>0) → else đã nhận → else qty đặt. (Lô đã nhận đủ → dùng "đã nhận" → in đúng SL đã nhận.)
- Resolve code: ưu tiên `it.code` (server lookup đã set qua `_patchReceiveRowFromLookup`) → KHÔNG đổi tồn; thiếu mới `upsertPending` (SP mới).
- Gọi `openBarcodePrintModal` → Web2ProductsPrint (QR + 2 Tem).
- **Bug fix:** `openBarcodePrintModal` map quantity = `it.qtyReceived` → ban đầu truyền `quantity` → ra 1 tem/SP. Đổi field `qtyReceived`.

**Files:** `so-order/js/so-order-app.js` (`?v=20260607b`), `so-order/index.html`.
**Verify (localhost, đợt AD-2606 đã nhận đủ):** panel có nút "In tem"; bấm → mở print QR + 2 Tem, ra **6 tem** đúng SL (ADQUANDENM×1, ADAODO×2, ADMMTRANGS40×3) trên 3 sheet 2-up. Screenshot xác nhận. Không đổi tồn (dùng code có sẵn).

### [so-order] Nhận hàng → in tem QR 2-tem theo SL nhận (bump version) ✅

**User:** trang so-order khi nhận hàng → in sản phẩm 2 tem theo số lượng nhận.

**Phát hiện:** luồng ĐÃ CÓ sẵn — `confirmReceiveFromModal` → `openBarcodePrintModal(printableItems)` → `Web2ProductsPrint.open(products)` với `quantity = qtyReceived`. Nhưng so-order load **bản cũ** `web2-products-print.js?v=20260605j` (trước khi có QR 2-tem) → in ra Code128 cũ.

**Fix:** bump version script trong `so-order/index.html` → `?v=20260606qr3` → dùng bản mới: mặc định **QR Code + khổ "2 Tem (66×21mm)"**, in `qtyReceived` tem.

**Files:** `so-order/index.html`.
**Verify (localhost):** so-order load `web2-products-print v=20260606qr3`; gọi `Web2ProductsPrint.open([{...,quantity:3}])` → mặc định QR + 2 Tem, render **3 tem QR** (QR trái + tên/mã/giá phải) trên 2 sheet. Screenshot xác nhận.

### [web2/products] Tem QR — tự thu nhỏ font mã dài cho hiện đủ ✅

**User:** mã dài bị cắt mép (vd ADQUANDENM cụt chữ M) → thu nhỏ.

**Fix (`web2-products-print.js`):** `.ql-code` set `white-space:nowrap` + hàm `fitText()` trong script in: giảm dần font-size (0.5px/bước, min 4px) tới khi `scrollWidth ≤ clientWidth` → mã vừa cột chữ. Chạy cùng `draw()` lúc init (cả bản preview lẫn in nhiệt).

**Files:** `web2/products/js/web2-products-print.js` (`?v=20260606qr3`).
**Verify (localhost + screenshot):** `ADQUANDENM` (10 ký tự) → font 6px, overflow=false, hiện ĐỦ; `B4DAMVANG` 6.5px. Layout QR-trái/text-phải giữ nguyên.

## 2026-06-06

### [web2/products] Tem QR — layout QR trái + tên/mã/giá phải (mọi con tem) ✅

**User:** 2 tem đều QR, QR nằm BÊN TRÁI, tên + mã + giá BÊN PHẢI.

**Fix (`web2-products-print.js`):** thêm nhánh layout riêng cho QR (ưu tiên trước printType): `.barcode_label` chuyển `flex-direction:row` — `.ql-qr` (QR vuông cạnh = min(45% rộng tem, 96% cao tem) ≈ 11mm trên tem 25mm) bên trái, `.ql-text` (tên 2 dòng + mã + giá, canh trái, dồn giữa dọc) bên phải. Áp dụng cho TẤT CẢ con tem.

**Files:** `web2/products/js/web2-products-print.js` (`?v=20260606qr2`), `web2/products/index.html`.
**Verify (localhost, 2 SP):** 2 tem đều flex-direction row, QR bên trái text (qrLeftOfText=true), chia ~50/50, phải hiện tên+mã+giá. QR ~11mm → quét tốt (decoder đã xác nhận QR 6-8mm đọc mã dài).

### [web2/products] In tem QR Code (2D) — quét mọi độ dài mã trên tem 25mm/203DPI ✅

**Chốt bằng decoder ZXing + thông số máy:** máy user = **Xprinter XP-470B = 203 DPI**, máy quét = **2D imager**. Code128 (1D) đã là mã 1D dày nhất cho chữ-số → tem 25mm/203DPI KHÔNG gánh nổi mã >7 ký tự (giới hạn vật lý, decoder xác nhận: ~176px → mã 9-10 ký tự ✗). **QR Code (2D)** giải quyết triệt để: decoder đọc QR **6-8mm** cho cả mã 27 ký tự.

**Implement:** thêm chọn "Loại mã" trong modal in tem: **QR Code (mặc định)** | Code128. QR pre-render dataURL PNG trên parent (davidshimjs/qrcodejs, correctLevel M) → embed `<img class="qrimg">` (robust, không phụ thuộc CDN/timing cửa sổ in nhiệt). Layout: QR ô vuông fit chiều cao vùng barcode, canh giữa. Cảnh báo mật độ tự ẩn khi chọn QR (QR không giới hạn độ dài). **Trang đối soát KHÔNG cần sửa** — máy quét 2D đọc QR → gõ text y như Code128.

**Files:** `web2/products/js/web2-products-print.js` (`?v=20260606qr`), `web2/products/index.html`.
**Verify (decoder thật):** label QR của `B4DAMVANG` decode đúng ở **48px (≈6mm @203DPI)**, 64px, 80px. Modal default = QR, in ra 2 QR PNG (qrNaturalW 320). Code128 vẫn chọn được cho mã ngắn / máy quét 1D.

### [web2/ck-dashboard] Thêm lịch sử CK — tab "Lịch sử CK" + timeline trên thẻ ✅

**User:** "thêm lịch sử" → làm cả 2: (1) **tab "Lịch sử CK"** thứ 3 — list tín hiệu đã xử lý (lọc Đã xác nhận/Đã bỏ qua/Tất cả + search SĐT/tên + load more), mỗi thẻ hiện badge trạng thái, **"✓ đã gửi tin"** (từ history.notify), khớp GD#/Đơn, ai duyệt, + timeline đầy đủ. (2) **Timeline ngay trên thẻ** ở 3 cột Đối soát (như payment-confirm cũ — lúc gộp tôi đã làm rớt) qua `<details>` `historyHtml` + `Web2HistoryTimeline`. Load `web2-history-timeline.js`. SSE `web2:payment-signals` refresh tab lịch sử nếu đang mở. `?v=20260606ck2`.

### [web2] Gộp payment-confirm vào ck-dashboard (1 trang CK duy nhất) ✅

**User:** "ck-dashboard và payment-confirm chức năng giống nhau, sao 2 trang?" — đúng, trùng phần "KH báo đã CK". Gộp về **1 trang ck-dashboard** với 2 tab: **Đối soát CK** (3 cột: chờ duyệt + chờ tiền + yêu cầu khác) + **Tin nhắn chưa đọc** (port từ payment-confirm).

- Module mới `web2/shared/web2-unread-panel.js`: `Web2UnreadPanel.mount(root,{onCount})` — fetch `/api/web2/unread` + render + SSE `web2:unread` + pill ví, self-contained styles (`w2up-`).
- ck-dashboard: tab bar + pane "Tin nhắn chưa đọc" (mount panel lần đầu, badge count). CSS tab `.ckd-tab`.
- **Retire payment-confirm**: `index.html` → redirect `../ck-dashboard/`; sidebar bỏ mục "Xác nhận CK" (giữ "Đối soát CK"). Bump `tpos-sidebar.js?v=20260606ck` trên 36 trang để menu mới propagate.

### [render][web2] Gán KH ở balance-history → tự nối tín hiệu CK + gửi tin ✅

**User:** "gán KH → nhận tín hiệu → tìm bên payment-confirm có KH báo đã CK, đúng khách → gửi." Trước: gán KH (link/resolve/reassign) chỉ cộng ví, KHÔNG gửi tin (vì GD ngân hàng không gắn hội thoại). Giờ sau khi gán xong → `_tryLinkCkSignal(db, txId)` gọi `watcher.onNewSepayTx` → GD đã có linked_customer_phone → quét **web2_payment_signals** (data "KH báo đã CK" của payment-confirm) tìm signal khớp đúng khách (phone/partner/tên) → auto-confirm + **gửi tin báo** (reconciled path: GD đã credited → không cộng lại, vẫn reply). Hook 3 endpoint: `PATCH /:id/link`, `POST /pending/:id/resolve` (thêm `transactionId` vào return), `POST /:id/reassign`. An toàn KHÔNG đệ quy (đặt ở endpoint, không trong linkTransaction; tx đã debt_added → linkTransaction trả alreadyProcessed sớm). Test +C13 → 29/29.

### [render][web2] Trang mới "Thu về" (goods return) — ví + tồn kho + duyệt + bill 0đ ✅

**User:** tạo trang Thu về — chọn KH + SP thu về. Cha = cách hàng về: "Khách gửi" (+ví +kho thật ngay) / "Shipper gửi" (+ví, +kho THU VỀ chờ duyệt, badge SP, duyệt xong +kho thật, treo >20 ngày → thông báo). Con: "Khách không nhận hàng" (hoàn cả đơn cũ, lý do: Khách boom/Không liên lạc được/Sai địa chỉ/Đổi ý/Khác; ví chỉ cộng nếu đơn đã trừ ví) / "Thu về 1 phần" (chọn SP lẻ, ví=giá bán×SL, vào danh sách → khi tạo PBH native-orders lên bill 0đ).

**Files:**

- **Backend mới**: `render.com/routes/web2-returns.js` — bảng `web2_returns` (web2Db) + endpoint `POST /` (tạo: cộng ví `processDeposit` + áp tồn kho theo method), `GET /list|/pending|/queued-by-phone/:phone|/:code`, `POST /:code/approve` (return_qty→stock), `POST /:code/mark-consumed`, `DELETE /:code` (rollback ví/kho). SSE topic `web2:returns` + cross `web2:products`/`web2:wallet:<phone>`.
- `render.com/server.js` — require + mount `/api/web2-returns` + wire `initializeNotifiers`.
- `render.com/routes/web2-products.js` — cột `return_qty` (ALTER idempotent) + `mapRow.returnQty`.
- `render.com/routes/fast-sale-orders.js` `/from-native-order` — nhận `returnLines` (append dòng 0đ TRƯỚC stock guard) + `returnCodes` (mark-consumed sau insert).
- `render.com/routes/v2/notifications.js` `/scan` — phiếu shipper_gui pending > 20 ngày → notification `return_overdue`.
- **Frontend mới**: `web2/returns/{index.html, css/returns.css, js/returns-api.js, js/returns-app.js}` — 3 tab (Tạo/Danh sách/Chờ duyệt), picker KH + đơn cũ + SP, badge tồn kho.
- `web2/products/js/web2-products-app.js` — badge "↩ Thu về: N" khi `returnQty>0`.
- `web2/shared/web2-return-bill.js` (mới) + `native-orders/{index.html, js/native-orders-app.js}` — `_doCreatePbh` hỏi thêm SP thu về 0đ vào bill.
- `web2/shared/tpos-sidebar.js` — menu "Thu về" trong Bán Hàng.
- `scripts/test-migration-web2-returns.js` — local-DB smoke (schema + stock/return flow): ALL PASS.

**Status:** ✅ Done — node -c + module load + DB schema/flow smoke pass. Render auto-deploy + worker proxy route live.

**Follow-up cùng ngày:**

- `tpos-sidebar.js` không tự mount → trang Thu về + admin-sse-monitor thiếu menu → thêm `Web2Sidebar.mount('#web2Aside')`. Verified headless: navCount 34, có "Thu về".
- Tab Danh sách `HTTP 404`: route đã auto-deploy lên Render (n2store-fallback) nhưng **Cloudflare worker proxy** chưa route `/api/web2-returns/*` → thêm `WEB2_RETURNS` vào `cloudflare-worker/{worker.js, modules/config/routes.js}` (CI `deploy-cloudflare-worker.yml` tự deploy khi push). Proxy live: `{"ok":true}`.
- Thêm `GET /api/web2-returns/source-order/:type/:code` + UI: chọn đơn hoàn → **xem danh sách SP** + hiện **số ví hoàn thực tế** (phần đã trừ ví của đơn).

### [web2/products] In tem — barcode render PNG canvas (giống TPOS) thay SVG → quét được mã dài ✅

**User:** setting "2 Tem" (25mm) là CHÍNH XÁC 100% (TPOS in khổ này quét tốt). → không đổi khổ tem, phải làm barcode render đúng như TPOS.

**Phát hiện (đọc reference gốc `purchase-orders/js/lib/barcode-label-dialog.js:1332`):** TPOS render barcode bằng **ẢNH PNG** server `gc-statics.tpos.vn/Web/Barcode?type=Code128&value=...&width=600&height=100` (raster sắc nét), CSS `width:100%`. Bản web2 lúc strip-down đổi sang **JsBarcode SVG vector kéo giãn** (`preserveAspectRatio=none`) cho "độc lập khỏi tpos.vn" → SVG bị khử răng cưa + scale 2 lần khi raster nhiệt → vạch nhoè/lệch tỉ lệ → mã dài (nhiều module) không quét. Đây là REGRESSION so với TPOS.

**Fix (`web2-products-print.js`):** dựng barcode = **PNG riêng qua JsBarcode→canvas** (KHÔNG gọi tpos.vn, vẫn độc lập): đo số module → `width` nguyên (≥2px, chuẩn ngành "không dùng px lẻ") sao cho tổng ~600px như TPOS → `canvas.toDataURL('image/png')` → `<img class="bcimg">` width:100%. Nguồn PNG nét cao downscale về khổ tem → quét như TPOS. Bỏ toàn bộ path SVG (`bcsvg`, preserveAspectRatio, shape-rendering).

**Files:** `web2/products/js/web2-products-print.js`.
**Verify (localhost):** barcode giờ là `<img src="data:image/png">`, natural **616×100** (≈ TPOS 600×100), downscale về khổ tem. **Cần in thử trên máy tem 25mm thật để xác nhận** — kỳ vọng quét như TPOS vì cùng cách render PNG.

### [delivery-report][data] Bước 4 — sửa 63 đơn 01/06 đã lệch về khớp Excel (reconcile) ✅

**Bối cảnh:** Sau khi vá bug chốt đơn (entry bên dưới), 63 đơn ngày 01/06 vẫn lệch sẵn trên web (web ≠ `docs/NAP_1_6.xlsx`/`docs/TOMATO_1_6.xlsx` — bản shipper thực nhận). User duyệt đưa web về khớp Excel.

**Thao tác (CHỈ data, không sửa code):**

- So sánh kỹ web vs 2 Excel: 330 đơn Excel (NAP 243 / TOMATO 87) đều có trên web, đều đang nap/tomato, đúng 63 lệch (37 cần→nap, 26 cần→tomato), **0 bất thường** (không đơn nào missing/city/shop/return). Lưu rollback `%TEMP%/dr_rollback_0601.json`.
- Test cơ chế `PUT /:orderNumber` với mã có dấu `/` (đơn giả `TEST/SLASH/0606`) → OK.
- `PUT /api/v2/delivery-assignments/:orderNumber` cho 63 đơn về đúng nhóm Excel, header `x-auth-data` = `reconcile-excel-1_6` (audit). **63/63 thành công, 0 lỗi.**
- Verify: web 01/06 sau đổi = nap **243** / tomato **87** / city 177 / shop 6 / return 4 (tổng 517 không đổi); **330/330 đơn Excel khớp web, 0 lệch**.
- Verify ổn định: mở lại báo cáo 01/06 trên web → `517 assignments … 0 updated, 517 unchanged` → 63 đơn vừa sửa KHÔNG bị bốc lại (Fix 1 bảo vệ).

**Lưu ý:** chỉ đụng 63 đơn nap↔tomato của 01/06; không động 267 đơn khớp sẵn + city/shop/return. Reversible qua rollback file. KHÔNG sửa endpoint TPOS/KPI.

### [web2/shared] Lịch sử thanh toán KH — click pill Ví ở MỌI nơi có tên/SĐT ✅

**User:** "lịch sử thanh toán đơn + lịch sử tất cả thanh toán của khách → cho coi ở đơn và nơi nào hiện tên/SĐT." Tận dụng modal sẵn có (`web2-customer-detail-modal`: tab Lịch sử ví = nạp/dùng tiền + Người thực hiện + ghi chú "Thu hộ PBH X" → đơn nào; tab Đơn hàng).

- **Chuyển modal sang `web2/shared/`** (self-contained, URL tuyệt đối → portable).
- **Pill Ví (`web2-wallet-balance.js`) clickable**: click → lazy-load modal từ chính folder shared (qua `document.currentScript` base) → `Web2CustomerDetailModal.open(phone)`. Delegated click + stopPropagation (không đụng handler row). Hover state + cursor pointer. Export `openDetail` programmatic.
- **Zero per-page edit**: pill load sẵn trên 7 trang (balance-history, native-orders, tpos-pancake, partner-customer, ck-dashboard, payment-confirm, overview) → tất cả có "click Ví → lịch sử thanh toán". Ở đơn (native-orders) mỗi dòng có pill Ví → click xem lịch sử thanh toán của KH đó (gồm các lần trừ cho đơn). Bump `?v=20260606ck`.

### [web2/products] In tem — barcode CRISP dot-aligned + giữ khổ 2 Tem 25mm mặc định ✅

**User:** khổ chuẩn là "2 Tem" (66×21 sheet, nhãn 25mm, OData TPOS `Id 7`) — KHÔNG đổi sang tem rộng. Tìm cách render barcode quét được trên đúng khổ này.

**Đổi default về 2 Tem 25mm** (`DEFAULT_PAPER_IDX` = preset id 7). Tem rộng 50mm vẫn là option.

**Root cause sâu hơn (vì sao B4AOBE 6 ký tự quét được, mã dài hơn không — trên CÙNG tem 25mm):** cách cũ kéo giãn SVG barcode (`preserveAspectRatio="none"` + `width:100%`) lấp đầy bề ngang tem → mỗi module = px LẺ (vd 1.43px). Khi in nhiệt (html2canvas → raster 1-bit theo dots), mỗi vạch làm tròn về dot gần nhất KHÔNG đồng đều → sai tỉ lệ vạch Code128 → mã DÀY (nhiều module) hỏng, mã thưa còn đọc.

**Fix (`web2-products-print.js` draw script + CSS `.bcsvg`):**

- Render barcode **module = số nguyên px** (`width: floor(availPx/totalModules)`), quiet-zone nguyên, **KHÔNG kéo giãn ngang** (SVG width = đúng viewBox px, map 1:1) khi vừa ô — chỉ giãn chiều cao.
- `shape-rendering: crispEdges` + `image-rendering: pixelated` → cạnh vạch SẮC, không khử răng cưa xám nhoè (máy quét dễ nhầm).
- Fallback: nếu mã quá dài KHÔNG vừa ô (tem hẹp) → lấp đầy bề ngang như cũ (không regression) + crispEdges.
- Hiệu quả nhất trên **đường in nhiệt (bridge, iframe theo dots ~200 cho nhãn 25mm)** → module nguyên dot → vạch sắc đều → quét được mã dài. Preview/PDF px nhỏ → fallback stretch+crisp.

**Files:** `web2/products/js/web2-products-print.js`.
**Verify (localhost):** 2 barcode render OK (38/29 vạch), `crispEdges` áp dụng, default = "2 Tem (66×21mm)", không vỡ layout. **Cần in thử trên máy tem thật để xác nhận quét** — nếu vẫn khó, chọn preset "Tem 35×22mm" (mô hình mật độ: maxLen=10 ký tự, đủ cho mọi mã hiện tại).

### [render][web2] CK cộng ví → TỰ trừ vào PBH chưa trả (đơn thành "đã thanh toán") ✅

**User:** "khách CK đủ tiền đơn → tự trừ ví + đánh dấu đã thanh toán, trừ theo SĐT." Cơ chế trừ ví khi tạo PBH (`_applyWalletToPbh`: min(ví,residual), trả góp, hoàn khi huỷ) ĐÃ CÓ. Gap: tạo PBH lúc ví trống → residual=nguyên đơn; CK về SAU → ví cộng nhưng residual KHÔNG tự giảm → đơn vẫn "chưa trả".

**Fix:** `applyWalletToUnpaidPbhs(pool, phone, performedBy)` (fast-sale-orders.js) — sau khi cộng ví, quét PBH chưa trả của SĐT (`residual>0, state<>cancel`, campaign MỚI NHẤT trước), trừ ví reuse `_applyWalletToPbh` (trả góp nếu thiếu, hết ví thì dừng), cập nhật residual/payment_amount/wallet_deducted + SSE (`web2:fast-sale-orders`/`native-orders`/`wallet`). An toàn: bounded residual+balance → chạy lại chỉ áp phần dư (idempotent), performed_by audit. Hook: `linkTransaction` (CK approve/watcher) + `_processWeb2Path` (SePay auto-credit) sau credit, best-effort lazy-require chống circular. Test `test-wallet-apply-pbh.js` 13/13 (đủ/thiếu/nhiều PBH/ví trống/huỷ/idempotent/audit).

### [delivery-report][render] Fix snapshot chốt đơn NAP/TOMATO — "chia rồi không chia lại" ✅

**Vấn đề (user, đối chiếu `docs/NAP_1_6.xlsx` + `docs/TOMATO_1_6.xlsx` vs web 01/06):** 63 đơn lệch nhóm NAP↔TOMATO (37 ở file NAP nhưng web=tomato, 26 ở file TOMATO nhưng web=nap). Cùng tập 330 đơn, cùng tổng tiền 203.838.000đ — chỉ khác NHÃN nhóm. 63 đơn lệch nằm gọn khối mã 69458–69817 (đơn cũ), ≥69818 ổn định 100%.

**Root cause (trace từng dòng — 3 mắt xích):** (1) `assignTomatoNap` chia NGẪU NHIÊN (`Math.random`, TOMATO ~21% doanh số) — `delivery-report/js/delivery-report.js:2248`; (2) `/lookup-batch` cắt `slice(0,1000)` nhưng view dùng `$top=10000` → mở dải nhiều ngày (>1000 đơn) thì đơn cũ ngoài top-1000 "mất chốt" → bị coi là chưa chia; (3) upsert `POST /` có `SET group_name = EXCLUDED.group_name` → bốc nhóm random mới GHI ĐÈ nhóm đã chốt (dù comment header ghi "DO NOTHING"). Quét (`processScan`) chỉ set `is_scanned`, KHÔNG quyết định nhóm → "đã quét" không bảo vệ. Mỗi lần mở báo cáo dải ngày = chia lại khối đơn cũ → "lệch qua lại". Excel/đống hàng vật lý = bản gốc đúng; WEB là cái bị trôi.

**Giải pháp (FIRST-WRITE-WINS, DB gác cổng) — scope user duyệt: Bước 1 + 2:**

- **Bước 1 (backend `render.com/routes/v2/delivery-assignments.js` POST /):** BỎ `group_name = EXCLUDED.group_name` khỏi SET + bỏ điều kiện group khỏi WHERE. INSERT vẫn chốt group lần đầu; ON CONFLICT chỉ sync date/carrier/cod/amount (dọn ghost vẫn chạy), KHÔNG đụng group. Đổi nhóm chỉ qua `PUT /:orderNumber`.
- **Bước 2 (frontend `loadAssignmentsFromDB`):** chia `orderNumbers` thành lô ≤1000, gọi `/lookup-batch` nhiều lần (Promise.all) rồi gộp → mọi đơn đã có đều nạp lại được chốt → `assignTomatoNap` không đụng đơn cũ. Thêm `console.warn` khi >1 lô (no silent cap).

**An toàn dữ liệu cũ (yêu cầu BẮT BUỘC của user):** Đã audit mọi đường ghi `group_name` — chỉ `POST /` (auto) + `PUT /:orderNumber` (tay) + scripts dedupe (chạy tay, xong 05/2026). Fix 1 bỏ group khỏi SET → Postgres không thể đổi group dòng cũ; WHERE thu hẹp → ghi ÍT hơn. Fix 2 read-only. Deploy KHÔNG thêm migration (048/049 idempotent) → không câu SQL nào chạy lên dòng cũ. **group_name các đơn đã chia giữ nguyên 100%.** Fix ĐÓNG BĂNG hiện trạng → 63 đơn đang lệch GIỮ NGUYÊN (KHÔNG tự sửa); sửa 63 đơn = Bước 4 opt-in, chưa làm.

**Status:** Done — `node --check` 2 file OK. Verify sau deploy (read-only): mở báo cáo dải 6+ ngày 2 lần, so `GET /api/v2/delivery-assignments/?date=2026-06-01` → group_name khối 69458–69817 KHÔNG đổi. Plan đầy đủ: `~/.claude/plans/ki-m-tra-so-sanh-agile-tower.md`.

### [orders][render] KPI: tính NET theo ĐƠN THẬT TPOS (final − BASE) thay vì cộng dồn audit log ✅

**Vấn đề (user, đơn 260600214 / NJD/2026/70868):** KPI không khớp đơn thật. Modal "So sánh KPI" hiện MM15 NET 2 = 10.000đ nhưng đơn thật chỉ có MM15 qty 1. Nguyên nhân (đã trace 5 agent + đọc code): KPI tính bằng **BASE snapshot + cộng dồn sự kiện audit log** (`calculateNetKPI` replay stack add/remove), **không bao giờ đối chiếu đơn cuối thật trên TPOS**. Audit log drift: MM15 +Thêm×3 (edit_modal_inline + sale_modal + chat_confirm_held) −Xóa×1 → NET 2; Q439H +Thêm rồi −Xóa ảo (chat_decrease) → NET 0 dù vẫn trên đơn; 5 SP base −Xóa ảo lúc 08:16 vẫn còn nguyên. Tổng ra 10.000đ chỉ do MM15 dư +1 triệt tiêu Q439H thiếu −1 (trùng hợp). "Tất cả SP" trống vì `renderAllProductsTab` chỉ đọc cache Firestore, không fallback TPOS.

**Quyết định user:** (1) KPI = `(final TPOS − BASE)`, **GIỮ ô tick** làm cổng; (2) **GIỮ attribution chủ khoảng STT** (quy tắc owner 2026-05-07) — chỉ sửa SỐ LƯỢNG; (3) recompute lịch sử; (4) lấy đơn thật: fetch TPOS 1 lần khi cần rồi LƯU (snapshot), có rồi bỏ qua.

**Giải pháp (append-only, không sửa endpoint KPI cũ):**

- **Backend (migration 074 + `realtime-db.js`):** bảng mới `kpi_final_snapshot` (order_code PK, products JSONB) + endpoints `GET/PUT/DELETE /kpi-final-snapshot/:orderCode` + `POST /kpi-final-snapshot/exists` (batch). Lazy-ensure table trong route (tự tạo trên Render). Script `run-migration-074.js`.
- **`kpi-manager.js`:**
    - `fetchProductsFromTPOS`: token fallback parent/top (KPI iframe thiếu `tokenManager`).
    - Helpers mới: `getKpiFinalSnapshot` / `saveKpiFinalSnapshot` / `ensureKpiFinalSnapshot` (fetch 1 lần, có rồi bỏ qua) / `getMissingFinalSnapshots` (batch).
    - `calculateNetKPI`: NET per SP = `max(0, finalQty − baseQty)` từ snapshot (cùng SP base tăng qty → tính phần dư; đổi biến thể template/tên → 0; SP mới → finalQty). Audit log GIỜ chỉ phân bổ NV (last-add-wins, cap theo NET). Thêm cờ `reconciled` + `real`/`baseQty` per SP. **Thiếu snapshot → fallback replay audit cũ (`reconciled:false`)** để không vỡ. Strict-mode (ô tick) + attribution downstream (chủ khoảng STT trong `recalculateAndSaveKPI`) GIỮ NGUYÊN.
    - `recalculateAndSaveKPI`: ensure snapshot trước khi tính → recompute (nút "Tính lại toàn bộ KPI") + toggle tick tự dùng đơn thật.
- **`tab-kpi-commission.js`:** "Tất cả SP" fallback đọc snapshot (sửa "Không có dữ liệu sản phẩm"); "So sánh KPI" thêm banner trạng thái đối chiếu + badge per-row "⚠ đơn thật N" khi audit ≠ thật; ghi chú per-user breakdown là hiển thị, lương theo chủ khoảng STT; `showOrderDetails` ensure snapshot khi mở modal; `refreshData` quét nền fill snapshot thiếu cho đơn đang hiển thị.

**Kết quả:** đơn 260600214 → MM15 (tick) qty1 = **5.000đ** (đúng), Q439H net1 nhưng chưa tick = 0 (món chưa tick), "Tất cả SP" hiện đủ 6 SP. NET độc lập với drift audit. Test: `tests/unit/kpi-reconciled-net.test.js` (5/5 pass).

**Files:** `render.com/migrations/074_create_kpi_final_snapshot.sql`, `render.com/run-migration-074.js`, `render.com/routes/realtime-db.js`, `orders-report/js/managers/kpi-manager.js`, `orders-report/js/tab-kpi-commission.js`, `tests/unit/kpi-reconciled-net.test.js`.

**Deploy/verify:** push → Render auto-deploy (bảng lazy-ensure, hoặc chạy `node render.com/run-migration-074.js`). Mở đơn bất kỳ → modal ensure snapshot → KPI reconciled. Sửa toàn bộ lịch sử: nút **"Tính lại toàn bộ KPI"** (ensure snapshot + recompute từng đơn). ⚠ Lương đã trả có thể đổi — review trước.

**Status:** ✅ Done (chờ deploy + recompute lịch sử).

### [orders] Fix: modal "Sửa đơn hàng" mở lên hiện SP cũ, không load mới nhất từ TPOS ✅

**Vấn đề (user, sau khi fix save):** TPOS + panel chat hiện **6 SP** (có thêm `B703D` Legging Đùi Đen) nhưng modal "Sửa đơn hàng" của shop chỉ hiện **5 SP** — mở modal không cập nhật Details mới nhất từ TPOS.

**Root cause:** `openEditModal` ([tab1-edit-modal.js:38](orders-report/js/tab1/tab1-edit-modal.js#L38)) dùng `_editOrderCache` nhưng **chỉ revalidate khi cache quá `EDIT_CACHE_TTL` (2 phút)**. Line `B703D` được thêm qua panel chat (flow khác) → cập nhật TPOS + invalidate `orderDetailsCache` (cache của chat) nhưng **KHÔNG** đụng `_editOrderCache` (cache riêng của edit modal). Mở lại modal trong 2 phút → cache HIT, chưa stale → render 5 SP, không refetch.

**Fix:**

- `openEditModal`: SWR đúng nghĩa — render cached ngay RỒI **LUÔN** revalidate nền (bỏ điều kiện `if (isStale)` + bỏ `EDIT_CACHE_TTL`). `fetchOrderData(silent)` re-render nếu user chưa sửa gì → kéo Details mới nhất từ TPOS mỗi lần mở (cũng cover sửa từ TPOS/máy khác).
- `updateOrderWithFullPayload` (tab1-merge.js — helper chung mọi flow mutate): sau PUT OK gọi `window.invalidateEditOrderCache?.(orderData.Id)` → mutation cùng phiên (chat/sale/merge) làm lần mở edit-modal kế tiếp fetch sạch (hết flash SP cũ).
- Bump `?v=20260606b` cho tab1-edit-modal.js + tab1-merge.js.

**Files:** `orders-report/js/tab1/{tab1-edit-modal.js, tab1-merge.js}`, `orders-report/tab1-orders.html`. **Status:** `node --check` OK; verify browser (mở modal → có GET SaleOnline_Order mới).

### [web2/products] In tem mã vạch — cảnh báo mã quá dài + thêm khổ tem rộng (fix "chỉ quét được áo len be") ✅

**Root cause (xác định bằng mô hình mật độ vạch):** barcode in ĐÚNG giá trị (CODE128 mã hoá đúng `code`, chữ hiển thị cùng biến) — lỗi là **vật lý**: tem mặc định 25mm, Code128 ~`35 + 11·n` module. Vạch hẹp nhất (X-dim) = `labelW·0.88 / modules`. Ngưỡng quét ~0.2mm ⇒ tem 25mm chỉ đọc tốt mã **≤6 ký tự**. Khớp 100% triệu chứng đơn Hạnh Trần: `B4AOBE`(6)=0.218mm ✅, `HCDAMDO`(7)/`B4DAMVANG`(9)/`ADQUANDENM`(10)=0.15–0.2mm ❌.

**Fix (`web2-products-print.js`):**

- Thêm preset **"Tem rộng 50×30mm (mã dài)"** (1 con/khổ) → X-dim ~0.3mm, quét tốt mọi mã. (Tem 35mm cũng đủ: maxLen=10.)
- **Cảnh báo mật độ** trong modal in: tính X-dim theo khổ tem đang chọn, liệt kê mã quá dài + maxLen + gợi ý "chọn tem rộng hơn hoặc rút gọn mã". Cập nhật realtime khi đổi khổ tem.
- Helper `estCode128Modules` / `estXdimMm` / `maxScannableLen` / `densityWarnHTML`.

**Files:** `web2/products/js/web2-products-print.js`.
**Verify (localhost, mở modal với 4 mã đơn Hạnh Trần):** tem 25mm → cảnh báo đúng 3 mã `HCDAMDO, B4DAMVANG, ADQUANDENM` (≤6 ký tự); đổi sang 35mm/50mm → cảnh báo biến mất (tất cả quét được). Layout tem (tên 2 dòng → barcode → mã+giá) vốn đã có.

### [render][web2] Đối soát đóng gói — ẩn lịch sử mặc định + ưu tiên list SP + chẩn đoán scan lỗi ✅

**Yêu cầu (user):** (1) ẩn lịch sử đi, cần mới mở; (2) quét bill PBH ưu tiên hiện toàn bộ danh sách SP để quét; (3) đơn Hạnh Trần chỉ quét được áo len be, 3 mã kia "không nhận".

**(1) Lịch sử lazy/collapsible:** thay section luôn hiện → nút toggle "Lịch sử đối soát" (chevron), **ẩn mặc định**. Mở PBH mới → `historyOpen=false` reset. Click toggle → mở + lazy-load lần đầu (`loadHistory` guard `if(!historyOpen) return`). Mutation/SSE chỉ refresh khi đang mở. → bớt cả network.

**(2) Ưu tiên list SP:** ẩn lịch sử → bảng SP là nội dung chính ngay khi mở. Thêm `panel.scrollTop=0` lúc selectPbh → thấy trọn danh sách cần quét.

**(3) Chẩn đoán scan:** đã verify data Hạnh Trần (NJ-20260604-0004): 4 mã `HCDAMDO/B4DAMVANG/B4AOBE/ADQUANDENM` đều **ASCII sạch, có trong web2_products, không có field barcode riêng** → matching phần mềm ĐÚNG cho cả 4 (đã test live normCode). ⇒ "chỉ áo len be quét được" là do **barcode in vật lý 3 SP mã hoá lệch giá trị / in mờ**, KHÔNG phải bug matching. Cải thiện: lỗi scan giờ liệt kê mã cần quét → user thấy ngay giá trị barcode đọc ra lệch (`Mã "X" không khớp đơn. Mã cần quét: ...`). Workaround: ô tích tay (✋ + log camera) đánh dấu SP không quét được.

**Files:** `render.com/routes/reconcile.js`, `web2/reconcile/js/reconcile-app.js` (`v=nj6`), `web2/reconcile/css/reconcile.css` (`v=nj5`), `web2/reconcile/index.html`.
**Verify (localhost, test PBH):** lịch sử ẩn mặc định (sectionHidden=true), bảng SP hiện ngay; click toggle → mở + lazy-load 9 entry; click lại → ẩn. Lỗi scan cần deploy.

### [orders] Fix: modal "Sửa đơn hàng" báo lưu thành công nhưng KHÔNG sync sản phẩm lên TPOS ✅

**Vấn đề (user):** Sửa sản phẩm trong modal **"Sửa đơn hàng"** → "Lưu tất cả thay đổi" → toast xanh "Đã lưu thành công!" nhưng **TPOS không đổi** (mở lại đơn → SP về như cũ). Sửa SP ở **panel chat** thì TPOS cập nhật bình thường.

**Root cause:** Commit `53b20630c` (2026-05-06, "optimistic concurrency end-to-end") đổi save của edit-modal + sale-modal sang **giữ payload `Details` "bẩn"** (clone nguyên từ GET `$expand`, mọi field server/computed) **+ thêm header `If-Match`**. Flow chat (dọn từ 2026-04-22) thì **rebuild `Details` SẠCH + KHÔNG If-Match** nên chạy tốt. Cùng endpoint `PUT /api/odata/SaleOnline_Order(id)` → khác ở cách dựng request. Payload Details "bẩn" làm **TPOS trả 200 nhưng âm thầm bỏ qua collection Details** ("lưu thành công giả"). Đã loại trừ CORS/412: curl OPTIONS xác nhận worker đã whitelist+forward `If-Match` (`shared/universal/cors-headers.js`) → comment "If-Match gây CORS reject" trong tab1-merge.js là STALE.

**Fix (theo lựa chọn user — bỏ If-Match, dùng lại helper sạch; scope = modal + sale modal):** Hợp nhất 2 path bespoke về helper đã chứng minh chạy tốt `window.updateOrderWithFullPayload` (tab1-merge.js — chat/merge/live-waiting đều dùng).

- `tab1-edit-modal.js` `saveAllOrderChanges`: giữ pre-PUT freshness GET + merge otherFlowAdditions; tính totals; **thay** block `prepareOrderPayload`+`If-Match`+`smartFetch` bằng `await window.updateOrderWithFullPayload(currentEditOrderData, Details, totalAmount, totalQuantity)`; giữ nguyên xử lý sau save.
- `tab1-sale.js` `_updateSaleOrderWithAPIImpl`: giữ STEP 1 (GET fresh) + STEP 2 (`mergeLocalLinesIntoServerDetails`); **thay** STEP 3 (`_formatRowVersionETag`+`If-Match`+PUT clone bẩn) bằng helper; `_finalizeSaleOrderUpdate` nhận `result` thay vì `Response`; xoá `_formatRowVersionETag` (hết caller).
- `tab1-merge.js`: sửa comment CORS stale (giải thích vì sao CỐ Ý không gửi If-Match = last-write-wins; muốn optimistic thật → gửi đúng `@odata.etag`).
- Bump `?v=20260606a` cho 3 file trong `tab1-orders.html`.

**Tradeoff:** bỏ If-Match = last-write-wins; an toàn vẫn ổn vì cả 2 path fetch-fresh-merge trước PUT. Đã verify đây là 2 nơi DUY NHẤT còn gửi If-Match trong `orders-report/js`.

**Files:** `orders-report/js/tab1/{tab1-edit-modal.js, tab1-sale.js, tab1-merge.js}`, `orders-report/tab1-orders.html`.

**Status:** `node --check` 3 file OK. Chờ verify browser (Network: PUT 200, không header If-Match, Details persist sau reload).

### [web2/partner-customer] Bỏ cột "Nợ hiện tại" ✅

**User:** bỏ cột nợ ở trang Khách hàng Web 2.0 (số dư ví đã hiện qua pill cạnh SĐT rồi).

**Files:** `web2/partner-customer/{index.html, js/partner-customer-app.js, css/partner-customer.css}`

- Bỏ `<th class="pc-col-credit">Nợ hiện tại</th>` + `<td class="pc-col-credit">` + toggle checkbox `data-col="credit"` + CSS `.pc-col-credit` + biến `credit`.
- Bỏ luôn cột "Nợ hiện tại" trong export Excel (header + data `Number(p.Credit)` + `!cols` width + number-format loop c:7).
- Số dư ví Web 2.0 vẫn hiện qua `pc-wallet-pill` (`data-w2wallet-phone`) cạnh SĐT.

**Verify localhost:** headers còn `Tên/ĐT/Email/Địa chỉ/Nhãn/Hiệu lực`, 0 credit cell, 49 pill ví hiện. ✅

### [tpos-pancake] Comment row: bỏ "Nợ TPOS" → hiện số dư ví Web 2.0 ✅

**User:** "Nợ 2.000.000đ" trên row comment là nợ TPOS (`sharedDebtManager.getDebt`) → đổi thành **số dư ví Web 2.0** của khách.

**Files:** `tpos-pancake/js/tpos/tpos-comment-list.js`

- `renderCommentItem`: bỏ badge `Nợ: ${debtDisplay}` (TPOS debt) → render placeholder `<span data-w2wallet-phone="${phone}">`.
- Gọi `Web2WalletBalance.attachBalances(list)` (module có sẵn, đã load) sau mỗi render (full/patch/append-older) → fetch `/api/web2/wallets/by-phone/:phone` + inject pill `Ví: X₫` (chỉ hiện khi >0, cache 60s, SSE invalidate).
- `_rowSig` bỏ phụ thuộc `debt`/`showDebt` (pill inject async, độc lập innerHTML).

**Verify localhost:** 55 placeholder xử lý xong, 5 pill ví hiện số dư thật (Ví: 1.645.000₫, 11.604.000₫…), 0 debt-badge. ✅

### [orders] KPI "Xác nhận kiểm tra đơn" — fix lưu lúc được lúc không ✅

**Vấn đề:** Bấm "✓ Đã kiểm tra" ở tab KPI - Hoa Hồng, trạng thái lưu vào Firestore `kpi_commission/data/order_checks` **lúc được lúc không**; UI tô ✓ ngay (optimistic) nên tưởng đã lưu trong khi ghi chưa tới server.

**Nguyên nhân** (object `KPICommission._orderCheckStore` trong `orders-report/js/tab-kpi-commission.js`):

- `markChecked()` ghi best-effort, **nuốt lỗi**: `if (!col) return` (bỏ qua khi firebase chưa sẵn) + `catch { console.warn }` — không retry, không rollback, không báo người dùng.
- `init()` **self-poisoning**: cache `_initPromise` đã-resolve cả khi `_getCol()` null → không bao giờ retry → listener không gắn, `_data` trống.
- (Loại trừ) KHÔNG phải do thiếu persistence: `shared/js/firebase-config.js` auto-init Firestore với `enablePersistence:true` → hàng đợi IndexedDB của Firestore đã lo durability qua reload → không cần WAL.

**Fix** (theo quyết định user: chỉ báo khi lỗi + retry/xác minh trong phiên, KHÔNG durable queue):

- Thêm `_ensureFirebaseReady()` — chờ firebase sẵn sàng (poll 150ms, trần 3s) thay vì bail im lặng.
- Sửa `init()` — bỏ self-poisoning (reset `_initPromise=null` khi chưa có col / listener fail), chỉ set `_initialized=true` khi listener gắn xong.
- Thêm `_persistWithRetry()` — `set(merge)` retry 4 lần backoff 0.6s→1.5s→3s; `set()` resolve = thành công (server ack / sẽ-sync), reject hết lượt = false.
- `markChecked()` — sau optimistic ✓: nếu `_persistWithRetry` fail hẳn → **rollback ✓** + toast cảnh báo. Thành công → im lặng.
- Thêm `_notify()` — toast inline tự chứa (orders-report không load notification-system), chỉ dùng báo lỗi.

**Files:** `orders-report/js/tab-kpi-commission.js` (object `_orderCheckStore`), `orders-report/tab-kpi-commission.html` (bump `?v=20260606checkfix`).

**Giới hạn đã biết (user chấp nhận):** còn khe hở hiếm (persistence không bật được + offline + đóng/reload tab ngay) có thể rớt — cần durable queue mới đảm bảo tuyệt đối.

**Status:** ✅ DONE. Verified Playwright (local): fail→rollback ✓ + toast lỗi (4 attempts ~5.1s backoff); success→im lặng giữ ✓ (1 attempt); init→listener gắn + nạp 68 record thật, `_initPromise` giữ khi thành công.

### [tpos-pancake] Force extract — chuyển sang CLIENT-SIDE (fix FB chặn backend) ✅

**Vấn đề:** Force extract + nút "Lấy thumbnail" fail hết `no m3u8 URL`.

**Đã test cạn mọi đường BACKEND (Render logs production, có deploy):**

- yt-dlp **update latest 2026.03.17** (postinstall `yt-dlp -U`, verified build log) → vẫn `[facebook] Cannot parse data` = **FB chặn yt-dlp không-auth từ IP datacenter**.
- Graph `source`: page token (Pancake) → `code=190 Bad signature`; + appsecret_proof (FB_APP_SECRET) → vẫn Bad signature (token app khác); app token → `code=10/100` no-permission. FB deprecate source/playable_url cho live VOD.
- Không có FB account cookies (AUTOFB = autofb.pro bên thứ 3, không phải facebook.com).
  → **Backend bất khả thi**: không token/cookie FB hợp lệ. FB auth CHỈ có ở browser.

**Fix = CLIENT-SIDE** (`tpos-pancake/js/tpos/tpos-livestream-snap.js`): browser có FB session thật → seek iframe FB VOD (`plugins/video.php?...&t=offset`) tới đúng giây từng comment → capture frame (extension/getDisplayMedia crop wrapper) → POST `/api/livestream/snapshot` imageBase64 (bytea). KHÔNG cần yt-dlp/cookies/Graph.

- `_buildSeekEmbedUrl` + `_clientCaptureAtOffset` + `_clientRestoreLive` (helper mới).
- Chip "Force extract" → group pending comment theo video → seek+capture từng cái, progress `N/total ✓`, restore live khi xong.
- Nút "Lấy thumbnail" từng comment cũng chuyển client-side.
- Backend `_resolveViaGraphSource` DISABLED (return null, đỡ 6 call thừa/snap cron).

**Verify live (browser + extension, 4 campaign):** `14/690 14✓ 0 fail`, **90 thumbnail thật render**, POST /snapshot đều success, iframe seek `&t=` đúng. ✅ Lưu ý: `&t=` chỉ seek được VOD (live đã end); live đang chạy → auto-snap lo.

### [orders][kpi] Đơn chưa có phiếu / phiếu Nháp → "⏳ Chờ phiếu", KHÔNG tính KPI

User: đơn `260501709` tính 5.000đ KPI dù cột Phiếu Bán Hàng = "—" (chưa có phiếu, còn "GIỮ ĐƠN"). Phiếu **Hủy/Nháp/không có** → phải loại không tính KPI. Chốt: đơn chưa-phiếu/Nháp **vẫn hiển thị** đánh dấu "Chờ phiếu", KHÔNG cộng tổng (đơn Hủy giữ nguyên: ẩn hoàn toàn).

**Root cause**: `applyFilters` đã loại đơn Hủy (`_isInvoiceCancelled`) nhưng đơn **không có phiếu** (`_invoiceCache.get`=undefined → `_isInvoiceCancelled` trả false) và **Nháp** vẫn lọt → tính KPI. KPI lưu độc lập phiếu (`kpi_statistics`) nên xử lý ở **tầng hiển thị/filter** (re-eval mỗi load → phiếu xác nhận thì tự tính lại).

**Fix** (chỉ frontend `orders-report/`, KHÔNG đụng backend/kpi-manager):

- Helper `_isOrderKpiPending(order)`: không phiếu HOẶC `ShowState='Nháp'`/`StateCode='draft'` → pending (Hủy → false, ẩn riêng).
- `applyFilters`: gắn cờ `_kpiPending` thay vì loại (giữ `continue` cho Hủy). Chokepoint duy nhất → feed leaderboard/summary/modal.
- Loại pending khỏi MỌI tổng: `updateSummaryCards`, `aggregateByEmployee` (+`pendingCount`/emp → badge), header `_updateHeroStats` tự đúng (đọc aggregated), `orderCount` leaderboard+table.
- Modal "Chi tiết KPI" `renderEmployeeOrdersTable`: đơn pending → pill `⏳ Chờ phiếu · chưa tính` (amber), KPI cell gạch mờ, row vàng nhạt, đếm `pendingOrders` (KHÔNG vào totalOrders/okOrders/kpiGross). Stat card "⏳ Chờ phiếu: N" (`l1SumPendingCard`, ẩn khi 0). Simple-mode luôn hiện pending. Tab "Tất cả đơn" count = totalOrders+pending.
- HTML: card "Chờ phiếu" trong `modalL1Summary`. CSS: `.pill-pending`/`.is-kpi-pending`/`.kpi-pending-amount`/`.l1-sum-pending`/`.lb-emp-pending-badge` (amber). Cache-bust `?v=20260605pending`.

**Verify**: unit test `_isOrderKpiPending` 12/12 (no-inv/Nháp/draft→pending; xác nhận/thanh toán/hoàn thành→tính; hủy các kiểu→false). `node --check` OK. Live: đơn `260501709` → pill Chờ phiếu, tổng KPI giảm đúng 5.000đ; reload sau khi phiếu xác nhận → tự tính lại. **Status**: DONE (logic verified, live chờ user reload).

### [inbox] ⚡ PERF: trang Đơn Inbox hết tải nặng — KPI thẻ "tất cả" thôi auto kéo toàn bộ lịch sử đơn ✅

**Files:** `don-inbox/js/tab-social-core.js`, `don-inbox/js/tab-social-kpi-reconcile.js`

**Nguyên nhân (user nghi đúng — do KPI):** Mở trang ở filter mặc định "Tất cả", `updateInboxKpiStatCard()` tự gọi `ensureRangeLoaded()`; vì `from=0` nên vòng phân trang `/api/social-orders/load?limit=1000&page=N` chạy tới 12 lần × 1000 đơn (kèm JSONB `products[]`) — chỉ để hiện con số KPI — NGAY SAU khi đã tải 500 đơn cho bảng.

**Fix (lazy + tính khi cần, frontend-only):**

- `tab-social-core.js`: bỏ auto-trigger `ensureRangeLoaded` khi render thẻ; tính KPI trên tập đơn đã load (500 gần nhất). Thêm `coversRange` → hint "≈ trên N đơn gần nhất — bấm để tính đủ" khi chưa phủ đủ. Thêm `refreshKpiCardWhenInvoiceReady()` (poll nhẹ, không network) để refresh thẻ 1 lần khi `InvoiceStatusStore` load xong (tránh thẻ ra 0 lúc mở).
- `tab-social-kpi-reconcile.js`: guard `ensureRangeLoaded` (range hẹp đã đủ thì khỏi phân trang); `showDetailModal` cập nhật lại thẻ sau khi kéo đủ.
- Kéo đủ khoảng vẫn chạy khi bấm thẻ KPI hoặc "Chạy đối soát KPI" (không đổi nghiệp vụ).

**Verify (Playwright localhost):** mở trang chỉ còn 1 request `load?limit=500` (+`/tags`), HẾT loạt `limit=1000&page` → thẻ tự lên "480 món · 2.400.000đ" (≈ trên 500 đơn) khi store sẵn sàng; bấm thẻ kéo đủ 2749 đơn → "2.782 món · 13.910.000đ" (khớp số production). **Status:** ✅ DONE — commit `04e6f92e3` + `3e2ce93c5`.

### [issue-tracking] 🔴 FIX: đơn "Khách Gửi" không cộng công nợ vào ví khi số tiền hoàn lệch + tách lịch sử 2 bước ✅

**Files:** `issue-tracking/js/script.js`, `shared/js/ticket-history-viewer.js`, `issue-tracking/css/style.css`

**Triệu chứng (user):** Đơn #69924 (Yến Trần, NJD/2026/69924) loại RETURN_CLIENT "Khách Gửi", đã "Hoàn Tất", Giá trị hoàn 240K, ghi chú "CHỊU LỖ 80K". Ví Customer 360 có activity "Sự vụ RETURN_CLIENT" nhưng số dư = 0đ → tiền hoàn KHÔNG vào ví.

**Root cause:** Lúc tạo ticket `money = max(0, refundBase - compEntered)` → "Giá trị hoàn" là NET (đã trừ Khách bù/chịu lỗ). Lúc Hoàn tất, `processRefund` tạo phiếu TPOS theo giá GỘP SP → `refundAmountFromJson` = GROSS. Điều kiện cộng ví dùng so sánh BẰNG TUYỆT ĐỐI `amountMatches = (GROSS === NET)` → có chịu lỗ → lệch → rơi nhánh SKIP-CREDIT: chỉ hiện dialog "cộng tay" rồi `updateTicket(COMPLETED)` mà KHÔNG gọi `/resolve` → ví không cộng. Activity "Sự vụ" ghi độc lập ở `tickets.js:545` → ảo giác "có giao dịch". → MỌI đơn hoàn có Khách bù/chịu lỗ hoặc sửa tay số tiền đều bị sót.

**Fix Part A (logic):** Gộp 2 nhánh `if(amountMatches)/else if(!amountMatches)` thành 1 nhánh `if(isReturnClientAutoCredit)` → LUÔN gọi `resolveTicket({compensation_amount, compensation_type:'deposit'})` (cộng Tiền thật theo Giá trị hoàn). Số TPOS lệch → chỉ `console.warn` + toast `notificationManager.warning` cảnh báo, KHÔNG chặn. Dialog "cộng tay" chỉ còn khi `resolveTicket` lỗi thật. Quyết định user: luôn cộng theo Giá trị hoàn / ví Tiền thật / chỉ sửa code không động đơn cũ.

**Fix Part B (lịch sử dễ kiểm tra):** Tách bước "Nhận hàng" của RETURN_CLIENT thành 2: **"Nhận hàng (nhập kho)"** + **"Cộng công nợ"** (chỉ khi money>0). Tín hiệu credited = `ticket.walletCredited ?? ticket.wallet_credited` (cột `wallet_credited` do `/resolve` set, mang sang FE qua spread `...ticket`). Thêm trạng thái bước `missed` = `!credited && COMPLETED` → render đỏ ✗ "CHƯA cộng — cộng tay Customer 360" (đơn cũ bị sót như #69924 sẽ tự hiện cờ này). Sửa cả 2 builder: `buildTicketTimeline` (in-row summary) + `buildTimeline` (modal Xem chi tiết) + render (`buildTimelineSummaryHTML` icon ✗, `renderBody` cls `missed`) + CSS `.step-missed`/`.thv-step.missed` + enrich audit-log match tolerant (`startsWith(mapped+' ')`). Loại khác (RETURN_SHIPPER/BOOM/FIX_COD) không đổi.

**Status:** DONE — `node --check` pass cả 2 file JS. Cần verify live trên khách TEST.

### [render][web2] Đối soát đóng gói — DEPLOY LIVE + endpoint hủy đóng gói (cancel-pack) ✅

**Deploy:** Render auto-deploy (commit `4030613`) LIVE — verify prod cả 3 fix: (1) `/api/reconcile/logs` trả log cross-PBH (modal camera); (2) `/logs?search=` lọc OK; (3) **normCode**: quét `b4damvang` (thường) khớp line `B4DAMVANG` → `1/1` ✅ (fix "barcode không nhận / không lưu").

**Thêm `POST /:number/cancel-pack`** (schema đã có sẵn action `cancel-pack` từ trước nhưng chưa hiện thực): hủy đóng gói khi lỡ pack nhầm (chưa giao shipper) → tính lại state từ picked_lines (pending/picking/picked), xóa packed_at, log `cancel-pack`. Chặn nếu đã shipped/delivered. Frontend: nút **"Hủy đóng gói"** hiện khi state=packed (cạnh "Giao shipper"). (Tiện thể fix gap UX: trước đây pack rồi không undo được.)

**Files:** `render.com/routes/reconcile.js`, `web2/reconcile/js/reconcile-app.js` (`v=20260606nj5`), `web2/reconcile/index.html`.

### [render][web2] 🔴 FIX CRITICAL: cộng ví Web 2.0 fail toàn bộ + CK tự động hoàn toàn ✅

**Triệu chứng (user):** "Nguyễn Tâm gửi đã ck → stuck 'Đang xử lý' và chưa gửi tin nhắn lại → tự động hoàn toàn phần này." GD SePay 2.222đ (id=155028) badge "Đang xử lý" (debt_added=false), signal id=2 confirmed nhưng phone=None/matchedTx=None.

**Root cause (NGHIÊM TRỌNG):** Approve thử trên prod báo `column "performed_by" of relation "web2_wallet_transactions" does not exist`. → Từ khi deploy audit `performed_by`, `web2-wallet-isolation.ensureSchema` **abort giữa chừng**: bước 4 (DO block `SELECT MAX(id) FROM customer_wallets/wallet_transactions/...`) + bước 5 (`DROP TRIGGER ON <legacy>`) tham chiếu bảng **legacy KHÔNG tồn tại trên web2Db** (đã tách DB 2026-06-03) → throw → outer try (line 211) nuốt → **ALTER `performed_by` (đặt cuối) KHÔNG bao giờ chạy**. processDeposit/processWithdraw INSERT `performed_by` → fail → **MỌI lần cộng/trừ ví Web 2.0 fail** (SePay auto-credit, CK approve, nạp tay) → ví kẹt, GD kẹt "Đang xử lý". Self-reinforcing: ví rỗng → c.w=0 → backfill `FROM customer_wallets` lại throw.

**Deploy + verify (prod, clone test 0123456788):** 2 commit (`4030613bd` vẫn fail vì block CREATE `LIKE wallet_adjustments` ném TRƯỚC ALTER → `c9e3898d5` chuyển ALTER `performed_by` lên ĐẦU `ALTER TABLE IF EXISTS` + guard CREATE bằng DO/to_regclass). Sau deploy: `POST /payment-signals/2/approve {phone:0123456788, txId:155028}` → `{success:true, credited:true}`. GD155028 `debt_added=true` AUTO_APPROVED (hết "Đang xử lý"); signal id=2 history: detect→confirm→approve(+ví)→**notify "đã gửi tin báo KH"** (Nguyễn Tâm nhận tin). ⇒ unblock TOÀN BỘ cộng/trừ ví Web 2.0 (SePay/CK/nạp tay).

**Fix (`web2-wallet-isolation.js`):**

- **ALTER `performed_by` chuyển lên SỚM** (bước 3b, ngay sau CREATE) + try riêng → cột LUÔN tồn tại bất kể bước legacy lỗi.
- Bước 4 setval-from-legacy: bọc JS try/catch (guard to_regclass parse-time không đủ — plpgsql parse `FROM customer_wallets` vẫn fail → try/catch JS là lá chắn thật). ALTER COLUMN default tách riêng (không ref legacy → luôn chạy).
- Bước 5 DROP TRIGGER: bọc `IF to_regclass(...) IS NOT NULL` (utility command trong IF không execute khi guard NULL).
- Bước 6 backfill: guard `c.lw/lt/la` (to_regclass) + bọc try; transactions backfill dùng explicit columns (tránh mismatch `performed_by`).
- Test `scripts/_tmp` (DB không legacy): 4/4 — performed_by thêm, anti-dup index tạo, ensureSchema chạy tới hết.

### [web2][native-orders] Badge "KH báo đã CK" cập nhật LIVE qua SSE ✅

Native-orders subscribe thêm `web2:payment-signals` (cạnh `web2:native-orders`) → KH nhắn "đã ck"/"ck xong" (signal mới) hoặc watcher tự khớp tiền (auto-link/confirm) → badge `💸 KH báo đã CK` hiện/đổi xanh NGAY, không cần F5. Debounce chung 600ms (`_scheduleReload`). `?v=20260606ck`. Commit `484f64bd1`. Note: CK chỉ là cờ mềm + cộng VÍ (theo SĐT) — KHÔNG tự đánh dấu đơn "đã thanh toán" (badge đó đến từ PBH residual≤0).

### [render][web2] CK watcher — chỉ auto khi ĐỊNH DANH khớp (tránh gửi nhầm khách) ✅

**User:** "tránh gửi nhầm khách thì ưu tiên gửi khách có trong danh sách nhắn đã ck, ck xong." → `_classify`: bỏ `amountHit` (chỉ trùng số tiền) khỏi điều kiện "sure". Giờ chỉ auto-confirm+cộng ví+reply khi định danh KH thật sự khớp GD: **phoneHit / partnerHit (partner_id TPOS) / nameHit-duy-nhất**. Chỉ trùng số tiền (2 KH có thể cùng tiền) → **NOTIFY staff duyệt tay**, KHÔNG tự gửi. Test +C12 → 27/27.

### [render][web2] CK watcher 2 CHIỀU — tiền-về-trước HOẶC đã-ck-sau đều auto ✅

**User hỏi:** "phải theo thứ tự hả? đã ck trước + tiền về sau — còn đã ck sau + tiền về trước?". Đúng — bản trước chỉ có `onNewSepayTx` (chạy khi tiền về) → case **tiền về TRƯỚC, KH nhắn 'đã ck' SAU** bị bỏ sót (signal kẹt pending, không reply).

**Fix (`web2-ck-watcher.js` + `server.js`):** thêm `onNewSignal` đối xứng — signal "đã ck" mới tạo → quét GD SePay đã về 72h (`NOT EXISTS` signal khác claim) khớp phone/partner/tên/tiền → auto-confirm + cộng ví + reply. Refactor helper chung `_applyMatch` với **CLAIM atomic** (`UPDATE ... WHERE matched_tx_id IS NULL RETURNING`) → chỉ 1 nguồn thắng race, chống double-credit/double-reply (1 GD ↔ 1 signal). Wire `server.js`: `onNewSignal` sau `handleIncoming` (cả new_message + update_conversation) + `initDeps` boot. Test 24/24 (C8-C11: GD-về-trước→signal-sau, partnerHit resolve, no-GD no-op, chống cướp GD đã claim).

### [render][web2] CK watcher TỰ ĐỘNG HOÀN TOÀN — xét pending + resolve SĐT/partner từ GD ✅

**`web2-ck-watcher.js` (rewrite):** Trước chỉ match signal `status='confirmed'` → "đã ck" (pending) không bao giờ tự link/reply, phải duyệt tay. Giờ:

- Xét CẢ `status IN ('pending','confirmed')` + `matched_tx_id IS NULL` 72h → khớp CHẮC thì **auto-confirm (pending→confirmed) + cộng ví + gửi reply**, không cần staff.
- Resolve danh tính GD từ **QR registry** (`web2_payment_qr_codes` qua nội dung) → phone + customer_id + tên, kể cả GD đang ambiguous (PENDING) cũng giải quyết được (cộng cho đúng SĐT resolve).
- 4 mức khớp ưu tiên: **phoneHit** > **partnerHit** (customer_id=partner_id TPOS) > **nameHit** (tên duy nhất) > **amountHit** (đúng tiền ≤24h, duy nhất). Trùng/xung đột → notify staff (KHÔNG tự cộng).
- SĐT cộng ví = `sig.phone || SĐT resolve từ GD`. linkTransaction idempotent (debt_added) → không cộng 2 lần.

**`web2-payment-signal-detector.js`:** thêm cột `customer_id BIGINT` (= web2_customers.id = TPOS Partner Id) + `_resolveCustomer()` lấy CẢ phone+customerId (partner_id có cả khi phone trống → partnerHit). Store customer_id khi tạo signal.

**Test:** `scripts/test-ck-watcher-auto.js` 16/16 (pending auto-confirm, partnerHit resolve SĐT từ QR, nameHit duy nhất, tên trùng→notify, confirmed giữ behavior, conflict no-op, idempotent). `test-ck-features.js` 10/10 (thêm cột performed_by vào bảng test).

### [render][web2] Đối soát đóng gói — modal lịch sử toàn bộ + filter đối chiếu camera ✅

**Yêu cầu (user):** "lịch sử cho tìm kiếm, filter chi tiết để có thể tìm nếu cần, chủ yếu là filter ra tích tay thời gian nào để đối chiếu camera."

**Giải pháp:** lịch sử per-PBH cũ không tra được cross-PBH theo thời gian → thêm **modal "Lịch sử / Camera"** (nút header) tra TOÀN BỘ log đối soát với filter chi tiết.

- **Server mới `GET /api/reconcile/logs`** (khai báo TRƯỚC `/:number` để không bị nuốt route): filter `action` + `from`/`to` (ms) + `search` (PBH / mã SP / người) + limit≤1000, ORDER BY created_at DESC. Query thẳng `pbh_fulfillment_logs`.
- **Frontend modal** (`reconcile-app.js` + `index.html` + `reconcile.css`):
    - Chips action (mặc định **✋ Tích tay**), nút nhanh `2 giờ / Hôm nay / 7 ngày`, 2 ô `datetime-local` Từ–Đến, ô search, nút Lọc.
    - Bảng kết quả: Thời gian (DD/MM/YYYY HH:MM:SS) · PBH (click mở chi tiết + đóng modal) · Thao tác (+ badge `📹 camera` cho tích tay) · SP·SL·chuyển trạng thái · Người.
    - Dòng tích tay highlight tím; mặc định lọc tích tay + hôm nay → thấy ngay "tích tay lúc nào" để soi camera.
    - Anti-lag tuân thủ: dùng `.modal-content`/`.modal-body`, KHÔNG backdrop blur, shadow ≤24px, `contain`, `cv-auto` rows, body scroll lock iOS-safe (position:fixed+top), Esc/click nền đóng.

**Files:** `render.com/routes/reconcile.js`, `web2/reconcile/js/reconcile-app.js`, `web2/reconcile/index.html` (`css v=20260606nj4`, `js v=20260606nj4`), `web2/reconcile/css/reconcile.css`.
**Verify:** static — IDs HTML↔JS khớp hết, class CSS đầy đủ, syntax OK. **Cần deploy Render** để endpoint `/logs` chạy (server hiện tại chưa có → modal sẽ báo lỗi tải tới khi deploy).

### [render][web2] Đối soát đóng gói — tích tay: confirm + ghi lịch sử "đối chiếu camera" ✅

**Yêu cầu (user):** "tích tay có confirm và ghi luôn là lưu lịch sử lại check camera."

**Vì sao:** tích tay = đánh dấu pick đủ mà KHÔNG quét barcode → dễ sai/gian lận → cần (1) xác nhận chủ ý, (2) lưu vết rõ ràng để soi lại camera khi đối chứng.

**Fix (`reconcile-app.js`):**

- `toggleManualPick`: thêm `confirm()` trước khi áp dụng. Tích → hộp thoại cảnh báo "tích tay không quét, LƯU LỊCH SỬ để đối chiếu camera". Bỏ tích → confirm nhẹ. Hủy → `renderDetail()` revert checkbox về state server (change event đã toggle visual).
- Gửi kèm `note: 'Tích tay (không quét) — đối chiếu camera'` trong body manual-pick.
- `historyNote`: action `manual-pick` + pickedQty>0 → luôn gắn cờ `📹 đối chiếu camera` (suy từ action type → bền vững cả với log cũ chưa có payload.note). Bỏ tích (SL 0) không gắn cờ.

**Fix (`reconcile.js` server):** manual-pick nhận `note` → lưu vào `payload.note` audit log (deploy-gated; display chạy không cần deploy vì derive từ action).

**Files:** `render.com/routes/reconcile.js`, `web2/reconcile/js/reconcile-app.js`, `web2/reconcile/index.html` (`v=20260606nj3`).
**Verify (test PBH NJ-20260605-0001):** confirm hủy → checkbox revert, server giữ pending 0 (không lưu); confirm accept → `1/1`, history `✋ Tích tay · 11:57:46 6/6/2026 · B4DAMVANG · SL 1 · Chờ pick → Đã pick đủ · 📹 đối chiếu camera`; bỏ tích → không cờ camera. Reset sạch sau verify.

### [web2][render] Xóa hẳn 6 trang Web 2.0 (smart-match, supplier-aging, supplier-360, inventory-forecast, bulk-import, print-export) ✅

**Yêu cầu user:** Bỏ (xóa hẳn) 6 trang trên khỏi Web 2.0.

**Đã xóa:**

- **Frontend folders**: `web2/{smart-match,supplier-aging,supplier-360,inventory-forecast,bulk-import,print-export}/`
- **Shared orphan files** (chỉ 6 trang này dùng): `web2/shared/web2-aging.js`, `web2/shared/web2-bulk-import.css`
- **Backend routes** (`render.com/routes/v2/`): `supplier-aging.js` (F02), `smart-match.js` (F09), `inventory-forecast.js` (F11), `supplier-360.js` (F07) + unmount khỏi `server.js` (giữ lại `dashboard-kpi`, `cart`, `kpi`). Không drop DB table — chỉ gỡ API endpoint.

**Đã cập nhật refs:**

- `web2/shared/tpos-sidebar.js`: gỡ 6 menu entries + 6 path trong web2 page-set
- `web2/shared/web2-sse-topics.js`: gỡ topic `INVENTORY_FORECAST`
- `web2/users-permissions/index.html`: gỡ supplier-aging/supplier-360/inventory-forecast khỏi permission tree
- `web2/overview/index.html`: gỡ API list + realtime coverage table rows + sửa prose data-source cards (giữ "future development" roadmap cards như ý tưởng tương lai)
- `scripts/n2store-smoke-all-pages.js`, `scripts/web2-verify-data-load.js`: gỡ 6 trang khỏi test list

**Verify:** `node --check` pass cho server.js + 2 test scripts + sse-topics; grep full-repo confirm không còn live-code reference (chỉ còn 1 comment "port smart-match" trong `web2-ck-review.js` — logic độc lập, dùng `/api/web2/payment-signals`, giữ nguyên).

**Status:** ✅ Done

### [render][web2] Đối soát đóng gói — quét nhận ngay + tích tay + sửa "barcode không nhận / không lưu" ✅

**Vấn đề (user, trang `web2/reconcile/`):**

1. Phải bấm vào ô quét trước thì máy quét mới nhận.
2. Mấy SP quét barcode không nhận ("SP không có trong PBH").
3. Quét lẻ không lưu — chỉ lưu khi quét đủ hết SL cả đơn.
4. Muốn có ô tích tay (đánh dấu đã pick như đã quét).

**Root cause #2 + #3 (server `routes/reconcile.js`):** so sánh mã SP bằng `===` (phân biệt hoa/thường + khoảng trắng). Máy quét trả mã lệch hoa/thường so với `order_lines` → `lines.find` fail (#2). Tệ hơn: picked_qty lưu dưới **key = mã quét** ≠ **key = mã line** → `mapPbh` đọc lại = 0 (nhìn như "không lưu", #3).
**Fix:** thêm `normCode()` (trim + UPPERCASE) + `findLineByCode()`; mọi nơi đối chiếu/lưu/đọc picked dùng **canonical code của line** (scan, manual-pick, pack verify, mapPbh). Quét lẻ vẫn commit DB ngay từng lần (vốn đã đúng), giờ hiển thị đúng.

**Fix #1 (frontend `reconcile-app.js`):** router phím toàn cục (capture keydown trên `document`) — nếu không gõ vào ô input khác thì tự focus ô quét + **inject ký tự đầu** (không rớt char khi focus đang ở list/nơi khác). Click bất kỳ đâu trên hộp quét cũng focus. → quét nhận ngay không cần click.

**Fix #4:** ô tích tay (`.rc-manual-tick` checkbox) mỗi dòng SP — tích = pick đủ (qty), bỏ tích = 0, lưu NGAY qua `/manual-pick`. Ẩn khi PBH đã khoá (packed/shipped/delivered). Scan + manual-pick giờ gửi kèm `userName` (Web2UserInfo) cho audit.

**Bổ sung (user): "tích tay lưu lại lịch sử ngày giờ thời gian chi tiết"** → thêm section **Lịch sử đối soát** trong panel chi tiết. Server vốn đã log mọi mutation (`pbh_fulfillment_logs`, `created_at` + user) — giờ frontend fetch `GET /:number/logs` và render qua `Web2HistoryTimeline` (timestamp vi-VN có giây). Mỗi thao tác (quét / tích tay / reset / đóng gói / giao / trả về) hiện 1 dòng: nhãn VN + ngày giờ chi tiết + user + note (mã SP · SL · chuyển trạng thái). Refresh sau mỗi mutation + SSE. Nhãn action thêm vào `Web2HistoryTimeline.ACTION_LABEL` (scan/manual-pick/pack/ship/deliver/return-failed/reset-pick) + màu marker riêng.

**Files:** `render.com/routes/reconcile.js`, `web2/reconcile/js/reconcile-app.js`, `web2/reconcile/css/reconcile.css`, `web2/reconcile/index.html` (cache-bust `v=20260606nj2`).
**Verify (localhost + test PBH NJ-20260605-0001 / KH test):** JS mới load, ô quét auto-focus lúc load, router đưa phím về ô quét (list→scanner) + KHÔNG cướp focus khi gõ ô tìm kiếm, tích tay → `1/1` "Đã pick đủ", bỏ tích → `0/1` pending. Lịch sử: tích tay sinh entry `✋ Tích tay · 11:49:40 6/6/2026 · B4DAMVANG · SL 1 · Chờ pick → Đã pick đủ` (marker tím). Test PBH reset sạch sau verify. **Cần deploy Render** để fix server #2/#3 live (history + manual-pick logging vốn đã có trên server đang chạy).

### [tpos-pancake] Nút "Lấy thumbnail" không ăn — event delegation ✅

**Vấn đề (user):** Nút 📸 Lấy thumbnail bấm không phản ứng.

**Root cause (đo live):** `<button>.click()` không fire — listener gắn trực tiếp (`addEventListener`) trong `_renderThumbStripFor` **chết khi list comment re-render** (row bị replace liên tục lúc chọn campaign/enrichment → strip + listener mất).

**Fix** (`tpos-livestream-snap.js`): bỏ listener trực tiếp, dùng **event delegation** `_wireSnapDelegation()` — 1 listener capture-phase trên `document` bắt `.tpos-snap-extract-one-btn`, sống qua mọi re-render. Verify: click → `POST /api/livestream/extract-frame` fired. ✅

### [tpos-pancake] Preview livestream PiP đổi sang dọc 9:16 — hết đen 2 bên ✅

**Vấn đề (user):** iframe livestream đen 2 bên.

**Root cause:** PiP capture `tpos-snap-fb-wrapper` là 320×180 (ngang 16:9); FB live điện thoại dọc 9:16 → letterbox đen 2 bên.

**Fix** (`tpos-livestream-snap.js` `_ensureEmbeddedIframe`): đổi wrapper sang **dọc 9:16** (200×356). Capture crop theo `getBoundingClientRect()` (không hardcode aspect) nên tự khớp — frame capture cũng full, không bake viền đen. ✅

### [tpos-pancake] Cap render 200 + infinite scroll — hết giật hẳn (840ms→76ms) ✅

Tiếp theo entry dưới. User chọn hướng **cap render** (thay vì virtualize). Đã làm + đo verify trên page live (mô phỏng tick 4 campaign HOUSE/STORE 06+02/06):

**Kết quả:** long-task max **840ms → 76ms**; DOM bound **843 → 200 rows**; idle loop `/cart/batch/counts` = 0.

**Files:** `tpos-pancake/js/tpos/tpos-comment-list.js`, `tpos-pancake/js/tpos/tpos-init.js`

- **Cap render**: chỉ dựng `RENDER_LIMIT_INITIAL=200` comment MỚI NHẤT (comments sort newest-first → `slice(0, limit)`). `_visibleComments()` dùng ở full render + patch + dispatch. Mọi module phụ (inventory badge, livestream-snap thumbnail) cũng nhẹ theo vì DOM nhỏ.
- **Infinite scroll** (user yêu cầu, thay nút): `IntersectionObserver` trên sentinel cuối list (root = list, prefetch 400px) → cuộn gần đáy → `_appendOlderBatch()` append +200 comment cũ TRƯỚC sentinel, giữ scroll + dòng cũ, KHÔNG rebuild. Verify: 200→400→600 khi cuộn.
- **Scheduler = `setTimeout` (KHÔNG `requestIdleCallback`)**: phát hiện bug rIC bị **starve** khi load 4 campaign (main-thread bận liên tục) → render đứng ở 25 dòng nhiều giây. setTimeout luôn fire. Cap 200 nên mỗi chunk nhẹ.
- **Reset cap** khi `onMultiCampaignChange` (đổi tập comment).

**Status:** node --check OK; verify 200/200 rows ổn định, 0 console error, scroll append 200→400→600. ✅

### [tpos-pancake] Fix giật khi chọn nhiều campaign — render thông minh (chunked + sig-skip + debounce) 🔄

**Vấn đề (user):** Chọn 4 campaign → khung comment TPOS giật rất nhiều lần. Yêu cầu "test thực sự để hiểu nguyên nhân".

**Đo thực tế (instrument trên page live, mô phỏng tick 4 campaign HOUSE/STORE 06+02/06):**

|                                | Trước                     | Sau fix              |
| ------------------------------ | ------------------------- | -------------------- |
| full-render block 758 rows     | **19 lần, 400-647ms/lần** | 1-3 lần (chunked)    |
| long-task >50ms max            | **840ms**                 | **372ms**            |
| idle loop `/cart/batch/counts` | ~10/s không ngừng         | **0** (đã fix trước) |

**Root cause (đã xác định bằng số liệu):** Mỗi pass enrichment (loadSessionIndex/Partner/Debt/kho/native-orders) + mỗi tick checkbox campaign + mỗi comment realtime → gọi `renderComments()` → rebuild full `innerHTML` 758 rows (~500ms block main-thread). 4 campaign + enrichment = 19 lần → giật suốt 94s.

**Files:** `tpos-pancake/js/tpos/tpos-comment-list.js`, `tpos-pancake/js/tpos/tpos-init.js`

**Đã làm:**

- **Debounce campaign change** (`tpos:campaignsChanged` 500ms): tick 4 checkbox = 1 reload thay vì 4.
- **`renderComments()` coalesce 60ms** + **dispatch thông minh**: cấu trúc comment (id/thứ tự) không đổi → patch in-place; đổi → full render.
- **Per-row signature `data-sig`** (`_rowSig`): patch CHỈ rebuild dòng dữ liệu thực sự đổi, skip dòng không đổi.
- **Chunked qua `requestIdleCallback`** cho cả full render (`renderCommentsNow`, 25 rows/tick, append dần) lẫn patch (`_patchRowsChunked`) → không block main-thread.
- **Serialize**: full render đang chạy không bị enrichment cắt/restart (pending flag → patch sau khi xong).

**Còn lại (gốc rễ kiến trúc):** 843 dòng trong DOM (non-virtualized) → `insertAdjacentHTML` reflow O(n); inventory-panel (badge giỏ) + livestream-snap (thumbnail) cũng quét cả 843 dòng mỗi render → vẫn vài task 250-372ms. Để hết hẳn cần **virtualize** (chỉ render ~20 dòng visible) hoặc **cap render** (chỉ N comment mới nhất) — cần user quyết vì ảnh hưởng UX + module phụ.

**Status:** node --check OK; verify DOM 843/843 rows nhất quán (sig/SVG/phone input), không regression. 🔄 chờ quyết hướng virtualize.

### [web2] Audit history — rà soát toàn menu, vá gap frontend chưa gửi tên user ✅

Rà soát toàn bộ trang menu (2 Explore agent NCC + KH/PBH). Phát hiện backend đã ghi `performed_by` nhưng nhiều FRONTEND chưa gửi tên → ghi placeholder. Vá:

- **Ví KH** [web2-wallet-api.js](web2/customer-wallet/js/web2-wallet-api.js): deposit/withdraw gửi `userName` (Web2UserInfo). Hiển thị cột **"Người thực hiện"** trong lịch sử ví ([web2-customer-wallet-app.js](web2/customer-wallet/js/web2-customer-wallet-app.js) + [index.html](web2/customer-wallet/index.html), '(SePay tự động)' cho reference_type=sepay).
- **Smart Match** [smart-match/index.html](web2/smart-match/index.html): `verifiedBy` đổi từ hardcode 'smart-match' → tên staff + ' (smart-match)'.
- **Ví NCC** [supplier-wallet](web2/supplier-wallet/js/supplier-wallet-app.js): `confirmReturn`/`confirmPay` ghi `performedBy` (Web2UserInfo) vào transaction Firestore ([storage](web2/supplier-wallet/js/supplier-wallet-storage.js) lưu field). Hiển thị cột "Người thực hiện" trong lịch sử.
- Đã tốt sẵn (không sửa): manual-deposit modal (gửi userName), supplier-debt legacy (RowHistoryStore + currentUser), PBH trừ ví, purchase-refund.
- Chưa làm (không có money op): COD giao hàng (chưa implement), so-order rows (metadata Firestore).

→ Mọi money op staff giờ ghi đúng **tên người làm** (không còn placeholder '(staff)') + hiển thị được để kiểm tra.

### [tpos-pancake] Fix — chọn nhiều campaign "load liên tục" (infinite loop /cart/batch/counts) ✅

**Vấn đề (user):** Chọn 4 campaign → TPOS panel load liên tục không ngừng.

**Chẩn đoán (network log, không chụp hình):** `GET /api/v2/cart/batch/counts` gọi **~10 lần/giây không ngừng** (đo 80 calls / 8s qua session REPL).

**Root cause — feedback loop:** `inventory-panel.js` wire `MutationObserver` trên `#tposContent` (`childList:true, subtree:true`). Callback gọi `refreshCartCounts()` → `renderBadges()` **append/sửa badge `.inv-cart-badge` BÊN TRONG row** = childList mutation trong subtree → observer fire lại → refresh lại → **loop vô hạn**. Càng nhiều comment (729 rows khi chọn 4 campaign) mỗi vòng càng nặng. Cộng thêm `pollTimer` 2s cũng gọi `refreshCartCounts()` mãi.

**Files:** `tpos-pancake/js/pancake/inventory-panel.js`

**Đã sửa:**

- **Observer chỉ react khi danh sách comment THỰC SỰ đổi:** thêm `_mutationsTouchRows(mutations)` — chỉ trigger refresh khi added/removed node là `.tpos-conversation-item` (hoặc chứa nó). Mọi mutation do badge giỏ hàng gây ra → bỏ qua → **cắt loop**. Debounce 200→300ms.
- **`pollTimer` ngừng gọi `refreshCartCounts`:** poll 2s giờ CHỈ để chờ `#tposContent` xuất hiện rồi wire observer; wire xong → `clearInterval`. Refresh sau đó do observer (row đổi) + SSE (`web2:cart`/`web2:native-orders`) lo.

**Giữ nguyên:** SSE event-driven refresh (đã debounce đúng), optimistic badge update sau drop, drop-target wiring.

**Status:** node --check OK; loop đo được trước fix = 80 calls/8s → sau fix observer chỉ refresh khi list đổi (verify logic qua DOM mutation filter). ✅

### [tpos-pancake] Perf — render comment TPOS thông minh, hết lag ✅

**Vấn đề (user):** TPOS panel render SĐT/địa chỉ/đơn… lag quá; không cần data đơn TPOS legacy (id/mã đơn TPOS), chỉ cần comment/SĐT/địa chỉ/KH/trạng thái/thumbnail.

**Files:** `tpos-pancake/js/tpos/tpos-comment-list.js`

**Thủ phạm lag #1:** `renderComments()` rebuild full `innerHTML` rồi gọi `lucide.createIcons()` **quét toàn bộ DOM** mỗi lần — mỗi comment ~9 icon `data-lucide`, 100 comment = ~900 icon scan/render. (Cùng vấn đề `tpos-livestream-snap.js:2948` đã ghi chú.)

**Đã sửa:**

- **Inline SVG icons** (`tposSvgIcon()` + map `_TPOS_ICON_PATHS`) thay toàn bộ `<i data-lucide>` trong item → bỏ `lucide.createIcons()` ở `renderComments()` + `refreshCommentItem()`. Verify: item render 7 `<svg>`, **0** `data-lucide`.
- **Lazy status dropdown:** thay vì render 8 options ẩn × N item, chỉ build options khi user click badge (`toggleInlineStatusDropdown` lazy + `data-loaded`). Verify: 0→8 children khi click.
- **STT/badge đơn chỉ lấy theo native-orders** (`source==='NATIVE_WEB'`): bỏ badge mã đơn TPOS legacy (xanh), bỏ icon `package-check`, bỏ badge comment-count (📝 N). Gate `sessionInfoRaw?.source==='NATIVE_WEB' ? … : null`.
- **Avatar `loading="lazy" decoding="async"` + width/height** → smart load, tránh layout shift.

**Giữ:** comment, SĐT, địa chỉ, tên KH, trạng thái, badge đơn web (tím) + nút tạo/thêm comment vào đơn, debt badge.

**Status:** node --check OK; verify trên localhost (helper + renderCommentItem + lazy dropdown). ✅

### [render][web2] Audit history — đơn có tiền (PBH trừ ví + hoàn ví huỷ đơn) ghi performed_by ✅

Tiếp audit money ops: 2 chỗ đơn chạm ví chưa ghi ai làm.

- [fast-sale-orders.js](render.com/routes/fast-sale-orders.js) `_applyWalletToPbh` (tạo PBH → trừ ví thu hộ): thêm param `performedBy` → `processWithdraw`. Caller truyền `req.body._editor.userName` (fallback '(tạo PBH)').
- [native-orders.js](render.com/routes/native-orders.js) `_refundWalletForNativeOrder` (huỷ đơn → hoàn ví): thêm `performedBy` → `processDeposit`. Caller truyền `req.body.userName` (fallback '(huỷ đơn)').
- Đơn tạo đã có sẵn `created_by`/`created_by_name`. → Mọi money op của đơn giờ truy được ai làm (qua cột `web2_wallet_transactions.performed_by` đã thêm hôm trước).
- Regression test-wallet-audit 4/4.

### [web2] Chat read-only: scroll lên tải thêm tin cũ (infinite scroll) ✅

User: scroll tải thêm tin nhắn.

- `loadThread` lưu `_thread` state (pageId/convId/customerUuid/cursor/msgIds/hasMore/loadingOlder/custAv) + indicator "↑ Cuộn lên để xem tin cũ hơn" ở đỉnh.
- `_loadOlder`: scroll `#w2croBody` < 60px → `fetchMessages({currentCount: cursor})` → filter fresh (dedup msgIds) → prepend + **giữ scroll position** (`scrollTop += scrollHeight - oldH`). fresh=0 → hasMore=false, gỡ indicator.
- Helper `_renderBubbles` + `_msgTs` lên module scope (dùng chung loadThread/loadOlder). Reset `_thread` ở open/openSearch.
- Browser-tested (hội thoại 1651 tin): 25 → 55 → 85 bubble qua 2 lần scroll, vị trí xem giữ nguyên.
- **Files:** `web2/shared/web2-chat-readonly.js` (v=20260606b), `index.html`

### [web2] In tem: đẩy tem phải +1mm + Kho SP giữ vị trí khi tương tác ✅

1. **Tem bên phải sang phải 1 ít** [web2-products-print.js](web2/products/js/web2-products-print.js): mỗi cột sau cột đầu lệch phải `ci × 1mm` (2-up → cột phải +1mm) qua `padding-left=2×nudge` (border-box → center dịch = padding/2), cap theo slack `(cellW-labelW)/2` để không cắt mép. Verify guide tâm cột: tem trái trùng 16.5mm, tem phải lệch phải ~1mm khỏi 49.5mm. Cache-bust `?v=20260605j` (products + so-order).
2. **Kho SP không nhảy lên đầu khi tương tác** [web2-products.js](render.com/routes/web2-products.js) `/list`: `ORDER BY is_active DESC, updated_at DESC` → `... created_at DESC, code ASC`. Trước đây in tem/sửa/toggle/chỉnh tồn bump `updated_at` → SP nhảy lên đầu khi full reload (SSE mark-printed/stock → debouncedFullLoad). `created_at` cố định sau tạo → vị trí ổn định, chỉ SP MỚI tạo lên đầu. Index sẵn `idx_web2_products_created`. Frontend đã in-place update từ trước; fix backend làm cả full-reload cũng giữ vị trí.

### [render][web2] Audit history money ops — ví (performed_by) + refund (ai duyệt) ✅

User: mọi thao tác chạm tiền (duyệt/cộng ví/hoàn đơn) cần ghi ai làm — lúc nào để kiểm tra lại nếu sai sót.

**Ví (gap chính — thiếu user):**

- [web2-wallet-isolation.js](render.com/services/web2-wallet-isolation.js): ALTER idempotent thêm cột `performed_by TEXT` vào `web2_wallet_transactions` + `web2_wallet_adjustments` (SAU backfill để không vỡ `INSERT SELECT *`).
- [web2-wallet-service.js](render.com/services/web2-wallet-service.js): `processDeposit`/`processWithdraw` nhận thêm `performedBy` (cuối, default null) → INSERT cột `performed_by`.
- Wire staff ops: `linkTransaction` (verifiedBy), reassign (verifiedBy), manual deposit/withdraw ([v2/web2-wallets.js](render.com/routes/v2/web2-wallets.js) — userName từ body). SePay auto-credit để null (= hệ thống, đã truy qua sepay_id). Watcher = 'auto-watcher'.
- Hiển thị: [web2-customer-detail-modal.js](web2/balance-history/js/web2-customer-detail-modal.js) bảng lịch sử ví thêm cột **"Người thực hiện"** (fallback '(SePay tự động)' cho reference_type=sepay).

**Refund:**

- NCC ([purchase-refund.js](render.com/routes/purchase-refund.js)): ĐÃ có `data.history` + userName (frontend gửi sẵn) — không sửa.
- PBH/KH ([refunds.js](render.com/routes/refunds.js) có `state_history` + `by`): frontend [rf-app.js](web2/fastsaleorder-refund/rf-app.js) trước gửi body rỗng `{}` → `by=null`. Fix: gửi `{by: _by()}` (Web2UserInfo) cho duyệt/hoàn/hủy + hiện `by` trong history detail.

CK signals đã có history đầy đủ + timeline trong modal (làm trước). Test [test-wallet-audit.js](scripts/test-wallet-audit.js) 4/4 (processDeposit/Withdraw ghi performed_by, không truyền → null, DB lưu đúng).

### [supplier-debt] Fix gốc: hóa đơn mới tự chèn theo ngày + reset B24 bị xáo ✅

User hỏi "sao 03/05 lại nằm ở đó" (BILL/2026/1664 kẹt gần cuối bảng B24). Đọc `RowOrderStore` → B24 có thứ tự kéo tay 33 dòng, 1664 ở vị trí 31/33 — thứ tự bị **xáo trộn** (rác tích lũy), không phải human-arranged.

**Nguyên nhân gốc:** `applyCustomRowOrder` cũ dồn hóa đơn mới (chưa có trong thứ tự lưu) xuống **cuối bảng** → lần kéo kế tiếp drop handler lưu lại toàn bộ DOM order → **đóng băng vị trí cuối** đó vào thứ tự. Lặp lại (đổi page size, HĐ mới về, kéo lại) → xáo trộn.

**Sửa (A — gốc, cho MỌI NCC):** `applyCustomRowOrder` ([main.js](supplier-debt/js/main.js)) giờ **chèn dòng unknown theo NGÀY** vào đúng vị trí chronological (trước dòng đầu tiên có ngày mới hơn) thay vì dồn cuối. Thứ tự `known` (kéo cố ý) giữ nguyên → không phá ý đồ drag, nhưng HĐ mới về đúng chỗ. Thêm helper `congNoRowTime(row)` (web date > TPOS date).

**Sửa (B — reset B24 ngay):** chạy `RowOrderStore.delete('B24')` + log `reset_order` qua page đã auth (ghi thẳng Firestore prod, same client path như nút Khôi phục). Verify: order 33 → 0, B24 về sort theo ngày (03/05 lên đầu).

**Sửa (C — kiểm + dọn TẤT CẢ, theo yêu cầu "fix tất cả"):** phân tích 6 thứ tự kéo tay còn lại bằng đúng logic ngày app (web date > TPOS) ở mức ngày → chỉ B24 xáo nặng (~4 tuần); B32/B21/B5 khớp ngày, B16/B45/B9 chỉ lệch 1 ngày do RBILL trả hàng (lành tính). User chọn clean slate → **reset cả 6** (B9/B32/B5/B16/B21/B45, mỗi cái log `reset_order`) + **xóa 3 key rác mồ côi** schema cũ (`B5_16/04/2026`, `B2_18/04/2026`, `B36_23/04/2026` — không bao giờ được `get()` đọc vì chỉ đọc `<code>__all`) qua `FieldPath('data', key)` + `FieldValue.delete()`. Verify sau reload: doc `supplier_debt_row_order` **trống hoàn toàn** → mọi NCC sort thuần theo ngày. 0 lỗi. (Thao tác data trên prod, không đổi code.)

- **Files:** `supplier-debt/js/main.js` (applyCustomRowOrder chèn theo ngày + `congNoRowTime`), `supplier-debt/index.html` (main.js v=20260606b)

### [supplier-debt] Lịch sử thay đổi bảng công nợ NCC (kéo vị trí + sửa ghi chú + xóa thanh toán + reset) ✅

User hỏi "bảng sắp xếp do cái gì?" → giải đáp: sort 2 lớp — (1) theo **ngày web/TPOS** (cũ→mới), (2) **thứ tự kéo tay** per-NCC đè lên (`RowOrderStore`, Firestore `supplier_debt_row_order`). Trước đây mỗi lần kéo chỉ ghi đè mảng thứ tự, KHÔNG lưu ai/khi nào/từ đâu→đâu.

Thêm **lịch sử chi tiết** ghi 4 loại hành động per-NCC, kèm người + thời gian:

- **Kéo đổi vị trí hàng**: log `{moveName, from #, to #}` (vị trí 1-based trong view).
- **Sửa/xóa ghi chú web**: log `{moveName, oldNote → newNote}` (chỉ khi thực sự đổi).
- **Xóa thanh toán**: log `{moveName, amount}` (chỉ khi xóa thành công — `deletePayment` giờ return bool).
- **Reset thứ tự về mặc định**: nút trong modal → `RowOrderStore.delete` + log + re-render.

Xem qua **nút "Lịch sử"** ở tab Công nợ → modal timeline NCC đang xem (icon màu theo loại, realtime cập nhật khi tab khác ghi).

- Lưu Firestore `supplier_debt_history/events` + localStorage cache + realtime listener (pattern giống `RowOrderStore` — trang legacy/Web 1.0 dùng Firestore, không SSE). Cap 50 sự kiện/NCC. User attribution qua `authManager.getUserInfo()`.
- Browser-tested (Playwright): store/handlers/modal đều wired, 4 loại event render đúng tiếng Việt + timestamp + user.
- **Files:** `supplier-debt/js/row-history.js` (mới), `supplier-debt/js/main.js` (expose `window.RowOrderStore`, toolbar nút Lịch sử, 4 điểm log, `deletePayment` return bool), `supplier-debt/index.html` (modal + script tag v=20260606a), `supplier-debt/css/styles.css` (timeline styles)

### [web2] Chat read-only: thread tin nhắn mới nhất xuống ĐÁY (sort asc + scroll bottom) ✅

User: nội dung tin nhắn bên phải → cho tin nhắn mới nhất xuống dưới cùng.

- `loadThread`: bỏ `.reverse()` sai (Pancake thực ra trả CŨ→MỚI sẵn → reverse làm mới nhất lên trên). Thay bằng **sort tăng dần theo `inserted_at||created_time||timestamp`** → tin mới nhất ở đáy, scroll xuống cuối. Robust dù Pancake đổi thứ tự.
- Browser-tested: top "13:40 05-06" (cũ), bottom "01:43 06-06" (mới), scrolledToBottom=true.
- **Files:** `web2/shared/web2-chat-readonly.js` (v=20260606a), `index.html`

## 2026-06-05

### [web2] Chat read-only: sort hội thoại mới nhất lên đầu (updated_at desc) ✅

User: đoạn hội thoại đẩy danh sách hội thoại mới nhất lên đầu.

- `doSearch` (web2-chat-readonly.js): sau khi merge kết quả mọi page, sort theo `_convTs(conv)` DESC trước render. `_convTs` = `updated_at || last_customer_interactive_at || last_message.inserted_at || inserted_at` (Date.parse).
- Browser-tested: top5 updated_at giảm dần (12:09:54 → 12:00:36), descending=true.
- **Files:** `web2/shared/web2-chat-readonly.js` (v=20260605b), `index.html`

### [web2] Fix in tem mã SP: tem bên phải canh giữa đúng tâm con tem (2-up) ✅

User: in 2 tem, tem bên phải chưa canh giữa, tem trái đúng. Root cause (verified qua repro TSPL raster `tsplFromHtmlPhysical`): `.barcode-sheet` dùng `justify-content:space-evenly` → 3 gap ĐỀU nhau dồn cả 2 tem về tâm sheet, lệch khỏi tâm cột die-cut (raster centroid: trái +30px, phải −16px so target cột). Tem phải lệch vào trong = "chưa canh giữa".

- **Fix** [web2-products-print.js](web2/products/js/web2-products-print.js): mỗi tem bọc trong `.barcode-cell` rộng `sheetW/cols` (33mm cho 2-up 66mm) + `justify-content:center` → tem canh GIỮA trong cột vật lý. Sheet `space-evenly` → `flex-start` (cells xếp trái→phải không gap). Bỏ logic `singleGap`/`isPartial` (cột giữ thứ tự nên tem lẻ tự nằm đúng cột 1).
- **Verify**: sau fix raster centroid trái/phải = +11/+11 (đối xứng, lệch đồng nhất <0.7mm thay vì lệch ngược chiều). Visual guide tâm cột 16.5/49.5mm: 2 tem trùng tâm. Screenshot `downloads/n2store-session/label-fix-verify.png`.
- Cache-bust `?v=20260605i` ([products](web2/products/index.html), [so-order](so-order/index.html) — 2 consumer của module).

### [render][web2] 5 tính năng tương tác khách: auto-reply + watcher + intent + dashboard ✅

User chọn "tất cả" 5 ý tưởng phát triển. Quyết định: auto-reply chỉ khi cộng ví; watcher tự link khi chắc / báo khi không; intent chỉ FLAG.

- **D1 Auto-reply + báo số dư**: export `sendSingleMessage()` [web2-msg-send-worker.js](render.com/services/web2-msg-send-worker.js) (PAT + `_sendPancake`, best-effort). `linkTransaction` trả thêm `balance`. Approve endpoint: sau cộng ví + `notifyCustomer!==false` → gửi "Shop đã nhận CK + số dư ví X₫" (fire-and-forget, history `notify`). Checkbox "Gửi tin báo cho khách" trong [web2-ck-review.js](web2/shared/web2-ck-review.js).
- **D2 Watcher "chờ tiền về"** [web2-ck-watcher.js](render.com/services/web2-ck-watcher.js): hook `_processWeb2Path` ([sepay-webhook-core.js](render.com/routes/sepay-webhook-core.js)) sau `processWeb2Match`. GD SePay mới khớp signal confirmed chưa-có-GD (72h): **SĐT trong nội dung HOẶC đúng tiền ≤24h** → `linkTransaction` (cộng ví, idempotent chống cộng 2 lần) + `matched_tx_id` + auto-reply; **không chắc** → notification staff. Wire deps qua `initWeb2CkWatcher` (server.js).
- **D3 Intent FLAG** [detector](render.com/services/web2-payment-signal-detector.js): `detectIntent()` (cancel_order/change_address/check_shipping/view_order) + `handleIntent()` → `web2_customer_intents` + notification (`createNotification` export [v2/notifications.js](render.com/routes/v2/notifications.js)) + SSE `web2:customer-intents`. KHÔNG auto-execute. Route [web2-customer-intents.js](render.com/routes/web2-customer-intents.js) (GET/stats/done). Hook server.js `pages:new_message`.
- **D4 Dashboard** [web2/ck-dashboard/](web2/ck-dashboard/index.html): 3 cột (chờ duyệt / đã duyệt chờ tiền về [GET `?noTx=1`] / yêu cầu khác KH) + aging badge + click → openReview/done + SSE. Sidebar "Đối soát CK".
- **Test** [scripts/test-ck-features.js](scripts/test-ck-features.js) 10/10 (intent 6 cases + dedup + watcher SĐT-khớp auto-link+cộng ví+auto-reply, đúng-tiền-không-SĐT notify, no-match no-op) + payment-signals 14/14 + ck-review 11/11 regression + dashboard frontend smoke.
- **An toàn**: gửi tin/cộng tiền best-effort catch (không vỡ webhook/approve); intent flag-only; watcher chống double-credit.

### [native-orders] Fix: bill In bill thiếu phí ship (hardcode 0) ✅

User: bill in ra chưa có phí ship. Root cause: `bulkPrintBills` dựng PBH-shape với `delivery.price = 0` + `totals.total = subtotal` (bỏ ship) → bill luôn "Phí ship 0". (PBH thật trong DB ĐÚNG — `computeTotals` cộng ship; verified PBH NJ-20260605-0001: delivery.price=20000, total=460000.)

- Fix: `shipPriceOf(o)` tra giá theo `o.deliveryMethod` trong `DeliveryMethodPicker.getOptionsAsync()` (option.value khớp), fallback parse "(20k)" trong label. PBH SHOP/bán tại shop → 0. `buildPbhShape`: `delivery.price=ship`, `totals.total=subtotal+ship`, `payment.residual=subtotal+ship` (COD = SP + ship).
- Verified Playwright: bill ship 20.000, Tạm tính 440k, TỔNG TIỀN 460k, COD 460k.
- File: `native-orders-app.js` (v=20260605ship).

### [render][web2] Đối chiếu & duyệt CK xuyên 3 trang — component dùng chung ✅

User: đưa xét duyệt tín hiệu CK vào balance-history + native-orders + tpos-pancake; duyệt linh hoạt (có GD SePay khớp → cộng ví; không → chờ tiền về); 1 nguồn dùng chung; lưu khách vào balance-history + payment-confirm.

**Backend:**

- [web2-balance-history.js](render.com/routes/v2/web2-balance-history.js): tách export `linkTransaction(db,{id,phone,name,verifiedBy})` (gán SĐT/tên + cộng ví atomic, idempotent) — PATCH `/:id/link` gọi lại helper (không đổi hành vi). **1 nguồn logic cộng ví**.
- [web2-payment-signals.js](render.com/routes/web2-payment-signals.js): GET `/` thêm `offset` + `meta.hasMore` (tải thêm 10). `GET /:id` (1 signal enrich). `POST /:id/approve {phone,name,txId?,userId,userName}` — **duyệt linh hoạt**: có `txId` → `linkTransaction` (cộng ví) + set `matched_tx_id`; không → chỉ confirm + lưu phone/name. confirm + history `approve` + SSE `web2:payment-signals` (+ `web2:balance-history` nếu link). Money op.
- [detector](render.com/services/web2-payment-signal-detector.js): ALTER idempotent `matched_tx_id`/`matched_tx_at`. [native-orders.js](render.com/routes/native-orders.js): ckSignal thêm `id`+`phone`.

**Component dùng chung** [web2/shared/web2-ck-review.js](web2/shared/web2-ck-review.js) (`Web2CkReview`): `openSignalList()` (list 10 tín hiệu pending + tải thêm) + `openReview({signal|signalId,phone,name,onDone})` (đối chiếu GD SePay 10+tải thêm, **highlight GD khớp** port smart-match score amount/phone/name/time, chọn GD + input SĐT/tên + nút Duyệt loading/Bỏ qua). Self-inject CSS, SSE refresh, Web2UserInfo cho attribution.

**Gắn 3 trang (mỗi trang vài dòng):** balance-history nút "Xét duyệt CK (N)" + badge count → openSignalList; native-orders badge `💸` clickable → openReview prefill từ đơn; tpos-pancake nút topbar → openSignalList.

**Test** [scripts/test-ck-review.js](scripts/test-ck-review.js) 11/11 (linkTransaction cộng ví 250k + idempotent re-link chống cộng 2 lần, approve có/không txId, matched_tx_id, offset pagination không trùng) + payment-signals 14/14 regression + frontend smoke (modal/list/review/score-highlight/prefill, no error).

### [render][web2] Payment signals — lịch sử thao tác + tên user xác nhận ✅

User: khi xác nhận lưu lại lịch sử cùng tên user xác nhận.

- **Detector** [web2-payment-signal-detector.js](render.com/services/web2-payment-signal-detector.js): thêm cột `history JSONB` (ALTER idempotent cho bảng đã tồn tại trên prod) + seed `history[0]={action:'detect', userName:'(hệ thống tự nhận)', note:keyword}` lúc INSERT.
- **Route** [web2-payment-signals.js](render.com/routes/web2-payment-signals.js): helper `_appendHistory(pool,id,{action,userId,userName,note})` (append vào JSONB qua `history || $::jsonb`) + `_user(req)` đọc userId/userName từ body. confirm/dismiss/link append entry. `confirmed_by` = userName. mapSignal trả `history`.
- **Frontend** [payment-confirm-app.js](web2/payment-confirm/js/payment-confirm-app.js): `userBody()` gửi userId/userName qua `Web2UserInfo.attachToBody` (thay `by:name` cũ). `historyHtml(sig)` render `<details>Lịch sử</details>` dùng `Web2HistoryTimeline.render` (fallback list). Badge confirmed hiện "✅ Đã xác nhận · {tên}". Load `web2-history-timeline.js`.
- History shape khớp convention web2 (`{ts,action,userId,userName,note}` — như web2-generic 78 entity). Action VI: detect/confirm/dismiss/link.
- Test [test-payment-signals.js](scripts/test-payment-signals.js) 14/14 (+ seed detect + append confirm lưu tên user) + frontend smoke (Web2HistoryTimeline/UserInfo load, no error).

### [fast-sale-orders] Lưu channel vào PBH → bill in từ trang PBH cũng ghi "PBH INBOX" ✅

Tiếp nối bill INBOX: trước chỉ "In bill từ native-orders" có channel. Giờ lưu channel vào `fast_sale_orders` để bill in từ trang PBH (fastsaleorder-invoice) cũng đúng.

- `fast_sale_orders` thêm cột `channel VARCHAR(30)` (ensureTables). `from-native-order` INSERT copy `src.channel` ($45). `mapRow` expose `channel`. **Backfill** PBH cũ: `UPDATE fast_sale_orders SET channel = native_orders.channel WHERE source_code match AND channel IS NULL` (idempotent).
- Frontend KHÔNG đổi: `pbh-app.js bulkPrint` fetch `GET /:number` (mapRow có channel) → `Web2Bill.openPrint` → bill-service đọc `pbh.channel` → "PBH INBOX".
- **Deploy + verify**: Render auto-deploy ~2.5 phút. Curl `GET /api/fast-sale-orders/NJ-20260605-0001` → `channel='web2_inbox'` ✅ (backfill chạy đúng).
- File: `render.com/routes/fast-sale-orders.js`.

### [web2] Balance-history: bỏ badge nổi "Cần chọn KH" → nút "⚠ Trùng SĐT" trên row ✅

User: bỏ badge nổi (hình 2) → cho vào ô KH (hình 3) ghi "Trùng SĐT".

- **Bỏ badge nổi** `web2PendingBadge` ("Cần chọn KH (Web 2.0): N", fixed top-right): `ensureBadge` giờ tạo element detached (KHÔNG append DOM) → không hiện. `updateBadge` vẫn no-op an toàn.
- **Nút "⚠ Trùng SĐT"** trên mỗi row `match_method='pending_match'` (thay "+ Gán KH", bỏ pill "Chờ chọn KH"): `data-action="dup-phone"` + `data-sepay` → `Web2PendingMatch.openModal(sepay_id)` mở modal **lọc đúng GD đó** (seed search = sepay_id).
- `openModal(seedSearch?)`: set sẵn `_searchQuery` + ô tìm.
- Browser-tested: badge gone (badgeInDom=false), 2 nút Trùng SĐT (sepay 61925057), click → modal 1 item đúng GD.
- **Files:** `web2/balance-history/js/web2-balance-history-app.js` + `web2-pending-match.js` + `css/web2-balance-history.css` (v=20260605d), `index.html`

### [web2 bill] Đơn kênh INBOX → tiêu đề "PBH INBOX" / "PBH SHOP INBOX" ✅

User: đơn Inbox → PBH/PBH SHOP thì bill ghi "PBH INBOX" / "PBH SHOP INBOX" (phân biệt Livestream).

- `web2-bill-service.js generateHTML`: `isInbox = /inbox/i.test(pbh.channel)` (channel='web2_inbox'/'web2_livestream') | `opts.isInbox` → `_buildBillBody`.
- Title: shop→"PBH SHOP"; thường→"Phiếu Bán Hàng" (live) / "PBH" (inbox); +" INBOX" nếu inbox → 4 combo: `Phiếu Bán Hàng` / `PBH SHOP` / `PBH INBOX` / `PBH SHOP INBOX`.
- `bulkPrintBills` buildPbhShape thêm `channel: o.channel`. Verified Playwright 4 combo đúng.
- Files: `web2-bill-service.js` (v=20260605u2), `native-orders-app.js` (v=20260605x4).

### [render][web2] Unread reconcile — fix row "chưa đọc" kẹt sau khi đã đọc trên Pancake ✅

User: đọc tin Nguyễn Tâm trên Pancake nhưng tab "Tin nhắn chưa đọc" vẫn còn.

Root cause: WS event ephemeral. Đọc trên Pancake lúc server restart (deploy 15:49, tin 15:40) → event "đã đọc" (unread=0) bị MISS, Pancake không replay → row kẹt vĩnh viễn (thuần socket không recover). Verify: `/api/web2/unread` thật sự còn row Nguyễn Tâm trong DB.

Fix — lưới an toàn reconcile [web2-unread-reconcile.js](render.com/services/web2-unread-reconcile.js): định kỳ (boot 60s + mỗi 2') hỏi Pancake conversations THẬT (qua page_access_token `pancake_page_access_tokens` chatDb) → **replay `syncFromConversation`** trên truth Pancake:

- conv unread=0 / shop gửi cuối → tracker xoá (đã đọc/đã xử lý)
- conv còn unread của khách → tracker upsert (bắt cả event ADD bị miss)
- Field names verify khớp inbox-data.js: `unread_count`, `last_sent_by.id !== page_id`, conv `id`="{page}\_{psid}", psid ưu tiên `customers[0].fb_id`.

[server.js](render.com/server.js): `setTimeout 60s` (dọn row kẹt sau mỗi deploy) + `setInterval 2'`. Route [web2-unread.js](render.com/routes/web2-unread.js): thêm `POST /reconcile` (trigger thủ công dọn ngay). Reconcile chỉ ĐỌC PAT (Pancake infra chung như socket), GHI web2Db.

→ Đọc trên Pancake → chậm nhất 2' row tự biến mất, **kể cả sau restart**. Test [test-web2-unread-reconcile.js](scripts/test-web2-unread-reconcile.js) 9/9 (giữ unread / xoá đã-đọc / xoá shop-trả-lời / thêm ADD bị miss) + regression unread 12/12 + paysig 12/12.

### [web2 pancake] Auto-login refresh token Pancake — harvester + server-side request flow ✅

User: gia hạn token hàng loạt cho account hết hạn. Mở browser test login, đọc request, build auto.

- **Bắt login flow** (`scripts/pancake-login-capture.js`, headed, password REDACT): Pancake = OAuth "Pancake ID". Form `input[name=identity]`+`[name=password]` → POST `account.pancake.vn/page/login` → POST `oauth2/approve` (`approve=true`) → redirect `pancake.vn/.../pancake_id_login_success` → set cookie `jwt`. **Không có JSON login API** (đều 404). 2FA "bảo mật 2 lớp" có toggle ở `account.pancake.vn/profile` (mặc định TẮT). Login id/password **KHÔNG trigger OTP** (test thực tế OK).
- **Harvester browser** (`scripts/pancake-token-harvester.js`): Playwright lái form login từng account → lấy `jwt` → upsert `/api/pancake-accounts/sync`. ⚠ Ant Design controlled input → phải `pressSequentially` (fill() để rỗng → "Email không được để trống"). Creds đọc từ `pancake-creds.local.txt` (GITIGNORED), không echo password/token.
- **Server-side request flow** (proven, KHÔNG cần browser): 3 request thuần — GET authorize (parse `_csrf_token`/`device_info`/`_query_string`, HTML-decode) → POST login → POST approve(`approve=true`) → jwt cookie. Test thật 1 account (Kỹ Thuật NJD): token mới exp 2026-09-03, upsert DB OK (was 2026-08-09). → port được sang Render endpoint cho web gọi "bằng request".
- **Full auto LIVE** (user chọn: lưu creds mã hoá + cron): `services/web2-pancake-creds.js` (AES-256-GCM, key env `PANCAKE_CREDS_KEY` đã set Render). Route `routes/web2-pancake-refresh.js` mount `/api/web2/pancake-refresh`: GET `/status`, PUT/DELETE `/:id/credentials`, POST `/:id` (gia hạn ngay), cron `startCron` quét account `auto_refresh` ≤5 ngày HSD mỗi 6h. Bảng `pancake_accounts` +5 cột. Proxy qua CF Worker WEB2_GENERIC → Render.
- **Frontend**: card thêm nút **Gia hạn** + **🔒 Mật khẩu** (modal lưu identity+password + toggle tự động) + pill "🔄 Tự động". `web2-pancake-accounts.js` thêm getRefreshStatus/saveCreds/deleteCreds/refreshNow.
- **Verified LIVE**: deploy live, `/status` credsKey=true, PUT creds 200, POST refresh 200 (server login → token mới). Push 3 account từ creds file (Thu Huyền+Huyền Nhi hết hạn → 89 ngày).

### [orders][kpi] REVERT "ghi rõ TẤT CẢ món hoàn" — chỉ hiện món hoàn CÓ tính KPI (đỡ rối)

User: món chưa tick KPI vốn đã bị loại không tính → đơn hoàn về đúng món đó thì bỏ qua luôn, không cần hiển thị cho rối. Đảo lại enhancement trước (`af3db0719`) vì liệt kê món hoàn không-tính-KPI gây rối.

**Action**: `git checkout 938a3df0d -- tab-kpi-commission.{js,css}` (khôi phục bản trước commit "ghi rõ"). Bỏ `allRefundedProducts` + name-capture refund excel + badge xám "0đ" + listing món non-counted. Cache-bust HTML `refund2→refund3` để browser tải bản khôi phục.

**Giữ nguyên** (không đụng): core fix `_matchRefundForOrder` skip `excludedBySaleFlag` (chỉ trừ món được tính KPI), tách "có hoàn" khỏi "bị loại KPI" (Q1 — đơn 0-KPI vẫn có badge "↩ Có hoàn · 0đ" + banner note 1 dòng, KHÔNG liệt kê món).

**Kết quả**: banner đơn hoàn chỉ liệt kê **món CÓ tính KPI bị hoàn** (→ −KPI + Gross/Hoàn/Thực). Đơn chỉ hoàn món không-tính-KPI → banner gọn 1 dòng "không trừ KPI", không list món. Cột "Hoàn" chỉ badge món tính KPI. `node --check` OK. **Status**: DONE.

### [orders][kpi] Banner đơn hoàn: GHI RÕ từng món hoàn (mã + tên + lý do) để dễ so sánh

User: đơn hoàn 0-KPI (`260502595`) banner chỉ ghi chung "các món hoàn không tính KPI" — không biết món NÀO hoàn. Cần ghi rõ món hoàn.

**Fix** (tiếp theo refund-aware, `orders-report/js/tab-kpi-commission.js`):

- `_parseRefundChiTiet`: bắt thêm **tên món** (group3 sau `]`) → `{code, qty, name}`.
- `fetchRefundDetailByInvoice`: value map đổi `qty` → `{qty, name}` (giữ tên món hoàn).
- `_matchRefundForOrder`: duyệt **TẤT CẢ** món hoàn của phiếu (không chỉ món match KPI) → thêm `allRefundedProducts[]` (mỗi món: code, name, qty, kpiLost, `counted`, `reason`). Vẫn chỉ TRỪ KPI món được tính (counted). Tên fallback: details → refund excel → code.
- 2 `reconcileOne` lưu `allRefundedProducts`. Banner `_renderOrderRefundBanner` + cột "Hoàn" + `_getRefundedProductMap` dùng `allRefundedProducts`: liệt kê từng món hoàn (counted → `−KPI`, không tính → `· lý do`). Badge cột Hoàn xám `0đ` cho món không tính.
- Cache `v3→v4` (thêm field), cache-bust `?v=20260605refund2`.

**Verify**: unit test 14/14 (case 260502595: món hoàn không thuộc SP KPI → loss 0 nhưng liệt kê đủ code+tên+lý do; mixed counted/excluded; partial; tên fallback). `node --check` OK. **Status**: DONE (logic verified, live chờ user chạy đối soát lại).

### [render][web2] Detect "KH báo đã CK" trên CẢ update_conversation (fix bỏ sót) ✅

User test localhost: tab "Tin nhắn chưa đọc" detect "đã ck" (highlight) nhưng tab "KH báo đã CK" = 0 (detector không bắt).

Nguyên nhân: detector chỉ chạy trên `pages:new_message` — event này đôi khi không fire / khác field → bỏ sót. Tab unread hoạt động vì dùng snippet từ `pages:update_conversation` (event tin cậy, luôn fire).

Fix [server.js](render.com/server.js): chạy `web2SignalDetector.handleIncoming` **cả trên `pages:update_conversation`** (dùng `updateData.snippet`, chỉ khi `!shopSentLast` = tin cuối của KHÁCH) → cùng nguồn dữ liệu như tab unread → detect tin cậy ngang nhau. Giữ nhánh `new_message` (dedup chống trùng).

[web2-payment-signal-detector.js](render.com/services/web2-payment-signal-detector.js): vì `update_conversation` re-fire nhiều lần cùng snippet (shop đọc/đổi hội thoại), đổi dedup `_hasRecentPending` → `_hasRecentSignal` (**BẤT KỲ status**, window 10' → **6h**) để signal đã dismiss/confirm KHÔNG bị tạo lại mỗi lần re-fire. Test [test-payment-signals.js](scripts/test-payment-signals.js) 12/12 (+ case "không tái tạo sau dismiss").

### [native-orders][web2-products][render] Print count (Phase 2) — ghi số lần in tránh in trùng ✅

User: in bill → ghi số lần in vào đơn; in mã SP → ghi số lần in vào product. Mục đích: tránh in trùng gây soạn/chuẩn bị hàng lặp.

- **Backend**: `POST /api/native-orders/mark-printed` {codes} + `POST /api/web2-products/mark-printed` {codes} → `UPDATE … print_count = print_count+1 WHERE code = ANY($codes)` → trả `counts`. `web2_products` thêm cột `print_count` (migration trong ensureTables) — `native_orders.print_count` đã có sẵn. mapRow expose `printCount`.
- **Frontend native-orders**: `NativeOrdersApi.markPrinted/markProductsPrinted`. `bulkPrintBills` gọi `markPrinted(others)` sau in bill PBH + packing slip `onPrint` callback gọi `markPrinted([code])` khi in Phiếu Soạn Hàng. Badge `🖨 Đã in N×` (vàng) trên row đơn.
- **Frontend products**: `web2-products-print.js generateAndPrint` → `_markProductsPrinted(items)` POST khi in tem. Badge `In: N×` cạnh badge Tồn trên list SP.
- **⚠ CẦN DEPLOY RENDER**: endpoint mới + migration `web2_products.print_count`. Verified endpoint hiện 404 (chưa deploy). Sau deploy → mark-printed hoạt động + badge hiện.
- Files: `native-orders.js`, `web2-products.js` (routes); `native-orders-api.js` (x2), `native-orders-app.js` (x2), `native-orders-packing-slip.js` (e), `web2-products-print.js` (h), `web2-products-app.js` (x2).

### [native-orders][render] Đơn Inbox: avatar + hội thoại theo SĐT + rename channel `web2_inbox`/`web2_livestream` ✅

**1. Avatar + mở hội thoại theo SĐT khi đơn inbox chưa có fb_id** (logic RIÊNG tab Inbox — KHÔNG đụng đơn livestream):

- Helper `_resolveInboxConvByPhone(phone)`: search hội thoại Pancake theo SĐT qua tất cả page (`Web2Chat.searchConversations`), khớp SĐT chính xác → `{fbId, pageId, avatarUrl, conversationId}`. Cache theo phone (xoá khi miss để retry).
- `_hydrateInboxAvatars()` (chạy nền sau render, chỉ tab `web2_inbox`): row có SĐT nhưng chưa fb_id → resolve → gắn `<img>` avatar + lưu fbUserId/fbPageId vào order in-memory (mở chat instant).
- `_loadAndRenderThread` nhánh unbound: thử resolve theo SĐT → thấy thì bind psid+page + load thread thật; không thấy → prompt chọn hội thoại sidebar. Gate `!order.fbPageId` → đơn livestream không vào. **Verify Playwright**: row `0123456788` → psid `25717004554573583` (page 270136663390370), avatar `<img>` hiện, 0 error.

**2. Rename channel `'inbox'`→`'web2_inbox'`, `'livestream'`→`'web2_livestream'`** (tên trần dễ nhầm Pancake filterType `'inbox'` + icon lucide `inbox` + field product-line `source` `'livestream'`):

- Backend [native-orders.js](render.com/routes/native-orders.js): migration idempotent `ensureTables` (`ALTER COLUMN channel SET DEFAULT 'web2_livestream'` + 2 UPDATE rename + NULL→web2_livestream); INSERT create-manual `'web2_inbox'`; campaign_stt subquery; mapRowToOrder fallback. **Load filter backward-compat** (`channel IN ('web2_inbox','inbox')`, web2_livestream ôm `'livestream'`+NULL) → deploy frontend↔backend không cần đúng thứ tự.
- Frontend [native-orders-app.js](native-orders/js/native-orders-app.js) + [index.html](native-orders/index.html): `data-channel`, `STATE.channel` default, 3 check `=== 'web2_inbox'`. **Giữ nguyên** product-line `source==='livestream'` + icon lucide `inbox`.
- **Convention** (prefix `web2_` cho enum/string định danh CHỈ KHI dễ nhầm — không prefix tất cả): [CLAUDE.md](CLAUDE.md) §Quy tắc 2b, [web2/overview #conventions](web2/overview/index.html) card Đặt tên, MEMORY `feedback_web2_enum_naming`.

⚠ **Cần deploy Render**: channel rename + accent local-match + fb binding là backend; frontend gửi `web2_*` chỉ khớp sau deploy (đã backward-compat nên an toàn thứ tự).

### [orders][kpi] Refund: chỉ trừ KPI món ĐƯỢC TÍNH + hiển thị rõ món tính/món hoàn (modal refund-aware)

**Bug** (user phát hiện ở đơn hoàn `260501589` / NJD/2026/67538): mở "Chi tiết đơn hàng" của đơn "↩ Đã hoàn" → mất hết KPI đã tính, hiện "NET = 0"; không ghi rõ món nào tính/món nào hoàn; nghi hoàn 1 món bị "trừ nguyên đơn".

**Root cause**: `calculateNetKPI` set `data.net` (NET thực) cho **MỌI** món kể cả món **chưa sale-tick** (`excludedBySaleFlag`), nhưng `order.kpi` chỉ cộng món được tick. `_matchRefundForOrder` trừ KPI hoàn theo `d.net > 0` **không check `excludedBySaleFlag`** + dùng hằng cứng → hoàn 1 món **chưa từng được tính KPI** vẫn sinh loss, cap `Math.min(loss, order.kpi)` khiến loss "ảo" **ăn KPI món khác** cùng đơn (= trừ nhầm). Modal 2 tab So sánh KPI/Audit Log mù refund.

**Fix** (chỉ frontend `orders-report/`, KHÔNG đụng `kpi-manager.js`):

- **A** `_matchRefundForOrder`: `if (d?.excludedBySaleFlag === true) continue;` + dùng `d.unitKPI` + thêm `kpiLost` mỗi món → loss = Σ(món được-tính-KPI & hoàn). 1 hàm dùng chung 2 flow recon.
- **A2** Tách "**có hoàn**" (`isRefunded = hasRefundRow || refLoss>0`) khỏi "**bị loại KPI**" (`refLoss>0`): đơn hoàn mà món hoàn không tính KPI → vẫn hiện "↩ Có hoàn · 0đ" (xám), KHÔNG trừ. Sửa 2 `reconcileOne` + 4 site cộng dồn (đếm vs loss) + pill/row L1 + recon tab + Excel.
- **B** Modal refund-aware: **banner** đầu modal (món hoàn + Gross/Hoàn/Thực, hoặc "không trừ KPI"), **cột "Hoàn"** + footer KPI thực trong tab So sánh KPI, empty-state thông minh ("X món chưa tick" thay vì "NET=0"), Audit Log footer thêm dòng "Món chưa tick". Helper `_getRefundedProductMap` + `_renderOrderRefundBanner`.
- **C** Bump cache recon `_L1_RECON_CACHE_PREFIX v2→v3` (bỏ cache lỗi, tự recon lại). Cache-bust HTML `?v=20260605refund`.

**Files**: `orders-report/js/tab-kpi-commission.js`, `orders-report/tab-kpi-commission.html`, `orders-report/css/tab-kpi-commission.css`.

**Verify**: unit test logic core `_matchRefundForOrder` 12/12 pass (món excluded→loss 0 nhưng vẫn có hoàn; MIX chỉ trừ món tick; partial cap; value-mode unitKPI; legacy no-op). `node --check` OK. UI banner/badge cần user chạy "Chạy đối soát" trên data thật (recon cần TPOS) để xác nhận live. **Status**: DONE (logic verified, live UI chờ user confirm).

### [orders][kpi] Fix: Lịch sử kiểm tra mất dấu ✓ + Số phiếu "—" (key drift) & sửa text "share" sai ✅

**Bối cảnh** (user hỏi): (1) "Lịch sử kiểm tra" có share dữ liệu với Thống Kê Giao Hàng / trang khác không? (2) Vì sao một số entry không có Số phiếu ("—"), và đúng các đơn đó lại không có dấu ✓ ở cột STT đơn của Chi tiết KPI?

**Điều tra** (workflow 5 agent + 1 phản biện): KPI check store **RIÊNG hoàn toàn** — Firestore `kpi_commission/data/order_checks` (payload `source:'kpi-commission'`), KHÁC `delivery_report/data/order_checks` của delivery-report (`drOrderChecks_v1` + `source:'delivery-report'`). Quét toàn repo (frontend + Render + Worker + Firebase Functions + 2 SSE hub + scripts): **0 cross-write/sync**. Banner UI "share với Thống Kê Giao Hàng" là **text cũ bị bỏ sót**: feature ban đầu dùng chung (`3eb00a27c`), tách 7 phút sau (`c3afd14c7` "tách Firestore check store khỏi delivery-report") nhưng quên sửa 3 chuỗi text.

**Bug ✓/"—"** (key drift): lúc đánh dấu, `checkKey = number || orderCode` → đơn CHƯA có số phiếu thì key = Mã ĐH, `number=''`. Khi render Chi tiết KPI lại `isChecked(invNumber)` (chỉ theo số phiếu) → sau khi đối soát gán số phiếu, lookup theo số phiếu không khớp record key=Mã ĐH → mất ✓; Lịch sử kiểm tra hiện `entry.number=''` → "—".

**Fix** (chỉ frontend, không đụng endpoint/KPI API — tuân thủ `feedback_api_scope`):

- `renderEmployeeOrdersTable` + `_applyL1CheckedStyles`: **dual-key lookup** `isChecked(số phiếu) || isChecked(Mã ĐH)` → ✓ hiện lại đúng.
- Thêm `_orderCheckStore.backfillNumber(checkKey, number)`: khi đơn đã có số phiếu, ghi bổ sung field `number` (merge, idempotent, guard `_backfilled` Set) vào record cũ → Lịch sử kiểm tra hết "—".
- Sửa 3 text sai → "lưu RIÊNG cho KPI, KHÔNG chia sẻ với Thống Kê Giao Hàng": banner [tab-kpi-commission.html](../orders-report/tab-kpi-commission.html) (subtab title + toolbar info) + comment confirm-dialog trong JS.

**Files**: [tab-kpi-commission.js](../orders-report/js/tab-kpi-commission.js), [tab-kpi-commission.html](../orders-report/tab-kpi-commission.html).

**Status**: ✅ Done (node --check OK). Lưu ý: backfill ghi field `number` vào Firestore records cũ lần đầu render mỗi đơn (idempotent).

### [orders][kpi] Fix: đánh KPI base sau gửi tin nhắn hàng loạt — chỉ ~nửa 600 đơn được đánh ✅

**Bug**: gửi tin nhắn hàng loạt 600 đơn xong → KPI "base" chỉ đánh ~một nửa, "cái có cái không tùm lum".

**Nguyên nhân** (trace `saveAutoBaseSnapshot` [kpi-manager.js:243] + `_saveCampaignResults` [message-template-manager.js:1849]): (1) chỉ đơn GỬI THÀNH CÔNG được truyền vào base; (2) lấy SP 3 tầng — Tầng 1 report map cần `campaignName` (mà `window.currentCampaignName` là `let` trong overview-core.js → undefined), Tầng 2 `order.Details` luôn rỗng (kết quả gửi không kèm SP), Tầng 3 `fetchProductsFromTPOS` gọi **TUẦN TỰ ~600 lần, lỗi nuốt im** → rate-limit/timeout giữa chừng → đơn trả `[]` → `continue` **bỏ qua âm thầm**; (3) `/kpi-base/batch` 1 request không verify; (4) kết quả nuốt lặng.

**Fix (owner chốt: base cho MỌI đơn đã chọn, kể cả gửi lỗi + báo kết quả rõ)** — toàn bộ client-side, chỉ gọi lại endpoint KPI sẵn có (tuân thủ `feedback_api_scope`):

- `kpi-manager.js`: `fetchProductsFromTPOS` **throw** khi lỗi HTTP (để retry phân biệt "rỗng thật" vs transient). `saveAutoBaseSnapshot` viết lại: chuẩn hoá id (`Id||id||orderId`), **Tầng 3 song song concurrency 8 + retry 3 lần/đơn** (không drop âm thầm; lỗi thật → `failed`, rỗng thật → `noProduct`, không đếm trùng), **lưu theo lô 100 + verify + retry lô lỗi**, trả `{saved,skipped,failed,noProduct,total}`.
- `message-template-manager.js`: `_resolveOrderData` **cache writeback** `_orderDetailsCache` sau khi OData fetch (KPI tái dùng SP). `_saveCampaignResults`: gom **`[...successOrders, ...errorOrders]`** (tách base khỏi kết quả gửi), đính kèm `Details` từ cache, `campaignName` robust (campaignManager fallback), **toast kết quả** `KPI base: đã đánh X/Y (Z thiếu SP, W lỗi)`.
- `tab1-kpi-base-button.js`: message kết quả dùng field `noProduct`/`failed` server trả.

**Files**: [kpi-manager.js](../orders-report/js/managers/kpi-manager.js), [message-template-manager.js](../orders-report/js/chat/message-template-manager.js), [tab1-kpi-base-button.js](../orders-report/js/tab1/tab1-kpi-base-button.js).

**Test**: Node harness — 600 đơn 30% transient×2 → **recover 100% (600 saved, 0 fail)**; 12 đơn fail vĩnh viễn → `failed=12, noProduct=0` (không đếm trùng, không drop âm thầm); 5 đơn rỗng thật → `noProduct=5`; chunk save lô lỗi 1 lần → recover đủ. **4/4 + dedup pass**, `node --check` 3 file OK.

### [worker] Fix: đăng nhập Web 2.0 lỗi CORS — allow header `X-Web2-Token` ✅

User: đăng nhập admin → mọi API web2 fail (kpi/scope, native-orders/load, campaigns) lỗi `CORS: x-web2-token is not allowed by Access-Control-Allow-Headers in preflight`.

- Root cause: sau login, client gửi header `x-web2-token` (JWT — `native-orders-api.js`, kpi middleware đọc). `shared/universal/cors-headers.js` Allow-Headers **thiếu** header này → preflight chặn → blocked toàn bộ API web2 KHI ĐÃ login (chưa login không gửi header nên không thấy lỗi).
- Fix: thêm `X-Web2-Token` vào Allow-Headers ở **2 chỗ** (`buildCorsHeaders()` + `const CORS_HEADERS`). Thêm comment `⚠ [2026-06-05]` giải thích lý do ngay tại chỗ (user yêu cầu — để phân biệt, tránh đụng nhầm trang khác). Chỉ thêm 1 header, không đổi logic.
- **Auto-deploy**: CI `.github/workflows/deploy-cloudflare-worker.yml` trigger trên `shared/universal/**` → `wrangler deploy` tự chạy khi push. Verified curl OPTIONS preflight sau ~30s → Allow-Headers có `X-Web2-Token` ✅ LIVE.
- File: `shared/universal/cors-headers.js`.

### [native-orders][render] Đơn Inbox — picker SP inline + search không dấu + avatar/hội thoại ✅

User (3 yêu cầu cho modal "Thêm đơn Inbox" trang `native-orders`):

1. **Thêm SP vào giỏ ngay trong modal, không bắt buộc** — picker SP inline + giỏ hàng trong modal `openAddInboxOrder`; tạo đơn được kể cả giỏ trống (bỏ auto-mở modal sửa). Button "Tạo đơn + thêm SP" → "Tạo đơn (N SP)".
2. **Gõ không dấu vẫn nhận** — backend `/api/web2/customers/search` đổi `name ILIKE` → `unaccent(name) ILIKE unaccent($1)` ("huynh thanh dat" khớp "Huỳnh Thành Đạt"). Ensure `unaccent` extension trong `web2-customers-schema.js` + fallback ILIKE nếu extension bị chặn.
3. **Avatar + mở hội thoại cho đơn inbox** (đơn inbox khác đơn livestream — không có fb context sẵn): **ưu tiên bind** `fb_id` từ kho KH khi tạo đơn (`create-manual` lookup `web2_customers.fb_id` → lưu `fb_user_id`); **fallback** modal chat render đầy đủ shell + auto-search sidebar theo tên/SĐT khách (client-side filter khi chưa có page) → user click hội thoại → `_switchChatToCustomer` bind page+psid → load thread.

**Files**:

- `native-orders/js/native-orders-app.js` — `openAddInboxOrder` (picker SP inline + cart), `_renderMessagesPanel` (bỏ dead-end, luôn render shell), `_loadAndRenderThread` (guard prompt "chọn hội thoại" khi unbound), `_wireSidebarSearch` (client-filter + auto-seed search khi `!order.fbPageId`)
- `native-orders/css/native-orders.css` — `.no-add-modal--wide` + `.no-add-cart*` styles
- `render.com/routes/v2/web2-customers.js` — unaccent search + trả `fbId` + fallback
- `render.com/routes/native-orders.js` — `create-manual` nhận/lookup + lưu `fb_user_id`
- `render.com/db/web2-customers-schema.js` — ensure `unaccent` extension

**Verify (Playwright localhost)**: modal mở, picker load 12 SP khi gõ, click → cart 1 row + label "Tạo đơn (1 SP)", 0 console error. Đơn inbox cũ (unbound) mở chat → thread hiện prompt "chưa gắn hội thoại", sidebar auto-prefill tên KH + client-filter chạy, shell + input render, 0 error. ⚠ Backend (Task 2 + bind) cần deploy Render mới verify online.

### [render][web2] Unread Web 2.0 — logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc) ✅

User: đừng học theo Web 1.0; chỉ lấy tin realtime từ server socket → xử lý logic Web 2.0; bỏ nút "Đã đọc", auto-clear theo dữ liệu Pancake.

Refactor [web2-unread-tracker.js](render.com/services/web2-unread-tracker.js): bỏ `_upsert` bump +1, `onNewMessage`, `markSeen` (cách mirror `upsertPendingCustomer` Web 1.0). Còn DUY NHẤT `syncFromConversation(pool, data, notify)`:

- Nguồn: chỉ event `pages:update_conversation` từ Pancake socket (mang `unread_count` authoritative + `last_sent_by`).
- `unread_count = 0` (đã đọc trên Pancake) **HOẶC** shop gửi cuối → **tự XOÁ** (auto, không nút bấm) → SSE `web2:unread` clear → trang reload realtime.
- Else → UPSERT `message_count = unread_count` (SET authoritative, **KHÔNG cộng dồn** → hết drift). Dùng `lastMessageTime` của Pancake nếu có.
- Bỏ `new_message` khỏi unread (chỉ giữ cho keyword detector) vì `update_conversation` luôn bắn kèm count tổng → đếm bằng new_message sẽ drift.

[server.js](render.com/server.js): `pages:update_conversation` hook → `syncFromConversation`; bỏ hook `onNewMessage` + notifier wiring thừa. [web2-unread.js](render.com/routes/web2-unread.js): bỏ `POST /mark-seen` + `initializeNotifiers` (chỉ còn GET list + stats). Frontend [payment-confirm-app.js](web2/payment-confirm/js/payment-confirm-app.js): bỏ nút "Đã đọc" + `markSeen` — danh sách tự xoá hoàn toàn theo Pancake.

→ Unread Web 2.0 giờ là logic riêng, authoritative theo Pancake (không copy Web 1.0), auto-clear, không thao tác tay. Test [scripts/test-web2-unread.js](scripts/test-web2-unread.js) 12/12 (SET không bump, unread=0 tự xoá, shopSentLast tự xoá, lastMessageTime Pancake, API gọn) + frontend smoke (không còn nút Đã đọc, no page error).

### [customer-hub] Ẩn nút "Cấp công nợ ảo" ở ví khách — chỉ giữ Nạp/Rút tiền ✅

User: card Ví Khách Hàng chỉ để Nạp tiền + Rút tiền, ẩn nút "Cấp công nợ ảo".

- Files: `customer-hub/js/modules/wallet-panel.js`
- Xóa button `data-action="issue_vc"` (col-span-2) khỏi `grid grid-cols-2` action row → còn 2 nút Nạp/Rút gọn 1 hàng.
- Handler `issue_vc` + config modal vẫn giữ (dead code, dễ bật lại sau) — chỉ ẩn UI trigger.
- Status: DONE.

### [web2] Bill ghi tên người bán = user đăng nhập + card đăng nhập trên overview ✅

User: các loại bill thiếu tên người bán → lấy user đang đăng nhập (hệ thống user web2). Mục đích login: phân quyền + xác minh danh tính người thực hiện + lịch sử hành động.

- **Bill PBH** (`web2-bill-service.js`): `sellerName` ưu tiên `Web2UserInfo.get().userName` (user đăng nhập), fallback `pbh.createdByName`. → mọi bill in "NV bán: <user>". `bulkPrintBills` cũng thêm `createdByName` từ `assignedEmployeeName` làm fallback.
- **Phiếu Soạn Hàng** (`native-orders-packing-slip.js`): helper `_seller()` cùng logic → header + bản in "Nhân viên: <user đăng nhập>".
- **Overview**: thêm card đăng nhập/danh tính (`#ovAuthCard`) đọc `Web2Auth.getStored()` → chưa login: "⚠️ Chưa đăng nhập" + nút "→ Đăng nhập" (web2/login) + "👥 Quản lý người dùng" (web2/users); đã login: tên + role + Đăng xuất. Giải thích mục đích phân quyền/danh tính/lịch sử.
- Verified Playwright: card render đúng (chưa login → cảnh báo "bill ghi ẩn danh" + 2 nút).
- Files: `web2-bill-service.js` (v=20260605u1), `native-orders-packing-slip.js` (v=20260605c), `web2/overview/index.html`.

### [render][web2] Hardening Pancake WS 24/7 + DB tin nhắn chưa đọc RIÊNG Web 2.0 ✅

User: (1) đảm bảo Pancake WebSocket client chạy đúng/liên tục không sập; (2) build DB tin chưa đọc riêng Web 2.0 (tuyệt đối không đọc Web 1.0).

**Part 1 — Harden WS** [render.com/server.js](render.com/server.js) `RealtimeClient`:

- **Bug "sập im" lớn nhất**: sau 10 lần reconnect fail → `Stopping reconnection` (chết vĩnh viễn đến khi restart). Sửa → retry chậm 60s/lần + reset counter, KHÔNG dừng hẳn.
- **Watchdog zombie**: thêm `lastActivityAt` (refresh mỗi message kể cả phx_reply heartbeat). Heartbeat 30s check: không activity > 90s → `ws.terminate()` → fire close → reconnect (chống half-open TCP "connected nhưng câm").
- Giữ nguyên: backoff 2s→60s, auto-connect khi restart (`realtime_credentials`).

**Part 2 — Unread DB Web 2.0 thuần** (zero-touch Web 1.0):

- **Service** [web2-unread-tracker.js](render.com/services/web2-unread-tracker.js): bảng `web2_unread_messages` (web2Db). `onConversationUpdate` (unread authoritative; unread=0/shopSentLast → delete; else upsert count=unread), `onNewMessage` (bump +1), `markSeen`. Mirror logic `upsertPendingCustomer` nhưng ghi web2Db độc lập. SSE `web2:unread`.
- **Route** [web2-unread.js](render.com/routes/web2-unread.js) `/api/web2/unread`: GET / (list), GET /stats, POST /mark-seen.
- **server.js**: hook `web2UnreadTracker.onConversationUpdate` trong `pages:update_conversation` (sau Web 1.0 upsert, best-effort) + `onNewMessage` trong `pages:new_message`. Mount route + ensureSchema + notifiers.
- **Frontend** [payment-confirm-app.js](web2/payment-confirm/js/payment-confirm-app.js): tab "Tin nhắn chưa đọc" đổi `/api/realtime/pending-customers` (Web 1.0) → `/api/web2/unread` (Web 2.0). Thêm SSE `web2:unread` realtime + nút "Đã đọc" (UI-first mark-seen).
- → Cả 2 tab giờ data Web 2.0 thuần, KHÔNG đọc Web 1.0. (Hook detect/unread vẫn dùng chung Pancake WS socket — socket DUY NHẤT nhận tin 24/7 — nhưng chỉ ĐỌC stream, GHI sang web2Db.)
- **Test**: [scripts/test-web2-unread.js](scripts/test-web2-unread.js) 12/12 (schema idempotent, upsert authoritative, bump, drift-correct, delete shopSentLast/unread=0, markSeen, list) + payment-signals 11/11 regression OK + frontend smoke (2 tab, SSE, no page error).

### [native-orders] Phiếu Soạn Hàng cho đơn Nháp (Phần 1/2) ✅

User: đơn trạng thái "Nháp" → "In bill" ra modal Phiếu Soạn Hàng (checkbox Chờ Hàng + ghi chú/SP) → in ra "CH" ở cột ghi chú. (Phần 2 print-count làm sau.)

- Module mới `native-orders/js/native-orders-packing-slip.js` (port từ `don-inbox/js/tab-social-packing-slip.js`): nhận thẳng order object, data Web 2.0 (`products[].name/price/quantity/note`, `customerName/phone/address`, `assignedEmployeeName||createdByName`), STT = `computeOrderStt` (đơn gộp "243 + 678"). Modal tự dựng động (không sửa index.html nhiều). `window.NativeOrdersPackingSlip.open(order, {sttDisplay})`.
- `bulkPrintBills`: nếu TẤT CẢ đơn chọn là `status==='draft'` → mở Phiếu Soạn Hàng (1 đơn/lần); đơn đã xác nhận/PBH → bill PBH thường.
- Print: SP tick "Chờ Hàng" → cột Ghi chú in `CH` đậm (khớp mẫu hình 2). Bảng STT|Sản phẩm|SL|Giá|Ghi chú + Nhân viên trên header.
- Verified Playwright screenshot `packing-slip-modal.png`: khớp mẫu hình 1.
- File: `native-orders-packing-slip.js` (v=20260605a), wire `native-orders-app.js`.
- **TODO Phần 2**: print-count — in bill → ghi số lần in vào đơn (native_orders.print_count, đã có cột); in mã SP → ghi số lần in vào product (web2_products cần thêm cột + endpoint + deploy Render). Mục đích: tránh in trùng gây soạn hàng lặp.

### [render][web2] Detect "CK XONG"/"ĐÃ CK" từ inbox Pancake 24/7 → trang "Xác nhận CK" ✅

User: khách nhắn "CK XONG" hoặc "ĐÃ CK" (không phân biệt hoa/thường, có/không dấu) → server nhận biết KH đã chuyển khoản → trang Web 2.0 mới quản lý + gắn cờ đơn.

**Không build WS mới** — hook vào `RealtimeClient` Pancake WS đã chạy 24/7 trong [render.com/server.js](render.com/server.js) (`pages:new_message`). Tin Web 2.0 ghi sang **web2Db** (WS client dùng chatDb Web 1.0 → tách).

- **Detector** [render.com/services/web2-payment-signal-detector.js](render.com/services/web2-payment-signal-detector.js): `normalize` (lowercase + bỏ dấu NFD + đ→d), `detectPaymentKeyword` (regex `ck ?xong` / `da ?ck`, loại câu hỏi "đã ck chưa?"), `handleIncoming` (dedup 10', resolve phone từ `web2_customers.fb_id`, khớp `native_orders`/`fast_sale_orders` theo phone, INSERT `web2_payment_signals`, SSE `web2:payment-signals`). Mặc định status `pending` (chờ duyệt, KHÔNG auto-gắn cờ — tránh false-positive).
- **Route** [render.com/routes/web2-payment-signals.js](render.com/routes/web2-payment-signals.js) mount `/api/web2/payment-signals`: GET / (list + LEFT JOIN enrich đơn), GET /stats, POST /:id/confirm|dismiss|link-order. SSE wired `web2RealtimeSseRoutes.notifyClients`.
- **server.js**: require detector, hook trong `pages:new_message` (sau `upsertPendingCustomer`, best-effort catch), mount route + ensureSchema + initializeNotifiers.
- **Trang** [web2/payment-confirm/](web2/payment-confirm/index.html) (page-shell pattern, 3 file riêng): tab "KH báo đã CK" (card + pill ví `Web2WalletBalance`, Web2Optimistic confirm/dismiss/link, SSE realtime) + tab "Tin nhắn chưa đọc" (đọc Web 1.0 `/api/realtime/pending-customers` qua API — rule 5b, highlight snippet match keyword). Menu "Tính năng mới" → "Xác nhận CK".
- **Gắn cờ đơn**: [native-orders.js](render.com/routes/native-orders.js) `/load` enrich `ckSignal` (LEFT JOIN `web2_payment_signals` theo code) → badge `💸 KH báo đã CK` (soft marker, chưa phải xác nhận tiền — đối soát vẫn qua SePay). **tpos-pancake defer** (render model là TPOS comments, không phải đơn có phone).
- **Câu khuyến nghị gửi khách**: thêm `✅ Chuyển xong nhắn em "CK XONG" để hệ thống xác nhận & xử lý đơn nhanh hơn nha 💕`.
- **Test** [scripts/test-payment-signals.js](scripts/test-payment-signals.js): local DB tạm → 11/11 pass (schema idempotent ×2, detect, resolve phone, khớp đơn, SSE notify, dedup, loại câu hỏi, JOIN enrich, confirm flip) → DROP DB. Detector unit 15/15. Frontend live smoke: trang render, 2 tab, sidebar mount, Web2SSE/Optimistic/Wallet load, tab switch OK.

### [native-orders] Nút "PBH SHOP" mở modal Tạo PBH (phương thức BÁN HÀNG SHOP disable) ✅

User: bấm nút "PBH SHOP" → mở modal giống "Tạo PBH" nhưng phương thức giao hàng = "BÁN HÀNG SHOP" disable không cho chọn.

- `createPbh(code, opts)` thêm `opts.shopMode`: onMount tìm option `/pbh\s*shop|bán\s*hàng\s*shop|shop/i` trong `#pbhDeliveryMethod` (có sẵn "BÁN HÀNG SHOP" trong carrier list) → select + `disabled` + nền xám + `pbhDeliveryPrice = 0`. Title "Tạo PBH SHOP từ {code}", nút "Tạo PBH SHOP". collect đọc carrierName="BÁN HÀNG SHOP" (regex shop match → bill/badge detect).
- `bulkCreatePbhShop`: 1 đơn → `createPbh(code, {shopMode:true})` (mở modal); nhiều đơn → giữ bulk confirm cũ.
- Verified Playwright: `createPbh('NJ-...-0005', {shopMode:true})` → modal mở, sel disabled=true, value="BÁN HÀNG SHOP", price=0.
- File: `native-orders-app.js` (v=20260605c).

### [orders] FIX KPI THỰC trừ nhầm: đơn hoàn có KPI gốc = 0 vẫn bị loại KPI

**Bug** (user phát hiện ở modal "Chi tiết KPI - Huyền"): TỔNG ĐƠN 11, OK 9, ĐƠN HOÀN 2, GROSS 55.000đ, **BỊ LOẠI 10.000đ → KPI THỰC 45.000đ**. Sai: 1 trong 2 đơn hoàn (đơn 504) có `order.kpi = 0đ` (SP NET=0, **chưa từng +KPI**) nhưng đối soát vẫn khớp món hoàn → trừ 5.000đ. KPI THỰC đúng phải là **50.000đ** (= 10 món OK × 5.000), BỊ LOẠI đúng = **5.000đ** (chỉ đơn 539 thực sự earn rồi hoàn).

**Root cause**: KPI bị loại của 1 đơn lấy từ `refundedKpiAmount` (KPI món hoàn khớp từ file refund + reconcile tươi `result.details.net`) nhưng **không giới hạn bởi KPI đơn đó thực earn** (`order.kpi`). Khi reconcile tươi tìm thấy món net>0 mà campaign gốc tính 0 → trừ KPI chưa từng cộng → âm net đơn đó.

**Fix**: cap `kpiLoss = min(refundedKpiAmount, order.kpi)` — 1 đơn không thể bị loại KPI nhiều hơn KPI nó đã earn. Áp tại **6 nơi cộng/hiển thị loss** (dùng `order.kpi`/`r.kpiAmount` sống → **hiệu lực ngay, không cần chạy lại đối soát**):

- Modal summary `renderEmployeeOrdersTable` (KPI THỰC card)
- `_hydrateL1ReconCachesForEmployees` + `_applyL1ReconCache` (loss bảng chính từ cache)
- `_indexReconResults` (loss tab đối soát)
- `_renderReconciliationUI` total "Loại bỏ KPI" + Excel export cột "KPI bị loại"
- 2 message detail-row của 2 hàm reconcile (L1 + tab)

Cờ "đơn hoàn" (`isRefunded = refundedKpiAmount > 0`) + count ĐƠN HOÀN giữ raw → vẫn = 2 (504 vẫn là đơn có hoàn). Chỉ số tiền loss bị cap.

**Files**: `orders-report/js/tab-kpi-commission.js`. **Status**: DONE (chưa verify live — cần reload trang, không cần chạy lại đối soát).

### [native-orders] Bill STT khớp list — đơn gộp ghi "STT1 + STT2" ✅

User: đơn gộp thì bill ghi STT 1 + STT 2. Phát hiện thêm: bill dùng `displayStt` (global, vd 14) nhưng list dùng `campaignStt` (vd 4) → lệch STT cả đơn thường.

- Tạo helper `computeOrderStt(o)` DÙNG CHUNG: gộp → `mergedDisplayStt` join "1 + 2"; tách → `campaignStt-splitIndex` ("31-2"); thường → `campaignStt`. List (`sttValue`) + `bulkPrintBills` (truyền vào `displayStt`) đều gọi helper này → STT bill = STT list 100%.
- `mergedDisplayStt` truyền `null` (đã gộp sẵn vào string). Bill `getMergedSttDisplay` fallback `String(displayStt)` → "#4" / "#1 + 2".
- Verified: single `displayStt='4'` → "PBH SHOP #4"; merged `displayStt='1 + 2'` → "Phiếu Bán Hàng #1 + 2". (Curl xác nhận đơn thật #4 có campaignStt=4 vs displayStt=14.)
- File: `native-orders-app.js` (v=20260605b).

### [native-orders] Fix: in bill mất dấu "PBH SHOP" — truyền pbhCarrierName ✅

User: in bill đơn PBH SHOP (Hạnh Trần) không thấy đánh dấu shop. Root cause: `bulkPrintBills` dựng PBH-shape với `delivery: { carrierName: '' }` **hardcode rỗng** → bill `isShop = /pbh\s*shop|shop/i.test('')` = false → mất dấu.

- Fix: `carrierName: o.pbhCarrierName || ''` (cùng field badge dùng ở line 987). Verified curl `/api/native-orders/load?search=0788881818` → đơn thật `NJ-20260604-0004` có `pbhCarrierName='PBH SHOP'` → giờ bill hiện "PBH SHOP" + "BÁN TẠI SHOP".
- File: `native-orders-app.js` (v=20260605a).

### [web2] Bill: đơn bán tại shop ghi tiêu đề "PBH SHOP" ✅

User: đơn PBH SHOP trên bill ghi rõ là "PBH SHOP". `isShop` detect qua `carrierName` = 'PBH SHOP' (native-orders tạo PBH SHOP set carrier này).

- `_buildBillBody`: tiêu đề `d.isShop ? 'PBH SHOP' : 'Phiếu Bán Hàng'` (thay "Phiếu Bán Hàng (SHOP)") + giữ STT `#4`. Sub bỏ trùng → chỉ "BÁN TẠI SHOP".
- Verified screenshot `bill-pbhshop.png`: tiêu đề "PBH SHOP #4". File: `web2-bill-service.js` (v=20260605nj16).

### [render][tpos-pancake] Enrich SĐT/địa chỉ comment TPOS từ kho khách hàng (theo fb_id)

**Vấn đề**: Row 3 (SĐT/địa chỉ) ở mỗi dòng comment panel TPOS chỉ lấy từ **TPOS Partner cache** (`chatomni/info` → `partner.Phone`/`partner.Street`). Khách MỚI comment chưa là Partner CRM → row trống, dù khách đó có thể đã có sẵn trong **kho khách hàng** (Web 1.0 `customers`) từ đơn cũ/inbox. Fallback cũ (`tpos-partner-fallback.js`) chỉ chạy SAU khi staff tự gõ SĐT.

**Giải pháp** (chốt với user: _TPOS trước, kho KH lấp chỗ trống_ + _batch endpoint_):

- **Backend**: mở rộng `POST /api/v2/customers/batch` nhận thêm `fb_ids` (cạnh `phones`/`ids`) → 1 query `WHERE c.fb_id = ANY($1)`, map keyed theo fb_id (trả phone/address/status). Backward-compatible — nhánh phones/ids giữ nguyên. `render.com/routes/v2/customers.js`.
- **Frontend**: `tpos-kho-enricher.js` (mới) — wrap `renderComments`, scan comment có fb_id mà partnerCache thiếu Phone + chưa hỏi kho → debounce 600ms → batch POST (cap 200) → fill `state.customerKhoCache` (Map riêng, KHÔNG đụng partnerCache nên không phá `savePartnerData`). `renderCommentItem` đọc fallback `partner.Phone || kho.phone`. `set` `attempted` chống loop khi miss.
- Layering OK: gọi **API** Web 1.0 (không đọc DB trực tiếp) — đúng rule 5b; trang đã gọi `/api/v2/customers/*` sẵn.

Files: `render.com/routes/v2/customers.js`, `tpos-pancake/js/tpos/{tpos-kho-enricher.js,tpos-state.js,tpos-comment-list.js}`, `tpos-pancake/index.html`. Status: ✅ code xong, chờ Render auto-deploy để fb_ids live (frontend handle 400 gracefully tới lúc đó).

### [orders] KPI filter: nút "Tháng này" → dropdown chọn tháng cụ thể (5-2026, 6-2026, …)

**Yêu cầu**: bộ lọc KPI (tab "KPI Đơn Hàng") chỗ nút "Tháng này" đổi thành dropdown cho chọn tháng cụ thể, vd 5-2026, 6-2026, 7-2026.

**Files**:

- `orders-report/tab-kpi-commission.html` — thay `<button data-preset="thismonth">Tháng này</button>` bằng `<select id="kpiFilterMonth" class="kpi-month-select">`.
- `orders-report/js/tab-kpi-commission.js` — thêm `_populateMonthOptions()` (đổ options 3 tháng tới → 12 tháng trước, mới nhất ở trên, label `M-YYYY`, value `YYYY-MM`) + `_applyMonthRange(val)` (set range = ngày 1 → ngày cuối tháng). Wire trong `_bindFilterV2`: chọn tháng → bỏ active preset + `applyFilters()`; bấm preset → reset dropdown về "Chọn tháng…".
- `orders-report/css/tab-kpi-commission.css` — `.kpi-month-select` style như preset button (trong pill group, có chevron, state `.is-active`).

**Chi tiết**: dùng lại đường đọc `kpiFilterDateFrom`/`kpiFilterDateTo` của `applyFilters()` — chọn tháng chỉ set 2 input đó rồi gọi applyFilters, không đụng logic backend. Tab "KPI Đơn Inbox" vẫn giữ nút "Tháng này" cũ (chưa đổi).

**Status**: DONE (chưa verify live).

### [inbox] FIX verify lưu thẳng Render (worker route nhầm sang TPOS) — VERIFIED LIVE ✅

**Bug**: đánh dấu kiểm tra + lịch sử không lưu Render (Incognito/máy khác trống). `GET /api/social-kpi-verify/load` trả **trang 404 của TPOS.VN** → Cloudflare Worker route path mới **sang TPOS** vì chưa có trong allowlist Render (`cloudflare-worker/modules/config/routes.js` + `worker.js` dispatch chỉ route 1 danh sách `/api/*` cố định về Render).

**Fix (không cần deploy worker)**: mount router DƯỚI prefix đã-route-Render `/api/social-orders/kpi-verify` (TRƯỚC `socialOrdersRoutes`). Frontend `_verifyApi()` đổi theo. Thêm `DELETE /:orderId` (cleanup). Bump `?v=20260605e`.

**VERIFIED LIVE trên production Render** (mình tự chạy):

- Render **auto-deploy** sau git push (~2 phút). Endpoint `/api/social-orders/kpi-verify/load` → `{"success":true}` (Render, KHÔNG còn TPOS).
- Round-trip test 5/5: POST /mark → GET /load (entry persisted + đúng người kiểm) → DELETE → GET (sạch, không pollution).
- **Data thật của user ĐÃ tự sync lên Render**: GET /load = **17 lượt lịch sử + 10 đơn current** (vd NJD/2026/70417 · Pé Tiên · admin) — `_flushPending()` đẩy localStorage → Render khi user reload. → Incognito/máy khác giờ đọc chung từ Render.

Files: `render.com/{server.js,routes/social-kpi-verify.js}`, `don-inbox/js/tab-social-kpi-reconcile.js`, `don-inbox/index.html`.

### [render][native-orders] Gửi tin nhắn template — JOB SERVER-SIDE đa-account + extension fallback (refresh-safe) ✅

User (native-orders): nút "Gửi tin nhắn" → template (đã có) → gửi bằng **tất cả account Pancake song song, chạy nền ở server, refresh không mất, hiện progress**. Lỗi 24h → fallback extension. Nghiên cứu: thay account Pancake cho extension bypass được không?

**Kết quả nghiên cứu (quan trọng):** Extension bypass 24h = dùng **session FB trình duyệt** (cookie `c_user`/`xs` + `fb_dtsg`) POST `business.facebook.com/messaging/send/`, gửi AS page — KHÔNG phải qua account Pancake. → **Không thể thay account Pancake để bypass 24h server-side**; Pancake API (pages.fm) bị enforce 24h (`e_code 10/e_subcode 2018278`). Chốt: **hybrid** — server lo Pancake API đa-account; đơn 24h → extension drain ở tab mở (1 phiên FB, đa nhiệm theo KH).

**Mới:**

- `render.com/routes/web2-msg-send.js` — route `/api/web2-msg-send` + `ensureSchema` (web2Db: `web2_msg_send_jobs` + `web2_msg_send_items`). POST tạo job, GET `/active` (reattach sau refresh), `/:id`, `/:id/extension-items`, claim-ext, result, cancel. SSE topic `web2:bulk-send:<jobId>` + `web2:bulk-send`.
- `render.com/services/web2-msg-send-worker.js` — worker nền (copy aikol-queue-worker): claim `FOR UPDATE SKIP LOCKED`, gửi Pancake API, **account rotation** (mint PAT từ từng account quản page khi token/permission lỗi), lỗi 24h → `needs_extension`. Job/items ở web2Db; pancake creds ở chatDb (cross-pool, đã research). Concurrency env `WEB2_MSG_WORKER_CONCURRENCY=8`.
- `render.com/server.js` — mount route + `initializeNotifiers(web2RealtimeSse)` + `ensureSchema` + `.start()` worker.

**Sửa:**

- `web2/shared/web2-msg-template.js` — thay vòng lặp gửi client bằng: POST job → SSE progress + poll fallback → **pill nổi refresh-safe** (boot tự bám lại job đang chạy, tiếp tục drain) → **extension drainer** (claim chống double-send → `REPLY_INBOX_PHOTO` → report result). Placeholder thêm alias `{order.phone}`, `{order.totalAmount}`. Đóng modal KHÔNG dừng job (chạy server). Hint cập nhật.
- `native-orders/index.html` — bump `web2-msg-template.js?v=20260605srv1`.

**Verify:** local smoke native-orders OK (`Web2MsgTemplate` load, modal mở, orderCount đúng, hint có `order.totalAmount`, 0 console error). E2E gửi thật + extension drain phải test trên **Chrome thật của user** (Playwright harness không có extension; khách test Huỳnh Thành Đạt >24h → Pancake fail → extension). Server cần deploy Render mới live.

### [web2 products] Tem mã SP in gần đầy con tem (25×21mm) cho đẹp ✅

User: trang products → mã SP in ra cho gần đầy kích cỡ giấy tem cho đẹp.

- `buildLabelHTML`: font ×1.3 (`fsBase*1.3`), barcode cao **46% tem** (đã hạ từ 55%: tên 2-3 dòng không làm GIÁ bị cắt). Content `justify-content: center` (user chốt: canh giữa dọc tem — khối to nhưng không sát mép trên/dưới; bản space-between trước bị sát mép).
- **Barcode rộng gần full**: bỏ pad quiet-zone tới TARGET_W=600 (làm bars chỉ ~50% width, chừa trắng 2 bên), đổi `sideMargin = max(6, nativeW*0.06)` → bars chiếm ~88% width tem, vẫn đủ vùng trắng tối thiểu quét Code128.
- **Tên SP tối đa 2 dòng**: `nameStyle` block thuần + `max-height: 2×nameLineH` + `overflow:hidden` (KHÔNG dùng `-webkit-line-clamp` — html2canvas/raster TSPL không tôn trọng → vẫn ra 3 dòng). `nameLineH = lineH + 2` để dấu tiếng Việt 2 tầng (Ộ, Ặ, ậ) không bị cắt đáy dòng 2. → barcode + giá luôn đủ chỗ, không bị `overflow` cắt.
- Verified Playwright (expose tạm `_buildLabelHTML`/`_PAPERS`, screenshot `label-2line3.png`, gỡ hook trước commit): tên dài → đúng 2 dòng + dấu nguyên, mã vạch + giá hiện đủ.
- File: `web2-products-print.js` (v=20260605g). In tem qua máy XP-470B (TSPL) tự co theo `.barcode-sheet` 66mm.

### [web2] Bill tiếng Việt: bớt nhòe/đứt khúc — raster 3× + coverage thấp + giảm font-weight ✅

User: chữ in đậm trên bill bị nhòe hoặc đứt khúc. Research GitHub/web (DantSu#238, mike42#254, nguồn VN): CP1258 codepage không tin cậy → raster vẫn đúng nhất, nhưng phải render độ phân giải cao + chữ KHÔNG quá đậm + density máy đúng.

- **Chống ĐỨT KHÚC**: `printBillHtml` raster **3× supersample** (thay 2×) → downsample mịn hơn, dấu mảnh không gãy. + `coverage: 0.14` → `need=1` (ô có ≥1 sub-pixel mực = chấm đen) giữ liền nét dấu. (`escposRasterFromHtmlPhysical` nhận thêm `opts.coverage`).
- **Chống NHÒE (dồn mực)**: giảm font-weight chữ NHỎ trong `BILL_CSS`: `b/strong` 800→700, label (`.b-lbl`/`.b-cod-label`/`.b-sub`/`.b-it-name`) →600, header/title/STT/total →700. Chữ TO (shop 26px, COD 30px, TỔNG 17px) GIỮ 800 (nét xa nhau in vẫn sắc).
- Verified raster vẫn ~576 chấm (584, lệch 8 chấm = lề phải trắng, máy 576 crop vô hại). Screenshot `bill-light.png`.
- **Phần cứng (user chỉnh)**: nếu vẫn nhòe → giảm **DENSITY/nhiệt độ** máy in (nóng quá = mực lan); vẫn đứt → tăng density. Đây là nửa còn lại của fix mà code không làm được.
- Files: `web2-bill-service.js` (v=20260605nj15), `web2-printer.js` (v=20260605i).

### [inbox] KPI verify: auto-sync localStorage → Render (không mất khi đổi máy/ẩn danh) ✅

User: Incognito không thấy đơn đã kiểm + lịch sử → vì backend `/api/social-kpi-verify` **chưa deploy Render** nên đang lưu localStorage (riêng từng browser). Cần lưu trên Render để chia sẻ + không mất.

- Thêm field `synced`; `markVerified` POST Render → `synced=true`, lỗi/404 → `synced=false` (giữ local).
- `_flushPending()`: lần `loadVerifications` kế (sau khi backend có) tự **đẩy mọi mark `synced=false` lên Render** → đơn đã đánh dấu lúc chưa deploy KHÔNG mất.
- `loadVerifications`: flush trước → GET Render (nguồn chính) → merge local-chưa-sync → `_recomputeCurrent()`.

→ **Sau khi deploy Render**: reload trang → mark local tự sync lên Render → hiện ở MỌI máy/ẩn danh. Bump `?v=20260605d`. Test 5/5.

**⚠ CẦN: deploy/redeploy Render** (route `social-kpi-verify.js` + bảng đã có trong repo). Verify: `curl https://chatomni-proxy.nhijudyshop.workers.dev/api/social-kpi-verify/load` → `{"success":true}`.

### [web2 pancake-settings] Quản lý nhiều tài khoản Pancake (DB-backed) ✅

User: hiện tất cả account Pancake để quản lý, cho thêm/xoá, lưu ở DB. Kiểm tra firebase/render web2 đã quản lý account chưa.

- **Kiểm tra**: DB-backed multi-account ĐÃ TỒN TẠI sẵn — Render Postgres bảng `pancake_accounts` (pool `chatDb`, **chia chung Web 1.0** — cùng store token, web1 tpos-pancake + web2 thấy nhau ngay), endpoint `/api/pancake-accounts` (GET / POST `/sync` / PUT / DELETE) proxy qua CF Worker. Hiện có **6 account thật**. Firebase `pancake_tokens` chỉ là backup legacy của web1. Web2 trước giờ CHỈ đọc (`web2-chat-client.syncFromRenderDB`) — **chưa có UI quản lý**.
- **Mới `web2/shared/web2-pancake-accounts.js`**: `Web2PancakeAccounts` — `list()`, `addFromToken()` (account_id = JWT `uid`, KHỚP web1 tránh trùng row → POST `/sync`), `remove()` (DELETE + clear active local nếu trùng), `setEnabled()` (is_active sync on/off), `setActiveLocal()` (đặt JWT active per-device), `getActiveId()`.
- **Card "Tài khoản Pancake"** (đầu trang): list tất cả account (avatar, tên, uid, fb_id, chip HSD còn/hết hạn, pill "Đang dùng"), nút **Dùng** (switch active local), **Xoá** (DELETE DB, optimistic qua `Web2Optimistic.run`), **Thêm tài khoản** (panel inline: paste JWT hoặc "Lấy tự động" qua extension → POST `/sync`).
- Save/auto-fetch/paste JWT giờ đều `persistActiveToDb()` → upsert account vào DB + set active.
- KHÔNG tạo bảng web2\_ riêng — dùng store chung sẵn có (đúng pattern shared pancake token).
- Verified Playwright (mock network, không đụng prod DB): render 6/3 account, switch active, add→+1, delete→-1, 0 console error. Screenshot prod 6 account đúng layout.

### [inbox] FIX log lỗi đối soát: bỏ GetListOrderIds (400) + im 404 verify ✅

Console khi chạy đối soát có 2 lỗi (kết quả VẪN đúng nhờ fallback):

- **400 `GetListOrderIds`**: nested `$expand=OrderLines($expand=Product)` bị TPOS từ chối. → **BỎ HẲN `bulkFetchInvoiceLines`** — nguồn món khớp refund dùng `order.products[].productCode` (verify 100%). Hết 400, nhanh hơn. Kết quả không đổi.
- **404 `/social-kpi-verify/*`**: backend chưa deploy → cờ `verify.backendDown` (set sau 404 đầu) → chỉ dùng localStorage, ngừng spam. Sau deploy Render tự chia sẻ.

Test 4/4. Bump `?v=20260605c`. ⚠ Vẫn cần deploy Render để verify chia sẻ cross-máy.

### [web2] Bill: SP hàng 1 = tên đầy đủ, hàng 2 = SL/ĐƠN GIÁ/T.TIỀN canh cột ✅

User đổi ý layout SP: tên SP riêng **hàng 1** (đầy đủ, không chật), **hàng 2** = SL + đơn giá + thành tiền canh thẳng dưới header.

- `.b-it-name` (full width) + `.b-it-nums` (flex justify-end, 3 cột `.c-qty`/`.c-price`/`.c-total` cùng width với header → số canh thẳng dưới `SL`/`ĐƠN GIÁ`/`T.TIỀN`). Cột số rộng hơn (price 64, total 70) vì tên không còn chiếm chỗ → giá triệu "1.550.000" thoải mái.
- Verified Playwright: 72mm, tên dài "QUẦN SHORT ĐEN SIZE M" hiện trọn hàng 1, số canh cột hàng 2. Ảnh `downloads/n2store-session/bill-2row.png`.
- File: `web2-bill-service.js` (v=20260605nj14).

### [inbox] Modal KPI: gồm theo NV + đánh dấu kiểm tra + lịch sử + refresh phiếu TPOS ✅

Nâng cấp modal "Chi tiết KPI khoảng đã chọn" (click thẻ KPI) theo yêu cầu owner:

- **Phóng lớn** modal (max-width 1400, 94vh) + **2 tab**: "Chi tiết KPI" + "Lịch sử kiểm tra".
- **Gồm đơn theo nhân viên** (collapsible như leaderboard): header NV (số đơn · đã kiểm X/N · món · gross · hoàn · net) → click mở/đóng danh sách đơn.
- **Cột "Trạng thái phiếu"**: badge ShowState hiện tại của phiếu bán hàng (reuse `getShowStateConfig`).
- **Click mã phiếu → expand chi tiết món**: món nào được tính KPI (+5.000×SL), món nào hoàn (in đỏ "KHÔNG +"). Nguồn: `byOrder.kpiProducts` (lưu thêm trong run()) + `refundedProducts`.
- **Ô check "đã kiểm tra"** đầu mỗi đơn → đơn **tô xanh nhẹ** (`#ecfdf5`). Lưu ai/giờ/ngày.
- **Tab "Lịch sử kiểm tra"**: thời gian · người kiểm · hành động · mã phiếu · NV đơn · khách.

**Persistence** (feature mới, append-only — MEMORY feedback_api_scope): bảng + endpoint RIÊNG `social_kpi_verifications` / `POST /api/social-kpi-verify/mark` + `GET /load` (pool chatDb). Frontend `verify` store: **Render + fallback localStorage**. Identity = `authManager.getAuthState().displayName`.

**Đối soát thêm BƯỚC 0 — làm mới phiếu TPOS**: `run()` trước tiên gọi `refreshInvoicesFromTPOS()` cho TOÀN BỘ đơn 'Đơn hàng' trong khoảng (**10 lệnh song song** → `POST /api/invoice-status/refresh-from-tpos`) rồi `InvoiceStatusStore.reload()` → đối soát chạy trên trạng thái phiếu mới nhất.

**Files**: NEW [render.com/routes/social-kpi-verify.js](../render.com/routes/social-kpi-verify.js) + mount server.js; [tab-social-kpi-reconcile.js](../don-inbox/js/tab-social-kpi-reconcile.js); [index.html](../don-inbox/index.html) `?v=20260605b`.

**Test**: 17/17 integration (3 file vm + refund excel thật): refresh-from-tpos, reload store, món-based, kpiProducts/invoiceState, markVerified→POST+isVerified+history, modal HTML (group NV/checkbox/status/mã phiếu click/món detail/tô xanh). ⚠ Backend cần deploy Render để chia sẻ cross-máy.

### [web2] Pending-match: hiện luôn list KH từ hội thoại FB INLINE trong card ✅

User: hiện luôn ra hình 2 (list hội thoại) ngay trong card, không cần bấm 💬 mở modal.

- Mỗi card pending có section **"📘 Khách từ hội thoại Facebook (khớp đuôi SĐT)"** với avatar + tên + SĐT (từ `recent_phone_numbers`) + nút xanh **"Gán KH này"** → resolve pending ngay.
- **Lazy-load qua IntersectionObserver** (root=modal body, rootMargin 300px): chỉ search Pancake khi card cuộn tới → tránh 200 card × 3 page search cùng lúc. Cache theo đuôi (`_fbTailCache`), cap 6 dòng, ưu tiên SĐT endsWith đúng đuôi.
- Giữ nút 💬 (mở modal full thread/tìm). Browser-tested: card đầu auto 5 dòng (Vân Luu 0918779981, An Nguyễn 0942779981), 5 nút Gán.
- **Files:** `web2/balance-history/js/web2-pending-match.js` (v=20260605c), `index.html`

### [web2] Bill: sản phẩm 1 hàng/SP — 4 cột (tên | SL | đơn giá | thành tiền) ✅

User: phần sản phẩm gộp tên + số lượng + tiền + thành tiền cho **1 hàng** (trước đây 2 dòng/SP: tên ở trên, "SL × giá ... total" ở dưới).

- Header `.b-ih` + row `.b-it-row` dùng 4 cột flex: `.c-name` (flex co giãn, wrap) + `.c-qty` (22px, giữa) + `.c-price` (54px, phải) + `.c-total` (60px, phải, đậm). Tên SP dài tự xuống dòng nhưng **số (SL/đơn giá/thành tiền) giữ nguyên hàng đầu đúng cột** (align-items baseline).
- Bỏ uom "Cái" + "×" (header cột đã chú thích) → gọn. Mỗi SP tên ngắn = 1 dòng (trước 2 dòng) → nén bill.
- Verified Playwright: 4 SP (gồm 1 tên dài wrap 3 dòng) = 72mm, cột thẳng. Ảnh `downloads/n2store-session/bill-1row.png`.
- **Lưu ý khổ**: "80mm" là khổ GIẤY; vùng in 72mm = 576 chấm (chuẩn máy 80mm). Bill dùng đúng 72mm — ép 80mm sẽ cắt mép phải máy 576 chấm.
- File: `web2-bill-service.js` (v=20260605nj13).

### [web2] Pending-match: chọn KH từ list hội thoại FB (nút "Gán KH này") ✅

User: hiện danh sách tên khách (hình 2 — list hội thoại khớp đuôi SĐT) ra để chọn luôn.

- **Pick mode** trong `web2-chat-readonly.js`: `openSearch({query, onPick})` → mỗi hội thoại có nút xanh **"Gán KH này"**. Title đổi "Chọn KH từ hội thoại", class `has-pick`. SĐT lấy từ `recent_phone_numbers` (ưu tiên số khớp query) → `data-phone`. Click → `onPick({phone,name})` + đóng modal.
- **Pending-match**: nút 💬 mỗi card truyền `onPick: (cust) => _resolveFromChat(pendingId, cust.phone, cust.name)` → resolve pending ngay bằng SĐT+tên từ chat FB (đúng người KH tự gõ trong chat).
- Browser-tested: 💬 → 19 hội thoại đều có "Gán KH này", phone đúng (Vân Luu 0918779981, An Nguyễn 0942779981 = candidate gốc). KHÔNG bấm Gán (tránh ghi ví prod).
- **Files:** `web2/shared/web2-chat-readonly.js` (v=20260605a), `web2/balance-history/js/web2-pending-match.js` (v=20260605b), `index.html`

### [web2] Redesign bill HTML/CSS (bỏ ReceiptLine) — khung COD + khung mã vạch + đường trang trí ✅

User: (1) bill in ra to quá; (2) làm lại đẹp nhỏ gọn — đóng khung mã vạch, đóng khung tiền thu hộ, kẻ đường trang trí.

- **Research** (web/GitHub): tham khảo `parzibyte/print-receipt-thermal-printer`, `cognitom/paper-css`, gist POS receipt → pattern: width 80mm, `<hr>` dashed/dotted, đường đôi `border-top:4px double`, framed box `border:Npx solid`, monospace cho mã, hierarchy cỡ chữ. KHÔNG màu/shadow (máy nhiệt B&W).
- **Bỏ ReceiptLine** (không kẻ khung/box được) → `_buildBillBody(d)` dựng HTML thuần + `BILL_CSS` (thermal 72mm). Khung COD bo góc viền dày, số 30px; "#STT" đóng khung; **khung mã vạch** bo góc; đường `.b-div-dash`/`.b-div-solid`/`.b-div-double` trang trí; "Còn thu (COD)" khung viền đôi. Font Arial 13px gọn (nhỏ hơn cpl-32 cũ → hết "to quá").
- **In path**: `escposRasterFromHtmlPhysical` đo `.bill` 72mm → đúng **576 chấm** (vật-lý-mm). `openPrint` bridge → `printBillHtml` (thay `printSvg` cũ chỉ trích SVG). Nút "In thử" printer-settings: máy bill → `printBillHtml`, máy tem → `printHtml`. Cùng 1 HTML cho bridge raster lẫn hộp thoại iframe.
- **Verified** (Playwright screenshot localhost): bill 272px=72mm, dấu tiếng Việt sắc nét, đủ khung COD + khung mã vạch (bars + HRI) + 3 loại đường trang trí. Ảnh `downloads/n2store-session/bill-redesign.png`.
- **Files**: `web2-bill-service.js` (v=20260605nj12), `web2-printer.js` (v=20260605h, thêm `printBillHtml` + selector `.bill`/`.receipt-wrap`), 4 trang bump version. ReceiptLine.js vẫn load nhưng bill không dùng nữa.

### [web2] Pending-match modal: nút 💬 hội thoại + gợi ý tên KH từ Pancake theo SĐT ✅

User: (1) cho nút mở đoạn hội thoại trong modal "Chọn KH cho giao dịch"; (2) gõ SĐT → gợi ý tên KH tìm từ hội thoại Pancake.

- **Nút 💬 Hội thoại mỗi card** (`w2pm-item-head`): `data-w2pm-chat=extracted_phone` → `Web2ChatReadonly.openSearch({query:đuôi})` → list hội thoại Pancake (avatar + tên FB) để xem quyết định. Modal z-10050 > pending z-9999.
- **Gợi ý Pancake trong custom search** (`_searchPancakeByPhone`): gõ SĐT (≥4 số) → song song TPOS warehouse + Pancake `searchConversations` mọi page → mục "📘 Từ hội thoại Facebook" (tag FB), pick điền full phone (từ `recent_phone_numbers`) + tên FB. recent_phone_numbers = SĐT khách tự gõ trong chat → gán ví đúng người.
- Browser-tested: 200 nút chat (seed đuôi), full phone "0903339588" → FB suggestion "Cherry Linh"; nút chat → 19 hội thoại (gồm đúng Vân Luu 0918779981).
- **Files:** `web2/balance-history/js/web2-pending-match.js` (v=20260605a), `index.html`

### [web2] Balance-history: row CHƯA GÁN KH cũng có nút 💬 (mở tìm rỗng) ✅

User: giao dịch chưa gán KH cũng hiện nút chat (hình 2) nhưng click không search sẵn.

- Render nút `data-action="chat"` cho cả row chưa gán (no-phone, non-NCC) với `data-phone=""`.
- `openChatForPhone`: không có phone → `Web2ChatReadonly.openSearch({})` mở chế độ tìm RỖNG (user tự gõ ≥2 ký tự).
- Browser-tested: 34 nút chat empty-phone trên NO_PHONE filter; click → modal search rỗng (0 kết quả, hint).
- **Files:** `web2/balance-history/js/web2-balance-history-app.js` (v=20260604d), `index.html`

### [web2] In tem TSPL cho máy in tem chuyên dụng (XP-470B) ✅

User xác nhận máy 2 tem là **Xprinter XP-470B**. Research (web/GitHub) → máy tem chuyên dụng nói **TSPL/EPL/ZPL, KHÔNG nói ESC/POS** → path raster GS v 0 không in được. Thêm path TSPL.

- **`tsplFromHtmlPhysical(html, {ss, gapMm})`** trong `web2-printer.js`: render HTML tem → canvas (vật-lý-mm 8 chấm/mm) → mỗi `.barcode-sheet` (66×21mm chứa 2 con tem) thành 1 lệnh `CLS + BITMAP + PRINT 1,1`. Header `SIZE 66 mm,21 mm` + `GAP <g> mm,0` + `DIRECTION 1` + `REFERENCE 0,0` + `DENSITY 10`. BITMAP 1bpp NGƯỢC ESC/POS (bit 1=trắng, 0=đen).
- **`_canvasToTsplBitmap`**: cùng supersample logic (inkLum 165, coverage 0.2, giữ nét) nhưng pack inverted cho TSPL.
- **Routing**: `printHtml('label')` → `_isLabelLang(printer)` (khổ 'label' → TSPL mặc định; override `printer.lang`) → TSPL; else raster vật-lý ESC/POS. Bridge là **TCP relay thuần** nên gửi raw TSPL bytes không cần sửa bridge.
- **Cấu hình máy in**: thêm field **"Khoảng cách giữa 2 tem (gap mm)"** (chỉ hiện khi khổ = Tem nhãn), default 2mm. Lưu `gapMm` + `lang` vào printer data.
- **Verified** (Playwright localhost): TSPL sinh đúng — `SIZE 66 mm,21 mm`, `GAP 2 mm,0 mm`, `BITMAP 0,0,66,168,0,...` (66 bytes/dòng = 528 chấm = 66mm, cao 168 chấm = 21mm), `PRINT 1,1`. totalLen 11199 bytes.
- **Files**: `web2-printer.js` (v=20260604g), `printer-settings/index.html` + 3 trang bump version.
- **Next**: user gán máy XP-470B cho role "In tem" + chạy bridge + in thử. Chỉnh gap nếu nhảy tem (2→3mm).

### [orders][chat] Fix: Gửi tin nhắn hàng loạt báo "(Chưa có sản phẩm)" cho đơn nhiều SP ✅

**Bug**: Đơn khách nhiều sản phẩm, khi "Gửi tin nhắn hàng loạt" (template "Chốt đơn" có `{order.details}`) → tin nhắn ra **"(Chưa có sản phẩm)"** dù bảng vẫn hiện đủ SP.

**Nguyên nhân** (trace `orders-report/js/chat/message-template-manager.js`): `_prefetchViaExcel` xuất 1 file Excel TPOS rồi regex tách SP từ cột "Sản phẩm". Đơn nào parse ra **rỗng** vẫn bị `_orderDetailsCache.set(orderId, {Details:[]})`. Sau đó `_processSingleOrder`/`_buildExtensionQueueForAll` chỉ gọi `window.getOrderDetails` (OData `$expand=Details` — nguồn chuẩn mà BẢNG đang tin) khi `!fullOrder`. Cache rỗng làm `fullOrder` truthy → **bỏ qua OData** → fallback OrderStore (list không có Details) → `products:[]` → "(Chưa có sản phẩm)".

**Fix (Cách 1 — giữ Excel + self-heal)**:

1. **Change1** `_prefetchViaExcel`: `if (!details.length) continue;` — KHÔNG cache đơn parse 0 SP → cache miss → để `getOrderDetails` xử lý.
2. **Change2** Thêm helper dùng chung `_resolveOrderData(order)` (gộp 2 block lặp y hệt ở `_processSingleOrder` + `_buildExtensionQueueForAll`): đổi điều kiện từ `if (!fullOrder ...)` → `if ((!fullOrder || !fullOrder.Details?.length) ...)` để **luôn refetch OData khi cache không có Details dùng được**, + self-heal 1 lần nữa nếu `_convertOrderData` trả products rỗng.
3. **Change3** `_convertOrderData`: giữ `.filter(!IsHeld)` (đúng thiết kế — hàng giữ không vào tin nhắn khách), thêm `console.warn` khi có Details nhưng tất cả IsHeld (soi edge-case hiếm).

**Files**: [message-template-manager.js](../orders-report/js/chat/message-template-manager.js) (`_prefetchViaExcel` ~717, `_resolveOrderData` mới ~781, `_processSingleOrder` ~1114, `_buildExtensionQueueForAll` ~1575, `_convertOrderData` ~504). Tái sử dụng `window.getOrderDetails` ([tab1-merge.js:30](../orders-report/js/tab1/tab1-merge.js#L30)).

**Test**: Node logic harness (`_resolveOrderData` + `{order.details}` gate verbatim) — A) cache Excel rỗng (bug) → 5 SP, 1 OData call, hết "(Chưa có sản phẩm)"; B) cache miss → 5 SP; C) cache 1-SP hợp lệ → 1 SP, **0 OData call** (không regression/perf). **3/3 pass** + `node --check` OK.

### [inbox] KPI đối soát: load đủ khoảng ngày + trừ theo TỔNG MÓN + modal chi tiết ✅

3 cải tiến theo yêu cầu owner (sau khi fix đối soát hoàn 0đ hôm qua):

**1. Load ĐỦ khoảng ngày (bỏ cap 500)**: bảng inbox chỉ load 500 đơn gần nhất → đối soát May trước đây chỉ thấy 13–31/5 (4/12 đơn hoàn). Thêm `ensureRangeLoaded()` phân trang `/load?limit=1000&page=N` tới khi phủ `range.from` → đối soát/card/modal phủ **trọn khoảng** (12 đơn). Tách `rangeOrders` khỏi `SocialOrderState.orders` (bảng vẫn 500 cho nhẹ — 1 đơn ~12.5KB, 2730 đơn ~34MB). Card tự load nền khi đổi bộ lọc ngày (hint "đang tải đủ khoảng…").

**2. Trừ KPI theo TỔNG MÓN hoàn × 5.000đ** (không phải đếm đơn): đã đúng per-món từ trước (`Σ min(SLhoàn, SLmón) × 5000`), bổ sung **đếm `totalMonRefund`/`totalMonKpi`** + hiển thị số món ở breakdown + summary ("17 món gross − 16 món hoàn"). `refundCount` (đơn có hoàn) chỉ để hiển thị, KHÔNG dùng tính tiền. VD tháng 5: 12 đơn có hoàn nhưng **16 món** → loại 80.000đ (đơn #7 hoàn 4 món, #8 hoàn 2 món).

**3. Modal chi tiết** (click thẻ "KPI khoảng đã chọn"): `showDetailModal()` — bảng STT · Nhân viên · Mã phiếu · Khách · Món KPI · Gross · Hoàn (loại KPI) · KPI net, + filter theo NV + tìm mã/khách/STT, summary tổng. Chưa đối soát → cột hoàn/net = gross + cảnh báo.

**Files**: [tab-social-kpi-reconcile.js](../don-inbox/js/tab-social-kpi-reconcile.js) (ensureRangeLoaded/kpiOrderSet/showDetailModal + món count), [tab-social-core.js](../don-inbox/js/tab-social-core.js) (card dùng kpiOrderSet + load nền), [index.html](../don-inbox/index.html) (card clickable). Bump `?v=20260605a`.

**Test**: integration test chạy `run()` thật với refund excel thật + 12 đơn tháng 5 → orderCount=12, totalMonKpi=17, **totalMonRefund=16, totalLoss=80.000đ**, totalNet=5.000đ, refundCount=12, kpiOrderSet=12 (full range), modal không lỗi. **9/9 pass** (đơn #4 gross 2 món nhưng chỉ 1 món hoàn — chứng minh khớp per-món).

---

## 2026-06-04

### [inbox] FIX đối soát KPI báo "hoàn 0đ" — OrderLines phiếu thiếu ProductCode ✅

**Bug**: đối soát KPI Đơn Inbox luôn ra `hoàn 0đ` dù đơn có món bị trả. Root cause: fetch `GetListOrderIds?$expand=OrderLines` — `FastSaleOrderLine` GỐC chỉ có `ProductId/ProductQty/PriceUnit`, **KHÔNG có ProductCode** (xem TPOS docs OrderLine sample). `extractLineCode()` trả rỗng → `matchRefundForOrder` bỏ qua mọi món (skip khi code rỗng) → loại 0đ.

**Verify bug** (offline, dùng data thật): đối chiếu 12 đơn KPI tháng 5 có refund → mã refund khớp `products[].productCode` của social order **100%** → đáng lẽ loại **80.000đ**, không phải 0đ.

**Fix** ([don-inbox/js/tab-social-kpi-reconcile.js](../don-inbox/js/tab-social-kpi-reconcile.js)):

- `$expand=OrderLines` → `$expand=OrderLines($expand=Product)` để OrderLines kèm entity Product (có DefaultCode).
- `extractLineCode`: đọc `line.Product.DefaultCode/Barcode` trước, rồi flat fields, cuối `[CODE]` trong NameGet. `lineQty`: thêm `ProductQty`.
- **`buildMatchDetails(order, lines)`** — HYBRID: ưu tiên OrderLines phiếu (nếu ra được code); nếu KHÔNG có code nào → fallback `order.products[].productCode` (LUÔN có code, đã verify khớp refund). → matching luôn có code, không còn 0đ.
- `updateInboxKpiStatCard`: đơn đã đối soát dùng `rec.grossKpi` (đồng bộ gross/net 1 nguồn món).
- Log `[SOCIAL-KPI] Nguồn món: invoice-lines=X, order-products=Y` để debug.

**Test**: `node --check` pass; integration test chạy `run()` thật với file refund excel thật — Scenario A (OrderLines thiếu code → fallback products → loại 5.000đ ✓), B (OrderLines có Product.DefaultCode → dùng invoice-lines → 5.000đ ✓), C (không refund → 0đ ✓). 5/5 pass.

→ Live page (May 13–31) sau fix: hoàn ≈ 20.000đ (4 đơn) thay vì 0đ. Bump `?v=20260604c`.

### [web2] In tem 2-con: raster theo kích thước vật lý + research giao thức máy in tem ✅

User hỏi setting cho "máy in 2 tem" (in tem mã SP ở web2/products). Khổ tem (2 Tem 66×21mm) chọn ngay trong dialog "In mã vạch" → "Giấy in", KHÔNG phải "Khổ giấy 80/58" của Cấu hình máy in (đó là khổ bill).

- **Vấn đề**: `printHtml('label')` raster theo `dotsWidth` = 576/384 (khổ bill) → tem 66mm bị co nhỏ + dồn trái → in sai. **Fix**: thêm `escposRasterFromHtmlPhysical()` raster theo **kích thước VẬT LÝ** (đo `.barcode-sheet` width mm → ×8 chấm/mm @203DPI). Tem in đúng khổ thật, tự co theo preset tem. printHtml → dùng path này.
- Thêm option **"Tem nhãn (tự co theo khổ tem)"** vào dropdown Khổ giấy (Cấu hình máy in). Files: `web2-printer.js` (v=20260604f), `printer-settings/index.html`.
- **⚠ RESEARCH GitHub/web (quan trọng)**: máy in **receipt** (bill 80mm) nói **ESC/POS** (GS v 0 raster — path hiện tại OK). Máy in **tem chuyên dụng** (Xprinter XP-420B class, Godex, TSC, Zebra) nói **TSPL/EPL/ZPL**, KHÔNG nói ESC/POS → raster GS v 0 **có thể KHÔNG in được** trên máy tem chuyên dụng. Giải pháp đúng nếu máy tem là TSPL: sinh lệnh TSPL trong bridge (`SIZE 66 mm,21 mm` + `GAP 2 mm,0` + `BITMAP` từ canvas + `PRINT 1`) — handle gap sensor + sizing native. Barcode cần ≥7 mils × scale ≥2 cho 203DPI để quét rõ.
- **Next**: user test ESC/POS raster trước. Nếu tem ra trắng/lỗi → máy tem là TSPL → implement TSPL bitmap path trong print-bridge.

### [web2] Chat read-only: hover avatar → phóng to (popup zoom) ✅

User: hover vào avatar phóng to.

- Hover `.w2cro-conv-av`/`.w2cro-bub-av` (có ảnh) → popup `.w2cro-av-zoom` 220px hiện ảnh phóng to bên cạnh avatar, tự clamp trong viewport (phải→trái nếu tràn). Avatar hover scale 1.12 + cursor zoom-in. Avatar chỉ có chữ (ảnh lỗi) → không zoom.
- Delegation mouseover/mouseout trên overlay (list cuộn vẫn chạy). Browser-tested: hover → zoom visible, đúng src.
- **Files:** `web2/shared/web2-chat-readonly.js` (v=20260604f), `index.html`

### [web2] Chat read-only: avatar thật FB (list + thread) ✅

User: thêm avatar vào (list hội thoại đang là chữ-cái).

- Pancake search KHÔNG trả URL ảnh → dùng **Worker proxy** `/api/fb-avatar?id=<psid>&page=<pageId>` (token server-side, an toàn — giống native-orders). Verified proxy trả image/jpeg 200.
- `avatarHtml(name,psid,pageId,cls)`: div chữ-cái nền + `<img onerror="this.remove()">` phủ lên → ảnh thật, lỗi thì còn chữ. psid lấy từ `cust.fb_id || conv.from.id`.
- **List**: mỗi hội thoại có avatar ảnh thật. **Thread**: avatar KH ở đầu mỗi nhóm tin đến (incoming), spacer canh lề các tin sau.
- Browser-tested: 89 hội thoại có avatar ảnh, thread "Ngân Nguyen" avatar incoming OK.
- **Files:** `web2/shared/web2-chat-readonly.js` (v=20260604e), `index.html`

### [web2] In bill: STT lên cạnh tên phiếu + fix cắt chữ SẢN PHẨM/THÀNH TIỀN/TỔNG TIỀN ✅

User: (1) STT ghi số ngay cạnh chữ "Phiếu Bán Hàng" (khỏi chữ "STT"); (2) các chữ "SẢN PHẨM THÀNH TIỀN", "TỔNG TIỀN" bị **thiếu/cắt** do to quá → đẩy xuống dòng lệch.

- **Nguyên nhân #2**: dùng `^` (ReceiptLine `wh=1`) = **double-WIDTH** (rộng gấp đôi, cao bình thường). Ở hàng 2 cột `^SẢN PHẨM|^THÀNH TIỀN`, mỗi bên rộng ×2 → tổng vượt `cpl:32` → lib cắt/wrap lệch chữ. Verified tại `receiptline.js:838` `w = measureText * (wh<2 ? wh+1 : wh-1)` → wh=1 nhân ×2 width.
- **Fix #2**: đổi `^` → `^^` (`wh=2`) = **double-HEIGHT** (cao gấp đôi, rộng BÌNH THƯỜNG) cho `^^SẢN PHẨM|^^THÀNH TIỀN` + `^^TỔNG TIỀN|^^...đ`. Vẫn nổi bật (cao gấp đôi) nhưng KHÔNG tràn cpl → đủ chữ. Đồng bộ với `^^CÒN THU (COD)` đã có sẵn.
- **Fix #1**: STT ghi thẳng số sau tên phiếu: `^^Phiếu Bán Hàng - 313` (merged → `- 84 + 313`). Bỏ STT khỏi dòng "Khách:". `sttDisplay` từ `getMergedSttDisplay()` → support cả single lẫn merged.
- **Files:** `web2/shared/web2-bill-service.js` (v=nj11) + 3 trang load (native-orders, fastsaleorder-invoice, printer-settings)

### [web2] In bill: dấu tiếng Việt rõ hơn — bỏ emphasis + chữ to + supersample raster ✅

User: "các chữ tiếng Việt có dấu in ra bill sẽ có xu hướng bị mờ" + "nhìn bill ở máy tính vậy thôi chứ in ra nó khác". Màn hình ≠ máy in nhiệt 203 DPI: dấu sắc/huyền/ngã/hỏi/nặng + đ/ơ/ư nhỏ → mất nét khi rasterize 1-bit.

- **Bỏ emphasis ReceiptLine (`"`)** trong `_buildReceiptDoc` — emphasis cộng thêm 1 lớp đậm CHỒNG lên CSS `font-weight:900` → chữ dày nhòe mực. Giờ TẤT CẢ cùng độ đậm như "NHI JUDY" ở đầu bill, phân cấp CHỈ bằng kích thước (`^`, `^^`, `^^^`).
- **Chữ to hơn**: `transform(doc, {cpl:32})` (từ 42) → mỗi ký tự rộng hơn → dấu phụ có nhiều pixel hơn để giữ nét.
- **Supersampling raster 2×** trong `web2-printer.js`: render SVG/HTML ở `dots*2` (1152px cho 80mm 576-dot) rồi downsample mỗi block 2×2 → đen nếu ≥1 sub-pixel có mực (`need=max(1,round(0.2*ss*ss))`, `inkLum=165`). Giữ được nét mảnh của dấu tiếng Việt thay vì bỏ qua như render thẳng 1×. Bỏ dilation cũ (supersample thay thế).
- **Stroke nhẹ hơn**: CSS `stroke-width 0.5px` (print 0.6px) thay vì 0.6/0.8 — đủ đậm, không bệt.
- Verified output raster: 576 dots wide (bytesPerRow=72), GS v 0 (29,118,48), height 1779 dots, 128KB.
- **Files:** `web2/shared/web2-bill-service.js` (v=nj10), `web2/shared/web2-printer.js` (v=20260604e)
- **Lưu ý**: nếu in thật vẫn mờ → giải pháp tối thượng là TEXT-mode codepage tiếng Việt (CP1258) trong bridge thay vì raster ảnh (xem research GitHub bên dưới). Cần máy in hỗ trợ codepage VN.

### [web2] Balance-history: nút 💬 mở chat ngay trên row + bỏ icon link/reassign ✅

User: cho nút mở chat ra ngoài row (cạnh ví); bỏ 2 icon (user-plus "link" + user-cog "reassign") vì "+ Gán KH" đã lo.

- **Nút 💬 trên row** (ô actions, KH đã gán): `data-action="chat"` → `openChatForPhone(phone,name)` → resolve `/fb-conversation`; có FB → `Web2ChatReadonly.open`, không → `openSearch` seed tên/SĐT (linh hoạt). Browser-tested: click "Trần Hường" → 21 hội thoại để chọn.
- **Bỏ** icon `data-action="link"` (user-plus) + `data-action="reassign"` (user-cog) khỏi ô actions — "+ Gán KH" (text) vẫn lo gán cho row chưa gán. Verified: 0 leftover.
- **Avatar**: list hội thoại dùng avatar chữ-cái (Pancake search KHÔNG trả URL ảnh — custKeys chỉ `fb_id/id/name`).
- **Files:** `web2/balance-history/js/web2-balance-history-app.js` (v=c), `css/web2-balance-history.css` (v=c), `index.html`

### [web2] Chat read-only: panel tìm hội thoại KH (tên/SĐT/nội dung) — như native-orders ✅

User: cho panel tìm KH theo tên/SĐT/nội dung → chọn hội thoại → như native-orders, linh hoạt.

- **`web2/shared/web2-chat-readonly.js`** rewrite thành 2-pane: trái = ô tìm (debounce 350ms) + list hội thoại (search across MỌI page qua `Web2Chat.searchConversations`, dedup); phải = thread read-only. Click conv → `loadThread` (fetchMessages). Responsive (mobile: list/thread toggle).
- **API mới**: `Web2ChatReadonly.openSearch({query})` mở chế độ tìm; `open({pageId,psid,name})` preload 1 thread.
- **Entry points**: nút "💬 Hội thoại" trên header balance-history (mở search mode); nút "Mở chat" trong modal chi tiết KH — khi KH chưa resolve được FB → mở search seed tên/SĐT (không bí).
- **Browser test**: gõ "Nguyen" → 89 hội thoại; click "Hà Nguyễn" → thread load OK.
- **Files:** `web2/shared/web2-chat-readonly.js` (v=20260604d), `web2/balance-history/js/web2-customer-detail-modal.js` (v=b), `web2-balance-history-app.js` (v=b), `index.html`

### [web2 printer] Lưu máy in lên server + nút tắt/gỡ bridge + in đậm hơn ✅

User: máy in lưu server cho mọi user chọn; thêm file tắt/xóa bridge; in đậm hơn (chữ mỏng bị mờ mực).

- **Máy in lên SERVER**: `web2-printer.js` đổi từ localStorage-only → entity generic `printer` trên server (`/api/web2/printer/*`). Cache localStorage + in-memory cho `getPrinters()` đồng bộ; `loadPrinters/upsertPrinter/removePrinter` async; SSE `web2:printer` sync đa user; migrate list local cũ → server 1 lần. **Gán role (PBH/tem) vẫn LOCAL** (mỗi POS tự chọn từ danh sách chung). Config page async + render lại. Verified: lưu→server→xoá cache→load lại vẫn thấy (mọi máy thấy chung).
- **Nút "Tải file tắt & gỡ (.bat)"**: `tat-print-bridge.bat` — kill tiến trình powershell/wscript chạy print-bridge + xoá `Startup\\N2StorePrintBridge.vbs` + xoá thư mục cài.
- **In đậm hơn**: (1) raster `_canvasToEscpos` nâng ngưỡng 150→176 (bắt pixel xám) + **dilation 1px** (phải+dưới) → mọi nét dày thêm, hết mờ — áp cho cả bill lẫn tem qua bridge. (2) bill SVG `font-weight 700→900` + `stroke 0.45→0.9px` (print 1.1px). Verified screenshot: bill đậm rõ, barcode vẫn nét.

### [web2] Làm giàu kho KH tự động khi bật chat Pancake (mọi trang) ✅

User: bật chat Pancake với KH → nếu fb_id chưa có trong kho thì lưu; áp dụng mọi nơi mở Pancake; mục đích kho đa dạng + load nhanh (biết id/fb/tên/sđt).

- **Shared hook (1 nguồn)** `web2/shared/web2-chat-client.js`: thêm `Web2Chat.enrichCustomer(fbId,{name,phone})` (fire-and-forget, dedup per-session) + hook sẵn trong `fetchConversations`. → MỌI trang load Web2Chat (native-orders, balance-history, tpos-pancake, pancake-settings) tự enrich, không code lại.
- **Backend** `POST /api/web2/customers/enrich-fb`: (1) fb_id đã có → skip; (2) có phone → getOrCreate + linkFbId; (3) không phone → TPOS chatomni/info theo fb_id → upsert + link. Prospect chưa có TPOS → skip (kho key theo TPOS id).
- Nuôi luôn coverage nút "💬 Mở chat" (resolve phone→pageId+psid).
- **Docs**: overview #conventions subsection "Làm giàu kho KH khi bật chat Pancake".
- **Files:** `web2/shared/web2-chat-client.js` (v=20260604c ×4 trang), `render.com/routes/v2/web2-customers.js`, `web2/overview/index.html`

### [web2 printer] Print Bridge 1-click + tự bật khi mở máy + bản PowerShell (không cần Node) ✅

User: cấu hình máy in cho nút tải print-bridge chạy nền tự bật khi khởi động + 1 click file .bat.

- **`scripts/print-bridge.ps1`** — bản PowerShell (TcpListener HTTP→TCP, KHÔNG cần cài Node, dùng sẵn trên Windows). Cùng API /health /print /tcp-test + CORS + `Access-Control-Allow-Private-Network` (fix "bridge chưa chạy" trên HTTPS — Chrome PNA).
- **Nút "Tải file cài đặt (.bat)"** ở trang Cấu hình › Máy in: sinh `cai-print-bridge.bat` (bake `location.origin/scripts/print-bridge.ps1`). Bấm đúp 1 lần → tải .ps1 về `%LOCALAPPDATA%`, tạo `run-hidden.vbs` (powershell -WindowStyle Hidden), copy vào **Startup folder** (tự bật khi đăng nhập, KHÔNG cần admin), chạy ngay. Thêm nút tải `.ps1` thủ công.
- Verified: ps1 web-served 200, nút tải .bat hoạt động, không lỗi JS. (Chạy .bat/.ps1 cần Windows để test thật.)

### [web2] Balance-history: nút "💬 Mở chat" xem hội thoại FB của KH đã gán ✅

User: thêm nút mở đoạn chat KH đã gán (học native-orders), dùng kho KH (sđt/tên/fb_id). Chọn hướng **read-only** (chỉ xem).

- **Backend** `GET /api/web2/customers/:phone/fb-conversation` (`web2-customers.js`): resolve SĐT → `{pageId, psid, name}`. Nguồn: `native_orders` mới nhất có `fb_page_id`+`fb_user_id` (đáng tin nhất), fallback `web2_customers.fb_id`. `found:false` nếu KH chưa có hội thoại FB.
- **Module read-only** `web2/shared/web2-chat-readonly.js`: `Web2ChatReadonly.open({pageId,psid,name})` reuse `Web2Chat`, render bubble (text/ảnh/video/file, in/out theo `from.id===pageId`), tự chứa CSS, KHÔNG ô gửi tin.
- **Nút** "💬 Mở chat" trong header modal chi tiết KH (`web2-customer-detail-modal.js`).
- ⚠️ Giới hạn: chỉ KH từng có đơn/chat FB mới mở được.
- **Files:** `render.com/routes/v2/web2-customers.js`, `web2/shared/web2-chat-readonly.js`, `web2/balance-history/js/web2-customer-detail-modal.js` (v=20260604a), `index.html`

### [web2 extension] Pancake token auto-refresh + cảnh báo sắp hết hạn ✅

User: tối ưu full chức năng `web2/pancake-settings` — gần hết hạn token (≤1 ngày) thì hiện bảng mở pancake lấy token, hoặc lấy bằng extension. User chọn "thêm handler vào extension (auto thật)" + "không cần bấm nút extension".

- **Browser-test xác minh** (cookie pancake từ secrets): JWT pancake ở **cookie `jwt`** (KHÔNG phải `token` như page ghi sai), **không HttpOnly**, KHÔNG ở localStorage. Dùng được `?access_token=` trên `pages.fm/api/v1/pages` (3 pages).
- **Extension** (user duyệt sửa, bump 1.0.25→1.0.26 → auto-republish CWS): `contentscript.js` thêm INBOUND `GET_PANCAKE_TOKEN` + OUTBOUND `GET_PANCAKE_TOKEN_SUCCESS/FAILURE`. `service-worker.js` thêm case `GET_PANCAKE_TOKEN` → `chrome.cookies.getAll({domain:'pancake.vn',name:'jwt'})` → trả token. Đọc cookie nền, **không cần mở tab pancake, không cần bấm nút** — chỉ cần đang đăng nhập pancake.vn.
- **`web2/shared/web2-pancake-token.js`** (mới): `Web2PancakeToken` — `getStatus()` (state none/expired/critical≤1d/soon≤3d/ok), `isExtensionPresent()` (marker `data-n2store-extension`), `fetchFromExtension()` (postMessage bridge + timeout 4.5s), `applyToken()`, `ensureFresh()` (auto lấy token mới khi critical/expired/none).
- **`pancake-settings`**: sửa hướng dẫn cookie sai (`token`→`jwt` + 1-dòng console `copy(document.cookie.match(/(?:^|; )jwt=([^;]+)/)[1])`); thêm nút "Lấy tự động", ext-status pill, banner soon/critical, **modal cảnh báo** (auto-fetch ngầm khi load nếu sắp hết hạn → thành công thì không hiện modal; fail mới hiện modal kèm lý do + manual paste). Thêm `@keyframes spin` (vốn thiếu — loader cũ không quay).
- Verified Playwright 5 scenario: none→modal, critical→modal+banner, soon→banner-only, paste→apply+close, **extension giả lập→auto-refresh ngầm critical→ok không modal**. 0 console error.

### [web2 pancake-settings] Polish giao diện ✅

User: chỉnh lại giao diện cho đẹp hơn.

- CSS refresh (design tokens + depth): header Manrope 800 + icon-chip nền tím soft, card radius 16px + shadow lớp, button gradient tím (primary) + hover lift/shadow + focus ring 3px, input soft→trắng khi focus.
- Page item: card trắng radius 13px + hover translateY/shadow, avatar bo góc 13px (fallback gradient tím), **platform chip** (facebook xanh / instagram hồng-tím), **token chip** monospace, status pill có chấm màu.
- Help box gradient xanh, **danger zone** tách màu đỏ riêng (`.ps-card.danger`). `renderPageList` đổi markup sang chip (bump `?v=20260604b`).
- Verified screenshot 1440/1280: has/no state, danger zone — đúng ý.

User: tiếp tục — in mã SP cần máy tem riêng (khác máy in PBH).

- `web2-printer.js`: tách `_canvasToEscpos` dùng chung; thêm `escposRasterFromHtml` (render HTML trong iframe ẩn rộng đúng số chấm → html2canvas load on-demand → 1-bit → ESC/POS) + `printHtml(html, role)` + `roleIsBridge(role)`. Tiếng Việt OK vì in ẢNH.
- `web2-products-print.js` `generateAndPrint`: nếu role 'label' đã gán máy IP (bridge) + bridge sống → `printHtml(labelHTML, 'label')` in thẳng máy tem; lỗi/tắt → fallback overlay cũ. Load `web2-printer.js` trên trang products.
- Verified E2E: HTML→ESC/POS raster 7.2KB, role 'label'→máy tem (dots 384/58mm), browser→bridge→TCP IP:9100 (fail vì IP test ảo). PBH dùng role 'pbh', tem dùng 'label' → 2 máy riêng đúng ý user.

### [web2] Balance-history: tên KH hiện rõ "click được" (affordance) ✅

User: tên KH click vào xem chi tiết được nhưng không có dấu hiệu trực quan → user không biết click được.

- `.w2bh-customer-name-link`: thêm màu xanh `#1d4ed8` + gạch chân chấm + mũi tên `›` (::after) + cursor pointer + hover đậm. Browser-tested OK.
- **Files:** `web2/balance-history/css/web2-balance-history.css`, `index.html` (css v=20260604b)

### [web2] Quản lý máy in + in thẳng IP:port (không hộp thoại) + gán theo chức năng ✅

User: in qua IP:port máy in mạng + cấu hình ở menu + danh sách nhiều máy in, gán máy khác nhau cho từng chức năng (PBH / tem SP).

- **Print Bridge** (Node, nghe 127.0.0.1:17777): trình duyệt KHÔNG mở TCP được → bridge relay ESC/POS qua HTTP → mở socket TCP tới máy in IP:9100. API /health /print /tcp-test. Chạy trên máy POS: .
- **Web2Printer** : DANH SÁCH máy in (localStorage ) + gán chức năng (: pbh/label). (SVG→canvas→1-bit→GS v 0 raster — tiếng Việt OK vì in ẢNH). chọn đúng máy. Migrate cấu hình đơn cũ.
- **Trang Cấu hình > Máy in** : list máy in (thêm/sửa/xoá/test/in thử) + gán máy cho PBH/tem. Sidebar + WEB2_PAGES.
- **Tích hợp PBH**: tự in THẲNG nếu role pbh gán máy IP (bridge), lỗi → fallback hộp thoại. Verified E2E: raster 90KB (init+GS v 0), browser→bridge CORS OK, bridge→TCP IP:9100 (chỉ fail vì IP test ảo).

### [web2] FIX modal Gán KH seed sai = FT/GD bank ref (>10 số) ✅

Bug user: row `VU THI HUONG ... FT26155100277410 GD 6155IBT1kCM75CHV` → bấm "+ Gán KH" → ô search tự điền `26155100277410` (14 số = mã FT) → "Không có KH nào khớp".

- **Root cause**: `openLinkPrompt` (frontend) seed search bằng `content.match(/\d{5,}/)` → vớ dãy đầu tiên ≥5 số = FT ref 14 số. KHÔNG theo luật canonical (>10 số = không phải SĐT).
- **Fix**: seed bằng `row.extraction_preview` (nguồn canonical backend `extractIdentifier` — chỉ đuôi 5–10 số, đã bỏ FT/GD ref). Không có đuôi hợp lệ → để trống, user gõ tay.
- **Browser test (Playwright)**: FT row → seed `""` (trống ✅); dash-GD row → seed `681703` (đuôi đúng ✅). 0 console error.
- **Files:** `web2/balance-history/js/web2-balance-history-app.js`, `index.html` (v=20260604a)

### [web2-bill] Đánh số SP (nhiều SP dễ đếm) + STT cạnh tên khách ✅

User: nhiều SP thì danh sách ra sao + STT lên cạnh tên khách.

- **Sản phẩm đánh số** `1. 2. 3.…` (tên đậm) + dòng `SL × đơn giá | thành tiền`, có dòng trống giữa các SP → nhiều SP vẫn dễ đếm/đọc. Verified 8 SP: danh sách sạch, scannable.
- **STT cạnh tên khách**: bỏ STT khỏi block META (chỉ còn Ngày), đưa STT lên cùng dòng `"Khách:" <tên> | ^"STT <n>"` (canh phải, đậm).

### [web2-bill] Bố cục lại bill + chữ đậm hơn (chống đứt/mờ khi in) ✅

User: bố cục lại đẹp + chữ in bị đứt/mờ → chỉnh đậm.

- **Bố cục mới** (`_buildReceiptDoc`): phân cấp rõ shop → COD (to nhất) → tên phiếu + barcode → Ngày/STT (2 cột) → Khách (nhãn đậm) → Sản phẩm (header `SẢN PHẨM|THÀNH TIỀN`, item: tên đậm + `qty × giá | tổng`) → Tổng (2 cột phải) → Ghi chú → footer. Kẻ ngang + dòng trống tách section.
- **Đậm hơn**: CSS SVG `text/tspan { font-weight:700; stroke:#000; stroke-width:.6px (print .8); paint-order:stroke fill }` — viền glyph làm béo nét, đầu in nhiệt ăn mực rõ, hết đứt/mờ.
- Fix "PBH SHOP" wrap (bỏ double-width). Verified screenshot: sạch, đậm, phân cấp đẹp.

### [web2-bill] Bỏ nền đen (invert) trên bill — máy in trắng đen ✅

User: đừng cho nền đen sau chữ — máy in trắng đen nên nền đen in ra thành khối đen che chữ.

- Bỏ hết markup invert ReceiptLine (backtick `) ở ô COD / PBH SHOP / CÓ ĐƠN THU VỀ / Còn lại COD. Thay bằng **kích thước lớn (^^^) + đậm ("...")** + đường kẻ khung (-) → vẫn nổi bật mà toàn chữ đen trên nền trắng. Verified screenshot: hết khối đen, COD 180.000 đ vẫn to rõ.

### [web2-bill] Chuyển bill sang ReceiptLine SVG (in sắc nét, hết mờ nhiệt) ✅

User: tìm lib GitHub làm bill → dùng. Chọn ReceiptLine (receiptline/receiptline, 740★, Apache-2.0) — render SVG vector nên in KHÔNG mờ.

- Vendor `web2/shared/receiptline.js` (browser-ready, window.receiptline.transform). Verified VN đầy đủ (đ ễ ử ờ Đắk Nông), barcode CODE128 = vector path + HRI.
- `web2-bill-service.js`: `generateHTML` giờ build ReceiptLine markup (`_buildReceiptDoc` + `_rlEsc`) → `transform(doc,{cpl:42})` → SVG, wrap trong HTML 80mm scale `width:100%`. Canh lề: bare=giữa, `|x`=trái, `x|`=phải, `A|B`=2 cột; ô COD/PBH SHOP dùng invert (nền đen). Giữ nguyên public API (openPrint/openCombinedPrint/generateImage). Fallback `<pre>` nếu chưa load lib.
- Load `receiptline.js` trước `web2-bill-service.js` trên native-orders + fastsaleorder-invoice. Bump bill-service v=20260604nj3.
- Verified browser: SVG render đủ header/COD box/barcode HRI/sản phẩm/tổng/ghi chú, VN sắc nét.

### [render] Trích xuất SĐT từ content SePay — gộp 1 nguồn (badge = matcher) ✅

User: hình 1 (`coc shop nhi judy-GD-387721-...`) badge hiện "Đuôi SĐT: 387721" nhưng "Chưa gán" không ra KH; hình 2 ra list KH. Lý do: badge và matcher dùng **2 extractor khác nhau** → lệch.

- **Root cause divergence**: badge dùng `web2-content-parser.extractPhoneCandidates` (GIỮ dash-GD `-GD-387721`), matcher dùng `web2-content-extractor.extractIdentifier` (line 95 STRIP dash-GD → mất candidate → không tìm KH). User rule: **mọi dãy 5–10 digit đều lấy parse tìm KH**, dash-GD chính là đuôi SĐT khách tự gõ.
- **Fix 1** `web2-content-extractor.js`: bỏ strip `-GD-<digits>` (line 95). Giờ `387721`/`936769` được giữ làm candidate, dashGd prioritization (Step 6) đẩy lên đầu.
- **Fix 2 — 1 NGUỒN**: badge route `web2-balance-history.web2ExtractionPreview` chuyển sang gọi ĐÚNG `extractIdentifier` (hàm matcher dùng) thay vì `extractPhoneCandidates` riêng → badge luôn = matcher. Verified: badge==matcher trên 387721/779981/098183.
- **Docs**: ghi quy ước canonical vào `web2/overview/index.html` #conventions (subsection "Trích xuất SĐT — 1 NGUỒN DUY NHẤT": nguồn duy nhất, luật trích xuất, matcher quyết định).
- **Files:** `render.com/services/web2-content-extractor.js`, `render.com/routes/v2/web2-balance-history.js`, `web2/overview/index.html`

### [web2-bill] Chữ bill đậm/rõ hơn — chống mờ khi in nhiệt ✅

User: bill in ra bị mờ, cho chữ đậm hơn (giải pháp GitHub phổ biến nhất cho in nhiệt).

- `print-color-adjust: exact` + `-webkit-print-color-adjust: exact` (html,body + `*`) — ép browser in màu chính xác, không tự làm nhạt để tiết kiệm mực (fix #1 cho in nhiệt faint).
- `font-weight: 500` base → `@media print` đẩy lên 600, totals 700.
- `-webkit-font-smoothing: none` + `text-rendering: geometricPrecision` — cạnh chữ sắc, đầu in nhiệt render rõ.
- Darken xám faint: `.muted` #444→#1f1f1f, #555→#2a2a2a, #333→#1f1f1f; @media print ép .muted về #000.
- Verified: bill HTML có đủ print-color-adjust/font-weight/@media print/dark grays.

### [web2-products] Fix dropdown biến thể tự mở khi mở modal ✅

`.variant-suggest-dropdown` có `display:flex` đè UA `[hidden]{display:none}` → dropdown LUÔN hiện (kể cả hidden=true) → tự bung khi mở modal. Fix: thêm `.variant-suggest-dropdown[hidden]{display:none !important}` + JS bỏ inline display dùng 1 nguồn hidden attr + reset 2 dropdown hidden khi mở modal. Verified: mở modal cả 2 ẩn, focus ô nào mở ô đó.

### [web2-products] Biến thể chọn Màu + Size cùng lúc ✅

User: trang Kho SP cho chọn 2 biến thể (màu + size) cùng lúc thay vì 1 ô.

- Modal: thay 1 ô `#pmVariant` bằng 2 ô `#pmVariantColor` (🎨 Màu) + `#pmVariantSize` (📏 Size), grid 2 cột. Mỗi dropdown CHỈ show biến thể đúng nhóm (lọc theo groupName: size/cỡ vs màu/color/khác).
- Mã SP gồm CẢ 2: `suggestProductCode` đọc cả 2 ô → overrideColorShort + overrideSizeShort (vd Đỏ+28 → KHOAODO28). Code builder đã hỗ trợ sẵn 2 override.
- Lưu DB `variant` = "Màu, Size" (vd "Đỏ, 28"). Edit: `_setVariantPickers` split ',' + phân loại nhóm → đổ về đúng ô. autoRegen + hint lắng nghe cả 2 ô.
- Verified browser: 2 picker lọc đúng nhóm, code KHOAODO28 (màu=DO size=28), variant "Đỏ, 28".

### [render] FIX webhook SePay Web 2.0 không nhận giao dịch (cột `body` → `raw_data`) ✅

**Triệu chứng:** Trang `web2/balance-history` mất giao dịch SePay sau ~06-03. Web 1.0 (`balance_history` trên chatDb) vẫn nhận; Web 2.0 (`web2_balance_history` trên web2Db) đứng yên.

**Root cause:** Phase 6 cutover DB (06-03 19:49) flip web2 SePay path sang **web2Db**. Bảng `web2_balance_history` trên web2Db dùng cột `raw_data` (canonical — route đã `ADD COLUMN IF NOT EXISTS raw_data`), nhưng `insertWeb2BalanceHistory` lại INSERT vào cột `body` (cũ, chỉ tồn tại trên bản chatDb leftover). → mọi INSERT ném `column "body" of relation "web2_balance_history" does not exist`, bị `_processWeb2Path` nuốt qua retry-queue; webhook handler trả 200 (legacy OK) nên SePay không gửi lại. **276 GD** rớt vào retry queue (268 permanent_failure + 8 pending).

**Files:**

- `render.com/services/web2-sepay-matching.js` — INSERT + ensureSchema `body` → `raw_data`
- `render.com/routes/v2/web2-monitoring.js` — thêm `POST /api/web2/monitoring/retry-queue/replay` reset permanent_failure/pending → pending cho cron replay GD đã rớt

**Recovery sau deploy:** `POST /api/web2/monitoring/retry-queue/replay` → cron `web2-webhook-retry` (mỗi 2 phút) re-insert 276 GD với cột đúng.

### [web2] Photo-studio — Đợt 6: "Chọn đúng món" (tap-to-pick chủ thể bằng MobileSAM) ✅

Khi AI tách nhầm chủ thể (giữ nhầm người/vật phản chiếu/nhiều món), user **chạm 1 phát vào món muốn giữ** → AI cắt chính xác viền món đó, thay cho phần tách sai. Mạnh hơn brush thủ công vì hiểu vật thể.

**Files:** `web2/photo-studio/index.html`, `photo-studio.js`, `photo-studio.css` (v=20260604q), `sw.js` (cache v2)

**Bổ sung (v=20260604q):** nút ✂ **"Tách ra ảnh riêng"** trong thanh chọn món → sau khi chạm chọn, lưu luôn món đó thành PNG nền trong suốt, **cắt sát viền** (bbox + pad 2%), feather theo `state.feather`, honor mirror selfie + AI upscale nếu bật. Pick bar **không đóng** → tách nhiều món liên tiếp. Test: chạm ô 150×150 → file `mon-….png` 168×167, 24016px đục + 4040px trong suốt, 0 lỗi.

- **Engine:** Hugging Face **Transformers.js v3** (`@huggingface/transformers@3.7.1`, jsdelivr ESM) + model **SlimSAM/MobileSAM** `Xenova/slimsam-77-uniform` (~14MB q8). Chạy in-browser, không server.
- **Tốc độ:** probe `navigator.gpu.requestAdapter()` thật → WebGPU fp32 nếu có (nhanh), fallback **WASM q8** (chạy mọi máy, kể cả mobile không WebGPU). Encode khung gốc 1 lần (`get_image_embeddings`) → cache → mỗi cú chạm chỉ decode (nhanh).
- **UX:** nút "Chọn đúng món" trên màn Xem → hiện khung gốc + thanh công cụ [Thêm / Bỏ vùng] + Hoàn tác + Huỷ/Dùng. Chạm = điểm giữ (xanh) / bỏ (đỏ); mask tô xanh preview realtime. "Dùng" → cutout mới = frame ∩ mask (feather theo `state.feather`), cập nhật cả bóng đổ.
- Toạ độ chạm đảo mirror khi selfie. post_process_masks upscale mask về đúng res khung gốc; chọn mask iou cao nhất trong 3 đề xuất.
- SW cache thêm `huggingface.co` + `cdn-lfs` → model tải 1 lần, lần sau offline.
- **Test Playwright (WASM):** chạm vào ô vuông 150×150 (13.9% khung) → mask 13.5% (cắt gần khớp), apply OK, 0 lỗi.

**Status:** ✅ Done.

### [web2] Audit realtime toàn bộ trang menu + phủ SSE còn thiếu + doc overview ✅

User: kiểm tất cả trang menu xem đã có realtime + chức năng chưa, áp dụng cập nhật UI, dùng chung 1 nguồn dữ liệu, thêm vào overview để code mới biết dùng SSE.

- **Audit 38 trang** (5 agent song song): **TẤT CẢ đã REAL** (không trang nào stub). Map realtime: ✅SSE / 🔸legacy(Firestore/WS) / ⚪N-A(report/config/one-shot).
- **Phủ SSE còn thiếu**: product-category + delivery-zone (thêm bridge → page-builder subscribe `web2:<slug>` auto); variants (thêm `Web2SSE.subscribe('web2:variants')`); refund + delivery (backend `refunds.js`/`delivery-invoices.js` thêm `web2RealtimeSseNotify('web2:refunds'|'web2:delivery')` + page bridge+subscribe). Verified live server subscriber: `web2:refunds=1, web2:delivery=1, web2:deliveryzone=1`.
- **Overview** ([web2/overview #realtime]): bảng phủ sóng realtime toàn bộ trang + topic + nguồn 1 nguồn; recipe SSE 2 bước; bản đồ liên kết domain (đơn/NCC/KH/SP). TOC thêm #realtime.
- **Còn migrate SSE**: Sổ Order + Công nợ/Aging NCC (Firestore), Thống kê doanh thu (WS), Chiến dịch Live (TPOS 2-way), Khách hàng (chưa emit).

### [tpos-pancake] Tối ưu kéo-thả SP → đơn (fix feedback CSS + delegation + debounce) ✅

User: kéo SP vào tạo/thêm đơn ở tpos-pancake "không mượt". Root cause tìm ra:

- **Bug chính**: CSS drop-feedback (`inv-drop-hover`/`inv-has-order`/`inv-drop-deny`) chỉ nhắm `.pk-conversation-item` nhưng drop target THỰC TẾ là `.tpos-conversation-item` (TPOS comment list) → **kéo qua row KHÔNG hiện gì** (rename pk→tpos quên update CSS). Fix: thêm selector `.tpos-conversation-item` + pill "➕ Thả vào đây" rõ ràng, bỏ `transform: scale` (repaint subtree row).
- **Delegation**: `attachDragSources` trước attach ~400 listener (2/card × 200) + re-attach mỗi filter render → đổi 1 listener delegation trên `#invList` (idempotent).
- **Debounce**: search input filter 2000 SP + rebuild 200 card mỗi keystroke → debounce 150ms.

**Test pipeline drop→đơn→tính năng** (mô phỏng cart/add như khi thả SP, test customer 0123456788): DROP tạo draft `NJ-...`→ thêm 2 SP (200k) → PBH SHOP trừ ví 187.999 (partial), COD=12.001, carrier='PBH SHOP', badge shop=true/paid=false ✅. Cleanup sạch. Xác nhận đơn tạo từ kéo-thả tpos-pancake chạy đúng mọi tính năng vừa làm (thu hộ ví, PBH SHOP, badge).

### [native-orders] Thu hộ ví khi tạo PBH + badge Đã thanh toán/Đã đối soát + nút PBH SHOP ✅

User: 1/nút PBH SHOP (bán tại shop), 2/đơn được trừ ví → "đã thanh toán" + COD = còn thiếu, 3/đơn đã đối soát → badge "đã đối soát". Quyết định: trừ ví THẬT khi tạo PBH (hủy→hoàn), trừ phần có nếu ví thiếu, đối soát = fulfillment packed+.

- **Thu hộ ví (server-side, atomic)**: `from-native-order` trừ `min(số dư ví, residual)` thật khỏi ví (`web2-wallet-service.processWithdraw`, idempotent theo PBH number), `residual`=COD còn lại, `payment_amount`+=đã trừ. Cột mới `fast_sale_orders.wallet_deducted` để hoàn. Hủy đơn (`/:code/cancel`) → `processDeposit` hoàn lại + zero-out (idempotent). Bill COD tự đúng (đọc `payment.residual`).
- **Badge phái sinh** (KHÔNG thêm status enum — tránh xung đột mutation): `/load` LEFT JOIN PBH đầu (split 1, state≠cancel) → expose `pbhTotal/pbhResidual/pbhFulfillmentState/pbhCarrierName`. Frontend `orderDerivedBadges`: "✓ Đã thanh toán" (residual≤0), "📦 Đã đối soát" (fulfillment ∈ packed/shipped/delivered), "🏪 PBH SHOP" (carrier).
- **PBH SHOP**: nút toolbar (vàng) → `bulkCreatePbhShop` tạo PBH ship=0, carrier="PBH SHOP", vẫn thu hộ ví. Bill: tiêu đề "(SHOP)" + nhãn "🏪 PBH SHOP — BÁN TẠI SHOP". Fix: `from-native-order` INSERT thiếu `carrier_name` → đã thêm `$44` (carrierName từ body giờ mới lưu).
- **Test E2E** (`scripts/test-pbh-wallet-cod.js`, test customer 0123456788): full coverage trừ 150k→COD 0→paid badge→hủy hoàn 150k ✅; partial trừ hết ví→COD còn thiếu→paid=false ✅; SHOP carrier+ship0 ✅. Cleanup sạch (0 đơn test, ví nguyên).

### [web2] Photo-studio — Đợt 5: xử lý hàng loạt + AI upscale ×2 ✅

Hai nâng cấp cuối trong backlog "làm tất cả".

**Files:** `web2/photo-studio/index.html`, `photo-studio.js`, `photo-studio.css` (v=20260604o)

**1. Xử lý hàng loạt (batch)** — nút `layers` ở topbar camera → chọn nhiều ảnh cùng lúc.

- Overlay `#psBatch` lưới thumbnail, mỗi ảnh xử lý tuần tự qua `processOne()` (tách nền + ghép nền/bóng/đẹp/logo ở identity transform + áp khổ xuất & format hiện tại).
- `batchCutout()`: chroma → `keyOut` (không cần mạng); AI → cloud auto → fallback local `@imgly` (KHÔNG dùng mask realtime vì mỗi ảnh khác nhau).
- Nút "Tải ZIP" → lazy-import JSZip (esm.sh) → nén tất cả blob → lưu 1 file.
- Test Playwright: 2 ảnh chroma → 2/2 ô có thumb, ZIP `tach-nen-….zip` tải về OK, 0 lỗi.

**2. AI upscale ×2** — checkbox "Nét hơn ×2" trong nhóm Xuất ảnh (opt-in, mặc định tắt).

- Engine: UpscalerJS UMD + model ESRGAN-slim x2 (`@upscalerjs/esrgan-slim@1.0.0/dist/umd/models/esrgan-slim/src/x2/index.min.js`, global `ESRGANSlim2x`) + tfjs UMD — weights nhúng UMD, không fetch thêm.
- Chặn OOM: chỉ chạy AI khi cạnh dài ≤ 1400px; quá ngưỡng hoặc model lỗi → fallback Lanczos ×2 (resample high-quality 2 bước) nên luôn ra ảnh 2x.
- Áp cho cả `saveReview` (1 ảnh) lẫn batch `processOne`.
- Test: `ai:true`, ảnh 120×150 → 240×300; máy thật dùng backend webgl (headless = `cpu` nên chậm ~1 phút). 0 lỗi, 0 request 404.
- jsdelivr UMD đã nằm trong SW cache-first (`/cdn\.jsdelivr\.net/`) → tải 1 lần.

**Status:** ✅ Done — hết backlog photo-studio.

### [web2] Photo-studio — Đợt 4: brush sửa viền (xóa/khôi phục) ✅

Sửa chỗ AI tách sai (tóc/mesh/đồ phản chiếu). Nút "Sửa viền" → thanh công cụ (Xóa / Khôi phục + slider cỡ cọ + Xong) + con trỏ vòng tròn.

- `paintBrush`: map screen→canvas (rect ratio) → **đảo transform chủ thể** (tx/ty/scale) → toạ độ trong `_cutout`. Xóa = `destination-out` arc; Khôi phục = clip arc + drawImage `_capFrame`. `finishBrush` rebuild silhouette (bóng). Cọ tích hợp vào pointer handlers (brushMode chặn move/scale).
- setBrushMode ẩn compare/căn-giữa/hint, hiện thanh brush; reset khi chụp/quay lại.
- **Fix `[hidden]` bug**: `.ps-brush-bar{display:flex}` đè `[hidden]` → thanh brush che nút toggle (elementFromPoint = psBrushBar). Thêm `.ps-brush-bar[hidden],.ps-brush-cursor[hidden]{display:none!important}`.
- **Test** (Playwright): xóa tại (200,250) đỏ→242 (nền) ✓, khôi phục →đỏ lại ✓, Done ẩn bar ✓, 0 error.
- **Còn lại (cuối)**: xử lý hàng loạt, AI upscale.

**Files**: `web2/photo-studio/{index.html(v=20260604n),photo-studio.js,photo-studio.css}`.

### [inventory-tracking] Fix NCC ẩn không thực sự ẩn hàng (badge đếm đúng nhưng rows vẫn hiện) ✅

**Bug:** Tick ẩn NCC → badge "N NCC ẩn" hiện đúng, nhưng các **hàng SP của NCC đó vẫn hiển thị** đầy đủ. Nguyên nhân: class `ncc-row-hidden` (CSS `display:none`) chỉ do `applyHiddenNccsToDom()` gắn, mà hàm này CHỈ chạy từ SSE handler + toggle — **KHÔNG chạy sau `renderShipments()` lẫn khi expand card**. Card body dựng lazy lúc expand → hàng mới không có class ẩn. Thêm nữa `applyHiddenNccsToDom` đếm badge theo checkbox → card collapsed (chưa có checkbox) bị reset badge về 0.

**Files** (`js/table-renderer.js`, bump `?v=20260604b`):

- `applyHiddenNccsToDom()`: đếm badge từ **map** (`Object.keys(map).startsWith(shipmentId+'_')`) thay vì từ checkbox → đúng cả khi card collapsed; vẫn ẩn/hiện rows cho checkbox đang có (card expanded).
- `_renderCardBody()` (lazy expand): gọi `applyHiddenNccsToDom()` sau khi dựng bảng → NCC ẩn biến mất ngay khi expand.
- `renderShipments()`: gọi `applyHiddenNccsToDom()` cuối hàm → áp ẩn cho card mở sẵn + mọi lần re-render (filter/SSE).

**Verified** Playwright (ship_2026-05-25_d2, 4 NCC ẩn): collapsed badge "4 NCC ẩn" ✓; expand → 25 hàng SP ẩn hết (`stillVisible:0`), 2 NCC còn lại hiện ✓; bấm badge → reveal 25 hàng (mờ/sọc) + badge "Đang hiện 4 NCC ẩn" ✓.

### [web2] Trang cấu hình Phương thức giao hàng (entity `deliveryzone`) + menu Cấu hình ✅

User: "phần cài đặt phương thức giao hàng đâu? được thì cho vào cấu hình ở menu". Trước đó chỉ có OPTIONS hardcoded trong picker, không có trang quản lý.

- **Entity riêng `deliveryzone`** (KHÔNG dùng `deliverycarrier` — entity đó bị TPOS sync ghi đè 7 record `tpos-N` không có keyword/fee). Seed 7 vùng mặc định từ chính `DeliveryMethodPicker.OPTIONS` qua `scripts/web2-seed-delivery-zone.js` (idempotent: create/update). Code = value (`tp-trung-tam`…) khớp giá trị đơn đã lưu.
- **Picker đọc backend**: `fetchFromBackend` đổi URL `deliverycarrier`→`deliveryzone`; `_normalizeFromRecord` thêm `short` + `_parseKeywords` (nhận array HOẶC chuỗi `,`/xuống dòng từ textarea). Verified: getOptionsAsync trả 7 record backend, Bình Thạnh→TP·Trung tâm, Hốc Môn→TP·Ven.
- **Trang cấu hình** `web2/delivery-zone/index.html` (generic CRUD `Web2Page.mount` slug `deliveryzone`): cột Mã/Tên/Nhãn ngắn/Phí/Từ khoá/Chọn tay/Mặc định; form thêm/sửa/xoá đủ field (fee number, keywords textarea, manual+isFallback checkbox) + banner hướng dẫn. Sửa ở đây ăn ngay vào auto-detect Đơn Web.
- **Menu**: thêm "Phương thức giao hàng" (icon truck) vào nhóm **Cấu hình** sidebar + đăng ký WEB2_PAGES.

→ Trả lời user: dropdown TPOS (ảnh) và menu badge của tôi là **cùng 1 danh sách**, chỉ khác `short` label hiển thị gọn.

### [web2] Photo-studio — Đợt 3: before/after + PWA (cài + offline + cache model) ✅

- **Before/after**: nút "Giữ xem gốc" (#psCompare) — pointerdown vẽ `_capFrame` (ảnh gốc) lên reviewCanvas, thả → renderReview (kết quả). Loại trừ khỏi gesture (không cướp drag). Test: composite trắng → giữ = xanh gốc → thả = trắng ✓.
- **PWA**: `manifest.webmanifest` (standalone, portrait, icon logo-emblem, theme #0b1220) + meta apple/theme-color + `sw.js` **scope chỉ /web2/photo-studio/** (KHÔNG đụng site khác). SW: CDN model/lib/scene (mediapipe/esm.sh/googleapis/unsplash/unpkg/staticimgly) **cache-first** (offline + tải 1 lần); app shell same-origin **network-first** (luôn mới). Register trong init. Test: manifest 2 icons ✓, sw.js 200 ✓, SW registered scope đúng + active ✓, 0 error.
- **Còn lại (đợt cuối)**: brush sửa viền, xử lý hàng loạt, AI upscale.

**Files**: `web2/photo-studio/{index.html(v=20260604m),photo-studio.js,photo-studio.css,manifest.webmanifest,sw.js}`.

### [render] Tách Web 1.0 ⊥ Web 2.0 — customers orders + SePay + drop orphan ✅

3 việc hoàn tất separation 2 chiều (nối tiếp inventory-tracking + supplier-debt):

**1. customers.js `/:id/orders` (Web 1.0)**: đọc `native_orders`/`fast_sale_orders` (bảng Web 2.0) trên chatDb → bản leftover rỗng → tab đơn KH luôn trống. Fix: query trên **web2Db match theo phone** (customer_id chatDb khác id-space web2Db). Lookup khách vẫn trên chatDb.

**2. SePay tách Web 2.0 độc lập**:

- `sepay-wallet-operations.js` (Web 1.0): gỡ HẾT mirror ghi `web2_balance_history` (hàm `_syncWeb2BalanceHistory` + 2 call ở transaction phone/hidden + inline `/customer-info`). File giờ chỉ đụng bảng Web 1.0.
- `server.js`: ensureSchema các service web2-\_ (wallet-isolation, sepay-matching, match-audit, webhook-retry, blacklist) đổi `chatDbPool` → `web2Pool` (bảng web2\_\_ tạo trên web2Db, hết tạo leftover trên Web 1.0).
- Web 2.0 SePay vẫn độc lập qua `sepay-webhook-core._processWeb2Path → web2Db` (đã isolated sẵn). `wallet-deposits.js` (WEB2.0) đọc web2Db đúng.

**3. Drop orphan**: boot cleanup DROP IF EXISTS 6 bảng `inventory_*` trên web2Db (leftover từ seed supplier-debt). Guard chặt `web2Pool !== chatDbPool` → không drop nhầm Web 1.0. **Verified**: `services-overview` → web2Db `inventory_* = NONE` ✓; chatDb giữ `inventory_product_images` (Web 1.0 thật, đúng).

> **NOTE (để sau)**: chatDb (Web 1.0) còn bảng Web2-domain leftover — đáng chú ý `web2_balance_history` **~4909 rows** (data thật), + native*orders/fast_sale_orders/web2*\* copies. **CỐ Ý ĐỂ NGUYÊN** (user quyết 2026-06-04): vô hại (không code nào đọc/ghi nữa, Web 2.0 đã sang web2Db), KHÔNG auto-drop vì chatDb là prod + web2_balance_history có data thật. Dọn an toàn nếu cần sau: endpoint admin liệt kê rowCount từng bảng → user confirm → drop có kiểm soát. Chi tiết: MEMORY `reference_chatdb_web2_leftovers.md`.

> Bối cảnh: user yêu cầu Web 1.0 ⊥ Web 2.0 tuyệt đối (không share/đụng gì 2 chiều). Data Web 2.0 đang giai đoạn thử nghiệm → thoải mái, ưu tiên code đúng kiến trúc. Quy ước tên: có "web2" = Web 2.0 (web2Db), không có = Web 1.0 (chatDb).

### [web2] Photo-studio — Đợt 2: di chuyển / phóng to chủ thể trên nền ✅

- State transform `{tx,ty,scale}`; renderReview vẽ nhóm chủ thể (bóng+cutout) trong `save/translate/scale/translate` (nền + logo cố định). Reset mỗi lần chụp.
- **Cử chỉ** (`bindReviewGestures`, Pointer Events trên `#psReviewStage`, `touch-action:none`): 1 ngón kéo → di chuyển (px CSS → px canvas theo ratio); 2 ngón chụm → scale (clamp 0.3–5) + pan theo tâm; throttle rAF. Loại trừ click nút (không cướp click "Căn giữa").
- Nút **Căn giữa** reset transform + hint "Kéo để di chuyển · chụm 2 ngón để phóng to". Thêm nút ⚙ vào màn Xem (mở sheet) + metabar.
- **Test** (Playwright mobile): kéo → chủ thể rời tâm (đỏ→trắng) ✓, Căn giữa → về tâm (trắng→đỏ) ✓, 0 error. Fix pointer-capture nuốt click nút.
- **Còn lại (đợt sau)**: undo/redo + before/after, gallery lịch sử, PWA offline + cache model, brush sửa viền, xử lý hàng loạt, AI upscale.

**Files**: `web2/photo-studio/{index.html(v=20260604l),photo-studio.js,photo-studio.css}`.

### [web2] Photo-studio — Đợt 1 nâng cấp pro: bóng đổ + khổ sàn + auto-đẹp + WEBP + logo ✅

User "làm tất cả" backlog → wave 1 (5 tính năng canvas, low-risk):

1. **Bóng đổ tự nhiên** dưới sản phẩm: silhouette đen của cutout (`buildSilhouette`) vẽ blur+offset dưới chủ thể (`drawShadow`), toggle + slider độ mềm. Chỉ khi nền không trong suốt.
2. **Khổ chuẩn sàn TMĐT** (Shopee 1:1 1000px, TikTok 3:4 1200, Lazada 1:1 1200, FB 4:5 1080): set aspect + `exportPx`; saveReview scale cạnh dài về exportPx.
3. **Tự động đẹp** (1 chạm): `ctx.filter brightness(1.06) contrast(1.08) saturate(1.14)` lên chủ thể.
4. **Xuất WEBP** + thanh chất lượng (PNG/JPG/WEBP, quality slider; PNG ẩn slider).
5. **Logo/watermark shop**: upload (lưu localStorage `ps_logo`) + toggle + 4 vị trí góc, vẽ ở review/export.

- Thêm nút ⚙ vào topbar màn Xem (mở sheet để chỉnh shadow/format/logo khi review). renderReview là nơi ghép: nền → bóng → chủ thể(enhance) → logo; saveReview lo scale khổ + format/quality.
- **Test** (Playwright): shadow minR 196(on)/255(off) ✓, enhance đỏ 221→255 ✓, market meta "→1000px" ✓, WEBP ok ✓, 0 error.
- **Còn lại (đợt sau)**: di chuyển/phóng/xoay chủ thể trên nền, brush sửa viền, undo/redo, gallery, PWA offline, xử lý hàng loạt, AI upscale.

**Files**: `web2/photo-studio/{index.html(v=20260604k),photo-studio.js,photo-studio.css}`.

### [native-orders] Phương thức giao hàng auto-detect 2 lớp + lưu lại + chỉnh tay ✅

User: địa chỉ TPOS nhập nhiều dạng không cố định → auto-detect hay sai. Cần bên thứ 3 (Goong) cross-validate 2 nguồn để tăng tỉ lệ đúng + hiện phương thức giao ở cột địa chỉ, lưu lại, đổi theo địa chỉ hoặc chỉnh tay.

**Method B (Goong proxy)** — `render.com/routes/v2/web2-geocode.js` (mới): `GET /api/web2/geocode?address=` → Goong forward geocode (ẩn `GOONG_API_KEY`), cache in-mem 7d, trả `{province,district,ward,formatted}`. Mount ở `server.js` trước generic `/api/web2`. `GOONG_API_KEY` đã set trên Render.

**Picker nâng cấp** — `web2/shared/delivery-method-picker.js`: thêm `pickOffline` (fuzzy Levenshtein + nhận diện tỉnh/HCM, trả confidence), `geocodeGoong`, `pickRobust` (A+B cross-validate → high khi 2 nguồn khớp, conflict khi lệch). Thêm `short` label cho badge.

- **Fix false-positive**: fuzzy chỉ cho từ ≥5 ký tự (4 ký tự binh/vinh/ninh/dinh collide nặng — vd "Bình Thạnh" HCM bị nhận nhầm tỉnh "Vinh"). Tỉnh tường minh ưu tiên hơn keyword quận mờ → "Đồng Nai" ra SHIP TỈNH thay vì zone HCM.

**UI cột địa chỉ** — `native-orders/js/native-orders-app.js`: badge phương thức giao dưới địa chỉ (màu theo confidence: saved/auto-ok/auto-low/manual). Click → popover chọn tay (manual=true, lưu PATCH) hoặc "↻ Tự nhận lại". Đổi địa chỉ trong sửa đơn → tự detect lại (trừ khi đã manual). Hiển thị detect on-the-fly, KHÔNG tự PATCH lúc render (tránh SSE storm). DB: `native_orders` thêm `delivery_method`/`delivery_method_label`/`delivery_method_manual`; PATCH `/:code` nhận 3 field; `mapRowToOrder` expose. Bulk PBH dùng `pickOffline` (không đốt quota Goong).

### [web2] Photo-studio — 16 nền cảnh có sẵn (biển/thành phố/quê/thiên nhiên/selfie) ✅

User: thêm nền cảnh đẹp + nền selfie để chọn. Thêm `SCENES` (16 ảnh Unsplash CDN — Biển ×2, Thành phố ×2, Nông thôn ×2, Thiên nhiên ×2, Núi, Hoàng hôn, + Selfie ×6: bokeh/tường hoa/cafe/phòng trắng/vườn/sân thượng).

- **CORS-safe**: ảnh từ `images.unsplash.com` (ACAO `*`); load `img.crossOrigin='anonymous'` → vẽ canvas + **export KHÔNG bị taint** (verified). Thiếu cái này thì toBlob/lưu ảnh sẽ fail.
- Chip nền dạng `data-bg="scene"` (thumb 96² q60), chọn → load full 1280px (cache `sceneCache`), set `bgType:'image'` + `bgImage`. Loading overlay khi tải; lỗi mạng → notify, không kẹt.
- Hiện ở cả 2 hàng nền (camera + review), đồng bộ active.
- **Test** (Playwright): 16 scene chip ✓, chọn → corner pixel opaque (nền vẽ) ✓, **exportOk=true tainted=false** ✓, scene active ✓, 0 error.

**Files**: `web2/photo-studio/{index.html(v=20260604j),photo-studio.js,photo-studio.css}`. (Cần mạng để tải nền cảnh — như cloud cutout; cache sau lần đầu.)

### [web2] supplier-debt — cắt sạch coupling TPOS/inventory_shipments (Web 1.0) ✅

**Vấn đề**: trang Web 2.0 supplier-debt còn 2 sợi bám Web 1.0: (1) route `/api/web2/supplier-debt/aggregate` đọc bảng `inventory_shipments` (Web 1.0) → trả 5 NCC GIẢ (rác seed `web2-seed-supplier-debt-from-soorder.js`); (2) frontend fallback gọi TPOS `PartnerDebtReport`. Phần lõi trang đã độc lập sẵn (tính client-side từ Firestore `web2_so_order` + `web2_supplier_wallet`), 2 coupling kia chỉ lòi ra khi bật toggle "TPOS". User quyết: **bỏ sạch TPOS**.

**Đã làm**:

- Frontend `web2/supplier-debt/js/supplier-debt-app.js`: gỡ `TPOS_API_BASE`, `tposData`, `tposCongNo`, `sourceTpos`, `loadTpos()`, `loadTposCongNo()`, `isoTpos()`, `buildTposCongNoEntries()`, block merge TPOS trong `aggregate()`, badge TPOS, nhánh detail TPOS, toggle handler. `node -c` OK, grep tpos sạch (chỉ còn tên CSS theme `tpos-theme` — UI, không phải data).
- `web2/supplier-debt/index.html`: xóa filter group "Nguồn" (checkbox sdSourceWeb2 + sdSourceTpos). Web 2.0 là nguồn duy nhất, luôn load (JS fallback `?? true`).
- Backend: xóa route `render.com/routes/v2/web2-supplier-debt.js` + unmount trong `server.js` (`node -c` OK).
- Xóa 2 script cầu nối: `scripts/web2-seed-supplier-debt-from-soorder.js`, `scripts/web2-seed-inventory-shipments.js`.
  → supplier-debt giờ 100% Web 2.0: chỉ `web2_so_order` + `web2_supplier_wallet`. 0 coupling Web 1.0.

**Còn tồn (flag user)**: (a) bảng `inventory_*` copy orphan trên web2Db (vô hại, có thể DROP cho sạch — destructive nên chờ user); (b) `render.com/routes/v2/customers.js` (Web 1.0) còn đọc data `web2_*` → vi phạm chiều ngược lại, cần xử riêng.

### [render] FIX mất data inventory-tracking — revert pool web2Db → chatDb (Web 1.0 ⊥ Web 2.0) ✅

**Triệu chứng**: `http://localhost:8080/inventory-tracking/index.html` mất sạch dữ liệu (NCC, đặt hàng, nhập hàng, công nợ).

**Nguyên nhân**: commit `dcf4ac261` đổi `render.com/routes/v2/inventory-tracking.js` `getDb()` từ `chatDb` → `web2Db || chatDb` cho "nhất quán với supplier-debt/aging/360 (Web 2.0 đọc web2Db)". Nhưng **inventory-tracking là module Web 1.0** (page không prefix web2; nằm trong `/api/v2/*` core Unified Customer 360) → data thật ở `chatDb`. Đổi pool làm route đọc bản copy seed thiếu/stale trên web2Db → "mất" data (data chatDb chưa hề bị xóa; `admin-web2-data-reset.js` có guard từ chối nếu `db===chatDb`).

**Fix**:

- `getDb()` → `return req.app.locals.chatDb;` (thuần, KHÔNG fallback web2Db).
- Sửa 3 comment gây hiểu lầm (router.use ensureInventorySchema + ensureInventorySchema) khớp chatDb. `ensureInventorySchema` chạy trên chatDb = no-op vô hại (bảng/cột đã có sẵn) — giữ làm safety net.
- `node -c` OK.

**Quy ước ghi vào CLAUDE.md (rule 5b) + MEMORY (reference_db_pools.md)**: tên có `web2`/`web 2.0` → Web 2.0 (web2Db); tên KHÔNG có → Web 1.0 (chatDb thuần). **Web 1.0 ⊥ Web 2.0: KHÔNG share DB/pool/table/state/collection/topic bất cứ gì.** KHÔNG đổi pool module Web 1.0 sang web2Db để "đồng bộ" với Web 2.0.

**Cross-dependency còn tồn (chờ user quyết)**: `web2-supplier-debt.js` (Web 2.0) đọc trực tiếp `inventory_shipments`/`inventory_suppliers` (bảng Web 1.0) từ web2Db copy → sau revert sẽ stale dần. Đúng quy ước: supplier-debt nên lấy qua API Web 1.0 hoặc build pipeline Web 2.0 riêng.

### [web2] Photo-studio — withoutbg xoay tua 11 key (free ~550 ảnh/tháng) ✅

User bỏ 11 key withoutbg → làm rotation. `web2-cutout-service.js`: đọc `WITHOUTBG_API_KEYS` (phẩy ngăn, fallback `WITHOUTBG_API_KEY`), `withoutbgCutout` xoay tua failover — dùng key sticky hiện tại; gặp 401/402/403/429 (hết quota) → thử key kế trong cùng request; bám key chạy được cho lần sau; hết sạch → dịch base + throw (frontend tự fallback @imgly). `/status` thêm `withoutbgKeys` (số key).

- 11 key × 50/tháng = **~550 ảnh/tháng free**, full HD, no watermark.
- **Verified**: rotation mock (keyA 402→keyB ok, không skip, sticky) ✓; **1 key thật LIVE → HTTP 200, trả cutout 9580 ký tự base64** ✓ (xác nhận key `sk-...` hợp lệ + endpoint base64 đúng).
- Render env `WITHOUTBG_API_KEYS` đã set (11 key, PUT 200). Secrets file gộp 11 dòng bare → 1 dòng `WITHOUTBG_API_KEYS=`.

**Files**: `render.com/services/web2-cutout-service.js`.

### [web2] Photo-studio — Cloud HD chuyển sang withoutbg (free 50/tháng, no watermark) ✅🔄

Research phổ biến + free tier: **withoutbg.com** thắng — free 50 ảnh/tháng (rolling), **full HD, KHÔNG watermark**, Apache-2.0 (self-host được sau). Hơn hẳn remove.bg free (0.25MP preview), PhotoRoom sandbox (watermark), fal (hết balance). rembg vẫn là self-host phổ biến nhất (~23k★) nhưng cần Python infra.

- **Backend**: thêm engine `withoutbg` vào `web2-cutout-service.js` (`POST api.withoutbg.com/v1.0/image-without-background-base64`, header `X-API-Key`, JSON in/out base64, key `WITHOUTBG_API_KEY`) + route `POST /api/web2/cutout/withoutbg`. `/status` thêm `withoutbg`.
- **Frontend**: engine "Cloud HD" giờ gọi `/withoutbg` (thay /birefnet fal hết balance); auto-fallback @imgly khi lỗi/hết quota. Note cập nhật "free 50 ảnh/tháng".
- **Test** (mock): /status engines.withoutbg ✓, /withoutbg trả PNG dataURL ✓, syntax OK.
- **⚠ CẦN USER**: lấy key free tại https://withoutbg.com → `serect_dont_push.txt` block withoutbg + Render env `WITHOUTBG_API_KEY` + deploy. Chưa key → Cloud HD 503 → fallback @imgly (vẫn chạy free).
- Routes photoroom/birefnet vẫn giữ (fallback/tương lai).

**Files**: `web2/photo-studio/{index.html(v=20260604h),photo-studio.js}`, `render.com/{services/web2-cutout-service.js,routes/web2-cutout.js}`.

### [web2] Photo-studio — "AI nhanh" nâng cấp MediaPipe Tasks Vision ImageSegmenter ✅

Research GitHub/docs: bản `@mediapipe/selfie_segmentation` cũ đã deprecated. Thay bằng **Tasks Vision `ImageSegmenter`** (GPU delegate WebGL2, sub-3ms vs ~100ms CPU).

- **Engine mới** (`initSegmentation` async): import `@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs` từ jsDelivr + `FilesetResolver.forVisionTasks(.../wasm)` + `ImageSegmenter.createFromOptions({baseOptions:{modelAssetPath: selfie_segmenter float16, delegate: iOS?'CPU':'GPU'}, runningMode:'VIDEO', outputConfidenceMasks:true})`. iOS Safari dùng CPU delegate (bug GPU #6142). **Legacy giữ làm auto-fallback** (`initLegacySeg`).
- **Tối ưu perf**: gửi khung **downscale ≤256px** (`segInputFrame`) cho segmenter → nhanh + mask nhỏ (loop alpha rẻ). Dùng **confidence mask** (0..1) → alpha mềm viền đẹp hơn category mask. BỎ `getImageData` readback mỗi frame ở mode AI (build mask qua `createImageData/putImageData`). `mask.close()` mỗi frame tránh leak.
- **Hợp nhất** qua `populateMaskC(srcMask, mw, mh)` (crop+scale+feather vào `maskC` preview-res) — composeAI/makeCutout giữ nguyên, dùng chung 2 engine. `segmentForVideo(input, performance.now(), cb)` sync VIDEO mode (không cần busy gate).
- **Test** (Playwright fake-cam + swiftshader): engine tasks load OK, chạy 8 FPS (software GL headless; máy thật GPU ~30-60fps), model loaded (loading ẩn), capture AI nhanh→review OK, 0 error.

**Files**: `web2/photo-studio/{index.html(v=20260604g),photo-studio.js}`.

### [orders] product-warehouse: tìm kiếm theo MÃ + TÊN, đổ thẳng vào bảng — fix triệt để (bỏ dropdown) ✅

**Files:** `product-warehouse/js/main.js`, `product-warehouse/index.html` (bump `main.js?v=20260604g`)

**Yêu cầu user:** ô tìm kiếm SP "đang tìm theo tên" → thêm tìm theo mã + tên, kết quả hiện thẳng lên bảng, không cần dropdown. Bug user báo: gõ `B2694` bảng vẫn hiện TẤT CẢ sản phẩm.

**Root cause:** TPOS `GetViewV2` **âm thầm bỏ qua `$filter`** (verified 2026-05-26). MỌI handler (gõ, Enter, nút, phân trang, sort, filter) đều gọi `fetchProducts` → TPOS → search server-side trả về full set. Path lọc đúng duy nhất là client-side cache (`_allTemplatesCache`) — mà cache warm ~10s, nên gõ trong vài giây đầu = bảng không lọc.

**Fix triệt để (3 lớp):**

1. **Centralize routing trong `fetchProducts`:** khi có search term + tab template/variant → KHÔNG đụng TPOS nữa. Cache warm → `renderFromCacheBySearch()` (lọc in-memory tức thì). Chưa warm → `fetchProductsFromRender()`. Mọi caller (phân trang/sort/Enter/nút/filter) tự động đúng.
2. **`fetchProductsFromRender()` mới:** dùng Render DB list endpoint `GET /api/v2/web-warehouse?search=...&viewType=...` — Postgres ILIKE indexed theo `product_name/product_code/parent_product_code/variant/name_get/barcode` + aggregate template + pagination. Nhanh (<500ms), đúng. Tab template auto `active=true` (mirror "Sản phẩm").
3. **Warm cache nhanh + sớm:** `fetchAllTemplatesRaw()` fetch các trang PARALLEL (Promise.all) → ~4000 row về trong ~2-3s thay vì ~10s sequential; thêm in-flight de-dupe; prefetch fire sớm (idle timeout 6s→1.5s). Sau ~2-3s mọi keystroke là 0-latency client-side.

- Gỡ dropdown gợi ý: bỏ `searchProductsSuggestion()` + `displaySuggestions()` + `_suggestionTimer`; `input` chỉ còn `hideSuggestions()` + lọc bảng live.

**Verify (Playwright, localhost, login thật):**

- Gõ `B2694` NGAY khi load (cache cold) → 1.2s ra đúng 1 row (Render fallback, 1 network call).
- Sau warm: `B2700` → 1 row, KHÔNG thêm network (instant cache); `SET ÁO` → 612 SP.
- Clear → 4041 SP active. Dropdown không bao giờ hiện.

### [inbox] KPI Đơn Inbox — gate phiếu đã chốt + đối soát trừ hàng trả ✅

KPI page Đơn Inbox tính lại đúng nghiệp vụ (trước đây chỉ `Σ totalQuantity đơn status='order' × 5.000đ`, bỏ qua phiếu thật + không trừ refund).

**Nghiệp vụ mới** (chốt với owner):

- **Gate**: đơn tính KPI khi VỪA `status='order'` VỪA có phiếu bán hàng TPOS **đã chốt** (`ShowState ∈ {Đã xác nhận, Đã thanh toán, Hoàn thành}`) và **chưa hủy** (loại `cancel`/`IsMergeCancel`/`Huỷ bỏ`).
- **KPI gross** = Σ (Quantity line item thực trên phiếu TPOS) × 5.000đ.
- **Đối soát**: nút "Chạy đối soát KPI" → lấy Excel món trả 3 tháng (TPOS `ExportFileDetail?type=refund`) → loại KPI **per-MÓN** đã bị trả (trừ `min(SL hoàn, SL phiếu) × 5.000đ`, khớp theo code). KPI net = gross − loss.
- **Hiển thị**: thẻ KPI tổng (gross→net + dòng loss), breakdown theo nhân viên (người tạo phiếu `UserName`), cột "KPI" từng dòng (gross preview → net + badge `−Xđ ↩` sau đối soát).

**Engine** mirror "Đối soát KPI" của orders-report (xem [docs/orders-report/DOI-SOAT-KPI.md](orders-report/DOI-SOAT-KPI.md)) nhưng nguồn MÓN = OrderLines phiếu (bulk `GetListOrderIds?$expand=OrderLines`, lấy code+qty fresh vì cache `order_lines` đã drop ProductCode). 3 helper refund (`fetchRefundDetailByInvoice`/`parseRefundChiTiet`/`matchRefundForOrder`) port từ tab-kpi-commission.js. Token TPOS dùng `window.tokenManager` (đã có trên trang inbox), **không hardcode creds**. CHỈ ĐỌC TPOS, không ghi DB (tuân MEMORY `feedback_api_scope`). Module ISOLATED — không sửa tab-kpi-commission.js.

**Files**:

- NEW `don-inbox/js/tab-social-kpi-reconcile.js` — `window.SocialKpiReconcile` (run, qualify, getQualifyingInvoice, grossQtyFromCache, getOrderKpiCell, renderSellerBreakdown) + `window.socialKpiQualify`.
- `don-inbox/js/tab-social-core.js` — `updateInboxKpiStatCard()` gate mới + gross-from-cache + net từ reconcile + dòng `#inboxKpiLoss`.
- `don-inbox/index.html` — nút `#btnSocialKpiReconcile`, `#socialKpiSellerBreakdown`, `#inboxKpiLoss`, cột `th[data-column="kpi"]` + checkbox modal, script include.
- `don-inbox/js/tab-social-table.js` — ô cột KPI mỗi row (`getOrderKpiCell`).
- `don-inbox/js/tab-social-column-visibility.js` — đăng ký cột `kpi: true`.

**Verify**: `node --check` 4 file pass; VM unit test (mock `window`+store) logic case pass (gate Nháp/hủy/draft-status loại đúng, gross từ line items + fallback totalQuantity, cell gross preview, post-đối-soát net + badge loss + tooltip món hoàn). Live test (browser session + refund TPOS thật) cần môi trường auth của owner.

Status: DONE (chờ live-verify trên prod sau deploy).

### [orders][render] soluong-live: tối ưu ảnh (resize proxy) + đổi ảnh đẩy lên TPOS ✅

**Tối ưu tốc độ load ảnh:** proxy `/image/:id` trước stream ảnh gốc TPOS ~1-2MB → load hàng loạt rất chậm. Thêm `?w=<width>` → sharp resize + WebP q78 (~20-80KB, nhanh ~20×), cache 7 ngày immutable (URL có ?v= version). soluong-live render thumbnail: index preview `w=400`, grid list `w=700` + `loading=lazy` + `decoding=async`. Ảnh gốc giữ nguyên khi không có ?w. (render.com/routes/v2/web-warehouse.js — cần deploy Render.)

**Đổi ảnh ở soluong-live = đổi luôn trên TPOS:** `saveImageChange` ngoài cập nhật cart Firebase giờ đẩy ảnh lên TPOS template qua `ProductTemplate/ODataService.UpdateV2` (cùng cơ chế product-warehouse: GET full template + giữ nguyên variants/attrs/uom/combo/supplier, chỉ set `Image=base64`), rồi gọi `notify-image-update` để Render re-sync + SSE → mọi trang tự lấy ảnh mới. Base64 từ paste/upload/camera; URL ngoài fetch→base64 best-effort. Cần `tokenManager` (đã có). Dry-run payload template 119779: giữ 3 biến thể/1 attr/1 uom, strip hết object expand, 9KB — đúng shape UpdateV2.

### [web2] Photo-studio — tăng tốc: mặc định AI nhanh + AI nét model nén quint8 ✅

User hỏi tốc độ → benchmark (Playwright, headless WASM = worst-case không GPU):

- Phông xanh: ~0,4s | Đổi nền (review): 41ms | AI nhanh: ~3,5s WASM (≈tức thì khi có GPU) | AI nét @imgly cũ: 17s cached.
- Tối ưu: (1) **mặc định mode 'ai' (AI nhanh)** thay 'hq' — chụp ≈ tức thì trên máy có GPU; (2) `localCutout` dùng `{model:'isnet_quint8'}` (model nén nhỏ/nhanh) → tải nhẹ hơn + nhanh hơn (~17s→14s WASM cached; máy GPU nhanh hơn nhiều).
- Đo lại: default mode = ai ✓; AI nhanh 3,4/3,6s WASM; AI nét quint8 18,6s(1st gồm tải)/14s cached WASM; 0 error.
- Lưu ý device: số trên là WASM (không GPU). Máy/điện thoại đời mới có WebGPU: AI nhanh realtime mượt + chụp tức thì, AI nét ~2-4s.

**Files**: `web2/photo-studio/{index.html(v=20260604f),photo-studio.js}`.

### [orders][warehouse] soluong-live khớp ảnh product-warehouse + khôi phục dropdown tìm kiếm ✅

**1/ soluong-live tham chiếu product-warehouse (đồng bộ tên/ảnh/SL):** cùng nguồn web_warehouse + SSE realtime TPOS (đã làm trước). Bổ sung **fallback ảnh TPOS-direct giống product-warehouse**: khi web_warehouse chưa có ảnh nào cho template (vd SP mới), `warehouse-realtime.js` gọi `ProductTemplate(id)?$expand=ProductVariants` qua `window.tokenManager` lấy `ImageUrl` template (cache/session, graceful nếu không token). Chuỗi ảnh giờ khớp product-warehouse 100%: ảnh biến thể → ảnh sibling → ảnh template TPOS-direct → placeholder. Thêm `token-manager.js` vào 2 trang soluong-live. Bump module `?v=20260604d`.

- Verify: `tokenManager` load OK trên soluong-live (`hasAuthFetch:function`); 2 template còn trống ảnh (119491, 119624) → TPOS-direct trả '' (TPOS thật sự không có ảnh) → placeholder hợp lệ, giống product-warehouse.

**2/ Khôi phục dropdown gợi ý product-warehouse:** commit 2026-05-26 (abb283641) đã gỡ dropdown (chỉ render bảng). User yêu cầu đưa lại. Khôi phục block gợi ý trong input handler (`searchProductsSuggestion` + `displaySuggestions`, debounce 200ms, chạy song song live-filter bảng) + revert CSS `.search-suggestions` (bỏ `display:none`). Bump `?v=20260604a`. Verify: gõ 'Q686' → dropdown hiện 3 item (Q686D/N/T) có ảnh.

### [so-order][web2] supplier-debt reseed KHỚP Sổ Order ✅

User: "xóa supplier-debt cho chuẩn với so-order mới tạo". `scripts/web2-seed-supplier-debt-from-soorder.js`: đọc Firestore `web2_so_order/main` → gom rows theo NCC → `tong_tien_hd = Σ(costPrice × qty)`. Wipe inventory_shipments + seed 1 shipment/NCC khớp **chính xác** Sổ Order (paid=0 vì so-order không có thanh toán → debt = full owed). Verify supplier-debt = ADIDAS 2.61M, HƯƠNG CHÂU 2.35M, B4 2.34M, QUẢNG CHÂU 2.27M, HÀ NỘI 1.89M — đúng tổng cost từng NCC trong Sổ Order.

### [render][web2] inventory-tracking → web2Db + reseed supplier-debt theo kho ✅

**Audit chatDb (user yêu cầu "search chatDb"):** Mọi route Web 2.0 "thuần" đã dùng đúng `web2Db || chatDb`. Chỉ `inventory-tracking.js` còn bare `chatDb` → lệch DB: nó ghi chatDb, nhưng supplier-debt/aging/360 (Web 2.0) đọc **web2Db** (bản copy stale từ Phase 5) → supplier-debt luôn show data cũ. (`purchase-orders`, `delivery-assignments` = Web 1.0, chatDb đúng. `sepay-wallet-operations` = cầu nối Web1→2 có chủ đích.)

**Fix (user chọn "chuyển inventory-tracking sang web2Db"):**

- `inventory-tracking.js`: `getDb` chatDb → `web2Db || chatDb`. Cả module nhập hàng + supplier-debt/aging/360 cùng web2Db.
- Thêm `ensureInventorySchema` (router.use, cached): web2Db chỉ có bản copy `inventory_shipments` (CREATE TABLE AS — thiếu `inventory_suppliers`/related/FK) → self-heal CREATE TABLE IF NOT EXISTS toàn bộ `inventory_*` + cột post-047 (dot_so/thanh_toan_ck/ti_gia/anh_san_pham/ghi_chu_admin).
- `admin-web2-data-reset`: thêm `target=inventory` (TRUNCATE CASCADE 6 bảng inventory*\*, backup \_bak*).
- `scripts/web2-seed-inventory-shipments.js`: wipe + seed 5 NCC shipment theo kho SP (san_pham từ web2_products, thanh_toán 1 phần → debt scenario). ⚠ **dot_so RIÊNG mỗi NCC** vì POST inherit `thanh_toan_ck` theo `WHERE dot_so=$1` (không theo ngày/NCC) → dùng chung dot_so lẫn payment.

**Verify:** supplier-debt + supplier-aging show đúng 5 NCC (ADIDAS nợ 3.82M chưa trả, HƯƠNG CHÂU nợ 0 trả đủ, HÀ NỘI/QUẢNG CHÂU/B4 trả 1 phần). inventory-tracking page đọc web2Db (data có, hiện theo đợt/ngày). **Status:** ✅ Done.

### [web2] Photo-studio — chèn nền: preset studio + nền đã lưu + chọn nền trên camera ✅

User: "không phải tách nền mà chụp chèn nền khác vào" → tối ưu phần thay nền (chọn 1,3,4).

- **Nền preset studio (8 gradient)**: studio trắng/xám radial/kem ấm/hồng/xanh dịu/bạc hà/nắng/tối sang. Vẽ procedural (linear+radial gradient) qua `drawPreset`, chip preview = CSS gradient. `bgType:'preset'` + `state.bgPreset`. Bấm 1 cái ra ảnh SP đẹp, không cần tải ảnh.
- **Chọn nền TRÊN màn camera** (`#psBgRowCam`) + màn Xem (`#psBgRowReview`) — JS render chung `bgRowHTML()`, đồng bộ active 2 hàng qua `state.bgKey`. Ở mode AI nhanh/Phông xanh, nền hiện **live** ngay khi chụp; AI nét hiện ở màn Xem.
- **Lưu nền riêng dùng lại**: upload ảnh nền → `FileReader` → lưu `localStorage ps_saved_bgs` (cap 8) → chip có nút xóa (×). Dùng lại các lần sau. Auto-select sau khi upload.
- Refactor: bỏ chips hardcode + `pickBg`, thay bằng `renderBgRows`/`onBgChip`/`selectBg(key)` (key: transparent|blur|color:#hex|preset:id|saved:id). Input color/file dùng chung (hidden, chip gọi `.click()`).
- **Test** (Playwright Pixel7 + fake cam): 2 hàng render 14 chip (8 preset) ✓, chọn preset camera→đồng bộ review ✓, capture chroma→review vẽ gradient (pixel góc [211,217,224]) ✓, saved bg seed→render 2 hàng + xóa cập nhật localStorage ✓, 0 error. Screenshot xác nhận hàng nền trên camera đẹp.

**Files**: `web2/photo-studio/{index.html(v=20260604e),photo-studio.js,photo-studio.css}`.

### [orders] soluong-live realtime TPOS — tên/hình/số lượng cập nhật liền (giữ logic biến thể) ✅

TPOS đổi tên/hình/số lượng SP → trang `soluong-live/index.html` + `soluong-list.html` cập nhật liền không cần refresh. Tận dụng pipeline có sẵn: TPOS Socket.IO listener (Render `services/tpos-socket-listener.js`) đã sync `web_warehouse` + broadcast SSE topic `web_warehouse` (`sync_complete` + `templateIds`, `image_update`, `deactivated`). Trước đây soluong-list chỉ **toast** khi `sync_complete` (không refresh data); main.js (index) không nghe SSE.

- **Mới**: `soluong-live/js/warehouse-realtime.js` — module dùng chung (`window.SoluongWarehouseSync.start({database,getProducts,isSyncing,onUpdated,toast})`). Nhận SSE `web_warehouse`, gom theo template (1 fetch/template), re-fetch `WarehouseAPI.getProductAsTpos()` lấy data tươi + tất cả biến thể anh em, map theo variant `Id`, cập nhật `NameGet/imageUrl/QtyAvailable` → ghi Firebase RTDB → mọi tab/máy tự update. **Logic biến thể: GIỮ NGUYÊN `soldQty`, recompute `remainingQty = QtyAvailable - soldQty`** (clamp sold nếu vượt tồn mới). Debounce 1.5s, throttle refresh-all 8s khi sync lớn (incremental/full không kèm templateIds).
- **soluong-list.js**: thay `setupImageSSE` (cũ chỉ refresh ảnh) → delegate sang shared module; xoá `refreshProductImages` cũ.
- **main.js**: thêm `setupWarehouseSSE()` (trước đây index không có SSE) + cleanup `beforeunload`; thêm cache-bust ảnh `?v=lastRefreshed` cho preview-image (trước chỉ soluong-list bust).
- **HTML**: load `js/warehouse-realtime.js?v=20260604a` sau `warehouse-api.js` ở cả 2 trang.
- **Verify**: cả 2 trang `syncLoaded:true` + log `[WarehouseSync] Listening web_warehouse SSE`; SSE hub stats `web_warehouse` 18 clients (topic proven); API `/product/154875` trả product + 3 biến thể đủ field (name_get/image_url/tpos_qty_available). KHÔNG ghi data giả vào prod (chỉ re-fetch truth).

#### Backfill data cũ + reconcile-on-load (follow-up cùng ngày)

Cart hiện có **331 SP / 142 template** được thêm TRƯỚC khi có SSE → snapshot Firebase cũ, không khớp TPOS mới. SSE chỉ bắt thay đổi đi tới, không tự sửa data cũ.

- **Backfill 1 lần** (qua browser session, ghi truth — không phải data giả): re-fetch 142/142 template (0 missing), dedupe theo template, **220/331 SP bị lệch đã sửa**, 1318 field ghi 1 batch `ref().update()`. Verify: 4 SP mẫu khớp TPOS (qty/name), `soldQty` giữ nguyên (vd 156024 sold=1 qty=5 rem=4), `remainingQty = qty − sold` đúng.
- **Ảnh biến thể fallback ảnh sản phẩm** (): biến thể KHÔNG có ảnh riêng (vd [Q686T] Trắng) giờ lấy ảnh template (sibling đầu tiên có ảnh, vd [Q686D]). Áp ở cả add-flow (main.js) lẫn refresh (warehouse-realtime.js). Audit cart: 0 biến thể còn trống ảnh khi template có ảnh; 4 SP trống do TPOS không có ảnh nào (placeholder hợp lệ).
- **Reconcile-on-load** (durable, thêm vào `warehouse-realtime.js`): khi load trang, sau 3s đối chiếu toàn bộ cart với TPOS truth — bắt thay đổi xảy ra khi KHÔNG tab nào mở (vd qua đêm). Throttle qua localStorage `soluongWhReconcileAt` (tối đa 1 lần/10 phút/trình duyệt, chung index + list). Thêm `handle.refreshAll()` + `window.__soluongWhSync` để gọi tay từ console. Bump module `?v=20260604b`.

### [web2] Studio chụp tách nền — engine fal.ai BiRefNet (HD, không watermark) ✅🔄

Research Google/GitHub cách lấy ảnh SẠCH (KHÔNG làm chức năng xóa watermark — lách phí, từ chối). Kết quả: **fal.ai BiRefNet** (model MIT state-of-the-art) free/pay-per-use, không watermark, full HD, **shop đã có FAL_KEY sẵn** (dùng cho AI KOL).

- **Backend**: thêm engine `birefnet` vào `services/web2-cutout-service.js` (fal.ai sync `https://fal.run/fal-ai/birefnet/v2`, `Authorization: Key FAL_KEY`, trả `image.url` → fetch về Buffer PNG) + route `POST /api/web2/cutout/birefnet`. `/status` thêm `birefnet`.
- **Frontend**: engine "Cloud HD" giờ gọi `/birefnet` (BiRefNet) thay PhotoRoom. **Mặc định vẫn 'local' (@imgly, free, không watermark, chạy được ngay)**; "Cloud HD" auto-fallback @imgly nếu lỗi/hết số dư fal.
- **Test**: route /birefnet (mock fal.run→CDN) trả PNG dataURL ✓, /status engines.birefnet ✓, syntax OK.
- **⚠ fal.ai account HẾT SỐ DƯ**: live test `birefnetCutout` → `fal 403: User is locked. Exhausted balance` (FAL_KEY hợp lệ nhưng balance dùng hết bởi AI KOL). → "Cloud HD" hiện auto-fallback về @imgly. Muốn dùng BiRefNet HD: **top up fal.ai/dashboard/billing** (pay-per-use ~cents/ảnh) → tự hoạt động, không sửa code.
- PhotoRoom: route giữ lại (sandbox watermark / production trả phí) nhưng bỏ khỏi UI mặc định.

**Files**: `web2/photo-studio/{index.html(v=20260604d),photo-studio.js}`, `render.com/{services/web2-cutout-service.js,routes/web2-cutout.js}`. FAL_KEY đã có trong Render env (aikol) → push auto-deploy là route live.

### [web2][render] Wipe + reseed data ảo với mã SP đúng logic Web2ProductCode ✅

**Yêu cầu:** Mã SP trong kho lộn xộn (KHO-random, DEMO-, sp, SP001). User chọn: wipe sạch products/orders/PBH/cart + tạo lại data ảo mã đúng. Giữ data khách.

**Thực thi:**

- **Wipe** qua `POST /api/admin/web2-data-reset {mode:wipe}` (Render direct URL — `/api/admin/*` không qua worker): backup `_bak_20260604_1027` (37 SP, 108 BT, 1 đơn, 10 PBH, 49 cart) → TRUNCATE 7 bảng.
- **Seed** `scripts/web2-seed-fake-data.js` (node fetch, POST web2-variants/products KHÔNG cần auth): 20 màu/size + **20 SP mã đúng** Web2ProductCode (`HNAODEN`, `HNQUAN2DENS32`, `HCGUOCNAUS38`, `B4QUANXAMS28`, `QCMMDENS39`...). 0 mã junk còn lại.
- **so-order Firestore** (`scripts/web2-wipe-so-order.js`): doc `web2_so_order/main` đã rỗng sẵn (tabs=0) — backup, không cần wipe.
- **Verify** 36 trang: notifications(5)/audit-log(61)/inventory-forecast(20) giờ load data thật (fix generic-route shadow đã deploy). Products page: 20 SP mã sạch + badge tồn gộp cột biến thể. tpos-pancake/partner-customer còn ❌ = pre-existing (token Pancake hết hạn / KH chưa ví), không phải regression.

**Files:** `scripts/web2-seed-fake-data.js`, `scripts/web2-wipe-so-order.js`, `scripts/web2-verify-data-load.js` (mới). **Status:** ✅ Done.

### [web2-products][so-order] Thêm ảnh SP — ảnh quần áo thật theo loại ✅

`scripts/web2-add-product-images.js`: gán `imageUrl` **ảnh quần áo thật** (loremflickr) theo LOẠI SP detect từ tên: ÁO THUN→tshirt, ÁO SƠ MI→shirt, ÁO KHOÁC→jacket, ÁO LEN→sweater, QUẦN JEAN→jeans, QUẦN TÂY→trousers, QUẦN SHORT→shorts, ĐẦM→dress, GIÀY→shoes, GUỐC→sandals. `lock=<hash mã SP>` → mỗi SP 1 ảnh cố định. PATCH 20 SP kho → re-seed so-order. Verify: kho 20/20 ảnh (naturalWidth=400, ảnh thật). _(Trước đó dùng placehold.co color-coded; user yêu cầu ảnh quần/áo thật.)_

### [so-order] Xoá data cũ + tạo lại Sổ Order ảo theo kho SP ✅

**Yêu cầu:** Wipe so-order + tạo data ảo tham chiếu kho sản phẩm.

- `scripts/web2-seed-so-order.js`: fetch 20 SP từ kho (`/api/web2-products`), build **2 tabs (HÀ NỘI, QUẢNG CHÂU) / 5 shipments / 20 rows** — mỗi row `productName` = tên SP kho exact → so-order tự resolve mã SP (`Web2ProductsCache.findByNameExact`). Status mix received/draft. Ghi Firestore `web2_so_order/main`.
- **Gotcha quan trọng:** doc Firestore so-order có shape `{ data: <state>, lastUpdated }` — state (`{trash,tabs,activeTabId}`) **nested dưới `data`**, KHÔNG phải top-level (xem `SoOrderStorage.Sync._loadFromFirestore`). Lần đầu ghi sai (top-level) → page không đọc được. Đã fix wrap `{ data: state, lastUpdated }`.
- Backup doc cũ trước khi ghi (`downloads/n2store-session/so-order-backup-*.json` — data gốc 3 tabs/9 shipments/35 rows).
- **Verify browser:** 2 tabs render, codes resolve 100% (B4AO2NAU, B4QUANXAMS28... 0 no-match), shipment newest expanded / older auto-collapse.

### [web2-products] Gộp tồn kho vào chung cột Biến thể ✅

Bỏ cột TỒN KHO riêng → header "BIẾN THỂ / TỒN KHO". Variant cell: pill biến thể + badge `Tồn: N` (xanh/amber/đỏ theo mức) xếp dọc. colspan 13→12. Verified browser. Files: `web2/products/{index.html,js/web2-products-app.js,css/web2-products.css}`.

### [web2] Studio chụp tách nền — v10 REBUILD giao diện camera-app mobile-first ✅

User: giao diện cũ khó dùng → xóa làm lại toàn bộ tối ưu điện thoại + mặc định PhotoRoom fallback @imgly. Rebuild hoàn toàn 3 file (index.html/js/css) theo pattern app camera (PhotoRoom/Camera native).

- **Luồng mới**: Camera (live) → **nút Chụp tròn** → **màn Xem (review)** → chọn nền (swatch live: trong suốt/màu/ảnh/mờ) → **Lưu ảnh** (Web Share → Ảnh điện thoại) / Chụp lại. Mode pills overlay trên khung: AI nét (mặc định) · AI nhanh · Phông xanh. Tùy chọn gom vào bottom sheet (⚙).
- **Engine mặc định = 'auto'**: AI nét thử **PhotoRoom cloud** trước, **tự fallback @imgly on-device** nếu lỗi/mất mạng (`makeCutout`). Option 'Trên máy' = luôn @imgly offline.
- **Kiến trúc cutout dùng chung**: chụp → tạo "cutout" (chủ thể nền trong suốt) 1 lần → màn Xem ghép với nền theo realtime (đổi nền KHÔNG tách lại). Chụp ở độ phân giải gốc (1920×1080 / cap 2400).
- **Fix layout**: web2-shell grid 260px+1fr, mobile theme chỉ đổi `flex-direction` (no-op trên grid) → sidebar chiếm chỗ, main hẹp. Ép `.web2-shell:has(.ps-app){grid-template-columns:1fr}` ≤900px → full width. Sidebar vẫn là hamburger drawer.
- Giữ nguyên: quyền camera (auto-start nếu granted, hướng dẫn cấp quyền Chrome/iOS), camera sau mặc định mobile, lật gương theo facing, tỉ lệ khung, spill, FPS badge.
- **Test** (Playwright Pixel7 + fake cam + mock cloud): auto-start ✓, default hq/auto ✓, capture hq(cloud)→review 1920×1080 ✓, đổi nền trắng (pixel opaque) + mờ ✓, sheet ✓, chroma capture→review ✓, full width (396/412) ✓, 0 error. Screenshot camera + review xác nhận UI camera-app sạch.

**Files**: `web2/photo-studio/{index.html,photo-studio.js,photo-studio.css}` (v=20260604a).

- **Fix watermark (v=20260604c)**: AI nét cloud (PhotoRoom) bằng key **sandbox** luôn có watermark → đổi mặc định engine sang **`local` (@imgly, free, KHÔNG watermark)**. Cloud (HD) thành tùy chọn, note rõ cần key trả phí để bỏ watermark. Mặc định 4:5.

### [render][web2] Bỏ Neon hoàn toàn — Web 2.0 = Render PG + Firebase only, xoá deadcode ✅

**Bối cảnh:** User thấy "Neon" trong secret file + hỏi "sao lại có Neon?". Yêu cầu: Web 2.0 CHỈ dùng Render + Firebase, xoá Neon + deadcode tất cả dấu vết.

**Điều tra (authoritative qua `GET /api/services-overview`):** `web2Db` = Render PG **`n2store_web2`** (n2store-web2-db, 261 MB, có đủ data + `_bak_` backups). Neon DB (`neondb`) **rỗng** mọi bảng web2 (`relation does not exist`). → Web 2.0 **đã** chạy 100% trên Render từ trước; "Neon" chỉ là **stale reference** trong secret file + comment. KHÔNG cần repoint/migrate data.

**Dọn dẹp:**

- Xoá 5 file deadcode migration Neon→Render: `routes/admin-migrate-web2.js`, `routes/admin-schema-mirror-web2.js`, `routes/admin-data-copy-web2.js`, `db/web2-schema-mirror.js`, `db/web2-data-copy.js` + 4 mount/require trong `server.js`.
- `server.js` + `db/web2-pool.js`: bỏ mọi comment "Neon", ghi rõ pool = Render `n2store-web2-db`, log `Render n2store-web2-db pool initialized`.
- `serect_dont_push.txt`: xoá Neon connection string (line 37), thay bằng note "removed — Render only".
- `MEMORY reference_db_pools.md` + `MEMORY.md`: cập nhật web2Db = Render giữ TOÀN BỘ data web2 (cũ ghi sai "Neon Free / chỉ web2_records").
- `docs/web2/DB-SEPARATION-PLAN.md`: header ✅ HOÀN TẤT, Neon = lịch sử.

**Verify:** `node --check server.js` OK, không còn require gãy. **Status:** ✅ Done — cần redeploy.

## 2026-06-03

### [render][web2] Fix data KHÔNG load 3 trang sau tách DB — generic route shadow dedicated ✅

**Bối cảnh:** User verify từng trang menu Web 2.0 sau khi tách DB `web2Db`. Script mới `scripts/web2-verify-data-load.js` quét 36 trang (nav + capture mọi API call + console error). Kết quả: 22 OK, 9 tĩnh, 5 lỗi.

**Bug chính (DB-separation artifact):** 3 trang `notifications` (F06), `audit-log` (F05), `inventory-forecast` (F11) crash `Cannot read properties of undefined (reading 'length')` + hiện rỗng. Nguyên nhân:

- `render.com/server.js`: generic catch-all `app.use('/api/web2', web2GenericRoutes)` mount **TRƯỚC** các dedicated route `/api/web2/<entity>`. Generic có route `/:entity/list` → **shadow** dedicated → `/api/web2/notifications/list` trả `{success, records:[]}` (web2_records rỗng) thay vì data thật. Data thật vẫn sống ở alias `/api/v2/notifications` (không bị generic catch).
- Frontend 3 trang đọc `d.items.length` → `d.items` undefined (response field là `records`) → crash.

**Fix:**

- `render.com/server.js` — **dời generic `/api/web2` mount xuống CUỐI** sau mọi dedicated `/api/web2/<entity>`. Express match theo thứ tự → specific thắng catch-all. Fix systemic cho 17 dedicated route từng bị shadow. ⚠ **Cần Render redeploy** mới live.
- `web2/notifications/index.html`, `web2/audit-log/index.html`, `web2/inventory-forecast/index.html` — normalize `const items = d.items || d.records || d.data || []` (defensive, không crash khi shape đổi).

**Còn lại (KHÔNG phải bug):**

- `partner-customer`: 44× `404 /api/web2/wallets/by-phone/X` = KH chưa có ví (đúng — ví vừa wipe/rebuild). Page xử lý graceful (pill ẩn). 2× OData 500 = TPOS token, không phải web2 DB.
- `tpos-pancake`: `TokenManager already declared` + Pancake token hết hạn — pre-existing, không liên quan tách DB.
- 9 trang ⚪ không gọi API = load thủ công (bulk-import, print-export, smart-match, photo-studio, ...).

**Files:** `render.com/server.js`, 3× `web2/*/index.html`, `scripts/web2-verify-data-load.js` (mới), `docs/dev-log.md`. **Status:** ✅ frontend done · 🔄 server.js cần redeploy.

### [orders] Fix so-order: NCC đã nhận đủ đơn vẫn hiện nút "Nhận hàng" ✅

**Sự cố:** Ô NCC trong bảng so-order render **theo group `supplier + invoiceGroup`** (mỗi đơn 1 ô), nhưng cờ `allRecv` (quyết định hiện "Đã nhận" disabled vs "Nhận hàng") lại quét **toàn bộ rows cùng NCC trong cả lô**. Nên 1 đơn của B4 đã nhận đủ (status `received`) vẫn hiện nút "Nhận hàng" chỉ vì 1 đơn B4 khác còn `NHÁP`.

**Fix (`so-order/js/so-order-app.js`):**

- `rowHtml()`: `allRecv` tính trên đúng group `rows.slice(idx, idx + nccMeta.span)` thay vì filter theo supplier toàn lô → đơn đã nhận đủ hiện "Đã nhận", đơn còn nháp hiện "Nhận hàng".
- Nút "Nhận hàng" thêm `data-invoice-group` → click mở modal nhận hàng scope đúng đơn đó.
- `openReceiveShipmentModal()`: `matchSupplier` thêm filter `opts.invoiceGroupId` (fallback theo `id`) để khớp scope cell.

**Status:** ✅ Done — syntax verified (`node --check`).

### [inventory-tracking] Fix bug modal-shipment ghi đè mã hàng/màu + tab Lịch Sử + khôi phục data ✅

**Sự cố (data-loss thật, không phải ẩn/realtime):** User sửa inline tên mã hàng (`maSP`) + chi tiết màu (`mauSac`) trực tiếp trên bảng. Sau đó mở modal sửa kiện/ghi-chú-admin của đợt rồi Lưu → `saveShipment()` **re-parse lại textarea sản phẩm** (textarea đổ từ `rawText`, không phải maSP/mauSac đã sửa) cho **MỌI NCC trong đợt** → maSP rớt về mã trần, mauSac về "1 màu". 1 lần lưu ghi chú lúc 13:37:44 wipe 4 NCC (stt 24, 24-TOA, 67, 40) cùng lúc. Chẩn đoán bằng edit-history: đúng 5 PUT `san_pham` cùng user "Lài" cách nhau ~0.1s.

**Files:**

- `js/modal-shipment.js` — `saveShipment()`: chỉ re-parse khi textarea **thực sự bị sửa**; nếu `productText === origProductText` (dựng lại từ `existingInvoice.sanPham`) thì **giữ nguyên sanPham cũ** (bảo toàn maSP/moTa/mauSac inline-edited). Chặn tái diễn.
- `js/history-tab.js` (mới) + `index.html` (tab button + panel + script) + `js/main.js` (switch case `history`) + `css/modern.css` (toolbar + product diff): **tab "Lịch Sử"** query toàn bộ audit trail 30 ngày, filter ngày/NCC/loại, **mở rộng diff `san_pham` hiện maSP cũ→mới từng dòng** (modal cũ chỉ ghi "N item" — không recover được).
- Bump `?v`: modal-shipment 20260603b, main 20260603b, history-tab 20260603a, modern.css 20260603b.

**Khôi phục data:** Lấy old value từ edit-history 13:37:44, **merge theo từng SP** (chỉ khôi phục SP còn hỏng + maSP khớp old = chưa bị user gõ lại) → khôi phục 15 tên + 14 màu (stt 24), 5 tên + 4 màu (24-TOA) qua API PUT. Tổng tiền/món giữ nguyên. KHÔNG đè phần user đang gõ dở.

**Verified:** Playwright smoke localhost — tab load 500 entries, 439 badge "Mã hàng", expand diff OK, filter san_pham 439. `node --check` 3 file pass.

**Nâng cấp tab Lịch Sử (cùng ngày, theo phản hồi user):**

- **Diff san_pham đầy đủ**: so cả `maSP + mauSac (màu) + SL + giá`, không chỉ mã. Trước đó user thấy "0/3 mã hàng thay đổi" nhưng entry vẫn log → vì user sửa MÀU (mauSac), mã không đổi. Nay hiện rõ `1 màu → Trắng (3), Đen (7), Nude (5)`.
- **Diff mọi field bảng**: `_fmtFieldValue` render đọc được kiện hàng (`Kiện 1: 58kg ✓`), chi phí/thanh toán (`TIỀN XE: 60, …`), ảnh (`N ảnh`), ngày, NCC, STT. Create/Delete hiện **snapshot** (newData/oldData) → "Tạo mới đơn hàng" liệt kê đợt + từng NCC + SP. Thay đổi id-only (vd `chi_phi_hang_ve` regenerate id) đánh dấu `(không đổi nội dung)` qua `_stripIds`.
- **Filter mở rộng**: ô **tìm kiếm tự do** (`_haystack`: maSP/màu/ghi chú/người sửa/chi phí, debounce 250ms) + **Đợt** + **Ngày giao** + giữ NCC/loại/ngày sửa. Verified: Đợt=2→494, search "VIỀN"→152, ngày giao 24/05→138.
- Bump `?v`: history-tab 20260603e, modern.css 20260603e (shared css giữ nguyên 20260530d — không đụng).

**Lịch sử TỪNG ĐƠN (nút 🕐 trên mỗi card) — fix bug modal vô hình + dùng chung renderer giàu:**

- **Bug có sẵn:** modal `#modalEditHistory` tạo bằng `class="modal hidden"`, mà `.hidden { display:none !important }` thắng `.modal.active { display:flex }` → bấm 🕐 trên card **không hiện gì** (modal luôn ẩn). Fix `edit-history.js _ensureModal`: bỏ class `hidden`, chỉ để `modal` (openModal toggle `.active`).
- **Dùng chung renderer:** `history-tab.js` expose `renderList(rows)` + chuyển expand/collapse sang **delegation cấp document** (chạy cả trong tab lẫn modal). `edit-history.js _renderHistoryList` delegate sang `window.HistoryTab.renderList` → modal per-đợt/per-NCC giờ có **diff giàu y hệt tab** (mã/màu/SL/giá, snapshot, đánh dấu id-only). Fallback renderer cũ nếu HistoryTab chưa load.
- Bump `?v`: edit-history 20260604a, history-tab 20260604a. Verified Playwright: card 🕐 → modal hiện (flex), 24 entries đúng đợt, expand diff OK.

### [render][overview] Đổi tên kho KH đơn hàng web2Db: `customers` → `web2_order_customers` ✅

Web 2.0 có 2 kho KH gây nhầm tên với Web 1.0. Tách rõ + đổi tên theo convention `web2_`:

- **2 kho KH (web2Db)**: ① `web2_customers` — nguồn TPOS (search/sửa, id=TPOS Partner Id). ② `web2_order_customers` (đổi tên từ `customers`) — kho KH đơn hàng nguồn **Pancake/FB**, schema giàu (phone UNIQUE/name/address/email/fb_id/pancake_data/status/tier/tpos_id/tpos_data/aliases). native-orders duy trì kho này qua `upsertCustomerFromOrder()`. Khác master + schema → giữ tách theo vai trò.
- **Service mới** `services/web2-order-customer-service.js` (getOrCreateCustomerFromTPOS/updateCustomerFromTPOS/lookupCustomerIdByPhone → target `web2_order_customers`). 5 route web2 (native-orders, fast-sale-orders, pbh-reports, web2-customer-orders, web2-customer-tpos) tách khỏi `customer-creation-service`/`customer-helpers` (Web 1.0) — đúng rule no cross-import.
- **Migration** `db/web2-order-customers-migrate.js`: `ALTER TABLE customers RENAME TO web2_order_customers` chạy boot, **guard tuyệt đối** (raw web2Pool only + WEB2_DATABASE_URL set + idempotent) — KHÔNG bao giờ đụng `customers` Web 1.0 (chatDb). Gỡ `customers` khỏi `web2-schema-mirror` WEB2_TABLES (tránh tái tạo).
- **Bug nghiêm trọng đã fix trước đó**: comment SQL trong `web2-customers-schema.js` chứa backtick `` `customers` `` → vỡ template literal → Render require throw. Đổi nháy kép.
- **Verify**: scan toàn render.com — mọi `FROM/INTO/UPDATE/JOIN customers` còn lại đều Web 1.0 chatDb (v2/customers, sepay-webhook-core legacy path `balance_history`, sepay-wallet-operations, pancake-alert qua v2/customers). 5 file web2 = 100% web2Db access đã chuyển.

Files: `render.com/services/web2-order-customer-service.js` (mới), `db/web2-order-customers-migrate.js` (mới), `server.js` (wire boot), `db/web2-schema-mirror.js`, `routes/native-orders.js`, `routes/fast-sale-orders.js`, `routes/pbh-reports.js`, `routes/v2/web2-customer-orders.js`, `routes/v2/web2-customer-tpos.js`, `db/web2-customers-schema.js` (fix backtick), `web2/overview/index.html` (#datastores).

### [balance-history] Bỏ cột Mã tham chiếu + nút ↗ + modal chi tiết KH ✅

User yêu cầu 3 việc trên trang balance-history:

1. **Bỏ cột "Mã tham chiếu"** — xóa `<th>` + `<td class="w2bh-cell-ref">` + colspan 6→5.
2. **Bỏ nút ↗ "Mở thẻ KH"** — `tpos-partner-enricher.js` không inject `linkHtml` nữa (giữ status pill TPOS).
3. **Click tên KH → modal chi tiết** — file mới `js/web2-customer-detail-modal.js` (`Web2CustomerDetailModal.open(phone,name)`), 3 tab: **Thông tin** (tên/SĐT/địa chỉ + sửa → `PATCH /api/web2/customers/:id` đồng bộ TPOS + danh sách KH trùng SĐT), **Lịch sử ví** (nạp/dùng từ `/wallets/:phone/transactions`), **Đơn hàng** (Đơn Web + PBH từ `/customers/by-phone/:phone/orders` + đếm PBH thành công). Đọc 100% kho KH dùng chung Web 2.0.

Files: `web2/balance-history/index.html`, `web2/balance-history/js/web2-balance-history-app.js`, `web2/balance-history/js/tpos-partner-enricher.js`, `web2/balance-history/js/web2-customer-detail-modal.js` (mới)

### [web2] Studio chụp tách nền (camera → xóa/ghép phông) ✅

**Trang mới** `web2/photo-studio/` (index.html + photo-studio.js + photo-studio.css) — feature client-side thuần, **không backend/DB/SSE**, ảnh không rời máy user.

- **2 chế độ tách nền**: (1) **AI** — MediaPipe Selfie Segmentation on-device (CDN `@mediapipe/selfie_segmentation@0.1.1675465747`), không cần phông xanh, slider làm mịn viền (blur mask 0-8px); (2) **Chroma key** — lọc pixel theo màu phông (euclidean RGB distance), swatch xanh lá/xanh dương/custom + **click vào stage để lấy đúng màu phông** (eyedropper), slider ngưỡng + độ mịn viền.
- **Nguồn**: camera (`getUserMedia`, switch trước/sau qua `facingMode`) hoặc upload ảnh có sẵn.
- **Nền thay thế**: trong suốt (PNG, stage hiện checkerboard) / màu đơn sắc (swatch + color picker) / ảnh upload (cover-fit). Compositing: AI dùng `source-in` + `destination-over`; chroma vẽ bg trước rồi foreground đã key alpha lên trên.
- **Chụp** → bake mirror vào bitmap → `toBlob` PNG → card kết quả có nút Tải + xóa. Xử lý cap 960px ngang cho mượt mobile, `willReadFrequently` cho canvas chroma.
- **Sidebar**: thêm "Studio chụp tách nền" vào nhóm "Tính năng mới" (`tpos-sidebar.js`) + vào `WEB2_PAGES` (có badge WEB 2.0).
- **Test** (Playwright headless): UI mount + MediaPipe load + toggle mode/bg OK, 0 console error. Pipeline chroma verify: ảnh synthetic phông xanh + ô đỏ → center đỏ giữ `[220,40,40,255]`, góc xanh xóa `[0,0,0,0]`, capture ra 1 card.

**Files**: `web2/photo-studio/{index.html,photo-studio.js,photo-studio.css}`, `web2/shared/tpos-sidebar.js`.

### [web2] Studio chụp tách nền — v2 cải tiến chuyên nghiệp 🔄→✅

- **🐛 FIX chí mạng**: overlay "Đang tải mô hình AI…" kẹt vĩnh viễn — `.ps-stage-loading{display:flex}` đè UA `[hidden]{display:none}`. Thêm `.ps-stage-empty[hidden],.ps-stage-loading[hidden],.ps-fps[hidden]{display:none!important}`.
- **Trạng thái tải model AI thật**: hiện "Đang tải mô hình AI…" tới khi `onSegResults` đầu tiên fire (`state.modelLoaded`), không hide sớm như trước.
- **Tỉ lệ khung**: Gốc/1:1/4:5/3:4/9:16/16:9 — crop center qua `cropRect()`, áp cho cả AI (drawImage source-rect) + chroma + capture. Ảnh sản phẩm sàn TMĐT.
- **Khử ám màu spill (chroma)**: clamp kênh trội của key về trung bình 2 kênh còn lại trên pixel giữ lại → hết viền ám xanh.
- **Mờ nền (portrait)**: bgType `blur` — vẽ frame gốc blur làm nền sau chủ thể (chỉ AI; disable nút khi chroma). Slider độ mờ 2-30px.
- **Chụp độ phân giải GỐC**: capture pass riêng từ source native (cap cạnh dài 2400px) thay vì từ preview 1080 — mask AI upscale, chroma re-key ở native.
- **Xuất PNG/JPG**: JPG fill nền trắng (no alpha) + nhẹ hơn. Card kết quả hiện `WxH · KB`, nút "Tải tất cả" + đếm số ảnh.
- **FPS badge** góc stage. Preview cap nâng 960→1080.
- **Test** (Playwright): loading ẩn lúc init ✓, aspect 300×400→300×300 ✓, chroma center đỏ giữ/góc xanh xóa ✓, capture PNG+JPG (2 cards, filename đúng đuôi, meta WxH·KB) ✓, blur disabled in chroma ✓, 0 error.

### [web2] Studio chụp tách nền — v3 thêm engine "AI nét" (@imgly/background-removal) ✅

- **3 chế độ chuyển qua lại tự do (cached)**: `ai` (MediaPipe realtime) / `hq` (AI nét) / `chroma`. Engine giữ trong RAM (`state.seg`, `imglyMod`) + model file cache HTTP → đổi mode sau lần đầu là tức thì.
- **AI nét** = `@imgly/background-removal@1.5.5` (IS-Net/U²-Net, ONNX runtime-web, **on-device, free**) — lazy `import()` từ `esm.sh` (tự gói dependency). Viền nét hơn MediaPipe cho **sản phẩm/vật thể bất kỳ**, KHÔNG cần phông xanh.
- Không realtime (model nặng): mode `hq` preview = `renderPassthrough` (chỉ show khung canh), tách nền chạy khi bấm **Chụp** → `removeBackground(blob)` → ghép nền (màu/ảnh/mờ/trong suốt) ở độ phân giải gốc. Loading overlay trong lúc xử lý; preload ngầm engine khi chọn mode để lần Chụp đầu nhanh.
- Refactor: tách `finalizeCapture()` + `captureSize()` dùng chung cho cả 3 mode.
- **Test** (Playwright): 3 mode ["ai","hq","chroma"] ✓, switch hq→ai→chroma→hq cached active ✓, esm.sh import `removeBackground=function` ✓, **end-to-end AI nét: upload ảnh → Chụp → ra card transparent 240×320 trong 20s (gồm tải model lần đầu), loading ẩn sau xử lý** ✓, 0 error.

**Files**: `web2/photo-studio/{index.html,photo-studio.js,photo-studio.css}` (v=20260603c).

### [web2] Studio chụp tách nền — v4 tối ưu camera mobile-first ✅

Trang dùng chủ yếu trên điện thoại → cải thiện UX quyền camera:

- **Mặc định camera SAU trên mobile** (`isMobile()` → `facingMode='environment'`, mirror off) — hợp chụp sản phẩm. Desktop giữ camera trước.
- **Tự mở camera nếu đã cấp quyền**: `autoStartIfAllowed()` dùng Permissions API `query({name:'camera'})` — `granted` → `startCamera({silent:true})` không cần bấm, không prompt. `onchange` listener tự mở khi user vừa cấp. Bọc try (Safari/Firefox không hỗ trợ 'camera' → fallback nút thủ công im lặng).
- **Lỗi quyền rõ ràng** (`cameraErrorMsg`): `NotAllowedError`→hướng dẫn bấm 🔒 cho phép Camera; `NotReadableError`→camera bận; `NotFoundError`→không có camera; check `isSecureContext` trước.
- **Lật gương theo camera** (`syncMirrorToFacing`): trước→lật, sau→không, tự cập nhật checkbox khi mở/đổi camera.
- Constraint `facingMode: { ideal }` (mềm, không fail trên máy 1 camera). Empty-state nhắc "cho phép quyền truy cập".
- **Test** (Playwright fake-camera + iPhone 13 emulation + permission granted): camera auto-start (capture/switch enabled, empty hidden, startBtn="Tắt camera") ✓, mirror off (rear default) ✓, output 1080×608 ✓, chụp ra 1 card ✓, 0 error.

**Files**: `web2/photo-studio/{index.html,photo-studio.js}` (v=20260603d).

### [web2] Studio chụp tách nền — v9 engine cloud PhotoRoom (AI nét chất lượng cao) ✅

Research Google/GitHub các giải pháp tách nền mạnh hơn (BiRefNet MIT, RMBG non-commercial, remove.bg, PhotoRoom, Pixian…). Kết luận: free on-device @imgly đủ cho ảnh thường; nâng cấp cho ảnh khó (tóc/lông/thủy tinh) = BiRefNet self-host (free, heavy infra) hoặc PhotoRoom API (clean, sandbox 1000 ảnh/tháng free → paid + scene/bóng đổ studio). Chọn **PhotoRoom** làm engine cloud.

- **Backend** (Render): `services/web2-cutout-service.js` (PhotoRoom v1 `/segment`, key `PHOTOROOM_API_KEY`/`PHOTOROOM_SANDBOX_KEY` từ env, trả Buffer PNG) + route `routes/web2-cutout.js` (`POST /api/web2/cutout/photoroom` nhận `{image:dataURL}` → `{image:dataURL PNG}`, `GET /status`). Mount `server.js` TRƯỚC `/api/web2` generic. CF worker `WEB2_GENERIC` forward sẵn `/api/web2/*`.
- **Frontend**: mode "AI nét" thêm card "Engine AI nét" — **Trên máy** (@imgly, free, offline) ↔ **Studio cloud** (PhotoRoom). `captureHQ` branch `cloudCutout()` vs `localCutout()`. Kết quả vào màn preview + Lưu như cũ.
- **Test**: backend route (mock PhotoRoom) — `/status` engines.photoroom, valid→PNG dataURL, thiếu ảnh→reject, no-key→503 ✓. Frontend (mock backend) — engine card hiện trong hq, chọn cloud, chụp→preview composited ✓, 0 error.
- **⚠ CẦN USER**: (1) key free sandbox tại photoroom.com/api → `serect_dont_push.txt` block PhotoRoom; (2) Render env `PHOTOROOM_API_KEY`; (3) deploy Render. Chưa có key → nút "Studio cloud" báo 503 (vẫn dùng "Trên máy" free OK).
- BiRefNet free-unlimited: follow-up (cần Python service riêng trên Render).

**Files**: `web2/photo-studio/{index.html,photo-studio.js,photo-studio.css}` (v=20260603i), `render.com/{services/web2-cutout-service.js,routes/web2-cutout.js,server.js}`.

**Cập nhật 2026-06-04**:

- Route `/api/web2/cutout/*` **đã LIVE** trên Render (auto-deploy từ git push) — `GET /status` qua CF worker trả `{photoroom:false}`. Env `PHOTOROOM_API_KEY` (sandbox) đã set qua Render API (HTTP 200) NHƯNG chưa load vì PUT env-var không auto-redeploy → cần 1 deploy. Deploy bị safety-gate chặn → user tự bấm Manual Deploy hoặc authorize.
- **BiRefNet free — KẾT LUẬN: KHÔNG khả thi in-browser.** Test `onnx-community/BiRefNet_lite-ONNX` qua Transformers.js@3.7.5 `background-removal`: fp32 OOM (`240595976`), fp16 OOM (`127873152`), q8 "Unsupported model type: swin". Model 1024² quá nặng cho WASM/mobile → KHÔNG ship in-browser. Free server-side cần HF token (reliability không chắc) hoặc Python service riêng (nặng/tốn). Khuyến nghị: PhotoRoom sandbox (1000/tháng free) làm "free chất lượng cao" + @imgly cho basic.
- **2026-06-04 ĐÃ DEPLOY + VERIFY LIVE**: user authorize → POST deploy (HTTP 202) → `/status` `photoroom:true` ✅. Real end-to-end qua CF worker: ảnh 512² → cutout PNG hợp lệ 512² trong 1.5s, HTTP 200 ✅. **Studio cloud chạy thật** (PhotoRoom sandbox 1000/tháng free). BiRefNet: user chọn BỎ, dùng PhotoRoom.

### [web2] Studio chụp tách nền — v8 xem & lưu ảnh sau khi chụp (fix mobile) ✅

User: ảnh chụp không thấy trên điện thoại + khó dùng. Nguyên nhân: gallery "Ảnh đã chụp" nằm tít dưới đáy (dưới sticky bar) + nút `<a download>` KHÔNG lưu được trên mobile (mở tab thay vì tải). Research Google/GitHub (PhotoRoom/remove.bg/imgly, Web Share API) → áp dụng flow chuẩn **chụp → xem → lưu/chụp lại**:

- **Màn xem ảnh ngay sau khi chụp** (`#psPreview`, full-screen, z-200): ảnh hiển thị bằng `<img>` thật trên nền caro (thấy vùng trong suốt) + kích thước + nút **Lưu ảnh** / **Chụp lại** + mẹo "nhấn giữ ảnh → Lưu vào Ảnh" (fallback iOS). Áp dụng cho cả 3 mode (qua `handleCaptured` = addResult + openPreview).
- **Lưu ảnh đúng cách mobile** (`saveBlob`): ưu tiên **Web Share API** `navigator.share({files})` (mở share sheet → "Lưu vào Ảnh" trên iOS/Android) → fallback `<a download>` (desktop). Giữ ảnh là `<img>` thật để long-press lưu được (safety net iOS).
- Gallery: nút "Tải" `<a download>` → nút **Lưu** gọi `saveBlob` (giữ blob trong closure). `downloadAll` click các nút Lưu.
- **Test** (Playwright iPhone13): chụp → preview hiện (img src + meta "240×320 · 3 KB" + hint + Save) ✓, Chụp lại đóng ✓, gallery có nút Lưu (không còn `a[download]`) ✓, 0 error.

**Files**: `web2/photo-studio/{index.html,photo-studio.js,photo-studio.css}` (v=20260603h). Tham khảo: imgly/background-removal-js, do-me/js-camera-capture, MDN Web Share API.

### [web2] Studio chụp tách nền — v7 giao diện mobile (camera-app + bottom sheet) ✅

Trang chủ yếu dùng trên điện thoại → làm lại layout responsive kiểu app camera:

- **Desktop giữ nguyên** 2 cột (stage + panel 340px). **Mobile (≤860px)**: khung camera lớn (output max-height 58vh), nút **Chụp** to full-width nổi bật, các nút phụ (Bật camera/đổi cam/tải ảnh/tùy chọn) hàng dưới, stage-bar sticky đáy.
- **Bottom sheet**: toàn bộ thẻ tùy chọn (kỹ thuật tách nền, tỉ lệ khung, chroma/AI, nền, xuất) gom vào bảng trượt từ dưới lên, mở bằng nút **Tùy chọn**, đóng bằng nút **Xong** / chạm nền mờ (backdrop). Có grabber + sticky head. `overscroll-behavior: contain`, khoá scroll nền (`.ps-sheet-open`).
- JS: `openSheet`/`closeSheet` toggle class `is-open` trên `#psPanel` + `#psSheetBackdrop`; cache hỗ trợ selector class (`.ps-main`). Hero gọn lại trên mobile (clamp 2 dòng).
- **Test** (Playwright): mobile iPhone13 — toggle hiện, panel off-screen lúc đầu → mở (on-screen + backdrop) → đóng (off-screen) ✓, shutter full-width ✓; desktop 1440 — toggle/sheet-head ẩn, panel static, grid 2 cột ✓; 0 error.

**Files**: `web2/photo-studio/{index.html,photo-studio.js,photo-studio.css}` (v=20260603g).

### [web2] Studio chụp tách nền — v6 hướng dẫn cấp quyền camera từng bước ✅

User: Chrome điện thoại không hiện popup + không biết chỗ cấp quyền. Nguyên nhân: Chrome Android chỉ hỏi 1 lần; bị chặn/embargo rồi thì gUM reject `NotAllowedError` ngay, không prompt lại → phải bật tay trong site settings.

- **Phát hiện chặn từ đầu**: `autoStartIfAllowed` thêm nhánh `state==='denied'` → gọi `showPermissionHelp()` ngay khi tải (báo trước, không đợi user bấm rồi mới biết).
- **Hướng dẫn từng bước tùy nền tảng** (`permissionStepsHTML` + `isIOS`/`browserName`): Android Chrome → "nhấn 🔒/⊟ bên trái địa chỉ → Quyền → Máy ảnh → Cho phép" + fallback "⋮ → Cài đặt → Cài đặt trang web → Máy ảnh"; iOS → "Cài đặt → <trình duyệt> → Camera" + mẹo Safari "aA → Cài đặt trang web". Nút "Đã cấp quyền — Thử lại".
- `cameraErrorMsg` rút gọn cho toast; chi tiết nằm ở panel `.ps-help` trong khung preview.
- **Test** (Playwright, UA Pixel 7 Android Chrome): denied-on-load → help 4 bước + tiêu đề Chrome + retry ✓; prompt→click→deny → help 4 bước, gUM gọi 1 lần ✓.

**Files**: `web2/photo-studio/{index.html,photo-studio.js,photo-studio.css}` (v=20260603f).

### [web2] Studio chụp tách nền — v5 hiện rõ prompt/lỗi quyền camera ✅

User: "bấm Bật camera sẽ hỏi quyền nếu chưa có". Verify đúng luồng + fix gap thông báo:

- **Verify** (Playwright iPhone13, KHÔNG cấp quyền, spy getUserMedia): state `prompt` → lúc load **không** gọi gUM (chờ user, không tự prompt) ✓; bấm "Bật camera" → gUM gọi 1 lần = trình duyệt hiện popup xin quyền ✓.
- **Gap phát hiện**: trang standalone KHÔNG load `notification-system.js` → mọi toast (gồm hướng dẫn khi từ chối quyền) chỉ vào console, user mobile không thấy. → **Thêm `../../shared/js/notification-system.js`** vào page.
- **Lỗi quyền hiện NGAY trong khung** (`showStageError`): camera fail → khung preview hiện icon `camera-off` + thông báo (vd "Bạn chưa cho phép quyền camera. Bấm 🔒…") + nút **Thử lại** (gọi lại `startCamera`). Không chỉ dựa toast.
- **Test** (deny giả lập): `notificationManager` loaded ✓, sau deny gUM=1 + khung hiện errText + nút Thử lại ✓, 0 error.

**Files**: `web2/photo-studio/{index.html,photo-studio.js,photo-studio.css}` (v=20260603e).

### [web2] Kho KH thống nhất + Overview "Kho dữ liệu dùng chung" ✅

**Sửa KH 1 nguồn → sync TPOS 2 chiều**: endpoint mới `PATCH /api/web2/customers/:id` (id=TPOS Partner Id) — sửa tên/SĐT/địa chỉ → push TPOS by tposId (đổi SĐT vẫn update đúng partner, không tạo dup) + update cache `web2_customers`. ĐÂY LÀ NƠI DUY NHẤT sửa KH. native-orders order-edit cũng sync (đã thêm phone vào trigger). partner-customer vẫn edit thẳng TPOS (full PUT). customer-wallet chỉ link TPOS (không sửa inline).

**Overview** thêm section `#datastores` "🗂️ Kho dữ liệu dùng chung" — bảng registry mỗi domain (KH/SP/biến thể/PBH/đơn web/ví KH/balance/NCC/KPI): Nguồn-master, ĐỌC endpoint, SỬA endpoint, bảng/collection. Quy tắc BẮT BUỘC code mới: dùng đúng 1 nguồn, không tạo kho song song, KH luôn qua `/api/web2/customers/*`.

**report-delivery tách Web 1.0**: `/api/pbh-reports/delivery` tổng hợp giao hàng từ `fast_sale_orders` (web2Db) group theo carrier_name, Đã giao=`fulfillment_shipped_at/delivered_at`, Huỷ=`state=cancel`. Bỏ `/api/v2/delivery-assignments`.

Files: `render.com/routes/v2/web2-customers.js`, `render.com/routes/native-orders.js`, `render.com/routes/pbh-reports.js`, `web2/report-delivery/index.html`, `web2/overview/index.html`, `web2/overview/overview.css`

### [web2] Phase 6 CUTOVER — VERIFIED LIVE ✅

Smoke sau deploy 826c87c70: mọi web2 endpoint **200 trên web2Db** — balance-history (id 4902), stats (4894), web2-products/list (37 SP), native-orders/load, fast-sale-orders/load, dashboard-kpi (đọc balance_history copy OK), kpi, cart, notifications, customers/by-phone/orders. Web 1.0 `/api/v2/customers` + `/api/v2/balance-history` vẫn 200 trên chatDb — **KHÔNG bị web2 đụng**. → Tách DB Web 2.0 HOÀN TẤT.

### [web2] Phase 6 CUTOVER — flip toàn bộ route web2 sang web2Db ✅

Sau khi mirror 33 bảng + copy data (data web2 disposable, Web 1.0 KHÔNG đụng), **cutover pool**:

- **26 route web2** đổi `req.app.locals.chatDb` → `req.app.locals.web2Db || req.app.locals.chatDb` (web2-balance-history, web2-customer-wallet, web2-wallets, web2-customers, web2-customer-orders, web2-supplier-debt, web2-monitoring, web2-products, web2-variants, web2-users, native-orders, fast-sale-orders, reconcile, purchase-refund, notifications, audit-log, cart, kpi, dashboard-kpi, smart-match, supplier-360, inventory-forecast, delivery-invoices, refunds, pbh-reports).
- **Webhook** `_processWeb2Path(req.app.locals.web2Db || db)` — web2 SePay path ghi web2Db; legacy path (`db`=chatDb) GIỮ NGUYÊN.
- **Crons** retry + reprocess web2 → `web2Pool`.
- SSE wallet listener event-based (không query pool) — OK. Anti-dup unique index `sepay_id` đã mirror sang web2Db.
- Boot `ensureSchema` GIỮ chatDb (wallet-isolation có backfill legacy-specific) — chatDb copies thành unused, harmless.

→ Web 2.0 giờ đọc/ghi hoàn toàn `n2store-web2-db`. Web 1.0 (`n2store_chat`) KHÔNG bị web2 đụng. Rollback: đổi `web2Db || chatDb` → `chatDb` (1 lệnh sed).

Files: 26 route + server.js + sepay-webhook-core.js + db/web2-schema-mirror.js + db/web2-data-copy.js

### [web2] Phase 4+5 tách DB — schema mirror + data copy chatDb→web2Db (verified) ✅

**Phase 4 (DONE)**: mirror schema 20 bảng web2 chatDb→web2Db qua introspection (`pg_attribute`+`format_type`+`pg_get_constraintdef`+`pg_indexes`). Module [web2-schema-mirror.js](../render.com/db/web2-schema-mirror.js), endpoint `POST /api/admin/schema-mirror-web2` + `/status`. Giải quyết `CREATE TABLE (LIKE customer_wallets)` không chạy được ở web2Db. Dry-run 20/20 OK → run thật → 20/20 mirrored. chatDb KHÔNG đụng.

**Phase 5 (DONE)**: copy data batched idempotent (ON CONFLICT DO NOTHING) + sequence sync (parse nextval từ default) + money SUM verify. Module [web2-data-copy.js](../render.com/db/web2-data-copy.js), endpoint `POST /api/admin/data-copy-web2` + `/verify`. Fix bug cột json/jsonb array → `JSON.stringify` tường minh. `/verify` **allMatch:true**: wallets 5321 (SUM✓), wallet_transactions 7503 (SUM✓), balance_history 4892, +17 bảng — count + SUM tiền khớp.

**Phase 6 (chưa làm — cutover ví/tiền)**: bump web2Db sequence +10000 (chống collision gap rows) → final delta sync → switch ~24 route + webhook pool chatDb→web2Db → verify. Cửa sổ ít traffic. chatDb giữ làm backup (rollback = đổi pool về chatDb).

Files: `render.com/db/web2-schema-mirror.js`, `render.com/db/web2-data-copy.js`, `render.com/routes/admin-schema-mirror-web2.js`, `render.com/routes/admin-data-copy-web2.js`, `render.com/server.js`

### [orders] Đối soát KPI: đổi sang ExportFileDetail + so khớp refund theo MÓN ✅

**User ask**: (1) đổi link tải refund excel `ExportFileRefund` → `ExportFileDetail?TagIds=&type=refund` (file có cột "Chi tiết" liệt kê từng món hoàn); (2) thực tế chỉ hoàn một số món trong đơn → so sánh **món tính KPI** với **món hoàn**, chỉ trúng món mới loại KPL (trừ theo SL hoàn).

**Logic mới (per-product)**: trước đây đơn nằm trong refund → loại TOÀN BỘ KPI đơn. Giờ: chỉ loại `Σ min(SL hoàn, SL net KPI) × 5.000đ` của các món có code khớp giữa KPI `details` và cột "Chi tiết". Hoàn 1/5 món → chỉ mất KPI 1 món.

**Thay đổi**:

- `kpi-manager.js`: `reconcileKPI()` trả thêm `result.details` (món KPI: code+net).
- `tab-kpi-commission.js`: `fetchRefundedOrderCodes` → **`fetchRefundDetailByInvoice`** (endpoint ExportFileDetail, parse cột "Chi tiết" qua `_parseRefundChiTiet` regex `/(\d+)\s*x\s*\[([^\]]+)\]/g` → `Map<invoiceNumber, Map<code,qty>>`). Helper mới **`_matchRefundForOrder`**. Record thêm `refundedKpiAmount`/`refundedProducts`/`hasRefundRow`. Loss aggregation (`_indexReconResults`, `_hydrateL1ReconCachesForEmployees`, `_applyL1ReconCache`, `renderEmployeeOrdersTable`) đổi sang `refundedKpiAmount`. Stats card + export Excel (+2 cột "KPI bị loại"/"Món hoàn") cập nhật. Bump cache L1 `kpi_recon_l1_v1__` → `v2__`.
- Join key giữ nguyên: `invoice.Number` ↔ cột "Tham chiếu". Worker proxy forward generic `/api/*` giữ query `&type=refund` (verified).

**Files**: `orders-report/js/managers/kpi-manager.js`, `orders-report/js/tab-kpi-commission.js`, `docs/orders-report/DOI-SOAT-KPI.md` (cập nhật theo logic mới).

**Verify**: node --check 2 file OK; parser khớp file mẫu `docs/orders-report/tra-hang-chi-tiet.xlsx` (cột "Chi tiết", multi-món tách `;`). Read-only (chỉ fetch TPOS + tính in-memory, không ghi DB).

**Status**: ✅ Done.

### [web2] Phase 3 namespace + overview DB/router (verified LIVE) ✅

**Phase 3**: dual-mount mọi route Web 2.0 ở `/api/web2/<entity>` (giữ `/api/v2/*` alias) trong server.js + đổi 11 frontend file sang `/api/web2/*`. Verify LIVE: `/api/web2/kpi/scope`→200, `/api/web2/dashboard-kpi`→200, `/api/web2/notifications/unread-count`→200, `/api/web2/customers/by-phone/:phone/orders`→200 (Phase 2b). 404 ở root chỉ là route không có handler `/` (giống alias cũ, không regression).

**Overview** section `#database` viết lại: 2 Postgres instance (`n2store-web2-db` riêng vs `n2store-chat-db`), router namespace `/api/web2/*` đầy đủ, Firebase `web2_` collections + trạng thái migrate.

**Còn lại (cần monitored execution)**: Phase 4 mirror ~25 bảng schema sang web2Db; Phase 5-6 copy data + cutover route ví/tiền (verify SUM balance). Plan: [WEB2-TOTAL-SEPARATION-PLAN.md](web2/WEB2-TOTAL-SEPARATION-PLAN.md).

### [web2] Cleanup dead code Web 1.0 (15 file) ✅

Xóa file copy từ trang Web 1.0 cũ KHÔNG được index.html load (verify 0 reference + 0 path-ref trước khi xóa):

- `balance-history/js/` (13 file): accountant, accountant-history, verification, balance-verification, live-mode, customer-info, balance-core, balance-table, balance-filters, transfer-stats, config, qr-generator, main — chứa `/api/v2/balance-history`, `/api/sepay/*`, Firestore `customers` legacy. Còn lại 5 file thực sự loaded (web2-\*, tpos-partner-enricher).
- `customer-wallet/`: `index.legacy.html` (bản Firestore cũ, không ai link) + `customer-wallet-storage.js` (chỉ legacy dùng).

→ Loại nguồn gây "COUPLED giả" trong audit + tránh nhầm khi đọc code.

### [orders][docs] Tài liệu "Đối soát KPI" (KPI Reconciliation) ✅

**User ask**: ghi chi tiết cách hoạt động của khối "Đối soát KPI" trong tab KPI - HOA HỒNG.

**Done**: tạo [docs/orders-report/DOI-SOAT-KPI.md](orders-report/DOI-SOAT-KPI.md) — tài liệu cả nghiệp vụ + kỹ thuật:

- Nghiệp vụ: ý nghĩa OK / Đã hoàn / Sai lệch / "loss"; làm rõ % leaderboard là **tương đối so với người dẫn đầu** (`kpiNet/maxNetKpi`), không phải % chỉ tiêu tuyệt đối.
- Kỹ thuật: luồng `runReconciliation()` (worker pool CONCURRENCY=8), fetch refund Excel TPOS (`fetchRefundedOrderCodes`, endpoint `ExportFileRefund`, SheetJS cột "Tham chiếu"), lõi `kpiManager.reconcileKPI()` (BASE↔TPOS↔audit → `no_base`/`missing_audit`/`removed_from_tpos`), gộp loss `_indexReconResults()`, modal L1 cache 7 ngày, bảng tra cứu file/hàm + số dòng.

**Quirk ghi nhận (không sửa)**: nhánh rỗng `allOrders.length===0` (tab-kpi-commission.js L4166–4175) không gọi `_hideReconProgress()` → progress kẹt "Đang khởi tạo… 2%" cạnh empty state (đúng như screenshot user gửi).

**Files**: `docs/orders-report/DOI-SOAT-KPI.md` (mới). Chỉ tài liệu, không chạm code feature.

**Status**: ✅ Done.

### [web2] Phase 2 tách DB — decouple Web 1.0 thật (an toàn) 🔄

Master plan: [docs/web2/WEB2-TOTAL-SEPARATION-PLAN.md](web2/WEB2-TOTAL-SEPARATION-PLAN.md) (audit 33 trang).

**Đã swap an toàn (verified tương thích)**: `native-orders-app.js:635` `/api/v2/customers?search=` → `/api/web2/customers/search` (consumer đọc `.data[0]` ✓); `print-export/index.html:215` `/api/v2/balance-history?from/to` → `/api/web2/balance-history?since/until` + parse `d.data`.

**Phase 2b — KHÔNG swap mù (cần endpoint web2 mới / xử lý semantic)**: smart-match `POST /:id/link`{customer_phone,pbh_number} ≠ web2 `PATCH /:id/link`{phone}; customer-wallet `/api/v2/customers/by-phone/:phone/orders` cần endpoint web2 order-history by phone; dead-code deletion balance-history (~13 file) hoãn vì tên generic trùng trang khác, phải verify từng file.

Files: `native-orders/js/native-orders-app.js`, `web2/print-export/index.html`

### [inventory-tracking] iPad: nút STT/NCC luôn hiện (bỏ phụ thuộc :hover) ✅

**User ask**: trên iPad muốn hiện nút như cột STT 8 phải bấm tay vào chữ (vì không hover). Bấm vào lại bị scroll xuống vị trí khác.

**Root cause**: `.btn-del-stt / .btn-add-stt / .btn-copy-stt / .btn-del-ncc / .btn-edit-ncc / .btn-hist-ncc / .btn-convert-po` đang `display: none` mặc định, chỉ hiện qua `:hover` của td. iPad không có hover thật → tap fake-hover làm các nút inline-block xuất hiện → layout shift → scroll vị trí thay đổi.

**Fix**: trong `@media (pointer: coarse)` (line ~1996 inventory-tracking/css/modern.css), thêm rule luôn `display: inline-block` cho 7 nút trên + bump `.drag-stt` opacity 0.32 → 0.85. Layout cố định → tap = bấm nút thật, không gây reflow scroll.

**Files**: `inventory-tracking/css/modern.css` line ~2002 (touch device action buttons always visible block), `inventory-tracking/index.html` bump `css/modern.css?v=20260603b`.

**Verify**: pattern y nguyên `.btn-edit-cell` block đã có `@media (hover: none) and (pointer: coarse)` auto-show từ trước.

**Status**: ✅ Done.

---

### [render][web2] Tách DB Web 2.0 — Phase 1: web2_customers (kho KH riêng) thay /api/v2/customers 🔄

**User quyết định**: tách HẾT data Web 2.0 sang kho riêng `n2store-web2-db` (Render PG, dpg-d8d7be) + Firebase web2, độc lập hoàn toàn Web 1.0. Làm một mạch. Plan: [docs/web2/DB-SEPARATION-PLAN.md](web2/DB-SEPARATION-PLAN.md).

**Facts (Render API)**: 2 Postgres — `n2store-chat-db`/`n2store_chat` (chính, chứa toàn bộ web2\_\* + legacy) và `n2store-web2-db`/`n2store_web2` (web2 riêng, hiện chỉ `web2_records`). ~25 bảng + ~24 route đang ở chatDb. KHÔNG có JOIN runtime web2↔legacy → tách khả thi.

**Phase 1 done (tested local DB)**: `web2_customers` table (id=TPOS Partner Id, phone, name, address, tpos_raw) trong **web2Db** ([web2-customers-schema.js](../render.com/db/web2-customers-schema.js), trigram index name). `searchCustomersByText()` thêm vào [tpos-customer-service.js](../render.com/services/tpos-customer-service.js). Route [web2-customers.js](../render.com/routes/v2/web2-customers.js) `GET /api/web2/customers/search` (local + TPOS fallback + self-populate). Frontend `web2-balance-history-app.js` + `web2-pending-match.js` đổi `/api/v2/customers` → `/api/web2/customers/search`. Test local: search tên (trigram) + đuôi SĐT + upsert idempotent ✓.

**Next**: Phase 2 schema mirror toàn bộ web2 tables sang web2Db; Phase 3 data copy; Phase 4 switch 24 routes; Phase 5 verify.

Files: `render.com/db/web2-customers-schema.js`, `render.com/db/web2-pool.js`, `render.com/routes/v2/web2-customers.js`, `render.com/services/tpos-customer-service.js`, `render.com/server.js`, `web2/balance-history/js/web2-balance-history-app.js`, `web2/balance-history/js/web2-pending-match.js`

### [inventory-tracking] Cây bút chỉnh sửa cho cột Đơn giá ✅

**User ask**: "cho cây bút chỉnh sửa ở Đơn giá".

**File**: [inventory-tracking/js/table-renderer.js](../inventory-tracking/js/table-renderer.js) line 1260.

**Change**: thêm `<button class="btn-edit-cell btn-edit-price">` với `<i data-lucide="pencil">` vào `<td class="col-price">` — giống pattern đã có cho col-sku/col-colors/col-qty. Onclick `event.stopPropagation(); startInlineEdit(this.closest('td'))` mở inline edit cho `giaDonVi`. Title "Sửa Đơn giá".

**CSS**: `.btn-edit-cell` generic class ở `inventory-tracking/css/modern.css` line 1674 đã có sẵn — show on hover, pencil icon size, position. Không cần thêm rule riêng.

**Verify**: syntax `node --check` pass. Pattern y nguyên 3 sibling columns đã chạy production. Bump `table-renderer.js?v=20260603a`.

**Status**: ✅ Done.

---

### [so-order][products] Mã SP theo rule + hiển thị mã/SL + nút nhận hàng theo NCC + NCC=KHO ✅

**Files**: [so-order/js/so-order-app.js](../so-order/js/so-order-app.js), [so-order/index.html](../so-order/index.html), [so-order/css/so-order.css](../so-order/css/so-order.css), [web2/products/js/web2-products-app.js](../web2/products/js/web2-products-app.js), [web2/products/index.html](../web2/products/index.html)

**A — Mã SP theo rule (bỏ KHO-rnd ngẫu nhiên)**:

- so-order include `web2-product-code.js`. Helper `_assignKhoCodes(items)` sinh mã rule (`HNAODEN`…) từ `Web2ProductCode.suggest` (supplierPrefixMap từ Web2SuppliersCache, colorShortMap từ Web2VariantsCache, existingCodes từ Web2ProductsCache, push mã mới trong batch tránh trùng). Gọi trong `syncRowsToKho` + `confirmReceive` trước `upsertPending`. Server `web2-products.js` tôn trọng `it.code || generate` → chỉ áp khi INSERT SP mới. Fallback bỏ code nếu thiếu NCC.

**B — Hiển thị so-order list**: `rowHtml` thêm `_lookupKhoCode(r)` (cache findByNameExact) → mã hiện dưới tên SP (`.so-cell-code`). SL gộp vào cột Biến thể (`variantCellInner`: `Xanh - L · SL 20`). Giữ cột SL (toggle qua cài đặt cột).

**C — Nút nhận hàng theo NCC**: nút `.so-ncc-receive-btn` ở ô NCC (đầu nhóm rowspan, chế độ xem) → `openReceiveShipmentModal(shId, {supplier})` lọc rows đúng NCC đó. Disable khi NCC đã nhận đủ. Tái dùng `confirmReceive` (upsert-pending → confirm-purchase-partial → in tem).

**Điểm 4 — NCC=KHO**: tạo SP trực tiếp ở web2/products → `#pmSupplier` mặc định "KHO" (option mới trong `populateSupplierDropdown`), `suggestProductCode` ép `prefixMap['KHO']='KHO'` → mã `KHOAODEN` (literal, không rút thành KH). `_assignKhoCodes` cũng ép tương tự.

**Verify localhost**: so-order render 10 rows, 10 mã cell, 10 SL span, 8 nút NCC, `Web2ProductCode` loaded, không lỗi. Ảnh `downloads/n2store-session/so-order-code-sl-ncc.png`.

**Còn lại (Part D — chưa làm)**: user yêu cầu tách `web2_products`/`native_orders`/`fast_sale_orders` từ `chatDb` (n2store-chat-db, chung Web 1.0) → `web2Db` (n2store-web2-db). Agent map ra **10 điểm JOIN cross-DB** (pbh-reports, web2-customer-wallet aggregate CTE, native-orders↔customers, customer-orders, notifications…) — migration ~16 file route, 4 chỗ phức tạp đụng ví KH/customer-360/PBH report. Cần xử lý cẩn thận (split dual-pool) + cân nhắc hệ quả "tạo mới rỗng" làm trống lịch sử mua feeding ví/360.

### [render][balance-history] Fix search 500 — `sepay_id INTEGER ILIKE text` (clone Web 1.0) + giải thích prelink_credit ✅

**Bug**: Search ô tìm SĐT/sepay_id/nội dung ở [web2/balance-history](../web2/balance-history/index.html) trả HTTP 500 `operator does not exist: integer ~~* text`.

**Nguyên nhân**: Cột `web2_balance_history.sepay_id` là `INTEGER` (clone từ Web 1.0), nhưng WHERE clause dùng `sepay_id ILIKE $1` (text pattern). Postgres không có operator ILIKE cho integer.

**Fix**: cast `sepay_id::text ILIKE $N` trong [render.com/routes/v2/web2-balance-history.js](../render.com/routes/v2/web2-balance-history.js) (chỉ 1 chỗ, handler GET `/`).

**Câu hỏi user "sao xác định được Trang Đài khi kho KH có nhiều Trang Đài"**: Web 2.0 matcher **KHÔNG match theo tên** — chỉ QR → exact phone → partial phone (digit-run) trong content. Content `NGUYEN TRANG DAI Chuyen tien GD 6154... 030626-11:31:07` sau `stripBankNoise` không còn SĐT/QR nào → matcher không tự xác định được ai. GD này có `match_method = prelink_credit` (verify DB sepay_id=61646875): row đã có sẵn `linked_customer_phone = 0919561765` từ **clone Web 1.0** → nhánh prelink ([web2-sepay-matching.js:278](../render.com/services/web2-sepay-matching.js#L278)) credit thẳng + set AUTO_APPROVED, **không re-validate, không ghi audit log**. Tức Web 2.0 tin tưởng hoàn toàn link cũ của Web 1.0 — nếu Web 1.0 chọn nhầm Trang Đài thì Web 2.0 kế thừa sai + đã cộng ví.

**(a) Thêm audit cho prelink_credit** ✅: nhánh prelink trong [web2-sepay-matching.js](../render.com/services/web2-sepay-matching.js#L313) giờ gọi `web2MatchAudit.log` với `decisionTier='prelink_inherited'`, `extractedType='prelink'`, note rõ "phone đã có sẵn từ clone Web 1.0, không re-extract" → từ nay mọi prelink có dấu vết trong `web2_match_audit`.

**(b) Script rà soát rủi ro** ✅: [render.com/scripts/audit-prelink-credit-risk.js](../render.com/scripts/audit-prelink-credit-risk.js) — READ-ONLY, soi toàn bộ `prelink_credit`, đối chiếu content với phone đã gán. Phân tier: `CORROBORATED_QR/PHONE` (an tâm), `CONFLICT` (content có SĐT khác phone gán — rủi ro cao), `PARTIAL`, `NO_EVIDENCE` (link thuần kế thừa). Tín hiệu tên mơ hồ: gom theo tên chuẩn hoá → tên nào gán cho ≥2 SĐT khác nhau = ưu tiên review (đúng kiểu "nhiều Trang Đài"). Output `downloads/n2store-session/prelink-credit-risk-report.md`. Chạy: `export DATABASE_URL=... && node render.com/scripts/audit-prelink-credit-risk.js`. KHÔNG hardcode credential.

Files: `render.com/routes/v2/web2-balance-history.js`, `render.com/services/web2-sepay-matching.js`, `render.com/scripts/audit-prelink-credit-risk.js`

### [render][balance-history] Audit coupling Web 1.0 — bỏ legacy `extractPhoneFromContent` ✅

**User yêu cầu**: rà toàn bộ balance-history/wallet/sepay Web 2.0 xem còn dính Web 1.0 không.

**Kết quả audit** (toàn module):

- ✅ **Frontend** `web2/balance-history/`: sạch — KHÔNG gọi API legacy (`/api/sepay`, `/api/v2/balance-history`, `/api/v2/wallets`), KHÔNG firebase listener.
- ✅ **Webhook**: fan-out 2 path độc lập ([sepay-webhook-core.js:519](../render.com/routes/sepay-webhook-core.js#L519)). Web 2.0 `insertWeb2BalanceHistory` INSERT trực tiếp từ payload — KHÔNG mirror/copy từ legacy `balance_history`. FULL ISOLATION.
- ✅ **Wallet isolation** ([web2-wallet-isolation.js](../render.com/services/web2-wallet-isolation.js)): triggers legacy→web2 đã DROP (2026-05-25). Backfill `INSERT…SELECT FROM customer_wallets` có guard `if count===0` → chỉ chạy 1 lần lúc cutover, web2 đã có data nên KHÔNG re-run, KHÔNG rò data Web 1.0.
- ✅ **SSE**: web2 wallet dùng đúng hub web2 (`web2RealtimeSseNotify` + topic `web2:wallet:*` + `web2WalletEvents`).
- 🔧 **Coupling code DUY NHẤT — đã fix**: [web2-balance-history.js](../render.com/routes/v2/web2-balance-history.js) import `extractPhoneFromContent` từ legacy `sepay-transaction-matching` để render badge `extraction_preview`. Thay bằng adapter `web2ExtractionPreview()` dùng `web2-content-parser.extractPhoneCandidates` → vừa bỏ coupling, vừa khớp ĐÚNG logic matcher Web 2.0 (trước đây preview legacy có thể lệch với matcher thật).
- ⚠ **Data coupling còn lại**: rows `prelink_credit` = link kế thừa từ clone Web 1.0 (vấn đề Trang Đài). Đã có audit log + script rà soát (entry trên). Chờ chạy `audit-prelink-credit-risk.js` để định lượng.
- ℹ Minor (không sửa): `web2-wallet-isolation.js:81` đọc `MAX(id) FROM customer_wallets` mỗi boot để set sequence — harmless read, có try/catch, không đụng nếu legacy table còn tồn tại.

Files: `render.com/routes/v2/web2-balance-history.js`

---

### [inbox] Fix nút "Làm mới trạng thái phiếu từ TPOS" ở Đơn Inbox (don-inbox) ✅

**Yêu cầu user**: Nút làm mới trạng thái phiếu từ TPOS ở trang `don-inbox` bị lỗi — bấm hiện toast `Lỗi: Không tìm thấy thông tin đơn để refresh`.

**Gốc vấn đề**: Cell "Phiếu bán hàng" của don-inbox render bằng `renderSocialInvoiceCell` (social order, key bằng `.id` lowercase, vd `SO-...`). Nút refresh gọi `window.refreshPBHForOrder(order.Id)` — hàm này (tab1) chỉ tìm đơn trong `allData`/`window.displayedData` (mảng của tab1 orders-report), KHÔNG chứa social order → luôn báo "Không tìm thấy thông tin đơn để refresh". Ngoài ra `renderSocialInvoiceCell` hiện tại còn **không có** nút refresh (screenshot user thấy là bản cache cũ `?v=20260521b` ~2 tuần).

**Dữ liệu liên quan**:

- Social order sống trên Render (id `SO-...`), không có SaleOnline trên TPOS. Khi tạo PBH, FastSaleOrder lấy `Reference = String(social order id)` (`tab1-sale.js:1712`).
- Invoice social lưu trong `InvoiceStatusStore` key = social order id (patch `storeFromApiResult` ở `tab-social-invoice.js`).
- `window.SocialOrderState` expose trên window (`tab-social-core.js:444`).

**Giải pháp**:

- `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` — `refreshPBHForOrder`: `const`→`let order` + fallback tra `window.SocialOrderState.orders` theo `.id`, dựng orderShim `{Id, Code: existingInvoiceReference || orderId, Name/Telephone/Address, __isSocial}`. Query TPOS `Reference eq '<social id>'` (đúng pattern tab1) → bao cả phiếu mới tạo lẫn vừa hủy. Re-render: nếu `__isSocial` + có `window.refreshSocialInvoiceCell` → gọi nó (giữ đúng UI/handlers social), else `renderInvoiceStatusCell` như cũ. Tab1 order: hành vi y nguyên (optional-chain `SocialOrderState` an toàn khi undefined).
- `don-inbox/js/tab-social-invoice.js` — `renderSocialInvoiceCell`: thêm nút refresh (`class="invoice-refresh-btn"`, onclick `refreshPBHForOrder(order.id)`) ở cả cell rỗng lẫn cell có phiếu (cạnh StateCode label).
- `don-inbox/index.html` — bump cache `v=20260521b`→`v=20260603a` (52 chỗ) để user nhận code mới ngay.

**Status**: ✅ Done — `node --check` pass 3 file.

---

## 2026-06-02

### [balance-history][native-orders] Tìm 5-10 số đuôi SĐT + hiển thị số dư ví KH khắp nơi + ẩn "Tổng tiền vào" ✅

**User yêu cầu** (balance-history Web 2.0):

1. Hình 1 (modal chọn KH multi-match): cho tìm 5-10 số đuôi SĐT.
2. Hình 2 (tab "Trùng SĐT — cần chọn"): nhập 5-10 số → hiện danh sách KH để gán; **ẩn card "Tổng tiền vào"** (mọi tab).
3. Mọi nơi có tên/SĐT khách (native-orders + các trang khác) → **hiện số dư ví Web 2.0** (≤ 0 thì KHÔNG hiện).

**Làm**:

- **Shared helper mới** [`web2/shared/web2-wallet-balance.js`](../web2/shared/web2-wallet-balance.js): `Web2WalletBalance.attachBalances(root)` quét `[data-w2wallet-phone]` → batch `GET /api/web2/wallets/by-phone/:phone` (cache 60s + concurrency 6, fallback direct Render) → inject pill `Ví: X₫`. **Chỉ hiện khi balance > 0** (0/null/loading → rỗng). SSE `web2:wallet:*` invalidate cache. Drop-in: thêm `<span data-w2wallet-phone="...">` + 1 lần `attachBalances` + load script.
- **balance-history**: ẩn `.w2bh-stat-card.stat-in` (`display:none`, giữ DOM để JS set value không lỗi). Pill số dư ở: bảng (ô KH), modal pending candidates + dropdown "Tự chọn KH khác", modal "+ Gán KH" (TPOS OData), modal "Đổi KH" (reassign). Placeholder/hint custom search đổi "5-10 số đuôi SĐT".
- **native-orders**: pill số dư cạnh tên KH trong list đơn (`renderRows`).
- **tpos-pancake**: pill cạnh SĐT trong panel thông tin KH (`tpos-customer-panel.js`).
- **partner-customer**: pill cạnh SĐT trong bảng KH.
- Backend `/api/v2/customers?search=` đã sẵn `phone ILIKE %q%` (substring) → gõ 5-10 số đuôi match được; KHÔNG cần sửa backend.

**Verify live (localhost:8080)**: balance-history `stat-in display:none` + 25 pill/50 row; modal pending 82 candidate (3 pill) placeholder "5-10 số"; gõ "616043" → dropdown 1 KH (0706616043) + pill 935.000₫; native-orders + partner-customer (46 slot/11 pill) render OK.

### [native-orders] Thêm Pancake upload fallback cho ảnh → gửi ảnh được cả khi KHÔNG có extension ✅

**User hỏi**: "native-orders không upload pancake thì đâu có gửi ảnh được?".

**Làm rõ**: gửi ảnh qua extension là upload thẳng lên **Facebook** (`UPLOAD_INBOX_PHOTO` → FB upload endpoint → `fbId`), KHÔNG qua Pancake → nên native-orders **vẫn gửi ảnh được qua extension** (đã validate `fbId` thật). "Không upload Pancake" chỉ ảnh hưởng nhánh fallback KHI KHÔNG có extension.

**Gap thật đã fix**: trước đó nếu extension fail/không có → native-orders không gửi được ảnh (Web2Chat thiếu hàm upload). Giờ thêm fallback Pancake:

- [`web2/shared/web2-chat-client.js`](../web2/shared/web2-chat-client.js): thêm `Web2Chat.uploadMedia(pageId, file)` → POST `/api/pancake-official/pages/:id/upload_contents?page_access_token` (FormData file) → `{ ok, id, attachment_type }`. Cùng endpoint tpos-pancake `PancakeAPI.uploadMedia`. Export ra public API (dùng chung được cả 2 trang).
- [`native-orders-app.js`](../native-orders/js/native-orders-app.js) `_handleSendMessage` fallback: bỏ chặn "attachment không gửi được"; thay bằng `Web2Chat.uploadMedia` → `content_id` → `sendMessage({attachments:[{content_id}]})`. Lỗi upload → restore + báo.

**Giờ parity đầy đủ**: cả tpos-pancake + native-orders: **Extension TRƯỚC** (upload FB, bypass 24h) → **fallback Pancake** (upload_contents → content_id, trong 24h). Ảnh gửi được dù có hay không extension.

**Verify**: `node --check` OK (2 file); reload native-orders sạch; `Web2Chat.uploadMedia` = function (live). ⚠ Pancake send vẫn dính giới hạn 24h + token; extension là path chính.

**Files**: `web2/shared/web2-chat-client.js`, `native-orders/js/native-orders-app.js`, `native-orders/index.html` + `tpos-pancake/index.html` (bump web2-chat-client v). Status: ✅ Done.

### [native-orders] Đồng bộ gửi attachment (ảnh/âm thanh/video/tệp) qua extension — parity với tpos-pancake ✅

**Yêu cầu user**: "đồng bộ 2 bên đi — chức năng giống nhau mà". → port tính năng gửi attachment qua extension từ tpos-pancake sang native-orders (trước giờ native-orders chat chỉ gửi TEXT).

**Cách làm** (`native-orders/js/native-orders-app.js`, dùng `_extensionRequest` inline sẵn có — cùng protocol extension):

- Thêm `_pendingAttachment {file,kind}` + helpers `_attachmentKind`, `_fileToDataUrl`, `_attachLabel`, `_setPendingAttachment` (preview ảnh thumb / chip file), `_clearPendingAttachment`.
- Composer: thêm nút 📎 (attach-file mọi loại) + 🖼 (attach-image) + 2 input ẩn + `#msgAttachPreview`. Wire trong binding modal.
- `_handleSendMessage`: guard cho phép gửi attachment-only; UI-first `_appendOutgoing(text||label)` + clear attachment; `_restore` khôi phục cả text + attachment. Extension block: nếu có attachment → `UPLOAD_INBOX_PHOTO` (data-URL) → `fbId` → `REPLY_INBOX_PHOTO` `attachmentType=kind, files=[fbId]`; lỗi upload → restore + báo (KHÔNG fallback Pancake vì native-orders không có Pancake upload). Pancake fallback: nếu có attachment → restore + báo "cần extension".
- Giữ thứ tự extension-first của native-orders.

**Khác tpos-pancake**: tpos-pancake có Pancake fallback cho ảnh (uploadMedia→content_ids); native-orders attachment CHỈ qua extension (không có Pancake upload path). Text vẫn fallback Pancake như cũ ở cả 2.

**Verify**: `node --check` OK; reload native-orders sạch (no app error). UI nút đính kèm render trong modal chat (mở theo đơn). Extension upload đã validate thật ở tpos-pancake (fbId thật) — cùng `_extensionRequest`/`UPLOAD_INBOX_PHOTO` nên native-orders tương đương. ⚠ E2E gửi thật cần browser có FB Business + hội thoại thật.

**Files**: `native-orders/js/native-orders-app.js`, `native-orders/index.html`. Status: ✅ Done — 2 trang giờ parity chức năng gửi attachment qua extension.

### [tpos-pancake] LIVE-validate gửi attachment qua extension (real FB) ✅

Test thật với extension load sẵn (`scripts/n2store-browser-session.js --ext n2store-extension --http-port 9997`) + login FB Business trong cửa sổ:

- ✅ Extension bridge kết nối: `Web2Ext.hasExtension()=true`, version **1.0.25** (service worker `chrome-extension://…/background/service-worker.js` registered).
- ✅ FB Business logged in (`c_user`), tpos-pancake load 2 pages / 56 hội thoại.
- ✅ `UPLOAD_INBOX_PHOTO` (qua `Web2Ext.request`, data-URL) trả **fbId thật** (`1882115992477918`) khi upload PNG 80×80 — pipeline upload-lên-FB chạy thật, KHÔNG gửi cho KH nào.
- ⚠ Lưu ý: ảnh 1×1 px bị FB từ chối ("Could not extract fbId") → cần ảnh hợp lệ kích thước thật. Code đã pass PNG canvas 80×80 OK.
- Bước `REPLY_INBOX_PHOTO` (giao tin thật) KHÔNG auto-bắn để tránh spam KH thật — nhưng dùng đúng bridge đã proven + payload mock-verified (`attachmentType:'PHOTO', files:[fbId]`). User tự click gửi trên 1 hội thoại an toàn để xác nhận khâu cuối.

Kết luận: code web (tpos-pancake) + cầu nối extension cho attachment hoạt động thật end-to-end tới bước upload FB. Còn lại chỉ là khâu deliver (giống text-send đã chạy).

### [render][tpos-pancake] Kho "Hình Livestream" — chụp iframe thủ công + sidebar gallery ✅

**Yêu cầu user**: tpos-pancake thêm nút "chụp hình" (đặt trước chip "Snap live") để chụp khung iframe FB live → lưu vào kho riêng **Hình Livestream** (độc lập thumbnail/snapshot per-comment đã có) + 1 nút bên phải bật sidebar hiển thị kho, filter theo campaign (mặc định campaign đang chọn).

**Files**:

- `render.com/routes/livestream-images.js` (NEW) — bảng `livestream_images` (Postgres bytea, chatDb). Endpoints: `POST /` (lưu ảnh hoặc metadata-only fallback), `GET /image/:id`, `GET /` (list + filter `liveCampaignId`), `GET /campaigns`, `DELETE /:id`, `POST /:id/extract` (fallback yt-dlp+ffmpeg). SSE topic `web2:livestream-images`. Auto-cleanup > 60d.
- `render.com/routes/livestream-snapshots.js` — export `_extractHelpers` (ensureExtractDeps/resolveM3u8Url/extractFrameJpeg) để images route reuse (DRY).
- `render.com/server.js` — mount `/api/livestream-images` + wire `initializeNotifiers(web2RealtimeSse)`.
- `tpos-pancake/js/tpos/tpos-livestream-snap.js` — expose `captureCurrentFrame()`, `getCurrentCampaignContext()`, `getCurrentOffsetSeconds()` qua `TposLivestreamSnap`.
- `tpos-pancake/js/tpos/tpos-livestream-gallery.js` (NEW) — 2 chip (📷 Chụp Live trước "Snap live" + 🖼 Kho Hình bên phải) + right-drawer sidebar (filter campaign, grid tiles, delete, extract ⚡, zoom→VOD). UI-first qua Web2Optimistic. SSE subscribe `web2:livestream-images`.
- `tpos-pancake/css/tpos-livestream-gallery.css` (NEW) — chip + sidebar drawer (compositor transitions, content-visibility, reduced-motion).
- `tpos-pancake/index.html` — load `web2-sse-bridge.js` (multi-tab sync, trước đây thiếu) + gallery css/js; bump snap script v.

**Capture path**: stream getDisplayMedia → extension captureVisibleTab crop → frame buffer mới nhất. Không có frame → fallback lưu metadata + offset (extract sau qua ⚡).

**Test local** (browser session): chip mount đúng (capture TRƯỚC snap-chip ✓), sidebar open/close ✓, empty state ✓, capture khi chưa có live → toast "Chưa nhận diện được live đang chạy" (không kẹt busy) ✓. E2E persistence cần deploy Render + live thật.

**Status**: ✅ Done (cần deploy Render để backend route live).

### [soluong-live] "Sản phẩm đã ẩn" sắp xếp món mới ẩn lên đầu (mới → cũ) ✅

**Yêu cầu user**: Danh sách "Sản phẩm đã ẩn" đang sắp lộn xộn (chỉ `.reverse()` thứ tự key Firebase). Muốn món vừa ẩn nổi lên đầu.

**Gốc vấn đề**: sản phẩm không có field nào ghi thời điểm ẩn — chỉ có boolean `isHidden`. Timestamp duy nhất là `addedAt` (lúc thêm, khác lúc ẩn).

**Giải pháp**: thêm field `hiddenAt` ghi lúc ẩn (`Date.now()`), sort danh sách ẩn theo `hiddenAt || addedAt` giảm dần. 239 món cũ không có `hiddenAt` → fallback `addedAt` (backfill gần đúng lúc render, không ghi migration hàng loạt).

**Files**:

- `soluong-live/firebase-helpers.js` — `updateProductVisibility()`: khi ẩn → set `product.hiddenAt = Date.now()` + ghi node (đổi `.set(isHidden)` → `.update({isHidden, hiddenAt})`). Giữ `hiddenAt` qua `addProductToFirebase`/`addProductsToFirebase` (mirror `addedAt`).
- `soluong-live/js/soluong-list.js` — `hideProducts()` batch: stamp `hiddenAt = now` cho local + `updates[...]/hiddenAt`.
- `soluong-live/js/main.js` — `updateHiddenProductListPreview()` (panel index.html): thay `.reverse()` bằng sort `hideKey = hiddenAt||addedAt` desc. Thêm `hiddenAt` vào whitelist `cleanProductForFirebase()`.
- `soluong-live/js/hidden-soluong.js` — trang ẩn riêng: sort `hiddenProducts` theo `hideKey` desc + merge-mode (`mergeProductsByTemplate`) dùng `hiddenAt||addedAt`.

**Status**: ✅ Realtime cross-tab qua Firebase RTDB listener sẵn có (module legacy, không SSE). Single hide route qua `updateProductVisibility`; batch hide & merge view đã cover.

### [tpos-pancake] Gửi attachment đầy đủ (ảnh/âm thanh/video/tệp) qua extension → fallback Pancake ✅

**Yêu cầu user**: extension hỗ trợ gửi hình/audio/file đầy đủ — đừng ép ảnh đi Pancake. → wire composer tpos-pancake gửi mọi attachment qua extension (bypass 24h), fallback Pancake.

**Phát hiện**: extension `n2store-extension` HỖ TRỢ `attachmentType` PHOTO/VIDEO/FILE/AUDIO/STICKER qua 2 bước: `UPLOAD_INBOX_PHOTO` (`{pageId, photoUrl, name}` → trả `fbId`) rồi `REPLY_INBOX_PHOTO` (`attachmentType` + `files:[fbId]` → map `image_ids`/`audio_ids`/`file_ids`/`video_ids`). Trước giờ cả native-orders lẫn tpos-pancake chỉ gửi `SEND_TEXT_ONLY` — chưa wire upload bao giờ (comment "extension text-only" là về WIRING, không phải capability).

**Cách làm** (`tpos-pancake/js/pancake/pancake-chat-window.js` + `css`):

- State `selectedImage` → `selectedAttachment {file, kind}`; helpers `_attachmentKind` (MIME→PHOTO/AUDIO/VIDEO/FILE), `_fileToDataUrl` (data-URL để SW fetch được).
- Composer: nút 📎 (paperclip) → `#pkFileInput` (mọi loại file); nút 🖼 ảnh giữ nguyên. Preview tổng quát: ảnh → thumb, khác → chip `📎/🎵/🎬 tên (KB)`.
- `_trySendViaExtension(conv, text, att)`: nếu có att → `UPLOAD_INBOX_PHOTO` (data-URL) → `fbId` → `REPLY_INBOX_PHOTO` với `attachmentType=att.kind`, `files=[fbId]`. Text-only vẫn `SEND_TEXT_ONLY`.
- `_performSend(conv, convId, text, att)`: extension TRƯỚC (cả text + attachment) → fallback Pancake (ảnh chắc OK; audio/file tuỳ Pancake, lỗi thì rollback). UI-first + bật-lại-text/preview giữ nguyên.

**Verify**: `node --check` OK; reload sạch (nút 📎+🖼, preview, helpers đều có). Mock `Web2Ext` để test payload: gửi PHOTO + text → `UPLOAD_INBOX_PHOTO{photoUrl:data:image/png;base64…, name}` → `REPLY_INBOX_PHOTO{attachmentType:'PHOTO', files:['FBID123'], message, globalUserId}` ✓, input+attachment clear ✓.

⚠ **Chưa E2E thật được**: (1) browser test KHÔNG có FB Business session (cookie c_user/xs) → extension send thật sẽ fail ở bước session; (2) KH test "Huỳnh Thành Đạt 0123456788" là DB-only, KHÔNG có hội thoại Pancake → không mở chat thật để gửi. Cần browser thật đã đăng nhập FB Business + hội thoại thật. native-orders chat chưa có UI attachment (task riêng nếu cần).

**Files**: `tpos-pancake/js/pancake/pancake-chat-window.js`, `tpos-pancake/css/pancake-chat.css`, `tpos-pancake/index.html`. Status: ✅ Done (code + mock-verified).

### [tpos-pancake] Đổi thứ tự gửi: Extension TRƯỚC → Pancake API (đồng bộ native-orders) ✅

**Yêu cầu user**: "chỉnh tpos-pancake qua extension trước → pancake api" (trước đó tpos-pancake là Pancake-trước). Giờ cả 2 trang cùng thứ tự **extension-first**.

**Cách làm** (`tpos-pancake/js/pancake/pancake-chat-window.js` `_performSend`): đảo thứ tự — **ROUTE 1** thử `_trySendViaExtension` TRƯỚC (chỉ TEXT, bypass 24h; không có extension → trả false ngay, không trễ → rơi xuống Pancake); **ROUTE 2** Pancake API (upload ảnh nếu có → `sendMessage`). Tin có ẢNH luôn đi Pancake (extension chỉ `SEND_TEXT_ONLY`). Cấu trúc UI-first (Web2Optimistic.run: apply/run/onSuccess/rollback) giữ nguyên — chỉ đổi nội dung `run`.

**Verify**: `node --check` OK. Cả tpos-pancake + native-orders giờ đồng nhất: UI-first + extension-trước → Pancake sau. ⚠ Nhánh extension cần browser thật có N2 extension để test bypass. Status: ✅ Done.

### [native-orders] Gửi tin UI-first: hiện ngay → chạy nền → lỗi thì bật lại text (giữ extension-trước) ✅

**Yêu cầu user**: native-orders cũng UI-first như tpos-pancake — hiện tin lên UI lập tức + gửi chạy nền + lỗi thì thông báo và bật lại text. **Quyết định**: GIỮ thứ tự gửi cũ (Extension TRƯỚC → Pancake API sau — tối ưu cho nhắn KH ngoài 24h, không thêm độ trễ), chỉ thêm phần UI-first.

**Cách làm** (`native-orders/js/native-orders-app.js`):

- `_appendOutgoing(text)` → **return `fake.id`** (id bong bóng tạm) để rollback.
- Thêm `_removeOutgoing(localId)`: xoá bong bóng khỏi `_chatState.msgs`/`msgIds`/DOM (`.w2-chat-row[data-msg-id]`).
- `_handleSendMessage` refactor **UI-first**: chuyển `_appendOutgoing` + clear input + `_setReplyTarget(null)` lên **TRƯỚC mọi `await`** → bong bóng hiện tức thì, các `await` chạy nền sau. Bỏ `input.disabled` (gõ tiếp được). Capture `replyToId` trước khi null reply target (2 chỗ send dùng `replyToId`). Mọi nhánh **lỗi cả 2 route** gọi `_restore()` = gỡ bong bóng + bật lại text vào ô (chỉ khi ô trống) + focus; giữ nguyên prompt FB Business cho lỗi 24h/extension-missing. Bọc `try/catch` quanh `fetchConversations` + `sendMessage` để lỗi throw cũng rollback sạch.

**Khác trước**: trước `_appendOutgoing` chỉ chạy SAU khi gửi thành công (UI đợi); giờ hiện ngay, gửi nền, lỗi mới gỡ + trả lại text.

**Verify**: `node --check` OK; reload native-orders sạch (no app error, Web2Optimistic loaded, orders render). ⚠ Full send-flow (bong bóng→restore) nên test trên browser thật có N2 extension. Status: ✅ Done (code).

### [tpos-pancake] Gửi tin UI-first: hiện ngay → chạy nền → lỗi thì bật lại text + thông báo ✅

**Yêu cầu user**: "Dùng pancake api trước → bị lỗi thì qua extension → nhắn tin hiển thị lên UI lập tức rồi chạy nền background → nếu lỗi thì thông báo và bật lại đoạn chat".

**Cách làm** — refactor `sendMessage` sang **UI-first** qua `Web2Optimistic.run` (helper mandate CLAUDE.md #8, đã load sẵn tpos-pancake):

- **apply** (sync, NGAY): clear ô nhập + clear preview ảnh + push bong bóng tạm (`_temp`) + render + update snippet. UI phản hồi tức thì.
- **run** (nền, không block): `_performSend()` (helper mới, DRY) → upload ảnh (nếu có) → **Pancake API** → throw thì **fallback N2 Extension** (chỉ TEXT) → trả `{via, sent}`.
- **onSuccess**: thay bong bóng tạm bằng tin thật (guard `activeConversation.id === convId` tránh ghi nhầm khi đã đổi hội thoại); via extension → toast "Đã gửi qua N2 Extension (bypass 24h)".
- **rollback** (lỗi cả 2 route): gỡ bong bóng tạm + **bật lại text vào ô chat** (chỉ khi ô trống → không đè tin mới) + focus + khôi phục preview ảnh; `Web2Optimistic` tự toast "✗ Lỗi gửi tin nhắn: <msg>".
- Bỏ disable/spinner nút gửi (UI-first không block). Fallback legacy `await` nếu `Web2Optimistic` chưa load.

**Khác lần trước**: trước `await` tuần tự (block + spinner), lỗi chỉ popup và **mất text đã gõ**. Giờ: hiện ngay + nền + lỗi giữ lại text để gửi lại.

**Verify**: `node --check` OK. ⚠ Live chưa chạy lại (cửa sổ browser đóng) — dựng trên `Web2Optimistic.run` (proven, live 41 pages); nền tảng đã verify ở bước trước cùng phiên. Cần test browser thật (có N2 extension) cho nhánh bypass.

**Files**: `tpos-pancake/js/pancake/pancake-chat-window.js`, `tpos-pancake/index.html`. Status: ✅ Done (code).

### [render] Lá chắn cứng chống cộng-trùng tiền bank Web 2.0 (race webhook/cron/reload) ✅

**Vấn đề**: cron reprocess vừa thêm là tác nhân thứ 3 (cùng webhook + reload trang) có thể xử lý 1 GD đồng thời. `processWeb2Match` check `debt_added` + `processDeposit` check dup theo `(reference_type='sepay',reference_id)` đều là **đọc-rồi-ghi** ở READ COMMITTED, không lock theo sepayId → 2 path cùng qua check trước khi 1 bên COMMIT → **cộng tiền 2 lần**. Legacy có partial-unique trên cột `sepay_id` (migration 064) nhưng web2 không ghi cột đó → vô hiệu. Không có migration UNIQUE nào cho `web2_wallet_transactions`.

**Fix A — DB last-line-of-defense** (`render.com/services/web2-wallet-isolation.js`):

- Thêm partial UNIQUE `idx_web2_wallet_tx_unique_sepay ON web2_wallet_transactions(reference_id) WHERE reference_type='sepay'` trong `ensureSchema` (idempotent, chạy lúc boot).
- Chỉ ràng buộc deposit sepay → KHÔNG đụng withdraw/order/manual (tránh lỗi "quá rộng" của legacy 063 từng làm 500 toàn bộ withdraw).
- Phòng thủ: phát hiện dup sẵn trước khi CREATE; nếu có → log nhóm dup + skip (không làm chết boot). Toàn bộ bọc try/catch riêng.

**Fix B — App recover** (`render.com/services/web2-wallet-service.js`):

- `processDeposit` wrap `_runDeposit()` trong try/catch: thua race (`code 23505`) → re-query tx đã có → trả `alreadyProcessed:true` thay vì throw/500. Chỉ recover khi `db` là Pool (client trong tx caller đã abort không re-query được).

**Test** (local DB riêng `n2store_dedup_test`, pattern test-migration → DROP sau): 5/5 pass — chặn sepay trùng (23505), race 2-connection đúng 1 win/1 dup, order/withdraw/manual vẫn cho trùng. Không đụng prod.

**Kết quả**: dù webhook + cron + reload đập cùng lúc, DB chỉ cho 1 dòng sepay tồn tại → bất khả cộng trùng.

### [tpos-pancake] Gửi tin: fallback N2 Extension bypass-24h khi Pancake API lỗi (giống native-orders) ✅

**Yêu cầu user**: "xử lý lỗi như bên native-orders → lỗi thì qua extension bypass". Khi gửi qua Pancake API thất bại (24h policy / token 105 / ...), tự động gửi lại qua N2 Extension (FB Business Suite GraphQL, bypass 24h) như native-orders.

**Cách làm**:

1. **Tách bridge dùng chung** [`web2/shared/web2-extension-bridge.js`](../web2/shared/web2-extension-bridge.js) (MỚI) — mirror `_extensionRequest` inline của native-orders: lắng nghe `EXTENSION_LOADED`/`EXTENSION_VERSION`, `request(type,data,ms)` qua `window.postMessage` + match `taskId` + `_SUCCESS`/`_FAILURE` + timeout. Expose `window.Web2Ext = {hasExtension, version, request}` + alias `window._w2ExtensionRequest`. Idempotent. Load trên tpos-pancake.
2. **Fallback trong send** [`pancake-chat-window.js`](../tpos-pancake/js/pancake/pancake-chat-window.js): `PancakeAPI.sendMessage` đã throw khi `success:false` → trong `catch`, nếu gửi TEXT (không kèm ảnh) + có extension → gọi `_trySendViaExtension(conv, text)`. OK → giữ message + toast "Đã gửi qua N2 Extension (bypass 24h)"; fail/không ext → hiện lỗi như cũ (không regression).
3. **`_trySendViaExtension`** (port từ native-orders `_handleSendMessage`): resolve **FB Global ID** (BẮT BUỘC — gửi PSID bị FB silent-reject 1545012) ưu tiên Pancake API (`Web2Chat.fetchMessages` → `customers[].global_id`), fallback extension `GET_GLOBAL_ID_FOR_CONV`; rồi `REPLY_INBOX_PHOTO` `{pageId, globalUserId, threadId, convId:'t_'+threadId, message, attachmentType:'SEND_TEXT_ONLY', isBusiness:true}`. Ảnh KHÔNG gửi qua extension (giống native-orders).
4. **Chỉ báo kênh gửi honest** `.pk-reply-from`: "🚀 N2 Extension (bypass 24h)" khi ext ready, ngược lại "Gửi qua Pancake API" + tên page thật (derive từ `state.pages` theo `conv.page_id`). CSS `.pk-send-via`.

**Verify**: `node --check` OK cả 2 file. ⚠ Live re-verify chưa chạy được vì cửa sổ browser session đóng giữa chừng — code syntax-check + port nguyên pattern proven của native-orders. Headless không có extension → fallback trả false → vẫn hiện lỗi (không regression); chỉ browser thật có N2 extension mới bypass được.

**Files**: `web2/shared/web2-extension-bridge.js` (mới), `tpos-pancake/js/pancake/pancake-chat-window.js`, `tpos-pancake/css/pancake-chat.css`, `tpos-pancake/index.html`. Status: ✅ Done (code), ⚠ cần test trên browser thật có extension.

### [render] Cron server re-khớp GD "chưa gán KH" định kỳ (không cần mở trang) ✅

**Vấn đề user**: balance-history reprocess GD "chưa gán" CHỈ chạy khi mở trang (`autoReprocessOnLoad` client-side). Cả ngày không ai mở → GD về mà SĐT chưa có trong DB lúc webhook fire sẽ kẹt "chưa gán" mãi. Auto-credit lúc tiền vào vẫn server-side OK; chỉ thiếu phần **retry khớp** server-side.

**Files**:

- `render.com/services/web2-sepay-matching.js` — thêm export `reprocessUnmatched(db, fetchWithTimeout, {limit, sampleLimit})`: tách query + loop processWeb2Match ra hàm dùng chung (DRY).
- `render.com/routes/v2/web2-balance-history.js` — route `POST /reprocess-unmatched` refactor gọi hàm chung (giảm ~55 dòng, cùng hành vi).
- `render.com/services/web2-reprocess-cron.js` (MỚI) — `startCron(db, reprocessFn, {intervalMs, limit})`, guard `_running` tránh chồng tick, chỉ log khi có match/pending.
- `render.com/server.js` — wire cron sau retry cron (delay 8s), interval 10 phút, limit 200, `sampleLimit:0`.

**Khác web2-webhook-retry**: retry queue chỉ re-run webhook bị crash/exception; cron này nhắm GD đã insert OK nhưng auto chưa khớp được KH (debt_added=false, chưa pending). Không đụng row `pending_match`/`pending_low_confidence` (chờ user pick).

**Verify**: `node --check` 4 file OK. Cron tick log `[web2-reprocess-cron]` trên Render khi có GD khớp được.

### [tpos-pancake] Restyle quick-reply panel chat giống native-orders (tag chip màu + /shortcut autocomplete) ✅

**Yêu cầu user**: "giao diện panel chat pancake giống native-orders" (kèm screenshot chat native-orders: thanh tag chip màu, ô soạn /shortcut). Chọn scope: **restyle panel hiện tại** (giữ cột chat pk-\*, data flow vừa fix — không port full sang shared/modal).

**Cách làm** (đối chiếu native-orders `W2_DEFAULT_QUICK_TAGS` + `.w2-quick-tag`):

1. [`pancake-state.js`](../tpos-pancake/js/pancake/pancake-state.js) `quickReplies`: đổi 14 tag từ nhãn không dấu + color-class → **nhãn có dấu** ("NV My KH đặt", "NHẮC KHÁCH", "XIN ĐỊA CHỈ", "NV. Hạnh 🌷"...) + **template thật** (4 tag có nội dung) + **màu rgba(...,0.4)** y hệt native-orders.
2. [`pancake-chat-window.js`](../tpos-pancake/js/pancake/pancake-chat-window.js) `renderQuickReplies()`: 2 hàng cố định 7 nút → **1 hàng chip wrap**, nền inline `style="background:<rgba>"`.
3. [`pancake-chat.css`](../tpos-pancake/css/pancake-chat.css): `.pk-quick-reply-bar`/`-row`/`-btn` restyle khớp `.w2-quick-tag` (chip nhỏ 10px, chữ trắng + text-shadow, radius 3px, padding 3px 9px, wrap gap 3px, nền trắng). Bỏ color-class cũ + rule "Second row" thừa.
4. Composer: placeholder → "Nhập tin nhắn gửi cho khách… (Enter để gửi, /shortcut để chèn mẫu)"; chip click → paste template **+ chữ ký NV** (`Web2QuickReply.signature()`); load [`web2/shared/web2-quick-reply.js`](../web2/shared/web2-quick-reply.js) + `attachAutocomplete(#pkChatInput)` cho `/shortcut` (module dùng chung native-orders).

**KHÔNG làm** (có lý do): chỉ báo "🚀 N2 Extension bypass 24h" — tpos-pancake gửi qua Pancake official API, KHÔNG qua extension → thêm sẽ sai/lừa người dùng. Icon header thừa (person/box) — không có handler, tránh nút chết.

**Verify live**: reload → mở hội thoại → 14 chip màu render đúng (nhãn có dấu "NV My KH đặt", bg rgba(33,68,247,.4), template "Dạ shop xác nhận đơn..."); placeholder mới; `Web2QuickReply` loaded. Screenshot `downloads/n2store-session/pk-restyled-chips.png`.

**Files**: `tpos-pancake/js/pancake/pancake-state.js`, `pancake-chat-window.js`, `tpos-pancake/css/pancake-chat.css`, `tpos-pancake/index.html`. Status: ✅ Done.

### [tpos-pancake] Fix panel Chat Pancake không hiện hội thoại (0 pages) — sync JWT từ Render DB như native-orders ✅

**Bug user báo**: Panel "Chat Pancake" bên phải tpos-pancake hiển thị "Tất cả Pages / **0 pages**" và chỉ vài hội thoại (hoặc rỗng). Yêu cầu: hiện tất cả hội thoại + test tìm kiếm/inbox/gửi hình/voice, hoạt động giống native-orders.

**Root cause** (debug qua persistent browser session, console-first):

- Console: `[PANCAKE-TOKEN] No valid token found. Please login to Pancake.vn`, `[PK-RT] start-multi failed: no_accounts`, `no_token_or_uid`.
- tpos-pancake's `pancakeTokenManager` đọc JWT từ localStorage key `pancake_jwt_token` + Firestore — nhưng **không có token nào** (không ai login Pancake.vn). → `pageIds: []` → `fetchConversations` return `[]` (guard `if pageIds.length===0`).
- native-orders hoạt động vì gọi `Web2Chat.syncFromRenderDB()` → kéo JWT (+ page tokens) từ **Render DB** (`/api/pancake-accounts` + `/api/pancake-page-tokens`) ghi vào **CÙNG key** `pancake_jwt_token`. tpos-pancake chưa từng load Web2Chat / gọi sync.

**Fix** (contained, low-risk — không rewrite stack Pancake):

1. [`tpos-pancake/index.html`](../tpos-pancake/index.html) — load `../web2/shared/web2-chat-client.js` TRƯỚC `pancake-token-manager.js`.
2. [`pancake-token-manager.js`](../tpos-pancake/js/pancake/pancake-token-manager.js) — `getToken()` thêm **Priority 2.5**: khi localStorage miss → `getTokenFromWeb2Chat()` gọi `Web2Chat.syncFromRenderDB({force:true})` (ghi JWT vào cùng key) + merge page access tokens, rồi re-read localStorage. Self-heal giống native-orders.
3. [`pancake-api.js`](../tpos-pancake/js/pancake/pancake-api.js) `sendMessage()` — fix **silent-failure bug**: trước đây HTTP 200 với body `success:false` (error 105/100) bị trả về như "đã gửi" → push object lỗi vào thread. Giờ: detect `success:false` → throw reason thật (chat-window show Popup.error + remove temp bubble). Thêm: error 105 "access_token renewed" → mint page token mới qua `Web2Chat.generatePageAccessToken` + retry 1 lần (chỉ khi token đổi → tránh double-send).

**Verify live** (persistent browser session, localhost:8080):

- ✅ Sau fix: page selector "0 pages" → **2 pages** (Nhi Judy House + NhiJudy Store, unread 1064); conversations **0 → 52** rows render.
- ✅ Search: gõ "Trang" → filter đúng 3 KH (Trang Thùy, Trang Lê).
- ✅ Tab Inbox: click → `activeFilter:inbox`, đúng 9 hội thoại (9 INBOX / 50 COMMENT).
- ✅ Mở hội thoại: fetch 25 messages qua `/api/pancake-direct/.../messages` (200), mark-read 200.
- ⚠ Send (text/hình): wired đúng (`{action:reply_inbox, message, conversation_id, customer_id}`), nhưng môi trường test fail với error 105/100 (page access token stale + không có N2 extension). Đây là **giới hạn chung với native-orders** — send tin cậy đi qua extension (`REPLY_INBOX_PHOTO`, bypass 24h + token). Trên browser thật có extension + token tươi thì gửi được. KHÔNG gửi tin thật cho KH thật khi test (DB-safety rule).
- ℹ Voice: **không hỗ trợ GỬI** ở cả tpos-pancake LẪN native-orders (chỉ render audio nhận được). Không có sẵn để "giống native-orders".
- KH test "Huỳnh Thành Đạt — 0123456788": là test customer DB-only (orders/PBH), **không có hội thoại Pancake** → test bằng hội thoại thật (read-only) + send chặn an toàn.

**Files**: `tpos-pancake/index.html`, `tpos-pancake/js/pancake/pancake-token-manager.js`, `tpos-pancake/js/pancake/pancake-api.js`. Status: ✅ Done (conversation loading), ⚠ send phụ thuộc extension/token tươi (như native-orders).

### [tpos-pancake] Silent snap toasts — bỏ thông báo khi snap/chụp hình ✅

**Yêu cầu user**: "tpos-pancake → không cần thông báo khi snap shot và chụp hình".

**Cách làm**: Update `_toast()` trong [`tpos-pancake/js/tpos/tpos-livestream-snap.js:396`](tpos-pancake/js/tpos/tpos-livestream-snap.js#L396) — chỉ show notification khi `type === 'err'`. Success/ok/info → console.log only (giữ debug trace). 59 toast call sites đều route qua `_toast()` nên fix 1 chỗ ăn toàn module.

**Files**: `tpos-pancake/js/tpos/tpos-livestream-snap.js`, `tpos-pancake/index.html` (cache bump v20260602a).

### [test] E2E livestream verify — tpos-pancake → native-orders → PBH → KPI → cancel + SSE realtime ✅

**Yêu cầu user**: browser test toàn bộ Web 2.0 — cart từ tpos-pancake, add/remove products, PBH, chia KPI range, hủy PBH, inventory, all menu pages, realtime sync.

**Test scope** (sau khi xóa hết 13 đơn cũ + reset STT seq):

- **Phase B** (cart create): 5 đơn — 3 HOUSE 02/06/2026 (NW-0001/0002/0003) + 2 STORE 02/06/2026 (NW-0004/0005). 1 đơn có 2 SP.
- **Phase C** (STT grouping): `campaignStt = displayStt = 1..5` chia chung cho STORE+HOUSE 02/06/2026 ✅ (normalized key "02/06/2026" hoạt động đúng).
- **Phase D** (add/remove): `NativeOrdersApi.update(code, {products: [...]})` → add 1 SP → remove 1 SP → state correct.
- **Phase E** (PBH + KPI): `POST /api/fast-sale-orders/from-native-order {force:true}` → HD-20260602-0001. KPI ranges PUT saved 2 employees STT 1-3 + STT 4-5, history persisted.
- **Phase F** (cancel PBH): state="cancel" ✅.
- **Phase G** (inventory): SKIPPED — fake KHO-TEST-\* products không có stock rows.
- **Phase H** (smoke menu): 26 pages HTTP 200, 0 5xx errors.
- **Phase I** (SSE realtime): `Web2SSE.subscribe('web2:native-orders', cb)` → mutate via API → event nhận **~200ms** với payload `{action:'update', code:'NW-...', ts}`.
- **Phase J** (UI-first): 10/18 main `*app.js` files dùng `Web2Optimistic.run`.

**Cleanup**: 5 test orders deleted, KPI ranges reset, PBH cancelled.

### [issue-tracking] BÁN HÀNG: hiện Người bán (NV) dưới tên khách ✅

**Yêu cầu user**: Hiện tên người bán (data trong PBH TPOS, như dòng "Người bán: MY CSKH (LIVE)" trên phiếu in) kế bên tên khách để biết NV nào đã bán.

**Files**:

- `issue-tracking/js/tpos-fastsale-tab.js` — `sellerLine(row)` render `<div.tpos-fso-seller>` (icon user-round + tên) từ field `row.UserName` (fallback `CreateByName`) — **đã có sẵn trong GetView, không cần fetch thêm**. Chèn dưới `.tpos-fso-customer` cho invoice + refund row. Bump `?v=20260602h`.
- `issue-tracking/css/page-tabs.css` — `.tpos-fso-seller` (badge tím nhạt, ellipsis).

**Verify local**: 8/8 row hiện NV đúng — NJD/2026/70243 → "MY CSKH (LIVE)" (khớp phiếu in), 70242 → "Giang Giang", 70241 → "nvkt". 0 lỗi. Status: ✅ Done.

### [issue-tracking] BÁN HÀNG: resolve "ai hủy" từ TPOS AuditLog cho MỌI đơn (kể cả hủy bên TPOS) ✅

**Yêu cầu user**: Không chỉ đơn hủy qua trang này — lấy luôn người hủy từ TPOS AuditLog cho mọi đơn đã hủy (kể cả hủy trực tiếp bên TPOS).

**Files**: `issue-tracking/js/tpos-fastsale-tab.js`

- `CancelByResolver` — queue throttle (MAX 4 concurrent) fetch AuditLog cho đơn `State==='cancel'` chưa có CancelLogStore entry. `_attempted` Set chống refetch; **xóa khỏi `_attempted` khi token chưa sẵn / lỗi / exception** → cho retry render sau (fix: trước đó fail 1 lần là không bao giờ resolve).
- `parseCancelFromAudit(entries)` — TPOS ghi cancel là entry `UPDATE`, Description `"- Trạng thái: ... => Hủy bỏ."`, `UserName` = người hủy. Regex `/Trạng thái/ && /(Hủy bỏ|Đã hủy)/`, lấy entry mới nhất → `{user, ts: DateCreated}`.
- `render()` cuối gọi `resolveCancelledBadges()`. `_fetchCancelBy` → `CancelLogStore.record(id,number,user,ts,'tpos')` (persist Firestore cross-device → máy khác khỏi fetch lại) + inject badge ngay vào cell.
- `CancelLogStore`: thêm param `ts`+`source`, `onSnapshot` re-render **debounce 400ms** (gom burst khi resolve hàng loạt). Bump asset `?v=20260602f`.

**Verify local**: Clear Firestore → fresh load (không trigger tay) → 2/2 đơn đã hủy auto-resolve: NJD/2026/70234 → `nvktlive1 · 02/06/2026 14:46`, NJD/2026/70144 → `nvktlive1 · 12:03`. 0 lỗi. Status: ✅ Done.

### [issue-tracking] BÁN HÀNG: lưu "ai đã hủy" + hiện cạnh badge "Đã hủy" ✅

**Yêu cầu user**: Khi hủy phiếu → lưu số HĐ + tên user hủy → hiện lên bảng kế bên chữ "Đã hủy".

**Files**:

- `issue-tracking/js/tpos-fastsale-tab.js` — `CancelLogStore` (Firestore doc `fast_sale_cancel_v2/main`, field `data` = `{<orderId>:{number,user,ts}}`, cross-device, có `onSnapshot` listener → re-render light các tab loaded). `executeCancelSale` capture `Number` + `currentUserName()` (từ `window.authManager.getCurrentUser().username`) trước reload → `CancelLogStore.record()`. `cancelByBadge(row)` render `<span.tpos-cancel-by>` (icon user-x + tên) cạnh badge khi `State==='cancel'` & có log. Status cell invoice+refund bọc `.tpos-state-wrap` (stack dọc). Bump asset `?v=20260602c`.
- `issue-tracking/css/page-tabs.css` — `.tpos-state-wrap` (flex column) + `.tpos-cancel-by` (badge đỏ nhạt, ellipsis 130px).

**Verify local**: Playwright — Firestore write → onSnapshot fire → re-render → badge "admin-test" hiện cạnh "Đã hủy" trên row NJD/2026/70234, tooltip "Hủy bởi admin-test · 02/06/2026 15:20". 0 lỗi. Note: legacy layer (Web 1.0) nên dùng Firestore listener là chuẩn (như InvoiceStatusStore). Status: ✅ Done.

### [issue-tracking][render] BÁN HÀNG: realtime sync hủy phiếu cross-tab/máy (SSE) ✅

**Yêu cầu user**: Hủy phiếu ở máy/tab này → máy/tab khác đang mở danh sách tự cập nhật, không cần F5.

**Files**:

- `render.com/routes/realtime-sse.js` — thêm `POST /api/realtime/sse/fast-sale-orders` publish topic `fast_sale_orders` (eventType `update`, payload `{action,id,ts}` không PII). Hub Web 1.0, bare snake_case topic.
- `issue-tracking/js/tpos-fastsale-tab.js` — `SaleOrderSync` singleton: subscribe `EventSource(/api/realtime/sse?keys=fast_sale_orders)` (chỉ tab entity FastSaleOrder), `update` → debounce 600ms → reload tab đã `loaded`; `executeCancelSale` sau khi hủy thành công gọi `SaleOrderSync.notify('cancel', id)` (POST keepalive). Bump asset `?v=20260602b`.

**Verify local**: SSE connect log `[tpos-fastsale] SSE connected: fast_sale_orders`, 100 rows, không lỗi. Cross-machine e2e cần Render deploy xong. Status: ✅ Done.

### [issue-tracking] BÁN HÀNG: nút Hủy phiếu (ActionCancel) + Lịch sử (AuditLog) như TPOS ✅

**Yêu cầu user**: Trang `issue-tracking/index.html#ban-hang` cho **hủy phiếu bán hàng** (không phải xóa) + xem **Lịch sử** như tab "Lịch sử" của TPOS. Hủy thử đơn test `NJD/2026/70234` (Huỳnh Thành Đạt).

**Files**:

- `issue-tracking/js/tpos-fastsale-tab.js` — thêm `saleActionsCell(id,state)` (In bill · Lịch sử · Hủy phiếu) thay `printCell` cho invoice + refund row; handlers `data-action="history"|"cancel"`; methods `openHistory()` (fetch AuditLog), `openCancelConfirm()` + `executeCancelSale()` (POST ActionCancel, await+loading vì là state mutation); singleton modals `ensureHistoryModal()` + `ensureCancelModal()`.
- `issue-tracking/css/page-tabs.css` — `.tpos-fso-row-history` (tím), `.tpos-fso-row-cancel` (cam), full style 2 modal (history feed + cancel confirm).
- `issue-tracking/index.html` — header cột "In bill" → "Thao tác" (width 120) cho 2 bảng invoice+refund; bump asset `?v=20260602a`.

**Endpoints TPOS** (discover qua Playwright login + capture network):

- Lịch sử: `GET /api/odata/AuditLog/ODataService.GetAuditLogEntity?entityName=FastSaleOrder&entityId={id}&skip=0&take=50` → `value[]{Action,DateCreated,UserName,Description}`. Action `INSERT`→"Thêm mới", `UPDATE`→"Cập nhật", `CANCEL/DELETE`→"Hủy/Xóa".
- Hủy: `POST /api/odata/FastSaleOrder/ODataService.ActionCancel` body `{ids:[<int>]}` → 204.

**Verify**: Playwright localhost — 100 rows, 100 nút Lịch sử, 97 nút Hủy (3 phiếu đã hủy ẩn nút). History modal "NJD/2026/70234" hiện đúng 2 entry Cập nhật/Thêm mới. Đã **thực sự hủy** đơn test 438499 qua API → State `open`→`cancel`, AuditLog log thêm entry "Trạng thái". Status: ✅ Done.

### [native-orders] Bỏ nút Reset STT + group STORE/HOUSE thành 1 campaign cho STT ✅

**Yêu cầu user**: (1) Xóa hết dữ liệu đơn hàng cũ. (2) Bỏ nút Reset STT — STT auto chạy 1→n theo campaign, campaign khác reset 1→n. 2 page STORE + HOUSE coi như 1 campaign.

**Cách làm**:

- Bulk DELETE 13 đơn test cũ qua `NativeOrdersApi.remove` loop + reset `display_stt` sequence về 1.
- Xóa button `#btnResetStt` trong [`native-orders/index.html:188-198`](native-orders/index.html#L188-L198) + function `resetStt()` trong [`native-orders-app.js`](native-orders/js/native-orders-app.js) (~30 dòng) + event listener.
- Update SQL trong `INSERT` của `/api/native-orders/from-comment` ([`render.com/routes/native-orders.js:811-833`](render.com/routes/native-orders.js#L811)): scope `MAX(campaign_stt) + 1` theo **normalized campaign group key** thay vì `live_campaign_id`. Group key = `live_campaign_name` sau khi strip prefix `^(STORE|HOUSE)\s+` (case-insensitive). Fallback: `live_campaign_id` → `'NO_CAMPAIGN'`.

**Kết quả**:

- `STORE 29/05/2026` + `HOUSE 29/05/2026` → cùng key `29/05/2026` → STT chung 1..n.
- `STORE 22/05/2026` + `HOUSE 22/05/2026` → cùng key `22/05/2026` → STT riêng 1..n.
- `(no campaign name)` → fallback `live_campaign_id` hoặc `NO_CAMPAIGN`.
- Endpoint `/reset-stt` giữ lại (defensive — internal dùng cho sequence reset, không user-facing).

**Files**:

- `native-orders/index.html` (xóa button)
- `native-orders/js/native-orders-app.js` (xóa function + listener)
- `render.com/routes/native-orders.js` (normalize campaign group key trong INSERT SQL)
- `docs/dev-log.md`

**Status**: ✅ Frontend xóa data + button live ngay; backend SQL chờ Render redeploy (~3-5 min) để new orders dùng grouped STT.

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
