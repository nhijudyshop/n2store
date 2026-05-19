# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-164413-36b72c3`
**Session file**: [`./20260519-164413-36b72c3.md`](../20260519-164413-36b72c3.md)
**Commit**: `36b72c3` — feat(bill): NJD Live → NHI JUDY, gộp SĐT vào dòng Khách, bỏ hint barcode
**Last updated**: 2026-05-19 16:44:13 +07
**Summary**: feat(bill): NJD Live → NHI JUDY, gộp SĐT vào dòng Khách, bỏ hint barcode

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `36b72c33` feat(bill): NJD Live → NHI JUDY, gộp SĐT vào dòng Khách, bỏ hint barcode _(2026-05-19)_
- `665ec94f` fix(bill): barcode dùng JsBarcode SVG inline (bỏ dependency TPOS service) _(2026-05-19)_
- `afade1d8` feat(bill+reconcile): barcode PBH trên bill có thể quét → reconcile tự mở PBH _(2026-05-19)_
- `efa9c0bf` feat(reconcile+native-orders): hiển thị PBH 'draft' trong reconcile + nút huỷ PBH từ native-orders _(2026-05-19)_
- `9f628163` feat(native-orders): tách nút 'Gộp đơn' riêng + redesign bill 80mm đẹp hơn _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-164413-36b72c3` cho Claude walk chain theo CLAUDE.md protocol.
