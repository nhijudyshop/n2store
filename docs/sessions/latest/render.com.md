# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-195258-fdc2ef7`
**Session file**: [`./20260619-195258-fdc2ef7.md`](../20260619-195258-fdc2ef7.md)
**Commit**: `fdc2ef7` — docs(dev-log): web2/fb-posts kết nối FB live + 2 gotcha Graph (use case pages_manage_posts, /list #10)
**Last updated**: 2026-06-19 19:52:58 +07
**Summary**: docs(dev-log): web2/fb-posts kết nối FB live + 2 gotcha Graph (use case pages_manage_posts, /list #10)

## Files changed in this commit (`render.com/`)

- `render.com/services/web2-fb-graph-service.js`

## Last 5 commits touching `render.com/`

- `cf83133e0` fix(web2/fb-posts): /list bỏ field đếm tương tác (likes/comments/shares.summary) gây lỗi #10 _(2026-06-19)_
- `b136bef7c` feat(web2/zalo): 'Đăng nhập Zalo' 1-click bằng phiên chat.zalo.me (extension cookie+imei) + auto-renew + guard danh tính _(2026-06-19)_
- `a4201105a` auto: session update _(2026-06-19)_
- `077e15168` fix(web2/fb-posts): least-privilege scope OAuth — bỏ pages*manage_engagement (không dùng), giữ 3 quyền Standard Access *(2026-06-19)\_
- `0ce7129ed` fix(web2/fb-posts): trả aiAvailable cả khi chưa kết nối → nút 'AI viết lại' không bị disable sớm _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-195258-fdc2ef7` cho Claude walk chain theo CLAUDE.md protocol.
