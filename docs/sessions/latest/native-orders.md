# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-165429-6a40c72`
**Session file**: [`./20260519-165429-6a40c72.md`](../20260519-165429-6a40c72.md)
**Commit**: `6a40c72` — perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant
**Last updated**: 2026-05-19 16:54:29 +07
**Summary**: perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `6a40c72b` perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant _(2026-05-19)_
- `36b72c33` feat(bill): NJD Live → NHI JUDY, gộp SĐT vào dòng Khách, bỏ hint barcode _(2026-05-19)_
- `665ec94f` fix(bill): barcode dùng JsBarcode SVG inline (bỏ dependency TPOS service) _(2026-05-19)_
- `afade1d8` feat(bill+reconcile): barcode PBH trên bill có thể quét → reconcile tự mở PBH _(2026-05-19)_
- `efa9c0bf` feat(reconcile+native-orders): hiển thị PBH 'draft' trong reconcile + nút huỷ PBH từ native-orders _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-165429-6a40c72` cho Claude walk chain theo CLAUDE.md protocol.
