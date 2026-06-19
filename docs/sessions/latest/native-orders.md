# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-103936-5cea5d2`
**Session file**: [`./20260619-103936-5cea5d2.md`](../20260619-103936-5cea5d2.md)
**Commit**: `5cea5d2` — chore(web2): regen codemap (349 files, +product-card +video-maker)
**Last updated**: 2026-06-19 10:39:36 +07
**Summary**: 2 trang Đa dụng Web 2.0 mới: product-card (canvas→PNG) + video-maker (slideshow MP4 + TTS tiếng Việt on-device MMS-TTS-vie)

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-interactions.js`
- `native-orders/js/native-orders-state.js`

## Last 5 commits touching `native-orders/`

- `511d8ad71` feat(native-orders): cột info chat = bình luận live-chat (mới nhất trên + giờ), ẩn cột Bình luận, fix snippet <b> _(2026-06-19)_
- `27296dea5` refactor(web2): Phase C — adopt shared utils (thin-delegate + fallback) → '1 nguồn' _(2026-06-19)_
- `4f087ac1a` refactor(native-orders): Step 2b — gỡ ~1500 dòng chat trùng (6 file) sau chat-unification _(2026-06-19)_
- `d6c0c7b71` feat(native-orders): Task 1 — chat-unification, openInteractions → Web2CustomerChat (comments → info col) _(2026-06-19)_
- `73016bf9e` refactor(native-orders): Phase 1 — tách native-orders-app.js (9457) → 23 module MOVE-only _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-103936-5cea5d2` cho Claude walk chain theo CLAUDE.md protocol.
