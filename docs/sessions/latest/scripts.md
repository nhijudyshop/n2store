# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-131827-ba75d7a`
**Session file**: [`./20260518-131827-ba75d7a.md`](../20260518-131827-ba75d7a.md)
**Commit**: `ba75d7a` — feat(scripts): seeder fake demo data cho Web 2.0
**Last updated**: 2026-05-18 13:18:27 +07
**Summary**: feat(scripts): seeder fake demo data cho Web 2.0

## Files changed in this commit (`scripts/`)

- `scripts/seed-fake-web2-demo.mjs`

## Last 5 commits touching `scripts/`

- `ba75d7a3` feat(scripts): seeder fake demo data cho Web 2.0 _(2026-05-18)_
- `6f055e41` fix(web2): broken paths sau khi move web2-products/web2-variants vào web2/ _(2026-05-18)_
- `cc2c8ff4` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_
- `c049756e` feat(web2): filter cancelled PBH + pagination + stock tracking + SePay endpoint + WEB2.0 markers _(2026-05-18)_
- `0c3c1310` chore(web2): xóa nốt fastpurchaseorder-refund + audit data flow _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-131827-ba75d7a` cho Claude walk chain theo CLAUDE.md protocol.
