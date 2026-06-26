# Latest Snapshot — `purchase-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-110623-a8d6ef7`
**Session file**: [`./20260626-110623-a8d6ef7.md`](../20260626-110623-a8d6ef7.md)
**Commit**: `a8d6ef7` — feat(purchase-orders↔so-order): xuất bảng PO (Web1) → mã base64 → nhập Sổ Order (Web2)
**Last updated**: 2026-06-26 11:06:23 +07
**Summary**: Cầu nối xuất bảng PO (Web1) → mã base64 → nhập Sổ Order (Web2), tách layer

## Files changed in this commit (`purchase-orders/`)

- `purchase-orders/js/lib/so-order-export.js`

## Last 5 commits touching `purchase-orders/`

- `a8d6ef7c6` feat(purchase-orders↔so-order): xuất bảng PO (Web1) → mã base64 → nhập Sổ Order (Web2) _(2026-06-26)_
- `cc7cb0d99` auto: session update _(2026-06-26)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `1940a8e00` auto: session update _(2026-06-19)_
- `975dbbd76` feat(barcode-label-dialog): pixel-match TPOS 100% — purple btn + Kho dropdown + Gan ton _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-110623-a8d6ef7` cho Claude walk chain theo CLAUDE.md protocol.
