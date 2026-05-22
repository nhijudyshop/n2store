# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-164951-ea3553c`
**Session file**: [`./20260522-164951-ea3553c.md`](../20260522-164951-ea3553c.md)
**Commit**: `ea3553c` — fix(tpos-pancake/inv): cart gắn theo CUSTOMER (fbUserId), không phải comment_id
**Last updated**: 2026-05-22 16:49:51 +07
**Summary**: fix(tpos-pancake/inv): cart gắn theo CUSTOMER (fbUserId), không phải comment_id

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `5afc48ef3` fix(balance-history): dual-write balance*history → web2_balance_history cho Live Mode + migration 082 self-heal *(2026-05-22)\_
- `9da5cffaf` chore(session): RESUME:20260522-163544-2d48920 _(2026-05-22)_
- `d99043faf` chore(session): RESUME:20260522-162453-7305577 _(2026-05-22)_
- `d8f12c817` chore(session): RESUME:20260522-161237-d0abb32 _(2026-05-22)_
- `fbc691b27` chore(session): RESUME:20260522-160745-781e50f _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-164951-ea3553c` cho Claude walk chain theo CLAUDE.md protocol.
