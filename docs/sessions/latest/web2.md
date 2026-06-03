# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-165200-af4767e`
**Session file**: [`./20260603-165200-af4767e.md`](../20260603-165200-af4767e.md)
**Commit**: `af4767e` — feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_ (notifications,audit-log,kpi,dashboard,smart-match,supplier-360,supplier-aging,inventory-forecast,cart)
**Last updated**: 2026-06-03 16:52:00 +07
**Summary**: feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_...

## Files changed in this commit (`web2/`)

- `web2/audit-log/index.html`
- `web2/balance-history/js/accountant-history.js`
- `web2/balance-history/js/accountant.js`
- `web2/balance-history/js/balance-core.js`
- `web2/balance-history/js/balance-filters.js`
- `web2/balance-history/js/balance-table.js`
- `web2/balance-history/js/balance-verification.js`
- `web2/balance-history/js/config.js`
- `web2/balance-history/js/customer-info.js`
- `web2/balance-history/js/live-mode.js`
- `web2/balance-history/js/main.js`
- `web2/balance-history/js/qr-generator.js`
- `web2/balance-history/js/transfer-stats.js`
- `web2/balance-history/js/verification.js`
- `web2/customer-wallet/index.legacy.html`
- `web2/customer-wallet/js/customer-wallet-storage.js`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`
- `web2/dashboard/index.html`
- `web2/fastsaleorder-invoice/pbh-app.js`
- `web2/inventory-forecast/index.html`
- `web2/kpi/js/kpi-dashboard.js`
- `web2/notifications/index.html`
- `web2/shared/web2-notification-bell.js`
- `web2/smart-match/index.html`
- `web2/supplier-360/index.html`

## Last 5 commits touching `web2/`

- `af4767e14` feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_ (notifications,audit-log,kpi,dashboard,smart-match,supplier-360,supplier-aging,inventory-forecast,cart) _(2026-06-03)_
- `030c1815e` feat(web2): Phase 2b — endpoint web2 customers/by-phone/:phone/orders (customer-wallet bỏ /api/v2/customers Web 1.0) _(2026-06-03)_
- `470bad1bd` chore(web2): xóa 15 dead file Web 1.0 (balance-history 13 + customer-wallet legacy 2) — tránh nhầm _(2026-06-03)_
- `a55291dd3` feat(web2): Phase 2 decouple Web 1.0 — native-orders + print-export dùng /api/web2/\* (Phase 2b: smart-match/customer-wallet cần endpoint web2) _(2026-06-03)_
- `050f29fcc` feat(web2): Phase 1 tách DB — web2*customers (kho KH riêng web2Db) thay /api/v2/customers Web 1.0 *(2026-06-03)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-165200-af4767e` cho Claude walk chain theo CLAUDE.md protocol.
