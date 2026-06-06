# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-185212-4c06d93`
**Session file**: [`./20260606-185212-4c06d93.md`](../20260606-185212-4c06d93.md)
**Commit**: `4c06d93` — merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both)
**Last updated**: 2026-06-06 18:52:12 +07
**Summary**: merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both)

## Files changed in this commit (`orders-report/`)

- `orders-report/js/managers/kpi-manager.js`
- `orders-report/js/tab-kpi-commission.js`
- `orders-report/js/tab1/tab1-edit-modal.js`
- `orders-report/js/tab1/tab1-merge.js`
- `orders-report/js/tab1/tab1-sale.js`
- `orders-report/tab1-orders.html`

## Last 5 commits touching `orders-report/`

- `4c06d93ae` merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both) _(2026-06-06)_
- `b99877c8f` fix(orders/KPI): tính NET theo ĐƠN THẬT TPOS (final − BASE), hết lệch do audit log drift _(2026-06-06)_
- `0b80fbb44` fix(orders): modal Sua don hang mo len hien SP cu -> luon revalidate tu TPOS (SWR) + invalidate edit-cache khi mutate _(2026-06-06)_
- `3fb42695a` fix(orders): modal Sua don hang luu 'thanh cong gia' -> dung lai helper sach, bo If-Match (sync TPOS on dinh) _(2026-06-06)_
- `1f33be884` fix(orders): KPI xac nhan kiem tra don — luu dang tin (retry+verify+rollback), het 'luc co luc khong' _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-185212-4c06d93` cho Claude walk chain theo CLAUDE.md protocol.
