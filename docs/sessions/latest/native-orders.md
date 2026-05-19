# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-164031-665ec94`
**Session file**: [`./20260519-164031-665ec94.md`](../20260519-164031-665ec94.md)
**Commit**: `665ec94` — fix(bill): barcode dùng JsBarcode SVG inline (bỏ dependency TPOS service)
**Last updated**: 2026-05-19 16:40:31 +07
**Summary**: fix(bill): barcode dùng JsBarcode SVG inline (bỏ dependency TPOS service)

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `665ec94f` fix(bill): barcode dùng JsBarcode SVG inline (bỏ dependency TPOS service) _(2026-05-19)_
- `afade1d8` feat(bill+reconcile): barcode PBH trên bill có thể quét → reconcile tự mở PBH _(2026-05-19)_
- `efa9c0bf` feat(reconcile+native-orders): hiển thị PBH 'draft' trong reconcile + nút huỷ PBH từ native-orders _(2026-05-19)_
- `9f628163` feat(native-orders): tách nút 'Gộp đơn' riêng + redesign bill 80mm đẹp hơn _(2026-05-19)_
- `928278da` feat(native-orders): move gộp đơn + in bill từ PBH page sang đúng chỗ (Đơn Web) _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-164031-665ec94` cho Claude walk chain theo CLAUDE.md protocol.
