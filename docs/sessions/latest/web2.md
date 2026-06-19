# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-144117-d15dd5f`
**Session file**: [`./20260619-144117-d15dd5f.md`](../20260619-144117-d15dd5f.md)
**Commit**: `d15dd5f` — auto: session update
**Last updated**: 2026-06-19 14:41:17 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/css/jt-tracking.css`
- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-actions.js`
- `web2/jt-tracking/js/jt-tracking-app.js`
- `web2/photo-editor/index.html`
- `web2/shared/beauty/web2-beauty-face.js`
- `web2/shared/beauty/web2-beauty-studio.js`
- `web2/video-beauty/index.html`

## Last 5 commits touching `web2/`

- `d15dd5f45` auto: session update _(2026-06-19)_
- `582dd09d1` feat(web2/jt-tracking): tự cập nhật trạng thái J&T khi mở trang + bỏ nút 'Làm mới tất cả' _(2026-06-19)_
- `1940a8e00` auto: session update _(2026-06-19)_
- `8d645fd59` feat(web2/video-beauty): trang MỚI 'Làm đẹp video' on-device — mịn da/trắng da/lọc màu realtime + chỉnh mặt render-pass (WebCodecs+mp4-muxer) _(2026-06-19)_
- `46d037b38` perf(web2/photo-editor): preload model nhận diện mặt ở nền khi tải ảnh → bấm công cụ làm đẹp mặt nhanh ~1s (thay vì ~3.5s cold) _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-144117-d15dd5f` cho Claude walk chain theo CLAUDE.md protocol.
