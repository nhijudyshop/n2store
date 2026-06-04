# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-172357-93b772c`
**Session file**: [`./20260604-172357-93b772c.md`](../20260604-172357-93b772c.md)
**Commit**: `93b772c` — docs(dev-log): thu ho vi + badge thanh toan/doi soat + PBH SHOP
**Last updated**: 2026-06-04 17:23:57 +07
**Summary**: docs(dev-log): thu ho vi + badge thanh toan/doi soat + PBH SHOP

## Files changed in this commit (`scripts/`)

- `scripts/test-pbh-wallet-cod.js`

## Last 5 commits touching `scripts/`

- `8ca7391c9` fix(PBH): luu carrier*name khi tao tu native-order (PBH SHOP/phuong thuc hien tren bill+badge) *(2026-06-04)\_
- `4046fe3ac` feat(web2): trang cau hinh Phuong thuc giao hang (entity deliveryzone) + menu Cau hinh _(2026-06-04)_
- `d1982a67b` refactor(web2 supplier-debt): cat sach coupling TPOS/inventory*shipments (Web 1.0) *(2026-06-04)\_
- `dce18bb44` feat(web2): localize anh SP (data URL webp) + hover zoom reconcile _(2026-06-04)_
- `484af0fa2` feat(web2): supplier-debt khop So Order (debt = cost tung NCC) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-172357-93b772c` cho Claude walk chain theo CLAUDE.md protocol.
