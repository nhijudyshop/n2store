# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-174749-5b33183`
**Session file**: [`./20260519-174749-5b33183.md`](../20260519-174749-5b33183.md)
**Commit**: `5b33183` — fix(web2-variants): literal routes /suggest-short-code + /backfill-short-codes phải đứng TRƯỚC /:id (Express match-first-wins). /:id giờ thêm regex (\\d+) ràng buộc numeric
**Last updated**: 2026-05-19 17:47:49 +07
**Summary**: fix(web2-variants): literal routes /suggest-short-code + /backfill-short-codes phải đứng TRƯỚC /:id (Express ...

## Files changed in this commit (`web2/`)

- `web2/products/js/web2-products-app.js`
- `web2/variants/index.html`
- `web2/variants/js/web2-variants-api.js`
- `web2/variants/js/web2-variants-app.js`

## Last 5 commits touching `web2/`

- `5b33183c` fix(web2-variants): literal routes /suggest-short-code + /backfill-short-codes phải đứng TRƯỚC /:id (Express match-first-wins). /:id giờ thêm regex (\\d+) ràng buộc numeric _(2026-05-19)_
- `e0dcbac8` feat(web2/variants): viết tắt biến thể locked tại DB + auto-suggest UI _(2026-05-19)_
- `62eac180` feat(web2/product-code): collision-aware color shortening + fix ĐẬM/ĐẦM bug _(2026-05-19)_
- `e13d6be0` feat(web2/products): đề xuất mã SP tự động từ NCC + tên SP _(2026-05-19)_
- `6a40c72b` perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-174749-5b33183` cho Claude walk chain theo CLAUDE.md protocol.
