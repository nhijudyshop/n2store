# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-151841-7f0f8d0`
**Session file**: [`./20260614-151841-7f0f8d0.md`](../20260614-151841-7f0f8d0.md)
**Commit**: `7f0f8d0` — docs(render): ghi lại tách web2-api (Web1⊥Web2 service split) — dev-log + RENDER_SERVERS_GUIDE
**Last updated**: 2026-06-14 15:18:41 +07
**Summary**: docs(render): ghi lại tách web2-api (Web1⊥Web2 service split) — dev-log + RENDER_SERVERS_GUIDE

## Files changed in this commit (`web2/`)

- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/balance-history/js/web2-link-customer-modal.js`
- `web2/balance-history/js/web2-manual-deposit.js`
- `web2/balance-history/js/web2-pending-match.js`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`
- `web2/customer-wallet/js/web2-wallet-api.js`
- `web2/customers/js/customers-api.js`
- `web2/shared/web2-ck-assign-picker.js`
- `web2/shared/web2-customer-detail-modal.js`
- `web2/shared/web2-qr-modal.js`
- `web2/shared/web2-wallet-balance.js`
- `web2/shared/web2-zalo-api.js`
- `web2/shared/web2-zalo.js`
- `web2/supplier-debt/js/supplier-debt-app.js`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`

## Last 5 commits touching `web2/`

- `805a08866` fix(web2-split): route delivery-invoices/refunds to web2-api + repoint hardcoded web2→fallback URLs _(2026-06-14)_
- `6a245484e` auto: session update _(2026-06-14)_
- `43ba24d53` feat(web2): gộp services-dashboard + admin-sse-monitor → trang Cấu hình & Hệ thống _(2026-06-14)_
- `e55bea256` chore(render): dọn repo sau consolidation web2-realtime _(2026-06-14)_
- `f526a7a8a` fix(web2): NFC-normalize deep-link match in supplier-wallet + supplier-debt _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-151841-7f0f8d0` cho Claude walk chain theo CLAUDE.md protocol.
