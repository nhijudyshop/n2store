# Sổ Order - Daily Supplier Order Log

Ghi nhận và quản lý order hàng từ nhà cung cấp hằng ngày với hỗ trợ ngày nghỉ.

## ✅ Phase 1 - Core Features

### Basic Operations
- ✅ Xem order theo ngày
- ✅ Thêm order mới
- ✅ Sửa order
- ✅ Xóa order
- ✅ Đánh dấu đã thanh toán (checkbox → strikethrough)
- ✅ Tính toán chênh lệch giá
- ✅ Ghi chú chi tiết
- ✅ Tổng hợp thống kê (Tổng/Đã trả/Còn/Chênh lệch)

### Navigation
- ✅ Nút ◄ ► để xem ngày trước/sau
- ✅ Chọn ngày từ date picker
- ✅ Keyboard shortcuts (Arrow Left/Right)

## ✅ Phase 2 - Holiday Management

### Quản Lý Ngày Nghỉ
- ✅ Click icon 📅 (góc phải trên) để quản lý ngày nghỉ
- ✅ Thêm ngày nghỉ từ calendar
- ✅ Xóa ngày nghỉ
- ✅ Badge "NGÀY NGHỈ" tự động hiện khi xem ngày nghỉ

### Tính Năng Ngày Nghỉ
- ✅ **Người thực hiện**: Cột thêm để ghi tên người thay thế order
- ✅ **Đối soát**: Checkbox để đánh dấu đã đối soát
- ✅ Tự động hiển thị/ẩn 2 cột này theo ngày nghỉ
- ✅ Form thêm order tự động thêm fields khi là ngày nghỉ

### UI Điều Kiện
- Ngày thường: Hiển thị 6 cột (#, NCC, Thành Tiền, Chênh lệch, Ghi chú, Thao tác)
- Ngày nghỉ: Hiển thị 8 cột (thêm "Người thực hiện" và "Đối soát")

## Cấu Trúc Dữ Liệu

### Bảng order_logs
```sql
- id (serial primary key)
- date (date) - Ngày order
- ncc (varchar) - Mã/tên nhà cung cấp
- amount (bigint) - Thành tiền
- is_paid (boolean) - Đã thanh toán
- difference (bigint) - Chênh lệch giá
- note (text) - Ghi chú

-- Phase 2 fields
- performed_by (varchar) - Người thực hiện (chỉ dùng ngày nghỉ)
- is_reconciled (boolean) - Đối soát (chỉ dùng ngày nghỉ)

- created_at, updated_at
- created_by, updated_by (Firebase UID)
```

### Bảng holiday_dates (Phase 2)
```sql
- id (serial primary key)
- date (date unique) - Ngày nghỉ
- note (text) - Ghi chú
- created_at
- created_by (Firebase UID)
```

## API Endpoints

### Order Logs

#### GET /api/order-logs?date=YYYY-MM-DD
Lấy danh sách order theo ngày

**Response:**
```json
{
  "success": true,
  "date": "2024-12-04",
  "isHoliday": false,
  "holidayNote": null,
  "orders": [...],
  "summary": {
    "totalAmount": 13170000,
    "paidAmount": 8045000,
    "unpaidAmount": 5125000,
    "totalDifference": 950000,
    "count": 12
  }
}
```

#### POST /api/order-logs
Tạo order mới

**Body:**
```json
{
  "date": "2024-12-04",
  "ncc": "A5",
  "amount": 4195000,
  "isPaid": false,
  "difference": 800000,
  "note": "Mua 4995 NCC Đức credit 800đ",
  "performedBy": "Lan",  // Optional, for holidays
  "isReconciled": false  // Optional, for holidays
}
```

#### PUT /api/order-logs/:id
Cập nhật order

**Body:** (các field muốn update)
```json
{
  "isPaid": true,
  "isReconciled": true,
  "performedBy": "Hương"
}
```

#### DELETE /api/order-logs/:id
Xóa order

### Holiday Management (Phase 2)

#### GET /api/holidays
Lấy tất cả ngày nghỉ

**Response:**
```json
{
  "success": true,
  "holidays": [
    {
      "id": 1,
      "date": "2024-12-25",
      "note": "Giáng sinh",
      "createdAt": "...",
      "createdBy": "..."
    }
  ]
}
```

#### POST /api/holidays
Thêm ngày nghỉ

**Body:**
```json
{
  "date": "2024-12-25",
  "note": "Giáng sinh"
}
```

#### DELETE /api/holidays/:id
Xóa ngày nghỉ

## Cách Sử Dụng

### 1. Thêm Order Mới (Ngày Thường)
- Click nút **[+ Thêm Order]**
- Điền thông tin:
  - **NCC**: Mã nhà cung cấp (vd: A5, A2, A14)
  - **Thành tiền**: Số tiền order
  - **Chênh lệch**: Chênh lệch giữa giá đặt và giá thực tế
  - **Ghi chú**: Mô tả chi tiết
- Check **Đã thanh toán** nếu đã chuyển tiền
- Click **[Lưu]**

### 2. Thêm Order Mới (Ngày Nghỉ)
- Khi xem một ngày nghỉ, form sẽ tự động hiển thị thêm:
  - **Người thực hiện**: Nhập tên người thay thế
  - **Đã đối soát**: Checkbox để đánh dấu đã đối soát
- Các trường khác giống ngày thường

### 3. Quản Lý Ngày Nghỉ
- Click icon **📅** (góc phải date navigator)
- Chọn ngày từ date picker
- Click **[+ Thêm]** để thêm ngày nghỉ
- Click icon **🗑️** để xóa ngày nghỉ

### 4. Đánh Dấu Đã Thanh Toán
- Tick vào checkbox bên cạnh số tiền
- Số tiền sẽ được gạch ngang tự động

### 5. Đối Soát (Chỉ Ngày Nghỉ)
- Tick vào checkbox cột "Đối soát"
- Dùng để xác nhận nhân viên chính đã kiểm tra lại

### 6. Xem Ngày Khác
- Click nút **◄** để xem ngày trước
- Click nút **►** để xem ngày sau
- Hoặc click vào ngày hiển thị để chọn ngày
- Hoặc dùng phím **Arrow Left/Right**

### 7. Sửa/Xóa Order
- Click icon **✏️** để sửa
- Click icon **🗑️** để xóa (có confirm)

## Migration

Chạy migration để tạo bảng:

### Phase 1 Migration
```bash
cd render.com/migrations
psql $DATABASE_URL < create_order_logs.sql
```

### Phase 2 Migration
```bash
psql $DATABASE_URL < create_holiday_management.sql
```

Hoặc chạy cả hai tuần tự:
```bash
psql $DATABASE_URL < create_order_logs.sql
psql $DATABASE_URL < create_holiday_management.sql
```

## Technical Stack

- **Frontend**: Vanilla JS + HTML + CSS
- **Backend**: Express.js + PostgreSQL
- **Icons**: Lucide Icons
- **Auth**: Firebase Authentication

## Kịch Bản Sử Dụng

### Kịch Bản 1: Ngày Làm Việc Bình Thường
1. Nhân viên order (Hoa) mở "Sổ Order"
2. Xem ngày hôm nay (04/12/2024)
3. Thêm các order trong ngày:
   - A5: 4,195đ (chênh lệch +800đ)
   - A2: 5,125đ
   - A14: 3,850đ (chênh lệch +150đ)
4. Khi chuyển tiền, tick "Đã thanh toán" → Số tiền gạch ngang
5. Cuối ngày check tổng quan trong stats cards

### Kịch Bản 2: Nhân Viên Chính Nghỉ Phép
**Trước khi nghỉ:**
1. Hoa click icon 📅
2. Thêm ngày 08/12/2024 vào danh sách ngày nghỉ
3. Hướng dẫn Lan (người thay thế)

**Ngày 08/12 (Lan thay thế):**
1. Lan mở "Sổ Order", chọn ngày 08/12
2. Hệ thống hiển thị badge "NGÀY NGHỈ"
3. Bảng tự động hiển thị 2 cột thêm: "Người thực hiện" và "Đối soát"
4. Lan thêm order:
   - NCC: A62
   - Người thực hiện: **Lan** (nhập tay)
   - Thành tiền: 4,550đ
   - Đối soát: chưa tick
   - Ghi chú: Threill 10đ 10k
5. Tiếp tục thêm các order khác

**Khi Hoa quay lại (09/12):**
1. Hoa xem lại ngày 08/12
2. Kiểm tra từng order trong cột "Người thực hiện: Lan"
3. Sau khi kiểm tra OK, tick ✓ vào cột "Đối soát"
4. Nếu có vấn đề, sửa order hoặc thêm ghi chú

## Files

```
order-log/
├── index.html          # Main page (updated with Phase 2)
├── order-log.css       # Custom styles (updated with Phase 2)
├── order-log.js        # Main app logic (updated with Phase 2)
├── modern.css          # Shared styles
├── auth.js             # Auth handler
└── README.md           # This file

render.com/
├── routes/
│   └── order-logs.js   # API routes (updated with Phase 2)
├── migrations/
│   ├── create_order_logs.sql          # Phase 1 schema
│   └── create_holiday_management.sql  # Phase 2 schema
└── server.js           # (Updated with route)

js/
└── navigation-modern.js  # (Updated with menu item)
```

## Permissions

Permission key: `order-log`

Thêm vào Firestore user permissions để enable menu item.

## Troubleshooting

### Ngày nghỉ không hiển thị cột thêm?
- Kiểm tra API trả về `isHoliday: true`
- Check console log: `[ORDER-LOG] Loaded orders`
- Verify ngày đã được thêm trong holiday management

### Không lưu được "Người thực hiện"?
- Chỉ lưu được khi ngày hiện tại là ngày nghỉ
- Check field `performedBy` có được gửi trong API request

### UI không cập nhật sau khi thêm/xóa ngày nghỉ?
- Hệ thống tự động reload sau mỗi thao tác
- Nếu không, thử refresh trang (F5)

## Future Enhancements

- [ ] Xuất Excel báo cáo theo tuần/tháng
- [ ] Dashboard tổng quan (chart)
- [ ] Gợi ý NCC dựa trên lịch sử
- [ ] Notification khi có order chưa thanh toán quá 3 ngày
- [ ] Search/Filter orders
- [ ] Bulk operations (delete multiple, mark paid)
