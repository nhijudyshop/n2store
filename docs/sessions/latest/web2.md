# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-183010-39f86f6`
**Session file**: [`./20260530-183010-39f86f6.md`](../20260530-183010-39f86f6.md)
**Commit**: `39f86f6` — refactor(web2-customer-wallet): TPOS primary source + Web 2.0 wallet overlay
**Last updated**: 2026-05-30 18:30:10 +07
**Summary**: refactor(web2-customer-wallet): TPOS primary source + Web 2.0 wallet overlay

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/js/web2-customer-wallet-app.js`
- `web2/delivery-carrier/index.html`
- `web2/history-cross-check-product/index.html`
- `web2/history-ds/index.html`
- `web2/partner-category-revenue-config/index.html`
- `web2/partner-category/index.html`
- `web2/partner-customer/index.html`
- `web2/partner-customer/js/partner-customer-app.js`
- `web2/partner-supplier/index.html`
- `web2/pos-config/index.html`
- `web2/pos-order/index.html`
- `web2/pos-session/index.html`
- `web2/revenue-began-customer/index.html`
- `web2/revenue-began-supplier/index.html`
- `web2/sale-order/index.html`
- `web2/sale-quotation/index.html`
- `web2/shared/tpos-sidebar.js`
- `web2/shared/web2-qr-modal.js`
- `web2/wi-invoice-config/index.html`
- `web2/wi-invoice-history/index.html`
- `web2/wi-invoice/index.html`

## Last 5 commits touching `web2/`

- `39f86f655` refactor(web2-customer-wallet): TPOS primary source + Web 2.0 wallet overlay _(2026-05-30)_
- `e666e9a56` feat(web2): QR auto-create + partner-customer QR button + sidebar cleanup 16 pages _(2026-05-30)_
- `6f4de490e` auto: session update _(2026-05-30)_
- `fbc87093f` auto: session update _(2026-05-30)_
- `26defed21` feat(web2-customer-wallet): tab QR VietQR — generate + display QR cho từng KH _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-183010-39f86f6` cho Claude walk chain theo CLAUDE.md protocol.
