# PLAN: Sửa lỗi validation giá bán khi upload TPOS

## 🔍 PHÂN TÍCH CHI TIẾT LỖI

### 1. Mô tả vấn đề
Khi upload sản phẩm lên TPOS ở Tab 3 (Product Assignment), nếu sản phẩm không có giá bán hoặc giá bán = 0, hệ thống đang **tự động lấy giá mua (StandardPrice) thay thế cho giá bán (Price)**. Đây là lỗi logic nghiệp vụ nghiêm trọng.

### 2. Vị trí lỗi chính

#### File: `orders-report/tab3-product-assignment.js`
**Dòng 3535** - Trong hàm `prepareUploadDetails()`:

```javascript
const newProduct = {
    ProductId: fullProduct.Id,
    Quantity: assignedData.count,
    Price: fullProduct.PriceVariant || fullProduct.ListPrice || fullProduct.StandardPrice || 0,
    Note: noteValue,
    UOMId: fullProduct.UOM?.Id || 1,
    // ...
};
```

**Chuỗi fallback hiện tại:**
1. `PriceVariant` - Giá biến thể (nếu có)
2. `ListPrice` - Giá niêm yết/giá bán
3. ⚠️ **`StandardPrice` - GIÁ MUA/GIÁ VỐN** (SAI!)
4. `0` - Mặc định

### 3. Tại sao đây là lỗi?

#### 3.1. Ý nghĩa các trường giá trong TPOS:
- **`PriceVariant`**: Giá của biến thể sản phẩm (size, màu sắc...)
- **`ListPrice`**: Giá bán lẻ/giá niêm yết cho khách hàng
- **`StandardPrice`**: Giá vốn/giá mua từ nhà cung cấp (cost price)

#### 3.2. Hậu quả khi dùng StandardPrice làm giá bán:
- ❌ Bán sản phẩm với giá = giá mua → không có lãi hoặc bán lỗ
- ❌ Dữ liệu đơn hàng sai, ảnh hưởng báo cáo doanh thu
- ❌ Khó phát hiện vì không có cảnh báo
- ❌ Vi phạm quy trình kinh doanh

### 4. Phạm vi ảnh hưởng

Lỗi tương tự xuất hiện ở **4 vị trí** trong codebase:

| File | Dòng | Hàm | Mức độ |
|------|------|-----|--------|
| `tab3-product-assignment.js` | 3535 | `prepareUploadDetails()` | 🔴 Nghiêm trọng |
| `tab-upload-tpos.js` | 2416-2418 | `prepareUploadDetails()` | 🔴 Nghiêm trọng |
| `tab1-orders.js` | 7570-7572 | (add product) | 🔴 Nghiêm trọng |
| `tab1-orders.js` | 14203 | (add product) | 🔴 Nghiêm trọng |

### 5. Ví dụ minh họa

**Sản phẩm trong TPOS:**
```json
{
  "Id": 12345,
  "Name": "Áo thun trắng",
  "PriceVariant": null,
  "ListPrice": 0,           // Chưa set giá bán
  "StandardPrice": 50000    // Giá mua = 50k
}
```

**Kết quả hiện tại (SAI):**
```javascript
Price: null || 0 || 50000 || 0  // → 50000
// Sản phẩm được thêm vào đơn với giá = 50k (giá mua)
```

**Kết quả mong muốn:**
```javascript
Price: null || 0 || 0  // → 0
// Hệ thống cảnh báo: "Sản phẩm không có giá bán!"
```

---

## 📋 KẾ HOẠCH TRIỂN KHAI

### Phase 1: Chuẩn bị và phân tích (✅ Đã hoàn thành)

- [x] Xác định vị trí lỗi trong code
- [x] Phân tích nguyên nhân và tác động
- [x] Tìm tất cả các vị trí bị ảnh hưởng
- [x] Đề xuất các giải pháp

### Phase 2: Thiết kế giải pháp

#### Option 1: Validation nghiêm ngặt ⭐ (KHUYẾN NGHỊ)

**Ưu điểm:**
- Không cho phép sản phẩm không có giá bán
- Rõ ràng, dễ hiểu, dễ debug
- Đảm bảo tính toàn vẹn dữ liệu

**Nhược điểm:**
- Có thể block upload nếu nhiều sản phẩm không có giá
- Cần xử lý UX cho trường hợp lỗi

**Implementation:**
```javascript
// 1. Validation khi fetch product
const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;

if (!salePrice || salePrice === 0) {
    throw new Error(
        `Sản phẩm "${fullProduct.Name}" (ID: ${fullProduct.Id}) không có giá bán. ` +
        `Vui lòng cập nhật giá bán trong TPOS trước khi upload.`
    );
}

const newProduct = {
    ProductId: fullProduct.Id,
    Quantity: assignedData.count,
    Price: salePrice,  // Guaranteed > 0
    // ...
};
```

#### Option 2: Warning + Skip product

**Ưu điểm:**
- Không block toàn bộ upload
- Cho phép upload các sản phẩm hợp lệ
- Có log để theo dõi

**Nhược điểm:**
- Sản phẩm bị skip → số lượng không khớp
- Phức tạp hơn trong xử lý

**Implementation:**
```javascript
const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;

if (!salePrice || salePrice === 0) {
    console.error(`⚠️ SKIP: Sản phẩm "${fullProduct.Name}" (ID: ${fullProduct.Id}) không có giá bán`);

    // Show notification to user
    showNotification(
        `Bỏ qua sản phẩm "${fullProduct.Name}" do không có giá bán`,
        'warning'
    );

    continue;  // Skip this product
}
```

#### Option 3: Default price with warning

**Ưu điểm:**
- Không block upload
- Có thể set giá mặc định (VD: 1000đ)

**Nhược điểm:**
- Vẫn có thể tạo dữ liệu sai
- Không giải quyết được vấn đề gốc

**⚠️ KHÔNG KHUYẾN NGHỊ** - Chỉ "ẩn" lỗi chứ không sửa

### Phase 3: Implementation Plan

#### Bước 1: Sửa `tab3-product-assignment.js`

**File:** `/home/user/n2store/orders-report/tab3-product-assignment.js`

**Vị trí 1 - Dòng 3535:** Trong hàm `prepareUploadDetails()`

```javascript
// TRƯỚC (SAI):
Price: fullProduct.PriceVariant || fullProduct.ListPrice || fullProduct.StandardPrice || 0,

// SAU (ĐÚNG):
Price: (() => {
    const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;

    if (!salePrice || salePrice === 0) {
        throw new Error(
            `Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán. ` +
            `Vui lòng cập nhật giá trong TPOS trước khi upload.`
        );
    }

    return salePrice;
})(),
```

#### Bước 2: Sửa `tab-upload-tpos.js`

**File:** `/home/user/n2store/orders-report/tab-upload-tpos.js`

**Vị trí - Dòng 2416-2418:** Trong hàm `prepareUploadDetails()`

```javascript
// TRƯỚC (SAI):
Price:
    fullProduct.PriceVariant ||
    fullProduct.ListPrice ||
    fullProduct.StandardPrice ||
    0,

// SAU (ĐÚNG):
Price: (() => {
    const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;

    if (!salePrice || salePrice === 0) {
        throw new Error(
            `Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán. ` +
            `Vui lòng cập nhật giá trong TPOS trước khi upload.`
        );
    }

    return salePrice;
})(),
```

#### Bước 3: Sửa `tab1-orders.js`

**File:** `/home/user/n2store/orders-report/tab1-orders.js`

**Vị trí 1 - Dòng 7570-7572:**

```javascript
// TRƯỚC (SAI):
Price:
    fullProduct.PriceVariant ||
    fullProduct.ListPrice ||
    fullProduct.StandardPrice ||
    0,

// SAU (ĐÚNG):
Price: (() => {
    const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;

    if (!salePrice || salePrice === 0) {
        throw new Error(
            `Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán. ` +
            `Vui lòng cập nhật giá trong TPOS.`
        );
    }

    return salePrice;
})(),
```

**Vị trí 2 - Dòng 14203:**

```javascript
// TRƯỚC (SAI):
Price: fullProduct.PriceVariant || fullProduct.ListPrice || fullProduct.StandardPrice || 0,

// SAU (ĐÚNG):
Price: (() => {
    const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;

    if (!salePrice || salePrice === 0) {
        throw new Error(
            `Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán. ` +
            `Vui lòng cập nhật giá trong TPOS.`
        );
    }

    return salePrice;
})(),
```

### Phase 4: Testing Plan

#### Test Case 1: Sản phẩm có đầy đủ giá
```javascript
Input: {
    PriceVariant: 150000,
    ListPrice: 100000,
    StandardPrice: 50000
}
Expected: Price = 150000 (PriceVariant ưu tiên)
```

#### Test Case 2: Sản phẩm chỉ có ListPrice
```javascript
Input: {
    PriceVariant: null,
    ListPrice: 100000,
    StandardPrice: 50000
}
Expected: Price = 100000
```

#### Test Case 3: Sản phẩm không có giá bán (TRƯỜNG HỢP LỖI)
```javascript
Input: {
    PriceVariant: null,
    ListPrice: 0,
    StandardPrice: 50000
}
Expected:
  - TRƯỚC: Price = 50000 (SAI - lấy giá mua)
  - SAU: Throw error "Sản phẩm không có giá bán"
```

#### Test Case 4: Upload nhiều sản phẩm hỗn hợp
```javascript
Input: [
    { PriceVariant: 100000, ... },  // OK
    { ListPrice: 50000, ... },      // OK
    { ListPrice: 0, StandardPrice: 30000 },  // ERROR
    { PriceVariant: 200000, ... },  // OK
]
Expected:
  - Upload dừng lại ở sản phẩm thứ 3
  - Hiển thị thông báo lỗi rõ ràng
  - Không upload sản phẩm nào (rollback)
```

### Phase 5: Error Handling & UX

#### Cải thiện thông báo lỗi cho người dùng

**Trong `uploadSingleSTT()` - tab3-product-assignment.js (line ~3331):**

```javascript
try {
    const mergedDetails = await prepareUploadDetails(orderData, sessionData, stt);
    // ...
} catch (error) {
    // Xử lý lỗi giá bán cụ thể
    if (error.message.includes('không có giá bán')) {
        return {
            stt: stt,
            success: false,
            error: error.message,
            errorType: 'MISSING_PRICE',  // Tag để dễ xử lý
            orderId: orderId
        };
    }

    throw error;  // Re-throw other errors
}
```

#### Hiển thị tổng hợp lỗi sau upload

```javascript
// Trong uploadToTPOS() - sau khi upload xong
const missingPriceErrors = results.filter(r => r.errorType === 'MISSING_PRICE');

if (missingPriceErrors.length > 0) {
    const errorDetails = missingPriceErrors.map(e =>
        `STT ${e.stt}: ${e.error}`
    ).join('\n');

    showNotification(
        `⚠️ Có ${missingPriceErrors.length} STT không thể upload do sản phẩm thiếu giá bán:\n\n${errorDetails}`,
        'error'
    );
}
```

### Phase 6: Deployment Checklist

- [ ] Backup code hiện tại
- [ ] Implement changes theo Option 1 (khuyến nghị)
- [ ] Test với data thật trên môi trường dev
- [ ] Test các test cases đã định nghĩa
- [ ] Kiểm tra error handling và UX
- [ ] Code review
- [ ] Commit changes với message rõ ràng
- [ ] Push to branch `claude/fix-upload-price-validation-jJ7v1`
- [ ] Tạo PR và test trên staging
- [ ] Deploy to production

---

## 🎯 TÓM TẮT

### Vấn đề
Upload sản phẩm TPOS đang dùng **giá mua (StandardPrice)** thay thế cho **giá bán (Price)** khi sản phẩm không có giá bán.

### Giải pháp
Loại bỏ `StandardPrice` khỏi chuỗi fallback và **throw error** nếu sản phẩm không có giá bán, buộc người dùng phải cập nhật giá trong TPOS trước khi upload.

### Files cần sửa
1. `orders-report/tab3-product-assignment.js:3535`
2. `orders-report/tab-upload-tpos.js:2416-2418`
3. `orders-report/tab1-orders.js:7570-7572`
4. `orders-report/tab1-orders.js:14203`

### Impact
- ✅ Đảm bảo dữ liệu chính xác
- ✅ Tránh bán lỗ do dùng giá mua
- ✅ Cải thiện data integrity
- ⚠️ Breaking change: Sản phẩm không có giá sẽ không upload được (cần cập nhật TPOS trước)
