# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-103304-7f471ee`
**Session file**: [`./20260521-103304-7f471ee.md`](../20260521-103304-7f471ee.md)
**Commit**: `7f471ee` — docs(dev-log): ✅ verify prod Bunny→PG bytea rollback sau deploy 218e85db
**Last updated**: 2026-05-21 10:33:04 +07
**Summary**: docs(dev-log): ✅ verify prod Bunny→PG bytea rollback sau deploy 218e85db

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `7f471ee1` docs(dev-log): ✅ verify prod Bunny→PG bytea rollback sau deploy 218e85db _(2026-05-21)_
- `b63b2d17` chore(session): RESUME:20260521-102428-93b2302 _(2026-05-21)_
- `93b23029` docs(tpos-pancake): dev-log entry cho bỏ auto-scroll on new comment _(2026-05-21)_
- `1ddef8c2` chore(session): RESUME:20260521-102126-e1d0d4f _(2026-05-21)_
- `218e85db` refactor(purchase-orders): rollback Bunny → Postgres bytea cho upload mới + policy "Bunny chỉ AI KOL" _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-103304-7f471ee` cho Claude walk chain theo CLAUDE.md protocol.
