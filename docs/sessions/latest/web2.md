# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-144551-1015d5b`
**Session file**: [`./20260522-144551-1015d5b.md`](../20260522-144551-1015d5b.md)
**Commit**: `1015d5b` — feat(web2/products): NCC dropdown từ so_order_v2 + auto-regen mã khi đổi NCC/Tên/Biến thể
**Last updated**: 2026-05-22 14:45:51 +07
**Summary**: feat(web2/products): NCC dropdown từ so_order_v2 + auto-regen mã khi đổi NCC/Tên/Biến thể

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`

## Last 5 commits touching `web2/`

- `1015d5bc4` feat(web2/products): NCC dropdown từ so*order_v2 + auto-regen mã khi đổi NCC/Tên/Biến thể *(2026-05-22)\_
- `44f60e4fb` fix(web2/products): bỏ customPrefix + prompt — mã auto-gen từ NCC, không phải 'gợi ý' _(2026-05-22)_
- `0e1cb1f45` fix(web2/product-code): bỏ SP default — bắt buộc nhập prefix tay khi không có NCC _(2026-05-22)_
- `8639f228f` feat(web2/product-code): update rule shop — 6 keyword + MM fallback + HC1 collision + SP default _(2026-05-22)_
- `6be61baf8` revert(web2): gỡ F10 variants-matrix — bỏ cách tạo mã SP auto <base>-<size>-<color> _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-144551-1015d5b` cho Claude walk chain theo CLAUDE.md protocol.
