# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-184459-c9d643e`
**Session file**: [`./20260609-184459-c9d643e.md`](../20260609-184459-c9d643e.md)
**Commit**: `c9d643e` — auto: session update
**Last updated**: 2026-06-09 18:44:59 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/fast-sale-orders.js`
- `render.com/routes/v2/web2-customers.js`

## Last 5 commits touching `render.com/`

- `c9d643e9c` auto: session update _(2026-06-09)_
- `983a7ce02` auto: session update _(2026-06-09)_
- `d21c2b636` feat(web2-customers): tìm kiếm KHÔNG DẤU ở /list (unaccent + fallback) _(2026-06-09)_
- `602a658e3` feat(web2-kpi): tách Dự báo(draft)/Thực(confirmed) theo status + KPI strip trên native-orders (scope admin/staff) _(2026-06-09)_
- `578cb14ee` feat(web2-kpi): thêm POST /:code/lock-kpi-base (chốt thủ công khóa base) + snapshotKpiBase nhận code _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-184459-c9d643e` cho Claude walk chain theo CLAUDE.md protocol.
