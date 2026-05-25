# Latest Snapshot — `product-warehouse/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-143026-2815bca`
**Session file**: [`./20260525-143026-2815bca.md`](../20260525-143026-2815bca.md)
**Commit**: `2815bca` — auto: session update
**Last updated**: 2026-05-25 14:30:26 +07
**Summary**: auto: session update

## Files changed in this commit (`product-warehouse/`)

- `product-warehouse/js/main.js`

## Last 5 commits touching `product-warehouse/`

- `4ff748909` fix(product-warehouse): stock adjust dùng StockInventory + open TPOS form _(2026-05-25)_
- `bed2595d6` auto: session update _(2026-05-25)_
- `bba69c191` fix(product-warehouse): ensureAttributesList — fetch values từ endpoint riêng _(2026-05-25)_
- `e07b2c1ed` fix(product-warehouse): edit modal save — strip nested + allowlist UOMLines + omit empty Tags _(2026-05-25)_
- `65234fb17` feat(product-warehouse): wire 4 missing expand tabs với TPOS endpoints thật _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-143026-2815bca` cho Claude walk chain theo CLAUDE.md protocol.
