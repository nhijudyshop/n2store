# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-201052-bde0e54`
**Session file**: [`./20260621-201052-bde0e54.md`](../20260621-201052-bde0e54.md)
**Commit**: `bde0e54` — fix(web2-shell): GLOBAL ≤900px main full-width trên mọi trang (sửa flex-direction no-op)
**Last updated**: 2026-06-21 20:10:52 +07
**Summary**: GLOBAL fix: web2 shell ≤900px main full-width (mọi trang tablet/phone) + bump theme v

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
- `web2/jt-tracking/index.html`
- `web2/kpi/assignments.html`
- `web2/kpi/index.html`
- `web2/livestream-poller/index.html`
- `web2/login/index.html`
- `web2/multi-tool/index.html`
- `web2/notifications/index.html`
- `web2/order-tags/index.html`
- `web2/overview/index.html`
- `web2/pancake-settings/index.html`
- `web2/payment-confirm/index.html`
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
- `web2/shared/web2-theme.css`
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

- `bde0e54ae` fix(web2-shell): GLOBAL ≤900px main full-width trên mọi trang (sửa flex-direction no-op) _(2026-06-21)_
- `5bcd3bbc0` fix(video-maker): iPad full-width main (page-scoped shell fix) + tablet layout _(2026-06-21)_
- `cca2a9f4c` redesign(video-maker): giao diện điện thoại như app edit chuyên nghiệp _(2026-06-21)_
- `8de7d629c` feat(web2): KPI User tag — nút Chốt KPI (admin) + health bar chưa-gán/chưa-chốt + filter NV + amber + deep-link _(2026-06-21)_
- `70a481274` auto: session update _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-201052-bde0e54` cho Claude walk chain theo CLAUDE.md protocol.
