# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-150753-3d3b873`
**Session file**: [`./20260619-150753-3d3b873.md`](../20260619-150753-3d3b873.md)
**Commit**: `3d3b873` — feat(web2/fb-posts): trang Đăng bài Facebook — quản lý + soạn/đăng/lên lịch 2 page qua Graph API + AI caption free (Groq)
**Last updated**: 2026-06-19 15:07:53 +07
**Summary**: feat(web2/fb-posts): trang Đăng bài Facebook 2 page qua Graph API + AI caption free (Groq); Pancake chỉ đọc bài

## Files changed in this commit (`web2/`)

- `web2/fb-posts/fb-posts.css`
- `web2/fb-posts/index.html`
- `web2/fb-posts/js/fb-posts-api.js`
- `web2/fb-posts/js/fb-posts-app.js`
- `web2/fb-posts/js/fb-posts-composer.js`
- `web2/fb-posts/js/fb-posts-drafts.js`
- `web2/fb-posts/js/fb-posts-list.js`
- `web2/fb-posts/js/fb-posts-media.js`
- `web2/photo-editor/index.html`
- `web2/shared/beauty/web2-beauty-filters.js`
- `web2/shared/web2-sidebar.js`
- `web2/video-beauty/index.html`

## Last 5 commits touching `web2/`

- `3d3b873cf` feat(web2/fb-posts): trang Đăng bài Facebook — quản lý + soạn/đăng/lên lịch 2 page qua Graph API + AI caption free (Groq) _(2026-06-19)_
- `5002a0888` perf(web2/beauty): warp chỉ xử lý VÙNG BAO brush (mặt) thay vì toàn ảnh → hết kẹt main-thread khi làm đẹp mặt trên ảnh lớn _(2026-06-19)_
- `d15dd5f45` auto: session update _(2026-06-19)_
- `582dd09d1` feat(web2/jt-tracking): tự cập nhật trạng thái J&T khi mở trang + bỏ nút 'Làm mới tất cả' _(2026-06-19)_
- `1940a8e00` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-150753-3d3b873` cho Claude walk chain theo CLAUDE.md protocol.
