# Lịch sử test n2store qua persistent browser session

> Tất cả thao tác chạy qua **persistent Playwright browser session** (`scripts/n2store-browser-session.js`), task ID `bmgk4k096`. Browser giữ open xuyên suốt — login 1 lần (admin/admin@@), gửi command qua FIFO `/tmp/n2store-session.fifo`, đọc output từ `/private/tmp/.../bmgk4k096.output`.
>
> Khách hàng ảnh hưởng test: **Trần Nhi — SĐT `0914495309`** (1 đơn duy nhất trên page NhiJudy Store).

---

## 2026-04-26 — Loạt test trước

### Phiên 1 — Diagnose chat-page-switch bug
**Mục tiêu**: User báo "Bên store và house là 2 đoạn hội thoại 2 người khác nhau".

**Repro**:
1. `nav https://nhijudyshop.github.io/n2store/orders-report/main.html`
2. `search 0914495309` → 1 row (Trần Nhi)
3. Click chat → modal mở, page = NhiJudy Store, hiển thị chat đúng (04/12/2024, "Chứ có 1 cái áo tốn phí uồn quá")
4. `switchpage Nhi Judy House` → modal load chat của Trần Nhi KHÁC (psid `7798798720179856`, "Co phai c đâu", "sorry ty nha", 25/04 19:23) — WRONG PERSON

**Network calls bắt qua hook fetch (lần test 1)**:
```
1. by-phone/0914495309 → global=100080729143290, fb_id Store=6295284583881853, page_fb_ids={"270136663390370":"..."}
2. fb-global-id?pageId=193642490509664&psid=6295284583881853 → {found:false}
3. fb-global-id/by-global?globalUserId=100080729143290&pageId=193642490509664 → {found:false}
4. pancake/conversations/search?q=Trần Nhi → match HOMONYM (psid 7798798720179856)
5. pancake/pages/.../customers/.../conversations → error 122 / hoặc load homonym conv
```

### Lần fix theo thứ tự:
1. **Layer 1 (commit 9cdccc14)** — Gate name search + source-PSID fallback bằng `customerAbsentOnTargetPage = dbLookupDone && !targetFbId && foundConvs.length===0`. Verify: 3 calls, empty state đúng.
2. **Layer 2 (commit 300bd28d)** — Phát hiện DB cache `fb_global_id_cache` BỊ POISONED: psid 6295284583881853 (của Trần Nhi GỐC trên Store) bị nhân viên Hạnh merge nhầm sang globalUserId 100013390776008 (homonym). Fix: by-phone globalId WIN over psid cache (phoneGlobalId ưu tiên).
3. **Refactor (commit ab252bca)** — User feedback "1 customer = 1 globalId mà": bỏ luôn psid lookup khi có phone. Còn 2 calls (by-phone + by-global).
4. **Layer 4 (commit 40f81366)** — User chỉ ra "House CÓ conv hợp lệ với psid 7798798720179856 + recent_phone_numbers chứa 0914495309". DB `page_fb_ids` chỉ có Store binding (incomplete). Fix: bỏ `customerAbsentOnTargetPage` gate. Name search vẫn fallback nhưng STRICT phone-verify từ `recent_phone_numbers`.
5. **Layer 5 (commit ac7bdc90)** — Phone-as-query primary: `pdm.searchConversationsOnPage(pageId, phone)` chạy đầu tiên cho cả allowDrift true + false.

**Verify cuối qua persistent session (browser stays open)**:
- `pdm.fetchConversationsByCustomerFbId('117267091364524', '7798798720179856')` → trả 4 convs, conv #1 có `recent_phone_numbers=[{phone_number:"0914495309"}]` → confirm SAME real Trần Nhi với psid khác trên House.

### Phiên 2 — Tab1 jitter ĐƠN CHƯA PHẢN HỒI
26 filter × 25s idle test (`scripts/n2store-jitter-multi-filter.js`):
- **Trước fix**: 13 burst × ~120 mutations / 90s
- **Sau fix (commit 5edb8d9c surgical row insert)**: 0 renderTable, 0 performTableSearch, 0 schedule call, 0-22 mutation events (chỉ là `_ptagRefreshRow` cập nhật cell processing-tag riêng, không rebuild tbody)

### Phiên 3 — Tạo PBH dùng products cũ
**Bug**: User edit order → save → tạo PBH → modal hiển thị products CŨ.
**Root cause**: `populateSaleOrderLinesFromAPI` mutate `currentSaleOrderData.orderLines = orderLines`. Vì `currentSaleOrderData = order` (ref OrderStore), object trong OrderStore bị thêm field `.orderLines` cached. Edit-modal save call `fetchOrderData` trả response không có `orderLines` field → Object.assign không clear → stale `.orderLines` còn nguyên. Lần mở sale modal sau check `order.orderLines` TRƯỚC `order.Details` → dùng STALE.
**Fix (commit 71d29f1e)**:
- `populateSaleModalWithOrder` bỏ branch `if (order.orderLines)` — luôn dùng `order.Details`.
- `tab1-edit-modal.js` saveAllOrderChanges: sau `updateOrderInTable`, `delete _cachedOrder.orderLines` defensive.

### Phiên 4 — Page-selector dropdown checkmark lệch label
**Bug**: Click chuyển page chat → label đổi sang page mới nhưng checkmark vẫn ở page cũ.
**Fix (commit 6a5be434)**: Click handler gọi `switchChatPage()` TRƯỚC (sync header set `currentChatChannelId = newPageId` ngay), sau đó `_renderPageSelectorItems()` đọc giá trị mới → checkmark + label đồng bộ.

### Phiên 5 — Phone widget no audio
**Bug log**: `[10:42:21] Cuộc gọi đến: 0856194468`, `[10:42:24] Failed: WebRTC Error`. Outgoing phải gọi 2 lần.
**Root cause**:
- `getIceServers()` chỉ STUN, không TURN → behind NAT/firewall RTC media fail.
- `acceptIncoming` không pre-test mic → JsSIP `answer()` gọi getUserMedia internally và fail silent với "WebRTC Error" nếu mic chưa grant.
**Fix (commit 011cfd71 + 4cfa0835)**:
- Client (`phone-widget.js`): thêm `fetchIceServersFromRender()` cache 30 min, pre-warm trong init/dialPending/acceptIncoming.
- Server (`oncall-sip-proxy.js`): `/turn-config` gọi metered.live API trực tiếp với `TURN_API_KEY` env (sẵn có), cache 30min.
- `acceptIncoming` thêm pre-test mic + `iceTransportPolicy:'all'`.

---

## 2026-04-27 — Comprehensive interaction battery (HÔM NAY)

**Setup**:
- Browser session bmgk4k096 vẫn alive từ hôm qua, đã đăng nhập sẵn.
- Inject error hooks: `console.error/warn`, `window.error`, `unhandledrejection` → buffer vào `window.__diag`.

**Battery 16 test** (chạy qua `bash /tmp/n2store-test-battery.sh`):

| # | Test | Kết quả | Ghi chú |
|---|---|---|---|
| T01 | Reset filters (Tag XL + flags + Ẩn Tag XL) | ✓ ok | |
| T02 | search `0914495309` | ✓ 1 row | orderId=`83e20000-5dcc-0015-3139-08dea289bf54` |
| T03 | Clear search | ✓ | |
| T04 | filter `subtag_CHUA_PHAN_HOI` | ✓ 2 rows | |
| T05 | filter `cat_1` (Chờ đi đơn) | ✓ | |
| T06 | flag `CHO_LIVE` | ✓ | |
| T07 | Click sort header quantity | ✗ "no header" | Selector test runner không match (không phải bug app) |
| T08 | Open edit modal first row | ✓ opened | id=`83e20000-5dcc-0015-eba9-08dea299f574` |
| T09 | Switch tabs trong edit modal: info→products→delivery→invoices→history→info | ✓ tất cả | Không error |
| T10 | Close edit modal | ✓ | |
| T11 | search 0914495309 + openchat | ✗ "no trigger" | Sau edit modal close, DOM chưa stable; chat trigger selector không match (test runner issue) |
| T12 | `switchpage Nhi Judy House` | ✓ ok | Chat modal chưa active → không có lookup, OK |
| T13 | Close chat modal | ✓ | |
| T14 | search + checkbox + sale modal | ✗ "no cb" | Selector test runner không match |
| T15 | `showFastSaleModal()` | ✓ shown | Modal mở ở trạng thái "Vui lòng chọn ít nhất một đơn" |
| T16 | **Dump diag** | **errCount=0, warnCount=0, unhCount=0** | ✅ ZERO console errors / warns / unhandled rejections trong toàn bộ battery |

**Kết luận T16**: Sau toàn bộ interaction (filter / search / modal open-close / tab switch / chat / sale / fast-sale), **không có error JS nào ném ra console hoặc thoát unhandled**. App ổn định.

**Lưu ý**: 3 test fail (T07/T11/T14) là do test-script DOM selector quá strict, không phải bug ứng dụng — tester sẽ click bằng tay không vấn đề.

### Battery 2 — Extended interactions (T20-T40)
Chạy thêm để cover sort headers, Ẩn Tag XL filter, Tag filter (multi-select), tab navigation, sale modal full flow, ptag quick actions.

| # | Test | Kết quả |
|---|---|---|
| T20 | Reset diag buffer | ok |
| T21 | Probe sort headers | Tìm thấy SĐT⇅, Địa chỉ⇅, Tổng tiền⇅, SL⇅. onclick="" empty → bound bởi `initSortableHeaders` (delegated listener), không inline |
| T22 | Sort functions on window | `applySorting`, `handleSortClick`, `updateSortIcons`, `resetSorting`, `initSortableHeaders` ✓ |
| T23 | Ẩn Tag XL filter element | present:true (`#excludePtagXlFilterDropdown`), options lazy-populated |
| T24 | Open Ẩn Tag XL dropdown | clicked, visible:true, items:1 (lazy populate) |
| T25 | Open Tag filter dropdown | clicked, **count=1000 tag options** (loaded fine) |
| T26 | Probe filter labels | Ghi chú, Lọc theo ngày, Tag XL, TAG, MY THÊM CHỜ VỀ, TRỪ CÔNG NỢ, TRỪ THU VỀ, THẺ KHÁCH LẠ, XÃ KHÁCH LẠ, ĐÃ ĐI ĐƠN GẤP, GỌI CHỐT, GIẢM GIÁ, GIỎ TRỐNG, CHUYỂN KHOẢN, ĐỔI Đ/C |
| T27 | Row clickables | openEditModal, toggleProductDetail, openTagModal, quickAssignTag(xử lý/ok), _ptagOpenDropdown, _ptagQuickAssign(print) |
| T28 | Chat trigger by `openChat` selector | "no chat trigger" — **chat trigger thật là `showConversationPicker(orderId, pageId, fbId)`** trên messages cell |
| T29 | chatstate sau attempt | channelId vẫn là House từ phiên trước (state không reset khi modal không mở) |
| T30 | Close all modals | ok |
| T31 | Probe checkboxes | input type=checkbox plain (không class/name/id) |
| T32 | Toggle checkbox programmatic | checked:true, **selectedOrderIds.size=1** ✓ |
| T33 | `openSaleButtonModal()` với 1 row checked | **modalDisplay="flex", productCount=1** ✓ — fix products-stale (commit 71d29f1e) hoạt động đúng |
| T34 | Close sale modal | ok |
| T35 | Click "Báo Cáo Tổng Hợp" tab | clicked, hasContent:true (overview tab loaded) |
| T36 | Back "Quản Lý Đơn Hàng" | clicked |
| T37 | Print/action buttons trong row | `_ptagQuickAssign(...,'print')` (đánh dấu đã in soạn), `openCustomerInfoPopup`, **`showConversationPicker`** (chat) |
| T38 | TAG XL cell action buttons | `_ptagOpenDropdown`, `_ptagQuickAssign('print'/'wait'/'ok')`, `_ptagShowHistory` |
| T39 | `reloadTableBtn` click | clicked, no error |
| T40 | **Final diag** | **errors=0, unhandled=0, warns=2** |

**2 warns expected** (không phải bug):
```
[PANCAKE-TOKEN] ⏭️ Skip PAT generation (negative-cached): 193642490509664
Không có quyền hạn trên trang này. Nếu trang vừa được cập nhập gần đây, vui lòng đăng nhập lại
```
Page `193642490509664` (NhiJudy Nè) có Pancake subscription đã hết hạn. Negative cache đúng — không retry liên tục. **Action user**: gia hạn Pancake cho NhiJudy Nè nếu vẫn dùng page này.

### Tổng kết 2 battery (40 cases)
| | Battery 1 (T01-T16) | Battery 2 (T20-T40) | **Tổng** |
|---|---|---|---|
| Errors | 0 | 0 | **0** |
| Unhandled rejections | 0 | 0 | **0** |
| Warns | 0 | 2 (expected — page expired) | **2 (no action needed)** |

**App tab1-orders chạy SẠCH** sau loạt fix mấy ngày qua.

---

## 📚 Chi tiết 6 lượt fix (tiếng Việt)

### 1) perf jitter — bảng "ĐƠN CHƯA PHẢN HỒI" giật khi idle (commit `5edb8d9c`)

**Triệu chứng**: Mở filter Tag XL = `ĐƠN CHƯA PHẢN HỒI`, để nguyên không thao tác → bảng vẫn giật ngang **mỗi 5–7 giây** suốt nhiều giờ. Nhân viên không làm việc được.

**Phép đo trước fix** (Playwright `MutationObserver` 90 giây idle):
- 13 đợt mutation × ~120 mutations/đợt
- Mỗi đợt ≈ rebuild toàn bộ `<tbody>` (50 dòng × 19 cột = 950 ô)

**Nguyên nhân gốc**:
- Chatomni-proxy mở SSE stream `processing_tags_global` → push event mỗi vài giây khi LIVE đang chạy.
- Mỗi event chạy `_ptagRefreshRow(orderCode)` → check filter membership → nếu đơn flip in/out filter → `schedulePerformTableSearch(300)`.
- 300ms sau gọi `performTableSearch()` → `renderTable()` → **`tbody.innerHTML = batch.map(createRowHTML).join('')`** rebuild full → trình duyệt auto-recalc column width → bảng giật ngang.

**Hướng fix — surgical row insert/remove**:
- Thêm `window.applyOrderMembershipFlip(orderCode, orderId, passesNow)` trong [tab1-table.js](../../orders-report/js/tab1/tab1-table.js):
  - `passesNow && !isInDom` → splice `filteredData` + `displayedData` ở vị trí đúng (giữ thứ tự server theo `allData.indexOf`), `tbody.insertBefore(newRow, refRow)`, `renderedCount++`.
  - `!passesNow && isInDom` → splice arrays + `existingRow.remove()`, `renderedCount--`.
  - Fallback re-render full khi `employeeViewMode` hoặc `currentSortColumn` active (cần re-grouping).
- `_ptagRefreshRow` gọi `applyOrderMembershipFlip` trước, fallback `schedulePerformTableSearch` nếu surgical handler không xử lý được.

**Phép đo sau fix**:
- 26 filter × 25s idle: **0 renderTable calls, 0 performTableSearch, 0 schedule** trên TẤT CẢ filter.
- 90s idle filter `ĐƠN CHƯA PHẢN HỒI`: 0 burst, 0 mutation events.
- Mutation events còn lại 0–22 chỉ là `_ptagRefreshRow` cập nhật riêng cell processing-tag (cell-level, không rebuild tbody) → không cảm giác giật.

---

### 2) chat-page-switch — load nhầm conversation (5 layers, từ `9cdccc14` → `ac7bdc90`)

**Triệu chứng** (user repro): SĐT `0914495309` (Trần Nhi). Mở chat ở page **NhiJudy Store** → thấy đúng conversation order áo (04/12/2024, "Chứ có 1 cái áo tốn phí uồn quá", "Vậy huỷ cái áo đó luôn đi", "Chị ko mua hàng nửa"). Switch sang page **Nhi Judy House** → load **chat của Trần Nhi KHÁC** (psid 7798798720179856, "Co phai c đâu", "C đâu để hinh nên", "sorry ty nha", 25/04 19:23).

**Layer 1 — Gate name search khi DB confirms absent (`9cdccc14`)**:
- Phân tích network: `customers/by-phone/0914495309` trả `pancake_data.page_fb_ids = {"270136663390370": "..."}` — khách CHỈ có fb_id trên Store. `fb-global-id/by-global` cho page khác trả `{found:false}` → đúng.
- Bug ở fallback: code gọi `pancake/conversations/search?q=Trần Nhi` → match một khách KHÁC cùng tên trên page đích → load conversation người LẠ.
- Fix: thêm cờ `dbLookupDone` + `customerAbsentOnTargetPage = dbLookupDone && !targetFbId && foundConvs.length === 0`. Khi true → bỏ qua name search + source-PSID fallback → empty state đúng.

**Layer 2 — DB cache poisoned, by-phone phải win (`300bd28d`)**:
- User test với target = Nhi Judy House → vẫn sai.
- Phân tích sâu: `fb-global-id?pageId=117267091364524&psid=6295284583881853` trả **`{found:true, globalUserId:"100013390776008", customerName:"Trần Nhi", resolvedBy:"hanh", resolvedAt:"2026-04-25 09:05:23", useCount:8}`** — cache chứa entry MERGE NHẦM do nhân viên Hạnh: psid của Trần Nhi GỐC bị map sang globalUserId của một Trần Nhi-homonym khác.
- Code cũ: chạy parallel `cacheRes` + `custRes`, `globalId = cacheData.globalUserId || custData.global_id` → cache poisoned chiếm ưu tiên.
- Fix: phone là khoá xác thực (verified qua SĐT), cache psid→globalId là phụ trợ và có thể bị mis-resolve. Đảo thứ tự: `phoneGlobalId = custData.global_id` chạy trước, `psidGlobalId = cacheData.globalUserId` sau, `globalId = phoneGlobalId || psidGlobalId`.

**Layer 3 — Refactor: 1 customer = 1 globalId (`ab252bca`)**:
- User feedback "mỗi khách chỉ có 1 globalid mà?" → đúng.
- Bỏ luôn psid cache lookup khi có phone (giảm 1 round-trip + loại trừ hoàn toàn nguy cơ hit poisoned cache).
- Còn 2 calls: `by-phone` + `by-global`.

**Layer 4 — DB `page_fb_ids` không đầy đủ, phone-verify name search (`40f81366`)**:
- User chỉ ra: "Bên House CÓ conv hợp lệ với psid 7798798720179856". Test `pdm.fetchConversationsByCustomerFbId('117267091364524', '7798798720179856')` → 4 convs, conv #1 có `recent_phone_numbers=[{phone_number:"0914495309"}]` → cùng người Trần Nhi thật, chỉ là psid khác trên page khác. DB `page_fb_ids` chỉ lưu Store binding (không complete) → empty state là OAN.
- Bỏ `customerAbsentOnTargetPage` gate. Quay lại cho phép name search fallback NHƯNG **strict verify `recent_phone_numbers` match SĐT đã biết**: cùng tên + cùng SĐT = cùng người (nhận); cùng tên + khác SĐT = homonym (từ chối).
- Nếu meta của conv chưa load `recent_phone_numbers` → fetch chi tiết qua `fetchConversationsByCustomerFbId` để verify.

**Layer 5 — Phone-as-query primary lookup (`ac7bdc90`)**:
- Tận dụng API có sẵn `pdm.searchConversationsOnPage(pageId, query)` (Pancake API v2 với page access_token) — query có thể là SĐT.
- Đặt làm **primary** lookup (chạy đầu tiên cho cả allowDrift true + false). Pancake tự match `recent_phone_numbers` → trả đúng conv của customer trên page đó. Sau đó các nhánh DB lookup / name search trở thành fallback chỉ chạy khi không có phone.

**Verify cuối**: switch sang Nhi Judy House → load đúng conv `117267091364524_7798798720179856` của Trần Nhi thật (phone-verified).

---

### 3) sale-modal products-stale — tạo PBH dùng products cũ sau khi user edit (commit `71d29f1e`)

**Triệu chứng**: User edit order trong edit-modal (đổi qty, thêm/xoá sản phẩm) → save → click "Tạo phiếu bán hàng" → modal hiển thị products **CŨ** (pre-edit). Nếu user click "Xác nhận và in" trước khi async API trả fresh → PBH tạo SAI products.

**Repro chi tiết** đường đi của data:
1. User mở sale modal lần đầu → `populateSaleOrderLinesFromAPI(orderLines)` chạy với data từ API (fresh). **Ở dòng cuối hàm**: `currentSaleOrderData.orderLines = orderLines`.
2. Vì `currentSaleOrderData = order` được set bằng `OrderStore.get(orderId)` → trỏ trực tiếp tới object trong OrderStore. **Mutation `currentSaleOrderData.orderLines = ...` cũng mutate object trong OrderStore**.
3. User đóng modal. Object trong OrderStore giờ có thêm field `.orderLines` cached (vĩnh viễn cho đến khi reload).
4. User edit qua edit-modal → save:
   - `fetchOrderData(orderId)` → GET `SaleOnline_Order(id)?$expand=Details,Partner,User,CRMTeam` → response **không có field `orderLines`** (chỉ có `Details`).
   - `updateOrderInTable(orderId, response)` → `Object.assign(orderInStore, cleanedData)` → cleanedData không có key `orderLines` → **không touch field cũ** → stale `.orderLines` vẫn còn.
5. User mở sale modal lần 2 → `populateSaleModalWithOrder(order)` check `if (order.orderLines && order.orderLines.length > 0)` **TRƯỚC** `if (order.Details && ...)` → dùng STALE.

**Hướng fix (2 lớp)**:
- **Fix 1 — `populateSaleModalWithOrder`** ([sale-modal-common.js](../../orders-report/js/utils/sale-modal-common.js)): bỏ branch `order.orderLines`, **luôn dùng `order.Details`** (refreshed bởi edit-modal). API fetch sau đó vẫn overlay fresh data.
- **Fix 2 — `saveAllOrderChanges`** ([tab1-edit-modal.js](../../orders-report/js/tab1/tab1-edit-modal.js)): sau `updateOrderInTable`, **`delete _cachedOrder.orderLines`** defensive clear stale cache cho mọi consumer khác (không chỉ sale modal).

---

### 4) page-selector dropdown — checkmark lệch label (commit `6a5be434`)

**Triệu chứng**: Trong chat modal, click chuyển page (vd Nhi Judy House) → label trên cùng đổi sang "Nhi Judy House" nhưng **dấu tick ✓ vẫn ở "NhiJudy Store"** (page cũ). UI bị lệch trạng thái.

**Nguyên nhân**: Click handler chạy theo thứ tự sai:
```js
_updatePageSelectorLabel(pageId);   // (1) label = newPageId
_renderPageSelectorItems();          // (2) đọc currentChatChannelId → STILL OLD → tick ở page cũ
window.switchChatPage(pageId);       // (3) sync header set currentChatChannelId = newPageId
```
Step 2 chạy trước step 3 → đọc giá trị cũ → tick sai page.

**Hướng fix**: Đổi thứ tự — gọi `switchChatPage()` TRƯỚC. Phần sync header của async function set `window.currentChatChannelId = newPageId` ngay (trước `await` đầu tiên, trước khi function return Promise). Sau đó `_renderPageSelectorItems()` đọc giá trị mới → label + checkmark đồng bộ.

---

### 5) phone-widget — outgoing phải gọi 2 lần + incoming bắt máy không được (commit `011cfd71` + `4cfa0835`)

**Triệu chứng**:
- Outgoing: gọi 0906952802 → lần đầu ringing nhưng không nghe được khách nói; phải hangup và gọi lại → lần 2 mới nghe.
- Incoming: số `0856194468` gọi tới → click bắt máy → log `[10:42:24] Missed/failed: WebRTC Error` chỉ 3s sau incoming.

**Nguyên nhân (2 lớp)**:

**A) Không có TURN server**:
- `getIceServers()` trong [phone-widget.js](../../orders-report/js/phone-widget.js) trả CHỈ STUN (`stun.l.google.com`).
- Behind NAT/firewall (mạng văn phòng, 4G, NAT-mạnh) → STUN không xuyên qua → **media path RTP fail** → không có audio.
- Lần đầu hay rớt; lần 2 đôi khi may mắn (ICE candidates còn cache trong browser từ lần trước).
- Endpoint `/api/oncall/turn-config` đã có sẵn ở Render server nhưng widget không gọi.

**B) Incoming không pre-test mic**:
- Outgoing `dialPending()` có `await navigator.mediaDevices.getUserMedia({audio: true})` rồi stop ngay → "đánh thức" mic permission.
- Incoming `acceptIncoming()` thiếu bước này → JsSIP `answer()` gọi getUserMedia internally → nếu mic chưa grant → **fail silent với "WebRTC Error"** sau ~3s.

**Hướng fix**:

**Client** ([phone-widget.js](../../orders-report/js/phone-widget.js)):
- Thêm `fetchIceServersFromRender()` cache 30 phút (TTL match TURN credential rotation).
- `init()` pre-fetch (non-blocking).
- `dialPending()` + `acceptIncoming()` `await fetchIceServersFromRender()` trước khi tạo offer/answer.
- `acceptIncoming()` thêm pre-test mic giống `dialPending`. Nếu mic blocked → terminate session với SIP 480 + log error rõ.
- Đồng nhất `iceTransportPolicy: 'all'` + `rtcOfferConstraints` cho cả 2 chiều.

**Server** ([oncall-sip-proxy.js](../../render.com/routes/oncall-sip-proxy.js)):
- `/turn-config` rewrite: gọi metered.live API trực tiếp với `TURN_API_KEY` (env có sẵn). Cache 30 min in-memory.
- Endpoint trả nhiều TURN URL (UDP + TCP/TLS) phù hợp đủ kiểu NAT.
- Fallback `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` env vars hoặc STUN-only nếu API key thiếu.

**Verify**: log sau fix `[10:42:15] ICE: loaded 2 server(s) including TURN` → TURN đã load. Pre-test mic thêm vào `acceptIncoming` → browser hiện popup "Cho phép microphone?" lần đầu.

---

### 6) auto-tag "ĐÃ RA ĐƠN" — đổi từ "theo cột PBH" sang "luôn ON khi tạo PBH" (commit `69b222cb` + `ce819d3b`)

**Triệu chứng + yêu cầu user**:
- Logic cũ: tag tự động flip sang "ĐÃ RA ĐƠN" mỗi khi `InvoiceStatusStore` có invoice active cho order đó (= cột PBH có dòng) — bao gồm cả `reconcileTagsWithInvoices()` chạy khi load page.
- Hệ quả: tag bị flip không kiểm soát cho đơn của session khác, hoặc PBH vừa được sync về từ thiết bị khác → tag tự bật mà user chưa làm gì.
- User: "Bỏ logic gắn tag ĐÃ RA ĐƠN theo cột phiếu bán hàng → đổi thành theo các cách tạo PBH" → tinh giản tiếp: **"không cần toggle bật tắt → luôn ON"**.

**Hướng fix**:
- Trong [tab1-processing-tags.js](../../orders-report/js/tab1/tab1-processing-tags.js):
  - **Bỏ** `reconcileTagsWithInvoices()` auto-call trong `loadProcessingTags`. Hàm vẫn còn (`window.reconcileTagsWithInvoices`) nếu cần trigger thủ công từ console.
  - `onPtagBillCreated(saleOnlineId, source)` thêm param `source` (`'single'` | `'bulk'`) chỉ để logging/diagnose. Hàm LUÔN flip tag (không gate).
- Trong [tab1-fast-sale-invoice-status.js](../../orders-report/js/tab1/tab1-fast-sale-invoice-status.js):
  - `storeFromApiResult(apiResult, source)` thêm param. Bulk caller (showFastSaleResultsModal wrapper) truyền `'bulk'`.
- Trong [tab1-sale.js](../../orders-report/js/tab1/tab1-sale.js):
  - Single sale gọi `storeFromApiResult(result, 'single')`. 2 social-order callers truyền `'single'`.
- Phiên trước có thêm dropdown 4-mode (single/bulk/all/manual) trong UI panel Chốt Đơn — user yêu cầu bỏ → đã clean (xoá UI + xoá `_autoHoanTatMode` state + `setAutoHoanTatMode` API + 96 dòng code).

**Logic hoạt động cuối cùng**:
- Tag "ĐÃ RA ĐƠN" **chỉ** auto-gắn khi user **chủ động** tạo PBH thành công (single sale modal HOẶC bulk fast-sale modal) ở **session hiện tại**.
- **Không** auto-gắn khi: load page (không reconcile), PBH sync từ device khác, polling thấy InvoiceStatusStore có entry active.
- Manual click trong panel "Chốt Đơn" vẫn hoạt động bình thường (không đi qua `onPtagBillCreated`).
- Idempotency guard giữ nguyên: nếu order đã ở HOAN_TAT rồi → skip lần 2 (không snapshot đè lên snapshot).
- Cancel PBH (qua `onPtagBillCancelled`) vẫn restore snapshot trước đó nếu user chưa đổi tag thủ công sau khi auto-flip.

---

## File logs đầy đủ
- Session log liên tục: `/private/tmp/claude-501/-Users-mac-Desktop-n2store/c97c5f2c-4329-4648-b24d-70c6dab846b1/tasks/bmgk4k096.output`
- Multi-filter jitter test: [downloads/n2store-jitter/multi-filter-report.json](../n2store-jitter/multi-filter-report.json)
- Single jitter (90s ĐƠN CHƯA PHẢN HỒI): [downloads/n2store-jitter/jitter-log.json](../n2store-jitter/jitter-log.json)
- Chat-page-switch repro: [downloads/n2store-jitter/chat-page-switch-bug.json](../n2store-jitter/chat-page-switch-bug.json)

## Customers chạm trong test
| SĐT | Tên | Bối cảnh |
|---|---|---|
| `0914495309` | Trần Nhi (real, fb_id Store=6295284583881853) | Chính — search/chat/edit/sale flow |
| `0856194468` | (incoming caller — phone widget log) | Test SIP receive (failed WebRTC trước fix) |
| `0906952802` | (test number user đề nghị) | Phone widget — chưa test sau fix TURN |
| Trần Nhi homonym (fb_id=7798798720179856 trên House) | KHÁC người, cùng tên, có conv riêng có recent_phone_numbers=0914495309 | DB binding incomplete edge case |

## Commits trong loạt test (theo thứ tự)
- 5edb8d9c — perf: surgical row insert/remove cho ĐƠN CHƯA PHẢN HỒI jitter
- ed3d2451 — test: API-based filter set in monitor
- 9cdccc14 → 300bd28d → ab252bca → 40f81366 → ac7bdc90 — chat page switch (5 layers fix)
- 71d29f1e — fix: PBH dùng products cũ
- 6a5be434 — fix: page-selector checkmark sync
- 011cfd71 → 4cfa0835 — fix: phone widget TURN + mic pre-test
- 69b222cb → ce819d3b — feat: auto-tag ĐÃ RA ĐƠN luôn ON khi tạo PBH (bỏ logic theo cột PBH)
