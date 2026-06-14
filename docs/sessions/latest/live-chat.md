# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-151841-7f0f8d0`
**Session file**: [`./20260614-151841-7f0f8d0.md`](../20260614-151841-7f0f8d0.md)
**Commit**: `7f0f8d0` — docs(render): ghi lại tách web2-api (Web1⊥Web2 service split) — dev-log + RENDER_SERVERS_GUIDE
**Last updated**: 2026-06-14 15:18:41 +07
**Summary**: docs(render): ghi lại tách web2-api (Web1⊥Web2 service split) — dev-log + RENDER_SERVERS_GUIDE

## Files changed in this commit (`live-chat/`)

- `live-chat/js/live/comments-mobile.js`
- `live-chat/js/live/live-livestream-gallery.js`
- `live-chat/js/live/live-livestream-snap.js`
- `live-chat/server/server.js`

## Last 5 commits touching `live-chat/`

- `805a08866` fix(web2-split): route delivery-invoices/refunds to web2-api + repoint hardcoded web2→fallback URLs _(2026-06-14)_
- `29088d08a` feat(live-chat): shared realtime comment module — append-only + self-tick time + địa chỉ desktop _(2026-06-14)_
- `6bc4423ea` auto: session update _(2026-06-14)_
- `08ec99809` auto: session update _(2026-06-14)_
- `d234f8e8e` feat(web2-realtime): gộp FB Graph API vào relay (chuẩn bị consolidate sang web2-realtime) _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-151841-7f0f8d0` cho Claude walk chain theo CLAUDE.md protocol.
