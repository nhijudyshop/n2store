# Phân Tích Right Panel Tabs - Chat Modal

## Tổng Quan Cấu Trúc

Right panel trong chat modal có **4 tabs**:

| Tab | ID Tab Content | Mục đích |
|-----|----------------|----------|
| `orders` | `chatTabOrders` | Danh sách sản phẩm đơn hàng |
| `dropped` | `chatTabDropped` | Hàng rớt - xả |
| `history` | `chatTabHistory` | Lịch sử thao tác |
| `invoice_history` | `chatTabInvoiceHistory` | Lịch sử hóa đơn |

---

## Các File Liên Quan

```
tab1-orders.html      - HTML structure cho right panel (lines 1160-1403)
tab1-orders.js        - Hàm switchChatPanelTab (line 24172)
dropped-products-manager.js - Hàm switchChatPanelTab duplicate (line 1315)
```

**Thứ tự load script** (từ `tab1-orders.html`):
1. `dropped-products-manager.js` (line 2309)
2. `tab1-orders.js` (line 2318)

---

## Các Lỗi Phát Hiện

### 🔴 Lỗi 1: Duplicate Function - `switchChatPanelTab`

Có **2 hàm `window.switchChatPanelTab`** được định nghĩa:

| File | Line | Đặc điểm |
|------|------|----------|
| [dropped-products-manager.js](file:///Users/mac/Downloads/n2store/orders-report/dropped-products-manager.js#L1315) | 1315 | Gọi `renderDroppedProductsTable()` và `renderHistoryList()` |
| [tab1-orders.js](file:///Users/mac/Downloads/n2store/orders-report/tab1-orders.js#L24172) | 24172 | Gọi các hàm không tồn tại |

> [!CAUTION]
> Vì `tab1-orders.js` load SAU `dropped-products-manager.js`, hàm trong `tab1-orders.js` sẽ **ghi đè** hàm trong `dropped-products-manager.js`. Điều này có thể gây ra lỗi ở một số chức năng.

**Code xung đột:**
```javascript
// dropped-products-manager.js:1315
window.switchChatPanelTab = function (tabName) {
    // Gọi renderDroppedProductsTable(), renderHistoryList() - CÓ TỒN TẠI ✅
}

// tab1-orders.js:24236
window.switchChatPanelTab = switchChatPanelTab; // GHI ĐÈ ❌
```

---

### 🔴 Lỗi 2: Gọi Hàm Không Tồn Tại

Hàm `switchChatPanelTab` trong `tab1-orders.js` gọi các hàm **không được định nghĩa** ở bất kỳ đâu:

| Hàm được gọi | Tồn tại? | Vị trí gọi |
|--------------|----------|------------|
| `loadDroppedProductsForCustomer` | ❌ KHÔNG | line 24213 |
| `loadOrderHistoryForCustomer` | ❌ KHÔNG | line 24219 |
| `loadInvoiceHistoryForCustomer` | ❌ KHÔNG | line 24225 |
| `renderChatProductsPanel` | ❌ KHÔNG (đã bị comment out) | line 24207 |

**Hậu quả:**
- Khi click tab "Dropped" → không làm gì (hàm không tồn tại)
- Khi click tab "History" → không làm gì  
- Khi click tab "Invoice History" → không làm gì
- Khi click tab "Orders" → gọi `renderChatProductsPanel()` không tồn tại

---

### 🟡 Lỗi 3: Logic Tab ID Không Khớp

Trong `tab1-orders.js:24197`:
```javascript
const activeTab = document.getElementById('chatTab' + tabName.charAt(0).toUpperCase() + tabName.slice(1).replace('_', ''));
```

| Tab Name | Expected ID | Actual ID | Match? |
|----------|-------------|-----------|--------|
| `orders` | `chatTabOrders` | `chatTabOrders` | ✅ |
| `dropped` | `chatTabDropped` | `chatTabDropped` | ✅ |
| `history` | `chatTabHistory` | `chatTabHistory` | ✅ |
| `invoice_history` | `chatTabInvoicehistory` | `chatTabInvoiceHistory` | ❌ |

> [!WARNING]
> Tab `invoice_history` sẽ KHÔNG hoạt động do logic convert tên:
> - `'invoice_history'.replace('_', '')` → `'invoicehistory'`
> - Nhưng ID thực tế là `chatTabInvoiceHistory` (chữ H viết hoa)

---

### 🟢 Hàm Đúng (trong dropped-products-manager.js)

Hàm `switchChatPanelTab` trong `dropped-products-manager.js` hoạt động đúng:

```javascript
// Line 1332-1336: Logic chuyển tab
const activeContent = document.getElementById(
    tabName === 'orders' ? 'chatTabOrders' :
    tabName === 'dropped' ? 'chatTabDropped' :
    tabName === 'history' ? 'chatTabHistory' : 'chatTabInvoiceHistory'
);
```

Và gọi đúng các hàm render:
- `renderDroppedProductsTable()` - TỒN TẠI ✅
- `renderHistoryList()` - TỒN TẠI ✅
- `chatProductManager.renderInvoiceHistory()` - TỒN TẠI ✅

---

## Đề Xuất Sửa Lỗi

### Option A: Xóa Hàm Trùng Trong tab1-orders.js (Khuyến nghị)

Xóa toàn bộ function `switchChatPanelTab` và export statement trong `tab1-orders.js`:

```diff
// tab1-orders.js

- // Line 24172-24229: XÓA TOÀN BỘ HÀM
- function switchChatPanelTab(tabName) { ... }

- // Line 24236: XÓA EXPORT
- window.switchChatPanelTab = switchChatPanelTab;
```

### Option B: Sửa Hàm Trong tab1-orders.js

Nếu muốn giữ hàm trong `tab1-orders.js`, cần:
1. Sửa logic convert tab ID cho `invoice_history`
2. Thay `renderChatProductsPanel` → `renderChatProductsTable`
3. Không cần gọi các hàm `loadXxxForCustomer` vì `renderDroppedProductsTable` và `renderHistoryList` đã xử lý

---

## Verification Plan

### Manual Testing
Vì đây là UI frontend, cần test thủ công:
1. Mở orders-report page
2. Click vào một row để mở Chat Modal
3. Mở Right Panel (click icon info hoặc toggle button)
4. Click lần lượt các tabs: Orders → Dropped → History → Invoice History
5. Kiểm tra console log để xem có lỗi JavaScript không
6. Kiểm tra nội dung mỗi tab có hiển thị đúng không
