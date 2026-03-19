# Kế Hoạch Hiện Thực Quy Trình N2Store — Implementation Tracker

> **Ngày tạo:** 2026-03-18 | **Tổng thời gian:** ~9 tuần (5 sprint)
> **Mục tiêu:** Kết nối và hoàn thiện các module giữa Duyên (đặt hàng) ↔ Sale (chốt đơn) ↔ CSKH (chăm sóc)

---

## Kế hoạch này để làm gì? (Giải thích đơn giản)

Hiện tại khi shop live bán hàng, quy trình từ **đặt hàng nhà cung cấp** đến **chốt đơn cho khách** đang bị đứt đoạn thông tin:

- **Duyên (người đặt hàng)** đặt hàng nhà cung cấp qua Zalo/điện thoại nhưng các bạn Sale không thấy được số liệu, phải chờ Duyên note từng đơn một → rất chậm và dễ sai.
- **Nhà cung cấp giao hàng từng phần** (ví dụ đặt 100 cái nhưng chỉ về 60), Sale không biết để cân đối đi đơn cho khách hay báo khách hủy.
- **Hệ thống KPI** (tính thưởng cho Sale) đang có lỗ hổng — Sale có thể thêm mã nhầm trước khi gửi tin nhắn rồi đổi lại, KPI vẫn cộng sai.
- **Hàng rớt/xả** (khách hủy, hàng dư) chưa quản lý theo từng đợt live nên Sale khó tìm hàng available.
- **Bộ phận CSKH** khi tiếp nhận đơn từ Sale thiếu thông tin tổng quan, đi đơn chậm.

**Mục tiêu cuối cùng:** Kết nối thông tin giữa Duyên (đặt hàng) ↔ Sale (chốt đơn) ↔ CSKH (chăm sóc khách) thành một luồng thông suốt. **Ai cũng thấy được số liệu cần thiết, không phải chờ đợi hay hỏi nhau.**

---

## Tổng quan vấn đề

| # | Vấn đề | Ảnh hưởng | Giải pháp |
|---|--------|-----------|-----------|
| 1 | Sale không thấy số liệu Duyên đặt NCC | Chờ Duyên note thẻ → chậm | Supply Status panel ở Tab1 |
| 2 | NCC giao hàng từng phần, Sale không biết | Không cân đối được đi đơn/hủy | Mở rộng Sổ Sách + delivery batches |
| 3 | KPI cộng sai khi đổi mã sau gửi tin | Thống kê không chính xác | BASE lock + grace period + reconcile |
| 4 | Hàng rớt xả chung, không theo đợt live | Sale mất thời gian tìm | Filter per-campaign |
| 5 | CSKH thiếu thông tin khi tiếp nhận đơn | Đi đơn chậm, thiếu chính xác | Handover view (bảng filter) |

---

## Sprint 1: Tuần 1–2 (Phase 1A + Phase 2)

> **Mục tiêu (dễ hiểu):** Cho phép Duyên ghi nhận hàng về từng phần trên Sổ Sách (thay vì chỉ ghi tổng). Ví dụ: đặt 100 cái, hàng về 60 trước → hệ thống tự hiện "chờ giao 40". Đồng thời, khi khách hủy hàng (hàng rớt/xả), hệ thống sẽ ghi nhận thuộc đợt live nào để các bạn Sale dễ tìm.
>
> **Kết quả đạt được:** Sale nhìn vào Sổ Sách biết ngay hàng nào đã về, hàng nào đang chờ, hàng nào NCC hủy. Hàng rớt được phân loại theo đợt live.

### Phase 1A — Mở rộng Sổ Sách cho giao hàng từng phần

- [ ] **1A.1** Thêm fields mới vào data model `live_ledger/{campaignId}/products/{productId}`:
  - `nccPendingQty` (auto-calc: duyenOrderQty - nccDeliveredQty - nccCancelledQty)
  - `nccCancelledQty` (NCC hủy không giao)
  - `deliveryBatches[]` (lịch sử giao từng lô: qty, date, note, recordedBy)
  - `deliveryStatus` ("pending" | "partial" | "complete" | "cancelled")
- [ ] **1A.2** Sửa `overview-ledger.js` → `refreshFromCachedData()`: populate fields mới
- [ ] **1A.3** Sửa `overview-ledger.js` → `renderLedgerTable()`: thêm cột "SL Chờ giao", "SL NCC hủy"
- [ ] **1A.4** Sửa `overview-ledger.js` → `saveCell()`: auto-tính `nccPendingQty` và `deliveryStatus`
- [ ] **1A.5** Thêm badge màu cho `deliveryStatus`: xanh=đủ, vàng=từng phần, đỏ=chưa giao, xám=hủy
- [ ] **1A.6** Mini form nhập lô giao hàng (click vào ô NCC giao → popup qty + date + note)
- [ ] **1A.7** Test: Duyên nhập "đặt 100" → ghi "về 60" → badge hiện "Từng phần", chờ giao = 40

### Phase 2 — Hàng rớt xả theo đợt live

- [ ] **2.1** Sửa `dropped-products-manager.js` → `addDroppedProduct()`: thêm `campaignId` + `campaignName`
- [ ] **2.2** Thêm dropdown filter: "Tất cả" / "Live hiện tại" / chọn đợt live cụ thể
- [ ] **2.3** Sửa render để filter theo campaign đang chọn
- [ ] **2.4** Backward compatible: items cũ không có campaignId → hiển thị ở "Tất cả"
- [ ] **2.5** Test: Thêm hàng rớt trong live → filter "Live hiện tại" → chỉ thấy hàng đợt này

**Files chính Sprint 1:**
- `orders-report/js/overview/overview-ledger.js`
- `orders-report/js/managers/dropped-products-manager.js`

---

## Sprint 2: Tuần 3–4 (Phase 1B + Phase 3A)

> **Mục tiêu (dễ hiểu):** Đưa thông tin đặt hàng nhà cung cấp lên màn hình chốt đơn (Tab1) để Sale thấy ngay khi mở đơn hàng. Ví dụ: Sale mở đơn khách, bên cạnh mỗi sản phẩm sẽ có icon cho biết "Duyên đã đặt NCC 50 cái, đã về 30, đang chờ 20". Ngoài ra, thêm bảng thống kê nhanh số đơn mỗi nhân viên đã xử lý.
>
> **Kết quả đạt được:** Sale không cần hỏi Duyên nữa — nhìn vào màn hình chốt đơn là biết hàng có đủ hay chưa. Quản lý thấy được ai xử lý bao nhiêu đơn.

### Phase 1B — Supply Status panel cho Sale ở Tab1

- [ ] **1B.1** Tạo mới `orders-report/js/tab1/tab1-supply-status.js`
- [ ] **1B.2** Listen Firebase `live_ledger/{campaignId}/products` (read-only)
- [ ] **1B.3** Render thanh summary thu gọn: tổng SP đặt / đã giao / đang chờ / thiếu hàng
- [ ] **1B.4** Icon trạng thái nhỏ bên cạnh mỗi sản phẩm trong đơn hàng
- [ ] **1B.5** Click icon → popover: Duyên đặt X, NCC giao Y, còn chờ Z
- [ ] **1B.6** Sửa `tab1-orders.html`: thêm script tag + container `<div id="supplyStatusBar">`
- [ ] **1B.7** Test: Sale mở Tab1 → thấy thanh summary → click SP → thấy chi tiết supply

### Phase 3A — Thống kê Processing Tags theo nhân viên

- [ ] **3A.1** Sửa `tab1-processing-tags.js`: thêm function `_ptagCalculateEmployeeStats()`
- [ ] **3A.2** Nút "Thống kê" trong panel Processing Tags header
- [ ] **3A.3** Render bảng: hàng = nhân viên, cột = 4 mục (OKE, XỬ LÝ, KHÔNG CHỐT, XÃ)
- [ ] **3A.4** Click vào cell → filter bảng chính theo NV + category
- [ ] **3A.5** Test: Gắn tag 10 đơn → mở thống kê → số liệu đúng per-NV

**Files chính Sprint 2:**
- `orders-report/js/tab1/tab1-supply-status.js` (TẠO MỚI)
- `orders-report/tab1-orders.html`
- `orders-report/js/tab1/tab1-processing-tags.js`

---

## Sprint 3: Tuần 5–6 (Phase 3B + Phase 4D)

> **Mục tiêu (dễ hiểu):** Tạo chế độ "Bàn giao" cho bộ phận CSKH. Khi Sale đi live, CSKH tiếp nhận đơn hàng sẽ bật chế độ này lên — thấy tổng quan tất cả đơn đang xử lý, lọc theo nhân viên sale, theo trạng thái (OKE/đang xử lý/hủy), kèm thông tin hàng đã về chưa. Ngoài ra, hệ thống KPI sẽ được tách theo từng đợt live.
>
> **Kết quả đạt được:** CSKH bật chế độ bàn giao → thấy rõ đơn nào cần đi, của ai, trạng thái gì, hàng có sẵn không. KPI xem theo từng đợt live.

### Phase 3B — Chế độ Handover cho CSKH (Bảng filter đơn giản)

- [ ] **3B.1** Toggle "Chế độ bàn giao" trên toolbar Tab1
- [ ] **3B.2** Ẩn bớt cột không cần (chat, edit buttons), phóng to badge trạng thái
- [ ] **3B.3** Filter nhanh theo nhân viên sale (dropdown)
- [ ] **3B.4** Filter nhanh theo tag category (OKE / XỬ LÝ / KHÔNG CHỐT / XÃ)
- [ ] **3B.5** Color-coded row theo tag category
- [ ] **3B.6** Read-only mode: ẩn nút sửa/xóa, chỉ hiện thông tin
- [ ] **3B.7** Hiển thị supply status inline (từ Phase 1B data)
- [ ] **3B.8** Test: Bật handover → CSKH thấy tổng quan đơn → filter theo NV

### Phase 4D — KPI theo đợt live

- [ ] **4D.1** Dropdown chọn đợt live trên tab KPI (`tab-kpi-commission.js`)
- [ ] **4D.2** Filter statistics theo `campaignName`
- [ ] **4D.3** Subtotal theo campaign
- [ ] **4D.4** Test: Chọn đợt live → chỉ thấy KPI của đợt đó

**Files chính Sprint 3:**
- `orders-report/js/tab1/tab1-core.js`
- `orders-report/tab1-orders.html`
- `orders-report/js/tab-kpi-commission.js`

---

## Sprint 4: Tuần 7–8 (Phase 4A + 4B + 4C)

> **Mục tiêu (dễ hiểu):** Sửa lỗi hệ thống tính thưởng KPI cho Sale. Có 3 vấn đề lớn: (1) Sale thêm mã sản phẩm nhầm trước khi gửi tin nhắn chốt đơn, sau đó đổi lại — KPI vẫn cộng sai → sửa bằng cách khóa thông tin sau 5 phút và đối chiếu lại khi ra đơn. (2) Số lượng sản phẩm trong đơn khách phải khớp với số Duyên đặt nhà cung cấp — nếu không khớp sẽ hiện cảnh báo. (3) KPI chỉ được cộng chính thức khi đơn hàng thật sự giao thành công và khách không trả lại hàng.
>
> **Kết quả đạt được:** KPI chính xác, chống gian lận. Có 2 mức: "KPI tạm tính" (khi chốt đơn) và "KPI xác nhận" (khi giao thành công). Đơn hoàn hàng → tự động trừ KPI.

### Phase 4A — Fix bug thêm mã nhầm trước khi gửi tin nhắn

- [ ] **4A.1** Sửa `kpi-manager.js` → `saveAutoBaseSnapshot()`: thêm `baseLockedAt: null`, `createdAt: timestamp`
- [ ] **4A.2** Thêm `updateBaseIfUnlocked(orderId, newProducts)`: update BASE trong grace period 5 phút
- [ ] **4A.3** Thêm `reconcileBaseWithInvoice(orderId)`: so sánh BASE vs invoice products thực tế
- [ ] **4A.4** Sửa `tab1-fast-sale-invoice-status.js`: khi invoice tạo → call `lockBase()` + `reconcile()`
- [ ] **4A.5** Test: Gửi tin nhắn → đổi mã trong 5 phút → BASE update đúng → sau 5 phút BASE lock

### Phase 4B — KPI đối chiếu với Sổ Sách Duyên đặt hàng

- [ ] **4B.1** Thêm `validateAgainstLedger()` trong `kpi-manager.js`
- [ ] **4B.2** Cross-check product qty với `live_ledger/.../duyenOrderQty`
- [ ] **4B.3** Flag "SL không khớp" nếu qty trong đơn > Duyên đặt
- [ ] **4B.4** Hiển thị badge cảnh báo trên `tab-kpi-commission.js`
- [ ] **4B.5** Test: Đơn có 5 SP nhưng Duyên chỉ đặt 3 → badge cảnh báo hiện

### Phase 4C — KPI chỉ cộng khi đơn thành công & không hoàn

- [ ] **4C.1** Thêm `finalizeKPI(orderId)` trong `kpi-manager.js`
- [ ] **4C.2** Check `invoice_status_v2` (Firestore): đã ra đơn chưa?
- [ ] **4C.3** Call TPOS OData API: check StateCode (shipped/returned)
- [ ] **4C.4** 2 cột KPI: "KPI tạm tính" vs "KPI xác nhận" trên `tab-kpi-commission.js`
- [ ] **4C.5** Nút "Xác nhận KPI" batch finalize tất cả đơn đã ra bill
- [ ] **4C.6** Đơn hoàn hàng (CSKH nhập hoàn) → tự động trừ KPI
- [ ] **4C.7** Test: Ra đơn → finalize → KPI xác nhận. Hoàn hàng → KPI trừ

**Files chính Sprint 4:**
- `orders-report/js/managers/kpi-manager.js`
- `orders-report/js/tab1/tab1-fast-sale-invoice-status.js`
- `orders-report/js/tab-kpi-commission.js`

---

## Sprint 5: Tuần 9 (Phase 5 — Polish)

> **Mục tiêu (dễ hiểu):** Hoàn thiện và tối ưu tất cả tính năng đã làm ở 4 sprint trước. Đảm bảo dùng tốt trên điện thoại/tablet (Duyên có thể nhập hàng về trên điện thoại khi ở kho). Thêm thông báo âm thanh khi có hàng rớt mới để Sale phản ứng nhanh. Tự động cập nhật dữ liệu theo thời gian thực.
>
> **Kết quả đạt được:** Tất cả tính năng chạy mượt trên mọi thiết bị. Thông báo realtime. Sẵn sàng vận hành chính thức.

- [ ] **5.1** Responsive cho handover view trên tablet/phone
- [ ] **5.2** Touch-friendly form nhập lô giao hàng
- [ ] **5.3** Sound notification khi có hàng rớt mới trong live
- [ ] **5.4** Auto-refresh interval cho supply status panel
- [ ] **5.5** Test end-to-end trên mobile/tablet

**Files chính Sprint 5:**
- CSS files across all modified modules

---

## Dependency Graph

```
Phase 1A (Giao hàng từng phần)
   ↓
Phase 1B (Supply Status cho Sale) → Phase 3B (Handover CSKH)
                                         ↓
Phase 2 (Hàng rớt per-session)     Phase 5 (Polish)
Phase 3A (Thống kê tags)  ──────────→/

Phase 4A (KPI Base Lock) ─── độc lập
Phase 4B (KPI vs Ledger) ─── cần Phase 1A xong
Phase 4C (KPI Finalization) ── độc lập
Phase 4D (KPI per-session) ── độc lập
```

---

## Tổng kết files

| File | Phase | Thay đổi |
|------|-------|----------|
| `orders-report/js/overview/overview-ledger.js` | 1A | Delivery batches, status, auto-calc |
| `orders-report/js/tab1/tab1-supply-status.js` | 1B | **TẠO MỚI** — supply status panel |
| `orders-report/js/managers/dropped-products-manager.js` | 2 | Campaign filter |
| `orders-report/js/tab1/tab1-processing-tags.js` | 3A | Employee statistics |
| `orders-report/js/tab1/tab1-core.js` | 3B | Handover mode |
| `orders-report/js/managers/kpi-manager.js` | 4A,4B,4C | Base lock, validation, finalization |
| `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` | 4A | Lock BASE khi invoice tạo |
| `orders-report/js/tab-kpi-commission.js` | 4B,4C,4D | UI validation/finalization/filter |
| `orders-report/tab1-orders.html` | 1B,3B | Script tags + container divs |
