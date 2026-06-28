# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-194726-1da7e99`
**Session file**: [`./20260628-194726-1da7e99.md`](../20260628-194726-1da7e99.md)
**Commit**: `1da7e99` — feat(web2-products): nút In lại tem đơn vị (Web2UnitReprint shared) — chọn mã đơn vị qr1..qrN rồi in
**Last updated**: 2026-06-28 19:47:26 +07
**Summary**: feat(web2-products): nút In lại tem đơn vị (Web2UnitReprint shared) — chọn mã đơn vị qr1..qrN rồi in

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`
- `web2/shared/web2-unit-reprint.js`

## Last 5 commits touching `web2/`

- `1da7e99c6` feat(web2-products): nút In lại tem đơn vị (Web2UnitReprint shared) — chọn mã đơn vị qr1..qrN rồi in _(2026-06-28)_
- `52c4e4591` feat(unit-scan): nút In lại tem 1 đơn vị (reuse Web2ProductsPrint) + fix hero khi mọi đơn đã đủ _(2026-06-28)_
- `d636b1ea7` feat(web2-product-units): mã đơn vị + QR riêng/món + trang quét định tuyến kệ STT _(2026-06-28)_
- `4cf5b88bd` feat(so-order): Cài đặt tab — chế độ thanh toán (đợt _( theo từng NCC)|2026-06-28)_
- `4d33cabfb` feat(supplier-pay): modal Thanh toán NCC dùng CHUNG (Web2SupplierPay) — NCC tab-strip+search+A→Z _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-194726-1da7e99` cho Claude walk chain theo CLAUDE.md protocol.
