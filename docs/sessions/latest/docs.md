# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-064534-a6fa763`
**Session file**: [`./20260621-064534-a6fa763.md`](../20260621-064534-a6fa763.md)
**Commit**: `a6fa763` — docs(dev-log): audit Web 2.0 25 bug fix (r1a-r1f)
**Last updated**: 2026-06-21 06:45:34 +07
**Summary**: audit Web 2.0 full-surface: fix 25/27 bug (auth/sse-leak/anti-lag/click-path/zalo/pancake)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a6fa76371` docs(dev-log): audit Web 2.0 25 bug fix (r1a-r1f) _(2026-06-21)_
- `6087337c3` chore(session): RESUME:20260620-220000-40c30af _(2026-06-20)_
- `40c30af34` perf: trigram GIN index web2*balance_history.content (ILIKE substring dùng index thay seq scan) *(2026-06-20)\_
- `68651b796` chore(session): RESUME:20260620-215443-9af3a0c _(2026-06-20)_
- `9af3a0c68` fix(O3): bỏ poller fetch comment -> WS-live nguồn duy nhất (hết dòng trùng postId*mid vs convId_seq) *(2026-06-20)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-064534-a6fa763` cho Claude walk chain theo CLAUDE.md protocol.
