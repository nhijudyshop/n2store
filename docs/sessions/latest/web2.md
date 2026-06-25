# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-223225-4d45610`
**Session file**: [`./20260625-223225-4d45610.md`](../20260625-223225-4d45610.md)
**Commit**: `4d45610` — feat(web2/products): tem SP "2 tem" bố cục price-tag hoàn hảo
**Last updated**: 2026-06-25 22:32:25 +07
**Summary**: Tem SP 2 tem bố cục price-tag hoàn hảo (giá hero + tên 2 dòng + biến thể gọn), decode 6/6 @88px

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print-render.js`

## Last 5 commits touching `web2/`

- `4d4561048` feat(web2/products): tem SP "2 tem" bố cục price-tag hoàn hảo _(2026-06-25)_
- `881c19b4a` fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR _(2026-06-25)_
- `4e3d28151` auto: session update _(2026-06-25)_
- `8d1162f25` feat(web2/video-beauty): skeleton-frame loading during video decode _(2026-06-25)_
- `83513cd80` feat(web2/print): QR đẹp + bố cục tem SP "2 tem" P1 (tên/biến thể/giá) + QR hoá đơn A4 _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-223225-4d45610` cho Claude walk chain theo CLAUDE.md protocol.
