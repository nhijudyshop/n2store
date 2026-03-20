# Sprint 0 — Tự động kiểm tra tồn kho đơn hàng

> **Mục tiêu**: Thay thế quy trình thủ công của Duyên (check tồn → tạo tag chờ → gắn đơn → gỡ khi hàng về) bằng hệ thống tự động. Sale bấm 1 nút → biết ngay đơn nào đủ hàng, đơn nào thiếu, thiếu SP gì.

## Yêu cầu nghiệp vụ

### Quy trình hiện tại (thủ công - Duyên làm)
1. Duyên check tồn kho từng sản phẩm trên TPOS
2. Tạo tag thủ công: "T1 Áo smi trắng tag hoa...", "T2 SET LỤA TÀ XẺO NÂU HP"
3. Gắn tag vào đơn hàng theo STT
4. Khi hàng về → gỡ tag thủ công
5. **Vấn đề**: Chậm, dễ sai, Sale phải chờ Duyên, không kiểm soát được ngay

### Quy trình mới (tự động)
1. Sale bấm nút **"Kiểm tra tồn kho"** trên Tab1
2. Hệ thống tự:
   - Lấy tồn kho mới nhất từ TPOS (qua Excel export)
   - So sánh với số lượng SP trong từng đơn hàng
   - Phân loại: **ĐỦ HÀNG** (xanh) / **THIẾU HÀNG** (đỏ)
   - Ưu tiên phân bổ cho đơn đủ toàn bộ SP (STT nhỏ trước)
   - Tự gắn tag "Chờ [MÃ SP]" vào cột Tag Xử Lý cho đơn thiếu
3. Sale nhìn ngay: badge xanh/đỏ, filter đủ/thiếu, tooltip chi tiết

### Quy tắc phân loại

| Trạng thái | Điều kiện | Badge | Ví dụ |
|-----------|-----------|-------|-------|
| **Đủ hàng** (sufficient) | TẤT CẢ SP trong đơn đủ tồn kho VÀ được phân bổ thành công | Xanh ✅ | Đơn cần 2 áo B375X (tồn 14) + 1 quần A100 (tồn 8) → ĐỦ |
| **Thiếu hàng** (insufficient) | BẤT KỲ SP nào thiếu tồn kho HOẶC tồn đã hết sau phân bổ | Đỏ ❌ | Đơn cần 1 áo B378V (tồn 0) → THIẾU |
| **Không có SP** | Đơn không có chi tiết sản phẩm (giỏ trống, 0đ) | Xám ● | Đơn STT 687 "GIỎ TRỐNG" |

> **Không phân biệt** "chờ hàng" vs "hết hàng". Tất cả thiếu = THIẾU.

### Quy tắc phân bổ (ưu tiên)
1. Đơn nào **TẤT CẢ SP đủ tồn** → xếp vào nhóm "tentative sufficient"
2. Sort theo **STT nhỏ trước** (SessionIndex ASC)
3. Phân bổ từng đơn: trừ tồn kho → nếu còn đủ → confirmed sufficient
4. Nếu tồn kho cạn (do đơn trước đã lấy hết) → chuyển thành insufficient
5. Đơn ban đầu đã thiếu → luôn insufficient

---

## Nguồn dữ liệu

### 1. Tồn kho — TPOS Excel Export (Primary)
- **API**: `POST Product/ExportProductV2?Active=true`
- **Proxy**: `chatomni-proxy.nhijudyshop.workers.dev`
- **Format**: Excel file → parse bằng XLSX library
- **Columns**: Detect tự động (giống overview-ledger.js)
  - Code: `Mã sản phẩm`, `Mã SP`, `Mã sản phẩm (*)`
  - Stock: `SL Tồn kho`, `Tồn kho`, `QtyAvailable`
  - Name: `Tên sản phẩm`, `Tên SP`
  - Id: `Id sản phẩm (*)`, `Id`
- **Kết quả**: `Map<CODE_UPPERCASE, { qty, name, id }>`
- **Chứa TẤT CẢ SP active** (không filter theo campaign)
- **Fallback**: `orderProducts/{tposCampaignId}` (Realtime DB) nếu Excel lỗi

### 2. Chi tiết đơn hàng — Firestore
- **Collection**: `report_order_details`
- **Doc key**: `campaignName.replace(/[.$#[\]\/]/g, '_')`
- **Chunked data**: Đơn > 100 → chia thành `order_chunks` subcollection
- **Fuzzy matching**: Nếu doc exact không tìm thấy → scan collection
- **Cần**: User phải bấm "Lấy chi tiết đơn hàng" ở tab Báo Cáo Tổng Hợp trước
- **Kết quả**: `Map<OrderId, [{ code: UPPERCASE, name, qty }]>`

### 3. Processing Tags — REST API
- **Server**: `n2store-fallback.onrender.com/api/realtime/`
- **Endpoints**:
  - `PUT /processing-tag-defs/{campaignId}` — Thêm/sửa tag definitions
  - `POST /processing-tags/{campaignId}/bulk` — Gắn tags hàng loạt
  - `DELETE /processing-tags/{campaignId}/{orderId}/{tagKey}` — Gỡ tag
- **Tag format**: Key `STOCK_CHO_[CODE]`, Label `Chờ [CODE]`, Color `#f59e0b`

---

## UI Components (tham khảo demo)

### A. Badge cạnh STT
- Dot tròn 10px: xanh (#10b981) / đỏ (#ef4444) / xám (#9ca3af)
- Hover → tooltip: `"Thiếu hàng:\n• B378V  Tồn: 0 / Cần: 1\n• A100  Tồn: 8 / Cần: 3"`
- Pulse animation cho đỏ

### B. Summary bar (trái, dưới toolbar)
- `● X đủ hàng  ● Y thiếu hàng  ● Z đơn không có SP`
- Click → filter bảng

### C. Filter tabs (phải, cạnh "Cài đặt cột")
- Pill badges: `[Tất cả X] [Đủ hàng Y] [Thiếu Z]`
- Active tab highlight màu tương ứng

### D. Processing Tags trong cột Tag Xử Lý
- Tags đỏ cam: `Chờ B378V`, `Chờ D300`
- Tự gắn cho đơn insufficient, tự gỡ khi đủ

### E. Product detail expand (click STT)
- Thêm cột **Tồn kho** cuối bảng chi tiết SP
- `✅ 14` (xanh, đủ) / `⊘ 0` (đỏ, hết) / `⚠ 3` (vàng, thiếu)

### F. Row highlighting
- Đơn insufficient: nền hồng nhạt `rgba(239, 68, 68, 0.06)`

---

## Kế hoạch hiện thực — 3 Phase

### Phase 0A — Fix data loading (nguồn dữ liệu đúng)
**Mục đích**: Đảm bảo tồn kho và chi tiết đơn lấy đúng, matching đúng.

| # | Task | File | Done |
|---|------|------|------|
| 0A.1 | Viết lại `fetchStockFromTPOSExcel()`: bỏ dependency orderProducts, build stockMap trực tiếp từ Excel | `tab1-stock-status.js` | ✅ |
| 0A.2 | Thêm detect cột "Tên sản phẩm" trong Excel | `tab1-stock-status.js` | ✅ |
| 0A.3 | Normalize ProductCode → UPPERCASE trong `loadOrderProductDetails()` | `tab1-stock-status.js` | ✅ |
| 0A.4 | Fix `renderStockColumnCell()` uppercase lookup | `tab1-stock-status.js` | ✅ |
| 0A.5 | Fix `loadStockFromFirebase()` fallback uppercase keys | `tab1-stock-status.js` | ✅ (đã đúng sẵn) |
| 0A.6 | Test: Console log stock count > 100 SP, so sánh tồn kho với sổ sách | Manual | ⏳ |

### Phase 0B — Đổi 3 trạng thái → 2 trạng thái
**Mục đích**: Đơn giản hóa, bỏ phân biệt "chờ" vs "hết".

| # | Task | File | Done |
|---|------|------|------|
| 0B.1 | Sửa `computeAll()`: ready/waiting/critical → sufficient/insufficient | `tab1-stock-status.js` | ✅ |
| 0B.2 | Sửa `_summaryStats`: bỏ waiting/critical, thêm sufficient/insufficient/noProducts/total | `tab1-stock-status.js` | ✅ |
| 0B.3 | Sửa `renderStockBadgeInline()`: 2 màu + xám, tooltip format "Tồn: X / Cần: Y" | `tab1-stock-status.js` | ✅ |
| 0B.4 | Sửa `getStockRowClass()`: bỏ waiting/critical → chỉ insufficient | `tab1-stock-status.js` | ✅ |
| 0B.5 | Sửa `updateSummaryBar()`: 2 trạng thái + "đơn không có SP" | `tab1-stock-status.js` | ✅ |
| 0B.6 | Sửa `passesStockFilter()` + `filterByStatus()` cho sufficient/insufficient | `tab1-stock-status.js` | ✅ |
| 0B.7 | Sửa `syncProcessingTags()`: gắn tag cho insufficient thay vì waiting+critical | `tab1-stock-status.js` | ✅ (logic đã tự đúng) |
| 0B.8 | Sửa CSS: bỏ .stock-waiting/.stock-critical, thêm .stock-insufficient | `tab1-stock-status.css` | ✅ |
| 0B.9 | Sửa CSS: bỏ .stock-row-waiting, thêm .stock-row-insufficient | `tab1-stock-status.css` | ✅ |
| 0B.10 | Sửa CSS: bỏ .stock-summary-waiting/.critical, thêm .stock-summary-sufficient/.insufficient/.noproducts | `tab1-stock-status.css` | ✅ |
| 0B.11 | Test: Kết quả hiện sufficient + insufficient, badge 2 màu, filter hoạt động | Manual | ⏳ |

### Phase 0C — Thêm Filter Tabs + Polish UI
**Mục đích**: UI giống demo, thêm filter tabs góc phải.

| # | Task | File | Done |
|---|------|------|------|
| 0C.1 | Thêm `<div id="stockFilterTabs">` vào HTML (cạnh nút "Cài đặt cột") | `tab1-orders.html` | ✅ |
| 0C.2 | Thêm function `updateFilterTabs()`: render pill badges [Tất cả X] [Đủ Y] [Thiếu Z] | `tab1-stock-status.js` | ✅ |
| 0C.3 | Gọi `updateFilterTabs()` từ `updateSummaryBar()` và `filterByStatus()` | `tab1-stock-status.js` | ✅ |
| 0C.4 | Thêm CSS cho `.stock-filter-tab`, `.stock-filter-tab.active`, colors | `tab1-stock-status.css` | ✅ |
| 0C.5 | Verify `tab1-table.js` dùng `getStockRowClass()` (không hardcode class) | `tab1-table.js` | ✅ |
| 0C.6 | Test end-to-end: badge + tooltip + summary + filter tabs + expand + tags | Manual | ⏳ |

---

## Files tổng kết

| File | Action | Phase |
|------|--------|-------|
| `orders-report/js/tab1/tab1-stock-status.js` | SỬA | 0A, 0B, 0C |
| `orders-report/css/tab1-stock-status.css` | SỬA | 0B, 0C |
| `orders-report/tab1-orders.html` | SỬA nhỏ | 0C |
| `orders-report/js/tab1/tab1-table.js` | VERIFY | 0C |

**KHÔNG SỬA**: `tab1-processing-tags.js`, `tab1-core.js`, `tab1-search.js`, `overview-ledger.js`

---

## Data Flow

```
[User bấm "Kiểm tra tồn kho"]
  │
  ├─ 1. TỒN KHO: TPOS Excel export
  │     POST Product/ExportProductV2 → proxy → parse XLSX
  │     → stockMap: Map<CODE_UPPER, { qty, name, id }>
  │     → Fallback: orderProducts (Realtime DB)
  │
  ├─ 2. CHI TIẾT ĐƠN: Firestore report_order_details
  │     → Doc lookup (exact → fuzzy) → chunked support
  │     → orderProducts: Map<OrderId, [{ code: UPPER, name, qty }]>
  │
  ├─ 3. COMPUTE:
  │     Phase 1: Classify sufficient vs insufficient
  │     Phase 2: Allocate (ưu tiên đủ + STT nhỏ)
  │
  ├─ 4. UI:
  │     → Badge xanh/đỏ/xám + tooltip
  │     → Summary bar + Filter tabs
  │     → Row highlighting + Stock column expand
  │
  └─ 5. PROCESSING TAGS:
        → STOCK_CHO_[CODE] cho insufficient
        → Bulk assign + remove stale
```
