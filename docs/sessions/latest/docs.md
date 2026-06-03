# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-195450-3bd99a8`
**Session file**: [`./20260603-195450-3bd99a8.md`](../20260603-195450-3bd99a8.md)
**Commit**: `3bd99a8` — feat(web2): photo-studio v4 — camera mobile-first (auto-start nếu đã cấp quyền, camera sau mặc định, báo lỗi quyền rõ)
**Last updated**: 2026-06-03 19:54:50 +07
**Summary**: feat(web2): photo-studio v4 — camera mobile-first (auto-start nếu đã cấp quyền, camera sau mặc định, b...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `3bd99a87f` feat(web2): photo-studio v4 — camera mobile-first (auto-start nếu đã cấp quyền, camera sau mặc định, báo lỗi quyền rõ) _(2026-06-03)_
- `f03b780c6` chore(session): RESUME:20260603-194843-0291022 _(2026-06-03)_
- `0291022a3` feat(web2): photo-studio v3 — thêm engine 'AI nét' (@imgly/background-removal) + 3 mode cached _(2026-06-03)_
- `ffeb3bbec` chore(session): RESUME:20260603-194751-1a4fb73 _(2026-06-03)_
- `2081cee4b` chore(session): RESUME:20260603-193815-fb2a1c6 _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-195450-3bd99a8` cho Claude walk chain theo CLAUDE.md protocol.
