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

## 2026-05-15

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
- Sidebar: thêm "Sổ Order" trong group Sale Online ở [web2-shared/tpos-sidebar.js:139](../web2-shared/tpos-sidebar.js#L139).

**Tính năng**:

- Default 2 tab: HÀ NỘI (VND), HƯƠNG CHÂU (CNY rate 3500). User add thêm: TOKYO/JPY, USD, KRW, THB, EUR.
- Giá Bán/Nhập tab non-VND → hiển thị 2 dòng: raw (vd "50,00 CNY") + quy đổi (vd "≈ 175.000₫").
- Footer: Tổng SL auto, Giảm Giá + Phí Ship input (lưu per-tab), Tổng tiền VNĐ = Σ(sellPrice × qty × rate) − discount + shipping.
- Trạng thái 4 giá trị, default Nháp khi tạo mới.
- Click ảnh → lightbox; ESC đóng modal; image upload soft cap 2MB.

**Bỏ thanh `.tab-navigation`**:

User shot rằng thanh tab top "Đơn Web / TPOS × Pancake / Kho SP" rendering xấu (link mặc định không có style) và trùng chức năng sidebar trái. Bỏ trên các trang dùng cross-page navigation:

- [native-orders/index.html:40-69](../native-orders/index.html#L40-L69) → thay bằng `<header class="page-head-mini">` giữ `#totalCounter` (JS line 174 ref) + source pill.
- [web2-products/index.html:37-66](../web2-products/index.html#L37-L66) → tương tự.
- [orders-report/main.html:590](../orders-report/main.html#L590) — **KHÔNG đụng**, đó là feature tabs nội bộ (`switchTab('orders'|'product-assignment'|'overview'|'pending-delete'|'kpi-commission')`), không phải cross-page navigation.

**Add CSS shared** ở [web2-shared/web2-effects.css](../web2-shared/web2-effects.css) (cuối file): `.page-head-mini`, `.page-head-title`, `.page-head-counters` — dùng chung mọi trang.

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
- **Client** ([tpos-pancake/js/pancake/pancake-realtime.js:144-200](../tpos-pancake/js/pancake/pancake-realtime.js#L144-L200), [web2-shared/web2-realtime.js:390-415](../web2-shared/web2-realtime.js#L390-L415)):
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

**Port browser-direct mode** ([web2-realtime.js](../web2-shared/web2-realtime.js)):

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
- [web2-realtime.start()](../web2-shared/web2-realtime.js): drop `_started` flag, dùng `_lastStartedKey = sorted(pageIds).join('|')` — sub-set khác → re-call broker; sub-set giống → no-op.
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

1. **Page settings cache** ([web2-chat-client.js fetchPageSettings](../web2-shared/web2-chat-client.js)):
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

- [web2-chat-client.js](../web2-shared/web2-chat-client.js): thêm `fetchPageSettings(pageId, opts)` route `${WORKER_URL}/api/pancake/pages/{pageId}/settings?access_token=${jwt}`. Cache 5 phút trong `_pageSettingsCache` Map. Trả `{ ok, settings: { tags: [{id, text, color}], quick_replies, page_access_token, … } }`.
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

1. [web2-chat-client.js:`searchConversations(pageId, query, opts)`](../web2-shared/web2-chat-client.js) — POST proxy qua CF Worker `/api/pancake/...`. Body bỏ luôn + bỏ `Content-Type` để tránh CORS preflight trên `multipart/form-data` (browser cross-origin từ localhost → CF Worker required preflight). Hỗ trợ `AbortSignal` để cancel keystroke cũ khi gõ tiếp.

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
- [web2-shared/web2-chat-client.js](../web2-shared/web2-chat-client.js) — thêm `fetchConversationsByPage(pageId, opts)`.

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

**Thay đổi** ([web2-shared/web2-chat-client.js](../web2-shared/web2-chat-client.js)):

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

1. **In-memory cache `fetchConversations`** ([web2-chat-client.js:113-135](../web2-shared/web2-chat-client.js#L113-L135)): cache theo `(pageId, fbId)` TTL 5 min. Re-open modal cho cùng customer: 150ms → ~0ms.
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

- `web2-shared/web2-chat-client.js` — `fetchMessages` ký thêm `opts.currentCount`
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

- `web2-shared/web2-realtime.js` (~200 lines) — `window.Web2Realtime`:
    - `subscribe({ types, onEvent, debounceMs })` — pattern y hệt `PbhRealtime`
    - `start({ pageIds })` — POST `/api/realtime/start` với JWT + userId từ JWT decode (chỉ cần khi server lần đầu setup)
    - `fetchPendingCustomers(limit)` — GET `/api/realtime/pending-customers`
    - `markReplied(psid, pageId)` — POST `/api/realtime/mark-replied`
    - WS connect `wss://n2store-realtime.onrender.com` với exponential backoff reconnect
    - Zero code shared với `tpos-pancake/js/realtime-manager.js`
- `web2-shared/web2-new-msg-badge.js` (~280 lines) — `window.Web2NewMsgBadge`:
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
- `web2-shared/web2-chat-client.js` mở rộng — thêm token-write API:
    - `setJwt(token, expiry?)`, `decodeJwt(token)`
    - `setPageAccessToken(pageId, token, meta?)`, `getAllPageAccessTokens()`
    - `clearAllTokens()`
    - `listPages()` — gọi `/api/pancake/pages?access_token=<jwt>`
    - `generatePageAccessToken(pageId)` — gọi `/api/pancake/pages/{id}/generate_page_access_token`
- `web2-shared/tpos-sidebar.js` — thêm menu item "Pancake (Token)" trong group "Cấu hình" (Web 2.0-only, không có TPOS counterpart).

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

1. Tạo `web2-shared/web2-chat-client.js` — module standalone, expose `window.Web2Chat`:
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

- `web2-shared/web2-chat-client.js` (NEW, ~290 lines)
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

**Y/c 1 — Toggle ẩn/hiện sidebar** ([web2-shared/tpos-sidebar.js](../web2-shared/tpos-sidebar.js) + [.css](../web2-shared/tpos-sidebar.css)):

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
- `web2-products/` (36 KB)
- `web2-shared/` (136 KB — sidebar, popup, page-builder, delivery picker, …)
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

**Fix** ([web2-shared/popup.js](../web2-shared/popup.js)):

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

**Module mới** ([web2-shared/delivery-method-picker.js](../web2-shared/delivery-method-picker.js)):

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

**Module** ([web2-shared/popup.js](../web2-shared/popup.js)):

- API Promise-based: `Popup.alert(msg, opts)` → void, `Popup.confirm(msg, opts)` → boolean, `Popup.prompt(msg, opts)` → string|null
- Convenience: `Popup.success/error/warning/info(msg)` — alert có type pre-set
- Options: `title`, `type` ('info'|'success'|'warning'|'error'|'question'), `okText`, `cancelText`, `defaultValue`, `placeholder`, `multiline`
- Lucide icon theo type (info/check-circle/alert-triangle/alert-octagon/help-circle)
- Keyboard: Enter = OK (Ctrl+Enter trong multiline), Escape = Cancel, click backdrop = Cancel
- Animation: fade-in backdrop 120ms + pop 180ms (cubic-bezier expo-out)
- Idempotent (`if (window.Popup) return;`)

**Auto-load** ([web2-shared/tpos-sidebar.js](../web2-shared/tpos-sidebar.js)):

- Top of IIFE: `autoLoadPopup()` resolves `./popup.js` relative to `document.currentScript.src` → inject `<script>` vào `<head>` async=false
- Mọi trang Web 2.0 đã include `tpos-sidebar.js` (qua `page-shell.js` hoặc trực tiếp) tự động có `window.Popup` sẵn sàng — không cần sửa từng HTML
- Fallback: nếu Popup chưa load (mạng chậm), mọi callsite có pattern `window.Popup ? Popup.confirm(...) : Promise.resolve(confirm(...))`

**Callsites đã migrate** (~25 chỗ):

- `web2/fastsaleorder-invoice/pbh-app.js` — detail alert, confirm/cancel/delivery/refund/bulk action/resetStt + `w2pConfirm/w2pAlert/w2pPrompt` helpers
- `web2/fastsaleorder-refund/rf-app.js` — detail alert + changeState confirm
- `web2/fastsaleorder-delivery/dlv-app.js` — detail alert + changeState confirm
- `native-orders/js/native-orders-app.js` — resetStt confirm/alert, removeOrder confirm, createPbh (custom form, xem dưới)
- `web2-products/js/web2-products-app.js` — remove SP confirm
- `web2-shared/page-builder.js` — generic record delete confirm
- `web2-shared/tpos-sidebar.js` — `alertSoon` fallback
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
- [web2-shared/pbh-realtime.js](../web2-shared/pbh-realtime.js): shared WS client + debounce 500ms + auto-reconnect exponential backoff (max 30s).
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

## 2026-05-12

### [orders][kpi] Loại đơn Hủy bỏ + nút "Đối soát" trong modal NV (cache 7 ngày)

**Trigger user**: Tab KPI - HOA HỒNG, modal "Chi tiết KPI" hiển thị đơn phiếu **Hủy bỏ** (vd `260500568 / NJD/2026/65477`) **vẫn cộng 5.000đ KPI** + trạng thái "— chưa check". Hỏi: "chưa check" là gì? tại sao đơn hủy có trong đây?

**Trả lời**:

- **"chưa check"** = cột TRẠNG THÁI (recon pill) khi reconciliation chưa chạy (`reconRan=false`). Click "Đối soát" → chuyển sang ✓ OK / ↩ Đã hoàn / ⚠ Sai lệch.
- **Đơn Hủy bỏ vẫn cộng KPI**: logic cũ CHỈ exclude đơn có invoice nằm trong **refund excel**. Phiếu `ShowState='Huỷ bỏ'` / `IsMergeCancel` / `State='cancel'` không được detect ⇒ vẫn tính KPI gross.

**Fix**:

- `_isInvoiceCancelled(invoice)` helper: detect 5 trường hợp (`State='cancel'`, `StateCode='cancel'`, `IsMergeCancel`, `ShowState='Huỷ bỏ' | 'Hủy bỏ'`).
- `_getKpiExclusionKind(orderId, recon) → 'refund' | 'cancel' | null` — refund cần recon, cancelled detect ngay từ invoice cache.
- `renderEmployeeOrdersTable`: tách 2 status pill — `✗ Hủy bỏ` (đỏ) cho cancelled, `↩ Đã hoàn` cho refund. Cả 2 đều excluded khỏi KPI gross (`okOrders++` chỉ khi `!isExcluded`).
- `renderKPITable` (main): pre-compute cancelled loss từ invoice cache (KHÔNG cần recon); `lossInfo.kpiLost = max(reconLoss, cancelledKpi)` tránh đếm trùng. Hiển thị cell "Loại" ngay sau load (trước đó phải chờ recon).
- `_indexReconResults`: thêm cancelled vào refundedSet khi tính `kpiLost` per-user.
- Per-employee reconciliation trong modal L1:
    - Nút "Chạy đối soát" trong header modal (icon `check-check`, gradient tím).
    - Click → worker pool concurrency 6 chỉ reconcile đơn của user này (KHÔNG cần đối soát toàn page).
    - Lưu cache 7 ngày trong localStorage `kpi_recon_l1_v1__<userId>` (TTL 604800000ms).
    - Mở lại modal trong 7 ngày → tự apply cache (label = "Đối soát lại" + badge "Đã đối soát X phút/giờ/ngày trước").
    - `_hydrateL1ReconCachesForEmployees`: trước render main table, load cache cho mọi user → KPI thực reflect ngay sau reload page.
- Đổi label: "Đơn hoàn" → "Đơn loại", "Bị loại (refund)" → "Bị loại (loại)", header table "Hoàn" → "Loại".

**Test localhost** (admin@@, port 8080, employee `hanh` 30 ngày):

- Trước fix: Tổng 25 / OK 25 / KPI Gross 150.000đ / KPI Thực 150.000đ ❌
- Sau fix (chưa recon): Tổng 26 / OK 24 / Đơn loại 2 / KPI Gross 150.000đ / Bị loại 5.000đ / KPI Thực **145.000đ** ✓
- Sau click "Chạy đối soát": phát hiện thêm 2 refund (đơn 184, 344) → Tổng 27 / OK 23 / Đơn loại 4 / KPI Thực **140.000đ** ✓
- Cache localStorage verified: `kpi_recon_l1_v1__hanh` savedAt=Date.now(), ttlMs=604800000, results=45.
- Đóng modal → mở lại → label "Đối soát lại", info "Đã đối soát vừa xong", KPI thực giữ 140.000đ KHÔNG cần re-run ✓.

Files: `orders-report/js/tab-kpi-commission.js` (+396), `orders-report/tab-kpi-commission.html` (+30), `orders-report/css/tab-kpi-commission.css` (+78).

Status: ✅ Deploy commits `fc1f0c06` → `87f4a65b` → `0761cc06`.

---

### [native-orders] STT global tự tăng + endpoint reset

**Trigger user**: STT cột trong list `native-orders` luôn hiển 1 vì xài `session_index` (per-customer counter). User muốn: tạo đơn từ `tpos-pancake` → STT +1 toàn cục, có nút reset về 1.

**Fix**:

- Postgres SEQUENCE `native_orders_display_stt_seq` + column `display_stt INTEGER` (migration 068 nội tuyến trong `ensureTables`).
- Backfill: DO $$ … nextval(...) UPDATE đơn cũ theo `created_at ASC` (one-shot, IF NULL).
- `POST /from-comment` insert `display_stt = nextval('native_orders_display_stt_seq')` — atomic, không lo race.
- `POST /reset-stt { renumber? }`:
    - `renumber=false` (default): `ALTER SEQUENCE … RESTART WITH 1` — đơn cũ giữ STT, đơn mới tiếp = 1.
    - `renumber=true`: RESTART + loop UPDATE tất cả đơn theo `created_at ASC` → 1..N.
- Frontend: thêm button `#btnResetStt` + confirm() chọn mode. Render `o.displayStt ?? o.sessionIndex` (fallback) bold.

**Verify live**: GET /load → 7 đơn STT 1..7 (cũ nhất 24/04=1, mới nhất 12/05=7). POST /reset-stt {} → next nextval=1. POST /reset-stt {renumber:true} → renumbered 7.

Status: ✅ deploy live commit `4da0eadc`.

---

### [orders] Hardening: chặn user click "Tạo đơn TPOS" 2 lần bằng nhiều lớp DOM

**Trigger**: Sau commit 883ff0a2 (3-layer guard), vẫn chưa chứng minh nguyên nhân duplicate là double-click hay TPOS internal bug. Đề phòng trường hợp double-click, thêm 4 lớp DOM-level — không thể physical click 2 lần được.

**4 lớp mới** ([purchase-orders/js/main.js](../purchase-orders/js/main.js)):

1. **`{ once: true }` trên listener**: Auto-remove sau lần fire đầu — queued click thứ 2 không tìm được handler.
2. **Synchronous `hasFired` guard**: Re-entry check ngay đầu hàm — chặn rapid click cùng tick.
3. **Replace button → static span**: Ngay khi click, `btn.replaceWith(span)` — DOM button không còn để click.
4. **Disable form trong modal**: Mọi input/button/select/textarea `disabled=true + pointerEvents:none` (trừ nút Hủy). Block click thông qua form fields.

`resetBtn()` khi failure: re-add button + re-enable form để user retry.

**Kết hợp với 3 guard cũ**: tổng 7 lớp defense — kể cả user click tốc độ 1000fps cũng không xuyên qua được.

Status: ✅ Done.

---

### [scripts][tpos] Cleanup 103 SP bị nhân đôi SL trên TPOS từ PO BILL/2026/1805

**Trigger**: Sau khi merge fix code-side (commit 883ff0a2 — chống duplicate POST), cần clean up dữ liệu đã sai trên TPOS. 103 SP của PO 55687 đều có 2 stock move thừa qty=N → tồn kho TPOS gấp đôi.

**Approach**: Dùng đúng API mà TPOS UI sử dụng (capture từ Chrome DevTools sau khi user fix tay B2171). 2-step flow:

1. `POST /odata/StockChangeProductQty/ODataService.PostChangeQtyProduct`
    - Body: `{model:[{Id:0, ProductId, ProductTmplId, NewQuantity, LocationId:12, ProductTmpl:{...full}, Product:{...full}, Location:{...full}}]}`
    - Returns: array với `Id` (StockChangeProductQty record)

2. `POST /odata/StockChangeProductQty/ODataService.ChangeProductQtyIds`
    - Body: `{ids:[<id from step 1>]}`
    - Returns: TPOS tạo StockInventory + StockMove adjustment

**Script** ([scripts/fix-po-55687-duplicates.js](../scripts/fix-po-55687-duplicates.js)):

- List stock moves từ Origin BILL/2026/1805 → group by ProductId → detect duplicate (≥2 moves cùng product)
- Cho mỗi SP: GET current qty → compute `target = current - excess` (excess = lineQty × số duplicate batch)
- Skip nếu target<0 hoặc current ≤ lineQty (đã fix tay rồi)
- Apply 2-step adjust, verify by re-reading qty
- Flags: `--apply` (default dry-run), `--only <code>`, `--limit N`

**Result** (chạy 2026-05-12 ~16:30):

- 101 SP fixed via script (143 excess units removed)
- 2 SP skipped (B2171 fix tay sớm, B2172 test apply trước batch)
- 0 fail, 0 mismatch
- Top fix lớn nhất: N4117 (13→7, removed 6), B2105 (9→5), B2001 (9→5)
- Log JSON: `downloads/n2store-session/fix-po-55687-applied-*.json`

**Verify**: spot-check 4 SP qua TPOS OData `Product(id)?$select=QtyAvailable` — tất cả match `after_fix` trong log script.

Status: ✅ Cleanup done — TPOS qty đã đúng cho toàn bộ PO 55687.

---

### [orders][tpos] Chặn duplicate FastPurchaseOrder POST → nhân đôi SL trên TPOS

**Owner repro 2026-05-12**: User chỉ ra: sản phẩm upload lên TPOS đều hiển thị SL = 2. Diff verify qua OData:

| Code  | n2store PO qty | TPOS Product.QtyAvailable | TPOS user ordered |
| ----- | -------------- | ------------------------- | ----------------- |
| B2154 | 1              | **2**                     | 1                 |
| B2137 | 1              | **2**                     | 1                 |
| B2169 | 1              | **2**                     | 1                 |
| B2165 | 1              | **2**                     | 1                 |
| B2155 | 1              | **2**                     | 1                 |
| B2170 | 1              | **2**                     | 1                 |
| B2141 | 1              | **2**                     | 1                 |
| B2145 | 1              | **2**                     | 1                 |

Truy stock moves cho PO 55687 (BILL/2026/1805 — Origin của tất cả 103 SP trong PO PO-20260512-011 từ B45):

- 103 stock moves tại **12:49:33** (move ID 935409 → 935511)
- 103 stock moves tại **12:50:32** (move ID 935512 → 935614)
- **206 moves tổng cộng, gấp đôi số line** — mỗi product có 2 move qty=1 (hoặc qty=N nếu ordered N) → TPOS cộng vào tồn kho 2 lần.
- PO 55663 (hôm qua) có 110 line, 110 stock moves, **không bị nhân đôi** → bug chỉ trigger ở PO này.

**Root cause**: race condition trong submit flow của PO preview modal (`purchase-orders/js/main.js` `showPurchaseOrderPreview`):

1. User click `#btnSubmitTPOS` → `btn.disabled = true`
2. `await createFromExcel(...)` chạy ~30-60s (POST `FastPurchaseOrder` với 103 lines)
3. Trong lúc chờ, `updateButtonStates` chạy (bất kỳ price-input edit/blur nào trigger) → check `isBlocked` false → **set `btnTPOS.disabled = false`**
4. User click thêm lần thứ 2 → POST `FastPurchaseOrder` thứ 2 đi qua (vì `_createInProgress` global đã reset xong sau khi POST 1 succeed)
5. TPOS tạo 2 set stock moves cho cùng 1 PO (TPOS không dedupe theo Number, chỉ generate sequential moves)

`_createInProgress` global ở `tpos-purchase.js` chỉ chặn được concurrent calls. Sau khi POST 1 finish + `_createInProgress=false`, click 2 (1 phút sau) đi qua bình thường.

**Fix** — defense-in-depth 3 lớp:

1. **`purchase-orders/js/lib/tpos-purchase.js`**:
    - Guard 1 (per-order tposPoId): Nếu `order.tposPoId` đã tồn tại → block + toast cảnh báo.
    - Guard 2 (persistent cooldown): `sessionStorage` map `orderId → timestamp`, TTL 10 phút. Survives page reload + rapid second click. Chỉ clear khi (a) failure thật (network/auth thrown) hoặc (b) TPOS trả về `Errors` ở PurchaseByExcel (chưa POST FastPurchaseOrder).
    - Guard 3 (in-memory `_createInProgress`): giữ nguyên cho concurrent same-tick.

2. **`purchase-orders/js/main.js`** (`showPurchaseOrderPreview`):
    - Thêm `tposSubmitLocked` flag — sticky lock, set `true` khi click `btnSubmitTPOS`, **chỉ release ở `resetBtn()` trên error path**. `updateButtonStates` honor flag, không re-enable button mid-flight.
    - Sau `createFromExcel` success → mutate `singleOrder.tposPoId` + `tposPoNumber` IN MEMORY **ngay** (trước Firebase write) → Guard 1 sẽ chặn nếu code path nào đó retry.

**Test verify** (browser session vs http://localhost:8080):

- Guard 1 test: order có `tposPoId=99999` → `createFromExcel` return `{success:false, error:"Đơn đã có tposPoId — đã chặn để tránh duplicate stock moves"}`. ✓
- Guard 2 test: 2 calls cách nhau 30ms cùng `order.id` → call 2 return `{success:false, error:"Recent duplicate submission blocked"}`. ✓
- Smoke verify: tab "Chờ hàng" load 174 rows OK, không JS errors. ✓

**Manual cleanup cần làm** (KHÔNG tự động — đụng prod DB):

- PO 55687 trên TPOS đã có double stock — user cần manual: vào TPOS UI → Stock Move list → filter `Origin=BILL/2026/1805` → xóa 103 move (batch 12:50:32, IDs 935512-935614) hoặc dùng Inventory Adjustment để giảm qty về đúng. Hoặc nếu chấp nhận, để TPOS như vậy + sửa lần sau.

Status: ✅ Done — code fix prevent future duplicates.

---

### [web2][ui] Cải tiến empty state + home module cards

**Trigger**: UI audit qua screenshot 8 trang. Phát hiện:

- Empty state plain text — không có icon, không phân biệt empty vs filter no-match.
- Home page module cards hiển thị slug code dev-y (`fastsaleorder-invoice` etc.) cạnh title, lộn xộn.

**Fix** ([web2-shared/page-builder.js](../web2-shared/page-builder.js) + [page-builder-tpos.css](../web2-shared/page-builder-tpos.css) + [web2/index.html](../web2/index.html)):

- Empty state 2 variant: `inbox` icon "Chưa có dữ liệu" (genuine empty), `search-x` icon "Không có kết quả phù hợp" (filter no-match). Phân biệt bằng `STATE.search || STATE.activeOnly === true`.
- Error state: `alert-triangle` icon + tiêu đề đỏ thay vì plain `style="color:#f05050"`.
- CSS `.empty-state` flex-col layout, padding 56px, icon 44px màu `#cbd5e1`, title `#374151`, hint `#9ca3af`.
- Home `.card .slug`: `opacity: 0` mặc định, `opacity: 1` on hover.

**Bug nhỏ trong fix**: lần đầu `isFiltered = STATE.activeOnly !== null && STATE.activeOnly !== undefined` — `false !== null` luôn true → empty page nào cũng hiển "Không có kết quả phù hợp". Sửa thành `STATE.activeOnly === true`.

**Regression**: smoke 86/86 + nav 90 links + interaction + CRUD 5/5 đều pass sau UI changes.

Status: ✅ done.

---

### [web2][test] Full functional verification — 4 test suites, all pass

**Trigger**: user yêu cầu "test lại toàn bộ chức năng của web2 này để đảm bảo tất cả chức năng đều hoạt động chính xác".

**4 test suites mới** (Playwright + headless Chromium):

1. [scripts/web2-smoke.js](../scripts/web2-smoke.js) — load 86 modules, capture console/page/network errors. Result: **86/86 ok**.
2. [scripts/web2-nav-test.js](../scripts/web2-nav-test.js) — sidebar logo + 13 categories + 90 children resolvable + spot-check navigation. Result: **PASS**.
3. [scripts/web2-interaction-test.js](../scripts/web2-interaction-test.js) — sidebar consistency across 5 pages + cross-page data persistence + entity isolation + round-trip API/UI sync. Result: **PASS**.
4. [scripts/web2-crud-test.js](../scripts/web2-crud-test.js) — full CRUD trên 5 entity đại diện (tag, applicationuser, productcategory, deliverycarrier, rescurrency). Result: **5/5 PASS**.

**Bugs phát hiện + sửa trong quá trình test**:

- Test selector cũ `.web2-nav-group-items a` sai → đúng là `ul.web2-nav-sub a`.
- "Thêm mới" button locator timeout → đúng selector là `#w2pAdd`.
- Modal field selectors generic không match → đúng là `#w2pField_code`, `#w2pField_name`, etc.
- Empty-state row `<tr><td.empty-row>` bị count nhầm thành 1 row data → loại bằng `tbody tr:not(:has(.empty-row))`.
- Pagination limit 200 làm search "Gộp" trả 200 rows = giống initial → đổi sang search nonce `___no-match-${ts}___` đảm bảo filter actually applies.
- Initial test giả định `initialRows > 0` → applicationuser empty (0 rows seed) làm fail → relax check, cho phép 0 row.
- Playwright `page.evaluate` chỉ nhận 1 argument extra → wrap tuple thành object `{ u, c }`.
- Hardcoded `entity=tag` trong API URL → dùng `API_BASE = ${WORKER}/api/web2/${ARGS.entity}` pre-computed Node-side.
- 2 orphan TEST-WEB2-\* rows từ early failed runs → cleanup qua API DELETE.

**Coverage verified**:

- Sidebar logo "N2 Web 2.0 v1.0" hiển thị, identical trên mọi page web2/\* (signature hash matches).
- Sidebar 13 nhóm: Tổng quan (single), Bán Hàng (13), Sale Online (4), Kênh bán (1), Mua hàng (2), Kho hàng (6), Tài chính (6), Khách hàng (7), Sản phẩm (10), Khuyến mãi (4), Kế toán (6), Báo cáo (18), Cấu hình (12) = 90 links, 100% resolvable.
- DB roundtrip Neon Postgres: POST/GET/PATCH/DELETE qua CF Worker → Render web2-generic.js → Neon → UI cập nhật.
- Entity isolation: `tag/TEST-INTERACT-X` không leak vào `product-category`.
- Pagination 6 pages × 200 rows (1001 tag records) — page 2 fetch khác với page 1.
- Search/filter, sort, bulk check-all, modal open/close.

Status: ✅ Web2 fully verified.

---

### [cron][render] auto reconcile pending_customers vs Pancake (mỗi 5 phút)

**Owner repro 2026-05-12**: KH "Mật Ngọt 0935855316" hiện `4 MỚI` nhưng conversation thực chỉ có 1 tin mới (customer "Mũ tròn á e" 09:02). Pancake live: `unread_count: 0`, `last_sent_by.id === pageId` (shop replied tại 02:43 với "Nv.My" signature). DB stuck count=6.

**Why fix WS handler alone không đủ**: Pancake **không reliably fire `pages:update_conversation`** sau khi shop reply qua direct API (auto bill-send, reaction từ extension, chrome bypass replies). Event miss → DB row giữ count cũ vô thời hạn.

Bằng chứng: chạy reconcile script `/tmp/reconcile-pending.mjs` lần 2 (sau 1.5h từ deploy fix WS handler) — tìm thấy **33 stale rows** mới tích tụ. Chứng tỏ WS event không bắt được mọi shop-reply.

**Fix**: thêm cron job server-side mỗi 5 phút ([render.com/cron/scheduler.js](../render.com/cron/scheduler.js)):

1. SELECT `pending_customers WHERE type='INBOX'` (limit 500)
2. Pick most-recently-used active row từ `pancake_accounts` table với token còn hạn → JWT
3. Cho mỗi pending row, fetch `https://pancake.vn/api/v1/pages/{pid}/conversations/{pid}_{psid}?access_token={jwt}` (concurrency 4)
4. Apply rule:
    - `existed: false || shopSentLast || unread_count === 0` → DELETE
    - `unread > 0 && != message_count` → UPDATE message_count + snippet
    - Else → leave alone (aligned)
5. UPDATE `pancake_accounts.last_used_at` cho account đã dùng
6. Log chỉ khi có thay đổi (deleted+updated > 0)

**Kết quả** trước/sau:

- Trước cron: DB drift accumulate, badge "X MỚI" sai liên tục (cần manual reconcile script)
- Sau cron: tự động sync mỗi 5 phút. Reconcile script `/tmp/reconcile-pending.mjs` chỉ còn dùng cho manual force sync.

**Status**: ✅ Done. Server auto-deploys khi push commit `f4c5a187`.

### [render][chat] badge "X MỚI" — sync `message_count` với Pancake `unread_count`

**Owner repro 2026-05-12**: cột TIN NHẮN hiện badge "3 MỚI" / "8 MỚI" sai số. Verify live vs Pancake API: nhiều rows DB drift quá xa khỏi `unread_count` thật.

| KH          | DB count | Pancake unread | Trạng thái                                                              |
| ----------- | -------- | -------------- | ----------------------------------------------------------------------- |
| Vo Linh Vo  | 8        | 2              | OVERCOUNT +6                                                            |
| Hoa Luong   | 16       | 1              | OVERCOUNT +15                                                           |
| Hứa Vân     | 23       | 0              | STALE — shop replied                                                    |
| Trinh Trinh | 3        | 0              | STALE — shop replied (snippet "Mẫu guốc 2 màu Trắng - Đen Giá 260k...") |
| Mật Ngọt    | 6        | 0              | STALE — snippet có "Nv.My"                                              |

**Root cause** ([render.com/routes/realtime.js:upsertPendingCustomer](../render.com/routes/realtime.js)):

```sql
UPDATE pending_customers SET message_count = message_count + 1
```

Bump +1 mỗi event không bao giờ reset theo source-of-truth. Khi nhiều `pages:new_message` + `pages:update_conversation` fire cho cùng 1 conv, count tăng vô tội vạ vượt xa Pancake `unread_count`. Stale rows xảy ra khi shop reply giữa các event window (Pancake không re-fire `update_conversation` ngay).

**Fix server** ([render.com/routes/realtime.js](../render.com/routes/realtime.js)):

1. `upsertPendingCustomer(db, data)` nhận thêm `data.unreadCount` (optional integer ≥ 1). Khi có → SQL `SET message_count = $unreadCount` (authoritative). Khi không có (vd `pages:new_message` single event) → bump +1 như cũ; `update_conversation` tiếp theo sẽ correct lại.

2. **NEW endpoint** `POST /api/realtime/sync-pending`:

    ```json
    { "psid": "...", "pageId": "...", "unreadCount": 2, "snippet": "...", "customerName": "..." }
    ```

    - `unreadCount = 0` → DELETE row
    - `unreadCount > 0` → upsert với `message_count = unreadCount`
      Dùng cho offline reconcile scripts khi DB drift khỏi live Pancake state.

3. `server.js` đã pass `unreadCount: conversation.unread_count` trong updateData → tự động sync khi WS event fire.

**One-shot reconcile** (`/tmp/reconcile-pending.mjs`):

Iterate mỗi pending row, fetch Pancake `/conversations/{pid}_{psid}` qua JWT (Kỹ Thuật NJD từ serect_dont_push.txt), so:

- `shopSentLast || unread_count === 0` → call `mark-replied` (DELETE)
- `unread_count > 0 && != db.message_count` → call `sync-pending` (UPDATE)
- Else → aligned

**Kết quả** chạy 2 lần:

- Lần 1 (trước có endpoint `sync-pending`): DELETE 35 stale, identify 6 drifted → DB 44 → 9 rows
- Lần 2 (sau deploy `sync-pending`): UPDATE 6 drifted → tất cả 9 rows khớp Pancake. 0 stale.

**Status**: ✅ Done. Tất cả badge "X MỚI" hiện đúng `unread_count` từ Pancake.

## 2026-05-11

### [chat][render] read = shop tương tác (NV signature) — bulk cleanup 256 stale entries

**Owner clarification 2026-05-11**: "mở modal tin nhắn không tính là read mà tương tác với khách → tin nhắn cuối cùng là của page, có chữ ký nv, là Nhijudy House, Nhijudy Store → thì là read".

→ Read condition = SHOP đã interact (gửi tin cuối). KHÔNG phải mở modal = read. Indicator:
• Pancake `last_sent_by.id === pageId` (authoritative)
• Snippet có chữ ký nhân viên `NV.{name}` (reply-tool tự append)

**Code change** ([orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)): gate auto-clear logic by `shopSentLast || hasNvSignature`. Pattern NV: `/(?:^|[\s\r\n])N\.?V\.?[\s\-:.]+[A-Za-zÀ-ỹ]/i`.

**Bulk cleanup** (Render DB pending_customers, 2 rounds):

| Round         | Match heuristic                                          | Cleared | DB after                          |
| ------------- | -------------------------------------------------------- | ------- | --------------------------------- |
| Initial state | —                                                        | —       | 1500 rows (Store 1056, House 444) |
| Round 1       | `NV.{name}` signature + shop templates (bill, đã nhận K) | 378     | 1122                              |
| Round 2       | + shipper/bank/business-specific terms                   | 98      | 1244                              |

Cleanup script: `/tmp/cleanup-stale-pending.mjs --apply` (concurrency 8, calls `/api/realtime/mark-replied` for each match).

**Trạng thái còn lại**: 1244 rows. Phần lớn legitimate (KH thực sự có tin chưa đọc) hoặc cần Pancake live verify. Server fix từ commit trước (`351a5eaa`) + client reconcile sẽ tự động dọn entries còn stale khi user mở chat / khi `pages:update_conversation` event mới đến.

**Status**: ✅ Done. Read semantics aligned với expectation chuẩn ("interaction → read"), không over-clear khi user chỉ open modal xem.

### [chat][realtime][render] stale "X MỚI" badge — server + client self-heal khi shop là người gửi cuối

**Owner repro 2026-05-11**: KH "Huỳnh Thành Đạt 0123456788" (page Nhi Judy House) hiện `2 MỚI` mặc dù tin nhắn cuối là từ page/Pancake account (template "Dạ hàng của mình đã được lên bill...").

**Diagnosis** (live recon Pancake + DB):

- **Pancake live state**: `unread_count: 0`, `last_sent_by: {id:"117267091364524" Nhi Judy House}`, `snippet: "Dạ hàng của mình đã được lên bill..."`, `updated_at: 2026-05-10T04:17:24Z`, `last_customer_interactive_at: 2026-04-22` (KH không nhắn 19 ngày).
- **Render DB `pending_customers`**: row tồn tại với `message_count: 2`, snippet là template shop reply, `last_message_time: 2026-05-10 04:17:24+07`. → server không xóa khi shop reply.
- **Client localStorage `n2s_pending_customers`**: cùng entry với `inboxCount: 2`.

**Root cause** (server [render.com/server.js:790](../render.com/server.js#L790)):

Handler `pages:update_conversation` chỉ kiểm tra `unread_count` để quyết định upsert/delete `pending_customers`. Khi shop reply qua direct API (auto bill-send), Pancake đôi khi vẫn báo `unread_count > 0` ngay sau reply (delay) hoặc gửi snippet shop trước khi clear unread → server BUMP count thêm 1 và lưu snippet shop. Không có path detect `last_sent_by.id === pageId`. → row stale tồn tại cho tới khi user manual mark-replied.

**Fix server** ([render.com/server.js](../render.com/server.js)):

- Detect `shopSentLast` = `conversation.last_sent_by?.id === pageId` HOẶC `last_message?.from?.id === pageId`.
- DELETE `pending_customers` row nếu `shopSentLast` HOẶC `unread_count === 0` (cũ chỉ check sau).
- Upsert chỉ khi `!shopSentLast && unread > 0`.

**Fix client** ([orders-report/js/chat/new-messages-notifier.js](../orders-report/js/chat/new-messages-notifier.js), [orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)):

- Thêm `reconcilePendingWithPancake()` — chạy 8s sau load + mỗi 5 phút. Cho mỗi page có pending: 1 call `fetchConversationsForPage` → cross-check `last_sent_by.id` / `unread_count` cho mọi pending psid trong list → clear stale. 1 API call/page (3-5 pages), không phải 1/customer.
- Self-heal khi chat modal open: conv resolve xong + `shopSentLast` || `unread_count===0` + có pending entry → `clearPendingForCustomer(psid)` + `_markRepliedOnServer`. Mọi lần user click chat sẽ tự sửa stale badge.

**Live verification**:

- Manual mark-replied cho psid `24948162744877764`: server returned `{success:true, removed:1}` → row đã xóa khỏi `pending_customers`.
- Local cache cleared via `newMessagesNotifier.clearPendingForCustomer` → entry biến mất.

**Status**: ✅ Done. Server auto-deploys khi push.

### [chat] page avatars + picker for phone-mismatch candidates

**Pancake recon — page avatar endpoint** (live, 2026-05-11):

- `GET /api/v1/pages/{pageId}/avatar?access_token={JWT}` → returns JPEG ~5-6 KB. Works for **both** Facebook and Instagram pages.
- The `/api/v1/pages` list endpoint returns `avatar_url` **only** for Instagram pages (`cdninstagram.com`). Facebook pages get `avatar_url: null` — that's why the chat-modal page selector previously fell back to initial letters for all FB pages.

**Owner repro 2026-05-11**: "tìm sđt 0123456788 ở 2 page house và store → đều tìm được mà" + "với coi cách hiển thị avatar page". User observed Pancake's own UI search returns hits on both pages, but our modal showed "Khách chưa có SĐT trên NhiJudy Store" empty state on Store.

**Why empty state was wrong on Store**: Pancake's search returned a HOMONYM ("Huỳnh Thành Đạt" fb_id `25717004554573583`, phone `0908123456`) — same name as our test customer but different person with different phone. Our prior logic confirmed the phone mismatch and silently rejected the whole group → empty state. User wanted to **see** the candidate so they can decide "đúng/không đúng khách".

**Implementation** ([orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)):

1. **Page avatar helper** `_getPageAvatarProxyUrl(pageId)` — builds `https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake/pages/{pid}/avatar?access_token={token}`. Routes through CF worker for edge cache + proper referer headers. Token from `pancakeTokenManager.currentToken` (cached).
2. **Page selector**: dropdown items + selector button label now use the proxy URL (falls back to `avatar_url` for IG, then initial). Previously read `page.avatar` (wrong field — API gives `avatar_url`) so all FB pages showed letters even when valid avatars existed.
3. **Picker decision tree refactor**: bucket fb_id groups by phone verdict (matched / uncertain / mismatched). Auto-accept iff exactly 1 matched group OR exactly 1 uncertain group with no mismatch. Otherwise → picker with **all** candidates including mismatched ones (so user sees the homonym and can verify "không phải khách"). Picker trigger relaxed from `> 1 candidate` to `≥ 1 candidate`.
4. **Picker heading** also handles single-mismatch case: "Tìm thấy 1 hội thoại — kiểm tra có đúng khách không" with help "SĐT trên Pancake khác với SĐT đơn hàng. Bấm để mở nếu đúng khách, hoặc bỏ qua nếu không phải".
5. **Picker card avatars**: prefer `window._getChatAvatarUrl(fid, pageId)` (existing helper that routes via worker) over raw FB graph URL — better cache + consistent with rest of chat UI.

**Live verification**:

- `https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake/pages/270136663390370/avatar?access_token=...` → `200 image/jpeg 5586 B`.
- Visual test: chat modal opened, page-selector dropdown shows 4 page avatars with real images (not initials).
- Picker trigger: phone 0123456788 on Store with homonym fb_id 25717004554573583 now flows through `mismatchedGroups` path → picker fires with the candidate, user can verify it's not their customer instead of seeing empty state.

**Status**: ✅ Done.

### [issue-tracking] FIX_COD + "Trừ công nợ khách" → trừ COD giảm vào ví khách

**Yêu cầu owner**: Khi tạo phiếu **Sửa COD (Shipper gọi)** với lý do **"Trừ công nợ khách"** (`CUSTOMER_DEBT`), số tiền COD giảm phải được **trừ vào số dư ví của khách** (khách "ứng" COD giảm từ ví → shop chuyển 0đ cho ĐVVC).

**Ví dụ**: Ví 100k, đơn COD 205k, COD giảm 40k → COD còn phải thu 165k, trừ vào ví 40k → ví còn lại 60k. **Ràng buộc**: `walletBalance >= codReduce` (nếu không đủ → block submit, alert chi tiết).

**Implementation** ([issue-tracking/index.html](../issue-tracking/index.html), [issue-tracking/js/script.js](../issue-tracking/js/script.js)):

1. **UI preview** (`#wallet-deduct-preview`): khối vàng hiện khi reason = CUSTOMER_DEBT, show Số dư ví / Trừ vào ví / Ví còn lại / cảnh báo nếu ví thiếu. Auto-update khi đổi `codReduce` (qua `calculateCodRemaining`) hoặc đổi reason (qua `onFixCodReasonChange`).
2. **Track wallet balance** trên `currentCustomer.walletBalance` ở 3 nhánh load customer (searchCustomerByPhone + selectOrder hit/miss/error) thay vì chỉ render xuống DOM — function `updateWalletDeductPreview()` cần đọc giá trị.
3. **Validation** trong `handleSubmitTicket` (FIX_COD branch): nếu reason CUSTOMER_DEBT thì check `codReduce > 0` và `walletBalance >= codReduce`, fail → `alert` chi tiết "thiếu X đ" và `return` không gọi createTicket.
4. **Withdraw sau khi createTicket thành công**: gọi `ApiService.walletWithdraw(phone, money, orderId, note, createdBy)` (POST `/api/v2/wallets/:phone/withdraw`, dùng `wallet_withdraw_fifo` SQL function — FIFO virtual credit trước, rồi real balance). Withdraw fail không rollback ticket, chỉ notify warning "trừ ví thủ công qua Customer 360".

**Browser test** (localhost:8080, customer test mặc định Huỳnh Thành Đạt `0123456788`):

- Test 1 (preview): mock selectedOrder COD 205k + currentCustomer walletBalance 100k, set codReduce 40k → preview hiện `Wallet 100k / Trừ 40k / Còn lại 60k`, không error. ✓
- Test 2 (ví thiếu preview): codReduce 150k > wallet 100k → preview cảnh báo `⚠️ Ví không đủ (thiếu 50.000 ₫)`. ✓
- Test 3 (reason switch): chuyển sang `WRONG_SHIP` → preview ẩn; quay lại `CUSTOMER_DEBT` → preview hiện. ✓
- Test 4 (validation block submit): codReduce 150k > wallet 100k, gọi `handleSubmitTicket` → alert chi tiết, ticket KHÔNG được tạo. ✓
- Test 5 (happy path e2e): codReduce 40k ≤ wallet 100k → ticket `TV-2026-00737` (FIX_COD/CUSTOMER_DEBT/40000/PENDING_FINANCE) tạo OK, wallet đi từ `100000.00` → `60000.00` (đúng -40k). ✓

**Cleanup test**: hard-delete ticket `TV-2026-00737` (DELETE `?hard=true`), deposit lại 40k, withdraw 100k seed deposit → wallet về 0 nguyên trạng.

**Files**: [issue-tracking/index.html:300-315](../issue-tracking/index.html#L300-L315), [issue-tracking/js/script.js:516-518, 619-621, 636, 988-1019, 1052, 1530-1546, 1655-1683](../issue-tracking/js/script.js).

**Status**: ✅ Done

### [issue-tracking] custom confirm dialog cho FIX_COD + CUSTOMER_DEBT

**Yêu cầu owner**: thêm custom confirm xác nhận khi Sửa COD (Shipper gọi) + "Trừ công nợ khách" — đây là thao tác trừ ví thật, không tự động hoàn nếu user lỡ tay.

**Implementation** ([issue-tracking/js/script.js:1652-1680](../issue-tracking/js/script.js#L1652-L1680)):

- Dùng `notificationManager.confirm(htmlMessage, title)` ([shared/js/notification-system.js:306](../shared/js/notification-system.js#L306)) — đã có sẵn, render modal Promise-based, hỗ trợ HTML trong body, Enter=OK, Esc/click overlay=Cancel.
- Title: `⚠️ Xác nhận trừ ví khách`.
- Body (HTML): Khách + Đơn + COD ban đầu + COD giảm (đỏ) + COD còn phải thu + Số dư ví hiện tại + Số dư ví sau khi trừ (xanh).
- Confirm đặt **sau khi tạo ticketData** nhưng **trước khi `isSubmitting=true` + disable nút submit** → user bấm Hủy không bị stuck disable button.

**Browser test (3 paths)**:

- **Cancel path**: mock `notificationManager.confirm` → return false → `handleSubmitTicket` không tạo ticket, không trừ ví (100k → 100k unchanged). ✓
- **OK path**: mock confirm → return true → ticket tạo OK, ví 100k → 60k (-40k đúng). ✓
- **Visual path**: gọi handleSubmitTicket thật → dialog hiện với title đúng, body chứa đủ 40k/100k/60k/205k, click Cancel → dialog đóng. ✓

**Files**: [issue-tracking/js/script.js:1652-1680](../issue-tracking/js/script.js#L1652-L1680).

**Status**: ✅ Done

---

### [chat] cross-page conv lookup — priority chain FB-ID → phone → name picker

**Yêu cầu owner** (2026-05-11): "browser test pancake id facebook → và tìm theo id này được không? Nếu được ưu tiên tìm theo id facebook → fallback sđt → fall back tên (có danh sách cho chọn vì tên có thể trùng)".

**Pancake recon — live API probe** (logged-in, real token):

- `GET /api/v1/pages/{pid}/conversations/{pid}_{fb_id}` — page-scoped direct lookup.
    - **Hit** → full conv object (`id`, `type`, `from_psid`, `customers[].id` UUID, `recent_phone_numbers[]`, `thread_id`).
    - **Miss** → `{ existed:false, success:false, message:"Hội thoại này không tồn tại" }`.
- Verified via persistent Playwright session: fb_id `25717004554573583` on pageId `270136663390370` → hit (phone `0908123456`); fb_id `24948162744877764` on same page → miss.
- Endpoint là **nguồn lookup tin cậy nhất** — không fuzzy match, không phone ambiguity.

**Implementation** — priority chain inside `_doFindAndLoadConversation`:

1. **Priority 1: FB-ID direct lookup**. Read `customers.pancake_data.page_fb_ids[pageId]` from DB by phone; if present, call `pancakeDataManager.fetchConversationDirect(pageId, fbId)`. Hit → resolved conv. Miss/no mapping → fall through.
2. **Priority 2: phone search** (existing — `searchConversationsOnPage(pageId, phone)`).
3. **Priority 3: name search + phone verification** (existing — grouped by fb_id, reject any group with phone mismatch).
4. **NEW — ambiguity picker**: when name search returns multiple distinct fb_id groups AND none has phone-confirmed match → render picker UI listing each candidate (avatar, name, recent phones, type, snippet) so user picks the right human manually. Previously the code "best-effort accepted" and silently loaded whichever sorted first — can be the wrong person for homonyms.

**Files** ([shared/js/pancake-data-manager.js](../shared/js/pancake-data-manager.js), [orders-report/js/managers/pancake-data-manager.js](../orders-report/js/managers/pancake-data-manager.js), [orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)):

- Added `fetchConversationDirect(pageId, fbId)` method on both PDM classes (shared/orders-report-local) — returns conv on hit, null on miss.
- Added `_renderConvPickerEmptyState(candidates, pageName)` — bento card list with avatar/phones/types/snippet.
- Added `_wireConvPickerEmptyState(pageId, byFbIdMap, loadToken, type)` — click handler resolves conv + calls `_loadMessages`.
- Hook in `_doFindAndLoadConversation`: Priority 1 block at top; ambiguity flag inside name-search verification; empty-state branch checks picker > set-phone > generic.
- Pancake URL is page-scoped: `pages/{pid}/conversations/{convId}` (corrected from initial `conversations/{convId}` which returns wrong shape).

**Status**: ✅ Done. Direct lookup verified live (hit + miss cases). Picker auto-renders when name-ambiguity trigger fires. No regression for unambiguous flows (phone-confirmed match still auto-loads).

### [delivery-report][render][DB] refactor: schema order_number-keyed — loại bỏ class bug "duplicate by date"

**Vấn đề gốc**: schema có `UNIQUE (assignment_date, order_number)` — compound key cho phép cùng `order_number` xuất hiện ở nhiều `assignment_date` (đã ghi nhận 16265 row duplicate trong DB, max 6 row/đơn). Class bug này tồn tại từ ngày 1 của module. `order_number` (NJD/2026/XXXXX) đã unique trên TPOS nên `assignment_date` là redundant trong key — gây ra đúng class bug ta đang fix.

**Migration toàn bảng** ([render.com/scripts/dedupe-delivery-fulltable.js](../render.com/scripts/dedupe-delivery-fulltable.js)):

1. Backup `pg_dump` CSV mới (`backups/delivery_assignments-20260511-180452.csv`, 25327 rows).
2. `LOCK TABLE EXCLUSIVE` + transaction.
3. Cho mỗi `order_number` có >1 row: keep row có `created_at` mới nhất (= user-visible value). Merge `is_scanned=OR`, `is_hidden=OR`, `scanned_at=earliest non-null`, `scanned_by=corresponding`.
4. DELETE 16265 row duplicate. Còn lại 9062 row distinct (1 row / đơn).
5. `ALTER TABLE ADD CONSTRAINT delivery_assignments_order_number_unique UNIQUE (order_number)`.
6. Sau khi backend deploy với `ON CONFLICT (order_number)`: `DROP CONSTRAINT delivery_assignments_assignment_date_order_number_key`.

**Refactor backend** ([render.com/routes/v2/delivery-assignments.js](../render.com/routes/v2/delivery-assignments.js)):

- `GET /` thêm filter `?order_numbers=N1,N2,...` (preferred new). `?date=` và `?from=&to=` giữ cho compat.
- `POST /` dùng `ON CONFLICT (order_number) DO NOTHING`. `date` param chỉ làm metadata (assignment_date), default `today` nếu missing.
- `PATCH /scan|/unscan|/hide`, `PUT`, `DELETE`: bỏ requirement `?date=` query param. Chỉ cần `order_number` trong path.
- `PATCH /unscan-bulk`: shape mới `{orderNumbers:[...]}`. Legacy `{date,orderNumbers}` và `{items:[{orderNumber,date}]}` vẫn nhận.
- `POST /lookup-batch`: trả về `{assignments, scannedNumbers, hiddenNumbers}` (extended payload — thay vì chỉ groups).

**Refactor frontend** ([delivery-report/js/delivery-report.js](../delivery-report/js/delivery-report.js)):

- Bỏ `getAssignmentDateRange()`, `getDateForOrder()`, `getAssignmentDate()` — không còn cần lookup date.
- Thêm `getCurrentOrderNumbers()` lấy `order_number` từ `allData`.
- `loadAssignmentsFromDB()` dùng `POST /lookup-batch` với `orderNumbers` từ allData (thay range query `?from=&to=`).
- Sync polling: dùng `lookup-batch` thay range.
- `saveScannedNumber`, `unscanNumberInDB`, `hideOrder`: không truyền date trong URL.
- `unscanBulkInDB(numbers)`: body `{orderNumbers: numbers}`.
- `saveAssignmentsToDB`: bỏ `date` top-level; mỗi item vẫn pass `date: extractTposDate(DateInvoice)` làm metadata cho `assignment_date`.

**Verify**:

- Pre-migration: 25327 rows / 9062 distinct / 6218 đơn có duplicate.
- Post-migration: 9062 rows / 9062 distinct / 0 duplicate. UNIQUE constraint giờ chỉ `delivery_assignments_order_number_unique`.
- API endpoints test pass với cả legacy `?date=` và new `?order_numbers=`.

**Status**: ✅ Done. Class bug "same order with different assignment_date" giờ **không thể xảy ra** ở DB level (UNIQUE constraint).

### [delivery-report] TZ-safe date extract — `extractTposDate(iso)` thay `new Date().getDate()`

**Vấn đề**: `getDateForOrder()` và `saveAssignmentsToDB()` dùng `new Date(item.DateInvoice).getDate()` → phụ thuộc browser TZ. Nếu browser ở TZ âm (vd US-PDT) và DateInvoice rơi vào sáng sớm VN → date lệch 1 ngày → `assignment_date` ghi sai. Toàn bộ user n2store ở VN nên không lộ trong production, nhưng CI/headless test ở server US sẽ tái xuất bug.

**Fix** ([delivery-report.js](../delivery-report/js/delivery-report.js)):

- Thêm helper `extractTposDate(iso)` dùng regex `^(\d{4}-\d{2}-\d{2})` trích YYYY-MM-DD trực tiếp từ string ISO (TPOS luôn trả `2026-05-10T19:21:55.637+07:00` — prefix là VN-local date, không cần parse Date).
- `getDateForOrder()` và `saveAssignmentsToDB()` dùng helper mới → 0 dependency vào browser TZ.

**Status**: ✅ Done. Code-only fix, không đụng DB.

### [delivery-report][DB] dedupe 09-10/05 — 1504 rows → 778 (Strategy B: 09/05 wins)

**Vấn đề**: 726 đơn duplicate trong DB do bug `getAssignmentDate()` cũ ghi `fromDate=09/05` cho TẤT CẢ scan trong filter multi-day 09-10/05. Sau đó user vào filter 10/05 single-day → save lại đúng date → 2 row/đơn. Phát hiện qua API range query: 1504 total / 778 distinct.

**Migration** ([render.com/scripts/dedupe-delivery-09-10-strategyB.js](../render.com/scripts/dedupe-delivery-09-10-strategyB.js)):

1. Backup `pg_dump` CSV (`backups/delivery_assignments-20260511-113130.csv`, 26013 rows, gzipped + MD5).
2. `LOCK TABLE EXCLUSIVE` → BEGIN transaction.
3. UPDATE 726 row 10/05 với: `group_name = 09's value` (Strategy B — giữ user-visible state), `is_scanned = OR`, `is_hidden = OR`, `scanned_at = earliest non-null`, `scanned_by = tương ứng`.
4. DELETE 726 row 09/05 duplicate.
5. COMMIT.

**Verify**:

- Trước: 778 đơn distinct, 1504 rows, 559 scanned (deduped).
- Sau: 778 đơn distinct, 778 rows, 559 scanned. 0 duplicate.
- Group breakdown unchanged user-visible: nap=422, tomato=119, city=220, shop=10, return=7.
- 0 đơn mất scan (verified pre-migration: 0 cases scan@09 nhưng không@10).
- Special: NJD/2026/66254 → tomato (riêng request user). Sau đó: nap=421, tomato=120.

**Status**: ✅ Done. Strategy B chọn vì preserve toàn bộ user-visible state (0 đơn flip group), khớp với "giữ nguyên assignments đã assign cho 2 ngày 9, 10".

### [delivery-report][render] fix tra soát — đã quét/chưa quét chia đúng theo filter nhiều ngày

**Vấn đề**: filter 09/05–10/05, "Đã quét" tab chỉ hiển thị scans của ngày 09/05 (fromDate); scans của 10/05 trôi sang "Chưa quét". Lý do: `loadAssignmentsFromDB` chỉ gọi `?date=fromDate`, một ngày. Tương tự `saveScannedNumber`/`unscan`/`hide` ghi `assignment_date = fromDate` thay vì DateInvoice thực của đơn → đơn 10/05 scan trong filter 09–10 bị lưu nhầm dưới ngày 09/05.

**Fix backend** ([render.com/routes/v2/delivery-assignments.js](../render.com/routes/v2/delivery-assignments.js)):

- `GET /` thêm `?from=YYYY-MM-DD&to=YYYY-MM-DD` (BETWEEN), giữ `?date=` cho backward compat. Dedupe `scannedNumbers`/`hiddenNumbers` khi 1 order có 2 row khác `assignment_date`.
- `POST /` chấp nhận per-assignment `.date` (fallback `date` top-level) → mỗi đơn lưu đúng `assignment_date` theo DateInvoice của chính nó.
- `PATCH /unscan-bulk` chấp nhận shape mới `{ items: [{orderNumber, date}] }` (giữ shape cũ `{date, orderNumbers}` để compat) → bulk unscan cross-date trong 1 statement.

**Fix frontend** ([delivery-report/js/delivery-report.js](../delivery-report/js/delivery-report.js)):

- Thêm `getAssignmentDateRange()` và `getDateForOrder(orderNumber)` (resolve qua `allData[].DateInvoice`, fallback fromDate).
- `loadAssignmentsFromDB`, sync polling: dùng `from`/`to` thay vì `date`.
- `saveAssignmentsToDB`: từng item gán `.date = toLocalDateStr(item.DateInvoice)`.
- `saveScannedNumber`, `unscanNumberInDB`, `hideOrder`: query string `date = getDateForOrder(orderNumber)`.
- `unscanBulkInDB`: gửi `{ items:[{orderNumber, date}] }`.

**Status**: ✅ Done.

### [chat][render] "Khách chưa có SĐT" empty state — set-phone flow + Pancake recon

**Yêu cầu owner**: "xem pancake set sđt ra sao → nếu không tìm được thì hiện khách chưa có sđt → cho set sđt".
Tiếp: "request set phone trên pancake là được rồi vì tìm đoạn hội thoại trên pancake mà".

**Pancake recon** (passive inspection của `__pancakeReduxStore__` + bundle grep + endpoint probe):

- Pancake capture phone TỰ ĐỘNG từ chat content qua `recent_phone_numbers[{m_id, offset, length, phone_number, status}]` — m_id reference message gốc, offset+length = position trong text.
- **Không có public REST API để set phone manually**. Probed các pattern:
    - `PATCH/PUT /api/v1/pages/{pid}/customers/{uuid}` → 404
    - `POST .../phone_numbers`, `.../recent_phone_numbers`, `.../edit_phone`, `.../add_phone_number`, `.../info`, `.../extra_info` → 404
    - `POST /api/v1/customers/update_global_id` → 404
    - `customers_by_phone_number?phone_number=...` → 500 (lookup-only, broken or needs special params)
- Pancake hidden globals tìm được: `window.findGlobalIdForConv(e)` (gọi extension `GET_GLOBAL_ID_FOR_CONV`), `window.__pancakeReduxStore__`, `window.__pancakeReduxHistoryLog__`. Pancake action types `UPDATE_CUSTOMER_PROFILE_INFO`, `ADD_CUSTOMER_NOTE` etc. có ở store nhưng dispatch qua các thunk private không expose URL constants.

**Kết luận**: không clone được "Pancake set-phone" qua HTTP. Best practical: lưu phone trong DB n2store + re-trigger lookup chain (`searchConversationsOnPage(pageId, phone)` + by-phone DB lookup + `pancake_data.page_fb_ids[pageId]` mapping).

**Backend** ([render.com/routes/v2/customers.js](../render.com/routes/v2/customers.js)):

- `POST /api/v2/customers/set-phone` body `{ fbId?, globalId?, pageId?, phone, name? }`.
- Dedicated `client.connect()` + `BEGIN`. **Phone-first** `SELECT … FOR UPDATE` row-lock (UNIQUE index ở phone → lock trước khi UPDATE/INSERT để tránh race + duplicate-key). Fallback fb_id → global_id dưới cùng lock.
- UPDATE existing với `COALESCE` preserve các field non-null (chỉ điền null cũ). Maintain `pancake_data.page_fb_ids[pageId] = fbId` mapping → chat-core lookup chain dùng cho cross-page resolve.
- INSERT branch dùng plain INSERT (không ON CONFLICT vì SELECT FOR UPDATE đã guarantee no race).
- Seed `fb_global_id_cache(page_id, psid, global_user_id, resolved_by='set-phone')` nếu có cả 3.

**Frontend** ([orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)):

- `_renderSetPhoneEmptyState(pageName, opts)` 2-mode UX:
    - Initial: `"Khách chưa có SĐT trên <page>"` + button **"Gán SĐT"**.
    - Sau save mà vẫn chưa có conv (`opts.persisted`): `"Đã lưu SĐT nhưng chưa có hội thoại trên <page>"` + button **"Thử SĐT khác"** — user biết save thành công, lý do empty là Pancake không có conv (khách chưa nhắn page).
- `_wireSetPhoneEmptyState(targetPageId)` submit → POST set-phone → cập nhật `window.currentChatPhone` + header → flag `window._chatPhonePersistedForPage` → re-trigger `_findAndLoadConversation(allowDrift=false)`. Nếu vẫn empty → re-render với mode `persisted=true`.
- Flag `_chatPhonePersistedForPage` reset trong `openChatModal` để không leak giữa các order khác nhau.

**Tests verified** (browser, test customer 0123456788 → switch sang NhiJudy Store):

- ✅ Heading ban đầu: "Khách chưa có SĐT trên NhiJudy Store"
- ✅ Submit SĐT 0123456788 → POST `/api/v2/customers/set-phone` → 200 success
- ✅ Verify DB: customer.pancake_data.page_fb_ids = {"270136663390370": "24948162744877764"} ← link Store fb_id
- ✅ Re-lookup vẫn empty (đúng — test customer chưa nhắn Store) → heading switch sang "Đã lưu SĐT nhưng chưa có hội thoại trên NhiJudy Store"
- ✅ Button label: "Gán SĐT" → "Thử SĐT khác"
- ✅ 0 console errors

Status: ✅ Done (commits `ebec2276` backend transaction fix + `93e6c865` frontend two-mode UX + `e86b1319` initial scaffold).

---

## 2026-05-10

### [chat] Switch page conv lookup — fb_id grouped phone-verify + type-correct pick + avatar refresh

**Yêu cầu owner**:

1. "browser test 0123456788 → đổi qua page store xem debug lỗi sao không có đoạn hội thoại"
2. "có 2 loại conv inbox và comment → load cho chính xác"
3. "coi lại luôn phần load avatar khách và avatar page"

**Diagnose** (live API check trên Store):
2 convs trên Store cho fb_id `25717004554573583` (homonym, cùng tên "Huỳnh Thành Đạt"):

- INBOX `recent_phones=[0908123456]` → mismatch với customer phone 0123456788
- COMMENT `recent_phones=[]` → uncertain

Phiên fix trước (`null = uncertain → accept`) khiến COMMENT được accept → user thấy đoạn hội thoại của HOMONYM, không phải khách thực. Loose-uncertain-accept không an toàn khi cùng fb_id đã có evidence mismatch.

**Fix** ([tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)):

1. **`fb_id`-grouped phone verification**: Map<fb_id, [{conv, check}]>:
    - `hasMatch` → accept tất cả conv của group (đúng khách)
    - `hasMismatch` → reject TẤT CẢ (homonym xác định, kể cả uncertain siblings)
    - neither → best-effort accept (không có evidence)

2. **Type-correct pick**: line 1043 `c.type === 'INBOX'` (hardcoded) → `c.type === type` (correct: switch sang COMMENT thì pick COMMENT, sang INBOX thì pick INBOX).

3. **Strip order-tag suffix** trong search query: `_bareSearchName(n)` cắt tại " - " đầu tiên. customerName "Huỳnh Thành Đạt - BOOM" → search "Huỳnh Thành Đạt" (bare name FB lưu). Preserves "Anne-Marie" (no surrounding spaces around dash).

4. **Relax `_nameMatch`**: substring-contains 2 chiều với normalize (diacritic strip + lowercase + collapse dash/underscore/whitespace), thay strict equality.

5. **Sync `currentChatPSID` post-resolve**: PSID page-scoped, sau cross-page switch phải update sang conv's from_psid → subsequent operations (type-switch, bill send, extension) dùng đúng PSID.

6. **`switchConversationType` allowDrift=false**: trigger strict-branch + name-search fallback (trước chỉ reachable qua `switchChatPage`).

7. **Avatar refresh**:
    - `_refreshChatHeaderAvatar()` extracted helper, gọi initial open + sau mỗi conv resolve. Avatar header customer cập nhật theo page-customer profile pic của conv mới (cross-page có thể avatar khác).
    - `_updatePageSelectorLabel` thêm render avatar page trong selector button (thay icon `storefront` static khi page có avatar; fallback initial trên img error).

**Tests verified** (browser):

- ✅ 0123456788 → Store: empty state đúng (homonym group rejected vì INBOX có phone 0908123456 ≠ 0123456788).
- ✅ Per direct API: 2 convs cùng fb_id trên Store, đều thuộc về khách KHÁC tên trùng → reject toàn bộ là correct behavior.
- ✅ currentChatPSID synced từ `24948162744877764` (Nhi Judy House PSID) sang Store conv's PSID khi resolve thành công (real cross-page case).
- ✅ Avatar HTML loaded ngay sau switch (`<img src="blob:..." style="...border-radius:50%">`).

Status: ✅ Done (commit `21bd7895`).

---

### [render][incident] TRUNCATE nhầm `inventory_product_images` 45 rows + recovery qua Render PITR

**Trigger**: cleanup chat-db disk usage (post Phase B Bunny migration). Thấy bảng `inventory_product_images` có TOAST 11 MB, pg_stat hiện `n_live_tup=0, n_dead_tup=0, last_autovacuum=NULL` → tưởng bảng rỗng từ trước, chạy `TRUNCATE` để reclaim TOAST.

**Sự thật**: bảng có **45 rows live** (106 URL ảnh inventory, batches từ 17/04). Autovacuum chưa từng chạy bảng này nên statistics stale → pg_stat sai. `SELECT COUNT(*)` mới là source of truth.

**Recovery flow** (Render PITR API):

1. `POST /v1/postgres/{id}/recovery { restoreTime: "2026-05-10T08:44:00Z" }` → Render fork **DB instance mới** từ snapshot (KHÔNG modify DB gốc). Status: `recovery_in_progress` → `creating` → `available` (~3 min).
2. `GET /v1/postgres/{new-id}/connection-info` → lấy connection string.
3. [scripts/recover-inventory-images.js](../scripts/recover-inventory-images.js): SELECT 45 rows từ DB restored → INSERT vào prod với `ON CONFLICT (ngay_di_hang, dot_so, ncc) DO NOTHING` (idempotent). Lưu ý: `urls jsonb` phải `JSON.stringify(row.urls || [])` trước khi pass vào pg client (pg không auto-stringify object cho jsonb param).
4. Verify: prod `total_rows=45, total_urls=106` ✓
5. `DELETE /v1/postgres/{new-id}` để stop billing fork DB tạm.

**Lesson**:

- **NEVER trust `pg_stat_user_tables.n_live_tup`** cho destructive op. Stale nếu autovacuum chưa chạy. Luôn `SELECT COUNT(*)` ngay trước TRUNCATE/DROP/DELETE bulk.
- Render PITR API rất tiện: tạo fork mới từ snapshot, không động DB gốc, billing tính theo giờ instance đứng lên — delete sau khi recovery xong.
- Recovery window 7 ngày trên Render Postgres standard plan.

Status: ✅ Restored, fork DB tạm đã DELETE, prod khớp 45 rows.

---

### [chat] Switch page lookup — fix "Không tìm thấy cuộc hội thoại" trên page khác

**Bug owner báo**: "browser test 0123456788 → đổi qua page store xem debug lỗi sao không có đoạn hội thoại". Click chat từ row có SĐT `0123456788` trên Nhi Judy House → switch sang NhiJudy Store → empty state.

**Diagnose**: direct API `pdm.searchConversations("Huỳnh Thành Đạt")` trả 2 convs trên Store (INBOX + COMMENT, fb_id `25717004554573583`) — convs tồn tại nhưng lookup chain reject hết.

2 root causes trong `_doFindAndLoadConversation` (allowDrift=false branch, [tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)):

**1. customerName có suffix "- BOOM"** (order tag) nhưng Pancake lưu name gốc:

- `pdm.searchConversations("Huỳnh Thành Đạt - BOOM")` → 0 hits.
- Strict `_nameMatch(c.from?.name, customerName)` → false.
- Order data confirm: `Facebook_UserName: "Huỳnh Thành Đạt"` (bare), `PartnerName: "Huỳnh Thành Đạt - BOOM"` (suffix).

**2. `_convHasPhone` trả `false` cho conv có phone pool rỗng**, conflating "no phone info" với "different phone" → reject convs hợp lệ chưa capture phone trên target page.

**Fix**:

- `_bareSearchName(n)`: cắt tại " - " đầu tiên (preserve hyphenated names như "Anne-Marie" vì không có space xung quanh dash). Try bare-query trước, fallback raw customerName nếu 0 hits.
- `_nameMatch`: relax thành substring-contains (cả 2 chiều) với normalization (diacritic strip + lowercase + collapse dash/underscore/whitespace).
- `_convHasPhone` 3-state: `true` (match), `false` (mismatch confirmed → reject homonym), `null` (uncertain, empty pool). Verifier:
    - `true` → accept
    - `false` → reject
    - `null` → fetch detail; nếu detail vẫn null → accept best-effort.

**Tests verified** (browser, customerName="Huỳnh Thành Đạt - BOOM", phone="0123456788"):

- ✅ `switchChatPage("270136663390370")` (Store) → currentConvId resolved `1573633073980967_890142437017229` (was null).
- ✅ msgCount = 1 (was 0).
- ✅ hasConvData = true.
- ✅ 0 console errors.

Status: ✅ Done (commit `6d5f244d`).

---

### [orders][bill] Chat modal Gửi Bill — fallback Extension khi bị 24h Pancake policy + fix signature bug

**Yêu cầu owner**: "nếu bị 24h gửi bằng extension".

**Audit hiện tại**: `BillService.sendBillToCustomer` đã có 2 fallback paths:

- **Late fallback** (line 1528-1642): khi Pancake API trả `e_code=10/e_subcode=2018278` (24h policy) hoặc `e_code=551` (#551 user unavailable) → call `sendImagesViaExtension([billImageFile], null, extConv)` (correct signature) → also send CAMON image+text qua extension.
- **Early fallback** (line 1447): khi không tìm được `convId` → had a SIGNATURE BUG: gọi `sendImagesViaExtension(pageId, psid, [billImageFile])`. Real signature là `(images, text, conv)` → `pageId` (string) bị iterate như array → `uploadImageViaExtension` crash với từng ký tự pageId.

**Fix** ([orders-report/js/utils/bill-service.js](../orders-report/js/utils/bill-service.js)):

- Early fallback: rebuild đúng `conv = { pageId, psid, conversationId: null, _raw: { from_psid }, customers: [], customerName from orderResult, type: 'INBOX' }` rồi `sendImagesViaExtension([billImageFile], null, conv)`. Trả `viafallback: true`.
- [tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js): khi `sendResult.viafallback === true`, notification show "Đã gửi bill qua Extension (24h/Pancake fallback)" thay vì "Đã gửi bill cho khách" — user biết đường nào được dùng.

**Tests** (browser, T6 DEAL XINH, mock Pancake API trả 24h error):

- ✅ `mockedSendInbox: 1` — gọi Pancake API trước (đúng flow).
- ✅ Pancake API trả `e_code=10, e_subcode=2018278` → `sendBillFromChat` chạy tiếp xuống late-fallback path.
- ✅ `extensionInvoked: true` — extension fallback fired.
- ✅ `extConvUsed`: hasPageId, hasPsid, hasConvId, hasCustomerName, type=INBOX, imageCount=1, hasText=true (CAMON image+text). Cả bill image + CAMON đều qua extension.
- ✅ 0 console errors.

Status: ✅ Done (commit `3b4ea3ac`).

---

### [orders] Fix nút Gửi Bill trong chat modal — bill bị thiếu sản phẩm

**Bug owner báo**: "nút gửi bill trong modal chat inbox nó không lấy sản phẩm vào bill".

**Root cause**: `sendBillFromChat` ([tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)) gọi thẳng `BillService.sendBillToCustomer(invoiceData, ...)` mà không qua `ensureOrderLinesForBill` resolver. Trong khi `sendBillFromMainTable` thì có. Hậu quả: với invoices được store với `OrderLines: []` (đơn cũ chưa refetch), bill image render với 0 sản phẩm.

Repro verified: order `595b0000-…` (code `260501563`) trong store có `hasOrderLines: true, orderLinesCount: 0` — đúng case bug.

**Fix**:

- Expose `window.ensureOrderLinesForBill` từ [tab1-fast-sale-invoice-status.js](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js) (helper trước đây module-private).
- `sendBillFromChat` check `OrderLines.length === 0` → call `ensureOrderLinesForBill({ orderId, invoiceData, order, opts: { label: 'CHAT-BILL' } })` → resolver chạy chain: cache → `OrderStore.Details` → TPOS GetDetails refetch (last resort) → persist back vào InvoiceStatusStore.
- Re-read `invoiceData` sau resolver để có OrderLines mới merged.
- Nếu vẫn rỗng (TPOS refetch fail) → block với error notification thay vì gửi bill rỗng.

**Tests** (browser, T6 DEAL XINH):

- ✅ Direct call `ensureOrderLinesForBill(...)` cho order code 260501563: trước=0 lines, sau=1 line `[B1962H] 0805 B48 ÁO KHOÁC NÓN TAP CHỮ C` qty=1 price=260000. Persisted vào store.
- ✅ Full `sendBillFromChat` flow với mocked `sendBillToCustomer`: captured `invoiceOrderLines: 1`, sample product name match. 0 console errors.

Status: ✅ Done (auto-commits `cf4377c2` + `ec30e9a0`).

---

### [orders] STT expand fast-path — render từ report snapshot (instant) + background OData refresh

**Yêu cầu owner**: "đọc bên KPI HOA HỒNG lấy được danh sách sản phẩm theo excel đó → phần expand sản phẩm này lấy theo excel đó cho nhanh được không? → mà phải đảm bảo dữ liệu phải mới và cập nhật liên tục".

**Trước**: mỗi click STT → fetch OData `SaleOnline_Order(<UUID>)?$expand=Details` (~200-500ms / call). Spinner hiển thị, user phải chờ. Mở nhiều STT = nhiều round-trip mạng.

**Sau** ([orders-report/js/tab1/tab1-table.js](../orders-report/js/tab1/tab1-table.js)):

**Source priority cho product detail**:

1. `_productDetailCache` — recent OData fetch trong session.
2. **`_reportDetailsByOrderId`** — snapshot tải 1 lần / chiến dịch từ PostgreSQL `report_orders_v2` qua `CampaignAPI.getReport(tableName)` (cùng dữ liệu mà tab KPI HOA HỒNG dùng; populate khi user mở "Báo Cáo Tổng Hợp"). Synchronous lookup, no per-click network.
3. OData fallback (chỉ khi cả 2 cache miss).

**Bridge ID schemas**: live OData dùng UUID `Id` (`595b0000-…`) trong khi report dùng `Code` (`260501563`) làm Id. Lookup Code qua `window.allData.find(o => o.Id === orderId).Code` rồi query map bằng `codeKey`.

**Freshness guarantee** ("phải đảm bảo dữ liệu phải mới"): sau khi render từ snapshot, LUÔN fire `_refreshOrderDetailsBackground(orderId)` — silent OData fetch + `_detailsEqual()` deep compare → chỉ update DOM khi data thật sự khác. User vừa thấy instant render, vừa được auto-cập-nhật ~200ms sau nếu snapshot stale.

**Stock cell deferred**: snapshot có thể render trước khi `_detailStockMap` load xong → render một lần với hasStock=false, sau đó re-render khi stock arrives.

**Hooks pre-load** snapshot khi user chọn / đổi chiến dịch:

- [tab1-init.js:continueAfterCampaignSelect](../orders-report/js/tab1/tab1-init.js) — sau handleSearch, call invalidate + preload.
- [tab1-search.js:handleCampaignChange](../orders-report/js/tab1/tab1-search.js) — tương tự khi user đổi dropdown filter.

**Tests verified** (browser, T6 DEAL XINH 704 orders):

- ✅ Snapshot loaded: 704 orders với Details qua `CampaignAPI.getReport`.
- ✅ 1st click STT → render trong **2ms**, no spinner, table populated. Trước đây ~200-500ms với spinner.
- ✅ 3 subsequent clicks (STT 10/20/30) → 78-93ms each (chi phí DOM mutation, không network).
- ✅ Background OData fires đúng 1 lần / click → silent refresh path verified qua fetch spy.

Status: ✅ Done (commit `e44f525b`).

---

### [aikol] Default sang CF FLUX (FREE) — Gemini ẩn khỏi UI nhưng giữ làm fallback

User: "B" sau khi tôi đề xuất giữ Gemini làm safety net thay vì xóa hẳn (rủi ro CF free 10K neurons/day quota exceeded → mất gen nếu không có fallback).

**Backend**:

- `aikol-queue-worker.js:117` — default engine image đổi `gemini_3_1` → `cf_flux`.
- `aikol-queue-worker.js:230` (CF/Gemini path) — wrap CF call trong try-catch, log + fall back Gemini khi runtime fail. Track `usedProvider` để config persist đúng provider thực tế dùng.
- `aikol-generations.js:147` — auto-tune sanitize: nếu engine không nằm trong `[cf_flux, gemini_3_1, fal_pulid]` → ép về `cf_flux`.
- `aikol-generations.js:66` (`computeImageCost`) — default engine khi blank đổi `fal_pulid` → `cf_flux` (cùng giá 4cr nên không break billing cho user cũ).

**Frontend** (`generate-panel.js`):

- Engine select: `cf_flux` selected, Gemini option **xóa khỏi dropdown** (vẫn chấp nhận giá trị `gemini_3_1` nếu config cũ stored).
- Default fallback `obj.engine || 'cf_flux'` (was `gemini_3_1`).
- Cost label dùng `ENGINE_LABEL` map → tự động hiển thị đúng tên với engine bất kỳ thay vì if/else cứng.
- Bỏ "Gemini compose" mention khỏi label radio with_clip — giờ là "CF FLUX compose · Kling multi-image2video native".

**Behavior khi CF fail/quota**:

```
engine='cf_flux' + cfFlux.isAvailable()
  → try CF multiImageCompose
  → catch error → console.warn → result=null
  → fall through to geminiClone.cloneImage (paid 8cr)
  → DB log usedProvider='gemini' để biết fallback đã trigger
```

Nếu chỉ muốn dùng Gemini (skip CF), user gửi `engine: 'gemini_3_1'` trong config (vẫn route đúng).

**Verified**: syntax check 3 file passed (`node -c`). Live test cần sau khi push + Render redeploy.

### [orders] STT expand survives table re-render — fix auto-close giật

**Bug owner báo (tiếp)**: "expand STT ra 1 lúc nó tự động đóng → bị giật bảng đó → sửa bug này hoặc tối ưu giao diện". Sau fix lần trước (multi-row + scroll anchor), expand vẫn auto-close sau vài giây.

**Root cause sâu hơn**: TPOS realtime SSE liên tục fire (mỗi đơn mới / order update) → `schedulePerformTableSearch(150)` → `performTableSearch()` → `renderTable()` → `renderAllOrders()` chạy `tbody.innerHTML = initialBatch.map(...)` — wipe sạch tbody bao gồm mọi `.product-detail-row` đang mở. User thấy: mở STT → chờ vài giây → SSE fire → tbody rebuild → detail rows biến mất → table layout shrink → scroll giật.

**Fix** ([orders-report/js/tab1/tab1-table.js](../orders-report/js/tab1/tab1-table.js)):

- **Track expansion state** qua `_expandedOrderIds` Set (orderId-keyed). Add khi toggle-open, delete khi toggle-close + khi cache TTL 5min evict.
- **`_restoreExpandedDetailRows()`** — chạy sau mỗi tbody.innerHTML rebuild. Walk Set, find `tr[data-order-id]`, lookup cached details qua `_productDetailCache` (synchronous, no extra network), insert detail row + re-add `.stt-expanded` class.
- **Extract `_buildDetailRowInnerHTML(orderId, details, colCount, hasStock)`** — pure HTML builder shared giữa click-flow và post-render restore. Single source of truth, removed inline duplicate.
- **Hook restore vào mọi render path**: `renderAllOrders`, `loadMoreRows` (sau append fragment — cho expanded orders ở batch tiếp theo), `renderStandard`, `renderVisibleRows`, `renderByEmployee`.
- **Click-flow async resilience**: re-resolve detail row reference sau mỗi `await` boundary (auth fetch, OData fetch, stock fetch). Nếu re-render landed giữa await → write vào detached node → call `_restoreExpandedDetailRows()` thay thế.

**Tests** (browser, T6 DEAL XINH 704 orders):

- ✅ Expand STT 2 + 7 + 15 → 3 detail rows + 3 expanded classes.
- ✅ Trigger `window.performTableSearch()` (mô phỏng SSE re-render): tbody rebuild xong → **vẫn 3 detail rows + 3 expanded** (restored).
- ✅ Toggle close 1 row → 2 detail rows. Re-render lại → vẫn 2 (closed orderId đã removed khỏi Set, không bị "vô tình restore lại").
- ✅ 0 console errors.

Status: ✅ Done (commit `32474e5f`).

---

### [orders] STT expand — fix scroll giật khi mở nhiều đơn

**Bug owner báo**: "đơn hàng bấm vào STT để expand danh sách sản phẩm → expand nhiều quá scroll nó sẽ giật → hình như nó đóng mấy đơn kia nên giật".

**Root cause** ([orders-report/js/tab1/tab1-table.js:toggleProductDetail](../orders-report/js/tab1/tab1-table.js)): Mỗi lần click STT trên row mới, code chạy:

```js
document.querySelectorAll('.product-detail-row').forEach((row) => row.remove());
document.querySelectorAll('.stt-expanded').forEach((el) => el.classList.remove('stt-expanded'));
```

→ tất cả detail rows đang mở bị xoá batch trong cùng một frame → table-wrapper layout shrink lớn → scroll position relative tới layout cũ → user thấy giật / nhảy về vị trí khác.

**Fix**:

1. **Cho phép nhiều STT mở cùng lúc**. Bỏ block "close all others". Click STT chưa mở → chỉ thêm 1 detail row. Click STT đã mở → chỉ remove detail row đó. Mutation 1 row tại 1 thời điểm = layout shift nhỏ, browser tự handle scroll-anchor được.

2. **Scroll-anchor helper `_withScrollAnchor(anchorEl, mutate)`** + `_findScrollableAncestor(el)`: snapshot `getBoundingClientRect().top` của clicked row TRƯỚC remove → mutate → tính delta sau remove → adjust `scroller.scrollTop += delta` để pin clicked row tại y-position cũ. Defensive fallback cho trường hợp browser scroll-anchor không kick in.

**Tests** (browser session local, T6 DEAL XINH ĐÓN HÈ THÁNG 5, 704 orders):

- ✅ Click STT 1 → 1 detail row + 1 expanded class.
- ✅ Click STT 5 → **2** detail rows + **2** expanded (STT 1 vẫn mở, không bị đóng tự động).
- ✅ Click STT 10 → **3** detail rows + **3** expanded.
- ✅ Scroll-anchor: scroll STT 15 lên đầu viewport (`scrollIntoView`) → click STT 15 close → `beforeY=180, afterY=180` (deltaY=0, row pinned). 2 detail rows còn lại (STT 5, STT 25) vẫn mở.

**Files**: [orders-report/js/tab1/tab1-table.js](../orders-report/js/tab1/tab1-table.js) — bỏ close-all-others, thêm `_withScrollAnchor`/`_findScrollableAncestor`, wrap close-toggle bằng anchor.

Status: ✅ Done (auto-commit `39b9b470`).

---

### [aikol][render] Cloudflare Workers AI — env vars set live, Workers AI scoped token created via Global API key

User: "bạn vào cloudflare coi luôn đi có key và gmail rồi mà" + email `nhijudyshop@gmail.com`.

**Approach**: Cloudflare Global API key (`f9cbd...`) không gọi được Workers AI trực tiếp (Bearer fail "Invalid format" 6111). Thay vào đó dùng Global key + email với `X-Auth-Email + X-Auth-Key` headers để:

1. `GET /accounts` → Account ID `27170a8625bb696ad1c253e6b221f59e` (Nhijudyshop@gmail.com's Account).
2. `GET /user/tokens/permission_groups` → ID Workers AI Read `a92d2450...`, Workers AI Write `bacc64e0...`.
3. `POST /user/tokens` payload với `policies[].permission_groups` → token `cfut_IXSrGwSy1jE9...` status active.

**Verify**: `POST /accounts/{id}/ai/run/@cf/black-forest-labs/flux-1-schnell` với `Authorization: Bearer cfut_...` → success: true, image base64 404 KB.

**Render env** (PUT single key — không destroy other vars per MEMORY.md):

- `CF_ACCOUNT_ID = 27170a8625bb696ad1c253e6b221f59e`
- `CF_WORKERS_AI_TOKEN = cfut_***` (lưu trong Render env + memory `reference_cloudflare_creds.md`)
- (`GROQ_API_KEY` đã set từ trước)

**Lưu ý**: PUT env-vars KHÔNG auto-redeploy → phải `POST /deploys` thủ công. Deploy `dep-d7vvrrrtqb8s73fnksb0` build_in_progress.

### [aikol] Tikreel-parity comprehensive — 12 scene presets, 5 framing, style strength, Products page, Source channels

User: "tất cả" sau khi research Tikreel JS bundle (extracted SCENE_PRESETS schema, shot_type enum, payload shape).

**Shared module** ([aikol-presets.js](../aikol-studio/js/aikol-presets.js)) — dùng cả frontend (window.AikolPresets) + backend (Node require):

- 12 SCENE_PRESETS với prompt fragments: living_room, bedroom, kitchen, hotel_suite, studio_backdrop, outdoor_cafe, garden, balcony, library, rooftop, beach, art_gallery.
- 5 SHOT_TYPES: auto/full_body/three_quarter/waist_up/portrait.
- 4 BULK_PRESETS config bundles.
- Tier label functions: similarityTier, creativityTier, styleStrengthTier.

**Backend**:

- buildSceneDescription/shotTypeDirective/styleStrengthDirective trong queue-worker.
- buildProductDirective() — outfit try-on (IMAGE 1 model + IMAGE 2 outfit).
- Kling buildPrompt rewritten với 3 scene modes + framing + style.
- gen_mode='product' branch dispatch với outfit_url làm 2nd Gemini ref.
- Route sanitize: shot_type/scene_presets/style_strength validation.

**Frontend modal** (generate-panel.js):

- Variations pill 1/3/5/10. Framing select 5 modes. Scene mode 3 radios + 12 preset checkboxes. Style strength slider + tier labels live-update.

**Library**: Min views filter (Any/10K/100K/1M) + Fav-only + KB shortcuts (Esc/⌘↵).

**NEW pages**:

- products.html + js: outfit upload + scene preset → POST /products/upload-outfit + submit gen_mode='product'.
- channels.html + js: channel-level dashboard (group by username, READY/FAILED/PENDING).
- POST /products/upload-outfit + GET /channels endpoints.

**Verified live** (commit 77942c99):

| Test                   | Kết quả                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| GET /channels endpoint | ✅ 4 channels                                                                                      |
| Products page render   | ✅ 12 preset radios, 4 variations pills, "8 cr ≈ 2.664 ₫"                                          |
| Generate modal upgrade | ✅ 4 var pills, 5 shot, 3 scene radios, 12 preset checkboxes, tier labels Balanced/Strict/Balanced |

## 2026-05-09

### [orders] Chat modal — lock outer table-wrapper scroll, save+restore scrollTop

**Bug owner báo**: "khi bật modal tin nhắn inbox chat → tự động scroll xuống dưới cùng của modal → bị race condition là lâu lâu nó scroll bảng ở ngoài luôn".

**Root cause**: `_scrollChatToBottom()` ([tab1-chat-messages.js](../orders-report/js/tab1/tab1-chat-messages.js)) dùng rAF + `container.scrollTop = container.scrollHeight` + listen `img.onload` re-scroll. Khi image load trong messages → reflow → scroll event bubble lên parent chain. Outer `.table-wrapper` (overflow:auto, max-height:70vh) bắt scroll này → bảng đơn hàng phía sau modal bị di chuyển. Tới lúc đóng modal → user thấy bảng đã scroll khác vị trí ban đầu.

**Fix** ([orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js) + [orders-report/css/tab1-orders.css](../orders-report/css/tab1-orders.css)):

1. **CSS lock**: `body.chat-modal-open .table-wrapper, .table-container { overflow: hidden !important; pointer-events: none; }` — chặn user-triggered scroll (mouse wheel, touch) trên bảng phía sau khi modal mở.

2. **Snapshot + restore scrollTop**: trong `openChatModal` lưu `scrollTop`/`scrollLeft` của mọi `.table-wrapper` + `.table-container` vào `window._chatModalScrollSnapshot`. Trong `closeChatModal` restore TRƯỚC khi remove class (tránh paint intermediate state). Bắt được race programmatic-scroll (`focus()`, `scrollIntoView`) — overflow:hidden CSS không chặn programmatic scroll, snapshot là safety net duy nhất.

**Tests** (browser):

- ✅ Lock applied: `cssOverflow: "auto" → "hidden"`, `pointerEvents: "auto" → "none"` khi modal mở.
- ✅ Lock released: trở lại `"auto"`/`"auto"` khi modal close.
- ✅ Snapshot: `_chatModalScrollSnapshot` length=2 (table-wrapper + table-container) khi mở.
- ✅ Race scenario: scroll bảng tới 300 trước khi mở → modal mở → trigger `scrollIntoView` lên row cuối inside table-wrapper (race programmatic) → scrollTop nhảy về 0 — nhưng khi close modal, `topAfterClose === 300` (restored chính xác).
- ✅ `restoredCorrectly: true`.

**Files**:

- [orders-report/css/tab1-orders.css](../orders-report/css/tab1-orders.css) — body.chat-modal-open lock rule.
- [orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js) — openChatModal save snapshot + add class; closeChatModal restore + remove class.

Status: ✅ Done

---

### [aikol][kling] Multi-image2video face-swap VERIFIED end-to-end với Kling API Resource Pack

**Tiếp 08/05** sau khi user mua Trial Resource Pack ($9.8 → 100 units, 30-day) — verified Kling face-swap thực sự hoạt động:

**Verified live** (commit 04eaf718):

- Job `ccb893ee-65a6-400e-a4cf-f54cbbfa046b` (Hạnh 4 + clip 34, multi-image2video kling-v1-6, 5s std):
    - state: done sau **103 giây** (1m43s)
    - external_id: `882000498562306068` (Kling task ID)
    - kind_key: `multi-image2video`
    - **Output MP4: 3.57 MB** tại `aikol/outputs/ccb893ee-...-0.mp4` ✅ HTTP 200
- Cost: 40 cr ≈ 13.320 ₫ (no Gemini compose — saved 8cr vs Veo path)
- Pipeline: 1 step (Kling tự handle identity + scene), không cần compose tmp file
- Real Kling API consumption: ~3 units (5s × 0.6 std no-audio)

**So sánh Kling vs Veo path** (gen 17671477 trước đó):

|                | Kling multi-image2video            | Veo 2.0 + Gemini compose     |
| -------------- | ---------------------------------- | ---------------------------- |
| Steps          | 1                                  | 2 (compose + animate)        |
| Time           | 103s                               | 62s                          |
| Output size    | 3.57 MB                            | 1.05 MB                      |
| Cost           | 40 cr                              | 88 cr                        |
| Identity match | Native multi-image (Kling tự ghép) | Gemini compose → Veo animate |

Kling rẻ hơn 50% + chất lượng video lớn hơn (3.5x size = bitrate cao hơn). Default engine giờ chính là Kling.

**Pricing reference từ Kling docs** (https://kling.ai/dev/pricing):

- std × 1s × no audio = 0.6 units = $0.084
- Multi-image2video: chỉ kling-v1-6 hỗ trợ
- Resource pack: Trial $9.8 → 100 units (30% off) → ~$0.098/unit, hoặc Standard $700 → 5K units

**Important**: Kling **API Resource Pack ≠ web subscription Pro plan**. User Pro plan trên klingai.com (creative studio) KHÔNG cấp credits cho API. Phải mua Resource Pack riêng tại kling.ai/dev/pricing.

### [orders][tab3] Auto-reconcile sau upload + badge "khớp TPOS" / "SP rớt" trong history list

User: "khi gán sản phẩm upload tpos xong -> thành công -> thì chạy đối soát cho đơn đó và badge vào lịch sử luôn".

**Flow mới**:

1. [orders-report/js/tab3/tab3-upload.js](../orders-report/js/tab3/tab3-upload.js) `uploadToTPOS`: sau khi `saveToUploadHistory` xong + `removeUploadedSTTsFromAssignments`, fire-and-forget `setTimeout(() => window.postUploadReconcileV2(uploadId), 2000)` — delay 2s cho TPOS persist xong, async không block UX.
2. `uploadSingleSTT` thêm field `liveCampaignName` vào result (đọc từ `sessionData.orderInfo`) để post-upload reconcile có sẵn campaign info, không cần re-fetch.
3. `saveToUploadHistoryV2` persist thêm `missingProducts` + `liveCampaignName` cho mỗi result trong Firebase.
4. [orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js) `window.postUploadReconcileV2(uploadId)`:
    - Lookup record qua `productAssignments_v2_history/{currentUser}/{uploadId}` (fallback `guest`).
    - Mark `reconcileResult.status = 'running'`.
    - Build expectations từ `beforeSnapshot.assignments` × successful STTs trong `uploadResults`.
    - Group by `liveCampaignName`, resolve campaignId qua orderId mẫu (authoritative), fetch Excel parallel.
    - Đối soát từng (stt, productCode) với Excel TPOS đúng campaign của STT đó.
    - Write `reconcileResult: {ts, status:'done', scannedCount, matchedCount, dropCount, drops:[{stt,productCode,productName,fromCampaign}]}` (cap drops ở 200, mark `dropsTruncated:true` nếu cắt).
5. List card rendering thêm 1 stat-item badge ở row stats:
    - Chưa có reconcileResult → ⏳ "Chưa đối soát" (xám)
    - status:'running' → 🔄 "Đang đối soát" (vàng)
    - status:'error' → ⚠ "Đối soát lỗi" với title=error (vàng)
    - dropCount > 0 → ❌ "X SP rớt TPOS" (đỏ) với tooltip top-3 drops
    - dropCount === 0 → ✓ "N khớp TPOS" (xanh)

**Verify** ([scripts/verify-post-upload-recon.mjs](../scripts/verify-post-upload-recon.mjs)):

- Trigger `postUploadReconcileV2('upload_1778300860050')` → 2.4s xong, ghi Firebase: `{scanned:20, matched:20, dropCount:0, status:'done'}` ✓
- Mở list modal "Tất cả người dùng" → 20 cards render với badge tương ứng (cards cũ chưa có reconcileResult → "Chưa đối soát" xám) ✓

**UX hệ quả**: User upload xong, modal đóng → 2s sau Excel reconcile chạy nền → list card auto-update badge: thấy ngay xanh = TPOS persist đầy đủ, đỏ = có silent drop cần re-upload. Không cần click thêm gì.

**Status**: ✅ Done.

---

### [orders][tab3] Bulk recon — badge xác nhận uploads hôm nay đã được quét

User: "bấm chạy đối soát toàn chiến dịch -> thì chạy mấy cái ở dưới bảng hình 2, 3 -> nhớ đúng file excel".

**Confusion**: User upload hôm nay (`#06888131`, `#06678443`, ...) ở 9/5/2026 nhưng không thấy trong kết quả bulk recon → nghĩ bulk recon không quét uploads hôm nay.

**Forensic** ([scripts/probe-latest-uploads.mjs](../scripts/probe-latest-uploads.mjs)): 9 uploads HÔM NAY (13:09 → 09:59) đều target campaign `STORE 06/05/2026` + `HOUSE 06/05/2026` (live ngày 6/5 nhưng đơn được upload trễ vào 9/5). Bulk recon picker default `06/05/2026 [STORE+HOUSE]` đúng campaign → đã include 9 uploads hôm nay. Lý do không thấy trong dropped table: tất cả khớp 100%, không có drop nào.

**Verify** ([scripts/verify-bulk-includes-today.mjs](../scripts/verify-bulk-includes-today.mjs)) trên active 06/05 group:

```
Summary: ... Quét 40 upload chạm nhóm · Đối soát 875 bản ghi → ✅ 865 khớp · ❌ 10 TPOS không có
Drops thuộc 7 uploads CŨ: #15395627, #14838845, #41466341, #40827813, #33316385, #32240280, #31873231
9 uploads hôm nay: 0 drops (đã upload thành công 100%)
```

**Fix UX** ([orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js)):

- Tracking `todayUploadsScanned: [{shortId, tsStr, sttCount, dropCount}]` trong vòng lặp đối soát.
- Render thêm 1 alert section ngay sau summary header:
    - 0 drop: `alert-success` "Upload hôm nay đã quét — N upload, tất cả KHỚP TPOS hoàn toàn" + badges xanh `#shortId ✓`.
    - Có drop: `alert-warning` "N upload, M drop" + badges đỏ `#shortId ❌X` cho upload có drop, xanh cho upload OK.
- User xem 1 phát biết: bulk recon ĐÃ include uploads hôm nay + thành công/thất bại của từng cái.

**Live verify**: dropped table vẫn list 7 uploads cũ. Today badge mới hiển thị `#06980475 ✓ #06888131 ✓ #06678443 ✓ #06563884 ✓ #06111532 ✓ #00860050 ✓ #00678026 ✓ #00183563 ✓ #95553024 ✓` (9 badges xanh, all today's uploads → all pass).

**Status**: ✅ Done — bulk recon đúng campaign Excel + visualize trực quan uploads hôm nay đã quét.

---

### [orders][tab3] Bulk recon — quét all-users (90 ngày) độc lập với UI filter

User: "hiện tại là tháng 5 và chiến dịch mới nhất là 09/05/2026 mà??".

**Root cause** ([scripts/probe-may-uploads.mjs](../scripts/probe-may-uploads.mjs)): bulk recon trước đây dùng `uploadHistoryRecordsV2` đã bị filter bởi UI dropdown "Lịch sử của tôi" (default). DB có 164 May uploads nhưng đa số do user `guest` (158 records); user đăng nhập (admin trong test) chỉ có 0 records May → picker không thấy.

**Fix** ([orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js) `_loadAllRecentRecordsForRecon`):

- Bulk recon bây giờ scan trực tiếp Firebase `productAssignments_v2_history`, **all users**, last 90 ngày, mỗi lần click "Đối soát toàn chiến dịch".
- Independent với filter UI của list.
- Show progress message "Đang tải toàn bộ history (90 ngày, all users)…" trong khi fetch.

**Verify** ([scripts/verify-tab3-bulk-newest.mjs](../scripts/verify-tab3-bulk-newest.mjs)):

```
Top 10 picker (login admin, không broadcast active):
  1. 📅 06/05/2026 [STORE+HOUSE] — 66 upload, 774 STT (gộp 2)  ← MỚI NHẤT
  2. 📅 03/05/2026 [STORE+HOUSE] — 216 upload, 1356 STT
  3. 📅 26/04/2026 [HOUSE+STORE] — 165 upload
  4. 📅 23/04/2026 [HOUSE+STORE]
  5. 📅 19/04/2026
  6. 📅 15/04/2026 — 189 upload, 1482 STT
  7. 📅 12/04/2026
  8. 📅 09/04/2026
  9. 📅 04/04/2026
 10. 📅 01/04/2026

VERDICT: ✅ PASS — non-increasing date order, all-user data
```

Trước đây admin chỉ thấy max 23/04/2026 (admin không có May uploads); giờ thấy đủ tới 06/05 (chiến dịch mới nhất có trong DB). Khi có upload đến 09/05 thì picker tự auto-default sang đó.

**Status**: ✅ Done.

---

### [orders][tab3] Bulk recon picker — chiến dịch mới nhất lên đầu

User: "hiện chiến dịch mới nhất lên".

**Thay đổi** ([orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js) `reconcileAllInCampaignV2`):

- Thêm `parseDateMs(dStr)`: parse `DD/MM/YYYY` → epoch ms.
- Mỗi entry trong picker giờ có `dateMs` (0 nếu không parse được).
- Sort priority đổi thành: **(1) active first → (2) dateMs desc → (3) totalRecords desc tie-break**. Trước đây (1) → totalRecords desc (mới nhất bị nhấn xuống do upload count thấp hơn).

**Verify** ([scripts/verify-tab3-bulk-newest.mjs](../scripts/verify-tab3-bulk-newest.mjs)) — không broadcast active:

```
Top 10 picker (non-increasing by date):
  1. 📅 23/04/2026 [HOUSE+STORE] — 7 upload, 24 STT  ← MỚI NHẤT (default)
  2. STORE 19/04/2026 — 1 upload
  3. 📅 15/04/2026 [STORE+HOUSE] — 15 upload
  4. 📅 12/04/2026 [STORE+HOUSE] — 41 upload
  5. 📅 04/04/2026 — 2 upload
  6. 📅 01/04/2026 — 23 upload
  7. 📅 30/03/2026 — 44 upload  ← trước đây là default
  ...
VERDICT: ✅ PASS
```

Active campaign từ tab1 vẫn ưu tiên lên đầu nếu có; không active → ngày mới nhất.

**Status**: ✅ Done.

---

### [orders][tab3] Bulk recon — gộp STORE+HOUSE cùng ngày thành 1 option (KPI/overview pattern)

User: "cùng ngày của store và house -> gộp lại như bên kpi hoa hồng".

**Pattern reuse**: `overview-fetch.js` `extractDateFromCampaignName` regex `/(\d{1,2}\/\d{1,2}\/\d{4})/` rồi `fetchCampaignsFromTPOS(dateFilter)` query OData `?$filter=contains(Name,'30/12/2025')` → trả TẤT CẢ chiến dịch cùng ngày → fetch Excel cho từng campaignId rồi combine.

**Apply** ([orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js) `reconcileAllInCampaignV2`):

1. **Group by date**: extract `dd/mm/yyyy` từ campaign name → các chiến dịch cùng ngày (vd `STORE 30/03/2026` + `HOUSE 30/03/2026`) đi vào 1 picker entry với `value: "__date__:30/03/2026"`, `members: [name1, name2]`. Solo campaign hoặc không có date → giữ option riêng.
2. **Label** option gộp: `📅 30/03/2026 [HOUSE+STORE] — 44 upload, 198 STT (gộp 2)` — extract type prefix bằng cách strip date khỏi name. Standalone giữ format cũ.
3. **Run handler**:
    - Resolve campaignId cho TỪNG member parallel (qua orderId mẫu, fallback name lookup).
    - Fetch Excel parallel cho mỗi resolved campaign → build `sttToCodesByCampaign: Map<cname, Map<sttStr, Set<codeUpper>>>` (partition theo cname vì STT chỉ unique trong scope 1 campaign).
    - Walk records: cho mỗi (sttItem) có `cname ∈ memberCnameSet`, lookup ĐÚNG Excel của campaign đó (`sttToCodesByCampaign.get(recCname).get(stt)`) → cross-check productCode.
    - Skip campaign nào fetch fail, list ra dưới `failed` notice.
4. **Display**: header alert `"Chiến dịch gộp 2: HOUSE 30/03/2026 + STORE 30/03/2026 — id <8char> · <8char>"`. Drop badge có tag `[HOUSE]`/`[STORE]` để biết STT thuộc campaign nào.

**Verify** ([scripts/verify-tab3-bulk-merged.mjs](../scripts/verify-tab3-bulk-merged.mjs)) trên active = "STORE 30/03/2026":

- Picker default = `📅 30/03/2026 [HOUSE+STORE] — 44 upload, 198 STT (gộp 2) 👀 đang xem` ✓
- Top 5 picker entries đều là gộp 2 (30/03, 12/04, 01/04, 22/03, 15/04) — confirm pattern phổ biến ✓
- Auto-run → 18ms render: `Chiến dịch gộp 2: HOUSE 30/03/2026 + STORE 30/03/2026 — id 215757aa… · b2a4dcc6… Excel TPOS gồm 173 STT · Quét 27 upload · Đối soát 198 bản ghi → ✅ 181 khớp · ❌ 17 TPOS không có` ✓
- Sample drop: `B905 [HOUSE]#46038765 → ❌ 102` — tag `[HOUSE]` rõ ràng ✓

**So sánh** trước-sau:

| Mode                  | Upload | Bản ghi | Drops  | Time  |
| --------------------- | ------ | ------- | ------ | ----- |
| Trước (chỉ STORE)     | 23     | 110     | 9      | 698ms |
| Sau (gộp HOUSE+STORE) | **27** | **198** | **17** | ~1s   |

→ User chỉ cần 1 click (hoặc 0-click với auto-run khi active) là cover full ngày, không phải đối soát STORE rồi đối soát HOUSE riêng.

**Status**: ✅ Done.

---

### [orders][tab3] Bulk recon auto-pick chiến dịch đang xem (KPI tab pattern)

User: "coi tab kpi hoa hồng cách nó tải excel theo chiến dịch đang chọn làm theo và đối soát tất cả".

**KPI tab pattern**: `tab-kpi-commission.js` `syncCampaignFromParent` đọc `window.parent?.campaignManager?.activeCampaign` rồi auto-select option matching trong dropdown filter `kpiFilterCampaign`. Tab3 không thể đọc trực tiếp do iframe boundary, nhưng đã có sẵn cơ chế: tab1 broadcast postMessage `CAMPAIGN_CHANGED_FOR_TAB3` mỗi khi user đổi campaign → tab3-core.js mirror vào `state.activeCampaignNames`.

**Apply** ([orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js) `reconcileAllInCampaignV2`):

- Đọc `state.activeCampaignNames` (mảng tên campaign user đang xem ở tab1).
- Hàm `findActiveMatch(cname)`: case-insensitive trim equal so với active names.
- Sort options: chiến dịch đang xem lên đầu, rồi mới đến recordCount desc.
- Render mỗi option: `<name> 👀 đang xem — N upload, M STT` nếu là active.
- Hint section: nếu default = active → "Tự chọn chiến dịch đang xem"; nếu active không có upload trong history → "chọn chiến dịch khác"; nếu không có active → "chọn từ dropdown".
- **Auto-run**: nếu default option khớp active campaign → `setTimeout(() => runBtn.click(), 50)` → UX 0-click.

**Verify** ([scripts/verify-tab3-bulk-active.mjs](../scripts/verify-tab3-bulk-active.mjs)):

- Simulate `postMessage({type: 'CAMPAIGN_CHANGED_FOR_TAB3', campaignNames: ['STORE 30/03/2026']})` → `state.activeCampaignNames = ["STORE 30/03/2026"]` ✓
- Click "Đối soát toàn chiến dịch" → picker default = `STORE 30/03/2026 👀 đang xem — 23 upload, 110 STT` ✓
- Auto-run kick off → 18ms sau render kết quả: ✅ 101 khớp · ❌ 9 TPOS không có ✓
- Verdict: ✅ PASS — auto-pick + auto-run on active campaign.

**Status**: ✅ Done — UX 0-click cho case phổ biến (vào tab3 với campaign đã chọn ở tab1, click 1 nút → ra kết quả ngay).

---

### [orders][tab3] Nút "Đối soát toàn chiến dịch" — 1 Excel × N uploads chạm chiến dịch

User: "cho nút đối soát tất cả ở chiến dịch hiện tại".

**Implementation**:

1. [orders-report/tab3-product-assignment.html](../orders-report/tab3-product-assignment.html): thêm button `<button id="reconcileAllCampaignBtn" class="btn-warning">Đối soát toàn chiến dịch</button>` vào header của modal "Lịch Sử Upload TPOS v2", cạnh close button. Panel kết quả `#bulkReconcileResults` ngay phía trên filter row.
2. [orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js) `window.reconcileAllInCampaignV2`:
    - Quét toàn bộ `uploadHistoryRecordsV2` hiện đang load → collect unique `liveCampaignName` + đếm số upload + tổng STT × product chạm mỗi campaign + sample orderId.
    - Render dropdown sorted desc theo recordCount, mỗi option `"<name> — N upload, M STT"`.
    - User pick chiến dịch + click "Chạy đối soát" → resolve campaignId qua `_resolveCampaignIdByOrderId(sampleOrderId)` (authoritative, fallback name lookup) → fetch Excel TPOS **1 lần duy nhất** → walk lại tất cả records, đối soát từng `(stt, productCode)` thuộc campaign đó với Excel.
    - Render summary + bảng drops grouped theo `productCode`, mỗi badge `"#<recordShortId> → ❌ <stt>"` để trace ngược về upload nào chứa drop.

**Performance**: với 23 upload chạm cùng 1 chiến dịch, bulk reconcile = **1 Excel fetch + 110 in-memory comparisons** (~860ms total). So sánh per-upload sẽ tốn 23 Excel fetch + N OData order GET = nhiều giây hơn chục lần.

**Verify** ([scripts/verify-tab3-bulk-recon.mjs](../scripts/verify-tab3-bulk-recon.mjs)):

- Header button render `Đối soát toàn chiến dịch` ✓
- Click → picker hiện 19 chiến dịch unique từ history, sorted theo `recordCount` desc.
- Default `STORE 30/03/2026 — 23 upload, 110 STT`
- Click "Chạy đối soát" → 860ms render kết quả: Excel TPOS có 84 STT, quét 23 upload, đối soát 110 bản ghi → ✅ 101 khớp · ❌ 9 TPOS không có.
- Sample drop: B900 → upload `#45930477` → ❌ STT 160 — trace ngược dễ ràng.

**Status**: ✅ Done.

---

### [orders][tab3] Nút "Đối Soát TPOS" ngoài history list + resolve campaignId từ orderId (chính xác hơn name lookup)

User: "ở ngoài này có nút chạy đối soát không? và quan trọng là bạn phải tải đúng file excel của đúng chiến dịch đó".

**Thay đổi** ([orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js)):

1. **Nút outer list**: mỗi card upload trong "Lịch Sử Upload TPOS v2" thêm nút `<button class="btn-warning">⬇ Đối Soát TPOS</button>` cạnh "So Sánh Giỏ" + "Xem Chi Tiết". Click → wrapper `reconcileFromListV2(firebaseKey, userId)` mở detail modal rồi auto-chạy reconcile (1-click thay vì 2).

2. **Authoritative campaignId resolution** (`_resolveCampaignIdByOrderId`):
    - Trước: chỉ dùng `_resolveCampaignIdByName(cname)` query OData `SaleOnline_LiveCampaign?$filter=Name+eq+'...'` rồi pick row đầu (sort `DateCreated desc`). Vấn đề: tên chiến dịch trùng giữa các shop / chiến dịch bị rename → có thể tải nhầm Excel.
    - Giờ: pick 1 STT bất kỳ trong nhóm → lấy `uploadResults[stt].orderId` → `GET SaleOnline_Order(orderId)?$select=Id,LiveCampaignId,LiveCampaignName` → đọc thẳng `LiveCampaignId` (GUID, unique) từ chính order trên TPOS. Tên chỉ dùng để hiển thị/group key.
    - Fallback name lookup chỉ khi nhóm không có orderId.
    - Hiển thị: nếu TPOS đang đặt tên khác snapshot → `<code>HOUSE 06/05/2026</code> (TPOS hiện: <code>NEW NAME</code>) → dcb29150…` (8 ký tự đầu GUID làm bằng chứng tải đúng).

3. **Dedupe theo campaignId**: 2 group keys khác nhau có thể trỏ về cùng campaignId sau resolve → fetch 1 Excel duy nhất thay vì duplicate.

**Verify** ([scripts/verify-tab3-recon-list-button.mjs](../scripts/verify-tab3-recon-list-button.mjs)):

- Mở modal Lịch Sử Upload V2 → **20/20 cards** có button "Đối Soát TPOS" mới ✓
- Click `reconcileFromListV2` cho upload `#32240280` → auto-mở detail + chạy reconcile (~24s e2e)
- Kết quả: ✅ 31 khớp · ❌ 3 TPOS không có (giống verify trước fix, không regression)
- Excel line: `STORE 06/05/2026 → 057f56c3… · HOUSE 06/05/2026 → dcb29150…` (GUID prefix làm bằng chứng tải đúng campaign)
- 3 silent drops thực: B914 → STT 157 · B1907M → STT 47 · B1907L → STT 178

**Status**: ✅ Done.

---

## 2026-05-08

### [orders][tab3][fix] Đối soát Excel — sửa parse STT: dùng cột `###` (SessionIndex) thay vì `STT` (row counter)

User browser-test lại nút Đối Soát → kết quả lúc đầu trả `0 khớp · 31 không có · 3 không kiểm được` cho upload #32240280. Trông sai (vì lần fix trước đó chỉ confirm B914→STT 157 missing, không phải toàn bộ).

**Sanity check** ([scripts/sanity-check-recon.mjs](../scripts/sanity-check-recon.mjs) — direct OData GET cho 6 sample (STT, product) đã bị flag là rớt):

- STT 87 / B1895D, STT 48 / B914, STT 6 / B914, STT 33 / B914, STT 53 / B1907S → TPOS thực tế **CÓ** sản phẩm. Chỉ STT 47 / B1907M là true positive.
- ⇒ Reconcile đang false-positive 5/6 spot checks.

**Inspect Excel** ([scripts/inspect-excel-rows.mjs](../scripts/inspect-excel-rows.mjs)):

- TPOS Excel header (row 3): `STT, ###, Kênh, Mã, Facebook, Email, Tên, ..., Sản phẩm, ...`
- **Cột `STT`** (column 1) = row counter 1..N (chỉ là số dòng trong báo cáo). Excel STT=33 trỏ đến order `Mã 260501294 — Như Hạnh Dương Tâm` với `[B1898D]` — không liên quan tới SessionIndex 33.
- **Cột `###`** (column 2) = SessionIndex thực của order. Excel STT=87 có `###: 247`, STT=48 có `###: 388`, …

→ Bug: parser dùng `sampleKeys.find((k) => /STT/i.test(k))` → match cột "STT" (row counter) → mọi (stt, product) đều mismatch trừ khi SessionIndex tình cờ = row index.

**Fix** ([orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js) `_fetchCampaignExcel`):

```js
const sttKey =
    sampleKeys.find((k) => k === '###') ||
    sampleKeys.find((k) => /Số\s*thứ\s*tự|SessionIndex/i.test(k)) ||
    sampleKeys[1] ||
    sampleKeys[0]; // fallback: column index 1
```

**Verify** ([scripts/verify-tab3-reconcile.mjs](../scripts/verify-tab3-reconcile.mjs)):

- Đối soát 34 bản ghi → **✅ 31 khớp · ❌ 3 TPOS không có**
- 3 silent drops thực sự: **B914 → STT 157** (user's original bug), **B1907M → STT 47**, **B1907L → STT 178**.
- Match với sanity-check OData direct: STT 47 / B1907M `tposHasExpected: false` ✓

**Status**: ✅ Fixed — parser column resolution sai → 100% false-positive trước đó. Giờ kết quả khớp với reality.

---

### [orders][tab3] Đối soát Excel TPOS trong Lịch Sử Upload — soi sản phẩm bị rớt sau khi upload

User: thêm tính năng "check lại" cho tab Gán Tag Sản Phẩm, học cách KPI tab tải Excel TPOS để biết product nào bị rớt.

**Pattern reuse**: KPI tab (`tab-kpi-commission.js` `fetchRefundedOrderCodes`) + overview-fetch.js dùng `POST /api/SaleOnline_Order/ExportFile?campaignId=N` → XLSX binary, mỗi row = 1 SaleOnline_Order với cột "Sản phẩm" gồm danh sách `[CODE] Name SL: x Giá: y` thực tế trên TPOS. Áp dụng pattern này cho tab3.

**Implementation** ([orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js) `renderUploadHistoryDetailV2` + `window.reconcileUploadWithTPOSV2`):

- Modal "Chi Tiết Upload" thêm header section + button **"Tải Excel TPOS & đối soát"** + container `#tab3ReconcileResults`.
- Khi click:
    1. Group `record.beforeSnapshot.assignments[].sttList[].orderInfo.liveCampaignName` → unique campaignNames.
    2. Resolve mỗi campaignName → TPOS `Id` (GUID) qua OData `/api/odata/SaleOnline_LiveCampaign?$filter=Name+eq+...` (fallback `contains`). Cache trong session.
    3. Parallel fetch Excel cho mỗi campaignId → parse `range:2` (skip 2 title rows), tìm cột STT + cột "Sản phẩm" linh hoạt theo regex (TPOS đôi khi rename), regex `[CODE]` extract product codes uppercased, build `Map<sttStr, Set<codeUpper>>`.
    4. Cross-check mỗi `(stt, productCode)` từ `beforeSnapshot.assignments`: trong Excel TPOS = ✅, không có = ❌ "rớt", STT không có trong Excel hoặc campaign không resolve = ⚠ "không kiểm được".
    5. Render summary `✅ N khớp · ❌ M rớt · ⚠ K không kiểm được`, table dropped grouped theo productCode kèm các STT badge ❌, `<details>` chứa danh sách "không kiểm được".
- XLSX library lazy-load nếu chưa có.

**Verify** ([scripts/verify-tab3-reconcile.mjs](../scripts/verify-tab3-reconcile.mjs)) trên upload **#32240280** (chính cái user phát hiện B914 → STT 157):

- Resolve 2 campaign: `HOUSE 06/05/2026` (id `dcb29150…`), `STORE 06/05/2026` (id `057f56c3…`) ✓
- Đối soát 34 bản ghi (STT × product): **0 khớp · 31 TPOS không có · 3 không kiểm được**
- Top dropped: **B914 (14 STTs gồm 157, 6, 93, 77, 76, 75, 48, 68, 36, 43, 38, 35, 33, 12)**, B1895D (5 STTs), B1907L (5 STTs), B1895N (3 STTs), B1907M/S (2 STTs each)…
- Confirm hậu quả phạm vi rộng của bug silent-drop trước fix post-PUT verify: gần như cả upload bị TPOS từ chối lưu, không chỉ B914.

**UX value**: Sau mỗi upload, user click "Đối Soát TPOS" trong Chi Tiết → soi 1 phát ra mọi sản phẩm chưa lưu được → re-gán + re-upload đúng cái thiếu thay vì đoán mò.

**Status**: ✅ Done — single feature trong tab3-history-v2.js (~250 dòng add), không đụng upload-time logic, hoạt động cho cả historical records.

---

### [orders][tab3] Upload TPOS PUT 200 nhưng silent drop sản phẩm — verify post-PUT, badge ❌ trong lịch sử

**Bug user báo**: Tab "Gán Sản Phẩm - STT" → Lịch Sử Upload #32240280 hiện rõ B914 (3103 B9 ĐỒNG HỒ BBR NU FULL BOX) đã upload cho STT 157 (kèm 13 STT khác). Sang Quản Lý Đơn Hàng → đơn STT 157, kiểm tra giỏ + lịch sử **không có** B914. Nghi race condition.

**Forensic** ([scripts/debug-upload-stt157.mjs](../scripts/debug-upload-stt157.mjs) + [scripts/debug-product-fetch.mjs](../scripts/debug-product-fetch.mjs)):

- Upload `upload_1778132240280` (timestamp 2026-05-07 05:37 UTC, user `guest`, status `completed`):
    - `uploadResults[stt=157]`: `success:true`, `orderId:01770000-…b9c1-08deabef01e5`, `existingProductsCodes:[Q281T,Q281D1,Q281N]`.
    - `beforeSnapshot.assignments[B914].sttList` chứa `"157"`.
- Upload kế tiếp đụng STT 157 (`upload_1778226952230`, 2026-05-08 07:56) ghi nhận `existingProductsCodes:[Q281T,Q281D1,Q281N]` — **không có B914** dù chưa có removal nào ghi (`productRemovals_history` rỗng cho STT 157).
- Live TPOS state hiện tại: `[Q281T, Q281D1, Q281N, Q279X, Q279N]` (5 sản phẩm, **B914 vắng**). `Product(152750)` (B914) trên TPOS Active=true, có giá → KHÔNG phải fetchProductDetails fail.

→ **Upload trả HTTP 200 nhưng TPOS không persist B914**. Nguyên nhân chính xác phía TPOS chưa rõ (silent drop / race / validation lặng), nhưng lỗi-class lặp lại được: client tin tưởng HTTP 200 = success, không verify bằng GET sau.

**Fix**:

1. [orders-report/js/tab3/tab3-upload.js](../orders-report/js/tab3/tab3-upload.js) `uploadSingleSTT`: ngay sau PUT 200, GET lại `SaleOnline_Order(orderId)?$expand=Details($expand=Product)`, đối chiếu `sessionData.products[].productId` với `Details[].Product.Id`. Sản phẩm nào thiếu → return `success:false`, `error:"TPOS không lưu sản phẩm sau PUT (silent drop): <codes>"`, `missingProducts:[…]`. STT bị verify-fail sẽ KHÔNG bị xóa khỏi `state.assignments` (`removeUploadedSTTsFromAssignments` chỉ filter theo `success:true`) → user thấy giỏ còn nguyên để retry.
2. [orders-report/js/tab3/tab3-history-v2.js](../orders-report/js/tab3/tab3-history-v2.js) `renderUploadHistoryDetailV2`: build `sttOutcome` map từ `record.uploadResults`, render mỗi STT trong cột "Mã đơn hàng" thành badge — `bg-success ✓ 157` cho thành công, `bg-danger ❌ 157` cho thất bại (kèm `title=error` tooltip), tra cứu `missingProducts` để cũng đỏ hóa STT-product cụ thể bị silent drop dù STT tổng `success:true`. Records cũ (như #32240280) vẫn xanh vì historic data lưu `success:true` — không thể rewrite quá khứ; chỉ kết quả upload SAU khi deploy mới được tô màu chính xác.

**Verify** ([scripts/verify-tab3-history-modal.mjs](../scripts/verify-tab3-history-modal.mjs)): mở modal Chi Tiết Upload #32240280, parse HTML → mỗi STT render thành `<span class="badge bg-success">✓ 157</span>` (đúng kỳ vọng historical record). Modal HTML 6.7KB, không pageerror. `node --check` pass cho 2 file sửa.

**User action required**: B914 trên STT 157 hiện KHÔNG CÓ trong TPOS — user cần re-gán B914 → STT 157 → upload lại. Nếu lần này TPOS lại silent drop, post-PUT verify sẽ phát hiện và surface error message + giỏ giữ nguyên để retry.

**Status**: ✅ Done — fix tab3-upload.js (post-PUT verify) + tab3-history-v2.js (badge per STT).

---

### [aikol][kling] Native multi-image2video face-swap + Kling default video + cost warn > 5K₫

User: log in Kling account, save key vào `serect_dont_push.txt`, browse docs, đưa Kling thành mặc định + thông báo > 5.000 ₫.

**Browser docs research** (https://kling.ai/document-api):

- Endpoint mới `POST /v1/videos/multi-image2video` — up to 4 reference images. Perfect cho face-swap workflow:
    - `image[0]` = model face (KOL portrait)
    - `image[1]` = clip cover frame (target scene)
    - → 1 API call thay vì Gemini compose + animate (2-step).
- Base URL `api-singapore.klingai.com` (better latency cho VN).
- Available models: kling-v1 → kling-v3 (newest, native 4K). Multi-image-only-supports-kling-v1-6.

**Service** ([aikol-kling-service.js](../render.com/services/aikol-kling-service.js)):

- Default: `kling-v2-5-turbo` (general). Multi-image: `kling-v1-6` (chỉ model này support).
- New `submitMultiImage2Video({imageUrls, config, note})` — gọi `/v1/videos/multi-image2video`.
- Base singapore region.

**Worker** ([aikol-queue-worker.js](../render.com/services/aikol-queue-worker.js)):

- Engine default video → `kling`.
- with_clip + Kling: native multi-image2video (no compose) — saves 8cr + ~20-30s latency.
- with_clip + Veo: vẫn cần Gemini compose pre-step (Veo only accepts 1 image).
- auto_scene + Kling: image2video.

**Cost** ([routes/aikol-generations.js](../render.com/routes/aikol-generations.js)):

- with_clip + Veo: cộng 8cr Gemini compose.
- with_clip + Kling: KHÔNG cộng (native multi-image).

**UI** ([generate-panel.js](../aikol-studio/js/generate-panel.js)):

- Engine video default Kling. Label: "Kling multi-image2video — native face-swap (8-13cr/s ⭐ · 1 step, không cần compose)".
- **Cost warn > 5.000 ₫**: confirm modal trước submit để tránh burn accidental. `aikolConfirm` nếu có (custom modal đẹp), fallback `window.confirm`.

**Render env updated**: `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` (verified PUT 200).

**Verified live** (commit 201e9b5f):

- Job `afd08153-…` (Hạnh 4 + clip 34, multi-image2video, 40 cr): submit reach Kling endpoint → `Account balance not enough (code 1102)` → refund chạy đúng (balance 4559 → 4599).
- Auth + endpoint + refund logic verified end-to-end.
- **Pending**: user top-up Kling account tại klingai.com để gen thực sự ra MP4. Code path đã sẵn sàng — chỉ cần balance.

### [orders][perf] Hard-reload main.html → chọn chiến dịch load lâu — image-cache bypass `loading="lazy"`

**Bug**: User báo hard-reset vào `https://nhijudyshop.github.io/n2store/orders-report/main.html` rồi chọn chiến dịch → load rất lâu.

**Root cause** (đo bằng [scripts/debug-campaign-load-perf.mjs](../scripts/debug-campaign-load-perf.mjs) trên localhost — Playwright headless, login admin, hard-nav, modal pick campaign, đếm request + thời gian):

- 1 lần chọn chiến dịch tải 51 đơn: **1987 request** trong cửa sổ thay đổi, **1670 cái > 500ms**.
- Top group: **`/api/image-proxy` 770 request, max 16,400ms, tổng 6,576s cumulative** → vượt giới hạn HTTP/2 stream cùng host → `ERR_HTTP2_SERVER_REFUSED_STREAM` → odata/realtime cùng host bị queue 16-30s.
- Thêm `loading="lazy"` lên `<img>` product (orders-merge, dropped-products-manager, sale-modal, address-stats, edit-modal, search-functions) **không đủ** vì [shared/js/image-cache.js](../shared/js/image-cache.js) `autoCacheImg` MutationObserver gọi `getUrl()` → `fetch()` ngay sau khi DOM insert → **bypass** native lazy. Cộng thêm [shared/js/tpos-image-proxy.js](../shared/js/tpos-image-proxy.js) `rewriteImg` cũng gọi `setImgSrc` trực tiếp.

**Fix**:

1. `image-cache.js` `autoCacheImg`: thêm `IntersectionObserver` (rootMargin 200px) — nếu `<img loading="lazy">`, hoãn `setImgSrc(src)` cho tới khi sắp lọt viewport. Mem-cache fast path vẫn chạy đồng bộ để tránh flicker.
2. `tpos-image-proxy.js` `rewriteImg`: nếu img đã có `loading="lazy"`, **không** gọi `setImgSrc` trực tiếp — để ImageCache MutationObserver pick up + defer qua IO. Img không lazy → wire ngay như cũ.
3. Thêm `loading="lazy" decoding="async" fetchpriority="low"` cho mọi product `<img>` (8 chỗ ở `orders-report/js/{tab1,managers,utils}/...`).

**Result** (cùng kịch bản, chiến dịch "T6 DEAL XINH ĐÓN HÈ THÁNG 5", 51 đơn):

| Metric                         | Before    | After                              |
| ------------------------------ | --------- | ---------------------------------- |
| Total requests / change window | 1987      | **167**                            |
| Slow (>500ms)                  | 1670      | **61**                             |
| `/api/image-proxy` requests    | 770       | **0 in top groups**                |
| Image-proxy cumulative ms      | 6,576,134 | (deferred tới scroll)              |
| `/api/odata/FastSaleOrder` max | 28,895ms  | **1,125ms** (hết queue contention) |

Order rows + customer FB avatars vẫn render (42 fb-avatar req cho ~50 dòng visible). Off-screen product thumbnails chỉ fetch khi scroll tới.

**Status**: ✅ Done — fix shared/js/image-cache.js + tpos-image-proxy.js (defer logic), 8 file orders-report (lazy/async/low-priority attr).

---

### [aikol] AI Tools gate (default OFF) + cost theo engine + Gemini compose step

User: "cho vào setting toggle disable AI web mặc định tắt không cho dùng, khi vào setting bật lên mới được dùng" + "tính tiền mà AI đang chọn dùng để tạo 1 clip luôn".

**Feature gate** ([aikol-feature-gate.js](../aikol-studio/js/aikol-feature-gate.js)):

- localStorage `aiToolsEnabled` (default OFF, user phải toggle ON).
- aikol-studio/index.html: chip toggle ở header + banner "AI Tools đang TẮT" che dashboard sections khi tắt.
- Sub-pages (library, models, history, bulk, campaigns) early-redirect về `index.html#disabled` khi flag tắt — chặn API call trước khi page load.
- navigation-modern.js: `aiToolFeature: true` flag cho gemini-ai → ẩn khỏi nav khi tắt. `aikol-studio` root KHÔNG flag (entry point cho toggle, luôn accessible). Áp dụng filter ở `_isPageAccessible` + `getAccessiblePages`.

**Cost theo engine** + Gemini compose step:

- Backend `routes/aikol-generations.js` `computeVideoCost`: with_clip + video → cộng thêm 8 cr (Gemini compose) vào tổng cost. Nếu user chọn Veo 5s + with_clip → 16×5 + 8 = 88 cr (đúng số credits thật pipeline tốn).
- Frontend `generate-panel.js` `refreshCostLabel`: hiển thị breakdown đầy đủ trước submit:
    - Image: `8 cr (Gemini 3.1 × 1)` hoặc `4 cr (Fal PuLID × 1)`.
    - Video without clip: `80 cr (Veo 5s × 16cr)`.
    - Video with_clip: `88 cr = 80 (Veo 5s × 16cr) + 8 (Gemini compose)`.

**Verified live** (commit c51f9878):

| Test                                 | Kết quả                                              |
| ------------------------------------ | ---------------------------------------------------- |
| Default state OFF → nav library.html | ✅ Auto-redirect `index.html#disabled`               |
| Toggle ON → state synced             | ✅ `aiEnabled=true`, banner ẩn, label "BẬT"          |
| Sub-page accessible sau toggle ON    | ✅ library.html load + Generate btn visible          |
| Cost breakdown UI                    | ✅ "88 cr = 80 (Veo 5s × 16cr) + 8 (Gemini compose)" |

### [aikol][prompts] Deepfake-grade face-swap prompts cho TikTok-style KOL clone

User: "deepfake đó". Bỏ vague identity-preserve language, viết hard-spec deepfake-quality directive với hierarchy of priorities + concrete anatomical anchors + forbidden list (chống AI beauty drift).

**Stage 1 — Gemini compose** ([aikol-gemini-clone-service.js](../render.com/services/aikol-gemini-clone-service.js)):

- Tách section: # TASK / # INPUTS / # PRIORITY 1-3 / # FORBIDDEN / # OUTPUT.
- PRIORITY 1 (face fidelity): liệt kê 11 nhóm features anatomical (eyes, brows, nose, mouth, jawline, mid/upper face, hair, skin, identity markers).
- PRIORITY 2 (scene integration): everything else from IMAGE 2 (pose, outfit, lighting, camera, color grade).
- PRIORITY 3 (naturalness): re-light face theo IMAGE 2 lighting nhưng KHÔNG thay geometry; seamless edge blending tại jawline/neckline; skin texture natural pores (KHÔNG airbrush/Instagram filter).
- FORBIDDEN: 8 common deepfake failure modes — beautify, symmetry-correct, age-shift, hybridize, ethnicity-shift, AI-face glow.

**Stage 2 — Veo animate** ([aikol-queue-worker.js](../render.com/services/aikol-queue-worker.js)):

- # PRIORITY 1 FACE LOCK: same person beyond doubt mọi frame.
- # ALLOWED MOTION whitelist: head ≤10°, eye blinks, brow micro-expr, breath rise & fall, body sway ≤5°, hair physics.
- # FORBIDDEN MOTION: head rotation >15°, walking/dancing, mouthing words, camera moves, scene change.
- # SCENE CONTINUITY: background, lighting, camera, color grade IDENTICAL.

Veo prompt slice cap 1500→2500 (Veo limit ~4000 per docs). Verified gen `73a9fc28-…` done MP4 1.16 MB sau 59s.

### [aikol] Comprehensive audit — 11 fixes (3 CRITICAL + 7 HIGH + 1 MED) + auto-tune cho identity match

User: "kiểm tra lại tất cả race condition, bug,... quan trọng là phải ghép mặt model 100% vào clip".

Code-review parallel agent phát hiện 15 issues (3 CRITICAL + 7 HIGH + 4 MED + 1 LOW). Fix 11 cái có impact trực tiếp lên identity-match quality + production stability:

**CRITICAL** (block production):

1. **State machine race**: `pickPending` flip `'pending'→'dispatching'` atomic trong CTE. Trước đây chỉ flip `started_at`, row vẫn `state='pending'` → re-pick trên restart hoặc multi-instance. Thêm `recoverStuckDispatching()` reset rows quá `DISPATCH_TIMEOUT_MS=90s` về pending.
2. **dispatching→running atomic**: thêm guard `WHERE state='dispatching'` cho UPDATE. Persist `composite_key` vào config cho cleanup hook.
3. **Compose silent fallback** ([aikol-queue-worker.js](../render.com/services/aikol-queue-worker.js)): Trước đây `try/catch` swallow Gemini error → Veo animate model gốc thay vì composite → identity-match BỊ PHÁ HỎNG. Đổi sang throw → markError + refund + surface clear reason.

**HIGH**:

4. Gemini error response: extract `text` part + `safetyRatings` → user thấy lý do block (`SAFETY` / `IMAGE_SAFETY` / `RECITATION` cụ thể).
5. Veo 2.0 duration buckets `{5, 8}` (KHÁC Veo 3.x `{4, 6, 8}`). Auto-quantize theo regex model.
6. `outputs INSERT` idempotent qua `WHERE NOT EXISTS` pattern (works without UNIQUE constraint). Migration SQL thêm constraint optional cho perf về sau.
7. Remove balance pre-check race — chỉ rely vào `chargeCredits` `WHERE balance >= $2`. `chargeCredits` return balance từ trong transaction → response consistent với commit state.

**MED**:

8. Wrap raw note với `buildAutoSceneDirective` cho with_clip + no clip cover edge case (identity-lock không bypass).
9. Merge 2 clip queries → 1 (`file_path + cover_url + download_status`) tránh stale.
10. `cleanupComposite()` helper: `bunny.deleteObject(tmp/...)` sau poll done/error → tmp file không accumulate.

**AUTO-TUNE** (route POST /generations) khi `gen_mode='with_clip'`:

- `similarity = max(80, input)` → strong identity anchor
- `creativity = min(30, input)` → giảm Veo/Gemini face drift
- `keep_pose, keep_outfit, keep_bg, keep_lighting = true` → giữ scene clip
- `engine` ép `gemini_3_1` (image) / `veo_3_1` (video) nếu chưa set/set bậy
- User opt-out qua `auto_tune: false` trong config

**Bonus fixes**:

- `compositeKey` scope: declare function-level (trước đây else-block scope gây ReferenceError trong final UPDATE).
- UPDATE `state='done'` thêm guard `WHERE state IN ('running','dispatching')` chống ghi đè terminal.

**Verified live** (commit eb89593c):

| Test               | Job ID       | Kết quả                                                                              |
| ------------------ | ------------ | ------------------------------------------------------------------------------------ |
| Auto-tune coercion | `61848f70-…` | ✅ similarity 50→80, creativity 80→30, keep\_\* true                                 |
| Composite cleanup  | (đã xóa)     | ✅ HTTP 404 sau done/error                                                           |
| Hạnh 4 + clip 34   | `2689af62-…` | ✅ done, MP4 1.3 MB sau 77s                                                          |
| Hạnh 4 + clip 4    | `ac7dd841-…` | ⚠ Veo content policy block (clip 4 cover-specific, not code bug) — refund+cleanup OK |

Issues còn lại (LOW priority, deferred):

- `aikol-queue-worker.js` poll error throws bubble lên log không markError → 20-min timeout limbo (acceptable).
- Veo prompt truncation 1500 chars (đủ cho hiện tại, prompts ≤ 800 chars).

### [aikol][prompts] Identity preservation 100% pixel-level — strengthen directives ở cả 3 stage

User: "ghép phải giống 100% mặt model càng giống càng tốt".

Strengthen prompts ở 4 chỗ để identity match pixel-level beyond doubt:

1. **Gemini compose** ([aikol-gemini-clone-service.js](../render.com/services/aikol-gemini-clone-service.js#L51-L95)):
    - Tách rõ "IMAGE 1 (reference person)" vs "IMAGE 2 (target scene)".
    - Liệt kê tường minh anatomical features phải giữ pixel-level: eye shape, eye color, eyebrow, nose, mouth, lip line, jawline, chin, cheekbones, ears, face shape, hairline, hair color/texture, skin tone, freckles, moles, makeup, age, ethnicity, gender.
    - Anchor "INDISTINGUISHABLE" + "same person beyond doubt".
    - Negative directive: do NOT smooth/beautify/idealize/age-shift/stylize/blend với IMAGE 2.
2. **Veo animate default** ([aikol-veo-service.js](../render.com/services/aikol-veo-service.js#L75-L88)): "Lock the face" + whitelist allowed motion (head turn ≤10°, micro-expressions, blinks, breathing, body sway, hair) + "preserve EXACT identity across every frame".
3. **Worker compose-Veo prompt** ([aikol-queue-worker.js](../render.com/services/aikol-queue-worker.js#L233-L250)): Same identity-lock language khi Veo nhận composite từ Gemini → tránh face drift trong frames animation.
4. **Worker auto_scene + clone-from-image route**: apply same fidelityCore liệt kê features khi place model vào scene mới.

**Verified live** (commit fd8dd47a):

- Job `59f367be-6ec6-431a-b52a-8359f6fec9dd` (Hạnh 4 + clip 4): state=done, 45s, MP4 1.67 MB.
- Composite (Gemini): `aikol/tmp/59f367be-...-composite.jpg` ✅ HTTP 200.
- Output (Veo 2.0): `aikol/outputs/59f367be-...-0.mp4` ✅ HTTP 200.
- Error column clean (Veo 2.0 không hit audio safety + stale-error fix giữ).

### [aikol][veo] Hạnh 4 ghép video không được — root cause Veo 3.1 audio safety filter

User báo: "model Hạnh 4 ghép video không được". Recent fail gen `64c1e13b-…` lỗi generic "Veo done but no video URI".

**Investigation step 1** ([aikol-veo-service.js](../render.com/services/aikol-veo-service.js)): improve parser để detect `raiMediaFilteredCount` (RAI safety filter) + log raw response. Test lại Hạnh 4 → error mới rõ ràng:

```
Veo safety filter blocked (1 sample(s)): We encountered an issue with the
audio for your prompt, which means we could not create your video.
```

→ **Root cause**: Veo 3.x sinh audio kèm video; audio safety filter trigger trên 1 số ảnh model (Hạnh 4 OK visual nhưng audio gen fail safety). Không phải bug Hạnh 4 — là API behavior của Google.

**Step 2**: thử `parameters.generateAudio: false` → API reject "isn't supported by this model" trên `veo-3.1-generate-preview`. Veo 3.x không cho disable audio.

**Step 3 (final fix)**: switch default model sang `veo-2.0-generate-001` — Veo 2.0 không có audio generation, không hit audio safety filter. Override qua env `AIKOL_VEO_MODEL` khi cần audio.

**Verified live** (commit 3b17ff33):

- Job `dfd2cecb-7e94-40b7-af2b-1fde2b9b12c5`: state=done, durationSec=37
- Composite (Gemini): `aikol/tmp/dfd2cecb-…-composite.jpg` 570 KB ✅ HTTP 200
- Output (Veo 2.0): `aikol/outputs/dfd2cecb-…-0.mp4` 1.34 MB ✅ HTTP 200
- External_id: `models/veo-2.0-generate-001/operations/z0mw7xtcrb5t`

**Bonus fix** (commit 0c11f3ec): worker clear `error` column khi state→done — tránh stale error message sau khi gen retry success (race condition trong tick lúc deploy mới live).

### [aikol][video] Pipeline 2-bước: Gemini compose → image2video (giải pháp cho "ghép model vào clip" video)

User insight: "Fal ghép model vào video xong kling mới tạo video à?" — chính xác. Kling public API không có vid2vid endpoint, nhưng có thể đạt được kết quả tương đương bằng pipeline 2-bước:

1. **Compose** ([aikol-gemini-clone-service](../render.com/services/aikol-gemini-clone-service.js)): Gemini 3.1 nhận `modelImageUrl` + `clipCover` + `note prompt` → composite JPG/PNG (model trong scene clip). Verified hoạt động cho image gen từ trước.
2. **Upload tạm**: composite lưu vào Bunny `aikol/tmp/<gen_id>-composite.{jpg,png}` để có public URL cho image2video service nhận.
3. **Animate** ([aikol-queue-worker:184-256](../render.com/services/aikol-queue-worker.js#L184)): Veo/Kling image2video lấy composite làm input → MP4 output là model trong scene clip + motion.

**Trigger**: chỉ chạy compose khi `gen_mode === 'with_clip'` AND `sceneImageUrl` có sẵn. Auto_scene mode không cần (chỉ dùng modelImage gốc + prompt).

**Latency**: thêm ~20-30s cho Gemini compose. Cost: charge cost video gốc, compose absorb (free).

**Fallback**: nếu Gemini compose fail (rate limit, API error...) → log warn + dùng modelImage gốc, scene info từ note vào prompt → vẫn ra video (chỉ không có scene clip).

**Verified live** (commit dc48bdfe):

- Job `17671477-4fa7-4d86-9ed0-dbfc2689d181`: state=done, durationSec=62 (Gemini ~20s + Veo ~40s)
- Composite JPG: `https://n2store-aikol.b-cdn.net/aikol/tmp/17671477-...-composite.jpg` → 410 KB
- Output MP4: `aikol/outputs/17671477-...-0.mp4` → 1.05 MB
- Provider: veo, kind_key: image2video

**TODO future**: cleanup `aikol/tmp/` sau khi gen done (cron job hoặc on-success cleanup) — tránh accumulate.

### [aikol][video] Kling video2video KHÔNG khả dụng qua public API — revert + label honest

User báo: "Kling thì hỗ trợ ghép model vào clip tiktok, Veo 3 thì chưa". Sau khi research + browser test:

**Verified Kling public JWT API endpoints** (https://raw.githubusercontent.com/tryAGI/KlingAI/main/src/libs/KlingAI/openapi.yaml):

```
/v1/videos/text2video
/v1/videos/image2video
/v1/videos/video-extend
/v1/videos/lip-sync
/v1/videos/effects     ← chỉ có themed image effects (christmas, halloween…)
/v1/videos/avatar
```

**KHÔNG có** `/v1/videos/video2video`, `/v1/videos/face-swap`, hay `/v1/videos/multi-image2video` — verified 404 trên job test `87f0debb-…`. "Face Swap Video" feature trên Kling web UI (`app.klingai.com/face-swap-*`) yêu cầu **Custom Face Model trained từ 10-30 sample videos qua web UI**, không expose qua API.

**Decision**: revert worker không gọi `kling.submitVideo2Video` nữa. Cả Veo 3.1 + Kling đều chỉ làm image2video. UI relabel để honest:

- Gen mode radio: "🎬 Dùng scene từ clip này (image: ghép model vào thumbnail · video: bake clip note vào prompt)" — không hứa face-swap-video.
- Engine_video options đồng nhất giữa 2 modes.
- Image gen "ghép model vào clip" VẪN hoạt động thật sự qua Gemini 3.1 multi-image input (model + clip cover → output là model trong scene clip).

**Verified post-revert** (commit b12716a2):

| Test                         | Job          | Kết quả                  |
| ---------------------------- | ------------ | ------------------------ |
| with_clip + Veo 3.1 video    | `6a377521-…` | ✅ MP4 2.56 MB           |
| with_clip + Gemini 3.1 image | `0b842c1e-…` | ✅ 2 ảnh 411 KB + 466 KB |

**Future**: nếu cần face-swap video thật, options ngoài Kling: fal.ai `kling-video/o1/video-to-video/edit`, PiAPI, Akool, Replicate. Hoặc user upload 10-30 sample videos vào Kling web UI để train Custom Face Model rồi gọi API với face_model_id (workflow manual).

### [aikol][generate] Toggle "AI tự sáng tạo scene" vs "Ghép model vào clip" — verified end-to-end

Library page Generate modal trước đây luôn ép user dùng scene từ clip đã chọn. User hỏi: "Cho chọn chức năng tự động gemini sáng tạo clip và chức năng ghép model vào clip được chọn".

**UI** ([aikol-studio/js/generate-panel.js](../aikol-studio/js/generate-panel.js)):

- Radio mới đầu form `data-gen-mode-fieldset`:
    - 🎬 Ghép model vào clip này (default khi mở từ clip card — scene = clip cover)
    - ✨ AI tự sáng tạo scene (chỉ dùng prompt — không cần clip)
- Mở modal không có clip → ẩn radio luôn, ép `auto_scene`.
- Toggle `auto_scene` → ẩn fieldset "Keep from clip" + đổi note placeholder thành scene template chi tiết.
- Validation submit: `auto_scene` cần note ≥10 chars → toast error + modal stay open nếu vi phạm.
- Submit `auto_scene` → `clip_ids:[]` (route tự tạo 1 row clip_id NULL).

**Backend worker** ([render.com/services/aikol-queue-worker.js](../render.com/services/aikol-queue-worker.js)):

- Đọc `conf.gen_mode` (fallback theo presence sceneImageUrl).
- Helper `buildAutoSceneDirective(forVideo)`: prompt yêu cầu Gemini/Veo "place/animate person from ref into new scene from `<note>`" — preserve identity nhưng pose/outfit/scene từ note.
- Với `with_clip`: pass note như cũ → service tự build "Replace person in image2".
- Áp dụng đồng bộ cho Gemini 3.1 (image) và Veo 3.1 (video).

**Browser test live verified** (commit 193783d4 trên Render):

| Test                                | Job ID       | Result                              |
| ----------------------------------- | ------------ | ----------------------------------- |
| auto_scene image (Gemini 3.1)       | `5dc82d3a-…` | ✅ done — JPG 800 KB                |
| auto_scene video (Veo 3.1)          | `b2d6d144-…` | ✅ done — MP4 2.87 MB               |
| with_clip image regression          | `bcc5a2b3-…` | ✅ done — JPG 600 KB                |
| Validation: empty note + auto_scene | (chặn local) | ✅ toast "≥10 ký tự" + modal open   |
| UI form full E2E                    | (1 job sent) | ✅ "Đã gửi 1 job · còn 363 credits" |

Status: ✅ Done — all 7 checks passed end-to-end.

### [shared][ai-widget] Gate AI chat widget — chỉ userType=admin-authenticated

Trước đây AI chat widget load + hiện trên mọi page cho mọi user. Giờ gate hard:

1. [shared/js/navigation-modern.js](../shared/js/navigation-modern.js#L7271-L7290) — loader skip injection nếu `localStorage.userType !== 'admin-authenticated'`.
2. [shared/js/ai-chat-widget.js](../shared/js/ai-chat-widget.js) — defensive guard `isAdminAuthenticated()` ở `init()` (line 1126), `toggleChat()` (line 867), `sendMessage()` (line 957) để chặn cả khi script đã được cache trước khi user bị downgrade quyền hoặc khi user gọi `window.AIChatWidget.toggle()` từ console.

Pattern khớp với check đã dùng ở `orders-report/js/tab1/tab1-bulk-tags.js`, `aikol-studio/js/settings.js`, `orders-report/js/celebration.js`. Status: ✅ Done.

### [aikol][generate] Default engine: Gemini 3.1 (image) + Veo 3.1 (video) thay cho Fal/Kling

Fal PuLID + Kling đều đang locked do exhausted balance ở provider. 2 engine working được verify hoạt động end-to-end (browser test) nên đổi mặc định trong modal Generate sang Gemini 3.1 cho image và Veo 3.1 cho video. Fal/Kling vẫn chọn được nhưng đánh dấu "(cần top-up)".

[aikol-studio/js/generate-panel.js](../aikol-studio/js/generate-panel.js): đổi `<option selected>` + fallback default trong `readForm()`.

### [aikol][clone-from-image] Max-fidelity prompt — output phải giống ảnh upload tối đa

User: "AI tạo model từ ảnh prompt là tạo model càng giống ảnh càng tốt".

Trước đây directive `clone-from-image` chỉ yêu cầu Gemini "preserve face & identity" → Gemini tự sáng tạo pose/expression/outfit/lighting, output không giống ảnh nguồn lắm. Đổi prompt thành 1:1 reproduction directive — liệt kê tường minh các yếu tố phải giữ y nguyên (face, eyes, nose, mouth, hair, makeup, expression, pose, outfit, accessories, lighting, color palette, background). Khi user có extraPrompt thì coi như tweak nhỏ, mọi thứ khác vẫn giữ y.

Files: [render.com/routes/aikol.js](../render.com/routes/aikol.js) directive build, [render.com/services/aikol-gemini-clone-service.js](../render.com/services/aikol-gemini-clone-service.js) single-image branch fallback.

### [purchase-orders] BUG: tab Nháp không có hình ảnh sản phẩm — items[].productImages chưa migrate Bunny

**User báo**: "tab nháp đơn hàng bị bug ở đâu mà không có hình ảnh sản phẩm?"

**Root cause**: Phase B Bunny migration ([scripts/migrate-po-images-to-bunny.js](../scripts/migrate-po-images-to-bunny.js)) chỉ rewrite URLs trong `purchase_orders.invoice_images[]` (line 130-159), KHÔNG rewrite URLs nested trong `items[].productImages[]` và `items[].priceImages[]`. Sau khi DROP TABLE `purchase_order_images` và endpoint `/images/:id` chuyển sang trả 410 Gone, các item-level URLs cũ trỏ `https://n2store-fallback.onrender.com/api/v2/purchase-orders/images/<UUID>` bị broken → UI render `<img>` với alt text "Sản phẩm 1" hiện ra (broken image).

**Verify**:

```bash
curl -sI https://n2store-fallback.onrender.com/api/v2/purchase-orders/images/57564e29-...
# HTTP/2 410 + body: "Endpoint deprecated. Ảnh đã chuyển sang BunnyCDN"
```

**Migration script mới**: [scripts/migrate-po-item-images-to-bunny.js](../scripts/migrate-po-item-images-to-bunny.js)

Pipeline (idempotent, dry-run safe):

1. List Bunny `po-images/` zone → build map `UUID → cdnUrl` (180 files trong Bunny).
2. SELECT orders với `items::text LIKE '%n2store-fallback.onrender.com%'`.
3. Walk items[].productImages + items[].priceImages. URLs có UUID trong Bunny → rewrite sang `https://n2store-aikol.b-cdn.net/po-images/<UUID>.<ext>`. URLs có UUID gone → drop khỏi array (UI fallback "Chưa có hình").
4. UPDATE order's items column.

**Dry-run kết quả** (chưa apply):

```
[phase 1] Bunny po-images/ files = 180
[phase 2] orders với legacy URLs = 137
[phase 2] orders would-update = 137, urls replaced = 35, urls removed (unknown UUIDs) = 700
```

35 URLs recoverable, 700 đã gone (ảnh bị cascade delete trước migration).

**Apply result** (2026-05-08 06:29 UTC, sau khi user approve "chạy đi"):

```
[phase 1] Bunny po-images/ files = 180
[phase 2] orders updated = 137, urls replaced = 35, urls removed = 700
[migrate] DONE in 9.2s
```

**Verify online**:

- GET draft `5459279d` → items[0..6] productImages giờ là `https://n2store-aikol.b-cdn.net/po-images/<UUID>.jpg` ✅
- HEAD https://n2store-aikol.b-cdn.net/po-images/57564e29-...jpg → HTTP 200, 169 KB JPEG, server BunnyCDN-VN1 ✅
- Pageful 20 orders: 35 Bunny URLs, **0 fallback URLs** còn sót ✅

**Status**: ✅ End-to-end fixed. UI hiển thị ảnh đúng (qua Bunny CDN) cho 35 ảnh recoverable, "Chưa có hình" cho 700 ảnh đã gone (cascade-deleted trước migration).

### [purchase-orders] In tem PDF: cảnh báo trước khi in sản phẩm chưa có trong kho TPOS (root cause "có khi có có khi không")

**Yêu cầu user**: "sao có khi in mã có sản phẩm có sản phẩm không?" — đôi lúc in tem PDF thấy đủ sản phẩm, đôi lúc thiếu.

**Root cause** ([barcode-label-dialog.js:540-543](../purchase-orders/js/lib/barcode-label-dialog.js)):

```js
for (const it of validItems) {
    const p = codeMap.get(it.code);
    if (!p || !p.tpos_product_id) continue;  // SILENTLY skip items not in TPOS warehouse
    ...
}
```

`printViaTPOS` query batch-lookup web-warehouse → silently skip mã chưa có trong kho TPOS (vd PO Draft mới convert từ inventory, item có `productCode` nhưng chưa sync về TPOS). Số lượng skip phụ thuộc vào % items đã sync nên user thấy "có khi có có khi không":

- 100% trong TPOS → in đủ.
- 0% trong TPOS → throw "No products found" → fallback local print all → in đủ.
- 50/50 → in 1 nửa, 1 nửa biến mất silent.

Verified với curl: 5 mã `[B1947, B1948, B1949, Q127T, NONEXIST]` → batch-lookup chỉ trả về Q127T (1/5).

**Fix** ([purchase-orders/js/lib/barcode-label-dialog.js](../purchase-orders/js/lib/barcode-label-dialog.js)):

- New helper `preflightTposItems(items)` → query batch-lookup, return `{matched, missing}`.
- Click handler "In bằng pdf":
    - Pre-flight trước khi gọi `printViaTPOS`.
    - Nếu missing > 0 → `window.confirm(...)` cảnh báo user, list `[...new Set(missing.map(it=>it.code))]` (dedup, max 8 mã).
    - All missing → "Chuyển sang in HTML local?" (Y → fallback all, N → return).
    - Partial missing → "OK: in PDF cho N matched, Cancel: thoát để sync TPOS" (Y → `printViaTPOS(matched)`, N → return).
    - No missing → silent, proceed như cũ.
- `itemsToPrint` track items thực sẽ in (matched only nếu user opted skip), local fallback dùng cùng set để consistent với confirm choice.

**Browser test (Playwright local, isolated FIFO)**:

- Real Draft `5459279d-...` 7 dòng (B1947/B1948/B1949/B1950 — không có trong TPOS) → confirm prompt:
    > ⚠ Tất cả 7 sản phẩm CHƯA có trong kho TPOS — không thể in PDF qua TPOS.
    > Mã thiếu: B1947, B1948, B1949, B1950 (deduped from 7 rows → 4 codes ✅)
    > Chuyển sang in HTML local (in được tất cả nhưng tem định dạng đơn giản)?
- Mock partial (Q127T + B1947 + B1948) → confirm prompt:
    > ⚠ 2/3 sản phẩm CHƯA có trong kho TPOS — sẽ KHÔNG được in qua PDF.
    > Mã thiếu: B1947, B1948
    > → OK: in PDF cho 1 mã có sẵn (5 tem). → Hủy: thoát để sync sản phẩm về TPOS trước.
- Mock all-found (Q127T) → no confirm shown, silent proceed ✅

**Files**: 1 sửa (`purchase-orders/js/lib/barcode-label-dialog.js`).

**Status**: ✅ Done.

### [aikol][veo] Fix Veo 3.1 image2video — verified hoạt động qua browser test live

**Bug user-facing**: Browser test trên `library.html` với model "Hạnh 2" + clip TikTok → engine `veo_3_1` luôn fail tại submit với error mơ hồ "Unsupported video generation request. Please check the documentation".

**Verify cuối**: gen `18b643cb-536f-4f36-a0ae-e0d02d8dd11b` → `state:done` → output MP4 2.2 MB tại `aikol/outputs/18b643cb-...-0.mp4`. Schema final hoạt động:

```js
POST https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning
{
  instances: [{
    prompt: "Animate the subject naturally, ...",
    image: { bytesBase64Encoded: "<b64>", mimeType: "image/jpeg" }
  }],
  parameters: {
    aspectRatio: "9:16",
    durationSeconds: 8,        // NUMERIC — API reject string với "needs to be a number"
    resolution: "720p",
    sampleCount: 1
  }
}
```

**Root cause + lessons** (4 lần fix sai trước khi đúng — docs Google không trustworthy):

1. ❌ `contents`/`generationConfig` (theo `generateContent` schema) → API reject "Unknown name `contents`". `predictLongRunning` dùng Vertex envelope, KHÔNG dùng Gemini Content envelope.
2. ❌ `instances[].image.inlineData.{data,mimeType}` (theo trang docs `ai.google.dev/gemini-api/docs/video`) → API reject "`inlineData` isn't supported by this model". Đúng phải là `bytesBase64Encoded`.
3. ❌ `durationSeconds: "8"` STRING (theo docs cùng trang) → API reject "needs to be a number". Đúng là NUMERIC.
4. ❌ `instance.referenceImages = [...]` cho Veo 3.1 sceneImageUrl → trigger generic "Unsupported video generation request". Field này chỉ có trên Vertex AI, chưa có trên Gemini API public. Drop, scene info nhét vô prompt.

→ Cách debug duy nhất hiệu quả là **submit + xem API error message** chứ docs không trustworthy.

**Files**:

- [render.com/services/aikol-veo-service.js](../render.com/services/aikol-veo-service.js): final correct schema + drop `referenceImages` + duration buckets {4,6,8} numeric.
- [render.com/services/aikol-queue-worker.js](../render.com/services/aikol-queue-worker.js): duration floor 4s + dùng `image_size` làm fallback aspect ratio.
- [scripts/n2store-browser-session.js](../scripts/n2store-browser-session.js): fix `safe()` helper crash khi `JSON.stringify(undefined)` (eval/feval không có `return`).

**Bug provider-side phát hiện cùng lúc** (không phải code bug — refund đã chạy đúng):

- Fal PuLID (default image engine): `403 User is locked. Exhausted balance` → cần top-up fal.ai.
- Kling (default video engine): `429 code:1102 Account balance not enough` → cần top-up Kling.
- **Workaround user**: chọn `Gemini 3.1` cho image (verify gen `424a4ba4-...` trả output OK), `Veo 3.1` cho video (verify gen `18b643cb-...` trả MP4 OK).

Status: ✅ Done — verified end-to-end live trên Render production.

### [render][purchase-orders] Phase B — upload ảnh sang BunnyCDN + dual-mode cascade + migration script

**Tại sao Bunny thay vì R2**: R2 require user click "Enable R2" trên CF dashboard (không API được). BunnyCDN đã setup sẵn cho AI KOL Studio (zone `n2store-aikol`, env `BUNNY_STORAGE_KEY` đã có trên Render, `bunny-storage-service.js` viết sẵn). Cùng outcome: object storage + CDN public URL, ship được ngay.

**Khám phá khi dry-run**: 1045 ảnh trong `purchase_order_images` nhưng chỉ **133 referenced** — **912 ảnh orphan = 217 MB rác** (88% bytea là rác do đơn xóa trước cascade hoặc canceled uploads).

**Code changes** ([render.com/routes/v2/purchase-orders.js](../render.com/routes/v2/purchase-orders.js)):

- `POST /images`: upload thẳng lên Bunny `po-images/<uuid>.<ext>`, return `cdnUrl` (`https://n2store-aikol.b-cdn.net/...`). Bỏ INSERT bytea.
- Helper `classifyImageUrls()` chia URL theo pattern: Bunny CDN host → DELETE on Bunny, legacy `/images/<id>` → DELETE row DB. `deleteImagesFromUrls` chạy cả 2 backend song song qua `Promise.allSettled`, trả `{ deletedDb, deletedBunny, total }`.
- `GET/DELETE /images/:id` legacy giữ nguyên cho compat. Sau khi DROP TABLE → 404 tự nhiên.

**Migration script** ([scripts/migrate-po-images-to-bunny.js](../scripts/migrate-po-images-to-bunny.js)): idempotent 4-phase, flag `--dry-run` / `--skip-cleanup`. Đọc env từ `serect_dont_push.txt`.

**Pipeline thực thi**:

1. POST `/cleanup-orphan-images { minAgeHours: 24 }` → 912 orphan DB rows ≈ 217 MB
2. Migration script → 133 ảnh remaining lên Bunny + replace URL ≈ 28 MB
3. DROP TABLE → free indexes/structure
4. Bunny chứa ~32 MB referenced images.

**Pipeline thực thi runtime**:

1. ✅ SQL trực tiếp xóa 865 orphan rows (created_at < NOW() - 24h, không referenced) → DELETE 865
2. ✅ Migration script: phase 1 list 180 rows → phase 2 upload Bunny 180/180 (67s) → phase 3 update 132 orders (133 URLs replaced) → phase 4 DELETE 180 bytea rows
3. ✅ Sample URL test: `https://n2store-aikol.b-cdn.net/po-images/3ec8e9e4-…ac.png` → HTTP/2 200 từ BunnyCDN-VN1 (Vietnam edge)
4. ✅ `DROP TABLE purchase_order_images CASCADE`
5. ✅ Legacy GET/DELETE `/images/:id` + `cleanup-orphan-images` → 410 Gone (commit a9959829)

**Result**: DB size **739 MB → 223 MB** (-516 MB, **-70%**). Bunny zone chứa ~32 MB referenced images. Tất cả 142 đơn có ảnh giờ trỏ Bunny CDN, query verify `still_db=0`.

Status: ✅ Phase B done, deploy live.

---

### [render][purchase-orders] Cascade delete `purchase_order_images` khi xóa đơn (Phase A của migration R2)

**Trigger**: chat-db audit phát hiện `purchase_order_images` 245 MB (1009 row bytea) growing ~40 ảnh/ngày → ~1.4 GB/năm. Phase A: bịt rò rỉ — xóa đơn = xóa ảnh.

**Schema link**: `purchase_orders.invoice_images TEXT[]` chứa URL `${BASE_URL}/api/v2/purchase-orders/images/<id>`. Trước commit này không có cascade — ảnh tồn tại vô thời hạn dù đơn đã hard-delete hay cleanup-trash hết hạn.

**Fix** ([render.com/routes/v2/purchase-orders.js](../render.com/routes/v2/purchase-orders.js)):

- Thêm helper `extractImageIds(urlArrays)` regex `/\/images\/([^/?#]+)$/` lấy id từ URL.
- Thêm `deleteImagesByIds(pool, ids)` chạy `DELETE FROM purchase_order_images WHERE id = ANY($1)`.
- `DELETE /:id/permanent`: SELECT trước `invoice_images`, hard-delete đơn xong gọi cascade, trả `{ deletedImages: N }`.
- `POST /cleanup-trash`: thêm `RETURNING id, invoice_images` rồi cascade batch.
- Thêm `POST /cleanup-orphan-images { minAgeHours }`: SQL CTE `referenced` parse suffix `/images/<id>` từ tất cả `invoice_images` array của bất kỳ đơn nào → DELETE images NOT IN referenced AND created_at < NOW() - INTERVAL — safety net cho ảnh đã orphan trước commit này.

**Phase B (chờ user setup)**: migrate sang Cloudflare R2 — bytea 245 MB → R2 (egress free, growth không tốn DB nữa). Cần user tạo R2 bucket + S3 API token.

Status: ✅ Phase A xong (cascade + orphan cleanup endpoint). Phase B blueprint pending.

---

### [render][chat-db] Bỏ lưu phone_call_recordings (duplicate với OnCallCX portal) — free 92 MB

**Trigger**: chat-db (`n2store-chat-db`, plan basic_1gb) đã chạm 75% (761 MB / 1020 MB). Audit phát hiện `phone_call_recordings` 92 MB chỉ duy nhất 157 row nhưng audio bytea trùng dữ liệu OnCallCX portal — UI `Lịch sử cuộc gọi` đã có sẵn nút **Portal OnCallCX** để fetch trực tiếp.

**Phase 1 (this commit) — Stop ghi**:

- Uninstall launchd daemon: `bash scripts/install-oncallcx-sync.sh uninstall` (đã chạy local máy mac mỗi 5 phút).
- [scripts/oncallcx-sync-daemon.js](../scripts/oncallcx-sync-daemon.js): truncate xuống deprecation notice + `process.exit(0)`. Code cũ giữ trong git history.
- [render.com/routes/oncall-sip-proxy.js](../render.com/routes/oncall-sip-proxy.js): 5 routes `/call-recordings*` đổi sang trả 410 Gone (POST upload, GET audio, DELETE, POST remap-phones) hoặc list rỗng (GET list — frontend cũ thấy `Ghi âm 0` thay vì lỗi). Bỏ block `CREATE TABLE phone_call_recordings` + 5 indexes ở init schema để Render restart không recreate bảng.
- [orders-report/js/phone-recording.js](../orders-report/js/phone-recording.js): xóa `_uploadToCloud()` (browser MediaRecorder fire-and-forget). Local IndexedDB 30d retention vẫn giữ nguyên cho replay tạm.

**Tác động UI**: 3 surface cũ đọc list (`phone-history-badges`, `phone-management`, `tab1-search`) sẽ thấy 0 ghi âm. Click play audio cũ → 410 Gone. User dùng nút "Portal OnCallCX" có sẵn trong dialog để xem ghi âm thật.

**Phase 2 (sau khi deploy live)**: `DROP TABLE phone_call_recordings CASCADE` trên Render Postgres → free ~92 MB.

**Bonus dọn DB chung trong session này**:

- `REINDEX CONCURRENTLY public.realtime_updates` — index bloat 59 MB → 160 kB (251 row, churn 9.5k INSERT vs 29k DELETE → autovacuum chưa kịp với mức tăng index).
- `DROP INDEX idx_realtime_updates_created` (dup `_created_at`) + `idx_realtime_updates_page` (dup `_page_id`) — verified `indexdef` identical, `idx_scan = 0`.
- `VACUUM (ANALYZE)` 5 bảng dead-tuple cao: `tpos_sync_log`, `social_orders`, `fb_global_id_cache`, `processing_tags`, `pending_wallet_withdrawals` — dead 13–17% → 0%.

DB size: 739 MB → 687 MB (-52 MB) chưa tính phase 2.

Status: ✅ Phase 1 xong — chờ deploy Render rồi chạy DROP TABLE.

---

### [orders] Tab "Bill Đã Xóa" mất data từ tháng 04 — read-side đọc nhầm Firestore (đã migrate sang Postgres)

**Bug**: `orders-report/main.html` → tab Bill Đã Xóa hiện toàn data cũ, không thấy đơn hủy từ 04/2026 trở đi. Đơn vừa hủy không xuất hiện.

**Root cause**: Writer (`tab1-fast-sale-workflow.js` `InvoiceStatusDeleteStore`) đã migrate sang Postgres qua REST `/api/invoice-status/delete/*` (xem `render.com/migrations/033_create_invoice_status.sql`), nhưng reader (`tab-pending-delete.html`) vẫn đọc Firestore collection `invoice_status_delete_v2` cũ → chỉ thấy snapshot tồn dư trước migration.

**Verify live API**: `GET https://chatomni-proxy.nhijudyshop.workers.dev/api/invoice-status/delete/load` → `success:true, entries:653` (sample row date 2026-05-07). Data đầy đủ ở Postgres.

**Fix** ([orders-report/tab-pending-delete.html](../orders-report/tab-pending-delete.html)):

- Thay `loadData()` đọc Firestore (admin: load all docs, user: load own doc) bằng 1 fetch `${WORKER_URL}/api/invoice-status/delete/load` rồi map row → entry, lọc client-side theo `username` cho non-admin.
- Thay `toggleHidden()` ghi Firestore `merge:true` bằng `PATCH /entries/:compoundKey/toggle-hidden` (server flip sẵn, optimistic + revert nếu fail, trust giá trị server trả về).
- Bỏ `<script>` Firebase SDK + `firebase-config.js` không còn cần ở trang này.
- Bỏ const `DELETE_STORAGE_KEY` và `DELETE_FIRESTORE_COLLECTION`, thêm `DELETE_API_BASE`.

**E2E verify** ([scripts/verify-pending-delete.mjs](../scripts/verify-pending-delete.mjs)):

- Login admin → `[PENDING-DELETE] Loaded 653 entries (admin=true)` ✓
- Top rows: NJD/2026/65794 (08/05 09:03 Lài), 65838 (08/05 08:39 my), 65829 (07/05 18:49 My)… data mới nhất 08/05/2026 hiển thị đúng ✓
- User filter dropdown populate đầy đủ: Lài, My, Còi, Hạnh, Huyền, Hồng, admin, Bo, hanhlive, Tâm, Cẩm ✓
- Không còn pageerror, fetch API trả 200 ✓

**Status**: ✅ Done — fix data flow cho 1 file `tab-pending-delete.html`, không đụng writer.

---

### [aikol][models] Tạo model bằng Gemini 2.5 Flash Image (Nano Banana) — production-ready

**Insight user**: project có widget AI sẵn (Gemini, Fal, Kling), liệu có thể dùng để TẠO model thay vì chỉ Upload?

**Research** (browser-read Gemini docs + WebFetch + verify qua existing `/api/gemini/chat` proxy):

- 3 image-gen models accessible với GEMINI_API_KEY env (paid tier):
    - `gemini-2.5-flash-image` (Nano Banana): 1024×1024 max, **$0.039/ảnh**, ~10s
    - `gemini-3.1-flash-image-preview` (Nano Banana 2): 4K, $0.06/ảnh
    - `gemini-3-pro-image-preview` (Pro): 4K + thinking, $0.12/ảnh
- aspectRatio config (`responseFormat.image.aspectRatio`) **chỉ valid Gemini 3.x**. 2.5 trả 502 "Unknown name responseFormat" nếu pass.
- Tikreel.net/app/models check: chỉ có Upload, KHÔNG có "Tạo bằng AI" → feature này mới hơn Tikreel.

**Architecture**:

- [render.com/services/aikol-gemini-image-service.js](../render.com/services/aikol-gemini-image-service.js) — `generatePortrait({prompt, aspectRatio, model})` → Buffer PNG. Default `gemini-2.5-flash-image`. Cho 2.5 bake aspect hint vào prompt text (model honor framing cues qua text). Cho 3.x dùng `responseFormat.image.aspectRatio` đúng schema docs.
- [render.com/routes/aikol.js](../render.com/routes/aikol.js) — `POST /api/aikol/models/generate` → charge `COSTS.image=4` credits → Gemini → Bunny CDN (`aikol/models/{id}.png`) → INSERT aikol_models. Auto-refund nếu Gemini error / Bunny upload fail.
- [aikol-studio/models.html](../aikol-studio/models.html) — 2 panel side-by-side: **Section 1 Upload (FREE)** vs **Section 2 Tạo bằng AI (4cr)** với badge "GEMINI 2.5".
- [aikol-studio/js/models.js](../aikol-studio/js/models.js) — `onGenerate()` show inline status "Đang vẽ… (10-25s)" + result message với balance + cost. Refund info trong tooltip lỗi.

**End-to-end verified online**:

- Model #16 "AI test" 1024×1024 PNG 1.49MB · 9.7s · cost 4cr · ai_model `gemini-2.5-flash-image` ✓
- Model #17 "Mai test" Vietnamese woman portrait 1.35MB · gentle smile, professional headshot ✓
- Model #18 "Aspect test" Vietnamese man portrait professional, suit + cityscape backdrop ✓
- Refund verified: aspectRatio 4:5 trên 2.5 trả 502 "Unknown name responseFormat" → backend bắt + refund 4cr ✓

**Limitations** (đã document trong UI):

- `gemini-2.5-flash-image` xuất CỐ ĐỊNH 1024×1024. AspectRatio hint chỉ thay đổi framing (chân dung khít/dọc/ngang) chứ không đổi resolution. Để có true 4K + aspect → switch sang `gemini-3.1-flash-image-preview` ($0.06/ảnh) hoặc Imagen 4 ($0.04/ảnh).
- Free tier: NOT available cho image-gen models.
- SynthID watermark trên mọi ảnh (Google policy).

**Prompt template default** (placeholder UI):

```
A young Vietnamese woman, age 25, soft natural studio lighting,
gentle smile, professional portrait, photorealistic
```

**Files changed**: 5 (1 backend service, 1 backend route, 1 HTML, 2 JS).

**Status**: ✅ Done. Production-ready.

### [aikol][clips] Channel import VERIFIED end-to-end — 10/10 success với @khaby.lame

**Test online**: kênh `https://www.tiktok.com/@khaby.lame`, count=10:

- yt-dlp v2026.03.17 (Render Linux) trả 10 video metadata trong ~3s, KHÔNG cần TikTok cookie
- Frontend orchestrator concurrency=3 dispatch 10 calls vào `/import/single`
- Final: **10/10 ✓ done**, 0 lỗi
- Tổng thời gian end-to-end: ~80s (limited bởi MP4 download per video)
- Screenshot: [downloads/n2store-session/channel-import-10-of-10.png](../downloads/n2store-session/channel-import-10-of-10.png)

**Bugs fixed trong session này**:

1. `ensureYtDlp` redirect handling broken (https.get tạo file stream 1 lần) → `curl -fsSL`.
2. `resolveTiktokSecUid` không có timeout → AbortController 8s.
3. `listUserVideos` build URL thiếu @handle khi yt-dlp `parsed.uploader=null` → trích `handleFromInput` từ user-paste URL + fallback raw videoId.

**Diagnostic endpoint**: `GET /api/aikol/import/channel/diag` trả `{platform, bin_path, bin_exists, bin_size, bin_version, ensure_error}` — verified `bin_version: "2026.03.17"`, `bin_size: 36109712`.

**Status**: ✅ Done. Production-ready cho TikTok public channels.

### [balance-history-home] Page mới "Lịch Sử Biến Động Số Dư Home" — scaffold UI, chờ đấu SePay account thứ 2

- **Why**: User chuẩn bị đấu thêm 1 SePay account riêng (Home — sổ thu/chi nội bộ theo phòng), cần sẵn 1 trang FE độc lập trỏ về endpoint mới `/api/sepay-home/*`. Backend chưa có → trang sẽ 404 ban đầu, đó là expected (append-only, KHÔNG động endpoint `/api/sepay/*` cũ).
- **What**:
    - Tạo folder mới [balance-history-home/](../balance-history-home/) isolated hoàn toàn (không share script/CSS với folder `balance-history/` cũ).
    - **UI khác biệt so với balance-history gốc**:
        - 1 màn hình duy nhất (bỏ 4 tab Live Mode / Lịch Sử / Thống Kê / Kế Toán).
        - Header chỉ có heading + badge "Home" tím (bỏ button "Tạo QR" / "Làm mới" / input SĐT).
        - Bảng 7 cột: Ngày giờ / **Loại (badge In/Out)** / Số tiền / **Số dư sau GD (running balance)** / Nội dung / Mã tham chiếu / **Mã phòng (dropdown)**. Bỏ 4 cột: Tên KH / SĐT / Nguồn / QR Code.
        - 3 filter chip type: Tất cả / Tiền vào / Tiền ra (thay 6 verification chip cũ).
        - Không có modal nào (bỏ pending match / customer edit / phone data / QR / detail GD).
    - **Dropdown "Mã phòng"**: data từ [room-codes.js](../balance-history-home/js/room-codes.js) — placeholder `window.ROOM_CODES = []`. User tự bổ sung sau khi sẵn sàng. PUT về `/api/sepay-home/transaction/:id/room`.
    - **Endpoint isolation**: tất cả fetch trong page Home dùng prefix `/api/sepay-home/*`. Cache localStorage key prefix `bh_home_cache_*` + `balanceHistoryHome_view_mode` (tách hoàn toàn với `bh_cache_*` của trang cũ).
    - **Realtime SSE**: tự connect `/api/sepay-home/stream` sau 1s. Listener cho event `connected` + `new-transaction` (bỏ `customer-info-updated` + `pending-match-created` vì không quản lý khách).
    - **Navigation**: thêm entry "Số Dư Home" (`shortText: 'SD Home'`, `adminOnly: true`, share `permissionRequired: 'balance-history'`) vào [shared/js/navigation-modern.js:224-232](../shared/js/navigation-modern.js#L224-L232) — ngay sau entry "Lịch Sử Biến Động Số Dư" cũ.
- **Approach**: Copy isolated (KHÔNG share JS/CSS với folder cũ). Trade-off: duplicate ~3.8K dòng CSS + ~1.4K dòng JS, đổi lại an toàn (zero risk break trang cũ) + dễ destroy/divergent UI sau này. Tuân thủ memory `feedback_api_scope.md`: feature mới → endpoint riêng, append only.
- **State backend**: backend `/api/sepay-home/*` CHƯA CÓ → frontend sẽ 404 ở mọi call, page render UI rỗng. User sẽ làm backend (history, statistics, stream, transaction/:id/room) khi sẵn sàng đấu SePay account mới.

**Files NEW (10)**:

- [balance-history-home/index.html](../balance-history-home/index.html) — 7-column table + filter bar + collapsible date filters + pagination.
- [balance-history-home/js/config.js](../balance-history-home/js/config.js) — CONFIG + `SEPAY_PREFIX: '/api/sepay-home'`.
- [balance-history-home/js/room-codes.js](../balance-history-home/js/room-codes.js) — placeholder `window.ROOM_CODES = []` + helper `renderRoomOptions()`.
- [balance-history-home/js/balance-core.js](../balance-history-home/js/balance-core.js) — state + data loading + SSE realtime (lược từ 1089 → 700 dòng).
- [balance-history-home/js/balance-filters.js](../balance-history-home/js/balance-filters.js) — filter system + type chips (In/Out).
- [balance-history-home/js/balance-table.js](../balance-history-home/js/balance-table.js) — table render mới với badge In/Out + running balance + room dropdown handler.
- [balance-history-home/js/main.js](../balance-history-home/js/main.js) — init + event wiring (đơn giản hoá).
- [balance-history-home/css/home.css](../balance-history-home/css/home.css) — custom styles: badge "Home" tím, badge In/Out xanh/đỏ, running balance monospace, room dropdown, type chips.
- [balance-history-home/css/modern.css](../balance-history-home/css/modern.css) — copy nguyên từ balance-history/.
- [balance-history-home/css/styles.css](../balance-history-home/css/styles.css) — copy nguyên từ balance-history/.

**Files MODIFIED (1)**:

- [shared/js/navigation-modern.js](../shared/js/navigation-modern.js) — append nav entry "Số Dư Home" sau entry balance-history.

**Status**: ✅ FE scaffold done. ⏳ Chờ backend `/api/sepay-home/*` + danh sách `ROOM_CODES`.

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
