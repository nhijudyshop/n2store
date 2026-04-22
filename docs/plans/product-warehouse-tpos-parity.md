<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# Product Warehouse — TPOS Parity Plan

> **Mục tiêu**: đưa `product-warehouse/` đạt parity 1:1 với TPOS `https://tomato.tpos.vn/#/app/producttemplate/list`.
>
> **Ngày khởi tạo**: 2026-04-22
> **Current parity**: ≈55-65% → target 95%+
> **Nguyên tắc**: mọi payload/response phải match TPOS gốc để khi đồng bộ không lệch.

---

## Mục lục

1. [Phase Roadmap](#phase-roadmap)
2. [TPOS Endpoint Reference](#tpos-endpoint-reference) — full payload/response
3. [Feature Specs](#feature-specs) — chi tiết từng feature
4. [Implementation Order](#implementation-order)
5. [Progress Log](#progress-log)

---

## Phase Roadmap

### Phase 1 (P1) — Toolbar cốt lõi ✅
- [x] P0: Fix `allProducts` bug (bulk print)
- [x] P1.1: Thêm SP (modal Create + InsertV2)
- [x] P1.2: Cột Tag + filter theo Tag (via TPOS → template_ids bridge)
- [x] P1.3: Xuất Excel (filtered set → .xlsx, SheetJS CDN)
- [x] P1.4: Nhập Excel (XLSX → batch InsertV2, dry-run preview)
- [x] P1.5: Cập nhật giá từ file (XLSX → batch UpdateV2)

### Phase 2 (P2) — Edit phức tạp ✅
- [x] P2.1: Edit biến thể inline (DefaultCode, Barcode, PriceVariant, Active per variant)
- [x] P2.2: Quản lý thuộc tính (add/edit/remove AttributeLines + regenerate variants cartesian)
- [x] P2.3: Bulk actions dropdown (archive many, activate many, assign tag bulk — add/replace/remove modes, bulk print)

### Phase 3 (P3) — Chức năng nâng cao (partial ✅)
- [x] P3.1: Combo (ComboProducts) — tạo/sửa SP combo với SP con + qty + price
- [x] P3.2: UOM quy đổi (UOMLines) — nhiều cấp ĐVT
- [ ] P3.3: Bảng giá (Product_PriceList) — **SKIP** (hiếm dùng, complex, defer)
- [x] P3.4: StockChangeProductQty — điều chỉnh tồn kho (3 endpoint fallbacks)
- [x] P3.5: ProductSupplierInfo — NCC per SP (với search partner)
- [x] P3.6: GetAuditLogEntity — audit trail (3 endpoint fallbacks)
- [ ] P3.7: Cấu hình giấy in mã vạch (ProductLabelPaper) — **SKIP** (config-level, UI đã có BarcodeLabelDialog)
- [ ] P3.8: Lazada/Shopee sync — **SKIP** (không có API creds)

### Tags picker trong edit modal
- [x] Tag picker hiển thị toàn bộ tag với màu; click để chọn/bỏ chọn; merge vào payload `Tags` khi save.

---

## TPOS Endpoint Reference

### Auth
- **Proxy**: `https://chatomni-proxy.nhijudyshop.workers.dev`
- **Header**: `Authorization: Bearer <token>` (window.tokenManager)
- **Version**: `tposappversion: 6.4.5.2` (auto injected)

### 1. `ProductTemplate/ODataService.GetViewV2` — List
```
GET /api/odata/ProductTemplate/ODataService.GetViewV2
  ?Active=true
  &$top=200&$skip=0&$count=true
  &$orderby=DateCreated desc
  &$filter=contains(Name,'keyword') and CategId eq 2
```
Response `{ "@odata.count": N, "value": [...] }` — key fields: `Id, Name, DefaultCode, NameGet, ListPrice, StandardPrice, PurchasePrice, QtyAvailable, CategId, CategCompleteName, UOMName, Barcode, ImageUrl, Active, DateCreated, Tags`.

### 2. `ProductTemplate(id)?$expand=...` — Detail
Common expands (toàn bộ quan sát trong codebase):
```
$expand=ProductVariants($expand=AttributeValues)
$expand=ProductVariants,UOM,UOMPO,Categ,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ComboProducts,ProductSupplierInfos,AttributeLines,UOMLines($expand=UOM)
```

### 3. `ProductTemplate/ODataService.InsertV2?$expand=ProductVariants,UOM,UOMPO` — Create
Payload đầy đủ (**bản tham chiếu**, xem [tpos-product-creator.js](../../purchase-orders/js/lib/tpos-product-creator.js)):
```json
{
  "Id": 0,
  "Name": "Product Name",
  "Type": "product",
  "ShowType": "Có thể lưu trữ",
  "ListPrice": 50000,
  "DiscountSale": 0,
  "DiscountPurchase": 0,
  "PurchasePrice": 30000,
  "StandardPrice": 25000,
  "SaleOK": true, "PurchaseOK": true, "Active": true,
  "UOMId": 1, "UOMPOId": 1,
  "IsProductVariant": false,
  "DefaultCode": "N4033",
  "CategId": 2,
  "Weight": 0, "Tracking": "none",
  "InvoicePolicy": "order", "PurchaseMethod": "receive",
  "AvailableInPOS": true,
  "Barcode": "N4033",
  "Image": "<base64 no prefix>",
  "UOM": { "Id": 1, "Name": "Cái", "Rounding": 0.001, "Active": true, "Factor": 1, "FactorInv": 1, "UOMType": "reference", "CategoryId": 1, "CategoryName": "Đơn vị" },
  "UOMPO": { /* same */ },
  "Categ": { "Id": 2, "Name": "Có thể bán", "CompleteName": "Có thể bán", "Type": "normal", "IsPos": true },
  "AttributeLines": [],
  "ProductVariants": [],
  "UOMLines": [],
  "ComboProducts": [],
  "ProductSupplierInfos": [],
  "Items": []
}
```
Response: full template + `ProductVariants[].{Id,DefaultCode,Barcode}`.

**Lỗi cần handle**:
- `400` → duplicate code (treat as success in some flows)
- `429` → rate limited (retry 2s, 4s)

### 4. `ProductTemplate(id)/ODataService.UpdateV2` — Update
Minimum payload: `{ "Id": 123456, "Name": "...", "ListPrice": ..., "Image": "<base64>" }`. TPOS accept partial fields as long as `Id` khớp.

### 5. `ProductTemplate/ODataService.ActionImport` — Import Excel
**Chưa có code mẫu trong repo** — cần inspect thực tế hoặc implement **client-side fallback**: đọc XLSX → batch InsertV2 (không dùng TPOS ActionImport).

### 6. `StockChangeProductQty` — Điều chỉnh tồn kho
**Chưa có code mẫu**. Cần inspect TPOS call thực tế. Dự kiến:
```
POST /api/odata/StockChangeProductQty/ODataService.Change
{ "ProductId": <variantId>, "NewQuantity": <qty>, "LocationId": 12 }
```

### 7. `Tag` / `AssignTag` — Gán nhãn
**Chưa có code mẫu**. Dự kiến:
- `GET /api/odata/Tag?$filter=Type eq 'ProductTemplate'` để list tag
- Gán qua `UpdateV2` với field `Tags: [{Id, Name}]` hoặc action riêng.

### 8. `ProductCategory` — Nhóm SP
```
GET /api/odata/ProductCategory?$orderby=CompleteName asc&$top=500
```
Response: `value[].{Id, Name, CompleteName, Type, IsPos}`.

### 9. `ProductUOM` — Đơn vị tính
```
GET /api/odata/ProductUOM?$orderby=Name asc&$top=200
```

### 10. `ProductAttribute` / `ProductAttributeValue` — Thuộc tính
```
GET /api/odata/ProductAttribute?$expand=Values&$orderby=Id asc
```
Response: `value[].{Id, Name, Code, CreateVariant, Values: [{Id, Name, Code, PriceExtra}]}`.

### 11. `GetAuditLogEntity` — Audit log
```
GET /api/odata/AuditLog/ODataService.GetAuditLogEntity(entityId={id},entityType='ProductTemplate')
```
(Suy luận từ docs; cần verify)

### 12. Export Excel
TPOS có endpoint ẩn — chưa identify. **Fallback**: export client-side bằng SheetJS từ data đã load.

### 13. Update price in bulk
Dùng `UpdateV2` cho từng SP hoặc `ProductTemplate/ODataService.UpdateStandPrice`:
```
POST /api/odata/ProductTemplate/ODataService.UpdateStandPrice
{ "Ids": [1,2,3], "StandardPrice": 25000 }
```
(Suy luận — cần verify)

---

## Feature Specs

### P1.1 — Thêm SP (Create Product)

**Entry**: nút "➕ Thêm" ở toolbar, bên trái "Đồng bộ TPOS".

**Modal fields** (bắt buộc *):
- Tên SP *
- Mã SP * (auto-suggest prefix)
- Giá bán *
- Giá mua (default 0)
- Giá vốn (default 0)
- Nhóm SP * (dropdown từ ProductCategory cache)
- Đơn vị * (dropdown từ ProductUOM cache; default "Cái" Id=1)
- POS category (optional)
- Barcode (default = mã SP)
- Ảnh (upload → base64)
- Có biến thể? (toggle) → nếu YES: chọn thuộc tính (Size Chữ/Số/Màu) + values → generate variants
- Active (default true), SaleOK, PurchaseOK, AvailableInPOS

**API flow**:
1. `POST /api/odata/ProductTemplate/ODataService.InsertV2?$expand=ProductVariants,UOM,UOMPO` với payload ở [§3](#tpos-endpoint-reference)
2. Response → gọi `POST /api/v2/web-warehouse/sync?type=incremental` để Render cập nhật ngay
3. Close modal + toast + refresh list

**Error**:
- 400 duplicate code → show inline error "Mã SP đã tồn tại"
- 429 → retry với backoff
- Other → show raw error.message

### P1.2 — Tag column + filter

**Data source**: `ProductTemplate.Tags` (array `{Id, Name, Color}`)

**UI**:
- Cột "Nhãn" → render các tag chip (bg color + name). `null/[]` → "—"
- Filter dropdown mới ở toolbar: "Nhãn" (multi-select) → `$filter=Tags/any(t: t/Id eq N)`
- Cache tag list trong localStorage (refresh 1h).

**API**:
- `GET /api/odata/Tag?$filter=Type eq 'ProductTemplate'&$orderby=Name asc` (tentative — verify)
- List: filter client-side from `Tags` nếu TPOS không support server-side filter.

### P1.3 — Xuất Excel

**Scope**: export the **currently filtered result set** (tối đa 5000 rows để tránh OOM).

**Columns** (match TPOS export):
- Mã, Tên, Nhóm SP, Giá bán, Giá mua, Giá vốn, Số lượng, Đơn vị, Nhãn, Hiệu lực, Ngày tạo, Barcode

**Flow**:
1. Click "📤 Xuất Excel" → nếu total > pageSize, fetch toàn bộ matches (progress modal)
2. Dùng [SheetJS (xlsx.full.min.js)](https://cdn.sheetjs.com/) để generate file
3. Tải về: `san-pham-YYYYMMDD-HHmm.xlsx`

**Library**: load lazy từ CDN khi click.

### P1.4 — Nhập Excel

**Flow**:
1. Click "📥 Nhập từ file" → chọn `.xlsx`
2. Parse → preview bảng (grid) với validation highlight (mã trùng, thiếu field)
3. User confirm → chạy batch `InsertV2` (concurrency=3, delay 200ms)
4. Progress bar + error log
5. Sync Render sau cùng

**Template** download trước để user fill đúng format. Columns: `Mã*, Tên*, Giá bán*, Giá mua, Giá vốn, Nhóm SP*, Đơn vị*, Barcode, Có biến thể? (Y/N), Thuộc tính, Giá trị thuộc tính`.

### P1.5 — Cập nhật giá từ file

**Flow**:
1. Click "💰 Cập nhật giá từ file" → chọn `.xlsx` có cột `Mã*, Giá bán, Giá mua, Giá vốn`
2. Parse → lookup từng mã trong pageProducts / Render search
3. Preview diff (price cũ vs mới) — highlight thay đổi
4. Confirm → batch `UpdateV2` (concurrency=3)
5. Sync Render

**Edge cases**:
- Mã không tồn tại → skip + log
- Giá âm → reject
- Giá giống giá cũ → skip

---

## Implementation Order

Mỗi feature = 1 commit. Push sau mỗi commit.

1. ✅ `[inventory] fix bulk print reference allProducts → pageProducts`
2. `[inventory] feat: Create product modal + InsertV2 payload`
3. `[inventory] feat: Tag column display + filter`
4. `[inventory] feat: Export to XLSX (SheetJS)`
5. `[inventory] feat: Import XLSX with preview + batch InsertV2`
6. `[inventory] feat: Bulk price update from XLSX`
7. `[inventory] docs: Phase 1 complete — update parity plan`

---

## Progress Log

### 2026-04-22
- P0 fix `allProducts` → `pageProducts` shipped.
- Plan doc created.
- Next: P1.1 Create product modal.
