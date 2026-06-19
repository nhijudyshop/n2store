# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-154502-48ea427`
**Session file**: [`./20260619-154502-48ea427.md`](../20260619-154502-48ea427.md)
**Commit**: `48ea427` — auto: session update
**Last updated**: 2026-06-19 15:45:02 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/fb-posts/js/fb-posts-api.js`
- `web2/fb-posts/js/fb-posts-app.js`
- `web2/video-maker/index.html`
- `web2/video-maker/js/video-maker.js`
- `web2/video-maker/video-maker.css`

## Last 5 commits touching `web2/`

- `48ea42753` auto: session update _(2026-06-19)_
- `77bcfbcb1` feat(web2/fb-posts): Đăng nhập bằng Facebook (OAuth) — liên kết 1 lần dính web luôn, không cần dán token _(2026-06-19)_
- `3d3b873cf` feat(web2/fb-posts): trang Đăng bài Facebook — quản lý + soạn/đăng/lên lịch 2 page qua Graph API + AI caption free (Groq) _(2026-06-19)_
- `5002a0888` perf(web2/beauty): warp chỉ xử lý VÙNG BAO brush (mặt) thay vì toàn ảnh → hết kẹt main-thread khi làm đẹp mặt trên ảnh lớn _(2026-06-19)_
- `d15dd5f45` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-154502-48ea427` cho Claude walk chain theo CLAUDE.md protocol.
