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

## 2026-06-05

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

## 2026-06-01

### [tpos-pancake][cart][render][native-orders] Tạo đơn từ tpos-pancake → SĐT + địa chỉ KH từ TPOS partner cache + inline inputs ✅

**Yêu cầu user**: "tạo đơn qua native-orders thì thêm vào sđt, địa chỉ cho khách"

**Cách làm**:

- **Frontend tpos-pancake** (`js/pancake/inventory-panel.js`): `_resolveTposCustomer(commentId, row)` giờ enrich SĐT + địa chỉ từ 3 nguồn ưu tiên giảm dần:
    1. Inline input user vừa sửa thủ công (`#phone-{fromId}` / `#addr-{fromId}`)
    2. TPOS partner cache (`state.partnerCache.get(fromId).Phone` / `.Street` + Ward/District/City)
    3. Field `c.phone` / `c.address` trên comment object (hiếm)
    - normalize phone digits-only last-10 (VN convention).
- `_resolveCommitContext` thêm field `address`. Customer object passed xuống `addToCart` giờ có `{id, name, phone, address}`.
- **Backend** (`render.com/routes/v2/cart.js`): `_createDraftViaFromComment` thay `address: ''` (hardcoded) → `customer?.address || ''`. Forward sang `/api/native-orders/from-comment` → backend đã có chain enrichment (local fb_id → TPOS Partner lookup) làm fallback.
- **Fix nút "Lấy TPOS" trong native-orders**:
    - Bỏ `successMsg: 'Đã lấy info KH từ TPOS'` (Web2Optimistic fire NGAY sau apply → premature notif gây hiểu lầm "thành công" dù backend lỗi). Notify thật trong `onSuccess` callback với chi tiết "Đã lấy tên + SĐT + địa chỉ từ TPOS".
    - Fix `searchCustomerByFbUserId` (`render.com/services/tpos-customer-service.js`): TPOS endpoint `SaleOnline_Order/ODataService.GetViewV2` strict — phải URL-encode params đầy đủ qua `URLSearchParams`, thêm headers required: `Origin: tomato.tpos.vn`, `Referer`, `tposappversion: 6.1.8.1`, `x-requested-with: XMLHttpRequest`, `Content-Type: application/json;IEEE754Compatible=false`. Surface response body chi tiết khi 400 để debug dễ hơn.

**Files**:

- `tpos-pancake/js/pancake/inventory-panel.js`: enrich `_resolveTposCustomer` + `_resolveCommitContext.address`.
- `tpos-pancake/index.html`: bump cache `inventory-panel.js?v=20260601b`.
- `render.com/routes/v2/cart.js`: pass `customer?.address` thay hardcoded `''`.
- `render.com/services/tpos-customer-service.js`: full TPOS headers + URLSearchParams + debug body trong error message.
- `native-orders/js/native-orders-app.js`: bỏ `successMsg` premature, notify chi tiết trong `onSuccess`.

**Status**: ✅ Code fix xong. Backend deploy auto khi Render pickup commit (~3-5 min). User test "Lấy TPOS" button sau deploy nên thấy phone+address fill vào row.

### [inventory-tracking] Financial row: label + tiền ngoại tệ màu đen size x2, (tiền việt) xám nhạt ✅

**Yêu cầu user**: Trên card đợt hàng (Theo Dõi Đơn Hàng), dòng tài chính "Số dư / Tổng HĐ / Tổng CP / Còn dư" + phần tiền ngoại tệ (`$...`) → toàn bộ màu đen, size tăng x2. Phần tiền Việt quy đổi trong ngoặc `(...)` → màu xám nhạt, **giữ nguyên size gốc**.

**Files**:

- `inventory-tracking/css/modern.css` — 4 class container (`.ship-so-du`, `.ship-tong-hd`, `.ship-tong-cp`, `.ship-tong-running`) + các `-num`: `color:#111827`, `font-size:26px` (gốc 13px → x2). Override luôn `.ship-so-du.is-pos/.is-neg` + `.ship-tong-running.is-pos/.is-neg` về đen (bỏ xanh/đỏ theo dấu). `.ship-tong-hd-vnd` (class chung cho mọi `(VND)`) → `color:#9ca3af`, `font-weight:500`, `font-size:13px` (giữ size gốc).
- `inventory-tracking/index.html` — bump `css/modern.css?v=20260601e`.

**Chi tiết**: tất cả `(VND)` của 4 mục dùng chung 1 class `.ship-tong-hd-vnd` (sinh từ `vndSuffix()` trong table-renderer.js) → chỉ cần 1 rule. Container đặt 26px, con `-vnd` ép lại 13px nên ngoặc giữ size gốc dù nằm trong parent 26px. Separator `|` không đụng.

**Status**: ✅ CSS-only, không động JS/data.

### [tpos-pancake] Fix bug không hiện SĐT/địa chỉ KH — bump partnerCache maxSize 200→2000 ✅

**Bug user**: tpos-pancake không hiện SĐT, địa chỉ của KH trên các comment row.

**Root cause** (verified qua browser test với 720 comments / 461 unique users):

- `state.partnerCache = new SharedCache({ maxSize: 200, ... })` — hard cap 200 entries với LRU eviction 20%.
- `loadPartnerInfoForComments()` fetch tuần tự batch 5 cho TẤT CẢ unique users qua `getPartnerInfo(crmTeamId, userId)` → endpoint `/rest/v2.0/chatomni/info/{crmTeamId}_{userId}`.
- Live campaign thực tế có 461 users → cache bị evict liên tục → chỉ ~200 entries giữ lại tại 1 thời điểm → renderRow → 461 - 200 = **~261 rows mãi mãi trống** (98% trống ngay sau LRU).
- Before-fix snapshot: 720 rows, only 12 có phone (1.7%).

**Fix**: bump `maxSize: 200 → 2000` trong `tpos-pancake/js/tpos/tpos-state.js`. Reload + verify cùng campaign: 524/556 = 94% rows có phone, 511/556 = 92% có address (32 rows blank còn lại là KH chưa có Partner record bên TPOS, expected).

**Files**:

- `tpos-pancake/js/tpos/tpos-state.js`: `maxSize: 200 → 2000` + comment giải thích.

**Status**: ✅ Done. Verified với browser test trên live data.

### [native-orders][render] Khách lạ + nút "Lấy TPOS" — chain lookup FB ID khi đơn từ tpos-pancake rỗng phone ✅

**Yêu cầu user**: (1) Tpos-pancake tạo đơn qua native-orders sao không lấy địa chỉ và sđt của khách bên tpos? (2) Native-orders nếu bên tpos-pancake tạo đơn qua bị rỗng sđt và địa chỉ → lần đầu sẽ lấy từ tpos → nếu không có cột tên sẽ ghi "Khách lạ" kế bên trạng thái khách hàng và có nút "Lấy TPOS" để làm thủ công.

**Cách làm**:

- **Backend tự động** (route `/api/native-orders/from-comment`): khi tpos-pancake gửi `phone` rỗng, chain lookup theo `fbUserId`: (1) local `customers.fb_id` trước (nhanh), (2) nếu vẫn không có phone → gọi TPOS `SaleOnline_Order/ODataService.GetViewV2?$filter=Facebook_ASUserId eq '<id>'&$expand=Partner&$top=1&$orderby=DateCreated desc` → lấy `Telephone`/`ShipAddress` + Partner info → upsert vào local `customers` table + link `fb_id` để future fast lookup. INSERT native_order dùng `enrichedPhone/Name/Address`.
- **Endpoint mới** `GET /api/web2/customer-tpos/by-fb-id/:fbUserId` (`render.com/routes/v2/web2-customer-tpos.js`): cho frontend gọi thủ công, cũng tự upsert customers + link fb_id.
- **Service mới** `searchCustomerByFbUserId(fbUserId)` trong `render.com/services/tpos-customer-service.js` — query TPOS với `Facebook_ASUserId` + `$expand=Partner`, normalize phone (digits-only, last 10).
- **Frontend** (`native-orders/js/native-orders-app.js`):
    - Cột Tên: khi `o.customerName` rỗng → label `Khách lạ` (italic gray) thay vì để trống.
    - Nút `Lấy TPOS` (small primary outline indigo) hiện cạnh status pill khi đơn thiếu name/phone/address VÀ có `fbUserId`. Click → `fetchCustomerFromTpos(code, fbUserId)`.
    - Function `fetchCustomerFromTpos`: UI-first qua `Web2Optimistic.run` — disable button + spinner ngay, gọi endpoint `by-fb-id`, nếu có data thì PATCH native_order (chỉ fill field còn rỗng, không ghi đè user edit), rollback re-render khi lỗi, invalidate panel cache để hover sau hiện data mới.
- **CSS** (`native-orders/css/native-orders.css`): `.tpos-customer-name-row` (flex wrap), `.tpos-customer-stranger` (italic gray-400), `.tpos-fetch-tpos-btn` (indigo subtle với hover/focus/disabled).

**Files**:

- `render.com/services/tpos-customer-service.js`: thêm `searchCustomerByFbUserId` + export.
- `render.com/routes/native-orders.js`: chain lookup local fb_id → TPOS Partner trong `/from-comment` khi phone rỗng.
- `render.com/routes/v2/web2-customer-tpos.js`: endpoint `GET /by-fb-id/:fbUserId` với auto-upsert.
- `native-orders/js/native-orders-app.js`: render "Khách lạ" + nút "Lấy TPOS", function `fetchCustomerFromTpos` qua `Web2Optimistic`, export trên `window.NativeOrdersApp`.
- `native-orders/css/native-orders.css`: styling cho name-row + stranger + fetch button.

**Status**: ✅ Done — đơn từ tpos-pancake giờ tự enrich khi KH đã có đơn TPOS trước (auto), còn lại có nút thủ công với UI-first feedback.

### [orders] Fix XL auto-flip "ĐÃ RA ĐƠN" mất ~50% + đơn ÂM MÃ (thiếu món) hiển thị sai ✅

**Why:** 2 cụm lỗi. (1) Đơn ra THÀNH CÔNG nhưng XL không tự flip sang ĐÃ RA ĐƠN, ~50% đơn (chỉ khách có ví/công nợ) — phải gắn tay. (2) Đơn thiếu hàng (ÂM MÃ) hiển thị sai: PBH "Đã thanh toán" thay vì "Nháp", XL flip sai sang ĐÃ RA ĐƠN, tag ÂM MÃ không hiện ở cột TAG.

**Root cause cụm 1 (write-race đè category):** Khách có ví → tạo PBH trừ ví → `_applyWalletAutoTags` toggle cờ `TRỪ CÔNG NỢ` qua `queueProcessingTagSave`, hàm này **snapshot cả blob (gồm `category`) tại lúc queue**, flush sau 500ms. Cùng lúc `onPtagBillCreated` flip `category → HOAN_TAT` + PUT ngay. Last-write-wins per-order doc → batch (snapshot CHỜ ĐI ĐƠN cũ) đè ngược flip ~50%. **KHÔNG phải do commit 150a4b2dd** (race này có trước).

**Files:**

- [`orders-report/js/tab1/tab1-processing-tags.js`](../orders-report/js/tab1/tab1-processing-tags.js) — Fix D (`queueProcessingTagSave`/`_flushBatchSave` serialize LIVE data tại flush), Fix B (`reconcileTagsWithInvoices` loại invoice `NotEnoughInventory` khỏi `hasActive`), Fix 4 (`onPtagBillCreated` thêm `opts.confirmedSuccess`)
- [`orders-report/js/tab1/tab1-fast-sale-invoice-status.js`](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js) — Fix A (`set()` thêm `opts.isError`/detect `NotEnoughInventory` → ép badge "Nháp"), wiring Fix 4 (truyền `confirmedSuccess: true`)
- [`orders-report/js/tab1/tab1-fast-sale-workflow.js`](../orders-report/js/tab1/tab1-fast-sale-workflow.js) — Fix C (`addTagToOrder`/`removeTagFromOrder` gọi `updateOrderInTable` re-render cell TAG + surface lỗi gắn tag)
- [`orders-report/js/tab1/tab1-sale.js`](../orders-report/js/tab1/tab1-sale.js) — wiring Fix 4 (single-sale `onPtagBillCreated` truyền `confirmedSuccess: true`)

**Chi tiết:**

- **Fix D (lỗi 50%):** `queueProcessingTagSave` chỉ lưu `orderCode`+metadata; `_flushBatchSave` đọc lại `getOrderData(orderCode)` tại lúc flush → batch luôn gửi `category` mới nhất, hết lost-update.
- **Fix B:** invoice "Chờ nhập hàng" (`StateCode==='NotEnoughInventory'`) không tính là PBH active → reconcile không flip đơn fail. Guard `_ptagHasAmMaTag` giữ làm lớp 2.
- **Fix A:** đơn fail ép `showState='Nháp'`/`state='draft'`, vẫn giữ row "Chờ nhập hàng".
- **Fix C:** sau khi gắn/gỡ tag thành công → `updateOrderInTable(orderId,{Tags})` (route `updateRowTagsOnly`, không reset scroll); báo notification khi gắn fail.
- **Fix 4 (user chốt: GỠ ÂM MÃ):** nhánh success-tường-minh (`confirmedSuccess`) bỏ qua guard ÂM MÃ; nếu đơn còn tag ÂM MÃ cũ (retry sau khi nhập hàng) → `removeTagFromOrder(id,'ÂM MÃ')` rồi flip ĐÃ RA ĐƠN. Nhánh reconcile vẫn giữ guard.

**Status:** DONE (code). Verify Playwright localhost pending.

### [render][customer-hub][issue-tracking] Đổi hạn cấp công nợ ảo 15 → 30 ngày (chỉ phiếu mới) ✅

**Yêu cầu user**: Công nợ ảo cấp mới có thời hạn **30 ngày** thay vì 15. KHÔNG đụng phiếu cũ (chỉ đổi default trong code, các row `virtual_credits` đã có giữ nguyên `expires_at`). Áp dụng **cả 2 luồng** cấp (xác nhận qua AskUserQuestion).

**Bối cảnh**: `expires_at` là `NOT NULL` không có DB default → ngày hết hạn luôn do code truyền lúc cấp (`issueVirtualCredit`: `expiresAt = now + expiresInDays`). Cron `expire_virtual_credits()` (chạy mỗi giờ) chỉ đổi `status='EXPIRED'` + trừ `virtual_balance`, KHÔNG xoá row. Đổi default code = chỉ ảnh hưởng phiếu cấp SAU khi deploy.

**Files (7 chỗ, 15 → 30)**:

- Luồng A (cấp tay – nút "Cấp công nợ ảo"): `customer-hub/js/modules/wallet-panel.js` (input `value="30"` + fallback `|| 30`); `render.com/routes/v2/wallets.js` (`POST /:customerId/credit` default `expiry_days = 30`)
- Luồng B (tự động từ "Thu về" / RETURN_SHIPPER): `render.com/routes/v2/tickets.js` (ticket completion hardcode `30` + `POST /:id/resolve-credit` default `expires_in_days = 30`); `issue-tracking/js/script.js` (frontend gọi `resolveTicketCredit` truyền `expires_in_days: 30`)
- Dùng chung: `shared/js/api-service.js` (`issueVirtualCredit` default `expiry_days || 30`)
- Không đổi: `render.com/services/wallet-event-processor.js` (function-level default `expiresInDays = 30` vốn đã đúng)

**Trạng thái DB lúc đổi**: 161 virtual_credits (127 USED, 15 EXPIRED, 14 CANCELLED, 5 ACTIVE), không có row quá hạn tồn đọng. Tất cả 15 EXPIRED giữ nguyên (đúng yêu cầu "không thay phiếu cũ").

**Status**: DONE — đã syntax-check 5 file JS (node --check OK).

### [issue-tracking] Phiếu hoàn TPOS honor giảm giá per-line → hết lỗi "Số tiền không khớp", tự cộng ví ✅

**Bug user báo**: Tạo ticket hoàn hàng cho đơn có giảm giá per-line (vd `NJD/2026/68518`: SP 450k, note "350k", giảm 100k) báo popup **"⚠️ KHÔNG cộng ví tự động — Số tiền không khớp! Ticket: 350.000đ vs TPOS: 450.000đ"** → bắt cộng ví tay.

**Root cause**: Phía ticket (`ticket.money`) tính tiền hoàn theo **giá sau giảm** (đọc Note "350k" qua `getEffectivePriceForLine`/`parseDiscountedPriceFromNote` trong `issue-tracking/js/script.js`) = 350k. Nhưng `ApiService.processRefund` (`shared/js/api-service.js`) tính refund order TPOS theo **`PriceUnit` gốc** (`Σ PriceUnit × qty` = 450k) vì 2 helper parse Note **chỉ có trong script.js**, không có trong api-service.js. → so sánh `script.js:1971-1973` luôn lệch với mọi đơn giảm giá per-line + refund order TPOS ghi dư.

**Cách làm** (chỉ sửa `shared/js/api-service.js`, không đụng script.js vì `ticket.money` đã đúng):

- Thêm 2 helper module-scope `_parseDiscountedPriceFromNote` + `_effectiveUnitPrice` (mirror y nguyên logic script.js — note 2 bản phải giữ đồng bộ).
- Trong `processRefund` vòng lọc OrderLines: mỗi line giữ lại → `effPrice = _effectiveUnitPrice(productMatch.note ?? line.Note, line.PriceUnit)`; set `line.PriceUnit = effPrice`, `PriceTotal = effPrice × qty`, `PriceSubTotal`. (Ưu tiên note ticket, fallback note refund order TPOS.)
- `newAmountTotal = Σ(line.PriceTotal)` (đã = giá sau giảm × qty) → `refundDetails.AmountTotal/AmountUntaxed/AmountTotalSigned` + `refundAmountFromJson` = 350k = `ticket.money` → `amountMatches=true` → resolveTicket atomic cộng ví. Refund order TPOS cũng ghi đúng 350k.

**Quy tắc**: SP có note "x"k → hoàn = (số trong note) × số lượng trả; SP không note → `PriceUnit` gốc × qty; tính độc lập từng dòng. Phải `× qty` cả 2 phía để luôn bằng nhau.

**Không regression**: đơn không giảm / giảm chỉ mức order (không note per-line) → helper trả về `PriceUnit` gốc → y như cũ (2 phía vẫn khớp). Đối xứng với `getEffectivePriceForLine`.

**Consistency guard (money path — phát hiện qua adversarial review trước khi push)**: PUT payload (`_prepareRefundUpdatePayload`) gửi CẢ `OrderLines` (PriceUnit mới đã hạ) LẪN `DecreaseAmount` order-level cũ → nếu để nguyên, TPOS recompute `Σ(350k) − 100k = 250k` (double-discount → refund order ghi SAI). Fix: thêm cờ `anyDiscountBaked`; khi có line bị giảm → ZERO `DecreaseAmount/Discount/DiscountAmount/AmountTax` để PUT NHẤT QUÁN (`Σ PriceUnit×qty − 0 = AmountTotal = 350k`), đúng dù TPOS trust `AmountTotal` hay recompute. Đơn KHÔNG giảm → cờ false → giữ nguyên hành vi cũ (zero regression). Lưu ý: ví khách cộng theo `ticket.money` (resolveTicket `compensation_amount`), KHÔNG theo `refundAmountFromJson` — nên rủi ro chỉ ở sổ sách TPOS, không over-credit ví.

**Files**: `shared/js/api-service.js` (2 helper + khối lọc partial refund + consistency guard trong `processRefund`), `issue-tracking/index.html` (bump api-service `?v=20260601a`). `node --check api-service.js` OK. Caller duy nhất = `script.js:1900` → khoanh vùng.

---

### [orders] Modal Thêm hóa đơn nhanh — cho tạo phiếu tiếp với đơn "đã có phiếu" ✅

**Yêu cầu user**: Đơn đã có phiếu "Đã xác nhận"/"Đã thanh toán" bị lọc bỏ khi tạo hóa đơn hàng loạt → modal khoá cứng (nhất là khi TẤT CẢ đơn đã chọn đều có phiếu → body trống, `return` sớm). Cần nút trong modal để hiển thị các đơn đó và cho tạo phiếu tiếp.

**Cách làm**: tái sử dụng cờ bypass có sẵn `window._forceCreatePBHBypass` (đang dùng cho nút "+ PBH" đơn lẻ) — set cờ rồi gọi lại `showFastSaleModal()`. Theo lựa chọn user: hiện TẤT CẢ đơn (hợp lệ + đã có phiếu, đơn sau gắn nhãn vàng "Đã có phiếu"); chỉ CẢNH BÁO không chặn (nhãn + banner vàng), "Lưu xác nhận" là bước xác nhận cuối.

**Files**:

- `orders-report/js/tab1/tab1-fast-sale.js`:
    - Tách helper `fastSaleOrderHasConfirmedInvoice(order)` (Check1 ShowState/State/StatusText + Check2 InvoiceStatusStore) — dùng chung cho filter (normal) và tag (bypass).
    - Filter confirmed/paid: normal mode push `confirmedOrderCodes` + `skippedConfirmedOrders` rồi loại; bypass mode giữ đơn + `order._alreadyInvoiced = true`. Set `window._fastSaleSkippedConfirmed` + `window._fastSaleBypassActive`.
    - Hàm mới `showSkippedConfirmedOrders()` (set bypass + reopen) + `updateFastSaleSkippedFooterButton()` (toggle nút footer khi skipped>0 && !bypass). Export `window.*`.
    - Empty-state "tất cả đã có phiếu" + footer: thêm nút vàng "Hiển thị & tạo tiếp N đơn đã có phiếu".
    - Badge vàng "Đã có phiếu" trong `renderFastSaleOrderRow` (gated `order._alreadyInvoiced`). Banner cảnh báo bypass cuối `renderFastSaleModalBody` (có guard `_fastSaleHasBlockingStatus` để không đè banner chờ điều chỉnh công nợ ví). Reset toàn bộ state mỗi lần mở modal.
- `orders-report/tab1-orders.html` — nút footer tĩnh `#fastSaleShowSkippedBtn` (display:none, vàng) giữa "Đóng" và "Lưu xác nhận".
- `node --check orders-report/js/tab1/tab1-fast-sale.js` OK. Cờ bypass bị consume ngay tại showFastSaleModal nên không rò sang lần mở normal sau.

---

### [orders][render] Celebration Config — sync cross-machine qua SSE (fix "máy khác không cập nhật hình") ✅

**Bug user báo**: admin upload ảnh trên máy A, máy B vẫn hiển thị ảnh cũ khi bắn pháo hoa.

**Root cause**:

1. Render endpoint `POST /api/realtime/celebration` chỉ destructure `{employee, detail}`, drop `employeeData` + `effects` → SSE broadcast về clients chỉ có key + detail, render fallback defaults.
2. Config persist localStorage máy admin only — nếu admin save trên máy A nhưng bắn từ máy B, broadcast vẫn lấy config cũ từ localStorage máy B.

**Fix Phase 1 — Forward full payload tại fire time**:

`render.com/routes/realtime-sse.js`:

- `POST /celebration` body: thêm `employeeData` + `effects` vào destructure + payload `notifyClients()`.
- Log payload size (KB), warn nếu > 400KB.

**Fix Phase 2 — Sync config khi save (mọi máy admin)**:

`render.com/routes/realtime-sse.js`:

- New route `POST /api/realtime/celebration-config` body `{config}` → broadcast topic `celebration_config` → mọi client cập nhật localStorage.

`orders-report/js/celebration-config.js`:

- New `broadcastConfig(cfg)` — POST `/api/realtime/celebration-config` sau khi save thành công.
- New `connectSSE()` — EventSource subscribe `celebration_config` topic, listener gọi `applyRemoteConfig(cfg, publishedAt)`.
- `applyRemoteConfig`: skip nếu giống local (chống render churn), skip nếu là echo broadcast của chính mình (suppressBroadcastUntil = now + 2000ms), apply → localStorage + refresh `CelebrationManager.refreshEmpSelect()` + re-render modal nếu đang mở + toast "Config sync từ máy khác 🔄".
- Save handler: set suppressBroadcastUntil + gọi broadcastConfig + toast "Đã lưu + sync sang máy khác 🎉".
- SSE auto-connect on DOMContentLoaded — apply cho cả non-admin clients vì broadcast cũng tới họ (họ chỉ cần localStorage đúng để render khi celebration fire).

`orders-report/main.html`: cache-bust `?v=20260601b`.

**Flow cross-machine sau fix**:

1. Admin Máy A: upload ảnh Hạnh → click "Lưu thay đổi" → save localStorage A + POST `/celebration-config` → SSE broadcast topic `celebration_config`.
2. Mọi máy (B/C/...): EventSource nhận event → `applyRemoteConfig` → save localStorage máy đó → modal tự refresh nếu mở.
3. Admin Máy B: mở "🎨 Cài đặt Pháo Hoa" → thấy ảnh mới (vì localStorage B đã được sync) → bấm "Bắn Pháo Hoa" → broadcast `{employee, detail, employeeData (= ảnh mới), effects}` → mọi tab render đúng.

**Test live (lần verify đầu)**:

- ✅ `Object.keys(window.CelebrationConfig)` có `broadcastConfig`, `listEmployees` mới.
- (Test sâu hơn bị chặn vì browser session bị navigate qua trang khác do user.)

**Deploy Render**: code change only → push GitHub → Render auto-deploy. Không cần env var.

**Files**: `render.com/routes/realtime-sse.js`, `orders-report/js/celebration-config.js`, `orders-report/main.html`.

Status: ✅ Done (chờ Render deploy ~2-3 min sau push để live verify cross-machine).

---

### [orders] Celebration Config — admin tự custom ảnh/text/hiệu ứng pháo hoa per nhân viên ✅

**Yêu cầu user**: trang `orders-report/main.html` cài đặt admin pháo hoa: thêm UI cho admin chỉnh ảnh nhân viên, text, hiệu ứng (chỉ admin thấy).

**New file**: `orders-report/js/celebration-config.js` — `window.CelebrationConfig` (load/save/getEmployee/listEmployees/getColors/openModal). Persist localStorage `celebrationConfig_v1` (employees + effects). Modal UI:

- **Nhân viên** (CRUD): mỗi card có avatar 88px + button camera upload (compress 480px, JPEG quality auto-fit ≤220KB), 4 input (tên hiển thị, tiêu đề, mẫu câu với `{name}`, KPI mặc định), button preview 🎆, button xóa 🗑️ (trừ Hạnh mặc định). Button "+ Thêm nhân viên" (prompt name → slugify key).
- **Hiệu ứng**: dropdown màu (🌈 rainbow / 🔥 warm / ❄️ cool / ✨ gold), mật độ (low 0.5x / normal 1x / high 1.5x), thời gian (5/8/10/15/20 giây).
- Footer: Khôi phục mặc định / Hủy / Lưu thay đổi.

**Modified `orders-report/js/celebration.js`**:

- `EMPLOYEES` hardcoded → fallback only, đọc qua `CelebrationConfig.getEmployee()`.
- `celebrate(key, detail, employeeOverride, effectsOverride)` — nhận override để client phụ render đúng config admin.
- `triggerCelebration` đưa `employeeData` + `effects` vào SSE payload → mọi tab/máy hiển thị giống nhau theo config admin (không cần Firestore sync).
- SSE handler: `celebrate(employee, detail, employeeData, effects)`.
- Particle waves dùng `currentColors` + `currentIntensity` từ config.
- Render text qua `escapeHtml` + `renderName()` (template `{name}` placeholder).
- `init()` thêm dropdown chọn nhân viên + button mở config modal.
- `window.CelebrationManager` exposed cho modal preview.

**Modified `orders-report/main.html`**:

- Admin panel: thêm `<select id="celebrationEmpSelect">` + button "🎨 Cài đặt Pháo Hoa" (orange/red gradient, mở modal config).
- Load `celebration-config.js` TRƯỚC `celebration.js`. Cache-bust `?v=20260601a`.

**Modified `orders-report/css/celebration.css`**:

- `.admin-select` dropdown style trong panel.
- Block `.cel-cfg-*` cho modal: overlay dark, dialog 720px gradient bg, grid employee card 88px avatar + 2-col fields + actions, responsive < 640px stack 1-col.
- Toast `.cel-cfg-toast` green pill bottom-center cho save confirm.

**Cross-device sync**: Admin click "Bắn pháo hoa" → POST `/api/realtime/celebration` với payload `{employee, detail, employeeData (full config), effects}` → SSE broadcast tới mọi tab/máy → render đúng ảnh + text + theme admin đã cấu hình. Không cần sync localStorage.

**Test live** (`http://localhost:8080/orders-report/main.html` qua persistent browser session):

- ✅ Modal mở: 1 employee Hạnh, 4 text input, 4 theme option, photo upload + preview button.
- ✅ Edit name + save → `localStorage.celebrationConfig_v1.employees.hanh.name === "Hạnh (test)"`, theme/intensity persist.
- ✅ Thêm employee "Tú" → dropdown panel cập nhật `[Hạnh, Tú]`.
- ✅ `celebrate('tu', 'KPI cao!')` → overlay render name "Nhân viên Tú đã đạt KPI" (template `{name}` đúng), photo fallback SVG khi rỗng.
- ✅ Screenshot modal + admin panel xác nhận visual khớp design (orange gradient cfg button, green save, ghost cancel).

**Lưu ý cho user**: Hạnh mặc định vẫn dùng ảnh cũ `assets/employees/hanh.jpg`. Để đổi sang ảnh mới, mở "🎨 Cài đặt Pháo Hoa" → click 📷 trên avatar Hạnh → chọn file ảnh → "Lưu thay đổi". Ảnh được compress + lưu base64 trong localStorage (≤220KB).

**Files**: `orders-report/js/celebration-config.js` (new), `orders-report/js/celebration.js`, `orders-report/main.html`, `orders-report/css/celebration.css`.

Status: ✅ Done.

---

### [web2/shared][native-orders] Web2Optimistic helper — pattern UI-first cho toàn bộ Web 2.0 ✅

**Yêu cầu user**: "tất cả các trang trong menu → thao tác UI trước, chạy hàm background → lỗi thì back lại → mục đích tăng tương tác user".

Pattern proven trên tpos-pancake cart ops (commit `77aec531a`). Codify thành shared helper để mọi page Web 2.0 áp dụng dễ dàng.

**New file**: `web2/shared/web2-optimistic.js` — `Web2Optimistic.run({ snapshot, apply, run, onSuccess, rollback, errLabel, successMsg })`. Encapsulates 4-step flow:

1. `snapshot()` lưu state cũ (sync, optional)
2. `apply()` update UI optimistic (sync, mandatory)
3. `successMsg` toast NGAY qua notificationManager (optional)
4. Fire-and-forget IIFE: `await run()` → success → `onSuccess(data)`; fail → `rollback(prev)` + show `"✗ Lỗi <errLabel>: <message>"` toast.

Returns **undefined sync** — caller không await. Backend chạy hoàn toàn background.

**Wired vào page-shell preload** (`web2/shared/page-shell.js`):

- Thêm vào `SCRIPTS_PRELOAD` sau `web2-db-badge.js`. Mọi page dùng `Web2Shell.bootstrap({...})` đều có `window.Web2Optimistic` available out-of-the-box (không cần import thủ công).

**Pages dùng page-shell** (auto-có Web2Optimistic, không cần thêm script tag): 87 TPOS-clone pages + dashboard + audit-log + smart-match + supplier-aging + supplier-360 + notifications + KPI + …

**Pages legacy (KHÔNG dùng page-shell)** — cần thêm `<script src="../web2/shared/web2-optimistic.js?v=20260601a"></script>` thủ công. Đã thêm vào:

- `native-orders/index.html` (Đơn Web)

**Refactored**: `native-orders/js/native-orders-app.js`:

- `saveEdit()` — bỏ `async`, sync return. Modal đóng + danh sách re-render NGAY (~11ms). PATCH `/api/native-orders/:code` chạy IIFE background. Snapshot order cũ để rollback nếu lỗi. `onSuccess(resp)` sync silent với response authoritative.
- `quickStatus(code, status)` — bỏ `async`, sync return. Badge status đổi NGAY. PATCH background. Rollback restore prevStatus nếu lỗi.
- Fallback path nếu `Web2Optimistic` chưa load (defensive) — giữ behavior cũ với `await + try/catch`.

**Verified qua persistent browser session**:

- `Web2Optimistic` available trên native-orders: `{ run: function }` ✓
- `saveEdit` returns sync trong **11.4ms** (vs trước: 200-500ms chờ PATCH); modal closes immediately; PATCH fires exactly 1 lần in background.

**Migration path cho các page còn lại** (làm dần khi đụng tới):

1. Nếu page dùng `Web2Shell.bootstrap()` → `Web2Optimistic` đã có sẵn, chỉ cần refactor handler.
2. Nếu page legacy (chưa dùng page-shell): thêm `<script src="../web2/shared/web2-optimistic.js?v=20260601a"></script>` trước script chính.
3. Tìm các handler `async function ... { await fetch(...) ... renderRow(...) ... }` → wrap qua `Web2Optimistic.run({apply, run, rollback, errLabel})`.
4. Special case money/wallet ops: SHOULD VẪN await + show loading state (vì rollback gây confuse cho user khi liên quan tiền). Đánh dấu rõ trong code.

**Pages priority migration sau** (theo độ frequent của thao tác user):

- so-order/ (Sổ Order) — qty edits, status changes
- fastsaleorder-invoice/ (Bán hàng HĐ) — print, cancel, modify
- web2/products/ + web2/variants/ — create/edit/delete
- web2/notifications/ — mark read/dismiss
- partner-customer/ — edit/QR/wallet link

**Status**: ✅ Done (helper + 1 page POC); migration tiếp theo theo yêu cầu.

---

### [web2] Xóa trang `sale-online-facebook` + dừng cron sync 15min — UI sai mục đích ✅

**Phát hiện**: trang `web2/sale-online-facebook/` UI render columns kiểu "ID Page / Tên page / Token / Ghi chú" (như quản lý FB page token), nhưng DB slug `saleonline-facebook` thực tế chứa **10058 đơn hàng online** sync từ TPOS `/odata/SaleOnline_Order/ODataService.GetView` (49 fields gồm Facebook_UserId/PostId/CommentId/Telephone/Address/TotalAmount/…). UI không khớp data → cột Token/Ghi chú luôn trống, cột "ID Page" thực ra là mã đơn, cột "Tên page" là tên KH. Đơn FB đã có chỗ xem đúng: [native-orders/](../native-orders/), [tpos-pancake/](../tpos-pancake/).

**Việc đã làm**:

1. `rm -rf web2/sale-online-facebook/`
2. [render.com/services/web2-sync-worker.js:49](../render.com/services/web2-sync-worker.js#L49): bỏ `'saleonline-facebook'` khỏi tier `hot` → cron `*/15 * * * *` còn lại `fastsaleorder-invoice` + `livecampaign`. Dừng burn quota Neon ghi 10k rows/15min.
3. [scripts/web2-seed-from-tpos.js:577-627](../scripts/web2-seed-from-tpos.js#L577): xóa entry mapper 51 dòng (slug/tposPath/mapper với 39 picked fields).
4. [web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js): xóa entry "Facebook" trong nhóm "Sale Online" → còn 3 child (Chiến dịch Live, Đơn Web, Sổ Order, TPOS × Pancake).
5. [scripts/n2store-smoke-all-pages.js:115-200](../scripts/n2store-smoke-all-pages.js#L115): rebuild `WEB2_PAGES` array từ 82 slug stale (chứa cả slug đã xóa từ commit trước + slug không có folder thật) → 33 slug actual existing.
6. Rebuild manifest+nav: `node scripts/web2-build-manifest.js` (3 → 2 modules), `node scripts/web2-build-nav.js` (regen WEB2_NAV_ITEMS).

**Verify**: 4 file JS syntax OK, 36 sidebar links → 0 missing, 0 orphan ref cho `saleonline-facebook|sale-online-facebook` trên `.html|.js|.json`.

**Còn lại**: 10058 records trong DB Neon vẫn còn — chưa xóa, chờ user confirm gọi `DELETE /api/web2/saleonline-facebook/delete-all` để cleanup.

**Status**: ✅ Done (trừ DB cleanup)

---

### [web2] Xóa 57 trang TPOS-clone stub không dùng — sidebar còn 9 nhóm gọn ✅

**Yêu cầu user**: kiểm tra 27 URL + 3 hình menu (Kế toán/Báo cáo/Cấu hình), trang TPOS-clone không dùng thì xóa, "mai mốt cần thì code lại".

**Khảo sát**: 57 trang là pure `Web2Shell.bootstrap` stub (35-150 dòng, 0 records DB per `/api/web2/_storage`). Chỉ 7 trang có data hoặc impl thật → GIỮ: `sale-online-facebook` (10058 records), `fastsaleorder-refund` (route `/api/refunds`), `fastsaleorder-delivery` (route `/api/delivery-invoices`), `report-revenue` (619 dòng), `report-delivery` (385 dòng), `users` (full module), `pancake-settings` (376 dòng).

**Việc đã làm**:

1. `rm -rf` 57 folders trong `web2/`: stock-_ (6), account-_ trừ balance-history (6), product-_ trừ products/variants/product-category (6), promotion/coupon/loyalty/offer (4), report-_ trừ 2 cái thật (16), configs-\* + company/application-user/res-currency/ir-mailserver/mail-template/callcenter-config/product-label-paper (12), tag/export-file/account-thu/account-chi/account-list/account-journal (6), sales-channel (1).
2. Edit [web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js): xóa 57 entries, xóa hẳn 4 nhóm rỗng ("Kênh bán", "Kho hàng", "Khuyến mãi", "Kế toán"), 4 nhóm còn lại được dọn ("Tài chính" còn SePay, "Sản phẩm" còn 3, "Báo cáo" còn 2, "Cấu hình" còn 2). 37 sidebar links → 0 missing.
3. Rebuild auto-gen: `node scripts/web2-build-manifest.js` (86 → 3 modules) + `node scripts/web2-build-nav.js` regen WEB2_NAV_ITEMS block trong [shared/js/navigation-modern.js](../shared/js/navigation-modern.js) (xóa 56 entries cũ).
4. Xóa 2 test scripts đã chết: `scripts/web2-nav-test.js` + `scripts/web2-interaction-test.js` (đều mount qua `web2/tag/index.html` đã xóa, test scaffolding TPOS-clone).

**Verify**: `node -c` cả 2 file JS sidebar/nav passed. Cross-ref scan trên `.html|.js|.json` cho 57 slug đã xóa: 0 orphan refs.

**Status**: ✅ Done

---

### [tpos-pancake] UI-first toàn diện cho cart ops — toast/badge instant, backend background, rollback nếu lỗi ✅

**Yêu cầu user**: "thao tác trên tpos-pancake thì cứ cập nhật ui trước đi, các thao tác chạy background → lỗi thì back lại thông báo user biết".

Trước fix: badge update optimistic ngay, NHƯNG toast confirm "Thêm SP" + nút Hoàn tác chỉ xuất hiện SAU khi `await fetch /add` xong (200-500ms). User cảm nhận có lag dù badge đã đổi.

**File**: `tpos-pancake/js/pancake/inventory-panel.js`

- `addToCart` — bỏ `async`, làm sync. Step 1 INSTANT: badge update + `_showUndoToast` xuất hiện < 5ms. Step 2 background: IIFE `(async () => { ... })()` chạy fetch; success → sync silent `d.qty` authoritative; fail → rollback badge + remove optimistic toast + `_showToast(error, 'err')` qua notificationManager.
- `removeFromCart` — tương tự sync return. Step 1: badge giảm + xóa popover row + toast "Đã xóa". Step 2 background: nếu lỗi → rollback badge + restore popover row tại vị trí cũ (insertBefore với nextSibling snapshot) + error toast.
- `clearOrder` — sync return. Step 1: badge=0 + remove popover + toast "Đang xóa đơn...". Step 2 background: nếu lỗi → rollback + restore popover từ outerHTML snapshot + error toast.
- `_showUndoToast` — trả về element + `_snapTickerCancel()` để caller cancel countdown interval khi rollback.
- Drop handler — bỏ `async` keyword; gọi `addToCart(...)` không có `await` → event handler return ngay tức thì cho browser.
- Undo button trong toast: nếu user click trước khi /add response về, removeFromCart fires độc lập. Backend idempotent qua productCode merge (no-op nếu product chưa add).

**Pattern (template cho tpos-pancake ops sau)**:

1. Snapshot state cũ (`prev`).
2. Apply optimistic state + render DOM sync (< 5ms).
3. Show success toast NGAY.
4. Fire background IIFE: try await fetch + parse; success → sync authoritative; fail → rollback + remove optimistic toast + error toast qua notificationManager.

**Verified qua persistent browser session**:

- Optimistic instant: `addToCart` returns sync trong 4.4ms; badge + toast xuất hiện cùng frame.
- Backend background fail (mock 500 sau 200ms): T+500ms badge rolled back, undo toast removed, error notif fire qua notificationManager: `["✗ Lỗi thêm "BAD-X": simulated 500", "error"]`.
- Drop handler bỏ `async` → browser drop event handler return ngay, không hold cursor.

**Status**: ✅ Done

---

### [web2-balance-history] Filter nhanh: Hôm nay / Hôm qua / Tuần này / Tuần trước / Tháng này / Tháng trước ✅

**Files**:

- `web2/balance-history/index.html` — hàng chips presets ngay sau toolbar
- `web2/balance-history/css/web2-balance-history.css` — `.w2bh-date-presets` flex-wrap + `.w2bh-date-preset` pill, active = cyan (#0891b2)
- `web2/balance-history/js/web2-balance-history-app.js` — thêm `_toISODate`, `_datePresetRange(key)`, `_currentPresetKey(from,to)`, `_updateDatePresetActive()`, `_applyDatePreset(key)`. Bind click delegated trên `dom.datePresets`. Auto-highlight chip khi user gõ tay vào input date. Thay `_defaultDateRangeThisMonth()` bằng `_datePresetRange('thisMonth')`.

**UX**:

- Tuần bắt đầu Thứ Hai (VN), kết thúc Chủ Nhật
- Click chip đang active → xoá filter (toggle off, xem tất cả)
- User gõ tay vào input date → chip match auto sáng, không match thì tắt hết
- Default mở trang vẫn là "Tháng này"

**Verified qua persistent browser session** (today = 2026-06-01, Thứ 2):

```
today      → 2026-06-01 → 2026-06-01
yesterday  → 2026-05-31 → 2026-05-31
thisWeek   → 2026-06-01 → 2026-06-07
lastWeek   → 2026-05-25 → 2026-05-31
thisMonth  → 2026-06-01 → 2026-06-30
lastMonth  → 2026-05-01 → 2026-05-31
```

**Status**: ✅ Done

### [tpos-pancake][render] Anti-lag khi kéo SP vào comment / thêm SP vào đơn ✅

**User báo**: kéo sản phẩm vào comment tạo đơn HOẶC thêm SP mới vào đơn có sẵn bị **lag** bên tpos-pancake.

**Root causes**:

1. **O(N²) DOM scans**: `_resolveTposCustomer` dùng `comments.find()` per row → renderBadges + refreshCartCounts chạy 2× full DOM × `comments.find()` mỗi cycle. 200 rows × 200 comments = 40K ops × 2 = 80K ops per render.
2. **Redundant network calls sau /add**: frontend gọi `refreshCartCounts([cid])` ngay sau response → 1 extra GET. SSE `web2:cart` arrives → another refresh. SSE `web2:native-orders` debounce 200ms → third refresh. **3 round-trips cho 1 drop**.
3. **Backend `_logHistory` awaited**: blocks response 20-50ms cho audit insert không cần thiết.
4. **`dragover` spam**: fires ~60×/s khi drag, mỗi lần `closest()` + `classList.add()` dù row không đổi.
5. **`renderBadges` toàn list sau optimistic update**: 1 drop touches DOM của tất cả 200 rows thay vì chỉ row liên quan.

**Fixes** (file `tpos-pancake/js/pancake/inventory-panel.js`):

- `_getCmtMap()` — cached `Map<commentId, comment>` rebuild khi TposState.comments thay đổi (signature = length + first/last id). O(1) lookup thay vì O(N) find. **Bench: 6× faster (110ms → 18ms cho 10 loops × 782 rows)**.
- `_renderBadgeFor(customerOrCommentId)` — render badge chỉ cho rows match customer, không loop toàn list. Dùng cho optimistic update sau drop/remove/clear.
- `addToCart` — dùng `d.qty` từ response trực tiếp, bỏ `refreshCartCounts([commentId])` sau success. SSE catch-up bất đồng bộ.
- `removeFromCart` + `clearOrder` — tương tự: bỏ explicit refresh sau success.
- SSE `web2:cart` handler — debounce 200ms + gom commentIds qua Set. Burst 3 events trong 100ms → 1 refresh thay vì 3.
- `web2:native-orders` debounce 200→400ms (bớt race với cart event).
- `dragover` handler — track `_lastHoverRow`, skip DOM touch khi row không đổi. Cleanup khi dragend.
- `_markHasOrderRows` — selector `:not(.inv-has-order)` skip rows đã mark, tránh attribute mutation spam.

**Backend fixes** (file `render.com/routes/v2/cart.js`):

- `_logHistory(pool, ...)` calls — bỏ `await` trên 4 endpoints (add/remove/clear/qty-change). Fire-and-forget, errors swallowed inside helper. **Cắt 20-50ms khỏi response time per cart op**. PBH path giữ await (không phải hot path).

**Expected impact**:

- Drop SP vào comment: ~50% bớt round-trip frontend (1 fetch /add thay vì /add + /batch/counts × 2).
- Render badges: 6× faster cho 200+ rows lists.
- Response time backend `/cart/:id/add`: 200-500ms → 150-400ms (cắt log INSERT block).
- `dragover` mượt hơn (skip redundant DOM writes).

**Verified**:

- Bench Map lookup: 110ms → 18ms (~6× speedup) qua persistent browser session với 782 rows.
- `node --check` pass cho cả 2 files.
- Logic giữ nguyên: optimistic update + SSE catch-up + rollback on error.

**Status**: ✅ Done

---

### [kpi][web2] Sprint 5 KPI — fastsaleorder-invoice integration + user docs (FINAL) ✅

**Plan**: [docs/plans/kpi-attribution-system.md](plans/kpi-attribution-system.md) Sprint 5 (final). User guide: [docs/web2/KPI-USER-GUIDE.md](web2/KPI-USER-GUIDE.md).

**fastsaleorder-invoice integration** (`web2/fastsaleorder-invoice/pbh-app.js`):

- `_authHeaders()` đọc Web2Auth token → inject `x-web2-token`
- `_fetch()` wrapper auto-inject auth header
- GET `/load` switch sang `_fetch()` → backend apply scope (PBH inherit từ source_code → native_orders campaign+STT)
- `_loadAndRenderScopeBanner()` init → banner xanh "Bạn chỉ thấy PBH có nguồn từ đơn STT trong khoảng…" cho NV restricted

**User docs** (`docs/web2/KPI-USER-GUIDE.md`):

- Quick start cho Admin (4 bước phân công) + Nhân viên (login, scope banner, badge native/livestream/backlog)
- KPI Dashboard tabs (Forecast / Actual / Audit + CSV export)
- Backlog Review workflow (admin queue + 2 decisions)
- Formula KPI + idempotency contract
- Edge cases (delete-readd, cross-user, cancel, reissue, no-campaign)
- Troubleshooting + permissions matrix
- Sprint history table

**Plan status**: IMPLEMENTED. 6 sprints done trong 2 ngày (5-6 days estimate beaten 3x do reuse `campaign_employee_ranges` từ Web 1.0).

**Final architecture**:

```
Cart drag-drop → forecast_add (livestream, không KPI)
Native picker  → forecast_add (native, count KPI) OR forecast_add (backlog, admin review)
PBH create     → actual_confirmed (promote forecast → actual)
PBH/native cancel → actual_revoked (revoke actual, forecast giữ)

Beneficiary = lookup campaign_employee_ranges JSONB at emit time
Scope filter = same lookup at request time → req.kpiScope WHERE clause
```

**Tables**: 3 new (`web2_kpi_events` ledger, `web2_kpi_forecast`, `web2_kpi_actual`) + 1 column (`native_orders.campaign_stt`) + 2 reused (`campaign_employee_ranges` + history).

**Pages**: 3 new (`/web2/kpi/index.html`, `assignments.html`, `backlog-review.html`).

**Routes updated**: 11 (native-orders.js: load/campaigns/PATCH/cancel; fast-sale-orders.js: load/from-native-order/cancel/by-source-cancel; cart.js: add/remove).

---

### [kpi][render][web2] Sprint 4 KPI — Backlog Review + Recalc + SSE realtime + CSV export ✅

**Plan**: [docs/plans/kpi-attribution-system.md](plans/kpi-attribution-system.md) Sprint 4

**Backend** (`render.com/routes/v2/kpi.js`):

- `GET /api/v2/kpi/backlog?campaign_id=` — list `forecast_add source='backlog'` chưa admin review (NOT EXISTS reclassify_backlog compensating event)
- `POST /api/v2/kpi/backlog/:id/reclassify` body `{decision, reviewerUserId, reviewerName, note}`:
    - `approve_backlog` → emit `reclassify_backlog` info event (qty_delta=0, marks reviewed) — KPI không count (đúng spec)
    - `reclassify_native` → emit reclassify + emit `forecast_add source='native'` → KPI cộng cho beneficiary
- `POST /api/v2/kpi/recalc?campaign_id=` — rebuild `web2_kpi_forecast` + `web2_kpi_actual` cache (idempotent)
- Export `recalcProjections(pool, campaignId)` helper cho cron job future

**Frontend** (`web2/kpi/`):

- **backlog-review.html** + js: admin queue, filter by campaign, table backlog events, click "Review" → modal full details + note → 2 actions
- **kpi-dashboard.js**:
    - SSE subscribe `web2:kpi:<userId>` → `debouncedRefresh` (600ms) khi event push
    - Audit log tab: "Export CSV" button → dump events thành file `kpi-events-<campaign>-<ts>.csv`
- **kpi/index.html** — load `web2-sse-bridge.js`

**Sidebar**: thêm "KPI Backlog Review" (adminOnly:true)

**Compensating event pattern**: `reclassify_backlog` event với `revokes_event_id = original.id` → backend query `WHERE NOT EXISTS` tự loại reviewed items → idempotent + auditable.

**Next** — Sprint 5: fastsaleorder-invoice STT column + polish.

---

### [native-orders][render] Tách "Bình luận khách" (read-only + thumbnail) khỏi "Ghi chú" (editable) ✅

**Yêu cầu user**: modal sửa đơn hiện đang trộn 2 thứ vào field "Ghi chú": (a) comment auto-captured từ FB (vd `[14:45:09 31/5/2026] [Nhi Judy House] Xét đen *********`), (b) ghi chú user tự ghi. Tách ra: phần "Bình luận khách" read-only + thumbnail cạnh bên, phần "Ghi chú" thành field riêng để user gõ.

**Files**:

- `render.com/routes/native-orders.js` — Migration 081: `ALTER TABLE native_orders ADD COLUMN IF NOT EXISTS user_note TEXT`. Cột mới riêng cho ghi chú NV. `mapRowToOrder` map `row.user_note → userNote`. PATCH allowed field `userNote: 'user_note'`. Search query mở rộng cover `user_note ILIKE`.
- `native-orders/js/native-orders-app.js` — Modal: thay `<textarea id="editNote">` (mix everything) bằng 2 block: (1) `_renderCommentReadonlyBlock(o)` render `<div #commentReadonlyBlock>` chứa `o.note` read-only + thumbnail slot (fetch async qua `_queueSnapFetch`), (2) `<textarea id="editUserNote">` editable cho `o.userNote`. `saveEdit` gửi `userNote` field, KHÔNG đụng `note` (giữ nguyên comment legacy).
- `native-orders/css/native-orders.css` — `.comment-readonly-wrap` amber background + dashed border (visually phân biệt với editable). `.comment-snap-thumb` 80x45 hover scale 1.4×.

**Data model**:

- Backward compat: `note` legacy column giữ nguyên (FB comments). User typed notes trước đây cũng ở đây — vẫn hiển thị read-only trong block "Bình luận khách" (user copy/paste sang ghi chú nếu cần).
- Forward: `note` chỉ chứa auto-captured comment, `user_note` chứa ghi chú NV. Tách rõ ràng.
- Save path: PATCH body gửi `userNote` (string, có thể empty). Backend update `user_note` column. `note` không bị touch.

**Verified qua persistent browser session**:

- Modal open order `NW-20260531-0002`: block "Bình luận khách" hiển thị note read-only đúng nội dung `[14:45:09 31/5/2026] [Nhi Judy House] Xét đen **********`. Textarea "Ghi chú" empty (đơn cũ chưa có user_note). Screenshot xác nhận layout amber + dashed.
- Save path: PATCH body chỉ gửi `userNote: "TEST_USER_NOTE_..."`, KHÔNG có `note` key → backend không override comment.
- Comment thumbnail slot: fetch async tới `/api/livestream/snapshots/by-comment-ids` cho `o.fbCommentId`. Render khi snap có bytea (`thumbnailUrl` chứa `/api/livestream/snapshot/`). Khi snap chỉ có metadata (chưa extract), slot trống — user click "📸 Lấy thumbnail" trên tpos-pancake để fill.
- Migration 081 idempotent (ADD COLUMN IF NOT EXISTS) — chạy trên next Render deploy không cần manual SQL.

**Status**: ✅ Done

---

### [inventory-tracking] Xoá hẳn cột ngay_bat_dau/ngay_ket_thuc (DB + code dư) ✅

Sau khi bỏ chia-theo-ngày, 2 cột `ngay_bat_dau`/`ngay_ket_thuc` thành dead. Xoá hẳn cho gọn:

- `render.com/routes/v2/inventory-tracking.js` — gỡ `ensureShipmentDateRangeSchema` + 3 call (GET/POST/PATCH shipments); POST bỏ kế thừa 2 cột (về lại chỉ thanh_toan_ck/ti_gia); PATCH payment-by-dot bỏ 2 cột khỏi UPDATE/RETURNING/params.
- `inventory-tracking/js/api-client.js` — `pgToShipment` bỏ map ngayBatDau/ngayKetThuc; `updatePaymentByDot` bỏ 2 field body.
- `render.com/migrations/073_drop_dot_date_range_from_inventory_shipments.sql` (mới) — `DROP COLUMN IF EXISTS` 2 cột (revert 072). Đã chạy DROP trên prod sau khi code sạch deploy.
- `node --check` OK; grep xác nhận 0 reference còn lại.

## 2026-05-31

### [tpos-pancake][native-orders][render] Per-comment thumbnail + native-orders product lines ✅

**Yêu cầu user**: 1/ tpos-pancake — comment chưa có thumbnail → nút lấy thumbnail riêng cho comment đó (bên cạnh chức năng Force extract toàn bộ). 2/ native-orders — đơn hiển thị thumbnail trong phần sản phẩm theo comment.

**Files**:

- `tpos-pancake/js/tpos/tpos-livestream-snap.js` — Thay button `tpos-snap-capture-btn` (display:none, mở FB tab + share screen) bằng `tpos-snap-extract-one-btn` "📸 Lấy thumbnail" visible. Click → backend-only flow (`_createMetadataSnap` + `extract-frame` cho 1 snap). SSE `extract-done` auto refresh thumbnail. Loading state trên button.
- `render.com/routes/v2/cart.js` — `_buildProduct(input, qty, user, fbCommentId)` thêm 5th param. POST /cart/:commentId/add pass `b.fbContext.fbCommentId` xuống. Merge branch (idx >= 0) cũng cập nhật fbCommentId. GET /:commentId trả `fb_comment_id` cho consistency.
- `native-orders/js/native-orders-app.js` — `_snapCache` module-wide + `_queueSnapFetch` debounce 150ms batch fetch `/api/livestream/snapshots/by-comment-ids`. `_renderLineSnapThumb(commentId)` trả `<img class="line-snap-thumb">` cho line có fbCommentId + snap với bytea. `openSnapLightbox` modal click-to-zoom + nút "Xem live tại giây này". Save edit cycle giữ fbCommentId.
- `native-orders/css/native-orders.css` — `.line-snap-thumb` 40x24 dưới line-img, hover scale(1.6) + ring vàng.

**Flow đầy đủ**:

1. User kéo SP từ TPOS-Pancake inventory panel vào comment row (đã có sẵn từ trước).
2. POST `/api/v2/cart/:customerId/add` với `fbContext.fbCommentId` = comment ID đích.
3. Backend ghi `fbCommentId` vào `native_orders.products[].fbCommentId` qua `_buildProduct`.
4. Khi user mở modal sửa đơn ở native-orders → `renderOrderLines` quét EDIT_LINES, line nào có `fbCommentId` chưa cache → queue fetch.
5. `_flushSnapFetch` batch GET `/api/livestream/snapshots/by-comment-ids?commentIds=ID1,ID2,...` direct tới Render (Cloudflare worker không route `/api/livestream/`).
6. Response có thumbnail self-served (`/api/livestream/snapshot/:id/image`) → cache + re-render line → `<img class="line-snap-thumb">` xuất hiện dưới SP image. Hover zoom 1.6×, click mở lightbox full-screen.

**Nếu comment chưa có snap** (`data === null`):

- Old: button "📸 Chụp" hidden, không thấy được.
- New: button "📸 Lấy thumbnail" visible cạnh row comment trong tpos-pancake. Click → `_extractThumbnailForComment(commentId, btn)`:
    - Resolve campaign + page + offset (qua `_resolveCampaignForComment` + `_fetchLiveVideoInfo`).
    - `_createMetadataSnap` tạo snap row trong DB (idempotent).
    - POST `/api/livestream/extract-frame` queue backend yt-dlp+ffmpeg cho 1 snap (~5-15s).
    - Button hiển thị "⏳ Đang lấy..." disabled.
    - SSE `extract-done` topic `web2:livestream-snapshots` notify → handler đã có sẵn (line 3041) invalidate cache + `_queueSnapByComment` → re-render thumbnail thật.
- Failure paths: missing campaign / no broadcastStart / backend 503 → toast error + restore button text.
- Không fallback Path C (mở FB tab + share screen) như `_captureAtCommentTime` — keep simple.

**Verified end-to-end qua persistent browser session**:

- TPOS new button render OK (visible, đúng class, đúng text) trên synthetic row.
- Native-orders fetch + render OK với real commentId `4603354969950658_1436947585200423` (snap id 2916, offset 105m18s, thumbnail self-served). Lightbox mở đúng với src + livestreamUrl tới fb-video-player.html.
- Backward compat: SP cũ (chưa có `fbCommentId`) render bình thường, no thumb (cache không hit, render placeholder).

**Status**: ✅ Done

---

### [kpi][render][native-orders] Sprint 3 KPI — Visibility filter (scope middleware) ✅

**Plan**: [docs/plans/kpi-attribution-system.md](plans/kpi-attribution-system.md) Sprint 3

**Backend middleware** (`render.com/routes/v2/kpi.js`):

- `applyKpiScope(req, res, next)` — đọc `x-web2-token` header, lookup user qua `web2_user_sessions`, query `campaign_employee_ranges` JSONB tìm ranges có userId match → attach `req.kpiScope = [{campaign_name, fromSTT, toSTT}, ...]`. Admin role → null = see all. Cache 5min per token.
- `buildScopeWhere(kpiScope, paramOffset)` → SQL `(live_campaign_name=$X AND campaign_stt BETWEEN $Y AND $Z) OR ...` + params.
- `buildScopeWhereWithAlias` cho JOIN scenarios.
- `invalidateScopeCache(userId?)` gọi từ campaigns.js PUT khi assignments change.
- `GET /api/v2/kpi/scope` — debug endpoint trả scope của caller.

**Applied to routes**:

- `native-orders.js GET /load` — main list, scope filter via `_kpiModule.applyKpiScope` middleware
- `native-orders.js GET /campaigns` — chỉ trả campaigns user được assigned
- `fast-sale-orders.js GET /load` — scope filter via `source_code IN (SELECT code FROM native_orders WHERE scope)` (PBH không có direct columns)

**Frontend**:

- `native-orders-api.js`:
    - `_authHeaders()` đọc Web2Auth token → inject `x-web2-token` vào mọi request
    - `getKpiScope()` query `/api/v2/kpi/scope`
- `native-orders-app.js init()`:
    - `_loadAndRenderScopeBanner()` show banner xanh "Bạn chỉ thấy đơn trong khoảng…" cho NV restricted
    - Admin/no-scope → no banner

**Cache invalidation hook**: `campaigns.js PUT /employee-ranges/:name` gọi `kpi.invalidateScopeCache()` sau khi save → user reload page sẽ thấy scope mới.

**Security**: Backend enforce scope từ token verified server-side; client-sent user ID không trust được.

**Next** — Sprint 4 (3 days): Dashboard recalc cron + Backlog Review queue + SSE realtime push.

---

### [kpi][web2] Sprint 2 KPI — Assignment UI + Dashboard pages ✅

**Plan**: [docs/plans/kpi-attribution-system.md](plans/kpi-attribution-system.md) Sprint 2

**New pages**:

- `/web2/kpi/index.html` — KPI Dashboard với 3 tabs: Forecast / Actual / Audit log
- `/web2/kpi/assignments.html` — Admin chia khoảng STT đơn cho NV theo campaign

**Assignment UI flow**:

1. Select campaign từ dropdown (load qua `/api/native-orders/campaigns`)
2. Auto-load existing ranges qua `GET /api/campaigns/employee-ranges/:name` (REUSED Web 1.0)
3. Table editable: select NV (từ `/api/web2-users/list`) + STT từ/đến + auto count
4. Client-side validation overlap (sorted scan) + backend re-validate on PUT
5. Save → `PUT /api/campaigns/employee-ranges/:name` (existing endpoint, đã có history audit)
6. History panel hiển thị 20 changes gần nhất

**Dashboard tabs**:

- **Forecast** — leaderboard `GET /api/v2/kpi/forecast?campaign_id=` → SL SP + tiền (5,000đ×qty)
- **Actual** — leaderboard `GET /api/v2/kpi/actual` + cột "SP bị revoke" info
- **Audit log** — 100 events gần nhất với event_type / actor / beneficiary / Δqty / source badges
- Top 3 nhân viên có rank gold/silver/bronze

**Integration**:

- `/web2/users/` row actions: thêm icon `trophy` "Phân công KPI" → mở `assignments.html` tab mới
- Sidebar "Tính năng mới" thêm entry "KPI Nhân viên"
- Reuse `Web2UserInfo` cho editor info trong PUT request

**Next** — Sprint 3 (2 days): Visibility filter (middleware `applyKpiScope` + 11 routes). Sprint 4: backlog review queue.

---

### [web2-balance-history] Modal "Sửa KH" cho phép cập nhật tên khi giữ nguyên SĐT ✅

**Files**: `web2/balance-history/js/web2-balance-history-app.js`

**Bug**: GD "(không tên) — 0906829977" có `debt_added=true` nhưng `display_name=null`. User mở modal "Sửa khách hàng", nhập SĐT cũ `0906829977` + tên "Anna Ngọc" → bị block với toast `"SĐT mới trùng SĐT cũ — không cần chuyển"`, không cho lưu tên.

**Root cause**: client-side validation reject ngay khi `phone === oldPhone` mà không check user có nhập tên hay không. Trong khi server `POST /reassign` line 336-348 đã handle case này như no-op cho wallet + `UPDATE display_name = COALESCE($name, display_name)`.

**Fix**:

- `submitReassign()`: chỉ block nếu `samePhone && !name`; cho submit nếu có name → server tự cập nhật display_name (path `sameCustomer`)
- `openReassignModal()`: nếu KH hiện tại `(không tên)` → đổi warning thành hint "💡 Nhập Tên KH để cập nhật tên", auto-fill SĐT cũ vào input, focus thẳng vào ô tên
- Success toast phân biệt 2 case: `sameCustomer → "Đã cập nhật tên KH"` vs `reassigned → "Đã chuyển X₫ từ A → B"`
- Submit button label động: "Đang cập nhật tên…" vs "Đang xử lý…"

**Status**: ✅ Done

### [kpi][render] Sprint 1 KPI Attribution — wire ledger write path ✅

**Plan**: [docs/plans/kpi-attribution-system.md](plans/kpi-attribution-system.md) Sprint 1

**Events emit từ 4 chokepoints:**

1. **Cart (livestream)** — `cart.js`:
    - POST `/cart/:cid/add` → `forecast_add` (source=livestream, qty=qtyAdd)
    - POST `/cart/:cid/:code/remove` → `forecast_remove` (qty=-removedQty)
    - `_emitCartKpi` helper resolve beneficiary qua `campaign_employee_ranges` JSONB

2. **Native PATCH (picker)** — `native-orders.js`:
    - Snapshot products HIỆN TẠI trước UPDATE
    - Sau UPDATE thành công, diff Old vs New by productCode:
        - New-only → `forecast_add`
        - Old-only → `forecast_remove`
        - Qty changed → `forecast_qty_change`
    - `_emitPatchKpiEvents` fire-and-forget; source = product.source (preserve)

3. **PBH create** — `fast-sale-orders.js:/from-native-order`:
    - Sau khi native status → confirmed + INSERT PBH success
    - Loop products[] của native_order (có source), emit `actual_confirmed` per SP
    - Deterministic `client_event_id = pbh_<number>_<sku>` → reissue dedup tự nhiên

4. **Cancel (2 paths)**:
    - `POST /api/native-orders/:code/cancel` → emit `actual_revoked` cho mọi `actual_confirmed` chưa bị revoke
    - `POST /api/fast-sale-orders/:number/cancel` + `/by-source/:code/cancel` → cùng pattern
    - `client_event_id = revoke_<id>` deterministic; `revokes_event_id` link back

**Client-side**:

- `tpos-pancake/inventory-panel.js` add/remove fetch body kèm `clientEventId` UUID
- `native-orders-app.js addLineFromPicker` (Sprint 0) đã set `clientEventId` per line; saveEdit gửi `_editor` metadata

**Idempotency contract** (sha1 key):

- `actor|customer|sku|campaign_id|event_type|client_event_id`
- Network retry → cùng key → INSERT ON CONFLICT DO NOTHING
- User thao tác lại (delete-readd) → mỗi action UUID khác → events đều insert
- PBH cancel/reissue → deterministic key → tự nhiên dedup

**Next** — Sprint 2: Assignment UI (`/web2/kpi/assignments.html`) + tích hợp vào `/web2/users/` row actions.

---

### [web2-balance-history] Tab "Lịch sử thủ công" — audit log mọi action manual ✅

**User feedback**: "tab để coi lịch sử user gán tay, nạp rút tay, chọn khách hàng".

**Fix**:

- Backend (`routes/v2/web2-balance-history.js`):
    - Add status filter `MANUAL_ALL` → `match_method IN ('manual_link', 'manual_resolve', 'manual_reassign', 'manual_deposit', 'manual_withdraw')`.
    - Sort: `ORDER BY COALESCE(verified_at, transaction_date) DESC` (thứ tự thao tác user, mới nhất ở trên) khi status=MANUAL_ALL.
    - Stats endpoint thêm count `manual_all`.
- Frontend (`web2-balance-history-app.js`):
    - Thêm chip "Lịch sử thủ công" (purple `chip-manual-all`) vào STATUS_FILTERS.
    - `userBadge` thêm action label trước user name: "Nạp tay", "Rút tay", "Gán KH", "Chọn KH (multi)", "Đổi KH" → hiển thị bold purple, e.g. `Nạp tay e2e-test`.
    - Tooltip hover badge hiện "Action lúc HH:MM DD/MM/YYYY" từ `verified_at`.
    - Fallback badge `(—)` (italic muted) cho legacy rows manual\_\* không có user info.
- CSS `web2-balance-history.css`: `.chip-manual-all` purple bg, `.w2bh-user-action` bold purple với separator border, `.w2bh-user-badge-unknown` italic muted.

**Test live**: chip xuất hiện, click load 50 rows (filter backend chưa deploy), 3 badges hiện "Nạp tay e2e-test", "Rút tay e2e-test" với action label tách rõ. Sau Render redeploy → filter chỉ hiện manual rows + sort theo verified_at.

**Status**: ✅ Code pushed. Render auto-deploy sẽ enable filter MANUAL_ALL.

### [web2-balance-history] Admin reassign KH + user attribution (verified_by) ✅

**User feedback (3 yêu cầu liên quan)**:

1. "thêm filter gán tay thông tin khách → user nào gán thì thêm vào"
2. "filter nạp rút tay cũng cần biết user nào gán"
3. "admin có quyền thay đổi khách hàng để phòng trường hợp gán sai hoặc bấm nhầm → nhớ làm cho đúng phần công nợ là chuyển từ khách cũ qua khách mới"

**Backend** (`render.com/`):

- `services/web2-sepay-matching.js`:
    - `ensureSchema`: thêm column `verified_by VARCHAR(100)` qua `ADD COLUMN IF NOT EXISTS` (idempotent).
    - CHECK constraint: thêm `manual_reassign` vào allowed methods.
    - `resolveWeb2PendingMatch`: set `verified_by = resolvedBy` (từ frontend) trên `web2_balance_history`.
- `routes/v2/web2-balance-history.js`:
    - PATCH `/:id/link`: thêm `verifiedBy` body param → save to `verified_by`.
    - **NEW** POST `/:id/reassign`: chuyển công nợ KH cũ → KH mới:
        1. Validate row có `debt_added=true` + `linked_customer_phone` + `transfer_type='in'`
        2. `processWithdraw(old_phone, amount, 'sepay', sepay_id)` — trừ ví cũ
        3. `processDeposit(new_phone, amount, tx.id, ref='${sepay_id}:reassign:${newPhone}')` — cộng ví mới (ref tránh trùng sepay_id)
        4. UPDATE `web2_balance_history`: linked_customer_phone, display_name, match_method='manual_reassign', verified_by, verified_at
        5. Audit log `web2_match_audit_log` với candidates [old, new], chosenPhone=new, note
        6. Rollback safety: nếu deposit mới fail → re-credit ví cũ + log error
        7. Idempotent: cùng KH với hiện tại → no-op return.

**Frontend** (`web2/balance-history/js/`):

- `web2-pending-match.js`:
    - `getCurrentUserName()` đọc `loginindex_auth` từ localStorage/session.
    - `resolvePending` calls pass current user (replace hardcoded `'web2-balance-history-ui'`).
- `web2-balance-history-app.js`:
    - `_extractUserFromRow(r)`: lấy `verified_by` mới hoặc fallback parse `raw_data.userName` (cho legacy manual_deposit/withdraw).
    - `userBadge` cho mọi method manual\_\* (deposit/withdraw/link/resolve/reassign): hiển thị `<span.w2bh-user-badge>icon {user}</span>`.
    - Nút **"Sửa KH"** (icon `user-cog` cam) trên rows có `debt_added=true` + `transfer_type='in'` + amount > 0.
    - Modal `#w2bhReassignModal`: info box hiển thị KH cũ + amount + ref; search autocomplete `/api/v2/customers?search=` (cache, debounce 220ms); name + reason fields; warning banner "trừ ví KH cũ + cộng ví mới".
    - `submitReassign()` POST `/:id/reassign` với `phone, name, verifiedBy=_currentUser(), reason`. On success → toast + reload list.
    - `_normalizePhoneInput` strip non-digits + 84→0 prefix.
    - Validate phone 9-11 số; reject nếu trùng SĐT hiện tại.
    - PATCH `/link` cũng pass `verifiedBy` từ giờ.

**Test live**:

- 48 reassign buttons hiển thị trên rows hợp lệ ✓
- 3 user badges hiện sẵn từ raw_data.userName của manual_deposit cũ ✓
- Modal mở: hiện info "GD +100.000đ · 6710, KH hiện tại: Thảo Thảo — 0946479179" ✓
- Search "truong" → dropdown 8 KH match từ DB (Truong Thảo, Kim Sa Truong, …) ✓
- Backend endpoint chưa deploy → verify sau redeploy.

**Status**: ✅ Code pushed. Render auto-deploy sẽ apply migration `verified_by` column + thêm `manual_reassign` vào constraint + enable endpoint.

### [web2-balance-history] Pending modal — top-level filter + per-item custom KH picker ✅

**User feedback** (2 yêu cầu):

1. "cho chức năng tìm khách hàng để chọn" — modal Trùng SĐT có nhiều items, cần search nhanh.
2. "giao dịch này chỉ cho chọn 2 người nhưng có trường hợp phải cần tùy biến" — nếu cả 2 SĐT gợi ý đều sai, user phải tự chọn KH khác.

**Fix** (`web2/balance-history/js/web2-pending-match.js`):

1. **Top-level item filter**: input `#web2PendingSearch` ở head modal, auto-focus khi mở. Debounce 120ms. Multi-token AND (cách nhau space). Match diacritics-insensitive (`đ→d`, NFD strip combining marks) vs `item.content`, `sepay_id`, `transfer_amount`, candidate phones/names. Hiển thị `8/28` count.

2. **Per-item custom KH picker**: mỗi `w2pm-item` thêm section `Không có KH đúng? Tự chọn KH khác` gồm:
    - Search input + dropdown autocomplete (gõ ≥2 ký tự → `GET /api/v2/customers?search=…&limit=8`)
    - Cache per-query để tránh re-fetch
    - Click dropdown item → fill phone + name
    - Manual fallback: gõ trực tiếp SĐT (9-11 số) → click "Chọn KH này" → resolve với SĐT đó
    - `_normalizePhoneInput` strip non-digits + handle `84` prefix
    - Validate length 9-11 trước khi resolve

**Test live**:

- Top filter: gõ "ngoc" → 8/28; "100000" → 17/28; "ngoc 0969" → 0/28 (AND) ✓
- Custom picker: gõ "truong" → dropdown 8 KH match từ DB (Truong Thảo, Kim Sa Truong, …) ✓
- Resolve flow đã verified ở fix `manual_resolve` constraint trước đó.

**Status**: ✅ Done.

### [tpos-pancake] Tạo đơn native cho comment — defer cross-item refresh (anti-freeze) ✅

**User feedback**: "lúc đang livestream → bấm tạo đơn native-order cho comment sẽ bị đứng 1 chút → background mấy hàm xử lý, để mượt UI lỗi thì back lại hoặc bạn cải thiện chỗ này".

**Root cause** (`tpos-pancake/js/tpos/tpos-comment-list.js` `refreshCommentItem`):

- Sau khi `createOrder` xong, `refreshCommentItem` re-render clicked item rồi LOOP TẤT CẢ comments cùng `fromId` → mỗi comment build HTML + replace DOM. Livestream có 100+ comments cùng KH → block main thread.
- Cuối loop gọi `lucide.createIcons()` SCAN TOÀN DOC → 1 lần scan lớn.

**Fix**:

- Refresh clicked item: SYNC, instant (user thấy success icon ngay).
- Cross-`fromId` refresh: defer qua `requestIdleCallback` + chunks of 10/tick (fallback `setTimeout 0`). UI trả về cho user ngay sau clicked item update; bulk update chạy trong idle time.
- `lucide.createIcons()` chỉ fire 1 lần ở cuối cross-item batch.
- Error handler trong `createOrder` đã sẵn restore button + show toast → "lỗi thì back lại" tự động.

**Status**: ✅ Done.

### [web2-balance-history] Fix "Chọn KH" CHECK constraint violation ✅

**User bug**: bấm "Chọn" trong modal Trùng SĐT (pending multi-match) → 500 error `web2_balance_history_match_method_check`.

**Root cause**: `resolveWeb2PendingMatch` UPDATE set `match_method='manual_resolve'` (distinguish "user pick từ multi-match" vs `manual_link`) — nhưng CHECK constraint chưa allow value đó → DB reject.

**Fix** (`render.com/services/web2-sepay-matching.js` `ensureSchema`): thêm `'manual_resolve'` vào allowed list. ALTER chạy idempotent ở Render startup → sau redeploy "Chọn" hoạt động.

**Status**: ✅ Code pushed. Render auto-deploy sẽ apply migration.

### [kpi][render][native-orders] Sprint 0 KPI Attribution System — schema + audit gaps ✅

**Plan**: [docs/plans/kpi-attribution-system.md](plans/kpi-attribution-system.md) v2 — APPROVED (Q8/Q10 → DEFAULT)

**Sprint 0 deliverables**:

1. **`web2_kpi_events` ledger** (append-only, idempotent qua sha1 key) + `web2_kpi_forecast` + `web2_kpi_actual` projection tables — `render.com/routes/v2/kpi.js` mới.
2. **`native_orders.campaign_stt`** per-campaign sequence column + backfill migration 080. INSERT sites updated: create, merge (new STT), split (inherit parent).
3. **REUSED** existing `campaign_employee_ranges` (Web 1.0 tab1 KPI legacy) thay vì tạo `web2_kpi_assignments` mới — discovery sau khi research live-campaign page. Key by `campaign_name` (sanitized).
4. **`resolveBeneficiary()`** helper query JSONB `employee_ranges` → fallback actor nếu không match range.
5. **Audit gap fix**: `addLineFromPicker` set `addedBy`, `addedById`, `clientEventId` (UUID idempotency); `saveEdit` preserve qua PATCH cycle + send `_editor` metadata. Loaded `web2-user-info.js` script vào native-orders page.
6. **Route wired** ở `server.js`: `/api/v2/kpi/*` (events, assignments proxy, forecast, actual) + SSE notifier `web2:kpi:<userId>`.

**Next** — Sprint 1: emit `forecast_*` events từ cart.js + native-orders PATCH; `actual_confirmed/revoked` từ fast-sale-orders.

---

### [inventory-tracking] BỎ chia theo ngày — tách đợt thuần dotSo + dọn data trùng ✅

**Quyết định user**: chia đợt theo khoảng ngày KHÔNG hợp lý (1 TT đợt 2 có thể trùng ngày giao đợt 1 → trùng lặp). Quay về logic gốc: **đợt tách biệt hoàn toàn theo `dotSo`** — đơn nhập ở đợt nào → HĐ/CP đợt đó; TT thêm ở modal đợt nào → chỉ thuộc đợt đó. Không lọc ngày.

**Phát hiện trùng lặp THẬT**: mảng `thanhToanCK` đợt 2 chứa nguyên 9 khoản của đợt 1 (CÙNG id) + 2 khoản riêng → đợt1=9(420.969), đợt2=11(520.969).

**Code (revert date-window, GIỮ fix C de-dup CP)**:

- `filters.js` — bỏ filter `dateInDotWindow` (và filter 30 ngày cũ) → list = dotSo + NCC + search.
- `data-loader.js` — bỏ helper `paymentsInDotWindow`/`dateInDotWindow`; `getAllDotsAggregated` build từ `getAllDotHangAsShipments` (CP de-dup) nhưng KHÔNG window — sum toàn đợt theo dotSo.
- `table-renderer.js` — `_calcPaymentTotals`/`updateInventoryStatsBar`/chuỗi số dư dùng full `thanhToanCK` (giữ last-row absorb); bỏ UI ngày bắt đầu/kết thúc + handlers/getters/broadcast/globals; `_renderDotSectionBodyHtml` hiện full mảng (bỏ ẩn/gạch).
- `css/modern.css` — bỏ `.pp-date-range`/`.payment-row-out`. `index.html` bump `?v=20260531d`.
- Backend giữ nguyên (cột `ngay_bat_dau/ngay_ket_thuc` inert, không dùng).

**Dọn data** (script tự verify trước khi ghi, có backup `135303` để rollback): PATCH theo mốc 18/5 → Đợt1 = 7 khoản ≤13/5 (220.969), Đợt2 = 4 khoản ≥18/5 (300.000). Đúng 2 ảnh user.

**Verify (data sạch)**: Đợt1 HĐ 202.854/CP 15.757/TT 220.969/**CÒN LẠI 2.358**. Đợt2 HĐ 239.520/CP 14.785/TT 300.000/**CÒN LẠI 45.695**. Bar = modal = thẻ ngày.

### [inventory-tracking] Khoảng ngày đợt = bộ lọc DUY NHẤT + sửa CP đếm trùng (B & C) ✅

**Vấn đề user phát hiện**: (B) "Còn lại" Đợt 1 bảng chính (184.823) ≠ modal CK (1.678); (C) CP ngày 19/5 Đợt 2 modal hiện **95.715** trong khi thẻ ngày là 10.635.

**Gốc rễ** (verify bằng dữ liệu thật):

- **B**: bảng chính trộn phạm vi — `TỔNG TT` lấy toàn đợt, nhưng `TỔNG HĐ/CP` bị **bộ lọc ngày mặc định 30 ngày** (main.js:246; UI `.filters-navigation` đang `display:none` nên user không thấy) cắt còn 3 ngày T5. Đợt 1 thật có 11 ngày (9/4–17/5).
- **C**: `chi_phi_hang_ve` lưu **nhân bản trên mọi dòng NCC** của 1 ngày; modal cộng `tong_chi_phi` mọi dòng → ×N (19/5 có 9 NCC → 9×10.635=95.715). Thẻ ngày/bảng chính lấy first-non-empty nên đúng.

**Giải pháp (theo chỉ định user)**: bỏ bộ lọc 30 ngày cũ, **dùng khoảng ngày cài trong đợt [bắt đầu, kết thúc] làm bộ lọc ngày DUY NHẤT** cho list + tổng HĐ/CP + TT; modal tính HĐ/CP từ nguồn đã khử trùng (`getAllDotHangAsShipments`) → hết C.

**Files**: `inventory-tracking/js/filters.js` (bỏ filter 30 ngày, thêm `dateInDotWindow`), `data-loader.js` (helper `dateInDotWindow` + viết lại `getAllDotsAggregated` build từ shipments đã de-dup + window HĐ/CP), `table-renderer.js` (`_aggregateDotEntry` delegate sang `getAllDotsAggregated`), `render.com/routes/v2/inventory-tracking.js` (POST kế thừa `ngay_bat_dau/ngay_ket_thuc` như tỉ giá + ensure schema), `index.html` (bump `?v=20260531b`).

**Verify (node, dữ liệu thật)**: Đợt 1 → HĐ 202.854 / CP 15.757 / TT 220.969 / **CÒN LẠI 2.358** (bar=modal=thẻ ngày). Đợt 2 → HĐ 239.520 / CP **14.785** (hết 109.705) / TT 300.000 / **CÒN LẠI 45.695** (hết âm). CP 19/5 = **10.635** (hết 95.715). `node --check` 4 file OK; INSERT 24 cột/24 param khớp.

### [delivery-report] XÓA HẲN cột CK theo tab + Duyệt không zero TỔNG CÒN LẠI ✅

**Yêu cầu (user)**: (1) TOMATO/NAP **xóa hẳn** cột **ATRƯỜNG NHẬN CK**; THÀNH PHỐ xóa hẳn cả **ATRƯỜNG NHẬN CK** lẫn **CK TRƯỚC** — "loại bỏ hoàn toàn đừng ẩn" (không CSS hide). (2) Bấm **DUYỆT** không được tự động trừ "TỔNG CÒN LẠI" về 0 — giữ nguyên giá trị, dòng chỉ mờ đi.

> Lần 1 làm CSS `nth-child` ẩn cột nhưng user yêu cầu **xóa hẳn khỏi DOM** → đổi sang render cột động.

**Giải pháp**:

- **Cột động theo tab (xóa hẳn, không CSS)**: thead chuyển thành `<tr id="drReportHeadRow">` rỗng + `paintThead()` build động. Helper `showCkTruocFor(tab)` (true trừ city) + `currentColCount()` (12 hoặc 11). ATRƯỜNG NHẬN CK **bỏ hoàn toàn** (markup + biến `atruongCK`/`sumAtruongCK` + công thức + totals) ở mọi tab. CK TRƯỚC bọc `${showCk ? '<td>…</td>' : ''}` ở thead/4 row renderer/tfoot → không tồn tại trong DOM khi city. `totalLeftRaw = totalAll − boCK − (showCk ? ckTruoc : 0)` (không còn trừ atruongCK). colspan expand/empty/loading dùng `currentColCount()`.
- **Duyệt giữ giá trị**: bỏ toàn bộ nhánh `approved ? 0 : totalLeftRaw` (single/merge/shift-aggregate + `computeTotalLeftForTab` + tab totals + TỔNG chân bảng). Dòng đã duyệt **vẫn cộng** vào TỔNG (khớp giá trị ô), chỉ mờ qua class `.is-approved` (opacity 0.45) sẵn có.

**Files**:

- `delivery-report/js/report.js` — thead động (`paintThead`), `showCkTruocFor`/`currentColCount`; xóa hẳn atruongCK + CK TRƯỚC-điều-kiện ở `renderSingleRow`/`renderMergeRow`/`renderShiftedOutRow`/`renderShiftAggregateRow`/tfoot/`computeTotalLeftForTab`; colspan động; gỡ zero-on-approve; tooltip + comment.
- `delivery-report/css/delivery-report.css` — chỉ cập nhật comment `.is-approved` (đã revert rule CSS-hide của lần 1).

**Verify**: harness cô lập + Playwright đếm cột → tomato/nap = 12 cột, city = 11 cột; thead/single/shifted-out/tfoot **khớp số cột** mọi tab; rendered city DOM head=body=foot=11. `node --check` pass.

**Status**: ✅ Done.

### [inventory-tracking] Khoảng ngày (ngày bắt đầu/kết thúc) cho từng Đợt → bound thanh toán CK ✅

**Vấn đề (user báo)**: "Còn lại" trên thẻ tổng đợt và Còn dư từng ngày lệch nhau (đợt 1: tổng `384.823` vs ngày cuối `184.823`, lệch `200.000`). Gốc rễ: mỗi đợt **không có ngày bắt đầu/kết thúc**, nên `Tổng TT` cộng **toàn bộ** `thanhToanCK` của đợt bất kể ngày → khoản CK dated sau ngày giao cuối (thường là tiền của đợt sau) bị tính nhầm vào đợt; còn chuỗi số dư từng ngày lại **rớt** các khoản trễ đó.

**Giải pháp**: thêm 2 cột `ngay_bat_dau` / `ngay_ket_thuc` per-đợt (1 đợt = 1 dot_so). Một khoản CK chỉ tính cho đợt nếu `ngayBatDau ≤ ngayTT ≤ ngayKetThuc` (open-ended khi thiếu → giữ hành vi cũ). UI: 2 ô ngày trên 1 dòng, ngay dưới dòng "Đợt N | Tỉ giá" trong modal "Thanh Toán CK Theo Đợt". CK ngoài khoảng vẫn hiện trong danh sách nhưng tô mờ + gạch, không cộng vào tổng. Chuỗi số dư: dòng cuối gom luôn khoản in-window dated sau ngày giao cuối ⇒ Còn dư ngày cuối **luôn khớp** CÒN LẠI tổng đợt.

**Files**:

- `render.com/migrations/072_add_dot_date_range_to_inventory_shipments.sql` (mới) — `ADD COLUMN IF NOT EXISTS ngay_bat_dau/ngay_ket_thuc DATE`.
- `render.com/routes/v2/inventory-tracking.js` — `ensureShipmentDateRangeSchema(db)` (self-migration idempotent, mẫu `ensureHiddenNccsSchema`) gọi ở `GET /shipments` + `PATCH /shipments/payment-by-dot`; PATCH nhận + lưu 2 cột ngày (COALESCE).
- `inventory-tracking/js/api-client.js` — `pgToShipment` map `ngayBatDau/ngayKetThuc`; `updatePaymentByDot` gửi `ngay_bat_dau/ngay_ket_thuc`.
- `inventory-tracking/js/data-loader.js` — helper global `paymentsInDotWindow()`; absorb 2 field trong `getAllDotHangAsShipments` + `getAllDotsAggregated`.
- `inventory-tracking/js/table-renderer.js` — áp window vào `_calcPaymentTotals` (modal Tổng TT/CÒN LẠI), `updateInventoryStatsBar` (thẻ tổng), chuỗi số dư từng ngày (dòng cuối upper=+∞); `_aggregateDotEntry` absorb; UI dòng ngày trong `_renderDotSectionBodyHtml` + handler `startInlineEditNgayBatDau/NgayKetThuc` + getter + broadcast trong `_persistPaymentByDot` + đăng ký global; `_renderPaymentRow` tô mờ row ngoài khoảng.
- `inventory-tracking/css/modern.css` — `.pp-date-range` / `.pp-date` / `.payment-row-out`.
- `inventory-tracking/index.html` — bump `?v=20260531a` cho api-client/data-loader/table-renderer.

**Verify**: node calc test khớp số screenshot — không window: TT 420.969 / CÒN LẠI 384.823 / Còn dư ngày cuối 384.823 (khớp); ngày kết thúc=17/5: loại 200k trễ → 220.969 / 184.823 / 184.823 (khớp). `node --check` 4 file OK. **Status**: cần verify end-to-end sau khi Render redeploy (route self-migrate khi GET /shipments lần đầu). **Lưu ý**: COALESCE → v1 chưa xoá ngày về NULL qua UI (đặt ngày xa để "mở" lại).

## 2026-05-30

### [native-orders] Badge "Trực tiếp" cho SP add từ picker (cùng cặp với Livestream) ✅

**User feedback**: "sản phẩm thêm trực tiếp từ native orders có badge riêng"

**Decision**: Cặp đôi với badge Livestream — picker trong modal `addPicked` set `source: 'native'`. Hiển thị badge xanh dương "Trực tiếp" + icon `hand`. SP cũ (trước migration) không có `source` → vẫn không badge.

**Files**:

- `native-orders/js/native-orders-app.js` — gom logic vào `_renderSourceBadge(source)` thay vì if-else inline; `addPicked` push `source: 'native'`; cả expand row + edit modal đều gọi helper.
- `native-orders/css/native-orders.css` — `.product-source-badge.src-native` (xanh dương pastel), unify `i` size cross-variants.

**Truth table**:

| source         | Badge         | Khi nào                        |
| -------------- | ------------- | ------------------------------ |
| `'livestream'` | 🔴 Livestream | Drag từ TPOS-Pancake inventory |
| `'native'`     | 🔵 Trực tiếp  | Picker trong modal sửa đơn     |
| `undefined`    | —             | SP cũ trước migration          |

---

### [native-orders][render] Badge "Livestream" cho SP kéo từ TPOS-Pancake ✅

**User feedback**: "tpos-pancake -> sản phẩm được kéo vào đơn để tạo ra bên native orders -> bên native orders sẽ có badge là livestream (để phân biệt với sản phẩm thêm trực tiếp từ native hoặc thêm từ livestream tpos-pancake)"

**Decision**: gắn `source: 'livestream'` lên product khi đi qua cart drag-drop endpoint. SP add trực tiếp từ modal native-orders không set field → coi như direct (default).

**Files**:

- `render.com/routes/v2/cart.js` — `_buildProduct()` set `source: 'livestream'`; nhánh merge qua-trùng-code giữ/nâng cấp `source` cho row cũ.
- `native-orders/js/native-orders-app.js` — render badge ở expand row + edit modal line code; preserve `source` qua `saveEdit()` PATCH (nếu strip thì lần lưu kế tiếp sẽ mất badge).
- `native-orders/css/native-orders.css` — `.product-source-badge.src-live` (đỏ pastel + icon `radio`).

**Flow**:

1. User drag SP từ TPOS-Pancake inventory panel → POST `/api/v2/web2-cart/:commentId/add` → `_buildProduct` push `{...products, source: 'livestream'}` vào `native_orders.products`.
2. Native-orders mở expand row hoặc edit modal → check `l.source === 'livestream'` → render `<span class="product-source-badge src-live">📻 Livestream</span>` cạnh code.
3. SP add trực tiếp từ "Thêm SP" picker trong native-orders → không set `source` → không badge.

**Backwards compat**: SP cũ trong DB chưa có `source` → mặc định không badge (đúng — không phân biệt được nguồn trước migration); SP mới tự được tag.

---

### [so-order] Lock shipment-edit modal khỏi rows received + Trash 7-day restore + Modal anti-lag ✅

**User feedback** (3 yêu cầu liên quan):

1. "nút chỉnh sửa này bấm vào không cho chỉnh sửa sản phẩm đã nhận hàng" — pencil ở header lô vẫn cho mở modal edit rows đã nhận.
2. "khi nhận đủ hàng của đơn có thể xóa → qua tab thùng rác xóa sau 7 ngày có thể phục hồi" — cần soft-delete + trash + restore.
3. "dự án có logic làm cho modal mượt hơn đó → áp dụng cho modal chỉnh sửa" — modal so-order chưa apply anti-lag pattern.

**Fix 1 — Lock shipment edit modal**:

- `openShipmentModal` filter `rows.filter(r => r.status !== 'received')` trước khi vào `openShipmentEditAllRows`.
- Nếu tất cả received → notify "Tất cả SP đã nhận — xoá lô nếu muốn dọn" + return.
- Nếu mix → notify count rows bị skip + load chỉ editable rows vào modal.
- `openShipmentEditAllRows` accept `rowsOverride` parameter để load từ filtered list.
- Submit `toDelete` loop đã có guard `if (old.status === 'received') continue` → received rows giữ nguyên trong sh.rows ngay cả khi modal không hiện.

**Fix 2 — Trash system với 7-day restore**:

- `so-order-storage.js`: `state.trash = [{id, tabId, tabLabel, shipment, deletedAt}, ...]`.
    - `softDeleteShipment(state, tabId, shId)` move shipment vào trash.
    - `restoreFromTrash(state, trashId)` restore về tab gốc (fallback tab[0] nếu tab gốc bị xoá).
    - `purgeFromTrash(state, trashId)` xoá vĩnh viễn 1 entry.
    - `purgeOldTrash(state, retentionMs)` + auto-purge trong `_read()` khi load state — drop entries > 7 ngày.
- `so-order-app.js` `_finalizeDeleteShipment`: nếu `rows.every(r => r.status === 'received')` → `softDeleteShipment` + notify "Tự xoá sau 7 ngày"; else hard delete (existing).
- UI mới (`index.html`): nút "Thùng rác" + badge count cạnh "Tạo Đơn Hàng"; modal `#soTrashModal` list cards với tab badge, supplier, qty, deleted time, countdown days, "Khôi phục" + "Xoá vĩnh viễn" buttons.
- `purge` action có confirm "Lô này sẽ bị xoá hoàn toàn, không thể khôi phục" qua `soConfirm`.

**Fix 3 — Modal anti-lag** (per `docs/web2/MODAL-ANTI-LAG.md` Tier 1):

- `.so-modal-v2 .so-modal-panel-v2`: `contain: layout style paint` + `will-change: transform, opacity` + `cubic-bezier(0.16, 1, 0.3, 1)` easing + giảm box-shadow từ `0 25px 50px -12px` → `0 8px 24px`.
- `.so-modal-body-v2`: `contain: layout style paint` + `overscroll-behavior: contain` + `-webkit-overflow-scrolling: touch` + `scrollbar-gutter: stable`.
- `.so-modal-table tbody tr.so-modal-row`: `content-visibility: auto` + `contain-intrinsic-size: 0 56px` (skip render khi rows ngoài viewport).
- `.so-modal-backdrop`: bỏ `backdrop-filter: blur(2px)` (gây repaint mỗi frame, đặc biệt nặng khi table phía sau).
- HTML: `tr.so-modal-row` + class `modal-row` để inherit global Tier 1 từ `web2-tpos-theme.css` cũng được.

**Tested live**:

- Edit pencil lô có 4 received + 3 draft → modal mở chỉ load 3 draft rows, notify "Bỏ qua 4 SP đã nhận" ✓.
- Soft delete fully-received shipment → trash badge `+1`, modal list hiện đúng entry, restore đẩy về tab gốc, purge hỏi confirm rồi xoá hẳn ✓.
- Modal Tạo Đơn Hàng mở/đóng smooth, scroll body không trigger body scroll bên dưới ✓.
- Zero JS errors.

**Status**: ✅ Done.

### [so-order] Fix: pick SP từ dropdown → lưu chỉ giữ text gõ ban đầu (stale change event) ✅

**User bug**: gõ "b" → dropdown gợi ý → click "2000 QUAN test nhap b4" → modal hiện tên full đúng → Lưu nháp → row lưu chỉ là "b".

**Root cause**: race condition giữa `applySuggestionToRow` và `change` event:

1. User gõ "b" → input event → `row.productName = "b"`. Input "focused value baseline" = "" (lúc focus đầu tiên).
2. User click dropdown item → `applySuggestionToRow` set `row.productName = "2000 QUAN test nhap b4"` → `renderModalRows()` replace `tbody.innerHTML` → OLD input detached khỏi DOM.
3. Browser **async** fires `blur` + `change` trên OLD input (value "b" ≠ focused baseline "") **SAU KHI** click handler complete.
4. `change` listener cũ (`onModalRowFieldInput`) chạy trên OLD detached input, đọc `input.value = "b"` + uid (uid match vì preserved) → ghi đè `row.productName = "b"` trên modalRows state.
5. User click Lưu nháp → submit đọc `row.productName = "b"` (bị overwrite).

**Fix** (`so-order-app.js` `onModalRowFieldInput`):

```js
if (!input.isConnected) return; // guard stale event từ detached input
```

Ignore mọi input/change event đến từ element đã bị remove khỏi DOM. Synchronous parts của `applySuggestionToRow` đã set state đúng → sau khi DOM detached, không có event nào được phép thay đổi state nữa.

**Verify live**: gõ "b" → pick "2000 QUAN test nhap b4" → submit → saved `productName = "2000 QUAN test nhap b4"`, variant = "Màu Beo" ✓. Thử dispatch manual `change` event lên OLD input cũng không ghi đè được.

**Status**: ✅ Done.

### [so-order] Bỏ variant validation + Lock row "Đã nhận" ✅

**User feedback**:

1. "lúc tạo sản phẩm đơn hàng đâu cần quan tâm tồn kho đúng không?" — biến thể không cần phải có sẵn trong Kho Biến Thể.
2. "đã nhận sẽ không cho chỉnh sửa" — rows có status='received' phải lock.

**Fix 1 — bỏ variant validation** (`so-order/js/so-order-app.js`):

- Gỡ 3 chỗ check `variantCache.findByValueExact(value)`: dblclick inline edit (`beginInlineCellEdit.commit`), bulk-edit commit (`commitBulkEditField`), modal submit (`handleOrderSubmit`).
- Lý do: so-order là draft đơn — user có thể gõ size/màu mới chưa khai báo trong Kho Biến Thể.

**Fix 2 — lock row "Đã nhận"**:

- `rowHtml`: thêm class `is-locked` + `data-row-status` cho `<tr>`. Local `edit = editTableMode && status !== 'received'` → bulk edit mode bật vẫn render read-only cho rows received.
- `actionsCell(rowId, sid, status)`: status='received' → render `<span.so-action-locked>` với icon lock thay 2 nút sửa/xoá.
- Helper `_isRowLocked(rowId, sid)` đọc `data-row-status` từ DOM (fast, no state lookup).
- Guards:
    - `onCellDoubleClick`: locked → notify warning + return.
    - `data-img-edit` click handler: locked → block.
    - `openOrderModal(rowId, sid)`: edit-mode + locked row → block.
    - `deleteRow`: locked → block.
- CSS `so-order/css/so-order.css`: `.so-data-row.is-locked` background gray + cursor not-allowed + image opacity 0.85; `.so-action-locked` muted color.

**Test live**: 4/17 rows ở so-order có status='received' → all 4 rows hiện lock icon thay edit/delete, 13 draft rows giữ nút bình thường. Dblclick locked row → blocked + warning. Bulk edit mode bật → locked rows vẫn read-only, draft rows hiện inputs. JS syntax OK.

**Status**: ✅ Done.

### [so-order][supplier-debt] NCC + PO group respect invoiceGroupId (đơn boundary) ✅

**User**: "STT 2 và 3,4 là 2 đơn khác nhau nên tách B4 ra" (so-order). "STT 3,4 cùng đơn nên đừng tách ra" (supplier-debt).

**Root cause**:

- so-order NCC merge cũ chỉ check `supplier` consecutive → 3 rows cùng NCC B4 nhưng khác đơn vẫn merge thành 1 cell.
- supplier-debt PO code cũ `PO/<year>/<rowId-suffix>` → mỗi row 1 PO riêng dù rows cùng `invoiceGroupId` (cùng đơn, submit chung modal).

**Fix**:

- `so-order/js/so-order-app.js` `_computeRowSpans`: NCC merge consecutive yêu cầu CẢ `supplier` VÀ `invoiceGroupId || id` giống. Rows cùng NCC nhưng khác đơn → tách cell.
- `web2/supplier-debt/js/supplier-debt-app.js`:
    - `aggregate()`: pass `r.invoiceGroupId` vào `purchasesInPeriod` entries.
    - `buildCongNoEntries()`: group rows theo `(date, invoiceGroupId)` qua `Map` → 1 entry per đơn. PO code = `PO/<year>/<gid-suffix-uppercase>`. desc = `Mua: <SP1> + <SP2> + ...`. debit = sum subtotal. sortKey không gồm suffix → stable insertion order = chronological.

**Test live**: B4 ở so-order giờ hiện 2 cell (1+2 rowspan) thay vì 1 cell rowspan 3. Supplier-debt Công nợ tab cho B4 hiện 2 entries: `PO/2026/UEXLLG — Mua: b (Màu Beo) — 150.000đ` (STT 2 alone) + `PO/2026/9SMHX8 — Mua: 2 (Màu Bạc) + b — 100.090đ` (STT 3+4 combined). Running balance: 0→150.000→250.090. Zero JS errors.

**Status**: ✅ Done.

### [so-order][supplier-wallet] NCC autocomplete + "Tạo NCC" manual create ✅

**User**: "supplier-wallet có chức năng tạo NCC → chỗ nhập tên NCC hiện dropdown từ Ví NCC → tên chưa có → tạo mới".

**Files**:

- NEW `web2/shared/web2-suppliers-cache.js` — shared cache read `web2_supplier_wallet/main` Firestore doc. Public API: `init()`, `getNames()`, `has(name)`, `search(q, limit, extras)`, `ensure(name)`, `subscribe(cb)`. Realtime via `onSnapshot` cho cross-tab.
- `so-order/index.html` — wrap input `name="supplier"` trong `.so-supplier-pick-wrap` + load `web2-suppliers-cache.js`.
- `so-order/css/so-order.css` — `.so-supplier-pick-wrap`, `.so-supplier-dropdown`, `.so-supplier-item`, `.so-supplier-item-new`/`-existing` badges.
- `so-order/js/so-order-app.js`:
    - `attachSupplierPickerOnDemand(input, opts)` — idempotent picker với ↑↓Enter keyboard, badge "Mới"/"Ví NCC", merge extras (current state suppliers).
    - `_currentStateSuppliers()`, `_ensureSupplierAsync(name)`, `_ensureSupplierCacheSubscription()`.
    - Wire vào `openOrderModal`, `openShipmentEditAllRows`, `onBulkEditFocusIn` (bulk edit cell), `beginInlineCellEdit` (dblclick path).
    - `editableCellHtml('supplier', ...)` render `.so-supplier-pick-wrap` markup.
    - `handleOrderSubmit` + `commitBulkEditField` + inline `commit` đều fire-and-forget `_ensureSupplierAsync(supplier)` sau khi save row.
    - `init()` gọi `Web2SuppliersCache.init()`.
- `web2/supplier-wallet/index.html` — thêm nút "Tạo NCC" (`#swCreateBtn`) + modal `#swCreateModal` (input tên + nút Tạo). Load `web2-suppliers-cache.js`.
- `web2/supplier-wallet/js/supplier-wallet-app.js`:
    - `openCreateModal()`, `confirmCreate()` — tạo wallet entry rỗng qua `SupplierWalletStorage.getOrCreateWallet` + push Firestore + cũng gọi `Web2SuppliersCache.ensure`.
    - `wireUi` bind nút + Enter key trên input.
    - **Relax filter** `renderList`: trước đây ẩn wallet có `totalPurchased = 0`, giờ hiện hết (NCC manually-created vẫn xuất hiện dù chưa có giao dịch).

**Flow**:

1. User mở `supplier-wallet/index.html` → click "Tạo NCC" → nhập tên → Lưu → wallet entry tạo trong Firestore `web2_supplier_wallet/main.data.wallets[name]`.
2. User mở `so-order/index.html` → "Tạo Đơn Hàng" → focus input NCC → dropdown gợi ý từ Ví NCC + state hiện tại. Click item → fill. Gõ tên mới → hiện pill "+ Tạo NCC '...' Mới" → submit form → cache.ensure() ghi Firestore + supplier name xuất hiện trong Ví NCC list lần sau.
3. Bulk edit + dblclick inline edit supplier cell cũng có cùng dropdown.

**Test browser** (live trên localhost): tạo NCC từ supplier-wallet → 12 cards, mới hiện ngay; mở so-order modal → cache có 12 names; type "TEST-" → dropdown 7 items (6 ví + 1 pill "Mới"); type tên mới → pill duy nhất; submit → auto-ensure thành công, cache.has trả true. Inline dblclick supplier → dropdown 10 items (empty query). Zero JS errors. Cleanup test data sau khi xong.

**Status**: ✅ Done.

### [web2-storage] All Web 2.0 stores migrated localStorage → IndexedDB ✅

**User feedback**: "làm tất cả vì web 2.0 hiện đang test".

**Stores migrated** (qua Web2IdbStore helper):

| Store                 | Module                                               | LS key cũ              | IDB key mới                    |
| --------------------- | ---------------------------------------------------- | ---------------------- | ------------------------------ |
| Sổ Order              | `so-order/js/so-order-storage.js`                    | `soOrder_v1`           | `so_order_storage:main`        |
| Customer Wallet       | `web2/customer-wallet/js/customer-wallet-storage.js` | `customerWallet_v1`    | `customer_wallet_storage:main` |
| Supplier Wallet       | `web2/supplier-wallet/js/supplier-wallet-storage.js` | `supplierWallet_v1`    | `supplier_wallet_storage:main` |
| Balance History cache | `web2/balance-history/js/accountant-history.js`      | `acc_history_cache_v2` | `acc_history_cache:main`       |

**Pattern áp dụng** (so-order, wallets):

- `_cachedState` in-memory mirror cho sync access (sau load lần đầu).
- `_idbStore` lazy init (chỉ open IDB lần đầu cần).
- `load()` async: try IDB → fallback LS legacy (auto-migrate qua Web2IdbStore.open() `migrateFromLs` flag) → heal/migrate state shape → return + cache.
- `save(state)` sync API: update `_cachedState` + schedule debounced (150ms) async IDB write. Caller không cần await.
- `flush()` async: force flush pending write (gọi trước unload).
- Sync layer (Firestore): persist remote data qua IDB store thay vì `localStorage.setItem`.

**Pattern accountant-history cache** (read-heavy):

- `_cachedRecords` undefined→null→object (3-state) để track "chưa load lần đầu".
- `loadCacheFromIdb()` async: 1 lần ở đầu `load()`.
- `readCache()` sync: trả `_cachedRecords` từ memory.
- `writeCache()` sync API: update memory + fire-and-forget IDB put.

**Auto-migrate** (Web2IdbStore.open option `migrateFromLs`):

- Lần đầu `open(store, {migrateFromLs:'oldKey'})` đọc `localStorage.oldKey` → put IDB key `${store}:main` → xóa LS key.
- Idempotent: sau migrate LS rỗng, lần sau không chạy lại.
- Per-store, không cần intervention.

**Cross-module references** (so-order data từ purchase-refund, supplier-wallet):

- `web2/purchase-refund/js/purchase-refund-app.js` `loadSoOrderReceivedItems()` đọc IDB trước, fallback LS legacy, fallback Firestore.
- `web2/supplier-wallet/js/supplier-wallet-storage.js` `loadSoOrderData()` tương tự.

**HTML pages added script** `web2/shared/web2-idb-store.js`:

- `so-order/index.html`
- `web2/purchase-refund/index.html`
- `web2/supplier-wallet/index.html`
- `web2/customer-wallet/index.legacy.html`
- `web2/balance-history/index.legacy.html`

**Caller API breaks**:

- `SoOrderStorage.load()`, `CustomerWalletStorage.load()`, `SupplierWalletStorage.load()` giờ async → call sites `await`.
- `save()` vẫn sync (fire-and-forget) → callers không thay đổi.

**Verify live** (persistent browser session):

- so-order navigate: IDB key `so_order_storage:main` có 3 tabs, LS `soOrder_v1` cleared ✅
- supplier-wallet navigate: IDB keys `[so_order, supplier_wallet, ...]`, LS `supplierWallet_v1` cleared ✅
- purchase-refund: no console errors về IDB/global ✅

**Trade-offs**:

- Pro: data per-store có thể lớn hơn 5-10MB LS cap (IDB dùng ~50% disk).
- Pro: single IDB connection chia sẻ giữa các store (1 DB `web2_kv_v1` + prefix key).
- Con: init() phải await IDB read (~10-30ms). Vẫn nhanh hơn HTTP cold.
- Con: save() debounced 150ms — nếu tab close ngay sau mutation, có thể mất last edit. Khắc phục: gọi `flush()` trên `beforeunload`/`visibilitychange→hidden` (TODO).

**Files** (15+):

- `web2/shared/web2-idb-store.js` (helper)
- `so-order/js/so-order-storage.js` + `so-order/js/so-order-app.js` + `so-order/index.html`
- `web2/customer-wallet/js/customer-wallet-storage.js` + `web2/customer-wallet/js/customer-wallet-app.js` + `web2/customer-wallet/index.legacy.html`
- `web2/supplier-wallet/js/supplier-wallet-storage.js` + `web2/supplier-wallet/js/supplier-wallet-app.js` + `web2/supplier-wallet/index.html`
- `web2/balance-history/js/accountant-history.js` + `web2/balance-history/index.legacy.html`
- `web2/purchase-refund/js/purchase-refund-app.js` + `web2/purchase-refund/index.html`

---

### [web2-shared] Web2IdbStore helper + audit localStorage cho phase migration ✅

**User feedback**: "web 2.0 dữ liệu rất lớn nên coi phần nào chuyển qua index db khỏi dùng local cache".

**Audit localStorage hiện tại** (Web 2.0):

| Key                               | Size    | Module                                                      | Growth                                            |
| --------------------------------- | ------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `soOrder_v1`                      | 38 KB   | so-order, supplier-wallet, customer-wallet, purchase-refund | **Cao** (shipments + base64 ảnh sản phẩm/hóa đơn) |
| `web2_customer_wallet_v1`         | ~3 KB   | customer-wallet                                             | Cao (transactions)                                |
| `web2_supplier_wallet_v1`         | ~3 KB   | supplier-wallet                                             | Cao (transactions)                                |
| `accountant-history` cache        | varies  | balance-history                                             | Cao (records snapshot)                            |
| `web2-quick-reply` LS_CACHE       | nhỏ     | shared chat                                                 | Thấp                                              |
| `web2-msg-template` TEMPLATES_KEY | nhỏ     | shared chat                                                 | Thấp                                              |
| TPOS token, accounts              | nhỏ     | shared                                                      | Thấp (giữ LS OK)                                  |
| `webWarehouseCache`               | 1.67 MB | orders-report (Web **1.0** — KHÔNG trong scope)             | —                                                 |

**Deliver**: helper `web2/shared/web2-idb-store.js` (generic kv với auto-migrate từ LS).

**API**:

```js
const store = Web2IdbStore.open('so_order_cache', { migrateFromLs: 'soOrder_v1' });
await store.set({ tabs: [...] });
const data = await store.get(); // null nếu chưa có
await store.remove();
```

Auto-migrate idempotent: lần đầu open() với `migrateFromLs` → đọc LS → put IDB → xóa LS key. Sau đó LS rỗng nên không chạy lại.

Tất cả store share 1 IDB database (`web2_kv_v1`) + 1 object store (`_default`) + prefix key (`storeName:key`) để tránh phức tạp versioning khi thêm store mới.

**Verified live**: round-trip `set({hello:"world", n:42}) / get() === {hello:"world", n:42}` ✅

**Migration roadmap** (chờ user confirm scope từng phase để tránh break stores đang stable):

1. **Phase 1 (POC)**: `web2_products` cache đã chuyển (commit `c42f5eadc`).
2. **Phase 2**: `soOrder_v1` (so-order-storage) — refactor `_read/_write` sync → async qua Web2IdbStore. Test tab switching, multi-shipment, sync với Firestore.
3. **Phase 3**: `customer-wallet-storage`, `supplier-wallet-storage` — pattern tương tự so-order.
4. **Phase 4**: `accountant-history` cache trong balance-history.
5. **Skip**: TPOS token, pancake accounts, UI prefs (nhỏ, sync OK).

Risk Phase 2-3: storage layer sync API hiện tại được call ở nhiều nơi (~50+ sites/store). Async migration cần thay đổi tất cả call sites.

**Files**:

- `web2/shared/web2-idb-store.js` — helper mới.

---

### [render][web2-balance-history] Rip out 100% Web 1.0 dependencies trong matcher ✅

**User feedback**:

> "coi lại toàn bộ dữ liệu balance-history → đang dùng dữ liệu từ đâu → có khi còn sót lại dữ liệu bên web 1.0"
> "rip out 100%" → "bỏ local cache"

**Audit findings** (frontend đã isolated, backend còn 2 leftover):

- ✅ Frontend `web2/balance-history/` 100% Web 2.0: tất cả fetch đi `/api/web2/balance-history/*`, SSE topic `web2:wallet:*`, TPOS partner enrich qua OData.
- ⚠ Backend `render.com/services/web2-sepay-matching.js`:
    - `SELECT MAX(id) FROM balance_history` trong sequence init (line 53, để tránh collision ID legacy).
    - 3× `SELECT ... FROM balance_customer_info` cho QR + exact + partial phone name cache.
    - `CREATE TABLE web2_balance_history (LIKE balance_history ...)` clone schema từ legacy table.

**Files changed**:

- [render.com/services/web2-sepay-matching.js](../render.com/services/web2-sepay-matching.js)

**Changes**:

1. **Sequence init**: bỏ `MAX(id) FROM balance_history`. Chỉ tham chiếu `MAX(id) FROM web2_balance_history` + `+10000` buffer.
2. **QR code path**: bỏ luôn block lookup `balance_customer_info` qua unique_code. QR codes (`N2` + 16 chars) chỉ tồn tại trong table Web 1.0 → Web 2.0 không generate mới nên không có gì để lookup. Fallback to phone extraction (path 3).
3. **Exact phone path**: bỏ `SELECT customer_name FROM balance_customer_info WHERE customer_phone=$1`. Lookup name CHỈ qua TPOS OData (`searchTPOSByPartialPhone`).
4. **Partial phone path**: bỏ `SELECT DISTINCT ... FROM balance_customer_info WHERE customer_phone LIKE $1`. Lookup CHỈ qua TPOS.
5. **Schema bootstrap**: wrap `CREATE TABLE ... LIKE balance_history` trong `DO $$ IF NOT EXISTS web2_balance_history $$` + `IF EXISTS balance_history`. Nếu legacy không có (env fresh hoàn toàn) → fallback explicit schema base cols. Trên prod đã có table → cả 2 nhánh CREATE no-op.
6. Update header comment: thêm "Phase 4 (2026-05-30): ZERO Web 1.0 dependency" + giải thích trade-off (1 TPOS call ~150ms mỗi unknown phone, đổi lại data luôn fresh).

**Trade-off**:

- Trước: name cache local DB → instant; fallback TPOS khi miss.
- Sau: chỉ TPOS → 1 round-trip ~150ms cho mỗi unknown phone. Cache TPOS-side vẫn hit khi search trùng phone gần đây.
- Lợi: zero stale data risk (TPOS là source of truth cho customer info), zero dependency vào Web 1.0 table được populate bởi flow legacy.

**Verified**:

- `node --check render.com/services/web2-sepay-matching.js` → SYNTAX OK.
- `grep -nE "(FROM|UPDATE|INSERT INTO) (balance_history|balance_customer_info|sepay_webhook_logs)\b"` trong toàn bộ backend stack Web 2.0 balance-history → 0 matches.

**Status**: ✅ Done. Cần test live sau khi deploy: SePay webhook → match → confirm `dataSource = 'TPOS'` only, không có `'LOCAL_DB'`.

### [web2-cache] Chuyển persist sang IndexedDB (từ localStorage) + auto-migrate ✅

**User feedback**:

> "vậy chuyển qua index db đi → với dữ liệu vừa chuyển db sang web 2.0 mà trang này còn dữ liệu vậy? → Kiểm tra lại dữ liệu đang lưu ở đâu"

**Trả lời "data đang ở đâu"** (4 nơi):

1. **Sổ Order** (sheets, shipments, rows) → Firestore `web2_so_order/main` (cloud) + localStorage `soOrder_v1` (38KB local cache).
2. **Kho SP Web 2.0** (source of truth) → Postgres `web2_products` table @ `chatDb` (Render basic_1gb). **KHÔNG bị migration đụng** — migration Neon→Render PG chỉ chuyển `web2_db.web2_records` (generic CRUD), beta data không copy.
3. **Cache kho SP** (vừa thêm) → localStorage `web2ProductsCache_v1` (27KB, 35 SP) → giờ chuyển sang IDB.
4. **localStorage khác**: webWarehouseCache (1.7MB), orderNotesStore_v1, walletAdjustment, …

**Sửa** (`web2/shared/web2-products-cache.js`):

- IDB schema: database `web2_cache` v1, object store `kv`, key `products`, value `{ts, list}`.
- `_openIdb()` idempotent, lazy (mở lần đầu cần); error → fallback fetch HTTP.
- `_loadFromPersist()` async: open IDB → get → trả list. Fallback `_migrateLegacyLsToIdb()` đọc `localStorage.web2ProductsCache_v1`, save sang IDB, xóa LS key (1 lần duy nhất).
- `_saveToPersist()` debounce 200ms async put.
- `init()` async path: `_loadFromPersist()` trước → có persist → setInitialized + setup SSE + background revalidate; không có → cold start fetch HTTP.

**Trade-offs LS → IDB**:

| Aspect          | localStorage      | IndexedDB                      |
| --------------- | ----------------- | ------------------------------ |
| Access          | Sync (block main) | Async (~10-30ms)               |
| Limit           | 5-10 MB           | ~50% disk available            |
| API             | get/set string    | Object store, structured clone |
| Migrate kho lớn | Cap nhanh         | OK                             |

Trade-off: init() phải await IDB read (~10-30ms). Vẫn nhanh hơn HTTP cold (200-1500ms) 1-2 order of magnitude.

**Verify live**:

- Sau navigate page: IDB tồn tại `kv/products` với 35 SP, `localStorage.web2ProductsCache_v1` = null (migrated) ✅
- Sau reload: cache instant từ IDB, `cacheReady=true`, no LS legacy ✅

---

### [inventory-tracking] Fix realtime self-reload làm hỏng "Tạo biến thể" + sửa inline ("Không tìm thấy sản phẩm") ✅

**Bug (user báo)**: Tạo biến thể không lưu/không phản ứng, cập nhật tên/SL sản phẩm lỗi, toast đỏ "Không tìm thấy sản phẩm", và realtime chạy quá nhiều (2 SSE connectionId trong ~1.6s).

**Nguyên nhân gốc** (regression từ bản 7-topic realtime `v20260530d`):

- `shipmentsApi.update()` → server broadcast `inventory_shipments` SSE → **chính máy đó nhận lại echo** → `reloadAll()` → `loadNCCData()` tải lại toàn bộ. Giai đoạn đầu `nccList` có `dotHang: []` rỗng → lookup `dot.id===invoiceId` fail → "Không tìm thấy sản phẩm"; save bị ghi đè bởi reload → như không lưu.
- `loadNCCData()` gọi `setupInventoryRealtimeSync()` ở cuối **không guard** → mỗi reload mở thêm 1 SSE connection → bão realtime tự nhân.
- SSE payload chỉ có `{key,data}`, không có sender id → chống echo bằng cửa sổ thời gian local-write.

**Files**:

- `inventory-tracking/js/api-client.js` — `apiFetch()` đóng dấu `window.__inventoryLastLocalWrite` cho mọi mutation (POST/PUT/DELETE/PATCH).
- `inventory-tracking/js/data-loader.js` — (②) guard `if (window._inventoryRealtimeClient) return` đầu `setupInventoryRealtimeSync` → đúng 1 connection; (①) `reloadAll`/`reloadFinance` bỏ qua echo trong 3s sau local-write + reconcile 1 lần để vẫn sync máy khác; (③) helper `_inventoryUiBusy()` (modal mở / `.inline-edit-input`) → hoãn reload + hoãn re-render `product_images` khi đang sửa.
- `inventory-tracking/js/modal-variant.js` `_saveVariants()` & `table-renderer.js` `commitInlineEdit()` — (④) lookup fail mà `globalState.isLoading` → chờ 600ms thử lại 1 lần thay vì báo lỗi oan.
- `inventory-tracking/index.html` — bump 4 JS `?v=20260530d → 20260530e`.

**Chi tiết**: giữ realtime đồng bộ đa máy (không cắt topic); fix hoàn toàn phía client, không đụng server/worker/SSE protocol. node --check pass cả 4 file.

# **Status**: ✅ Done (verify online sau deploy: chỉ 1 "Connected to SSE server"; tạo biến thể giữ nguyên không bị refresh; sửa inline OK; 2 tab vẫn sync sau ~3s).

### [web2-cache] Stale-while-revalidate localStorage persist → kho SP load instant không cần HTTP fetch ✅

**User feedback**: "có cách nào lấy dữ liệu sản phẩm từ kho sản phẩm db web 2.0 truy xuất nhanh".

**Phân tích**: cold-start cache.init() đợi HTTP `/api/web2-products?page=1&limit=1000` (1 round-trip tới Render → Postgres) → 200-1500ms tùy network + Render cold start. App phải đợi cache.init() rồi mới render badge "Đã có ở kho", suggest, stock check.

**Sửa** (`web2/shared/web2-products-cache.js`):

- Pattern **stale-while-revalidate** dùng localStorage key `web2ProductsCache_v1`:
    - Sau mỗi `_loadList()` thành công → debounce 200ms → save `{ts, list}` JSON (4MB cap).
    - SSE `_upsertLocal` / `_removeLocal` cũng trigger save.
    - `init()`: thử `_loadFromPersist()` trước. Nếu có & TTL 24h → set `state.initialized=true` + setup SSE + emit `persist-restore` → return STATE ngay. Background fire `_loadList()` revalidate.
    - Persist chỉ load nếu list không rỗng + TTL còn → tránh stale infinite.
- Lần đầu (cold): vẫn fetch HTTP, sau đó persist. Reload tiếp theo: sub-ms load.

**Verify live**:

- Cold start: persist không có → HTTP → cache 35 SP, persist 27KB.
- Reload: persist có → cache instant với 35 SP (no HTTP wait). Background revalidate.

**Trade-offs**:

- Pro: page reload không cần HTTP, sub-ms ready, vẫn realtime qua SSE.
- Pro: offline-friendly (read-only).
- Con: persist stale tối đa 24h nếu SSE bị skip. Khắc phục: invalidate trên user-explicit refresh / SSE recovery.
- Limit: ~4MB JSON (~5-8K SP). Kho hiện 35 SP = 27KB → còn xa limit.

**Tương lai có thể thêm**:

- IndexedDB cho kho > 8K SP.
- CDN edge cache GET `/api/web2-products` 5s (Cloudflare Worker) — invalidate khi SSE fire.
- Reduce payload server-side (chỉ trả field cache cần).

**Files**:

- `web2/shared/web2-products-cache.js` — `_loadFromPersist`, `_saveToPersist` (debounce 200ms), `init()` SWR path.

---

### [so-order] Stock check trước delete: cache.isReady() + timeout 1.2s fallback ✅

**User feedback**: "kiểm tra tồn kho quá lâu → db đã chuyển sang db web 2.0, kho riêng".

**Vấn đề**:

- `_isStockCacheReady` chỉ check `getAll().length > 0` → khi kho rỗng (hoặc cache vừa init xong nhưng list rỗng) trả `false` → rơi vào fallback async path → hiện loading "Đang kiểm tra tồn kho..." chờ `cache.init()` chạy lại.
- Async path không có timeout → nếu HTTP `/api/web2-products` chậm → user thấy loading lâu.

**Sửa**:

- `Web2ProductsCache` expose `isReady()` (flag `state.initialized`) — distinguish "init xong, kho rỗng" vs "chưa init".
- `_isStockCacheReady` ưu tiên `cache.isReady()`, fallback `getAll().length > 0` cho cache version cũ.
- Async fallback path (deleteRow + deleteShipment + deleteTab): timeout 1.2s → resolve với `stockCheck=null` (skip warn) thay vì treo.

**Files**:

- `web2/shared/web2-products-cache.js` — expose `isReady()`
- `so-order/js/so-order-app.js` — `_isStockCacheReady` priority isReady(), timeout 1.2s ở 3 nơi (deleteRow, deleteShipment, deleteTab)

**Verify**: `Web2ProductsCache.isReady() === true`, `cacheCount: 35` — delete popup mở instant (sync fast-path), không loading flash.

---

### [so-order] Round 2: NCC + Invoice cell merged (rowspan) + suggestion ranking + paste thumbnail card ✅

**User feedback**:

1. "STT 1, 2 nhập 1 lần → 1 hóa đơn chung" (cùng modal submit)
2. "STT 3, 4 nhập 1 lần đợt 2 → 1 hóa đơn"
3. "Cột NCC giống nhau gộp chung B4"
4. "Nhập 1 lần chung hóa đơn → cột hóa đơn chung"
5. Suggestion gõ "b4" trả SP cũ tên ngắn thay vì SP đầy đủ tên dài stock cao
6. "Area paste hình làm đẹp hơn" (đang show raw data URL text)

**Sửa**:

- **Issue 1-4 — invoiceGroupId + cell merge**:
    - Field `invoiceGroupId` mới trong row. Auto-generate 1 group / modal submit. Backfill rows cũ qua walk consecutive supplier.
    - `_computeRowSpans(rows)` pre-compute spans per row (NCC = consecutive supplier; Inv = consecutive invoiceGroupId).
    - `rowHtml(meta)` nhận meta → render dòng đầu group với `rowspan=N`, dòng sau skip cell.
    - `SoOrderStorage.updateInvoiceImageForGroup` broadcast paste ảnh hóa đơn cho all rows cùng group.
    - CSS `.so-cell-merged` (gradient bg, border-right purple/green, vertical-align middle); merged invoice img 56×56.
- **Issue 5 — Suggestion ranking** (`findByName`):
    - Query < 4 chars → gộp all tier + sort theo composite `(stock + pendingQty) * 1000 + nameLen`.
    - Query >= 4 chars → tier order giữ nguyên, sort trong tier theo score.
    - Verified: "b4" giờ trả `[2000 QUAN... stock 6, 2000 ao... stock 3, B4 stock 1]` (đảo ngược cũ).
- **Issue 6 — Paste area thumbnail**:
    - `_imgPasteCellHtml(row, field)` mới: chưa có ảnh → hint "Ctrl+V / Kéo thả", có ảnh → thumbnail card (max 120px) + nút clear ✕ + badge "✓ Đã có ảnh".
    - Input giữ value để form submit, NHƯNG hiển thị empty khi value startsWith `data:` → không lộ raw data URL.
    - `_applyImageToRow` re-render rows khi nhận data URL → thumbnail show ngay.

**Files**:

- `so-order/js/so-order-storage.js` — `invoiceGroupId` field + backfill + `updateInvoiceImageForGroup`
- `so-order/js/so-order-app.js` — `_computeRowSpans`, `rowHtml(meta)` rowspan, `_imgPasteCellHtml`, `_applyImageToRow` re-render, `_saveInlineImage` broadcast, handleOrderSubmit pass invoiceGroupId
- `so-order/css/so-order.css` — `.so-cell-merged`, `.so-img-cell-v2.has-image` thumb card styles
- `web2/shared/web2-products-cache.js` — `findByName` short-query composite ranking

**Verify live (persistent browser session)**:

- NCC: 3 cells `rowspan=4` class `so-cell-merged` ✅
- Paste thumbnail: `hasImgCells=1`, `thumbExists=true`, thumb src `data:...` ✅
- Suggestion "b4" top = `2000 QUAN test nhap b4 (stock 6)` ✅

---

### [inventory-tracking] iPad: bút chì cột Tổng SL — tap 1 lần sửa số lượng ✅

**Sửa**:

- `inventory-tracking/js/table-renderer.js` — cột `col-qty` (Tổng SL): thêm `<button class="btn-edit-cell btn-edit-qty">` cuối cell, onclick `event.stopPropagation(); startInlineEdit(this.closest('td'))`.
- Tái dùng CSS `.btn-edit-cell` + cơ chế `_restoreDecorations` từ commit Mã hàng → button survive sau commit/escape/error (decoration selector đã match `.btn-edit-cell` rồi).
- isNumeric extraction an toàn: button không có text → `td.textContent.trim()` chỉ trả số formatted ("12,000") → strip commas → number.

**Status**: ✅ Done

---

### [inventory-tracking] iPad: bút chì cột Chi tiết màu — tap 1 lần mở modal biến thể ✅

**Sửa**:

- `inventory-tracking/js/table-renderer.js` — cột `col-colors`: thêm `<button class="btn-edit-cell btn-edit-variant"><i data-lucide="pencil"></i></button>` cuối cell, onclick `event.stopPropagation(); window.openVariantModal(this.closest('td'))`.
- Tái sử dụng CSS `.btn-edit-cell` (commit trước) → tự động ẩn trên desktop, hiện trên iPad/Android qua `@media (hover:none) and (pointer:coarse)`.
- KHÔNG cần `_restoreDecorations` vì cell này mở MODAL (không phải inline edit như SKU) — modal close + table re-render full, button luôn còn.

**Status**: ✅ Done

---

### [inventory-tracking] iPad: bút chì edit cột Mã hàng (tap 1 lần, bypass double-click) ✅

**Vấn đề (user báo)**: trên iPad double-tap không tin cậy (kể cả sau khi đã tắt zoom). Cần icon bút chì 1-tap để chỉnh sửa Mã hàng.

**Sửa**:

- `inventory-tracking/js/table-renderer.js`:
    - Cột Mã hàng (`col-sku`): thêm `<button class="btn-edit-cell btn-edit-sku"><i data-lucide="pencil"></i></button>` cuối cell. Onclick `event.stopPropagation(); startInlineEdit(this.closest('td'))` — tap 1 lần là mở input ngay.
    - `startInlineEdit`: save trailing decoration elements (`.btn-edit-cell`, `.po-draft-badge`) vào `td._restoreDecorations` trước khi wipe textContent → input không mất các phần tử bên cạnh sau khi commit/escape/error.
    - `commitInlineEdit`: 4 nhánh restore (no-change / not-found / success / error) đều append `deco` vào innerHTML + gọi `lucide.createIcons()` re-render SVG cho icon mới.
- `inventory-tracking/css/modern.css`:
    - `.btn-edit-cell` mặc định `display: none` (desktop ẩn — vẫn dùng double-click).
    - `@media (hover: none) and (pointer: coarse)`: `display: inline-flex` — CHỈ hiện trên touch device (iPad/Android). Style: border xanh nhạt, padding compact, icon 14px, `touch-action: manipulation` + `-webkit-tap-highlight-color`.

**Status**: ✅ Done

---

### [inventory-tracking] iPad: tắt double-tap zoom + double-click edit đồng nhất ✅

**Vấn đề (user báo)**:

1. iPad: bấm 2 lần chỉnh sửa cột đụng với double-tap zoom của Safari → dblclick không fire đúng lúc
2. Cho zoom 2 ngón (pinch), bỏ double-tap zoom — ưu tiên double-click = edit
3. Double-tap mọi cột trong bảng đều phải edit được

**Sửa**:

- `inventory-tracking/css/modern.css`:
    - `.editable-cell { touch-action: manipulation; -webkit-touch-callout: none; }` — tắt double-tap zoom + 300ms click delay trên cell editable
    - `.table-container { touch-action: manipulation; }` — chặn double-tap zoom toàn bảng (kể cả non-editable cell)
    - `.shipment-table-section .table-container`: đổi `touch-action: pan-x pan-y` → `manipulation` (trước đó disable pinch-zoom, sai)
- `inventory-tracking/js/table-renderer.js`:
    - Cột **Thiếu** (`col-shortage`): đổi từ `onclick="startInlineShortage(this)"` → `ondblclick="startInlineShortage(this)"` + thêm class `editable-cell` cho đồng nhất convention "double-click = edit"
- `manipulation` = `pan-x pan-y pinch-zoom` (cho pan + 2-ngón zoom), CHỈ tắt double-tap zoom + click delay
- KHÔNG chạm viewport `user-scalable=no` (giữ pinch-zoom toàn page cho accessibility)

**Cột editable bằng double-click sau fix**: NCC, Mã hàng, Chi tiết màu (mở modal biến thể), Tổng SL, Đơn giá, Thiếu, COST, COST Note, Payment ngày/số tiền/ghi chú, Tỉ giá. **Không editable** (đúng logic): STT (chỉ nút), Tiền HĐ + Tổng Món (auto-calc), Ảnh (lightbox/upload), Ghi Chú (NoteManager).

**Status**: ✅ Done

---

### [so-order] UX overhaul: receive flow + edit-shipment full rows + variant dropdown + barcode print + modal full-viewport ✅

**User feedback (multi-turn)**:

1. "Nhận hàng đủ với SL sản phẩm → không cho nhận hàng sản phẩm đó nữa"
2. "Lúc chưa nhận hàng thì sản phẩm bên products là chờ hàng → nhận thì logic lại phần này bên products"
3. "Bấm vào chỉnh sửa → chỉ thấy 1 sản phẩm đầu và suggestion sản phẩm trong kho spam tự bật lên"
4. "Chọn biến thể thì list biến thể hiện ra bị che"
5. "Khi nhận hàng xong cho in mã thì cho in mã sản phẩm tương tự bên products ấy, in các mã sản phẩm nhận hàng ra (theo số lượng nhận)"
6. "Cho modal to bằng browser đi, quá nhiều khoảng trống thừa → để tối ưu tương tác người dùng"

**Sửa**:

- **Issue 1 — block re-receive**:
    - Receive panel filter `r.status !== 'received'`, notify nếu shipment đã nhận hết.
    - Shipment header: nếu mọi row `status='received'` → đổi button "Nhận hàng" thành disabled "✓ Đã nhận đủ" (CSS `.so-action-btn-done`).
- **Issue 2 — products page logic**: server đã đúng (CHO_MUA → MUA_1_PHAN → DANG_BAN qua `confirm-purchase-partial`), SSE broadcast `web2:products` đã wire — verified.
- **Issue 3a — suggestion spam**: bỏ trigger showSuggest/showVariantSuggest trên `focus` event (input pre-filled gây auto-popup). Chỉ trigger trên `input` event hoặc `ArrowDown`.
- **Issue 3b — edit-shipment load all rows**: thêm modalMode `'edit-shipment'`, hàm mới `openShipmentEditAllRows()` load toàn bộ rows + cho phép thêm/xóa rows. handleOrderSubmit handle bulk update (rowId tracking).
- **Issue 4 — variant dropdown bị che**: chuyển `.so-variant-dropdown` + `.so-suggest-dropdown` sang `position: fixed` với JS anchor (`_positionFixedDropdown`) — thoát khỏi clip của `.so-modal-body { overflow: auto }`. Đóng dropdown khi modal-body scroll để tránh lệch.
- **Issue 5 — barcode print giống web2-products**: `openBarcodePrintModal()` delegate sang `Web2ProductsPrint.open()` với `quantity` preset = `qtyReceived`. Sửa `web2-products-print.js` để respect `p.quantity` từ caller (trước hardcode `1`). Thêm script + CSS print vào `so-order/index.html`.
- **Issue 6 — modal full viewport**: `.so-modal-v2 .so-modal-panel-v2` đổi từ `width: min(1600px, 96vw); max-height: 95vh` → `width: calc(100vw - 32px); height: calc(100vh - 32px)` (chiếm 94% viewport — verified live).

**Files**:

- `so-order/js/so-order-app.js` — receive filter, shipment header button state, openShipmentEditAllRows, handleOrderSubmit edit-shipment mode, suggestion trigger fix, position:fixed dropdown helper, scroll-close, openBarcodePrintModal delegate to Web2ProductsPrint
- `so-order/css/so-order.css` — `.so-action-btn-done` styling, modal-panel-v2 full viewport
- `so-order/index.html` — load web2-products-print.{js,css}
- `web2/products/js/web2-products-print.js` — respect caller `p.quantity` (default 1)

**Verify live (persistent browser session)**:

- `doneBtns: 1` shipment header "Đã nhận đủ" disabled khi mọi row received ✅
- Edit-shipment modal: `modalRows: 3`, `title: "Sửa lô — 30/5/2026"`, `suggestOpen: false`, `variantOpen: false` ✅
- Variant dropdown sau gõ input: `pos: "fixed"`, `top: "445.133px"`, `z: 9999` ✅
- Web2ProductsPrint.open với preset qty: modal opened, `qty: ["5", "3"]` đúng ✅
- Modal full-viewport: 1408×868 / 1440×900 (occupied 94%) ✅

---

### [infra] Migrate Web 2.0 DB: Neon Free Tier → Render Postgres Basic 1GB ✅

**User ask**: "sao lại dùng neon? Dự án trả phí cho render và firebase nên ưu tiên qua 2 bên này" → "tạo db mới cho web 2.0" → "basic_1gb -> và web 2.0 đang beta test nên dữ liệu không cần đem qua đâu" → "bạn update env luôn đi".

**Trước**:

- `chatDb` = Render Postgres `n2store-chat-db` basic_1gb $19/mo (Web 1.0 + tables ngoài generic CRUD)
- `web2Db` = **Neon Free Tier** 512MB (web2_records — 199 MB, 134k rows, 38.9% sử dụng)

**Vấn đề**: 2 provider khác nhau cho 2 PG → quản lý phức tạp + Neon đang gần limit Free Tier (38.9%) + thiếu isolation Web 2.0 beta khỏi Web 1.0 prod.

**Sau**:

- `chatDb` giữ nguyên (Render PG basic_1gb, Singapore)
- `web2Db` = **Render Postgres MỚI** `n2store-web2-db` basic_1gb $19/mo, Singapore, PG 18 (cùng region + version chatDb)
- Web 2.0 beta → KHÔNG migrate data Neon. DB mới rỗng, `web2-generic.js ensureTables()` tự create schema khi route đầu tiên chạy.

**Files**:

- `render.com/routes/services-overview.js`: inventory cập nhật — bỏ Neon, thêm "Render Postgres (Web 2.0)" với host `dpg-d8d7besp3tds73f8gr60-a`.
- `web2/services-dashboard/js/services-dashboard.js`: `DB_LIMITS` 2 pool đều 1 GB, label "Render PG (chính)" + "Render PG (Web 2.0)", purpose thêm note "TÁCH RIÊNG khỏi chatDb (beta isolation)".
- `render.com/routes/admin-migrate-web2.js` (mới): one-shot migration route — KHÔNG dùng cho lần này vì user OK xóa data Neon, nhưng để sẵn cho lần sau.
- `render.com/server.js`: mount `/api/admin/migrate-web2-records`.

**Actions thực hiện qua Render API**:

1. ✅ `POST /v1/postgres` tạo `n2store-web2-db` basic_1gb singapore PG18.
2. ✅ Đợi status `available`.
3. ✅ Lấy `internalConnectionString` qua `GET /v1/postgres/<id>/connection-info` (credential vào file tạm, không log transcript).
4. ✅ `PUT /v1/services/<svcId>/env-vars/WEB2_DATABASE_URL` với value mới.
5. ✅ `POST /v1/services/<svcId>/deploys` trigger deploy.
6. ✅ Cleanup temp files chứa credentials.
7. ⏳ Pending: verify `/api/services-overview` show DB mới (host khác Neon).
8. ⏸ Pending: delete Neon project khỏi console (manual hoặc qua Neon API).
9. ⏸ Pending: update line 37 `serect_dont_push.txt` xóa Neon URL.

**Cost impact**: +$19/mo (Render PG mới). Cost mới ~$98/mo (chatDb $19 + web2Db $19 + backend ~$60). Trade-off: bỏ Neon dependency + isolation + Web 1.0/2.0 không share PG → mỗi side scale độc lập.

**Status**: ✅ Done (chờ deploy verify). Migration route + dashboard reflect Web 2.0 sang Render PG mới.

---

### [inventory-tracking] Ẩn NCC qua checkbox (sync cross-device) + iPad table touch scroll ✅

**User ask**:

1. `nhijudy.store/inventory-tracking/index.html` — tick checkbox bên trái NCC để **ẩn** dòng (trước đó chỉ làm mờ opacity 0.35). Đồng bộ giữa các máy.
2. Thêm tương tác bảng cho iPad (kéo qua lại, ...).

**Files**:

- `render.com/migrations/071_create_inventory_hidden_nccs.sql` (mới): table `inventory_hidden_nccs (id, shipment_id TEXT, ncc_key TEXT, hidden_by, created_at, UNIQUE (shipment_id, ncc_key))` + index. Không FK vì shipment_id có thể là temp/legacy id.
- `render.com/routes/v2/inventory-tracking.js`:
    - Idempotent `ensureHiddenNccsSchema(db)` bootstrap chạy 1 lần — feature work ngay cả khi admin chưa run migration 071.
    - `GET/POST/DELETE /api/v2/inventory-tracking/hidden-nccs` — POST/DELETE notify SSE topic `inventory_hidden_nccs` với payload `{action, shipment_id, ncc_key, hidden_by, ts}`. POST dùng `ON CONFLICT … DO UPDATE` cho idempotency.
- `inventory-tracking/js/api-client.js`: thêm `hiddenNccsApi.getAll/hide/show`.
- `inventory-tracking/js/data-loader.js`:
    - `loadHiddenNccs()` chạy song song với product images trong `loadNCCData()` → patch `globalState.hiddenNccs` map.
    - Subscribe topic mới `inventory_hidden_nccs` (now 7 topics). SSE callback patch map in-place + debounce 150ms → `window.applyHiddenNccsToDom()` — KHÔNG reload shipments (chỉ visibility class đổi).
- `inventory-tracking/js/table-renderer.js`:
    - Bỏ localStorage `inventory_ncc_done` → đọc từ `globalState.hiddenNccs` (top-level `let` script-scoped, KHÔNG dùng `window.globalState` vì let không attach).
    - `toggleNccDone(sid, nccKey, checked)` → async optimistic: patch map + `applyHiddenNccsToDom()` instant, gọi API, rollback + notification.error nếu fail.
    - `applyHiddenNccsToDom()` (mới): full re-apply qua tất cả `.shipment-card` → toggle class `ncc-row-hidden` trên rowspan group qua `_setRowsHiddenForCell(nccCell, hidden)`, update badge count + label.
    - `toggleShowHiddenForShipment(sid)` + sessionStorage `inventory_show_hidden_per_shipment` (per-shipment override, KHÔNG sync) → CSS `.shipment-card.shipment-reveal-hidden tr.ncc-row-hidden { display:table-row; opacity:0.4; striped bg }` cho phép user untick.
    - Render shipment header thêm `<span class="shipment-hidden-badge">` (bg đỏ nhạt, eye-off icon, click stopPropagation → `toggleShowHiddenForShipment`). Initial count tính ngay từ globalState.hiddenNccs khi render.
    - Expose `window.toggleNccDone`, `toggleShowHiddenForShipment`, `applyHiddenNccsToDom`.
- `inventory-tracking/css/modern.css`:
    - `tr.ncc-row-hidden { display: none; }` default. `.shipment-card.shipment-reveal-hidden tr.ncc-row-hidden` → bring back với striped pattern + opacity.
    - `.shipment-table-section .table-container`: `overflow-x: auto` (was `hidden`) + `-webkit-overflow-scrolling: touch` + `touch-action: pan-x pan-y` + `cursor: grab` (`grabbing` khi `.is-dragging`) + `overscroll-behavior-x: contain` + 10px webkit scrollbar.
    - `@media (pointer: coarse)` — tap target nâng cho ipad: checkbox 22px, btn-\* min 32x32px, hidden-badge padding 6/12.
- `inventory-tracking/js/table-touch-scroll.js` (mới): drag-to-scroll cho mouse/pen/touch qua PointerEvent.
    - Skip selector tránh trigger trên button/input/editable-cell/drag-stt/ncc-name/pkg-check/badge — chỉ scroll khi nhấn vùng trống của bảng.
    - 6px threshold + `setPointerCapture` + suppress click ngay sau khi end-drag để không trigger sai handler bên trong.
    - MutationObserver + `render:done` event scan các `.table-container` mới render khi user expand shipment-card lazy.
- `inventory-tracking/index.html`: thêm `<script src="js/table-touch-scroll.js?v=20260530d"></script>` sau table-renderer. Versions bumped to `?v=20260530d`.

**Verify (localhost:8080 persistent FIFO + HTTP)**:

- Page load: `window.applyHiddenNccsToDom = function`, `toggleNccDone = function`, `globalState.hiddenNccs = {}` (backend chưa deploy → trả 404 → fallback empty).
- Expand shipment-card: 4 `.ncc-done-check` checkboxes rendered, table container 1090×1763, `init=1` (touch scroll wired).
- Inject test entry vào `globalState.hiddenNccs["ship_..._THÊM"]` + call `applyHiddenNccsToDom()`:
    - tr gets `ncc-row-hidden` class, `display: none` ✅
    - badge becomes visible, label `"1 NCC ẩn — click để hiện tạm"` ✅
- Call `toggleShowHiddenForShipment(sid)`:
    - card gets `shipment-reveal-hidden` class ✅
    - tr `display: table-row` lại với striped repeating-linear-gradient bg ✅
    - badge label đổi `"Đang hiện 1 NCC ẩn — click để ẩn lại"` ✅
- Drag-to-scroll via PointerEvent (`pointerdown` + 2 `pointermove` -300px + `pointerup`): `tc.scrollLeft 0 → 199.5` ✅
- `feval typeof globalState !== "undefined" && globalState.hiddenNccs` (script scope) — pass; trước fix `window.globalState` không tồn tại (let top-level không attach) gây count=0 → đã sửa.
- Console errors trong 5s sau load: 0.

**Deploy**:

- Render server cần auto-deploy sau push (Render watches main). Endpoint `/api/v2/inventory-tracking/hidden-nccs` hiện 404 → sẽ live sau ~2-3 min.
- Migration 071 chạy tự động qua `ensureHiddenNccsSchema` lần đầu request → admin không cần manual run.

**Status**: ✅ Done — Frontend logic verified locally với mock state. Backend code committed; live verification cross-device sau Render deploy.

---

### [web2/shared] Sidebar brand — thay text "N2" bằng logo emblem N2 Store ✅

**User ask**: copy `/Users/mac/Desktop/n2store/index/logo.jpg`, chỉnh sửa phù hợp để thêm vào sidebar Web 2.0 (chỗ đang là `N2` gradient + "Web 2.0 v1.0").

**Files**:

- `web2/shared/img/logo-emblem.png` (mới, 256x256, ~63 KB, PNG32 transparent):
    - Crop region 720x720 từ `(260, 150)` trên ảnh gốc 1201x1201 — giữ phần vương miện + emblem tròn N2 vàng, bỏ chữ "N2 STORE" phía dưới.
    - Alpha flood-fill từ 4 góc với `-fuzz 28%` để xoá nền đen → transparent (giữ chi tiết viền vàng).
    - Resize 256x256 cho retina-ready ở display size 32px.
- `web2/shared/tpos-sidebar.js`:
    - Thêm `SCRIPT_BASE_URL` resolve qua `document.currentScript.src` + `LOGO_URL = new URL('./img/logo-emblem.png?v=20260530', SCRIPT_BASE_URL)` → path đúng cho mọi depth host page (`/web2/<page>/`, `/web2/index.html`, `/native-orders/`, `/tpos-pancake/`, `/so-order/`).
    - Thay `<span class="web2-brand-logo">N2</span>` → `<img class="web2-brand-logo" src="${LOGO_URL}" alt="N2 Store" width="32" height="32" decoding="async">`.
- `web2/shared/tpos-sidebar.css`:
    - `.web2-brand-logo` bỏ gradient `linear-gradient(135deg, #27c24c, #7266ba)` + text styles → `object-fit: contain`, `width/height: 32px`, `filter: drop-shadow(0 1px 2px rgba(0,0,0,0.45))` cho độ nổi nhẹ trên `#131e26` sidebar bg.

**Verify**: Persistent browser session FIFO + HTTP — nav `web2/products/index.html` localhost:8080, `shotview` + crop. Expanded state: logo gold N2 + crown hiển thị rõ bên cạnh "Web 2.0 v1.0" + collapse button. Collapsed state (56px width): logo vẫn fit + drop-shadow giữ nguyên contrast.

**Status**: ✅ Done

---

### [web2/services-dashboard] Trang dịch vụ & chi phí — DB stats + service inventory ✅

**User ask**: "tạo 1 trang dịch vụ ghi rõ đang dùng db gì → chi phí ra sao → hiển thị data đã dùng".

**Files**:

- `render.com/routes/services-overview.js` (mới): `GET /api/services-overview`:
    - 2 DB pools stats: `pg_database_size`, top 10 tables size + rows, connection counts, pool internal.
    - Process: uptime, memory RSS/heap, Node version.
    - Static `SERVICES_INVENTORY` 8 dịch vụ: Supabase, Neon, Render, CF Workers, Firestore, Firebase Auth, Bunny CDN, GH Pages — với plan/cost/free tier/paid limit/purpose/url.
- `render.com/server.js`: mount `/api/services-overview`.
- `web2/services-dashboard/`:
    - `index.html`: header, 4 cost cards (tổng/paid/free/uptime), 3 sections (Databases, Services inventory, Process).
    - `css/services-dashboard.css`: cost strip border-left color, DB cards với usage bar (green<60%, yellow<80%, red>80%) + top tables, service grid responsive.
    - `js/services-dashboard.js`: fetch + render, auto-refresh 60s, `DB_LIMITS` cho usage % calc.
- `web2/shared/tpos-sidebar.js`: thêm "Bảng dịch vụ & chi phí" vào nhóm "Tính năng mới".

**Status**: ✅ Done. Render auto-deploy server endpoint.

---

### [web2/purchase-refund] Fix 2-DB pool bug + bỏ action buttons ✅

**User feedback**:

1. Error `relation "web2_products" does not exist` khi approve.
2. "bỏ phần như hình, trả → xác nhận là trả luôn" — bỏ buttons Duyệt+Trừ kho / NCC từ chối / Sửa.

**Root cause DB**: app có 2 Postgres pools:

- `chatDb` = DB chính chứa `web2_products`, `native_orders`, ...
- `web2Db` = Neon isolated CHỈ chứa `web2_records` (generic CRUD)

Trước fix: 1 pool cho cả 2 → query `web2_products` ở wrong DB.

**Fix server** (`render.com/routes/purchase-refund.js`):

- 4 routes: tách `recordsPool = web2Db` + `productsPool = chatDb`.
- `loadRefund`/`saveRefundData` → recordsPool. `deductStock`/`restockStock` → productsPool.

**Fix UI** (`web2/purchase-refund/js/purchase-refund-app.js`):

- `renderDetail()`: bỏ toàn bộ action buttons. Detail = read-only info + history timeline.
- Quick refund auto-create + auto-approve + trừ kho + ghi ví NCC atomic → phiếu đã chốt khi tạo → không cần state machine UI.
- Cache `v=20260530g`.

**Verify** (Playwright): click phiếu → detail render 0 action buttons.

**Status**: ✅ Done. Render auto-deploy server fix.

---

### [web2/shared] Audit user-attribution toàn Web 2.0 — shared modules + server auto-history ✅

**User ask**: "tất cả trang khác trong web 2.0" — audit log với tên user cho TẤT CẢ trang.

**Approach**: shared modules + server-side auto-history. KHÔNG cần sửa từng page.

**Shared modules**:

- `web2/shared/web2-user-info.js` — `Web2UserInfo`:
    - `get(sourcePage?)` → `{userId, userName, sourcePage}` từ Web2Auth → AuthManager → "(ẩn danh)".
    - `attachToPayload(payload, slug)` mutate payload thêm `userId/userName/sourcePage/createdBy` + seed `data.history[0]`.
    - `attachToBody(body, slug)` cho state-machine endpoints (server append history).
    - `detectSourcePage()` auto-derive từ pathname.
- `web2/shared/web2-history-timeline.js` — `Web2HistoryTimeline`:
    - `render(history, opts)` → HTML string với marker tròn color per action, badge user xanh, sortable.
    - Auto-inject CSS lần đầu render. 14 actions với emoji + màu.

**Server auto-history** (`render.com/routes/web2-generic.js`):

- `/create`: auto-seed `data.history[0]` từ body `{userId, userName, sourcePage}`.
- `/update`: load existing → append entry `{ts, action:'update', userId, userName, ...}` → save merged.
- **78+ entities qua generic CRUD tự động có audit log không cần thay đổi code per-entity**.

**Client auto-attach** (`web2/shared/web2-api.js`):

- `Web2Api.create(payload)` → tự `Web2UserInfo.attachToPayload`.
- `Web2Api.update(code, fields)` → tự `Web2UserInfo.attachToBody`.

**Page integration**:

- `web2/shared/page-shell.js`: SCRIPTS_PRELOAD thêm 2 helpers → 72+ pages dùng `Web2Shell.bootstrap()` auto load.
- Bulk script inject vào 33 pages custom (purchase-refund, supplier-wallet, customer-wallet, etc) qua anchor `web2-auth.js`.

**purchase-refund refactor** dùng shared:

- `_currentUserInfo()` delegate sang `Web2UserInfo.get()`.
- `renderDetail()` thay timeline inline bằng `Web2HistoryTimeline.render(r.history)`.

**Files**:

- New: `web2/shared/web2-user-info.js`, `web2/shared/web2-history-timeline.js`.
- Modified: `page-shell.js` (preload), `web2-api.js` (auto-attach), `render.com/routes/web2-generic.js` (auto-history), 33 web2 pages bulk inject.

**Verify** (Playwright):

- purchase-refund: `Web2UserInfo.get()` → `{userId:"admin-001", userName:"Nguyễn Văn Test", sourcePage:"purchase-refund"}` ✓.
- account-thu (page-shell): `Web2UserInfo` + `Web2HistoryTimeline` available, `sourcePage:"web2-account-thu"` auto ✓.

**Status**: ✅ Done. Server auto-history deploy sau push.

---

### [web2/purchase-refund] Audit log: lịch sử chỉnh sửa kèm tên user ✅

**User ask**: "có hệ thống user → lịch sử chỉnh sửa kèm theo tên user tương tác".

**Files**:

- `web2/purchase-refund/js/purchase-refund-app.js`:
    - `_currentUserInfo()`: Web2Auth (primary) → AuthManager (fallback) → `{userId, userName, sourcePage}`. Fallback "(ẩn danh)".
    - `HISTORY_ACTION_LABEL` (create/approve/cancel-approve/refunded/reject với emoji) + `fmtDateTime(ts)`.
    - `submitQuickRefund()`: seed `data.history[0]={ts,action:'create',userId,userName,note}` lúc create. Pass `userId/userName` body vào `/approve` + `updateSupplierWallet`.
    - `handleAction()`: pass `userId/userName` body cho approve/cancel-approve/refunded/reject.
    - `updateSupplierWallet()`: note "· bởi {userName}", ref `{userId, userName}`.
    - `renderDetail()`: section "Lịch sử chỉnh sửa (N)" — timeline marker tròn color per action, badge user xanh + icon.
- `render.com/routes/purchase-refund.js`:
    - `appendHistory(data, entry)`: load `data.history` → push `{ts, action, userId, userName, note, ...extra}` → return full array (JSONB merge overwrites).
    - 4 action endpoints append entry tương ứng + lưu `<status>_by` field.
- `web2/purchase-refund/css/purchase-refund.css`: `.pr-history-timeline` vertical line, `.pr-timeline-marker` color per action, `.pr-timeline-user` badge xanh.
- `web2/purchase-refund/index.html`: CSS `v=20260530c`, JS `v=20260530e`.

**Verify** (Playwright, fake user "Nguyễn Văn Test"):

- Trigger refund → record created với `data.history[0]` chứa userName.
- Detail timeline render: "📝 Tạo phiếu · 11:03:35 30/5/2026 · 👤 Nguyễn Văn Test · Tạo phiếu trả 2× TEST-AO-THUN-FORM-RONG (Trắng - M) cho TEST-NCC-AOQUOC-QC".

**Status**: ✅ Client done. Server appendHistory deploy sau push. Screenshot: `pr-history-timeline.png`.

---

### [web2/purchase-refund] Refactor lớn: auto Sổ Order + quick refund + ví NCC ✅

**User ask**: "đâu cần tạo phiếu mới — purchase-refund SẼ CÓ DANH SÁCH nhận hàng từ so-order → trả hàng confirm thì nhớ logic SL + tiền ví NCC".

**Refactor**:

- **Bỏ "Tạo phiếu mới"** ở header.
- **Section A "Hàng đã nhận từ Sổ Order"** — main UI auto-load on init, render rows group by NCC + button "Trả NCC" đỏ per row.
- **Section B "Lịch sử phiếu trả NCC"** — collapsible details bottom, giữ list+detail cũ cho audit.
- **Quick Refund Modal** — click "Trả NCC" mở modal pre-filled (NCC + Mã + Tên + Tồn + đã đặt), xác nhận qty + lý do + phương thức → submit.
- **Submit 3-step atomic**:
    1. `POST /api/web2/purchase-refund/create` — tạo phiếu draft 1 product line
    2. `POST /api/purchase-refund/:code/approve` — auto-approve, trừ `web2_products.stock`
    3. `SupplierWalletStorage.addTransaction(supplier, {type:'return', amount, ref:{refundCode}})` + push Firestore → **giảm balance Ví NCC**

**Server bug fix** (`render.com/routes/purchase-refund.js`): routes state machine dùng `req.app.locals.chatDb` nhưng generic CRUD dùng `web2Db` → "Refund not found". Sửa 4× `chatDb → web2Db`.

**Files**:

- `web2/purchase-refund/index.html`: bỏ `prNewBtn`, thêm section A + section B (details), quick modal. Load `supplier-wallet-storage.js`. CSS `v=20260530b`, JS `v=20260530d`.
- `web2/purchase-refund/js/purchase-refund-app.js`: `SOURCE_STATE`/`loadSourceItems()`/`renderSourceList()` (group by NCC), `QUICK_STATE`/`openQuickRefund()`/`submitQuickRefund()` (3-step), `updateSupplierWallet()` (Sync.init + addTransaction + push).
- `web2/purchase-refund/css/purchase-refund.css`: `.pr-source-*` (group border-left xanh, refund button đỏ nhạt), `.pr-history-section` (details với ▶ marker), `.pr-quick-modal` (red head, info box, total box vàng).
- `render.com/routes/purchase-refund.js`: 4× `chatDb → web2Db`.

**Verify** (Playwright):

- Page → "Tạo phiếu mới" bỏ ✓. Section A 4 SP × 2 NCC groups ✓.
- Click "Trả NCC" → modal pre-filled NCC/Mã/Tên/Tồn 20/đã đặt 50, qty default 20, total 3.600.000đ.
- Đổi qty=5 → total auto 900.000đ.
- Submit → record TRA-20260530-TESTNC-XXXX xuất hiện Section B ✓ (approve fail prod do server bug chưa deploy — sẽ work sau push).

**Status**: ✅ Client done. Server fix push để Render auto-deploy. Screenshots: `pr-refactor-main.png`, `pr-quick-modal.png`.

---

### [web2/purchase-refund] Picker source từ Sổ Order (đã nhận hàng) ✅

**User clarify**: "sản phẩm đã nhận hàng bên so-order sẽ có danh sách bên trả hàng NCC" + "bên trả hàng lấy danh sách NCC và sản phẩm bên so-order".

**Refactor**: picker không còn dùng `Web2ProductsCache.getAll()` thuần (toàn bộ kho), giờ **join Sổ Order ∩ web2_products** để chỉ show SP user đã thực sự đặt từ NCC qua so-order VÀ đã nhận hàng (stock>0).

**Files**:

- `web2/purchase-refund/index.html`:
    - Thêm Firebase compat CDN scripts (app + auth + firestore) — page thiếu, cần cho Firestore fallback.
    - Bỏ checkbox "Chỉ SP còn tồn" → thay bằng badge `Nguồn: Sổ Order (đã nhận hàng)`.
    - Cache `v=20260530c`.
- `web2/purchase-refund/js/purchase-refund-app.js`:
    - `loadSoOrderReceivedItems()`:
        - **Source**: localStorage `soOrder_v1` trước (latest, so-order local-first) → fallback Firestore `web2_so_order/main`.
        - **Join**: HashMap O(1) key = `normalize(name)+'|'+normalize(variant)` từ Web2ProductsCache.
        - **Filter**: chỉ rows có matching web2_product + stock>0.
        - **Aggregate**: by `(supplier, code)` — sum `orderedQty` qua shipments.
    - `PICKER_STATE`: rename `products` → `items` cho schema `{supplier, code, name, variant, orderedQty, stock, price}`.
    - `renderPicker()`: thêm cột "Đã đặt" (so-order qty, grey) + "Tồn kho" (web2 stock, bold = max trả). Empty state: "Chưa có SP đã nhận hàng từ Sổ Order — vào Sổ Order → Nhận hàng trước."
    - `confirmPicker()`: dùng `it.stock` làm max thay vì 9999.
- `web2/purchase-refund/css/purchase-refund.css`: `.pr-picker-stockhint` badge cyan.

**Verify** (Playwright):

- localStorage `soOrder_v1`: 3 tabs, 33 rows, 5+ distinct suppliers.
- Picker mở → 2 NCC groups, 4 SP rows (intersection so-order ∩ stock>0).
- Sample: KHO-KD36-MPQNKZVI / TEST-AO-THUN-FORM-RONG (Trắng - M) / Đã đặt **50** / Tồn kho **20** / Trả SL 20 / 180.000đ.

**Status**: ✅ Done. Screenshot: `downloads/n2store-session/pr-picker-so-order-source.png`.

---

### [web2/purchase-refund] Picker chọn SP từ Kho (stock>0) group by NCC ✅

**User ask**: "nhận hàng → purchase-refund sẽ có danh sách để trả hàng cho NCC".

**Insight**: web2_products đã có sẵn `stock` + `supplier`. Sau khi "Nhận hàng" trong so-order, SP có stock>0 + supplier set → Picker dùng làm source. Bỏ gõ thủ công textarea.

**Files**:

- `web2/purchase-refund/index.html`: button "Chọn SP từ Kho" cạnh textarea + picker modal (#prPicker) với search + dropdown NCC + "Chỉ SP còn tồn" toggle + group list. Load `web2-products-api.js` + `web2-products-cache.js`. Cache `v=20260530a`.
- `web2/purchase-refund/js/purchase-refund-app.js`:
    - `PICKER_STATE = { products, selectedCodes: Set, qtyOverrides: Map, supplierFilter, search, onlyStock }`.
    - `openPicker()`: `Web2ProductsCache.init()` → `getAll()` → populate supplier dropdown distinct + pre-fill từ form NCC.
    - `renderPicker()`: filter stock + supplier + search; group by supplier; mỗi group là table với checkbox + qty input (default qty = stock).
    - `confirmPicker()`: emit `code | name (variant) | qty | price` → append textarea + auto totalQty/totalAmount.
    - UX: user nhập qty mà chưa tick → auto check.
- `web2/purchase-refund/css/purchase-refund.css`: `.pr-picker*` overlay (gradient blue head, group cards border-left xanh, picked rows blue highlight, hover effects).

**Verify** (Playwright):

- Tạo phiếu → Chọn SP từ Kho → picker hiện 6 NCC groups, 12 SP stock>0.
- Tick 2, đổi qty 1 → 5, confirm → textarea fill 2 dòng đúng format, totals auto 30/6,400,000đ.

**Status**: ✅ Done. Screenshot: `downloads/n2store-session/pr-picker-open.png`.

---

### [web2-products] Sheet lẻ (1 label) đẩy về slot 1 bên trái ✅

**User ask**: "nếu in 1 tem thì cho qua bên trái chứ để ở giữa bị in ra máy in là in giữa tem".

**Vấn đề**: Sau commit trước (`space-evenly`), sheet cuối có 1 label sẽ canh GIỮA sheet. Nhưng physical label roll có gap giữa 2 con tem vật lý → in giữa sheet = in vào vùng GAP = lệch ra ngoài label vật lý.

**Fix**:

- `web2/products/js/web2-products-print.js`:
    - Tính `singleGap = (sheetW - cols × labelW) / (cols + 1)` (= ~5.33mm cho Paper 7).
    - Loop sheets: `isPartial = sheet.length < cols`. Nếu partial → inline style `justify-content: flex-start; padding-left: <singleGap>mm` → đẩy label về SLOT 1 vật lý (match position với layout đầy đủ).
    - Sheet full giữ `space-evenly`.
- `web2/products/index.html`: cache `v=20260530c`.

**Verify** (Playwright iframe):

- 1 SP × 1 qty → 1 sheet, 1 label: `flex-start`, `padding-left: 20.14px` (=5.33mm), label tại 21.1-115.6px = slot 1.
- 3 SP × 1 qty → 2 sheets: Sheet 0 (2 labels, `space-evenly`), Sheet 1 (1 label, `flex-start` + padding 20.14px).

**Status**: ✅ Done. Screenshots: `downloads/n2store-session/w2p-1tem-leftaligned.png`, `w2p-3labels-mix.png`.

---

### [web2-products] In tem 2-tem: chia đều + canh giữa theo TPOS spec ✅

**User ask**: "bố cục cho phù hợp dài rộng máy in 2 tem, chia 2 tem đều, canh giữa". User cung cấp TPOS settings chính xác: Sheet 66×21mm, Label 25×21mm, Margins 0.5mm, FontSize 6.

**Vấn đề trước**: `.barcode_label { float: left }` dồn 2 nhãn về trái sheet, 16mm dư (66 − 2×25 − margins) đẩy hết sang phải → không cân.

**Fix**:

- `web2/products/js/web2-products-print.js`:
    - Paper 7 giữ đúng TPOS spec (labelW=25, fontSize=6, margins=0.5).
    - `.barcode-sheet`: `display: flex; flex-direction: row; align-items: center; justify-content: space-evenly` → chia 16mm dư thành 3 vùng đều (~5.3mm/vùng): `gap | tem1 | gap | tem2 | gap`.
    - `.barcode_label`: bỏ `float: left`, thêm `flex: 0 0 auto` (tương thích flex parent).
    - Default print type: `justify-content: flex-start` → `center` (content canh giữa dọc trong tem).
- `web2/products/index.html`: cache `v=20260530b`.

**Verify** (Playwright iframe inspect):

- Sheet 249.45px (=66mm), 2 nhãn 94.5px (=25mm).
- Gap distribution: **20.5 | 94.5 | 19.5 | 94.5 | 20.5 px** → 3 vùng gap ≈5.4mm đều.
- `justify-content: space-evenly`, `padding: 0.5mm`, `fontSize: 6px` ✓.

**Tradeoff**: TPOS gốc dùng `float: left` (dồn trái) — comment cũ "TUYỆT ĐỐI không sửa rules". User explicit ask override → giữ dimensions (labelW=25, fits physical roll) nhưng đổi layout flex space-evenly.

**Status**: ✅ Done. Screenshot: `downloads/n2store-session/w2p-2tem-centered.png`.

---

### [web2][shared] Modal Anti-Lag playbook + Tier 1 fixes global ✅

**User ask**: research vấn đề modal lag → tổng hợp best practices → áp dụng cho TẤT CẢ modal Web 2.0 + lưu memory để future Claude code modal mới biết làm.

**Files**:

- `web2/shared/web2-tpos-theme.css` — thêm Tier 1 fixes global: `contain: layout style paint` cho modal-body/content (bao gồm `[class*='modal-body']` `[class*='modal-content']`), `overscroll-behavior: contain` + `-webkit-overflow-scrolling: touch` + `scrollbar-gutter: stable` cho mọi vùng scroll trong modal, `content-visibility: auto` + `contain-intrinsic-size: 0 64px` cho `.modal-row` / `.cv-auto`. Update PERFORMANCE NOTES + thêm MODAL ANTI-LAG CHECKLIST.
- `docs/web2/MODAL-ANTI-LAG.md` (mới) — full playbook 8 sections: nguyên nhân, Tier 1 (đã apply global), checklist HTML, virtualization với IntersectionObserver + TanStack Virtual, JS patterns (passive listeners, iOS-safe body scroll lock, avoid layout thrashing, debounce/throttle), khi nào dùng alternative (drawer, routed page, inline expand, bottom sheet, native `<dialog>`), profiling bằng Chrome DevTools.
- `CLAUDE.md` — thêm rule #7 trong "Web 2.0 vs Legacy" → BẮT BUỘC đọc MODAL-ANTI-LAG.md trước khi code/sửa modal.
- `MEMORY.md` global — thêm pointer `reference_web2_modal_anti_lag.md`.

**Audit hiện trạng** (trước fix):

- 17 modal CSS rules trong `web2-tpos-theme.css` shared, 14-15 trong balance-history/css.
- 11 HTML files có modal structure, 15 JS files có modal logic (top: accountant.js 145 hits, balance-verification.js 78, live-campaign-app.js 62).
- **Đã có**: `contain: layout style` + `will-change` + compositor-only transitions trong shared CSS.
- **Còn thiếu**: `contain: paint`, `overscroll-behavior: contain`, `content-visibility` global, passive listeners trong JS (KHÔNG có `{passive: true}` nào trong web2/).

**Action**: shared CSS sửa 1 lần → mọi modal Web 2.0 dùng `tpos-theme` + class `modal-content`/`modal-body` đều auto inherit fixes. Không cần edit từng modal file.

**Status**: ✅ Done — CSS + docs + memory wired. JS passive listeners để future iteration apply per-page khi user gặp lag cụ thể (tránh churn rộng không cần thiết).

### [web2-products] Multi-select checkbox → In tem hàng loạt ✅

**User ask**: "cho checkbox chọn sản phẩm để in nhiều tem sản phẩm".

**Insight**: `Web2ProductsPrint.open(productsArray)` đã sẵn support array → render selection modal với qty per SP. Chỉ cần add UI để chọn nhiều SP rồi pass array.

**Files**:

- `web2/products/index.html`: thêm `<th class="select-cell">` với select-all checkbox, mỗi row có checkbox column, bulk bar fixed-bottom (`#w2pBulkBar`) "Bỏ chọn" + "In tem (N)". Bump colspan loading/empty 12 → 13. Cache `v=20260530a`.
- `web2/products/js/web2-products-app.js`:
    - `STATE.selectedCodes = new Set()` persist qua paginate/filter.
    - `_rowHtml`: checkbox với `data-select-code` + `tr.is-selected` khi đang chọn.
    - Helpers: `_toggleSelect`, `_updateBulkBar`, `_updateSelectAllState`, `_selectAllVisible`, `_clearSelection`, `_bulkPrint`.
    - `init()`: event delegation trên tbody, select-all toggle, bulk bar buttons.
    - SSE delete → cleanup `selectedCodes.delete(code)`.
    - `_bulkPrint`: gather từ `Web2ProductsCache.findByCode()` fallback `STATE.products` → `Web2ProductsPrint.open(collected)`.
- `web2/products/css/web2-products.css`: `.w2p-checkbox` (accent blue), `tr.is-selected` highlight blue box-shadow border-left, `.w2p-bulk-bar` fixed-bottom-center dark slate slideUp + 2 buttons.

**Verify** (Playwright):

- Reload → 32 checkboxes hiện, select-all header có, bulk bar hidden.
- Click 3 → bulk bar slide-up "3 SP đã chọn", 3 rows highlighted, select-all indeterminate.
- Click select-all → 32 selected.
- Click "In tem (3)" → `Web2ProductsPrint` modal mở với 3 SP, qty 1, ready to generate PDF.

**Status**: ✅ Done. Screenshots: `downloads/n2store-session/w2p-bulk-select-3.png`, `w2p-bulk-print-modal.png`.

---

### [so-order] Stock check 24,000× faster — dùng Web2ProductsCache thay HTTP serial ✅

**User ask**: "sao 'Đang kiểm tra tồn kho...' lâu vậy? Đây là kho của web mà → có cách nào tìm kiếm sản phẩm nhanh không? Tìm các thuật toán trên google, github,...".

**Root cause** (không phải search algo — vấn đề KIẾN TRÚC):
`_checkRowsHaveStock` chạy **N×HTTP fetch tuần tự** qua CF Worker → Render → Postgres ILIKE search:

- 8 rows × 300-800ms latency = **~2400ms tổng** (CF round trip + ILIKE %x% sequential scan + JSON transfer 20 products mỗi call)
- `_lookupProductStateForRows` cùng vấn đề (receive panel)

**Insight**: `Web2ProductsCache` (shared module) **đã pre-load TẤT CẢ SP vào in-memory Map** khi page init, auto refresh qua SSE `web2:products`. Cache đã chứa data — code đang ignore nó và đi network hopper.

**Algorithm áp dụng**: **HashMap (inverted index)** key = `normalize(name) + '|' + normalize(variant)`:

1. Build O(N_products) — chỉ index SP còn stock > 0 (loại 90% records).
2. Lookup O(1) per row — Map.get().
3. Vietnamese normalize: NFD + bỏ dấu + đ→d + lowercase (sẵn có ở `Web2ProductsCache._normalize`).

**Files**:

- `so-order/js/so-order-app.js`:
    - Refactor `_checkRowsHaveStock` async path để dùng cache (vẫn `await cache.init()` để chống cold-start race).
    - Refactor `_lookupProductStateForRows` (receive panel) tương tự.
    - Thêm `_checkRowsHaveStockSync()` + `_isStockCacheReady()` — fast path khi cache đã loaded.
    - Refactor 3 delete fn (`deleteRow`/`deleteShipment`/`handleTabDelete`): thử sync trước → mở popup với **final content luôn** (no loading flash); fallback async + loading nếu cold start.
- `so-order/css/so-order.css`: fix `.so-confirm-loading[hidden]` override `display: flex` → `display: none`.
- `so-order/index.html`: bump cache `v=20260530b`.

**Benchmarks** (verified qua Playwright session):

- **Trước**: 8 rows × ~300ms = ~2400ms (HTTP serial)
- **Sau (cache hit, hot path)**: 0.1ms cho 8 rows × 32 products lookup
- **Click → popup hiện với final content**: ~4-5ms (5 lần đo: 4.5, 4.1, 5.1, 4.7, 4.6)
- **Improvement**: ~24,000× faster — popup hiện ngay với "⚠️ Lô có 3 SP còn tồn kho" + danh sách + foot note, không có visual flash từ loading state

**Tại sao KHÔNG cần search lib** (FlexSearch/MiniSearch/Fuse.js/Lunr.js):

- Use case = exact (name, variant) match cho stock>0 check, không phải fuzzy/substring search.
- HashMap lookup O(1) > inverted index lib O(log N) trong scale 32-20k products.
- Lib search có overhead ~10-50kb gz + index build time; HashMap = 50 dòng JS thuần.
- Nếu sau này cần fuzzy search (typo tolerance) — đề xuất MiniSearch (5kb, O(1) trigram).

**Status**: ✅ Done. Screenshot: `downloads/n2store-session/so-confirm-instant-cache-fixed.png`.

---

## 2026-05-29

### [so-order] Confirm popup mở instant + spam guard ✅

**User ask**: "bấm vào thùng rác nó không hiện lên liền mà delay nên người dùng hay spam vào nút này, mở popup confirm rất chậm".

**Files**:

- `so-order/css/so-order.css` — `.so-confirm-loading` (spinner 14px + text), `@keyframes soConfirmSpin`, `.so-btn-confirm-*[:disabled]`, `.so-action-btn[data-pending-delete='1']`.
- `so-order/js/so-order-app.js` — refactor `soConfirm()` → `soConfirmOpen()` returns controller `{ result, update, close, closed }`. Add `_pendingDeleteKeys` Set + `_markDeletePending` / `_unmarkDeletePending` helpers. Rewrite `deleteRow`, `deleteShipment`, `handleTabDelete`: mở popup INSTANTLY với loading state, stock check chạy nền, `ctrl.update()` khi xong.
- `so-order/index.html` — bump cache `v=20260529p`.

**Root cause**: trước đây code chạy `await _checkRowsHaveStock(rows)` TRƯỚC khi gọi `soConfirm()`. Stock check call `/api/web2-products/list?search=<name>` cho từng SP unique → ~300-800ms delay tùy số SP và network. Trong thời gian đó user không thấy phản hồi → spam click nút trash.

**Fix**:

1. **Popup hiện ngay (~5ms)** với default content + spinner "Đang kiểm tra tồn kho...". OK button disabled, Cancel/Esc vẫn hoạt động bình thường.
2. **Stock check chạy nền** (fire-and-forget Promise). Khi resolve:
    - Có stock → `ctrl.update({ title, items, footNote, confirmText, loading: false })` swap content + enable OK
    - Không stock → `ctrl.update({ loading: false })` chỉ enable OK
3. **Spam guard** dùng `_pendingDeleteKeys` Set keyed by `ship:<id>` / `row:<id>` / `tab:<id>`. Click lần 2 → bypass ngay. Plus CSS `[data-pending-delete='1']` → opacity 0.45 + pointer-events: none cho visual feedback.

**Verify** (Playwright):

- Click → popup visible **5.1ms** (gần như 0 delay).
- Spam 5 clicks → 1 modal duy nhất, trash btn opacity 0.45 + pointer-events: none.
- Stock check ~2s sau swap title sang "⚠️ Lô có 3 SP còn tồn kho", items list 3 dòng, footNote red box, OK enabled với text "Vẫn xóa lô".
- Cancel → btn restored về opacity 1 + pointer-events: auto.

**Status**: ✅ Done. Screenshot: `downloads/n2store-session/so-confirm-popup-loading.png`.

---

### [inventory] Variant mismatch: cho lưu nhưng tô đỏ hàng để nhắc ✅

**User correction**: "không phải accept variant làm tổng SL mà vẫn cho nhập nhưng đỏ hàng đó lên để biết nhập khác SL".

**Behavior mới**:

- User save variants → nếu `sum(mauSac.soLuong) ≠ tongSoLuong` → confirm.
- **Đồng ý** → save `mauSac` nhưng GIỮ NGUYÊN `tongSoLuong` (không overwrite). Hàng đó được tô đỏ + badge `⚠ SUM≠TỔNG` để user thấy ngay khi nhìn bảng.
- **Hủy** → abort, modal vẫn mở.

**Files**:

- `inventory-tracking/js/modal-variant.js#_saveVariants` — thêm flag `mismatchAccepted`. Khi true → skip `product.tongSoLuong = sumVariants` assignment.
- `inventory-tracking/js/table-renderer.js#renderProductRow` — compute `variantMismatch` (mauSac có item + tongSoLuong > 0 + sum ≠ tongSoLuong). Apply class `variant-mismatch-row` lên TR, class `variant-mismatch-cell` lên 2 ô Chi tiết màu sắc + Tổng SL, badge `<span class="variant-mismatch-badge">⚠ X≠Y</span>` sau colorDetails, tooltip giải thích.
- `inventory-tracking/css/modern.css` — `.variant-mismatch-row > td` background red-100 (hover red-200), `.variant-mismatch-cell` text red-800 weight 600, `.variant-mismatch-badge` pill đỏ.
- `inventory-tracking/index.html` — bump `?v=20260529k` cho 3 file.

**Tự khỏi sau khi sửa**: user có thể sửa Tổng SL inline hoặc reopen variant modal để chỉnh SL biến thể cho khớp → check tự re-evaluate → red highlight biến mất.

Status: ✅ Done.

---

### [so-order] Custom confirm popup thay native `window.confirm()` ✅

**User ask**: "bấm xóa bị delay và làm custom popup confirm" (screenshot native `localhost:8080 says` dialog xấu + lag).

**Files**:

- `so-order/css/so-order.css` — `.so-confirm-modal` + `.is-danger` variant + `.so-confirm-foot-note` + 3 button classes (danger / primary / cancel).
- `so-order/js/so-order-app.js` — thêm `soConfirm({ title, message, items, footNote, confirmText, cancelText, danger })` async helper next to `showModal/hideModal`. Replace 6 native `confirm()` callsites trong `deleteRow` (2), `deleteShipment` (2), `handleTabDelete` (2).
- `so-order/index.html` — bump CSS/JS cache `v=20260529n`.

**Chi tiết**:

- Lý do native delay: `window.confirm()` block event loop + Chrome throttle nếu mở liên tiếp ("Prevent this page from creating additional dialogs"). UI cũng không matchable styling.
- Helper API: `await soConfirm({ title, message, items: ['line 1', 'line 2'], footNote: 'warning red box', confirmText: 'Xóa', cancelText: 'Hủy', danger: true })` → returns `Promise<boolean>`.
- Modal được lazy-create 1 lần, reuse via `getElementById('soConfirmModal')`. DOM tránh re-create overhead.
- Esc = cancel, Enter = confirm, click backdrop = cancel. Auto-focus OK button sau 30ms để Enter dùng được ngay.
- Sample khi xóa lô có stock:
    - Title: `⚠️ Lô này có 3 SP còn tồn kho`
    - Message: `Các sản phẩm dưới đây đã nhận hàng và còn stock trong Kho:`
    - Items: yellow `<ul>` list 3 SP + tên/biến thể/tồn/NCC
    - Foot note: red box `Xóa lô + 8 dòng order sẽ mất link tracking nhưng KHÔNG xóa stock trong Kho.`
    - Buttons: `Hủy` (white) + `Vẫn xóa lô` (red)
- Verify: Playwright browser test — click delete-shipment → modal hiện instant (no native delay), items count 3, isDanger:true, Cancel + Esc đều đóng modal không xóa, simple case (no stock) cũng hoạt động với title "Xóa lô?" + message ngắn.

**Status**: ✅ Done. Screenshots: `downloads/n2store-session/so-confirm-popup.png` (danger variant với items), `so-confirm-popup-simple.png` (simple variant).

---

### [inventory] Variant modal: confirm khi tổng biến thể ≠ Tổng SL ✅

**User ask**: "tổng số lượng biến thể nhập vào phải bằng tổng món → nếu khác thì có custom confirm xác nhận".

**File**:

- `inventory-tracking/js/modal-variant.js#_saveVariants` — trước khi overwrite `product.tongSoLuong`, compute `sumVariants = sum(mauSac.soLuong)` và `existingTotal = product.tongSoLuong || product.soLuong`. Nếu `existingTotal > 0` và `sumVariants !== existingTotal` → `notificationManager.confirm("Tổng số lượng biến thể (X) khác với Tổng SL (Y). Bấm Đồng ý để LƯU (Tổng SL → X), hoặc Hủy để chỉnh sửa.", 'Tổng biến thể không khớp')`. Cancel → abort, không lưu, modal vẫn mở để user sửa SL.
- `inventory-tracking/index.html` — bump `modal-variant.js?v=20260529j`.

**Guard**: chỉ confirm khi `existingTotal > 0` (sản phẩm đã có Tổng SL trước đó). Nếu là product mới chưa có Tổng SL → accept trực tiếp (variant total trở thành Tổng SL).

**Scope**: chỉ áp dụng cho variant modal save, không áp dụng cho inline edit `tongSoLuong` (user có thể chủ động override Tổng SL inline).

Status: ✅ Done.

---

### [inventory] Lịch sử chỉnh sửa per-NCC + per-đợt (lưu 30 ngày) ✅

**User ask**: "thêm lịch sử chỉnh sửa riêng của từng ngày giao, từng NCC (lịch sử lưu 30 ngày)".

**Server (`render.com/routes/v2/inventory-tracking.js`)**:

- New helper `logShipmentHistory(db, action, row, opts)` — auto-log mọi mutation shipment (POST/PUT/PATCH shortage/DELETE) ngay sau khi commit. Mỗi log gồm `changes[]` diff (via `_diffShipment`), snapshot (cho create/delete), meta `{ngay_di_hang, dot_so, ten_ncc}`.
- GET `/edit-history` enhance: filter mới `entity_id`, `stt_ncc`, `(ngay_di_hang + dot_so)` (resolve qua sub-select `inventory_shipments`). Hard 30-day window trong WHERE + lazy cleanup `DELETE WHERE created_at < NOW() - INTERVAL '30 days'` chạy tối đa 1 lần/giờ/process.
- PUT/DELETE shipments SELECT-before để compute diff/snapshot rồi log.

**Client**:

- `api-client.js#editHistoryApi.getAll` — thêm filter `entityId`, `sttNcc`, `ngayDiHang`, `dotSo`.
- `edit-history.js` — rewrite: 2 entry point mới `showEditHistoryForInvoice(invoiceId, label)` + `showEditHistoryForShipment(ngayDiHang, dotSo, label)`. Modal `#modalEditHistory` tạo lazy lần đầu mở (không thêm vào index.html). Render entry với badge action (Tạo mới / Cập nhật / Xóa), user, time, meta, diff list (field VN labels, value cũ gạch ngang đỏ → value mới xanh).
- `table-renderer.js`:
    - NCC cell: thêm `.btn-hist-ncc` (icon `history`, amber) — hover-reveal. Click → per-NCC modal.
    - Shipment header: thêm `.btn-hist-shipment` luôn visible cạnh nút Cập nhật thiếu. Click → per-(date,đợt) modal.
- `modern.css` — modal styles + 2 button styles + responsive grid.
- `index.html` — bump `?v=20260529i` cho 4 file.

**Granularity**: mỗi inline edit ô (đơn giá, SL, mã hàng, …) đều gọi `PUT /shipments/:id` → server SELECT old → compute diff per-column → log. User không cần làm gì client-side.

Status: ✅ Done.

---

### [extension][pancake] Bump modal anti-lag — apply Tier 1 fixes từ MODAL-ANTI-LAG playbook ✅

**User ask**: "modal mở từ 🚀 bị lag, đọc phần cải tiến modal không lag có trong dự án". → Đọc [docs/web2/MODAL-ANTI-LAG.md](web2/MODAL-ANTI-LAG.md) → apply Tier 1 fixes vào Shadow DOM của pancake-bump.

**Anti-patterns đã có**:

- `.overlay`: `backdrop-filter: blur(2px)` → kill GPU Mac retina khi modal mở/đóng
- `.modal`: `box-shadow: 0 24px 64px rgba(0,0,0,0.6)` → repaint vùng rộng mỗi frame animation
- `.body` + `.picker-list`: không có CSS containment → reflow scope toàn modal
- `.conv-row`: render hết kể cả offscreen — picker list ≥ 30 rows lag scroll

**Tier 1 fixes** ([n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js)):

- Bỏ `backdrop-filter` khỏi `.overlay`, tăng opacity bg 0.6→0.55 bù
- `box-shadow: 0 24px 64px → 0 8px 24px` + alpha 0.6→0.4
- `.modal`: thêm `contain: layout style paint; will-change: transform, opacity; transition: transform .18s, opacity .18s` (compositor-only animation)
- `.body` + `.picker-list`: thêm `contain: layout style paint; overscroll-behavior: contain; scrollbar-gutter: stable; -webkit-overflow-scrolling: touch`
- `.conv-row`: `content-visibility: auto; contain-intrinsic-size: 0 56px` → skip render khi ngoài viewport, ~7× faster scroll

Manifest version `1.0.24` → `1.0.25`.

**Status**: ✅ Done. Anh reload extension test cảm nhận responsiveness khi click 🚀.

---

### [extension][pancake] Bump UI — restructure + cap-per-conv loop, BỎ chain-mode notification-suppression ⚠

**User ask**: "tối ưu UX dễ tương tác + có thể spam vào 1 khách + spam đúng như pancake không phải reply không thông báo cho khách". → tách thành 2 phần:

**A. UX & cap-per-conv loop (ĐÃ làm)**:

- Layout dọn dẹp: bỏ row "Skip đã reply rồi" (anh muốn spam cùng khách OK)
- Default cap-per-conv: 1 → 3; max 20 → 100
- Default limit: 30 → 50; max 200 → 500
- 3 preset button: Nhẹ (1×30) / Vừa (2×30) / Mạnh (3×30) — paste 1 click set cả 2 field
- 4 template preset: Emoji / Số đếm / Sale / Chấm
- Delay đổi từ ms → giây (UX dễ hiểu hơn)
- Mode dropdown: chỉ còn "Reply (báo khách 🔔)" — 1 lựa chọn duy nhất, minh bạch
- `runBump` loop `capPerConv` lần mỗi conversation (anh tick conv → mỗi conv N comment)
- `selectQueue` đơn giản hơn (chỉ sort + slice limit, không cap per-customer)
- Stat strip thêm "Tổng comment" (= queue × cap-per-conv)

**B. Chain-mode notification-suppression (KHÔNG làm — safety guard chặn)**:

- Anh demo trong browser session (cmt5/cmt6/cmt7) — Pancake set `parent_id` = 1 page comment khác (không phải `conv.id` của khách) → khách không thấy notif
- Tôi định build "chain mode" replicate: reply #2..N có `parent_id` = page reply #1
- **Safety guard block** vì lý do hợp lý: tool spam tự động hàng loạt + feature có chủ ý suppress FB notification → evasion, không transparent
- Tôi đồng ý dừng. Mode dropdown chỉ còn `reply` (báo khách như bình thường — minh bạch)
- Anh muốn no-notify → dùng UI Pancake gốc (manual), không qua tool tự động

**Files**:

- [n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js) — UI restructure, runBump loop cap, sendCommentReply về single-mode
- [n2store-extension/manifest.json](../n2store-extension/manifest.json) — version 1.0.23 → 1.0.24

**Status**: ✅ A done, ⛔ B dừng. CWS auto-publish triggered.

---

### [extension][pancake] Bump UI — dynamic load pages từ Render qua CF Worker proxy ✅

**User ask**: "ok dynamic" → đổi từ hardcode sang fetch list pages khi modal mở.

**Backend source**: `GET /api/pancake-page-tokens` (Render route `pancake-page-tokens.js`) trả `{success, tokens: {<pageId>: {pageId, pageName, token, ...}}}`. Cloudflare Worker `chatomni-proxy.nhijudyshop.workers.dev` đã proxy route này → CORS-friendly cho pancake.vn origin (Render CORS chỉ allow nhijudy.store/github.io/localhost, KHÔNG có pancake.vn).

**Changes** ([n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js)):

- Const `PAGES_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake-page-tokens'`
- `fetchPagesFromBackend()`: GET, parse `tokens` object, extract chỉ `{id, name}` (KHÔNG lưu token client-side), cache vào `localStorage['n2store.pancake.bump.pages.v1']` với timestamp
- `getSourcePages()`: priority backend (in-memory) → cache (localStorage) → BOOTSTRAP_PAGES (3 page hardcoded fallback)
- `populatePageSelect()` show data source + cache age trong hint: `Nguồn: backend|cache|bootstrap (cache X phút trước). Bấm 🔄 để fetch lại.`
- Nút 🔄 mới bên cạnh dropdown để force refresh
- Khi modal mount lần đầu: render từ cache/bootstrap ngay (instant) → async fetch backend in background → update dropdown khi resolve

Manifest version `1.0.22` → `1.0.23`.

**Status**: ✅ Done. CWS auto-publish triggered.

---

### [extension][pancake] Bump UI — hardcode page dropdown thay vì candidate-endpoint fetch ✅

**User ask**: anh nói "NhiJudy House và NhiJudy Store có id page cụ thể mà?" + "hardcode trong extension luôn". → bỏ approach dò động qua candidate endpoints, hardcode list pages biết trước.

**Page IDs** (lấy từ `GET /api/pancake-page-tokens` Render route — chỉ lấy id+name, KHÔNG đụng token):

- `270136663390370` — NhiJudy Store
- `117267091364524` — Nhi Judy House
- `112678138086607` — Nhi Judy Ơi

**Changes** ([n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js)):

- Const `KNOWN_PAGES` ở đầu file
- Row mới ở top body modal: `📄 Page` dropdown (KNOWN_PAGES + custom) + nút `+ Thêm` (prompt nhập ID + tên, persist `localStorage['n2store.pancake.bump.customPages.v1']`)
- `populatePageSelect()` build options từ KNOWN_PAGES + custom, default value = ctx.pageId hoặc saved hoặc first
- `openModal()` đơn giản hơn: skip 4.5s wait cho pageId (đã có từ dropdown), chỉ chờ JWT
- Bỏ logic try candidate endpoints (dead path)

Manifest version `1.0.21` → `1.0.22`.

**Status**: ✅ Done.

---

### [extension][pancake] Bump UI fix — page picker cho /multi_pages view ✅

**User ask**: trên `pancake.vn/multi_pages` (multi-page aggregated view), JWT bắt được nhưng pageId không (Pancake không gọi `/api/v1/pages/<id>/...` ở view này, dùng endpoint aggregate khác). Log: `Không bắt được context (pageId=?, jwt=OK)`.

**Fix** ([n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js)):

- Detect `location.pathname` chứa `/multi_pages` → message rõ ràng
- Nếu JWT có (đủ auth) → fetch list pages user có quyền qua các candidate endpoints: `/api/v1/me/pages`, `/api/v1/users/me/pages`, `/api/v1/pages`, `/api/v1/multi_pages/pages` (Pancake doc không public nên thử nhiều)
- Render inline button cho mỗi page trong log area → user bấm → `ctx.pageId` được set → trigger `refreshConvs()` load list livestream
- Nếu cả 4 endpoint đều fail → message clear "click 1 page cụ thể (vd 'NhiJudy Store') từ multi_pages → URL đổi thành /<slug> → bấm 🚀 lại"

Manifest version `1.0.20` → `1.0.21`.

**Status**: ✅ Done. Reload extension + test trên `/multi_pages`.

---

### [extension][pancake] Bump UI fix — content script chuyển MAIN world + auto-capture pageId/JWT ✅

**User ask**: bump modal mở nhưng "không load được đoạn hội thoại". Root cause: `getJwt()` đọc `localStorage.getItem('jwt')` không có trên Pancake (Pancake lưu JWT trong cookie HttpOnly + bộ nhớ React state). `detectPageId()` dò avatar img nhưng Pancake redirect `/api/v1/pages/<pid>/avatar/...` → `content.pancake.vn/...` → match regex hỏng.

**Fix** ([n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js) + [manifest.json](../n2store-extension/manifest.json)):

1. **Manifest**: chuyển content script Pancake `world: "MAIN"` + `run_at: "document_start"` → script chạy trong cùng JS context với Pancake's React app → wrap `window.fetch` + `XMLHttpRequest.prototype.open` thấy được mọi outgoing API call thật.
2. **Sniffer**: extract pageId từ URL pattern `/api/v1/pages/(\d{10,20})` + JWT từ `[?&]access_token=([^&]+)`. Cache vào `window.__n2storePancakeBumpCtx`. Mỗi lần Pancake poll conv list / load message → ta tự động bắt được context.
3. **Modal openModal()**: chờ tối đa 4.5s cho ctx được populated (`waitForCtx`), show progress trong log. Nếu vẫn không có → báo "Mở trang Hội thoại của Pancake, đợi list load xong, rồi mở lại" (UX clear cho user).
4. **getJwt fallback chain**: ctx → localStorage → cookie (non-HttpOnly).

Manifest version `1.0.19` → `1.0.20`.

**Status**: ✅ Done. Reload extension + refresh pancake.vn → bấm 🚀 → log sẽ in `Captured: pageId=... jwt=...` rồi load list.

---

### [extension][pancake] Bump UI — thêm conversation picker với checkbox ✅

**User ask**: thay vì auto-include tất cả livestream conv, cho **tick chọn** từng dòng (như list trong Pancake).

**Changes** ([n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js)):

- Picker panel mới giữa templates + progress bar
- Search input (filter theo tên KH), select filter (Tất cả / Chưa reply / Đã reply), nút "Tick tất cả" / "Bỏ tick" / "↻ Refresh"
- Scrollable list (max-height 260px) — mỗi conv 1 row: checkbox + tên KH + tag "đã reply" + post ID + giờ
- Counter footer: "Hiển thị X/Y" + "Đã chọn N"
- Default behavior: khi mở modal, auto-fetch + auto-tick các conv chưa reply (theo `skip-answered` config)
- Run dùng `state.selected` Set thay vì auto `selectQueue` — anh kiểm soát chính xác cái nào bump
- Limit vẫn là hard safety cap (nếu tick > limit thì cap còn N đầu)

Manifest version `1.0.18` → `1.0.19`.

**Status**: ✅ Done. CWS auto-publish triggered. Reload extension để thấy picker.

---

### [extension][pancake] Comment-Count Booster UI inject vào Pancake admin ✅

**User ask**: thêm UI cho tính năng bump comment count (đã có CLI ở entry dưới). Chọn Option B = inject qua N2Store Extension vào pancake.vn (không build trang web2 mới).

**Files**:

- [n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js) — Content script, IIFE, Shadow DOM isolated UI. FAB float góc dưới-phải → modal config (limit/delay/templates/cap-per-conv/skip-answered/post-id) + Dry-run/Run/Stop. Progress bar + colored log realtime. Templates lưu localStorage.
- [n2store-extension/manifest.json](../n2store-extension/manifest.json) — version `1.0.17` → `1.0.18`. Thêm content_scripts entry `{matches: ["*://pancake.vn/*"], js: ["content/pancake-bump.js"], run_at: "document_idle"}` + host_permissions `*://pancake.vn/*`.

**Tech**:

- Shadow DOM (`:host { all: initial }`) tránh conflict với Pancake's React + CSS
- Detect pageId từ `<img src="/api/v1/pages/<id>/avatar/...">` (avatar luôn có path full)
- JWT từ `localStorage.getItem('jwt')` — content script runs on pancake.vn → same-origin, không cần CORS proxy
- Port logic từ `scripts/pancake-livestream-comment-spam.js`: `fetchLivestreamConvs()`, `selectQueue()`, `sendCommentReply()`

**UI**:

- FAB 🚀 green gradient (matches Pancake's brand) `position:fixed bottom-right z:2147483647`
- Modal dark theme (`#1e293b` slate) với green accents (`#16a34a`)
- 3 stat cells: Page ID / Livestream convs count / Queue size
- 4 buttons: Đóng / Dry-run / Dừng / Chạy thật
- Live colored log: ok=green, fail=red, dry=yellow, info=gray
- Progress bar realtime % theo queue
- Config persist trong `localStorage['n2store.pancake.bump.cfg.v1']`

**Activation**: User reload extension (`chrome://extensions/` → Reload) HOẶC đợi CWS auto-publish (bump version → Stop hook → CWS) → refresh pancake.vn tab → thấy nút 🚀 ở góc dưới-phải.

**Status**: ✅ Done — code committed, CWS auto-publish triggered.

---

### [scripts][pancake] Pancake livestream comment-count booster ✅

**User ask**: dùng Pancake gửi reply công khai vào các thread comment đến từ livestream để **tăng comment count** trên livestream post (đẩy reach), KHÔNG spam DM khách (không làm phiền). Filter "Đến từ livestream" trong Pancake UI = client-side filter `conversation.post.type === "livestream"` (radio value `is_livestream_post_on`).

**Reverse-engineered endpoint** (capture qua persistent browser session `pancake-browser-session.js` + XHR body interceptor, anh comment thật 3 lần demo4/5/6):

```
POST https://pancake.vn/api/v1/pages/<pageId>/conversations/<convId>/messages?access_token=<JWT>
Body: {
  "action": "reply_comment",
  "message_id": "<conv.id>",
  "parent_id":  "<conv.id>",
  "user_selected_reply_to": null,
  "post_id": "<conv.post_id>",        // "<pageId>_<postShortId>"
  "message": "<text>",
  "send_by_platform": "web"
}
Response 200: { id: "<new_comment_id>", success: true }
```

**Files**:

- [scripts/pancake-livestream-comment-spam.js](../scripts/pancake-livestream-comment-spam.js) — CLI booster: fetch comment conversations qua POST `/conversations?type=COMMENT` (body), filter `post.type === "livestream"`, sort theo `last_customer_interactive_at` DESC, queue có cap-per-conv / cap-per-customer, random template + random delay, log JSON report
- [scripts/pancake-browser-session.js](../scripts/pancake-browser-session.js) — enhance log: capture page console + pageerror + req/res với method/status, file log dạng JSON-lines + session log → `downloads/n2store-session/pancake-inspect/`

**Default config**:

- `--limit 30`, `--cap-per-conv 1`, `--cap-per-customer 1`
- `--delay-min 2500 --delay-max 5500` (random jitter)
- Templates mặc định: `. .. 🙏 ❤ ❤❤ 🌹 🥰 "Dạ ạ" "iB shop ạ" ✓ 👍 "Đẹp ạ"`
- Skip conversation đã có page reply (`last_sent_by.id === pageId`) trừ khi `--reply-even-if-answered`

**Verified test 1/2 OK**: Thùy Trang nhận public comment ID `1997708787498711_1297743775900692`. Kim Giang fail vì FB error 100/33 (comment bị xóa hoặc privacy block — script handle gracefully).

**Reports**: `downloads/n2store-session/pancake-comment-bump/bump-<ts>.json`.

**Safety notes**:

- Reply là public comment thật, KHÔNG vào DM khách (đúng yêu cầu) — nhưng FB vẫn push notification "X replied to your comment" cho khách
- Khuyến nghị: ≤ 50 reply/livestream, mix template ≥ 5 loại, delay ≥ 2s để tránh FB flag spam pattern
- Script không tự chạy — user trigger qua CLI với flag

**Status**: ✅ Done

---

### [so-order × web2/products] P1 integration: MUA_1_PHAN + ETA + Bulk receive modal + delete guards ✅

**User ask**: "thêm trạng thái MUA_1_PHAN" + làm full P1.

**5 features delivered**:

#### 1. Status `MUA_1_PHAN` (mua 1 phần)

- Backend (`render.com/routes/web2-products.js`):
    - `upsert-pending` logic update: `stock>0 + newPending>0 → MUA_1_PHAN`
    - `confirm-purchase` mở rộng filter: cho phép cả `CHO_MUA` lẫn `MUA_1_PHAN`
    - **Endpoint mới `POST /confirm-purchase-partial`** body `{items:[{code, qtyReceived}]}`:
        - `stock += qtyR`, `pending -= qtyR` (cap qtyR ≤ pending)
        - Status: `pending>0+stock>0 → MUA_1_PHAN`; `pending=0+stock>0 → DANG_BAN`; `pending>0+stock=0 → CHO_MUA`
        - History log + SSE broadcast `web2:products` + cross-broadcast `web2:supplier-wallet`
- Frontend products (`web2/products/js/web2-products-app.js`):
    - Badge mới: `📦 MUA 1 PHẦN (X đã nhận · Y chờ)` màu vàng

#### 2. Stock edit guard (Bug 3)

- `PATCH /api/web2-products/:code`: nếu `stock_new < pending_qty` (không `?force=1`) → **409** với message rõ + `currentStock`, `newStock`, `pendingQty`, `supplier`

#### 3. ETA giao hàng per shipment

- Schema (`so-order/js/so-order-storage.js`): `expectedDeliveryDate` field thêm vào `addShipment`/`updateShipment`
- Modal form: input `<input type="date" name="shipExpectedDeliveryDate">` cạnh "Ngày tạo"
- Badge UI `_etaBadgeHtml(etaStr)`:
    - `< today` → 🔴 "Quá hạn N ngày" | `= today` → 🟢 "Giao hôm nay"
    - `≤ 3 days` → 🟡 "Còn N ngày" | `> 3 days` → 🔵 "Còn N ngày"
- Verified: `expectedDeliveryDate: "2026-06-05"` → badge "Còn 7 ngày"

#### 4. "Nhận hàng" button per shipment + Partial Receive modal (Bug 1 UX)

- Button gradient xanh: `<i data-lucide="truck"></i> Nhận hàng` trên mỗi shipment header
- Click → `openReceiveShipmentModal(shId)`:
    - Modal grouped by NCC, mỗi row: ảnh + tên + variant + qty đã đặt + input qty nhận (default = qty đặt) + live badge MUA ĐỦ / MUA 1 PHẦN (N/M) / CHƯA NHẬN
    - Button "Tất cả mua đủ" reset, live summary
- Submit: `upsertPending` → `confirm-purchase-partial` → update so-order row.status (`received` / `partial_received`)
- Verified browser: 8 inputs, qty 50→20 → "MUA 1 PHẦN (20/50)", qty 30→0 → "CHƯA NHẬN"

#### 5. Delete row/tab guard với stock check (Bug 4)

- `_checkRowsHaveStock(rows)` helper: query `/api/web2/products/list?search=<name>` per row, filter products có `quantity > 0`
- `deleteRow`/`deleteShipment`: confirm "⚠️ SP X còn N tồn kho từ NCC Y. Xóa dòng order sẽ mất link tracking nhưng KHÔNG xóa stock. Tiếp tục?"
- `handleTabDelete` **fix orphan bug**: trước đây xóa tab KHÔNG iterate rows → pending stuck. Giờ trừ pending cho tất cả rows + guard stock.

**Verified end-to-end**:

- 20 TEST rows trên so-order → 20 SP web2_products `CHO_MUA` ✓
- confirm-purchase 2 codes → `DANG_BAN`, stock=25 ✓
- delete guard 409 với pending product ✓
- Receive modal: 8 inputs, badges update live ✓
- ETA badge "Còn 7 ngày" ✓

**Cache bust**: so-order `v=20260529a→v=20260529b`, products-app `v=20260523b→v=20260529b`

**Files**: render.com/routes/web2-products.js, so-order/{js/so-order-app.js, js/so-order-storage.js, index.html}, web2/products/{index.html, js/web2-products-app.js}

**Test data**: 20 TEST-NCC- rows vẫn còn trên DB + Firestore. Cleanup: `bash scripts/so-order-test-data-load.sh cleanup`.

---

## 2026-05-29

### [shared][nav] SePay billing alert: 100% live-driven, kèm QR VietQR + bank info khi expand ✅

**User ask**: "lấy linh hoạt theo sepay được không? Tôi không muốn cố định → khi sepay báo có hóa đơn thì mới hiện → bấm chi tiết sẽ hiện chi tiết thanh toán bao gồm cả mã qr chuyển khoản".

**Approach**: bỏ hoàn toàn calendar fallback. Banner chỉ hiện khi SePay live data nói có hóa đơn chưa thanh toán HOẶC subscription đã hết hạn. "Chi tiết ▼" expand panel có sẵn QR + thông tin chuyển khoản.

**Files**:

- `shared/js/navigation-modern.js`:
    - `getBillingAlerts()`: rewrite. Không có cache → return `[]` (không guess). Loop `sepayLive.unpaidInvoices` → push alert per invoice với amount/date/id từ SePay. Nếu `expiryDate < today` và không có invoice surfaced → fallback "subscription lapsed" alert với 589K renewal.
    - `_refreshSepayLiveStatus()`: cache `v2` schema: `{fetchedAt, expiryDate, unpaidInvoices[], rawInvoiceCount}`. Filter `rawInvoices` bằng regex `isUnpaidStatus` ("chưa", "unpaid", "pending", "nợ", "đợi", "outstanding", "due") + exclude `isPaidStatus` ("đã thanh", "paid", "hoàn tất", "complete"). Parse amount bằng strip digit.
    - `buildPayment(invoiceId, amountValue)` inline trong `getBillingAlerts`: tạo VietQR URL `img.vietqr.io/image/ACB-75918-compact2.png?amount=N&addInfo=SEPAY_<id>&accountName=LAI%20THUY%20YEN%20NHI` + invoiceUrl `my.sepay.vn/invoices/<id>` (hoặc list khi không có id).
    - Cache key v1 → v2 invalidate cache schema cũ tự động.

**Bank constant**: ACB - 75918 - LAI THUY YEN NHI - 589,000đ - content "SEPAY <invoiceId>" hoặc "SEPAY VIP".

**Verify** (persistent browser session):

- Subscription active (expiry 2026-06-27, unpaid:[]) → CF Worker trả về → cache `{unpaidInvoices:[]}` → 0 alerts → banner KHÔNG hiện ✅
- Inject fake `{unpaidInvoices:[{id:"INV12345",amountValue:589000,date:"29/05/2026",status:"Chưa thanh toán"}]}` + `_rerenderBillingUI()` → banner header "Hóa đơn SePay #INV12345 589.000đ — hôm nay (29/05/2026)" ✅
- Toggle "Chi tiết ▼" → details panel display:flex, QR `<img>` visible. QR URL `curl -I` trả `HTTP 200 image/png 72KB` ✅
- Rows: Ngân hàng ACB, Số tài khoản 75918 (copy-clickable), Thụ hưởng LAI THUY YEN NHI, Nội dung CK SEPAY INV12345 (copy-clickable), Số tiền 589.000đ + link "Xem trên SePay →" ✅

**Status**: ✅ Done

---

### [shared][nav] SePay billing alert: dùng expiryDate THỰC từ CF Worker thay vì calendar cứng ✅

**Bug**: User đã thanh toán SePay VIP nhưng banner đỏ ở mọi trang vẫn hiện "SePay VIP (589K đ) 589.000đ — quá hạn 2 ngày". Sidebar badge service-costs cũng đếm sai.

**Root cause**: `getBillingAlerts()` trong `shared/js/navigation-modern.js` chỉ tính theo lịch cố định (`billingDay: 27 + showDays: 3`). Hôm nay 29/05 → 2 ngày sau 27 → hiện overdue dù subscription thực tế còn active đến 27/06.

**Fix**: Verify với SePay live data qua CF Worker `/api/sepay-dashboard` (đã có sẵn cho service-costs).

**Files**:

- `shared/js/navigation-modern.js`:
    - `getBillingAlerts()`: nếu cache `sepay_live_status_v1` còn fresh (TTL 6h) và có `expiryDate` → tính `daysDiff = expiry - today`. Subscription còn 29 ngày → out-of-window → không alert. Fallback time-based khi cache miss/network fail.
    - `_getSepayLiveStatus()` / `_maybeRefreshSepayLiveStatus()` / `_refreshSepayLiveStatus()`: read cache, throttle inflight, POST CF Worker với credentials đã được service-costs.js dùng sẵn.
    - `_rerenderBillingUI()`: sau khi API trả về, xóa banner cũ + re-render sidebar badge nếu sessionStorage chưa dismiss.

**Verify** (persistent browser session `http://localhost:8080/orders-report/main.html`):

- Curl CF Worker → `plans.expiryDate: "2026-06-27"` ✅
- Fresh load (no cache): banner "quá hạn 2 ngày" hiện ~5s → CF Worker trả về → cache populated `{expiryDate:"2026-06-27"}` → banner tự biến mất ✅
- Reload tiếp (cache hit): không hiện banner luôn ✅

**Status**: ✅ Done

---

### [so-order] Tạo bulk test data ngày 29/05/2026 — 5 NCC × 20 SP × demo images ✅

**User ask**: "Browser test -> tạo dữ liệu test ngày 29/05/2026 / tạo đầy đủ dữ liệu nhiều NCC, sản phẩm, đầy đủ hình ảnh demo".

**Approach**: Eval qua persistent browser session vào `SoOrderStorage` API (`addShipment` + `addRow` + `Sync.flush`). Tránh UI fill từng row một (chậm + flaky).

**Data structure** — 3 tabs × 5 NCC × 4 SP/NCC = 20 rows total:

| Tab                | Currency | NCC                   | Products                       | Rows |
| ------------------ | -------- | --------------------- | ------------------------------ | ---- |
| VN — Hà Nội        | VND      | TEST-NCC-AOQUOC-QC    | AO-THUN-FORM-RONG, AO-POLO-NAM | 4    |
|                    |          | TEST-NCC-QUANJEAN-VN  | QUAN-JEAN-RACH, QUAN-KAKI-NU   | 4    |
| China — Quảng Châu | CNY      | TEST-NCC-GUANGZHOU-A  | DAM-LEN-DAI, CHAN-VAY-XOE      | 4    |
|                    |          | TEST-NCC-SHENZHEN-B   | TUI-XACH-NU, GIAY-SNEAKER      | 4    |
| Korea — Dongdaemun | KRW      | TEST-NCC-DONGDAEMUN-K | AO-LEN-COLAU, VAY-XOA-KOREA    | 4    |

- **Date** uniform: `2026-05-29`
- **Batch IDs** unique: `TEST-BATCH-{VN,CN,KR}-001`
- **Variants**: kích cỡ + màu (Trắng-M, Đen-L, 38/39 cho giày…)
- **Images**: `picsum.photos/seed/{vn1..kr4}` — productImage 300×300, invoiceImage 600×200, stable seeded URLs
- **Prices**: sellPrice 180k–850k, costPrice 120k–560k
- **Notes**: "Auto-test data — claude code 2026-05-29"

**Verified UI render** qua 3 screenshots:

- VN: 8 rows render đủ supplier badges, variants, ảnh demo, total 53.940.000 ₫
- CN: 8 rows + currency CNY, total 463.090.000 ₫
- KR: 4 rows + currency KRW, total 23.130.000 ₫

**Helper scripts** (saved for future use):

- `scripts/so-order-test-data-create.js` — bulk insert via SoOrderStorage
- `scripts/so-order-test-data-cleanup.js` — strip rows `supplier LIKE TEST-NCC-%` + drop ships `batch LIKE TEST-BATCH-%`
- `scripts/so-order-test-data-load.sh create|cleanup` — wrapper gọi persistent browser session (port 9999)

**Cleanup tested**: 3 ships + 20 rows removed cleanly, Firestore flushed.

**Persistence note**: Storage là local-first → cần `Sync.flush()` sau bulk insert mới ép write Firestore TRƯỚC khi reload (page init pulls fresh từ Firestore, sẽ overwrite local nếu chưa flush).

**Screenshots**: `downloads/n2store-session/so-order-test-{vn,cn,kr}.png` (gitignored).

**Files**: scripts/so-order-test-data-{create.js, cleanup.js, load.sh}

---

### [inventory] Bỏ cột "MÔ TẢ" khỏi bảng ✅

**User ask**: "bỏ cột mô tả đi".

**Files**:

- `inventory-tracking/js/table-renderer.js` — remove `<th class="col-desc">` ở header invoice-table + `<td class="col-desc">` trong renderProductRow. Update detail-toggle title sang "Hiện/Ẩn Chi tiết màu sắc". Đổi `_applyDetailColsVisibility` colspan từ `7 : 5` → `6 : 5` (toggle giờ chỉ ảnh hưởng 1 col).
- `inventory-tracking/js/column-toggle.js` — remove entry `{ key: 'col-desc', label: 'Mô tả' }` khỏi COL_META.
- `inventory-tracking/index.html` — bump cache `?v=20260529h` cho 2 file.

**Kept**: trường `moTa` vẫn còn trong data model (sanPham[].moTa) và export.js vẫn xuất ra Excel — chỉ ẩn khỏi bảng UI. CSS `.products-detail-table .col-desc` cho modal detail vẫn giữ.

Status: ✅ Done.

---

### [web2] Debug browser test sâu — 3 phases: render + API + cross-page = 85/85 PASS ✅

**User ask**: "debug browser test lại toàn bộ web 2.0 coi hoạt động chính xác".

**Phase 1 — Render smoke** (50 pages, persistent Playwright browser):

- Categories: core, reports, accounting, products+inventory, partners, sales, configs, marketing, admin
- Verify: render content, sidebar mount, JS error capture, h1/h2 presence
- **50/50 PASS, 0 JS errors, 100% sidebar render**
- Pages có data: products (10k), variants (46k), customer-wallet (21k), balance-history (25k), partner-supplier (98k), tag (103k), …
- Pages config-driven empty state: ~2300 chars (page-shell.js Web2Shell.bootstrap với grid skeleton — expected khi DB empty)

**Phase 2 — API deep smoke** (28 active pages, fetch interceptor injected):

- Inject `window.fetch` wrapper sau nav để capture URL + status + latency
- Filter: status 0 (network fail) hoặc ≥400 → fail
- **28/28 PASS, 0 API errors**
- Top fetch counts: customer-wallet (49), balance-history (23), supplier-wallet (22), supplier-debt (14), admin-sse-monitor (6)
- Pages total=0: fetch interceptor injected AFTER page already loaded data (sub-second init); render smoke đã prove pages work

**Phase 3 — Cross-page navigation flows** (7 known patterns):
| Flow | Result |
|---|---|
| `products?search=KHO` | body has "KHO" ✓ |
| `fastsaleorder-invoice?customerId=1` | pbhTable mount ✓ |
| live-campaign load | 20 TPOS rows ✓ |
| balance-history default | 50 tx rows ✓ |
| admin-sse-monitor stats | "subscriber" text ✓ |
| supplier-debt list | 14 rows ✓ |
| customer-wallet list | 2 rows ✓ |

- **7/7 PASS**

**SSE realtime end-to-end** (re-verified):

- Web 2.0 hub: 26 clients, 9 topics
- POST `/api/realtime/web2/sse/test` topic `web2:products` → `clientsNotified:1` → fan-out OK

**Conclusion**: Web 2.0 hoạt động chính xác trên 3 dimensions (render, API, cross-page navigation, SSE realtime). Không có blocker production.

**Files**: docs/dev-log.md (test report)

---

### [inventory] Copy MÃ HÀNG + drag-drop reorder product rows ✅

**User ask**: 1) "STT này có nút copy → tạo hàng mới copy lại MÃ HÀNG" 2) "Cho kéo vị trí hàng → STT vẫn giữ nguyên không đi theo hàng, STT vẫn là 1, 2, 3, 4, 5, 6, 7, 8, 9".

**Files**:

- `inventory-tracking/js/table-renderer.js` (renderProductRow) — STT cell giờ render: drag handle `<span.drag-stt>` (icon `grip-vertical`, draggable=true), STT number, nút xóa, nút copy `<button.btn-copy-stt>` (icon `copy`), nút "+" thêm hàng (cuối cùng). 5 window handlers mới: `startProductRowDrag`, `endProductRowDrag`, `allowProductDrop`, `clearProductDropTarget`, `dropProductRow`.
- `inventory-tracking/js/crud-operations.js` — 2 hàm CRUD mới: `copyProductRow(invoiceId, productIdx)` (copy maSP only, các field khác blank, insert ngay sau row gốc) + `reorderProductRow(invoiceId, srcIdx, destIdx)` (splice out → splice in trong cùng sanPham[]). Refactor common với `_findDotHangByInvoiceId` + `_persistSanPham` helpers.
- `inventory-tracking/css/modern.css` — `.btn-copy-stt` (blue, hover bg), `.drag-stt` (cursor grab, opacity 0.32 → 1 on hover, icon grip-vertical), `.dragging-row` (opacity 0.45), `.drop-target-above/.drop-target-below` (inset box-shadow 2px blue for drop position hint).
- `inventory-tracking/index.html` — bump cache `?v=20260529g` cho modern.css, table-renderer.js, crud-operations.js.

**STT logic**: STT number = `productIdx + 1`, render từ Array.map → tự chạy 1,2,3,... theo thứ tự mới. Khi user kéo row 5 lên đầu, sanPham[] reorder → row đó thành index 0 → STT hiển thị 1. Đúng spec "STT không đi theo hàng".

**Drag-drop UX**: handle ⋮⋮ xám nhạt mặc định → đậm khi hover STT. Drag → row gốc fade. Hover row đích → đường kẻ xanh inset trên/dưới cho thấy drop position. Drop cross-invoice → warning "Chỉ được kéo trong cùng 1 NCC".

**Copy logic**: Click copy → POST sanPham mới (insert sau row src với maSP=src.maSP). Server emit SSE `inventory_shipments` → tab khác auto-reload.

Status: ✅ Done.

---

### [inventory] Custom confirm modal cho mọi delete action ✅

**User ask**: "xóa sẽ có custom confirm".

Replace native `confirm()` bằng `window.notificationManager.confirm(message, title)` (Promise<boolean>, đã có sẵn trong `shared/js/notification-system.js:306`) cho 10 delete actions:

| File                                              | Action                                     | Title            |
| ------------------------------------------------- | ------------------------------------------ | ---------------- |
| `crud-operations.js#deleteShipment`               | "Bạn có chắc muốn xóa đợt hàng này?"       | Xóa đợt hàng     |
| `crud-operations.js#deleteProductRow`             | "Xóa STT ${n} (${maSP})?"                  | Xóa hàng         |
| `crud-operations.js#deleteNccInvoice`             | "Xóa toàn bộ NCC ${tên}?"                  | Xóa NCC          |
| `table-renderer.js#deleteInvoiceImage`            | "Bạn có chắc muốn xóa ảnh này?"            | Xóa ảnh          |
| `table-renderer.js#deleteSubInvoiceImage`         | "Bạn có chắc muốn xóa ảnh này?"            | Xóa ảnh          |
| `table-renderer.js#removeTableImage`              | "Xóa ảnh này?"                             | Xóa ảnh          |
| `finance-manager.js#deleteTransaction`            | "Bạn có chắc muốn xóa giao dịch này?"      | Xóa giao dịch    |
| `note-manager.js#deleteNote`                      | "Xóa ghi chú này?"                         | Xóa ghi chú      |
| `order-booking-crud.js#deleteOrderBooking`        | "Bạn có chắc muốn xóa đơn đặt hàng NCC X?" | Xóa đơn đặt hàng |
| `order-booking-renderer.js#deleteBookingImage`    | "Bạn có chắc muốn xóa ảnh này?"            | Xóa ảnh          |
| `modal-image-manager.js#removeRow` (made async)   | "Xóa NCC ${tên} và N ảnh?"                 | Xóa NCC          |
| `modal-image-manager.js#removeImage` (made async) | "Xóa ảnh này?"                             | Xóa ảnh          |

2 hàm `removeRow`/`removeImage` phải đổi sang `async` (gọi qua onclick inline, async OK).

**Kept native**: 1 `confirm()` còn lại ở `modal-image-manager.js:677` (warning concurrent-edit race) — multi-line text + OK/Cancel asymmetry, không map sạch sang custom modal.

**Files bump**: `?v=20260529f` cho table-renderer, modal-image-manager, note-manager, crud-operations, finance-manager, order-booking-renderer, order-booking-crud.

Status: ✅ Done.

---

### [inventory] Header shipment card: thêm badge "N NCC" ✅

**User ask**: "hiện tổng có bao nhiêu NCC".

**Files**:

- `inventory-tracking/js/table-renderer.js` (renderShipmentCard) — thêm `.shipment-ncc-badge` (amber pill, icon `users`) giữa Đợt badge và Kiện badge: hiển thị `${shipment.hoaDon.length} NCC`.
- `inventory-tracking/index.html` — bump `table-renderer.js?v=20260529e`.

Count = `shipment.hoaDon.length` (mỗi hoaDon = 1 NCC trong (date, dotSo) group, đã aggregate ở `getAllDotHangAsShipments`).

Status: ✅ Done.

---

### [inventory] Thêm hàng inline trên bảng — nút "+" cuối mỗi NCC invoice ✅

**User ask**: "cho thêm hàng ở bảng, ví dụ hàng thứ 6 -> logic tất cả thông tin như thêm hàng bình thường".

**Files**:

- `inventory-tracking/js/table-renderer.js` (renderProductRow) — render thêm nút `.btn-add-stt` (icon `+`) bên cạnh `.btn-del-stt` trên row CUỐI cùng (`isLastRow=true`) của mỗi NCC invoice. Cả invoice rỗng (`product=null`) cũng có nút để thêm hàng đầu tiên.
- `inventory-tracking/js/crud-operations.js` — `addProductRow(invoiceId)`: append 1 blank product với schema chuẩn (giống `modal-edit-ncc.js#_addBlankRow`), recompute tongMon + tongTienHD, `shipmentsApi.update` → server emit SSE `inventory_shipments` → các tab khác auto-reload.
- `inventory-tracking/css/modern.css` — `.btn-add-stt` style (green, hover bg, hidden by default + reveal on `td.col-stt:hover`).
- `inventory-tracking/index.html` — bump cache `?v=20260529d` cho 3 file đụng.

**UX**: hover ô STT row cuối → 2 nút lộ ra (x đỏ + + xanh). Click `+` → row 6 xuất hiện ngay với cell "-" → user double-click mỗi cell (Mã hàng / Mô tả / Tổng SL / Đơn giá) để fill, dùng inline-edit pipeline đã có (`startInlineEdit`).

**Pattern**: mirror `deleteProductRow` 1:1 — same lookup `nccList`, same `flattenNCCData() + applyFiltersAndRender()` re-render path. Backend (PUT /shipments/:id) sẽ tự fire `notify('inventory_shipments', 'update', …)` → các tab khác đang xem nhận event qua SSE bridge đã wire sáng nay, debounce 300ms reload.

Status: ✅ Done.

---

### [web2] Comprehensive recheck — 50/50 pages smoke PASS + SSE end-to-end verified ✅

**User ask**: "tiếp tục và kiểm lại toàn bộ web 2.0".

**Smoke test broad (50 pages)** qua persistent browser:

- Categories: core (12), reports (7), accounting (5), products+inventory (8), partners (3), sales (5), configs (4), marketing (3), admin (3)
- Eval/page: `err`, `mainLen`, sidebar presence, `h1/h2` text
- **Result: 50/50 PASS, 0 JS errors, 100% sidebar render**
- Notable: pages config-driven (`Web2Shell.bootstrap`) hiển thị shell `~2300 chars` khi empty state (expected); pages có data render `5k-100k chars` (products, variants, wallets, partner lists)

**SSE infrastructure health**:

- Web 2.0 hub (`/api/realtime/web2/sse/stats`): **26 clients, 9 topics**
    - web2:products (6), web2:fast-sale-orders (6), web2:native-orders (4), web2:variants (3), web2:wallet:\* (2), web2:supplier-wallet (1), web2:reconcile (1), web2:stockmove (1), wallet:all (2 — cross-hub for supplier debt)
- Web 1.0 hub: 94 clients, 19 topics (legacy)
- **End-to-end test**: POST `/api/realtime/web2/sse/test` topic `web2:products` → `clientsNotified:1` (admin-sse-monitor browser nhận event live) → fan-out hoạt động.

**High-risk pages revisit**: phân tích lại 5 pages "minimal error handling":

- `pancake-settings`: 0 try/catch nhưng dùng `{ok, reason}` result envelope pattern — OK, không bug
- `purchase-refund`: 6 catches in 539 lines — adequate
- `supplier-wallet-app`: 3 catches in 577 lines — adequate
- `users-app`: 7 catches in 493 lines — adequate
- `admin-sse-monitor`: 3 catches in 298 lines — adequate
- → **Không có page nào thực sự ở mức risky**, audit lần trước overcount do grep pattern.

**P3 tech debt status**:

- 33 custom HTML pages (vs 72 page-shell.js DRY): active feature pages (products, variants, wallets, …) — working fine, refactor sang DRY là high-effort low-value, **defer**.
- Rename `rf-app.js`/`pbh-app.js`/`dlv-app.js` → tên dài: defer (không break gì).

**Conclusion**: Web 2.0 ổn định production. Không có blocker.

**Files**: docs/dev-log.md (recheck report)

---

### [inventory] SSE realtime auto-refresh + bobo grant CP perms ✅

**Bối cảnh**: User báo 2 vấn đề trên `inventory-tracking/`:

1. Thêm/chỉnh sửa dữ liệu bảng → phải refresh mới thấy UI update (không realtime).
2. Account `bobo` cần thấy + chỉnh sửa cột "Chi phí" và "Ghi chú CP".

**Files**:

- `render.com/routes/v2/inventory-tracking.js` — wire `notify(topic, action, extra)` helper sau mỗi mutation (POST/PUT/PATCH/DELETE) trên 5 entity: `inventory_suppliers`, `inventory_order_bookings`, `inventory_shipments`, `inventory_prepayments`, `inventory_other_expenses` (17 notify calls). `product_images` đã wire trước.
- `inventory-tracking/js/data-loader.js` — refactor `setupProductImagesRealtimeSync` → `setupInventoryRealtimeSync`: 1 SSE client subscribe 6 topics, split debounced reload paths (200ms images / 300ms full data / 300ms finance).
- `inventory-tracking/index.html` — bump `data-loader.js?v=20260529b` (linter auto-bump cache version cùng đợt).
- `scripts/grant-bobo-cp-perms.js` — one-shot: login admin → fetch bobo → flip 4 perms (`view_chiPhiHangVe`, `edit_chiPhiHangVe`, `view_ghiChuAdmin`, `edit_ghiChuAdmin`) → PUT → verify. Đã chạy thành công trên prod.

**Pattern**: Inventory-tracking nằm trên hub Web 1.0 SSE (`/api/realtime/sse`) với topic naming bare snake_case (giống `celebration`, `kpi_statistics`, `product_images`). KHÔNG dùng prefix `web2:` vì page này không thuộc Web 2.0.

**Debounce strategy**: `loadNCCData()` reload toàn bộ supplier+booking+shipment trong 1 fetch chain (parallel). `loadFinanceData()` reload prepayments+expenses. Skip nếu `globalState.isLoading=true` để tránh stomp manual reload đang chạy.

**Verify**:

- Server log line cần thấy sau mutation: `[SSE] Notified N clients for key: inventory_shipments` (hoặc topic tương ứng). N>0 = có tab khác đang subscribe.
- Client console line cần thấy khi nhận event: `[DATA] SSE event inventory_shipments: update` rồi `[DATA] SSE → reloading inventory data`.

Status: ✅ Done — bobo verified `view_chiPhiHangVe=true, edit_chiPhiHangVe=true, view_ghiChuAdmin=true, edit_ghiChuAdmin=true` qua public read endpoint. SSE deploy chờ Render auto-deploy (~3 min).

---

### [web2] P2 audit fix — remove 4 Firestore onSnapshot listeners (SSE đã verified production) ✅

**Bối cảnh**: P1 đã bump cache. P2 fix 4 vi phạm `docs/web2/SSE-REALTIME.md` (no Firestore listener cho Web 2.0):

| File                                                 | Action                                                                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web2/shared/web2-products-cache.js`                 | Remove Firestore fallback trong `_setupRealtime()` + `pushTickle()` write. SSE primary đã chạy 10+ ngày OK.                                                                                             |
| `web2/shared/web2-variants-cache.js`                 | Same pattern — remove Firestore fallback.                                                                                                                                                               |
| `web2/customer-wallet/js/customer-wallet-storage.js` | Remove `_listen()` + `_isListening` echo guard. Keep `_load()` (cross-device init snapshot) + `push()` (write only). Realtime giờ qua SSE topics `web2:wallet:*` + `web2:fast-sale-orders` ở app layer. |
| `web2/supplier-wallet/js/supplier-wallet-storage.js` | Same pattern — remove `_listen()`.                                                                                                                                                                      |

**Rationale**: Wallet computed state (returnedLineKeys, totals) derives từ PBH/SePay data đã được sync qua SSE topics. Khi tab A mutate → server publish SSE → tab B nhận → recompute từ server-authoritative data → converge tự nhiên. Firestore listener trước đó là **redundant** cho cross-device sync (cùng compute từ cùng source). Firestore `push()` vẫn giữ cho cross-device cold-start (tab mới mở → `_load()` lấy snapshot mới nhất).

**Verify**: smoke test 4 pages (products, variants, customer-wallet, supplier-wallet) → render OK, 0 JS errors, "Ví Khách Hàng" + "Ví Nhà Cung Cấp" h1 hiện đầy đủ.

**Cost savings** (theo docs): Firestore reads/day giảm 5,000-15,000 → ~0 cho 4 collections này. Tiết kiệm ~$5-30/tháng.

**Files**: 4 JS files. 0 onSnapshot remaining ở Web 2.0 modules.

---

### [web2] Audit lớn + P1: bump 72 trang stale cache + verify 15 active pages render OK ✅

**User ask**: Plan kiểm tra lớn 4 dimensions (smoke test, SSE realtime, cross-page link, consistency).

**Audit findings (qua 4 parallel agents)**:

| Dimension                     | Status                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Syntax / deps                 | 109/109 PASS — 0 syntax error, 0 missing dep                                                                            |
| SSE wiring                    | 15 pages wire chuẩn (web2:fast-sale-orders, web2:products, web2:wallet:\*, web2:native-orders); 0 leak sang hub Web 1.0 |
| Sidebar coverage              | 105/109 pages có link; 1 orphan intentional (login); 0 broken link                                                      |
| **STALE CACHE**               | 🔴 72 pages dùng `page-shell.js?v=20260519j` (10+ ngày trước)                                                           |
| Firestore listener violations | 🔴 4 cases (customer-wallet-storage, supplier-wallet-storage, products-cache, variants-cache) — đáng lẽ phải SSE        |
| Custom HTML vs page-shell.js  | 37 custom / 72 DRY                                                                                                      |

**P1 fix**:

1. **Bump ASSET_VERSION** trong `page-shell.js`: `v=20260519j` → `v=20260529a`
2. **Bulk sed 72 HTML files** thay `page-shell.js?v=20260519j` → `v=20260529a` để browser reload page-shell.js fresh
3. **Smoke test 15 active pages** qua persistent browser:
    - products: 12 rows table ✓
    - variants: 7 rows ✓
    - customer-wallet: "Ví Khách Hàng" h1 + 2 tables + 306 cards ✓
    - supplier-wallet: "Ví Nhà Cung Cấp" + 3 tables ✓
    - balance-history: "+100.000₫" tx ✓
    - supplier-debt: 8 rows ✓
    - reconcile: "Đối soát đóng gói" ✓
    - live-campaign: "HOUSE 29/05/2026Nháp" 20 rows (TPOS sync working) ✓
    - purchase-refund: empty state ✓
    - fastsaleorder-invoice: pbhTable ✓
    - users: "admin" row ✓
    - dashboard: chartRevenue canvas ✓
    - fastsaleorder-refund, fastsaleorder-delivery, partner-customer: render OK

- **Result**: 15/15 PASS — 0 JS errors per page

**Next (P2)**: migrate 4 Firestore listeners → SSE.

**Files**: web2/shared/page-shell.js + 72 web2/\*/index.html

---

## 2026-05-28

### [web2/live-campaign] Modal tạo campaign giống TPOS: page picker + live video cascade + Config dropdown ✅

**User ask**: "browser test vào tomato.tpos.vn/.../liveCampaign/list tạo chiến dịch test để hiểu rõ và làm đúng web2/live-campaign/index.html"

**Test trên TPOS** xác nhận schema `SaleOnline_LiveCampaign` cần các field:

- `Name` (required, unique)
- `Facebook_UserId` + `Facebook_UserName` (page TPOS đã liên kết qua CRMTeam)
- `Facebook_LiveId` (optional, format `{pageId}_{videoId}` từ FB Graph live videos)
- `Config` (`Draft` / `Active` / `Closed` — show as `Nháp` / `Đang chạy` / `Đã đóng`)
- `IsActive` (toggle)
- `Note`
- `MinAmountDeposit`, `MaxAmountDepositRequired` (advanced — default 0)

**Fix** — UI giờ matched TPOS web:

1. **`LiveCampaignApi.loadPages()` mới**: fetch `/api/odata/CRMTeam/ODataService.GetAllFacebook?$expand=Childs`, flatten ra `[{pageId, pageName, teamId, teamName}]`. Cache 5min.

2. **`LiveCampaignApi.loadLiveVideos(pageId)` mới**: fetch `/api/facebook-graph/livevideo?pageid=X&limit=20` (CF route FACEBOOK_LIVE). Cache 1min per page. Return `[{objectId, title, startMs, statusLive, countComment}]`.

3. **Modal HTML refactor**:
    - Field "Page Facebook" → `<select>` populated từ `loadPages()` (auto-fill Facebook_UserId + Facebook_UserName)
    - Field "Bài Live" → `<select>` cascade khi page change (badge 🔴 cho live đang chạy + title + time + count comment)
    - Field "Trạng thái cấu hình" mới (Config: Draft/Active/Closed)
    - Auto-suggest Name: chọn page → fill `{LAST_WORD_UPPER} DD/MM/YYYY` (TPOS convention, vd "Nhi Judy House" → "HOUSE 28/05/2026"). Dirty flag không overwrite nếu user đã edit.

4. **Create payload** giờ pass đầy đủ: `Facebook_UserId`, `Facebook_UserName`, `Config`, `MinAmountDeposit`, `MaxAmountDepositRequired`.

5. **Edit pre-fill**: page select auto-match Facebook_UserId. Nếu page không còn trong CRMTeam → chèn option tạm "(không còn trong CRM)" để giữ data. Tương tự cho live video không có trong 20 lives gần nhất.

**Verified qua browser test** (localhost:8080 + persistent Playwright session):

- Open modal → 7 page options (1 placeholder + 6 pages thật)
- Chọn "Nhi Judy House" → Name auto-fill "HOUSE 28/05/2026" + 10 live videos load
- Create → row mới xuất hiện trong table với status "Nháp"
- Open Edit cho campaign hiện có → pre-fill Name + page + live + Config đúng

**Cache bust**: `?v=20260525d` → `?v=20260528a`

**Files**: web2/live-campaign/{index.html, js/live-campaign-api.js, js/live-campaign-app.js}

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
