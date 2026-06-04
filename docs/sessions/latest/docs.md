# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-121645-8a62794`
**Session file**: [`./20260604-121645-8a62794.md`](../20260604-121645-8a62794.md)
**Commit**: `8a62794` — auto: session update
**Last updated**: 2026-06-04 12:16:45 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `386ed6c18` feat: soluong-live khớp ảnh product-warehouse (TPOS-direct) + khôi phục dropdown tìm kiếm _(2026-06-04)_
- `f2b11ccb5` chore(session): RESUME:20260604-121033-07d0dfe _(2026-06-04)_
- `484af0fa2` feat(web2): supplier-debt khop So Order (debt = cost tung NCC) _(2026-06-04)_
- `7a0d67355` chore(session): RESUME:20260604-120443-bbea5fb _(2026-06-04)_
- `bbea5fb07` fix(soluong-live): biến thể không có ảnh riêng lấy ảnh sản phẩm (template) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-121645-8a62794` cho Claude walk chain theo CLAUDE.md protocol.
