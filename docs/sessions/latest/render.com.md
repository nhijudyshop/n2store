# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-111903-954852a`
**Session file**: [`./20260604-111903-954852a.md`](../20260604-111903-954852a.md)
**Commit**: `954852a` — feat(soluong-live): realtime TPOS sync tên/hình/số lượng (giữ logic biến thể)
**Last updated**: 2026-06-04 11:19:03 +07
**Summary**: feat(soluong-live): realtime TPOS sync tên/hình/số lượng (giữ logic biến thể)

## Files changed in this commit (`render.com/`)

- `render.com/routes/admin-web2-data-reset.js`

## Last 5 commits touching `render.com/`

- `c122b0dbf` feat(web2): admin data-reset ho tro target=inventory cho supplier-debt module _(2026-06-04)_
- `93886e4e0` auto: session update _(2026-06-04)_
- `091fac3bf` feat(web2): admin endpoint web2-data-reset (backup+wipe SP/đơn/PBH/cart, giữ KH) _(2026-06-04)_
- `d0138f20c` refactor(web2): bỏ Neon hoàn toàn — Render PG + Firebase only, xoá deadcode _(2026-06-04)_
- `7183331b7` feat(web2): photo-studio v9 — engine cloud PhotoRoom cho 'AI nét' chất lượng cao _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-111903-954852a` cho Claude walk chain theo CLAUDE.md protocol.
