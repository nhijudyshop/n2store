# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-091913-7d9fc8e`
**Session file**: [`./20260619-091913-7d9fc8e.md`](../20260619-091913-7d9fc8e.md)
**Commit**: `7d9fc8e` — refactor(web2): adoption sâu hơn — JWT/SoOrderUtils/PancakeImport delegate (4) + load feature modules
**Last updated**: 2026-06-19 09:19:13 +07
**Summary**: Deploy server.js (web2-realtime LIVE, smoke 3/3, client 265 events) + adoption sâu hơn (4 delegation JWT/SoOrder/PancakeImport) XONG

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-pm-customer-search.js`
- `web2/purchase-refund/index.html`
- `web2/purchase-refund/js/purchase-refund-state.js`
- `web2/shared/web2-pancake-accounts.js`
- `web2/shared/web2-pancake-token.js`

## Last 5 commits touching `web2/`

- `7d9fc8ec7` refactor(web2): adoption sâu hơn — JWT/SoOrderUtils/PancakeImport delegate (4) + load feature modules _(2026-06-19)_
- `9b476a757` feat(web2): Phase B — 6 shared modules (Jwt/Avatar/Canvas/SoOrder/ImageLightbox/PancakeImport) _(2026-06-19)_
- `27296dea5` refactor(web2): Phase C — adopt shared utils (thin-delegate + fallback) → '1 nguồn' _(2026-06-19)_
- `d6c0c7b71` feat(native-orders): Task 1 — chat-unification, openInteractions → Web2CustomerChat (comments → info col) _(2026-06-19)_
- `bd2c728e9` refactor(web2): tách web2-customer-chat.js (842) → 3 module MOVE-only (4-consumer) — chat-infra XONG _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-091913-7d9fc8e` cho Claude walk chain theo CLAUDE.md protocol.
