# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-191219-a420110`
**Session file**: [`./20260619-191219-a420110.md`](../20260619-191219-a420110.md)
**Commit**: `a420110` — auto: session update
**Last updated**: 2026-06-19 19:12:19 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-zalo.js`
- `render.com/services/web2-fb-graph-service.js`

## Last 5 commits touching `render.com/`

- `a4201105a` auto: session update _(2026-06-19)_
- `077e15168` fix(web2/fb-posts): least-privilege scope OAuth — bỏ pages*manage_engagement (không dùng), giữ 3 quyền Standard Access *(2026-06-19)\_
- `0ce7129ed` fix(web2/fb-posts): trả aiAvailable cả khi chưa kết nối → nút 'AI viết lại' không bị disable sớm _(2026-06-19)_
- `c1d37acf5` refactor(render): tách tuyệt đối Web1⊥Web2 — boot-guard fail-fast mặc định + alias web1Db + sửa comment chatDb stale _(2026-06-19)_
- `a08200892` fix(web2/ai-script): gate route bằng WEB1*ONLY (đúng convention WEB2_ONLY có sẵn) thay vì WEB2_SERVICE tự chế *(2026-06-19)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-191219-a420110` cho Claude walk chain theo CLAUDE.md protocol.
