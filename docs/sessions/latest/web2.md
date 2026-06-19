# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-225213-d70b709`
**Session file**: [`./20260619-225213-d70b709.md`](../20260619-225213-d70b709.md)
**Commit**: `d70b709` — feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry)
**Last updated**: 2026-06-19 22:52:13 +07
**Summary**: feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry)

## Files changed in this commit (`web2/`)

- `web2/video-maker/index.html`
- `web2/video-maker/js/video-vieneu.js`
- `web2/video-maker/video-maker.css`

## Last 5 commits touching `web2/`

- `d70b709d6` feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry) _(2026-06-19)_
- `046821aa0` auto: session update _(2026-06-19)_
- `5333b61ab` refactor(web2/fb): promote FB API client → web2/shared/web2-fb-client.js (1 nguồn, mọi trang đọc vào); alias FBPostsApi; xoá fb-posts/js/fb-posts-api.js _(2026-06-19)_
- `3d3b9a038` fix(web2/fb): FB khai tử post reach/impressions → dùng metric còn sống (clicks/reactions/video*views/activity); fb-insights hiện Lượt bấm thay reach *(2026-06-19)\_
- `94dfe5df4` feat(video-maker): tích hợp VieNeu-TTS clone giọng — server máy shop + tunnel + frontend Web2Vieneu _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-225213-d70b709` cho Claude walk chain theo CLAUDE.md protocol.
