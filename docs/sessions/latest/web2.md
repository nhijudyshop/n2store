# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-190619-7c95a42`
**Session file**: [`./20260603-190619-7c95a42.md`](../20260603-190619-7c95a42.md)
**Commit**: `7c95a42` — feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast_sale_orders (web2Db) group theo nhóm+NVC, bỏ /api/v2/delivery-assignments
**Last updated**: 2026-06-03 19:06:19 +07
**Summary**: feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast_sale_orders (web2Db) g...

## Files changed in this commit (`web2/`)

- `web2/report-delivery/index.html`

## Last 5 commits touching `web2/`

- `7c95a42d3` feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast*sale_orders (web2Db) group theo nhóm+NVC, bỏ /api/v2/delivery-assignments *(2026-06-03)\_
- `87018611e` docs(web2): overview thêm section #conventions (quy ước Web 2.0 canonical cho code mới) + CLAUDE.md pointer _(2026-06-03)_
- `9bda96b93` fix(web2): re-check cutover — web2-customer-tpos ghi web2Db (không ghi Web 1.0 customers) + smart-match link → /api/web2/balance-history PATCH _(2026-06-03)_
- `9fbe91498` docs(web2): Phase 6 cutover VERIFIED — overview + dev-log (web2 trên web2Db, Web 1.0 untouched) _(2026-06-03)_
- `b57befb0e` docs(web2): overview — cập nhật DB (n2store-web2-db) + router /api/web2/\* namespace + Firebase web2\_ _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-190619-7c95a42` cho Claude walk chain theo CLAUDE.md protocol.
