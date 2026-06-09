# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-183438-983a7ce`
**Session file**: [`./20260609-183438-983a7ce.md`](../20260609-183438-983a7ce.md)
**Commit**: `983a7ce` — auto: session update
**Last updated**: 2026-06-09 18:34:38 +07
**Summary**: auto: session update

## Files changed in this commit (`orders-report/`)

- `orders-report/css/tab1-orders.css`
- `orders-report/js/tab1/tab1-customer-info.js`

## Last 5 commits touching `orders-report/`

- `983a7ce02` auto: session update _(2026-06-09)_
- `1946e76f5` chore(kpi): bump kpi-manager.js cache version 20260521b→20260609a (force reload staleness-guard fix) _(2026-06-09)_
- `60dcdd2c5` fix(kpi): refetch TPOS snapshot khi lỗi thời — sửa NET đếm thiếu SP (race chốt nhiều SP liên tiếp) _(2026-06-09)_
- `a65fbfd26` auto: session update _(2026-06-09)_
- `02e2dde96` fix(orders): Fast Sale server-truth guard chong tao PBH trung -> het loi optimistic concurrency TPOS (bill ket, huy khong duoc) _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-183438-983a7ce` cho Claude walk chain theo CLAUDE.md protocol.
