# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-104704-0c3c131`
**Session file**: [`./20260518-104704-0c3c131.md`](../20260518-104704-0c3c131.md)
**Commit**: `0c3c131` — chore(web2): xóa nốt fastpurchaseorder-refund + audit data flow
**Last updated**: 2026-05-18 10:47:04 +07
**Summary**: chore(web2): xóa nốt fastpurchaseorder-refund + audit data flow

## Files changed in this commit (`scripts/`)

- `scripts/n2store-smoke-all-pages.js`
- `scripts/web2-seed-from-tpos.js`

## Last 5 commits touching `scripts/`

- `0c3c1310` chore(web2): xóa nốt fastpurchaseorder-refund + audit data flow _(2026-05-18)_
- `711bc520` auto: session update _(2026-05-18)_
- `94ff7754` feat(web2): bulk seed 108 biến thể từ bienthe.txt vào Kho Biến Thể _(2026-05-18)_
- `9b6ec895` auto: session update _(2026-05-15)_
- `663f853a` feat(native-orders): sidebar search wired to Pancake server-side endpoint _(2026-05-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-104704-0c3c131` cho Claude walk chain theo CLAUDE.md protocol.
