# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-230906-f83d814`
**Session file**: [`./20260618-230906-f83d814.md`](../20260618-230906-f83d814.md)
**Commit**: `f83d814` — docs(web2): regroup chat-client + pancake-token-manager into Wave 3 focused passes
**Last updated**: 2026-06-18 23:09:06 +07
**Summary**: Wave 0 shared + 8 page-app splits (jt-tracking/returns/zalo/pbh/customer-wallet/products-print/balance-history/pending-match) verified+pushed; codemap auto-gen live

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/balance-history/js/web2-bh-actions.js`
- `web2/balance-history/js/web2-bh-chat-export.js`
- `web2/balance-history/js/web2-bh-core.js`
- `web2/balance-history/js/web2-bh-data.js`
- `web2/balance-history/js/web2-bh-link-customer.js`
- `web2/balance-history/js/web2-bh-reassign-modal.js`
- `web2/balance-history/js/web2-bh-render.js`
- `web2/balance-history/js/web2-pending-match.js`
- `web2/balance-history/js/web2-pm-core.js`
- `web2/balance-history/js/web2-pm-customer-search.js`
- `web2/balance-history/js/web2-pm-modal.js`
- `web2/balance-history/js/web2-pm-picker.js`
- `web2/balance-history/js/web2-pm-render.js`
- `web2/balance-history/js/web2-pm-resolve.js`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/web2-customer-wallet-api.js`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`
- `web2/customer-wallet/js/web2-customer-wallet-events.js`
- `web2/customer-wallet/js/web2-customer-wallet-render.js`
- `web2/customer-wallet/js/web2-customer-wallet-state.js`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-actions.js`
- `web2/fastsaleorder-invoice/pbh-api.js`
- `web2/fastsaleorder-invoice/pbh-app.js`
- `web2/fastsaleorder-invoice/pbh-filters.js`
- `web2/fastsaleorder-invoice/pbh-render.js`
- `web2/fastsaleorder-invoice/pbh-state.js`
- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-actions.js`
- `web2/jt-tracking/js/jt-tracking-api.js`
- `web2/jt-tracking/js/jt-tracking-app.js`
- `web2/jt-tracking/js/jt-tracking-constants.js`
- `web2/jt-tracking/js/jt-tracking-modals.js`
- `web2/jt-tracking/js/jt-tracking-render.js`
- `web2/jt-tracking/js/jt-tracking-state.js`
- `web2/products/index.html`
- `web2/products/js/web2-products-print-barcode.js`
- `web2/products/js/web2-products-print-modal.js`
- `web2/products/js/web2-products-print-render.js`
- `web2/products/js/web2-products-print-utils.js`
- `web2/products/js/web2-products-print.js`
- `web2/returns/index.html`
- `web2/returns/js/returns-app.js`
- `web2/returns/js/returns-cod.js`
- `web2/returns/js/returns-core.js`
- `web2/returns/js/returns-customer.js`
- `web2/returns/js/returns-form.js`
- `web2/returns/js/returns-order-items.js`
- `web2/returns/js/returns-tabs.js`
- `web2/shared/web2-api-fetch.js`
- `web2/shared/web2-format.js`
- `web2/shared/web2-notify.js`
- `web2/shared/web2-phone-utils.js`
- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-text-utils.js`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-accounts.js`
- `web2/zalo/js/web2-zalo-app.js`
- `web2/zalo/js/web2-zalo-chat.js`
- `web2/zalo/js/web2-zalo-lookup-zns.js`
- `web2/zalo/js/web2-zalo-utils.js`

## Last 5 commits touching `web2/`

- `0bf519e1e` refactor(web2): Wave 2 — tách balance-history-app (1280→8) + pending-match (914→7) MOVE-only _(2026-06-18)_
- `0f81515d5` refactor(web2): Wave 2 — tách customer-wallet-app (1314→5) + products-print (1293→5) MOVE-only _(2026-06-18)_
- `fae5be4d1` refactor(web2): Wave 1 — tách web2-zalo-app (886→5) + pbh-app (1027→6) MOVE-only _(2026-06-18)_
- `7e55515e8` refactor(web2): Wave 1 — tách returns-app.js (867) → 7 module _(2026-06-18)_
- `b412690da` refactor(web2): Wave 1 — tách jt-tracking-app.js (1090) → 7 module _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-230906-f83d814` cho Claude walk chain theo CLAUDE.md protocol.
