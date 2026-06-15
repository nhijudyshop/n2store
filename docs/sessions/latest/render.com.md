# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-003508-274721b`
**Session file**: [`./20260616-003508-274721b.md`](../20260616-003508-274721b.md)
**Commit**: `274721b` — chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa)
**Last updated**: 2026-06-16 00:35:08 +07
**Summary**: chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa)

## Files changed in this commit (`render.com/`)

- `render.com/package.json`
- `render.com/routes/autofb.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `274721baf` chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) _(2026-06-16)_
- `5b414edc1` perf(web2-api): tesseract lazy-load + autofb không mount khi WEB2*ONLY (giảm RAM nền) *(2026-06-16)\_
- `66a63b76f` perf(web2-api): bound sharp native memory + RSS log để chống OOM 512Mi _(2026-06-15)_
- `e2d9d87b2` chore(web2): TPOS triệt để — doc sửa (web2*customers KHÔNG có cột tpos), DROP safety-net, rename var *(2026-06-15)\_
- `a6d65585e` auto: session update _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-003508-274721b` cho Claude walk chain theo CLAUDE.md protocol.
