# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-123714-2a77252`
**Session file**: [`./20260622-123714-2a77252.md`](../20260622-123714-2a77252.md)
**Commit**: `2a77252` — feat(web2) sidebar: collapsed icon click expands group + un-collapses; dedup Sổ Order
**Last updated**: 2026-06-22 12:37:14 +07
**Summary**: feat(web2) sidebar: collapsed icon click expands group + un-collapses; dedup Sổ Order

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
- `web2/multi-tool/index.html`
- `web2/notifications/index.html`
- `web2/order-tags/index.html`
- `web2/overview/index.html`
- `web2/pancake-settings/index.html`
- `web2/photo-editor/index.html`
- `web2/photo-studio/index.html`
- `web2/printer-settings/index.html`
- `web2/product-card/index.html`
- `web2/product-category/index.html`
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

- `2a7725294` feat(web2) sidebar: collapsed icon click expands group + un-collapses; dedup Sổ Order _(2026-06-22)_
- `a8d8244f6` fix(web2) products: GHI CHÚ column misaligned — move line-clamp off the <td> _(2026-06-22)_
- `94ad79f4f` feat(video-maker): ElevenLabs VN — model flash*v2_5 + kho giọng cộng đồng (lọc/cuộn) + voice settings (P2) *(2026-06-22)\_
- `e3c7e1315` fix(web2) native-orders: add mobile shell pack to base.css (hamburger desktop-hide + drawer) _(2026-06-22)_
- `65fb3bf5e` feat(video-maker): bố cục pro-editor (wide-edit + PiP nổi/preview-focus/hidden) + P1/P3 voice _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-123714-2a77252` cho Claude walk chain theo CLAUDE.md protocol.
