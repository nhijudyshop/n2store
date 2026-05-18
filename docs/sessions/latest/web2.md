# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-110451-cc2c8ff`
**Session file**: [`./20260518-110451-cc2c8ff.md`](../20260518-110451-cc2c8ff.md)
**Commit**: `cc2c8ff` — refactor(web2): move web2-products + web2-variants into web2/
**Last updated**: 2026-05-18 11:04:51 +07
**Summary**: refactor(web2): move web2-products + web2-variants into web2/

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
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/customer-wallet-app.js`
- `web2/customer-wallet/js/customer-wallet-storage.js`
- `web2/delivery-carrier/index.html`
- `web2/export-file/index.html`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/history-cross-check-product/index.html`
- `web2/history-ds/index.html`
- `web2/index.html`
- `web2/inventory-valuation/index.html`
- `web2/ir-mailserver/index.html`
- `web2/live-campaign/index.html`
- `web2/loyalty-program/index.html`
- `web2/mail-template/index.html`
- `web2/offer-program/index.html`
- `web2/pancake-settings/index.html`
- `web2/partner-category-revenue-config/index.html`
- `web2/partner-category/index.html`
- `web2/partner-customer/index.html`
- `web2/partner-supplier/index.html`
- `web2/pos-config/index.html`
- `web2/pos-order/index.html`
- `web2/pos-session/index.html`
- `web2/product-attribute-value/index.html`
- `web2/product-attribute/index.html`
- `web2/product-category/index.html`
- `web2/product-label-paper/index.html`
- `web2/product-uom-categ/index.html`
- `web2/product-uom/index.html`
- `web2/products/css/web2-products.css`
- `web2/products/index.html`
- `web2/products/js/web2-products-api.js`
- `web2/products/js/web2-products-app.js`
- `web2/promotion-program/index.html`
- `web2/report-audit-fastsale/index.html`
- `web2/report-business-results/index.html`
- `web2/report-cash-journal/index.html`
- `web2/report-customer-debt/index.html`
- `web2/report-delivery/index.html`
- `web2/report-exported/index.html`
- `web2/report-imported/index.html`
- `web2/report-not-invoice/index.html`
- `web2/report-order/index.html`
- `web2/report-partner-create/index.html`
- `web2/report-product-invoice/index.html`
- `web2/report-purchase/index.html`
- `web2/report-rate-saleonline/index.html`
- `web2/report-refund/index.html`
- `web2/report-revenue/index.html`
- `web2/report-supplier-debt/index.html`
- `web2/res-currency/index.html`
- `web2/revenue-began-customer/index.html`
- `web2/revenue-began-supplier/index.html`
- `web2/sale-online-facebook/index.html`
- `web2/sale-order/index.html`
- `web2/sale-quotation/index.html`
- `web2/sales-channel/index.html`
- `web2/shared/delivery-method-picker.js`
- `web2/shared/page-builder-tpos.css`
- `web2/shared/page-builder.js`
- `web2/shared/page-shell.js`
- `web2/shared/pbh-realtime.js`
- `web2/shared/popup.js`
- `web2/shared/tpos-menu.json`
- `web2/shared/tpos-sidebar.css`
- `web2/shared/tpos-sidebar.js`
- `web2/shared/web2-api.js`
- `web2/shared/web2-chat-client.js`
- `web2/shared/web2-effects.css`
- `web2/shared/web2-effects.js`
- `web2/shared/web2-new-msg-badge.js`
- `web2/shared/web2-products-cache.js`
- `web2/shared/web2-quick-reply.js`
- `web2/shared/web2-realtime.js`
- `web2/shared/web2-variants-cache.js`
- `web2/stock-fifo-vacuum/index.html`
- `web2/stock-inventory/index.html`
- `web2/stock-location/index.html`
- `web2/stock-move/index.html`
- `web2/stock-picking-type/index.html`
- `web2/stock-warehouse-product/index.html`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-app.js`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`
- `web2/tag/index.html`
- `web2/variants/css/web2-variants.css`
- `web2/variants/index.html`
- `web2/variants/js/web2-variants-api.js`
- `web2/variants/js/web2-variants-app.js`
- `web2/wi-invoice-config/index.html`
- `web2/wi-invoice-history/index.html`
- `web2/wi-invoice/index.html`
- `web2/xuat-nhap-ton/index.html`

## Last 5 commits touching `web2/`

- `cc2c8ff4` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_
- `7eb39f57` refactor(web2): move web2-shared to web2/shared (consolidate Web 2.0) _(2026-05-18)_
- `c049756e` feat(web2): filter cancelled PBH + pagination + stock tracking + SePay endpoint + WEB2.0 markers _(2026-05-18)_
- `0c3c1310` chore(web2): xóa nốt fastpurchaseorder-refund + audit data flow _(2026-05-18)_
- `97a325e0` chore(web2): xóa trang placeholder fastpurchaseorder-invoice _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-110451-cc2c8ff` cho Claude walk chain theo CLAUDE.md protocol.
