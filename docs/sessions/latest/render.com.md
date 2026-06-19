# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-184917-0ce7129`
**Session file**: [`./20260619-184917-0ce7129.md`](../20260619-184917-0ce7129.md)
**Commit**: `0ce7129` — fix(web2/fb-posts): trả aiAvailable cả khi chưa kết nối → nút 'AI viết lại' không bị disable sớm
**Last updated**: 2026-06-19 18:49:17 +07
**Summary**: fix(web2/fb-posts): trả aiAvailable cả khi chưa kết nối → nút 'AI viết lại' không bị disable sớm

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-fb-posts.js`

## Last 5 commits touching `render.com/`

- `0ce7129ed` fix(web2/fb-posts): trả aiAvailable cả khi chưa kết nối → nút 'AI viết lại' không bị disable sớm _(2026-06-19)_
- `c1d37acf5` refactor(render): tách tuyệt đối Web1⊥Web2 — boot-guard fail-fast mặc định + alias web1Db + sửa comment chatDb stale _(2026-06-19)_
- `a08200892` fix(web2/ai-script): gate route bằng WEB1*ONLY (đúng convention WEB2_ONLY có sẵn) thay vì WEB2_SERVICE tự chế *(2026-06-19)\_
- `b570dd13b` fix(web2/ai-script): mount route Web 2.0 CHỈ khi WEB2*SERVICE=1 (web2-api) — Web 1.0 (n2store-fallback) KHÔNG load, không bị ảnh hưởng *(2026-06-19)\_
- `143222cb7` fix(web2/fb-posts): an toàn chính sách FB — bỏ engagement-bait/clickbait, cảnh báo bản quyền media, hashtag≤6, giãn nhịp đăng + xử lý rate-limit _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-184917-0ce7129` cho Claude walk chain theo CLAUDE.md protocol.
