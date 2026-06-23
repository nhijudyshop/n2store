# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-025220-38335c0`
**Session file**: [`./20260624-025220-38335c0.md`](../20260624-025220-38335c0.md)
**Commit**: `38335c0` — fix(web2): merge-to-pbh also dedups order_lines by code (same #5 bug as fast-sale-orders/merge)
**Last updated**: 2026-06-24 02:52:20 +07
**Summary**: fix(web2): merge-to-pbh also dedups order_lines by code (same #5 bug as fast-sale-orders/merge)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2ecbdb807` fix(web2): 5 money/stock conservation bugs from adversarial workflow audit _(2026-06-24)_
- `88323c961` chore(session): RESUME:20260624-022425-c23fbe7 _(2026-06-24)_
- `c23fbe7ee` docs(web2): deep-audit round 2 — Ví NCC + auth-gate + KPI privacy verified (code-level), 0 bug + 1 design-note _(2026-06-24)_
- `325ca509f` chore(session): RESUME:20260624-021229-a9ea99a _(2026-06-24)_
- `a9ea99a02` docs(web2): refine RLQ flag — verified narrow (per-line cap vs total-sold, not remaining), fix needs in-tx refactor _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-025220-38335c0` cho Claude walk chain theo CLAUDE.md protocol.
