# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-110455-eeaa9ce`
**Session file**: [`./20260524-110455-eeaa9ce.md`](../20260524-110455-eeaa9ce.md)
**Commit**: `eeaa9ce` — feat(supplier-debt): auto refresh — polling 30s + cross-tab BroadcastChannel, no F5
**Last updated**: 2026-05-24 11:04:55 +07
**Summary**: feat(supplier-debt): auto refresh — polling 30s + cross-tab BroadcastChannel, no F5

## Files changed in this commit (`scripts/`)

- `scripts/test-supplier-debt-auto-refresh.js`

## Last 5 commits touching `scripts/`

- `eeaa9ce89` feat(supplier-debt): auto refresh — polling 30s + cross-tab BroadcastChannel, no F5 _(2026-05-24)_
- `c5fe9b5b3` debug: add AbortController + log to stream-url fetch (track 'Failed to fetch') _(2026-05-24)_
- `912f2e1b6` fix(snap-embed): Step A — defer iframe FB inject tới user click (fix lag máy) _(2026-05-24)_
- `72dc2242a` test(snap): expose debug accessors + bench-iframe-capture script _(2026-05-24)_
- `020b3c7b1` fix(snap-embed): full 16:9 video capture + skip FB header chrome _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-110455-eeaa9ce` cho Claude walk chain theo CLAUDE.md protocol.
