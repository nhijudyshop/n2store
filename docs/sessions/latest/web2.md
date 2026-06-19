# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-200705-30071c0`
**Session file**: [`./20260619-200705-30071c0.md`](../20260619-200705-30071c0.md)
**Commit**: `30071c0` — feat(web2/fb-posts): xem nguyên bài như trên Facebook (popup) — đủ ảnh + nội dung + tương tác + bình luận
**Last updated**: 2026-06-19 20:07:05 +07
**Summary**: feat(web2/fb-posts): xem nguyên bài như trên Facebook (popup) — đủ ảnh + nội dung + tương tác + bình...

## Files changed in this commit (`web2/`)

- `web2/fb-posts/js/fb-posts-api.js`
- `web2/fb-posts/js/fb-posts-list.js`

## Last 5 commits touching `web2/`

- `30071c024` feat(web2/fb-posts): xem nguyên bài như trên Facebook (popup) — đủ ảnh + nội dung + tương tác + bình luận _(2026-06-19)_
- `cf83133e0` fix(web2/fb-posts): /list bỏ field đếm tương tác (likes/comments/shares.summary) gây lỗi #10 _(2026-06-19)_
- `b136bef7c` feat(web2/zalo): 'Đăng nhập Zalo' 1-click bằng phiên chat.zalo.me (extension cookie+imei) + auto-renew + guard danh tính _(2026-06-19)_
- `a4201105a` auto: session update _(2026-06-19)_
- `143222cb7` fix(web2/fb-posts): an toàn chính sách FB — bỏ engagement-bait/clickbait, cảnh báo bản quyền media, hashtag≤6, giãn nhịp đăng + xử lý rate-limit _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-200705-30071c0` cho Claude walk chain theo CLAUDE.md protocol.
