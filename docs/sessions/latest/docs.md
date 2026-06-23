# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-032819-b36a9c0`
**Session file**: [`./20260624-032819-b36a9c0.md`](../20260624-032819-b36a9c0.md)
**Commit**: `b36a9c0` — fix(web2): page-guard 'back to overview' path adapts to page depth (web2/<slug> vs depth-1)
**Last updated**: 2026-06-24 03:28:19 +07
**Summary**: fix(web2): page-guard 'back to overview' path adapts to page depth (web2/<slug> vs depth-1)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `d9128071c` feat(web2): complete permission system — registry 18→49 pages + auto-discover + safe enforcement _(2026-06-24)_
- `67e393ed0` chore(session): RESUME:20260624-031621-104434c _(2026-06-24)_
- `104434c72` docs(web2): dev-log — menu reorg + Phân quyền merge + lightbox fix + avatar/audit-scope/permission-registry verifications _(2026-06-24)_
- `ea0677236` chore(session): RESUME:20260624-025220-38335c0 _(2026-06-24)_
- `2ecbdb807` fix(web2): 5 money/stock conservation bugs from adversarial workflow audit _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-032819-b36a9c0` cho Claude walk chain theo CLAUDE.md protocol.
