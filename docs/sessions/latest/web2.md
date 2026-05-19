# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-184958-e3d3df0`
**Session file**: [`./20260519-184958-e3d3df0.md`](../20260519-184958-e3d3df0.md)
**Commit**: `e3d3df0` — auto: session update
**Last updated**: 2026-05-19 18:49:58 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customer-wallet/index.html`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/index.html`
- `web2/pancake-settings/index.html`
- `web2/product-category/index.html`
- `web2/product-uom-categ/index.html`
- `web2/product-uom/index.html`
- `web2/products/index.html`
- `web2/report-revenue/index.html`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`

## Last 5 commits touching `web2/`

- `7b2eadd2` fix(web2/sidebar): preload web2-auth.js ở 19 trang load tpos-sidebar trực tiếp _(2026-05-19)_
- `8ff85337` fix(web2/sidebar): preload web2-auth.js trong page-shell → footer user/đăng xuất luôn hiện _(2026-05-19)_
- `5cc1fcd6` Revert "feat(web2/sidebar): forceExpand option — tpos-pancake luôn show sidebar đầy đủ" _(2026-05-19)_
- `32772f6f` feat(web2/sidebar): forceExpand option — tpos-pancake luôn show sidebar đầy đủ _(2026-05-19)_
- `5b33183c` fix(web2-variants): literal routes /suggest-short-code + /backfill-short-codes phải đứng TRƯỚC /:id (Express match-first-wins). /:id giờ thêm regex (\\d+) ràng buộc numeric _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-184958-e3d3df0` cho Claude walk chain theo CLAUDE.md protocol.
