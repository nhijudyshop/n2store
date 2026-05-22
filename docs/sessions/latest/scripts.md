# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-113012-1db530e`
**Session file**: [`./20260522-113012-1db530e.md`](../20260522-113012-1db530e.md)
**Commit**: `1db530e` — auto: session update
**Last updated**: 2026-05-22 11:30:12 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/n2store-browser-session.js`

## Last 5 commits touching `scripts/`

- `03ee08314` feat(scripts): realtime HTTP/SSE API + compound `do` cho browser-session _(2026-05-22)_
- `8e901b554` auto: session update _(2026-05-21)_
- `174779425` auto: session update _(2026-05-21)_
- `c53e98a32` feat(scripts): auto cache-bust ?v=YYYYMMDDx for changed JS/CSS _(2026-05-21)_
- `eee5df14f` auto: session update _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-113012-1db530e` cho Claude walk chain theo CLAUDE.md protocol.
