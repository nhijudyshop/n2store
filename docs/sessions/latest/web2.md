# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-014742-4be494a`
**Session file**: [`./20260623-014742-4be494a.md`](../20260623-014742-4be494a.md)
**Commit**: `4be494a` — fix(web2): bỏ Reset STT + fix khe hở 8px thanh menu (32 trang) + gỡ chữ TPOS + chặn tạo PBH tay
**Last updated**: 2026-06-23 01:47:42 +07
**Summary**: PBH gọn(bỏ ResetSTT)+fix khe 8px menu 32 trang+gỡ chữ TPOS web2+chặn tạo PBH tay(410)

## Files changed in this commit (`web2/`)

- `web2/audit-log/index.html`
- `web2/balance-history/DATABASE_STRUCTURE.md`
- `web2/balance-history/docs/ARCHITECTURE_balance_history.md`
- `web2/balance-history/docs/PARTIAL_PHONE_TPOS_SEARCH.md`
- `web2/balance-history/docs/PHONE_EXTRACTION_IMPROVEMENTS.md`
- `web2/balance-history/docs/PHONE_PARTNER_FETCH_GUIDE.md`
- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-bh-link-customer.js`
- `web2/balance-history/js/web2-partner-enricher.js`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/index.html`
- `web2/customers/index.html`
- `web2/dashboard/index.html`
- `web2/delivery-zone/index.html`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-actions.js`
- `web2/fastsaleorder-invoice/pbh-app.js`
- `web2/fastsaleorder-refund/index.html`
- `web2/fb-ads-stats/index.html`
- `web2/fb-insights/index.html`
- `web2/fb-posts/index.html`
- `web2/fb-posts/js/fb-posts-app.js`
- `web2/index.html`
- `web2/jt-tracking/index.html`
- `web2/kpi/assignments.html`
- `web2/kpi/index.html`
- `web2/live-control/index.html`
- `web2/livestream-poller/index.html`
- `web2/multi-tool/index.html`
- `web2/notifications/index.html`
- `web2/order-tags/index.html`
- `web2/overview/index.html`
- `web2/pancake-settings/index.html`
- `web2/photo-editor/index.html`
- `web2/photo-studio/index.html`
- `web2/printer-settings/index.html`
- `web2/product-card/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-products-print-utils.js`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/returns/index.html`
- `web2/shared/web2-base.css`
- `web2/shared/web2-menu.json`
- `web2/shared/web2-sidebar.css`
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

- `4be494aaf` fix(web2): bỏ Reset STT + fix khe hở 8px thanh menu (32 trang) + gỡ chữ TPOS + chặn tạo PBH tay _(2026-06-23)_
- `c0681a9df` chore(web2): xoá trang product-category (Nhóm sản phẩm) + khôi phục Kho Biến Thể (108) _(2026-06-23)_
- `e26fa4998` feat(web2-audit): Wave 3 FE — 🕘 per-record history buttons on 10 sink-wired pages _(2026-06-23)_
- `d5d79eb9a` feat(web2-audit): Wave 2 backend — 9 routes → event-sink + entityId purge + entity labels _(2026-06-23)_
- `28cd2d038` feat(web2-audit): per-record history FE — returns + reconcile(combined) + customers 🕘 buttons _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-014742-4be494a` cho Claude walk chain theo CLAUDE.md protocol.
