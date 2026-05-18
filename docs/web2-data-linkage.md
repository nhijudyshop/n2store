# Web 2.0 — Cross-page data linkage audit

> Map của các "luồng dữ liệu" giữa các trang Web 2.0 + những chỗ user cần để ý khi data thay đổi (ví dụ thêm hãng giao hàng → Tạo PBH tự cập nhật).

## Bảng tổng

| Trang                                        | Backend table                                      | Liên kết sang trang nào                                         | Chiều                               |
| -------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| `tpos-pancake/` (comments)                   | `native_orders` (qua `POST /from-comment`)         | `native-orders/` (list)                                         | one-way: tạo                        |
| `native-orders/` (list NW)                   | `native_orders` + `customers` (link `customer_id`) | `web2/fastsaleorder-invoice/` (PBH), `web2/customer-360/` modal | one-way: convert + view             |
| `web2/fastsaleorder-invoice/` (PBH)          | `fast_sale_orders`                                 | `web2/fastsaleorder-delivery/`, `web2/fastsaleorder-refund/`    | one-way: tạo phiếu giao + phiếu trả |
| `web2/fastsaleorder-delivery/` (Phiếu giao)  | `delivery_invoices`                                | (terminal)                                                      | —                                   |
| `web2/fastsaleorder-refund/` (Phiếu trả)     | `refunds`                                          | (terminal)                                                      | —                                   |
| `web2/delivery-carrier/` (Đối tác giao hàng) | `web2_records [entity=deliverycarrier]`            | **Tạo PBH dropdown** (`native-orders/createPbh`)                | one-way: cấu hình                   |
| `web2/report-revenue/` (Báo cáo doanh thu)   | đọc `fast_sale_orders` + `customers`               | (read-only)                                                     | —                                   |
| `web2/products/` (Kho SP)                    | `web2_records [entity=web2product]`                | (chưa link vào order tạo)                                       | —                                   |
| Các trang `web2/<entity>/` còn lại           | `web2_records [entity=...]` chung                  | (độc lập, CRUD generic)                                         | —                                   |

## Luồng dữ liệu chính

### 1. Comment → Đơn Web → PBH → Phiếu giao/trả

```
tpos-pancake          POST /api/native-orders/from-comment
   click "Tạo đơn"          ↓
       │                native_orders (NW-YYYYMMDD-XXXX)
       │                + auto-link customer_id (phone match)
       │                + auto-upsert customers (FB data)
       ▼
native-orders/         /api/native-orders/load
   bảng list           ─────────────────────
       │
       │ click "Tạo PBH" → POST /api/fast-sale-orders/from-native-order
       ▼
web2/fastsaleorder-invoice/  /api/fast-sale-orders/load
   bảng PBH                  ───────────────────────
       │
       ├─ click "Phiếu giao" → POST /api/delivery-invoices/from-pbh ──→ web2/fastsaleorder-delivery/
       └─ click "Phiếu trả"  → POST /api/refunds/from-pbh           ──→ web2/fastsaleorder-refund/
```

**Realtime**: mọi step có WS event `native_order:created` / `pbh:created` / `pbh:state-changed` / `delivery:created` / `refund:created` qua `web2/shared/pbh-realtime.js` — các trang list tự reload khi nhận event.

### 2. Customer 360 (Phase 12)

```
customers (Customer 360 master)
   │
   ├── native_orders.customer_id  (linked on insert + PATCH phone)
   └── fast_sale_orders.customer_id  (inherited from NW + linked on insert/PATCH)

GET /api/v2/customers/:id/orders
   ─→ Aggregates BOTH native_orders + fast_sale_orders for the customer
   ─→ Used by:
        • native-orders → click 👤 row button → mini modal
        • PBH → click 👤 row button → mini modal
        • report-revenue → "Top khách hàng 360°" panel → mini modal
```

### 3. Delivery carrier (Phase 17 — newly wired)

```
web2/delivery-carrier/ (CRUD page)
   │  data.fee, data.keywords[], data.manual, data.isFallback
   │
   ▼
web2_records [entity_slug='deliverycarrier']
   │
   ▼
GET /api/web2/deliverycarrier/list
   │
   ▼
web2/shared/delivery-method-picker.js
   • getOptionsAsync() — fetches list once, caches in module
   • pick(address, options) — keyword-match by address
   │
   ▼
native-orders/createPbh + bulkCreatePbh
   • Dropdown options = backend records
   • Auto-pick by customer address
   • Fallback to hardcoded OPTIONS if API fails
```

**Single source of truth**: nay admin có thể vào `web2/delivery-carrier/` edit fee/keywords → Tạo PBH popup tự update ngay (không cần redeploy code).

## Field mapping per linkage

### NW → PBH conversion

Source: `POST /api/fast-sale-orders/from-native-order`

| Trường source (native_orders)                            | Trường đích (fast_sale_orders)                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `customer_name`                                          | `partner_name`                                                                                                                  |
| `phone`                                                  | `partner_phone`                                                                                                                 |
| `address`                                                | `partner_address`                                                                                                               |
| `email`                                                  | `partner_email`                                                                                                                 |
| `city_code/name`, `district_code/name`, `ward_code/name` | tương ứng                                                                                                                       |
| `partner_id`, `partner_code`                             | tương ứng                                                                                                                       |
| `products[]`                                             | `order_lines[]` (mapped shape: position, productId, productCode, productName, uomId, uomName, quantity, priceUnit, discount, …) |
| `deposit`                                                | `deposit`                                                                                                                       |
| `live_campaign_id/name`                                  | `live_campaign_id/name`                                                                                                         |
| `warehouse_id/name`                                      | `warehouse_id/name`                                                                                                             |
| `company_id/name`                                        | `company_id/name`                                                                                                               |
| `crm_team_id`                                            | `crm_team_id`                                                                                                                   |
| `assigned_employee_id/name`                              | `assigned_user_id/name`                                                                                                         |
| `note`                                                   | `comment`                                                                                                                       |
| `tags[]`                                                 | `tags[]`                                                                                                                        |
| **`customer_id`**                                        | **`customer_id`** (inherit + fallback phone lookup)                                                                             |
| (new at convert)                                         | `source_type='native_order', source_id, source_code`                                                                            |

### PBH → Phiếu giao conversion

Source: `POST /api/delivery-invoices/from-pbh`

| PBH                                                               | Delivery                               |
| ----------------------------------------------------------------- | -------------------------------------- |
| `number`                                                          | `fso.number` (cross-ref)               |
| `partner.*`                                                       | `partner.*`                            |
| `address_detail`                                                  | `partner.address` + city/district/ward |
| `total_quantity`                                                  | `total_quantity`                       |
| `delivery_price`, `cash_on_delivery`, `carrier_*`, `tracking_ref` | tương ứng                              |
| `state`                                                           | (delivery starts at `'pending'`)       |

### PBH → Phiếu trả conversion

Source: `POST /api/refunds/from-pbh`

| PBH              | Refund                                     |
| ---------------- | ------------------------------------------ |
| `number`         | `fso.number` (cross-ref)                   |
| `partner.*`      | `partner.*`                                |
| `total_quantity` | `total_quantity`                           |
| `amount_total`   | `amount_refund`                            |
| (new)            | `reason` (user input)                      |
| (new)            | `refund_mode` ('cash'/'wallet'/'exchange') |
| `state`          | starts at `'draft'`                        |

## Customer auto-upsert (Phase 17)

Mỗi khi `POST /api/native-orders/from-comment` insert đơn, backend chạy `upsertCustomerFromOrder` background (non-blocking):

| Trường nguồn (order)        | Action vào `customers`                                        |
| --------------------------- | ------------------------------------------------------------- |
| `phone`                     | match → fill missing fb_id/name/address; else create          |
| `customerName / fbUserName` | dùng nếu customer mới chưa có name                            |
| `fbUserId`                  | match riêng (nếu phone không match) → fill phone; else create |
| `fbPageId`                  | lưu vào `pancake_data.fb_page_id`                             |
| `address`                   | fill nếu customer chưa có                                     |
| `email`                     | fill nếu customer chưa có                                     |

Sau upsert: nếu order chưa có `customer_id` → UPDATE backfill.

## Test customer mặc định (per CLAUDE.md memory)

- **Huỳnh Thành Đạt — `0123456788`** (đã có sẵn trong DB) — dùng cho mọi write-test ở chat/sale/PBH/gửi tin nhắn
- Cần nhiều khách giả khác → SĐT `0900000000`, `0900000001`, …
- Mã đơn test → prefix `TEST-` để filter cleanup
- KHÔNG dùng SĐT/order ID khách thật trong write tests

## Tổng hợp các trang còn "rời"

Các trang trong `web2/` chưa link vào order/PBH flow (vẫn standalone CRUD qua `web2_records`):

- `web2/sales-channel/` (Kênh bán)
- `web2/account-thu/` / `account-payment-thu/` / `account-payment-change/` (Sổ quỹ)
- `web2/partner-category/` (Nhóm khách)
- `web2/product-category/` / `product-attribute-value/` / `product-uom/` / `product-uom-categ/` (Danh mục SP)
- `web2/promotion-program/` / `offer-program/` (Khuyến mãi)
- `web2/mail-template/` / `ir-mailserver/` (Email)
- `web2/sale-quotation/` (Báo giá)
- `web2/application-user/` (User app)
- `web2/configs-advanced/` (Cấu hình)
- … (~70+ trang TPOS-clone khác)

**Định hướng tương lai**: khi cần liên kết một entity standalone vào order/PBH (vd "Kênh bán" → assign vào order), pattern dùng:

1. Order/PBH thêm cột FK: `entity_code VARCHAR(100)`
2. UI có dropdown load từ `/api/web2/<entity>/list`
3. Backend handler đọc + lưu code (không phải embed toàn bộ payload — preserve normalization)
