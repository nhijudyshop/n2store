# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-031621-104434c`
**Session file**: [`./20260624-031621-104434c.md`](../20260624-031621-104434c.md)
**Commit**: `104434c` — docs(web2): dev-log — menu reorg + Phân quyền merge + lightbox fix + avatar/audit-scope/permission-registry verifications
**Last updated**: 2026-06-24 03:16:21 +07
**Summary**: docs(web2): dev-log — menu reorg + Phân quyền merge + lightbox fix + avatar/audit-scope/permission-registry veri...

## Files changed in this commit (`web2/`)

- `web2/shared/web2-image-lightbox.js`
- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-user-profile.js`
- `web2/users-permissions/index.html`
- `web2/users/index.html`

## Last 5 commits touching `web2/`

- `5563aa18b` fix(web2): image lightbox stuck/overlay-blocking after close ([hidden] vs inline display) _(2026-06-24)_
- `a19204ee6` feat(web2): menu cleanup (no WEB2.0 badge/emoji) + merge Phân quyền into Người dùng + avatar auth-error msg _(2026-06-24)_
- `2ccb4aa2e` feat(web2): menu reorg per user request — move pages between groups + rename Tài chính→Chuyển khoản KH _(2026-06-24)_
- `66a2f707d` fix(web2): split-PBH cancel restocks ALL splits + 5 frontend silent-failure surfaces _(2026-06-24)_
- `f095747ae` fix(web2): video-maker stop auto-probing localhost TTS (8123/8124) → no ERR*CONNECTION_REFUSED console noise *(2026-06-24)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-031621-104434c` cho Claude walk chain theo CLAUDE.md protocol.
