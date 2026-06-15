# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-120146-4ce660d`
**Session file**: [`./20260615-120146-4ce660d.md`](../20260615-120146-4ce660d.md)
**Commit**: `4ce660d` — refactor(live-chat): mobile zero-interval — gỡ setInterval(loadPosts,90s) → SSE event-driven (throttle 30s)
**Last updated**: 2026-06-15 12:01:46 +07
**Summary**: refactor(live-chat): mobile zero-interval — gỡ setInterval(loadPosts,90s) → SSE event-driven (throttle 30s)

## Files changed in this commit (`live-chat/`)

- `live-chat/comments-mobile.html`
- `live-chat/js/live/comments-mobile.js`

## Last 5 commits touching `live-chat/`

- `4ce660d2b` refactor(live-chat): mobile zero-interval — gỡ setInterval(loadPosts,90s) → SSE event-driven (throttle 30s) _(2026-06-15)_
- `b8c166071` feat(live-chat): WS-direct comment livestream (bỏ poll, nhanh ~TPOS) + render append-only đúng invariant _(2026-06-15)_
- `5c4244975` fix(live-chat): comment mới APPEND đúng vị trí incremental — KHÔNG full re-render (user) _(2026-06-15)_
- `5f21a33a0` refactor(live-chat): gỡ client poll-now warm-up → server-direct WS per-page (user) + note 2 trang _(2026-06-15)_
- `4304ce7d6` fix(web2-realtime): /api/pages-available discover allPages on-demand (đường Postgres fallback không set) — UI checkbox liệt kê đủ trang _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-120146-4ce660d` cho Claude walk chain theo CLAUDE.md protocol.
