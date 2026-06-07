# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-195841-a1037d2`
**Session file**: [`./20260607-195841-a1037d2.md`](../20260607-195841-a1037d2.md)
**Commit**: `a1037d2` — refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class
**Last updated**: 2026-06-07 19:58:41 +07
**Summary**: refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-fb-live.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `293e4e45c` chore(web2): xóa web2-fb-live.js (unused — live-chat đi thẳng pages.fm) + worker route _(2026-06-07)_
- `0e530bd04` feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2*live_campaigns *(2026-06-07)\_
- `88c9a2660` feat(tpos-pancake): rewire cột comment live TPOS→FB Graph (flag-gated, fallback-safe) _(2026-06-07)_
- `cba3731ab` feat(web2): warehouse POST /batch-by-fbid — enricher đọc web2*customers theo fb_id hàng loạt *(2026-06-07)\_
- `433131997` feat(web2): Phase C-backend — web2-fb-live.js (FB Live thay TPOS, additive) _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-195841-a1037d2` cho Claude walk chain theo CLAUDE.md protocol.
