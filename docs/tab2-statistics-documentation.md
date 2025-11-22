# Tab 2 - Thống Kê KPI Bán Hàng (tab2-statistics.html)

## 📋 Tổng Quan

**File:** `orders-report/tab2-statistics.html`
**Mục đích:** Thống kê KPI bán hàng - Tính phí cho sản phẩm được thêm vào đơn hàng SAU thời điểm upload thành công lần đầu.

---

## 🔄 Flow Logic Tổng Quan

```
┌─────────────────────────────────────────────────────────────────────┐
│                        KHỞI ĐỘNG (DOMContentLoaded)                 │
├─────────────────────────────────────────────────────────────────────┤
│  1. Kiểm tra Firebase đã khởi tạo chưa                              │
│  2. loadEmployeeRanges() - Load phân chia nhân viên từ localStorage │
│  3. loadData() - Bắt đầu tải dữ liệu                                │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         loadData()                                  │
├─────────────────────────────────────────────────────────────────────┤
│  1. Hiển thị loading spinner                                        │
│  2. loadUploadHistory() - Tải lịch sử upload từ Firebase            │
│  3. loadCurrentOrders() - Tải đơn hàng hiện tại từ localStorage     │
│  4. calculateKPI() - Tính toán KPI                                  │
│  5. renderData() - Hiển thị dữ liệu                                 │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       calculateKPI()                                │
├─────────────────────────────────────────────────────────────────────┤
│  1. Group upload history by STT (chỉ lấy lần upload ĐẦU TIÊN)       │
│  2. So sánh: SP hiện tại - SP lúc upload = SP thêm mới              │
│  3. Tính KPI: SP thêm mới × 5,000đ                                  │
│  4. applyFilters() - Áp dụng bộ lọc                                 │
│  5. loadNoteEditedStatus() - Kiểm tra ghi chú đã sửa (background)   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       renderData()                                  │
├─────────────────────────────────────────────────────────────────────┤
│  1. updateStats() - Cập nhật thẻ thống kê tổng                      │
│  2. renderTables() - Render bảng dữ liệu                            │
│     ├── Có employee ranges → renderByEmployee()                     │
│     └── Không có → renderAllData()                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Cấu Trúc File

### 1. Dependencies (Thư viện)
- **Bootstrap 5.3.0** - CSS Framework
- **Font Awesome 6.4.0** - Icons
- **Firebase SDK 10.7.1** - Realtime Database
- **Local files:**
  - `api-config.js` - Cấu hình API
  - `auth.js` - Xác thực
  - `token-manager.js` - Quản lý token
  - `decoding-utility.js` - Giải mã dữ liệu

### 2. CSS Styles
- Responsive grid layout
- Gradient stat cards
- Table styling với hover effects
- Note edited watermark (màu vàng)
- Loading & empty states

---

## 📊 Global State (Biến toàn cục)

```javascript
let uploadHistory = [];      // Lịch sử upload từ Firebase
let currentOrders = [];      // Đơn hàng hiện tại từ Tab 1
let employeeRanges = [];     // Phân chia STT theo nhân viên
let kpiData = [];            // Dữ liệu KPI đã tính toán
let filteredKpiData = [];    // Dữ liệu KPI đã lọc
let noteSnapshotsCache = null; // Cache snapshot ghi chú từ Firebase

const KPI_CONFIG = {
    PRICE_PER_NEW_PRODUCT: 5000,  // 5,000đ mỗi SP thêm mới
    DESCRIPTION: '...'
};
```

---

## 🔧 Chi Tiết Các Functions

### 1. KHỞI TẠO (Initialization)

#### `DOMContentLoaded` Event Handler
**Vị trí:** `tab2-statistics.html:467-485`
```javascript
window.addEventListener('DOMContentLoaded', function() {
    // 1. Kiểm tra Firebase
    if (!database) {
        // Hiển thị lỗi kết nối
        return;
    }
    // 2. Load employee ranges từ localStorage
    loadEmployeeRanges();
    // 3. Load dữ liệu
    loadData();
});
```

---

### 2. QUẢN LÝ PHÂN CHIA NHÂN VIÊN

#### `loadEmployeeRanges()`
**Vị trí:** `tab2-statistics.html:577-589`
**Mục đích:** Load phân chia STT theo nhân viên từ localStorage
```javascript
// Đọc từ localStorage key 'kpi_employee_ranges'
// Format: [{ start: 1, end: 200, name: "Huyền" }, ...]
```

#### `parseEmployeeRanges(input)`
**Vị trí:** `tab2-statistics.html:595-615`
**Mục đích:** Parse chuỗi input thành array ranges
```javascript
// Input: "1-200 Huyền, 201-400 Hạnh"
// Output: [{ start: 1, end: 200, name: "Huyền" }, { start: 201, end: 400, name: "Hạnh" }]
```

#### `applyEmployeeRanges()`
**Vị trí:** `tab2-statistics.html:617-635`
**Mục đích:** Áp dụng và lưu phân chia nhân viên
**Flow:**
1. Parse input từ textbox
2. Validate format
3. Lưu vào localStorage
4. Populate dropdown filter
5. Recalculate KPI
6. Re-render data

#### `getEmployeeName(stt)`
**Vị trí:** `tab2-statistics.html:657-670`
**Mục đích:** Lấy tên nhân viên theo STT
```javascript
// Input: stt = 150
// Output: "Huyền" (nếu 150 nằm trong range 1-200)
```

---

### 3. TẢI DỮ LIỆU (Data Loading)

#### `loadData()`
**Vị trí:** `tab2-statistics.html:675-699`
**Mục đích:** Main function tải tất cả dữ liệu
**Flow:**
```
1. Hiển thị loading state
2. loadUploadHistory() - Firebase
3. loadCurrentOrders() - localStorage
4. calculateKPI()
5. renderData()
```

#### `loadUploadHistory()`
**Vị trí:** `tab2-statistics.html:701-724`
**Mục đích:** Tải lịch sử upload từ Firebase
**Source:** `productAssignments_history` (200 records gần nhất)
**Filter:** Chỉ lấy upload có status: `completed`, `partial`, `deletion_failed`

#### `loadCurrentOrders()`
**Vị trí:** `tab2-statistics.html:726-744`
**Mục đích:** Tải đơn hàng hiện tại từ localStorage
**Source:** `tab1_filter_data` (dữ liệu từ Tab 1)

---

### 4. TÍNH TOÁN KPI (KPI Calculation)

#### `calculateKPI()` ⭐ CORE LOGIC
**Vị trí:** `tab2-statistics.html:761-848`
**Mục đích:** Tính toán KPI cho mỗi đơn hàng đã upload

**Logic Chi Tiết:**
```
┌──────────────────────────────────────────────────────────────┐
│ BƯỚC 1: Group upload history by STT                          │
│ - Sort theo timestamp ascending                              │
│ - Chỉ giữ lại lần upload ĐẦU TIÊN cho mỗi STT               │
│ - Lưu: uploadId, timestamp, orderId, productsAtUpload        │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ BƯỚC 2: Tính KPI cho mỗi STT                                 │
│ For each STT in firstUploadBySTT:                            │
│   1. Tìm đơn hàng hiện tại (currentOrders)                  │
│   2. currentProductCount = TotalQuantity hiện tại           │
│   3. uploadedProductCount = số SP lúc upload                │
│   4. newProductsAdded = max(0, current - uploaded)          │
│   5. kpiFee = newProductsAdded × 5,000đ                     │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ BƯỚC 3: Tạo object KPI data                                  │
│ {                                                            │
│   stt, orderId, uploadId, uploadTime,                        │
│   customerName, customerPhone, customerNote,                 │
│   noteLineCount, noteEdited,                                 │
│   productsAtUpload, productsNow, newProductsAdded,           │
│   kpiFee, employeeName                                       │
│ }                                                            │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ BƯỚC 4: Sort theo KPI fee giảm dần                           │
│ BƯỚC 5: applyFilters()                                       │
│ BƯỚC 6: loadNoteEditedStatus() (background)                  │
└──────────────────────────────────────────────────────────────┘
```

**Công thức KPI:**
```
KPI Fee = (Số SP hiện tại - Số SP lúc upload) × 5,000đ
```

---

### 4.1. CHI TIẾT LOGIC TÍNH KPI ⭐⭐⭐

#### Bối Cảnh & Mục Đích

**Vấn đề cần giải quyết:**
- Khi nhân viên upload đơn hàng lên TPOS, đơn hàng đã có sẵn một số sản phẩm
- SAU KHI upload thành công, nhân viên có thể THÊM sản phẩm mới vào đơn hàng
- Cần tính phí KPI cho những sản phẩm được thêm SAU khi upload

**Nguyên tắc:**
- Chỉ tính KPI từ **lần upload ĐẦU TIÊN** của mỗi đơn hàng (STT)
- Các lần upload sau **KHÔNG ảnh hưởng** đến baseline
- KPI = 5,000đ × số sản phẩm thêm mới

---

#### Flow Chi Tiết Từng Bước

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           BƯỚC 1: TẢI LỊCH SỬ UPLOAD                          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  loadUploadHistory() tải từ Firebase:                                        ║
║  - Path: productAssignments_history                                          ║
║  - Limit: 200 records gần nhất                                               ║
║  - Filter: uploadStatus = 'completed' | 'partial' | 'deletion_failed'       ║
║                                                                              ║
║  Mỗi record chứa:                                                            ║
║  {                                                                           ║
║    uploadId: "abc123",                                                       ║
║    timestamp: 1700000000000,        ← Thời điểm upload                       ║
║    uploadStatus: "completed",                                                ║
║    uploadResults: [                                                          ║
║      {                                                                       ║
║        stt: "150",                  ← Số thứ tự đơn hàng                     ║
║        orderId: "order-xyz",        ← ID đơn hàng trong TPOS                 ║
║        success: true,                                                        ║
║        existingProducts: [          ← ⭐ SNAPSHOT SẢN PHẨM LÚC UPLOAD        ║
║          { ProductId, ProductName, Quantity, Price, ... },                   ║
║          { ProductId, ProductName, Quantity, Price, ... }                    ║
║        ]                                                                     ║
║      },                                                                      ║
║      { stt: "151", ... },                                                    ║
║      { stt: "152", ... }                                                     ║
║    ]                                                                         ║
║  }                                                                           ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                     BƯỚC 2: XÁC ĐỊNH LẦN UPLOAD ĐẦU TIÊN                      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  // Sort tất cả upload theo thời gian TĂNG DẦN                               ║
║  const sortedHistory = [...uploadHistory].sort((a, b) =>                     ║
║      a.timestamp - b.timestamp                                               ║
║  );                                                                          ║
║                                                                              ║
║  // Duyệt qua và CHỈ GIỮ LẦN ĐẦU TIÊN cho mỗi STT                           ║
║  const firstUploadBySTT = {};                                                ║
║                                                                              ║
║  sortedHistory.forEach(record => {                                           ║
║      record.uploadResults.forEach(result => {                                ║
║          const stt = result.stt;                                             ║
║          if (!firstUploadBySTT[stt]) {  // ← Chỉ lấy lần đầu                 ║
║              firstUploadBySTT[stt] = {                                       ║
║                  uploadId: record.uploadId,                                  ║
║                  timestamp: record.timestamp,                                ║
║                  orderId: result.orderId,                                    ║
║                  productsAtUpload: result.existingProducts.length            ║
║              };                                                              ║
║          }                                                                   ║
║          // Các lần upload sau bị BỎ QUA                                     ║
║      });                                                                     ║
║  });                                                                         ║
║                                                                              ║
║  VÍ DỤ:                                                                      ║
║  ┌────────────────────────────────────────────────────────────┐              ║
║  │ STT 150:                                                   │              ║
║  │   - Upload lần 1: 10/11/2024, 3 SP  ← BASELINE (được lưu) │              ║
║  │   - Upload lần 2: 12/11/2024, 5 SP  ← BỎ QUA              │              ║
║  │   - Upload lần 3: 15/11/2024, 5 SP  ← BỎ QUA              │              ║
║  │                                                            │              ║
║  │ → firstUploadBySTT["150"].productsAtUpload = 3            │              ║
║  └────────────────────────────────────────────────────────────┘              ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                      BƯỚC 3: TẢI ĐƠN HÀNG HIỆN TẠI                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  loadCurrentOrders() tải từ localStorage:                                    ║
║  - Key: 'tab1_filter_data'                                                   ║
║  - Source: Dữ liệu được Tab 1 lưu sau khi load từ TPOS API                  ║
║                                                                              ║
║  Mỗi order chứa:                                                             ║
║  {                                                                           ║
║    SessionIndex: "150",             ← STT đơn hàng                           ║
║    Name: "Nguyễn Văn A",            ← Tên khách hàng                         ║
║    Telephone: "0901234567",         ← Số điện thoại                          ║
║    Note: "Áo size M\nQuần size L",  ← Ghi chú                                ║
║    TotalQuantity: 5                 ← ⭐ TỔNG SỐ SP HIỆN TẠI                 ║
║  }                                                                           ║
║                                                                              ║
║  QUAN TRỌNG:                                                                 ║
║  - TotalQuantity là số SP HIỆN TẠI trong đơn hàng                           ║
║  - Được cập nhật realtime từ TPOS API khi Tab 1 refresh                     ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                          BƯỚC 4: TÍNH TOÁN KPI                                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  Object.keys(firstUploadBySTT).forEach(stt => {                              ║
║                                                                              ║
║      // 1. Lấy thông tin upload                                              ║
║      const uploadInfo = firstUploadBySTT[stt];                               ║
║                                                                              ║
║      // 2. Tìm đơn hàng hiện tại                                             ║
║      const currentOrder = currentOrders.find(                                ║
║          order => order.SessionIndex === stt                                 ║
║      );                                                                      ║
║                                                                              ║
║      // 3. Lấy số SP                                                         ║
║      const currentProductCount = currentOrder.TotalQuantity;  // SP hiện tại ║
║      const uploadedProductCount = uploadInfo.productsAtUpload; // SP lúc up  ║
║                                                                              ║
║      // 4. Tính SP thêm mới                                                  ║
║      const newProductsAdded = Math.max(0, current - uploaded);               ║
║      //                       ↑ max(0, ...) để tránh số âm                   ║
║                                                                              ║
║      // 5. Tính KPI                                                          ║
║      const kpiFee = newProductsAdded * 5000;                                 ║
║                                                                              ║
║  });                                                                         ║
║                                                                              ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │                        VÍ DỤ TÍNH TOÁN                                 │  ║
║  ├────────────────────────────────────────────────────────────────────────┤  ║
║  │                                                                        │  ║
║  │  STT 150:                                                              │  ║
║  │    - Lần upload đầu: 3 SP (lưu vào existingProducts)                  │  ║
║  │    - Hiện tại: 7 SP (TotalQuantity từ TPOS)                           │  ║
║  │    - SP thêm mới: 7 - 3 = 4 SP                                        │  ║
║  │    - KPI: 4 × 5,000đ = 20,000đ                                        │  ║
║  │                                                                        │  ║
║  │  STT 151:                                                              │  ║
║  │    - Lần upload đầu: 5 SP                                             │  ║
║  │    - Hiện tại: 5 SP (không thay đổi)                                  │  ║
║  │    - SP thêm mới: 5 - 5 = 0 SP                                        │  ║
║  │    - KPI: 0 × 5,000đ = 0đ                                             │  ║
║  │                                                                        │  ║
║  │  STT 152:                                                              │  ║
║  │    - Lần upload đầu: 8 SP                                             │  ║
║  │    - Hiện tại: 6 SP (giảm do xóa SP)                                  │  ║
║  │    - SP thêm mới: max(0, 6-8) = 0 SP  ← Không tính số âm             │  ║
║  │    - KPI: 0đ                                                          │  ║
║  │                                                                        │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                         BƯỚC 5: TẠO KPI DATA OBJECT                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  kpiData.push({                                                              ║
║      stt: "150",                                                             ║
║      orderId: "order-xyz",                                                   ║
║      uploadId: "abc123",                                                     ║
║      uploadTime: 1700000000000,                                              ║
║      uploadTimeFormatted: "10/11/2024, 09:30:00",                           ║
║      customerName: "Nguyễn Văn A",                                           ║
║      customerPhone: "0901234567",                                            ║
║      customerNote: "Áo size M\nQuần size L",                                 ║
║      noteLineCount: 2,                ← Số dòng ghi chú (chỉ tham khảo)      ║
║      noteEdited: false,               ← Ghi chú có bị sửa không?             ║
║      productsAtUpload: 3,             ← SP lúc upload                        ║
║      productsNow: 7,                  ← SP hiện tại                          ║
║      newProductsAdded: 4,             ← SP thêm mới                          ║
║      kpiFee: 20000,                   ← KPI (VNĐ)                            ║
║      employeeName: "Huyền"            ← Tên nhân viên (theo range STT)       ║
║  });                                                                         ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

#### Sơ Đồ So Sánh Trực Quan

```
              LÚC UPLOAD (Baseline)              HIỆN TẠI (Current)
              ════════════════════              ═══════════════════

STT 150       ┌─────────────────┐               ┌─────────────────┐
              │ SP 1: Áo        │               │ SP 1: Áo        │
              │ SP 2: Quần      │               │ SP 2: Quần      │
              │ SP 3: Giày      │               │ SP 3: Giày      │
              │                 │               │ SP 4: Mũ    ◄───┼──── THÊM MỚI
              │                 │               │ SP 5: Túi   ◄───┼──── THÊM MỚI
              │                 │               │ SP 6: Kính  ◄───┼──── THÊM MỚI
              │                 │               │ SP 7: Vớ    ◄───┼──── THÊM MỚI
              └─────────────────┘               └─────────────────┘

              Total: 3 SP                       Total: 7 SP

                              ════════════════════════
                              KPI = (7 - 3) × 5,000đ
                                  = 4 × 5,000đ
                                  = 20,000đ
                              ════════════════════════
```

---

#### Tại Sao Chỉ Tính Lần Upload Đầu Tiên?

| Scenario | Giải thích |
|----------|------------|
| **Upload lần 1** | Đây là baseline - thời điểm đơn hàng "chính thức" được ghi nhận |
| **Upload lần 2+** | Có thể là re-upload do lỗi, update thông tin, hoặc sync lại - KHÔNG phải baseline mới |
| **Mục đích KPI** | Thưởng cho việc THÊM sản phẩm SAU khi đơn hàng đã được upload lần đầu |

---

#### Edge Cases & Xử Lý

| Case | Xử lý |
|------|-------|
| SP hiện tại < SP lúc upload | `max(0, current - uploaded)` → KPI = 0đ |
| Đơn hàng bị xóa khỏi TPOS | Skip - không tính KPI |
| Đơn hàng chưa từng upload | Không xuất hiện trong danh sách |
| Upload failed | Không lưu vào history → không tính |

---

### 5. PHÁT HIỆN GHI CHÚ ĐÃ CHỈNH SỬA (Note Edit Detection)

#### `loadNoteSnapshots()`
**Vị trí:** `tab2-statistics.html:512-546`
**Mục đích:** Load snapshots ghi chú từ Firebase
**Source:** `order_notes_snapshot`
**Cache:** Có cache để tránh load lại nhiều lần
**Cleanup:** Xóa snapshots quá 30 ngày

#### `checkNoteEdited(orderId, currentNote, snapshots)`
**Vị trí:** `tab2-statistics.html:556-569`
**Mục đích:** Kiểm tra ghi chú có bị chỉnh sửa không
**Logic:**
```javascript
// So sánh currentNote với snapshot.note
// Return true nếu khác nhau
```

#### `loadNoteEditedStatus()`
**Vị trí:** `tab2-statistics.html:854-888`
**Mục đích:** Cập nhật trạng thái noteEdited cho tất cả orders
**Quan trọng:** Tab 2 CHỈ ĐỌC snapshots (Tab 1 lưu snapshots)

---

### 6. LỌC & TÌM KIẾM (Filtering & Search)

#### `applyFilters()`
**Vị trí:** `tab2-statistics.html:893-995`
**Mục đích:** Lọc dữ liệu theo các tiêu chí

**Các loại filter:**
| Filter | Giá trị | Mô tả |
|--------|---------|-------|
| `employeeFilter` | all, tên NV | Lọc theo nhân viên |
| `statusFilter` | all, has_new, no_new, note_edited | Lọc theo trạng thái |
| `searchInput` | text | Tìm kiếm text |

**Ưu tiên tìm kiếm:**
1. STT exact match
2. STT starts with
3. STT contains
4. Phone starts with
5. Phone contains
6. Name starts with
7. Name contains

---

### 7. HIỂN THỊ DỮ LIỆU (Rendering)

#### `renderData()`
**Vị trí:** `tab2-statistics.html:1000-1019`
**Mục đích:** Main render function
**Flow:**
```
1. Kiểm tra có dữ liệu không
2. Ẩn loading, hiện data container
3. updateStats() - Cập nhật thẻ thống kê
4. renderTables() - Render bảng
```

#### `updateStats()`
**Vị trí:** `tab2-statistics.html:1021-1029`
**Mục đích:** Cập nhật 3 thẻ thống kê tổng
```
- statTotalOrders: Tổng đơn hàng
- statTotalNewProducts: Tổng SP thêm mới
- statTotalKPI: Tổng KPI (VNĐ)
```

#### `renderTables()`
**Vị trí:** `tab2-statistics.html:1031-1040`
**Mục đích:** Quyết định cách render bảng
```
Có employee ranges? → renderByEmployee()
Không có?           → renderAllData()
```

#### `renderByEmployee(container)`
**Vị trí:** `tab2-statistics.html:1056-1112`
**Mục đích:** Render bảng theo từng nhân viên
**Output:**
```
┌─────────────────────────────────────┐
│ [Employee Header - Huyền]           │
│ 50 đơn hàng • 120 SP thêm mới       │
│                         600,000đ    │
├─────────────────────────────────────┤
│ [Data Table for Huyền]              │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ [Employee Header - Hạnh]            │
│ ...                                 │
└─────────────────────────────────────┘
```

#### `renderDataTable(data, showTotal)`
**Vị trí:** `tab2-statistics.html:1114-1207`
**Mục đích:** Render bảng dữ liệu chi tiết

**Các cột trong bảng:**
| Cột | Mô tả |
|-----|-------|
| STT | Số thứ tự + badge "ĐÃ SỬA" nếu note edited |
| Khách hàng | Tên khách |
| SĐT | Số điện thoại |
| Ghi chú | Note + số dòng + trạng thái edited |
| Thời gian upload | Timestamp lần upload đầu |
| SP lúc upload | Số SP tại thời điểm upload |
| SP hiện tại | Số SP hiện tại |
| SP thêm mới | Badge positive/zero |
| KPI | Số tiền KPI |
| Thao tác | Button xem chi tiết |

---

### 8. XEM CHI TIẾT SẢN PHẨM (Product Detail Modal)

#### `viewProductDetail(stt, uploadId, orderId)`
**Vị trí:** `tab2-statistics.html:1212-1282`
**Mục đích:** Hiển thị modal chi tiết sản phẩm

**Flow:**
```
1. Mở Bootstrap modal
2. Hiển thị loading
3. Load products lúc upload từ Firebase
4. Load products hiện tại từ API (TPOS)
5. So sánh và render
```

#### `renderProductComparison(container, stt, productsAtUpload, currentProducts, uploadTimestamp, noteLineCount)`
**Vị trí:** `tab2-statistics.html:1284-1409`
**Mục đích:** Render so sánh sản phẩm

**Logic so sánh:**
```
For each current product:
  - Không có trong upload? → NEW PRODUCT
  - Quantity tăng?        → INCREASED (thêm mới)
  - Còn lại               → UNCHANGED
```

**Tabs trong modal:**
1. **Sản phẩm thêm mới** - Products mới hoặc tăng quantity
2. **Sản phẩm lúc upload** - Snapshot lúc upload
3. **Tất cả SP hiện tại** - Current products

---

## 🔗 Luồng Dữ Liệu (Data Flow)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Firebase (Realtime Database)                                       │
│  ├── productAssignments_history    → Upload history                 │
│  │   ├── uploadId                                                   │
│  │   ├── timestamp                                                  │
│  │   ├── uploadStatus                                               │
│  │   └── uploadResults[]                                            │
│  │       ├── stt                                                    │
│  │       ├── orderId                                                │
│  │       └── existingProducts[]                                     │
│  │                                                                  │
│  └── order_notes_snapshot          → Note snapshots (saved by Tab1) │
│      ├── orderId                                                    │
│      ├── note                                                       │
│      └── timestamp                                                  │
│                                                                     │
│  localStorage                                                       │
│  ├── tab1_filter_data              → Current orders from Tab 1      │
│  │   └── data[]                                                     │
│  │       ├── SessionIndex (STT)                                     │
│  │       ├── Name, Telephone, Note                                  │
│  │       └── TotalQuantity                                          │
│  │                                                                  │
│  └── kpi_employee_ranges           → Employee STT ranges            │
│      └── [{ start, end, name }, ...]                                │
│                                                                     │
│  TPOS API                                                           │
│  └── SaleOnline_Order({orderId})   → Current order details          │
│      └── Details[]                 → Current products               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 UI Components

### 1. Header Card
- Title với icon
- Subtitle mô tả
- Button "Tải lại dữ liệu"
- Stats Grid (3 cards):
  - Tổng đơn hàng đã upload (blue)
  - Tổng sản phẩm thêm mới (green)
  - Tổng KPI (yellow)

### 2. Filter Section
- **Employee Input:** Text input để nhập phân chia STT
- **Employee Dropdown:** Lọc theo nhân viên
- **Status Dropdown:** Lọc theo trạng thái
- **Search Input:** Tìm kiếm text

### 3. Data Tables
- Sortable columns
- Hover effects
- Note edited watermark (vàng)
- Badge cho SP thêm mới
- Action buttons

### 4. Product Detail Modal
- Info cards
- 3 tabs với bảng sản phẩm
- So sánh trực quan

---

## ⚙️ Cấu Hình

### KPI Configuration
```javascript
const KPI_CONFIG = {
    PRICE_PER_NEW_PRODUCT: 5000  // Có thể thay đổi dễ dàng
};
```

### Firebase Configuration
```javascript
const firebaseConfig = {
    databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
    // ... other config
};
```

---

## 📝 Lưu Ý Quan Trọng

1. **Tab 2 CHỈ ĐỌC note snapshots** - Tab 1 có trách nhiệm lưu snapshots
2. **KPI chỉ tính từ lần upload ĐẦU TIÊN** - Các lần upload sau không ảnh hưởng
3. **Note line count chỉ để tham khảo** - Không dùng để tính KPI
4. **Dữ liệu phụ thuộc Tab 1** - Cần load dữ liệu từ Tab 1 trước

---

## 🔄 Event Handlers

| Event | Handler | Mô tả |
|-------|---------|-------|
| DOMContentLoaded | Anonymous | Khởi tạo app |
| Click "Tải lại" | loadData() | Refresh dữ liệu |
| Click "Áp dụng" | applyEmployeeRanges() | Lưu phân chia NV |
| Change employeeFilter | applyFilters() | Lọc theo NV |
| Change statusFilter | applyFilters() | Lọc theo status |
| Input searchInput | applyFilters() | Tìm kiếm |
| Click "Chi tiết" | viewProductDetail() | Mở modal |

---

*Document Version: 1.0*
*Generated: 2025-11-22*
