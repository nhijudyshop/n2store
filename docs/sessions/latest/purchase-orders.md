# Latest Snapshot — `purchase-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-135928-29452c1`
**Session file**: [`./20260626-135928-29452c1.md`](../20260626-135928-29452c1.md)
**Commit**: `29452c1` — fix(purchase-orders): tạo đơn với SP cũ (lấy từ Kho) qua được Chờ mua, không kẹt Nháp
**Last updated**: 2026-06-26 13:59:28
**Summary**: fix(purchase-orders): tạo đơn SP cũ từ Kho qua được Chờ mua (không kẹt Nháp)

## Files changed in this commit (`purchase-orders/`)
- `purchase-orders/js/form-modal.js`
- `purchase-orders/js/lib/tpos-product-creator.js`
- `purchase-orders/js/main.js`

## Last 5 commits touching `purchase-orders/`
- `29452c181` fix(purchase-orders): tạo đơn với SP cũ (lấy từ Kho) qua được Chờ mua, không kẹt Nháp _(2026-06-26)_
- `a8d6ef7c6` feat(purchase-orders↔so-order): xuất bảng PO (Web1) → mã base64 → nhập Sổ Order (Web2) _(2026-06-26)_
- `cc7cb0d99` auto: session update _(2026-06-26)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `1940a8e00` auto: session update _(2026-06-19)_

---
**Để tiếp tục context trong session mới:**
1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-135928-29452c1` cho Claude walk chain theo CLAUDE.md protocol.
