# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-163240-1203275`
**Session file**: [`./20260613-163240-1203275.md`](../20260613-163240-1203275.md)
**Commit**: `1203275` — feat(web2): UX per-page đợt 1 — products/customers/dashboard + bump sidebar.js cache-bust
**Last updated**: 2026-06-13 16:32:40 +07
**Summary**: feat(web2): UX per-page đợt 1 — products/customers/dashboard + bump sidebar.js cache-bust

## Files changed in this commit (`web2/`)

- `web2/admin-sse-monitor/index.html`
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
- `web2/index.html`
- `web2/kpi/assignments.html`
- `web2/kpi/index.html`
- `web2/livestream-poller/index.html`
- `web2/notifications/index.html`
- `web2/overview/index.html`
- `web2/pancake-settings/index.html`
- `web2/photo-studio/index.html`
- `web2/printer-settings/index.html`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/returns/index.html`
- `web2/services-dashboard/index.html`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/users-permissions/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `120327537` feat(web2): UX per-page đợt 1 — products/customers/dashboard + bump sidebar.js cache-bust _(2026-06-13)_
- `615fa2278` auto: session update _(2026-06-13)_
- `1d7c48478` auto: session update _(2026-06-13)_
- `ce086b698` auto: session update _(2026-06-13)_
- `a8baed286` feat(web2-zalo): render ảnh/sticker/file trong chat + avatar an toàn (referrerpolicy+fallback) + đồng bộ danh bạ→hội thoại _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-163240-1203275` cho Claude walk chain theo CLAUDE.md protocol.
