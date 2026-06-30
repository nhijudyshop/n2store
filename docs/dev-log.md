# Dev Log

## 2026-06-30

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

## 2026-06-23

### [feat] web2: MoneyPrinterTurbo phụ đề tự động (karaoke) + Tạo video 1 chạm + LIVE stock keys

Tiếp tục phát triển theo MoneyPrinterTurbo — 2 mảnh còn lại + kích hoạt stock footage:

- **Phụ đề tự động (karaoke captions)** `video-render.js`: `_chunkCaption` (chia lời đọc thành cụm ngắn ≤7 từ / ngắt dấu câu) + `_drawCaption` (mỗi cụm hiện 1 lúc theo tiến độ cảnh `p`, chữ to in hoa + viền đậm + pop-in, kiểu TikTok/Reels, ~64% H). Bật qua `opts.captions`; text = `cur.caption || cur.narr`. `video-maker.js`: `state.captions` (mặc định bật), toggle `#vmCaptions`, `_refreshCaptions`/`_assignGlobalCaptions` (per-scene narr dùng trực tiếp, lời đọc chung chia đều theo cảnh) chạy sau `genNarration`. Per-scene narration đã canh đúng window cảnh nên chia theo `p` là khớp tốc độ nói (không cần word-timestamp). **Verified browser**: caption "ÁO THUN MỚI VỀ CỰC XINH" render đúng (trắng + viền, giữa, trên ảnh Pexels).
- **Tạo video 1 chạm** `video-maker.js` `oneClickVideo()`: chuỗi `topicGenerate()` → `genNarration()` (+phụ đề) → `exportVideo()` với trạng thái ①②③ + dừng sớm nếu bước fail. Nút `#vmOneClick` "Tạo video 1 chạm (chủ đề → xuất luôn)".
- **Stock keys LIVE**: user thêm `WEB2_PEXELS_API_KEY1..4` + `WEB2_PIXABAY_API_KEY1..4` vào secret → set Render web2-api env (8 key qua Render API) + deploy. Service đọc `WEB2_`-prefix (fix). **Verified prod**: `/api/web2-stock-media/status` → `configured:true` cả pexels+pixabay; search ảnh+video trả kết quả thật 9:16; modal browser search "fashion model" → 24 ảnh, click → thêm cảnh OK.
- Bump video-render.js + video-maker.js `?v=20260623cap`. Dùng codegraph (MCP active) để đọc render/timing model nhanh.

### [feat] web2: MoneyPrinterTurbo stock footage → Xưởng Video AI (Pexels/Pixabay)

Lấy cảm hứng MoneyPrinterTurbo (harry0703, MIT): topic→script→**stock footage**→TTS→phụ đề. video-maker đã có script (`Web2VideoAiScript`) + TTS + render; bổ sung mảnh còn thiếu = **kho ảnh/video bản quyền-free** chèn vào cảnh.

- **Backend** `render.com/services/web2-stock-media-service.js` + `routes/web2-stock-media.js`: search Pexels (ảnh + video) ưu tiên → Pixabay fallback. Key giấu server `PEXELS_API_KEY`/`PIXABAY_API_KEY` (xoay tua `*1..10`). Thiếu key → `{configured:false}` (frontend báo gọn, KHÔNG vỡ). Mount `/api/web2-stock-media` (worker auto-route web2- prefix → web2-api, KHÔNG cần sửa worker). READ-only.
- **Frontend** `web2/video-maker/js/video-stock.js` (`Web2VideoStock.open`): modal tìm kiếm (ảnh/video, phân trang, ratio theo trang). Ảnh → `VideoMakerPage.addSceneFromUrl` (CORS, không taint canvas → xuất được); video → fetch blob → `Web2VideoImport.load` (lồng tiếng). Nút "Kho ảnh/video miễn phí" cạnh "+ Thêm ảnh".
- **video-maker.js**: thêm `addSceneFromUrl(url, meta)` + export trên `VideoMakerPage`; wire nút `#vmStock`.
- **Test**: backend `node --check` + graceful no-key PASS. Live browser: video-maker load 0-error, `Web2VideoStock`+`addSceneFromUrl`+nút present, modal mở đúng (title/tab/search), search degrade gọn khi backend chưa deploy.
- **⚠ Để KÍCH HOẠT**: (1) thêm `PEXELS_API_KEY` (free tại pexels.com/api) vào env web2-api trên Render (placeholder đã thêm vào serect_dont_push.txt), (2) deploy lại web2-api. Pixabay optional fallback.

### [refactor] web2: Migrate products/variants/customer caches onto Web2SmartCache + primitive refinements

Tiếp nối smart-cache: migrate 3 cache còn lại sang primitive `Web2SmartCache` (API GIỮ NGUYÊN, test 3 tầng mỗi cái).

- **`web2-variants-cache.js`** (231→252 dòng): delegate fetch/SSE/dedup/persist sang primitive. Domain logic (findByValue/findByValueExact/getColorShortMap memo) giữ nguyên. Bonus IDB persist. Test: 12 integration assertion + live browser (108 variant trên trang products).
- **`web2-products-cache.js`** (486→323 dòng, **−163 dòng** IDB/SSE/SWR boilerplate): delegate sang primitive, giữ nguyên findByName ranking heuristic + findByNameVariant strict + `_upsertLocal/_removeLocal` (qua `_cache.set`, sync) + isReady + self-load API. Test: 13 integration assertion (ranking, variant-strict, upsert/remove sync) + live browser (4 SP, isReady, 0 error).
- **`web2-customer-store.js`** (vốn KHÔNG cache → thêm lớp cache): `getByPhone`/`getByFbId` qua `Web2SmartCache.createKeyed` (dedup + cache 30s + `swr:false` để KH freshness-sensitive: trong TTL→cache nhanh, stale/invalidate→AWAIT fetch tươi). Invalidate sau mỗi write (patch/upsert/harvest) + SSE `web2:customers` (global, lazy invalidate-all). batch/list/enrich vẫn fetch trực tiếp. Test: 11 integration (dedup/cache-hit/write-invalidate/SSE-invalidate) + live browser (KH thật + cache same-ref).
- **Primitive refinements** (`web2-smart-cache.js`):
    - Gỡ `skipEchoUntil` blanket-suppress (1.5s sau set) — **bug tiềm ẩn**: nuốt nhầm mutation tab/máy KHÁC đến ngay sau set() local. Giờ chỉ echo-suppress CHÍNH XÁC theo `data.by===clientId`.
    - `createKeyed`: thêm **global-topic mode** — `cfg.topic` (không `topicFor`) → subscribe 1 LẦN cho cả cache → lazy `invalidate-all` (mark stale), tránh refetch storm N-key khi 1 entity đổi. `topicFor(key)` vẫn per-key precise.
- Bump `?v=20260623sc`: products-cache (8 trang), variants-cache (3), customer-store (2).
- **Tổng test: 72 assertion** (primitive 24 + suppliers 12 + variants 12 + products 13 + customer 11) PASS + 3 live browser smoke 0-error.

### [feat] web2: Smart cache dùng chung (Web2SmartCache) — primitive SWR gom bộ máy cache + audit 8 GitHub repo

**Phần 2 (smart cache):** Audit 4 cache hiện có (Web2ProductsCache 486, Web2CustomerStore 426, Web2VariantsCache 231, Web2SuppliersCache 222 dòng) → đều TỰ CÀI LẶP cùng bộ máy: IDB persist + TTL + stale-while-revalidate + Web2SSE invalidate + echo-suppress (clientId) + debounced refresh + listeners + in-flight dedup (~1000 dòng gần trùng).

- **MỚI `web2/shared/web2-smart-cache.js`** (568 dòng, `window.Web2SmartCache`) — primitive 1 nguồn:
    - `create({ name, fetcher, topic, ttl, maxAge, persist, swr, debounceMs, applyEvent })` → cache 1 giá trị (list/object). API: `get/init/refresh/peek/set/mutate/invalidate/subscribe/isReady/isStale/dispose`.
    - `createKeyed({ name, fetcher(key), topicFor, ttl, maxEntries })` → cache theo key (entity-by-id) + **LRU eviction** + TTL.
    - SWR: trả cache cũ NGAY + revalidate nền; cold load thử IDB persist trước (instant) rồi fetch.
    - Dedup in-flight (10 caller → 1 fetch). `ttl<=0` = always-revalidate. `applyEvent(msg,cur)` patch tại chỗ từ payload SSE (khỏi refetch).
    - SSE: subscribe `topic` → echo-suppress (`data.by===clientId`) → debounce → revalidate. Self-load Web2IdbStore nếu thiếu.
    - Autoload qua `web2-sidebar.js` (mọi trang Web 2.0 có sẵn `Web2SmartCache`).
- **Adopt tham chiếu: `web2-suppliers-cache.js`** refactor delegate fetch/persist/SSE/dedup sang primitive — public API GIỮ NGUYÊN byte-for-byte (9 consumer: so-order, products, purchase-refund, supplier-debt, supplier-wallet, balance-history không đổi). **Bonus: NCC giờ có IDB persist** (sống qua reload/offline) — trước đây không có. Self-load primitive trong `init()` (async, luôn await → không lệ thuộc thứ tự load); thiếu primitive → fallback fetch trực tiếp (degraded, vẫn chạy).
- **Test 3 tầng**: (1) unit 24 assertion (dedup/SWR/set/mutate/invalidate/SSE+echo/applyEvent/persist round-trip/keyed LRU) PASS; (2) integration real-files 12 assertion (suppliers trên smart-cache: init/search dấu/ensure/persist/SSE refetch) PASS; (3) **live browser** supplier-debt: `Web2SmartCache` autoload OK + `Web2SuppliersCache.init()` trả 4 NCC thật từ backend, 0 error.
- **Migration path** (opt-in, chưa làm — load-bearing): products/variants/customer cache có thể migrate sau, mỗi cái shed ~150 dòng IDB+SSE+SWR boilerplate. Suppliers là adopter đầu (rủi ro thấp nhất).

**Phần 1 (audit 8 GitHub repo):** Đọc chi tiết 8 repo. Kết luận: 1 repo là app-feature (MoneyPrinterTurbo → enhance video-maker, MIT, cần Pexels key — chưa có trong secret), phần còn lại là dev-tooling/skill cho Claude Code (free-claude-code, ruflo, claude-mem, codegraph) hoặc skill/agent ĐÃ có sẵn trong môi trường (anthropics/skills, wshobson/agents, taste-skill). Chi tiết bảng audit trong câu trả lời + đề xuất codegraph (dev-tooling, optional) + MoneyPrinterTurbo (chờ Pexels key). KHÔNG ép nhồi dev-tooling vào app.

### [fix] web2: avatar DiceBear vỡ (transparent→400) + avatar vào trang Người dùng + đổi MK chính mình không bị logout + Zalo CORS

Audit/debug 3 lỗi user báo trên Web 2.0:

1. **Avatar DiceBear vỡ** (modal "Thông tin tài khoản" hiện chữ "avatar" thay vì ảnh). Gốc: `avatarUrl()` set `backgroundColor=transparent` khi nền trong suốt → DiceBear trả **HTTP 400** (`backgroundColor` chỉ chấp nhận HEX). Mọi avatar mặc định (bg=transparent) đều vỡ.
    - Fix `web2/shared/web2-user-profile.js`: OMIT `backgroundColor` khi transparent (mặc định DiceBear vốn trong suốt); chỉ set khi là HEX hợp lệ (`/^[0-9a-fA-F]{3,8}$/`). Verify browser: preview + 12 thumbnail load (naturalWidth=150, brokenThumbs=0).
2. **Avatar vào trang Người dùng** (`web2/users`): thêm cột avatar trong ô Username (`userAvatarUrl(u)` → Web2UserProfile.avatarUrl, fallback seed=username). Load `web2-user-profile.js` trực tiếp trong page (tránh sidebar inject async → table render avatar ngay). CSS `.u-user-cell`/`.u-avatar`. Verify: 14 user đều có avatar load OK, 0 console error.
3. **"Đổi mật khẩu admin lưu nhưng không đổi"**: backend ĐÚNG (test throwaway user: đổi P1→P2, login P2 OK, P1 bị reject). Thực chất khi đổi MK CHÍNH MÌNH, route xoá hết session (kể cả token đang dùng) → request kế 401 → bị "đá" ra login → tưởng "không đổi". Fix `users-app.js`: nếu `isSelf` → `_reauthSelf()` re-login ngay bằng MK mới giữ phiên sống + cập nhật localStorage; SSE handler bỏ qua auto-reload cho self change-password (cờ `_selfPwdChangeAt`).
4. **Zalo CORS**: trang `web2/zalo` gửi header `x-web2-zalo-owner` (per-máy) → preflight chặn "is not allowed by Access-Control-Allow-Headers". Thêm `X-Web2-Zalo-Owner` vào `shared/universal/cors-headers.js` (worker, cả `buildCorsHeaders` + `CORS_HEADERS`) + `render.com/server.js` allowedHeaders. Cần deploy worker (wrangler) + render.

Bump `web2-user-profile.js` inject → `20260623b`; bulk bump `web2-sidebar.js?v=20260623up1→up2` (46 trang); users.css/js → `20260623up2`.

### [feat] Trợ lý AI — Pollinations xoay tua nhiều token Seed (bỏ giới hạn anonymous 1 req/15s)

User báo Pollinations free (anonymous ~1 req/15s + watermark) hay bị giới hạn → thêm nhiều token. Pollinations giờ có auth (auth.pollinations.ai): Seed (free) ~1 req/5s, Bearer token PHẢI ở server.

- `web2-ai-image-service.js`: `_pollinationsTokens()` đọc env `WEB2_POLLINATIONS_TOKEN{1..10}` (+legacy đơn) — mirror `_cfAccounts()`. `_pollinations(prompt,opts)` giờ async:
    - **Có token** → proxy server-side `fetch(url, {Authorization: Bearer <token xoay>})`, round-robin `_polRr` + cooldown 60s (401/403/429), trả **dataUrl** (token KHÔNG lộ browser — docs cấm Bearer ở frontend). Hết token khoẻ → fallback URL anonymous.
    - **Không token** → trả `{url}` như cũ + `&referrer=` (`WEB2_POLLINATIONS_REFERRER` env, default `nhijudy.store`) — nâng tier nhẹ, không bí mật.
- `status()`: label `Pollinations (N token)` + field `tokens` cho admin keys tab.
- User đã thêm 5 token vào `serect_dont_push.txt` (`WEB2_POLLINATIONS_TOKEN1..5`) → set Render env web2-api để kích hoạt.
- Verify: `node --check` PASS + smoke (no-token→URL+referrer, env→status tokens=N) PASS. Frontend `ai-image.js` đã support cả `url` lẫn `dataUrl` (renderCard) → không cần đổi frontend.

### [feat] web2: footer sidebar bấm xem hồ sơ user + đổi avatar DiceBear (self-service)

Footer sidebar (avatar + tên + @user + role) giờ bấm được → mở modal "Thông tin tài khoản". Avatar đổi qua **DiceBear** (HTTP API 10.x, SVG, `<img>`).

- **Shared mới** `web2/shared/web2-user-profile.js` (`Web2UserProfile`): `avatarUrl(cfg)` build URL DiceBear 1 nguồn (BASE `api.dicebear.com/10.x`) + `open()` modal (preview lớn, picker 12 style KHÔNG cần ghi nguồn [CC0 + Pablo Stanley free-commercial], seed + 🎲 ngẫu nhiên, 7 màu nền + trong suốt, info Email/SĐT/role/đăng nhập gần nhất, "Khôi phục chữ cái"). Inject qua sidebar (mọi trang).
- **Lưu CẤU HÌNH** `{style,seed,bg}` (JSON, KHÔNG lưu URL → đổi version 1 chỗ). Seed mặc định = username.
- **Backend** `web2-users.js`: cột `avatar TEXT` + `mapRow.avatar` + **self-service** `PATCH /me/avatar` (requireWeb2Auth, chỉ `req.web2User.id` → không sửa được người khác). Login + `/me` trả `avatar`.
- **Sidebar**: footer render `<img>` avatar (fallback chữ cái), `.web2-user-header` clickable (role=button + keyboard). Sau khi lưu → `Web2Auth.storeLogin` cập nhật localStorage + `Web2Sidebar.renderUserFooter` refresh ngay.
- Bump `web2-sidebar.js/.css?v=20260623up1` toàn bộ 48 trang. ⚠ Cần Render deploy (cột avatar + endpoint).
- License: chỉ dùng style không cần attribution (CC0 + avataaars/bottts free-commercial) → an toàn tool nội bộ.

### [security] web2/login: bỏ dòng lộ tài khoản mặc định admin/admin@@ (đã đổi mật khẩu)

Trang đăng nhập Web 2.0 (`web2/login/index.html`) có dòng "Tài khoản mặc định: admin / admin@@" — sau khi user đổi mật khẩu thì đây là lộ credential không cần thiết. Gỡ block `.login-foot`.

### [feat] Zalo PER-MÁY (owner-scoped): mỗi máy chỉ thấy/dùng account chat.zalo.me của máy đó

User: máy nào đăng nhập chat.zalo.me thì máy đó dùng account đó, KHÔNG share máy khác (local theo chat.zalo.me). Sau research (zca-js Node-only, extension polyfill rủi ro cao) + plan-mode duyệt: chọn **Option B owner-scoped** (server giữ socket RAM nhưng gắn chủ sở hữu = máy; máy khác không đọc/gửi được) + **tin KH 1-1 cũng per-máy** (chấp nhận phân mảnh). Xây trên nền no-persist/no-QR đợt trước.

- **Machine id**: UUID per-browser `localStorage['web2_zalo_owner']` (helper `Web2ZaloOwner`) → header `x-web2-zalo-owner` trên MỌI request Zalo (thêm vào `_authHeaders` của cả `web2-zalo-api.js` + `web2-zalo.js` cross-page).
- **Schema**: cột `owner_id` + index trên `web2_zalo_accounts` (conv/msg scope qua account_key).
- **Routes**: `_owner(req)` + cache `_ownerByAccount`; stamp owner lúc `/login-cookie` + `POST /accounts`; scope reads `/status` `/accounts` `/conversations` (personal theo owner, OA chung) + guard `/conversations/:id/messages` (id serial đoán được); customer-1-1 `conversation/ensure`+`:phone` dùng `_ownerConnectedAccount` (máy chưa login → 400 `needLogin`); SSE `_notify` → `_ownerTopic` (`web2:zalo:<owner>:accounts/messages/thread`). GỠ toàn bộ máy móc primary (`_getPrimaryKey/_loadPrimaryKey/_primaryKey/isPrimary callback/route /primary`). zca: bỏ gate `isPrimary` ở watchdog/reconnect (giữ MỌI phiên RAM).
- **Frontend** (bump `?v=20260623own`): SSE subscribe owner topic + global (OA/reset); GỠ nút "Đặt làm chính" + badge "TK chính" + `setPrimary` + CSS; hint "Tài khoản của MÁY NÀY — máy khác không thấy"; customer-chat empty-state `needLogin` → link chat.zalo.me + Đăng nhập Zalo.

Verified local: owner UUID minted, header `x-web2-zalo-owner` gửi, 0 nút QR/Kết-nối-lại/Đặt-làm-chính, 0 console error, node -c toàn bộ pass. Cô lập per-máy thật + customer-1-1 verify bằng curl 2 owner header SAU deploy. Account cũ thành vô chủ (ẩn) — mỗi máy tự "Thêm tài khoản". (web2 beta.)

### [tweak] cham-cong: dung sai mặc định 5→6 phút (8h06 / 19h54 vẫn đúng giờ)

User muốn nới dung sai lên 6'. Đổi mặc định 5→6 ở: backend column DEFAULT + manual create + `cfgFor` + `calcDay` + employees row + hint. Migration idempotent trong `ensureTables`: `ALTER COLUMN grace_minutes SET DEFAULT 6` + `UPDATE ... SET 6 WHERE grace_minutes = 5` (bump các dòng còn ở default cũ; beta nên retire giá trị 5, muốn chặt hơn đặt 0-5 ở UI sau). Bump js salary i/employees j/app k. ⚠ Cần Render deploy để migrate dòng cũ; frontend default 6 đã có hiệu lực ngay sau hard reload.

### [feat] cham-cong: lương theo THÁNG (cố định) + dung sai ±phút vào/ra

- **Lương tháng** (cố định): tab Nhân viên thêm cột **"Loại lương" (Ngày/Tháng)**. Chọn "Tháng" → ô Lương = lương/tháng, `calcMonth` đặt `luongChinh = số tiền nhập` (KHÔNG nhân số ngày công); ngày nghỉ trừ qua "Giảm trừ" thủ công. NV thủ công (MANUAL-\*) mặc định = monthly. workedDays vẫn đếm để hiển thị.
- **Dung sai ±phút**: cột **"Dung sai (phút)"** (mặc định 5) per-NV. `calcDay` kéo check-in trễ ≤ grace về mốc bắt đầu (không muộn, không trừ) + về sớm ≤ grace coi đủ ca (thay hằng số NEAR_END_ROUND_MIN=10 cũ). VD ca 08:00 vào 08:05 / ca 20:00 ra 19:55 → đúng giờ.
- Backend `web2-attendance.js`: cột `salary_type VARCHAR(10) DEFAULT 'daily'` + `grace_minutes INT DEFAULT 5` (ALTER idempotent); PATCH + POST manual nhận 2 field (manual default monthly).
- `cfgFor` (app.js) + payroll detail modal (hiện "Lương tháng cố định (đi làm N ngày)"). Bump js salary g/payroll i/employees i/app j. ⚠ Cần Render deploy (cột mới).

### [fix] web2 money-flow audit — 3 bug verify (cost-cap hoàn NCC CRITICAL + cart race HIGH + SSE web2:products HIGH)

Tiếp vòng audit money-flow (user duyệt fix 3 item):

- 🔴 **CRITICAL — cost-cap hoàn NCC vô hiệu ở UI chính**: quick/bulk refund gửi `products` keyed by CODE (KHÔNG `rowReturns`) → nhánh cost-cap `purchase-refund.js` (chỉ chạy khi có `rowReturns`) bị bỏ qua. Tệ hơn: `price` client gửi = giá BÁN retail (`matched.price`) → ledger ví NCC credit theo retail thay vì COST nhập → **mint ví NCC** (hoàn NCC phải theo giá nhập). FIX server-authoritative: thêm `loadSoOrderCostByCodeMap(client)` (`lib/web2-so-order-qty.js`) map `code→MAX costVnd` từ so-order (join web2_products qua name+variant chuẩn-hoá MIRROR client `_normalize`); nhánh `else` (no-rowReturns) cap `amount ≤ Σ(qty×cost)` khi MỌI line tra được cost, fail-open nếu thiếu (so-order wipe / SP chưa match) → không block refund hợp lệ. Mock-test logic PASS (MAX cost, diacritic/case, partial_received, FX rate, draft excluded).
- 🟠 **HIGH — cart race (lost update)**: `v2/cart.js` `/add`, `/:code/remove`, PATCH qty đọc `products` JSONB rồi UPDATE rời nhau → 2 tab/máy thao tác đồng thời nuốt nhau. FIX: helper `_withDraftLock(pool, code, fn)` = `SELECT … FOR UPDATE` trong 1 transaction; 3 handler chạy read-modify-write TRONG lock; `_notify*`/SSE/log dời ra SAU commit (anti-phantom). `/clear` (DELETE thuần) không cần lock.
- 🟠 **HIGH — refund không notify `web2:products`**: quick-refund trừ kho nhưng chỉ `_notify('web2:purchase-refund')` → trang Kho SP + Ví NCC (debt=Σqty×cost, subscribe `web2:products`) stale (frontend workaround refresh tay). FIX: thêm `_notifyProducts(req)` broadcast `web2:products` post-commit quick-refund. (`/approve`+`/cancel-approve` đã RETIRED 410 → quick-refund là đường trừ kho DUY NHẤT.)
- Verify: `node --check` 3 file PASS + mock-test cost-map PASS. Backend-only (không bump frontend). ⚠ Frontend comment "quick-refund KHÔNG notify web2:products" giờ stale (refresh tay còn lại vô hại) — follow-up nhỏ.

### [refactor] Zalo: BỎ lưu phiên trên server — chỉ đăng nhập qua chat.zalo.me (browser), BỎ QR

User: bỏ hết chức năng lưu Zalo lên server, chạy bằng phiên chat.zalo.me trên trình duyệt máy, hướng dẫn đăng nhập chat.zalo.me rồi ấn đăng nhập, bỏ QR. Audit + plan mode → user duyệt (realtime giữ ở server RAM, KHÔNG lưu DB; xoá sạch phiên DB cũ).

**Backend** (`render.com`):

- `web2-zalo-zca.js`: `_afterLogin` KHÔNG gọi persist cookie (`persistSession(null)`) — GIỮ `s.creds` trong RAM cho reconnect trong uptime. GỠ `startQrLogin`/`getQr`/`QR_TTL_MS`/`restoreAll` + exports. Bỏ import `secretCrypto` (hết dùng).
- `web2-zalo.js` (routes): `_saveSession` ghi `session=NULL` (chỉ cập nhật uid/tên/avatar/status). GỠ route `/login-qr`, `/qr`, `/reconnect`, hàm `restoreSessions` + `_connectAccount`. `_loadPrimaryKey` chỉ auto-promote CỜ is_primary (không tự kết nối). Route `/primary` bỏ auto-connect. `ensureSchema` nạp `_loadPrimaryKey` lúc boot. Bỏ import `secretCrypto`.
- `web2-zalo-schema.js`: boot **wipe** `UPDATE web2_zalo_accounts SET session=NULL` (idempotent, giữ cột). `server.js`: bỏ gọi `restoreSessions()` (chỉ `ensureSchema`).
- GIỮ: `/login-cookie` (đăng nhập DUY NHẤT qua phiên trình duyệt + extension), listener realtime + persist tin + SSE, watchdog reconnect trong RAM (primary-gated), graceful `stopZalo`.

**Frontend** (`web2/zalo/`, bump `?v=20260623noqr`): GỠ modal QR + nút "Tạo & quét QR" + nút "Kết nối lại" + `startQr`/`pollQr`/`openQrModal`/`closeQrModal`; `ZaloApi` bỏ `loginQr`/`qr`/`reconnect`; `STATUS_LABEL` bỏ qr-states + `state.qr`; CSS bỏ `.wz-qr-*`. GIỮ "Đăng nhập Zalo" (cookie) + `autoRenewZalo`. THÊM hint `wz-login-guide` "Đăng nhập chat.zalo.me trên trình duyệt máy này → rồi bấm Đăng nhập Zalo (máy chủ không lưu mật khẩu/phiên)". Sửa text kick-warn/extension-missing/choice-card bỏ nhắc QR.

Verified browser-test: 0 nút QR, 0 "Kết nối lại", 1 "Đăng nhập Zalo", login-guide hiện, `ZaloApi.loginQr/reconnect=undefined`, 0 console error. node -c toàn bộ pass. Deploy: server restart → mọi TK disconnected (không boot-restore), user "Đăng nhập Zalo" từ trình duyệt để nối.

### [fix] SECURITY web2: gate 11 route mutation native-orders + BIGINT Number() trong balance-history (audit money-flow)

Audit đối kháng money-flow Web 2.0 (37 agent, 20/31 finding verify isReal) phát hiện **lỗ hổng auth LIVE**: 11 route mutation `render.com/routes/native-orders.js` KHÔNG có middleware auth, trong khi sibling `fast-sale-orders.js` đã gate `requireWeb2AuthSoft` HẾT — mà `WEB2_AUTH_ENFORCE=1` đang BẬT prod → mọi route này lộ thiên (tạo/sửa/xác nhận/huỷ→hoàn ví/xoá/merge/split đơn không cần đăng nhập, biết `code` là gọi được).

- **Gate `requireWeb2AuthSoft`** (parity fast-sale-orders, frontend đã gửi `x-web2-token` qua `native-orders-api.js _fetchJson`→`_authHeaders`): `/backfill-customer-links`, `/reset-stt`, `/create-manual`, `PATCH /:code`, `/:code/confirm`, `/mark-printed`, `/:code/cancel`, `DELETE /:code`, `/:code/split-order`, `/merge`, `/merge-to-pbh`. `/:code/lock-kpi-base` vẫn `requireWeb2Admin`.
- **CHỪA `/from-comment`** (KHÔNG gate vòng này): cart `v2/cart.js:232` loopback server-to-server gọi KHÔNG kèm token → gate giờ sẽ 401 cart drag-drop. Follow-up: forward token trong loopback rồi mới gate (finding đã hạ MEDIUM — chỉ tạo draft, không động tiền).
- **BIGINT money parse**: `web2-balance-history.js:93,446` đổi `parseInt(tx.transfer_amount)`→`Number(...)` (parseInt dừng ở ký tự non-digit → có thể credit sai ví; Number là convention codebase).
- Verify: `node --check` cả 2 file PASS. Không đụng `web2-zalo-zca.js` (agent song song đang sửa).
- **Backlog chưa fix (cần user duyệt, overlap code vừa ship/contended)**: (CRITICAL) quick/bulk refund không gửi `rowReturns` → cost-cap `purchase-refund.js:426-447` KHÔNG chạy (commit 45530fad2 vô hiệu ở UI chính); (HIGH×2) cart.js race read-modify-write `products` thiếu transaction/FOR UPDATE; (HIGH) purchase-refund đổi tồn kho KHÔNG `_notify('web2:products')` → supplier-wallet stale; (MEDIUM) wallet deposit/withdraw chưa validate `:phone`.

### [feat] cham-cong: file bat TURNKEY auto-everything cho collector (như Web 1.0 setup.bat)

User muốn 1 bat chạy là auto hết (như Web 1.0). Thêm vào `attendance-sync/`:

- **`cai-dat-tu-dong.bat`**: bấm 1 lần → check Node + npm install → hỏi/ghi secret Web 2.0 (`web2-config.json`, Enter bỏ qua nếu ADMS) → **tự nhận biết mode** (có `adms-proxy.vbs` trong Startup = ADMS, không thì ZK pull) để KHÔNG tạo collector thứ 2 → kill instance cũ → tạo Startup VBS (chạy ẩn khi đăng nhập) → chạy ngay. Dual-push cả Web 1.0 + Web 2.0.
- **`go-tu-dong.bat`**: gỡ cả 2 Startup VBS + kill tiến trình.
- README cập nhật mục "Cách dễ nhất — bấm 1 file bat" + bảng file.
- Idempotent: re-run thay thế Startup VBS (kill old trước), không double collector. ⚠ Artifact Windows, chưa test trên Mac.

### [refactor] cham-cong: DUAL-PUSH từ collector Web 1.0 (1 máy/1 kết nối DG-600 → cả 2 backend), bỏ agent Web 2.0 riêng

User chỉ ra: Web 1.0 đã chạy sẵn collector chấm công trên 1 máy shop → agent Web 2.0 riêng (`web2-attendance-sync/`) là collector THỨ HAI tranh kết nối cùng máy DG-600 (máy chỉ ~1 kết nối/lúc). Gom về 1 collector dual-push:

- **`attendance-sync/web2-push.js`** (mới): forwarder đẩy users/records/sync-status sang `/api/web2-attendance` (secret từ `web2-config.json` hoặc env `WEB2_ATTENDANCE_SECRET`; thiếu → no-op). Map shape giống api.js Web 1.0. **Nuốt mọi lỗi** → không ảnh hưởng Web 1.0.
- **`attendance-sync/index.js`** (ZK pull): sau khi push Web 1.0, gọi thêm `web2.pushUsers/pushRecords/setStatus` (try/catch).
- **`attendance-sync/adms-proxy.js`** (ADMS mode): `mirrorToWeb2()` fire-and-forget mirror mọi `/iclock/*` sang `/api/web2-attendance-adms/iclock/*` (Web2 ADMS open, không cần secret). Tắt bằng env `WEB2_DUAL_PUSH=0`.
- `web2-config.example.json` + `.gitignore` (bảo vệ secret + logs).
- **Gỡ** 4 file auto-start Web 2.0 vừa thêm (`cai-tu-dong/go-tu-dong/chay-nen.bat`, `run-hidden.vbs`) — không cần collector thứ 2. `web2-attendance-sync/` còn lại là **fallback** khi shop KHÔNG chạy Web 1.0.
- README cả 2 folder cập nhật. Web1⊥Web2 vẫn giữ: 2 backend độc lập DB/bảng, chỉ chung 1 collector đọc thiết bị vật lý.
- Bật: copy `attendance-sync/web2-config.example.json` → `web2-config.json`, dán secret. Log sync hiện `web2 uploaded: N`.

### [fix] Trợ lý AI Web 2.0 — 9 bug đã verify đối kháng (resilience + UX, không mất data)

Fix các finding isReal=true sau audit đối kháng module Trợ lý AI (`web2/ai-hub/` + `render.com/{routes,services}/web2-ai*`):

**Backend (`render.com`)**:

- **(medium) Hủy upstream khi client đóng SSE**: `/chat/stream` tạo `AbortController`, `req.on('close')` gọi `ac.abort()`; `chatStream(opts, onDelta, signal)` truyền `signal` vào CẢ 2 fetch (Gemini + OpenAI-style) + `_readSSE(body, onData, signal)` (check `signal?.aborted` mỗi vòng → `reader.cancel()`). `_withKey` ném ngay khi `AbortError` (không cooldown/failover). Route không log/gửi error cho AbortError. → không đốt quota free cho phản hồi không ai nhận.
- **(medium) Phân loại lỗi quá tải để xoay key**: `_httpError` thêm cờ `_overload` cho 502/503/529 + body-text (overload/unavailable/try again); `_withKey` xử lý `_overload` như quota nhưng cooldown ngắn `COOLDOWN_OVERLOAD_MS=20s` → `chat`/`chatStream` xoay sang key/provider khoẻ thay vì fail cứng ở key đầu.
- **(medium) Ảnh tạo Gemini xoay key**: `_gemini` (image-service) bỏ `_gemKey` thủ công → dùng `runWithKey('gemini', …)` (export mới từ ai-service) tái dùng cooldown CHUNG + classify 401/403/429/502/503/529/Gemini-400-key-hỏng → 1 key lỗi thì thử key kế.
- **(medium) Vision-guard server-side**: `_assertVision(p, mdl, messages)` chặn sớm khi gửi ảnh tới model không-vision (trừ Gemini, mọi model vision) → ném `_noVision`; `chat` + `chatStream` gọi trước fetch; route `/chat` trả 422 + `noVision:true` (thay 400 upstream tối nghĩa).

**Frontend (`web2/ai-hub/js`)** — bump `?v=20260623g`:

- **(medium) Tab Tạo ảnh kẹt dropdown rỗng nếu /status fail lúc boot**: `ai-image.onShow` async, nếu `imageProviders().length===0` → `await loadStatus()` + `fillProviders()` (tự phục hồi, không cần reload trang).
- **(medium) editImageData bỏ ảnh âm thầm với nguồn non-gemini**: `generate()` cảnh báo khi có ảnh gốc + provider≠gemini; đổi provider sang nguồn không `editsImage` → `clearSource()` (dọn state + card + file input).
- **(low) Vision history strip**: `ai-chat.updateAttach` đổi sang model không-vision → strip `images` trong LỊCH SỬ (giữ `hadImages`) để follow-up không re-send ảnh cũ gây 400.
- **(low) Dừng stream trước token đầu**: cờ `userStopped` (set trong `stop()`), AbortError coi như OK (không ⚠️), `userStopped && !acc` → splice bubble rỗng + KHÔNG toast "AI không phản hồi".
- **(low) save() nuốt QuotaExceededError + convos không cap**: cap `convos` về MAX_CONVOS in-memory (giữ currentId hợp lệ), catch QuotaExceededError → cắt nửa + retry → toast warning nếu vẫn fail (không nuốt im lặng).

**(low) Rate-limit (`web2-ai.js`)**: thay `_hits.clear()` bằng sweep theo TTL (xoá IP hết hạn, giữ window IP còn hit) → chống burst-bypass khi >2000 IP.

Bỏ qua 8 dương-tính-giả (delta trùng lặp / round-robin atomicity / \_readSSE đa-dòng / pollinations URL / complete failover / newConvo model rỗng / rAF orphaned node / dropdown image disabled). Verify: `node --check` 5 file PASS + unit-check vision-guard (text-only model ném `_noVision`, vision model qua). Chưa deploy/browser-test live.

### [feat] cham-cong agent: tự chạy nền khi bật Windows (auto-start + auto-restart)

Agent đồng bộ máy DG-600 (`web2-attendance-sync/`) trước chỉ chạy khi giữ `install-windows.bat` mở → đóng/reboot là dừng (→ "Chưa đồng bộ"). Thêm cơ chế chạy nền tự động:

- `cai-tu-dong.bat` (bấm 1 lần): ensure config+npm → đăng ký **Task Scheduler ONLOGON** chạy `run-hidden.vbs` → khởi động ngay. Bật máy/đăng nhập Windows là tự đồng bộ ngầm 5'/lần, không cần mở web.
- `chay-nen.bat`: vòng lặp `node sync.js` + **tự chạy lại** nếu node thoát (lỗi/mất mạng), delay bằng `ping` (không lỗi khi chạy ẩn).
- `run-hidden.vbs`: chạy `chay-nen.bat` ẩn cửa sổ (WScript.Shell.Run …, 0, False), tự resolve thư mục.
- `go-tu-dong.bat`: gỡ task khỏi startup + `wmic` terminate đúng node chạy sync.js.
- README mục 3 + mục 6 thêm "Cách 0 — TỰ ĐỘNG khi bật máy".
- ⚠️ Artifact Windows, không test được trên Mac — viết theo chuẩn `schtasks`/`wscript`; nếu thiếu quyền tạo task → Run as administrator.

### [fix] Zalo P4: "Kết nối lại" phiên hết hạn → 400 + Popup mở chat.zalo.me (không còn 500) + sửa icon

User bấm "Kết nối lại" → **500 Internal Server Error**. Gốc: cookie/phiên đã lưu HẾT HẠN → `zalo.login` throw "Đăng nhập thất bại" → route reconnect catch trả `500 e.message`. Fix:

- Route `/reconnect`: lỗi login (không phải WRONG_ACCOUNT) → **400** + thông báo rõ "Phiên hết hạn — mở chat.zalo.me + Đăng nhập Zalo, hoặc QR" + `expired:true` (không phải 500).
- `loginWithCredentials`: login lỗi → `_setStatus('error', msg)` (trước kẹt 'connecting').
- Frontend `onAccAction` reconnect: bắt lỗi → **Popup.confirm "Mở chat.zalo.me"** 1 chạm (thay toast tan biến). Bump `?v=20260623pri3`.
- Icon lucide `user-search` (không có trong 0.294) → `search` (hết spam console "icon name was not found").

Lưu ý DATA: extension báo `GET_ZALO_CREDS_FAILURE reason=no_session` → trình duyệt CHƯA có phiên chat.zalo.me → "Đăng nhập Zalo" cũng cần mở+đăng nhập chat.zalo.me trước (hoặc QR). Code không hồi sinh được cookie chết — user phải đăng nhập lại.

### [fix] Zalo P3: TỰ LÀNH TK chính (auto-promote khi không/bị xoá) — bỏ hardcode seed key

Audit prod (curl /status + /accounts qua admin token): TK chính **"Nhijudy Ơi" đã bị XOÁ khỏi web2Db** (chỉ còn "My Njd", `is_primary=false`). Với P1: `_primaryKey=null` → KHÔNG TK nào tự kết nối → **Zalo realtime tắt**. Lỗ hổng: seed schema **hardcode** `zca_7c8093f1…` (TK vừa bị xoá) → không phong được TK chính mới. Fix: seed generic (chọn TK active connected→recent→oldest); `_loadPrimaryKey` tự phong + `_connectAccount` khi no-primary (boot+60s); DELETE TK chính → `_loadPrimaryKey()` ngay. Self-healing.

### [fix] Zalo P2: chặn tự gia hạn nền (silent) cho TK phụ + dọn status stale lúc boot

Verify prod sau deploy P1 (uptime 286s = đã chạy code mới): primary `connected`+`isPrimary` ✓ NHƯNG TK phụ vẫn `connected` (live session, connectedAt 59s SAU boot) → do **frontend bản cache cũ autoRenew** silent-reconnect TK phụ qua `login-cookie`. Watchdog mới KHÔNG nuôi nó (đúng) nhưng nó vẫn nối được 1 lần/lần mở trang.

Defense-in-depth (P2):

- Frontend `loginZaloCookie(key, silent)` gửi `silent` xuống `login-cookie`; nhận `skipped` → bỏ qua.
- Route `login-cookie`: `silent && key !== _primaryKey` → **từ chối** (`{skipped, reason:'not_primary'}`). Frontend cache cũ cũng KHÔNG tự nối TK phụ được nữa. Đăng nhập TAY (silent=false) vẫn nối TK phụ 1 lần.
- `restoreSessions` boot: set `status='disconnected'` cho TK phụ personal còn 'connected/connecting/reconnecting' stale (không listener thật).
- Bump `?v=20260623pri2`.

### [fix+feat] Zalo: CHỈ TK chính tự kết nối + giữ kết nối (bỏ "refresh kết nối liên tục" cho TK phụ)

User: đặt TK nào làm chính thì mới kết nối TK đó, không refresh liên tục. Audit toàn bộ vòng đời kết nối Zalo → trước đây **mọi** TK cá nhân đều auto-restore lúc boot + watchdog keepAlive + auto-reconnect mọi close code → 2 TK đều "đấu" kết nối liên tục.

**Backend gating theo `is_primary` (1 nguồn = callback, luôn khớp DB):**

- `services/web2-zalo-zca.js`: thêm callback `isPrimary(accountKey)` + helper `_isPrimary`. Gate `_scheduleReconnect` (TK phụ rớt → KHÔNG tự reconnect, clear timer) + `_watchdogTick` (TK phụ → KHÔNG keepAlive/respawn/re-login chủ động). Thiếu callback → mặc định true (tương thích ngược).
- `routes/web2-zalo.js`: cache `_primaryKey` (load lúc boot + refresh 60s + cập nhật NGAY khi đổi TK chính) → cấp cho zca qua `configure({ isPrimary })`. `restoreSessions()` thêm `AND is_primary=true` (boot CHỈ kết nối TK chính; TK phụ dormant). Route `/primary` ("Đặt làm chính") nâng cấp: cập nhật cache → **ngắt các TK cá nhân khác đang nối** (giữ đúng 1 TK) → **kết nối TK chính** bằng session đã lưu (nền, SSE cập nhật UI). `zca.disconnect` đã `disposed=true` + xoá session nên không tự nối lại.

**Frontend** (`web2/zalo/`, bump `?v=20260623pri`): `autoRenewZalo` chỉ tự gia hạn TK **chính** (trước: mọi TK phụ stale cũng silent-reconnect qua extension cookie → nguồn refresh liên tục). Thêm hint trên thẻ TK phụ: "TK phụ — máy chủ không tự kết nối / không refresh liên tục. Bấm Đặt làm chính để hệ thống tự kết nối & giữ realtime."

Verified: frontend 2 thẻ, 1 TK CHÍNH, hint hiện đúng trên TK phụ, nút "Đặt làm chính" có, 0 lỗi. Backend logic review + node -c pass (zca + real Zalo chỉ test được trên Render sau deploy). KHÔNG đổi schema (cột `is_primary` đã có).

### [feat] cham-cong: thêm NV thủ công + ghi chú theo ngày + modal Chi tiết bảng lương

**Backend** (`render.com/routes/web2-attendance.js`):

- Bảng mới `web2_attendance_day_notes` (id `{device_user_id}_{date_key}`, note, updated_at) — ghi chú theo ngày/NV.
- `GET /day-notes?start&end` + `PUT /day-notes/:id` (upsert, note rỗng = xoá). Load song song trong `loadAll`.
- `POST /device-users` (admin) tạo **NV thủ công** PIN `MANUAL-<base36>` cho người không bấm máy DG-600. `DELETE /device-users/:id` chỉ cho PIN `MANUAL-*` (dọn luôn records/notes/payroll/fullday); PIN máy thật chỉ tắt "Bật".

**#1 Thêm NV thủ công** (`cham-cong-employees.js`): nút "Thêm NV thủ công" (hỏi tên qua `Popup.prompt`) → tạo → gán NV + nhập công như NV máy. Hàng MANUAL hiện pill "Thủ công" + nút 🗑 xoá. Filter Bảng công/lương đổi sang `isVisibleEmp` = đã gán NV **hoặc** MANUAL-\* (NV thủ công luôn hiện dù chưa link web2 user).

**#3 Ghi chú theo ngày** (`cham-cong-app.js`): popup ngày thêm ô "📝 Ghi chú ngày này" (persist `putDayNote` khi đổi). Cell Bảng công có ghi chú → chấm vàng góc + tooltip. State `dayNotes` map `{uid}_{dk}→note`.

**#2 Modal Chi tiết bảng lương** (`cham-cong-payroll.js`): nút "Chi tiết" cạnh "Sửa" → modal read-only giải thích từng khoản: lương chính (công×rate), tăng ca (từng ngày OT + override), phụ cấp/thưởng/đã trả (từng item + nhãn), giảm trừ (phạt muộn từng ngày + giảm trừ thủ công), tổng/còn lại, ghi chú tháng + **ghi chú theo ngày** (#3). Nút "Sửa điều chỉnh" mở modal edit cũ.

CSS bump `cham-cong.css?v=20260623d`, js api `g`/payroll+employees `h`/app `i`. ⚠ Cần Render deploy (route mới).

### [feat] Mọi "Choose File" ảnh hỗ trợ DÁN (Ctrl+V) + kéo-thả — Web2ImagePaste.enhance()

User báo: ai-hub có "Choose File" mà **không dán ảnh được**. Audit toàn bộ `<input type=file accept=image>` Web 2.0 → thêm cơ chế dùng chung.

**🆕 `Web2ImagePaste.enhance(input, opts)`** (`web2/shared/web2-image-paste.js`, bump autoload `?v=20260623b`):

- Nâng cấp 1 file-input **SẴN CÓ** để cũng nhận **DÁN (Ctrl+V)** + **kéo-thả**, GIỮ nút "Chọn file" gốc. Ảnh dán/thả được **bơm vào `input.files` + dispatch `change`** → handler sẵn có của trang chạy y như chọn file → **KHÔNG phải đổi handler**. Có dropZone tuỳ chọn + highlight kéo-thả + hint chip "📋 hoặc dán (Ctrl+V) / kéo-thả".
- `opts`: `dropZone`, `onFiles` (override injection), `hint`/`hintText`/`hintInto`, `onError`.

**Áp dụng (mọi Choose File ảnh chưa có paste):**

- `ai-hub` (Nano Banana sửa/ghép — ví dụ user): `enhance('#aihImgFile', dropZone '#aihImgEditField')`. ✅ Verified: drop ảnh → `inputHasFile=1` (bơm vào input → handler chạy → `editImageData`), hint hiện, 0 error.
- `video-maker` (#vmAdd thêm ảnh slideshow): dropZone `.vm-upload`. ✅ Verified enhanced + hint + 0 error.
- `fb-posts` (#fbpMedFile): dropZone `.fbp-media-bar`.
- `photo-studio` (4 input): source dán thẳng lên khung dàn `#psStage` (hint ở stage rỗng) + nền/logo/batch dán khi rê vào vùng tương ứng.

(chat-panel, zalo, photo-editor, product-card, chi-tieu đã có paste/ảnh-area từ trước.) Giờ mọi nơi nhập ảnh Web 2.0 đều dán/kéo-thả được — 1 nguồn `Web2ImagePaste`.

### [feat] Máy in: 2 chức năng tự chọn sẵn máy mặc định theo TÊN

**Yêu cầu:** trang **Máy in** (`web2/printer-settings/`) — "In tem / mã sản phẩm (máy tem)" mặc định = **Máy in 2 tem mã sản phẩm**; "In Phiếu Bán Hàng (bill 80mm)" mặc định = **Máy in PBH Huyền + Hạnh + Còi + Hồng**.

**Files:**

- `web2/shared/web2-printer.js` — thêm `ROLE_DEFAULT_NAMES` (`{pbh, label}` khớp theo TÊN máy in, vì id do server sinh ngẫu nhiên) + `_defaultPrinterIdForRole()` + `effectiveRoleId()` (export). `getPrinterFor()` đổi fallback chain: **máy user gán → máy mặc định theo tên → máy đầu danh sách → null**. `roleIsBridge()` ăn theo (gọi `getPrinterFor`).
- `web2/printer-settings/index.html` — `renderRoles()` dùng `P.effectiveRoleId(r.key)` để chọn sẵn (selected) máy mặc định khi user CHƯA gán; khớp với hành vi in thực tế.
- Bump `web2-printer.js?v=20260623role` ở 4 trang load (printer-settings, products, fastsaleorder-invoice, native-orders) để prod nạp module mới — default áp dụng cả nơi IN (`web2-bill-service` PBH + `web2-products-print-modal` tem).

**Chi tiết:**

- Default theo TÊN (không persist id) → tự sửa lành (rename/xoá máy → re-resolve). User gán thủ công vẫn ưu tiên; id cũ chết (máy bị xoá) → rớt về mặc định theo tên.
- Node test (chạy đúng module) PASS 5 case: no-role→default đúng tên, override thắng, stale id→default, clear→default, roleIsBridge=true.
- Browser test live (`web2/printer-settings`, `roles:{}`): pbh→"Máy in PBH Huyền + Hạnh + Còi + Hồng", label→"Máy in 2 tem mã sản phẩm". 0 page/console error.

**Status:** ✅ Done.

### [feat+refactor] Ảnh dùng chung 1 nguồn: Web2ImagePaste (nhập) + Web2ImageLightbox click-phóng-to + hover-zoom

**Audit toàn bộ chỗ import/hiển thị ảnh Web 2.0** (2 explore agent song song) → gom về module chung.

**🆕 `web2/shared/web2-image-paste.js` (`window.Web2ImagePaste`)** — ô NHẬP ẢNH dùng chung:

- `mount(target, opts)` → AREA: **bấm chọn file** + **kéo-thả** + **DÁN ảnh (Ctrl+V)** (hover/focus area → armed → document paste route vào, không cần bấm trước) + nén qua `Web2CanvasUtils` (mặc định JPEG ≤1600px) + dải thumbnail preview (xoá ×, click phóng to qua lightbox). Trả callback `onChange(items)`.
- Tiện ích tĩnh cho trang chỉ cần nén (chat/zalo/ai-hub): `compress()`, `imagesFromClipboard()`, `imagesFromDataTransfer()`.
- Verified: 2400×1800 PNG → JPEG 1600×1200 (giữ tỉ lệ) + blob, area mount OK, 0 error.

**♻️ `web2-image-lightbox.js` — thêm CLICK PHÓNG TO catch-all + con trỏ zoom-in** (bump `?v=20260623a`):

- Mọi `<img>` nội dung trong khung Web 2.0 (`.web2-shell`/`body.web2-theme`) → click mở lightbox, hover hiện con trỏ `zoom-in`. Bỏ qua an toàn: icon/avatar <56px, ảnh trong `a`/`button`/`[onclick]`/sidebar, thumb của thumbStrip & Web2ImagePaste, opt-out `data-w2-no-zoom`/`data-w2-no-lightbox`; tôn trọng `e.defaultPrevented` (không cướp handler trang). Đọc `data-full` để mở ảnh gốc to. Gom ảnh anh em trong cùng bảng/gallery cho prev/next.
- Verified trên products: nhận diện ảnh nội dung, hover→zoom-in, click→lightbox mở + set src.

**🔌 Auto-load qua `web2-sidebar.js`** (mọi trang Web 2.0): thêm `web2-canvas-utils` + `web2-image-paste` + `web2-effects` (HOVER ZOOM ảnh — trước chỉ 3/51 trang load) cạnh `web2-image-lightbox`. → 1 cặp module chung: hover-zoom + click-phóng-to có mặt mọi trang, 0 sửa HTML từng trang.

**Consumer migrate (gom về 1 nguồn):**

- `chi-tieu`: ô ảnh hoá đơn dùng `Web2ImagePaste` (xoá `readCompressed` cục bộ); 🧾 cột ảnh đổi từ mở-tab-mới → lightbox (`data-w2lb-url`); bump `?v=20260623c`.
- `chat-panel` (compose): ảnh chat bấm → lightbox dùng chung (thay `window.open` tab mới) + preventDefault.
- `purchase-refund`: `openImageLightbox` delegate sang `Web2ImageLightbox` (giữ fallback overlay cũ).

### [feat] users: hiện mật khẩu (AES 2 chiều, trừ admin) + username cho 2 ký tự — và cham-cong: scroll + Lưu tất cả + ẩn NV chưa gán

**1. Username cho phép 2 ký tự** (`render.com/routes/web2-users.js` + `web2/users/index.html`): regex `validateUsername` `{3,40}`→`{2,40}` + message + hint frontend "2-40 ký tự".

**2. Hiện mật khẩu lên bảng users — chỉ admin, TRỪ account admin** (bump users css/js `?v=20260623ph`):

- Mật khẩu lưu bcrypt (1 chiều, không khôi phục được). Thêm cột `password_enc TEXT` lưu **bản mã hoá 2 chiều AES-256-GCM** (`encryptPassword`/`decryptPassword`, format `v1:iv:tag:ct` base64; key sha256 từ env `WEB2_USER_PWD_KEY`, có fallback default cho beta). bcrypt VẪN là nguồn verify login — `password_enc` chỉ để admin đọc lại.
- Capture trên create + change-password. `mapRow(row,{reveal})` chỉ giải mã khi viewer là **admin** (`req.web2User.role==='admin'`) và **row.role !== 'admin'** (không lộ mật khẩu quản trị viên). `/list` + `/:id` truyền `reveal`.
- Frontend: cột "Mật khẩu" + `renderPasswordCell` — admin row → 🔒, mật khẩu cũ (chưa mã hoá, `password_enc` NULL) → "—" + tooltip "đổi MK để hiện", có mật khẩu → `<code>` + nút copy (`copypwd`). CSS `u-col-pwd`/`u-pwd-text`/`u-pwd-locked`.
- ⚠ Cần Render deploy để chạy. Mật khẩu cũ chỉ hiện sau khi đổi/tạo mới. Khuyến nghị set env `WEB2_USER_PWD_KEY` trên Render (bảo mật at-rest tốt hơn fallback default).

**3. cham-cong** (`web2/cham-cong/`, bump css `?v=20260623c`, js payroll/employees `?v=20260623g`, app `?v=20260623h`):

- **Không scroll được** → `<main>` thiếu class scrollable. `.web2-shell` là `height:100vh;overflow:hidden`, vùng cuộn là `.web2-main{overflow:auto}`. Thêm `class="web2-main"` cho `<main>` (khớp 8+ trang khác).
- **Nút "Lưu tất cả"** (tab Nhân viên): toolbar `.cc-emp-top` + `saveAll()` PATCH tuần tự từng hàng (progress `Đang lưu i/N…`), gom kết quả → 1 toast; refactor `rowBody(tr)` dùng chung với `saveRow`.
- **Ẩn NV chưa gán** (employee_id NULL = "— Chưa gán —") khỏi **Bảng công** + **Bảng lương** + Excel export: filter `&& d.employee_id`. Empty-state phân biệt "chưa gán PIN nào" vs "chưa có dữ liệu máy".

### [feat] Trợ lý AI: keys LIVE (12 chat + 3 ảnh) + Render build-filter cắt phút + tab Cấu hình admin-only + bỏ chữ key/free

**Keys lên Render (WEB2\_ prefix) + đã build LIVE:** set 16 env `WEB2_*` qua Render API (merge guard, 43→59) → Gemini 6 + Groq 5 + OpenRouter 1 (xoay tua, ưu tiên Gemini) + Cloudflare 3 account ảnh. Verify /chat thật cả 3 provider trả tiếng Việt ✓, Cloudflare ảnh ✓. Test toàn bộ key serect: Gemini cũ (11) chết "leaked"; Gemini mới (3 AQ+1 AIza) + Groq 5 + OpenRouter + CF 3 đều sống.

**Render build-minutes (root cause cạn phút):** 3 service (web2-api, n2store-fallback, web2-realtime) đều **autoDeploy + KHÔNG buildFilter** → MỖI push rebuild cả 3 bất kể đổi gì (kể cả docs/frontend/session) → cạn 500 free + $5 limit → build fail 3s/no-log. **Fix: set buildFilter** (`render.com/**` cho web2-api+n2store-fallback, `live-chat/server/**` cho web2-realtime) qua API (buildFilter là field TOP-LEVEL, không phải serviceDetails) → commit docs/frontend/session KHÔNG còn kích build. User nâng spend limit $5→$10.

**test() ping rỗng:** maxTokens 16 quá thấp cho model suy luận (GPT-OSS/Gemini 2.5 đốt token reasoning) → nâng 256.

**Tab "Quản lý key" → "Cấu hình", CHỈ admin (canonical `role==='admin'`, khớp web2/users + requireWeb2Admin):** HTML `hidden` mặc định, ai-hub.js `isAdmin()` mới unhide cho admin + chặn switchTab('keys'). Server gate: `/status` strip keys[]/keyCount cho NV (giữ provider/model cho dropdown), `/test` → requireWeb2Admin. **Bỏ chữ "key"/"free"** khỏi UI NV thấy: subtitle, label "Nguồn ảnh", hint ảnh, pill chat ("✓ Sẵn sàng" thay "N key"), status hint, nhãn model OpenRouter + Pollinations. Admin Cấu hình tab giữ thuật ngữ kỹ thuật (env name chứa KEY là bắt buộc).

### [feat+fix] Nút tự tạo mật khẩu (web2/users) + audit browser-test Chấm công & Quản lý chi tiêu

**1. Nút "Tạo" mật khẩu** (`web2/users/index.html` + `css/users.css` + `js/users-app.js`, bump `?v=20260623pg`):

- Thêm nút 🎲 **Tạo** cạnh ô mật khẩu (cả form Tạo user + modal Đổi mật khẩu) → sinh **1 từ tiếng Anh dễ nhớ dài đúng 9 chữ** (danh sách 111 từ curated, lọc `.length===9` runtime chống gõ nhầm; `Math.random` pick). Ô để `type=text` cho admin đọc/copy đưa NV + toast gợi ý.
- Browser-test: bấm → `dimension`/`wonderful`/`yardstick`/`education` — đều 9 ký tự, ngẫu nhiên mỗi lần, 0 console error.

**2. Audit + browser-test (click như user thật, seed→test→xoá sạch DB — user cho phép):**

- **Chấm công** (`web2/cham-cong/`): timesheet dot-grid (16 NV máy, 6 NV web2, 454 chấm) ✓, popup chi tiết ngày (Vào/Ra + OT + về sớm + 2 tab) ✓, thêm/xoá lượt chấm thủ công (add `09:15 manual` → persist → xoá → về absent) ✓, gán NV (PIN 2 → "Nhân viên Test" hiện đúng tên ở timesheet → revert) ✓, tab Bảng lương (tính công/OT/giảm trừ, tên NV gán "Còi" đúng) + modal Điều chỉnh lương ✓. **Fix**: empty-state còn trỏ nút "Nhập Excel/TXT" đã gỡ → đổi sang hướng dẫn chạy `install-windows.bat`/`lay-du-lieu.bat` (`cham-cong-app.js`, bump `?v=20260623g`).
- **Quản lý chi tiêu** (`web2/chi-tieu/`): tạo phiếu thu (TTM000003, summary cập nhật) ✓, sửa số tiền ✓, **huỷ phiếu** (lý do qua Popup.prompt, loại khỏi list paid + summary→0) ✓, xoá hẳn (cleanup) ✓, tab Báo cáo (breakdown danh mục/tháng/nguồn/quỹ) ✓, quản lý danh mục (thêm/xoá) ✓. **🐛 Fix bug** (`chi-tieu-app.js`, bump `?v=20260623b`): popup **Lịch sử** báo "Lỗi: Invalid time value" — `created_at` audit là `BIGINT` epoch (pg trả chuỗi số `"1782…"`) → `new Date(chuỗi-số)` = Invalid Date → `Intl.format()` throw. Sửa `fmtDateTime`: ép `Number(ts)` khi toàn chữ số + guard `isNaN` (không throw). Verify lại: audit hiện đúng "Sửa/Tạo · Quản trị viên · 15:19/15:18" GMT+7.

Tất cả data test đã dọn sạch, không sót. 2 trang chạy ổn, 0 lỗi app sau fix.

### [fix] Trợ lý AI — debug Gemini: 400-rotation + key revoked + model khai tử + env override

Browser-test xoay key phát hiện chuỗi lỗi Gemini (đều đã fix):

1. **Rotation không xoay khi HTTP 400 `API_KEY_INVALID`**: `_httpError` (web2-ai-service) + loop ai-script chỉ bắt 401/403/429/402 → Gemini trả **400** cho key hỏng → ném ngay ở key đầu, bỏ phí key tốt sau. Fix: phân loại 400 theo MESSAGE (`api key not found/invalid`, `API_KEY_INVALID`) = auth-error → cooldown + thử key kế.
2. **2 key Gemini, 1 hỏng**: `GEMINI_API_KEY` (`AIza…`) = REVOKED ("API key not found"); `WEB2_GEMINI_API_KEY` (`AQ.…`) = VALID. Đã gộp `WEB2_GEMINI_API_KEY` vào pool (extraEnv) → rotation cool key hỏng, dùng key tốt → **Gemini chạy** (verified: "Chào anh/chị, anh/chị đang tìm mẫu áo nào ạ?"). Nên xoá key `AIza…` hỏng.
3. **`gemini-2.0-flash` khai tử** ("no longer available") → đổi `gemini-2.5-flash` ở chat/translate/caption; ai-script có env `WEB2_GEMINI_MODEL=gemini-2.0-flash` override → thêm **remap-guard** code (deprecated→2.5-flash). Nên sửa/xoá env `WEB2_GEMINI_MODEL` trên Render.

Verified live sau từng deploy: Gemini chat ✅, translate (group, Groq primary) ✅. ai-script remap = code đúng (unit-test pass), chờ Render rollout (deploy queue chậm do nhiều background commit). caption KHÔNG có route standalone (fb-posts gọi service nội bộ).

### [fix+refactor] Trợ lý AI: fix chat UI hỏng + gộp translate/caption/ai-script vào group xoay key TẬP TRUNG

**Audit → browser-test → debug → cải thiện** (vòng lặp hoàn thiện Web 2.0).

**🐛 Fix bug chat UI** (`web2/ai-hub/js/ai-chat.js`, bump `?v=20260623b`): `doStream`+`fallback` vừa `.filter()` bỏ assistant placeholder rỗng VỪA `.slice(0,-1)` → chặt nhầm luôn message user → gửi mảng rỗng → "Thiếu nội dung chat". Bỏ `.slice(0,-1)`. Browser-test (clear localStorage, JS bump): chat trả lời thật, **multi-turn AI nhớ context** ("Bạn vừa yêu cầu…"), ảnh Pollinations 768px render gallery, keys tab 6 card — ALL PASS.

**♻️ Consolidation — đưa 3 nơi gọi LLM 1-key-lẻ vào group xoay key** (research agent map toàn Web 2.0):

- `web2-ai-service.js`: + `extraEnv: ['WEB2_GEMINI_API_KEY']` gộp key riêng của ai-script vào pool Gemini (xoay chung — **có thể cứu Gemini nếu GEMINI_API_KEY hỏng**) + helper `complete(messages, {providers, modelFor, system, temperature, maxTokens})` = failover provider + xoay key cho service nội bộ tái dùng.
- `web2-translate-service.js`: bỏ 3 hàm `_groq/_deepseek/_gemini` 1-key → 1 call `ai.complete(['groq','gemini','openrouter'])`, giữ fallback Google free. Bỏ phụ thuộc DeepSeek (trả phí).
- `web2-caption-service.js`: bỏ `callGroq/callDeepSeek/callGemini` → `ai.complete()`, giữ template offline fallback + `_friendlyTone`.
- `web2-ai-script.js` (route): bỏ `WEB2_GEMINI_API_KEY` 1-key-lẻ → lặp `ai.keysOf('gemini')` (pool gộp) xoay key, GIỮ `responseSchema` JSON. Status trả `keys` count.

→ Mọi feature AI Web 2.0 (chat, dịch, caption, video-script) giờ dùng CHUNG 1 pool xoay key + cooldown + failover. Thêm key = set thêm env `<PREFIX>2`,`3`… Verify local: extraEnv gộp key đúng, complete() no-key graceful, 4 file load OK, không dangling ref. Verify Gemini/translate/ai-script thật sau deploy.

### [feat] Trợ lý AI Web 2.0 — chat giống ChatGPT + tạo ảnh, FREE, xoay nhiều key (group AI free hợp pháp)

User muốn build "group AI" có "ChatGPT key free" + xoay nhiều key. **Research/audit GitHub trước**: repo "free ChatGPT API" (popjane/free_chatgpt_api 6.5k⭐, xtekky/gpt4free…) đều reverse-engineer/scrape → vi phạm ToS (OpenAI dọa kiện gpt4free), hay chết, lộ data → **KHÔNG dùng**. Thay bằng **free-tier hợp pháp + xoay key** (mirror pattern web2-elevenlabs 3-key). OpenAI không phát key free thật; "giống ChatGPT" nhất mà free = **GPT-OSS-20B** (model OpenAI mở Apache-2.0, free trên Groq + OpenRouter).

**Backend** (web2-api, prefix `/api/web2-ai` → worker auto-route `startsWith('/api/web2')`, KHỎI sửa worker):

- `services/web2-ai-service.js` — chat engine. Registry **Groq · Gemini · OpenRouter**; OpenAI-compatible (trừ Gemini generateContent). **Xoay nhiều key/provider**: env `<PREFIX>1..10` (vd `GROQ_API_KEY1`, `GROQ_API_KEY2`…) + `<PREFIX>` đơn/phẩy; round-robin + cooldown 401/403 (1h) / 429/402 (5'). `chat()` + `chatStream()` (SSE delta) + `status()` (key MASKED, KHÔNG lộ) + `test()`.
- `services/web2-ai-image-service.js` — tạo ảnh free 3 nguồn xoay: **Pollinations** (free no-key, trả URL — số 1) · **Cloudflare Workers AI** (Flux-1-schnell/SDXL, env `CLOUDFLARE_ACCOUNT_ID`+`CLOUDFLARE_WORKERS_AI_TOKEN`) · **Gemini Nano Banana** (`gemini-2.5-flash-image`, dùng chung key Gemini, nhận ảnh gốc để sửa/ghép).
- `routes/web2-ai.js` — `/status /models /chat /chat/stream(SSE) /image /test`; `requireWeb2AuthSoft` + rate-limit 40/phút/IP. Wire `server.js` require + `app.use('/api/web2-ai')`.

**Frontend** `web2/ai-hub/` (menu "Đa dụng Web 2.0 → Trợ lý AI 🤖"): 3 tab.

- **Chat** giống ChatGPT: streaming gõ từng chữ (SSE, fallback non-stream), lịch sử nhiều cuộc (localStorage `web2_ai_chats`), chọn provider/model, system prompt (vai trò), copy/tạo-lại/dừng, gợi ý mẫu. Markdown render AN TOÀN (escape trước, code-fence/inline/bold/list).
- **Tạo ảnh**: prompt + nguồn + model + size (+ ảnh gốc cho Nano Banana), gallery + tải về.
- **Quản lý key**: hiện provider + key (MASKED) + cooldown + nút Test; key đặt ở **env Render** (an toàn, không nhập trong UI), gợi ý env var + nơi lấy key free.

Modules nhỏ tách bạch (ai-hub/ai-chat/ai-image/ai-keys.js + ai-hub.css), theme xanh Zalo. **Lưu ý vận hành**: Groq+Gemini chat chạy NGAY sau deploy (tái dùng `GROQ_API_KEY`/`GEMINI_API_KEY` env đã có của web2-translate); OpenRouter cần set `OPENROUTER_API_KEY`, Cloudflare ảnh cần set `CLOUDFLARE_WORKERS_AI_TOKEN`. Browser-test localhost (--start web2/overview): page render OK, 3 tab + empty-state + sidebar item, 0 page-error, worker route `/api/web2-ai` về web2-api đúng (404 pre-deploy). Verify chat/ảnh thật sau deploy.

### [feat] Group "Quản trị viên" (admin-only) + 2 module mới: Chấm công (DG-600) + Quản lý chi tiêu (Sổ quỹ)

Thêm group menu **Quản trị viên** chỉ admin thấy (gating group-level `adminOnly` trong `web2-sidebar.js` + server gate `requireWeb2Admin` mọi route). 2 module Web 2.0 ĐỘC LẬP hoàn toàn (bảng `web2_*`, route `/api/web2-*`, pool `web2Db`, SSE riêng) — không dùng chung gì với hệ cũ.

**1) Chấm công — máy vân tay DG-600** (`web2/cham-cong/`, route `/api/web2-attendance` + `/api/web2-attendance-adms`, SSE `web2:attendance`):

- 3 tab: **Bảng công** (lưới giờ vào/ra theo ngày, màu trạng thái + badge muộn/OT, bấm ô xem/sửa punch + đánh dấu công đủ), **Bảng lương** (tính lương: lương ngày, phạt muộn, OT ×hệ số, thưởng/giảm trừ/phụ cấp/đã trả + override, xuất Excel), **Nhân viên** (gán PIN máy ↔ nhân viên + lương/ngày + giờ ca + phạt muộn/phút + hệ số OT).
- Logic lương PURE ở `cham-cong-salary.js` (cấu hình theo từng NV, mọi mốc giờ GMT+7).
- 3 cách nạp dữ liệu: **agent** đẩy LAN cổng 4370, **ADMS push** (máy tự POST ATTLOG text), **nhập Excel/TXT** (parse client-side SheetJS). Bảng `web2_attendance_records/device_users/payroll/fullday/holidays/sync_status/commands`. date*key tính GMT+7; punch idempotent `{pin}*{ms}`.
- Agent máy shop: thư mục riêng `web2-attendance-sync/` (ADMS proxy không deps + ZK pull dùng `node-zklib`), POST ingest kèm secret `WEB2_ATTENDANCE_SECRET`.

**2) Quản lý chi tiêu — Sổ quỹ** (`web2/chi-tieu/`, route `/api/web2-cashbook`, SSE `web2:cashbook`):

- Thu / Chi cá nhân / Chi kinh doanh; quỹ tiền mặt / ngân hàng / ví; mã phiếu tự sinh (TTM/TNH/TVD/CCN/CKD); dải số dư đầu–cuối kỳ; lọc kỳ/loại/quỹ/trạng thái/tìm; danh mục tuỳ chỉnh; nguồn; ảnh hoá đơn (bytea, serve qua route — không CDN ngoài); huỷ mềm + lịch sử chỉnh sửa; tab Báo cáo (breakdown loại/tháng/nguồn/quỹ tính server-side).
- Bảng `web2_cashbook_vouchers/categories/sources/images/counters/audit`. Schema + helper tách `lib/web2-cashbook-lib.js` (route < 800 dòng).

Verify: test schema+SQL trên DB tạm local (ensureSchema idempotent, date_key GMT+7, idempotent punch, code-gen, số dư đầu kỳ, report group tháng theo +7 — PASS, drop DB). Worker auto-route prefix `web2-`. Bump `web2-sidebar.js?v=20260623adm` toàn bộ trang để group hiện. **Verify LIVE sau deploy**: 19 API check (login/CRUD/summary 5M-3M→tồn 2M/report/import→auto device-user/payroll/audit) + browser cả 2 trang 0 console-error + tạo phiếu thu qua UI (+1.234.000đ→tồn cuối cập nhật). Dọn test data sạch.

Fix audit-loop: ① đảo thứ tự `DELETE /records/clear-all` TRƯỚC `/:id` (Express khớp nhầm `:id`='clear-all'). ② `insertRecords` tự tạo device-user cho PIN mới (ADMS/import/manual hiện ngay bảng công). ③ admin-guard client cả 2 trang.

Bảo mật ingest: đã set env **`WEB2_ATTENDANCE_SECRET`** trên Render web2-api (giá trị ở serect_dont_push.txt) + deploy → enforced (no/sai secret=401, đúng=200; agent điền secret vào config.json). Endpoint ADMS `/iclock/*` giữ mở (chuẩn ADMS, máy không gửi header được — dựa cô lập mạng + proxy local).

### [fix] Đồng bộ quick-refund cap amount theo cost so-order (đóng nốt class bug #2 trên cả 2 đường hoàn NCC)

User chốt làm + nhắc rõ: **COD giảm trong "Sửa COD shipper" (web2-returns van_de_shipper) là số NHÂN VIÊN nhập tay → giữ free-form, KHÔNG cap** (ví KHÁCH, tiền trả shipper/trừ công nợ, quyết theo ca). Chỉ cap ví **NCC** (hoàn hàng = giá nhập). 2 path tách biệt.

Fix `purchase-refund.js /quick-refund` (commit `45530fad2`): cũ cap amount theo `Σ(qty×price)` với `price` CLIENT gửi trong products → thổi giá → cap vô dụng (giống bug `/tx` đã fix). Thêm tầng cap server-authoritative: đổi import `loadSoOrderReceivedQtyMap`→`loadSoOrderReceivedMap`, sau BEGIN load soMap 1 lần (tái dùng cho qty-cap), cap `amount ≤ Σ(rowReturns[rid].qty × costVnd)` khi MỌI rid tra được cost (cho hoàn ít hơn, chặn phồng); per-row `returned_row_ids.amount` cũng cap. Thiếu cost → giữ flow cũ. Browser-test: quick-refund products qty2 × price **9999999** (cost thật 100000) → ledger mint **cap 200000** (không phải ~20tr); trừ kho đúng 2; qty-cap regression vẫn OK. State sạch (so-order tab xoá, HNAO3=50, 0 lỗi).

→ Giờ CẢ `/tx` (Ví NCC modal) LẪN `/quick-refund` (Phiếu hoàn) đều cap amount theo cost so-order. Ví KHÁCH (Sửa COD) vẫn nhập tay.

### [fix] Browser-test tương tác (user thật) bắt + fix 2 bug money/stock: over-restock partial + /tx mint ledger NCC

User "1 và 2 cứ browser test tương tác như user thật rồi debug code fix". Cả 2 đều: demo bug qua browser → fix code → deploy → re-test verify.

**① CROSS-FLOW 2 — over-restock thu_ve_1_phan trên PBH (commit `d94047ab9`)**: browser test trả 1/2 SP trên PBH (HNAO3 ×2) → cancel PBH → kho **50→51 (+1 ảo)**: dòng đã trả bị restock 2 lần (phiếu trả +1 + cancel +2). ✅ Partial wallet-decrement (round-2 #1) verify ĐÚNG (cancel hoàn CHỈ remainder 39000 → ví refund 200000 ĐÚNG 1 LẦN, không double). Fix: cột `fast_sale_orders.returned_line_qty {code:qty}` — tăng lúc tạo phiếu trả pbh-type, giảm lúc huỷ; `restockOrderLines` restock `max(0, line.qty − returned)`. Re-test 2 chiều: partial→cancel = 50; partial→DELETE phiếu→cancel = 50. ✅

**② #2 — /tx ví NCC mint ledger do amount KHÔNG recompute (commit `ddbe635c9`)**: browser demo — seed so-order row cost 100000, gửi `/tx return qty1 amount777000` → ledger NCC mint **777000** (qty-cap 1≤5 không chặn vì qty đúng; amount lấy thẳng body). Fix: lib `loadSoOrderReceivedMap` trả `{received, costVnd}` (costPrice×rate, mirror frontend FALLBACK_RATES); `/tx` cap `amount ≤ Σ(qty×costVnd)` khi MỌI rid tra được cost (cho hoàn ít hơn, chặn phồng); per-row `returned_row_ids.amount` cũng cap. Thiếu cost (so-order wipe) → giữ flow cũ. `loadSoOrderReceivedQtyMap` thành wrapper (purchase-refund vẫn xài). Re-test: amount777000→**cap 100000**; qty-cap regression (qty10>5) vẫn reject. ✅

State pristine sau test: so-order test tab xoá, HNAO3=50, ví=0, 0 lỗi console. (Test supplier TEST-NCC-VITEST để lại — BETA, marked.)

### [test] Browser-test battery (workflow thiết kế + chạy thật) — 5 flow tiền/kho ĐỀU PASS, 0 bug mới

Ultracode: workflow 5-agent thiết kế test battery (4 recipe + cross-flow critic, ưu tiên theo bug-finding×money-impact). Chạy THẬT qua browser (click/nhập + assert invariant tiền/kho), test customer 0123456788, seed→test→cleanup sạch. Kết quả:

- ✅ **CROSS-FLOW 1 (seam double-refund, ưu tiên #1)**: native→PBH(ví 161000)→KNH return→PBH cancel. Ví hoàn ĐÚNG 1 LẦN (39000→200000, cancel KHÔNG hoàn lại = 200000), kho restock 1 lần (49→50). Guard zero-out wallet_deducted + stock_restored vững.
- ✅ **Recipe 1 (COD reference_id collision — verify fix vòng 5)**: dựng đúng collision (PBH có sẵn withdraw `native-order-pbh` refId=số PBH), rồi Sửa COD "trừ công nợ khách" 30000 trên CÙNG PBH → ví trừ THẬT 39000→9000, tạo tx `return-cod` 30000 RIÊNG (không bị nuốt). 2 withdraw cùng refId khác reference_type cùng tồn tại. **Pre-fix sẽ kẹt 39000 (swallowed); fix scope reference_type hoạt động đúng.**
- ✅ **COD cancel refund**: huỷ phiếu COD → hoàn ví 9000→39000.
- ✅ **Recipe 4 over-sell**: HNAO2 stock 35, đơn qty 100 → convert reject `over_sell`, kho giữ 35 (không trừ). (HNAO stock 1 → `cho_hang_blocked` — guard khác cũng chặn.)
- ✅ **Recipe 3 reconcile return-failed**: scan→pack→ship→return-failed → restock +1 + hoàn ví wallet_deducted + PBH cancel (1 lần); return-failed lần 2 reject (idempotent, không double).

KHÔNG tìm thấy bug mới — các flow tiền/kho vững. (Khác đợt trước: browser-test bắt được regression stock_applied thật.) Cleanup pristine: ví 0, HNAO3 50, HNAO2 35, 0 PBH active, 0 lỗi console.

**Battery đợt 2 — Ví NCC quick-refund cross-page (browser test thật):** ✅ quick-refund qty 2 → trừ kho HNAO3 50→48 (linkage purchase-refund→web2-products) + credit ledger NCC; ✅ idempotent (cùng code → idempotent:true, không trừ 2 lần); ✅ **amount-cap**: gửi totalAmount=9999999 nhưng computed qty×price=100000 → ledger ghi 100000 (returnedAmount tổng 300000, KHÔNG phải 9999999) — cap line 395 hoạt động; ✅ **shared cumulative cap** (cross-flow): quick-refund qty2 + /tx qty4 trên CÙNG rowId = 6 > đã nhận 5 → reject "Trả vượt số đã nhận" (cap server-authoritative từ so-order, chia chung 2 endpoint). Stock restore HNAO3=50. ⚠ #2 deferred VẪN mở: `/api/web2-supplier-wallet/tx` amount KHÔNG recompute (chỉ check >0) — reachable cho qty hợp lệ + amount phồng; quick-refund thì CÓ cap amount. Test supplier `TEST-NCC-VITEST` để lại (BETA, marked; xoá cần admin secret + direct web2-api).

### [fix] Browser-test bắt REGRESSION vòng 4 — DELETE/approve phiếu native-only trừ kho ảo (stock_applied)

Test thật bằng browser (click/nhập như user) trang Thu về phát hiện **bất đối xứng do chính fix vòng 4 (gate `_applyStock`) tạo ra**: tạo phiếu KNH trên đơn native chưa-có-PBH → gate skip restock → kho GIỮ 50 (đúng); NHƯNG huỷ phiếu → nhánh rollback vẫn trừ kho (record `stock_status='applied'`) → **kho rớt 50→48 = mất hàng ảo**. Code-review + agent vòng 4 miss vì chỉ soi create cô lập; chỉ end-to-end create→delete mới lộ.

Fix đối xứng: thêm cột `web2_returns.stock_applied BOOLEAN DEFAULT TRUE` (default TRUE → phiếu cũ huỷ vẫn trừ đúng). Create ghi `stock_applied = sourceDeductedStock`. DELETE + approve CHỈ đụng kho khi `stock_applied !== false`. Verified: tạo→kho 50 giữ 50, huỷ→vẫn 50 (sau deploy). Đã restore HNAO3 48→50 + xoá đơn seed. `node --check` PASS.

### [audit/fix] Vòng 5 — sweep TOÀN BỘ surface tiền/kho liên quan (5 agent song song): 1 HIGH ví + 2 hardening fix

User "audit tất cả những cái liên quan". Map đủ surface tiền/kho: 5 agent adversarial (find→refute→confirm) chia — (1) ví core `web2-wallet-service` + customer-wallet routes, (2) SePay→ví pipeline, (3) `reconcile.js` full, (4) stock authority `web2-products` + inbound `so-order`, (5) `cart.js` + native-orders money paths. **Hầu hết REFUTED** (hệ guard rất chắc: SePay dedup 3 lớp, reconcile chỉ là state-machine không settle tiền, stock đều atomic + advisory-lock, so-order receive idempotent qua status flip).

**Fix:**

- 🔴 **HIGH — withdraw dedupe BỎ SÓT `reference_type` → nuốt 1 lần trừ ví thật** (`web2-wallet-service.js:377`): dedupe in-tx chỉ `type='WITHDRAW' AND reference_id` → 2 luồng KHÁC dùng cùng referenceId = **số PBH** va chạm: `_applyWalletToPbh` (refType `native-order-pbh`, refId=pbh.number) vs Sửa COD "trừ công nợ khách" (refType `return-cod`, refId=cùng số PBH) → lần trừ COD bị coi `alreadyProcessed` = **KH KHÔNG bị trừ nhưng sổ ghi đã trừ** (under-charge). Nhánh DEPOSIT đã scope refType ('sepay'/'balance_history') — withdraw là cái lệch. Fix: thêm `AND reference_type=$3` (mirror deposit). Cùng nghiệp vụ vẫn idempotent (retry cùng refType), khác nghiệp vụ không nuốt nhau. Fix kèm route pre-check `_findIdempotentTx` (web2-wallets.js) cũng thêm refType ('manual' withdraw / 'balance_history' deposit).
- 🟢 **cart qty trần** (`cart.js`): `b.qty` client không trần → > 2^31 tràn cột INTEGER `total_quantity` (parallel bug crm_team_id INT4). Clamp `MAX_LINE_QTY=100000` ở /add + PATCH set-qty.

**DEFER (cần quyết định / rủi ro regression):**

- 🟡 **cart line price tin client** (`cart.js:193` `Number(input.price)`): giá chảy vào native_orders→PBH→`_applyWalletToPbh` trừ ví thật. NHƯNG `source:'livestream'` = **giá BIẾN THIÊN theo phiên live** (ép giá catalog sẽ HỎNG tính năng bán live) + qua checkpoint staff tạo PBH (không drain ngầm). Cần quyết định sản phẩm: cho phép custom price live? validate ra sao? KHÔNG rush.
- 🟡 **native-orders PATCH totalAmount/totalQuantity trên đơn đã confirmed bỏ qua guard** (native-orders.js:1855): drift native total vs PBH amount_total (display/reconcile, KHÔNG mất tiền — refund đọc PBH wallet_deducted). Low reachability (UI gửi kèm products → guard fire). Defer.
- NOTE: unique index anti-dup ví vắng khi boot gặp dup cũ (in-tx FOR-UPDATE re-check vẫn chặn race); `_applyWalletToPbh` debit + bookkeeping wallet_deducted non-atomic trên Pool (one-directional, KH mất nếu crash giữa — không double).

Tất cả `node --check` PASS. Cần Render deploy.

### [audit/fix] Vòng 4 — trang Thu về (web2/returns) + chuỗi data feed: 2 bug stock thật fix, 2 edge defer

User "audit trang returns + trang nào trigger/feed nó → debug → fix lặp đến hoàn hảo". Map dependency: returns nhận data từ `web2-returns.js` (own), `web2-customer-orders.js` (feed đơn picker), `web2/customers/search`, `web2/wallets/by-phone`, `web2-products/list`; tác động xuống `fast_sale_orders` (wallet_deducted, stock_restored), `web2_products` (stock/return_qty), ví KH, native-orders (consume SP queued bill 0đ). 3 agent adversarial (find→refute→confirm) hội tụ — **ví/credit cap đều vững (KHÔNG mint tiền)**, lỗi tập trung ở **kho (stock)**.

**2 bug stock đã fix:**

- 🔴 **DELETE phiếu thu_ve_1_phan ĐÃ consumed → trừ kho lần 2 + over-refund ví** (web2-returns.js DELETE): SP đã xuất lại qua PBH đổi 0đ (bill_status='consumed') mà huỷ phiếu thu về → nhánh `stock = GREATEST(0, stock-qty)` trừ kho LẦN 2 (net âm/clamp 0 = mất hàng) + nhánh thu_ve_1_phan re-add `wallet_deducted` cho PBH nguồn dù KH đã nhận hàng đổi. Fix: chặn 409 khi `bill_status='consumed'` (muốn đảo → huỷ PBH đổi `consumed_pbh_code` trước). Frontend returns-tabs ẩn nút "Huỷ" → "Đã lên bill".
- 🔴 **Native order CHƯA convert PBH → return bơm TỒN ẢO** (web2-returns.js create, line ~933): kho CHỈ trừ khi tạo PBH (from-native-order/merge-to-pbh), native order 'pending' chưa có PBH = chưa trừ kho. Nhưng `_applyStock(+1)` chạy vô điều kiện cho mọi return → return 1 đơn native-only = cộng kho từ hư không. Fix: gate `_applyStock` trên `sourceDeductedStock` (KNH: `knhPbhIds.length>0`; partial-native: SELECT 1 PBH state<>'cancel'). pbh type luôn restock. Wallet đã đúng (=0 khi no-PBH).

**2 edge MEDIUM defer (fix triệt để rủi ro regression common path + đụng PBH order_lines):**

- 🟡 thu_ve_1_phan trả 1 phần rồi HUỶ TOÀN BỘ PBH nguồn → restockOrderLines restock cả dòng đã trả (double-restock). Hiếm. Cần trừ qty đã trả khỏi order_lines (đụng totals/reconcile).
- 🟡 KNH native source split nhiều PBH mà 1 PBH đã cancelled → `_applyStock` restock cả native products (gồm phần PBH đã restock). Cần build items từ live-PBH order_lines thay native products.

**Refute đúng (không phải bug):** approve KHÔNG re-credit ví; walletCredit cap không mint (clamp ≤ wallet_deducted tươi dưới lock); mọi mutation atomic trong tx; KNH/partial dedupe + unique index chặn double-submit; cancel-consuming-PBH restock dòng 0đ là ĐÚNG model restock-on-cancel (hàng về kho thật), chỉ bill_status stale (LOW, không fix). `node --check` PASS. Cần Render deploy.

### [audit/fix] Vòng 3 — money audit module ngoài PBH (ví NCC / ví KH / SePay / hoàn NCC): 5 bug, fix 4

User "lặp đến hoàn hảo". Workflow adversarial 4 module tiền → 5 candidate → **5 confirmed (0 false-pos)**. Fix 4 (clean/safe), 1 defer (rủi ro cao + insider-vector).

- 🔴 **#1+#4+#5 purchase-refund state-machine RETIRED → 410**: `/:code/{approve,cancel-approve,refunded,reject}` đã bỏ UI từ 2026-05-30 (`actions=[]; if(false)`), chỉ `quick-refund` dùng. Endpoint còn sống = bẫy: **#5** approve trừ kho NHƯNG không ghi ledger ví NCC (divergence), **#4** re-approve trừ kho lại, **#1** cancel-approve/reject gọi `reverseRefundLedger` strip mất trần `ordered` → over-refund khi so-order wipe. Fix: 410 cả 4 (giống manual-create/from-pbh). quick-refund = đường DUY NHẤT.
- 🔴 **#3 SePay reassign ví lặp A→B→A→B lần 2 mất tiền**: `reassignRef` chỉ gồm newPhone → lần 2 A→B trùng ref lần 1 → dup-check tưởng "đã chạy" → row đổi sang B nhưng **tiền không chuyển** (B thiếu, A dư). Fix: ref duy nhất mỗi lần (`+oldPhone+timestamp`) + GỠ dup-check (retry-idempotency do re-check phone TƯƠI dưới FOR UPDATE lo → request lặp thấy row đã đổi → 409).
- 🟡 **#2 web2-supplier-wallet /tx amount KHÔNG recompute server-side** (DEFER): trần over-refund chỉ chặn QTY, `amount` lấy thẳng body (chỉ check >0) → client tamper amount lớn → mint credit ví NCC giảm nợ. Insider-vector (cần auth + body sửa tay; client thật tính `qty×cost`). Fix đúng = recompute `amount ≤ Σ(cappedQty × cost)` từ so-order (mirror purchase-refund.js:385-390) — **cần xác định field cost trong web2_so_order row trước** (lib hiện chỉ đọc qty/qtyReceived/status). Rủi ro cap nhầm refund thật → để đợt focused.

Tất cả `node --check` PASS. Cần Render deploy.

### [audit/fix] Hệ PBH vòng 2 — deep money-flow audit (8 bug thật, 2 false-pos refute) + fix

User "audit → debug → fix lặp đến hoàn hảo". Workflow adversarial (4 chiều ví/kho/state/báo-cáo, find→refute→confirm) → 10 candidate → **8 bug thật** (2 false-pos đã loại đúng: KPI-revoke-merged không execute, bulk-confirm native đã confirmed). Verify trước 3 bug deft lần trước: dashboard `amount_total` (KHÔNG bug — dashboard-kpi trả đúng cột), bulkMerge draft-only (by-design, BE cũng chặn), native-auth /from-comment (cart.js loopback KHÔNG token → defer ĐÚNG).

**8 bug đã fix:**

- 🔴 **#1 web2-returns thu_ve_1_phan HOÀN VÍ 2 LẦN** (money): trả 1 phần cộng ví nhưng KHÔNG trừ `wallet_deducted` PBH nguồn → huỷ/xoá/return-failed PBH sau hoàn LẠI full = double. Fix: trong tx lock PBH nguồn, trừ `wallet_deducted` (clamp 0) phân bổ + snapshot `{id,dec}`; DELETE phiếu trả cộng lại về PBH còn live. Đối xứng KNH (zero-out) nhưng trừ MỘT PHẦN.
- 🔴 **#2 native-orders /merge-to-pbh over-sell** (stock): trừ kho `GREATEST(0,...)` không advisory-lock/recheck → over-sell thầm lặng (2 path sibling đã fix, path này sót). Fix: copy pattern `pg_advisory_xact_lock(web2_product_stock:<code>)` + re-check + throw over_sell, gate `force!==true`.
- 🔴 **#3 native-orders /:code/cancel orphan merged siblings** (state): chỉ UPDATE `WHERE code=$3` → native con của PBH gộp kẹt 'confirmed'. Fix: tách `source_code '+'` → cancel hết member + revoke KPI cho mọi member + SSE.
- 🔴 **#4 fast-sale-orders PATCH /:number đổi state=cancel/done bare-UPDATE** → bỏ sót restock/hoàn ví/sync. Fix: chặn 400 `state_change_via_patch_forbidden`, ép qua /cancel /confirm.
- 🟡 **#5 fast-sale-orders DELETE /:number orphan native_order**: không sync. Fix: `syncNativeOrderStatusFromPbh(prevRow,'cancel')` + SSE (tách source_code '+').
- 🔴 **#6 pbh-reports top-customers-360 double-count doanh thu**: native+pbh cùng đơn cộng 2. Fix: CTE `converted_native` loại native đã có PBH (split '+').
- 🟡 **#7 customer-orders totals.native cộng cả Đơn Web huỷ**: lệch vs PBH. Fix: `if (status!=='cancelled')`.
- 🟡 **#8 report-revenue modal đọc sai shape** (`summary.native.count` → TypeError vỡ modal): Fix đọc `summary.totalNative/totalNativeAmount/totalPbh/totalPbhAmount` + key `totalAmount`, optional-chaining.

Tất cả `node --check` PASS. Money/state ĐỀU atomic trong tx + idempotent. Cần Render deploy.

### [audit/fix] Hệ PBH "1 nguồn" — audit toàn diện + fix bug (money-leak reconcile + merged dedup + auth)

User: "audit → debug → fix lỗi đến hoàn hảo" + "PBH cho về 1 nguồn, module dễ quản lý". Audit workflow 2-agent (FE 12 access-point + BE routes) → kết luận: **BE đã ~1 nguồn ở data layer** (`fast-sale-orders.js` sở hữu bảng, `/from-native-order` là create DUY NHẤT, `_cancelPbhInTx`/`restockOrderLines`/`validateStock` đã extract dùng chung). **FE bị tản mát** (12 file fetch `/api/fast-sale-orders` riêng) → đề xuất module shared `Web2PBH`.

**Bug đã fix (ưu tiên money-safety):**

- 🔴 **reconcile `/return-failed` MẤT TIỀN THU HỘ**: trước chỉ `UPDATE state=cancel` + restock, BỎ SÓT hoàn `wallet_deducted` cho ví khách + không sync `native_orders→cancelled`. Fix: dùng chung `_cancelPbhInTx` (restock + HOÀN VÍ idempotent) + post-tx `syncNativeOrderStatusFromPbh` + SSE ví/products/native. Export thêm `syncNativeOrderStatusFromPbh`. Verified deploy load OK.
- 🟡 **customer-orders merged-PBH dedup**: tách `source_code` theo `'+'` để ẩn TẤT CẢ Đơn Web gốc của PBH gộp (trước chỉ match nguyên chuỗi).
- 🟢 **pbh-render `detail()`/`openHistory()` bare-fetch** → inject `_authHeaders()` (trước 401 cho NV bị KPI-scope; bump `pbh-render.js?v=20260623auth`).

**Bug KHÔNG fix (có lý do — tránh phá vỡ):**

- native-orders mutation thiếu auth: DEFER — caller server-side `v2/cart.js` (Pancake cart→order) có thể không gửi token → thêm auth = 401 phá flow. Hardening, không phải money bug.
- dashboard `p.amount_total`: KHÔNG đụng — field từ `/api/web2/dashboard-kpi` (endpoint riêng), "sửa" mù có thể phá. Cần verify payload trước.
- customer-wallet `fetchPbhList` (offset+no-auth): **dead code** (export nhưng không caller; live path = `fetchPbhListForPhone` qua `/by-phone/:phone/orders`). Moot.

**Web2PBH module (thiết kế SẴN, để làm đợt focused tiếp — tránh rush 12 file trang đang dùng):** `web2/shared/web2-pbh.js` expose: base/authHeaders/\_fetch(always-auth)/load/loadAllByOffset/get/history/fromNativeOrder/confirm/cancel/cancelBySource/bulkCancel/merge/markPrinted/normalize(1 field-authority: amount)/money/date/stateBadge/STATE_META/onChange(SSE-debounce). Migrate read-paths trước, writes (native-orders create) sau (giữ nguyên error map over_sell/cho_hang_blocked). 8 bug + duplication cataloged ở MEMORY.

### [fix] customer-orders: ẩn Đơn Web đã convert sang PBH (hết trùng dòng + double-count)

User thấy trang Thu về "CHỌN ĐƠN" hiện CÙNG mã `NJ-...` 2 dòng: ĐƠN WEB (263k) + PBH (298k). Gốc: `/api/web2/customer-orders/:phone` (`render.com/routes/v2/web2-customer-orders.js`) list `native_orders` + `fast_sale_orders` RIÊNG, KHÔNG dedup. Mà 1 Đơn Web convert → 1 PBH **dùng chung số** (PBH.number = native.code, splitIndex 1; tách = `code-N`; link `fast_sale_orders.source_code = native.code`, `source_type='native_order'`). → trùng dòng ở 5 consumer (returns, report-revenue, 2× customer-360, pbh-render) + **double-count doanh thu** ở report-revenue.

- **Fix**: query PBH TRƯỚC → gom `convertedNativeCodes` (source_code của PBH `native_order`) → khi push native, **bỏ qua đơn đã có PBH**. Đơn Web CHƯA convert vẫn hiện. `totals`/`summary` shape giữ nguyên (chỉ hết double-count). 1 nguồn backend → fix mọi consumer.
- Cần Render deploy. Verify: GET customer-orders trả mỗi mã 1 dòng (PBH).

### [chore/fix] PBH toolbar gọn + fix khe hở 8px thanh menu (32 trang) + gỡ "chữ TPOS" Web 2.0 + chặn tạo PBH thủ công

4 việc theo yêu cầu (audit → thực hiện → debug → verify), Web 2.0 self-contained hơn.

**1. PBH — bỏ nút "Reset STT"**: xoá button `#pbhResetStt` (index.html) + wiring (pbh-app.js) + handler `resetStt` + export (pbh-actions.js, pbh-app.js public API). Giữ 4 nút chuẩn còn cần (Tải lại / Áp dụng / Xóa lọc / Xuất Excel). Verify: toolbar 4 nút, no error.

**2. Fix lỗi giao diện gần thanh menu (reconcile + returns + 30 trang khác)**: root cause = `body { margin: 8px }` mặc định KHÔNG reset — 32 trang Web 2.0 KHÔNG load `web2-base.css` (chỉ invoice/products… có) → khe hở 8px quanh sidebar. Fix 1 NGUỒN: thêm `html, body { margin: 0 }` vào `web2-sidebar.css` (load ở MỌI trang); CHỈ reset margin, KHÔNG đụng box-sizing (tránh dịch layout 32 trang). Verify: reconcile + returns aside flush (0,0), bodyMargin 0px. Bump `web2-sidebar.css?v=20260623fix` (43 trang).

**3. Gỡ "chữ TPOS" khỏi Web 2.0** (audit workflow 2-agent: **ZERO runtime TPOS dependency** trong Web 2.0 FE+BE → xoá text an toàn):

- **Xoá 19 file rác TPOS**: `docs/api-samples/*.txt` (15 mẫu crawl TPOS gồm ProductVariants.txt) + 3 doc balance-history (PHONE_PARTNER_FETCH_GUIDE / PARTIAL_PHONE_TPOS_SEARCH / PHONE_EXTRACTION_IMPROVEMENTS) + `docs/web2/LIVE-CAMPAIGN-TPOS-API.md` (trang không tồn tại). Đều unreferenced.
- **Reword comment/label/doc** (27 file): `fast-sale-orders.js` "Mirror TPOS FastSaleOrder"→"PBH nội bộ Web 2.0"; native-orders/web2-products/web2-users/migrations TPOS→"hệ cũ"/"Web 1.0"; balance-history JS+MD "WEB2 Partner OData/TPOS"→"kho KH Web 2.0 (/api/web2/customers)" (runtime vốn đã dùng local store); products-print-utils, web2-base.css/web2-menu.json crawl-attribution; docs "TPOS-clone"→"Web 2.0" + fix stale `web2-tpos-theme.css`→`web2-theme.css`, `.tpos-theme`→`.web2-theme`, `tpos-sidebar.js`→`web2-sidebar.js`.
- **GIỮ NGUYÊN (preserve)**: false positives (`textPos`/`evtPos`/`boostPost`/`listPosts`/min.js); **Web 1.0 backend thật** (tpos-_.service.js, odata.js, return-orders, web-warehouse, customer-creation, audit-service); **cloudflare worker `TPOS_GENERIC`**; `/api/odata/_`shared infra; module`tpos-pancake/`; **DB column `native_orders.tpos_index`** + permission keys `'tpos-pancake'`/`syncTpos`/`loadTpos`+ value`PARTIAL_PHONE_NO_TPOS_MATCH` (saved values — đổi cần migration, để lại); historical docs (DECOUPLE-AUDIT, WEB2-TOTAL-SEPARATION-PLAN). Codemap regenerated.

**4. Chặn tạo PBH thủ công — 1 nguồn = native-orders**: `POST /api/fast-sale-orders` (manual create) → trả **410** (`manual_create_disabled`), giống pattern `/refunds/from-pbh`. PBH page vốn không có nút tạo (empty-state chỉ dẫn sang Đơn Web). Nguồn DUY NHẤT giờ là `/from-native-order`. Cần Render deploy.

Verify FE: PBH toolbar + balance-history (50 rows, enricher OK, history buttons OK), reconcile/returns layout — 0 error. Backend (410 + comment) cần deploy.

### [chore] Xoá trang product-category ("Nhóm sản phẩm") + [data] khôi phục Kho Biến Thể (108)

Audit workflow 2-agent (removal surface + restore sources) → thực hiện → debug → verify.

**Task 1 — XOÁ product-category** (LOW risk: leaf page, generic page-builder entity, KHÔNG cần đổi backend):

- Xoá folder `web2/product-category/`. Xoá menu child + allow-list trong `web2-sidebar.js`. Xoá `PRODUCT_CATEGORY` trong `web2-sse-topics.js`.
- Regenerate `modules-manifest.js` (`node scripts/web2-build-manifest.js`) + `navigation-modern.js` (`node scripts/web2-build-nav.js`) — auto drop entry (manifest cũ stale, nay picks up delivery-zone + product-counter = đúng).
- Dọn overview/index.html (card #p-product-category, TOC, diagram, SSE pill, API token, SSE table row) + 6 test script + swap JSDoc example `web2-api.js` sang `productuom`.
- Bump `web2-sidebar.js?v=20260623pc` (43 trang) để prod nạp menu mới.
- KHÔNG đụng backend (`web2-generic.js` slug-agnostic phục vụ 78+ entity từ `web2_records` — xoá page chỉ ngừng hit route). Data `web2_records WHERE entity_slug='productcategory'` để lại (beta, vô hại; purge cần x-admin-secret).
- Tombstone giữ chủ ý (doc/comment, không phải ref sống): page-builder generic JSDoc, menu.json TPOS-crawl, migration 068 comment.
- Verify: product-category HTTP 404, sidebar chỉ còn "Kho SP Web 2.0" + "Kho Biến Thể".

**Task 2 — KHÔI PHỤC Kho Biến Thể** (`web2_variants` bị TRUNCATE bởi web2-selective-wipe.js, KHÔNG backup):

- Nguồn = `bienthe.txt` (108 biến thể gốc, git-verified byte-identical) + `scripts/seed-web2-variants.sh` (seed gốc). KHÔNG cần Firestore/TPOS/seed mới.
- WEB2_AUTH_ENFORCE=1 nên POST cần token → thêm header `x-web2-token` OPTIONAL (env `WEB2_TOKEN`) vào seed script (backward-compat). Lấy token qua `POST /api/web2-users/login` admin.
- Chạy `WEB2_TOKEN=<admin> bash scripts/seed-web2-variants.sh` → 108 created, 0 fail. Verify: total 108 (Màu 80 + Size 28), 108/108 có short_code auto-suggest (BAC/BEO/BO/43/44), sort_order 1-108. Trang render đủ 108 rows.

### [feat] Per-record history rollout — Wave 3 frontend (🕘 buttons cho 10 trang đã wire sink)

Hoàn tất nhánh FE: 10 trang đã có data chảy vào event-sink (Wave 2) giờ có nút 🕘 mở `Web2AuditLog.openRecord({entity, entityId, title})` per-record. Module auto-load qua sidebar → chỉ thêm nút + handler (defensive `?.`), KHÔNG cần script tag. 5 subagent song song (2 trang/agent), additive thuần, match style nút sẵn có, bump `?v=20260623w3`.

- **supplier-wallet** (card NCC → 🕘 header) + **supplier-debt** (row NCC → 🕘) → entity='supplier-wallet', id=tên NCC.
- **fastsaleorder-refund** (row → 🕘, RfApp.openHistory) → entity='refund', id=o.number.
- **fastsaleorder-delivery** (row → 🕘, DlvApp.openHistory) → entity='delivery-invoice', id=o.number.
- **jt-tracking** (row → data-act=history) → entity='jt-tracking', id=billcode.
- **balance-history** (row actions → 🕘) → entity='balance-transaction', id=row.id.
- **order-tags** (card-foot → 🕘) → entity='order-tag', id=code.
- **users** (row actions → data-act=history) → entity='web2-user', id=u.id.
- **fb-posts** (list published `p.id` + drafts `d.id` → 🕘) → entity='fb-post'.
- **live-control** (header toolbar → 🕘, guard "Chưa chọn chiến dịch") → entity='campaign', id=state.campaignId.
- Tất cả 12 file JS `node --check` PASS; 11 openRecord call đúng entity; 10 version bump. Tĩnh GH Pages.

### [feat] Per-record history rollout — Wave 2 backend wiring (9 route → event-sink) + entityId purge

Hoàn tất nhánh backend: mọi mutation NGHIỆP VỤ còn lại của Web 2.0 ghi vào event-sink `web2_audit_events` → audit-log "toàn bộ" + per-record modal đủ nguồn. Pattern ĐỒNG NHẤT: `require('web2-audit-sink')` + helper `_auditX(req, action, id, note)` (best-effort, KHÔNG await/throw) gọi SAU commit, TRƯỚC `res.json` — **additive thuần, không đụng money math / control flow**.

- **supplier-wallet** (`web2-supplier-wallet.js`, money) → entity='supplier-wallet': tx (payment/return — chỉ success thật, BỎ 2 nhánh `alreadyProcessed` idempotent), upsert-supplier, import, delete-supplier.
- **refunds** (`refunds.js`, phiếu trả PBH — LIVE qua trang fastsaleorder-refund, chỉ `from-pbh` create là 410) → entity='refund': approve/complete/cancel (3 endpoint share 1 handler) + delete.
- **balance-history** (`v2/web2-balance-history.js`, money) → entity='balance-transaction': manual-deposit, link, reassign, resolve-pending. **BỎ** bulk/auto (auto-match, reprocess-unmatched, auto-assign, cleanup, SePay webhook) tránh nhiễu.
- **delivery-invoices** → entity='delivery-invoice': create/ship/deliver/return/cancel/update/delete.
- **fb-posts** → entity='fb-post': create/update/schedule/publish/delete (bỏ token-connect + AI caption + ad-ledger).
- **jt-tracking** → entity='jt-tracking': add(scan/manual)/approve/update/delete (bỏ scrape GET + cron auto-purge).
- **order-tags** → entity='order-tag': create/update/delete config.
- **campaign-products** (live-control) → entity='campaign': add-products/remove-product/set-pending ("số NCC báo"). BỎ reorder/pin (UI prefs, nhiễu khi live).
- **customer-wallet** (`v2/web2-customer-wallet.js`) — **KHÔNG wire**: chỉ có POST `/:phone/qr` (sinh QR, không đổi số dư); deposit thật qua SePay webhook (tự động, không phải thao tác user) → tránh double-count.
- **/purge** (`v2/audit-log.js`) — thêm tham số `entityId` (backward-compat: cần entity HOẶC entityId; có cả 2 = AND) → admin dọn lịch sử 1 record cụ thể (vd row test), không phải cả entity.
- **Module FE** `web2-audit-log.js`: bổ sung ENTITY_LABELS + pill màu cho 12 entity mới (variant/refund/native-order/so-order/web2-user/supplier-wallet/delivery-invoice/jt-tracking/fb-post/order-tag/campaign/balance-transaction). Bump sidebar `?v=20260622al4`.
- Tất cả 9 route `node --check` PASS; require + audit-call counts verified. Cần Render deploy để nạp.

### [feat] Per-record history rollout — frontend custom pages (returns + reconcile + customers)

Tiếp rollout lịch sử per-record (audit→implement→debug→verify). Đợt này lo **frontend custom pages** — gắn nút mở `Web2AuditLog.openRecord(...)` đúng theo chức năng từng trang. Phát hiện quan trọng khi audit: nhiều trang ĐÃ có lịch sử per-record sẵn từ nguồn canonical/embedded → KHÔNG downgrade, chỉ bù trang còn thiếu.

- **products / PBH** — đã có modal lịch sử riêng đọc bảng canonical (`/api/web2-products/:code/history` → `web2_product_history`; `/api/fast-sale-orders/:number/history` → `fast_sale_order_history`) = CÙNG bảng audit union đọc → nguồn đã thống nhất, rendering tùy biến (user cho phép). **No-op.**
- **purchase-refund / customers (edit modal)** — đã render lịch sử embedded (`data.history` JSONB) qua shared `Web2HistoryTimeline`. **Giữ.**
- **returns** (gap thật) — thêm nút 🕘 mỗi row (`rt-btn-hist`) → `Web2Returns.openHistory(code)` → `openRecord({entity:'return', entityId:code})`. Verify LIVE: modal "Lịch sử thu về TEST-RET-VERIFY" render bảng + API trả scope đúng.
- **reconcile** (gap thật) — thêm nút "Toàn bộ thao tác" cạnh toggle "Lịch sử đối soát" → `openRecord({entityId:number})` KHÔNG lọc entity = gộp `pbh` (tạo/sửa/huỷ) + `reconcile` (đối soát/giao hàng) cho cùng số PBH (full lifecycle 1 chỗ).
- **customers** — thêm nút 🕘 quick mỗi row (`data-act="history"`) → `openRecord({entity:'customer', entityId:id})`. Verify LIVE: 50 nút render trên KH thật, click "Kelly Chau" → modal mở. **End-to-end backend sink confirmed**: tạo KH test (id 68102) → sink `web2_audit_events` có event action=create user="Quản trị viên" page=customers → đã xoá KH test.
- **kpi assignments** — đã có section lịch sử (STATE.history) + tab audit tổng. **No-op.**
- Files FE: `web2/returns/{js/returns-tabs.js,js/returns-app.js,css/returns.css,index.html}`, `web2/reconcile/{js/reconcile-render.js,css/reconcile.css,index.html}`, `web2/customers/{js/customers-render.js,js/customers-detail.js,index.html}` (bump ?v=20260622hist). Tĩnh GH Pages.

### [feat] Per-record history rollout — generic pages (page-builder) + sidebar auto-load + wire variants/users

Tiếp foundation openRecord: nhân rộng lịch sử per-record ra hệ thống (audit→implement→debug→lặp).

- **Sidebar auto-load** `web2-audit-log.js` → MỌI trang Web 2.0 có `window.Web2AuditLog` (không cần script tag riêng).
- **page-builder.js**: nút 🕘 mỗi row + `openHistory()` lazy-load → product-category + delivery-zone (+ mọi generic page) tự có lịch sử. Verified: tạo category → 🕘 → modal "Lịch sử: TESTCAT1" action=create.
- **openRecord**: `entity` optional (entityId-only = mọi nguồn của id, vd PBH gộp 'pbh'+'reconcile').
- **Wire sink Wave 2 (backend)**: `web2-variants.js` (create/update/delete → entity='variant') + `web2-users.js` (create/update/permissions/password/deactivate → entity='web2-user', actor=admin — audit bảo mật tài khoản).
- **Tracker** `docs/web2/AUDIT-HISTORY-ROLLOUT.md` (audit 47 trang: 23 cần history, 24 tool/dashboard không cần). Còn lại: frontend custom pages (products/PBH/customers/purchase-refund/returns/reconcile/kpi — data đã chảy sẵn) + wire ~11 route Wave 2.
- Cần Render deploy (variants/users sink). Module + page-builder frontend đã push.

### [fix] video-maker — giọng đã thêm từ kho KHÔNG hiện lần đầu (init ordering) + dedup giọng trùng

User: vào trang chỉ thấy 3 giọng built-in; **đổi radio chọn giọng thì giọng đã thêm mới hiện**. Kèm lỗi phụ: 2 mục "Adam 3" (built-in + thêm từ kho cùng proId).

- **Root cause (ordering race)**: `init()` gọi `renderVoices()` (line ~1315) TRƯỚC `Web2VideoLibraryUI.init()` — nơi mới gọi `Web2VideoTTS.loadLibraryVoices()` push giọng kho (localStorage `web2_vm_lib_voices`) vào `VOICES`. → render đầu chỉ có built-in; click radio mới re-render thấy giọng kho.
- **Fix 1 (ordering)** `video-maker.js`: gọi `global.Web2VideoTTS.loadLibraryVoices()` (try/catch) NGAY TRƯỚC `renderVoices()` trong `init()`. Library UI init vẫn gọi lại loadLibraryVoices (idempotent, có guard `hasVoice`).
- **Fix 2 (dedup)** `video-tts.js`: thêm `_providerId(v)`+`_findByProvider(meta)` (khoá theo proId/elevenId/voiceId). `addLibraryVoice` trả id entry sẵn có nếu trùng provider (vd built-in `pro-adam3` cùng proId với "Adam 3" trong kho → chọn lại, KHÔNG tạo entry 2). `loadLibraryVoices` bỏ qua entry trùng + `_persistLib()` DỌN khỏi localStorage (tự sửa dup đã lưu).
- **Verify LIVE** (browser test, seed localStorage 3 giọng kho gồm 1 Adam 3 trùng): first-paint render đủ 5 giọng KHÔNG cần click; `adam3Count=1` (đã dedup); localStorage còn 2 entry (dup bị dọn). **Adversarial review workflow 4 agent (ordering/dedup/regression) = 0 issue.**
- Files: `js/video-maker.js`, `js/video-tts.js`, `index.html` (bump ?v=20260622i). Tĩnh GH Pages.

### [fix/ux] video-maker — "Tông giọng" tự TẮT khi chọn giọng AI Pro/Clone (giữ nguyên gốc)

User: chọn Giọng AI Pro "Adam 3", điền văn bản → "Tạo giọng đọc" nghe **giống ~80% chứ không 100%**; hỏi "Tông giọng" (Trầm/Chuẩn/Cao) hay nút "Tạo giọng đọc" có tác động vào vivibe không, nếu có thì thêm nút tắt.

- **Điều tra (không phải bug)**: (1) "Tông giọng" = pitch resample, đã có guard `!isServer` trong `synthesize` → giọng server (pro/vieneu/elevenlabs) KHÔNG bao giờ bị áp pitch; thêm nữa user đang để "Chuẩn" (pitch 1.0 = no-op). (2) Nút "Tạo giọng đọc" (`genNarration`→`synthesize`→`_proChunk`) và "Nghe thử" trong kho giọng (`previewProVoice`→`synthVoiceMeta`→`_proChunk`) gọi **CÙNG 1 API vivibe** (`/api/web2-tts-pro`, chỉ gửi `text`+`voice_id`+`speed=1.0`), **KHÔNG có xử lý/biến đổi client-side**. → ~80% là TTS đọc văn bản khác nhau có ngữ điệu khác, **timbre/giọng giống 100%** (cùng `proId`). Tông giọng KHÔNG phải nguyên nhân.
- **Sửa UX (làm rõ "đã tắt")**: thêm `Web2VideoTTS.isPitchCapable(voiceId)` (nguồn duy nhất, mirror guard — chỉ mms/piper áp pitch). `renderVoices()` khi giọng Pro/clone: chip Tông giọng `disabled` + `.vm-chips.is-off` mờ + ghi chú `#vmTonesNote` "Giọng cao cấp / Clone giữ nguyên giọng gốc — tông giọng không áp dụng (đã tắt)." KHÔNG đụng `tonePitch()`/per-scene (guard per-voice trong `synthesize` vẫn đúng cho multi-narrator).
- Files: `web2/video-maker/js/video-tts.js` (+isPitchCapable, export), `js/video-maker.js` (renderVoices), `index.html` (#vmTonesNote + bump ?v=20260622h), `video-maker.css` (.vm-chips.is-off + .vm-chip:disabled). Tĩnh GH Pages — không cần deploy Render.

### [feat] Per-record history (Web2AuditLog.openRecord) — nền tảng + reference native-orders/so-order

User: mọi trang Web 2.0 tham chiếu module audit để hiện lịch sử chỉnh sửa THEO TỪNG RECORD (vd native-orders/so-order hiện lịch sử ở đơn). Đây là NỀN TẢNG cho rollout toàn hệ thống (audit→implement→debug→lặp).

- **Backend** `audit-log.js`: `/list` thêm lọc `entityId` (lịch sử của 1 record cụ thể) — khớp cột `entity_id` của union. Còn `/purge` (commit trước) đã deploy.
- **Module** `web2-audit-log.js`: `Web2AuditLog.openRecord({entity, entityId, title})` = modal per-record (tự inject modal CSS, scope NV/admin giữ nguyên, showFilters:false). `load()` ưu tiên `opts.entity/entityId`. Bump `?v=20260622al2`.
- **Wire sink thêm 2 route**: `native-orders.js` (create/create-manual/update/confirm/cancel → entity='native-order', user từ token/\_editor/createdBy) + `web2-so-order.js` (/save document-level → entity='so-order', id='main'; per-shipment để đợt rollout).
- **Frontend reference**: native-orders thêm nút 🕘 per-order (col-actions) → `openHistory(code)` → openRecord; so-order thêm nút "Lịch sử" toolbar → openRecord('so-order','main'). Load `web2-audit-log.js` + bump versions.
- Cần Render deploy. Sau verify 2 trang → audit toàn bộ trang còn lại + nhân rộng.

### [fix] inventory-tracking (Web 1.0) — sửa "Đợt 3 hiện thanh toán đợt cũ": di chuyển đơn giữa đợt KÉO theo thanh toán + default số đợt an toàn

User: modal "Thanh Toán CK Theo Đợt" của Đợt 3 hiện danh sách CK của **đợt cũ** (Đợt 2). Điều tra DB thật (read-only `--inspect`): chỉ có 3 đợt (1=11 ngày, 2=17 ngày, 3=1 ngày) — **đợt span nhiều ngày là ĐÚNG model** (2026-05-31 "đợt tách theo dotSo"), KHÔNG phải trùng số. Tổng screenshot 303.112 = đúng payment Đợt 2 (trước khi thêm entry 50k) → **Đợt 3 đã từng hiện payment Đợt 2**. Data hiện tại đã sạch (user nhập lại Đợt 3 = 1 entry 100k đúng, xác nhận). **Root cause**: `PUT /shipments/:id` dùng `COALESCE($20, thanh_toan_ck)` → **đổi số đợt của 1 đơn nhưng GIỮ nguyên mảng thanh toán đợt nguồn** → đơn mang payment đợt 2 sang đợt 3 (aggregation gom theo dotSo → đợt 3 hiện nhầm).

- **Fix chính** `render.com/routes/v2/inventory-tracking.js` `PUT /shipments/:id`: khi `dot_so` đổi sang **đợt khác** mà client không gửi `thanh_toan_ck` riêng → **đồng bộ thanh toán + tỉ giá theo ĐỢT ĐÍCH** (lấy từ 1 dòng đợt đích, ưu tiên non-empty; đợt đích mới toanh → `[]`). Không còn kéo theo payment đợt nguồn.
- **Default số đợt an toàn (HYBRID)**: `next-dot-so` + default `POST /shipments` + frontend `_computeDefaultDotSo`: ngày ĐÃ có đợt → MAX của ngày đó; ngày MỚI → **MAX toàn cục** (tiếp tục đợt mới nhất, KHÔNG về 1 → tránh nhập nhầm vào Đợt 1 cũ + kế thừa TT). Thêm nút **"Đợt mới"** (`modal-shipment.js`, global MAX+1 hỏi server) cho đợt hoàn toàn mới.
- **KHÔNG migration data** — đợt 1/2/3 span nhiều ngày là đúng; data hiện sạch. (Script renumber bản nháp đã xóa: premise sai sẽ tách nhầm đợt span-ngày.)
- 2 review song song trước đó (regression sweep 0 lỗi + code-review) vẫn áp dụng cho phần numbering. Cần Render deploy backend + GH Pages deploy frontend.

### [feat] Audit-log "THẬT SỰ toàn bộ" — event-sink chung web2_audit_events (gom 6 nguồn lịch sử riêng)

Tiếp theo việc gộp audit-log: user phát hiện purchase-refund (+ nhiều trang) vẫn có lịch sử RIÊNG mà audit-log union (4 bảng) chưa phủ. Chốt **Event-sink chung**: 1 bảng `web2_audit_events`, mọi mutation ghi thêm 1 dòng → audit-log union đọc → thật sự toàn bộ. Timeline inline từng record GIỮ NGUYÊN (đây là bản ghi song song, best-effort).

- **Helper mới** `render.com/services/web2-audit-sink.js`: `recordAuditEvent(pool, {entity,entityId,action,userId,userName,sourcePage,changes})` + `ensureAuditSinkTable`. Best-effort (nuốt lỗi, KHÔNG chặn flow chính), `_ensured` cache CREATE TABLE, cap `changes` JSON ~8KB. Unit-test mock pool PASS.
- **audit-log.js**: thêm block union thứ 5 `web2_audit_events` (ensure bảng đầu /list, include thẳng KHÔNG qua `_tableExists` để tránh stale-false 5'). `/entities` trả entity ĐỘNG (4 bảng + DISTINCT entity sink). KHÔNG đếm 2 lần (sink chỉ ghi nguồn chưa có bảng riêng).
- **Wire 7 route** (post-commit, user-attributed): `web2-generic.js` + `web2-dedicated-entity.js` create/update/delete (phủ 78+ entity generic) · `purchase-refund.js` 5 endpoint (approve/quick-refund/cancel-approve/refunded/reject) · `web2-customers.js` create/update/archive/delete/merge · `web2-payment-signals.js` confirm/dismiss/link/approve · `web2-returns.js` create×2/approve · `kpi.js` PUT employee-ranges (đổi phân công STT). Bỏ qua import/harvest/enrich tự động (không user).
- **Frontend** `web2-audit-log.js`: thêm 5 nhãn entity (Hoàn NCC/Khách hàng/Tín hiệu CK/Trả hàng/Phân công KPI) + pill màu + **dropdown lọc ĐỘNG** từ `/entities`. Bump `?v=20260622al2`.
- Cần Render deploy. Scope NV/admin giữ nguyên (sink rows cũng qua filter scope vì có user_id/user_name). Local syntax sweep 10 file PASS.

### [feat] Web 2.0 — module DỊCH THUẬT dùng chung (LLM free + fallback Google) + cắm sound-fx

Research GitHub (LibreTranslate self-host, Lingva/Google free proxy) + tái dùng chuỗi LLM sẵn có. Build module dịch dùng chung cho Web 2.0 (động cơ: tự dịch mô tả tiếng động VN→EN bất kỳ, thay từ điển 26 từ cứng).

- **Backend** `services/web2-translate-service.js`: `translate(text,{to,from,context})` ưu tiên **Groq (free llama-3.3-70b) → DeepSeek → Gemini** (mirror web2-caption-service, ngữ cảnh tốt: "tiếng chó sủa"→"dog barking"); thiếu key/lỗi → **fallback FREE KHÔNG KEY** Google public endpoint; kẹt hết → nguyên văn (không vỡ luồng). Route `routes/web2-translate.js` (`GET /status`, `POST /` requireWeb2AuthSoft+rate 60/min). Mount server.js. Worker auto-forward (prefix web2-).
- **Client** `web2/shared/web2-translate.js` (`Web2Translate.translate/toEn/toVi/status`) — cache phiên, lỗi → nguyên văn; auto-load qua sidebar → mọi trang gọi được, KHÔNG tự fetch.
- **Cắm sound-fx**: `web2-elevenlabs-service.soundEffect` — mô tả VN không khớp từ điển → gọi translate (LLM) ra prompt EN mô tả tiếng động → ElevenLabs tạo đúng tiếng (giờ MỌI mô tả VN chạy, không chỉ 26 từ).
- Cần Render deploy web2-api (đụng service). Sidebar autoload entry vào src nhưng KHÔNG sweep bump 44 file (tránh đụng agent khác) → kích hoạt global khi sidebar version bump kế.

### [change] Lịch sử thao tác Web 2.0 — gộp về 1 NGUỒN (module chính Web2AuditLog) + scope NV/admin

User hỏi: tab "Audit log" trong `web2/kpi` có dùng nguồn của trang `web2/audit-log` không? → KHÔNG, trước đây là 2 nguồn khác nhau (KPI tab = `/api/web2/kpi/events` KPI-events; trang audit-log = `/api/web2/audit-log` union 4 bảng). User chốt: **audit-log = module chính (audit log toàn bộ)**, xóa KPI-events tab cũ, tab KPI làm lại theo audit-log; **NV xem thao tác của chính mình, admin xem tất cả**.

- **Backend** `render.com/routes/v2/audit-log.js` `/list`: thêm **scope server-side** theo `req.web2User` (do `requireWeb2AuthSoft` gắn). `role==='admin'` → xem hết + lọc user tự do; NV khác → **ÉP** match chính mình (`user_id`=id/username OR `user_name`=display/username, bỏ qua filterUser); không token → rỗng + `requireAuth`. Trả thêm `viewer:{scope,role,name}`.
- **Shared module MỚI** `web2/shared/web2-audit-log.js` (`window.Web2AuditLog`) = **1 nguồn dùng chung**: tự inject CSS + filter bar (entity/user/from/to) + bảng `.data-table` + scope-aware (ẩn ô lọc User khi `scope==='self'` + badge "🔒 Chỉ thao tác của bạn" / "🌐 Toàn bộ (admin)"). API `mount(target,opts)` / `reload()`. GMT+7. ~265 dòng.
- **`web2/audit-log/index.html`**: thin → bỏ inline script + CSS trùng, chỉ `Web2AuditLog.mount('#auditMount')`.
- **`web2/kpi/`**: tab đổi nhãn "Audit log" → "Lịch sử thao tác"; `kpi-dashboard.js` xóa `loadEvents`/`renderEventsLog` (KPI-events feed) + `fmtDate` dead, thêm `renderAuditLog()` mount module; SSE chỉ refresh khi ở tab KPI; dọn class `w2al` khi về tab KPI. Bump `?v=20260622al1`.
- **KHÔNG** thêm `web2_kpi_events` vào union (user yêu cầu xóa KPI-events; leaderboard KPI vẫn ở tab "KPI"). Cần Render deploy để scope NV có hiệu lực; frontend verify localhost OK (cả 2 trang mount, 76 rows, 0 page error, switch tab OK).

### [fix] video-maker "Hiệu ứng âm thanh (AI)" — đọc chữ thay vì tạo tiếng động (prompt VN→EN)

User: gõ "tiếng vỗ tay"/"tiếng mưa" → ra GIỌNG ĐỌC chứ không phải tiếng động. Code path đúng (gọi ElevenLabs `sound-generation`, không phải TTS). Gốc: **sound-generation cần prompt TIẾNG ANH**; prompt tiếng Việt bị hiểu là lời nói → đọc thành giọng (verify live: "tiếng vỗ tay" auto→0.6s giọng; "applause" auto→1.1s tiếng vỗ tay thật).

- **web2-elevenlabs-service.js**: thêm `toSoundPrompt()` — bỏ từ đệm ("tiếng"/"âm thanh"…) rồi map ~26 mô tả VN phổ biến → prompt EN mô tả tiếng động (vỗ tay→applause, mưa→rain, leng keng tiền→coins cha-ching, whoosh, sấm, pháo hoa, chim, còi xe, đồng hồ…); không khớp + còn tiếng Việt → `sound effect of <…>`; tiếng Anh giữ nguyên. `soundEffect()` dịch trước khi gọi API. ⚠ bẫy đã fix: "tiếng" chứa "tien" → khớp nhầm coins → phải bỏ từ đệm TRƯỚC + `\btien\b`.
- **video-maker**: thêm 6 chip preset 1-chạm (Vỗ tay/Mưa/Tiền/Whoosh/Chuông/Pháo hoa) → điền + tạo luôn; sửa hint "tạo TIẾNG ĐỘNG thật, không đọc chữ". Bump video-maker.js?v=20260622g.
- Cần Render deploy web2-api (đụng service) để có hiệu lực. Unit-test 13 mẫu PASS.

### [change] so-order — bỏ nốt nút "Quét mã" (camera barcode) trong modal Tạo Đơn Hàng

Tiếp yêu cầu: gỡ luôn nút "Quét mã" (sau khi đã gỡ "Đọc nhãn"). Modal giờ chỉ còn nút "Thêm sản phẩm" để thêm dòng SP thủ công.

- `so-order/index.html`: gỡ button `#soModalScanBtn` + `<script web2-barcode-scanner.js>` (so-order không còn dùng).
- `so-order-modal-core.js`: gỡ handler `scanBtn.onclick` + helper **dead** `_addRowFromScannedCode` (chỉ phục vụ 2 nút quét/đọc đã bỏ).
- **GIỮ** module shared `web2-barcode-scanner.js` (reconcile + web2-pack-counter + web2-label-ocr còn dùng).
- **Verify browser**: modal mở OK, `#soModalScanBtn` + `#soModalOcrBtn` đều gone, `#soModalAddRowBtn` còn, `_addRowFromScannedCode` undefined, **0 console error**. Bump `?v=20260622x3` (core.js).

### [change] so-order — "Điền ngẫu nhiên" GẮN LẠI ảnh ngẫu nhiên (Lorem Picsum, free no-key) + bỏ nút "Đọc nhãn"

User: (1) nút "Điền ngẫu nhiên" tạo data test nhưng không có ảnh → muốn dán ảnh ngẫu nhiên (tìm api/ảnh free dùng nhanh); (2) bỏ nút "Đọc nhãn" (OCR) trong modal.

**(1) Ảnh ngẫu nhiên** (workflow research 5-agent → chốt nguồn): **Lorem Picsum theo seed** = free, KHÔNG key, chỉ là URL string (`https://picsum.photos/seed/{seed}/{w}/{h}` — không fetch, hiển thị thẳng `<img>`), cùng seed→cùng ảnh (ổn định, không nhấp nháy khi re-render), seed-based nên không rot, CDN Cloudflare nhanh ở VN. (Loại LoremFlickr: proxy Flickr hay 500 + chậm 1-1.5s; loại curated DummyJSON/Unsplash: hardcode id dễ rot.)

- `so-order-modal-random.js`: thêm `SO._rImg(seed,w,h)`; `_randomRow(isVnd, rowSeed)` set `productImage` = picsum seed (mỗi dòng seed riêng `${batch}-r${i}` → ảnh khác nhau); `fillModalRandom` set `SO.modalInvoiceImage` = picsum 600x400 (ảnh hoá đơn cấp đơn, mỗi lần fill khác seed). Row kế thừa invoiceImage qua `_newModalRow` default.
- **Fallback offline-safe** (`so-order-modal-image.js`): `<img onerror>` → **SVG data-URI LOCAL** (không cần mạng → LUÔN hiển thị, không bao giờ ra icon ảnh vỡ; mạnh hơn placehold.co của research vì không phụ thuộc host ngoài). Guard `dataset.fb` chống loop.
- **Verify browser**: fill → 2-3 dòng đều có `productImage` picsum seed riêng + invoice 600x400, badge "Đã có ảnh" hiện; data-URI fallback render OK (nw=300, test env chặn net ngoài → slot ra placeholder "—" sạch, không vỡ). Trên máy user (net thường) → ảnh picsum thật.

**(2) Bỏ "Đọc nhãn" (OCR)**: gỡ button `#soModalOcrBtn` + handler `ocrBtn.onclick` + `<script web2-label-ocr.js>` khỏi so-order (chỉ so-order dùng qua nút này). **GIỮ** module shared `web2-label-ocr.js` vì reconcile + web2-pack-counter còn dùng. Nút "Quét mã" (camera barcode) giữ nguyên.

- Bump `?v=20260622x2`: so-order-modal-{core,image,random}.js.

### [feat] inventory-tracking convert-PO — nút "Lưu nháp" (localStorage) ẩn/hiện theo Mã SP

User: form "Tạo đơn đặt hàng" (modal Convert NCC → PO) thêm nút **Lưu nháp** lưu lại toàn bộ thông tin đã điền; **hiện** nút khi CHƯA dòng nào có Mã SP, **ẩn** khi bất kỳ dòng nào có Mã SP. (Lý do: `_confirmConvertToPO` BẮT BUỘC mọi SP có Mã SP mới "Tạo đơn hàng" được → khi đang dở chưa gán mã, cần lưu nháp để quay lại sau.)

- **Lưu vào (user chọn)**: localStorage máy này, key `invtrk_convertpo_draft_<invoiceId>`. Lưu `_convertItems` + supplier/date/invoiceAmount/notes + discount/shipping + ảnh hóa đơn đã chọn. KHÔNG đụng backend/PO.
- **Khôi phục**: mở lại modal NCC đó → thanh amber `.po-draft-bar` đầu modal "Có bản nháp đã lưu lúc … (N SP)" + nút **Khôi phục** (`_applyDraft` → set state + re-render + fill input) / **Bỏ nháp** (`_clearDraft`).
- **Hiện/ẩn nút**: `_updateSaveDraftVisibility()` = `_convertItems.some(it=>productCode)` → ẩn. Hook vào `_recalcAll`, `_rerenderItemsTable`, `_onItemInput` (gõ Mã SP), `_generateCodeForItem`, `_generateCodesForAll`. Tạo đơn thật xong → `_clearDraft` xoá nháp.
- **Sửa**: `modal-convert-po.js` (+helpers draft, bind nút, restore bar), `index.html` (nút `#btnSaveDraftConvertPO` ẩn sẵn trong footer + bump `?v=20260622b`), `modal-convert-po.css` (`.po-draft-bar` + bump). KHÔNG file mới (state module-local nên phải nằm trong modal-convert-po.js).
- **Verify (Playwright, localhost, fake dot + stub — KHÔNG ghi prod)**: mở modal 2 SP không mã → nút hiện; bấm Lưu nháp → localStorage có draft (2 SP, supplier đúng); gõ Mã SP → nút ẩn; xoá mã → nút hiện lại; đóng+mở lại → thanh khôi phục + 2 nút hiện. node --check pass. Screenshot khớp: bar amber + footer Hủy/Lưu nháp/Tạo đơn hàng.

### [feat] inventory-tracking — cây bút ở ô STT: tìm nhanh SP từ kho → điền TÊN vào ô Mã hàng

User: thêm cây bút ở ô STT, bấm → hiện ô tìm nhanh sản phẩm từ kho → chọn → điền **tên** SP vào ô "Mã hàng". (Trang Web 1.0 → KHÔNG import web2/; tham chiếu UX của picker so-order nhưng so-order là Web 2.0 nên KHÔNG dùng được.)

- **Nguồn dữ liệu (Web 1.0-safe)**: `window.WarehouseAPI.search(q, 20)` → `GET /api/v2/web-warehouse/search` (đã load sẵn `shared/js/warehouse-api.js` trong trang, dùng cho picker `modal-convert-po.js`). Trả `product_code/name_get/product_name/selling_price/tpos_qty_available/image_url`. Tên hiển thị/điền = `name_get` đã bỏ tiền tố `[CODE]`.
- **File mới (user chọn tách riêng)**: `inventory-tracking/js/product-quick-pick.js` (global `window.openProductPicker(invoiceId, productIdx, btnEl)` + `closeProductPicker`) + `inventory-tracking/css/product-quick-pick.css` (nút `.btn-pick-stt` + panel `.iqp-*`, floating `position:fixed`, debounce 220ms, điều hướng ↑/↓/Enter/Esc, click-ngoài/scroll đóng, `overscroll-behavior:contain`).
- **Sửa**: `table-renderer.js` thêm nút `.btn-pick-stt` (icon `pencil-line`) vào ô STT cạnh nút copy (chỉ dòng có SP). `index.html` thêm `<link>`+`<script>` mới + bump `table-renderer.js?v=20260622a`.
- **Pick → fill**: set `product.maSP = <tên SP>` (UI-first: cập nhật model + ô tại chỗ giữ nguyên nút bút/badge, rồi lưu nền `shipmentsApi.update(invoiceId,{sanPham,tongMon,tongTienHD})`, lỗi → rollback). Cùng đường lưu với `commitInlineEdit`.
- **Verify (Playwright, localhost, admin)**: panel mở + auto-focus, search trả 20 KQ, `[CODE]` bị strip, ô Mã hàng = TÊN SP, payload save mang đúng tên + invoiceId, giữ nút bút sửa, panel đóng sau khi chọn. Test bằng dot ảo + stub `shipmentsApi.update` → **KHÔNG ghi prod** (inventory-tracking là Web 1.0 PROD). node --check pass. Screenshot panel khớp UX mong muốn (ảnh + mã + tên + giá xanh + Tồn).

### [fix] native-orders — TAG thêm vào bị "giật" → cập nhật cell tại chỗ + animate pill mới mượt

User báo: khi 1 thẻ (cột "Thẻ") được thêm vào đơn thì hơi giật. Gốc: `_rowSignature` gồm `JSON.stringify(autoTags)` → tag đổi là **rebuild CẢ row** (`replaceChildren`) → avatar `<img>` bị tạo lại (nguy cơ reload) + pill mới hiện ĐỘT NGỘT (không transition) + row có thể nhảy chiều cao.

**Fix (tách tín hiệu + update tại chỗ + animate có chủ đích — compositor-only):**

- **Tách chữ ký**: bỏ `autoTags` khỏi `_rowSignature` (giữ `hasChoHang` vì nó đổi nút col-actions). Thêm `_rowTagSignature` + `_rowTagTriggers` theo dõi riêng.
- **renderRows**: khi "rest" giống mà CHỈ tag đổi → cập nhật `innerHTML` cell `.col-tag` **TẠI CHỖ** (giữ nguyên DOM avatar + cell khác → hết giật, hết reload ảnh), KHÔNG rebuild row. Khi "rest" đổi → rebuild như cũ.
- **Animate đúng pill mới**: diff `newTagTriggers \ oldTagTriggers` → chỉ pill THẬT SỰ mới gắn class `.w2-otag-enter`. Không animate khi load lần đầu (oldSet=null) hay khi render lại field khác.
- **Animation** (`web2/shared/web2-effects.css`): `@keyframes w2fxTagIn` (scale 0.5→1.12→1 + fade, overshoot mềm `cubic-bezier(0.34,1.56,0.64,1)` 340ms) — chỉ `transform`+`opacity`, tôn trọng `prefers-reduced-motion`.
- **`Web2OrderTagPill.html`**: thêm `opts.enter` → gắn class (1 nguồn, trang khác tái dùng được).
- **Chống re-pop**: gỡ class `.w2-otag-enter` qua `animationend{once}` sau khi pop xong — vì renderRows move row reused ra/vào document qua fragment, class còn sót có thể chạy lại animation mỗi lần render (SSE) → giật ngược.
- **Verify browser** (simulate add tag → renderRows): `sameRowNode=true`, `sameImgNode=true` (không reload avatar), chỉ 1 pill mới có `.w2-otag-enter` (`animationName=w2fxTagIn`), sau animation class tự gỡ, render lại KHÔNG re-pop. Screenshot pill "Test Tag" đỏ render đúng.
- Bump `?v=20260622tag`: web2-effects.css (7 trang), web2-order-tag-pill.js (native-orders + order-tags), native-orders-render.js.

### [change] so-order — "Điền ngẫu nhiên" tạo data test KHÔNG kèm hình

User yêu cầu data ngẫu nhiên trong modal Tạo Đơn Hàng (Nháp) không có ảnh.

- `so-order/js/so-order-modal-random.js`: bỏ sinh URL `picsum.photos` → `productImage`/`invoiceImage` để rỗng; xoá helper `_rImg` (dead code) + dòng gán `modalInvoiceImage` từ row đầu (luôn rỗng). `fillModalRandom` giữ `modalInvoiceImage=''`.
- Áp cho cả nút "Điền ngẫu nhiên" trong modal lẫn `generateRandomOrders` (toolbar) vì cùng đi qua `_randomRow`.
- Verify browser (localhost, ext): mở modal + fill → 3 dòng, mọi `productImage`/`invoiceImage`=`""`, `modalInvoiceImage`=`""`, 0 ảnh picsum trong form; screenshot xác nhận ô "Ảnh hóa đơn" + cột "Hình ảnh sản phẩm" hiện ô dán ảnh trống (không còn badge "Đã có ảnh").

### [fix] video-maker — giọng tạo "không giống Adam 3": mặc định + tự chọn khi thêm + bỏ pitch giọng server

User chọn Adam 3 (Giọng AI Pro) nhưng tạo ra giọng khác. Probe API: `ttsLongText` ÁP ĐÚNG voice id (Adam 3 nam ≠ Chi Chi nữ, md5 khác) → API không lỗi. Gốc ở pipeline FE:

1. **`state.voiceId` mặc định `'mms'`** (giọng nữ on-device) dù VOICES[0]=pro-adam3 → tạo lời đọc dùng MMS. Đổi mặc định `'pro-adam3'`.
2. **"Thêm" giọng từ kho KHÔNG tự chọn** → thêm Adam 3 xong vẫn đang chọn MMS. Thêm callback `onSelect` (video-maker init) → addProVoice/addShared/addPiper gọi `_ctx.onSelect(id)` → chọn luôn giọng vừa thêm.
3. **Pitch (tông Trầm/Cao) resample làm méo giọng server** (pro/vieneu/elevenlabs đã là giọng clone hoàn chỉnh) → synthesize CHỈ áp pitch cho on-device (mms/piper), bỏ qua server.

- Không có method "add community voice → account" qua API key (đều bị chặn) → dùng thẳng community id trong `userVoiceId` (đã verify chạy). Bump video-maker/video-tts/video-library?v=20260622f.

### [test] Zalo rebuild Phase 5 — test render engine + docs + memory

Khép lại rebuild Zalo. Toàn frontend/docs/test — KHÔNG chạm render.com (không restart server).

- **Test regression**: `scripts/test-web2-zalo-render.js` (Playwright headless, localhost, KHÔNG cần TK Zalo). Khôi phục phiên login từ secret file (fallback form-login) → mở trang Zalo → `page.evaluate` assert **18 điểm** thuần render: text/image/link-card/link-fallback/video-player/voice/contact/location/system bubble + tin hệ thống không phải bubble + grouping + tool xoá-phía-tôi + composer mic/voicebar/quick + ZNS form động (3 ô) + ZaloApi methods (addQuickReply/deleteMessage/pin/mute/mark) + 0 lỗi console. Exit 0/1 (CI-friendly). **Chạy thật: 18/18 PASS, 0 lỗi.** Bổ sung vào bộ 4 script test sẵn có.
- **Docs**: `docs/web2/ZALO-INTEGRATION.md` thêm §0c "REBUILD v2 (2026-06-22)" tổng hợp 5 phase + cột/route/asset mới + login truth (cookie vs QR).
- **Memory**: `reference_web2_zalo.md` thêm đoạn rebuild v2 + cập nhật mục hạn chế (voice/delete-me/pin-mute-mark/video-contact-location/system đã XONG; tách route + sendCard HOÃN).
- **Tổng kết rebuild**: P1 login watchdog · P2 UI 3-pane + thông báo + quản lý hội thoại + quick-reply + ZNS form + link card · P3 voice + xoá-phía-tôi + video/danh thiếp/vị trí · P4đợt1 tin hệ thống nhóm · P5 test+docs. **Hoãn**: tách route 2240 dòng (rủi ro, làm khi login ổn). **Chờ**: deploy Render + login acc thật để verify live.

Group richness: bắt sự kiện nhóm Zalo → hiển thị dòng hệ thống giữa khung chat (giống app Zalo). Trước đây listener CHỈ nghe `message` → sự kiện nhóm bị bỏ hoàn toàn.

- **Backend** (`web2-zalo-zca.js`): listener thêm `on('group_event')` → `_normGroupEvent` (đọc `e.threadId/data.groupId`, `updateMembers[].dName`) → `_groupEventText` map sang câu tiếng Việt cho 13 loại đáng hiển thị (join/leave/remove/block/add_admin/remove_admin/update/update_avatar/update_setting/new_pin_topic/new_link/join_request; loại không đáng hiển thị như reorder-pin/board/remind → bỏ qua). Tin hệ thống đi qua `onMessage` → persist + SSE như tin thường. **`direction:'system'`** → KHÔNG cộng unread (persist chỉ +1 khi `direction==='in'`), KHÔNG đụng tên hội thoại.
- **Frontend** (`bubbles.js`): `renderMessages` bắt `msg_type==='system'` TRƯỚC khối bong bóng → render `.wz-sys-msg` (pill xám căn giữa, max 80%), reset grouping. CSS `.wz-sys-msg` (chat-bubbles.css).
- **Verify browser (localhost, 0 lỗi console)**: render [text, system, text] → 1 dòng `wz-sys-msg` ("B đã tham gia nhóm"), KHÔNG nằm trong bubble, 2 tin text vẫn là 2 bubble (grouping nguyên). node --check pass. Bump `?v=20260622p6` (bubbles + chat-bubbles.css + ENGINE_VER).
- **⚠ Push này chạm `render.com` → Render restart server Zalo (lần restart cuối của đợt) — login lại nên làm SAU push này trong cửa sổ yên tĩnh.**
- **HOÃN trong Phase 4**: tách module route 2240 dòng `web2-zalo.js` — rủi ro cao (refactor lớn, dễ vỡ login), 0 giá trị người dùng, lại đang có nhiều session khác push `render.com` + cần server ổn định để bạn login. Để dành làm trong session riêng khi login đã ổn. Polls/notes/reminders nhóm: bỏ (YAGNI cho shop).

Audit responsive 13 trang đã unify ở 320/375/768px (Playwright headless + restore session): **document overflow = 0 mọi trang** (web2-mobile.css đã handle tốt). NHƯNG screenshot 375px lộ 3 vấn đề layout (cắt control trong scroll-container, không phải tràn document):

- **Header trang crammed**: nhiều header dùng class riêng (`rc-page-head/sd-page-head/page-head-mini/u-page-head/web2-main-header`…) KHÔNG có trong allowlist xếp-dọc của mobile CSS → tiêu đề wrap 4-5 dòng, nút phải (Lịch sử/Camera, refresh) bị cắt. **Fix tổng quát (hết whack-a-mole)**: `body:has(.web2-shell) main > header { flex-direction:column }` + cap `h1/h2 { font-size: clamp(18px,4.6vw,24px) }`. Chỉ tác động header flex con-trực-tiếp của main (header section lồng trong `<section>` của overview KHÔNG bị đụng).
- **Hàng nút hành động tràn**: supplier-debt `.sd-filter-actions` (Áp dụng/Reset/Tạo NCC/Xuất CSV) → "Xuất CSV" bị cắt. Thêm `.sd-filter-actions/.sw-page-actions/.rc-actions` vào rule `flex-wrap:wrap`.
- **Reconcile ô quét barcode tràn**: `.rc-scanner-box` (input + chip "Chưa chọn PBH" + 2 nút camera/OCR) → nút camera bị cắt mép. Thêm `.rc-scanner-box{flex-wrap:wrap}` + input `flex:1 1 100%`.
- **Verify browser 375px**: supplier-debt tiêu đề 1 dòng + nút wrap đủ; reconcile header gọn + ô quét wrap (2 nút camera hiện đủ); users sạch. **Re-audit overflow = 0/13 (không regression)**. Counter-pill canonical pale-blue hiển thị đồng nhất mọi trang.
- Bump `web2-mobile.css?v=20260622c` (qua web2-sidebar.js — inject mọi trang).

### [feat] Zalo rebuild Phase 3 (đợt 2) — render video inline + danh thiếp + vị trí

Lấp các loại tin Zalo chưa hiển thị đẹp (render-side, verify-được full trên localhost không cần TK). Sticker packs đã đủ (picker hiện có: tìm + chip gợi ý + recents → KHÔNG gold-plate).

- **Trình phát video inline**: `bubbles.js` kind `video` đổi từ link mở tab → `<video controls preload=metadata poster=thumb>` (CSS `.wz-msg-video-player` max 280px/360px nền đen).
- **Danh thiếp (contact)**: `_extractAttachment` (service) gom `uid/phone/tên/avatar` cho kind `contact` (chat.recommended); `bubbleKind`+`body` render card (avatar + tên + SĐT/“Danh thiếp Zalo”). CSS `.wz-msg-contact`.
- **Vị trí (location)**: `_extractAttachment` gom `lat/lon/địa chỉ` → link Google Maps; `body` render card (icon ghim + địa chỉ). CSS `.wz-msg-location`.
- **Service normalizer**: nới điều kiện push attachment (`|| att.uid || att.lat`) để contact/location không có url/thumb vẫn lưu; text caption lấy `att.title` cho 2 kind này; cap (caption) bỏ cho contact/location/link; `has-media` loại trừ contact/location (giữ bubble thường).
- **Verify browser (localhost, 0 lỗi console)**: render video→`wz-msg-video-player`; contact→card có tên+SĐT; location→card có link maps. node --check pass. Bump `?v=20260622p5` (bubbles.js + chat-bubbles.css + ENGINE_VER).
- **Drop khỏi đợt này**: gửi danh thiếp (`sendCard`) — hoãn vì cần điểm vào UI gọn (ô soạn đã chật 7 nút); sticker packs đã đủ. Phase 4 kế: richness nhóm + tách route 2203 dòng.

Sau đợt đồng nhất giao diện, dọn CSS chết (đã verify kỹ: không HTML/JS nào nạp + class không dùng trong markup + không trong sidebar):

- **`web2/balance-history/css/transfer-stats.css`** (505 dòng) — orphan, `.ts-*` không trang nào nạp/dùng (feature transfer-stats đã refactor đi từ lần clone balance-history `9cd8e13b8`). Match `.ts-` ở products là false-positive (`products-filters`).
- **`web2/balance-history/css/modern.css`** (1169 dòng) — legacy, balance-history/index.html chỉ nạp `web2-balance-history.css`; modern.css chỉ còn được nhắc trong docs markdown (không phải code).
- **`web2/payment-confirm/css/payment-confirm.css`** (271 dòng) — trang payment-confirm chỉ nạp `web2-theme.css`, dùng **0 class `pc-*`**, không có trong sidebar → CSS không tác động render.
- Verify cuối: `grep` 3 tên file across html/js = **0 reference** → xoá an toàn, không ảnh hưởng giao diện.

### [refactor] Web 2.0 UI đồng nhất — `.counter-pill` gom 1-nguồn (DRY pill đếm)

Pill đếm kết quả (`.counter-pill`, vd "12 đơn") bị **copy-paste fork ở 5 trang** (so-order xanh, reconcile teal, supplier-debt/supplier-wallet/users xám) lệch padding/bg/màu/radius/font, dù shared đã có `.web2-theme .counter-pill` (theme.css:708) set màu xanh nhạt — nhưng forks rò radius/padding/font (đều `999px` nhưng padding 4-6px, font 12px↔0.875rem, weight 500↔600).

- **Canonical hoá triệt để** (theme.css `.web2-theme .counter-pill`): rule shared giờ tự sở hữu **toàn bộ shape** — `display:inline-flex; gap:6px; padding:4px 12px; border-radius:999px (stadium, khớp badge family); font 12px/700; bg var(--web2-primary-soft) #e8f2ff; color var(--web2-primary-hover) #0058da; border var(--web2-primary-soft-2)` → đè mọi fork.
- **Xoá 6 fork page-local** (so-order ×2 gồm `.so-page-counters`, reconcile, `.sd-page-counters`, supplier-wallet, users) → thay bằng comment trỏ nguồn shared.
- **Verify browser**: reconcile counter-pill `rgb(232,242,255)`/`#0058da`/`999px`/`4px 12px`/`12px/700`/border `#bcdcff` — hết teal, đồng nhất pale-blue stadium mọi trang.
- theme.css + 5 page CSS đều đã `?v=t6` (đợt modal/toolbar) → không bump thêm.

### [fix] video-maker VieNeu — tự dò server LOCAL (localhost:8123/8124), khỏi cần tunnel/registry

User cài server NGAY trên máy đang xem trang nhưng "Chưa thấy máy online" (registry rỗng — heartbeat/tunnel không lên). Gốc: trang chỉ dò máy qua registry (cần serve.py heartbeat sau khi tunnel cloudflared lên) → cùng-máy vẫn không thấy nếu tunnel hụt.

- **web2-vieneu.js**: thêm `probeLocal()` — fetch `http://localhost:8123|8124/health` (localhost = potentially-trustworthy, trang HTTPS gọi được + server CORS-allow origin shop). Trả `[{name:'Máy này (engine)',url,local:true}]`.
- **video-vieneu.js**: `refreshServers()` gộp registry + local (local trước, dedupe url); **tự kết nối máy local nếu chưa cấu hình URL** (cài xong là chạy).
- **Verified** (browser + fake /health 8123): chip "Máy này (vieneu) online" + auto-connect "✅ Kết nối OK" + giọng nạp. Bump web2-vieneu.js/video-vieneu.js?v=20260622e.
- Same-machine fix; tunnel vẫn cần cho điện thoại/máy khác (vấn đề riêng). Nếu refresh vẫn trống → process server chưa chạy (mở `http://localhost:8123/health` kiểm tra).

### [feat] Zalo rebuild Phase 3 (đợt 1) — tin thoại (ghi âm) + xoá-ở-phía-tôi (bỏ OA/ZNS khỏi scope)

User: "Không cần OA và ZNS → tiếp tục các phần còn lại". Tập trung chat cá nhân (zca-js). Giữ nguyên 2 tab OA/ZNS (code còn, reversible), drop auto-ZNS. Research zca-js: có `sendVoice/sendVideo` (cần URL hosted), `sendCard`, `deleteMessage(onlyMe)`, `getStickersDetail`. Đợt này build 2 tính năng sạch + verify-được nhất.

- **Tin thoại (ghi âm)**: composer (`zalo-chat/composer.js`) thêm nút mic + thanh ghi âm (`.wz-voicebar`: chấm đỏ nhịp + đồng hồ + Gửi/Huỷ) dùng `MediaRecorder` (chọn mime webm/mp4/ogg, bỏ tin < 0.6s/800B, cleanup mic khi đổi hội thoại). Gửi qua `onSendVoice` (chat-view) → đường `sendFile` đã chứng minh (zca auto-upload Buffer lên CDN) nhưng hiển thị bong bóng `voice` (player audio). KHÔNG dùng zca `sendVoice` (cần URL hosted, phức tạp). CSS `.wz-voicebar` (chat-composer.css, pulse respect reduced-motion).
- **Xoá ở phía tôi (delete-for-me)**: zca `deleteMessage(dest, onlyMe=true)` — KHÁC recall (thu hồi 2 phía). Service `deleteForMe`, route `POST /delete-message` (gọi Zalo + `UPDATE hidden_for_me=true` + `_notifyThread`), cột `web2_zalo_messages.hidden_for_me` (ALTER IF NOT EXISTS — idempotent như 8 cột anh em), messages SELECT lọc `AND NOT COALESCE(hidden_for_me,false)`. `ZaloApi.deleteMessage`, `WZChat.actions.deleteForMe`, nút 🗑 (`data-act=delete-me`) trên MỌI tin (in+out) ở `bubbles.js`, `doDeleteMe` (chat-view, UI-first gỡ khỏi list + rollback) confirm `Popup.danger`.
- **Verify browser (localhost, 0 lỗi console)**: render 2 tin → 2 nút delete-me; voice bubble = `wz-msg-voice`; mount composer tạm → mic + voicebar (hidden) + stop/cancel đủ; `ZaloApi.deleteMessage`/`actions.deleteForMe` = function. node --check pass 8 file. Bump `?v=20260622p4` (api/composer/bubbles/chat-actions/chat-view/chat-composer.css + ENGINE_VER cho trang tiêu thụ).
- **Còn lại**: live verify cần TK Zalo kết nối + deploy Render (route + cột mới). Phase 3 đợt sau: contact card (`sendCard`), sticker pack (getStickersDetail), video player. Phase 4: group richness + tách route 2203 dòng.

### [refactor] Web 2.0 UI đồng nhất — TOOLBAR/bộ lọc tokenize (Step 8, cuối)

Bước cuối đợt đồng nhất giao diện: thanh **toolbar/bộ lọc** mỗi trang dùng class riêng (`.pr-filters/.sd-toolbar/.u-toolbar/.sw-toolbar/.jt-toolbar/.w2bh-toolbar/.rc-toolbar`…) hardcode màu/bo góc lệch nhau. **KHÔNG ép 1 archetype** (giữ nguyên: card nổi vs flush-bar vs bare-flex — đây là lựa chọn layout có chủ đích từng trang), chỉ **thay hardcode → design token** cho nhịp thống nhất.

- **Token hoá** (CSS-only, không đổi markup/layout): `#e2e8f0`/`#e5e7eb` (border) → `var(--border)`; `#fff` (nền) → `var(--surface)`; `#f8fafc`/`#f9fafb` (nền nhạt) → `var(--gray-50)`; `border-radius: 8px|10px` → `var(--web2-radius-sm, 9px)`; `gap: 10px` → `12px` (khớp canonical `.filter-row`).
    - Sửa: supplier-debt `.sd-toolbar`, purchase-refund `.pr-filters`, users `.u-toolbar`, supplier-wallet `.sw-toolbar`, jt-tracking `.jt-toolbar`, balance-history `.w2bh-toolbar`, reconcile `.rc-toolbar` (giữ viền teal accent — chỉ radius), transfer-stats `.ts-filters` (file orphan, không nạp — no-op vô hại).
    - **KHÔNG đổi**: customers `.wc-toolbar` (đã bare-flex gap 12px), kpi `.kpi-toolbar` (đã token + radius 6px/gap 16px ngoài phạm vi). **Loại trừ** (archetype riêng chủ đích): live-tv `.ltv-topbar`, live-control `.lc-toolbar`, system `.sse-toolbar`.
- Canonical `.search-section`/`.filter-row`/`.search-input` + global `input[type=...]` styling (theme) đã unify control bên trong từ trước → toolbar còn lại chỉ là container; token hoá đủ để đồng bộ viền/bo/nhịp, archetype giữ nguyên.
- **Cache-bust**: bump `?v=20260622t6` cho styles/jt-tracking/supplier-wallet/web2-balance-history/reconcile CSS (purchase-refund + users đã t6 từ đợt modal).
- ⚠ Workflow 10-agent bị rate-limit 8/10 → 2 trang (supplier-debt edited, kpi skipped) qua agent, 8 trang còn lại sửa tay trực tiếp (token swap, rủi ro ~0).

→ **Hoàn tất 4 trục đồng nhất Web 2.0**: Buttons ✅ · Tables ✅ · Modals ✅ · Toolbars ✅.

### [refactor] Web 2.0 UI đồng nhất — MODAL về canonical (Step 7) + sửa gốc bán kính 1 nguồn

Tiếp tục đợt đồng nhất giao diện (sau buttons + tables): rà MODAL toàn bộ trang Web 2.0 về **canonical** (header gradient xanh nhạt Zalo + accent strip, bo góc theo token, không `backdrop-filter blur`, padding/footer chuẩn). CSS-only, **giữ nguyên class name** để JS đóng/mở không vỡ. Zalo + video-maker loại trừ (session khác đang code).

- **Workflow 10 trang fork-modal** (audit→restyle, mỗi trang riêng file CSS → parallel-safe): chỉ 2 trang cần sửa lớn (so-order, purchase-refund) + 2 trang sửa nhỏ (products, users); phần còn lại đã canonical từ đợt trước.
    - **products** `.w2p-history-head`: header **phẳng xanh đặc `#2a96ff` + chữ trắng** → gradient xanh-nhạt + chữ tối (canonical); close trắng-trên-xanh → tối-trên-sáng; backdrop 0.55→0.42; radius/shadow → token.
    - **so-order** `.so-modal-head` + `.so-modal-head-v2`: thêm gradient canonical + accent `::after`; h2 16/20px → 15px/700; footer border/bg → token; radius → token.
    - **purchase-refund**: 3 modal (chính + section + modal hoàn/nguy hiểm) → header gradient + border token, h3 17px → 15px/700, footer `var(--gray-50)`, radius → token (modal nguy hiểm giữ header đỏ semantic).
    - **users**: footer border/bg → token.
- **balance-history `.w2md-*` (modal Nạp tay — JS-injected `<style>`)**: agent CSS-scoped không chạm được → tự sửa text CSS trong `js/web2-manual-deposit.js` (không đụng logic): backdrop 0.55→0.42, panel shadow `0 24px 48px`(48px blur, quá ngưỡng) → `var(--shadow-lg)`, head thêm gradient canonical + accent strip + h3 15/700, foot/close → token.
- **GỐC bất nhất bán kính (1-nguồn)**: phát hiện `web2-theme.css:1105` ghi đè `[class*='modal-content']` thành **`border-radius:18px` cứng** (đè base.css 12px), trong khi MỌI fork (đợt trước) đã set 12px theo token `--web2-radius` → shared modal 18px vs fork 12px = lệch. Sửa **1 dòng**: `border-radius:18px` → `var(--web2-radius)` (12px) để modal theo đúng design-token như card/input. Verify browser: fork `.so-modal-panel` = shared `.modal-content` = `[class*='modal-content']` fork đều **12px**.
- **Verify browser (localhost)**: products head = `linear-gradient(#e8f2ff→#fff)` (hết xanh đặc), so-order head/headv2 canonical, w2md modal "Nạp tay vào ví" mở đúng — radius 12px, shadow `var(--shadow-lg)`, head gradient, backdrop 0.42, 540px, không vỡ layout (screenshot OK).
- **Cache-bust prod**: bump `web2-theme.css?v=20260622t6` (47 HTML, trừ zalo/video-maker) + page CSS đã sửa (so-order/products/purchase-refund/users) + `web2-manual-deposit.js?v=20260622t6`.

### [fix] vieneu-tts OmniVoice — thiếu ffmpeg (pydub) → bundle qua imageio-ffmpeg

User chạy bộ cài máy POS ([0] cài hết): VieNeu OK, OmniVoice cảnh báo `pydub … Couldn't find ffmpeg`. Gốc: package `omnivoice` phụ thuộc pydub (decode audio mẫu clone) cần ffmpeg; máy chưa cài. VieNeu KHÔNG dùng pydub nên không sao. (HF_TOKEN warning = vô hại, chỉ rate-limit tải.)

- **requirements-omnivoice.txt**: thêm `imageio-ffmpeg` (bundle binary ffmpeg qua pip, đa nền tảng).
- **engine_omnivoice.py**: `_ensure_ffmpeg()` lúc import → trỏ `pydub.AudioSegment.converter` sang binary imageio-ffmpeg + thêm PATH (no-op an toàn nếu thiếu gói).
- **vieneu-windows-setup.ps1**: nhánh omnivoice luôn `pip install imageio-ffmpeg` + copy → `$DIR\ffmpeg.exe`; start.cmd prepend `%~dp0` vào PATH → pydub tìm thấy ffmpeg, hết cảnh báo + clone chạy.
- **Fix tới user**: chạy LẠI cai-may-pos.bat — ps1 + engine_omnivoice.py + requirements tải mới từ repo (sau GH Pages deploy). KHÔNG cần tải lại .bat.

### [feat] Zalo rebuild Phase 2b-rest — quick-replies lưu/“/” trigger + ZNS form động + link preview card

Hoàn tất phần còn lại của Phase 2b (notifications + conv-mgmt đã xong trước). 3 tính năng, tách nhỏ + tái dùng shared chat engine (dùng chung cho native-orders/live-chat qua `Web2Zalo.mountChat`).

- **Quick-replies — lưu mới + “/” trigger**: `web2-zalo-zca.js` thêm `addQuickMessage(accountKey,{keyword,title})` (zca `api.addQuickMessage`) + chuẩn hoá `getQuickMessages` → `{id,keyword,title}` (cũ trả `message` object thô → composer map sai). Route `POST /quick-replies`. `ZaloApi.addQuickReply`. Composer (`zalo-chat/composer.js`): picker fix shape + thêm mục “➕ Lưu câu trả lời nhanh…” (Popup.prompt nội dung+từ khoá, fallback prompt) + gõ “/” đầu ô → mở picker, chọn THAY nguyên text (`replaceSlash`).
- **ZNS form động**: thay textarea JSON thô bằng form render 1 ô / param của template (`web2_zns_templates.params`): required (\*) + type NUMBER→input number + placeholder = sample. Template KHÔNG có metadata param → ẩn form, mở `<details>` “Nhập JSON thủ công (nâng cao)” (giữ fallback power-user). `_collectZnsData` validate required client-side, build `data` từ form hoặc JSON. `lookup-zns.js` + `index.html` (#wzZnsFields/#wzZnsRaw).
- **Link preview card**: `_extractAttachment` tách `desc` riêng cho kind `link` (giữ fallback tên tệp cho kind khác). `bubbles.js` kind `link` → card xem trước (thumb 1.91:1 + title 2-dòng + desc + host) khi có metadata; thiếu → link gọn `.wz-msg-linkbox` như cũ. CSS `.wz-msg-linkcard` (chat-bubbles.css).
- **Verify browser (localhost, 0 lỗi console)**: ZNS form render đúng 3 ô (customer_name\*, order_code\*, amount=number), raw JSON thu gọn; template 0 param → form ẩn + raw mở. Link card: title/host(shopee.vn)/thumb đủ; link không metadata → fallback linkbox. node --check pass 7 file. Bump `?v=20260622p3` (index.html + ENGINE_VER ở web2-zalo.js cho trang tiêu thụ).
- **Còn lại**: live verify quick-reply + ZNS cần TK Zalo + OA kết nối (localhost không có); deploy Render cho route mới. Tiếp Phase 3 (voice/GIF/sticker pack/video/contact + auto-ZNS).

### [feat] Xưởng Video AI — frontend "Giọng AI Pro" (engine + tab kho giọng, mặc định Adam 3)

Nối tiếp backend: cắm engine `pro` vào `Web2VideoTTS` + tab kho giọng.

- **video-tts.js**: thêm engine `pro` (proStatus/listProVoices/\_proChunk gọi `/api/web2-tts-pro`, decode .wav→samples), dispatch trong synthesize + synthVoiceMeta, hỗ trợ addLibraryVoice/\_persistLib/loadLibraryVoices (proId). **Adam 3 = VOICES[0]** (mặc định, ưu tiên theo yêu cầu; nhãn "Adam 3", proId community id).
- **video-library.js**: tab "Giọng AI Pro" (renderPro/\_loadProVoices/\_appendProRows/previewProVoice/addProVoice) — search server-side (vd "adam") + cuộn nạp thêm + nghe thử (synth mẫu ngắn) + Thêm vào picker. Mirror tab ElevenLabs.
- **Giấu nhà cung cấp**: nhãn "Giọng AI Pro"/"Adam 3", route trung tính, audio relay .wav → frontend không lộ lucylab/ttsapi/vivibe.
- Bump `video-tts.js`/`video-library.js`?v=20260622d. Còn lại: chờ Render deploy xong → verify route live + browser test.

### [feat] Xưởng Video AI — thêm engine "Giọng AI Pro" (backend, giấu nhà cung cấp)

Tích hợp dịch vụ TTS tiếng Việt (giọng cộng đồng "Adam 3"…) vào Web 2.0. **Yêu cầu user: KHÔNG để lộ tên nhà cung cấp ra frontend** → đặt tên trung tính "Giọng AI Pro", route `/api/web2-tts-pro`, backend RELAY audio (domain nhà cung cấp không xuất hiện ở browser).

- **Research trước khi code**: site chặn bot → curl UA đọc `api-docs.html`; GitHub có nhiều client tham chiếu (xác nhận flow). **Probe live bằng key**: `getUserVoices` OK (total 0), `getCommunityVoices` accessible-via-key (các method search/marketplace bị chặn) → **Adam 3 id = (community voice)**; chạy thử `ttsLongText`→poll `active→completed`~4s→ `.wav` công khai. Pipeline verified end-to-end.
- **Backend mới**: `services/web2-tts-pro-service.js` (JSON-RPC api.lucylab.io; xoay tua `VIVIBE_API_KEY1..5` + cooldown 1h failover; `listCommunityVoices`/`listUserVoices`; `tts()` = ttsLongText→poll getExportStatus 2s/120s→tải .wav→Buffer) + `routes/web2-tts-pro.js` (`/status`,`/voices`?scope=community|user,`/tts` audio/wav, requireWeb2AuthSoft+rateLimit). Mount server.js cạnh elevenlabs. Worker auto-forward (prefix web2-).
- **Giấu nhà cung cấp**: route trung tính + relay .wav qua server → frontend không thấy lucylab.io/ttsapi.app; key chỉ ở env Render.
- **Còn lại**: set env VIVIBE_API_KEY1..5 trên web2-api + deploy; build frontend engine `vivibe`/"pro" trong Web2VideoTTS + UI chọn giọng (ưu tiên Adam 3); test live.

### [refactor] Table unify Web 2.0 → canonical .data-table (Step 6, workflow 7-agent)

Tiếp button-unify: migrate bảng fork → look canonical `.data-table` (native-orders: header #f0eeee bold, zebra #f7f9fb, grid #d9dde0/#e5e8ea, padding 8px/10px). Method low-risk: **THÊM class `data-table` vào markup** (giữ fork class cho column-width) + **xoá rule fork xung đột** (thead bg/font/padding/border, td padding/border, zebra, hover, border-collapse) → canonical thắng; **GIỮ column widths + special cells** (status pill, badge, muted, sticky, sortable indicator).

- Fork migrated: `u-table` (users), `sd-table`/`sd-detail-table`/`sd-congno-table` (supplier-debt, 4 bảng), `rt-table` (returns), `wc-table` (customers, giữ min-width 920 + sticky), `sw-table` (supplier-wallet + customer-wallet), `w2bh-table` (balance-history). check-others: kpi/report-revenue/report-delivery/audit-log/dashboard/fb-ads-stats.
- ⚠ Retarget row-tint khỏi `tr` → `> td` ở supplier-debt (expanded/credit-move) + `!important` detail-cell để canonical zebra (apply trên `> td`) không đè semantic tint.
- **Verify browser**: users (8 col/6 row), customers (8 col/50 row), balance-history (5 col/50 row) — thBg #f0eeee, weight 700, padding 8/10, zebra #f7f9fb, **cột + special cell nguyên vẹn** (screenshot customers OK). CSS brace-balanced.
- Commit bị "auto: session update" hook gom chung (`f4892eded`) — đã verify + pushed. ⚠ EXCLUDE zalo (session khác đang code Phase2b). **Còn lại: Step 7 modals → shared `.modal-*`.**

### [refactor] Button consistency toàn Web 2.0 — audit 47 trang (workflow) + unify fork → canonical

User: "Hình 1 vs Hình 2 button khác nhau" + "audit từng button/bảng/modal từng trang rồi làm". Dùng workflow ultracode: audit 47 trang (7 agent batch, tránh rate-limit) → synthesis canonical + fix plan → implement (7 agent, mỗi agent 1 nhóm file, không đụng nhau).

- **Gốc khác biệt**: 5 trang (so-order, users, supplier-debt, reconcile, customer-wallet) **redefine LOCAL `.btn-*`** (teal #0d9488 / indigo #3730a3 / gradient + glow + `translateY(-1px)` lift + radius 6-8px) → HTML trông canonical nhưng render lệch. Nhiều trang khác fork họ nút riêng (.jt-btn/.fbp-btn/.ps-btn/.mt-btn/.vm-btn/.vb-btn/.pcard-btn/.pe-btn) + màu primary lệch brand (cyan #0891b2, generic #3b82f6).
- **Canonical** = `.web2-btn` (web2-components.css) + `.btn/.btn-*` (web2-theme.css, scoped `.web2-theme`/`body:has(.web2-shell)`, Zalo-blue #0068ff). Geometry ở `.btn` base; `.btn-primary` chỉ thêm màu/gradient (Zalo Refresh Pack — gradient nhẹ là CANONICAL, KHÔNG flatten).
- **Step 1** — XOÁ local `.btn-*` ở 5 trang (canonical out-specifies → tự kế thừa, 0 markup). **Step 2** — recolor off-brand → var(--web2-primary): reconcile/ck-dashboard teal, balance-history cyan, live-chat/report-delivery #3b82f6, customers token. **Step 3** — restyle 11 fork-button-class in-place (radius 2px, weight 500, bỏ translateY lift + glow, primary solid). fb-posts.css shared → fix 3 trang FB.
- **⚠ BUG tự bắt + sửa**: so-order (29) + customer-wallet (7) dùng `class="btn-primary"` TRẦN (không `.btn` base) → xoá local block làm nút mất geometry (browser default radius 0/weight 400). Fix: thêm `.btn` vào markup (HTML+JS) → `class="btn btn-primary"`. users/supplier-debt/reconcile vốn dùng `.btn btn-*` nên OK. Verify browser: reconcile/supplier-debt render canonical (gradient, 9px, weight 500) đồng nhất.
- **EXCLUDE**: zalo (session khác đang code), leave-alone list (photo-studio/live-tv/product-counter standalone app, .w2p-bulk-btn dark bar, tab-nav structure, swatch chips, canonical .btn gradient). 23 file CSS brace-balanced. **Còn lại (đợt sau, risk cao)**: Step 4 toolbar markup, Step 6 tables→.data-table, Step 7 modals→shared .modal-\*.

### [feat] Zalo rebuild — Phase 2b (core): thông báo tin mới + quản lý hội thoại (ghim/mute/đánh dấu chưa đọc)

- **Thông báo tin mới** — module mới `web2/zalo/js/web2-zalo-notify.js` (`WZApp.zaloNotify`): toast (notificationManager) + beep Web Audio (throttle 1.5s, tắt được qua localStorage) + **badge số chưa đọc trên `document.title`** + Web Notification API (khi tab ẩn, xin quyền ở user-gesture mở hội thoại). Phát hiện tin mới = diff unread danh sách hội thoại trước/sau mỗi `loadConversations` (bỏ qua lần đầu + khi đang tìm). Wire trong `web2-zalo-chat.js` (snapshot→notify) + `openConversation` gọi `ensurePermission`.
- **Quản lý hội thoại (DB-driven)** — backend `routes/web2-zalo.js`: `POST /conversations/:id/{pin,mute,mark}` (cột `is_pinned/is_muted/muted_until/unread_count`), GET `/conversations` ORDER BY `is_pinned DESC` (ghim nổi lên đầu), `_notify('web2:zalo:messages')` để tab khác refresh. Client `ZaloApi.{pinConversation,muteConversation,markConversation}`. Frontend `web2-zalo-chat.js`: icon ghim/chuông-tắt trên item + nút "⋯" hover → context menu (Ghim / Tắt thông báo / Đánh dấu chưa đọc), wire `Web2Optimistic` (UI-first + rollback). CSS `.wz-conv-side/.wz-conv-menu/.wz-ctx-menu/.wz-conv-ic` + dim item muted.
- **Verify Playwright**: menu "⋯" mở đúng 3 mục, tab title `(11) Zalo - WEB 2.0` (badge unread chạy), 0 JS error, no overflow. Routes pin/mute/mark cần deploy Render mới persist (optimistic apply + rollback nếu 404 trước deploy). Còn lại Phase 2b: quick-replies POST (zca `addQuickMessage`) + ZNS form động.

### [feat] Zalo — bỏ giới hạn allowlist nhóm (hiện TẤT CẢ nhóm + hội thoại 1-1)

User: "nhớ bỏ giới hạn hiện group đi". Trước đây Zalo CHỈ lưu/hiện 2 nhóm trong `web2_zalo_tracked_groups` (allowlist BẬT khi bảng ≥1 row) → đụng mục tiêu "full Zalo như app thật".

- `render.com/routes/web2-zalo.js`: allowlist nhóm giờ **MẶC ĐỊNH TẮT** — `_filterActive = _ALLOWLIST_ON && _trackedSet.size > 0`, với `_ALLOWLIST_ON = process.env.WEB2_ZALO_GROUP_ALLOWLIST === '1'`. Env unset (mặc định) → filter OFF → `_persistIncoming` (line 332) + `sync-conversations` (user+group) KHÔNG bỏ qua hội thoại nào → lưu/hiện TẤT CẢ.
- GIỮ bảng `web2_zalo_tracked_groups` + route `/tracked-groups` làm **opt-in tương lai** (vd "nhóm ưu tiên") — không xoá capability, chỉ đổi default. Bật lại = set env `WEB2_ZALO_GROUP_ALLOWLIST=1`.
- Cần **deploy Render** + bấm "Đồng bộ" (sync-conversations) 1 lần để seed toàn bộ bạn bè + nhóm vào danh sách (tin mới từ nhóm khác cũng tự tạo hội thoại). Retention 7 ngày giữ nguyên (không liên quan).

### [feat] Zalo rebuild — Phase 2a: layout 3-pane giống app Zalo PC (icon rail · danh sách · chat · info panel)

Rebuild giao diện trang `web2/zalo/` từ top-tabs 2-pane → **3-pane giống Zalo PC**, GIỮ engine chat shared (`WZChat.mountConversation`) + mọi hợp đồng (4 trang consumer + `?focus=` deep-link).

- **`index.html`**: bỏ `.wz-page-head` + top `.wz-tabs` → **icon rail dọc** (`.wz-rail`: brand + Chat/Tài khoản/Tra cứu/ZNS + đèn sức khoẻ chân rail). **Chat là khu vực MẶC ĐỊNH**. Panel Chat thành 3-pane `.wz-chat3`: `.wz-conv-col` (account select + `#wzConvList`) · `#wzChatMain` (engine shared) · `#wzInfoPanel` (cột thông tin phải, ẩn khi chưa mở hội thoại). GIỮ nguyên mọi ID JS phụ thuộc.
- **`web2-zalo-app.js`**: `.wz-tab`→`.wz-rail-tab`, keyboard ↑/↓ cho rail dọc, `init()` mặc định `switchTab('chat')`, SSE accounts luôn refresh (đèn sức khoẻ rail realtime).
- **`web2-zalo-chat.js`**: `openConversation` render thêm `renderInfoPanel(conv)` (avatar/tên/loại + SĐT/UID/Tài khoản, nút ẩn panel).
- **`web2-zalo-accounts.js`**: `renderStatusStrip` → đèn sức khoẻ chân rail `#wzRailHealth` (N/M + màu connected/reconnecting/error + tooltip kicked).
- **`web2-zalo.css`**: block "PHASE 2 REBUILD" — `.wz-main` full-height flex, rail/view/3-pane/info-panel/empty-state + responsive (info panel overlay <1180px, rail→thanh trên <680px). Rule ID `#wzPanelChat !important` đè min-height/padding/animation global của `.wz-panel` (panel bị cap 750 thay vì 900).
- **Verify Playwright @1456×900**: 4 rail tab, chat mặc định, 3-pane đầy chiều cao (900/900/900), mở hội thoại → engine mount (header+composer+tin thật) + info panel hiện, 4 tab render, **0 JS error, docOverflowX=0**. Bump `?v=20260622p2`. Tiếp: Phase 2b pin/mute/badge/thông báo/quick-reply/ZNS form.

### [feat] Zalo rebuild — Phase 1: login watchdog "không bị văng nick" (auto-reconnect + keepalive + proactive re-login)

User: "Làm lại toàn bộ trang web2/zalo + nghiên cứu sâu phần đăng nhập không bị văng nick ở máy khác → audit lên plan trước khi làm" → duyệt plan (`docs/web2/ZALO-REBUILD-PLAN.md`) → "Làm tất cả". Bắt đầu Phase 1 (lõi đăng nhập bền).

- **Research (10 agent, 2 workflow)**: cơ chế "văng nick" = Zalo CHỈ cho 1 listener realtime/TK; mở chat.zalo.me TK đó ở máy khác → kick listener (close 3000/3003); **app điện thoại KHÔNG kick**; **bị kick KHÔNG mất cookie** (vẫn re-login lại được). zca-js KHÔNG có refresh API; `zpw_sek` ~7 ngày. Lỗ hổng code cũ: rớt là đứng im (không watchdog/keepalive/reconnect). zca-js 2.1.2 cài sẵn có 148 method (wrapper mới dùng ~30).
- **Watchdog trong `services/web2-zalo-zca.js`**: lưu `creds/label/expectedUid/connectedAt` per phiên để tự re-login (không đọc lại DB). `_scheduleReconnect(code)` + `_doReconnect()`: close/error → tự kết nối lại; **1006/network = backoff lũy thừa** [5,15,30,60,120]s (cap 10 lần → bỏ cuộc `gaveUp` chờ login tay, tránh hammer→ban); **3000/3003 (bị giành phiên) = reconnect chậm 30s + trần KICK_CAP=4 liên tiếp → nghỉ 10 phút + status `kicked`** (tránh "đấu" với máy khác/instance deploy chồng). `_doReconnect` stop listener cũ + cooldown 3s trước re-login (chống tự-kick). `_watchdogTick` mỗi 90s: keepAlive (~ping giữ phiên) + liveness + reconnect phiên chết + **re-login chủ động ở 3.5 ngày** (cuốn cookie trong cửa sổ 7 ngày). `_bumpEvent` cập nhật `lastEventAt`. `stopAll()` graceful (đóng listener nhường phiên cho instance mới khi deploy).
- **Observability**: `status()/statusAll()` trả `healthy/connectedAt/lastEventAt/lastCloseCode/reconnecting/consecutiveKicks`. Route `_safeAccount` surface `health{...}` cho `/status` + `/accounts`.
- **Graceful shutdown** (`server.js`): gọi `web2ZaloRoutes.stopZalo()` (→ `zca.stopAll()`) trước khi đóng HTTP → instance cũ nhả WS, instance mới ăn phiên không "đấu" (xử lý deploy overlap mà KHÔNG cần lock riêng).
- **Frontend health UI** (`web2-zalo-accounts.js` + utils + css): đèn `reconnecting` (vàng pulse) / `kicked` (đỏ); cảnh báo **"Tài khoản đang mở ở nơi khác — đừng mở chat.zalo.me TK này trên máy khác (app điện thoại OK), bấm Kết nối lại"**; hint TK connected: **"Đang nghe realtime trên máy chủ → nhân viên dùng được ở mọi máy"**. Label `kicked`/`reconnecting` thêm vào STATUS_LABEL.
- **Files**: `render.com/services/web2-zalo-zca.js`, `render.com/routes/web2-zalo.js`, `render.com/server.js`, `web2/zalo/js/web2-zalo-{accounts,utils}.js`, `web2/zalo/css/web2-zalo.css`. Syntax + load smoke PASS. Cross-instance lock chính thức: hoãn (graceful stopZalo + kick-cap đã phủ deploy overlap; chỉ cần khi xác minh zca chạy đa-service đồng thời qua log).
- **Plan tổng**: `docs/web2/ZALO-REBUILD-PLAN.md` (Phase 1 login → 2 UI 3-pane → 3 feature fill → 4 group+modular → 5 test). Chờ deploy verify kick→tự hồi.

### [feat] live-chat → layout 3 CỘT (Comment | Kho SP to | Video+Thống kê) + bảng thông tin livestream

User (screenshot): Kho SP (cột phải cũ) nhỏ quá khó nhìn/tương tác → cho cột comment hẹp lại, dời Kho SP sang cột riêng to hơn; dưới ô video giờ trống → cho video to hơn + thêm thông tin livestream (tổng comment, lượt view, like, chia sẻ…).

- **Layout đổi từ 2 cột → 3 cột** (`live-chat/index.html`): `#liveColumn` (comment, flex:1 — hẹp lại) | `#khoSpColumn` (Kho SP, **320→400px**, SP to dễ kéo/bấm) | `#videoColumn` (MỚI, 304px = ô video live to + bảng "Thông tin Livestream"). Trước đây video dock vào đỉnh Kho SP; nay tách hẳn sang cột Video riêng. `#videoColumn` thêm vào danh sách ẩn `html.lc-mobile` (mobile chỉ đọc comment).
- **Ô video to hơn**: `SNAP_VIDEO_W` 160→**224** (`live-livestream-snap-state.js`) — capture đọc `videoWidth` động nên an toàn; frame chụp cũng nét hơn. `_ensureVideoDock` (`live-livestream-snap-stream.js`) retarget vào `#liveVideoDockHost` (fallback Kho SP nếu thiếu cột); placeholder "📹 Chưa kết nối video" ẩn/hiện qua class `has-video` (set khi capture, remove khi ngắt).
- **SP card TO hơn** (`inventory-panel.css`): thêm `@container (min-width:340px)` (panel ~400px) → thumbnail **56→88px**, nút + **32→42px**, giá **15→18px**, tên 2 dòng. Verify: panelW 399 → thumb 88×88, add 42, price 18px.
- **Bảng "Thông tin Livestream"** (MỚI): module `js/live/live-stats-panel.js` (`window.LiveStatsPanel`) + CSS `css/live/live-stats.css`. Gom số liệu CÁC bài live đang chọn: 💬 bình luận / 👁️ lượt xem / ❤️ lượt thích / 🔁 chia sẻ / 📞 SĐT thu / 🛒 đơn đã tạo / 🙈 đã ẩn + pill 🔴Đang live / Đã kết thúc. **Event-driven** — `LiveCommentList._updateTotalBadge()` gọi `scheduleUpdate()` (debounce 400ms) mỗi nhịp render comment → KHÔNG poller (CLAUDE.md rule 6).
- **Shared `fetchLivePosts`** (`web2/shared/web2-chat-live.js`): map thêm `viewCount/likeCount/reactionCount/shareCount/savedCount/phoneCount/liveStatus` từ Pancake post API (trước chỉ `commentCount`) — 1 nguồn, backward-compat. Field thật xác minh qua browser-test: `comment_count/view_count/reactions{like_count,love_count,…}/share_count/phone_number_count/live_video_status`.
- **Verify** (Playwright @1440, live thật): 3 cột 394/400/304, video 224px, 7 ô stats (💬333 📞13 🙈1, pill "Đã kết thúc"), 0 console error. "0 SP" trong test = campaign phiên test không có SP (data env), không phải lỗi layout — card to verified qua inject. Bump `?v=20260622lc3col`.

### [chore] Web 2.0 selective data-wipe tooling (audit→execute) — xoá đơn/SP/NCC/ví/KPI/chiến-dịch-cha, GIỮ KH+chuyển khoản

User: audit toàn bộ data Web 2.0 → xoá đơn hàng/SP/NCC/ví KH/KPI + chiến dịch cha (hiển thị SP ở live-control/live-tv); GIỮ khách hàng + chuyển khoản + data vận hành (live comment, Zalo/chat, FB, noti, J&T) + auth/config.

- **Quyết định KEEP/DELETE** (qua AskUserQuestion + các tin nhắn): DELETE = web2_so_order/order_tags/returns/cart_history/native_orders/fast_sale_orders (đơn) + web2_products/variants/product_history/campaign_products (SP) + web2_supplier_meta/ledger (NCC) + web2_customer_wallets/wallet_transactions/wallet_adjustments/payment_signals/payment_qr_codes/pending_matches (ví/tiền KH) + web2_live_parent_campaigns (chiến dịch cha) + web2_kpi_assignments/\_history/events (KPI). KEEP = web2_customers + web2_balance_history + vận hành + auth/config.
- **Truy cập web2Db**: local BỊ CHẶN — n2store_web2 có IP Access Control (web1 connect OK, web2 từ chối SSL handshake). Sửa firewall = security action → KHÔNG tự làm. Pivot sang **kênh admin sẵn có trong Render**.
- **Endpoint** `POST /api/admin/web2-data-wipe` thêm vào `admin-web2-wallet-reset.js` (tái dùng authOk x-admin-secret=CLEANUP_SECRET + assertSafeTable + guard web2Db≠chatDb). `{mode:'audit'}` = đếm dòng + phân loại + check FK cascade (CHỈ đọc). `{mode:'execute', confirm:'XOA-HET'}` = TRUNCATE … RESTART IDENTITY CASCADE. HARD_KEEP guard (customers/balance_history/customer_intents/users/sessions/migrations/zalo_accounts) không bao giờ truncate. Worker route `/api/admin/web2-*`→web2-api (có web2Db).
- Script standalone `render.com/scripts/web2-selective-wipe.js` (chạy Render Shell qua WEB2_DATABASE_URL) làm fallback.
- **Flow**: deploy → gọi audit (show counts) → user confirm → gọi execute. Audit-first, KHÔNG xoá mù.
- **ĐÃ THỰC THI (verified)**: execute confirm:'XOA-HET' + dropBackups + clearRecords → **22 bảng TRUNCATE (435 dòng), 23 bảng `_bak_*` DROP, web2_records cleared**. Audit lại: delete-set = 0, _bak_\* = 0. **GIỮ NGUYÊN: web2_customers 64.369, web2_balance_history 240, vận hành (live_comments 17.553, notifications 3.086, zalo_messages 396, jt_tracking 226)**. Endpoint để lại (guard x-admin-secret như wallet-reset). web2_records sau wipe có 1 dòng mới = data tươi (data cũ đã sạch).

### [fix] hide ElevenLabs/VieNeu brand khỏi UI Web 2.0 → nhãn trung tính

User: bỏ tên hãng "ElevenLabs"/"VieNeu" hiển thị trên web (4 screenshot video-maker). Đổi text HIỂN THỊ:

- "ElevenLabs" (tab Kho giọng, label, status, error toast) → **"Giọng AI"**; help bật tính năng genericize (bỏ elevenlabs.io + tên env key khỏi UI).
- "VieNeu" (card "Giọng cao cấp / Clone giọng (VieNeu)", status, notify, tooltip cảm xúc) → bỏ / **"Giọng cao cấp"**.
- Files: video-maker (index.html + video-tts/library/maker/vieneu.js), web2-vieneu.js, printer-settings. GIỮ NGUYÊN: comment code (không hiển thị) + nội dung .bat installer (chạy cmd, KHÔNG trên web; tên task/thư mục N2StoreVieNeu/VieNeu-TTS là functional — đổi sẽ vỡ gỡ-cài). Commit `aee1cd462`.

### [fix] Xưởng Video AI — preview nổi ĐÈ lên card → dock thành CỘT riêng (hết đè, cân đối)

User report (screenshot): khung xem trước (PiP nổi `position:absolute`) đè lên card "Các cảnh"/"Hiệu ứng chung" ở mode wide-edit → giao diện "chưa cân đối + bị đè lên nhau".

- **Gốc**: `.vm-stage` ở wide-edit/hidden = `position:absolute; right:18px; bottom:84px` nổi TRÊN `.vm-panel`; card lấp full width (`auto-fill minmax(320px,1fr)`) → card phải nằm DƯỚI PiP → đè.
- **Fix (theo pro-editor CapCut/Canva)**: preview LUÔN là 1 CỘT trong grid, KHÔNG absolute. wide-edit = `grid-template-columns: minmax(0,1fr) clamp(288px,26vw,372px)` (panel rộng trái + rail preview nhỏ phải, dock full-height); preview-focus = `420px minmax(0,1fr)`; preview-hidden = `1fr` (stage `display:none` + FAB "Xem trước" `position:fixed` góc dưới-phải). PiP bar (Phóng to/Ẩn) → `absolute top:10 right:10` trong rail (không đẩy canvas).
- **Verify Playwright @1440px**: wide-edit → stage x=1050..1422, panelRight=1050, **stageOverlapsCards=[]** (0 đè); preview-focus → panel 420(→688) | stage 734(688→1422) khít; preview-hidden → panel full 1164px + stage display:none + FAB fixed; canvas 16:9 fit trong rail; 0 console error. Screenshot xác nhận rail tách biệt, "Các cảnh" hiện đủ. Bump `video-maker.css?v=20260622c`.
- **Tác động**: chỉ **web2/video-maker** (desktop ≥921px). Mobile/iPad ≤920px app-frame không đổi.

### [feat/fix] Sidebar Web 2.0: click icon (thu gọn) → bung + expand group; gỡ "Sổ Order" trùng khỏi Sale Online

User (2 ý): (1) sidebar thu gọn (icon-only) bấm icon group → mở sidebar + expand group đó; (2) 2 "Sổ Order" → chỉ giữ 1 bên Mua hàng.

- **(1) Click group-head khi collapsed**: thêm `Web2Sidebar.onGroupHead(this)` — nếu `isCollapsed()` → `setCollapsed(false)` + `group.add('is-open')`; nếu đang mở → toggle như cũ. Thay inline `onclick="...toggle('is-open')"` ở group-head bằng handler. Collapsed CSS chỉ ẩn label/caret/sub (group-head vẫn click được).
- **(2) Dedup "Sổ Order"**: gỡ item `{label:'Sổ Order', our:'../so-order/index.html'}` khỏi group **Sale Online** (trùng `../so-order/index.html` với **"Sổ Order NCC"** group Mua hàng). Sổ Order là mua hàng từ NCC → thuộc Mua hàng.
- **Verify browser**: Sale Online = [Đơn Web, Live Chat, Chat Pancake, Comment Live, Điều khiển TV, TV Livestream] (hết "Sổ Order"); Mua hàng giữ "Sổ Order NCC"; tổng "Sổ Order" = 1. Collapse→click "Mua hàng": collapsedAfter=false + groupIsOpen=true + submenu hiện. 0 console error. Bump `web2-sidebar.js?v=20260622a` (45 trang).
- **Tác động**: **toàn bộ trang Web 2.0** (sidebar dùng chung) — UX menu thu gọn + bớt 1 mục trùng.

### [fix] products: cột GHI CHÚ lệch hàng (zebra so le) — clamp đặt sai trên `<td>`

User report (screenshot): cột "GHI CHÚ" trang `web2/products` lệch — ô note cao 53px trong hàng 76px, top-align → chừa khoảng trống dưới → zebra/viền so le khó chịu.

- **Gốc**: `.note-cell` (web2-base.css) đặt `display:-webkit-box` + `-webkit-line-clamp:2` **TRỰC TIẾP lên `<td>`** → td mất `display:table-cell` → co lại bằng nội dung (53px), không fill chiều cao hàng. products render `<td class="note-cell">text</td>` (text con trực tiếp).
- **native-orders KHÔNG lỗi** vì dùng pattern đúng: `<div class="web2-note-cell">text</div>` BÊN TRONG td (clamp ở div, td vẫn table-cell).
- **Fix (theo pattern native-orders, DRY)**: (1) `.note-cell` → bỏ clamp, giữ `display:table-cell` + `vertical-align:middle` + color/font/max-width; (2) products render bọc note trong `<div class="web2-note-cell">` (class clamp 2 dòng sẵn có ở web2-components.css, products đã load). Clamp vẫn hoạt động, td fill hàng.
- **Verify browser**: 4 hàng đầu → noteDisplay `table-cell`, noteH=76=nameH, topDelta=0 (thẳng hàng), có inner div. Screenshot xác nhận zebra cột GHI CHÚ khớp hàng. 0 console error. Bump `web2-base.css?v=20260622b3`.
- **Tác động**: chỉ **web2/products** (trang duy nhất render `.note-cell` kiểu cũ). native-orders + trang khác không đổi.

### [feat] Xưởng Video AI — 4 việc (P1-P4): bố cục pro-editor + giọng Piper (bỏ hỏng/nghe-không-tải-model) + ElevenLabs VN

User 4 điểm + ultracode; research 4-agent. P1: Piper nghe thử = clip mẫu HF (<audio> no-cors, KHÔNG tải model) — samplePreviewUrl/previewUrlForVoice. P3: bỏ giọng Piper hỏng vi_VN-25hours_single-low + vivos-x_low (130-symbol→OrtRun OOB), giữ mms+vais; \_piperChunk catch OOB. P2: model eleven_multilingual_v2 KHÔNG có VN → eleven_flash_v2_5 + language_code=vi; backend /shared-voices (lọc+phân trang) + /add-shared + /tts voice_settings; tab ElevenLabs = 1020 giọng VN ưu-tiên + lọc + cuộn + panel cài đặt; deploy web2-api live. P4: 3 mode data-vm-mode (wide-edit + PiP nổi/preview-focus/hidden), desktop ≥921, mobile giữ app-frame. Verify Playwright OK, 0 pageerror. v=20260622b.

### [fix] Button audit toàn Web 2.0 (625+ nút, 12 trang) — fix hamburger UA-default trên native-orders

Audit empiric nút "chưa có giao diện" (đúng phàn nàn gốc của user): browser sweep 12 trang đại diện, đếm nút render UA-default (bg `rgb(239,239,239)` / border đen). Kết quả: **chỉ 1 nút lỗi** = `.w2-mobile-menu-btn` (hamburger mobile) trên **native-orders** — hiện xám trên desktop + không drawer mobile.

- **Gốc**: pack mobile responsive (ẩn hamburger desktop + drawer off-canvas + scrim) nằm CHỈ trong `web2-theme.css` (block F04 ≤900px). **native-orders là trang base-only DUY NHẤT** (load `web2-base.css`, KHÔNG load theme) → thiếu pack → hamburger (do `web2-sidebar.js` tạo) không bị ẩn + không styled.
- **Fix**: thêm "MOBILE SHELL PACK" vào cuối `web2-base.css` (mirror Y HỆT F04 theme): desktop ẩn `.w2-mobile-menu-btn`+`.web2-aside-scrim`; `@media(max-width:900px)` hiện + style hamburger fixed, aside drawer `translateX`, scrim, grid 1-col, main padding. Hamburger/scrim/toggle `.w2-aside-open` đã có sẵn ở sidebar.js → giờ đủ CSS.
- **Vì sao base.css** (không phải theme/mobile.css): native-orders chỉ load base.css; 49 trang khác đã có F04 trong theme → KHÔNG đụng (zero-risk). Trang load cả base+theme nhận rule trùng (identical, theme thắng) — vô hại. theme-only (balance-history) không đụng. Redundancy base↔theme là _necessary_ vì 2 profile load rời nhau.
- **Verify browser**: native-orders desktop 1440px → hamburger `display:none` (offsetParent null), rule desktop-hide + @media parsed trong stylesheet; **0 nút unstyled** (trước=1), 0 page error, 0 console error. Modal check 3 profile: styled OK cả base-only(radius 12px)/themed(18px) — khác bo góc nhỏ, không vỡ. Bump `web2-base.css?v=20260622b2` (11 trang).
- **Tác động**: chỉ **native-orders** (trang base-only duy nhất) — desktop hết nút xám lạc + mobile có drawer; các trang khác không đổi.

### [refactor] CSS consolidate — verify audit (10-agent PASS) + 3 consolidation an toàn (table token / pagination / dead filters)

Tiếp "tất cả → audit → debug → lặp lại tới khi hoàn hảo". **Verify audit workflow `wbgqi1xn7` (10 agent, adversarial)**: verdict **PASS — `noRegressions:true`, `fixNow:[]`**. 5 finding đều LOW/MED = _remaining-consolidation gap_, KHÔNG phải defect do commit trước. Live UI nguyên vẹn.

- **Bảng = 1 NGUỒN token thật** (thay 5 literal hand-synced): thêm `--web2-table-line-strong (#c8ced3)`, `--web2-table-line (#d9dde0)`, `--web2-table-line-soft (#e5e8ea)`, `--web2-table-zebra (#f7f9fb)`, `--web2-table-hover (#eaf2fb)` vào `:root` CẢ web2-base.css VÀ web2-theme.css (mirror — page load mixed: native-orders=base-only, balance-history=theme-only, products=cả 2). `.data-table` 2 file giờ ref token. Đổi look bảng toàn Web 2.0 = sửa 5 dòng.
- **Pagination base ↔ theme đồng nhất**: `.page-btn` trong base.css 32px/6px/`0 10px` → 30px/3px/`0 9px` khớp theme (native-orders base-only giờ đồng bộ themed).
- **Xoá DEAD `.filters`/`.filters-section`** (0 trang dùng bare class, HTML+JS xác nhận): gỡ block dedicated theme.css + 4 selector embedded + 2 selector mobile.css. Input filter các trang vẫn style qua selector input chung; toolbar mỗi trang fork namespaced riêng (.pr-/.ts-/.rc-audit-/.sd-).
- **Verify browser (port 9941, ext, --start overview)**: products (themed) + native-orders (base-only) render BẰNG NHAU 100% — header `#f0eeee`/borders `#c8ced3`+`#d9dde0`/td `#d9dde0`+`#e5e8ea`/zebra `#f7f9fb`, token resolve cả 2, pagination 30px. **0 page error, 0 app console error.** Bump `web2-theme.css?v=20260622t5` (46 trang), `web2-base.css?v=20260622b` (11 trang), `web2-mobile.css?v=20260622a` (sidebar inject).
- **DEFER có chủ đích** (audit xếp LOW/MED follow-up, ép hợp nhất = tự gây regression vì design khác nhau thật): modal base/skin file-unify (3 profile load khác nhau cần def đầy đủ mỗi file), page-header fork (`*-page-head` divergent, chỉ `.so-page-head` trùng thật), filter-fork hợp thành 1 component, purple-tint polish (native-orders-scoped).

### [refactor] CSS Web 2.0 về 1 NGUỒN/component — audit toàn cục (6-agent) + bắt đầu consolidate

User: "web 2.0 module css về 1 nguồn ... bảng/button/modal/header/footer... audit toàn cục → chắc chắn rồi làm". Mục tiêu: mỗi component CSS có 1 nguồn canonical, mọi trang tham chiếu, hết trùng/drift.

- **Audit toàn cục (workflow 6-agent, 21 component)**: map mọi định nghĩa CSS qua 10 file shared + per-page. Phát hiện: trùng lặp NHIỀU nhưng **live UI đã đúng nhờ load-order** (web2-theme.css load CUỐI trên 49 trang → thắng). Vấn đề thật = **dead/duplicate block gây drift**. Chốt canonical: **theme.css=SKIN, base.css=STRUCTURE + look native-orders (trang duy nhất không load theme), components.css=`.web2-btn*`, sidebar.css=shell/sidebar**.
- **Đã làm (LOW-risk, verified)**:
    - **Bảng = look native-orders mặc định toàn Web 2.0** (commit `f2ea3f21b`): rewrite `.data-table` override trong theme.css clone web2-base (grid-line + zebra + header đậm), generic striping. Verified products/balance-history/customers — đồng bộ.
    - **Xoá 4 file orphan** `web2/balance-history/css/{web2-theme,styles,live-mode,accountant}.css` (grep xác nhận 0 ref; ⚠ giữ `modern.css` vì supplier-debt Web 1.0 load, giữ `styles.css` của supplier-debt riêng).
    - **Gỡ dead block page-builder.css** (table/pagination/modal AdminLTE-flat cũ): cả 5 trang page-builder load theme SAU page-builder → block bị override (dead) → giờ bảng/modal/pagination lấy 1 nguồn theme+base. CSS brace-balanced. Bump `page-builder.css?v=20260622cons`.
- **Còn lại (MED-risk, theo executionOrder audit, chưa làm)**: theme.css internal stale (Block B zebra L661 cũ, badge obsolete, card merge), form-controls de-purple + .filters 1 nguồn, page-header chuẩn hoá `.page-head-mini`, modal base/skin split + retire legacy `.btn-*` khỏi base, table full-unify (HIGH — đụng native-orders, defer). Tool browser-test bị flaky giữa chừng nên verify visual hạn chế; các thay đổi đã làm là dead-code/orphan (rủi ro thấp, fallback về canonical).

### [polish] "Chụp Live" — bỏ toast success sau khi chụp (user req)

- User: "không cần thông báo toast sau khi chụp" (chụp liên tục lúc live → toast spam phiền). Gỡ `successMsg` khỏi `Web2Optimistic.run` trong `captureAndSave()` → `if(opts.successMsg)` không bắn → im. Lỗi thật vẫn báo qua `errLabel` + rollback. Manual fallback path vốn đã không có toast success. Syntax PASS.

### [fix] "Chụp Live" chụp ra ảnh trắng — sidebar Kho Hình che iframe lúc capture

User: "nút chụp live → chụp hình bị lỗi … lúc chụp cái này nhảy ra che iframe nên chụp vào bị như hình" (tile lưu vào kho = trắng tinh).

- **Gốc bug**: `captureAndSave()` ([live-chat/js/live/live-livestream-gallery.js](../live-chat/js/live/live-livestream-gallery.js)) gọi `openSidebar()` **TRƯỚC** `api.captureCurrentFrame()`. Sidebar "Hình Livestream" (`position:fixed; right:0; width:380px; z-index:99400`, nền `#fafafa`) trượt ra phủ đúng vùng iframe FB live (`#live-snap-fb-wrapper` dock cột Kho SP / fixed góc phải). Extension `captureVisibleTab` chụp nguyên viewport (đang bị sidebar che) rồi crop theo rect wrapper → ra nền trắng sidebar. Mean luminance ~250 nên `_isFrameBlank` (mean<10) KHÔNG bắt → ảnh trắng vẫn được lưu.
- **Fix**: **CHỤP TRƯỚC, MỞ SIDEBAR SAU** + tạm ẩn sidebar nếu đang mở sẵn (chụp lần 2+). Reorder: set busy → `aside.style.visibility='hidden'` (no transition, reflow ép repaint) nếu `STATE.sidebarOpen` → chờ 2 rAF (compositor bỏ sidebar khỏi frame, cho cả stream lẫn tab-capture) → `captureCurrentFrame()` → `finally` khôi phục visibility → `openSidebar()` hiện tile mới. JS no-cache (không cần bump version). Syntax PASS.

### [polish] SSE consumer LOW hygiene — vá 5 item sweep (report-delivery realtime + 4 debounce)

Dọn nốt LOW từ consumer-robustness sweep cho "trơn tru hoàn hảo" (không phải bug correctness, chỉ freshness/efficiency):

- **report-delivery KHÔNG có realtime** → thêm `Web2SSE.subscribe('web2:delivery'|'web2:fast-sale-orders'|'web2:native-orders', sseReload)` debounce 600ms (mirror report-revenue) → giờ tự cập nhật khi phiếu giao/đơn đổi (trước chỉ refresh khi bấm tay).
- **Debounce 4 badge/handler bắn fetch mỗi event** → gom burst: `web2-pending-match.js` (web2:wallet:\* → refresh, +clear timer cleanup), `balance-history/index.html` + `live-chat/index.html` + `live-chat/chat.html` (web2:payment-signals → refreshCount /stats), `ck-dashboard-app.js` (web2:customer-intents → loadCol, nhất quán sibling payment-signals đã debounce).
- so-order receive-path KHÔNG đụng: `pullOnce()` đã version-gated (event version ≤ local → skip, không fetch) → benign, debounce thừa.
- Bump `web2-pending-match.js?v=20260622d` + `ck-dashboard-app.js?v=20260622d`. Syntax PASS.

### [test][fix] Browser test TỪNG TRANG Web 2.0 (treo SSE monitor + 32 trang) — ALL PASS + fix bug "cứ vào nhầm Web 1.0"

User: "treo server sse → vào từng trang test → debug → audit → lặp lại đến khi hoàn hảo" + "bạn vào nhầm web 1.0 rồi / tôi có note này lại mà sao cứ vào nhầm vậy?"

- **🔴 GỐC BUG "cứ vào nhầm Web 1.0"**: `scripts/n2store-browser-session.js` sau login **hardcode nav `orders-report/main.html` = WEB 1.0** (dòng 370), KHÔNG có cờ đổi → mỗi lần browser test Web 2.0 là flash/đứng Web 1.0. **Cộng dồn**: driver `/cmd` của tôi bị bug PORT (`source env` KHÔNG export → `os.environ`=None → mọi `nav` fail im lặng → browser đứng nguyên trang đích Web 1.0). **Fix**: thêm cờ `--start <url>` (override landing; relative ghép BASE) + đọc PORT từ file env. Đã cập nhật CLAUDE.md §"Browser test Web 2.0 → --start web2/overview" + MEMORY [[feedback_web2_browser_start_flag]].
- **Treo SSE monitor**: stream `web2:_admin:sse-log` (`/tmp/sse-monitor.log`) xem notify/connect realtime trong lúc test.
- **Test 32 trang** (2 batch) qua browser thật + extension, landing web2/overview: mỗi trang verify (1) nav đúng Web 2.0, (2) `Web2SSE.topics()` chứa topic mong đợi (sub), (3) bắn `/sse/test` từ browser (token sống) → probe nhận event (recv), (4) 0 console error. **KẾT QUẢ: TẤT CẢ PASS** — products/variants/native-orders/fast-sale-orders/customers/customer-wallet/supplier-wallet/balance-history/so-order/order-tags/notifications/reconcile/returns/delivery/refunds/dashboard/supplier-debt/multi-tool/live-tv/live-control/zalo/jt-tracking/fb-posts/printer/users/purchase-refund/ck-dashboard/kpi/report-revenue/product-category/live-chat. `web2:wallet:*` pages (customer-wallet, supplier-debt) recv=Y → **R4 server-side prefix-match chạy thật trên browser**.
- **3 "anomaly" = tôi đoán sai topic, KHÔNG phải bug**: multi-tool subscribe `web2:comment-boost` (produced ✓), product-category subscribe `web2:productcategory` (produced qua generic route `web2:${entity}` ✓), cart consumer ở `live-chat/inventory-panel` chứ không phải trang riêng (produced cart.js ✓). Re-fire đúng key → recv=Y hết.
- **Bẫy test (ghi lại)**: (a) `/sse?keys=` PHẢI URL-encode comma; (b) bắn `/sse/test` PHẢI từ browser (token python stale → 403; macOS SSL verify fail). Token sống = `JSON.parse(localStorage.web2_auth).token` trong eval.

### [fix] SSE audit producer↔consumer TOÀN HỆ (18-agent) — vá 2 MEDIUM "route quên emit" + 3 LOW dead-emit

Tiếp pass live-test (R4 đã chứng minh static review hiểu sai dispatch). Lần này audit **mọi cặp producer↔consumer** với dispatch model ĐÚNG (server lọc theo exact key; `:*` đã được R4 server-side prefix-match phủ). Mục tiêu: tìm lớp bug "consumer subscribe topic mà route KHÔNG emit" (giống bug ví nhưng ở topic khác).

- **Transport baseline** (curl `/sse?keys=`+`/sse/test`): 14 topic chính đều giao (web2:products/variants/delivery/native-orders… `clientsNotified:1`). _(Bẫy test: `keys=` phải URL-encode comma; loop 14 POST rapid làm curl buffer chưa flush lúc kill → 0/14 GIẢ — inline probe xác nhận OK.)_
- **2 MEDIUM (route quên emit → tab khác stale, SSE là kênh DUY NHẤT)**:
    1. `refunds.js` DELETE `/:number` → 0 emit → phiếu trả đã xoá vẫn hiện tab khác. Fix: emit `web2:refunds {action:'delete',number}` (mirror status route). Consumer subscribe EXACT `web2:refunds`.
    2. `delivery-invoices.js` PATCH + DELETE → 0 emit (chỉ create + 4 state-transition có). Fix: emit `web2:delivery {action:'update'|'delete'}`. Consumer EXACT `web2:delivery`.
- **3 LOW dead-emit (churn cross-instance NOTIFY, 0 subscriber)**: `web2-msg-send.js` 2 emit plain `web2:bulk-send` (1 chạy MỖI progress tick — chỉ per-job `web2:bulk-send:<jobId>` được consume) → gỡ; `kpi.js` emit `web2:kpi:<beneficiary_id>` (chỉ `web2:kpi-dashboard` được consume) → gỡ, giữ broadcast. LOW #5 (web2-wallet-balance double-invalidate `web2:wallet:*` + `web2:customer-wallet`) = idempotent benign → giữ.
- Syntax 4 file PASS. Commit `88f8b0a91`.
- **✅ Verify deploy**: deploy mới landed (bootId `7d74f474c`), **2 route healthy 200** (`/api/delivery-invoices/load` + `/api/refunds/load`) — edit KHÔNG vỡ boot/routing. **Tables delivery_invoices + refunds đều RỖNG** (`orders` len=0) → không có row để PATCH/DELETE test (bug stale chưa thể xảy ra khi 0 row; seed PBH-chain sẽ chạm data thật → KHÔNG làm). Emit là statement straight-line TRƯỚC `res.json` (reachable, guard `if(web2RealtimeSseNotify)` luôn true prod, ĐỒNG NHẤT pattern với create-emit/status-emit đã chạy 10 dòng trên) → verified bằng pattern-identity + route-health + transport-proven. KHÁC R4 (bug khái niệm dispatch cần live-test); đây là thêm-1-dòng-giống-code-đang-chạy.
- **Tiếp**: consumer-robustness sweep (lens cuối — resync no-op / debounce / throw-safety mọi subscriber) → converge.

### [fix] SSE realtime — re-audit toàn diện (39-agent) + 8 fix vá khoảng trống còn lại (KEEP SSE, KHÔNG cần WS)

User: "kiểm lại, audit toàn bộ web 2.0 để chắc chắn server SSE realtime hoạt động, còn không thì coi chuyển qua WS → debug → audit → lặp lại đến khi hoàn hảo".

- **Verdict: KEEP SSE — KHÔNG cần WebSocket.** Workflow audit 39-agent (map 5 + 6 dimension adversarial verify) chốt: WS **KHÔNG** fix được root cause (hub là `Map` per-process — WS hub cũng y hệt). Fix nằm TRÊN tầng wire = Postgres LISTEN/NOTIFY (đã có, đúng). SSE còn lợi thế: 1 EventSource multiplex (né cap 6-conn/origin), auto-reconnect + resync sẵn, worker đã proxy SSE (WS route mới = 404 nếu chưa thêm). 22/27 finding confirmed; backbone "SOLID_WITH_FIXES".
- **Live recon**: `/sse/stats` healthy — `crossInstance:true`, `liveInstances:1`, `crossStats.published===received` (16/16, kênh sống), `multiInstanceWarning:false`, BOOT_ID đủ suffix per-instance.
- **8 fix (5 MED + 3 LOW)** — `realtime-sse-web2.js` + `web2-sse-bridge.js` + `web2-customer-wallet-app.js` + `web2-balance-history.js`:
    1. **(MED) oversized cross-instance payload** all-or-nothing drop → degrade về TICKLE `{action,code,truncated}` (cap 7800; bulk confirm-purchase/mark-printed nhiều mã KHÔNG còn rớt cross-instance lúc deploy).
    2. **(MED) LISTEN reconnect gap** không resync: pg LISTEN/NOTIFY không buffer cho listener rớt → event trong cửa sổ ~3s mất, mà SSE browser KHÔNG đứt nên client không tự lành → **server bắn `event: resync` local khi re-LISTEN sau mất** (`_broadcastLocalResync` + `_pendingResyncOnReconnect`); bridge map → `_dispatchResync`.
    3. **(MED) exact `web2:wallet:<phone>` không tới subscriber `web2:wallet:*`** (PBH trừ ví / returns refund / manual deposit stale): **bridge prefix-match `:*`** (đóng CẢ LỚP — mọi route exact hiện tại + tương lai), mirror server `_localNotifyWildcard`.
    4. **(MED) customer-wallet no-op trên resync** (data:null): xử lý resync = `load()` TRƯỚC fast-path gated phone; + coalesce per-phone (1 refresh + 1 toast — chống double-fire từ SePay dual-emit + rank3).
    5. **(MED) heartbeat reopen-storm**: server gửi `:heartbeat` COMMENT → EventSource nuốt → `lastEventAt` không bump → refocus tab quiet >60s reopen oan (resync+reload toàn bộ). → **server gửi NAMED `event: heartbeat`**, bridge bump `lastEventAt` (không dispatch) + ngưỡng refocus 60→90s.
    6. **(LOW) `_pgNotify` không fallback khi LISTEN client half-open** → drop NOTIFY: reject → fallback pool 1 lần.
    7. **(LOW) pool fallback amplify lúc reconnect**: cap `_poolNotifyInflight` ≤ 12 (1 web2Db blip + burst KHÔNG vắt kiệt pool max~10).
    8. **(LOW) dead notify** `web2:wallet:update` (manual-deposit) — bỏ (sau prefix-match còn double-fire `:*`).
- **Phụ**: sửa comment bridge sai ("→ n2store-fallback" → đúng là **web2-api**, fallback chỉ relay). Bump `web2-sse-bridge.js?v=20260621r6→20260622r7` (38 trang) cho prod nạp.
- Syntax check 4 file PASS. Commit R1 `0ce6293e3`.

**Re-audit R2 (23-agent regression hunt trên commit R1)** — 18 candidate, 6 confirmed; converged=false vì 1 MEDIUM. Đã vá:

- **(MED) `live-livestream-snap-init.js` no-op trên resync** (cùng lớp bug customer-wallet nhưng ở consumer KHÔNG đụng tới — resync `data:null` rơi xuống `if(!customerFbUserId)return` → thumbnail/counts kẹt cũ). Fix: gộp resync vào nhánh `purge/wipe-all` (wipe cache + re-queue mọi row hiển thị).
- **(LOW) resync thundering-herd + spurious liveness-ping resync**: bridge coalesce `_scheduleResync()` trailing 250ms (server-resync + client-reconnect-resync + ping false-positive chồng nhau → 1 đợt re-fetch); clear timer trong `close()`.
- **(LOW) pool-fallback drop im lặng**: thêm `_crossStats.poolDropped` → lộ ở `/sse/stats`.
- **(LOW) foot-gun**: comment ⚠ LOAD-BEARING ở `notifyClientsWildcard('web2:wallet')` (đừng xoá — bridge cũ còn cache cần đường wildcard).
- 4 LOW còn lại (half-open >12 drop = tradeoff bảo vệ pool + self-heal; broadcast-kind degrade = unreachable) reviewer chốt KHÔNG block. Bump bridge `r7→r8` (38 trang). Syntax PASS. Commit R2 `b07144f98`. R3 (3-agent) **converged=true, 0 finding**.

**🔴 LIVE-TEST R4 (browser thật) BẮT ĐƯỢC LỖI 3 VÒNG STATIC REVIEW (39+23+3 agent) ĐỀU MISS** — vì sao phải test thật:

- **Triệu chứng**: browser subscribe `web2:wallet:*` rồi `POST /sse/test {key:'web2:wallet:0123456788'}` → `clientsNotified:0`, browser nhận 0. → **rank-3 (bridge prefix-match) là DEAD CODE**.
- **Root cause THẬT**: hub đăng ký connection theo ĐÚNG key đã subscribe (`web2:wallet:*`). `notifyClients(exact 'web2:wallet:<phone>')` chỉ exact-match `sseClients.get('web2:wallet:<phone>')` → KHÔNG có → event **KHÔNG RỜI server** → bridge prefix-match (client-side) vô dụng vì event chẳng bao giờ tới browser. → **6 trang ví** (customer-wallet, balance-history ×2, supplier-wallet, wallet-balance, supplier-debt) **bỏ lỡ realtime** từ 4 route chỉ-emit-exact (PBH-deduct/refund/return-credit/manual-deposit). 4 route chỉ có `notifyClients` (không có `notifyClientsWildcard` qua app.locals).
- **FIX ĐÚNG = SERVER-SIDE prefix-match trong `_localNotify`**: sau khi gửi exact, scan `sseClients` cho subscriber `:*` khớp prefix `key` → gửi với `payload.key = ĐÚNG key '*'` (bridge cũ+mới đều exact-match). Đóng CẢ LỚP tại 1 điểm, KHÔNG phụ thuộc route nhớ co-emit (hết drift), KHÔNG cần wiring mới. Bỏ `notifyClientsWildcard('web2:wallet')` ở SePay hub (giờ redundant → tránh double-fire). **Revert** client prefix-match (sai tầng, dead). Bump bridge `r8→r9`. **Bài học: static review hiểu sai dispatch model (tưởng server gửi hết, client lọc; thực ra server lọc theo exact key) — chỉ live-test mới lộ. Test thật > review.**
- **✅ VERIFIED LIVE (curl, prod web2-api sau deploy R4 `8d6abe393`, bootId `5cd8f5967d`)**: (1) exact `web2:wallet:0123456788` → **`clientsNotified:1`** (trước 0) + stream `web2:wallet:*` nhận `{key:'web2:wallet:*', pattern:'web2:wallet', data:{phone:...}}`; (2) exact topic thường vẫn giao (1); (3) near-miss `web2:wallet-config:x` → **0** (KHÔNG over-match); (4) unrelated → 0; (5) end-to-end: trang customer-wallet trên browser (subscriber thứ 2) cũng nhận. **code-reviewer APPROVE 0 CRITICAL/HIGH/MEDIUM** (2 LOW = doc nit). → **HỘI TỤ + LIVE-VERIFIED**. KEEP SSE chốt (WS không fix gì root cause).

### [fix] SSE realtime XƯƠNG SỐNG Web 2.0 — cross-instance fan-out (Postgres LISTEN/NOTIFY) + observability + graceful deploy

User: "audit lên plan tìm hiểu bug realtime ... fix server realtime chạy chính xác, vì đây là xương sống web 2.0". Điều tra sâu (4-agent audit code + Render API + đo live) → **đính chính chẩn đoán ban đầu** rồi fix gốc + **3 vòng adversarial review** (19→6→4 finding, hội tụ).

- **ROOT CAUSE (chứng minh dứt khoát)**: hub SSE (`realtime-sse-web2.js`) là `Map<topic,Set<Response>>` **in-RAM PER-PROCESS**, KHÔNG fan-out cross-process. web2-api steady-state = 1 instance (Render API `numInstances=1`) NHƯNG **rolling-deploy chồng 2-4 instance vài giây** (quan sát thật `liveInstances:2-4` + `bootId=srv-...-9bf555fb8-kb4px-...` cho thấy `RENDER_INSTANCE_ID` có phần per-instance). Lúc đó mutation rơi instance A, SSE bám instance B → broadcast lệch → **realtime rớt ÂM THẦM** (delivery all-or-nothing tuỳ trùng instance). Triệu chứng ban đầu "web2:products không tới" = artifact test ngay lúc deploy + lỗi đo (event `test` vs `update`); steady-state thực ra giao 100%.
- **FIX E — cross-instance fan-out**: Postgres `LISTEN/NOTIFY` channel `web2_sse` trên web2Db (KHÔNG cần Redis). `notifyClients` broadcast local + `pg_notify`; instance khác nhận NOTIFY → broadcast local; bỏ self (`origin===BOOT_ID`). Dedicated `PgClient` (keepAlive, statement_timeout:0, auto-reconnect 1-timer-guard). Publish qua chính LISTEN client (chống pool churn). Kill-switch `WEB2_SSE_NO_CROSS=1`.
- **FIX gate (audit r1 #1)**: CHỈ web2-api init fan-out (`!WEB2_API_FORWARD_URL`); fallback chỉ HTTP-relay → tránh double-deliver (fallback+web2-api chung web2Db). **r2 #1 (HIGH regression)**: gate làm `web2:wallet:*` wildcard mất đường → `notifyClientsWildcard`/`broadcastToAll` CŨNG forward (`kind`) + relay-notify route theo kind.
- **FIX A/B observability**: `BOOT_ID` (random suffix — slice cũ cắt nhầm per-instance id) vào connectionId/connected/stats; bảng `web2_sse_instances` heartbeat 30s → `/sse/stats` lộ `liveInstances`/`multiInstanceWarning`/`crossStats{published,received,deliveredFromPeers}`; cảnh báo boot nếu >1.
- **FIX C graceful deploy**: SIGTERM → `gracefulClose()` (async, await DELETE registry + `.end()` bọc timeout) đóng SSE sạch → client reconnect NHANH sang instance mới (bridge resync re-fetch). server.js gọi 1 nguồn + đóng web2Pool.
- **3 review rounds (24+16+6 agent, adversarial verify)**: r1 19 finding→vá 18, r2 6→vá 5 (HIGH wildcard), r3 4→vá 3 (MED `.end()` timeout, LOW timer unref + broadcast whitelist). #3 (pg_notify share LISTEN client) reviewer chốt acceptable.
- **✅ VERIFIED LIVE**: fan-out kênh sống (`published===received`, 1→16); delivery steady-state 100% (5-10/10 nhiều lần qua `Web2SSE.subscribe`); multi-instance **quan sát được** (`multiWarn:true` + 3 instance lúc deploy, **TẤT CẢ web2-api** — fallback gated đúng) + **settle về 1** sau 3 phút (observability đúng); regression sau mỗi deploy OK. File: `render.com/routes/realtime-sse-web2.js` + `server.js` + `web2-campaign-products.js` (D: PATCH /pending broadcast thêm web2:products).

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
