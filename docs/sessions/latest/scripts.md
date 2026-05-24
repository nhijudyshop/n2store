# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-092404-1f41790`
**Session file**: [`./20260524-092404-1f41790.md`](../20260524-092404-1f41790.md)
**Commit**: `1f41790` — chore(tpos): cache-bust tpos-api.js v20260524a — load fallback Pancake Graph
**Last updated**: 2026-05-24 09:24:04 +07
**Summary**: chore(tpos): cache-bust tpos-api.js v20260524a — load fallback Pancake Graph

## Files changed in this commit (`scripts/`)

- `scripts/bench-2-posts.js`
- `scripts/bench-app-slow-load.js`
- `scripts/bench-bearer-approach.js`
- `scripts/bench-live-filter.js`
- `scripts/bench-load-comments.js`
- `scripts/bench-pancake-graph.js`
- `scripts/inspect-tpos-post.js`
- `scripts/tpos-debug-session.js`

## Last 5 commits touching `scripts/`

- `c6c247bfa` fix(tpos-comments): fail-fast 2.5s + live*filter param + Pancake Graph fallback *(2026-05-24)\_
- `7f510eb91` fix(snap): cleanup frontend refresh-thumbnail call + E2E updates _(2026-05-23)_
- `e0320e0f8` feat(snap): BỎ HẾT chức năng lấy thumbnail URL — chỉ chụp FRAME thật _(2026-05-23)_
- `2e1165404` feat(snap): Phase 3 (smart fill + SSE + DRM badge) + GMT+7 force _(2026-05-23)_
- `53022460c` feat(snap): Phase 1 — 1-click 🎬 Bắt đầu chụp live (tự mở FB + share) _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-092404-1f41790` cho Claude walk chain theo CLAUDE.md protocol.
