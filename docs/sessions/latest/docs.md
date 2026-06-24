# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-113131-8427499`
**Session file**: [`./20260624-113131-8427499.md`](../20260624-113131-8427499.md)
**Commit**: `8427499` — docs(dev-log): bg-remover server (tách nền máy shop, VieNeu pattern)
**Last updated**: 2026-06-24 11:31:31 +07
**Summary**: fix web2/users: perms tab scroll + đổi mật khẩu modal Sửa + hiện MK cột

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `842749995` docs(dev-log): bg-remover server (tách nền máy shop, VieNeu pattern) _(2026-06-24)_
- `a2d0d9c59` fix(web2/users): perms tab scroll (iframe embed clip) + đổi mật khẩu trong modal Sửa + hiện MK cột _(2026-06-24)_
- `302b54408` fix(web2): VieNeu registry -> Postgres (fix multi-instance) + ChatAnywhere provider + preset thumbnails _(2026-06-24)_
- `53a105105` chore(session): RESUME:20260624-103026-f0637de _(2026-06-24)_
- `f0637de38` feat(web2): expand AI presets shared module — +6 chat roles, dual global, sidebar autoload _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-113131-8427499` cho Claude walk chain theo CLAUDE.md protocol.
