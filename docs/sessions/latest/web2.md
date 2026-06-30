# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-114332-1b22053`
**Session file**: [`./20260630-114332-1b22053.md`](../20260630-114332-1b22053.md)
**Commit**: `1b22053` — feat(shared): Web2ProductStatus 1 nguồn trạng thái SP + badge 'chờ hàng' live-chat (P2); migrate web2/products khỏi fork
**Last updated**: 2026-06-30 11:43:32 +07
**Summary**: feat(shared): Web2ProductStatus 1 nguồn trạng thái SP + badge 'chờ hàng' live-chat (P2); migrate web2/product...

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-product-detail.js`
- `web2/products/js/web2-products-render.js`
- `web2/shared/web2-product-status.js`

## Last 5 commits touching `web2/`

- `1b2205386` feat(shared): Web2ProductStatus 1 nguồn trạng thái SP + badge 'chờ hàng' live-chat (P2); migrate web2/products khỏi fork _(2026-06-30)_
- `159ebbc74` feat(system): thêm card 'Địa danh (vùng nguồn hàng)' vào tab services — CHO VƯỢT vs pre-order + công thức NCC/GIỎ/CÒN/VƯỢT _(2026-06-30)_
- `0128f1a27` fix(live-control): sửa nhầm 'pre-order' — vùng CHỌN = CHO VƯỢT (hàng có sẵn), vùng KHÔNG chọn mới là pre-order _(2026-06-30)_
- `34f23fef2` fix(live-control): đổi nhãn dropdown 'MỚI theo' → 'Cho VƯỢT theo' (đúng chức năng pre-order, không lọc cột MỚI) _(2026-06-30)_
- `79afb759a` fix(soan-hang): tách toggle IN khỏi is*active → cột print_enabled (tag VẪN hiện khi tắt in) *(2026-06-30)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-114332-1b22053` cho Claude walk chain theo CLAUDE.md protocol.
