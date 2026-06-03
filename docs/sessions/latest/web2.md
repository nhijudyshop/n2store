# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-192114-ca5cc6c`
**Session file**: [`./20260603-192114-ca5cc6c.md`](../20260603-192114-ca5cc6c.md)
**Commit**: `ca5cc6c` — auto: session update
**Last updated**: 2026-06-03 19:21:14 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/overview/index.html`
- `web2/overview/overview.css`
- `web2/shared/tpos-sidebar.js`

## Last 5 commits touching `web2/`

- `ca5cc6c52` auto: session update _(2026-06-03)_
- `69d99a656` docs(web2): overview thêm #datastores (kho dữ liệu dùng chung — 1 nguồn/domain) + dev-log kho KH thống nhất _(2026-06-03)_
- `7c95a42d3` feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast*sale_orders (web2Db) group theo nhóm+NVC, bỏ /api/v2/delivery-assignments *(2026-06-03)\_
- `87018611e` docs(web2): overview thêm section #conventions (quy ước Web 2.0 canonical cho code mới) + CLAUDE.md pointer _(2026-06-03)_
- `9bda96b93` fix(web2): re-check cutover — web2-customer-tpos ghi web2Db (không ghi Web 1.0 customers) + smart-match link → /api/web2/balance-history PATCH _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-192114-ca5cc6c` cho Claude walk chain theo CLAUDE.md protocol.
