# Latest Snapshot — `cloudflare-worker/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-195841-a1037d2`
**Session file**: [`./20260607-195841-a1037d2.md`](../20260607-195841-a1037d2.md)
**Commit**: `a1037d2` — refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class
**Last updated**: 2026-06-07 19:58:41 +07
**Summary**: refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class

## Files changed in this commit (`cloudflare-worker/`)

- `cloudflare-worker/modules/config/routes.js`
- `cloudflare-worker/worker.js`

## Last 5 commits touching `cloudflare-worker/`

- `293e4e45c` chore(web2): xóa web2-fb-live.js (unused — live-chat đi thẳng pages.fm) + worker route _(2026-06-07)_
- `0e530bd04` feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2*live_campaigns *(2026-06-07)\_
- `19664fdc4` fix(worker): route /api/web2-fb-live/\* → Render (không rơi vào TPOS catch-all) _(2026-06-07)_
- `baf38853a` feat(worker): route /api/web2-returns/\* → Render (proxy cho trang Thu về) _(2026-06-06)_
- `0b7da17c0` feat(cf-worker): route /api/services-overview to Render _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-195841-a1037d2` cho Claude walk chain theo CLAUDE.md protocol.
