# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-085528-5b782f7`
**Session file**: [`./20260525-085528-5b782f7.md`](../20260525-085528-5b782f7.md)
**Commit**: `5b782f7` — fix(snap): FB seek param = 'start' (not 't') — verified qua Playwright test
**Last updated**: 2026-05-25 08:55:28 +07
**Summary**: fix(snap): FB seek param = 'start' (not 't') — verified qua Playwright test

## Files changed in this commit (`scripts/`)

- `scripts/test-fb-seek.js`
- `scripts/test-fb-seek2.js`

## Last 5 commits touching `scripts/`

- `5b782f7fc` fix(snap): FB seek param = 'start' (not 't') — verified qua Playwright test _(2026-05-25)_
- `69f2dc6d6` perf(delivery-report/report): view-swap thay modal overlay — tab switch ~5ms _(2026-05-24)_
- `0902ef047` feat(delivery-report): Báo cáo modal — triple-click hint, 3 tabs, editable cells + image _(2026-05-24)_
- `eeaa9ce89` feat(supplier-debt): auto refresh — polling 30s + cross-tab BroadcastChannel, no F5 _(2026-05-24)_
- `c5fe9b5b3` debug: add AbortController + log to stream-url fetch (track 'Failed to fetch') _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-085528-5b782f7` cho Claude walk chain theo CLAUDE.md protocol.
