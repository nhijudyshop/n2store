# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-201530-2c552d6`
**Session file**: [`./20260619-201530-2c552d6.md`](../20260619-201530-2c552d6.md)
**Commit**: `2c552d6` — fix(web2/fb-posts): tab Bài viết — sửa khoá scroll (thêm class web2-main) + cuộn tải thêm bài (infinite scroll cursor)
**Last updated**: 2026-06-19 20:15:30 +07
**Summary**: fix(web2/fb-posts): tab Bài viết — sửa khoá scroll (thêm class web2-main) + cuộn tải thêm bài (infinit...

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-fb-posts.js`
- `render.com/services/web2-fb-graph-service.js`

## Last 5 commits touching `render.com/`

- `2c552d62e` fix(web2/fb-posts): tab Bài viết — sửa khoá scroll (thêm class web2-main) + cuộn tải thêm bài (infinite scroll cursor) _(2026-06-19)_
- `30071c024` feat(web2/fb-posts): xem nguyên bài như trên Facebook (popup) — đủ ảnh + nội dung + tương tác + bình luận _(2026-06-19)_
- `cf83133e0` fix(web2/fb-posts): /list bỏ field đếm tương tác (likes/comments/shares.summary) gây lỗi #10 _(2026-06-19)_
- `b136bef7c` feat(web2/zalo): 'Đăng nhập Zalo' 1-click bằng phiên chat.zalo.me (extension cookie+imei) + auto-renew + guard danh tính _(2026-06-19)_
- `a4201105a` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-201530-2c552d6` cho Claude walk chain theo CLAUDE.md protocol.
