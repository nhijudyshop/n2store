# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-192640-1b32224`
**Session file**: [`./20260627-192640-1b32224.md`](../20260627-192640-1b32224.md)
**Commit**: `1b32224` — auto: session update
**Last updated**: 2026-06-27 19:26:40 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-live-tv-display.js`
- `web2/shared/web2-product-code.js`
- `web2/shared/web2-products-api.js`
- `web2/shared/web2-tryon.js`
- `web2/shared/web2-variant-picker.js`

## Last 5 commits touching `web2/`

- `1b3222458` auto: session update _(2026-06-27)_
- `eb787f64d` feat(gemini-tryon): admin chon nguon tao anh (account cu the / Nano Banana paid) - selector admin-only _(2026-06-27)_
- `91ced1739` feat(web2/products): P1 — SP CHA-CON (biến thể) backend (schema 070 + mã cha/con + recompute tồn cha) _(2026-06-27)_
- `c9f316dfc` auto: session update _(2026-06-27)_
- `0674ec5b6` fix(web2/live-control): công thức CÒN — ready-stock NCC−GIỎ−KH MỚI; pre-order NCC−KH (vượt khi KH>NCC) _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-192640-1b32224` cho Claude walk chain theo CLAUDE.md protocol.
