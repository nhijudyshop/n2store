# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-123907-fadcac9`
**Session file**: [`./20260623-123907-fadcac9.md`](../20260623-123907-fadcac9.md)
**Commit**: `fadcac9` — feat(web2-admin): group Quản trị viên (admin-only) + Chấm công DG-600 + Quản lý chi tiêu
**Last updated**: 2026-06-23 12:39:07 +07
**Summary**: Group Quản trị viên admin-only + Chấm công DG-600 + Quản lý chi tiêu (Sổ quỹ) — module Web 2.0 riêng

## Files changed in this commit (`web2/`)

- `web2/ai-hub/ai-hub.css`
- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-chat.js`
- `web2/ai-hub/js/ai-hub.js`
- `web2/ai-hub/js/ai-image.js`
- `web2/ai-hub/js/ai-keys.js`
- `web2/audit-log/index.html`
- `web2/balance-history/index.html`
- `web2/cham-cong/css/cham-cong.css`
- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-api.js`
- `web2/cham-cong/js/cham-cong-app.js`
- `web2/cham-cong/js/cham-cong-employees.js`
- `web2/cham-cong/js/cham-cong-payroll.js`
- `web2/cham-cong/js/cham-cong-salary.js`
- `web2/chi-tieu/css/chi-tieu.css`
- `web2/chi-tieu/index.html`
- `web2/chi-tieu/js/chi-tieu-api.js`
- `web2/chi-tieu/js/chi-tieu-app.js`
- `web2/chi-tieu/js/chi-tieu-report.js`
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
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
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

- `fadcac906` feat(web2-admin): group Quản trị viên (admin-only) + Chấm công DG-600 + Quản lý chi tiêu _(2026-06-23)_
- `dc446c8f7` fix(web2-returns): audit vòng 4 — chặn huỷ phiếu đã consumed + ngừng bơm tồn ảo khi return native chưa có PBH _(2026-06-23)_
- `3ad35df32` fix(web2-pbh) deep money-flow audit: 8 bug (double-refund/over-sell/orphan/double-count) _(2026-06-23)_
- `7fa6e535e` fix(web2-pbh) pbh-render detail/history: inject auth (bare-fetch 401 cho NV KPI-scope) + dev-log audit _(2026-06-23)_
- `4be494aaf` fix(web2): bỏ Reset STT + fix khe hở 8px thanh menu (32 trang) + gỡ chữ TPOS + chặn tạo PBH tay _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-123907-fadcac9` cho Claude walk chain theo CLAUDE.md protocol.
