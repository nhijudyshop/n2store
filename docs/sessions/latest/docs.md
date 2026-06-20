# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-190402-b16d82b`
**Session file**: [`./20260620-190402-b16d82b.md`](../20260620-190402-b16d82b.md)
**Commit**: `b16d82b` — auto: session update
**Last updated**: 2026-06-20 19:04:02 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/WEB2-CODEMAP.md`
- `docs/web2/web2-codemap.json`

## Last 5 commits touching `docs/`

- `784b6d0e7` fix(web2): cache tu nap Web2ProductsApi (shared) -> picker load SP khong can vao Kho SP truoc _(2026-06-20)_
- `7eef1e1be` fix(web2/reconcile): client gui x-web2-token (regression tu audit gate reconcile route) - sua 'thieu/sai token' _(2026-06-20)_
- `40ec6ff2a` fix(live-chat/security): gate GET read endpoints live-comments (/, campaigns, posts, page-posts, saved/ids) - BACKEND, dong PII leak _(2026-06-20)_
- `4703899a7` fix(live-chat/security): comments-mobile guard login + gui x-web2-token (chong xem comment khach an danh) - CLIENT _(2026-06-20)_
- `580e61bdf` chore(session): RESUME:20260620-164751-919af11 _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-190402-b16d82b` cho Claude walk chain theo CLAUDE.md protocol.
