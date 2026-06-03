# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-152443-3f2264a`
**Session file**: [`./20260603-152443-3f2264a.md`](../20260603-152443-3f2264a.md)
**Commit**: `3f2264a` — refactor(balance-history): bỏ coupling Web 1.0 — dùng web2-content-parser cho extraction_preview thay legacy extractPhoneFromContent
**Last updated**: 2026-06-03 15:24:43 +07
**Summary**: refactor(balance-history): bỏ coupling Web 1.0 — dùng web2-content-parser cho extraction_preview thay legacy ext...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `3f2264afb` refactor(balance-history): bỏ coupling Web 1.0 — dùng web2-content-parser cho extraction*preview thay legacy extractPhoneFromContent *(2026-06-03)\_
- `d237a55c3` chore(session): RESUME:20260603-152019-2e63190 _(2026-06-03)_
- `2e631900c` feat(balance-history): audit log cho prelink*credit + script rà soát rủi ro gán nhầm KH (clone Web 1.0) *(2026-06-03)\_
- `8f31bec68` chore(session): RESUME:20260603-151339-7ac1a69 _(2026-06-03)_
- `7ac1a6994` fix(balance-history): search 500 — cast sepay*id::text ILIKE (clone Web 1.0 type mismatch) *(2026-06-03)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-152443-3f2264a` cho Claude walk chain theo CLAUDE.md protocol.
