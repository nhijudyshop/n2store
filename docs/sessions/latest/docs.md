# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-150713-9efdd11`
**Session file**: [`./20260622-150713-9efdd11.md`](../20260622-150713-9efdd11.md)
**Commit**: `9efdd11` — feat(web2-zalo) bỏ giới hạn allowlist nhóm — mặc định hiện TẤT CẢ nhóm + 1-1 (opt-in env WEB2_ZALO_GROUP_ALLOWLIST)
**Last updated**: 2026-06-22 15:07:13 +07
**Summary**: feat(web2-zalo) bỏ giới hạn allowlist nhóm — mặc định hiện TẤT CẢ nhóm + 1-1 (opt-in env WEB2_ZA...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `9efdd11e1` feat(web2-zalo) bỏ giới hạn allowlist nhóm — mặc định hiện TẤT CẢ nhóm + 1-1 (opt-in env WEB2*ZALO_GROUP_ALLOWLIST) *(2026-06-22)\_
- `9f1c7da1b` chore(session): RESUME:20260622-145932-5b98255 _(2026-06-22)_
- `5b982559c` auto: session update _(2026-06-22)_
- `5adda4014` refactor(web2) unify buttons to canonical across 23 pages (audit-driven) _(2026-06-22)_
- `4db4d684c` chore(session): RESUME:20260622-143446-f2a0f40 _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-150713-9efdd11` cho Claude walk chain theo CLAUDE.md protocol.
