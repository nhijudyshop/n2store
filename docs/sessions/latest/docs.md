# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-184415-2afef5f`
**Session file**: [`./20260521-184415-2afef5f.md`](../20260521-184415-2afef5f.md)
**Commit**: `2afef5f` — feat(web2): SSE realtime cho products + PBH page (không cần F5)
**Last updated**: 2026-05-21 18:44:15 +07
**Summary**: feat(web2): SSE realtime cho products + PBH page (không cần F5)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2afef5fd` feat(web2): SSE realtime cho products + PBH page (không cần F5) _(2026-05-21)_
- `5d7e0b19` chore(session): RESUME:20260521-183159-94483db _(2026-05-21)_
- `94483dba` feat(native-orders): bỏ splitPbh ở confirmed, mở splitOrder ra confirmed _(2026-05-21)_
- `f272f887` chore(session): RESUME:20260521-182852-b31cc8d _(2026-05-21)_
- `b31cc8db` feat(native-orders): đơn cancelled vẫn cho tạo PBH (số HĐ mới) _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-184415-2afef5f` cho Claude walk chain theo CLAUDE.md protocol.
