# Progress Log — N2Store Implementation Plan

> **Cách dùng:** File này là nhật ký tiến độ. AI agent đọc file này đầu tiên khi tiếp tục plan.
> Sau mỗi task hoàn thành, thêm entry mới vào đầu section "Log" (mới nhất ở trên).

---

## Trạng thái hiện tại

- **Sprint đang làm:** Chưa bắt đầu
- **Task tiếp theo:** Sprint 1 → Phase 1A.1 (Thêm fields mới vào data model ledger)
- **File cần đọc trước khi làm tiếp:**
  - `orders-report/js/overview/overview-ledger.js` — Sổ Sách module hiện tại
  - `docs/plans/plan-implementation-tracker.md` — Chi tiết plan

---

## Checklist tổng quan

### Sprint 1 (Tuần 1-2): Sổ Sách + Hàng rớt
- [ ] Phase 1A: Mở rộng Sổ Sách giao hàng từng phần (7 tasks)
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
> ```
> ### [NGÀY] — [TASK ID] [Tên task]
> **Trạng thái:** Hoàn thành / Đang làm dở / Blocked
> **Files đã sửa:** danh sách file
> **Ghi chú kỹ thuật:** những điều cần biết cho task sau
> **Vấn đề gặp phải:** (nếu có)
> ```

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
