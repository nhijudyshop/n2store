# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-022425-c23fbe7`
**Session file**: [`./20260624-022425-c23fbe7.md`](../20260624-022425-c23fbe7.md)
**Commit**: `c23fbe7` — docs(web2): deep-audit round 2 — Ví NCC + auth-gate + KPI privacy verified (code-level), 0 bug + 1 design-note
**Last updated**: 2026-06-24 02:24:25 +07
**Summary**: docs(web2): deep-audit round 2 — Ví NCC + auth-gate + KPI privacy verified (code-level), 0 bug + 1 design-note

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `c23fbe7ee` docs(web2): deep-audit round 2 — Ví NCC + auth-gate + KPI privacy verified (code-level), 0 bug + 1 design-note _(2026-06-24)_
- `325ca509f` chore(session): RESUME:20260624-021229-a9ea99a _(2026-06-24)_
- `a9ea99a02` docs(web2): refine RLQ flag — verified narrow (per-line cap vs total-sold, not remaining), fix needs in-tx refactor _(2026-06-24)_
- `0dda0c9b8` docs(web2): split-PBH cancel fix verified live (deploy 66a2f707d) + test-PBH collision cleanup note _(2026-06-24)_
- `66a2f707d` fix(web2): split-PBH cancel restocks ALL splits + 5 frontend silent-failure surfaces _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-022425-c23fbe7` cho Claude walk chain theo CLAUDE.md protocol.
