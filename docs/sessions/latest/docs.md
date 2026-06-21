# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-091121-034f610`
**Session file**: [`./20260621-091121-034f610.md`](../20260621-091121-034f610.md)
**Commit**: `034f610` — docs(dev-log): audit round 2 (auth/xss/tz fix + money defer + FP notes)
**Last updated**: 2026-06-21 09:11:21 +07
**Summary**: audit r2: auth-gate 4 read endpoints + XSS + reconcile tz; defer 2 money (over-refund/wallet-idx); regression r1 sach

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `034f610e5` docs(dev-log): audit round 2 (auth/xss/tz fix + money defer + FP notes) _(2026-06-21)_
- `f55620273` chore(session): RESUME:20260621-064534-a6fa763 _(2026-06-21)_
- `a6fa76371` docs(dev-log): audit Web 2.0 25 bug fix (r1a-r1f) _(2026-06-21)_
- `6087337c3` chore(session): RESUME:20260620-220000-40c30af _(2026-06-20)_
- `40c30af34` perf: trigram GIN index web2*balance_history.content (ILIKE substring dùng index thay seq scan) *(2026-06-20)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-091121-034f610` cho Claude walk chain theo CLAUDE.md protocol.
