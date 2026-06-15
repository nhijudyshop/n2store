# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-135542-a096878`
**Session file**: [`./20260615-135542-a096878.md`](../20260615-135542-a096878.md)
**Commit**: `a096878` — docs(dev-log): comment fade dịu không flash
**Last updated**: 2026-06-15 13:55:42 +07
**Summary**: docs(dev-log): comment fade dịu không flash

## Files changed in this commit (`live-chat/`)

- `live-chat/comments-mobile.html`
- `live-chat/css/live/live-comments.css`
- `live-chat/index.html`

## Last 5 commits touching `live-chat/`

- `f65af40b0` fix(live-chat): hiệu ứng comment mới = fade thuần dịu (0.55s ease), bỏ trượt — không lóe/flash _(2026-06-15)_
- `51e27c632` feat(live-chat): trạng thái về cạnh tên — tên → trạng thái → page (desktop + mobile) _(2026-06-15)_
- `aba8ea61f` feat(live-chat): hiệu ứng comment mới dịu mắt (fade+trượt nhẹ) + burst-aware _(2026-06-15)_
- `4ce660d2b` refactor(live-chat): mobile zero-interval — gỡ setInterval(loadPosts,90s) → SSE event-driven (throttle 30s) _(2026-06-15)_
- `b8c166071` feat(live-chat): WS-direct comment livestream (bỏ poll, nhanh ~TPOS) + render append-only đúng invariant _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-135542-a096878` cho Claude walk chain theo CLAUDE.md protocol.
