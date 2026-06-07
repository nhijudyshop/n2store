# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-164345-d8b59e4`
**Session file**: [`./20260607-164345-d8b59e4.md`](../20260607-164345-d8b59e4.md)
**Commit**: `d8b59e4` — feat(web2/bill): PBH đổi Code128 → QR Code
**Last updated**: 2026-06-07 16:43:45 +07
**Summary**: feat(web2/bill): PBH đổi Code128 → QR Code

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/shared/qrcode.min.js`
- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `d8b59e44e` feat(web2/bill): PBH đổi Code128 → QR Code _(2026-06-07)_
- `65df914dd` feat(web2): Phase 3 — trang Kho Khách Hàng web2/customers (warehouse UI, KHÔNG TPOS) _(2026-06-07)_
- `e45084d15` feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR _(2026-06-07)_
- `2b1a72bb8` feat(web2/chat): Feature 2 sticker-send (built-in pack qua REPLY*INBOX_PHOTO STICKER, không cần sửa extension); test OK *(2026-06-07)\_
- `cdd7bd14a` auto: session update _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-164345-d8b59e4` cho Claude walk chain theo CLAUDE.md protocol.
