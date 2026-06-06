<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# Đối soát KPI (KPI Reconciliation) — Cách hoạt động chi tiết

> Tài liệu cho khối **"Đối soát KPI"** trong tab **KPI - HOA HỒNG** (`orders-report/main.html` → iframe `tab-kpi-commission.html`).
> Phụ đề trên UI: _"So sánh KPI với refund excel 3 tháng từ TPOS"_.
>
> **Cập nhật 2026-06-03**: đối soát chuyển từ **theo ĐƠN** sang **theo MÓN** — chỉ loại KPI của đúng món bị hoàn (xem [dev-log](../dev-log.md)).
>
> **Cập nhật 2026-06-06**: `calculateNetKPI` giờ tính NET = **(final TPOS − BASE)** dựa trên snapshot SP cuối thật (`kpi_final_snapshot`, migration 074), thay vì cộng dồn sự kiện audit log. Audit log chỉ còn dùng để PHÂN BỔ nhân viên (cap theo NET thật). Vì vậy `result.details[pid].net` (input cho `_matchRefundForOrder`) nay là **số lượng thật trên đơn**, không còn drift theo audit. Mục 5 (mô tả `actualNet` lấy từ audit) chỉ còn đúng khi đơn CHƯA có snapshot (fallback `reconciled:false`). Quy tắc loại KPI theo món hoàn KHÔNG đổi.

---

## 1. Tóm tắt nhanh (TL;DR)

Đối soát KPI trả lời 1 câu hỏi: **"Trong số đơn đã tính hoa hồng (KPI) cho nhân viên, MÓN nào thực ra đã bị trả hàng (refund) trên TPOS, hoặc dữ liệu bị lệch — để KHÔNG trả hoa hồng oan?"**

Khi bấm nút **Chạy đối soát**, hệ thống:

1. Gom tất cả đơn **đang hiển thị sau bộ lọc** (campaign / nhân viên / khoảng ngày).
2. Tải song song: (a) cache trạng thái phiếu TPOS, (b) **file refund Excel CHI TIẾT 3 tháng gần nhất** xuất từ TPOS (có cột "Chi tiết" liệt kê từng món hoàn).
3. Với mỗi đơn, **so khớp món tính KPI với món được hoàn** → gắn nhãn **OK ✅** / **Đã hoàn ↩** / **Sai lệch ⚠**.
4. Cộng dồn KPI bị loại **theo từng món hoàn** (không loại cả đơn), gộp theo nhân viên, rồi cập nhật bảng xếp hạng + bảng kết quả.

Hai nguồn dữ liệu cốt lõi:

- **Refund Excel CHI TIẾT từ TPOS** → biết đơn nào hoàn **và hoàn những món nào, số lượng bao nhiêu**.
- **BASE snapshot + audit log nội bộ** → biết **danh sách món tính KPI** của đơn (code + SL net) để so khớp.

> 🔑 **Nguyên tắc cốt lõi**: chỉ món có **code khớp** giữa KPI của đơn và cột "Chi tiết" của refund mới bị loại KPI. Trừ theo số lượng = `min(SL hoàn, SL net KPI) × 5.000đ`. Hoàn 1 trong 5 món → chỉ mất KPI của 1 món đó, 4 món còn lại vẫn được tính.

---

## 2. Phần nghiệp vụ — đọc cái này nếu bạn là người dùng

### 2.1. KPI / hoa hồng được tính thế nào (nền tảng)

- Mỗi **SP NET** (sản phẩm tính KPI) = **5.000đ** hoa hồng. Hằng số `KPI_PER_PRODUCT = 5000`.
- Số liệu KPI lấy từ Render API `GET /api/realtime/kpi-statistics`, gom theo nhân viên → từng ngày → từng đơn.
- Mỗi đơn có: mã ĐH (`orderCode`), số SP NET (`netProducts`), KPI (`kpi = netProducts × 5.000`), nhân viên, campaign.

### 2.2. Ý nghĩa các trạng thái sau khi đối soát

| Nhãn                     | Khi nào                                                                   | Ý nghĩa kinh doanh                                                                |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **✅ OK**                | Không có món KPI nào bị hoàn, không lệch dữ liệu                          | Đơn hợp lệ, **được tính KPI** đầy đủ                                              |
| **↩ Đã hoàn (loại KPI)** | Có **ít nhất 1 món tính KPI** của đơn nằm trong cột "Chi tiết" của refund | **Phần KPI của các món đó bị loại** ("loss") — các món KPI khác trong đơn vẫn giữ |
| **⚠ Sai lệch**           | `reconcileKPI` phát hiện dữ liệu không khớp                               | Cần kiểm tra tay (xem mục 2.3)                                                    |

> Đơn có refund nhưng **món hoàn KHÔNG phải món tính KPI** (vd hoàn món có sẵn trong BASE) → vẫn là **OK** (KPI không bị ảnh hưởng).

### 2.3. "Sai lệch" cụ thể là gì

Đối soát so sánh **ảnh chụp lúc tính KPI (BASE snapshot)** với **sản phẩm hiện tại trên TPOS** và **audit log**. Có 3 loại lệch:

- **`no_base`** — Không có BASE snapshot cho đơn → không kiểm chứng được KPI.
- **`missing_audit`** — Sản phẩm có trên TPOS nhưng **thiếu audit log** (KPI có thể tính thiếu).
- **`removed_from_tpos`** — Sản phẩm đã được tính KPI nhưng **đã bị xoá khỏi TPOS** (KPI có thể tính thừa).

### 2.4. "loss" và con số hiển thị trên bảng xếp hạng

Trên mỗi dòng nhân viên ở leaderboard:

- **"không có loss"** → nhân viên không có món KPI nào bị hoàn. Giữ nguyên toàn bộ KPI.
- **"gross 220.000đ − 20.000đ hoàn"** → KPI gốc 220k, bị loại 20k do **các món hoàn** → **KPI thực = 200k**. (20k = tổng `min(SL hoàn, net) × 5.000đ` của các món trúng, **không** phải KPI cả đơn.)
- Thanh "KPI thực" có 2 màu: **xanh** = KPI thực (net), **đỏ** = phần loss bị hoàn.
- Badge **"X hoàn"** = số **đơn** có ít nhất 1 món KPI bị hoàn.

> ⚠ **Lưu ý quan trọng về %**: phần trăm trên thanh "KPI thực" là **tương đối so với người dẫn đầu**, _không phải_ % của một chỉ tiêu KPI tuyệt đối.
> Công thức: `% = round(kpiNet_của_NV / kpiNet_của_người_cao_nhất × 100)`.
> Ví dụ khớp screenshot: Hồng 220.000đ = 100% (cao nhất), Hạnh 170.000đ ≈ 77% (170/220), Huyền 160.000đ ≈ 73%, Hạnh Live 55.000đ ≈ 25%, My 5.000đ ≈ 2%.

### 2.5. Cách dùng

1. Đặt **bộ lọc** trước (campaign / nhân viên / khoảng ngày) ở thanh trên cùng. Đối soát chỉ chạy trên đơn đang hiển thị.
2. Bấm **Chạy đối soát**. Thanh tiến trình chạy 2% → 100% (Đang khởi tạo → load song song → kiểm tra → render).
3. Đọc 4 thẻ thống kê: **Tổng đơn**, **OK (tính KPI)**, **Đã hoàn (loại KPI)** (kèm số tiền KPI bị loại), **Sai lệch khác**.
4. Lọc kết quả bằng chip: **Tất cả / OK / Đã hoàn / Sai lệch**. Mặc định mở sẵn nhóm Đã hoàn (hoặc Sai lệch) để ưu tiên việc cần xử lý.
5. Bấm mũi tên ▸ ở mỗi dòng để xem **chi tiết lý do** loại/lệch. Bấm **số phiếu** để xem chi tiết phiếu TPOS.
6. **Xuất Excel** để lưu kết quả đối soát nếu cần.

> ⚠ **Quirk đã biết**: nếu bấm Chạy đối soát khi **chưa có đơn nào** sau bộ lọc, thanh tiến trình sẽ kẹt ở _"Đang khởi tạo… 2%"_ **bên cạnh** thông báo _"Không có đơn hàng nào để đối soát. Hãy áp dụng bộ lọc trước."_ — đây đúng là tình trạng trong screenshot. Nguyên nhân kỹ thuật: nhánh thoát sớm không ẩn thanh tiến trình (xem mục 9). Không ảnh hưởng dữ liệu, chỉ là tồn đọng giao diện.

---

## 3. Phần kỹ thuật — luồng chạy `runReconciliation()`

**File**: [`orders-report/js/tab-kpi-commission.js`](../../orders-report/js/tab-kpi-commission.js) — hàm `runReconciliation()` (L4141–4351).
**Trigger**: nút `#btnRunReconciliation` → `onclick="KPICommission.runReconciliation()"` trong [`orders-report/tab-kpi-commission.html`](../../orders-report/tab-kpi-commission.html) (L337–344).

| Bước   | %      | Hành động                                                                                                                                  |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **B0** | 2%     | Disable nút, ẩn UI cũ (empty/results/stats/control), set progress _"Đang khởi tạo…"_                                                       |
| **B1** | —      | Gom `allOrders` từ `state.filteredData` (lồng `emp.orders`). **Rỗng → hiện empty state + return**                                          |
| **B2** | 8%     | `Promise.all([loadInvoiceStatusData(), fetchRefundDetailByInvoice(3)])` chạy **song song**                                                 |
| **B3** | —      | Map `orderId → invoice` (qua `_invoiceCache`); đếm `refundCandidateCount` = số đơn có `invoice.Number ∈ refundByInvoice` (chỉ để hiển thị) |
| **B4** | 25→95% | **Worker pool CONCURRENCY = 8**: mỗi đơn gọi `kpiManager.reconcileKPI()` → `_matchRefundForOrder()` so khớp món hoàn → `refundedKpiAmount` |
| **B5** | 98%→ẩn | `_indexReconResults()` → `_renderReconciliationUI()` → re-render bảng KPI chính → ẩn progress                                              |

### Sơ đồ luồng dữ liệu

```
[Tab KPI - HOA HỒNG]
   └── bấm "Chạy đối soát" → runReconciliation()
         │
         ├─ B2 song song ──────────────────────────────────────────┐
         │   loadInvoiceStatusData()        fetchRefundDetailByInvoice(3)
         │   (cache phiếu TPOS)                    │
         │                                         ▼
         │                            OData filter (Type=refund, 3 tháng)
         │                                         ▼
         │                            Cloudflare Worker (chatomni-proxy)
         │                                         ▼
         │            TPOS /api/FastSaleOrder/ExportFileDetail?TagIds=&type=refund
         │                                         ▼
         │                XLSX binary → SheetJS → cột "Tham chiếu" + "Chi tiết"
         │                                         ▼
         │            Map<invoiceNumber, Map<productCode, qtyHoàn>>
         │                                         │
         ├─ B3 map orderId → invoice (đếm candidate) ◄──────────────┘
         │
         ├─ B4 worker pool x8 → mỗi đơn:
         │       kpiManager.reconcileKPI() → result.details {pid:{code,net}}
         │       _matchRefundForOrder(invNumber, details, refundByInvoice)
         │         → refundedKpiAmount = Σ min(SL hoàn, net) × 5.000đ
         │
         └─ B5 index + render: stats cards, chips, bảng kết quả, leaderboard
```

### Chi tiết worker pool (B4)

```js
const CONCURRENCY = 8; // trước đây ~134 await tuần tự (30–60s) → giờ ~5–10s
const results = new Array(total); // giữ thứ tự qua index
let nextIdx = 0;
const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
    while (true) {
        const myIdx = nextIdx++; // mỗi worker tự "pull" việc từ hàng đợi
        if (myIdx >= total) break;
        await reconcileOne(myIdx);
        processed++;
        updateProgress(false); // throttle 200ms để tránh reflow liên tục
    }
});
await Promise.all(workers);
```

`reconcileOne(idx)` gọi `window.kpiManager.reconcileKPI(orderId, campaignName, orderCode)` (trả thêm `result.details` = món KPI), rồi gọi `_matchRefundForOrder(invNumber, result.details, refundByInvoice)`:

- `refundedKpiAmount > 0` → `isRefunded = true`, thêm discrepancy `{ type: 'refunded', message: 'Hoàn N món KPI (<codes>) — loại <amount>đ' }`.
- `hasDiscrepancy = isRefunded || result.hasDiscrepancy`.
- Record lưu thêm: `refundedKpiAmount`, `refundedProducts[]`, `hasRefundRow`.

---

## 4. Lấy refund Excel CHI TIẾT từ TPOS — `fetchRefundDetailByInvoice(monthsBack = 3)`

**File**: [`orders-report/js/tab-kpi-commission.js`](../../orders-report/js/tab-kpi-commission.js).

- **Endpoint**: `POST /api/FastSaleOrder/ExportFileDetail?TagIds=&type=refund` qua proxy `https://chatomni-proxy.nhijudyshop.workers.dev` (bắt buộc đi proxy để vượt CORS).
    - Khác `ExportFileRefund` cũ ở chỗ file detail có thêm cột **"Chi tiết"** liệt kê từng món hoàn.
    - Proxy forward generic `/api/*` → `https://tomato.tpos.vn/${path}${search}` (giữ nguyên query `&type=refund`).
- **Auth**: dùng `window.tokenManager.getAuthHeader()` nếu có; iframe KPI thường không có → fallback gọi `/api/token` với credential theo `CompanyId` (1 = NJD Live / 2 = NJD Shop).
- **OData filter** (gửi trong body `{ data: JSON.stringify(filter), ids: [] }`) — **giữ nguyên như cũ**:
    ```js
    Filter.filters = [
        { field: 'Type', operator: 'eq', value: 'refund' },
        { field: 'DateInvoice', operator: 'gte', value: startISO }, // hôm nay − 3 tháng
        { field: 'DateInvoice', operator: 'lte', value: endISO }, // hôm nay
        { field: 'IsMergeCancel', operator: 'neq', value: true },
    ];
    ```
    `startISO/endISO` đã trừ **7 giờ** để khớp múi giờ VN (UTC+7).
- **Parse**: response là **XLSX binary**. Load **SheetJS** từ CDN nếu `XLSX` chưa có. `XLSX.utils.sheet_to_json(sheet, { range: 2 })` — **bỏ 2 dòng tiêu đề** (title ở dòng 1-2), header thật ở dòng 3 (table ref `A3:AG…`).
- **Trích xuất theo từng đơn**:
    - `"Tham chiếu"` = số phiếu gốc (vd `NJD/2026/62621`) = **join key** với `invoice.Number` của đơn KPI.
    - `"Chi tiết"` = text liệt kê món hoàn, nhiều món cách nhau `;`, mỗi món `<SL> x [<CODE>] <tên>…`. Parser `_parseRefundChiTiet()` dùng regex `/(\d+)\s*x\s*\[([^\]]+)\]/g` → `[{code, qty}]`. Code normalize trim + UPPERCASE.
- **Trả về**: `{ refundByInvoice: Map<invoiceNumber, Map<productCode, qtyHoàn>>, codes: Set<invoiceNumber>, totalRows, startISO, endISO }`. Aggregate SL khi 1 phiếu có nhiều dòng / 1 dòng nhiều món.
- **KHÔNG cache** — fetch tươi mỗi lần chạy đối soát. Lỗi → fallback `{ refundByInvoice: new Map(), codes: new Set(), totalRows: 0 }` + cảnh báo _"Không tải được refund excel — đối soát chỉ check trạng thái đơn"_.

> Cố định **3 tháng**, **không** theo khoảng ngày của bộ lọc tab (refund có thể xảy ra sau ngày bán nên cần quét rộng hơn).

### 4b. So khớp món hoàn — `_matchRefundForOrder(invNumber, details, refundByInvoice)`

```js
refundItems = refundByInvoice.get(invNumber); // Map<code, qtyHoàn> | undefined
for (const d of Object.values(details)) {
    // details = món KPI {code, net, ...}
    if (d.net <= 0) continue;
    const refQty = refundItems.get(d.code.trim().toUpperCase()) || 0;
    if (refQty <= 0) continue;
    refundedKpiAmount += Math.min(refQty, d.net) * 5000; // trừ theo SL hoàn
    refundedProducts.push({ code: d.code, name: d.name, qty: Math.min(refQty, d.net) });
}
```

Trả `{ refundedKpiAmount, refundedProducts[], hasRefundRow }`. `hasRefundRow` = invoice có dòng refund (kể cả khi không trúng món KPI).

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

Trả về: `{ orderId, hasDiscrepancy, actualNet, actualPerUser, actualPerUserNames, details, discrepancies[] }`.

> **`details`** (thêm 2026-06-03) = `{ [productId]: { code, name, net, ... } }` — danh sách **món tính KPI** của đơn (code + SL net). Đây là input cho `_matchRefundForOrder()` để so khớp với món hoàn. Trước đây `reconcileKPI` không trả field này.

---

## 6. Tính "loss" & gộp theo nhân viên — `_indexReconResults()`

**File**: [`orders-report/js/tab-kpi-commission.js`](../../orders-report/js/tab-kpi-commission.js).

**Loss giờ là PER-PRODUCT** — cộng `refundedKpiAmount` (chỉ phần món hoàn), KHÔNG loại cả đơn:

```js
for (const emp of state.filteredData) {
    let lossSum = 0,
        refundCount = 0;
    for (const order of emp.orders) {
        const r = _reconByOrder.get(order.orderId);
        const refLoss = r?.refundedKpiAmount || 0;
        if (refLoss > 0) {
            lossSum += refLoss;
            refundCount++;
        }
    }
    _reconKpiLossByUser.set(emp.userId, { kpiLost: lossSum, refundCount });
}
```

> Cùng pattern lặp ở `_hydrateL1ReconCachesForEmployees()` và `_applyL1ReconCache()` (đều dùng `refundedKpiAmount`).

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
  invoiceNumber,          // Số phiếu TPOS (từ _invoiceCache) — join key với "Tham chiếu"
  invoiceState,           // ShowState (vd "Đã thanh toán")
  kpiAmount,              // KPI gốc của đơn = netProducts × 5.000
  stt,                    // SessionIndex
  expectedNet,            // netProducts kỳ vọng
  actualNet,              // net thực từ audit (hoặc "Lỗi")
  isRefunded,             // = refundedKpiAmount > 0 (có món KPI bị hoàn)
  refundedKpiAmount,      // ⭐ KPI bị loại do hoàn = Σ min(SL hoàn, net) × 5.000 (PER-PRODUCT)
  refundedProducts,       // ⭐ [{ code, name, qty }] các món KPI bị hoàn
  hasRefundRow,           // ⭐ invoice có dòng refund (kể cả không trúng món KPI)
  hasDiscrepancy,         // isRefunded || lệch dữ liệu
  discrepancies: [ { type, message }, ... ]   // refunded | no_base | missing_audit | removed_from_tpos | error
}
```

Bảng kết quả (`renderReconciliationResults`) hiển thị: **Mã ĐH · Số phiếu (TPOS) · STT · Expected · Actual · Delta · Trạng thái**. Badge: `✅ OK` / `↩ Đã hoàn (loại KPI)` / `⚠ Sai lệch`. Hàng con (mở bằng ▸) liệt kê `discrepancies` — gồm dòng `Hoàn N món KPI (<codes>) — loại <amount>đ`.

Thẻ thống kê (`_renderReconciliationUI`): Tổng đơn, OK, Đã hoàn (+ `Loại bỏ KPI: <VNĐ>` = Σ `refundedKpiAmount`), Sai lệch khác.

Export Excel (`exportReconciliationExcel`) thêm 2 cột: **"KPI bị loại"** + **"Món hoàn"** (`<qty> x [code]`).

---

## 8. Đối soát theo từng nhân viên (Modal L1)

**File**: [`orders-report/js/tab-kpi-commission.js`](../../orders-report/js/tab-kpi-commission.js) — `runEmployeeReconciliation()` (L2528–2665).

Tương tự bản full nhưng:

- Chỉ chạy trên đơn của **1 nhân viên** đang mở trong modal chi tiết.
- **CONCURRENCY = 6** (thay vì 8).
- **Cache 7 ngày** trong localStorage qua `_writeL1ReconCache()` / `_applyL1ReconCache()` → mở lại modal không phải đối soát lại.
- Kết thúc hiện toast: _"Đối soát xong X đơn (hoàn: Y, sai lệch: Z)"_.

Chi tiết refund 1 phiếu (món trả + lý do) lấy on-demand qua `_fetchRefundDetailForInvoice()` (L4388+): OData `GetView` tìm invoice gốc theo `Number` → tìm refund theo `RefundOrderId` → `GET FastSaleOrder({id})?$expand=OrderLines`.

---

## 9. Quirk & lưu ý đã phát hiện

1. **Progress không ẩn khi rỗng**: nhánh thoát sớm `allOrders.length === 0` (L4166–4175) hiện empty state nhưng **không gọi `_hideReconProgress()`** → thanh _"Đang khởi tạo… 2%"_ còn nguyên cạnh thông báo "Không có đơn hàng…". (Đúng như screenshot. Đây là tài liệu mô tả hiện trạng, **không sửa** trong phạm vi tài liệu này.)
2. **Refund cố định 3 tháng**, không theo bộ lọc ngày của tab.
3. **Refund Excel không cache** — mỗi lần chạy là 1 lần tải file từ TPOS (có thể chậm vài giây).
4. **KPI_PER_PRODUCT = 5.000đ** / SP NET (hằng số cứng, `tab-kpi-commission.js` L54).
5. Đối soát **không ghi DB** — chỉ đọc TPOS + tính trong bộ nhớ; kết quả lưu tạm trong các Map `_recon*` (mất khi reload, trừ cache modal L1 7 ngày trong localStorage).
6. **Cache modal L1 đã bump v1 → v2** (`_L1_RECON_CACHE_PREFIX = 'kpi_recon_l1_v2__'`): record v1 chỉ có `isRefunded` boolean (thiếu `refundedKpiAmount`) nên bị vô hiệu để tránh tính loss sai = 0.
7. **So khớp code biến thể**: code trong `[CODE]` của "Chi tiết" (vd `B1924A36` gồm size) khớp y `productCode` trong audit/KPI (so sánh trim + UPPERCASE). Đổi biến thể đã được `calculateNetKPI` lọc khỏi KPI từ trước nên không lọt vào `details`.

---

## 10. Bảng tra cứu nhanh file/hàm

| Thành phần                            | File                                       | Hàm                                                                 |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Markup khối Đối soát                  | `orders-report/tab-kpi-commission.html`    | `#reconciliationSection` (~L327–495)                                |
| Orchestrator                          | `orders-report/js/tab-kpi-commission.js`   | `runReconciliation()`                                               |
| **Fetch refund detail**               | `orders-report/js/tab-kpi-commission.js`   | `fetchRefundDetailByInvoice()`                                      |
| **Parser cột "Chi tiết"**             | `orders-report/js/tab-kpi-commission.js`   | `_parseRefundChiTiet()`                                             |
| **So khớp món hoàn**                  | `orders-report/js/tab-kpi-commission.js`   | `_matchRefundForOrder()`                                            |
| Progress bar                          | `orders-report/js/tab-kpi-commission.js`   | `_setReconProgress()` / `_hideReconProgress()`                      |
| Index + gộp loss (per-product)        | `orders-report/js/tab-kpi-commission.js`   | `_indexReconResults()`                                              |
| Render kết quả                        | `orders-report/js/tab-kpi-commission.js`   | `_renderReconciliationUI()` / `renderReconciliationResults()`       |
| Export Excel                          | `orders-report/js/tab-kpi-commission.js`   | `exportReconciliationExcel()`                                       |
| Lõi "Sai lệch" + `details`            | `orders-report/js/managers/kpi-manager.js` | `reconcileKPI()`                                                    |
| Nguồn số liệu KPI                     | `orders-report/js/tab-kpi-commission.js`   | `loadAllStatistics()`                                               |
| Leaderboard + loss                    | `orders-report/js/tab-kpi-commission.js`   | `renderLeaderboard()` (~L1870–1936)                                 |
| Modal L1 per-NV                       | `orders-report/js/tab-kpi-commission.js`   | `runEmployeeReconciliation()` / cache `_L1_RECON_CACHE_PREFIX` (v2) |
| Refund detail on-demand (modal click) | `orders-report/js/tab-kpi-commission.js`   | `_fetchRefundDetailForInvoice()`                                    |

> Số dòng bỏ bớt vì sẽ trôi sau mỗi sửa — tìm theo **tên hàm**.
