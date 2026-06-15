# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-153550-7974959`
**Session file**: [`./20260615-153550-7974959.md`](../20260615-153550-7974959.md)
**Commit**: `7974959` — feat(web2): Zalo chat-by-phone (chưa nhắn vẫn chat) + auto-scroll + nút tag đổi trạng thái
**Last updated**: 2026-06-15 15:35:50 +07
**Summary**: feat(web2): Zalo chat-by-phone (chưa nhắn vẫn chat) + auto-scroll + nút tag đổi trạng thái

## Files changed in this commit (`live-chat/`)

- `live-chat/comments-mobile.html`
- `live-chat/js/live/comments-mobile.js`

## Last 5 commits touching `live-chat/`

- `99d2cb8ca` feat(live-chat/mobile): sync đơn native-orders realtime + STT badge _(2026-06-15)_
- `0b5ace1d7` refactor(live-chat/mobile): bỏ thumbnail trên comments-mobile (user) _(2026-06-15)_
- `8eb4ee988` fix(live-chat): comment dài hiện đủ — bỏ -webkit-line-clamp:3 (cắt '...') ở mobile _(2026-06-15)_
- `f27939cfc` feat(live-chat/desktop): topbar badge số đơn (🛒 N) trong livestream đang chọn _(2026-06-15)_
- `b463110b9` feat(live-chat/mobile): chip Store/House hiện số đơn đã tạo + nút toàn màn hình (F11) _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-153550-7974959` cho Claude walk chain theo CLAUDE.md protocol.
