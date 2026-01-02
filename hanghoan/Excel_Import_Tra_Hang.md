# Excel Import for Trả Hàng - Implementation Plan

## Problem Description

Thêm tính năng **Import Excel** và **Fetch từ TPOS API** vào tab "Trả Hàng" (`trahang.js`):
- **Khi vào trang**: Load dữ liệu từ PostgreSQL
- **Nút Fetch TPOS**: Lấy dữ liệu mới từ TPOS API, check trùng, lưu vào PostgreSQL
- **Nút Import Excel**: Import từ file Excel vào PostgreSQL

---

## Proposed Changes

### 1. Database Schema (Render.com PostgreSQL)

#### [NEW] [create_return_orders.sql](file:///Users/mac/Downloads/n2store/render.com/migrations/create_return_orders.sql)

Tạo bảng `return_orders` để lưu dữ liệu trả hàng:

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `customer_name` | VARCHAR(255) | Tên khách hàng |
| `phone` | VARCHAR(20) | SĐT khách |
| `invoice_number` | VARCHAR(100) | Số hóa đơn |
| `reference` | VARCHAR(100) | Mã tham chiếu |
| `total_amount` | DECIMAL(15,2) | Tổng tiền |
| `remaining_debt` | DECIMAL(15,2) | Còn nợ |
| `status` | VARCHAR(50) | Trạng thái |
| `return_reason` | TEXT | Lý do trả |
| `invoice_date` | TIMESTAMP | Ngày hóa đơn |
| `is_returned` | BOOLEAN | Đã trả hàng? |
| `created_at` | TIMESTAMP | Ngày tạo |

---

### 2. API Route

#### [NEW] [return-orders.js](file:///Users/mac/Downloads/n2store/render.com/routes/return-orders.js)

API endpoints:
- `GET /api/return-orders` - List with pagination
- `POST /api/return-orders/batch` - Batch import từ Excel
- `PUT /api/return-orders/:id` - Update (đánh dấu đã trả)
- `DELETE /api/return-orders/:id` - Delete

---

### 3. Frontend Changes

#### [MODIFY] [index.html](file:///Users/mac/Downloads/n2store/hanghoan/index.html)

- Thêm thư viện XLSX (SheetJS)
- Thêm các nút: **Fetch TPOS**, **Import Excel**, **Tải mẫu**

```html
<div class="card-actions">
    <button class="btn btn-primary" id="btnFetchTpos">
        <i data-lucide="refresh-cw"></i> Fetch TPOS
    </button>
    <button class="btn btn-outline" id="btnImportExcel">
        <i data-lucide="upload"></i> Import Excel
    </button>
    <button class="btn btn-outline" id="btnDownloadTemplate">
        <i data-lucide="file-spreadsheet"></i> Tải mẫu
    </button>
    <input type="file" id="excelFileInput" accept=".xlsx,.xls" hidden>
</div>
```

#### [MODIFY] [trahang.js](file:///Users/mac/Downloads/n2store/hanghoan/trahang.js)

**Thay đổi luồng chính:**
- `init()` → Load từ PostgreSQL (thay vì TPOS API)
- Nút **Fetch TPOS** → Gọi TPOS API, check trùng theo `invoice_number`, lưu PostgreSQL

**Thêm functions:**
- `loadFromDatabase()` - Load từ PostgreSQL khi vào trang
- `fetchAndSaveFromTpos()` - Fetch TPOS + lưu PostgreSQL (check trùng)
- `handleExcelImport()` - Parse Excel + lưu PostgreSQL
- `saveReturnStatus(id, isReturned)` - Lưu checkbox "Đã trả hàng"

---

### 4. TPOS API Reference

```javascript
// Fetch refund orders từ TPOS
fetch("https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetView?$top=50&$orderby=DateInvoice+desc&$filter=(Type+eq+'refund'+and+DateInvoice+ge+2025-12-01T17:00:00%2B00:00+and+DateInvoice+le+2026-01-02T16:59:59%2B00:00+and+IsMergeCancel+ne+true)&$count=true", {
  "headers": {
    "accept": "application/json",
    "authorization": "Bearer <TOKEN>"
  },
  "method": "GET"
});
```

---

### 5. Documentation

#### [NEW] [EXCEL_IMPORT_GUIDE.md](file:///Users/mac/Downloads/n2store/hanghoan/EXCEL_IMPORT_GUIDE.md)

Hướng dẫn sử dụng tính năng import Excel tiếng Việt.

---

## Excel Template Format

| Tên khách hàng | SĐT | Số HĐ | Tham chiếu | Tổng tiền | Còn nợ | Trạng thái | Lý do trả | Ngày HĐ |
|----------------|-----|-------|------------|-----------|--------|------------|-----------|---------|
| Nguyễn Văn A | 0901234567 | HD001 | REF001 | 500000 | 0 | Đã xác nhận | Hàng lỗi | 2026-01-01 |

---

## Verification Plan

### 1. API Testing (cURL)

```bash
# Test list
curl https://n2store-fallback.onrender.com/api/return-orders

# Test batch upsert (check trùng theo invoice_number)
curl -X POST https://n2store-fallback.onrender.com/api/return-orders/batch \
  -H "Content-Type: application/json" \
  -d '{"orders": [{"invoice_number": "HD001", "customer_name": "Test", "phone": "0901234567", "total_amount": 100000}]}'
```

### 2. Manual Testing

1. Mở `/hanghoan/index.html` → Tab "Trả Hàng"
2. **Auto-load** từ PostgreSQL khi vào trang
3. Click **Fetch TPOS** → Lấy data mới, check trùng, lưu PostgreSQL
4. Click **Import Excel** → Chọn file, lưu PostgreSQL
5. Tick **"Đã trả hàng"** → Kiểm tra lưu thành công

### 3. Duplicate Check Logic

```sql
-- Upsert: Insert if new, skip if exists (by invoice_number)
INSERT INTO return_orders (...) VALUES (...)
ON CONFLICT (invoice_number) DO NOTHING;
```

---

## Notes

- **Primary key cho duplicate check**: `invoice_number` (Số HĐ)
- SheetJS library đã có trong project
- Token lấy từ `tokenManager.getToken()`
