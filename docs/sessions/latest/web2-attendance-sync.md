# Latest Snapshot — `web2-attendance-sync/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-135859-4b7acfc`
**Session file**: [`./20260623-135859-4b7acfc.md`](../20260623-135859-4b7acfc.md)
**Commit**: `4b7acfc` — feat(web2-attendance-sync): tự dò IP máy chấm công trên LAN (khỏi nhập IP) + FAQ nhiều máy chạy bat
**Last updated**: 2026-06-23 13:58:59 +07
**Summary**: Agent tự dò IP máy chấm công LAN + FAQ nhiều máy chạy bat (idempotent an toàn, nên 1 PC)

## Files changed in this commit (`web2-attendance-sync/`)

- `web2-attendance-sync/README.md`

## Last 5 commits touching `web2-attendance-sync/`

- `4b7acfc69` feat(web2-attendance-sync): tự dò IP máy chấm công trên LAN (khỏi nhập IP) + FAQ nhiều máy chạy bat _(2026-06-23)_
- `c106ad946` auto: session update _(2026-06-23)_
- `f6980786e` docs(web2-attendance-sync): bat chạy ZK pull (chế độ đã test) + tự npm install; README ưu tiên ZK pull _(2026-06-23)_
- `cb99fd56c` auto: session update _(2026-06-23)_
- `a47424f02` feat(web2-admin): Người dùng vào group Quản trị viên + bỏ badge số group + smart cache IndexedDB cho Chấm công _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-135859-4b7acfc` cho Claude walk chain theo CLAUDE.md protocol.
