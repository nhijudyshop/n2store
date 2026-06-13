# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-144101-147e0a0`
**Session file**: [`./20260613-144101-147e0a0.md`](../20260613-144101-147e0a0.md)
**Commit**: `147e0a0` — auto: session update
**Last updated**: 2026-06-13 14:41:01 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/admin-sse-monitor/index.html`
- `web2/balance-history/index.html`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/index.html`
- `web2/customers/index.html`
- `web2/dashboard/index.html`
- `web2/delivery-zone/index.html`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/kpi/index.html`
- `web2/livestream-poller/index.html`
- `web2/notifications/index.html`
- `web2/printer-settings/index.html`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-revenue/index.html`
- `web2/returns/index.html`
- `web2/shared/web2-sse-bridge.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-app.js`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`
- `web2/users/index.html`
- `web2/variants/index.html`

## Last 5 commits touching `web2/`

- `147e0a0fc` auto: session update _(2026-06-13)_
- `76b4261b5` fix(web2): Batch 3 audit — cụm refund/ví NCC (C11 picker, C9 atomic, C12 sepay match, C18 qty0) _(2026-06-13)_
- `1fb64f925` auto: session update _(2026-06-13)_
- `ccf8b4a3b` fix(web2): Batch 1 audit — công nợ draft/cancelled (A3) + manualSepayId wrap (C17) + partial-return filter (A2) _(2026-06-13)_
- `9e181f9b2` auto: session update _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-144101-147e0a0` cho Claude walk chain theo CLAUDE.md protocol.
