# TPOS API Integration Documentation

Tài liệu chi tiết về toàn bộ tương tác giữa N2Store và TPOS (tomato.tpos.vn).

---

## 1. Architecture

```
Browser ──→ Cloudflare Worker (proxy) ──→ TPOS API (tomato.tpos.vn)
               ↕                              ↕
          Render Server (fallback)      WebSocket (rt-2.tpos.app)
               ↕
          PostgreSQL + Firebase
```

**Proxy URL**: `https://chatomni-proxy.nhijudyshop.workers.dev`
**TPOS Direct URL**: `https://tomato.tpos.vn`
**TPOS OData Base**: `https://tomato.tpos.vn/odata`
**TPOS REST Base**: `https://tomato.tpos.vn/rest`

### Quy tắc proxy

| HTTP Method | Timeout | Retry | Lý do |
|---|---|---|---|
| GET, DELETE | 15s | 3 lần (exponential backoff) | Idempotent, an toàn retry |
| POST, PUT, PATCH | 60s | Không retry | Tránh duplicate data |

### Files chính

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

---

## 2. Authentication

### 2.1 Token Endpoint

```
POST /api/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username={user}&password={pass}&client_id=tmtWebApp
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3599,
  "refresh_token": "abc123..."
}
```

### 2.2 Per-Company Credentials

| CompanyId | Username | Password | Client ID |
|---|---|---|---|
| 1 (NJD Live) | nvktlive1 | Aa@28612345678 | tmtWebApp |
| 2 (NJD Shop) | nvktshop1 | Aa@28612345678 | tmtWebApp |

### 2.3 Per-User Credentials (Database)

Table `tpos_credentials` lưu tài khoản TPOS cho từng user:

| App User | TPOS Username | Company |
|---|---|---|
| admin | nvkt | 1 |
| hanh | nv07 | 1 |
| coi | nvv09 | 1 |
| huyen | nv08 | 1 |
| bobo | NV01 | 1 |
| my | my | 1 |
| lai | nv05 | 1 |

### 2.4 Token Management Flow

```
1. Check localStorage cache (key: tpos_bearer_token)
2. If expired (5-min buffer), refresh via proxy → /api/token
3. Cache new token to localStorage + Firebase RTDB (tokens/tpos_bearer)
4. On 401 response → auto-refresh and retry once
```

**Storage keys:**
- `tpos_bearer_token` - Default token
- `bearer_token_data_${companyId}` - Per-company token
- Firebase RTDB: `tokens/tpos_bearer`, `tokens/tpos_token_${companyId}`

### 2.5 Headers chuẩn

```javascript
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {token}',
  'tposappversion': '6.2.6.1',  // Dynamic, learned from TPOS responses
  'feature-version': '2',
  'x-tpos-lang': 'vi'
}
```

---

## 3. Product APIs

### 3.1 Product Template (danh sách sản phẩm)

```
GET /api/odata/ProductTemplate/ODataService.GetViewV2
  ?Active=true
  &$top=50&$skip=0
  &$count=true
  &$orderby=DateCreated desc
```

**Response fields:** Id, Name, NameGet, DefaultCode, Barcode, ListPrice, PurchasePrice, QtyAvailable, VirtualAvailable, CategCompleteName, ImageUrl, UOMId, UOMName, Active, DateCreated

### 3.2 Product Variant (chi tiết sản phẩm)

```
GET /api/odata/Product/OdataService.GetViewV2
  ?Active=true
  &$filter=contains(DefaultCode,'{code}')
  &$top=1
  &$orderby=DateCreated desc
```

### 3.3 Product Search

```
GET /api/odata/Product
  ?$filter=Active eq true and (contains(NameGet,'{query}') or contains(DefaultCode,'{query}') or contains(Barcode,'{query}'))
  &$expand=UOM,Categ,UOMPO,AttributeValues
  &$top=20
```

### 3.4 Export Product Excel

```
POST /api/Product/ExportProductV2?Active=true
Authorization: Bearer {token}
→ Returns: Binary XLSX file
```

```
POST /api/Product/ExportFileWithStandardPriceV2
→ Returns: Binary XLSX file with standard prices
```

### 3.5 Modules sử dụng

| Module | File | API dùng |
|---|---|---|
| Product Warehouse | `product-warehouse/js/main.js` | ProductTemplate/GetViewV2 |
| Purchase Orders | `purchase-orders/js/lib/tpos-search.js` | Product/GetViewV2 |
| Orders Report | `orders-report/js/managers/product-search-manager.js` | ExportFileWithVariantPrice |

---

## 4. Partner / Supplier APIs

### 4.1 Create Partner (Supplier)

```
POST /api/odata/Partner
{
  "Id": 0,
  "Name": "Tên NCC",
  "Ref": "MÃ_NCC",
  "Supplier": true,
  "Customer": false,
  "Active": true,
  "CompanyId": 1,
  "Type": "contact",
  "AccountPayable": { "Id": 4, "Code": "331", "Name": "Phải trả người bán" },
  "AccountReceivable": { "Id": 1, "Code": "131", "Name": "Phải thu của khách hàng" },
  "StockCustomer": { "Id": 9 },
  "StockSupplier": { "Id": 8 }
}
```

### 4.2 Search Partner

```
GET /api/odata/Partner/ODataService.GetViewV2
  ?Type=Customer&Active=true&Phone={phone}
```

```
GET /api/odata/Partner
  ?$filter=Supplier eq true and Active eq true
  &$top=200
  &$orderby=Name asc
```

### 4.3 Partner Revenue

```
GET /api/partner/GetPartnerRevenueById?id={partnerId}&supplier=true
→ { RevenueBegan, Revenue, RevenueTotal }
```

### 4.4 Modules sử dụng

| Module | File |
|---|---|
| Supplier Debt | `supplier-debt/js/main.js` |
| Render Customer Service | `render.com/services/tpos-customer-service.js` |
| Orders Report | `orders-report/js/tab1/` |

---

## 5. Purchase Order APIs (FastPurchaseOrder)

### 5.1 Create Purchase Order

```
POST /api/odata/FastPurchaseOrder
{
  "Id": 0,
  "Type": "invoice",        // "invoice" = nhập hàng, "refund" = trả hàng
  "State": "draft",
  "DateInvoice": "2026-04-02T12:00:00+07:00",
  "PartnerId": 12345,
  "CompanyId": 1,
  "JournalId": 4,
  "AccountId": 4,
  "PickingTypeId": 1,
  "PaymentJournalId": 1,
  "AmountTotal": 275000,
  "DecreaseAmount": 0,       // Chiết khấu
  "CostsIncurred": 0,        // Cước phí
  "PaymentAmount": 0,
  "FormAction": "SaveAndPrint",  // hoặc "Save"
  "Note": "",
  "OrderLines": [
    {
      "ProductId": 148018,
      "ProductQty": 1,
      "PriceUnit": 280000,
      "PriceSubTotal": 280000,
      "ProductUOMId": 1,
      "Type": "refund",       // Nếu là trả hàng
      "AccountId": 4
    }
  ],
  "Partner": { ... },
  "Company": { ... },
  "Journal": { ... },
  "PickingType": { ... },
  "Account": { ... },
  "PaymentJournal": { ... },
  "User": { ... }
}
```

### 5.2 Static Config per Company

| Field | Company 1 (NJD Live) | Company 2 (NJD Shop) |
|---|---|---|
| JournalId | 4 | 11 |
| AccountId | 4 | 32 |
| PickingTypeId | 1 | 5 |
| PaymentJournalId | 1 | 8 |

### 5.3 Get Purchase Order Detail

```
GET /api/odata/FastPurchaseOrder({id})
  ?$expand=Partner,PickingType,Company,Journal,Account,User,RefundOrder,PaymentJournal,Tax,OrderLines($expand=Product,ProductUOM,Account),DestConvertCurrencyUnit
```

### 5.4 Purchase By Excel (2-step flow)

```
Step 1: POST /api/odata/FastPurchaseOrderLine/ODataService.PurchaseByExcel
  Body: { file: base64, partnerId, ... }
  → Returns: OrderLines array

Step 2: POST /api/odata/FastPurchaseOrder
  Body: { ...header, OrderLines: [from step 1] }
```

### 5.5 Get Purchase Order History

```
GET /api/odata/FastPurchaseOrder/OdataService.GetView
  ?$filter=DateInvoice ge '{startISO}' and DateInvoice le '{endISO}'
  &$expand=Partner,OrderLines($expand=Product,ProductUOM)
  &$orderby=DateInvoice desc
  &$top=50&$skip=0
  &$count=true
```

### 5.6 Barcode Label

```
POST /api/odata/BarcodeProductLabel
  Body: { ProductId, Quantity, ... }

GET /api/BarcodeProductLabel/PrintBarcodePDF?ids={labelId}
  → Returns: PDF binary
```

### 5.7 Files

| Module | File |
|---|---|
| PO Creator | `purchase-orders/js/lib/tpos-purchase.js` |
| PO History | `purchase-orders/js/history-tab.js` |
| Product Search | `purchase-orders/js/lib/tpos-search.js` |
| Supplier Debt (detail) | `supplier-debt/js/main.js` |

---

## 6. Sale Order APIs (FastSaleOrder / SaleOnline_Order)

### 6.1 Get Sale Online Orders

```
GET /api/odata/SaleOnline_Order/ODataService.GetViewV2
  ?$filter=DateCreated ge '{startISO}' and DateCreated le '{endISO}'
  &$expand=OrderLines($expand=Product),Partner,SaleOnline_Facebook_UserInfos,CreatedBy
  &$orderby=DateCreated desc
  &$top=500
```

### 6.2 Get Fast Sale Orders

```
GET /api/odata/FastSaleOrder/ODataService.GetView
  ?$expand=OrderLines($expand=Product),Partner
  &$orderby=DateInvoice desc
  &$top=100
```

### 6.3 Update Order

```
PATCH /api/odata/SaleOnline_Order({orderId})/ODataService.UpdateV2
{
  "Note": "ghi chú",
  "StatusText": "Đã xác nhận",
  "ReceiverName": "...",
  "ReceiverPhone": "...",
  "ReceiverAddress": "..."
}
```

### 6.4 Import Orders

```
POST /api/odata/SaleOnline_Order/ODataService.ActionImportSimple
  Body: { data: [...] }
```

### 6.5 Modules sử dụng

| Module | Files |
|---|---|
| Orders Report | `orders-report/js/tab1/tab1-fast-sale.js`, `tab1-edit-modal.js`, `tab1-search.js` |
| TPOS-Pancake | `tpos-pancake/js/tpos-chat.js` |

---

## 7. Sale Refund Flow (5-Step)

Áp dụng cho: FastSaleOrder (bán hàng) refund.

### Step 1: Create Refund

```
POST /api/odata/FastSaleOrder/ODataService.ActionRefund
Body: { "id": {originalOrderId} }
→ { "value": {refundOrderId} }
```

### Step 2: Get Refund Details

```
GET /api/odata/FastSaleOrder({refundOrderId})
  ?$expand=Partner,User,Warehouse,Company,PriceList,RefundOrder,Account,Journal,
           PaymentJournal,Carrier,Tax,SaleOrder,HistoryDeliveryDetails,
           OrderLines($expand=Product,ProductUOM,Account,SaleLine,User),
           Ship_ServiceExtras,OutstandingInfo($expand=Content),Team,
           OfferAmountDetails,DestConvertCurrencyUnit,PackageImages
```

### Step 3: PUT Update (Save & Print)

```
PUT /api/odata/FastSaleOrder({refundOrderId})
Body: { ...fullDetailsFromStep2, FormAction: "SaveAndPrint" }
```

**QUAN TRỌNG**: Phải gửi toàn bộ nested objects (Partner, OrderLines, Company, etc.)

### Step 4: Confirm

```
POST /api/odata/FastSaleOrder/ODataService.ActionInvoiceOpenV2
Body: { "ids": [{refundOrderId}] }
→ State: "draft" → "open", Number: "RINV/2026/XXXX"
```

### Step 5: Print

```
GET https://tomato.tpos.vn/fastsaleorder/PrintRefund/{refundOrderId}
Authorization: Bearer {token}
→ Returns: HTML bill content (gọi trực tiếp TPOS, không qua proxy)
```

### Partial Refund

Giữa Step 2 và Step 3, filter `OrderLines` để chỉ giữ sản phẩm cần hoàn:
```javascript
refundDetails.OrderLines = originalLines.filter(line => productsToRefund.includes(line.ProductId));
// Recalculate: AmountTotal, AmountUntaxed, TotalQuantity
```

### Files

| File | Chức năng |
|---|---|
| `shared/js/api-service.js` (line 774-1050) | `processRefund()` - 5-step flow |
| `issue-tracking/REFUND-FLOW.md` | Documentation |
| `hanghoan/js/trahang.js` | Export refund Excel |

---

## 8. Payment APIs

### 8.1 Create Payment

```
POST /api/odata/AccountPayment
{
  "PartnerId": 12345,
  "PartnerType": "supplier",
  "PaymentType": "outbound",    // outbound = trả NCC, inbound = thu KH
  "Amount": 500000,
  "PaymentDate": "2026-04-02T00:00:00",
  "Communication": "Thanh toán NCC B28",
  "JournalId": 1,               // Cash or Bank journal
  "Journal": { "Id": 1, "Name": "Tiền mặt", "Type": "cash" },
  "Partner": { ... },
  "CompanyId": 1,
  "CurrencyId": 1
}
```

### 8.2 Confirm Payment

```
POST /api/odata/AccountPayment/ODataService.ActionPost
Body: { "id": {paymentId} }
→ State: "draft" → "posted"
```

### 8.3 Cancel Payment

```
POST /api/odata/AccountPayment/ODataService.ActionCancel
Body: { "id": {paymentId} }
```

### 8.4 Delete Payment

```
DELETE /api/odata/AccountPayment({paymentId})
```

### 8.5 List Payments

```
GET /api/odata/AccountPayment/OdataService.GetAccountPaymentList
  ?partnerType=supplier
  &$top=50
  &$orderby=PaymentDate desc
  &$filter=contains(PartnerDisplayName,'{name}')
  &$count=true
```

### 8.6 Payment Methods

```
GET /api/odata/AccountJournal
  ?$filter=Type eq 'cash' or Type eq 'bank'
→ [ { Id: 1, Name: "Tiền mặt", Type: "cash" }, { Id: 2, Name: "Ngân hàng", Type: "bank" } ]
```

### Files: `supplier-debt/js/main.js`

---

## 9. Report APIs

### 9.1 Supplier Debt Report

```
GET /api/odata/Report/PartnerDebtReport
  ?Display=all               // "all" hoặc "endnonzero"
  &DateFrom={ISO}&DateTo={ISO}
  &ResultSelection=supplier
  &$top=1000&$skip=0
  &$count=true
  &$orderby=Code asc
→ [ { Code, Name, PartnerId, Debit, Credit, End } ]
```

### 9.2 Supplier Debt Detail (Transactions)

```
GET /api/odata/Report/PartnerDebtReportDetail
  ?ResultSelection=supplier
  &PartnerId={id}
  &DateFrom={ISO}&DateTo={ISO}
  &$top=50&$skip=0
  &$count=true
  &$orderby=Date asc
→ [ { Date, Name, MoveName, Begin, Debit, Credit, End } ]
```

### 9.3 Supplier Invoices

```
GET /api/odata/AccountInvoice/ODataService.GetInvoicePartner
  ?partnerId={id}
  &$filter=PartnerId eq {id}
  &$orderby=DateInvoice desc
  &$top=50&$count=true
→ [ { Id, Number, DateInvoice, Type, StateFast, AmountTotal } ]
```

### 9.4 Outstanding Debt Details

```
GET /api/Partner/CreditDebitSupplierDetail
  ?partnerId={id}
  &take=50&skip=0
  &page=1&pageSize=50
→ [ { Date, DisplayedName, AmountResidual } ]
```

### Files: `supplier-debt/js/main.js`

---

## 10. CRM & Campaign APIs

### 10.1 CRM Teams

```
GET /api/odata/CRMTeam/ODataService.GetAllFacebook
  ?$expand=Childs
→ Teams with associated Facebook pages
```

### 10.2 Live Campaigns

```
GET /api/odata/SaleOnline_LiveCampaign
  ?$filter=contains(Name,'{date}')
  &$expand=...
→ Campaign list by date
```

### Files: `tpos-pancake/js/tpos-chat.js`, `orders-report/js/overview-fetch.js`

---

## 11. Real-time WebSocket

### 11.1 TPOS WebSocket

```
URL: wss://rt-2.tpos.app/socket.io/?room=tomato.tpos.vn&EIO=4&transport=websocket
Protocol: Socket.IO v4

Join: 40{"room":"tomato.tpos.vn","token":"{jwt}"}
Events: "on-events" → SaleOnline_Order, SaleOnline_Update
```

### 11.2 Pancake WebSocket

```
URL: wss://pancake.vn/socket/websocket?vsn=2.0.0
Events: pages:new_message, pages:update_conversation
```

### Files: `render.com/server.js` (TposRealtimeClient, RealtimeClient classes)

---

## 12. Cloudflare Worker Routes

| Route | Method | Handler | TPOS Target |
|---|---|---|---|
| `/api/token` | POST | tokenHandler | `tomato.tpos.vn/token` |
| `/api/Product/ExportProductV2` | POST | tposHandler | `tomato.tpos.vn/Product/ExportProductV2` |
| `/api/Product/ExportFileWithStandardPriceV2` | POST | tposHandler | `tomato.tpos.vn/Product/ExportFileWithStandardPriceV2` |
| `/tpos/order/:id/lines` | GET | tposHandler | `FastSaleOrder(id)/OrderLines` |
| `/tpos/order-ref/:ref/lines` | GET | tposHandler | Search by Number → OrderLines |
| `/api/rest/*` | ALL | tposHandler | `tomato.tpos.vn/rest/*` |
| `/api/*` | ALL | tposHandler (catch-all) | `tomato.tpos.vn/*` |

---

## 13. Render Server Routes (TPOS-related)

| Route | Method | TPOS Interaction |
|---|---|---|
| `POST /api/token` | POST | Proxy → `tomato.tpos.vn/token` |
| `ALL /api/odata/*` | ALL | Proxy → `services.tpos.dev/api/odata` |
| `GET /products` | GET | `ProductTemplate/GetViewV2` |
| `GET /facebook/crm-teams` | GET | `CRMTeam/GetAllFacebook` |
| `ALL /api/rest/*` | ALL | Proxy → `tomato.tpos.vn/rest/*` |

---

## 14. Database Tables (TPOS-related)

| Table | Mục đích |
|---|---|
| `tpos_credentials` | Lưu tài khoản TPOS per user per company |
| `realtime_credentials` | JWT token cho WebSocket TPOS + Pancake |
| `invoice_status` | Track phiếu bán hàng (từ FastSaleOrder) |
| `invoice_sent_bills` | Đã gửi bill cho KH chưa |
| `return_orders` | Đơn trả hàng NCC |
| `social_orders` | Đơn hàng từ social (Facebook) |
| `tpos_saved_customers` | KH đã lưu từ TPOS |
| `recent_transfers` | Chuyển khoản ngân hàng (match với KH TPOS) |

---

## 15. OData Query Reference

### Filter Operators

| Operator | Example |
|---|---|
| eq | `$filter=Type eq 'refund'` |
| ne | `$filter=State ne 'cancel'` |
| gt, ge, lt, le | `$filter=DateCreated ge '2026-01-01T00:00:00'` |
| contains | `$filter=contains(Name,'keyword')` |
| startswith | `$filter=startswith(DefaultCode,'B')` |
| and, or | `$filter=Active eq true and Supplier eq true` |

### Expand

```
$expand=Partner,OrderLines($expand=Product,ProductUOM)
```

### Pagination

```
$top=50&$skip=0&$count=true
```

### Order

```
$orderby=DateCreated desc
$orderby=Code asc
```

### Select

```
$select=Id,Code,Name,AmountTotal
```
