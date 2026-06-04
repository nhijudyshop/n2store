# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-101540-94dd763`
**Session file**: [`./20260604-101540-94dd763.md`](../20260604-101540-94dd763.md)
**Commit**: `94dd763` — docs(web2): photo-studio v9 ✅ — PhotoRoom Studio cloud deploy + verify live (cutout 512² 1.5s OK)
**Last updated**: 2026-06-04 10:15:40 +07
**Summary**: docs(web2): photo-studio v9 ✅ — PhotoRoom Studio cloud deploy + verify live (cutout 512² 1.5s OK)

## Files changed in this commit (`render.com/`)

- `render.com/db/web2-data-copy.js`
- `render.com/db/web2-pool.js`
- `render.com/db/web2-schema-mirror.js`
- `render.com/routes/admin-data-copy-web2.js`
- `render.com/routes/admin-migrate-web2.js`
- `render.com/routes/admin-schema-mirror-web2.js`
- `render.com/routes/admin-web2-data-reset.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `091fac3bf` feat(web2): admin endpoint web2-data-reset (backup+wipe SP/đơn/PBH/cart, giữ KH) _(2026-06-04)_
- `d0138f20c` refactor(web2): bỏ Neon hoàn toàn — Render PG + Firebase only, xoá deadcode _(2026-06-04)_
- `7183331b7` feat(web2): photo-studio v9 — engine cloud PhotoRoom cho 'AI nét' chất lượng cao _(2026-06-04)_
- `cd029da6d` fix(web2): generic /api/web2 route shadow dedicated → data 3 trang load lại _(2026-06-04)_
- `8c6859bf9` feat(web2): đổi tên kho KH đơn hàng customers → web2*order_customers (web2Db) *(2026-06-03)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-101540-94dd763` cho Claude walk chain theo CLAUDE.md protocol.
