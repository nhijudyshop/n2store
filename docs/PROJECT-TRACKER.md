# N2Store Project Tracker
<!-- SYNC_VERSION: 1 -->
<!-- LAST_UPDATED: 2026-03-18 -->

> Bảng mục lục tính năng chi tiết toàn bộ hệ thống N2Store.
> Dùng cho team, stakeholders và AI agent theo dõi + phát triển.

---

## Tổng quan hệ thống

| Metric | Giá trị |
|--------|---------|
| Tổng modules | 22+ |
| Tech Stack | Vanilla JS + Firebase + Vite + Tailwind |
| Database | Firestore + Realtime DB + TPOS OData |
| Deployment | Firebase Hosting + Cloudflare Worker |
| CI/CD | GitHub Actions (ci.yml + deploy.yml) |
| PWA | Service Worker (3 cache strategies) |

---

## Sơ đồ luồng nghiệp vụ (8 bộ phận - từ quy-trinh-chuan.md)

```
BP1: Nhập hàng & Làm mã → BP2: Live Sale → BP3: Trả hàng theo phiếu → BP4: Chốt đơn (Sale)
                                                                              ↓
BP8: Check IB ← BP7: CSKH ← BP6: Đóng đơn & Giao shipper ← BP5: Đi chợ & Đối soát
```

### Module Map theo quy trình nghiệp vụ

| Quy trình | Modules hỗ trợ | Ghi chú |
|-----------|----------------|---------|
| BP1: Nhập hàng & Làm mã | `nhanhang`, `purchase-orders`, `bangkiemhang`, `product-warehouse` | 7 bước: Cân → Khui → Đối soát → Nhập web → Rút mẫu → Xếp kệ → Đưa mẫu live |
| BP2: Live Sale | `soluong-live`, `order-management`, `inbox`, `balance-history` | 5-6 nhân sự: Bấm phiếu + Đặt NCC + Phân phiếu + Check CK + Nhập giỏ |
| BP3: Trả hàng theo phiếu | `order-management`, `inventory-tracking` | Trả hàng theo phiếu → Xử lý thiếu → Đưa lên kệ STT |
| BP4: Chốt đơn | `orders-report`, `don-inbox`, `balance-history` | 4 mục: OK, Xử lý, Không chốt, Khách xã. Gộp đơn → Đẩy tin → Chia STT → Ra bill |
| BP5: Đi chợ & Đối soát | `orders-report`, `hanghoan` | Nhận bill → Đi chợ STT → Đối soát SP → Gói hàng |
| BP6: Đóng đơn & Giao ship | `orders-report` | Đóng gói → Phân TP/Tỉnh → Xuất excel → Quét mã → Gọi ship |
| BP7: CSKH | `issue-tracking`, `hanghoan`, `customer-hub` | Theo dõi bưu cục → Xử lý hoàn → Nhận hàng → Đưa lên live |
| BP8: Check IB | `inbox`, `don-inbox`, `order-management` | Đặt qua Zalo → Gắn thẻ chờ → Đi đơn → Xử lý đổi/lỗi |

---

## MỤC LỤC TÍNH NĂNG CHI TIẾT

---

### [AUTH] Đăng Nhập {#login}
- **Module**: `index/` | **Status**: done | **Completion**: 100%
- **Dependencies**: Firebase Auth

#### Features
- [x] Đăng nhập username/password với bcrypt/PBKDF2 {priority:high}
- [x] Remember me 30 ngày + session management {priority:high}
- [x] Rate limiting (5 lần sai = khóa 5 phút) {priority:high}
- [x] Firebase Auth anonymous session {priority:medium}
- [x] Cache user để đăng nhập nhanh lần sau {priority:medium}
- [x] Auto-redirect khi session còn hợp lệ {priority:medium}

---

### [WAREHOUSE] Cân Nặng Hàng {#nhanhang}
- **Module**: `nhanhang/` | **Status**: done | **Completion**: 95%
- **Dependencies**: none
- **BP liên quan**: BP1 Bước 1 (Nhận hàng & Cân hàng)

#### Features

##### Tạo & quản lý phiếu cân
- [x] Tạo phiếu cân mới (nút "Thêm phiếu") {priority:high}
- [x] Sửa phiếu cân (inline edit) {priority:high}
- [x] Xóa phiếu cân (với xác nhận) {priority:high}
- [x] Form fields: Tên người nhận, Số kg, Số kiện, Ghi chú {priority:high}
- [x] Date/Time auto-capture {priority:medium}
- [x] Form validation (kg, kiện, tên) {priority:medium}

##### Stats Dashboard
- [x] Card: Tổng phiếu (count) {priority:medium}
- [x] Card: Tổng kg (sum) {priority:medium}
- [x] Card: Tổng kiện (count) {priority:medium}

##### Bảng phiếu cân
- [x] Columns: Tên người nhận, Số kg, Số kiện, Ghi chú, Hình ảnh, Ngày giờ nhận, Thao tác {priority:high}
- [x] Mobile card layout (responsive) {priority:medium}
- [x] Row actions: Edit, Delete {priority:high}

##### Filter & Search
- [x] Filter by user (dropdown người nhận) {priority:medium}
- [x] Date filter: All/Hôm nay/Hôm qua/Tuần này/Tháng này/Custom {priority:medium}
- [x] Date range picker (dd/mm/yyyy) {priority:medium}

##### Image Management
- [x] Upload file ảnh {priority:high}
- [x] Chụp ảnh camera (mobile) {priority:high}
- [x] Nén ảnh tự động {priority:medium}
- [x] Lazy loading gallery {priority:medium}
- [x] Eager upload system {priority:medium}
- [x] Image zoom modal (click to view) {priority:low}

##### Data Operations
- [x] Refresh data from Firebase {priority:medium}
- [x] Export Excel {priority:medium}
- [x] Lịch sử chỉnh sửa & audit logging {priority:medium}

##### Mobile
- [x] FAB (Floating Action Button) menu {priority:medium}
- [x] Mobile-optimized table {priority:medium}
- [x] Role-based permissions {priority:medium}

---

### [WAREHOUSE] Theo Dõi Nhập Hàng SL {#inventory-tracking}
- **Module**: `inventory-tracking/` | **Status**: done | **Completion**: 90%
- **Dependencies**: purchase-orders
- **BP liên quan**: BP1 Bước 3 (Đối soát bill NCC)

#### Features

##### Tab 1: Đặt Hàng (Order Booking)

###### Date Filters
- [x] Quick buttons: 7N, 15N, 30N {priority:medium}
- [x] Navigation arrows: Prev/Next day {priority:medium}
- [x] Date selector: Hôm nay, 3/7/10 ngày, Single day, Custom range {priority:medium}
- [x] Filter lock indicator {priority:low}

###### Inline Filters
- [x] NCC filter (supplier name) {priority:high}
- [x] Status filter: Tất cả/Đang chờ giao/Đã nhận/Đã hủy {priority:high}
- [x] Product search (tìm mã SP) {priority:medium}
- [x] Clear filters button {priority:low}

###### Order Booking Operations
- [x] Add Order Booking button {priority:high}
- [x] Order count display {priority:medium}
- [x] Order card display (NCC, date, items, total, status, actions) {priority:high}
- [x] Add/Edit modal form {priority:high}

##### Tab 2: Theo Dõi Đơn Hàng (Tracking)
- [x] Cùng date range & filter system {priority:medium}
- [x] Add shipment button {priority:high}
- [x] Export Excel {priority:medium}
- [x] Shipment cards (received date, shortage, packages, weight) {priority:high}

###### Modals
- [x] Modal: Thêm Đợt Hàng Mới (shipment date, items, quantities, invoice, shipping cost, shortage notes) {priority:high}
- [x] Modal: Chi Tiết Tiền Hóa Đơn (invoice number, amount, paid/unpaid) {priority:high}
- [x] Modal: Chi Tiết Chi Phí Hàng Về (carrier, cost, tracking, delivery date) {priority:medium}
- [x] Modal: Cập Nhật Số Món Thiếu (missing products, quantities, reason, photos) {priority:medium}
- [x] Modal: Image Viewer {priority:low}
- [x] Modal: AI Preview (AI-parsed invoice data) {priority:medium}
- [x] Modal: Compare shipments {priority:low}

##### Tab 3: Công Nợ (Finance - LOCKED)
- [x] Finance table: Ngày, Loại, Ghi chú, Số tiền, Actions {priority:high}
- [x] Summary: Tạm ứng, Chi phí hóa đơn, Ship, Khác, Còn lại {priority:high}
- [x] Thêm Thanh Toán Trước (prepayment modal: NCC, amount, date, method, notes) {priority:medium}
- [x] Thêm Chi Phí Khác (expense modal: type, amount, category, date, notes) {priority:medium}
- [x] Debt summary by supplier (total debt, prepaid, outstanding) {priority:high}
- [x] Detail modals cho hóa đơn & shipping costs {priority:medium}

##### Common
- [x] Language toggle (Việt hóa) {priority:low}
- [x] Refresh button {priority:medium}
- [x] AI Invoice Processor (auto-extract from photos) {priority:medium}
- [x] Edit history tracking {priority:medium}
- [x] Permission-based access {priority:medium}

---

### [WAREHOUSE] Quản Lý Đặt Hàng NCC {#purchase-orders}
- **Module**: `purchase-orders/` | **Status**: done | **Completion**: 85%
- **Dependencies**: product-warehouse, TPOS API
- **BP liên quan**: BP1 Bước 4 (Nhập SP lên web + mua hàng TPOS)

#### Features

##### Tab System
- [x] DRAFT tab (Nháp) - gray badge {priority:high}
- [x] AWAITING_PURCHASE tab (Chờ mua) - blue badge {priority:high}
- [x] AWAITING_DELIVERY tab (Chờ hàng) - amber badge {priority:high}
- [x] HISTORY tab (Lịch sử) - completed/cancelled {priority:medium}
- [x] NOTES tab - "Hàng bán dùm" (commission goods) {priority:medium}

##### Status Flow
- [x] DRAFT → AWAITING_PURCHASE, CANCELLED {priority:high}
- [x] AWAITING_PURCHASE → AWAITING_DELIVERY, DRAFT, CANCELLED {priority:high}
- [x] AWAITING_DELIVERY → RECEIVED, CANCELLED {priority:high}
- [x] RECEIVED → COMPLETED {priority:high}
- [x] Status color badges (gray/blue/amber/green/red) {priority:medium}

##### Quick Filters
- [x] All/Today/Yesterday/7d/30d/This month/Last month {priority:medium}

##### Order CRUD
- [x] Create Order Modal (NCC, items: code/name/variant/qty/price, discount, shipping, notes) {priority:high}
- [x] Edit Order Modal {priority:high}
- [x] Order Details Modal {priority:high}

##### Order Details Modal - Chi tiết
- [x] Item table: Product code, name, variant, quantity, unit price, line total {priority:high}
- [x] Inline price editing (enable/lock, zero-price bypass checkbox) {priority:medium}
- [x] Cost calculations: Total qty, Subtotal, Discount, Shipping, Final amount {priority:high}
- [x] Zero-price warning {priority:medium}

##### TPOS Integration
- [x] Sync to TPOS button (gửi đơn lên TPOS) {priority:high}
- [x] TPOS credentials per company {priority:medium}
- [x] Barcode generation (JsBarcode) {priority:high}
- [x] Product code generation {priority:medium}
- [x] Variant utilities (normalize formats) {priority:medium}
- [x] Supplier detection from product {priority:medium}

##### Table & Export
- [x] Summary cards (total orders, by status, financial) {priority:medium}
- [x] Pagination (10/20/50/100 per page) {priority:medium}
- [x] Export to Excel {priority:medium}
- [x] Overdue items alert {priority:low}
- [x] Edit history tab {priority:medium}

---

### [WAREHOUSE] Kiểm Hàng {#bangkiemhang}
- **Module**: `bangkiemhang/` | **Status**: done | **Completion**: 80%
- **Dependencies**: purchase-orders
- **BP liên quan**: Chuẩn bị trước live - Check hàng

#### Features
- [x] Dashboard stats: Tổng SP (blue), Đã nhận (green), Nhận thiếu (orange), Chờ nhận (purple) {priority:high}
- [x] Quick Filter: All/Today/Yesterday/7d/30d/Month/Last month/Custom {priority:medium}
- [x] NCC filter dropdown {priority:medium}
- [x] Date From/To inputs {priority:medium}
- [x] Global search (full-text across all fields) {priority:medium}
- [x] Result count badge {priority:low}
- [x] Collapsible filter panel {priority:low}
- [x] Table: Ngày Đặt, NCC, Ngày Nhận, Mã SP, Tên SP, SL Đặt, Thực Nhận, Tổng Nhận, Actions {priority:high}
- [x] Filter by status: Completed/Partial/Pending/All {priority:medium}
- [x] Export Excel {priority:medium}
- [x] Refresh button {priority:medium}

---

### [WAREHOUSE] Kho Sản Phẩm {#product-warehouse}
- **Module**: `product-warehouse/` | **Status**: done | **Completion**: 85%
- **Dependencies**: TPOS OData API

#### Features
- [x] Search sản phẩm (mã/tên) với autocomplete Excel suggestions {priority:high}
- [x] Stock filter: All, In Stock, Low Stock (≤5), Out of Stock {priority:medium}
- [x] Product Group filter (Nhóm SP) {priority:medium}
- [x] Status filter: All/Active/Inactive {priority:medium}
- [x] Product count display {priority:low}
- [x] Refresh + Column Settings buttons {priority:medium}

##### Product Table (19 columns)
- [x] Checkbox (multi-select) {priority:medium}
- [x] Actions (View, variants) {priority:high}
- [x] Image thumbnail {priority:medium}
- [x] Mã (sortable, filter input) {priority:high}
- [x] Tên (sortable, filter input) {priority:high}
- [x] Nhóm sản phẩm (sortable) {priority:medium}
- [x] Giá bán, Giá mua mặc định, Giá vốn (sortable) {priority:high}
- [x] Số lượng thực tế, Số lượng dự báo (sortable) {priority:high}
- [x] Đơn vị, Nhãn, Hiệu lực, All Company, Ghi chú, Ngày tạo, Công ty, Người tạo {priority:medium}

##### Variant System
- [x] Variant expansion/collapse per product {priority:medium}
- [x] Variant images display {priority:medium}
- [x] Variant-level pricing {priority:medium}

##### Technical
- [x] Server-side pagination (50/page) {priority:medium}
- [x] Dynamic sorting (client + server) {priority:medium}
- [x] Column visibility management (saved localStorage) {priority:low}
- [x] Image lazy loading {priority:low}
- [x] Stock status color coding {priority:low}

---

### [LIVE] Quản Lý Số Lượng Live {#soluong-live}
- **Module**: `soluong-live/` | **Status**: done | **Completion**: 90%
- **Dependencies**: Firebase Realtime DB
- **BP liên quan**: BP2 (Live Sale - quản lý số lượng real-time)

#### Features

##### Header & Navigation
- [x] Language toggle (Việt hóa) {priority:low}
- [x] Export Excel button {priority:medium}
- [x] Refresh button {priority:medium}
- [x] Campaign selector + badge {priority:medium}
- [x] Nav links: Sales Report, Social Sales, Expanded List {priority:medium}

##### Product Management
- [x] Product search bar + autocomplete suggestions {priority:high}
- [x] Quick add product {priority:high}
- [x] Product card: Image, Name, ListPrice, Available/Sold/Remaining qty {priority:high}
- [x] Hide/unhide product toggle {priority:medium}
- [x] Hidden products section (count badge, search, unhide) {priority:medium}
- [x] Product list preview (search within list) {priority:medium}

##### Variant Management
- [x] Variant selection (click to add) {priority:high}
- [x] Auto-sort variants by size (S→XXXL) or number {priority:medium}
- [x] Auto-add variants toggle (all color/size) {priority:medium}
- [x] Variant pricing display {priority:medium}

##### Cart Snapshot System
- [x] Save cart snapshot (name + description) {priority:high}
- [x] Cart metadata: Product count, Total items, Visible/Hidden, Sold, Remaining {priority:medium}
- [x] View all snapshots (filter by date) {priority:medium}
- [x] Restore snapshot (with auto-save current option) {priority:high}
- [x] Delete snapshot {priority:medium}
- [x] Restore confirmation dialog {priority:medium}

##### Settings Sidebar
- [x] Auto-add variants toggle {priority:low}
- [x] Clear all products (with confirmation) {priority:medium}
- [x] Save & Refresh (save snapshot + start fresh) {priority:medium}
- [x] Cart history management {priority:medium}
- [x] Logout button {priority:low}

##### Sub-Views
- [x] soluong-list.html: Fullscreen 4x2 grid (touch-optimized, search highlight) {priority:medium}
- [x] social-sales.html: Social platform sales tracking (FB, TikTok) {priority:medium}
- [x] sales-report.html: Daily sales summary, channel breakdown, top items {priority:medium}

##### Technical
- [x] Firebase Realtime DB integration {priority:high}
- [x] Multi-device realtime sync {priority:high}
- [x] Auto-cleanup products (7 days) {priority:low}
- [x] Permission-based redirect (social vs livestream) {priority:medium}
- [x] Campaign tagging {priority:medium}

---

### [SALES] Quản Lý Đơn Hàng {#orders-report}
- **Module**: `orders-report/` | **Status**: done | **Completion**: 90%
- **Dependencies**: TPOS, Pancake, balance-history
- **BP liên quan**: BP4 (Chốt đơn), BP5 (Đối soát), BP6 (Đóng đơn)

#### Features

##### Tab 1: Quản Lý Đơn Hàng

###### Control Bar (collapsible)
- [x] Campaign display (purple border, clickable) {priority:high}
- [x] Stats: Total orders, Currently displayed, Total amount, Loading % {priority:medium}

###### Action Buttons (9 buttons)
- [x] Cài đặt phân chia nhân viên (min/max order amounts per employee) {priority:medium}
- [x] Xem phân chia nhân viên (grouped by employee view) {priority:medium}
- [x] Cài Đặt Chiến Dịch (campaign selector, date range, realtime toggle, skip range) {priority:high}
- [x] Xóa Cache (clear browser storage) {priority:low}
- [x] Gộp sản phẩm đơn trùng SĐT (merge duplicates by phone) {priority:high}
- [x] Gán Tag Hàng Loạt (STT range input, tag selector, progress) {priority:high}
- [x] Xóa Tag Hàng Loạt (bulk tag removal) {priority:medium}
- [x] Cài Đặt Bill (template config, TPOS account) {priority:medium}
- [x] Tài khoản TPOS (password/bearer token auth) {priority:medium}

###### Orders Table (13 columns)
- [x] Checkbox (multi-select) {priority:medium}
- [x] STT (SessionIndex) {priority:high}
- [x] Mã (Order Code) {priority:high}
- [x] Khách (Customer Name) {priority:high}
- [x] SĐT (Phone - clickable for debt/QR) {priority:high}
- [x] Địa chỉ (Address - truncated, tooltip) {priority:medium}
- [x] SP (Product count) {priority:medium}
- [x] SL (Total quantity) {priority:medium}
- [x] Tiền (Amount) {priority:high}
- [x] Tag (color-coded with quick actions) {priority:high}
- [x] Tin Nhắn (Message count badge) {priority:medium}
- [x] Bình Luận (Comment count badge) {priority:medium}
- [x] Actions (Edit, Chat, Menu) {priority:high}

###### Sortable columns: Phone, Address, Debt, Total, Quantity {priority:medium}
###### Merged order columns (same-phone): Merged messages, Combined qty, Total sum, Dropdown edit {priority:medium}

###### Search & Filter
- [x] Real-time search (300ms debounce): STT, Code, Phone, Name, Address, Note {priority:high}
- [x] Sticky search on scroll {priority:low}
- [x] Campaign filter dropdown {priority:medium}
- [x] Date range (datetime-local) {priority:medium}
- [x] Realtime toggle + polling interval {priority:medium}
- [x] Tag filter (multi-select, search within, refresh tags) {priority:high}

###### Modals

**Edit Order Modal (7 tabs)**
- [x] Info tab: Name, Phone, Address (editable), Address lookup button, Order code, Status, Total, Notes {priority:high}
- [x] Products tab: Product search, table (image/name/code/qty±/price/subtotal/note), add/edit/delete per product {priority:high}
- [x] Delivery tab: Delivery info {priority:medium}
- [x] Live tab: Campaign name/code/description, person in charge, creation time {priority:medium}
- [x] Invoices tab: Invoice number/date/total {priority:medium}
- [x] History tab: Order modification history {priority:medium}
- [x] Invoice History tab: Invoice history {priority:medium}

**Chat Modal**
- [x] Messages tab: Facebook comments & replies, infinite scroll, search {priority:high}
- [x] Comments tab: Order-specific notes {priority:medium}
- [x] Image upload + paste (with compression) {priority:medium}
- [x] Quick reply templates + template manager modal {priority:medium}
- [x] Live-comment read-only modal {priority:medium}
- [x] Mark as read {priority:low}
- [x] 24-hour window fallback for old messages {priority:low}

**Tag Management Modal**
- [x] Tag search autocomplete {priority:medium}
- [x] Selected tags display (color badges) {priority:medium}
- [x] Create new tag (name + color picker hex) {priority:medium}
- [x] Auto-create tag with random color on Enter {priority:low}

**Bulk Tag Modal**
- [x] STT input (individual or ranges "100-200") {priority:high}
- [x] Tag selector (multi-select) {priority:high}
- [x] Progress indicator {priority:medium}
- [x] Results modal (success/failed count) {priority:medium}
- [x] History modal (past bulk operations) {priority:low}

**Merge Products Modal**
- [x] List duplicate phone orders {priority:high}
- [x] Show merged info (STTs, customers, total) {priority:medium}
- [x] Execute merge + progress {priority:high}
- [x] History modal {priority:low}

**QR & Debt Modal**
- [x] Phone display + QR code (downloadable) {priority:high}
- [x] Debt amount + wallet balance {priority:high}
- [x] Payment amount input + method selector {priority:medium}
- [x] Virtual balance display {priority:medium}
- [x] Payment confirmation {priority:medium}

**Sale Modal (Bulk Order Processing)**
- [x] Orders list from TPOS cache {priority:high}
- [x] Order selector (phone/customer/amount) {priority:high}
- [x] Product search within order {priority:medium}
- [x] Quantity adjustments + discount parsing {priority:medium}
- [x] Fast Sale results modal {priority:medium}
- [x] Bill preview modal {priority:medium}
- [x] Fulfillment modal {priority:medium}
- [x] Invoice status modal {priority:medium}

**Other Modals**
- [x] Product Stats modal (sales breakdown by product) {priority:medium}
- [x] Bill Template Settings modal {priority:low}
- [x] Partner/Order Status modal (status grid with icons) {priority:medium}
- [x] Processing Tags modal (manage + bulk assign ptags) {priority:medium}

###### Real-Time Features
- [x] Firebase tag updates (bi-directional sync) {priority:high}
- [x] Realtime message polling from Facebook {priority:medium}
- [x] Realtime debt/QR updates via SSE {priority:medium}
- [x] Live product inventory sync {priority:medium}

###### Special Features
- [x] Address lookup (Vietnamese text → Province/District/Ward) {priority:medium}
- [x] Product note encoding (Base64 + XOR) {priority:low}
- [x] Employee distribution (range-based assignment, visual swimlanes) {priority:medium}
- [x] Image handling (upload, paste, Firebase cache, zoom viewer) {priority:medium}

##### Tab 2: Gán Sản Phẩm - STT
- [x] Product search (autocomplete by code/barcode) {priority:high}
- [x] Assignment search filter (by product/name/STT) {priority:medium}
- [x] Assignment table: Product (50%) | STT (40%) | Actions (10%) {priority:high}
- [x] Multi-select delete + clear all {priority:medium}

###### Upload Section (2 view modes)
- [x] Toggle: "Theo Đơn" (by order) / "Theo Sản Phẩm" (by product) {priority:medium}
- [x] Upload stats: Total items, Products, Orders, Selected {priority:medium}
- [x] By Order view: Checkbox, STT, Customer, Products, Quantity {priority:high}
- [x] By Product view: Checkbox, Image, Name/Code, STT list, Total qty {priority:high}
- [x] Select all/Deselect all {priority:low}
- [x] Upload button (submit to TPOS) {priority:high}
- [x] Hoàn tất phiên làm việc (finalize session) {priority:medium}
- [x] Upload History V2 modal (batches, rollback, re-upload) {priority:medium}
- [x] Export Excel modal {priority:medium}
- [x] Remove Product modal (product selector, STT list, batch remove) {priority:medium}

##### Tab 3: Báo Cáo Tổng Hợp

###### Header
- [x] Table selector dropdown (live vs saved copy) {priority:medium}
- [x] Làm mới danh sách (refresh from Tab1) {priority:medium}
- [x] Lấy chi tiết đơn hàng (batch fetch from API) {priority:high}
- [x] Đồng bộ Tab1 (sync latest) {priority:medium}
- [x] Lưu báo cáo (save snapshot) {priority:medium}
- [x] Quản lý bản lưu (manage saved reports) {priority:low}

###### Sub-tabs

**Tổng Quan (Overview)**
- [x] Stats cards: Total orders, Total amount, Total products, Unique customers {priority:high}
- [x] Tag Statistics: "X ĐƠN", "X ĐƠN CHỐT", Thêm tag, Table (Tag/Count/%/Amount/Actions) {priority:high}
- [x] Employee Statistics: Grid cards (Name, Order count, Total, %) {priority:medium}
- [x] Empty Cart Reasons: Table (Tag/Count/%/Actions) {priority:medium}
- [x] Discount Statistics: Breakdown by employee {priority:low}

**Chi tiết đã tải (Cached Details)**
- [x] Badge showing cached count {priority:low}
- [x] Full orders table (sortable, searchable) {priority:medium}

**Phân tích hiệu quả (Analysis)**
- [x] Permission-controlled analytics {priority:medium}

**Sổ Sách (Ledger)**
- [x] Accounting/ledger view {priority:medium}
- [x] Transaction list + balance tracking {priority:medium}
- [x] Export ledger {priority:medium}

###### Progress Indicator (batch fetch)
- [x] Progress bar with %, order count (X/Y), cancel button {priority:medium}

###### Report Modals
- [x] Save Report modal (name, campaign, archive) {priority:medium}
- [x] Manage Reports modal (list, load/delete/export) {priority:medium}

##### Tab 4: Bill Đã Xóa
- [x] Header with red stats badge (count) {priority:medium}
- [x] Search box + clear button {priority:medium}
- [x] Table: Order Code, Bill Code, Reason, Status, Timestamp, Actions {priority:high}
- [x] Khôi phục Bill (restore) {priority:high}
- [x] Xóa vĩnh viễn (permanent delete with confirmation) {priority:medium}

##### Tab 5: KPI - Hoa Hồng
- [x] Date range filters (start/end + presets: Today/Week/Month/Last month) {priority:medium}
- [x] Employee filter (multi-select) {priority:medium}
- [x] Campaign filter {priority:medium}
- [x] Tải dữ liệu + Làm mới + Xuất Excel buttons {priority:medium}
- [x] Summary cards: Total KPI, Total Commission, Average/employee, Achievement % {priority:high}
- [x] KPI Table: Employee, Base Sales, Bonus Products/Amount, Commission Rate, Total, Status badge {priority:high}
- [x] Grouped by employee, color-coded status {priority:medium}
- [x] Employee KPI Drill-Down modal (targets, actual, bonus, calculation) {priority:medium}
- [x] KPI Audit modal (change log) {priority:low}

##### Global
- [x] Campaign Firebase Badge (top right - match/mismatch status) {priority:medium}
- [x] Sync indicator (bottom right - spinning animation) {priority:low}
- [x] Mobile dropdown tab selector {priority:medium}
- [x] Inter-tab messaging (postMessage) {priority:medium}
- [x] Tab restoration from localStorage {priority:low}
- [x] Keyboard shortcuts: F2 (product search), ESC (close modals) {priority:low}

---

### [SALES] Order Management {#order-management}
- **Module**: `order-management/` | **Status**: done | **Completion**: 85%
- **Dependencies**: TPOS, soluong-live
- **BP liên quan**: BP2 "Nhập sản phẩm vào giỏ hàng"

#### Features

##### Campaign Management
- [x] Campaign selector dropdown {priority:high}
- [x] Campaign badge display (checkmark) {priority:medium}
- [x] Campaign loading from Firestore {priority:high}
- [x] Order count display per campaign {priority:medium}

##### Product Management
- [x] Add product via search (autocomplete, Vietnamese diacritics) {priority:high}
- [x] Product details: Image, Name, Price, Quantity, Variants {priority:high}
- [x] Variant sorting (S→XXL or number) {priority:medium}
- [x] Auto-add variants toggle (all color/size) {priority:medium}
- [x] Variant selection (click to add) {priority:medium}
- [x] Product quantity input (Available/Ordered) {priority:high}
- [x] Product price fields (ListPrice/PriceVariant) {priority:medium}
- [x] Bracket extraction from names (e.g., "[SKU]") {priority:low}

##### Product List
- [x] Grid/list preview of added products {priority:high}
- [x] List search/filter (realtime by name/code) {priority:medium}
- [x] Hidden products section (separate section, count) {priority:medium}
- [x] Hide/Unhide product {priority:medium}
- [x] Remove product from cart {priority:high}
- [x] Product count badge (visible + hidden) {priority:medium}

##### Image Management Modal (4 tabs)
- [x] Tab 1: Paste clipboard image {priority:medium}
- [x] Tab 2: File upload (drag-drop) {priority:medium}
- [x] Tab 3: Camera capture (start/stop/switch camera) {priority:medium}
- [x] Tab 4: URL input {priority:low}
- [x] Image preview thumbnail {priority:medium}

##### Cart Snapshots
- [x] Save cart snapshot (name/description) {priority:high}
- [x] Cart stats: Product count, Total items, Visible/Hidden, Sold, Remaining {priority:medium}
- [x] Snapshot list (filter by date, view/restore/delete) {priority:medium}
- [x] Restore with auto-save option + confirmation dialog {priority:medium}
- [x] Clear all products (confirmation) {priority:medium}
- [x] Cleanup old products (>7 days) {priority:low}

##### Settings Sidebar (right-sliding)
- [x] Auto-variants toggle {priority:low}
- [x] Clear all button {priority:medium}
- [x] Save & Refresh button {priority:medium}
- [x] Cart history management {priority:medium}
- [x] Logout button {priority:low}

##### Technical
- [x] Firebase Realtime sync (multi-device) {priority:high}
- [x] Campaign tagging {priority:medium}
- [x] Session management (token validation) {priority:medium}
- [x] localStorage cleanup on quota exceeded {priority:low}

---

### [SALES] Đơn Inbox {#don-inbox}
- **Module**: `don-inbox/` | **Status**: done | **Completion**: 85%
- **Dependencies**: inbox, orders-report
- **BP liên quan**: BP8 (Check IB - Bán ngoài live)

#### Features

##### Header
- [x] Create Order button {priority:high}
- [x] Bulk Tag Assignment button {priority:high}
- [x] Column Settings button {priority:medium}
- [x] Tag Panel Toggle button {priority:medium}

##### Filter & Search
- [x] Text search (name/phone/order ID) + clear {priority:high}
- [x] Date quick filters: All/Today/Yesterday/3N/7N/15N/Custom {priority:medium}
- [x] Status filter: All/Draft/Order/Processing/Completed/Cancelled {priority:high}
- [x] Source filter: All/Manual/Facebook Post/Instagram/TikTok {priority:medium}
- [x] TAG filter dropdown {priority:medium}
- [x] Result count + refresh button {priority:low}

##### Table (15 configurable columns)
- [x] Checkbox (multi-select) {priority:medium}
- [x] Actions (Edit/Delete/Link to Invoice) {priority:high}
- [x] STT, TAG (color-coded), Ghi chú {priority:medium}
- [x] Khách hàng, SĐT, Chat (link to social) {priority:high}
- [x] Sản phẩm, Bài Post, Địa chỉ {priority:medium}
- [x] Tổng, Ngày tạo, Phiếu bán hàng, Trạng thái {priority:high}

##### Right Sidebar - Tag Panel
- [x] Collapsible tag management panel {priority:medium}
- [x] Tag groups/categories {priority:medium}
- [x] Pin panel button {priority:low}
- [x] Manage tags button {priority:medium}
- [x] Tag filtering for bulk assignment {priority:medium}

##### Bulk Operations
- [x] Bulk delete {priority:medium}
- [x] Edit modal {priority:medium}
- [x] Selected count display {priority:low}

##### Technical
- [x] IndexedDB + localStorage for tag persistence {priority:medium}
- [x] Column visibility management {priority:low}
- [x] Keyboard shortcuts for navigation {priority:low}

---

### [SALES] Sổ Order NCC {#soorder}
- **Module**: `soorder/` | **Status**: done | **Completion**: 90%
- **Dependencies**: TPOS

#### Features

##### Tab 1: Sổ Order
- [x] Date navigation: Prev/Next day buttons, date picker {priority:high}
- [x] Date range selector: 7/15/30 days, Custom {priority:medium}
- [x] Quick date range buttons {priority:medium}
- [x] Unpaid filter checkbox {priority:medium}
- [x] Discrepancy filter checkbox {priority:medium}
- [x] NCC search filter (autocomplete dropdown) {priority:high}
- [x] Add order button (inline form: NCC, Thành tiền, Chênh lệch, Ghi chú) {priority:high}
- [x] Edit order modal {priority:high}
- [x] Delete with confirmation modal {priority:high}
- [x] Difference note modal {priority:medium}
- [x] Summary footer: Total amount + total discrepancy {priority:medium}
- [x] Holiday badge indicator {priority:low}
- [x] Holiday management modal with calendar {priority:low}
- [x] Holiday-specific fields: Người thực hiện, Reconciled checkbox {priority:low}
- [x] Keyboard navigation support {priority:low}

##### Tab 2: Trả Hàng
- [x] Returns ledger (same format as Sổ Order) {priority:high}

##### NCC Management
- [x] NCC management modal (list, add, fetch from TPOS) {priority:medium}
- [x] Supplier conflict resolution modal {priority:low}
- [x] NCC name sync with TPOS {priority:medium}

---

### [CUSTOMER] Inbox Chat {#inbox}
- **Module**: `inbox/` | **Status**: done | **Completion**: 95%
- **Dependencies**: Pancake API, WebSocket
- **BP liên quan**: BP8 (Check IB)

#### Features

##### Column 1: Danh sách hội thoại
- [x] Tìm kiếm hội thoại {priority:high}
- [x] Page selector dropdown (all pages) {priority:medium}
- [x] Filter tabs: All/Unread/Livestream/My conversations {priority:high}
- [x] Message type filter: INBOX (tin nhắn)/COMMENT (bình luận) {priority:medium}
- [x] Livestream post selector (fetch/clear) {priority:medium}

##### Column 2: Khu vực chat
- [x] Chat header: Avatar, name, notes, status {priority:high}
- [x] WebSocket status indicator (realtime) {priority:medium}
- [x] Actions: Mark unread, Toggle livestream, Open info panel {priority:medium}
- [x] Customer stats bar (phone, comments, orders) {priority:medium}
- [x] Post info banner (livestream thumbnail + title) {priority:medium}
- [x] Scroll-to-bottom button {priority:low}
- [x] Label bar (editable, resizable) {priority:medium}
- [x] Quick reply bar (2 rows pre-set responses) {priority:medium}
- [x] Reply preview bar {priority:low}
- [x] Reaction picker: 6 emoji (thumbsup/heart/laugh/wow/sad/angry) {priority:low}
- [x] Chat input: Send page selector, Reply type (public/private), Attach image/file/emoji {priority:high}
- [x] Emoji picker (categories + grid) {priority:low}
- [x] Image paste support (Ctrl+V) {priority:medium}

##### Column 3: Info Panel (Resizable)

**Tab Phân Nhóm**
- [x] Notes, Group cards, Manage groups {priority:medium}

**Tab Hoạt Động**
- [x] Transaction/interaction history {priority:medium}

**Tab Đơn Hàng** (Create order inline)
- [x] Customer info: Name, Phone, Address {priority:high}
- [x] Product list: Name, Variant, Qty, Price {priority:high}
- [x] Shipping: Fee, Discount, Payment (COD/Transfer/Partial) {priority:high}
- [x] Order summary: Subtotal, Ship, Discount, Total {priority:high}

##### Settings & Integration
- [x] Pancake Settings modal (Add accounts, JWT tokens, Page tokens) {priority:high}
- [x] Group management (Create/edit labels) {priority:medium}
- [x] Multi-account & multi-page support {priority:high}
- [x] Real-time WebSocket sync + polling fallback {priority:high}
- [x] 3-column resizable layout (drag handles) {priority:medium}

---

### [CUSTOMER] Customer Hub 360 {#customer-hub}
- **Module**: `customer-hub/` | **Status**: done | **Completion**: 85%
- **Dependencies**: TPOS, balance-history
- **BP liên quan**: BP4 (Check khách boom/cũ), BP7 (CSKH)

#### Features

##### Tab 1: Tìm kiếm khách hàng
- [x] Search by: Phone, Name, Email (realtime, Enter) {priority:high}
- [x] Pagination: 20 items/page {priority:medium}
- [x] Customer cards with status colors: Green (Bình thường), Red (Bom hàng), Orange (Cảnh báo), Dark red (Nguy hiểm), Indigo (VIP) {priority:high}
- [x] Card info: Name, Phone, Status badge, Wallet balance (real + virtual) {priority:high}
- [x] Click card → open profile modal {priority:high}

##### Tab 2: Hoạt động giao dịch

###### Filters
- [x] Search: ID, customer, amount {priority:high}
- [x] Type filter: All/ORDER_CREATED/CANCELLED/DEPOSIT/WITHDRAW/VIRTUAL_CREDIT/WALLET_REFUND/RETURN_SHIPPER/RETURN_CLIENT/BOOM/OTHER {priority:medium}
- [x] Date range: 7d/30d (default)/90d/All {priority:medium}
- [x] Apply Filters + Export CSV buttons {priority:medium}

###### Transaction Table (7 columns)
- [x] Thời gian (MM/DD/YYYY HH:mm) {priority:high}
- [x] Khách hàng (clickable link to profile) {priority:high}
- [x] Loại (Type icon + label) {priority:medium}
- [x] Mô tả (Description) {priority:medium}
- [x] Số tiền (color-coded +/-) {priority:high}
- [x] Trạng thái: Hoàn thành (green)/Chờ xử lý (yellow)/Thất bại (red)/Đang xử lý (blue) {priority:medium}
- [x] Actions (hover reveal) {priority:low}

###### Pagination
- [x] "Showing X to Y of Z results" + page buttons + Prev/Next {priority:medium}

##### Tab 3: Giao dịch chưa liên kết (badge count)

###### Filter
- [x] Search: amount, bank code, description {priority:high}
- [x] Date filter: All/7d/30d/90d {priority:medium}
- [x] Export CSV + Refresh buttons {priority:medium}

###### Bank Transaction Table
- [x] Ngày, Mã ngân hàng, Số tiền, Nội dung, Thao tác {priority:high}
- [x] "Liên kết" button per row {priority:high}

###### Link Transaction Modal
- [x] Transaction details (ID, Amount, Date, Description) {priority:high}
- [x] Customer phone input {priority:high}
- [x] Auto deposit checkbox ("Tự động nạp vào ví") {priority:medium}
- [x] Link + Cancel buttons {priority:high}

##### Customer Profile Modal

###### Profile Information
- [x] Full name, Phone, Email, Address {priority:high}
- [x] Customer since date {priority:medium}
- [x] Status (Bình thường/Bom hàng/VIP etc.) {priority:high}
- [x] Tags/categories {priority:medium}
- [x] Edit customer button {priority:medium}

###### Orders Section
- [x] Order table: ID, Date, Status badge, Items, Total, Actions (View/Cancel) {priority:high}
- [x] Order detail popup: items list, shipping, payment, notes {priority:medium}

###### Wallet Panel (right sidebar)
- [x] Total available balance (large green) {priority:high}
- [x] Real balance (tiền thật) {priority:high}
- [x] Virtual balance (công nợ ảo) {priority:high}
- [x] View history button {priority:medium}
- [x] Deposit button "Nạp tiền" {priority:high}
- [x] Withdraw button "Rút tiền" {priority:high}
- [x] Issue virtual credit button "Cấp công nợ ảo" {priority:medium}

###### Wallet Action Modal
- [x] Amount input (VNĐ) {priority:high}
- [x] Note/reason textarea {priority:medium}
- [x] Expiry days input (default 15, for virtual credit) {priority:medium}
- [x] Submit button {priority:high}

###### Transaction History Modal
- [x] List: Type label, Note/source, Date, Amount (green/red), Expiry, Created by {priority:medium}

###### Tickets Section
- [x] Recent tickets: ID, Subject, Status (Open/Pending/In progress/Resolved/Closed/Cancelled), Date {priority:medium}
- [x] Create ticket button "Tạo mới" {priority:medium}
- [x] View all link {priority:low}

##### Global
- [x] Theme toggle (dark/light) {priority:low}
- [x] Notifications button {priority:low}
- [x] Mobile responsive {priority:medium}

##### Permissions
- [x] customer-hub (page access) {priority:high}
- [x] viewActivities {priority:medium}
- [x] linkTransactions {priority:medium}
- [x] viewWallet / manageWallet {priority:medium}
- [x] viewTickets / createTicket {priority:medium}

---

### [RETURNS] Hàng Hoàn {#hanghoan}
- **Module**: `hanghoan/` | **Status**: done | **Completion**: 90%
- **Dependencies**: TPOS OData
- **BP liên quan**: BP7 (CSKH - Xử lý hoàn)

#### Features

##### Global Stats Cards
- [x] Tổng Đơn (blue) {priority:medium}
- [x] Chờ Nhận (orange) {priority:medium}
- [x] Đã Nhận (green) {priority:medium}
- [x] Tháng Này (purple) {priority:medium}

##### Tab 1: Trả Hàng
- [x] Sub-stats: Tổng đơn, Đã xác nhận, Nháp {priority:medium}
- [x] Import Excel, Refresh, Clear All buttons {priority:medium}
- [x] Search: Order ID, Customer, Phone, Invoice {priority:high}
- [x] Status filter: All/Confirmed/Draft {priority:medium}
- [x] Date range: All/Today/Week/Month/Custom {priority:medium}
- [x] Table: STT, Khách, Facebook, SĐT, Địa chỉ, Số, Reference, Ngày, Tổng, Còn lại, Status, Company {priority:high}
- [x] Create/Edit/Confirm/Delete return {priority:high}
- [x] Process refund {priority:high}
- [x] Return form: Customer info, Product, Qty, Reason, Condition, Refund amount, Date {priority:high}

##### Tab 2: Bán Hàng
- [x] Import Excel, Sync TPOS, Background sync indicator {priority:medium}
- [x] Pagination: 20/50/100/200/1000 rows {priority:medium}
- [x] Table 32 columns: customer, email, phone, address, sale date, amount, delivery, COD, weight, notes, seller, source, tags, discount... {priority:high}
- [x] Multi-company TPOS support {priority:medium}

##### Tab 3: Đối Soát (Reconciliation)
- [x] Filter: Date range, Invoice number, Shipping code {priority:high}
- [x] Table: Invoice #, Shipping Code, Staff, Date, Status, Content {priority:high}
- [x] Pagination: Prev/Next {priority:medium}
- [x] Submit/Review/Approve reconciliation {priority:medium}

##### Modals
- [x] Edit order (Delivery, Scenario, FB+Phone, Amount, Date, Reason) {priority:medium}
- [x] Return detail viewer (5 sub-tabs: Info, Receiver, Other, Images, History) {priority:medium}
- [x] Open in TPOS button {priority:low}

---

### [RETURNS] CSKH + Hàng Hoàn Bưu Cục {#issue-tracking}
- **Module**: `issue-tracking/` | **Status**: done | **Completion**: 90%
- **Dependencies**: hanghoan, TPOS
- **BP liên quan**: BP7 (CSKH - 4 bước)

#### Features
- [x] Stats: Chờ hàng, Chờ đối soát tiền, Hoàn tất hôm nay {priority:high}
- [x] 4 tabs: All / Chờ Hàng Về (badge) / Chờ Đối Soát Tiền (badge) / Hoàn Tất {priority:high}
- [x] Overdue Alert: "X tickets quá 20 ngày" {priority:medium}
- [x] Search: phone/order code + Ticket type filter {priority:high}
- [x] Guide Panel (dynamic, collapsible) {priority:low}

##### Ticket Types
- [x] BOOM (Không nhận hàng) {priority:high}
- [x] RETURN_SHIPPER (Shipper hoàn) {priority:high}
- [x] RETURN_CLIENT (Khách trả) {priority:high}
- [x] FIX_COD (Sửa COD) {priority:high}
- [x] OTHER (CSKH chung) {priority:medium}

##### Create Ticket (2 steps)
- [x] Step 1: Search original order (phone/order code) → Show customer + products + summary {priority:high}
- [x] Step 2: Dynamic fields per type {priority:high}
  - [x] FIX_COD: COD reduce amount, reason (wrong ship/debt/discount/partial/return) {priority:high}
  - [x] RETURN: Product checklist, tracking code, shipper name {priority:high}
  - [x] BOOM: Reason (boom/duplicate/address/other) {priority:high}

##### Reconcile Modal
- [x] Excel input, detailed comparison table {priority:medium}

---

### [FINANCE] Lịch Sử Biến Động Số Dư {#balance-history}
- **Module**: `balance-history/` | **Status**: done | **Completion**: 90%
- **Dependencies**: Sepay API (SSE)
- **BP liên quan**: BP2 (Check CK), BP4 (Check công nợ)

#### Features
- [x] Live Mode: Real-time tracking (SSE auto-refresh) {priority:high}
- [x] Balance History: Full transaction history {priority:high}
- [x] Verification: QR code matching, pending customer verification {priority:high}
- [x] Transfer Stats: Analysis tab {priority:medium}
- [x] Quick filters (Today/3D/7D/30D/Custom) {priority:medium}
- [x] Search: phone/customer name/transaction ID {priority:high}
- [x] Verification chips (Pending/Verified/Discrepancies) {priority:medium}
- [x] Phone data viewer with pagination {priority:medium}
- [x] Customer name fetch from TPOS {priority:medium}
- [x] Gap detection in transaction sequences {priority:low}
- [x] Cache: localStorage & IndexedDB {priority:medium}
- [x] Reprocess old transactions {priority:low}

---

### [FINANCE] Sổ Quỹ {#soquy}
- **Module**: `soquy/` | **Status**: done | **Completion**: 85%
- **Dependencies**: attendance-sync

#### Features

##### Tab 1: Nhân viên (Timesheet)

###### Bảng chấm công
- [x] Employee search input {priority:medium}
- [x] Timesheet grouping: "Theo tuần" {priority:medium}
- [x] Week navigation: Prev/Next + "Tuần X - Th. Y ZZZZ" {priority:medium}
- [x] Select button + "Duyệt chấm công" button {priority:high}
- [x] Timesheet grid: Shifts × 7 days (Mon-Sun) {priority:high}
- [x] Current day highlighted (blue) {priority:low}
- [x] Cell: Shift name, Check-in time (-- : -- if not checked), Status {priority:high}
- [x] Statuses: Chưa chấm công, Đi muộn, Về sớm, Đủ ca {priority:high}
- [x] Add/edit/delete shift actions {priority:medium}
- [x] Mark as full day (override) {priority:medium}

###### Approval
- [x] Approval modal (pending list, Approve/Reject per employee, comments) {priority:high}

###### Attendance Overview
- [x] Monthly/weekly view toggle {priority:medium}
- [x] Employee records: Name, Shifts assigned, Days present/absent, Salary, Overtime {priority:medium}

##### Tab 2: Sổ Quỹ (Cash Book)

###### Fund Type Selection (radio buttons)
- [x] Tiền mặt / Ngân hàng / Ví điện tử / Tổng quỹ {priority:high}

###### Time Filter
- [x] Tháng này/Tháng trước/Quý này/Năm nay/Tùy chỉnh {priority:medium}
- [x] Custom date range (From/To) {priority:medium}

###### Filter Panel (expandable)
- [x] Voucher type checkboxes: Phiếu thu, Phiếu chi CN, Phiếu chi KD {priority:medium}
- [x] Category filter dropdown {priority:medium}
  - Thu: Thu tiền khách, Thu hoàn NCC, Thu đối tác ship, Rút ngân hàng, Thu nhập khác, Thu nội bộ, Chuyển/Nạp
  - Chi CN: Chi CC CHỊ NHI, Chi CC A TRƯỜNG, Chi BB ĂN UỐNG, Chi BB TỪ THIỆN, Chi BB ĐI CHỢ, Chi DD XÂY/SỬA NHÀ, Chi phí khác, Chuyển/Rút
  - Chi KD: Chi NCC, Chi vận chuyển, Chi mặt bằng, Chi lương, Chi nội bộ, Chi phí khác, Chuyển/Rút
- [x] Status filter: Đã thanh toán / Đã hủy {priority:medium}
- [x] Creator/Person filter + Employee filter {priority:medium}
- [x] General search input {priority:medium}

###### Summary Statistics
- [x] Số dư đầu kỳ, Tổng thu, Tổng chi CN, Tổng chi KD, Tổng chi, Số dư cuối kỳ {priority:high}

###### Voucher Table (20 configurable columns)
- [x] Mã phiếu (TTM/TNH/TVD/CCN/CKD prefix) {priority:high}
- [x] Thời gian, Thời gian tạo, Người tạo, Nhân viên {priority:medium}
- [x] Chi nhánh, Nguồn, Loại thu chi, Tên TK, Số TK {priority:medium}
- [x] Mã người nộp/nhận, Tên, SĐT, Địa chỉ {priority:medium}
- [x] Giá trị (color-coded), Nội dung CK, Hình ảnh, Ghi chú {priority:high}
- [x] Loại sổ quỹ, Trạng thái {priority:medium}

###### Actions
- [x] Tạo phiếu thu / Tạo phiếu chi CN / Tạo phiếu chi KD buttons {priority:high}
- [x] Xuất file (Export Excel) {priority:medium}
- [x] Column visibility toggle {priority:low}
- [x] Row hover: Edit/View/Delete/Print {priority:high}
- [x] Pagination: 15/30/50/100 items + First/Prev/Next/Last {priority:medium}

###### Receipt/Payment Modal
- [x] DateTime picker {priority:high}
- [x] Category dropdown {priority:high}
- [x] Collector/Employee dropdown {priority:medium}
- [x] Amount input (VNĐ) {priority:high}
- [x] Note textarea {priority:medium}
- [x] Image upload (drag-drop, compression: desktop 1920px/0.7, mobile 1024px/0.5, max 15MB) {priority:medium}
- [x] Source field (dynamic dropdown + add new) {priority:medium}
- [x] Payer/Recipient info (type, name, phone, address, code) {priority:medium}
- [x] Account info for bank (name, number, transfer content, bank code) {priority:medium}
- [x] Save + Save & Print + Cancel buttons {priority:high}

###### Cancel/Void Modal
- [x] Voucher preview {priority:medium}
- [x] Reason dropdown: Sai số tiền/Sai người/Ghi nhầm/Khác {priority:medium}
- [x] Reason detail textarea {priority:medium}
- [x] Confirm cancel button {priority:medium}

##### Tab 3: Báo cáo

###### Report Types
- [x] Overview (general summary) {priority:medium}
- [x] Receipt (Thu) {priority:medium}
- [x] Payment CN (Chi CN) {priority:medium}
- [x] Payment KD (Chi KD) {priority:medium}

###### Reports Display
- [x] Summary cards: Total income, Total expense, Net balance, Trend comparison {priority:high}
- [x] Charts: Income/Expense pie, Monthly trend line, Category breakdown bar {priority:medium}
- [x] Category breakdown: Name, Total, %, Count, Average {priority:medium}
- [x] Export: PDF, Excel, Email {priority:medium}

##### Tab 4: Lịch sử chỉnh sửa
- [x] Filter: Entity type, Date range, Editor, Action type (Create/Update/Delete/Restore), Search {priority:medium}
- [x] Table: Thời gian, Người chỉnh sửa, Loại, Đối tượng, Chi tiết, Hành động {priority:medium}
- [x] Detail modal: Old vs New values, changed fields highlighted, restore button {priority:medium}

##### Technical
- [x] Hash-based tab restoration {priority:low}
- [x] Excel import (SheetJS) {priority:medium}
- [x] Print voucher/batch {priority:medium}

---

### [FINANCE] Công Nợ NCC {#supplier-debt}
- **Module**: `supplier-debt/` | **Status**: done | **Completion**: 85%
- **Dependencies**: TPOS OData API

#### Features
- [x] Date range filtering (dd/mm/yyyy) {priority:high}
- [x] Display mode: All / Chỉ nợ cuối kỳ ≠ 0 {priority:medium}
- [x] NCC search (searchable autocomplete) {priority:high}
- [x] Action buttons: Search, Export Excel, Create Supplier, Column Visibility Toggle {priority:medium}
- [x] Table: Mã NCC, Tên NCC, Phát sinh, Thanh toán, Nợ cuối kỳ + Footer tổng {priority:high}
- [x] Column visibility toggle (Mã/Tên/Nợ/Có/Cuối kỳ) {priority:low}
- [x] Pagination (First/Prev/Next/Last) {priority:medium}
- [x] Firebase notes storage per transaction {priority:medium}
- [x] Permission-based (editNoteBill, editNotePayment) {priority:medium}

---

### [FINANCE] So Sánh Đơn Hàng (OCR + AI) {#invoice-compare}
- **Module**: `invoice-compare/` | **Status**: done | **Completion**: 80%
- **Dependencies**: TPOS, Tesseract.js, DeepSeek AI

#### Features

##### Input Section (2 columns)
- [x] Left: TPOS URL input + clear button {priority:high}
- [x] Right: Image upload (drag-drop, paste Ctrl+V, file picker) {priority:high}
- [x] Image gallery (uploaded images) {priority:medium}

##### AI Analysis
- [x] "Phân Tích Với AI" button {priority:high}
- [x] Progress steps: OCR → Analysis → Complete {priority:medium}
- [x] Progress bar + percentage + loading spinner {priority:medium}
- [x] OCR Preview (extracted text, char count, processing time) {priority:medium}

##### Results
- [x] Invoice Number, NCC, Total Amount, Total SL {priority:high}
- [x] Product list (code, name, qty, unit price, total) {priority:high}
- [x] Product code mapping table (handwritten → JSON) {priority:medium}
- [x] Standard prices reference {priority:low}

##### Technical
- [x] Tesseract.js OCR (browser-based) {priority:high}
- [x] DeepSeek AI analysis {priority:high}
- [x] Google Vision API (via Render proxy) {priority:medium}
- [x] Cloudflare proxy for API calls {priority:medium}

---

### [INTEGRATION] TPOS - Pancake {#tpos-pancake}
- **Module**: `tpos-pancake/` | **Status**: done | **Completion**: 80%
- **Dependencies**: TPOS API, Pancake API

#### Features
- [x] Dual-column layout: TPOS chat + Pancake chat {priority:high}
- [x] Resizable column divider (drag) {priority:medium}
- [x] Full-screen mode per column {priority:medium}
- [x] Column order configuration (Select Column 1/2) {priority:medium}
- [x] Server Mode Indicator (Pancake/TPOS - clickable) {priority:medium}
- [x] TPOS Settings modal (token, account config) {priority:high}
- [x] Pancake Settings modal (api key, credentials) {priority:high}
- [x] Column order persistence {priority:low}

---

### [ADMIN] Quản Lý Tài Khoản {#user-management}
- **Module**: `user-management/` | **Status**: done | **Completion**: 95%
- **Dependencies**: Firebase Auth, bcrypt.js

#### Features

##### Tab 1: Quản Lý Users
- [x] Load users + Export Excel {priority:high}
- [x] User list (cards view: avatar, edit/delete) {priority:high}
- [x] Firebase Status display {priority:low}
- [x] Edit User form: Username (readonly), Display Name, Identifier Name, Role dropdown, Password (encrypted), Type, Detailed Permissions {priority:high}

##### Tab 2: Tạo Mới
- [x] Create new user form (full) {priority:high}

##### Tab 3: Quyền Truy Cập
- [x] Detailed permission config UI per module {priority:high}
- [x] Page-level permissions (view/create/edit/delete) {priority:high}
- [x] Permission migration tools {priority:medium}
- [x] Admin full-permissions migration {priority:medium}
- [x] Permission registry overview {priority:medium}

##### Tab 4: Giải Mã
- [x] Decode/decrypt password tool {priority:low}

##### Tab 5: Đổi Tên Menu
- [x] Custom menu name mapping {priority:low}

##### Tab 6: Quản Lý Templates
- [x] Permission templates for roles {priority:medium}

##### Technical
- [x] Bcrypt.js + Crypto-JS encryption {priority:high}
- [x] User avatar upload {priority:low}
- [x] Permission caching {priority:medium}

---

### [ADMIN] Lịch Sử Chỉnh Sửa {#lichsuchinhsua}
- **Module**: `lichsuchinhsua/` | **Status**: done | **Completion**: 85%
- **Dependencies**: All modules (centralized audit)

#### Features
- [x] Dashboard stats: Tổng hoạt động, Hôm nay, Users hoạt động, Của bạn {priority:medium}
- [x] Filter: Module, Action type (Create/Update/Delete), Performer, Approver, Date range, Keyword {priority:high}
- [x] Table: STT, Thời gian, Người thực hiện, Module, Loại thao tác, Mô tả, Người duyệt {priority:high}
- [x] Detail modal: Old vs New (highlighted), Approval info {priority:medium}
- [x] User activity tracking {priority:medium}
- [x] Empty state + loading overlay {priority:low}

---

### [ADMIN] Quy Trình Nghiệp Vụ {#quy-trinh}
- **Module**: `quy-trinh/` | **Status**: done | **Completion**: 90%
- **Dependencies**: none

#### Features
- [x] Fixed header (purple gradient) + sidebar navigation {priority:medium}
- [x] 9 sections (BP1-BP8 + Quản lý kho) {priority:high}
- [x] Section structure: Colored header → Steps → Personnel diagram → Decision flowchart {priority:high}
- [x] Callout boxes: Warning, Danger, Tip, Info {priority:medium}
- [x] Interactive note system (double-click to add, saved to Firestore) {priority:medium}
- [x] Image upload for notes (via Cloudflare Worker) {priority:low}
- [x] Smooth scroll navigation {priority:low}
- [x] Color-coded sections (9 colors) {priority:low}
- [x] Mobile responsive sidebar {priority:medium}

---

### [SYSTEM] Chấm Công {#attendance-sync}
- **Module**: `attendance-sync/` (Node.js backend, KHÔNG phải web module)
- **Status**: done | **Completion**: 90%

#### Features
- [x] ZK device protocol (TCP/UDP, IP: 192.168.1.201:4370) {priority:high}
- [x] Auto-sync every 5 minutes {priority:high}
- [x] Auto-reconnection (3 retries, 5s delay) {priority:medium}
- [x] Sync users + attendance to Firestore {priority:high}
- [x] Command-based triggers (sync_now) {priority:medium}
- [x] Logging (logs/YYYY-MM-DD.log) {priority:medium}
- [x] UTC → GMT+7 conversion {priority:medium}
- [x] Firebase status updates {priority:medium}

---

### [SYSTEM] Cloudflare Worker {#cloudflare-worker}
- **Module**: `cloudflare-worker/` | **Status**: done | **Completion**: 90%

#### Features
- [x] CORS proxy cho TPOS/Pancake APIs {priority:high}
- [x] Server-side data persistence (groups, labels, livestream) {priority:high}
- [x] Pending customer tracking {priority:medium}
- [x] Image upload handling {priority:medium}

---

### [SYSTEM] Firebase Functions {#firebase-functions}
- **Module**: `firebase-functions/` | **Status**: done | **Completion**: 80%

#### Features
- [x] Scheduled jobs {priority:high}
- [x] Background processing {priority:medium}
- [x] Real-time event handlers {priority:medium}

---

### [SYSTEM] Shared Library {#shared}
- **Module**: `shared/` | **Status**: done | **Completion**: 95%

#### Core Utilities
- [x] firebase-config.js - Single source Firebase config {priority:high}
- [x] shared-auth-manager.js - Auth (credentials, sessions) {priority:high}
- [x] permissions-helper.js - canAccessPage, hasPermission, enforcePageAccess, applyUIRestrictions {priority:high}
- [x] navigation-modern.js - Unified PC+mobile sidebar (5858 lines), drag-drop groups, multi-shop {priority:high}
- [x] base-store.js - State management (Firebase + localStorage sync, real-time listeners, auto-cleanup) {priority:high}
- [x] notification-system.js - Toast/dialog notifications {priority:medium}
- [x] common-utils.js - Utility functions {priority:medium}
- [x] api-service.js - Centralized API calls {priority:high}
- [x] pancake-data-manager.js - Pancake integration {priority:medium}
- [x] audit-logger - Change logging across modules {priority:medium}

#### Infrastructure
- [x] Service Worker PWA (3 strategies: stale-while-revalidate, network-first, cache-first) {priority:high}
- [x] CI/CD: GitHub Actions (ci.yml lint→test→build, deploy.yml auto-deploy Firebase + Cloudflare) {priority:high}
- [x] Vite multi-page build (auto-detect modules) {priority:high}
- [x] Vitest + fast-check testing (≥60% coverage target) {priority:medium}
- [x] ESLint + Prettier {priority:medium}

---

## Kế Hoạch Phát Triển

### Phase: Project Tracker {#plan-tracker}
- **Status**: in-progress | **Target**: 2026-04-01

#### Goal: Module skeleton + tích hợp {#goal-skeleton}
- [✓] Tạo project-tracker/index.html <!-- auto:claude-code:2026-03-18 -->
- [✓] Tạo css/style.css + js/app.js (4 tab routing) <!-- auto:claude-code:2026-03-19 -->
- [✓] Thêm MENU_CONFIG + PAGES_REGISTRY entry <!-- auto:claude-code:2026-03-18 -->

#### Goal: Data layer + MD {#goal-data}
- [✓] Tạo js/stores/project-store.js <!-- auto:claude-code:2026-03-18 -->
- [✓] Tạo js/utils/md-parser.js + md-serializer.js <!-- auto:claude-code:2026-03-18 -->
- [✓] Tạo docs/PROJECT-TRACKER.md (file này) <!-- auto:claude-code:2026-03-18 -->
- [✓] Nút "Đồng bộ từ MD" + "Xuất ra MD" <!-- auto:claude-code:2026-03-19 -->

#### Goal: Dashboard {#goal-dashboard}
- [✓] Summary cards + progress bars <!-- auto:claude-code:2026-03-19 -->
- [✓] Per-module status list (click to jump to Feature Catalog) <!-- auto:claude-code:2026-03-19 -->

#### Goal: Feature Catalog {#goal-catalog}
- [✓] Bảng phân cấp expand/collapse <!-- auto:claude-code:2026-03-19 -->
- [✓] Filter bar (module, status, search) + inline status editing <!-- auto:claude-code:2026-03-19 -->

#### Goal: Todo System {#goal-todo}
- [✓] Plan/Goal/Task accordion <!-- auto:claude-code:2026-03-19 -->
- [✓] Checkbox manual + auto-check display (click to cycle status) <!-- auto:claude-code:2026-03-19 -->
- [~] CRUD inline + due date handling

#### Goal: Module Map {#goal-map}
- [✓] Category grid with progress bars + dependencies <!-- auto:claude-code:2026-03-19 -->
- [~] Click-to-navigate (module → feature catalog)

#### Goal: Polish {#goal-polish}
- [~] Responsive mobile
- [ ] Permission checks trên CRUD
