<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# N2Store Purchase Orders — Kiến Trúc Module

> **Ngày cập nhật**: 2026-04-13

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Stack & Dependencies](#2-stack--dependencies)
3. [File Structure](#3-file-structure)
4. [Core Modules](#4-core-modules)
5. [Tab Modules](#5-tab-modules)
6. [Library Modules](#6-library-modules)
7. [Data Flows](#7-data-flows)
8. [Window Exports](#8-window-exports)
9. [Backend API](#9-backend-api)
10. [TPOS Integration](#10-tpos-integration)

---

## 1. Tổng quan

**Purchase Orders** là module quản lý đơn đặt hàng từ nhà cung cấp (NCC), chạy tại:

- **Live**: `https://nhijudyshop.github.io/n2store/purchase-orders/index.html`
- **Backend**: `https://n2store-fallback.onrender.com/api/v2/purchase-orders`

### Kiến trúc

```
Browser (Vanilla JS + MVC pattern)
    ↓ REST API
PostgreSQL (Render) — Data chính
    +
Firebase Storage — Hình ảnh
    +
TPOS OData API — Sync sản phẩm, lịch sử mua
    (qua Cloudflare Worker proxy)
```

### Trạng thái đơn hàng

```
DRAFT → AWAITING_PURCHASE → AWAITING_DELIVERY → RECEIVED → COMPLETED
  ↓              ↓                 ↓
CANCELLED    CANCELLED         CANCELLED
  ↓
DELETED (soft delete, 7 ngày auto cleanup)
```

---

## 2. Stack & Dependencies

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript (ES5+), no framework |
| UI | Custom CSS (modular), Lucide Icons |
| Backend | Express.js on Render.com |
| Database | PostgreSQL (Render) |
| Storage | Firebase Storage (images) |
| Real-time | Firebase Firestore (notes tab, sync status) |
| TPOS Proxy | Cloudflare Worker |
| Export | SheetJS (XLSX) |
| Barcode | JsBarcode |

### External CDN

- Firebase SDK 10.14.1
- Lucide 0.294.0
- XLSX 0.18.5
- JsBarcode 3.11.6

---

## 3. File Structure

```
purchase-orders/
├── index.html                    # Entry point
├── css/
│   ├── variables.css             # CSS custom properties
│   ├── base.css                  # Reset, typography
│   ├── layout.css                # Grid, flexbox layouts
│   ├── buttons.css               # Button styles
│   ├── cards.css                 # Summary cards
│   ├── tabs.css                  # Tab navigation
│   ├── filters.css               # Filter bar
│   ├── table.css                 # Data table
│   ├── states.css                # Loading, empty, error states
│   ├── pagination.css            # Pagination
│   ├── toast.css                 # Toast notifications
│   ├── modal.css                 # Modal dialogs
│   ├── form.css                  # Form inputs
│   └── responsive.css            # Media queries
├── js/
│   ├── config.js                 # Constants, helpers, config
│   ├── validation.js             # Validation rules & exceptions
│   ├── service.js                # REST API service layer
│   ├── data-manager.js           # State management, caching, events
│   ├── ui-components.js          # UI rendering (cards, tabs, filters)
│   ├── table-renderer.js         # Table rendering, sync polling
│   ├── form-modal.js             # Create/edit order modal (~3200 lines)
│   ├── dialogs.js                # Specialized dialogs (~3100 lines)
│   ├── history-tab.js            # TPOS invoice history
│   ├── refund-tab.js             # TPOS refund list
│   ├── products-tab.js           # TPOS product catalog
│   ├── notes-tab.js              # Consignment notes (Firestore)
│   └── lib/
│       ├── tpos-search.js        # TPOS OAuth + authenticated fetch
│       ├── tpos-purchase.js      # TPOS purchase order creation
│       ├── tpos-product-creator.js # Fire-and-forget product sync
│       ├── ncc-manager.js        # Supplier autocomplete (Firebase)
│       ├── product-code-generator.js # Auto code generation
│       ├── supplier-detector.js  # Parse supplier from product name
│       ├── variant-utils.js      # Variant matching
│       ├── image-utils.js        # Image compression
│       ├── barcode-label-dialog.js # Barcode printing
│       └── shop-config.js        # Shop configuration
├── docs/                         # Documentation (this directory)
├── goods-receiving/              # Sub-module: nhận hàng
└── *.csv                         # Attribute data for variant generation
```

### Load Order (quan trọng)

```html
1. shared/esm/compat.js          (auth, firebase config)
2. shared/js/navigation-modern.js
3. shared/js/firebase-config.js
4. config.js
5. validation.js
6. lib/shop-config.js → lib/variant-utils.js → ... (all libs)
7. service.js
8. data-manager.js
9. ui-components.js
10. table-renderer.js
11. form-modal.js
12. dialogs.js
13. history-tab.js → refund-tab.js → products-tab.js → notes-tab.js
14. main.js                       (initializes everything)
```

---

## 4. Core Modules

### config.js — `window.PurchaseOrderConfig`

| Export | Type | Mô tả |
|--------|------|-------|
| OrderStatus | Object | Enum trạng thái |
| STATUS_LABELS | Object | Label tiếng Việt |
| STATUS_COLORS | Object | Màu badge |
| ALLOWED_TRANSITIONS | Object | Ma trận chuyển trạng thái |
| TAB_CONFIG | Array | Config 8 tabs |
| QUICK_FILTERS | Array | Bộ lọc nhanh (hôm nay, 7 ngày...) |
| formatVND() | Function | Format tiền VNĐ |
| formatDate() | Function | Format dd/mm/yyyy |
| canTransition() | Function | Kiểm tra chuyển trạng thái |

### service.js — `window.purchaseOrderService`

REST API client, giao tiếp với PostgreSQL backend.

| Method | API | Mô tả |
|--------|-----|-------|
| createOrder() | POST / | Tạo đơn hàng |
| getOrdersByStatus() | GET /?status=... | Danh sách theo trạng thái |
| getOrderById() | GET /:id | Chi tiết đơn |
| updateOrder() | PUT /:id | Cập nhật |
| updateOrderStatus() | PATCH /:id/status | Chuyển trạng thái |
| deleteOrder() | DELETE /:id | Xóa mềm |
| restoreOrder() | POST /:id/restore | Khôi phục |
| getStatsAndCounts() | GET /stats | Thống kê + đếm |
| uploadImage() | Firebase Storage | Upload hình |

### data-manager.js — `window.purchaseOrderDataManager`

State management với pub/sub pattern.

**Events emitted:**
- `ordersChange` — Danh sách thay đổi
- `statsChange` — Thống kê thay đổi
- `statusCountsChange` — Đếm trạng thái (badge tabs)
- `loadingChange` — Loading state
- `selectionChange` — Chọn nhiều đơn
- `pageChange` — Chuyển trang

### ui-components.js — `window.purchaseOrderUI`

Render UI components: summary cards, tabs, filter bar, pagination, toast.

### table-renderer.js — `window.purchaseOrderTableRenderer`

Render bảng dữ liệu với row spanning, sync status polling (3s), bulk actions.

### form-modal.js — `window.purchaseOrderFormModal`

Modal tạo/sửa đơn hàng: multi-section form, dynamic items, image upload, TPOS product lookup.

### dialogs.js

| Class | Mô tả |
|-------|-------|
| OrderDetailDialog | Xem chi tiết đơn |
| VariantGeneratorDialog | Tạo variants từ attribute selection |
| SettingsDialog | Cấu hình mã SP, shipping |
| InventoryPickerDialog | Chọn SP từ TPOS catalog |
| ShippingFeeDialog | Nhập phí ship |

---

## 5. Tab Modules

| Tab | Module | Data Source | Key Features |
|-----|--------|-------------|-------------|
| Nháp | Core (DataManager) | PostgreSQL | CRUD, bulk actions |
| Chờ mua | Core | PostgreSQL | TPOS sync trigger |
| Chờ hàng | Core | PostgreSQL | Tracking delivery |
| Lịch sử | `PurchaseOrderHistory` | TPOS OData | Real-time done status (Firestore) |
| Trả hàng NCC | `PurchaseOrderRefunds` | TPOS OData | Date/status/NCC filter |
| Kho SP | `PurchaseOrderProducts` | TPOS OData | Search, variant expansion |
| Hàng bán dùm | `PurchaseOrderNotes` | Firestore | 15-day countdown, auto-delete |
| Thùng rác | Core | PostgreSQL | Restore, permanent delete |

---

## 6. Library Modules

| Module | Window Export | Mô tả |
|--------|-------------|-------|
| tpos-search.js | `TPOSClient` | OAuth token management, per-company caching |
| tpos-purchase.js | `TPOSPurchase` | Create purchase order on TPOS |
| tpos-product-creator.js | `TPOSProductCreator` | Fire-and-forget product sync |
| ncc-manager.js | `NCCManager` | Supplier autocomplete (Firebase) |
| product-code-generator.js | `ProductCodeGenerator` | Auto code from name prefix |
| supplier-detector.js | `SupplierDetector` | Parse supplier from product name |
| variant-utils.js | `VariantUtils` | Variant matching (case-insensitive) |
| image-utils.js | `ImageUtils` | Image compression before upload |
| barcode-label-dialog.js | `BarcodeLabelDialog` | Print barcode shipping labels |
| shop-config.js | `ShopConfig` | Shop config wrapper |

---

## 7. Data Flows

### Create Order

```
User fills form → FormModal.submit()
  → uploadPendingImages() → Firebase Storage
  → service.createOrder() → REST POST
  → PostgreSQL INSERT
  → dataManager.refresh() → emit 'orderCreated'
  → TPOSProductCreator.syncOrderToTPOS() [async, non-blocking]
      ├ loadAttributeData() from CSV
      ├ buildPayload() for TPOS API
      ├ POST to TPOS ProductTemplate
      └ updateSyncStatus()
```

### Load Orders

```
dataManager.loadOrders(status)
  → service.getOrdersByStatus(status, filters)
  → REST GET with pagination
  → emit 'ordersChange'
  → tableRenderer.render(orders)
```

### Tab Switch

```
main.handleTabChange(tabId)
  → destroy current tab
  → init new tab
  → Nháp/Chờ mua/Chờ hàng/Thùng rác: dataManager.loadOrders()
  → Lịch sử: PurchaseOrderHistory.init()
  → Trả hàng: PurchaseOrderRefunds.init()
  → Kho SP: PurchaseOrderProducts.init()
  → Hàng bán dùm: PurchaseOrderNotes.init()
```

---

## 8. Window Exports

```javascript
// Core
window.PurchaseOrderConfig        // Constants, helpers
window.PurchaseOrderValidation    // Validation
window.purchaseOrderService       // REST API
window.purchaseOrderDataManager   // State
window.purchaseOrderUI            // UI components
window.purchaseOrderTableRenderer // Table
window.purchaseOrderFormModal     // Form modal
window.PurchaseOrderController    // Main controller

// Tabs
window.PurchaseOrderHistory       // {init, destroy, reload}
window.PurchaseOrderRefunds       // {init, destroy, reload}
window.PurchaseOrderProducts      // {init, destroy, reload}
window.PurchaseOrderNotes         // {init, destroy, reload, addItem, ...}

// Libs
window.TPOSClient                 // TPOS OAuth
window.TPOSProductCreator         // TPOS sync
window.TPOSPurchase               // TPOS purchase
window.NCCManager                 // Suppliers
window.ProductCodeGenerator       // Code gen
window.SupplierDetector           // Parse supplier
window.VariantUtils               // Variant matching
window.ImageUtils                 // Image compression
window.BarcodeLabelDialog         // Barcode print
window.ShopConfig                 // Shop config
```

---

## 9. Backend API

**Base URL**: `https://n2store-fallback.onrender.com/api/v2/purchase-orders`

| Method | Path | Mô tả |
|--------|------|-------|
| GET | / | List with status, pagination, search, date range |
| GET | /stats | Stats + status counts |
| GET | /:id | Single order |
| POST | / | Create order |
| PUT | /:id | Update order |
| PATCH | /:id/status | Change status |
| DELETE | /:id | Soft delete |
| POST | /:id/restore | Restore from trash |
| DELETE | /:id/permanent | Hard delete |
| POST | /:id/copy | Copy as new draft |
| POST | /generate-number | Next order number |
| POST | /cleanup-trash | Auto-cleanup (7 days) |

**Database**: PostgreSQL table `purchase_orders` with JSONB `items` and `status_history`.

---

## 10. TPOS Integration

### Qua Cloudflare Worker Proxy

```
Browser → https://n2store-proxy.nhijudy.workers.dev/tpos/*
  → https://tomato.tpos.vn/odata/*
```

### Token Management

`TPOSClient` quản lý OAuth token:
- Per-company token caching (localStorage)
- Auto-refresh khi hết hạn
- Company switch support (CompanyId 1 = NJD Live, 2 = NJD Shop)

### Integration Points

| Feature | File | TPOS API |
|---------|------|----------|
| Product lookup | form-modal.js | `OnChangeProduct` |
| Product sync | tpos-product-creator.js | `POST ProductTemplate` |
| Purchase order | tpos-purchase.js | `POST FastPurchaseOrder` + `ActionConfirm` |
| Invoice history | history-tab.js | `GetView?Type=invoice` |
| Refund list | refund-tab.js | `GetView?Type=refund` |
| Product catalog | products-tab.js | `ProductTemplate` OData |
| Supplier data | ncc-manager.js | `Partner` OData |
