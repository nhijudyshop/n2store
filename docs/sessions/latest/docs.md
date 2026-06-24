# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-140224-4f1cabf`
**Session file**: [`./20260624-140224-4f1cabf.md`](../20260624-140224-4f1cabf.md)
**Commit**: `4f1cabf` — auto: session update
**Last updated**: 2026-06-24 14:02:24 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `4f1cabfbb` auto: session update _(2026-06-24)_
- `16f698797` fix(attendance-sync): sửa lỗi không cài được + gom 1 folder + 1 nút cài/gỡ tự kiểm tra _(2026-06-24)_
- `b21054a16` chore(session): RESUME:20260624-133010-66c749a _(2026-06-24)_
- `66c749a42` fix(web2/avatar): consistent default DiceBear avatar everywhere (footer + table + preview) _(2026-06-24)_
- `d73825e4d` chore(session): RESUME:20260624-131638-c61fecd _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-140224-4f1cabf` cho Claude walk chain theo CLAUDE.md protocol.
