# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-102759-b60bc41`
**Session file**: [`./20260622-102759-b60bc41.md`](../20260622-102759-b60bc41.md)
**Commit**: `b60bc41` — refactor(web2-css) theme: dedup dead tr-level zebra/hover (striping now 1-source at td-level Block A)
**Last updated**: 2026-06-22 10:27:59 +07
**Summary**: refactor(web2-css) theme: dedup dead tr-level zebra/hover (striping now 1-source at td-level Block A)

## Files changed in this commit (`web2/`)

- `web2/audit-log/index.html`
- `web2/balance-history/css/accountant.css`
- `web2/balance-history/css/live-mode.css`
- `web2/balance-history/css/styles.css`
- `web2/balance-history/css/web2-theme.css`
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
- `web2/live-control/index.html`
- `web2/live-tv/index.html`
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
- `web2/shared/page-builder.css`
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

- `b60bc417f` refactor(web2-css) theme: dedup dead tr-level zebra/hover (striping now 1-source at td-level Block A) _(2026-06-22)_
- `edaa40d97` refactor(web2-css) consolidate toward 1-source/component: rm 4 orphan css + dead page-builder table/modal/pagination blocks _(2026-06-22)_
- `f2ea3f21b` feat(web2-ui) table: default bảng = look native-orders (grid-line + zebra + header đậm) cho toàn Web 2.0 + delivery emit verified live _(2026-06-22)_
- `a412618eb` polish(web2) SSE consumer LOW hygiene: report-delivery realtime + debounce 4 badge handlers _(2026-06-22)_
- `8d6abe393` fix(web2) SSE R4 (live-test): server-side wildcard delivery in _localNotify — exact web2:wallet:<phone> now reaches web2:wallet:\* (6 ví pages) _(2026-06-22)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-102759-b60bc41` cho Claude walk chain theo CLAUDE.md protocol.
