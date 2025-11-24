# Hướng dẫn Tính KPI - Hệ thống Sản phẩm Đang Giữ

## 📊 Tổng quan

Hệ thống tính KPI cho nhân viên dựa trên việc thêm sản phẩm vào đơn hàng thông qua tính năng "Sản phẩm đang giữ".

**Nguyên tắc cơ bản:**
- **+5,000đ** cho mỗi sản phẩm MỚI được thêm vào đơn
- **-5,000đ** khi giảm số lượng sản phẩm đã tính KPI
- **0đ** khi thêm lại sản phẩm đã từng có trong đơn

---

## 🔐 Firebase Structure

### 1. History Node (Tracking vĩnh viễn)
```
order_product_history/
  {orderId}/
    {productId}: {
      quantity: 5,           // MAX quantity từng có trong order
      kpiQuantity: 3,        // Quantity ĐÃ ĐƯỢC TÍNH KPI
      lastUpdated: 1732454123456
    }
```

**Vai trò:**
- `quantity`: Track số lượng MAX từng có → Ngăn chặn "trừ rồi thêm lại"
- `kpiQuantity`: Track số lượng đã tính KPI → Tính toán giảm KPI khi trừ số lượng

### 2. Stats Node (KPI logs)
```
held_product_stats/
  {userId}/
    {timestamp1}: {
      userName: "Nguyen Van A",
      productCount: 3,           // Số lượng (có thể âm nếu là reduction)
      amount: 15000,             // Tiền (có thể âm)
      timestamp: 1732454123456,
      orderId: "12345",
      orderSTT: "ĐH001",
      isReduction: false,        // true nếu là giảm số lượng
      products: [
        {
          name: "Product A",
          quantity: 3,
          newQuantityInOrder: 5,
          historicalMaxQty: 2,
          historicalKpiQty: 2,
          incrementalQty: 3,
          isCounted: true
        }
      ]
    }
```

---

## 📋 Các Trường Hợp Tính KPI

### ✅ Case 1: Thêm sản phẩm MỚI vào đơn

**Tình huống:**
- Order KHÔNG có Product A
- User thêm Product A (qty=3) vào "Sản phẩm đang giữ" → Lưu vào đơn

**Tính toán:**
```
Firebase history TRƯỚC: Không có
Order sau khi lưu: Product A qty=3

Logic:
- newQuantityInOrder = 3
- historicalMaxQty = 0
- incrementalQty = max(0, 3 - 0) = 3

KPI: +3 × 5,000đ = +15,000đ ✅
```

**Firebase update:**
```json
{
  "quantity": 3,
  "kpiQuantity": 3,
  "lastUpdated": 1732454123456
}
```

---

### ✅ Case 2: Thêm số lượng cho sản phẩm ĐÃ CÓ

**Tình huống:**
- Order có Product A qty=2 (sản phẩm ban đầu, chưa tính KPI)
- User thêm thêm 3 cái Product A → Total qty=5

**Tính toán:**
```
Firebase history TRƯỚC:
{
  quantity: 2,
  kpiQuantity: 0  // Chưa tính KPI
}

Order sau khi lưu: Product A qty=5

Logic:
- newQuantityInOrder = 5
- historicalMaxQty = 2
- incrementalQty = max(0, 5 - 2) = 3

KPI: +3 × 5,000đ = +15,000đ ✅
```

**Firebase update:**
```json
{
  "quantity": 5,        // MAX updated
  "kpiQuantity": 5,     // KPI updated to current
  "lastUpdated": 1732454123456
}
```

---

### ❌ Case 3: Trừ rồi thêm lại (KHÔNG tính)

**Tình huống:**
- Order có Product A qty=5 (ban đầu, chưa tính KPI)
- User trừ 3 cái → qty=2
- User thêm lại 3 cái → qty=5

**Tính toán:**

**Bước 1: Trừ số lượng**
```
Firebase history TRƯỚC:
{
  quantity: 5,
  kpiQuantity: 0  // Chưa tính KPI
}

Order sau save: Product A qty=2

Logic:
- newQuantity = 2
- kpiQuantity = 0
- Không có reduction vì chưa tính KPI

KPI: 0đ (không thay đổi)

Firebase update:
{
  quantity: 5,      // MAX giữ nguyên
  kpiQuantity: 2,   // Update to current
  lastUpdated: ...
}
```

**Bước 2: Thêm lại**
```
User thêm 3 cái qua "Sản phẩm đang giữ" → Lưu vào đơn

Order sau khi lưu: Product A qty=5

Logic:
- newQuantityInOrder = 5
- historicalMaxQty = 5  (đã từng có 5)
- incrementalQty = max(0, 5 - 5) = 0

KPI: 0đ ❌ (KHÔNG tính vì không vượt quá MAX)
```

---

### ✅ Case 4: Thêm VƯỢT QUÁ số lượng ban đầu

**Tình huống:**
- Order có Product A qty=5 (ban đầu)
- User trừ 3 cái → qty=2
- User thêm lại 7 cái → qty=9

**Tính toán:**
```
Sau khi trừ:
Firebase: {quantity: 5, kpiQuantity: 2}

Sau khi thêm 7:
Order: Product A qty=9

Logic:
- newQuantityInOrder = 9
- historicalMaxQty = 5
- incrementalQty = max(0, 9 - 5) = 4

KPI: +4 × 5,000đ = +20,000đ ✅
(Chỉ tính 4 cái VƯỢT QUÁ số ban đầu)
```

---

### ⚠️ Case 5: Giảm số lượng đã tính KPI (TRỪ KPI)

**Tình huống:**
- User đã thêm Product A (qty=5) và được +25,000đ
- Khách không nhận, user giảm xuống qty=2

**Tính toán:**
```
Firebase history TRƯỚC:
{
  quantity: 5,
  kpiQuantity: 5  // Đã tính KPI cho 5
}

User giảm xuống qty=2 trong "Danh sách sản phẩm của đơn hàng"

Logic trong saveChatOrderChanges():
- newQuantity = 2
- kpiQuantity = 5
- reductionQty = 5 - 2 = 3

Save NEGATIVE stats:
{
  productCount: -3,
  amount: -15000,
  isReduction: true,
  products: [{
    quantity: -3,
    oldQuantity: 5,
    newQuantity: 2
  }]
}

KPI: -3 × 5,000đ = -15,000đ ⚠️
```

**Firebase update:**
```json
{
  "quantity": 5,        // MAX giữ nguyên
  "kpiQuantity": 2,     // Update to current
  "lastUpdated": 1732454123456
}
```

---

### ❌ Case 6: Delete rồi thêm lại (KHÔNG tính)

**Tình huống:**
- Order có Product A qty=3
- User xóa Product A khỏi đơn
- Sau 1 ngày, user mở lại và thêm Product A qty=3

**Tính toán:**
```
Khi xóa:
Firebase vẫn giữ: {quantity: 3, kpiQuantity: 0}

Sau 1 ngày, thêm lại:
Order: Product A qty=3

Logic:
- newQuantityInOrder = 3
- historicalMaxQty = 3  (vẫn track trong Firebase)
- incrementalQty = max(0, 3 - 3) = 0

KPI: 0đ ❌ (KHÔNG tính vì đã từng có)
```

---

## 🔄 Workflow Tổng Quát

### Khi "Lưu vào đơn" (confirmHeldProducts)

```javascript
FOR EACH held product:
  1. Merge vào order (tăng quantity nếu đã tồn tại)
  2. Get historical data from Firebase:
     - historicalMaxQty = history.quantity
     - historicalKpiQty = history.kpiQuantity

  3. Calculate incremental:
     incrementalQty = max(0, newQuantityInOrder - historicalMaxQty)

  4. IF incrementalQty > 0:
       Save stats: +incrementalQty × 5,000đ

  5. Update Firebase:
     - quantity = max(old quantity, newQuantityInOrder)
     - kpiQuantity = newQuantityInOrder
```

### Khi giảm số lượng (saveChatOrderChanges)

```javascript
FOR EACH product in order:
  1. Get historical data:
     - kpiQuantity = history.kpiQuantity

  2. IF newQuantity < kpiQuantity:
       reductionQty = kpiQuantity - newQuantity
       Save NEGATIVE stats: -reductionQty × 5,000đ

  3. Update Firebase:
     - quantity = max(old quantity, newQuantity)
     - kpiQuantity = newQuantity
```

---

## 🧪 Test Cases

| # | Tình huống | Qty ban đầu | Hành động | Qty cuối | KPI |
|---|------------|-------------|-----------|----------|-----|
| 1 | Thêm mới | 0 | +5 held | 5 | +25,000đ |
| 2 | Thêm vào có sẵn | 2 | +3 held | 5 | +15,000đ |
| 3 | Trừ rồi thêm lại bằng | 5 | -3, +3 held | 5 | 0đ |
| 4 | Trừ rồi thêm vượt | 5 | -3, +7 held | 9 | +20,000đ |
| 5 | Giảm sau khi tính | 5 (KPI'd) | -3 order | 2 | -15,000đ |
| 6 | Delete-wait-readd | 3 | Delete, +3 held | 3 | 0đ |
| 7 | Tăng dần | 0 | +2,+3,+1 held | 6 | +30,000đ |

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

### Vấn đề: KPI không tăng khi thêm sản phẩm

**Kiểm tra:**
1. Mở Console (F12) → Tìm log `[KPI-FRAUD]`
2. Xem message: `No score (Historical Max: X, New: Y)`
3. Nếu X ≥ Y → Sản phẩm đã từng có, không tính

**Giải pháp:** Đây là behavior đúng để chống fraud

### Vấn đề: KPI không giảm khi trừ số lượng

**Kiểm tra:**
1. Mở Console → Tìm log `[KPI-REDUCTION]`
2. Kiểm tra `kpiQuantity` trong Firebase history
3. Nếu `kpiQuantity = 0` → Chưa từng tính KPI cho sản phẩm này

**Giải pháp:** Chỉ trừ KPI nếu sản phẩm đã từng được tính KPI

### Vấn đề: Firebase không update

**Kiểm tra:**
1. Console → Network tab → Xem requests đến Firebase
2. Console → `[KPI-FRAUD] Updated history in Firebase`
3. Firebase Console → `order_product_history/{orderId}`

**Giải pháp:** Check Firebase permissions và connection

---

## 📚 Code References

| Chức năng | File | Line |
|-----------|------|------|
| Load history | chat-modal-products.js | 382-411 |
| Update history | chat-modal-products.js | 419-440 |
| Scoring logic | chat-modal-products.js | 1651-1689 |
| Reduction logic | chat-modal-products.js | 1100-1179 |
| Display stats | tab2-statistics.html | 196-310 |

---

## ⚠️ Lưu ý quan trọng

1. **History là vĩnh viễn:** Không bao giờ xóa `order_product_history` trừ khi order bị xóa
2. **kpiQuantity ≠ quantity:** Phải phân biệt rõ 2 giá trị này
3. **Compare đúng field:** Scoring dùng `quantity`, Reduction dùng `kpiQuantity`
4. **Negative stats:** Phải set `isReduction: true` để phân biệt

---

## 🔄 Changelog

- **2024-11-24:** Initial implementation
  - Basic fraud prevention with permanent history
  - Quantity tracking for incremental scoring
  - KPI reduction when decreasing quantity
  - Fixed re-add scoring issue
  - Added order count column

---

**Tác giả:** Claude AI Assistant
**Phiên bản:** 1.0
**Ngày cập nhật:** 2024-11-24
