# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-090219-f599421`
**Session file**: [`./20260619-090219-f599421.md`](../20260619-090219-f599421.md)
**Commit**: `f599421` — feat(live-chat): Phase D — smoke-live-chat-server.sh (post-deploy verify cho server.js split) + dev-log tổng hợp A/B/C/D
**Last updated**: 2026-06-19 09:02:19 +07
**Summary**: Làm tất cả XONG: 0 oversized + adoption §4 (41 file) + 6 shared module + server.js smoke script. Modularization Web2 hoàn chỉnh

## Files changed in this commit (`web2/`)

- `web2/balance-history/js/web2-bh-core.js`
- `web2/balance-history/js/web2-link-customer-modal.js`
- `web2/balance-history/js/web2-manual-deposit.js`
- `web2/balance-history/js/web2-pm-core.js`
- `web2/ck-dashboard/js/ck-dashboard-app.js`
- `web2/customer-wallet/js/web2-customer-wallet-state.js`
- `web2/customers/js/customers-state.js`
- `web2/fastsaleorder-delivery/dlv-app.js`
- `web2/fastsaleorder-invoice/pbh-api.js`
- `web2/fastsaleorder-refund/rf-app.js`
- `web2/kpi/js/kpi-assignments.js`
- `web2/kpi/js/kpi-dashboard.js`
- `web2/multi-tool/js/multi-tool.js`
- `web2/payment-confirm/js/payment-confirm-app.js`
- `web2/products/js/web2-product-detail.js`
- `web2/products/js/web2-products-print-utils.js`
- `web2/products/js/web2-products-state.js`
- `web2/purchase-refund/js/purchase-refund-state.js`
- `web2/reconcile/js/reconcile-state.js`
- `web2/shared/page-builder.js`
- `web2/shared/web2-avatar-utils.js`
- `web2/shared/web2-canvas-utils.js`
- `web2/shared/web2-ck-assign-picker.js`
- `web2/shared/web2-ck-review.js`
- `web2/shared/web2-customer-detail-modal.js`
- `web2/shared/web2-image-lightbox.js`
- `web2/shared/web2-import.js`
- `web2/shared/web2-jwt-utils.js`
- `web2/shared/web2-notification-bell.js`
- `web2/shared/web2-pancake-import.js`
- `web2/shared/web2-quick-reply.js`
- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-so-order-utils.js`
- `web2/shared/web2-unread-panel.js`
- `web2/shared/web2-wallet-api.js`
- `web2/shared/web2-wallet-balance.js`
- `web2/shared/web2-zalo-api.js`
- `web2/shared/web2-zalo.js`
- `web2/supplier-debt/js/supplier-debt-api.js`
- `web2/supplier-debt/js/supplier-debt-state.js`
- `web2/supplier-wallet/js/supplier-wallet-state.js`
- `web2/users/js/users-app.js`
- `web2/variants/js/web2-variants-app.js`

## Last 5 commits touching `web2/`

- `9b476a757` feat(web2): Phase B — 6 shared modules (Jwt/Avatar/Canvas/SoOrder/ImageLightbox/PancakeImport) _(2026-06-19)_
- `27296dea5` refactor(web2): Phase C — adopt shared utils (thin-delegate + fallback) → '1 nguồn' _(2026-06-19)_
- `d6c0c7b71` feat(native-orders): Task 1 — chat-unification, openInteractions → Web2CustomerChat (comments → info col) _(2026-06-19)_
- `bd2c728e9` refactor(web2): tách web2-customer-chat.js (842) → 3 module MOVE-only (4-consumer) — chat-infra XONG _(2026-06-19)_
- `0fe230cd0` refactor(web2): tách web2-chat-panel.js (1049) → 4 module MOVE-only (3-consumer) _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-090219-f599421` cho Claude walk chain theo CLAUDE.md protocol.
