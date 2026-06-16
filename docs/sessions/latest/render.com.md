# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-101630-10086d1`
**Session file**: [`./20260616-101630-10086d1.md`](../20260616-101630-10086d1.md)
**Commit**: `10086d1` — refactor(web1⊥web2): gỡ /api/v2/customers/:id/orders đọc web2Db (coupling cuối) — độc lập hoàn toàn
**Last updated**: 2026-06-16 10:16:30 +07
**Summary**: refactor(web1⊥web2): gỡ /api/v2/customers/:id/orders đọc web2Db (coupling cuối) — độc lập hoàn toàn

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/customers.js`

## Last 5 commits touching `render.com/`

- `10086d1e3` refactor(web1⊥web2): gỡ /api/v2/customers/:id/orders đọc web2Db (coupling cuối) — độc lập hoàn toàn _(2026-06-16)_
- `274721baf` chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) _(2026-06-16)_
- `5b414edc1` perf(web2-api): tesseract lazy-load + autofb không mount khi WEB2*ONLY (giảm RAM nền) *(2026-06-16)\_
- `66a63b76f` perf(web2-api): bound sharp native memory + RSS log để chống OOM 512Mi _(2026-06-15)_
- `e2d9d87b2` chore(web2): TPOS triệt để — doc sửa (web2*customers KHÔNG có cột tpos), DROP safety-net, rename var *(2026-06-15)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-101630-10086d1` cho Claude walk chain theo CLAUDE.md protocol.
