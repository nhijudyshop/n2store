# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260526-180829-0d6d5ec`
**Session file**: [`./20260526-180829-0d6d5ec.md`](../20260526-180829-0d6d5ec.md)
**Commit**: `0d6d5ec` — fix(web2/balance-history): label "Thủ công" sai cho legacy backfilled rows
**Last updated**: 2026-05-26 18:08:29 +07
**Summary**: fix(web2/balance-history): label "Thủ công" sai cho legacy backfilled rows

## Files changed in this commit (`web2/`)

- `web2/balance-history/css/web2-balance-history.css`
- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-balance-history-app.js`

## Last 5 commits touching `web2/`

- `0d6d5ec19` fix(web2/balance-history): label "Thủ công" sai cho legacy backfilled rows _(2026-05-26)_
- `715ea8cd1` feat(web2): admin SSE Monitor page — live view of realtime hub activity _(2026-05-26)_
- `d654a830e` auto: session update _(2026-05-26)_
- `d076b6afa` fix(web2/customer-wallet): icons in .btn-secondary buttons oversized (14px) _(2026-05-26)_
- `1fc24e0cd` auto: session update _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260526-180829-0d6d5ec` cho Claude walk chain theo CLAUDE.md protocol.
