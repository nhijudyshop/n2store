# Web 2.0 — Đối soát PBH (Reconciliation) — Design Proposal

> Module sau khi user yêu cầu: đối soát SP trong PBH đã in để xác nhận đủ hàng → đóng gói → gửi KH.
>
> Đây là **proposal** — chưa implement. Đọc xong user quyết hướng đi.

---

## 1. Hiểu nghiệp vụ (problem statement)

**User flow hiện tại** (đã có):

```
Đơn Web → Tạo PBH → In bill thermal 80mm → ???
```

**Bài toán mới**: sau khi in bill, làm sao biết:

- Đơn này có đủ hàng trong kho chưa?
- Nhân viên kho đã pick đủ chưa? Có thiếu SP nào?
- Đơn đã đóng gói chưa? Ai đóng?
- Đã ship chưa? Khi nào?

→ Cần state machine "fulfillment" tách biệt với "PBH state" hiện tại (`draft/confirmed/done/cancel`).

---

## 2. State machine đề xuất

PBH có 2 trạng thái song song:

| State                     | Thuộc về            | Giá trị                                                                            | Ý nghĩa             |
| ------------------------- | ------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| `state` (hiện có)         | Order lifecycle     | draft → confirmed → done / cancel                                                  | Quản lý / sale view |
| `fulfillment_state` (MỚI) | Warehouse lifecycle | pending → picking → picked → packed → shipped → delivered / out-of-stock / partial | Pack & ship view    |

```
draft (chưa khẳng định) ──┐
                          ├──→ confirmed ──→ done (sale flow xong)
cancel                    │
                          │
                          ▼
                fulfillment_state: pending
                          │
                          ▼
                    [picking]   ←── 1+ nhân viên kho bắt đầu lấy hàng
                          │
                          ▼
                    [picked]    ←── đã pick đủ tất cả SP
                          │
                          ├──→ [out-of-stock]  (thiếu hàng → user xử lý)
                          │
                          ▼
                    [packed]    ←── đã đóng gói + dán bill
                          │
                          ▼
                    [shipped]   ←── đã giao ship/COD
                          │
                          ▼
                   [delivered]  ←── KH nhận xong (qua SePay confirm OR ship API webhook)
```

---

## 3. Data model

### A. ALTER `fast_sale_orders`

```sql
ALTER TABLE fast_sale_orders
  ADD COLUMN fulfillment_state         VARCHAR(20),  -- NULL = chưa bắt đầu
  ADD COLUMN fulfillment_started_at    TIMESTAMPTZ,
  ADD COLUMN fulfillment_completed_at  TIMESTAMPTZ,
  ADD COLUMN fulfillment_user_id       VARCHAR(100),  -- nhân viên kho chính
  ADD COLUMN packed_at                  TIMESTAMPTZ,
  ADD COLUMN shipped_at                 TIMESTAMPTZ,
  ADD COLUMN photo_url                  TEXT;          -- ảnh chụp đóng gói (anti-dispute)
```

### B. Per-line picking trong `order_lines` JSONB

```json
{
  "productCode": "SP001",
  "productName": "Áo thun M",
  "quantity": 3,
  "priceUnit": 150000,

  "picked_qty": 2,                    ← THÊM
  "picked_at": "2026-05-19T...",      ← THÊM
  "picked_by": "staff1",              ← THÊM
  "pick_note": "thiếu 1 Size M"       ← THÊM (nếu khác qty)
}
```

### C. Audit log table mới

```sql
CREATE TABLE pbh_fulfillment_logs (
  id           BIGSERIAL PRIMARY KEY,
  pbh_number   VARCHAR(50) NOT NULL,
  action       VARCHAR(30) NOT NULL,
    -- 'pick-start', 'pick-line', 'pick-complete', 'pack', 'ship',
    -- 'flag-out-of-stock', 'photo-attach', 'partial-ship'
  product_code VARCHAR(40),
  qty_delta    NUMERIC,
  note         TEXT,
  photo_url    TEXT,
  user_id      VARCHAR(100),
  created_at   BIGINT NOT NULL
);
CREATE INDEX idx_pfl_pbh ON pbh_fulfillment_logs(pbh_number, created_at DESC);
CREATE INDEX idx_pfl_user ON pbh_fulfillment_logs(user_id);
CREATE INDEX idx_pfl_action ON pbh_fulfillment_logs(action);
```

---

## 4. UI/UX patterns đề xuất — 3 options

### Option A — Scanner-driven (recommended cho nhanh)

Trang `web2/pbh-reconcile/` mở fullscreen scanner mode:

```
┌────────────────────────────────────────────────┐
│  ĐỐI SOÁT PBH                    [Logout staff1]│
│                                                 │
│  ┌──── SCAN BARCODE PBH ─────┐                  │
│  │  📷 [camera live]          │                  │
│  │  hoặc gõ HD-...            │                  │
│  └────────────────────────────┘                  │
│                                                 │
│  ── PBH đang xử lý: HD-20260519-0042 ──        │
│  KH: Huỳnh Thành Đạt (0123456788)              │
│  STT: 4 + 7 (merged)                            │
│                                                 │
│  Danh sách SP cần pick (3 dòng):               │
│  ┌─────────────────────────────────────────┐  │
│  │ ✓ Áo Thun M Đen     2/2  [pick rồi]    │  │
│  │ ⏳ Quần Jean L      0/1  [+1] [thiếu]  │  │
│  │ ⏳ Túi Xách         0/1  [+1] [thiếu]  │  │
│  └─────────────────────────────────────────┘  │
│                                                 │
│  [📸 Chụp ảnh đóng gói]  [✅ Đã pack xong]    │
│  [⚠ Báo thiếu hàng]                            │
└────────────────────────────────────────────────┘
```

**Workflow**:

1. Scan barcode PBH (hoặc gõ) → load checklist
2. Mỗi SP: scan barcode SP (nếu có) → tự +1 picked_qty, hoặc click button +1
3. Khi đủ tất cả lines → button "Đã pack xong" enable
4. Optional: chụp ảnh đóng gói trước khi pack
5. State → `packed`, audit log INSERT

**Lib cần**: [QuaggaJS](https://github.com/serratus/quaggaJS) hoặc [zxing-js](https://github.com/zxing-js/library) cho browser barcode scan.

### Option B — Kanban board (recommended cho team lớn)

```
┌─ Pending (12) ──┬─ Picking (3) ─┬─ Picked (5) ─┬─ Packed (8) ─┐
│                 │               │              │              │
│ ┌─ HD-001 ──┐  │ ┌─ HD-010 ─┐  │ ┌─ HD-005 ┐│ ┌─ HD-020 ─┐│
│ │ KH: ABC   │  │ │ pick:2/3 │  │ │ ✓ done  ││ │ ✓ pack   ││
│ │ 3 SP       │  │ │ by staff1│  │ │         ││ │ by staff2││
│ └────────────┘  │ └──────────┘  │ └─────────┘│ └──────────┘│
│ ┌─ HD-002 ──┐  │ ┌─ HD-011 ─┐  │            │              │
│ │ KH: DEF   │  │ │ pick:1/2 │  │            │              │
│ │ 2 SP       │  │ │ by staff3│  │            │              │
│ └────────────┘  │ └──────────┘  │            │              │
│                 │               │              │              │
│ + 10 more...    │ + 1 more...   │ + 4 more... │ + 6 more... │
└─────────────────┴───────────────┴──────────────┴──────────────┘
```

**Features**:

- Drag-drop card sang cột mới → tự update fulfillment_state
- Click card → open detail panel side (scanner workflow Option A)
- SSE realtime: nhân viên A start pick → tất cả tab thấy card move sang cột Picking
- Filter: theo nhân viên, theo ngày, theo KH

### Option C — Simple checklist (recommended MVP)

Page đơn giản trong `web2/fastsaleorder-invoice/`:

- Thêm column "Đối soát" với button "▶ Pick" / "✅ Packed"
- Click "▶ Pick" → mở modal checklist các SP với checkbox + qty input
- Tick từng dòng → khi đủ thì button "Đã pack" enable
- Less powerful nhưng quick implement

---

## 5. Stock integration (tránh deduct 2 lần)

Stock lifecycle hiện tại:

```
Sổ Order:    pending_qty += 5 (CHỜ MUA)
Mua hàng:    stock += 5, pending_qty = 0 (ĐANG BÁN)
PBH create:  (chưa làm gì với stock)
```

Thêm fulfillment:

```
PBH state='done':         reserved += ordered_qty (lock stock cho PBH này)
PBH fulfillment='packed': stock -= ordered_qty + reserved -= ordered_qty  (commit)
PBH cancel sau packed:    stock += ordered_qty  (refund — báo cho user note lý do)
```

Cần thêm column `web2_products.reserved_qty` nếu muốn track strict. Hoặc đơn giản hơn: chỉ deduct stock khi packed, KHÔNG reserve giữa chừng (rủi ro: 2 PBH cùng SP có thể oversell — cần lock).

**Đề xuất MVP**: chỉ deduct khi packed, không reserve. Race condition rare cho shop nhỏ.

---

## 6. Edge cases cần xử lý

| Edge case                                      | Đề xuất                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| PBH gộp đơn (merged source_code = "NW-A+NW-B") | Pick theo combined `order_lines` — không phân biệt source nữa                         |
| Thiếu hàng giữa chừng                          | Flag SP `out_of_stock` → option: substitute / partial-ship / cancel-line              |
| Nhân viên A pick xong nhưng B đóng gói         | `fulfillment_user_id` = người pack (cuối cùng), audit log track riêng cho từng action |
| PBH bị cancel sau pack                         | Reverse: stock += qty, log `pack-reverted`                                            |
| Multi-warehouse                                | Thêm `warehouse_id` per line, pick từ warehouse cụ thể                                |
| Đơn quá lớn (>50 SP)                           | UI phân trang checklist hoặc chia batch                                               |
| Khách thay đổi đơn sau pack                    | Block edit khi `fulfillment_state >= packed`, force cancel + tạo PBH mới              |

---

## 7. Realtime SSE integration

**New topic**: `web2:pbh-fulfillment`

Server emit khi:

- `pick-start` (state → picking)
- `pick-line` (per-SP picked qty change)
- `pick-complete` (state → picked)
- `pack` (state → packed, stock deducted)
- `ship` (state → shipped)
- `flag-out-of-stock`

**Cross-broadcast**:

- `web2:fast-sale-orders` (PBH list page refresh badge "đang pack")
- `web2:products` (stock change khi pack)
- `web2:customer-wallet` (KH biết đơn đang sắp giao)

**Use case**: 2 nhân viên kho cùng làm việc trên 2 phone → drag-drop kanban thấy nhau realtime, tránh pick trùng PBH.

---

## 8. Tooling phụ trợ

### A. Picklist printable (in danh sách hôm nay cần pick)

- Group theo `productCode` (gộp các PBH cùng SP để pick 1 lần)
- Sort theo warehouse location (nếu có) → giảm walk time
- Generate qua `Web2Bill.generatePicklistHTML(date)` — extend service

Ví dụ picklist:

```
═══════ PICKLIST 19/05/2026 (12 PBH × 28 SP) ═══════

SP001 Áo Thun M Đen ········ × 5 (PBH: HD-001, HD-002, HD-005)
SP004 Quần Jean L ··········· × 3 (PBH: HD-001, HD-003)
SP010 Túi Xách Đen ·········· × 2 (PBH: HD-002, HD-007)
...
```

### B. SP label printer (cho SP chưa có barcode)

- `Web2Bill.generateProductLabel(sp)` — 40×30mm label
- Scan SP barcode khi pick → match với product_code

### C. Customer notification on packed

- Webhook đến Messenger/SMS: "📦 Đơn HD-... đã đóng gói, sẽ giao trong 2-3 ngày"
- Trigger: SSE event `pack` → server send message qua Pancake

### D. Daily fulfillment dashboard

- `web2/pbh-fulfillment-stats/` page mới
- Metrics: pending count, avg pick time, top-pick-staff, out-of-stock rate
- Chart: throughput per day, peak hours

---

## 9. Implementation roadmap

### Phase 1 — MVP (1-2 ngày)

- [ ] Migration 076: `fulfillment_state` + audit log table
- [ ] Server endpoints: POST `/api/fast-sale-orders/:number/pick-line` + `/pack` + `/ship` + `/flag-out-of-stock`
- [ ] PBH page (fastsaleorder-invoice): thêm cột "Đối soát" với button + checklist modal
- [ ] SSE topic `web2:pbh-fulfillment`
- [ ] Stock deduct khi `pack`

### Phase 2 — Scanner workflow (2-3 ngày)

- [ ] Trang mới `web2/pbh-reconcile/`
- [ ] Barcode scanner integration (QuaggaJS hoặc zxing)
- [ ] Photo upload trước pack (anti-dispute)
- [ ] Picklist printable

### Phase 3 — Kanban + Advanced (3-5 ngày)

- [ ] Kanban board với drag-drop
- [ ] Multi-user concurrent pick (row lock)
- [ ] Customer notification on packed
- [ ] Daily fulfillment dashboard

### Phase 4 — Polish (1-2 ngày)

- [ ] Multi-warehouse pick from
- [ ] SP label printer
- [ ] Reserve/release stock pattern (nếu cần)
- [ ] Partial ship support

**Tổng**: 7-12 ngày implement đầy đủ. MVP có thể ship trong 1-2 ngày.

---

## 10. Câu hỏi cần user quyết

Trước khi implement, user clarify:

1. **Scope warehouse**: 1 kho hay nhiều kho? (ảnh hưởng schema + UI)
2. **Scanner**: dùng barcode scanner USB hay scan qua mobile camera? Hay manual nhập?
3. **Photo anti-dispute**: có cần chụp ảnh đóng gói không?
4. **Customer notification**: có muốn auto send message KH khi packed không?
5. **Multi-user**: bao nhiêu nhân viên kho đồng thời? (1-2 → MVP đủ; 5+ → cần kanban)
6. **Partial pick**: cho phép giao thiếu hàng (out-of-stock substitute) hay block PBH luôn?
7. **Stock model**: deduct khi packed (đơn giản) hay reserve khi PBH done + commit khi packed (chính xác)?
8. **Integration with carrier**: có sync trạng thái ship từ GHN/J&T API không?

---

## 11. So sánh với tools sẵn có

| Tool                              | Pros                                                                                 | Cons                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Build trong Web 2.0** (đề xuất) | Tích hợp với SSE realtime + bill service sẵn có; flow native; không phụ thuộc vendor | Mất time develop ~7-12 ngày                                            |
| TPOS Reconcile module             | Có sẵn, không phải code                                                              | Phụ thuộc TPOS subscription; UI Tiếng Anh; không tích hợp data Web 2.0 |
| Trello / Notion kanban            | Quick start                                                                          | Manual sync data; không link với PBH DB; bị tản dữ liệu                |
| Google Sheet manual               | Đơn giản, ai cũng biết                                                               | Không realtime; dễ sai sót; không scale                                |

→ Recommend build trong Web 2.0 với MVP đầu tiên (1-2 ngày) để verify nghiệp vụ trước khi đầu tư đầy đủ.

---

## 12. Risk + Mitigation

| Risk                          | Mitigation                                                               |
| ----------------------------- | ------------------------------------------------------------------------ |
| Race condition pick trùng PBH | SELECT FOR UPDATE row lock + SSE realtime cho thấy ai đang pick          |
| Stock oversell                | Reserve pattern (Phase 4) hoặc throw error khi try-pack stock < ordered  |
| Nhân viên scan sai PBH        | Confirm modal "PBH HD-X của KH Y, đúng chứ?" trước khi load checklist    |
| Mất kết nối khi đang pick     | Cache local IndexedDB + retry sync khi online lại                        |
| Audit log quá lớn             | Partition theo tháng, archive cũ qua S3 sau 6 tháng                      |
| Photo upload chậm             | Compress client-side trước upload (giống Web2Bill.generateImage pattern) |

---

## Tóm tắt 3 dòng

> **Đối soát PBH** = state machine `fulfillment_state` riêng (picking/picked/packed/shipped), tích hợp với stock deduct khi packed, audit log đầy đủ, UI có 3 option (scanner / kanban / checklist) tùy team size, SSE realtime để team đồng bộ. MVP triển khai 1-2 ngày, full feature 7-12 ngày. Trước khi implement, user trả lời 8 câu hỏi clarify scope.
