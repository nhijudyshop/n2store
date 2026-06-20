# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-190554-d11c4eb`
**Session file**: [`./20260620-190554-d11c4eb.md`](../20260620-190554-d11c4eb.md)
**Commit**: `d11c4eb` — fix(live-chat): load comment DB thieu x-web2-token -> 401 -> 0 comment (regression gate web2-live-comments)
**Last updated**: 2026-06-20 19:05:54 +07
**Summary**: fix live-chat 0 comment: them x-web2-token vao fetch DB comment (regression gate)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `d11c4eb44` fix(live-chat): load comment DB thieu x-web2-token -> 401 -> 0 comment (regression gate web2-live-comments) _(2026-06-20)_
- `eec229e04` chore(session): RESUME:20260620-190402-b16d82b _(2026-06-20)_
- `784b6d0e7` fix(web2): cache tu nap Web2ProductsApi (shared) -> picker load SP khong can vao Kho SP truoc _(2026-06-20)_
- `7eef1e1be` fix(web2/reconcile): client gui x-web2-token (regression tu audit gate reconcile route) - sua 'thieu/sai token' _(2026-06-20)_
- `40ec6ff2a` fix(live-chat/security): gate GET read endpoints live-comments (/, campaigns, posts, page-posts, saved/ids) - BACKEND, dong PII leak _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-190554-d11c4eb` cho Claude walk chain theo CLAUDE.md protocol.
