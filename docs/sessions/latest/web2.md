# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-154453-e45084d`
**Session file**: [`./20260607-154453-e45084d.md`](../20260607-154453-e45084d.md)
**Commit**: `e45084d` — feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR
**Last updated**: 2026-06-07 15:44:53 +07
**Summary**: feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `e45084d15` feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR _(2026-06-07)_
- `2b1a72bb8` feat(web2/chat): Feature 2 sticker-send (built-in pack qua REPLY*INBOX_PHOTO STICKER, không cần sửa extension); test OK *(2026-06-07)\_
- `cdd7bd14a` auto: session update _(2026-06-07)_
- `5c77fce83` feat(web2/chat): Feature 3 — nhận diện SĐT/địa chỉ trong chat + Thêm vào KH (fill đơn + upsert web2*customers); test OK *(2026-06-07)\_
- `d9ae5666d` auto: session update _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-154453-e45084d` cho Claude walk chain theo CLAUDE.md protocol.
