# Latest Snapshot — `web2-attendance-sync/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-123907-fadcac9`
**Session file**: [`./20260623-123907-fadcac9.md`](../20260623-123907-fadcac9.md)
**Commit**: `fadcac9` — feat(web2-admin): group Quản trị viên (admin-only) + Chấm công DG-600 + Quản lý chi tiêu
**Last updated**: 2026-06-23 12:39:07 +07
**Summary**: Group Quản trị viên admin-only + Chấm công DG-600 + Quản lý chi tiêu (Sổ quỹ) — module Web 2.0 riêng

## Files changed in this commit (`web2-attendance-sync/`)

- `web2-attendance-sync/.gitignore`
- `web2-attendance-sync/README.md`
- `web2-attendance-sync/adms-proxy.js`
- `web2-attendance-sync/config.example.json`
- `web2-attendance-sync/install-windows.bat`
- `web2-attendance-sync/lib-config.js`
- `web2-attendance-sync/package.json`
- `web2-attendance-sync/run-mac.command`
- `web2-attendance-sync/sync.js`

## Last 5 commits touching `web2-attendance-sync/`

- `fadcac906` feat(web2-admin): group Quản trị viên (admin-only) + Chấm công DG-600 + Quản lý chi tiêu _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-123907-fadcac9` cho Claude walk chain theo CLAUDE.md protocol.
