# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-185932-694760b`
**Session file**: [`./20260616-185932-694760b.md`](../20260616-185932-694760b.md)
**Commit**: `694760b` — docs(dev-log): web2-products NCC-split match — verified live (cross-NCC riêng, same-NCC gộp, adjust đối xứng)
**Last updated**: 2026-06-16 18:59:32 +07
**Summary**: docs(dev-log): web2-products NCC-split match — verified live (cross-NCC riêng, same-NCC gộp, adjust đối xứng)

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-products.js`

## Last 5 commits touching `render.com/`

- `6609ec405` fix(web2-products): upsert/adjust-pending match theo NCC — SP cùng tên+biến thể KHÁC NCC không gộp (mã prefix NCC riêng) _(2026-06-16)_
- `306e6ce6c` feat(customer-hub): double-click cột Ví khách hàng → xếp khách có công nợ lên đầu _(2026-06-16)_
- `ea1477ed2` feat(orders-report,render): ô check "đã kiểm tra/đã bán" cho strip + bỏ avatar (đồng bộ mọi máy theo chiến dịch) _(2026-06-16)_
- `3d2106113` auto: session update _(2026-06-16)_
- `a56d9d55c` fix(render): pending*customers sai múi giờ -7h — server emit ISO-UTC (strip báo trễ 7h) *(2026-06-16)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-185932-694760b` cho Claude walk chain theo CLAUDE.md protocol.
