# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-153139-6732b8b`
**Session file**: [`./20260616-153139-6732b8b.md`](../20260616-153139-6732b8b.md)
**Commit**: `6732b8b` — fix(so-order): checkbox 'Hiện thông tin lô' (Cài đặt tab) không hiện state checked — .so-field input{appearance:none} nuốt checkmark, vẽ custom checked/indeterminate
**Last updated**: 2026-06-16 15:31:39 +07
**Summary**: fix(so-order): checkbox 'Hiện thông tin lô' (Cài đặt tab) không hiện state checked — .so-field input{app...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6732b8be0` fix(so-order): checkbox 'Hiện thông tin lô' (Cài đặt tab) không hiện state checked — .so-field input{appearance:none} nuốt checkmark, vẽ custom checked/indeterminate _(2026-06-16)_
- `62bef1d9b` chore(session): RESUME:20260616-153109-716992f _(2026-06-16)_
- `716992f5f` feat(web2/supplier-wallet): bỏ nút Đồng bộ → realtime tự động (thêm SSE web2:so-order) _(2026-06-16)_
- `29dfac5c2` chore(session): RESUME:20260616-152138-2a5b8e4 _(2026-06-16)_
- `2a5b8e4ab` fix(so-order): modal Tạo Đơn Hàng — đồng bộ bố cục form (label height + ảnh hóa đơn compact 40px + cột đều) + làm đẹp table (tabular-nums, header slate-50, row hover) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-153139-6732b8b` cho Claude walk chain theo CLAUDE.md protocol.
