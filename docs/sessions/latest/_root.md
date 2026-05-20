# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260520-093029-31cafa3`
**Session file**: [`./20260520-093029-31cafa3.md`](../20260520-093029-31cafa3.md)
**Commit**: `31cafa3` — auto: session update
**Last updated**: 2026-05-20 09:30:29 +07
**Summary**: auto: session update

## Files changed in this commit (`_root/`)

- `index.html`

## Last 5 commits touching `_root/`

- `31cafa32` auto: session update _(2026-05-20)_
- `324935e8` fix(auth): bỏ prompt "Lưu mật khẩu" của browser trên các page có password input _(2026-04-22)_
- `9e588e01` style: unify typography across all pages (Inter 20px weight 600) _(2026-04-08)_
- `ea059fd1` feat(docs): add #Note AI-instruction header to all HTML+JS files + module overview in dev-log _(2026-04-04)_
- `db6a4e1b` feat: migrate user management from Firebase to Render PostgreSQL API _(2026-03-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260520-093029-31cafa3` cho Claude walk chain theo CLAUDE.md protocol.
