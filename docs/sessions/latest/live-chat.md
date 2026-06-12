# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260612-181204-e7b76e1`
**Session file**: [`./20260612-181204-e7b76e1.md`](../20260612-181204-e7b76e1.md)
**Commit**: `e7b76e1` — docs(web2): đánh dấu đợt H ✅ hoàn tất (276a64355 + cf11709bb)
**Last updated**: 2026-06-12 18:12:04 +07
**Summary**: docs(web2): đánh dấu đợt H ✅ hoàn tất (276a64355 + cf11709bb)

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-livestream-snap.js`
- `live-chat/server/server.js`

## Last 5 commits touching `live-chat/`

- `cf11709bb` fix(web2): đợt H phần còn lại — 3H9 + 3H8/events + LC-pollnow-auth + 3H15 _(2026-06-12)_
- `a30ac7d94` fix(live-chat): guard delta since=0 dump + cap 50 emit live:newComment (chống auto-snap burst gán frame hiện tại cho comment cũ) _(2026-06-12)_
- `276a64355` fix(live-chat): đợt H — realtime mất tin nhắn (cursor updated*at + merge-by-id), drag-drop 500 (crm_team_id BIGINT), auto-snap 3H6, lọc người-ẩn 3H7, live-saved 3H8, gallery che topbar *(2026-06-12)\_
- `490b432e6` auto: session update _(2026-06-11)_
- `840d7c938` fix(live-chat): Force extract — staff-check sót page khác (830 cmt), resolve sai video khi 2 live cùng page, extract cả người ẩn _(2026-06-11)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260612-181204-e7b76e1` cho Claude walk chain theo CLAUDE.md protocol.
