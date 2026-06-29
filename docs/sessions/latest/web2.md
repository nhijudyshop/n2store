# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-091958-b5afc14`
**Session file**: [`./20260629-091958-b5afc14.md`](../20260629-091958-b5afc14.md)
**Commit**: `b5afc14` — fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan
**Last updated**: 2026-06-29 09:19:58 +07
**Summary**: FIX GỐC widget AI: lỗi provider chứa chữ token bị nhầm phiên hết hạn → đăng xuất oan; verified browser click thật AI trả lời OK

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

- `b5afc142f` fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan _(2026-06-29)_
- `b95677bbf` auto: session update _(2026-06-29)_
- `9fd3316f6` feat(unit-scan): quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control _(2026-06-29)_
- `8b49f216f` fix(web2/ai-assistant,login): phiên hết hạn → thông báo rõ + redirect chuẩn _(2026-06-29)_
- `da9564b40` auto: session update _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-091958-b5afc14` cho Claude walk chain theo CLAUDE.md protocol.
