# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-020852-a7eef5b`
**Session file**: [`./20260623-020852-a7eef5b.md`](../20260623-020852-a7eef5b.md)
**Commit**: `a7eef5b` — fix(web2) customer-orders: ẩn Đơn Web đã convert sang PBH (hết trùng dòng + double-count)
**Last updated**: 2026-06-23 02:08:52 +07
**Summary**: fix(web2) customer-orders: ẩn Đơn Web đã convert sang PBH (hết trùng dòng + double-count)

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/web2-customer-orders.js`

## Last 5 commits touching `render.com/`

- `a7eef5b1e` fix(web2) customer-orders: ẩn Đơn Web đã convert sang PBH (hết trùng dòng + double-count) _(2026-06-23)_
- `4be494aaf` fix(web2): bỏ Reset STT + fix khe hở 8px thanh menu (32 trang) + gỡ chữ TPOS + chặn tạo PBH tay _(2026-06-23)_
- `d5d79eb9a` feat(web2-audit): Wave 2 backend — 9 routes → event-sink + entityId purge + entity labels _(2026-06-23)_
- `6587a8f3a` feat(web2-audit): wire variants + users routes vào event-sink (per-record history) _(2026-06-22)_
- `1cc23853f` feat(web2-audit-log): per-record history (openRecord modal) + reference native-orders/so-order _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-020852-a7eef5b` cho Claude walk chain theo CLAUDE.md protocol.
