# Latest Snapshot — `web2-extension/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-151235-bd96bd1`
**Session file**: [`./20260521-151235-bd96bd1.md`](../20260521-151235-bd96bd1.md)
**Commit**: `bd96bd1` — auto: session update
**Last updated**: 2026-05-21 15:12:35 +07
**Summary**: auto: session update

## Files changed in this commit (`web2-extension/`)

- `web2-extension/background/facebook/utils.js`
- `web2-extension/manifest.json`
- `web2-extension/shared/constants.js`

## Last 5 commits touching `web2-extension/`

- `4759134e` fix(web2-extension): re-compute jazoest từ fb*dtsg + \_\_comet_req=1 cho Business Suite *(2026-05-21)\_
- `915104f3` auto: session update _(2026-05-21)_
- `411482c3` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `62b4ac76` feat(web2-extension): fork n2store-extension thành Web 2.0 Messenger v2.0.0 + browser-test --ext flag _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-151235-bd96bd1` cho Claude walk chain theo CLAUDE.md protocol.
