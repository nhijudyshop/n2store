# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-204320-6e4a616`
**Session file**: [`./20260627-204320-6e4a616.md`](../20260627-204320-6e4a616.md)
**Commit**: `6e4a616` — feat(so-order): gom SP cha nhiều biến thể — tên cha 1 lần, biến thể '↳' thụt khối
**Last updated**: 2026-06-27 20:43:20 +07
**Summary**: feat(so-order): gom SP cha nhiều biến thể — tên cha 1 lần, biến thể '↳' thụt khối

## Files changed in this commit (`web2/`)

- `web2/live-control/index.html`
- `web2/live-tv/css/live-tv.css`
- `web2/live-tv/index.html`
- `web2/products/css/web2-products.css`
- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`
- `web2/products/js/web2-products-render.js`
- `web2/products/js/web2-products-state.js`
- `web2/shared/web2-live-tv-display.js`

## Last 5 commits touching `web2/`

- `8b13954f0` feat(web2/products): P4 Kho SP gom SP cha-con — dòng cha + mã cha + expand sửa con _(2026-06-27)_
- `ae250b66d` fix(web2/live): "SẮP HẾT" theo tỉ lệ NCC + biến thể dài không bị cắt "..." trên TV _(2026-06-27)_
- `cac3cb780` fix(web2/live-control): đổi nhãn 'KH theo' → 'MỚI theo' (khớp cột MỚI) _(2026-06-27)_
- `ab27764bc` feat(web2/live-control): địa danh KH pre-order chỉ admin chỉnh + cảnh báo _(2026-06-27)_
- `426597158` feat(web2/live): gom SP cha-con nhiều biến thể thành 1 card (by:'parent') _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-204320-6e4a616` cho Claude walk chain theo CLAUDE.md protocol.
