# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-222154-e3e76f6`
**Session file**: [`./20260619-222154-e3e76f6.md`](../20260619-222154-e3e76f6.md)
**Commit**: `e3e76f6` — fix(web2/fb-graph): tách post_video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video lấy reach per-post
**Last updated**: 2026-06-19 22:21:54 +07
**Summary**: fix(web2/fb-graph): tách post_video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video ...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/MEDIA-KIT.md`

## Last 5 commits touching `docs/`

- `60e183143` feat(web2/fb): Graph read*insights thật (reach/live views) + sửa caption + handoff Đăng lên FB từ product-card/photo-studio *(2026-06-19)\_
- `e4b5c3d35` docs(web2): KHO ĐA DỤNG media/AI (MEDIA-KIT.md) — gom AI/Giọng/Hình/Video + con trỏ CLAUDE.md _(2026-06-19)_
- `8b6bbd033` chore(session): RESUME:20260619-215147-28770db _(2026-06-19)_
- `28770dbdf` fix(web2/video-maker): hết lỗi tạo giọng Gather idx=132 — serialize inference TTS _(2026-06-19)_
- `501fb1428` chore(session): RESUME:20260619-214739-eb5b093 _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-222154-e3e76f6` cho Claude walk chain theo CLAUDE.md protocol.
