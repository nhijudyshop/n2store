<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Hướng dẫn VẬN HÀNH tem đơn vị + QR (cho nhân viên). Thiết kế kỹ thuật: PER-UNIT-QR-PLAN.md -->

# 📦 Hướng dẫn vận hành — Tem đơn vị + QR + Kho rớt xả

> Tài liệu **cho nhân viên** (kho / livestream / đóng gói). Bản kỹ thuật: [PER-UNIT-QR-PLAN.md](PER-UNIT-QR-PLAN.md).

---

## 0. Hai con số ĐỪNG nhầm

|               | Là gì                            | Ví dụ                 | Sinh khi nào                                                   |
| ------------- | -------------------------------- | --------------------- | -------------------------------------------------------------- |
| **Mã đơn vị** | đánh số TỪNG MÓN vật lý của 1 SP | `MSP-001`, `MSP-002`… | lúc **nhận hàng / in tem** (máy tự cấp, chạy toàn cục theo SP) |
| **STT kệ**    | ô kệ vật lý của 1 ĐƠN khách      | kệ `1`, `2`, `3`…     | lúc **tạo giỏ livestream** (STT của đơn)                       |

→ **Quét tem lúc đóng gói = nối món vật lý vào ô kệ của đơn.** (mô hình _put-wall / kệ chia đơn_).

---

## 1. Luồng 5 bước

### B1 — Nhận hàng (Sổ Order)

Sổ Order → panel **Nhận hàng** → nhập SL nhận → bấm **In tem**.
→ Máy tự **cấp mã đơn vị** `MSP-001..N` (đóng dấu **NCC + đợt** của từng món) rồi in N tem **khác nhau**.

### B2 — Tem in ra (khổ 2-Tem 66×21mm)

```
┌───────────────────┐
│  Áo thun đen       │  ← tên SP
│  ▓▓▓  Size L       │  ← QR | biến thể
│  ▓▓▓  120.000đ     │  ← QR | giá
│  MSP-001           │  ← MÃ ĐƠN VỊ (mỗi tem 1 mã riêng)
└───────────────────┘
   QR → nhijudy.store/web2/unit-scan/?u=...
```

### B3 — Dán tem lên đúng từng món.

### B4 — Livestream

Kéo SP vào giỏ khách → tạo đơn. Mỗi đơn có sẵn **STT kệ**.

### B5 — Đóng gói = QUÉT

Cầm món → quét QR →

- Hiện: **SP · NCC · đợt · đã in mấy lần · trạng thái**.
- Hiện to **"➡️ BỎ VÀO KỆ ⟨STT⟩"** (đơn cũ nhất còn thiếu) + danh sách đơn khác cần SP này.
- Bỏ món vào kệ đó → bấm **Gán**.
- Ô kệ **đủ hàng** → **"🎉 Kệ N ĐỦ HÀNG → đóng gói"** → gói + gửi.

---

## 2. Trang Quét tem (`web2/unit-scan/`)

**3 cách vào:**

1. Menu **Bán Hàng → Quét tem đóng gói 📱**.
2. **Quét QR bằng camera điện thoại** → mở thẳng trang.
3. Điện thoại → **"Thêm vào màn hình chính"** → thành **app Máy quét** (PWA).

**Trên màn:**

- Camera quét liên tục (🔦 đèn flash). Tem mờ → **gõ tay** `MSP-007` vào ô _Tra_.
- Thẻ kết quả: ảnh/tên SP · chip **NCC · đợt · 🖨 in N lần · trạng thái** · badge **Rớt xả** (nếu là hàng dư).
- Ô **BỎ VÀO KỆ** + danh sách đơn (tên · sđt · đặt/đã-có/còn-thiếu) → nút **Gán**.
- **Lịch sử đơn vị**: MINT → PRINT → ASSIGN (món này từng vào đơn nào).
- Nút **🖨 In lại tem này**.
- Quét món **đã gán** → hiện **"Đã ở kệ ⟨STT⟩"**.

---

## 3. In lại tem hỏng/mất

> Mã + QR **giữ nguyên** → in lại quét vẫn ra đúng món/đơn. Mỗi lần in → **đếm in +1**.

| Cách                     | Ở đâu                                                          |
| ------------------------ | -------------------------------------------------------------- |
| **1 tem**                | Trang Quét → gõ/quét mã → **In lại tem này**                   |
| **Nhiều tem / chọn lọc** | **Kho SP** → nút **In lại tem** → tìm SP → tick `MSP-00x` → in |
| **Cả lô**                | Sổ Order → panel nhận hàng → **In tem** lại (ra đúng mã cũ)    |

---

## 4. Kho rớt xả (`web2/clearance/`)

Hàng dư sau chiến dịch (còn tồn, hết đơn cần).

- **Tự vào kho xả**: món còn tồn + SP **đã bán** + **hết đơn cần** + **qua 1 ngày**.
- **Tier theo tuổi tồn**: `<30 ngày` Rớt xả · `30–90` Xả mạnh · `>90` Thanh lý.
- Trang: tổng tem · **giá-trị-kẹt** mỗi tier · nhóm theo SP.
- Nhầm? Bấm **"Giữ kho chính"** → đưa ngược tức thì.
- Menu: **Mua hàng → Kho rớt xả 🏷️**.

---

## 5. Vòng đời 1 món

```
IN_STOCK ──quét gán──► ASSIGNED ──gói──► PACKED ──gửi──► SHIPPED
   │                       │
   │◄── "Giữ kho chính" ───┘ (huỷ gán)
   ├──(dư + qua 1 ngày)──► hiện ở KHO RỚT XẢ
   └── trả hàng ──► RETURNED
```

---

## 6. Lưu ý

- **1 SP nhiều NCC/đợt**: mỗi món truy đúng nguồn (chip NCC + đợt).
- **Đơn đặt SL > 1**: ô kệ "còn thiếu N" → quét N món vào **cùng kệ** tới khi đủ.
- **Realtime**: máy A gán → máy B/C tự cập nhật (không cần refresh).
- **Nhiều máy quét cùng lúc** OK (mã do máy chủ cấp, không trùng).
- **Hàng chưa từng bán** KHÔNG bị tính rớt xả (chỉ hàng đã qua chiến dịch).

---

## 7. Vào menu ở đâu

| Việc                | Menu                                      |
| ------------------- | ----------------------------------------- |
| Quét đóng gói       | **Bán Hàng → Quét tem đóng gói 📱**       |
| Kho SP + in lại tem | **Mua hàng → Kho SP Web 2.0**             |
| Hàng rớt xả         | **Mua hàng → Kho rớt xả 🏷️**              |
| Nhận hàng + in tem  | **Mua hàng → Sổ Order** (panel nhận hàng) |
