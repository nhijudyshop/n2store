# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-194011-732cd20`
**Session file**: [`./20260525-194011-732cd20.md`](../20260525-194011-732cd20.md)
**Commit**: `732cd20` — feat(web2): Phase 3 — frontend isolation 100% qua /api/web2/_ (rewrite)
**Last updated**: 2026-05-25 19:40:11 +07
**Summary**: feat(web2): Phase 3 — frontend isolation 100% qua /api/web2/_ (rewrite)

## Files changed in this commit (`web2/`)

- `web2/balance-history/css/web2-balance-history.css`
- `web2/balance-history/index.legacy.html`
- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/customer-wallet-app.js`

## Last 5 commits touching `web2/`

- `732cd201f` feat(web2): Phase 3 — frontend isolation 100% qua /api/web2/\* (rewrite) _(2026-05-25)_
- `36f4ba93f` auto: session update _(2026-05-25)_
- `896cfbb20` auto: session update _(2026-05-25)_
- `ff3002c8d` auto: session update _(2026-05-25)_
- `c1d5c63fa` auto: session update _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-194011-732cd20` cho Claude walk chain theo CLAUDE.md protocol.
