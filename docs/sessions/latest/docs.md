# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-181656-b809897`
**Session file**: [`./20260615-181656-b809897.md`](../20260615-181656-b809897.md)
**Commit**: `b809897` — refactor(web2/shared): gộp tag Pancake vào Web2Chat (bỏ file web2-pancake-tags.js rời)
**Last updated**: 2026-06-15 18:16:56 +07
**Summary**: refactor(web2/shared): gộp tag Pancake vào Web2Chat (bỏ file web2-pancake-tags.js rời)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `b809897eb` refactor(web2/shared): gộp tag Pancake vào Web2Chat (bỏ file web2-pancake-tags.js rời) _(2026-06-15)_
- `ce5a24752` fix(web2/jt-tracking): findMessageInChat load-older 8x + toast rõ khi tin không có trong nhóm đã lưu (mã dán tay) _(2026-06-15)_
- `2e0815615` chore(session): RESUME:20260615-180756-e97e215 _(2026-06-15)_
- `e97e21599` feat(web2/shared): Web2PancakeTags — module dùng chung tag hội thoại Pancake + hiện tag trên chat _(2026-06-15)_
- `5646435dd` feat(web2/jt-tracking): tag toggle 2-chiều + custom confirm gỡ + nút chat mọi row + highlight tin có mã giữ lại _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-181656-b809897` cho Claude walk chain theo CLAUDE.md protocol.
