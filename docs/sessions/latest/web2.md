# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-110513-968eadd`
**Session file**: [`./20260629-110513-968eadd.md`](../20260629-110513-968eadd.md)
**Commit**: `968eadd` — feat(goods-weight): rebuild MOBILE-NATIVE theo unit-scan (no sidebar, PWA, safe-area, Zalo tokens)
**Last updated**: 2026-06-29 11:05:13 +07
**Summary**: feat(goods-weight): rebuild MOBILE-NATIVE theo unit-scan (no sidebar, PWA, safe-area, Zalo tokens)

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
- `web2/goods-weight/css/goods-weight.css`
- `web2/goods-weight/goods-weight.webmanifest`
- `web2/goods-weight/index.html`
- `web2/goods-weight/js/goods-weight.js`
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
- `web2/system/data/web2-modules.json`
- `web2/system/index.html`
- `web2/users-permissions/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`
- `web2/video-beauty/index.html`
- `web2/video-maker/index.html`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `968eadd74` feat(goods-weight): rebuild MOBILE-NATIVE theo unit-scan (no sidebar, PWA, safe-area, Zalo tokens) _(2026-06-29)_
- `e3c37b66b` docs(web2): regen codemap + system-data (goods-weight page/route/SSE registered) _(2026-06-29)_
- `8c1a9c556` feat(goods-weight): trang Cân Nặng Hàng ⚖️ — hàng về kiện cân + ảnh BYTEA + SSE web2:goods-weight _(2026-06-29)_
- `bc8640b9f` feat(clearance): admin-only chuyển SP rớt xả ↔ kho chính (gate POST /:id/clearance + ẩn nút non-admin) _(2026-06-29)_
- `b5afc142f` fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-110513-968eadd` cho Claude walk chain theo CLAUDE.md protocol.
