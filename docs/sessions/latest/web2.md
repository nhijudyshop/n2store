# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-164413-36b72c3`
**Session file**: [`./20260519-164413-36b72c3.md`](../20260519-164413-36b72c3.md)
**Commit**: `36b72c3` — feat(bill): NJD Live → NHI JUDY, gộp SĐT vào dòng Khách, bỏ hint barcode
**Last updated**: 2026-05-19 16:44:13 +07
**Summary**: feat(bill): NJD Live → NHI JUDY, gộp SĐT vào dòng Khách, bỏ hint barcode

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `36b72c33` feat(bill): NJD Live → NHI JUDY, gộp SĐT vào dòng Khách, bỏ hint barcode _(2026-05-19)_
- `665ec94f` fix(bill): barcode dùng JsBarcode SVG inline (bỏ dependency TPOS service) _(2026-05-19)_
- `afade1d8` feat(bill+reconcile): barcode PBH trên bill có thể quét → reconcile tự mở PBH _(2026-05-19)_
- `5e460acf` fix(web2/reconcile): hide empty-state when list has items (CSS display:flex overrode [hidden]) _(2026-05-19)_
- `956084fa` fix(web2/reconcile): mount sidebar via Web2Sidebar.mount + redeploy CF Worker _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-164413-36b72c3` cho Claude walk chain theo CLAUDE.md protocol.
