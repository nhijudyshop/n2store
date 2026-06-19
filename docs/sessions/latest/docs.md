# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-103936-5cea5d2`
**Session file**: [`./20260619-103936-5cea5d2.md`](../20260619-103936-5cea5d2.md)
**Commit**: `5cea5d2` — chore(web2): regen codemap (349 files, +product-card +video-maker)
**Last updated**: 2026-06-19 10:39:36 +07
**Summary**: 2 trang Đa dụng Web 2.0 mới: product-card (canvas→PNG) + video-maker (slideshow MP4 + TTS tiếng Việt on-device MMS-TTS-vie)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/WEB2-CODEMAP.md`
- `docs/web2/web2-codemap.json`

## Last 5 commits touching `docs/`

- `5cea5d24b` chore(web2): regen codemap (349 files, +product-card +video-maker) _(2026-06-19)_
- `fe4c1ea78` feat(web2/video-maker): trang Tạo video SP in-browser + giọng đọc tiếng Việt on-device _(2026-06-19)_
- `4b5db242b` feat(web2/product-card): trang Tạo card SP in-browser (Đa dụng Web 2.0) _(2026-06-19)_
- `511d8ad71` feat(native-orders): cột info chat = bình luận live-chat (mới nhất trên + giờ), ẩn cột Bình luận, fix snippet <b> _(2026-06-19)_
- `125a9deda` chore(session): RESUME:20260619-093901-e043512 _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-103936-5cea5d2` cho Claude walk chain theo CLAUDE.md protocol.
