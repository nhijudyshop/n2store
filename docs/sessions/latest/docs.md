# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-094756-53df9c2`
**Session file**: [`./20260525-094756-53df9c2.md`](../20260525-094756-53df9c2.md)
**Commit**: `53df9c2` — fix(snap): fallback iframe direct khi FB SDK xfbml.ready stuck
**Last updated**: 2026-05-25 09:47:56 +07
**Summary**: fix(snap): fallback iframe direct khi FB SDK xfbml.ready stuck

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `53df9c235` fix(snap): fallback iframe direct khi FB SDK xfbml.ready stuck _(2026-05-25)_
- `084c1fe5e` chore(session): RESUME:20260525-093831-5798b95 _(2026-05-25)_
- `621caabb8` fix(snap): fit FB Live player popup cho video portrait 9:16 _(2026-05-25)_
- `0f7945cec` chore(session): RESUME:20260525-092820-1653cda _(2026-05-25)_
- `1653cda5c` fix(snap): /snapshots/by-comment-ids recompute livestream*url *(2026-05-25)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-094756-53df9c2` cho Claude walk chain theo CLAUDE.md protocol.
