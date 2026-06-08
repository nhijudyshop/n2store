# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-200224-76bfd66`
**Session file**: [`./20260608-200224-76bfd66.md`](../20260608-200224-76bfd66.md)
**Commit**: `76bfd66` — feat(web2): SDT phu cho KH (uu tien kho, khong ghi de) - giong dedup 1 KH nhieu SDT
**Last updated**: 2026-06-08 20:02:24 +07
**Summary**: feat(web2): SDT phu cho KH (uu tien kho, khong ghi de) - giong dedup 1 KH nhieu SDT

## Files changed in this commit (`render.com/`)

- `render.com/db/web2-customers-schema.js`
- `render.com/routes/v2/web2-customers.js`

## Last 5 commits touching `render.com/`

- `76bfd6602` feat(web2): SDT phu cho KH (uu tien kho, khong ghi de) - giong dedup 1 KH nhieu SDT _(2026-06-08)_
- `b0f1f06c1` feat(web2): balance-history tu cap nhat khi co GD moi (SSE web2:balance-history, khoi F5) _(2026-06-08)_
- `a83467a4a` feat(live): trich SDT tu noi dung comment (khach tu go) + profile Pancake _(2026-06-08)_
- `433fa3467` feat(web2): poller enrich SDT tu customer PROFILE Pancake (~88% coverage) _(2026-06-08)_
- `f280aa99a` feat(soluong-live): nut 🔄 TPOS per-product - ep sync TPOS roi re-import (bien the/gia/ten/ma/anh, giu soldQty) _(2026-06-08)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-200224-76bfd66` cho Claude walk chain theo CLAUDE.md protocol.
