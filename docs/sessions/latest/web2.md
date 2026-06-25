# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-211040-25b2363`
**Session file**: [`./20260625-211040-25b2363.md`](../20260625-211040-25b2363.md)
**Commit**: `25b2363` — auto: session update
**Last updated**: 2026-06-25 21:10:40 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-assistant/index.html`
- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-image.js`
- `web2/ai-photo/index.html`
- `web2/audit-log/index.html`
- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-bh-render.js`
- `web2/cham-cong/index.html`
- `web2/chi-tieu/index.html`
- `web2/chi-tieu/js/chi-tieu-app.js`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/web2-customer-wallet-render.js`
- `web2/customers/index.html`
- `web2/customers/js/customers-app.js`
- `web2/dashboard/index.html`
- `web2/delivery-zone/index.html`
- `web2/fastsaleorder-delivery/dlv-app.js`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-api.js`
- `web2/fastsaleorder-refund/index.html`
- `web2/fastsaleorder-refund/rf-app.js`
- `web2/fb-ads-stats/index.html`
- `web2/fb-insights/index.html`
- `web2/fb-posts/index.html`
- `web2/fb-posts/js/fb-posts-drafts.js`
- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`
- `web2/kpi/assignments.html`
- `web2/kpi/index.html`
- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`
- `web2/live-tv/index.html`
- `web2/live-tv/js/live-tv.js`
- `web2/livestream-poller/index.html`
- `web2/login/index.html`
- `web2/multi-tool/index.html`
- `web2/multi-tool/js/multi-tool.js`
- `web2/notifications/index.html`
- `web2/order-tags/index.html`
- `web2/order-tags/js/order-tags-app.js`
- `web2/overview/index.html`
- `web2/pancake-settings/index.html`
- `web2/payment-confirm/index.html`
- `web2/photo-studio/index.html`
- `web2/printer-settings/index.html`
- `web2/product-card/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-products-render.js`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/returns/index.html`
- `web2/returns/js/returns-order-items.js`
- `web2/shared/web2-ai-assistant.js`
- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-theme.css`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/system/data/web2-modules.json`
- `web2/system/index.html`
- `web2/users-permissions/index.html`
- `web2/users/index.html`
- `web2/users/js/users-app.js`
- `web2/variants/index.html`
- `web2/variants/js/web2-variants-app.js`
- `web2/video-beauty/index.html`
- `web2/video-maker/index.html`
- `web2/video-maker/js/video-library.js`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-chat.js`

## Last 5 commits touching `web2/`

- `25b23634c` auto: session update _(2026-06-25)_
- `37bb8e846` auto: session update _(2026-06-25)_
- `501cf9933` fix(web2/ai-assistant): ẩn khối <think> reasoning model khỏi chat _(2026-06-25)_
- `2557fef33` feat(so-order/AI): đối chiếu Sổ Order ⇄ Kho SP tính sẵn — AI hết xin data _(2026-06-25)_
- `b1008b18c` fix(web2/live-control): picker 'Chờ hàng' tìm theo MÃ + tên (thiếu match code) _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-211040-25b2363` cho Claude walk chain theo CLAUDE.md protocol.
