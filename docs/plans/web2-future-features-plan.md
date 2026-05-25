# Web 2.0 — Future Features Implementation Plan

> **Tạo:** 2026-05-22 · **Owner:** Claude + n2store team · **Status:** Draft v1
>
> Plan này hiện thực 12 gợi ý "Future Development" liệt kê ở [`web2/overview/index.html`](../../web2/overview/index.html). Đọc kèm [`docs/web2/WEB2-INDEX.md`](../web2/WEB2-INDEX.md) và [`docs/web2/SSE-REALTIME.md`](../web2/SSE-REALTIME.md).

---

## 0. Executive Summary

| Tổng features | Tổng effort  | Sprint count        | Có dependency rõ ràng | Build độc lập |
| ------------- | ------------ | ------------------- | --------------------- | ------------- |
| 12            | ~46 ngày dev | 4 sprint × ~12 ngày | 5 features            | 7 features    |

**Trục ưu tiên** (impact cao + effort thấp → làm trước):

1. **Notification center** (F06) — chặn pain point hiện tại, dùng được sẵn SSE infra.
2. **Audit trail UI** (F05) — data đã có, chỉ thiếu UI.
3. **Bulk import Excel** (F03) — endpoint `bulk-create` đã sẵn, gỡ bottleneck nhập tay.
4. **Permission matrix UI** (F12) — `PUT /:id/permissions` đã có, UI primitive cần làm lại.
5. **Smart match SePay** (F09) — giảm tải kế toán, ROI cao.
6. **Dashboard KPI** (F01) — visibility cho boss; build sau khi SSE ổn định.
7. **Báo cáo công nợ + ví** (F02) — aging buckets, build trên data đã có.
8. **Variants matrix UI** (F10) — UX win cho data entry, không đụng schema.
9. **Print/Export hàng loạt** (F08) — barcode + PDF, nhiều khách hỏi.
10. **Inventory forecasting** (F11) — cần dữ liệu lịch sử 30+ ngày, chờ.
11. **Customer 360 NCC** (F07) — depends on supplier-debt + supplier-wallet stable.
12. **Mobile view** (F04) — đầu tư lớn, làm sau khi 3 trang ưu tiên (reconcile, native-orders, balance-history) đã ổn định.

---

## 1. Priority Matrix

```
            EFFORT (dev days)
            S (1-2d)   M (3-5d)    L (6-10d)
   ┌──────┬──────────┬────────────┬─────────────┐
H  │ HIGH │ F06 Noti │ F02 Debt+Ví │ F04 Mobile  │
I  │      │ F12 Perm │ F09 SmartMt │ F01 Dashbrd │
G  │      │          │ F03 BulkImp │             │
H  ├──────┼──────────┼────────────┼─────────────┤
   │ MED  │ F05 Audit│ F08 Print  │ F07 360 NCC │
   │      │          │ F10 Matrix │ F11 Forecast│
   ├──────┼──────────┼────────────┼─────────────┤
L  │ LOW  │          │            │             │
   └──────┴──────────┴────────────┴─────────────┘
```

---

## 2. Sprint Mapping (4 sprint × ~12 dev days)

### Sprint 1 — Foundation + Quick wins (~12 ngày)

Mục tiêu: dọn pain points + xây hạ tầng reusable.

- **F06 — Notification center** (3 ngày)
- **F12 — Permission matrix UI** (2 ngày)
- **F05 — Audit trail UI** (2 ngày)
- **F03 — Bulk import Excel** (5 ngày)

### Sprint 2 — Reports + intelligence (~12 ngày)

- **F02 — Báo cáo công nợ + ví aging** (4 ngày)
- **F09 — Smart match SePay** (4 ngày)
- **F08 — Print/Export hàng loạt** (4 ngày)

### Sprint 3 — Dashboard + UX (~10 ngày)

- **F01 — Dashboard KPI tổng** (5 ngày)
- **F10 — Variants matrix UI** (3 ngày)
- **F07 — Customer 360 cho NCC** — phase 1 read-only view (2 ngày)

### Sprint 4 — Long-form + mobile (~12 ngày)

- **F04 — Mobile view** cho 3 trang ưu tiên (6 ngày)
- **F11 — Inventory forecasting** (4 ngày)
- Tổng kết, polish, fix bug, deploy GA (2 ngày)

---

## 3. Cross-cutting infrastructure

Hạ tầng dùng chung bởi nhiều features — làm 1 lần, reuse.

### 3.1 SSE topic registry

File mới: `web2/shared/web2-sse-topics.js`

```js
window.Web2SSETopics = {
    PRODUCTS: 'web2:products',
    VARIANTS: 'web2:variants',
    PRODUCT_CATEGORY: 'web2:productcategory',
    NATIVE_ORDERS: 'web2:native-orders',
    FAST_SALE_ORDERS: 'web2:fast-sale-orders',
    RECONCILE: 'web2:reconcile',
    PURCHASE_REFUND: 'web2:purchase-refund',
    WALLET_ALL: 'wallet:all',
    CUSTOMER_WALLET: 'web2:customer-wallet',
    SUPPLIER_WALLET: 'web2:supplier-wallet',
    USERS: 'web2:users',
    NOTIFICATIONS: 'web2:notifications', // NEW
    KPI_DASHBOARD: 'web2:kpi-dashboard', // NEW (aggregated)
};
```

### 3.2 Bulk import helper

File mới: `web2/shared/bulk-import.js` — wrap SheetJS + progress bar + dry-run preview + error report. Reuse cho F03 + F10 + F08.

### 3.3 PDF/Excel export helper

File mới: `web2/shared/export-helpers.js` — wrap SheetJS + jsPDF + barcode (JsBarcode đã có). Reuse cho F08 + F02 + F07.

### 3.4 Aging bucket helper

File mới: `web2/shared/aging.js` — pure function `bucketByAge(transactions, refDate) → {b0_30, b31_60, b61_90, b90_plus}`. Reuse cho F02 + F07.

---

## 4. 12 Feature plans — chi tiết

---

### F01 — Dashboard KPI tổng

**Why:** Boss/manager hiện không có single view tổng quan; phải mở 5-6 trang để check trạng thái shop.

**Scope (v1):**

- Trang mới `web2/dashboard/index.html`
- 4 KPI cards top: Doanh thu hôm nay · Đơn cần đóng gói · Tồn kho thấp · Ví KH overdraft
- 3 chart: Doanh thu 7/30 ngày (line) · Top SP bán chạy 30 ngày (bar) · Phân loại trạng thái PBH (donut)
- 1 bảng: 10 đơn PBH gần nhất + 5 transaction SePay chờ duyệt
- Auto-refresh qua SSE topic `web2:kpi-dashboard` (debounce 5s)

**Tech approach:**

- Frontend: Chart.js (CDN, đã quen) — không thêm dep mới
- Backend: route mới `render.com/routes/v2/dashboard-kpi.js` aggregate từ:
    - `fast_sale_orders` (doanh thu theo ngày, SUM amount WHERE state='done')
    - `native_orders` (đơn pending)
    - `web2_products` (stock < 5)
    - `customer_wallets` (balance < 0)
    - `web2_balance_history` (pending verification)
- Cache 30s trong route (in-memory Map) — tránh hit DB mỗi tab open
- Publish SSE topic `web2:kpi-dashboard` mỗi khi có change ở 4 bảng trên (cross-publish)

**Files affected (mới):**

- `web2/dashboard/index.html`
- `web2/dashboard/dashboard.css`
- `web2/dashboard/dashboard.js`
- `render.com/routes/v2/dashboard-kpi.js`
- `render.com/server.js` (mount route)

**Files affected (sửa):**

- `web2/shared/tpos-sidebar.js` (thêm vào allow-list + menu)

**Dependencies:** F06 Notification (tận dụng pattern aggregate cross-publish).

**Risks:**

- Query aggregate có thể chậm khi data lớn → cần index trên `fast_sale_orders(state, created_at)` (đã có?)
- Chart.js bundle ~70KB — chỉ load ở trang này, lazy import

**Acceptance criteria:**

- [ ] Trang load < 1.5s ở GH Pages production
- [ ] Doanh thu khớp với trang PBH filter "Hoàn thành" cùng ngày
- [ ] Click vào KPI card → navigate sang trang chi tiết tương ứng
- [ ] SSE realtime: tạo PBH mới → KPI "Đơn cần đóng gói" +1 trong 5s

**Estimated:** 5 ngày dev.

---

### F02 — Báo cáo công nợ + ví hợp nhất (aging buckets)

**Why:** `supplier-debt` hiện chỉ tổng kỳ; không biết khoản nào đã treo lâu. Risk lớn nếu NCC hủy thanh toán quá hạn.

**Scope:**

- Trang mới `web2/supplier-aging/index.html` (hoặc tab mới trong `supplier-debt`)
- Bảng matrix: NCC × {Đầu kỳ, 0-30, 31-60, 61-90, 90+, Cuối kỳ}
- Bar chart stacked: total aging mỗi tháng 6 tháng gần nhất
- Export Excel
- Click row → modal chi tiết transaction trong từng bucket

**Tech approach:**

- Reuse data source supplier-debt (Firestore `web2_so_order` + `web2_records` + `web2_supplier_wallet`)
- Helper `web2/shared/aging.js` (cross-cutting 3.4)
- Backend route `/api/v2/supplier-aging` aggregate + cache 5 phút
- Excel export qua `web2/shared/export-helpers.js`

**Files mới:**

- `web2/supplier-aging/index.html`
- `web2/supplier-aging/supplier-aging.js`
- `render.com/routes/v2/supplier-aging.js`
- `web2/shared/aging.js`
- `web2/shared/export-helpers.js`

**Dependencies:** F08 print/export helper.

**Risks:** Firestore latency nếu so-order data lớn (>10K records) — cần lazy load by date range.

**Estimated:** 4 ngày dev.

---

### F03 — Bulk import Excel

**Why:** Nhập SP/biến thể/NCC từng dòng cực chậm. Endpoint `bulk-create` đã có nhưng UI chưa support upload file.

**Scope (v1):**

- Modal "Import Excel" ở 4 trang: `products`, `variants`, `partner-supplier` (web2-generic), `so-order`
- Drag-drop XLSX/CSV → preview table (first 50 rows) → highlight invalid row → dry-run validate → POST `/bulk-create`
- Report: imported / skipped / failed + lý do từng dòng

**Tech approach:**

- SheetJS (`xlsx`) CDN — ~250KB lazy import chỉ khi mở modal
- Helper `web2/shared/bulk-import.js`:
    - `parseFile(file) → { headers, rows[] }`
    - `validate(rows, schema) → { valid[], invalid[] }`
    - `chunkedUpload(rows, endpoint, batchSize=50) → progress events`
- Backend: dùng endpoint `/bulk-create` đã có (check tất cả entity), thêm route `dry-run` mode (`?dry=1`) trả về validate result mà không insert

**Files mới:**

- `web2/shared/bulk-import.js`
- `web2/shared/bulk-import-modal.html` (template)

**Files sửa:**

- `web2/products/index.html` (thêm nút Import)
- `web2/products/products.js` (handler)
- `web2/variants/index.html` + js
- `web2/partner-supplier/index.html` (qua web2-generic) + so-order
- `render.com/routes/web2-products.js` (thêm `?dry=1` flag)
- `render.com/routes/web2-variants.js` (idem)
- `render.com/routes/web2-generic.js` (idem)

**Risks:**

- Excel column mapping không khớp → cần "Map columns" step trong modal
- Encode UTF-8 với SĐT có leading 0 (Excel cắt) → ép kiểu text khi đọc

**Acceptance criteria:**

- [ ] Import 200 SP từ Excel < 30s
- [ ] Invalid row hiển thị lý do cụ thể (vd "Mã trùng dòng 5", "Giá phải > 0")
- [ ] Rollback toàn bộ nếu dry-run fail
- [ ] Template Excel download có sẵn (1 file `.xlsx` mẫu cho mỗi entity)

**Estimated:** 5 ngày dev.

---

### F04 — Mobile view (reconcile + native-orders + balance-history)

**Why:** Shipper + nhân viên ngoài shop dùng điện thoại; bảng dày cột không scroll được.

**Scope (v1 — 3 trang ưu tiên):**

- **Reconcile (mobile-first):** scanner full-screen, single-card per order, swipe để pack/ship/deliver
- **Native-orders (mobile):** card view (không phải table) với checkbox + 3 action chính (confirm/edit/cancel)
- **Balance-history (mobile):** tab Tất cả/Kế toán; swipe to approve/reject

**Tech approach:**

- CSS-only @media query `max-width: 768px` cho 3 trang
- Pattern: hide table, show stacked card layout
- Sticky bottom action bar (3 button max)
- Disable kéo-thả, hover-only features

**Files sửa:**

- `web2/reconcile/reconcile.css` (mobile section)
- `web2/reconcile/reconcile.js` (touch handler — swipe gesture, dùng `hammer.js` lite hoặc native Touch events)
- `native-orders/css/native-orders.css`
- `native-orders/js/native-orders-app.js`
- `web2/balance-history/css/web2-theme.css`
- `web2/shared/web2-tpos-theme.css` (mobile media query chung — sidebar collapse default mobile)

**Dependencies:** Color upgrade pack đã có (Sprint 0), nhưng phải verify mobile breakpoint.

**Risks:**

- Sidebar 250px cố định → cần off-canvas drawer trên mobile
- Test thật trên iPhone Safari + Android Chrome (không chỉ DevTools)

**Acceptance criteria:**

- [ ] Reconcile + scanner usable trên iPhone 12 + Galaxy A52
- [ ] Không horizontal scroll ở 3 trang
- [ ] Lighthouse mobile score > 85
- [ ] Sidebar drawer slide < 300ms

**Estimated:** 6 ngày dev (2 ngày / trang).

---

### F05 — Audit trail UI

**Why:** 3 audit tables đã có data nhưng không có UI tổng quát. Bị cần khi truy vết "ai sửa cái gì lúc nào".

**Scope:**

- Trang mới `web2/audit-log/index.html`
- Filter: by user · by entity (products/PBH/wallet) · by action (create/update/delete) · by date range
- Bảng: thời gian · user · action · entity · ID · diff before/after
- Click row → modal show JSON diff highlight

**Tech approach:**

- Union view từ 3 bảng:
    - `web2_product_history` (đã có)
    - `pbh_fulfillment_logs` (đã có)
    - `fast_sale_order_history` (đã có)
    - `wallet_adjustments` (đã có)
    - `native_orders_migrations` (đã có)
- Backend route `/api/v2/audit-log` với `?entity=&user=&from=&to=&limit=`
- Pagination + cursor-based để không quét hết bảng

**Files mới:**

- `web2/audit-log/index.html`
- `web2/audit-log/audit-log.js`
- `render.com/routes/v2/audit-log.js`

**Risks:** Schema khác nhau giữa 5 bảng — cần map về common shape `{ts, user, action, entity, entity_id, before, after, source}`.

**Estimated:** 2 ngày dev (UI 1d + backend 1d).

---

### F06 — Notification center

**Why:** Toast hiện lẻ tẻ, dễ miss. Cần inbox tổng để user check sau khi đi ra ngoài.

**Scope (v1):**

- Bell icon trong sidebar header (badge unread count)
- Click bell → dropdown 10 notification gần nhất
- Trang full `web2/notifications/index.html` với filter
- Loại notification:
    - PBH cần xác nhận (PBH state = draft > 24h)
    - Đơn cancel (PBH state = cancel)
    - Ví âm (`customer_wallets.balance < 0`)
    - Hàng tồn kho thấp (`web2_products.stock < 5`)
    - NCC duyệt refund (`web2_records.purchase-refund state = approved`)
    - SePay transaction pending > 1h chưa duyệt

**Tech approach:**

- Bảng mới `web2_notifications`:
    ```sql
    CREATE TABLE web2_notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT,           -- NULL = broadcast all users
      type TEXT NOT NULL,     -- 'pbh_pending', 'wallet_overdraft', ...
      entity_type TEXT,
      entity_id TEXT,
      title TEXT NOT NULL,
      body TEXT,
      severity TEXT,          -- info/warning/danger
      url TEXT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX idx_web2_noti_user_unread ON web2_notifications(user_id, read_at) WHERE read_at IS NULL;
    ```
- Migration trong route `/api/v2/notifications`
- Producer: cron job + event hooks ở các route đã có (PBH create/cancel, wallet update, stock change)
- SSE topic `web2:notifications` → push tới bell icon mọi trang
- Component shared `web2/shared/notification-bell.js` mount sau sidebar

**Files mới:**

- `web2/notifications/index.html`
- `web2/notifications/notifications.js`
- `web2/shared/notification-bell.js`
- `web2/shared/notification-bell.css`
- `render.com/routes/v2/notifications.js`

**Files sửa:**

- `web2/shared/tpos-sidebar.js` (mount bell)
- `render.com/routes/fast-sale-orders.js` (trigger noti khi cancel)
- `render.com/routes/web2-products.js` (trigger noti khi stock < 5)
- `render.com/routes/v2/balance-history.js` (trigger noti khi pending > 1h)

**Risks:**

- Producer có thể spam → cần dedupe key (1 noti per entity_id per type per 1h)
- Cron job 5 phút có thể delay → acceptable

**Acceptance criteria:**

- [ ] Bell badge update realtime (< 5s) qua SSE
- [ ] Click noti → navigate sang entity detail
- [ ] Mark read khi click hoặc khi mở trang notifications
- [ ] Trang notifications filter theo type/severity/date

**Estimated:** 3 ngày dev (DB + backend 1d, frontend bell + page 1.5d, integration 0.5d).

---

### F07 — Customer 360 cho NCC

**Why:** Customer 360° đã có cho KH (orders-report); NCC chưa có view tổng. Cần khi đàm phán + đánh giá NCC.

**Scope (v1 — read-only):**

- Trang mới `web2/supplier-360/index.html`
- Search NCC → mở profile
- Layout 4 panel:
    1. **Info** — tên, mã, SĐT, địa chỉ, tags
    2. **Đơn mua** — list `web2_so_order` filter by supplier
    3. **Công nợ + Ví** — biểu đồ + total + lịch sử thanh toán
    4. **Trả hàng + Rating** — refund history + custom rating (1-5 sao, comment)

**Tech approach:**

- Read-only v1 — aggregate từ 4 source: Firestore so-order, web2_records refund, web2_supplier_wallet, web2_balance_history filter NCC
- Rating: bảng mới `web2_supplier_ratings (supplier_code, user_id, score, comment, created_at)`
- Endpoint `/api/v2/supplier-360/:code` trả về tổng hợp

**Files mới:**

- `web2/supplier-360/index.html`
- `web2/supplier-360/supplier-360.js`
- `render.com/routes/v2/supplier-360.js`

**Dependencies:** F02 aging helper, F08 export.

**Estimated:** 2 ngày dev v1 (read-only). Phase 2 (chat log + alert): sau.

---

### F08 — Print / Export hàng loạt

**Why:** Đang phải in từng đơn / export từng trang riêng. Mất thời gian.

**Scope:**

- **Barcode SP** — chọn nhiều SP ở `products` → in label hàng loạt (8/A4) với mã + tên + giá
- **Label NCC** — chọn nhiều order ở `so-order` → label dán thùng (mã, NCC, ngày, SL)
- **Summary PDF cho so-order** theo tab quốc gia
- **Kế toán report cho balance-history** — Excel weekly/monthly

**Tech approach:**

- jsPDF + JsBarcode (đã có ở reconcile page)
- Helper `web2/shared/export-helpers.js`:
    - `exportBarcodeLabels(items, layout='A4-8x1')`
    - `exportSupplierLabels(orders)`
    - `exportSummaryPDF(data, template)`
    - `exportExcel(rows, sheets)`
- A4 print layout dùng CSS `@media print`

**Files mới/sửa:**

- `web2/shared/export-helpers.js`
- Bulk action bar ở 3 trang (products, so-order, balance-history)

**Risks:** Browser print dialog không reliable; PDF generate lớn (>50 trang) có thể OOM. Cap 100 items / batch.

**Estimated:** 4 ngày dev.

---

### F09 — Smart match SePay → order

**Why:** Hiện manual link transaction; kế toán mất ~30s/transaction. Có thể auto-suggest dựa trên SĐT + amount + recent orders.

**Scope:**

- Backend: thuật toán match score
- Trong UI `balance-history` Tab "Tất cả" → thêm cột "Gợi ý" với 1-3 khách top score
- Click "Confirm" thay vì search manual

**Tech approach:**

- Score function (pure JS, tested):
    ```
    score = 0
    if amount === order.total: score += 50
    if amount within ±5% of order.total: score += 30
    if phone in description (regex): score += 40
    if customer_name in description (case-insensitive): score += 20
    if order.created_at within 24h of transaction.ts: score += 30
    if customer has prior matched transaction: score += 10
    return score (max ~150)
    ```
- Top 3 suggestions ranked by score > 50
- Endpoint `/api/v2/balance-history/:id/suggest-match` trả ranked customers + orders
- Auto-link nếu score = 1 candidate ≥ 120 (setting toggle)

**Files mới:**

- `render.com/routes/v2/balance-history-match.js`
- `web2/shared/match-scorer.js` (tested với jest local hoặc node test)

**Files sửa:**

- `web2/balance-history/index.html` (column gợi ý)
- `web2/balance-history/js/balance-history.js`

**Risks:**

- False positives nguy hiểm (link nhầm customer = sai tiền). Phải có audit log + undo
- Cần test edge cases: chuyển khoản cùng amount khác customer → score bằng nhau → không auto-link

**Acceptance criteria:**

- [ ] Top suggestion match >= 80% trên 50 transaction test set
- [ ] Auto-link chỉ trigger khi score ≥ 120 và setting on
- [ ] Audit log mọi auto-link (`wallet_adjustments` source='smart-match')

**Estimated:** 4 ngày (algorithm 1.5d + UI 1d + testing 1.5d).

---

### F10 — Variants matrix UI

**Why:** Tạo SP có nhiều size × màu mất nhiều thao tác (add từng biến thể).

**Scope:**

- Modal "Tạo SP với matrix" ở `products`
- Grid 2D: rows = sizes selected, cols = colors selected
- Mỗi cell có: SL pending, giá mua, giá bán (default fill from base)
- Auto-generate code: `<base_code>-<size_short>-<color_short>`
- Submit → bulk-create variants + 1 base product

**Tech approach:**

- Reuse variant picker đã có (`web2/shared/variant-picker.js` hoặc tương đương)
- Sub-modal "Chọn matrix" với multi-select sizes + colors
- Preview grid trước khi confirm
- Submit gọi `POST /api/web2-products/bulk-create-matrix` (route mới)

**Files mới/sửa:**

- `web2/products/products-matrix-modal.html` (template)
- `web2/products/products-matrix.js`
- `render.com/routes/web2-products.js` (thêm `bulk-create-matrix`)

**Risks:** Code collision nếu short-code biến thể trùng → cần validate trước submit.

**Estimated:** 3 ngày dev.

---

### F11 — Inventory forecasting

**Why:** Hiện không biết khi nào cần tái nhập. Đặt NCC quá trễ → hết hàng giữa live. Quá sớm → ứ vốn.

**Scope (v1 — đơn giản):**

- Backend job tính velocity = (SL bán 30 ngày qua) / 30
- Cho mỗi SP, predict: `days_left = stock / velocity`
- UI: cột mới ở `products` "Còn ~X ngày" + filter "Cần re-order (<7 ngày)"
- Trang riêng `web2/inventory-forecast/index.html` với chart + suggest re-order qty (= velocity _ lead_time_days _ safety_factor)

**Tech approach:**

- Aggregate query: `SELECT product_code, SUM(qty) FROM fast_sale_orders_lines WHERE created_at > NOW() - INTERVAL '30 days' AND state='done' GROUP BY product_code`
- Lưu vào `web2_product_velocity (code, daily_avg, updated_at)` — cron nightly
- Endpoint `/api/v2/inventory-forecast/list`

**Files mới:**

- `web2/inventory-forecast/index.html` + js
- `render.com/routes/v2/inventory-forecast.js`
- Cron `render.com/jobs/inventory-velocity.js`

**Dependencies:** F01 Dashboard (consume same velocity data).

**Risks:**

- Cần SL bán per-line trong PBH (đang có?); cần verify schema
- 30-day window có thể không đủ với SP seasonal — flag để mở rộng sau

**Estimated:** 4 ngày dev.

---

### F12 — Permission matrix UI

**Why:** Endpoint `PUT /:id/permissions` đã có; UI hiện checkbox flat không scale với 80+ pages.

**Scope:**

- Trong trang `web2/users/`, click "Quyền" → mở modal matrix
- Header cols = action (view/edit/delete/admin)
- Rows = trang Web 2.0 (group theo category: Bán hàng / Mua hàng / Kho / Báo cáo / System)
- Quick action buttons: "Apply role template" (admin/manager/staff) · "Copy from user" · "Clear all"
- Save → `PUT /:id/permissions`

**Tech approach:**

- Reuse `/api/web2-users/pages` để liệt kê pages + role-defaults endpoint
- UI: table với checkbox grid, accordion theo category
- Diff highlight (yellow) các permission khác với role default

**Files mới:**

- `web2/users/users-permission-modal.html` (template)
- `web2/users/users-permission.js`

**Files sửa:**

- `web2/users/users.js` (mở modal thay vì checkbox flat)

**Estimated:** 2 ngày dev.

---

## 5. Migration / Database changes summary

| Feature        | New tables                   | New columns | Migration ID (suggest) |
| -------------- | ---------------------------- | ----------- | ---------------------- |
| F06 Noti       | `web2_notifications` + index | —           | 082                    |
| F07 NCC 360    | `web2_supplier_ratings`      | —           | 083                    |
| F09 SmartMatch | —                            | —           | (algorithm only)       |
| F11 Forecast   | `web2_product_velocity`      | —           | 084                    |

Tất cả migration theo pattern hiện tại: `ensureXxx()` function trong route, idempotent, chạy lần đầu request.

---

## 6. SSE topics changes summary

| Feature        | New topic            | Cross-publish               |
| -------------- | -------------------- | --------------------------- |
| F01 Dashboard  | `web2:kpi-dashboard` | Subscribe tất cả topic khác |
| F06 Noti       | `web2:notifications` | Producer ở mọi route đã có  |
| F09 SmartMatch | (reuse `wallet:all`) | —                           |

---

## 7. Open questions (cần user confirm trước Sprint 1)

1. **Priority order:** Có đồng ý với thứ tự Sprint 1-4 không? Hoặc muốn feature nào lên trước?
2. **F04 Mobile:** Chỉ làm 3 trang ưu tiên hay tất cả 13? (Effort × 4 nếu all)
3. **F06 Noti channels:** Chỉ in-app bell hay cần push browser notification + email/Zalo cho admin?
4. **F09 Auto-link:** Bật auto-link mặc định hay chỉ "Suggest" v1?
5. **F11 Forecasting:** Có dữ liệu line items đầy đủ trong `fast_sale_orders` không? Cần kiểm tra schema.
6. **F07 NCC 360:** v1 read-only có đủ không hay cần edit rating + chat history luôn?
7. **Design system:** Tuân theo COLOR UPGRADE PACK hiện tại hay redesign với DESIGN.md từ designmd.ai?
8. **Testing:** Có cần coverage cụ thể? Hiện project không có CI test runner cho frontend.

---

## 8. Risks tổng thể

- **Scope creep:** Mỗi feature đều có thể mở rộng thêm. Plan này là v1 — chốt scope trước khi code.
- **Schema migration concurrent:** F06 + F07 + F11 cùng add table. Test trên local DB riêng (pattern `scripts/test-migration-*.js`).
- **SSE throughput:** Nếu 5+ tab open mỗi user × 10 topic → có thể vượt limit Render free tier. Monitor qua `/api/v2/sse/stats`.
- **Bundle size:** SheetJS + jsPDF + Chart.js có thể đẩy lên 500KB+. Lazy import bắt buộc.
- **Browser cache:** Mỗi commit phải bump cache version `?v=` consistent.

---

## 9. Progress tracking

Khi bắt đầu code, mở file `docs/plans/web2-future-progress.md` (sẽ tạo trong Sprint 1) để log từng task done/blocked. Theo pattern [`docs/plans/progress-log.md`](./progress-log.md) hiện có.

---

## 10. Approval

- [ ] User confirm priority order & open questions section 7
- [ ] User confirm scope cho từng feature (có thể trim nếu muốn ship nhanh)
- [ ] Claude tạo `docs/plans/web2-future-progress.md` + bắt đầu Sprint 1 F06 (Notification center)

**Next step:** Trả lời 8 open questions ở section 7, tôi sẽ refine plan rồi kick off Sprint 1.
