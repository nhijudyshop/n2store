# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-115342-85bd8c6`
**Session file**: [`./20260525-115342-85bd8c6.md`](../20260525-115342-85bd8c6.md)
**Commit**: `85bd8c6` — auto: session update
**Last updated**: 2026-05-25 11:53:42 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `bb754ddf8` feat(tpos-pancake): nút "Mở thẻ KH" + fallback enrich theo phone _(2026-05-25)_
- `fa72f56b7` chore(session): RESUME:20260525-114806-e5cd3a3 _(2026-05-25)_
- `e5cd3a34a` feat(orders-report): gỡ permission gate cho toggle RT & Auto T _(2026-05-25)_
- `732b6e63b` chore(session): RESUME:20260525-114652-7a2656d _(2026-05-25)_
- `feff132f3` chore(session): RESUME:20260525-114131-74eb239 _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-115342-85bd8c6` cho Claude walk chain theo CLAUDE.md protocol.
