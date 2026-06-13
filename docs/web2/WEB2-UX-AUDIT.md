# Web 2.0 — UX Audit & Modernization Roadmap

> Nguồn: workflow audit 5-agent (2026-06-13) đọc HTML+JS từng trang, đối chiếu best-practice (Linear/Notion/Stripe/Intercom).
> **119 phát hiện** · 29 high-impact · 7 global-fix.

## Phân bố theo lĩnh vực

| Area            | #   |
| --------------- | --- |
| mobile          | 17  |
| keyboard        | 16  |
| discoverability | 15  |
| loading         | 15  |
| forms           | 12  |
| feedback        | 10  |
| empty-state     | 9   |
| consistency     | 9   |
| error-handling  | 8   |
| performance     | 6   |
| other           | 2   |

## ✅ Đã làm (global + nền tảng)

- Re-skin theme chung sang xanh Zalo + bo góc/shadow/motion/skeleton/focus (commit `584cd3291`).
- Command Palette Ctrl/⌘K toàn cục (commit `570a1f855`).
- Mobile: bảng rộng auto cuộn ngang ≤760px (safety net mọi trang).
- Toast: auto-load `notification-system.js` qua sidebar → mọi trang có `notificationManager`.
- Sẵn class dùng chung: `.w2-skel` (skeleton shimmer), `.is-busy` (spinner nút).

## 🟥 High-impact còn lại (per-page) — checklist

- [ ] **all** (loading) [global]: Không có skeleton loading. Tất cả 4 trang (notifications, audit-log, users-permissions, livestream-poller) dùng plain text 'Đang tải…' hoặc 'Đang tải danh sách
    - → Thay placeholder text bằng 2-3 `.w2-skel` rows có chiều cao giống row thật khi page bắt đầu fetch. Ví dụ notifications: trong `notiList` init innerHTML nên là 3 skeleton rows thay vì `<div class='noti
- [ ] **audit-log** (loading): Page load không tự động fetch data — người dùng phải bấm nút 'Tải' thủ công. Initial state tbody hiển thị 'Bấm "Tải"…' thay vì tự load với filter mặc định. So v
    - → Trong `DOMContentLoaded`, gọi `load()` ngay sau `Web2Sidebar.mount(...)` với giá trị filter mặc định (entity='', không giới hạn date). Nút 'Tải' giữ nguyên cho re-filter thủ công. Đây là một dòng thêm
- [ ] **audit-log** (error-handling): Hàm `load()` ở audit-log không có try/catch. Nếu fetch thất bại (network error, 500), exception throw ra không được bắt — tbody vẫn hiện 'Bấm Tải…' cũ, không có
    - → Wrap toàn bộ body của `load()` trong try/catch. Khi catch: render một row `<tr><td colspan='7'>Không tải được dữ liệu. <button onclick='load()'>Thử lại</button></td></tr>`. Đồng thời dùng `notificatio
- [ ] **audit-log** (mobile): Table `audit-tbl` có 7 cột (Thời gian, Entity, ID, Action, User, Page, Changes) nhưng không có `overflow-x: auto` wrapper hoặc `@media` breakpoint nào trong inl
    - → Bọc `<table class='audit-tbl'>` trong `<div style='overflow-x:auto'>`. Thêm `@media (max-width:768px)` để ẩn cột Page và ID hoặc stack layout. Shared theme đã có `.scrollable-mobile` pattern (web2-the
- [ ] **ck-dashboard** (mobile): `.ckd-cols` uses `grid-template-columns: repeat(auto-fit, minmax(300px, 1fr))` with no explicit breakpoint. On a 360px phone, `minmax(300px, 1fr)` collapses to
    - → Add `@media (max-width: 640px) { .ckd-cols { grid-template-columns: 1fr; } .ckd-main { padding: 12px 16px; } }` to stack columns vertically on mobile. Also ensure `.ckd-hist-filter` wraps its inputs o
- [ ] **dashboard/** (loading): KPI cards display literal '…' text on initial render while data loads. The shared skeleton class `.w2-skel` exists in `web2/shared/web2-theme.css` but is never
    - → Replace the static '…' placeholder values with skeleton shimmer elements using the existing `.w2-skel` class before `load()` is called. For the table, render 3–5 skeleton rows with animated shimmer so
- [ ] **dashboard/** (error-handling): The `catch` block in `load()` calls only `console.warn(err)` and returns silently. On network failure or API error (`d.success === false`), the page stays froze
    - → In the catch block, call `window.notificationManager?.show('Không tải được Dashboard KPI. Thử lại sau.', 'error')` — the notification system is available on other pages and can be added here. Also add
- [ ] **kpi/** (loading): `refresh()` sets `root.innerHTML = '<div class="kpi-empty"><p>Đang tải…</p></div>'` — a plain text loading state with no visual spinner or progress cue. Campaig
    - → Add a spinner inside `kpi-empty` during `refresh()` (there is a Lucide icon loader available). For the campaign dropdown, show a temporary disabled option 'Đang tải chiến dịch…' and re-enable after `r
- [ ] **kpi/** (error-handling): `loadKpi()` and `loadEvents()` have no try/catch. If the API returns a non-ok HTTP status or throws a network error, the `refresh()` function will throw an unha
    - → Wrap the `await loadKpi()` and `await loadEvents()` calls inside `refresh()` in a try/catch. On error, render an error message inside `#kpiContent` with a retry button (`<button onclick='refresh()'>Th
- [ ] **native-orders/** (empty-state): renderRows() does not render any empty-state UI when STATE.orders.length === 0. The tbody is simply left empty — no icon, no message, no filter-reset CTA.
    - → Add an empty-state row in renderRows(): when orders array is empty, inject a full-width cell with a lucide 'inbox' icon, 'Chưa có đơn nào' text, and a 'Xóa bộ lọc' button that resets channel/status/ca
- [ ] **report-revenue/** (loading) [global]: On initial load, `#kpiGrid` shows 'Đang tải KPI...' as italic gray text and chart/table panels show '...' — these are text placeholders, not skeleton shapes. Th
    - → Replace the text-only loading placeholders with skeleton shimmer blocks using `.w2-skel`. For `#kpiGrid` render 6 skeleton card shapes; for chart areas render a shimmer rectangle of the expected heigh
- [ ] **so-order/** (discoverability): The double-click-to-edit cell behavior is entirely invisible. It is only mentioned in the title tooltip of the 'Chỉnh sửa bảng' toggle button. There is no inlin
    - → When edit-table mode is active, apply cursor: cell and a subtle :hover background tint to editable cells. Add a one-line hint element just above the table visible only in edit-table mode reading 'Bấm
- [ ] **so-order/** (loading): soTableBody is empty on page load with no loading state. The initial data fetch happens after DOMContentLoaded but there is no spinner or skeleton row in the HT
    - → Before calling the first data load, inject a loading row into soTableBody with a spinner and 'Dang tai...' text. Remove it once renderTableBody() fires.
- [ ] **supplier-debt** (loading): No loading indicator while `loadAll()` fetches Firestore (so-order) and server ledger in parallel. `sdTableBody` starts empty in the HTML. The table shows nothi
    - → Before `await loadAll()` in `init()`, inject a loading row into `sdTableBody`: `<tr><td colspan='8' style='text-align:center;padding:32px;color:#64748b;'>Đang tải dữ liệu…</td></tr>`. Clear it in `app
- [ ] **supplier-debt** (forms): Date range pickers (Từ ngày / Đến ngày) require the user to click 'Áp dụng' to take effect. There is no `change` event listener wired to `sdDateFrom` or `sdDate
    - → Add `change` event listeners to `sdDateFrom` and `sdDateTo` that call `readFilters(); STATE.page = 1; loadAll().then(applyFilterAndRender)`. This matches balance-history behavior and removes the extra
- [ ] **supplier-debt** (mobile): Only 1 `@media` breakpoint at `920px` exists in `styles.css`. The main table has 8 columns (STT, expand, Mã NCC, Tên NCC, Nợ đầu kỳ, Phát sinh, Thanh toán, Nợ c
    - → On mobile (<640px), collapse numeric columns into a single row summary or use a card-per-supplier layout instead of a table. At minimum, add `overflow-x: auto` on `.sd-table-wrap` and hide less critic
- [ ] **supplier-wallet** (loading): No loading indicator during initial data fetch. `init()` calls `SupplierWalletStorage.load()` + `loadAndRender()` async, but `swList` div starts empty in HTML w
    - → Insert a loading placeholder into `swList` before calling `loadAndRender()`, e.g. a shimmer skeleton of 3-4 card outlines, or at minimum a centered spinner with text 'Đang tải danh sách NCC…'. Remove
- [ ] **users-permissions** (error-handling): Dùng `alert()` native của browser cho 3 trường hợp: 'Chọn user trước', 'Lưu thành công', và các error (line 273-299). `alert()` block JavaScript thread, không c
    - → Thay toàn bộ `alert(...)` bằng `notificationManager.show(msg, type)` hoặc `Web2Optimistic.run(...)`. 'Chọn user trước' → toast warning. 'Lưu thành công' → toast success. Lỗi HTTP → toast error. Đây là
- [ ] **users-permissions** (mobile): Permission matrix table có 2 cột (Trang | Quyền), cột Quyền dùng `display:flex` với nhiều checkbox/label inline. Trên mobile, `.acts-cell` sẽ wrap nhưng table f
    - → Thêm `@media (max-width: 768px)` để switch layout: table → dạng accordion hoặc list, với cột Trang chiếm 100% width và checkbox group ở dưới. Hoặc ít nhất wrap table trong div overflow-x:auto.
- [ ] **web2/customer-wallet/** (discoverability): Có 2 nút 'Reload' và 'Hard reset' cạnh nhau ở header (line 46-63 HTML). 'Hard reset' title='Hard reset: clear localStorage + reload' là thao tác mạnh nhưng khôn
    - → Đổi 'Hard reset' thành 'Xoá cache' với icon trash-2 và màu warning (amber/orange), đặt cách xa nút Reload. Confirm dialog nên dùng custom modal hoặc Web2Popup thay vì native confirm() để có thể thêm g
- [ ] **web2/customers/** (feedback): saveModal() đóng modal TRƯỚC khi gọi API (line 375: closeModal() trước runFn()), không dùng Web2Optimistic. Nếu API thất bại, modal đã đóng và chỉ có toast lỗi.
    - → Không đóng modal trước khi có kết quả API. Thay vào đó: disable nút Lưu + hiện spinner trong nút, await API, nếu thành công thì closeModal(), nếu lỗi thì giữ modal mở + hiện lỗi trong wcModalError div
- [ ] **web2/customers/** (feedback): Chức năng 'Gộp KH trùng' dùng native confirm() 2 lần với text dài (line 433-436): lần đầu confirm để chọn KH nào làm chính, lần 2 ngầm hiểu. Native confirm() kh
    - → Thay bằng custom modal 2-step: bước 1 preview 2 KH với thông tin đầy đủ + radio chọn KH chính, bước 2 confirm action. Cùng pattern với Web2Popup đã có trong codebase (dùng window.Popup.confirm như pro
- [ ] **web2/products/** (keyboard): Modal không có Enter-to-save. Chỉ có Esc-to-close (line 1524-1526) và Enter trên search filter (line 1487), nhưng không có keydown listener nào trong modal để s
    - → Thêm vào init(): document.addEventListener('keydown', e => { if (e.key === 'Enter' && modal()?.classList.contains('active') && !e.isComposing) { const active = document.activeElement?.tagName; if (act
- [ ] **web2/products/** (forms): Modal 'Thêm SP' focus vào ô NCC (pmSupplier select) thay vì ô Tên sản phẩm (pmName) khi mở create (line 792: focus pmSupplier). NCC thường được auto-fill bởi au
    - → Trong openCreate(), đổi setTimeout(() => $('#pmSupplier')?.focus(), 50) thành setTimeout(() => $('#pmName')?.focus(), 50). NCC vẫn hiển thị đầu tiên trong layout nhưng tên SP là field user nhập tay đầ
- [ ] **web2/products/** (mobile): File web2-products.css không chứa @media query nào (grep trả về rỗng). Bảng có 11 cột (checkbox, #, ảnh, mã, tên, biến thể/tồn, giá mua, giá bán, ghi chú, trạng
    - → Thêm @media (max-width: 768px) ẩn các cột ít quan trọng (giá mua, ghi chú, thứ tự STT) và thêm @media (max-width: 640px) để chuyển bảng sang dạng card hoặc cuộn ngang có scroll-hint rõ ràng.
- [ ] **web2/reconcile/** (mobile): The split layout (.rc-layout with .rc-list-panel and .rc-detail-panel side-by-side) has no responsive media query. On screens narrower than ~900px both panels w
    - → Add @media (max-width: 768px) { .rc-layout { flex-direction: column; } .rc-list-panel, .rc-detail-panel { width: 100%; } }. Consider a tab-style toggle on mobile to switch between list and detail pane
- [ ] **web2/returns/** (keyboard): returns-app.js has zero keyboard event handling. No Escape to cancel/clear selection, no Enter to submit the form when btnSubmit is enabled, no keyboard shortcu
    - → Add a document keydown listener: Escape clears the selected customer (clearCustomer()) when one is selected. Enter triggers btnSubmit.click() when it is not disabled and the create tab is active.
- [ ] **web2/returns/** (performance): Creating a return requires a minimum of 7 sequential discrete interactions: type+pick customer, pick method, pick issue, pick subtype, pick order, pick items, p
    - → Pre-select the most common defaults on load (method=shipper_gui and issue=van_de_khach are already pre-selected in init — good). Add auto-scroll to the next uncompleted section after each selection. W
- [ ] **web2/variants/** (mobile): File web2-variants.css không có @media query nào. Modal có min-width: 480px (hardcoded inline style HTML line 140) — trên màn hình nhỏ hơn 480px modal sẽ vượt v
    - → Thêm trong CSS: .modal-content { min-width: min(480px, calc(100vw - 32px)); } cùng với @media (max-width: 640px) cho bảng variants ẩn cột 'Thứ tự' và 'Viết tắt' hoặc chuyển sang card layout.

## 🟧 Medium/Low — theo trang (rút gọn)

### all

- [ ] _medium_ (consistency): 5 trong 6 trang (trừ photo-studio) không có `notificationManager` load — notifications, audit-log, users-permissions thiếu script

### audit-log

- [ ] _medium_ (keyboard): Filter input `fUser` (text) và `fFrom`/`fTo` (date) không có Enter key handler. Workflow tự nhiên là: gõ filter → Enter → xem kết
- [ ] _medium_ (discoverability): Filter `fUser` chỉ có `placeholder='User…'` — không rõ đây là search theo tên, username, hay user_id. Filter date `fFrom`/`fTo` kh
- [ ] _medium_ (performance): Limit hardcode `q.set('limit', '200')` — 200 rows render innerHTML cùng lúc, mỗi row có `<pre class='diff'>` với JSON. Không có pa
- [ ] _medium_ (other): Diff column (Changes) hiển thị `JSON.stringify(it.changes, null, 2)` bị `.slice(0, 600)` — data bị cắt không báo. User nhìn pre bl
- [ ] _low_ (empty-state): Empty state 'Không có data' khi filter trả về rỗng không giải thích lý do: không có record nào cho filter hiện tại, hay server lỗi

### balance-history

- [ ] _medium_ (discoverability): The header action bar has 6 buttons (Nạp tay, Reprocess chưa gán, Tự động gán, Hội thoại, Xét duyệt CK, Tải lại) with no visual gr
- [ ] _medium_ (mobile): There are zero `@media` queries in `web2-balance-history.css`. The toolbar row (search input + date range + date presets + CSV but
- [ ] _medium_ (performance): `window.lucide.createIcons()` is called on every `renderTable()`, `renderStats()`, and `renderChips()` execution — including on ev
- [ ] _low_ (empty-state): When no transactions match filters, the table shows 'Không có giao dịch phù hợp' as a plain text table cell with no icon, no expla
- [ ] _low_ (feedback): When `autoReprocessOnLoad()` runs silently on page load and finds 0 newly matched transactions (the common case), it produces no f

### ck-dashboard

- [ ] _medium_ (loading): The three kanban columns (Chờ duyệt / Đã duyệt / Yêu cầu khác) start completely empty in HTML and show 'Trống.' immediately via `r
- [ ] _medium_ (keyboard): No keyboard handling at all: no Escape to dismiss any modal or panel opened by `Web2CkReview.openReview()`, no Tab-navigable tab s
- [ ] _medium_ (feedback): Stats bar shows counts derived only from `items.length` (capped at `PAGE=10` per column, plus any 'Tải thêm' loads). The comment i
- [ ] _medium_ (error-handling): In `loadHistory()`, the catch block is `/* ignore */` — if the history fetch fails, the column remains showing the previous data o

### dashboard/

- [ ] _medium_ (discoverability): The KPI card values for 'SP sắp hết hàng' (stock < 5) and 'Ví KH âm' (balance < 0) are clickable numbers that presumably lead to f
- [ ] _medium_ (feedback): The description text under the heading says 'cache 30s · subscribe SSE' — this is implementation detail exposed to end users, not
- [ ] _medium_ (mobile): The `.dash-row` grid has a breakpoint at 880px to go single-column, but the `.kpi-grid` uses `repeat(auto-fit, minmax(220px, 1fr))

### kpi/

- [ ] _medium_ (empty-state): When a campaign has no KPI data (`!rows.length && !uF && !uA`), the empty state shows only 'Chưa có KPI nào trong chiến dịch này.'
- [ ] _medium_ (keyboard): The campaign `<select>` is the primary input, but after page load focus is not set to it. A user must Tab multiple times (past sid
- [ ] _medium_ (forms): The campaign `<select>` dropdown (`#kpiCampaignFilter`) initially renders server-side with a single placeholder option. There is n

### livestream-poller

- [ ] _medium_ (keyboard): Form thêm trang (lpPageId, lpPageName, lpPageUrl) không có Enter key handler. Cần click chuột vào nút '+ Thêm trang'. `lpPageId` k
- [ ] _medium_ (discoverability): Stat số '…' (lpStat) hiển thị tổng comment nhưng không có context: đây là tổng từ trước đến nay hay tháng này? Không có filter. Nú
- [ ] _medium_ (forms): Form thêm trang (lpPageId là required) không validate realtime — chỉ check khi bấm nút: `if (!pageId) return notify('Nhập Page ID'

### native-orders/

- [ ] _medium_ (loading): load() only shows the spinner when !hasExistingRows. SSE-triggered reloads (the common case after the first load) silently replace
- [ ] _medium_ (keyboard): The edit modal (editOrderOverlay) has no Escape key handler. The campaign dropdown popup has no keyboard navigation — no role=list
- [ ] _medium_ (discoverability): Action column buttons (edit pencil, receipt, x-octagon/cancel, split) are icon-only. Context is only available via the HTML title
- [ ] _medium_ (mobile): The bulk action bar has 5 buttons (Gộp đơn, Tạo PBH, PBH SHOP, In bill, Gửi tin nhắn) in a single flex row. On screens narrower th
- [ ] _low_ (forms): openEdit() does not set autofocus on the first input (editCustomerName) after the modal opens. Keyboard users must manually tab to

### notifications

- [ ] _medium_ (error-handling): Hàm `load()` ở notifications không có try/catch bao ngoài. Nếu fetch thất bại, exception uncaught — notiList giữ nguyên 'Đang tải…
- [ ] _medium_ (mobile): `.noti-toolbar` dùng `flex-wrap: wrap` — OK. `.noti-row` dùng flex gap — OK. Nhưng không có `@media` nào trong inline style — phụ
- [ ] _medium_ (empty-state): Empty state chỉ là `<div class='noti-empty'>Không có thông báo</div>` — text đơn giản, không có icon, không có CTA. Khi filter 'Ch
- [ ] _medium_ (performance): Fetch `limit=100` hardcode — toàn bộ 100 notifications được render innerHTML một lúc, không có pagination hay virtual scroll. Khi
- [ ] _low_ (keyboard): Notification rows dùng `<a>` tag nhưng onclick handler không trả về `true` hoặc không cho phép `Enter` key trên element (event chỉ

### overview/

- [ ] _medium_ (discoverability): The overview page is a long documentation page (400+ lines in HTML) with anchor links in a table of contents, but the TOC is rende
- [ ] _low_ (consistency): The hero statistics section shows hardcoded numbers: '13 trang có badge', '9 bảng web2\_\*', '10+ SSE realtime topic', '3 pipeline c

### pancake-settings

- [ ] _medium_ (keyboard): Modal `credsModal` (Tự động gia hạn) không có Esc key handler. Modal `expiryModal` có (line 441) nhưng `credsModal` thì không — in
- [ ] _low_ (discoverability): Instruction thủ công để lấy JWT token (F12 → Console → copy command) rất dài và kỹ thuật. Đây là fallback khi extension không hoạt
- [ ] _low_ (consistency): Pancake settings dùng font Manrope + Inter, CSS variables `--ps-*` prefix riêng, style inline `<style>` dài 740 dòng trong HTML —

### photo-studio

- [ ] _medium_ (feedback): Loading spinner `psStageLoading` và text `psLoadingText` ('Đang xử lý…') đã có sẵn và được dùng. Tuy nhiên khi AI cloud engine (wi
- [ ] _low_ (mobile): Brush size slider (`psBrushSize`) trong brush-bar không có aria-label hay visual label hiển thị size hiện tại. Chỉ có số pixels tr

### report-delivery/

- [ ] _medium_ (keyboard): Date range inputs (`#rdFrom`, `#rdTo`) require the user to manually type or pick dates, then click 'Áp dụng'. There is no Enter ke
- [ ] _medium_ (loading): During `loadStats()` the only loading indicator is a small inline spinner appended to `#rdLoader` in the header. The main content
- [ ] _medium_ (mobile): The KPI grid uses `grid-template-columns: repeat(5, 1fr)` — 5 equal columns with no responsive breakpoint. On mobile this will squ
- [ ] _medium_ (feedback): When `from > to` dates are entered, the code silently swaps them without any user notification. The user does not know their input
- [ ] _low_ (consistency): This page loads `web2-sidebar.js` but does not load `web2-theme.css` or `web2-sse-bridge.js`. All other pages in this audit load b

### report-revenue/

- [ ] _medium_ (error-handling): When `loadAll()` catches an error it updates only `#kpiGrid` with a red error message. The other 4 sections (`#revenueChart`, `#to
- [ ] _medium_ (keyboard): The date range buttons (7 ngày / 30 ngày / 90 ngày / 365 ngày) are `<button>` elements (good), but there is no keyboard shortcut t
- [ ] _medium_ (discoverability): The '👤' button in the Top customers 360° table opens a customer modal, but the button has only `title='Xem khách 360°'` and an ico
- [ ] _medium_ (mobile): The `.panels` grid uses `grid-template-columns: 2fr 1fr` at all widths — there is no responsive breakpoint for this layout. On scr
- [ ] _medium_ (performance): The custom bar chart in `#revenueChart` is rendered with hand-built `<div class='bar'>` elements with CSS tooltip via `:hover { .t

### so-order/

- [ ] _medium_ (keyboard): Modals (soOrderModal, tab-settings modal) use a [data-so-close] click handler on the backdrop for closing, but no Escape key liste
- [ ] _medium_ (mobile): The create-order form row (so-form-row-top) places 8 fields (NCC, Ngay tao, ETA, Dot, So Kien, Tong KG, Tien HD, Tien te) in a sin
- [ ] _low_ (consistency): The tab-settings modal footer places the 'Xoa tab' danger button first (leftmost), immediately before Cancel and Save. Every other

### supplier-debt

- [ ] _medium_ (keyboard): Modals (Ghi chú NCC, Thanh toán NCC, Tạo NCC) have no Enter-to-submit keyboard shortcut. The only keyboard handler in the page is
- [ ] _medium_ (discoverability): The payment action button in each table row uses a 💳 emoji and the note button uses ✏️ emoji — no text label, no aria-label beyond
- [ ] _medium_ (forms): The Thanh toán modal opens with `sdPayAmount` focused via `setTimeout(() => document.getElementById('sdPayAmount')?.focus(), 30)`
- [ ] _low_ (consistency): The page title in `<head>` is 'Công nợ NCC - Báo cáo - WEB 2.0' but the `<h1>` reads 'Công nợ Nhà Cung Cấp'. The `<script>` block

### supplier-wallet

- [ ] _medium_ (keyboard): Pay modal (`swPayModal`) and Return modal (`swReturnModal`) have no Enter-to-submit. Only `swCreateModal` has Enter wired to `conf
- [ ] _medium_ (empty-state): When the list is empty, `swEmptyState` shows 'Chưa có NCC nào — tạo đơn ở Sổ Order để bắt đầu.' with a link. However, there is als
- [ ] _medium_ (mobile): The supplier-wallet CSS (`supplier-wallet.css`) has zero `@media` queries. The detail drawer's purchase table has 7 columns and th
- [ ] _medium_ (forms): The Pay modal (`swPayModal`) opens with `swPayAmount` pre-filled with `0` and no autofocus. The user must click the input, clear t
- [ ] _low_ (consistency): The `<script>` for `web2-page-meta` is also absent from `supplier-wallet/index.html`, so no breadcrumb appears. Additionally the p

### users-permissions

- [ ] _medium_ (loading): Khi load users (dropdown) hoặc loadRegistry thất bại im lặng (catch {} rỗng ở line 155, 184). Matrix permBody hiện 'Không tải được
- [ ] _medium_ (feedback): Sau khi chọn role template từ dropdown (line 263), table được re-render ngay — nhưng không có visual feedback nào cho user biết te
- [ ] _medium_ (discoverability): Nút 'Xoá tất cả' (btnClear) nằm ngay cạnh 'Áp role template' dropdown — không có confirmation dialog, không có tooltip giải thích.
- [ ] _low_ (forms): Khi không có user nào trong dropdown (empty users list hoặc 401 case), toàn bộ permission matrix vẫn hiển thị với tất cả checkboxe

### web2/customer-wallet/

- [ ] _medium_ (keyboard): Detail modal (cwDetailModal) không có Tab focus trapping — khi modal mở, Tab sẽ thoát ra ngoài modal và focus vào các card ở backg
- [ ] _medium_ (empty-state): cwEmptyState (line 141-149 HTML) hiện khi không có KH nào và chỉ hiện với filter 'all'. CTA trong empty state trỏ đến '/native-ord
- [ ] _medium_ (loading): Khi load() chạy, renderList() được gọi với state.loading=true và hiển thị '<div class="cw-loading">Đang tải…</div>' (line 409) xóa
- [ ] _medium_ (feedback): Khi click vào card KH để mở detail, không có visual loading indicator trong modal trong khi đang fetch PBH orders (fetchPbhListFor
- [ ] _medium_ (consistency): Trang customer-wallet dùng card layout (sw-card với data-phone click handler) thay vì table như 3 trang kia (products, variants, c

### web2/customers/

- [ ] _medium_ (discoverability): Nút 'Gộp KH trùng' (wcMergeBtn) bị disabled theo mặc định và chỉ enable khi chọn đúng 2 checkbox. Không có hint nào giải thích tại
- [ ] _medium_ (mobile): customers.css có @media (max-width: 640px) (line 829) nhưng cột 'FB identity', 'Địa chỉ', 'Đơn / Chi tiêu' vẫn chiếm nhiều không g
- [ ] _medium_ (loading): Khi load() đang chạy, không có visual indicator trên toolbar/header — chỉ tbody hiển thị 'Đang tải…' div (line 84 sẽ show error, n
- [ ] _low_ (forms): Modal 'Thêm khách hàng' có quá nhiều field (~20 field) hiển thị cùng lúc: tên, SĐT chính, email, SĐT phụ (động), tier, nhà mạng, đ

### web2/products/

- [ ] _medium_ (error-handling): Khi load() thất bại (network error), error row chỉ hiển thị text tĩnh 'Lỗi tải: ...' trong tbody (line 544-547), không có nút Retr
- [ ] _medium_ (forms): Validation chỉ chạy khi bấm Lưu (saveModal line 977-988), không có real-time feedback trên các ô bắt buộc. Lỗi báo qua toast thay
- [ ] _medium_ (discoverability): Tính năng 'In tem' đơn lẻ (nút printer icon trên mỗi row) không có label, chỉ có icon. Bulk selection bar cũng chỉ hiện khi đã chọ
- [ ] _medium_ (performance): Usage badge cho tất cả sản phẩm trên trang được tải trong một background fetch sau khi bảng render (line 385-406). Trong khi đó, m
- [ ] _low_ (consistency): source-pill hiển thị 'web2_products' (tên DB table kỹ thuật) trong page header (line 52 HTML). Tương tự customers hiển thị 'Kho ri

### web2/reconcile/

- [ ] _medium_ (loading): loadList() performs an async fetch but does not set any loading state on rcPbhList before the fetch completes. The ul remains empt
- [ ] _medium_ (other): returnFailedOrder() chains window.prompt() (enter a reason) followed immediately by window.confirm() — two sequential native brows
- [ ] _medium_ (feedback): toggleManualPick() uses window.confirm() for the manual-tick confirmation. While the audit-trail intent is correct, native confirm

### web2/returns/

- [ ] _medium_ (forms): custSearch has no autofocus on page load (create tab). After pickCustomer() resolves and form sections become visible, focus stays
- [ ] _medium_ (discoverability): When pickCustomer() is called, formSections and rightBody transition from hidden to visible with no animation or scroll-into-view.
- [ ] _low_ (empty-state): The list tab empty state renders 'Chua co phieu thu ve.' as plain text with no icon and no CTA. Users who land on this tab find no

### web2/variants/

- [ ] _medium_ (keyboard): Modal variants không có Enter-to-save. Chỉ có Esc-to-close (line 429-431) và search filter Enter (line 404-406). Sau khi điền xong
- [ ] _medium_ (forms): Ô 'Viết tắt' (shortCode) không có autofocus khi blur từ 'Giá trị biến thể' và shortcode còn rỗng — có auto-suggest khi blur vmValu
- [ ] _low_ (empty-state): Khi filter nhóm lọc không có kết quả, empty-row hiển thị 'Chưa có biến thể nào — bấm "Thêm Biến Thể" để tạo' (line 44-46). Text nà

## Lộ trình đề xuất

1. **Đợt A (global, xong phần lớn):** theme + palette + mobile-table + toast + skeleton/busy class.
2. **Đợt B (per-page high-impact):** lần lượt fix checklist 🟥 theo trang traffic cao (products, variants, customers, dashboard, so-order, reconcile, supplier-debt, returns, report-revenue). Mỗi trang: thêm skeleton khi load, Esc/Enter modal, error+retry, autofocus đúng, empty-state thân thiện, mobile @media.
3. **Đợt C (medium/low):** consistency, discoverability tooltip, giảm friction multi-step.
