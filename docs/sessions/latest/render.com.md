# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-222154-e3e76f6`
**Session file**: [`./20260619-222154-e3e76f6.md`](../20260619-222154-e3e76f6.md)
**Commit**: `e3e76f6` — fix(web2/fb-graph): tách post_video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video lấy reach per-post
**Last updated**: 2026-06-19 22:21:54 +07
**Summary**: fix(web2/fb-graph): tách post_video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video ...

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-fb-posts.js`
- `render.com/services/web2-fb-graph-service.js`

## Last 5 commits touching `render.com/`

- `e3e76f658` fix(web2/fb-graph): tách post*video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video lấy reach per-post *(2026-06-19)\_
- `60e183143` feat(web2/fb): Graph read*insights thật (reach/live views) + sửa caption + handoff Đăng lên FB từ product-card/photo-studio *(2026-06-19)\_
- `c352ee31b` auto: session update _(2026-06-19)_
- `37c9717cf` feat(web2/fb-ads-stats): lấy ad account qua Business Manager (owned/client) — không cần đăng nhập đúng người chạy QC _(2026-06-19)_
- `c799ddd14` feat(web2): group Facebook riêng + 2 trang Thống kê tương tác & Thống kê quảng cáo _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-222154-e3e76f6` cho Claude walk chain theo CLAUDE.md protocol.
