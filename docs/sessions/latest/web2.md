# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-223940-3d3b9a0`
**Session file**: [`./20260619-223940-3d3b9a0.md`](../20260619-223940-3d3b9a0.md)
**Commit**: `3d3b9a0` — fix(web2/fb): FB khai tử post reach/impressions → dùng metric còn sống (clicks/reactions/video_views/activity); fb-insights hiện Lượt bấm thay reach
**Last updated**: 2026-06-19 22:39:40 +07
**Summary**: fix(web2/fb): FB khai tử post reach/impressions → dùng metric còn sống (clicks/reactions/video_views/activity...

## Files changed in this commit (`web2/`)

- `web2/fb-insights/index.html`
- `web2/fb-insights/js/fb-insights.js`
- `web2/shared/web2-vieneu.js`
- `web2/video-maker/js/video-vieneu.js`

## Last 5 commits touching `web2/`

- `3d3b9a038` fix(web2/fb): FB khai tử post reach/impressions → dùng metric còn sống (clicks/reactions/video*views/activity); fb-insights hiện Lượt bấm thay reach *(2026-06-19)\_
- `94dfe5df4` feat(video-maker): tích hợp VieNeu-TTS clone giọng — server máy shop + tunnel + frontend Web2Vieneu _(2026-06-19)_
- `e53a1ef3f` auto: session update _(2026-06-19)_
- `1de201dd3` feat(web2/fb): đăng ảnh bytes thẳng lên FB (multipart) — bỏ phụ thuộc imgbb (đang lỗi key); handoff + upload local dùng dataUrl _(2026-06-19)_
- `60e183143` feat(web2/fb): Graph read*insights thật (reach/live views) + sửa caption + handoff Đăng lên FB từ product-card/photo-studio *(2026-06-19)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-223940-3d3b9a0` cho Claude walk chain theo CLAUDE.md protocol.
