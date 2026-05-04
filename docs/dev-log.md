# Dev Log — N2Store

> Cập nhật liên tục khi code. Mới nhất ở trên.
>
> **Cách tìm nhanh:** Ctrl+F tìm theo ngày `## 2026-`, theo module `[inbox]` `[chat]` `[extension]` `[orders]` `[worker]` `[render]`, hoặc theo status `IN PROGRESS`.

---

## 2026-05-04

### [orders-report] Fix badge "tin nhắn mới" còn hoài dù đã đọc — clear khi mở chat

**Files**: MODIFIED: [orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js) — sau khi `renderChatMessages(messages)` thành công trong flow mở modal, gọi `window.newMessagesNotifier?.clearPendingForCustomer(window.currentChatPSID)` (clear local + localStorage) và `_markRepliedOnServer(psid, pageId)` (POST `/api/realtime/mark-replied` → clear DB pending_customers).
**Chi tiết**: **Trigger user**: "cột tin nhắn nó cứ có badge tin nhắn mới rất nhiều dù đã đọc". **Root cause**: trước đây `clearPendingForCustomer` chỉ được gọi khi user **gửi reply** (tab1-chat-messages.js:586) — nếu user chỉ mở modal đọc rồi đóng (không trả lời), badge `.new-msg-badge` + class `.pending-customer-row` vẫn còn. Ngoài ra reload trang → `_fetchOfflinePendingCustomers()` re-fetch từ server `/api/realtime/pending-customers` → `setPendingCustomers()` merge với `Math.max(server, local)` → badge quay lại nếu server vẫn giữ. **Fix**: tại điểm `window.allChatMessages = messages; renderChatMessages(messages)` trong \_loadConversationMessages (chat-core.js:1104), bổ sung dual clear: (1) `newMessagesNotifier.clearPendingForCustomer(psid)` xoá khỏi `_pendingCustomers` array + localStorage `n2s_pending_customers` + remove DOM badge/highlight. (2) `_markRepliedOnServer(psid, pageId)` fire-and-forget POST tới CF Worker + Render server → clear pending_customers DB row → reload trang sau không re-add badge. **Pattern chung với** "mark replied": tái dùng nguyên hàm `_markRepliedOnServer` đã có (chat-messages.js:587) — read = replied về mặt user-intent (đã thấy). **Status**: ✅ Done.

### [orders-report+shared] Tăng tốc tải orders-report + cache avatar + fix giật bảng realtime

**Files**: NEW: [shared/js/cdn-libs.js](../shared/js/cdn-libs.js) — `window.loadXLSX()` / `window.loadHtml2Canvas()` lazy-load CDN libraries (~1.1MB initial JS saved). MODIFIED: [orders-report/main.html](../orders-report/main.html), [orders-report/tab1-orders.html](../orders-report/tab1-orders.html) — gỡ `<script src="...xlsx.full.min.js">` (~950KB), `<script src="...html2canvas.min.js">` (~200KB), và `<script src="...JsBarcode.all.min.js">` (~50KB, dead code — đã load trong print window iframe của bill-service.js); load cdn-libs.js thay thế. MODIFIED: [orders-report/js/tab1/tab1-table.js](../orders-report/js/tab1/tab1-table.js), [orders-report/js/tab1/tab1-stock-status.js](../orders-report/js/tab1/tab1-stock-status.js), [orders-report/js/managers/product-search-manager.js](../orders-report/js/managers/product-search-manager.js), [orders-report/js/chat/message-template-manager.js](../orders-report/js/chat/message-template-manager.js) — call `await window.loadXLSX()` trước `XLSX.read()`. MODIFIED: [orders-report/js/utils/order-image-generator.js](../orders-report/js/utils/order-image-generator.js), [orders-report/js/utils/bill-service.js](../orders-report/js/utils/bill-service.js) — call `await window.loadHtml2Canvas()` trước `html2canvas()`. MODIFIED: [orders-report/js/tab1/tab1-tpos-realtime.js](../orders-report/js/tab1/tab1-tpos-realtime.js) `addOrderToTable()` — surgical insert tại đầu tbody qua `applyOrderMembershipFlip()` (chỉ khi không có search/sort/employee view) thay vì full re-render via `schedulePerformTableSearch(150)`; preserve scrollTop bằng cách bù 1 row height (~52px) khi user đang scroll giữa bảng. MODIFIED: [shared/js/image-cache.js](../shared/js/image-cache.js) — `AUTO_PATTERNS` thêm `\/api\/fb-avatar\?`, `graph\.facebook\.com\/.+\/picture`, `scontent.*fbcdn.net`, `platform-lookaside.fbsbx.com`; `NON_CORS_PATTERNS` cùng patterns FB → route qua CF Worker `/api/image-proxy` (proxy lookalike pattern với Firebase Storage / TPOS).

**Chi tiết**: **Trigger user**: "Browser test orders-report/main.html → kiểm tra tốc độ web này, nó load hơi lâu". Sau debug: "lúc nhận dữ liệu realtime nó render lên đầu bảng → bị giật dữ liệu cũ gây rối quá". Sau đó: "được thì cache image lại avatar". **Root cause #1 (slow load)**: `tab1-orders.html` load 130 scripts đồng bộ không `defer` — XLSX (~950KB) + html2canvas (~200KB) + JsBarcode (~50KB) đều load eager nhưng chỉ dùng khi user trigger upload Excel / generate image / print bill (rare events). Initial load phải parse + execute 1.2MB JS trước khi render được data. JsBarcode lại còn dead code (đã được load trong print window iframe bởi bill-service.js). **Root cause #2 (jitter)**: realtime TPOS push order mới → `addOrderToTable()` `unshift(order)` vào allData → call `schedulePerformTableSearch(150)` → `renderTable()` → `tbody.innerHTML = ...` rebuild toàn bộ 50 rows visible. Khi user đang scroll giữa bảng, tbody rebuild làm scroll position không reset nhưng nội dung visible bị shift xuống 1 row → visual jitter. Trong burst phase (live tăng đột ngột), cảm giác như bảng "nhảy" liên tục. **Root cause #3 (avatar refetch)**: Customer avatar (CF Worker `/api/fb-avatar?id=...`) và chat message avatar (`graph.facebook.com/{psid}/picture`) chưa có pattern trong image-cache `AUTO_PATTERNS` → không match auto-observer → mỗi lần render row hoặc mở chat đều fetch lại từ FB CDN (chậm + tốn bandwidth). **Fix #1 (lazy CDN)**: tạo `cdn-libs.js` minimal helper `loadXLSX()`/`loadHtml2Canvas()` (idempotent qua `_promises` cache + `typeof XLSX !== 'undefined'` early return). Mỗi consumer call `await window.loadXLSX()` trước khi dùng — load on-demand khi user click upload Excel. JsBarcode chỉ xóa `<script>` tag duplicate (giữ nguyên trong bill-service print window). **Fix #2 (surgical realtime insert)**: trong `addOrderToTable()`, check `searchQuery/currentSortColumn/employeeViewMode` (top-level `let` shared giữa script tags qua try/typeof) — nếu sạch, gọi `applyOrderMembershipFlip(order.Code, order.Id, true)` đã có sẵn (insert vào filteredData/displayedData + DOM tr tại index 0 không rebuild tbody). Capture `scrollTop` trước insert, nếu user scroll > 24px thì sau insert bù `scrollTop += 52` để hàng đang nhìn không bị đẩy xuống visual. Fallback graceful về `schedulePerformTableSearch(150)` khi search/sort/employeeView active hoặc applyOrderMembershipFlip return false. **Fix #3 (avatar cache)**: thêm 4 patterns vào `AUTO_PATTERNS` + `NON_CORS_PATTERNS`. Auto-observer MutationObserver scan mọi `<img>` mới → match avatar URL → swap sang blob URL từ IndexedDB cache (TTL 7d, 500MB cap). FB graph URL non-CORS → CF Worker proxy. **Test localhost**: top-frame DCL 2052ms → 1631ms (-420ms / -20%); load 2416ms → 1881ms (-535ms / -22%); iframe FCP 1684ms → 1152ms (-530ms / -32%). Verify network: `xlsxLoaded:false`, `h2cLoaded:false`, `jsbLoaded:false` — không load eager. Avatar test sau campaign select: 50 `.customer-avatar` đều `data-cache-wired="1"` + src đã swap sang `blob:http://localhost:8080/...` (từ IDB cache). 0 request mới đến `graph.facebook.com` / `fb-avatar` proxy (cache hit).
**Status**: ✅ Done.

### [purchase-orders] E2E test 10 tabs + lifecycle DRAFT → COMPLETED — không bug

|              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Files**    | Không sửa code (chỉ verify chức năng đã build trước đó).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Chi tiết** | Tạo TEST order `PO-20260504-006` với 3 items (2 variants Trắng/Đen + 1 simple), walk qua đủ 10 tabs (DRAFT/AWAITING_PURCHASE/AWAITING_DELIVERY/RECEIVED/COMPLETED/HISTORY/REFUNDS/PRODUCTS/NOTES/DELETED) + lifecycle PATCH status DRAFT → AWAITING_PURCHASE → AWAITING_DELIVERY → RECEIVED → COMPLETED qua API (200 OK mỗi bước). **Verify**: tabs render đầy đủ + activate đúng + hash update; DRAFT actions = edit/print-barcode/copy/delete (không có export), COMPLETED actions edit/delete `disabled` qua `validateCanEdit`/`canDeleteOrder` (đúng spec final state); button mark-received trên row AWAITING_DELIVERY → click → confirm dialog → transition RECEIVED tab; button mark-completed trên row RECEIVED → click → confirm → transition COMPLETED tab; cleanup test order qua CANCELLED → soft DELETE → permanent DELETE (200 OK đều). Không có error trong window.error / unhandledrejection. |
| **Status**   | ✅ Done.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### [nhanhang] Fix bug đa máy hiển thị khác nhau — fingerprint cache check + Firestore realtime listener

**Files**: MODIFIED: [nhanhang/js/utility.js](../nhanhang/js/utility.js) — `_fingerprintReceipts(arr)` build content fingerprint `id|daKiemTra|soKg|soKien` per item (sorted by id) bắt mọi thay đổi flag/edit. `displayReceiptData()` thay length-only compare → fingerprint compare. Thêm `_setupRealtimeListener()` qua `collectionRef.doc("nhanhang").onSnapshot()` — máy khác mark/edit → fp khác → invalidate cache + re-render. Skip own pending writes qua `snap.metadata.hasPendingWrites`. Idempotent attach (`_realtimeUnsub` flag).
**Chi tiết**: **Trigger user**: "dữ liệu lưu local thì phải nên mỗi máy thấy đã kiểm tra khác nhau". **Root cause**: `displayReceiptData()` cũ check `serverDataLength !== cacheDataLength` — chỉ so length! Khi máy A mark 5 phiếu → Firestore update + length vẫn 285 → máy B reload thấy length match (285==285) → **dùng stale localStorage cache** → không thấy 5 phiếu marked. Mark/unmark/edit không thay đổi length → bug âm thầm. **Fix #1 (fingerprint)**: build chuỗi `id|daKiemTra|soKg|soKien` sorted, bắt cả mark/unmark/edit. **Fix #2 (realtime sync)**: snapshot listener auto-update khi máy khác change — không cần reload. **Test**: simulate máy A mark 1 → máy B (same browser, tampered localStorage để giả stale + reload) → fingerprint mismatch → fetch fresh → counts đúng (45 Chưa KT / 240 Đã KT) + `withFlagAfter:240` confirm server data dùng, không phải stale cache. **Pattern source**: docs/architecture/DATA-SYNCHRONIZATION.md "Firebase as Source of Truth + Real-time Listener" — đã apply cho InvoiceStatusStore/InvoiceStatusDeleteStore từ trước.
**Status**: ✅ Done.

### [nhanhang] Backfill 239 phiếu legacy (trước 01/04/2026) → daKiemTra=true

**Files**: MODIFIED: [nhanhang/js/main.js](../nhanhang/js/main.js) — `isReceiptChecked(receipt)` chỉ kiểm `!!receipt.daKiemTra` (gỡ cutoff filter ngầm — DB giờ là source of truth sau backfill). DATA (Firestore prod): collection `nhanhang/nhanhang.data` — 239/285 receipts có `daKiemTra=true, kiemTraBy="admin", kiemTraAt="04/05/2026, 09:47"`.
**Chi tiết**: **Trigger user**: "data trước 01/04 nhiều quá kiểm tra tay không nổi → cần bạn làm dùm". **Preview**: 239 phiếu trước cutoff 01/04/2026 GMT+7 (84% tổng), từ 31/10/2025 → 31/03/2026. Phân bố: 09/25=3, 10/25=43, 11/25=37, 12/25=60, 01/26=49, 02/26=5, 03/26=42. **Backfill**: gọi `markReceiptsAsChecked(ids)` qua Playwright FIFO browser session (login admin localhost, write thẳng prod Firestore). 1 update cho cả 239 ids — payload ~60KB, completed 3.35s. **Verify**: clear cache + reload → fresh fetch từ Firestore → `withFlag:239`, sample receipts có đủ 3 fields đúng. **UI counts**: 46 Chưa KT (từ 01/04→04/05/2026) / 239 Đã KT. **Reversible**: nếu sai có thể bulk unmark từ tab Đã KT. **Process**: Sandbox guard chặn lần đầu (cần preview); generated read-only preview report (count + by-month + earliest/latest + sample 5 phiếu) → user confirm → write thật.
**Status**: ✅ Done.

### [shared/image-cache+nhanhang] Mark/unmark perf + Firebase Storage CORS proxy + silent toast

**Files**: MODIFIED: [shared/js/image-cache.js](../shared/js/image-cache.js) — `NON_CORS_PATTERNS` thêm `firebasestorage.googleapis.com` (default Firebase Storage không trả CORS header → fetch fail → chưa bao giờ cache được). Giờ route qua CF Worker `/api/image-proxy` → 200 OK CORS → blob cache 7d/500MB cap. MODIFIED: [nhanhang/js/crud.js](../nhanhang/js/crud.js) `setReceiptsCheckedStatus` — refactor 2 paths: (1) **OPTIMISTIC PATH** (có cache): apply change vào cache → `setCachedData(newData)` → `removeRowsFromCurrentView(ids, newData)` (surgical DOM remove) → fire-and-forget Firestore `update()`. Rollback restore cache + full re-render khi lỗi. (2) **FALLBACK PATH** (no cache): get → update → surgical render. Bỏ toast `notificationManager.saving(...)` + `notificationManager.success(...)` — silent path. Chỉ giữ `notificationManager.error(... , 10000)` 10s khi lỗi. Bỏ `await displayReceiptData()` (no refetch). MODIFIED: [nhanhang/js/main.js](../nhanhang/js/main.js) — thêm `removeRowsFromCurrentView(receiptIds, updatedCachedData)`: query `tr[data-receipt-id]` + `.m-receipt-card` rồi `.remove()` từng node, drop khỏi `selectedReceiptIds`, update summary row "Tổng X phiếu", show empty state khi hết, recompute stats + tab badges qua `updateStatisticsDisplay/updateTabCounts(updatedCachedData)`, sync select-all.
**Chi tiết**: **Trigger user**: 3 vấn đề trong cùng 1 lần dùng: (1) "tốc độ chậm phải đợi lâu" — mark/unmark mất 4-5s. (2) "render lại toàn bộ bảng gây rối quá → cache lại hoặc dùng cách nào tối ưu". (3) "bỏ toast đang đồng bộ/thành công, chỉ hiện toast khi lỗi 10s". (4) "load lại ảnh liên tục" — mọi page reload all 283 imgs từ Firebase Storage. **Fix #1+2+3 (mark/unmark perf)**: trước = get + update + displayReceiptData refetch + full re-render 285 rows + 2 toasts blocking = 4.8s. Sau = surgical row remove + recompute stats từ cache đã update = **UI paint 99-217ms**, Firestore write nền 2-3s không block, **0 toast** trừ khi lỗi (10s). Test: mark 1 → `paintMs:99`, `trRemoved:true`, `remainingRows:284`, `uncheckedNow:284`, `toastsBefore/AfterMark/AfterDone:0/0/0`. **Fix #4 (image cache)**: phát hiện `fetch("https://firebasestorage.googleapis.com/...", {mode:"cors"})` throws "Failed to fetch" — Firebase Storage default không có CORS header. Cùng pattern với TPOS dev-log #51 đã fix. Add `firebasestorage.googleapis.com` vào `NON_CORS_PATTERNS` → CF Worker proxy. **Test cache populate**: `clear()` → reload → scroll → stats `count:100, 38MB` (1st page). Reload lần 2 → `count:283, 463.75MB` — toàn bộ 283 imgs đã cache, lần load sau hit blob URL từ IndexedDB không tốn bandwidth. **Why surgical OK**: mark/unmark luôn làm row LEAVE tab hiện tại (đánh dấu trong "Chưa KT" → leave; hủy trong "Đã KT" → leave) → surgical remove không bao giờ sai về visual.
**Status**: ✅ Done.

### [nhanhang] Tabs "Chưa kiểm tra / Đã kiểm tra" + checkbox bulk select + mark/unmark + apply ImageCache

**Files**: MODIFIED: [nhanhang/index.html](../nhanhang/index.html) — thêm `.check-tabs` (Chưa/Đã kiểm tra) + `.bulk-action-bar` (Chọn n / Đánh dấu / Hủy / Bỏ chọn) + cột checkbox header `<input id=selectAllReceipts>` + cột "Trạng thái". Load `image-cache.js` trước `config.js`. MODIFIED: [nhanhang/css/modern-styles.css](../nhanhang/css/modern-styles.css) — `.btn-success/.btn-warning/.btn-sm`, `.check-tabs/.check-tab/.check-tab-count`, `.bulk-action-bar/.bulk-selected-count`, `.col-check/.row-check/.row-checked/.row-selected`, `.status-pill.{checked,unchecked}`, `.mark-button/.unmark-button` + mobile responsive (tabs label ẩn, bulk bar stack, card checkbox + actions row). MODIFIED: [nhanhang/js/main.js](../nhanhang/js/main.js) — `activeCheckTab='unchecked'` (default), `selectedReceiptIds=Set`, `clearSelectionState/updateBulkActionBar/syncSelectAllCheckbox/toggleReceiptSelection/updateTabCounts`; `applyFiltersToData` áp tab filter trước user/date; `createReceiptRow` thêm cellCheck (checkbox) + cellStatus (pill) + mark/unmark button (cạnh edit/delete); colspan 7→9; mobile card thêm checkbox + status badge + per-card mark/unmark; `initializeCheckTabEvents/initializeBulkSelectionEvents`. MODIFIED: [nhanhang/js/crud.js](../nhanhang/js/crud.js) — `setReceiptsCheckedStatus(ids, checked)` immutable map (ids → set `daKiemTra/kiemTraBy/kiemTraAt` hoặc xoá 3 fields), `markReceiptsAsChecked/unmarkReceiptsAsChecked` wrappers; logAction `mark_checked`/`unmark_checked`; invalidateCache + displayReceiptData sau write.
**Chi tiết**: **Trigger user**: Thêm khả năng đánh dấu phiếu nhận đã kiểm tra. UI: 2 tabs trên header table (Chưa/Đã kiểm tra), badge count theo tab (respect filter user/date). Per-row: nút "Đã KT" (xanh) hoặc "Hủy KT" (cam) cạnh Sửa/Xóa. Bulk: checkbox cột đầu + Select-All (header) → bulk action bar hiện n phiếu chọn → "Đánh dấu đã kiểm tra" (tab unchecked) hoặc "Hủy đã kiểm tra" (tab checked). Mobile cards: checkbox + status badge + per-card mark/unmark button (full-width row dưới). **Schema**: receipt thêm 3 fields optional `daKiemTra:true`, `kiemTraBy:userName`, `kiemTraAt:"DD/MM/YYYY, HH:MM"`. Unmark = delete cả 3 fields (không lưu false). Permission: cần `nhanhang.edit`. **Test localhost** (Playwright FIFO + browser session): tabs render 2 (active=unchecked), 285 row checkboxes/pills/mark btns, count badge unchecked=285/checked=0. Round-trip: mark 1 receipt qua `markReceiptsAsChecked(["moqi9gy5_aket52oaa"])` → 285→284/0→1; switch tab "Đã kiểm tra" → 1 row hiện với pill "Đã kiểm tra" + nút unmark; unmark → 285/0 trả về sạch. Bulk: select-all → 285 selected, click 2 cb → bulk-bar hiện n=2 + markBtn visible; bulk mark 2 → 285→283/0→2; switch checked tab + select-all + bulk unmark → 285/0 cleanup. **ImageCache** áp dụng auto-observer: `firebasestorage.googleapis.com` URLs match `AUTO_PATTERNS` → mọi `<img>` row sẽ swap sang blob URL từ IndexedDB (TTL 7d, 500MB cap). Verify `window.ImageCache` exists, count=0 ban đầu, ready để cache khi user scroll.
**Status**: ✅ Done.

---

## 2026-05-03

### [inventory-tracking] Fix Tiền HĐ tính sai khi `tongSoLuong=0` + thêm nút Sửa per NCC row

**Files**: MODIFIED: [inventory-tracking/js/table-renderer.js](../inventory-tracking/js/table-renderer.js) — thêm helper `getProductEffectiveQty/Amount/InvoiceAmount/InvoiceTotalQty` (fallback chain `tongSoLuong > variants sum > soLuong`); `renderInvoicesSection()` compute fresh totalAmount/totalItems từ products thay vì đọc `hd.tongTienHD` stale; `commitInlineEdit()` recompute thanhTien qua helper; thêm `nccEditBtn` (icon pencil) trong col-ncc cell. MODIFIED: [inventory-tracking/js/data-loader.js](../inventory-tracking/js/data-loader.js) — sau load shipments recompute `hd.tongTienHD` + `hd.tongMon` theo helper; `getAllDotsAggregated()` cũng recompute từ sanPham. MODIFIED: [inventory-tracking/js/crud-operations.js](../inventory-tracking/js/crud-operations.js) — `deleteProductRow` dùng `window.getProductAmount` thay vì `p.thanhTien` stale. NEW: [inventory-tracking/js/modal-edit-ncc.js](../inventory-tracking/js/modal-edit-ncc.js) — modal "Sửa hóa đơn NCC" với form NCC name + ghi chú + bảng products (STT, mã, mô tả, SL, đơn giá Trung, thành tiền) + footer total tự cộng + Lưu thay đổi qua `shipmentsApi.update`. MODIFIED: [inventory-tracking/index.html](../inventory-tracking/index.html) — load `modal-edit-ncc.js`. MODIFIED: [inventory-tracking/css/modern.css](../inventory-tracking/css/modern.css) — `.btn-edit-ncc` (icon pencil tím, hiện on hover col-ncc); `.enc-*` table styles (1100px modal, sticky tfoot, focus ring tím).
**Chi tiết**: **Trigger user**: "Tiền HĐ NCC 24 sao nó tính sai -> 35 _ 127 + 45 _ 127 + 12 _ 87 + 5 _ 97 = 11689" — bảng hiển thị 6.200. **Root cause**: SP 24/1 có 2 biến thể (Trắng/Đen) đều SL=0 → `tongSoLuong=0`, nhưng `soLuong=35` (top-level field). Code cũ tính `thanhTien = (tongSoLuong | | soLuong) \* giaDonVi`chỉ chạy khi inline-edit, còn data load thì lấy`p.thanhTien`đã lưu = 0. SP 24/3 Set tương tự. Tổng: chỉ 5715 (24/2) + 485 (24/4) = 6200 (sai). **Fix**: helper`getProductEffectiveQty(p)`ưu tiên`tongSoLuong > 0`→ variants sum > 0 →`soLuong`. Recompute ở data-load (data-loader) + render (table-renderer) + edit (crud-operations + commitInlineEdit). **Verify localhost**: NCC 24 → `11.689 (52.601)`✓; tfoot total`15.354 (69.093)`✓; tongMon`227`✓; shipment header`Tổng HĐ: 15.354` ✓. **Edit modal**: click pencil → modal mở 4 rows NCC 24 với SL/giá đúng, totalAmt=11.689, totalQty=97 ✓.
**Status**: ✅ Done.

### [orders] Nút refresh PBH per-order trong cột PHIẾU BÁN HÀNG + fetch fresh khi tạo phiếu

**Files**: MODIFIED: [orders-report/js/tab1/tab1-fast-sale-invoice-status.js](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js) — `renderInvoiceStatusCell` thêm `refreshBtnHtml` (button ↻ background `#e0f2fe`), render trên 3 trạng thái: empty `!invoiceData`, all-cancelled, normal. NEW: `window.refreshPBHForOrder(orderId)` fetch fresh TPOS OData by Reference, drop stale entries (phiếu bị xóa khỏi TPOS) qua DELETE API, upsert fresh data, re-render cell. Visual loading ↻→⟳. MODIFIED: [orders-report/js/tab1/tab1-sale.js](../orders-report/js/tab1/tab1-sale.js) `confirmAndPrintSale` — fetch fresh TPOS PBH at confirm time.
**Chi tiết**: **Trigger user**: TPOS không emit `cancelled` event realtime → polling 5 phút có độ trễ. User cần nút manual refresh per-order. Cell empty cũng có nút (case: phiếu vừa tạo trên TPOS UI bypass n2store). Drop stale: phiếu bị xóa hoàn toàn TPOS → DELETE Store+DB. Khi tạo PBH mới: guard fetch fresh, chỉ block khi có active PBH thật.
**Status**: ✅ Done.

### [render+orders] Stale-check cycle 5 phút — fix invoice cũ hơn 60min không sync state realtime

**Files**: MODIFIED: [render.com/server.js](../render.com/server.js) — thêm setInterval `INVOICE_STALE_CHECK_INTERVAL_MS = 5 phút` quét DB `invoice_status` entries với `tpos_id IS NOT NULL AND entry_timestamp >= now-7d AND state NOT IN (cancel,paid,done)` (cap 200/cycle), batch fetch TPOS OData by Reference (chunk 20 OR clauses), diff `State\|ShowState` với DB. Khi khác → broadcast `{type:'tpos:invoice-update', action:'polled-stale-change'}` + UPSERT DB + seed `recentInvoiceState` cache.
**Chi tiết**: **Trigger user**: invoice NJD/2026/63983 (29/04 16:54) trên TPOS đã "Huỷ bỏ" nhưng n2store vẫn hiển thị "Đã xác nhận" — không sync. **Root cause**: 60-min `INVOICE_POLL_LOOKBACK_MIN` chỉ cover phiếu mới. TPOS chatomni socket KHÔNG emit `cancelled` event khi user click "Hủy phiếu" trên UI (verified bằng 2-tab live test 35min). Phiếu cũ hơn 60min bị hủy → poll không thấy → InvoiceStatusStore stale forever. **Fix**: tier 2 polling — DB-tracked Ids (đã được any client từng load), check state hiện tại qua OData. Cycle 5 phút cap 200 entries (chỉ entries chưa-final), broadcast giống event TPOS thật → client `handleInvoiceUpdate` đã handle (fetch by Id/Number → update InvoiceStatusStore → re-render PBH cell). UPSERT DB tránh re-broadcast cycle sau.
**Status**: ✅ Done.

### [tooling] Pre-commit prettier hook — triệt để vấn đề "diff sót sau commit"

**Files**: NEW: [.githooks/pre-commit](../.githooks/pre-commit) — bash script: lấy staged files (filter `\.(js | jsx | ts | tsx | html | css | md | json | yaml | yml)$`), chạy prettier `--write`từng file (ưu tiên`node_modules/.bin/prettier`, fallback `npx --no-install prettier`), `git add`lại các file đã format. Skip nếu env`SKIP_PRETTIER=1`. MODIFIED: [package.json](../package.json) — thêm `"prepare": "git config core.hooksPath .githooks"`script tự set hooksPath sau`npm install`(tracked workflow cho mọi clone). Set local:`git config core.hooksPath .githooks`.
**Chi tiết**: **Trigger user**: "sao lúc nào code xong nó cũng chừa lại không push vậy". **Root cause**: `stop:format-typecheck` hook chạy prettier SAU khi tôi đã commit + push → tạo diff mới chưa staged → mỗi session hoàn thành luôn còn 1-2 file modified. **Fix**: di chuyển format từ POST-commit (Stop time) sang PRE-commit (git hook). Workflow mới: `git add` → `git commit` → pre-commit hook chạy prettier trên staged files → re-stage → commit chứa version đã format → `git diff HEAD` luôn empty. **Test**: tạo file format xấu (`const x={a:1};`) → commit → tự động format thành `const x = { a: 1 };` → 0 diff sót. **Tracked**: `.githooks/` committed vào repo, `prepare` npm hook auto-setup khi clone mới.
**Status**: ✅ Done.

### [orders-report+chat] Wire infinite scroll cho modal tin nhắn — kéo lên đầu load tin cũ

**Files**: MODIFIED: [orders-report/js/tab1/tab1-chat-messages.js](../orders-report/js/tab1/tab1-chat-messages.js) — `renderChatMessages()` gọi `_wireInfiniteScroll(container)` (idempotent qua `data-scroll-wired` flag). Thêm helper `_wireInfiniteScroll`: scroll listener (passive + rAF throttle) — khi `scrollTop < 80px` và không loading → gọi `window.loadMoreMessages()`. MODIFIED: [orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js) — thêm flag `window._chatNoMoreMessages` (init false ở top). `loadMoreMessages` early-return nếu flag true; khi API trả `newMessages.length === 0` → set flag true (ngừng trigger lại). Reset flag = false ở 3 điểm `currentChatCursor = null` (switch conversation/page/type).
**Chi tiết**: **Trigger user**: "modal tin nhắn không scroll để load thêm dữ liệu được". **Root cause**: `window.loadMoreMessages` ĐÃ TỒN TẠI ở chat-core (line 1123 — fetch qua `pdm.fetchMessages(pageId, convId, currentChatCursor)`, prepend, restore scroll position) nhưng KHÔNG có scroll listener nào trigger nó. **Pancake API**: `current_count=N` parameter → return tin cũ hơn N tin đầu tiên. **Fix**: wire scroll listener trong `renderChatMessages` (chạy mỗi lần render, idempotent). Threshold 80px tránh trigger khi user gần đầu mà chưa thực sự muốn load. rAF throttle tránh fire liên tục. Stop flag tránh request loop khi đã hết tin cũ (API trả 0 message).
**Status**: ✅ Done.

### [orders-report+image-cache] Auto-observer + CORS proxy + bump cap 500MB

**Files**: MODIFIED: [shared/js/image-cache.js](../shared/js/image-cache.js) — (1) thêm `attachAutoObserver()` MutationObserver tự động auto-cache mọi `<img>` match `AUTO_PATTERNS = [/img\d*\.tpos\.vn/, /firebasestorage\.googleapis\.com/, /\/api\/image-proxy\?/]` (idempotent qua data-cache-wired). (2) Thêm `toCorsUrl(url)` route `img\d.tpos.vn` qua CF Worker `/api/image-proxy?url=...` để có CORS — TPOS direct domain không trả CORS header → fetch từ JS sẽ fail và cache miss luôn. Cache key giữ URL gốc → share giữa caller. (3) Bump `MAX_SIZE_BYTES` 200→500MB (catalog ảnh lớn), `MAX_SIZE_TARGET` 160→400MB. (4) Thêm `sizeCheck()` chạy 5 phút/lần (throttle ngắn) — không phụ thuộc age-cleanup 24h, evict ngay khi vượt cap. MODIFIED: [shared/js/tpos-image-proxy.js](../shared/js/tpos-image-proxy.js) `rewriteImg()` — sau khi rewrite proxy URL, gọi `ImageCache.setImgSrc` (idempotent qua data-cache-wired). MODIFIED: [orders-report/tab1-orders.html](../orders-report/tab1-orders.html) + [orders-report/tab3-product-assignment.html](../orders-report/tab3-product-assignment.html) — load image-cache.js trước tpos-image-proxy.js.
**Chi tiết**: **Trigger user**: scan toàn project apply ImageCache. **Test prod**: nav `tab1-orders.html` (campaign T5 đã chọn) → 763 TPOS images, **all 763 swap thành blob: URL** (cache hit/store). Cache stats: 527 entries, 238MB. **Bug-fix flow**: lần đầu test, blobCount=0 vì TPOS direct domain `img1.tpos.vn` không cho CORS → fetch fail → fallback remote URL. Fix bằng `toCorsUrl()` wrap qua CF Worker proxy. **Skip realtime**: chat-messages, chat-core, merge-live-waiting đều dùng URL pattern khác (Pancake CDN / Facebook), không match AUTO_PATTERNS.
**Status**: ✅ Done.

### [customer-hub+delivery-report+inventory] Mở rộng ImageCache (TTL 7d) sang wallet/profile/lightbox/gallery

**Files**: MODIFIED: [shared/js/image-cache.js](../shared/js/image-cache.js) — thêm helper `applyTo(rootEl)` quét `[data-cache-src]`/`[data-cache-bg]` và hoán URL → blob URL (idempotent qua flag `data-cache-applied`); thêm `setImgSrc(imgEl, url)` async-set src qua cache. MODIFIED: [customer-hub/js/modules/wallet-panel.js](../customer-hub/js/modules/wallet-panel.js) — thumbnail `.wallet-tx-thumb` (note inline + lone img) thêm `data-cache-src`; lightbox `_walletShowImage` cũng thêm + gọi `applyTo`. Sau render `_renderManualHistoryTab` + filter update gọi `applyTo`. MODIFIED: [customer-hub/js/modules/customer-profile.js](../customer-hub/js/modules/customer-profile.js) — thumbnail GD trong tickets card thêm `data-cache-src`, sau render `render()` gọi `applyTo(this.contentLoaded)`. MODIFIED: [customer-hub/js/modules/transaction-evidence.js](../customer-hub/js/modules/transaction-evidence.js) — `showSepayImage()` lightbox thêm `data-cache-src` + applyTo. MODIFIED: [delivery-report/js/delivery-report.js](../delivery-report/js/delivery-report.js) — `openLightbox()` dùng `setImgSrc` cho cả proxied URL và fallback. MODIFIED: [inventory-tracking/js/modal-image-manager.js](../inventory-tracking/js/modal-image-manager.js) — gallery thumbnails (img-mgr-thumb + img-gallery-item) thêm `data-cache-src`, post-render gọi applyTo; `_openLightbox()` dùng `setImgSrc`. MODIFIED: [customer-hub/index.html](../customer-hub/index.html) + [delivery-report/index.html](../delivery-report/index.html) + [inventory-tracking/index.html](../inventory-tracking/index.html) — load `image-cache.js` trước module dependent.
**Chi tiết**: **Trigger user**: scan toàn bộ project áp ImageCache cho mọi nơi render ảnh persistent (Firebase Storage / image-proxy). **Tránh đụng**: realtime channels (inbox/tpos-pancake/render-data-manager — chat hình động liên tục). **Implementation pattern**: HTML template giữ nguyên `src=` (fallback), thêm `data-cache-src=`. Sau render gọi `ImageCache.applyTo(container)` quét và hoán src → `URL.createObjectURL(blob)`. Idempotent qua `data-cache-applied` flag. Lightboxes set src trực tiếp dùng `setImgSrc()` async API. **Kết quả**: ảnh xác nhận CK (balance-history accountant), thumbnail GD wallet (customer-hub), gallery NCC (inventory-tracking), lightbox delivery-report — tất cả cache 7 ngày trong IndexedDB, share cache toàn project (cùng key `n2store_image_cache.blobs`).
**Status**: ✅ Done.

### [shared+balance-history] IndexedDB image cache TTL 7 ngày — giảm fetch lại Firebase Storage

**Files**: NEW: [shared/js/image-cache.js](../shared/js/image-cache.js) — module IIFE expose `window.ImageCache.{getUrl, prefetch, cleanup, stats, clear}`. IndexedDB store `n2store_image_cache.blobs` keyPath `url`, schema `{url, blob, size, addedAt, lastAccessedAt}`. Auto-cleanup 1 lần/ngày: xóa entries `addedAt > 7d`, evict LRU khi tổng size > 200MB (target 160MB). Request `navigator.storage.persist()` best-effort tránh browser auto-evict. MODIFIED: [balance-history/js/accountant.js](../balance-history/js/accountant.js) `renderApprovedToday()` — `<img>` thumbnail + `.acc-zoom-overlay` thêm `data-cache-src`/`data-cache-bg`, sau render hook `ImageCache.getUrl()` hoán đổi sang blob URL. Fallback im lặng về remote URL nếu cache fail. MODIFIED: [balance-history/index.html](../balance-history/index.html) — load `image-cache.js` trước accountant.js.
**Chi tiết**: **Trigger user**: ảnh xác nhận CK Firebase Storage cache HTTP `max-age=3600` (1h), sau đó refetch tốn data — yêu cầu cache persistent 7 ngày. **Implementation**: IndexedDB blob cache → `URL.createObjectURL()` render. Mỗi page ~60 thumbnail, page 2-26 chia sẻ cache nếu user scroll lại. Cleanup LRU + age-based: evict cũ nhất khi vượt 200MB cap. Throttle cleanup qua localStorage `imageCache_lastCleanupTs` — 1 lần/24h. **Quota**: Chrome ~60% disk, Firefox ~10%, Safari iOS ~1GB. Persistent storage flag → tránh auto-evict. **Failure modes**: IndexedDB unavailable / QuotaExceededError → fallback render direct URL (không break UX).
**Status**: ✅ Done.

### [balance-history] Ẩn tất cả đơn nguồn "Hoàn tiền" (wallet ORDER_CANCEL_REFUND) trong panel "Đã duyệt"

**Files**: MODIFIED: [balance-history/js/accountant.js](../balance-history/js/accountant.js) `renderApprovedToday()` — `isCancelRefund(tx)` check theo SOURCE FLAG (`tx.wt_type === 'DEPOSIT' && tx.wt_source === 'ORDER_CANCEL_REFUND'`) thay vì regex trên note. Note regex `REFUND_NOTE_FALLBACK = /(ho[àa]n\s+t[ừu]\s+đơn\s+h[ủu]y\|ho[àa]n\s+ti[ềe]n\s+h[ủu]y\s+đơn)\s*#NJD\//i` chỉ làm fallback cho legacy data thiếu wt_source.
**Chi tiết**: **Trigger user**: "ẩn các đơn có nguồn hoàn tiền" — không chỉ format cũ "(hoàn từ đơn hủy #NJD/...)" mà cả format mới "Hoàn tiền hủy đơn #NJD/2026/64599 (Thật: 515,000đ, Công nợ: 0đ)". **Fix**: chuyển từ note-text matching sang source-flag matching. Bất kể backend đổi format note thế nào, hễ wt_source là `ORDER_CANCEL_REFUND` thì ẩn. Robust hơn pattern matching. **Test**: 8/8 unit cases pass (cả 2 format note + edge cases).
**Status**: ✅ Done.

### [shared] Fix login bouncing loop — navigation-modern.js fallback storage check khi authManager chưa init

**Files**: MODIFIED: [shared/js/navigation-modern.js](../shared/js/navigation-modern.js) `waitForDependencies()` — `maxRetries` 15→30 (4.5s→9s timeout), thêm `hasValidStoredAuth()` đọc trực tiếp `loginindex_auth` từ session/localStorage và validate `isLoggedIn + expiresAt + timestamp+maxAge`. Khi timeout: nếu valid auth tồn tại → log warning + skip redirect (page load không có sidebar nav nhưng vẫn work); nếu không → redirect `../index.html` như cũ.
**Chi tiết**: **Trigger user**: "login văng ngược lại http://localhost:8080/index.html" — login → quy-trinh → navigation-modern.init() check `window.authManager` chưa ready (compat.js ES module imports chưa resolve) → timeout 4.5s → force redirect `../index.html` → login.js `checkExistingLogin` thấy session valid trong storage → redirect tiếp `quy-trinh` → vòng lặp bouncing. **Root cause**: race condition `<script type="module">` (compat.js) vs `<script defer>` (navigation-modern.js) — module imports có thể resolve sau defer scripts. **Fix**: gấp đôi retry timeout + storage-direct fallback (không phụ thuộc authManager). Page bị mất sidebar nav graceful hơn vòng lặp bouncing. Không break flow normal — only kicks in khi authManager init fail.
**Status**: ✅ Done.

---

## 2026-04-30

### [inventory] Modal "Tạo đơn đặt hàng" — share mã theo tên SP, validate trùng tên khác mã, khóa overlay

**Files**: MODIFIED: [inventory-tracking/js/modal-convert-po.js](../inventory-tracking/js/modal-convert-po.js) — `_generateCodesForAll`: build `nameCodeMap` (normalized name→code) từ items đã có code, mỗi target check map → reuse code thay vì gọi generator. Thêm `_clearItemErrorHighlights` + `_validateSameNameSameCode`: group validItems theo `productName.trim().toLowerCase()`, group có ≥2 distinct codes → tô đỏ tất cả rows + báo "STT X, Y có cùng tên SP nhưng mã khác nhau". Gọi trong `_confirmConvertToPO` sau missing-code check. MODIFIED: [inventory-tracking/index.html](../inventory-tracking/index.html) — bỏ `onclick="closeModal('modalConvertPO')"` trên `.modal-overlay` của `#modalConvertPO` → click ngoài không tắt modal, chỉ Hủy / X mới đóng. MODIFIED: [inventory-tracking/css/modal-convert-po.css](../inventory-tracking/css/modal-convert-po.css) — thêm `.po-row-error` (background `#fef2f2`, inset shadow đỏ trái) cho row vi phạm validation.
**Chi tiết**: **Trigger user**: "1) Tạo mã tất cả: STT cùng tên 100% phải dùng chung mã của STT đầu tiên (vd 24/1 Trắng N4106 → 24/1 Đen cũng N4106). 2) Tạo đơn hàng: kiểm tra cùng tên khác mã → tô đỏ + bắt sửa. 3) Click ngoài modal không tắt — phải Hủy/X". **Implementation**: (1) Sequential gen vẫn giữ để tránh trùng mã khi nhiều prefix cùng nhóm, nhưng thêm step reuse-from-map đứng trước generator call → cùng tên = cùng code. (2) Validation chạy AFTER missing-code check (đảm bảo tất cả items có code mới so sánh). Highlight persist (không setTimeout) đến khi user sửa & re-submit → `_clearItemErrorHighlights` clear trước mỗi lần validate. (3) Overlay vẫn render dimming, chỉ bỏ click handler — pattern cũ `purchase-orders` modal cũng làm vậy.
**Status**: ✅ Done.

### [orders] Click "+ PBH" trên đơn còn phiếu chưa hủy → modal cảnh báo + xác nhận "Tạo tiếp"

**Files**: MODIFIED: [orders-report/js/tab1/tab1-fast-sale-invoice-status.js](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js) `window._forceCreatePBH` — trước khi set bypass + open sale modal, lọc `InvoiceStatusStore.getAll(orderId)` lấy entries CHƯA huỷ (loại State='cancel', StateCode='cancel', IsMergeCancel, ShowState∈{'Huỷ bỏ','Hủy bỏ'}). Nếu 0 active → tạo trực tiếp như cũ. Nếu ≥1 active → render modal cảnh báo bảng các phiếu (Số phiếu link TPOS, Ngày tạo `DD/MM HH:mm`, Trạng thái badge, Tổng tiền VNĐ, Người tạo); 2 nút: "Đóng — không tạo" và "Tạo tiếp dù còn phiếu cũ" (đỏ) → click → close modal + proceedCreate. Click overlay đóng modal.
**Chi tiết**: **Trigger user**: "phiếu đã có đơn mà tạo mới thì mở modal hiện các phiếu đã xác nhận của đơn đó — cho nút tạo tiếp nếu user vẫn muốn tạo". Trước đây click "+ PBH" force tạo ngay → user dễ tạo trùng lặp khi quên rằng đơn còn phiếu xác nhận / chưa đối soát. **Sau fix**: hiển thị danh sách rõ Số phiếu / Ngày / Tổng tiền / Người tạo → user kiểm tra trước khi tạo; click số phiếu mở TPOS form invoiceform1 để xem chi tiết / hủy. Modal inline DOM (không phụ thuộc lib), backdrop blur, overlay click đóng.
**Status**: ✅ Done.

### [orders] Mở rộng `STT: X + Y` (TAG XL gộp) sang Phiếu Soạn Hàng + TPOS bill — tách helper `getMergedSttDisplay()`

**Files**: MODIFIED: [orders-report/js/utils/bill-service.js](../orders-report/js/utils/bill-service.js) — tách `getMergedSttDisplay(order, orderResult)` (priority: TPOS Tags "Gộp X Y" → `IsMerged.OriginalOrders` → ProcessingTagState custom flag id `GOP_<sttList>` → `SessionIndex`); `generateCustomBillHTML()` dùng helper thay vì 3 đoạn duplicate; export `window.getMergedSttDisplay`. MODIFIED: [orders-report/js/tab1/tab1-packing-slip.js](../orders-report/js/tab1/tab1-packing-slip.js) — `openPackingSlipModal()` (modal preview) + `generatePackingSlipHTML()` (HTML in) dùng `window.getMergedSttDisplay(order)` thay vì `order.SessionIndex`. MODIFIED: [orders-report/js/tab1/tab1-sale.js](../orders-report/js/tab1/tab1-sale.js) — TPOS bill (modify HTML thêm STT dưới "Người bán") dùng helper, gồm fallback TAG XL vốn chỉ check `IsMerged` trước đây.
**Chi tiết**: **Trigger user**: "phiếu khác phiếu bán hàng đã có logic tag xl chưa?" → check thấy Phiếu Soạn Hàng + TPOS bill (sale-confirm) chỉ dùng `order.SessionIndex` hoặc check `IsMerged` mà không check TAG XL `GOP_<X>_<Y>` flag. **Refactor**: tách helper chung trong bill-service để các consumer (PBH web, PBH TPOS, Phiếu Soạn Hàng) cùng dùng — giảm 24 dòng duplicate. **Verify**: order STT 313 (code 260402102) có flag `{id:"GOP_84_313", name:"GỘP 84 313"}` → tất cả 3 phiếu hiển thị `STT: 84 + 313` (logic identical với fix trước, đã pass test "84 + 313").
**Status**: ✅ Done.

### [render+orders] Phát hiện DELETE phiếu TPOS — verify single-key 404 + cleanup DB Render + Memory client

**Files**: MODIFIED: [render.com/server.js](../render.com/server.js) poll cycle — track `currentIds` set mỗi cycle. Sau broadcast state-change, identify candidates deleted (entries trong cache có `lastSeenInPoll` < 2 cycles ago NHƯNG không trong currentIds). Verify từng candidate qua single-key endpoint `/FastSaleOrder({id})`: HTTP 404 = confirmed deleted → broadcast `{type:'tpos:invoice-update', action:'polled-deleted', data:{Id}}` + xóa khỏi cache. HTTP 200 (vẫn tồn tại nhưng ra ngoài DateInvoice lookback) → refresh `lastSeenInPoll`. MODIFIED: [orders-report/js/tab1/tab1-tpos-realtime.js](../orders-report/js/tab1/tab1-tpos-realtime.js) `handleInvoiceUpdate()` — branch mới khi `action === 'polled-deleted'`: scan `InvoiceStatusStore._data` tìm entries có `Id === invoiceId`, gọi `DELETE ${API_BASE}/entries/{compoundKey}` cho từng entry → xóa local Map → re-render PBH cell các order liên quan.
**Chi tiết**: **Trigger user**: "xóa tpos mà không xóa render db nó sẽ lỗi". Trước đây: cancel (State='cancel') được polling phát hiện qua diff state, nhưng DELETE thực sự (invoice biến mất khỏi TPOS DB) — poll không thấy invoice trong result → cache vẫn giữ state cũ → DB Render giữ entry stale → web hiển thị PBH không tồn tại. **Logic mới**: cache structure thêm `lastSeenInPoll` ts. Mỗi poll cycle, sau khi process current invoices, scan cache tìm entries vừa thấy < 2 cycles ago (120s) nhưng KHÔNG trong current → suspect deleted. Verify single-key 404 → confirmed → broadcast `polled-deleted`. Tránh false positive (entry ra ngoài DateInvoice lookback NATURAL nhưng vẫn tồn tại) bằng verify 200 → refresh lastSeen. Client xóa CHÍNH XÁC entry by `compoundKey` (không xóa toàn bộ saleOnlineId — đơn có nhiều phiếu phải giữ phiếu khác active).
**Status**: ✅ Done.

### [render+orders] Hủy phiếu TPOS realtime fix — TPOS không emit cancel event → poll fallback + single-key OData lookup

**Files**: MODIFIED: [render.com/server.js](../render.com/server.js) — sau watchdog block thêm INVOICE STATE POLLING `setInterval` 60s: gọi `tposTokenManager.getToken()` → query `${TPOS_ODATA}/FastSaleOrder/ODataService.GetView?$filter=WriteDate ge <5min ago>&$top=50&$orderby=WriteDate desc` → diff `State | ShowState`với cache`Map<invoiceId, {stateKey, ts}>`→ broadcast`{type:'tpos:invoice-update', action:'polled-state-change', data:{Id,Number,Reference,State,ShowState,Order:{Id,Code:Number}}}`cho mọi state change. Cold start lần đầu chỉ populate cache (tránh spam 50 events). Cleanup cache entries > 30min. Guard`invoicePollRunning`tránh chạy chồng. MODIFIED: [orders-report/js/tab1/tab1-tpos-realtime.js](../orders-report/js/tab1/tab1-tpos-realtime.js)`handleInvoiceUpdate()`— đổi lookup khi không có Number: từ filter`Id eq <id>`(TPOS GetView IGNORE filter này, trả record random!) sang single-key endpoint`/FastSaleOrder({id})`(200 OK trả đúng record). Handle response shape: GetView`{value:[...]}`vs single-key object`{Id, ...}`.
**Chi tiết**: **Trigger user**: hủy phiếu 432792 (NJD/2026/64593) trên TPOS UI → web không update. **Verify từ 2-tab live test**: 35 phút WS log chỉ thấy actions `created` và `fast_sale_order_payment`, **không có** `cancelled`/`deleted`/`updated`. **Verify cancel thật**: GET `/api/odata/FastSaleOrder(432792)` → State='cancel', ShowState='Hủy bỏ' → cancel SUCCESS bên TPOS, nhưng KHÔNG emit qua chatomni socket. **2 bug song song**: (A) TPOS GetView filter `Id eq X` bị ignore → ngay cả khi event lean payload `{Id,State}` đến, lookup OData trả record sai; (B) cancel không emit event nên không có gì để trigger lookup. **Fix**: (A) single-key endpoint hoạt động đúng (verified); (B) Render poll TPOS mỗi 60s, broadcast event tự custom action `polled-state-change` — client tab1 handle đã có sẵn (handleInvoiceUpdate fetch by Id → update Store + re-render PBH cell).
**Status**: ✅ Done. Auto-deploy via push. Render poll cold start ~10s sau boot, sau đó cancel phiếu sẽ phát hiện trong vòng 60s qua poll fallback.

### [orders] Cell PHIẾU BÁN HÀNG ghi rõ Number + Ngày + Tooltip nút X — tránh hủy nhầm phiếu cũ

**Files**: MODIFIED: [orders-report/js/tab1/tab1-fast-sale-invoice-status.js](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js) `renderInvoiceStatusCell()` Row 1: Number badge (NJD/2026/X) tăng `font-size: 9→11px`, `font-weight: 500→600`, thêm `font-family: ui-monospace`. Thêm Date badge mới (định dạng `DD/MM HH:mm` từ `DateInvoice ?? DateCreated`) màu vàng nhạt cạnh Number. Tooltip nút ✕ "Nhờ hủy đơn" → multiline rõ ràng: `🛑 Hủy phiếu: NJD/2026/X` + `Ngày: 30/04 14:23` + `Tổng: 422.000đ` + `(Đơn có N phiếu — kiểm tra số phiếu trên cell)`. Thêm attr `data-invoice-number` lên button để debug.
**Chi tiết**: **Trigger user**: "cột phiếu bán hàng ghi rõ để nhận diện không hủy nhầm đơn cũ được không?". Trước đây Number badge nhỏ (9px) khó đọc, không có ngày, tooltip nút X chỉ "Nhờ hủy đơn" → user không biết đang nhằm phiếu nào trong N phiếu của đơn (vd đơn 260402102 có 17 PBH). **Sau fix**: Number to monospace dễ đọc, Date badge hiển thị ngay phân biệt phiếu mới/cũ, hover nút ✕ thấy đầy đủ Number + Ngày + Tổng tiền + cảnh báo nếu đơn có nhiều phiếu.
**Status**: ✅ Done.

### [orders] InvoiceStatusStore.getLatest ưu tiên latest NON-CANCELLED → cell PBH map đúng phiếu đại diện active

**Files**: MODIFIED: [orders-report/js/tab1/tab1-fast-sale-invoice-status.js](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js) `getLatest(saleOnlineId)` — track 2 cursors: `latestActive` (cao nhất theo timestamp trong các entry KHÔNG cancelled — kiểm bằng `State==='cancel' \|\| StateCode==='cancel' \|\| IsMergeCancel \|\| ShowState∈{'Huỷ bỏ','Hủy bỏ'}`) và `latestAny` (latest theo timestamp bất kể state). Return `latestActive ?? latestAny`.
**Chi tiết**: **Trigger user**: order `260402102` có 17 PBH (active + cancelled mix). Khi user hủy phiếu mới nhất → entry vừa hủy có timestamp cao nhất → `getLatest()` trước đây trả về phiếu hủy → `renderInvoiceStatusCell()` thấy `isCancelled` → render `−` (như chưa có PBH) → che mất 16 phiếu xác nhận/đối soát còn active. **Fix**: ưu tiên `latestActive`, fallback `latestAny` khi tất cả đều cancelled (giữ behavior cũ "hiện − khi đơn không còn phiếu nào active"). Mọi caller (chat-core, sale, fast-sale, table) đều mong muốn "phiếu đại diện active" → fix tại nguồn `getLatest` để propagate đúng cho tất cả.
**Status**: ✅ Done.

### [orders] PBH realtime nhận event lean payload `{Id, State}` (action payment / cancel / delete) — fetch fallback by Id

**Files**: MODIFIED: [orders-report/js/tab1/tab1-tpos-realtime.js](../orders-report/js/tab1/tab1-tpos-realtime.js) `handleInvoiceUpdate()` — extract thêm `invoiceId` từ root payload (`eventData.Id`, `data.Id`, `Data.Id`); guard mới: skip CHỈ khi cả `invoiceNumber` LẪN `invoiceId` đều thiếu; OData filter dùng `Id eq <invoiceId>` khi không có Number; dedupe key fallback theo Id.
**Chi tiết**: **Trigger user**: TPOS gửi event `fast_sale_order_payment` payload `{Id: 432728, State: "open"}` — chỉ Id, không có `Order.Code` → client log `Invoice event without Order.Code, skipping` → bỏ qua mọi event payment / hủy phiếu / xóa. **Verify từ log live 2-tab test**: 03:21:36 invoice 432724 paid, 03:22:39 invoice 432726 open, 03:25:47 invoice 432728 open — 3 event đều bị skip. **Fix**: hủy phiếu (action `cancelled`) cũng push lean payload tương tự → cần OData lookup by Id thay vì by Number. Dedupe vẫn đảm bảo không xử lý trùng do TPOS replay. Action `created` (NJD/2026/64530) đã hoạt động OK (có Order.Code).
**Status**: ✅ Done.

### [render] TPOS WS Watchdog — auto-detect dead socket + refresh token + reconnect (60s loop)

**Files**: MODIFIED: [render.com/server.js](../render.com/server.js) — sau `new TposRealtimeClient()` thêm `setInterval` 60s gọi `getStatus()`; nếu `!connected` HOẶC `Date.now() - lastPingFromTPOS > 90000ms` → `tposTokenManager.refresh()` → `getToken()` → `tposRealtimeClient.stop()` + sleep 1.5s + `start(newToken, room)` → `saveRealtimeCredentials('tpos', ...)` để persist. Guard `tposWatchdogRunning` tránh chạy chồng.
**Chi tiết**: **Trigger user**: SĐT `0123456788` đơn đã xác nhận trên TPOS, tạo phiếu PBH bên TPOS nhưng web orders-report KHÔNG tự cập nhật. **Root cause**: `GET /api/realtime/tpos/status` → `connected: false`, `wsReadyState: OPEN`, `lastPingFromTPOS = 1777517511545` (= 09:11:51 ICT, **40 phút trước** lúc check). TPOS silent half-close socket: WS readyState vẫn OPEN nhưng không nhận ping/event nữa → `TposRealtimeClient` không broadcast `tpos:invoice-update` xuống tab → mất realtime. **Fix tự động hoàn toàn**: watchdog dùng env `TPOS_USERNAME`/`TPOS_PASSWORD` (đã configured) để tự re-fetch Bearer token mỗi khi detect dead, không cần user thao tác. Chu kỳ 60s phát hiện → 1.5s gap → start → trong 5-10s rejoin xong → realtime hoạt động lại.
**Status**: ✅ Done. Auto-deploy via push → Render rolling restart pick up watchdog.

### [orders] Bill PBH hiển thị `STT: X + Y` cho đơn đã gộp (TAG XL custom flag GOP\_\*)

**Files**: MODIFIED: [orders-report/js/utils/bill-service.js](../orders-report/js/utils/bill-service.js) — `generateCustomBillHTML()` sau block parse "Gộp X Y" từ TPOS Tags, thêm fallback đọc `window.ProcessingTagState.getOrderData(orderCode).flags`, tìm flag id match `/^GOP_\d+(_\d+)+$/` (vd `GOP_84_313`), extract số STT bằng `match(/\d+/g)` → set `mergeTagNumbers = [84, 313]` → `sttDisplay = "84 + 313"`.
**Chi tiết**: **Trigger user**: bill PBH NJD/2026/63983 (Huỳnh Thành Đạt 0123456788) chỉ hiện `STT: 313` thay vì `STT: 84 + 313`. Root cause: TAG XL "GỘP 84 313" lưu trong `ProcessingTagState._orderData[code].flags` (custom flag id `GOP_84_313`), KHÔNG nằm trong `order.Tags` (TPOS). Bill-service trước chỉ check `orderTags.find(t => t.Name.startsWith('Gộp '))` → miss. **Verify localhost**: `feval window.generateCustomBillHTML(order, {})` → match `<strong>STT:</strong> 84 + 313` ✅. Order code 260402102 / id 30150000-5d4d-0015-3e86-08de9872e286 có `xlFlags: [..., {id:"GOP_84_313", name:"GỘP 84 313"}]`.
**Status**: ✅ Done.

### [inventory-tracking] Tỉ giá Trung→VND cố định ×4500 + product picker từ kho cho modal "Tạo đơn đặt hàng"

**Files**: MODIFIED: [inventory-tracking/js/table-renderer.js](../inventory-tracking/js/table-renderer.js) — `renderInvoicesSection()` đổi `shipTiGia = parseFloat(shipment.tiGia)` → `shipTiGia = 4500` cố định. MODIFIED: [inventory-tracking/js/modal-convert-po.js](../inventory-tracking/js/modal-convert-po.js) — bỏ `tiGia` arg từ shipment, dùng hằng số `INV_TO_VND = 4500` ở `_explodeSanPhamToItems()` + `_renderConvertModal()`; thêm autocomplete picker (cell Tên SP) gọi `WarehouseAPI.search()` với debounce 220ms ≥ 2 ký tự, hiển thị 8 gợi ý (ảnh + mã + tên + giá bán + tồn kho), click → fill `productName` + `productCode` + `sellingPrice`; click-outside hide dropdown (singleton listener flag). MODIFIED: [inventory-tracking/index.html](../inventory-tracking/index.html) — load `../shared/js/warehouse-api.js` trước `modal-convert-po.js`. MODIFIED: [inventory-tracking/css/modal-convert-po.css](../inventory-tracking/css/modal-convert-po.css) — `.po-name-wrap` (relative), `.po-suggest` (dropdown 320px max-h, shadow), `.po-suggest-item` (img 36x36 + 2-line info), `.po-suggest-price` xanh / `.po-suggest-qty--zero` đỏ.
**Chi tiết**: **Trigger user**: "1/Số tiền ở bảng và modal tạo đơn đặt hàng là x 4500. 2/Cho chọn sản phẩm từ kho sản phẩm ở modal tạo đơn đặt hàng". **Verify localhost**: bảng SP hiển thị `127 (572)`, `87 (392)`, tfoot `10.909 (49.091)` — đúng ×4500/1000. Modal: `invAmt=32.598.000` (7244×4500), `buyInputs=[571.500, 571.500, 391.500]` (127×4500, 87×4500). Picker: gõ "ao" → 8 suggestions; click `[B968X] 0101 B47 ÁO KHOÁC GÂN TRƠN TAY SỌC (Xám)` → name + code (`B968X`) + giá bán (`230.000`) auto-fill, dropdown ẩn.
**Status**: ✅ Done.

### [inventory-tracking] Modal "Tạo đơn đặt hàng" — convert Trung→VND đúng theo `tiGia` (thay vì ×1000 cứng)

**Files**: MODIFIED: [inventory-tracking/js/modal-convert-po.js](../inventory-tracking/js/modal-convert-po.js) — thêm state `_convertCurrentTiGia`; `openConvertToPurchaseOrderModal()` resolve `tiGia` từ shipment cha (`globalState.shipments`), pass xuống `_explodeSanPhamToItems(sanPhamArr, tiGia)`; `_renderConvertModal()` dùng `tiGia` để compute `invoiceAmt` (Số tiền hóa đơn VND); fallback ×1000 vẫn giữ khi shipment chưa có tỉ giá.
**Chi tiết**: **Trigger user**: "vào modal này sẽ là tiền VNĐ". Trước đây modal mặc định `INV_TO_VND = 1000`, hiển thị 127 yuan thành 127.000 VND — sai. Nay dùng `tiGia` của shipment (vd 3979) → `127 × 3979 = 505.333` VND đúng. **Verify localhost**: Số tiền hóa đơn 7.244 yuan → `28.823.876` VND; Giá mua 127/87/97 yuan → `505.333 / 346.173 / 385.963` VND. **Fallback**: shipment chưa nhập tỉ giá thì giữ ×1000 để không phá legacy data.
**Status**: ✅ Done.

### [inventory-tracking] Đơn giá / Tiền HĐ hiển thị song song "Trung (VNĐ)" — chuyển CNY → VND nghìn theo `tiGia` của shipment

**Files**: MODIFIED: [inventory-tracking/js/table-renderer.js](../inventory-tracking/js/table-renderer.js) — `renderInvoicesSection()` lấy `shipTiGia = shipment.tiGia`, gắn vào header (`Đơn giá (Trung)`, `Tiền HĐ (Trung / VNĐ)`), pass xuống `renderProductRow()`, gắn VND suffix vào tfoot total; `renderProductRow()` nhận `tiGia` opt, render `_vndSuffixHtml` next to `giaDonVi` + `tongTienHD` + thêm `data-ti-gia` attr trên 2 cell để inline-edit dùng được; `startInlineEdit()` strip `(...)` khỏi text trước khi parseFloat; `commitInlineEdit()` re-render VND suffix sau update + amount-value cell rowspanned cũng được sync. MODIFIED: [inventory-tracking/css/modern.css](../inventory-tracking/css/modern.css) — thêm `.th-currency-tag` (label nhỏ hơn, gray-500).
**Chi tiết**: **Trigger user**: "giá tiền nhập vào bảng này là tiền tệ trung nên cần x 4.5 ghi rõ tiền trung, vnđ". Tỉ giá thực tế đọc từ `shipment.tiGia` (vd `3979`), không hard-code 4.5. Format VND: `(yuan × tiGia / 1000)` rounded, hiện trong `<span class="vnd-inline">(...)</span>` xanh — đồng bộ với header stats bar và Tổng HĐ ngoài shipment header đã có sẵn. **Verify localhost**: header `Đơn giá (Trung)` / `Tiền HĐ (Trung / VNĐ)`; cell `127 (505)` = 127 yuan / 505k VND, `7.244 (28.824)`, tfoot `10.909 (43.407)` đúng. **Inline edit**: textContent trim regex `/\s*\([^)]*\)\s*$/` đảm bảo input lấy giá Trung gốc; commit/Escape/error path đều dùng innerHTML để khôi phục VND suffix.
**Status**: ✅ Done.

---

## 2026-04-29

### [soquy] "Chi tiết theo loại" full-width mặc định, bỏ max-height → cuộn dọc xem các bảng khác bên dưới

**Files**: MODIFIED: [soquy/css/soquy.css](../soquy/css/soquy.css) — `.report-section--category` đổi `grid-column: 1 / 2` → `1 / -1` (full-width); `.report-section--category .report-section-body` đổi `max-height: 680px` → `none` (bỏ giới hạn chiều cao). MODIFIED: [soquy/js/soquy-main.js](../soquy/js/soquy-main.js) — bỏ logic toggle gridColumn của category trong handler `toggleTrendBtn` (luôn giữ full-width).
**Chi tiết**: **Trigger user**: "CHO PHẦN CHI TIẾT LOẠI PHIẾU MẶC ĐỊNH HIỂN THỊ FULL KHUNG, CẦN XEM CÁC BẢNG KHÁC THÌ SCROLL XUỐNG". Trước đây section "Chi tiết theo loại" chỉ chiếm 1/2 khung và body bị clip ở 680px → user phải scroll trong list nhỏ. Sau thay đổi: section chiếm full grid (`1 / -1`), không max-height → toàn bộ category list trải dài tự nhiên; "Biểu đồ thu chi" + "Giao dịch lớn nhất" + "Phân bổ theo quỹ" nằm bên dưới → user scroll trang để xem.
**Status**: ✅ Done.

### [soquy] "Biểu đồ thu chi" mặc định thu gọn (collapsed) — bấm header để mở

**Files**: MODIFIED: [soquy/index.html](../soquy/index.html) — section bar chart thêm class `report-section--collapsible collapsed`, header thêm class `report-section-header--clickable` + icon chevron `report-section-chevron`, id `reportBarChartSection` + `reportBarChartToggle`. MODIFIED: [soquy/js/soquy-main.js](../soquy/js/soquy-main.js) — bind click toggle `.collapsed` class. MODIFIED: [soquy/css/soquy.css](../soquy/css/soquy.css) — `.report-section--collapsible` (cursor/hover), `.report-section-chevron` (rotate -90deg khi collapsed), ẩn `.report-section-body` khi collapsed.
**Chi tiết**: **Trigger user**: "Biểu đồ thu chi mặc định thu nhỏ, khi nào cần xem thì bấm vào mở để tối ưu hiển thị cho khung Chi tiết theo loại". **UX**: header click toggle (cả title + chevron); chevron quay -90° khi đóng → 0° khi mở; vẫn tự render bar chart trong `renderAll()` (HTML đã sẵn, chỉ ẩn body) → mở ra là thấy ngay không cần re-fetch.
**Status**: ✅ Done.

### [soquy] Drill-down "Chi tiết theo loại" — phân trang 50 phiếu/trang thay cho text "Hiện X phiếu nữa..."

**Files**: MODIFIED: [soquy/js/soquy-report.js](../soquy/js/soquy-report.js) — `renderCategoryBreakdown()`: bỏ slice(0, 20) + text tĩnh "Hiện X phiếu nữa..."; tách logic render bảng chi tiết ra `renderCategoryDetailRows(catKey)` với state `categoryDetailPages` (catKey→page) + cache `categoryDetailCache`; lazy-render khi mở dropdown lần đầu. Pagination control: `← Trước` / `Trang X/N · A-B/Total phiếu` / `Sau →`, page size = 50. MODIFIED: [soquy/css/soquy.css](../soquy/css/soquy.css) — thêm `.report-detail-pagination`, `.report-page-btn` (hover/active/disabled state), `.report-page-info`.
**Chi tiết**: **Bug user**: mở drill-down 1 category có 126 phiếu, chỉ thấy 20 phiếu đầu + text "Hiện 106 phiếu nữa..." không bấm được → user không xem được phiếu còn lại. **Giải pháp**: chuyển sang pagination 50/trang với 2 nút Prev/Next + label "Trang X/Y · M-N/Total phiếu". Lazy render: detail rows chỉ build HTML khi user mở dropdown để giảm cost render lần đầu. Pagination buttons có `e.stopPropagation()` để không bubble lên row click (toggle dropdown). Reset page=0 khi re-render data mới.
**Status**: ✅ Done.

---

## 🧪 Browser Test Scripts (Playwright) — luôn dùng để verify

> 4 scripts auto test dự án — login 1 lần, capture errors, run lại bao nhiêu lần cũng được.

### 🔥 LIVE CODING workflow (QUAN TRỌNG — ƯU TIÊN dùng)

**Vừa code vừa test localhost — không restart browser, không đợi deploy.**

1. **AUTO-START SERVER**: 3 script test (smoke / interactive / browser-session) tự dò port → nếu chưa listen sẽ `spawn python3 -m http.server 8080` từ project root (detached). **KHÔNG cần user pre-launch**. Helper: [`scripts/lib/ensure-local-server.js`](../scripts/lib/ensure-local-server.js).

2. **Khởi động persistent browser session 1 LẦN** (script tự spawn server nếu chưa có):

    ```bash
    mkfifo /tmp/n2store-session.fifo 2>/dev/null
    (tail -f /tmp/n2store-session.fifo) | node scripts/n2store-browser-session.js --user admin --pass admin@@ --base http://localhost:8080 &
    ```

3. **Sau mỗi `Edit` file → test NGAY qua FIFO (không restart browser)**:

    ```bash
    echo "nav http://localhost:8080/orders-report/main.html?t=$(date +%s)" > /tmp/n2store-session.fifo
    echo "feval window.someFunction()" > /tmp/n2store-session.fifo
    echo "search 0914495309" > /tmp/n2store-session.fifo
    echo "openchat" > /tmp/n2store-session.fifo
    echo "chatstate" > /tmp/n2store-session.fifo
    ```

4. **Cache busting**: JS đã `cache-control: no-cache` sẵn trong Playwright route. HTML cần `?t=$(date +%s)` query string khi `nav` lại.

5. **Stop khi xong**:
    - Browser session: `echo "quit" > /tmp/n2store-session.fifo`
    - Local server (detached, sống tiếp sau script): `pkill -f "http.server 8080"`

### 🛡️ Test ĐỤNG DATABASE — BẮT BUỘC tạo data test trước

**KHÔNG dùng dữ liệu thật khi test write operations.**

1. **Schema migration / DB write test** → pattern [`scripts/test-migration-social-tags.js`](../scripts/test-migration-social-tags.js):

    ```bash
    # CREATE local DB → schema cũ → INSERT fake → MIGRATE → verify → DROP DB
    node scripts/test-migration-social-tags.js [--copy-prod]
    ```

    Helper template: tạo `scripts/test-migration-<feature>.js` cho mọi DB schema change.

2. **Test customer/order browser flow** — ưu tiên test customer mặc định:
    - **Mặc định**: `Huỳnh Thành Đạt — 0123456788` (sẵn trong DB cho mọi flow: chat / sale / PBH / SMS)
    - Cần khách khác → SĐT giả `0900000000`, `0900000001`, ...
    - Mã đơn / code: prefix `TEST-` (vd `TEST-20260428-001`)
    - KHÔNG dùng SĐT/order/customer ID khách thật khác trong write tests.

3. **Cleanup sau test** (BẮT BUỘC):
    - Drop test DB
    - `DELETE WHERE code LIKE 'TEST-%'` cho test orders/customers
    - Verify cleanup không sót

4. **Read prod data**: OK với `--copy-prod` flag pg_dump 5-10 row mẫu (filter PII), chỉ READ.

5. **NEVER**: INSERT/UPDATE/DELETE prod DB trực tiếp từ script test. Không gửi SMS/notification vào SĐT khách thật.

### ⚡ Online test CHỈ khi cần verify deploy thật

- Sau `git push origin main`, **đợi GH Pages CI/CD hoàn thành (~2-4 phút)** → curl-verify path → mới run smoke với BASE mặc định.

### Quick start (sau commit lớn → verify 144 pages):

```bash
cd /Users/mac/Desktop/n2store
# Lưu baseline trước khi sửa (nếu cần diff sau)
cp downloads/n2store-session/smoke-report.json downloads/n2store-session/smoke-report-before.json

# 1) LOCALHOST — KHÔNG cần đợi deploy
python3 -m http.server 8080 &
node scripts/n2store-smoke-all-pages.js --user admin --pass admin@@ --concurrency 5 --per-page-secs 7 --base http://localhost:8080

# 2) ONLINE — chỉ khi cần verify deploy thật, đợi GH Pages CI/CD ~3 min
git push origin main
# Verify deploy: curl -s "https://nhijudyshop.github.io/n2store/<path>" | grep "<expected>"
node scripts/n2store-smoke-all-pages.js --user admin --pass admin@@ --concurrency 5 --per-page-secs 7

# Đọc summary
tail -3 /Users/mac/Desktop/n2store/downloads/n2store-session/smoke-report.md
```

### Persistent REPL (debug live không cần restart browser):

```bash
mkfifo /tmp/n2store-session.fifo
(tail -f /tmp/n2store-session.fifo) | node scripts/n2store-browser-session.js --user admin --pass admin@@ &
# Sau đó:
echo "search 0914495309" > /tmp/n2store-session.fifo
echo "openchat" > /tmp/n2store-session.fifo
echo "switchpage Nhi Judy House" > /tmp/n2store-session.fifo
echo "chatstate" > /tmp/n2store-session.fifo
echo "netlast 10" > /tmp/n2store-session.fifo
echo "filter subtag_CHUA_PHAN_HOI" > /tmp/n2store-session.fifo
echo "shot /tmp/debug.png" > /tmp/n2store-session.fifo
echo "feval window.currentChatPSID" > /tmp/n2store-session.fifo
echo "nav https://nhijudyshop.github.io/n2store/orders-report/main.html" > /tmp/n2store-session.fifo
echo "quit" > /tmp/n2store-session.fifo
```

**Commands**: `nav <url>`, `eval <js>`, `feval <js>`, `filter <key|null>`, `flag <key>`, `search <q>`, `openchat [sel]`, `switchpage <id|name>`, `chatstate`, `netlast [N]`, `clearnet`, `shot <path>`, `help`, `quit`.

### DB schema change → test trên local DB riêng (KHÔNG đụng prod):

```bash
brew services start postgresql@14   # nếu chưa chạy
node scripts/test-migration-social-tags.js [--copy-prod]
# → CREATE n2store_migration_test → schema cũ → INSERT FAIL → MIGRATE → INSERT OK → DROP DB
```

Pattern bắt buộc khi đổi schema: idempotent block + drop test DB sau khi xong.

### Interactive smoke 24 priority pages (sau UI/UX changes):

```bash
node scripts/n2store-interactive-smoke.js --user admin --pass admin@@ --per-page-secs 10
```

### Reports luôn ở `downloads/n2store-session/`:

- `FINAL-CLEAN-REPORT.md` — verdict gần nhất (144/144 clean, 0 app errors)
- `smoke-report.{json,md}` — smoke mới nhất + `smoke-report-before.json` baseline
- `interactive-smoke-report.{json,md}` — interactive
- `test-history.md` — lịch sử debug + customer chạm
- `PHASE-1-5-FINAL-REPORT.md` — chi tiết 6 nhóm bug G1-G6 đã fix

### Diff baseline vs current (after fix):

```bash
node -e "
const before = require('./downloads/n2store-session/smoke-report-before.json');
const after  = require('./downloads/n2store-session/smoke-report.json');
const score = r => (r.errors?.length||0)+(r.unhandled?.length||0);
const beforeM = new Map(before.map(r=>[r.path, score(r)]));
const afterM  = new Map(after.map(r=>[r.path, score(r)]));
let fixed=[], stillBroken=[], newBroken=[];
for (const [p,b] of beforeM) {
  const a = afterM.get(p)??0;
  if (b>0&&a===0) fixed.push(p);
  else if (b>0&&a>0) stillBroken.push(p+' ('+b+'→'+a+')');
}
for (const [p,a] of afterM) if (a>0&&!(beforeM.get(p)>0)) newBroken.push(p);
console.log('FIXED:',fixed); console.log('STILL:',stillBroken); console.log('NEW:',newBroken);
"
```

### Login mặc định

- `admin / admin@@` (n2store user). Browser session lưu cookies + localStorage tự động.
- Base URL: `https://nhijudyshop.github.io/n2store`

### Logic chi tiết từng script

Xem **memory entry** [reference_browser_test_scripts.md](../../../.claude/projects/-Users-mac-Desktop-n2store/memory/reference_browser_test_scripts.md) (auto-loaded) hoặc **CLAUDE.md** section "Browser Test Scripts (Playwright)".

---

## 2026-04-28

### [balance-history][feat] Tab Đã Duyệt — badge Nguồn taxonomy mới + filter Thu về/Khách CK/Cộng nợ ảo/Hoàn tiền

**Files**: `balance-history/index.html`, `balance-history/js/accountant.js`, `render.com/routes/v2/balance-history.js`
**Vấn đề**: Cột Nguồn dùng "Cộng nợ ảo" (DB action) thay vì "Thu về" (ticket type) — user muốn label theo nguồn thực tế. Filter dropdown chỉ có 3 option bh sub-method, thiếu phân loại wt.
**Badge update**: (a) wt VIRTUAL_CREDIT_ISSUE → "Thu về" (was "Cộng nợ ảo"). (b) wt VIRTUAL_CREDIT khác → "Cộng nợ ảo" giữ. (c) wt DEPOSIT/ORDER_CANCEL_REFUND → "Hoàn tiền" (đã có). (d) bh rows → 2-line badge "Khách CK" + sub-method (Nhập tay/Chọn KH/Tự động) — primary "Khách CK" nhất quán với customer-hub.
**Filter dropdown**: optgroup "Khách CK (Sepay)": khach_ck (all bh) + 3 sub-method giữ nguyên. optgroup "Ví nội bộ": thu_ve + cong_no_ao + hoan_tien. Backend xử lý 4 option mới ở cả bh-side + wt-side WHERE clauses.
**Live verify**: Browser test 28/04 (data có sẵn): 8 wt rows badge "Thu về"×2 + "Hoàn tiền"×2..., 20 bh rows badge "Khách CK" + sub Nhập tay/Tự động. Filter `thu_ve` → 5 wt only (Thu về). Filter `khach_ck` → 20 bh only. Filter `hoan_tien` → 3 wt only. Filter `cong_no_ao` → 0 (chưa có manual virtual credit). ✅
**Status**: ✅ Done — deploy + verify browser

### [balance-history][feat] Tab Đã Duyệt — bổ sung Hoàn Tiền Hủy Đơn + sửa cột Ghi chú dùng wt.note thay wt.source

**Files**: `render.com/routes/v2/balance-history.js`, `balance-history/js/accountant.js`
**Vấn đề**: (1) Tab "Đã Duyệt" thiếu các giao dịch "Hoàn Tiền Hủy Đơn Công Nợ" (DEPOSIT + source=ORDER_CANCEL_REFUND) — chỉ có VIRTUAL_CREDIT, WALLET_REFUND, RETURN_SHIPPER, RETURN_CLIENT trong wt UNION. (2) Cột Ghi chú render `wt.source` (vd 'VIRTUAL_CREDIT_ISSUE') thay vì `wt.note` (ghi chú thực user nhập, vd 'test_param_check').
**Backend fix**: (a) `/approved-today` UNION wt: thêm `(wt.type = 'DEPOSIT' AND wt.source = 'ORDER_CANCEL_REFUND')` vào whitelist. (b) Mirror filter cho count `approvedToday` cũng update tương tự. (c) SELECT wt rows: đổi `wt.source AS verification_note` → `COALESCE(NULLIF(TRIM(wt.note), ''), wt.source) AS verification_note` (ưu tiên ghi chú thực, fallback source). (d) Thêm `wt.source AS wt_source, wt.reference_id AS wt_reference_id` vào output để FE phân biệt sub-type.
**Frontend fix**: `getMatchMethodBadge`: nhận biết `wtType=='DEPOSIT' && wtSource=='ORDER_CANCEL_REFUND'` → label "Hoàn tiền". Title tooltip ghi rõ `DEPOSIT/ORDER_CANCEL_REFUND`.
**Live verify**: Browser test online sau Render deploy: tab Đã Duyệt 34 rows (tăng từ 31), 3 dòng Hoàn tiền (badge tím) cho NJD/2026/63945-63947 phone 0123456788 hiện đầy đủ. Note column: "Công Nợ Ảo Từ Thu Về (NJD/2026/63950) - thu ve giam gia 3 mon" thay vì "VIRTUAL_CREDIT_ISSUE" thô. Mirror count card cũng update đúng 34. ✅
**Status**: ✅ Done — deploy + verify browser test

### [customer-hub][tickets][feat] Hoàn Về + Khách Gửi — display label chuyên dụng + createdBy đầy đủ

**Files**: `customer-hub/js/modules/customer-profile.js`, `render.com/routes/v2/tickets.js`
**Mục tiêu**: Activity feed hiển thị Hoàn Về (RETURN_SHIPPER → VIRTUAL_CREDIT) và Khách Gửi (RETURN_CLIENT → DEPOSIT/RETURN_GOODS) với label chuyên dụng + đảm bảo `created_by` được propagate trong mọi flow tạo/hủy.
**Customer-hub display**: Thêm 2 nhánh detection trong activity render: (1) `isReturnShipper`: tx.type='VIRTUAL_CREDIT' và source='VIRTUAL_CREDIT_ISSUE' (hoặc note match) → "Hoàn Về Cấp Công Nợ Ảo #orderCode - {internal_note}" + "Duyệt bởi {createdBy}". (2) `isReturnClient`: tx.type='DEPOSIT' và source='RETURN_GOODS' (hoặc note match TV-/Hoàn tiền từ ticket) → "Hoàn Tiền Khách Gửi #orderCode (TV-...)" + "Hoàn bởi {createdBy}". Cả hai set `__suppressOperator=true` để tránh duplicate label.
**Backend tickets.js**: (a) `DELETE /:id` (delete ticket): nhận `performed_by` từ body/query, INSERT VIRTUAL_CANCEL wallet_transaction kèm `created_by=performedBy`. (b) `POST /:id/cancel` (cancel ticket): VIRTUAL_CANCEL insert thêm `created_by=performed_by`. Trước đây 2 INSERT này KHÔNG ghi `created_by` → khi hủy/xóa ticket Thu Về, dòng -tiền VIRTUAL_CANCEL không có operator info.
**Status**: ✅ Done — commit + push

### [balance-history][feat] DELETE /:id/manager-review — revert manager review (admin)

**File**: `render.com/routes/v2/balance-history.js`
**Vì sao**: Cần revert dữ liệu test (wt:7544 Lương Ngọc Thoa 340k) sau live verify Bug 1. Không có endpoint unmark trước đây — phải hardcode SQL hoặc gọi DELETE/admin endpoint.
**Endpoint**: `DELETE /api/v2/balance-history/:id/manager-review` — composite uid `bh:N` / `wt:N` / legacy bare int. wt branch: SET `manager_reviewed=FALSE, manager_review_note=NULL, reviewed_by=NULL, reviewed_at=NULL`. bh branch: thêm strip marker `[QL: ...]` khỏi `verification_note`.
**Live test**: DELETE wt:7544 → 200 success. GET approved-today: `manager_reviewed=false, reviewed_by=null, manager_review_note=null, reviewed_at=null` ✅
**Status**: ✅ Done

### [verify] Live test commit 78d09adc sau Render+GH Pages deploy

**Bug 1 — QL fallback**: (1) `accountant.js` deployed: `manager_review_note?.trim` confirmed. (2) Open balance-history Đã Duyệt tab: 4 wt rows visible (wt:7564 ✓, wt:7556 ✓, wt:7544 ✗, wt:7542 ✗). (3) wt:7564 + wt:7556 (đã reviewed từ trước) hiện QL note đầy đủ: "QL: Administrator - Live test wt:7564..." và "QL: Tâm - kiểm tra giao dịch test". (4) Click ✓ trên wt:7544 → modal mở → fill "Live test fix QL: bug1 verify wt:7544" → submit → row chuyển sang orange (acc-row-reviewed), hiện "QL: Administrator - Live test fix QL: ..." + label "ĐÃ KIỂM TRA". DB persisted: `manager_reviewed=true, reviewed_by='Administrator', manager_review_note='Live test fix QL: bug1 verify wt:7544', reviewed_at=2026-04-28T09:22:54Z`. ✅
**Bug 2 — Render endpoint accept created_by**: POST `/api/v2/tickets/TEST_NONEXISTENT/resolve-credit` với `{"phone":"0000000000","amount":1000,"created_by":"test_param_check"}` → success: `wt:7586` tạo với `verified_by="test_param_check"` (= `wallet_transactions.created_by`). Endpoint nhận `created_by` field đúng theo fix. ✅
**Test artifact**: wt:7586 + virtual_credit_id 157 trên phone 0000000000 — isolated test wallet, harmless, không cần cleanup.
**Status**: ✅ Bug 1 fully fixed live + Bug 2 endpoint deploy verified. Caller (issue-tracking script.js) sẽ áp dụng cho TX mới khi user resolve ticket Thu Về tiếp theo.

### [balance-history][bugfix] QL: ... đã kiểm tra không hiện cho wt rows sau khi save modal

**File**: `balance-history/js/accountant.js` (renderApprovedToday)
**Bug**: Bấm V trên wt row → modal điền note → submit OK (server lưu `manager_reviewed=true, reviewed_by, manager_review_note`) → đóng modal → row hiện "ĐÃ KIỂM TRA" nhưng KHÔNG có dòng "QL: <user> đã kiểm tra".
**Nguyên nhân**: Render code chỉ derive `managerNote` bằng regex `/\[QL:([^\]]*)\]/` trên `tx.verification_note`. Backend wt branch (line 1711-1719) chỉ UPDATE `manager_reviewed/manager_review_note/reviewed_by/reviewed_at` columns, KHÔNG embed `[QL: ...]` vào `verification_note` (vì wt rows không có verification_note column như bh). → `managerNote = ''` → block "QL: ..." không render.
**Fix**: Sau khi parse marker từ verification_note, fallback: `if (isReviewed && !managerNote) managerNote = tx.manager_review_note?.trim() | | 'Đã kiểm tra'`. Áp dụng cho cả bh và wt rows mà API trả về `manager_review_note` column trực tiếp.
**Status**: ✅ Done

### [tickets][customer-hub][bugfix] +tiền (Hoàn tiền/Khách CK/VIRTUAL_CREDIT) thiếu "Duyệt bởi" trong activity feed

**Files**: `render.com/routes/v2/tickets.js` (resolve, resolve-credit), `issue-tracking/js/script.js` (resolveTicketCredit caller), `customer-hub/js/modules/customer-profile.js` (operator label)
**Bug**: Activity feed customer profile hiển thị `+200K Công Nợ Ảo Từ Thu Về (NJD/...) - 14:08 28/04/2026` không có operator (Duyệt bởi/Tạo bởi/...).
**Root cause**: (a) `tickets.js` `/resolve` (compensation) và `/resolve-credit` không pass `performed_by`/`created_by` xuống `issueVirtualCredit()`/`processManualDeposit()` → `wallet_transactions.created_by` = NULL. (b) `issue-tracking/script.js` gọi `ApiService.resolveTicketCredit({...})` không gửi `created_by`. (c) `customer-hub` operator label logic không nhận diện `tx.type==='VIRTUAL_CREDIT'` là +tiền do user duyệt → fallback label "Bởi" thay vì "Duyệt bởi".
**Fix**: (1) `tickets.js`: `/resolve` truyền `performed_by` cho cả 2 nhánh `issueVirtualCredit` (param 7) và `processManualDeposit` (param 8); `/resolve-credit` accept `created_by` từ body, pass param 7. (2) `issue-tracking/script.js`: thêm `created_by: window.authManager?.getUserInfo()?.username | | ...`vào payload`resolveTicketCredit`. (3) `customer-profile.js`: thêm `isVirtualCredit = tx.type==='VIRTUAL_CREDIT'`vào label rule, OR với`isDeposit` → label = 'Duyệt bởi'.
**Note**: Chỉ áp dụng cho TX MỚI tạo sau deploy. Các tx cũ đã có `created_by=NULL` cần backfill SQL nếu user yêu cầu.
**Status**: ✅ Done

### [balance-history][feat] Đã Duyệt UNION wallet_transactions +tiền nội bộ (VIRTUAL_CREDIT/REFUND/RETURN)

**Files**: `render.com/migrations/069_wallet_tx_manager_review.sql` (mới), `render.com/routes/v2/balance-history.js`, `balance-history/js/accountant.js`, `scripts/test-migration-069-wallet-tx-review.js` (mới)
**Vì sao**: Tab "Đã Duyệt" hiện chỉ pull từ `balance_history` (sepay CK only). User yêu cầu thêm các +tiền nội bộ (VIRTUAL_CREDIT, WALLET_REFUND, RETURN_SHIPPER, RETURN_CLIENT) từ `wallet_transactions` để thấy đầy đủ luồng tiền vào ví.
**Backend**: (1) Migration 069: `ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS manager_reviewed/manager_review_note/reviewed_by/reviewed_at` + idempotent ALTER inline trong `/approved-today`. (2) `/approved-today`: sau khi fetch `bh` rows, fetch thêm wt rows (filter `amount>0 AND type IN (4 types) AND reference_type IS DISTINCT FROM 'balance_history'`), merge + sort by verified_at DESC, mỗi row gắn `src` (`bh`/`wt`) + `uid` (`bh:N`/`wt:N`). (3) `/accountant/stats`: thêm `walletApprovedTodayResult` count, cộng vào `approvedToday`. (4) `/:id/manager-review`: parse composite uid prefix → dispatch sang `wallet_transactions` UPDATE branch nếu `wt:`, giữ nguyên `balance_history` branch nếu `bh:` hoặc legacy id thuần.
**Frontend**: (1) `renderApprovedToday`: detect `tx.src==='wt'` → ẩn ⚠️ Điều chỉnh, render badge tím "Cộng nợ ảo/Hoàn ví/Thu về/Trả khách" thay match_method. (2) Nút ✓ data-id dùng composite `uid` (encoded). (3) State update sau review: match by `uid` thay vì `id` thuần. (4) Audit logger cũng dùng uid.
**Test migration**: `node scripts/test-migration-069-wallet-tx-review.js` — pattern CREATE local DB → schema cũ → UPDATE FAIL → MIGRATE → UPDATE OK → idempotent re-run → DROP DB. Tất cả PASS.
**Hotfix 5f53a0d5**: (a) TZ wt rows: thêm `(wt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')` — chuyển 07:21+07:00 (sai) → 14:21+07:00 (đúng giờ thực user tạo). (b) `openManagerReviewModal`: lookup match by `uid` thay vì `id` (composite `wt:N` không match số nguyên).
**Live test post-deploy**: (1) Stats `approvedToday`: 19 → **28** (+9 wt); (2) `/approved-today` 28 rows = bh:24 + wt:4 VIRTUAL_CREDIT có `src/uid`; (3) Frontend 4 rows `acc-row-wt`, badge tím "Cộng nợ ảo", action cell chỉ ✓; (4) **TZ verified**: wt verified_at = 14:21+07:00 đúng giờ thực; (5) Click ✓ trên `wt:7564` → modal mở; (6) Submit "Live test wt:7564 review" → POST `/wt:7564/manager-review` success, row hiện "ĐÃ KIỂM TRA"; (7) DB persisted: `manager_reviewed=true, reviewed_by=Administrator, reviewed_at=2026-04-28T08:38:43Z, manager_review_note="Live test wt:7564 review"`.
**Status**: ✅ Done — toàn bộ flow live trên prod hoạt động đúng

### [delivery-report][feat] Popover Hoạt động gần đây — eye cho mọi tx có ticket NJD/TV-, không chỉ ảnh CK

**File**: `delivery-report/js/delivery-report.js`
**Vì sao**: Trước đây eye trong popover chỉ render khi tx có `sepay_image_url` hoặc inline `[Ảnh GD: ...]`. Các +tiền khác (HOÀN, VIRTUAL_CREDIT, RETURN_SHIPPER, …) có reference NJD/TV- không có nút mắt → user không xem được phiếu liên quan.
**Thay đổi**: (1) Thêm `pickTxEvidence(tx)` priority: image → ticket TV- → ticket NJD-. (2) `eyeBtnHtmlForTx(tx)` dùng `pickTxEvidence` để render eye button với `data-eye-kind="image"` (mở `openLightbox`) hoặc `data-eye-kind="ticket"` (mở `window.showTicketHistoryViewer` qua `ensureTicketViewer()` lazy-loader). (3) `wirePopoverActions` route theo `data-eye-kind`.
**Status**: ✅ Done — pattern khớp với customer-hub TxEvidence

### [balance-history][revert] Bỏ eye buttons khỏi Đã Duyệt (revert commit 1657f88e)

**Files**: `balance-history/js/accountant.js`, `balance-history/css/accountant.css`
**Vì sao**: User yêu cầu bỏ — cột Ghi chú đã có thumbnail hover-zoom đủ rồi, nút mắt riêng dư thừa trong UI này.
**Thay đổi**: Xóa `eyeBtnHtml` render trong `renderApprovedToday()`, xóa event handler `.acc-eye-btn`, xóa function `showImageLightbox`, xóa CSS `.acc-eye-btn`, xóa `lucide.createIcons()` redundant.
**Status**: ✅ Done

### [login][fix] Localhost login — fallback Cloudflare Worker khi Render local (port 3000) không chạy

**File**: `index/login.js`
**Vì sao**: Khi chỉ chạy `python3 -m http.server 8080` để dev frontend (không chạy Render server), `login.js` hardcode trỏ `http://localhost:3000/api/users/login` → `ERR_CONNECTION_REFUSED` không login được.
**Thay đổi**: Mặc định localhost dùng Cloudflare Worker production (`chatomni-proxy.nhijudyshop.workers.dev/api/users`). Chỉ trỏ Render local nếu thêm `?api=local` vào URL hoặc `localStorage.setItem('login_api_local','1')`.
**Status**: ✅ Done — verified bằng persistent browser session login admin/admin@@ trên `http://localhost:8080`

### [balance-history][feat] Đã Duyệt — thêm nút mắt 👁 mở ảnh duyệt CK trong lightbox

**Files**: `balance-history/js/accountant.js`, `balance-history/css/accountant.css`, `balance-history/index.html`
**Vì sao**: Trong tab Kế Toán → Đã Duyệt, mỗi dòng đã có thumbnail ảnh CK ở cột Ghi chú với hover-zoom — nhưng cần 1 nút explicit ở cột Thao tác để giống pattern customer-hub Customer Profile (cột "Hoạt động gần đây" có nút mắt).
**Thay đổi**: (1) `renderApprovedToday()`: render `acc-eye-btn` (Lucide icon `eye`) trước nút ✓ và ⚠️ Điều chỉnh, chỉ hiện khi `tx.verification_image_url` tồn tại; gọi `lucide.createIcons()` sau render. (2) Thêm `showImageLightbox(url)` — overlay full-screen, click ngoài hoặc Esc đóng. (3) Event delegation trong `setupEventListeners()` bắt `.acc-eye-btn` click → `showImageLightbox`. (4) CSS `.acc-eye-btn` style xanh dương 28×26px. (5) Bump `accountant.css?v=20260428a` cache-bust.
**Status**: ✅ Done — sync với pattern customer-hub TxEvidence

### [delivery-report][feat] Hover ví: nút mắt xem ảnh CK (compressed) + nút Duyệt cho tx pending

**Files**: MODIFIED: [render.com/routes/image-proxy.js](../render.com/routes/image-proxy.js) — thêm query `?w=<px>&q=<1-100>`: nếu có thì sharp pipeline `rotate().resize({width,withoutEnlargement:true}).jpeg({quality,mozjpeg:true})` → JPEG compressed. Không có w/q thì giữ stream-through như cũ. MODIFIED: [render.com/routes/v2/customers.js](../render.com/routes/v2/customers.js) — `/quick-view`: SQL recent_transactions LEFT JOIN balance_history lấy `sepay_image_url` + thêm field `source, reference_type, reference_id`; thêm query mới `pending_transactions` (top 5 balance_history `verification_status='PENDING_VERIFICATION' AND wallet_processed=FALSE` linked phone). MODIFIED: [delivery-report/js/delivery-report.js](../delivery-report/js/delivery-report.js) — `renderCustomer()`: split block "Chờ duyệt" + "Hoạt động gần đây"; mỗi tx render `eyeBtnHtml(sepay_image_url)` + pending render thêm `approveBtnHtml(id,amount)`. Thêm `openLightbox(url)` → `${RENDER_URL}/api/image-proxy?url=...&w=900&q=70` (compressed ~10× nhỏ hơn original Firebase), spinner trong lúc load, fallback URL gốc nếu proxy fail. Thêm `approvePending(id, amt, btn)` → POST `/v2/balance-history/${id}/approve` body `{verified_by}`, optimistic UI, invalidate customer cache. `wirePopoverActions(phone)` bind handlers. Note legacy `[Ảnh GD: <url>]` vẫn nhận diện làm fallback eye source. MODIFIED: [delivery-report/css/delivery-report.css](../delivery-report/css/delivery-report.css) — `.dr-hp-tx.pending` (border-left vàng), `.dr-hp-tx-label.pending` (CHỜ DUYỆT badge cam), `.dr-hp-tx-actions` (flex gap), `.dr-hp-eye-btn` (icon transparent → tint xanh hover), `.dr-hp-approve-btn` (xanh lá), `.dr-hp-lightbox` (full-screen overlay + spinner + 90vw/90vh + zoom-out).
**Chi tiết**: **Trigger**: user "Hình 1 hoạt động gần đây thêm nút con mắt hình 2 và nút Duyệt hình 4" + "Hình 3 load full nên lâu, compress lại". **Compress**: Firebase Storage URL không transform native; sharp resize trong image-proxy có sẵn (sharp đã list package.json từ autofb). Ảnh receipt 4032×3024 ~3MB → `?w=900&q=70` ~120-180KB JPEG (>10× nhỏ). Cache 1 ngày `Cache-Control: public, max-age=86400`. **Eye trigger**: `sepay_image_url` (deposit CK JOIN balance_history) hoặc legacy `[Ảnh GD:]` trong note. **Duyệt trigger**: tx pending balance_history. API `/v2/balance-history/:id/approve` body `{verified_by}` — minimal (không upload ảnh mới, không đổi customer); full UI vẫn ở balance-history page. Auth username từ `authManager.getUserInfo().username` fallback `currentUser.displayName` fallback `'admin'`. Backend Render auto-deploy từ main; frontend graceful degrade khi API chưa trả `pending_transactions` (block "Chờ duyệt" ẩn).
**Status**: ✅ Code done. Syntax check pass cả 4 files. Sau Render deploy: smoke test eye → lightbox compressed; approve → balance_history APPROVED + wallet_tx row + cache invalidate.

### [delivery-report][bugfix] Hover bill: srcdoc bị truncate ở `"` đầu + resize false-hide

**Files**: MODIFIED: [delivery-report/js/delivery-report.js](../delivery-report/js/delivery-report.js) — `showBill()`: bỏ template `srcdoc="${escapeHtml(srcdoc)}"`, đổi sang `document.createElement('iframe')` + set `ifr.srcdoc=...` qua DOM property + `pop.appendChild(ifr)`. Bỏ luôn `window.addEventListener('resize')` hide handler.
**Chi tiết**: **Root cause #1 (truncated srcdoc)**: project's `escapeHtml(str)` dùng `div.textContent=str; return div.innerHTML` — chỉ escape `<>&` (textContent context không cần escape `"`). Khi inject `srcdoc="${escapeHtml(srcdoc)}"`, dấu `"` trong inner `<meta charset="utf-8">` không bị escape thành `&quot;` → browser parse attribute và **truncate srcdoc tại `"` đầu tiên** → iframe rỗng (verify: `srcdocLen: 41`, `bodyTxtLen: 0`). **Fix**: set `ifr.srcdoc` qua DOM property — browser engine handle escaping nội bộ, immune to attr-quote issue. **Root cause #2 (false-hide)**: `resize` handler ẩn popover → trigger ngầm khi Playwright fullPage screenshot tạm resize viewport (popover biến mất khỏi screenshot dù visible trong eval). Bỏ resize-hide; popover chỉ ẩn qua mouseleave hoặc Escape. **Verify localhost** (`python3 -m http.server 8765`, browser-session FIFO): bill iframe popH=624px, ifrW=318px, bodyTxtLen=16439 chars, render đầy đủ barcode + PHIẾU BÁN HÀNG + chi tiết SP + tổng tiền; customer popover hiển thị tên KH + 3 stat cards; page bodyWidth giữ 1440 (no style leak từ TPOS `html,body{width:80mm}`).
**Status**: ✅ Done. Bộ 3 commit: 67df4b15 (iframe sandbox + bỏ scroll-hide) → fix này (srcdoc property + bỏ resize-hide).

### [delivery-report][feat] Hover preview: invoice number → bill TPOS, customer cell → ví khách

**Files**: MODIFIED: [delivery-report/js/delivery-report.js](../delivery-report/js/delivery-report.js) — render row: thêm class `dr-hover-bill` + `data-id` + `data-number` cho cell `data-col="number"`; class `dr-hover-customer` cho cell `data-col="customer"`. Module `HoverPreview` mới (~210 LOC, IIFE) trước public API: tạo singleton popover, debounce show 350ms, hide 180ms, cache `Map<id,html>` cho bill và `Map<phone,data>` cho customer. `fetchBillHtml(id)` gọi `${WORKER_URL}/api/fastsaleorder/print1?ids=${id}` kèm Bearer token từ `getToken()`. `fetchCustomer(phone)` gọi `${RENDER_URL}/api/v2/customers/${phone}/quick-view`. `renderCustomer()` build wallet grid (số dư thật / nợ ảo / đơn+doanh thu) + pending alert + danh sách 5 giao dịch gần nhất với màu credit/debit. Mouseover/mouseout delegated trên `#drTableWrapper`, check `relatedTarget` để tránh flicker khi di chuyển trong cell hoặc vào popover. Khởi tạo qua `HoverPreview.init()` trong `initDeliveryReport()`. MODIFIED: [delivery-report/css/delivery-report.css](../delivery-report/css/delivery-report.css) — thêm block `.dr-hover-popover` (z-9999, max 460×70vh, shadow), `.dr-hp-header/title/sub`, `.dr-hp-loading/error/empty/spinner`, `.dr-hp-bill-body` (scroll, table reset), `.dr-hp-wallet-grid` (3 col stat cards), `.dr-hp-pending` (alert vàng), `.dr-hp-tx` (border-left + tint xanh/đỏ theo credit/debit), hover-cell highlight `dr-hover-bill:hover` (vàng) + `dr-hover-customer:hover` (tím).
**Chi tiết**: **Trigger**: user "Hình 1 hover vào số 'NJD/2026/63929' hiện bill phiếu bán hàng hình 2, hover vào tên khách hàng/sđt hiện hoạt động ví hình 3". **API tái dùng**: TPOS print1 (đã dùng ở `bill-service.js:1683`) cho HTML bill — cần Bearer; quick-view endpoint trả gọn `customer + wallet + recent_transactions[3-5] + pending_deposits` (đã verify 200 OK với `0948138675`). **UX**: 350ms hover delay tránh trigger oan khi lướt chuột; popover position prefer right-of-cell, fallback left khi tràn viewport; ESC/scroll/resize đều ẩn; user có thể di chuột vào popover để đọc/scroll mà không bị mất. Cache theo `id`/`phone` cho session — không refetch khi quay lại cùng dòng.
**Status**: ✅ Done. Syntax check pass. Endpoints smoke-tested: customer 200 (public), bill 401 không token (đúng mong đợi — token được attach lúc runtime qua `getToken()` từ tokenManager/localStorage).

## 2026-04-27

### [issue-tracking] Nút bút sửa → modal nhập ghi chú xử lý, hiển thị ngay dưới nút action

**Files**: MODIFIED: [issue-tracking/js/script.js](../issue-tracking/js/script.js) — `renderActionButtons()`: sau cụm action button, render thêm `<div.ticket-processing-note>` (background vàng nhạt, border-left cam) hiển thị `ticket.processingNote` ngay dưới nút Thanh toán/Nhận hàng. Inline escape HTML. `editTicket()`: bỏ alert "đang phát triển", gọi `openProcessingNoteModal(ticket)` — modal overlay với textarea, 3 nút (Lưu / Xóa ghi chú / Hủy). Save qua `ApiService.updateTicket(firebaseId, {processingNote, processingNoteUpdatedAt, processingNoteUpdatedBy})` + optimistic repaint qua `renderDashboard(activeTab)`.
**Chi tiết**: **Trigger**: user "khi bấm vào cây bút sửa hiện modal điền ghi chú để ghi nhớ tình trạng xử lý của phiếu" + "hiện ghi chú ngay dưới nút hành động (thanh toán, nhận hàng) luôn". **Field mới**: `processingNote` (string), `processingNoteUpdatedAt` (timestamp), `processingNoteUpdatedBy` (username) — append-only, không động endpoint TPOS/KPI. **UX**: note hiển thị inline trong cell HÀNH ĐỘNG → vừa nhìn ticket vừa thấy lý do/trạng thái nội bộ; click ✏️ → modal popup compact 480px. ESC/click overlay/nút Hủy đều đóng. Nút "Xóa ghi chú" có confirm. Firestore listener sẽ tự sync giữa các tab.
**Status**: ✅ Done.

### [balance-history][bug] Alert "Xem ngay" chờ duyệt >24h không filter — vẫn hiện toàn bộ giao dịch

**Files**: MODIFIED: [render.com/routes/v2/balance-history.js:529](../render.com/routes/v2/balance-history.js#L529) — `/verification-queue` nhận thêm query `overdueOnly`; thêm where `bh.created_at < NOW() - INTERVAL '24 hours'` (khớp logic count `pendingOverdue` ở `accountant/stats`); ORDER BY chuyển ASC khi overdueOnly để tx cũ nhất hiện đầu. MODIFIED: [balance-history/js/accountant.js](../balance-history/js/accountant.js) — `state.filters.pending.overdueOnly`; `loadPendingQueue` truyền query `overdueOnly=true`; thêm `viewOverdue()`/`clearOverdueFilter()`/`updateOverdueChip()`; `handleFilterChange` chuyển sang merge để giữ flag; export public API. MODIFIED: [balance-history/index.html:562](../balance-history/index.html#L562) — alert `onclick="…switchSubTab('pending')"` → `viewOverdue()`; thêm `#accOverdueChip` chip "Đang lọc: chỉ hiển thị giao dịch quá 24h" với nút bỏ lọc. MODIFIED: [balance-history/css/accountant.css](../balance-history/css/accountant.css) — `.acc-active-filter-chip` styles.
**Chi tiết**: **Bug user**: bấm "Xem ngay" trong alert "1 giao dịch chờ duyệt > 24h" vẫn hiển thị toàn bộ pending. **Root cause**: handler chỉ gọi `switchSubTab('pending')` không apply filter; thêm nữa `verification-queue` ORDER BY `transaction_date DESC` nên tx cũ nhất (overdue) nằm ở trang cuối → client-side filter không khả dụng do paginated. **Giải pháp**: thêm server filter `overdueOnly=true` (cùng logic `created_at < NOW()-24h` với count overdue), lật ASC để overdue lên trang 1; UI chip chủ động hiển thị trạng thái filter để user dễ dismiss.
**Status**: ✅ Done.

### [issue-tracking] Đổi ngưỡng cảnh báo ticket Thu về quá hạn: 20 → 10 ngày

**Files**: MODIFIED: [issue-tracking/index.html:53](../issue-tracking/index.html#L53) — banner text "quá 20 ngày" → "quá 10 ngày". MODIFIED: [issue-tracking/js/script.js:2278](../issue-tracking/js/script.js#L2278) — filter tab `overdue`: `OVERDUE_DAYS = 20` → `10`. MODIFIED: [issue-tracking/js/script.js:2696](../issue-tracking/js/script.js#L2696) — `checkOverdueTickets()`: `OVERDUE_DAYS = 20` → `10`. MODIFIED: [render.com/cron/scheduler.js:174-195](../render.com/cron/scheduler.js#L174-L195) — cron daily 9AM: `INTERVAL '20 days'` → `'10 days'`, title/description "20 ngày" → "10 ngày".
**Chi tiết**: **Trigger**: user "thông báo có ticket thu về quá 20 ngày nhận hàng sửa thành 10 ngày". **Scope**: cập nhật đồng bộ cả 3 nơi để banner UI, filter tab "Hủy/Quá hạn", và cron alert TICKET_OVERDUE đều dùng cùng ngưỡng 10 ngày — tránh lệch số đếm.
**Status**: ✅ Done.

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
