# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-162120-17f400a`
**Session file**: [`./20260629-162120-17f400a.md`](../20260629-162120-17f400a.md)
**Commit**: `17f400a` — feat(sort-station): trang "Bàn chia hàng" 📱 — put-wall sortation guided
**Last updated**: 2026-06-29 16:21:20 +07
**Summary**: Trang MỚI Bàn chia hàng (sort-station) — put-wall guided: quét→KỆ+đủ/thiếu+manifest; verified e2e

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
- `web2/shared/web2-product-units.js`
- `web2/shared/web2-sidebar.js`
- `web2/sort-station/css/sort-station.css`
- `web2/sort-station/index.html`
- `web2/sort-station/js/sort-station.js`
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

- `17f400a21` feat(sort-station): trang "Bàn chia hàng" 📱 — put-wall sortation guided _(2026-06-29)_
- `e70726129` feat(print): tem QR sát lề trái + biến thể/giá lên đỉnh → chừa khoảng trống ghi bút _(2026-06-29)_
- `4df262c83` refactor(web2): module CHUNG Web2ProductUnits — client duy nhất /api/web2-product-units/\* _(2026-06-29)_
- `668550f86` feat(units): mint theo SL kho (SP-001..SP-SL) lúc tạo SP + gán seq nhỏ nhất / tái dùng freed _(2026-06-29)_
- `343ba2e48` fix(goods-weight): hết tràn ngang mobile — number input co được trong grid (min-width:0 + width:100%) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-162120-17f400a` cho Claude walk chain theo CLAUDE.md protocol.
