# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-183819-612882d`
**Session file**: [`./20260627-183819-612882d.md`](../20260627-183819-612882d.md)
**Commit**: `612882d` — fix(live-chat): picker chiến dịch cha hiện đúng bài đã gom cho live cũ
**Last updated**: 2026-06-27 18:38:19 +07
**Summary**: fix live-chat picker chiến dịch cha: live cũ hiện đúng bài đã gom (assignMap từ web2_live_post_assign)

## Files changed in this commit (`web2/`)

- `web2/live-control/index.html`
- `web2/live-tv/index.html`
- `web2/shared/web2-campaign.js`

## Last 5 commits touching `web2/`

- `612882daf` fix(live-chat): picker chiến dịch cha hiện đúng bài đã gom cho live cũ _(2026-06-27)_
- `0c8b6c290` fix(web2/live-control): avatar giỏ khách qua worker fb-avatar (id+page) như live-chat _(2026-06-27)_
- `0dec518d1` feat(web2/live-control): popup giỏ khách thêm avatar + comment livestream (như live-chat) _(2026-06-27)_
- `664f08956` feat(web2/live-control): bấm GIỎ/KH MỚI ở board → popup chi tiết giỏ khách _(2026-06-27)_
- `ffe6b62eb` fix(web2/live-control): đổi chỗ banner hint ↔ panel điều khiển TV (panel lên trên, hint xuống dưới) _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-183819-612882d` cho Claude walk chain theo CLAUDE.md protocol.
