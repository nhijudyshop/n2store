# Dev Log — N2Store

> Cập nhật liên tục khi code. Mới nhất ở trên.
>
> **Cách tìm nhanh:** Ctrl+F tìm theo ngày `## 2026-`, theo module `[inbox]` `[chat]` `[extension]` `[orders]` `[worker]` `[render]`, hoặc theo status `IN PROGRESS`.

---

## 2026-05-06

### [orders][fix] Bulk PBH địa chỉ + bulk send bill nhanh hơn + refetch TPOS không stuck

**Files**: MODIFIED [orders-report/js/tab1/tab1-fast-sale.js](../orders-report/js/tab1/tab1-fast-sale.js), [orders-report/js/tab1/tab1-fast-sale-invoice-status.js](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js)

User: "1/ phần tạo phiếu hàng loạt công nợ và tự chỉnh địa chỉ của từng người đã đúng chưa, nó hay nhầm 1 người tính cho mấy người khác. 2/ phần gửi bill hàng loạt cho chạy đa nhiệm, song song, tăng tốc độ tối ưu. 3/ Đang bị stuck thông báo 'Đang lấy lại sản phẩm từ TPOS...' → lấy xong sửa lại dữ liệu bill để dùng về sau. + Nếu đã có đơn hàng → đảm bảo tất cả phần gửi bill qua messenger hay preview bill nếu sản phẩm bị trống sẽ request tpos lấy dữ liệu cho chính xác."

**Fix #3 — Stuck notif**: `notificationManager.info(msg, duration)` expects NUMBER. Trước: pass `{duration:2000}` → `{...} > 0` NaN → setTimeout không fire → stuck mãi. Fix: pass `15000` (ms), capture notif id, explicit `remove(id)` trên cả success/error path. Thêm success notif "Đã lấy N sản phẩm từ TPOS".

**Fix #3+ — Refetch tất cả bill paths**: Helper centralized `ensureOrderLinesForBill({orderId, invoiceData, order, initialLines, opts})` chain `initialLines → invoiceData.OrderLines → OrderStore.Details → TPOS GetDetails refetch → persist`. Apply 4 entry points: `sendBillFromMainTable` (showNotif), `_buildEnrichedFromInvoice` bulk (silent), `sendBillManually`, `printSuccessOrdersWithoutAutoSend`. Mỗi path persist `InvoiceStatusStore.set` + `OrderStore.update` (Details/TotalQuantity/TotalAmount) → future calls khỏi refetch.

**Fix #2 — Bulk send bill nhanh hơn**: Bump `BULK_BILL_CONCURRENCY` 4→8, `BULK_BILL_PER_PAGE_CONCURRENCY` 2→3. **Pre-warm refetch**: scan eligible trước worker start, parallel-refetch (cap 8) cho đơn rỗng — tránh worker block-đợi GetDetails tuần tự, giảm prep time ~15s → ~2s khi 30 đơn rỗng.

**Fix #1 — Bulk PBH địa chỉ per-row**: 3 root causes:

1. **Shared Partner ref** TPOS OData entity-sharing: 2 đơn cùng customer share Partner ref → edit row 0 mutate `Partner.Street` → corrupt row 1 (= bug "1 người tính cho mấy người khác"). Fix: `fetchFastSaleOrdersData` deep-clone `Partner/Ship_Receiver/Carrier` sau JSON parse.
2. **Unsaved address mất khi re-render** (gõ chưa bấm Lưu, remove đơn khác → input về value gốc). Fix: `saveFastSaleFormState` capture `addressInput.value` vào `order._userAddress` (khi khác `data-original`). `renderFastSaleOrderRow` ưu tiên `_userAddress`.
3. **Partner.Street không follow editedAddress submit**: `collectFastSaleData` dùng `order.Partner` raw → Street cũ. Fix: spread `order.Partner`, override `Street/FullAddress/ExtraAddress.Street = editedAddress`.

**Browser-tested localhost**: refetch flow → 1 fetch + notif info+success + `removed:[id]` (no stuck) + store updated "FX1". Deep-clone 2 orders share Partner ref → ref riêng (`samePartnerRef:false`), edit row 0 không leak row 1. ✅

### [orders][feat] Bill: refetch TPOS khi đơn rỗng + chip "Đang bật filter" cạnh nút bộ lọc

**Files**:

- MODIFIED [orders-report/js/tab1/tab1-fast-sale-invoice-status.js](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js)
- NEW [orders-report/js/tab1/tab1-active-filter-chip.js](../orders-report/js/tab1/tab1-active-filter-chip.js)
- MODIFIED [orders-report/tab1-orders.html](../orders-report/tab1-orders.html)

**1. Refetch sản phẩm từ TPOS khi đơn rỗng**:

User: "Nếu gửi bill mà đơn hàng bị rỗng thì request tpos lấy lại sản phẩm đơn hàng và cập nhật bill". Trước fix: `sendBillFromMainTable` thử `invoiceData.OrderLines` → fallback `OrderStore.Details` → nếu cả 2 rỗng → block với error toast (UX dở: user phải kiểm tra thủ công). Thêm last-resort refetch: `refetchOrderLinesFromTpos(orderId)` POST `/api/odata/SaleOnline_Order/ODataService.GetDetails` (cùng endpoint mà `fetchOrderDetailsForSale` dùng), map về shape `{ProductName, ProductUOMQty, PriceUnit, PriceTotal, Note}`. Khi refetch thành công → cập nhật `InvoiceStatusStore.set(orderId, {...inv, OrderLines:refetched}, order)` + `OrderStore.set(orderId, {...cached, Details:...})` để future sends không refetch nữa.

Áp dụng cho cả 2 path: single-send (`sendBillFromMainTable`) và bulk-send (`_buildEnrichedFromInvoice` chuyển thành async, await ở call site). Bulk-send thêm assertion: nếu sau refetch vẫn rỗng → throw "Đơn không có sản phẩm — đã thử lấy lại từ TPOS nhưng vẫn rỗng" để failed counter báo rõ.

**2. Chip "Đang bật filter" + nút clear all**:

User: "Nếu đang bật filter thì kế bên nút hiển thị bộ lọc sẽ hiển thị 'Đang bật filter' và có nút x để xóa tất cả filter đang bật". Tạo module IIFE mới [tab1-active-filter-chip.js](../orders-report/js/tab1/tab1-active-filter-chip.js):

- `getActiveFilterSummary()` quét: search input, 4 select (`conversationFilter`/`statusFilter`/`fulfillmentFilter`/`callHistoryFilter`), TAG selected/excluded, Tag XL active filter + flag filters, Excluded Tag XL, date toggle, StockStatusEngine. Trả `{count, labels[], hasAny}`.
- `_ensureChip()` inject `<span#activeFilterChip>` ngay sau `#toggleControlBarBtn` — pill amber gradient với dot animation, text "Đang bật N filter", × button. Tooltip hiển thị danh sách filter cụ thể (multi-line title attr).
- `clearAllFilters()` reset toàn bộ: `handleTableSearch('')` (vì `searchQuery` là module-scope không expose qua window), reset 4 dropdowns về `'all'` + dispatch change, xoá `localStorage.orderTableSelectedTags`/`orderTableExcludedTags`/`orderTableExcludedPtagXl`, gọi `_ptagSetFilter(null)` + clear `_activeFlagFilters`, uncheck `dateModeToggle`, reset `StockStatusEngine`, gọi `performTableSearch()` + `FilterPersistence.scheduleSave()`.
- `_wrapPerformTableSearch()` wrap `window.performTableSearch` 1 lần để mỗi filter change auto-refresh chip — không phải hook từng dropdown handler riêng.

Public API: `window.clearAllFilters`, `window.refreshActiveFilterChip`, `window.getActiveFilterSummary`.

**Browser-tested localhost**:

- Refetch flow: inject fake invoice với OrderLines=[] cho 1 order có Facebook_ASUserId, mock `tokenManager.authenticatedFetch` trả 2 product mocked. Trigger `sendBillFromMainTable(orderId)` → 1 fetch GetDetails → InvoiceStatusStore updated với 2 lines `["REFETCH-1", "REFETCH-2"]` → preview modal render đúng "PHIẾU BÁN HÀNG" với 275.000đ tổng. Notif "Đang lấy lại sản phẩm từ TPOS..." hiển thị. ✅
- Chip flow: search "192" + Tag XL "OKIE_CHO_DI_DON" → chip hiện "Đang bật 2 filter" + tooltip 2 dòng `Tìm: "192" / Tag XL` + filteredData=4. Click ×: chip ẩn, search input clear, ptag null, filteredData=856 (back to all). ✅

### [orders][fix] Phân chia STT non-admin: ID field mismatch + real-time bypass leak

**Files**: MODIFIED [orders-report/js/tab1/tab1-search.js](../orders-report/js/tab1/tab1-search.js), [orders-report/js/tab1/tab1-table.js](../orders-report/js/tab1/tab1-table.js)

User: "phần phân chia đơn cho users bị bug khi chọn filter, nó hiển thị đơn của người khác, admin coi được tất cả OK nhưng users được phân chia bị lỗi". 3 bugs giao thoa:

1. **Field mismatch**: filter check `auth?.id` nhưng login save `userId` (xem [index/login.js:89](../index/login.js#L89)) → `currentUserId === null` → ID match thất bại → fallback về displayName. Nếu displayName cũng lệch (NFC/NFD, whitespace, casing) → `userRange === null` → "user not in range → show all" → **leak toàn bộ đơn**.
2. **Unicode-fragile name match**: `r.name === currentDisplayName` exact-equal, "Hồng" NFC vs NFD khác bytes → fail.
3. **Real-time bypass**: `applyOrderMembershipFlip` (gọi từ TPOS-realtime SSE & processing-tag flip) chỉ check tag filter, KHÔNG check employee range → đơn ngoài range được insert thẳng vào `filteredData`/`displayedData`.

**Fix**:

- Centralize matching logic vào `_findCurrentUserEmployeeRange()` + `window.orderPassesEmployeeRangeFilter(order)` helper trong [tab1-search.js:198-263](../orders-report/js/tab1/tab1-search.js#L198).
- Thử nhiều ID candidates: `auth.userId || auth.uid || auth.id` ↔ `r.id || r.userId || r.uid`.
- Thử nhiều name candidates: `displayName`, `username`, `userType`, `userType.split('-')[0]` — tất cả đều normalize qua `_normalizeEmployeeName` (NFD strip diacritics + đ→d + collapse spaces + lowercase).
- `applyOrderMembershipFlip` ([tab1-table.js:506-514](../orders-report/js/tab1/tab1-table.js#L506)) ép `passesNow=false` nếu order ngoài employee range — chặn SSE & processing-tag-flip insert đơn ngoài phạm vi.

**Browser-tested localhost** (override `authManager.getAuthData` simulate non-admin Hồng, range 572-856, total 856 đơn):

- Bug-pre-fix simulation: với original logic, displayName mismatch → matched=null → `filteredCount=856` (toàn bộ leak).
- Sau fix: `matchedRange={Hồng,572-856}`, `filteredCount=285` (chính xác), `outsideLeak=0`.
- `applyOrderMembershipFlip(STT 499, passesNow=true)` → return `true` (handled) nhưng `filteredData` vẫn 285 (rejected silently — đúng).
- 5 unicode variants ("Hồng" NFD / trailing space / "HỒNG" / username only / userType only) đều match ranger Hồng.
- Admin (`isAdmin=true`) → filter no-op, vẫn 856/856.
- Unmatched non-admin (new user không có range) → vẫn show all 856 (preserve current design — không break user chưa được phân chia). ✅

### [delivery-report][ux] Bỏ ô giờ — auto 00:00 → 23:59:59.999

**Files**: MODIFIED [delivery-report/index.html](../delivery-report/index.html), [delivery-report/css/delivery-report.css](../delivery-report/css/delivery-report.css), [delivery-report/js/delivery-report.js](../delivery-report/js/delivery-report.js)

User: "bỏ giờ đi, cho tự động 00h ngày start đến 23h59 ngày end". Drop 2 `<input type="time">` (drFilterFromTime, drFilterToTime), `.dr-time-input` CSS, và `isValidTime()`. Date range giờ chỉ có `[date] → [date]`. `collectFilters` hardcode `T00:00`/`T23:59` (buildApiUrl pad ToDate thành `23:59:59.999`). `setDefaultDates`/`applyPreset` không còn touch time inputs. **Browser-tested**: yesterday preset → URL `FromDate=...T17:00:00.000Z & ToDate=...T16:59:59.999Z` (UTC), dataLen 122 chính xác. ✅

### [delivery-report][fix+ux] Filter khoảng ngày: chính xác hơn + redesign UI + filename theo range

**Files**:

- MODIFIED: [delivery-report/index.html](../delivery-report/index.html) — replace 2 dòng "Ngày bắt đầu/kết thúc" với 1 dòng "Khoảng ngày" gộp `[date]-[time]→[date]-[time]`. Thêm preset row trên cùng: Hôm nay / Hôm qua / 7 ngày qua / Tháng này / Tháng trước + hint "Đang lọc: dd/mm/yyyy → dd/mm/yyyy" (DD/MM/YYYY VN format). Time inputs đổi từ `<input type="text">` → `<input type="time">` (bỏ typo bug). Search button thêm `<i id="drBtnSearchIcon">` + `<span id="drBtnSearchText">` để toggle loading state.
- MODIFIED: [delivery-report/css/delivery-report.css](../delivery-report/css/delivery-report.css) — `.dr-preset-row` + `.dr-preset-btn` (pill style, hover/active blue), `.dr-daterange-wrap` + `.dr-date-input`/`.dr-time-input`, `.dr-daterange-sep` (`→` separator), `#drBtnSearch[data-loading="true"]` spinner animation. Responsive: mobile preset hint xuống dòng, date/time input shrink.
- MODIFIED: [delivery-report/js/delivery-report.js](../delivery-report/js/delivery-report.js):
    - **Boundary fix**: `buildApiUrl` set `ToDate` thành `23:59:59.999` (instead of `23:59:00.000`) → cứu lại 60s cuối ngày bị filter loại khỏi range. Wrap `new Date(...).toISOString()` trong `isNaN` guard.
    - **Time validation**: `collectFilters` validate `^\d{2}:\d{2}(:\d{2})?$`, invalid → fallback `00:00`/`23:59` + reflect cleaned value lại input. Trước kia `value="abc"` → `2026-05-05Tabc` → `new Date(...).toISOString()` throw → fetch fail silently giữ data cũ.
    - **Auto-swap**: nếu `fromDate > toDate` → swap (typo guard).
    - **Spam-click guard**: `setSearchButtonLoading()` toggle `disabled` + `dataset.loading` + text "Đang tải..."/"Tìm kiếm". `window.DeliveryReport.search` early-return nếu `isLoading=true`.
    - **Presets**: `applyPreset(today|yesterday|last7|thisMonth|lastMonth)` set date inputs + auto-trigger `search()`. Manual date change → `clearActivePreset()`.
    - **Hint**: `updatePresetHint()` show "Đang lọc: DD/MM/YYYY [→ DD/MM/YYYY]" để user thấy rõ range thực sự đang filter (tránh confusion MM/DD vs DD/MM của Chrome locale).
    - **Filename**: `makeFileName(label)` đọc `DeliveryReportState.filters` → single day → `LABEL_d_m.xlsx`, range cùng năm → `LABEL_d1_m1_den_d2_m2.xlsx`, khác năm → `LABEL_d1_m1_y1_den_d2_m2_y2.xlsx`.

**Chi tiết**: User: "filter khoảng ngày bị bug không chính xác, với tìm kiếm bấm 1 lần thôi không spam → làm lại giao diện phần filter, nhất là filter khoảng thời gian cho dễ dùng với tra soát → nếu chọn khoảng ngày thì các tên các file excel xuất ra sẽ ghi 2 ngày". **Browser-tested localhost**:

- Reproduced: `value="abc"` → filter giữ data cũ (1560 rows từ query trước) — confirmed silent fail.
- Verified fix: `setFilterFromTime("abc")` → auto-correct về `00:00`, fetch chạy đúng, dataLen=189 (May 4-5).
- Boundary: API URL captured `ToDate=2026-05-03T16:59:59.999Z` (was `16:59:00.000Z`).
- Spam guard: 4 click liên tục → button hiện "Đang tải..." disabled, chỉ 1 fetch fire.
- Presets: Hôm qua → 67 rows (May 4); Tháng này → 346 rows (May 3+4+5 = 157+67+122); 7 ngày qua → 1122 rows; Hôm nay → 122 rows.
- Filename: range Apr 26-May 6 → `TATCA_26_4_den_6_5.xlsx`; single day May 6 → `TATCA_6_5.xlsx`. ✅
- Tra soát mode 6 tabs vẫn render OK, không console error.

**Status**: ✅ Done.

---

## 2026-05-05

### [don-inbox][feat] Nút "Phiếu Soạn Hàng" clone 100% từ orders-report tab1

**Files**:

- NEW: [don-inbox/js/tab-social-packing-slip.js](../don-inbox/js/tab-social-packing-slip.js) — clone logic từ [orders-report/js/tab1/tab1-packing-slip.js](../orders-report/js/tab1/tab1-packing-slip.js), adapt data shape: `order.PartnerName/Telephone/PartnerAddress` + `OrderLine.ProductName/PriceUnit/ProductUOMQty` (tab1) → `order.customerName/phone/address` + `products.productName/sellingPrice/quantity` (don-inbox social order). Modal mở → render bảng products có checkbox "Chờ Hàng" + ô ghi chú/dòng → in qua hidden iframe (A4 layout) → close modal + clear bulk selection.
- MODIFIED: [don-inbox/index.html](../don-inbox/index.html) — thêm `<div id="packingSlipModal">` trước `</body>` với header gradient cam, table 5 cột, footer Hủy/In. Wire `tab-social-packing-slip.js`.
- MODIFIED: [don-inbox/js/tab-social-table.js](../don-inbox/js/tab-social-table.js) — `updateBulkActionBar()` thêm nút "Phiếu Soạn Hàng" (chỉ hiện khi `selectedCount === 1`).

**Chi tiết**: User: "tìm hiểu chức năng nút phiếu soạn hàng ở orders-report → làm cho don-inbox/index.html nút phiếu soạn hàng, chức năng giống 100%". **Browser-tested localhost** với order `SO-20260505-5173` (NV CẨM, 6 SP): bulk bar hiện nút PSH khi select 1 đơn → modal open render đúng customer + 6 product rows + total row → mock print → modal close + selection clear.

**Status**: ✅ Done.

### [orders-report][KPI] "Chạy đối soát" tích hợp refund excel 3 tháng — đơn đã hoàn loại khỏi KPI

**Files**: MODIFIED: [orders-report/js/tab-kpi-commission.js](../orders-report/js/tab-kpi-commission.js)

- NEW `KPICommission.fetchRefundedOrderCodes(3)`: POST `/api/FastSaleOrder/ExportFileRefund?TagIds=` với filter `Type=refund, DateInvoice 3 tháng, IsMergeCancel != true` → parse XLSX (sheet "Trả hàng", range:2) → trả `Set<invoiceNumber>` từ cột "Tham chiếu" (vd `NJD/2026/62621`). Auto load XLSX CDN. Token: dùng `window.tokenManager` nếu có, fallback fetch qua `/api/token` (giống `hanghoan/trahang.js`).
- MODIFIED `runReconciliation()`: thêm 3 bước trước reconcile loop:
    1. `loadInvoiceStatusData()` build `_invoiceCache: orderId → {Number, ShowState, ...}` (mapping SaleOnline UUID → invoice Number)
    2. `fetchRefundedOrderCodes(3)` → Set invoice Numbers đã hoàn
    3. Build `orderIdToRefunded` Map: lookup `_invoiceCache.get(orderId).Number` → check có trong refundedSet → mark `isRefunded=true`
- Reconcile loop: `isRefunded` → `hasDiscrepancy=true` type=refunded, msg "Đơn đã có trong refund excel — không tính KPI"
- Render: row refunded có `background:#fef2f2` + `text-decoration:line-through` + badge "↩ Đã hoàn (loại KPI)"
- Summary: `N đơn · K OK · X đã hoàn · Y sai lệch · refund excel có Z dòng (W mã đơn)`
- Expose `window.KPICommission = KPICommission` (const không tự attach window)

**Trigger user**: "Browser test refundlist → tìm hiểu request xuất excel 3 tháng → KPI - HOA HỒNG nút chạy đối soát refresh + so sánh excel → đơn không có trong file = tính KPI".

**Root cause mapping**: KPI orderCode = `SaleOnline_Order.Code` (vd `260404699`). Refund excel "Tham chiếu" = `FastSaleOrder.Number` (vd `NJD/2026/62621`). Cần `_invoiceCache` (Render API `/api/invoice-status/load`) làm cầu nối: SaleOnline UUID → invoice Number.

**E2E browser-tested live**:

- Refund excel POST 200, 1.1s, 40KB XLSX, 274 dòng, 268 mã unique
- Invoice cache: 7291 entries
- Click "Chạy đối soát" → 134 KPI orders → **133 OK · 1 đã hoàn (loại KPI) · 0 sai lệch khác**

**Status**: ✅ Done.

### [orders-report] Nickname: PUT cả SaleOnline_Order.Name + expose `window.allData` getter

**Files**:

- MODIFIED: [orders-report/js/tab1/tab1-customer-info.js](../orders-report/js/tab1/tab1-customer-info.js) — `_syncNicknameToTPOS` PUT cả **SaleOnline_Order.Name** cho mỗi đơn match phone (concurrency 3) sau khi PUT Partner. TPOS không cascade Partner.Name → Order.Name nên bảng list + edit-modal phải update từng order trực tiếp. Optimistic local update `allData[i].Name` + DOM trước, sync TPOS nền + refresh DOM lần 2 sau khi xong.
- MODIFIED: [orders-report/js/tab1/tab1-core.js](../orders-report/js/tab1/tab1-core.js) — expose `window.allData/filteredData/displayedData` qua `Object.defineProperty` getter (vì `let` top-level không tự attach vào window). Getter dynamic trả về reference hiện tại → các module khác (tab1-customer-info, ...) đọc fresh sau mỗi reassign.

**Trigger user**: "sao nó không sửa tên khách hàng ở cột khách hàng của bảng?" + "À phải sửa cả tên ở chỉnh sửa đơn hàng".

**Root cause**: tab1-customer-info.js đọc `window.allData` nhưng tab1-core.js declare `let allData = []` ở top-level (let KHÔNG attach window). Result: `matchedOrders = []` luôn, save flow không bao giờ chạy đúng. Bảng KHÔNG update vì `_refreshCustomerNameInTable` filter rỗng. Edit-modal cũ vẫn hiển thị tên gốc vì TPOS không cascade Partner.Name xuống SaleOnline_Order.Name.

**E2E real data verified**:

- Order Id thực tế = UUID string (vd `30150000-5d4d-0015-3e86-08de9872e286`)
- Save nickname → `tFastMs: 6ms` (optimistic)
- 8s sau verify: tableName + allData.Name + TPOS Order.Name + TPOS Partner.Name đều = `"Huỳnh Thành Đạt - REAL_E2E_..."`
- Edit-modal mở → input "Tên khách hàng" hiển thị đúng
- Cleanup empty nickname → tất cả về `"Huỳnh Thành Đạt"` verified

**Status**: ✅ Done.

### [orders-report] Nickname: TPOS Partner.Name là SOURCE OF TRUTH duy nhất — bỏ localStorage persist

**Files**:

- MODIFIED: [orders-report/js/tab1/tab1-customer-info.js](../orders-report/js/tab1/tab1-customer-info.js)
- MODIFIED: [orders-report/js/tab1/tab1-customer-prefs.js](../orders-report/js/tab1/tab1-customer-prefs.js) — `getNickname/setNickname/getDisplayName` thành no-op stubs (DEPRECATED), giữ chỉ để legacy callers không break. `isDoNotCall/setDoNotCall` vẫn local (TPOS không có field này).
- MODIFIED: [orders-report/js/tab1/tab1-table.js](../orders-report/js/tab1/tab1-table.js) — render row dùng `order.Name` thẳng, bỏ `getDisplayName` wrapper.

**Trigger user**: "sao bạn lại lưu tên vào local, tôi tưởng request tpos thì lấy tên render từ tpos luôn chứ" + "đặt biệt danh nó không sửa liền tên khách hàng ở cột khách hàng à? Sửa liền đi, nếu lỗi thì fallback thôi" + "test coi f5 có bị mất dữ liệu hay không".

**Logic mới** (TPOS-only):

1. **Đọc nickname** trong popup: parse suffix `" - X"` từ `allData[i].Name` (đã sync với TPOS sau order list refresh) — KHÔNG đọc CustomerPrefs.
2. **Save** flow:
    - Snapshot `matchedOrders.map(o => ({id, Name}))` để rollback
    - Optimistic: `allData[i].Name = "<original> - <newNick>"` + DOM cell update ngay (<5ms)
    - `_syncNicknameToTPOS` PUT Partner endpoint canonical (filter theo displayName để bỏ qua "Nguyễn Tâm" cùng SĐT)
    - **Fallback**: Nếu `res.fail>0 && res.ok===0` hoặc Promise reject → restore `allData[i].Name` từ snapshot + refresh DOM + toast error "Lỗi đồng bộ TPOS — đã hoàn tác biệt danh"
3. **Bảng render** (`tab1-table.js:1392`): `order.Name` thẳng — không qua wrapper, vì Name đã ở format đúng.

**E2E browser test live** (FIFO REPL với khách 0123456788):

- Mock allData 2 đơn → save nickname "VIP*E2E*..." → 4.5s sau verify: `allData[].Name` + DOM cell + TPOS Partner.Name **đồng nhất** = `"Huỳnh Thành Đạt - VIP_E2E_..."`
- F5 reload → set lại `allData[0].Name` từ TPOS GET → mở popup → input value = `"VIP_E2E_..."` (parse từ TPOS Name)
- localStorage `n2s_customer_prefs_v1[norm].nickname` = empty (không persist)
- Cleanup TPOS Partner về tên gốc verified.

**Status**: ✅ Done — TPOS là single source of truth, F5 không mất dữ liệu vì đọc từ TPOS.

### [balance-history][feat] Tab "Lịch Sử" — log toàn bộ Duyệt / Điều chỉnh / Kiểm tra với filter

**Files**:

- NEW: [balance-history/js/accountant-history.js](../balance-history/js/accountant-history.js) — module `AccountantHistoryModule` query Firestore `edit_history` (`module=='balance-history'`, sort client-side để tránh composite index). Map `actionType` → category (approve / adjust / verify). Filter: date range, action type, performer, search. Pagination 50/trang + page select. Stats summary 4 ô (Tổng + 3 loại).
- MODIFIED: [balance-history/index.html](../balance-history/index.html) — thêm tab "Lịch Sử" (cuối acc-sub-tabs) + panel với filter bar đầy đủ + table 6 cột (Thời gian / Loại / Mã GD / Người thực hiện / Mô tả / Nội dung thay đổi). Wire script `accountant-history.js?v=20260505b`.
- MODIFIED: [balance-history/js/accountant.js](../balance-history/js/accountant.js) — `switchSubTab('history')` → gọi `AccountantHistoryModule.load()`. Thêm audit log cho `confirmAdjustment` (actionType `transaction_adjust` — trước đây thiếu) + `bulkApprove` (actionType `accountant_entry_create` với `bulk:true`).
- MODIFIED: [balance-history/css/accountant.css](../balance-history/css/accountant.css) — style `.acc-history-stats`, `.acc-history-badge` (badge-approve / badge-adjust / badge-verify), `.diff-pill` / `.diff-meta` / `.diff-reason`, pagination `.acc-page-btn` / `.acc-page-select`.

**Chi tiết**: **User feedback**: "thêm 1 tab lịch sử bên phải Trừ Ví Thất Bại để lưu toàn bộ 3 thao tác Duyệt (Chờ Duyệt) + Điều chỉnh + Kiểm tra (Đã Duyệt). Ghi rõ ngày giờ, người thực hiện, loại thao tác, nội dung thay đổi, ghi chú. Đầy đủ filter date / loại / người thực hiện. Tự debug, test, commit push tới khi hết lỗi". **Source dữ liệu**: tận dụng `AuditLogger` (Firestore `edit_history`) đã có sẵn — `transaction_verify` (kiểm tra) đã log từ trước, `accountant_entry_create` (duyệt) đã log từ trước; bổ sung `transaction_adjust` (điều chỉnh) + `bulkApprove` để complete coverage. **Tránh composite index**: query với `where('module', '==', 'balance-history').limit(1000)` rồi sort client-side theo timestamp DESC. **Browser-tested live qua FIFO** trên localhost:8080: 661 records load, filter `action=verify` → 268 records (chỉ badge "Kiểm tra"), search "duyệt" → 393 records, filter `user=My` → 50 records (toàn người duyệt "My"), date preset "today" → 0 records (đúng vì chưa có log mới hôm nay).

**Status**: ✅ Done — committed & pushed.

### [orders-report] Nickname → TPOS Partner endpoint (canonical) + optimistic UI + filter theo tên

**Files**: MODIFIED: [orders-report/js/tab1/tab1-customer-info.js](../orders-report/js/tab1/tab1-customer-info.js) — refactor `_syncNicknameToTPOS`: bỏ flow loop từng `SaleOnline_Order` (22+ requests), chuyển sang Partner endpoint canonical:

1. GET `Partner/ODataService.GetViewV2?Name=<phone>&Type=Customer` (search SĐT)
2. **Filter Partners theo `displayName`** (strip suffix `" - X"` rồi so case-insensitive) — tránh đụng record khác cùng SĐT (vd "Nguyễn Tâm" share `0123456788` với "Huỳnh Thành Đạt")
3. Concurrency 3: GET `Partner({id})` → `Name = "<original> - <nickname>"` (idempotent strip suffix cũ) → PUT `Partner({id})`
4. Local: update `OrderStore` + `allData.Name` cho mọi đơn cùng SĐT (không phụ thuộc TPOS cascade xuống `SaleOnline_Order`)

**`_cipSaveNickname` đổi thành OPTIMISTIC**: `setNickname` + `_refreshCustomerNameInTable` chạy NGAY (UI update <5ms), TPOS sync chạy nền non-blocking với `.then/.catch`. Toast "Đã đặt biệt danh" hiện ngay; toast thứ 2 "Đã đồng bộ TPOS: N Partner" hiện khi sync xong. `displayName` lấy từ `popup.cip-title` (đã strip suffix) để filter Partner.

**Chi tiết**: **Trigger user**: "đặt biệt danh -> xác nhận -> nó cập nhật bảng lâu vậy?" + "check lại xem có request vào tpos không? Nếu chưa thì browser test vào tpos xem cách thực hiện đổi tên khách hàng -> ...customer/form?id=563966". **Browser-tested live qua FIFO REPL** với customer test "Huỳnh Thành Đạt" SĐT `0123456788`:

- SĐT có 3 Partner records (`568377`, `563966`, `562767`); 2 đầu là "Huỳnh Thành Đạt", record `562767` là "Nguyễn Tâm" (cùng SĐT khác tên)
- PUT `Partner({id})` body=full payload + `Name` mới → status `204 No Content` (TPOS chấp nhận)
- E2E `_cipSaveNickname` trả về 2ms (optimistic), 4.5s sau verify TPOS: 2 record "Huỳnh Thành Đạt" → "Huỳnh Thành Đạt - VIP*AUTO*...", record "Nguyễn Tâm" KHÔNG đụng vào (filter đúng)
- Cleanup test: clear nickname → tất cả về tên gốc trên TPOS

**Status**: ✅ Done — verified live trên TPOS prod (tên test customer 0123456788, đã restore sau test).

---

## 2026-05-04

### [issue-tracking] Search bỏ dấu (accent-insensitive) + Hard delete ticket TV-2026-00619

**Files**: MODIFIED: [issue-tracking/js/script.js](../issue-tracking/js/script.js) — thêm `stripAccent()` helper (NFD + strip combining marks U+0300–U+036F + đ→d/Đ→D + lower). Áp dụng vào: dashboard search input listener, type-tabs filter, date filter, history-search filter, + 2 chỗ filter so sánh trường (`renderDashboard`/`renderHistoryTab`) — strip dấu cả searchTerm và `t.customer`/`t.orderId`/`t.firebaseId` trước khi `.includes()`. Phone giữ nguyên (chỉ digits).

**Chi tiết**: **Trigger user**: "search cho tìm không dấu". Trước: gõ "diem" không match khách "Diễm Nguyễn", "dat" không match "Đạt", "huynh" không match "Huỳnh". Sau: tất cả match. Smoke test node: `diem→Diễm:true`, `dat→Đạt:true`, `huynh→Huỳnh:true`, phone passthrough OK, mã đơn `NJD/2026/63835` match `njd` OK. Syntax OK (`node --check`).

**Cùng commit**: Hard-delete ticket Render `TV-2026-00619` (id=752, đơn TPOS `63835`/`#432116`, COD 165.000đ, Diem Nguyen 0948138675) qua `DELETE /api/v2/tickets/TV-2026-00619?hard=true` — `success:true, virtualCreditCancelled:false`. Verify list theo phone → `total:0`.

**Status**: ✅ Done.

### [orders-report] Tăng cường UI bảng — debounce reapply badges/stats + content-visibility:auto + contain:layout

**Files**: MODIFIED: [orders-report/js/tab1/tab1-table.js](../orders-report/js/tab1/tab1-table.js) — surgical row replace path nay gọi `_scheduleBadgeReapply()` + `_scheduleStatsUpdate()` (mỗi cái lock 80ms timer) thay vì `setTimeout(reapply, 0)` + `updateStats()` ngay. WS burst 15 surgical replaces trong 100ms → chỉ 1 lần `newMessagesNotifier.reapply()` (scan toàn tbody) + 1 lần `updateStats()` thay vì 15 lần. MODIFIED: [orders-report/css/tab1-orders.css](../orders-report/css/tab1-orders.css) `.table tbody tr` — thêm `content-visibility: auto` + `contain-intrinsic-size: auto 52px` + `contain: layout style`.

**Chi tiết**: **Trigger user**: continue iteration "coi lại toàn bộ bảng render". **Diagnosed thêm 2 bottleneck UI bảng**:
(1) **Reapply badges fire 12 lần trong 15s WS idle** (1 lần / WS update) — mỗi lần `querySelectorAll('tr[data-psid]')` + iterate 51 rows + scan 17 badges. Sau khi áp surgical replace, mỗi replace lại trigger 1 reapply → còn nguyên overhead. Fix: debounce 80ms — burst 15 replace chỉ 1 reapply.
(2) **Hàng off-screen vẫn paint full**: bảng cao 4902px (~94 rows × 52px) trong viewport 580px → ~88% hàng off-screen nhưng browser vẫn paint hết → wasted GPU work khi scroll. Fix: `content-visibility: auto` cho `.table tbody tr` báo Chrome skip render off-screen rows; `contain-intrinsic-size: auto 52px` reserve placeholder height cho scrollbar chính xác; `contain: layout style` mỗi row độc lập — layout 1 row không reflow propagate.
**Test localhost**: rows count 51 unchanged, firstRow/lastRow heights normal (91/62px content-driven), tbodyHeight 4902px (reserve đúng), `contentVisibility:auto + contain:layout style + intrinsicSize:auto 52px` apply OK, `tableLayout:auto` giữ nguyên (column width vẫn auto-compute từ visible rows), 0 errors, layoutTriggerMs 0.5ms, 951 cells query 2ms. Visual: scroll smooth, không thấy hàng nào collapse.
**Status**: ✅ Done.

### [orders-report] Surgical row replace trong updateOrderInTable — diệt 12x re-render burst trong 15s WS idle

**Files**: MODIFIED: [orders-report/js/tab1/tab1-table.js](../orders-report/js/tab1/tab1-table.js) `updateOrderInTable()` — thêm surgical row replace path: nếu row đang trong DOM + không employee view + không sort active → build HTML mới qua `createRowHTML(order)`, swap `<tr>` qua `existingRow.replaceWith(newRow)` (1 row thay vì 50). Re-apply badges qua notifier sau swap. Update stats và return sớm — không fallthrough vào `schedulePerformTableSearch`. Fallback full re-render chỉ khi: row không trong DOM (filter ẩn), employee view, sort, hoặc createRowHTML throw.
**Chi tiết**: **Trigger user**: "browser test hoặc dùng cách để kiểm tra → coi lại toàn bộ bảng render coi có gì đang tác động vào ui bảng để cải thiện". **Diagnosed via instrumented wrappers**: trên prod 15s idle (no user action), counts cho thấy: `renderTable:12, performTableSearch:12, scheduleSearch:15, updateOrderInTable:15, applyMembershipFlip:0, reapplyBadges:12`. Tức là TPOS WS push 15 order updates → mỗi update gọi `schedulePerformTableSearch(150)` → debounce coalesce thành 12 lần `renderTable()` thực sự chạy → mỗi lần rebuild toàn bộ tbody.innerHTML cho 50 rows visible. Đây là root cause chính của "bảng nhảy/giật" mà user phàn nàn từ đầu. Trước đây fix "giật bảng realtime" (commit a5f0d12b) chỉ áp surgical insert cho `addOrderToTable()` (đơn MỚI) — không fix cho `updateOrderInTable()` (UPDATE đơn cũ — common hơn). DOM stats: 17810 elements / 51 rows = 350/row (1020 onclick handlers, 253 inline styles cells) — mỗi rebuild rất nặng. **Fix**: trong `updateOrderInTable`, sau khi update data structures, kiểm tra `existingRow = querySelector(tr[data-order-id=X])`. Nếu hợp lệ + UI mode đơn giản → `createRowHTML(order)` build single row HTML → tạo tbody tạm → `firstElementChild` → `existingRow.replaceWith(newRow)`. Browser chỉ reflow 1 row thay vì cả tbody. Re-apply badge sau swap (notifier MutationObserver tự bắt childList add). Stats update OK, return sớm để không fall-through vào schedulePerformTableSearch. **Test localhost**: không có WS update (no auth) nên `__renderCalls` = 0 sau 50s — verify cần prod. Logic walk OK: surgical path skip schedulePerformTableSearch, full path giữ nguyên cho fallback case. **Status**: ✅ Done (chờ verify prod sau deploy).

### [orders-report] Lazy load 4 inactive iframes của main.html (productAssignment/overview/pendingDelete/kpiCommission)

**Files**: MODIFIED: [orders-report/main.html](../orders-report/main.html) — 4 iframe non-default-active (`productAssignmentFrame`, `overviewFrame`, `pendingDeleteFrame`, `kpiCommissionFrame`) đổi từ `src="..."` sang `data-src="..." src="about:blank"`. `switchTab(tabName)` thêm helper `_hydrateLazyIframe(frameId)` (set src từ data-src lần đầu) và `_afterFrameLoad(frameId, fn)` (chờ load event nếu vừa hydrate, gọi luôn nếu đã loaded). Mỗi case của switchTab gọi cặp helper rồi mới `postMessage`/`loadData`/`KPICommission.init()`.
**Chi tiết**: **Trigger**: continuation của perf optimization loop. **Root cause**: trước đây 5 iframe (orders + 4 tab khác) đều `src="..."` ngay từ HTML → trình duyệt fetch + parse + execute scripts của TẤT CẢ 5 iframe song song khi page mở, dù user chỉ thấy tab `orders` mặc định. Tab-overview/tab-pending-delete/tab-kpi-commission/tab3-product-assignment đều load full ~250 resources / ~1MB scripts mỗi cái — tổng ~5MB JS + 1000+ requests song song trên initial load. **Fix**: chỉ tab `orders` (active mặc định) eager-load. 4 tab còn lại data-src + about:blank → không fetch gì cho tới khi user click tab đó. Pattern này đã được dùng trước đây cho `reportOnlineFrame` (line 671), giờ áp dụng đồng nhất cho 4 frame còn lại. Helper `_afterFrameLoad` đảm bảo `postMessage` chỉ gửi sau khi iframe loaded (tránh race với contentWindow chưa ready). **Test localhost**: top-frame DCL 1631ms → 1286ms (-345ms / -21%); Load 1881ms → 1365ms (-516ms / -27%); resources 50 → 47. Sau click tab Overview / Pending-delete: iframe hydrate đúng, src đổi từ about:blank sang URL gốc, readyState=complete, postMessage gửi sau load event. Switch lại Orders OK.
**Status**: ✅ Done.

### [orders-report] Fix badge "tin nhắn mới" còn hoài sau khi reply — chặn server stale + WS echo re-add (replied-window 24h)

**Files**: MODIFIED: [orders-report/js/chat/new-messages-notifier.js](../orders-report/js/chat/new-messages-notifier.js) — thêm `_recentlyRepliedAt: { [psid]: repliedAtMs }` persist localStorage `n2s_recently_replied_v1` (TTL 24h, auto-cleanup expired). Helper `_wasRecentlyReplied(psid, eventTimeMs)` so sánh `eventTimeMs <= repliedAt`. `clearPendingForCustomer(psid)` nay set `_recentlyRepliedAt[psid] = Date.now()` + persist. `onNewConversationEvent(event)` skip nếu `_wasRecentlyReplied(psid, event.eventTimeMs)`. `setPendingCustomers(customers)` skip server entry nếu `_wasRecentlyReplied(key, pc.timestamp)`. Realtime handlers `pages:new_message` / `pages:update_conversation` thêm `eventTimeMs` từ `msg.inserted_at` / `conv.updated_at`. **REVERT**: [orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js) — gỡ fix sai trước đó (clear khi mở modal — user clarify ý đồ là chỉ clear khi reply).
**Chi tiết**: **Trigger user**: "cột tin nhắn nó cứ có badge tin nhắn mới rất nhiều dù đã đọc" → sau làm rõ: "trước đây chỉ clear khi gửi reply là chính xác, nhưng nó hoạt động không đúng". **Root cause**: `clearPendingForCustomer(psid)` ĐÃ chạy đúng (verified live: before:1, after:0, badgeStillThere:false) khi user gửi reply. Nhưng badge quay lại vì 2 con đường: (1) **WS echo broadcast** — Pancake bắn `pages:update_conversation` ngay sau reply; handler chỉ check `unread > 0` → vẫn pass nếu Pancake server chưa kịp set `unread=0` → re-push `_pendingCustomers`. (2) **Server stale data sau reload/WS reconnect** — `_fetchOfflinePendingCustomers()` GET `/api/realtime/pending-customers` → server có thể chưa apply DELETE từ `/mark-replied` (race) → trả về psid đã reply → `setPendingCustomers()` merge → badge quay lại. **Fix**: dùng "recently replied window" 24h làm authoritative timestamp ở client side. `clearPendingForCustomer(X)` ghi `_recentlyRepliedAt[X] = now`. Mọi event/server entry cho psid X có `messageTime <= repliedAt` → silent skip (echo cũ trước reply). Nếu khách nhắn lại sau reply (`messageTime > repliedAt`) → vẫn allow re-add badge → đúng UX "khách nhắn mới = badge mới". 24h TTL đủ chặn server propagation lag, ngắn enough không tích localStorage. **Tại sao không phụ thuộc `_markRepliedOnServer`?**: hàm này đã được gọi sẵn ở reply path ([tab1-chat-messages.js:587](../orders-report/js/tab1/tab1-chat-messages.js#L587)) — vấn đề không phải mark-replied fail, mà là server timing + WS echo, giờ client tự handle bằng repliedAt window. **Test**: simulate `clearPendingForCustomer("X")` → set replied timestamp + clear badge. Sau đó simulate `onNewConversationEvent({ psid: "X", eventTimeMs: <past> })` → skip silently. Simulate `setPendingCustomers([{ psid: "X", timestamp: <past> }])` → skip silently. Event với `eventTimeMs: <future>` → re-add (khách nhắn mới sau reply).
**Status**: ✅ Done.

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
