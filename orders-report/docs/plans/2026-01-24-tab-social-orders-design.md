# Tab Đơn Social - Design Document

> Created: 2026-01-24  
> Status: Approved  
> Approach: UI-First (tạo UI trước, API/logic sau)

---

## 1. Tổng Quan

### Mục đích

Tạo tab mới để quản lý đơn hàng nháp từ các kênh mạng xã hội (Facebook Post, Instagram, TikTok...) - những kênh không có trên TPOS.

### Điểm khác biệt với Tab1

| Thuộc tính     | Tab1 (TPOS)               | Tab Social          |
| -------------- | ------------------------- | ------------------- |
| Nguồn dữ liệu  | TPOS API                  | Firebase            |
| Chiến dịch     | Bắt buộc chọn             | Không có            |
| Tạo đơn        | TPOS tự tạo từ livestream | Thủ công trên web   |
| Realtime       | TPOS WebSocket            | Không cần           |
| Nút "Tạo đơn"  | Không có                  | Có                  |
| Cột "Bài Post" | Không có                  | Có (link clickable) |

---

## 2. Technical Stack

| Component     | Lựa chọn                                      |
| ------------- | --------------------------------------------- |
| Database      | Firebase Realtime DB                          |
| Firebase Path | `/social-orders/{orderId}`                    |
| UI Base       | Clone 100% từ Tab1                            |
| File HTML     | `orders-report/tab-social-orders.html`        |
| File JS       | `orders-report/js/tab-social/tab-social-*.js` |
| File CSS      | `orders-report/css/tab-social-orders.css`     |

---

## 3. UI Components

### 3.1 Layout Chính

```
┌─────────────────────────────────────────────────────────────────┐
│  [Bộ lọc ▼] [Tạo đơn mới] [Gán Tag hàng loạt] [Cài đặt Bill]   │  ← Header Actions
├─────────────────────────────────────────────────────────────────┤
│  Tổng đơn: 45  │  Đang hiển thị: 45  │  Tổng giá trị: 15.2M    │  ← Stats Bar
├─────────────────────────────────────────────────────────────────┤
│  [Lọc trạng thái ▼] [Lọc nguồn ▼] [🔍 Tìm kiếm...]             │  ← Filter Bar
├─────────────────────────────────────────────────────────────────┤
│  TABLE (xem bên dưới)                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Table Columns

```
┌────────┬─────┬─────┬────────────┬───────┬──────┬──────────┬──────────┬──────────┬────────┐
│Thao Tác│ STT │ Tag │ Khách hàng │  SĐT  │ Chat │ Sản phẩm │ Bài Post │ Địa Chỉ  │  Tổng  │
├────────┼─────┼─────┼────────────┼───────┼──────┼──────────┼──────────┼──────────┼────────┤
│☐ ✏️ 🗑│  1  │ 🏷️ │ Nguyễn A   │ 09xxx │  💬  │ 2 SP     │ 🔗FB...  │ Q.1, HCM │  500k  │
│☐ ✏️ 🗑│  2  │ 🏷️ │ Trần B     │ 09xxx │  💬  │ 1 SP     │ 🔗IG...  │ Cầu Giấy │  300k  │
└────────┴─────┴─────┴────────────┴───────┴──────┴──────────┴──────────┴──────────┴────────┘
```

| Cột            | Mô tả                                         |
| -------------- | --------------------------------------------- |
| **Thao Tác**   | Checkbox + Edit + Delete buttons              |
| **STT**        | Số thứ tự                                     |
| **Tag**        | Hiển thị tags, click để mở modal gán tag      |
| **Khách hàng** | Tên khách                                     |
| **SĐT**        | Số điện thoại                                 |
| **Chat**       | Icon chat (để trống nếu chưa có Pancake info) |
| **Sản phẩm**   | Số lượng SP + tổng số cái                     |
| **Bài Post**   | Link clickable đến bài đăng gốc               |
| **Địa Chỉ**    | Địa chỉ giao hàng                             |
| **Tổng**       | Tổng tiền đơn                                 |

### 3.3 Modals

| Modal             | Clone từ Tab1? | Ghi chú                       |
| ----------------- | -------------- | ----------------------------- |
| **Tạo/Sửa đơn**   | ❌ Mới         | Có thêm field Bài Post, Nguồn |
| **Chat**          | ✅ Clone       | Để trống, implement sau       |
| **Gán Tag**       | ✅ Clone       | Giống Tab1                    |
| **Tìm sản phẩm**  | ✅ Clone       | Giống Tab1                    |
| **Tạo phiếu bán** | ✅ Clone       | Giống Tab1                    |

---

## 4. Data Structure

### 4.1 Firebase Path

```
/social-orders/{orderId}
```

### 4.2 Order Object

```javascript
{
  // === IDENTIFICATION ===
  id: "SO-20260124-0001",       // Mã đơn tự sinh: SO-YYYYMMDD-XXXX
  stt: 1,                       // Số thứ tự (auto-increment)

  // === CUSTOMER INFO ===
  customerName: "Nguyễn Văn A",
  phone: "0901234567",
  address: "123 Lê Lợi, Q.1, HCM",

  // === PANCAKE INFO (để trống, implement sau) ===
  pageId: "",                   // Page ID
  psid: "",                     // Customer PSID
  conversationId: "",           // Conversation ID

  // === BÀI POST (MỚI) ===
  postUrl: "https://facebook.com/page/posts/123",  // Link bài đăng
  postLabel: "FB Post 24/01",                       // Nhãn hiển thị ngắn
  source: "facebook_post",                          // Enum: facebook_post, instagram, tiktok, manual

  // === PRODUCTS ===
  products: [
    {
      productId: "prod_001",
      name: "Áo thun trắng",
      code: "AT001",
      quantity: 2,
      price: 150000,
      note: ""
    }
  ],
  totalQuantity: 2,             // Tổng số lượng sản phẩm
  totalAmount: 300000,          // Tổng tiền hàng

  // === TAGS ===
  tags: [
    { id: "tag_vip", name: "VIP", color: "#ef4444" }
  ],

  // === STATUS ===
  status: "draft",              // Enum: draft, processing, completed, cancelled

  // === ASSIGNMENT ===
  assignedUserId: "user_123",
  assignedUserName: "NV Linh",

  // === NOTES ===
  note: "Ghi chú cho đơn hàng...",

  // === AUDIT ===
  createdBy: "admin",
  createdByName: "Admin",
  createdAt: 1706108400000,     // Timestamp
  updatedAt: 1706108400000
}
```

### 4.3 Source Enum

| Value           | Hiển thị      | Icon |
| --------------- | ------------- | ---- |
| `manual`        | Thủ công      | ✍️   |
| `facebook_post` | Facebook Post | 📘   |
| `instagram`     | Instagram     | 📷   |
| `tiktok`        | TikTok        | 🎵   |

### 4.4 Status Enum

| Value        | Hiển thị   | Color            |
| ------------ | ---------- | ---------------- |
| `draft`      | Nháp       | #fbbf24 (yellow) |
| `processing` | Đang xử lý | #3b82f6 (blue)   |
| `completed`  | Hoàn thành | #10b981 (green)  |
| `cancelled`  | Đã hủy     | #ef4444 (red)    |

---

## 5. UX Flows

### 5.1 Flow: Tạo đơn mới

```
User clicks [Tạo đơn mới]
         ↓
    Open Modal
         ↓
┌─────────────────────────────────┐
│     MODAL TẠO ĐƠN MỚI           │
├─────────────────────────────────┤
│ Khách hàng*: [____________]     │
│ SĐT*:        [____________]     │
│ Địa chỉ:     [____________]     │
│                                 │
│ ─── Nguồn đơn ───              │
│ Bài Post:    [URL____________]  │
│ Nguồn:       [Facebook ▼]       │
│                                 │
│ ─── Sản phẩm ───               │
│ [🔍 Tìm sản phẩm để thêm...]   │
│ ┌─────────────────────────────┐ │
│ │ Áo thun  x[2]  150k  = 300k │ │
│ │ Quần     x[1]  200k  = 200k │ │
│ └─────────────────────────────┘ │
│ Tổng SL: 3    Tổng tiền: 500k  │
│                                 │
│ Ghi chú: [__________________]   │
│                                 │
│      [Hủy]      [💾 Lưu đơn]   │
└─────────────────────────────────┘
         ↓
    Validate fields
         ↓
    Generate order ID (SO-YYYYMMDD-XXXX)
         ↓
    Save to Firebase /social-orders/{id}
         ↓
    Close modal + Refresh table
         ↓
    Show success notification
```

### 5.2 Flow: Sửa đơn

```
User clicks [✏️] on row
         ↓
    Get order data from Firebase
         ↓
    Open Modal (same as Create, pre-filled)
         ↓
    User edits fields
         ↓
    Click [Lưu]
         ↓
    Update Firebase /social-orders/{id}
         ↓
    Close modal + Refresh table
```

### 5.3 Flow: Xóa đơn

```
User clicks [🗑] on row
         ↓
    Show confirm dialog: "Bạn có chắc muốn xóa đơn SO-xxx?"
         ↓
    If [Xác nhận]:
         ↓
    Delete from Firebase /social-orders/{id}
         ↓
    Refresh table + Show notification
```

### 5.4 Flow: Gán Tag

```
User clicks [🏷️] on row
         ↓
    Open Tag Modal
         ↓
┌─────────────────────────┐
│ GÁN TAG CHO ĐƠN SO-001  │
├─────────────────────────┤
│ [🔍 Tìm tag...]         │
│                         │
│ ☑ VIP                   │
│ ☐ Đã gọi               │
│ ☐ Chờ ship             │
│ ☐ Khách quen           │
│                         │
│ [+ Tạo tag mới]         │
│                         │
│    [Đóng]    [Lưu]      │
└─────────────────────────┘
         ↓
    Update order.tags in Firebase
         ↓
    Refresh row
```

### 5.5 Flow: Filter & Search

```
User selects [Lọc trạng thái: Nháp]
    OR types in [Tìm kiếm: Nguyễn]
         ↓
    Filter orders in memory (client-side)
         ↓
    Re-render table with filtered results
         ↓
    Update stats (Đang hiển thị: X)
```

### 5.6 Flow: Click Bài Post

```
User clicks [🔗 FB Post...] in Bài Post column
         ↓
    Open postUrl in new tab
```

### 5.7 Flow: Chat (implement sau)

```
User clicks [💬] on row
         ↓
    If psid exists:
        Open Chat Modal (clone từ Tab1)
    Else:
        Show tooltip: "Chưa có thông tin Pancake"
```

---

## 6. Implementation Plan

### Phase 1: UI Only (Ưu tiên)

- [ ] Tạo file `tab-social-orders.html` (clone từ tab1-orders.html)
- [ ] Tạo file `css/tab-social-orders.css`
- [ ] Tạo folder `js/tab-social/`
- [ ] Thêm tab vào `main.html` navigation
- [ ] Tạo table với static data (mock)
- [ ] Tạo Modal Tạo/Sửa đơn
- [ ] Tạo Modal Gán Tag (clone)

### Phase 2: Firebase Integration

- [ ] Kết nối Firebase
- [ ] Implement CRUD operations
- [ ] Implement real-time listener (nếu cần)

### Phase 3: Features

- [ ] Tìm kiếm sản phẩm
- [ ] Tạo phiếu bán
- [ ] Phân chia nhân viên
- [ ] Export Excel

### Phase 4: Pancake Integration (sau)

- [ ] Chat modal
- [ ] Import từ Pancake conversations

---

## 7. Files to Create

```
orders-report/
├── tab-social-orders.html              # Main HTML file
├── css/
│   └── tab-social-orders.css           # Styles
├── js/
│   └── tab-social/
│       ├── tab-social-core.js          # Init, state management
│       ├── tab-social-table.js         # Table render, filters
│       ├── tab-social-modal.js         # Create/Edit modal
│       ├── tab-social-tags.js          # Tag management
│       └── tab-social-firebase.js      # Firebase CRUD
└── docs/
    └── plans/
        └── 2026-01-24-tab-social-orders-design.md  # This file
```

---

## 8. Notes

- **UI-First Approach**: Tạo UI hoàn chỉnh với mock data trước, sau đó mới kết nối Firebase
- **Clone từ Tab1**: Tối đa reuse code/styles từ Tab1 để đảm bảo consistency
- **Pancake để sau**: Các tính năng liên quan Pancake (Chat, Import) implement sau khi UI ổn định
- **Cột Bài Post**: Là điểm khác biệt chính với Tab1, link clickable mở bài gốc

---

> **Next Step**: Bắt đầu Phase 1 - Tạo UI
