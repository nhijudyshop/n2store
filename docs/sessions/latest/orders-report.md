# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-161026-68aff9e`
**Session file**: [`./20260609-161026-68aff9e.md`](../20260609-161026-68aff9e.md)
**Commit**: `68aff9e` — feat(harvester): lưu cả mật khẩu Pancake → bật auto-renew (trước chỉ lưu token)
**Last updated**: 2026-06-09 16:10:26 +07
**Summary**: feat(harvester): lưu cả mật khẩu Pancake → bật auto-renew (trước chỉ lưu token)

## Files changed in this commit (`orders-report/`)

- `orders-report/js/managers/kpi-manager.js`
- `orders-report/migration-kpi-per-user.html`
- `orders-report/tab-kpi-commission.html`
- `orders-report/tab1-orders.html`

## Last 5 commits touching `orders-report/`

- `1946e76f5` chore(kpi): bump kpi-manager.js cache version 20260521b→20260609a (force reload staleness-guard fix) _(2026-06-09)_
- `60dcdd2c5` fix(kpi): refetch TPOS snapshot khi lỗi thời — sửa NET đếm thiếu SP (race chốt nhiều SP liên tiếp) _(2026-06-09)_
- `a65fbfd26` auto: session update _(2026-06-09)_
- `02e2dde96` fix(orders): Fast Sale server-truth guard chong tao PBH trung -> het loi optimistic concurrency TPOS (bill ket, huy khong duoc) _(2026-06-09)_
- `4c06d93ae` merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both) _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-161026-68aff9e` cho Claude walk chain theo CLAUDE.md protocol.
