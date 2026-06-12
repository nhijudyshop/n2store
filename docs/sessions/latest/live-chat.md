# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260612-195545-59738a0`
**Session file**: [`./20260612-195545-59738a0.md`](../20260612-195545-59738a0.md)
**Commit**: `59738a0` — auto: session update
**Last updated**: 2026-06-12 19:55:45 +07
**Summary**: auto: session update

## Files changed in this commit (`live-chat/`)

- `live-chat/chat.html`
- `live-chat/index.html`
- `live-chat/js/live/live-api.js`
- `live-chat/js/live/live-campaign-manager.js`
- `live-chat/js/live/live-init.js`
- `live-chat/js/live/live-livestream-snap.js`
- `live-chat/js/pancake/pancake-api.js`

## Last 5 commits touching `live-chat/`

- `59738a0e1` auto: session update _(2026-06-12)_
- `7bb139d21` auto: session update _(2026-06-12)_
- `c719b9de4` refactor(web2): gỡ hẳn crm*team_id/crm_team_name — di tích TPOS (DROP COLUMN native_orders + fast_sale_orders, client ngừng gửi, getPartnerInfo bỏ tham số chết) *(2026-06-12)\_
- `cf11709bb` fix(web2): đợt H phần còn lại — 3H9 + 3H8/events + LC-pollnow-auth + 3H15 _(2026-06-12)_
- `a30ac7d94` fix(live-chat): guard delta since=0 dump + cap 50 emit live:newComment (chống auto-snap burst gán frame hiện tại cho comment cũ) _(2026-06-12)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260612-195545-59738a0` cho Claude walk chain theo CLAUDE.md protocol.
