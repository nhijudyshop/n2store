# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-153109-716992f`
**Session file**: [`./20260616-153109-716992f.md`](../20260616-153109-716992f.md)
**Commit**: `716992f` — feat(web2/supplier-wallet): bỏ nút Đồng bộ → realtime tự động (thêm SSE web2:so-order)
**Last updated**: 2026-06-16 15:31:09 +07
**Summary**: feat(web2/supplier-wallet): bỏ nút Đồng bộ → realtime tự động (thêm SSE web2:so-order)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `716992f5f` feat(web2/supplier-wallet): bỏ nút Đồng bộ → realtime tự động (thêm SSE web2:so-order) _(2026-06-16)_
- `29dfac5c2` chore(session): RESUME:20260616-152138-2a5b8e4 _(2026-06-16)_
- `2a5b8e4ab` fix(so-order): modal Tạo Đơn Hàng — đồng bộ bố cục form (label height + ảnh hóa đơn compact 40px + cột đều) + làm đẹp table (tabular-nums, header slate-50, row hover) _(2026-06-16)_
- `0ed2164f5` chore(session): RESUME:20260616-151205-887c0cc _(2026-06-16)_
- `887c0cc85` fix(orders-report): sai múi giờ strip "Khách chưa trả lời" — khách mới nhắn báo trễ 7h _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-153109-716992f` cho Claude walk chain theo CLAUDE.md protocol.
