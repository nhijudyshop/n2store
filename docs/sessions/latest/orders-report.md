# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-184527-2422759`
**Session file**: [`./20260601-184527-2422759.md`](../20260601-184527-2422759.md)
**Commit**: `2422759` — fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict
**Last updated**: 2026-06-01 18:45:27 +07
**Summary**: fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict

## Files changed in this commit (`orders-report/`)

- `orders-report/js/tab1/tab1-fast-sale-invoice-status.js`
- `orders-report/js/tab1/tab1-fast-sale-workflow.js`
- `orders-report/js/tab1/tab1-processing-tags.js`
- `orders-report/js/tab1/tab1-sale.js`

## Last 5 commits touching `orders-report/`

- `ef1f89772` fix(orders-report): XL auto-flip ĐÃ RA ĐƠN mất ~50% + đơn ÂM MÃ hiển thị sai _(2026-06-01)_
- `fc03672b0` feat(orders): nut hien thi + cho tao phieu tiep voi don da co phieu trong modal hoa don nhanh _(2026-06-01)_
- `749a37261` fix(orders-report,render): celebration sync cross-machine — máy khác render đúng ảnh admin upload _(2026-06-01)_
- `9a47de6e8` feat(orders-report): celebration-config — admin chỉnh ảnh/text/effects pháo hoa per nhân viên _(2026-06-01)_
- `144e2ef87` auto: session update _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-184527-2422759` cho Claude walk chain theo CLAUDE.md protocol.
