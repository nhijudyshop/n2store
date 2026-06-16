# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-161145-c7b772e`
**Session file**: [`./20260616-161145-c7b772e.md`](../20260616-161145-c7b772e.md)
**Commit**: `c7b772e` — auto: session update
**Last updated**: 2026-06-16 16:11:45 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-app.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-app.js`

## Last 5 commits touching `web2/`

- `c7b772e14` auto: session update _(2026-06-16)_
- `2111be18d` fix(supplier-wallet): số liệu NCC về 0₫ sau load — post-Sync render đè 0 (ledger ko có totalPurchased, phải re-aggregate Sổ Order) + debug logs SW-DEBUG _(2026-06-16)_
- `716992f5f` feat(web2/supplier-wallet): bỏ nút Đồng bộ → realtime tự động (thêm SSE web2:so-order) _(2026-06-16)_
- `eade6982a` auto: session update _(2026-06-16)_
- `2211c0681` auto: session update _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-161145-c7b772e` cho Claude walk chain theo CLAUDE.md protocol.
