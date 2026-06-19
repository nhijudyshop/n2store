# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-160010-b570dd1`
**Session file**: [`./20260619-160010-b570dd1.md`](../20260619-160010-b570dd1.md)
**Commit**: `b570dd1` — fix(web2/ai-script): mount route Web 2.0 CHỈ khi WEB2_SERVICE=1 (web2-api) — Web 1.0 (n2store-fallback) KHÔNG load, không bị ảnh hưởng
**Last updated**: 2026-06-19 16:00:10 +07
**Summary**: fix(web2/ai-script): mount route Web 2.0 CHỈ khi WEB2_SERVICE=1 (web2-api) — Web 1.0 (n2store-fallback) KHÔNG lo...

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-fb-posts.js`
- `render.com/server.js`
- `render.com/services/web2-caption-service.js`

## Last 5 commits touching `render.com/`

- `b570dd13b` fix(web2/ai-script): mount route Web 2.0 CHỈ khi WEB2*SERVICE=1 (web2-api) — Web 1.0 (n2store-fallback) KHÔNG load, không bị ảnh hưởng *(2026-06-19)\_
- `143222cb7` fix(web2/fb-posts): an toàn chính sách FB — bỏ engagement-bait/clickbait, cảnh báo bản quyền media, hashtag≤6, giãn nhịp đăng + xử lý rate-limit _(2026-06-19)_
- `494172f63` fix(build): commit web2-ai-script route file referenced by server.js _(2026-06-19)_
- `ce6882b14` style(web2/fb-posts): prettier _(2026-06-19)_
- `77bcfbcb1` feat(web2/fb-posts): Đăng nhập bằng Facebook (OAuth) — liên kết 1 lần dính web luôn, không cần dán token _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-160010-b570dd1` cho Claude walk chain theo CLAUDE.md protocol.
