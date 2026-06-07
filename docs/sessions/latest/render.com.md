# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-161507-190b7fa`
**Session file**: [`./20260607-161507-190b7fa.md`](../20260607-161507-190b7fa.md)
**Commit**: `190b7fa` — feat(web2): Phase 1 — gộp kho KH thành 1 warehouse web2_customers (bỏ TPOS) + CRUD route + SSE + dọn dead migrate
**Last updated**: 2026-06-07 16:15:07 +07
**Summary**: feat(web2): Phase 1 — gộp kho KH thành 1 warehouse web2_customers (bỏ TPOS) + CRUD route + SSE + dọn dead mi...

## Files changed in this commit (`render.com/`)

- `render.com/db/web2-order-customers-migrate.js`
- `render.com/routes/admin-web2-data-reset.js`
- `render.com/routes/v2/web2-customer-tpos.js`
- `render.com/routes/v2/web2-customers.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `190b7fa91` feat(web2): Phase 1 — gộp kho KH thành 1 warehouse web2*customers (bỏ TPOS) + CRUD route + SSE + dọn dead migrate *(2026-06-07)\_
- `30b61846c` auto: session update _(2026-06-07)_
- `fbb5117e7` auto: session update _(2026-06-07)_
- `37bdc6f1e` feat(admin): web2-cleanup-dead — drop _*bak*_ tables + xóa web2*records orphan deliveryzone/printer + GET web2-tables *(2026-06-07)\_
- `e4e9c1e10` feat(web2): Phase 0 — deliveryzone + printer sang bảng riêng (web2*delivery_zones/web2_printers), auto-migrate từ web2_records, shape/path giữ nguyên *(2026-06-07)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-161507-190b7fa` cho Claude walk chain theo CLAUDE.md protocol.
