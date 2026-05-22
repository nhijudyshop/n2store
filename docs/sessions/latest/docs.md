# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-181836-6b05bc3`
**Session file**: [`./20260522-181836-6b05bc3.md`](../20260522-181836-6b05bc3.md)
**Commit**: `6b05bc3` — fix(tpos-pancake): đơn drag SP mất fbPageId/fbPostId không mở chat được
**Last updated**: 2026-05-22 18:18:36 +07
**Summary**: fix(tpos-pancake): đơn drag SP mất fbPageId/fbPostId không mở chat được

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6b05bc3cb` fix(tpos-pancake): đơn drag SP mất fbPageId/fbPostId không mở chat được _(2026-05-22)_
- `d02fab5c7` chore(session): RESUME:20260522-165825-ea15fb9 _(2026-05-22)_
- `fb29a4789` chore(session): RESUME:20260522-164951-ea3553c _(2026-05-22)_
- `5afc48ef3` fix(balance-history): dual-write balance*history → web2_balance_history cho Live Mode + migration 082 self-heal *(2026-05-22)\_
- `9da5cffaf` chore(session): RESUME:20260522-163544-2d48920 _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-181836-6b05bc3` cho Claude walk chain theo CLAUDE.md protocol.
