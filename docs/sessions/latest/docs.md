# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-223940-3d3b9a0`
**Session file**: [`./20260619-223940-3d3b9a0.md`](../20260619-223940-3d3b9a0.md)
**Commit**: `3d3b9a0` — fix(web2/fb): FB khai tử post reach/impressions → dùng metric còn sống (clicks/reactions/video_views/activity); fb-insights hiện Lượt bấm thay reach
**Last updated**: 2026-06-19 22:39:40 +07
**Summary**: fix(web2/fb): FB khai tử post reach/impressions → dùng metric còn sống (clicks/reactions/video_views/activity...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `94dfe5df4` feat(video-maker): tích hợp VieNeu-TTS clone giọng — server máy shop + tunnel + frontend Web2Vieneu _(2026-06-19)_
- `293341a12` chore(session): RESUME:20260619-223425-e53a1ef _(2026-06-19)_
- `196d3f5d1` chore(session): RESUME:20260619-222623-1de201d _(2026-06-19)_
- `e5441d024` chore(session): RESUME:20260619-222154-e3e76f6 _(2026-06-19)_
- `60e183143` feat(web2/fb): Graph read*insights thật (reach/live views) + sửa caption + handoff Đăng lên FB từ product-card/photo-studio *(2026-06-19)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-223940-3d3b9a0` cho Claude walk chain theo CLAUDE.md protocol.
