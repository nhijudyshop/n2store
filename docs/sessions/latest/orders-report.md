# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-114838-a04ab8d`
**Session file**: [`./20260609-114838-a04ab8d.md`](../20260609-114838-a04ab8d.md)
**Commit**: `a04ab8d` — auto: session update
**Last updated**: 2026-06-09 11:48:38 +07
**Summary**: auto: session update

## Files changed in this commit (`orders-report/`)

- `orders-report/js/tab1/tab1-fast-sale.js`

## Last 5 commits touching `orders-report/`

- `02e2dde96` fix(orders): Fast Sale server-truth guard chong tao PBH trung -> het loi optimistic concurrency TPOS (bill ket, huy khong duoc) _(2026-06-09)_
- `4c06d93ae` merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both) _(2026-06-06)_
- `b99877c8f` fix(orders/KPI): tính NET theo ĐƠN THẬT TPOS (final − BASE), hết lệch do audit log drift _(2026-06-06)_
- `0b80fbb44` fix(orders): modal Sua don hang mo len hien SP cu -> luon revalidate tu TPOS (SWR) + invalidate edit-cache khi mutate _(2026-06-06)_
- `3fb42695a` fix(orders): modal Sua don hang luu 'thanh cong gia' -> dung lai helper sach, bo If-Match (sync TPOS on dinh) _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-114838-a04ab8d` cho Claude walk chain theo CLAUDE.md protocol.
