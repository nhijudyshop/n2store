# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-222154-e3e76f6`
**Session file**: [`./20260619-222154-e3e76f6.md`](../20260619-222154-e3e76f6.md)
**Commit**: `e3e76f6` — fix(web2/fb-graph): tách post_video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video lấy reach per-post
**Last updated**: 2026-06-19 22:21:54 +07
**Summary**: fix(web2/fb-graph): tách post_video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video ...

## Files changed in this commit (`web2/`)

- `web2/fb-ads-stats/index.html`
- `web2/fb-ads-stats/js/fb-ads-stats.js`
- `web2/fb-insights/index.html`
- `web2/fb-insights/js/fb-insights.js`
- `web2/fb-posts/index.html`
- `web2/fb-posts/js/fb-posts-api.js`
- `web2/fb-posts/js/fb-posts-app.js`
- `web2/fb-posts/js/fb-posts-composer.js`
- `web2/fb-posts/js/fb-posts-list.js`
- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio-edit.js`
- `web2/photo-studio/photo-studio-ui.js`
- `web2/product-card/index.html`
- `web2/product-card/js/product-card.js`
- `web2/shared/web2-fb-share.js`

## Last 5 commits touching `web2/`

- `60e183143` feat(web2/fb): Graph read*insights thật (reach/live views) + sửa caption + handoff Đăng lên FB từ product-card/photo-studio *(2026-06-19)\_
- `28770dbdf` fix(web2/video-maker): hết lỗi tạo giọng Gather idx=132 — serialize inference TTS _(2026-06-19)_
- `eb5b0935f` auto: session update _(2026-06-19)_
- `f1e733d18` feat(web2/fb-ads-stats): Nhập tay sổ quảng cáo (gắn bài + tiền QC + số đơn) → tổng hợp ngày/tuần/tháng + ad account qua BM _(2026-06-19)_
- `c352ee31b` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-222154-e3e76f6` cho Claude walk chain theo CLAUDE.md protocol.
