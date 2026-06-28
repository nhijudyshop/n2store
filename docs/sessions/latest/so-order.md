# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-192722-d636b1e`
**Session file**: [`./20260628-192722-d636b1e.md`](../20260628-192722-d636b1e.md)
**Commit**: `d636b1e` — feat(web2-product-units): mã đơn vị + QR riêng/món + trang quét định tuyến kệ STT
**Last updated**: 2026-06-28 19:27:22 +07
**Summary**: feat(web2-product-units): mã đơn vị + QR riêng/món + trang quét định tuyến kệ STT

## Files changed in this commit (`so-order/`)

- `so-order/js/so-order-barcode.js`

## Last 5 commits touching `so-order/`

- `d636b1ea7` feat(web2-product-units): mã đơn vị + QR riêng/món + trang quét định tuyến kệ STT _(2026-06-28)_
- `ef65bab4b` auto: session update _(2026-06-28)_
- `d2a4f9072` feat(so-order): Quản lý ảnh NCC theo đợt (BYTEA web2Db) + create-order integration + admin-only _(2026-06-28)_
- `6dfedec30` auto: session update _(2026-06-28)_
- `4cf5b88bd` feat(so-order): Cài đặt tab — chế độ thanh toán (đợt _( theo từng NCC)|2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-192722-d636b1e` cho Claude walk chain theo CLAUDE.md protocol.
