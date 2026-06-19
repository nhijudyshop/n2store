# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-222623-1de201d`
**Session file**: [`./20260619-222623-1de201d.md`](../20260619-222623-1de201d.md)
**Commit**: `1de201d` — feat(web2/fb): đăng ảnh bytes thẳng lên FB (multipart) — bỏ phụ thuộc imgbb (đang lỗi key); handoff + upload local dùng dataUrl
**Last updated**: 2026-06-19 22:26:23 +07
**Summary**: feat(web2/fb): đăng ảnh bytes thẳng lên FB (multipart) — bỏ phụ thuộc imgbb (đang lỗi key); handoff...

## Files changed in this commit (`render.com/`)

- `render.com/services/web2-fb-graph-service.js`

## Last 5 commits touching `render.com/`

- `1de201dd3` feat(web2/fb): đăng ảnh bytes thẳng lên FB (multipart) — bỏ phụ thuộc imgbb (đang lỗi key); handoff + upload local dùng dataUrl _(2026-06-19)_
- `e3e76f658` fix(web2/fb-graph): tách post*video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video lấy reach per-post *(2026-06-19)\_
- `60e183143` feat(web2/fb): Graph read*insights thật (reach/live views) + sửa caption + handoff Đăng lên FB từ product-card/photo-studio *(2026-06-19)\_
- `c352ee31b` auto: session update _(2026-06-19)_
- `37c9717cf` feat(web2/fb-ads-stats): lấy ad account qua Business Manager (owned/client) — không cần đăng nhập đúng người chạy QC _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-222623-1de201d` cho Claude walk chain theo CLAUDE.md protocol.
