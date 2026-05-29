# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-121353-1bcb2ec`
**Session file**: [`./20260529-121353-1bcb2ec.md`](../20260529-121353-1bcb2ec.md)
**Commit**: `1bcb2ec` — auto: session update
**Last updated**: 2026-05-29 12:13:53 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/account-chi/index.html`
- `web2/account-deposit/index.html`
- `web2/account-inventory/index.html`
- `web2/account-journal/index.html`
- `web2/account-list/index.html`
- `web2/account-payment-change/index.html`
- `web2/account-payment-chi/index.html`
- `web2/account-payment-list/index.html`
- `web2/account-payment-thu/index.html`
- `web2/account-thu/index.html`
- `web2/application-user/index.html`
- `web2/barcode-product-label/index.html`
- `web2/callcenter-config/index.html`
- `web2/category-distributor/index.html`
- `web2/company/index.html`
- `web2/configs-advanced/index.html`
- `web2/configs-general/index.html`
- `web2/configs-printer/index.html`
- `web2/configs-roles/index.html`
- `web2/configs-twofa/index.html`
- `web2/coupon-program/index.html`
- `web2/customer-wallet/js/customer-wallet-storage.js`
- `web2/delivery-carrier/index.html`
- `web2/export-file/index.html`
- `web2/history-cross-check-product/index.html`
- `web2/history-ds/index.html`
- `web2/inventory-valuation/index.html`
- `web2/ir-mailserver/index.html`
- `web2/loyalty-program/index.html`
- `web2/mail-template/index.html`
- `web2/offer-program/index.html`
- `web2/partner-category-revenue-config/index.html`
- `web2/partner-category/index.html`
- `web2/partner-supplier/index.html`
- `web2/pos-config/index.html`
- `web2/pos-order/index.html`
- `web2/pos-session/index.html`
- `web2/product-attribute-value/index.html`
- `web2/product-attribute/index.html`
- `web2/product-label-paper/index.html`
- `web2/promotion-program/index.html`
- `web2/report-audit-fastsale/index.html`
- `web2/report-business-results/index.html`
- `web2/report-cash-journal/index.html`
- `web2/report-customer-debt/index.html`
- `web2/report-exported/index.html`
- `web2/report-imported/index.html`
- `web2/report-not-invoice/index.html`
- `web2/report-order/index.html`
- `web2/report-partner-create/index.html`
- `web2/report-product-invoice/index.html`
- `web2/report-purchase/index.html`
- `web2/report-rate-saleonline/index.html`
- `web2/report-refund/index.html`
- `web2/report-supplier-debt/index.html`
- `web2/res-currency/index.html`
- `web2/revenue-began-customer/index.html`
- `web2/revenue-began-supplier/index.html`
- `web2/sale-online-facebook/index.html`
- `web2/sale-order/index.html`
- `web2/sale-quotation/index.html`
- `web2/sales-channel/index.html`
- `web2/shared/page-shell.js`
- `web2/shared/web2-products-cache.js`
- `web2/shared/web2-variants-cache.js`
- `web2/stock-fifo-vacuum/index.html`
- `web2/stock-inventory/index.html`
- `web2/stock-location/index.html`
- `web2/stock-move/index.html`
- `web2/stock-picking-type/index.html`
- `web2/stock-warehouse-product/index.html`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`
- `web2/tag/index.html`
- `web2/wi-invoice-config/index.html`
- `web2/wi-invoice-history/index.html`
- `web2/wi-invoice/index.html`
- `web2/xuat-nhap-ton/index.html`

## Last 5 commits touching `web2/`

- `32bbd71f4` refactor(web2): P2 audit fix — remove 4 Firestore onSnapshot listeners _(2026-05-29)_
- `13807da2d` chore(web2): P1 audit fix — bump 72 trang stale cache page-shell.js v=20260519j → v=20260529a _(2026-05-29)_
- `4662e6833` feat(web2/live-campaign): modal tạo/sửa campaign giống TPOS — page picker + live video cascade + Config dropdown _(2026-05-28)_
- `6add770ae` feat(web2/balance-history): bo nut Reprocess thu cong tung dong — 100% auto _(2026-05-26)_
- `09a46fcad` feat(web2/balance-history): 100% tu dong — bo khai niem 'Cu' / 'manual', auto-reprocess on page load _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-121353-1bcb2ec` cho Claude walk chain theo CLAUDE.md protocol.
