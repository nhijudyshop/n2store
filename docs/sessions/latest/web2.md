# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-185711-e96fd9d`
**Session file**: [`./20260614-185711-e96fd9d.md`](../20260614-185711-e96fd9d.md)
**Commit**: `e96fd9d` — auto: session update
**Last updated**: 2026-06-14 18:57:11 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/ck-dashboard/index.html`
- `web2/customers/index.html`
- `web2/returns/index.html`
- `web2/shared/web2-import.css`
- `web2/shared/web2-import.js`
- `web2/shared/web2-wallet-balance.js`

## Last 5 commits touching `web2/`

- `a5d0f7abb` perf(web2,wallet-pill): gom N request /by-phone → 1 POST /batch-summary + browser-verify Firebase removal sạch _(2026-06-14)_
- `4af750c03` auto: session update _(2026-06-14)_
- `797c2c301` auto: session update _(2026-06-14)_
- `805a08866` fix(web2-split): route delivery-invoices/refunds to web2-api + repoint hardcoded web2→fallback URLs _(2026-06-14)_
- `6a245484e` auto: session update _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-185711-e96fd9d` cho Claude walk chain theo CLAUDE.md protocol.
