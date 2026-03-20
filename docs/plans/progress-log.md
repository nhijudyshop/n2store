# Progress Log — N2Store Implementation Plan

> **Cách dùng:** File này là nhật ký tiến độ. AI agent đọc file này đầu tiên khi tiếp tục plan.
> Sau mỗi task hoàn thành, thêm entry mới vào đầu section "Log" (mới nhất ở trên).

---

## Trạng thái hiện tại

- **Sprint đang làm:** Sprint 1
- **Task tiếp theo:** Sprint 1 → Phase 2.1 (Hàng rớt xả theo đợt live)
- **Sprint 0 (Stock Check):** Phase 0A + 0B + 0C code done, chờ test manual
- **File cần đọc trước khi làm tiếp:**
    - `orders-report/js/managers/dropped-products-manager.js` — Dropped products module
    - `docs/plans/plan-implementation-tracker.md` — Chi tiết plan

---

## Checklist tổng quan

### Sprint 0: Kiểm tra tồn kho (Stock Check)

- [x] Phase 0A: Fix data loading (bỏ dependency orderProducts, detect name column, normalize codes)
- [x] Phase 0B: Đổi 3 trạng thái → 2 trạng thái (sufficient/insufficient)
- [x] Phase 0C: Filter Tabs + Polish UI
- [ ] Manual testing

### Sprint 1 (Tuần 1-2): Sổ Sách + Hàng rớt

- [x] Phase 1A: Mở rộng Sổ Sách giao hàng từng phần (10 tasks, gồm 3 bổ sung)
- [ ] Phase 2: Hàng rớt xả theo đợt live (5 tasks)

### Sprint 2 (Tuần 3-4): Supply Status + Thống kê tags

- [ ] Phase 1B: Supply Status panel cho Sale ở Tab1 (7 tasks)
- [ ] Phase 3A: Thống kê Processing Tags theo nhân viên (5 tasks)

### Sprint 3 (Tuần 5-6): Handover CSKH + KPI per-live

- [ ] Phase 3B: Chế độ Handover cho CSKH (8 tasks)
- [ ] Phase 4D: KPI theo đợt live (4 tasks)

### Sprint 4 (Tuần 7-8): Fix KPI

- [ ] Phase 4A: Fix bug thêm mã nhầm (5 tasks)
- [ ] Phase 4B: KPI đối chiếu Sổ Sách (5 tasks)
- [ ] Phase 4C: KPI chỉ cộng khi đơn thành công (7 tasks)

### Sprint 5 (Tuần 9): Polish

- [ ] Phase 5: Polish & Mobile (5 tasks)

---

## Log

> Format mỗi entry:
>
> ```
> ### [NGÀY] — [TASK ID] [Tên task]
> **Trạng thái:** Hoàn thành / Đang làm dở / Blocked
> **Files đã sửa:** danh sách file
> **Ghi chú kỹ thuật:** những điều cần biết cho task sau
> **Vấn đề gặp phải:** (nếu có)
> ```

### 2026-03-20 — Sprint 0: Kiểm tra tồn kho (Phase 0A + 0B + 0C)

**Trạng thái:** Hoàn thành (code), chờ manual test
**Files đã sửa:**

- `orders-report/js/tab1/tab1-stock-status.js` — Rewrite fetchStockFromTPOSExcel (bỏ orderProducts dependency), detect name column, normalize uppercase, simplify 3→2 states, add filter tabs function
- `orders-report/css/tab1-stock-status.css` — Replace waiting/critical CSS with sufficient/insufficient, add filter tabs styles
- `orders-report/tab1-orders.html` — Add stockFilterTabs container
- `docs/plans/sprint0-stock-check.md` — Tick completed tasks

**Ghi chú kỹ thuật:**

- `fetchStockFromTPOSExcel()` giờ build stockMap trực tiếp từ Excel, không cần load orderProducts trước → nhanh hơn, ít lỗi hơn
- Product codes normalize UPPERCASE ở cả loadOrderProductDetails() và renderStockColumnCell()
- 3 trạng thái (ready/waiting/critical) → 2 trạng thái (sufficient/insufficient), tooltip format "Tồn: X / Cần: Y"
- Filter tabs pill badges [Tất cả X] [Đủ Y] [Thiếu Z] cạnh nút "Cài đặt cột"
- syncProcessingTags() tự động đúng vì chỉ tag insufficient orders (stockTags chỉ có ở insufficient)

---

### 2026-03-19 — Phase 1A: Mở rộng Sổ Sách giao hàng từng phần

**Trạng thái:** Hoàn thành
**Files đã sửa:**

- `orders-report/js/overview/overview-ledger.js` — Thêm delivery status filter support
- `orders-report/js/tab-live-ledger.js` — Full upgrade: delivery batches, status badges, batch form, auto-calc, status filter
- `orders-report/css/tab-live-ledger.css` — Thêm styles cho delivery badges + batch popup form
- `orders-report/tab-live-ledger.html` — Thêm delivery status filter dropdown
- `orders-report/tab-overview.html` — Thêm delivery status filter dropdown

**Ghi chú kỹ thuật:**

- overview-ledger.js đã có sẵn tất cả Phase 1A features (1A.1-1A.7) từ trước
- tab-live-ledger.js (standalone page) thiếu hầu hết tính năng Phase 1A → đã upgrade toàn bộ
- Bổ sung 3 tasks (1A.8-1A.10): upgrade standalone ledger + thêm delivery status filter cho cả 2 views
- Cả 2 views giờ đều có: delivery batches, status badges (xanh/vàng/đỏ/xám), batch form popup, auto-calc derived fields, NCC filter + delivery status filter
- `calcDerivedFields()` tính `nccPendingQty = max(0, duyen - delivered - cancelled)` và `deliveryStatus` tự động

---

### 2026-03-18 — Setup Plan & Tracking

**Trạng thái:** Hoàn thành
**Files đã tạo:**

- `docs/plans/plan-implementation-tracker.md` — plan chi tiết với checklist
- `docs/plans/plan-tracker.html` — trang web tracking interactive (light theme)
- `docs/plans/progress-log.md` — file này
- `CLAUDE.md` — hướng dẫn cho AI agent

**Ghi chú:** Plan gồm 5 sprint, 9 tuần. Bắt đầu từ Phase 1 (Sổ Sách + Supply Status) vì giải quyết bottleneck lớn nhất giữa Duyên và Sale. CSKH handover dùng bảng filter đơn giản (không card view). KPI finalization dùng kết hợp invoice_status_v2 + TPOS API.

---

<!-- THÊM LOG MỚI Ở TRÊN DÒNG NÀY -->
