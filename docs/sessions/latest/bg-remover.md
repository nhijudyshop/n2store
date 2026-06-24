# Latest Snapshot — `bg-remover/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-113131-8427499`
**Session file**: [`./20260624-113131-8427499.md`](../20260624-113131-8427499.md)
**Commit**: `8427499` — docs(dev-log): bg-remover server (tách nền máy shop, VieNeu pattern)
**Last updated**: 2026-06-24 11:31:31 +07
**Summary**: fix web2/users: perms tab scroll + đổi mật khẩu modal Sửa + hiện MK cột

## Files changed in this commit (`bg-remover/`)

- `bg-remover/README.md`
- `bg-remover/app.py`
- `bg-remover/install-windows.bat`
- `bg-remover/requirements.txt`
- `bg-remover/run-mac.command`
- `bg-remover/serve.py`

## Last 5 commits touching `bg-remover/`

- `4bac6625f` chore(web2/users): prettier format users-app.js _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-113131-8427499` cho Claude walk chain theo CLAUDE.md protocol.
