# Latest Snapshot — `product-warehouse/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260526-094527-0a730ae`
**Session file**: [`./20260526-094527-0a730ae.md`](../20260526-094527-0a730ae.md)
**Commit**: `0a730ae` — fix(product-warehouse): stock adjust SP có nhiều biến thể (Active=false bị ẩn)
**Last updated**: 2026-05-26 09:45:27 +07
**Summary**: fix(product-warehouse): stock adjust SP có nhiều biến thể (Active=false bị ẩn)

## Files changed in this commit (`product-warehouse/`)

- `product-warehouse/js/main.js`

## Last 5 commits touching `product-warehouse/`

- `0a730aeb2` fix(product-warehouse): stock adjust SP có nhiều biến thể (Active=false bị ẩn) _(2026-05-26)_
- `2f066d5db` perf(product-warehouse): optimistic UI update + background save (10× faster) _(2026-05-26)_
- `8421a5881` feat(product-warehouse): variant DefaultCode rỗng → TPOS auto-generate _(2026-05-26)_
- `079ac3568` auto: session update _(2026-05-25)_
- `ff3002c8d` auto: session update _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260526-094527-0a730ae` cho Claude walk chain theo CLAUDE.md protocol.
