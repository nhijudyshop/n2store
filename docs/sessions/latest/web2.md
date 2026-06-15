# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-223124-e2d9d87`
**Session file**: [`./20260615-223124-e2d9d87.md`](../20260615-223124-e2d9d87.md)
**Commit**: `e2d9d87` — chore(web2): TPOS triệt để — doc sửa (web2_customers KHÔNG có cột tpos), DROP safety-net, rename var
**Last updated**: 2026-06-15 22:31:24 +07
**Summary**: chore(web2): TPOS triệt để — doc sửa (web2_customers KHÔNG có cột tpos), DROP safety-net, rename var

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customer-wallet/index.html`
- `web2/overview/index.html`
- `web2/shared/web2-customer-store.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `e2d9d87b2` chore(web2): TPOS triệt để — doc sửa (web2*customers KHÔNG có cột tpos), DROP safety-net, rename var *(2026-06-15)\_
- `15cd722a6` fix(web2/live-chat): SĐT bị fb*id ghi đè (normPhone slice) + health-monitor 404 spam + dọn TPOS leftover *(2026-06-15)\_
- `4436fbf45` feat(web2): optimistic UI cho handler còn await trần (jt-tracking duyệt + page-builder xoá) _(2026-06-15)_
- `4aa663878` auto: session update _(2026-06-15)_
- `c318b9885` refactor(web2/P5): gom colorShortMap về Web2VariantsCache.getColorShortMap (memoize) _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-223124-e2d9d87` cho Claude walk chain theo CLAUDE.md protocol.
