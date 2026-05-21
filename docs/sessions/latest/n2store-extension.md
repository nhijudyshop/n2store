# Latest Snapshot — `n2store-extension/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-113334-411482c`
**Session file**: [`./20260521-113334-411482c.md`](../20260521-113334-411482c.md)
**Commit**: `411482c` — feat(domain): rewire codebase sang custom domain nhijudy.store
**Last updated**: 2026-05-21 11:33:34 +07
**Summary**: feat(domain): rewire codebase sang custom domain nhijudy.store

## Files changed in this commit (`n2store-extension/`)

- `n2store-extension/background/server/notifications.js`
- `n2store-extension/manifest.json`
- `n2store-extension/pages/settings.js`
- `n2store-extension/popup/popup.js`
- `n2store-extension/shared/config.js`

## Last 5 commits touching `n2store-extension/`

- `411482c3` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `a5d44815` auto: session update _(2026-04-23)_
- `92e1b824` fix(cors): full sweep — route all Render calls via Cloudflare Worker _(2026-04-22)_
- `d8abbd51` auto: session update _(2026-04-22)_
- `5efbaa5a` feat(phone): FAB button, dialpad, drag, ext selector — open widget without calling _(2026-04-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-113334-411482c` cho Claude walk chain theo CLAUDE.md protocol.
