# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-030509-3ad35df`
**Session file**: [`./20260623-030509-3ad35df.md`](../20260623-030509-3ad35df.md)
**Commit**: `3ad35df` — fix(web2-pbh) deep money-flow audit: 8 bug (double-refund/over-sell/orphan/double-count)
**Last updated**: 2026-06-23 03:05:09 +07
**Summary**: fix(web2-pbh) deep money-flow audit: 8 bug (double-refund/over-sell/orphan/double-count)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `3ad35df32` fix(web2-pbh) deep money-flow audit: 8 bug (double-refund/over-sell/orphan/double-count) _(2026-06-23)_
- `4cf761825` chore(session): RESUME:20260623-023307-7fa6e53 _(2026-06-23)_
- `7fa6e535e` fix(web2-pbh) pbh-render detail/history: inject auth (bare-fetch 401 cho NV KPI-scope) + dev-log audit _(2026-06-23)_
- `292c423db` chore(session): RESUME:20260623-020852-a7eef5b _(2026-06-23)_
- `a7eef5b1e` fix(web2) customer-orders: ẩn Đơn Web đã convert sang PBH (hết trùng dòng + double-count) _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-030509-3ad35df` cho Claude walk chain theo CLAUDE.md protocol.
