# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-160137-3090aec`
**Session file**: [`./20260616-160137-3090aec.md`](../20260616-160137-3090aec.md)
**Commit**: `3090aec` — auto: session update
**Last updated**: 2026-06-16 16:01:37 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `d9c0609e4` fix(so-order): nền bảng xen kẽ theo NHÓM NCC/đơn (parity class JS) thay zebra :nth-child lệch nhóm — tăng tương phản đọc từng khối _(2026-06-16)_
- `a56d9d55c` fix(render): pending*customers sai múi giờ -7h — server emit ISO-UTC (strip báo trễ 7h) *(2026-06-16)\_
- `92f6a6d75` chore(session): RESUME:20260616-155224-f014397 _(2026-06-16)_
- `2111be18d` fix(supplier-wallet): số liệu NCC về 0₫ sau load — post-Sync render đè 0 (ledger ko có totalPurchased, phải re-aggregate Sổ Order) + debug logs SW-DEBUG _(2026-06-16)_
- `d2129aa73` chore(session): RESUME:20260616-153139-6732b8b _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-160137-3090aec` cho Claude walk chain theo CLAUDE.md protocol.
