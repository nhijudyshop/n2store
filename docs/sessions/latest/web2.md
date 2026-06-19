# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-204231-bca58af`
**Session file**: [`./20260619-204231-bca58af.md`](../20260619-204231-bca58af.md)
**Commit**: `bca58af` — feat(web2/video-maker): port chất Remotion (spring/easing/interpolate) sang vanilla — KHÔNG Remotion
**Last updated**: 2026-06-19 20:42:31 +07
**Summary**: feat(web2/video-maker): port chất Remotion (spring/easing/interpolate) sang vanilla — KHÔNG Remotion

## Files changed in this commit (`web2/`)

- `web2/fb-posts/js/fb-posts-app.js`
- `web2/fb-posts/js/fb-posts-list.js`
- `web2/video-maker/index.html`
- `web2/video-maker/js/video-anim.js`
- `web2/video-maker/js/video-render.js`

## Last 5 commits touching `web2/`

- `bca58afa1` feat(web2/video-maker): port chất Remotion (spring/easing/interpolate) sang vanilla — KHÔNG Remotion _(2026-06-19)_
- `add3a5bcf` feat(web2/fb-posts): nhận diện loại bài (live/video/hình/bài viết) + bộ lọc; bỏ auto-chọn tất cả page (tránh đăng nhầm) _(2026-06-19)_
- `2c552d62e` fix(web2/fb-posts): tab Bài viết — sửa khoá scroll (thêm class web2-main) + cuộn tải thêm bài (infinite scroll cursor) _(2026-06-19)_
- `30071c024` feat(web2/fb-posts): xem nguyên bài như trên Facebook (popup) — đủ ảnh + nội dung + tương tác + bình luận _(2026-06-19)_
- `cf83133e0` fix(web2/fb-posts): /list bỏ field đếm tương tác (likes/comments/shares.summary) gây lỗi #10 _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-204231-bca58af` cho Claude walk chain theo CLAUDE.md protocol.
