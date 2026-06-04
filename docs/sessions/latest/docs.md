# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-101540-94dd763`
**Session file**: [`./20260604-101540-94dd763.md`](../20260604-101540-94dd763.md)
**Commit**: `94dd763` — docs(web2): photo-studio v9 ✅ — PhotoRoom Studio cloud deploy + verify live (cutout 512² 1.5s OK)
**Last updated**: 2026-06-04 10:15:40 +07
**Summary**: docs(web2): photo-studio v9 ✅ — PhotoRoom Studio cloud deploy + verify live (cutout 512² 1.5s OK)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/DB-SEPARATION-PLAN.md`

## Last 5 commits touching `docs/`

- `94dd763a7` docs(web2): photo-studio v9 ✅ — PhotoRoom Studio cloud deploy + verify live (cutout 512² 1.5s OK) _(2026-06-04)_
- `528b27913` docs(web2): photo-studio — cutout route live (cần redeploy load key); BiRefNet in-browser OOM (không khả thi mobile) _(2026-06-04)_
- `d0138f20c` refactor(web2): bỏ Neon hoàn toàn — Render PG + Firebase only, xoá deadcode _(2026-06-04)_
- `d5c818e10` chore(session): RESUME:20260604-095020-7183331 _(2026-06-04)_
- `7183331b7` feat(web2): photo-studio v9 — engine cloud PhotoRoom cho 'AI nét' chất lượng cao _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-101540-94dd763` cho Claude walk chain theo CLAUDE.md protocol.
