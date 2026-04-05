# Flow Chi Tiết: Tag XL & Panel Chốt Đơn

> Tài liệu mô tả toàn bộ quy trình Tag XL (Processing Tags) và Panel Chốt Đơn trên Tab 1 — Orders Report.
> Dựa trên code thực tế, cập nhật ngày 2026-04-03.

---

## 1. Tổng Quan Hệ Thống

**Tag XL** (Processing Tags) là hệ thống phân loại và theo dõi trạng thái xử lý đơn hàng gồm 5 category. Hệ thống này tách biệt rõ ràng:

- **Trạng thái đơn** (Category 0–4): Đơn đang ở đâu trong quy trình
- **Đặc điểm đơn** (Flags): Đơn có gì đặc biệt (CK, giảm giá, qua lấy...)
- **Tag T chờ hàng**: Đơn thiếu hàng gì, ai quản lý

**Panel Chốt Đơn** là sidebar bên phải hiển thị tổng quan tất cả đơn theo từng category/flag/tag T, cho phép seller lọc nhanh và theo dõi tiến độ chốt đơn.

### Mối quan hệ

```
┌─────────────────────────────────────────────────────────┐
│  Tab 1 - Orders Table                                   │
│  ┌──────────────────────────┐   ┌─────────────────────┐ │
│  │ Bảng đơn hàng            │   │ Panel Chốt Đơn      │ │
│  │ ┌──────┬───────┬──────┐  │   │ (sidebar phải)      │ │
│  │ │ STT  │ ...   │TagXL │  │   │                     │ │
│  │ ├──────┼───────┼──────┤  │   │ Tất cả: 500 đơn    │ │
│  │ │  1   │ ...   │🟢 ĐRĐ│  │   │ Chưa gán: 120 đơn  │ │
│  │ │  2   │ ...   │🔵 CĐĐ│  │   │ 🟢 Hoàn tất: 50    │ │
│  │ │  3   │ ...   │🟠 XL │  │   │ 🔵 Chờ đi đơn: 200 │ │
│  │ │ ...  │ ...   │ ...  │  │   │ 🟠 Xử lý: 80       │ │
│  │ └──────┴───────┴──────┘  │   │ ⚪ Ko cần chốt: 30  │ │
│  └──────────────────────────┘   │ 🔴 Khách xã: 20     │ │
│                                 └─────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Tag XL Filter Dropdown (thanh lọc phía trên)     │   │
│  │ [▼ TẤT CẢ ▾] — lọc bảng theo category/flag      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Cấu Trúc 5 Category

### Category 0 — HOÀN TẤT (ĐÃ RA ĐƠN) 🟢

| Thuộc tính | Giá trị |
|---|---|
| ID | `0` |
| Emoji | 🟢 |
| Icon | `fa-check-circle` |
| Màu | Green `#10b981` |
| Cách vào | **TỰ ĐỘNG** khi bill tạo thành công |
| Cách ra | **TỰ ĐỘNG** khi bill bị hủy → rollback về vị trí cũ |
| Seller thao tác | Không cần — hệ thống tự xử lý |

**Logic**: Khi `onPtagBillCreated(saleOnlineId)` detect bill mới → lưu snapshot vị trí cũ (`previousPosition`) → chuyển category = 0. Khi bill hủy → `onPtagBillCancelled()` → restore từ `previousPosition`.

### Category 1 — CHỜ ĐI ĐƠN (OKE) 🔵

| Thuộc tính | Giá trị |
|---|---|
| ID | `1` |
| Emoji | 🔵 |
| Icon | `fa-clock` |
| Màu | Blue `#3b82f6` |
| Cách vào | Seller gắn thủ công khi khách OK |
| Cách ra | Auto → Cat 0 khi bill tạo, hoặc manual chuyển sang Cat 2/4 |

**2 Sub-states (tự động chuyển theo Tag T)**:

| Sub-state | Key | Điều kiện | Ý nghĩa |
|---|---|---|---|
| Okie Chờ Đi Đơn | `OKIE_CHO_DI_DON` | Không có tag T nào | Đủ hàng, sẵn sàng ra bill |
| Chờ Hàng | `CHO_HANG` | Có ≥ 1 tag T | Thiếu hàng, chờ hàng về |

**Chuyển đổi tự động**:
```
Gắn Tag T → auto: OKIE_CHO_DI_DON → CHO_HANG
Tháo hết Tag T → auto: CHO_HANG → OKIE_CHO_DI_DON
```

### Category 2 — MỤC XỬ LÝ 🟠

| Thuộc tính | Giá trị |
|---|---|
| ID | `2` |
| Emoji | 🟠 |
| Icon | `fa-exclamation-triangle` |
| Màu | Amber `#f59e0b` |
| Cách vào | Seller gắn khi phát hiện vấn đề |
| Cách ra | Xử lý xong → chuyển sang Cat 1 (OKE) hoặc Cat 4 (Khách xã) |

**Sub-tags**:

| Key | Tên hiển thị | Mô tả |
|---|---|---|
| `CHUA_PHAN_HOI` | Đơn chưa phản hồi | Khách chưa trả lời + chưa gọi được |
| `CHUA_DUNG_SP` | Đơn chưa đúng SP | Thiếu, dư, sai sản phẩm |
| `KHACH_MUON_XA` | Đơn khách muốn xã | Khách muốn bỏ 1 hoặc vài món |
| `BAN_HANG` | Bán hàng | Khách đang mua thêm, seller chào hàng |
| `XU_LY_KHAC` | Khác | Ghi chú tự do (bắt buộc nhập note) |

### Category 3 — KHÔNG CẦN CHỐT ⚪

| Thuộc tính | Giá trị |
|---|---|
| ID | `3` |
| Emoji | ⚪ |
| Icon | `fa-minus-circle` |
| Màu | Gray `#6b7280` |

**Sub-tags**:

| Key | Tên hiển thị | Mô tả |
|---|---|---|
| `DA_GOP_KHONG_CHOT` | Đã gộp không chốt | Đơn 2 page đã gộp vào đơn khác |
| `GIO_TRONG` | Giỏ trống | Đơn không có SP |

### Category 4 — KHÁCH XÃ SAU CHỐT 🔴

| Thuộc tính | Giá trị |
|---|---|
| ID | `4` |
| Emoji | 🔴 |
| Icon | `fa-times-circle` |
| Màu | Red `#ef4444` |

**Sub-tags**:

| Key | Tên hiển thị | Mô tả |
|---|---|---|
| `NCC_HET_HANG` | NCC hết hàng | Báo khách hết hàng / đổi mẫu |
| `KHACH_HUY_DON` | Khách hủy nguyên đơn | Khách chủ động hủy |
| `KHACH_KO_LIEN_LAC` | Khách không liên lạc được | Sau buổi chốt vẫn không liên lạc được |

---

## 3. Flags — 8 Đặc Điểm Đơn Hàng

Flags **độc lập với category** — có thể gắn nhiều flags cùng lúc, tồn tại song song với category.

| # | Flag | Key | Auto/Manual | Icon | Mô tả |
|---|---|---|---|---|---|
| 1 | Trừ công nợ | `TRU_CONG_NO` | Auto + Manual | 💰 | Ví khách có virtual balance (công nợ ảo) |
| 2 | CK (Chuyển khoản) | `CHUYEN_KHOAN` | Auto + Manual | 💳 | Ví khách có real balance (đã CK) |
| 3 | Giảm giá | `GIAM_GIA` | Manual | 🏷️ | Đơn có chiết khấu/sale (auto-detect đã bỏ) |
| 4 | Chờ live | `CHO_LIVE` | Manual | 📺 | Chờ gộp vào live sau |
| 5 | Giữ đơn | `GIU_DON` | Manual | ⌛ | Giữ 10–20 ngày, khách CK đủ nhưng chưa muốn nhận |
| 6 | Qua lấy | `QUA_LAY` | Manual | 🏠 | Khách qua shop lấy trực tiếp |
| 7 | Gọi báo khách HH | `GOI_BAO_KHACH_HH` | Manual | 📞 | Gọi báo khách hết hàng |
| 8 | Khác | `KHAC` | Manual | 📋 | Ghi chú tự do |

### Logic Auto-detect Flags

> **Lưu ý**: Hàm `autoDetectFlags()` trong `tab1-processing-tags.js:756` hiện đã **DISABLED** (return `[]`).
> Auto-detect CK + CN đã chuyển sang `tab1-qr-debt.js:432-443` — auto gắn flag khi wallet badge hiển thị trên bảng.
> GIAM_GIA đã bỏ auto-detect hoàn toàn — seller phải đánh thủ công.

**Cách hoạt động hiện tại** (từ `tab1-qr-debt.js`):

```
Khi bảng đơn hàng render row → fetch wallet data theo SĐT khách
  → Nếu có balance (real) > 0:
     └── Hiện badge CK trên cột QR-Debt
     └── Auto gắn flag CHUYEN_KHOAN (nếu chưa có)
  → Nếu có virtualBalance > 0:
     └── Hiện badge CN trên cột QR-Debt
     └── Auto gắn flag TRU_CONG_NO (nếu chưa có)
  → GIAM_GIA: KHÔNG auto-detect — seller tự gắn thủ công
```

---

## 4. Tag T Chờ Hàng

### Người quản lý: Duyên

Duyên (người đặt hàng NCC) quản lý tag T — đánh dấu đơn nào thiếu hàng, thiếu món gì.

### Tag T mặc định: MY THÊM CHỜ VỀ

| Thuộc tính | Giá trị |
|---|---|
| ID | `T_MY` (cố định, không auto-increment) |
| Tên | MY THÊM CHỜ VỀ |
| Màu | Yellow `#d97706` |
| Đặc biệt | Luôn có sẵn, không thể xóa |
| Hiển thị | Trực tiếp trong dropdown tag (cuối cùng) — click toggle nhanh |
| Ẩn khỏi | Modal "Quản Lý Tag T Chờ Hàng" |

### Tag T tùy chỉnh

- Tạo bởi Duyên trong modal Tag T Manager
- Tên: VD `T1 Áo smi trắng tag hoa`, `T2 Quần jean xanh`
- Có thể gắn `productCode` (mã SKU) cho tracking

### Flow Tag T

```
Duyên gắn Tag T vào đơn
  → Đơn ở Cat 1 → auto sub-state = "CHỜ HÀNG"
  → Panel hiện đơn trong mục "Chờ Hàng" + hiện tag T name

Hàng về đủ → Duyên tháo Tag T
  → Nếu hết Tag T → auto sub-state = "OKIE CHỜ ĐI ĐƠN"
  → Đơn sẵn sàng ra bill
```

---

## 5. Flow Chốt Đơn Theo SOP (8 Bước)

### Giai đoạn 1: Chuẩn bị

```
BƯỚC 1: Gộp đơn
  └── Chọn chiến dịch live → gộp đơn khách mua 2 page trùng SĐT
      └── Đơn source → auto gán Cat 3 "Đã gộp không chốt"
      └── Đơn target → nhận flags + tTags từ tất cả đơn trong cluster

BƯỚC 2: Đẩy tin nhắn chốt đơn (Copy mẫu chốt đơn)
  └── Lọc bỏ tag "Đã gộp không chốt", "Giỏ trống"
  └── Chọn đồng loạt đơn còn lại → copy mẫu → gửi tin nhắn

BƯỚC 3: Chia STT cho seller
  └── VD: Bạn A: 1→300, Bạn B: 301→600
```

### Giai đoạn 2: Chốt đơn (seller thao tác chính)

```
BƯỚC 4: BẮT ĐẦU CHỐT — Đơn mới CHƯA CÓ TAG XL
  │
  │  [SONG SONG] Duyên gắn tag T chờ hàng cho các đơn thiếu hàng
  │
  └── Seller liên hệ khách từng đơn (chat / gọi):
      │
      ├── ✅ Khách OK
      │   └── Gắn Cat 1 → "OKIE CHỜ ĐI ĐƠN"
      │       • Auto-detect: CK, Công nợ, Giảm giá
      │       • Seller thêm flags tay: Qua lấy, Chờ live, Giữ đơn
      │       • Nếu Duyên đã gắn tag T → auto "Chờ Hàng"
      │
      ├── ❌ Khách không phản hồi
      │   └── Gắn Cat 2 → "Đơn chưa phản hồi"
      │
      ├── ⚠️ Khách có vấn đề
      │   └── Gắn Cat 2 → chọn sub-tag phù hợp
      │
      ├── 🚫 Đơn không cần chốt
      │   └── Gắn Cat 3
      │
      └── 🔴 Khách xã đơn
          └── Gắn Cat 4 → chọn sub-tag phù hợp

  → Mục tiêu: Phân loại hết đơn — "CHƯA GÁN TAG XL" = 0
```

### Giai đoạn 3: Xử lý đơn có vấn đề

```
BƯỚC 5: XỬ LÝ đơn trong Cat 2 (MỤC XỬ LÝ)
  │
  ├── Xử lý xong, khách OK → chuyển sang Cat 1 "Okie Chờ Đi Đơn"
  └── Không xử lý được → chuyển sang Cat 4 (Khách xã)
```

### Giai đoạn 4: Ra đơn

```
BƯỚC 6: RA ĐƠN — Lọc Cat 1, filter theo sub-state + flags

  A. Đơn "Okie Chờ Đi Đơn" KHÔNG flag delay:
     ├── Đơn thường + Giảm giá (không CK/CN):
     │   → Chọn đồng loạt → chỉnh kênh → in phiếu → chụp bill → gửi cảm ơn
     └── Đơn có flag CK / Trừ công nợ:
         → Chọn từng đơn → chỉnh kênh → chiết khấu/check CN → ghi chú → in phiếu

  B. Đơn có flag "Qua lấy":
     ├── Đủ hàng → In phiếu soạn hàng → để kệ → chờ khách đến → ra bill
     └── Chờ hàng → In phiếu ghi "QUA LẤY" → hàng về → nhắn khách qua lấy

  C. Đơn có flag "Chờ live" / "Giữ đơn":
     → In phiếu soạn hàng + ghi chú → chờ sự kiện thực tế:
       • Chờ live: chờ đến buổi livestream tiếp theo để gộp đơn khách vào live
       • Giữ đơn: chờ hết thời hạn giữ (10–20 ngày) hoặc khách báo sẵn sàng nhận hàng

  D. Đơn "Chờ Hàng" (có tag T):
     → In phiếu chờ hàng + ghi chú → chờ hàng về
     → Duyên tháo tag T → auto "Okie Chờ Đi Đơn" → ra đơn

BƯỚC 7: AUTO-TRANSITION
  ├── Bill tạo thành công → TỰ ĐỘNG → Cat 0 HOÀN TẤT
  │   (lưu snapshot vị trí cũ + flags cho rollback)
  └── Bill bị hủy → TỰ ĐỘNG trả về Cat 1 vị trí cũ + flags cũ
```

### Giai đoạn 5: Sau ra đơn

```
BƯỚC 8: Gom hàng + Bàn giao
  └── Cuối buổi: đơn chưa xử lý xong → bao trắng → lên kệ → bàn giao
```

---

## 6. UI Components

### 6.1 Panel Chốt Đơn (Sidebar)

**Toggle button**: `tab1-orders.html:422` — nút "Chốt Đơn" trên toolbar
**Panel element**: `#ptag-panel` — fixed sidebar bên phải, width 380px

```
ptag-panel
├── ptag-panel-header
│   ├── Title: "Chốt Đơn"
│   └── Actions: [Ghim] [Tag T Manager] [Lịch sử] [Dọn dẹp] [Đóng]
├── ptag-panel-search (input tìm kiếm)
└── ptag-panel-body (nội dung động)
    ├── Card: TẤT CẢ (total count)
    ├── Card: CHƯA GÁN TAG XL (untagged count)
    ├── Card: Cat 0 — ĐÃ RA ĐƠN 🟢
    ├── Card: Cat 1 — CHỜ ĐI ĐƠN 🔵
    │   ├── Sub: Okie Chờ Đi Đơn (+ icon 🔵 lọc loại Chờ Live/Qua Lấy/Giữ Đơn)
    │   └── Sub: Chờ Hàng (+ icon in phiếu)
    ├── Section: ĐẶC ĐIỂM ĐƠN HÀNG (collapsible)
    │   ├── Flag: TRỪ CÔNG NỢ 💰 (count)
    │   ├── Flag: CK 💳 (count)
    │   ├── Flag: GIẢM GIÁ 🏷️ (count)
    │   ├── Flag: CHỜ LIVE 📺 (count)
    │   ├── Flag: GIỮ ĐƠN ⌛ (count)
    │   ├── Flag: QUA LẤY 🏠 (count)
    │   ├── Flag: GỌI BÁO KHÁCH HH 📞 (count)
    │   ├── Flag: KHÁC 📋 (count)
    │   └── Custom flags...
    ├── Card: Cat 2 — MỤC XỬ LÝ 🟠
    │   └── Sub-tags: chưa phản hồi, chưa đúng SP, khách muốn xã, bán hàng, khác
    ├── Card: Cat 3 — KHÔNG CẦN CHỐT ⚪
    │   └── Sub-tags: đã gộp, giỏ trống
    ├── Card: Cat 4 — KHÁCH XÃ 🔴
    │   └── Sub-tags: NCC hết hàng, khách hủy, khách ko liên lạc
    └── Section: TAG T CHỜ HÀNG
        ├── T_MY: MY THÊM CHỜ VỀ (count)
        └── Custom T-tags...
```

**Tính năng Panel**:
- **Ghim (Pin)**: Giữ panel luôn mở, lưu vào `localStorage('ptag_panel_pinned')`
- **Lọc**: Click card → lọc bảng đơn hàng theo category/flag/tag T tương ứng
- **Đếm**: Mỗi card hiện số đơn thuộc nhóm đó
- **Search**: Tìm kiếm trong panel

### 6.2 Tag XL Filter Dropdown (Thanh lọc trên toolbar)

**Element**: `#ptagXlFilterDropdown` — dropdown xanh lá trên thanh filter
**Vị trí**: `tab1-orders.html:301-324` — nằm trước cột TAG trong filter bar

```
┌─────────────────────────────┐
│ ▼ TẤT CẢ (500)            │  ← Selected display
├─────────────────────────────┤
│ 🔍 Tìm kiếm...            │  ← Search input
├─────────────────────────────┤
│ TẤT CẢ             500    │
│ CHƯA GÁN TAG XL    120    │
├── PHÂN LOẠI ────────────────┤
│  🟢 ĐÃ RA ĐƠN       50   │
│  🔵 CHỜ ĐI ĐƠN     200   │
│     • Okie Chờ ĐĐ   150   │
│     • Chờ Hàng        50   │
│  🟠 Xử lý            80   │
│     • Chưa phản hồi   30  │
│     • Chưa đúng SP    20  │
│     • ...                  │
│  ⚪ Ko cần chốt       30   │
│  🔴 Khách xã          20   │
├── ĐẶC ĐIỂM ────────────────┤
│  ☐ 💰 Trừ công nợ    15   │  ← Multi-select checkbox
│  ☐ 💳 CK             25   │
│  ☐ 🏷️ Giảm giá       40  │
│  ☐ 📺 Chờ live        5   │
│  ...                       │
├── TAG T CHỜ HÀNG ──────────┤
│  📦 MY THÊM CHỜ VỀ   10  │
│  T1 Áo smi trắng      5   │
│  ...                       │
└─────────────────────────────┘
```

**Filter Logic**:
- **Category/Sub-tag**: Single-select — chỉ chọn 1 cái tại 1 thời điểm
- **Flags**: Multi-select — chọn nhiều flag cùng lúc (checkbox)
- **Kết hợp**: Category filter + Flag filters apply đồng thời

### 6.3 Tag XL Cell Trong Table

**Column header**: `tab1-orders.html:466` — `<th data-column="processing-tag">Tag XL</th>`

Mỗi row hiển thị trong cell Tag XL:

```
┌──────────────────────────────────────┐
│ [🏷] [⏰] [✓] [📜]                 │  ← Quick action buttons
│ 🔵 OKIE CHỜ ĐI ĐƠN                │  ← Category badge
│ 💳 CK  🏷️ GG  📦 T_MY             │  ← Flag + T-tag badges
└──────────────────────────────────────┘
```

**Quick action buttons**:
- `[🏷]` — Mở dropdown gán tag (tất cả options)
- `[⏰]` — Quick assign "Chưa phản hồi" (Cat 2)
- `[✓]` — Quick assign "OKIE CHỜ ĐI ĐƠN" (Cat 1)
- `[📜]` — Xem lịch sử thay đổi tag

### 6.4 Dropdown Modal Gán Tag

Khi click `[🏷]` trên cell → mở dropdown tại vị trí cell:

```
┌───────────────────────────────────┐
│ 🔍 Tìm tag...                   │
│ [pill1] [pill2] ...              │  ← Selected tags (pills)
├───────────────────────────────────┤
│ ── 0.A ĐÃ RA ĐƠN ──            │
│   ĐÃ RA ĐƠN                     │
│ ── 0.C CHỜ ĐI ĐƠN ──           │
│   OKIE CHỜ ĐI ĐƠN              │
│ ── MỤC XỬ LÝ ──                │
│   CHƯA PHẢN HỒI                 │
│   CHƯA ĐÚNG SP                   │
│   KHÁCH MUỐN XÃ                 │
│   BÁN HÀNG                      │
│   KHÁC                           │
│ ── KHÔNG CẦN CHỐT ──            │
│   ĐÃ GỘP KHÔNG CHỐT            │
│   GIỎ TRỐNG                     │
│ ── KHÁCH XÃ SAU CHỐT ──         │
│   NCC HẾT HÀNG                  │
│   KHÁCH HỦY ĐƠN                 │
│   KHÁCH KO LIÊN LẠC             │
│ ── ĐẶC ĐIỂM ──                  │
│   CK                    [auto]   │
│   TRỪ CÔNG NỢ           [auto]   │
│   GIẢM GIÁ              [auto]   │
│   CHỜ LIVE                       │
│   GIỮ ĐƠN                       │
│   QUA LẤY                        │
│   GỌI BÁO KHÁCH HH              │
│   KHÁC                           │
│ ── TAG T ──                      │
│   📦 MY THÊM CHỜ VỀ             │
└───────────────────────────────────┘
```

---

## 7. Data Flow & State Management

### 7.1 ProcessingTagState

```javascript
// File: tab1-processing-tags.js (lines 183-291)
ProcessingTagState = {
    // Data
    _orderData: Map<orderCode, TagData>,      // Primary storage
    _idToCodeIndex: Map<orderId, orderCode>,   // Reverse lookup
    _historyStore: Map<orderCode, history[]>,  // History riêng
    _tTagDefinitions: Array<TTagDef>,          // T-tag definitions
    _customFlagDefs: Array<CustomFlagDef>,     // Custom flags

    // UI State
    _panelOpen: boolean,
    _panelPinned: boolean,                     // localStorage
    _activeFilter: string | null,              // Filter hiện tại
    _activeFlagFilters: Set<flagKey>,          // Multi-select flags
}
```

### 7.2 TagData Structure (mỗi đơn)

```javascript
{
    category: 0 | 1 | 2 | 3 | 4,
    subTag: string | null,           // Sub-tag key (Cat 2,3,4)
    subState: string | null,         // Auto sub-state (Cat 1)
    flags: string[],                 // Flag keys
    tTags: string[],                 // T-tag IDs
    note: string,                    // Ghi chú
    assignedAt: timestamp,
    previousPosition: { ... } | null, // Snapshot cho rollback
    pickingSlipPrinted: boolean,     // Đã in phiếu (Cat 1 / CHO_HANG)
    history: [                       // Max 50 entries
        { action, value, user, userId, timestamp }
    ]
}
```

### 7.3 API Endpoints

**Base URL**: `https://n2store-fallback.onrender.com/api/realtime/processing-tags`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/config` | Load T-tag definitions + custom flags |
| POST | `/batch` | Batch load tags theo orderCodes |
| PUT | `/by-code/{orderCode}` | Save/update tag cho 1 đơn |
| DELETE | `/by-code/{orderCode}` | Xóa tag data |

### 7.4 Realtime Sync

**Primary**: SSE (Server-Sent Events)
```
URL: https://n2store-fallback.onrender.com/api/realtime/sse?keys=processing_tags_global
Events: update, deleted
```

**Fallback**: Polling mỗi 15 giây nếu SSE fail.

### 7.5 Filter Keys Format

| Key | Ý nghĩa |
|---|---|
| `null` | Tất cả đơn |
| `'__no_tag__'` | Đơn chưa gán tag |
| `'cat_0'` → `'cat_4'` | Filter theo category |
| `'sub_OKIE_CHO_DI_DON'` | Sub-state Cat 1: Okie Chờ Đi Đơn |
| `'sub_OKIE_NO_DELAY'` | Sub-state Cat 1: Okie loại Chờ Live / Qua Lấy / Giữ Đơn |
| `'subtag_CHUA_PHAN_HOI'` | Sub-tag Cat 2/3/4 |
| `'flag_TRU_CONG_NO'` | Flag filter |
| `'ttag_T_MY'` | T-tag filter |

---

## 8. Toàn Bộ Auto Mechanisms Trong Hệ Thống Tag XL

> Section này liệt kê **tất cả** hành vi tự động trong hệ thống Tag XL, bao gồm cả những cái đã bị vô hiệu hóa.

### Tổng quan

| # | Tên | Status | Trigger | Hành động |
|---|---|---|---|---|
| 1 | Auto CK/CN từ Wallet | **ACTIVE** | Render row → fetch wallet | Gắn flag CK, CN |
| 2 | Auto Sub-State (gán Cat 1) | **ACTIVE** | Gán category 1 | Set OKIE/CHO_HANG theo tTags |
| 3 | Auto OKIE → CHO_HANG | **ACTIVE** | Thêm T-tag | Chuyển sub-state |
| 4 | Auto CHO_HANG → OKIE | **ACTIVE** | Tháo hết T-tag | Chuyển sub-state |
| 5 | Auto Picking Slip (single-SKU) | **ACTIVE** | Gán Cat 1 CHO_HANG hoặc thêm T-tag | Set pickingSlipPrinted |
| 6 | Auto Bill Created → Cat 0 | **ACTIVE** | Bill tạo thành công | Chuyển Cat 0 + lưu snapshot |
| 7 | Auto Bill Cancelled → Rollback | **ACTIVE** | Bill bị hủy | Restore từ snapshot |
| 8 | Auto Picking Slip Print | **ACTIVE** | In phiếu soạn hàng | Set pickingSlipPrinted + gán Cat 1 (chỉ cho chưa gán tag / Cat 2) |
| 9 | Auto Transfer on Merge | **ACTIVE** | Gộp đơn | Union flags + tTags |
| 10 | Auto Normalization on Load | **ACTIVE** | Load data từ API | Migrate cat 5, normalize subState |
| 11 | Auto Tag Sync (TPOS) | **ACTIVE** | User click "Đồng bộ" | Apply mappings TPOS → Tag XL |
| 12 | Auto Flag Detection (cũ) | **DISABLED** | ~~Gán Cat 1~~ | ~~Detect CK/CN/GG từ ví~~ |

---

### 8.1 Auto CK/CN từ Wallet Badge

**File**: `tab1-qr-debt.js:432-443`
**Status**: ACTIVE
**Trigger**: Khi bảng đơn hàng render row → fetch wallet data theo SĐT khách → hiển thị badge QR-Debt

```
Render table row → fetch wallet(phone)
  → balance > 0 (real — đã chuyển khoản):
    └── Hiện badge CK trên cột QR-Debt
    └── toggleOrderFlag(orderCode, 'CHUYEN_KHOAN', 'Tự Động')
  → virtualBalance > 0 (ảo — công nợ):
    └── Hiện badge CN trên cột QR-Debt
    └── toggleOrderFlag(orderCode, 'TRU_CONG_NO', 'Tự Động')
  → Chỉ gắn nếu flag chưa có (tránh trùng)
```

**Lưu ý**: Auto-detect chỉ chạy khi `ProcessingTagState._isLoaded = true`. Nếu data chưa load xong thì skip.

---

### 8.2 Auto Sub-State Khi Gán Category 1

**File**: `tab1-processing-tags.js:716-723`
**Status**: ACTIVE
**Trigger**: Khi seller gắn đơn vào Category 1 (CHỜ ĐI ĐƠN)

```
assignOrderCategory(orderCode, 1)
  → Nếu đơn ĐÃ CÓ tTags (tag T chờ hàng):
    └── subState = 'CHO_HANG' (Chờ Hàng)
    └── + Check single-SKU → pickingSlipPrinted = true/false
  → Nếu đơn KHÔNG CÓ tTags:
    └── subState = 'OKIE_CHO_DI_DON' (Okie Chờ Đi Đơn)
```

**Ý nghĩa**: Seller không cần chọn sub-state — hệ thống tự xác định dựa trên tag T đã gắn.

---

### 8.3 Auto OKIE → CHO_HANG (Thêm T-tag)

**File**: `tab1-processing-tags.js:846-853`
**Status**: ACTIVE
**Trigger**: Khi Duyên (hoặc seller) gắn tag T vào đơn đang ở Cat 1 / OKIE_CHO_DI_DON

```
assignTTagToOrder(orderCode, tagId)
  → Thêm tagId vào tTags[]
  → IF category = 1 AND subState = 'OKIE_CHO_DI_DON':
    └── subState → 'CHO_HANG'
    └── + Check single-SKU → pickingSlipPrinted = true/false
  → Sync API + refresh UI
```

**Ý nghĩa**: Đơn đang sẵn sàng ra bill → Duyên phát hiện thiếu hàng → gắn tag T → đơn tự chuyển sang "Chờ Hàng".

---

### 8.4 Auto CHO_HANG → OKIE (Tháo hết T-tag)

**File**: `tab1-processing-tags.js:867-869`
**Status**: ACTIVE
**Trigger**: Khi Duyên tháo tag T cuối cùng khỏi đơn đang ở Cat 1 / CHO_HANG

```
removeTTagFromOrder(orderCode, tagId)
  → Xóa tagId khỏi tTags[]
  → IF category = 1 AND subState = 'CHO_HANG' AND tTags.length === 0:
    └── subState → 'OKIE_CHO_DI_DON'
  → Sync API + refresh UI
```

**Ý nghĩa**: Hàng về đủ → Duyên tháo hết tag T → đơn tự quay về "Okie Chờ Đi Đơn" → sẵn sàng ra bill.

---

### 8.5 Auto Picking Slip (Single-SKU Detection)

**File**: `tab1-processing-tags.js:1068-1088`
**Status**: ACTIVE
**Trigger**: Khi gán Cat 1 với CHO_HANG sub-state, hoặc khi thêm T-tag vào đơn OKIE

```
_ptagIsSingleSkuOrder(orderCode)
  → Fetch order details từ TPOS: SaleOnline_Order(id)?$expand=Details
  → Đếm số ProductCode unique trong Details
  → Nếu chỉ có 1 SKU unique → return true → pickingSlipPrinted = true
  → Nếu > 1 SKU → return false → pickingSlipPrinted = false
```

**Ý nghĩa**: Đơn chỉ có 1 loại sản phẩm → coi như đã in phiếu soạn hàng (không cần in riêng). Hiển thị icon khác trên panel.

---

### 8.6 Auto Bill Created → Category 0 (HOÀN TẤT)

**File**: `tab1-processing-tags.js:953-990`
**Status**: ACTIVE
**Trigger**: Khi bill (phiếu bán hàng) tạo thành công trong TPOS
**Call sites**: `tab1-sale.js:1003,1172`, `tab1-fast-sale-invoice-status.js:819`

```
onPtagBillCreated(saleOnlineId)
  → Tìm orderCode từ saleOnlineId
  → Skip nếu đã ở Cat 0 (tránh duplicate)
  → Lưu snapshot previousPosition = {
      category, subTag, subState, flags, tTags, note
    }
  → Set category = 0 (HOÀN TẤT)
  → Clear subTag, subState
  → GIỮ NGUYÊN flags + tTags (không xóa)
  → Log history: 'AUTO_HOAN_TAT' by 'Hệ thống'
  → Sync API + refresh UI
```

**Ý nghĩa**: Seller tạo bill xong → hệ thống tự chuyển đơn sang "Đã Ra Đơn" và lưu snapshot để rollback nếu bill bị hủy.

---

### 8.7 Auto Bill Cancelled → Rollback

**File**: `tab1-processing-tags.js:1028-1059`
**Status**: ACTIVE
**Trigger**: Khi bill bị hủy trong TPOS
**Call sites**: `tab1-fast-sale-workflow.js:461,1332`

```
onPtagBillCancelled(saleOnlineId)
  → Tìm orderCode
  → Nếu KHÔNG có previousPosition → skip (không biết trả về đâu)
  → Nếu CÓ previousPosition:
    → Restore: category, subTag, subState, flags, tTags, note
    → Clear previousPosition
    → Migrate legacy: nếu restored.category = 5 → chuyển về Cat 1 + CHO_HANG
  → Log history: 'AUTO_ROLLBACK' by 'Hệ thống'
  → Sync API + refresh UI
```

**Ý nghĩa**: Bill bị hủy → đơn tự quay về đúng vị trí trước khi ra bill, kèm toàn bộ flags + tTags cũ. Seller không cần gán lại tag thủ công.

---

### 8.8 Auto Picking Slip Print

**File**: `tab1-processing-tags.js:994-1024`
**Status**: ACTIVE
**Trigger**: Khi phiếu soạn hàng (packing slip) được in trong TPOS

```
onPtagPackingSlipPrinted(saleOnlineId)
  → Skip nếu đã marked pickingSlipPrinted = true
  → Set pickingSlipPrinted = true
  → Auto gán Cat 1 / CHO_HANG khi:
    ├── Chưa gán category nào (null/undefined)
    └── Đang ở Cat 2 (MỤC XỬ LÝ)
  → SKIP (chỉ set pickingSlipPrinted): Cat 0, Cat 1, Cat 3, Cat 4
  → Log history: 'AUTO_PHIEU_SOAN' by 'Hệ thống'
  → Sync API + refresh UI
```

**Ý nghĩa**: In phiếu soạn hàng → đơn chưa gán tag hoặc đang ở Cat 2 (Xử Lý) tự chuyển sang Cat 1 / Chờ Hàng. Các Cat khác giữ nguyên.

---

### 8.9 Auto Transfer on Merge (Gộp đơn)

**File**: `tab1-processing-tags.js:881-943`
**Status**: ACTIVE
**Trigger**: Khi gộp đơn trùng (từ `tab1-merge.js`)

```
transferProcessingTags(sourceOrderCode, targetOrderCode)
  → Target order (đơn chính):
    ├── Flags: UNION — gộp flags từ source (chỉ thêm mới, không trùng)
    ├── tTags: UNION — gộp tTags từ source (chỉ thêm mới, không trùng)
    └── Nếu Cat 1 + có tTags mới → subState = 'CHO_HANG'

  → Source order (đơn phụ):
    ├── Clear flags = []
    ├── Clear tTags = []
    └── Giữ nguyên category (caller sẽ gán Cat 3 / DA_GOP_KHONG_CHOT)

  → Log: 'TRANSFER_IN' trên target, 'TRANSFER_OUT' trên source
  → Sync cả 2 đơn lên API
```

**Ý nghĩa**: Gộp đơn → đơn phụ mất flags/tTags → đơn chính nhận tất cả. Không mất data.

---

### 8.10 Auto Normalization on Data Load

**File**: `tab1-processing-tags.js:492-501`
**Status**: ACTIVE
**Trigger**: Khi load processing tag data từ API (mỗi lần mở trang)

```
loadProcessingTagsByCodes(orderCodes)
  → Với mỗi tagData nhận được:
    → Migrate legacy: nếu category = 5 → category = 1, subState = 'CHO_HANG', pickingSlipPrinted = true
    → Normalize subState cho Cat 1:
      ├── Có tTags → subState = 'CHO_HANG'
      └── Không tTags → subState = 'OKIE_CHO_DI_DON'
```

**Ý nghĩa**: Đảm bảo data luôn nhất quán. Category 5 là phiên bản cũ (đã deprecated), auto migrate về Cat 1 + CHO_HANG.

---

### 8.11 Auto Tag Sync từ TPOS (User-triggered)

**File**: `tab1-tag-sync.js:481-697`
**Status**: ACTIVE
**Trigger**: User click nút "Đồng bộ" trong Tag Sync Modal

```
executeTagSync()
  → Load saved mappings từ localStorage('tagSyncMappings_v2')
  → Với mỗi mapping:
    ├── type='category': TPOS tag → gán Tag XL category + subTag
    ├── type='flag': TPOS tag → toggle flag
    ├── type='ttag': TPOS tag → gán T-tag
    └── type='prefix': TPOS tag prefix → tạo custom flag cùng tên
  → Tìm đơn matching → skip đơn đã có target → execute batch
  → Hiện kết quả: X thành công, Y thất bại
```

**Lưu ý**: Tuy là "auto sync" nhưng cần user chủ động bấm nút — không chạy tự động hoàn toàn.

---

### 8.12 Auto Flag Detection (CŨ — DISABLED)

**File**: `tab1-processing-tags.js:756-760`
**Status**: **DISABLED** — return `[]`

```javascript
async function autoDetectFlags(orderCode, phone) {
    // Wallet CK + Công nợ: đã chuyển sang tab1-qr-debt.js (auto khi badge hiển thị)
    // Giảm Giá: đã bỏ auto-detect, chuyển sang đánh thủ công
    return [];
}
```

**Lịch sử**:
- Trước đây: Khi gán Cat 1 → hàm này check ví khách → auto gắn CK/CN/GG
- Hiện tại: CK + CN chuyển sang `tab1-qr-debt.js` (auto khi wallet badge render). GIAM_GIA bỏ auto hoàn toàn.

---

### Sơ đồ tổng hợp Auto-Transitions

```
                    ┌─────────────────────┐
                    │  CHƯA GÁN TAG XL    │
                    └──────────┬──────────┘
                               │
              Seller gắn thủ công / In phiếu soạn hàng (8.8)
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
  ┌──────────────┐   ┌─────────────────┐   ┌──────────────┐
  │ Cat 1: OKE   │   │ Cat 2: XỬ LÝ   │   │ Cat 3: KO CẦN│
  │              │   │                 │   │ Cat 4: XÃ    │
  │ ┌──────────┐ │   └───┬────────┬───┘   └──────────────┘
  │ │OKIE ĐI ĐƠN│◄──────┘        │
  │ └─────┬────┘ │  (xử lý xong)  │ In phiếu soạn hàng (8.8)
  │   ▲   │      │                │
  │   │   ▼      │   Thêm T-tag   │
  │ ┌─┴────────┐ │   (8.3)        │
  │ │ CHỜ HÀNG │◄┼────────────────┘
  │ └──────────┘ │   Tháo hết T-tag (8.4) ↑↓
  └──────┬───────┘
         │
    Bill tạo thành công (8.6)
         │
         ▼
  ┌──────────────┐
  │ Cat 0: ĐÃ RA │──── Bill hủy (8.7) ───► Rollback về vị trí cũ
  │    ĐƠN 🟢    │
  └──────────────┘

  [Song song] Wallet badge render → auto CK/CN flags (8.1)
  [Song song] Gộp đơn → auto transfer flags + tTags (8.9)
```

---

## 9. Copy Mẫu Chốt Đơn

### Flow

```
User mở Chat Modal → Click "Copy mẫu chốt đơn"
  │
  ├── 1. Lấy data đơn từ window.currentChatOrderData
  │
  ├── 2. Fetch template từ API
  │   └── GET /api/odata/MailTemplate(10)
  │       → Trả về { BodyPlain: "template..." }
  │
  ├── 3. Convert order data
  │   ├── Lọc bỏ sản phẩm IsHeld = true
  │   ├── Tính tổng tiền từ products (không dùng TotalAmount)
  │   └── Parse discount từ product notes ("Sale 150", "150k")
  │
  ├── 4. Replace placeholders
  │   ├── {partner.name}    → Tên khách hàng
  │   ├── {partner.phone}   → SĐT
  │   ├── {partner.address} → Địa chỉ + SĐT
  │   ├── {order.code}      → Mã đơn
  │   ├── {order.total}     → Tổng tiền (formatted)
  │   └── {order.details}   → Danh sách SP + tổng
  │
  ├── 5. Copy to clipboard
  │   ├── Primary: navigator.clipboard.writeText()
  │   └── Fallback: hidden textarea + execCommand('copy')
  │
  ├── 6. Paste vào #chatInput (hoặc #chatReplyInput)
  │
  └── 7. Toast notification
      ├── Success: "Đã copy mẫu chốt đơn" (xanh)
      └── Error: "Lỗi khi copy mẫu: {msg}" (đỏ)
```

### Format Output

**Sản phẩm thường**:
```
- Áo thun basic x2 = 500.000đ (ghi chú)
```

**Sản phẩm có giảm giá** (parsed từ note "Sale 150"):
```
- Áo thun premium x3 = 600.000đ
  📝Sale 150 (size L)
```

**Tổng hợp cuối message**:
```
Tổng : 1.500.000đ
Giảm giá: 300.000đ
Tổng tiền: 1.200.000đ

Khách Thanh Toán Phương Thức Chuyển Khoản Hỗ Trợ Báo Trước Giúp Shop Ạ

Dạ c xem okee để e đi đơn cho mình c nhé 😍
```

---

## 10. Tag Sync — TPOS → Tag XL

### Mô tả

Đồng bộ tag TPOS (từ hệ thống POS cũ) sang Tag XL categories/flags/tTags.

### File: `tab1-tag-sync.js`

### Mapping Types

| Type | Mô tả |
|---|---|
| `category` | TPOS tag → Tag XL category (+ optional subTag) |
| `flag` | TPOS tag → Toggle flag |
| `ttag` | TPOS tag → Assign T-tag |
| `prefix` | TPOS tag prefix match → Tạo custom flag cùng tên |

### Flow

```
1. User mở Tag Sync Modal (#tagSyncModal)
2. Cấu hình mappings (TPOS tag → Tag XL target)
3. Lưu mappings vào localStorage('tagSyncMappings_v2')
4. Click "Đồng bộ":
   → Validate ≥ 1 mapping
   → Build task list:
     - Tìm đơn có matching TPOS tag
     - Skip đơn đã có target tag
   → Confirm với user (hiện số đơn sẽ sync)
   → Execute sync với progress bar
   → Show kết quả: X thành công, Y thất bại
```

---

## 11. File Map

| File | Dòng | Vai trò |
|---|---|---|
| `orders-report/js/tab1/tab1-processing-tags.js` | ~4,700 | Core logic: state, rendering, filtering, API, panel, dropdown |
| `orders-report/js/tab1/tab1-tag-sync.js` | ~700 | TPOS → Tag XL sync modal + logic |
| `orders-report/js/tab1/tab1-merge.js` | ~1,750 | Merge orders: Tag XL handling (lines 1645-1744) |
| `orders-report/js/tab1/tab1-table.js` | ~1,200 | Table rendering: `renderProcessingTagCell()` (line 1128) |
| `orders-report/js/tab1/tab1-core.js` | ~450 | Global state: `currentEditOrderData`, `currentChatOrderId` |
| `orders-report/js/tab1/tab1-edit-modal.js` | ~1,800 | Order details modal + chat integration |
| `orders-report/js/utils/copy-template-helper.js` | ~407 | Copy mẫu chốt đơn: template fetch, format, clipboard |
| `orders-report/tab1-orders.html` | ~2,000 | HTML: filter dropdown (301-324), panel button (422), table header (466), chat modal (908) |
| `orders-report/css/tab1-processing-tags.css` | ~2,200 | CSS: panel, cards, dropdown, badges, Tag XL filter |

### Key Global Functions (window.*)

| Function | Mô tả |
|---|---|
| `_ptagXlToggleDropdown()` | Mở/đóng Tag XL filter dropdown |
| `_ptagXlFilterSearch(query)` | Tìm kiếm trong filter |
| `_ptagSetFilter(filterKey)` | Apply filter (single-select) |
| `_ptagToggleFlagFilter(flagKey)` | Toggle flag filter (multi-select) |
| `_ptagTogglePanel()` | Mở/đóng Panel Chốt Đơn |
| `_ptagTogglePin()` | Ghim/bỏ ghim panel |
| `assignOrderCategory(code, cat, opts)` | Gán category cho đơn |
| `toggleOrderFlag(code, key)` | Toggle flag cho đơn |
| `assignTTagToOrder(code, id)` | Gán T-tag cho đơn |
| `removeTTagFromOrder(code, id)` | Tháo T-tag khỏi đơn |
| `renderPanelContent()` | Refresh panel UI |
| `renderProcessingTagCell(code)` | Render cell Tag XL trong table |
| `copyOrderTemplate()` | Copy mẫu chốt đơn |
