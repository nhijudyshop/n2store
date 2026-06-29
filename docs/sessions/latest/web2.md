# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-000559-6fc0027`
**Session file**: [`./20260630-000559-6fc0027.md`](../20260630-000559-6fc0027.md)
**Commit**: `6fc0027` — feat(web2-zalo): đăng nhập GLOBAL always-on — admin, 2 cách (cookie/QR), lưu server + auto-refresh
**Last updated**: 2026-06-30 00:05:59 +07
**Summary**: web2-zalo: đăng nhập GLOBAL always-on (admin, cookie/QR, lưu server + auto-refresh)

## Files changed in this commit (`web2/`)

- `web2/shared/web2-zalo-api.js`
- `web2/shared/web2-zalo.js`
- `web2/zalo/css/web2-zalo.css`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-accounts.js`
- `web2/zalo/js/web2-zalo-app.js`

## Last 5 commits touching `web2/`

- `6fc002794` feat(web2-zalo): đăng nhập GLOBAL always-on — admin, 2 cách (cookie/QR), lưu server + auto-refresh _(2026-06-30)_
- `8446e7bac` feat(web2-variants): trường Nhóm modal → SELECT bắt buộc (Màu/Size) _(2026-06-29)_
- `9403ec175` perf(in-bill): gộp Phiếu Soạn Hàng vào đường in chung Web2Bill + bridge _(2026-06-29)_
- `c09724e18` feat(putwall): đèn put-to-light (ESP32+WS2811) cho Quét tem + tài liệu lắp/mua _(2026-06-29)_
- `f92f54010` auto: session update _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-000559-6fc0027` cho Claude walk chain theo CLAUDE.md protocol.
