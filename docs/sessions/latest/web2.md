# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-194144-6f6dc5c`
**Session file**: [`./20260627-194144-6f6dc5c.md`](../20260627-194144-6f6dc5c.md)
**Commit**: `6f6dc5c` — feat(gemini-tryon): uu tien model Flash o cookie + xoay tua, fail thi fallback Nano Banana paid (+model fallback resilience)
**Last updated**: 2026-06-27 19:41:44 +07
**Summary**: feat(gemini-tryon): uu tien model Flash o cookie + xoay tua, fail thi fallback Nano Banana paid (+model fallback resi...

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-tryon.js`

## Last 5 commits touching `web2/`

- `6f6dc5c56` feat(gemini-tryon): uu tien model Flash o cookie + xoay tua, fail thi fallback Nano Banana paid (+model fallback resilience) _(2026-06-27)_
- `0e1fd29c5` feat(web2/live): mô hình GIỎ·MỚI + badge VƯỢT theo địa danh pre-order _(2026-06-27)_
- `1b3222458` auto: session update _(2026-06-27)_
- `eb787f64d` feat(gemini-tryon): admin chon nguon tao anh (account cu the / Nano Banana paid) - selector admin-only _(2026-06-27)_
- `91ced1739` feat(web2/products): P1 — SP CHA-CON (biến thể) backend (schema 070 + mã cha/con + recompute tồn cha) _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-194144-6f6dc5c` cho Claude walk chain theo CLAUDE.md protocol.
