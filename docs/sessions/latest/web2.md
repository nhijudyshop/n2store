# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-195841-a1037d2`
**Session file**: [`./20260607-195841-a1037d2.md`](../20260607-195841-a1037d2.md)
**Commit**: `a1037d2` — refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class
**Last updated**: 2026-06-07 19:58:41 +07
**Summary**: refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class

## Files changed in this commit (`web2/`)

- `web2/admin-sse-monitor/index.html`
- `web2/audit-log/index.html`
- `web2/balance-history/css/accountant.css`
- `web2/balance-history/css/live-mode.css`
- `web2/balance-history/css/modern.css`
- `web2/balance-history/css/styles.css`
- `web2/balance-history/css/web2-theme.css`
- `web2/balance-history/index.html`
- `web2/balance-history/js/tpos-partner-enricher.js`
- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/css/customer-wallet.css`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/customer-wallet-app.js`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`
- `web2/customers/css/customers.css`
- `web2/customers/index.html`
- `web2/dashboard/index.html`
- `web2/delivery-zone/index.html`
- `web2/fastsaleorder-delivery/dlv-app.js`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-app.js`
- `web2/fastsaleorder-refund/index.html`
- `web2/fastsaleorder-refund/rf-app.js`
- `web2/index.html`
- `web2/kpi/assignments.html`
- `web2/kpi/css/kpi.css`
- `web2/kpi/index.html`
- `web2/live-campaign/index.html`
- `web2/notifications/index.html`
- `web2/overview/index.html`
- `web2/overview/overview.css`
- `web2/pancake-settings/index.html`
- `web2/pancake-settings/js/pancake-settings.js`
- `web2/partner-customer/css/partner-customer.css`
- `web2/partner-customer/index.html`
- `web2/payment-confirm/js/payment-confirm-app.js`
- `web2/photo-studio/index.html`
- `web2/printer-settings/index.html`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/returns/index.html`
- `web2/services-dashboard/index.html`
- `web2/shared/chat-panel/web2-chat-panel.css`
- `web2/shared/chat-panel/web2-chat-panel.js`
- `web2/shared/page-builder.css`
- `web2/shared/page-builder.js`
- `web2/shared/page-shell.js`
- `web2/shared/web2-auth.js`
- `web2/shared/web2-chat-client.js`
- `web2/shared/web2-ck-review.js`
- `web2/shared/web2-effects.js`
- `web2/shared/web2-extension-bridge.js`
- `web2/shared/web2-menu.json`
- `web2/shared/web2-realtime.js`
- `web2/shared/web2-sidebar.css`
- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-theme.css`
- `web2/shared/web2-wallet-balance.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/users-permissions/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`

## Last 5 commits touching `web2/`

- `a1037d2a1` refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class _(2026-06-07)_
- `f1f0b7690` refactor(live-chat): rename tpos-pancake→live-chat, purge chữ 'tpos' + comment qua pages.fm _(2026-06-07)_
- `f7a6a56ff` feat(web2): GỠ SẠCH TPOS khỏi cột live + live-campaign (no flag, no fallback) _(2026-06-07)_
- `0e530bd04` feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2*live_campaigns *(2026-06-07)\_
- `d8b59e44e` feat(web2/bill): PBH đổi Code128 → QR Code _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-195841-a1037d2` cho Claude walk chain theo CLAUDE.md protocol.
