# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-084909-3276a05`
**Session file**: [`./20260523-084909-3276a05.md`](../20260523-084909-3276a05.md)
**Commit**: `3276a05` — fix(products/usage + cart): match products[] shape giữa cart (code/qty) và modal (productCode/quantity)
**Last updated**: 2026-05-23 08:49:09 +07
**Summary**: fix(products/usage + cart): match products[] shape giữa cart (code/qty) và modal (productCode/quantity)

## Files changed in this commit (`render.com/`)

- `render.com/routes/fast-sale-orders.js`
- `render.com/routes/v2/cart.js`
- `render.com/routes/web2-products.js`

## Last 5 commits touching `render.com/`

- `3276a055f` fix(products/usage + cart): match products[] shape giữa cart (code/qty) và modal (productCode/quantity) _(2026-05-23)_
- `f23eeffe9` feat(native-orders): lock edit khi status='confirmed' (đã tạo PBH) + bỏ merge confirmed _(2026-05-22)_
- `029b345d8` fix(fast-sale-orders/cancel): SELECT source*code+source_type để sync ngược native_order *(2026-05-22)\_
- `1aa81b75c` refactor(v2/cart + tpos-pancake): giỏ TPOS panel = native*orders.products (1 nguồn) *(2026-05-22)\_
- `f3680e29c` fix(v2/cart): /add lookup noc bỏ qua soft-deleted rows + clear null out native*order_code *(2026-05-22)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-084909-3276a05` cho Claude walk chain theo CLAUDE.md protocol.
