<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# Đối soát KPI (KPI Reconciliation) — Cách hoạt động chi tiết

> Tài liệu cho khối **"Đối soát KPI"** trong tab **KPI - HOA HỒNG** (`orders-report/main.html` → iframe `tab-kpi-commission.html`).
> Phụ đề trên UI: *"So sánh KPI với refund excel 3 tháng từ TPOS"*.

---

## 1. Tóm tắt nhanh (TL;DR)

Đối soát KPI trả lời 1 câu hỏi: **"Trong số đơn đã tính hoa hồng (KPI) cho nhân viên, đơn nào thực ra đã bị trả hàng (refund) trên TPOS, hoặc dữ liệu bị lệch — để KHÔNG trả hoa hồng oan?"**

Khi bấm nút **Chạy đối soát**, hệ thống:

1. Gom tất cả đơn **đang hiển thị sau bộ lọc** (campaign / nhân viên / khoảng ngày).
2. Tải song song: (a) cache trạng thái phiếu TPOS, (b) **file refund Excel 3 tháng gần nhất** xuất từ TPOS.
3. Với mỗi đơn, đánh giá 3 khả năng → gắn nhãn **OK ✅** / **Đã hoàn ↩** / **Sai lệch ⚠**.
4. Cộng dồn KPI bị loại do refund ("loss") theo từng nhân viên, rồi cập nhật bảng xếp hạng + bảng kết quả.

Hai nguồn dữ liệu cốt lõi:
- **Refund Excel từ TPOS** → biết đơn nào đã trả hàng.
- **BASE snapshot + audit log nội bộ** → biết danh sách sản phẩm tính KPI có khớp TPOS hiện tại không.

---

## 2. Phần nghiệp vụ — đọc cái này nếu bạn là người dùng

### 2.1. KPI / hoa hồng được tính thế nào (nền tảng)

- Mỗi **SP NET** (sản phẩm tính KPI) = **5.000đ** hoa hồng. Hằng số `KPI_PER_PRODUCT = 5000`.
- Số liệu KPI lấy từ Render API `GET /api/realtime/kpi-statistics`, gom theo nhân viên → từng ngày → từng đơn.
- Mỗi đơn có: mã ĐH (`orderCode`), số SP NET (`netProducts`), KPI (`kpi = netProducts × 5.000`), nhân viên, campaign.

### 2.2. Ý nghĩa các trạng thái sau khi đối soát

| Nhãn | Khi nào | Ý nghĩa kinh doanh |
|---|---|---|
| **✅ OK** | Không refund, không lệch dữ liệu | Đơn hợp lệ, **được tính KPI** đầy đủ |
| **↩ Đã hoàn (loại KPI)** | Mã đơn nằm trong refund Excel TPOS | Khách đã trả hàng → **KPI bị loại** ("loss") |
| **⚠ Sai lệch** | `reconcileKPI` phát hiện dữ liệu không khớp | Cần kiểm tra tay (xem mục 2.3) |

### 2.3. "Sai lệch" cụ thể là gì

Đối soát so sánh **ảnh chụp lúc tính KPI (BASE snapshot)** với **sản phẩm hiện tại trên TPOS** và **audit log**. Có 3 loại lệch:

- **`no_base`** — Không có BASE snapshot cho đơn → không kiểm chứng được KPI.
- **`missing_audit`** — Sản phẩm có trên TPOS nhưng **thiếu audit log** (KPI có thể tính thiếu).
- **`removed_from_tpos`** — Sản phẩm đã được tính KPI nhưng **đã bị xoá khỏi TPOS** (KPI có thể tính thừa).

### 2.4. "loss" và con số hiển thị trên bảng xếp hạng

Trên mỗi dòng nhân viên ở leaderboard:

- **"không có loss"** → nhân viên không có đơn nào bị refund. Giữ nguyên toàn bộ KPI.
- **"gross 220.000đ − 20.000đ hoàn"** → KPI gốc 220k, bị loại 20k do refund → **KPI thực = 200k**.
- Thanh "KPI thực" có 2 màu: **xanh** = KPI thực (net), **đỏ** = phần loss bị refund.
- Badge **"X hoàn"** = số đơn của nhân viên đó nằm trong refund Excel.

> ⚠ **Lưu ý quan trọng về %**: phần trăm trên thanh "KPI thực" là **tương đối so với người dẫn đầu**, *không phải* % của một chỉ tiêu KPI tuyệt đối.
> Công thức: `% = round(kpiNet_của_NV / kpiNet_của_người_cao_nhất × 100)`.
> Ví dụ khớp screenshot: Hồng 220.000đ = 100% (cao nhất), Hạnh 170.000đ ≈ 77% (170/220), Huyền 160.000đ ≈ 73%, Hạnh Live 55.000đ ≈ 25%, My 5.000đ ≈ 2%.

### 2.5. Cách dùng

1. Đặt **bộ lọc** trước (campaign / nhân viên / khoảng ngày) ở thanh trên cùng. Đối soát chỉ chạy trên đơn đang hiển thị.
2. Bấm **Chạy đối soát**. Thanh tiến trình chạy 2% → 100% (Đang khởi tạo → load song song → kiểm tra → render).
3. Đọc 4 thẻ thống kê: **Tổng đơn**, **OK (tính KPI)**, **Đã hoàn (loại KPI)** (kèm số tiền KPI bị loại), **Sai lệch khác**.
4. Lọc kết quả bằng chip: **Tất cả / OK / Đã hoàn / Sai lệch**. Mặc định mở sẵn nhóm Đã hoàn (hoặc Sai lệch) để ưu tiên việc cần xử lý.
5. Bấm mũi tên ▸ ở mỗi dòng để xem **chi tiết lý do** loại/lệch. Bấm **số phiếu** để xem chi tiết phiếu TPOS.
6. **Xuất Excel** để lưu kết quả đối soát nếu cần.

> ⚠ **Quirk đã biết**: nếu bấm Chạy đối soát khi **chưa có đơn nào** sau bộ lọc, thanh tiến trình sẽ kẹt ở *"Đang khởi tạo… 2%"* **bên cạnh** thông báo *"Không có đơn hàng nào để đối soát. Hãy áp dụng bộ lọc trước."* — đây đúng là tình trạng trong screenshot. Nguyên nhân kỹ thuật: nhánh thoát sớm không ẩn thanh tiến trình (xem mục 9). Không ảnh hưởng dữ liệu, chỉ là tồn đọng giao diện.

---

## 3. Phần kỹ thuật — luồng chạy `runReconciliation()`

**File**: [`orders-report/js/tab-kpi-commission.js`](../../orders-report/js/tab-kpi-commission.js) — hàm `runReconciliation()` (L4141–4351).
**Trigger**: nút `#btnRunReconciliation` → `onclick="KPICommission.runReconciliation()"` trong [`orders-report/tab-kpi-commission.html`](../../orders-report/tab-kpi-commission.html) (L337–344).

| Bước | % | Hành động |
|---|---|---|
| **B0** | 2% | Disable nút, ẩn UI cũ (empty/results/stats/control), set progress *"Đang khởi tạo…"* |
| **B1** | — | Gom `allOrders` từ `state.filteredData` (lồng `emp.orders`). **Rỗng → hiện empty state + return** |
| **B2** | 8% | `Promise.all([loadInvoiceStatusData(), fetchRefundedOrderCodes(3)])` chạy **song song** |
| **B3** | — | Map `orderId → invoiceNumber` (qua `_invoiceCache`); đánh dấu `isRefunded` nếu `invoiceNumber ∈ refundSet` |
| **B4** | 25→95% | **Worker pool CONCURRENCY = 8**: mỗi đơn gọi `kpiManager.reconcileKPI()` + ghép nhãn refund |
| **B5** | 98%→ẩn | `_indexReconResults()` → `_renderReconciliationUI()` → re-render bảng KPI chính → ẩn progress |

### Sơ đồ luồng dữ liệu

```
[Tab KPI - HOA HỒNG]
   └── bấm "Chạy đối soát" → runReconciliation()
         │
         ├─ B2 song song ──────────────────────────────────────────┐
         │   loadInvoiceStatusData()        fetchRefundedOrderCodes(3)
         │   (cache phiếu TPOS)                    │
         │                                         ▼
         │                            OData filter (Type=refund, 3 tháng)
         │                                         ▼
         │                            Cloudflare Worker (chatomni-proxy)
         │                                         ▼
         │                            TPOS /api/FastSaleOrder/ExportFileRefund
         │                                         ▼
         │                            XLSX binary → SheetJS → cột "Tham chiếu"
         │                                         ▼
         │                            Set<orderCode> đã hoàn
         │                                         │
         ├─ B3 map orderId → invoiceNumber → isRefunded ◄───────────┘
         │
         ├─ B4 worker pool x8 → mỗi đơn: kpiManager.reconcileKPI()
         │       (BASE snapshot ↔ TPOS hiện tại ↔ audit log)
         │
         └─ B5 index + render: stats cards, chips, bảng kết quả, leaderboard
```

### Chi tiết worker pool (B4)

```js
const CONCURRENCY = 8;                 // trước đây ~134 await tuần tự (30–60s) → giờ ~5–10s
const results = new Array(total);      // giữ thứ tự qua index
let nextIdx = 0;
const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
    while (true) {
        const myIdx = nextIdx++;       // mỗi worker tự "pull" việc từ hàng đợi
        if (myIdx >= total) break;
        await reconcileOne(myIdx);
        processed++;
        updateProgress(false);         // throttle 200ms để tránh reflow liên tục
    }
});
await Promise.all(workers);
```

`reconcileOne(idx)` gọi `window.kpiManager.reconcileKPI(orderId, campaignName, orderCode)`, sau đó:
- Nếu `isRefunded` → thêm discrepancy `{ type: 'refunded', message: 'Đơn đã có trong refund excel — không tính KPI' }`.
- `hasDiscrepancy = isRefunded || result.hasDiscrepancy`.

---

## 4. Lấy refund Excel từ TPOS — `fetchRefundedOrderCodes(monthsBack = 3)`

**File**: [`orders-report/js/tab-kpi-commission.js`](../../orders-report/js/tab-kpi-commission.js) (L3830–3925).

- **Endpoint**: `POST /api/FastSaleOrder/ExportFileRefund?TagIds=` qua proxy `https://chatomni-proxy.nhijudyshop.workers.dev` (bắt buộc đi proxy để vượt CORS).
- **Auth**: dùng `window.tokenManager.getAuthHeader()` nếu có; iframe KPI thường không có → fallback gọi `/api/token` với credential theo `CompanyId` (1 = NJD Live / 2 = NJD Shop).
- **OData filter** (gửi trong body `{ data: JSON.stringify(filter), ids: [] }`):
  ```js
  Filter.filters = [
    { field: 'Type',        operator: 'eq',  value: 'refund' },
    { field: 'DateInvoice', operator: 'gte', value: startISO },   // hôm nay − 3 tháng
    { field: 'DateInvoice', operator: 'lte', value: endISO },     // hôm nay
    { field: 'IsMergeCancel', operator: 'neq', value: true },
  ]
  ```
  `startISO/endISO` đã trừ **7 giờ** để khớp múi giờ VN (UTC+7).
- **Parse**: response là **XLSX binary**. Load **SheetJS** từ CDN nếu `XLSX` chưa có. `XLSX.utils.sheet_to_json(sheet, { range: 2 })` — **bỏ 2 dòng tiêu đề**, header thật ở dòng 3.
- **Trích xuất**: cột **`"Tham chiếu"`** = mã đơn gốc (vd `NJD/2026/62621`) → gom vào `Set`.
- **Trả về**: `{ codes: Set<orderCode>, totalRows, startISO, endISO }`.
- **KHÔNG cache** — fetch tươi mỗi lần chạy đối soát. Lỗi → fallback `{ codes: new Set(), totalRows: 0 }` + cảnh báo *"Không tải được refund excel — đối soát chỉ check trạng thái đơn"*.

> Cố định **3 tháng**, **không** theo khoảng ngày của bộ lọc tab (refund có thể xảy ra sau ngày bán nên cần quét rộng hơn).

---

## 5. Phát hiện "Sai lệch" — `kpiManager.reconcileKPI()`

**File**: [`orders-report/js/managers/kpi-manager.js`](../../orders-report/js/managers/kpi-manager.js) — `reconcileKPI(orderId, campaignName, orderCodeHint)` (L1084–1180).

Trình tự:
1. Lấy **BASE snapshot** qua `getKPIBase(orderCode)`. Không có → `hasDiscrepancy = true`, discrepancy `no_base`.
2. Tính **net thực** từ audit log qua `calculateNetKPI(orderCode)` → set `result.actualNet`. (Luôn chạy được, không cần TPOS.)
3. Lấy **sản phẩm hiện tại trên TPOS** qua `fetchProductsFromTPOS(orderId)`. Không lấy được → bỏ qua cross-check nhưng vẫn trả `actualNet`.
4. So sánh 3 tập `ProductId`:
   - **BASE** (`baseProductIds`)
   - **TPOS hiện tại** (`currentProductIds`)
   - **Audit** (`auditNewProductIds`)
5. Sinh discrepancy:
   - SP trên TPOS (không thuộc BASE) nhưng thiếu trong audit → **`missing_audit`**.
   - SP trong audit (có net > 0) nhưng đã xoá khỏi TPOS → **`removed_from_tpos`**.

Trả về: `{ orderId, hasDiscrepancy, actualNet, actualPerUser, actualPerUserNames, discrepancies[] }`.

---

## 6. Tính "loss" & gộp theo nhân viên — `_indexReconResults()`

**File**: [`orders-report/js/tab-kpi-commission.js`](../../orders-report/js/tab-kpi-commission.js) (L4359–4382).

```js
const refundedSet = new Set(results.filter(r => r.isRefunded).map(r => r.orderId));
for (const emp of state.filteredData) {
    let lossSum = 0, refundCount = 0;
    for (const order of emp.orders) {
        if (refundedSet.has(order.orderId)) { lossSum += order.kpi || 0; refundCount++; }
    }
    _reconKpiLossByUser.set(emp.userId, { kpiLost: lossSum, refundCount });
}
```

Leaderboard (L1870–1936) đọc map này:
- `kpiNet = emp.totalKPI − lossInfo.kpiLost` → số tiền hiển thị to (xanh).
- Thanh `lb-kpi-bar-net` (xanh) + `lb-kpi-bar-loss` (đỏ, độ rộng theo `lossPct`).
- Dòng phụ: `gross … − … hoàn` nếu có loss, ngược lại `không có loss`.

Các Map dùng chung (để bảng KPI chính + modal đọc nhanh):
- `_reconByOrder`: `orderId → record kết quả`.
- `_reconKpiLossByUser`: `userId → { kpiLost, refundCount }`.
- `_reconRefundDetailCache`: cache chi tiết refund (món trả + lý do) fetch on-demand.

---

## 7. Cấu trúc dữ liệu — record kết quả mỗi đơn

```js
{
  orderId,                // SaleOnlineId
  orderCode,              // Mã ĐH (vd NJD/2026/62621)
  invoiceNumber,          // Số phiếu TPOS (từ _invoiceCache)
  invoiceState,           // ShowState (vd "Đã thanh toán")
  kpiAmount,              // KPI của đơn = netProducts × 5.000
  stt,                    // SessionIndex
  expectedNet,            // netProducts kỳ vọng
  actualNet,              // net thực từ audit (hoặc "Lỗi")
  isRefunded,             // có trong refund Excel?
  hasDiscrepancy,         // isRefunded || lệch dữ liệu
  discrepancies: [ { type, message }, ... ]   // refunded | no_base | missing_audit | removed_from_tpos | error
}
```

Bảng kết quả (L4641–4717) hiển thị: **Mã ĐH · Số phiếu (TPOS) · STT · Expected · Actual · Delta · Trạng thái**. Badge: `✅ OK` / `↩ Đã hoàn (loại KPI)` / `⚠ Sai lệch`. Hàng con (mở bằng ▸) liệt kê chi tiết `discrepancies`.

Thẻ thống kê (`_renderReconciliationUI`, L4565–4639): Tổng đơn, OK, Đã hoàn (+ `Loại bỏ KPI: <VNĐ>`), Sai lệch khác. Meta: `Refund excel: N dòng · M mã đơn unique · check 3 tháng`.

---

## 8. Đối soát theo từng nhân viên (Modal L1)

**File**: [`orders-report/js/tab-kpi-commission.js`](../../orders-report/js/tab-kpi-commission.js) — `runEmployeeReconciliation()` (L2528–2665).

Tương tự bản full nhưng:
- Chỉ chạy trên đơn của **1 nhân viên** đang mở trong modal chi tiết.
- **CONCURRENCY = 6** (thay vì 8).
- **Cache 7 ngày** trong localStorage qua `_writeL1ReconCache()` / `_applyL1ReconCache()` → mở lại modal không phải đối soát lại.
- Kết thúc hiện toast: *"Đối soát xong X đơn (hoàn: Y, sai lệch: Z)"*.

Chi tiết refund 1 phiếu (món trả + lý do) lấy on-demand qua `_fetchRefundDetailForInvoice()` (L4388+): OData `GetView` tìm invoice gốc theo `Number` → tìm refund theo `RefundOrderId` → `GET FastSaleOrder({id})?$expand=OrderLines`.

---

## 9. Quirk & lưu ý đã phát hiện

1. **Progress không ẩn khi rỗng**: nhánh thoát sớm `allOrders.length === 0` (L4166–4175) hiện empty state nhưng **không gọi `_hideReconProgress()`** → thanh *"Đang khởi tạo… 2%"* còn nguyên cạnh thông báo "Không có đơn hàng…". (Đúng như screenshot. Đây là tài liệu mô tả hiện trạng, **không sửa** trong phạm vi tài liệu này.)
2. **Refund cố định 3 tháng**, không theo bộ lọc ngày của tab.
3. **Refund Excel không cache** — mỗi lần chạy là 1 lần tải file từ TPOS (có thể chậm vài giây).
4. **KPI_PER_PRODUCT = 5.000đ** / SP NET (hằng số cứng, `tab-kpi-commission.js` L54).
5. Đối soát **không ghi DB** — chỉ đọc TPOS + tính trong bộ nhớ; kết quả lưu tạm trong các Map `_recon*` (mất khi reload, trừ cache modal L1 7 ngày trong localStorage).

---

## 10. Bảng tra cứu nhanh file/hàm

| Thành phần | File | Vị trí |
|---|---|---|
| Markup khối Đối soát | `orders-report/tab-kpi-commission.html` | L327–495 |
| Orchestrator | `orders-report/js/tab-kpi-commission.js` | `runReconciliation()` L4141–4351 |
| Fetch refund Excel | `orders-report/js/tab-kpi-commission.js` | `fetchRefundedOrderCodes()` L3830–3925 |
| Progress bar | `orders-report/js/tab-kpi-commission.js` | `_setReconProgress()` L3931 / `_hideReconProgress()` L3945 |
| Index + gộp loss | `orders-report/js/tab-kpi-commission.js` | `_indexReconResults()` L4359–4382 |
| Render kết quả | `orders-report/js/tab-kpi-commission.js` | `_renderReconciliationUI()` L4565 / `renderReconciliationResults()` L4641 |
| Lõi "Sai lệch" | `orders-report/js/managers/kpi-manager.js` | `reconcileKPI()` L1084–1180 |
| Nguồn số liệu KPI | `orders-report/js/tab-kpi-commission.js` | `loadAllStatistics()` L901–957 |
| Leaderboard + loss | `orders-report/js/tab-kpi-commission.js` | L1870–1936 |
| Modal L1 per-NV | `orders-report/js/tab-kpi-commission.js` | `runEmployeeReconciliation()` L2528–2665 |
| Refund detail on-demand | `orders-report/js/tab-kpi-commission.js` | `_fetchRefundDetailForInvoice()` L4388+ |

> Các số dòng chụp tại thời điểm 2026-06-03; nếu file thay đổi nhiều, tìm theo **tên hàm** thay vì số dòng.
