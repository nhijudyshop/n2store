# Latest Snapshot — `downloads/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-111653-24c24b0`
**Session file**: [`./20260519-111653-24c24b0.md`](../20260519-111653-24c24b0.md)
**Commit**: `24c24b0` — fix(web2/balance-history): opt out legacy navigation-modern.js auth redirect
**Last updated**: 2026-05-19 11:16:53 +07
**Summary**: fix(web2/balance-history): opt out legacy navigation-modern.js auth redirect

## Files changed in this commit (`downloads/`)

- `downloads/n2store-session/inventory-tracking-cols.png`
- `downloads/n2store-session/prod-balance-history-1.png`
- `downloads/n2store-session/prod-balance-history-2.png`
- `downloads/n2store-session/prod-search-balance.png`
- `downloads/n2store-session/prod-sidebar-expand.png`
- `downloads/n2store-session/web2-balance-accountant.png`
- `downloads/n2store-session/web2-balance-transfer-stats.png`

## Last 5 commits touching `downloads/`

- `24c24b0d` fix(web2/balance-history): opt out legacy navigation-modern.js auth redirect _(2026-05-19)_
- `ad61d967` feat(web2/balance-history): embed metadata block + re-run manifest builder _(2026-05-19)_
- `9cd8e13b` feat(web2/balance-history): clone đầy đủ balance-history sang Web 2.0 + sidebar + SSE _(2026-05-19)_
- `dc58ffa5` feat(supplier-wallet + supplier-debt): SSE realtime — auto-refresh khi SePay + so-order data change _(2026-05-19)_
- `32c2437e` feat(customer-wallet): SSE realtime auto-refresh khi SePay webhook nhận tiền _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-111653-24c24b0` cho Claude walk chain theo CLAUDE.md protocol.
