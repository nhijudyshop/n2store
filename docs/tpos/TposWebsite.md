<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# TPOS Website — Phân Tích Toàn Diện

> **Nguồn dữ liệu**: Phân tích trực tiếp từ source code website `https://tomato.tpos.vn/` (version 6.4.5.2) + cross-reference với existing documentation.
>
> **Ngày phân tích**: 2026-04-12

---

## Mục lục — Quick Navigation

> **Cách dùng:** Ctrl+F tìm keyword, hoặc click link nhảy đến section. Số dòng (L:xxx) để tham chiếu nhanh.

### 0. N2Store Integration (thông tin triển khai thực tế)

| Section | Keyword tìm nhanh | Nội dung |
|---|---|---|
| [0.1 Architecture](#01-n2store--tpos-architecture) | proxy, CORS, worker | Sơ đồ Browser → CF Worker → TPOS, tại sao cần proxy |
| [0.2 Proxy Rules](#02-proxy-rules-cloudflare-worker) | retry, timeout, route | GET retry 3x/15s, POST no-retry/60s, full route mapping |
| [0.3 Multi-Company Token](#03-multi-company-token-system-chi-tiết) | company, token, refresh | NJD Live vs NJD Shop, localStorage/Firestore keys, refresh flow |
| [0.4 Per-User Credentials](#04-per-user-tpos-credentials-postgresql) | user, credential, nvkt | Bảng tpos_credentials, mapping app user → TPOS username |
| [0.5 Database Tables](#05-database-tables-n2store--tpos) | database, table, postgres | 10 tables: tpos_credentials, invoice_status, social_orders... |
| [0.6 Purchase Config](#06-per-company-purchase-config) | JournalId, AccountId, WarehouseId | Config khác nhau giữa Company 1 vs 2 |
| [0.7 API Payloads](#07-detailed-api-payloads) | payload, JSON, body | Exact JSON cho Purchase, Payment, Partner, Refund 5-step |
| [0.8 Real-time Details](#08-real-time-event-details-từ-capture-2026-04-05) | event, message, capture | 310 events, MessageType 11/12, ChannelId, browser dispatch code |
| [0.9 Implementation Files](#09-n2store-key-implementation-files) | file, path, source | 14 key files: tpos-client.js, worker.js, token-manager.js... |

### 1–3. Nền tảng TPOS

| Section | Keyword tìm nhanh | Nội dung |
|---|---|---|
| [1. Tổng quan](#1-tổng-quan) | version, URL, CDN | TPOS v6.4.5.2, 6 JS bundles (2.9MB), SPA AngularJS |
| [2. Tech Stack](#2-tech-stack--kiến-trúc) | AngularJS, Kendo, jQuery | Frontend stack, modules, dynamic route loading |
| [3. Auth & Authorization](#3-authentication--authorization) | login, token, 2FA, permission | Login flow, headers, multi-company, TOTP, role-based access |

### 4. Modules & Chức năng (theo menu TPOS)

| Section | URL TPOS | Controllers | Nội dung chính |
|---|---|---|---|
| [4.1 Dashboard](#41-dashboard-appdashboard) | `#/app/dashboard` | 1 | Biểu đồ, thống kê |
| [4.2 POS](#42-điểm-bán-hàng-pos--20-controllers) | `#/app/posconfig/*` | 20 | Session, order tại quầy, restaurant |
| [4.3 Bán hàng](#43-bán-hàng-sales--55-controllers) | `#/app/fastsaleorder/*` | 55+ | FastSaleOrder, delivery, cross-check, refund, import Excel |
| [4.4 Hóa đơn ĐT](#44-hóa-đơn-điện-tử-e-invoice--11-controllers) | `#/app/wiinvoice/*` | 11 | E-invoice create/adjust/replace |
| [4.5 Báo giá & ĐĐH](#45-báo-giá--đơn-đặt-hàng--27-controllers) | `#/app/salequotation/*` | 27 | Quotation, Sale Order |
| [4.6 Sale Online](#46-sale-online--40-controllers) | `#/app/saleOnline/*` | 40+ | Live campaign, Facebook, inbox, comment → order |
| [4.7 Kênh bán](#47-kênh-bán-hàng-sale-channels--6-controllers) | `#/app/salechannel/*` | 6 | Facebook Pages, Lazada, Shopee |
| [4.8 Mua hàng](#48-mua-hàng-purchase--8-controllers) | `#/app/fastpurchaseorder/*` | 8 | Purchase order, Excel import, refund |
| [4.9 Kho hàng](#49-kho-hàng-inventory--40-controllers) | `#/app/stock*` | 40+ | Picking, inventory, move, warehouse, FIFO vacuum |
| [4.10 Kế toán](#410-kế-toán-accounting--55-controllers) | `#/app/account*` | 55 | Payment, journal, tax, deposit, phiếu thu/chi, sổ quỹ |
| [4.11 Danh mục](#411-danh-mục-categories--80-controllers) | `#/app/partner/*`, `product/*` | 80+ | KH/NCC, sản phẩm, thuộc tính, UOM, barcode, promotion, loyalty |
| [4.12 Báo cáo](#412-báo-cáo-reports--35-controllers) | `#/app/report/*` | 35+ | Doanh thu, công nợ, kho, giao hàng, audit log |
| [4.13 Cấu hình](#413-cấu-hình-settings--40-controllers) | `#/app/configs/*` | 40+ | User, role, 2FA, company, mail, printer, VNPay |

### 5–12. Kỹ thuật & Tham chiếu

| Section | Keyword tìm nhanh | Nội dung |
|---|---|---|
| [5. API Architecture](#5-api-architecture) | OData, endpoint, filter | 31 OData actions, 80+ REST APIs, query patterns |
| [6. Real-time](#6-real-time-features) | Socket.IO, SignalR, event | rt-2.tpos.app, sr.tpos.vn, 5 event types |
| [7. Data Models](#7-data-models-odata-entities) | entity, model, schema | 107 OData entities grouped by domain |
| [8. Services](#8-services--factories) | factory, service, cache | 138 factories, IndexedDB product cache, printing |
| [9. Directives](#9-ui-components-directives) | directive, component, UI | 36 directives: barcode scanner, pagination, lazy img... |
| [10. Utilities](#10-utility-functions) | util, helper, validate | String (bỏ dấu), Array extensions, Date, number format |
| [11. Integrations](#11-integrations) | Facebook, Lazada, VNPay | 11 integrations: FB, Lazada, Shopee, VNPay, GHN, DHL, Zalo... |
| [12. localStorage](#12-localstorage-keys) | localStorage, storage, key | accessToken, routes, navs, product cache keys |
| [Tổng kết](#tổng-kết) | summary, tổng | 419 controllers, 107 entities, 138 services |

### Tìm nhanh theo nhu cầu

| Bạn cần... | Đến section |
|---|---|
| Gọi API tạo đơn mua hàng | [0.7 API Payloads → Create Purchase Order](#07-detailed-api-payloads) |
| Biết cách auth/login TPOS | [3.1 Login Flow](#31-login-flow) |
| Xem đơn bán hàng gọi API gì | [4.3 Bán hàng](#43-bán-hàng-sales--55-controllers) + [5.2 OData Actions](#52-odata-action-methods-31-methods-found) |
| Setup real-time WebSocket | [6.1 Socket.IO](#61-socketio-primary) + [0.8 Real-time Details](#08-real-time-event-details-từ-capture-2026-04-05) |
| Tìm entity/model nào có sẵn | [7. Data Models](#7-data-models-odata-entities) |
| Biết TPOS dùng framework gì | [2. Tech Stack](#2-tech-stack--kiến-trúc) |
| Tích hợp Facebook / Lazada | [11. Integrations](#11-integrations) |
| Token multi-company hoạt động sao | [0.3 Multi-Company Token](#03-multi-company-token-system-chi-tiết) |
| File nào trong N2Store xử lý TPOS | [0.9 Implementation Files](#09-n2store-key-implementation-files) |
| Hoàn trả đơn hàng (refund flow) | [0.7 → Sale Refund 5-Step](#07-detailed-api-payloads) |
| Database tables liên quan TPOS | [0.5 Database Tables](#05-database-tables-n2store--tpos) |

---

## 0. Bổ sung từ N2Store Integration Docs

> Thông tin dưới đây được cross-reference từ `docs/TPOS-INTEGRATION.md`, `docs/TPOS-REALTIME-EVENTS-ANALYSIS.md`, `docs/architecture/SHARED_TPOS.md` — chứa chi tiết triển khai N2Store chưa có trong phân tích source code TPOS.

### 0.1 N2Store ↔ TPOS Architecture

```
Browser ──→ Cloudflare Worker (CORS proxy) ──→ TPOS API (tomato.tpos.vn)
               ↕                                    ↕
          Render Server (fallback)           WebSocket (rt-2.tpos.app)
               ↕
          PostgreSQL + Firebase
```

**QUAN TRỌNG**: Tất cả TPOS API calls từ browser **PHẢI** đi qua Cloudflare Worker proxy (`https://chatomni-proxy.nhijudyshop.workers.dev`) để bypass CORS.

### 0.2 Proxy Rules (Cloudflare Worker)

| HTTP Method | Timeout | Retry | Lý do |
|---|---|---|---|
| GET, DELETE | 15s | 3 lần (exponential backoff) | Idempotent, an toàn retry |
| POST, PUT, PATCH | 60s | Không retry | Tránh duplicate data |

**Full Route Mapping:**

| Client Request | Target |
|---|---|
| `/api/odata/*` | `tomato.tpos.vn/odata/*` |
| `/api/token` | `tomato.tpos.vn/token` (cached) |
| `/api/Product/ExportProductV2` | Export product Excel |
| `/api/Product/ExportFileWithStandardPriceV2` | Export standard price Excel |
| `/api/Product/ExportFileWithVariantPrice` | Export variant price Excel |
| `/api/rest/*` | `tomato.tpos.vn/rest/*` |
| `/api/pancake/*` | `pancake.vn/api/v1/*` |
| `/api/sepay/*` | `n2store-fallback.onrender.com/api/sepay/*` |
| `/api/customers/*` | `n2store-fallback.onrender.com/api/customers/*` |
| `/tpos/order/:id/lines` | `FastSaleOrder(id)/OrderLines` |
| `/tpos/order-ref/:ref/lines` | Search by Number → OrderLines |

### 0.3 Multi-Company Token System (Chi tiết)

| CompanyId | Name | ShopConfig ID | TPOS Username | TPOS Password |
|---|---|---|---|---|
| 1 | NJD Live | `njd-live` | nvktlive1 | Aa@28612345678 |
| 2 | NJD Shop | `njd-shop` | nvktshop1 | Aa@28612345678 |

**Token Storage (per-company):**

| Storage | Key Company 1 | Key Company 2 |
|---|---|---|
| localStorage | `bearer_token_data_1` | `bearer_token_data_2` |
| Firestore | `tokens/tpos_token` | `tokens/tpos_token_2` |
| Shop selector | `n2store_selected_shop` = `njd-live` | `n2store_selected_shop` = `njd-shop` |

**Token Data Format:**
```json
{
  "access_token": "eyJhb...",
  "refresh_token": "abc123...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "expires_at": 1772695000000,
  "issued_at": 1772608600000
}
```

**Company ID Resolution:**
```javascript
// 1. ShopConfig (purchase-orders page)
if (window.ShopConfig?.getConfig) return window.ShopConfig.getConfig().CompanyId || 1;
// 2. localStorage (everywhere)
const shop = localStorage.getItem('n2store_selected_shop');
return shop === 'njd-shop' ? 2 : 1;
```

**Token Refresh Flow (purchase-orders):**
```
1. localStorage['bearer_token_data_{companyId}'] → valid?
2. Nếu expired → Firestore tokens/tpos_token[_{id}] → valid?
3. Nếu expired → Try refresh_token (grant_type=refresh_token)
4. Nếu fail → Password login → Company 1 token
5. Nếu companyId !== 1 → SwitchCompany(companyId) → Company N token
6. Save → localStorage + Firestore
```

**401 Error Handling:**
```
1. Clear in-memory token
2. Invalidate localStorage (set expires_at: 0, keep refresh_token)
3. Try refresh_token → nếu fail → Password login + SwitchCompany
4. Retry original request
```

> **Legacy migration:** `bearer_token_data` (không suffix) → tự động migrate sang `bearer_token_data_1`.

### 0.4 Per-User TPOS Credentials (PostgreSQL)

Table `tpos_credentials`:

| App User | TPOS Username | Company |
|---|---|---|
| admin | nvkt | 1 |
| hanh | nv07 | 1 |
| coi | nvv09 | 1 |
| huyen | nv08 | 1 |
| bobo | NV01 | 1 |
| my | my | 1 |
| lai | nv05 | 1 |

### 0.5 Database Tables (N2Store ↔ TPOS)

| Table | Mục đích |
|---|---|
| `tpos_credentials` | Tài khoản TPOS per user per company |
| `realtime_credentials` | JWT cho WebSocket TPOS + Pancake |
| `invoice_status` | Track phiếu bán hàng (FastSaleOrder) |
| `invoice_sent_bills` | Đã gửi bill cho KH chưa |
| `return_orders` | Đơn trả hàng NCC |
| `social_orders` | Đơn hàng từ social (Facebook) |
| `tpos_saved_customers` | KH đã lưu từ TPOS |
| `recent_transfers` | Chuyển khoản ngân hàng (match với KH TPOS) |
| `pending_customer_matches` | Partial phone matches (multiple results) |
| `balance_customer_info` | Customer info extracted from transfers |

### 0.6 Per-Company Purchase Config

| Config | Company 1 (NJD Live) | Company 2 (NJD Shop) |
|---|---|---|
| JournalId | 4 | 11 |
| AccountId | 4 | 32 |
| PickingTypeId | 1 | 5 |
| PaymentJournalId | 1 | 8 |
| WarehouseId | 1 | 2 |

> Hardcoded trong `purchase-orders/js/lib/tpos-purchase.js` → `STATIC.Config`

### 0.7 Detailed API Payloads

#### Create Purchase Order

```json
POST /api/odata/FastPurchaseOrder
{
  "Id": 0,
  "Type": "invoice",
  "State": "draft",
  "DateInvoice": "2026-04-02T12:00:00+07:00",
  "PartnerId": 12345,
  "CompanyId": 1,
  "JournalId": 4,
  "AccountId": 4,
  "PickingTypeId": 1,
  "PaymentJournalId": 1,
  "AmountTotal": 275000,
  "DecreaseAmount": 0,
  "CostsIncurred": 0,
  "PaymentAmount": 0,
  "FormAction": "SaveAndPrint",
  "OrderLines": [
    {
      "ProductId": 148018,
      "ProductQty": 1,
      "PriceUnit": 280000,
      "PriceSubTotal": 280000,
      "ProductUOMId": 1,
      "AccountId": 4
    }
  ],
  "Partner": { "..." },
  "Company": { "..." },
  "Journal": { "..." }
}
```

#### Create Payment

```json
POST /api/odata/AccountPayment
{
  "PartnerId": 12345,
  "PartnerType": "supplier",
  "PaymentType": "outbound",
  "Amount": 500000,
  "PaymentDate": "2026-04-02T00:00:00",
  "Communication": "Thanh toán NCC B28",
  "JournalId": 1,
  "Journal": { "Id": 1, "Name": "Tiền mặt", "Type": "cash" },
  "CompanyId": 1,
  "CurrencyId": 1
}
```

- Confirm: `POST /odata/AccountPayment/ODataService.ActionPost` → `{ "id": {paymentId} }`
- Cancel: `POST /odata/AccountPayment/ODataService.ActionCancel` → `{ "id": {paymentId} }`
- Delete: `DELETE /odata/AccountPayment({paymentId})`
- List: `GET /odata/AccountPayment/OdataService.GetAccountPaymentList?partnerType=supplier`

#### Create Partner (Supplier)

```json
POST /api/odata/Partner
{
  "Id": 0, "Name": "Tên NCC", "Ref": "MÃ_NCC",
  "Supplier": true, "Customer": false, "Active": true,
  "CompanyId": 1, "Type": "contact",
  "AccountPayable": { "Id": 4, "Code": "331", "Name": "Phải trả người bán" },
  "AccountReceivable": { "Id": 1, "Code": "131", "Name": "Phải thu của khách hàng" },
  "StockCustomer": { "Id": 9 },
  "StockSupplier": { "Id": 8 }
}
```

#### Sale Refund 5-Step Flow (Chi tiết)

```
Step 1: POST /odata/FastSaleOrder/ODataService.ActionRefund
        Body: { "id": {originalOrderId} }  →  { "value": {refundOrderId} }

Step 2: GET /odata/FastSaleOrder({refundOrderId})?$expand=Partner,User,Warehouse,...

Step 3: PUT /odata/FastSaleOrder({refundOrderId})
        Body: { ...fullDetailsFromStep2, FormAction: "SaveAndPrint" }
        ⚠ PHẢI gửi toàn bộ nested objects

Step 4: POST /odata/FastSaleOrder/ODataService.ActionInvoiceOpenV2
        Body: { "ids": [{refundOrderId}] }  →  State: "draft" → "open"

Step 5: GET https://tomato.tpos.vn/fastsaleorder/PrintRefund/{refundOrderId}
        ⚠ Gọi trực tiếp TPOS, không qua proxy
```

**Partial Refund:** Giữa Step 2 và 3, filter `OrderLines` chỉ giữ SP cần hoàn, recalculate `AmountTotal`.

#### Report APIs

```
# Supplier Debt
GET /odata/Report/PartnerDebtReport?Display=all&DateFrom={ISO}&DateTo={ISO}&ResultSelection=supplier

# Supplier Debt Detail
GET /odata/Report/PartnerDebtReportDetail?ResultSelection=supplier&PartnerId={id}&DateFrom={ISO}&DateTo={ISO}

# Supplier Invoices
GET /odata/AccountInvoice/ODataService.GetInvoicePartner?partnerId={id}

# Outstanding Debt
GET /api/Partner/CreditDebitSupplierDetail?partnerId={id}&take=50&skip=0
```

### 0.8 Real-time Event Details (từ capture 2026-04-05)

> Captured: 8.5 phút, 310 events, 37 conversations, 17 orders

#### Message Breakdown

| MessageType | Count | Mô tả |
|---|---|---|
| 11 | 62 | Facebook Messenger (inbox) |
| 12 | 34 | Facebook Comment (trên post live) |

| IsOwner | Count | Mô tả |
|---|---|---|
| false | 69 (72%) | Khách hàng gửi |
| true | 27 (28%) | Shop gửi/trả lời |

| Attachment Type | Count |
|---|---|
| text_only | 84 |
| image | 13 |
| template | 1 |

#### Facebook Pages (ChannelIds)

| ChannelId | Count | Ghi chú |
|---|---|---|
| 270136663390370 | 55 | Page chính (STORE) |
| 1479019015501919 | 28 | Page 2 |
| 117267091364524 | 13 | Page 3 (HOUSE) |

#### Browser Event Dispatching (N2Store)

```javascript
// N2Store broadcast real-time events via CustomEvent:
window.addEventListener('tposNewOrder', (e) => {
    const { id, customerName, content } = e.detail;
    // Badge đơn mới, toast notification
});

window.addEventListener('tposOrderUpdate', (e) => {
    const orderCode = e.detail.Data?.Code;
    // Refresh row trong bảng đơn hàng
});

window.addEventListener('tposConversationUpdate', (e) => {
    const { conversation, eventType, rawData } = e.detail;
    const msg = rawData?.Message;
    if (msg?.MessageType === 12) { /* Comment live */ }
    else if (msg?.MessageType === 11 && !msg?.IsOwner) { /* Inbox KH */ }
});
```

#### UI Features Priority

| # | Feature | Event | Priority | Tần suất |
|---|---|---|---|---|
| 1 | Badge đơn mới | SaleOnline_Order.created | CAO | ~80/h |
| 2 | Cập nhật trạng thái đơn | SaleOnline_Order.updated | CAO | ~45/h |
| 3 | Live comment feed | chatomni.on-message (type 12) | TRUNG BÌNH | ~250/h |
| 4 | Badge inbox mới | chatomni.on-message (type 11) | TRUNG BÌNH | ~465/h |
| 5 | Trạng thái KH (phone/address) | chatomni.on-message | THẤP | Tự động |
| 6 | Refresh hình sản phẩm | product.image-updated | THẤP | Rất thấp |

### 0.9 N2Store Key Implementation Files

| Component | File |
|---|---|
| TPOS Client (Universal) | `shared/universal/tpos-client.js` |
| OData Helper | `shared/universal/tpos-odata.js` |
| API Endpoints Config | `shared/universal/api-endpoints.js` |
| CF Worker Router | `cloudflare-worker/worker.js` |
| CF TPOS Handler | `cloudflare-worker/modules/handlers/tpos-handler.js` |
| CF Token Handler | `cloudflare-worker/modules/handlers/token-handler.js` |
| Render Token Manager | `render.com/services/tpos-token-manager.js` |
| Browser Token Manager | `shared/js/token-manager.js` |
| TPOS Socket Listener | `render.com/services/tpos-socket-listener.js` |
| Product Sync | `render.com/services/sync-tpos-products.js` |
| Customer Service | `render.com/services/tpos-customer-service.js` |
| Refund Flow | `shared/js/api-service.js` (line 774-1050) |
| PO Creator | `purchase-orders/js/lib/tpos-purchase.js` |
| Product Search | `purchase-orders/js/lib/tpos-search.js` |

---

## 1. Tổng quan

| Thuộc tính | Giá trị |
|---|---|
| **URL** | `https://tomato.tpos.vn/` |
| **Tên hiển thị** | NJD Live \| TPOS.VN |
| **Version** | 6.4.5.2 |
| **Loại ứng dụng** | Single Page Application (SPA) |
| **Framework** | AngularJS 1.x với UI-Router |
| **Statics CDN** | `https://gc-statics.tpos.vn/resources/main/6.4.5.2/` |
| **SignalR Server** | `https://sr.tpos.vn` |
| **Socket.IO Server** | `https://rt-2.tpos.app` |
| **Facebook App ID** | `327268081110321` |
| **Facebook API Version** | `v16.0` (meta tag), thực tế dùng tới `v23.0` |

### Source Files

| File | Size | Vai trò |
|---|---|---|
| `vendor.min.js` | 4.2 MB | Third-party libraries (AngularJS, Kendo UI, jQuery, Socket.IO...) |
| `controllers.min.js` | 2.4 MB | **419 controllers** — toàn bộ logic nghiệp vụ |
| `services.min.js` | 193 KB | **136 factories + 2 services** — API layer |
| `directives.min.js` | 64 KB | **36 directives** — UI components |
| `app.min.js` | 59 KB | App config, routes, interceptors, run blocks |
| `customs.min.js` | 11 KB | Utility functions, Array/Date extensions |
| `vendor.min.css` | 588 KB | Third-party styles |
| `app.min.css` | 169 KB | Application styles |

---

## 2. Tech Stack & Kiến trúc

### Frontend Stack

| Technology | Usage |
|---|---|
| **AngularJS 1.x** | Main framework (`ng-app="app"`) |
| **UI-Router** | Routing (`$stateProvider`, hash-based `#/app/...`) |
| **Kendo UI** | Data grids, ComboBoxes, DatePickers, Charts |
| **jQuery** | DOM manipulation, AJAX (parallel với AngularJS $http) |
| **Socket.IO v4** | Real-time WebSocket |
| **Google Charts** | Dashboard charts |
| **Bootstrap** | CSS framework |
| **Toastr** | Toast notifications |
| **angularjs-facebook-sdk** | Facebook SDK integration |
| **angular-moment** | Date formatting (Vietnamese locale) |
| **IndexedDB** | Client-side product caching (`superCache`) |
| **ngTagsInput** | Tag input component |
| **ui.select** | Searchable dropdown |
| **dndLists** | Drag and drop |
| **bootstrapLightbox** | Image lightbox |
| **perfect_scrollbar** | Custom scrollbar |
| **angular-split-pane** | Split panel layout |
| **blockUI** | Loading overlay |
| **cp.ngConfirm** | Confirmation dialogs |
| **cfp.hotkeys** | Keyboard shortcuts |
| **angularLazyImg** | Lazy image loading |

### AngularJS Modules

| Module | Dependencies |
|---|---|
| `app` (main) | `ngAnimate`, `ngResource`, `ngSanitize`, `ngStorage`, `ngRoute`, `ui.router`, `ui.bootstrap`, `kendo.directives`, `toastr`, `blockUI`, `cfp.hotkeys`, `cp.ngConfirm`, `http-auth-interceptor`, `app.services`, `app.components`, `app.directives`, `web.formats`, `web.utils`, `web.ajax`, `shagstrom.angular-split-pane`, `angular.filter`, `perfect_scrollbar`, `angularjs-breadcrumb`, `angularjs-facebook-sdk`, `tmt.ui.numeric`, `dndLists`, `indexedDB`, `angularLazyImg`, `angularMoment`, `hm.readmore`, `bootstrapLightbox`, `timer`, `ngTagsInput`, `ui.select` |
| `app.services` | `ngResource` |
| `app.components` | `ui.bootstrap` |
| `app.directives` | `app.services` |
| `web.utils` | — |
| `web.formats` | — |
| `web.ajax` | — |
| `indexedDB` | — |

### Kiến trúc ứng dụng

```
Browser (AngularJS SPA)
    │
    ├── app.min.js ─────────── Config, Routes, Run Blocks, Interceptors
    ├── controllers.min.js ─── 419 Controllers (business logic per page)
    ├── services.min.js ────── 138 Services/Factories (API + data layer)
    ├── directives.min.js ──── 36 Directives (reusable UI components)
    └── customs.min.js ─────── Utility functions + Array/Date extensions
         │
         ├── HTTP ──→ TPOS OData API (tomato.tpos.vn/odata)
         ├── HTTP ──→ TPOS REST API (tomato.tpos.vn/rest, /api)
         ├── WS ────→ Socket.IO (rt-2.tpos.app, namespace: /chatomni)
         ├── WS ────→ SignalR (sr.tpos.vn)
         └── HTTP ──→ Facebook Graph API
```

### Dynamic Route Loading

Routes **không hardcoded** trong source — được load từ server dựa trên user permissions:

1. App startup → `GET /api/account/layout` → returns `{routes, navs, user}`
2. Routes được register runtime: `$stateProviderRef.state(name, routeConfig)`
3. Cache trong `localStorage['ngStorage-routes']`
4. Navigation menu từ `localStorage['ngStorage-navs']`

→ Mỗi user chỉ thấy menu/pages mà họ có quyền truy cập.

---

## 3. Authentication & Authorization

### 3.1 Login Flow

```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username={user}&password={pass}&client_id=tmtWebApp
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 1295999,
  "refresh_token": "abc123..."
}
```

### 3.2 Token Management

- **Storage**: `localStorage['accessToken']`, `localStorage['refreshToken']`
- **Auto-attach**: Cả AngularJS `$http` interceptor + jQuery `$.ajaxSend` đều tự thêm `Authorization: Bearer {token}`
- **Auto-refresh**: Khi nhận 401 → buffer request → broadcast `event:auth-loginRequired` → re-auth → retry
- **App version header**: `TPOSAppVersion` từ `<meta property="tpos:app_version">`, exclude cho `/print/html`, `/api/facebook`, `/api/printhtml`, `/api/getscalevalue`

### 3.3 Standard Headers

```javascript
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {token}',
  'TPOSAppVersion': '6.4.5.2',
  'tposappversion': '6.4.5.2',
  'feature-version': '2',
  'x-tpos-lang': 'vi'
}
```

### 3.4 Multi-Company

- Switch company: `ODataService.SwitchCompany` action
- Per-company credentials (see SHARED_TPOS.md)
- Per-company config: JournalId, AccountId, PickingTypeId, PaymentJournalId, WarehouseId

### 3.5 Two-Factor Authentication (2FA/TOTP)

- Check status: `GET /api/totp/status`
- Enable/Disable qua `TOTPService` factory
- Temporary password: `TempPasswordService` (`/api/temporarypassword`)
- Modal `twoFAWaitingDecisionController` hiện khi status pending

### 3.6 Permission System

- Permission check: `POST /api/common/CheckPermission`
- Role-based: `ResGroup`, `ApplicationRole`, `IRModelAccess`, `IRRule`
- Directive `checkPermission` ẩn/hiện UI elements theo quyền
- Route resolve: `getLoggedState` kiểm tra `GET /api/account/logged`

---

## 4. Modules & Chức năng

### 4.1 Dashboard (`#/app/dashboard`)

**Controller:** `dashboardController`

Trang tổng quan với:
- Google Charts biểu đồ
- Thống kê đơn hàng, doanh thu
- Quick actions
- Notifications

---

### 4.2 Điểm bán hàng (POS) — 20 controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/posconfig/kanban` | `POSConfigKanbanController` | Danh sách điểm bán (kanban view) |
| `#/app/posconfig/list` | `POSConfigListController` | Cấu hình POS |
| `#/app/possession/list` | `POS_SessionListController` | Phiên bán hàng |
| `#/app/posorder/list` | `POS_OrderListController` | Đơn hàng POS |

**Chức năng chi tiết:**
- **POS Session**: Mở/đóng ca, nạp tiền (`CashBoxIn`), rút tiền (`CashBoxOut`), sao kê cuối ca
- **POS Order**: Tạo đơn tại quầy, thanh toán (tiền mặt/thẻ/QR), in hóa đơn, hoàn trả
- **POS Config**: Cấu hình máy in, phương thức thanh toán, danh mục POS
- **Restaurant**: Quản lý tầng/bàn (`RestaurentFloor`, `RestaurentTable`), máy in nhà bếp
- **OData entities**: `POS_Config`, `POS_Session`, `POS_Order`, `POS_OrderLine`, `POS_Category`, `PosMakePayment`
- **Controllers**: `PosMakePaymentController` (màn hình thanh toán chính), `POS_OrderRefundModalController`, `POS_ActionBatchRefundController`

---

### 4.3 Bán hàng (Sales) — 55+ controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/fastsaleorder/invoicelist` | `FastSaleOrderListController` | Danh sách hóa đơn bán hàng |
| `#/app/fastsaleorder/refundlist` | `FastSaleOrderRefundListController` | Danh sách trả hàng |
| `#/app/fastsaleorder/deliveryinvoice` | `FastSaleOrderDeliveryInvoiceListController` | Phiếu giao hàng |
| `#/app/historyds/list` | `historyDeliveryStatusController` | Lịch sử đối soát |
| `#/app/fastsaleorder/historycrosscheckproduct` | `FastSaleOrderHistoryCrossCheckProduct` | Lịch sử đối soát sản phẩm |

**Chức năng chi tiết:**
- **FastSaleOrder (Hóa đơn bán hàng)**:
  - Tạo/sửa/xóa hóa đơn
  - Xác nhận đơn (`ActionConfirm`), mở đơn (`ActionInvoiceOpen`, `ActionInvoiceOpenV2`)
  - Xuất file Excel, in hóa đơn (HTML via `/api/printhtml`)
  - Hoàn trả (5-step refund flow: `ActionRefund` → GET detail → PUT update → `ActionInvoiceOpenV2` → Print)
  - Batch refund (`actionBatchRefundController`)
  - Chia đơn (`FastSaleOrderSplitHistoryModalController`)
  - Gắn tag (`batchAddTagFastSaleOrdersController`)
  - Áp dụng coupon/promotion
  - Hiển thị QR thanh toán

- **Giao hàng (Delivery)**:
  - Gửi vận chuyển (`fastSaleOrderSendShipController`)
  - Cập nhật đơn vị vận chuyển
  - Cập nhật mã vận đơn từ Excel
  - Cập nhật trạng thái ship từ Excel hoặc batch
  - Tracking ZTO, DHL
  - Đối soát (cross-check) thủ công + tự động
  - Thay đổi COD

- **Báo cáo giao hàng**: Theo kênh bán, theo khách hàng

- **Import/Export**:
  - Import đơn từ Excel (`FastSaleOrderInvoiceFormByFileController`)
  - Import chi tiết đơn (`ImportDetailSaleOrderModalController`)
  - Export danh sách

- **OData entities**: `FastSaleOrder`, `FastSaleOrderLine`, `DeliveryCarrier`, `Tag`, `TagFastSaleOrder`

---

### 4.4 Hóa đơn điện tử (E-Invoice) — 11 controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/wiinvoice/list` | `WiInvoiceListController` | Danh sách hóa đơn điện tử |
| `#/app/wiinvoice/listhistory` | `WiInvoiceListHistoryController` | Lịch sử |
| `#/app/wiinvoice/config` | `wiInvoiceConfigFormController` | Cấu hình |

**Chức năng:**
- Tạo hóa đơn điện tử từ đơn bán hàng
- Điều chỉnh, thay thế, hủy hóa đơn
- Đăng nhập WiInvoice (`wiInvoiceLoginModalController`)
- Thêm/sửa/xóa item trên hóa đơn
- Xem lịch sử phát hành
- Cấu hình kết nối nhà cung cấp hóa đơn điện tử

---

### 4.5 Báo giá & Đơn đặt hàng — 27 controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/salequotation/quotationlist` | `SaleQuotationListController` | Danh sách báo giá |
| `#/app/saleorder/list2` | `SaleOrderListController` | Danh sách đơn đặt hàng |

**Báo giá (Sale Quotation):**
- Tạo/sửa/xóa báo giá
- Thêm section/phân nhóm sản phẩm
- Export, print báo giá
- Chuyển báo giá → đơn đặt hàng

**Đơn đặt hàng (Sale Order):**
- Full CRUD
- Multi-currency support (`ResCurrency`)
- Phân quyền theo nhóm bán hàng (`CRMTeam`)
- Chuyển đơn đặt hàng → hóa đơn bán hàng (FastSaleOrder)
- Export Excel, in đơn
- OData entities: `SaleOrder`, `SaleOrderLine`, `SaleQuotation`, `SaleQuotationLine`, `SaleLayout`, `Product_PriceList`

---

### 4.6 Sale Online — 40+ controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/saleOnline/liveCampaign/list` | `saleOnline_LiveCampaignController` | Chiến dịch Live |
| `#/app/saleOnline/order/list` | `saleOnline_OrderController` | Đơn hàng online |
| `#/app/saleOnline/facebook` | Redirect → `/facebook/post` | Facebook management |

**Chiến dịch Live:**
- Tạo/quản lý chiến dịch livestream Facebook
- Liên kết với Facebook Page
- Tự động tạo đơn từ comment

**Đơn hàng Online:**
- Tạo/sửa/xóa đơn online
- Tạo đơn từ comment Facebook (`saleOnline_Comment_CreateOrderController`)
- Gán nhân viên xử lý
- Cập nhật địa chỉ (tự động theo SĐT)
- Chuyển đơn online → hóa đơn (FastSaleOrder)
- Chuẩn bị hàng (`saleOnlineCreatePrepareGoodsController`)

**Facebook Management:**
- Quản lý Page (`facebookController`)
- Xem bài post, thống kê (`facebookPostController`, `facebookPostSummaryController`)
- Publish bài viết, chia sẻ (`facebookPublishController`)
- Quản lý comment, like, followers
- Marketing inbox — xem/trả lời tin nhắn (`mkt_facebookInboxController`)
- Tạo đơn từ inbox (`mkt_facebookInboxOrderController`)
- Facebook Graph API: comments, conversations, messages, live video, reels

**OData entities**: `SaleOnline_Order`, `SaleOnline_Facebook_Comment`, `SaleOnline_Facebook_Post`, `SaleOnline_LiveCampaign`, `CRMTeam`

---

### 4.7 Kênh bán hàng (Sale Channels) — 6 controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/salechannel/list` | `saleChannelListController` | Danh sách kênh bán |

**Chức năng:**
- Quản lý kênh bán hàng (Facebook Pages, Lazada, Shopee)
- Kết nối Lazada: `GET /api/lazada/getSeller`
- Kết nối Shopee: `GET /api/shopee/geturlauthorizationshopee`
- Chuyển Facebook Page giữa các team (`TransferFacebookPageController`)
- Xem lịch sử thay đổi kênh

---

### 4.8 Mua hàng (Purchase) — 8 controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/fastpurchaseorder/invoicelist` | `FastPurchaseOrderListController` | Danh sách phiếu mua hàng |
| `#/app/fastpurchaseorder/refundlist` | `FastPurchaseOrderRefundModalController` | Trả hàng mua |

**Chức năng:**
- Tạo phiếu mua hàng (`FastPurchaseOrderForm1Controller`)
- Import từ Excel (2-step: `PurchaseByExcel` → create order)
- Xác nhận, in phiếu
- Hoàn trả hàng mua
- Báo cáo mua hàng theo nhân viên, nhà cung cấp
- In nhãn mã vạch cho sản phẩm nhập

**OData entities**: `FastPurchaseOrder`, `FastPurchaseOrderLine`, `PurchaseOrder`, `PurchaseOrderLine`

---

### 4.9 Kho hàng (Inventory) — 40+ controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/stockpickingtype/overview` | `StockPickingTypeOverviewController` | Tất cả hoạt động kho |
| `#/app/stockinventory/list` | `StockInventoryListController` | Điều chỉnh tồn kho |
| `#/app/stockmove/list` | `StockMoveListController` | Dịch chuyển kho |

**Stock Picking (Phiếu xuất/nhập kho):**
- Tạo/sửa/xóa phiếu kho
- Import dòng từ Excel
- Chia lô (`StockPickingPackSplitLotController`)
- Trả hàng (`StockPickingReturnModalController`)
- Xác nhận chuyển kho ngay (`ImmediateTransferConfirmation`)
- Backorder (`BackOrderConfirmation`)

**Kiểm kê (Stock Inventory):**
- Tạo phiếu kiểm kê
- Import danh sách kiểm kê từ Excel (2 loại import)
- So khớp tồn kho hệ thống vs thực tế

**Dịch chuyển kho (Stock Move):**
- Danh sách dịch chuyển
- Chạy FIFO Vacuum (`StockMoveFifoVacuumController`) — điều chỉnh giá vốn
- Cập nhật khối lượng
- Báo cáo xuất dự trữ

**Kho & Vị trí:**
- Quản lý kho (`StockWarehouse`)
- Vị trí kho (`StockLocation`)
- Tuyến đường kho (`StockLocationRoute`) — push/pull rules
- Cấu hình sản phẩm kho (`StockWarehouse_Product`)

**Báo cáo kho:**
- Nhập - Xuất - Tồn (`StockReportXuatNhapTonController`)
- Lịch sử kho (`StockReportHistoryController`)
- Min/Max tồn kho

**OData entities**: `StockPicking`, `StockPickingType`, `StockInventory`, `StockInventoryLine`, `StockMove`, `StockLocation`, `StockLocationRoute`, `StockWarehouse`, `StockWarehouse_Product`, `StockPackOperation`, `StockChangeProductQty`, `StockReturnPicking`

---

### 4.10 Kế toán (Accounting) — 55 controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/accountpayment/list?partnerType=customer` | `AccountPaymentListController` | Thanh toán bán hàng |
| `#/app/accountpayment/list?partnerType=supplier` | `AccountPaymentListController` | Thanh toán mua hàng |
| `#/app/accountpayment/changelist` | `AccountPaymentChangeListController` | Tiền thối POS |
| `#/app/accountinventory/list` | `AccountInventoryListController` | Điều chỉnh công nợ |
| `#/app/accountdeposit/list` | `AccountDepositListController` | Ký quỹ |
| `#/app/accountpayment/thulist` | `PhieuThuChiListController` | Phiếu thu |
| `#/app/accountpayment/chilist` | `PhieuThuChiListController` | Phiếu chi |

**Thanh toán (Account Payment):**
- Tạo phiếu thanh toán (inbound/outbound)
- Xác nhận (`ActionPost`), hủy (`ActionCancel`), xóa
- Thanh toán hàng loạt (`AccountRegisterPaymentFormModalMultiController`)
- Import thanh toán từ Excel
- Export, in phiếu thanh toán

**Phiếu thu/chi:**
- Tạo phiếu thu tiền mặt
- Tạo phiếu chi tiền mặt
- Quản lý loại thu/chi (`AccountAccountThuChiFormController`)

**Công nợ:**
- Điều chỉnh công nợ KH/NCC
- Import dòng điều chỉnh
- Ký quỹ (`AccountDeposit`)

**Bút toán (Journal Entry):**
- Tạo/sửa bút toán (`AccountMoveFormController`)
- Import dòng từ Excel
- Đối chiếu thủ công (`AccountMoveLineManualReconciliationController`)

**Sổ nhật ký:**
- Quản lý sổ nhật ký (tiền mặt, ngân hàng, bán hàng, mua hàng)

**Thuế:**
- Quản lý mã thuế (`AccountTax`)

**Sổ quỹ (Cash Print Journal):**
- 4 loại báo cáo sổ quỹ
- Export, print

**Báo cáo kế toán:**
- Sổ cái (`AccountReportGeneralLedgerController`)
- Sổ chi tiết đối tượng (`AccountPartnerLedgerController`)
- Báo cáo thu chi (`AccountCommonAccountReportThuChiController`)
- Báo cáo tồn quỹ (`AccountCommonAccountReportTonQuyController`)
- Báo cáo doanh thu — theo KH, sản phẩm, nhân viên, thời gian
- Báo cáo tài chính (`AccountingReportFinancialOriginController`)

**OData entities**: `Account`, `AccountPayment`, `AccountPaymentTerm`, `AccountJournal`, `AccountMove`, `AccountMoveLine`, `AccountInvoice`, `AccountTax`, `AccountDeposit`, `AccountInventory`, `AccountAnalyticAccount`, `AccountPartnerLedger`, `AccountCashPrintJournal`, `PhieuThuChi`, `CashBoxIn`, `CashBoxOut`, `AccountBankStatement`

---

### 4.11 Danh mục (Categories) — 80+ controllers

#### Khách hàng & Nhà cung cấp — 25+ controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/partnercategory/list` | `PartnerCategoryListController` | Nhóm khách hàng |
| `#/app/partnercategory_revenueconfig/list` | `PartnerCategory_RevenueListController` | Cấu hình nhóm doanh số |
| `#/app/partner/customer/list1` | `PartnerCustomerList1Controller` | Khách hàng |
| `#/app/partner/supplier/list1` | `PartnerSupplierList1Controller` | Nhà cung cấp |
| `#/app/revenuebegan/list` | — | Doanh số đầu kỳ KH |
| `#/app/revenuebegan/list_supplier` | — | Doanh số đầu kỳ NCC |
| `#/app/deliverycarrier/list` | `DeliveryCarrierListController` | Đối tác giao hàng |

**Chức năng Partner:**
- CRUD khách hàng/nhà cung cấp
- Import/Export Excel
- Match với Facebook (`PartnerImportFacebookMatchingController`)
- Kiểm tra trùng (`partnerDuplicateModalController`)
- Cập nhật địa chỉ tự động theo SĐT
- Quản lý trạng thái (`PartnerStatusExtra`)
- Sinh nhật khách hàng (`PartnerBirthDayController`)
- Import/update số dư, điểm loyalty
- Chuyển KH giữa pages (`TransferPartnerController`)

**Đối tác giao hàng:**
- Cấu hình đơn vị vận chuyển
- Bảng giá vận chuyển theo khối lượng
- Tích hợp HolaShip, GHN
- Cập nhật trạng thái giao hàng + thanh toán

#### Sản phẩm — 45+ controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/productcategory/list` | `ProductCategoryListController` | Nhóm sản phẩm |
| `#/app/producttemplate/list` | `ProductTemplateListController` | Sản phẩm |
| `#/app/product/list` | `ProductProductListController` | Biến thể sản phẩm |
| `#/app/barcodeproductlabel/printbarcode` | `BarcodeProducLabelPrintBarcodeController` | In mã vạch |
| `#/app/productattribute/list` | `ProductAttributeListController` | Thuộc tính |
| `#/app/productattributevalue/list` | `ProductAttributeValueListController` | Giá trị thuộc tính |
| `#/app/productuomcateg/list` | `ProductUOMCategListController` | Nhóm đơn vị tính |
| `#/app/productuom/list` | `ProductUOMListController` | Đơn vị tính |

**Chức năng sản phẩm:**
- CRUD sản phẩm + biến thể
- Quản lý thuộc tính (màu, size, etc.)
- Import/Export Excel (nhiều loại: v2, v3, standard price, product detail)
- Cập nhật giá hàng loạt từ file
- Combo sản phẩm (`ProductTemplateProductComboFormModalController`)
- Đơn vị tính + quy đổi (`ProductTemplateUOMLineFormModalController`)
- In mã vạch/nhãn sản phẩm
- Cấu hình giấy in mã vạch (`ProductLabelPaper`)
- Báo cáo dự báo sản phẩm
- Thay đổi số lượng tồn (`StockChangeProductQty`)
- Định giá tồn kho (`ProductInventoryValuationController`)
- Đồng bộ Lazada (`ProductTemplateSyncProductLazadaController`)
- Đăng sản phẩm Shopee (`PostProductShopeeModalComponentController`)
- Bảng giá (`Product_PriceList`) — nhiều bảng giá, item theo rule
- Thông tin nhà cung cấp per sản phẩm

#### Khuyến mãi & Loyalty — 15 controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/promotionprogram/list` | `PromotionProgramListController` | Chương trình khuyến mãi |
| `#/app/couponprogram/list` | `SaleCouponProgramListController` | Chương trình coupon |
| `#/app/loyaltyprogram/list` | `LoyaltyProgramListController` | Chương trình tích điểm |
| `#/app/offerprogram/list` | `OfferProgramListController` | Chương trình ưu đãi |

**Chức năng:**
- Khuyến mãi: Tạo rules (điều kiện áp dụng) + rewards
- Coupon: Sinh mã coupon hàng loạt, kiểm tra tồn tại
- Loyalty: Tích điểm per đơn, quy đổi điểm, lịch sử điểm
- Ưu đãi: Chương trình offer riêng
- Voucher: Tạo voucher + coupon codes

#### Khác

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/category_ext/distributor/list` | `PartnerExtListController` | Danh mục mở rộng |
| `#/app/accountaccount/thulist` | `AccountAccountThuChiListController` | Loại thu |
| `#/app/accountaccount/chilist` | `AccountAccountThuChiListController` | Loại chi |
| `#/app/accountaccount/list` | `AccountAccountListController` | Tài khoản kế toán |
| `#/app/accountjournal/list` | `AccountJournalListController` | Sổ nhật ký |
| `#/app/tag/list` | `TagListController` | Nhãn |
| `#/app/exportfile/list` | `ExportFileListController` | Tác vụ xuất đang chờ |

---

### 4.12 Báo cáo (Reports) — 35+ controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/product/inventoryvaluation` | `ProductInventoryValuationController` | Giá trị tồn kho |
| `#/app/stockreport/xuatnhapton` | `StockReportXuatNhapTonController` | Nhập - Xuất - Tồn |
| `#/app/report/reportImported` | — | Thống kê nhập kho |
| `#/app/report/reportExported` | — | Thống kê xuất kho |
| `#/app/report/reportOrder/index` | `ReportOrderIndexController` | Thống kê hóa đơn |
| `#/app/report/reportRefund/index` | `ReportRefundIndexController` | Thống kê trả hàng |
| `#/app/report/reportPurchase/index` | `PurchaseReportController` | Thống kê mua hàng |
| `#/app/report/reportRevenue/index` | `AccountingReportRevenueController` | Thống kê doanh thu |
| `#/app/report/businessResults/index` | `reportBusinessResultsController` | Kết quả kinh doanh |
| `#/app/fastsaleorder/deliveryreport/index` | `FastSaleOrderDeliveryReportIndexController` | Thống kê giao hàng |
| `#/app/report/supplierDept/index` | `reportSupplierDeptController` | Công nợ NCC |
| `#/app/report/customerDept/index` | `reportCustomerDeptController` | Công nợ KH |
| `#/app/report/accountnotinvoice` | `ReportAccountNotInvoiceController` | KH chưa phát sinh HĐ |
| `#/app/report/auditlogfastsaleorder` | `ReportAuditLogFastSaleOrderController` | Thao tác PBH theo NV |
| `#/app/report/partnerCreate` | `reportPartnerCreateIndexController` | Nguồn tạo KH |
| `#/app/accountcashprintjournal/report` | `AccountCashPrintJournalController` | Sổ tiền mặt |
| `#/app/report/rateinvoicefromsaleonline` | `ReportRateInvoiceFromSaleOnlineController` | Tỷ lệ lên đơn từ SO |
| `#/app/report/productinvoice` | `reportProductInvoiceController` | SP hóa đơn nháp/xác nhận |

**Mỗi báo cáo thường có sub-views:**
- Index (tổng quan)
- Theo khách hàng (Customer)
- Theo nhân viên (Staff)
- Chi tiết (Detail)
- Theo sản phẩm (Product)
- Theo khu vực (Area)

**Tính năng chung:** Filter theo ngày, export Excel, print, phân trang

---

### 4.13 Cấu hình (Settings) — 40+ controllers

| URL | Controller | Chức năng |
|---|---|---|
| `#/app/configs/general/index` | `generalConfigsController` | Cấu hình chung |
| `#/app/company/list` | `CompanyListController` | Công ty |
| `#/app/configs/printer/config` | `tpos_config_printerController` | Máy in |
| `#/app/productlabelpaper/list` | `ProductLabelPaperListController` | Giấy in mã vạch |
| `#/app/applicationuser/list` | `ApplicationUserListController` | Người dùng |
| `#/app/configs/roles` | `applicationRoleController` | Phân quyền |
| `#/app/configs/twofa` | `twoFAController` | Xác thực 2 yếu tố |
| `#/app/rescurrency/list` | `ResCurrencyListController` | Đơn vị tiền tệ |
| `#/app/irmailserver/list` | `IRMailServerListController` | Cấu hình Mail |
| `#/app/mailtemplate/list` | `MailTemplateListController` | Mail template |
| `#/app/configs/advanced` | `company_Config_AdvancedController` | Nâng cao |
| `#/app/callcenter/config` | `CallCenterConfigController` | Tích hợp (Call Center) |

**Users & Security:**
- CRUD người dùng (`ApplicationUser`)
- Phân quyền chi tiết: Role → Group → Model Access → Rule
- 2FA/TOTP: Enable, disable, confirm, waiting decision
- Temporary password
- User sessions/activities

**Company:**
- Multi-company support
- Cấu hình sale, purchase, stock per company
- Ngôn ngữ (`languageConfigsController`)

**IR (Internal Resources):**
- Mail server (SMTP config)
- Mail templates
- Sequences (auto-numbering)
- Models + Access control
- Module management

**Integrations:**
- Call Center (`ApplyCallCenterController`)
- VNPay (`VnpayListController`) — `GET /api/vnpay/getBanks`, `POST /api/vnpay/createUrlPayment`

---

## 5. API Architecture

### 5.1 API Base URLs

| Type | URL |
|---|---|
| OData | `https://tomato.tpos.vn/odata/{Entity}` |
| REST | `https://tomato.tpos.vn/rest/{endpoint}` |
| Custom API | `https://tomato.tpos.vn/api/{endpoint}` |
| Token | `https://tomato.tpos.vn/token` |
| Print | `https://tomato.tpos.vn/fastsaleorder/Print*/{id}` |

### 5.2 OData Action Methods (31 methods found)

| Method | Mô tả |
|---|---|
| `GetView` / `GetViewV2` | Lấy danh sách (list view) |
| `GetDetailView` / `GetDetails` | Lấy chi tiết |
| `DefaultGet` | Lấy giá trị mặc định cho form tạo mới |
| `InsertV` / `InsertV2` | Tạo mới |
| `UpdateV` / `UpdateV2` | Cập nhật |
| `Unlink` | Xóa |
| `SetActive` | Activate/archive |
| `ActionConfirm` | Xác nhận |
| `ActionCancel` | Hủy |
| `ActionDone` | Hoàn thành |
| `ActionPost` | Ghi sổ (kế toán) |
| `ActionRefund` | Tạo phiếu hoàn |
| `ActionInvoiceOpen` / `ActionInvoiceOpenV2` | Mở hóa đơn (draft → open) |
| `ActionImportSimple` / `ActionImport` | Import từ Excel |
| `InsertListOrderModel` | Batch insert |
| `PurchaseByExcel` | Import mua hàng từ Excel |
| `UpdateStandPrice` | Cập nhật giá chuẩn |
| `UpdateStatus` | Cập nhật trạng thái |
| `AssignTag` | Gắn nhãn |
| `GetAuditLogEntity` | Lấy audit log |
| `GetAvailables` | Kiểm tra tồn kho |
| `GetCommentOrders` | Lấy đơn từ comment |
| `GetDataCrossCheck` | Dữ liệu đối soát |
| `GetInvoicePartner` | Hóa đơn theo đối tác |
| `GetOrdersByPartnerId` | Đơn theo KH/NCC |
| `CrossCheckAndOpenOrder` | Đối soát + xác nhận |
| `SwitchCompany` | Chuyển công ty |
| `CreateUpdatePartner` | Tạo/cập nhật đối tác |
| `GetAllFacebook` | Lấy CRM teams Facebook |
| `GetListOrderIds` | Lấy danh sách ID đơn |
| `Search` / `SearchForPos` | Tìm kiếm |
| `OnChangeProduct` / `OnChangePartner` | Event handlers khi thay đổi |
| `GetReport` / `Excute` | Báo cáo |

### 5.3 REST/Custom API Endpoints

| Group | Endpoints | Mô tả |
|---|---|---|
| `/api/common/*` | ~25 endpoints | Config, permission, status, upload, partners |
| `/api/address/*` | checkaddress, checkphone, getcities, getdistricts, getwards | Địa chỉ |
| `/api/facebook-graph/*` | comment, conversation, livevideo, message, post, video/reels | Facebook Graph proxy |
| `/api/facebook/*` | ~20 endpoints | Facebook ops (tokens, comments, friends, messages) |
| `/api/tenant/*` | info, used, packages, generate-qr | Quản lý gói dịch vụ |
| `/api/vnpay/*` | createUrlPayment, getBanks, getCategories | VNPay |
| `/api/lazada/*` | getSeller | Lazada marketplace |
| `/api/shopee/*` | geturlauthorizationshopee | Shopee marketplace |
| `/api/totp` | status, enable, disable | 2FA TOTP |
| `/api/notification`, `/api/v2.0/notification` | CRUD | Push notifications |
| `/api/account/layout` | GET | Dynamic routes + navs + user |
| `/api/account/logged` | GET | Check login status |
| `/api/printhtml` | POST | In HTML |
| `/api/getscalevalue` | GET | Đọc giá trị cân |
| `/api/systemalert/*` | getalert, read | Cảnh báo hệ thống |
| `/api/management/*` | clearviewscached, processupdate | Admin operations |

### 5.4 OData Query Patterns

```
// List with pagination
GET /odata/{Entity}/ODataService.GetView?$top=50&$skip=0&$count=true&$orderby=DateCreated desc

// Filter
$filter=Active eq true and contains(Name,'keyword') and DateCreated ge '2026-01-01T00:00:00'

// Expand relations
$expand=Partner,OrderLines($expand=Product,ProductUOM)

// Select fields
$select=Id,Code,Name,AmountTotal

// Combined
GET /odata/FastSaleOrder/ODataService.GetView
  ?$filter=DateInvoice ge '2026-04-01' and DateInvoice le '2026-04-12'
  &$expand=Partner,OrderLines($expand=Product,ProductUOM)
  &$orderby=DateInvoice desc
  &$top=50&$skip=0&$count=true
```

---

## 6. Real-time Features

### 6.1 Socket.IO (Primary)

| Thuộc tính | Giá trị |
|---|---|
| **URL** | `wss://rt-2.tpos.app` |
| **Protocol** | Socket.IO v4 |
| **Namespace** | `/chatomni` |
| **Transport** | WebSocket only |
| **Auth** | `{ token: accessToken, room: 'tomato.tpos.vn' }` |
| **Heartbeat** | Server ping 25s, timeout 60s |
| **Main Event** | `on-events` (JSON string payload, cần parse 2 lần) |

### 6.2 Events nhận được

| Event | Tần suất | Mô tả |
|---|---|---|
| `chatomni.on-message` | ~465/h (live) | Tin nhắn chat (Messenger type=11, Comment type=12) |
| `SaleOnline_Order` created | ~80/h (live) | Đơn hàng mới |
| `SaleOnline_Order` updated | ~45/h (live) | Đơn hàng cập nhật |
| `product.image-updated` | Rất thấp | Hình ảnh SP thay đổi |
| `ProductTemplate` created | Thấp | SP mới/cập nhật |

### 6.3 Event Structure

```json
// Chat message
{
  "Conversation": { "Id", "ChannelType", "ChannelId", "UserId", "Name", "HasPhone", "HasAddress" },
  "Message": { "Id", "ChannelType", "MessageType", "Message", "IsOwner", "Data": { "id", "message", "attachments" } },
  "EventName": "chatomni.on-message"
}

// Order event
{
  "Type": "SaleOnline_Order",
  "Message": "NV: label.create_order_with_code 260401050.",
  "Data": { "Facebook_PostId", "Facebook_UserName", "Id", "Code", "Session", "SessionIndex" },
  "EventName": "created" | "updated"
}
```

### 6.4 SignalR (Secondary)

- URL: `https://sr.tpos.vn` (from `<meta property="tpos:app_signalr">`)
- Used for: Additional real-time features (POS, etc.)

### 6.5 Browser WebSocket Factories

| Factory | Module | Events |
|---|---|---|
| `commonSocketFactory` | `app.services` | `connect`, `disconnect`, `connect_error`, `tpos_app_data`, `on-events` |
| `posCommonSocketFactory` | `app.services` | POS-specific socket |

---

## 7. Data Models (OData Entities)

### 7.1 Tổng quan — 107 OData entities

Grouped by domain:

#### Sales (Bán hàng)
| Entity | Mô tả |
|---|---|
| `FastSaleOrder` | Hóa đơn bán hàng |
| `FastSaleOrderLine` | Dòng sản phẩm trên HĐ |
| `FastSaleSendShipper` | Gửi vận chuyển |
| `FastSaleSettings` | Cấu hình bán nhanh |
| `SaleOrder` / `SaleOrderLine` | Đơn đặt hàng |
| `SaleQuotation` / `SaleQuotationLine` | Báo giá |
| `SaleLayout` | Layout báo giá |
| `SaleSettings` / `SaleConfigSetting` | Cấu hình bán hàng |

#### Sale Online
| Entity | Mô tả |
|---|---|
| `SaleOnline_Order` | Đơn hàng online |
| `SaleOnline_Facebook_Comment` | Comment Facebook |
| `SaleOnline_Facebook_Post` | Bài đăng Facebook |
| `SaleOnline_LiveCampaign` | Chiến dịch live |
| `TagSaleOnlineOrder` | Tag đơn online |

#### Purchase (Mua hàng)
| Entity | Mô tả |
|---|---|
| `FastPurchaseOrder` / `FastPurchaseOrderLine` | Phiếu mua hàng |
| `PurchaseOrder` / `PurchaseOrderLine` | Đơn mua hàng |
| `PurchaseSettings` | Cấu hình mua hàng |

#### Inventory (Kho)
| Entity | Mô tả |
|---|---|
| `StockPicking` / `StockPickingType` | Phiếu kho |
| `StockPickingMakeEntry` | Tạo phiếu kho |
| `StockMove` | Dịch chuyển kho |
| `StockLocation` / `StockLocationRoute` / `StockLocationPath` | Vị trí + tuyến kho |
| `StockWarehouse` / `StockWarehouse_Product` | Kho + cấu hình SP |
| `StockInventory` / `StockInventoryLine` | Kiểm kê |
| `StockPackOperation` | Đóng gói |
| `StockChangeProductQty` | Thay đổi tồn |
| `StockReturnPicking` | Trả hàng |
| `StockSettings` | Cấu hình kho |

#### Product (Sản phẩm)
| Entity | Mô tả |
|---|---|
| `ProductTemplate` | Template SP |
| `Product` | Biến thể SP |
| `ProductTemplateUOMLine` | ĐVT quy đổi |
| `ProductCategory` | Nhóm SP |
| `ProductAttribute` / `ProductAttributeValue` | Thuộc tính |
| `ProductUOM` / `ProductUOMCateg` | Đơn vị tính |
| `Product_PriceList` | Bảng giá |
| `ConfigProductImportExport` | Cấu hình import/export |

#### Accounting (Kế toán)
| Entity | Mô tả |
|---|---|
| `Account` | Tài khoản kế toán |
| `AccountInvoice` / `AccountInvoiceLine` | Hóa đơn |
| `AccountInvoiceRefund` | Hoàn hóa đơn |
| `AccountMove` / `AccountMoveLine` | Bút toán |
| `AccountPayment` / `AccountPaymentTerm` | Thanh toán |
| `AccountRegisterPayment` | Đăng ký thanh toán |
| `AccountTax` | Thuế |
| `AccountJournal` | Sổ nhật ký |
| `AccountDeposit` | Ký quỹ |
| `AccountBankStatement` / `Line` / `Cashbox` | Sao kê ngân hàng |
| `AccountCashPrintJournal` | Sổ quỹ |
| `AccountAdjustment` / `Line` | Điều chỉnh |
| `AccountInventory` / `Line` | Kiểm kê công nợ |
| `AccountAnalyticAccount` | Tài khoản phân tích |
| `AccountPartnerLedger` | Sổ chi tiết đối tác |
| `AccountReportGeneralLedger` | Sổ cái |
| `AccountCommonAccountReport` | Báo cáo TK chung |
| `AccountCommonPartnerReport` | Báo cáo đối tác |
| `AccountingReport` | Báo cáo tài chính |
| `PhieuThuChi` | Phiếu thu chi |
| `CashBoxIn` / `CashBoxOut` | Nạp/rút tiền |

#### Partner (Đối tác)
| Entity | Mô tả |
|---|---|
| `Partner` | KH/NCC |
| `PartnerExt` | Thông tin mở rộng |
| `PartnerCategory` | Nhóm KH |
| `PartnerCategory_RevenueConfig` | Cấu hình doanh số |
| `PartnerStatusExtra` | Trạng thái |

#### POS
| Entity | Mô tả |
|---|---|
| `POS_Config` / `POS_Session` / `POS_Order` / `POS_OrderLine` | POS core |
| `POS_Category` | Danh mục POS |
| `PosConfigSetting` / `PosMakePayment` | Cấu hình + thanh toán |
| `RestaurentFloor` / `RestaurentTable` / `RestaurentPrinter` | Nhà hàng |

#### CRM & Marketing
| Entity | Mô tả |
|---|---|
| `CRMTeam` | Nhóm bán hàng |
| `CRMActivity` / `CRMActivityCampaign` | Hoạt động |
| `CRMTag` | Tag CRM |

#### Promotions
| Entity | Mô tả |
|---|---|
| `PromotionProgram` / `PromotionRule` | Khuyến mãi |
| `SaleCouponProgram` / `SaleCoupon` | Coupon |
| `LoyaltyProgram` / `LoyaltyReward` / `LoyaltyRule` | Tích điểm |
| `OfferProgram` | Ưu đãi |
| `VoucherProgram` / `VoucherCoupon` | Voucher |

#### Delivery
| Entity | Mô tả |
|---|---|
| `DeliveryCarrier` | Đơn vị vận chuyển |
| `ConfigShippingFee` | Cấu hình phí ship |
| `TransportConfigs` | Cấu hình vận chuyển |
| `HistoryDeliveryStatus` | Lịch sử trạng thái ship |

#### System
| Entity | Mô tả |
|---|---|
| `Company` / `Company_Config` | Công ty |
| `ApplicationUser` / `ApplicationRole` | User + Role |
| `ResGroup` | Nhóm quyền |
| `IRConfigParameter` | Config params |
| `IRModel` / `IRModelAccess` | Model + Access control |
| `IRModuleCategory` / `IRModuleModule` | Module management |
| `IRRule` | Rules |
| `IRSequence` | Auto-numbering |
| `IRMailServer` | Mail server |
| `AuditLog` | Audit log |
| `Tag` | Nhãn |
| `MailTemplate` | Mail template |
| `ResCurrency` / `ResCurrencyRate` | Tiền tệ |
| `OriginCountry` | Xuất xứ |
| `RevenueBegan` | Doanh số đầu kỳ |
| `BarcodeNomenclature` / `BarcodeRule` | Mã vạch |
| `ProcurementRule` | Quy tắc mua sắm |
| `ReportSales` | Báo cáo bán hàng |

---

## 8. Services & Factories

### 8.1 Core Infrastructure

| Factory | Mô tả |
|---|---|
| `BasicODataService` | Base OData CRUD client — tất cả entity services kế thừa từ đây |
| `commonService` | Logging: error, info, log, success, warning |
| `commonCacheFactory` | Shared caching layer |
| `commonSocketFactory` | Socket.IO WebSocket client |
| `commonStateFactory` | Shared state management |
| `superCache` | IndexedDB wrapper cho product caching |
| `tposStorage` | localStorage adapter |
| `tposStorageService` | Extended storage service |
| `kendoDataSource` | Kendo UI DataSource factory |
| `comboBoxDataSource` | ComboBox DataSource builder |
| `myHttpInterceptor` | HTTP interceptor (auth + error handling) |
| `paginationHelperFactory` | Pagination helper |
| `WebWorkerService` | Web Worker management |
| `imageCompressFactory` | Image compression |
| `postExcel` | Excel export utility |
| `FileUtilsService` | File utilities |
| `GoogleChartService` | Google Charts |
| `MyWatchChangeService` | Change detection |

### 8.2 Product Cache (IndexedDB)

`saleProductStorageService` — Quản lý product cache trong IndexedDB:
- `loadProductV3()` — Load products với incremental sync
- `getAllProduct()` — Lấy toàn bộ từ cache
- `getProductsFromCache()` — Search trong cache
- `searchForPos()` — Search cho POS
- Versioned sync: `product_latest_id_get_source`, `product_latest_version`

### 8.3 Printing

| Factory | Mô tả |
|---|---|
| `printer` | print, printBarcode, printFromScope |
| `printerService` | Print service layer |
| `PdfViewerService` | PDF viewing |
| `tposPrintersConfigService` | Printer configuration |
| `ReportService` | Report generation (OData: ReportSales) |
| `BarcodeProductLabelService` | Barcode labels |

### 8.4 Top ODataService Actions (by frequency)

| Method | Count | Mô tả |
|---|---|---|
| `DefaultGet` | 92 | Get default values for new records |
| `ActionImport` | 15 | Import from Excel |
| `SetActive` | 13 | Activate/archive |
| `ActionCancel` | 12 | Cancel |
| `Unlink` | 10 | Delete |
| `SearchForPos` | 10 | POS product search |
| `OnChangeProduct` | 10 | Product change handler |
| `OnChangePartner` | 8 | Partner change handler |
| `ActionConfirm` | 7 | Confirm |
| `ActionDone` | 6 | Mark done |
| `GetReport` | 5 | Generate report |

---

## 9. UI Components (Directives)

### 36 Directives

| Directive | Restrict | Mô tả |
|---|---|---|
| `uiNav` | AC | Navigation với Kendo ComboBox |
| `uiToggleClass` | AC | Toggle CSS classes |
| `adjustPairValidator` | A | Validation cặp fields |
| `autoFocus` | A | Auto-focus on load |
| `autoFocusKendoComboBox` | A | Auto-focus Kendo ComboBox |
| `autoFocusKendoNumericTextBox` | A | Auto-focus Kendo Numeric |
| `back` | — | Navigate back |
| `barcodeScanner` | AE | Barcode scanner input |
| `binaryFileInput` | A | Binary file upload |
| `checkPermission` | E | Permission-based visibility |
| `comboClear` | A | Clear ComboBox |
| `confirm` | — | Confirmation dialog |
| `customOnChange` | AE | Custom onChange |
| `detailGridCustom` | EA | Expandable detail grid |
| `enterDo` | — | Execute on Enter key |
| `eventScroll` | EA | Scroll event handler |
| `fieldBinaryImage` | EA | Binary image display |
| `fixedColumnTable` | E | Sticky table columns |
| `floatingActionButton` | E | FAB button |
| `focusSelectAllText` | A | Focus + select all |
| `focusSelectAllTextCbx` | AE | Focus + select ComboBox |
| `infiniteScroll` | — | Infinite scrolling |
| `kvAutoNumeric` | — | Numeric formatting (kv) |
| `myComboBox` | A | Custom ComboBox |
| `myScroll` | A | Custom scroll |
| `onChangeKendoNumeric` | — | Kendo Numeric change |
| `scrollCloseTag` | — | Close tag on scroll |
| `searchKendoCustom` | EA | Custom search (template: `/templatehtml/formsearch`) |
| `searchKendoCustomNew` | A | New custom search |
| `selectProduct` | AE | Product selection widget |
| `suggestInputMoney` | E | Money input with suggestions |
| `tableWidget` | A | Table widget (template: `/pos_session/tablewidget`) |
| `tmtAutoNumeric` | — | Numeric formatting (tmt) |
| `tmtSelectText` | A | Select text on focus |
| `tposLazyImg` | EA | Lazy image loading |
| `tposPaging` | EA | Pagination component |
| `treeNodeInput` | A | Tree node input |

---

## 10. Utility Functions

### 10.1 String Utilities (customs.min.js)

| Function | Mô tả |
|---|---|
| `toTitleCase(str)` | Convert to Title Case |
| `nameNoSign(str)` | Bỏ dấu tiếng Việt (NFD normalization) |
| `nameNoSignDefault(str)` | Bỏ dấu (manual char replacement) |
| `removeVietnameseTones(str)` | Strip tone marks |
| `nameCharactersSpace(str)` | Remove special chars + spaces |
| `limitWordOfString(str, count)` | Limit to N words |
| `countWords(str)` | Count words |
| `cryptCaesar(str, shift, decrypt)` | Caesar cipher |

### 10.2 Array Extensions

| Method | Mô tả |
|---|---|
| `Array.prototype.sum(field, field2, op)` | Sum by field(s) with operator (`*`, `/`, `+`, `-`) |
| `Array.prototype.average(field)` | Average of field |
| `Array.prototype.getBy(field, value)` | Find object by field |
| `Array.prototype.sortBy(field, dir)` | Sort by field |
| `Array.prototype.remove(...values)` | Remove values |

### 10.3 Date Utilities

| Function | Mô tả |
|---|---|
| `toDateTimeFromJson(jsonDate)` | Parse `/Date(123456)/` format |
| `Date.prototype.addDays(days)` | Add days |
| `DateDiff.inDays/inWeeks/inMonths/inYears(d1, d2)` | Date differences |
| `setUtcDate(date)` | Local → UTC |

### 10.4 Angular Factories

| Factory | Module | Mô tả |
|---|---|---|
| `WebUtils` | `web.utils` | `round_precision`, `round_decimals`, `lpad`, `insert_thousand_seps` (Vietnamese `.`), `generate_id`, `round_loyalty_point`, `Mutex` |
| `WebFormats` | `web.formats` | `format_value` (int/float/char display), `parse_value` (parse formatted numbers, `,` as decimal) |
| `webAjax` | `web.ajax` | File download via hidden iframe + cookie token polling |

### 10.5 Validation

```javascript
TValidation = {
  isEmail(str)          // Email regex
  isPhone(str)          // Vietnamese phone (0|84|+84 prefix)
  isValidLength(str, max)
  isValidWord(str)
  isValidRegex(str, regex)
}
```

### 10.6 Data Structures

- **VersionableList**: Immutable-ish array wrapper with `_version` tracking (push, pop, shift, map, filter, reduce, sort)
- **VersionableMap**: Key-value store with version tracking (set, get, remove, keys)

### 10.7 OData Helpers

| Function | Mô tả |
|---|---|
| `getOdata(model, key, expand, filter)` | Synchronous OData GET (`$.ajax` async:false) |
| `getErrorMessages(error)` | Extract OData error (nested `innererror` traversal) |

---

## 11. Integrations

### 11.1 Facebook

| API | Endpoints | Mô tả |
|---|---|---|
| **Facebook Graph API** | `/api/facebook-graph/comment`, `conversation`, `livevideo`, `message`, `post`, `user/accounts`, `video/reels` | Proxy qua TPOS server |
| **Facebook Operations** | `/api/facebook/*` (~20 endpoints) | Token management, comments, friends, messages, groups |
| **SDK** | `angularjs-facebook-sdk` module | Login, page management |
| **Live** | `SaleOnline_LiveCampaign` + real-time comments | Bán hàng livestream |

### 11.2 Marketplace

| Platform | API | Chức năng |
|---|---|---|
| **Lazada** | `/api/lazada/getSeller` | Kết nối shop, sync sản phẩm |
| **Shopee** | `/api/shopee/geturlauthorizationshopee` | OAuth authorization |

### 11.3 Payment

| Provider | API | Chức năng |
|---|---|---|
| **VNPay** | `/api/vnpay/createUrlPayment`, `getBanks`, `getCategories` | Thanh toán online |
| **QR Payment** | `FastSaleOrderDisplayQrPaymentModalController` | QR code display |
| **TPayGate** | `TPayGateService` factory | Payment gateway |

### 11.4 Delivery Carriers

| Carrier | Integration |
|---|---|
| **HolaShip** | `DeliveryCarrierCreateShopHolaShipModalController` |
| **GHN (Giao Hàng Nhanh)** | `DeliveryCarrierImportUpdateGHNContractModalController` |
| **ZTO Express** | `FastSaleOrderTrackingOrderZTOModalController` |
| **DHL** | `DHLTrackingModalController` |

### 11.5 Loyalty

| Service | Mô tả |
|---|---|
| `WiLoyaltyTmtService` | WiLoyalty TMT integration |
| `LoyaltyProgramService` | Native loyalty program |

### 11.6 Call Center

| Feature | Controller/Service |
|---|---|
| Cấu hình PBX | `CallCenterConfigController`, `ApplyCallCenterController` |
| Login PBX | `AppLoginPBXController` |
| Open Phone | `OpenPhonePBXController` |
| Service | `callCenterService` |

### 11.7 Zalo

| Service | Mô tả |
|---|---|
| `zaloFactory` | Zalo OA integration |

### 11.8 Omnichannel Chat

| Service | Mô tả |
|---|---|
| `chatomniMultiFactory` | Multi-channel chat (Messenger + Zalo + others) |

### 11.9 Google Charts

| Service | Mô tả |
|---|---|
| `GoogleChartService` | Dashboard charts via Google Charts API |

---

## 12. localStorage Keys

| Key | Mô tả |
|---|---|
| `accessToken` | Bearer JWT token |
| `refreshToken` | Refresh token |
| `ngStorage-UserLogged` | Current user object |
| `ngStorage-routes` | Dynamic route definitions (from server) |
| `ngStorage-navs` | Navigation menu structure |
| `ngStorage-modelSale` / `modelSaleLines` / `modelSaleUOMLines` | Sale order draft |
| `ngStorage-modelFastPurchaseOrder` / `Lines` / `UOMLines` | Purchase order draft |
| `userLogged` | User data (duplicate) |
| `ConfigWiInvoice` | Invoice config |
| `product_latest_id_get_source` / `product_latest_version` | Product cache versioning |
| `tpos_bearer_token` | Default TPOS token |
| `bearer_token_data_${companyId}` | Per-company token |

---

## Tổng kết

| Metric | Giá trị |
|---|---|
| **Tổng Controllers** | 419 |
| **Tổng Services/Factories** | 138 |
| **Tổng Directives** | 36 |
| **Tổng OData Entities** | 107 |
| **Tổng OData Actions** | 31 methods |
| **Tổng REST/Custom APIs** | 80+ endpoints |
| **Tổng Filters** | 12 |
| **Pages/URLs** | 72+ (from tposUrl.md) |
| **Real-time Events** | 5 types (Socket.IO) |
| **Integrations** | Facebook, Lazada, Shopee, VNPay, HolaShip, GHN, ZTO, DHL, Zalo, Google Charts, Call Center (PBX) |
| **Source Code Size** | ~2.9 MB (JS only, minified) |
