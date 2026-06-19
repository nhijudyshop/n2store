# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-224315-fddf008`
**Session file**: [`./20260619-224315-fddf008.md`](../20260619-224315-fddf008.md)
**Commit**: `fddf008` — docs(dev-log): FB reach deprecation pivot + shared FB client
**Last updated**: 2026-06-19 22:43:15 +07
**Summary**: FB Graph: read_insights thật (clicks/video views, reach FB đã khai tử), sửa caption, handoff Đăng lên FB, đăng ảnh bytes (bỏ imgbb), FB client → shared

## Files changed in this commit (`web2/`)

- `web2/fb-ads-stats/index.html`
- `web2/fb-insights/index.html`
- `web2/fb-posts/index.html`
- `web2/shared/web2-fb-client.js`

## Last 5 commits touching `web2/`

- `5333b61ab` refactor(web2/fb): promote FB API client → web2/shared/web2-fb-client.js (1 nguồn, mọi trang đọc vào); alias FBPostsApi; xoá fb-posts/js/fb-posts-api.js _(2026-06-19)_
- `3d3b9a038` fix(web2/fb): FB khai tử post reach/impressions → dùng metric còn sống (clicks/reactions/video*views/activity); fb-insights hiện Lượt bấm thay reach *(2026-06-19)\_
- `94dfe5df4` feat(video-maker): tích hợp VieNeu-TTS clone giọng — server máy shop + tunnel + frontend Web2Vieneu _(2026-06-19)_
- `e53a1ef3f` auto: session update _(2026-06-19)_
- `1de201dd3` feat(web2/fb): đăng ảnh bytes thẳng lên FB (multipart) — bỏ phụ thuộc imgbb (đang lỗi key); handoff + upload local dùng dataUrl _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-224315-fddf008` cho Claude walk chain theo CLAUDE.md protocol.
