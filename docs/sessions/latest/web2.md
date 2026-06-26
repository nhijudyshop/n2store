# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-112641-3937235`
**Session file**: [`./20260626-112641-3937235.md`](../20260626-112641-3937235.md)
**Commit**: `3937235` — fix(so-order): in tem/mã SP dùng CHUNG module web2/products, gỡ modal 'In mã vạch' legacy fork
**Last updated**: 2026-06-26 11:26:41 +07
**Summary**: so-order in tem/mã SP dùng chung module web2/products, gỡ modal In mã vạch legacy

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-manual-deposit.js`
- `web2/chi-tieu/index.html`
- `web2/chi-tieu/js/chi-tieu-app.js`
- `web2/products/index.html`
- `web2/products/js/web2-product-detail.js`
- `web2/products/js/web2-products-modal.js`
- `web2/shared/web2-number-input.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-actions.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-actions.js`

## Last 5 commits touching `web2/`

- `39372353d` fix(so-order): in tem/mã SP dùng CHUNG module web2/products, gỡ modal 'In mã vạch' legacy fork _(2026-06-26)_
- `a8d6ef7c6` feat(purchase-orders↔so-order): xuất bảng PO (Web1) → mã base64 → nhập Sổ Order (Web2) _(2026-06-26)_
- `cc7cb0d99` auto: session update _(2026-06-26)_
- `21ef9d2e3` fix(web2/cham-cong): hôm nay chưa tan ca = 'đang làm', không tính chấm thiếu/đối soát (đến work*end+grace mới tính) *(2026-06-26)\_
- `523991aa3` feat(web2/cham-cong): NV chưa gán user không cần chấm công (ẩn khỏi Bảng công/Hôm nay/đối soát, giữ Bảng lương) _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-112641-3937235` cho Claude walk chain theo CLAUDE.md protocol.
