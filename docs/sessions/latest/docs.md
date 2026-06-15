# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-114844-b33d74d`
**Session file**: [`./20260615-114844-b33d74d.md`](../20260615-114844-b33d74d.md)
**Commit**: `b33d74d` — fix(web2-jt): composer chat drawer mất (wz-chat-body thiếu flex/scroll) + nén dashboard gọn
**Last updated**: 2026-06-15 11:48:44 +07
**Summary**: fix(web2-jt): composer chat drawer mất (wz-chat-body thiếu flex/scroll) + nén dashboard gọn

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `b8c166071` feat(live-chat): WS-direct comment livestream (bỏ poll, nhanh ~TPOS) + render append-only đúng invariant _(2026-06-15)_
- `29a047518` chore(session): RESUME:20260615-113951-d9e8857 _(2026-06-15)_
- `d9e8857d3` docs(dev-log): J&T follow-up — KPI Đã duyệt + fix input + fix chat drawer text dọc _(2026-06-15)_
- `3ab480332` feat(web2-jt): fix scroll/sidebar + mở chat nhóm Zalo từ row + @mention xanh _(2026-06-15)_
- `ddfeee924` chore(session): RESUME:20260615-110838-5ffd478 _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-114844-b33d74d` cho Claude walk chain theo CLAUDE.md protocol.
