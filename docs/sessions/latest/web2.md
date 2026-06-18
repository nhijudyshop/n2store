# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-002426-eaf9213`
**Session file**: [`./20260619-002426-eaf9213.md`](../20260619-002426-eaf9213.md)
**Commit**: `eaf9213` — refactor(web2): Wave 3 — tách so-order-app.js (5932, file lớn nhất) → 23 module MOVE-only
**Last updated**: 2026-06-19 00:24:26 +07
**Summary**: Wave 3 standalone tier XONG: 18 file split (foundation+W1+W2+W3-standalone incl so-order 5932→23). Còn chat-infra+native-orders surgery+live-chat cluster

## Files changed in this commit (`web2/`)

- `web2/customers/index.html`
- `web2/customers/js/customers-app.js`
- `web2/customers/js/customers-detail.js`
- `web2/customers/js/customers-events.js`
- `web2/customers/js/customers-render.js`
- `web2/customers/js/customers-state.js`
- `web2/pancake-settings/index.html`
- `web2/pancake-settings/js/pancake-settings-actions.js`
- `web2/pancake-settings/js/pancake-settings-api.js`
- `web2/pancake-settings/js/pancake-settings-render.js`
- `web2/pancake-settings/js/pancake-settings-state.js`
- `web2/pancake-settings/js/pancake-settings.js`
- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio-bg.js`
- `web2/photo-studio/photo-studio-bgpicker.js`
- `web2/photo-studio/photo-studio-canvas.js`
- `web2/photo-studio/photo-studio-edit.js`
- `web2/photo-studio/photo-studio-state.js`
- `web2/photo-studio/photo-studio-ui.js`
- `web2/photo-studio/photo-studio.js`
- `web2/products/index.html`
- `web2/products/js/web2-products-actions.js`
- `web2/products/js/web2-products-app.js`
- `web2/products/js/web2-products-filters.js`
- `web2/products/js/web2-products-modal.js`
- `web2/products/js/web2-products-render.js`
- `web2/products/js/web2-products-state.js`
- `web2/products/js/web2-products-variant-picker.js`
- `web2/purchase-refund/index.html`
- `web2/purchase-refund/js/purchase-refund-actions.js`
- `web2/purchase-refund/js/purchase-refund-api.js`
- `web2/purchase-refund/js/purchase-refund-app.js`
- `web2/purchase-refund/js/purchase-refund-modal.js`
- `web2/purchase-refund/js/purchase-refund-render.js`
- `web2/purchase-refund/js/purchase-refund-state.js`
- `web2/reconcile/index.html`
- `web2/reconcile/js/reconcile-actions.js`
- `web2/reconcile/js/reconcile-api.js`
- `web2/reconcile/js/reconcile-app.js`
- `web2/reconcile/js/reconcile-render.js`
- `web2/reconcile/js/reconcile-state.js`
- `web2/shared/web2-msg-template-core.js`
- `web2/shared/web2-msg-template-send.js`
- `web2/shared/web2-msg-template-ui.js`
- `web2/shared/web2-msg-template.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-actions.js`
- `web2/supplier-debt/js/supplier-debt-api.js`
- `web2/supplier-debt/js/supplier-debt-app.js`
- `web2/supplier-debt/js/supplier-debt-filters.js`
- `web2/supplier-debt/js/supplier-debt-render.js`
- `web2/supplier-debt/js/supplier-debt-state.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-actions.js`
- `web2/supplier-wallet/js/supplier-wallet-api.js`
- `web2/supplier-wallet/js/supplier-wallet-app.js`
- `web2/supplier-wallet/js/supplier-wallet-render.js`
- `web2/supplier-wallet/js/supplier-wallet-state.js`

## Last 5 commits touching `web2/`

- `156a906c9` refactor(web2): Wave 3 batch C — photo-studio(2348→7) + products-app(2010→7) + msg-template(961→4) MOVE-only _(2026-06-18)_
- `b5385374f` refactor(web2): Wave 3 batch B — reconcile(1106→5) + pancake-settings(1305→5) + purchase-refund(1634→6) MOVE-only _(2026-06-18)_
- `dc5556e87` refactor(web2): Wave 3 batch A — supplier-wallet(912→5) + customers(914→5) + supplier-debt(1394→6) MOVE-only _(2026-06-18)_
- `0bf519e1e` refactor(web2): Wave 2 — tách balance-history-app (1280→8) + pending-match (914→7) MOVE-only _(2026-06-18)_
- `0f81515d5` refactor(web2): Wave 2 — tách customer-wallet-app (1314→5) + products-print (1293→5) MOVE-only _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-002426-eaf9213` cho Claude walk chain theo CLAUDE.md protocol.
