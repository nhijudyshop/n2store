# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-160755-4ed5ff3`
**Session file**: [`./20260603-160755-4ed5ff3.md`](../20260603-160755-4ed5ff3.md)
**Commit**: `4ed5ff3` — auto: session update
**Last updated**: 2026-06-03 16:07:55 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/web2/DB-SEPARATION-PLAN.md`

## Last 5 commits touching `docs/`

- `1cc1230d4` docs(web2): kế hoạch tách DB Web 2.0 hoàn toàn khỏi Web 1.0 (n2store-web2-db) _(2026-06-03)_
- `14f6ce75c` chore(session): RESUME:20260603-152443-3f2264a _(2026-06-03)_
- `3f2264afb` refactor(balance-history): bỏ coupling Web 1.0 — dùng web2-content-parser cho extraction*preview thay legacy extractPhoneFromContent *(2026-06-03)\_
- `d237a55c3` chore(session): RESUME:20260603-152019-2e63190 _(2026-06-03)_
- `2e631900c` feat(balance-history): audit log cho prelink*credit + script rà soát rủi ro gán nhầm KH (clone Web 1.0) *(2026-06-03)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-160755-4ed5ff3` cho Claude walk chain theo CLAUDE.md protocol.
