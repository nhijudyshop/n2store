# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-091856-3c5d5c1`
**Session file**: [`./20260519-091856-3c5d5c1.md`](../20260519-091856-3c5d5c1.md)
**Commit**: `3c5d5c1` — feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write
**Last updated**: 2026-05-19 09:18:56 +07
**Summary**: feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `3c5d5c10` feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write _(2026-05-19)_
- `45f55bbf` chore(session): RESUME:20260518-180736-228e8cf _(2026-05-18)_
- `efec423e` chore(session): RESUME:20260518-180356-20edfcd _(2026-05-18)_
- `20edfcd1` refactor(so-order): sync sang local-first — bỏ onSnapshot, debounce push, pull-on-focus _(2026-05-18)_
- `f6d0b40c` chore(session): RESUME:20260518-175801-f5cb1cb _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-091856-3c5d5c1` cho Claude walk chain theo CLAUDE.md protocol.
