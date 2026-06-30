# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-145550-5081f02`
**Session file**: [`./20260630-145550-5081f02.md`](../20260630-145550-5081f02.md)
**Commit**: `5081f02` — refactor(shared): gỡ compat ncc/vuot khỏi khConModel/cardState (không consumer nào đọc) [sau #2]
**Last updated**: 2026-06-30 14:55:50 +07
**Summary**: refactor(shared): gỡ compat ncc/vuot khỏi khConModel/cardState (không consumer nào đọc) [sau #2]

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `5081f02ae` refactor(shared): gỡ compat ncc/vuot khỏi khConModel/cardState (không consumer nào đọc) [sau #2] _(2026-06-30)_
- `2eea324fd` chore(session): RESUME:20260630-145032-7d5d7b2 _(2026-06-30)_
- `7d5d7b24e` feat(so-order): surface 'chờ hàng cần đặt' (giỏ nháp > tồn) → nút Cần đặt + thêm vào đơn [#2 follow-up] _(2026-06-30)_
- `bd0cf91aa` chore(session): RESUME:20260630-144114-b8f2673 _(2026-06-30)_
- `b8f267330` feat(live-control): bỏ NCC gõ tay → 'Chờ hàng' = GIỎ−TỒN (tự suy, board TỒN·GIỎ·MỚI·CHỜ; bỏ selector cho-vượt) [#2] _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-145550-5081f02` cho Claude walk chain theo CLAUDE.md protocol.
