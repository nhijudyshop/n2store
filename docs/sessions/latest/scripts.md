# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-132442-49d853d`
**Session file**: [`./20260522-132442-49d853d.md`](../20260522-132442-49d853d.md)
**Commit**: `49d853d` — feat(delivery-report): filter+stats follow lite-hide logic (table-aligned visibility)
**Last updated**: 2026-05-22 13:24:42 +07
**Summary**: feat(delivery-report): filter+stats follow lite-hide logic (table-aligned visibility)

## Files changed in this commit (`scripts/`)

- `scripts/test-dr-lite-hide.js`

## Last 5 commits touching `scripts/`

- `49d853d32` feat(delivery-report): filter+stats follow lite-hide logic (table-aligned visibility) _(2026-05-22)_
- `03ee08314` feat(scripts): realtime HTTP/SSE API + compound `do` cho browser-session _(2026-05-22)_
- `8e901b554` auto: session update _(2026-05-21)_
- `174779425` auto: session update _(2026-05-21)_
- `c53e98a32` feat(scripts): auto cache-bust ?v=YYYYMMDDx for changed JS/CSS _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-132442-49d853d` cho Claude walk chain theo CLAUDE.md protocol.
