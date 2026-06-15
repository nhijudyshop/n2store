# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-191814-ffa5d60`
**Session file**: [`./20260615-191814-ffa5d60.md`](../20260615-191814-ffa5d60.md)
**Commit**: `ffa5d60` — fix(web2-jt): highlight tin chat cuộn tới đúng + ring rõ trên bong bóng
**Last updated**: 2026-06-15 19:18:14 +07
**Summary**: fix(web2-jt): highlight tin chat cuộn tới đúng + ring rõ trên bong bóng

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `ffa5d6038` fix(web2-jt): highlight tin chat cuộn tới đúng + ring rõ trên bong bóng _(2026-06-15)_
- `b815f415a` chore(session): RESUME:20260615-191728-dea0ee5 _(2026-06-15)_
- `dea0ee5c5` feat(live-chat/mobile): bỏ nút Gọi/Mở FB ở sheet + highlight comment mới 3s _(2026-06-15)_
- `febc52b66` chore(session): RESUME:20260615-191450-b5f2604 _(2026-06-15)_
- `b5f26045a` feat(live-chat/mobile): mặc định mode ĐANG LIVE (gộp bài đang live) thay vì Tất cả _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-191814-ffa5d60` cho Claude walk chain theo CLAUDE.md protocol.
