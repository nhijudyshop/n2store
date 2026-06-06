# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-095255-6927348`
**Session file**: [`./20260606-095255-6927348.md`](../20260606-095255-6927348.md)
**Commit**: `6927348` — fix(tpos-pancake): chọn nhiều campaign load liên tục — cắt feedback loop MutationObserver↔renderBadges (/cart/batch/counts ~10/s), poll ngừng gọi refreshCartCounts sau khi wire observer
**Last updated**: 2026-06-06 09:52:55 +07
**Summary**: fix(tpos-pancake): chọn nhiều campaign load liên tục — cắt feedback loop MutationObserver↔renderBadges (...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `69273480c` fix(tpos-pancake): chọn nhiều campaign load liên tục — cắt feedback loop MutationObserver↔renderBadges (/cart/batch/counts ~10/s), poll ngừng gọi refreshCartCounts sau khi wire observer _(2026-06-06)_
- `27ef3a675` chore(session): RESUME:20260606-095200-2455c1a _(2026-06-06)_
- `ba86ef419` chore(session): RESUME:20260606-094645-6032f12 _(2026-06-06)_
- `6032f122f` fix(supplier-debt): hóa đơn mới tự chèn theo ngày thay vì dồn cuối (sửa xáo thứ tự kéo tay) + reset thứ tự B24 bị hỏng _(2026-06-06)_
- `fbd7af8d4` chore(session): RESUME:20260606-093945-90c3cd1 _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-095255-6927348` cho Claude walk chain theo CLAUDE.md protocol.
