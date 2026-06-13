# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-232811-e30d993`
**Session file**: [`./20260613-232811-e30d993.md`](../20260613-232811-e30d993.md)
**Commit**: `e30d993` — refactor(web2,shared): dọn cross-folder dep — move native-orders css → web2/shared (web2-base + web2-components), repoint 31 files
**Last updated**: 2026-06-13 23:28:11 +07
**Summary**: refactor(web2,shared): dọn cross-folder dep — move native-orders css → web2/shared (web2-base + web2-components...

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customer-wallet/index.html`
- `web2/customers/index.html`
- `web2/delivery-zone/index.html`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/kpi/assignments.html`
- `web2/kpi/index.html`
- `web2/livestream-poller/index.html`
- `web2/pancake-settings/index.html`
- `web2/printer-settings/index.html`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/reconcile/index.html`
- `web2/report-revenue/index.html`
- `web2/shared/web2-base.css`
- `web2/shared/web2-components.css`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `e30d9930f` refactor(web2,shared): dọn cross-folder dep — move native-orders css → web2/shared (web2-base + web2-components), repoint 31 files _(2026-06-13)_
- `c61c7cb31` auto: session update _(2026-06-13)_
- `27ed9328c` feat(web2,shared): add web2-motion.js (Motion engine, ESM) + dev-log đợt 9 — animation = Motion thay barba _(2026-06-13)_
- `2d1e4a7ae` auto: session update _(2026-06-13)_
- `5bf11417d` feat(web2,shared): native-orders-based shared FX — faux-glass + soft-UI card + barba-style page transition (no PJAX); wire live-chat + native-orders _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-232811-e30d993` cho Claude walk chain theo CLAUDE.md protocol.
