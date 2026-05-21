# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-150622-ddd3761`
**Session file**: [`./20260521-150622-ddd3761.md`](../20260521-150622-ddd3761.md)
**Commit**: `ddd3761` — fix(inventory): SSE handler map snake_case→camelCase (gốc bug 'đợt 2 lệch qua đợt 1')
**Last updated**: 2026-05-21 15:06:22 +07
**Summary**: fix(inventory): SSE handler map snake_case→camelCase (gốc bug 'đợt 2 lệch qua đợt 1')

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `ddd37616` fix(inventory): SSE handler map snake*case→camelCase (gốc bug 'đợt 2 lệch qua đợt 1') *(2026-05-21)\_
- `92d237f1` chore(session): RESUME:20260521-145223-a9060fc _(2026-05-21)_
- `a9060fc8` docs(dev-log): document FB error 1545012 (BLOCKED*RETRY_SOCKET) fix in web2-extension *(2026-05-21)\_
- `3e59ea38` chore(session): RESUME:20260521-145014-915104f _(2026-05-21)_
- `d378bdfa` chore(session): RESUME:20260521-144455-1cd1cd8 _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-150622-ddd3761` cho Claude walk chain theo CLAUDE.md protocol.
