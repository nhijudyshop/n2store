# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-190402-b16d82b`
**Session file**: [`./20260620-190402-b16d82b.md`](../20260620-190402-b16d82b.md)
**Commit**: `b16d82b` — auto: session update
**Last updated**: 2026-06-20 19:04:02 +07
**Summary**: auto: session update

## Files changed in this commit (`live-chat/`)

- `live-chat/comments-mobile.html`
- `live-chat/index.html`
- `live-chat/js/live/comments-mobile-actions.js`
- `live-chat/js/live/live-init-wiring.js`
- `live-chat/js/pancake/pancake-api.js`
- `live-chat/js/shared/live-comments-stream.js`

## Last 5 commits touching `live-chat/`

- `b16d82b83` auto: session update _(2026-06-20)_
- `4703899a7` fix(live-chat/security): comments-mobile guard login + gui x-web2-token (chong xem comment khach an danh) - CLIENT _(2026-06-20)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `65d6ba9b4` fix(web2): medium/low audit fixes (25 file) — leaks/races/guards + bump ?v=20260620c _(2026-06-20)_
- `805979487` chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-190402-b16d82b` cho Claude walk chain theo CLAUDE.md protocol.
