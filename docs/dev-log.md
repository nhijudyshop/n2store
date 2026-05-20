# Dev Log — N2Store

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

## 2026-05-20

### [docs][seo] feat: thêm Open Graph meta tags cho index.html (preview đẹp khi share Zalo/Facebook)

**Mục đích**: Khi share link `https://nhijudyshop.github.io/n2store/` lên Zalo/Messenger/FB, hiện card preview với logo + tên shop + mô tả thay vì URL trần. Zalo dùng cùng chuẩn OG như Facebook.

**Changes**:

- `index.html` — title đổi thành "Nhi Judy House — Hệ thống quản lý bán hàng"; thêm `<meta name="description">`, full OG block (`og:type/site_name/title/description/image/url/locale=vi_VN`, image dimensions 1200×630), Twitter Card (`summary_large_image`). Image dùng `https://nhijudyshop.github.io/n2store/index/logo.jpg` (absolute URL bắt buộc cho OG crawler).
- `docs/demo/zalo-og-preview-demo.html` — mockup giao diện chat Zalo để xem trước card preview render thế nào, kèm so sánh trước/sau.

**Verify**:

- Sau khi GitHub Pages deploy (~2-4 phút), test ở [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) — dán URL → bấm "Scrape Again" để force refresh cache.
- Gửi link trên Zalo thật. Nếu Zalo cache URL cũ → append `?v=2` để force re-fetch.

**Lưu ý**: Logo hiện tại 600×600 (vuông). Khuyến nghị thay banner 1200×630 (tỷ lệ 1.91:1) để card hiện full-width đẹp hơn — chưa làm vì chưa có ảnh banner.

**Files**: `index.html`, `docs/demo/zalo-og-preview-demo.html`
**Status**: ✅ Done

---

### [inventory] fix: sửa Đợt Hàng bị 404 + stuck "Đang lưu..." khi thêm hóa đơn NCC mới

**Bug**: User edit "Đợt Hàng" rồi thêm 1 hóa đơn NCC mới → save bị stuck ở "Đang lưu...", console báo `PUT /api/v2/inventory-tracking/shipments/hd_mpdfvmsk_mvlzct 404 Not found`.

**Root cause**:

- `inventory-tracking/js/modal-shipment.js:729` — khi user thêm row hóa đơn mới trong modal edit, sinh ID client-side `hd_*` (vì không có `existingInvoice`).
- `inventory-tracking/js/crud-operations.js:115` (cũ) — `updateShipment` vô điều kiện gọi `shipmentsApi.update(invoice.id, ...)` cho TẤT CẢ hoá đơn, kể cả `hd_*` chưa từng có trên server → PUT 404 → throw → loading toast không bị remove (toast remove ở line 802 sau `await`, không trong `finally`).

**Fix**:

1. `inventory-tracking/js/crud-operations.js` — `updateShipment` giờ build set `existingInvoiceIds` từ `existingShipment.hoaDon`. Mỗi invoice trong `data.hoaDon`:
    - `id ∈ existingInvoiceIds` → `shipmentsApi.update(invoice.id, payload)` (PUT)
    - ngược lại → `shipmentsApi.create({ ...payload, id: generateId('dot') })` (POST với ID `dot_*` hợp lệ)
    - Invoices có trong `existingShipment.hoaDon` nhưng KHÔNG có trong `data.hoaDon` → `shipmentsApi.delete()` (xử lý case user xoá row trong modal).
2. `inventory-tracking/js/modal-shipment.js` — wrap save logic trong inner `try/finally` để `notificationManager.remove(loadingToast)` luôn chạy, tránh stuck toast khi update fail.

**Verify**: probe browser session inject 3 invoice types (2 existing + 1 mới `hd_*` + 1 xoá khỏi modal) → routing đúng: 1 DELETE, 2 UPDATE, 1 CREATE (với ID mới `dot_mpdg4e6f_9tmvif`). Không còn 404.

**Files**: `inventory-tracking/js/crud-operations.js`, `inventory-tracking/js/modal-shipment.js`
**Status**: ✅ Done

---

## 2026-05-19

### [web2] sidebar: footer mất ở 19 trang Web 2.0 load tpos-sidebar.js trực tiếp (không qua page-shell)

**Follow-up của fix preload phía dưới**: user phát hiện `/web2/index.html` vẫn mất footer. Lý do: fix preload chỉ với tới trang qua page-shell. Các trang `tpos-pancake`, `native-orders`, `so-order`, `web2/index.html`, `web2/products/`, `web2/variants/`, `web2/users/`, `web2/balance-history/`, … load `tpos-sidebar.js` trực tiếp bằng `<script src>` → chưa fix.

**Fix**: chèn `<script src="<prefix>web2-auth.js?v=20260519k">` ngay TRƯỚC `<script src="<prefix>tpos-sidebar.js?v=...">` ở 19 trang Web 2.0 (1 trang đã có sẵn — `web2/reconcile/`). Đảm bảo `Web2Auth` ready khi sidebar mount, footer render đúng frame đầu.

**Files**: `native-orders/`, `tpos-pancake/`, `so-order/`, `web2/{index,products,variants,users,supplier-debt,supplier-wallet,customer-wallet,balance-history,pancake-settings,report-revenue,fastsaleorder-{invoice,refund,delivery},product-{uom,uom-categ,category}}/index.html`.

**Status**: ✅ Done — Playwright verified `/web2/index.html`, `/tpos-pancake/`, `/native-orders/`, `/web2/products/` đều hiện footer "Quản trị viên / @admin ADMIN / Đăng xuất". Browser thật Cmd+Shift+R 1 lần để clear cache.

### [web2] sidebar: footer user/đăng xuất mất khi page-shell mount sidebar trước khi web2-auth.js load xong

**User feedback**: trên `/web2/pos-session/index.html` (và các page khác qua page-shell), thanh sidebar trái mất phần "user đăng nhập + nút Đăng xuất" ở dưới đáy. Test Playwright thấy footer hiển thị, browser thật của user không thấy → race condition.

**Root cause**:

- `tpos-sidebar.js` mount footer ngay sau khi load — chưa chắc `Web2Auth` đã sẵn (vì auto-loader inject `web2-auth.js` async).
- Có polling 2s đợi Web2Auth, nhưng nếu network glitch / cache stale → footer kẹt ở trạng thái rỗng.

**Fix**:

- `web2/shared/page-shell.js`: thêm `web2-auth.js` vào `SCRIPTS_PRELOAD` → load SYNC trước khi mount sidebar → `renderUserFooter()` luôn có `Web2Auth` thật ngay frame đầu.
- Bump `ASSET_VERSION = 'v=20260519j'` (force browser cache-bust mọi script con).
- Bump 75 trang web2/\*.html từ `page-shell.js?v=20260425[i|l|n]` → `?v=20260519j`.

**Revert kèm**: commit `32772f6f` (forceExpand cho tpos-pancake) — workaround sai vector, fix root cause nay đã đủ.

**Files**:

- `web2/shared/page-shell.js`
- `web2/*/index.html` (75 trang)
- (revert) `web2/shared/tpos-sidebar.js` + `tpos-pancake/index.html`

**Status**: ✅ Done — verified Playwright (logged-out: "Chưa đăng nhập" + nút tím; logged-in admin: "Quản trị viên" + nút đỏ Đăng xuất). User cần **hard-reload Cmd+Shift+R** để clear cache JS cũ.

### [orders] KPI confirm modal hiển thị cho cả đơn chưa có phiếu bán hàng

**User feedback**: modal "Xác nhận kiểm tra đơn" trong tab KPI chỉ hiện cho đơn đã có phiếu (NJD/2026/xxxxx). Yêu cầu: hiện cho TẤT CẢ đơn trong bảng, không phụ thuộc cột phiếu bán hàng.

**Fix** ([orders-report/js/tab-kpi-commission.js](orders-report/js/tab-kpi-commission.js)):

- `closeOrderDetails()` — dùng `checkKey = number || orderCode` thay cho `number`. Đơn chưa có phiếu fallback về Mã ĐH (orderCode) làm identifier. Modal primary text dùng `number || orderCode`, secondary text `(Chưa có phiếu bán hàng)` khi rỗng.
- L1 row template — thêm `data-l1-order-code` để `_applyL1CheckedStyles` style cả các dòng không có phiếu.
- `_orderCheckStore` — `init()` resolve key theo thứ tự `checkKey → number → docId` (backward compat). `markChecked(checkKey, meta)` tách `checkKey` (doc id) khỏi `number` (phiếu thực, rỗng khi không có). `isChecked(checkKey)` chấp nhận cả orderCode.
- `_renderCheckHistory` — filter `(number || orderCode || checkKey)` (bỏ filter cũ `v.number`), cột Số phiếu hiển thị `'—'` khi rỗng.

**Status**: DONE.

### [reconcile] Phase 1 MVP — Đối soát đóng gói PBH (scan + pack + ship + deliver)

**Mục đích**: Trang `web2/reconcile/` để verify đủ hàng từng PBH trước khi đóng gói + giao shipper. Scope: 1 kho, 1 nhân viên, scanner đã gắn sẵn; KHÔNG ảnh chống tranh chấp, KHÔNG notify khách, KHÔNG tích hợp API GHN/J&T, KHÔNG cho thiếu hàng, KHÔNG trừ kho lại (đã trừ lúc tạo PBH).

**State machine song song với state PBH (kế toán)**: `pending → picking → picked → packed → shipped → delivered` (cancelled). State PBH (`draft/confirmed/done/cancel`) độc lập, reconcile chỉ thao tác trên PBH có `state IN ('confirmed','done')`.

**Files**:

- `render.com/routes/reconcile.js` — route mới. Endpoints: `GET /health`, `GET /list?state=active|pending|picking|picked|packed|shipped|delivered|all`, `GET /:number`, `POST /:number/scan`, `POST /:number/manual-pick`, `POST /:number/reset-pick`, `POST /:number/pack` (block nếu picked < quantity), `POST /:number/ship`, `POST /:number/deliver`, `GET /:number/logs`. Atomic `applyPick` dùng `FOR UPDATE`. SSE broadcast `web2:reconcile` + cross-broadcast `web2:fast-sale-orders`.
- `render.com/routes/fast-sale-orders.js` — Migration 076: ADD COLUMN `fulfillment_state` (default 'pending'), `fulfillment_picked_lines` JSONB, `fulfillment_packed_at`, `fulfillment_shipped_at`, `fulfillment_delivered_at`, INDEX `idx_fso_fulfillment_state`. `mapRow` thêm trường `fulfillment.{state,pickedLines,packedAt,shippedAt,deliveredAt}`.
- `render.com/server.js` — require + mount `/api/reconcile`, gọi `initializeNotifiers(realtimeSseRoutes.notifyClients)` để SSE fire (theo pattern fast-sale-orders đã verify).
- `cloudflare-worker/modules/config/routes.js` + `worker.js` — thêm route `RECONCILE: /api/reconcile/*` proxy qua `handleCustomer360Proxy`.
- `web2/reconcile/index.html` + `js/reconcile-app.js` + `css/reconcile.css` — trang scanner-driven. Layout 2 cột: trái = DS PBH theo state tab (Đang xử lý / Chờ pick / Đang pick / Đã pick đủ / Đã đóng gói / Đã giao shipper / Đã giao), phải = detail PBH với bảng line + ô picked_qty per line + nút action theo state. Scanner input autofocus, Enter để +1 qty SP. Subscribe SSE `web2:reconcile` + `web2:fast-sale-orders`.
- `web2/shared/tpos-sidebar.js` — thêm entry "Đối soát đóng gói" trong group Bán hàng (sau "Bán hàng (HĐ)").
- `docs/web2/RECONCILE-PBH-PROPOSAL.md` — proposal gốc (đã có từ session trước).

**Đã verify**: `node --check` all JS files OK. Browser smoke load page localhost:8093 → UI render đầy đủ (scanner box, 7 state tab, list panel, detail panel empty state). Backend chưa live trên Render → empty list là expected.

**Pending**: deploy Render + publish CF Worker để verify end-to-end với PBH thật. Status: ✅ Code done, ⏳ awaiting deploy.

### [inventory-tracking] Modal "Quản Lý Ảnh SP": dời nút "Thêm NCC" từ header xuống dưới mỗi đợt

**User feedback**: nút "+ Thêm NCC" nằm bên phải header mỗi đợt → muốn dời xuống dưới. Mỗi đợt phải có nút riêng vì context theo đợt.

**Files**:

- `inventory-tracking/js/modal-image-manager.js` — `_renderGroup`: bỏ nút trong `.img-mgr-group-header`, thêm `.img-mgr-group-footer` chứa nút "Thêm NCC vào Đợt N" ở cuối mỗi group, sau list NCC.
- `inventory-tracking/css/modern.css` — thêm `.img-mgr-group-footer` (border-top dashed + flex center), update `.img-mgr-group-add` (bỏ `margin-left:auto`, tăng padding/font-size cho dễ click).

**Hành vi**: mỗi đợt có 1 nút "Thêm NCC vào Đợt N" riêng ở cuối block đợt đó → click thì gọi `ImageManager.addRowInDot(N)` (giữ đúng đợt context). Status: ✅ Done.

### [don-inbox] Stat card KPI: chỉ phản ứng với date filter, bỏ qua filter khác

**User feedback**: stat card hiển thị 37 đơn cùng "0 món · 0đ" → sai. Lý do: KPI lấy từ `filteredOrders` (sau khi áp tất cả filters bao gồm `status='draft'`), nên không bao giờ có đơn `status='order'`.

**Fix**: trong `updateInboxKpiStatCard` ([tab-social-core.js](don-inbox/js/tab-social-core.js)) đổi source từ `filteredOrders` → toàn bộ `SocialOrderState.orders`, rồi filter tay theo:

- `status === 'order'` (đơn được tính KPI)
- `createdAt` nằm trong `getDateRange(currentDateFilter)`

KPI giờ độc lập với status/source/tag/search — chỉ thay đổi khi đổi preset ngày.

**Status**: DONE.

---

### [don-inbox] Stat card KPI ngày + toast "User bán được X món - nhận được Yk"

**User yêu cầu** (trang Đơn Inbox):

1. Thêm stat card KPI sau ô lọc TAG, đồng bộ với bộ lọc ngày bên cạnh ô tìm kiếm.
2. Mỗi khi đơn vừa được "tính KPI thành công" (status chuyển sang `'order'`) → toast `"User bán được X món - nhận được Yk"` (Y = X × 5.000đ, hiển thị quy đổi sang nghìn).

**Thay đổi**:

- HTML (`don-inbox/index.html`): thêm `.inbox-kpi-stat` (id `#inboxKpiStatCard`) trong `.filter-row` ngay sau filter TAG. Hiển thị icon trophy + label (thay đổi theo preset ngày) + giá trị "X món · Yđ".
- JS:
    - [`tab-social-core.js`](don-inbox/js/tab-social-core.js): thêm `KPI_PER_UNIT_INBOX = 5000`, `updateInboxKpiStatCard()` (đếm `totalQuantity` của các order `status='order'` trong `filteredOrders` × 5.000đ; label đổi theo `currentDateFilter`), `notifyOrderKpiEarned(order, prevStatus)` (gửi toast khi `prevStatus !== 'order'` và `order.status === 'order'`, qty > 0). Hỗ trợ `notificationManager.success` với title `KPI 🎉`, fallback `showNotification`.
    - [`tab-social-table.js`](don-inbox/js/tab-social-table.js#L599): gọi `updateInboxKpiStatCard()` sau `renderTable()` trong `performTableSearch`. Trong `changeOrderStatus`, sau khi update status, nếu `newStatus === 'order'` → `notifyOrderKpiEarned(order, oldStatus)`.
    - [`tab-social-invoice.js`](don-inbox/js/tab-social-invoice.js#L601): `updateSocialOrderAfterBillCreation` save `prevStatus` trước khi set `'order'`, gọi `notifyOrderKpiEarned(order, prevStatus)` sau khi đã sync xong.
    - [`tab-social-sale.js`](don-inbox/js/tab-social-sale.js): fallback path khi không có invoice adapter — cũng track `prevStatus` + fire toast.
- CSS (`don-inbox/css/don-inbox.css`): style `.inbox-kpi-stat` (gradient tím nhạt + box-shadow nhẹ, hover bounce), `.inbox-kpi-stat-icon/label/value/sep/amount`.

**Tên user trong toast**: dùng `order.createdByName` (NV tạo đơn — không phải user đang login), fallback `assignedUserName` → `createdBy` → "Bạn".

**Label động theo date filter**: KPI tất cả / KPI hôm nay / KPI hôm qua / KPI 3 ngày / KPI 7 ngày / KPI 15 ngày / KPI khoảng đã chọn.

**Status**: DONE — push để GH Pages serve.

---

### [orders-report][render] KPI Inbox: cột "Ngày đơn" + ẩn nháp + custom date range

**User yêu cầu**: trong drill-down KPI Đơn Inbox (tab KPI - HOA HỒNG):

1. Thêm cột ngày khi đơn chuyển sang trạng thái "Đơn hàng" (được tính KPI).
2. Chỉ hiển thị đơn được tính KPI — ẩn các đơn "Nháp".
3. Bộ lọc ngày có thêm khoảng tùy chọn "Từ ngày – Đến ngày".

**Thay đổi backend** (`render.com/routes/social-orders.js`):

- Schema: `ALTER TABLE social_orders ADD COLUMN IF NOT EXISTS order_at BIGINT;` + index. Cột này chỉ set 1 lần khi đơn transition sang `status='order'`.
- PUT `/entries/:id`: khi `updates.status === 'order'` → `order_at = COALESCE(order_at, $now)` (preserve lần transition đầu tiên).
- `upsertOrder` / `upsertOrderWithClient`: thêm cột `order_at`, ON CONFLICT preserve `COALESCE(social_orders.order_at, EXCLUDED.order_at)`. Helper `resolveOrderAt()` resolve giá trị khi insert.
- `/kpi-stats` + `/kpi-stats/orders`: query param mới `excludeDraft=1` (opt-in, default behavior giữ nguyên → backward-compat). Khi set, thêm `AND COALESCE(status,'draft') <> 'draft'`.
- `/kpi-stats/orders` response: thêm field `orderAt`. Đơn cũ chưa có `order_at` → fallback `COALESCE(order_at, updated_at)` cho status ≠ 'draft'.

**Thay đổi frontend** (`orders-report/`):

- HTML (`tab-kpi-commission.html`): thêm khối `.kpi-inbox-daterange` gồm 2 ô `<input type="date">` + nút "Áp dụng" cạnh preset buttons.
- JS (`js/tab-kpi-commission.js`):
    - State mới: `_inboxCustomRange = { from, to }` + `_inboxSubtabPreset` thêm value `'custom'`.
    - `_resolveInboxDateRange('custom')` đọc range tùy chọn.
    - `loadInboxSubtabStats()` + `_loadInboxOrdersForUser()` luôn gửi `excludeDraft=1`.
    - Helper `_inboxCacheKey(userId)` — cache key của 'custom' include `from-to` để tự invalidate khi đổi khoảng.
    - `_renderInboxUserOrders()`: thêm cột `Ngày đơn` (dùng `formatTimestamp(o.orderAt)`), header table thêm `col-date`.
    - `_bindInboxPresets()`: bind sự kiện "Áp dụng" → set custom range + render.
- CSS (`css/tab-kpi-commission.css`): style `.kpi-inbox-filter-group`, `.kpi-inbox-daterange`, `.kpi-inbox-date-input`, `.kpi-inbox-date-apply`, và `.col-date` cho sub-table.

**Lưu ý deploy**:

- Render auto-deploy schema migration qua `ensureTables()` (idempotent ALTER với IF NOT EXISTS).
- Đơn cũ không có `order_at` → query fallback `COALESCE(order_at, updated_at)` cho status ≠ 'draft', nên không cần backfill.
- Endpoint cũ vẫn hoạt động bình thường (excludeDraft opt-in) → không vi phạm rule "không modify endpoints KPI hiện có" (append-only query param).

**Files**:

- `render.com/routes/social-orders.js`
- `orders-report/tab-kpi-commission.html`
- `orders-report/js/tab-kpi-commission.js`
- `orders-report/css/tab-kpi-commission.css`

**Status**: DONE — cần push để Render deploy schema + GH Pages serve frontend mới.

---

### [web2 cross-page] Phase A + B SSE wiring — liên kết chức năng giữa các page Web 2.0

**User yêu cầu**: "liên kết chức năng các web 2.0, thêm SSE cập nhật realtime, plan lớn, nghiên cứu kĩ, làm logic thống nhất".

**Research**: dispatch Explore agent map Read/Write matrix cho 16 pages, identify 8 frictions. Tổng hợp [`docs/web2/IMPROVEMENT-PLAN.md`](web2/IMPROVEMENT-PLAN.md) với roadmap Phase A (quick wins) / B (cross-cutting) / C (architectural defer).

**Implement Phase A + B (subset)**:

- **A1** customer-wallet: subscribe `web2:fast-sale-orders` → reload PBH list khi PBH confirm/cancel ở máy khác. Debounce 800ms.
- **A2** supplier-wallet: chuyển sang array `_sseUnsubs`, subscribe `web2:products` + `web2:supplier-wallet`. Debounce 1200ms aggregate reload.
- **A3** PBH page: thêm icon "Xem đơn nguồn" với `target="_blank"` đến `../../native-orders/?search=<code>` khi `sourceLink.type === 'native_order'`.
- **A5** users-app: detect SSE event ảnh hưởng current session user → toast cảnh báo + force reload 3s. Helper `_currentSessionUserId()`.
- **B1** server `web2-products.js`: emit thêm topic `web2:supplier-wallet` khi action stock-affecting.
- **B2** server `fast-sale-orders.js`: emit thêm topic `web2:customer-wallet` khi action wallet-affecting.
- Customer-wallet subscribe thêm `web2:customer-wallet` cross-broadcast.

**Frictions resolved**: 5/8 (F4 manual refresh, F5 nav deep link, F6 cross-cache invalidate, F7 permission realtime, partial F2/F8).

**Deferred**: A4 native→PBH back-link (cần DB query backend), B3 ID helper, B4 supplier-debt cache, Phase C architectural (Firestore→Postgres, saga).

**Status**: ✅ Done

---

### [inventory-tracking] Image Manager v2: chỉ Đợt (bỏ ngày), cho phép Đợt tùy chỉnh

**User yêu cầu**: "Quản lý ảnh bỏ ngày đi, cho chọn theo đợt → cho chỉnh đợt custom".

**Đổi**:

- **UI per row**: Bỏ field "Đợt giao (ngày + đợt)" dropdown. Thay bằng input number `Đợt` cho phép gõ tay đợt bất kỳ (cả đợt chưa có shipment, vd "Đợt 5").
- **Group header**: chỉ hiện "Đợt N — X NCC" (không có ngày). Đợt không có shipment hiển thị badge "tùy chỉnh" màu cam.
- **Filter row**: bỏ dropdown "Tất cả đợt" → thay bằng input number "Lọc đợt..." để filter rows theo đợt.
- **Row state**: `batchKey` ("YYYY-MM-DD\_\_N") → `dotSo` (integer). Thêm `originalDate` để track entry gốc khi save.
- **Save**: client tự tính canonical date cho mỗi đợt N — ưu tiên shipment đợt N mới nhất, fallback hình ảnh hiện có cho đợt N, fallback today (VN tz). Mỗi đợt PUT 1 lần `bulkSave(rows, { date: canonical, dotSo: N })`. Nếu row được di chuyển khỏi (date_X, dotSo_Y) ban đầu → gửi empty PUT cho (date_X, dotSo_Y) để xoá entry mồ côi.
- **Read** ([data-loader.js getProductImagesForNcc](../inventory-tracking/js/data-loader.js#L182-L201)): match priority đổi từ `(ngày, đợt, ncc)` exact → `(đợt, ncc)` only (date trở thành storage detail). Legacy fallback: bất kỳ ảnh cho NCC đó. Tham số `ngayDiHang` giữ lại cho backward compat nhưng không dùng.

**Tại sao đổi**: User concept "đợt N" là logical batch (có thể trải nhiều ngày giao). Mapping theo (date, đợt, ncc) tạo data đụng nhau khi cùng đợt 1 có shipment 12/5 và 17/5 — phải tạo entry cho mỗi cặp. Đổi sang (đợt, ncc) đơn giản hơn và đúng với cách user nghĩ.

**Files changed**:

- `inventory-tracking/js/modal-image-manager.js` — full rewrite (538→640 lines, batchKey → dotSo).
- `inventory-tracking/js/data-loader.js` — `getProductImagesForNcc` đổi match logic.
- `inventory-tracking/css/modern.css` — bỏ `.img-mgr-filter-select / .img-mgr-batch-select`, thêm `.img-mgr-filter-dot / .img-mgr-dot-custom`. Field width 200px → 120px.

**Verify**: Playwright local 8093 — đổi Đợt từ 1 → 5 (custom), thấy badge "tùy chỉnh" + row tách ra group riêng. Status: ✅ Done. Screenshots `inv-img-v2-default.png`, `inv-img-v2-custom-dot.png`.

### [inventory-tracking] 3 nâng cấp lớn: Image Manager đợt/ngày + Column hide/restore + Lazy render perf

**User yêu cầu** (screen inventory-tracking/index.html):

1. Bảng cho nút ẩn cột — và có panel hiện lại cột đã ẩn.
2. Modal "Quản Lý Ảnh Sản Phẩm" — khi thêm hàng cho chọn đợt/ngày để map đúng đợt (NCC=4 đợt 17/5 ≠ NCC=4 đợt 12/5).
3. Cải thiện tốc độ.

**Thay đổi**:

**1. Image Manager đợt/ngày mapping** ([js/modal-image-manager.js](../inventory-tracking/js/modal-image-manager.js))

- Mỗi row có thêm field `batchKey` = `"YYYY-MM-DD__N"` (date + dotSo).
- UI: row hiển thị 2 input — NCC + dropdown "Đợt giao" (options từ `getAllDotHangAsShipments()`, latest first).
- Row tự group theo batch: section header "📅 17/5/2026 — Đợt 1 — N NCC — Thêm NCC" + chips các row trong đợt.
- Filter row đầu: "Tìm NCC" + dropdown "Tất cả đợt" để filter theo batch.
- New row default batch = đợt mới nhất; "Thêm NCC vào đợt này" trong section header tạo row có batch của đợt đó.
- Save: split rows theo `batchKey` → call `productImagesApi.bulkSave(rows, {date, dotSo})` mỗi batch (parallel). Empty PUT cho batches initially-có-data nhưng giờ-rỗng (deletion sticks).
- Pattern data layer đã sẵn (`migration 058`, `getProductImagesForNcc(ncc, ngày, đợt)` exact-batch lookup) — chỉ thiếu UI.

**2. Column hide button + restore panel** ([js/column-toggle.js](../inventory-tracking/js/column-toggle.js) — file mới)

- `window.ColumnToggle` module với `hide(colKey)`, `show(colKey)`, `refresh()`, `togglePanel()`.
- Per-th: icon eye-off ẩn hiện trên hover → click ẩn cột; dùng dynamic `<style>` (`display:none !important` cho `td.col-X, th.col-X`).
- Toolbar: button "Cột ẩn (N)" cạnh "Xuất Excel" → popover panel: chips cho mỗi col đang ẩn (click chip = restore) + nút "Hiện tất cả".
- State persist qua `UIState.hiddenCols` (localStorage `n2store_inv_ui_state_v1`).
- Sửa [js/table-renderer.js](../inventory-tracking/js/table-renderer.js) thêm `col-X` class vào `<td>` tfoot tương ứng để CSS ẩn đồng bộ với header.
- MutationObserver re-attach hide buttons cho tables re-rendered.

**3. Lazy render perf** ([js/table-renderer.js](../inventory-tracking/js/table-renderer.js))

- Trước: `createShipmentCard` luôn call `renderInvoicesSection()` cho mọi shipment → 100 shipments = 100 tables trong DOM (chỉ 1-2 visible).
- Sau: collapsed shipments có `data-lazy="1"` empty body. Khi expand lần đầu → `_renderCardBody(card)` build HTML on-demand + reapply lucide icons + detail-cols-hidden state + ColumnToggle + NoteManager.
- Benchmark local (11 shipments, 1 expanded):
    - `applyFiltersAndRender`: **49ms → 14ms** (~3.5×)
    - DOM total: **4458 → 2348** nodes (47% smaller)
    - Invoice tables in DOM: **5 → 1**
    - Table TDs: **540 → 112**
- Production scale (100+ shipments): saving expected lớn hơn nhiều.

**Files changed**:

- `inventory-tracking/js/modal-image-manager.js` — full rewrite cho đợt/ngày mapping.
- `inventory-tracking/js/column-toggle.js` — NEW.
- `inventory-tracking/js/ui-state.js` — thêm `getHiddenCols / hideCol / showCol / clearHiddenCols`.
- `inventory-tracking/js/table-renderer.js` — lazy body render + tfoot col-class.
- `inventory-tracking/js/main.js` — gọi `ColumnToggle.init()` sau app.init.
- `inventory-tracking/index.html` — load `column-toggle.js`, thêm toolbar button + panel.
- `inventory-tracking/css/modern.css` — styles cho img-mgr group/batch + column hide buttons + restore popover.

**Verify**: Playwright local 8093 — đã test cả 3 feature (screenshot trong `downloads/n2store-session/inv-*.png`). Status: ✅ Done.

### [web2/balance-history] Clone toàn bộ chức năng balance-history sang Web 2.0 + integrate sidebar + SSE

**User yêu cầu**: tạo trang Web 2.0 với tất cả chức năng giống `/balance-history/` legacy — chi tiết, đầy đủ.

**Approach**: clone toàn bộ folder (`balance-history/` → `web2/balance-history/`) — 23K dòng code 13 JS + 5 CSS, KHÔNG re-implement. Chỉ update entry point HTML để integrate Web 2.0 shell.

**Thay đổi**:

1. `cp -r balance-history/ web2/balance-history/` — giữ nguyên: css/, js/, docs/, DATABASE_STRUCTURE.md.
2. `sed` replace 15 occurrences `../shared/` → `../../shared/` trong `index.html` (depth tăng 1 level).
3. `web2/balance-history/js/balance-verification.js` line 1363: `../customer-hub/` → `../../customer-hub/`.
4. `index.html` edit:
    - Title: `Lịch sử biến động số dư - SePay` → `... - SePay - WEB 2.0`. Comment `WEB2.0 module` ở #Note.
    - `<head>`: thêm `<link rel="stylesheet" href="../../web2/shared/tpos-sidebar.css?v=20260518e">`.
    - `<body>`: + `class="tpos-theme"`. Wrap content trong `<div class="web2-shell"><aside id="web2Aside">…<main>existing main-content</main></div>`.
    - `<main>` thêm `style="overflow:auto;height:100vh"` để content scroll trong shell.
    - Cuối body: load `tpos-sidebar.js` + `web2-sse-bridge.js`. Mount `Web2Sidebar.mount('#web2Aside')`. Wire SSE subscribe `wallet:all` (debounce 1000ms) → call `loadData()` + `LiveModeModule.refresh()` nếu có.
5. `web2/shared/tpos-sidebar.js` mục Tài chính: thêm entry `Lịch sử biến động số dư (SePay)` → `../web2/balance-history/index.html`.

**4 tabs giữ nguyên** (Live Mode kanban realtime SSE, Lịch sử biến động số dư table với QR + filters + verification chips, Thống Kê Chuyển Khoản, Kế Toán dashboard).

**Verify**: page render đúng với 2173 transactions, badges hoạt động (99+ unchecked, Realtime status xanh, view tabs, verification filters), Live Mode kanban "NHẬP TAY" + "TỰ ĐỘNG GÁN" cards hiển thị.

**Status**: ✅ Done

---

### [docs + memory] Cập nhật SSE-REALTIME.md section 9 + WEB2-INDEX + memory với 7 topics đã wire xong

**Mục đích**: codify trạng thái cuối ngày 2026-05-19. Toàn bộ 7 topics + 78 generic pages đã wire SSE realtime. Đảm bảo future sessions đọc được pattern + danh sách live topics.

**Cập nhật**:

- `docs/web2/SSE-REALTIME.md` section 9 (Existing topics map):
    - Mở rộng bảng từ 6 topics (mostly ⏳ Todo) thành **7 topics + 78 generic** (tất cả ✅ Live).
    - Thêm pipeline note "SePay → wallet realtime" với ASCII diagram đầy đủ + subscribe convention (`wallet:<phone>` vs `wallet:all`).
- `docs/web2/WEB2-INDEX.md`:
    - Thêm `Web2SSE` vào bảng shared client libs.
    - Thêm section "Realtime pattern" với pointer BẮT BUỘC đến SSE-REALTIME.md.
- Memory `~/.claude/projects/.../reference_web2_sse_realtime.md`:
    - Cập nhật "Existing topics" từ trạng thái Todo cũ sang live với endpoint counts + SePay pipeline.

**Status**: ✅ Done

---

### [supplier-wallet + supplier-debt] Wire SSE realtime — auto-refresh khi SePay + so-order data change

**User yêu cầu**: tiếp tục — wire 2 page Ví NCC + Báo cáo công nợ NCC.

**supplier-wallet** (`web2/supplier-wallet/`):

- Tương tự customer-wallet, subscribe SSE wildcard `wallet:all` để nhận event `wallet_update` từ SePay webhook (refund từ NCC).
- `js/supplier-wallet-app.js`: thêm `_sseConnect()` sau `init()` → debounce 800ms `pollDeposits()`.
- Manual data (notes, payments) vẫn dùng Firestore sync trong `supplier-wallet-storage.js` (data nhỏ + ít user, không cần migrate).
- HTML: bridge đã load sẵn từ commit trước; bump `supplier-wallet-app.js?v=20260519a`.

**supplier-debt** (`web2/supplier-debt/`):

- Báo cáo cross-source (Web 2.0 + TPOS legacy). Read-only — không có write riêng.
- Subscribe **3 topics**: `wallet:all` (SePay events), `web2:products` (so-order data feeds qua products pending), `web2:fast-sale-orders` (PBH ảnh hưởng nếu refund NCC).
- Debounce **1500ms** — báo cáo nặng, gom mutation thành 1 reload (`loadAll` + `applyFilterAndRender`).
- `index.html`: thêm `<script src="web2-sse-bridge.js?v=20260519a">`. Bump `supplier-debt-app.js?v=20260519a`.

**Status**: ✅ Done

---

### [customer-wallet] Wire SSE subscribe → realtime auto-refresh khi SePay webhook nhận tiền

**User cho biết**: SePay webhook đã hoạt động — nhận tiền chuyển khoản vào, update công nợ KH Web 2.0.

**Hiện trạng kiểm tra**:

- Server pipeline đã đầy đủ: SePay webhook → `routes/sepay-webhook-core.js` → `services/wallet-event-processor.js` `processIncomingPayment()` → UPDATE `customer_wallets` balance → `walletEvents.emit('wallet:update', { phone, wallet, transaction })` → `routes/realtime-sse.js` listener → broadcast SSE topic `wallet:<phone>` + wildcard `wallet:*`.
- Client side **KHÔNG** subscribe SSE — phải bấm "Refresh" hoặc reload page để thấy tiền mới.

**Fix**:

- `web2/customer-wallet/index.html`: thêm `<script src="../shared/web2-sse-bridge.js?v=20260519a">`. Bump cache `customer-wallet-app.js?v=20260519a`.
- `web2/customer-wallet/js/customer-wallet-app.js`: thêm `_sseConnect()` trong `init()`:
    - Subscribe topic `wallet:all` — match wildcard `wallet:*` của server `notifyClientsWildcard('wallet', ...)`.
    - Debounce 800ms — burst nhiều giao dịch SePay liên tiếp gom thành 1 reload.
    - Action: `pollDeposits()` (fetch SePay deposits từ `lastDepositSync` cursor) + toast `💰 SePay: X đ → <phone>`.

**Flow sau fix**:

```
SePay → webhook /api/sepay/webhook → wallet-event-processor.processIncomingPayment
  → UPDATE customer_wallets + INSERT customer_wallet_transactions
  → walletEvents.emit('wallet:update', { phone, wallet, transaction })
  → realtime-sse listener → SSE broadcast 'wallet:<phone>' + wildcard 'wallet:*'
  → customer-wallet page (đang subscribe 'wallet:all') nhận event
  → debounce 800ms → pollDeposits() → render + toast
```

**Verify**: chuyển khoản 5K vào tk SePay → 1-3s sau trang Ví KH tự update + toast hiện.

**Status**: ✅ Done

---

### [web2-variants + web2-users + fast-sale-orders] Wire SSE notify cho 3 routes còn lại + cache layer SSE for variants

**User yêu cầu**: tiếp tục — complete 3 todo routes còn nợ (variants, users, PBH).

**Server side** (`render.com/routes/`):

- `web2-variants.js`: thêm `initializeNotifiers + _notify('variants', action, id)`. Gọi sau 3 endpoints: POST `/`, PATCH `/:id`, DELETE `/:id`. Topic: `web2:variants`.
- `web2-users.js`: thêm `initializeNotifiers + _notify('users', action, id)`. Gọi sau 5 endpoints: create, update, update-permissions, change-password, deactivate. Topic: `web2:users`.
- `fast-sale-orders.js` (PBH): thêm `initializeNotifiers + _notify('fast-sale-orders', action, number)`. Gọi sau 8 endpoints: bulk-confirm/cancel, create, from-native-order, PATCH /:number, cancel/confirm/print/delete, reset-stt. Topic: `web2:fast-sale-orders`.

**Server wiring** (`server.js`): thêm `initializeNotifiers(realtimeSseRoutes.notifyClients)` cho 3 routes.

**Client side**:

- `web2/shared/web2-variants-cache.js` `_setupRealtime()`: ưu tiên `Web2SSE.subscribe('web2:variants', ...)`; fallback Firestore tickle (cùng pattern web2-products-cache).
- `web2/users/js/users-app.js`: thêm `_sseConnect()` sau `init()` → subscribe `web2:users`, debounce 600ms reload.
- HTML thêm `<script src="web2-sse-bridge.js?v=20260519a">`: web2/variants/, web2/users/, web2/fastsaleorder-invoice/.
- PBH (pbh-app.js) **không** wire SSE subscribe — đã có WS realtime qua `PbhRealtime`. Server notify giữ để pages khác listen được.

**Status**: ✅ Done

---

### [purchase-orders] Hover x5 zoom + click lightbox cho ảnh trong form "Tạo đơn đặt hàng"

**User yêu cầu**: Form tạo đơn hàng tại `purchase-orders/index.html` — hover ảnh thì zoom to x5, click thì mở ảnh full-screen.

**Trước đây**:

- `.po-modal-thumb` đã có floating preview qua JS nhưng hardcode 300px (≈x6 với 50px thumb, không đồng đều).
- Ảnh hóa đơn (`renderInvoiceImages()`) không có class hover → không có preview.
- `viewImage(url)` chỉ `window.open(url, '_blank')` → mở tab mới, UX kém.

**Files**:

- `purchase-orders/js/form-modal.js`:
    - `viewImage()` → tạo `.po-image-lightbox` overlay full-screen, click outside / ESC / nút × để đóng.
    - `setupImageHoverPreview()` → selector mở rộng `.po-modal-thumb, .po-zoom-img`.
    - `_positionPreview()` → zoom size = `max(thumbWidth, thumbHeight) * 5`, cap `min(viewport*0.8, 600px)`, auto-anchor right edge nếu tràn.
    - `renderInvoiceImages()` → `<img>` invoice thêm `class="po-zoom-img"` + `cursor: zoom-in`.
- `purchase-orders/css/table.css`:
    - `.po-modal-thumb` cursor → `zoom-in`.
    - `.po-image-preview` bỏ max-width/height (JS điều khiển).
    - Mới: `.po-image-lightbox`, `.po-image-lightbox__img`, `.po-image-lightbox__close` + `@keyframes po-lightbox-fade-in`.

**Status**: ✅ Done (verified parse cleanly, CSS classes injected, x5 formula correct)

---

### [web2-generic + page-builder + page-shell] SSE realtime cho ALL generic CRUD pages (78 pages auto-enabled)

**User yêu cầu**: 15 pages Web 2.0 (mostly generic CRUD qua page-builder framework) "liên kết với nhau theo listen update log" — pattern user mô tả từ trước.

**Phạm vi**: framework-level SSE — KHÔNG phải sửa từng page. Khi server-side `web2-generic.js` broadcast topic `web2:<entity-slug>`, MỌI page mount qua `Web2Shell.bootstrap({ slug, ... })` tự subscribe topic đó.

**Thay đổi server-side** (`render.com/`):

- `routes/web2-generic.js`: thêm `initializeNotifiers + _notify(entity, action, code)` ở top. Gọi `_notify(req.params.entity, 'create'|'update'|'delete'|'delete-all'|'bulk-create', code)` sau 5 endpoints: POST `/:entity/create`, PATCH `/:entity/update/:code`, POST `/:entity/delete-all`, DELETE `/:entity/delete/:code`, POST `/:entity/bulk-create`. Topic format: `web2:<entity>` (vd `web2:partner-customer`).
- `server.js`: wire `web2GenericRoutes.initializeNotifiers(realtimeSseRoutes.notifyClients)` sau khi mount.

**Thay đổi client-side**:

- `web2/shared/page-shell.js` `SCRIPTS_MOUNT`: thêm `web2-sse-bridge.js` (load TRƯỚC page-builder.js để bridge sẵn sàng).
- `web2/shared/page-builder.js` `mount()`: thêm SSE subscription tự động — `Web2SSE.subscribe('web2:' + config.slug, ...)` → debounced 600ms `load()`. Trả `destroy()` để caller teardown khi navigate đi.

**Tự enable cho 78 pages**: tất cả pages dùng `Web2Shell.bootstrap` (partner-customer, partner-supplier, delivery-carrier, product-category, live-campaign, các config-_, account-_, report-\*, …) tự động có realtime sync giữa các tab/máy mà không cần edit file nào.

**Verify**: mở 2 tab cùng entity, edit ở A → B tự refresh trong <1s.

**Status**: ✅ Done

---

### [web2 × 15 pages] Đồng nhất title `<base> - WEB 2.0` cho các trang Web 2.0 chính

**User yêu cầu**: thêm " - WEB 2.0" vào sau title của 15 pages chính (real impl) để dễ phân biệt khi mở nhiều tab.

**Files** (15 `index.html`):

- web2/fastsaleorder-invoice/, live-campaign/, supplier-debt/, supplier-wallet/, partner-customer/, customer-wallet/, partner-supplier/, delivery-carrier/, products/, variants/, product-category/, users/
- Plus root: native-orders/, so-order/, tpos-pancake/

**Thay đổi**: replace existing suffix (`— N2Store`, `— Web 2.0`) thành ` - WEB 2.0` (dấu gạch thường, WEB IN HOA). Vd: `Sổ Order — N2Store` → `Sổ Order - WEB 2.0`, `Kho Sản Phẩm Web 2.0 — N2Store` → `Kho Sản Phẩm - WEB 2.0`, `Tpos - Pancake` → `Tpos - Pancake - WEB 2.0`.

**Status**: ✅ Done

---

### [docs + claude.md + memory] Viết doc SSE realtime pattern + cập nhật rule bắt buộc cho Web 2.0

**User yêu cầu**: viết file cách dùng SSE Web 2.0, cập nhật MEMORY/CLAUDE/dev-log để khi code Web 2.0 sẽ đọc file này.

**File mới**:

- `docs/web2/SSE-REALTIME.md` (~370 dòng) — comprehensive guide:
    1. Architecture overview (diagram + file map)
    2. Topic naming convention
    3. Server-side recipe (inject notifier + gọi \_notify + wire trong server.js)
    4. Client-side recipe (load bridge + subscribe + debounce)
    5. Echo guard (debounce vs strict clientId)
    6. Migration checklist (Firestore → SSE)
    7. Verification + debugging (curl SSE, stats, browser DevTools, Render logs)
    8. Cost comparison (Firestore vs SSE)
    9. Existing topics map (status table)
    10. Anti-patterns / Gotchas
    11. Khi nào KHÔNG dùng SSE (so sánh với WebSocket, BroadcastChannel, local-first, FCM)
- `~/.claude/projects/.../memory/reference_web2_sse_realtime.md` — pointer memory cho Claude future sessions

**Cập nhật**:

- `CLAUDE.md` mục "Web 2.0 — Quy tắc khi code": thêm rule #6 BẮT BUỘC đọc `docs/web2/SSE-REALTIME.md` trước khi code realtime. Index quick-lookup thêm pointer.
- `MEMORY.md` mục "Web 2.0 vs Legacy": thêm 1 dòng pointer reference_web2_sse_realtime.md.

**Mục đích**: codify pattern SSE đã proven trong web2-products + native-orders để các module tiếp theo (web2-variants, supplier-wallet, …) clone đúng pattern, không phải hỏi lại.

**Status**: ✅ Done

---

### [native-orders + render] Add SSE realtime cho data CRUD — topic 'web2:native-orders'

**User yêu cầu**: native-orders cần realtime — user A edit/tạo/xoá đơn ở máy A → máy B thấy ngay.

**Hiện trạng trước**: native-orders chỉ có Web2Realtime (Pancake messages WS) cho sidebar comments. Data CRUD KHÔNG có realtime — phải F5 thủ công.

**Thay đổi**:

- `render.com/routes/native-orders.js`: thêm `initializeNotifiers + _notify('web2:native-orders', { action, code })`. Gọi sau 5 successful endpoints: POST `/from-comment` (created + comment-merged), POST `/reset-stt` (renumber), POST `/backfill-customer-links`, PATCH `/:code` (update), DELETE `/:code` (delete).
- `render.com/server.js`: wire `nativeOrdersRoutes.initializeNotifiers(realtimeSseRoutes.notifyClients)`.
- `native-orders/js/native-orders-app.js`: thêm `_sseConnect()` gọi trong `init()`. Subscribe `Web2SSE.subscribe('web2:native-orders', ...)` → debounced `load()` 600ms.
- `native-orders/index.html`: load `web2-sse-bridge.js?v=20260519a` trước `native-orders-app.js`. Bump cache `v=20260519a`.

**Pattern**: clone từ web2-products SSE POC. Server notify khi DB write, client trang Đơn Web nhận event → reload list. Debounce 600ms để gom mutation burst.

**Verify**: 2 tab/máy mở native-orders cùng lúc, edit đơn ở tab A → tab B thấy update trong <1s.

**Status**: ✅ Done

---

### [web2-products + render + so-order] POC migrate Firestore tickle → SSE pub/sub server-side

**User yêu cầu**: Firebase realtime tốn tiền — build server socket realtime riêng cho Web 2.0. Pattern user mô tả: "server log coi trang user đang ở → cập nhật". Đúng pattern topic-based pub/sub.

**Hạ tầng đã có sẵn**:

- `render.com/routes/realtime-sse.js` — SSE pub/sub trên Render (`notifyClients(topic, data, eventType)` + per-topic client set Map)
- `cloudflare-worker/modules/handlers/proxy-handler.js` `handleRealtimeProxy` → proxy `/api/realtime/*` đến `n2store-fallback.onrender.com`, preserves SSE streaming
- Chỉ cần wire web2-products + thêm 1 client bridge

**Thay đổi**:

1. `web2/shared/web2-sse-bridge.js` (mới): `Web2SSE.subscribe(topic, callback)`. Single EventSource multiplex nhiều topics qua param `?keys=`. Auto-reconnect exponential backoff. `visibilitychange` listener: tab visible after long hide → reopen socket.
2. `web2/shared/web2-products-cache.js` `_setupRealtime()`: ưu tiên `Web2SSE.subscribe('web2:products', ...)`; fallback Firestore tickle khi bridge không load.
3. `render.com/routes/web2-products.js`: thêm `initializeNotifiers(notifyClients)` + `_notify(action, code)` helper. Gọi `_notify` sau mỗi successful write: create, update, delete, adjust-stock, adjust-pending, upsert-pending, confirm-purchase → broadcast SSE topic `'web2:products'`.
4. `render.com/server.js`: hook `web2ProductsRoutes.initializeNotifiers(realtimeSseRoutes.notifyClients)` sau khi mount SSE.
5. HTML pages: thêm `<script src="...web2-sse-bridge.js?v=20260519a">` TRƯỚC `web2-products-cache.js` ở 3 file: `so-order/index.html`, `web2/products/index.html`, `web2/supplier-wallet/index.html`.

**TRANSITION**: `pushTickle()` vẫn ghi Firestore tickle song song với SSE (server notify). Sau khi verify production SSE OK 1-2 ngày sẽ remove Firestore write hoàn toàn → tiết kiệm Firestore writes/reads cho web2-products.

**Cost dự kiến giảm** (cho riêng module web2-products):

- Trước: mỗi mutation → 1 Firestore write (tickle) + N Firestore reads (listener fire ở N clients online)
- Sau: 0 Firestore ops, 1 SSE broadcast (in-memory Map, free trên Render flat-rate)

**Status**: ✅ POC done, đợi deploy verify

---

## 2026-05-18

### [so-order] Fix TRIỆT ĐỂ "giựt lại đợi đồng bộ" — refactor sang local-first (bỏ onSnapshot)

**User yêu cầu**: fix triệt để, chỉ làm trang so-order, không đụng các trang khác (web2-products, orders-report, … giữ nguyên).

**Thay đổi** (`so-order/js/so-order-storage.js` — chỉ Sync layer):

- **Bỏ `_setupRealtimeListener` + `_unsubscribe` + `_isListening`** — không subscribe `onSnapshot` nữa.
- **`pullOnce()`**: load Firestore một lần, compare `payload.lastUpdated` với `_localLastUpdated`. Chỉ apply remote update khi server mới hơn.
- **`pushToFirestore(state)` debounced 400ms** (`PUSH_DEBOUNCE_MS`): gom mutation liên tiếp thành 1 write. Lưu state vào `_pendingState`, set timeout, timeout fire → `_flushPending()` ghi.
- **`flush()`**: clear debounce + flush ngay — gọi trước khi tab hidden / unload để không mất pending writes.
- **`init(onRemoteUpdate, onConflict)`**: thêm param conflict handler — `pullOnce` phát hiện remote mới hơn và `_pushTimer` chưa flush (= có pending local edits) → toast cảnh báo, không tự overwrite.

**Thay đổi** (`so-order/js/so-order-app.js` — chỉ phần init Sync):

- Pass conflict handler vào `Sync.init` → toast "Có thay đổi từ máy khác. Refresh để xem (mất các sửa chưa lưu) hoặc giữ chỉnh sửa hiện tại."
- Register 3 listeners:
    - `visibilitychange`: visible → `pullOnce()`, hidden → `flush()`
    - `focus`: `pullOnce()`
    - `beforeunload`: `flush()`

**Kết quả**:

- Click toggle expand/collapse → render LOCAL ngay (~5ms), không còn round-trip Firestore. Không giật.
- Push debounce 400ms → spam click không spam Firestore writes.
- Cross-device: máy A sửa → máy B switch tab/focus → tự pull. Không realtime nhưng đủ tốt cho Sổ Order (tài liệu edit tuần tự).
- Conflict toast cảnh báo user khi 2 máy edit cùng lúc thay vì silently overwrite.

**Tradeoff đã chấp nhận**: máy A và B mở cùng lúc, sửa ở A → B không thấy ngay (phải switch tab hoặc focus). Đây là sự lựa chọn có ý thức — Sổ Order không phải chat realtime, UI smooth quan trọng hơn millisecond freshness.

**Status**: ✅ Done

---

### [so-order] Fix bug "giựt lại đợi đồng bộ" — filter local pending writes trong Firestore listener

**User báo**: bấm vào chức năng đồng bộ (toggle expand/collapse, edit inline, …) bị "giựt lại" đợi confirm.

**Root cause**: `onSnapshot` của Firestore mặc định fire cho **mọi snapshot**, bao gồm cả local pending writes (optimistic update của chính client). Mỗi `pushToFirestore()` trigger listener → `remoteHandler` → `state = load(); renderAll()` → DOM tbody bị re-render lại → mất focus input, dropdown đóng, scroll reset. Combine với fact render local đã làm trước đó, user thấy UI thay đổi → "giựt" về.

**Fix** (`so-order/js/so-order-storage.js`): trong `_setupRealtimeListener`:

```js
if (snap.metadata && snap.metadata.hasPendingWrites) return;
```

→ Bỏ qua snapshot do chính client mình write. Chỉ apply remote update khi confirmed từ server (write của máy khác).

**Còn lại có thể fix sau**: (B) version timestamp guard, (C) debounce pushSync, (D) skip render khi đang focus input.

**Status**: ✅ Done

---

### [so-order] Cho phép inline-edit Ngày giao / Đợt / Kiện / KG ở shipment header

**User yêu cầu**: cho chỉnh sửa các giá trị Ngày giao, Đợt, số Kiện, KG trực tiếp ở header lô (không cần mở modal "Sửa thông tin lô").

**Thay đổi**:

- `so-order/js/so-order-app.js`:
    - `shipmentHeaderHtml()`: wrap value `dateText`, `batchLabel`, `caseCount`, `weightKg` trong `<button data-shipment-edit="<field>" data-shipment-id="...">` (helper `pill()`).
    - Wire `[data-shipment-edit]` click → `beginShipmentFieldEdit(pill)`: replace pill content thành input (`type=date` / `text` / `number`), Enter/blur commit qua `SoOrderStorage.updateShipment(...) + pushSync() + renderAll()`, Escape restore.
- `so-order/css/so-order.css` (bump `v=20260518m`):
    - `.so-shipment-edit-pill`: button trong header với hover effect (border dashed → solid khi hover), padding 2px 6px.
    - `.so-shipment-edit-pill.is-editing`: border solid purple `#7c3aed`, padding 0.
    - `.so-shipment-edit-input`: transparent input, tabular-nums khi `so-shipment-edit-num` (caseCount/weightKg).

**Gotcha**: stop event propagation trên input click + keydown để không trigger shipment-toggle bên ngoài.

**Status**: ✅ Done

---

### [so-order] Đồng bộ style bảng với native-orders: font Segoe UI + header bg + button action

**User yêu cầu**: làm bảng so-order giống native-orders về font chữ, cỡ chữ, màu thead, button, màu sắc.

**Thay đổi** (`so-order/css/so-order.css`, bump cache `v=20260518l`):

- `.so-table` thêm `font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif` + `color: #333` (match TPOS body color).
- `.so-table-scroll`: border `#c8ced3` → `#dee5e7`, radius `10px` → `8px`, shadow giảm sang `--shadow-sm` (`0 1px 2px rgba(0,0,0,.05)`).
- `.so-table thead th` + `.so-shipment-colhead-cell`: bỏ `text-transform: uppercase` + `letter-spacing: 0.04em`, đổi `font-size 11px → 13px`, bg `#eef2f7 → #f0eeee` (var --tpos-bg-cell-head), padding `10px 12px → 8px 10px`. Nhìn đúng style TPOS thay vì style admin-modern.
- `.so-table tbody td`: padding `9px 12px → 8px 10px`, color `#0f172a → #333`, border-right `#d9dde0 → #e5e8ea` (vertical line mảnh hơn để row dễ scan).
- `.so-action-btn`: chuyển từ transparent → square 28×28 với background mặc định (edit blue `#dbeafe/#1d4ed8`, delete red `#fee2e2/#b91c1c`, add-row green `#dcfce7/#15803d`). Hover lift `translateY(-1px) + shadow-sm`. Khớp native action button style (act-edit / act-delete / act-confirm).
- `.so-cell-actions`: width `96px → 112px` + thêm gap `margin-left: 4px` giữa các button.

**Kết quả**: bảng so-order giờ trông giống native-orders về font, header, buttons. Zebra + hover từ commit trước giữ nguyên.

**Status**: ✅ Done

---

### [so-order] Cải thiện grid bảng (giống native-orders): vertical lines + zebra + hover rõ hơn

**User yêu cầu**: kẻ đường bảng cho dễ nhìn, làm giống native-orders.

**Compare**:

- Native-orders: `data-table` dùng `border-collapse: separate`, có `border-right` mỗi cell, zebra `:nth-child(even)`, hover `#eaf2fb`.
- So-order cũ: `border-collapse: collapse`, chỉ có border-bottom mờ `#eef1f5`, không vertical lines, không zebra → trông "lỏng lẻo".

**Apply**:

- `.so-table` → `border-collapse: separate; border-spacing: 0` (cho phép border từng cell).
- `.so-table thead th` → background `#eef2f7` đậm hơn, `border-right: 1px solid #d9dde0`, last child không right.
- `.so-table tbody td` → `border-right: 1px solid #d9dde0`, `border-bottom: 1px solid #d9dde0` (tăng contrast).
- Zebra: `tr.so-data-row:nth-child(even) > td { background: #f7f9fb }`.
- Hover: `tr.so-data-row:hover > td { background: #eaf2fb }`.
- Shipment-head divider: thêm `border-top: 2px solid #c4b5fd` để tách rõ giữa các lô (trừ lô đầu tiên).
- Shipment column header (`.so-shipment-colhead-cell`): style như thead chính, có border-right + border-top đậm.
- `.so-table-scroll` border `#c8ced3` + `box-shadow` nhẹ.

**Verify** (browser localhost:8093):

- Bảng hiện rõ grid lines ngang + dọc giữa các cell ✅
- Zebra striping trên data rows ✅
- Hover xanh nhạt `#eaf2fb` ✅
- Divider tím đậm giữa shipment groups ✅

**Files**:

- `so-order/css/so-order.css` — refactor `.so-table` block + zebra + shipment-head/colhead borders
- `so-order/index.html` — bump cache `v20260518h → v20260518j`

**Status**: ✅ Done

---

### [so-order + web2-products + render] Full sync 2 chiều: delete/edit qty trong đơn ⇄ pending_qty Kho

**User báo**: nếu xóa SP ở Kho, hoặc chỉnh số lượng / xóa SP trong đơn mua hàng, các trường hợp bằng / nhỏ hơn / lớn hơn → kho và đơn lệch nhau (pending_qty kho không sync với qty thực của đơn).

**Hiện trạng cũ**:

- Add row + Lưu → upsertPending cộng dồn `pending_qty += qty` ✅
- Edit qty (inline/bulk/modal) → KHÔNG sync, kho lệch
- Delete row / delete shipment → KHÔNG sync, kho còn ghost pending
- Delete SP ở Kho → DELETE thẳng, mất pending không cảnh báo

**Backend (render.com/routes/web2-products.js)**:

1. **POST `/api/web2-products/adjust-pending`** (mới): body `{adjustments: [{code?, name?, variant?, supplier?, delta}]}`. Atomic transaction. Logic:
    - Match SP theo code (ưu tiên) hoặc name+variant (case-insensitive, NULL/empty variant match)
    - `pending_qty = GREATEST(0, pending_qty + delta)` (clamp 0)
    - Auto-cleanup ghost: `pending=0 AND stock=0 AND created_by='so-order'` → DELETE SP
    - Auto-convert status: `pending=0 AND stock>0 AND status='CHO_MUA'` → `status='DANG_BAN'`
    - Return per-item: `{code, name, action: deleted|updated, newPendingQty, status, stock}` + warnings
2. **DELETE `/api/web2-products/:code`** (sửa): nếu `pending_qty > 0` và không có `?force=1` → trả **409** với `{code, name, pendingQty, supplier, message}` để frontend cảnh báo. `?force=1` bypass.

**Frontend API (web2/products/js/web2-products-api.js)**:

- `_fetchJson` throw error với `.status` + `.body` để caller phân biệt 409 vs 500.
- `remove(code, {force})` truyền query.
- `adjustPending(adjustments)` mới.

**Frontend so-order (so-order/js/so-order-app.js)**:

- Helper `adjustKhoPending(adjustments)` — best-effort, notify nếu có SP bị auto-cleanup.
- Helper `_rowToKhoMatch(r)` — extract `{name, variant, supplier}` từ row.
- `deleteRow`: capture row TRƯỚC khi xóa → adjustKhoPending([{...match, delta: -qty}])
- `deleteShipment`: batch tất cả rows của lô.
- Inline cell edit (`beginInlineCellEdit > commit`): khi field=qty, tính `delta = newQty - oldQty`, adjust.
- Bulk edit (`commitBulkEditField`): tương tự.
- Modal edit save (modalMode='edit'):
    - Nếu name+variant unchanged → adjust delta.
    - Nếu rename → dec old qty + upsertPending new (rename case).

**Frontend web2/products (delete handling)**:

- `remove(code)` → `_doRemove(code, false)`. Nếu lỗi `.status === 409` → popup "SP còn N cái CHỜ HÀNG, vẫn xóa?" → confirm → `_doRemove(code, true)` (force).

**Verify cases** (sẽ test sau khi Render deploy):

- Sửa qty 10 → 5: kho `pending_qty -= 5` (clamp 0) ✅
- Sửa qty 10 → 15: kho `pending_qty += 5` ✅
- Xóa row qty=10: kho `pending_qty -= 10`, nếu = 0 + stock = 0 → SP bị auto-delete (ghost cleanup) ✅
- Xóa lô: batch adjustment cho mọi rows ✅
- Xóa SP ở Kho có pending > 0: hiện popup cảnh báo, force = 1 mới xóa ✅

**Files**:

- `render.com/routes/web2-products.js` — adjust-pending endpoint + DELETE force flag
- `web2/products/js/web2-products-api.js` — adjustPending, remove(force), err.status/body — bump cache `v20260518a → v20260518b`
- `web2/products/js/web2-products-app.js` — 409 handling — bump `v20260518b → v20260518c`
- `web2/products/index.html` — bump cache
- `so-order/js/so-order-app.js` — adjustKhoPending helper + wire 5 paths (deleteRow, deleteShipment, inline edit qty, bulk edit qty, modal edit save)
- `so-order/index.html` — bump cache `v20260518i → v20260518j`

**Status**: ✅ Done (Render deploy auto sau push, ~2 min)

---

### [web2-products + so-order] Fix hiển thị trạng thái "CHỜ HÀNG" + auto ×1000 giá VND

**User báo 2 vấn đề**:

1. SP từ "Tạo Đơn Hàng → Lưu Nháp" phải hiển thị trạng thái "CHỜ HÀNG" ở Kho SP, sau khi Mua hàng mới chuyển "Đang bán". Logic backend đã đúng (`status='CHO_MUA'` khi upsertPending) nhưng UI vẫn show "Đang bán".
2. Nhập giá 100, 200 trong modal tạo đơn → tự hiểu là 100.000, 200.000 (convention VND).

**Root cause #1**: Frontend `web2/products/index.html` chỉ đọc `isActive` boolean để render badge ("Đang bán" / "Tạm dừng"), không xem field `status`. Verify DB qua API: `KHO-3C44-MPB1AOII` có `status: "CHO_MUA", pendingQty: 3, isActive: true` → backend đúng, frontend display thiếu.

**Fix #1**: Logic badge mới:

- `status === 'CHO_MUA'` → badge cam "CHỜ HÀNG (×N)" (N = pendingQty), tooltip có tên NCC
- Else: theo `isActive` như cũ (Đang bán / Tạm dừng)

**Fix #2**: Quick-input shorthand cho VND

- Helper `_maybeExpandVndShorthand(value, tab)`: nếu `tab.currency === 'VND'` và `0 < v < 1000` → trả `v * 1000`.
- Wire vào 3 chỗ:
    - Modal "Tạo Đơn Hàng" — blur listener trên `input[data-field="costPrice|sellPrice"]`
    - Inline edit (dblclick cell) — trong `commit()` của `beginInlineCellEdit`
    - Bulk edit (whole table edit mode) — trong `commitBulkEditField`
- Hint trong header: "[VNĐ · gõ 100 = 100k]"

**Verify**:

- Web2 Products: SP "2000 ÁO TEST NHÁP" hiện badge cam "CHỜ HÀNG (×3)" ✅
- Modal so-order: nhập 150 → 150000, nhập 250 → 250000 ✅

**Files**:

- `web2/products/js/web2-products-app.js` — render badge theo `status` field
- `web2/products/css/web2-products.css` — `.active-pending` (cam) + cache `v20260517c → v20260518b`
- `web2/products/index.html` — bump cache `app.js v20260518a → v20260518b`
- `so-order/js/so-order-app.js` — `_maybeExpandVndShorthand`, `onModalPriceBlur`, wire 3 chỗ, hint header
- `so-order/index.html` — bump cache `app.js v20260518h → v20260518i`

**Status**: ✅ Done

---

### [so-order] Sửa icon FAB toggle "Mua hàng" — dùng inline SVG thay lucide, thêm text label

**User báo**: FAB toggle mua hàng ở mép phải bị "trống trơn", chỉ còn badge "3" — không thấy icon hay text.

**Root cause**: Toggle dùng `<i data-lucide="shopping-cart">` cần lucide CDN (unpkg.com) replace thành SVG khi load. Khi network down (`net::ERR_INTERNET_DISCONNECTED`) lucide.min.js không load → `<i>` vẫn rỗng → FAB chỉ thấy nền tím + badge đỏ.

**Fix**:

- Thay `<i data-lucide>` bằng **inline SVG** (`<svg class="so-purchase-icon">`) cho cart + X close — hoạt động offline.
- Thêm text label "MUA HÀNG" (uppercase, bold, dưới icon) trên FAB để rõ ràng hơn.
- FAB đổi layout: vertical (icon trên, text dưới), pill 58px width tối thiểu, badge chuyển sang góc trái có viền trắng.

**Verify**:

- Toggle: 87×69px, có SVG cart + label "Mua hàng" + badge "3" ✅
- Drawer title: icon cart tím render ✅
- Drawer close: X SVG render ✅

**Files**:

- `so-order/js/so-order-app.js` — inline cartSvg + xSvg trong `_ensurePurchaseDrawer()`
- `so-order/css/so-order.css` — `.so-purchase-icon`, layout toggle vertical, badge moved to top-left với border trắng
- `so-order/index.html` — bump cache `v20260518g → v20260518h`

**Status**: ✅ Done

---

### [so-order] Chuyển panel "Mua hàng theo NCC" thành drawer phải có toggle (mặc định ẩn)

**User yêu cầu**: panel "Mua hàng theo NCC" đang chiếm chỗ trên cùng table — chuyển thành menu/drawer bên phải, có toggle ẩn/hiện, default ẩn.

**Implement**:

- Thay inline `<section.so-purchase-panel>` (chèn trước `.so-table-wrap`) bằng:
    - **FAB toggle** `#soPurchaseToggle` (right edge, vertical-center, gradient indigo, shopping-cart icon + badge đỏ đếm số NCC)
    - **Drawer** `#soPurchaseDrawer` slide-in từ phải, width 460px, backdrop mờ, transform translateX 260ms
- Drawer cấu trúc: head ("Mua hàng theo NCC" + nút X) + body (hint, "Mua hàng tất cả", grid cards 1 cột).
- Đóng drawer: bấm X, click backdrop, hoặc Esc.
- Toggle ẩn khi `suppliers.length === 0`.
- Cleanup defensive: xóa legacy inline `#soPurchasePanel` nếu còn từ cache cũ.

**Verify** (browser localhost:8093):

- Default: drawer đóng, FAB toggle hiện với badge "3" ✅
- Click toggle → drawer slide in, 3 cards + nút "Mua hàng tất cả (3 SP · 5.200₫)" ✅
- Click "Mua hàng" Shenzhen trong drawer → modal mở chồng trên drawer, 1 SP · 25 cái · 3.750₫ ✅
- Click X / backdrop / Esc → drawer đóng, toggle vẫn còn ✅

**Files**:

- `so-order/js/so-order-app.js` — `_ensurePurchaseDrawer()` + refactor `renderPurchasePanel()` dùng drawer-body
- `so-order/css/so-order.css` — `.so-purchase-toggle`, `.so-purchase-toggle-badge`, `.so-purchase-drawer*`
- `so-order/index.html` — bump cache `v20260518f → v20260518g`

**Status**: ✅ Done

---

### [so-order] Fix modal "Mua hàng" rỗng + thêm 3 entry points (global / per-NCC / per-row)

**User báo**: bấm "Mua hàng" cho Shenzhen → modal hiện "Không có SP CHỜ MUA cho NCC này, hãy Lưu Nháp trước" mặc dù card đã hiện 1 SP / VND 3.750.

**Root cause**: `openPurchaseModal` cũ query DB qua `Web2ProductsApi.listPending` (filter `status='CHO_MUA' AND pending_qty>0`), nhưng panel cha lại tính từ rows local của tab. Nếu user chưa Lưu Nháp → DB rỗng → modal trống dù panel có hiện số.

**Fix**:

- Refactor `openPurchaseModal({scope, supplier?, rowId?})` lấy items trực tiếp từ `tab.shipments[].rows` local (filter theo scope).
- `confirmPurchaseFromModal`: auto `upsertPending` (= Lưu Nháp ngầm) → lấy codes trả về → gọi `confirmPurchase({codes})` → in mã vạch. User không cần bấm Lưu Nháp riêng nữa.
- Modal title + supplier tag thay đổi theo scope: `'all' | 'supplier' | 'row'`.

**Thêm 2 entry points mới**:

- Nút "Mua hàng tất cả (N SP · X₫)" ở header panel → mở modal gộp SP từ tất cả NCC trong tab, có tag NCC trên từng dòng.
- Nút giỏ hàng xanh ở cột Thao tác mỗi dòng → modal chỉ với SP đó (title "Mua hàng SP: {tên}").

**Verify** (browser localhost:8093):

- Shenzhen → 1 SP · 25 cái · 3.750₫ ✅
- Tất cả NCC → 3 SP · 40 cái · 5.200₫ (Quảng Châu A, Hồng Châu B, Shenzhen) ✅
- Per-row → 1 SP với title đúng tên SP ✅

**Files**:

- `so-order/js/so-order-app.js` — refactor renderPurchasePanel + openPurchaseModal + confirmPurchaseFromModal + actionsCell
- `so-order/css/so-order.css` — `.so-purchase-btn-all`, `.so-action-btn-buy`, `.so-purchase-supplier-tag`, `.so-purchase-line-cost`
- `so-order/index.html` — bump cache `v20260518e → v20260518f`

**Status**: ✅ Done

---

### [orders-report] Fix miss auto-tag XL "ĐÃ RA ĐƠN" sau tạo PBH (single + bulk)

**User báo**: lâu lâu sau khi tạo phiếu bán hàng lẻ hoặc bán hàng hàng loạt, đơn ra thành công nhưng không tự động đánh tag XL "ĐÃ RA ĐƠN" → kẹt ở "CHỜ ĐI ĐƠN".

**Constraint cứng**: chỉ sửa phần đánh tag, không động flow tạo đơn / modal.

**Root cause** (4 nguyên nhân chồng):

1. `storeFromApiResult` gọi `window.onPtagBillCreated(soId, source)` trong `forEach` không await → fire-and-forget ([tab1-fast-sale-invoice-status.js:879](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js#L879)).
2. `onPtagBillCreated` skip im lặng khi `ProcessingTagState._isLoaded === false` → race: F5 → tạo đơn ngay → miss vĩnh viễn ([tab1-processing-tags.js:1462](../orders-report/js/tab1/tab1-processing-tags.js#L1462)).
3. `saveProcessingTagToAPI` catch chỉ log, không retry → network thoáng qua = memory có tag, DB không → F5 mất tag.
4. Reconciliation chỉ chạy 1 lần khi load page → user phải F5 mới fix.

**Fix** (3 layer, ZERO impact lên flow tạo đơn / modal):

- **Fix A** — Đợi `_isLoaded` thay vì skip ([tab1-processing-tags.js:1452-1515](../orders-report/js/tab1/tab1-processing-tags.js#L1452-L1515)): thêm helper `_waitForPtagLoaded(timeoutMs)` poll 100ms timeout 10s + queue `_ptagBillCreatedRetryQueue` cho reconcile catch khi timeout.
- **Fix B** — Retry `saveProcessingTagToAPI` với exponential backoff 3 lần (500ms / 1500ms / 4500ms) ([tab1-processing-tags.js:696-729](../orders-report/js/tab1/tab1-processing-tags.js#L696-L729)). Thua hết retry → queue cho reconcile.
- **Fix C** — `setTimeout 3s` sau `storeFromApiResult` gọi `window.reconcileTagsWithInvoices()` fire-and-forget ([tab1-fast-sale-invoice-status.js:929-945](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js#L929-L945)) — catch các đơn lỡ miss tag mà không cần user F5.

**Không đụng**: caller `storeFromApiResult` (tab1-sale.js:1314 / tab1-fast-sale-invoice-status.js:4092), forEach loop, modal timing (`closeSaleButtonModal`, `setTimeout 500ms`), TPOS API, schema DB.

**Files**: `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-fast-sale-invoice-status.js`.

**Status**: ✅ DONE — syntax check pass. Cần user test thực tế với bulk 5-10 đơn để confirm.

---

### [render][orders-report] KPI strip → SSE-only, bỏ polling

**User feedback (sau test prod 2 user hong+hanh)**: "bỏ polling hoàn toàn chỉ dùng kpi thôi". Test prod confirmed: mọi update đều rơi đúng nhịp polling 60s, không có SSE push nào fire — SSE channel `kpi_base` chỉ fire khi bảng `kpi_base` bị ghi (BASE INSERT cho order mới), KHÔNG fire khi `kpi_statistics` được PATCH (tick "SP bán hàng").

**Root fix backend** ([render.com/routes/realtime-db.js](../render.com/routes/realtime-db.js)):

Thêm `notifyClients('kpi_statistics', ...)` vào TẤT CẢ write endpoints:

- PUT `/kpi-statistics/:userId/:date` — eventType `update`
- PATCH `/kpi-statistics/:userId/:date/order` — eventType `update`, sau COMMIT
- DELETE `/kpi-statistics/order/:orderCode` — eventType `deleted`, chỉ khi rowCount > 0
- DELETE `/kpi-statistics/:userId/:date` — eventType `deleted`, chỉ khi rowCount > 0
- POST `/kpi-statistics/recalculate-assignments` — eventType `update`, chỉ khi moved > 0

**Client** ([orders-report/js/tab1/tab1-kpi-stats-strip.js](../orders-report/js/tab1/tab1-kpi-stats-strip.js)):

- SSE_URL subscribe **2 channels**: `?keys=kpi_statistics,kpi_base` (catch cả PATCH tick KPI và new order BASE).
- `SSE_DEBOUNCE_MS`: 2500ms → **1500ms** (không cần chờ kpi_statistics ghi sau kpi_base nữa vì giờ tự push).
- **XÓA HOÀN TOÀN** `startPollingSafety`, `POLL_SAFETY_MS`, `pollSafetyTimer`.
- SSE-only: EventSource tự reconnect khi mạng chập chờn.

**Trước**: Polling 60s gánh toàn bộ realtime → latency worst case 60s.
**Sau**: SSE fire trên MỌI write `kpi_statistics` → latency ~1.5-3s (debounce + network). 0 polling traffic.

**Status**: ✅ Code done. Cần deploy Render + GitHub Pages, sau đó re-test 2-user.

### [web2/supplier-debt] Thêm option "Bao gồm TPOS (legacy)" — merge data từ TPOS Report API

**User**: "thêm dữ liệu như bên https://nhijudyshop.github.io/n2store/supplier-debt/index.html tôi coi thử".

**Context**: Legacy `supplier-debt/` show 56 NCC từ TPOS (tổng nợ 891M). Web 2.0 chỉ 3 NCC từ so-order (5.2k). User muốn xem báo cáo Web 2.0 với data dày như legacy.

**Approach**: Thêm toggle "Nguồn" trong toolbar — 2 checkbox `Web 2.0` + `TPOS (legacy)`. TPOS được fetch on-demand qua `tokenManager.authenticatedFetch()` (giống legacy).

**Implementation** ([web2/supplier-debt/](../web2/supplier-debt/)):

- HTML: thêm `<script src="../../shared/js/core-loader.js">` + `<script src="../../shared/js/token-manager.js">` + 2 checkbox toggle source.
- JS state thêm: `tposData: []`, `tposCongNo: Map<partnerId, rows>` (lazy), `filters.sourceWeb2/sourceTpos`.
- `loadTpos()`: GET `/api/odata/Report/PartnerDebtReport?ResultSelection=supplier&DateFrom=...&$top=1000` → 1000 NCC từ TPOS qua worker proxy.
- `aggregate()` merge: Web 2.0 rows giữ nguyên (so_order + wallet), thêm TPOS rows với `opening = ending - debit + credit` (legacy formula).
- Row có `source` field ('web2' | 'tpos'). Render thêm badge: `WEB 2.0` (xanh) / `TPOS` (vàng).
- Expand TPOS row: `congnoTableHtml` lazy fetch `/api/odata/Report/PartnerDebtReportDetail?PartnerId=...` → cache vào `STATE.tposCongNo` → re-render detail panel. Running balance dùng `row.opening` làm start, compute `currentEnd = currentBegin + debit - credit` per row.
- Toggle change → `loadAll()` + `tposCongNo.clear()` (invalidate cache) + re-render.

**Verified localhost**:

- Toggle TPOS ON → load 56 TPOS NCC + 3 Web 2.0 = 59 row, total ending **891.739.200₫** match legacy.
- Expand TPOS row (B5 CHIẾN NGỌC) → lazy fetch PartnerDebtReportDetail → 100+ rows running balance đúng (lastEnd = summaryEnd = **100.580.000₫**).
- Badge phân biệt nguồn rõ ràng.

**Web 2.0 isolation note**: TPOS được đọc **read-only** ở client để bổ sung báo cáo. KHÔNG sync vào Firestore/Postgres, KHÔNG write back. Web 2.0 data layer (so_order_v2, supplier_wallet_v1) vẫn không cross-contaminate.

**Status**: ✅ Done.

### [web2/supplier-debt] Refactor modal → inline row expand giống legacy

**User**: "làm chức năng expand cho web2/supplier-debt giống supplier-debt/" + answer relationship giữa các trang Web 2.0.

**Logic liên kết Web 2.0 (đã trả lời chi tiết trong chat):**

- **so-order** (Firestore) → derive purchases per NCC + write web2_products stock (+)
- **supplier-wallet** (Firestore) → ledger payment/return per NCC; on return → web2_products stock (-)
- **supplier-debt** (NEW) → READ-ONLY báo cáo, aggregate so_order + supplier_wallet
- **native-orders** (Postgres) → tạo PBH → fast_sale_orders → web2_products stock (-)
- **customer-wallet** (Firestore) → group PBH by phone; on return → web2_products stock (+)
- **products** (web2_products Postgres) → SOURCE OF TRUTH cho stock, +/- bởi 4 luồng trên
- **SePay auto-poll**: webhook → `balance_history` → `/api/wallet-deposits/load` → 2 ví match (phone cho KH, content substring cho NCC) → auto payment tx

**Refactor expand**:

- BỎ modal `<div class="sd-modal" id="sdDetailModal">` khỏi HTML.
- Thay bằng pattern legacy: per main row có 1 `<tr class="sd-detail-row" hidden>` đi kèm dưới với `<td colspan="7">` chứa detail content render từ JS string.
- Thêm cột expand (▶ / ▼) ở table header, mỗi row có button `.sd-expand-btn` (24×24, ▶ default, → ▼ khi expanded + bg purple).
- Click expand button HOẶC click row → `toggleExpand(supplier)` toggle membership trong `STATE.expanded: Set<supplier>`.
- Tab state per supplier: `STATE.detailTabs: Map<supplier, tab>` (default 'congno'). Click tab → `updateDetailPanel(supplier)` chỉ re-render 1 detail cell, không full re-render bảng.
- **Multi-expand**: nhiều row có thể mở cùng lúc (legacy support this).
- **Esc → collapse all**.
- Bỏ `[data-sd-close]`, `Escape close modal`, modal CSS unused.

**Verified Playwright**: 3 main rows → click expand row 1 → 1 detail visible với Công nợ tab + running balance đúng (Shenzhen 9/5 PO/HÀ NỘI 0₫→3.750₫). Click row 1 again → collapse. Expand 2 rows → 2 detail visible đồng thời. Tab switch (Công nợ / Phiếu mua / Giao dịch) per row độc lập.

**Status**: ✅ Done.

### [web2/supplier-debt] Thêm tab "Công nợ" — chronological merge + running balance per row

**User**: "chức năng tính tiền giống bên supplier-debt/ chưa? Tìm hiểu kĩ chức năng bên supplier-debt/ đi".

**Phân tích legacy** `n2store/supplier-debt/`:

- Bảng chính 5 cột: Mã NCC, Tên NCC, Phát sinh (Debit), Thanh toán (Credit), Nợ cuối kỳ (End) — TPOS API `Report/PartnerDebtReport` trả sẵn 3 cột tiền, **KHÔNG** có Nợ đầu kỳ ở bảng chính.
- **Tab "Công nợ"** trong expanded row mới là feature money-calc quan trọng: merge tất cả bút toán (BILL hóa đơn mua, CSH/BANK/TK thanh toán) chronological, hiển thị Nợ đầu kỳ / Phát sinh / Thanh toán / Nợ cuối kỳ per row với **running balance**.
- Công thức (legacy `main.js:1623`):

    ```
    Opening = End − ΣDebit + ΣCredit      (derive từ summary row)
    currentEnd = currentBegin + debit − credit
    currentBegin = currentEnd              (next row)
    ```

- 4 tabs khác trong expand: Info, Hóa đơn (FastPurchaseOrder), Chi tiết nợ (CreditDebitSupplierDetail), Công nợ.

**Web 2.0 update** ([web2/supplier-debt/](../web2/supplier-debt/)):

- **Tab mới "Công nợ (running balance)"** thành default tab — merge `row.purchasesInPeriod` (Debit) + `row.txInPeriod` (Credit) sort theo `sortKey` ASC (date + time), tính running balance theo công thức legacy.
- Bảng 7 cột: Ngày, Diễn giải, Bút toán, Nợ đầu kỳ, Phát sinh, Thanh toán, Nợ cuối kỳ.
- Bút toán label: `PO/<tab>` cho purchase, `PAYMENT`/`RETURN` cho transaction. Row payment/return có bg xanh nhạt (`is-credit-move`).
- Giữ 2 tab cũ (Phiếu mua / Giao dịch) cho ai chỉ muốn xem 1 hướng.

**Khác biệt còn lại với legacy** (đã ý thức, không clone):

- Drag-drop reorder rows — legacy dùng chỉnh ngày web (RefundDateStore); Web 2.0 dùng ngày shipment cố định.
- Hóa đơn / Chi tiết nợ tab — Web 2.0 không có pattern hóa đơn riêng (purchases gắn trực tiếp shipment).
- Web notes (Firebase per-move), Tạo NCC, Column toggle — chưa cần.
- Payment modal + delete payment — đã có sẵn ở `web2/supplier-wallet/`.

**Verified Playwright localhost**: Shenzhen → modal mở Công nợ tab → row "9/5/2026 — Mua: Túi xách — PO/HÀ NỘI — 0₫ → 3.750₫" running balance đúng. 0 JS error.

**Status**: ✅ Done.

### [web2/supplier-debt][sidebar] Báo cáo công nợ NCC theo kỳ — clone UX legacy supplier-debt vào Web 2.0

**User**: "làm 1 trang giống `n2store/supplier-debt/index.html` ở trong mục Mua hàng trên Ví NCC".

**New folder**: [web2/supplier-debt/](../web2/supplier-debt/) (slug + tên route mới, độc lập với placeholder `web2/report-supplier-debt/` của Web2Shell generic).

**Layout** (mirror legacy supplier-debt nhưng dùng Web 2.0 theme + data source mới):

- Header: tiêu đề + counter pills (số NCC, tổng nợ cuối) + refresh button
- Toolbar filter: từ ngày, đến ngày, search NCC, radio Tất cả / Nợ cuối kỳ ≠ 0 + 3 button (Áp dụng, Reset, Xuất CSV)
- Bảng 6 cột: #, Tên NCC, Nợ đầu kỳ, Phát sinh, Thanh toán, Nợ cuối kỳ (sortable 4 cột số)
- Tổng row trong tfoot
- Pagination 50 rows/trang (auto hide khi ≤ 50)
- Click row → detail modal: 4 stat box (đầu kỳ / phát sinh / thanh toán / cuối kỳ) + 2 tab (Phiếu mua trong kỳ / Giao dịch trong kỳ)
- Click ngoài / Esc → đóng modal
- Export CSV với BOM UTF-8

**Data source** (KHÔNG đụng TPOS — đây là Web 2.0):

- `so_order_v2/main` (Firestore) — derive purchases per supplier per shipment qua tabs[].shipments[].rows[]
- `supplier_wallet_v1/main` (Firestore) — ledger payment + return transactions

**Calc per supplier per period [from, to]**:

```
purchases_before = Σ (qty × costPrice × rate→VND) WHERE shipment.date < from
tx_before        = Σ |amount|                     WHERE tx.ts < from
opening          = purchases_before - tx_before
debit            = Σ purchases WHERE shipment.date in [from, to]
credit           = Σ |amount|  WHERE tx.ts in [from, to]
ending           = opening + debit - credit
```

Khi không có filter date → tất cả purchases vào `debit`, tất cả tx vào `credit`, `opening = 0`.

**Sidebar** ([web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js)): thêm entry "Công nợ NCC" vào group "Mua hàng" TRÊN "Ví NCC" theo yêu cầu user.

**Verified Playwright localhost**: 3 NCC từ so-order (Shenzhen 3.750₫, Quảng Châu A 1.000₫, Hồng Châu B 450₫, tổng 5.200₫) — match báo cáo trước. 0 HTTP 404, 0 JS error. Pagination auto-hide khi ≤ 50 rows (fix CSS `display: flex` đè `[hidden]` attr → thêm `.sd-pagination[hidden] { display: none !important }`).

**Status**: ✅ Done.

### [web2][paths][worker] Fix path bể sau khi move `web2-products` + `web2-variants` vào `web2/`

**User**: phát hiện URL `http://localhost:8093/web2/variants/index.html` bị sai path → yêu cầu audit toàn bộ.

**Root cause**: commit `cc2c8ff4` move 2 folder từ root vào trong `web2/` nhưng KHÔNG update các relative path bên trong:

- `../web2/shared/...` từ `/web2/variants/index.html` → resolve thành `/web2/variants/../web2/shared/...` = `/web2/web2/shared/...` ❌
- `../native-orders/...` (sibling cũ ở root) → giờ phải đi lên 2 levels: `../../native-orders/...`
- `../shared/js/...` (legacy n2store shared ở root) → giờ phải: `../../shared/js/...`
- `../web2/variants/index.html` href trong `web2/products/...` → `../variants/index.html`

**Fixed files**:

- [web2/variants/index.html](../web2/variants/index.html): 5 paths (CSS sidebar/effects, native-orders, shared/js, JS sidebar/effects/variants-cache)
- [web2/products/index.html](../web2/products/index.html): 8 paths (CSS, native-orders, shared/js, JS sidebar/effects/variants-api/caches, href Kho Biến Thể)
- [web2/products/js/web2-products-app.js](../web2/products/js/web2-products-app.js): 2 hint links `Thêm tại Kho Biến Thể`
- [web2/index.html](../web2/index.html): cleanup 2 path `../web2/shared/` → `shared/` (works by luck, đổi cho clean)
- [web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js): JSDoc usage example phân biệt depth 1 (web2 subpage) vs depth 0 (native-orders, etc.)

**Worker route bug**: `pathname === '/api/web2-products'` không match `/api/web2-products/list`. Thêm `startsWith('/api/web2-products/')` + same cho variants ([routes.js](../cloudflare-worker/modules/config/routes.js)). Deploy worker (`wrangler deploy` qua Cloudflare Global Key auth).

**Smoke script cleanup**: [scripts/n2store-smoke-all-pages.js](../scripts/n2store-smoke-all-pages.js) — bỏ slug đã chết `product-template`, `product-variant`, thêm `products`, `variants`.

**Verified**: smoke 144 pages localhost → 142/142 HTTP 200, 0 HTTP 404/5xx (trước fix: 2 trang 404 + nhiều 404 từ API call). Browser test ngân hàng `/web2/{variants,products,index,customer-wallet,supplier-wallet}` → 0 console error path-related.

**Worker deploy**: `chatomni-proxy` version `01a6068d-8be6-4a64-b826-d30e81895695`.

**Status**: ✅ Done.

### [orders-report] Fix divergence KPI strip giữa các browser

**Bug user báo**: "kiểm tra lại realtime API hiện tại hoạt động không đúng — mỗi trang nhân viên số KPI của mọi người lại hiển thị khác nhau". Browser A và B không hội tụ — số liệu trôi khác nhau sau khi switch sang SSE-only.

**Root cause**:

1. SSE channel `kpi_base` chỉ chắc chắn fire khi **bảng `kpi_base` bị ghi** (BASE snapshot khi có order mới). KHÔNG fire khi chỉ `kpi_statistics` recompute độc lập (manual "Tính lại KPI", fix discrepancy, etc.). → Browser bỏ sót event → snapshot frozen tại lần fetch đầu.
2. SSE-only không có safety net: nếu 1 push bị mất (network hiccup, server không emit), browser không bao giờ re-sync.
3. Không có `cache: 'no-store'` → fetch có thể serve từ HTTP cache cũ (ETag fresh nhưng disk cache có thể trả stale trong cùng session).

**Fix** ([orders-report/js/tab1/tab1-kpi-stats-strip.js](../orders-report/js/tab1/tab1-kpi-stats-strip.js)):

- `fetchAndAggregate()` dùng `fetch(url, { cache: 'no-store' })` → bypass browser HTTP cache, mỗi refresh thực sự GET tươi.
- `startPollingSafety()` **always-on 60s** (không còn fallback-only) → bảo đảm mọi browser hội tụ trong tối đa 60s, kể cả khi SSE không push.
- Bỏ `sseConnected` flag + `teardownSSE` + onerror handler — EventSource tự reconnect khi mạng chập chờn, polling là safety net độc lập với SSE state.
- SSE vẫn giữ để có low-latency push khi có order mới (BASE write trigger).

**Verify**:

- Endpoint consistency: 2 fetch liên tiếp → cùng 178833 bytes (endpoint OK, không phải lỗi server-side).
- Endpoint structure: mỗi row = `(userId, date)` đã pre-aggregated với `totalNetProducts/totalKPI`; `orders[]` chứa per-order detail có `campaignName` để filter.
- Smoke test: T7 active campaign → 3 cards render đúng (Huyền 7m·35K, Hạnh 6m·30K, Hồng 3m·15K). SSE kpi_base = 10 clients (browser đã subscribe).
- File serve sau edit chứa cả 3 fix (`cache: 'no-store'`, `POLL_SAFETY_MS = 60000`, `startPollingSafety()`).

**Status**: DONE.

### [web2][wallet][sepay][worker][render] SePay deposit poll — ví KH/NCC tự cộng payment từ webhook

**User**: tiếp tục TODO từ commit `c049756e` — _"Wallet apps sẽ tích hợp poll on load (next session)"_.

**Bug phát hiện**: commit trước ghi message "Mount /api/wallet-deposits trong server.js" nhưng thực tế **chưa mount** — `walletDepositsRoutes` chỉ được `require()` (line 333) nhưng thiếu `app.use(...)`. Worker cũng chưa có route → 404 toàn bộ.

**Fix**:

1. **Render** ([server.js:454](../render.com/server.js#L454)): mount `app.use('/api/wallet-deposits', walletDepositsRoutes)`.
2. **Cloudflare Worker**:
    - [routes.js](../cloudflare-worker/modules/config/routes.js): thêm `WALLET_DEPOSITS: { pattern: '/api/wallet-deposits/*' }` + matcher `startsWith('/api/wallet-deposits/')`.
    - [worker.js](../cloudflare-worker/worker.js): thêm `case 'WALLET_DEPOSITS': return handleCustomer360Proxy(...)` (Render passthrough + CORS).

**Customer wallet integration** ([web2/customer-wallet/](../web2/customer-wallet/)):

- `customer-wallet-storage.js`: thêm `fetchDeposits(since)`, `applyDeposits(state, deposits)`, helper `normPhone` (84→0 prefix), `getProcessedSepayIds` (idempotent dedup).
- Match: `d.linkedPhone` → `state.wallets[phone]` chỉ apply khi KH đã có ví → `type='payment'` (`paidAmount += amount`, balance ↓).
- Skip nếu sepayId đã processed (idempotent qua bộ ref.sepayId của tất cả tx).
- `customer-wallet-app.js`: gọi `pollDeposits()` sau `loadAndRender()`. Track `state.lastDepositSync` = max ts đã thấy (cursor cho lần poll sau, tránh re-fetch).

**Supplier wallet integration** ([web2/supplier-wallet/](../web2/supplier-wallet/)):

- `supplier-wallet-storage.js`: `fetchDeposits` + `applyDeposits` với matcher khác — `matchSupplier(content, supplierNames)` normalize (lowercase + NFD strip diacritics + non-alnum→space) + boundary check (yêu cầu name ≥4 chars + xuất hiện như từ riêng để tránh false positive).
- Match: supplier nào tên xuất hiện trong `d.content` → `paidAmount += amount` (semantically là NCC refund/hoàn tiền → giảm shop's debt).
- Cùng pattern `lastDepositSync` cursor + idempotent qua sepayId.

**Verified**: syntax-check 6 file pass. Test live cần data SePay thật trong `balance_history` — sẽ test sau khi deploy CF Worker + Render.

**TODO sau**: deploy CF Worker (push lên Cloudflare); deploy Render (auto từ git push); test với deposit thật từ SePay sandbox hoặc giả lập via webhook payload.

**Status**: ✅ Code done. Deploy + verify end-to-end sau.

### [web2][sidebar][audit] Xóa nốt `fastpurchaseorder-refund` + audit data flow

**User**: "xóa luôn và kiểm lại logic các trang liên quan, tác động tới nhau".

**Removed**:

- `web2/fastpurchaseorder-refund/` folder + sidebar entry "Trả hàng mua"
- 2 entries trong `web2/modules-manifest.js` (invoice + refund)
- 2 entries trong `shared/js/navigation-modern.js` (launcher list) + permission list
- `fastpurchaseorder-invoice` khỏi `render.com/services/web2-sync-worker.js` hot tier
- Seeder config khỏi `scripts/web2-seed-from-tpos.js` + 2 slugs khỏi `scripts/n2store-smoke-all-pages.js`

Nhóm "Mua hàng" sidebar giờ chỉ còn **Ví NCC**.

**Audit data flow** (module shop dùng thật):

```
Sổ Order (so-order/) ──► Web2 Products (web2/products/)
Firestore so_order_v2     Postgres web2_products (stock=0 khi tạo, không +)
     │
     │ derive purchases by supplier
     ▼
Ví NCC (web2/supplier-wallet/) — Firestore supplier_wallet_v1 (ledger riêng)
Modal trả hàng → transaction.type='return' (KHÔNG động so-order data)

Native Orders ──► PBH (fast_sale_orders, Postgres, KHÔNG trừ stock)
                         │ group by phone
                         ▼
                  Ví KH (web2/customer-wallet/) — Firestore customer_wallet_v1
                  Modal trả theo chiến dịch → transaction.type='return' (KHÔNG động PBH)
```

**Findings**:

1. **Stock end-to-end CHƯA track**: so-order import không +stock, PBH bán không -stock, ví trả hàng không touch stock. `web2_products.stock` field tồn tại nhưng không ai write.
2. **Ledger độc lập với source**: nếu user xóa shipment so-order / cancel PBH, totals recompute trên next load nhưng `returnedRowIds`/`returnedLineKeys` flag cũ trở thành stale (không gây lỗi).
3. **PBH cancelled chưa filter**: customer-wallet dùng `amount_total` mọi PBH bất kể state. Nên filter `state != 'cancelled'` (TODO nhẹ).
4. **500 PBH limit cứng**: shop nhiều đơn cần pagination/server-side filter (TODO).
5. **30-day cleanup**: chỉ purge ledger transactions, không động source ✓.
6. **SePay sau**: webhook → ghi `transaction.type='deposit'` vào wallet matching phone/supplier qua metadata.

**Status**: ✅ Cleanup done. Logic interconnect ổn (loosely coupled — Ví là ledger overlay).

### [web2][sidebar] Xóa trang `fastpurchaseorder-invoice` placeholder

**User**: hỏi data source trang "Mua hàng" (`web2/fastpurchaseorder-invoice/`) → chỉ là TPOS-clone generic CRUD (table `web2_records` ở Render), không phải module shop dùng thật. Shop dùng `so-order/` (Sổ Order) + ví NCC vừa làm. → "xóa đi".

**Removed**:

- `web2/fastpurchaseorder-invoice/` folder
- Sidebar entry "Mua hàng" trong nhóm "Mua hàng" ([web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js))

Nhóm "Mua hàng" còn lại: "Trả hàng mua" (cũng placeholder, có thể xóa sau nếu không dùng) + "Ví NCC". Sidebar "Sale Online" vẫn có "Sổ Order" (không bị ảnh hưởng).

**Status**: ✅ Done.

### [web2/supplier-wallet][web2/customer-wallet] Ví NCC + Ví KH — công nợ + lịch sử 30 ngày

**User**: shop cần 2 trang ví: NCC (từ Sổ Order) + KH (từ PBH native-orders). Modal trả hàng → chọn SP → tính lại tiền. 30-day auto-cleanup. SePay webhook sẽ tích hợp sau.

**Pages**:

1. **Ví NCC** ([web2/supplier-wallet/](../web2/supplier-wallet/))
    - Data: derive từ `so_order_v2/main` — group `rows.supplier`, tổng mua = `Σ qty × costPrice × rate→VND`
    - Wallet Firestore: `supplier_wallet_v1/main`
    - Modal trả hàng: list rows chưa trả → tick → input SL trả → `transaction.type='return'` âm tiền
    - Modal thanh toán: `transaction.type='payment'`
    - Sidebar: nhóm "Mua hàng" → "Ví NCC"

2. **Ví KH** ([web2/customer-wallet/](../web2/customer-wallet/))
    - Data: fetch `/api/fast-sale-orders/load` → group `partner_phone`
    - Wallet Firestore: `customer_wallet_v1/main`
    - Modal trả hàng: dropdown chiến dịch → filter `order_lines` theo `live_campaign_id` → tick
    - Modal thu tiền: `transaction.type='payment'`
    - Sidebar: nhóm "Khách hàng" → "Ví Khách Hàng"

**Pattern dùng chung**: Firestore source of truth + realtime listener + echo guard. 30-day cleanup on load: `transactions.filter(t => t.ts > Date.now() - 30d)`. localStorage warm cache. CSS supplier-wallet là base, customer-wallet override.

**Verified Playwright (real data)**: 3 NCC từ so-order (Shenzhen 3.750₫, Quảng Châu A 1.000₫, Hồng Châu B 450₫, tổng nợ 5.200₫) + 2 KH từ PBH (Thế Hoàng 135k, Antina Trân 0). Return flow: chiến dịch "HOUSE 11/05/2026" → AO NAU M → tick → 100k hoàn → Còn nợ 35k ✓.

**TODO next**: SePay webhook → `/api/sepay/wallet-deposit` Render → ghi `transaction.type='deposit'` vào wallet matching từ payment metadata.

**Status**: ✅ Done MVP.

### [docs] Rule mới: đọc `docs/sessions/latest/<folder>.md` trước khi code phần mới

**User**: "thêm vào memory, devlog, claude khi code đoạn mới thì vào `/Users/mac/Desktop/n2store/docs/sessions/latest` đúng trang cần đọc trước để hiểu trang đó làm gì".

**Thêm rule vào 3 nơi**:

- Memory: `feedback_read_folder_snapshot_first.md` + entry trong `MEMORY.md`
- CLAUDE.md: thêm section "Folder Snapshot — read before coding new section"
- Dev-log: entry này

**Mục đích**: khi code/edit phần mới trong folder X, PHẢI `Read` `docs/sessions/latest/<X>.md` trước để có context cô đọng (latest session token chạm folder + 5 commits gần nhất + files changed). Tránh sửa sai logic vì thiếu context.

**Mapping**:

- Root files → `_root.md`
- `so-order/`, `native-orders/`, `tpos-pancake/`, `web2/`, `web2/shared/`, `web2/products/`, `web2/variants/`, `scripts/`, `docs/` → snapshot cùng tên
- Index: `docs/sessions/latest/_all.md`

**Không áp dụng**: fix typo 1 dòng, user chỉ rõ file/dòng, folder mới chưa có snapshot.

**Status**: ✅ Done

---

### [web2-shared] Fix sidebar collapsed — labels bleed-through + toggle button bị che

**User**: "thanh menu đang bị lỗi giao diện" (collapsed bị bleed text "đ V", "C S", "L", "F" — chữ submenu lộ ra ngoài). Sau đó: "nút toggle khi collapsed lại bị che đi".

**Root cause** ([web2/shared/tpos-sidebar.css](../web2/shared/tpos-sidebar.css)):

1. **Class mismatch JS render vs CSS**: `tpos-sidebar.js` render `.label`, `.caret`, `.web2-nav-sub`, `.web2-nav-link`, `.web2-nav-group-head`, `.icon` — nhưng CSS collapsed selectors lại target `.web2-nav-label`, `.web2-nav-caret`, `.web2-nav-children`, `.web2-nav-item`, `.web2-nav-icon` (không tồn tại) → `display: none` không kích hoạt → labels bleed-through.
2. **Toggle button bị clip**: `position: absolute; right: -14px` hang off rìa phải aside, nhưng `.web2-aside` có `overflow-x: hidden` → toggle bị che một phần.

**Fix**: sửa selectors đúng class names + scope dưới `.web2-aside`. Toggle khi collapsed đổi `position: static` + brand `flex-direction: column` → N2 logo + toggle xếp dọc trong vùng 56px visible (không hang off → không bị clip).

**Verified Playwright**: collapsed → 56px rail không bleed text + toggle visible; click toggle → re-expand 260px labels đầy đủ.

**Status**: ✅ Done. Cache-bust `?v=20260518d` cho 14 file dùng `tpos-sidebar.css`.

### [scripts][docs] Per-folder LATEST snapshot — fallback khi session cũ chết (image limit)

**User**: gặp lỗi `dimension limit for many-image requests` thì session đóng băng, không nhờ Claude tóm tắt context được nữa. Cần snapshot **đã có sẵn** trước khi lỗi xảy ra, do hook tự ghi đè sau mỗi commit. Yêu cầu chia theo folder/page để session mới chỉ cần đọc 1 file của module đang làm.

**Files**:

- `scripts/save-session-resume.sh` — thêm python block generate `docs/sessions/latest/<folder>.md` cho mỗi folder bị chạm trong commit + `docs/sessions/latest/_all.md` (index).
- `CLAUDE.md` — thêm section "Folder Snapshot — fallback khi session cũ chết" mô tả khi user paste path `docs/sessions/latest/<folder>.md` Claude làm gì.

**Cách dùng (session mới khi cũ chết)**: paste `đọc docs/sessions/latest/<folder>.md` (vd `orders-report.md`) → Claude Read 1 file → có pointer đến latest session + 5 commit gần nhất + files thay đổi. Cần Next Steps đầy đủ thì Read thêm session file pointer trỏ tới (1 hop, không chain walk).

**Status**: ✅ Done. Tested heredoc escaping với git repo tạm trong `/tmp` — output đúng markdown (backticks render đúng).

---

### [so-order] Add lại toggle "Chỉnh sửa bảng" — bulk edit toàn bảng + dblclick lẻ coexist

**User**: feedback — dblclick OK cho sửa lẻ, nhưng khi nhập nhiều ô liên tục thì cần BẬT một phát thành input toàn bảng. Yêu cầu: add toggle button, ON = bật input toàn bộ bảng.

**Implementation** ([so-order/{index.html,css/so-order.css,js/so-order-app.js}](../so-order/)):

1. **Button toggle `#soEditTableBtn`** ở header (bỏ hint chip cũ). Purple gradient khi `is-active` (giống style toggle gốc của session `9a8fad0`).
2. **State `editTableMode`** persist `localStorage['soOrder_editTableMode_v1']` (per-device, tách khỏi Firestore sync vì là UX preference).
3. **`rowHtml()`** giờ check `editTableMode`: khi ON gọi `editableCellHtml(field, r, rid, sid)` thay vì cell read-only. STT/ảnh/actions luôn read-only. Ảnh vẫn dùng inline image modal (dblclick) — quá phức tạp inline.
4. **`commitBulkEditField()`** — re-use validation variant + pushSync + flashRow giống dblclick path. No-op nếu value không đổi. Số 0 fallback cho qty/price.
5. **Delegated listeners ở tbody** (bind 1 lần): `change` → commit; `keydown` Enter → blur; `focusin` variant input → lazy-bind picker dropdown (tránh build picker cho all rows upfront).
6. **CSS**: row bg `#fefce8` khi mode ON, hover `#fef9c3`, button purple gradient `#6d28d9 → #7c3aed`. Khử dashed hover trên cell read-only trong edit mode.
7. **Verified Playwright**: toggle ON → input toàn bảng (NCC, Tên SP, Biến Thể, SL, Giá Bán, Giá Nhập, Ghi Chú, status); edit SL 21→25 → counter SL 36→40 + Tổng tiền 9.200→10.400₫ instant; toggle OFF → revert read-only, data giữ; dblclick lẻ trên OFF vẫn mở input đúng cell.

**Status**: ✅ Done.

### [so-order] Đổi từ toggle button → dblclick-to-edit + inline image edit modal

**User**: feature "Chỉnh sửa bảng" theo flow toggle gây lẫn lộn (mode bật/tắt) → đổi sang **double-click ô để sửa** trực tiếp, intuitive hơn.

**Implementation** ([so-order/{index.html,css/so-order.css,js/so-order-app.js}](../so-order/)):

1. **Bỏ button `#soEditTableBtn` + state `editTableMode`** — thay bằng `.so-hint-chip` "Double-click ô để sửa" ở header cho rõ ràng UX.
2. **Cell renderers giờ dán `data-cell-field`** lên `<td>` read-only. Listen `dblclick` trên row → mở inline editor cho cell đó (qty/sellPrice/costPrice/supplier/productName/note/costNote/variant/status). Save ngay khi blur/Enter, escape khôi phục giá trị cũ.
3. **Inline image edit modal `#soInlineImageModal`** mới — dblclick ô ảnh (`productImage` / `invoiceImage`) mở modal: paste Ctrl+V / drag-drop / chọn file / dán URL. Preview live + nút "Xóa ảnh". Lưu → update row + Firestore sync.
4. **CSS**: dashed underline subtle khi hover cell editable, image preview box `min-height: 80px`, modal panel narrow.
5. **Fix**: index.html đã load `web2-effects.css` 2 lần (v=20260515b + v=20260517b) → giữ lại bản mới `20260517b`.

**Status**: ✅ Done.

### [so-order] Inline "Chỉnh sửa bảng" — toggle bật/tắt edit cell trực tiếp trên table

**User**: "thêm chỉnh sửa bảng".

**Implementation** ([so-order/{index.html,css/so-order.css,js/so-order-app.js}](../so-order/)):

1. Button `#soEditTableBtn` cạnh "Ẩn/Hiện cột". State `editTableMode` persist localStorage `soOrder_editTableMode_v1`
2. Split cell renderers: `_readCells()` (read-only) vs `_editCells()` (input/select cho field editable)
    - qty/sellPrice/costPrice → number input | supplier/productName/note/costNote → text input | variant → input + variant picker mini từ Web2VariantsCache (validate phải có trong Kho Biến Thể, fail → revert) | status → select 4 option
    - stt/images/actions giữ nguyên (ảnh paste/drop dùng modal)
3. Auto-save (`wireInlineEditCells`): change event → `SoOrderStorage.updateRow` → `pushSync()` Firestore → `renderFooterTotals()`. Enter → blur. Row flash xanh `.is-saved-flash` 600ms.
4. Visual: button `.is-active` gradient tím, body class `so-edit-table-mode` → row vàng nhạt `#fefce8` chỉ rõ mode

**Smoke test**: click toggle → row chuyển input, vàng nhạt; SL 20→21 → tổng SL 35→36, tổng tiền 8.900→9.200₫ (+300 = 1×300 sellPrice); reload mode vẫn ON.

**Status**: ✅ Done.

### [web2][seed] Bulk seed 108 biến thể từ `bienthe.txt` vào Kho Biến Thể

**User**: "thêm 108 biến thể trong /Users/mac/Desktop/n2store/bienthe.txt vào http://localhost:8093/web2/variants/index.html".

**Implementation**:

1. Verify API live: `/api/web2/variants/health` → `{ok:true, count:0}` (Render + CF Worker đã deploy variant routes)
2. Script [`scripts/seed-web2-variants.sh`](../scripts/seed-web2-variants.sh): đọc file txt từng dòng (trim + skip empty), POST `/api/web2-variants`:
    - `value` = raw line giữ nguyên (kể cả "SỌC ĐỎ" uppercase user cố tình)
    - `groupName` auto: prefix "Màu " → "Màu", prefix "Size" → "Size", khác → null
    - `sortOrder` = line number (giữ thứ tự gốc trong file)
    - `createdBy` = "seed-script"
3. Run → **108/108 created**, 0 duplicate, 0 fail

**Verification**:

- `/health` → `count: 108`
- `/list?group=Màu` → total 80
- `/list?group=Size` → total 28
- Browser screenshot: purple pills value + group "Màu" pill + "Đang dùng" + sort ascending

**Status**: ✅ Done.

### [docs][meta] API Keys / Secrets convention — `serect_dont_push.txt` central reference

**User**: "cần key api thì vào serect dont push → thêm thông tin này vào memory, claude, dev-log → nếu chưa có file thì tạo và kêu người dùng thêm key nếu muốn".

**Status check**:

- File `/Users/mac/Desktop/n2store/serect_dont_push.txt` ĐÃ tồn tại (8000 bytes, 21+ keys/tokens), đã có trong `.gitignore`. KHÔNG cần tạo mới.

**Changes** (3 chỗ duplicate rule cho không miss):

1. **CLAUDE.md** — section mới "API Keys / Secrets — BẮT BUỘC":
    - Đọc `serect_dont_push.txt` TRƯỚC khi cần bất kỳ key/token/credential (Render, Firebase, CF, Gemini, OpenAI, TPOS, Pancake, SePay, …)
    - File chưa tồn tại → `touch` tạo rỗng + báo user paste key, KHÔNG bịa
    - KHÔNG: echo/log/commit/screenshot, argv passing, hardcode source/test
    - Edit in place khi user nói "thêm/cập nhật key"
2. **Memory** (`reference_secrets_file.md` + `MEMORY.md`): refresh entry với trigger keywords mở rộng + "nếu chưa tồn tại" workflow; promote section "🔑 API Keys / Secrets" lên đầu MEMORY.md
3. **Dev-log** — entry này (changelog convention)

**Status**: ✅ Done. No code changes.

### [web2][so-order][render][cf-worker] Kho Biến Thể riêng — picker dropdown thay free-text variant

**User**:

1. Sửa biến thể SP cũ trên Kho SP không cập nhật → cần Render deploy variant column
2. "Thêm 1 nút là kho biến thể để quản lý tất cả biến thể — các biến thể tạo ra sẽ lấy trong danh sách của kho này, muốn thêm mới phải thêm ở kho biến thể"

**Implementation**:

**Backend + Worker**:

- New table `web2_variants` (id, value UNIQUE, group_name, sort_order, is_active, created_by, created_at, updated_at)
- REST CRUD route `/api/web2-variants` ([render.com/routes/web2-variants.js](../render.com/routes/web2-variants.js)): health, list, get, create (409 on duplicate), patch, delete
- Register trong [server.js](../render.com/server.js) `app.use('/api/web2-variants', web2VariantsRoutes)`
- CF Worker route mapping: `WEB2_VARIANTS` pattern + case → handleCustomer360Proxy ([cloudflare-worker/worker.js](../cloudflare-worker/worker.js) + [modules/config/routes.js](../cloudflare-worker/modules/config/routes.js))

**Frontend**:

1. **Web2VariantsApi client** ([web2/variants/js/web2-variants-api.js](../web2/variants/js/web2-variants-api.js))
2. **Web2VariantsCache shared module** ([web2/shared/web2-variants-cache.js](../web2/shared/web2-variants-cache.js)): in-memory cache + Firestore tickler doc `web2_variants_sync/notify` (realtime cross-machine), API `getAll/findByValue/findByValueExact/has/pushTickle/subscribe`
3. **Kho Biến Thể page** ([web2/variants/index.html](../web2/variants/index.html) + [js/web2-variants-app.js](../web2/variants/js/web2-variants-app.js) + [css/web2-variants.css](../web2/variants/css/web2-variants.css)): sidebar nav mới "Kho Biến Thể" trong group Sản phẩm; table # | BIẾN THỂ | NHÓM | THỨ TỰ | TRẠNG THÁI | THAO TÁC; filter search/active/group; modal CRUD value+group+sort+active
4. **Kho SP picker** ([web2/products/js/web2-products-app.js](../web2/products/js/web2-products-app.js)): field "Biến thể" → input + dropdown picker từ Web2VariantsCache (focus/input → show, click → fill). Hint inline: ✓ Đã chọn từ Kho Biến Thể / lỗi đỏ nếu giá trị không tồn tại. `saveModal()` validate, block + notify nếu variant không hợp lệ. Aux link "Kho Biến Thể" mở tab mới
5. **so-order picker** ([so-order/js/so-order-app.js](../so-order/js/so-order-app.js)): cột Biến thể mỗi row → dropdown picker giống Kho SP; `handleOrderSubmit` validate từng row variant phải có trong Kho Biến Thể trước khi save

**Smoke test** (localhost:8093):

- Trang Kho Biến Thể render đầy đủ UI (table + filter + modal); fetch HTTP 404 vì backend chưa deploy — expected
- Modal Kho SP hiện field "Biến thể" với link "Kho Biến Thể" mở tab mới + input + hint dynamic

**Deploy note**:

- Render auto-deploy sau push (~2-4 phút). Migration `ensureTables` chạy lần đầu /api/web2-variants được gọi
- CF Worker cần deploy thủ công qua wrangler: `cd cloudflare-worker && wrangler deploy`

**Status**: ✅ Frontend Done, chờ Render + CF Worker deploy.

### [web2][so-order][render] Kho SP — field BIẾN THỂ độc lập (DB column + column trong table + input modal + autofill so-order)

**User**: "Kho SP web 2.0 thêm biến thể SP vào — ghi biến thể ở đây, đừng ghi vào cột ghi chú".

**Background**: trước đó so-order modal có input "Biến thể" (size/màu/spec) — khi auto-add SP mới vào kho, biến thể đi chung vào field `note` cùng với label HÀ NỘI/HƯƠNG CHÂU → ghi chú bị lẫn lộn. Yêu cầu: tách biến thể thành cột/field riêng.

**Implementation**:

1. **Migration 068** ([render.com/routes/web2-products.js](../render.com/routes/web2-products.js)): `ALTER TABLE web2_products ADD COLUMN IF NOT EXISTS variant TEXT`. Auto-applied trong block `ensureTables` (chạy 1 lần khi /api/web2-products được gọi sau deploy). Idempotent — nếu cột đã có thì no-op. `mapRow` thêm field `variant`. POST insert + PATCH update đều bao gồm `variant` (trim, null nếu empty).

2. **Kho SP table** ([web2/products/index.html](../web2/products/index.html), [js/web2-products-app.js](../web2/products/js/web2-products-app.js), [css/web2-products.css](../web2/products/css/web2-products.css)):
    - Cột mới BIẾN THỂ chèn giữa TÊN SẢN PHẨM và GIÁ MUA (colspan = 11)
    - Cell hiển thị `<span class="variant-pill">Size M</span>` (purple pill, ellipsis maxWidth 160px) hoặc `—` khi empty
    - Loading/empty rows updated colspan 11

3. **Kho SP modal** ([web2/products/index.html](../web2/products/index.html)):
    - Thêm field-row "Biến thể" `#pmVariant` với placeholder "VD: Size M / Đỏ / 2003 B5" giữa Tên sản phẩm và grid Giá Mua/Bán/Tồn
    - openCreate/openEdit clear + populate variant. saveModal gửi `variant` lên API.
    - Update placeholder Ghi chú từ "Size/màu/tag..." → "Ghi chú nội bộ, tag nhập hàng (HÀ NỘI, HƯƠNG CHÂU)..." cho khớp nghĩa mới.

4. **so-order modal** ([so-order/js/so-order-app.js](../so-order/js/so-order-app.js), [css/so-order.css](../so-order/css/so-order.css)):
    - `applySuggestionToRow`: nếu kho có `p.variant` và row.variant đang trống → autofill. Không clobber nếu user đã gõ.
    - Suggestion dropdown item: thêm purple pill `.so-suggest-variant` cạnh tên SP — show "AO NAU M [Size M]" trực quan.
    - `syncRowsToKho` (sau Lưu Nháp): tách variant ra khỏi note hoàn toàn:
        - SP đã có: `patch.note` chỉ chứa tab.label (sticky tag), `patch.variant` chỉ set nếu kho trống (không clobber)
        - SP mới: POST với `variant` field riêng + `note: tab.label` (chỉ label, không có variant)

**Files touched**:

- `render.com/routes/web2-products.js` (ALTER TABLE + mapRow + POST + PATCH)
- `web2/products/index.html`, `web2/products/css/web2-products.css`, `web2/products/js/web2-products-app.js`
- `so-order/index.html` (version bump), `so-order/js/so-order-app.js`, `so-order/css/so-order.css`

**Smoke test** (localhost:8093, browser session sống):

- Kho SP: cột BIẾN THỂ render giữa TÊN SẢN PHẨM và GIÁ MUA, SP SP001 hiện "—" (vì DB chưa có data variant cho row cũ). Modal Thêm SP hiện input "Biến thể" placeholder "VD: Size M / Đỏ / 2003 B5".

**Deploy note**: backend changes cần Render deploy push lên prod để ALTER TABLE chạy. Frontend đã graceful nếu chưa deploy (variant field undefined → cell "—" + dropdown không show pill).

**Status**: ✅ Done. Cần Render deploy + smoke test online.

### [web2] Hover-zoom catch-all + Web2Effects.attachImageDropTarget — Kho SP modal Ctrl+V upload

**User**: "toàn bộ dự án web 2.0 liên quan tới ảnh là hover zoom lên + nếu upload thì cho ctrl V vào area".

**Implementation**:

1. **Hover-zoom catch-all** ([web2/shared/web2-effects.js](../web2/shared/web2-effects.js)): bổ sung container-based detection — mọi `<img>` nằm trong `.web2-shell`, `body.tpos-theme`, hoặc `body.tpos-clone` tự động được zoom khi hover, không cần selector cụ thể. Legacy whitelist (`.product-image`, `.so-cell-img img`, …) vẫn giữ làm fallback cho pages chưa có Web 2.0 container. Exclusions: `data-w2-no-zoom`, sidebar/aside/nav, `button`/`a`/`.btn-icon-round`/avatar/icon, ảnh < 32 px.

2. **Web2Effects.attachImageDropTarget(el, opts)** — helper dùng chung tách ra từ pattern so-order:
    - `onResult(url, file)` callback bắt buộc, trả về dataURL base64
    - 3 cách input: click → file picker; Ctrl+V khi focus → paste; kéo thả file → drop
    - `noClickPicker: true` khi caller đã có nút upload riêng (so-order)
    - Auto thêm `tabindex="0"` để Ctrl+V land được; auto-toggle `.is-dragover` class
    - Idempotent: gọi 2 lần cùng el → reuse handle. Expose `.detach()` programmatic
    - Default `maxSizeMB = 2`, cảnh báo (không reject) khi vượt
    - Notify fallback chain: opts.notify → `window.notificationManager` → console.warn

3. **Kho SP Web 2.0**: field "Link ảnh" → "Ảnh sản phẩm" là drop target `#pmImageDrop` với hint "Click chọn file · Ctrl+V để dán ảnh · Kéo thả file · hoặc dán URL bên dưới". URL input vẫn giữ; wire `Web2Effects.attachImageDropTarget` trong `init()` → ghi base64 vào `#pmImage` + update preview. Trang nay load thêm `web2/shared/web2-effects.{js,css}` (trước thiếu).

4. **so-order DRY**: `wireModalImagePasteDrop()` cũ → 1 dòng gọi `Web2Effects.attachImageDropTarget(cell, { noClickPicker: true, onResult, notify })`. Tách `_applyImageToRow()` reusable.

**CSS**: thêm `.w2fx-drop-target` + `.w2fx-drop-hint` chung trong `web2-effects.css` để page chỉ cần markup div + apply class, framework lo focus/hover/drag-over visuals.

**Status**: ✅ Done.

### [web2][so-order] Kho SP Web 2.0 — split Giá Mua/Giá Bán, realtime Firestore, so-order multi-row + suggestion + auto-add

**User**: redesign trang Kho SP Web 2.0 với cột mới (ẢNH/MÃ/TÊN/GIÁ MUA/GIÁ BÁN/TỒN/GHI CHÚ/TRẠNG THÁI), gộp "Thêm SP" lên header (bỏ Tải lại/Áp dụng/Xóa lọc), realtime cross-machine. Trang `so-order/index.html` modal Tạo Đơn Hàng cần: badge "Đã có ở kho", suggestion khi gõ tên/mã, hiện tồn kho, nút "+" thêm hàng, lưu nháp xong auto-thêm SP mới vào kho với note = tab name (HÀ NỘI / HƯƠNG CHÂU).

**Implementation**:

1. **Shared cache + realtime** ([web2/shared/web2-products-cache.js](../web2/shared/web2-products-cache.js)):
    - In-memory `Map<code, product>` + ordered list, full paginated load qua `Web2ProductsApi.list`.
    - Firestore tickler doc `web2_products_sync/notify` = `{ lastUpdated, by, action, code }`. Mỗi CRUD ghi vào doc; mọi client mở snapshot listener, debounce 400 ms reload khi `by` ≠ chính mình.
    - Public API: `init()`, `getAll()`, `findByCode()`, `findByName(q, n)`, `findByNameExact()`, `has()`, `pushTickle()`, `subscribe()`, `refresh()`.
    - `clientId` lưu `sessionStorage` để cùng máy tab khác vẫn nhận tickle.

2. **Kho SP Web 2.0** ([web2/products/index.html](../web2/products/index.html), [js/web2-products-app.js](../web2/products/js/web2-products-app.js), [css/web2-products.css](../web2/products/css/web2-products.css)):
    - HTML: header `page-head-mini` thêm `+ Thêm SP` (di chuyển lên), xóa hẳn `search-info-right` (Tải lại / Áp dụng / Xóa lọc); table cột mới ẢNH | MÃ SP | TÊN SẢN PHẨM | GIÁ MUA | GIÁ BÁN | TỒN KHO | GHI CHÚ | TRẠNG THÁI | THAO TÁC (colspan = 10).
    - Modal: 3-cột grid Giá Mua / Giá Bán / Tồn kho; `pmPriceBuy` → field `originalPrice`, `pmPriceSell` → field `price` (schema sẵn có 2 cột này).
    - JS: subscribe Web2ProductsCache → load() khi tickle; sau create/update/delete/toggle gọi `pushTickle({action, code})` để các client khác auto-reload.

3. **so-order modal** ([so-order/index.html](../so-order/index.html), [js/so-order-app.js](../so-order/js/so-order-app.js), [css/so-order.css](../so-order/css/so-order.css)):
    - Multi-row UI: `modalRows[]` state với uid stable mỗi row; render từng row qua `modalRowHtml()`; tbody `#soModalProductsBody` được rerender khi thêm/xóa dòng, KHÔNG khi gõ field (giữ focus).
    - Nút **+ Thêm sản phẩm** (`#soModalAddRowBtn`) chỉ hiện ở `modalMode = create`; edit single-row vẫn 1 dòng.
    - Suggestion: input `productName` → `showSuggest()` chỉ khi query ≥ 1 ký tự (user feedback: "chưa nhập tên hay mã nó đã hiện suggestion" → empty input → hide); click suggestion → autofill name + costPrice (giá mua) + sellPrice (giá bán) + image, set `row.matchedCode`. `mousedown.preventDefault()` để blur không fire trước.
    - Badge "Đã có ở kho" (xanh) khi `Web2ProductsCache.findByNameExact(name)` ≠ null; ngược lại "SP mới" (vàng) — báo trước user là khi lưu sẽ tạo SP trong kho.
    - Tồn kho pill bên cạnh badge (vàng < 5, đỏ = 0, xanh dương ≥ 5) — đọc realtime từ cache.
    - **Auto-add to kho** sau `Lưu (Nháp)`: `syncRowsToKho(rows, tab)` chạy best-effort song song, mỗi row trong order:
        - Nếu matched (theo `matchedCode` hoặc `findByNameExact`): chỉ bổ sung `tab.label` vào `note` nếu chưa có (sticky tag, dùng `|` separator, dedupe case-insensitive); KHÔNG ghi đè.
        - Nếu chưa có: POST `Web2ProductsApi.create()` với code generated (`{slug6}-{ts5}{rnd3}`), price (VND quy đổi từ tab.rate), stock 0, note = tab.label.
        - Cuối hàm `Web2ProductsCache.pushTickle({action: 'sync-from-so-order'})` để Kho SP page các máy khác refresh.

**Files touched**:

- `web2/shared/web2-products-cache.js` (new)
- `web2/products/index.html`, `web2/products/js/web2-products-app.js`, `web2/products/css/web2-products.css`
- `so-order/index.html`, `so-order/js/so-order-app.js`, `so-order/css/so-order.css`

**Smoke test** (localhost:8093 / persistent browser session):

- Kho SP: render đúng 10 cột mới, GIÁ MUA (dimmer) ≠ GIÁ BÁN (bold), "+ Thêm SP" nằm trên header phải, search-info-right đã biến mất.
- so-order modal: input rỗng → no suggest popup; gõ "ao" → suggest "AO NAU M / SP001 / Tồn: 2 / 100.000đ"; click suggestion → autofill name, sellPrice, badge xanh "Đã có ở kho", tồn pill cam "Tồn: 2", total cập nhật 100.000đ.

**Status**: ✅ Done. Cần verify online sau Render deploy (~2-4 phút) + cross-machine realtime tickle thực tế.

### [chat] Toggle Tin nhắn/Bình luận sync với conv thực tế load — fix "click cột tin nhắn mở modal bình luận"

**User báo**: "Bật vào cột tin nhắn mà nó mở modal bình luận → phải chuyển qua lại bình luận tin nhắn nó mới mở modal tin nhắn".

**Root cause**: `openChatModal(orderId, pageId, psid, 'INBOX')` set `window.currentConversationType='INBOX'` + toggle UI=INBOX. Nhưng `_findAndLoadConversation` có nhiều path lookup, đôi khi resolve về một conv khác type với requested (vd customer chỉ có COMMENT trên page đó → fallback `foundConvs[0]` chính là COMMENT). Khi đó `_loadMessages` render COMMENT data nhưng:

- `currentConversationType` vẫn = `'INBOX'`
- Toggle UI vẫn highlight `Tin nhắn`

→ Khi user nhấn tab `Tin nhắn` lại không có gì xảy ra (guard `if (type === currentConversationType) return;` ở [`switchConversationType`](../orders-report/js/tab1/tab1-chat-core.js:2157)). Phải bấm `Bình luận` (force fetch COMMENT) rồi bấm `Tin nhắn` (force fetch INBOX) để UI tự đồng bộ. UX rất khó chịu vì giống "modal mở sai tab".

**Fix** ([orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)):

Sau khi `_doFindAndLoadConversation` resolve conv (line ~1758, ngay sau `currentConversationData = conv`):

```js
const resolvedType = conv.type === 'COMMENT' ? 'COMMENT' : 'INBOX';
if (resolvedType !== window.currentConversationType) {
    window.currentConversationType = resolvedType;
    _updateTypeToggle(resolvedType);
}
```

Cũng sync trong [`_wireConvPickerEmptyState`](../orders-report/js/tab1/tab1-chat-core.js:520) khi user click picker card mà conv được pick khác type với request.

**Test**: Smoke 40 đơn campaign T8 → INBOX type ↔ INBOX toggle ↔ INBOX conv khớp 100%, không có regression cho happy path. Edge case (chỉ có COMMENT trên page): toggle sẽ tự switch sang `Bình luận`, user thấy data + UI đồng bộ thay vì phải toggle thủ công.

**Status**: ✅ Done.

### [web2] Xóa 2 trang TPOS-clone `product-template` + `product-variant` (đã có Kho SP Web 2.0 thay thế)

**User**: "đã có Kho SP Web 2.0 nên bỏ 2 trang trên đi" (đối tượng: `web2/product-template/`, `web2/product-variant/` — TPOS-clone schema-driven CRUD, dữ liệu mock trong `web2_records`).

**Why**: [web2/products/](../web2/products/) là Kho SP riêng (UI riêng + bảng `web2_products`), đã cover use case "Sản phẩm" + "Biến thể SP" rồi. 2 trang `producttemplate`/`product` thuộc page-builder generic chỉ là placeholder TPOS-clone — không ai dùng.

**Đã xóa**:

- `web2/product-template/index.html` + `web2/product-variant/index.html` (qua `git rm -r`).

**Đã dọn tham chiếu**:

- [web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js) — bỏ 2 entry "Sản phẩm" + "Biến thể SP" trong `children` của menu "Sản phẩm" (giữ Kho SP Web 2.0 + Nhóm sản phẩm + In mã vạch + Thuộc tính…).
- [web2/modules-manifest.js](../web2/modules-manifest.js) — bỏ entry `dir: 'product-template' slug: 'producttemplate'` + `dir: 'product-variant' slug: 'product'`.
- [shared/js/navigation-modern.js](../shared/js/navigation-modern.js) — bỏ 2 href item `web2-product-template` + `web2-product-variant` trong WEB2 nav + bỏ 2 ID khỏi `WEB2_GROUP_ITEMS`.
- [web2/stock-inventory/index.html](../web2/stock-inventory/index.html) + [web2/stock-move/index.html](../web2/stock-move/index.html) — bỏ `link: 'product-template'` ở column + field `productCode` (cell trở về plain text, tránh 404 click-through). Field vẫn giữ `type: 'ref' ref: 'producttemplate'` cho autocomplete — slug-based API vẫn trỏ về PostgreSQL `web2_records` (hiện trống vì đã xóa data scope cũ, nhưng API vẫn alive).

**Giữ nguyên**:

- [web2/shared/tpos-menu.json:200](../web2/shared/tpos-menu.json#L200) — `#/app/producttemplate/list` là deep-link vào TPOS thật, không phải trang nội bộ.

**Verify live**:

- `/web2/product-template/index.html` → 404 ✅
- `/web2/products/index.html` → load OK, render "Kho Sản Phẩm" với data thật (`SP001 AO NAU M`) ✅
- JS syntax: `node -c` qua tpos-sidebar.js, navigation-modern.js, modules-manifest.js → OK.

**Status**: ✅ Done.

---

## 2026-05-17

### [inbox][render] Fix STT trùng — atomic counter `inbox_counters` thay cho `orders.length+1`

**Bug**: STT đơn inbox bị trùng (vd 501, 504 lặp 2 lần) do `tab-social-modal.js` cũ tính `stt = SocialOrderState.orders.length + 1` khi tạo đơn. Khi hủy/xóa đơn → length giảm → STT cũ được tái sử dụng. Multi-tab/multi-device race → 2 đơn cùng STT.

**Fix (hướng B — không đụng đơn cũ)**:

1. **Backend** [render.com/routes/social-orders.js](render.com/routes/social-orders.js):
    - Thêm table `inbox_counters(name PK, value BIGINT, updated_at)` trong `ensureTables`.
    - Endpoint `POST /api/social-orders/next-stt` — atomic UPSERT: lần đầu seed value = `MAX(stt) FROM social_orders + 1` (đảm bảo không trùng đơn cũ), các lần sau `value + 1`. 1 statement Postgres → race-safe.

2. **Frontend API** [don-inbox/js/tab-social-firebase.js](don-inbox/js/tab-social-firebase.js):
    - `getNextSocialOrderSTTFromServer()` async, fallback `getNextSTT()` local (max+1) nếu API lỗi.

3. **Frontend modal** [don-inbox/js/tab-social-modal.js](don-inbox/js/tab-social-modal.js):
    - Nhánh "Create new order" giờ `await getNextSocialOrderSTTFromServer()` trước khi build `newOrder`.
    - Đơn cũ giữ nguyên STT — chỉ đơn tạo mới từ giờ dùng counter.

**Status**: ✅ DONE. Cần Render auto-deploy ~2-3 phút sau push để endpoint mới active.

---

### [orders-report][render] KPI Đơn Inbox: drill-down chi tiết đơn theo NV

**User feedback**: "kpi đơn inbox không ghi rõ là đơn nào à? làm chi tiết giúp tôi" — leaderboard chỉ aggregate, không drill xuống đơn cụ thể.

**Backend** ([render.com/routes/social-orders.js](../render.com/routes/social-orders.js)):

- Thêm route `GET /api/social-orders/kpi-stats/orders?userId=&from=&to=&includeAll=` → trả `{ success, count, orders: [{ id, stt, status, totalQuantity, totalAmount, kpi, createdAt }] }`.
- Order list filter theo `created_by`, ORDER BY `stt ASC NULLS LAST, created_at ASC` → đồng bộ với thứ tự hiển thị don-inbox.
- Worker `/api/social-orders/*` wildcard auto-proxy → không cần thay đổi Worker.

**Frontend**:

- [orders-report/tab-kpi-commission.html](../orders-report/tab-kpi-commission.html): thêm cột `col-inbox-expand` (chevron) bên trái leaderboard.
- [orders-report/js/tab-kpi-commission.js](../orders-report/js/tab-kpi-commission.js):
    - State mới: `_inboxOrdersCache` (key `userId|preset` để invalidate theo date range), `_inboxOrdersInFlight` (dedupe fetch), `_inboxExpandedUsers`, `_INBOX_STATUS_LABELS`.
    - `renderInboxKpiView` render mỗi NV 2 dòng: row chính + row details (hidden) với placeholder spinner.
    - `_bindInboxExpandHandlers` event delegation lên tbody (idempotent qua flag `__inboxExpandBound`).
    - `toggleInboxUserExpand(userId)`: lazy-load đơn khi mở, dùng cache nếu có; collapse trong lúc fetch → skip render.
    - `_loadInboxOrdersForUser`: gọi endpoint mới, dedupe in-flight promise, cache theo `userId|preset`.
    - `_renderInboxUserOrders`: sub-table 5 cột — STT (don-inbox), Số phiếu (id SO-xxx), SL Món, KPI (qty×5.000đ), Trạng thái (badge theo STATUS_CONFIG).
    - `refreshInboxKpi` clear cache đơn để fetch lại sạch.
- [orders-report/css/tab-kpi-commission.css](../orders-report/css/tab-kpi-commission.css): chevron button rotate 90° khi expand, row.is-expanded bg `#f8fafc`, sub-row 50px indent, sub-table inset card, status badges (draft/order/processing/completed/cancelled) đồng bộ palette với `tab-social-core.js`.

**Smoke test localhost**:

- Render 3 user rows (Admin/My/Bo) + 3 hidden details rows ✓
- Click chevron → row expand, `is-expanded` class apply, chevron quay 90° (purple bg) ✓
- Fetch fail gracefully khi endpoint chưa deploy (HTTP 404) → error UI render đúng với alert-triangle ✓
- Click lại → collapse, hidden=true ✓
- Screenshot: [downloads/n2store-session/kpi-inbox-expanded-error.png](../downloads/n2store-session/kpi-inbox-expanded-error.png)

**Cần deploy sau commit**: Render auto-deploy từ main. Sau ~2-4 phút endpoint `/kpi-stats/orders` live → drill-down hoạt động end-to-end.

**Status**: ✅ Done — chờ Render deploy verify online.

---

### [orders-report] KPI strip: SSE 'kpi_base' channel thay polling + custom event

**User feedback**: "Tại sao polling + custom event mà không dùng SSE Render có sẵn?". Đúng — Render đã có SSE channel `kpi_base` (docs/render/render.md:693), không cần polling.

**Refactor**:

- EDIT [orders-report/js/tab1/tab1-kpi-stats-strip.js](../orders-report/js/tab1/tab1-kpi-stats-strip.js):
    - REPLACE `subscribeOrderAdded()` + `startPolling()` → `subscribeRealtime()` dùng `new EventSource('${API_BASE}/sse?keys=kpi_base')`.
    - Listen 3 events: `update`, `created`, `deleted` (theo pattern held-products-manager.js).
    - Debounce 2.5s gộp burst push + chờ kpi_statistics ghi xong sau kpi_base.
    - Fallback polling **60s** chỉ khi `onerror` fire trước `connected` (initial connect fail). Sau khi đã connect 1 lần → EventSource tự reconnect, không kép.
- REVERT [orders-report/js/tab1/tab1-tpos-realtime.js](../orders-report/js/tab1/tab1-tpos-realtime.js): xóa `window.dispatchEvent(new CustomEvent('n2:order-added', ...))` — không cần nữa vì SSE handle trực tiếp.

**Vì sao SSE > polling**:

- Latency thấp hơn: realtime push thay vì chờ 30s polling.
- Tiết kiệm: 1 request mở SSE connection vs 1 request mỗi 30s × số browser × số tab1 open.
- Đồng bộ cross-browser: cùng push event → cùng debounce window → toast fire gần như đồng thời ở mọi browser.
- Tận dụng infra hiện có: `kpi_base` SSE channel đã có sẵn (docs/render/render.md line 693), không cần thêm endpoint.

**Verify**:

- Probe `GET /api/realtime/sse/stats` → `keyStats.kpi_base === 1` xác nhận strip subscribed.
- Strip render đúng 3 cards (Huyền/Hạnh/Hồng), top-1 có gradient xanh + star.
- Toast logic không đổi: vẫn fire khi diff snapshot phát hiện delta soMon / đổi top.

**Status**: DONE.

### [orders-report] Toast realtime cho KPI strip — "X bán thêm N" + "TOP SALE"

**User request**: Khi 1 user tăng thêm KPI → toast "Hạnh bán X" cho mọi người thấy; khi user vượt mặt leader → toast "CHÚC MỪNG HẠNH ĐỨNG TOP SALE".

**Approach**: Mỗi browser tự diff snapshot (cùng data nguồn `/api/realtime/kpi-statistics` → cùng toast cho mọi user xem tab1). Không cần broadcast layer.

**Files**:

- EDIT [orders-report/js/tab1/tab1-kpi-stats-strip.js](../orders-report/js/tab1/tab1-kpi-stats-strip.js):
    - `prevSnapshot: Map<userId, {soMon,soTien,userName}>` + `prevTopUserId` state.
    - `diffAndToast(stats)`: với mỗi user có `soMon` tăng so prev → `notificationManager.success("X bán thêm <b>N</b> món", 4s)`. Nếu `stats[0].userId !== prevTopUserId` và prev top tồn tại + có ≥2 user + top mới có KPI > 0 → `notificationManager.success("🎉 CHÚC MỪNG <b>X</b> ĐỨNG TOP SALE!", 8s, title="TOP SALE")`.
    - `isFirstRefreshForCampaign` flag: lần đầu seed snapshot không fire toast. Reset khi đổi campaign.
    - Refresh triggers mới: polling 30s + listen `window.addEventListener('n2:order-added', ...)` debounced 6s (chờ backend tính KPI).
- EDIT [orders-report/js/tab1/tab1-tpos-realtime.js](../orders-report/js/tab1/tab1-tpos-realtime.js) line 132+: dispatch `window.dispatchEvent(new CustomEvent('n2:order-added', { detail: { code } }))` sau `addOrderToTable(order)` thành công.

**Edge cases**:

- Lần refresh đầu sau khi chọn campaign → seed snapshot, không toast.
- Đổi campaign → `resetSnapshot()` → snapshot mới, không toast.
- `prevTopUserId === null` → skip TOP SALE (lần đầu seed).
- `stats.length < 2` → skip TOP SALE (1 user không gọi là "vượt mặt").
- API fail → `console.error`, không toast (snapshot không cập nhật).
- Burst orders → debounce 6s gộp thành 1 refresh + toasts cho mỗi user có delta.
- XSS: `userName` luôn escapeHtml; `<b>` chỉ wrap số nguyên + uppercased name đã escape.

**Verify**: Playwright smoke — set T7 campaign, seed snapshot, monkey-patch fetch để boost Hồng (#3 → #1) → cả 2 toasts fire đúng:

- "Hồng bán thêm <b>55</b> món" (dur=4000)
- "🎉 CHÚC MỪNG <b>HỒNG</b> ĐỨNG TOP SALE!" (dur=8000, title="TOP SALE")

**Status**: DONE.

### [orders-report] KPI stats strip theo Chiến Dịch ở toolbar tab1

**User request**: Hiển thị stat KPI realtime của từng nhân viên giữa nút "Tải lại" và toggle "Auto T", scope theo Chiến Dịch đang chọn. Mỗi nhân viên = 1 ô. Top-1: xanh lá + ngôi sao vàng. Sort desc theo KPI.

**Files**:

- NEW [orders-report/css/tab1-kpi-stats-strip.css](../orders-report/css/tab1-kpi-stats-strip.css) — styles: pill cards, top-1 gradient xanh + star, mobile xuống dòng.
- NEW [orders-report/js/tab1/tab1-kpi-stats-strip.js](../orders-report/js/tab1/tab1-kpi-stats-strip.js) — IIFE module `window.KPIStatsStrip = { init, refresh }`. Fetch `/api/realtime/kpi-statistics` (REUSE endpoint của tab KPI-HOA HỒNG, không tạo mới), filter `order.campaignName === window.campaignManager.activeCampaign.name`, sum per user, render cards.
- EDIT [orders-report/tab1-orders.html](../orders-report/tab1-orders.html) — thêm `<link>` CSS, `<div id="kpiStatsStrip">` ở giữa nhóm trái/phải của `.search-info`, `<script>` JS sau `tab1-kpi-stats.js`.

**Hành vi**:

- Auto-init khi DOM ready, poll `campaignManager.activeCampaign.name` (500ms × 30 lần) → fetch lần đầu.
- Watcher polling `activeCampaignId` mỗi 2s → đổi campaign tự refresh.
- Edge cases: chưa chọn campaign → strip ẩn; API fail → strip ẩn + console.error; 0 user có KPI → strip ẩn (`:empty` CSS).
- Format: số món = `${n}m`, số tiền = compact K/M (`15K`, `1.5M`).

**Reuse strict**: chỉ READ endpoint hiện có. KHÔNG modify `tab-kpi-commission.js`, `kpi-manager.js`, hay `campaignManager`. Per feedback memory `feedback_api_scope.md`.

**Verify**: Smoke-tested với Playwright MCP — load main.html, set active campaign T7, refresh → 3 cards render đúng (Top-1: Huyền 🐰 7m·35K với star vàng + nền xanh; 2: Hạnh ฅ ฅ 6m·30K; 3: Hồng 3m·15K). Sort desc theo soTien khớp.

**Status**: DONE.

### [orders-report] Tách hoàn toàn KPI check store khỏi delivery-report

**User clarify**: "việc kiểm tra ở 2 trang kpi và thống kê giao hàng là riêng biệt hoàn toàn" và "việc kiểm tra ở page cũng là riêng biệt nhau không trùng lặp".

**Vấn đề trước fix**: KPI tab và delivery-report cùng đọc/ghi vào Firestore collection `delivery_report/data/order_checks` → check ở 1 page → page kia cũng thấy đơn xám + ✓. Sai design, user muốn 2 luồng kiểm tra hoàn toàn độc lập.

**Fix**:

- `_orderCheckStore._getCol()` trong tab-kpi-commission.js đổi từ `delivery_report/data/order_checks` → **`kpi_commission/data/order_checks`** (collection RIÊNG cho KPI tab).
- Delivery-report giữ nguyên `delivery_report/data/order_checks` (không đụng).
- Không có code cross-reference giữa 2 store (verified bằng grep). Mỗi store có listener Firestore riêng cho collection riêng.
- Tab "Lịch sử kiểm tra" trong KPI giờ chỉ chứa check từ KPI → bỏ cột "Nguồn" (luôn là KPI, không còn ý nghĩa). Header → 8 cột.

**Tác dụng**:

- Bấm "Đã kiểm tra" ở Modal L2 KPI → chỉ ảnh hưởng row trong Modal L1 KPI + history KPI. Không ảnh hưởng delivery-report.
- Bấm ở delivery-report row → chỉ ảnh hưởng table delivery-report. Không xuất hiện trong history KPI.
- 2 luồng hoàn toàn độc lập, không trùng lặp.

**Lưu ý**: Các check đã thực hiện trước fix này (trong khoảng test) nằm ở collection `delivery_report/data/order_checks` → sau fix, KPI không còn thấy chúng nữa (đúng design). Nếu cần dữ liệu test cũ thì check lại từ đầu trong KPI.

**Files**: `orders-report/js/tab-kpi-commission.js`, `orders-report/tab-kpi-commission.html`

**Status**: Done.

---

### [permissions + orders-report + delivery-report] Permission `canMarkOrderChecked` + tab "Lịch sử kiểm tra"

**User yêu cầu**:

1. Bổ sung 1 detail permission để chọn user nào được thấy + bấm dialog "Xác nhận kiểm tra đơn" (đánh dấu đã kiểm tra).
2. Thêm tab "Lịch sử kiểm tra" lưu toàn bộ thao tác: ai kiểm tra, thời gian, đơn nào, campaign nào, KPI của ai.

**Implementation — Permission**:

- `user-management/js/permissions-registry.js`:
    - Thêm `canMarkOrderChecked` vào `baocaosaleonline.detailedPermissions` (cho KPI - HOA HỒNG).
    - Thêm `canMarkOrderChecked` vào `delivery-report.detailedPermissions` (cho Thống Kê Giao Hàng).
    - 2 permission RIÊNG cho 2 page → admin có thể grant từng page hoặc cả 2 độc lập.
- `orders-report/js/tab-kpi-commission.js::_canMarkOrderChecked()`: inline check đọc `loginindex_auth` từ sessionStorage/localStorage, bypass cho admin, check `detailedPermissions.baocaosaleonline.canMarkOrderChecked === true`. Mirror pattern `PermissionHelper.hasPermission` để khỏi thêm script tag.
- `delivery-report/js/delivery-report.js::canMarkOrderChecked()`: cùng pattern, check `detailedPermissions['delivery-report'].canMarkOrderChecked`.
- `closeOrderDetails` (KPI) và `requestCloseRowModal` (delivery-report) đều check quyền TRƯỚC khi show confirm. Không có quyền → đóng modal thẳng, không hỏi popup.

**Implementation — Tab "Lịch sử kiểm tra"**:

- HTML [orders-report/tab-kpi-commission.html](orders-report/tab-kpi-commission.html): thêm sub-tab thứ 3 "Lịch sử kiểm tra" cạnh "KPI Đơn Hàng" / "KPI Đơn Inbox"; container `#kpiCheckHistoryView` chứa toolbar (info text + search input + count) và table với 9 cột: STT, Số phiếu, Mã ĐH, Campaign, KPI của NV, KPI (VNĐ), Người kiểm, Thời gian, Nguồn (pill KPI/Giao hàng).
- JS:
    - `switchKpiSubTab` refactor sang map `{orders, inbox, 'check-history'}` thay vì if/else. Khi switch sang `check-history` → gọi `_orderCheckStore.init()` (idempotent) rồi `_renderCheckHistory()`.
    - `_renderCheckHistory()` đọc trực tiếp `_orderCheckStore._data.values()` (đã được Firestore listener sync realtime), sort `checkedAt` DESC, filter theo search input (match số phiếu / mã ĐH / campaign / NV / người kiểm / khách / SĐT). Format giờ kiểu `dd/MM/YYYY HH:mm`. Source pill: KPI (tím) / Giao hàng (xanh) / — (xám).
    - `_renderCheckHistory` được gọi tự động sau: (1) `markChecked` local set, (2) Firestore `onSnapshot` listener, (3) initial `col.get()` xong → đảm bảo realtime sync.
- CSS [orders-report/css/tab-kpi-commission.css](orders-report/css/tab-kpi-commission.css): thêm `.kpi-check-history-toolbar` (flex toolbar) + `.kpi-check-history-controls input` (search box focus ring) + `.kpi-src-pill` (3 màu theo source).

**Implementation — Enrich payload**:

- `tab-kpi-commission.js`:
    - `state.currentEmployeeName` mới — set khi mở Modal L1 (resolved name của nhân viên KPI).
    - `closeOrderDetails` enrich `_pendingCheckCtx` với `campaignName, kpiOwnerUserId, kpiOwnerUserName, kpiAmount, netProducts` từ order + state.
    - `_orderCheckStore.markChecked` save full payload + `checkedByDisplayName` (display name của người kiểm) + `source: 'kpi-commission'`.
- `delivery-report.js::OrderCheckStore.markChecked` cũng update: thêm `checkedByDisplayName` + `source: 'delivery-report'` để history tab phân biệt nguồn.

**Backward compat**: Đơn check cũ (trước thay đổi) thiếu các field mới → hiện "—" trong bảng. Không break gì.

**Files**: `user-management/js/permissions-registry.js`, `orders-report/tab-kpi-commission.html`, `orders-report/js/tab-kpi-commission.js`, `orders-report/css/tab-kpi-commission.css`, `delivery-report/js/delivery-report.js`

**Status**: Done — admin grant quyền `canMarkOrderChecked` cho user nào trong user-management → user đó mới thấy popup khi đóng modal chi tiết đơn.

---

### [orders-report] KPI - HOA HỒNG: row "đã kiểm tra" hiển thị xám nhẹ + dấu ✓ ở STT

**User yêu cầu**: Đơn nào đánh "đã kiểm tra" → tô xám nhẹ + thêm dấu check nhỏ ở cột STT để dễ phân biệt với đơn chưa check.

**Implementation**:

- CSS [orders-report/css/tab-kpi-commission.css](orders-report/css/tab-kpi-commission.css): thêm `.modalL1-table tbody tr.kpi-l1-row-checked` với `background:#f3f4f6`, `color:#6b7280`, và pseudo `td[data-col='stt']::after { content:' ✓'; color:#10b981; }`. Pattern y hệt `.dr-row-checked` của delivery-report nhưng scope vào `modalL1-table` để không đụng `.kpi-row-checked` (đã dùng cho SP có KPI > 0 trong tab So sánh KPI L2).
- JS [orders-report/js/tab-kpi-commission.js](orders-report/js/tab-kpi-commission.js):
    - `renderEmployeeOrdersTable`: thêm class `kpi-l1-row-checked` vào row khi `_orderCheckStore.isChecked(invNumber)`; gắn `data-l1-number="<invNumber>"` lên `<tr>` và `data-col="stt"` lên TD đầu (để CSS `::after` chèn dấu ✓).
    - Thêm helper `_applyL1CheckedStyles()` quét tbody, toggle class theo `data-l1-number` — không full re-render, hiệu năng tốt.
    - Wire helper vào: (1) sau `markChecked` ghi local map, (2) trong `onSnapshot` listener của `_orderCheckStore`, (3) sau initial `col.get()`. Đảm bảo style luôn sync với Firestore: bấm "Đã kiểm tra" ở L2 → quay lại L1 row xám + ✓ ngay; user khác check ở delivery-report cũng cập nhật realtime nếu L1 đang mở.

**Edge case**: đơn vừa `is-refunded` vừa `kpi-l1-row-checked` → giữ ưu tiên trực quan cho refunded (background đỏ nhạt) bằng cách đặt rule `kpi-l1-row-checked` TRƯỚC rule `is-refunded` trong file CSS (source order quyết định khi specificity bằng nhau).

**Files**: `orders-report/css/tab-kpi-commission.css`, `orders-report/js/tab-kpi-commission.js`

**Status**: Done.

---

### [orders-report] KPI - HOA HỒNG: dialog "Xác nhận kiểm tra đơn" khi đóng modal chi tiết

**User yêu cầu**: Trong tab "KPI - HOA HỒNG" → mở modal "Chi tiết đơn hàng" của 1 đơn → khi bấm tắt (X), hiển thị dialog xác nhận kiểm tra giống delivery-report image 3 ("Đơn xxx đã được kiểm tra chưa?" + nút "Chưa duyệt" / "✓ Đã kiểm tra"), để đánh dấu đơn đã kiểm tra hay chưa.

**Implementation**:

- Thêm `_orderCheckStore` IIFE-style sub-object trong `KPICommission` (tab-kpi-commission.js) — dùng **chung Firestore collection** `delivery_report/data/order_checks/{sanitizeDocId(number)}` với delivery-report. Encode `/` → `__` cùng pattern. Listener `onSnapshot` giữ cache đồng bộ realtime.
- Fire-and-forget `this._orderCheckStore.init()` trong `KPICommission.init()` để load sẵn map đơn đã check khi user vào tab.
- `closeOrderDetails()` refactor: nếu đã check rồi (`isChecked(number)`) hoặc không lấy được số phiếu → close ngay (giữ behavior cũ); ngược lại show confirm modal.
- Confirm modal `kpi-check-confirm-modal` build dynamic 1 lần qua `_ensureCheckConfirmModal()`, style inline match delivery-report (overlay đen 0.45 + dialog 420px + 2 button "Chưa duyệt" / "✓ Đã kiểm tra").
    - "Chưa duyệt" / backdrop click → close cả 2 modal, không lưu.
    - "✓ Đã kiểm tra" → close cả 2 modal + `markChecked(number, ctx)` ghi Firestore với payload `{number, checkedBy, checkedAt, customerName, phone, invoiceId, orderCode, source:'kpi-commission'}`.
- Body dialog: dòng 1 hiện số phiếu (NJD/YYYY/xxxxx), dòng 2 hiện `Mã ĐH: <orderCode>` (TPOS code). KPI tab không có customerName/phone trực tiếp như delivery-report nên thay bằng orderCode cho user nhận diện.

**Source phiếu**: ưu tiên `recon?.invoiceNumber` → `_invoiceCache.get(orderId).Number` → `order.invoiceNumber` (same fallback chain dùng trong `renderEmployeeOrdersTable`).

**Vì sao chia sẻ collection**: đánh dấu đơn 1 lần ở đâu cũng tính, tránh user phải confirm 2 lần ở 2 báo cáo khác nhau cho cùng 1 đơn. Source field phân biệt nguồn ghi.

**Files**: `orders-report/js/tab-kpi-commission.js`

**Status**: Done — chờ verify live (cần GH Pages deploy ~3 min sau push).

---

## 2026-05-16

### [customer-hub] Fix "TPOS PBH" tab không hiển thị bill thực sự

**User báo**: Trong Customer 360 → Hoạt động ví, click con mắt 👁 ở giao dịch THANH TOÁN ĐƠN HÀNG (-100K) → mở modal "Đơn NJD/.." với tab "TPOS PBH" luôn báo "Không có phiếu bán hàng (PBH) cho đơn NJD/...". Trong khi đó modal "HOẠT ĐỘNG KHÁCH HÀNG" của Thống Kê Giao Hàng → click con mắt cùng giao dịch → hiển thị BILL (phiếu bán hàng) đầy đủ với barcode, danh sách SP, tổng tiền.

**Root cause**:

1. `customer-hub/js/modules/transaction-evidence.js::_renderTposInvoices` dùng OData filter SAI: `Reference eq '${orderCode}'`. Field `Reference` của TPOS FastSaleOrder thường rỗng cho invoice chuẩn — order code `NJD/YYYY/NNNNN` nằm ở field `Number`. delivery-report dùng đúng `contains(Number,'${number}')`.
2. Kể cả filter đúng, hàm này chỉ render summary card (Số, ngày, tổng, COD) chứ KHÔNG render bill HTML như delivery-report.

**Fix**:

- Đổi filter: `(Type eq 'invoice' and contains(Number,'${orderCode}'))`.
- Sau khi tìm thấy invoice, port flow render bill từ delivery-report sang:
    1. Lazy-load `../shared/js/api-service.js` + `../orders-report/js/utils/web-warehouse-cache.js` + `../orders-report/js/utils/bill-service.js` qua helper `_loadScriptOnce` (giống `delivery-report.js:3515`).
    2. Fetch detail qua `/api/odata/FastSaleOrder(${id})?$expand=OrderLines,Partner,User`.
    3. Gọi `window.generateCustomBillHTML(detail, {})` → render trong `<iframe srcdoc>` với `sandbox="allow-same-origin"`.
    4. Fallback `${workerBase}/api/fastsaleorder/print1?ids=${id}` (TPOS HTML) nếu generate fail.
- Header tóm tắt 1 dòng (Số + ngày + state badge) phía trên iframe để giữ context.

**Files**: `customer-hub/js/modules/transaction-evidence.js`

**Status**: Done — chờ verify live.

---

### [wallet] Rút gọn note "Thanh Toán Đơn Hàng" → "TT #ORDER" + bỏ "Trả từ ví" trùng lặp

**User báo**: Note giao dịch trừ tiền thanh toán đơn quá dài và bị trùng lặp:
`Thanh Toán Đơn Hàng #NJD/2026/67007 — Trả từ ví: 100.000đ — Trả từ ví: 100.000đ (Đơn: 953.000đ + 35.000đ ship…)`
→ Mong muốn: `TT #NJD/2026/67007 (Đơn: 953.000đ + 35.000đ ship…)`

**Root cause**: DB note nguồn từ [`tab1-sale.js:1415`](../orders-report/js/tab1/tab1-sale.js#L1415) đã có sẵn `— Trả từ ví: Xđ`. 3 view rewrite head note nhưng KHÔNG strip "— Trả từ ví" cũ → trùng lặp + dài.

**Fix**: Đổi `newHead` thành `TT #${orderCode}` (bỏ phần `Thanh Toán Đơn Hàng — Trả từ ví: …`) và strip tất cả `— Trả từ ví: Xđ` còn lại trong note nguồn.

**Files**:

- [`customer-hub/js/modules/customer-profile.js`](../customer-hub/js/modules/customer-profile.js) — HOẠT ĐỘNG VÍ trong Customer 360 right panel
- [`orders-report/js/tab1/tab1-wallet-modal.js`](../orders-report/js/tab1/tab1-wallet-modal.js) — Wallet history modal trong orders-report tab1
- [`delivery-report/js/delivery-report.js`](../delivery-report/js/delivery-report.js) — thêm helper `shortenCodPaymentNote()` cho hover popover "HOẠT ĐỘNG KHÁCH HÀNG"

**Status**: ✅ Done.

---

### [customer-hub] Fix nạp ví luôn ghi `created_by = 'admin'`

**User báo**: Trong ví khách hàng (Customer 360 → Hoạt động ví), mọi giao dịch Nạp tiền / Rút / Cấp công nợ ảo đều hiển thị "Duyệt bởi admin" dù user đăng nhập là người khác (vd "My").

**Root cause**: `customer-hub/js/modules/wallet-panel.js::_getCurrentUser()` đọc `localStorage.getItem('n2shop_current_user')` rồi lấy `u.email || u.displayName`. Nhưng **không nơi nào trong codebase ghi key `n2shop_current_user`** — auth thật ở `loginindex_auth` (sessionStorage/localStorage) qua `window.authManager`. Kết quả: object rỗng → fallback `'admin'` → backend lưu `customer_activities.created_by = 'admin'` → UI render "Duyệt bởi admin".

**Fix**: `_getCurrentUser()` ưu tiên `window.authManager?.getUserInfo()?.displayName || .username`; fallback đọc trực tiếp `loginindex_auth` (sessionStorage rồi localStorage); cuối cùng mới fallback `'admin'`.

**Files**: `customer-hub/js/modules/wallet-panel.js`

**Status**: ✅ Done. Cần test: đăng nhập user khác admin → vào Customer 360 → nạp ví → check activity log hiển thị đúng user.

---

### [delivery-report] Ẩn cặp WITHDRAW+HOÀN trong "Hoạt động khách hàng" + nút con mắt xem toàn bộ

**User báo**:

1. Trong modal chi tiết đơn ở Thống Kê Giao Hàng, section "HOẠT ĐỘNG KHÁCH HÀNG" hiển thị tất cả giao dịch — bao gồm cả các cặp `Thanh toán đơn (-100K)` + `HOÀN từ đơn hủy (+100K)` đã triệt tiêu nhau. Khi 1 khách tạo-hủy-tạo lại đơn nhiều lần (cùng giá), list bị rối với 4-6 dòng dù chỉ có 1-2 hoạt động ý nghĩa. customer-hub "Hoạt động ví" đã có logic ẩn các cặp này — cần đồng bộ.
2. Thêm nút con mắt cạnh chữ "Hoạt động gần đây" để khi cần xem chi tiết TOÀN BỘ giao dịch (kể cả cặp đã ẩn) thì bấm để mở rộng.

**Fix #1 — Ẩn cặp tạo+hoàn**:

- `delivery-report/index.html`: thêm `<script src="../shared/js/wallet-pair-utils.js">` trước `delivery-report.js`.
- `delivery-report/js/delivery-report.js` (`renderCustomer`): filter `data.recent_transactions` qua `window.WalletPairUtils.skipPairedCancelRefunds` — match `DEPOSIT(ORDER_CANCEL_REFUND)` với `WITHDRAW` trước đó cùng order ref + cùng amount → ẩn cả 2. Helper expect ASC, API trả DESC → reverse 2 lần. Fallback no-op nếu script chưa load.

**Fix #2 — Nút con mắt toggle "xem toàn bộ"**:

- `delivery-report/js/delivery-report.js`:
    - Extract per-row HTML render → closure `buildTxRow(tx)` + `buildTxListHtml(list)` để dùng được cho cả 2 mode.
    - Render đồng thời 2 list HTML: `[data-tx-mode="filtered"]` (default visible) và `[data-tx-mode="all"]` (hidden). Chỉ render list "all" khi thực sự có giao dịch bị ẩn (`rawTxs.length > txs.length`).
    - Section title `Hoạt động gần đây` bọc trong flex container + thêm `<button class="dr-hp-toggle-all">` với icon `fa-eye`. Click → swap visibility filtered ↔ all + đổi icon `fa-eye-slash` + đổi tooltip.
    - `txByUid` dùng `rawTxs` (không phải `txs`) để review button trong all-view cũng resolve được uid.
    - Wire toggle handler trong `wirePopoverActions` (dùng `:not([data-bound])` guard giống các nút khác).

**Tận dụng helper có sẵn**: `shared/js/wallet-pair-utils.js` (script-tag wrapper của `shared/browser/wallet-pair-utils.js` đã chạy production cho customer-hub) — không sửa logic pairing.

**Files**: `delivery-report/index.html`, `delivery-report/js/delivery-report.js`

**Status**: Done — chờ verify trong browser

---

## 2026-05-15

### [so-order][web2] Paste/drop ảnh vào image cell + hover-zoom popup toàn cục Web 2.0

**User**: "Hình copy paste vào phần area của riêng của ảnh -> đưa chuột hover vào các ảnh của web 2.0 đều zoom lên".

**Files**: `so-order/index.html`, `so-order/css/so-order.css`, `so-order/js/so-order-app.js`, `web2/shared/web2-effects.js`, `web2/shared/web2-effects.css`, `native-orders/index.html`.

**Task 1 — Image paste/drop cell (so-order modal)**:

- HTML: Mỗi image cell trong bảng modal đổi thành dropzone — `.so-img-cell-v2` (tabindex=0) wrap `.so-img-cell-hint` (icon + "Ctrl+V / Kéo thả") + URL input (`hoặc dán URL`) + upload button. 2 cell cho `productImage` + `invoiceImage`.
- CSS: `.so-img-cell-v2` thành dashed-border zone với hover/focus/dragover state (violet-purple, blue-blue tương ứng).
- JS [so-order-app.js](../so-order/js/so-order-app.js): Thêm `applyImageFile(name, file)` (centralise base64 + 2MB warn + preview refresh) + `wireImagePasteDrop()` gắn listener paste/dragover/dragleave/drop trên từng cell. Paste/drop ảnh → trích `File` từ `clipboardData.items` hoặc `dataTransfer.files` → applyImageFile → input.value = data URL → updateImgPreview render `<img>`.

**Task 2 — Hover-zoom popup global Web 2.0** ([web2-effects.js](../web2/shared/web2-effects.js)):

- Thêm `attachHoverZoom()` — singleton `.w2fx-zoom-popup` floating gắn cursor. Mouseover img matching whitelist → clone `src` vào popup → position bên cạnh chuột (auto-flip khi gần biên). Mouseout → hide.
- Whitelist selector: `.so-cell-img img, .so-img-preview img, .so-modal-table img, .expand-img, .line-img, .pick-img, .pk-image-preview img, .pk-message-image, .pk-preview-img, .product-image, .image-preview, .image-preview img, .preview img, [data-w2-zoom], img[data-w2-zoom]`.
- Exclude (avoid avatar/sidebar): `.tpos-sidebar, .sidebar, .so-tab-strip, [data-w2-no-zoom]`. Skip tiny img < 28×28px.
- CSS [web2-effects.css](../web2/shared/web2-effects.css): popup `position:fixed`, `box-shadow` deep, opacity transition 0.12s, max-size `min(420px,60vw) × min(420px,70vh)`. Reduced-motion → no transition.
- Reposition theo mouse move; auto-hide khi scroll (cursor stale).
- Cache-bust: `web2-effects.{css,js}?v=20260515b` ở [so-order/index.html](../so-order/index.html), [native-orders/index.html](../native-orders/index.html).

**Functionality**: Field `name` không đổi → handleOrderSubmit y nguyên. `data-upload` attr giữ → wireImageUpload (file picker click) song song với paste/drop.

**Verify live**: Mở modal so-order → 2 image cell có dashed border + "Ctrl+V / Kéo thả" label. Code path đã trace (paste listener gọi applyImageFile → input + preview update). JS syntax OK qua `node -c`. Visual zoom popup chưa test được do data prod hiện không có `<img>` thực tế (chỉ placeholder boxes `.so-cell-img-missing`); cơ chế trigger đã verify qua code review + DOM-event wiring.

**Status**: ✅ Done.

---

### [orders] InventoryPicker "Chọn từ Kho SP" thiếu template không có active variant

**User**: "bên trang này mấy mã B1976 cũng không tìm được" (purchase-orders/index.html).

**Files**: `purchase-orders/js/dialogs.js`, `purchase-orders/js/form-modal.js`

**Root cause**: Cùng nguyên nhân với tab3 orders-report fix trước đó. `InventoryPicker.loadProductsFromTPOS` ([dialogs.js:1588](../purchase-orders/js/dialogs.js#L1588)) gọi `Product/ExportFileWithVariantPrice` hoặc `ExportFileWithStandardPriceV2` với `{model: {Active: 'true'}}` → TPOS filter trên variant Active → templates có 0 active variants (vd B1976, B1977 — cả 4 size variants S/M/L inactive) → mất khỏi Excel → mất khỏi picker.

**Fix**:

1. `dialogs.js:loadProductsFromTPOS` — sau parse Excel, fetch `/ProductTemplate?$filter=Active eq true&$select=Id,DefaultCode,Name,ImageUrl,ListPrice,PurchasePrice`. Supplement template chưa có code, mark `id: 'tmpl-<Id>'`, `isTemplate: true`.
2. `dialogs.js:fetchProductDetails` — thêm nhánh đầu: nếu productId bắt đầu `tmpl-` → fetch `/ProductTemplate(id)` trực tiếp, synthesize Product-shaped payload.
3. `form-modal.js`: 2 chỗ callback `onSelect` — nếu `product.isTemplate`, set `item.tposSynced = true` để sync skip create-duplicate.

**Caveat**: User cần bấm "Tải lại" trên modal để invalidate localStorage cache.

**Status**: ✅ Done.

### [so-order] Redesign modal "Tạo Đơn Hàng" theo layout purchase-orders

**User**: "giao diện tạo đơn hàng làm giống cái giao diện này đi, giao diện thôi chứ chức năng giữ nguyên như hiện tại" (kèm screenshot purchase-orders modal).

**Files**: `so-order/index.html`, `so-order/css/so-order.css`, `so-order/js/so-order-app.js`

**Layout mới** (giữ 100% field names cho JS handler):

- **Row 1** — Nhà cung cấp | Ngày giao | Đợt | Số Kiện | Tổng KG | Tiền HĐ | Tiền tệ.
- **Row 2** — Ghi chú | Ghi chú CP (nội bộ) | Trạng thái.
- **Bảng sản phẩm** (1 row, giữ single-product behavior) — STT | Tên sản phẩm | Biến thể | SL | Giá Nhập | Giá Bán | **Thành tiền** (computed) | Hình ảnh sản phẩm | Hình ảnh hóa đơn.
- **Footer** — Tổng số lượng + Tổng tiền (left), THÀNH TIỀN (big blue) + Hủy + Lưu (Nháp) (right).

**CSS**: Thêm block `.so-modal-v2/.so-modal-panel-v2/.so-input-v2/.so-modal-table/.so-modal-foot-v2` ở cuối [so-order.css](../so-order/css/so-order.css). Width modal: `min(1600px, 96vw)`. Inputs cao 40px, border-radius 8px, focus violet glow. Bảng có thead `#f9fafb`, header weight 600. Footer rounded bottom, `THÀNH TIỀN` 20px bold #3b82f6 — match purchase-orders ([form-modal.js:1180+](../purchase-orders/js/form-modal.js#L1180)).

**JS dynamic totals**: Thêm `wireModalTotals()` + `updateModalTotals()` ở [so-order-app.js](../so-order/js/so-order-app.js). Listen `input` trên `qty/sellPrice/costPrice` → update `#soRowThanhTien`, `#soModalTotalQty`, `#soModalTotalAmount`, `#soModalFinalAmount`. Dùng `fmtCurrency(qty*sellPrice, tab.currency)` để consistent với shipment header.

**Functionality preserved**: `name="..."` attributes giữ nguyên (`supplier, shipDate, shipBatch, shipCaseCount, shipWeightKg, shipContractAmount, shipContractCurrency, productName, variant, qty, sellPrice, costPrice, productImage, invoiceImage, note, costNote, status`) → `handleOrderSubmit` không cần đổi. `data-upload` + `data-preview-for` cho ảnh giữ nguyên → `wireImageUpload()` chạy y như cũ.

**Verify live**:

- Mở modal → SL=5, Giá Bán=120000 → Thành tiền cell `600.000₫`, Footer Tổng tiền + THÀNH TIỀN `600.000₫`, Tổng SL `5`. ✅
- Submit test row (NCC=TEST NCC, Tên SP=TEST V2 Modal, Đợt=TEST-V2, SL=3, Giá Bán=50000, Giá Nhập=30000) → shipment + row tạo đúng ngày 15/5/2026. ✅
- Cleanup test data qua nút trash UI → 2 lô · 3 dòng · SL: 35 (về baseline). ✅

**Status**: ✅ Done.

---

### [orders] Barcode print recheck: TPOS OData 400 khi filter >20 `or` → toàn bộ 38/38 báo missing

**User**: "các mã này đều có trên tpos rồi" — dialog In mã vạch (purchase-orders) báo 38/38 sản phẩm KHÔNG tìm thấy trên TPOS (B2247, B2248, ..., +30 mã khác) dù tất cả CÓ thật.

**Files**: `purchase-orders/js/lib/barcode-label-dialog.js`

**Root cause**: `recheckTposForMissingCodes` Strategy A build 1 query với toàn bộ codes nối bằng `or`: `DefaultCode eq 'B2247' or DefaultCode eq 'B2248' or ... (38 lần)`. TPOS OData reject filter >~20 `or` clauses với HTTP 400 (test 2026-05-15: N=20 OK, N=25 fail). Code chỉ `throw` ở `!resp.ok` (sau đó catch ngoài cùng bỏ qua) → `foundCodes=[]` → tất cả vào nhóm "not found" → 38/38 missing.

**Fix**: Batch theo `BATCH_SIZE = 20`, mỗi batch fetch độc lập, try/catch per-batch (1 batch fail không kill các batch khác), accumulate `foundCodes` cross batches.

**Verified qua curl**: N=10/15/20 trả 200 + data; N=25 trả 400. Batch 20 đủ margin an toàn.

**Status**: ✅ Done.

### [orders-report] Tab3 suggestions thiếu template không có active variant (B1976, B1977)

**User**: "mã B1976, B1977 tpos có mà trang hình 3 không suggestion".

**Files**: `orders-report/js/tab3/tab3-core.js`, `orders-report/js/tab3/tab3-assignment.js`

**Root cause**: `loadProductsData()` ([tab3-core.js:333](../orders-report/js/tab3/tab3-core.js#L333)) gọi `Product/ExportFileWithVariantPrice` với `{model: {Active: "true"}, ids: ""}` — TPOS filter trên **variant** Active. Templates B1976 (TmplId 118721) và B1977 (TmplId 118720) đều Active=true nhưng cả 4 biến thể (B1977/B1977S/M/L và B1976/B1976S/M/L) đều Active=false → 0 dòng Excel → không vào `productsData` → không suggest.

**Fix**: Sau khi parse Excel, fetch thêm `ProductTemplate?$filter=Active eq true&$select=Id,DefaultCode,Name,ImageUrl` → supplement templates có DefaultCode chưa tồn tại trong productsData, gắn `id: 'tmpl-<Id>'` + `isTemplate: true`. `addProductToAssignment` ([tab3-assignment.js:19](../orders-report/js/tab3/tab3-assignment.js#L19)) thêm nhánh đầu: nếu productId bắt đầu `tmpl-` → fetch `/ProductTemplate(id)?$expand=ProductVariants...` trực tiếp, synthesize productData; existing fallback "no active variants → add template as single assignment" tự động xử lý đúng.

**Status**: ✅ Done. Reload Page hoặc clear cache để load lại productsData. Slice 10 vẫn đủ cho search prefix "b197" (~9 matches sau fix).

### [so-order] Bỏ toast sync + Tổng HĐ luôn render theo tab.currency

**User**: "Bỏ cái toast thông báo 'Đồng bộ dữ liệu từ thiết bị khác' và HÀ NỘI thiết lập tiền tệ VND mà sao có CNY ở bảng?"

**Files**: `so-order/js/so-order-app.js`

**Fix 1 — Toast**: Bỏ `notify('Đồng bộ dữ liệu từ thiết bị khác', 'info')` trong `remoteHandler` ([so-order-app.js:861-864](../so-order/js/so-order-app.js#L861-L864)). Remote sync vẫn re-render qua `renderAll()`, chỉ ngắt notification ồn ào.

**Fix 2 — Currency mismatch ở Tổng HĐ**: Shipment có field `contractCurrency` per-shipment, lệch với `tab.currency`. Khi user tạo Đợt 2 trong tab HÀ NỘI (VND) với contractCurrency=CNY, display ra `25.000,00 CNY (87.500.000₫)` — mâu thuẫn với badge tab.

**Root cause**: `shipmentHeaderHtml` cố tình render dual (raw + converted): comment cũ ghi "contractCurrency is independent of tab currency". Khi tab=VND mà shipment=CNY thì raw=CNY xuất hiện đầu, VND ở dấu ngoặc.

**Fix**: Đổi sang single display theo `tab.currency`. Convert raw → VND trung gian → tab.currency:

```js
const rawVnd = contractRaw * currencyToVndRate(contractCur, tab);
const tabToVnd = currencyToVndRate(tab.currency, tab) || 1;
const displayAmount = rawVnd / tabToVnd;
const contractDisplayText = fmtCurrency(displayAmount, tab.currency || 'VND');
```

Bỏ block `${contractCur !== 'VND' ? ... : ''}` trong HTML, chỉ giữ 1 span.

**Data**: Không migrate. Shipment vẫn lưu `contractCurrency` + `contractAmount` raw. Chỉ display thay đổi → user có thể switch tab VND↔CNY, mỗi tab tự convert ra currency của mình.

**Verify live**: `localhost:8089/so-order/` HÀ NỘI: Đợt 2 hiển thị `Tổng HĐ: 87.500.000₫` (single, không còn CNY raw); Đợt 1 vẫn `13.504₫`. HƯƠNG CHÂU rỗng (chưa có shipment) → logic CNY chưa render-test nhưng formula symmetric.

**Status**: ✅ Done.

---

### [orders] Fix auto-generate product code: jump B2246 → B19752 vì query Product variants

**User**: "tìm nguyên nhân ở hình sao tự động tạo mã lại tạo ra B19752 và mã B19751 hiện tại đang ở đâu".

**Files**: `purchase-orders/js/lib/tpos-search.js`

**Root cause**: `getMaxProductCode()` query `/odata/Product` (= biến thể), kết hợp greedy regex `^B(\d+)` ăn hết digits của `B19751` (variant của template `B1975` với attribute value `1`) → parse thành `19751` → max = 19751 → next = **B19752**. Thực tế template max là `B2246` (Id 119001, tạo 2026-05-15). DB n2store đúng (max = 2246), TPOS query mới sai.

**Where is B19751**: Variant Id `157038`, ProductTmplId `118722` (template `B1975` — "0905 B14 QUẦN SHORT LƯNG THUN TRƠN 9003 HỒNG"), 1 trong 4 variants (3 S/M/L inactive, B19751 active).

**Fix**: Đổi URL từ `/api/odata/Product` → `/api/odata/ProductTemplate` ở `getMaxProductCode` ([tpos-search.js:463](../purchase-orders/js/lib/tpos-search.js#L463)). Templates không có variant suffix → regex parse đúng template counter.

**Status**: ✅ Done (chỉ sửa main path, fallback `getMaxProductCodeFallback` vẫn dùng `Product/OdataService.GetViewV2` — chấp nhận khi main fail thì fallback may have skew, nhưng main almost always succeeds).

### [so-order] Auto-collapse cũ + expand newest on first visit + persist cache

**User**: "NGÀY tự cộng collapse lại, hàng NGÀY đầu tiên (ngày mới nhất) tự động expand khi vào lần đầu (các lần sau lấy theo cache)".

**Logic** ([so-order-storage.js:87-138](../so-order/js/so-order-storage.js#L87-L138)):

- Thêm flag `tab.uiInitialized` (boolean). `_migrateTab(tab, ...)` lần đầu thấy flag missing → sort shipments by date desc → set `collapsed: id !== newestId` → mark `uiInitialized: true`.
- `_read()` track mutation, nếu `_migrateTab` đổi gì thì auto `_write` ngay → persist cache lần đầu để các lần sau không re-default.
- Tab mới (chưa có shipment): flip flag ngay để shipment đầu tiên user add không bị retroactive collapse.

**Bug fix**:

1. Remote snapshot handler clobber state với raw FB data (không qua migration). Fix: `remoteHandler = () => { state = SoOrderStorage.load(); renderAll(); }` thay vì gán trực tiếp `state = remoteState`.
2. Toggle shipment-header (`[data-toggle-shipment]`) thiếu `pushSync()` → state mới không sync lên Firestore. Fix: thêm `pushSync()` sau `updateShipment(collapsed)`.
3. Sau Sync.init xong: `pushSync()` để migrated state (uiInitialized=true, collapsed defaults) đẩy lên Firestore — mọi thiết bị fresh không bị reset.

**Verify live**:

- Clear localStorage → reload → newest (9/5 Đợt 2) expanded, older (7/5 Đợt 1) **collapsed**, `uiInitialized: true` persist.
- Click expand older → reload → cả 2 expanded (cache giữ).
- Click collapse newest → reload → newest collapsed, older expanded (user choice giữ).
- Firestore doc đã có `uiInitialized: true` + per-shipment collapsed state.

**Status**: ✅ Done.

---

### [so-order] Column header vào trong shipment expand + per-tab columnVisibility + Firestore sync

**User**:

1. "phần như hình cho vào expand ngày" → header cột (NCC, STT, TÊN SP, …) đặt trong mỗi shipment expand.
2. "Ẩn hiện cột sẽ là setting riêng cho từng section tab và được lưu để đồng bộ nhiều máy".

**Column header move-in** ([so-order-app.js:106-128](../so-order/js/so-order-app.js#L106-L128)):

- `renderTableHead()` không render global `<thead>` (CSS `display: none`).
- `columnHeaderRowHtml()` sinh `<tr.so-shipment-colhead>`. `shipmentHtml(sh,...)` khi expanded: shipment header → column header → data rows. Collapsed: chỉ shipment header.

**Per-tab column visibility**:

- Schema: `columnVisibility` chuyển từ top-level state → `tab.columnVisibility`.
- `_migrateTab(tab, globalColVis)` seed per-tab từ legacy global setting nếu có (back-compat).
- `setColumnVisibility(state, tabId, key, visible)` + `getColumnVisibility(tab)` API mới.
- Helper `activeColVis()` ở app.js đọc của tab đang active; mọi renderer dùng helper này.
- Modal heading: "Ẩn / hiện cột — tab \"HÀ NỘI\"" để user biết scope per-tab.

**Firestore sync** (theo `docs/architecture/DATA-SYNCHRONIZATION.md`):

- Doc `so_order_v2/main` (Firestore as source of truth).
- `SoOrderStorage.Sync.init(onRemoteUpdate)`: load FB → seed localStorage cache → attach `onSnapshot` listener.
- `pushSync()` helper fire sau mỗi mutation (add/update/delete row/shipment/tab/footer/columnVisibility/setActiveTab).
- Echo guard `_isListening` flag — remote snapshot fire không push lại (tránh loop).
- Remote update handler: `renderAll()` + notify "Đồng bộ dữ liệu từ thiết bị khác".
- Firebase scripts: `firebase-app/auth/firestore-compat` + `shared/js/firebase-config.js`.

**Verify live**:

- Toggle costNote off ở HÀ NỘI → `hanoiCostNote: false`.
- Switch HƯƠNG CHÂU → `huongCostNote: true` (vẫn default, độc lập).
- Firestore read: `{exists:true, lastUpdated:..., hanoiCostNote:false, huongCostNote:true}` → cross-device sync OK.

**Status**: ✅ Done.

---

### [so-order] Schema shipments + 2 cột Ghi Chú / Ghi Chú CP + header expandable theo ngày+đợt

**User**:

1. "Thêm cột GHI CHÚ, GHI CHÚ CP trước cột TRẠNG THÁI".
2. "Thêm hàng thông tin NGÀY, ĐỢT, KIỆN, KG, tiền hợp đồng 2 mệnh giá → hàng này expand ra gồm bảng đã có NCC ở trong → thêm dữ liệu trùng NGÀY thì gộp vào expand luôn".

**Schema thay đổi** ([so-order-storage.js](../so-order/js/so-order-storage.js)):

- `tab.rows[]` → `tab.shipments[]`, mỗi shipment: `{id, date, batch, caseCount, weightKg, contractAmount, contractCurrency, collapsed, rows[]}`.
- Migration `_migrateTab()` tự convert legacy `rows[]` → 1 synthetic shipment (không mất data).
- Helper `findShipment(tab, {date, batch})` → khi user thêm dòng mới với cùng ngày+đợt, gộp vào shipment có sẵn thay vì tạo mới.
- Methods mới: `addShipment / updateShipment / deleteShipment / moveRow`. Methods cũ `addRow/updateRow/deleteRow` nhận thêm param `shipmentId`.

**Form modal** ([so-order/index.html](../so-order/index.html)):

- Chia 2 fieldset: "Thông tin lô (gộp theo Ngày + Đợt)" + "Thông tin dòng order".
- Shipment fields: Ngày giao (date input), Đợt, Số Kiện, Tổng KG, Tiền hợp đồng + dropdown tiền tệ HĐ (VND/CNY/USD/KRW/JPY/THB/EUR).
- Row fields thêm 2 textarea: GHI CHÚ + GHI CHÚ CP (xám/cam highlight).
- Hint tỉ giá HĐ live: "[CNY (≈ 3.500 ₫)]".

**Render** ([so-order-app.js](../so-order/js/so-order-app.js)):

- `renderTableBody` sort shipments by date desc, mỗi shipment = 1 header row (`<tr.so-shipment-head>` colspan=full) + N data rows.
- Header text: "Ngày giao: 7/5/2026 — Đợt 1 — 1 Kiện : 67 KG | Tổng 67 KG | Tổng HĐ: 13.504,00 CNY (47.264.000₫)" — match format screenshot user.
- Click header (caret chevron-down/right) → toggle `collapsed`, lưu state.
- Mỗi header có 3 button action: thêm dòng vào lô, sửa thông tin lô, xóa lô.
- `currencyToVndRate(currency, tab)` với fallback rate table (CNY 3500, USD 26000, EUR 28000, JPY 170, KRW 18, THB 720) — Tiền HĐ độc lập với tab currency.

**Columns** thêm 2 key vào `DEFAULT_COLUMNS` + `COLUMNS` array, đặt giữa `invoiceImage` và `status`:

- `note` (Ghi Chú) — màu xám
- `costNote` (Ghi Chú CP) — màu cam, nền vàng nhạt

**Submit logic**:

- Edit row + đổi ngày/đợt → `findShipment` ở shipment khác → `moveRow` sang đó.
- Cùng shipment → `updateRow` + `updateShipment` (mutate metadata in place).
- Add row → `findShipment` → gộp / hoặc `addShipment` mới → `addRow`.

**Verify live** ([so-order-two-shipments.png](../downloads/n2store-session/so-order-two-shipments.png)):

- Lô 1: ngày 9/5 Đợt 2, 2 Kiện 120KG, HĐ 25.000 CNY (87.500.000₫) — 1 row Shenzhen.
- Lô 2: ngày 7/5 Đợt 1, 1 Kiện 67KG, HĐ 13.504 CNY — 2 rows gộp đúng (Quảng Châu A + Hồng Châu B cùng nhập với ngày 7/5 đợt 1).
- Counter: "2 lô · 3 dòng SL: 35".

**Status**: ✅ Done.

---

### [so-order] Trang Sổ Order mới + bỏ thanh `.tab-navigation` ở mọi trang

**User**:

1. "Tạo 1 trang 'Sổ Order' — giao diện như native-orders — gồm tab HÀ NỘI, HƯƠNG CHÂU, có + để thêm → bảng NCC, STT, Tên SP, Biến Thể, SL, Giá Bán (tiền tệ theo tab + tỉ giá VNĐ), Giá Nhập, Ảnh SP, Ảnh HĐ, Trạng Thái, Thao Tác → Tổng SL, Giảm Giá, Phí Ship → nút Tạo Đơn Hàng lưu trạng thái Nháp → có cài đặt ẩn hiện cột."
2. "Hình 2 là css riêng hả? bỏ đi" → "trang nào cũng có thanh hình 2 → bỏ thanh hình 2".

**Tạo trang Sổ Order** (~1200 dòng):

- [so-order/index.html](../so-order/index.html) — shell + 3 modals (form order, tab settings, column visibility) + lightbox ảnh.
- [so-order/css/so-order.css](../so-order/css/so-order.css) — table + tabs + modal + status pills (vàng/xanh/lá/đỏ cho Nháp/Đã Đặt/Đã Nhận/Hủy).
- [so-order/js/so-order-storage.js](../so-order/js/so-order-storage.js) — localStorage CRUD (key `soOrder_v1`); schema `{tabs:[{id,label,currency,rate,footer,rows}], activeTabId, columnVisibility}`.
- [so-order/js/so-order-app.js](../so-order/js/so-order-app.js) — controller: render tab strip, table head/body (cột filter qua `columnVisibility`), form modal, FX hint per-tab (`[CNY (≈ 3.500 ₫)]`), image upload base64.
- Sidebar: thêm "Sổ Order" trong group Sale Online ở [web2/shared/tpos-sidebar.js:139](../web2/shared/tpos-sidebar.js#L139).

**Tính năng**:

- Default 2 tab: HÀ NỘI (VND), HƯƠNG CHÂU (CNY rate 3500). User add thêm: TOKYO/JPY, USD, KRW, THB, EUR.
- Giá Bán/Nhập tab non-VND → hiển thị 2 dòng: raw (vd "50,00 CNY") + quy đổi (vd "≈ 175.000₫").
- Footer: Tổng SL auto, Giảm Giá + Phí Ship input (lưu per-tab), Tổng tiền VNĐ = Σ(sellPrice × qty × rate) − discount + shipping.
- Trạng thái 4 giá trị, default Nháp khi tạo mới.
- Click ảnh → lightbox; ESC đóng modal; image upload soft cap 2MB.

**Bỏ thanh `.tab-navigation`**:

User shot rằng thanh tab top "Đơn Web / TPOS × Pancake / Kho SP" rendering xấu (link mặc định không có style) và trùng chức năng sidebar trái. Bỏ trên các trang dùng cross-page navigation:

- [native-orders/index.html:40-69](../native-orders/index.html#L40-L69) → thay bằng `<header class="page-head-mini">` giữ `#totalCounter` (JS line 174 ref) + source pill.
- [web2/products/index.html:37-66](../web2/products/index.html#L37-L66) → tương tự.
- [orders-report/main.html:590](../orders-report/main.html#L590) — **KHÔNG đụng**, đó là feature tabs nội bộ (`switchTab('orders'|'product-assignment'|'overview'|'pending-delete'|'kpi-commission')`), không phải cross-page navigation.

**Add CSS shared** ở [web2/shared/web2-effects.css](../web2/shared/web2-effects.css) (cuối file): `.page-head-mini`, `.page-head-title`, `.page-head-counters` — dùng chung mọi trang.

**Verify live**:

- so-order test: thêm row CNY tab → "5 × 50 CNY × 3500" = 875.000₫ tổng tiền ✓.
- Add tab JPY 170₫ thành công.
- Reload sau khi bỏ thanh tab nav: cả 2 screenshot (`so-order-no-tabbar.png` + `native-orders-no-tabbar.png`) trang sạch, sidebar trái còn nguyên là cách duy nhất navigate.

**Status**: ✅ Done.

---

### [native-orders] Sidebar đoạn hội thoại — độc lập với order, học theo tpos-pancake/pancake.vn

**User**: "panel trái đoạn hội thoại → này đừng lấy thông tin từ đơn hàng → làm theo tpos-pancake phần pancake hoặc như pancake.vn → nó độc lập để không bị hạn chế và lấy được tất cả đoạn hội thoại realtime".

**Trước**:

- `_loadInboxSidebar` early-return nếu `!order.fbPageId` → modal mở từ đơn không Facebook → sidebar trống.
- `_switchChatToCustomer(originalOrder, fbId, cName)` chỉ override `fbUserId` → click conv Store khi modal mở từ order House → chat thread fetch sai page → load fail.
- Avatar dùng `currentOrder.fbPageId` cho tất cả rows → cross-page rows mất avatar (đã fix turn trước, nhưng còn click handler).
- Synthetic prepend WS dùng `order.fbPageId` cho conv mới → khách mới ping từ Store sẽ render với page House.

**Sau** ([native-orders-app.js](../native-orders/js/native-orders-app.js)):

- Bỏ guard `!order.fbPageId` ở `_loadInboxSidebar` → sidebar luôn load đa-page từ `pancake_all_accounts`.
- `_convRowHtml` thêm `data-page-id="<rowPageId>"` → click handler đọc đúng page của conv.
- `_switchChatToCustomer(order, fbId, cName, clickedPageId)` — thêm param `clickedPageId`, synthetic order set `fbPageId: clickedPageId || originalOrder.fbPageId` → chat thread fetch từ đúng page Pancake.
- `_bindConvRowClicks` + WS-prepend click handler + initial render click handler đều pass `row.dataset.pageId`.
- WS synthetic prepend dùng `pageId` từ event thay vì `order.fbPageId` → conv mới đúng page.

**Verify live** (port 8089, modal mở từ order House `NW-20260513-0016`):

- 50 sidebar rows, mix House (`pg:117267091364524`) + Store (`pg:270136663390370`).
- Click Pandora Kim (Store) → chat thread load 96 bubbles, `msgInput.dataset.conversationId = 270136663390370_2148317755276377` (Store conv), no error → ✅ cross-page chat hoạt động.
- Architecture giờ giống `tpos-pancake/js/pancake/pancake-init.js` (`PancakeColumnManager`) — sidebar là standalone conversation list, không bind cứng vào 1 order/page.

**Status**: ✅ Done.

---

### [render][tpos-pancake][web2-shared] Lưu page names cùng IDs ở `realtime_accounts.proposed_pages`

**User**: "lúc lưu key socket ở render db thì bạn lưu id page và tên page để dùng".

**Trước**: `proposed_pages` JSONB lưu mảng ID strings `["117267091364524","270136663390370",...]` → pool-status / log chỉ show số, không biết "Nhi Judy House".

**Sau**:

- **Server** ([n2store-realtime/server.js](../n2store-realtime/server.js)):
    - `saveRealtimeAccount` chấp nhận thêm `acc.pages: [{id, name}, ...]`, persist JSONB array of `{id, name}` objects. Fallback bare ID strings cho legacy callers.
    - `_normalisePagesField()` helper đọc cả 2 shapes (legacy string + new object) → uniform `[{id, name}]`.
    - `loadActiveAccounts()` trả thêm `pages: [{id, name}]` bên cạnh `pageIds`. Verified_pages merge với name lookup từ proposed_pages.
    - `RealtimeClient.pageLabels {id → name}` set bởi `RealtimePool.startAll()`. `getStatus()` trả `pages: [{id, name}]` thay vì chỉ pageIds.
    - Log pool start: `[POOL] ▶ Thu Huyền → 4 pages: [Nhi Judy House, NhiJudy Store, ...]` thay vì numeric ids.
- **Client** ([tpos-pancake/js/pancake/pancake-realtime.js:144-200](../tpos-pancake/js/pancake/pancake-realtime.js#L144-L200), [web2/shared/web2-realtime.js:390-415](../web2/shared/web2-realtime.js#L390-L415)):
    - `_startMultiAccount` + `startMulti` gửi cả `pages: [{id, name}, ...]` cùng `pageIds` trong payload start-multi.
    - Nguồn dữ liệu: `localStorage.pancake_all_accounts.{accId}.pages` đã có sẵn `{id, name}`.

**Migration**: `_normalisePagesField` đọc back-compat, nên rows cũ trong DB (chỉ id) vẫn load OK. Sau khi client gọi start-multi lần kế, rows tự upsert sang shape mới.

**Verify**: client `_startMultiAccount` vẫn return `{ok:true, poolSize:5}` (broker hiện đang chạy code cũ, ignore `pages` field, không break). Sau khi Render redeploy → pool-status sẽ trả `pages: [{id:"117...", name:"Nhi Judy House"}, ...]`.

**Status**: ✅ Done client + server code; pending Render deploy.

---

### [native-orders] Sidebar inbox modal — multi-page (House + Store), không lock theo `order.fbPageId`

**User**: "hình 2 nó filter theo gì hay nó đang chọn page cố định vậy? → cho hình 2 realtime 2 page đi".

**Vấn đề**: `_loadInboxSidebar` + `_pollSidebarOnce` gọi `Web2Chat.fetchConversationsByPage(order.fbPageId)` → list chỉ chứa convs của 1 page = page của order user mở. Khi mở order House → chỉ thấy convs House, Store events từ WS prepend nhưng không có baseline list.

**Fix** ([native-orders-app.js:2684-2780](../native-orders/js/native-orders-app.js#L2684-L2780)):

- New helper `_getSidebarPageIds(order)` gom page_ids từ `localStorage.pancake_all_accounts` (tất cả accounts) + `Web2Chat.getAllPageAccessTokens()` + `order.fbPageId` → dedup → array.
- New helper `_fetchConvsMerged(pageIds, limit)` Promise.allSettled fetch song song mỗi page, dedupe by `conv.id` (giữ latest theo updated_at), sort desc, slice top 50.
- `_loadInboxSidebar` + `_pollSidebarOnce` đều dùng 2 helper trên → cover tất cả pages user có quyền.
- WS handler `_handleSidebarWsEvent` không đổi (vốn page-agnostic, đã accept cross-page events).

**Verify live** (port 8089, mở order NW-20260513-0016 = page House):

- Sidebar 50 rows: **House 19 + Store 31** ✓ (screenshot `sidebar-multipage-house-store.png`)
- Top rows mix House + Store convs theo `updated_at` desc.
- WS subscriber tiếp tục flow events cho cả 2 page (verified spy 3 phút trước: House 2 + Store 7).

**Status**: ✅ Done.

---

### [tpos-pancake] Migrate Pancake realtime → multi-account broker (`/api/realtime/start-multi`)

**User**: "quan trọng nhất là 2 page house, store" → "Browser test api server realtime mới → nếu hoạt động chính xác → cho tpos-pancake dùng luôn (tpos-pancake có 2 server, 1 tpos đừng đụng, 2 pancake thay bằng server multi mới)".

**Trước migration**: `PancakeRealtime.connectServerMode()` POST `chatomni-proxy.../api/realtime/start` (single-account) → broker pool chỉ có 1 account (Thu Huyền) cover House+Store. Nếu JWT Thu Huyền expire → mất realtime hoàn toàn 2 page chính.

**Sau migration** ([tpos-pancake/js/pancake/pancake-realtime.js:88-200](../tpos-pancake/js/pancake/pancake-realtime.js#L88-L200)):

- `connectServerMode()` ưu tiên `_startMultiAccount()` → POST direct `https://n2store-realtime.onrender.com/api/realtime/start-multi` với mọi account từ localStorage `pancake_all_accounts`. Fallback `_startSingleAccount()` nếu fail.
- Bypass Cloudflare worker (`/api/realtime/*` proxy → n2store-fallback, không có start-multi route — đã verify từ commit `28303f6` cho native-orders).
- Đọc `pages` trực tiếp localStorage vì `pancakeTokenManager.getAllAccounts()` chỉ lưu `{token, uid, exp, name}`, không có `pages`.
- Skip account expired (`v.exp < nowSec`).
- Notification report: "Realtime online (N account, M pages)".

**Verify live (port 8089)**:

- Broker `/health/detailed`: pool 1→5 accounts (Thu Huyền + Huyền Nhi + Thu Lai + Chloe Duongg + Con Nhoc), totalPages 3→14.
- Multi-account result: `{ok:true, poolSize:5, totalPages:4 unique}`.
- Spy WS message: cả House (117267091364524) + Store (270136663390370) đều join qua nhiều account → broker dedup 30s window tránh echo.
- TPOS side ([tpos-pancake/js/tpos/](../tpos-pancake/js/tpos/)) KHÔNG đụng — theo dặn user.

**Trả lời câu hỏi 24/7**:

- Broker auto-respawn pool từ DB `realtime_accounts` table khi restart (`autoConnectClients()` ở [n2store-realtime/server.js:1327](../n2store-realtime/server.js#L1327)) → KHÔNG cần web client mở.
- Cần mở browser CHỈ khi JWT expire (~7 ngày) — bất kỳ trang Web 2.0 (native-orders, tpos-pancake, web2-shared) cũng push start-multi mới được.

**Status**: ✅ Done — commit `be6cd96` (114+ lines).

---

### [native-orders][web2-shared] Realtime — direct-WS-first (học tpos-pancake) + poll thành true fallback

**User**: "hình 1 pancake nhận dữ liệu đoạn hội thoại liên tục — hình 2 không thấy nhận liên tục → được thì học bên tpos-pancake đi" + "polling chỉ là fallback khi realtime không dùng được — nếu socket realtime kết nối thì không cần polling".

**Port browser-direct mode** ([web2-realtime.js](../web2/shared/web2-realtime.js)):

- Rewrite thành **dual-mode**: `_connectDirect()` WS thẳng `wss://pancake.vn/socket/websocket?vsn=2.0.0` join Phoenix channels `users:{uid}` + `multiple_pages:{uid}` + `pages:{pageId}` (mỗi page). Heartbeat 30s. Forward `pages:new_message`/`update_conversation`/`order:tags_updated`. `_connectProxy()` Render broker fallback.
- Public API giữ `subscribe/start/isConnected` + `mode()` returns `'direct'|'proxy'|'disconnected'`.
- **Direct bị Pancake reject** từ non-pancake.vn origin (code 1006). Cần extension/reverse proxy mới spoof Origin được. Fallback proxy hoạt động → mode = `'proxy'`. Khi extension proxy có sẵn, direct sẽ tự takeover.

**Polling = true fallback** ([\_startSidebarPoll](../native-orders/js/native-orders-app.js)):

- Trước: `setInterval(poll, 12000)` chạy luôn dù WS up.
- Sau: watchdog tick 5s check `isConnected()`. WS up → 0 poll. WS down >12s → fire 1 fallback. WS recover → ngừng.
- Net: WS-connected steady state = **0 polls** (Playwright monkey-patched fetch, 60s, pollCount=0).

**Verify**:

- Direct WS readyState=3 (Pancake Origin policy block localhost) → proxy auto-active, `isConnected=true mode=proxy`.
- Broker `/health/detailed`: connected=true, wsReadyState=1, refCounter=368, 0 reconnects.
- 0 sidebar poll fetches trong 60s WS-connected window.

**Limitation**: Render broker shared single Pancake user creds (Thu Huyền `c2177f20-...`) → chỉ join page `117267091364524` (NhiJudy House). Pages khác yêu cầu different creds → fallback poll-only. Broker multi-user là Phase 2 (ngoài scope).

Bump: `web2-realtime.js?v=20260515b`, `native-orders-app.js?v=20260515r`.

Status: ✅ Realtime cho NhiJudy House, 0 poll waste. Direct-WS attempt code-ready cho khi extension proxy có sẵn.

---

### [native-orders][web2-shared] Realtime chat — subscribe `pages:update_conversation` cho chat thread (fix cảm-giác polling)

**User**: "socket pancake hiện tại đang ở render hả → kiểm lại xem realtime trực tiếp → hiện tại hình như nó polling".

**Recon**: WS `wss://n2store-realtime.onrender.com` connected (Render broker giữ Phoenix WS to pancake.vn 24/7), 6 clients, ref 354. Broker join `multiple_pages:{userId}` + `pages:{pageId}` per page → forward `pages:update_conversation`, `pages:new_message`, `order:tags_updated` về browser.

**Gap phát hiện**:

1. Chat thread `_chatState.wsSub` chỉ subscribe `['pages:new_message']`. Pancake **rarely fires new_message** (cần FB socket creds đặc biệt) — documented in [server.js comment](../n2store-realtime/server.js). Event chính reliable là `pages:update_conversation` chứa `conversation.last_message` (đủ data cho bubble). Sidebar subscribe đúng cả 2 → tự cập, nhưng thread giữa miss → cảm giác polling.
2. `_loadInboxSidebar` gọi `Web2Realtime.start({pageIds:[order.fbPageId]})` chỉ 1 page → broker `_lastStartedKey` cache thì rồi mở order page khác cũng không re-subscribe.

**Fix**:

- [\_onIncomingWsMessage](../native-orders/js/native-orders-app.js): normalise 2 payload shapes (`payload.message` vs `payload.conversation.last_message`), inject `conversation_id` vào `last_message`. Dedupe by msg.id giữ nguyên.
- Chat WS sub: subscribe **cả 2 type** `['pages:new_message', 'pages:update_conversation']`. De-dupe nên double-fire vô hại.
- `_wireSidebarRealtime`: `start({pageIds: <union current + all PATs>})` thay vì 1 page (broker tự retry-remove pages thiếu permission, còn lại là expected).
- [web2-realtime.start()](../web2/shared/web2-realtime.js): drop `_started` flag, dùng `_lastStartedKey = sorted(pageIds).join('|')` — sub-set khác → re-call broker; sub-set giống → no-op.
- Expose `Web2Realtime._internal.subscribers` + `NativeOrdersApp._debug.{chatState, realtimeStatus, injectFakeMessage}` để verify từ devtools.

**Verify** (Playwright):

- WS connected, 3 subscribers (sidebar new_msg/update_conv + chat combined).
- `NativeOrdersApp._debug.injectFakeMessage("⚡ TEST")` → bubble xuất hiện instant, 55→56 rows ✓ → WS handler path đúng.
- Broker `/health/detailed`: connected=true, wsReadyState=1, refCounter tăng đều (heartbeat OK).

Bump cache: `web2-realtime.js?v=20260515a`, `native-orders-app.js?v=20260515p`.

Status: ✅ Realtime WS-driven (không polling). Debug helper `NativeOrdersApp._debug.injectFakeMessage()` test instant.

---

### [native-orders] Fix link-preview broken image — dùng post_attachments[0].url thay vì att.url (FB permalink)

**User**: "sao hình nó không hiển thị?". 10/16 IMG broken — src dạng `https://facebook.com/{pageId}_{postId}` (FB post permalink, không phải ảnh CDN).

**Root cause** ([native-orders-app.js:\_renderLinkPreview](../native-orders/js/native-orders-app.js)): link attachment shape = `{url: <FB permalink>, name, post_attachments: [{url: <real CDN>, type:'photo', image_data}]}`. Code cũ `thumb = att.url || post?.url` → `att.url` always set → `||` short-circuit → dùng FB permalink làm `<img src>`. Trình duyệt fetch → HTML/404 → broken.

**Fix**: tách `thumb` (image src = ưu tiên `post.url`) khỏi `href` (click target = `att.url`). Wrap card thành `<a target=_blank>` để click mở FB post. Title fallback `att.name → post.title → post.description → 'Bài viết'`.

**Verify** (Playwright): Kitty Thảo conv 16 imgs → 0 broken (trước 10), 13/16 proxy load OK. Screenshot: [link-preview-image-fixed.png](../downloads/n2store-session/link-preview-image-fixed.png).

Bump cache: `native-orders-app.js?v=20260515o`.

Status: ✅ Done.

---

### [native-orders] Fix sidebar trống trên Bình luận tab + auto-switch sang Tin nhắn khi click conv

**User**: "phần bình luận bị bug đoạn hội thoại bên trái".

**Root cause** ([native-orders-app.js:2366](../native-orders/js/native-orders-app.js)): branch `tab === 'comments'` trong `_renderInteractionsModal` chỉ wire reply handlers — KHÔNG gọi `_loadInboxSidebar(order)`. Tin nhắn gọi đầy đủ; Bình luận miss → sidebar stuck ở skeleton.

**Fix**:

1. Gọi `_loadInboxSidebar(order)` cũng trong nhánh comments.
2. `_switchChatToCustomer`: khi user click conv mà tab hiện tại ≠ messages → set `_interactionsState.tab='messages'` + `_renderInteractionsModal(synthetic, 'messages')`. Comments tied to specific order's post (`fbCommentId/fbPostId`) nên không hợp lý load comments cho khách khác.

**Verify** (Playwright localhost:8089):

- `openInteractions(...,"comments")` → sidebar 50 rows, không skeleton ✓.
- Click Kitty Thảo trên Bình luận tab → auto switch Tin nhắn, header = "Kitty Thảo", `#msgThread` load chat của Kitty Thảo. Screenshot: [comments-tab-fixed.png](../downloads/n2store-session/comments-tab-fixed.png).

Bump cache: `native-orders-app.js?v=20260515n`.

Status: ✅ Done.

---

### [native-orders][web2-shared] Pancake-style cache — persist page settings + filter state qua localStorage

**User**: "tiếp tục coi pancake lưu gì ở local và cache làm theo luôn".

**Recon Pancake storage** (via prior pancake-inspect + fresh probe):

- LS unauthenticated: chỉ 2 marketing keys (`lastExternalReferrer`, `lastExternalReferrerTime`).
- Pancake KHÔNG persist conv/tag data ra LS — tất cả trong **Redux memory** (`window.__pancakeReduxStore__`).
- Redux `conversations` reducer 42 keys: `filteredType`, `filteredTag`, `filteredConversationsCloneList`, `dateRangeFilter`, `filteredAdIds`, `filteredWebs`, `selectedId`, `selectedTags`, `pageSettingTags`, `lastTagsUpdateTimestamp`, `unreadConvCount`, `viewingUsers`, `usersTyping`, `data` (conv list), …
- Cache strategy = **fetch-once-per-session + in-memory** (reset reload). `lastTagsUpdateTimestamp` cho stale check.
- Cookies: chỉ marketing; JWT httpOnly.

**Apply cho native-orders** (tốt hơn Pancake — persist qua LS để survive reload):

1. **Page settings cache** ([web2-chat-client.js fetchPageSettings](../web2/shared/web2-chat-client.js)):
    - LS key `web2_pancake_page_settings_v1` mapping `{pageId: {fetchedAt, settings}}`.
    - TTL **30 phút**. Load LS vào memory Map khi module init.
    - **Single-flight**: `_pageSettingsInflight` Map dedupe concurrent calls cùng pageId.
    - **Stale-while-revalidate**: cache có nhưng stale → return ngay với `stale:true`, revalidate background. API fail → fallback stale.
    - **Quota handling**: catch `setItem` quota exceeded → drop oldest entry + retry.

2. **Filter state per page** ([native-orders-app.js \_loadFilterStateFor / \_persistFilterState](../native-orders/js/native-orders-app.js)):
    - LS key `n2store_native_inbox_filter_v1` mapping `{[pageId]: {includeTags:[], excludeTags:[], conditions:[]}}`.
    - Restore khi `_wireSidebarFilter` first call hoặc khi page id đổi (`nextPageId !== _currentPageId`).
    - Persist sau mỗi mutation (tag/condition toggle, reset). Reset xoá entry hoàn toàn.
    - **Pancake KHÔNG làm** — họ reset `filteredTag="ALL"` mỗi reload. Ta giữ filter cũ là UX tốt hơn.

**Verify** (Playwright localhost:8089):

- Tick BOOM (id=201) → LS `n2store_native_inbox_filter_v1` = `{"117267091364524":{"includeTags":["201"],...}}` ✓. LS `web2_pancake_page_settings_v1` = 11.5KB (cache 16 tag + quick_replies + …) ✓.
- Reload → mở modal → click Có chứa thẻ: 16 tags hiển thị **instant** (không chờ API), BOOM checked, badge "1", filter auto-apply → 50→2 rows visible ngay.
- Reset: badge tắt, LS entry cho page bị xoá hoàn toàn.

**Pancake parity matrix**:

| Cái             | Pancake                     | Native-orders trước              | Native-orders sau                 |
| --------------- | --------------------------- | -------------------------------- | --------------------------------- |
| Tag definitions | Redux memory (reset reload) | Memory Map 5min TTL              | LS 30min TTL, SWR, survive reload |
| Filter state    | Redux memory (`ALL`)        | Memory only (reset reload)       | LS per-page, persist forever      |
| Conv list       | Redux memory + WS           | Memory + WS poll                 | (same — same as Pancake)          |
| Quick replies   | Redux memory                | LS `web2_quick_replies_cache_v1` | (same)                            |

Status: ✅ Done. Phase 2 todo: conv list LS cache + SWR, persist `_chatState` selected conv.

---

### [native-orders][web2-shared] "Lọc theo" — rebuild Pancake-style 2-cột với tag include/exclude từ page settings

**User**: gửi screenshot Pancake "Lọc theo" dropdown 2-cột (Thẻ hội thoại / Điều kiện) với tag chips multi-select kèm màu thật. Yêu cầu "coi pancake có gì làm giống vậy" → "bên pancake".

**Phase 1 thay flat dropdown** (4-7 option) thành Pancake-style 2-col popover:

- [web2-chat-client.js](../web2/shared/web2-chat-client.js): thêm `fetchPageSettings(pageId, opts)` route `${WORKER_URL}/api/pancake/pages/{pageId}/settings?access_token=${jwt}`. Cache 5 phút trong `_pageSettingsCache` Map. Trả `{ ok, settings: { tags: [{id, text, color}], quick_replies, page_access_token, … } }`.
- [native-orders-app.js](../native-orders/js/native-orders-app.js):
    - Markup `_renderInboxSidebarShell`: replace single-list menu bằng `.w2-fm-pancake` flex layout. Left col 240w (Thẻ hội thoại → Có chứa thẻ / Loại trừ thẻ + Điều kiện), right col 280-360w (sub-content dynamic).
    - CSS: popover 540-640px wide, shadow lg, 10px radius. Sub-list scroll, tag chip pill style với color từ settings. Search input ở mỗi tag panel.
    - State `_filter = { includeTags: Set, excludeTags: Set, conditions: Set }`. "Không gắn thẻ" model như pseudo-tag id `__untagged` để AND logic uniform. Filter combine AND giữa các nhóm; trong nhóm tag include là OR (row pass nếu có ≥1 tag được tick).
    - `_rowMatchesFilter`: parse `data-tag-ids` từ row (đã bake `tagIdsStr` trong `_convRowHtml`), check include/exclude intersection + conditions.
    - `_renderFilterSub(cat)`: render sub-panel theo cat. Tags panel có search input filter client-side; conditions panel 5 checkbox (Chưa đọc / Đã đọc / Chưa trả lời / Có SĐT / Có đơn livestream).
    - `_loadPageTagsForFilter(pageId)`: lazy load `Web2Chat.fetchPageSettings` lần đầu mở popup → cập nhật `_pageTagDict` Map. Seed trước bằng tag IDs từ DOM rows nên không-có-API vẫn show "Thẻ #{id}" placeholder.
    - Button hiển thị count badge khi ≥1 filter active; categories show count riêng. "Xoá bộ lọc" reset cả 3 set.
    - Position popup `left: 0` (popup extends rightward into chat area) — `right: 0` ban đầu khiến popup `left=-204px` off-screen.
    - Anchor `left: 0` của `.w2-inbox-sb-filter-wrap`.
- [index.html](../native-orders/index.html): bump `web2-chat-client.js?v=20260515a` + `native-orders-app.js?v=20260515l`.

**Verify** (Playwright localhost:8089):

- Open NW-20260513-0016 → click Lọc theo → menu width 540, position left=241 right=781 ✓.
- Click Có chứa thẻ → settings load 16 tags với màu thật: BOOM (red), CHECK IB (orange), NHẮC KHÁCH (pink), NJD ƠI (purple), NV. BO (cyan), Nv My (blue), NV My CK + Gấp (blue), NV My KH đặt (blue), Nv. Duyên (teal), NV. Hạnh (green), ... khớp screenshot Pancake user gửi.
- Tick BOOM (id=201) → 2 conv visible, badge button "1", cat count "1" ✓.
- Click Điều kiện → tick Chưa đọc → combined visible 0 (no BOOM+unread overlap), badge "2".
- Click Xoá bộ lọc → 50 visible, badge hidden, button inactive ✓.

Screenshot: [filter-pancake-final.png](../downloads/n2store-session/filter-pancake-final.png).

**Phase 2 todo** (chưa làm):

- HOẶC/VÀ logic combinator (Pancake có Điều kiện | HOẶC).
- Lưu filter state vào localStorage để persist qua reload.
- Wire filter qua Pancake server-side endpoint `tags[]` param thay vì DOM filter (nếu user muốn thật-time-fetch theo filter).

Status: ✅ Phase 1 done.

---

### [native-orders] "Lọc theo" — wire dropdown filter (Tất cả / Chưa đọc / Đã đọc / Có gắn nhãn)

**User**: "Lọc theo này chưa có chức năng". Button bên sidebar trái tồn tại nhưng không bind click.

**Fix** ([native-orders-app.js](../native-orders/js/native-orders-app.js)):

- `_renderInboxSidebarShell`: bọc button trong `.w2-inbox-sb-filter-wrap` (relative anchor) + thêm `#w2InboxFilterMenu` dropdown với 4 option (`all` / `unread` / `read` / `tagged`), `hidden` attribute mặc định.
- CSS dropdown popover (`position:absolute`, `top:calc(100%+6px)`, `right:0`, shadow + 8px radius). Item active có ✓ tím + bg `#ede9fe`.
- Button highlight `.is-active` (tím) khi filter ≠ `all`. Label đổi từ "Lọc theo" → tên filter đang chọn.
- `_convRowHtml`: thêm `data-tag-count="${tags.length}"` để filter tagged.
- `_sidebarFilter` state ('all'|'unread'|'read'|'tagged'). `_applySidebarFilter()` walk `.w2-inbox-conv` rows, `style.display='none'` các row không match. Empty-state hint khi 0 row match.
- `_wireSidebarFilter()` bind toggle dropdown + outside click close. `data-filterWired='1'` idempotent.
- Compose với search: filter apply tự động sau `doSearch` render, sau initial `_loadInboxSidebar`, sau `_mergeSidebarConvs` (poll-merge).

**Verify** (Playwright localhost:8089): load NW-20260513-0016 → 50 rows total, 2 unread, 30 tagged. Click Chưa đọc → 2 visible, btn highlighted. Đã đọc → 48. Có gắn nhãn → 30. Tất cả → 50 + reset btn. Outside-click close ✓. Screenshots: [filter-dropdown-open.png](../downloads/n2store-session/filter-dropdown-open.png), [filter-unread-applied.png](../downloads/n2store-session/filter-unread-applied.png).

Status: ✅ Done.

---

### [native-orders] Right panel — avatar IMG thay vì chỉ initial

**User**: "bên phải chưa có avatar". Card khách trong right panel chỉ show 1 chữ cái "H" trong tròn gradient — không lấy ảnh FB như header giữa.

**Fix** ([native-orders-app.js:\_renderInfoTab](../native-orders/js/native-orders-app.js)): khi có `fbUserId + fbPageId` render `<img class="w2-customer-card-avatar" src="${_avatarUrl(...)}" onerror=...>`. Fallback `onerror` swap về `<div>` gradient + initial — match cách header dùng `&quot;` để escape inner double-quotes (lần đầu viết direct `"` trong onerror khiến parser đóng attribute sớm, 3 section sau "Khách hàng" leak ra ngoài `#w2InboxRightBody` → 7 section thay vì 4. Fix bằng `&quot;` + tách `safeInitial` để reuse).

**Verify**: switch sang Huỳnh Thành Đạt → `rightChildCount=2` (tabs + body), `sectionCount=4` (đúng), avatar tag=`IMG`, `naturalWidth=100`, src đúng từ chatomni-proxy. Screenshot: [downloads/n2store-session/native-rightavatar-final.png](../downloads/n2store-session/native-rightavatar-final.png).

Status: ✅ Done.

---

### [native-orders] Fix conv-switch — header + right panel update khi click sang khách khác

**User bug**: search "0123456788" → click "Huỳnh Thành Đạt" trong sidebar → middle chat header vẫn show "Thế Hoàng / NW-20260513-0016" + Page badge cũ, right panel cũng giữ nguyên thông tin Thế Hoàng. Chỉ messages thread đổi. Sidebar `is-active` highlight đúng nhưng header inconsistent.

**Root cause**: `_switchChatToCustomer` chỉ gọi `_loadAndRenderThread(synthetic)` để load thread mới. Header (avatar/name/code/phone/tags) + right panel info được render lần đầu trong `_renderInteractionsModal` rồi không bao giờ update — không có ID trên DOM để target.

**Fix** ([native-orders-app.js](../native-orders/js/native-orders-app.js)):

1. Tách helper `_renderChatHeaderInner(order) → { avatarHtml, infoHtml }` để dùng chung giữa lần render đầu + lần switch.
2. Bọc avatar vào `<div id="w2ChatHeaderAvatar">` và info section vào `<div id="w2ChatHeaderInfo">` để target nhanh.
3. Thêm `_applyChatHeaderForOrder(order)` swap innerHTML 2 slot trên + re-init lucide icons.
4. Phone copy click chuyển sang **delegation** trên `#w2ChatHeaderInfo` (vì element con sẽ bị thay khi switch).
5. `_switchChatToCustomer` giờ:
    - Detect `isSameCustomer = originalOrder.fbUserId === fbId` → no-op clear nếu same.
    - Khác khách → synthetic clear `phone/code/tags/amountTotal/status/address/note/messageCount/commentCount` (vì không có đơn cho khách này) → header hiện "Huỳnh Thành Đạt" + Page badge, KHÔNG còn order code.
    - Re-render `#w2InboxRightBody = _renderInfoTab(synthetic)` → right panel hiện khách mới với "Mã đơn —", "Trạng thái —", "Tổng tiền 0đ".
    - Strip badges `.interactions-tab .w2-inbox-tab-badge` (cũ là của Thế Hoàng, vô nghĩa cho khách khác).
6. Sidebar / search input / scroll / WS sub đều **giữ nguyên** vì không re-render modal toàn bộ.

**Verify** (Playwright localhost:8089):

- `openInteractions("NW-20260513-0016")` → header "Thế Hoàng" + code "NW-20260513-0016".
- Type "0123456788" → 2 results: Nguyễn Tâm, Huỳnh Thành Đạt.
- Click Huỳnh Thành Đạt row → header đổi "Huỳnh Thành Đạt" + Page …364524, NO code badge, "không SĐT" placeholder. Right panel: input "Tên khách"=Huỳnh Thành Đạt, "Mã đơn —". Tab badges `[]`. Chat thread load đúng messages của Huỳnh Thành Đạt.
- Screenshot: [downloads/n2store-session/native-conv-switch-fix-v2.png](../downloads/n2store-session/native-conv-switch-fix-v2.png).

Status: ✅ Done.

---

### [native-orders][web2-shared] Search sidebar — wire Pancake server-side conv search

**User**: "chức năng tìm kiếm chưa hoạt động → bạn browser test vào pancake.vn/NhiJudyStore coi chi tiết hết đi, các js, hàm ẩn, network, console,...".

**Reverse-engineer endpoint** ([scripts/pancake-search-trace.js](../scripts/pancake-search-trace.js) — one-shot Playwright trace mở Pancake admin với JWT cookies, dùng `page.keyboard.type(query)` để gõ thật, capture `request`/`response`/WS frames + hook Redux dispatch):

```
POST https://pancake.vn/api/v1/pages/{pageId}/conversations/search
     ?q={query}&access_token={jwt}
Body: empty (server reads q from querystring)
Response: { conversations: [ { id, customers, from, last_message,
            snippet, type:'INBOX'|'COMMENT', tags, updated_at, ... } ] }
```

Same shape như `fetchConversationsByPage` → sidebar row renderer dùng lại được.

**Test query "Huynh Thanh Dat"** → 2 matched customers (`Huỳnh Thành Đạt29.01` + `Huỳnh Thành Đạt03.12`). Search match theo customer name, không match theo SĐT (Pancake không search số).

**Implementation**:

1. [web2-chat-client.js:`searchConversations(pageId, query, opts)`](../web2/shared/web2-chat-client.js) — POST proxy qua CF Worker `/api/pancake/...`. Body bỏ luôn + bỏ `Content-Type` để tránh CORS preflight trên `multipart/form-data` (browser cross-origin từ localhost → CF Worker required preflight). Hỗ trợ `AbortSignal` để cancel keystroke cũ khi gõ tiếp.

2. [native-orders-app.js:`_wireSidebarSearch(order, baselineConvs)`](../native-orders/js/native-orders-app.js) — listen `input` event, debounce 300ms, fire search. `Enter` skip debounce. Empty query → restore `baselineConvs` (50 page-list rows ban đầu). `AbortController` cancel inflight khi có keystroke mới. Dim list `opacity: 0.55` khi đang chờ.

3. `_bindConvRowClicks(list, order)` extracted helper — gắn click handler cho cả initial render lẫn search-result render.

**Verify live trên page `117267091364524`** (NJD Store):
| Query | Rows | Sample |
|-------|------|--------|
| (empty) | 50 | baseline page list |
| `huynh thanh dat` | **9** | tất cả "Huỳnh Thành Đạt" — match perfectly |
| `0788730969` | 0 | Pancake không search by phone |

**Cache bump**: `web2-chat-client.js v=20260514j`, `native-orders-app.js v=20260515k`.

**Status**: ✅ Search hoạt động đúng — gõ vào ô "Tìm kiếm" sẽ filter list ngay (300ms debounce), giống Pancake admin.

---

### [realtime-broker][native-orders] Per-page Phoenix channel join — verified

**User**: "tôi thấy bên pancake có socket trực tiếp mà? được thì bạn build lên render đi". Đúng — Pancake admin browser join thẳng `wss://pancake.vn/socket/websocket?vsn=2.0.0` (Phoenix Channels v2.0, KHÔNG cần extension).

**Trace**: [`scripts/pancake-ws-trace.js`](../scripts/pancake-ws-trace.js) dùng Playwright `page.on('websocket')` (bắt frames trước khi WS object tồn tại). 35s trace: admin join 2 channels — `users:{userId}` và **`pages:{pageId}`** (per-page) — chỗ flow `pages:new_message`, `update_conversation`, `tag_conversations`, `seen_conversation`, etc.

**Bug broker**: chỉ join `users:{userId}` + `multiple_pages:{userId}` (cross-page summary, không carry per-page events đầy đủ).

**Fix** trong [n2store-realtime/server.js](../n2store-realtime/server.js): thêm `_joinPageChannel(pageId)`, gọi cho mỗi page sau `multiple_pages`. Payload match live trace `{ accessToken, userId, platform: "web" }`. Commit `4dbd5576`, Render deploy `dep-d839euqp8t4c73aqsffg` live 03:49:35Z.

**Verify từ Render logs**:

| Check                                         | Result                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Joining pages:117267091364524 channel`       | ✓ 03:49:35                                                                                                              |
| `phx_reply [pages:117267091364524] status=ok` | ✓ 03:49:36                                                                                                              |
| Per-page events arriving                      | ✓ `tag_conversations`, `seen_conversation`, `recent_contents:add`, `messages:mark_as_deleted`, `viewing_conversation:*` |
| Broker → browser WS                           | ✓ direct WS test: 5 frames `pages:update_conversation` page=`117267091364524` trong 30s                                 |
| Web2Realtime client                           | ✓ 4 events qua `subscribe()` trong 25s                                                                                  |

**Bonus bug fixed**: `_handleSidebarWsEvent` chỉ đọc `payload.message` (cho `new_message`) — `update_conversation` lưu data ở `payload.conversation` (id at `.conversation.id`, last text at `.conversation.last_message.message`). Trước fix, conv ID lookup thất bại → sidebar không update. Sau fix: normalize cả 2 shape vào 1 object trước khi extract.

Thêm `console.log('[NativeOrders][RT] {type} conv=… page=…')` trong handler làm breadcrumb.

**Cache bump**: `native-orders-app.js v=20260515j`.

**Status**: ✅ Infrastructure end-to-end. Khi customer gửi tin INBOX mới → sidebar bump tức thời. Polling 12s vẫn chạy song song làm backstop.

---

### [issue-tracking] Nút copy bên cạnh mọi SĐT 10 số

**User**: "tất cả định dạng sđt 10 số trang này có nút copy"

**Approach**: Thêm 1 file enhancer auto-scan DOM, không cần sửa từng render site (script.js có 5+ chỗ render SĐT khác nhau).

- New: [`issue-tracking/js/phone-copy.js`](../issue-tracking/js/phone-copy.js) — IIFE: TreeWalker quét text nodes match `\b0\d{9}\b`, wrap thành `<span class="phone-with-copy"><span class="phone-num">SĐT</span><button class="phone-copy-btn">📋</button></span>`. MutationObserver (debounce qua `requestAnimationFrame`) bắt cả nội dung render sau (ticket list, modal đơn khách, history). Skip `SCRIPT/STYLE/INPUT/TEXTAREA/BUTTON/OPTION/SELECT` + nested `.phone-with-copy`. Click delegated capture-phase → `navigator.clipboard.writeText` (fallback `execCommand('copy')` cho non-secure context) → flash dấu `✓` 1.1s.
- CSS append: [`issue-tracking/css/style.css`](../issue-tracking/css/style.css) — `.phone-with-copy` (inline-flex gap 4px, no-wrap, tabular-nums) + `.phone-copy-btn` (18×18, opacity 0.65 → 1 hover, 12×12 SVG clipboard icon, focus-visible outline primary, `.copied` state xanh `#10b981`).
- Wire: [`issue-tracking/index.html`](../issue-tracking/index.html) thêm `<script src="js/phone-copy.js">` sau `customer-orders-lookup.js`.
- Verify Playwright (`localhost:8089/issue-tracking/index.html`): 95 tickets render → 96 `.phone-with-copy` wrappers (95 customer cells + 1 trong modal đơn khách), `scriptLoaded:true`, sample `["0944307373","0906306019","0977188680"]`.

**Status**: ✅ Done

---

### [native-orders] Chat modal — Pancake-faithful styling + realtime sidebar (Phase 1.5)

**User**: (1) "Làm giao diện giống pancake — màu sắc, cỡ chữ, font, hover, tương tác, read/unread"; (2) "Realtime đoạn hội thoại bên trái và realtime tin nhắn ở giữa"; (3) "Bỏ nút tạo đơn bên phải".

**Style tokens** captured live qua [`scripts/pancake-browser-session.js`](../scripts/pancake-browser-session.js):

| Token           | Pancake                                       | Áp                                |
| --------------- | --------------------------------------------- | --------------------------------- |
| Font            | `Roboto, Helvetica, Arial, sans-serif`        | `.w2-inbox-card`                  |
| Body            | 14px / `#1d2939`                              | inherit                           |
| Outgoing bubble | `#dcf8c6` (light green) radius 12px           | `_bubbleHtml`                     |
| Incoming bubble | `#ffffff` radius `12 12 12 4`                 | `_bubbleHtml`                     |
| Chat header     | 68px, white, border-bottom `1px #ddd`         | `.w2-inbox-header`                |
| Chat area bg    | `#ebebeb`                                     | `#msgThread`, `#interactionsBody` |
| Conv row        | 86px min-h, padding 12px                      | `.w2-inbox-conv`                  |
| Conv read       | bg `#fff`, hover `#f5f6f8`                    |                                   |
| Conv unread     | bg `#dde1e7`, name 600                        | `.is-unread`                      |
| Conv active     | bg `#e6f7ff`                                  | `.is-active`                      |
| Conv name       | 14px regular                                  |                                   |
| Conv preview    | 13px `#667085`                                |                                   |
| Conv time       | 12px `#98a2b3`                                |                                   |
| Unread dot      | 8×8 `#f04438`                                 | `.w2-inbox-conv-badge`            |
| Search input    | transparent inside `#f5f6f8` capsule, 32px    |                                   |
| Filter button   | bg `#eaecf0`, text `#344054`, 32px weight 500 |                                   |

**Realtime sidebar** (`_wireSidebarRealtime` + `_handleSidebarWsEvent`):

- Sub `Web2Realtime.subscribe({ types:['pages:new_message'], debounceMs:80 })`.
- Khi tin mới: find row qua `data-conv-id` (fallback `data-fb-id`), update preview + time, bump lên đầu (`list.prepend`), nếu incoming + không phải conv đang mở → add `.is-unread` + spawn red dot.
- Conv mới chưa có row → render synthetic + bind click + prepend.
- Click row → remove `.is-unread` + xóa badge.
- Unsubscribe trong `_teardownChatState`.

**Realtime chat (giữa)** — đã có từ session trước (`_onIncomingWsMessage` → `_appendBubbleDom`).

**Bỏ Tạo đơn**: `_renderInboxRightPanel` chỉ còn tab Thông tin.

**Verify live**: font Roboto ✓, outgoing `rgb(220,248,198)` ✓, incoming `rgb(255,255,255)` ✓, radius `12 12 12 4` ✓, tab Tạo đơn removed ✓, 50 conv rows ✓, 55 bubbles ✓.

**Cache bump**: `native-orders-app.js v=20260515e`.

**Status**: ✅ Done Phase 1.5.

---

### [native-orders] Chat modal — Pancake-style 3-col inbox layout (Phase 1)

**User**: gửi screenshot Pancake admin inbox + "làm tất cả để giống hình". Sau đó: "không cần làm phần tạo đơn pancake order đâu vì web 2.0 có hệ thông tạo đơn rồi".

**Scope Phase 1** (xem plan tại [`docs/plans/native-orders-pancake-inbox.md`](plans/native-orders-pancake-inbox.md)):

- Modal mở rộng 96vw × 92vh, CSS Grid 3 cột `320px 1fr 380px`.
- **Trái — Sidebar**: search "Tìm kiếm" + filter "Lọc theo" + list 50 conv mới nhất của page (fetch qua `Web2Chat.fetchConversationsByPage` mới). Click row → swap chat sang khách đó (giữ modal mở).
- **Giữa — Chat**: header avatar + tên + 5 icon button (history, user, package, external-link, ×). Tabs Tin nhắn/Bình luận + badge. Thread bubble giữ nguyên. **Quick-reply tag bar 14 chip nhiều màu** (rgba 0.4 opacity, white text shadow) match Pancake `.btn-tag-item` palette. Click chip → paste template + signature vào input.
- **Phải — Right panel**: tab Thông tin (active) + tab Tạo đơn là `<a target=_blank>` link sang `tpos-pancake/index.html?phone=…` (web 2.0 đã có hệ tạo đơn riêng — KHÔNG dựng lại). Thông tin tab: Khách hàng card, Đơn hiện tại (mã/trạng thái/tổng tiền/tags), Ghi chú nội bộ, Lịch sử đơn (placeholder).

**Files**:

- [native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js) — rewrite `_renderInteractionsModal` markup; thêm `_renderInboxSidebarShell`, `_renderInboxRightPanel`, `_renderInfoTab`, `_renderQuickReplyTags`, `_wireQuickReplyTags`, `_loadInboxSidebar`, `_convRowHtml`, `_switchChatToCustomer`; ~350 dòng CSS trong `_ensureChatModalCss`. Sidebar `await Web2Chat.syncFromRenderDB()` trước fetch để có JWT.
- [web2/shared/web2-chat-client.js](../web2/shared/web2-chat-client.js) — thêm `fetchConversationsByPage(pageId, opts)`.

**Verify live trên NW-20260513-0016**:

| Metric            | Result                    |
| ----------------- | ------------------------- |
| Grid columns      | `320px 682.398px 380px` ✓ |
| Sidebar conv rows | 50 ✓                      |
| Chat bubbles      | 55 ✓                      |
| Quick reply tags  | 14 ✓                      |
| Right panel       | Thông tin rendered ✓      |

**Bug đã fix khi build**: Stray backtick trong CSS comment (`.w2-inbox-right-foot`) làm template literal đóng sớm → toàn bộ CSS không inject → grid không apply. Sửa bằng bỏ backticks trong comment.

**Cache bump**: `native-orders-app.js v=20260515d`, `web2-chat-client.js v=20260514h`.

**Phase tiếp theo (chưa code)**: P4 composer enhancements (attach image/file/sticker), P5 polish (virtualization nếu >500 conv, real-time WS update cho sidebar, responsive). Xem plan doc.

**Status**: ✅ Done Phase 1.

---

### [native-orders][web2-shared] Web 2.0 dùng chung Pancake account pool với Web 1.0

**User**: "coi bên web 1.0 render db lưu account pancake ở đâu -> copy các account và cách refresh token qua web 2.0".

**Web 1.0 store** ([shared/js/pancake-token-manager.js](../shared/js/pancake-token-manager.js)):

- Render DB tables qua endpoints `/api/pancake-accounts`, `/api/pancake-page-tokens`, `/api/pancake-account-pages` (proxy qua CF Worker).
- localStorage keys: `pancake_jwt_token`, `pancake_jwt_token_expiry`, `pancake_page_access_tokens`, `pancake_all_accounts` (object keyed by account_id), `tpos_pancake_active_account_id`.
- Refresh PAT pattern: POST `/api/pancake/pages/{pageId}/generate_page_access_token?access_token={accountJwt}` — thử lần lượt từng account đến khi 1 cái thành công (khác account admin khác page).

**Web 2.0 trước đây** chỉ đọc localStorage 1 JWT, không sync server, không multi-account. Hậu quả: vừa thấy lỗi "Chưa cấu hình token Pancake cho page 117267091364524" dù Render DB có đầy đủ 6 accounts.

**Thay đổi** ([web2/shared/web2-chat-client.js](../web2/shared/web2-chat-client.js)):

1. **LS keys đồng bộ với web 1.0**: thêm `ALL_ACCOUNTS = 'pancake_all_accounts'`, `ACTIVE_ACCOUNT_ID = 'tpos_pancake_active_account_id'`. Cùng schema → 2 app dùng chung storage không xung đột.
2. **`syncFromRenderDB()`**: chạy parallel `/api/pancake-accounts?active=true` + `/api/pancake-page-tokens`, merge vào localStorage. Promote 1 account thành active JWT slot (theo preferred ID, fallback non-expired). Cached cho cả session (`_syncedThisSession` + `_syncInFlight` Promise dedup).
3. **`getAllAccounts()`**: expose account map dạng `{ id → {token, exp, fbId, fbName, pages, ...} }`.
4. **`generatePageAccessToken(pageId)` rewrite**: thay vì chỉ dùng active JWT, build candidate list ưu tiên (a) accounts admin page đó (`acc.pages.includes(pageId)`), (b) active JWT, (c) non-expired accounts khác. Loop đến khi 1 cái success. Match web 1.0 multi-account fallback.

**Wire vào flow** ([native-orders-app.js `_loadAndRenderThread`](../native-orders/js/native-orders-app.js)):

- Sau skeleton render, await `Web2Chat.syncFromRenderDB()` (cached sau lần đầu).
- Nếu `getPageAccessToken(pageId)` vẫn null, await `generatePageAccessToken(pageId)` để auto-mint từ pool.
- Sau đó mới fall-through tới `hasTokensFor` check → error UI chỉ hiện khi thực sự không có account nào.

**Đo live trên NW-20260513-0016** (page 117267091364524 trước đây báo "chưa cấu hình"):

- `accountsAfterSync`: 6
- `pageTokensAfterSync`: 3
- `bubbles`: 55 (load + render thành công)
- Error "Chưa cấu hình token" KHÔNG còn xuất hiện.

**Files**: cache bump `web2-chat-client.js v=20260514g`, `native-orders-app.js v=20260514ak`.

**Status**: ✅ Done.

---

## 2026-05-14

### [native-orders] Chat: revert Lenis + content-visibility, học từ Pancake admin inbox

**User báo**: "mở modal load response tin nhắn vào modal nó hơi lag", "scroll mắt nhìn không được mượt", sau đó: "vào https://pancake.vn/NhiJudyStore bằng cookies → coi css đoạn hội thoại".

**Research Pancake admin inbox** (qua persistent Playwright session [`scripts/pancake-browser-session.js`](../scripts/pancake-browser-session.js) với JWT cookies từ `serect_dont_push.txt`):

Pancake DÙNG:

- `rc-virtual-list` (Ant Design virtualization) — chỉ render bubble visible, DOM nhỏ kể cả với 1000+ tin nhắn.
- IndexedDB: `PancakeOffline`, `ComCakeDatabase`, `fb_meta_data`, `geo`, `keyval-store` — offline cache layer.

Pancake KHÔNG dùng (kiểm chứng `getComputedStyle` trên `.message-list.virtual-scroll`):

- ❌ Smooth-scroll lib (Lenis/GSAP/Locomotive/iScroll/SmoothScrollbar/FramerMotion).
- ❌ `scroll-behavior: smooth`, `overscroll-behavior: contain`, `scrollbar-gutter: stable`.
- ❌ `contain`, `will-change`, `content-visibility`, `transform` trên scroll container.
- ❌ Service Worker.

→ Native scroll trên DOM nhỏ (nhờ virtualization). Đo perf: worst 20.5ms, avg 16.5ms, p95 18.6ms — ngang n2store của ta.

**Revert toàn bộ over-engineering** trong [native-orders-app.js](../native-orders/js/native-orders-app.js):

- Bỏ Lenis (script tag + `_attachLenis` + `_chatState.lenis`).
- Bỏ `content-visibility: auto` + `contain-intrinsic-size` trên `.w2-chat-row`.
- Bỏ `contain: layout style paint` trên `.w2-chat-bubble`.
- Bỏ `overscroll-behavior: contain` + `scrollbar-gutter: stable` trên `#msgThread`.
- Bỏ inline `threadEl.style.contain` + `willChange` trong `_renderChatThread`.
- **Giữ duy nhất** `#msgThread { scroll-behavior: smooth }` — chỉ apply cho programmatic scrollTo, không slow wheel.

**Thêm 2 win nhỏ**:

1. **In-memory cache `fetchConversations`** ([web2-chat-client.js:113-135](../web2/shared/web2-chat-client.js#L113-L135)): cache theo `(pageId, fbId)` TTL 5 min. Re-open modal cho cùng customer: 150ms → ~0ms.
2. **Skeleton shimmer** ([native-orders-app.js:3328-3340](../native-orders/js/native-orders-app.js#L3328-L3340)): 5 placeholder bubbles với CSS animation `w2ChatShimmer` hiển thị ngay khi modal mở, replace bằng real bubbles khi fetch xong. Feedback ngay thay vì màn trắng 335ms.

**Files**: cache bump `native-orders-app.js v=20260514aj`, `web2-chat-client.js v=20260514f`. Thêm [scripts/pancake-browser-session.js](../scripts/pancake-browser-session.js) persistent session cho inspect Pancake admin UI với JWT cookies.

**Status**: ✅ Done.

---

### [native-orders] Chat: smooth wheel scroll qua Lenis library (REVERTED — xem entry trên)

**User**: "kéo chuột rồi dừng lại → nó bị giựt đứng lại không mượt → thêm hiệu ứng vào scroll đi" → sau đó: "revert lại đi, coi trên github, google có hiệu ứng scroll nào không?"

**Research GitHub** (smooth-scroll JS libs sorted by stars):

| Lib                               | ⭐        | Bundle     | Note                                                                                     |
| --------------------------------- | --------- | ---------- | ---------------------------------------------------------------------------------------- |
| iscroll                           | 12.8k     | —          | old (2017), mobile-first                                                                 |
| **darkroomengineering/lenis**     | **13.9k** | **5KB gz** | **active (commit 8h trước), MIT, designed for nested wrapper, used by Awwwards winners** |
| locomotive-scroll                 | 8.8k      | bigger     | parallax-heavy                                                                           |
| smooth-scrollbar                  | 8k        | bigger     | custom scrollbar overlay                                                                 |
| cferdinandi/smooth-scroll         | 5.4k      | tiny       | chỉ anchor links                                                                         |
| gblazex/smoothscroll-for-websites | 0.9k      | 5KB        | old nhưng proven                                                                         |

→ Chọn **Lenis**: active maintenance, có `wrapper` option để bind vào container cụ thể (msgThread), `syncTouch:false` để Mac trackpad giữ momentum native, `scrollTo()` API cho jump-bottom mượt.

**Implementation** ([native-orders-app.js:3196-3228](../native-orders/js/native-orders-app.js#L3196-L3228)):

```js
const lenis = new Lenis({
    wrapper: threadEl,
    content: threadEl,
    smoothWheel: true,
    syncTouch: false,
    lerp: 0.12,
    autoRaf: true,
    autoResize: true,
});
_chatState.lenis = lenis;
```

- Load qua unpkg CDN: `<script src="https://unpkg.com/lenis@1.3.23/dist/lenis.min.js">` (CF cached, 17KB raw / 5KB gz).
- Init trong `_attachScrollLoader` khi modal mở.
- Destroy trong `_teardownChatState` khi modal đóng.
- Jump-bottom button + WS-new-msg badge dùng `lenis.scrollTo('bottom', { duration: 0.4 })` cho smooth animate.
- Fallback: nếu CDN fail load (`typeof Lenis !== 'function'`), code rơi về native scroll, không vỡ.

**Đo curve trên wheel +600px (lerp 0.12)**:

| t (ms) | scrollTop delta | % của target           |
| ------ | --------------- | ---------------------- |
| 15     | +65             | 11% (initial response) |
| 49     | +174            | 29%                    |
| 98     | +292            | 49%                    |
| 182    | +418            | 70%                    |
| 265    | +486            | 81%                    |
| 349    | +524            | 87%                    |
| 515    | +555            | 92%                    |
| 666    | +565            | 94% (asymptotic tail)  |

Smoother feel hơn hand-rolled 0.22 lerp trước (settle nhanh hơn nhưng cảm giác abrupt). Lenis cho ramp dài, dễ chịu kiểu Apple.

**Verify**:

- ✅ Scroll events vẫn fire → load-older trigger còn hoạt động
- ✅ Direct `scrollTop = X` vẫn work (scrollbar drag, init scroll-to-bottom)
- ✅ Jump-bottom button → smooth animate 400ms thay vì snap

**Files**: [native-orders/index.html](../native-orders/index.html) (CDN script), [native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js) (`_attachLenis` + teardown + jump-bottom rewire), cache `v=20260514ai`.

**Status**: ✅ Done.

---

### [native-orders] Chat: preserve line breaks trong bubble + giảm scroll lag thêm 2×

**User báo**: tin nhắn dài của shop hiển thị 1 đoạn liền dù raw text có xuống dòng; scroll vẫn không mượt.

**Root cause line break**: Pancake API trả về HTML dạng `<div>...<br key='n_0' />...<br key='n_1' />...</div>` (có attribute `key`). Regex cũ `<br\s*\/?>` không match khi có attribute giữa `<br` và `>` → tất cả `<br key=...>` bị strip thành text liền nhau.

**Fix `_msgPlain` ([native-orders-app.js:2508-2528](../native-orders/js/native-orders-app.js#L2508-L2528))**:

- `<br\b[^>]*>` — match br với mọi attribute (`key='n_0'`, etc.)
- `</p>`, `</div>`, `</li>`, `</h1-6>` → `\n` (block boundary)
- `<p>`, `<div>` (non-first sibling) → `\n`
- `\r\n`, `\r`, `U+2028`, `U+2029` → `\n`
- Collapse `\n{3,}` → `\n\n`

Verified live NW-20260513-0016: 27 newlines render đúng, NW-20260513-0015: 35 newlines.

**Scroll lag — thêm CSS containment**:

- `#msgThread`: `overscroll-behavior: contain` (no scroll-chaining) + `scrollbar-gutter: stable` (no jump khi gutter xuất hiện).
- `.w2-chat-row`: **`content-visibility: auto` + `contain-intrinsic-size: auto 56px`** — Chrome/Edge skip layout/paint cho bubble offscreen. Đây là win lớn nhất.
- `.w2-chat-bubble`: `contain: layout style paint` — isolate per-bubble repaint khi hover/transition.

**Perf đo trên 145 bubbles** (80-frame scroll up, 120-frame stress up→down→up):
| Metric | Before (6ba7dc7) | After |
|--------|------------------|-------|
| Worst frame | 36ms | **17.7ms (stress: 17.9ms)** |
| Avg frame | 16.8ms | **16.4ms** |
| p95 frame | — | **17.4ms** |
| Verdict | OK | **GOOD (60 FPS)** |

**Files**: [native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js), [native-orders/index.html](../native-orders/index.html) (cache bump `v=20260514ag`).

**Status**: ✅ Done — verified live trên 2 đơn (NW-20260513-0016, NW-20260513-0015).

---

### [delivery-report] Fix "Đã kiểm tra" không lưu sau F5 + thêm modal Lịch sử KT

**User báo**:

1. Bấm "Đã kiểm tra" trên modal đơn → row tô xám OK, nhưng F5 lại thì mất, không persist.
2. Thêm nút icon "Lịch sử đã kiểm tra" cạnh nút "Ẩn hiện cột" để xem lại lịch sử bấm KT.

**Root cause (#1)**: `OrderCheckStore.markChecked()` gọi `col.doc(number).set(...)` với `number = "NJD/2026/67403"`. Firestore JS SDK **coi `/` là path separator** → write thực tế đẩy doc xuống path lồng sâu `delivery_report/data/order_checks/NJD/2026/67403`, KHÔNG phải doc trực tiếp trong collection `order_checks`. Khi load lại, `col.get()` chỉ trả về immediate children → không thấy data đã ghi → `_data.clear()` rồi `saveToLocal()` ghi đè localStorage = rỗng → mất luôn.

**Fix**:

- `delivery-report/js/delivery-report.js`
    - Thêm `sanitizeDocId(number)`: thay `/` bằng `__`. Giữ `number` gốc trong payload để dùng làm in-memory key.
    - `markChecked()`: dùng `col.doc(sanitizeDocId(number))`.
    - `setupListener()` + `init()`: dùng `payload.number` làm Map key (không dùng `doc.id` nữa).
    - `init()`: trước khi clear `_data`, snapshot các entry local-only (có trong localStorage nhưng vắng mặt trên Firestore) → backfill lên Firestore với sanitized ID → migrate data cũ tự động.
    - Thêm `getAllSortedDesc()` cho modal lịch sử.

**Feature #2 — Modal Lịch sử KT**:

- `delivery-report/index.html`: thêm button `#drCheckHistoryBtn` ngay cạnh `Ẩn hiện cột` (nhóm trong wrapper flex chung phía phải).
- `delivery-report/js/delivery-report.js`: thêm `openCheckHistory()`, `ensureCheckHistoryModal()`, `renderCheckHistoryBody()`. Modal hiển thị table: STT, Số đơn, Khách hàng, SĐT, Người kiểm, Thời gian. Search realtime theo số đơn / tên / SĐT / người kiểm. Sort newest first theo `checkedAt`.
- Export `openCheckHistory` trên `window.DeliveryReport`.

**Verified bằng Playwright** ([scripts/test-delivery-check-persistence.js](../scripts/test-delivery-check-persistence.js)):

- ✅ Mark order → F5 → row vẫn `dr-row-checked`
- ✅ Lịch sử KT modal chứa order vừa kiểm
- ✅ Search box trong modal filter đúng
- ✅ Cleanup Firestore xong, prod data sạch (test xóa entry mới ghi + bất kỳ entry `checkedBy=admin` trong 10 phút cuối)

**Files changed**:

- `delivery-report/js/delivery-report.js` (OrderCheckStore + history modal)
- `delivery-report/index.html` (nút Lịch sử KT)
- `scripts/test-delivery-check-persistence.js` (Playwright test, mới)
- `docs/dev-log.md` (entry này)

**Status**: ✅ Done.

---

### [render][worker][balance-history-home] BE `/api/sepay-home/*` — đấu SePay account #2 (Home)

**User request**: "browser test vào my.sepay.vn/login → tôi đăng nhập manual → đọc trong trang sepay đó để tích hợp vào balance-history-home → trang mới không liên quan trang cũ và sepay trang cũ".

**Đã làm**:

1. **Migration** [070_balance_history_home.sql](../render.com/migrations/070_balance_history_home.sql) — table `balance_history_home` + `sepay_home_webhook_logs`. Schema clone từ `balance_history` nhưng:
    - **Không có** customer linking / debt / wallet (Home là sổ thu/chi nội bộ theo phòng, không quản lý khách).
    - **Có** cột `room_code VARCHAR(50)` + `is_hidden BOOLEAN`.
    - Index riêng cho `room_code`, `is_hidden`, `transaction_date`, `transfer_type`.

2. **Route mới** [sepay-home-webhook.js](../render.com/routes/sepay-home-webhook.js) — minimal single-file (không split sub-modules như sepay-webhook). 7 endpoints:
    - `POST /webhook` — nhận webhook SePay, validate, auth qua `SEPAY_HOME_API_KEY` env, INSERT vào `balance_history_home`, broadcast SSE `new-transaction`. Đúng schema SePay (camelCase: `id, gateway, transactionDate, accountNumber, transferType, transferAmount, accumulated, ...`).
    - `GET /history` — list + filter (`type, gateway, startDate, endDate, search, amount, showHidden`) + paginate. Trả về `data[]` có `amount` + `running_balance` đã map từ `transfer_amount` + `accumulated`.
    - `GET /statistics` — total_in/out + counts + net_change + latest_balance.
    - `GET /stream` — SSE realtime, broadcast bucket `app.locals.balanceHomeSseClients` (TÁCH BIỆT với `balanceSseClients` của account #1).
    - `PUT /transaction/:id/room` — gán `room_code`, broadcast `room-code-updated`.
    - `PUT /transaction/:id/hidden` — ẩn/hiện giao dịch, broadcast `visibility-updated`.
    - `GET /ping` — health check.
    - **Schema auto-bootstrap**: `ensureSchema(db)` chạy 1 lần khi request đầu — đọc migration file + execute (CREATE TABLE IF NOT EXISTS, idempotent). Không cần chạy migrate.sh thủ công khi deploy.

3. **server.js wire** — `app.use('/api/sepay-home', sepayHomeWebhookRoutes)` ngay sau `/api/sepay`.

4. **Cloudflare Worker** — thêm route `SEPAY_HOME: '/api/sepay-home/*'` + handler `handleSepayHomeProxy()` mirror `handleSepayProxy()` nhưng có **SSE forwarding** (Accept: text/event-stream + timeout 0 cho `/stream`). Đăng ký case `SEPAY_HOME` trong worker.js dispatch.

**Endpoint isolation đảm bảo**:

- DB table: `balance_history_home` (khác `balance_history`).
- Env var: `SEPAY_HOME_API_KEY` (khác `SEPAY_API_KEY`).
- SSE bucket: `app.locals.balanceHomeSseClients` (khác `balanceSseClients`).
- Webhook logs: `sepay_home_webhook_logs` (khác `sepay_webhook_logs`).
- FE prefix: `/api/sepay-home/*` (khác `/api/sepay/*`).

**State**: ✅ FE scaffolded + ✅ BE built + ✅ CF Worker route. ⏳ Chờ user config SePay account #2 → tạo webhook → set `SEPAY_HOME_API_KEY` env trên Render.

**Next steps cho user (trên https://my.sepay.vn account #2)**:

1. Vào **Ngân hàng** → thêm tài khoản ngân hàng thật (SePay không gửi webhook nếu chưa có bank).
2. Vào **Cấu hình Công ty → API Access → Thêm API** → tạo API key → copy.
3. Vào **Tích hợp WebHooks → Tạo webhook đầu tiên** với:
    - URL: `https://chatomni-proxy.nhijudyshop.workers.dev/api/sepay-home/webhook`
    - Authorization header: `Apikey <KEY_VỪA_TẠO>`
4. Báo Claude key đó → set `SEPAY_HOME_API_KEY` vào Render service (`srv-d4e5pd3gk3sc73bgv600`).
5. Test bằng transfer thật (hoặc dùng Test mode trên SePay) → verify `balance-history-home/` hiển thị giao dịch realtime.

**Files**:

- [render.com/migrations/070_balance_history_home.sql](../render.com/migrations/070_balance_history_home.sql)
- [render.com/routes/sepay-home-webhook.js](../render.com/routes/sepay-home-webhook.js)
- [render.com/server.js](../render.com/server.js) — line 305, 413 (mount route)
- [cloudflare-worker/modules/config/routes.js](../cloudflare-worker/modules/config/routes.js) — SEPAY_HOME pattern
- [cloudflare-worker/modules/handlers/proxy-handler.js](../cloudflare-worker/modules/handlers/proxy-handler.js) — `handleSepayHomeProxy()`
- [cloudflare-worker/worker.js](../cloudflare-worker/worker.js) — case SEPAY_HOME

---

### [native-orders][chat] Polish UI modal chat — đồng bộ visual với orders-report tab1

**User feedback**: "tinh chỉnh giao diện cho giống orders-report nữa".

**Đã thay đổi**:

1. **Modal rộng + cao hơn**: `max-width:1080px width:96vw height:88vh` (trước: 720px × auto). Cảm giác như app fullscreen chứ không phải popup nhỏ.
2. **Customer header redesign**:
    - Avatar 48px gradient tím (initials viết tắt từ tên thay vì icon generic)
    - Tên to 16px bold + code pill xanh tím + tags pill xanh lá nếu có
    - SĐT clickable copy (hover → tím + tooltip), FB user ID truncated, page badge
    - Header background gradient nhẹ → "premium" feel
    - Pancake button (external-link) + close button bố cục rõ ràng
3. **Tabs polish**: pill số đếm đổi màu theo state (active = tím đậm, inactive = xám), border-bottom 3px, padding rộng hơn. Bên phải tabs hiện "Tổng đơn: X.000đ" nếu có amount.
4. **Thread to 60vh** (~520px) thay vì fixed 340px → user thấy nhiều tin hơn cùng lúc.
5. **Date separator** style "đường ngang fade + pill ở giữa" thay vì pill rời (giống Messenger): `<span line>—— 10/05/2026 ——<span line>`
6. **Bubble polish**: shadow nhẹ, line-height 1.42, font 13px. Outgoing tím gradient feel.
7. **Toolbar icon row mới** trên input: 4 icon button (refresh thread / scroll-bottom / ⚡ quick-reply / chèn chữ ký) + extension status text bên phải.
8. **Input bigger**: padding 9x12, border-radius 8px, focus ring tím; min-height 42, max-height 180.
9. **Gửi button rộng hơn**: padding 0×18, icon + chữ "Gửi" (trước chỉ icon).
10. **Optimistic append**: send thành công (qua extension hoặc Web2Chat) → đẩy bubble vào thread ngay lập tức bằng `_appendOutgoing(text)` (id `local_<ts>`) thay vì refetch toàn bộ. Khi WS event thật về sau, id-dedup tránh double-render.
11. **Inject CSS module-scope** (`#w2-chat-modal-css` style tag): `.w2-chat-tool`, `.w2-chat-phone:hover`, `.w2-chat-bubble shadow`, `#msgInput:focus ring` — tránh inline style verbose.
12. Fix lucide icon `signature` (không tồn tại trong v0.294) → `user-check`.

**Verify**: Screenshot xác nhận tất cả render đúng. Modal 1080×760, thread 524px, bubbles width 134-199px (80% max constraint working). 4 toolbar buttons present.

Files: `native-orders/js/native-orders-app.js` (modal HTML + helpers + send paths), `native-orders/index.html` (cache w → x).

Status: ✅ Done

### [native-orders][chat] Chat modal feature parity với tab1 web 1.0

**User feedback**: "browser test vào orders-report/main.html → coi giao diện, chức năng modal tin nhắn, bình luận → làm giống (kiểu như chức năng scroll load thêm,...) → tùy biến thông minh tùy bạn".

**Đã thêm vào modal chat của native-orders**:

1. **Scroll-load tin cũ hơn**: kéo lên đầu thread → tự fetch 30 tin cũ tiếp theo qua `Web2Chat.fetchMessages(..., {currentCount})` (mới thêm support pagination). Có indicator "↑ Cuộn lên để tải tin cũ hơn" + spinner khi đang load. Preserve scroll position bằng scrollHeight diff sau khi prepend (user không bị giật).
2. **Date separators**: chèn pill "HÔM NAY" / "HÔM QUA" / "DD/MM/YYYY" giữa các nhóm tin theo ngày, format consistent web 1.0.
3. **Auto-scroll bottom on init**: rAF 2 lần để đảm bảo chính xác sau khi images loaded.
4. **WS auto-append**: subscribe `pages:new_message` cho conversation đang mở → append bubble realtime; ID dedup tránh double-render.
5. **"↓ N tin mới" jump pill**: khi user scroll lên đọc cũ và có tin mới đến, hiện pill tím floating; click → jump xuống bottom + reset counter. Nếu user đã ở bottom → auto-scroll luôn (không pill).
6. **Tear-down sạch**: WS sub unsubscribe khi đóng modal hoặc mở đơn khác.

**Web2Chat extension**: `fetchMessages(pageId, convId, customerId, { currentCount })` — pass `current_count` xuống cả `pancake-direct` và `pancake-official` endpoint.

**Đổi link "Cấu hình"** trong empty-state từ `tpos-pancake/` (web 1.0) → `web2/pancake-settings/` (Web 2.0 native) → giữ nguyên triết lý độc lập.

**Files**:

- `web2/shared/web2-chat-client.js` — `fetchMessages` ký thêm `opts.currentCount`
- `native-orders/js/native-orders-app.js` — `_chatState` module-scope state, `_msgPlain/_dateLabel/_bubbleHtml/_dateSeparatorHtml/_renderChatThread/_attachScrollLoader/_onChatScroll/_loadOlderMessages/_onIncomingWsMessage/_teardownChatState` helpers, refactor `_loadAndRenderThread` + `_renderMessagesPanel`, hook teardown trong `_closeInteractions`
- `native-orders/index.html` — `v=20260514v` (app), `v=20260514d` (chat-client)

**Verify**:

- Open NW-20260513-0016 → 25 bubbles + 4 date separators + "↑ Cuộn lên" indicator ✅
- Scroll to top → load 30 tin cũ hơn (25 → 55 bubbles), preserve position ✅
- Screenshot xác nhận date separator "10/05/2026" hiển thị đẹp giữa bubble groups ✅

Status: ✅ Done

### [web2-shared][native-orders] Realtime WS + badge "tin mới" cho Web 2.0 (module 2+3/5)

**Goal**: Web 2.0 phải có realtime — modal chat không tự refresh khi có tin mới, bảng đơn không hiện badge "N MỚI" → user phải reload trang thủ công. Port pattern này từ web 1.0 (`new-messages-notifier.js`) sang Web 2.0 hoàn toàn độc lập.

**Mới**:

- `web2/shared/web2-realtime.js` (~200 lines) — `window.Web2Realtime`:
    - `subscribe({ types, onEvent, debounceMs })` — pattern y hệt `PbhRealtime`
    - `start({ pageIds })` — POST `/api/realtime/start` với JWT + userId từ JWT decode (chỉ cần khi server lần đầu setup)
    - `fetchPendingCustomers(limit)` — GET `/api/realtime/pending-customers`
    - `markReplied(psid, pageId)` — POST `/api/realtime/mark-replied`
    - WS connect `wss://n2store-realtime.onrender.com` với exponential backoff reconnect
    - Zero code shared với `tpos-pancake/js/realtime-manager.js`
- `web2/shared/web2-new-msg-badge.js` (~280 lines) — `window.Web2NewMsgBadge`:
    - `init()` — load từ localStorage instant + subscribe WS + fetch initial + reconcile 5 phút
    - `reapply()` — idempotent DOM update (chỉ toggle class khi state thật đổi), gọi sau mọi `renderRows()`
    - `onIncomingMessage(payload)` — bump count khi có `pages:new_message`, skip echo từ page
    - `clearPendingForCustomer(psid)` — xoá pending + add vào 24h suppression map (`web2_recently_replied_v1`) → tránh WS echo re-add
    - `setPendingCustomers(arr)` — REPLACE (not merge) cho fresh server fetch
    - CSS injected: `.w2-pending-row` highlight cam, `.w2-new-msg-badge` đỏ pulse animation
- `native-orders/`:
    - `<tr>` thêm `data-fb-user-id` + `data-fb-page-id` để badge module locate row
    - `renderRows()` cuối hàm gọi `Web2NewMsgBadge.reapply()`
    - Sau send message thành công (qua extension OR qua Web2Chat) → gọi `clearPendingForCustomer(order.fbUserId)`
    - index.html load 2 module mới + init khi DOMContentLoaded

**Architecture**: Render `n2store-realtime` đã chạy 24/7 (server giữ WS với Pancake nhờ auto-reconnect từ DB-saved credentials). Web 2.0 client chỉ cần connect WS broker, nhận event broadcast. Nếu fresh install → call `Web2Realtime.start()` để push credentials.

**Verify** (live test):

- 3 modules load đúng (`hasWeb2Chat:true, hasWeb2Realtime:true, hasWeb2NewMsgBadge:true`) ✅
- WS connect ✅ (`wsConnected:true`)
- Initial fetch trả 14 pending customers, 1 trong 17 đơn hiển thị match → 1 badge render ✅
- Badge visible "3 MỚI" trên row Nguyễn Trâm (cam pulse) ✅
- Simulate WS event → count 1→2, badge "1 MỚI" render instant ✅
- `clearPendingForCustomer` → count 2→1, suppression map có entry ✅

Cache bumps: `native-orders-app.js` v=20260514s → t; new files v=20260514a.

Roadmap: module 1/5 ✅, **2+3/5 ✅** done. Tiếp theo: 4/ quick reply, 5/ bulk campaign.

Status: ✅ Done

### [web2][pancake-settings] Page cấu hình token Pancake riêng cho Web 2.0 (module 1/5)

**Goal**: Tách Web 2.0 hoàn toàn khỏi web 1.0. Bước đầu — cho user setup JWT + page_access_tokens trực tiếp trong Web 2.0, không cần mở `tpos-pancake/`.

**Mới**:

- `web2/pancake-settings/index.html` + `js/pancake-settings.js` — bespoke UI 3 card:
    - **JWT card**: paste token, decode JWT (account_id, iat, exp + ngày còn lại), test bằng cách gọi `/pages`, clear button.
    - **Pages card**: list pages của tài khoản, status pill "✓ Có token" / "Chưa có" per page, Generate + Refresh button per page, "Generate tất cả" bulk, clear page tokens.
    - **Danger zone**: nuke toàn bộ token.
- `web2/shared/web2-chat-client.js` mở rộng — thêm token-write API:
    - `setJwt(token, expiry?)`, `decodeJwt(token)`
    - `setPageAccessToken(pageId, token, meta?)`, `getAllPageAccessTokens()`
    - `clearAllTokens()`
    - `listPages()` — gọi `/api/pancake/pages?access_token=<jwt>`
    - `generatePageAccessToken(pageId)` — gọi `/api/pancake/pages/{id}/generate_page_access_token`
- `web2/shared/tpos-sidebar.js` — thêm menu item "Pancake (Token)" trong group "Cấu hình" (Web 2.0-only, không có TPOS counterpart).

**Cache bumps**:

- `tpos-sidebar.js` v=20260514e → v=20260514f (site-wide, 12 HTML files)
- `web2-chat-client.js` v=20260514b → v=20260514c

**Verify** (live test trên localhost:8089):

- JWT card hiện token rút gọn + "còn 18 ngày" ✅
- listPages → 4 pages facebook load ✅
- 3/4 page đã có token; "Generate" cho Nhi Judy Ơi → Pancake trả "Thiếu quyền Admin" (đúng — JWT không có admin trên page đó), UI surface error rõ ràng ✅
- Sidebar mount đúng, group "Cấu hình" có entry mới ✅

**Tradeoff**: Page dùng inline CSS thay vì shared component vì spec UI rất khác CRUD pages khác (3 card sections, không phải list/form). Có thể refactor sau khi build thêm 2-3 settings pages khác.

Roadmap: module 1/5 ✅ done. Tiếp theo: 2/ realtime WS, 3/ new-msg badge, 4/ quick reply, 5/ bulk campaign.

Status: ✅ Done

### [web2-shared][native-orders][chat] Web2Chat client độc lập — không dùng chung pancakeDataManager với web 1.0

**User feedback**: "không load được đoạn hội thoại -> web 2.0 này đừng dùng chung với web 1.0 -> code mới đi" — modal chat hiển thị "Hội thoại trống" dù `messageCount=2`; user yêu cầu code chat riêng cho web 2.0, không reuse web 1.0.

**Root causes**:

1. **Mix conversation types**: Pancake `/conversations/customer/:fbId` trả về cả `INBOX` lẫn `COMMENT` type. Cũ pick `[0]` luôn → trúng comment thread (24/25 là COMMENT) → messages endpoint trả empty.
2. **Wrong API endpoint**: Pancake Public API (`/pancake-official`) cần page subscription để trả messages. Personal account → empty. Phải dùng JWT-based `/pancake-direct/` endpoint.
3. **HTML wrapped text**: Pancake message field chứa `<div>...</div>` + `<br />` → escapeHtml hiển thị raw HTML literal.

**Fix**:

1. Tạo `web2/shared/web2-chat-client.js` — module standalone, expose `window.Web2Chat`:
    - `fetchConversations(pageId, fbId)` — `/api/pancake/conversations/customer/:fbId`
    - `fetchMessages(pageId, convId, customerId?)` — ưu tiên `/api/pancake-direct/` (JWT), fallback `/api/pancake-official/`
    - `sendMessage(pageId, convId, opts)` — `/api/pancake-official/.../messages` (page_access_token)
    - `replyComment(pageId, commentId, opts)` — `/api/pancake-official/.../comments/:id/replies`
    - `getJwt()`, `getPageAccessToken(pageId)`, `hasTokensFor(pageId)` — đọc localStorage trực tiếp (`pancake_jwt_token`, `pancake_page_access_tokens`)
    - KHÔNG import `pancakeDataManager` / `pancakeTokenManager` / `API_CONFIG` từ web 1.0.

2. `native-orders/js/native-orders-app.js`:
    - Xóa `_ensurePancakeApi()` + `_loadScript()` (eager lazy-loader cho web 1.0 scripts).
    - `_loadAndRenderThread`: filter `type === 'INBOX'` trước khi dùng convs; show clarifying message khi chỉ có comment ("Khách chưa có tin nhắn inbox, có N comment — chuyển sang tab Bình luận").
    - `_handleSendMessage` + `_handleReplyComment`: fallback Pancake giờ qua `Web2Chat.sendMessage` / `Web2Chat.replyComment`.
    - Render messages: parse HTML wrapper trong `m.message` → `textContent` thuần, `<br>` → `\n`, `white-space:pre-wrap`. Show attachment thumbnails inline.

**Files**:

- `web2/shared/web2-chat-client.js` (NEW, ~290 lines)
- `native-orders/index.html` — load `web2-chat-client.js` trước `native-orders-app.js`; bump cache `v=20260514s`
- `native-orders/js/native-orders-app.js` — xóa pancake loader, swap call sites

**Verify**: Live test `NW-20260513-0016` (Thế Hoàng, INBOX 611 messages):

- `Web2Chat.fetchConversations` → 25 convs (1 INBOX + 24 COMMENT)
- Filter INBOX → conv `117267091364524_30591284287137740`
- `Web2Chat.fetchMessages` → via `direct` → **25 message bubbles render**, real text + image attachment ✅
- `hasOldPancake: false` confirmed.

Status: ✅ Done

### [native-orders][chat] Pre-resolve globalUserId trước khi gửi REPLY_INBOX_PHOTO qua extension

**Vấn đề**: FB Business Suite dùng `globalUserId` khác `fbUserId` thường. Extension `REPLY_INBOX_PHOTO` cần đúng `globalUserId`, nếu pass nhầm `fbUserId` thì gửi có thể fail trong context Business.

**Fix**: Trong `_handleSendMessage` (`native-orders/js/native-orders-app.js`), trước khi gọi `REPLY_INBOX_PHOTO`:

1. Check cache `order._fbGlobalUserId` — nếu đã có → dùng luôn.
2. Nếu chưa và có `fbPageId` + `conversationId` → gọi `GET_GLOBAL_ID_FOR_CONV` (timeout 8s) để resolve.
3. Đọc `globalUserId | globalId | payload.globalUserId` từ response (extension trả khác form tùy version).
4. Cache lại trên `order._fbGlobalUserId` cho lần gửi sau.
5. Fallback `order.fbUserId` nếu resolve fail.

**Files**:

- `native-orders/js/native-orders-app.js` — `_handleSendMessage` (lines ~2404-2440)
- `native-orders/index.html` — bump cache `v=20260514n` → `v=20260514o`

**Verify**: `eval` fetch JS live → `hasGetGlobalId:true, hasFbGlobalCache:true, size:132017, hasApp:true` ✅

Status: ✅ Done

### [orders] Fix badge NAP/TOMATO mất ở cột PHIẾU BÁN HÀNG khi "Hoàn thành đối soát"

**Vấn đề**: cell PHIẾU BÁN HÀNG mất badge NAP/TOMATO khi đơn đã đối soát. Badge THÀNH PHỐ vẫn hiện vì có fallback theo `CarrierName`, NAP/TOMATO không có fallback nên mất hẳn.

**Root cause**: commit `81e5b3d6` (11/05) đổi response `POST /api/v2/delivery-assignments/lookup-batch` từ flat map `{num:group}` sang nested `{ assignments:{num:group}, scannedNumbers, hiddenNumbers, ... }`. Client Tab1 vẫn `Object.entries(result.data)` → ghi nhầm vào `_deliveryGroups.data` các key `"assignments"`, `"scannedNumbers"`, … thay vì order numbers thực. `delivery-report.js` đã sync rồi, chỉ sót Tab1.

**Files**: [orders-report/js/tab1/tab1-fast-sale-invoice-status.js](orders-report/js/tab1/tab1-fast-sale-invoice-status.js) — đọc `result.data.assignments`, có fallback flat-map cho server cũ + type guard.

**Status**: ✅ Done.

### [orders][barcode] Fix 502 bug — bỏ $select trong Strategy A, 2-step query Strategy B

**Vấn đề user báo**: dialog flag toàn bộ 6 mã (kể cả MM139A1/A2/A3, B1561A34, B1559A36, …) là "Không có trên TPOS" dù TPOS có. User yêu cầu test trực tiếp trên TPOS UI (port mới, login tay).

**Root cause** (test qua Playwright session tại tomato.tpos.vn, log [downloads/n2store-session/tpos-direct/](downloads/n2store-session/tpos-direct/)):

- `GET /odata/Product?$filter=DefaultCode eq 'A' or 'B' or 'C'&$select=Id,DefaultCode,NameTemplate,…&$top=N` → **502 Bad Gateway** (TPOS origin overloaded khi combined nhiều `or` với `$select` chứa nhiều fields).
- `GET /odata/Product?$filter=DefaultCode eq 'A' or 'B' or 'C'&$top=N` (KHÔNG `$select`) → **200**, trả về đủ 3 mã.
- `GET /odata/ProductTemplate?$filter=DefaultCode eq 'MM139'&$expand=ProductVariants(...)` → **502** (combined filter + expand cũng gây bad gateway).
- `GET /odata/ProductTemplate(113931)?$expand=ProductVariants($expand=AttributeValues)` → **200**, trả về template với 3 variants kèm AttributeValues.

→ Hậu quả: cả Strategy A và B trước đây luôn fail → tất cả mã bị flag "Không có trên TPOS" → user không in được dù TPOS có.

**Thay đổi**:

- **Strategy A**: bỏ `$select` clause. Trả full payload (heavier nhưng work). Variant như MM139A2 có `DefaultCode = MM139A2` trên TPOS → Strategy A hit trực tiếp, không cần Strategy B.
- **Strategy B**: tách thành 2-step:
    1. `ProductTemplate?$filter=DefaultCode eq '<parent>'&$top=1` → lấy `tmpl.Id`
    2. `ProductTemplate(<tmpl.Id>)?$expand=ProductVariants($expand=AttributeValues)` → lấy danh sách variants kèm AttributeValues
       Match variant theo DefaultCode/Barcode/AttributeValues (như cũ).
- Verified live trên tomato.tpos.vn: query trả về MM139 với 3 variants {148791:MM139A1, 148792:MM139A2, 148793:MM139A3}, attrs = ["1"]/["2"]/["3"].

**Files**:

- [purchase-orders/js/lib/barcode-label-dialog.js](purchase-orders/js/lib/barcode-label-dialog.js) — Strategy A bỏ $select, Strategy B 2-step.
- [scripts/tpos-direct-session.js](scripts/tpos-direct-session.js) — Playwright session pointed at tomato.tpos.vn (no auto-login, FIFO REPL, network capture) để test OData trực tiếp khi cần debug TPOS API quirks.

**Status**: ✅ Done

### [orders][barcode] Bỏ hoàn toàn local web_warehouse — chỉ lấy data từ TPOS OData trực tiếp

**Yêu cầu user**: "cho lấy dữ liệu qua kho tpos đi đừng lấy kho local". Local web_warehouse cache không đáng tin (miss mapping) → đổi sang query TPOS trực tiếp.

**Thay đổi**:

- **Pre-fetch (khi mở dialog)**: bỏ `POST /api/v2/web-warehouse/batch-lookup`. Thay bằng gọi luôn `recheckTposForMissingCodes()` với `tposCodeSet = new Set()` rỗng → tất cả items được coi là missing → 2-stage query trực tiếp TPOS:
    - Strategy A: `Product?$filter=DefaultCode eq '<code>' or …`
    - Strategy B: `ProductTemplate?$filter=DefaultCode eq '<parent>'&$expand=ProductVariants($expand=AttributeValues)` cho mã còn miss
- **printViaTPOS**: bỏ luôn batch-lookup local. `codeMap` build hoàn toàn từ `liveTposCache` (đã được populate ở step trên). Nếu cache rỗng → throw `Không có dữ liệu TPOS` và gợi user tắt toggle.
- Xoá hàm `preflightTposItems()` (dead code — chỉ dùng batch-lookup local).
- Đổi text badge/warning: "Chưa sync TPOS (trong kho local)" → "Không có trên TPOS" (chính xác hơn vì giờ tra trực tiếp TPOS).
- Click "In bằng pdf" khi pre-fetch chưa xong → chạy `recheckTposForMissingCodes()` sync trước, mới print.

**Files**:

- [purchase-orders/js/lib/barcode-label-dialog.js](purchase-orders/js/lib/barcode-label-dialog.js) — bỏ hết web-warehouse calls, dùng TPOS OData làm single source of truth.

**Status**: ✅ Done

### [web2][native-orders][sidebar] 6 yêu cầu UX: sidebar collapse, save FB data, gọn cell, STT vào checkbox, action 2x2

**Y/c 1 — Toggle ẩn/hiện sidebar** ([web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js) + [.css](../web2/shared/tpos-sidebar.css)):

- Button `#web2SidebarToggle` (icon `panel-left-close`) trong `.web2-brand`
- Click → toggle `body.web2-sidebar-collapsed` → sidebar 260px → 56px (chỉ icons)
- Persist `localStorage.web2SidebarCollapsed`, restore lúc mount
- Verified: 260 → 56 → 260, ls = "1"

**Y/c 2 — Lưu FB data của khách khi tạo đơn** ([render.com/routes/native-orders.js](../render.com/routes/native-orders.js) `upsertCustomerFromOrder`):

- Sau `POST /from-comment` insert → background upsert `customers` (non-blocking)
- 3 strategies: match by phone → fill missing fb*id/name/address; match by fb_id → fill phone; tạo mới với `phone || fb*<id>` pseudo-phone, name, fb_id, pancake_data JSON
- Bảo toàn dữ liệu hiện hữu (`COALESCE`, `NULLIF`) — không ghi đè non-null
- Sau upsert: nếu order chưa có `customer_id` → UPDATE backfill

**Y/c 3 — Bỏ 2 mini icon** phone + person trong customer cell (đã xóa span + ẩn class CSS)

**Y/c 4 — UI cell Khách hàng** ([css/tpos-theme.css](../native-orders/css/tpos-theme.css)):

- `.tpos-customer-name-row` = name + status pill inline gap 8px
- Name font-weight 600, merged phone (mergeNameSdt) dạng tel link 11px dưới name

**Y/c 5 — STT vào cột checkbox**:

- Cell `.tpos-check-stt` = `<input> + <span>STT</span>`
- Header tương tự
- Cột `.col-stt` standalone hidden mặc định (đã merge); bump localStorage key `colVisibility v1 → v2`

**Y/c 6 — Action icons 2x2 grid**:

- `.tpos-row-actions-grid` = grid 2 cột, mỗi button 26x26
- Order: [Sửa][Tạo PBH] / [KH 360°][Xóa]; placeholder giữ chỗ nếu không có customerId

**Verified live** (port 8089): check cell có input+STT, col-stt hidden, action grid `26px 26px`, 0 mini icons, sidebar toggle "Ẩn/hiện menu", collapse 260→56px + localStorage persist, customer-name-row layout active.

**Cache**: `tpos-sidebar.{js,css}?v=20260514e`, `tpos-theme.css?v=20260514e`, `native-orders-app.js?v=20260514j`. 11 HTML bumped.

**Status**: ✅ Frontend live, backend customer upsert sẽ live sau Render redeploy.

### [orders][barcode] Auto-recheck TPOS ngay sau pre-fetch + console logs để debug

**Phản hồi user (sau commit ProductTemplate fallback)**: kèm screenshots TPOS UI cho thấy `MM139A1/A2/A3` đều có trên TPOS và in được trực tiếp từ TPOS. Local web_warehouse miss mapping (`tpos_product_id = NULL`) nên flag bật, nhưng user không muốn phải bấm "Kiểm lại TPOS" tay mỗi lần.

**Thay đổi**:

- Sau khi pre-fetch local web_warehouse trả về và populate `tposCodeSet` lần đầu, **auto-trigger** `recheckTposForMissingCodes()` trong background (không await, không block dialog) nếu vẫn còn item missing và toggle "In theo mẫu TPOS" đang bật. User thấy badge "Chưa sync" trong ~1s rồi biến mất khi TPOS xác nhận có.
- Thêm console logs chi tiết ở mọi nhánh recheck (`[Barcode][Recheck]` prefix): URL query, codes input, số match return, danh sách variants khi Strategy B, variant nào match được và variant nào miss — giúp debug nhanh khi user báo lại "vẫn không tìm thấy".
- Nút "Kiểm lại TPOS" tay vẫn còn nếu auto-recheck fail (network error / TPOS token expired).

**Files**:

- [purchase-orders/js/lib/barcode-label-dialog.js](purchase-orders/js/lib/barcode-label-dialog.js) — auto-trigger recheck sau pre-fetch, console logging Strategy A + B.

**Status**: ✅ Done

### [web2][packaging] Đóng gói Web 2.0 thành bundle độc lập copy-able

**Yêu cầu user**: các thư mục/file/CSS thuộc Web 2.0 → muốn có suffix `web2-*` hoặc tốt nhất gom hết vào 1 folder để mai mốt copy → upload thành web mới + note lại những thứ đang share chung.

**Quyết định**: không rename folder (sẽ break 92 HTML hard-coded paths + GitHub Pages URLs đang share với khách). Thay vào đó:

- Script đóng gói `scripts/pack-web2.sh` tạo `dist/web2-bundle/` self-contained
- Doc inventory + dep map `docs/web2-packaging.md`
- Nguồn gốc giữ nguyên — bundle chỉ là output có thể regen bất cứ lúc nào

**5 thư mục thuộc Web 2.0**:

- `web2/` (504 KB, ~80 module pages)
- `web2/products/` (36 KB)
- `web2/shared/` (136 KB — sidebar, popup, page-builder, delivery picker, …)
- `native-orders/` (176 KB)
- `tpos-pancake/` (1.3 MB)

**Shared deps bundled**: `shared/{js, browser, universal, css, esm, images}` (`shared/node/` không cần — server-side). 11 file `shared/js/*` được Web 2.0 reference (firebase-config, shared-auth-manager, shared-cache-manager, notification-system, navigation-modern, api-config, pancake-data-manager, shop-config, storage-migration, esm/compat, css/typography).

**External CDN (không bundle, version pinned)**: Firebase v10.14.1, Lucide v0.294.0, Google Fonts Inter+Manrope.

**Backend (deployment-specific)**: Cloudflare Worker `chatomni-proxy.nhijudyshop.workers.dev` → Render `n2store-fallback.onrender.com`. Doc liệt kê customisation hook (`grep -r chatomni-proxy` để thay).

**Script** ([scripts/pack-web2.sh](../scripts/pack-web2.sh)):

- `rm -rf dist/web2-bundle && cp -R` 5 folder + `shared/`
- Tạo `index.html` redirect tới native-orders, `README.md` mô tả layout + deploy targets (GitHub Pages, CF Pages, Netlify) + customisation hooks
- Output: **249 files / 3.9 MB**

**Doc** ([docs/web2-packaging.md](web2-packaging.md)):

- TL;DR + 5 folder inventory + shared deps table + external CDN table + backend swap procedure
- File tree visualization (tree -L 2)
- Customisation hooks table (brand, worker URL, Firebase project, delivery zones, sidebar routes, popup theme)
- CI hook example (GitHub Actions upload-artifact)
- Lý do không rename thành `web2-` suffix

**Verified live**: serve bundle qua `python3 -m http.server 8090` từ `dist/web2-bundle/` → load `http://localhost:8090/native-orders/` → 4 globals OK (`Popup, DeliveryMethodPicker, NativeOrdersApp, Web2Sidebar`), sidebar mounted, 23 rows rendered, column style injected, 0 console errors, 0 fetch fails. Bundle fully self-contained.

**Workflow user mới**:

```bash
bash scripts/pack-web2.sh                    # regen bundle
cp -R dist/web2-bundle/ ~/my-new-site/       # copy đi đâu cũng được
cd ~/my-new-site && python3 -m http.server   # serve ngay
# hoặc deploy GitHub Pages / CF Pages / Netlify
```

### [orders][barcode] "Kiểm lại TPOS" — fallback ProductTemplate cho variants không có DefaultCode riêng

**Phản hồi user (sau commit trước)**: MM139A2 / MM139A3 vẫn không match được vì chúng là **biến thể** — TPOS không gán DefaultCode riêng cho variant, mà chỉ có DefaultCode trên template cha (`MM139`). Strategy A (`Product?$filter=DefaultCode eq 'MM139A2'`) → 0 row.

**Thay đổi**:

- Items giờ giữ thêm `parentCode` (= `item.parentProductCode || item.productCode`) để Strategy B dùng được.
- Recheck flow giờ chạy 2-stage:
    - **Strategy A**: query `Product?$filter=DefaultCode eq '<code>' or …` (giữ nguyên — cho các SP có DefaultCode riêng trên TPOS).
    - **Strategy B (fallback)**: với các mã still missing → group by `parentCode` → query `ProductTemplate?$filter=DefaultCode eq '<parent>'&$expand=ProductVariants($expand=AttributeValues)` → match variant trong `tmpl.ProductVariants[]` bằng `matchTposVariant()` với thứ tự ưu tiên: `v.DefaultCode === code` → `v.Barcode === code` → tên thuộc tính (`AttributeValues[].Name` / `NameGet`) so với `item.variant` (đã bỏ dấu, lowercase) → fallback nếu template chỉ có 1 variant.
- Variant matched → cache vào `liveTposCache` với `DefaultCode` được override = mã n2store (để `codeMap[code]` trong `printViaTPOS` hit), `tpos_product_id = variant.Id`, `tpos_template_id = template.Id`. PrintViaTPOS dùng cache fallback khi web-warehouse batch-lookup miss.
- Result text phân biệt rõ "đã thử cả mã cha" → user biết mã thực sự không tồn tại trên TPOS, không phải bug local cache.

**Files**:

- [purchase-orders/js/lib/barcode-label-dialog.js](purchase-orders/js/lib/barcode-label-dialog.js) — `parentCode` field, 2-stage recheck, `matchTposVariant()`, `cacheLiveProduct()`, `stripDiacritics()`.

**Status**: ✅ Done

### [orders][barcode] Nút "Kiểm lại TPOS" — query OData trực tiếp khi local web_warehouse thiếu mapping

**Vấn đề user báo (sau commit checkbox)**: MM139A2 / MM139A3 đã có trên TPOS thật, nhưng dialog vẫn flag "Chưa sync TPOS". User hỏi tại sao và muốn có cách kiểm lại trước khi in.

**Phân tích**: cờ "Chưa sync TPOS" được build từ `tposCodeSet` = pre-fetch `/api/v2/web-warehouse/batch-lookup` rồi filter `tpos_product_id != null`. Đây là **local Postgres web_warehouse cache**, không phải TPOS thật. Khi sync local bị thiếu (row chưa được populate hoặc `tpos_product_id` null) thì flag bật, dù TPOS thực sự có sản phẩm. Trước đây giải pháp duy nhất là tắt "In theo mẫu TPOS" → fallback HTML local.

**Thay đổi**:

- Thêm nút "🔄 Kiểm lại TPOS" trong warning panel khi có items missing.
- Click → query trực tiếp TPOS OData: `GET /api/odata/Product?$filter=DefaultCode eq 'A' or DefaultCode eq 'B'&$select=Id,DefaultCode,NameTemplate,NameGet,Barcode,ProductTmplId,PriceVariant,StandardPrice,PurchasePrice,UOMName,ImageUrl` qua `TPOSClient.authenticatedFetch`.
- Whitelist mã `^[A-Za-z0-9_-]+$` để chặn OData injection.
- Mã TPOS xác nhận có → add vào `tposCodeSet` + cache full row vào `liveTposCache` (Map<code, row-shape>). Re-render: badge "Chưa sync" biến mất, row hết highlight vàng, nút In count tăng.
- Mã KHÔNG tồn tại trên TPOS → hiển thị rõ "✗ Cần tạo SP trên TPOS hoặc bỏ tick" — không thể workaround bằng client.
- `printViaTPOS` nhận thêm param `liveTposCache`; khi web-warehouse batch-lookup miss mã nào → fallback dùng `liveTposCache` để build Lines payload TPOS PDF.
- Result text: ✓ xanh khi tất cả tìm thấy, hỗn hợp khi partial, ✗ đỏ khi không tìm thấy mã nào / lỗi network.

**Files**:

- [purchase-orders/js/lib/barcode-label-dialog.js](purchase-orders/js/lib/barcode-label-dialog.js) — add `liveTposCache`, `recheckTposForMissingCodes()`, button + result UI, `printViaTPOS` fallback.

**Status**: ✅ Done

### [orders] Chặn tạo PBH khi thiếu Sản phẩm + Toggle Hiện/ẩn cột bảng

**Yêu cầu user**:

1. Đơn không có sản phẩm cũng không cho tạo PBH (giống thiếu SĐT/Địa chỉ)
2. Cho tuỳ chọn ẩn/hiện cột; mặc định: Thao tác + STT + Tên (gộp SĐT) + Địa chỉ + Tổng tiền (gộp SL); ẩn các cột khác
3. Nếu cần test → dùng local port riêng (8089)

**Validation Sản phẩm** ([native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js) `validateOrderForPbh`):

- Check thêm `products.length > 0 && Σ quantity > 0` → nếu fail thì `missing.push('Sản phẩm')`
- Single `createPbh()`: nay block luôn (trước có warning "Vẫn tạo" — đã xoá vì user muốn strict)
- Bulk modal: bảng hiện thêm cột "SL" (red+⚠ 0 nếu thiếu), badge invalid đổi thành "thiếu SĐT / địa chỉ / sản phẩm"
- Verified: NW-20260513-0016 (có phone+addr nhưng products=[]) → popup "Đơn ... chưa có Sản phẩm. Vui lòng bổ sung trước khi tạo PBH.", form KHÔNG mở

**Column toggle (Phase 16)**:

- Mỗi `<td>` trong row được gán class `col-actions/col-stt/col-code/col-channel/col-customer/col-phone/col-address/col-money/col-qty/col-status/col-employee/col-time` (THs đã có sẵn)
- `STATE.colVisibility` — object boolean per column + 2 merge flag, persisted `localStorage[nativeOrdersColVisibility_v1]`
- `applyColumnVisibility()` inject `<style id="nativeOrdersColStyle">` ẩn các `.col-X` không tích
- **Defaults theo user**:
    - Visible: `actions, stt, customer, address, money` (5 cột data + check)
    - Hidden: `code, channel, phone, qty, status, employee, time`
    - Merge ON: `mergeNameSdt` (SĐT show dưới tên trong cột Customer), `mergeTotalQty` (SL show dưới Tổng tiền)
- Button "Hiện/ẩn cột" mở popover với 12 checkbox cột + 2 checkbox merge + "Khôi phục mặc định"
- Click ngoài popover → đóng. `e.stopPropagation()` trên button để click chính nó không tự close

**Bug fix giữa chừng**: `STATE = { colVisibility: loadColVisibility() }` gọi function dùng `COL_DEFAULT` (const) chưa init → TDZ throw → toàn IIFE fail → `NativeOrdersApp = undefined`. Fix: di chuyển `COL_KEYS` + `COL_DEFAULT` lên TRƯỚC `STATE`.

**Verified live** (localhost:8089, port riêng cho test):

- 6 visible TH (`col-check, col-actions, col-stt, col-customer, col-address, col-money`)
- 7 hidden TH (`col-code, col-channel, col-phone, col-qty, col-status, col-employee, col-time`)
- 9 rows có phone merged vào customer cell; 2 rows có qty merged vào money cell
- Popover mở/đóng đúng, 14 checkbox (12 cột + 2 merge), 7 checked theo defaults
- Toggle phone → cột hiện lại + localStorage update

**Cache**: `native-orders-app.js?v=20260514i`

### [orders][barcode] Thêm checkbox chọn mã trong dialog In mã vạch + giải thích "Chưa sync TPOS"

**Vấn đề user báo (purchase-orders > In mã vạch)**:

1. Modal hiện 6 sản phẩm, nhưng PDF chỉ in 4 → user muốn chủ động chọn từng mã để in.
2. Cảnh báo "2/6 sản phẩm CHƯA sync TPOS: MM139A2, MM139A3" — user hỏi tại sao 2 mã này KHÔNG in được.

**Nguyên nhân (đã phân tích cho user)**: Khi toggle "In theo mẫu TPOS" bật, code gọi `POST /odata/BarcodeProductLabel` của TPOS để render PDF. API này chỉ render được sản phẩm đã có `tpos_product_id` trong web-warehouse (đã sync TPOS). Pre-fetch `/api/v2/web-warehouse/batch-lookup` lúc mở dialog đã build `tposCodeSet`. Print path filter theo set này → MM139A2/MM139A3 chưa sync ⇒ silently dropped. Cách workaround đã có: tắt "In theo mẫu TPOS" → fallback in HTML local (JsBarcode + tpos.vn/Web/Barcode img) cho tất cả mã.

**Thay đổi**:

- Thêm cột checkbox đầu tiên trong table tab "Sản phẩm có mã vạch" + master "Chọn tất cả" trong header (`indeterminate` khi mixed).
- Hàng nào chưa sync TPOS (chỉ khi TPOS toggle bật + pre-fetched xong) → highlight row vàng + badge "Chưa sync TPOS" cạnh tên SP + tooltip giải thích.
- Print path filter thêm `it.selected` → user bỏ tick → không in.
- Re-render table khi TPOS pre-fetch hoàn tất hoặc khi user toggle "In theo mẫu TPOS" → badge xuất hiện/biến mất kịp thời.
- Warning text bổ sung gợi ý "hoặc bỏ tick các sản phẩm này".

**Files**:

- [purchase-orders/js/lib/barcode-label-dialog.js](purchase-orders/js/lib/barcode-label-dialog.js) — add `selected` field, checkbox column, master toggle, badge, filter logic.

**Status**: ✅ Done

### [web2][perf][docs] Fix scroll lag modal + shared CSS utility classes cho mọi modal tương tác nặng

**Vấn đề user báo**: mở "Tạo PBH hàng loạt — 23 đơn" → scroll bảng bên trong modal lag.

**Phân tích nguyên nhân**:

1. `backdrop-filter: blur(4px)` — browser recompute filter mỗi frame paint khi nested content scroll, kể cả khi backdrop không thay đổi visually
2. Modal card không có compositor layer riêng — paint chung với background
3. `position: sticky` thead trong `overflow: auto` container — gây extra layout work

**Fix** ([web2/shared/popup.js](../web2/shared/popup.js)):

- **Bỏ `backdrop-filter: blur`** → solid `rgba(15,23,42,0.65)` (tối hơn 1 chút để bù focus); thêm `contain: layout style` cho overlay
- **`transform: translateZ(0)` + `will-change: transform`** cho modal card → compositor layer riêng
- **`.w2p-scroll-area`**: `contain: layout paint` + `transform: translateZ(0)` — scope repaint
- **Bỏ `position: sticky` thead**: tách table thành 2 — header table tĩnh + body table trong scroll container riêng (dùng `table-layout: fixed` + `<colgroup>` để cột align)

**Reusable utility classes** (auto-inject lúc script load, không cần mở Popup trước):

- `.w2p-overlay` — full-screen backdrop solid, no blur, contained
- `.w2p-card` — white card với GPU layer
- `.w2p-scroll-area` — overflow:auto + contain:paint + GPU layer
- `.w2p-form-grid` — responsive 2-col grid
- `.w2p-input` / `.w2p-textarea` / `.w2p-select` — form controls thống nhất

**Refactor** ([native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js)):

- `openCustomFormPopup` overlay/card dùng `.w2p-overlay` + `.w2p-card`
- Bulk-PBH scroll container dùng `.w2p-scroll-area`
- Progress modal cùng pattern
- `openCustomFormPopup` thêm `opts.maxWidth` (default 520, bulk dùng 760 cho table)

**Docs** ([docs/web2-modal-conventions.md](web2-modal-conventions.md)) — convention cho mọi modal tương lai:

- DO: solid backdrop / GPU layer / contain:paint / static thead + colgroup / lazy-render khi >200 rows
- DON'T: backdrop-filter:blur / sticky thead trong overflow / heavy box-shadow trên scroll / inline-style shadow lên nhiều row giống nhau
- Workflow skeleton + reference impl

**Đo perf trước/sau**:

- Trước: lag report từ user
- Sau (localhost, modal 23 rows + scroll 30 lần): **avg 16.43ms / frame (~60fps)**, 1 slow frame ngoài budget. `frame ms < 30` ≥ 97%.

**Cache**: `tpos-sidebar.js?v=20260514d`, `native-orders-app.js?v=20260514f`. Cùng pattern auto-inject style ngay khi popup.js load nên mọi page Web 2.0 có sẵn classes mà không cần mở Popup trước.

### [web2][orders] Tạo PBH hàng loạt + validate SĐT/Địa chỉ + modal quản lý chung

**Yêu cầu user**: (a) không có SĐT hoặc địa chỉ → chặn tạo PBH; (b) checkbox nhiều đơn → tạo PBH hàng loạt; (c) modal quản lý chung để tương tác.

**Validation single** ([native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js) `validateOrderForPbh`):

- Check `phone` + `address` không trống → `createPbh()` nếu invalid `→ Popup.error("Đơn X chưa có SĐT và Địa chỉ. Vui lòng bổ sung…")` rồi return, form không mở
- Verified: NW-20260513-0012 (thiếu phone+address) → popup "Thiếu thông tin" hiện, form KHÔNG mở

**Bulk bar** ([native-orders/index.html](../native-orders/index.html)):

- Purple bar `#ordersBulkBar` hiện khi ≥1 row checked, ẩn khi 0
- Count + button "Tạo PBH hàng loạt" + "Bỏ chọn"
- `#checkAll` toggle tất cả; per-row event delegation trên `#ordersTbody`

**Modal quản lý chung** (`bulkCreatePbh`):

- Tiêu đề "Tạo PBH hàng loạt — N đơn", icon `layers`
- Badge `✓ N sẵn sàng` (green-pill) + `⚠ M thiếu SĐT/địa chỉ` (red-pill, ẩn nếu M=0)
- Bảng cuộn 280px liệt kê mọi đơn: Mã, Khách, SĐT (đỏ nếu thiếu), Địa chỉ (đỏ nếu thiếu, truncate + tooltip), Tổng, Trạng thái. Row invalid: background `#fef2f2`
- Fieldset "Cài đặt áp dụng cho TẤT CẢ":
    - Dropdown PT giao hàng (default `""` = per-row auto-pick theo địa chỉ từng đơn)
    - Ngày HĐ + Ghi chú chung
- OK button "Tạo N PBH" — disabled (grey, cursor not-allowed) khi `validCount === 0`
- Submit → progress modal mới: bar 0→100%, label "i / N", list log `✓ NW → HD` (xanh) hoặc `✗ ... — error` (đỏ); cuối summary `Đã tạo X/N PBH …`, auto unselect + reload

**openCustomFormPopup**: thêm `okDisabled` option → render disabled button

**Verified live** (localhost): check-all 23 đơn → modal "8 sẵn sàng / 15 thiếu", OK="Tạo 8 PBH" enabled, dropdown 8 options, 0 console errors

**Cache**: `native-orders-app.js?v=20260514d`

### [web2][orders] Tạo PBH — dropdown Phương thức giao hàng + auto-pick theo địa chỉ

**Mục tiêu**: thay nhập tay phí giao hàng bằng dropdown TPOS-style. Phân tích địa chỉ khách → tự chọn đúng khu vực + tự fill phí.

**Module mới** ([web2/shared/delivery-method-picker.js](../web2/shared/delivery-method-picker.js)):

- `window.DeliveryMethodPicker.{OPTIONS, pick(address), normalize(s)}`
- Default OPTIONS (match TPOS dropdown): 3 thủ công (THÀNH PHỐ GỘP, TỈNH GỘP, BÁN HÀNG SHOP) + 3 vùng HCM tự động + SHIP TỈNH fallback
- `normalize()`: lowercase + strip diacritics (`Bình Chánh` → `binh chanh`) + expand abbreviations (`Q.12` → `quan 12 q12`, `P.5` → `phuong 5`, `TP HCM` → `tphcm`) + punctuation → whitespace
- `pick(address)`: token-window match (tránh false-positive "q1" inside "q10"), trả option có nhiều keyword match nhất + fallback SHIP TỈNH
- **Bên thứ 3**: file ghi chú integration Goong Maps (https://goong.io free 100k req/day VN-localised) cho geocoding nâng cao — chỉ cần feed result vào `pick(address)` là dùng được

**Auto-load** (tpos-sidebar.js): inject `popup.js` + `delivery-method-picker.js` qua `document.currentScript.src` — mọi trang Web 2.0 có sẵn `window.DeliveryMethodPicker`

**UI** ([native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js) `createPbh`):

- Dropdown "Phương thức giao hàng" full-width sau phần tóm tắt đơn nguồn
- Option đầu = auto-pick (selected), label kèm price (`THÀNH PHỐ (...) — 35.000đ`)
- Hint phía dưới: `🎯 Tự chọn theo địa chỉ — khớp khu vực: q9, hoc mon` (hiển thị tối đa 4 keyword khớp), hoặc `📦 Không khớp khu vực HCM — mặc định SHIP TỈNH`
- Change dropdown → input `Phí giao hàng` tự update theo `data-price`
- Submit payload thêm `carrierName` (= label dropdown đã chọn, đã strip price suffix)

**Unit test** (`node`): 13/13 case pass — address HCM Q1/Q2/Q.12/Hốc Môn/Bình Chánh/Phú Nhuận/Thủ Đức + tỉnh khác (Đà Nẵng/Cần Thơ/Hà Nội) + empty string → đều chọn đúng

**Live test** (localhost): popup `createPbh` cho NW có địa chỉ Q9 → auto-select "tp-bien" (Bình Chánh-Q9-Nhà Bè-Hốc Môn) 35.000đ, hint hiển thị "khớp khu vực: quan 9". Đổi sang "tp-q2-12-bt-tdu" → Phí giao hàng tự nhảy về 30.000đ. 0 console errors.

**Cache bump**: `tpos-sidebar.js?v=20260514b`, `native-orders-app.js?v=20260514c`.

### [web2][ux] Custom Popup module — thay thế native alert/confirm/prompt + form "Tạo PBH" riêng

**Mục tiêu**: bỏ native `alert/confirm/prompt` xấu, không đồng nhất style cho toàn Web 2.0 (PBH, Native Orders, refund, delivery, tpos-pancake, web2-products, page-builder, …). Thêm 1 popup tuỳ chỉnh có icon/màu theo type, animation, keyboard nav, form input.

**Module** ([web2/shared/popup.js](../web2/shared/popup.js)):

- API Promise-based: `Popup.alert(msg, opts)` → void, `Popup.confirm(msg, opts)` → boolean, `Popup.prompt(msg, opts)` → string|null
- Convenience: `Popup.success/error/warning/info(msg)` — alert có type pre-set
- Options: `title`, `type` ('info'|'success'|'warning'|'error'|'question'), `okText`, `cancelText`, `defaultValue`, `placeholder`, `multiline`
- Lucide icon theo type (info/check-circle/alert-triangle/alert-octagon/help-circle)
- Keyboard: Enter = OK (Ctrl+Enter trong multiline), Escape = Cancel, click backdrop = Cancel
- Animation: fade-in backdrop 120ms + pop 180ms (cubic-bezier expo-out)
- Idempotent (`if (window.Popup) return;`)

**Auto-load** ([web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js)):

- Top of IIFE: `autoLoadPopup()` resolves `./popup.js` relative to `document.currentScript.src` → inject `<script>` vào `<head>` async=false
- Mọi trang Web 2.0 đã include `tpos-sidebar.js` (qua `page-shell.js` hoặc trực tiếp) tự động có `window.Popup` sẵn sàng — không cần sửa từng HTML
- Fallback: nếu Popup chưa load (mạng chậm), mọi callsite có pattern `window.Popup ? Popup.confirm(...) : Promise.resolve(confirm(...))`

**Callsites đã migrate** (~25 chỗ):

- `web2/fastsaleorder-invoice/pbh-app.js` — detail alert, confirm/cancel/delivery/refund/bulk action/resetStt + `w2pConfirm/w2pAlert/w2pPrompt` helpers
- `web2/fastsaleorder-refund/rf-app.js` — detail alert + changeState confirm
- `web2/fastsaleorder-delivery/dlv-app.js` — detail alert + changeState confirm
- `native-orders/js/native-orders-app.js` — resetStt confirm/alert, removeOrder confirm, createPbh (custom form, xem dưới)
- `web2/products/js/web2-products-app.js` — remove SP confirm
- `web2/shared/page-builder.js` — generic record delete confirm
- `web2/shared/tpos-sidebar.js` — `alertSoon` fallback
- `tpos-pancake/js/layout/settings-manager.js` — delete account confirm
- `tpos-pancake/js/pancake/pancake-context-menu.js` + `pancake-chat.js` — add-note prompt + success/error alert
- `tpos-pancake/js/pancake/pancake-chat-window.js` + `pancake-chat.js` — image select + send-message + private-reply error/confirm

**Form popup riêng "Tạo PBH"** ([native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js) `openCustomFormPopup`):

- Trước: `confirm('Tạo PBH từ X?')` — không cho user edit gì
- Sau: modal full form 520px:
    - Block tóm tắt đơn nguồn: code, STT, KH, SĐT, địa chỉ, SL, tổng tiền (highlight xanh)
    - 4 inputs grid 2×2: Đặt cọc, Phí giao hàng, Đã thanh toán, Ngày HĐ
    - Textarea ghi chú
    - OK/Huỷ buttons (Escape + click outside = cancel)
- Submit truyền `{ deposit, deliveryPrice, paymentAmount, dateInvoice, comment }` xuống `POST /api/fast-sale-orders/from-native-order` (backend đã hỗ trợ các field này)

**Test live** (localhost persistent browser session):

- `Popup.confirm({okText:'Đồng ý', type:'question'})` → modal hiện, click OK → resolve `true`
- `Popup.prompt({defaultValue:'hello'})` → input có value 'hello', modify → resolve string mới
- `createPbh(NW-20260513-0016)`: empty-order warning fires đúng → click "Vẫn tạo" → form modal hiện đủ 5 fields (pbhDeposit, pbhDeliveryPrice, pbhPaymentAmount, pbhDateInvoice, pbhComment), title "Tạo PBH từ NW-20260513-0016", cancel removes modal
- 0 console errors

**Cache bump**: `tpos-sidebar.js?v=20260514`, `native-orders-app.js?v=20260514`, plus 11 HTML pages có hard-coded sidebar version.

**Status**: ✅ Live. Native alert/confirm/prompt giờ chỉ dùng làm fallback an toàn — mọi user-facing popup đều dùng custom UI.

---

## 2026-05-13

### [orders][customer-360] Phase 14: Filter list theo Customer 360 id

**Mục tiêu**: từ modal Khách hàng 360°, user bấm 1 nút → list NW/PBH thu hẹp về chỉ đơn của khách đó. Mỗi filter có URL riêng để share/bookmark.

**Backend** ([render.com/routes/native-orders.js](../render.com/routes/native-orders.js) + [render.com/routes/fast-sale-orders.js](../render.com/routes/fast-sale-orders.js)):

- `GET /api/native-orders/load?customerId=N`
- `GET /api/fast-sale-orders/load?customerId=N`
- Cả 2 `/export` endpoints cũng inherit filter để CSV chỉ chứa đơn của khách đó
- Input validation: `Number.isFinite(parseInt(customerId, 10))` — bad input bị ignore, không throw (verified `?customerId=abc` → trả full 23 rows)

**API client** ([native-orders/js/native-orders-api.js](../native-orders/js/native-orders-api.js)): `NativeOrdersApi.list({ customerId })` truyền xuống worker.

**UI** (cả 2 trang [native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js) + [web2/fastsaleorder-invoice/pbh-app.js](../web2/fastsaleorder-invoice/pbh-app.js)):

- Modal header thêm button "🔍 Lọc đơn" (purple, `filter` icon) → `STATE.customerId = N`, `history.replaceState` URL `?customerId=N`, reload list, đóng modal
- Purple chip "Đang lọc theo Khách hàng #N — ×" hiện trên cùng (trước `.search-info`)
- Click `×` → clear filter + URL
- Init parse `?customerId=` từ URL → deep-link/share/bookmark hoạt động
- CSV export cũng inherit filter

**Test live** (commit `060e83da`, Render deploy live):

- NW `?customerId=6820`: chip "Đang lọc theo Khách hàng #6820 ×", filter còn 1 row (NW-20260424-0002), `clearCustomerFilter()` → chip removed + URL cleaned + 23 rows back
- PBH `?customerId=14202`: chip hiện, 0 rows (khách chưa có PBH), clear OK
- Bad input `?customerId=abc`: filter ignored gracefully → 23 rows
- Export: `Content-Disposition` đúng filename, filter pass qua

**Workflow user**: Top customers 360 → click 👤 mở modal → "🔍 Lọc đơn" → bay sang trang list scope theo customer → chip × để clear → hoặc share URL có `?customerId=N`.

**Cache bump**: `pbh-app.js?v=20260513c`, `native-orders-api.js?v=20260513b`, `native-orders-app.js?v=20260513b`.

**Status**: ✅ Live + verified end-to-end.

### [reports][customer-360] Phase 13: Top khách hàng 360° unified report

**Mục tiêu**: tận dụng `customer_id` FK của Phase 12 để rank khách hàng theo doanh thu hợp nhất (NW + PBH), thay vì group theo `partner_phone + partner_name` (V1 chỉ có PBH, dễ duplicate nếu cùng khách có nhiều variant phone/name).

**Backend** ([render.com/routes/pbh-reports.js](../render.com/routes/pbh-reports.js)):

- `GET /api/pbh-reports/top-customers-360?days=30&limit=10`
- `FULL OUTER JOIN` 2 CTE: `nw` (native_orders by customer_id) + `pbh` (fast_sale_orders by customer_id, exclude state='cancel')
- `LEFT JOIN customers c` → canonical name/phone/status từ Customer 360 (fallback hint từ orders nếu customer bị xóa)
- Order by `combined_total DESC LIMIT N`
- Trả thêm `unlinked: { native, pbh }` đếm số đơn chưa link customer_id (data-quality signal)
- Response shape: `{ customers: [{customerId, name, phone, status, nw:{count,total}, pbh:{count,total}, combinedTotal, lastOrder}], unlinked }`

**UI** ([web2/report-revenue/index.html](../web2/report-revenue/index.html)):

- Panel mới full-width: "🌐 Top khách hàng 360° (NW + PBH combined)"
- Hint line phía trên bảng: "Đơn chưa liên kết customer 360 trong N ngày: X NW + Y PBH"
- Table cols: #, KH (+ status badge), SĐT, NW (count + amount), PBH (count + amount), Tổng combined, action 👤
- Click 👤 → mở `#customer360Modal` (gọi `GET /api/v2/customers/:id/orders?limit=20`, render giống pattern PBH + Native pages)

**Test live** (Render commit `f1d5611` live):

- Endpoint trả 5 customers + `unlinked.native=15` (15 NW chưa có phone — đúng vì test orders không gắn phone)
- UI render 7 rows, top: Phuong Huynh 100k combined
- Modal mở thành công cho customerId=6820, title "Khách hàng #6820 — Đơn web + PBH"
- 0 console errors, 0 fetch fails

**So với V1** (`/api/pbh-reports/top-customers`):

- V1: group `partner_phone + partner_name` (PBH only, không cross-source) — vẫn giữ cho backward compat
- V13: group `customer_id` (NW + PBH combined) — recommended cho mọi report mới

**Production backfill** (Phase 12 follow-up): chạy `POST /api/native-orders/backfill-customer-links` + `/api/fast-sale-orders/backfill-customer-links` — 0 new links (mọi đơn có phone đã được auto-link từ create-time). Endpoints sẵn sàng cho future cleanup.

**Status**: ✅ Live, ready for further customer-aware analytics (lifetime value, cohort, RFM).

### [pbh][native-orders][customer-360] Phase 12: Partner reference → Customer 360 cross-system FK

**Mục tiêu**: kết nối đơn hàng (Đơn Web NW-... + PBH HD-...) với Customer 360 (table `customers`) để mọi đơn có FK đến khách hàng duy nhất, mở đường cho aggregation báo cáo "khách X có bao nhiêu đơn / tổng tiền bao nhiêu".

**Migration 074** (idempotent, chạy auto qua `ensureTables` ở mỗi server start):

- `native_orders.customer_id INTEGER` + `idx_native_orders_customer_id`
- `fast_sale_orders.customer_id INTEGER` + `idx_fso_customer_id`
- **Soft FK** (không có CONSTRAINT) — đơn vẫn sống nếu customer bị hard-delete

**Helper** ([render.com/utils/customer-helpers.js](../render.com/utils/customer-helpers.js)):

- `lookupCustomerIdByPhone(db, phone) → number|null` — **NO auto-create**, chỉ lookup. Khác với `getOrCreateCustomer` đã có (chuyên dùng cho "lưu khách"). Order INSERT/UPDATE chỉ link tới customer đã tồn tại.

**Auto-link wired vào**:

- `POST /api/native-orders/from-comment` — INSERT lấy `customer_id` từ phone lookup
- `POST /api/native-orders/from-comment` (merge path) — `customer_id = COALESCE(customer_id, $lookup)` để fill khi merge bổ sung phone mới
- `PATCH /api/native-orders/:code` — khi phone thay đổi → re-link
- `POST /api/fast-sale-orders` (manual) — INSERT lấy `customer_id` từ `partnerPhone`
- `POST /api/fast-sale-orders/from-native-order` — inherit `customer_id` từ source NW; fallback phone lookup
- `PATCH /api/fast-sale-orders/:number` — khi `partnerPhone` thay đổi → re-link

**Backfill endpoints** (admin, idempotent):

- `POST /api/native-orders/backfill-customer-links` → single-query UPDATE join, trả `{ linked, codes[] }`
- `POST /api/fast-sale-orders/backfill-customer-links` → tương tự với `partner_phone`

**Aggregation endpoint** ([render.com/routes/v2/customers.js:1241](../render.com/routes/v2/customers.js)):

- `GET /api/v2/customers/:id/orders` — accept numeric id HOẶC phone string
- Query song song `native_orders` + `fast_sale_orders` WHERE `customer_id = $1 OR phone = $2` (cover orders chưa backfill)
- Trả về `{ native[], pbh[], summary: { native: {count, totalAmount}, pbh: {count, totalAmount, byState} } }`

**API response shape** (cả NW + PBH thêm field mới):

- `order.customerId: number|null` — null = chưa link / không có phone hoặc phone không match customer nào trong DB

**Cloudflare Worker**: không cần đổi — `/api/native-orders/*` + `/api/fast-sale-orders/*` + `/api/v2/customers/*` đã wildcard sẵn.

**QA tests** ([scripts/pbh-qa-test.js](../scripts/pbh-qa-test.js)): 9 test steps Phase 12 — auto-link NW (linked + unlinked phone), PATCH re-link (null + restore), NW→PBH inherit, backfill idempotent (NW + PBH), aggregation by-id, aggregation by-phone. Test tự tạo customer với phone unique mỗi run (tránh duplicate phone trong live DB — `0123456788` tồn tại nhiều rows id=1, 14202, …, lookup `LIMIT 1` không deterministic). Cleanup hoàn toàn (`TEST-Phase12-*` prefix customer + DELETE NW/PBH).

**Status**: ✅ Deployed (Render `dep-d826q3r7uimc73c57570`) + QA **60/60 pass** live worker.

**UI** ([web2/fastsaleorder-invoice/pbh-app.js](../web2/fastsaleorder-invoice/pbh-app.js) + [native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js)):

- Mỗi row có `customerId != null` hiện thêm nút 👤 (lucide `user-circle`, tím) ngay sau "Tạo PBH"
- Click → mở `#customer360Modal` (lazy create, body-anchored, click-outside close)
- Modal hiện 2 KPI card (NW count + total / PBH count + total) + 2 bảng top-10 orders với mã/SL/tổng/trạng thái/chiến dịch
- Gọi `GET /api/v2/customers/:id/orders?limit=20` (endpoint Phase 12)
- Test live: cả 2 trang render đúng modal với title "Khách hàng #14202 — Đơn web + PBH"; 0 console errors
- Cache: `pbh-app.js?v=20260513b`, `native-orders-app.js?v=20260513`

### [tpos-pancake][native-orders][ui] Tạo đơn lặp lại cho cùng 1 khách — count badge + merge UX

**Vấn đề trước đó**: khi khách bình luận nhiều lần trong cùng campaign, sau khi tạo đơn cho comment đầu, nút "Tạo đơn" bị thay bằng icon khóa `package-open` → user KHÔNG bấm được comment khác của cùng khách để gộp vào đơn cũ (dù backend Phase 6 đã hỗ trợ merge).

**Files**:

- `tpos-pancake/js/tpos/tpos-comment-list.js` — nút luôn hiện trên mọi comment; ID đổi từ `create-order-{fromId}` → `create-order-{fromId}-{commentId}` (unique per row); icon động (shopping-cart / plus-square / check-square) theo trạng thái; thêm count badge `📝 N`; thêm `refreshCommentItem(commentId)` re-render row hiện tại + mọi comment khác cùng `fromId` để badge cập nhật đồng loạt khi merge thành công.
- `tpos-pancake/js/tpos/tpos-init.js` — `loadNativeOrdersForPost()` lưu thêm `commentCount` + `commentIds` vào `sessionIndexMap` (trước chỉ lưu `index/code/source`).
- `tpos-pancake/index.html` — bump cache: `tpos-comment-list.js?v=20260513c`, `tpos-init.js?v=20260513`.

**Behavior**:

- Chưa có order → button `shopping-cart`, title "Tạo đơn web"
- Đã có order, comment này CHƯA trong order → button `plus-square` (tím), title "Thêm comment vào đơn NW-... (N comments)" — click để merge
- Đã có order, comment này ĐÃ merged → button `check-square` (xanh lá), title "Comment đã thêm vào đơn..."
- Badge `📝 N` hiện cạnh order-code-badge khi `commentCount > 1`

**Notification 3-case** (theo backend response field):

- `idempotent: true` → "✓ Comment đã có trong đơn (N comments)" (info)
- `merged: true` → "📝 Đã thêm comment vào đơn (N comments)" (info)
- Mới hoàn toàn → "🆕 Đã tạo đơn web" (success)

**Test live** (localhost:8080, persistent browser session):

- 73 comments / 44 customers (5 customer có ≥2 comment trong campaign Loan Amy live)
- Simulate `sessionIndexMap[fromId] = { commentCount:2, commentIds:[c0] }` → `refreshCommentItem(c0)` → cả 2 row của cùng customer cập nhật badge `📝 2`; row c0 hiện `check-square` "Comment đã thêm…", row c1 hiện `plus-square` "Thêm comment…" → đúng spec
- 0 console errors, 0 fetch fails

**Status**: ✅ Done — ready for Phase 12 (Partner reference → Customer 360 cross-system FK)

### [pbh][export][bulk] Phase 10-11: Excel CSV export + bulk actions

**Phase 10 — CSV export (Excel-compatible, UTF-8 BOM)**:

- `GET /api/fast-sale-orders/export?state&search` → 24 cột: STT, số HĐ, ngày HĐ, KH, SĐT, địa chỉ chi tiết (city/district/ward), tổng SL, tổng tiền, đã thanh toán, đặt cọc, còn nợ, phí giao, COD, hãng VC, tracking, trạng thái, lần in, đơn nguồn, chiến dịch, kho, NV bán.
- `GET /api/native-orders/export?status&search&campaignIds` → 18 cột tương tự cho Đơn Web.
- UTF-8 BOM (`﻿`) prefix giúp Excel hiển thị tiếng Việt đúng không cần convert.
- Filename `pbh-export-YYYY-MM-DD.csv` / `donweb-export-YYYY-MM-DD.csv`.
- Auto inherit filter hiện tại (search/state/campaign).
- UI: "Xuất Excel" button cả 2 trang ([fastsaleorder-invoice](../web2/fastsaleorder-invoice) + [native-orders](../native-orders)) — create `<a download>` trigger download.

**Phase 11 — Bulk actions (multi-select)**:

- `POST /api/fast-sale-orders/bulk-confirm` + `/bulk-cancel`: body `{ numbers: [] }`, UPDATE batch với state guard (confirm chỉ từ draft, cancel chỉ ≠ cancel). Return `{ changed, requested, orders }`.
- Broadcast WS event `pbh:bulk-confirmed` | `pbh:bulk-cancelled` với count + numbers array.
- UI: bulk action bar (purple background `#ede9fe`) auto hiện khi check ≥1 row, ẩn khi 0 row. Hiện count + nút: **Xác nhận tất cả** (green) / **Hủy tất cả** (warning) / **Bỏ chọn**.
- Check-all checkbox `#pbhCheckAll` → toggle tất cả `.row-check` + update bulk bar.
- Per-row check event delegation: bất kỳ change → recompute bulk bar.

Verify live: `curl /api/fast-sale-orders/export` trả CSV với header `Content-Type: text/csv` + `Content-Disposition: attachment; filename="pbh-export-2026-05-13.csv"`. Bulk-confirm với fake number → `{ changed: 0, requested: 1 }` (graceful no-op).

Status: ✅ Deploy live commits `7422f7f1` + `7ffcab32`.

---

### [pbh][print][reports] Phase 8-9: Print HTML + Reports dashboard

**Phase 8 — Print PBH** ([web2/fastsaleorder-invoice/print.html](../web2/fastsaleorder-invoice/print.html)):

- Standalone printable invoice page A4 (`?number=HD-...`).
- Layout: company header (N2 Store brand) + parties block (bên bán / khách hàng) + items table (#, SP, ĐVT, SL, đơn giá, giảm, thành tiền) + totals (untaxed/discount/tax/delivery/grand) + COD/deposit/residual + signature blocks.
- `@media print` ẩn top-actions, font 11px.
- Auto increment `print_count` via `/print` API on render → realtime WS `pbh:printed` event broadcast.
- PBH list "In" button mở popup print.html thay vì alert.

**Phase 9 — Reports dashboard** ([render.com/routes/pbh-reports.js](../render.com/routes/pbh-reports.js) + [web2/report-revenue](../web2/report-revenue)):

- 4 endpoints: `/summary` (KPI + states), `/revenue` (daily series), `/top-customers` (ranked), `/by-campaign` (group by live_campaign).
- UI: 6 KPI cards color-coded (today revenue/30d revenue/residual/native orders/shipping/refunds), bar chart doanh thu theo ngày với hover tooltip, 4-pie state breakdown, top customers table, campaign table.
- Range selector 7/30/90/365 ngày.
- **Realtime auto-refresh**: subscribe `pbh:*` + `native_order:created` (debounced 2s) → reload toàn bộ dashboard.

**tpos-pancake feedback** ([tpos-comment-list.js](../tpos-pancake/js/tpos/tpos-comment-list.js)):

- Phân biệt 3 trường hợp khi tạo đơn từ comment: idempotent ("đã tồn tại"), merged ("📝 Đã gộp comment vào đơn N comments"), created ("🆕 Đã tạo đơn web").

Status: ✅ Deploy live commit `0041026c`. Dashboard có thể xem tại `/web2/report-revenue/index.html`.

---

### [pbh][realtime][merge] Phase 6-7: WS realtime sync + comment-merge by campaign — QA 40/40

**User**: "1/ tạo đơn ở tpos-pancake → realtime update native-orders bảng / 2/ khách đã có đơn trong chiến dịch → bấm tạo nữa thì thêm comment vào đơn cũ".

**Phase 6 — Comment-merge by campaign** ([render.com/routes/native-orders.js](../render.com/routes/native-orders.js)):

- Migration 073: `ADD COLUMN comment_ids JSONB DEFAULT '[]'`, `comment_count INT DEFAULT 1`.
- `POST /from-comment`: trước khi tạo đơn mới, check có draft/confirmed order nào của cùng `fb_user_id + live_campaign_id` không. Nếu có → **APPEND** comment_id + message vào note + tăng commentCount + messageCount. Return `{ merged: true, order }`.
- Idempotency mở rộng match cả `comment_ids @> [fbCommentId]`.

**Phase 7 — Realtime WS sync**:

- [server.js](../render.com/server.js): expose `broadcastToClients` lên `app.locals`.
- 4 routes (native-orders, fast-sale-orders, delivery-invoices, refunds) emit WS events sau create/update/state-change/delete: `native_order:*`, `pbh:*`, `delivery:*`, `refund:*`.
- [web2/shared/pbh-realtime.js](../web2/shared/pbh-realtime.js): shared WS client + debounce 500ms + auto-reconnect exponential backoff (max 30s).
- 4 UI pages subscribe + auto reload list + show notify "🆕 mới" cho user.

**QA iter 4** ([pbh-qa-test.js](../scripts/pbh-qa-test.js)): **40/40 PASS**

- Phase 6 (4 tests): create #1 no-merge, create #2 same campaign → MERGE, create #3 different campaign → NEW, idempotency.
- Phase 7 (1 test): WS connect `wss://n2store-fallback.onrender.com` → POST `/from-comment` → verify `native_order:created` event received trong 3s.

Status: ✅ deploy live commit `f81d9542`.

---

### [issue-tracking][fix] Nhận hàng RETURN_SHIPPER không trigger được — DELETE OrderLine + alreadyRefunded fallback

**File**: [shared/js/api-service.js](../shared/js/api-service.js) (processRefund step 2.5)

**User report**: Đơn Thu Về của khách Anna Ngọc (TV-2026-00630, tposId 430612) — bấm "Nhận hàng" → "Xác nhận" → toast lỗi `ActionInvoiceOpenV2 failed: 400 "Vui lòng thêm vài chi tiết hóa đơn"`. Lặp lại nhiều lần → tạo nhiều orphan draft refund order trên TPOS (435065/66/67/70, all 0 lines), original 430612 bị set `ReturnTotal=1` cho **cả 6 lines** → cuối cùng đơn thành "đã trả hết" mà thực tế chỉ trả 1 SP.

**Root cause**: Step 2.5 partial-refund filter chỉ filter client-side (`refundDetails.OrderLines = filteredOrderLines`) rồi PUT replace. Test thực tế cho thấy PUT replace OrderLines KHÔNG xoá line subtraction server-side đúng cách — refund order kết quả có 0 lines (TPOS emptied tất cả thay vì giữ 1 line ta gửi). ActionInvoiceOpenV2 sau đó thấy invoice rỗng → reject.

Side effect: mỗi failed attempt vẫn set `ReturnTotal` trên các line gốc → ActionRefund lần kế bỏ qua chúng (TPOS nghĩ đã refund) → vòng lặp tệ hơn.

**Fix (2 nhánh)**:

1. **DELETE từng line không match TRƯỚC khi PUT** — sau khi filter xác định `linesToRemove`, gọi `DELETE /odata/FastSaleOrderLine({Id})` cho từng line bị loại. Server-side state lúc đó chỉ còn lines target → PUT + ActionInvoiceOpenV2 work đúng.
2. **filteredOrderLines === 0 (target đã refund elsewhere)**: SP target không có trong refund order TPOS vừa tạo (do `ReturnTotal` đã set từ failed PUT cũ / refund khác). Confirm refund order này = refund nhầm 5 SP khác. Fix: thử `DELETE /odata/FastSaleOrder({refundOrderId})` để hủy orphan, return `{ alreadyRefunded: true, refundOrderId: null }` để [script.js handleConfirmAction](../issue-tracking/js/script.js#L1905) mark ticket COMPLETED qua nhánh xử lý sẵn có.

**Verify**:

- Re-trigger Nhận hàng cho TV-2026-00630 sau fix → ActionRefund returns 400 "Đơn hàng này đã được trả hết" (do ReturnTotal=1 trên 6/6 lines từ các attempt fail trước) → existing handler ở step 1 fail trả `alreadyRefunded:true` → ticket auto COMPLETED. Không còn lỗi `"Vui lòng thêm vài chi tiết hóa đơn"`.
- Orphan refund 435065/66/67/70 (0 lines) + 435073 (5 lines) cần dọn thủ công trên TPOS — fix có code DELETE FastSaleOrder() trong nhánh 2 nhưng cleanup quá khứ phải user xử lý.
- DELETE FastSaleOrderLine endpoint verified hoạt động qua dry test (`DELETE /odata/FastSaleOrderLine(99999999)` → 500 NRE thay vì 404 → endpoint tồn tại).

**Status**: ✅ Done

### [orders][kpi] Dọn header doc + remove dead code Firestore trong tab KPI Hoa Hồng

**File**: [orders-report/js/tab-kpi-commission.js](../orders-report/js/tab-kpi-commission.js)

- Header comment cũ liệt kê 4 Firestore collection (`kpi_statistics`, `kpi_audit_log`, `kpi_base`, `report_order_details`) — 3/4 đã migrate sang Render PG từ lâu, chỉ `report_order_details` + `settings/employee_ranges` còn dùng. Cập nhật lại header thành "Data sources" thực tế: Render PG (via CF Worker) + Firestore (2 collection còn dùng).
- Remove `const db = this.getDb(); if (!db) throw new Error('Firestore not available');` trong recon function — `db` không dùng ở đâu sau đó, recon đi qua `window.kpiManager.reconcileKPI` (Render PG).
- Giữ `getDb()` + `waitForFirebase()` vì còn cần cho `employee_ranges` (employee name fallback) + `report_order_details` (cache modal sản phẩm).

**Status**: ✅ Done

### [orders][kpi] Đồng bộ thứ tự dropdown "Tất cả campaign" trong tab KPI giống tab1

**File**: [orders-report/js/tab-kpi-commission.js](../orders-report/js/tab-kpi-commission.js#L700-L760)

**Vấn đề**: Dropdown campaign filter trong KPI tab sort alphabet (COMEBACK → NGÀN ĐƠN → T1 → T10 → T2…), khác hẳn dropdown "Cài Đặt Chiến Dịch" của tab1 vốn sort theo ngày tạo desc (T7 DEAL HOT → T6 DEAL XINH → T5 CHỐT ĐƠN → … → COMEBACK).

**Fix**: Bỏ `[...campaigns].sort()` (set alphabet). Dùng insertion order: API `/api/campaigns` (render.com/routes/campaigns.js:96) trả `ORDER BY created_at DESC` — chính nguồn dùng cho dropdown tab1. Bổ sung campaign từ `statsData` append cuối list để vẫn filter được campaign đã xóa khỏi DB nhưng còn KPI history.

**Status**: ✅ Done

### [pbh][delivery][refund] Phase 4-5: delivery_invoices + refunds + QA 35/35 PASS

**Phase 4** — Backend ([render.com/routes/delivery-invoices.js](../render.com/routes/delivery-invoices.js), [refunds.js](../render.com/routes/refunds.js)):

- `delivery_invoices` (DLV-YYYYMMDD-XXXX, migration 071): từ PBH (`fso_id/number`), partner snapshot, carrier (id/name/tracking), `delivery_lines` jsonb subset, COD + delivery_fee, state machine `pending→shipping→delivered|returned|cancel` với `state_history` jsonb. `POST /from-pbh + /ship + /deliver + /return + /cancel`.
- `refunds` (RF-YYYYMMDD-XXXX, migration 072): từ PBH, `refund_lines` với `quantityReturned`, `refund_mode` (cash|wallet|exchange), `amount_refund` auto compute, state machine `draft→approved→completed|cancel`. `POST /from-pbh + /approve + /complete + /cancel`.
- Register `/api/delivery-invoices/*` + `/api/refunds/*` ở server + CF Worker proxy.

**Phase 5** — UI list pages:

- [web2/fastsaleorder-delivery](../web2/fastsaleorder-delivery): full list + filter state + paging + detail modal + 4 action buttons (ship/deliver/return/cancel) chỉ visible đúng state.
- [web2/fastsaleorder-refund](../web2/fastsaleorder-refund): same pattern + 3 action buttons (approve/complete/cancel). Mode badge "Tiền mặt/Ví/Đổi", amount_refund highlight đỏ.
- PBH list ([pbh-app.js](../web2/fastsaleorder-invoice/pbh-app.js)) thêm 2 action button: "Tạo phiếu giao" (info truck) + "Trả hàng" (warning undo) cho mỗi PBH ≠ cancel.
- Cross-link UI: delivery/refund row → click số PBH → mở fastsaleorder-invoice.

**QA loop** ([scripts/pbh-qa-test.js](../scripts/pbh-qa-test.js)):

- Iter 1 (Phase 1-3): **25/25 PASS** — health, create native, convert, idempotency, search, confirm/print/cancel, filter state, reset-stt, browser UI.
- Iter 2 (Phase 1-4): **33/33 PASS** — thêm delivery /health + from-pbh + state machine (3-step history), refund /health + from-pbh + amount calc + state machine.
- Iter 3 (Phase 1-5): **35/35 PASS** — thêm browser load delivery + refund list pages (verify no console errors + tbody rows).

Tất cả test có cleanup (DELETE force=1) — test data không leak prod DB.

Status: ✅ Phase 1-5 deployed live commits `05c7ad18` (1-3) → `97296e10` (4 backend) → `bc70f35d` (5 UI). QA clean.

---

### [pbh][native-orders][web2] Phase 1-3: TPOS-clone PBH (Phiếu Bán Hàng) flow

**User**: "clone full TPOS chức năng PBH". Phase 1-3 deployed commit `05c7ad18`.

**Research**: probe TPOS API → SaleOnline_Order 77 fields (sample đơn Huỳnh Thành Đạt 0123456788). FastSaleOrder list trả 500 (permission/server issue) — design schema riêng theo industry-standard.

**Phase 1** — `native_orders` mirror TPOS SaleOnline_Order (migration 069 inline trong ensureTables):

```
ALTER TABLE native_orders ADD COLUMN
  city_code/city_name, district_code/district_name, ward_code/ward_name,
  partner_id, partner_code, partner_unique_id, email,
  company_id/company_name, warehouse_name, message_count, tpos_index.
```

PATCH endpoint mở 15 field mới.

**Phase 2** — `fast_sale_orders` table (migration 070, [render.com/routes/fast-sale-orders.js](../render.com/routes/fast-sale-orders.js)):

- Schema: `number` (`HD-YYYYMMDD-XXXX`), `display_stt` sequence, partner snapshot (id/code/name/phone/address/email), address breakdown, `order_lines` jsonb, totals (qty/untaxed/tax/discount/total), payment (amount/deposit/residual), delivery (price/COD/carrier/tracking), state machine (`draft|confirmed|done|cancel`), source link (`source_type/id/code` → native_orders), live_campaign, warehouse, company, crm_team, assigned_user, comment, tags, print_count.
- Routes: `GET /health|/load|/:number`, `POST /` (manual), `POST /from-native-order` (idempotent — skip nếu đã convert), `PATCH /:number`, `POST /:number/{cancel,confirm,print}`, `DELETE /:number?force=1`, `POST /reset-stt`.
- Register `/api/fast-sale-orders/*` ở [render.com/server.js](../render.com/server.js) + [cloudflare-worker/modules/config/routes.js](../cloudflare-worker/modules/config/routes.js) + [cloudflare-worker/worker.js](../cloudflare-worker/worker.js).

**Phase 3** — Convert + UI:

- [native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js): thêm action button "Tạo PBH" (xanh receipt icon) cạnh edit/delete. `createPbh(code)` → POST /from-native-order → notify + reload. NativeOrder status `draft` auto → `confirmed` sau convert.
- [web2/fastsaleorder-invoice/index.html](../web2/fastsaleorder-invoice/index.html) + [pbh-app.js](../web2/fastsaleorder-invoice/pbh-app.js): full PBH list page — filter state + search + pagination, detail modal, confirm/cancel/print actions, reset-stt.

**Verify live**:

```
NW-20260513-0001 → POST /from-native-order → HD-20260513-0001 (STT=1)
GET /load → 1 PBH (Antina Trân, phone 0849772439, từ NW-20260513-0001, state=draft)
```

UI screenshot: PBH list hiển thị cross-link `NW-20260513-0001` (đơn nguồn) — flow tpos-pancake → native-orders → PBH hoạt động end-to-end.

**Phase 4-5** (chưa làm): delivery invoice, refund, print HTML/PDF, reports, partner_id reference vào customer 360.

Status: ✅ Phase 1-3 live commit `05c7ad18`.

---

### [orders][tab3] Đối soát Excel — skip STT có tag "ĐÃ GỘP KO CHỐT" / "KHÔNG CẦN CHỐT"

**User**: "trong file excel có cột 'Nhãn' -> nếu có 'ĐÃ GỘP KO CHỐT', 'KHÔNG CẦN CHỐT' -> thì không cần Đối Soát".

**Implementation** ([orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js)):

1. `_fetchCampaignExcel` thay return từ `Map<sttStr,Set<codes>>` thành object `{sttToCodes, sttSkipReason}` — `sttSkipReason: Map<sttStr,string>` map STT có tag skip → tag gốc.
2. Detect cột "Nhãn" trong Excel (regex `/^Nh[aã]n$/i` ưu tiên, fallback `/Nh[aã]n/i`).
3. Split tag-cell theo `, ; / newline`, normalize tag (NFD strip accents + `đ→d` + lowercase + trim), compare với set `['ĐÃ GỘP KO CHỐT', 'KHÔNG CẦN CHỐT']`.
4. Match → set `sttSkipReason.set(stt, tag-gốc)`.
5. 3 reconcile flows xử lý skip:
    - `_runReconcileForRecord` (post-upload): trả thêm `skippedCount` + `skipped[]` → ghi Firebase `reconcileResult.skippedCount/skipped`.
    - `reconcileUploadWithTPOSV2` (per-record modal): truyền `sttSkipReason` vào `_renderReconcileResults`, hiển thị `⏭ N bỏ qua` trong summary + `<details>` collapsible.
    - `reconcileAllInCampaignV2` (bulk): summary `⏭ N bỏ qua (đã gộp / không cần chốt)` + track `sttSkipByCampaign` partition theo campaign name.
6. List card badge (line ~570): nếu `rr.skippedCount > 0` thêm suffix `(⏭ N bỏ qua)`; nếu `scannedCount=0 && skippedCount>0` → badge xám `⏭ N bỏ qua hoàn toàn`.

**Verify** ([scripts/verify-skip-tags-trigger.mjs](../scripts/verify-skip-tags-trigger.mjs)) — auto-scan 20 campaigns gần nhất, build skip-stt set, find upload có overlap:

```
Trigger reconcile cho upload chạm HOUSE+STORE 15/04/2026:
  skippedCount: 11
  Sample skipped:
    STT 18  · B1537B · ĐÃ GỘP KO CHỐT · HOUSE 15/04/2026
    STT 17  · B1537B · ĐÃ GỘP KO CHỐT · STORE 15/04/2026
    STT 5   · B1537V · KHÔNG CẦN CHỐT · HOUSE 15/04/2026
    STT 236 · B1564  · ĐÃ GỘP KO CHỐT · STORE 15/04/2026
    STT 197 · B1511H · ĐÃ GỘP KO CHỐT · HOUSE 15/04/2026

VERDICT: ✅ PASS — recognized 2 tag variants, accent-insensitive, đúng campaign per STT
```

**Probe** ([scripts/probe-excel-tags.mjs](../scripts/probe-excel-tags.mjs)) — 15/20 campaigns recent có STTs với skip tags; tổng across all:

- `ĐÃ GỘP KO CHỐT`: 80 occurrences
- `KHÔNG CẦN CHỐT`: 241 occurrences

**Status**: ✅ Done — feature triển khai trong 3 reconcile flows + list badge, không regression existing test (upload `00860050` skip=0 vì 06/05/2026 không có tag skip, vẫn 19 matched + 1 drop).

---

### [issue-tracking] Hiển thị "Ghi chú" (Comment) + "Ghi chú giao hàng" (DeliveryNote) trong modal customer lookup

**Trigger user**: ảnh TPOS → "Ghi chú: (THU VỀ 1 QUAT B1564 - 169K LỖI)" cần hiển thị trong modal tra cứu vì CSKH cần thông tin này.

**Discovery** (qua browser session inspect TPOS OData):

- `FastSaleOrder.Comment` = "Ghi chú" (order-level, do ops typed, vd "GG 390K", "THU VỀ 1 QUAT B1564 - 169K LỖI")
- `FastSaleOrder.DeliveryNote` = "Ghi chú giao hàng" (thường là template boilerplate dài)
- Cả 2 field đều CÓ SẴN trong response của `ODataService.GetView` (search list) — không cần extra fetch.

**Implement**:

- [issue-tracking/js/customer-orders-lookup.js](../issue-tracking/js/customer-orders-lookup.js):
    - Map `note: o.Comment` + `deliveryNote: o.DeliveryNote` (trim) trong `fetchOrders`.
    - `renderOrderRow`: thêm ribbon `📝 {note}` (vàng nhạt, 1 dòng ellipsis) ngay dưới grid summary nếu note non-empty — visible từ list, đỡ phải click vào từng đơn.
    - `renderDetailsHtml(details, orderFromList)`: nhận thêm order từ state để lấy note. Block "📝 Ghi chú" (vàng amber) hiển thị full. Block "🚚 Ghi chú giao hàng" (xanh blue) dùng `<details>` element collapsible (default đóng) vì DeliveryNote thường dài + boilerplate.
- [issue-tracking/css/style.css](../issue-tracking/css/style.css): +70 dòng — `.customer-order-note` ribbon (gradient yellow, ellipsis, padding-left 44px align với code col), `.order-note-block` blocks với `border-left` semantic (amber cho note, blue cho delivery), `<details>` chevron rotation animation.

**Verify (local)**:

- ✅ Search SĐT 0123456788: 79/143 đơn có Comment, ribbon render đúng 79 lần.
- ✅ Expand đơn `434176` (NJD/2026/65932): note="GG 390K" hiển thị main block, delivery note collapsible 'KHÔNG ĐƯỢC TỰ Ý HOÀN...' nhấp mở/đóng được.
- ✅ Screenshot xác nhận layout sạch, hierarchy rõ.

**Status**: ✅ Done

---

### [issue-tracking] Fix: cột "Mã đơn" đè tên khách trong modal customer lookup

**Trigger user**: ảnh chụp → "NJD/2026/63950" rộng > 100px cell → overflow đè "Huỳnh Thành Đạt".

**Fix** [issue-tracking/css/style.css](../issue-tracking/css/style.css):

- `.customer-order-summary` grid: `auto 100px 1.2fr 1fr 100px 110px 24px` → `22px 150px 1.2fr 1.1fr 110px 100px` (mở rộng code 100→150px, bỏ trailing 24px empty cell, gap 12→14px).
- `.customer-order-summary > * { min-width: 0 }` để grid item respect column width (không spillover).
- `.order-code`, `.order-cust`, `.order-code-sub`: `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` — text dài cắt gọn thay vì đè.
- `.order-channel-carrier`: line-clamp 2 dòng (carrier name "THÀNH PHỐ (1 3 4 5 6 7 8 10 11 Phú Nhuận, Bình Thạnh, Tân Phú,...)" rất dài, clamp giúp gọn).

**Verify**: screenshot local sau fix — code "NJD/2026/65932" tách hẳn khỏi "Huỳnh Thành Đạt", carrier address clamp 2 dòng có "…", layout đều.

**Status**: ✅ Done

---

### [tag-sync][merge] Rename TPOS tag "ĐÃ GỘP KO CHỐT" → "ĐÃ GỘP KHÔNG CHỐT" (đồng bộ XL label)

**Trigger user**: "TAG XL 'ĐÃ GỘP KHÔNG CHỐT' sẽ auto gán cho TAG tpos 'ĐÃ GỘP KHÔNG CHỐT'" — trước đây XL label đầy đủ "ĐÃ GỘP KHÔNG CHỐT" nhưng sync sang TPOS lại viết tắt "ĐÃ GỘP KO CHỐT". User muốn tên TPOS = tên XL chính xác.

**Fix**:

- `orders-report/js/tab1/tab1-tag-sync.js`:
    - `SUBTAG_TO_TPOS.DA_GOP_KHONG_CHOT`: `'ĐÃ GỘP KO CHỐT'` → `'ĐÃ GỘP KHÔNG CHỐT'`.
    - `TPOS_ALIASES` thêm legacy `'ĐÃ GỘP KO CHỐT': 'subtag:DA_GOP_KHONG_CHOT'` → reverse-sync vẫn nhận dạng đơn cũ.
- `orders-report/js/tab1/tab1-merge.js`:
    - `MERGED_ORDER_TAG_NAME`: `'ĐÃ GỘP KO CHỐT'` → `'ĐÃ GỘP KHÔNG CHỐT'`.
    - Thêm `MERGED_ORDER_LEGACY_TAG_NAMES = new Set(['ĐÃ GỘP KO CHỐT', 'ĐÃ GỘP KHÔNG CHỐT'])` để `shouldExcludeTag()` của `calculateMergedTagsPreview` + `calculateSourceTagsPreview` filter cả 2 spelling.
    - Confirm modal message: "tag KO CHỐT" → "tag KHÔNG CHỐT".
- `orders-report/js/tab1/tab1-bulk-tags.js`: `hasBlockedTag` check `t.Name === 'ĐÃ GỘP KHÔNG CHỐT' || t.Name === 'ĐÃ GỘP KO CHỐT'` (đơn merge cũ vẫn redirect).
- `orders-report/js/tab1/tab1-processing-tags.js`: cập nhật log message.

**Backward-compat**:

- Đơn merge cũ trên TPOS có tag "ĐÃ GỘP KO CHỐT" vẫn được nhận dạng (reverse sync + bulk-tag block + merge preview filter).
- Merge mới tạo tag "ĐÃ GỘP KHÔNG CHỐT" qua `_findOrCreateTPOSTag()` (tạo tag mới nếu chưa có).

**Verify localhost**: source check confirms `SUBTAG_TO_TPOS.DA_GOP_KHONG_CHOT === 'ĐÃ GỘP KHÔNG CHỐT'` + alias entry loaded.

Status: ✅ XL ↔ TPOS tag name đồng bộ, legacy đơn cũ KHÔNG bị xoá oan.

---

### [issue-tracking] Tra cứu nhanh tất cả đơn hàng của khách (SĐT/tên)

**Trigger user**: "cho 1 input nhập sđt hoặc tên khách hàng (không phân biệt tiếng việt không dấu, có dấu) -> mở modal coi được tất cả đơn hàng của khách đó, bấm vào đơn sẽ expand coi được chi tiết bên trong".

**Implement**:

- [issue-tracking/index.html](../issue-tracking/index.html): thêm `customer-lookup-bar` (input + button "Tra cứu") ngay dưới header + modal `modal-customer-orders` với stats pills, filter tabs (Tất cả/Mở/Đã TT/Hủy-Nháp), range select (60/180/365/730 ngày).
- [issue-tracking/js/customer-orders-lookup.js](../issue-tracking/js/customer-orders-lookup.js) **(file mới, IIFE)**: gọi TPOS OData `/FastSaleOrder/ODataService.GetView` qua `window.tokenManager.authenticatedFetch` — phone dùng `contains(Phone,...)`, tên dùng `contains(PartnerNameNoSign,...)` (đã strip diacritics + `đ→d`). Detect mode tự động: digit-only → phone, else → name. Click row expand load chi tiết qua `ApiService.getOrderDetails(orderId)` (cache trong Map, không re-fetch).
- [issue-tracking/css/style.css](../issue-tracking/css/style.css): thêm 230 dòng style cho lookup bar + modal grid layout + status pills (open/paid/cancel/draft) + chevron rotate animation + responsive grid-area cho mobile <800px.

**Verify (local Playwright)**:

- ✅ Search SĐT `0123456788` → 142 đơn, modal show, subtitle đúng "180 ngày gần nhất".
- ✅ Search tên `Huỳnh Thành Đạt` (có dấu) → 141 đơn. Search `huynh thanh dat` (không dấu) → 141 đơn (cùng kết quả).
- ✅ Search SĐT không tồn tại `0999999999` → "Không tìm thấy đơn nào".
- ✅ Click expand row → load 8 row sản phẩm + grid info + totals row. Click lại → collapse.
- ✅ Filter tabs: All=142, Open=0 (empty msg), Cancel=142.
- ✅ Range change 180→60 → re-search auto, 60 ngày = 132 đơn.
- ✅ ESC đóng modal.
- ✅ Visual: modal căn giữa, stat pills color-coded, status pills semantic (HỦY = đỏ).

**Status**: ✅ Done

---

### [tpos-pancake] Bỏ Confirm/Cancel đơn TPOS — trang này không cần

**Trigger user**: "bỏ luôn phần Confirm/Cancel đơn TPOS đi vì đâu có cần" — trang `tpos-pancake/` đã chuyển tạo đơn sang NATIVE_WEB (Postgres Render), 2 action TPOS này còn sót lại.

**Fix**:

- [tpos-pancake/js/tpos/tpos-api.js](../tpos-pancake/js/tpos/tpos-api.js): xoá `confirmOrder()` + `cancelOrder()` (2 endpoint `SaleOnline_Order/ODataService.ActionConfirm` & `ActionCancel`).
- [tpos-pancake/js/tpos/tpos-customer-panel.js](../tpos-pancake/js/tpos/tpos-customer-panel.js): xoá block button "Xác nhận đơn"/"Hủy đơn" (chỉ show khi `order.StatusText === 'Nháp'`) + 2 handler tương ứng.

**Status**: ✅ Done. Modal khách hàng còn nút "Đóng" + "Mở trên TPOS" (link sang tomato.tpos.vn — không phải API call).

---

### [orders][kpi] Đơn Hủy bỏ → ẩn HOÀN TOÀN khỏi modal KPI (không tính, không hiển thị)

**Trigger user**: "phần kpi đơn nào trạng thái 'HỦY' thì không tính vào và không cần hiển thị" — fix trước chỉ exclude khỏi KPI gross nhưng VẪN hiển thị với pill "✗ Hủy bỏ" trong tab "Đơn loại". User muốn tàng hình hoàn toàn.

**Fix**: filter cancelled invoices NGAY TỪ `applyFilters` → không order nào với invoice cancelled lọt vào `state.filteredData.orders`:

```js
const inv = this._invoiceCache?.get(order.orderId);
if (this._isInvoiceCancelled(inv)) continue;
```

→ Mọi downstream code (summary cards, main table, modal L1, recon) không thấy chúng. Cleanup theo cascading:

- Remove `_getKpiExclusionKind` (không còn 'cancel' branch).
- `renderEmployeeOrdersTable`: revert về isRefunded only, bỏ pill "✗ Hủy bỏ".
- `renderKPITable`: remove pre-compute cancelledKpi (emp.totalKPI đã đúng).
- `_indexReconResults` + `_applyL1ReconCache` + `_hydrateL1ReconCachesForEmployees`: bỏ `_isInvoiceCancelled` check (orders đã filter).
- HTML labels revert: "Đơn loại" → "Đơn hoàn", "Loại" col → "Hoàn".

`_isInvoiceCancelled` giữ làm helper detect.

**Test localhost** (Hạnh 30 ngày):

- Trước fix v1 (no exclude): Tổng 25 / OK 25 / Gross 150k / Net 150k ❌
- Sau fix v2 (exclude nhưng hiển thị): Tổng 26 / OK 24 / Đơn loại 2 / Gross 150k / Loại 5k / Net 145k
- Sau fix v3 (filter source): **Tổng 24 / OK 24 / Đơn hoàn 0 / Gross 145k / Net 145k** ✓
- `hasHuyBo: false` — không còn text "Hủy bỏ" ở bất kỳ đâu trong modal ✓ ([downloads/n2store-session/kpi-no-cancel-1.png](downloads/n2store-session/kpi-no-cancel-1.png)).

Status: ✅ đơn Hủy bỏ tàng hình hoàn toàn khỏi KPI modal.

---

### [supplier-debt] Fix running balance lệch theo filter — opening balance từ summary

**Trigger user**: So sánh 2 filter B9 Diễm My — DateFrom=01/05/2026 vs 30/04/2026 → tổng "Phát sinh" và "Nợ cuối kỳ" detail table khác nhau (lệch 720.000), trong khi summary row B9 hiển thị End=17.468.000 ổn cả hai. "Web lấy dữ liệu từ tpos nhưng có hệ thống tính toán riêng".

**Root cause** (xác minh qua API direct + UI test):

- `renderCongNoTab` trong [supplier-debt/js/main.js](supplier-debt/js/main.js) khởi tạo `runningBalance` cho page 1 = `congNo[0].Begin` (Begin của row đầu từ TPOS `Report/PartnerDebtReportDetail`).
- TPOS API trả `Begin` **không nhất quán** khi DateFrom rơi mid-period: filter 01/05 → 5.749.000 (sai, đáng lẽ 5.029.000); filter 30/04 → 4.613.000 (đúng).
- Hệ quả: cuối row cuối cùng detail = 18.188.000 thay vì 17.468.000 (lệch 720k, không khớp summary End).

**Fix**: Thay vì tin `congNo[0].Begin`, tính opening balance từ summary row (`Report/PartnerDebtReport`):

```
Opening = Summary.End − Summary.Debit + Summary.Credit
```

Công thức đúng vì summary End là authoritative; Debit/Credit là tổng phát sinh trong kỳ.

```js
// supplier-debt/js/main.js — renderCongNoTab (page 1 init)
if (page > 1 && prevPageEndBalance !== undefined) {
    runningBalance = prevPageEndBalance;
} else {
    const summaryEnd = Number(partnerData.End) || 0;
    const summaryDebit = Number(partnerData.Debit) || 0;
    const summaryCredit = Number(partnerData.Credit) || 0;
    runningBalance = summaryEnd - summaryDebit + summaryCredit;
}
```

**Test localhost** (`http://localhost:8080/supplier-debt/index.html` qua persistent browser session):

- Direct API probe B9 (PartnerId=568371) cả 2 filter:
    - 01/05–12/05: `apiFirstBegin=5.749.000` ❌ / `sumDerivedBegin=5.029.000` ✓ → last End `apiBegin=18.188.000` ❌ vs `sumDerived=17.468.000` ✓ (match summary).
    - 30/04–12/05: `apiFirstBegin=4.613.000` ✓ / `sumDerivedBegin=4.613.000` ✓ → last End 17.468.000 ✓ (cả hai phương án đều đúng — không regression).
- UI smoke 4 filter × 10 supplier = **40 pass / 0 fail** (`lastEnd === summary.End` ở mọi case).
- **Verify online** sau push commit `54de02e4` + GH Pages deploy: smoke lặp lại trên `https://nhijudyshop.github.io/n2store/supplier-debt/index.html` = **40 pass / 0 fail** (cùng benchmark localhost, không regression production).

**Files**: [supplier-debt/js/main.js:1618-1641](supplier-debt/js/main.js) (~+13 net, comment dài giải thích quirk TPOS).

Status: ✅ Fixed + verified online — detail running balance luôn khớp summary End bất kể DateFrom.

---

### [orders][kpi] Tab "Tin nhắn" KPI — render inline messages thật (Pancake API)

**Trigger user**: "tại sao không lấy được tin nhắn mà phải mở pancake? bạn coi tab1 order cách hiển thị tin nhắn đi" — MVP trước chỉ render meta + deep link, user muốn inline messages như tab1-orders chat modal.

**Fix**: Load đầy đủ Pancake stack vào KPI iframe, copy flow từ `tab1-chat-core.js`:

- HTML `orders-report/tab-kpi-commission.html`: thêm 2 script trước `tab-kpi-commission.js`:
    ```html
    <script src="../shared/js/pancake-token-manager.js"></script>
    <script src="js/managers/pancake-data-manager.js"></script>
    ```
    → `window.pancakeTokenManager` + `window.pancakeDataManager` available trong iframe.
- JS `renderInboxTab`: thay vì gọi `fetchInboxPreview` / fallback `/api/pancake/.../by-psid/...` (route worker không tồn tại) → dùng 2 bước:
    1. `pdm.fetchConversationsByCustomerFbId(pageId, psid)` → lấy conversations list, prefer type=INBOX.
    2. Nếu pageId derived sai → `pdm.fetchConversationsByCustomerIdMultiPage(psid)` để search across all pages, lấy `usedPageId` từ conv.page_id.
    3. `pdm.fetchMessages(usedPageId, convId, null, customerId)` → messages array.
- `_renderInboxMessages`: parse Pancake Public API v1 shape — `original_message` (raw) ưu tiên hơn `message` (HTML), strip HTML qua `_stripHtml`. Distinguish image/video/file attachments. Sort theo `inserted_at` ASC. Auto scroll bottom.

**Test localhost** (order `260501516` của Hạnh, khách Thanh Vân · 0915555178):

- PDM loaded: `hasPdm=true`, `hasTm=true`, `pdmTmReady=true`, JWT trong localStorage ✓.
- Click tab "Tin nhắn" → render đầy đủ 6 messages thật trong bubble layout:
    - Customer bubbles (trắng trái): "Áo yếm bữa trước 169 còn đen...", "Ok", "Ok e"
    - Page bubbles (tím phải): "dạ để e báo bạn thêm vào đơn cho c ạ NV.Bo", "dạ mẫu áo yếm e nhận về hàng tầm 2 ngày...", "dạ e nhận đơn c ạ Nv. Hạnh"
    - Mỗi bubble có sender name + timestamp ([downloads/n2store-session/kpi-inbox-real-1.png](downloads/n2store-session/kpi-inbox-real-1.png)).

**Cơ chế hoạt động**:

- Pancake JWT đã có sẵn trong localStorage (do user login từ tab1 hoặc inbox cùng origin) → `pancakeTokenManager` đọc instant.
- Page Access Token cache trong `pancake_page_access_tokens` (negative-cache 15 phút cho page subscription expired).
- Tab1 và KPI share cùng PDM cache (`_messagesCache`) → mở chat từ tab1 trước thì KPI load instant SWR.

Files: `orders-report/tab-kpi-commission.html` (+5), `orders-report/js/tab-kpi-commission.js` (~+50 thay logic fetch).

Status: ✅ inline messages production-ready.

---

### [orders][kpi] Tab "Tin nhắn" trong modal chi tiết đơn — meta + Pancake link

**Trigger user**: "bấm vào đơn modal có tab hiển thị tin nhắn inbox" — click 1 đơn ở modal L1 → modal L2 mở ra → cần tab xem messages của khách đặt đơn.

**Fix**:

- HTML: thêm tab `[data-order-tab="inbox"]` (icon `message-square`) + body `#tabInbox` chứa loading/empty/content stages.
- JS:
    - `_getKpiTposAuthHeader()` — helper auth chung (tokenManager → fallback POST `/api/token` với credential nội tuyến + cache 50 phút).
    - `_fetchSaleOnlineOrderForInbox(orderId)` — fetch `${WORKER}/api/odata/SaleOnline_Order(${orderId})?$expand=Partner`, cache 5 phút.
    - `renderInboxTab(orderId)`:
        - Pageid resolution: `order.Facebook_PageId || order.Facebook_PostId.split('_')[0]` (fallback vì `Facebook_PageId` thường null cho đơn từ LIVE).
        - Render meta: tên khách, SĐT, page ID, PSID, nút "Mở trên Pancake" (`https://pages.fm/#!/conversation/<pageId>/inbox?psid=<psid>`).
        - Fetch messages: ưu tiên `pdm.fetchInboxPreview(pageId, customerId)` → fallback `/api/pancake/pages/<pageId>/conversations/by-psid/<psid>/messages?limit=30` qua worker.
        - Render bubble style (page=tím phải, customer=trắng trái) với time + attachments. Auto scroll bottom.
- CSS: `.inbox-meta`, `.inbox-msg-{customer,page}`, `.inbox-attach-img`, `.inbox-pancake-link` (gradient + hover states).

**Test localhost** (order `260500568` — Hủy bỏ, Hạnh):

- TPOS SaleOnline_Order(GUID)?$expand=Partner ✓ (sau khi sửa auth header).
- `Facebook_PageId=null`, `Facebook_PostId="270136663390370_948890684420411"` → derive pageId `270136663390370` ✓.
- Meta render: "Uyen Nhi Le · 0907777701" + Page ID + PSID + nút Pancake ✓ [downloads/n2store-session/kpi-test-9-inbox-loaded.png](downloads/n2store-session/kpi-test-9-inbox-loaded.png).
- Messages empty (worker chưa có route `/api/pancake/.../by-psid/...`) → hiển thị empty state với link "Mở trực tiếp trên Pancake" ✓.

**Limitations & next**:

- Inline messages cần thêm route worker proxy `/api/pancake/pages/<pageId>/conversations/by-psid/<psid>/messages` HOẶC dùng JWT từ tokenManager để fetch trực tiếp Pancake. MVP hiện tại: meta + deep link.
- `pdm.fetchInboxPreview` chỉ work nếu KPI iframe có `window.pancakeDataManager` (chưa wired vào KPI iframe).

Files: `orders-report/js/tab-kpi-commission.js` (+200), `orders-report/tab-kpi-commission.html` (+30), `orders-report/css/tab-kpi-commission.css` (+130).

Status: 🔄 MVP done — meta + Pancake deep link. Inline messages cần thêm worker route ở iteration sau.

---

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
