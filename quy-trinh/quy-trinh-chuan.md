# Quy Trình Nghiệp Vụ — N2Store (Shop thời trang nữ online)

> Bản MD chuẩn để AI agent đọc nhanh. Cập nhật thủ công khi quy trình chuẩn thay đổi.

---

## Sơ đồ luồng tổng quan (8 bộ phận)

1. **Nhập hàng & Làm mã** → 2. **Live Sale** → 3. **Trả hàng theo phiếu** → 4. **Chốt đơn (Sale)**
↓
5. **Đi chợ & Đối soát** → 6. **Đóng đơn & Giao shipper** → 7. **CSKH** → 8. **Check IB**

---

## BP1 — Nhập hàng & Làm mã (7 bước)

### Bước 1: Nhận hàng & Cân hàng
- Khi hàng hóa được gửi về shop, bạn phụ trách nhận hàng sẽ **cân cục hàng** xem bao nhiêu ký.
- Đưa số liệu **CÂN NẶNG + HÌNH ẢNH CÂN NẶNG** lên web của shop.
- Sau khi cân xong mới đưa cục hàng vào trong khu làm hàng (khu làm mã).

### Bước 2: Khui hàng & Phân loại theo nhà cung cấp
- Khui cục hàng ra, bên trong sẽ có nhiều cục hàng nhỏ của nhiều nhà cung cấp khác nhau.
- Phân chia hàng theo từng nhà cung cấp.
- Đếm số lượng sản phẩm của từng nhà.

### Bước 3: Đối soát với bill nhà cung cấp
- Bạn làm mã chính đối soát số lượng thực tế so với bill bên nhà cung cấp gửi.
- Kiểm tra xem có khớp về: **số lượng**, **sản phẩm**, **giá nhập** hay không.
- ⚠️ **Lưu ý quan trọng:** Nếu có sai lệch phải xử lý với nhà cung cấp trước khi tiếp tục các bước sau.

### Bước 4: Nhập sản phẩm lên web shop
- Nhập đầy đủ thông tin: **tên sản phẩm + giá bán + giá nhập + số lượng + hình ảnh sản phẩm** vào web của shop.
- Sau khi nhập xong **xuất excel** từ web.
- Vào `Tpos` để mua hàng (tức là mua sản phẩm để in ra tem mã vạch cho sản phẩm đó).

### Bước 5: Rút mẫu & Dán tem mã
- Tất cả sản phẩm mới về shop sẽ được **rút 1 cái** để ủi và làm mẫu live.
- Khi tất cả sản phẩm đã được dán tem mã đầy đủ sẽ được đưa vào kệ.
- 💡 **Lưu ý:** Hàng đăng bài bán, hàng về để đi đơn trả khách thì **không cần rút mẫu**.

### Bước 6: Sắp xếp hàng vào kệ
- Phân chia theo mục sản phẩm:
  - 👖 Quần → kệ quần
  - 👕 Áo → kệ áo
  - 👗 Set, đầm, v.v. → đúng khu vực

### Bước 7: Đưa mẫu lên lầu (phòng live)
- Sản phẩm được rút mẫu để ủi sẽ được đưa lên lầu.
- Phân theo từng sào của khu vực sản phẩm đó.
- Để mẫu live — khi xuống live sẽ lựa mẫu vào live.

---

## BP2 — Live Sale (5–6 nhân sự)

### Nhân sự khu vực live
- Tối thiểu 5–6 người, mục tiêu giảm bớt số lượng theo thời gian tối ưu quy trình.

### Trong phòng live — 2 bạn:
1. **Bạn 1 — Cầm đồ cho mẫu:** Đứng trong phụ cầm đồ cho mẫu live
2. **Bạn 2 — Nói phụ mẫu live:** Báo lại số ký và tên sản phẩm để khách dễ comment đặt hàng

### Ngoài khu vực live — 3 bạn:

#### Bạn 1 — Nhận oder (bấm phiếu + đặt hàng nhà cung cấp)
- Bấm phiếu khách đặt hàng ra.
- Đặt hàng sản phẩm với nhà cung cấp (nhận oder số lượng sản phẩm).

#### Bạn 2 — Phân phiếu
- Phân phiếu theo từng sản phẩm.
- Ghi tên + mã sản phẩm lên phiếu.
- Báo lại trên live: *"Khách mới cọc trước 100k để shop giữ hàng"*
- Chuyền phiếu ra cho bạn ngồi máy.

#### Bạn 3 — Ngồi máy (check chuyển khoản + nhập giỏ hàng)

**📲 Check khách mới + báo cọc:**
- Nhắn câu báo cọc **100k** + gửi **mã QR** cho khách.
- Sau **15–20 phút** khách chưa phản hồi → nhắn hối cọc.

**💳 Check chuyển khoản:**
- Vào web shop xem lịch sử biến động số dư, kiểm tra đúng số tiền khách chuyển chưa.
- Sau đó nhắn báo khách ví dụ: *"Dạ đã nhận 100k ACB 23/2"*

**⚠️ Check khách boom (khách có lịch sử boom hàng):**
- 🚫 Bắt buộc phải cọc mới để đơn:
  - Khách mới boom gần đây (2 năm trở lại)
  - Hoàn đơn
  - Xả đơn trước nhiều sản phẩm
- ✅ Trường hợp liên hệ được để đơn lại:
  - Khách boom trên 2 năm, gọi được và cho lại thông tin đúng
  - Chị Nhi ưu tiên cho để đơn lại

**👤 Khách cũ (đã mua hàng trước đó, có thông tin):**
- Chỉ cần xác nhận lại địa chỉ → **không cọc**
- Đánh dấu **OK** và đưa bill lại cho bộ phận chia bill

**✅ Khách đã có thông tin và đã chuyển khoản:**
- Báo nhận tiền trong tin nhắn
- Đánh dấu ✅ lên phiếu và đưa lại cho bộ phận chia bill

**🚫 Khách không cọc:**
- Gửi phiếu lại để báo trừ sản phẩm đó
- Khi nào khách chuyển khoản thì báo để đặt hàng lại
- Hạn chế khách lạ đặt hàng sau live mà không có thông tin

**🛒 Nhập sản phẩm vào giỏ hàng:**
- Nhập mã sản phẩm → Nhập STT của khách hàng trên phiếu → Bấm `Update`
- Đưa lại cọc phiếu cho bạn nhận oder để khi hàng về trả hàng theo từng phiếu của khách.

### Sau khi kết thúc live
- Có bạn xuống xin thông tin lại hoặc nhắc lại khách để khách chuyển khoản → tránh mất khách hoặc mất đơn hàng.

---

## BP3 — Trả hàng theo phiếu (Nhận oder)

> Shop live **2 ngày**, làm đơn **1 ngày**.

### Bước 1: Nhận hàng từ bộ phận làm mã
- Khi kết thúc buổi live, hàng về thì bên làm mã làm xong hoàn tất sản phẩm có mã.
- Bạn nhận oder xuống và trả hàng theo từng mẫu, từng phiếu khách đặt.
- Trả hàng hết phiếu thì dừng.

### Bước 2: Xử lý khi hết hàng còn phiếu
- ⚠️ **Hết hàng mà còn phiếu đặt:** Bắt buộc bạn nhận oder phải **đặt lại số lượng đang còn thiếu** để trả cho đủ.
- **Trường hợp hết hàng hoàn toàn:** Bạn nhận oder phải nhắn tin cho khách biết để **hủy mẫu** hoặc **đổi màu** nếu có.

### Bước 3: Đưa hàng lên kệ theo STT — "ĐI CHỢ"
- Khi sản phẩm đã có phiếu tên khách hàng → chuyển sang bước đi chợ.
- **2 bạn phụ trách đi chợ:** đưa hàng lên kệ theo đúng STT.
- Hàng trên kệ phải được sắp xếp đúng STT để bộ phận đi chợ có thể lấy nhanh và chính xác.

---

## BP4 — Chốt đơn (Sale) (3 bạn sale)

### Bước 1: Gộp đơn & Đẩy tin nhắn

**🔀 Gộp đơn:**
- Vào web shop → chọn **chiến dịch live** → chọn thẻ **Gộp đơn**
- Khách mua ở 2 page sẽ được gộp sản phẩm vào **1 giỏ**, giỏ còn lại sẽ được gắn thẻ `Đã gộp không chốt`

**📨 Đẩy tin nhắn chốt đơn:**
- Lọc ngày theo đợt live đó
- Vào **Cài đặt cột** → bỏ chọn (không đẩy tin nhắn) các thẻ:
  - `Đã gộp không chốt`
  - `Giỏ trống`
  - `Đã đi đơn gấp`

**Chia số đơn cho sale:** Bạn sale nào làm số bao nhiêu chịu trách nhiệm với đơn đó.

### Bước 2: Xử lý phản hồi khách

**✅ Khách xác nhận OKI:**
- Gắn thẻ `OK [tên bạn sale]`

**💰 Đơn có công nợ:**
- Trừ thu về (tp): Đơn cũ có hàng lỗi / chật / nhầm mẫu size
- Trừ công nợ (tỉnh): Hàng đơn trước khách nhận có vấn đề → khách gửi lên; Đơn cũ khách chuyển khoản dư

**📋 Ra bill đi đơn (thông thường):**
- Báo cho 2 bạn ở ngoài khu vực đi chợ vào lấy bill đi đơn đúng theo STT trên bill

**🚚 Đơn Bookgrap:**
- Ra bill → chọn "Bán hàng shop"
- Đối soát sản phẩm → đưa đơn cho shipper
- Đơn thu COD: đưa **tiền mặt cho anh Phước** + bill

**⏳ Khách chưa OKI:**
- Gắn thẻ `XỬ LÝ ĐƠN [tên bạn sale]`
- Nhắn tin hối khách hoặc gọi để chốt đơn

**🚫 Khách không phản hồi sau nhiều lần liên hệ:**
- Bắt buộc **xả đơn**
- Note boom khách đó trên `Tpos`

### Bước 3: Bàn giao đơn xử lý khi lên live tiếp
- Phải bàn giao lại cho bạn nhận trách nhiệm xử lý những đơn sau live. Không được bỏ sót đơn.

---

## BP5 — Đi chợ & Đối soát hàng (2 bạn đi chợ)

### Khu vực đi chợ — 2 bạn phụ trách

#### Bước 1: Nhận bill & Đi chợ
- Nhận bill từ bạn sale.
- Đi chợ theo đúng STT.
- Check lại số lượng của kệ đó xem có khớp với STT không.
- Bỏ bao đem vào trong tới khu đối soát sản phẩm trên `Tpos`.

### Khu vực đối soát — Sơ đồ xử lý

```
📦 Nhận bao hàng từ đi chợ
        ↓
  Đơn đủ & đúng mã sản phẩm?
    ├── ✅ Đúng → Khu gói hàng
    └── ❌ Sai mã
          ↓
      Bạn đi chợ lấy đúng STT?
        ├── ✅ Đúng STT → Báo bạn làm đơn STT đó kiểm tra sai mã → sửa lại
        └── ❌ Sai STT → Báo bạn đi chợ check lại hàng trên kệ có bị lấy nhầm không
```

---

## BP6 — Đóng đơn & Giao shipper (3 bước)

### Bước 1: Đóng gói
- Nhận bao hàng đã được đối soát thành công.
- Kiểm tra lại số lượng thực tế xem có khớp với trên bill không.
- Đóng vào bao và **dán bill niêm yết bao hàng lại**.

### Bước 2: Phân đơn theo khu vực
- Phân đơn theo: **THÀNH PHỐ** và **TỈNH**

### Bước 3: Xuất excel & Quét mã vận đơn
- Vào `Tpos` xuất excel theo từng khu vực.
- Highlight lên để quét mã vận đơn.

**Đơn không có trong excel:** Để riêng ra và đưa lại vào trong cho bạn làm đơn đó.

**Tích đơn xong hết mà thiếu đơn:**
- Vào trong báo các bạn check lại tại sao không thấy đơn
- Nếu đơn có vấn đề: báo xóa bill
- Đơn chưa đóng vào bao: đóng đơn rồi đưa ra ngoài

**Khi đã đủ đơn:** Gọi ship qua lấy hàng.

---

## BP7 — CSKH (Chăm sóc khách hàng — Xử lý đơn bưu cục & ship) — Trực liên tục

> **Nhiệm vụ chính:** Ngồi trực để liên hệ và xử lý những đơn ở bưu cục và bên ship khi khách liên hệ và giao hàng được cho khách.

### Bước 1: Theo dõi & xử lý đơn tại bưu cục
- Khi đơn hàng đang ở bưu cục gặp vấn đề, bạn CSKH phải **chủ động liên hệ bưu cục** để nắm tình trạng đơn.
- Phối hợp với bưu cục để hỗ trợ giao lại hoặc xử lý theo từng trường hợp cụ thể.
- Theo dõi và cập nhật trạng thái đơn liên tục.

### Bước 2: Nhập thông tin & xử lý hoàn
- Đối với những đơn liên hệ nhiều lần hoặc không thể liên hệ được khách, **bắt buộc phải hoàn**.
- Bạn CSKH nhập vào web thông tin khách + đơn hàng để chuẩn bị nhận hoàn.
- Khi hàng hoàn về: nhập nhận trả hàng → hóa đơn được hoàn trả lại vào kho sản phẩm + **khách được lưu boom**.

### Bước 3: Kiểm tra & nhận hàng hoàn
- Khi bên ship mang hàng hoàn về shop: nhận đủ số đơn, kiểm tra khớp với tờ giấy hàng hoàn.
- Đưa vào trong cho bạn bên bộ phận CSKH trả hàng hoàn.
- Khi đã trả hàng hoàn xong: check lại số tiền và **báo lên group là nhận đủ hàng**.

### Bước 4: Đưa hàng hoàn lên phòng live
- Hàng hoàn khi được trả xong sẽ đưa lên phòng live.
- Có bạn chuyên về hàng boom / hàng hoàn:
  - 🪝 Lấy ra móc mẫu lại lên
  - 🔀 Xào hàng lẻ
  - 🏷️ Note ký hiệu `SL` nếu có số lượng
  - 📦 Hàng có SL: để lên kệ trong phòng live

> 💡 Khi live sale cũng biết `SL` mà báo khách — giúp tăng tỷ lệ chốt đơn cho hàng hoàn.

---

## BP8 — Check IB (Tin nhắn — Bán ngoài live)

> **Nhiệm vụ chính:** Bán sản phẩm đăng bài hoặc nhận sản phẩm trên live sau khi đã tắt live. Hỗ trợ khách khi nhận đơn về có vấn đề cần xử lý.

### Bước 1: Nhận oder & Gắn thẻ chờ (hàng oder)
- Nhận oder và báo khách chờ **1–2 ngày**.
- Vào web nhập thông tin khách hàng.
- Gắn thẻ chờ sản phẩm: `"TÊN SẢN PHẨM KHÁCH ĐẶT"`
- Khi hàng về: vào thẻ chờ món đó và **ra đơn đồng loạt** (gắn thẻ dành cho hàng oder).

### Bước 2: Đi đơn ngay (hàng có sẵn)
- Note tên khách lên trên bao sản phẩm đó.
- Đi đơn luôn.

### Bước 3: Xử lý đổi size / lỗi sản phẩm
Khách nhận hàng về có vấn đề bị lỗi hoặc muốn đổi size:
- **Khách ở TP:** Đi đơn **thu về** (shop gửi hàng mới, thu hàng cũ).
- **Khách ở tỉnh:** Khách **gửi sản phẩm cần đổi lên shop**, nhận được sẽ trừ tiền sau.
