# Bill Template Documentation

## Nguồn tham khảo chính thức

1. **Template gốc TPOS**: `/orders-report/bill_template.txt`
2. **PDF mẫu**: `/orders-report/Phiếu bán hàng - TPOS.VN.pdf`

> **Lưu ý**: PDF giống template TPOS nhưng có thêm trường **STT** (Session Index).

---

## Cấu trúc Bill

### 1. Header - Thông tin Shop
```
┌─────────────────────────────────────┐
│           NJD Live                  │  <- Tên shop (company.Name)
│  THÀNH PHỐ (1 3 4 5 6 7 8...)      │  <- Carrier name (vùng giao hàng)
│      Tiền thu hộ: 220.000           │  <- COD amount
│─────────────────────────────────────│
```

### 2. Tiêu đề + Barcode
```
│         PHIẾU BÁN HÀNG             │
│                                     │
│    |||||||||||||||||||||||||||      │  <- Barcode (Code 128)
│    Số phiếu: NJD/2026/49562         │  <- Bill number
│    Ngày: 28/01/2026 11:16           │  <- Date/time
│─────────────────────────────────────│
```

### 3. Thông tin khách hàng
```
│ Khách hàng: Diệu Nhi                │
│ Địa chỉ: Tân Phú Test               │
│ Điện thoại: 0909999999              │
│ Người bán: Tú                       │
│ STT: 252                            │  <- Session Index (sau Người bán)
└─────────────────────────────────────┘
```

**Thứ tự các trường (quan trọng):**
1. Khách hàng
2. Địa chỉ
3. Điện thoại
4. Người bán
5. **STT** ← Phải nằm sau "Người bán", KHÔNG phải sau "Ngày"

### 4. Bảng sản phẩm
```
┌─────────────┬──────────┬──────────┐
│ Sản phẩm    │   Giá    │   Tổng   │
├─────────────┴──────────┴──────────┤
│ [N23] 0510 A3 ÁO 2D FENDY HỒNG    │  <- Tên sản phẩm (colspan=3)
├─────────────┬──────────┬──────────┤
│   2 Cái     │ 180.000  │ 360.000  │  <- Số lượng, đơn giá, thành tiền
├─────────────┴──────────┴──────────┤
│ Tổng:       │  SL: 2   │ 360.000  │
│             │ Giảm giá:│ 160.000  │  <- Chỉ hiện nếu > 0
│             │Tiền ship:│  20.000  │
│             │Tổng tiền:│ 220.000  │
│             │Trả trước:│ 100.000  │  <- Chỉ hiện nếu > 0
│             │ Còn lại: │ 120.000  │  <- Chỉ hiện nếu có trả trước
└─────────────┴──────────┴──────────┘
```

### 5. Ghi chú giao hàng
```
Ghi chú giao hàng: KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ
HOTLINE CŨA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ

Sản phẩm nhận đổi trả trong vòng 2-4 ngày kể từ ngày nhận
hàng, "ĐỐI VỚI SẢN PHẨM BỊ LỖI HOẶC SẢN PHẨM SHOP GIAO SAI"
quá thời gian shop không nhận xử lý đổi trả bất kì trường hợp nào.
```

### 6. Ghi chú chung
```
Ghi chú:
STK ngân hàng Lại Thụy Yến Nhi
75918 (ACB)
```

---

## Mapping dữ liệu

| Trường hiển thị | Source (orderResult) | Fallback |
|-----------------|---------------------|----------|
| Tên shop | `company.Name` | "NJD Live" |
| Carrier | `CarrierName`, `Carrier.Name` | "" |
| Tiền thu hộ | `finalTotal - prepaidAmount` | 0 |
| Số phiếu | `Number` | "" |
| Ngày | `new Date()` | Current time |
| Khách hàng | `Partner.Name`, `PartnerDisplayName` | "" |
| Địa chỉ | `Partner.Street`, `Ship_Receiver.Street` | "" |
| Điện thoại | `Partner.Phone`, `Ship_Receiver.Phone` | "" |
| Người bán | `User.Name`, `UserName` | "" |
| **STT** | `SessionIndex` | "" |
| Sản phẩm | `OrderLines[].ProductName` | "" |
| Số lượng | `OrderLines[].Quantity` | 1 |
| Đơn giá | `OrderLines[].PriceUnit` | 0 |
| Giảm giá | `Discount`, `DiscountAmount`, `DecreaseAmount` | 0 |
| Tiền ship | `DeliveryPrice` | 0 |
| Trả trước | `AmountDeposit`, `PaymentAmount` | 0 |
| Ghi chú GH | `DeliveryNote` | "" |
| Ghi chú | `Comment` | "" |

---

## Công thức tính toán

```javascript
// Tổng tiền sản phẩm
totalAmount = sum(OrderLines.map(item => item.Quantity * item.PriceUnit))

// Tổng tiền đơn hàng
finalTotal = totalAmount - discount + shippingFee

// Tiền thu hộ (COD)
codAmount = Math.max(0, finalTotal - prepaidAmount)
```

---

## Barcode

- **Loại**: Code 128
- **URL**: `https://statics.tpos.vn/Web/Barcode?type=Code 128&value={billNumber}&width=600&height=100`
- **Kích thước**: width 95%

---

## CSS quan trọng

```css
/* Kích thước bill */
html, body {
    width: 80mm;           /* Độ rộng giấy in nhiệt */
    font-size: 13px;
    font-family: Arial, Helvetica, sans-serif;
    line-height: 1.2;
}

/* Đường kẻ ngang dạng nét đứt */
hr.dash-cs {
    margin-top: 5px;
    margin-bottom: 5px;
    border-top: 1px dashed black;
}

/* Font size tiền thu hộ */
.size-16 {
    font-size: 16px;
}

/* Border bảng sản phẩm */
.table-cs > tbody > tr > td,
.table-cs > thead > tr > th {
    border-top: 1px solid gray !important;
    border-bottom: 1px solid gray !important;
}
```

---

## File liên quan

| File | Mô tả |
|------|-------|
| `js/utils/bill-service.js` | Function `generateCustomBillHTML()` - tạo HTML bill |
| `js/tab1/tab1-fast-sale.js` | Preview bill, sample data |
| `bill_template.txt` | Template gốc từ TPOS API |
| `Phiếu bán hàng - TPOS.VN.pdf` | PDF mẫu chuẩn (có STT) |

---

## Lưu ý khi chỉnh sửa

1. **KHÔNG đổi thứ tự các trường** - Giữ nguyên thứ tự như PDF mẫu
2. **STT phải sau Người bán** - Không phải sau Ngày
3. **Giữ nguyên CSS** - Đã được tối ưu cho máy in nhiệt 80mm
4. **Điều kiện hiển thị**:
   - Giảm giá: chỉ hiện nếu `discount > 0`
   - Trả trước/Còn lại: chỉ hiện nếu `prepaidAmount > 0`
   - Ghi chú GH: chỉ hiện nếu có nội dung
   - Ghi chú: chỉ hiện nếu có nội dung
