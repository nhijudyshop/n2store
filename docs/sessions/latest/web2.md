# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-032819-b36a9c0`
**Session file**: [`./20260624-032819-b36a9c0.md`](../20260624-032819-b36a9c0.md)
**Commit**: `b36a9c0` — fix(web2): page-guard 'back to overview' path adapts to page depth (web2/<slug> vs depth-1)
**Last updated**: 2026-06-24 03:28:19 +07
**Summary**: fix(web2): page-guard 'back to overview' path adapts to page depth (web2/<slug> vs depth-1)

## Files changed in this commit (`web2/`)

- `web2/shared/web2-perm.js`
- `web2/shared/web2-sidebar.js`
- `web2/users-permissions/index.html`

## Last 5 commits touching `web2/`

- `b36a9c0f7` fix(web2): page-guard 'back to overview' path adapts to page depth (web2/<slug> vs depth-1) _(2026-06-24)_
- `d9128071c` feat(web2): complete permission system — registry 18→49 pages + auto-discover + safe enforcement _(2026-06-24)_
- `5563aa18b` fix(web2): image lightbox stuck/overlay-blocking after close ([hidden] vs inline display) _(2026-06-24)_
- `a19204ee6` feat(web2): menu cleanup (no WEB2.0 badge/emoji) + merge Phân quyền into Người dùng + avatar auth-error msg _(2026-06-24)_
- `2ccb4aa2e` feat(web2): menu reorg per user request — move pages between groups + rename Tài chính→Chuyển khoản KH _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-032819-b36a9c0` cho Claude walk chain theo CLAUDE.md protocol.
