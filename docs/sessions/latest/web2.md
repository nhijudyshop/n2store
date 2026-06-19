# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-111456-53623e2`
**Session file**: [`./20260619-111456-53623e2.md`](../20260619-111456-53623e2.md)
**Commit**: `53623e2` — chore(web2): regen codemap (video-maker multi-voice)
**Last updated**: 2026-06-19 11:14:56 +07
**Summary**: chore(web2): regen codemap (video-maker multi-voice)

## Files changed in this commit (`web2/`)

- `web2/video-maker/index.html`
- `web2/video-maker/js/video-maker.js`
- `web2/video-maker/js/video-tts.js`
- `web2/video-maker/video-maker.css`

## Last 5 commits touching `web2/`

- `261dd1b31` feat(web2/video-maker): nhiều giọng (MMS+Piper) + giọng mẫu + nút Tạo ngẫu nhiên _(2026-06-19)_
- `fe4c1ea78` feat(web2/video-maker): trang Tạo video SP in-browser + giọng đọc tiếng Việt on-device _(2026-06-19)_
- `4b5db242b` feat(web2/product-card): trang Tạo card SP in-browser (Đa dụng Web 2.0) _(2026-06-19)_
- `511d8ad71` feat(native-orders): cột info chat = bình luận live-chat (mới nhất trên + giờ), ẩn cột Bình luận, fix snippet <b> _(2026-06-19)_
- `b062f9dca` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-111456-53623e2` cho Claude walk chain theo CLAUDE.md protocol.
