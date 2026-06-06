# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-095624-5296ba8`
**Session file**: [`./20260606-095624-5296ba8.md`](../20260606-095624-5296ba8.md)
**Commit**: `5296ba8` — auto: session update
**Last updated**: 2026-06-06 09:56:24 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `4d636eed5` docs(supplier-debt): reset toàn bộ thứ tự kéo tay 6 NCC + xóa 3 key rác → clean slate, mọi NCC sort theo ngày _(2026-06-06)_
- `4844c5c50` chore(session): RESUME:20260606-095255-6927348 _(2026-06-06)_
- `69273480c` fix(tpos-pancake): chọn nhiều campaign load liên tục — cắt feedback loop MutationObserver↔renderBadges (/cart/batch/counts ~10/s), poll ngừng gọi refreshCartCounts sau khi wire observer _(2026-06-06)_
- `27ef3a675` chore(session): RESUME:20260606-095200-2455c1a _(2026-06-06)_
- `ba86ef419` chore(session): RESUME:20260606-094645-6032f12 _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-095624-5296ba8` cho Claude walk chain theo CLAUDE.md protocol.
