# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-193920-124fe74`
**Session file**: [`./20260613-193920-124fe74.md`](../20260613-193920-124fe74.md)
**Commit**: `124fe74` — refactor(web2): gỡ dead Firebase — 8 trang firebase-free + fix manual-deposit stale ledger
**Last updated**: 2026-06-13 19:39:20 +07
**Summary**: refactor(web2): gỡ dead Firebase — 8 trang firebase-free + fix manual-deposit stale ledger

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-manual-deposit.js`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/report-delivery/index.html`
- `web2/returns/index.html`
- `web2/shared/web2-variants-cache.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`
- `web2/variants/index.html`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-app.js`

## Last 5 commits touching `web2/`

- `124fe747f` refactor(web2): gỡ dead Firebase — 8 trang firebase-free + fix manual-deposit stale ledger _(2026-06-13)_
- `626b8af76` fix(web2-zalo): list nhom bo prefix nguoi gui khi trung ten nhom _(2026-06-13)_
- `8ddb60bfa` auto: session update _(2026-06-13)_
- `d9bcc5030` fix(web2): C8 cross-page — consumers đọc so-order từ Postgres (không Firestore frozen) _(2026-06-13)_
- `fa8661c70` feat(web2-zalo): cau truc tin nhom dung - resolve ten+avatar nguoi gui (getGroupMembersInfo + cache web2*zalo_members), selfListen=true bat tin shop tu gui, bubble hien avatar+ten that nhom *(2026-06-13)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-193920-124fe74` cho Claude walk chain theo CLAUDE.md protocol.
