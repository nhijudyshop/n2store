# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-223425-e53a1ef`
**Session file**: [`./20260619-223425-e53a1ef.md`](../20260619-223425-e53a1ef.md)
**Commit**: `e53a1ef` — auto: session update
**Last updated**: 2026-06-19 22:34:25 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-fb-posts.js`
- `render.com/services/web2-fb-graph-service.js`

## Last 5 commits touching `render.com/`

- `c1dc03f4d` diag(web2/fb): /insights-probe — báo metric post nào FB còn cho (chẩn đoán per-post reach null) _(2026-06-19)_
- `1de201dd3` feat(web2/fb): đăng ảnh bytes thẳng lên FB (multipart) — bỏ phụ thuộc imgbb (đang lỗi key); handoff + upload local dùng dataUrl _(2026-06-19)_
- `e3e76f658` fix(web2/fb-graph): tách post*video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video lấy reach per-post *(2026-06-19)\_
- `60e183143` feat(web2/fb): Graph read*insights thật (reach/live views) + sửa caption + handoff Đăng lên FB từ product-card/photo-studio *(2026-06-19)\_
- `c352ee31b` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-223425-e53a1ef` cho Claude walk chain theo CLAUDE.md protocol.
