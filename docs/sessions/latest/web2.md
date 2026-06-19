# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-103936-5cea5d2`
**Session file**: [`./20260619-103936-5cea5d2.md`](../20260619-103936-5cea5d2.md)
**Commit**: `5cea5d2` — chore(web2): regen codemap (349 files, +product-card +video-maker)
**Last updated**: 2026-06-19 10:39:36 +07
**Summary**: 2 trang Đa dụng Web 2.0 mới: product-card (canvas→PNG) + video-maker (slideshow MP4 + TTS tiếng Việt on-device MMS-TTS-vie)

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/product-card/index.html`
- `web2/product-card/js/product-card-render.js`
- `web2/product-card/js/product-card.js`
- `web2/product-card/product-card.css`
- `web2/shared/web2-customer-chat-core.js`
- `web2/shared/web2-sidebar.js`
- `web2/video-maker/index.html`
- `web2/video-maker/js/video-maker.js`
- `web2/video-maker/js/video-render.js`
- `web2/video-maker/js/video-tts.js`
- `web2/video-maker/video-maker.css`

## Last 5 commits touching `web2/`

- `fe4c1ea78` feat(web2/video-maker): trang Tạo video SP in-browser + giọng đọc tiếng Việt on-device _(2026-06-19)_
- `4b5db242b` feat(web2/product-card): trang Tạo card SP in-browser (Đa dụng Web 2.0) _(2026-06-19)_
- `511d8ad71` feat(native-orders): cột info chat = bình luận live-chat (mới nhất trên + giờ), ẩn cột Bình luận, fix snippet <b> _(2026-06-19)_
- `b062f9dca` auto: session update _(2026-06-19)_
- `7d9fc8ec7` refactor(web2): adoption sâu hơn — JWT/SoOrderUtils/PancakeImport delegate (4) + load feature modules _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-103936-5cea5d2` cho Claude walk chain theo CLAUDE.md protocol.
