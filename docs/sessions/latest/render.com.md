# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-204820-8c6859b`
**Session file**: [`./20260603-204820-8c6859b.md`](../20260603-204820-8c6859b.md)
**Commit**: `8c6859b` — feat(web2): đổi tên kho KH đơn hàng customers → web2_order_customers (web2Db)
**Last updated**: 2026-06-03 20:48:20 +07
**Summary**: feat(web2): đổi tên kho KH đơn hàng customers → web2_order_customers (web2Db)

## Files changed in this commit (`render.com/`)

- `render.com/db/web2-order-customers-migrate.js`
- `render.com/db/web2-schema-mirror.js`
- `render.com/routes/fast-sale-orders.js`
- `render.com/routes/native-orders.js`
- `render.com/routes/pbh-reports.js`
- `render.com/routes/v2/web2-customer-orders.js`
- `render.com/routes/v2/web2-customer-tpos.js`
- `render.com/server.js`
- `render.com/services/web2-order-customer-service.js`

## Last 5 commits touching `render.com/`

- `8c6859bf9` feat(web2): đổi tên kho KH đơn hàng customers → web2*order_customers (web2Db) *(2026-06-03)\_
- `8cdc6c407` auto: session update _(2026-06-03)_
- `d6ee4135f` fix(web2): backtick trong SQL comment làm vỡ template literal → server require throw. Đổi sang dấu nháy kép _(2026-06-03)_
- `120b773d3` feat(web2): web2*customers thêm fb_id + helpers (getOrCreateWeb2Customer/findByFbId/linkFbId) — nền tảng gộp kho KH (native-orders chưa migrate vì schema phức tạp) *(2026-06-03)\_
- `d9924bcf0` fix(web2): smart-match + dashboard-kpi đọc web2*balance_history (web2Db) thay balance_history (bản copy stale Web 1.0) *(2026-06-03)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-204820-8c6859b` cho Claude walk chain theo CLAUDE.md protocol.
