# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-194006-ecf62e0`
**Session file**: [`./20260609-194006-ecf62e0.md`](../20260609-194006-ecf62e0.md)
**Commit**: `ecf62e0` — feat(web2): tem mã SP — phóng to toàn bộ giao diện (font ×1.75, QR to, tên 3 dòng auto-fit)
**Last updated**: 2026-06-09 19:40:06 +07
**Summary**: feat(web2): tem mã SP — phóng to toàn bộ giao diện (font ×1.75, QR to, tên 3 dòng auto-fit)

## Files changed in this commit (`web2/`)

- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `ecf62e02f` feat(web2): tem mã SP — phóng to toàn bộ giao diện (font ×1.75, QR to, tên 3 dòng auto-fit) _(2026-06-09)_
- `c7267d350` auto: session update _(2026-06-09)_
- `0c901e12b` auto: session update _(2026-06-09)_
- `4f5bfc4db` auto: session update _(2026-06-09)_
- `29adb0f00` feat(web2): biến thể giữa QR to hơn (centerMaxW/centerFontMax option) _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-194006-ecf62e0` cho Claude walk chain theo CLAUDE.md protocol.
