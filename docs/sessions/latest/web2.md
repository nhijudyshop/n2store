# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-014719-0ce6293`
**Session file**: [`./20260622-014719-0ce6293.md`](../20260622-014719-0ce6293.md)
**Commit**: `0ce6293` — fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :_ prefix-match, heartbeat reopen-storm, pgNotify fallback+cap)
**Last updated**: 2026-06-22 01:47:19 +07
**Summary**: fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :_ prefix-mat...

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`
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
- `web2/kpi/index.html`
- `web2/live-control/index.html`
- `web2/live-tv/index.html`
- `web2/livestream-poller/index.html`
- `web2/multi-tool/index.html`
- `web2/notifications/index.html`
- `web2/order-tags/index.html`
- `web2/printer-settings/index.html`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/returns/index.html`
- `web2/shared/web2-sse-bridge.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `0ce6293e3` fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :\* prefix-match, heartbeat reopen-storm, pgNotify fallback+cap) _(2026-06-22)_
- `917941830` fix(web2) live-tv: mount sidebar control page + [hidden] display gotcha trên TV empty/grid _(2026-06-21)_
- `873eaf783` fix(web2) live-tv: số NCC báo qua PATCH /campaign-products/pending (topic web2:campaign-products tin cậy) _(2026-06-21)_
- `ade9d1920` feat(web2) live-tv Phase2-4,7: Web2Campaign + Web2VariantGroup shared + 2 trang TV + menu _(2026-06-21)_
- `fa34c3ed2` refactor(web2): hệ KPI 1 nguồn (web2-kpi-core + Web2Kpi) + enforce scope NV/admin + mask pill + fix bug _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-014719-0ce6293` cho Claude walk chain theo CLAUDE.md protocol.
