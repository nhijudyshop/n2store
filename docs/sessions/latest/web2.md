# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-111802-a291f4d`
**Session file**: [`./20260518-111802-a291f4d.md`](../20260518-111802-a291f4d.md)
**Commit**: `a291f4d` — feat(web2-wallet): SePay deposit poll — ví KH match phone + ví NCC match content
**Last updated**: 2026-05-18 11:18:02 +07
**Summary**: feat(web2-wallet): SePay deposit poll — ví KH match phone + ví NCC match content

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/customer-wallet-app.js`
- `web2/customer-wallet/js/customer-wallet-storage.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-app.js`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`

## Last 5 commits touching `web2/`

- `a291f4d8` feat(web2-wallet): SePay deposit poll — ví KH match phone + ví NCC match content _(2026-05-18)_
- `cc2c8ff4` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_
- `7eb39f57` refactor(web2): move web2-shared to web2/shared (consolidate Web 2.0) _(2026-05-18)_
- `c049756e` feat(web2): filter cancelled PBH + pagination + stock tracking + SePay endpoint + WEB2.0 markers _(2026-05-18)_
- `0c3c1310` chore(web2): xóa nốt fastpurchaseorder-refund + audit data flow _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-111802-a291f4d` cho Claude walk chain theo CLAUDE.md protocol.
