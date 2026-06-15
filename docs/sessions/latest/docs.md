# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-154753-55c7325`
**Session file**: [`./20260615-154753-55c7325.md`](../20260615-154753-55c7325.md)
**Commit**: `55c7325` — auto: session update
**Last updated**: 2026-06-15 15:47:53 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `e19f7c7f3` feat(web2/jt-tracking): nút 'Quét lịch sử' — đọc lịch sử nhóm Zalo (zca) quét đơn cũ/thiếu _(2026-06-15)_
- `f94f4d651` chore(session): RESUME:20260615-153550-7974959 _(2026-06-15)_
- `7974959b4` feat(web2): Zalo chat-by-phone (chưa nhắn vẫn chat) + auto-scroll + nút tag đổi trạng thái _(2026-06-15)_
- `99d2cb8ca` feat(live-chat/mobile): sync đơn native-orders realtime + STT badge _(2026-06-15)_
- `294ef47da` chore(session): RESUME:20260615-151943-8b03ba9 _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-154753-55c7325` cho Claude walk chain theo CLAUDE.md protocol.
