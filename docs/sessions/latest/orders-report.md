# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260610-032927-c089ff3`
**Session file**: [`./20260610-032927-c089ff3.md`](../20260610-032927-c089ff3.md)
**Commit**: `c089ff3` — feat(kpi): gọn filter bar — bỏ chips OK/Sai lệch, gộp Lọc+Làm mới, default Hôm nay + campaign mới nhất (có cache)
**Last updated**: 2026-06-10 03:29:27 UTC
**Summary**: KPI UI: bỏ chips OK/Sai lệch, Lọc=refreshData gộp Làm mới, default Hôm nay+campaign mới nhất với filter cache

## Files changed in this commit (`orders-report/`)

- `orders-report/css/tab-kpi-commission.css`
- `orders-report/js/tab-kpi-commission.js`
- `orders-report/tab-kpi-commission.html`

## Last 5 commits touching `orders-report/`

- `c089ff3` feat(kpi): gọn filter bar — bỏ chips OK/Sai lệch, gộp Lọc+Làm mới, default Hôm nay + campaign mới nhất (có cache) _(2026-06-10)_
- `9cb811f` feat(kpi): reattribute atomic 1-request, bỏ creds hardcode KPI tab, 'Làm mới' tự reconcile đơn vừa có phiếu _(2026-06-10)_
- `3f75af3` fix(kpi): rà soát hệ thống KPI — fix timezone stat*date, audit log trùng, double render + giảm payload/request *(2026-06-10)\_
- `b5975a4` feat(kpi): tính NET từ phiếu bán hàng (FastSaleOrder.OrderLines) − BASE _(2026-06-10)_
- `645bd9d` fix(orders): "đơn hàng" chỉ tính Đã xác nhận/Đã thanh toán — Nháp (Chờ hàng) như hủy _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260610-032927-c089ff3` cho Claude walk chain theo CLAUDE.md protocol.
