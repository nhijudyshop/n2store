# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-223425-e53a1ef`
**Session file**: [`./20260619-223425-e53a1ef.md`](../20260619-223425-e53a1ef.md)
**Commit**: `e53a1ef` — auto: session update
**Last updated**: 2026-06-19 22:34:25 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/video-maker/index.html`
- `web2/video-maker/js/video-maker.js`
- `web2/video-maker/js/video-tts.js`

## Last 5 commits touching `web2/`

- `e53a1ef3f` auto: session update _(2026-06-19)_
- `1de201dd3` feat(web2/fb): đăng ảnh bytes thẳng lên FB (multipart) — bỏ phụ thuộc imgbb (đang lỗi key); handoff + upload local dùng dataUrl _(2026-06-19)_
- `60e183143` feat(web2/fb): Graph read*insights thật (reach/live views) + sửa caption + handoff Đăng lên FB từ product-card/photo-studio *(2026-06-19)\_
- `28770dbdf` fix(web2/video-maker): hết lỗi tạo giọng Gather idx=132 — serialize inference TTS _(2026-06-19)_
- `eb5b0935f` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-223425-e53a1ef` cho Claude walk chain theo CLAUDE.md protocol.
