# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-101635-11c39b5`
**Session file**: [`./20260607-101635-11c39b5.md`](../20260607-101635-11c39b5.md)
**Commit**: `11c39b5` — docs(dev-log): tem QR tự thu nhỏ font mã dài
**Last updated**: 2026-06-07 10:16:35 +07
**Summary**: docs(dev-log): tem QR tự thu nhỏ font mã dài

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `7b32b8df5` feat(web2-products-print): tem QR — tự thu nhỏ font mã cho mã dài hiện đủ _(2026-06-07)_
- `a059d2b82` feat(web2-products-print): tem QR layout QR-trái + tên/mã/giá-phải (mọi con tem) _(2026-06-06)_
- `b1a27c5bc` feat(web2-products-print): thêm in tem QR Code (2D) — quét mọi mã dài trên tem 25mm _(2026-06-06)_
- `b34e4b7e4` auto: session update _(2026-06-06)_
- `8ba952d52` auto: session update _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-101635-11c39b5` cho Claude walk chain theo CLAUDE.md protocol.
