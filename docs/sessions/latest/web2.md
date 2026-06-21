# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-132243-db41242`
**Session file**: [`./20260621-132243-db41242.md`](../20260621-132243-db41242.md)
**Commit**: `db41242` — fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations
**Last updated**: 2026-06-21 13:22:43 +07
**Summary**: audit r7: 11 bug fix (webhook-retry txn, ck-watcher, so-order, token-leak, double-msg, constraint-lock)

## Files changed in this commit (`web2/`)

- `web2/audit-log/index.html`
- `web2/balance-history/index.html`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/index.html`
- `web2/customers/index.html`
- `web2/dashboard/index.html`
- `web2/delivery-zone/index.html`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/fb-ads-stats/index.html`
- `web2/fb-insights/index.html`
- `web2/fb-posts/index.html`
- `web2/index.html`
- `web2/jt-tracking/index.html`
- `web2/kpi/assignments.html`
- `web2/kpi/index.html`
- `web2/livestream-poller/index.html`
- `web2/login/index.html`
- `web2/multi-tool/index.html`
- `web2/notifications/index.html`
- `web2/overview/index.html`
- `web2/pancake-settings/index.html`
- `web2/photo-editor/index.html`
- `web2/photo-studio/index.html`
- `web2/printer-settings/index.html`
- `web2/product-card/index.html`
- `web2/product-category/index.html`
- `web2/product-counter/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/returns/index.html`
- `web2/shared/web2-auth.js`
- `web2/shared/web2-sidebar.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/system/index.html`
- `web2/users-permissions/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`
- `web2/video-beauty/index.html`
- `web2/video-maker/index.html`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_
- `4e3b49217` fix(web2) audit-r6 K-stage1: fast-sale-orders client gửi x-web2-token (11 call site) _(2026-06-21)_
- `c0cf94762` fix(web2) audit-r6: CRITICAL ví trừ không atomic (returns) + 8 fix (auth/worker/DoS/SSE/popup/history) _(2026-06-21)_
- `9376200bf` fix(web2) audit-r4: video-tts copyToChannel fallback (Safari/iOS cu) _(2026-06-21)_
- `b6eeb56dc` fix(web2) audit-r3: so-order footer cost-price (CRIT) + native-orders renderRows/STT + SSE relay hardening + KPI tz + XSS/a11y _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-132243-db41242` cho Claude walk chain theo CLAUDE.md protocol.
