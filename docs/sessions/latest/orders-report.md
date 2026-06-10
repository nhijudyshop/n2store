# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260610-030009-3f75af3`
**Session file**: [`./20260610-030009-3f75af3.md`](../20260610-030009-3f75af3.md)
**Commit**: `3f75af3` — fix(kpi): rà soát hệ thống KPI — fix timezone stat_date, audit log trùng, double render + giảm payload/request
**Last updated**: 2026-06-10 03:00:09 UTC
**Summary**: Rà soát hệ thống KPI đơn đánh giá: fix timezone stat_date VN, audit log idempotency, double render, strip details payload, cache employee-ranges

## Files changed in this commit (`orders-report/`)

- `orders-report/js/managers/kpi-audit-logger.js`
- `orders-report/js/managers/kpi-manager.js`
- `orders-report/js/tab-kpi-commission.js`
- `orders-report/js/tab1/tab1-fast-sale-invoice-status.js`
- `orders-report/js/tab1/tab1-fast-sale-workflow.js`
- `orders-report/js/tab1/tab1-processing-tags.js`
- `orders-report/js/tab1/tab1-tpos-realtime.js`
- `orders-report/migration-kpi-per-user.html`
- `orders-report/tab-kpi-commission.html`
- `orders-report/tab1-orders.html`

## Last 5 commits touching `orders-report/`

- `3f75af3` fix(kpi): rà soát hệ thống KPI — fix timezone stat*date, audit log trùng, double render + giảm payload/request *(2026-06-10)\_
- `b5975a4` feat(kpi): tính NET từ phiếu bán hàng (FastSaleOrder.OrderLines) − BASE _(2026-06-10)_
- `645bd9d` fix(orders): "đơn hàng" chỉ tính Đã xác nhận/Đã thanh toán — Nháp (Chờ hàng) như hủy _(2026-06-09)_
- `4e40f3d` fix(orders): hủy đơn xóa ĐÚNG phiếu theo FSO Id + verify/cảnh báo + đối chiếu sổ hủy _(2026-06-09)_
- `e2fbbdc` feat(orders): resolve FB global*id qua comment livestream (Pancake fetch + fetchMessages) *(2026-06-09)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260610-030009-3f75af3` cho Claude walk chain theo CLAUDE.md protocol.
