# Hướng dẫn Tính KPI - Base Product Anchor Method

## 📊 Tổng quan

Hệ thống tính KPI cho nhân viên dựa trên việc thêm sản phẩm vào đơn hàng thông qua tính năng "Sản phẩm đang giữ".

**Nguyên tắc cơ bản:**
- **+5,000đ** cho mỗi sản phẩm được thêm vào đơn (vượt quá số lượng ban đầu)
- **-5,000đ** khi giảm số lượng sản phẩm
- **0đ** cho các sản phẩm ban đầu (Base Product)

---

## 🔐 Firebase Structure

### 1. History Node (Tracking vĩnh viễn)
```
order_product_history/
  {orderId}/
    {productId}: {
      baseProduct: 5,        // SỐ LƯỢNG BAN ĐẦU (IMMUTABLE - không đổi)
      baseline: 5,           // Deprecated (giữ cho tương thích)
      currentQty: 7,         // Số lượng hiện tại
      kpiQty: 2,             // KPI = Max(0, currentQty - baseProduct)
      lastUpdated: 1732454123456
    }
```

**Vai trò:**
- `baseProduct`: Số lượng ban đầu khi đơn được mở lần đầu (KHÔNG BAO GIỜ THAY ĐỔI)
- `currentQty`: Số lượng hiện tại trong đơn
- `kpiQty`: KPI hiện tại = Max(0, currentQty - baseProduct)

### 2. Stats Node (KPI logs)
```
held_product_stats/
  {userId}/
    {timestamp1}: {
      userName: "Nguyen Van A",
      productCount: 3,           // Số lượng thay đổi (có thể âm)
      amount: 15000,             // Tiền (có thể âm)
      timestamp: 1732454123456,
      orderId: "12345",
      orderSTT: "ĐH001",
      isReduction: false,
      products: [...]
    }
```

---

## 📋 Công thức tính KPI

### Công thức chính
```
KPI = Max(0, Số lượng hiện tại - Base Product)
Delta KPI = KPI mới - KPI cũ
```

### Ý nghĩa
- **Base Product (số lượng ban đầu):** KHÔNG tính KPI
- **Thêm sản phẩm:** Tăng KPI theo số lượng thêm
- **Xóa sản phẩm:** Giảm KPI theo số lượng xóa
- **Xóa rồi thêm lại:** KPI được tính lại chính xác

---

## 📋 Các Trường Hợp Tính KPI

### ✅ Case 1: Thêm sản phẩm MỚI vào đơn

**Tình huống:**
- Order KHÔNG có Product A
- User thêm Product A (qty=3) vào "Sản phẩm đang giữ" → Lưu vào đơn

**Tính toán:**
```
Base Product = 0 (sản phẩm mới)
Số lượng hiện tại = 3

KPI = Max(0, 3 - 0) = 3
Delta = 3 - 0 = +3

→ Tính KPI: +3 × 5,000đ = +15,000đ ✅
```

---

### ✅ Case 2: Thêm số lượng cho sản phẩm ĐÃ CÓ

**Tình huống:**
- Order có Product A qty=5 (ban đầu)
- User thêm thêm 3 cái Product A → Total qty=8

**Tính toán:**
```
Base Product = 5
Số lượng cũ = 5 → KPI cũ = Max(0, 5-5) = 0
Số lượng mới = 8 → KPI mới = Max(0, 8-5) = 3

Delta = 3 - 0 = +3

→ Tính KPI: +3 × 5,000đ = +15,000đ ✅
```

---

### ✅ Case 3: Trừ rồi thêm lại (TÍNH LẠI)

**Tình huống:**
- Order có Product A qty=5 (ban đầu)
- User trừ 3 cái → qty=2
- User thêm lại 3 cái → qty=5

**Tính toán:**

**Bước 1: Trừ số lượng**
```
Base Product = 5
Số lượng cũ = 5 → KPI cũ = 0
Số lượng mới = 2 → KPI mới = Max(0, 2-5) = 0

Delta = 0 - 0 = 0

→ KPI: 0đ (không thay đổi vì vẫn trong base)
```

**Bước 2: Thêm lại**
```
Base Product = 5
Số lượng cũ = 2 → KPI cũ = 0
Số lượng mới = 5 → KPI mới = Max(0, 5-5) = 0

Delta = 0 - 0 = 0

→ KPI: 0đ (vẫn trong base, không tính)
```

---

### ✅ Case 4: Thêm VƯỢT QUÁ số lượng ban đầu

**Tình huống:**
- Order có Product A qty=5 (ban đầu)
- User trừ 3 cái → qty=2
- User thêm lại 7 cái → qty=9

**Tính toán:**
```
Base Product = 5

Sau khi trừ:
Số lượng = 2 → KPI = Max(0, 2-5) = 0

Sau khi thêm 7:
Số lượng = 9 → KPI = Max(0, 9-5) = 4

Delta = 4 - 0 = +4

→ Tính KPI: +4 × 5,000đ = +20,000đ ✅
(Chỉ tính 4 cái VƯỢT QUÁ base)
```

---

### ⚠️ Case 5: Giảm số lượng (TRỪ KPI)

**Tình huống:**
- Order có Product A qty=5 (ban đầu)
- User thêm 3 cái → qty=8 (đã được +15,000đ)
- Khách không nhận, user giảm xuống qty=6

**Tính toán:**
```
Base Product = 5

Sau khi thêm:
Số lượng = 8 → KPI = Max(0, 8-5) = 3

Sau khi giảm:
Số lượng = 6 → KPI = Max(0, 6-5) = 1

Delta = 1 - 3 = -2

→ Trừ KPI: -2 × 5,000đ = -10,000đ ⚠️
```

---

### ❌ Case 6: Xóa base product (KHÔNG ẢNH HƯỞNG KPI)

**Tình huống:**
- Order có Product A qty=5 (ban đầu, chưa tính KPI)
- User xóa hết Product A

**Tính toán:**
```
Base Product = 5

Trước khi xóa:
Số lượng = 5 → KPI = Max(0, 5-5) = 0

Sau khi xóa:
Số lượng = 0 → KPI = Max(0, 0-5) = 0

Delta = 0 - 0 = 0

→ KPI: 0đ (không ảnh hưởng vì chưa vượt base)
```

---

## 🔄 Workflow Tổng Quát

### Khi "Lưu vào đơn" (confirmHeldProducts)

```javascript
FOR EACH held product:
  1. Merge vào order (tăng quantity nếu đã tồn tại)
  2. Get historical data from Firebase:
     - baseProduct (immutable)
     - oldKpiQty

  3. Calculate new KPI:
     newKpiQty = Max(0, newQuantityInOrder - baseProduct)
     kpiDelta = newKpiQty - oldKpiQty

  4. IF kpiDelta != 0:
       Save stats: kpiDelta × 5,000đ

  5. Update Firebase:
     - baseProduct (unchanged)
     - currentQty = newQuantityInOrder
     - kpiQty = newKpiQty
```

### Khi giảm/tăng số lượng (saveChatOrderChanges)

```javascript
FOR EACH product in order:
  1. Get historical data:
     - baseProduct (immutable)
     - oldKpiQty

  2. Calculate new KPI:
     newKpiQty = Max(0, newQuantity - baseProduct)
     kpiDelta = newKpiQty - oldKpiQty

  3. IF kpiDelta != 0:
       Save stats: kpiDelta × 5,000đ (có thể âm)

  4. Update Firebase:
     - baseProduct (unchanged)
     - currentQty = newQuantity
     - kpiQty = newKpiQty
```

---

## 🧪 Test Cases

| # | Tình huống | Base | Qty cũ | Hành động | Qty mới | KPI cũ | KPI mới | Delta | Tiền |
|---|------------|------|--------|-----------|---------|--------|---------|-------|------|
| 1 | Thêm mới | 0 | 0 | +5 held | 5 | 0 | 5 | +5 | +25,000đ |
| 2 | Thêm vào base | 5 | 5 | +3 held | 8 | 0 | 3 | +3 | +15,000đ |
| 3 | Trừ trong base | 5 | 5 | -3 | 2 | 0 | 0 | 0 | 0đ |
| 4 | Thêm lại trong base | 5 | 2 | +3 held | 5 | 0 | 0 | 0 | 0đ |
| 5 | Vượt base | 5 | 2 | +7 held | 9 | 0 | 4 | +4 | +20,000đ |
| 6 | Giảm sau vượt | 5 | 9 | -3 | 6 | 4 | 1 | -3 | -15,000đ |
| 7 | Xóa base | 5 | 5 | Delete | 0 | 0 | 0 | 0 | 0đ |

---

## 📱 Cách xem KPI trên Tab 2

**Truy cập:**
```
orders-report/tab2-statistics.html
```

**Bảng hiển thị:**
| STT | Tên người dùng | Số đơn | Tổng số lượng | Tổng tiền |
|-----|----------------|--------|---------------|-----------|
| 1 | Nguyen Van A | 5 | 23 | 115,000đ |

**Click vào row để xem chi tiết:**
- Thời gian
- STT Đơn
- Danh sách sản phẩm
- Số lượng từng lần

---

## 🐛 Troubleshooting

### Vấn đề: KPI không tăng khi thêm base product

**Kiểm tra:**
1. Mở Console (F12) → Tìm log `[BASE-PRODUCT]`
2. Xem message: `base=X, new=Y, KPI=Z`
3. Nếu Y ≤ X → Đang trong base, không tính KPI

**Giải pháp:** Đây là behavior đúng. Chỉ tính KPI khi vượt base.

### Vấn đề: KPI không giảm khi xóa base product

**Kiểm tra:**
1. Mở Console → Tìm log `[BASE-PRODUCT]`
2. Kiểm tra `oldKPI` và `newKPI`
3. Nếu cả 2 đều = 0 → Chưa vượt base

**Giải pháp:** Đúng. Xóa base không ảnh hưởng KPI.

---

## 📚 Code References

| Chức năng | File | Function |
|-----------|------|----------|
| Load history | chat-modal-products.js | loadOrderProductHistory |
| Update history | chat-modal-products.js | updateOrderProductHistory |
| KPI calculation (held) | chat-modal-products.js | confirmHeldProducts |
| KPI calculation (edit) | chat-modal-products.js | saveChatOrderChanges |
| Display stats | tab2-statistics.html | loadStats |

---

## ⚠️ Lưu ý quan trọng

1. **baseProduct là bất biến:** Không bao giờ thay đổi sau khi được set lần đầu
2. **KPI = Max(0, currentQty - baseProduct):** Công thức đơn giản, dễ hiểu
3. **Delta có thể âm:** Khi giảm số lượng, delta âm = trừ tiền
4. **Base không tính KPI:** Chỉ tính phần vượt quá base

---

## 🔄 Changelog

- **2024-11-25:** Refactored to Base Product Anchor Method
  - Simplified KPI calculation: KPI = Max(0, currentQty - baseProduct)
  - Removed high water mark (baseline) logic
  - Base products no longer count for KPI
  - Adding/removing products correctly adjusts KPI
  
- **2024-11-24:** Initial implementation (Watermark Method)
  - Basic fraud prevention with permanent history
  - High water mark tracking
  - KPI reduction when decreasing quantity

---

**Tác giả:** Claude AI Assistant  
**Phiên bản:** 2.0 (Base Product Anchor)  
**Ngày cập nhật:** 2024-11-25
