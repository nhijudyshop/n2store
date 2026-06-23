# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-025220-38335c0`
**Session file**: [`./20260624-025220-38335c0.md`](../20260624-025220-38335c0.md)
**Commit**: `38335c0` — fix(web2): merge-to-pbh also dedups order_lines by code (same #5 bug as fast-sale-orders/merge)
**Last updated**: 2026-06-24 02:52:20 +07
**Summary**: fix(web2): merge-to-pbh also dedups order_lines by code (same #5 bug as fast-sale-orders/merge)

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-bulk-operations.js`

## Last 5 commits touching `native-orders/`

- `2ecbdb807` fix(web2): 5 money/stock conservation bugs from adversarial workflow audit _(2026-06-24)_
- `66a2f707d` fix(web2): split-PBH cancel restocks ALL splits + 5 frontend silent-failure surfaces _(2026-06-24)_
- `3c5b527dc` chore(web2): bump web2-sidebar.js/.css?v=20260623up1 (footer profile + avatar) trên 48 trang _(2026-06-23)_
- `33b442681` auto: session update _(2026-06-23)_
- `11b139eb0` feat(web2-printer): 2 chức năng tự chọn sẵn máy mặc định theo tên (PBH Huyền+Hạnh+Còi+Hồng, tem 2 mã SP) _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-025220-38335c0` cho Claude walk chain theo CLAUDE.md protocol.
