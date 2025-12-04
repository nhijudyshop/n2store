# Sổ Order - Daily Supplier Order Log

Ghi nhận và quản lý order hàng từ nhà cung cấp hằng ngày.

## Tính Năng Phase 1 ✅

### Core Features
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
- created_at, updated_at
- created_by, updated_by (Firebase UID)
```

## API Endpoints

### GET /api/order-logs?date=YYYY-MM-DD
Lấy danh sách order theo ngày

**Response:**
```json
{
  "success": true,
  "date": "2024-12-04",
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

### POST /api/order-logs
Tạo order mới

**Body:**
```json
{
  "date": "2024-12-04",
  "ncc": "A5",
  "amount": 4195000,
  "isPaid": false,
  "difference": 800000,
  "note": "Mua 4995 NCC Đức credit 800đ"
}
```

### PUT /api/order-logs/:id
Cập nhật order

**Body:** (các field muốn update)
```json
{
  "isPaid": true,
  "amount": 4200000
}
```

### DELETE /api/order-logs/:id
Xóa order

## Cách Sử Dụng

### 1. Thêm Order Mới
- Click nút **[+ Thêm Order]**
- Điền thông tin:
  - **NCC**: Mã nhà cung cấp (vd: A5, A2, A14)
  - **Thành tiền**: Số tiền order
  - **Chênh lệch**: Chênh lệch giữa giá đặt và giá thực tế
  - **Ghi chú**: Mô tả chi tiết
- Check **Đã thanh toán** nếu đã chuyển tiền
- Click **[Lưu]**

### 2. Đánh Dấu Đã Thanh Toán
- Tick vào checkbox bên cạnh số tiền
- Số tiền sẽ được gạch ngang tự động

### 3. Xem Ngày Khác
- Click nút **◄** để xem ngày trước
- Click nút **►** để xem ngày sau
- Hoặc click vào ngày hiển thị để chọn ngày
- Hoặc dùng phím **Arrow Left/Right**

### 4. Sửa/Xóa Order
- Click icon **✏️** để sửa
- Click icon **🗑️** để xóa (có confirm)

## Migration

Chạy migration để tạo bảng:
```bash
cd render.com/migrations
./migrate.sh
```

Hoặc chạy thủ công:
```bash
psql $DATABASE_URL < create_order_logs.sql
```

## Roadmap Phase 2 (Coming Soon)

- [ ] Quản lý ngày nghỉ (📅 icon)
- [ ] 2 cột thêm: **Người thực hiện** & **Đối soát** (chỉ hiện ngày nghỉ)
- [ ] Đánh dấu ngày nghỉ trong calendar
- [ ] Form thêm order điều kiện theo ngày nghỉ

## Technical Stack

- **Frontend**: Vanilla JS + HTML + CSS
- **Backend**: Express.js + PostgreSQL
- **Icons**: Lucide Icons
- **Auth**: Firebase Authentication

## Files

```
order-log/
├── index.html          # Main page
├── order-log.css       # Custom styles
├── order-log.js        # Main app logic
├── modern.css          # Shared styles
├── auth.js             # Auth handler
└── README.md           # This file

render.com/
├── routes/
│   └── order-logs.js   # API routes
├── migrations/
│   └── create_order_logs.sql
└── server.js           # (Updated with route)

js/
└── navigation-modern.js  # (Updated with menu item)
```

## Permissions

Permission key: `order-log`

Thêm vào Firestore user permissions để enable menu item.
