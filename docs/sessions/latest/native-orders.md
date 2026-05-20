# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260520-155309-0599b1d`
**Session file**: [`./20260520-155309-0599b1d.md`](../20260520-155309-0599b1d.md)
**Commit**: `0599b1d` — feat(web2): page-tag comments, frontend wire 3 endpoints, Trả hàng NCC stub
**Last updated**: 2026-05-20 15:53:09 +07
**Summary**: feat(web2): page-tag comments, frontend wire 3 endpoints, Trả hàng NCC stub

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `0599b1dd` feat(web2): page-tag comments, frontend wire 3 endpoints, Trả hàng NCC stub _(2026-05-20)_
- `fca5c7ec` fix(web2/realtime): stop retry direct WS sau handshake fail + skip direct trong webdriver _(2026-05-20)_
- `7b2eadd2` fix(web2/sidebar): preload web2-auth.js ở 19 trang load tpos-sidebar trực tiếp _(2026-05-19)_
- `6a40c72b` perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant _(2026-05-19)_
- `36b72c33` feat(bill): NJD Live → NHI JUDY, gộp SĐT vào dòng Khách, bỏ hint barcode _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260520-155309-0599b1d` cho Claude walk chain theo CLAUDE.md protocol.
