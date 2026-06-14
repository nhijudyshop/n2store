# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-183121-797c2c3`
**Session file**: [`./20260614-183121-797c2c3.md`](../20260614-183121-797c2c3.md)
**Commit**: `797c2c3` — auto: session update
**Last updated**: 2026-06-14 18:31:21 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/purchase-refund/index.html`
- `web2/supplier-debt/index.html`

## Last 5 commits touching `web2/`

- `797c2c301` auto: session update _(2026-06-14)_
- `805a08866` fix(web2-split): route delivery-invoices/refunds to web2-api + repoint hardcoded web2→fallback URLs _(2026-06-14)_
- `6a245484e` auto: session update _(2026-06-14)_
- `43ba24d53` feat(web2): gộp services-dashboard + admin-sse-monitor → trang Cấu hình & Hệ thống _(2026-06-14)_
- `e55bea256` chore(render): dọn repo sau consolidation web2-realtime _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-183121-797c2c3` cho Claude walk chain theo CLAUDE.md protocol.
