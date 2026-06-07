# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-100839-a059d2b`
**Session file**: [`./20260607-100839-a059d2b.md`](../20260607-100839-a059d2b.md)
**Commit**: `a059d2b` — feat(web2-products-print): tem QR layout QR-trái + tên/mã/giá-phải (mọi con tem)
**Last updated**: 2026-06-07 10:08:39 +07
**Summary**: feat(web2-products-print): tem QR layout QR-trái + tên/mã/giá-phải (mọi con tem)

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `a059d2b82` feat(web2-products-print): tem QR layout QR-trái + tên/mã/giá-phải (mọi con tem) _(2026-06-06)_
- `b1a27c5bc` feat(web2-products-print): thêm in tem QR Code (2D) — quét mọi mã dài trên tem 25mm _(2026-06-06)_
- `b34e4b7e4` auto: session update _(2026-06-06)_
- `8ba952d52` auto: session update _(2026-06-06)_
- `abc42cd47` auto: session update _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-100839-a059d2b` cho Claude walk chain theo CLAUDE.md protocol.
