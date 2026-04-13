<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# TPOS FastPurchaseOrder — Phân Tích Toàn Diện

> **Nguồn**: Phân tích trực tiếp từ TPOS v6.4.5.2 (source code JS bundles + live API calls)
>
> **Ngày phân tích**: 2026-04-13

---

## Mục lục

1. [Tổng quan Module](#1-tổng-quan-module)
2. [OData Endpoints & Service Methods](#2-odata-endpoints--service-methods)
3. [Entity Data Model](#3-entity-data-model)
4. [Invoice List (invoicelist)](#4-invoice-list-invoicelist)
5. [Refund List (refundlist)](#5-refund-list-refundlist)
6. [Controllers & UI Logic](#6-controllers--ui-logic)
7. [Actions & Workflow](#7-actions--workflow)
8. [Reports & Excel Export](#8-reports--excel-export)
9. [Print Templates](#9-print-templates)
10. [Integration Points](#10-integration-points-n2store)

---

## 1. Tổng quan Module

| Thông tin | Giá trị |
|-----------|---------|
| URL Invoice List | `#/app/fastpurchaseorder/invoicelist` |
| URL Refund List | `#/app/fastpurchaseorder/refundlist` |
| URL Form (New/Edit) | `#/app/fastpurchaseorder/invoiceform1/:id` |
| URL Refund Form | `#/app/fastpurchaseorder/refundform1/:id` |
| Hotkey | `Alt+M` → mở form tạo phiếu mua hàng |
| Controllers | 7 controllers |
| OData Entity | `FastPurchaseOrder`, `FastPurchaseOrderLine` |
| AngularJS Module | Loaded via dynamic route from `/api/account/layout` |

### Controllers

| Controller | Purpose |
|-----------|---------|
| `FastPurchaseOrderListController` | List/grid phiếu mua hàng (invoicelist) |
| `FastPurchaseOrderRefundModalController` | Modal trả hàng mua (refundlist) |
| `FastPurchaseOrderForm1Controller` | Form tạo/sửa phiếu mua |
| `FastPurchaseOrderLineModalController` | Modal sửa dòng sản phẩm |
| `FastPurchaseOrderImportPurchaseLineModalController` | Import dòng SP từ file |
| `FastPurchaseOrderReportController` | Báo cáo mua hàng tổng |
| `FastPurchaseOrderReportStaffController` | Báo cáo theo nhân viên |
| `FastPurchaseOrderReportSupplierController` | Báo cáo theo NCC |

---

## 2. OData Endpoints & Service Methods

### FastPurchaseOrderService

| Method | HTTP | Endpoint | Mô tả |
|--------|------|----------|-------|
| query | GET | `/odata/FastPurchaseOrder` | Lấy danh sách |
| get | GET | `/odata/FastPurchaseOrder(:key)` | Lấy chi tiết theo ID |
| save | POST | `/odata/FastPurchaseOrder` | Tạo mới |
| update | PUT | `/odata/FastPurchaseOrder(:key)` | Cập nhật |
| remove | DELETE | `/odata/FastPurchaseOrder(:key)` | Xóa |
| getOrderLines | GET | `/odata/FastPurchaseOrder(:key)/OrderLines?$expand=Product,ProductUOM,Account` | Lấy dòng SP |
| getPickings | GET | `/odata/FastPurchaseOrder(:key)/Pickings` | Phiếu nhập kho liên quan |
| getInvoices | GET | `/odata/FastPurchaseOrder(:key)/Invoices` | Hóa đơn liên quan |
| defaultGet | POST | `/odata/FastPurchaseOrder/ODataService.DefaultGet?$expand=Company,PickingType,Journal,User,PaymentJournal,DestConvertCurrencyUnit` | Khởi tạo form |
| actionConfirm | POST | `/odata/FastPurchaseOrder/ODataService.ActionConfirm` | Xác nhận phiếu |
| actionCancel | POST | `/odata/FastPurchaseOrder/ODataService.ActionCancel` | Hủy phiếu |
| actionDraft | POST | `/odata/FastPurchaseOrder/ODataService.ActionDraft` | Chuyển về nháp |
| actionDone | POST | `/odata/FastPurchaseOrder/ODataService.ActionDone` | Hoàn thành |
| actionUnlock | POST | `/odata/FastPurchaseOrder/ODataService.ActionUnlock` | Mở khóa |
| actionInvoiceOpen | POST | `/odata/FastPurchaseOrder/ODataService.ActionInvoiceOpen` | Mở hóa đơn |
| actionInvoiceDraft | POST | `/odata/FastPurchaseOrder/ODataService.ActionInvoiceDraft` | Hóa đơn về nháp |
| actionRefund | POST | `/odata/FastPurchaseOrder/ODataService.ActionRefund` | Tạo trả hàng |
| createRefund | POST | `/odata/FastPurchaseOrder/ODataService.CreateRefund` | Tạo phiếu trả |
| onChangePartner | POST | `/odata/FastPurchaseOrder/ODataService.OnChangePartner?$expand=Account` | Thay đổi NCC |
| onChangePartner_PriceList | POST | `/odata/FastPurchaseOrder/ODataService.OnChangePartner_PriceList?$expand=PartnerInvoice,PartnerShipping,PriceList` | NCC + bảng giá |
| onChangePickingType | GET | `/odata/FastPurchaseOrder/ODataService.OnChangePickingType(pickingTypeId=:id)?$expand=Location,Warehouse` | Thay đổi loại kho |
| makeInvoiceAdvance | POST | `/odata/FastPurchaseOrder/ODataService.MakeInvoiceAdvance` | Tạo hóa đơn tạm ứng |
| makeDelivery | POST | `/odata/FastPurchaseOrder/ODataService.MakeDelivery` | Tạo phiếu giao hàng |
| makeInvoiceDefaultGet | GET | `/odata/FastPurchaseOrder(:key)/ODataService.MakeInvoiceDefaultGet` | Default get cho tạo hóa đơn |
| getPaymentInfoJson | GET | `/odata/FastPurchaseOrder(:key)/ODataService.GetPaymentInfoJson` | Thông tin thanh toán |
| getOutstandingInfo | GET | `/odata/FastPurchaseOrder(:key)/ODataService.GetOutstandingInfo?$expand=Content` | Công nợ chờ |
| assignOutstandingCredit | POST | `/odata/FastPurchaseOrder/ODataService.AssignOutstandingCredit` | Gán công nợ |
| getRegisterPayment | POST | `/odata/FastPurchaseOrder/ODataService.GetRegisterPayment?$expand=Partner` | Lấy form thanh toán |
| getReport | POST | `/odata/FastPurchaseOrder/ODataService.GetReport` | Báo cáo |
| actionRFQSend | POST | `/odata/FastPurchaseOrder/ODataService.ActionRFQSend` | Gửi yêu cầu báo giá |
| unlink | POST | `/odata/FastPurchaseOrder/ODataService.Unlink` | Xóa nhiều |

### FastPurchaseOrderLineService

| Method | HTTP | Endpoint |
|--------|------|----------|
| query | GET | `/odata/FastPurchaseOrderLine` |
| get | GET | `/odata/FastPurchaseOrderLine(:key)` |
| save | POST | `/odata/FastPurchaseOrderLine` |
| update | PUT | `/odata/FastPurchaseOrderLine(:key)` |
| remove | DELETE | `/odata/FastPurchaseOrderLine(:key)` |
| defaultGet | POST | `/odata/FastPurchaseOrderLine/ODataService.DefaultGet` |
| onChangeProduct | POST | `/odata/FastPurchaseOrderLine/ODataService.OnChangeProduct?$expand=ProductUOM,Account` |
| productUOMChange | POST | `/odata/FastPurchaseOrderLine/ODataService.ProductUOMChange` |
| onChangeProductCheckAvailable | POST | `/odata/FastPurchaseOrderLine/ODataService.OnChangeProductCheckAvailable` |
| actionImport | POST | `/odata/FastPurchaseOrderLine/ODataService.ActionImport?$expand=Lines($expand=ProductUOM,Product,InvoiceUOM)` |
| onChangeUOMLine | POST | `/odata/FastPurchaseOrderLine/OdataService.OnChangeUOMLine?$expand=ProductUOM` |
| purchaseByExcel | POST | `/odata/FastPurchaseOrderLine/ODataService.PurchaseByExcel?$expand=OrderLines($expand=ProductUOM,Account,Product)` |

### List View (Read-Only ViewModel)

```
GET /odata/FastPurchaseOrder/OdataService.GetView
  ?$top=20
  &$skip=0
  &$orderby=DateInvoice+desc,Id+desc
  &$filter=(Type eq 'invoice' and DateInvoice ge 2026-03-01T00:00:00+07:00 and DateInvoice le 2026-03-31T23:59:59+07:00)
  &$count=true
```

> **Lưu ý**: `OdataService` (lowercase `d`) khác với `ODataService` (uppercase `D`). GetView dùng lowercase.

---

## 3. Entity Data Model

### View_FastPurchaseOrdersViewModel (List View)

Trả về khi gọi `OdataService.GetView` — dữ liệu gọn, dùng cho danh sách.

```typescript
interface FastPurchaseOrderView {
    Id: number;                    // ID phiếu
    PartnerDisplayName: string;    // "[B21] B21 HUY HẠNH - ( HÀ NỘI )"
    PartnerNameNoSign: string;     // "B21 HUY HANH - ( HA NOI )" (tìm kiếm)
    AmountTotal: number;           // Tổng tiền
    Residual: number;              // Còn lại (= AmountTotal nếu chưa trả)
    State: string;                 // "draft" | "open" | "paid" | "cancel"
    DateInvoice: string;           // ISO datetime
    Number: string;                // "BILL/2026/0665" | "RBILL/2026/0001"
    Type: string;                  // "invoice" | "refund"
    UserName: string;              // Người tạo: "nvkt", "Làì"
    Discount: number;              // % giảm giá
    DiscountAmount: number;        // Tiền giảm giá
    DecreaseAmount: number;        // Giảm trừ
    Origin: string | null;         // Nguồn
    Note: string | null;           // Ghi chú
    AmountTax: number;             // Thuế
    AmountUntaxed: number;         // Tiền trước thuế
    TaxView: string | null;        // Thông tin thuế hiển thị
    CompanyId: number;             // 1 = NJD Live, 2 = NJD Shop
    CompanyName: string;           // "NJD Live"
    UserId: string | null;         // null trên view!
    PartnerId: number | null;      // null trên view!
    CountOrder: number;            // Số đơn liên quan
    ShowState: string;             // "Đã xác nhận", "Nháp", "Hủy bỏ"
    DateCreated: string;           // ISO datetime
    CostsIncurred: number;         // Chi phí phát sinh
    VatInvoiceNumber: string | null; // Số hóa đơn VAT
    ExchangeRate: number;          // Tỷ giá
    DestConvertCurrencyUnitId: number | null;
    Search: string | null;
}
```

### FastPurchaseOrder Entity (Full)

Trả về khi gọi `/odata/FastPurchaseOrder(:key)` — có thêm nhiều fields.

```typescript
interface FastPurchaseOrder extends FastPurchaseOrderView {
    PartnerId: number;             // ID nhà cung cấp (có giá trị!)
    Date: string;
    PickingTypeId: number;
    TotalQuantity: number;
    Amount: number;
    TaxId: number | null;
    JournalId: number;
    RefundOrderId: number | null;
    Reconciled: boolean;
    AccountId: number;
    UserId: string;                // GUID (có giá trị!)
    AmountTotalSigned: number;
    ResidualSigned: number;
    PaymentJournalId: number | null;
    PaymentAmount: number;
    PartnerPhone: string | null;
    Address: string | null;
    CreateByName: string;
    CreateById: string;
    PreviousBalance: number;
    ToPay: number;
    FormAction: string;
    PaymentInfo: any[];
    Error: any;
}
```

### FastPurchaseOrderLine

```typescript
interface FastPurchaseOrderLine {
    Id: number;
    ProductId: number;
    ProductName: string;           // "B21 1203 ĐẦM SMI NGỰA SỌC XANH"
    ProductUOMId: number;
    ProductUOMName: string;        // "Cái"
    ProductQty: number;            // 2.000
    PriceUnit: number;             // 210000.00
    PriceSubTotal: number;         // 420000.00
    PriceTotal: number;            // 420000.00
    PriceRecent: number | null;    // Giá lần trước
    Discount: number;              // % giảm giá
    Discount_Fixed: number;        // Giảm giá cố định
    Factor: number | null;
    Name: string;                  // "[B216] B21 1203 ĐẦM..."
    State: string;                 // "draft"
    AccountId: number;
    PriceSubTotalSigned: number;
    ProductNameGet: string;        // "[B216] B21 1203 ĐẦM..."
    ProductBarcode: string;        // "B216"
    Note: string | null;
    ProductDefaulCode: string | null;
    OrderId: number;               // FK → FastPurchaseOrder.Id
    ConversionPrice: number | null;
}
```

### Product (Expanded from OrderLine)

```typescript
interface Product {
    Id: number;
    EAN13: string | null;
    DefaultCode: string;           // "B216" (= mã SP)
    NameTemplate: string;          // "B21 1203 ĐẦM SMI NGỰA SỌC XANH"
    ProductTmplId: number;         // Product Template ID
    Barcode: string;               // = DefaultCode
    ImageUrl: string;              // Full-size image URL
    Thumbnails: string[];          // [64px, 128px, 256px, 512px]
    PriceVariant: number;          // 320000.00 (giá bán)
    QtyAvailable: number;          // Tồn kho
    VirtualAvailable: number;      // Tồn ảo
    Active: boolean;
    ListPrice: number;
    PurchasePrice: number | null;
    StandardPrice: number;         // Giá vốn
    Type: string;                  // "product" | "consu" | "service"
    DateCreated: string;
    LastUpdated: string;
    SaleOK: boolean;
    PurchaseOK: boolean;
}
```

### ProductUOM

```typescript
interface ProductUOM {
    Id: number;
    Name: string;                  // "Cái"
    Rounding: number;
    Factor: number;
    FactorInv: number;
    UOMType: string;               // "reference"
    CategoryId: number;
    CategoryName: string;          // "Đơn vị"
}
```

### Account

```typescript
interface Account {
    Id: number;
    Name: string;                  // "Giá mua hàng hoá"
    Code: string;                  // "1561"
    UserTypeId: number;
    UserTypeName: string;          // "Current Assets"
    InternalType: string;          // "other"
    Reconcile: boolean;
}
```

---

## 4. Invoice List (invoicelist)

### URL
```
https://tomato.tpos.vn/#/app/fastpurchaseorder/invoicelist
```

### API Query Pattern

```http
GET /odata/FastPurchaseOrder/OdataService.GetView
  ?$top=20
  &$skip=0
  &$orderby=DateInvoice desc, Id desc
  &$filter=(Type eq 'invoice' and DateInvoice ge {startDate} and DateInvoice le {endDate})
  &$count=true
```

### Dữ liệu thực tế

| Thông số | Giá trị |
|----------|---------|
| Tổng phiếu invoice | **762** (tính đến 04/2026) |
| Number format | `BILL/2026/XXXX` |
| States phổ biến | `open` (Đã xác nhận) |
| Pagination | 20 records/page, OData `$top/$skip` |
| Sort default | `DateInvoice desc, Id desc` |

### State Flow (Invoice)

```
draft (Nháp)
  → open (Đã xác nhận)  [ActionConfirm / ActionInvoiceOpen]
  → paid (Đã thanh toán) [khi Residual = 0]
  → cancel (Hủy bỏ)     [ActionCancel]

open → draft             [ActionDraft / ActionInvoiceDraft]
cancel → draft            [ActionDraft]
```

### Filter Options (trên TPOS UI)

- **Thời gian**: DateInvoice range
- **State**: draft / open / paid / cancel
- **NCC**: PartnerId / PartnerDisplayName
- **Nhân viên**: UserName
- **Search**: Tìm theo số phiếu, tên NCC

---

## 5. Refund List (refundlist)

### URL
```
https://tomato.tpos.vn/#/app/fastpurchaseorder/refundlist
```

### API Query Pattern

```http
GET /odata/FastPurchaseOrder/OdataService.GetView
  ?$top=20
  &$skip=0
  &$orderby=DateInvoice desc, Id desc
  &$filter=(Type eq 'refund' and DateInvoice ge {startDate} and DateInvoice le {endDate})
  &$count=true
```

### Dữ liệu thực tế

| Thông số | Giá trị |
|----------|---------|
| Tổng phiếu refund | **20** |
| Number format | `RBILL/2026/XXXX` |
| States | `draft`, `open`, `cancel` |

### Tạo Refund Flow

```
1. Chọn phiếu mua (invoice) cần trả
2. POST ActionRefund → tạo refund draft
3. Sửa số lượng trả, giá
4. POST ActionInvoiceOpen → xác nhận refund
5. (Optional) POST AssignOutstandingCredit → đối trừ công nợ
```

### Refund-specific Fields

| Field | Mô tả |
|-------|-------|
| `RefundOrderId` | ID phiếu mua gốc được trả |
| `Origin` | Số phiếu gốc (e.g., "BILL/2026/0665") |
| `Reconciled` | Đã đối trừ công nợ chưa |

---

## 6. Controllers & UI Logic

### FastPurchaseOrderListController

**Chức năng chính:**
- Hiển thị grid danh sách phiếu mua/trả
- Filter theo thời gian, trạng thái, NCC, nhân viên
- Tìm kiếm (ParterNameNoSign, Number)
- Pagination (20 records/page)
- Actions trên từng dòng: Xem, Sửa, Xóa, In, Export

**UI Components (Kendo UI):**
- `kendo-grid` — Bảng chính
- `kendo-datepicker` — Chọn ngày
- `kendo-combobox` — Chọn NCC, nhân viên
- Toolbar buttons: Tạo mới, Export Excel, In

### FastPurchaseOrderForm1Controller

**Chức năng chính:**
- Tạo mới / sửa phiếu mua hàng
- Chọn NCC → auto-load thông tin (OnChangePartner)
- Thêm dòng SP → tìm SP (OnChangeProduct)
- Giảm giá %, giảm giá tiền, chi phí phát sinh
- Import dòng SP từ Excel (PurchaseByExcel)
- Actions: Lưu nháp, Xác nhận, Hủy, In

**Form Fields:**
- NCC (Partner) — autocomplete
- Ngày hóa đơn (DateInvoice)
- Kho nhận (PickingType → Warehouse)
- Sổ nhật ký (Journal)
- Ghi chú (Note)
- Số hóa đơn VAT (VatInvoiceNumber)
- Tỷ giá (ExchangeRate)

**Line Item Fields:**
- Sản phẩm (Product) — autocomplete
- ĐVT (ProductUOM)
- Số lượng (ProductQty)
- Đơn giá (PriceUnit)
- Giảm giá % (Discount)
- Giảm giá tiền (Discount_Fixed)
- Thành tiền (PriceSubTotal) — auto-calc

---

## 7. Actions & Workflow

### Invoice Workflow

```
                    ┌──────────────┐
                    │   DefaultGet │ ← Khởi tạo form
                    └──────┬───────┘
                           │ POST /odata/FastPurchaseOrder
                           ▼
                    ┌──────────────┐
                    │    draft     │
                    │   (Nháp)    │
                    └──────┬───────┘
                           │ ActionConfirm / ActionInvoiceOpen
                           ▼
                    ┌──────────────┐     ActionCancel
                    │    open      │ ────────────────► cancel
                    │ (Đã xác nhận)│                   (Hủy bỏ)
                    └──────┬───────┘                      │
                           │ Thanh toán                   │ ActionDraft
                           │ (Residual → 0)               │
                           ▼                              ▼
                    ┌──────────────┐               ┌───────────┐
                    │    paid      │               │   draft   │
                    │(Đã thanh toán)│               │  (Nháp)   │
                    └──────────────┘               └───────────┘
```

### Action Payloads

#### ActionConfirm
```json
{
    "ids": [54510]
}
```

#### ActionCancel
```json
{
    "ids": [54510]
}
```

#### ActionRefund (Tạo trả hàng)
```json
{
    "id": 54510,
    "description": "Trả hàng lỗi",
    "date": "2026-04-13T00:00:00+07:00"
}
```

#### OnChangePartner
```json
{
    "model": {
        "PartnerId": 568374,
        "CompanyId": 1,
        "Type": "invoice"
    }
}
```

#### OnChangeProduct (OrderLine)
```json
{
    "model": {
        "ProductId": 150761,
        "OrderId": 54510,
        "ProductQty": 1,
        "PriceUnit": 0,
        "Discount": 0
    }
}
```

---

## 8. Reports & Excel Export

### Report APIs

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/odata/Report/PurchaseReport` | POST | Báo cáo mua hàng chi tiết |
| `/odata/Report/OdataService.GetTotalPurchase` | POST | Tổng mua hàng |
| `/odata/FastPurchaseOrder/ODataService.GetReportPurchaseGeneral` | POST | Báo cáo mua hàng tổng hợp |

### Report Fields

```typescript
interface PurchaseReport {
    Date: string;
    TotalAmountInvoice: number;    // Tổng mua
    TotalAmountRefund: number;     // Tổng trả
    TotalAmount: number;           // Tổng thực
    CountOrder: number;            // Số phiếu
    TotalAmountBeforeCK: number;   // Trước chiết khấu
    TotalCK: number;               // Chiết khấu
    TotalKM: number;               // Khuyến mãi
}
```

### Excel Export Endpoints

| URL | Mô tả |
|-----|-------|
| `/FastPurchaseOrder/ExcelReport` | Export danh sách |
| `/FastPurchaseOrder/ExcelGeneralReport` | Export báo cáo tổng hợp |
| `/FastPurchaseOrder/ExcelProductDetailReport` | Export chi tiết SP |
| `/FastPurchaseOrder/ExportFile` | Export file |
| `/FastPurchaseOrder/ExcelPrint` | Export để in |

### Print Endpoints

| URL | Mô tả |
|-----|-------|
| `/FastPurchaseOrder/Print/{id}` | In phiếu mua |
| `/FastPurchaseOrder/PrintTposInvoice/{id}` | In hóa đơn TPOS |
| `/FastPurchaseOrder/PrintRefund/{id}` | In phiếu trả |
| `/FastPurchaseOrder/PrintTposRefund/{id}` | In hóa đơn trả TPOS |

---

## 9. Print Templates

TPOS hỗ trợ in phiếu qua endpoint `/FastPurchaseOrder/Print/{id}` trả về HTML.

Các mẫu in:
- **Phiếu mua hàng**: Header NCC + bảng SP + tổng tiền
- **Hóa đơn TPOS**: Format chuẩn TPOS
- **Phiếu trả hàng**: Giống phiếu mua nhưng ghi rõ số phiếu gốc
- **Nhãn mã vạch**: In barcode label cho SP nhập

---

## 10. Integration Points (N2Store)

### Hiện tại đang dùng

| Feature | Endpoint | Ghi chú |
|---------|----------|---------|
| Lịch sử mua hàng | `GetView?$filter=(Type eq 'invoice')` | Tab "Lịch sử" |
| Trả hàng NCC | `GetView?$filter=(Type eq 'refund')` | Tab "Trả hàng NCC" |
| Tìm SP | `/odata/FastPurchaseOrderLine/ODataService.OnChangeProduct` | Form modal |
| Tạo phiếu mua | `POST /odata/FastPurchaseOrder` + `ActionConfirm` | Fire-and-forget |
| Import Excel | `PurchaseByExcel` | tpos-purchase.js |

### Có thể khai thác thêm

| Feature | Endpoint | Giá trị |
|---------|----------|---------|
| Thanh toán NCC | `GetRegisterPayment` + `AccountPayment` | Theo dõi công nợ NCC |
| Đối trừ công nợ | `AssignOutstandingCredit` | Auto đối trừ |
| Báo cáo mua | `GetReportPurchaseGeneral` | Dashboard thống kê |
| Công nợ chờ | `GetOutstandingInfo` | Hiển thị nợ NCC |
| In phiếu | `/FastPurchaseOrder/Print/{id}` | Nút in trực tiếp |
| Export Excel | `/FastPurchaseOrder/ExcelReport` | Export báo cáo |
| Giá gần nhất | `PriceRecent` field trên OrderLine | Hiển thị giá mua lần trước |

---

## Appendix: TPOS Header Requirements

Mọi request đến TPOS OData cần headers:

```http
Authorization: Bearer {access_token}
Content-Type: application/json;IEEE754Compatible=false;charset=utf-8
TPOSAppVersion: 6.4.5.2
X-Requested-With: XMLHttpRequest
```

Token lấy từ:
```http
POST https://tomato.tpos.vn/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username=nvkt&password=Aa@123456789&client_id=tmtWebApp
```

**Token expiry**: ~15 ngày (refresh bằng CompanyId switch hoặc re-login).
