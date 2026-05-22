# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-183556-0c75e48`
**Session file**: [`./20260522-183556-0c75e48.md`](../20260522-183556-0c75e48.md)
**Commit**: `0c75e48` — docs(dev-log): note 2 fix drag SP — fb context resolution + self-heal
**Last updated**: 2026-05-22 18:35:56 +07
**Summary**: docs(dev-log): note 2 fix drag SP — fb context resolution + self-heal

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `0c75e48b4` docs(dev-log): note 2 fix drag SP — fb context resolution + self-heal _(2026-05-22)_
- `3d1b8761e` chore(session): RESUME:20260522-181836-6b05bc3 _(2026-05-22)_
- `6b05bc3cb` fix(tpos-pancake): đơn drag SP mất fbPageId/fbPostId không mở chat được _(2026-05-22)_
- `d02fab5c7` chore(session): RESUME:20260522-165825-ea15fb9 _(2026-05-22)_
- `fb29a4789` chore(session): RESUME:20260522-164951-ea3553c _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-183556-0c75e48` cho Claude walk chain theo CLAUDE.md protocol.
