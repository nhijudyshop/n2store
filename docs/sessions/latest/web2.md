# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-163837-65df914`
**Session file**: [`./20260607-163837-65df914.md`](../20260607-163837-65df914.md)
**Commit**: `65df914` — feat(web2): Phase 3 — trang Kho Khách Hàng web2/customers (warehouse UI, KHÔNG TPOS)
**Last updated**: 2026-06-07 16:38:37 +07
**Summary**: feat(web2): Phase 3 — trang Kho Khách Hàng web2/customers (warehouse UI, KHÔNG TPOS)

## Files changed in this commit (`web2/`)

- `web2/customers/css/customers.css`
- `web2/customers/index.html`
- `web2/customers/js/customers-api.js`
- `web2/customers/js/customers-app.js`
- `web2/shared/tpos-sidebar.js`
- `web2/shared/web2-customer-detail-modal.js`

## Last 5 commits touching `web2/`

- `65df914dd` feat(web2): Phase 3 — trang Kho Khách Hàng web2/customers (warehouse UI, KHÔNG TPOS) _(2026-06-07)_
- `e45084d15` feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR _(2026-06-07)_
- `2b1a72bb8` feat(web2/chat): Feature 2 sticker-send (built-in pack qua REPLY*INBOX_PHOTO STICKER, không cần sửa extension); test OK *(2026-06-07)\_
- `cdd7bd14a` auto: session update _(2026-06-07)_
- `5c77fce83` feat(web2/chat): Feature 3 — nhận diện SĐT/địa chỉ trong chat + Thêm vào KH (fill đơn + upsert web2*customers); test OK *(2026-06-07)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-163837-65df914` cho Claude walk chain theo CLAUDE.md protocol.
