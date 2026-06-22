# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-152657-664f1b7`
**Session file**: [`./20260622-152657-664f1b7.md`](../20260622-152657-664f1b7.md)
**Commit**: `664f1b7` — feat(web2-zalo) Phase2b core: tin-mới notify (toast/beep/tab-badge/web-notif) + quản lý hội thoại ghim/mute/đánh-dấu-chưa-đọc
**Last updated**: 2026-06-22 15:26:57 +07
**Summary**: feat(web2-zalo) Phase2b core: tin-mới notify (toast/beep/tab-badge/web-notif) + quản lý hội thoại ghim/mute/...

## Files changed in this commit (`web2/`)

- `web2/audit-log/index.html`
- `web2/balance-history/css/web2-balance-history.css`
- `web2/balance-history/index.html`
- `web2/customer-wallet/index.html`
- `web2/customers/css/customers.css`
- `web2/customers/index.html`
- `web2/dashboard/index.html`
- `web2/fb-ads-stats/js/fb-ads-stats.js`
- `web2/kpi/assignments.html`
- `web2/kpi/css/kpi.css`
- `web2/kpi/js/kpi-dashboard.js`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/returns/css/returns.css`
- `web2/returns/index.html`
- `web2/shared/web2-zalo-api.js`
- `web2/supplier-debt/css/styles.css`
- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-render.js`
- `web2/supplier-wallet/css/supplier-wallet.css`
- `web2/supplier-wallet/index.html`
- `web2/users/css/users.css`
- `web2/users/index.html`
- `web2/zalo/css/web2-zalo.css`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-app.js`
- `web2/zalo/js/web2-zalo-chat.js`
- `web2/zalo/js/web2-zalo-notify.js`

## Last 5 commits touching `web2/`

- `664f1b739` feat(web2-zalo) Phase2b core: tin-mới notify (toast/beep/tab-badge/web-notif) + quản lý hội thoại ghim/mute/đánh-dấu-chưa-đọc _(2026-06-22)_
- `f4892eded` auto: session update _(2026-06-22)_
- `50e528ed2` auto: session update _(2026-06-22)_
- `c56f57eb7` fix(web2) buttons rounder (radius 2px→canonical 9px) + reconcile toolbar align _(2026-06-22)_
- `5b982559c` auto: session update _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-152657-664f1b7` cho Claude walk chain theo CLAUDE.md protocol.
