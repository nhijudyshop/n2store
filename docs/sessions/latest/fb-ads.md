# Latest Snapshot — `fb-ads/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-113334-411482c`
**Session file**: [`./20260521-113334-411482c.md`](../20260521-113334-411482c.md)
**Commit**: `411482c` — feat(domain): rewire codebase sang custom domain nhijudy.store
**Last updated**: 2026-05-21 11:33:34 +07
**Summary**: feat(domain): rewire codebase sang custom domain nhijudy.store

## Files changed in this commit (`fb-ads/`)

- `fb-ads/extension/background.js`

## Last 5 commits touching `fb-ads/`

- `411482c3` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `a5d44815` auto: session update _(2026-04-23)_
- `d6e3faa5` auto: session update _(2026-04-22)_
- `7bc1c4c4` fix(fb-ads): use OAuth dialog to get EAAG token — FB Ads Manager doesn't expose tokens in API calls, must go through OAuth _(2026-04-16)_
- `10e27289` fix(fb-ads): intercept fetch/XHR in MAIN world to capture EAAG token from Facebook's internal API calls _(2026-04-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-113334-411482c` cho Claude walk chain theo CLAUDE.md protocol.
