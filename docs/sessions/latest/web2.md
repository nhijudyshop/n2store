# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-224803-5eef62c`
**Session file**: [`./20260615-224803-5eef62c.md`](../20260615-224803-5eef62c.md)
**Commit**: `5eef62c` — revert: gỡ bump api-config version nhầm trên 7 file Web 1.0 (Web1⊥Web2)
**Last updated**: 2026-06-15 22:48:03 +07
**Summary**: revert: gỡ bump api-config version nhầm trên 7 file Web 1.0 (Web1⊥Web2)

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`
- `web2/customers/index.html`
- `web2/overview/index.html`
- `web2/products/js/web2-products-print.js`
- `web2/supplier-debt/index.html`

## Last 5 commits touching `web2/`

- `b5e2ad166` chore(web2): xóa sạch chữ TPOS trong comment/doc Web 2.0 (reword giữ nghĩa) _(2026-06-15)_
- `e2d9d87b2` chore(web2): TPOS triệt để — doc sửa (web2*customers KHÔNG có cột tpos), DROP safety-net, rename var *(2026-06-15)\_
- `15cd722a6` fix(web2/live-chat): SĐT bị fb*id ghi đè (normPhone slice) + health-monitor 404 spam + dọn TPOS leftover *(2026-06-15)\_
- `4436fbf45` feat(web2): optimistic UI cho handler còn await trần (jt-tracking duyệt + page-builder xoá) _(2026-06-15)_
- `4aa663878` auto: session update _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-224803-5eef62c` cho Claude walk chain theo CLAUDE.md protocol.
