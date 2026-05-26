# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260526-090928-8421a58`
**Session file**: [`./20260526-090928-8421a58.md`](../20260526-090928-8421a58.md)
**Commit**: `8421a58` — feat(product-warehouse): variant DefaultCode rỗng → TPOS auto-generate
**Last updated**: 2026-05-26 09:09:28 +07
**Summary**: feat(product-warehouse): variant DefaultCode rỗng → TPOS auto-generate

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/balance-history/js/web2-link-customer-modal.js`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/index.legacy.html`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`

## Last 5 commits touching `web2/`

- `3f016dafa` feat(web2): Phase 4 — customer-wallet drop Firestore + balance-history smart customer search _(2026-05-25)_
- `732cd201f` feat(web2): Phase 3 — frontend isolation 100% qua /api/web2/\* (rewrite) _(2026-05-25)_
- `36f4ba93f` auto: session update _(2026-05-25)_
- `896cfbb20` auto: session update _(2026-05-25)_
- `ff3002c8d` auto: session update _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260526-090928-8421a58` cho Claude walk chain theo CLAUDE.md protocol.
