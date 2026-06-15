# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-233756-debda8b`
**Session file**: [`./20260615-233756-debda8b.md`](../20260615-233756-debda8b.md)
**Commit**: `debda8b` — fix(web2): trỏ đúng project Render web2.0n2store — relay → web2-realtime, xóa pbh-realtime dead
**Last updated**: 2026-06-15 23:37:56 +07
**Summary**: fix(web2): trỏ đúng project Render web2.0n2store — relay → web2-realtime, xóa pbh-realtime dead

## Files changed in this commit (`web2/`)

- `web2/shared/pbh-realtime.js`
- `web2/shared/web2-realtime.js`

## Last 5 commits touching `web2/`

- `debda8b0a` fix(web2): trỏ đúng project Render web2.0n2store — relay → web2-realtime, xóa pbh-realtime dead _(2026-06-15)_
- `2a02bff32` refactor(web2): hợp nhất base-URL về 1 nguồn (web2-auth.js) + fix livestream 404 worker + ck-dashboard 401 _(2026-06-15)_
- `b5e2ad166` chore(web2): xóa sạch chữ TPOS trong comment/doc Web 2.0 (reword giữ nghĩa) _(2026-06-15)_
- `e2d9d87b2` chore(web2): TPOS triệt để — doc sửa (web2*customers KHÔNG có cột tpos), DROP safety-net, rename var *(2026-06-15)\_
- `15cd722a6` fix(web2/live-chat): SĐT bị fb*id ghi đè (normPhone slice) + health-monitor 404 spam + dọn TPOS leftover *(2026-06-15)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-233756-debda8b` cho Claude walk chain theo CLAUDE.md protocol.
