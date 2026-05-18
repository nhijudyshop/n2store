# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-134522-13986fe`
**Session file**: [`./20260518-134522-13986fe.md`](../20260518-134522-13986fe.md)
**Commit**: `13986fe` — fix(web2/supplier-debt): bút toán PAY/2026/---- → derive stable suffix từ id/ts
**Last updated**: 2026-05-18 13:45:22 +07
**Summary**: fix(web2/supplier-debt): bút toán PAY/2026/---- → derive stable suffix từ id/ts

## Files changed in this commit (`web2/`)

- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-app.js`

## Last 5 commits touching `web2/`

- `13986fe1` fix(web2/supplier-debt): bút toán PAY/2026/---- → derive stable suffix từ id/ts _(2026-05-18)_
- `ad05cc17` fix(web2/supplier-debt): bút toán unique + chống spam click thanh toán _(2026-05-18)_
- `f129cc2c` feat(web2/supplier-debt): ghi chú NCC + nút thanh toán per row _(2026-05-18)_
- `ac0034c2` feat(web2/supplier-debt): Mã NCC + sort natural A1-A10-B1 + nút Tạo NCC _(2026-05-18)_
- `b555189e` feat(web2/supplier-debt): mặc định filter = đầu → cuối tháng hiện tại _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-134522-13986fe` cho Claude walk chain theo CLAUDE.md protocol.
