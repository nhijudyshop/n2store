# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-192114-ca5cc6c`
**Session file**: [`./20260603-192114-ca5cc6c.md`](../20260603-192114-ca5cc6c.md)
**Commit**: `ca5cc6c` — auto: session update
**Last updated**: 2026-06-03 19:21:14 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/native-orders.js`
- `render.com/routes/pbh-reports.js`
- `render.com/routes/v2/web2-customers.js`

## Last 5 commits touching `render.com/`

- `27d2623fd` feat(web2): kho KH thống nhất — PATCH /api/web2/customers/:id (sửa tên/SĐT/địa chỉ → TPOS by tposId + cache) + native-orders sync phone + fix report-delivery cột thật _(2026-06-03)_
- `3f6341d4f` fix(web2): report-delivery — fast*sale_orders không có cột group, group theo carrier_name *(2026-06-03)\_
- `7c95a42d3` feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast*sale_orders (web2Db) group theo nhóm+NVC, bỏ /api/v2/delivery-assignments *(2026-06-03)\_
- `9bda96b93` fix(web2): re-check cutover — web2-customer-tpos ghi web2Db (không ghi Web 1.0 customers) + smart-match link → /api/web2/balance-history PATCH _(2026-06-03)_
- `826c87c70` feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng) _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-192114-ca5cc6c` cho Claude walk chain theo CLAUDE.md protocol.
