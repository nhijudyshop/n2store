# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-101759-9f34fee`
**Session file**: [`./20260518-101759-9f34fee.md`](../20260518-101759-9f34fee.md)
**Commit**: `9f34fee` — feat(web2): Ví NCC + Ví KH — công nợ + trả hàng + 30-day cleanup
**Last updated**: 2026-05-18 10:17:59 +07
**Summary**: feat(web2): Ví NCC + Ví KH — công nợ + trả hàng + 30-day cleanup

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/css/customer-wallet.css`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/customer-wallet-app.js`
- `web2/customer-wallet/js/customer-wallet-storage.js`
- `web2/supplier-wallet/css/supplier-wallet.css`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-app.js`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`

## Last 5 commits touching `web2/`

- `9f34fee9` feat(web2): Ví NCC + Ví KH — công nợ + trả hàng + 30-day cleanup _(2026-05-18)_
- `5922ea4d` fix(web2-shared): sidebar collapsed — labels bleed + toggle bị che _(2026-05-18)_
- `034b2608` chore(web2): xóa 2 trang TPOS-clone product-template + product-variant _(2026-05-17)_
- `4c16c749` feat(web2): pancake-settings page — manage JWT + page tokens inside Web 2.0 _(2026-05-14)_
- `e34d5868` auto: session update _(2026-05-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-101759-9f34fee` cho Claude walk chain theo CLAUDE.md protocol.
