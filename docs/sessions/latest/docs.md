# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-102126-e1d0d4f`
**Session file**: [`./20260521-102126-e1d0d4f.md`](../20260521-102126-e1d0d4f.md)
**Commit**: `e1d0d4f` — auto: session update
**Last updated**: 2026-05-21 10:21:26 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `218e85db` refactor(purchase-orders): rollback Bunny → Postgres bytea cho upload mới + policy "Bunny chỉ AI KOL" _(2026-05-21)_
- `1ce0cd4c` chore(session): RESUME:20260521-101540-4da5b6b _(2026-05-21)_
- `4da5b6b7` docs(tpos-pancake): dev-log entry cho savePartnerData fix _(2026-05-21)_
- `1995766b` chore(session): RESUME:20260521-101115-3edbf7a _(2026-05-21)_
- `53b4ac10` chore(session): RESUME:20260521-101024-937c317 _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-102126-e1d0d4f` cho Claude walk chain theo CLAUDE.md protocol.
