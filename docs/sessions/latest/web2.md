# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-171528-4d33cab`
**Session file**: [`./20260628-171528-4d33cab.md`](../20260628-171528-4d33cab.md)
**Commit**: `4d33cab` — feat(supplier-pay): modal Thanh toán NCC dùng CHUNG (Web2SupplierPay) — NCC tab-strip+search+A→Z
**Last updated**: 2026-06-28 17:15:28 +07
**Summary**: Web2SupplierPay shared modal — NCC pay 1 nguồn (so-order picker + supplier-debt fixed); bỏ pay ở Ví NCC

## Files changed in this commit (`web2/`)

- `web2/shared/web2-supplier-pay.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-actions.js`
- `web2/supplier-debt/js/supplier-debt-app.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-actions.js`
- `web2/supplier-wallet/js/supplier-wallet-app.js`

## Last 5 commits touching `web2/`

- `4d33cabfb` feat(supplier-pay): modal Thanh toán NCC dùng CHUNG (Web2SupplierPay) — NCC tab-strip+search+A→Z _(2026-06-28)_
- `ca6df464a` feat(web2/system): sổ tay SSE trong tab SSE + fix 4 gap subscribe web2:so-order (supplier-debt/purchase-refund/live-chat/dashboard) _(2026-06-28)_
- `4383e15d2` feat(ai-widget): full-data theo cache browser (Web2SmartCache/IDB) + freshness gate + nút nạp _(2026-06-28)_
- `e1c137b99` feat(web2/system): tab 'Gợi ý AI' — quản lý gợi ý + accessor widget AI theo từng trang _(2026-06-28)_
- `d2b9c0b6b` auto: session update _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-171528-4d33cab` cho Claude walk chain theo CLAUDE.md protocol.
