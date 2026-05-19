# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-113957-d4512fc`
**Session file**: [`./20260519-113957-d4512fc.md`](../20260519-113957-d4512fc.md)
**Commit**: `d4512fc` — auto: session update
**Last updated**: 2026-05-19 11:39:57 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/js/customer-wallet-app.js`

## Last 5 commits touching `web2/`

- `d4512fc9` auto: session update _(2026-05-19)_
- `a1a7829b` chore(web2): đồng nhất title - WEB 2.0 cho 79 pages còn lại (tổng 92/92) _(2026-05-19)_
- `24c24b0d` fix(web2/balance-history): opt out legacy navigation-modern.js auth redirect _(2026-05-19)_
- `ad61d967` feat(web2/balance-history): embed metadata block + re-run manifest builder _(2026-05-19)_
- `9cd8e13b` feat(web2/balance-history): clone đầy đủ balance-history sang Web 2.0 + sidebar + SSE _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-113957-d4512fc` cho Claude walk chain theo CLAUDE.md protocol.
