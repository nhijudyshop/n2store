# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-020852-a7eef5b`
**Session file**: [`./20260623-020852-a7eef5b.md`](../20260623-020852-a7eef5b.md)
**Commit**: `a7eef5b` — fix(web2) customer-orders: ẩn Đơn Web đã convert sang PBH (hết trùng dòng + double-count)
**Last updated**: 2026-06-23 02:08:52 +07
**Summary**: fix(web2) customer-orders: ẩn Đơn Web đã convert sang PBH (hết trùng dòng + double-count)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a7eef5b1e` fix(web2) customer-orders: ẩn Đơn Web đã convert sang PBH (hết trùng dòng + double-count) _(2026-06-23)_
- `e6fed0813` chore(session): RESUME:20260623-014742-4be494a _(2026-06-23)_
- `4be494aaf` fix(web2): bỏ Reset STT + fix khe hở 8px thanh menu (32 trang) + gỡ chữ TPOS + chặn tạo PBH tay _(2026-06-23)_
- `22ad55c06` chore(session): RESUME:20260623-005037-c0681a9 _(2026-06-23)_
- `c0681a9df` chore(web2): xoá trang product-category (Nhóm sản phẩm) + khôi phục Kho Biến Thể (108) _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-020852-a7eef5b` cho Claude walk chain theo CLAUDE.md protocol.
