# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-093944-ae200b3`
**Session file**: [`./20260519-093944-ae200b3.md`](../20260519-093944-ae200b3.md)
**Commit**: `ae200b3` — docs(web2): SSE realtime pattern guide + cập nhật CLAUDE.md/MEMORY rule bắt buộc
**Last updated**: 2026-05-19 09:39:44 +07
**Summary**: docs(web2): SSE realtime pattern guide + cập nhật CLAUDE.md/MEMORY rule bắt buộc

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/SSE-REALTIME.md`

## Last 5 commits touching `docs/`

- `ae200b35` docs(web2): SSE realtime pattern guide + cập nhật CLAUDE.md/MEMORY rule bắt buộc _(2026-05-19)_
- `78de3493` chore(session): RESUME:20260519-093311-bb40f46 _(2026-05-19)_
- `bb40f462` feat(native-orders): realtime data CRUD qua SSE topic 'web2:native-orders' _(2026-05-19)_
- `b8f2b1dc` chore(session): RESUME:20260519-091856-3c5d5c1 _(2026-05-19)_
- `3c5d5c10` feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-093944-ae200b3` cho Claude walk chain theo CLAUDE.md protocol.
