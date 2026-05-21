# Latest Snapshot — `web2-extension/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-162621-8e901b5`
**Session file**: [`./20260521-162621-8e901b5.md`](../20260521-162621-8e901b5.md)
**Commit**: `8e901b5` — auto: session update
**Last updated**: 2026-05-21 16:26:21 +07
**Summary**: auto: session update

## Files changed in this commit (`web2-extension/`)

- `web2-extension/background/facebook/mobile-sender.js`
- `web2-extension/shared/constants.js`

## Last 5 commits touching `web2-extension/`

- `7bac192f` feat(web2-extension): m.facebook.com mobile fallback khi 1545012 cứng đầu _(2026-05-21)_
- `b79f8ee2` auto: session update _(2026-05-21)_
- `4759134e` fix(web2-extension): re-compute jazoest từ fb*dtsg + \_\_comet_req=1 cho Business Suite *(2026-05-21)\_
- `915104f3` auto: session update _(2026-05-21)_
- `411482c3` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-162621-8e901b5` cho Claude walk chain theo CLAUDE.md protocol.
