# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-152138-2a5b8e4`
**Session file**: [`./20260616-152138-2a5b8e4.md`](../20260616-152138-2a5b8e4.md)
**Commit**: `2a5b8e4` — fix(so-order): modal Tạo Đơn Hàng — đồng bộ bố cục form (label height + ảnh hóa đơn compact 40px + cột đều) + làm đẹp table (tabular-nums, header slate-50, row hover)
**Last updated**: 2026-06-16 15:21:38 +07
**Summary**: fix(so-order): modal Tạo Đơn Hàng — đồng bộ bố cục form (label height + ảnh hóa đơn compact 40px...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2a5b8e4ab` fix(so-order): modal Tạo Đơn Hàng — đồng bộ bố cục form (label height + ảnh hóa đơn compact 40px + cột đều) + làm đẹp table (tabular-nums, header slate-50, row hover) _(2026-06-16)_
- `0ed2164f5` chore(session): RESUME:20260616-151205-887c0cc _(2026-06-16)_
- `887c0cc85` fix(orders-report): sai múi giờ strip "Khách chưa trả lời" — khách mới nhắn báo trễ 7h _(2026-06-16)_
- `c9d19a25f` fix(supplier-wallet): nút Tạo NCC/Đồng bộ/Trả hàng/Ghi thanh toán thiếu class `btn` base → render như nút browser mặc định _(2026-06-16)_
- `b51ad392d` chore(session): RESUME:20260616-150759-eade698 _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-152138-2a5b8e4` cho Claude walk chain theo CLAUDE.md protocol.
