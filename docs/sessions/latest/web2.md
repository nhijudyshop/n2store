# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-111109-9402176`
**Session file**: [`./20260605-111109-9402176.md`](../20260605-111109-9402176.md)
**Commit**: `9402176` — docs(dev-log): tem ma SP in gan day con tem
**Last updated**: 2026-06-05 11:11:09 +07
**Summary**: docs(dev-log): tem ma SP in gan day con tem

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `b5e1da11f` feat(web2 products): tem ma SP in gan day con tem - font x1.3, barcode cao 55% + rong gan full (quiet-zone 6%), content space-between dan deu 25x21mm _(2026-06-05)_
- `b6c9360b3` auto: session update _(2026-06-05)_
- `d3154f354` feat(web2 pancake-settings): quản lý nhiều tài khoản Pancake (list/add/delete/switch) lưu DB _(2026-06-05)_
- `17f8f4cf0` feat(web2 bill): SP hang 1 = ten day du, hang 2 = SL/DON GIA/T.TIEN canh cot duoi header _(2026-06-05)_
- `e4da68737` feat(web2-pending): hien luon list KH tu hoi thoai FB inline trong card (lazy) _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-111109-9402176` cho Claude walk chain theo CLAUDE.md protocol.
