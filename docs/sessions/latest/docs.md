# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-184951-9e04a25`
**Session file**: [`./20260627-184951-9e04a25.md`](../20260627-184951-9e04a25.md)
**Commit**: `9e04a25` — auto: session update
**Last updated**: 2026-06-27 18:49:51 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `bf22aea71` fix(native-orders): picker + lọc chiến dịch cha dùng listAssignments() _(2026-06-27)_
- `2f968ff0a` chore(session): RESUME:20260627-183819-612882d _(2026-06-27)_
- `612882daf` fix(live-chat): picker chiến dịch cha hiện đúng bài đã gom cho live cũ _(2026-06-27)_
- `4c89ae396` chore(session): RESUME:20260627-181757-79af1c6 _(2026-06-27)_
- `79af1c640` docs(dev-log): avatar giỏ khách qua fb-avatar proxy (id+page) _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-184951-9e04a25` cho Claude walk chain theo CLAUDE.md protocol.
