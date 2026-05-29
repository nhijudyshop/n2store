# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-121353-1bcb2ec`
**Session file**: [`./20260529-121353-1bcb2ec.md`](../20260529-121353-1bcb2ec.md)
**Commit**: `1bcb2ec` — auto: session update
**Last updated**: 2026-05-29 12:13:53 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `32bbd71f4` refactor(web2): P2 audit fix — remove 4 Firestore onSnapshot listeners _(2026-05-29)_
- `13807da2d` chore(web2): P1 audit fix — bump 72 trang stale cache page-shell.js v=20260519j → v=20260529a _(2026-05-29)_
- `4d204a165` chore(session): RESUME:20260528-152447-4662e68 _(2026-05-28)_
- `4662e6833` feat(web2/live-campaign): modal tạo/sửa campaign giống TPOS — page picker + live video cascade + Config dropdown _(2026-05-28)_
- `6236d6f82` chore(session): RESUME:20260526-185912-e15ff61 _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-121353-1bcb2ec` cho Claude walk chain theo CLAUDE.md protocol.
