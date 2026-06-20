# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-215443-9af3a0c`
**Session file**: [`./20260620-215443-9af3a0c.md`](../20260620-215443-9af3a0c.md)
**Commit**: `9af3a0c` — fix(O3): bỏ poller fetch comment -> WS-live nguồn duy nhất (hết dòng trùng postId_mid vs convId_seq)
**Last updated**: 2026-06-20 21:54:43 +07
**Summary**: fix(O3): bỏ poller fetch comment -> WS-live nguồn duy nhất (hết dòng trùng postId_mid vs convId_seq)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `9af3a0c68` fix(O3): bỏ poller fetch comment -> WS-live nguồn duy nhất (hết dòng trùng postId*mid vs convId_seq) *(2026-06-20)\_
- `59a2a0322` chore(session): RESUME:20260620-213936-9e87ca3 _(2026-06-20)_
- `9e87ca333` docs(dev-log): re-verify audit 09:10 + fix A3/O7/O2 + N+1 web2-returns _(2026-06-20)_
- `71d2f25f5` chore(session): RESUME:20260620-211657-c611cc1 _(2026-06-20)_
- `c611cc15b` perf(db): apply quick-win indexes (audit) — web2*live_comments.updated_at, balance_history, pancake_accounts + tie-break ORDER BY *(2026-06-20)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-215443-9af3a0c` cho Claude walk chain theo CLAUDE.md protocol.
