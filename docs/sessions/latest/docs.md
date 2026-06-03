# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-162445-7305973`
**Session file**: [`./20260603-162445-7305973.md`](../20260603-162445-7305973.md)
**Commit**: `7305973` — docs(web2): chốt quyết định tách DB (wipe OK, bỏ Phase 3) + tiến độ + inventory cutover route
**Last updated**: 2026-06-03 16:24:45 +07
**Summary**: docs(web2): chốt quyết định tách DB (wipe OK, bỏ Phase 3) + tiến độ + inventory cutover route

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/DB-SEPARATION-PLAN.md`

## Last 5 commits touching `docs/`

- `7305973d5` docs(web2): chốt quyết định tách DB (wipe OK, bỏ Phase 3) + tiến độ + inventory cutover route _(2026-06-03)_
- `050f29fcc` feat(web2): Phase 1 tách DB — web2*customers (kho KH riêng web2Db) thay /api/v2/customers Web 1.0 *(2026-06-03)\_
- `a216ac7b3` chore(session): RESUME:20260603-161807-3e40337 _(2026-06-03)_
- `3e40337ef` feat(inventory-tracking): cây bút chỉnh sửa cho cột Đơn giá _(2026-06-03)_
- `117833f8a` docs(dev-log): so-order mã SP rule + hiển thị mã/SL + nút nhận hàng NCC + NCC=KHO _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-162445-7305973` cho Claude walk chain theo CLAUDE.md protocol.
