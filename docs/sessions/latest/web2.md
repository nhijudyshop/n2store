# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-033640-9294b1d`
**Session file**: [`./20260624-033640-9294b1d.md`](../20260624-033640-9294b1d.md)
**Commit**: `9294b1d` — fix(web2): footer avatar missing on some pages + ai-hub provider/model cleanup + English AI prompts
**Last updated**: 2026-06-24 03:36:40 +07
**Summary**: fix(web2): footer avatar missing on some pages + ai-hub provider/model cleanup + English AI prompts

## Files changed in this commit (`web2/`)

- `web2/ai-hub/js/ai-image.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `9294b1db7` fix(web2): footer avatar missing on some pages + ai-hub provider/model cleanup + English AI prompts _(2026-06-24)_
- `b36a9c0f7` fix(web2): page-guard 'back to overview' path adapts to page depth (web2/<slug> vs depth-1) _(2026-06-24)_
- `d9128071c` feat(web2): complete permission system — registry 18→49 pages + auto-discover + safe enforcement _(2026-06-24)_
- `5563aa18b` fix(web2): image lightbox stuck/overlay-blocking after close ([hidden] vs inline display) _(2026-06-24)_
- `a19204ee6` feat(web2): menu cleanup (no WEB2.0 badge/emoji) + merge Phân quyền into Người dùng + avatar auth-error msg _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-033640-9294b1d` cho Claude walk chain theo CLAUDE.md protocol.
