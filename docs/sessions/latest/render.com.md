# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-183413-826c87c`
**Session file**: [`./20260603-183413-826c87c.md`](../20260603-183413-826c87c.md)
**Commit**: `826c87c` — feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng)
**Last updated**: 2026-06-03 18:34:13 +07
**Summary**: feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng)

## Files changed in this commit (`render.com/`)

- `render.com/db/web2-data-copy.js`
- `render.com/db/web2-schema-mirror.js`
- `render.com/routes/delivery-invoices.js`
- `render.com/routes/fast-sale-orders.js`
- `render.com/routes/native-orders.js`
- `render.com/routes/pbh-reports.js`
- `render.com/routes/purchase-refund.js`
- `render.com/routes/reconcile.js`
- `render.com/routes/refunds.js`
- `render.com/routes/sepay-webhook-core.js`
- `render.com/routes/v2/audit-log.js`
- `render.com/routes/v2/cart.js`
- `render.com/routes/v2/dashboard-kpi.js`
- `render.com/routes/v2/inventory-forecast.js`
- `render.com/routes/v2/kpi.js`
- `render.com/routes/v2/notifications.js`
- `render.com/routes/v2/smart-match.js`
- `render.com/routes/v2/supplier-360.js`
- `render.com/routes/v2/web2-balance-history.js`
- `render.com/routes/v2/web2-customer-orders.js`
- `render.com/routes/v2/web2-customer-wallet.js`
- `render.com/routes/v2/web2-customers.js`
- `render.com/routes/v2/web2-monitoring.js`
- `render.com/routes/v2/web2-supplier-debt.js`
- `render.com/routes/v2/web2-wallets.js`
- `render.com/routes/web2-products.js`
- `render.com/routes/web2-users.js`
- `render.com/routes/web2-variants.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `826c87c70` feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng) _(2026-06-03)_
- `2f1541042` fix(web2): mirror handle GENERATED column (customers fts) + data-copy skip generated; bỏ fast*sale_order_lines (không tồn tại) *(2026-06-03)\_
- `000a0d010` feat(web2): Phase 6 — mở rộng mirror list (mọi bảng web2 đụng + copy riêng customers/balance*history/campaigns ở web2Db, Web 1.0 không đụng) *(2026-06-03)\_
- `c1fa9ba8c` feat(web2): Phase 6 prep — bump-sequences endpoint (+10000 chống collision gap rows khi cutover) _(2026-06-03)_
- `5cb0809b4` fix(web2): Phase 5 data-copy — JSON.stringify cột json/jsonb (array bị gửi thành PG array → invalid json) _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-183413-826c87c` cho Claude walk chain theo CLAUDE.md protocol.
