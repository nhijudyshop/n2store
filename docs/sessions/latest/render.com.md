# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-181503-d21c2b6`
**Session file**: [`./20260609-181503-d21c2b6.md`](../20260609-181503-d21c2b6.md)
**Commit**: `d21c2b6` — feat(web2-customers): tìm kiếm KHÔNG DẤU ở /list (unaccent + fallback)
**Last updated**: 2026-06-09 18:15:03 +07
**Summary**: feat(web2-customers): tìm kiếm KHÔNG DẤU ở /list (unaccent + fallback)

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/web2-customers.js`

## Last 5 commits touching `render.com/`

- `d21c2b636` feat(web2-customers): tìm kiếm KHÔNG DẤU ở /list (unaccent + fallback) _(2026-06-09)_
- `602a658e3` feat(web2-kpi): tách Dự báo(draft)/Thực(confirmed) theo status + KPI strip trên native-orders (scope admin/staff) _(2026-06-09)_
- `578cb14ee` feat(web2-kpi): thêm POST /:code/lock-kpi-base (chốt thủ công khóa base) + snapshotKpiBase nhận code _(2026-06-09)_
- `3db60ad23` feat(web2-kpi): KPI model base-delta (livestream) + 100% (inbox), gộp 1 KPI _(2026-06-09)_
- `bad8ab677` fix(web2-kpi): tách bảng phân công riêng web2*kpi_assignments (web2Db) — fix cross-pool *(2026-06-09)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-181503-d21c2b6` cho Claude walk chain theo CLAUDE.md protocol.
