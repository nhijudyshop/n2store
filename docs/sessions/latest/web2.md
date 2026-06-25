# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-230809-daf1441`
**Session file**: [`./20260625-230809-daf1441.md`](../20260625-230809-daf1441.md)
**Commit**: `daf1441` — fix(web2/products): mã SP full-width không cắt — chạy dài qua phải
**Last updated**: 2026-06-25 23:08:09 +07
**Summary**: Mã SP tem full-width không cắt, chạy dài qua phải (p7); verify trang thật

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print-render.js`

## Last 5 commits touching `web2/`

- `daf144191` fix(web2/products): mã SP full-width không cắt — chạy dài qua phải _(2026-06-25)_
- `6ac77b217` feat(web2/products): tem SP đổi chỗ tên↔giá (tên băng full-width, giá+biến thể cạnh QR) _(2026-06-25)_
- `578de963e` fix(web2/products): tem SP biến thể hiện đủ (bỏ ellipsis cắt size) _(2026-06-25)_
- `4d4561048` feat(web2/products): tem SP "2 tem" bố cục price-tag hoàn hảo _(2026-06-25)_
- `881c19b4a` fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-230809-daf1441` cho Claude walk chain theo CLAUDE.md protocol.
