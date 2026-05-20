# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260520-112443-e4a31f2`
**Session file**: [`./20260520-112443-e4a31f2.md`](../20260520-112443-e4a31f2.md)
**Commit**: `e4a31f2` — test(web2): final smoke verify — 87/87 Web 2.0 pages clean, 0 errors
**Last updated**: 2026-05-20 11:24:43 +07
**Summary**: test(web2): final smoke verify — 87/87 Web 2.0 pages clean, 0 errors

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `fca5c7ec` fix(web2/realtime): stop retry direct WS sau handshake fail + skip direct trong webdriver _(2026-05-20)_
- `7b2eadd2` fix(web2/sidebar): preload web2-auth.js ở 19 trang load tpos-sidebar trực tiếp _(2026-05-19)_
- `6a40c72b` perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant _(2026-05-19)_
- `36b72c33` feat(bill): NJD Live → NHI JUDY, gộp SĐT vào dòng Khách, bỏ hint barcode _(2026-05-19)_
- `665ec94f` fix(bill): barcode dùng JsBarcode SVG inline (bỏ dependency TPOS service) _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260520-112443-e4a31f2` cho Claude walk chain theo CLAUDE.md protocol.
