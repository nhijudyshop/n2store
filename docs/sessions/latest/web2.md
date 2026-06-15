# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-213808-4aa6638`
**Session file**: [`./20260615-213808-4aa6638.md`](../20260615-213808-4aa6638.md)
**Commit**: `4aa6638` — auto: session update
**Last updated**: 2026-06-15 21:38:08 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-manual-deposit.js`
- `web2/customer-wallet/index.html`
- `web2/multi-tool/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`
- `web2/shared/web2-customer-lookup.js`
- `web2/shared/web2-customer-store.js`
- `web2/shared/web2-suppliers-cache.js`
- `web2/shared/web2-variants-cache.js`
- `web2/shared/web2-wallet-api.js`
- `web2/shared/web2-wallet-balance.js`
- `web2/variants/index.html`

## Last 5 commits touching `web2/`

- `4aa663878` auto: session update _(2026-06-15)_
- `c318b9885` refactor(web2/P5): gom colorShortMap về Web2VariantsCache.getColorShortMap (memoize) _(2026-06-15)_
- `947651cd9` refactor(web2/P3): promote Web2WalletApi (ví KH) sang shared; pill reuse; ví NCC giữ nguyên (money-op) _(2026-06-15)_
- `58b72ab4a` refactor(web2/P2): kho NCC dùng directory chung Web2SuppliersCache (expose normalize + manual-deposit) _(2026-06-15)_
- `350f0954b` refactor(web2/P1): gom kho KH về 1 nguồn Web2CustomerStore + fix filter SĐT lỏng (fb*id lọt batch-by-phone) *(2026-06-15)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-213808-4aa6638` cho Claude walk chain theo CLAUDE.md protocol.
