# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-082833-da9564b`
**Session file**: [`./20260629-082833-da9564b.md`](../20260629-082833-da9564b.md)
**Commit**: `da9564b` — auto: session update
**Last updated**: 2026-06-29 08:28:33 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-assistant/index.html`
- `web2/ai-hub/index.html`
- `web2/ai-photo/index.html`
- `web2/audit-log/index.html`
- `web2/balance-history/index.html`
- `web2/cham-cong/index.html`
- `web2/chi-tieu/index.html`
- `web2/ck-dashboard/index.html`
- `web2/clearance/index.html`
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
- `web2/live-control/index.html`
- `web2/livestream-poller/index.html`
- `web2/multi-tool/index.html`
- `web2/notifications/index.html`
- `web2/order-tags/index.html`
- `web2/overview/legacy-overview.html`
- `web2/pancake-settings/index.html`
- `web2/photo-studio/index.html`
- `web2/printer-settings/index.html`
- `web2/product-card/index.html`
- `web2/product-types/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/report-warehouse/index.html`
- `web2/returns/index.html`
- `web2/shared/web2-ai-assistant.js`
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

- `da9564b40` auto: session update _(2026-06-29)_
- `f789f1642` feat(supplier-debt,native-orders): gate admin TT NCC + hiện mã đơn vị "-xxx" trong đơn _(2026-06-29)_
- `85d908fe1` feat(web2-products,unit-scan): per-unit In tem + bỏ nút Gán thủ công (gán auto theo giỏ) _(2026-06-28)_
- `f3fe30c5c` fix(unit-scan): camera den moi trinh duyet - id #scanHost{display:block} de .w2bc{display:flex} cua scanner lam stage sap 0px; chi giu width/height; relax retry 2.5->5s; bump v20260628d _(2026-06-28)_
- `f50644a60` feat(permissions+scan): đăng ký phân quyền unit-scan + clearance; fix camera đen trên PWA _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-082833-da9564b` cho Claude walk chain theo CLAUDE.md protocol.
