# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-121538-aba8ea6`
**Session file**: [`./20260615-121538-aba8ea6.md`](../20260615-121538-aba8ea6.md)
**Commit**: `aba8ea6` — feat(live-chat): hiệu ứng comment mới dịu mắt (fade+trượt nhẹ) + burst-aware
**Last updated**: 2026-06-15 12:15:38 +07
**Summary**: feat(live-chat): hiệu ứng comment mới dịu mắt (fade+trượt nhẹ) + burst-aware

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `aba8ea61f` feat(live-chat): hiệu ứng comment mới dịu mắt (fade+trượt nhẹ) + burst-aware _(2026-06-15)_
- `867a3edeb` chore(session): RESUME:20260615-121007-f550ecf _(2026-06-15)_
- `f240f86dc` chore(session): RESUME:20260615-120146-4ce660d _(2026-06-15)_
- `4ce660d2b` refactor(live-chat): mobile zero-interval — gỡ setInterval(loadPosts,90s) → SSE event-driven (throttle 30s) _(2026-06-15)_
- `5a01e7e18` chore(session): RESUME:20260615-115250-525fff1 _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-121538-aba8ea6` cho Claude walk chain theo CLAUDE.md protocol.
