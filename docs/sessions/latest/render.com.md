# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-194751-1a4fb73`
**Session file**: [`./20260603-194751-1a4fb73.md`](../20260603-194751-1a4fb73.md)
**Commit**: `1a4fb73` — auto: session update
**Last updated**: 2026-06-03 19:47:51 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/admin-web2-wallet-reset.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `91c2b764b` feat(web2): admin backup+reset ví/matching web2Db (lấy lại số dư từ đầu, chỉ web2 không đụng Web 1.0) _(2026-06-03)_
- `27d2623fd` feat(web2): kho KH thống nhất — PATCH /api/web2/customers/:id (sửa tên/SĐT/địa chỉ → TPOS by tposId + cache) + native-orders sync phone + fix report-delivery cột thật _(2026-06-03)_
- `3f6341d4f` fix(web2): report-delivery — fast*sale_orders không có cột group, group theo carrier_name *(2026-06-03)\_
- `7c95a42d3` feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast*sale_orders (web2Db) group theo nhóm+NVC, bỏ /api/v2/delivery-assignments *(2026-06-03)\_
- `9bda96b93` fix(web2): re-check cutover — web2-customer-tpos ghi web2Db (không ghi Web 1.0 customers) + smart-match link → /api/web2/balance-history PATCH _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-194751-1a4fb73` cho Claude walk chain theo CLAUDE.md protocol.
