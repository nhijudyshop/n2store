# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-180403-7f6835e`
**Session file**: [`./20260616-180403-7f6835e.md`](../20260616-180403-7f6835e.md)
**Commit**: `7f6835e` — feat(web2/products): Kho SP nhập nhiều biến thể (Màu × Size → N SP) qua shared Web2VariantMulti.cartesian + preview
**Last updated**: 2026-06-16 18:04:03 +07
**Summary**: feat(web2/products): Kho SP nhập nhiều biến thể (Màu × Size → N SP) qua shared Web2VariantMulti.cartesian...

## Files changed in this commit (`web2/`)

- `web2/products/css/web2-products.css`
- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`
- `web2/shared/web2-variant-multi.js`

## Last 5 commits touching `web2/`

- `7f6835ef0` feat(web2/products): Kho SP nhập nhiều biến thể (Màu × Size → N SP) qua shared Web2VariantMulti.cartesian + preview _(2026-06-16)_
- `333e773dc` feat(so-order/shared): nhập nhanh nhiều biến thể Web2VariantMulti — 'Đen / S / M / L' → N SP (parser màu/size + expand + live preview) _(2026-06-16)_
- `0c0870b0a` feat(so-order/kho): Part B — Kho SP lưu origin*currency/origin_rate, hover hiện giá gốc ngoại tệ (CNY); write paths gửi origin lúc nhập *(2026-06-16)\_
- `f9e397868` auto: session update _(2026-06-16)_
- `158adf4e7` docs(web2): sync overview + pages-analysis cho money-model nhận-hàng (rule 9) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-180403-7f6835e` cho Claude walk chain theo CLAUDE.md protocol.
