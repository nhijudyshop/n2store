# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-161320-1a46415`
**Session file**: [`./20260530-161320-1a46415.md`](../20260530-161320-1a46415.md)
**Commit**: `1a46415` — feat(web2): migrate all Web 2.0 stores localStorage → IndexedDB
**Last updated**: 2026-05-30 16:13:20 +07
**Summary**: feat(web2): migrate all Web 2.0 stores localStorage → IndexedDB

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.legacy.html`
- `web2/balance-history/js/accountant-history.js`
- `web2/customer-wallet/index.legacy.html`
- `web2/customer-wallet/js/customer-wallet-app.js`
- `web2/customer-wallet/js/customer-wallet-storage.js`
- `web2/supplier-wallet/js/supplier-wallet-app.js`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`

## Last 5 commits touching `web2/`

- `1a4641596` feat(web2): migrate all Web 2.0 stores localStorage → IndexedDB _(2026-05-30)_
- `42b5b9282` auto: session update _(2026-05-30)_
- `07299b93c` feat(web2-shared): Web2IdbStore helper — generic IDB kv với auto-migrate từ LS _(2026-05-30)_
- `c42f5eadc` perf(web2-cache): localStorage → IndexedDB + auto-migrate _(2026-05-30)_
- `a96f3cdcd` perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-161320-1a46415` cho Claude walk chain theo CLAUDE.md protocol.
