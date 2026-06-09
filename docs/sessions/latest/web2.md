# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-192915-29adb0f`
**Session file**: [`./20260609-192915-29adb0f.md`](../20260609-192915-29adb0f.md)
**Commit**: `29adb0f` — feat(web2): biến thể giữa QR to hơn (centerMaxW/centerFontMax option)
**Last updated**: 2026-06-09 19:29:15 +07
**Summary**: feat(web2): biến thể giữa QR to hơn (centerMaxW/centerFontMax option)

## Files changed in this commit (`web2/`)

- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `29adb0f00` feat(web2): biến thể giữa QR to hơn (centerMaxW/centerFontMax option) _(2026-06-09)_
- `b15bd2c8b` auto: session update _(2026-06-09)_
- `3248aa803` auto: session update _(2026-06-09)_
- `58eb2ec6c` auto: session update _(2026-06-09)_
- `eec34ebd2` fix(web2): tem mã SP — phóng to chữ tên+giá (font ×1.55, QR thu nhẹ) _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-192915-29adb0f` cho Claude walk chain theo CLAUDE.md protocol.
