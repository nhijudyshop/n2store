# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-173435-0cb8e8d`
**Session file**: [`./20260518-173435-0cb8e8d.md`](../20260518-173435-0cb8e8d.md)
**Commit**: `0cb8e8d` — feat(so-order): table grid lines + zebra + hover (style giống native-orders)
**Last updated**: 2026-05-18 17:34:35 +07
**Summary**: feat(so-order): table grid lines + zebra + hover (style giống native-orders)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `0cb8e8da` feat(so-order): table grid lines + zebra + hover (style giống native-orders) _(2026-05-18)_
- `4d543e83` chore(session): RESUME:20260518-172713-c6f1321 _(2026-05-18)_
- `c6f1321f` feat(web2-products+so-order): full 2-way sync delete/edit qty ⇄ pending*qty *(2026-05-18)\_
- `089998db` chore(session): RESUME:20260518-170829-40df3b7 _(2026-05-18)_
- `40df3b7b` fix(web2-products+so-order): show CHỜ HÀNG status + VND price ×1000 shorthand _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-173435-0cb8e8d` cho Claude walk chain theo CLAUDE.md protocol.
