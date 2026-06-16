# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-155224-f014397`
**Session file**: [`./20260616-155224-f014397.md`](../20260616-155224-f014397.md)
**Commit**: `f014397` — auto: session update
**Last updated**: 2026-06-16 15:52:24 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2111be18d` fix(supplier-wallet): số liệu NCC về 0₫ sau load — post-Sync render đè 0 (ledger ko có totalPurchased, phải re-aggregate Sổ Order) + debug logs SW-DEBUG _(2026-06-16)_
- `d2129aa73` chore(session): RESUME:20260616-153139-6732b8b _(2026-06-16)_
- `6732b8be0` fix(so-order): checkbox 'Hiện thông tin lô' (Cài đặt tab) không hiện state checked — .so-field input{appearance:none} nuốt checkmark, vẽ custom checked/indeterminate _(2026-06-16)_
- `62bef1d9b` chore(session): RESUME:20260616-153109-716992f _(2026-06-16)_
- `716992f5f` feat(web2/supplier-wallet): bỏ nút Đồng bộ → realtime tự động (thêm SSE web2:so-order) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-155224-f014397` cho Claude walk chain theo CLAUDE.md protocol.
