# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-195615-cdfe1e0`
**Session file**: [`./20260603-195615-cdfe1e0.md`](../20260603-195615-cdfe1e0.md)
**Commit**: `cdfe1e0` — auto: session update
**Last updated**: 2026-06-03 19:56:15 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/admin-web2-wallet-reset.js`

## Last 5 commits touching `render.com/`

- `e73f9f7f3` feat(web2): rematch-all endpoint (keyset id, xử lý mỗi GD 1 lần) — fix reprocess re-pick recent rows _(2026-06-03)_
- `91c2b764b` feat(web2): admin backup+reset ví/matching web2Db (lấy lại số dư từ đầu, chỉ web2 không đụng Web 1.0) _(2026-06-03)_
- `27d2623fd` feat(web2): kho KH thống nhất — PATCH /api/web2/customers/:id (sửa tên/SĐT/địa chỉ → TPOS by tposId + cache) + native-orders sync phone + fix report-delivery cột thật _(2026-06-03)_
- `3f6341d4f` fix(web2): report-delivery — fast*sale_orders không có cột group, group theo carrier_name *(2026-06-03)\_
- `7c95a42d3` feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast*sale_orders (web2Db) group theo nhóm+NVC, bỏ /api/v2/delivery-assignments *(2026-06-03)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-195615-cdfe1e0` cho Claude walk chain theo CLAUDE.md protocol.
