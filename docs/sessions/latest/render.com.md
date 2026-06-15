# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-001109-c5a3a62`
**Session file**: [`./20260616-001109-c5a3a62.md`](../20260616-001109-c5a3a62.md)
**Commit**: `c5a3a62` — docs(dev-log): web2-api OOM resolved — plan standard 2GB + NODE_OPTIONS heap cap 1536
**Last updated**: 2026-06-16 00:11:09 +07
**Summary**: docs(dev-log): web2-api OOM resolved — plan standard 2GB + NODE_OPTIONS heap cap 1536

## Files changed in this commit (`render.com/`)

- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `66a63b76f` perf(web2-api): bound sharp native memory + RSS log để chống OOM 512Mi _(2026-06-15)_
- `e2d9d87b2` chore(web2): TPOS triệt để — doc sửa (web2*customers KHÔNG có cột tpos), DROP safety-net, rename var *(2026-06-15)\_
- `a6d65585e` auto: session update _(2026-06-15)_
- `94c569891` feat(web2-jt): tag XỬ LÝ BC đổi icon ngay + lưu DB đồng bộ đa máy _(2026-06-15)_
- `283422bf5` feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2*customers + SSE đồng bộ *(2026-06-15)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-001109-c5a3a62` cho Claude walk chain theo CLAUDE.md protocol.
