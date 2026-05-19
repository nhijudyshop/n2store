# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-173258-62eac18`
**Session file**: [`./20260519-173258-62eac18.md`](../20260519-173258-62eac18.md)
**Commit**: `62eac18` — feat(web2/product-code): collision-aware color shortening + fix ĐẬM/ĐẦM bug
**Last updated**: 2026-05-19 17:32:58 +07
**Summary**: feat(web2/product-code): collision-aware color shortening + fix ĐẬM/ĐẦM bug

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`
- `web2/shared/web2-product-code.js`

## Last 5 commits touching `web2/`

- `62eac180` feat(web2/product-code): collision-aware color shortening + fix ĐẬM/ĐẦM bug _(2026-05-19)_
- `e13d6be0` feat(web2/products): đề xuất mã SP tự động từ NCC + tên SP _(2026-05-19)_
- `6a40c72b` perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant _(2026-05-19)_
- `36b72c33` feat(bill): NJD Live → NHI JUDY, gộp SĐT vào dòng Khách, bỏ hint barcode _(2026-05-19)_
- `665ec94f` fix(bill): barcode dùng JsBarcode SVG inline (bỏ dependency TPOS service) _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-173258-62eac18` cho Claude walk chain theo CLAUDE.md protocol.
