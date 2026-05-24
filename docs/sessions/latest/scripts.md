# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-120831-7374bf2`
**Session file**: [`./20260524-120831-7374bf2.md`](../20260524-120831-7374bf2.md)
**Commit**: `7374bf2` — fix(snap): đợi iframe load event + 7s buffer trước khi start capture
**Last updated**: 2026-05-24 12:08:31 +07
**Summary**: fix(snap): đợi iframe load event + 7s buffer trước khi start capture

## Files changed in this commit (`scripts/`)

- `scripts/test-dr-report-view.js`

## Last 5 commits touching `scripts/`

- `69f2dc6d6` perf(delivery-report/report): view-swap thay modal overlay — tab switch ~5ms _(2026-05-24)_
- `0902ef047` feat(delivery-report): Báo cáo modal — triple-click hint, 3 tabs, editable cells + image _(2026-05-24)_
- `eeaa9ce89` feat(supplier-debt): auto refresh — polling 30s + cross-tab BroadcastChannel, no F5 _(2026-05-24)_
- `c5fe9b5b3` debug: add AbortController + log to stream-url fetch (track 'Failed to fetch') _(2026-05-24)_
- `912f2e1b6` fix(snap-embed): Step A — defer iframe FB inject tới user click (fix lag máy) _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-120831-7374bf2` cho Claude walk chain theo CLAUDE.md protocol.
