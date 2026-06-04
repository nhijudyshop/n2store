# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-152132-1c5ce79`
**Session file**: [`./20260604-152132-1c5ce79.md`](../20260604-152132-1c5ce79.md)
**Commit**: `1c5ce79` — fix(inventory-tracking): revert pool web2Db -> chatDb (Web 1.0, khoi phuc data)
**Last updated**: 2026-06-04 15:21:32 +07
**Summary**: fix(inventory-tracking): revert pool web2Db -> chatDb (Web 1.0, khoi phuc data)

## Files changed in this commit (`_root/`)

- `CLAUDE.md`

## Last 5 commits touching `_root/`

- `1c5ce7954` fix(inventory-tracking): revert pool web2Db -> chatDb (Web 1.0, khoi phuc data) _(2026-06-04)_
- `87018611e` docs(web2): overview thêm section #conventions (quy ước Web 2.0 canonical cho code mới) + CLAUDE.md pointer _(2026-06-03)_
- `d882ce45f` docs(web2): rule #8 — UI-first cho mọi mutation handler (BẮT BUỘC) _(2026-06-01)_
- `3b539bf87` docs(web2): modal anti-lag playbook + CLAUDE rule #7 _(2026-05-30)_
- `17d2791a6` docs(api): document /api/v2/\* namespace is mixed Web 1.0 + Web 2.0 _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-152132-1c5ce79` cho Claude walk chain theo CLAUDE.md protocol.
