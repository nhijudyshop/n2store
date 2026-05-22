# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-134253-c35e5d5`
**Session file**: [`./20260522-134253-c35e5d5.md`](../20260522-134253-c35e5d5.md)
**Commit**: `c35e5d5` — fix(delivery-report): stats follow table visibility (hide together in lite default)
**Last updated**: 2026-05-22 13:42:53 +07
**Summary**: fix(delivery-report): stats follow table visibility (hide together in lite default)

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/audit-log.js`
- `render.com/routes/v2/dashboard-kpi.js`
- `render.com/server.js`
- `render.com/services/web2-wallet-isolation.js`

## Last 5 commits touching `render.com/`

- `cfeb89635` feat(web2): cô lập triệt để wallet — web2*customer_wallets/transactions/adjustments + Postgres trigger *(2026-05-22)\_
- `e66a86298` fix(web2/supplier-aging): bỏ query purchase*orders (Web 1.0 table) *(2026-05-22)\_
- `794039b2a` fix(web2/backend): audit-log + smart-match column mapping (real schema) _(2026-05-22)_
- `9e689ae9c` fix(web2/backend): fast*sale_orders thực tế dùng date_created/date_invoice + partner_name/phone *(2026-05-22)\_
- `2a1610ddb` fix(web2/backend): web2*products.is_active (không phải active) + purchase_orders.final_amount *(2026-05-22)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-134253-c35e5d5` cho Claude walk chain theo CLAUDE.md protocol.
