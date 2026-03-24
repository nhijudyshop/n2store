# Quy Trình Chốt Đơn Mới — Business Plan

> Redesign hệ thống tag xử lý chốt đơn trên Tab 1

---

## Bối cảnh & Vấn đề

Hệ thống tag xử lý hiện tại có 4 mục phẳng (OKE / Xử lý / Không cần chốt / Khách xã) với 18 tag. Vấn đề:

| Vấn đề | Mô tả |
|---|---|
| Nhập nhằng MỤC OKE | 10 tag con, nhiều tag thực chất là đặc điểm thanh toán (CK, Công nợ) hoặc trạng thái delay (Chờ live, Giữ đơn, Qua lấy) — không phải trạng thái đơn hàng |
| BÁN HÀNG sai chỗ | Nằm trong OKE nhưng đơn chưa sẵn sàng (khách đang mua thêm) |
| Thiếu trạng thái hoàn tất | Không có mục theo dõi đơn đã ra bill xong |
| Không có auto-detect | CK và Công nợ phải đánh tay trong khi data ví khách đã có sẵn |
| Tag T chưa có quản lý riêng | Duyên đánh tag T chờ hàng nhưng không có UI chuyên biệt |
| Thiếu luồng chuyển trạng thái | Không rõ khi nào đơn chuyển từ mục này sang mục khác |

## Mục tiêu redesign

1. Flow rõ ràng, dễ hiểu cho seller mới
2. Tách biệt **trạng thái đơn** (category) vs **đặc điểm đơn** (flags)
3. Tự động hóa: auto-detect flags, auto chuyển trạng thái
4. Quản lý tag T chờ hàng riêng cho Duyên

---

## Cấu trúc 5 Category mới

### 0.A — HOÀN TẤT (ĐÃ RA ĐƠN) 🟢

- **Ý nghĩa**: Đơn đã tạo bill thành công, hoàn thành chốt đơn
- **Cách vào**: TỰ ĐỘNG khi bill tạo thành công (InvoiceStatusStore detect)
- **Cách ra**: TỰ ĐỘNG khi bill bị hủy → trả về vị trí cũ kèm flags cũ
- **Seller thao tác**: Không cần, hệ thống tự xử lý

### 0.C — CHỜ ĐI ĐƠN (OKE) 🔵

- **Ý nghĩa**: Khách đã xác nhận OK, đơn chờ đủ điều kiện để ra bill
- **Cách vào**: Seller gắn thủ công khi khách OKI
- **2 sub-state (auto chuyển theo tag T)**:

| Sub-state | Điều kiện | Ý nghĩa |
|---|---|---|
| **Okie Chờ Đi Đơn** | Không có tag T nào | Đủ hàng, sẵn sàng ra bill |
| **Chờ Hàng** | Có ít nhất 1 tag T | Thiếu hàng, chờ hàng về |

**Chuyển đổi tự động**:
- Duyên gắn tag T → auto chuyển từ "Okie Chờ Đi Đơn" → "Chờ Hàng"
- Duyên tháo hết tag T (hàng về đủ) → auto quay về "Okie Chờ Đi Đơn"

**7 Flags (đặc điểm đơn)**:

| Flag | Auto/Manual | Mô tả |
|---|---|---|
| Trừ công nợ | Auto từ ví + manual | Ví khách có virtual balance (công nợ ảo) |
| CK | Auto từ ví + manual | Ví khách có real balance (đã chuyển khoản) |
| Giảm giá | Auto từ data + manual | Đơn có chiết khấu/sale |
| Chờ live | Manual | Chờ gộp vào live sau, in phiếu soạn hàng ghi chú |
| Giữ đơn | Manual | Giữ 10-20 ngày, khách đã CK đủ nhưng chưa muốn nhận |
| Qua lấy | Manual | Khách qua shop lấy, soạn hàng để kệ qua lấy |
| Khác | Manual | Ghi chú tự do cho trường hợp đặc biệt |

**Logic auto-detect flags**:
- Khi seller gắn đơn vào 0.C → hệ thống tự check ví khách
- Nếu phát hiện CK/CN/Giảm giá → tự gắn flag
- Nếu flag đã được đánh rồi (tay hoặc auto trước đó) → bỏ qua, không đánh trùng
- User luôn có thể tự đánh tay bất kỳ flag nào nếu hệ thống chưa detect

### 2 — MỤC XỬ LÝ 🟠

- **Ý nghĩa**: Đơn cần seller xử lý vấn đề trước khi có thể ra bill
- **Cách vào**: Seller gắn thủ công khi liên hệ khách phát hiện vấn đề
- **Sub-tags**:

| Sub-tag | Mô tả |
|---|---|
| Đơn chưa phản hồi | Khách chưa trả lời tin nhắn + chưa gọi được |
| Đơn chưa đúng SP | Thiếu, dư, sai sản phẩm cần kiểm tra lại |
| Đơn khách muốn xã | Khách muốn bỏ 1 hoặc vài món, đang năn nỉ |
| NCC hết hàng | Báo khách hết hàng hoặc đổi qua mẫu khác |
| Bán hàng | Khách đang mua thêm, seller đang chào hàng |
| Khác | Ghi chú — VD: xử lý bưu cục, khách yêu cầu thêm deal |

**Cách ra**: Xử lý xong → chuyển sang 0.C (khách OK) hoặc 4 (khách xã)

### 3 — MỤC KHÔNG CẦN CHỐT ⚪

| Sub-tag | Mô tả | Bắt buộc |
|---|---|---|
| Đã gộp không chốt | Đơn khách mua 2 page đã gộp vào 1 đơn khác | CÓ TAG |
| Giỏ trống | Đơn không có SP, đã xử lý trước đó | CÓ TAG |

### 4 — MỤC KHÁCH XÃ SAU CHỐT ĐƠN 🔴

| Sub-tag | Mô tả |
|---|---|
| Khách chủ động hủy nguyên đơn | Khách báo lý do không nhận: đi công tác, không có tiền, đổi ý |
| Khách không liên lạc được | Sau buổi chốt đơn vẫn không liên lạc được, bắt buộc xã |

---

## Flow chốt đơn thực tế (SOP cho seller)

### Giai đoạn 1: Chuẩn bị

```
BƯỚC 1: Gộp đơn
  └── Chọn chiến dịch live → gộp đơn khách mua 2 page trùng SĐT

BƯỚC 2: Đẩy tin nhắn chốt đơn
  └── Lọc bỏ tag "Đã gộp không chốt", "Giỏ trống"
  └── Chọn đồng loạt đơn còn lại → đẩy tin nhắn

BƯỚC 3: Chia STT cho seller
  └── VD: Bạn A: 1→300, Bạn B: 301→600
```

### Giai đoạn 2: Chốt đơn (seller thao tác chính)

```
BƯỚC 4: BẮT ĐẦU CHỐT — Đơn mới CHƯA CÓ TAG XỬ LÝ NÀO
  │
  │  [SONG SONG] Duyên gắn tag T chờ hàng cho các đơn thiếu hàng
  │
  └── Seller liên hệ khách từng đơn (chat / gọi):
      │
      ├── ✅ Khách OKI đơn hàng
      │   └── Gắn 0.C → "OKIE CHỜ ĐI ĐƠN"
      │       • Hệ thống auto-detect: CK, Công nợ, Giảm giá
      │       • Seller thêm flags tay nếu cần: Qua lấy, Chờ live, Giữ đơn
      │       • Nếu Duyên đã gắn tag T → auto hiện sub-state "Chờ Hàng"
      │
      ├── ❌ Khách KHÔNG phản hồi
      │   └── Gắn MỤC XỬ LÝ → "Đơn chưa phản hồi"
      │
      ├── ⚠️ Khách phản hồi CÓ VẤN ĐỀ
      │   └── Gắn MỤC XỬ LÝ → chọn sub-tag phù hợp
      │
      ├── 🚫 Đơn không cần chốt
      │   └── Gắn MỤC KHÔNG CẦN CHỐT (3)
      │
      └── 🔴 Khách xã đơn
          └── Gắn MỤC KHÁCH XÃ (4)

  → Mục tiêu: Phân loại hết đơn, trống trang (không còn đơn chưa có tag)
```

### Giai đoạn 3: Xử lý đơn có vấn đề

```
BƯỚC 5: XỬ LÝ các đơn trong Mục Xử Lý (2)
  │
  ├── Xử lý xong, khách OKI → chuyển sang 0.C "Okie Chờ Đi Đơn"
  └── Không xử lý được → chuyển sang Mục 4 (Khách xã)
```

### Giai đoạn 4: Ra đơn

```
BƯỚC 6: RA ĐƠN — Vào 0.C, filter theo sub-state + flags

  A. Đơn "Okie Chờ Đi Đơn" KHÔNG có flag delay (Chờ live/Giữ đơn/Qua lấy):
     │
     ├── Đơn thường + đơn Giảm giá (không flag CK/CN):
     │   → Chọn đồng loạt → chỉnh kênh → xác nhận in phiếu → chụp bill → gửi cảm ơn
     │   (Giảm giá đã cài sẵn trong phiếu bán hàng nhanh, không cần xử lý riêng)
     │
     └── Đơn có flag CK / Trừ công nợ:
         → Chọn từng đơn → chỉnh kênh → chiết khấu/check công nợ → ghi chú → in phiếu

  B. Đơn có flag "Qua lấy":
     │
     ├── Đủ hàng: In phiếu soạn hàng → soạn hàng để kệ qua lấy → CHỜ khách đến → mới ra bill
     └── Chờ hàng: In phiếu chờ hàng ghi "QUA LẤY" → khi hàng về CSKH nhắn khách qua lấy

  C. Đơn có flag "Chờ live" / "Giữ đơn":
     → In phiếu soạn hàng + ghi chú → chờ trigger (live sau / hết hạn giữ)

  D. Đơn "Chờ Hàng" (có tag T):
     → In phiếu chờ hàng + ghi chú món chờ → chờ hàng về
     → Khi hàng về, Duyên tháo tag T → auto chuyển về "Okie Chờ Đi Đơn" → ra đơn

BƯỚC 7: AUTO-TRANSITION
  │
  ├── Bill tạo thành công → TỰ ĐỘNG chuyển sang 0.A HOÀN TẤT
  │   (lưu snapshot vị trí cũ + flags để rollback)
  │
  └── Bill bị hủy → TỰ ĐỘNG trả về 0.C vị trí cũ kèm flags cũ
```

### Giai đoạn 5: Sau ra đơn

```
BƯỚC 8: Gom hàng + Bàn giao
  └── Cuối buổi: đơn chưa xử lý xong → bao trắng → lên kệ → bàn giao
```

---

## Tag T chờ hàng (Duyên quản lý)

- **Ai quản lý**: Duyên (người đặt hàng NCC, nắm SL hàng về)
- **Mục đích**: Đánh dấu đơn nào thiếu hàng, thiếu món gì
- **Tên tag**: VD "T1 Áo smi trắng tag hoa", "T2 Quần jean xanh"
- **Gắn**: Duyên gắn tag T vào đơn → hệ thống auto chuyển sub-state "Chờ Hàng" trong 0.C
- **Tháo**: Khi hàng về đủ, Duyên tháo tag T → auto chuyển về "Okie Chờ Đi Đơn"
- **UI**: Section riêng trong panel tag xử lý, seller chỉ xem không sửa

---

## Tổng hợp thay đổi so với hệ thống cũ

| Cũ | Mới | Loại thay đổi |
|---|---|---|
| 4 category phẳng | 5 category có logic flow | Restructure |
| "ĐI ĐƠN" (tag riêng) | "Okie Chờ Đi Đơn" (sub-state mặc định) | Rename + simplify |
| "CHỜ HÀNG" (tag riêng) | Auto sub-state từ tag T | Automation |
| "KHÁCH CKHOAN" (tag riêng) | Flag "CK" auto-detect từ ví | Automation |
| "TRỪ CÔNG NỢ" (tag riêng) | Flag "Trừ công nợ" auto-detect từ ví | Automation |
| "GIẢM GIÁ" (tag riêng) | Flag "Giảm giá" auto + manual | Automation |
| "BÁN HÀNG" (MỤC OKE) | Sub-tag MỤC XỬ LÝ | Reclassify |
| "CHỜ LIVE + GIỮ ĐƠN" (1 tag) | 2 flags riêng: "Chờ live", "Giữ đơn" | Split + reclassify |
| "QUA LẤY" (tag riêng) | Flag "Qua lấy" | Reclassify |
| "ĐÃ ĐI ĐƠN GẤP" (tag riêng) | Bỏ — auto vào 0.A khi detect bill | Automation |
| Không có mục hoàn tất | 0.A HOÀN TẤT (auto) | New |
| Bill hủy → seller tự xử lý | Auto rollback về vị trí cũ | Automation |
| Tag T không có UI riêng | Section quản lý trong panel | New UI |
