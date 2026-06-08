# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-122649-e512f88`
**Session file**: [`./20260608-122649-e512f88.md`](../20260608-122649-e512f88.md)
**Commit**: `e512f88` — refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments)
**Last updated**: 2026-06-08 12:26:49 +07
**Summary**: refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments)

## Files changed in this commit (`web2/`)

- `web2/balance-history/css/accountant.css`
- `web2/balance-history/css/live-mode.css`
- `web2/balance-history/css/modern.css`
- `web2/balance-history/css/styles.css`
- `web2/balance-history/css/web2-theme.css`
- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/balance-history/js/web2-link-customer-modal.js`
- `web2/balance-history/js/web2-manual-deposit.js`
- `web2/balance-history/js/web2-partner-enricher.js`
- `web2/balance-history/js/web2-pending-match.js`
- `web2/customer-wallet/css/customer-wallet.css`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/customer-wallet-app.js`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`
- `web2/customers/css/customers.css`
- `web2/customers/index.html`
- `web2/customers/js/customers-api.js`
- `web2/customers/js/customers-app.js`
- `web2/index.html`
- `web2/overview/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`
- `web2/products/js/web2-products-print.js`
- `web2/shared/delivery-method-picker.js`
- `web2/shared/page-builder.css`
- `web2/shared/page-builder.js`
- `web2/shared/web2-bill-service.js`
- `web2/shared/web2-customer-detail-modal.js`
- `web2/shared/web2-customer-lookup.js`
- `web2/shared/web2-qr-modal.js`
- `web2/shared/web2-sidebar.css`
- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-theme.css`
- `web2/supplier-debt/css/styles.css`

## Last 5 commits touching `web2/`

- `e512f88df` refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments) _(2026-06-08)_
- `82a132258` fix(web2): QR ví KH lấy customer*id từ kho warehouse (bỏ TPOS fallback) *(2026-06-08)\_
- `96291b813` fix(web2-customers): SĐT bị mất do wallet-balance pill ghi đè span _(2026-06-08)_
- `183e77110` refactor(web2): xóa hẳn live-campaign (page + route + sidebar + worker) _(2026-06-08)_
- `74ead861c` refactor(web2): bỏ partner-customer (TPOS live) + repoint balance-history/customer-wallet sang warehouse _(2026-06-08)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-122649-e512f88` cho Claude walk chain theo CLAUDE.md protocol.
