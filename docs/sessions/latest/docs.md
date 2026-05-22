# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-123541-7ca8b09`
**Session file**: [`./20260522-123541-7ca8b09.md`](../20260522-123541-7ca8b09.md)
**Commit**: `7ca8b09` — fix(inventory/dot-tabs): order ASC (Đợt 1, 2, 3, ...) + wire render in flattenNCCData
**Last updated**: 2026-05-22 12:35:41 +07
**Summary**: fix(inventory/dot-tabs): order ASC (Đợt 1, 2, 3, ...) + wire render in flattenNCCData

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `66595d417` fix(balance-history): Live Mode Xác nhận đẩy GD qua Kế Toán Chờ Duyệt _(2026-05-22)_
- `b414f3a9f` chore(session): RESUME:20260522-114648-37f177d _(2026-05-22)_
- `37f177d35` feat(inventory): đợt section tabs + stats theo tab + audit logging _(2026-05-22)_
- `28ba2460f` feat(web2): hiện thực 12 features Future Development (Sprint 0 + F01-F12) _(2026-05-22)_
- `fb232dae1` docs(dev-log): record renderProvinceView NAP-column fix + browser test results _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-123541-7ca8b09` cho Claude walk chain theo CLAUDE.md protocol.
