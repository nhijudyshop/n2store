# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-092820-1653cda`
**Session file**: [`./20260525-092820-1653cda.md`](../20260525-092820-1653cda.md)
**Commit**: `1653cda` — fix(snap): /snapshots/by-comment-ids recompute livestream_url
**Last updated**: 2026-05-25 09:28:20 +07
**Summary**: fix(snap): /snapshots/by-comment-ids recompute livestream_url

## Files changed in this commit (`render.com/`)

- `render.com/routes/livestream-snapshots.js`

## Last 5 commits touching `render.com/`

- `1653cda5c` fix(snap): /snapshots/by-comment-ids recompute livestream*url *(2026-05-25)\_
- `425a5828d` feat(snap): FB JS SDK player.seek() API — reliable seek (FB official method) _(2026-05-25)_
- `f6c0fe137` fix(snap): FB seek URL = /plugins/video.php?href=URL&t=N (verified) _(2026-05-25)_
- `5b782f7fc` fix(snap): FB seek param = 'start' (not 't') — verified qua Playwright test _(2026-05-25)_
- `4e592f456` fix(snap): livestream URL seek — dùng /watch/?v=ID&t=N (FB seek-supported format) _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-092820-1653cda` cho Claude walk chain theo CLAUDE.md protocol.
