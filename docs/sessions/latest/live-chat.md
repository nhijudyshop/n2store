# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-155000-246e234`
**Session file**: [`./20260615-155000-246e234.md`](../20260615-155000-246e234.md)
**Commit**: `246e234` — docs(dev-log): fix native-orders 404 path + add-alt-phone 401 token
**Last updated**: 2026-06-15 15:50:00 +07
**Summary**: docs(dev-log): fix native-orders 404 path + add-alt-phone 401 token

## Files changed in this commit (`live-chat/`)

- `live-chat/comments-mobile.html`
- `live-chat/index.html`
- `live-chat/js/live/live-init.js`

## Last 5 commits touching `live-chat/`

- `14f095d7d` fix(live-chat): native-orders list path /load (mobile 404) + add-alt-phone gửi x-web2-token (desktop 401) _(2026-06-15)_
- `55c732580` auto: session update _(2026-06-15)_
- `99d2cb8ca` feat(live-chat/mobile): sync đơn native-orders realtime + STT badge _(2026-06-15)_
- `0b5ace1d7` refactor(live-chat/mobile): bỏ thumbnail trên comments-mobile (user) _(2026-06-15)_
- `8eb4ee988` fix(live-chat): comment dài hiện đủ — bỏ -webkit-line-clamp:3 (cắt '...') ở mobile _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-155000-246e234` cho Claude walk chain theo CLAUDE.md protocol.
