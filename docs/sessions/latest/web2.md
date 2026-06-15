# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-232814-2a02bff`
**Session file**: [`./20260615-232814-2a02bff.md`](../20260615-232814-2a02bff.md)
**Commit**: `2a02bff` — refactor(web2): hợp nhất base-URL về 1 nguồn (web2-auth.js) + fix livestream 404 worker + ck-dashboard 401
**Last updated**: 2026-06-15 23:28:14 +07
**Summary**: refactor(web2): hợp nhất base-URL về 1 nguồn (web2-auth.js) + fix livestream 404 worker + ck-dashboard 401

## Files changed in this commit (`web2/`)

- `web2/ck-dashboard/js/ck-dashboard-app.js`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`
- `web2/fastsaleorder-delivery/dlv-app.js`
- `web2/fastsaleorder-invoice/pbh-app.js`
- `web2/fastsaleorder-refund/rf-app.js`
- `web2/jt-tracking/js/jt-tracking-app.js`
- `web2/kpi/js/kpi-assignments.js`
- `web2/kpi/js/kpi-dashboard.js`
- `web2/overview/index.html`
- `web2/payment-confirm/js/payment-confirm-app.js`
- `web2/products/js/web2-products-api.js`
- `web2/products/js/web2-products-app.js`
- `web2/purchase-refund/js/purchase-refund-app.js`
- `web2/reconcile/js/reconcile-app.js`
- `web2/returns/js/returns-api.js`
- `web2/shared/web2-api.js`
- `web2/shared/web2-auth.js`
- `web2/shared/web2-ck-assign-picker.js`
- `web2/shared/web2-ck-review.js`
- `web2/shared/web2-customer-detail-modal.js`
- `web2/shared/web2-notification-bell.js`
- `web2/shared/web2-realtime.js`
- `web2/shared/web2-return-bill.js`
- `web2/shared/web2-suppliers-cache.js`
- `web2/shared/web2-unread-panel.js`
- `web2/supplier-debt/js/supplier-debt-app.js`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`
- `web2/system/js/system-services.js`
- `web2/users/js/users-app.js`
- `web2/variants/js/web2-variants-api.js`

## Last 5 commits touching `web2/`

- `2a02bff32` refactor(web2): hợp nhất base-URL về 1 nguồn (web2-auth.js) + fix livestream 404 worker + ck-dashboard 401 _(2026-06-15)_
- `b5e2ad166` chore(web2): xóa sạch chữ TPOS trong comment/doc Web 2.0 (reword giữ nghĩa) _(2026-06-15)_
- `e2d9d87b2` chore(web2): TPOS triệt để — doc sửa (web2*customers KHÔNG có cột tpos), DROP safety-net, rename var *(2026-06-15)\_
- `15cd722a6` fix(web2/live-chat): SĐT bị fb*id ghi đè (normPhone slice) + health-monitor 404 spam + dọn TPOS leftover *(2026-06-15)\_
- `4436fbf45` feat(web2): optimistic UI cho handler còn await trần (jt-tracking duyệt + page-builder xoá) _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-232814-2a02bff` cho Claude walk chain theo CLAUDE.md protocol.
