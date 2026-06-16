# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-170353-d6df92a`
**Session file**: [`./20260616-170353-d6df92a.md`](../20260616-170353-d6df92a.md)
**Commit**: `d6df92a` — feat(so-order): nhóm NCC 'Đã nhận' dồn xuống cuối lô (render-only, giữ rowspan + pending lên trên)
**Last updated**: 2026-06-16 17:03:53 +07
**Summary**: feat(so-order): nhóm NCC 'Đã nhận' dồn xuống cuối lô (render-only, giữ rowspan + pending lên trên)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `d6df92a4e` feat(so-order): nhóm NCC 'Đã nhận' dồn xuống cuối lô (render-only, giữ rowspan + pending lên trên) _(2026-06-16)_
- `3b0eac023` fix(orders-report): khung chat bắt nhầm hội thoại Pancake khi SĐT trùng nhiều người _(2026-06-16)_
- `ae0c8a886` chore(session): RESUME:20260616-165359-059ee22 _(2026-06-16)_
- `059ee228b` docs(dev-log): Part B (Kho SP origin hover) deployed + verified end-to-end _(2026-06-16)_
- `3d6de3500` chore(session): RESUME:20260616-164338-ef4fba2 _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-170353-d6df92a` cho Claude walk chain theo CLAUDE.md protocol.
