# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-174525-4b338d2`
**Session file**: [`./20260518-174525-4b338d2.md`](../20260518-174525-4b338d2.md)
**Commit**: `4b338d2` — feat(so-order): bảng giống native-orders — font Segoe UI + header bg + button action màu
**Last updated**: 2026-05-18 17:45:25 +07
**Summary**: feat(so-order): bảng giống native-orders — font Segoe UI + header bg + button action màu

## Files changed in this commit (`scripts/`)

- `scripts/_tmp-prods-footer.mjs`

## Last 5 commits touching `scripts/`

- `4b338d24` feat(so-order): bảng giống native-orders — font Segoe UI + header bg + button action màu _(2026-05-18)_
- `ba75d7a3` feat(scripts): seeder fake demo data cho Web 2.0 _(2026-05-18)_
- `6f055e41` fix(web2): broken paths sau khi move web2-products/web2-variants vào web2/ _(2026-05-18)_
- `cc2c8ff4` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_
- `c049756e` feat(web2): filter cancelled PBH + pagination + stock tracking + SePay endpoint + WEB2.0 markers _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-174525-4b338d2` cho Claude walk chain theo CLAUDE.md protocol.
