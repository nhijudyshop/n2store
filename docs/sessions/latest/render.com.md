# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-190619-7c95a42`
**Session file**: [`./20260603-190619-7c95a42.md`](../20260603-190619-7c95a42.md)
**Commit**: `7c95a42` — feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast_sale_orders (web2Db) group theo nhóm+NVC, bỏ /api/v2/delivery-assignments
**Last updated**: 2026-06-03 19:06:19 +07
**Summary**: feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast_sale_orders (web2Db) g...

## Files changed in this commit (`render.com/`)

- `render.com/routes/pbh-reports.js`

## Last 5 commits touching `render.com/`

- `7c95a42d3` feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast*sale_orders (web2Db) group theo nhóm+NVC, bỏ /api/v2/delivery-assignments *(2026-06-03)\_
- `9bda96b93` fix(web2): re-check cutover — web2-customer-tpos ghi web2Db (không ghi Web 1.0 customers) + smart-match link → /api/web2/balance-history PATCH _(2026-06-03)_
- `826c87c70` feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng) _(2026-06-03)_
- `2f1541042` fix(web2): mirror handle GENERATED column (customers fts) + data-copy skip generated; bỏ fast*sale_order_lines (không tồn tại) *(2026-06-03)\_
- `000a0d010` feat(web2): Phase 6 — mở rộng mirror list (mọi bảng web2 đụng + copy riêng customers/balance*history/campaigns ở web2Db, Web 1.0 không đụng) *(2026-06-03)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-190619-7c95a42` cho Claude walk chain theo CLAUDE.md protocol.
