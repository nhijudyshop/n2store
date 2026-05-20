# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260520-162818-ea49f58`
**Session file**: [`./20260520-162818-ea49f58.md`](../20260520-162818-ea49f58.md)
**Commit**: `ea49f58` — feat(web2): 2-way state sync native-orders ↔ PBH + nút Huỷ đơn + bỏ Xác nhận PBH
**Last updated**: 2026-05-20 16:28:18 +07
**Summary**: feat(web2): 2-way state sync native-orders ↔ PBH + nút Huỷ đơn + bỏ Xác nhận PBH

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `ea49f58f` feat(web2): 2-way state sync native-orders ↔ PBH + nút Huỷ đơn + bỏ Xác nhận PBH _(2026-05-20)_
- `0599b1dd` feat(web2): page-tag comments, frontend wire 3 endpoints, Trả hàng NCC stub _(2026-05-20)_
- `fca5c7ec` fix(web2/realtime): stop retry direct WS sau handshake fail + skip direct trong webdriver _(2026-05-20)_
- `7b2eadd2` fix(web2/sidebar): preload web2-auth.js ở 19 trang load tpos-sidebar trực tiếp _(2026-05-19)_
- `6a40c72b` perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260520-162818-ea49f58` cho Claude walk chain theo CLAUDE.md protocol.
