# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-123907-fadcac9`
**Session file**: [`./20260623-123907-fadcac9.md`](../20260623-123907-fadcac9.md)
**Commit**: `fadcac9` — feat(web2-admin): group Quản trị viên (admin-only) + Chấm công DG-600 + Quản lý chi tiêu
**Last updated**: 2026-06-23 12:39:07 +07
**Summary**: Group Quản trị viên admin-only + Chấm công DG-600 + Quản lý chi tiêu (Sổ quỹ) — module Web 2.0 riêng

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `fadcac906` feat(web2-admin): group Quản trị viên (admin-only) + Chấm công DG-600 + Quản lý chi tiêu _(2026-06-23)_
- `7869236f5` chore(session): RESUME:20260623-113734-7e5db29 _(2026-06-23)_
- `7e5db2972` docs(dev-log): quick-refund cost-cap sync verified live (đóng nốt #2 trên cả 2 đường hoàn NCC) _(2026-06-23)_
- `5ce8415ca` chore(session): RESUME:20260623-105516-e2d9dce _(2026-06-23)_
- `e2d9dce45` docs(dev-log): browser-test fix over-restock partial + /tx ledger-mint (#2) — both verified live _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-123907-fadcac9` cho Claude walk chain theo CLAUDE.md protocol.
