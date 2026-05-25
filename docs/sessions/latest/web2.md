# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-111846-49631b0`
**Session file**: [`./20260525-111846-49631b0.md`](../20260525-111846-49631b0.md)
**Commit**: `49631b0` — feat(product-warehouse): edit modal 6 tab TPOS + fix expand + fix ảnh template
**Last updated**: 2026-05-25 11:18:46 +07
**Summary**: feat(product-warehouse): edit modal 6 tab TPOS + fix expand + fix ảnh template

## Files changed in this commit (`web2/`)

- `web2/partner-customer/css/partner-customer.css`
- `web2/partner-customer/js/partner-customer-api.js`
- `web2/partner-customer/js/partner-customer-app.js`

## Last 5 commits touching `web2/`

- `49631b051` feat(product-warehouse): edit modal 6 tab TPOS + fix expand + fix ảnh template _(2026-05-25)_
- `b915d1cb8` fix(web2/products): bỏ TPOS barcode endpoint — JsBarcode CDN, zero tpos.vn _(2026-05-25)_
- `609d7c707` auto: session update _(2026-05-25)_
- `19924a384` feat(web2/products): in tem 100% giống TPOS — port BarcodeLabelDialog _(2026-05-25)_
- `60236a1da` feat(web2): Excel "Tải về" build client-side từ native-orders thay vì TPOS _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-111846-49631b0` cho Claude walk chain theo CLAUDE.md protocol.
