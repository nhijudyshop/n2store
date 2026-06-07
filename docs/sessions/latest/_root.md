# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-124106-b3d2734`
**Session file**: [`./20260607-124106-b3d2734.md`](../20260607-124106-b3d2734.md)
**Commit**: `b3d2734` — auto: session update
**Last updated**: 2026-06-07 12:41:06 +07
**Summary**: auto: session update

## Files changed in this commit (`_root/`)

- `CLAUDE.md`

## Last 5 commits touching `_root/`

- `1d998cfcf` fix(so-order,purchase-refund): mã SP draft đúng format KHO + ẩn dropdown rỗng + tách đơn trả hàng theo đợt _(2026-06-07)_
- `67c16589a` docs(dev-log): print count Phase 2 _(2026-06-05)_
- `1c5ce7954` fix(inventory-tracking): revert pool web2Db -> chatDb (Web 1.0, khoi phuc data) _(2026-06-04)_
- `87018611e` docs(web2): overview thêm section #conventions (quy ước Web 2.0 canonical cho code mới) + CLAUDE.md pointer _(2026-06-03)_
- `d882ce45f` docs(web2): rule #8 — UI-first cho mọi mutation handler (BẮT BUỘC) _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-124106-b3d2734` cho Claude walk chain theo CLAUDE.md protocol.
