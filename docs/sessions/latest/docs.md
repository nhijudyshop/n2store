# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-180756-e97e215`
**Session file**: [`./20260615-180756-e97e215.md`](../20260615-180756-e97e215.md)
**Commit**: `e97e215` — feat(web2/shared): Web2PancakeTags — module dùng chung tag hội thoại Pancake + hiện tag trên chat
**Last updated**: 2026-06-15 18:07:56 +07
**Summary**: feat(web2/shared): Web2PancakeTags — module dùng chung tag hội thoại Pancake + hiện tag trên chat

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `e97e21599` feat(web2/shared): Web2PancakeTags — module dùng chung tag hội thoại Pancake + hiện tag trên chat _(2026-06-15)_
- `5646435dd` feat(web2/jt-tracking): tag toggle 2-chiều + custom confirm gỡ + nút chat mọi row + highlight tin có mã giữ lại _(2026-06-15)_
- `7c635e51b` feat(live-chat): badge 'comment' hiển thị tổng comment THẬT từ Pancake (comment*count) *(2026-06-15)\_
- `29ec06231` chore(session): RESUME:20260615-175717-dac5e66 _(2026-06-15)_
- `b106fce55` feat(web2/customer-chat): bấm SĐT header drawer để copy (.w2cc-phone + _copyPhone); bump launcher v=20260615c _(2026-06-15)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-180756-e97e215` cho Claude walk chain theo CLAUDE.md protocol.
